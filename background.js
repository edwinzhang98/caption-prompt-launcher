'use strict';

const TASK_TTL_MS = 5 * 60 * 1000;
const CAPTION_CACHE_PREFIX = 'captionCache:';
const LAUNCH_TASK_PREFIX = 'launchTask:';

chrome.action.onClicked.addListener(async tab => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_CAPTION_SIDEBAR' });
  } catch {}
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove('pendingLaunchTask').catch(() => {});
  chrome.storage.session.clear().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'FETCH_CAPTION_RESOURCE') {
    fetchCaptionResource(message.url, message.responseType)
      .then(data => sendResponse({ ok: true, data }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'CAPTION_TRACK_FOUND') {
    storeCaptionTrack(sender.tab?.id, sender.frameId, {
      ...message.track,
      pageUrl: sender.tab?.url || message.track?.pageUrl
    })
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'GET_CAPTION_TRACKS') {
    getCaptionTracks(message.tabId || sender.tab?.id)
      .then(tracks => sendResponse({ ok: true, tracks }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'CLEAR_CAPTION_TRACKS' && sender.tab?.id) {
    clearCaptionTracks(sender.tab.id)
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'SCAN_CAPTIONS') {
    scanCaptions(message.tabId || sender.tab?.id)
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'CAPTION_SCAN_STATUS' && sender.tab?.id) {
    chrome.tabs.sendMessage(sender.tab.id, {
      type: 'CAPTION_SCAN_STATUS',
      status: message.status
    }).catch(() => {});
  }

  if (message?.type === 'LAUNCH_TARGET') {
    launchTarget(message.url, message.payload)
      .then(tabId => sendResponse({ ok: true, tabId }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'CLAIM_LAUNCH_TASK') {
    claimTask(sender.tab?.id, message.targetId)
      .then(task => sendResponse({ ok: true, task }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'REPORT_LAUNCH_RESULT') {
    reportResult(message).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove(captionCacheKey(tabId)).catch(() => {});
  chrome.storage.session.remove(launchTaskKey(tabId)).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;
  chrome.storage.session.remove(captionCacheKey(tabId))
    .then(() => chrome.tabs.sendMessage(tabId, { type: 'CAPTION_TRACKS_UPDATED' }))
    .catch(() => {});
});

function captionCacheKey(tabId) {
  return `${CAPTION_CACHE_PREFIX}${tabId}`;
}

async function clearCaptionTracks(tabId) {
  if (!tabId) return;
  await chrome.storage.session.remove(captionCacheKey(tabId));
  chrome.tabs.sendMessage(tabId, { type: 'CAPTION_TRACKS_UPDATED' }).catch(() => {});
}

async function fetchCaptionResource(url, responseType = 'text') {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Unsupported caption URL');
  }
  const response = await fetch(parsed.href, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Caption request failed: ${response.status}`);
  }
  return responseType === 'json' ? response.json() : response.text();
}

async function storeCaptionTrack(tabId, frameId, track) {
  if (!tabId || !track?.id || !track?.text) return;
  const key = captionCacheKey(tabId);
  const stored = await chrome.storage.session.get(key);
  const tracks = Array.isArray(stored[key]) ? stored[key] : [];
  const normalized = {
    ...track,
    frameId: frameId ?? 0,
    text: String(track.text).slice(0, 750_000),
    plainText: String(track.plainText || '').slice(0, 750_000),
    videoInfo: normalizeVideoInfo(track.videoInfo || {}),
    cueCount: Array.isArray(track.cues) ? track.cues.length : Number(track.cueCount) || 0,
    cues: Array.isArray(track.cues)
      ? track.cues.slice(0, 6_000).map(cue => ({
          startMs: Number(cue.startMs) || 0,
          endMs: Number(cue.endMs) || 0,
          text: String(cue.text || '').slice(0, 1_000)
        }))
      : []
  };
  const index = tracks.findIndex(item => item.id === normalized.id);
  if (index >= 0) {
    tracks[index] = {
      ...tracks[index],
      ...normalized,
      capturedAt: Date.now()
    };
  } else {
    tracks.push(normalized);
  }
  tracks.sort((a, b) => b.capturedAt - a.capturedAt);
  await chrome.storage.session.set({ [key]: tracks.slice(0, 10) });
  chrome.tabs.sendMessage(tabId, { type: 'CAPTION_TRACKS_UPDATED' }).catch(() => {});
}

function normalizeVideoInfo(info) {
  return {
    title: String(info.title || '').slice(0, 500),
    author: String(info.author || '').slice(0, 300),
    url: String(info.url || '').slice(0, 2_000),
    description: String(info.description || '').slice(0, 12_000)
  };
}

async function getCaptionTracks(tabId) {
  if (!tabId) return [];
  const key = captionCacheKey(tabId);
  const stored = await chrome.storage.session.get(key);
  const tracks = Array.isArray(stored[key]) ? stored[key] : [];
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  return filterTracksForUrl(tracks, tab?.url || '');
}

function filterTracksForUrl(tracks, pageUrl) {
  const key = pageKey(pageUrl);
  if (!key) return tracks;
  const filtered = tracks.filter(track => trackMatchesPage(track, key));
  return filtered.length ? filtered : [];
}

function pageKey(pageUrl) {
  try {
    const url = new URL(pageUrl);
    if (url.hostname.endsWith('youtube.com') && url.pathname === '/watch') {
      const videoId = url.searchParams.get('v');
      return videoId ? { source: 'youtube', videoId } : null;
    }
    if (url.hostname.endsWith('bilibili.com')) {
      const bvid = url.pathname.match(/\/video\/(BV[\w]+)/i)?.[1] ||
        url.searchParams.get('bvid');
      return bvid ? { source: 'bilibili', videoId: bvid } : null;
    }
  } catch {}
  return null;
}

function trackMatchesPage(track, key) {
  if (track.source !== key.source) return false;
  if (String(track.videoId || '') === key.videoId) return true;
  return String(track.id || '').includes(key.videoId);
}

async function scanCaptions(tabId) {
  if (!tabId) throw new Error('No active tab');
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SCAN_CAPTIONS' });
  } catch {
    throw new Error('This page does not support caption scanning. Please refresh and try again.');
  }
}

function launchTaskKey(tabId) {
  return `${LAUNCH_TASK_PREFIX}${tabId}`;
}

async function launchTarget(url, payload) {
  if (!url) throw new Error('Missing target url.');

  // 先开标签页，拿到它唯一的 tabId，再把任务按 tabId 存进 session。
  // 这样 content.js 只需用自己的 sender.tab.id 就能精准取回任务，
  // 不依赖 URL hash（不怕被 SPA 洗掉），也不会和别的标签页串槽。
  const tab = await chrome.tabs.create({ url });

  if (payload?.text) {
    await chrome.storage.session.set({
      [launchTaskKey(tab.id)]: {
        id: crypto.randomUUID(),
        targetId: payload.targetId || '',
        text: payload.text,
        autoSend: Boolean(payload.autoSend),
        createdAt: Date.now()
      }
    });
  }

  return tab.id;
}

async function claimTask(tabId, targetId) {
  if (!tabId) return null;
  const key = launchTaskKey(tabId);
  const stored = await chrome.storage.session.get(key);
  const task = stored[key];
  if (!task) return null;

  await chrome.storage.session.remove(key);
  if (Date.now() - task.createdAt > TASK_TTL_MS) return null;
  if (targetId && task.targetId && task.targetId !== targetId) return null;
  return task;
}

async function reportResult(message) {
  const key = message.ok ? 'lastLaunchSuccess' : 'lastLaunchError';
  await chrome.storage.local.set({
    [key]: {
      targetId: message.targetId,
      detail: message.detail || '',
      at: Date.now()
    }
  });
}
