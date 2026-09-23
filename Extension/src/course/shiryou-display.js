// course/shiryou-display.js
// Material display-mode switching and compact section labels.

// ============================================================
// Shiryou (資料) Page UI Enhancement
// ============================================================

const UX_SHIRYOU_DISPLAY_MODE_EXTENSION = "extension";
var UX_SHIRYOU_DISPLAY_MODE_ORIGIN = "origin";
const UX_SHIRYOU_DISPLAY_SESSION_KEY_PREFIX =
  "webclass_ux_shiryou_display_mode";
const UX_SHIRYOU_DISPLAY_MODE_REQUEST = "UX_SHIRYOU_DISPLAY_MODE_REQUEST";
const UX_SHIRYOU_VISUAL_REINIT_MESSAGE = "UX_SHIRYOU_VISUAL_REINIT";
const UX_SHIRYOU_ORIGIN_TOGGLE_ID = "ux-shiryou-origin-toggle";
const UX_SHIRYOU_ORIGINAL_COLS_FALLBACK_ATTR =
  "data-ux-shiryou-original-cols-fallback";
const UX_SHIRYOU_ORIGIN_FALLBACK_COLS = "230,*";

function normalizeShiryouDisplayMode(mode) {
  return mode === UX_SHIRYOU_DISPLAY_MODE_ORIGIN
    ? UX_SHIRYOU_DISPLAY_MODE_ORIGIN
    : UX_SHIRYOU_DISPLAY_MODE_EXTENSION;
}

function getShiryouRootDocument(fallbackDoc = document) {
  try {
    if (window.top?.document?.querySelector("frameset")) {
      return window.top.document;
    }
  } catch {}

  try {
    if (window.parent?.document?.querySelector("frameset")) {
      return window.parent.document;
    }
  } catch {}

  return fallbackDoc || document;
}

function getShiryouDisplayContentId(doc = document) {
  const urls = [];
  const addUrl = (rawUrl) => {
    if (typeof rawUrl === "string" && rawUrl) urls.push(rawUrl);
  };

  try {
    addUrl(doc.location?.href);
  } catch {}

  try {
    const rootDoc = getShiryouRootDocument(doc);
    if (rootDoc && rootDoc !== doc) addUrl(rootDoc.location?.href);
    rootDoc?.querySelectorAll?.("frame, iframe").forEach((frame) => {
      addUrl(frame.getAttribute("src") || frame.src || "");
    });
  } catch {}

  try {
    doc.querySelectorAll?.("frame, iframe").forEach((frame) => {
      addUrl(frame.getAttribute("src") || frame.src || "");
    });
  } catch {}

  for (const rawUrl of urls) {
    try {
      const parsed = new URL(rawUrl, window.location.href);
      const contentId =
        parsed.searchParams.get("set_contents_id") ||
        parsed.searchParams.get("contents_id") ||
        parsed.searchParams.get("id");
      if (contentId) return contentId;
    } catch {}
  }

  return "current";
}

function getShiryouDisplaySessionKey(doc = document) {
  return `${UX_SHIRYOU_DISPLAY_SESSION_KEY_PREFIX}:${getShiryouDisplayContentId(doc)}`;
}

function getShiryouSessionStorage() {
  try {
    return window.top?.sessionStorage || sessionStorage;
  } catch {
    return sessionStorage;
  }
}

function readShiryouDisplayMode(doc = document) {
  try {
    const rootDoc = getShiryouRootDocument(doc);
    const datasetMode = rootDoc?.documentElement?.dataset?.uxShiryouDisplayMode;
    if (datasetMode === UX_SHIRYOU_DISPLAY_MODE_ORIGIN) {
      return UX_SHIRYOU_DISPLAY_MODE_ORIGIN;
    }
  } catch {}

  try {
    const stored = getShiryouSessionStorage().getItem(
      getShiryouDisplaySessionKey(doc),
    );
    if (stored === UX_SHIRYOU_DISPLAY_MODE_ORIGIN) {
      return UX_SHIRYOU_DISPLAY_MODE_ORIGIN;
    }
  } catch {}

  return UX_SHIRYOU_DISPLAY_MODE_EXTENSION;
}

