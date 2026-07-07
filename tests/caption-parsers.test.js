'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {
  cuesToText,
  parseVttOrSrt,
  parseYouTube
} = require('../caption-parsers.js');

async function main() {
const youtube = parseYouTube(JSON.stringify({
  events: [
    {
      tStartMs: 1250,
      dDurationMs: 2100,
      segs: [{ utf8: 'Hello ' }, { utf8: 'world' }]
    },
    {
      tStartMs: 4000,
      dDurationMs: 1000,
      segs: [{ utf8: '\n' }]
    }
  ]
}));
assert.deepEqual(youtube, [{
  startMs: 1250,
  endMs: 3350,
  text: 'Hello world'
}]);

const vtt = parseVttOrSrt(`WEBVTT

00:00:01.000 --> 00:00:03.500
First <b>line</b>

00:01:02.250 --> 00:01:04.000
Second &amp; final
`);
assert.equal(vtt.length, 2);
assert.equal(vtt[0].text, 'First line');
assert.equal(vtt[1].startMs, 62250);
assert.equal(cuesToText(vtt), '[00:01] First line\n[01:02] Second & final');

const srt = parseVttOrSrt(`1
00:00:00,500 --> 00:00:01,500
你好
`);
assert.equal(srt[0].startMs, 500);
assert.equal(srt[0].text, '你好');

const xml = parseYouTube(
  '<transcript><text start="1.5" dur="2">A &amp; B</text></transcript>'
);
assert.deepEqual(xml, [{
  startMs: 1500,
  endMs: 3500,
  text: 'A & B'
}]);

const store = new Map();
const context = {
  URL,
  Date,
  crypto: { randomUUID: () => 'task-id' },
  chrome: {
    action: { onClicked: { addListener() {} } },
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} }
    },
    tabs: {
      onRemoved: { addListener() {} },
      onUpdated: { addListener() {} },
      get: async () => ({ url: 'https://www.youtube.com/watch?v=new-video' }),
      sendMessage: async () => {},
      create: async () => ({ id: 1 })
    },
    storage: {
      session: {
        get: async key => ({ [key]: store.get(key) }),
        set: async value => Object.entries(value).forEach(([key, item]) => store.set(key, item)),
        remove: async key => store.delete(key)
      },
      local: {
        get: async key => ({ [key]: store.get(key) }),
        set: async value => Object.entries(value).forEach(([key, item]) => store.set(key, item)),
        remove: async key => store.delete(key)
      }
    }
  },
  fetch: async () => ({ ok: true, text: async () => '', json: async () => ({}) })
};
vm.createContext(context);
vm.runInContext(`${fs.readFileSync(require.resolve('../background.js'), 'utf8')}
  globalThis.__test = { captionCacheKey, filterTracksForUrl, launchTarget, claimTask };
`, context);
assert.deepEqual(context.__test.filterTracksForUrl([
  { source: 'youtube', videoId: 'old-video', text: 'old' },
  { source: 'youtube', videoId: 'new-video', text: 'new' }
], 'https://www.youtube.com/watch?v=new-video'), [
  { source: 'youtube', videoId: 'new-video', text: 'new' }
]);
const launchTabId = await context.__test.launchTarget('https://chatgpt.com/', { targetId: 'chatgpt', text: 'fresh', autoSend: false });
assert.equal(await context.__test.claimTask(undefined), null);
assert.equal(await context.__test.claimTask(999, 'chatgpt'), null);
assert.equal((await context.__test.claimTask(launchTabId, 'chatgpt')).text, 'fresh');
assert.equal(await context.__test.claimTask(launchTabId, 'chatgpt'), null);

const browserContext = {
  URL,
  URLSearchParams
};
vm.createContext(browserContext);
vm.runInContext(fs.readFileSync(require.resolve('../shared.js'), 'utf8'), browserContext);
vm.runInContext(fs.readFileSync(require.resolve('../transcript-utils.js'), 'utf8'), browserContext);

