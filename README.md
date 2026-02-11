# Web Annotations

A lightweight browser extension to highlight text on regular webpages and keep annotations in browser local storage.

Highlights are tied to each page URL, so they persist across reloads and browser restarts.

## Features
- Highlight selected text with multiple colors.
- Add a text comment to each saved highlight from the annotation list panel.
- Remove a single highlight with the Erase tool.
- Remove all highlights on the current page with Erase all.
- Show/hide the annotation toolbar from the browser action button.
- Annotation list panel to view highlights on the current page.
- Export and import annotations from a settings page.
- URL-keyed storage in `chrome.storage.local` (hash is ignored).

## Installation

Chrome / Edge / Brave:

1. Open your browser extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select: `/Users/salcc/Desktop/Web-Annotations/extension`

Firefox and Safari:

This extension is built with standard WebExtension APIs, so it may also work in Firefox and Safari.
That said, support on those browsers has not been fully validated yet.

## Usage

1. Open any webpage.
2. Click the extension icon in the browser toolbar to toggle the annotation toolbar.
3. Use **Highlight** and select text.
4. Hover the highlight button to pick a color.
5. Use **Erase** and click an existing highlight to remove it.
6. Use **Erase all** to clear annotations for the current URL.
7. Use **Annotations** to open the in-page annotation list panel.
8. In the annotation list, use **Add comment** / **Edit comment** and type directly in the inline text box.
9. Hover a highlight to see its saved comment.
10. Use **Settings** to open export/import tools.

Hiding the toolbar does not remove saved highlights.

## Export / Import

Open **Settings** from the annotation toolbar.

- **Export JSON**: downloads all saved annotation data.
- **Import JSON**:
  - Merge mode adds/replaces matching annotations while keeping existing unrelated data.
  - Replace mode clears current annotation data first, then imports the provided file.

## Data Format

Storage key:
- Cleaned page URL (fragment/hash removed), for example `https://example.com/article?id=1`

Storage value:
- Array of annotation objects containing:
  - `id`
  - `color`
  - `text`
  - `comment`
  - `position.start`
  - `position.end`
  - `quote.prefix`
  - `quote.suffix`
  - `createdAt`