function saveShiryouDisplayMode(mode, doc = document) {
  const normalizedMode = normalizeShiryouDisplayMode(mode);
  try {
    const storage = getShiryouSessionStorage();
    const key = getShiryouDisplaySessionKey(doc);
    if (normalizedMode === UX_SHIRYOU_DISPLAY_MODE_ORIGIN) {
      storage.setItem(key, UX_SHIRYOU_DISPLAY_MODE_ORIGIN);
    } else {
      storage.removeItem(key);
    }
  } catch {}
}

function isShiryouOriginDisplayActive(doc = document) {
  return readShiryouDisplayMode(doc) === UX_SHIRYOU_DISPLAY_MODE_ORIGIN;
}

function syncShiryouDisplayModeClass(
  doc = document,
  mode = UX_SHIRYOU_DISPLAY_MODE_EXTENSION,
) {
  const normalizedMode = normalizeShiryouDisplayMode(mode);
  try {
    doc.documentElement.dataset.uxShiryouDisplayMode = normalizedMode;
    doc.documentElement.dataset.webclassUxCourseVisualMode =
      normalizedMode === UX_SHIRYOU_DISPLAY_MODE_ORIGIN ? "origin" : "modern";
  } catch {}
}

function isShiryouClosedCols(cols) {
  const first = String(cols || "")
    .split(",")[0]
    ?.trim();
  if (!first) return false;
  if (first === "0" || first === "0px" || first === "0%") return true;
  const parsed = parseFloat(first);
  return Number.isFinite(parsed) && parsed <= 0;
}

function rememberShiryouOriginalColsFallback(frameset) {
  if (!frameset || !frameset.hasAttribute("cols")) return;
  if (frameset.hasAttribute(UX_SHIRYOU_ORIGINAL_COLS_FALLBACK_ATTR)) return;

  const cols = frameset.getAttribute("cols") || "";
  if (!cols || isShiryouClosedCols(cols)) return;
  frameset.setAttribute(UX_SHIRYOU_ORIGINAL_COLS_FALLBACK_ATTR, cols);
}

function getShiryouOriginColsFallback(frameset) {
  if (!frameset) return UX_SHIRYOU_ORIGIN_FALLBACK_COLS;

  const capturedCols = frameset.getAttribute("data-ux-original-cols");
  if (
    capturedCols &&
    capturedCols !== UX_ORIGINAL_ATTR_MISSING &&
    !isShiryouClosedCols(capturedCols)
  ) {
    return capturedCols;
  }

  const fallbackCols = frameset.getAttribute(
    UX_SHIRYOU_ORIGINAL_COLS_FALLBACK_ATTR,
  );
  if (fallbackCols && !isShiryouClosedCols(fallbackCols)) {
    return fallbackCols;
  }

  return UX_SHIRYOU_ORIGIN_FALLBACK_COLS;
}

function getShiryouChapterFrameset(doc = document) {
  try {
    return (
      Array.from(doc.querySelectorAll("frameset[cols]")).find((frameset) => {
        return !!frameset.querySelector(
          'frame[name="webclass_chapter"], iframe[name="webclass_chapter"]',
        );
      }) || doc.querySelector("frameset[cols]")
    );
  } catch {
    return null;
  }
}

function restoreUxShiryouOriginalFrameStructure(doc = document) {
  restoreUxOriginalFrameStructure(doc);

  const chapterFrameset = getShiryouChapterFrameset(doc);
  if (chapterFrameset && isShiryouClosedCols(chapterFrameset.getAttribute("cols"))) {
    chapterFrameset.setAttribute(
      "cols",
      getShiryouOriginColsFallback(chapterFrameset),
    );
  }
}

function scheduleShiryouOriginFrameRestore(doc = document) {
  [0, 80, 350, 900, 6000].forEach((delay) => {
    setTimeout(() => {
      if (!isShiryouOriginDisplayActive(doc)) return;
      restoreUxShiryouOriginalFrameStructure(doc);
    }, delay);
  });
}

