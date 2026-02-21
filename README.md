# Web Annotations

A lightweight browser extension to highlight text on regular webpages and keep annotations in browser local storage.

<details>
<summary>Screenshot</summary>
<img src="https://github.com/user-attachments/assets/4c267bf0-99e8-4be1-a885-ba72fa373477" />
</details>

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


The extension works with all Chromium-based browsers, including Google Chrome, Microsoft Edge, and Brave.
This extension is built with standard WebExtension APIs, so it may also work in Firefox and Safari.
That said, support on those browsers has not been fully validated yet.

To install the extension, follow these steps:

1. [Download this repository](https://github.com/salcc/Web-Annotations/archive/refs/heads/main.zip).
2. Extract the ZIP file to a folder on your computer.
3. Open the browser's extension management page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
   - Other: check the browser's documentation for the extension management page.
4. Enable developer mode if it is not already enabled (usually a toggle switch in the top right corner).
5. Click "Load unpacked" and select the "extension" folder inside the extracted ZIP file.

The extension should now be installed and ready to use!

Note that the extension will not automatically update when new versions are released. To update the extension, download the latest release and repeat the installation steps. You can watch the GitHub repository to receive notifications of new releases.

> [!CAUTION]
> Annotations may be lost when updating or reloading the extension. Export them in settings beforehand, then import them afterward to prevent data loss.


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

## Support & Contributions

For bug reports and feature suggestions, please open an issue on GitHub. Feel free to also submit pull requests that enhance the extension.
