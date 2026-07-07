(() => {
  'use strict';

  if (globalThis.CaptionPromptVideoInfo) return;

  function collectVideoInfo(track = {}) {
    if (location.hostname.includes('youtube.com')) return collectYouTubeVideoInfo(track);
    if (location.hostname.includes('bilibili.com')) return collectBilibiliVideoInfo(track);
    return compactVideoInfo({
      title: track.title || document.title,
      url: canonicalUrl() || location.href,
      description: metaContent('description')
    });
  }

  function collectYouTubeVideoInfo(track = {}) {
    const structured = structuredVideoData();
    const videoId = track.videoId ||
      new URLSearchParams(location.search).get('v') ||
      '';
    return compactVideoInfo({
      title:
        structured.title ||
        structured.name ||
        textFromSelectors([
          'ytd-watch-metadata h1 yt-formatted-string',
          'h1.title yt-formatted-string',
          'h1'
        ]) ||
        metaContent('title') ||
        document.title.replace(/\s*-\s*YouTube\s*$/i, ''),
      author:
        structured.author ||
        textFromSelectors([
          'ytd-watch-metadata ytd-channel-name #text a',
          '#owner ytd-channel-name a',
          '#upload-info #channel-name a',
          'ytd-video-owner-renderer ytd-channel-name a'
        ]),
      url:
        canonicalUrl() ||
        structured.url ||
        (videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : location.href),
      description:
        structured.description ||
        textFromSelectors([
          'ytd-watch-metadata #description-inline-expander',
          'ytd-watch-metadata ytd-text-inline-expander',
          '#description-inline-expander',
          '#description'
        ]) ||
        metaContent('description')
    });
  }

  function collectBilibiliVideoInfo(track = {}) {
    const bvid = track.videoId ||
      location.pathname.match(/\/video\/(BV[\w]+)/i)?.[1] ||
      new URLSearchParams(location.search).get('bvid') ||
      '';
    return compactVideoInfo({
      title:
        track.title ||
        textFromSelectors([
          '.video-title',
          'h1.video-title',
          '.video-info-title',
          'h1'
        ]) ||
        document.title.replace(/\s*-\s*bilibili.*$/i, ''),
      author:
        track.author ||
        textFromSelectors([
          '.up-name',
          '.username',
          '.up-info-container .name',
          'a[href*="//space.bilibili.com"]'
        ]),
      url: canonicalUrl() || (bvid ? `https://www.bilibili.com/video/${bvid}` : location.href),
      description:
        track.description ||
        textFromSelectors([
          '.video-desc-container .desc-info-text',
          '.video-desc-container',
          '.desc-info-text',
          '.video-info-detail .desc'
        ]) ||
        metaContent('description')
    });
  }

  function structuredVideoData() {
    const data = {};
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      if (data.title || data.name) return;
      try {
        const parsed = JSON.parse(script.textContent || '{}');
        const items = Array.isArray(parsed) ? parsed : [parsed];
        const video = items.find(item =>
          String(item?.['@type'] || '').toLowerCase().includes('video')
        );
        if (!video) return;
        data.title = cleanInfoText(video.name);
        data.name = cleanInfoText(video.name);
        data.url = cleanInfoText(video.url || video.embedUrl);
        data.description = cleanDescription(video.description);
        const author = Array.isArray(video.author) ? video.author[0] : video.author;
        data.author = cleanInfoText(author?.name || author);
      } catch {}
    });
    return data;
  }

  function textFromSelectors(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const text = cleanDescription(element?.innerText || element?.textContent || '');
      if (text) return text;
    }
    return '';
  }

  function canonicalUrl() {
    return cleanInfoText(
      document.querySelector('link[rel="canonical"]')?.href ||
      document.querySelector('meta[property="og:url"]')?.content ||
      ''
    );
  }

  function metaContent(name) {
    return cleanDescription(
      document.querySelector(`meta[name="${name}"]`)?.content ||
      document.querySelector(`meta[property="og:${name}"]`)?.content ||
      document.querySelector(`meta[itemprop="${name}"]`)?.content ||
      ''
    );
  }

  function compactVideoInfo(info) {
    return Object.fromEntries(
      Object.entries(info)
        .map(([key, value]) => [
          key,
          key === 'description' ? cleanDescription(value) : cleanInfoText(value)
        ])
        .filter(([, value]) => value)
    );
  }

  function cleanInfoText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/\bShow less\b|\bShow more\b/gi, '')
      .replace(/展开全部|收起|更多/g, '')
      .trim();
  }

  function cleanDescription(value) {
    return String(value || '')
      .replace(/\r/g, '')
      .split('\n')
      .map(line => cleanInfoText(line))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  globalThis.CaptionPromptVideoInfo = {
    cleanDescription,
    cleanInfoText,
    collectVideoInfo,
    compactVideoInfo
  };
})();
