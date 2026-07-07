'use strict';

const {
  TARGETS,
  composeText,
  withDefaultTemplates,
  withLaunchHash
} = globalThis.CaptionPromptShared;
const {
  plainParagraphText,
  textPackageWithVideoInfo
} = globalThis.CaptionPromptTranscript;

const elements = {
  prompt: document.querySelector('#prompt'),
  promptCount: document.querySelector('#promptCount'),
  templateList: document.querySelector('#templateList'),
  copyTemplate: document.querySelector('#copyTemplate'),
  renameTemplate: document.querySelector('#renameTemplate'),
  deleteTemplate: document.querySelector('#deleteTemplate'),
  promptPosition: document.querySelector('#promptPosition'),
  autoSend: document.querySelector('#autoSend'),
  launch: document.querySelector('#launch'),
  message: document.querySelector('#message'),
  targetNote: document.querySelector('#targetNote'),
  captionsView: document.querySelector('#captionsView'),
  launcherView: document.querySelector('#launcherView'),
  captionStatus: document.querySelector('#captionStatus'),
  captionTracks: document.querySelector('#captionTracks'),
  captionEmpty: document.querySelector('#captionEmpty'),
  captionPreview: document.querySelector('#captionPreview'),
  refreshCaptions: document.querySelector('#refreshCaptions'),
  copyCaption: document.querySelector('#copyCaption'),
  useCaption: document.querySelector('#useCaption')
};

let saveTimer;
let templates = [];
let activeTemplateId;
let activeTabId;
let captionTracks = [];
let selectedCaptionId;
let selectedCaptionText = '';
const transcriptCache = new WeakMap();

function selectedTarget() {
  return document.querySelector('input[name="target"]:checked')?.value || 'chatgpt';
}

function updatePromptCount() {
  elements.promptCount.textContent = `${elements.prompt.value.length} chars`;
}

function createTemplate(name, prompt = '') {
  return {
    id: crypto.randomUUID(),
    name,
    prompt
  };
}

function activeTemplate() {
  return templates.find(template => template.id === activeTemplateId) || templates[0];
}

function syncActiveTemplateFromEditor() {
  const template = activeTemplate();
  if (template) template.prompt = elements.prompt.value;
}

function renderTemplateList() {
  elements.templateList.replaceChildren();

  templates.forEach(template => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'template-chip';
    button.dataset.templateId = template.id;
    button.textContent = template.name;
    button.classList.toggle('active', template.id === activeTemplateId);
    button.setAttribute(
      'aria-pressed',
      template.id === activeTemplateId ? 'true' : 'false'
    );
    button.addEventListener('click', () => {
      if (template.id === activeTemplateId) return;
      syncActiveTemplateFromEditor();
      activeTemplateId = template.id;
      displayActiveTemplate();
      queueSave();
    });
    elements.templateList.append(button);
  });

  const addButton = document.createElement('button');
  addButton.id = 'addTemplate';
  addButton.type = 'button';
  addButton.className = 'template-chip add-template-chip';
  addButton.title = 'Add template';
  addButton.setAttribute('aria-label', 'Add template');
  addButton.textContent = '＋';
  addButton.addEventListener('click', addTemplate);
  elements.templateList.append(addButton);
  elements.deleteTemplate.disabled = templates.length <= 1;
}

function displayActiveTemplate() {
  const template = activeTemplate();
  if (!template) return;
  activeTemplateId = template.id;
  elements.prompt.value = template.prompt;
  renderTemplateList();
  updatePromptCount();
}

function updateTargetUI() {
  const target = TARGETS[selectedTarget()];
  const isNotebookLM = Boolean(target?.sourceOnly);

  elements.targetNote.textContent = isNotebookLM
    ? 'NotebookLM mode copies the transcript and opens the site. Create a notebook and paste it as a Copied text source.'
    : '';
  elements.launch.querySelector('span').textContent = isNotebookLM
    ? 'Copy Transcript and Open NotebookLM'
    : 'Open with Current Transcript';
  elements.promptPosition.closest('.setting').classList.toggle('muted-setting', isNotebookLM);
  elements.autoSend.closest('.setting').classList.toggle('muted-setting', isNotebookLM);
}

function showMessage(text, success = false) {
  elements.message.textContent = text;
  elements.message.classList.toggle('success', success);
}

