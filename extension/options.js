(() => {
  const EXPORT_FORMAT = "web-annotations-export";
  const DEFAULT_COLOR = "yellow";
  const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

  /**
   * Import/export payload schema:
   * {
   *   format: "web-annotations-export",
   *   version: number,
   *   exportedAt: string,
   *   annotationsByUrl: {
   *     [cleanUrlWithoutHash]: Annotation[]
   *   }
   * }
   *
   * Annotation shape is normalized by sanitizeAnnotation().
   */

  const statUrls = document.getElementById("stat-urls");
  const statAnnotations = document.getElementById("stat-annotations");
  const urlRows = document.getElementById("url-rows");
  const statusElement = document.getElementById("status");
  const refreshButton = document.getElementById("refresh-btn");
  const exportButton = document.getElementById("export-btn");
  const importButton = document.getElementById("import-btn");
  const importFileInput = document.getElementById("import-file");
  const importJsonInput = document.getElementById("import-json");
  const importModeSelect = document.getElementById("import-mode");

  initialize().catch((error) => {
    console.error("Options page initialization failed:", error);
    setStatus("Failed to initialize options page.", "error");
  });

  async function initialize() {
    refreshButton.addEventListener("click", () => {
      refreshSummary().catch((error) => {
        console.error("Failed to refresh summary:", error);
        setStatus("Failed to refresh summary.", "error");
      });
    });

    exportButton.addEventListener("click", () => {
      runExport().catch((error) => {
        console.error("Export failed:", error);
        setStatus("Export failed.", "error");
      });
    });

    importButton.addEventListener("click", () => {
      runImport().catch((error) => {
        console.error("Import failed:", error);
        setStatus(`Import failed: ${error.message}`, "error");
      });
    });

    await refreshSummary();
  }

  async function refreshSummary() {
    const allData = await storageGetAll();
    const annotationMap = extractAnnotationMap(allData);
    const entries = Object.entries(annotationMap).sort((left, right) => {
      return right[1].length - left[1].length;
    });

    const urlCount = entries.length;
    const annotationCount = entries.reduce((sum, [, list]) => sum + list.length, 0);
    statUrls.textContent = String(urlCount);
    statAnnotations.textContent = String(annotationCount);
    renderUrlRows(entries);
  }

  function renderUrlRows(entries) {
    urlRows.textContent = "";

    if (entries.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 3;
      cell.className = "empty-row";
      cell.textContent = "No annotation data yet.";
      row.appendChild(cell);
      urlRows.appendChild(row);
      return;
    }

    for (const [url, annotations] of entries) {
      const row = document.createElement("tr");

      const urlCell = document.createElement("td");
      urlCell.className = "url-cell";
      const link = document.createElement("a");
      link.className = "url-link";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = url;
      urlCell.appendChild(link);

      const countCell = document.createElement("td");
      countCell.textContent = String(annotations.length);

      const actionsCell = document.createElement("td");
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "table-icon-btn";
      removeButton.title = "Erase all annotations for this URL";
      removeButton.setAttribute("aria-label", "Erase all annotations for this URL");
      const removeIcon = document.createElement("span");
      removeIcon.className = "icon";
      removeIcon.textContent = "delete_sweep";
      removeButton.appendChild(removeIcon);
      removeButton.addEventListener("click", () => {
        const confirmed = confirm("Erase all annotations for this URL?");
        if (!confirmed) {
          return;
        }

        removeUrlEntry(url).catch((error) => {
          console.error("Failed to remove URL entry:", error);
          setStatus("Could not remove the entry.", "error");
        });
      });
      actionsCell.appendChild(removeButton);

      row.append(urlCell, countCell, actionsCell);
      urlRows.appendChild(row);
    }
  }

  async function removeUrlEntry(urlKey) {
    await storageRemove([urlKey]);
    await refreshSummary();
    setStatus("Entry removed.", "ok");
  }

  async function runExport() {
    const allData = await storageGetAll();
    const annotationMap = extractAnnotationMap(allData);
    const payload = {
      format: EXPORT_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      annotationsByUrl: annotationMap
    };

    const json = JSON.stringify(payload, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJsonFile(`web-annotations-export-${timestamp}.json`, json);

    const urlCount = Object.keys(annotationMap).length;
    const annotationCount = Object.values(annotationMap).reduce((sum, list) => sum + list.length, 0);
    setStatus(`Exported ${annotationCount} annotation(s) across ${urlCount} URL(s).`, "ok");
  }

  async function runImport() {
    const inputText = (importJsonInput.value || "").trim();
    let jsonText = inputText;

    if (!jsonText && importFileInput.files && importFileInput.files.length > 0) {
      jsonText = await readFileAsText(importFileInput.files[0]);
    }

    if (!jsonText) {
      throw new Error("Provide a JSON file or paste JSON.");
    }

    const parsed = JSON.parse(jsonText);
    const incoming = parseImportPayload(parsed);
    const mode = importModeSelect.value;

    if (mode !== "merge" && mode !== "replace") {
      throw new Error("Invalid import mode.");
    }

    if (mode === "replace") {
      await replaceAnnotationData(incoming);
    } else {
      await mergeAnnotationData(incoming);
    }

    importFileInput.value = "";
    importJsonInput.value = "";
    await refreshSummary();

    const urlCount = Object.keys(incoming).length;
    const annotationCount = Object.values(incoming).reduce((sum, list) => sum + list.length, 0);
    setStatus(`Imported ${annotationCount} annotation(s) across ${urlCount} URL(s).`, "ok");
  }

  function parseImportPayload(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSON must be an object.");
    }

    const candidateMap =
      parsed.format === EXPORT_FORMAT && parsed.annotationsByUrl && typeof parsed.annotationsByUrl === "object"
        ? parsed.annotationsByUrl
        : parsed;

    const normalized = normalizeImportedMap(candidateMap);
    if (Object.keys(normalized).length === 0) {
      throw new Error("No valid annotation data found.");
    }

    return normalized;
  }

  function normalizeImportedMap(rawMap) {
    const normalized = Object.create(null);

    for (const [key, value] of Object.entries(rawMap)) {
      if (!isSafeStorageKey(key) || !Array.isArray(value)) {
        continue;
      }

      const annotations = value.map(sanitizeAnnotation).filter(Boolean);
      if (annotations.length > 0) {
        normalized[key] = annotations;
      }
    }

    return normalized;
  }

  async function replaceAnnotationData(nextData) {
    const existing = extractAnnotationMap(await storageGetAll());
    const existingKeys = Object.keys(existing);

    if (existingKeys.length > 0) {
      await storageRemove(existingKeys);
    }

    if (Object.keys(nextData).length > 0) {
      await storageSet(nextData);
    }
  }

  async function mergeAnnotationData(incoming) {
    const existing = extractAnnotationMap(await storageGetAll());
    const mergedToWrite = Object.create(null);

    for (const [url, incomingList] of Object.entries(incoming)) {
      const existingList = existing[url] || [];
      mergedToWrite[url] = mergeAnnotations(existingList, incomingList);
    }

    if (Object.keys(mergedToWrite).length > 0) {
      await storageSet(mergedToWrite);
    }
  }

  function mergeAnnotations(existingList, incomingList) {
    const result = [];
    const indexByKey = new Map();

    for (const annotation of existingList) {
      const key = annotationIdentity(annotation);
      indexByKey.set(key, result.length);
      result.push(annotation);
    }

    for (const annotation of incomingList) {
      const key = annotationIdentity(annotation);
      const existingIndex = indexByKey.get(key);

      if (existingIndex === undefined) {
        indexByKey.set(key, result.length);
        result.push(annotation);
      } else {
        result[existingIndex] = annotation;
      }
    }

    return result;
  }

  function annotationIdentity(annotation) {
    if (annotation.id) {
      return `id:${annotation.id}`;
    }

    const start = annotation.position && Number.isFinite(annotation.position.start)
      ? annotation.position.start
      : -1;
    const end = annotation.position && Number.isFinite(annotation.position.end)
      ? annotation.position.end
      : -1;
    return `${annotation.text}|${start}|${end}|${annotation.createdAt || ""}`;
  }

  function sanitizeAnnotation(candidate) {
    if (!candidate || typeof candidate !== "object") {
      return null;
    }

    if (typeof candidate.text !== "string" || !candidate.text.trim()) {
      return null;
    }

    const id = typeof candidate.id === "string" && candidate.id
      ? candidate.id
      : makeFallbackId();

    const color = typeof candidate.color === "string" && candidate.color
      ? candidate.color
      : DEFAULT_COLOR;

    const position =
      candidate.position &&
      Number.isFinite(candidate.position.start) &&
      Number.isFinite(candidate.position.end) &&
      candidate.position.end > candidate.position.start
        ? {
            start: candidate.position.start,
            end: candidate.position.end
          }
        : null;

    const quote = candidate.quote && typeof candidate.quote === "object"
      ? {
          prefix: typeof candidate.quote.prefix === "string" ? candidate.quote.prefix : "",
          suffix: typeof candidate.quote.suffix === "string" ? candidate.quote.suffix : ""
        }
      : { prefix: "", suffix: "" };

    return {
      id,
      color,
      text: candidate.text,
      comment: typeof candidate.comment === "string" ? candidate.comment : "",
      position,
      quote,
      createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : null
    };
  }

  function extractAnnotationMap(storageData) {
    const map = Object.create(null);

    for (const [key, value] of Object.entries(storageData)) {
      if (!isSafeStorageKey(key) || !Array.isArray(value)) {
        continue;
      }

      const sanitized = value.map(sanitizeAnnotation).filter(Boolean);
      if (sanitized.length > 0) {
        map[key] = sanitized;
      }
    }

    return map;
  }

  function isSafeStorageKey(key) {
    return typeof key === "string" && key.length > 0 && !BLOCKED_KEYS.has(key);
  }

  function makeFallbackId() {
    return `imp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsText(file);
    });
  }

  function downloadJsonFile(filename, contents) {
    const blob = new Blob([contents], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function storageGetAll() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(null, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        resolve(result);
      });
    });
  }

  function storageSet(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        resolve();
      });
    });
  }

  function storageRemove(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        resolve();
      });
    });
  }

  function setStatus(message, type) {
    statusElement.textContent = message;
    statusElement.classList.remove("ok", "error");

    if (type) {
      statusElement.classList.add(type);
    }
  }
})();