function createShiryouDisplayModeIcon(doc, mode) {
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  const add = (tagName, attrs) => {
    const element = doc.createElementNS("http://www.w3.org/2000/svg", tagName);
    Object.entries(attrs).forEach(([name, value]) =>
      element.setAttribute(name, value),
    );
    svg.appendChild(element);
  };

  if (mode === UX_SHIRYOU_DISPLAY_MODE_ORIGIN) {
    add("path", { d: "M3 7v6h6" });
    add("path", { d: "M21 17a9 9 0 0 0-15-6.7L3 13" });
    return svg;
  }

  add("rect", { x: "4", y: "5", width: "16", height: "14", rx: "2" });
  add("path", { d: "M8 9h8" });
  add("path", { d: "M8 13h5" });
  add("path", { d: "M17 3v4" });
  add("path", { d: "M19 5h-4" });
  return svg;
}

function styleShiryouHeaderIconButton(button) {
  button.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 8px;
        margin-right: 0;
        border: 1px solid var(--ux-color-border);
        border-radius: var(--ux-radius-sm);
        box-sizing: border-box;
        cursor: pointer;
        background: var(--ux-color-surface);
        color: var(--ux-color-muted);
        transition: background-color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard), color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard), border-color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard);
    `;
  button.onmouseover = () => {
    button.style.background = "var(--ux-color-surface)";
    button.style.borderColor = "var(--ux-color-border-hover)";
    button.style.color = "var(--ux-color-text)";
  };
  button.onmouseout = () => {
    button.style.background = "var(--ux-color-surface)";
    button.style.borderColor = "var(--ux-color-border)";
    button.style.color = "var(--ux-color-muted)";
  };
}

function requestShiryouDisplayMode(mode) {
  try {
    window.top?.postMessage(
      {
        type: UX_SHIRYOU_DISPLAY_MODE_REQUEST,
        mode: normalizeShiryouDisplayMode(mode),
      },
      "*",
    );
  } catch {}
}

function restoreUxShiryouOriginDocument(doc = document) {
  syncShiryouDisplayModeClass(doc, UX_SHIRYOU_DISPLAY_MODE_ORIGIN);
  disconnectUxCourseObservers(doc);
  restoreUxShiryouOriginalFrameStructure(doc);
  restoreUxOriginalBodyState(doc);
  removeUxCourseInjectedElements(doc);
  restoreUxCourseHiddenSourceElements(doc);
  removeUxCourseStyleElements(doc);
}

function findShiryouOriginHeaderControl(doc = document) {
  try {
    return (
      Array.from(
        doc.querySelectorAll(
          'button, input[type="button"], input[type="submit"], a',
        ),
      ).find((element) => {
        const label = [
          element.value,
          element.textContent,
          element.title,
          element.getAttribute("aria-label"),
        ]
          .filter(Boolean)
          .join(" ");
        return /資料を閉じる|閉じる/.test(label);
      }) || null
    );
  } catch {
    return null;
  }
}

function normalizeShiryouOriginHeaderSurface(doc, headerHost) {
  if (!doc?.body) return;

  doc.documentElement.style.backgroundColor = "var(--ux-color-surface)";
  doc.body.style.backgroundColor = "var(--ux-color-surface)";

  if (!headerHost) return;

  headerHost.style.backgroundColor = "var(--ux-color-surface)";

  headerHost.querySelectorAll("table").forEach((table) => {
    table.style.backgroundColor = "var(--ux-color-surface)";
  });

  headerHost.querySelectorAll("td, th").forEach((cell) => {
    const label = cell.textContent?.replace(/\s+/g, "").trim();
    if (label === "教材") return;
    cell.style.backgroundColor = "var(--ux-color-surface)";
  });
}

function insertShiryouOriginHeaderToggle(doc, button) {
  const closeControl = findShiryouOriginHeaderControl(doc);
  const headerHost =
    doc.querySelector("#top, #WsTitle, .bgc_sub") ||
    doc.body?.firstElementChild ||
    closeControl?.parentElement ||
    doc.body;

  if (headerHost) {
    headerHost.style.display = "flex";
    headerHost.style.alignItems = "center";
    headerHost.style.width = "100%";
    headerHost.style.boxSizing = "border-box";
    button.style.marginLeft = "auto";
    button.style.marginRight = "8px";
    normalizeShiryouOriginHeaderSurface(doc, headerHost);
    headerHost.appendChild(button);
    return;
  }

  normalizeShiryouOriginHeaderSurface(doc, null);
  doc.body?.appendChild(button);
}

function ensureShiryouOriginHeaderToggle(
  targetDoc = document,
  rootDocOverride = null,
) {
  const doc = targetDoc || document;
  if (!doc?.body) return false;

  const existing = doc.getElementById(UX_SHIRYOU_ORIGIN_TOGGLE_ID);
  if (existing) return true;

  const button = doc.createElement("button");
  button.id = UX_SHIRYOU_ORIGIN_TOGGLE_ID;
  button.type = "button";
  button.appendChild(
    createShiryouDisplayModeIcon(doc, UX_SHIRYOU_DISPLAY_MODE_EXTENSION),
  );
  button.setAttribute("aria-label", "拡張表示に戻す");
  button.title = "拡張表示に戻す";
  button.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        min-width: 32px;
        padding: 7px;
        margin-left: auto;
        margin-right: 8px;
        vertical-align: middle;
        border: 1px solid var(--ux-color-border);
        border-radius: var(--ux-radius-sm);
        background: var(--ux-color-surface);
        color: var(--ux-color-text);
        cursor: pointer;
        box-sizing: border-box;
        line-height: 1;
    `;
  button.onmouseover = () => {
    button.style.background = "var(--ux-color-surface)";
    button.style.borderColor = "var(--ux-color-border-hover)";
    button.style.color = "var(--ux-color-text)";
  };
  button.onmouseout = () => {
    button.style.background = "var(--ux-color-surface)";
    button.style.borderColor = "var(--ux-color-border)";
    button.style.color = "var(--ux-color-text)";
  };
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const rootDoc = rootDocOverride || getShiryouRootDocument(doc);
    if (rootDoc === document && rootDoc.querySelector("frameset")) {
      applyShiryouExtensionDisplayMode(rootDoc, { persist: true });
      return;
    }
    requestShiryouDisplayMode(UX_SHIRYOU_DISPLAY_MODE_EXTENSION);
  });

  insertShiryouOriginHeaderToggle(doc, button);
  return true;
}