function switchView(view) {
  const showCaptions = view === 'captions';
  elements.captionsView.hidden = !showCaptions;
  elements.launcherView.hidden = showCaptions;
  document.querySelectorAll('.view-tab').forEach(button => {
    button.classList.toggle('active', button.dataset.view === view);
  });
}

function sourceName(source) {
  return {
    youtube: 'YouTube',
    bilibili: 'Bilibili',
    'html-track': 'Page Captions'
  }[source] || source;
}

function renderCaptionTracks() {
  elements.captionTracks.replaceChildren();
  elements.captionEmpty.hidden = captionTracks.length > 0;

  if (!captionTracks.length) {
    selectedCaptionId = undefined;
    selectedCaptionText = '';
    elements.captionPreview.value = '';
    elements.copyCaption.disabled = true;
    elements.useCaption.disabled = true;
    elements.captionStatus.textContent = 'No captions found';
    return;
  }

  if (!captionTracks.some(track => track.id === selectedCaptionId)) {
    selectedCaptionId = captionTracks[0].id;
  }

  captionTracks.forEach(track => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'caption-track';
    button.classList.toggle('active', track.id === selectedCaptionId);
    button.innerHTML = `<strong></strong><span></span>`;
    button.querySelector('strong').textContent = track.label || track.language || 'Captions';
    button.querySelector('span').textContent =
      `${sourceName(track.source)} · ${track.cueCount || 0} cues`;
    button.addEventListener('click', () => {
      selectedCaptionId = track.id;
      renderCaptionTracks();
    });
    elements.captionTracks.append(button);
  });

  const selected = captionTracks.find(track => track.id === selectedCaptionId);
  selectedCaptionText = transcriptText(selected);
  elements.captionPreview.value = selectedCaptionText;
  elements.copyCaption.disabled = !selectedCaptionText;
  elements.useCaption.disabled = !selectedCaptionText;
  elements.captionStatus.textContent =
    `Captured ${captionTracks.length} caption track${captionTracks.length === 1 ? '' : 's'}`;
}

async function loadCaptionTracks(triggerScan = false) {
  if (!activeTabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab?.id;
  }
  if (!activeTabId) return;

  if (triggerScan) {
    elements.captionStatus.textContent = 'Scanning current page...';
    await chrome.runtime.sendMessage({ type: 'SCAN_CAPTIONS', tabId: activeTabId });
  }

  const response = await chrome.runtime.sendMessage({
    type: 'GET_CAPTION_TRACKS',
    tabId: activeTabId
  });
  captionTracks = response?.tracks || [];
  renderCaptionTracks();
}

async function scanAndPoll() {
  try {
    await loadCaptionTracks(true);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 600));
      await loadCaptionTracks(false);
      if (captionTracks.length) break;
    }
  } catch (error) {
    elements.captionStatus.textContent = error.message || 'Scan failed';
  }
}

async function saveSettings() {
  syncActiveTemplateFromEditor();
  await chrome.storage.local.set({
    launcherSettings: {
      templates,
      activeTemplateId,
      target: selectedTarget(),
      promptPosition: elements.promptPosition.value,
      autoSend: elements.autoSend.checked
    }
  });
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveSettings().catch(() => showMessage('Failed to save settings. Please try again.'));
  }, 180);
}

async function loadSettings() {
  const { launcherSettings = {} } = await chrome.storage.local.get('launcherSettings');

  templates = withDefaultTemplates(
    launcherSettings.templates,
    launcherSettings.prompt
  );

  activeTemplateId = templates.some(
    template => template.id === launcherSettings.activeTemplateId
  )
    ? launcherSettings.activeTemplateId
    : templates[0].id;

  elements.promptPosition.value = launcherSettings.promptPosition || 'before';
  elements.autoSend.checked = Boolean(launcherSettings.autoSend);

  const target = launcherSettings.target || 'chatgpt';
  const targetInput = document.querySelector(`input[name="target"][value="${target}"]`);
  if (targetInput) targetInput.checked = true;

  displayActiveTemplate();
  updateTargetUI();
}

function transcriptText(track) {
  if (!track) return '';
  return plainParagraphText(track, transcriptCache).trim();
}