const shared = browserContext.CaptionPromptShared;
const transcript = browserContext.CaptionPromptTranscript;
assert.equal(
  shared.composeText('Prompt', 'Captions', 'before'),
  'Prompt\n\n---\n\n字幕内容：\nCaptions'
);
assert.deepEqual(
  Array.from(shared.withDefaultTemplates(), template => template.name),
  ['Summary (bullet points)', 'Summary (article)']
);
assert.deepEqual(
  Array.from(
    shared.withDefaultTemplates([{ id: 'custom', name: '自定义', prompt: 'x' }]),
    template => template.name
  ),
  ['自定义', 'Summary (bullet points)', 'Summary (article)']
);
assert.deepEqual(
  Array.from(
    shared.withDefaultTemplates([{ id: 'default-gpt-notes', name: 'GPT通用模板', prompt: 'x' }]),
    template => template.name
  ),
  ['Summary (bullet points)', 'Summary (article)']
);
assert.deepEqual(
  Array.from(
    shared.withDefaultTemplates([{ id: 'default-gpt-notes', name: 'GPT Universal Template', prompt: 'x' }]),
    template => template.name
  ),
  ['Summary (bullet points)', 'Summary (article)']
);
assert.deepEqual(
  Array.from(
    shared.withDefaultTemplates([{ id: 'default-gpt-notes', name: 'Default Template', prompt: 'x' }]),
    template => template.name
  ),
  ['Summary (bullet points)', 'Summary (article)']
);
assert.deepEqual(
  Array.from(
    shared.withDefaultTemplates([{
      id: 'default-general',
      name: '通用字幕问答',
      prompt: '请根据下面的视频字幕回答我的问题。请忽略少量字幕识别错误，回答时尽量保留重要时间戳，并使用中文。'
    }]),
    template => template.name
  ),
  ['Summary (bullet points)', 'Summary (article)']
);
assert.match(
  shared.withDefaultTemplates().find(template => template.name === 'Summary (bullet points)').prompt,
  /## 标题要求/
);
assert.match(
  shared.withDefaultTemplates().find(template => template.name === 'Summary (article)').prompt,
  /# 正文文章/
);
assert.deepEqual(Object.keys(shared.TARGETS), [
  'chatgpt',
  'claude',
  'aistudio',
  'gemini',
  'notebooklm',
  'grok'
]);
const launchUrl = shared.withLaunchHash('https://chatgpt.com/', 'launch-1');
assert.equal(shared.launchIdFromHash(new URL(launchUrl).hash), 'launch-1');

const sampleTrack = {
  pageTitle: 'Demo / Video',
  pageUrl: 'https://www.youtube.com/watch?v=demo',
  videoInfo: {
    title: 'Demo Video',
    author: 'Demo Author',
    url: 'https://www.youtube.com/watch?v=demo',
    description: 'Demo description with a guest name.'
  },
  source: 'youtube',
  videoId: 'demo',
  language: 'zh',
  label: '中文',
  cues: [
    { startMs: 1000, endMs: 2000, text: '你好' },
    { startMs: 2000, endMs: 3000, text: '世界' },
    { startMs: 5000, endMs: 6000, text: '最后一句' }
  ]
};
const transcriptCache = new WeakMap();
assert.equal(transcript.plainParagraphText(sampleTrack, transcriptCache), '你好，世界。最后一句。');
assert.match(
  transcript.transcriptPackageText(sampleTrack, { cache: transcriptCache }),
  /Video Info:\nTitle: Demo Video\nAuthor: Demo Author\nURL: https:\/\/www\.youtube\.com\/watch\?v=demo\nDescription:\nDemo description/
);
assert.match(
  shared.composeText('Prompt', transcript.transcriptPackageText(sampleTrack, {
    cache: transcriptCache
  }), 'before', { contentLabel: false }),
  /Prompt\n\n---\n\nVideo Info:/
);
assert.match(
  transcript.createDownloadPayload(sampleTrack, 'srt').content,
  /00:00:01,000 --> 00:00:02,000/
);
assert.match(
  transcript.createDownloadPayload(sampleTrack, 'md', {
    cache: transcriptCache,
    pageUrl: sampleTrack.pageUrl
  }).content,
  /## Video Info[\s\S]*Demo Author[\s\S]*## Transcript/
);

console.log('caption parser tests: ok');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
