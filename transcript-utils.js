(() => {
  'use strict';

  const DOWNLOAD_FORMATS = ['txt', 'md', 'srt', 'vtt', 'json'];
  const DESCRIPTION_LIMIT = 12_000;

  function trackCues(track) {
    if (Array.isArray(track?.cues) && track.cues.length) return track.cues;
    return String(track?.text || '').split('\n').filter(Boolean).map(line => {
      const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
      return {
        startMs: match ? parseDisplayTime(match[1]) : 0,
        endMs: 0,
        text: match ? match[2] : line
      };
    });
  }

  function captionRows(cues, fallbackText) {
    if (cues.length) {
      return cues.map(cue => ({
        startMs: cue.startMs,
        time: formatDisplayTime(cue.startMs),
        text: cue.text
      }));
    }
    return String(fallbackText || '').split('\n').filter(Boolean).map(line => {
      const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
      return {
        startMs: match ? parseDisplayTime(match[1]) : 0,
        time: match?.[1] || '',
        text: match?.[2] || line
      };
    });
  }

  function paragraphRows(cues, fallbackText, language = '') {
    const source = cues.length
      ? cues
      : String(fallbackText || '').split('\n').map((text, index) => ({
          startMs: index,
          endMs: 0,
          text: text.trim()
        })).filter(cue => cue.text);
    const paragraphs = [];
    let sentences = [];
    let length = 0;

    source.forEach((cue, index) => {
      const text = punctuateCue(cue.text, index, source, language);
      sentences.push({ startMs: cue.startMs, text });
      length += text.length;
      const sentenceEnded = /[。！？!?；;.!]["'”’）)]?$/.test(text);
      if ((sentenceEnded && length >= 120) || length >= 320) {
        paragraphs.push({ sentences });
        sentences = [];
        length = 0;
      }
    });
    if (sentences.length) paragraphs.push({ sentences });
    return paragraphs;
  }

  function punctuateCue(text, index, cues, language) {
    const value = String(text || '').trim();
    if (!value || /[，。！？、；：,.!?;:]["'”’）)]?$/.test(value)) return value;
    const isCjk = /^(zh|ja|ko)/i.test(language) || /[\u3400-\u9fff]/.test(value);
    const isLast = index === cues.length - 1;
    const next = cues[index + 1];
    const gap = next ? Math.max(0, Number(next.startMs) - Number(cues[index].endMs)) : 0;
    const sentenceBreak = isLast || gap >= 900 || (index + 1) % 5 === 0;
    if (isCjk) return `${value}${sentenceBreak ? '。' : '，'}`;
    return `${value}${sentenceBreak ? '.' : ','} `;
  }

  function transcriptFor(track, cache) {
    const cacheable = track && (typeof track === 'object' || typeof track === 'function');
    const cached = cacheable ? cache?.get(track) : undefined;
    if (cached) return cached;
    const paragraphs = paragraphRows(
      trackCues(track),
      track?.plainText || removeTimestamps(track?.text),
      track?.language
    );
    const transcript = {
      paragraphs,
      text: paragraphs
        .map(paragraph => paragraph.sentences.map(sentence => sentence.text).join(''))
        .join('\n\n')
    };
    if (cacheable) cache?.set(track, transcript);
    return transcript;
  }

  function plainParagraphText(track, cache) {
    return transcriptFor(track, cache).text;
  }

  function videoInfoFor(track, options = {}) {
    const trackInfo = track?.videoInfo || {};
    const optionInfo = options.videoInfo || {};
    const info = {
      ...trackInfo,
      ...optionInfo
    };
    return {
      title: cleanInfoValue(info.title || track?.title || track?.pageTitle || options.title),
      author: cleanInfoValue(info.author || track?.author || options.author),
      url: cleanInfoValue(info.url || track?.pageUrl || options.pageUrl),
      description: cleanDescription(info.description || track?.description || options.description)
    };
  }

  function formatVideoInfoText(track, options = {}) {
    const info = videoInfoFor(track, options);
    const lines = [];
    if (info.title) lines.push(`Title: ${info.title}`);
    if (info.author) lines.push(`Author: ${info.author}`);
    if (info.url) lines.push(`URL: ${info.url}`);
    if (info.description) {
      lines.push('Description:');
      lines.push(info.description);
    }
    return lines.length ? ['Video Info:', ...lines].join('\n') : '';
  }

  function transcriptPackageText(track, options = {}) {
    return textPackageWithVideoInfo(
      track,
      plainParagraphText(track, options.cache),
      {
        ...options,
        bodyLabel: options.bodyLabel || 'Transcript'
      }
    );
  }

  function textPackageWithVideoInfo(track, bodyText, options = {}) {
    const transcript = String(bodyText || '').trim();
    const info = formatVideoInfoText(track, options);
    const bodyLabel = options.bodyLabel || 'Transcript';
    const body = transcript ? `${bodyLabel}:\n${transcript}` : '';
    return [info, body].filter(Boolean).join('\n\n');
  }

  function removeTimestamps(text) {
    return String(text || '').replace(/^\[[^\]]+\]\s*/gm, '');
  }

  function parseDisplayTime(value) {
    const parts = String(value).split(':').map(Number);
    if (parts.some(Number.isNaN)) return 0;
    let seconds = 0;
    parts.forEach(part => {
      seconds = seconds * 60 + part;
    });
    return seconds * 1000;
  }

  function formatDisplayTime(ms) {
    const total = Math.max(0, Math.floor(Number(ms) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours
      ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function createDownloadPayload(track, format, options = {}) {
    const safeFormat = DOWNLOAD_FORMATS.includes(format) ? format : 'txt';
    const info = videoInfoFor(track, options);
    const baseName = safeFilename([
      info.title || track?.pageTitle || options.title || 'captions',
      track?.language || track?.label || ''
    ].filter(Boolean).join(' - '));
    return {
      filename: `Caption Prompt Launcher/${baseName}.${safeFormat === 'md' ? 'md' : safeFormat}`,
      content: formatDownloadContent(track, safeFormat, options),
      mimeType: mimeTypeFor(safeFormat)
    };
  }

  function formatDownloadContent(track, format, options = {}) {
    const cues = trackCues(track);
    if (format === 'srt') return `${metadataNote(track, options)}${cuesToSrt(cues)}`;
    if (format === 'vtt') return `WEBVTT\n\n${metadataNote(track, options)}${cuesToVtt(cues)}`;
    if (format === 'json') {
      const info = videoInfoFor(track, options);
      return JSON.stringify({
        videoInfo: info,
        title: info.title,
        source: track?.source || '',
        language: track?.language || '',
        label: track?.label || '',
        videoId: track?.videoId || '',
        pageUrl: track?.pageUrl || options.pageUrl || '',
        cues
      }, null, 2);
    }
    if (format === 'md') {
      const info = videoInfoFor(track, options);
      return [
        `# ${info.title || track?.pageTitle || options.title || 'Captions'}`,
        '',
        '## Video Info',
        '',
        `- Title: ${info.title || ''}`,
        `- Author: ${info.author || ''}`,
        `- URL: ${info.url || ''}`,
        `- Source: ${track?.source || 'unknown'}`,
        `- Language: ${track?.label || track?.language || 'unknown'}`,
        '',
        '### Description',
        '',
        info.description || '',
        '',
        '## Transcript',
        '',
        plainParagraphText(track, options.cache)
      ].join('\n');
    }
    return transcriptPackageText(track, options);
  }

  function metadataNote(track, options = {}) {
    const info = formatVideoInfoText(track, options);
    return info ? `NOTE\n${info}\n\n` : '';
  }

  function cuesToSrt(cues) {
    return cues.map((cue, index) => [
      String(index + 1),
      `${formatSubtitleTime(cue.startMs, ',')} --> ${formatSubtitleTime(cue.endMs || nextCueStart(cues, index), ',')}`,
      cue.text,
      ''
    ].join('\n')).join('\n');
  }

  function cuesToVtt(cues) {
    return cues.map((cue, index) => [
      `${formatSubtitleTime(cue.startMs, '.')} --> ${formatSubtitleTime(cue.endMs || nextCueStart(cues, index), '.')}`,
      cue.text,
      ''
    ].join('\n')).join('\n');
  }

  function nextCueStart(cues, index) {
    const startMs = Number(cues[index]?.startMs) || 0;
    const nextStartMs = Number(cues[index + 1]?.startMs) || 0;
    return nextStartMs > startMs ? nextStartMs : startMs + 2000;
  }

  function formatSubtitleTime(ms, separator) {
    const totalMs = Math.max(0, Math.round(Number(ms) || 0));
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const millis = totalMs % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${separator}${String(millis).padStart(3, '0')}`;
  }

  function mimeTypeFor(format) {
    if (format === 'md') return 'text/markdown;charset=utf-8';
    if (format === 'srt') return 'application/x-subrip;charset=utf-8';
    if (format === 'vtt') return 'text/vtt;charset=utf-8';
    if (format === 'json') return 'application/json;charset=utf-8';
    return 'text/plain;charset=utf-8';
  }

  function safeFilename(value) {
    return String(value || 'captions')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140) || 'captions';
  }

  function cleanInfoValue(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanDescription(value) {
    return String(value || '')
      .replace(/\r/g, '')
      .split('\n')
      .map(line => cleanInfoValue(line))
      .filter(Boolean)
      .join('\n')
      .slice(0, DESCRIPTION_LIMIT)
      .trim();
  }

  globalThis.CaptionPromptTranscript = {
    DOWNLOAD_FORMATS,
    captionRows,
    createDownloadPayload,
    formatVideoInfoText,
    formatDisplayTime,
    plainParagraphText,
    removeTimestamps,
    trackCues,
    transcriptFor,
    transcriptPackageText,
    textPackageWithVideoInfo,
    videoInfoFor
  };
})();
