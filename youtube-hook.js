(() => {
  'use strict';

  if (window.__captionPromptYouTubeHook) return;
  window.__captionPromptYouTubeHook = true;

  const SOURCE = 'caption-prompt-youtube-hook';
  const seenTracks = new Set();

  function emit(type, payload) {
    window.postMessage({ source: SOURCE, type, payload }, '*');
  }

  function normalizeUrl(input) {
    try {
      if (typeof input === 'string') return new URL(input, location.href).href;
      if (input && typeof input.url === 'string') {
        return new URL(input.url, location.href).href;
      }
    } catch {}
    return '';
  }

  function isTimedText(url) {
    return url.includes('/api/timedtext') || url.includes('timedtext?');
  }

  function emitTrackUrl(url, label = '') {
    if (!url || seenTracks.has(url)) return;
    seenTracks.add(url);
    emit('track-url', { url, label });
  }

  function scanCaptionTracks(value, depth = 0, visited = new WeakSet()) {
    if (!value || depth > 8 || typeof value !== 'object') return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      value.forEach(item => scanCaptionTracks(item, depth + 1, visited));
      return;
    }

    const tracks = value.captionTracks;
    if (Array.isArray(tracks)) {
      tracks.forEach(track => {
        emitTrackUrl(
          track?.baseUrl,
          track?.name?.simpleText || track?.name?.runs?.[0]?.text || ''
        );
      });
    }

    Object.values(value).forEach(child => {
      scanCaptionTracks(child, depth + 1, visited);
    });
  }

  async function inspectResponse(url, response) {
    if (isTimedText(url)) {
      try {
        const text = await response.clone().text();
        emit('subtitle-response', { url, text });
      } catch {}
      return;
    }

    if (url.includes('/youtubei/v1/player') || url.includes('/youtubei/v1/next')) {
      try {
        const data = await response.clone().json();
        scanCaptionTracks(data);
      } catch {}
    }
  }

  const nativeFetch = window.fetch;
  window.fetch = new Proxy(nativeFetch, {
    apply(target, thisArg, args) {
      const url = normalizeUrl(args[0]);
      const result = Reflect.apply(target, thisArg, args);
      Promise.resolve(result)
        .then(response => inspectResponse(url, response))
        .catch(() => {});
      return result;
    }
  });

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__captionPromptUrl = normalizeUrl(url);
    return nativeOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    const url = this.__captionPromptUrl || '';
    if (isTimedText(url) || url.includes('/youtubei/v1/')) {
      this.addEventListener('load', () => {
        if (this.status < 200 || this.status >= 300) return;
        if (isTimedText(url)) {
          let text = '';
          try {
            text = typeof this.responseText === 'string' ? this.responseText : '';
          } catch {}
          if (text) emit('subtitle-response', { url, text });
          return;
        }
        try {
          scanCaptionTracks(JSON.parse(this.responseText));
        } catch {}
      }, { once: true });
    }
    return nativeSend.apply(this, args);
  };

  function scanPageState() {
    try {
      scanCaptionTracks(window.ytInitialPlayerResponse);
      scanCaptionTracks(window.ytInitialData);
    } catch {}
  }

  scanPageState();
  setTimeout(scanPageState, 1000);
  setTimeout(scanPageState, 3000);
  window.addEventListener('yt-navigate-finish', scanPageState);
})();