function ensureShiryouOriginHeaderToggleInFrameset(rootDoc = document) {
  const doc = rootDoc || document;
  let injected = false;

  try {
    const titleFrame =
      doc.defaultView?.frames?.["webclass_title"] ||
      doc.querySelector(
        'frame[name="webclass_title"], iframe[name="webclass_title"]',
      )?.contentWindow;
    const titleDoc = titleFrame?.document;
    if (titleDoc?.body) {
      injected = ensureShiryouOriginHeaderToggle(titleDoc, doc);
    }
  } catch {}

  if (!injected && doc.body) {
    injected = ensureShiryouOriginHeaderToggle(doc, doc);
  }

  return injected;
}

function applyShiryouOriginDisplayOnlyMode(
  rootDoc = document,
  { persist = false } = {},
) {
  const doc = rootDoc || document;
  if (persist) saveShiryouDisplayMode(UX_SHIRYOU_DISPLAY_MODE_ORIGIN, doc);

  const docs = new Set(getAccessibleUxDocuments(doc));
  docs.forEach((accessibleDoc) => restoreUxShiryouOriginDocument(accessibleDoc));

  syncShiryouDisplayModeClass(doc, UX_SHIRYOU_DISPLAY_MODE_ORIGIN);
  scheduleShiryouOriginFrameRestore(doc);
  ensureShiryouOriginHeaderToggleInFrameset(doc);

  let attempts = 0;
  const retry = () => {
    if (ensureShiryouOriginHeaderToggleInFrameset(doc)) return;
    attempts += 1;
    if (attempts < 10) setTimeout(retry, 250);
  };
  setTimeout(retry, 250);
}

function requestShiryouVisualReinit(rootDoc = document) {
  getAccessibleUxDocuments(rootDoc).forEach((doc) => {
    if (doc === rootDoc) return;
    try {
      doc.defaultView?.postMessage(
        { type: UX_SHIRYOU_VISUAL_REINIT_MESSAGE },
        "*",
      );
    } catch {}
  });
}

