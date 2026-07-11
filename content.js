'use strict';

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

let pendingTask = null;
let filledOnce = false;
let fillingNow = false;

if (config) {
  start().catch(error => report(false, error.message));
}

async function start() {
  pendingTask = await claimForThisTab();
  if (!pendingTask) return;

  await tryFill();
  // 若这次没填成（多半是标签页在后台、SPA 还没渲染输入框），
  // 等标签页下次变可见时再补填，直到成功。
  if (!filledOnce) {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
}

async function claimForThisTab() {
  // 任务由 background 按本标签页的 tabId 存好；重试几次以防偶发的抢跑。
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CLAIM_LAUNCH_TASK',
        targetId: config.id
      });
      if (response?.ok && response.task) return response.task;
    } catch {}
    await sleep(200);
  }
  return null;
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    tryFill().catch(error => report(false, error.message));
  }
}

async function tryFill() {
  if (filledOnce || fillingNow || !pendingTask) return;
  fillingNow = true;
  try {
    const editor = await waitForEditor(config.selectors, 30_000);
    if (!editor) return; // 还没准备好，留给下次变可见时重试

    const ok = await fillEditor(editor, pendingTask.text || '');
    if (!ok) return;

    filledOnce = true;
    if (pendingTask.autoSend) {
      await submit(editor, config.sendSelectors);
    }
    report(true, pendingTask.autoSend ? '已填入并尝试发送' : '已填入', pendingTask.id);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    pendingTask = null;
  } finally {
    fillingNow = false;
  }
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
  // 反复“填入 → 稍等 → 复核”，直到内容稳定停留。
  // 目的：对抗 ChatGPT 页面加载后【异步恢复上一条旧草稿】——它可能在我们填完之后
  // 才把旧草稿盖回来。insertText 每次都会先全选删除再填，所以重填能覆盖掉草稿。
  for (let attempt = 0; attempt < 6; attempt += 1) {
    insertText(editor, text);
    await sleep(400);
    if (!editorContains(editor, expected)) continue; // 没填进去，重来
    // 已填进去，再多等一会儿，看是否被草稿恢复覆盖
    await sleep(700);
    if (editorContains(editor, expected)) return true; // 稳住了
    // 被覆盖回旧草稿 → 进入下一轮，清空重填
  }
  forceSetText(editor, text);
  await sleep(400);
  return editorContains(editor, expected);
}

function insertText(editor, text) {
  editor.focus();

  // textarea / input：直接设值最稳
  if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
    setInputValue(editor, text);
    return;
  }

  // contenteditable（ChatGPT 的 ProseMirror 等）：
  // 优先用 execCommand insertText 走浏览器原生输入（相当于“模拟打字”），
  // 文本会内联插入——既不会触发 ChatGPT 把长粘贴转成附件，
  // 也不会像“合成粘贴 / 直接改 DOM”那样被编辑器回滚清空（就是那种闪一下又消失）。
  clearEditable(editor);
  if (document.execCommand('insertText', false, text) && editorContains(editor, probeText(text))) {
    return;
  }

  // 兜底一：合成粘贴事件
  if (dispatchPaste(editor, text) && editorContains(editor, probeText(text))) return;

  // 兜底二：直接写 DOM
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
  // 全选现有内容后用 execCommand 删除。ChatGPT 的 ProseMirror 会把这当成真实输入处理，
  // 从而真正清掉它自动恢复的“上一条旧草稿”；直接改 textContent 会被编辑器回滚、草稿又冒回来。
  editor.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand('delete', false);
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
  // 填入长文本后，ChatGPT 等站点可能把内容转成“附件”并有上传/处理过程，
  // 这期间发送按钮是 disabled。所以要轮询等按钮真正可用再点，
  // 而不是等固定 350ms 只找一次（那一下按钮多半还是灰的）。
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const button = findEnabledSendButton(selectors);
    if (button) {
      button.click();
      return true;
    }
    await sleep(300);
  }

  // 兜底：始终没等到可用的发送按钮时，才尝试模拟 Enter
  // （多数站点只认可信按键事件，成功率低，仅作最后手段）。
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
  return false;
}

function findEnabledSendButton(selectors) {
  for (const selector of selectors || []) {
    const button = [...document.querySelectorAll(selector)].find(element => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        !element.disabled &&
        element.getAttribute('aria-disabled') !== 'true'
      );
    });
    if (button) return button;
  }
  return null;
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
