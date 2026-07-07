(() => {
  'use strict';

  if (window.top !== window || window.__captionPromptSidebar) return;
  window.__captionPromptSidebar = true;

  const {
    TARGETS,
    composeText,
    isExtensionContextError,
    textFingerprint,
    withDefaultTemplates,
    withLaunchHash
  } = globalThis.CaptionPromptShared;
  const {
    DOWNLOAD_FORMATS,
    captionRows,
    createDownloadPayload,
    formatDisplayTime,
    plainParagraphText,
    trackCues,
    transcriptFor,
    transcriptPackageText,
    textPackageWithVideoInfo,
    videoInfoFor
  } = globalThis.CaptionPromptTranscript;
  const {
    collectVideoInfo
  } = globalThis.CaptionPromptVideoInfo;

  const host = document.createElement('div');
  host.id = 'caption-prompt-sidebar-host';
  host.hidden = true;
  host.style.cssText =
    'display:none;min-width:0;max-width:100%;overflow:hidden;contain:layout paint style;';
  const shadow = host.attachShadow({ mode: 'open' });
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = chrome.runtime.getURL('sidebar.css');
  const panel = document.createElement('aside');
  panel.className = 'panel';
  panel.innerHTML = `
    <header class="header">
      <strong>Captions</strong>
      <nav class="tabs">
        <button class="tab active" data-view="captions" type="button">Captions</button>
        <button class="tab" data-view="info" type="button">Info</button>
        <button class="tab" data-view="prompt" type="button">Prompt</button>
      </nav>
      <button class="close-button" type="button" title="Hide">⌃</button>
    </header>
    <section class="view captions-view">
      <div class="caption-tools">
        <select class="track-select" aria-label="Caption track"></select>
        <div class="mode-group">
          <button class="mode-button" data-mode="cc" type="button">CC</button>
          <button class="mode-button active" data-mode="ts" type="button">TS</button>
        </div>
        <button class="tool-button copy-button" type="button" disabled>Copy</button>
        <button class="tool-button download-toggle" type="button" disabled>Download</button>
      </div>
      <div class="download-panel" hidden>
        <div class="download-row">
          <span class="download-label">Format</span>
          <div class="download-format-options">
            <button class="download-format active" data-format="txt" type="button">TXT</button>
            <button class="download-format" data-format="md" type="button">Markdown</button>
            <button class="download-format" data-format="srt" type="button">SRT</button>
            <button class="download-format" data-format="vtt" type="button">WebVTT</button>
            <button class="download-format" data-format="json" type="button">JSON</button>
          </div>
        </div>
        <div class="folder-row">
          <button class="folder-button" type="button">Choose Folder</button>
          <button class="folder-button folder-default" type="button">Use Default</button>
          <span class="folder-name">Save location: Default downloads folder</span>
        </div>
        <button class="download-button" type="button">Download Captions</button>
      </div>
      <div class="caption-meta">Looking for captions on this page...</div>
      <main class="caption-content">
        <div class="empty">Open a video with captions and they will appear here automatically.</div>
        <ol class="caption-list" hidden></ol>
      </main>
      <button class="back-current-button" type="button" hidden>Back to Current</button>
    </section>
    <section class="view info-view" hidden>
      <div class="info-content">
        <div class="info-empty">Select a captured caption track to view the title, author, URL, and description.</div>
        <dl class="video-info-list" hidden>
          <div>
            <dt>Title</dt>
            <dd class="video-info-title"></dd>
          </div>
          <div>
            <dt>Author</dt>
            <dd class="video-info-author"></dd>
          </div>
          <div>
            <dt>URL</dt>
            <dd><a class="video-info-url" target="_blank" rel="noreferrer"></a></dd>
          </div>
          <div>
            <dt>Description</dt>
            <dd class="video-info-description"></dd>
          </div>
        </dl>
      </div>
    </section>
    <section class="view prompt-view" hidden>
      <div class="prompt-scroll">
        <div class="section-heading">
          <strong>Prompt Templates</strong>
          <div>
            <button class="small-button copy-template" type="button">Copy</button>
            <button class="small-button rename-template" type="button">Rename</button>
            <button class="small-button delete-template" type="button">Delete</button>
          </div>
        </div>
        <div class="template-list"></div>
        <textarea class="prompt-editor" rows="7"></textarea>
        <div class="prompt-count"></div>
        <strong class="field-label">Send To</strong>
        <div class="targets"></div>
        <div class="settings">
          <label>
            <span>Prompt Position</span>
            <select class="prompt-position">
              <option value="before">Before transcript</option>
              <option value="after">After transcript</option>
            </select>
          </label>
          <label>
            <span>Auto-send after filling</span>
            <input class="auto-send" type="checkbox">
          </label>
        </div>
        <button class="launch-button" type="button">Open AI with current transcript (TS)</button>
        <div class="launch-message"></div>
      </div>
    </section>
    <footer class="status">Waiting for captions...</footer>
  `;
  shadow.append(stylesheet, panel);

  const elements = {
    tabs: [...shadow.querySelectorAll('.tab')],
    views: [...shadow.querySelectorAll('.view')],
    close: shadow.querySelector('.close-button'),
    track: shadow.querySelector('.track-select'),
    modes: [...shadow.querySelectorAll('.mode-button')],
    copy: shadow.querySelector('.copy-button'),
    downloadToggle: shadow.querySelector('.download-toggle'),
    downloadPanel: shadow.querySelector('.download-panel'),
    downloadFormats: [...shadow.querySelectorAll('.download-format')],
    chooseFolder: shadow.querySelector('.folder-button'),
    useDefaultFolder: shadow.querySelector('.folder-default'),
    folderName: shadow.querySelector('.folder-name'),
    downloadButton: shadow.querySelector('.download-button'),
    meta: shadow.querySelector('.caption-meta'),
    content: shadow.querySelector('.caption-content'),
    empty: shadow.querySelector('.empty'),
    list: shadow.querySelector('.caption-list'),
    backCurrent: shadow.querySelector('.back-current-button'),
    infoEmpty: shadow.querySelector('.info-empty'),
    videoInfoList: shadow.querySelector('.video-info-list'),
    videoInfoTitle: shadow.querySelector('.video-info-title'),
    videoInfoAuthor: shadow.querySelector('.video-info-author'),
    videoInfoUrl: shadow.querySelector('.video-info-url'),
    videoInfoDescription: shadow.querySelector('.video-info-description'),
    status: shadow.querySelector('.status'),
    templateList: shadow.querySelector('.template-list'),
    copyTemplate: shadow.querySelector('.copy-template'),
    renameTemplate: shadow.querySelector('.rename-template'),
    deleteTemplate: shadow.querySelector('.delete-template'),
    prompt: shadow.querySelector('.prompt-editor'),
    promptCount: shadow.querySelector('.prompt-count'),
    targets: shadow.querySelector('.targets'),
    promptPosition: shadow.querySelector('.prompt-position'),
    autoSend: shadow.querySelector('.auto-send'),
    launch: shadow.querySelector('.launch-button'),
    launchMessage: shadow.querySelector('.launch-message')
  };

  let visible = true;
  let folded = true;
  let captionAvailability;
  let videoResizeObserver;
  let observedVideo;
  let layoutModeObserver;
  let observedLayoutModeElement;
  let tracks = [];
  let selectedTrackId = '';
  let mode = 'ts';
  let templates = [];
  let activeTemplateId = '';
  let downloadSettings = {};
  let downloadDirectoryHandle;
  let saveTimer = 0;
  let playbackFrame = 0;
  let mountFrame = 0;
  let currentPlaybackStartMs = -1;
  let playbackFollowPaused = false;
  let stylesReady = false;
  let extensionContextInvalid = false;
  const transcriptCache = new WeakMap();

  stylesheet.addEventListener('load', () => {
    stylesReady = true;
    scheduleMount();
  }, { once: true });
  stylesheet.addEventListener('error', loadStylesInline, { once: true });
  setTimeout(() => {
    if (!stylesReady) loadStylesInline();
  }, 500);

  elements.close.addEventListener('click', toggleFold);
  elements.tabs.forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
  elements.track.addEventListener('change', () => {
    selectedTrackId = elements.track.value;
    renderCaptions();
    renderVideoInfo();
  });
  elements.modes.forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.mode;
    elements.modes.forEach(item => item.classList.toggle('active', item === button));
    renderCaptions();
  }));
  elements.copy.addEventListener('click', copyCurrentText);
  elements.downloadToggle.addEventListener('click', toggleDownloadPanel);
  elements.downloadButton.addEventListener('click', downloadCurrentTrack);
  elements.downloadFormats.forEach(button => button.addEventListener('click', () => {
    setDownloadFormat(button.dataset.format);
    queueSave();
  }));
  elements.chooseFolder.addEventListener('click', chooseDownloadFolder);
  elements.useDefaultFolder.addEventListener('click', clearDownloadFolder);
  elements.backCurrent.addEventListener('click', resumePlaybackFollow);
  elements.content.addEventListener('wheel', pausePlaybackFollow, { passive: true });
  elements.content.addEventListener('touchmove', pausePlaybackFollow, { passive: true });
  elements.content.addEventListener('pointerdown', event => {
    const rect = elements.content.getBoundingClientRect();
    if (event.clientX >= rect.right - 18) pausePlaybackFollow();
  });
  elements.content.addEventListener('keydown', event => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
      pausePlaybackFollow();
    }
  });
  elements.content.addEventListener('scroll', () => {
    if (!playbackFollowPaused) return;
    requestAnimationFrame(() => updateBackCurrentButton(
      shadow.querySelector('.playback-active')
    ));
  }, { passive: true });
  elements.prompt.addEventListener('input', () => {
    syncActiveTemplateFromEditor();
    elements.promptCount.textContent = `${elements.prompt.value.length} chars`;
    queueSave();
  });
  elements.prompt.addEventListener('keydown', stopEditorEventPropagation);
  elements.prompt.addEventListener('keyup', stopEditorEventPropagation);
  elements.copyTemplate.addEventListener('click', copyTemplate);
  elements.renameTemplate.addEventListener('click', renameTemplate);
  elements.deleteTemplate.addEventListener('click', deleteTemplate);
  elements.promptPosition.addEventListener('change', queueSave);
  elements.autoSend.addEventListener('change', queueSave);
  elements.launch.addEventListener('click', launch);

  try {
    chrome.runtime.onMessage.addListener(message => {
      if (message?.type === 'TOGGLE_CAPTION_SIDEBAR') toggle();
      if (message?.type === 'CAPTION_TRACKS_UPDATED') loadTracks();
      if (message?.type === 'CAPTION_SCAN_STATUS' && !tracks.length) {
        setStatus(message.status);
      }
    });
  } catch (error) {
    handleExtensionError(error);
  }

  function handleExtensionError(error) {
    if (!isExtensionContextError(error)) return false;
    extensionContextInvalid = true;
    clearTimeout(saveTimer);
    cancelAnimationFrame(mountFrame);
    cancelAnimationFrame(playbackFrame);
    host.remove();
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

  async function getLocalStorage(key) {
    if (extensionContextInvalid) return {};
    try {
      return await chrome.storage.local.get(key);
    } catch (error) {
      if (handleExtensionError(error)) return {};
      throw error;
    }
  }

  async function setLocalStorage(value) {
    if (extensionContextInvalid) return false;
    try {
      await chrome.storage.local.set(value);
      return true;
    } catch (error) {
      if (handleExtensionError(error)) return false;
      throw error;
    }
  }

  async function loadDownloadDirectoryHandle() {
    if (!supportsDirectoryDownloads()) return undefined;
    try {
      return await getDownloadHandleStore('readonly', store => store.get('downloadDirectory'));
    } catch {
      return undefined;
    }
  }

  async function saveDownloadDirectoryHandle(handle) {
    if (!supportsDirectoryDownloads()) return false;
    try {
      await getDownloadHandleStore('readwrite', store => store.put(handle, 'downloadDirectory'));
      return true;
    } catch {
      return false;
    }
  }

  async function deleteDownloadDirectoryHandle() {
    if (!supportsDirectoryDownloads()) return false;
    try {
      await getDownloadHandleStore('readwrite', store => store.delete('downloadDirectory'));
      return true;
    } catch {
      return false;
    }
  }

  async function getDownloadHandleStore(mode, operation) {
    const db = await openDownloadHandleDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('handles', mode);
      const request = operation(transaction.objectStore('handles'));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
      transaction.onabort = () => {
        db.close();
        reject(transaction.error);
      };
    });
  }

  function openDownloadHandleDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('caption-prompt-launcher', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('handles');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function fixtureSite() {
    return document.documentElement.dataset.captionFixture || '';
  }

  function currentVideoSite() {
    const fixture = fixtureSite();
    if (fixture === 'youtube-watch') return 'youtube';
    if (fixture === 'bilibili-video') return 'bilibili';
    if (fixture) return '';

    if (location.hostname.endsWith('youtube.com')) {
      return location.pathname === '/watch' && new URL(location.href).searchParams.has('v')
        ? 'youtube'
        : '';
    }
    if (location.hostname.endsWith('bilibili.com')) {
      return /^\/video\//.test(location.pathname) || /^\/bangumi\/play\//.test(location.pathname)
        ? 'bilibili'
        : '';
    }
    return '';
  }

  function findMountTarget(site) {
    if (site === 'youtube') {
      const videoRect = findVideoElement('youtube')?.getBoundingClientRect();
      return [...document.querySelectorAll('ytd-watch-flexy #secondary')]
        .filter(element => {
          const rect = element.getBoundingClientRect();
          const visible = rect.width > 240 && rect.height > 0;
          const saneWidth = rect.width <= 700;
          const nearVideo = !videoRect ||
            rect.left >= videoRect.left ||
            rect.top >= videoRect.bottom - 24;
          return visible && saneWidth && nearVideo;
        })
        .sort((left, right) =>
          left.getBoundingClientRect().width - right.getBoundingClientRect().width
        )[0] || null;
    }
    if (site === 'bilibili') {
      return document.querySelector('#danmukuBox');
    }
    return null;
  }

  function findVideoElement(site = currentVideoSite()) {
    if (site === 'youtube') {
      return document.querySelector('ytd-watch-flexy #movie_player video') ||
        document.querySelector('ytd-watch-flexy video');
    }
    return document.querySelector('#bilibili-player video') ||
      document.querySelector('.bpx-player-video-wrap video') ||
      document.querySelector('video');
  }

  function mount() {
    if (!stylesReady) return;
    const site = currentVideoSite();
    const target = findMountTarget(site);
    if (!site || !target) {
      unmount();
      return;
    }

    if (site === 'youtube') {
      if (host.parentElement !== target || host !== target.firstElementChild) {
        target.prepend(host);
      }
    } else {
      const needsPlacement =
        host.parentElement !== target.parentElement || host.nextSibling !== target;
      if (needsPlacement) {
        target.before(host);
      }
    }

    host.className = `embedded-host ${site}-host`;
    host.dataset.site = site;
    host.style.display = 'block';
    host.style.width = '100%';
    host.style.maxWidth = site === 'youtube' ? '' : '100%';
    host.style.marginLeft = site === 'youtube' ? 'auto' : '';
    host.style.marginRight = site === 'youtube' ? '0' : '';
    host.hidden = !visible;
    observeVideoSize(site);
    observeLayoutMode(site);
    updateEmbeddedHeight();
  }

  function unmount() {
    if (
      !host.isConnected &&
      !observedVideo &&
      !observedLayoutModeElement
    ) {
      return;
    }
    host.remove();
    host.className = '';
    host.removeAttribute('data-site');
    host.removeAttribute('data-layout-mode');
    host.style.display = 'none';
    removeVideoListeners();
    observedVideo = undefined;
    videoResizeObserver?.disconnect();
    videoResizeObserver = undefined;
    layoutModeObserver?.disconnect();
    layoutModeObserver = undefined;
    observedLayoutModeElement = undefined;
  }

  async function loadStylesInline() {
    if (stylesReady || extensionContextInvalid) return;
    try {
      const response = await fetch(chrome.runtime.getURL('sidebar.css'));
      if (!response.ok) return;
      const style = document.createElement('style');
      style.textContent = await response.text();
      stylesheet.replaceWith(style);
      stylesReady = true;
      scheduleMount();
    } catch (error) {
      handleExtensionError(error);
    }
  }

  function scheduleMount() {
    if (extensionContextInvalid) return;
    cancelAnimationFrame(mountFrame);
    mountFrame = requestAnimationFrame(mount);
  }

  function toggle() {
    if (!currentVideoSite()) return;
    visible = !visible;
    host.hidden = !visible;
    if (visible) mount();
  }

  function toggleFold() {
    setFolded(!folded);
  }

  function setFolded(nextFolded) {
    folded = nextFolded;
    panel.classList.toggle('folded', folded);
    elements.close.textContent = folded ? '⌄' : '⌃';
    elements.close.title = folded ? 'Expand' : 'Collapse';
    updateEmbeddedHeight();
  }

  function observeVideoSize(site) {
    const video = findVideoElement(site);
    if (!video || video === observedVideo) return;
    removeVideoListeners();
    videoResizeObserver?.disconnect();
    observedVideo = video;
    videoResizeObserver = new ResizeObserver(updateEmbeddedHeight);
    videoResizeObserver.observe(video);
    addVideoListeners(video);
    schedulePlaybackSync();
  }

  function observeLayoutMode(site) {
    const element = site === 'youtube'
      ? document.querySelector('ytd-watch-flexy')
      : document.querySelector('.bpx-player-container');
    if (!element || element === observedLayoutModeElement) return;
    layoutModeObserver?.disconnect();
    observedLayoutModeElement = element;
    layoutModeObserver = new MutationObserver(updateEmbeddedHeight);
    layoutModeObserver.observe(element, {
      attributes: true,
      attributeFilter: site === 'youtube'
        ? ['theater', 'fullscreen']
        : ['data-screen']
    });
  }

  function addVideoListeners(video) {
    video.addEventListener('timeupdate', schedulePlaybackSync);
    video.addEventListener('seeked', schedulePlaybackSync);
    video.addEventListener('loadedmetadata', schedulePlaybackSync);
    video.addEventListener('play', schedulePlaybackSync);
    video.addEventListener('pause', schedulePlaybackSync);
  }

  function removeVideoListeners() {
    if (!observedVideo) return;
    observedVideo.removeEventListener('timeupdate', schedulePlaybackSync);
    observedVideo.removeEventListener('seeked', schedulePlaybackSync);
    observedVideo.removeEventListener('loadedmetadata', schedulePlaybackSync);
    observedVideo.removeEventListener('play', schedulePlaybackSync);
    observedVideo.removeEventListener('pause', schedulePlaybackSync);
  }

  function updateEmbeddedHeight() {
    if (!host.classList.contains('embedded-host')) return;
    const site = host.dataset.site;
    const video = findVideoElement(site);
    let layoutMode = 'normal';
    let measuredHeight = video?.getBoundingClientRect().height || video?.offsetHeight || 520;

    if (site === 'youtube') {
      const watch = document.querySelector('ytd-watch-flexy');
      const theater = Boolean(watch?.hasAttribute('theater') || watch?.hasAttribute('fullscreen'));
      layoutMode = theater ? 'theater' : 'normal';
      const player = document.querySelector('ytd-watch-flexy #player-container-inner') ||
        document.querySelector('ytd-watch-flexy #movie_player');
      if (!theater) {
        measuredHeight = player?.getBoundingClientRect().height || measuredHeight;
      } else {
        measuredHeight = 520;
      }
    } else if (site === 'bilibili') {
      layoutMode =
        document.querySelector('.bpx-player-container')?.getAttribute('data-screen') || 'normal';
      if (layoutMode !== 'normal') measuredHeight = 520;
    }

    host.dataset.layoutMode = layoutMode;
    updateEmbeddedWidth(site, layoutMode);
    const expandedHeight = Math.min(Math.max(measuredHeight, 300), 1000);
    host.style.height = `${folded ? 44 : expandedHeight}px`;
  }

  function updateEmbeddedWidth(site, layoutMode) {
    if (site !== 'youtube') {
      host.style.removeProperty('--caption-panel-width');
      return;
    }
    if (layoutMode !== 'theater') {
      host.style.removeProperty('--caption-panel-width');
      return;
    }
    const secondaryWidth = host.parentElement?.getBoundingClientRect().width || 0;
    if (secondaryWidth > 0) {
      host.style.setProperty('--caption-panel-width', `${Math.round(secondaryWidth)}px`);
    }
  }

  function switchView(view) {
    elements.tabs.forEach(button => button.classList.toggle('active', button.dataset.view === view));
    elements.views.forEach(section => {
      section.hidden = !section.classList.contains(`${view}-view`);
    });
  }

  async function loadTracks() {
    try {
      const response = await sendRuntimeMessage({ type: 'GET_CAPTION_TRACKS' });
      if (extensionContextInvalid) return;
      if (!response?.ok) throw new Error(response?.error || 'Failed to read captions.');
      tracks = response.tracks || [];
      if (!tracks.some(track => track.id === selectedTrackId)) {
        selectedTrackId = tracks[0]?.id || '';
      }
      updateFoldForCaptionAvailability(tracks.length > 0);
      renderTrackOptions();
      renderCaptions();
      renderVideoInfo();
    } catch (error) {
      if (handleExtensionError(error)) return;
      setStatus(error.message, 'error');
    }
  }

  function updateFoldForCaptionAvailability(hasCaptions) {
    if (captionAvailability === hasCaptions) return;
    captionAvailability = hasCaptions;
    setFolded(!hasCaptions);
  }

  function renderTrackOptions() {
    elements.track.replaceChildren();
    if (!tracks.length) {
      elements.track.append(new Option('No captions', ''));
      elements.track.disabled = true;
      return;
    }
    elements.track.disabled = false;
    tracks.forEach(track => {
      elements.track.append(new Option(track.label || track.language || 'Captions', track.id));
    });
    elements.track.value = selectedTrackId;
  }

  function selectedTrack() {
    return tracks.find(track => track.id === selectedTrackId);
  }

  function selectedExportTrack() {
    const track = selectedTrack();
    if (!track) return undefined;
    const videoInfo = currentVideoInfo(track);
    return {
      ...track,
      pageTitle: videoInfo.title || track.pageTitle || document.title,
      pageUrl: videoInfo.url || track.pageUrl || location.href,
      videoInfo
    };
  }

  function renderCaptions() {
    const track = selectedTrack();
    elements.copy.disabled = !track;
    elements.downloadToggle.disabled = !track;
    elements.list.replaceChildren();
    if (!track) {
      elements.meta.textContent = 'Looking for captions on this page...';
      elements.empty.hidden = false;
      elements.list.hidden = true;
      elements.backCurrent.hidden = true;
      elements.downloadPanel.hidden = true;
      renderVideoInfo();
      setStatus('Waiting for captions...');
      return;
    }
    const cues = trackCues(track);
    const rows = mode === 'cc'
      ? captionRows(cues, track.text)
      : transcriptFor(track, transcriptCache).paragraphs;
    elements.meta.textContent =
      `${track.label || track.language || 'Captions'} · ${track.cueCount || rows.length} segments`;
    rows.forEach(row => elements.list.append(
      mode === 'cc' ? createCaptionRow(row) : createParagraphRow(row)
    ));
    elements.empty.hidden = Boolean(rows.length);
    elements.list.hidden = !rows.length;
    setStatus(mode === 'cc' ? 'CC: timestamped captions' : 'TS: paragraph transcript');
    currentPlaybackStartMs = -1;
    schedulePlaybackSync();
  }

  function renderVideoInfo() {
    const track = selectedTrack();
    const info = currentVideoInfo(track);
    const hasInfo = Boolean(info.title || info.author || info.url || info.description);
    elements.infoEmpty.hidden = hasInfo;
    elements.videoInfoList.hidden = !hasInfo;
    if (!hasInfo) return;

    setTextOrPlaceholder(elements.videoInfoTitle, info.title);
    setTextOrPlaceholder(elements.videoInfoAuthor, info.author);
    elements.videoInfoUrl.textContent = info.url || 'Not available';
    elements.videoInfoUrl.href = info.url || location.href;
    setTextOrPlaceholder(elements.videoInfoDescription, info.description);
  }

  function setTextOrPlaceholder(element, value) {
    element.textContent = value || 'Not available';
    element.classList.toggle('muted', !value);
  }

  function currentVideoInfo(track = {}) {
    const domInfo = collectVideoInfo(track);
    return videoInfoFor({
      ...track,
      title: domInfo.title || track.title || track.pageTitle || document.title,
      pageUrl: domInfo.url || track.pageUrl || location.href,
      videoInfo: {
        ...(track.videoInfo || {}),
        ...domInfo
      }
    }, {
      title: document.title,
      pageUrl: location.href
    });
  }

  function createCaptionRow(row) {
    const item = document.createElement('li');
    item.className = 'caption-row';
    item.tabIndex = 0;
    item.dataset.startMs = String(row.startMs);
    if (row.time) {
      const time = document.createElement('span');
      time.className = 'time';
      time.textContent = row.time;
      item.append(time);
    }
    const text = document.createElement('span');
    text.className = 'caption-text';
    text.textContent = row.text;
    item.append(text);
    bindSeekInteraction(item, row.startMs);
    return item;
  }

  function createParagraphRow(paragraph) {
    const item = document.createElement('li');
    item.className = 'caption-row paragraph-row';
    paragraph.sentences.forEach(sentence => {
      const span = document.createElement('span');
      span.className = 'paragraph-sentence';
      span.tabIndex = 0;
      span.dataset.startMs = String(sentence.startMs);
      span.textContent = sentence.text;
      bindSeekInteraction(span, sentence.startMs);
      item.append(span);
    });
    return item;
  }

  function bindSeekInteraction(element, startMs) {
    element.addEventListener('click', () => seekTo(startMs));
    element.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      seekTo(startMs);
    });
  }

  function seekTo(startMs) {
    const video = findVideoElement();
    if (!video || !Number.isFinite(Number(startMs))) return;
    playbackFollowPaused = false;
    elements.backCurrent.hidden = true;
    video.currentTime = Math.max(0, Number(startMs) / 1000);
    syncPlaybackHighlight(true);
    setStatus(`Jumped to ${formatDisplayTime(startMs)}`, 'success');
  }

  function schedulePlaybackSync() {
    cancelAnimationFrame(playbackFrame);
    playbackFrame = requestAnimationFrame(() => syncPlaybackHighlight(false));
  }

  function syncPlaybackHighlight(forceScroll) {
    const video = findVideoElement();
    const track = selectedTrack();
    if (!video || !track || elements.list.hidden) return;

    const cues = trackCues(track);
    if (!cues.length) return;
    const currentMs = Math.max(0, video.currentTime * 1000);
    const cue = currentCueAt(cues, currentMs);
    const startMs = cue ? Number(cue.startMs) : -1;
    const changed = startMs !== currentPlaybackStartMs;
    currentPlaybackStartMs = startMs;

    shadow.querySelectorAll('.playback-active').forEach(item => {
      item.classList.remove('playback-active');
    });
    if (startMs < 0) {
      updateBackCurrentButton();
      return;
    }

    const candidates = [...shadow.querySelectorAll('[data-start-ms]')];
    const active = candidates.find(item => Number(item.dataset.startMs) === startMs);
    if (!active) {
      updateBackCurrentButton();
      return;
    }
    active.classList.add('playback-active');
    if (!playbackFollowPaused && (changed || forceScroll)) {
      scrollCurrentIntoView(active, forceScroll);
    }
    updateBackCurrentButton(active);
  }

  function currentCueAt(cues, currentMs) {
    for (let index = 0; index < cues.length; index += 1) {
      const cue = cues[index];
      const startMs = Number(cue.startMs) || 0;
      if (startMs > currentMs) return undefined;
      const explicitEndMs = Number(cue.endMs) || 0;
      const nextStartMs = Number(cues[index + 1]?.startMs) || 0;
      const endMs = explicitEndMs > startMs
        ? explicitEndMs
        : (nextStartMs > startMs ? nextStartMs : Infinity);
      if (currentMs >= startMs && currentMs < endMs) return cue;
    }
    return undefined;
  }

  function scrollCurrentIntoView(element, force = false) {
    const container = elements.content;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const margin = 36;
    const outside =
      elementRect.top < containerRect.top + margin ||
      elementRect.bottom > containerRect.bottom - margin;
    if (!outside && !force) return;

    const top = container.scrollTop +
      elementRect.top -
      containerRect.top -
      (container.clientHeight - elementRect.height) / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  function pausePlaybackFollow() {
    if (playbackFollowPaused) return;
    playbackFollowPaused = true;
    requestAnimationFrame(() => updateBackCurrentButton(
      shadow.querySelector('.playback-active')
    ));
  }

  function resumePlaybackFollow() {
    playbackFollowPaused = false;
    elements.backCurrent.hidden = true;
    const active = shadow.querySelector('.playback-active');
    if (active) {
      scrollCurrentIntoView(active, true);
    } else {
      syncPlaybackHighlight(true);
    }
  }

  function updateBackCurrentButton(active) {
    if (!playbackFollowPaused || !active) {
      elements.backCurrent.hidden = true;
      return;
    }
    const containerRect = elements.content.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    elements.backCurrent.hidden =
      activeRect.bottom >= containerRect.top && activeRect.top <= containerRect.bottom;
  }

  function currentText() {
    const track = selectedTrack();
    if (!track) return '';
    if (mode === 'cc') return track.text;
    return plainParagraphText(track, transcriptCache);
  }

  function currentCopyText() {
    const track = selectedExportTrack();
    if (!track) return '';
    const text = mode === 'cc'
      ? track.text
      : plainParagraphText(track, transcriptCache);
    return textPackageWithVideoInfo(track, text, {
      cache: transcriptCache,
      bodyLabel: mode === 'cc' ? 'Captions' : 'Transcript'
    });
  }

  function currentTranscriptText() {
    const track = selectedTrack();
    return track ? plainParagraphText(track, transcriptCache) : '';
  }

  function currentPromptPayloadText() {
    const track = selectedExportTrack();
    return track ? transcriptPackageText(track, { cache: transcriptCache }) : '';
  }

  async function copyCurrentText() {
    try {
      await navigator.clipboard.writeText(currentCopyText());
      setStatus('Copied', 'success');
    } catch {
      setStatus('Copy failed. Please check clipboard permission.', 'error');
    }
  }

  function toggleDownloadPanel() {
    elements.downloadPanel.hidden = !elements.downloadPanel.hidden;
  }

  function selectedDownloadFormat() {
    return shadow.querySelector('.download-format.active')?.dataset.format || 'txt';
  }

  function setDownloadFormat(format) {
    const value = DOWNLOAD_FORMATS.includes(format) ? format : 'txt';
    elements.downloadFormats.forEach(button => {
      button.classList.toggle('active', button.dataset.format === value);
    });
  }

  function supportsDirectoryDownloads() {
    return typeof window.showDirectoryPicker === 'function' &&
      typeof window.indexedDB !== 'undefined';
  }

  function updateDownloadModeUI() {
    const supported = supportsDirectoryDownloads();
    elements.chooseFolder.disabled = !supported;
    if (!supported) {
      elements.folderName.textContent = 'Save location: Default downloads folder';
      return;
    }
    elements.folderName.textContent = downloadDirectoryHandle
      ? `Save location: ${downloadDirectoryHandle.name}`
      : 'Save location: Default downloads folder';
  }

  async function chooseDownloadFolder() {
    if (!supportsDirectoryDownloads()) {
      setStatus('Folder access is not supported by this browser or page.', 'error');
      return undefined;
    }
    try {
      const handle = await window.showDirectoryPicker({
        id: 'caption-prompt-downloads',
        mode: 'readwrite',
        startIn: downloadDirectoryHandle || 'downloads'
      });
      await ensureDirectoryPermission(handle);
      downloadDirectoryHandle = handle;
      const remembered = await saveDownloadDirectoryHandle(handle);
      updateDownloadModeUI();
      setStatus(
        remembered
          ? `Folder selected: ${handle.name}`
          : `Folder selected for this page only: ${handle.name}`,
        remembered ? 'success' : 'error'
      );
      return handle;
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setStatus(error.message || 'Failed to choose folder.', 'error');
      }
      return undefined;
    }
  }

  async function clearDownloadFolder() {
    // 切回"默认下载文件夹"模式：清掉记住的目录句柄，之后 downloadCurrentTrack
    // 会走 triggerBlobDownload，把文件下到浏览器默认下载目录（~/Downloads）。
    // 这是唯一能存进 Downloads 根目录的方式——File System Access API 禁止选 Downloads。
    downloadDirectoryHandle = undefined;
    await deleteDownloadDirectoryHandle();
    updateDownloadModeUI();
    setStatus('Switched to default downloads folder (~/Downloads).', 'success');
  }

  async function currentDownloadDirectory() {
    if (!supportsDirectoryDownloads()) return undefined;
    const handle = downloadDirectoryHandle || await loadDownloadDirectoryHandle();
    if (!handle) return undefined;
    await ensureDirectoryPermission(handle);
    downloadDirectoryHandle = handle;
    updateDownloadModeUI();
    return handle;
  }

  async function ensureDirectoryPermission(handle) {
    const options = { mode: 'readwrite' };
    if ((await handle.queryPermission?.(options)) === 'granted') return true;
    if ((await handle.requestPermission?.(options)) === 'granted') return true;
    throw new Error('Folder permission was not granted.');
  }

  async function downloadCurrentTrack() {
    const track = selectedExportTrack();
    if (!track) {
      setStatus('No captions to download yet.', 'error');
      return;
    }
    elements.downloadButton.disabled = true;
    try {
      const format = selectedDownloadFormat();
      const directoryHandle = await currentDownloadDirectory();
      const payload = createDownloadPayload(track, format, {
        cache: transcriptCache
      });
      if (directoryHandle) {
        const filename = await writePayloadToDirectory(directoryHandle, payload);
        downloadSettings = {
          ...downloadSettings,
          format,
          lastDownloadPath: `${directoryHandle.name}/${filename}`
        };
        queueSave();
        return;
      }
      const savedFilename = triggerBlobDownload(payload);
      downloadSettings = {
        ...downloadSettings,
        format,
        lastDownloadPath: savedFilename
      };
      queueSave();
    } catch (error) {
      if (handleExtensionError(error)) return;
      setStatus(error.message || 'Download failed.', 'error');
    } finally {
      elements.downloadButton.disabled = false;
    }
  }

  function triggerBlobDownload(payload) {
    // 默认下载路径：直接在页面上下文里用 blob + <a download> 触发浏览器原生下载，
    // 存到浏览器默认下载目录（macOS 通常是 ~/Downloads）。
    // 之所以不走 background service worker：SW 没有 DOM、也没有 URL.createObjectURL，
    // 只能用 data: URL 调 chrome.downloads，对长字幕不可靠。content script 有完整 DOM，
    // blob 与页面同源，download 属性才会生效。
    const filename = sanitizeLocalFilename(basenameFromDownloadPath(payload.filename));
    const blob = new Blob([payload.content], {
      type: payload.mimeType || 'text/plain;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      anchor.remove();
      URL.revokeObjectURL(url);
    }, 1000);
    return filename;
  }

  async function writePayloadToDirectory(directoryHandle, payload) {
    const filename = await availableFilename(
      directoryHandle,
      basenameFromDownloadPath(payload.filename)
    );
    const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(new Blob([payload.content], {
      type: payload.mimeType || 'text/plain;charset=utf-8'
    }));
    await writable.close();
    return filename;
  }

  async function availableFilename(directoryHandle, filename) {
    const safeName = sanitizeLocalFilename(filename || 'captions.txt');
    const extensionMatch = safeName.match(/(\.[^.]+)$/);
    const extension = extensionMatch?.[1] || '';
    const stem = extension ? safeName.slice(0, -extension.length) : safeName;
    for (let index = 0; index < 100; index += 1) {
      const candidate = index ? `${stem} (${index})${extension}` : safeName;
      try {
        await directoryHandle.getFileHandle(candidate);
      } catch {
        return candidate;
      }
    }
    return `${stem} (${Date.now()})${extension}`;
  }

  function basenameFromDownloadPath(value) {
    return String(value || 'captions.txt').split('/').filter(Boolean).pop() || 'captions.txt';
  }

  function sanitizeLocalFilename(value) {
    return String(value || 'captions.txt')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'captions.txt';
  }

  function activeTemplate() {
    return templates.find(template => template.id === activeTemplateId) || templates[0];
  }

  function syncActiveTemplateFromEditor() {
    const template = activeTemplate();
    if (template) template.prompt = elements.prompt.value;
  }

  function stopEditorEventPropagation(event) {
    event.stopPropagation();
  }

  function renderTemplates() {
    elements.templateList.replaceChildren();
    templates.forEach(template => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'template-chip';
      button.classList.toggle('active', template.id === activeTemplateId);
      button.textContent = template.name;
      button.addEventListener('click', () => {
        syncActiveTemplateFromEditor();
        activeTemplateId = template.id;
        displayTemplate();
        queueSave();
      });
      elements.templateList.append(button);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'template-chip add-template';
    add.textContent = '＋';
    add.addEventListener('click', () => {
      const template = {
        id: crypto.randomUUID(),
        name: `Template ${templates.length + 1}`,
        prompt: ''
      };
      templates.push(template);
      activeTemplateId = template.id;
      displayTemplate();
      elements.prompt.focus();
      queueSave();
    });
    elements.templateList.append(add);
    elements.deleteTemplate.disabled = templates.length <= 1;
  }

  function displayTemplate() {
    const template = activeTemplate();
    if (!template) return;
    elements.prompt.value = template.prompt;
    elements.promptCount.textContent = `${template.prompt.length} chars`;
    renderTemplates();
  }

  function renameTemplate() {
    syncActiveTemplateFromEditor();
    const template = activeTemplate();
    const name = window.prompt('Template name', template?.name || '')?.trim();
    if (!template || !name) return;
    template.name = name;
    renderTemplates();
    queueSave();
  }

  async function copyTemplate() {
    syncActiveTemplateFromEditor();
    try {
      await navigator.clipboard.writeText(elements.prompt.value);
      elements.launchMessage.textContent = 'Template copied.';
      elements.launchMessage.classList.add('success');
    } catch {
      elements.launchMessage.textContent = 'Copy failed. Please check clipboard permission.';
      elements.launchMessage.classList.remove('success');
    }
  }

  function deleteTemplate() {
    if (templates.length <= 1) return;
    const index = templates.findIndex(template => template.id === activeTemplateId);
    templates.splice(index, 1);
    activeTemplateId = templates[Math.max(0, index - 1)].id;
    displayTemplate();
    queueSave();
  }

  function renderTargets(selected) {
    elements.targets.replaceChildren();
    Object.entries(TARGETS).forEach(([id, target]) => {
      const label = document.createElement('label');
      label.className = 'target';
      label.innerHTML = `<input type="radio" name="caption-launch-target"><span></span>`;
      const input = label.querySelector('input');
      input.value = id;
      input.checked = id === selected;
      input.addEventListener('change', queueSave);
      label.querySelector('span').textContent = target.label;
      elements.targets.append(label);
    });
  }

  function selectedTarget() {
    return shadow.querySelector('input[name="caption-launch-target"]:checked')?.value || 'chatgpt';
  }

  async function loadSettings() {
    const { launcherSettings = {} } = await getLocalStorage('launcherSettings');
    if (extensionContextInvalid) return;
    templates = withDefaultTemplates(
      launcherSettings.templates,
      launcherSettings.prompt
    );
    activeTemplateId = templates.some(item => item.id === launcherSettings.activeTemplateId)
      ? launcherSettings.activeTemplateId
      : templates[0].id;
    elements.promptPosition.value = launcherSettings.promptPosition || 'before';
    elements.autoSend.checked = Boolean(launcherSettings.autoSend);
    downloadSettings = launcherSettings.downloadSettings || {};
    setDownloadFormat(downloadSettings.format || 'txt');
    downloadDirectoryHandle = await loadDownloadDirectoryHandle();
    updateDownloadModeUI();
    renderTargets(launcherSettings.target || 'chatgpt');
    displayTemplate();
  }

  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveSettings().catch(error => {
        if (!handleExtensionError(error)) {
          setStatus(error.message || 'Failed to save settings.', 'error');
        }
      });
    }, 180);
  }

  async function saveSettings() {
    syncActiveTemplateFromEditor();
    await setLocalStorage({
      launcherSettings: {
        templates,
        activeTemplateId,
        target: selectedTarget(),
        promptPosition: elements.promptPosition.value,
        autoSend: elements.autoSend.checked,
        downloadSettings: {
          format: selectedDownloadFormat(),
          lastDownloadPath: downloadSettings.lastDownloadPath || ''
        }
      }
    });
  }

  async function launch() {
    syncActiveTemplateFromEditor();
    elements.launchMessage.classList.remove('success');
    const transcript = currentTranscriptText();
    const captions = currentPromptPayloadText();
    const track = selectedExportTrack();
    if (!transcript) {
      elements.launchMessage.textContent = 'No captions available yet.';
      return;
    }
    elements.launch.disabled = true;
    try {
      const targetId = selectedTarget();
      const target = TARGETS[targetId];
      let launchUrl = target.url;
      const text = target.sourceOnly
        ? captions
        : composeText(elements.prompt.value, captions, elements.promptPosition.value, {
            contentLabel: false
          });
      await saveSettings();
      if (target.sourceOnly) {
        await navigator.clipboard.writeText(text);
      } else {
        const response = await sendRuntimeMessage({
          type: 'CREATE_LAUNCH_TASK',
          payload: {
            targetId,
            text,
            sourceTrackId: track?.id || '',
            sourceVideoId: track?.videoId || '',
            sourcePageUrl: track?.pageUrl || location.href,
            sourcePreview: transcript.slice(0, 160),
            fingerprint: textFingerprint(text),
            autoSend: elements.autoSend.checked
          }
        });
        if (extensionContextInvalid) return;
        if (!response?.ok) throw new Error(response?.error || 'Failed to create launch task.');
        launchUrl = withLaunchHash(target.url, response.launchId);
      }
      const opened = await sendRuntimeMessage({
        type: 'OPEN_TARGET_TAB',
        url: launchUrl
      });
      if (extensionContextInvalid) return;
      if (!opened?.ok) throw new Error(opened?.error || 'Failed to open target site.');
      elements.launchMessage.textContent = `Opening ${target.label}...`;
    } catch (error) {
      if (handleExtensionError(error)) return;
      elements.launchMessage.textContent = error.message || 'Operation failed.';
    } finally {
      elements.launch.disabled = false;
    }
  }

  function setStatus(message, kind = '') {
    elements.status.textContent = message;
    elements.status.className = `status${kind ? ` ${kind}` : ''}`;
  }

  const mountObserver = new MutationObserver(scheduleMount);
  mountObserver.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('yt-navigate-finish', scheduleMount);
  window.addEventListener('popstate', scheduleMount);
  setFolded(true);
  mount();
  loadSettings().catch(error => {
    if (!handleExtensionError(error)) {
      setStatus(error.message || 'Failed to load settings.', 'error');
    }
  });
  loadTracks();
})();
