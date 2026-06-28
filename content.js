'use strict';

const {
  launchIdFromHash
} = globalThis.CaptionPromptShared;

const SITE_CONFIGS = {
  'aistudio.google.com': {
    id: 'aistudio',
    selectors: [
      'textarea',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]'
    ],
    sendSelectors: [
      'button[aria-label*="Run"]',
      'button[aria-label*="Send"]',
      'button[type="submit"]'
    ]
  },
  'gemini.google.com': {
    id: 'gemini',
    selectors: [
      'rich-textarea [contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]',
      'textarea'
    ],
    sendSelectors: [
      'button[aria-label*="Send"]',
      'button.send-button'
    ]
  },
  'chatgpt.com': {
    id: 'chatgpt',
    selectors: [
      '[data-testid="composer-textarea"]',
      '#prompt-textarea',
      '[contenteditable="true"][data-virtualkeyboard="true"]',
      'textarea'
    ],
    sendSelectors: [
      'button[data-testid="send-button"]',
      'button[aria-label*="Send"]'
    ]
  },
  'claude.ai': {
    id: 'claude',
    selectors: [
      '[contenteditable="true"][data-placeholder]',
      'div[contenteditable="true"]',
      'textarea'
    ],
    sendSelectors: [
      'button[aria-label*="Send"]',
      'button[type="submit"]'
    ]
  },
  'grok.com': {
    id: 'grok',
    selectors: [
      'textarea',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]'
    ],
    sendSelectors: [
      'button[aria-label*="Submit"]',
      'button[aria-label*="Send"]',
      'button[type="submit"]'
    ]
  }
};

const config = SITE_CONFIGS[location.hostname];

if (config) {
  run().catch(error => {
    report(false, error.message);
  });
}

async function run() {
  const launchId = launchIdFromHash();
  if (!launchId) return;

  const response = await chrome.runtime.sendMessage({
    type: 'CLAIM_LAUNCH_TASK',
    targetId: config.id,
    launchId
  });

  if (!response?.ok || !response.task) return;
  const text = response.task.text || '';

  const editor = await waitForEditor(config.selectors, 30_000);
  if (!editor) {
    throw new Error('在 30 秒内没有找到可输入的对话框。');
  }

  const filled = await fillEditor(editor, text);
  if (!filled) throw new Error('找到了输入框，但没有成功填入文本。');

  if (response.task.autoSend) {
    await submit(editor, config.sendSelectors);
  }

  report(
    true,
    response.task.autoSend ? '已填入并尝试发送' : '已填入',
    response.task.id
  );
}

async function waitForEditor(selectors, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    for (const selector of selectors) {
      const candidates = [...document.querySelectorAll(selector)];
      const editor = candidates.find(isUsableEditor);
      if (editor) return editor;
    }
    await sleep(300);
  }

  return null;
}

function isUsableEditor(element) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return (
    rect.width > 120 &&
    rect.height > 20 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    !element.disabled &&
    !element.readOnly
  );
}

async function fillEditor(editor, text) {
  const expected = probeText(text);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    insertText(editor, text);
    await sleep(350);
    if (editorContains(editor, expected)) {
      await sleep(550);
      return editorContains(editor, expected);
    }
  }
  forceSetText(editor, text);
  await sleep(350);
  return editorContains(editor, expected);
}

function insertText(editor, text) {
  editor.focus();

  if (dispatchPaste(editor, text) && editorContains(editor, probeText(text))) return;

  if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
    setInputValue(editor, text);
    return;
  }

  clearEditable(editor);
  if (document.execCommand('insertText', false, text)) {
    return;
  }

  forceSetText(editor, text);
}

function setInputValue(editor, value) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(editor),
    'value'
  )?.set;

  if (setter) setter.call(editor, value);
  else editor.value = value;

  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));
}

function dispatchPaste(editor, text) {
  try {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', text);
    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer
    });
    return editor.dispatchEvent(event);
  } catch {
    return false;
  }
}

function clearEditable(editor) {
  editor.textContent = '';
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function forceSetText(editor, text) {
  if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
    setInputValue(editor, text);
    return;
  }

  editor.replaceChildren();
  const lines = text.split('\n');

  lines.forEach((line, index) => {
    if (index > 0) editor.append(document.createElement('br'));
    editor.append(document.createTextNode(line));
  });

  editor.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: text
    })
  );
}

function editorContains(editor, text) {
  const expected = normalizeText(text);
  if (!expected) return true;
  return normalizeText(editor.value ?? editor.innerText ?? editor.textContent).includes(expected);
}

function probeText(text) {
  return String(text || '').slice(0, 80);
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

async function submit(editor, selectors) {
  await sleep(350);

  for (const selector of selectors || []) {
    const button = [...document.querySelectorAll(selector)].find(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !element.disabled;
    });
    if (button) {
      button.click();
      return;
    }
  }

  const options = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true
  };

  editor.dispatchEvent(new KeyboardEvent('keydown', options));
  editor.dispatchEvent(new KeyboardEvent('keypress', options));
  editor.dispatchEvent(new KeyboardEvent('keyup', options));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function report(ok, detail, taskId) {
  chrome.runtime.sendMessage({
    type: 'REPORT_LAUNCH_RESULT',
    targetId: config.id,
    ok,
    detail,
    taskId
  }).catch(() => {});
}
