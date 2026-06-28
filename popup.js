'use strict';

const {
  TARGETS,
  composeText,
  withDefaultTemplates,
  withLaunchHash
} = globalThis.CaptionPromptShared;
const {
  plainParagraphText
} = globalThis.CaptionPromptTranscript;

const elements = {
  prompt: document.querySelector('#prompt'),
  promptCount: document.querySelector('#promptCount'),
  templateList: document.querySelector('#templateList'),
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
  return document.querySelector('input[name="target"]:checked')?.value || 'aistudio';
}

function updatePromptCount() {
  elements.promptCount.textContent = `${elements.prompt.value.length} 字`;
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
  addButton.title = '添加模板';
  addButton.setAttribute('aria-label', '添加模板');
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
    ? 'NotebookLM 模式会复制纯字幕并打开网站。请新建 notebook，把字幕粘贴为 Copied text 来源；Prompt 模板仍保留供后续提问。'
    : '';
  elements.launch.querySelector('span').textContent = isNotebookLM
    ? '复制字幕并打开 NotebookLM'
    : '使用当前字幕并打开';
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
    'html-track': '网页字幕'
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
    elements.captionStatus.textContent = '未发现字幕';
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
    button.querySelector('strong').textContent = track.label || track.language || '字幕';
    button.querySelector('span').textContent =
      `${sourceName(track.source)} · ${track.cueCount || 0} 条`;
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
    `已捕获 ${captionTracks.length} 个字幕轨道`;
}

async function loadCaptionTracks(triggerScan = false) {
  if (!activeTabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab?.id;
  }
  if (!activeTabId) return;

  if (triggerScan) {
    elements.captionStatus.textContent = '正在扫描当前页面…';
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
    elements.captionStatus.textContent = error.message || '扫描失败';
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
    saveSettings().catch(() => showMessage('设置保存失败，请重试。'));
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

  const target = launcherSettings.target || 'aistudio';
  const targetInput = document.querySelector(`input[name="target"][value="${target}"]`);
  if (targetInput) targetInput.checked = true;

  displayActiveTemplate();
  updateTargetUI();
}

function transcriptText(track) {
  if (!track) return '';
  return plainParagraphText(track, transcriptCache).trim();
}

async function launch() {
  showMessage('');
  elements.launch.disabled = true;

  try {
    const captions = selectedCaptionText;
    if (!captions.trim()) {
      throw new Error('没有可用字幕。请先在当前页面获取并选择一个字幕轨道。');
    }

    const targetId = selectedTarget();
    const target = TARGETS[targetId];
    let launchUrl = target.url;
    const text = target.sourceOnly
      ? captions.trim()
      : composeText(
          elements.prompt.value,
          captions,
          elements.promptPosition.value
        );

    await saveSettings();

    if (target.sourceOnly) {
      await navigator.clipboard.writeText(text);
    } else {
      const response = await chrome.runtime.sendMessage({
        type: 'CREATE_LAUNCH_TASK',
        payload: {
          targetId,
          text,
          autoSend: elements.autoSend.checked
        }
      });

      if (!response?.ok) {
        throw new Error(response?.error || '无法创建发送任务。');
      }
      launchUrl = withLaunchHash(target.url, response.launchId);
    }

    await chrome.tabs.create({ url: launchUrl });
    showMessage(`正在打开 ${target.label}…`, true);
    setTimeout(() => window.close(), 350);
  } catch (error) {
    showMessage(error.message || '操作失败，请重试。');
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
  const template = createTemplate(`模板 ${templates.length + 1}`);
  templates.push(template);
  activeTemplateId = template.id;
  displayActiveTemplate();
  elements.prompt.focus();
  queueSave();
}
elements.renameTemplate.addEventListener('click', () => {
  const template = activeTemplate();
  if (!template) return;
  const name = window.prompt('模板名称', template.name)?.trim();
  if (!name) return;
  template.name = name;
  renderTemplateList();
  queueSave();
});
elements.deleteTemplate.addEventListener('click', () => {
  if (templates.length <= 1) return;
  const template = activeTemplate();
  if (!template || !window.confirm(`删除“${template.name}”？`)) return;
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
  await navigator.clipboard.writeText(selectedCaptionText);
  elements.captionStatus.textContent = '字幕已复制到剪贴板';
});
elements.useCaption.addEventListener('click', () => {
  if (!selectedCaptionText) return;
  switchView('launcher');
  showMessage('已选择当前字幕轨道，发送时会使用它的纯文本内容。', true);
});

loadSettings().catch(() => {
  templates = withDefaultTemplates();
  activeTemplateId = templates[0].id;
  displayActiveTemplate();
  updateTargetUI();
  showMessage('未能载入旧设置，已使用默认值。');
});

scanAndPoll();
