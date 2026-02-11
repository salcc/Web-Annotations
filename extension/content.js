(() => {
  if (window !== window.top) {
    return;
  }

  const MESSAGE_TOGGLE_PANEL = "WA_TOGGLE_PANEL";
  const MESSAGE_OPEN_OPTIONS = "WA_OPEN_OPTIONS";
  const TOOLBAR_ID = "annotation-toolbar";
  const FONT_STYLE_ID = "wa-material-icons-font-style";
  const HIGHLIGHT_BUTTON_ID = "highlight-btn";
  const ERASE_BUTTON_ID = "erase-btn";
  const ERASE_ALL_BUTTON_ID = "erase-all-btn";
  const SETTINGS_BUTTON_ID = "settings-btn";
  const HIGHLIGHT_CLASS = "web-highlight";
  const URL_CHECK_DELAY_MS = 120;
  const CONTEXT_CHARS = 40;
  const COLORS = ["yellow", "greenyellow", "cyan", "magenta", "red"];
  const EXCLUDED_SELECTOR = [
    `#${TOOLBAR_ID}`,
    "script",
    "style",
    "noscript",
    "textarea",
    "input",
    "select",
    "option"
  ].join(",");

  let toolbarVisible = false;
  let mode = "idle";
  let currentColor = COLORS[0];
  let currentUrlKey = getUrlKey();
  let annotations = [];
  let hidePopupTimeoutId = null;
  let pendingUrlCheckId = null;

  let toolbarElement = null;
  let highlightButton = null;
  let eraseButton = null;
  let eraseAllButton = null;
  let settingsButton = null;
  let colorPopup = null;

  initialize().catch((error) => {
    console.error("Web annotations failed to initialize:", error);
  });

  async function initialize() {
    injectMaterialIconFontFace();
    createToolbar();
    bindToolbarBehavior();
    bindPageEvents();
    bindRuntimeEvents();
    bindUrlChangeEvents();
    await loadAnnotationsForCurrentUrl();
    applyStoredAnnotationsToPage();
  }

  function createToolbar() {
    if (document.getElementById(TOOLBAR_ID)) {
      return;
    }

    toolbarElement = document.createElement("div");
    toolbarElement.id = TOOLBAR_ID;
    toolbarElement.style.display = "none";

    const highlightContainer = document.createElement("div");
    highlightContainer.className = "tool-container";

    highlightButton = createToolbarButton({
      id: HIGHLIGHT_BUTTON_ID,
      icon: "ink_highlighter",
      tooltip: "Highlight"
    });

    colorPopup = document.createElement("div");
    colorPopup.className = "color-popup";

    for (const color of COLORS) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "color-option";
      option.dataset.color = color;
      option.style.backgroundColor = color;
      option.setAttribute("aria-label", `Color ${color}`);
      option.addEventListener("click", (event) => {
        event.stopPropagation();
        currentColor = color;
        updateColorState();
        setMode("highlight");
      });
      colorPopup.appendChild(option);
    }

    highlightContainer.append(highlightButton, colorPopup);

    eraseButton = createToolbarButton({
      id: ERASE_BUTTON_ID,
      icon: "ink_eraser",
      tooltip: "Erase"
    });

    eraseAllButton = createToolbarButton({
      id: ERASE_ALL_BUTTON_ID,
      icon: "delete_sweep",
      tooltip: "Erase all"
    });

    settingsButton = createToolbarButton({
      id: SETTINGS_BUTTON_ID,
      icon: "settings",
      tooltip: "Settings"
    });

    toolbarElement.append(highlightContainer, eraseButton, eraseAllButton, settingsButton);
    document.documentElement.appendChild(toolbarElement);

    updateColorState();
  }

  function createToolbarButton({ id, icon, tooltip }) {
    const button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.className = "toolbar-button";
    button.dataset.tooltip = tooltip;
    const iconSpan = document.createElement("span");
    iconSpan.className = "material-symbols-outlined";
    iconSpan.textContent = icon;
    button.appendChild(iconSpan);
    return button;
  }

  function injectMaterialIconFontFace() {
    if (document.getElementById(FONT_STYLE_ID)) {
      return;
    }

    const fontUrl = chrome.runtime.getURL("MaterialSymbolsOutlined.woff2");
    const style = document.createElement("style");
    style.id = FONT_STYLE_ID;
    style.textContent = `
      @font-face {
        font-family: "Material Symbols Outlined";
        font-style: normal;
        font-weight: 400;
        src: url("${fontUrl}") format("woff2");
      }
    `;

    document.documentElement.appendChild(style);
  }

  function bindToolbarBehavior() {
    if (
      !toolbarElement ||
      !highlightButton ||
      !eraseButton ||
      !eraseAllButton ||
      !settingsButton ||
      !colorPopup
    ) {
      return;
    }

    const highlightContainer = highlightButton.parentElement;

    if (highlightContainer) {
      highlightContainer.addEventListener("mouseenter", () => {
        clearTimeout(hidePopupTimeoutId);
        colorPopup.style.display = "block";
      });

      highlightContainer.addEventListener("mouseleave", () => {
        hidePopupTimeoutId = window.setTimeout(() => {
          colorPopup.style.display = "none";
        }, 120);
      });
    }

    highlightButton.addEventListener("click", (event) => {
      event.stopPropagation();
      setMode(mode === "highlight" ? "idle" : "highlight");
    });

    eraseButton.addEventListener("click", (event) => {
      event.stopPropagation();
      setMode(mode === "erase" ? "idle" : "erase");
    });

    eraseAllButton.addEventListener("click", async (event) => {
      event.stopPropagation();

      const confirmed = confirm("Are you sure you want to erase all annotations from this page?");
      if (!confirmed) {
        return;
      }

      clearAllHighlightsFromDom();
      annotations = [];
      await persistAnnotationsForCurrentUrl();
    });

    settingsButton.addEventListener("click", (event) => {
      event.stopPropagation();
      chrome.runtime.sendMessage({ type: MESSAGE_OPEN_OPTIONS });
    });
  }

  function bindPageEvents() {
    document.addEventListener("mouseup", handleSelectionMouseUp);
    document.addEventListener("click", handleEraseClick);
    document.addEventListener("keydown", handleEscapeKey);
  }

  function bindRuntimeEvents() {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || message.type !== MESSAGE_TOGGLE_PANEL) {
        return;
      }

      toggleToolbar();
    });
  }

  function bindUrlChangeEvents() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function patchedPushState(...args) {
      const value = originalPushState.apply(this, args);
      queueUrlCheck();
      return value;
    };

    history.replaceState = function patchedReplaceState(...args) {
      const value = originalReplaceState.apply(this, args);
      queueUrlCheck();
      return value;
    };

    window.addEventListener("popstate", queueUrlCheck);
    window.addEventListener("hashchange", queueUrlCheck);
  }

  function toggleToolbar() {
    toolbarVisible = !toolbarVisible;
    if (!toolbarElement) {
      return;
    }

    toolbarElement.style.display = toolbarVisible ? "flex" : "none";

    if (toolbarVisible) {
      setMode("highlight");
      return;
    }

    setMode("idle");
    clearSelection();
  }

  function setMode(nextMode) {
    mode = nextMode;

    if (!highlightButton || !eraseButton) {
      return;
    }

    highlightButton.classList.toggle("active", mode === "highlight");
    eraseButton.classList.toggle("active", mode === "erase");

    if (!toolbarVisible || mode === "idle") {
      document.body.style.cursor = "";
      return;
    }

    document.body.style.cursor = mode === "erase" ? "pointer" : "crosshair";
  }

  function updateColorState() {
    if (!colorPopup || !highlightButton) {
      return;
    }

    for (const option of colorPopup.querySelectorAll(".color-option")) {
      option.classList.toggle("active", option.dataset.color === currentColor);
    }

    highlightButton.style.textShadow = `0 0 10px ${currentColor}`;
  }

  async function handleSelectionMouseUp(event) {
    if (!toolbarVisible || mode !== "highlight") {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (!isRangeHighlightable(range)) {
      clearSelection();
      return;
    }

    const segments = buildSegmentsFromSelectionRange(range);
    if (segments.length === 0) {
      clearSelection();
      return;
    }

    const annotation = createAnnotationFromRange(range);
    if (!annotation) {
      clearSelection();
      return;
    }

    let applied = false;
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      if (wrapSegment(segments[i], annotation)) {
        applied = true;
      }
    }

    clearSelection();

    if (!applied) {
      return;
    }

    annotations.push(annotation);
    await persistAnnotationsForCurrentUrl();
  }

  async function handleEraseClick(event) {
    if (!toolbarVisible || mode !== "erase") {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const highlightSpan = target.closest(`.${HIGHLIGHT_CLASS}`);
    if (!highlightSpan) {
      return;
    }

    const annotationId = highlightSpan.dataset.annotationId;
    if (!annotationId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    removeHighlightById(annotationId);
    annotations = annotations.filter((annotation) => annotation.id !== annotationId);
    await persistAnnotationsForCurrentUrl();
  }

  function handleEscapeKey(event) {
    if (event.key !== "Escape") {
      return;
    }

    clearSelection();
    if (toolbarVisible) {
      setMode("idle");
    }
  }

  function createAnnotationFromRange(range) {
    const selectedText = range.toString();
    if (!selectedText || !selectedText.trim()) {
      return null;
    }

    const textNodes = collectTextNodes();
    const start = getLinearOffset(range.startContainer, range.startOffset, textNodes);
    const end = getLinearOffset(range.endContainer, range.endOffset, textNodes);
    const fullText = textNodes.map((node) => node.nodeValue).join("");
    const hasValidPosition = Number.isFinite(start) && Number.isFinite(end) && end > start;
    const safeStart = hasValidPosition ? start : -1;
    const safeEnd = hasValidPosition ? end : -1;
    const prefixStart = hasValidPosition ? Math.max(0, safeStart - CONTEXT_CHARS) : 0;
    const suffixEnd = hasValidPosition ? Math.min(fullText.length, safeEnd + CONTEXT_CHARS) : 0;

    return {
      id: createAnnotationId(),
      color: currentColor,
      text: selectedText,
      position: hasValidPosition ? { start, end } : null,
      quote: {
        prefix: hasValidPosition ? fullText.slice(prefixStart, safeStart) : "",
        suffix: hasValidPosition ? fullText.slice(safeEnd, suffixEnd) : ""
      },
      createdAt: new Date().toISOString()
    };
  }

  function buildSegmentsFromSelectionRange(range) {
    const textNodes = getTextNodesIntersectingRange(range);
    const segments = [];

    for (const node of textNodes) {
      const startOffset = node === range.startContainer ? range.startOffset : 0;
      const endOffset = node === range.endContainer ? range.endOffset : node.nodeValue.length;

      if (endOffset > startOffset) {
        segments.push({
          node,
          startOffset,
          endOffset
        });
      }
    }

    return segments;
  }

  function applyAnnotationToDom(annotation) {
    const textNodes = collectTextNodes();
    const resolved = resolveAnnotationOffsets(annotation, textNodes);
    if (!resolved) {
      return false;
    }

    const segments = buildSegmentsFromOffsets(resolved.start, resolved.end, textNodes);
    if (segments.length === 0) {
      return false;
    }

    let appliedCount = 0;
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      if (wrapSegment(segments[i], annotation)) {
        appliedCount += 1;
      }
    }

    return appliedCount > 0;
  }

  function applyStoredAnnotationsToPage() {
    clearAllHighlightsFromDom();

    if (annotations.length === 0) {
      return;
    }

    const sorted = [...annotations].sort((left, right) => {
      const a = left.position && Number.isFinite(left.position.start) ? left.position.start : 0;
      const b = right.position && Number.isFinite(right.position.start) ? right.position.start : 0;
      return b - a;
    });

    for (const annotation of sorted) {
      applyAnnotationToDom(annotation);
    }
  }

  function resolveAnnotationOffsets(annotation, textNodes) {
    if (!annotation || !annotation.text) {
      return null;
    }

    if (
      annotation.position &&
      Number.isFinite(annotation.position.start) &&
      Number.isFinite(annotation.position.end)
    ) {
      const candidateText = extractTextByOffsets(
        annotation.position.start,
        annotation.position.end,
        textNodes
      );

      if (normalizeWhitespace(candidateText) === normalizeWhitespace(annotation.text)) {
        return {
          start: annotation.position.start,
          end: annotation.position.end
        };
      }
    }

    const fullText = textNodes.map((node) => node.nodeValue).join("");
    const matchStart = findTextMatchIndex(fullText, annotation.text, annotation.quote);
    if (matchStart === -1) {
      return null;
    }

    return {
      start: matchStart,
      end: matchStart + annotation.text.length
    };
  }

  function findTextMatchIndex(fullText, text, quote) {
    if (!text) {
      return -1;
    }

    let index = fullText.indexOf(text);
    if (index === -1) {
      return -1;
    }

    const prefix = quote && typeof quote.prefix === "string" ? quote.prefix : "";
    const suffix = quote && typeof quote.suffix === "string" ? quote.suffix : "";

    if (!prefix && !suffix) {
      return index;
    }

    while (index !== -1) {
      const seenPrefix = fullText.slice(Math.max(0, index - prefix.length), index);
      const seenSuffix = fullText.slice(index + text.length, index + text.length + suffix.length);

      const prefixOk = !prefix || seenPrefix.endsWith(prefix);
      const suffixOk = !suffix || seenSuffix.startsWith(suffix);

      if (prefixOk && suffixOk) {
        return index;
      }

      index = fullText.indexOf(text, index + 1);
    }

    return -1;
  }

  function buildSegmentsFromOffsets(start, end, textNodes) {
    const segments = [];
    let runningOffset = 0;

    for (const node of textNodes) {
      const length = node.nodeValue.length;
      const nodeStart = runningOffset;
      const nodeEnd = runningOffset + length;

      if (nodeEnd <= start) {
        runningOffset = nodeEnd;
        continue;
      }

      if (nodeStart >= end) {
        break;
      }

      const segmentStart = Math.max(0, start - nodeStart);
      const segmentEnd = Math.min(length, end - nodeStart);
      if (segmentEnd > segmentStart) {
        segments.push({
          node,
          startOffset: segmentStart,
          endOffset: segmentEnd
        });
      }

      runningOffset = nodeEnd;
    }

    return segments;
  }

  function getTextNodesIntersectingRange(range) {
    const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer;

    if (!root) {
      return [];
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || node.nodeValue.length === 0) {
          return NodeFilter.FILTER_REJECT;
        }

        const parentElement = node.parentElement;
        if (!parentElement || parentElement.closest(EXCLUDED_SELECTOR)) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const result = [];
    let nextNode = null;
    while ((nextNode = walker.nextNode())) {
      if (range.intersectsNode(nextNode)) {
        result.push(nextNode);
      }
    }

    return result;
  }

  function wrapSegment(segment, annotation) {
    const { node, startOffset, endOffset } = segment;
    if (!node || !node.parentNode) {
      return false;
    }

    try {
      const selected = node.splitText(startOffset);
      selected.splitText(endOffset - startOffset);

      const highlightSpan = document.createElement("span");
      highlightSpan.className = HIGHLIGHT_CLASS;
      highlightSpan.dataset.annotationId = annotation.id;
      highlightSpan.style.backgroundColor = annotation.color || currentColor;

      selected.parentNode.replaceChild(highlightSpan, selected);
      highlightSpan.appendChild(selected);
      return true;
    } catch (error) {
      console.warn("Failed to wrap highlight segment:", error);
      return false;
    }
  }

  function clearAllHighlightsFromDom() {
    const spans = Array.from(document.querySelectorAll(`.${HIGHLIGHT_CLASS}`));
    for (const span of spans) {
      unwrapHighlightSpan(span);
    }
  }

  function removeHighlightById(annotationId) {
    const spans = Array.from(document.querySelectorAll(`.${HIGHLIGHT_CLASS}`))
      .filter((span) => span.dataset.annotationId === annotationId);

    for (const span of spans) {
      unwrapHighlightSpan(span);
    }
  }

  function unwrapHighlightSpan(span) {
    const parent = span.parentNode;
    if (!parent) {
      return;
    }

    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span);
    }

    parent.removeChild(span);
    parent.normalize();
  }

  function getLinearOffset(container, offset, textNodes) {
    try {
      let total = 0;
      for (const textNode of textNodes) {
        if (container === textNode) {
          return total + Math.min(offset, textNode.nodeValue.length);
        }

        const beforeRange = document.createRange();
        beforeRange.selectNodeContents(textNode);
        const relation = beforeRange.comparePoint(container, offset);

        if (relation === 1) {
          total += textNode.nodeValue.length;
          continue;
        }

        if (relation === -1) {
          return total;
        }

        const prefix = document.createRange();
        prefix.selectNodeContents(textNode);
        try {
          prefix.setEnd(container, offset);
        } catch (_) {
          return total;
        }
        return total + prefix.toString().length;
      }

      return total;
    } catch (_) {
      return Number.NaN;
    }
  }

  function extractTextByOffsets(start, end, textNodes) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return "";
    }

    const fullText = textNodes.map((node) => node.nodeValue).join("");
    return fullText.slice(start, end);
  }

  function collectTextNodes() {
    if (!document.body) {
      return [];
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || node.nodeValue.length === 0) {
          return NodeFilter.FILTER_REJECT;
        }

        const parentElement = node.parentElement;
        if (!parentElement) {
          return NodeFilter.FILTER_REJECT;
        }

        if (parentElement.closest(EXCLUDED_SELECTOR)) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const result = [];
    let nextNode = null;
    while ((nextNode = walker.nextNode())) {
      result.push(nextNode);
    }

    return result;
  }

  function isRangeHighlightable(range) {
    if (!range || range.collapsed || !document.body.contains(range.commonAncestorContainer)) {
      return false;
    }

    const toolbar = document.getElementById(TOOLBAR_ID);
    if (!toolbar) {
      return true;
    }

    const ancestor = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentElement
      : range.commonAncestorContainer;

    if (ancestor && toolbar.contains(ancestor)) {
      return false;
    }

    try {
      if (range.intersectsNode(toolbar)) {
        return false;
      }
    } catch (_) {
      return false;
    }

    return true;
  }

  function clearSelection() {
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
  }

  function queueUrlCheck() {
    clearTimeout(pendingUrlCheckId);
    pendingUrlCheckId = window.setTimeout(async () => {
      const nextUrlKey = getUrlKey();
      if (nextUrlKey === currentUrlKey) {
        return;
      }

      currentUrlKey = nextUrlKey;
      annotations = [];
      await loadAnnotationsForCurrentUrl();
      applyStoredAnnotationsToPage();
    }, URL_CHECK_DELAY_MS);
  }

  async function loadAnnotationsForCurrentUrl() {
    try {
      const storedValue = await storageGet(currentUrlKey);
      if (!Array.isArray(storedValue)) {
        annotations = [];
        return;
      }

      annotations = storedValue.filter(isValidAnnotation).map((annotation) => ({
        id: annotation.id,
        color: annotation.color || COLORS[0],
        text: annotation.text,
        position: annotation.position
          ? {
              start: annotation.position.start,
              end: annotation.position.end
            }
          : null,
        quote: annotation.quote
          ? {
              prefix: annotation.quote.prefix || "",
              suffix: annotation.quote.suffix || ""
            }
          : { prefix: "", suffix: "" },
        createdAt: annotation.createdAt || null
      }));
    } catch (error) {
      console.error("Failed to read annotations from storage:", error);
      annotations = [];
    }
  }

  function isValidAnnotation(candidate) {
    if (!candidate || typeof candidate !== "object") {
      return false;
    }

    if (typeof candidate.id !== "string" || typeof candidate.text !== "string") {
      return false;
    }

    if (
      candidate.position &&
      (
        !Number.isFinite(candidate.position.start) ||
        !Number.isFinite(candidate.position.end) ||
        candidate.position.end <= candidate.position.start
      )
    ) {
      return false;
    }

    return true;
  }

  async function persistAnnotationsForCurrentUrl() {
    try {
      if (annotations.length === 0) {
        await storageRemove(currentUrlKey);
        return;
      }

      await storageSet(currentUrlKey, annotations);
    } catch (error) {
      console.error("Failed to persist annotations:", error);
    }
  }

  function storageGet(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        resolve(result[key]);
      });
    });
  }

  function storageSet(key, value) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        resolve();
      });
    });
  }

  function storageRemove(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove([key], () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        resolve();
      });
    });
  }

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function getUrlKey(url = location.href) {
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      return parsed.toString();
    } catch (_) {
      return url.split("#")[0];
    }
  }

  function createAnnotationId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `wa-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
})();