function applyShiryouExtensionDisplayMode(
  rootDoc = document,
  { persist = false } = {},
) {
  const doc = rootDoc || document;
  if (persist) saveShiryouDisplayMode(UX_SHIRYOU_DISPLAY_MODE_EXTENSION, doc);

  try {
    doc.__uxCourseVisualsDeactivated = false;
  } catch {}

  syncShiryouDisplayModeClass(doc, UX_SHIRYOU_DISPLAY_MODE_EXTENSION);
  enhanceShiryouFrameset();
  setTimeout(observeFrames, 500);
  requestShiryouVisualReinit(doc);
}

function bindShiryouDisplayMessageListeners() {
  if (window.__uxShiryouDisplayMessageListenersBound) return;
  window.__uxShiryouDisplayMessageListenersBound = true;

  window.addEventListener("message", (event) => {
    const data = event?.data || {};
    if (data.type === UX_SHIRYOU_DISPLAY_MODE_REQUEST) {
      const mode = normalizeShiryouDisplayMode(data.mode);
      const rootDoc = getShiryouRootDocument(document);
      if (mode === UX_SHIRYOU_DISPLAY_MODE_ORIGIN) {
        applyShiryouOriginDisplayOnlyMode(rootDoc, { persist: true });
      } else {
        applyShiryouExtensionDisplayMode(rootDoc, { persist: true });
      }
      return;
    }

    if (data.type !== UX_SHIRYOU_VISUAL_REINIT_MESSAGE) return;
    if (isShiryouOriginDisplayActive(getShiryouRootDocument(document))) return;
    try {
      document.documentElement.dataset.webclassUxCourseVisualMode = "modern";
    } catch {}
    setUxExtensionVisualEnabled(true);
    init();
  });
}

/**
 * 資料ページのUI改善を適用
 * 試験ページ(out_shiken1)の配色に合わせたリボン/テーマへ調整
 */
function enhanceShiryouPageUI() {
  if (!isUxExtensionVisualEnabled()) return;
  bindShiryouDisplayMessageListeners();
  rememberUxOriginalBodyState(document);
  rememberUxOriginalFrameStructure(document);
  if (isShiryouOriginDisplayActive(getShiryouRootDocument(document))) {
    restoreUxShiryouOriginDocument(document);
    ensureShiryouOriginHeaderToggleInFrameset(getShiryouRootDocument(document));
    return;
  }

  const url = window.location.href;

  // txtbk_frame.php (フレームセット親) の場合
  if (url.includes("txtbk_frame.php")) {
    enhanceShiryouFrameset();
    return;
  }

  // txtbk_show_chapter.php (左サイドバー) の場合
  if (url.includes("txtbk_show_chapter.php")) {
    enhanceShiryouChapterFrame();
    return;
  }

  // txtbk_show_text.php (コンテンツフレーム) の場合
  if (url.includes("txtbk_show_text.php")) {
    enhanceShiryouContentFrame();
    return;
  }

  // title_simple.php (トップリボン) の場合 - 非表示にする
  if (url.includes("title_simple.php")) {
    hideEntireFrame();
    return;
  }
}

function uxJapaneseNumberToInt(value) {
  const normalized = String(value || "").replace(/[０-９]/g, (char) =>
    String(char.charCodeAt(0) - 0xfee0),
  );
  if (/^\d+$/.test(normalized)) {
    return normalized;
  }

  const digitMap = {
    〇: 0,
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  let total = 0;
  let current = 0;
  for (const char of normalized) {
    if (char === "百") {
      total += (current || 1) * 100;
      current = 0;
    } else if (char === "十") {
      total += (current || 1) * 10;
      current = 0;
    } else if (Object.prototype.hasOwnProperty.call(digitMap, char)) {
      current = digitMap[char];
    } else {
      return normalized;
    }
  }
  return total + current > 0 ? String(total + current) : normalized;
}

function compactUxSectionLabels(root = document) {
  const sectionLabelPattern =
    /^第([0-9０-９一二三四五六七八九十百〇零]+)([節章部])$/u;
  const spans = root.querySelectorAll("span");
  spans.forEach((span) => {
    const spanText = span.textContent.trim();
    const match = spanText.match(sectionLabelPattern);
    if (!match) return;

    span.textContent = uxJapaneseNumberToInt(match[1]);
    span.classList.add("ux-section-number-badge");
    span.setAttribute("title", spanText);
    span.setAttribute("aria-label", spanText);
  });
}