function selectedCaptionPayloadText(bodyLabel = 'Transcript') {
  const selectedTrack = captionTracks.find(track => track.id === selectedCaptionId);
  if (!selectedTrack) return selectedCaptionText.trim();
  return textPackageWithVideoInfo(selectedTrack, selectedCaptionText, {
    cache: transcriptCache,
    bodyLabel
  });
}

async function launch() {
  showMessage('');
  elements.launch.disabled = true;

  try {
    const captions = selectedCaptionText;
    if (!captions.trim()) {
      throw new Error('No captions available. Capture and select a caption track first.');
    }
    const payloadText = selectedCaptionPayloadText();

    const targetId = selectedTarget();
    const target = TARGETS[targetId];
    const text = target.sourceOnly
      ? payloadText
      : composeText(
          elements.prompt.value,
          payloadText,
          elements.promptPosition.value,
          { contentLabel: false }
        );

    await saveSettings();

    if (target.sourceOnly) {
      await navigator.clipboard.writeText(text);
      await chrome.tabs.create({ url: target.url });
    } else {
      const response = await chrome.runtime.sendMessage({
        type: 'LAUNCH_TARGET',
        url: target.url,
        payload: {
          targetId,
          text,
          autoSend: elements.autoSend.checked
        }
      });

      if (!response?.ok) {
        throw new Error(response?.error || 'Failed to open target site.');
      }
    }
    showMessage(`Opening ${target.label}...`, true);
    setTimeout(() => window.close(), 350);
  } catch (error) {
    showMessage(error.message || 'Operation failed. Please try again.');
    elements.launch.disabled = false;
  }
}

elements.prompt.addEventListener('input', () => {
  syncActiveTemplateFromEditor();
  updatePromptCount();
  queueSave();
});

function addTemplate() {
  syncActiveTemplateFromEditor();
  const template = createTemplate(`Template ${templates.length + 1}`);
  templates.push(template);
  activeTemplateId = template.id;
  displayActiveTemplate();
  elements.prompt.focus();
  queueSave();
}

elements.copyTemplate.addEventListener('click', async () => {
  syncActiveTemplateFromEditor();
  try {
    await navigator.clipboard.writeText(elements.prompt.value);
    showMessage('Template copied.', true);
  } catch {
    showMessage('Copy failed. Please check clipboard permission.');
  }
});
elements.renameTemplate.addEventListener('click', () => {
  syncActiveTemplateFromEditor();
  const template = activeTemplate();
  if (!template) return;
  const name = window.prompt('Template name', template.name)?.trim();
  if (!name) return;
  template.name = name;
  renderTemplateList();
  queueSave();
});
elements.deleteTemplate.addEventListener('click', () => {
  if (templates.length <= 1) return;
  const template = activeTemplate();
  if (!template || !window.confirm(`Delete "${template.name}"?`)) return;
  const index = templates.findIndex(item => item.id === template.id);
  templates.splice(index, 1);
  activeTemplateId = templates[Math.max(0, index - 1)].id;
  displayActiveTemplate();
  queueSave();
});
elements.promptPosition.addEventListener('change', queueSave);
elements.autoSend.addEventListener('change', queueSave);
document.querySelectorAll('input[name="target"]').forEach(input => {
  input.addEventListener('change', () => {
    updateTargetUI();
    queueSave();
  });
});
elements.launch.addEventListener('click', launch);
document.querySelectorAll('.view-tab').forEach(button => {
  button.addEventListener('click', () => switchView(button.dataset.view));
});
elements.refreshCaptions.addEventListener('click', scanAndPoll);
elements.copyCaption.addEventListener('click', async () => {
  if (!selectedCaptionText) return;
  await navigator.clipboard.writeText(selectedCaptionPayloadText());
  elements.captionStatus.textContent = 'Copied to clipboard';
});
elements.useCaption.addEventListener('click', () => {
  if (!selectedCaptionText) return;
  switchView('launcher');
  showMessage('Selected current caption track. Sending will include video info and transcript text.', true);
});

loadSettings().catch(() => {
  templates = withDefaultTemplates();
  activeTemplateId = templates[0].id;
  displayActiveTemplate();
  updateTargetUI();
  showMessage('Failed to load old settings. Defaults are being used.');
});

scanAndPoll();
