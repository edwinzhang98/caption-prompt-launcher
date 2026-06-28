(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CaptionParsers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const ENTITIES = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"'
  };

  function decodeEntities(value) {
    return String(value || '').replace(
      /&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi,
      (match, entity) => {
        const lower = entity.toLowerCase();
        if (lower.startsWith('#x')) {
          return String.fromCodePoint(parseInt(lower.slice(2), 16));
        }
        if (lower.startsWith('#')) {
          return String.fromCodePoint(parseInt(lower.slice(1), 10));
        }
        return ENTITIES[lower] ?? match;
      }
    );
  }

  function cleanText(value) {
    return decodeEntities(String(value || '').replace(/<[^>]+>/g, ''))
      .replace(/\s+/g, ' ')
      .trim();
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours > 0
      ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function cuesToText(cues) {
    return cues
      .filter(cue => cue.text)
      .map(cue => `[${formatTime(cue.startMs)}] ${cue.text}`)
      .join('\n');
  }

  function parseTimecode(value) {
    const normalized = value.trim().replace(',', '.');
    const parts = normalized.split(':').map(Number);
    if (parts.some(Number.isNaN)) return 0;
    let seconds = 0;
    for (const part of parts) seconds = seconds * 60 + part;
    return Math.round(seconds * 1000);
  }

  function parseVttOrSrt(text) {
    const blocks = String(text).replace(/\r/g, '').split(/\n{2,}/);
    const cues = [];
    for (const block of blocks) {
      const lines = block.split('\n').filter(Boolean);
      const timingIndex = lines.findIndex(line => line.includes('-->'));
      if (timingIndex < 0) continue;
      const [start, end] = lines[timingIndex]
        .split('-->')
        .map(part => part.trim().split(' ')[0]);
      const content = cleanText(lines.slice(timingIndex + 1).join(' '));
      if (!content) continue;
      cues.push({
        startMs: parseTimecode(start),
        endMs: parseTimecode(end),
        text: content
      });
    }
    return cues;
  }

  function parseYouTubeJson(data) {
    if (!Array.isArray(data?.events)) return [];
    return data.events.flatMap(event => {
      const content = cleanText(
        (event.segs || []).map(segment => segment.utf8 || '').join('')
      );
      if (!content) return [];
      return [{
        startMs: Number(event.tStartMs) || 0,
        endMs: (Number(event.tStartMs) || 0) + (Number(event.dDurationMs) || 0),
        text: content
      }];
    });
  }

  function parseYouTubeXml(text) {
    const cues = [];
    const nodePattern = /<(text|p)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = nodePattern.exec(text))) {
      const attributes = match[2];
      const getAttribute = name => {
        const attribute = attributes.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
        return attribute?.[1];
      };
      const usesMilliseconds = getAttribute('t') !== undefined;
      const start = Number(getAttribute(usesMilliseconds ? 't' : 'start') || 0);
      const duration = Number(getAttribute(usesMilliseconds ? 'd' : 'dur') || 0);
      const startMs = usesMilliseconds ? start : start * 1000;
      const content = cleanText(match[3]);
      if (!content) continue;
      cues.push({
        startMs,
        endMs: startMs + (usesMilliseconds ? duration : duration * 1000),
        text: content
      });
    }
    return cues;
  }

  function parseYouTube(text) {
    try {
      const cues = parseYouTubeJson(JSON.parse(text));
      if (cues.length) return cues;
    } catch {}
    return parseYouTubeXml(String(text));
  }

  return {
    cleanText,
    cuesToText,
    formatTime,
    parseTimecode,
    parseVttOrSrt,
    parseYouTube
  };
});
