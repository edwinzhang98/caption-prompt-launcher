(() => {
  'use strict';

  const DEFAULT_PROMPT =
    '请根据下面的视频字幕回答我的问题。请忽略少量字幕识别错误，回答时尽量保留重要时间戳，并使用中文。';
  const DEFAULT_TEMPLATE_NAME = '通用字幕问答';
  const LAUNCH_HASH_KEY = 'caption-prompt-task';

  const TARGETS = {
    aistudio: {
      id: 'aistudio',
      label: 'AI Studio',
      longLabel: 'Google AI Studio',
      url: 'https://aistudio.google.com/prompts/new_chat'
    },
    gemini: {
      id: 'gemini',
      label: 'Gemini',
      url: 'https://gemini.google.com/app'
    },
    notebooklm: {
      id: 'notebooklm',
      label: 'NotebookLM',
      url: 'https://notebooklm.google.com/',
      sourceOnly: true
    },
    chatgpt: {
      id: 'chatgpt',
      label: 'ChatGPT',
      url: 'https://chatgpt.com/'
    },
    claude: {
      id: 'claude',
      label: 'Claude',
      url: 'https://claude.ai/new'
    },
    grok: {
      id: 'grok',
      label: 'Grok',
      url: 'https://grok.com/'
    }
  };

  function composeText(prompt, captions, position = 'before') {
    const trimmedPrompt = String(prompt || '').trim();
    const trimmedCaptions = String(captions || '').trim();
    if (!trimmedPrompt) return trimmedCaptions;
    return position === 'after'
      ? `${trimmedCaptions}\n\n---\n\n${trimmedPrompt}`
      : `${trimmedPrompt}\n\n---\n\n字幕内容：\n${trimmedCaptions}`;
  }

  function withLaunchHash(url, launchId) {
    const next = new URL(url);
    const hash = new URLSearchParams(next.hash.replace(/^#/, ''));
    hash.set(LAUNCH_HASH_KEY, launchId);
    next.hash = hash.toString();
    return next.href;
  }

  function launchIdFromHash(hashValue = location.hash) {
    const hash = new URLSearchParams(String(hashValue || '').replace(/^#/, ''));
    return hash.get(LAUNCH_HASH_KEY) || '';
  }

  function textFingerprint(text) {
    let hash = 0;
    const value = String(text || '');
    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function isExtensionContextError(error) {
    return /extension context invalidated/i.test(String(error?.message || error));
  }

  globalThis.CaptionPromptShared = {
    DEFAULT_PROMPT,
    DEFAULT_TEMPLATE_NAME,
    LAUNCH_HASH_KEY,
    TARGETS,
    composeText,
    isExtensionContextError,
    launchIdFromHash,
    textFingerprint,
    withLaunchHash
  };
})();
