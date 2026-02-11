const TOGGLE_PANEL_MESSAGE = "WA_TOGGLE_PANEL";
const OPEN_OPTIONS_MESSAGE = "WA_OPEN_OPTIONS";

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) {
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: TOGGLE_PANEL_MESSAGE }, () => {
    // No content script runs on browser-owned pages (chrome://, Web Store, etc).
    void chrome.runtime.lastError;
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== OPEN_OPTIONS_MESSAGE) {
    return;
  }

  chrome.runtime.openOptionsPage();
});
