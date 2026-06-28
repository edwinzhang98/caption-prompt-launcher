# Caption Prompt Launcher

A local-first Chrome extension for capturing video captions, reading them in a sidebar, and sending the transcript to AI chat tools with reusable prompt templates.

The extension currently focuses on YouTube and Bilibili videos. It does not use a backend server, cloud transcription, or paid AI APIs for caption extraction.

## Features

- Captures captions from YouTube and Bilibili video pages.
- Shows a vCaptions-style embedded sidebar on supported video pages.
- Supports two transcript views:
  - `CC`: caption lines with timestamps.
  - `TS`: cleaner paragraph-style text generated locally with rule-based merging and punctuation.
- Click any caption line or TS sentence to jump to that point in the video.
- Highlights the currently playing caption and provides a `Back to Current` button after manual scrolling.
- Copies or downloads captions as `TXT`, `Markdown`, `SRT`, `WebVTT`, or `JSON`.
- Saves multiple prompt templates locally.
- Sends the current TS transcript to:
  - Google AI Studio
  - Gemini
  - NotebookLM
  - ChatGPT
  - Claude
  - Grok

## How It Works

Caption Prompt Launcher runs entirely in the browser.

For YouTube, it monitors caption-related network responses and player caption tracks. For Bilibili, it queries the official player subtitle endpoints using the current page session. Captured captions are stored in Chrome session storage for the current tab, then rendered in the sidebar.

The `TS` view is generated locally with deterministic rules. It does not call NLTK, an LLM, or any remote summarization service.

Prompt launching uses a one-time task ID in the destination URL hash. The target AI page claims that task from local extension storage and fills the input box with the prepared text. This avoids relying on whatever happens to be in the clipboard.

## Installation

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Refresh any already-open YouTube or Bilibili video tabs.

## Usage

1. Open a supported YouTube or Bilibili video page.
2. The caption sidebar appears automatically when captions are detected.
3. Choose a caption track if multiple languages are available.
4. Use `CC` for timestamped caption lines or `TS` for cleaner paragraph text.
5. Use `Copy`, `Download`, or open the `Prompt` tab to send the transcript to an AI tool.

Clicking the extension icon toggles the sidebar on supported video pages.

## Supported Sites

Caption extraction and sidebar:

- YouTube video pages
- Bilibili video pages

Prompt destination pages:

- Google AI Studio
- Gemini
- NotebookLM
- ChatGPT
- Claude
- Grok

The sidebar is intentionally not injected into AI chat websites.

## Privacy

- Captions and prompt templates are stored locally in Chrome extension storage.
- The extension does not run a backend server.
- Captions are only sent to the AI website you choose.
- NotebookLM mode copies the transcript and opens NotebookLM, because NotebookLM expects sources rather than a normal chat prompt.

## Development

Run the lightweight checks:

```bash
node --check shared.js transcript-utils.js sidebar.js popup.js content.js background.js extractor.js tests/caption-parsers.test.js
node tests/caption-parsers.test.js
```

Main files:

- `manifest.json`: Chrome extension manifest.
- `extractor.js`: caption discovery and capture.
- `sidebar.js`: embedded caption sidebar UI.
- `content.js`: text insertion on AI destination pages.
- `background.js`: task routing, caption cache, downloads, and tab actions.
- `shared.js`: shared prompt/target/launch helpers.
- `transcript-utils.js`: caption formatting, TS generation, and download payloads.
- `caption-parsers.js`: caption parser utilities.

For more implementation notes from the early development process, see [`DEVELOPMENT_NOTES.md`](DEVELOPMENT_NOTES.md).

## Limitations

- It does not include vCaptions features such as translation, chapters, cloud ASR, or AI summaries.
- Some Bilibili captions require login; requests use the current browser session.
- Sites that render captions only through canvas, DRM overlays, or custom live DOM without caption files may not be capturable.
- AI websites often change their input box DOM, so destination filling rules may need updates.
- Auto-send is experimental because each AI website handles synthetic keyboard events differently.
- The extension currently opens a new AI tab instead of reusing an existing one.

## Name Ideas

The current working name is **Caption Prompt Launcher**. Other possible names:

- **CaptionBridge**: short, product-like, emphasizes moving captions into AI tools.
- **SubPrompt**: compact and memorable, but a little less explicit.
- **Transcript Bridge**: clear and professional, broader than captions.
- **Caption Courier**: friendly, emphasizes delivery.
- **Prompt Captions**: plain and searchable.

I currently lean toward **CaptionBridge** if you want a cleaner GitHub/product name, and **Caption Prompt Launcher** if you want the name to explain the function immediately.
