# Caption Prompt Launcher

Caption Prompt Launcher is a Chrome extension for capturing video captions and sending transcripts to AI chat tools with reusable prompt templates.

It runs locally in the browser and currently supports caption capture on YouTube and Bilibili video pages.

## Features

- Capture captions from supported video pages.
- View captions in an embedded sidebar.
- Switch between two transcript modes:
  - `CC`: timestamped caption lines.
  - `TS`: paragraph-style transcript text generated locally.
- Click a caption line or sentence to jump to the matching video timestamp.
- Highlight the currently playing caption while the video plays.
- Copy or download transcripts as `TXT`, `Markdown`, `SRT`, `WebVTT`, or `JSON`.
- Save multiple prompt templates locally.
- Send the current transcript to AI tools such as AI Studio, Gemini, ChatGPT, Claude, Grok, and NotebookLM.

## Installation

Clone the repository:

```bash
git clone https://github.com/edwinzhang98/caption-prompt-launcher.git
cd caption-prompt-launcher
```

Then load it in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Refresh any already-open supported video pages.

On macOS, you can open the Chrome extensions page from Terminal:

```bash
open -a "Google Chrome" chrome://extensions
```

Chrome does not provide a normal one-command permanent install flow for unpacked extensions. The `Load unpacked` step is still required.

If you are using an AI coding agent, you can give it this prompt:

```text
Clone https://github.com/edwinzhang98/caption-prompt-launcher.git, inspect the README, and help me load the unpacked Chrome extension locally. Do not publish, package, or modify the extension unless I explicitly ask.
```

## Usage

1. Open a supported YouTube or Bilibili video page.
2. Wait for the caption sidebar to appear.
3. Select a caption track if multiple tracks are available.
4. Use `CC` for timestamped captions or `TS` for paragraph-style transcript text.
5. Use `Copy`, `Download`, or the `Prompt` tab to send the transcript to an AI tool.

Click the extension icon to show or hide the sidebar on supported video pages.

## Supported Sites

Caption capture:

- YouTube video pages
- Bilibili video pages

Prompt destinations:

- Google AI Studio
- Gemini
- NotebookLM
- ChatGPT
- Claude
- Grok

## Privacy

- Captions and prompt templates are stored locally in Chrome extension storage.
- The extension does not run a backend server.
- Captions are only sent to the AI tool you choose.
- The `TS` transcript is generated locally with rule-based text processing.

## Development

Run syntax checks:

```bash
node --check shared.js transcript-utils.js sidebar.js popup.js content.js background.js extractor.js tests/caption-parsers.test.js
```

Run tests:

```bash
node tests/caption-parsers.test.js
```

Main files:

- `manifest.json`: Chrome extension manifest.
- `extractor.js`: caption discovery and capture.
- `sidebar.js`: embedded caption sidebar UI.
- `content.js`: text insertion on AI destination pages.
- `background.js`: task routing, caption cache, downloads, and tab actions.
- `shared.js`: shared prompt, target, and launch helpers.
- `transcript-utils.js`: transcript formatting and download payloads.
- `caption-parsers.js`: caption parser utilities.

## Limitations

- Caption availability depends on the source website exposing caption data.
- Some Bilibili captions may require the user to be logged in.
- Websites that render captions only through canvas, DRM overlays, or custom live DOM may not be capturable.
- AI destination pages may change their input box structure, so text insertion rules may need updates over time.
- Auto-send is experimental because each AI website handles synthetic input events differently.
