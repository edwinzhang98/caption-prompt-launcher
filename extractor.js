(() => {
  'use strict';

  if (window.__captionPromptExtractor) return;
  window.__captionPromptExtractor = true;

  const YOUTUBE_SOURCE = 'caption-prompt-youtube-hook';
  const processedUrls = new Set();
  const processedBilibiliPages = new Set();
  let extensionContextInvalid = false;
  const {
    cleanText,
    cuesToText,
    parseVttOrSrt,
    parseYouTube
  } = globalThis.CaptionParsers;
  const { isExtensionContextError } = globalThis.CaptionPromptShared;
  const {
    collectVideoInfo,
    compactVideoInfo
  } = globalThis.CaptionPromptVideoInfo;

  function handleExtensionError(error) {
    if (!isExtensionContextError(error)) return false;
    extensionContextInvalid = true;
    clearTimeout(scanTimer);
    return true;
  }

  async function sendRuntimeMessage(message) {
    if (extensionContextInvalid) return undefined;
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (handleExtensionError(error)) return undefined;
      throw error;
    }
  }

  function parseYouTubeMeta(url, fallbackLabel = '') {
    try {
      const parsed = new URL(url);
      const lang = parsed.searchParams.get('tlang') ||
        parsed.searchParams.get('lang') ||
        'unknown';
      // videoId 只信字幕 URL 自身携带的 v，不回退到 location.href——
      // 否则旧视频的字幕文本会被贴上当前（新）视频的 id，骗过所有 videoId 校验。
      const videoId = parsed.searchParams.get('v') ||
        location.pathname.match(/\/embed\/([^/?]+)/)?.[1] ||
        '';
      const variant = parsed.searchParams.get('kind') || 'standard';
      return {
        lang,
        videoId,
        variant,
        label: fallbackLabel || `${lang}${parsed.searchParams.get('tlang') ? ' (translated)' : ''}`
      };
    } catch {
      return {
        lang: 'unknown',
        videoId: '',
        variant: 'standard',
        label: fallbackLabel || 'YouTube subtitles'
      };
    }
  }

  async function publishTrack(track) {
    const cues = Array.isArray(track?.cues) ? track.cues.filter(cue => cue.text) : [];
    const text = track?.text || cuesToText(cues);
    const plainText = track?.plainText || cues.map(cue => cue.text).join('\n');
    if (!text.trim()) return;
    try {
      await sendRuntimeMessage({
        type: 'CAPTION_TRACK_FOUND',
        track: {
          ...track,
          text,
          plainText,
          pageUrl: location.href,
          pageTitle: document.title,
          videoInfo: collectVideoInfo(track),
          frameUrl: location.href,
          capturedAt: Date.now()
        }
      });
    } catch {}
  }

  async function fetchResource(url, responseType = 'text') {
    if (location.hostname.includes('bilibili.com')) {
      try {
        const response = await fetch(url, { credentials: 'include' });
        if (response.ok) {
          return responseType === 'json' ? response.json() : response.text();
        }
      } catch {}
    }
    const response = await sendRuntimeMessage({
      type: 'FETCH_CAPTION_RESOURCE',
      url,
      responseType
    });
    if (extensionContextInvalid) throw new Error('Extension context invalidated');
    if (!response?.ok) {
      throw new Error(response?.error || 'Caption request failed');
    }
    return response.data;
  }

  async function processYouTubeText(url, text, fallbackLabel = '') {
    const cues = parseYouTube(text);
    if (!cues.length) return;
    const meta = parseYouTubeMeta(url, fallbackLabel);
    // 无法确定字幕归属哪个视频时宁可丢弃，避免旧字幕被误当作当前视频入库。
    if (!meta.videoId) return;
    await publishTrack({
      id: `youtube:${meta.videoId}:${meta.lang}:${meta.variant}`,
      source: 'youtube',
      language: meta.lang,
      label: meta.label,
      videoId: meta.videoId,
      cues,
      text: cuesToText(cues)
    });
  }

  async function fetchYouTubeTrack(url, label = '') {
    if (!url || processedUrls.has(url)) return;
    processedUrls.add(url);
    try {
      const parsed = new URL(url);
      if (!parsed.searchParams.has('fmt')) parsed.searchParams.set('fmt', 'json3');
      const response = await fetch(parsed.href, { credentials: 'include' });
      if (!response.ok) return;
      await processYouTubeText(parsed.href, await response.text(), label);
    } catch {}
  }

  function startYouTubeMonitoring() {
    window.addEventListener('message', event => {
      if (event.source !== window || event.data?.source !== YOUTUBE_SOURCE) return;
      const { type, payload } = event.data;
      if (type === 'subtitle-response') {
        processedUrls.add(payload.url);
        processYouTubeText(payload.url, payload.text);
      } else if (type === 'track-url') {
        fetchYouTubeTrack(payload.url, payload.label);
      }
    });

    const scanResources = entries => {
      entries
        .map(entry => entry.name)
        .filter(url => url.includes('timedtext'))
        .forEach(url => fetchYouTubeTrack(url));
    };

    scanResources(performance.getEntriesByType('resource'));
    if (window.PerformanceObserver) {
      const observer = new PerformanceObserver(list => scanResources(list.getEntries()));
      observer.observe({ entryTypes: ['resource'] });
    }
  }

  async function extractBilibili() {
    if (!location.hostname.includes('bilibili.com')) return;
    try {
      const url = new URL(location.href);
      let bvid = url.searchParams.get('bvid');
      let aid = Number(url.searchParams.get('aid')) || 0;
      let cid = Number(url.searchParams.get('cid')) || 0;
      const match = url.pathname.match(/\/video\/(BV[\w]+)/i);
      if (!bvid && match) bvid = match[1];

      let title = document.title;
      let videoInfo = {};
      if ((!aid || !cid) && bvid) {
        const view = await fetchResource(
          `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
          'json'
        );
        if (view?.code !== 0) return;
        aid = view.data.aid;
        title = view.data.title || title;
        videoInfo = compactVideoInfo({
          title: view.data.title,
          author: view.data.owner?.name,
          url: bvid ? `https://www.bilibili.com/video/${bvid}` : location.href,
          description: view.data.desc
        });
        const page = Number(url.searchParams.get('p')) || 1;
        cid = view.data.pages?.find(item => item.page === page)?.cid || view.data.cid;
      }

      if (!aid || !cid) return;
      const pageKey = `${aid}:${cid}`;
      if (processedBilibiliPages.has(pageKey)) return;
      const player = await fetchResource(
        `https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`,
        'json'
      );
      const subtitles = player?.data?.subtitle?.subtitles || [];
      if (!subtitles.length) {
        sendRuntimeMessage({
          type: 'CAPTION_SCAN_STATUS',
          status: player?.data?.need_login_subtitle
            ? 'This video requires a Bilibili login for captions. Retrying...'
            : 'This video has not returned captions yet.'
        }).catch(() => {});
        return;
      }
      processedBilibiliPages.add(pageKey);

      for (const subtitle of subtitles) {
        if (!subtitle.subtitle_url) continue;
        const subtitleUrl = subtitle.subtitle_url.startsWith('//')
          ? `https:${subtitle.subtitle_url}`
          : subtitle.subtitle_url.replace(/^http:/, 'https:');
        const data = await fetchResource(subtitleUrl, 'json');
        const cues = (data.body || []).map(item => ({
          startMs: Math.round(Number(item.from) * 1000),
          endMs: Math.round(Number(item.to) * 1000),
          text: cleanText(item.content)
        })).filter(item => item.text);
        const language = String(subtitle.lan || 'unknown').replace(/^ai-/, '');
        await publishTrack({
          id: `bilibili:${bvid || aid}:${cid}:${language}`,
          source: 'bilibili',
          language,
          label: subtitle.lan_doc || language,
          videoId: bvid || String(aid),
          title,
          author: videoInfo.author,
          description: videoInfo.description,
          videoInfo,
          cues,
          text: cuesToText(cues)
        });
      }
    } catch {}
  }

  async function extractTrackElements() {
    const tracks = [...document.querySelectorAll('track[kind="subtitles"], track[kind="captions"]')];
    for (let index = 0; index < tracks.length; index += 1) {
      const track = tracks[index];
      const url = track.src;
      if (!url || processedUrls.has(url)) continue;
      processedUrls.add(url);
      try {
        const cues = parseVttOrSrt(await fetchResource(url, 'text'));
        await publishTrack({
          id: `html-track:${url}`,
          source: 'html-track',
          language: track.srclang || 'unknown',
          label: track.label || track.srclang || `Track ${index + 1}`,
          videoId: '',
          cues,
          text: cuesToText(cues)
        });
      } catch {}
    }
  }

  function scan() {
    if (location.hostname.includes('youtube.com')) startYouTubeMonitoringOnce();
    extractBilibili();
    extractTrackElements();
  }

  function currentPageIdentity() {
    try {
      const url = new URL(location.href);
      if (url.hostname.includes('youtube.com') && url.pathname === '/watch') {
        const videoId = url.searchParams.get('v');
        return videoId ? `youtube:${videoId}` : location.href;
      }
      if (url.hostname.includes('bilibili.com')) {
        const bvid = url.pathname.match(/\/video\/(BV[\w]+)/i)?.[1] ||
          url.searchParams.get('bvid') ||
          '';
        const page = url.searchParams.get('p') || '1';
        return bvid ? `bilibili:${bvid}:${page}` : location.href;
      }
    } catch {}
    return location.href;
  }

  function clearPageCaptionCache() {
    processedUrls.clear();
    processedBilibiliPages.clear();
    sendRuntimeMessage({ type: 'CLEAR_CAPTION_TRACKS' }).catch(() => {});
  }

  let scanTimer = 0;
  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 350);
  }

  let youtubeMonitoringStarted = false;
  function startYouTubeMonitoringOnce() {
    if (youtubeMonitoringStarted) return;
    youtubeMonitoringStarted = true;
    startYouTubeMonitoring();
  }

  try {
    chrome.runtime.onMessage.addListener(message => {
      if (message?.type === 'SCAN_CAPTIONS') scan();
    });
  } catch (error) {
    handleExtensionError(error);
  }

  scan();
  document.addEventListener('DOMContentLoaded', scan, { once: true });
  window.addEventListener('load', scan, { once: true });
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  let lastPageIdentity = currentPageIdentity();
  setInterval(() => {
    const pageIdentity = currentPageIdentity();
    if (pageIdentity === lastPageIdentity) return;
    lastPageIdentity = pageIdentity;
    clearPageCaptionCache();
    scheduleScan();
  }, 1000);
  if (location.hostname.includes('bilibili.com')) {
    setInterval(scan, 5000);
  }
  setTimeout(scan, 1500);
  setTimeout(scan, 4000);
})();
