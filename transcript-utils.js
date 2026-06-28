(() => {
  'use strict';

  const DOWNLOAD_FORMATS = ['txt', 'md', 'srt', 'vtt', 'json'];

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
    const baseName = safeFilename([
      track?.pageTitle || options.title || 'captions',
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
    if (format === 'srt') return cuesToSrt(cues);
    if (format === 'vtt') return `WEBVTT\n\n${cuesToVtt(cues)}`;
    if (format === 'json') {
      return JSON.stringify({
        title: track?.pageTitle || options.title || '',
        source: track?.source || '',
        language: track?.language || '',
        label: track?.label || '',
        videoId: track?.videoId || '',
        pageUrl: track?.pageUrl || options.pageUrl || '',
        cues
      }, null, 2);
    }
    const transcript = plainParagraphText(track, options.cache);
    if (format === 'md') {
      return [
        `# ${track?.pageTitle || options.title || 'Captions'}`,
        '',
        `- Source: ${track?.source || 'unknown'}`,
        `- Language: ${track?.label || track?.language || 'unknown'}`,
        `- URL: ${track?.pageUrl || options.pageUrl || ''}`,
        '',
        '## Transcript',
        '',
        transcript
      ].join('\n');
    }
    return transcript;
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

  globalThis.CaptionPromptTranscript = {
    DOWNLOAD_FORMATS,
    captionRows,
    createDownloadPayload,
    formatDisplayTime,
    plainParagraphText,
    removeTimestamps,
    trackCues,
    transcriptFor
  };
})();
