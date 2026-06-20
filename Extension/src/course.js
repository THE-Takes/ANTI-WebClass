// course.js
// Handles Content Pages: Download renaming for shiryou/shiken types

// uxDebugModeState, uxDebugLog, uxDebugWarn, syncUxMasterStateToPage,
// STORAGE_KEY_EXTENSION_VISUAL_ENABLED, PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED
// are declared in shared.js (loaded before this file).
// Fallbacks are provided to avoid hard failure if shared.js is not available.
var uxDebugModeState = globalThis.uxDebugModeState || { enabled: false };
globalThis.uxDebugModeState = uxDebugModeState;

var uxDebugLog =
  typeof globalThis.uxDebugLog === "function"
    ? globalThis.uxDebugLog
    : function (...args) {
        if (!uxDebugModeState.enabled) return;
        console.log(...args);
      };
if (typeof globalThis.uxDebugLog !== "function") {
  globalThis.uxDebugLog = uxDebugLog;
}

var uxDebugWarn =
  typeof globalThis.uxDebugWarn === "function"
    ? globalThis.uxDebugWarn
    : function (...args) {
        if (!uxDebugModeState.enabled) return;
        console.warn(...args);
      };
if (typeof globalThis.uxDebugWarn !== "function") {
  globalThis.uxDebugWarn = uxDebugWarn;
}

var STORAGE_KEY_EXTENSION_VISUAL_ENABLED =
  typeof globalThis.STORAGE_KEY_EXTENSION_VISUAL_ENABLED === "string"
    ? globalThis.STORAGE_KEY_EXTENSION_VISUAL_ENABLED
    : "extensionVisualEnabled";
if (typeof globalThis.STORAGE_KEY_EXTENSION_VISUAL_ENABLED !== "string") {
  globalThis.STORAGE_KEY_EXTENSION_VISUAL_ENABLED =
    STORAGE_KEY_EXTENSION_VISUAL_ENABLED;
}

var PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED =
  typeof globalThis.PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED === "string"
    ? globalThis.PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED
    : "webclass_ux_master_enabled";
if (typeof globalThis.PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED !== "string") {
  globalThis.PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED =
    PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED;
}

var syncUxMasterStateToPage =
  typeof globalThis.syncUxMasterStateToPage === "function"
    ? globalThis.syncUxMasterStateToPage
    : function (enabled) {
        const normalized = enabled ? "1" : "0";
        try {
          if (document && document.documentElement) {
            document.documentElement.dataset.webclassUxMasterEnabled =
              normalized;
          }
        } catch {
          // ignore
        }
        try {
          localStorage.setItem(
            PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED,
            normalized,
          );
        } catch {
          // ignore
        }
      };
if (typeof globalThis.syncUxMasterStateToPage !== "function") {
  globalThis.syncUxMasterStateToPage = syncUxMasterStateToPage;
}

(() => {
  try {
    chrome.storage.local.get(
      { debugModeEnabled: false, extensionVisualEnabled: true },
      (items) => {
        uxDebugModeState.enabled = !!items.debugModeEnabled;
        setUxExtensionVisualEnabled(items.extensionVisualEnabled !== false);
        if (document && document.documentElement) {
          document.documentElement.dataset.webclassUxDebugMode =
            uxDebugModeState.enabled ? "1" : "0";
        }
      },
    );
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (changes.debugModeEnabled) {
        uxDebugModeState.enabled = !!changes.debugModeEnabled.newValue;
        if (document && document.documentElement) {
          document.documentElement.dataset.webclassUxDebugMode =
            uxDebugModeState.enabled ? "1" : "0";
        }
      }
      if (changes.extensionVisualEnabled) {
        const nextEnabled = changes.extensionVisualEnabled.newValue !== false;
        const prevEnabled = isUxExtensionVisualEnabled();
        setUxExtensionVisualEnabled(nextEnabled);
        if (prevEnabled !== nextEnabled) {
          if (nextEnabled) {
            init();
          } else {
            deactivateUxCourseVisuals(document);
          }
        }
      }
      if (changes[MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_KEY]) {
        materialDownloadFilenameSeparator =
          normalizeMaterialDownloadFilenameSeparator(
            changes[MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_KEY].newValue,
          );
      }
      if (changes[CUSTOM_USER_ICON_KEY]) {
        setCustomUserIconDataUrl(changes[CUSTOM_USER_ICON_KEY].newValue);
        if (isUxExtensionVisualEnabled()) {
          scheduleCustomUserIconApply(document);
        } else {
          restoreCourseUserIcon(document);
        }
      }
    });
  } catch {
    uxDebugModeState.enabled = false;
  }
})();

let uxExtensionVisualEnabled = true;

function setUxExtensionVisualEnabled(enabled) {
  uxExtensionVisualEnabled = !!enabled;
  syncUxMasterStateToPage(uxExtensionVisualEnabled);
  if (uxExtensionVisualEnabled) {
    try {
      const topDoc = window.top?.document || document;
      topDoc.__uxCourseVisualsDeactivated = false;
    } catch {
      // ignore
    }
  }
}

function isUxExtensionVisualEnabled() {
  return !!uxExtensionVisualEnabled;
}

function isUxDomNode(value) {
  return (
    !!value && typeof value === "object" && typeof value.nodeType === "number"
  );
}

function safeObserveUxMutation(observer, target, options) {
  try {
    if (
      !observer ||
      typeof observer.observe !== "function" ||
      !isUxDomNode(target)
    ) {
      return false;
    }
    observer.observe(target, options);
    return true;
  } catch (error) {
    uxDebugWarn(
      "[WebClass UX] MutationObserver skipped:",
      error?.message || error,
    );
    return false;
  }
}

const UX_ORIGINAL_ATTR_MISSING = "__webclass_ux_missing__";
const UX_COURSE_VISUAL_STYLE_ID_PATTERN =
  /^ux-(?:course|shiken|onebyone|toc|loadit|hidden|video|download|shiryou|ribbon)/;
const UX_COURSE_RESTORABLE_ATTRS = [
  "rows",
  "cols",
  "border",
  "frameborder",
  "framespacing",
  "scrolling",
  "noresize",
  "style",
];
const UX_COURSE_RESTORABLE_SELECTOR = "frameset, frame, iframe";

function rememberUxOriginalAttribute(element, attrName) {
  if (!element || !attrName) return;
  const dataAttr = `data-ux-original-${attrName}`;
  if (element.hasAttribute(dataAttr)) return;

  element.setAttribute(
    dataAttr,
    element.hasAttribute(attrName)
      ? element.getAttribute(attrName) || ""
      : UX_ORIGINAL_ATTR_MISSING,
  );
}

function rememberUxOriginalAttributes(
  element,
  attrNames = UX_COURSE_RESTORABLE_ATTRS,
) {
  if (!element || typeof element.setAttribute !== "function") return;
  element.setAttribute("data-ux-original-state-captured", "true");
  attrNames.forEach((attrName) =>
    rememberUxOriginalAttribute(element, attrName),
  );
}

function rememberUxOriginalFrameStructure(doc = document) {
  try {
    doc.querySelectorAll(UX_COURSE_RESTORABLE_SELECTOR).forEach((element) => {
      rememberUxOriginalAttributes(element);
    });
  } catch {
    // ignore inaccessible documents
  }
}

function restoreUxOriginalAttributes(
  element,
  attrNames = UX_COURSE_RESTORABLE_ATTRS,
) {
  if (!element || typeof element.getAttribute !== "function") return;
  attrNames.forEach((attrName) => {
    const dataAttr = `data-ux-original-${attrName}`;
    if (!element.hasAttribute(dataAttr)) return;

    const originalValue = element.getAttribute(dataAttr);
    if (originalValue === UX_ORIGINAL_ATTR_MISSING) {
      element.removeAttribute(attrName);
    } else {
      element.setAttribute(attrName, originalValue || "");
    }
  });
}

function restoreUxOriginalFrameStructure(doc = document) {
  try {
    doc
      .querySelectorAll(
        `${UX_COURSE_RESTORABLE_SELECTOR}[data-ux-original-state-captured]`,
      )
      .forEach((element) => {
        restoreUxOriginalAttributes(element);
      });
  } catch {
    // ignore inaccessible documents
  }
}

function captureUxElementAttributes(
  element,
  attrNames = UX_COURSE_RESTORABLE_ATTRS,
) {
  if (!element) return null;
  const attrs = {};
  attrNames.forEach((attrName) => {
    attrs[attrName] = element.hasAttribute(attrName)
      ? element.getAttribute(attrName) || ""
      : UX_ORIGINAL_ATTR_MISSING;
  });
  return attrs;
}

function applyUxElementAttributes(element, attrs) {
  if (!element || !attrs) return;
  Object.entries(attrs).forEach(([attrName, value]) => {
    if (value === UX_ORIGINAL_ATTR_MISSING) {
      element.removeAttribute(attrName);
    } else {
      element.setAttribute(attrName, value || "");
    }
  });
}

function rememberUxOriginalShikenFrameStructure(doc = document) {
  try {
    if (!doc || doc.__uxOriginalShikenFrameStructureCaptured) return;

    const structure = getShikenFramesetStructure(doc);
    if (!structure.mainFrameset) return;

    const splitFrameset = structure.contentRows || structure.contentCols;
    doc.__uxOriginalShikenFrameStructureCaptured = true;
    doc.__uxOriginalShikenFrameStructure = {
      hadSplitFrameset: !!splitFrameset,
      splitAttrName: structure.contentCols ? "cols" : "rows",
      outerAttrs: captureUxElementAttributes(structure.outerFrameset),
      mainAttrs: captureUxElementAttributes(structure.mainFrameset),
      splitAttrs: captureUxElementAttributes(splitFrameset),
      buttonAttrs: captureUxElementAttributes(structure.buttonFrame),
      questionAttrs: captureUxElementAttributes(structure.questionFrame),
      answerAttrs: captureUxElementAttributes(structure.answerFrame),
    };
  } catch {
    // ignore partially loaded framesets
  }
}

function restoreUxOriginalShikenFrameStructure(doc = document) {
  const original = doc?.__uxOriginalShikenFrameStructure;
  if (!original) return false;

  let structure = getShikenFramesetStructure(doc);
  if (!structure.mainFrameset) return false;

  let {
    mainFrameset,
    contentRows,
    contentCols,
    buttonFrame,
    questionFrame,
    answerFrame,
    directQuestionFrame,
    directAnswerFrame,
  } = structure;

  let splitFrameset = contentRows || contentCols;

  if (original.hadSplitFrameset) {
    if (!splitFrameset && questionFrame && answerFrame) {
      splitFrameset = doc.createElement("frameset");
      const insertionPoint = directQuestionFrame || questionFrame;
      mainFrameset.insertBefore(splitFrameset, insertionPoint);
      splitFrameset.appendChild(questionFrame);
      splitFrameset.appendChild(answerFrame);
    }
  } else if (splitFrameset && questionFrame && answerFrame) {
    flattenShikenContentFrames(
      mainFrameset,
      splitFrameset,
      questionFrame,
      answerFrame,
    );
    splitFrameset = null;
  }

  structure = getShikenFramesetStructure(doc);
  applyUxElementAttributes(structure.outerFrameset, original.outerAttrs);
  applyUxElementAttributes(structure.mainFrameset, original.mainAttrs);
  applyUxElementAttributes(
    structure.contentRows || structure.contentCols || splitFrameset,
    original.splitAttrs,
  );
  applyUxElementAttributes(
    structure.buttonFrame || buttonFrame,
    original.buttonAttrs,
  );
  applyUxElementAttributes(
    structure.questionFrame || questionFrame,
    original.questionAttrs,
  );
  applyUxElementAttributes(
    structure.answerFrame || answerFrame,
    original.answerAttrs,
  );

  return true;
}

function rememberUxOriginalBodyState(doc = document) {
  try {
    if (!doc?.body || doc.__uxOriginalBodyStateCaptured) return;
    doc.__uxOriginalBodyStateCaptured = true;
    doc.__uxOriginalBodyState = {
      html: doc.body.innerHTML,
      style: doc.body.getAttribute("style"),
      className: doc.body.getAttribute("class"),
    };
  } catch {
    // ignore inaccessible documents
  }
}

function restoreUxOriginalBodyState(doc = document) {
  try {
    if (
      !doc?.body ||
      !doc.__uxOriginalBodyStateCaptured ||
      !doc.__uxOriginalBodyState
    )
      return;
    const { html, style, className } = doc.__uxOriginalBodyState;
    doc.body.innerHTML = html || "";
    if (style === null || style === undefined) {
      doc.body.removeAttribute("style");
    } else {
      doc.body.setAttribute("style", style);
    }
    if (className === null || className === undefined) {
      doc.body.removeAttribute("class");
    } else {
      doc.body.setAttribute("class", className);
    }
  } catch {
    // ignore inaccessible documents
  }
}

function markUxCourseStyle(style) {
  if (style && style.dataset) {
    style.dataset.webclassUxCourseStyle = "true";
  }
  return style;
}

function getAccessibleUxDocuments(rootDoc = document) {
  const docs = [];
  const seen = new Set();

  const addDoc = (doc) => {
    if (!doc || seen.has(doc)) return;
    seen.add(doc);
    docs.push(doc);

    try {
      const frameWindows = doc.defaultView?.frames || [];
      for (let i = 0; i < frameWindows.length; i += 1) {
        try {
          addDoc(frameWindows[i]?.document);
        } catch {
          // ignore inaccessible child frame
        }
      }
    } catch {
      // ignore
    }

    try {
      doc.querySelectorAll("frame, iframe").forEach((frame) => {
        try {
          addDoc(frame.contentDocument || frame.contentWindow?.document);
        } catch {
          // ignore inaccessible frame element
        }
      });
    } catch {
      // ignore
    }
  };

  addDoc(rootDoc);
  try {
    addDoc(window.top?.document);
  } catch {}
  try {
    addDoc(window.parent?.document);
  } catch {}

  return docs;
}

function unwrapUxElement(element) {
  if (!element || !element.parentNode) return;
  while (element.firstChild) {
    element.parentNode.insertBefore(element.firstChild, element);
  }
  element.remove();
}

function removeUxCourseInjectedElements(doc = document) {
  const removeSelectors = [
    "#ux-shiken-layout-toggle",
    "#ux-shiken-inline-toc",
    "#ux-shiken-header",
    "#ux-shiryou-header",
    "#ux-shiryou-origin-toggle",
    "#ux-toc-overlay-iframe",
    "#ux-toc-resize-handle",
    "#ux-toc-resize-shield",
    "#ux-toc-hover-zone",
    "#ux-content-loading-overlay",
    "#ux-ribbon-expand-btn",
    "#ux-toc-heading",
    ".ux-inline-download-options",
    ".ux-download-group",
    'frame[data-ux-created-question-frame="true"]',
    ".ux-onebyone-choice-list",
    ".ux-onebyone-result-block",
    ".ux-shiken-nav-row",
    ".ux-shiken-action-row",
    ".ux-shiken-answer-save-check",
  ];

  try {
    removeSelectors.forEach((selector) => {
      doc.querySelectorAll(selector).forEach((element) => element.remove());
    });

    [
      ".ux-onebyone-question-card",
      ".ux-onebyone-description-card",
      ".ux-shiken-question-card",
      ".ux-onebyone-answer-actions",
    ].forEach((selector) => {
      doc.querySelectorAll(selector).forEach(unwrapUxElement);
    });
  } catch {
    // ignore inaccessible or partially loaded documents
  }
}

function removeUxCourseStyleElements(doc = document) {
  try {
    doc.querySelectorAll("style").forEach((style) => {
      const styleId = style.id || "";
      if (
        style.dataset?.webclassUxCourseStyle === "true" ||
        UX_COURSE_VISUAL_STYLE_ID_PATTERN.test(styleId)
      ) {
        style.remove();
      }
    });
  } catch {
    // ignore inaccessible documents
  }
}

function restoreUxCourseHiddenSourceElements(doc = document) {
  const sourceClasses = [
    "ux-source-options-hidden",
    "ux-source-result-hidden",
    "ux-source-action-hidden",
    "ux-choice-row",
    "ux-choice-shadow-row",
    "ux-onebyone-answer-root",
    "ux-shiken-resizable-frame-card",
    "ux-shiken-frame-resizing",
    "ux-video-frame-fullscreen-active",
    "ux-video-fullscreen-root",
    "ux-video-fullscreen-target",
    "ux-course-list-button-hidden",
  ];

  try {
    sourceClasses.forEach((className) => {
      doc
        .querySelectorAll(`.${className}`)
        .forEach((element) => element.classList.remove(className));
    });

    doc
      .querySelectorAll(
        [
          "#TOC",
          "#TOCContent",
          "#naviLayout",
          "#WsTitle",
          "#User",
          "hr",
          'a[href*="file_down.php"]',
          'input[name="quit"]',
          'input[value="資料を閉じる"]',
          'input[name="hide_content"]',
          'input[value="目次を隠す"]',
          'input[value="目次を表示"]',
          "#PrevButton",
          "#NextButton",
          'button[onclick*="prevPage"]',
          'button[onclick*="nextPage"]',
          'button[name="pre"]',
          'input[name="pre"]',
          'button[name="next"]',
          'input[name="next"]',
          'button[name="grade"]',
          'input[name="grade"]',
        ].join(","),
      )
      .forEach((element) => {
        element.style.removeProperty("display");
        element.style.removeProperty("visibility");
      });

    if (doc.body) {
      doc.body.style.removeProperty("visibility");
      doc.body.classList.remove(
        "ux-shiken-parent-layout-vertical",
        "ux-shiken-parent-layout-horizontal",
        "ux-shiken-parent-layout-origin",
        "ux-dashboard-v2-mode",
        "ux-grid-mode",
        "ux-course-contents-theme",
        "ux-course-quick-nav-enabled",
        "ux-course-quick-nav-collapsed",
      );
    }
  } catch {
    // ignore inaccessible documents
  }
}

function disconnectUxCourseObservers(doc = document) {
  [
    "__uxDownloadObserver",
    "__uxCourseContentsObserver",
    "__uxShikenVerticalResizePersistenceObserver",
    "__uxShikenButtonTocCompactionObserver",
    "__uxCustomUserIconObserver",
    "__uxCourseHeaderActionsObserver",
  ].forEach((key) => {
    try {
      if (doc[key] && typeof doc[key].disconnect === "function") {
        doc[key].disconnect();
      }
      doc[key] = null;
    } catch {
      // ignore
    }
  });
}

function deactivateUxCourseVisuals(rootDoc = document) {
  try {
    const topDoc = window.top?.document || rootDoc;
    if (topDoc?.__uxCourseVisualsDeactivated) return;
    topDoc.__uxCourseVisualsDeactivated = true;
  } catch {
    // ignore
  }

  getAccessibleUxDocuments(rootDoc).forEach((doc) => {
    try {
      doc.documentElement.dataset.webclassUxCourseVisualMode = "origin";
    } catch {
      // ignore
    }
    disconnectUxCourseObservers(doc);
    restoreUxOriginalFrameStructure(doc);
    restoreUxOriginalBodyState(doc);
    restoreCourseUserIcon(doc);
    removeUxCourseInjectedElements(doc);
    restoreUxCourseHiddenSourceElements(doc);
    removeUxCourseStyleElements(doc);
  });

  try {
    window.__webclassUxBeforeUnloadController?.setEnabled(false);
  } catch {
    // ignore
  }

  try {
    releaseActiveVideoFrameFullscreenSession();
  } catch {
    // release helper is defined later; ignore if unavailable during early startup
  }
}

async function turnOffUxVisualModificationsWithoutReload() {
  setUxExtensionVisualEnabled(false);

  try {
    await chrome.storage.local.set({
      [STORAGE_KEY_EXTENSION_VISUAL_ENABLED]: false,
      defaultViewVersion: "original",
      currentView: "plain",
    });
  } catch {
    // ignore storage failures; the current page will still be restored
  }

  deactivateUxCourseVisuals(document);
}

(() => {
  try {
    const persisted = localStorage.getItem(
      PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED,
    );
    if (persisted === "0") {
      setUxExtensionVisualEnabled(false);
    } else if (persisted === "1") {
      setUxExtensionVisualEnabled(true);
    }
  } catch {
    // ignore
  }
})();

// ============================================================
// Configuration
// ============================================================
const CONFIG = {
  // ファイル名に使用できない文字を置換
  invalidChars: /[<>:"/\\|?*]/g,
  // デバッグモード
  debug: false,
};

const MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_KEY =
  "materialDownloadFilenameSeparator";
const CUSTOM_USER_ICON_KEY = "customUserIconDataUrl";
const MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_DEFAULT = "hyphen";
const MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_CHARS = {
  hyphen: "-",
  space: " ",
  underscore: "_",
};
let materialDownloadFilenameSeparator =
  MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_DEFAULT;
let customUserIconDataUrl = "";

function setCustomUserIconDataUrl(value) {
  customUserIconDataUrl =
    typeof value === "string" && value.startsWith("data:image/") ? value : "";
}

function getCourseUserIcon(doc = document) {
  try {
    return doc.querySelector(
      [
        'a.dropdown-toggle[title="アカウントメニュー"] > img',
        'a.dropdown-toggle[title*="Account"] > img',
        'a[title="アカウントメニュー"] img',
        'a[title*="Account"] img',
      ].join(","),
    );
  } catch {
    return null;
  }
}

function restoreCourseUserIcon(doc = document) {
  const icon = getCourseUserIcon(doc);
  if (!icon || !icon.hasAttribute("data-ux-original-user-icon-src")) {
    return false;
  }

  const originalSrc = icon.getAttribute("data-ux-original-user-icon-src") || "";
  if (originalSrc) {
    icon.setAttribute("src", originalSrc);
  } else {
    icon.removeAttribute("src");
  }
  const originalSrcset = icon.getAttribute(
    "data-ux-original-user-icon-srcset",
  );
  if (originalSrcset === UX_ORIGINAL_ATTR_MISSING) {
    icon.removeAttribute("srcset");
  } else if (originalSrcset !== null) {
    icon.setAttribute("srcset", originalSrcset);
  }
  return true;
}

function applyCustomUserIcon(doc = document) {
  const icon = getCourseUserIcon(doc);
  if (!icon) return false;

  if (!icon.hasAttribute("data-ux-original-user-icon-src")) {
    icon.setAttribute(
      "data-ux-original-user-icon-src",
      icon.getAttribute("src") || "",
    );
    icon.setAttribute(
      "data-ux-original-user-icon-srcset",
      icon.hasAttribute("srcset")
        ? icon.getAttribute("srcset") || ""
        : UX_ORIGINAL_ATTR_MISSING,
    );
  }

  if (!customUserIconDataUrl) {
    restoreCourseUserIcon(doc);
    return true;
  }
  if (icon.getAttribute("src") !== customUserIconDataUrl) {
    icon.setAttribute("src", customUserIconDataUrl);
  }
  icon.removeAttribute("srcset");
  return true;
}

function scheduleCustomUserIconApply(doc = document) {
  try {
    doc.__uxCustomUserIconObserver?.disconnect();
    doc.__uxCustomUserIconObserver = null;
  } catch {
    // ignore
  }

  if (!customUserIconDataUrl) {
    restoreCourseUserIcon(doc);
    return;
  }

  const apply = () => applyCustomUserIcon(doc);
  apply();
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", apply, { once: true });
  }

  const observer = new MutationObserver(apply);
  if (
    safeObserveUxMutation(observer, doc.documentElement, {
      attributes: true,
      attributeFilter: ["src"],
      childList: true,
      subtree: true,
    })
  ) {
    doc.__uxCustomUserIconObserver = observer;
    window.setTimeout(() => {
      observer.disconnect();
      if (doc.__uxCustomUserIconObserver === observer) {
        doc.__uxCustomUserIconObserver = null;
      }
    }, 10000);
  }
}

function markCourseHeaderUtilityControls(doc = document) {
  const redundantCourseListHidden = hideRedundantCourseListButton(doc);
  let nav;
  try {
    nav = doc.querySelector(".navbar-default .navbar-nav.navbar-right");
  } catch {
    return redundantCourseListHidden;
  }
  if (!nav) return redundantCourseListHidden;

  let markedCount = 0;
  Array.from(nav.children).forEach((item) => {
    const link = item.querySelector(":scope > a");
    if (!link) return;

    const title = [
      link.getAttribute("title"),
      link.getAttribute("aria-label"),
      link.textContent,
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const href = (link.getAttribute("href") || "").toLowerCase();
    const isAccount =
      title.includes("アカウントメニュー") || title.includes("account");
    const isMailbox =
      item.id === "notification-dropdown-area" ||
      (href.includes("msg_editor.php") && href.includes("msgappmode=inbox")) ||
      title.includes("受信箱") ||
      title.includes("mailbox") ||
      title.includes("inbox");
    const isLanguage =
      title.includes("言語") ||
      title.includes("language") ||
      href.includes("language") ||
      href.includes("locale") ||
      /[?&](?:lang|locale)=/.test(href);

    link.classList.toggle("ux-course-header-account", isAccount);
    link.classList.toggle("ux-course-header-mailbox", isMailbox);
    link.classList.toggle("ux-course-header-language", isLanguage);
    const isUtilityControl = isAccount || isMailbox || isLanguage;
    item.classList.toggle("ux-course-header-action-item", isUtilityControl);
    if (isUtilityControl) markedCount += 1;
  });

  nav.classList.toggle("ux-course-header-actions", markedCount > 0);
  return markedCount > 0;
}

function hideRedundantCourseListButton(doc = document) {
  try {
    const link = Array.from(
      doc.querySelectorAll('a[href*="logout"]'),
    ).find((candidate) => {
      const label = [
        candidate.getAttribute("title"),
        candidate.getAttribute("aria-label"),
        candidate.textContent,
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const href = candidate.href || candidate.getAttribute("href") || "";
      const isCourseListLabel =
        label.includes("コースリスト") || label.includes("course list");
      const isCourseLogoutLink =
        /\/course\.php\/[^/?#]+\/logout(?:[/?#]|$)/i.test(href);
      return isCourseLogoutLink && (isCourseListLabel || !label);
    });
    if (!link) return false;

    const item = link.closest("li") || link;
    item.classList.add("ux-course-list-button-hidden");
    return true;
  } catch {
    return false;
  }
}

function scheduleCourseHeaderUtilityControls(doc = document) {
  try {
    doc.__uxCourseHeaderActionsObserver?.disconnect();
    doc.__uxCourseHeaderActionsObserver = null;
  } catch {
    // ignore
  }

  const apply = () => markCourseHeaderUtilityControls(doc);
  apply();
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", apply, { once: true });
  }

  const observer = new MutationObserver(apply);
  if (
    safeObserveUxMutation(observer, doc.documentElement, {
      childList: true,
      subtree: true,
    })
  ) {
    doc.__uxCourseHeaderActionsObserver = observer;
    window.setTimeout(() => {
      observer.disconnect();
      if (doc.__uxCourseHeaderActionsObserver === observer) {
        doc.__uxCourseHeaderActionsObserver = null;
      }
    }, 10000);
  }
}

const UX_COURSE_COLOR_TOKEN_STYLE_ID = "ux-course-color-tokens";
const UX_SHIRYOU_TOC_WIDTH_STORAGE_KEY = "shiryouTocWidthPx";
const UX_SHIRYOU_TOC_DEFAULT_WIDTH = 350;
const UX_SHIRYOU_TOC_MIN_WIDTH = 240;
const UX_SHIRYOU_TOC_MAX_WIDTH = 720;
const UX_SHIRYOU_TOC_COLLAPSED_WIDTH = 56;
const UX_COURSE_COLOR_TOKEN_CSS = `
    :root {
        color-scheme: light;
        --ux-home-page-bg: #f5f5f7;
        --ux-home-surface: #ffffff;
        --ux-home-surface-muted: #f2f2f7;
        --ux-home-surface-soft: #fbfbfd;
        --ux-home-fill: rgba(120, 120, 128, 0.12);
        --ux-home-fill-strong: rgba(120, 120, 128, 0.2);
        --ux-home-label: #1d1d1f;
        --ux-home-secondary-label: #6e6e73;
        --ux-home-tertiary-label: #8e8e93;
        --ux-home-quaternary-label: #aeaeb2;
        --ux-home-separator: rgba(60, 60, 67, 0.18);
        --ux-home-separator-strong: rgba(60, 60, 67, 0.29);
        --ux-home-accent: #0a84ff;
        --ux-home-accent-emphasis: #0077ed;
        --ux-home-accent-soft: rgba(10, 132, 255, 0.12);
        --ux-home-accent-softer: rgba(10, 132, 255, 0.08);
        --ux-home-success: #34c759;
        --ux-home-success-soft: rgba(52, 199, 89, 0.14);
        --ux-home-success-foreground: #248a3d;
        --ux-home-warning: #ff9f0a;
        --ux-home-warning-soft: rgba(255, 159, 10, 0.16);
        --ux-home-warning-foreground: #9a5b00;
        --ux-home-danger: #ff453a;
        --ux-home-danger-soft: rgba(255, 69, 58, 0.14);
        --ux-home-danger-foreground: #c12a1f;
        --ux-home-purple: #bf5af2;
        --ux-home-purple-soft: rgba(191, 90, 242, 0.14);
        --ux-home-purple-foreground: #7a2fc7;
        --ux-home-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
        --ux-home-shadow-md: 0 12px 32px rgba(15, 23, 42, 0.08);
        --ux-home-shadow-lg: 0 24px 48px rgba(15, 23, 42, 0.14);
        --ux-home-focus-ring: 0 0 0 3px rgba(10, 132, 255, 0.18);
        --ux-home-header-backdrop: rgba(255, 255, 255, 0.78);
        --ux-home-overlay: rgba(15, 23, 42, 0.26);
        --ux-select-display-font-size: 14px;
        --ux-select-option-font-size: 14px;
    }
`;

function ensureCourseColorTokens(targetDoc = document) {
  if (!targetDoc || typeof targetDoc.createElement !== "function") return;
  const root = targetDoc.head || targetDoc.documentElement;
  if (!root || targetDoc.getElementById(UX_COURSE_COLOR_TOKEN_STYLE_ID)) return;

  const style = targetDoc.createElement("style");
  style.id = UX_COURSE_COLOR_TOKEN_STYLE_ID;
  markUxCourseStyle(style);
  style.textContent = UX_COURSE_COLOR_TOKEN_CSS;
  root.appendChild(style);
}

uxDebugLog("WebClass UX Improver: Course script loaded");

function log(...args) {
  if (uxDebugModeState.enabled) {
    uxDebugLog("[WebClass UX]", ...args);
  }
}

// ============================================================
// Page Type Detection
// ============================================================

/**
 * 現在のページタイプを検出
 * @returns {'shiryou' | 'shiken' | 'course_list' | 'download_window' | 'pdf_viewer' | 'unknown'}
 */
function detectPageType() {
  const url = window.location.href;

  // ダウンロードウィンドウ: file_down.php
  if (url.includes("file_down.php")) {
    return "download_window";
  }

  // PDFビューア: loadit.php
  if (url.includes("loadit.php")) {
    // action=providePDF は「表示に問題があるときは」メッセージのフレーム
    if (url.includes("action=providePDF") || url.includes("action=provide")) {
      return "loadit_message";
    }
    return "pdf_viewer";
  }

  // 資料タイプ: txtbk_frame.php または txtbk_show_chapter.php、title_simple.php
  if (
    url.includes("txtbk_frame.php") ||
    url.includes("txtbk_show_chapter.php") ||
    url.includes("txtbk_show_text.php")
  ) {
    return "shiryou";
  }

  // title_simple.php は資料タイプの上部リボン（非表示対象）
  if (url.includes("title_simple.php")) {
    return "shiryou_title";
  }

  // 試験タイプ
  if (
    url.includes("qstn_frame.php") ||
    url.includes("dqstn_button.php") ||
    url.includes("dqstn_question.php") ||
    url.includes("dqstn_answer.php") ||
    url.includes("dqstn_answer_all.php") ||
    url.includes("reslt_description.php")
  ) {
    return "shiken";
  }

  // コースリスト/教材一覧
  if (url.includes("course.php") && !url.includes("do_contents")) {
    return "course_list";
  }

  // do_contents.php (教材表示開始)
  if (url.includes("do_contents.php")) {
    return "do_contents";
  }

  return "unknown";
}

// ============================================================
// Content Info Extraction
// ============================================================

/**
 * 課題名を取得
 * @returns {string}
 */
function getContentName() {
  // 方法1: hidden input から取得
  const hiddenInput = document.querySelector('input[name="contents_name"]');
  if (hiddenInput && hiddenInput.value) {
    return hiddenInput.value.trim();
  }

  // 方法2: h2タグから取得
  const h2 = document.querySelector("#WsTitle h2, .bgc_sub h2, h2");
  if (h2) {
    // "New" バッジなどを除去
    let text = h2.textContent.trim();
    text = text.replace(/^New\s*/i, "");
    return text;
  }

  // 方法3: タイトルから取得
  const title = document.title;
  if (title && title.includes(" - WebClass")) {
    return title.split(" - WebClass")[0].trim();
  }

  return "Unknown";
}

/**
 * コース名を取得
 * @returns {string}
 */
function getCourseName() {
  const h1 = document.querySelector("#WsTitle h1, .bgc_sub h1, h1");
  if (h1) {
    let text = h1.textContent.trim();
    // ">" プレフィックスを除去
    text = text.replace(/^>\s*/, "");
    return text;
  }
  return "";
}

/**
 * 節/問番号を取得
 * @param {Element} element - ダウンロードリンクの近くの要素
 * @returns {number | null}
 */
function getSectionNumber(element) {
  const sectionNumber = getSectionNumberText(element);
  return sectionNumber ? parseInt(sectionNumber, 10) : null;
}

/**
 * ファイル名から拡張子を取得
 * @param {string} url
 * @returns {string}
 */
function getExtensionFromUrl(url) {
  try {
    // file_name パラメータから取得
    const urlObj = new URL(url, window.location.origin);
    const fileName = urlObj.searchParams.get("file_name");
    if (fileName) {
      const decoded = decodeURIComponent(fileName);
      const ext = decoded.split(".").pop();
      if (ext && ext.length <= 5) {
        return "." + ext.toLowerCase();
      }
    }

    // URLパスから取得
    const pathname = urlObj.pathname;
    const extMatch = pathname.match(/\.([a-zA-Z0-9]+)$/);
    if (extMatch) {
      return "." + extMatch[1].toLowerCase();
    }
  } catch (e) {
    log("Error extracting extension:", e);
  }
  return ".pdf"; // デフォルト
}

/**
 * 元のファイル名を取得
 * @param {string} url
 * @returns {string}
 */
function getOriginalFileName(url) {
  try {
    const urlObj = new URL(url, window.location.origin);

    // file_name パラメータから取得
    const fileName = urlObj.searchParams.get("file_name");
    if (fileName) {
      return decodeURIComponent(fileName);
    }

    // URLパスから取得 (download.php/ファイル名.pdf の形式)
    const pathname = urlObj.pathname;
    const pathMatch = pathname.match(/download\.php\/(.+)$/);
    if (pathMatch) {
      return decodeURIComponent(pathMatch[1]);
    }

    // 通常のファイルパス
    const parts = pathname.split("/");
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart.includes(".")) {
      return decodeURIComponent(lastPart);
    }
  } catch (e) {
    log("Error extracting filename:", e);
  }
  return null;
}

/**
 * ファイル名をサニタイズ
 * @param {string} name
 * @returns {string}
 */
function sanitizeFileName(name) {
  return name.replace(CONFIG.invalidChars, "_").trim();
}

function normalizeMaterialDownloadFilenameSeparator(value) {
  if (
    Object.prototype.hasOwnProperty.call(
      MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_CHARS,
      value,
    )
  ) {
    return value;
  }
  if (value === "-") return "hyphen";
  if (value === " ") return "space";
  if (value === "_") return "underscore";
  return MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_DEFAULT;
}

function getMaterialDownloadFilenameSeparatorChar() {
  const normalized = normalizeMaterialDownloadFilenameSeparator(
    materialDownloadFilenameSeparator,
  );
  return (
    MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_CHARS[normalized] ||
    MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_CHARS[
      MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_DEFAULT
    ]
  );
}

function normalizeDownloadNamePart(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSectionNumberTextFromText(text) {
  const sectionMatch = normalizeDownloadNamePart(text).match(
    /第\s*([0-9０-９一二三四五六七八九十百〇零]+)\s*[節章部]/u,
  );
  if (sectionMatch) {
    return uxJapaneseNumberToInt(sectionMatch[1]);
  }

  const questionMatch = normalizeDownloadNamePart(text).match(/問\s*(\d+)/);
  return questionMatch ? questionMatch[1] : null;
}

function getSectionLabelTextFromRow(row) {
  if (!row) return null;

  const badge = row.querySelector(".ux-section-number-badge");
  if (badge) {
    const label =
      normalizeDownloadNamePart(badge.getAttribute("title")) ||
      normalizeDownloadNamePart(badge.getAttribute("aria-label"));
    if (label) return label;
  }

  const sectionLabel = Array.from(row.querySelectorAll("span")).find((span) =>
    getSectionNumberTextFromText(span.textContent || ""),
  );
  if (sectionLabel) {
    return normalizeDownloadNamePart(sectionLabel.textContent);
  }

  return null;
}

function getSectionNumberText(element) {
  const row = element?.closest?.("tr");
  if (!row) return null;

  const label = getSectionLabelTextFromRow(row);
  const fromLabel = getSectionNumberTextFromText(label || "");
  if (fromLabel) return fromLabel;

  const fromRow = getSectionNumberTextFromText(row.textContent || "");
  if (fromRow) return fromRow;

  const pageButton = row.querySelector('input[name="clickpage"]');
  const pageValue = normalizeDownloadNamePart(pageButton?.value);
  if (/^\d+$/.test(pageValue)) return pageValue;

  const onclick = pageButton?.getAttribute("onclick") || "";
  const pageMatch = onclick.match(/gopage\(['"]?(\d+)['"]?\)/);
  return pageMatch ? pageMatch[1] : null;
}

function getAttachmentSectionTitle(element) {
  const row = element?.closest?.("tr");
  if (!row) return null;

  const hadCompactBadge = !!row.querySelector(".ux-section-number-badge");
  const sectionLabel = getSectionLabelTextFromRow(row);
  const sectionNumber = getSectionNumberText(element);
  const clone = row.cloneNode(true);

  clone
    .querySelectorAll(
      [
        ".ux-inline-download-options",
        ".ux-download-group",
        ".ux-download-btn",
        'a[href*="file_down.php"]',
        'input[name="clickpage"]',
        'button[name="clickpage"]',
        'input[value="添付資料"]',
      ].join(","),
    )
    .forEach((node) => node.remove());

  clone.querySelectorAll(".ux-section-number-badge").forEach((node) => {
    node.remove();
  });

  clone.querySelectorAll("span").forEach((span) => {
    if (getSectionNumberTextFromText(span.textContent || "")) {
      span.remove();
    }
  });

  let title = normalizeDownloadNamePart(clone.textContent)
    .replace(/添付資料/g, "")
    .trim();

  if (sectionLabel) {
    title = title.replace(sectionLabel, "").trim();
  }

  title = title.replace(
    /^第\s*[0-9０-９一二三四五六七八九十百〇零]+\s*[節章部]\s*/u,
    "",
  );

  if (hadCompactBadge && sectionNumber) {
    title = title
      .replace(new RegExp(`^${escapeRegExp(sectionNumber)}\\s*`), "")
      .trim();
  }

  return title || null;
}

function getAttachmentSectionFallbackLabel(element) {
  const row = element?.closest?.("tr");
  const label = getSectionLabelTextFromRow(row);
  if (label) return label;

  const sectionNumber = getSectionNumberText(element);
  return sectionNumber ? `第${sectionNumber}節` : null;
}

function buildMaterialDownloadBaseName(contentName, attachmentLink) {
  const baseName = normalizeDownloadNamePart(contentName) || "download";
  const sectionTitle = getAttachmentSectionTitle(attachmentLink);
  const sectionLabel = getAttachmentSectionFallbackLabel(attachmentLink);
  const suffix = normalizeDownloadNamePart(sectionTitle || sectionLabel);

  return suffix
    ? `${baseName}${getMaterialDownloadFilenameSeparatorChar()}${suffix}`
    : baseName;
}

function buildMaterialDownloadFileName(contentName, attachmentLink, extension) {
  return sanitizeFileName(
    buildMaterialDownloadBaseName(contentName, attachmentLink),
  ) + extension;
}

function setDownloadButtonLabel(button, label, fileName, maxLength) {
  button.textContent = "";
  button.appendChild(document.createTextNode(label));
  button.appendChild(document.createElement("br"));

  const detail = document.createElement("small");
  detail.textContent = truncateFileName(fileName, maxLength);
  button.appendChild(detail);
}

function createUxIconSvg(doc, paths) {
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

  paths.forEach(({ tag = "path", attrs }) => {
    const element = doc.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([name, value]) => {
      element.setAttribute(name, value);
    });
    svg.appendChild(element);
  });

  return svg;
}

function getDownloadOptionIconPaths(type) {
  const fileBase = [
    {
      attrs: {
        d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
      },
    },
    { attrs: { d: "M14 2v6h6" } },
  ];

  if (type === "rename") {
    return [
      ...fileBase,
      { attrs: { d: "M8 19l.5-2.5L14 11l2 2-5.5 5.5L8 19z" } },
      { attrs: { d: "M12.5 12.5l2 2" } },
    ];
  }

  return [
    ...fileBase,
    { attrs: { d: "M12 12v6" } },
    { attrs: { d: "M9 15l3 3 3-3" } },
  ];
}

function setDownloadIconButton(button, type, label, fileName = "") {
  const doc = button.ownerDocument || document;
  const detail = fileName ? `: ${fileName}` : "";
  button.textContent = "";
  button.classList.add("ux-download-icon-btn");
  button.setAttribute("aria-label", `${label}${detail}`);
  button.title = `${label}${detail}`;
  button.style.display = "inline-flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.minWidth = "30px";
  button.style.minHeight = "30px";
  button.style.padding = "5px";
  button.style.lineHeight = "1";
  button.appendChild(createUxIconSvg(doc, getDownloadOptionIconPaths(type)));
}

function getInlineDownloadButtonLabel(type) {
  return type === "rename"
    ? "リネームしてダウンロード"
    : "元のファイル名でダウンロード";
}

function getInlineDownloadButtonFileName(
  type,
  renamedFileName,
  originalFileName,
) {
  return type === "rename" ? renamedFileName : originalFileName;
}

function prepareInlineDownloadButton(
  button,
  type,
  fileDownUrl,
  renamedFileName,
  originalFileName,
) {
  button.dataset.uxDownloadType = type;
  button.dataset.uxFileDownUrl = fileDownUrl;
  button.dataset.uxRenamedFileName = renamedFileName || "";
  button.dataset.uxOriginalFileName = originalFileName || "";

  setDownloadIconButton(
    button,
    type,
    getInlineDownloadButtonLabel(type),
    getInlineDownloadButtonFileName(type, renamedFileName, originalFileName),
  );
}

function bindInlineDownloadButton(button) {
  if (!button || button.__uxInlineDownloadBound) return false;

  const type = button.dataset.uxDownloadType;
  const fileDownUrl = button.dataset.uxFileDownUrl;
  if (!fileDownUrl || (type !== "rename" && type !== "original")) return false;

  const renamedFileName = button.dataset.uxRenamedFileName || "";
  const originalFileName = button.dataset.uxOriginalFileName || "";
  const label = getInlineDownloadButtonLabel(type);
  const displayFileName = getInlineDownloadButtonFileName(
    type,
    renamedFileName,
    originalFileName,
  );

  const resetButton = () => {
    setDownloadIconButton(button, type, label, displayFileName);
    button.disabled = false;
  };

  setDownloadIconButton(button, type, label, displayFileName);
  button.__uxInlineDownloadBound = true;
  button.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    button.disabled = true;
    button.innerHTML = "⏳";
    try {
      await downloadFromFileDownUrl(
        fileDownUrl,
        type === "rename" ? renamedFileName : null,
      );
      button.innerHTML = "完了";
      setTimeout(resetButton, 2000);
    } catch (error) {
      log("Download error:", error);
      button.innerHTML = "失敗";
      setTimeout(resetButton, 2000);
    }
  });

  return true;
}

// ============================================================
// Download Button Enhancement
// ============================================================

/**
 * ダウンロードボタンを強化（選択肢を追加）
 */
function enhanceDownloadLinks() {
  if (!isUxExtensionVisualEnabled()) return;
  rememberUxOriginalBodyState(document);

  const pageType = detectPageType();
  log("Page type:", pageType);

  if (pageType === "unknown" || pageType === "course_list") {
    log("Skipping enhancement for this page type");
    return;
  }

  // ダウンロードウィンドウの場合は特別処理
  if (pageType === "download_window") {
    enhanceDownloadWindow();
    return;
  }

  // PDFビューアの場合は特別処理
  if (pageType === "pdf_viewer") {
    enhancePdfViewerPage();
    return;
  }

  const contentName = getContentName();
  const courseName = getCourseName();
  log("Content name:", contentName);
  log("Course name:", courseName);

  // 添付資料リンクを検出
  enhanceAttachmentLinks(contentName);

  // PDFビューアのダウンロードボタンを検出
  enhancePdfViewerDownload(contentName);
}

/**
 * 添付資料リンクを強化
 * file_down.phpへのリンクを検出し、ダウンロードウィンドウを開かずに
 * 直接2つのダウンロードオプションを表示する
 * @param {string} contentName
 */
function enhanceAttachmentLinks(contentName) {
  log("Enhancing attachment links");

  // file_down.php へのリンクを検出
  const attachmentLinks = document.querySelectorAll('a[href*="file_down.php"]');

  log(`Found ${attachmentLinks.length} attachment links`);

  attachmentLinks.forEach((link) => {
    if (link.dataset.uxEnhanced) return;
    link.dataset.uxEnhanced = "true";

    const fileDownUrl = link.href;

    // URLからファイル名を取得
    const originalFileName = getFileNameFromFileDownUrl(fileDownUrl);
    const extension = getExtensionFromUrl(fileDownUrl);

    // リネーム後のファイル名を生成
    const renamedFileName = buildMaterialDownloadFileName(
      contentName,
      link,
      extension,
    );

    log("Attachment link:", { fileDownUrl, originalFileName, renamedFileName });

    // 元のonclickイベントを無効化（ポップアップウィンドウを開かないようにする）
    link.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
    link.removeAttribute("target");

    // ダウンロードオプションのUIを作成
    createInlineDownloadOptions(
      link,
      fileDownUrl,
      renamedFileName,
      originalFileName,
    );
  });
}

/**
 * file_down.php URLからファイル名を取得
 * @param {string} url
 * @returns {string}
 */
function getFileNameFromFileDownUrl(url) {
  try {
    const urlObj = new URL(url, window.location.origin);
    const fileName = urlObj.searchParams.get("file_name");
    if (fileName) {
      return decodeURIComponent(fileName);
    }
  } catch (e) {
    log("Error extracting filename from file_down.php URL:", e);
  }
  return "ファイル";
}

/**
 * インラインでダウンロードオプションを作成
 * 元のリンクの横に2つのダウンロードボタンを表示
 * @param {Element} originalLink
 * @param {string} fileDownUrl - file_down.php のURL
 * @param {string} renamedFileName
 * @param {string} originalFileName
 */
function createInlineDownloadOptions(
  originalLink,
  fileDownUrl,
  renamedFileName,
  originalFileName,
) {
  const doc = originalLink.ownerDocument || document;

  // コンテナを作成
  const container = doc.createElement("span");
  container.className = "ux-inline-download-options";

  // リネームダウンロードボタン
  const renameBtn = doc.createElement("button");
  renameBtn.type = "button";
  renameBtn.className = "ux-download-btn ux-download-rename";
  prepareInlineDownloadButton(
    renameBtn,
    "rename",
    fileDownUrl,
    renamedFileName,
    originalFileName,
  );
  bindInlineDownloadButton(renameBtn);

  // 元のファイル名でダウンロードボタン
  const originalBtn = doc.createElement("button");
  originalBtn.type = "button";
  originalBtn.className = "ux-download-btn ux-download-original";
  prepareInlineDownloadButton(
    originalBtn,
    "original",
    fileDownUrl,
    renamedFileName,
    originalFileName,
  );
  bindInlineDownloadButton(originalBtn);

  container.appendChild(renameBtn);
  container.appendChild(originalBtn);

  // 元のリンクの後ろにコンテナを追加
  originalLink.parentNode.insertBefore(container, originalLink.nextSibling);
}

/**
 * file_down.phpからダウンロードURLを取得してダウンロードを実行
 * @param {string} fileDownUrl - file_down.php のURL
 * @param {string|null} filename - リネーム後のファイル名（nullの場合は元のファイル名）
 */
async function downloadFromFileDownUrl(fileDownUrl, filename) {
  log("Fetching download URL from:", fileDownUrl);

  try {
    // file_down.phpページをフェッチ
    const response = await fetch(fileDownUrl, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const html = await response.text();

    // HTMLからdownload.phpのURLを抽出
    const downloadUrl = extractDownloadUrlFromHtml(html);

    if (!downloadUrl) {
      throw new Error("Could not extract download URL");
    }

    log("Extracted download URL:", downloadUrl);

    // ダウンロードを実行
    triggerDownload(downloadUrl, filename);
  } catch (error) {
    log("Error fetching from file_down.php:", error);
    // フォールバック: 直接file_down.phpを開く（従来の動作）
    window.open(fileDownUrl, "_blank");
    throw error;
  }
}

/**
 * HTMLからdownload.phpのURLを抽出
 * @param {string} html
 * @returns {string|null}
 */
function extractDownloadUrlFromHtml(html) {
  // DOMパーサーでHTMLを解析
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // download.phpへのリンクを探す
  const downloadLink = doc.querySelector('a[href*="download.php"]');
  if (downloadLink) {
    return downloadLink.href;
  }

  // 正規表現でも試行
  const match = html.match(/href=["']([^"']*download\.php[^"']*)["']/i);
  if (match) {
    let url = match[1];
    // HTMLエンティティをデコード
    url = url.replace(/&amp;/g, "&");
    // 相対URLを絶対URLに変換
    if (!url.startsWith("http")) {
      url = new URL(url, window.location.origin).href;
    }
    return url;
  }

  return null;
}

/**
 * PDFビューアを開いて画像保存を促す
 * @param {string} fileDownUrl - file_down.php のURL
 * @param {string} baseFileName - ベースファイル名（拡張子なし）
 */
async function openPdfViewerForImageSave(fileDownUrl, baseFileName) {
  // file_down.phpからdownload.phpのURLを取得
  const response = await fetch(fileDownUrl, { credentials: "include" });
  const html = await response.text();
  const downloadUrl = extractDownloadUrlFromHtml(html);

  if (!downloadUrl) {
    throw new Error("Could not extract PDF URL");
  }

  // background.jsにPDF変換リクエストを送信
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "CONVERT_PDF_TO_IMAGES",
        url: downloadUrl,
        baseFileName: baseFileName,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.success) {
          resolve();
        } else {
          reject(new Error(response?.error || "Unknown error"));
        }
      },
    );
  });
}

/**
 * PDFビューアのダウンロードボタンを強化
 * @param {string} contentName
 */
function enhancePdfViewerDownload(contentName) {
  // iframe内のPDFビューアを探す
  const iframes = document.querySelectorAll("iframe");

  iframes.forEach((iframe) => {
    try {
      const iframeDoc =
        iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return;

      // ダウンロードボタンを探す
      const downloadBtn = iframeDoc.querySelector(
        "#download, #secondaryDownload",
      );
      if (downloadBtn && !downloadBtn.dataset.uxEnhanced) {
        downloadBtn.dataset.uxEnhanced = "true";

        // PDFのURLを取得
        const pdfUrl = getPdfUrlFromViewer(iframeDoc);
        if (pdfUrl) {
          const extension = ".pdf";
          const renamedFileName = sanitizeFileName(contentName) + extension;
          const originalFileName =
            getOriginalFileName(pdfUrl) || "document.pdf";

          // 既存のクリックイベントをインターセプト
          downloadBtn.addEventListener(
            "click",
            (e) => {
              e.preventDefault();
              e.stopPropagation();
              showDownloadChoice(pdfUrl, renamedFileName, originalFileName, e);
            },
            true,
          );
        }
      }
    } catch (e) {
      // クロスオリジンの場合はスキップ
      log("Cannot access iframe:", e.message);
    }
  });

  // 直接ページ上のダウンロードボタン
  const downloadBtns = document.querySelectorAll(
    '#download, #secondaryDownload, button[data-l10n-id="download"]',
  );
  downloadBtns.forEach((btn) => {
    if (btn.dataset.uxEnhanced) return;
    btn.dataset.uxEnhanced = "true";

    const pdfUrl = getPdfUrlFromViewer(document);
    if (pdfUrl) {
      const renamedFileName = sanitizeFileName(contentName) + ".pdf";
      const originalFileName = getOriginalFileName(pdfUrl) || "document.pdf";

      btn.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          showDownloadChoice(pdfUrl, renamedFileName, originalFileName, e);
        },
        true,
      );
    }
  });
}

/**
 * PDFビューアからPDF URLを取得
 * @param {Document} doc
 * @returns {string | null}
 */
function getPdfUrlFromViewer(doc) {
  // DEFAULT_URL変数から取得
  const scripts = doc.querySelectorAll("script");
  for (const script of scripts) {
    const content = script.textContent;
    const match = content.match(/DEFAULT_URL\s*=\s*['"]([^'"]+)['"]/);
    if (match) {
      return match[1];
    }
  }

  // コメントからURLを取得
  const html = doc.documentElement.outerHTML;
  const urlMatch = html.match(/saved from url=\([^)]+\)([^\s]+\.pdf)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  return null;
}

/**
 * ダウンロードウィンドウを強化 (file_down.php)
 */
function enhanceDownloadWindow() {
  log("Enhancing download window");

  // download.php リンクを探す
  const downloadLinks = document.querySelectorAll('a[href*="download.php"]');

  downloadLinks.forEach((link) => {
    if (link.dataset.uxEnhanced) return;
    link.dataset.uxEnhanced = "true";

    const downloadUrl = link.href;
    const originalFileName = getOriginalFileName(downloadUrl);
    const extension = getExtensionFromUrl(downloadUrl);

    // 親ウィンドウから課題名を取得を試みる
    let contentName = getContentNameFromParent() || getContentName();
    if (!contentName || contentName === "Unknown") {
      // ファイル名から推測（拡張子を除去）
      contentName = originalFileName
        ? originalFileName.replace(/\.[^.]+$/, "")
        : "download";
    }

    const renamedFileName = sanitizeFileName(contentName) + extension;

    log("Download window link:", {
      downloadUrl,
      originalFileName,
      renamedFileName,
    });

    // ダウンロードウィンドウ用のボタングループを作成
    createDownloadWindowButtonGroup(
      link,
      downloadUrl,
      renamedFileName,
      originalFileName,
    );
  });
}

/**
 * ダウンロードウィンドウ用のボタングループを作成
 * @param {Element} originalLink
 * @param {string} downloadUrl - download.php のURL（実際のダウンロードURL）
 * @param {string} renamedFileName
 * @param {string} originalFileName
 */
function createDownloadWindowButtonGroup(
  originalLink,
  downloadUrl,
  renamedFileName,
  originalFileName,
) {
  const container = document.createElement("div");
  container.className = "ux-download-group";
  container.style.cssText =
    "display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;";

  // リネームダウンロードボタン
  const renameBtn = document.createElement("button");
  renameBtn.type = "button";
  renameBtn.className = "ux-download-btn ux-download-rename";
  setDownloadIconButton(
    renameBtn,
    "rename",
    "リネームしてダウンロード",
    renamedFileName,
  );
  renameBtn.style.cssText = "width: 44px; height: 44px; padding: 10px;";
  renameBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    triggerDownload(downloadUrl, renamedFileName);
  });

  // 元のファイル名でダウンロードボタン
  const originalBtn = document.createElement("button");
  originalBtn.type = "button";
  originalBtn.className = "ux-download-btn ux-download-original";
  setDownloadIconButton(
    originalBtn,
    "original",
    "元のファイル名でダウンロード",
    originalFileName || "不明",
  );
  originalBtn.style.cssText = "width: 44px; height: 44px; padding: 10px;";
  originalBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    triggerDownload(downloadUrl, null);
  });

  container.appendChild(renameBtn);
  container.appendChild(originalBtn);

  // PDFファイルの場合は「画像として保存」ボタンを追加
  const extension = getExtensionFromUrl(downloadUrl).toLowerCase();
  if (extension === ".pdf") {
    const imageBaseFileName = renamedFileName.replace(/\.pdf$/i, "");
    const imageBtn = createSaveAsImageButton(downloadUrl, imageBaseFileName);
    container.appendChild(imageBtn);
  }

  // 元のリンクをテキストに置換
  const fileNameText = document.createElement("span");
  fileNameText.className = "ux-filename-text";
  fileNameText.style.cssText =
    "display: block; margin-bottom: 10px; color: inherit;";
  fileNameText.textContent = "» " + (originalFileName || "ファイル");

  // 元のリンクを非表示にして、テキストを挿入
  originalLink.style.display = "none";
  originalLink.parentNode.insertBefore(fileNameText, originalLink);
  originalLink.parentNode.insertBefore(container, fileNameText.nextSibling);
}

/**
 * 親ウィンドウから課題名を取得（フレームチェーンを遡る）
 * @returns {string | null}
 */
function getContentNameFromParent() {
  // 検索対象のセレクタリスト
  const selectors = [
    'input[name="contents_name"]',
    "#WsTitle h2",
    ".bgc_sub h2",
    "h2",
  ];

  /**
   * ドキュメントから課題名を取得
   * @param {Document} doc
   * @returns {string | null}
   */
  function extractFromDoc(doc) {
    try {
      // input[name="contents_name"]から取得
      const input = doc.querySelector('input[name="contents_name"]');
      if (input && input.value) {
        return input.value.trim();
      }

      // h2から取得
      for (const selector of ["#WsTitle h2", ".bgc_sub h2"]) {
        const h2 = doc.querySelector(selector);
        if (h2) {
          let text = h2.textContent.trim();
          text = text.replace(/^New\s*/i, "");
          if (text && text !== "" && text !== ">") {
            return text;
          }
        }
      }
    } catch (e) {
      // アクセスエラー
    }
    return null;
  }

  /**
   * フレームチェーンを遡って検索
   * @param {Window} win
   * @param {number} depth
   * @returns {string | null}
   */
  function searchFrameChain(win, depth = 0) {
    if (depth > 10) return null; // 無限ループ防止

    try {
      // 現在のウィンドウのドキュメントをチェック
      const result = extractFromDoc(win.document);
      if (result) return result;

      // 親ウィンドウを検索
      if (win.parent && win.parent !== win) {
        const parentResult = searchFrameChain(win.parent, depth + 1);
        if (parentResult) return parentResult;
      }

      // 同じフレームセット内の他のフレームを検索
      if (win.parent && win.parent.frames) {
        for (let i = 0; i < win.parent.frames.length; i++) {
          try {
            const frame = win.parent.frames[i];
            if (frame !== win) {
              const frameResult = extractFromDoc(frame.document);
              if (frameResult) return frameResult;
            }
          } catch (e) {
            // クロスオリジン
          }
        }
      }
    } catch (e) {
      log("Frame access error:", e.message);
    }
    return null;
  }

  // openerから取得を試みる
  try {
    if (window.opener) {
      const openerResult = extractFromDoc(window.opener.document);
      if (openerResult) return openerResult;
    }
  } catch (e) {
    // クロスオリジン
  }

  // フレームチェーンを検索
  return searchFrameChain(window);
}

/**
 * PDFビューアページを強化 (loadit.php)
 * 既存のダウンロードボタンは「元名」として機能するため、リネームボタンのみ追加
 */
function enhancePdfViewerPage() {
  log("Enhancing PDF viewer page");
  bindShikenPdfScrollHandoff(document);

  // ダウンロードボタンを探す（メインとセカンダリ両方）
  const downloadBtns = document.querySelectorAll(
    '#download, #secondaryDownload, button[data-l10n-id="download"]',
  );

  // 課題名を親から取得
  let contentName = getContentNameFromParent();
  log("Content name from parent:", contentName);

  if (!contentName || contentName === "Unknown") {
    // URLから課題名を推測
    contentName = getContentNameFromUrl();
    log("Content name from URL:", contentName);
  }

  if (!contentName) {
    contentName = "document";
  }

  // PDF URLを取得
  const pdfUrl = getPdfUrlFromViewer(document) || window.location.href;
  const renamedFileName = sanitizeFileName(contentName) + ".pdf";
  const imageBaseFileName = sanitizeFileName(contentName);

  log("PDF viewer:", { pdfUrl, renamedFileName, contentName });

  downloadBtns.forEach((btn) => {
    if (btn.dataset.uxEnhanced) return;
    btn.dataset.uxEnhanced = "true";

    // リネームダウンロードボタンを追加（既存ボタンは元名として機能）
    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "ux-download-btn ux-download-rename";
    setDownloadIconButton(
      renameBtn,
      "rename",
      "リネームしてダウンロード",
      renamedFileName,
    );
    renameBtn.style.marginLeft = "8px";
    renameBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      triggerDownload(pdfUrl, renamedFileName);
    });

    // 画像として保存ボタンを追加
    const imageBtn = createSaveAsImageButtonForViewer(imageBaseFileName);
    imageBtn.style.marginLeft = "8px";

    // クリップボードにコピーボタンを追加
    const copyBtn = createCopyAsImageButtonForViewer();
    copyBtn.style.marginLeft = "8px";

    // 既存ボタンの隣に追加
    btn.parentNode.insertBefore(renameBtn, btn.nextSibling);
    btn.parentNode.insertBefore(imageBtn, renameBtn.nextSibling);
    btn.parentNode.insertBefore(copyBtn, imageBtn.nextSibling);
  });
}

/**
 * URLから課題名を推測
 * @returns {string | null}
 */
function getContentNameFromUrl() {
  try {
    const url = new URL(window.location.href);

    // contents_name パラメータから取得
    const contentsName = url.searchParams.get("contents_name");
    if (contentsName) {
      return decodeURIComponent(contentsName);
    }

    // set_contents_id から取得できないので、リファラーをチェック
    if (document.referrer) {
      const refUrl = new URL(document.referrer);
      const refContentsName = refUrl.searchParams.get("contents_name");
      if (refContentsName) {
        return decodeURIComponent(refContentsName);
      }
    }
  } catch (e) {
    log("Error extracting content name from URL:", e);
  }
  return null;
}

/**
 * ファイル名を切り詰め
 * @param {string} name
 * @param {number} maxLength
 * @returns {string}
 */
function truncateFileName(name, maxLength) {
  if (name.length <= maxLength) return name;
  const ext = name.split(".").pop();
  const base = name.slice(0, name.length - ext.length - 1);
  const truncated = base.slice(0, maxLength - ext.length - 4) + "...";
  return truncated + "." + ext;
}

/**
 * ダウンロード選択ダイアログを表示
 * @param {string} url
 * @param {string} renamedFileName
 * @param {string} originalFileName
 * @param {Event} event
 */
function showDownloadChoice(url, renamedFileName, originalFileName, event) {
  // シンプルなconfirmダイアログ
  const choice = confirm(
    `ダウンロード方法を選択:\n\n` +
      `[OK] リネームしてダウンロード\n→ ${renamedFileName}\n\n` +
      `[キャンセル] 元のファイル名でダウンロード\n→ ${originalFileName}`,
  );

  if (choice) {
    triggerDownload(url, renamedFileName);
  } else {
    triggerDownload(url, null);
  }
}

/**
 * ダウンロードをトリガー
 * @param {string} url
 * @param {string | null} filename - nullの場合は元のファイル名を使用
 */
function triggerDownload(url, filename) {
  log("Triggering download:", { url, filename });

  // background.jsにメッセージを送信
  chrome.runtime.sendMessage(
    {
      type: "DOWNLOAD_FILE",
      url: url,
      filename: filename, // nullならリネームしない
      rename: filename !== null,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        log("Error sending message:", chrome.runtime.lastError);
        // フォールバック: 直接ダウンロード
        window.open(url, "_blank");
      } else {
        log("Download initiated:", response);
      }
    },
  );
}

function triggerBlobDownload(url, filename) {
  log("Triggering blob download:", { url, filename });

  return new Promise((resolve, reject) => {
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

// ============================================================
// PDF to Image Conversion
// ============================================================

/**
 * ダウンロードウィンドウ用の「画像として保存」ボタンを作成
 * PDFビューアを開いて、そこで画像保存を行う
 * @param {string} pdfUrl - PDFのURL
 * @param {string} baseFileName - ベースファイル名（拡張子なし）
 * @returns {HTMLButtonElement}
 */
function createSaveAsImageButton(pdfUrl, baseFileName) {
  const imageBtn = document.createElement("button");
  imageBtn.type = "button";
  imageBtn.className = "ux-download-btn ux-download-image";
  imageBtn.innerHTML = "画像として保存<br><small>PDFビューアで開く</small>";
  imageBtn.title = `PDFを画像として保存: ${baseFileName}`;
  imageBtn.style.cssText = "padding: 10px 16px; font-size: 14px;";

  imageBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    imageBtn.disabled = true;
    imageBtn.innerHTML =
      "⏳ 開いています...<br><small>しばらくお待ちください</small>";

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: "CONVERT_PDF_TO_IMAGES",
            url: pdfUrl,
            baseFileName: baseFileName,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          },
        );
      });

      if (response && response.success) {
        imageBtn.innerHTML =
          "ビューアで開きました<br><small>画像ボタンを押してください</small>";
      } else {
        throw new Error(response?.error || "Unknown error");
      }
    } catch (error) {
      log("Error opening PDF viewer:", error);
      imageBtn.innerHTML = "エラー<br><small>開けませんでした</small>";
    }

    setTimeout(() => {
      imageBtn.innerHTML = "画像として保存<br><small>PDFビューアで開く</small>";
      imageBtn.disabled = false;
    }, 3000);
  });

  return imageBtn;
}

/**
 * PDFビューア用の「画像として保存」ボタンを作成
 * PDFビューアの既存のPDFDocumentを使用
 * @param {string} baseFileName - ベースファイル名（拡張子なし）
 * @returns {HTMLButtonElement}
 */
function createSaveAsImageButtonForViewer(baseFileName) {
  const imageBtn = document.createElement("button");
  imageBtn.type = "button";
  imageBtn.className = "ux-download-btn ux-download-image";
  imageBtn.innerHTML = "画像";
  imageBtn.title = `PDFを画像として保存: ${baseFileName}`;

  imageBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    imageBtn.disabled = true;
    const originalText = imageBtn.innerHTML;
    imageBtn.innerHTML = "⏳";

    try {
      await convertViewerPdfToImages(baseFileName);
      imageBtn.innerHTML = "完了";
      setTimeout(() => {
        imageBtn.innerHTML = originalText;
        imageBtn.disabled = false;
      }, 2000);
    } catch (error) {
      log("Error converting PDF to images:", error);
      imageBtn.innerHTML = "失敗";
      setTimeout(() => {
        imageBtn.innerHTML = originalText;
        imageBtn.disabled = false;
      }, 3000);
    }
  });

  return imageBtn;
}

/**
 * PDFビューア用の「画像としてクリップボードにコピー」ボタンを作成
 * 現在表示中のページをクリップボードにコピー
 * @returns {HTMLButtonElement}
 */
function createCopyAsImageButtonForViewer() {
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "ux-download-btn ux-download-copy";
  copyBtn.innerHTML = "コピー";
  copyBtn.title = "現在のページを画像としてクリップボードにコピー";

  copyBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    copyBtn.disabled = true;
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = "⏳";

    try {
      await copyCurrentPageToClipboard();
      copyBtn.innerHTML = "完了";
      setTimeout(() => {
        copyBtn.innerHTML = originalText;
        copyBtn.disabled = false;
      }, 2000);
    } catch (error) {
      log("Error copying to clipboard:", error);
      copyBtn.innerHTML = "失敗";
      setTimeout(() => {
        copyBtn.innerHTML = originalText;
        copyBtn.disabled = false;
      }, 3000);
    }
  });

  return copyBtn;
}

/**
 * 現在表示中のPDFページをクリップボードにコピー
 */
async function copyCurrentPageToClipboard() {
  log("Copying current page to clipboard");

  // 現在表示中のページを取得
  const viewerContainer = document.getElementById("viewerContainer");
  if (!viewerContainer) {
    throw new Error("Viewer container not found");
  }

  // 表示領域の中央にあるページを特定
  const containerRect = viewerContainer.getBoundingClientRect();
  const centerY = containerRect.top + containerRect.height / 2;

  const pageContainers = document.querySelectorAll(".page[data-page-number]");
  let currentPage = null;

  for (const page of pageContainers) {
    const pageRect = page.getBoundingClientRect();
    if (pageRect.top <= centerY && pageRect.bottom >= centerY) {
      currentPage = page;
      break;
    }
  }

  // 中央にページがない場合は最も近いページを選択
  if (!currentPage && pageContainers.length > 0) {
    let minDistance = Infinity;
    for (const page of pageContainers) {
      const pageRect = page.getBoundingClientRect();
      const pageCenter = pageRect.top + pageRect.height / 2;
      const distance = Math.abs(pageCenter - centerY);
      if (distance < minDistance) {
        minDistance = distance;
        currentPage = page;
      }
    }
  }

  if (!currentPage) {
    throw new Error("No page found");
  }

  const pageNum = currentPage.dataset.pageNumber;
  log(`Copying page ${pageNum}`);

  // Canvas要素を取得
  const canvas = currentPage.querySelector("canvas");
  if (!canvas) {
    throw new Error("Canvas not found for current page");
  }

  // CanvasをBlobに変換
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Failed to create blob from canvas"));
      }
    }, "image/png");
  });

  // クリップボードにコピー
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob,
      }),
    ]);
    log(`Page ${pageNum} copied to clipboard`);
  } catch (error) {
    // Clipboard API が使えない場合のフォールバック
    log("Clipboard API failed, trying fallback:", error);
    throw new Error(
      "クリップボードへのコピーに失敗しました。ブラウザの権限を確認してください。",
    );
  }
}

/**
 * PDFビューアから既存のCanvas要素をキャプチャして画像としてダウンロード
 * CSP制限を回避するため、既にレンダリングされているCanvasを使用
 * @param {string} baseFileName - ベースファイル名（拡張子なし）
 */
async function convertViewerPdfToImages(baseFileName) {
  log("Converting viewer PDF to images using existing canvases");

  // PDFビューアのページコンテナを取得
  const pageContainers = document.querySelectorAll(".page[data-page-number]");

  if (pageContainers.length === 0) {
    throw new Error("PDF pages not found");
  }

  log(`Found ${pageContainers.length} pages`);

  // 全ページを表示させるためにスクロール
  // まず現在のスクロール位置を保存
  const originalScrollTop =
    document.getElementById("viewerContainer")?.scrollTop || 0;

  const images = [];

  for (let i = 0; i < pageContainers.length; i++) {
    const pageContainer = pageContainers[i];
    const pageNum = parseInt(pageContainer.dataset.pageNumber, 10);

    log(`Processing page ${pageNum}`);

    // ページを表示領域にスクロール
    pageContainer.scrollIntoView();

    // レンダリングを待つ
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Canvas要素を取得
    let canvas = pageContainer.querySelector("canvas");

    if (!canvas) {
      log(`Canvas not found for page ${pageNum}, waiting...`);
      // レンダリングを待つ
      await new Promise((resolve) => setTimeout(resolve, 1000));
      canvas = pageContainer.querySelector("canvas");
    }

    if (!canvas) {
      log(`Canvas still not found for page ${pageNum}, skipping`);
      continue;
    }

    try {
      // Canvasから画像データを取得
      const imageData = canvas.toDataURL("image/png");
      images.push({ pageNum, imageData });
      log(`Captured page ${pageNum}`);
    } catch (e) {
      log(`Error capturing page ${pageNum}:`, e);
      // tainted canvasの場合はスキップ
    }
  }

  // スクロール位置を復元
  const viewerContainer = document.getElementById("viewerContainer");
  if (viewerContainer) {
    viewerContainer.scrollTop = originalScrollTop;
  }

  if (images.length === 0) {
    throw new Error("No pages could be captured");
  }

  log(`Captured ${images.length} pages, starting download`);

  // 画像をダウンロード
  for (let i = 0; i < images.length; i++) {
    const { pageNum, imageData } = images[i];
    const fileName =
      images.length === 1
        ? `${baseFileName}.png`
        : `${baseFileName}_${String(pageNum).padStart(3, "0")}.png`;

    await downloadBase64AsImage(imageData, fileName);

    if (i < images.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  log("All pages downloaded");
}

/**
 * PDFをURLからフェッチして画像に変換
 * ダウンロードウィンドウから使用する場合、PDFビューアを開く方式を使用
 * @param {string} pdfUrl - PDFのURL
 * @param {string} baseFileName - ベースファイル名（拡張子なし）
 */
async function convertPdfToImages(pdfUrl, baseFileName) {
  log("Converting PDF to images from URL:", pdfUrl);

  // background.jsにPDF変換をリクエスト
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "CONVERT_PDF_TO_IMAGES",
        url: pdfUrl,
        baseFileName: baseFileName,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          log("Error:", chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response && response.success) {
          resolve();
        } else {
          reject(new Error(response?.error || "Unknown error"));
        }
      },
    );
  });
}

/**
 * Canvasを画像としてダウンロード
 * @param {HTMLCanvasElement} canvas
 * @param {string} fileName
 */
async function downloadCanvasAsImage(canvas, fileName) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to create blob"));
        return;
      }

      // Blob URLを作成
      const blobUrl = URL.createObjectURL(blob);

      // background.jsにダウンロードリクエストを送信
      chrome.runtime.sendMessage(
        {
          type: "DOWNLOAD_BLOB",
          url: blobUrl,
          filename: fileName,
        },
        (response) => {
          // Blob URLを解放
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

          if (chrome.runtime.lastError) {
            log("Error sending download message:", chrome.runtime.lastError);
            // フォールバック: 直接ダウンロード
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            resolve();
          } else {
            log("Image download initiated:", response);
            resolve();
          }
        },
      );
    }, "image/png");
  });
}

/**
 * Base64画像データをダウンロード
 * @param {string} base64Data - data:image/png;base64,... 形式
 * @param {string} fileName
 */
async function downloadBase64AsImage(base64Data, fileName) {
  return new Promise((resolve, reject) => {
    try {
      // Base64をBlobに変換
      const byteString = atob(base64Data.split(",")[1]);
      const mimeType = base64Data.split(",")[0].split(":")[1].split(";")[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: mimeType });

      // Blob URLを作成
      const blobUrl = URL.createObjectURL(blob);

      // 直接ダウンロード（aタグ使用）
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Blob URLを解放
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      log("Image downloaded:", fileName);
      resolve();
    } catch (error) {
      log("Error downloading image:", error);
      reject(error);
    }
  });
}

// ============================================================
// Frame Support
// ============================================================

/**
 * フレーム内のコンテンツを監視して強化
 */
function observeFrames() {
  if (!isUxExtensionVisualEnabled()) return;

  // 現在のフレームを処理
  enhanceDownloadLinks();

  // MutationObserverでDOMの変更を監視
  const observer = new MutationObserver((mutations) => {
    let shouldEnhance = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldEnhance = true;
        break;
      }
    }
    if (shouldEnhance) {
      if (!isUxExtensionVisualEnabled()) return;
      // デバウンス
      clearTimeout(window.uxEnhanceTimeout);
      window.uxEnhanceTimeout = setTimeout(() => {
        if (!isUxExtensionVisualEnabled()) return;
        enhanceDownloadLinks();
      }, 500);
    }
  });

  if (
    safeObserveUxMutation(observer, document.body, {
      childList: true,
      subtree: true,
    })
  ) {
    document.__uxDownloadObserver = observer;
  }
}

// ============================================================
// Shiryou (資料) Page UI Enhancement
// ============================================================

const UX_SHIRYOU_DISPLAY_MODE_EXTENSION = "extension";
const UX_SHIRYOU_DISPLAY_MODE_ORIGIN = "origin";
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
        border: none;
        border-radius: 6px;
        cursor: pointer;
        background: transparent;
        color: var(--ux-home-secondary-label);
        transition: all 0.2s ease;
    `;
  button.onmouseover = () => {
    button.style.background = "var(--ux-home-fill)";
    button.style.color = "var(--ux-home-label)";
  };
  button.onmouseout = () => {
    button.style.background = "transparent";
    button.style.color = "var(--ux-home-secondary-label)";
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

  doc.documentElement.style.backgroundColor = "#ffffff";
  doc.body.style.backgroundColor = "#ffffff";

  if (!headerHost) return;

  headerHost.style.backgroundColor = "#ffffff";

  headerHost.querySelectorAll("table").forEach((table) => {
    table.style.backgroundColor = "#ffffff";
  });

  headerHost.querySelectorAll("td, th").forEach((cell) => {
    const label = cell.textContent?.replace(/\s+/g, "").trim();
    if (label === "教材") return;
    cell.style.backgroundColor = "#ffffff";
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

  ensureCourseColorTokens(doc);

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
        border: 1px solid #d7d7d7;
        border-radius: 6px;
        background: #f7f7f7;
        color: #1d1d1f;
        cursor: pointer;
        box-shadow: none;
        box-sizing: border-box;
        line-height: 1;
    `;
  button.onmouseover = () => {
    button.style.background = "#eeeeee";
    button.style.borderColor = "#c7c7c7";
    button.style.color = "#1d1d1f";
  };
  button.onmouseout = () => {
    button.style.background = "#f7f7f7";
    button.style.borderColor = "#d7d7d7";
    button.style.color = "#1d1d1f";
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

// ============================================================
// Shiken (試験) Page UI Enhancement
// ============================================================

function enhanceShikenPageUI() {
  if (!isUxExtensionVisualEnabled()) return;
  bindShikenVisualReinitMessageListener();
  rememberUxOriginalBodyState(document);
  rememberUxOriginalFrameStructure(document);
  rememberUxOriginalShikenFrameStructure(document);
  const url = window.location.href;
  const rootDoc = getShikenRootDocument();

  if (isShikenOriginLayoutActive(rootDoc)) {
    if (url.includes("qstn_frame.php")) {
      applyShikenOriginLayoutOnlyMode(document);
      return;
    }
    restoreUxShikenOriginDocument(document);
    if (isMainShikenLayoutButtonFrame(document)) {
      ensureShikenLayoutToggleControl(document, rootDoc, { originOnly: true });
      syncShikenLayoutToggleControls(rootDoc, UX_SHIKEN_LAYOUT_ORIGIN);
    }
    return;
  }

  const isOneByOne = isOneByOneShikenContext();

  if (isOneByOne && url.includes("qstn_frame.php")) {
    enhanceOneByOneShikenFrameset();
    return;
  }

  if (isOneByOne && url.includes("dqstn_button.php")) {
    enhanceOneByOneShikenButtonFrame();
    return;
  }

  if (isOneByOne && url.includes("dqstn_question.php")) {
    enhanceOneByOneShikenQuestionFrame();
    return;
  }

  if (isOneByOne && url.includes("dqstn_answer.php")) {
    enhanceOneByOneShikenAnswerFrame();
    return;
  }

  if (isOneByOne && url.includes("reslt_description.php")) {
    enhanceOneByOneShikenDescriptionFrame();
    return;
  }

  if (url.includes("qstn_frame.php")) {
    enhanceShikenFrameset();
    return;
  }

  if (url.includes("dqstn_button.php")) {
    enhanceShikenButtonFrame();
    return;
  }

  if (url.includes("dqstn_question.php")) {
    enhanceShikenQuestionFrame();
    return;
  }

  if (url.includes("dqstn_answer.php")) {
    enhanceShikenAnswerFrame();
    return;
  }

  if (url.includes("dqstn_answer_all.php")) {
    enhanceShikenAnswerFrame();
    return;
  }

  if (url.includes("reslt_description.php")) {
    enhanceOneByOneShikenDescriptionFrame();
  }
}

function hasOneByOneShikenFrameset(doc = document) {
  if (!doc) return false;
  return !!(
    doc.querySelector('frame[name="button"]') &&
    doc.querySelector('frame[name="question"]') &&
    doc.querySelector('frame[name="answer"]') &&
    doc.querySelector('frame[name="description"]')
  );
}

function isOneByOneShikenContext() {
  const url = window.location.href;

  if (url.includes("qstn_frame.php")) {
    return hasOneByOneShikenFrameset(document);
  }

  try {
    if (
      window.top &&
      window.top.document &&
      hasOneByOneShikenFrameset(window.top.document)
    ) {
      return true;
    }
  } catch (e) {
    // Cross-frame timing can fail while WebClass is still loading.
  }

  const frameName = String(window.name || "");
  if (["button", "question", "answer", "description"].includes(frameName)) {
    try {
      const parentDoc = window.parent?.document;
      if (
        parentDoc &&
        parentDoc !== document &&
        hasOneByOneShikenFrameset(parentDoc)
      ) {
        return true;
      }
    } catch (e) {
      // Cross-frame timing can fail while WebClass is still loading.
    }
  }

  return false;
}

function getDirectChildFrame(parent, name) {
  if (!parent) return null;
  return (
    Array.from(parent.children).find(
      (child) =>
        child.tagName === "FRAME" && child.getAttribute("name") === name,
    ) || null
  );
}

function getDirectChildFrameset(parent, attrName, childNames = []) {
  if (!parent) return null;
  return (
    Array.from(parent.children).find((child) => {
      if (child.tagName !== "FRAMESET" || !child.hasAttribute(attrName))
        return false;
      return childNames.every((name) => !!getDirectChildFrame(child, name));
    }) || null
  );
}

const UX_SHIKEN_LAYOUT_HORIZONTAL = "horizontal";
const UX_SHIKEN_LAYOUT_VERTICAL = "vertical";
const UX_SHIKEN_LAYOUT_ORIGIN = "origin";
const UX_SHIKEN_LAYOUT_SESSION_KEY_PREFIX = "uxShikenLayoutMode";
const UX_SHIKEN_VERTICAL_COLS_SESSION_KEY_PREFIX = "uxShikenVerticalCols";
const UX_SHIKEN_HORIZONTAL_QUESTION_HEIGHT_SESSION_KEY_PREFIX =
  "uxShikenHorizontalQuestionHeight";
const UX_SHIKEN_VISUAL_REINIT_MESSAGE = "UX_SHIKEN_VISUAL_REINIT_REQUEST";
const UX_SHIKEN_ORIGIN_LAYOUT_STYLE_ID = "ux-shiken-origin-layout-style";
const UX_SHIKEN_DEFAULT_LEFT_WIDTH = 280;
const UX_SHIKEN_DEFAULT_RIGHT_WIDTH = 430;
const UX_SHIKEN_HORIZONTAL_QUESTION_MIN_HEIGHT = 280;
const UX_SHIKEN_HORIZONTAL_QUESTION_MAX_HEIGHT = 20000;

function normalizeShikenLayoutMode(mode) {
  if (mode === UX_SHIKEN_LAYOUT_ORIGIN) return UX_SHIKEN_LAYOUT_ORIGIN;
  return mode === UX_SHIKEN_LAYOUT_VERTICAL
    ? UX_SHIKEN_LAYOUT_VERTICAL
    : UX_SHIKEN_LAYOUT_HORIZONTAL;
}

function getShikenLayoutContentId(doc = document) {
  const urls = [];
  try {
    urls.push(doc.location?.href || "");
  } catch {}

  try {
    doc.querySelectorAll("frame, iframe").forEach((frame) => {
      const src = frame.getAttribute("src") || frame.src || "";
      if (src) urls.push(src);
    });
  } catch {}

  for (const rawUrl of urls) {
    try {
      const url = new URL(rawUrl, doc.location?.href || window.location.href);
      const setContentsId = url.searchParams.get("set_contents_id");
      if (setContentsId) return setContentsId;
    } catch {}
  }

  return "current";
}

function getShikenLayoutSessionKey(doc = document) {
  return `${UX_SHIKEN_LAYOUT_SESSION_KEY_PREFIX}:${getShikenLayoutContentId(doc)}`;
}

function getShikenVerticalColsSessionKey(doc = document, splitType = "nested") {
  return `${UX_SHIKEN_VERTICAL_COLS_SESSION_KEY_PREFIX}:${getShikenLayoutContentId(doc)}:${splitType}`;
}

function readShikenLayoutOverride(doc = document) {
  try {
    const value = sessionStorage.getItem(getShikenLayoutSessionKey(doc));
    if (
      value === UX_SHIKEN_LAYOUT_HORIZONTAL ||
      value === UX_SHIKEN_LAYOUT_VERTICAL ||
      value === UX_SHIKEN_LAYOUT_ORIGIN
    ) {
      return value;
    }
  } catch {}
  return "";
}

function saveShikenLayoutOverride(mode, doc = document) {
  try {
    sessionStorage.setItem(
      getShikenLayoutSessionKey(doc),
      normalizeShikenLayoutMode(mode),
    );
  } catch {}
}

function readShikenVerticalCols(
  doc = document,
  splitType = "nested",
  fallback = "",
) {
  try {
    const value = sessionStorage.getItem(
      getShikenVerticalColsSessionKey(doc, splitType),
    );
    if (
      /^\s*(?:\d+%?|\*)\s*,\s*(?:\d+%?|\*)\s*(?:,\s*(?:\d+%?|\*)\s*)?$/.test(
        value || "",
      )
    ) {
      return value;
    }
  } catch {}
  return fallback;
}

function saveShikenVerticalCols(cols, doc = document, splitType = "nested") {
  if (!cols) return;
  try {
    sessionStorage.setItem(
      getShikenVerticalColsSessionKey(doc, splitType),
      cols,
    );
  } catch {}
}

function getShikenHorizontalQuestionHeightSessionKey(doc = document) {
  return `${UX_SHIKEN_HORIZONTAL_QUESTION_HEIGHT_SESSION_KEY_PREFIX}:${getShikenLayoutContentId(doc)}`;
}

function getDefaultShikenHorizontalQuestionHeight(doc = document) {
  const viewportHeight = doc.defaultView?.innerHeight || 720;
  return Math.max(420, Math.round(viewportHeight * 0.68));
}

function readShikenHorizontalQuestionHeight(doc = document) {
  try {
    const height = parseInt(
      sessionStorage.getItem(
        getShikenHorizontalQuestionHeightSessionKey(doc),
      ) || "",
      10,
    );
    if (
      Number.isFinite(height) &&
      height >= UX_SHIKEN_HORIZONTAL_QUESTION_MIN_HEIGHT &&
      height <= UX_SHIKEN_HORIZONTAL_QUESTION_MAX_HEIGHT
    ) {
      return height;
    }
  } catch {}
  return getDefaultShikenHorizontalQuestionHeight(doc);
}

function saveShikenHorizontalQuestionHeight(height, doc = document) {
  if (!Number.isFinite(height)) return;
  try {
    sessionStorage.setItem(
      getShikenHorizontalQuestionHeightSessionKey(doc),
      String(Math.round(height)),
    );
  } catch {}
}

function getShikenFramesetStructure(doc = document) {
  const outerFrameset =
    doc.querySelector("frameset[rows]") || doc.querySelector("frameset");
  const mainFrameset =
    Array.from(doc.querySelectorAll("frameset")).find((frameset) => {
      return !!getDirectChildFrame(frameset, "button");
    }) || null;

  if (!mainFrameset) {
    return {
      outerFrameset,
      mainFrameset: null,
      contentRows: null,
      contentCols: null,
      buttonFrame: null,
      questionFrame: null,
      answerFrame: null,
      directQuestionFrame: null,
      directAnswerFrame: null,
    };
  }

  const contentRows =
    getDirectChildFrameset(mainFrameset, "rows", ["question", "answer"]) ||
    Array.from(mainFrameset.querySelectorAll("frameset[rows]")).find(
      (frameset) => {
        return (
          !!getDirectChildFrame(frameset, "question") &&
          !!getDirectChildFrame(frameset, "answer")
        );
      },
    ) ||
    null;
  const contentCols =
    getDirectChildFrameset(mainFrameset, "cols", ["question", "answer"]) ||
    Array.from(mainFrameset.querySelectorAll("frameset[cols]")).find(
      (frameset) => {
        return (
          frameset !== mainFrameset &&
          !!getDirectChildFrame(frameset, "question") &&
          !!getDirectChildFrame(frameset, "answer")
        );
      },
    ) ||
    null;

  const buttonFrame =
    getDirectChildFrame(mainFrameset, "button") ||
    mainFrameset.querySelector('frame[name="button"]');
  const directQuestionFrame = getDirectChildFrame(mainFrameset, "question");
  const directAnswerFrame = getDirectChildFrame(mainFrameset, "answer");
  const questionFrame =
    directQuestionFrame ||
    getDirectChildFrame(contentRows, "question") ||
    getDirectChildFrame(contentCols, "question") ||
    mainFrameset.querySelector('frame[name="question"]');
  const answerFrame =
    directAnswerFrame ||
    getDirectChildFrame(contentRows, "answer") ||
    getDirectChildFrame(contentCols, "answer") ||
    mainFrameset.querySelector('frame[name="answer"]');

  return {
    outerFrameset,
    mainFrameset,
    contentRows,
    contentCols,
    buttonFrame,
    questionFrame,
    answerFrame,
    directQuestionFrame,
    directAnswerFrame,
  };
}

function getFrameSource(frame) {
  if (!frame) return "";
  try {
    const href = frame.contentWindow?.location?.href || "";
    if (href && href !== "about:blank") return href;
  } catch {}
  return frame.getAttribute("src") || frame.src || "";
}

function isLikelyPdfOrAttachmentUrl(rawUrl, baseUrl = window.location.href) {
  if (!rawUrl) return false;
  const decoded = (() => {
    try {
      return decodeURIComponent(rawUrl);
    } catch {
      return rawUrl;
    }
  })();
  if (/loadit\.php/i.test(decoded) || /\.pdf(?:$|[?#&])/i.test(decoded)) {
    return true;
  }

  try {
    const url = new URL(rawUrl, baseUrl);
    const file = url.searchParams.get("file") || "";
    const image = url.searchParams.get("image") || "";
    if (file.trim() || image.trim()) {
      return true;
    }
  } catch {}

  return false;
}

function hasShikenPdfQuestionFrame(doc = document) {
  const { questionFrame } = getShikenFramesetStructure(doc);
  return isLikelyPdfOrAttachmentUrl(
    getFrameSource(questionFrame),
    doc.location?.href || window.location.href,
  );
}

function isSinglePaneShikenAnswerLayout(doc = document) {
  const structure = getShikenFramesetStructure(doc);
  if (structure.directQuestionFrame && structure.directAnswerFrame) {
    return true;
  }

  if (structure.answerFrame && !structure.questionFrame) {
    return true;
  }

  const frameSources = [];
  try {
    doc.querySelectorAll("frame, iframe").forEach((frame) => {
      frameSources.push(getFrameSource(frame));
    });
  } catch {}

  return frameSources.some((src) => {
    if (!src) return false;
    return /dqstn_answer_all\.php/i.test(src);
  });
}

function getDefaultShikenLayoutMode(doc = document) {
  if (hasOneByOneShikenFrameset(doc)) {
    return UX_SHIKEN_LAYOUT_HORIZONTAL;
  }
  if (hasShikenPdfQuestionFrame(doc) || isSinglePaneShikenAnswerLayout(doc)) {
    return UX_SHIKEN_LAYOUT_VERTICAL;
  }
  return UX_SHIKEN_LAYOUT_HORIZONTAL;
}

function resolveInitialShikenLayoutMode(doc = document) {
  return readShikenLayoutOverride(doc) || getDefaultShikenLayoutMode(doc);
}

function setShikenFrameResizePolicy(frame, resizable = false) {
  if (!frame) return;
  frame.setAttribute("scrolling", "auto");
  frame.setAttribute("frameborder", "0");
  if (resizable) {
    frame.removeAttribute("noresize");
  } else {
    frame.setAttribute("noresize", "");
  }
}

function enableUxAutoOverflowScrolling(doc = document) {
  if (!doc || doc.getElementById("ux-auto-overflow-scroll-style")) return;

  try {
    const style = doc.createElement("style");
    style.id = "ux-auto-overflow-scroll-style";
    style.textContent = `
            html,
            body {
                overflow-y: auto;
                overflow-x: hidden;
                overscroll-behavior: contain;
            }
        `;
    doc.head?.appendChild(style);
  } catch {
    // ignore inaccessible documents
  }
}

function ensureUxFrameActionButtonFit(doc = document) {
  if (!doc || doc.getElementById("ux-frame-action-button-fit-style")) return;

  try {
    const style = markUxCourseStyle(doc.createElement("style"));
    style.id = "ux-frame-action-button-fit-style";
    style.textContent = `
            button,
            input[type="button"],
            input[type="submit"] {
                max-width: 100%;
                box-sizing: border-box;
            }

            .ux-answer-actions,
            #naviLayout {
                --ux-frame-action-inline-inset: 8px;
                width: calc(100% - (var(--ux-frame-action-inline-inset) * 2)) !important;
                min-width: 0 !important;
                max-width: calc(100% - (var(--ux-frame-action-inline-inset) * 2)) !important;
                box-sizing: border-box !important;
                margin-left: var(--ux-frame-action-inline-inset) !important;
                margin-right: var(--ux-frame-action-inline-inset) !important;
                padding-left: 0 !important;
                padding-right: 0 !important;
            }

            form[name="button_form"] {
                width: 100% !important;
                min-width: 0 !important;
                max-width: 100% !important;
                box-sizing: border-box !important;
                margin-left: 0 !important;
                margin-right: 0 !important;
                padding-left: 0 !important;
                padding-right: 0 !important;
            }

            .ux-shiken-nav-row,
            .ux-shiken-action-row,
            .ux-answer-nav,
            .ux-answer-primary-actions {
                width: 100% !important;
                min-width: 0 !important;
                max-width: 100% !important;
                box-sizing: border-box !important;
                margin-left: 0 !important;
                margin-right: 0 !important;
                padding-left: 0 !important;
                padding-right: 0 !important;
            }

            .ux-shiken-nav-row > .ux-btn,
            .ux-shiken-action-row > .ux-btn,
            .ux-shiken-nav-row > button,
            .ux-shiken-action-row > button {
                width: 100% !important;
                justify-self: stretch !important;
            }

            .ux-btn,
            .ux-shiken-nav-row button,
            .ux-shiken-action-row button,
            .ux-answer-nav button,
            .ux-answer-primary-actions button,
            form[name="button_form"] button,
            form[name="button_form"] input[type="button"],
            form[name="button_form"] input[type="submit"],
            #naviLayout button,
            #naviLayout input[type="button"],
            #PrevButton,
            #NextButton,
            input[name="pre"],
            input[name="next"],
            input[name="grade"],
            input[name="quit"],
            input[value="資料を閉じる"] {
                min-width: 0 !important;
                max-width: 100% !important;
                box-sizing: border-box !important;
                margin-left: 0 !important;
                margin-right: 0 !important;
                white-space: normal !important;
                overflow-wrap: anywhere !important;
                text-align: center !important;
            }

            #naviLayout {
                border-collapse: collapse !important;
                border-spacing: 0 !important;
            }

            #naviLayout td {
                box-sizing: border-box !important;
            }

            #naviLayout td:first-child {
                padding-left: 0 !important;
            }

            #naviLayout td:last-child {
                padding-right: 0 !important;
            }
        `;
    (doc.head || doc.documentElement).appendChild(style);
  } catch {
    // ignore inaccessible documents
  }
}

function hideShikenTitleRow(outerFrameset) {
  if (!outerFrameset) return;
  const rows = outerFrameset.getAttribute("rows");
  if (rows && !rows.startsWith("0")) {
    outerFrameset.setAttribute("rows", rows.replace(/^\s*\d+%?/, "0"));
  }
}

function setFramesetChrome(
  frameset,
  { border = "0", frameborder = "0", framespacing = "0" } = {},
) {
  if (!frameset) return;
  frameset.setAttribute("border", border);
  frameset.setAttribute("frameborder", frameborder);
  frameset.setAttribute("framespacing", framespacing);
}

function getDefaultDirectVerticalCols() {
  return `${UX_SHIKEN_DEFAULT_LEFT_WIDTH},*,${UX_SHIKEN_DEFAULT_RIGHT_WIDTH}`;
}

function createNestedShikenContentRows(
  doc,
  mainFrameset,
  questionFrame,
  answerFrame,
) {
  if (!doc || !mainFrameset || !questionFrame || !answerFrame) return null;

  const contentRows = doc.createElement("frameset");
  contentRows.setAttribute("rows", "164,*");
  setFramesetChrome(contentRows);

  const insertionPoint = questionFrame;
  mainFrameset.insertBefore(contentRows, insertionPoint);
  contentRows.appendChild(questionFrame);
  contentRows.appendChild(answerFrame);

  return contentRows;
}

function flattenShikenContentFrames(
  mainFrameset,
  splitFrameset,
  questionFrame,
  answerFrame,
) {
  if (!mainFrameset || !splitFrameset || !questionFrame || !answerFrame)
    return false;

  mainFrameset.insertBefore(questionFrame, splitFrameset);
  mainFrameset.insertBefore(answerFrame, splitFrameset);
  splitFrameset.remove();
  return true;
}

function applyVerticalShikenLayout(doc = document) {
  rememberUxOriginalFrameStructure(doc);
  rememberUxOriginalShikenFrameStructure(doc);

  let structure = getShikenFramesetStructure(doc);
  if (!structure.mainFrameset) return false;

  hideShikenTitleRow(structure.outerFrameset);

  if (structure.contentRows || structure.contentCols) {
    const splitFrameset = structure.contentRows || structure.contentCols;
    flattenShikenContentFrames(
      structure.mainFrameset,
      splitFrameset,
      structure.questionFrame,
      structure.answerFrame,
    );
    structure = getShikenFramesetStructure(doc);
  }

  const {
    mainFrameset,
    buttonFrame,
    questionFrame,
    answerFrame,
    directQuestionFrame,
    directAnswerFrame,
  } = structure;

  setShikenFrameResizePolicy(buttonFrame, false);
  setShikenFrameResizePolicy(questionFrame, true);
  setShikenFrameResizePolicy(answerFrame, true);

  if (directQuestionFrame && directAnswerFrame) {
    mainFrameset.setAttribute(
      "cols",
      readShikenVerticalCols(doc, "direct", getDefaultDirectVerticalCols()),
    );
    mainFrameset.removeAttribute("rows");
    mainFrameset.dataset.uxShikenSplit = "vertical";
    setFramesetChrome(mainFrameset, {
      border: "4",
      frameborder: "1",
      framespacing: "4",
    });
    return true;
  }

  if (buttonFrame && answerFrame) {
    mainFrameset.setAttribute("cols", `${UX_SHIKEN_DEFAULT_LEFT_WIDTH},*`);
    mainFrameset.removeAttribute("rows");
    setFramesetChrome(mainFrameset);
    return true;
  }

  return false;
}

function applyHorizontalShikenLayout(doc = document) {
  rememberUxOriginalFrameStructure(doc);
  rememberUxOriginalShikenFrameStructure(doc);

  let structure = getShikenFramesetStructure(doc);
  if (!structure.mainFrameset) return false;

  hideShikenTitleRow(structure.outerFrameset);

  const {
    mainFrameset,
    contentRows,
    contentCols,
    buttonFrame,
    questionFrame,
    answerFrame,
    directQuestionFrame,
    directAnswerFrame,
  } = structure;

  let splitFrameset = contentRows || contentCols;
  if (!splitFrameset && directQuestionFrame && directAnswerFrame) {
    splitFrameset = createNestedShikenContentRows(
      doc,
      mainFrameset,
      directQuestionFrame,
      directAnswerFrame,
    );
    structure = getShikenFramesetStructure(doc);
  }

  mainFrameset.setAttribute("cols", `${UX_SHIKEN_DEFAULT_LEFT_WIDTH},*`);
  mainFrameset.removeAttribute("rows");
  setFramesetChrome(mainFrameset);

  if (splitFrameset) {
    splitFrameset.removeAttribute("cols");
    splitFrameset.setAttribute("rows", "164,*");
    splitFrameset.dataset.uxShikenSplit = "horizontal";
    setFramesetChrome(splitFrameset);
  }

  [buttonFrame, questionFrame, answerFrame].forEach((frame) =>
    setShikenFrameResizePolicy(frame, false),
  );
  return true;
}

function applyOriginShikenLayout(doc = document) {
  restoreUxOriginalShikenFrameStructure(doc);
  restoreUxOriginalFrameStructure(doc);

  try {
    doc
      .querySelectorAll("frameset[data-ux-shiken-split]")
      .forEach((frameset) => {
        delete frameset.dataset.uxShikenSplit;
      });
  } catch {
    // ignore inaccessible or partially loaded documents
  }

  return !!doc.querySelector("frameset");
}

// ---------------------------------------------------------------------------
// 単一スクロールページ・レイアウト
// frameset を1つのスクロール文書に作り替え、問題/回答フレームを内容に合わせて
// 自動高さの iframe にする。これにより (1) 問題枠が本文にフィット、(2)(3) 問題と
// 回答が一体でスクロール、(4) 左ボタンフレームが常時表示、を実現する。
// ---------------------------------------------------------------------------

function isShikenSinglePageActive(rootDoc) {
  try {
    const doc = rootDoc || getShikenRootDocument();
    return doc?.documentElement?.dataset?.uxShikenSinglePage === "true";
  } catch {
    return false;
  }
}

function ensureSinglePageShikenStyle(doc = document) {
  if (!doc || doc.getElementById("ux-shiken-single-page-style")) return;
  try {
    const style = markUxCourseStyle(doc.createElement("style"));
    style.id = "ux-shiken-single-page-style";
    style.textContent = `
            html {
                min-height: 100%;
            }
            body.ux-shiken-single-page {
                margin: 0;
                min-height: 100vh;
                display: flex;
                align-items: flex-start;
                overflow-y: auto;
                overflow-x: hidden;
                background: var(--ux-home-page-bg, #f4f4f6);
                scrollbar-gutter: stable;
            }
            body.ux-shiken-single-page > .ux-shiken-single-button {
                flex: 0 0 ${UX_SHIKEN_DEFAULT_LEFT_WIDTH}px;
                width: ${UX_SHIKEN_DEFAULT_LEFT_WIDTH}px;
                height: 100vh;
                position: sticky;
                top: 0;
                border: 0;
                background: transparent;
            }
            body.ux-shiken-single-page > .ux-shiken-scroll {
                flex: 1 1 auto;
                min-width: 0;
                min-height: 100vh;
                overflow: visible;
                display: flex;
                flex-direction: column;
                align-items: stretch;
                padding-bottom: 18px;
                box-sizing: border-box;
            }
            body.ux-shiken-single-page .ux-shiken-scroll > iframe {
                width: 100%;
                border: 0;
                display: block;
                flex: 0 0 auto;
            }
            body.ux-shiken-single-page .ux-shiken-question-resize-handle {
                position: relative;
                z-index: 5;
                width: 100%;
                height: 14px;
                min-height: 14px;
                flex: 0 0 14px;
                padding: 0;
                border: 0;
                appearance: none;
                background: transparent;
                cursor: ns-resize;
            }
            body.ux-shiken-single-page .ux-shiken-question-resize-handle::before {
                content: "";
                position: absolute;
                left: 12px;
                right: 12px;
                top: 6px;
                height: 2px;
                border-radius: 999px;
                background: var(--ux-home-separator-strong, rgba(60, 60, 67, 0.29));
                transition: height 120ms ease, top 120ms ease, background-color 120ms ease;
            }
            body.ux-shiken-single-page .ux-shiken-question-resize-handle:hover::before,
            body.ux-shiken-single-page .ux-shiken-question-resize-handle:focus-visible::before,
            body.ux-shiken-single-page.ux-shiken-question-resizing .ux-shiken-question-resize-handle::before {
                top: 5px;
                height: 4px;
                background: var(--ux-home-accent, #0071e3);
            }
            body.ux-shiken-single-page .ux-shiken-question-resize-handle:focus-visible {
                outline: 2px solid var(--ux-home-accent, #0071e3);
                outline-offset: -2px;
            }
            body.ux-shiken-single-page.ux-shiken-question-resizing,
            body.ux-shiken-single-page.ux-shiken-question-resizing * {
                cursor: ns-resize !important;
                user-select: none !important;
            }
            .ux-shiken-question-resize-shield {
                position: fixed;
                inset: 0;
                z-index: 4;
                cursor: ns-resize;
                background: transparent;
            }
        `;
    (doc.head || doc.documentElement).appendChild(style);
  } catch {
    // ignore inaccessible documents
  }
}

function bindSinglePageShikenParentMessages(doc = document) {
  const win = doc?.defaultView || window;
  if (!win || win.__uxShikenSinglePageParentMessagesBound) return;
  win.__uxShikenSinglePageParentMessagesBound = true;

  win.addEventListener("message", (event) => {
    const data = event?.data || {};
    if (
      data.type !== "UX_SHIKEN_SINGLE_PAGE_FRAME_HEIGHT" &&
      data.type !== "UX_SHIKEN_SINGLE_PAGE_FRAME_SCROLL"
    ) {
      return;
    }
    if (!isShikenSinglePageActive(doc)) return;

    const iframe = Array.from(
      doc.querySelectorAll(
        "iframe.ux-shiken-single-question, iframe.ux-shiken-single-answer",
      ),
    ).find((candidate) => {
      try {
        return candidate.contentWindow === event.source;
      } catch {
        return false;
      }
    });
    if (!iframe) return;

    if (data.type === "UX_SHIKEN_SINGLE_PAGE_FRAME_SCROLL") {
      const deltaY = Number(data.deltaY) || 0;
      const deltaX = Number(data.deltaX) || 0;
      if (!deltaY && !deltaX) return;
      try {
        win.scrollBy({ top: deltaY, left: deltaX, behavior: "auto" });
      } catch {
        win.scrollBy(deltaX, deltaY);
      }
      return;
    }

    const height = Math.ceil(Number(data.height) || 0);
    if (height <= 0) return;
    if (iframe.dataset.uxManualHeight === "true") return;
    iframe.style.height = `${Math.min(Math.max(height, 40), 20000)}px`;
  });
}

function hasShikenSinglePageAncestor() {
  let current = window;
  for (let depth = 0; depth < 8; depth += 1) {
    try {
      if (
        current.document?.documentElement?.dataset?.uxShikenSinglePage ===
        "true"
      ) {
        return true;
      }
      if (!current.parent || current.parent === current) return false;
      current = current.parent;
    } catch {
      return false;
    }
  }
  return false;
}

function bindShikenPdfScrollHandoff(doc = document) {
  if (!doc || doc.__uxShikenPdfScrollHandoffBound) return;
  if (!hasShikenSinglePageAncestor()) return;
  doc.__uxShikenPdfScrollHandoffBound = true;

  const relayToParent = (deltaY, deltaX = 0) => {
    if (window.parent === window) return;
    try {
      window.parent.postMessage(
        {
          type: "UX_SHIKEN_SINGLE_PAGE_FRAME_SCROLL",
          deltaY: Number(deltaY) || 0,
          deltaX: Number(deltaX) || 0,
        },
        "*",
      );
    } catch {}
  };

  const canScrollWithinPdf = (start, deltaY) => {
    const candidates = [];
    let node = start?.nodeType === Node.ELEMENT_NODE ? start : start?.parentElement;
    while (node && node !== doc.documentElement) {
      candidates.push(node);
      node = node.parentElement;
    }
    const scrollingElement = doc.scrollingElement;
    if (scrollingElement) candidates.push(scrollingElement);

    return candidates.some((element) => {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
      const style = getComputedStyle(element);
      const canScrollY =
        /(auto|scroll)/.test(style.overflowY || "") &&
        element.scrollHeight > element.clientHeight + 1;
      if (!canScrollY) return false;
      if (deltaY > 0) {
        return (
          element.scrollTop + element.clientHeight < element.scrollHeight - 1
        );
      }
      if (deltaY < 0) return element.scrollTop > 0;
      return false;
    });
  };

  doc.addEventListener(
    "wheel",
    (event) => {
      if (!event.deltaY && !event.deltaX) return;
      if (canScrollWithinPdf(event.target, event.deltaY)) return;
      event.preventDefault();
      event.stopPropagation();
      relayToParent(event.deltaY, event.deltaX);
    },
    { passive: false, capture: true },
  );

  window.addEventListener("message", (event) => {
    const data = event?.data || {};
    if (data.type !== "UX_SHIKEN_SINGLE_PAGE_FRAME_SCROLL") return;
    const fromDirectChild = Array.from(
      doc.querySelectorAll("iframe, frame"),
    ).some(
      (iframe) => {
        try {
          return iframe.contentWindow === event.source;
        } catch {
          return false;
        }
      },
    );
    if (!fromDirectChild) return;
    relayToParent(data.deltaY, data.deltaX);
  });
}

function bindShikenHorizontalQuestionResize(
  doc,
  questionIframe,
  handle,
) {
  if (!doc || !questionIframe || !handle) return;

  const clampHeight = (height) =>
    Math.min(
      UX_SHIKEN_HORIZONTAL_QUESTION_MAX_HEIGHT,
      Math.max(UX_SHIKEN_HORIZONTAL_QUESTION_MIN_HEIGHT, Math.round(height)),
    );
  const setHeight = (height, { persist = false } = {}) => {
    const nextHeight = clampHeight(height);
    questionIframe.dataset.uxManualHeight = "true";
    questionIframe.style.height = `${nextHeight}px`;
    handle.setAttribute("aria-valuenow", String(nextHeight));
    if (persist) saveShikenHorizontalQuestionHeight(nextHeight, doc);
    return nextHeight;
  };

  const activateAttachmentHeight = () => {
    if (questionIframe.dataset.uxManualHeight === "true") return;
    if (
      !isLikelyPdfOrAttachmentUrl(
        getFrameSource(questionIframe),
        doc.location?.href || window.location.href,
      )
    ) {
      return;
    }
    setHeight(readShikenHorizontalQuestionHeight(doc));
  };

  if (questionIframe.dataset.uxManualHeight === "true") {
    setHeight(readShikenHorizontalQuestionHeight(doc));
  } else {
    const currentHeight = Math.round(
      questionIframe.getBoundingClientRect().height || 0,
    );
    handle.setAttribute("aria-valuenow", String(currentHeight));
  }
  questionIframe.addEventListener("load", activateAttachmentHeight);
  [0, 120, 500, 1200].forEach((delay) =>
    setTimeout(activateAttachmentHeight, delay),
  );

  handle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const currentHeight =
      questionIframe.getBoundingClientRect().height ||
      readShikenHorizontalQuestionHeight(doc);
    setHeight(currentHeight + (event.key === "ArrowDown" ? 24 : -24), {
      persist: true,
    });
  });

  handle.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();

    const startY = event.clientY;
    const startHeight = questionIframe.getBoundingClientRect().height;
    let latestHeight = startHeight;
    const shield = doc.createElement("div");
    shield.className = "ux-shiken-question-resize-shield";
    doc.body.appendChild(shield);
    doc.body.classList.add("ux-shiken-question-resizing");

    const onMove = (moveEvent) => {
      latestHeight = setHeight(startHeight + moveEvent.clientY - startY);
    };
    const onEnd = () => {
      doc.removeEventListener("mousemove", onMove, true);
      doc.removeEventListener("mouseup", onEnd, true);
      shield.remove();
      doc.body.classList.remove("ux-shiken-question-resizing");
      saveShikenHorizontalQuestionHeight(latestHeight, doc);
    };

    doc.addEventListener("mousemove", onMove, true);
    doc.addEventListener("mouseup", onEnd, true);
  });
}

function bindSinglePageShikenChildBridge(doc = document) {
  if (!isShikenSinglePageActive() || window.parent === window) return;
  if (doc.__uxShikenSinglePageChildBridgeBound) return;
  doc.__uxShikenSinglePageChildBridgeBound = true;

  const postToParent = (message) => {
    try {
      window.parent.postMessage(message, "*");
    } catch {}
  };

  let scheduled = false;
  const measureAndPostHeight = () => {
    scheduled = false;
    const docEl = doc.documentElement;
    const body = doc.body;
    const height = Math.max(
      docEl ? docEl.scrollHeight : 0,
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0,
    );
    if (height > 0) {
      postToParent({
        type: "UX_SHIKEN_SINGLE_PAGE_FRAME_HEIGHT",
        frameName: window.name || "",
        height,
      });
    }
  };
  const scheduleHeightPost = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(measureAndPostHeight);
  };

  const canScrollWithinFrame = (start, deltaY) => {
    let node = start;
    while (node && node !== doc.documentElement) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node;
        const style = getComputedStyle(el);
        const canScrollY =
          /(auto|scroll)/.test(style.overflowY || "") &&
          el.scrollHeight > el.clientHeight + 1;
        if (canScrollY) {
          const canDown =
            deltaY > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1;
          const canUp = deltaY < 0 && el.scrollTop > 0;
          if (canDown || canUp) return true;
        }
      }
      node = node.parentElement;
    }
    return false;
  };

  doc.addEventListener(
    "wheel",
    (event) => {
      if (!event.deltaY && !event.deltaX) return;
      if (canScrollWithinFrame(event.target, event.deltaY)) return;
      event.preventDefault();
      postToParent({
        type: "UX_SHIKEN_SINGLE_PAGE_FRAME_SCROLL",
        deltaY: event.deltaY,
        deltaX: event.deltaX,
      });
    },
    { passive: false, capture: true },
  );

  doc.addEventListener(
    "keydown",
    (event) => {
      const editable = event.target?.closest?.(
        'textarea, input, select, [contenteditable="true"]',
      );
      if (editable) return;
      const viewport = window.innerHeight || 720;
      const keyDelta = {
        PageDown: viewport * 0.86,
        Space: viewport * (event.shiftKey ? -0.86 : 0.86),
        PageUp: -viewport * 0.86,
        Home: -100000,
        End: 100000,
      };
      if (!(event.key in keyDelta)) return;
      event.preventDefault();
      postToParent({
        type: "UX_SHIKEN_SINGLE_PAGE_FRAME_SCROLL",
        deltaY: keyDelta[event.key],
        deltaX: 0,
      });
    },
    true,
  );

  try {
    const ro = new ResizeObserver(scheduleHeightPost);
    if (doc.body) ro.observe(doc.body);
    if (doc.documentElement) ro.observe(doc.documentElement);
  } catch {}
  try {
    const mo = new MutationObserver(scheduleHeightPost);
    if (doc.body) {
      mo.observe(doc.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
    }
  } catch {}
  doc.addEventListener("input", scheduleHeightPost, true);
  doc.addEventListener("load", scheduleHeightPost, true);
  [0, 120, 350, 800, 1600].forEach((delay) =>
    setTimeout(scheduleHeightPost, delay),
  );
}

// 同一オリジンの iframe の高さを内容(scrollHeight)に追従させる。
// 問題/回答フレームの内部スクロールを無くし、外側の .ux-shiken-scroll で一体
// スクロールできるようにする。
function bindShikenIframeAutoHeight(iframe) {
  if (
    !iframe ||
    iframe.dataset.uxAutoHeightBound === "true" ||
    iframe.dataset.uxManualHeight === "true"
  )
    return;
  iframe.dataset.uxAutoHeightBound = "true";

  let scheduled = false;
  let lastSetHeight = null;
  const heightThreshold = 1; // px: only update if change > threshold
  const runawayHeightCap = 20000; // px: absolute sanity check

  const measure = () => {
    scheduled = false;
    if (iframe.dataset.uxManualHeight === "true") return;
    let cdoc;
    try {
      cdoc = iframe.contentDocument;
    } catch {
      cdoc = null;
    }
    if (!cdoc) return;
    const docEl = cdoc.documentElement;
    const body = cdoc.body;
    const height = Math.max(
      docEl ? docEl.scrollHeight : 0,
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0,
    );

    if (height <= 0) return;

    // Hard cap: never set iframe height beyond sanity limit
    if (height > runawayHeightCap) {
      uxDebugWarn(
        `bindShikenIframeAutoHeight: capping runaway height`,
        `measured=${height}px, capping at ${runawayHeightCap}px`,
      );
      iframe.style.height = `${runawayHeightCap}px`;
      lastSetHeight = runawayHeightCap;
      return;
    }

    // Only update if difference exceeds threshold
    if (
      lastSetHeight === null ||
      Math.abs(height - lastSetHeight) > heightThreshold
    ) {
      iframe.style.height = `${height}px`;
      lastSetHeight = height;
    }
  };
  const scheduleMeasure = () => {
    if (scheduled) return;
    scheduled = true;
    try {
      (iframe.ownerDocument.defaultView || window).requestAnimationFrame(
        measure,
      );
    } catch {
      scheduled = false;
      measure();
    }
  };

  const attach = () => {
    let cdoc;
    try {
      cdoc = iframe.contentDocument;
    } catch {
      cdoc = null;
    }
    if (!cdoc) return;
    scheduleMeasure();
    try {
      const win = cdoc.defaultView;
      if (win && typeof win.ResizeObserver === "function") {
        const ro = new win.ResizeObserver(() => scheduleMeasure());
        if (cdoc.body) ro.observe(cdoc.body);
        if (cdoc.documentElement) ro.observe(cdoc.documentElement);
      }
      cdoc.addEventListener("input", scheduleMeasure, true);
      cdoc.addEventListener("load", scheduleMeasure, true);
      if (cdoc.fonts?.ready?.then) {
        cdoc.fonts.ready.then(scheduleMeasure).catch(() => {});
      }
    } catch {}
    // 画像/数式/非同期描画など遅れて高さが変わる要素への保険
    [120, 350, 800, 1600].forEach((delay) =>
      setTimeout(scheduleMeasure, delay),
    );
  };

  iframe.addEventListener("load", attach);
  attach();
}

function applySinglePageShikenLayout(doc = document) {
  rememberUxOriginalFrameStructure(doc);
  rememberUxOriginalShikenFrameStructure(doc);

  const structure = getShikenFramesetStructure(doc);
  if (!structure.mainFrameset) return false;
  const { buttonFrame, questionFrame, answerFrame } = structure;
  if (!answerFrame && !questionFrame) return false;

  const outerFrameset = doc.querySelector("frameset") || structure.outerFrameset;
  if (!outerFrameset?.parentNode) return false;

  // detach する前に name / src を控える
  const frameInfo = (frame, fallbackName) =>
    frame
      ? {
          name: frame.getAttribute("name") || fallbackName,
          src: getFrameSource(frame),
        }
      : null;
  const buttonInfo = frameInfo(buttonFrame, "button");
  const questionInfo = frameInfo(questionFrame, "question");
  const answerInfo = frameInfo(answerFrame, "answer");

  // 子フレームが単一ページモードを検出できるよう <html> に印を付ける
  doc.documentElement.dataset.uxShikenSinglePage = "true";

  try {
    ensureCourseColorTokens(doc);
  } catch {}
  ensureSinglePageShikenStyle(doc);
  bindSinglePageShikenParentMessages(doc);

  const makeIframe = (info, className) => {
    if (!info) return null;
    const iframe = doc.createElement("iframe");
    if (info.name) iframe.setAttribute("name", info.name);
    if (info.src) iframe.setAttribute("src", info.src);
    iframe.setAttribute("frameborder", "0");
    iframe.className = className;
    return iframe;
  };

  const body = doc.createElement("body");
  body.className = "ux-shiken-single-page";

  const buttonIframe = makeIframe(buttonInfo, "ux-shiken-single-button");
  if (buttonIframe) body.appendChild(buttonIframe);

  const scroll = doc.createElement("div");
  scroll.className = "ux-shiken-scroll";
  const questionIframe = makeIframe(questionInfo, "ux-shiken-single-question");
  const answerIframe = makeIframe(answerInfo, "ux-shiken-single-answer");
  const questionInitiallyNeedsFixedHeight =
    questionIframe &&
    isLikelyPdfOrAttachmentUrl(
      questionInfo?.src || "",
      doc.location?.href || window.location.href,
    );
  if (questionIframe) {
    if (questionInitiallyNeedsFixedHeight) {
      questionIframe.dataset.uxManualHeight = "true";
    }
    scroll.appendChild(questionIframe);
  }
  let questionResizeHandle = null;
  if (questionIframe && answerIframe) {
    questionResizeHandle = doc.createElement("button");
    questionResizeHandle.type = "button";
    questionResizeHandle.className = "ux-shiken-question-resize-handle";
    questionResizeHandle.setAttribute("role", "separator");
    questionResizeHandle.setAttribute("aria-orientation", "horizontal");
    questionResizeHandle.setAttribute(
      "aria-label",
      "PDFと回答の表示領域の高さを変更",
    );
    questionResizeHandle.setAttribute(
      "aria-valuemin",
      String(UX_SHIKEN_HORIZONTAL_QUESTION_MIN_HEIGHT),
    );
    questionResizeHandle.setAttribute(
      "aria-valuemax",
      String(UX_SHIKEN_HORIZONTAL_QUESTION_MAX_HEIGHT),
    );
    questionResizeHandle.title = "ドラッグしてPDFと回答の表示領域を調整";
    scroll.appendChild(questionResizeHandle);
  }
  if (answerIframe) scroll.appendChild(answerIframe);
  body.appendChild(scroll);

  // frameset を body に置き換え（同一オリジン・同名 iframe なので
  // frames["answer"] / target="answer" / グローバル関数はそのまま機能する）
  outerFrameset.parentNode.replaceChild(body, outerFrameset);

  if (questionIframe && questionResizeHandle) {
    bindShikenHorizontalQuestionResize(
      doc,
      questionIframe,
      questionResizeHandle,
    );
  } else if (questionIframe) {
    bindShikenIframeAutoHeight(questionIframe);
  }
  if (answerIframe) bindShikenIframeAutoHeight(answerIframe);

  return true;
}

function applySinglePageOneByOneShikenLayout(doc = document) {
  rememberUxOriginalFrameStructure(doc);
  rememberUxOriginalShikenFrameStructure(doc);

  const outerFrameset =
    doc.querySelector("frameset[rows]") || doc.querySelector("frameset");
  const mainFrameset =
    Array.from(doc.querySelectorAll("frameset[cols]")).find((frameset) =>
      !!getDirectChildFrame(frameset, "button"),
    ) || null;
  if (!outerFrameset?.parentNode || !mainFrameset) return false;

  const frameInfo = (name) => {
    const frame =
      getDirectChildFrame(mainFrameset, name) ||
      mainFrameset.querySelector(`frame[name="${name}"]`) ||
      doc.querySelector(`frame[name="${name}"]`);
    if (!frame) return null;
    return {
      name: frame.getAttribute("name") || name,
      src: getFrameSource(frame),
    };
  };

  const buttonInfo = frameInfo("button");
  const contentInfos = ["question", "answer", "description"]
    .map((name) => frameInfo(name))
    .filter(Boolean);
  if (!buttonInfo || contentInfos.length === 0) return false;

  doc.documentElement.dataset.uxShikenSinglePage = "true";
  doc.documentElement.dataset.uxShikenSinglePageKind = "onebyone";

  try {
    ensureCourseColorTokens(doc);
  } catch {}
  ensureSinglePageShikenStyle(doc);
  bindSinglePageShikenParentMessages(doc);

  const makeIframe = (info, className) => {
    const iframe = doc.createElement("iframe");
    iframe.setAttribute("name", info.name);
    if (info.src) iframe.setAttribute("src", info.src);
    iframe.setAttribute("frameborder", "0");
    iframe.className = className;
    return iframe;
  };

  const body = doc.createElement("body");
  body.className = "ux-shiken-single-page ux-shiken-onebyone-single-page";
  body.appendChild(makeIframe(buttonInfo, "ux-shiken-single-button"));

  const scroll = doc.createElement("div");
  scroll.className = "ux-shiken-scroll";
  contentInfos.forEach((info) => {
    const iframe = makeIframe(info, `ux-shiken-single-${info.name}`);
    scroll.appendChild(iframe);
    bindShikenIframeAutoHeight(iframe);
  });
  body.appendChild(scroll);

  outerFrameset.parentNode.replaceChild(body, outerFrameset);
  return true;
}

function syncShikenLayoutClasses(
  doc = document,
  mode = UX_SHIKEN_LAYOUT_HORIZONTAL,
) {
  const normalizedMode = normalizeShikenLayoutMode(mode);
  const docs = [doc];

  try {
    const frameWindows = doc.defaultView?.frames || [];
    for (let i = 0; i < frameWindows.length; i += 1) {
      try {
        if (frameWindows[i]?.document) docs.push(frameWindows[i].document);
      } catch {}
    }
  } catch {}

  docs.forEach((targetDoc) => {
    try {
      enableUxAutoOverflowScrolling(targetDoc);
      targetDoc.documentElement.dataset.uxShikenLayoutMode = normalizedMode;
      targetDoc.body?.classList.toggle(
        "ux-shiken-parent-layout-vertical",
        normalizedMode === UX_SHIKEN_LAYOUT_VERTICAL,
      );
      targetDoc.body?.classList.toggle(
        "ux-shiken-parent-layout-horizontal",
        normalizedMode === UX_SHIKEN_LAYOUT_HORIZONTAL,
      );
      targetDoc.body?.classList.toggle(
        "ux-shiken-parent-layout-origin",
        normalizedMode === UX_SHIKEN_LAYOUT_ORIGIN,
      );
    } catch {}
  });
}

function syncShikenLayoutToggleControls(
  doc = document,
  mode = UX_SHIKEN_LAYOUT_HORIZONTAL,
) {
  const normalizedMode = normalizeShikenLayoutMode(mode);
  const docs = [doc];

  try {
    const frameWindows = doc.defaultView?.frames || [];
    for (let i = 0; i < frameWindows.length; i += 1) {
      try {
        if (frameWindows[i]?.document) docs.push(frameWindows[i].document);
      } catch {}
    }
  } catch {}

  docs.forEach((targetDoc) => {
    try {
      targetDoc
        .querySelectorAll("button[data-ux-shiken-layout-mode]")
        .forEach((button) => {
          const active = button.dataset.uxShikenLayoutMode === normalizedMode;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", active ? "true" : "false");
        });
    } catch {}
  });
}

function saveCurrentShikenVerticalCols(doc = document) {
  const mode = doc.documentElement?.dataset?.uxShikenLayoutMode;
  if (mode !== UX_SHIKEN_LAYOUT_VERTICAL) return;

  const structure = getShikenFramesetStructure(doc);
  const splitFrameset = structure.contentCols || structure.contentRows;
  if (splitFrameset?.hasAttribute("cols")) {
    saveShikenVerticalCols(splitFrameset.getAttribute("cols"), doc, "nested");
    return;
  }

  if (
    structure.directQuestionFrame &&
    structure.directAnswerFrame &&
    structure.mainFrameset?.hasAttribute("cols")
  ) {
    saveShikenVerticalCols(
      structure.mainFrameset.getAttribute("cols"),
      doc,
      "direct",
    );
  }
}

function bindShikenVerticalResizePersistence(doc = document) {
  if (!doc || doc.__uxShikenVerticalResizePersistenceBound) return;
  doc.__uxShikenVerticalResizePersistenceBound = true;

  const save = () => saveCurrentShikenVerticalCols(doc);
  doc.addEventListener("mouseup", save, true);
  doc.addEventListener("touchend", save, true);

  try {
    const observer = new MutationObserver(save);
    doc.querySelectorAll("frameset").forEach((frameset) => {
      safeObserveUxMutation(observer, frameset, {
        attributes: true,
        attributeFilter: ["cols"],
      });
    });
    doc.__uxShikenVerticalResizePersistenceObserver = observer;
  } catch {}
}

function getCurrentShikenLayoutMode(rootDoc = document) {
  try {
    const root = rootDoc || document;
    return normalizeShikenLayoutMode(
      root.documentElement?.dataset?.uxShikenLayoutMode ||
        readShikenLayoutOverride(root) ||
        resolveInitialShikenLayoutMode(root),
    );
  } catch {
    return UX_SHIKEN_LAYOUT_HORIZONTAL;
  }
}

function isShikenOriginLayoutActive(rootDoc = document) {
  return getCurrentShikenLayoutMode(rootDoc) === UX_SHIKEN_LAYOUT_ORIGIN;
}

function applyShikenLayoutMode(
  mode,
  { rootDoc = document, persist = false } = {},
) {
  const doc = rootDoc || document;
  const normalizedMode = normalizeShikenLayoutMode(mode);
  const applied =
    normalizedMode === UX_SHIKEN_LAYOUT_ORIGIN
      ? applyOriginShikenLayout(doc)
      : normalizedMode === UX_SHIKEN_LAYOUT_VERTICAL
        ? applyVerticalShikenLayout(doc)
        : applySinglePageShikenLayout(doc);

  if (!applied) return false;

  doc.documentElement.dataset.uxShikenLayoutMode = normalizedMode;
  if (persist) {
    saveShikenLayoutOverride(normalizedMode, doc);
    if (normalizedMode === UX_SHIKEN_LAYOUT_VERTICAL) {
      saveCurrentShikenVerticalCols(doc);
    }
  }

  if (normalizedMode === UX_SHIKEN_LAYOUT_VERTICAL) {
    bindShikenVerticalResizePersistence(doc);
  }
  syncShikenLayoutClasses(doc, normalizedMode);
  syncShikenLayoutToggleControls(doc, normalizedMode);
  return true;
}

function bindShikenLayoutMessageListener() {
  if (window.__uxShikenLayoutMessageListenerBound) return;
  window.__uxShikenLayoutMessageListenerBound = true;

  window.addEventListener("message", (event) => {
    const data = event?.data || {};
    if (data.type !== "UX_SHIKEN_LAYOUT_MODE_REQUEST") return;

    // 単一ページ⇄他モードの遷移はリロードで行う。単一ページ化は frameset を
    // body+iframe に作り替えるため、ライブ切替だと frame の再取得で未保存の入力が
    // 消える。モードを永続化してリロードすれば、必ず綺麗な初期ロード上で構築/復元
    // される（単一ページの DOM 改変は初期ロード時のみ動く）。
    const targetMode = normalizeShikenLayoutMode(data.mode);
    const currentlySinglePage = isShikenSinglePageActive(document);
    if (currentlySinglePage || targetMode === UX_SHIKEN_LAYOUT_HORIZONTAL) {
      if (currentlySinglePage && targetMode === UX_SHIKEN_LAYOUT_HORIZONTAL) {
        return; // 既に単一ページ
      }
      saveShikenLayoutOverride(targetMode, document);
      try {
        window.location.reload();
      } catch {}
      return;
    }

    if (!document.querySelector("frameset")) return;

    if (normalizeShikenLayoutMode(data.mode) === UX_SHIKEN_LAYOUT_ORIGIN) {
      applyShikenOriginLayoutOnlyMode(document, { persist: true });
      return;
    }

    const wasOrigin = isShikenOriginLayoutActive(document);
    const applied = applyShikenLayoutMode(data.mode, {
      rootDoc: document,
      persist: true,
    });
    if (applied && wasOrigin) {
      requestShikenVisualReinit(document);
    }
  });
}

function bindShikenVisualReinitMessageListener() {
  if (window.__uxShikenVisualReinitMessageListenerBound) return;
  window.__uxShikenVisualReinitMessageListenerBound = true;

  window.addEventListener("message", (event) => {
    const data = event?.data || {};
    if (data.type !== UX_SHIKEN_VISUAL_REINIT_MESSAGE) return;
    if (isShikenOriginLayoutActive(getShikenRootDocument())) return;

    try {
      document.documentElement.dataset.webclassUxCourseVisualMode = "modern";
    } catch {}

    setUxExtensionVisualEnabled(true);
    init();
  });
}

function requestShikenVisualReinit(rootDoc = document) {
  getAccessibleUxDocuments(rootDoc).forEach((doc) => {
    try {
      doc.defaultView?.postMessage(
        { type: UX_SHIKEN_VISUAL_REINIT_MESSAGE },
        "*",
      );
    } catch {
      // ignore inaccessible frames
    }
  });
}

function requestParentShikenLayoutMode(mode) {
  try {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage(
      {
        type: "UX_SHIKEN_LAYOUT_MODE_REQUEST",
        mode: normalizeShikenLayoutMode(mode),
      },
      "*",
    );
  } catch {}
}

function getShikenRootDocument() {
  try {
    if (window.parent && window.parent !== window && window.parent.document) {
      const parentDoc = window.parent.document;
      // 通常の frameset、または単一ページ化後(frameset を破棄済み)の親を認識する
      if (
        parentDoc.querySelector("frameset") ||
        parentDoc.documentElement?.dataset?.uxShikenSinglePage === "true"
      ) {
        return parentDoc;
      }
    }
  } catch {}
  return document;
}

function syncCurrentFrameShikenLayoutClassFromParent() {
  try {
    const rootDoc = getShikenRootDocument();
    const mode =
      rootDoc.documentElement?.dataset?.uxShikenLayoutMode ||
      resolveInitialShikenLayoutMode(rootDoc);
    syncShikenLayoutClasses(document, mode);
  } catch {}
}

function isShikenInnerButtonListFrame(targetDoc = document) {
  try {
    const href = targetDoc?.location?.href || "";
    const url = new URL(href, window.location.href);
    if (url.searchParams.get("myFrameName") === "buttons") return true;
  } catch {}

  try {
    return targetDoc?.defaultView?.name === "buttons";
  } catch {
    return false;
  }
}

function isMainShikenLayoutButtonFrame(targetDoc = document) {
  if (!targetDoc?.body) return false;
  if (isShikenInnerButtonListFrame(targetDoc)) return false;

  try {
    const href = targetDoc.location?.href || "";
    if (!/dqstn_button\.php/i.test(href)) return false;
  } catch {
    return false;
  }

  try {
    if (targetDoc.defaultView?.name === "button") return true;
  } catch {}

  return !!(
    targetDoc.querySelector("#WsTitle") ||
    targetDoc.querySelector('form[name="button_form"]')
  );
}

function createShikenLayoutIcon(doc, mode) {
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

  if (mode === UX_SHIKEN_LAYOUT_VERTICAL) {
    add("rect", { x: "3", y: "4", width: "18", height: "16", rx: "2" });
    add("path", { d: "M9 4v16" });
    add("path", { d: "M15 4v16" });
    return svg;
  }

  if (mode === UX_SHIKEN_LAYOUT_ORIGIN) {
    add("path", { d: "M3 7v6h6" });
    add("path", { d: "M21 17a9 9 0 0 0-15-6.7L3 13" });
    return svg;
  }

  add("rect", { x: "3", y: "4", width: "18", height: "16", rx: "2" });
  add("path", { d: "M9 4v16" });
  add("path", { d: "M9 12h12" });
  return svg;
}

function ensureShikenOriginLayoutToggleStyle(targetDoc = document) {
  if (!targetDoc || targetDoc.getElementById(UX_SHIKEN_ORIGIN_LAYOUT_STYLE_ID))
    return;
  const style = targetDoc.createElement("style");
  style.id = UX_SHIKEN_ORIGIN_LAYOUT_STYLE_ID;
  markUxCourseStyle(style);
  style.textContent = `
        #ux-shiken-layout-toggle {
            display: grid;
            grid-template-columns: max-content 32px 32px 32px;
            align-items: center;
            gap: 4px;
            max-width: 100%;
            margin: 6px 0;
            padding: 3px;
            border: 1px solid #b8b8b8;
            border-radius: 4px;
            background: #ffffff;
            box-sizing: border-box;
            font-family: "Yu Gothic", "Meiryo", sans-serif;
            font-size: 12px;
            line-height: 1.2;
        }
        #ux-shiken-layout-toggle .ux-shiken-layout-toggle-label {
            padding: 0 4px;
            color: #333333;
            font-weight: 700;
            white-space: nowrap;
        }
        #ux-shiken-layout-toggle button {
            min-width: 0;
            width: 100%;
            min-height: 26px;
            padding: 0 4px;
            border: 1px solid #b8b8b8;
            border-radius: 3px;
            background: #f7f7f7;
            color: #222222;
            box-sizing: border-box;
            font: inherit;
            font-weight: 700;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        #ux-shiken-layout-toggle button svg {
            width: 16px;
            height: 16px;
            pointer-events: none;
        }
        #ux-shiken-layout-toggle button.is-active {
            border-color: #0068b7;
            background: #e8f3ff;
            color: #00539b;
        }
    `;
  (targetDoc.head || targetDoc.documentElement).appendChild(style);
}

function ensureShikenLayoutToggleControl(
  targetDoc = document,
  rootDocOverride = null,
  { originOnly = false } = {},
) {
  const doc = targetDoc || document;
  if (!isMainShikenLayoutButtonFrame(doc)) return;

  const top = doc.getElementById("top") || doc.body;
  if (!top) return;

  const existingControl = doc.getElementById("ux-shiken-layout-toggle");
  if (existingControl) {
    const hasIconButtons =
      existingControl.querySelectorAll("button[data-ux-shiken-layout-mode] svg")
        .length >= 3;
    if (hasIconButtons) return;
    existingControl.remove();
  }

  if (originOnly) {
    ensureShikenOriginLayoutToggleStyle(doc);
  }

  const rootDoc =
    rootDocOverride || (doc === document ? getShikenRootDocument() : document);
  const currentMode = getCurrentShikenLayoutMode(rootDoc);

  const control = doc.createElement("div");
  control.id = "ux-shiken-layout-toggle";
  control.className = "ux-shiken-layout-toggle";
  if (originOnly) {
    control.dataset.uxShikenOriginOnly = "true";
  }

  const label = doc.createElement("span");
  label.className = "ux-shiken-layout-toggle-label";
  label.textContent = "レイアウト";
  control.appendChild(label);

  [
    { mode: UX_SHIKEN_LAYOUT_HORIZONTAL, label: "横レイアウト" },
    { mode: UX_SHIKEN_LAYOUT_VERTICAL, label: "縦レイアウト" },
    { mode: UX_SHIKEN_LAYOUT_ORIGIN, label: "Origin" },
  ].forEach(({ mode, label }) => {
    const button = doc.createElement("button");
    button.type = "button";
    button.dataset.uxShikenLayoutMode = mode;
    button.title =
      mode === UX_SHIKEN_LAYOUT_ORIGIN
        ? "WebClass標準表示に戻し、レイアウト切替だけを表示"
        : mode === UX_SHIKEN_LAYOUT_VERTICAL
          ? "中央に問題/PDF、右に回答を表示"
          : "問題と回答を上下に表示";
    button.setAttribute("aria-label", label);
    button.setAttribute(
      "aria-pressed",
      currentMode === mode ? "true" : "false",
    );
    button.classList.toggle("is-active", currentMode === mode);
    button.appendChild(createShikenLayoutIcon(doc, mode));
    const handleLayoutClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const activeRootDoc =
        rootDocOverride ||
        (doc === document ? getShikenRootDocument() : rootDoc);
      const currentRootMode = getCurrentShikenLayoutMode(activeRootDoc);
      if (
        currentRootMode === mode &&
        isShikenSinglePageActive(activeRootDoc) ===
          (mode === UX_SHIKEN_LAYOUT_HORIZONTAL)
      ) {
        return;
      }
      if (
        isShikenSinglePageActive(activeRootDoc) ||
        mode === UX_SHIKEN_LAYOUT_HORIZONTAL
      ) {
        saveShikenLayoutOverride(mode, activeRootDoc);
        try {
          activeRootDoc.defaultView?.location?.reload();
        } catch {}
        return;
      }
      if (mode === UX_SHIKEN_LAYOUT_ORIGIN) {
        applyShikenOriginLayoutOnlyMode(activeRootDoc, { persist: true });
        return;
      }

      const wasOrigin = isShikenOriginLayoutActive(activeRootDoc);
      const applied = applyShikenLayoutMode(mode, {
        rootDoc: activeRootDoc,
        persist: true,
      });
      if (!applied) {
        requestParentShikenLayoutMode(mode);
        return;
      }
      if (wasOrigin) {
        requestShikenVisualReinit(activeRootDoc);
      }
    };
    button.addEventListener("click", handleLayoutClick);
    control.appendChild(button);
  });

  const title = doc.getElementById("WsTitle");
  if (title && title.parentElement === top) {
    title.insertAdjacentElement("afterend", control);
  } else {
    top.insertBefore(control, top.firstChild);
  }
}

function getShikenButtonDocument(rootDoc = document) {
  try {
    const structure = getShikenFramesetStructure(rootDoc);
    const buttonFrame =
      structure.buttonFrame || rootDoc.querySelector('frame[name="button"]');
    const buttonDoc =
      buttonFrame?.contentDocument || buttonFrame?.contentWindow?.document;
    if (buttonDoc?.body) return buttonDoc;
  } catch {
    // ignore inaccessible or not-yet-loaded frames
  }

  try {
    return (
      getAccessibleUxDocuments(rootDoc).find((doc) => {
        const href = doc.location?.href || "";
        return (
          !!doc.body &&
          (isMainShikenLayoutButtonFrame(doc) ||
            !!doc.querySelector('form[name="button_form"]') ||
            !!doc.getElementById("WsTitle")) &&
          !isShikenInnerButtonListFrame(doc) &&
          /dqstn_button\.php/i.test(href)
        );
      }) || null
    );
  } catch {
    return null;
  }
}

function restoreUxShikenOriginDocument(doc = document) {
  try {
    if (!doc) return;
    doc.documentElement.dataset.webclassUxCourseVisualMode = "origin";
    doc.documentElement.dataset.uxShikenLayoutMode = UX_SHIKEN_LAYOUT_ORIGIN;
  } catch {}

  disconnectUxCourseObservers(doc);
  restoreUxOriginalFrameStructure(doc);
  restoreUxOriginalBodyState(doc);
  removeUxCourseInjectedElements(doc);
  restoreUxCourseHiddenSourceElements(doc);
  removeUxCourseStyleElements(doc);
}

function ensureShikenOriginLayoutOnlyControl(rootDoc = document) {
  const buttonDoc = getShikenButtonDocument(rootDoc);
  if (!buttonDoc) return false;

  ensureShikenOriginLayoutToggleStyle(buttonDoc);
  ensureShikenLayoutToggleControl(buttonDoc, rootDoc, { originOnly: true });
  syncShikenLayoutToggleControls(rootDoc, UX_SHIKEN_LAYOUT_ORIGIN);
  return true;
}

function applyShikenOriginLayoutOnlyMode(
  rootDoc = document,
  { persist = false } = {},
) {
  const doc = rootDoc || document;
  const docs = new Set(getAccessibleUxDocuments(doc));
  const applied = applyShikenLayoutMode(UX_SHIKEN_LAYOUT_ORIGIN, {
    rootDoc: doc,
    persist,
  });

  getAccessibleUxDocuments(doc).forEach((accessibleDoc) =>
    docs.add(accessibleDoc),
  );
  docs.forEach((accessibleDoc) => restoreUxShikenOriginDocument(accessibleDoc));

  try {
    doc.documentElement.dataset.uxShikenLayoutMode = UX_SHIKEN_LAYOUT_ORIGIN;
  } catch {}

  syncShikenLayoutClasses(doc, UX_SHIKEN_LAYOUT_ORIGIN);
  ensureShikenOriginLayoutOnlyControl(doc);

  setTimeout(() => {
    getAccessibleUxDocuments(doc).forEach((accessibleDoc) => {
      try {
        if (isShikenOriginLayoutActive(doc)) {
          accessibleDoc.documentElement.dataset.webclassUxCourseVisualMode =
            "origin";
          accessibleDoc.documentElement.dataset.uxShikenLayoutMode =
            UX_SHIKEN_LAYOUT_ORIGIN;
        }
      } catch {}
    });
    ensureShikenOriginLayoutOnlyControl(doc);
  }, 160);

  setTimeout(() => {
    if (isShikenOriginLayoutActive(doc)) {
      ensureShikenOriginLayoutOnlyControl(doc);
    }
  }, 600);

  return applied;
}

function compactShikenButtonTocLayout() {
  const top = document.getElementById("top");
  const toc = document.getElementById("TOC");
  const tocIframe = document.getElementById("TOCContent");
  const form = document.querySelector('form[name="button_form"]');
  if (!top || !form || form.parentElement !== top) return;

  toc?.style.setProperty("display", "none", "important");

  const url = new URL(window.location.href);
  const currentPage = Math.max(
    1,
    parseInt(url.searchParams.get("page") || "1", 10) || 1,
  );
  const endPage = Math.max(
    currentPage,
    parseInt(url.searchParams.get("end_page") || String(currentPage), 10) ||
      currentPage,
  );
  const signature = `${currentPage}:${endPage}`;

  let inlineToc = document.getElementById("ux-shiken-inline-toc");
  if (!inlineToc) {
    inlineToc = document.createElement("div");
    inlineToc.id = "ux-shiken-inline-toc";
    inlineToc.className = "ux-shiken-inline-toc";
  }

  if (inlineToc.dataset.signature !== signature) {
    inlineToc.dataset.signature = signature;
    inlineToc.textContent = "";
    for (let page = 1; page <= endPage; page += 1) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "ux-shiken-inline-page";
      item.textContent = String(page);
      item.title = `問${page}`;
      item.setAttribute("aria-label", `問${page}`);
      item.classList.toggle("is-active", page === currentPage);
      item.addEventListener("click", () => {
        if (page === currentPage) return;
        try {
          const tocDoc =
            tocIframe?.contentDocument || tocIframe?.contentWindow?.document;
          const originalButton = Array.from(
            tocDoc?.querySelectorAll(
              'input[type="button"], button, input[name="page_num"], button[name="page_num"]',
            ) || [],
          ).find((button) => {
            const label = (button.value || button.textContent || "").trim();
            return label === String(page);
          });
          if (originalButton) {
            originalButton.click();
          }
        } catch {}
      });
      inlineToc.appendChild(item);
    }
  }

  inlineToc.style.setProperty("order", "6", "important");
  inlineToc.style.setProperty("flex", "0 0 auto", "important");
  inlineToc.style.setProperty("margin", "0 -3px", "important");

  form.style.setProperty("order", "5", "important");
  form.style.setProperty("margin", "0 -3px", "important");

  top.appendChild(form);
  top.appendChild(inlineToc);
}

function bindShikenButtonTocCompaction() {
  if (document.__uxShikenButtonTocCompactionBound) return;
  document.__uxShikenButtonTocCompactionBound = true;

  const runSoon = () => {
    requestAnimationFrame(() => {
      compactShikenButtonTocLayout();
      setTimeout(compactShikenButtonTocLayout, 100);
    });
  };

  runSoon();
  window.addEventListener("load", runSoon, { once: true });
  document.getElementById("TOCContent")?.addEventListener("load", runSoon);

  const observeTarget = document.body || document.getElementById("top");
  if (observeTarget) {
    const observer = new MutationObserver(runSoon);
    if (
      safeObserveUxMutation(observer, observeTarget, {
        childList: true,
        subtree: false,
        attributes: true,
        attributeFilter: ["style", "class"],
      })
    ) {
      document.__uxShikenButtonTocCompactionObserver = observer;
    }
  }
}

function ensureParentQuestionFrameFromAnswerForm(form) {
  if (!form) return;

  const questionUrl =
    form.querySelector('input[name="question_url"]')?.value || "";
  if (!isLikelyPdfOrAttachmentUrl(questionUrl, window.location.href)) return;

  let rootDoc;
  try {
    rootDoc = getShikenRootDocument();
  } catch {
    return;
  }
  if (!rootDoc || rootDoc === document) return;

  const currentLayoutMode = normalizeShikenLayoutMode(
    rootDoc.documentElement?.dataset?.uxShikenLayoutMode ||
      resolveInitialShikenLayoutMode(rootDoc),
  );
  if (currentLayoutMode === UX_SHIKEN_LAYOUT_ORIGIN) return;

  const structure = getShikenFramesetStructure(rootDoc);
  if (
    !structure.mainFrameset ||
    structure.questionFrame ||
    !structure.answerFrame
  )
    return;

  const questionFrame = rootDoc.createElement("frame");
  questionFrame.dataset.uxCreatedQuestionFrame = "true";
  questionFrame.setAttribute("name", "question");
  questionFrame.setAttribute("src", questionUrl);
  questionFrame.setAttribute("scrolling", "auto");
  questionFrame.setAttribute("frameborder", "0");

  structure.mainFrameset.insertBefore(questionFrame, structure.answerFrame);
  applyShikenLayoutMode(currentLayoutMode, { rootDoc });
}

function wrapOneByOneBodyContent(wrapperClass) {
  if (!document.body) return null;
  const existing = document.body.querySelector(`:scope > .${wrapperClass}`);
  if (existing) return existing;

  const wrapper = document.createElement("div");
  wrapper.className = wrapperClass;
  const movableNodes = Array.from(document.body.childNodes).filter((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.trim().length > 0;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    if (node.classList?.contains(wrapperClass)) {
      return false;
    }
    return !["SCRIPT", "STYLE", "LINK", "NOSCRIPT"].includes(node.tagName);
  });

  if (movableNodes.length === 0) {
    document.body.appendChild(wrapper);
    return wrapper;
  }

  document.body.insertBefore(wrapper, movableNodes[0]);
  movableNodes.forEach((node) => wrapper.appendChild(node));
  return wrapper;
}

const UX_SHIKEN_UPLOAD_FRAME_LINE_HEIGHT = 30.2;
const UX_SHIKEN_UPLOAD_DEFAULT_QUESTION_LINES = 10;
const UX_SHIKEN_UPLOAD_DEFAULT_ANSWER_LINES = 18;
const UX_SHIKEN_UPLOAD_FRAME_ROWS_KEY = "shikenUploadFrameRows";
const UX_SHIKEN_UPLOAD_FRAME_MIN_HEIGHT = 120;
const UX_SHIKEN_SINGLE_PAGE_FIELD_MIN_HEIGHT = 120;

function shikenUploadFrameLinesToPixels(lines) {
  return Math.round(lines * UX_SHIKEN_UPLOAD_FRAME_LINE_HEIGHT);
}

function getDefaultShikenUploadFrameRows() {
  return `${shikenUploadFrameLinesToPixels(UX_SHIKEN_UPLOAD_DEFAULT_QUESTION_LINES)},${shikenUploadFrameLinesToPixels(UX_SHIKEN_UPLOAD_DEFAULT_ANSWER_LINES)}`;
}

function getShikenContentRowsFrameset(doc = document) {
  const innerCols =
    Array.from(doc.querySelectorAll("frameset[cols]")).find((frameset) => {
      return !!getDirectChildFrame(frameset, "button");
    }) || doc.querySelector("frameset[cols]");

  if (!innerCols) return null;
  return (
    getDirectChildFrameset(innerCols, "rows", ["question", "answer"]) ||
    innerCols.querySelector("frameset[rows]")
  );
}

function setUploadAnswerFramesetRows() {
  const applyRows = (items = {}) => {
    try {
      const parentDoc = window.parent?.document;
      if (!parentDoc || parentDoc === document) return;

      const contentRows = getShikenContentRowsFrameset(parentDoc);
      if (!contentRows) return;

      const nextRows =
        typeof items[UX_SHIKEN_UPLOAD_FRAME_ROWS_KEY] === "string" &&
        /^\d+,\d+$/.test(items[UX_SHIKEN_UPLOAD_FRAME_ROWS_KEY])
          ? items[UX_SHIKEN_UPLOAD_FRAME_ROWS_KEY]
          : getDefaultShikenUploadFrameRows();
      if (contentRows.getAttribute("rows") === nextRows) return;

      contentRows.dataset.uxUploadQuestionRows = "true";
      contentRows.setAttribute("rows", nextRows);
    } catch (e) {
      // Cross-frame access can fail while WebClass is still navigating.
    }
  };

  try {
    chrome.storage.local.get(
      {
        [UX_SHIKEN_UPLOAD_FRAME_ROWS_KEY]: "",
      },
      applyRows,
    );
  } catch (e) {
    applyRows();
  }
}

function parseShikenFrameRows(
  rowsValue,
  fallbackQuestionHeight,
  fallbackAnswerHeight,
) {
  const [questionRaw, answerRaw] = String(rowsValue || "").split(",");
  const question = parseInt(questionRaw, 10);
  const answer = parseInt(answerRaw, 10);
  return {
    question:
      Number.isFinite(question) && question > 0
        ? question
        : fallbackQuestionHeight,
    answer:
      Number.isFinite(answer) && answer > 0 ? answer : fallbackAnswerHeight,
  };
}

function setShikenFrameRowsFromDrag(questionHeight, answerHeight) {
  try {
    const parentDoc = window.parent?.document;
    if (!parentDoc || parentDoc === document) return "";

    const contentRows = getShikenContentRowsFrameset(parentDoc);
    if (!contentRows) return "";

    const nextRows = `${Math.round(questionHeight)},${Math.round(answerHeight)}`;
    contentRows.dataset.uxUploadQuestionRows = "true";
    contentRows.setAttribute("rows", nextRows);
    return nextRows;
  } catch {
    return "";
  }
}

function saveShikenFrameRows(rowsValue) {
  if (!rowsValue) return;
  try {
    chrome.storage.local.set({ [UX_SHIKEN_UPLOAD_FRAME_ROWS_KEY]: rowsValue });
  } catch {
    // ignore
  }
}

function getShikenSinglePageFieldHeightKey(frameName = window.name || "") {
  return `uxShikenSinglePageFieldHeight:${getShikenLayoutContentId(getShikenRootDocument())}:${frameName || "content"}`;
}

function restoreShikenSinglePageFieldHeight(card, frameName = window.name || "") {
  if (!card || !isShikenSinglePageActive()) return;
  try {
    const stored = sessionStorage.getItem(
      getShikenSinglePageFieldHeightKey(frameName),
    );
    const height = parseInt(stored || "", 10);
    if (Number.isFinite(height) && height >= UX_SHIKEN_SINGLE_PAGE_FIELD_MIN_HEIGHT) {
      card.style.minHeight = `${height}px`;
    }
  } catch {}
}

function saveShikenSinglePageFieldHeight(height, frameName = window.name || "") {
  if (!Number.isFinite(height)) return;
  try {
    sessionStorage.setItem(
      getShikenSinglePageFieldHeightKey(frameName),
      String(Math.round(height)),
    );
  } catch {}
}

function postSinglePageShikenFrameHeight() {
  if (!isShikenSinglePageActive() || window.parent === window) return;
  try {
    const docEl = document.documentElement;
    const body = document.body;
    const height = Math.max(
      docEl ? docEl.scrollHeight : 0,
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0,
    );
    if (height > 0) {
      window.parent.postMessage(
        {
          type: "UX_SHIKEN_SINGLE_PAGE_FRAME_HEIGHT",
          frameName: window.name || "",
          height,
        },
        "*",
      );
    }
  } catch {}
}

function attachShikenSinglePageFieldResizeHandle(card, handle, frameName) {
  handle.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startHeight = Math.round(card.getBoundingClientRect().height);
    const startScreenY = event.screenY;
    let latestHeight = startHeight;

    document.body?.classList.add("ux-shiken-frame-resizing");

    const onMove = (moveEvent) => {
      const deltaY = moveEvent.screenY - startScreenY;
      latestHeight = Math.max(
        UX_SHIKEN_SINGLE_PAGE_FIELD_MIN_HEIGHT,
        startHeight + deltaY,
      );
      card.style.minHeight = `${Math.round(latestHeight)}px`;
      postSinglePageShikenFrameHeight();
    };

    const onEnd = () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onEnd, true);
      document.body?.classList.remove("ux-shiken-frame-resizing");
      saveShikenSinglePageFieldHeight(latestHeight, frameName);
      postSinglePageShikenFrameHeight();
    };

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onEnd, true);
  });
}

function attachShikenFrameResizeHandle(card, options = {}) {
  if (!card || card.dataset.uxFrameResizeHandle === "true") return;
  const frameName = options.frameName || window.name || "question";
  card.dataset.uxFrameResizeHandle = "true";
  card.classList.add("ux-shiken-resizable-frame-card");
  restoreShikenSinglePageFieldHeight(card, frameName);

  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "ux-shiken-frame-resize-handle";
  const label = options.label || "フィールド";
  handle.setAttribute("aria-label", `${label}の高さを変更`);
  handle.title = `${label}の高さをドラッグで変更`;
  card.appendChild(handle);

  if (isShikenSinglePageActive()) {
    attachShikenSinglePageFieldResizeHandle(card, handle, frameName);
    return;
  }

  handle.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    let parentDoc;
    let contentRows;
    try {
      parentDoc = window.parent?.document;
      contentRows = parentDoc && getShikenContentRowsFrameset(parentDoc);
    } catch {
      return;
    }
    if (!parentDoc || !contentRows) return;

    const questionFrame = parentDoc.querySelector('frame[name="question"]');
    const answerFrame = parentDoc.querySelector('frame[name="answer"]');
    const fallbackQuestionHeight = Math.round(
      questionFrame?.getBoundingClientRect().height ||
        shikenUploadFrameLinesToPixels(UX_SHIKEN_UPLOAD_DEFAULT_QUESTION_LINES),
    );
    const fallbackAnswerHeight = Math.round(
      answerFrame?.getBoundingClientRect().height ||
        shikenUploadFrameLinesToPixels(UX_SHIKEN_UPLOAD_DEFAULT_ANSWER_LINES),
    );
    const startRows = parseShikenFrameRows(
      contentRows.getAttribute("rows"),
      fallbackQuestionHeight,
      fallbackAnswerHeight,
    );
    const startScreenY = event.screenY;
    let latestRows = contentRows.getAttribute("rows") || "";

    document.body?.classList.add("ux-shiken-frame-resizing");
    try {
      window.parent?.document?.body?.classList.add("ux-shiken-frame-resizing");
    } catch {
      // ignore
    }

    const onMove = (moveEvent) => {
      const deltaY = moveEvent.screenY - startScreenY;
      const nextQuestion = Math.max(
        UX_SHIKEN_UPLOAD_FRAME_MIN_HEIGHT,
        startRows.question + deltaY,
      );
      const nextAnswer = Math.max(
        UX_SHIKEN_UPLOAD_FRAME_MIN_HEIGHT,
        startRows.answer - deltaY,
      );
      latestRows =
        setShikenFrameRowsFromDrag(nextQuestion, nextAnswer) || latestRows;
    };

    const onEnd = () => {
      parentDoc.removeEventListener("mousemove", onMove, true);
      parentDoc.removeEventListener("mouseup", onEnd, true);
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onEnd, true);
      document.body?.classList.remove("ux-shiken-frame-resizing");
      try {
        window.parent?.document?.body?.classList.remove(
          "ux-shiken-frame-resizing",
        );
      } catch {
        // ignore
      }
      saveShikenFrameRows(latestRows);
    };

    parentDoc.addEventListener("mousemove", onMove, true);
    parentDoc.addEventListener("mouseup", onEnd, true);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onEnd, true);
  });
}

const UX_ANSWER_ACTION_CONTROL_SELECTOR =
  'button, input[type="button"], input[type="submit"]';

function getShikenAnswerControlLabel(control) {
  return (
    control?.textContent ||
    control?.value ||
    control?.getAttribute?.("aria-label") ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim();
}

function getShikenAnswerSurfaceProfile(form) {
  const fileInputs = Array.from(
    form?.querySelectorAll('input[type="file"]') || [],
  );
  const textareas = Array.from(form?.querySelectorAll("textarea") || []);
  const selects = Array.from(form?.querySelectorAll("select") || []);
  const textInputs = Array.from(
    form?.querySelectorAll(
      [
        "input:not([type])",
        'input[type="text"]',
        'input[type="search"]',
        'input[type="number"]',
        'input[type="date"]',
        'input[type="time"]',
        'input[type="datetime-local"]',
        'input[type="email"]',
        'input[type="url"]',
        'input[type="tel"]',
      ].join(","),
    ) || [],
  );
  const choiceInputs = Array.from(
    form?.querySelectorAll('input[type="radio"], input[type="checkbox"]') || [],
  );
  const optionTables = Array.from(
    form?.querySelectorAll(
      'table.qstnoptions, table.seloptions, table.selcomplex, table[id^="id_QuestionAnswer"]',
    ) || [],
  );
  const questionUrl =
    form?.querySelector('input[name="question_url"]')?.value || "";

  return {
    fileInputs,
    textareas,
    selects,
    textInputs,
    choiceInputs,
    optionTables,
    questionUrl,
    hasFile: fileInputs.length > 0,
    hasTextarea: textareas.length > 0,
    hasSelect: selects.length > 0,
    hasTextInput: textInputs.length > 0,
    hasChoice: choiceInputs.length > 0,
    hasQuestionAttachment: isLikelyPdfOrAttachmentUrl(
      questionUrl,
      window.location.href,
    ),
    get hasAnswerControl() {
      return (
        this.hasFile ||
        this.hasTextarea ||
        this.hasSelect ||
        this.hasTextInput ||
        this.hasChoice ||
        this.optionTables.length > 0
      );
    },
  };
}

function getShikenAnswerSurfaceAnchor(
  form,
  profile = getShikenAnswerSurfaceProfile(form),
) {
  const preferred = [
    profile.textareas[0],
    profile.fileInputs[0],
    profile.selects[0],
    profile.textInputs[0],
    profile.choiceInputs[0],
    profile.optionTables[0],
  ].find(Boolean);
  if (!preferred) return form?.firstChild || null;

  let anchor =
    preferred.closest?.("table, dl, fieldset, section, article, div") ||
    preferred;
  while (anchor && anchor.parentElement !== form) {
    anchor = anchor.parentElement;
  }
  return anchor || preferred;
}

function wrapShikenAnswerSurfaceContent(form) {
  if (!form) return null;
  const existing = form.querySelector(
    ":scope > .ux-shiken-answer-card, :scope > .ux-shiken-upload-answer-card",
  );
  if (existing) return existing;

  const wrapper = document.createElement("div");
  wrapper.className = "ux-shiken-answer-card ux-shiken-upload-answer-card";

  const movableNodes = Array.from(form.childNodes).filter((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.trim().length > 0;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    if (
      node.classList?.contains("ux-answer-nav") ||
      node.classList?.contains("ux-answer-actions") ||
      node.classList?.contains("ux-shiken-answer-card") ||
      node.classList?.contains("ux-shiken-upload-answer-card")
    ) {
      return false;
    }
    return !["SCRIPT", "STYLE", "LINK", "NOSCRIPT"].includes(node.tagName);
  });

  if (movableNodes.length === 0) {
    form.insertBefore(wrapper, form.firstChild);
    return wrapper;
  }

  form.insertBefore(wrapper, movableNodes[0]);
  movableNodes.forEach((node) => wrapper.appendChild(node));
  return wrapper;
}

function wrapShikenUploadAnswerContent(form) {
  return wrapShikenAnswerSurfaceContent(form);
}

function findShikenAnswerActionControl(
  patterns,
  selectors = [],
  root = document,
) {
  if (!root) return null;

  for (const selector of selectors) {
    const found = root.querySelector(selector);
    if (found) return found;
  }

  const controls = Array.from(
    root.querySelectorAll(UX_ANSWER_ACTION_CONTROL_SELECTOR),
  );
  return (
    controls.find((control) => {
      if (
        control.closest(".ux-answer-actions, .ux-answer-nav, .ux-select-wrap")
      )
        return false;
      const label = getShikenAnswerControlLabel(control);
      return patterns.some((pattern) => pattern.test(label));
    }) || null
  );
}

function hideMirroredShikenAnswerControl(control) {
  if (!control || control.closest(".ux-answer-actions, .ux-answer-nav")) return;
  const label = getShikenAnswerControlLabel(control);
  if (/回答を保存/.test(label)) return;
  control.classList.add("ux-source-action-hidden");
  control.setAttribute("aria-hidden", "true");
  control.tabIndex = -1;
}

function createShikenAnswerProxyButton({
  source,
  label,
  className = "ux-btn",
  fallback,
  disabled = false,
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label || (typeof fallback === "string" ? fallback : "");
  button.disabled =
    disabled ||
    (!!source && isUxControlDisabled(source)) ||
    (!source && typeof fallback !== "function");
  button.addEventListener("click", (event) => {
    event.preventDefault();
    if (source) {
      source.click();
    } else if (typeof fallback === "function") {
      fallback();
    }
  });
  return button;
}

function parseUxPositiveInteger(value) {
  const number = parseInt(String(value || "").trim(), 10);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function readUxUrlSearchParams(href) {
  try {
    return new URL(href, window.location.href).searchParams;
  } catch {
    return null;
  }
}

function collectShikenNavigationHrefs() {
  const hrefs = [];
  const addHref = (href) => {
    if (typeof href === "string" && href && !hrefs.includes(href)) {
      hrefs.push(href);
    }
  };

  addHref(window.location.href);

  try {
    addHref(window.parent?.frames?.button?.location?.href);
  } catch {}

  try {
    addHref(window.top?.frames?.button?.location?.href);
  } catch {}

  try {
    const buttonFrame = window.parent?.document?.querySelector?.(
      'frame[name="button"], iframe[name="button"]',
    );
    addHref(buttonFrame?.src);
  } catch {}

  try {
    const buttonFrame = window.top?.document?.querySelector?.(
      'frame[name="button"], iframe[name="button"]',
    );
    addHref(buttonFrame?.src);
  } catch {}

  return hrefs;
}

function collectShikenTocPageNumbers(doc = document) {
  const pages = new Set();
  const collectFromDoc = (targetDoc) => {
    if (!targetDoc) return;
    targetDoc
      .querySelectorAll(
        [
          'input[name="page_num"]',
          'button[name="page_num"]',
          'input[name="clickpage"]',
          'button[name="clickpage"]',
          'input[type="button"]',
          "button",
        ].join(","),
      )
      .forEach((control) => {
        const label = (
          control.value ||
          control.textContent ||
          control.getAttribute("aria-label") ||
          control.title ||
          ""
        ).trim();
        const number = parseUxPositiveInteger(label.replace(/[^\d]/g, ""));
        if (number) pages.add(number);

        const onclick = control.getAttribute("onclick") || "";
        const match = onclick.match(/(?:gopage|movePageTo)\(['"]?(\d+)['"]?\)/);
        if (match) pages.add(parseInt(match[1], 10));
      });
  };

  collectFromDoc(doc);

  try {
    const tocFrame = doc.getElementById("TOCContent");
    collectFromDoc(
      tocFrame?.contentDocument || tocFrame?.contentWindow?.document,
    );
  } catch {}

  try {
    const buttonDoc = window.parent?.frames?.button?.document;
    if (buttonDoc && buttonDoc !== doc) collectFromDoc(buttonDoc);
  } catch {}

  return Array.from(pages).filter((page) => Number.isFinite(page) && page > 0);
}

function getShikenNavigationState(doc = document) {
  let currentPage = null;
  let endPage = null;

  collectShikenNavigationHrefs().forEach((href) => {
    const params = readUxUrlSearchParams(href);
    if (!params) return;
    currentPage = currentPage || parseUxPositiveInteger(params.get("page"));
    endPage = endPage || parseUxPositiveInteger(params.get("end_page"));
  });

  const tocPages = collectShikenTocPageNumbers(doc);
  if (!endPage && tocPages.length > 0) {
    endPage = Math.max(...tocPages);
  }

  if (!currentPage) {
    try {
      const activeButton = doc.querySelector(
        ".ux-shiken-inline-page.is-active, tr.bkkhaki input, tr.bkkhaki button, td.bkkhaki input, td.bkkhaki button",
      );
      const activeLabel =
        activeButton?.value ||
        activeButton?.textContent ||
        activeButton?.getAttribute?.("aria-label") ||
        "";
      currentPage = parseUxPositiveInteger(
        String(activeLabel).replace(/[^\d]/g, ""),
      );
    } catch {}
  }

  if (!currentPage && endPage) currentPage = 1;
  if (!currentPage || !endPage) return null;

  endPage = Math.max(currentPage, endPage);
  return {
    currentPage,
    endPage,
    canPrev: currentPage > 1,
    canNext: currentPage < endPage,
  };
}

function isUxControlDisabled(control) {
  return !!(
    control?.disabled ||
    control?.getAttribute?.("aria-disabled") === "true" ||
    control?.classList?.contains("disabled") ||
    control?.classList?.contains("is-disabled")
  );
}

function buildShikenAnswerActionArea(form) {
  if (!form || form.dataset.uxNavBuilt === "true") return;
  form.dataset.uxNavBuilt = "true";

  const originalPrevBtn = findShikenAnswerActionControl(
    [/^前のページ$/, /^戻る$/],
    ["#QstnPrevBtn", 'input[name="pre"]', 'button[name="pre"]'],
  );
  const originalNextBtn = findShikenAnswerActionControl(
    [/^次のページ$/],
    ["#QstnNextBtn", 'input[name="next"]', 'button[name="next"]'],
  );
  const originalFinishBtn = findShikenAnswerActionControl(
    [
      /^(終了|採点|提出|送信|完了)(する)?$/,
      /^(テスト|課題|レポート).*(終了|提出)$/,
      /(終了|提出|採点)$/,
    ],
    [
      "#GradeBtn",
      'input[name="grade"]',
      'button[name="grade"]',
      'button[onclick*="gradeAndClose"]',
      'input[onclick*="gradeAndClose"]',
    ],
  );

  const canFinishFallback = typeof window.gradeAndClose === "function";
  if (
    !originalPrevBtn &&
    !originalNextBtn &&
    !originalFinishBtn &&
    !canFinishFallback
  ) {
    return;
  }

  const navState = getShikenNavigationState(document);
  const actions = document.createElement("div");
  actions.className = "ux-answer-actions";

  if (originalPrevBtn || originalNextBtn) {
    const nav = document.createElement("div");
    nav.className = "ux-answer-nav";

    if (originalPrevBtn) {
      nav.appendChild(
        createShikenAnswerProxyButton({
          source: originalPrevBtn,
          label: "前のページ",
          fallback:
            typeof window.prevPage === "function"
              ? () => window.prevPage()
              : null,
          disabled:
            isUxControlDisabled(originalPrevBtn) ||
            (navState ? !navState.canPrev : false),
        }),
      );
      hideMirroredShikenAnswerControl(originalPrevBtn);
    }

    if (originalNextBtn) {
      nav.appendChild(
        createShikenAnswerProxyButton({
          source: originalNextBtn,
          label: "次のページ",
          fallback:
            typeof window.nextPage === "function"
              ? () => window.nextPage()
              : null,
          disabled:
            isUxControlDisabled(originalNextBtn) ||
            (navState ? !navState.canNext : false),
        }),
      );
      hideMirroredShikenAnswerControl(originalNextBtn);
    }

    actions.appendChild(nav);
  }

  if (originalFinishBtn || canFinishFallback) {
    const primary = document.createElement("div");
    primary.className = "ux-answer-primary-actions";
    const label = getShikenAnswerControlLabel(originalFinishBtn) || "終了";
    primary.appendChild(
      createShikenAnswerProxyButton({
        source: originalFinishBtn,
        label,
        className: "ux-btn ux-danger",
        fallback: canFinishFallback ? () => window.gradeAndClose() : null,
      }),
    );
    hideMirroredShikenAnswerControl(originalFinishBtn);
    actions.appendChild(primary);
  }

  if (actions.children.length > 0) {
    form.appendChild(actions);
  }
}

function resolveShikenSelectVisibleCount(cb) {
  const defaultSelectVisibleCount = 12;
  try {
    chrome.storage.local.get(
      { shikenSelectVisibleCount: String(defaultSelectVisibleCount) },
      (items) => {
        let count = parseInt(items.shikenSelectVisibleCount, 10);
        if (Number.isNaN(count) || count < 0) {
          count = defaultSelectVisibleCount;
        }
        cb(count);
      },
    );
  } catch (e) {
    cb(defaultSelectVisibleCount);
  }
}

function enhanceShikenAnswerSelectControls(form) {
  if (!form || form.dataset.uxSelectBuilt === "true") return;
  form.dataset.uxSelectBuilt = "true";
  const selects = Array.from(form.querySelectorAll("select")).filter(
    (select) => !select.multiple,
  );
  if (selects.length === 0) return;

  const closeAll = () => {
    document.querySelectorAll(".ux-select-wrap.ux-open").forEach((wrap) => {
      const state = wrap.__uxSelectState;
      if (state) {
        state.pendingIndex = state.select.selectedIndex;
        const committedText =
          state.select.options[state.pendingIndex]?.text || "";
        state.display.textContent = committedText;
        state.items.forEach((item, idx) => {
          if (idx === state.pendingIndex) {
            item.setAttribute("aria-selected", "true");
          } else {
            item.removeAttribute("aria-selected");
          }
        });
      }
      wrap.classList.remove("ux-open");
    });
  };

  resolveShikenSelectVisibleCount((visibleCount) => {
    const itemHeight = 32;
    const listMaxHeight =
      visibleCount === 0 ? "none" : `${visibleCount * itemHeight}px`;

    selects.forEach((select) => {
      if (select.dataset.uxSelect === "true" || !select.parentNode) return;
      select.dataset.uxSelect = "true";

      const wrap = document.createElement("div");
      wrap.className = "ux-select-wrap";

      const display = document.createElement("button");
      display.type = "button";
      display.className = "ux-select-display";
      display.textContent = select.options[select.selectedIndex]?.text || "";
      display.style.fontSize = "var(--ux-select-display-font-size, 14px)";
      display.style.minHeight = "34px";

      const list = document.createElement("div");
      list.className = "ux-select-list";
      list.style.maxHeight = listMaxHeight;
      list.style.overflowY = visibleCount === 0 ? "visible" : "auto";

      const items = [];
      select.classList.add("ux-native-select");
      select.parentNode.insertBefore(wrap, select);
      wrap.appendChild(select);
      wrap.appendChild(display);
      wrap.appendChild(list);

      const state = {
        select,
        display,
        list,
        items,
        pendingIndex: select.selectedIndex,
      };
      wrap.__uxSelectState = state;

      // ドロップダウンは祖先の overflow (table.qstnoptions など) でクリップ
      // されないよう position:fixed にし、開くたびに表示ボタンの位置から
      // 座標と高さを計算する。下に空きが無ければ上方向に開く。
      const positionList = () => {
        const rect = display.getBoundingClientRect();
        const gap = 6;
        const vh = window.innerHeight;

        // ドロップダウンは回答カード (.ux-shiken-answer-card) の表示領域内に
        // 収め、採点ボタンのバー (.ux-answer-actions) には重ならないよう、
        // 上下の表示可能範囲 (clipTop〜clipBottom) を求める。スクロールしても
        // この範囲を超えないようにする。
        let clipTop = 0;
        let clipBottom = vh;
        const answerCard = wrap.closest(
          ".ux-shiken-answer-card, .ux-shiken-upload-answer-card",
        );
        if (answerCard) {
          const cr = answerCard.getBoundingClientRect();
          clipTop = Math.max(clipTop, cr.top);
          clipBottom = Math.min(clipBottom, cr.bottom);
        }
        document.querySelectorAll(".ux-answer-actions").forEach((bar) => {
          const br = bar.getBoundingClientRect();
          if (br.height > 0 && br.top > clipTop && br.top < clipBottom) {
            clipBottom = br.top;
          }
        });

        list.style.position = "fixed";
        list.style.left = `${Math.round(rect.left)}px`;
        list.style.right = "auto";
        list.style.width = `${Math.round(rect.width)}px`;

        // scrollHeight は maxHeight/overflow に関係なく内容全体の高さを返すため、
        // 高さ測定のために maxHeight を一時解除する必要はない。解除すると開いた
        // 状態でのスクロール位置がリセットされ、スクロールがガクつく原因になる。
        const contentHeight = list.scrollHeight;
        let desired = contentHeight;
        if (visibleCount !== 0) {
          desired = Math.min(desired, visibleCount * itemHeight);
        }

        // ドロップダウンは clipTop〜clipBottom の範囲を超えないようにする。
        const clipHeight = clipBottom - clipTop;
        const finalHeight = Math.min(desired, Math.max(80, clipHeight - 4));

        // 開く方向: 範囲内で下に収まれば下、無理で上に収まれば上、どちらも
        // 無理ならより広い側に開く。選択ボタンがスクロールで範囲外に出ても、
        // 最終的な上端/下端を範囲内へクランプして採点ボタンへの侵入を防ぐ。
        const fitsDown = rect.bottom + gap + finalHeight <= clipBottom;
        const fitsUp = rect.top - gap - finalHeight >= clipTop;
        let openUp;
        if (fitsDown) {
          openUp = false;
        } else if (fitsUp) {
          openUp = true;
        } else {
          openUp = rect.top - clipTop > clipBottom - rect.bottom;
        }

        let listTop = openUp
          ? rect.top - gap - finalHeight
          : rect.bottom + gap;
        listTop = Math.max(clipTop, Math.min(listTop, clipBottom - finalHeight));

        list.style.maxHeight = `${finalHeight}px`;
        list.style.overflowY = "auto";
        list.style.bottom = "auto";
        list.style.top = `${Math.round(listTop)}px`;
      };
      state.positionList = positionList;

      const updatePending = (newIndex) => {
        if (newIndex < 0 || newIndex >= select.options.length) return;
        state.pendingIndex = newIndex;
        const nextText = select.options[newIndex]?.text || "";
        display.textContent = nextText;
        state.items.forEach((item, idx) => {
          if (idx === newIndex) {
            item.setAttribute("aria-selected", "true");
            item.scrollIntoView({ block: "nearest" });
          } else {
            item.removeAttribute("aria-selected");
          }
        });
      };

      const commitIndex = (idx) => {
        if (idx < 0 || idx >= select.options.length) return;
        const opt = select.options[idx];
        if (!opt || opt.disabled) return;
        updatePending(idx);
        select.selectedIndex = idx;
        select.value = opt.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
      };

      const findNextEnabled = (start, step) => {
        const total = select.options.length;
        if (total === 0) return start;
        let idx = start;
        for (let i = 0; i < total; i += 1) {
          idx = (idx + step + total) % total;
          if (!select.options[idx].disabled) {
            return idx;
          }
        }
        return start;
      };

      Array.from(select.options).forEach((opt, idx) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "ux-select-option";
        item.textContent = opt.text;
        item.style.fontSize = "var(--ux-select-option-font-size, 14px)";
        item.style.minHeight = "34px";
        item.style.lineHeight = "1.25";
        if (opt.disabled) {
          item.disabled = true;
          item.style.opacity = "0.5";
        }
        if (opt.selected) {
          item.setAttribute("aria-selected", "true");
        }
        item.addEventListener("click", (e) => {
          e.preventDefault();
          if (opt.disabled) return;
          commitIndex(idx);
          wrap.classList.remove("ux-open");
        });
        list.appendChild(item);
        items.push(item);
      });

      display.addEventListener("click", (e) => {
        e.preventDefault();
        const isOpen = wrap.classList.contains("ux-open");
        if (isOpen) {
          commitIndex(state.pendingIndex);
          wrap.classList.remove("ux-open");
        } else {
          closeAll();
          state.pendingIndex = select.selectedIndex;
          updatePending(state.pendingIndex);
          wrap.classList.add("ux-open");
          positionList();
        }
      });

      display.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          if (!wrap.classList.contains("ux-open")) {
            closeAll();
            wrap.classList.add("ux-open");
            positionList();
          }
          const step = e.key === "ArrowDown" ? 1 : -1;
          updatePending(findNextEnabled(state.pendingIndex, step));
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!wrap.classList.contains("ux-open")) {
            closeAll();
            state.pendingIndex = select.selectedIndex;
            updatePending(state.pendingIndex);
            wrap.classList.add("ux-open");
            positionList();
          } else {
            commitIndex(state.pendingIndex);
            wrap.classList.remove("ux-open");
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          wrap.classList.remove("ux-open");
          updatePending(select.selectedIndex);
        }
      });

      display.addEventListener(
        "wheel",
        (e) => {
          if (!wrap.classList.contains("ux-open")) return;
          e.preventDefault();
          const step = e.deltaY > 0 ? 1 : -1;
          updatePending(findNextEnabled(state.pendingIndex, step));
        },
        { passive: false },
      );
    });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".ux-select-wrap")) {
      closeAll();
    }
  });

  // position:fixed のドロップダウンはスクロールに追従しないため、
  // 開いている間はスクロール/リサイズで座標を再計算する。
  const repositionOpen = (e) => {
    // リスト内部のスクロールでは再配置しない（再配置するとスクロール位置が
    // 揺れてガクつくため）。ページ/フレーム側のスクロール時のみ追従する。
    if (e && e.target && e.target.closest && e.target.closest(".ux-select-list"))
      return;
    const openWrap = document.querySelector(".ux-select-wrap.ux-open");
    const state = openWrap && openWrap.__uxSelectState;
    if (state && state.positionList) state.positionList();
  };
  window.addEventListener("scroll", repositionOpen, true);
  window.addEventListener("resize", repositionOpen);
}

function prepareShikenAnswerSurface(form) {
  if (!form || form.dataset.uxAnswerPrepared === "true")
    return getShikenAnswerSurfaceProfile(form);
  form.dataset.uxAnswerPrepared = "true";

  const profile = getShikenAnswerSurfaceProfile(form);
  document.body.classList.toggle(
    "ux-shiken-answer-card-page",
    profile.hasAnswerControl,
  );
  document.body.classList.toggle(
    "ux-shiken-upload-answer-page",
    profile.hasFile,
  );
  document.body.classList.toggle(
    "ux-shiken-text-answer-page",
    profile.hasTextarea || profile.hasTextInput,
  );
  document.body.classList.toggle(
    "ux-shiken-select-answer-page",
    profile.hasSelect,
  );
  form.classList.toggle("ux-shiken-answer-form", profile.hasAnswerControl);
  form.classList.toggle("ux-shiken-upload-answer-form", profile.hasFile);

  if (profile.hasAnswerControl) {
    setUploadAnswerFramesetRows();
  }

  profile.textareas.forEach((textarea) => {
    textarea.classList.add("ux-shiken-textarea");
    if (
      !textarea.hasAttribute("aria-label") &&
      !textarea.hasAttribute("aria-labelledby")
    ) {
      textarea.setAttribute("aria-label", "回答内容");
    }
    if (!textarea.name) {
      textarea.name = "answer";
    }
  });

  if (
    profile.hasAnswerControl &&
    !form.querySelector(".ux-shiken-answer-heading")
  ) {
    const heading = document.createElement("div");
    heading.className = "ux-shiken-answer-heading";
    heading.textContent = "回答";
    form.insertBefore(
      heading,
      getShikenAnswerSurfaceAnchor(form, profile) || form.firstChild,
    );
  }

  Array.from(
    form.querySelectorAll('button, input[type="button"], input[type="submit"]'),
  ).forEach((button) => {
    const label = getShikenAnswerControlLabel(button);
    if (label.includes("回答を保存")) {
      button.classList.add("ux-save-answer-button");
      if (!button.hasAttribute("aria-label")) {
        button.setAttribute("aria-label", "回答を保存");
      }
      const buttonParent = button.parentElement;
      if (buttonParent && buttonParent !== form) {
        buttonParent.classList.add("ux-save-answer-row");
      }
    }
  });

  if (profile.hasAnswerControl) {
    const answerCard = wrapShikenAnswerSurfaceContent(form);
    if (answerCard) {
      answerCard.tabIndex = 0;
      answerCard.setAttribute("role", "region");
      answerCard.setAttribute(
        "aria-label",
        profile.hasFile ? "回答ファイル" : "回答欄",
      );
      if (isShikenSinglePageActive()) {
        attachShikenFrameResizeHandle(answerCard, {
          frameName: "answer",
          label: profile.hasFile ? "回答ファイルフィールド" : "回答フィールド",
        });
      }
    }
  }

  return profile;
}

function bindShikenAnswerSaveStatus(form) {
  if (!form || form.dataset.uxSaveStatusPrepared === "true") return;
  form.dataset.uxSaveStatusPrepared = "true";

  const saveButton = form.querySelector(".ux-save-answer-button");
  let saveStatus = form.querySelector(".ux-answer-save-status");
  if (saveButton && !saveStatus) {
    saveStatus = document.createElement("span");
    saveStatus.className = "ux-answer-save-status";
    saveStatus.setAttribute("role", "status");
    saveStatus.setAttribute("aria-live", "polite");
    saveStatus.appendChild(createShikenAnswerSaveCheck(document));
    const statusText = document.createElement("span");
    statusText.className = "ux-answer-save-status-text";
    saveStatus.appendChild(statusText);
    saveButton.insertAdjacentElement("beforebegin", saveStatus);
  }

  let saveStatusTimer = 0;
  const setSaveStatus = (state, timestamp = Date.now()) => {
    if (!saveStatus) return;
    const text = saveStatus.querySelector(".ux-answer-save-status-text");
    if (saveStatusTimer) {
      window.clearTimeout(saveStatusTimer);
      saveStatusTimer = 0;
    }
    saveStatus.classList.toggle(
      "is-visible",
      state === "saving" || state === "saved" || state === "last-saved",
    );
    saveStatus.classList.toggle("is-saving", state === "saving");
    saveStatus.classList.toggle("is-last-saved", state === "last-saved");
    if (text) {
      text.textContent =
        state === "saving"
          ? "保存中..."
          : state === "saved"
            ? "保存しました"
            : state === "last-saved"
              ? `最終保存 ${formatShikenAnswerSaveTime(timestamp)}`
              : "";
    }
    if (state === "saved") {
      saveStatusTimer = window.setTimeout(() => {
        setSaveStatus("last-saved", timestamp);
      }, 5000);
    }
  };

  if (saveButton && saveButton.dataset.uxSaveStatusBound !== "true") {
    saveButton.dataset.uxSaveStatusBound = "true";
    saveButton.addEventListener(
      "click",
      () => {
        markShikenAnswerSavePending();
        setSaveStatus("saving");
        window.setTimeout(() => {
          if (!document.contains(saveButton)) return;
          const savedAt = consumeShikenAnswerSavePending();
          if (!savedAt) return;
          setSaveStatus("saved", savedAt);
        }, 1800);
      },
      true,
    );
  }

  const savedAt = consumeShikenAnswerSavePending();
  if (savedAt) {
    setSaveStatus("saved", savedAt);
  }

  const answerControls = form.querySelectorAll(
    'textarea, select, input[type="file"], input[type="text"], input:not([type])',
  );
  answerControls.forEach((control) => {
    control.addEventListener("input", () => setSaveStatus("idle"), {
      once: true,
    });
    control.addEventListener("change", () => setSaveStatus("idle"), {
      once: true,
    });
  });
}

function enhanceOneByOneShikenFrameset() {
  log("Enhancing one-by-one shiken frameset");
  rememberUxOriginalFrameStructure(document);
  rememberUxOriginalShikenFrameStructure(document);

  bindShikenLayoutMessageListener();
  const currentLayoutMode = resolveInitialShikenLayoutMode(document);
  if (currentLayoutMode === UX_SHIKEN_LAYOUT_HORIZONTAL) {
    if (applySinglePageOneByOneShikenLayout(document)) {
      document.documentElement.dataset.uxShikenLayoutMode =
        UX_SHIKEN_LAYOUT_HORIZONTAL;
      syncShikenLayoutClasses(document, UX_SHIKEN_LAYOUT_HORIZONTAL);
      return;
    }
  }

  const outerFrameset = document.querySelector("frameset[rows]");
  const mainFrameset = Array.from(
    document.querySelectorAll("frameset[cols]"),
  ).find((frameset) => {
    return !!getDirectChildFrame(frameset, "button");
  });

  if (
    !outerFrameset ||
    !mainFrameset ||
    outerFrameset.getAttribute("data-ux-onebyone-shiken") === "true"
  ) {
    return;
  }

  const contentRows = getDirectChildFrameset(mainFrameset, "rows", [
    "question",
  ]);
  const answerCols = getDirectChildFrameset(contentRows, "cols", [
    "answer",
    "description",
  ]);

  outerFrameset.setAttribute("data-ux-onebyone-shiken", "true");
  outerFrameset.setAttribute("rows", "0,*");
  outerFrameset.setAttribute("border", "0");
  outerFrameset.setAttribute("frameborder", "0");
  outerFrameset.setAttribute("framespacing", "0");

  mainFrameset.setAttribute("cols", "280,*");
  mainFrameset.setAttribute("border", "0");
  mainFrameset.setAttribute("frameborder", "0");
  mainFrameset.setAttribute("framespacing", "0");

  if (contentRows) {
    contentRows.setAttribute("rows", "220,*");
    contentRows.setAttribute("border", "0");
    contentRows.setAttribute("frameborder", "0");
    contentRows.setAttribute("framespacing", "0");
  }

  if (answerCols) {
    answerCols.setAttribute("cols", "390,*");
    answerCols.setAttribute("border", "0");
    answerCols.setAttribute("frameborder", "0");
    answerCols.setAttribute("framespacing", "0");
  }

  ["button", "question", "answer", "description"].forEach((name) => {
    const frame = document.querySelector(`frame[name="${name}"]`);
    if (!frame) return;
    frame.setAttribute("noresize", "");
    frame.setAttribute("scrolling", "auto");
  });
}

function enhanceOneByOneShikenButtonFrame() {
  ensureCourseColorTokens(document);
  enableUxAutoOverflowScrolling(document);
  ensureUxFrameActionButtonFit(document);
  syncCurrentFrameShikenLayoutClassFromParent();
  document.documentElement.classList.toggle(
    "ux-shiken-single-page-frame",
    isShikenSinglePageActive(),
  );
  bindSinglePageShikenChildBridge(document);

  if (isOneByOneQuestionListFrame()) {
    enhanceOneByOneQuestionListFrame();
    return;
  }

  if (document.getElementById("ux-onebyone-button-style")) return;

  const style = document.createElement("style");
  style.id = "ux-onebyone-button-style";
  style.textContent = `
        html, body {
            height: 100%;
            margin: 0;
            background: var(--ux-home-page-bg);
        }
        body {
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            padding: 8px;
            color: var(--ux-home-label);
            font-family: 'Noto Sans JP', 'Yu Gothic', 'Meiryo', 'Hiragino Sans', 'Segoe UI', sans-serif;
            -webkit-font-smoothing: antialiased;
            overflow: auto;
        }
        #top {
            flex: 1 1 auto;
            height: 100%;
            min-height: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
            box-sizing: border-box;
        }
        #top > * {
            flex: 0 0 auto;
        }
        #WsTitle {
            margin: 0;
            padding: 0 0 6px;
            border-bottom: 1px solid var(--ux-home-separator);
            background: transparent !important;
        }
        #WsTitle h1,
        #WsTitle h2 {
            margin: 0;
            padding: 0;
            word-break: break-word;
            overflow-wrap: anywhere;
            letter-spacing: 0;
        }
        #WsTitle h1 {
            display: block !important;
            color: var(--ux-home-secondary-label) !important;
            font-size: 11px;
            font-weight: 500;
            line-height: 1.35;
        }
        #WsTitle h1 *,
        #WsTitle h2 * {
            color: inherit !important;
        }
        #WsTitle h2 {
            margin-top: 3px;
            color: var(--ux-home-label) !important;
            font-size: 15px;
            font-weight: 700;
            line-height: 1.3;
        }
        #User,
        .User,
        div[id*="User"] {
            margin: 0;
            color: var(--ux-home-secondary-label);
            font-size: 12px;
            line-height: 1.4;
            text-align: right;
        }
        form[name="button_form"] {
            display: none !important;
        }
        form[name="button_form"] button,
        form[name="button_form"] input[type="button"] {
            width: 100%;
            min-height: 36px;
            box-sizing: border-box;
            border: 1px solid var(--ux-home-separator);
            border-radius: 6px;
            background: var(--ux-home-surface);
            color: var(--ux-home-accent-emphasis);
            font-size: 13px;
            font-weight: 700;
            font-family: inherit;
            line-height: 1.2;
            cursor: pointer;
            box-shadow: var(--ux-home-shadow-sm);
        }
        form[name="button_form"] button:hover,
        form[name="button_form"] input[type="button"]:hover {
            background: var(--ux-home-accent-softer);
            border-color: var(--ux-home-accent);
        }
        form[name="button_form"] button[name="grade"],
        form[name="button_form"] input[name="grade"] {
            background: var(--ux-home-danger);
            border-color: var(--ux-home-danger);
            color: var(--ux-home-surface);
        }
        form[name="button_form"] button[name="grade"]:hover,
        form[name="button_form"] input[name="grade"]:hover {
            background: var(--ux-home-danger-foreground);
            border-color: var(--ux-home-danger-foreground);
        }
        .limitInfo {
            margin: 0 !important;
            min-height: 32px;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 5px 10px !important;
            border: 1px solid var(--ux-home-separator);
            border-radius: 6px;
            background: var(--ux-home-surface);
            color: var(--ux-home-secondary-label);
            font-size: 12px;
            line-height: 1.35;
            text-align: center;
            box-shadow: var(--ux-home-shadow-sm);
        }
        #TOC {
            flex: 1 1 auto;
            min-height: 0;
            display: block;
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
        }
        #TOCContent {
            display: block !important;
            width: 100% !important;
            height: 100% !important;
            min-height: 0;
            border: 0 !important;
            border-radius: 6px;
            background: var(--ux-home-surface);
            box-shadow: var(--ux-home-shadow-sm);
        }
        hr,
        br + br {
            display: none;
        }
    `;
  document.head.appendChild(style);

  const top = document.getElementById("top");
  const limitInfo = document.querySelector(".limitInfo");
  const toc = document.getElementById("TOC");

  if (top) {
    top.querySelectorAll("hr, br").forEach((node) => node.remove());
    Array.from(top.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === "") {
        node.remove();
      }
    });
  }

  if (
    top &&
    limitInfo &&
    toc &&
    limitInfo.parentElement === top &&
    toc.previousElementSibling !== limitInfo
  ) {
    top.insertBefore(toc, limitInfo.nextSibling);
  }

  const tocIframe = document.getElementById("TOCContent");
  if (tocIframe) {
    const inject = () => {
      try {
        const tocDoc =
          tocIframe.contentDocument || tocIframe.contentWindow?.document;
        if (tocDoc) enhanceOneByOneQuestionListFrame(tocDoc);
      } catch (e) {
        log("Could not style one-by-one TOC frame:", e?.message || e);
      }
    };
    tocIframe.addEventListener("load", inject);
    inject();
  }
}

function isOneByOneQuestionListFrame() {
  try {
    const params = new URL(window.location.href).searchParams;
    if (params.get("myFrameName") === "buttons") return true;
  } catch (e) {
    // ignore URL parsing errors
  }
  return (
    !document.getElementById("WsTitle") &&
    /Q\.\s*\d+/i.test(document.body?.textContent || "")
  );
}

function enhanceOneByOneQuestionListFrame(targetDoc = document) {
  ensureCourseColorTokens(targetDoc);
  rememberUxOriginalBodyState(targetDoc);
  if (targetDoc.getElementById("ux-onebyone-toc-style")) return;

  const style = targetDoc.createElement("style");
  style.id = "ux-onebyone-toc-style";
  style.textContent = `
        html, body {
            margin: 0;
            min-height: 100%;
            background: var(--ux-home-surface);
            color: var(--ux-home-label);
            font-family: 'Noto Sans JP', 'Yu Gothic', 'Meiryo', 'Hiragino Sans', 'Segoe UI', sans-serif;
            box-sizing: border-box;
        }
        body {
            padding: 6px;
            overflow: auto;
        }
        table {
            display: block;
            width: 100%;
            border-collapse: separate;
            border-spacing: 0 4px;
        }
        tbody {
            display: block;
            width: 100%;
        }
        tr.ux-qnav-empty {
            display: none;
        }
        tr.ux-qnav-item {
            display: block;
            width: 100%;
            margin-bottom: 4px;
        }
        tr.ux-qnav-item td {
            display: none;
        }
        tr.ux-qnav-item td.ux-qnav-label {
            min-height: 32px;
            width: 100%;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            padding: 0 10px;
            border: 1px solid transparent;
            border-radius: 6px;
            color: var(--ux-home-label);
            font-size: 13px;
            font-weight: 650;
            line-height: 1.2;
            vertical-align: middle;
            background: var(--ux-home-surface);
        }
        tr.ux-qnav-item.is-current td.ux-qnav-label {
            border-color: var(--ux-home-accent);
            background: var(--ux-home-accent-soft);
            color: var(--ux-home-accent-emphasis);
        }
        tr.ux-qnav-item.is-unanswered:not(.is-current) td.ux-qnav-label {
            color: var(--ux-home-secondary-label);
        }
        .red_moji {
            color: var(--ux-home-accent-emphasis);
            font-weight: 800;
            margin-right: 4px;
        }
        input[type="button"],
        button {
            -webkit-appearance: none;
            appearance: none;
            width: 30px;
            min-width: 30px;
            max-width: 30px;
            height: 28px;
            min-height: 28px;
            box-sizing: border-box;
            border: 1px solid var(--ux-home-separator);
            border-radius: 6px;
            padding: 0;
            background: var(--ux-home-surface-soft);
            color: var(--ux-home-accent-emphasis);
            font-family: inherit;
            font-size: 12px;
            font-weight: 700;
            line-height: 26px;
            text-align: center;
            cursor: pointer;
            box-shadow: var(--ux-home-shadow-sm);
        }
        input[type="button"]:hover,
        button:hover {
            border-color: var(--ux-home-accent);
            background: var(--ux-home-accent-softer);
        }
        input[type="button"]:focus-visible,
        button:focus-visible {
            outline: none;
            border-color: var(--ux-home-accent);
            box-shadow: var(--ux-home-focus-ring);
        }
        td {
            white-space: nowrap;
        }
    `;
  targetDoc.head.appendChild(style);

  targetDoc.querySelectorAll("tr").forEach((row) => {
    const text = row.textContent.replace(/\s|\u00a0/g, "");
    if (!text) {
      row.classList.add("ux-qnav-empty");
      return;
    }
    if (/Q\.\d+/i.test(text)) {
      row.classList.add("ux-qnav-item");
      row.classList.toggle(
        "is-current",
        text.includes(">") || !!row.querySelector(".bkkhaki"),
      );
      row.classList.toggle("is-unanswered", text.includes("*"));
      const labelCell =
        Array.from(row.cells || []).find((cell) =>
          /Q\.\s*\d+/i.test(cell.textContent || ""),
        ) ||
        row.querySelector('input[type="button"], button')?.closest("td") ||
        row.cells?.[0];
      if (labelCell) {
        labelCell.classList.add("ux-qnav-label");
      }
    }
  });
}

function enhanceOneByOneShikenQuestionFrame() {
  ensureCourseColorTokens(document);
  enableUxAutoOverflowScrolling(document);
  ensureUxFrameActionButtonFit(document);
  syncCurrentFrameShikenLayoutClassFromParent();
  document.documentElement.classList.toggle(
    "ux-shiken-single-page-frame",
    isShikenSinglePageActive(),
  );
  bindSinglePageShikenChildBridge(document);
  if (document.getElementById("ux-onebyone-question-style")) return;

  const style = document.createElement("style");
  style.id = "ux-onebyone-question-style";
  style.textContent = `
        html, body {
            height: 100%;
            margin: 0;
            background: var(--ux-home-page-bg);
        }
        body {
            box-sizing: border-box;
            display: flex;
            align-items: stretch;
            padding: 14px 18px 10px 18px;
            color: var(--ux-home-label);
            font-family: 'Noto Sans JP', 'Yu Gothic', 'Meiryo', 'Hiragino Sans', 'Segoe UI', sans-serif;
            font-size: 16px;
            line-height: 1.8;
            -webkit-font-smoothing: antialiased;
            overflow: auto;
        }
        .ux-onebyone-question-card {
            position: relative;
            width: 100%;
            flex: 1 1 auto;
            min-height: 0;
            max-height: 100%;
            margin: 0 !important;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            padding: 18px 22px;
            border: 1px solid var(--ux-home-separator);
            border-radius: 6px;
            background: var(--ux-home-surface);
            box-shadow: var(--ux-home-shadow-sm);
            min-width: 0;
            overflow: auto;
            overflow-wrap: anywhere;
            overscroll-behavior: contain;
            scrollbar-gutter: stable;
        }
        .ux-onebyone-question-card::before {
            content: "問題";
            display: flex;
            position: sticky;
            top: -18px;
            z-index: 1;
            margin: -18px -22px 8px;
            padding: 18px 22px 4px;
            background: var(--ux-home-surface);
            color: var(--ux-home-secondary-label);
            font-size: 12px;
            font-weight: 700;
            line-height: 1.3;
        }
        .ux-onebyone-question-card:focus-visible {
            outline: none;
            box-shadow: var(--ux-home-focus-ring), var(--ux-home-shadow-sm);
        }
        .ux-shiken-frame-resize-handle {
            position: absolute;
            right: 8px;
            bottom: 8px;
            z-index: 3;
            width: 12px;
            height: 12px;
            min-width: 12px;
            min-height: 12px;
            padding: 0;
            border: 0;
            border-radius: 3px;
            appearance: none;
            color: transparent;
            line-height: 0;
            flex: 0 0 12px;
            background:
                linear-gradient(135deg, transparent 0 58%, rgba(110, 110, 115, 0.48) 58% 66%, transparent 66%),
                linear-gradient(135deg, transparent 0 76%, rgba(110, 110, 115, 0.48) 76% 84%, transparent 84%);
            cursor: ns-resize;
            opacity: 0.46;
            box-shadow: none;
        }
        .ux-shiken-frame-resize-handle:hover,
        .ux-shiken-frame-resize-handle:focus-visible {
            opacity: 0.85;
            background-color: var(--ux-home-accent-softer);
            box-shadow: 0 0 0 2px var(--ux-home-accent-softer);
        }
        body.ux-shiken-frame-resizing,
        body.ux-shiken-frame-resizing * {
            cursor: ns-resize !important;
            user-select: none !important;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        td, th {
            padding: 0;
            vertical-align: top;
            overflow-wrap: anywhere;
        }
        img,
        video,
        iframe {
            max-width: 100%;
        }
        html.ux-shiken-single-page-frame,
        html.ux-shiken-single-page-frame body {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
        }
        html.ux-shiken-single-page-frame body {
            display: block !important;
            padding: 12px 16px 14px !important;
        }
        html.ux-shiken-single-page-frame .ux-onebyone-question-card {
            flex: none !important;
            max-height: none !important;
            min-height: 0 !important;
            overflow: visible !important;
        }
    `;
  document.head.appendChild(style);
  const questionCard = wrapOneByOneBodyContent("ux-onebyone-question-card");
  if (questionCard) {
    questionCard.tabIndex = 0;
    questionCard.setAttribute("role", "region");
    questionCard.setAttribute("aria-label", "問題文");
    if (isShikenSinglePageActive()) {
      attachShikenFrameResizeHandle(questionCard, {
        frameName: "question",
        label: "問題フィールド",
      });
    }
  }
}

function enhanceOneByOneShikenAnswerFrame() {
  ensureCourseColorTokens(document);
  enableUxAutoOverflowScrolling(document);
  ensureUxFrameActionButtonFit(document);
  syncCurrentFrameShikenLayoutClassFromParent();
  document.documentElement.classList.toggle(
    "ux-shiken-single-page-frame",
    isShikenSinglePageActive(),
  );
  bindSinglePageShikenChildBridge(document);
  if (document.getElementById("ux-onebyone-answer-style")) return;

  const style = document.createElement("style");
  style.id = "ux-onebyone-answer-style";
  style.textContent = `
        html, body {
            height: 100%;
            margin: 0;
            background: var(--ux-home-page-bg);
        }
        body {
            box-sizing: border-box;
            display: flex;
            align-items: stretch;
            padding: 10px 10px 16px 18px;
            color: var(--ux-home-label);
            font-family: 'Noto Sans JP', 'Yu Gothic', 'Meiryo', 'Hiragino Sans', 'Segoe UI', sans-serif;
            -webkit-font-smoothing: antialiased;
            overflow: auto;
        }
        form[name="answer_form"] {
            width: calc(100vw - 28px) !important;
            max-width: calc(100vw - 28px);
            display: flex;
            flex-direction: column;
            gap: 10px;
            flex: 1 1 auto;
            min-width: 0;
            margin: 0;
            float: none !important;
            box-sizing: border-box;
        }
        .ux-onebyone-answer-root {
            width: calc(100vw - 28px) !important;
            max-width: calc(100vw - 28px) !important;
            box-sizing: border-box;
            display: block;
            text-align: initial;
        }
        .ux-shiken-frame-resize-handle {
            position: absolute;
            right: 8px;
            bottom: 8px;
            z-index: 3;
            width: 12px;
            height: 12px;
            min-width: 12px;
            min-height: 12px;
            padding: 0;
            border: 0;
            border-radius: 3px;
            appearance: none;
            color: transparent;
            line-height: 0;
            flex: 0 0 12px;
            background:
                linear-gradient(135deg, transparent 0 58%, rgba(110, 110, 115, 0.48) 58% 66%, transparent 66%),
                linear-gradient(135deg, transparent 0 76%, rgba(110, 110, 115, 0.48) 76% 84%, transparent 84%);
            cursor: ns-resize;
            opacity: 0.46;
            box-shadow: none;
        }
        .ux-shiken-frame-resize-handle:hover,
        .ux-shiken-frame-resize-handle:focus-visible {
            opacity: 0.85;
            background-color: var(--ux-home-accent-softer);
            box-shadow: 0 0 0 2px var(--ux-home-accent-softer);
        }
        body.ux-shiken-frame-resizing,
        body.ux-shiken-frame-resizing * {
            cursor: ns-resize !important;
            user-select: none !important;
        }
        .ux-onebyone-answer-heading {
            margin: 0;
            color: var(--ux-home-secondary-label);
            font-size: 12px;
            font-weight: 700;
            line-height: 1.3;
        }
        table.qstnoptions {
            display: block;
            width: 100%;
            border-collapse: collapse;
        }
        table.qstnoptions tbody {
            display: flex;
            flex-direction: column;
            gap: 8px;
            width: 100%;
        }
        table.qstnoptions tr.ux-choice-row {
            width: 100%;
            min-height: 44px;
            box-sizing: border-box;
            display: grid;
            grid-template-columns: 34px 34px minmax(0, 1fr);
            align-items: center;
            border: 1px solid var(--ux-home-separator);
            border-radius: 6px;
            background: var(--ux-home-surface);
            box-shadow: var(--ux-home-shadow-sm);
            transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
        }
        table.qstnoptions th {
            width: auto;
            height: 100%;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            padding: 0 8px 0 0;
            color: var(--ux-home-secondary-label);
            font-size: 14px;
            font-weight: 700;
            text-align: right;
            vertical-align: middle;
        }
        table.qstnoptions td {
            height: 100%;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            padding: 0 12px;
            border: 0;
            background: transparent;
            color: var(--ux-home-label);
            font-size: 15px;
            font-weight: 700;
            line-height: 1.35;
            white-space: nowrap;
            vertical-align: middle;
        }
        table.qstnoptions tr.ux-choice-shadow-row {
            display: none !important;
        }
        table.qstnoptions tr:has(textarea),
        table.qstnoptions tr:has(select),
        table.qstnoptions tr:has(input[type="file"]),
        table.qstnoptions tr:has(input[type="text"]) {
            width: 100%;
            box-sizing: border-box;
            display: block;
        }
        table.qstnoptions tr:has(textarea) > th,
        table.qstnoptions tr:has(textarea) > td,
        table.qstnoptions tr:has(select) > th,
        table.qstnoptions tr:has(select) > td,
        table.qstnoptions tr:has(input[type="file"]) > th,
        table.qstnoptions tr:has(input[type="file"]) > td,
        table.qstnoptions tr:has(input[type="text"]) > th,
        table.qstnoptions tr:has(input[type="text"]) > td {
            width: 100%;
            min-width: 0;
            height: auto;
            box-sizing: border-box;
            display: block;
            padding: 6px 0;
            white-space: normal;
        }
        table.qstnoptions td.option-label {
            justify-content: flex-start;
            min-width: 0;
        }
        table.qstnoptions td.point {
            display: block;
            height: auto;
            padding: 0 4px;
            color: var(--ux-home-secondary-label);
            font-size: 12px;
            font-weight: 600;
            text-align: right;
            background: transparent;
            white-space: normal;
        }
        table.qstnoptions.ux-source-options-hidden {
            display: none !important;
        }
        .ux-onebyone-choice-list {
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .ux-onebyone-choice {
            width: 100%;
            min-height: 44px;
            box-sizing: border-box;
            display: grid;
            grid-template-columns: 34px 34px minmax(0, 1fr);
            align-items: center;
            border: 1px solid var(--ux-home-separator);
            border-radius: 6px;
            background: var(--ux-home-surface);
            color: var(--ux-home-label);
            box-shadow: var(--ux-home-shadow-sm);
            cursor: pointer;
            transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
        }
        .ux-onebyone-choice:hover {
            border-color: var(--ux-home-accent);
            background: var(--ux-home-accent-softer);
        }
        .ux-onebyone-choice.is-selected {
            border-color: var(--ux-home-accent);
            background: var(--ux-home-accent-soft);
            color: var(--ux-home-accent-emphasis);
        }
        .ux-onebyone-choice-number {
            color: var(--ux-home-secondary-label);
            font-size: 14px;
            font-weight: 700;
            text-align: right;
        }
        .ux-onebyone-choice-radio {
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .ux-onebyone-choice-label {
            min-width: 0;
            color: inherit;
            font-size: 15px;
            font-weight: 700;
            line-height: 1.35;
            white-space: normal;
            overflow-wrap: anywhere;
        }
        .ux-onebyone-choice-point {
            color: var(--ux-home-secondary-label);
            font-size: 12px;
            font-weight: 600;
            text-align: right;
        }
        .ux-onebyone-result-title {
            min-height: 40px;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            margin: 0;
            padding: 8px 12px;
            border: 1px solid var(--ux-home-separator);
            border-left: 4px solid var(--ux-home-accent);
            border-radius: 6px;
            background: var(--ux-home-surface);
            color: var(--ux-home-label);
            font-size: 15px;
            font-weight: 800;
            line-height: 1.35;
            box-shadow: var(--ux-home-shadow-sm);
        }
        .ux-onebyone-result-title.is-correct {
            border-left-color: var(--ux-home-success);
            background: var(--ux-home-success-soft);
            color: var(--ux-home-success-foreground);
        }
        .ux-onebyone-result-title.is-wrong {
            border-left-color: var(--ux-home-danger);
            background: var(--ux-home-danger-soft);
            color: var(--ux-home-danger-foreground);
        }
        .ux-onebyone-result-block {
            width: 100%;
            align-self: stretch;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .ux-onebyone-result-list {
            width: 100%;
            align-self: stretch;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .ux-onebyone-result-choice {
            width: 100%;
            min-height: 44px;
            box-sizing: border-box;
            display: grid;
            grid-template-columns: 34px 34px minmax(0, 1fr);
            align-items: center;
            border: 1px solid var(--ux-home-separator);
            border-radius: 6px;
            background: var(--ux-home-surface);
            color: var(--ux-home-label);
            box-shadow: var(--ux-home-shadow-sm);
        }
        .ux-onebyone-result-choice.is-selected {
            border-color: var(--ux-home-accent);
            background: var(--ux-home-accent-soft);
            color: var(--ux-home-accent-emphasis);
        }
        .ux-onebyone-result-number {
            color: var(--ux-home-secondary-label);
            font-size: 14px;
            font-weight: 700;
            text-align: right;
        }
        .ux-onebyone-result-marker {
            width: 18px;
            height: 18px;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: center;
            justify-self: center;
            border: 1px solid var(--ux-home-separator);
            border-radius: 50%;
            color: transparent;
            font-size: 12px;
            font-weight: 800;
            line-height: 1;
        }
        .ux-onebyone-result-choice.is-selected .ux-onebyone-result-marker {
            border-color: var(--ux-home-accent);
            background: var(--ux-home-accent);
            color: var(--ux-home-surface);
        }
        .ux-onebyone-result-label {
            min-width: 0;
            color: inherit;
            font-size: 15px;
            font-weight: 700;
            line-height: 1.35;
            white-space: normal;
            overflow-wrap: anywhere;
        }
        .ux-onebyone-result-score {
            color: var(--ux-home-secondary-label);
            font-size: 12px;
            font-weight: 600;
            text-align: right;
        }
        .ux-source-result-hidden {
            display: none !important;
        }
        table.qstnoptions tr.ux-choice-row td,
        table.qstnoptions tr.ux-choice-row th {
            cursor: pointer;
        }
        table.qstnoptions tr.ux-choice-row:hover {
            border-color: var(--ux-home-accent);
            background: var(--ux-home-accent-softer);
        }
        table.qstnoptions tr.ux-choice-row.is-selected {
            border-color: var(--ux-home-accent);
            background: var(--ux-home-accent-soft);
        }
        table.qstnoptions tr.ux-choice-row.is-selected td,
        table.qstnoptions tr.ux-choice-row.is-selected th {
            color: var(--ux-home-accent-emphasis);
        }
        input[type="radio"] {
            width: 14px;
            height: 14px;
            margin: 0;
            accent-color: var(--ux-home-accent);
            vertical-align: -1px;
        }
        select,
        input[type="text"],
        input[type="file"],
        textarea {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            box-sizing: border-box;
            border: 1px solid var(--ux-home-separator);
            border-radius: 6px;
            padding: 8px 10px;
            background: var(--ux-home-surface);
            color: var(--ux-home-label);
            font-family: inherit;
            font-size: 14px;
            box-shadow: var(--ux-home-shadow-sm);
        }
        textarea {
            min-height: clamp(16rem, 48vh, 34rem);
            line-height: 1.55;
            resize: vertical;
        }
        .ux-onebyone-answer-actions {
            width: 100%;
            margin-top: 2px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
            gap: 10px;
            align-items: center;
        }
        .ux-onebyone-answer-actions button,
        .ux-onebyone-answer-actions input[type="button"] {
            width: 100%;
            min-height: 38px;
            box-sizing: border-box;
            border: 1px solid var(--ux-home-separator);
            border-radius: 6px;
            background: var(--ux-home-surface);
            color: var(--ux-home-accent-emphasis);
            font-family: inherit;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.2;
            cursor: pointer;
            box-shadow: var(--ux-home-shadow-sm);
        }
        .ux-onebyone-answer-actions button:hover,
        .ux-onebyone-answer-actions input[type="button"]:hover {
            background: var(--ux-home-accent-softer);
            border-color: var(--ux-home-accent);
        }
        .ux-onebyone-answer-actions button:disabled,
        .ux-onebyone-answer-actions input[type="button"]:disabled {
            background: var(--ux-home-fill);
            border-color: var(--ux-home-separator);
            color: var(--ux-home-tertiary-label);
            cursor: not-allowed;
            box-shadow: none;
        }
        .ux-onebyone-answer-actions button[name="grade"],
        .ux-onebyone-answer-actions input[name="grade"],
        .ux-onebyone-answer-actions .ux-danger,
        .ux-onebyone-answer-actions #GradeBtn {
            background: var(--ux-home-danger);
            border-color: var(--ux-home-danger);
            color: var(--ux-home-surface);
        }
        .ux-onebyone-answer-actions button[name="grade"]:hover,
        .ux-onebyone-answer-actions input[name="grade"]:hover,
        .ux-onebyone-answer-actions .ux-danger:hover,
        .ux-onebyone-answer-actions #GradeBtn:hover {
            background: var(--ux-home-danger-foreground);
            border-color: var(--ux-home-danger-foreground);
        }
        br {
            display: none;
        }
        html.ux-shiken-single-page-frame,
        html.ux-shiken-single-page-frame body {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
        }
        html.ux-shiken-single-page-frame body {
            display: block !important;
            padding: 12px 14px 18px !important;
        }
        html.ux-shiken-single-page-frame form[name="answer_form"] {
            width: 100% !important;
            max-width: 100% !important;
            min-height: 0 !important;
            height: auto !important;
            flex: none !important;
        }
        html.ux-shiken-single-page-frame .ux-onebyone-answer-root {
            position: relative;
            width: 100% !important;
            max-width: 100% !important;
            min-height: 0;
            overflow: visible !important;
        }
        html.ux-shiken-single-page-frame textarea {
            height: auto;
            min-height: 12rem !important;
            overflow-y: hidden !important;
        }
    `;
  document.head.appendChild(style);

  const form = document.querySelector('form[name="answer_form"]');
  if (!form) return;

  if (form.parentElement && form.parentElement !== document.body) {
    form.parentElement.classList.add("ux-onebyone-answer-root");
    if (isShikenSinglePageActive()) {
      attachShikenFrameResizeHandle(form.parentElement, {
        frameName: "answer",
        label: "回答フィールド",
      });
    }
  }

  getShikenAnswerSurfaceProfile(form).textareas.forEach((textarea) => {
    if (
      !textarea.hasAttribute("aria-label") &&
      !textarea.hasAttribute("aria-labelledby")
    ) {
      textarea.setAttribute("aria-label", "回答内容");
    }
    if (!textarea.name) {
      textarea.name = "answer";
    }
  });
  bindSinglePageAnswerTextareaAutoSize(form);

  const optionTable = document.querySelector("table.qstnoptions");
  const optionRows = Array.from(
    document.querySelectorAll("table.qstnoptions tr"),
  );
  optionRows.forEach((row) => {
    if (row.querySelectorAll('input[type="radio"]').length > 1) {
      row.classList.add("ux-choice-shadow-row");
    }
  });

  const choiceRows = optionRows.filter(
    (row) => row.querySelectorAll('input[type="radio"]').length === 1,
  );
  const choiceCards = [];
  if (
    choiceRows.length > 0 &&
    !form.querySelector(".ux-onebyone-answer-heading")
  ) {
    const heading = document.createElement("div");
    heading.className = "ux-onebyone-answer-heading";
    heading.textContent = "回答";
    form.insertBefore(heading, optionTable || form.firstChild);
  }

  if (
    optionTable &&
    choiceRows.length > 0 &&
    !form.querySelector(".ux-onebyone-choice-list")
  ) {
    const choiceList = document.createElement("div");
    choiceList.className = "ux-onebyone-choice-list";

    choiceRows.forEach((row) => {
      const radio = row.querySelector('input[type="radio"]');
      if (!radio) return;

      const card = document.createElement("div");
      card.className = "ux-onebyone-choice";
      card.setAttribute("role", "button");
      card.tabIndex = 0;

      const number = document.createElement("span");
      number.className = "ux-onebyone-choice-number";
      number.textContent = (
        row.querySelector(".prefix")?.textContent || ""
      ).trim();

      const radioSlot = document.createElement("span");
      radioSlot.className = "ux-onebyone-choice-radio";
      radioSlot.appendChild(radio);

      const label = document.createElement("span");
      label.className = "ux-onebyone-choice-label";
      label.textContent = (
        row.querySelector(".option-label")?.textContent ||
        row.textContent ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^(\d+\.)\s*/, "");

      card.appendChild(number);
      card.appendChild(radioSlot);
      card.appendChild(label);
      choiceList.appendChild(card);
      choiceCards.push({ card, radio });

      const choose = (event) => {
        if (event?.target === radio) return;
        radio.click();
        refreshChoiceState();
      };
      card.addEventListener("click", choose);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          choose(event);
        }
      });
    });

    const pointText = optionTable
      .querySelector("td.point")
      ?.textContent?.trim();
    if (pointText) {
      const point = document.createElement("div");
      point.className = "ux-onebyone-choice-point";
      point.textContent = pointText;
      choiceList.appendChild(point);
    }

    optionTable.classList.add("ux-source-options-hidden");
    optionTable.parentNode.insertBefore(choiceList, optionTable);
  }

  const refreshChoiceState = () => {
    choiceRows.forEach((row) => {
      const radio = row.querySelector('input[type="radio"]');
      row.classList.toggle("is-selected", !!radio?.checked);
    });
    choiceCards.forEach(({ card, radio }) => {
      card.classList.toggle("is-selected", !!radio.checked);
    });
  };
  choiceCards.forEach(({ radio }) => {
    radio.addEventListener("change", refreshChoiceState);
  });

  choiceRows.forEach((row) => {
    if (row.dataset.uxChoiceReady === "true") return;
    row.dataset.uxChoiceReady = "true";
    row.classList.add("ux-choice-row");
    const radio = row.querySelector('input[type="radio"]');
    radio?.addEventListener("change", refreshChoiceState);
    row.addEventListener("click", (event) => {
      if (
        !radio ||
        event.target === radio ||
        event.target.closest(
          'a, button, input:not([type="radio"]), select, textarea',
        )
      ) {
        return;
      }
      radio.click();
    });
  });
  refreshChoiceState();

  const enhanceResultState = () => {
    if (choiceRows.length > 0 || form.querySelector(".ux-onebyone-result-list"))
      return;

    const normalizeText = (text) =>
      (text || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const resultHeading = Array.from(form.querySelectorAll("h1, h2, h3")).find(
      (heading) => /結果|正解|不正解/.test(normalizeText(heading.textContent)),
    );
    const resultTable = Array.from(form.querySelectorAll("table")).find(
      (table) => {
        if (
          table.querySelector(
            'input[type="radio"], button, input[type="button"], input[type="submit"]',
          )
        )
          return false;
        const numberedRows = Array.from(table.rows || []).filter((row) => {
          const pieces = Array.from(row.cells || [])
            .map((cell) => normalizeText(cell.textContent))
            .filter(Boolean);
          return (
            pieces.length >= 2 && pieces.some((piece) => /^\d+\.?$/.test(piece))
          );
        });
        return (
          numberedRows.length >= 2 &&
          (resultHeading || table.classList.contains("qstnoptions"))
        );
      },
    );

    if (!resultHeading && !resultTable) return;

    if (resultHeading) {
      const resultText = normalizeText(resultHeading.textContent);
      resultHeading.classList.add("ux-onebyone-result-title");
      resultHeading.classList.toggle(
        "is-correct",
        /○|正解/.test(resultText) && !/不正解/.test(resultText),
      );
      resultHeading.classList.toggle("is-wrong", /×|不正解/.test(resultText));
    }

    if (!resultTable) return;

    const resultList = document.createElement("div");
    resultList.className = "ux-onebyone-result-list";
    const rows = Array.from(resultTable.rows || []);

    rows.forEach((row) => {
      const pieces = Array.from(row.cells || [])
        .map((cell) => normalizeText(cell.textContent))
        .filter(Boolean);
      const numberIndex = pieces.findIndex((piece) => /^\d+\.?$/.test(piece));
      if (numberIndex === -1) return;

      const numberText = pieces[numberIndex].replace(/^(\d+)\.?$/, "$1.");
      const selected = pieces.some(
        (piece) => /^[*＊]+$/.test(piece) || /^[*＊]\s+/.test(piece),
      );
      const labelText = pieces
        .filter(
          (piece, index) => index !== numberIndex && !/^[*＊]+$/.test(piece),
        )
        .join(" ")
        .replace(/^[*＊]\s*/, "")
        .trim();
      if (!labelText) return;

      const card = document.createElement("div");
      card.className = "ux-onebyone-result-choice";
      card.classList.toggle("is-selected", selected);

      const number = document.createElement("span");
      number.className = "ux-onebyone-result-number";
      number.textContent = numberText;

      const marker = document.createElement("span");
      marker.className = "ux-onebyone-result-marker";
      marker.textContent = selected ? "✓" : "";

      const label = document.createElement("span");
      label.className = "ux-onebyone-result-label";
      label.textContent = labelText;

      card.appendChild(number);
      card.appendChild(marker);
      card.appendChild(label);
      resultList.appendChild(card);
    });

    if (resultList.children.length === 0) return;

    let insertionNode = resultTable;
    while (
      insertionNode.parentElement &&
      insertionNode.parentElement !== form
    ) {
      insertionNode = insertionNode.parentElement;
    }
    const insertionParent =
      insertionNode.parentElement === form ? form : resultTable.parentNode;
    const sourceRoot = insertionNode || resultTable;
    const scoreSources = Array.from(
      sourceRoot.querySelectorAll?.(".point") || [],
    );
    const scoreText = scoreSources
      .map((cell) => normalizeText(cell.textContent))
      .find(Boolean);
    if (scoreText && !resultList.querySelector(".ux-onebyone-result-score")) {
      const score = document.createElement("div");
      score.className = "ux-onebyone-result-score";
      score.textContent = scoreText;
      resultList.appendChild(score);
    }

    const answerLabelNodes = [];
    const labelWalker = document.createTreeWalker(form, NodeFilter.SHOW_TEXT);
    while (labelWalker.nextNode()) {
      if (normalizeText(labelWalker.currentNode.textContent) === "回答") {
        answerLabelNodes.push(labelWalker.currentNode);
      }
    }
    answerLabelNodes.forEach((node) => node.remove());

    const resultBlock = document.createElement("div");
    resultBlock.className = "ux-onebyone-result-block";
    const resultLabel = document.createElement("div");
    resultLabel.className = "ux-onebyone-answer-heading";
    resultLabel.textContent = "回答";
    resultBlock.appendChild(resultLabel);
    resultBlock.appendChild(resultList);

    resultTable.classList.add("ux-source-result-hidden");
    scoreSources.forEach((source) =>
      source.classList.add("ux-source-result-hidden"),
    );
    if (
      insertionNode !== resultTable &&
      !insertionNode.querySelector(
        'button, input[type="button"], input[type="submit"]',
      )
    ) {
      insertionNode.classList.add("ux-source-result-hidden");
    }
    insertionParent.insertBefore(resultBlock, insertionNode);
  };
  enhanceResultState();

  if (!form.querySelector(".ux-onebyone-answer-actions")) {
    const actionBar = document.createElement("div");
    actionBar.className = "ux-onebyone-answer-actions";
    const actionControls = Array.from(
      form.querySelectorAll(
        'button, input[type="button"], input[type="submit"]',
      ),
    );
    const findActionControl = (patterns, selectors = []) => {
      for (const selector of selectors) {
        const found = form.querySelector(selector);
        if (found) return found;
      }
      return actionControls.find((control) => {
        const text = (control.textContent || control.value || "")
          .replace(/\s+/g, " ")
          .trim();
        return patterns.some((pattern) => pattern.test(text));
      });
    };
    const backButton = findActionControl([/^戻る$/]);
    const nextButton = findActionControl([/^次のページ$/]);
    const checkButton = findActionControl(
      [/^解答チェック$/],
      ["#QstnChkBtn", 'button[name="check"], input[name="check"]'],
    );
    const gradeButton = findActionControl(
      [/^(終了|採点|提出|送信|完了)(する)?$/, /(終了|提出|採点)$/],
      ["#GradeBtn", 'button[name="grade"], input[name="grade"]'],
    );
    const navState = getShikenNavigationState(document);

    if (navState) {
      if (backButton)
        backButton.disabled = backButton.disabled || !navState.canPrev;
      if (nextButton)
        nextButton.disabled = nextButton.disabled || !navState.canNext;
    }
    if (gradeButton) gradeButton.classList.add("ux-danger");

    [backButton, nextButton, checkButton, gradeButton].forEach((button) => {
      if (!button || actionBar.contains(button)) return;
      actionBar.appendChild(button);
    });

    if (actionBar.children.length > 0) form.appendChild(actionBar);
  }
}

function enhanceOneByOneShikenDescriptionFrame() {
  ensureCourseColorTokens(document);
  enableUxAutoOverflowScrolling(document);
  syncCurrentFrameShikenLayoutClassFromParent();
  document.documentElement.classList.toggle(
    "ux-shiken-single-page-frame",
    isShikenSinglePageActive(),
  );
  bindSinglePageShikenChildBridge(document);
  if (document.getElementById("ux-onebyone-description-style")) return;

  const style = document.createElement("style");
  style.id = "ux-onebyone-description-style";
  style.textContent = `
        html, body {
            height: 100%;
            margin: 0;
            background: var(--ux-home-page-bg);
        }
        body {
            box-sizing: border-box;
            padding: 10px 18px 16px 10px;
            color: var(--ux-home-label);
            font-family: 'Noto Sans JP', 'Yu Gothic', 'Meiryo', 'Hiragino Sans', 'Segoe UI', sans-serif;
            font-size: 14px;
            line-height: 1.7;
            -webkit-font-smoothing: antialiased;
            overflow: auto;
        }
        .ux-onebyone-description-card {
            min-height: 100%;
            box-sizing: border-box;
            padding: 16px 18px;
            border: 1px solid var(--ux-home-separator);
            border-radius: 6px;
            background: var(--ux-home-surface);
            box-shadow: var(--ux-home-shadow-sm);
        }
        h1, h2, h3 {
            margin: 0 0 12px;
            padding: 0 0 10px;
            border-bottom: 1px solid var(--ux-home-separator);
            color: var(--ux-home-secondary-label);
            font-size: 13px;
            font-weight: 700;
            line-height: 1.35;
        }
        p,
        .ux-onebyone-description-card > div {
            max-width: 72em;
        }
        a {
            color: var(--ux-home-accent-emphasis);
            font-weight: 700;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        html.ux-shiken-single-page-frame,
        html.ux-shiken-single-page-frame body {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
        }
        html.ux-shiken-single-page-frame body {
            display: block !important;
            padding: 12px 14px 18px !important;
        }
        html.ux-shiken-single-page-frame .ux-onebyone-description-card {
            min-height: 0 !important;
            overflow: visible !important;
        }
    `;
  document.head.appendChild(style);
  wrapOneByOneBodyContent("ux-onebyone-description-card");
}

function enhanceShikenFrameset() {
  log("Enhancing shiken frameset");
  bindShikenLayoutMessageListener();

  const outerFrameset = document.querySelector("frameset[rows]");
  const innerCols =
    Array.from(document.querySelectorAll("frameset[cols]")).find((frameset) => {
      return !!getDirectChildFrame(frameset, "button");
    }) || document.querySelector("frameset[cols]");
  if (!outerFrameset || !innerCols) {
    log("Shiken frameset not found");
    document.__uxShikenFramesetRetryCount =
      (document.__uxShikenFramesetRetryCount || 0) + 1;
    if (document.__uxShikenFramesetRetryCount <= 20) {
      setTimeout(enhanceShikenFrameset, 150);
    }
    return;
  }
  document.__uxShikenFramesetRetryCount = 0;

  if (outerFrameset.getAttribute("data-ux-shiken") !== "true") {
    outerFrameset.setAttribute("data-ux-shiken", "true");
  }

  applyShikenLayoutMode(resolveInitialShikenLayoutMode(document), {
    rootDoc: document,
  });
}

function enhanceShikenQuestionFrame() {
  log("Enhancing shiken question frame");
  ensureCourseColorTokens(document);
  enableUxAutoOverflowScrolling(document);
  ensureUxFrameActionButtonFit(document);
  syncCurrentFrameShikenLayoutClassFromParent();
  document.documentElement.classList.toggle(
    "ux-shiken-single-page-frame",
    isShikenSinglePageActive(),
  );
  bindSinglePageShikenChildBridge(document);
  if (document.getElementById("ux-shiken-question-style")) return;

  const style = document.createElement("style");
  style.id = "ux-shiken-question-style";
  style.textContent = `
        html, body {
            height: 100%;
            margin: 0;
            background: var(--ux-home-page-bg);
        }
        body {
            box-sizing: border-box;
            display: flex;
            align-items: stretch;
            padding: 14px 18px 8px;
            color: var(--ux-home-label);
            font-family: 'Noto Sans JP', 'Yu Gothic', 'Meiryo', 'Hiragino Sans', 'Segoe UI', sans-serif;
            font-size: 15px;
            line-height: 1.7;
            -webkit-font-smoothing: antialiased;
            overflow: auto;
        }
        .ux-shiken-question-card {
            position: relative;
            inline-size: 100%;
            max-inline-size: 100%;
            flex: 1 1 auto;
            min-height: 0;
            max-height: 100%;
            margin: 0 !important;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            padding: 16px 20px;
            border: 1px solid var(--ux-home-separator);
            border-radius: 6px;
            background: var(--ux-home-surface);
            box-shadow: var(--ux-home-shadow-sm);
            min-width: 0;
            overflow: auto;
            overflow-wrap: anywhere;
            overscroll-behavior: contain;
            scrollbar-gutter: stable;
        }
        .ux-shiken-question-card::before {
            content: "問題";
            display: flex;
            position: sticky;
            top: -16px;
            z-index: 1;
            margin: -16px -20px 8px;
            padding: 16px 20px 4px;
            background: var(--ux-home-surface);
            color: var(--ux-home-secondary-label);
            font-size: 12px;
            font-weight: 700;
            line-height: 1.3;
        }
        .ux-shiken-question-card:focus-visible {
            outline: none;
            box-shadow: var(--ux-home-focus-ring), var(--ux-home-shadow-sm);
        }
        .ux-shiken-frame-resize-handle {
            position: absolute;
            right: 8px;
            bottom: 8px;
            z-index: 3;
            width: 12px;
            height: 12px;
            min-width: 12px;
            min-height: 12px;
            padding: 0;
            border: 0;
            border-radius: 3px;
            appearance: none;
            color: transparent;
            line-height: 0;
            flex: 0 0 12px;
            background:
                linear-gradient(135deg, transparent 0 58%, rgba(110, 110, 115, 0.48) 58% 66%, transparent 66%),
                linear-gradient(135deg, transparent 0 76%, rgba(110, 110, 115, 0.48) 76% 84%, transparent 84%);
            cursor: ns-resize;
            opacity: 0.46;
            box-shadow: none;
        }
        .ux-shiken-frame-resize-handle:hover,
        .ux-shiken-frame-resize-handle:focus-visible {
            opacity: 0.85;
            background-color: var(--ux-home-accent-softer);
            box-shadow: 0 0 0 2px var(--ux-home-accent-softer);
        }
        body.ux-shiken-parent-layout-vertical .ux-shiken-frame-resize-handle {
            display: none;
        }
        body.ux-shiken-frame-resizing,
        body.ux-shiken-frame-resizing * {
            cursor: ns-resize !important;
            user-select: none !important;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        td, th {
            padding: 0;
            vertical-align: top;
            overflow-wrap: anywhere;
        }
        img,
        video,
        iframe {
            max-width: 100%;
        }
        /* 単一ページモード: 枠を固定高さにせず、本文の高さに追従させる
           (内部スクロールを無くし、外側の .ux-shiken-scroll で一体スクロール) */
        html.ux-shiken-single-page-frame,
        html.ux-shiken-single-page-frame body {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
        }
        html.ux-shiken-single-page-frame body {
            display: block !important;
            padding: 12px 16px 14px !important;
        }
        html.ux-shiken-single-page-frame .ux-shiken-question-card {
            flex: none !important;
            max-height: none !important;
            min-height: 0 !important;
            overflow: visible !important;
        }
    `;
  document.head.appendChild(style);
  const questionCard = wrapOneByOneBodyContent("ux-shiken-question-card");
  if (questionCard) {
    questionCard.tabIndex = 0;
    questionCard.setAttribute("role", "region");
    questionCard.setAttribute("aria-label", "問題文");
    attachShikenFrameResizeHandle(questionCard, {
      frameName: "question",
      label: "問題フィールド",
    });
  }
}

function tryInjectShikenHeader() {
  let attempts = 0;
  const maxAttempts = 12;

  const inject = () => {
    attempts += 1;
    try {
      const titleFrame =
        window.top.frames && window.top.frames["webclass_title"];
      if (!titleFrame || !titleFrame.document || !titleFrame.document.body) {
        throw new Error("title frame not ready");
      }

      if (titleFrame.document.getElementById("ux-shiken-header")) {
        return;
      }

      const titles = getShikenTitlesFromFrames();
      renderShikenHeader(titleFrame.document, titles);
      log("Injected shiken header");
      return;
    } catch (e) {
      if (attempts < maxAttempts) {
        setTimeout(inject, 250);
      } else {
        log("Failed to inject shiken header:", e?.message || e);
      }
    }
  };

  inject();
}

function getShikenTitlesFromFrames() {
  let courseName = "";
  let contentName = "";

  try {
    const buttonFrame = window.top.frames && window.top.frames["button"];
    if (buttonFrame && buttonFrame.document) {
      const h1 = buttonFrame.document.querySelector("#WsTitle h1");
      const h2 = buttonFrame.document.querySelector("#WsTitle h2");
      if (h1) courseName = h1.textContent.trim().replace(/^>\s*/, "");
      if (h2) contentName = h2.textContent.trim();
    }
  } catch (e) {
    // ignore cross-frame timing issues
  }

  if (!courseName)
    courseName = document.title.replace(/\s*-\s*WebClass.*/i, "").trim();
  if (!contentName) contentName = "試験";

  return { courseName, contentName };
}

function renderShikenHeader(doc, titles) {
  const { courseName, contentName } = titles;
  ensureCourseColorTokens(doc);

  rememberUxOriginalBodyState(doc);
  doc.body.innerHTML = "";
  doc.body.style.margin = "0";
  doc.body.style.padding = "0";
  doc.body.style.background = "var(--ux-home-page-bg)";
  doc.body.style.overflow = "hidden";
  doc.body.style.fontFamily = `'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif`;

  const header = doc.createElement("div");
  header.id = "ux-shiken-header";
  header.style.cssText = `
        height: 56px;
        background: var(--ux-home-surface);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 18px;
        border-bottom: 1px solid var(--ux-home-separator);
        box-shadow: var(--ux-home-shadow-sm);
        box-sizing: border-box;
    `;

  const titleBlock = doc.createElement("div");
  titleBlock.style.cssText = "display:flex; flex-direction:column; gap:2px;";
  titleBlock.innerHTML = `
        <div style="font-size:12px;color:var(--ux-home-secondary-label); line-height:1;">${escapeHtml(courseName)}</div>
        <div style="font-size:15px;font-weight:600;color:var(--ux-home-label); line-height:1.2;">${escapeHtml(contentName)}</div>
    `;

  const badge = doc.createElement("div");
  badge.textContent = "試験";
  badge.style.cssText = `
        font-size: 11px;
        color: var(--ux-home-accent-emphasis);
        background: var(--ux-home-accent-soft);
        padding: 4px 10px;
        border-radius: 999px;
        letter-spacing: 0.06em;
        font-weight: 600;
    `;

  header.appendChild(titleBlock);
  header.appendChild(badge);
  doc.body.appendChild(header);
}

// 左ボタンフレームから回答フレームのネイティブ保存を呼ぶ（単一ページモードで
// 「回答を保存」を常時表示にするため）
function triggerShikenAnswerSaveFromButtonFrame() {
  try {
    const answerDoc = window.top?.frames?.answer?.document;
    if (!answerDoc) return false;
    const saveBtn =
      answerDoc.querySelector(".ux-save-answer-button") ||
      Array.from(
        answerDoc.querySelectorAll(
          'button, input[type="button"], input[type="submit"]',
        ),
      ).find((el) => `${el.value || el.textContent || ""}`.includes("回答を保存"));
    if (saveBtn) {
      saveBtn.click();
      return true;
    }
    // フォールバック: answer_form を sendCmd=save で送信
    const form = answerDoc.querySelector('form[name="answer_form"]');
    if (form) {
      const sendCmd = form.querySelector('input[name="sendCmd"]');
      if (sendCmd) sendCmd.value = "save";
      form.submit();
      return true;
    }
  } catch {}
  return false;
}

function ensureShikenButtonFrameSaveProxy(doc = document) {
  if (!isShikenSinglePageActive()) return;
  const form = doc.querySelector('form[name="button_form"]');
  if (!form || form.querySelector(".ux-shiken-button-save")) return;

  const row = doc.createElement("div");
  row.className = "ux-shiken-action-row ux-shiken-save-row";
  const saveButton = doc.createElement("button");
  saveButton.type = "button";
  saveButton.className = "ux-btn ux-shiken-button-save";
  saveButton.textContent = "回答を保存";
  saveButton.addEventListener("click", (event) => {
    event.preventDefault();
    triggerShikenAnswerSaveFromButtonFrame();
  });
  row.appendChild(saveButton);
  // 前/次/終了 の上に配置（常時表示の保存ボタン）
  form.insertBefore(row, form.firstChild);
}

function enhanceShikenButtonFrame() {
  log("Enhancing shiken button frame");
  ensureCourseColorTokens(document);
  enableUxAutoOverflowScrolling(document);
  ensureUxFrameActionButtonFit(document);
  syncCurrentFrameShikenLayoutClassFromParent();
  const singlePageActive = isShikenSinglePageActive();
  document.documentElement.classList.toggle(
    "ux-shiken-single-page-frame",
    singlePageActive,
  );
  bindSinglePageShikenChildBridge(document);

  if (isOneByOneQuestionListFrame()) {
    enhanceOneByOneQuestionListFrame();
    return;
  }

  if (document.getElementById("ux-shiken-button-style")) {
    ensureShikenLayoutToggleControl();
    ensureShikenButtonFrameSaveProxy();
    bindShikenButtonTocCompaction();
    return;
  }

  const style = document.createElement("style");
  style.id = "ux-shiken-button-style";
  style.textContent = `
        html, body {
            height: 100%;
            margin: 0;
            background: var(--ux-home-page-bg);
        }
        body {
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            padding: 8px;
            background: var(--ux-home-page-bg);
            font-family: 'Noto Sans JP', 'Yu Gothic', 'Meiryo', 'Hiragino Sans', 'Segoe UI', sans-serif;
            color: var(--ux-home-label);
            -webkit-font-smoothing: antialiased;
            overflow-y: auto;
            overflow-x: hidden;
        }
        #top {
            flex: 1 1 auto;
            min-height: 0 !important;
            height: 100%;
            display: flex;
            flex-direction: column;
            gap: 6px;
            background: transparent;
            border: 0;
            box-shadow: none;
            padding: 0;
            box-sizing: border-box;
            overflow-y: auto;
            overflow-x: hidden;
        }
        #WsTitle {
            background: transparent !important;
            padding: 0 0 6px !important;
            margin: 0;
            border-bottom: 1px solid var(--ux-home-separator);
            max-width: 100%;
        }
        #WsTitle h1,
        #WsTitle h2 {
            margin: 0;
            padding: 0;
            word-break: break-word;
            overflow-wrap: anywhere;
            letter-spacing: 0;
        }
        #WsTitle h1 {
            display: block !important;
            font-size: 11px;
            font-weight: 500;
            color: var(--ux-home-secondary-label) !important;
            line-height: 1.35;
        }
        #WsTitle h1 *,
        #WsTitle h2 * {
            color: inherit !important;
        }
        #WsTitle h2 {
            margin-top: 3px;
            font-size: 15px;
            font-weight: 700;
            color: var(--ux-home-label) !important;
            line-height: 1.3;
        }
        #User,
        .User,
        div[id*="User"] {
            margin: 0;
            color: var(--ux-home-secondary-label);
            font-size: 12px;
            line-height: 1.4;
            text-align: right;
        }
        #top hr {
            display: none;
        }
        form[name="button_form"] {
            order: 5;
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin: 0;
            min-width: 0;
            width: 100%;
            box-sizing: border-box;
        }
        .ux-shiken-nav-row {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 6px;
            align-items: center;
            justify-content: stretch;
            min-width: 0;
            width: 100%;
            box-sizing: border-box;
        }
        .ux-shiken-action-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            justify-content: stretch;
            gap: 6px;
            min-width: 0;
            width: 100%;
            box-sizing: border-box;
        }
        .ux-shiken-inline-toc {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 6px;
            min-height: 34px;
            padding: 8px 10px;
            box-sizing: border-box;
            background: var(--ux-home-surface);
            border-radius: 6px;
            box-shadow: var(--ux-home-shadow-sm);
            margin: 0;
            max-height: 220px;
            overflow-y: auto;
            overflow-x: hidden;
        }
        .ux-shiken-inline-toc::before {
            display: none;
        }
        .ux-shiken-inline-page {
            -webkit-appearance: none;
            appearance: none;
            width: 32px;
            min-width: 32px;
            height: 28px;
            min-height: 28px;
            box-sizing: border-box;
            padding: 0;
            border: 1px solid var(--ux-home-separator);
            border-radius: 6px;
            background: var(--ux-home-surface-soft);
            color: var(--ux-home-accent-emphasis);
            font-size: 12px;
            font-weight: 700;
            font-family: inherit;
            line-height: 26px;
            text-align: center;
            cursor: pointer;
            box-shadow: var(--ux-home-shadow-sm);
        }
        .ux-shiken-inline-page.is-active {
            background: var(--ux-home-warning-soft);
            border-color: rgba(255, 159, 10, 0.32);
            color: var(--ux-home-warning-foreground);
        }
        .ux-btn {
            background: var(--ux-home-surface);
            border: 1px solid var(--ux-home-separator);
            color: var(--ux-home-label);
            border-radius: 6px;
            padding: 0 10px;
            font-size: 12px;
            font-weight: 700;
            font-family: inherit;
            cursor: pointer;
            transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
            min-width: 0;
            min-height: 34px;
            flex: 1 1 0;
            box-shadow: var(--ux-home-shadow-sm);
            box-sizing: border-box;
            line-height: 1.25;
            white-space: normal;
            overflow-wrap: anywhere;
            width: 100%;
            justify-self: stretch;
        }
        .ux-btn:hover {
            background: var(--ux-home-accent-softer);
            border-color: var(--ux-home-accent);
            color: var(--ux-home-accent-emphasis);
        }
        .ux-btn:focus-visible {
            outline: none;
            border-color: var(--ux-home-accent);
            box-shadow: var(--ux-home-focus-ring);
        }
        .ux-btn.ux-danger {
            background: var(--ux-home-danger);
            border-color: var(--ux-home-danger);
            color: var(--ux-home-surface);
        }
        .ux-btn.ux-danger:hover {
            background: var(--ux-home-danger-foreground);
            border-color: var(--ux-home-danger-foreground);
        }
        .ux-btn:disabled {
            background: var(--ux-home-fill);
            border-color: var(--ux-home-separator);
            color: var(--ux-home-tertiary-label);
            cursor: not-allowed;
        }
        .ux-btn.ux-shiken-button-save {
            background: var(--ux-home-accent);
            border-color: var(--ux-home-accent);
            color: #fff;
        }
        .ux-btn.ux-shiken-button-save:hover {
            background: var(--ux-home-accent-emphasis, var(--ux-home-accent));
            border-color: var(--ux-home-accent-emphasis, var(--ux-home-accent));
            color: #fff;
        }
        .limitInfo {
            margin: 0 !important;
            min-height: 32px;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 5px 10px !important;
            background: var(--ux-home-surface);
            border: 1px solid var(--ux-home-separator);
            border-radius: 6px;
            font-size: 12px;
            line-height: 1.35;
            color: var(--ux-home-secondary-label);
            text-align: center;
            box-shadow: var(--ux-home-shadow-sm);
        }
        #top > .limitInfo,
        #top > form[name="button_form"] {
            width: 100% !important;
            max-width: 100% !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
        }
        #top > form[name="button_form"] {
            width: 100% !important;
            max-width: 100% !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            padding-left: 3px !important;
            padding-right: 0 !important;
            box-sizing: border-box !important;
        }
        #TOC {
            order: 6;
            flex: 0 0 auto !important;
            display: block;
            min-height: 0 !important;
            height: auto !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
        }
        #TOCContent {
            display: block !important;
            width: 100% !important;
            height: clamp(5.75rem, 14vh, 7.75rem) !important;
            border: none;
            background: var(--ux-home-surface);
            border-radius: 6px;
            box-shadow: var(--ux-home-shadow-sm);
        }
        .ux-shiken-layout-toggle {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 34px 34px 34px;
            align-items: center;
            gap: 4px;
            min-height: 34px;
            padding: 3px;
            border: 1px solid var(--ux-home-separator);
            border-radius: 6px;
            background: var(--ux-home-surface);
            box-shadow: var(--ux-home-shadow-sm);
            box-sizing: border-box;
        }
        .ux-shiken-layout-toggle-label {
            min-width: 0;
            padding: 0 6px;
            color: var(--ux-home-secondary-label);
            font-size: 12px;
            font-weight: 700;
            line-height: 1.2;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .ux-shiken-layout-toggle button {
            min-width: 0;
            width: 100%;
            min-height: 28px;
            padding: 0;
            border: 1px solid transparent;
            border-radius: 5px;
            background: transparent;
            color: var(--ux-home-secondary-label);
            font-size: 12px;
            font-weight: 800;
            font-family: inherit;
            line-height: 1;
            cursor: pointer;
            box-shadow: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        .ux-shiken-layout-toggle button svg {
            width: 17px;
            height: 17px;
            pointer-events: none;
        }
        .ux-shiken-layout-toggle button:hover {
            background: var(--ux-home-accent-softer);
            color: var(--ux-home-accent-emphasis);
        }
        .ux-shiken-layout-toggle button.is-active {
            border-color: var(--ux-home-accent);
            background: var(--ux-home-accent-soft);
            color: var(--ux-home-accent-emphasis);
        }
        html.ux-shiken-single-page-frame,
        html.ux-shiken-single-page-frame body {
            height: 100vh !important;
            min-height: 100vh !important;
            max-height: 100vh !important;
            overflow: hidden !important;
            overscroll-behavior: none !important;
        }
        html.ux-shiken-single-page-frame body {
            padding: 8px !important;
        }
        html.ux-shiken-single-page-frame #top {
            height: 100% !important;
            min-height: 0 !important;
            overflow: hidden !important;
            padding-top: 0 !important;
        }
        html.ux-shiken-single-page-frame #WsTitle {
            order: -20 !important;
        }
        html.ux-shiken-single-page-frame #ux-shiken-layout-toggle {
            order: -19 !important;
        }
        html.ux-shiken-single-page-frame .limitInfo {
            order: -18 !important;
        }
        html.ux-shiken-single-page-frame #top > form[name="button_form"] {
            position: static !important;
            order: -30 !important;
            flex: 0 0 auto !important;
            margin: 0 !important;
            padding-top: 0 !important;
            padding-bottom: 0 !important;
            background: var(--ux-home-page-bg);
        }
        html.ux-shiken-single-page-frame #ux-shiken-inline-toc {
            order: 20 !important;
            flex: 1 1 auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
        }
    `;
  document.head.appendChild(style);

  const existingHeading = document.getElementById("ux-toc-heading");
  if (existingHeading) {
    existingHeading.remove();
  }

  const top = document.getElementById("top");
  const limitInfo = document.querySelector(".limitInfo");
  const toc = document.getElementById("TOC");
  const form = document.querySelector('form[name="button_form"]');

  if (top) {
    top.querySelectorAll("hr, br").forEach((node) => node.remove());
    Array.from(top.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === "") {
        node.remove();
      }
    });
  }

  if (
    top &&
    limitInfo &&
    toc &&
    limitInfo.parentElement === top &&
    toc.previousElementSibling !== limitInfo
  ) {
    top.insertBefore(toc, limitInfo.nextSibling);
  } else if (
    top &&
    toc &&
    form &&
    toc.parentElement === top &&
    form.parentElement === top &&
    toc.nextElementSibling !== form
  ) {
    top.insertBefore(toc, form);
  }

  ensureShikenLayoutToggleControl();
  bindShikenButtonTocCompaction();

  // Style the TOC iframe (question list) if accessible.
  const tocIframe = document.getElementById("TOCContent");
  const injectTocStyle = () => {
    try {
      const tocDoc =
        tocIframe &&
        (tocIframe.contentDocument || tocIframe.contentWindow?.document);
      if (!tocDoc || tocDoc.getElementById("ux-shiken-toc-style")) return;
      ensureCourseColorTokens(tocDoc);
      const tocStyle = tocDoc.createElement("style");
      tocStyle.id = "ux-shiken-toc-style";
      tocStyle.textContent = `
                html, body { margin: 0; padding: 4px; background: var(--ux-home-surface); font-family: 'Noto Sans JP', 'Yu Gothic', 'Meiryo', 'Hiragino Sans', 'Segoe UI', sans-serif; color: var(--ux-home-label); box-sizing: border-box; }
                table { width: 100%; border-collapse: collapse; }
                td { padding: 4px 6px; font-size: 12px; }
                .red_moji { display: none !important; }
                td.ux-toc-item { position: relative; padding-left: 18px; display: flex; align-items: center; gap: 6px; }
                td.ux-toc-item::before {
                    content: '';
                    position: absolute;
                    left: 7px;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: var(--ux-home-tertiary-label);
                    box-shadow: 0 0 0 2px var(--ux-home-fill);
                }
                .ux-toc-star {
                    margin-left: 6px;
                    color: var(--ux-home-tertiary-label);
                    font-weight: 600;
                    font-size: 11px;
                    line-height: 1;
                }
                tr.bkkhaki td,
                td.bkkhaki {
                    background: transparent;
                    box-shadow: none;
                }
                tr.bkkhaki td.ux-toc-item::before,
                td.bkkhaki.ux-toc-item::before {
                    background: var(--ux-home-accent);
                    box-shadow: 0 0 0 2px var(--ux-home-accent-soft);
                }
                input[type="button"],
                button {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 32px;
                    min-width: 32px;
                    max-width: 32px;
                    height: 28px;
                    min-height: 28px;
                    box-sizing: border-box;
                    background: var(--ux-home-surface-soft);
                    border: 1px solid var(--ux-home-separator);
                    border-radius: 6px;
                    padding: 0;
                    font-size: 12px;
                    font-weight: 700;
                    font-family: inherit;
                    line-height: 26px;
                    text-align: center;
                    cursor: pointer;
                    color: var(--ux-home-accent-emphasis);
                    box-shadow: var(--ux-home-shadow-sm);
                }
                input[type="button"]:hover,
                button:hover {
                    border-color: var(--ux-home-accent);
                    background: var(--ux-home-accent-softer);
                }
                input[type="button"]:focus-visible,
                button:focus-visible {
                    outline: none;
                    border-color: var(--ux-home-accent);
                    box-shadow: var(--ux-home-focus-ring);
                }
                tr.bkkhaki input[type="button"],
                tr.bkkhaki button,
                td.bkkhaki input[type="button"],
                td.bkkhaki button {
                    background: var(--ux-home-warning-soft);
                    border-color: rgba(255, 159, 10, 0.32);
                    color: var(--ux-home-warning-foreground);
                }
            `;
      tocDoc.head.appendChild(tocStyle);

      const tocCells = tocDoc.querySelectorAll("td");
      tocCells.forEach((cell) => {
        const button = cell.querySelector(
          'input[name="page_num"], button[name="page_num"], input[type="button"], button',
        );
        if (!button) return;
        if (cell.classList.contains("ux-toc-item")) return; // Already processed
        cell.classList.add("ux-toc-item");

        // Detect if star should be shown (before clearing the cell)
        const shouldAddStar = cell.textContent.includes("*");

        // Clear the cell completely and rebuild with clean structure
        // This ensures no stray text nodes remain
        while (cell.firstChild) {
          if (cell.firstChild === button) {
            // Keep button reference, just remove from DOM temporarily
            cell.removeChild(button);
          } else {
            cell.removeChild(cell.firstChild);
          }
        }

        // Rebuild: number button + star (if needed)
        const buttonLabel = (button.value || button.textContent || "").trim();
        button.title = `問${buttonLabel}`;
        button.setAttribute("aria-label", button.title);
        cell.appendChild(button);

        if (shouldAddStar) {
          const star = tocDoc.createElement("span");
          star.className = "ux-toc-star";
          star.textContent = "*";
          cell.appendChild(star);
        }
      });
    } catch (e) {
      log("Could not style TOC iframe:", e?.message || e);
    }
  };

  if (tocIframe) {
    tocIframe.addEventListener("load", injectTocStyle);
    tocIframe.addEventListener("load", compactShikenButtonTocLayout);
    if (
      tocIframe.contentDocument &&
      tocIframe.contentDocument.readyState !== "loading"
    ) {
      injectTocStyle();
    }
  }

  if (form && !form.dataset.uxRebuilt) {
    form.dataset.uxRebuilt = "true";
    const originalPrevBtn = form.querySelector(
      'button[name="pre"], input[name="pre"]',
    );
    const originalNextBtn = form.querySelector(
      'button[name="next"], input[name="next"]',
    );
    const originalFinishBtn = form.querySelector(
      'button[name="grade"], input[name="grade"], button[onclick*="gradeAndClose"], input[onclick*="gradeAndClose"]',
    );
    const hasPrev = !!originalPrevBtn;
    const hasNext = !!originalNextBtn;
    const hasFinish = !!originalFinishBtn;
    const navState = getShikenNavigationState(document);

    const hiddenInputs = Array.from(
      form.querySelectorAll('input[type="hidden"]'),
    );

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "ux-btn";
    prevBtn.textContent = "前のページ";
    prevBtn.disabled =
      !hasPrev ||
      isUxControlDisabled(originalPrevBtn) ||
      (navState ? !navState.canPrev : false);
    prevBtn.addEventListener("click", () => {
      if (originalPrevBtn) {
        originalPrevBtn.click();
      } else if (typeof window.prevPage === "function") {
        window.prevPage();
      }
    });

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "ux-btn";
    nextBtn.textContent = "次のページ";
    nextBtn.disabled =
      !hasNext ||
      isUxControlDisabled(originalNextBtn) ||
      (navState ? !navState.canNext : false);
    nextBtn.addEventListener("click", () => {
      if (originalNextBtn) {
        originalNextBtn.click();
      } else if (typeof window.nextPage === "function") {
        window.nextPage();
      }
    });

    const finishBtn = document.createElement("button");
    finishBtn.type = "button";
    finishBtn.className = "ux-btn ux-danger";
    finishBtn.textContent = "終了";
    finishBtn.disabled = !hasFinish || isUxControlDisabled(originalFinishBtn);
    finishBtn.addEventListener("click", () => {
      if (originalFinishBtn) {
        originalFinishBtn.click();
      } else if (typeof window.gradeAndClose === "function") {
        window.gradeAndClose();
      }
    });

    const navRow = document.createElement("div");
    navRow.className = "ux-shiken-nav-row";
    navRow.appendChild(prevBtn);
    navRow.appendChild(nextBtn);

    const actionRow = document.createElement("div");
    actionRow.className = "ux-shiken-action-row";
    actionRow.appendChild(finishBtn);

    form.innerHTML = "";
    hiddenInputs.forEach((input) => form.appendChild(input));
    // 元のボタンを非表示でフォームに追加（クリック可能にするため）
    if (originalPrevBtn) {
      originalPrevBtn.style.display = "none";
      form.appendChild(originalPrevBtn);
    }
    if (originalNextBtn) {
      originalNextBtn.style.display = "none";
      form.appendChild(originalNextBtn);
    }
    if (originalFinishBtn) {
      originalFinishBtn.style.display = "none";
      form.appendChild(originalFinishBtn);
    }
    form.appendChild(navRow);
    form.appendChild(actionRow);

    if (
      top &&
      toc &&
      toc.parentElement === top &&
      form.parentElement === top &&
      toc.nextElementSibling !== form
    ) {
      top.insertBefore(toc, form);
    }
    compactShikenButtonTocLayout();
  }

  ensureShikenButtonFrameSaveProxy();
}

function getShikenAnswerSaveSessionKey() {
  const readSearchParam = (href, key) => {
    try {
      return new URL(href, window.location.href).searchParams.get(key) || "";
    } catch {
      return "";
    }
  };

  const ownUrl = window.location.href;
  let setContentsId = readSearchParam(ownUrl, "set_contents_id");
  let page = "";

  try {
    const buttonHref = window.parent?.frames?.button?.location?.href || "";
    setContentsId =
      setContentsId || readSearchParam(buttonHref, "set_contents_id");
    page = readSearchParam(buttonHref, "page");
  } catch {
    // Cross-frame access can fail while frames are still loading.
  }

  try {
    setContentsId =
      setContentsId ||
      readSearchParam(window.top?.location?.href || "", "set_contents_id");
  } catch {
    // ignore
  }

  return `ux-shiken-answer-save:${setContentsId || "unknown"}:${page || "unknown"}`;
}

function markShikenAnswerSavePending() {
  try {
    sessionStorage.setItem(getShikenAnswerSaveSessionKey(), String(Date.now()));
  } catch {
    // ignore
  }
}

function consumeShikenAnswerSavePending() {
  try {
    const key = getShikenAnswerSaveSessionKey();
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;

    sessionStorage.removeItem(key);
    const savedAt = Number(raw);
    return Number.isFinite(savedAt) && Date.now() - savedAt < 120000
      ? savedAt
      : null;
  } catch {
    return null;
  }
}

function formatShikenAnswerSaveTime(timestamp = Date.now()) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleTimeString();
  }
}

function createShikenAnswerSaveCheck(doc = document) {
  const check = doc.createElement("span");
  check.className = "ux-answer-save-check";
  check.setAttribute("aria-hidden", "true");

  const mark = doc.createElement("span");
  mark.textContent = "✓";
  check.appendChild(mark);

  return check;
}

function bindSinglePageAnswerTextareaAutoSize(form) {
  if (!form || !isShikenSinglePageActive()) return;
  form.querySelectorAll("textarea").forEach((textarea) => {
    if (textarea.dataset.uxSinglePageAutoSizeBound === "true") return;
    textarea.dataset.uxSinglePageAutoSizeBound = "true";

    const resize = () => {
      textarea.style.height = "auto";
      const minHeight = 192;
      const nextHeight = Math.max(minHeight, textarea.scrollHeight + 2);
      textarea.style.height = `${nextHeight}px`;
    };

    textarea.addEventListener("input", resize);
    textarea.addEventListener("change", resize);
    [0, 120, 350].forEach((delay) => setTimeout(resize, delay));
  });
}

function enhanceShikenAnswerFrame() {
  log("Enhancing shiken answer frame");
  ensureCourseColorTokens(document);
  enableUxAutoOverflowScrolling(document);
  ensureUxFrameActionButtonFit(document);
  syncCurrentFrameShikenLayoutClassFromParent();
  document.documentElement.classList.toggle(
    "ux-shiken-single-page-frame",
    isShikenSinglePageActive(),
  );
  bindSinglePageShikenChildBridge(document);
  if (document.getElementById("ux-shiken-answer-style")) return;

  const style = document.createElement("style");
  style.id = "ux-shiken-answer-style";
  style.textContent = `
        html, body {
            height: 100%;
            margin: 0;
            background: var(--ux-home-page-bg);
        }
        body {
            background: var(--ux-home-page-bg);
            font-family: 'Noto Sans JP', 'Yu Gothic', 'Meiryo', 'Hiragino Sans', 'Segoe UI', sans-serif;
            color: var(--ux-home-label);
            padding: 10px 18px 16px;
            box-sizing: border-box;
            display: flex;
            align-items: stretch;
            flex-direction: column;
            -webkit-font-smoothing: antialiased;
            overflow: auto;
            overflow-x: auto;
        }
        body.ux-shiken-answer-card-page,
        body.ux-shiken-upload-answer-page {
            overflow: auto;
            overflow-x: auto;
            padding: 14px 6px 8px;
        }
        form[name="answer_form"] {
            width: auto !important;
            inline-size: 100% !important;
            max-inline-size: 100% !important;
            max-width: none !important;
            background: transparent;
            border: 0;
            border-radius: 0;
            padding: 0;
            box-shadow: none;
            flex: 1 1 auto;
            min-height: calc(100vh - 26px);
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            align-self: stretch;
            gap: 10px;
            min-width: 0;
            margin: 0;
            float: none !important;
            overflow-x: auto;
            overscroll-behavior: contain;
        }
        body.ux-shiken-answer-card-page form[name="answer_form"],
        body.ux-shiken-upload-answer-page form[name="answer_form"] {
            min-height: 100%;
            height: auto;
        }
        .ux-shiken-answer-heading {
            margin: 0;
            color: var(--ux-home-secondary-label);
            font-size: 12px;
            font-weight: 700;
            line-height: 1.3;
        }
        .ux-shiken-answer-card,
        .ux-shiken-upload-answer-card {
            position: relative;
            inline-size: 100%;
            max-inline-size: 100%;
            flex: 1 1 auto;
            min-height: 0;
            max-height: none;
            box-sizing: border-box;
            padding: 16px 20px;
            border: 1px solid var(--ux-home-separator);
            border-radius: 6px;
            background: var(--ux-home-surface);
            box-shadow: var(--ux-home-shadow-sm);
            overflow: auto;
            overflow-wrap: anywhere;
            overscroll-behavior: contain;
            scrollbar-gutter: stable;
        }
        .ux-shiken-frame-resize-handle {
            position: absolute;
            right: 8px;
            bottom: 8px;
            z-index: 3;
            width: 12px;
            height: 12px;
            min-width: 12px;
            min-height: 12px;
            padding: 0;
            border: 0;
            border-radius: 3px;
            appearance: none;
            color: transparent;
            line-height: 0;
            flex: 0 0 12px;
            background:
                linear-gradient(135deg, transparent 0 58%, rgba(110, 110, 115, 0.48) 58% 66%, transparent 66%),
                linear-gradient(135deg, transparent 0 76%, rgba(110, 110, 115, 0.48) 76% 84%, transparent 84%);
            cursor: ns-resize;
            opacity: 0.46;
            box-shadow: none;
        }
        .ux-shiken-frame-resize-handle:hover,
        .ux-shiken-frame-resize-handle:focus-visible {
            opacity: 0.85;
            background-color: var(--ux-home-accent-softer);
            box-shadow: 0 0 0 2px var(--ux-home-accent-softer);
        }
        body.ux-shiken-parent-layout-vertical .ux-shiken-frame-resize-handle {
            display: none;
        }
        body.ux-shiken-frame-resizing,
        body.ux-shiken-frame-resizing * {
            cursor: ns-resize !important;
            user-select: none !important;
        }
        .ux-shiken-answer-card > .ux-shiken-answer-heading:first-child,
        .ux-shiken-upload-answer-card > .ux-shiken-answer-heading:first-child {
            position: sticky;
            top: -16px;
            z-index: 1;
            display: flex;
            margin: -16px -20px 10px;
            padding: 16px 20px 4px;
            background: var(--ux-home-surface);
        }
        .ux-shiken-answer-meta,
        form[name="answer_form"] > table,
        form[name="answer_form"] > div:not(.ux-answer-nav):not(.ux-answer-actions):not(.ux-shiken-answer-heading):not(.ux-shiken-answer-card):not(.ux-shiken-upload-answer-card),
        .ux-shiken-answer-card > table,
        .ux-shiken-answer-card > div,
        .ux-shiken-upload-answer-card > table,
        .ux-shiken-upload-answer-card > div {
            max-width: 100%;
        }
        dl.question,
        .section,
        .answer-form-container,
        .answer-form,
        fieldset {
            max-width: 100%;
            min-width: 0;
            box-sizing: border-box;
        }
        dl.question dd,
        .option-labels,
        label,
        td,
        th {
            overflow-wrap: anywhere;
            word-break: normal;
        }
        table {
            max-width: 100%;
        }
        table.qstnoptions {
            width: 100% !important;
            display: block;
            flex: 1 1 auto;
            table-layout: fixed;
            overflow-x: auto;
        }
        table.qstnoptions tbody,
        table.qstnoptions tr {
            width: 100% !important;
            display: block;
        }
        #QstnOperation { display: none !important; }
        .ux-answer-nav {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
            justify-content: stretch;
            gap: 10px;
            min-width: 0;
        }
        .ux-answer-nav .ux-btn {
            min-width: 0;
            width: 100%;
        }
        .ux-answer-actions {
            margin-top: auto;
            display: grid;
            grid-template-columns: minmax(0, 2fr) minmax(8rem, 0.8fr);
            align-items: stretch;
            gap: 10px;
            padding-top: 8px;
            min-width: 0;
            width: 100%;
            box-sizing: border-box;
        }
        .ux-answer-primary-actions {
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            min-width: 0;
        }
        .ux-answer-actions > .ux-answer-primary-actions:only-child,
        .ux-answer-actions > .ux-answer-nav:only-child {
            grid-column: 1 / -1;
        }
        .ux-answer-primary-actions .ux-btn {
            width: 100%;
        }
        .ux-source-action-hidden {
            display: none !important;
        }
        table.qstnoptions, table#QstnOperation {
            width: 100%;
            border-collapse: collapse;
        }
        table.qstnoptions th, table.qstnoptions td {
            padding: 6px 8px;
            vertical-align: top;
        }
        table.qstnoptions th {
            width: 36px;
            text-align: center;
            vertical-align: top;
            font-weight: 600;
            color: var(--ux-home-secondary-label);
        }
        table.qstnoptions td {
            vertical-align: top;
            min-width: 0;
        }
        table.qstnoptions tr:has(textarea) {
            display: grid !important;
            width: 100% !important;
            grid-template-columns: minmax(0, 1fr);
            align-items: start;
            gap: 10px;
        }
        table.qstnoptions tr:has(textarea) > th,
        table.qstnoptions tr:has(textarea) > td {
            display: block;
            padding: 0;
            min-width: 0;
        }
        table.qstnoptions tr:has(textarea) > td:not(:has(textarea)) {
            max-width: none;
        }
        table.selcomplex th,
        table.selcomplex td {
            padding: 6px 6px;
            vertical-align: top;
        }
        table.seloptions,
        table.selcomplex,
        table[id^="id_QuestionAnswer"] {
            width: 100% !important;
            max-width: 100%;
            table-layout: auto;
        }
        table[id^="id_QuestionAnswer"] {
            min-width: min(350px, 100%) !important;
        }
        textarea {
            width: 100% !important;
            max-width: 100%;
            min-width: 0;
            min-height: clamp(28rem, 64vh, 44rem);
            height: clamp(28rem, 64vh, 44rem);
            box-sizing: border-box;
            display: block;
            resize: vertical;
            line-height: 1.55;
            tab-size: 4;
        }
        .ux-save-answer-button {
            align-self: flex-end;
            min-width: 104px;
        }
        .ux-save-answer-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
        }
        .ux-answer-save-status {
            min-height: 24px;
            display: inline-flex;
            align-items: center;
            justify-self: end;
            gap: 6px;
            color: var(--ux-home-success-foreground);
            font-size: 12px;
            font-weight: 700;
            line-height: 1.2;
            opacity: 0;
            transform: translateY(2px);
            transition: opacity 0.16s ease, transform 0.16s ease;
            pointer-events: none;
        }
        .ux-answer-save-status.is-visible {
            opacity: 1;
            transform: translateY(0);
        }
        .ux-answer-save-check {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            border: 2px solid var(--ux-home-success);
            background-color: var(--ux-home-success);
            box-sizing: border-box;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 20px;
        }
        .ux-answer-save-check span {
            color: #fff;
            font-size: 12px;
            font-weight: 700;
            line-height: 1;
        }
        .ux-answer-save-status.is-saving {
            color: var(--ux-home-secondary-label);
        }
        .ux-answer-save-status.is-saving .ux-answer-save-check {
            border-color: var(--ux-home-separator);
            background-color: transparent;
        }
        .ux-answer-save-status.is-saving .ux-answer-save-check span {
            display: none;
        }
        .ux-answer-save-status.is-last-saved {
            color: var(--ux-home-secondary-label);
            font-weight: 600;
        }
        .ux-answer-save-status.is-last-saved .ux-answer-save-check {
            display: none;
        }
        .ux-native-select,
        select, input[type="text"], input[type="file"], textarea {
            border: 1px solid var(--ux-home-separator);
            border-radius: 6px;
            padding: 8px 10px;
            font-size: 14px;
            font-family: inherit;
            background-color: var(--ux-home-surface);
            color: var(--ux-home-label);
            box-shadow: var(--ux-home-shadow-sm);
        }
        input[type="file"] {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
            min-height: 40px;
        }
        select:focus, input[type="text"]:focus, input[type="file"]:focus, textarea:focus,
        .ux-select-display:focus {
            outline: none;
            border-color: var(--ux-home-accent);
            box-shadow: var(--ux-home-focus-ring);
        }
        select:focus-visible, input[type="text"]:focus-visible, input[type="file"]:focus-visible, textarea:focus-visible,
        .ux-select-display:focus-visible,
        button:focus-visible,
        input[type="button"]:focus-visible,
        input[type="submit"]:focus-visible {
            outline: none;
            border-color: var(--ux-home-accent);
            box-shadow: var(--ux-home-focus-ring);
        }
        .ux-select-wrap {
            position: relative;
            display: inline-block;
            min-width: 140px;
            vertical-align: top;
        }
        .ux-native-select {
            position: absolute !important;
            inset: 0;
            opacity: 0;
            pointer-events: none;
        }
        .ux-select-display {
            width: 100%;
            text-align: left;
            background: var(--ux-home-surface);
            border: 1px solid var(--ux-home-separator);
            border-radius: 6px;
            padding: 4px 26px 4px 8px;
            font-size: var(--ux-select-display-font-size, 14px);
            color: var(--ux-home-label);
            cursor: pointer;
            position: relative;
            display: flex;
            align-items: center;
            min-height: 32px;
            height: auto;
            line-height: 1.25;
            box-sizing: border-box;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .ux-select-display::after {
            content: '';
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            width: 10px;
            height: 10px;
            background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23647569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat center;
            opacity: 0.8;
        }
        .ux-select-list {
            position: absolute;
            left: 0;
            right: 0;
            top: calc(100% + 6px);
            background: var(--ux-home-surface);
            border: 1px solid var(--ux-home-separator);
            border-radius: 8px;
            box-shadow: var(--ux-home-shadow-md);
            max-height: 220px;
            overflow-y: auto;
            overscroll-behavior: contain;
            display: none;
            z-index: 2147483000;
            padding: 4px;
            box-sizing: border-box;
        }
        .ux-select-wrap.ux-open .ux-select-list { display: block; }
        .ux-select-option {
            width: 100%;
            text-align: left;
            background: transparent;
            border: none;
            padding: 6px 8px;
            border-radius: 6px;
            font-size: var(--ux-select-option-font-size, 14px);
            line-height: 1.25;
            min-height: 32px;
            cursor: pointer;
            color: var(--ux-home-label);
        }
        .ux-select-option:hover {
            background: var(--ux-home-accent-softer);
        }
        .ux-select-option[aria-selected="true"] {
            background: var(--ux-home-accent-soft);
            font-weight: 600;
        }
        input[type="button"], button {
            background: var(--ux-home-accent);
            border: 1px solid var(--ux-home-accent);
            color: var(--ux-home-surface);
            border-radius: 6px;
            padding: 0 12px;
            min-height: 38px;
            font-size: 13px;
            font-weight: 700;
            font-family: inherit;
            line-height: 1.2;
            cursor: pointer;
            box-shadow: var(--ux-home-shadow-sm);
            transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
        }
        input[type="button"]:hover, button:hover {
            background: var(--ux-home-accent-emphasis);
            border-color: var(--ux-home-accent-emphasis);
        }
        input[type="button"]:disabled, button:disabled {
            background: var(--ux-home-fill);
            border-color: var(--ux-home-separator);
            color: var(--ux-home-tertiary-label);
            cursor: not-allowed;
        }
        .ux-answer-nav .ux-btn {
            background: var(--ux-home-surface);
            border-color: var(--ux-home-separator);
            color: var(--ux-home-accent-emphasis);
            min-width: 0;
            width: 100%;
            box-sizing: border-box;
            white-space: normal;
            overflow-wrap: anywhere;
            line-height: 1.25;
        }
        .ux-answer-nav .ux-btn:hover {
            background: var(--ux-home-accent-softer);
            border-color: var(--ux-home-accent);
            color: var(--ux-home-accent-emphasis);
        }
        .ux-answer-nav .ux-btn:disabled {
            background: var(--ux-home-fill);
            border-color: var(--ux-home-separator);
            color: var(--ux-home-tertiary-label);
            cursor: not-allowed;
            box-shadow: none;
        }
        .ux-answer-primary-actions .ux-btn.ux-primary,
        .ux-answer-primary-actions .ux-btn.ux-danger {
            background: var(--ux-home-danger);
            border-color: var(--ux-home-danger);
            color: var(--ux-home-surface);
            min-width: 0;
            width: 100%;
            box-sizing: border-box;
            white-space: normal;
            overflow-wrap: anywhere;
            line-height: 1.25;
        }
        .ux-answer-primary-actions .ux-btn.ux-primary:hover,
        .ux-answer-primary-actions .ux-btn.ux-danger:hover {
            background: var(--ux-home-danger-foreground);
            border-color: var(--ux-home-danger-foreground);
            color: var(--ux-home-surface);
        }
        @media (max-width: 560px) {
            .ux-answer-actions {
                grid-template-columns: minmax(0, 1fr);
            }
        }
        /* 単一ページモード: 回答フレームを内容の高さに追従させ、内部スクロールを無くす
           (問題＋回答を外側の .ux-shiken-scroll で一体スクロールできるようにする) */
        html.ux-shiken-single-page-frame,
        html.ux-shiken-single-page-frame body {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
        }
        html.ux-shiken-single-page-frame body {
            display: block !important;
            padding: 12px 14px 18px !important;
        }
        html.ux-shiken-single-page-frame form[name="answer_form"] {
            min-height: 0 !important;
            height: auto !important;
            flex: none !important;
        }
        html.ux-shiken-single-page-frame body.ux-shiken-answer-card-page form[name="answer_form"],
        html.ux-shiken-single-page-frame body.ux-shiken-upload-answer-page form[name="answer_form"] {
            min-height: 0 !important;
            height: auto !important;
        }
        html.ux-shiken-single-page-frame .ux-shiken-answer-card,
        html.ux-shiken-single-page-frame .ux-shiken-upload-answer-card {
            flex: none !important;
            max-height: none !important;
            min-height: 0 !important;
            overflow: visible !important;
        }
        /* 単一ページモードでは textarea も内容に合わせて伸ばし、回答フレーム
           内部ではなくページ側でスクロールする */
        html.ux-shiken-single-page-frame textarea {
            height: auto;
            min-height: 12rem !important;
            overflow-y: hidden !important;
        }
        html.ux-shiken-single-page-frame .ux-answer-actions {
            margin-top: 16px !important;
        }
    `;
  document.head.appendChild(style);

  const opTable = document.getElementById("QstnOperation");
  if (opTable && !opTable.dataset.uxRebuilt) {
    opTable.dataset.uxRebuilt = "true";
    const rows = Array.from(opTable.querySelectorAll("tr"));
    rows.forEach((row) => {
      const hasControls = row.querySelector("input, button");
      const text = row.textContent.replace(/\s|\u00a0/g, "");
      if (!hasControls && text.length === 0) {
        row.remove();
      }
    });

    const ensureDisabledButton = (label) => {
      const hasBtn = Array.from(opTable.querySelectorAll("input, button")).some(
        (el) => {
          return (
            (el.value && el.value.includes(label)) ||
            (el.textContent && el.textContent.includes(label))
          );
        },
      );
      if (hasBtn) return;
      const targetCell = Array.from(opTable.querySelectorAll("td")).find((td) =>
        td.textContent.includes(label),
      );
      if (!targetCell) return;
      targetCell.textContent = "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.disabled = true;
      targetCell.appendChild(btn);
    };

    ensureDisabledButton("前のページ");
    ensureDisabledButton("次のページ");

    // Keep original action controls in the DOM so proxy buttons can delegate to WebClass handlers.
  }

  const form = document.querySelector('form[name="answer_form"]');
  ensureParentQuestionFrameFromAnswerForm(form);
  if (form) {
    prepareShikenAnswerSurface(form);
    bindShikenAnswerSaveStatus(form);
    buildShikenAnswerActionArea(form);
    enhanceShikenAnswerSelectControls(form);
    bindSinglePageAnswerTextareaAutoSize(form);
  }

  // 終了確認ダイアログに終了ボタンを追加する機能
  const addFinishButtonToDialog = () => {
    // すべての「戻る」ボタンを探す
    const backButtons = document.querySelectorAll(
      'input[value="戻る"], button[value="戻る"]',
    );

    backButtons.forEach((backButton) => {
      // 既に終了ボタンが追加されているか確認
      if (backButton.dataset.uxFinishButtonAdded) return;

      // 親要素のテキストを確認
      let container = backButton.closest("table, div, form, body");
      if (!container) container = backButton.parentElement;

      const text = container.textContent || "";
      if (
        text.includes("まだ全ての問いに答えていません") ||
        text.includes("本当にこのまま終了しますか")
      ) {
        backButton.dataset.uxFinishButtonAdded = "true";
        log("Found finish confirmation dialog, adding finish button");

        // 終了ボタンを作成
        const finishButton = document.createElement("input");
        finishButton.type = "button";
        finishButton.value = "終了";
        finishButton.className = backButton.className; // 同じスタイルを適用
        finishButton.style.marginLeft = "8px";
        finishButton.style.backgroundColor = "var(--ux-home-danger)";
        finishButton.style.borderColor = "var(--ux-home-danger)";
        finishButton.style.color = "var(--ux-home-surface)";
        finishButton.style.cursor = "pointer";

        // ホバー効果を追加
        finishButton.addEventListener("mouseenter", () => {
          finishButton.style.backgroundColor =
            "var(--ux-home-danger-foreground)";
          finishButton.style.borderColor = "var(--ux-home-danger-foreground)";
        });
        finishButton.addEventListener("mouseleave", () => {
          finishButton.style.backgroundColor = "var(--ux-home-danger)";
          finishButton.style.borderColor = "var(--ux-home-danger)";
        });

        finishButton.addEventListener("click", () => {
          log("Finish button clicked in dialog");
          // 元のgradeAndClose関数を呼び出す
          if (typeof window.gradeAndClose === "function") {
            window.gradeAndClose();
          } else if (
            window.parent &&
            typeof window.parent.gradeAndClose === "function"
          ) {
            window.parent.gradeAndClose();
          } else {
            // フォールバック: grade送信を試みる
            const form = document.querySelector('form[name="answer_form"]');
            if (form) {
              const sendCmd = form.querySelector('input[name="sendCmd"]');
              if (sendCmd) {
                sendCmd.value = "grade";
                form.submit();
              }
            }
          }
        });

        // 戻るボタンの後に終了ボタンを追加
        if (backButton.nextSibling) {
          backButton.parentNode.insertBefore(
            finishButton,
            backButton.nextSibling,
          );
        } else {
          backButton.parentNode.appendChild(finishButton);
        }

        log("Finish button added to dialog after back button");
      }
    });
  };

  // 初回チェック
  addFinishButtonToDialog();

  // MutationObserverでダイアログの表示を監視
  const dialogObserver = new MutationObserver((mutations) => {
    addFinishButtonToDialog();
  });

  safeObserveUxMutation(dialogObserver, document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * コンテンツフレーム（右側のPDF表示部分）のUI改善
 */
function enhanceShiryouContentFrame() {
  log("Enhancing shiryou content frame");

  // framesetが含まれている場合のみ（PDFビューアを含むframeset）
  // メッセージバーを非表示にする処理を行う
  const hasFrameset = document.querySelector("frameset");

  if (hasFrameset) {
    // PDFを表示するframesetページの場合
    // 「表示に問題があるときは...」のメッセージはloaditフレームで処理済み
    log("Content frame has frameset, no additional processing needed");
    return;
  }

  // framesetがない場合（テキストコンテンツ等）は何もしない
  // コンテンツを正常に表示する
  log("Content frame has no frameset, showing content as-is");
  enhanceVideoMaterialDownloads();
}

function enhanceVideoMaterialDownloads() {
  const videos = document.querySelectorAll("video");
  if (!videos.length) {
    return;
  }

  const contentName = getVideoMaterialContentName();
  log(`Found ${videos.length} video(s) in shiryou content frame`);

  videos.forEach((video, index) => {
    if (video.dataset.uxVideoDownloadEnhanced) return;

    const sourceInfo = getVideoDownloadSourceInfo(video);
    if (
      !sourceInfo.blobUrl &&
      !sourceInfo.directUrl &&
      !sourceInfo.originalUrl
    ) {
      log(
        "Skipping video download enhancement because no source URL was found",
      );
      return;
    }

    video.dataset.uxVideoDownloadEnhanced = "true";

    createVideoDownloadOptions(
      video,
      sourceInfo,
      contentName,
      videos.length > 1 ? index + 1 : null,
    );
  });
}

function getVideoMaterialContentName() {
  const candidates = [
    getContentNameFromParent(),
    getContentNameFromUrl(),
    getContentName(),
    getVideoMaterialTitle(),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = String(candidate).trim();
    if (!normalized || normalized === "Unknown") continue;
    return normalized;
  }

  return "video";
}

function getVideoMaterialTitle() {
  const title = document.title.replace(/\s*-\s*WebClass.*$/i, "").trim();
  return title || "video";
}

function getCurrentVideoPageNumber() {
  try {
    const url = new URL(window.location.href);
    const pageParam = url.searchParams.get("page");
    if (pageParam && /^\d+$/.test(pageParam)) {
      return pageParam;
    }
  } catch (error) {
    log("Error extracting video page from URL:", error);
  }

  try {
    const chapterFrame =
      window.top.frames && window.top.frames["webclass_chapter"];
    const chapterDoc = chapterFrame && chapterFrame.document;
    if (!chapterDoc) {
      throw new Error("chapter frame not ready");
    }

    const activeButton = chapterDoc.querySelector(
      'tr.bkkhaki input[name="clickpage"], td.bkkhaki input[name="clickpage"]',
    );
    if (activeButton) {
      const value = activeButton.value && activeButton.value.trim();
      if (value) {
        return value;
      }
    }
  } catch (error) {
    log("Error extracting current video page from chapter frame:", error);
  }

  return null;
}

function hasOnlyFirstVideoPage() {
  try {
    const chapterFrame =
      window.top.frames && window.top.frames["webclass_chapter"];
    const chapterDoc = chapterFrame && chapterFrame.document;
    if (!chapterDoc) {
      throw new Error("chapter frame not ready");
    }

    const pageNumbers = new Set();
    chapterDoc.querySelectorAll('input[name="clickpage"]').forEach((button) => {
      const value = button.value && button.value.trim();
      if (/^\d+$/.test(value)) {
        pageNumbers.add(value);
        return;
      }

      const onclick = button.getAttribute("onclick") || "";
      const pageMatch = onclick.match(/gopage\(['"]?(\d+)['"]?\)/);
      if (pageMatch) {
        pageNumbers.add(pageMatch[1]);
      }
    });

    if (pageNumbers.size > 0) {
      return pageNumbers.size === 1 && pageNumbers.has("1");
    }

    const jsonData = chapterDoc.querySelector("#json-data");
    if (jsonData) {
      const config = JSON.parse(jsonData.textContent);
      const textUrls = config && config.text_urls;
      if (textUrls && typeof textUrls === "object") {
        const pages = Object.keys(textUrls).filter((page) =>
          /^\d+$/.test(page),
        );
        return pages.length === 1 && pages[0] === "1";
      }
    }
  } catch (error) {
    log("Error checking video page count:", error);
  }

  return false;
}

function shouldOmitSingleVideoPageNumber(pageNumber) {
  return String(pageNumber || "").trim() === "1" && hasOnlyFirstVideoPage();
}

function getCurrentVideoPageNumberForFileName() {
  const pageNumber = getCurrentVideoPageNumber();
  if (shouldOmitSingleVideoPageNumber(pageNumber)) {
    return null;
  }
  return pageNumber;
}

function buildVideoMaterialBaseName(
  contentName,
  pageNumber,
  suffixIndex = null,
) {
  let baseName = contentName;
  if (pageNumber && !shouldOmitSingleVideoPageNumber(pageNumber)) {
    baseName += `_${pageNumber}`;
  }
  if (suffixIndex !== null) {
    baseName += `_${suffixIndex}`;
  }
  return baseName;
}

function getVideoDownloadSourceInfo(video) {
  const currentSrc =
    video.currentSrc || video.src || video.getAttribute("src") || "";
  const blobUrl = currentSrc.startsWith("blob:") ? currentSrc : null;
  const directUrl =
    currentSrc && !currentSrc.startsWith("blob:") ? currentSrc : null;

  let originalUrl = null;
  try {
    const urlObj = new URL(window.location.href);
    const fileParam = urlObj.searchParams.get("file");
    if (fileParam) {
      const decodedFile = decodeURIComponent(fileParam);
      if (/^https?:/i.test(decodedFile)) {
        originalUrl = decodedFile;
      } else {
        const contentsUrl = decodeURIComponent(
          urlObj.searchParams.get("contents_url") || "",
        );
        if (contentsUrl) {
          originalUrl = new URL(
            decodedFile,
            window.location.origin + contentsUrl,
          ).href;
        } else {
          originalUrl = new URL(decodedFile, window.location.href).href;
        }
      }
    }
  } catch (error) {
    log("Error resolving video original URL:", error);
  }

  const hlsUrl = isHlsPlaylistUrl(originalUrl)
    ? originalUrl
    : isHlsPlaylistUrl(directUrl)
      ? directUrl
      : null;
  const originalExtension =
    getExtensionFromUrl(originalUrl || directUrl || "") ||
    (hlsUrl ? ".m3u8" : null);

  return {
    blobUrl,
    directUrl,
    originalUrl,
    hlsUrl,
    originalExtension,
  };
}

function getCurrentVideoDownloadBaseName(contentName, suffixIndex = null) {
  return sanitizeFileName(
    buildVideoMaterialBaseName(
      contentName,
      getCurrentVideoPageNumberForFileName(),
      suffixIndex,
    ),
  );
}

function normalizeVideoExtensionForCompatibility(extension) {
  const normalized =
    typeof extension === "string" ? extension.toLowerCase() : "";
  if (!normalized) {
    return ".mp4";
  }

  if (normalized === ".m4v" || normalized === ".mov") {
    return ".mp4";
  }

  return normalized;
}

function getPreferredDirectVideoExtension(sourceUrl) {
  return normalizeVideoExtensionForCompatibility(
    getExtensionFromUrl(sourceUrl) || ".mp4",
  );
}

function getCompatibleVideoFileName(baseName, sourceInfo) {
  if (sourceInfo?.hlsUrl) {
    return `${baseName}.mp4`;
  }

  if (sourceInfo?.blobUrl) {
    return `${baseName}.mp4`;
  }

  if (sourceInfo?.directUrl || sourceInfo?.originalUrl) {
    return `${baseName}${getPreferredDirectVideoExtension(sourceInfo.directUrl || sourceInfo.originalUrl)}`;
  }

  return `${baseName}.mp4`;
}

function shouldRenameVideoResponseToMp4(contentType, originalExtension) {
  const normalizedType = (contentType || "").toLowerCase();
  const normalizedExtension =
    normalizeVideoExtensionForCompatibility(originalExtension);

  if (normalizedExtension === ".webm" || normalizedExtension === ".ts") {
    return false;
  }

  if (
    normalizedType.includes("video/mp4") ||
    normalizedType.includes("audio/mp4") ||
    normalizedType.includes("quicktime")
  ) {
    return true;
  }

  return normalizedExtension === ".mp4";
}

function createVideoDownloadOptions(
  video,
  sourceInfo,
  contentName,
  suffixIndex = null,
) {
  const container = document.createElement("div");
  container.className = "ux-download-group";
  container.style.margin = "12px auto 0";
  container.style.maxWidth = `${Math.max(video.clientWidth || video.width || 480, 320)}px`;

  const initialBaseName = getCurrentVideoDownloadBaseName(
    contentName,
    suffixIndex,
  );
  const estimatedFileName = getCompatibleVideoFileName(
    initialBaseName,
    sourceInfo,
  );

  const fullscreenBtn = document.createElement("button");
  fullscreenBtn.type = "button";
  fullscreenBtn.className = "ux-download-btn ux-download-original";
  fullscreenBtn.textContent = "全画面";
  fullscreenBtn.title = "動画を全画面表示";
  fullscreenBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openVideoFullscreenOverlay(video, contentName);
  });
  container.appendChild(fullscreenBtn);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "ux-download-btn ux-download-rename";
  saveBtn.textContent = "動画DL";
  saveBtn.title = `動画を保存: ${estimatedFileName}`;
  saveBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    saveBtn.disabled = true;
    const originalText = saveBtn.textContent;
    saveBtn.textContent = "取得中";

    try {
      const baseName = getCurrentVideoDownloadBaseName(
        contentName,
        suffixIndex,
      );
      if (sourceInfo.hlsUrl) {
        const fileName = await downloadHlsVideo(
          sourceInfo.hlsUrl,
          baseName,
          (completed, total) => {
            saveBtn.textContent =
              total > 0 ? `取得中 ${completed}/${total}` : "取得中";
          },
        );
        saveBtn.title = `蜍慕判繧剃ｿ晏ｭ・ ${fileName}`;
      } else if (sourceInfo.directUrl || sourceInfo.originalUrl) {
        const sourceUrl = sourceInfo.directUrl || sourceInfo.originalUrl;
        const fileName = `${baseName}${getPreferredDirectVideoExtension(sourceUrl)}`;
        await downloadRemoteFileAsBlob(sourceUrl, fileName);
        saveBtn.title = `蜍慕判繧剃ｿ晏ｭ・ ${fileName}`;
      } else if (sourceInfo.blobUrl) {
        const fileName = `${baseName}.mp4`;
        await triggerBlobDownload(sourceInfo.blobUrl, fileName);
        saveBtn.title = `蜍慕判繧剃ｿ晏ｭ・ ${fileName}`;
      } else {
        throw new Error("No downloadable source found");
      }
      saveBtn.textContent = "完了";
    } catch (error) {
      console.error("[WebClass UX] Video download error:", error);
      log("Video download error:", error);
      saveBtn.title = error?.message || "Video download failed";
      saveBtn.textContent = "失敗";
    }

    setTimeout(() => {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }, 2000);
  });
  container.appendChild(saveBtn);

  video.insertAdjacentElement("afterend", container);
}

let activeVideoFrameFullscreenSession = null;

async function openVideoFullscreenOverlay(video, contentName) {
  const topDoc = window.top?.document;
  const frameEl =
    window.frameElement ||
    topDoc?.querySelector(
      'frame[name="webclass_content"], iframe[name="webclass_content"]',
    );

  if (video && shouldUseDirectVideoFullscreen(frameEl)) {
    try {
      prepareOwningFrameForVideoFullscreen(frameEl);
      await requestVideoFullscreen(video);
      return;
    } catch (error) {
      log("Video fullscreen failed, falling back to frame fullscreen:", error);
    }
  }

  if (frameEl) {
    releaseActiveVideoFrameFullscreenSession();
    const cleanupFullscreenLayout = video
      ? activateVideoFrameFullscreenLayout(video)
      : null;
    try {
      await requestElementFullscreen(frameEl);
      bindVideoFrameFullscreenCleanup(frameEl, cleanupFullscreenLayout);
      return;
    } catch (error) {
      cleanupFullscreenLayout?.();
      log("Frame fullscreen failed:", error);
    }
  }

  const label = contentName || "動画";
  alert(`${label} を全画面表示できませんでした。`);
}

function shouldUseDirectVideoFullscreen(frameEl) {
  if (!frameEl) {
    return true;
  }

  // Embedded course content is commonly loaded in <frame>/<iframe> contexts
  // where calling video.requestFullscreen() is blocked by the document policy.
  return false;
}

function prepareOwningFrameForVideoFullscreen(frameEl) {
  if (!frameEl || frameEl.tagName !== "IFRAME") {
    return;
  }

  if (!frameEl.hasAttribute("allowfullscreen")) {
    frameEl.setAttribute("allowfullscreen", "");
  }

  const allow = frameEl.getAttribute("allow") || "";
  if (!/\bfullscreen\b/i.test(allow)) {
    frameEl.setAttribute(
      "allow",
      allow ? `${allow}; fullscreen *` : "fullscreen *",
    );
  }
}

function requestVideoFullscreen(video) {
  if (!video) {
    return Promise.reject(new Error("Video element is unavailable"));
  }

  if (typeof video.requestFullscreen === "function") {
    return video.requestFullscreen();
  }

  if (typeof video.webkitEnterFullscreen === "function") {
    video.webkitEnterFullscreen();
    return Promise.resolve();
  }

  if (typeof video.webkitEnterFullScreen === "function") {
    video.webkitEnterFullScreen();
    return Promise.resolve();
  }

  return requestElementFullscreen(video);
}

function ensureVideoFrameFullscreenStyles() {
  if (document.getElementById("ux-video-frame-fullscreen-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "ux-video-frame-fullscreen-style";
  style.textContent = `
        html.ux-video-frame-fullscreen-active,
        html.ux-video-frame-fullscreen-active body {
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #000 !important;
        }

        html.ux-video-frame-fullscreen-active body {
            position: relative !important;
        }

        html.ux-video-frame-fullscreen-active body > * {
            visibility: hidden !important;
        }

        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-root,
        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-root * {
            visibility: visible !important;
        }

        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-root {
            position: fixed !important;
            inset: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100vw !important;
            height: 100vh !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #000 !important;
            z-index: 2147483646 !important;
        }

        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-root table,
        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-root tbody,
        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-root tr,
        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-root td {
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            background: transparent !important;
        }

        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-root br,
        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-root a {
            display: none !important;
        }

        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-target {
            display: block !important;
            width: 100vw !important;
            height: 100vh !important;
            max-width: 100vw !important;
            max-height: 100vh !important;
            margin: 0 auto !important;
            background: #000 !important;
            object-fit: contain !important;
        }

        html.ux-video-frame-fullscreen-active .ux-download-group {
            display: none !important;
        }
    `;

  (document.head || document.documentElement).appendChild(style);
}

function activateVideoFrameFullscreenLayout(video) {
  if (!video) {
    return null;
  }

  ensureVideoFrameFullscreenStyles();

  const layoutRoot =
    video.closest(".contentfile") || video.parentElement || video;
  document.documentElement.classList.add("ux-video-frame-fullscreen-active");
  if (document.body) {
    document.body.classList.add("ux-video-frame-fullscreen-active");
  }
  layoutRoot.classList.add("ux-video-fullscreen-root");
  video.classList.add("ux-video-fullscreen-target");

  return () => {
    document.documentElement.classList.remove(
      "ux-video-frame-fullscreen-active",
    );
    if (document.body) {
      document.body.classList.remove("ux-video-frame-fullscreen-active");
    }
    layoutRoot.classList.remove("ux-video-fullscreen-root");
    video.classList.remove("ux-video-fullscreen-target");
  };
}

function releaseActiveVideoFrameFullscreenSession() {
  if (!activeVideoFrameFullscreenSession) {
    return;
  }

  activeVideoFrameFullscreenSession.stop();
  activeVideoFrameFullscreenSession = null;
}

function bindVideoFrameFullscreenCleanup(frameEl, cleanup) {
  if (!cleanup) {
    return;
  }

  releaseActiveVideoFrameFullscreenSession();

  const docs = [];
  const events = [
    "fullscreenchange",
    "webkitfullscreenchange",
    "mozfullscreenchange",
    "MSFullscreenChange",
  ];
  const appendDoc = (doc) => {
    if (doc && !docs.includes(doc)) {
      docs.push(doc);
    }
  };

  appendDoc(document);

  try {
    appendDoc(frameEl?.ownerDocument);
  } catch (error) {
    log("Unable to access fullscreen owner document:", error);
  }

  try {
    appendDoc(window.top?.document);
  } catch (error) {
    log("Unable to access top document for fullscreen sync:", error);
  }

  let released = false;
  let syncFullscreenState = null;

  const release = () => {
    if (released) {
      return;
    }
    released = true;

    docs.forEach((doc) => {
      events.forEach((eventName) => {
        doc.removeEventListener(eventName, syncFullscreenState);
      });
    });

    cleanup();

    if (activeVideoFrameFullscreenSession?.release === release) {
      activeVideoFrameFullscreenSession = null;
    }
  };

  syncFullscreenState = () => {
    const isFrameStillFullscreen = docs.some((doc) => {
      const fullscreenElement =
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.msFullscreenElement;
      return fullscreenElement === frameEl;
    });

    if (!isFrameStillFullscreen) {
      release();
    }
  };

  docs.forEach((doc) => {
    events.forEach((eventName) => {
      doc.addEventListener(eventName, syncFullscreenState);
    });
  });

  activeVideoFrameFullscreenSession = {
    release,
    stop: release,
  };
}

function requestElementFullscreen(element) {
  if (element.requestFullscreen) {
    return element.requestFullscreen();
  }
  if (element.webkitRequestFullscreen) {
    return Promise.resolve(element.webkitRequestFullscreen());
  }
  if (element.msRequestFullscreen) {
    return Promise.resolve(element.msRequestFullscreen());
  }
  return Promise.reject(new Error("Fullscreen API is unavailable"));
}

function isHlsPlaylistUrl(url) {
  return typeof url === "string" && /\.m3u8(?:$|[?#])/i.test(url);
}

async function downloadRemoteFileAsBlob(url, filename) {
  const response = await fetch(url, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const blob = await response.blob();
  const originalExtension = getExtensionFromUrl(url) || ".mp4";
  const targetFilename = shouldRenameVideoResponseToMp4(
    blob.type,
    originalExtension,
  )
    ? `${filename.replace(/\.[^.]+$/, "")}.mp4`
    : filename;
  await downloadBlobData(blob, targetFilename);
}

async function downloadBlobData(blob, filename) {
  const blobUrl = URL.createObjectURL(blob);

  try {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  }
}

async function fetchTextWithCredentials(url) {
  const response = await fetch(url, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  return response.text();
}

async function fetchArrayBufferWithCredentials(url, byteRange = null) {
  const headers = {};
  if (
    byteRange &&
    Number.isFinite(byteRange.start) &&
    Number.isFinite(byteRange.end)
  ) {
    headers.Range = `bytes=${byteRange.start}-${byteRange.end}`;
  }

  const response = await fetch(url, {
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  return {
    buffer: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") || "",
  };
}

function parseHlsAttributeList(text) {
  const attributes = {};
  const regex = /([A-Z0-9-]+)=("(?:[^"\\]|\\.)*"|[^,]*)/gi;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const key = match[1];
    let value = match[2] || "";
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    attributes[key] = value;
  }

  return attributes;
}

function getHlsVariantScore(attributes) {
  const bandwidth = parseInt(attributes.BANDWIDTH || "0", 10) || 0;
  const resolution = attributes.RESOLUTION || "";
  const resolutionMatch = resolution.match(/(\d+)x(\d+)/i);
  const pixels = resolutionMatch
    ? (parseInt(resolutionMatch[1], 10) || 0) *
      (parseInt(resolutionMatch[2], 10) || 0)
    : 0;

  return pixels * 100000000 + bandwidth;
}

function parseHlsByteRange(value, previousByteRange = null) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const match = value.trim().match(/^(\d+)(?:@(\d+))?$/);
  if (!match) {
    return null;
  }

  const length = parseInt(match[1], 10);
  if (!Number.isFinite(length) || length <= 0) {
    return null;
  }

  const explicitStart = match[2] ? parseInt(match[2], 10) : null;
  const start = Number.isFinite(explicitStart)
    ? explicitStart
    : previousByteRange
      ? previousByteRange.end + 1
      : 0;

  return {
    start,
    end: start + length - 1,
  };
}

async function resolveHlsMediaPlaylist(hlsUrl, visited = new Set()) {
  const normalizedUrl = new URL(hlsUrl, window.location.href).href;
  if (visited.has(normalizedUrl)) {
    throw new Error("Detected recursive HLS playlist reference");
  }
  visited.add(normalizedUrl);

  const manifestText = await fetchTextWithCredentials(normalizedUrl);
  const lines = manifestText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("#EXT-X-STREAM-INF:")) {
      continue;
    }

    const nextLine = lines[i + 1];
    if (!nextLine || nextLine.startsWith("#")) {
      continue;
    }

    const attributes = parseHlsAttributeList(
      line.slice("#EXT-X-STREAM-INF:".length),
    );
    variants.push({
      url: new URL(nextLine, normalizedUrl).href,
      score: getHlsVariantScore(attributes),
    });
  }

  if (variants.length) {
    variants.sort((a, b) => b.score - a.score);
    return resolveHlsMediaPlaylist(variants[0].url, visited);
  }

  return {
    playlistUrl: normalizedUrl,
    manifestText,
  };
}

function buildHlsSegmentPlan(manifestText, playlistUrl) {
  const lines = manifestText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let initSegmentUrl = null;
  const segmentUrls = [];
  let pendingSegmentByteRange = null;
  let previousSegmentReference = null;

  for (const line of lines) {
    if (line.startsWith("#EXT-X-KEY:")) {
      const attributes = parseHlsAttributeList(
        line.slice("#EXT-X-KEY:".length),
      );
      const method = (attributes.METHOD || "NONE").toUpperCase();
      if (method !== "NONE") {
        throw new Error("Encrypted HLS streams are not supported yet");
      }
      continue;
    }

    if (line.startsWith("#EXT-X-MAP:")) {
      const attributes = parseHlsAttributeList(
        line.slice("#EXT-X-MAP:".length),
      );
      if (attributes.URI) {
        const resolvedUrl = new URL(attributes.URI, playlistUrl).href;
        initSegmentUrl = {
          url: resolvedUrl,
          byteRange: parseHlsByteRange(attributes.BYTERANGE || "", null),
        };
      }
      continue;
    }

    if (line.startsWith("#EXT-X-BYTERANGE:")) {
      pendingSegmentByteRange = line.slice("#EXT-X-BYTERANGE:".length).trim();
      continue;
    }

    if (line.startsWith("#")) {
      continue;
    }

    const resolvedUrl = new URL(line, playlistUrl).href;
    const previousByteRange =
      previousSegmentReference?.url === resolvedUrl
        ? previousSegmentReference.byteRange
        : null;
    const byteRange = parseHlsByteRange(
      pendingSegmentByteRange,
      previousByteRange,
    );
    const segmentReference = {
      url: resolvedUrl,
      byteRange,
    };

    segmentUrls.push(segmentReference);
    previousSegmentReference = segmentReference;
    pendingSegmentByteRange = null;
  }

  if (!segmentUrls.length) {
    throw new Error("No HLS segments were found");
  }

  return {
    initSegmentUrl,
    segmentUrls,
  };
}

function detectHlsOutputFormat(url, contentType, hasInitSegment) {
  const normalizedType = (contentType || "").toLowerCase();

  if (normalizedType.includes("mp2t") || /\.ts(?:$|[?#])/i.test(url)) {
    return {
      extension: ".ts",
      mimeType: "video/mp2t",
    };
  }

  if (
    hasInitSegment ||
    normalizedType.includes("mp4") ||
    /\.m4s(?:$|[?#])/i.test(url) ||
    /\.mp4(?:$|[?#])/i.test(url)
  ) {
    return {
      extension: ".mp4",
      mimeType: "video/mp4",
    };
  }

  return {
    extension: hasInitSegment ? ".mp4" : ".ts",
    mimeType: hasInitSegment ? "video/mp4" : "video/mp2t",
  };
}

function isMuxJsMp4TransmuxerAvailable() {
  return !!globalThis.muxjs?.Transmuxer;
}

function concatUint8Arrays(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return combined;
}

let mp4BoxModulePromise = null;

function sliceArrayBufferFromUint8Array(data) {
  const normalized = data instanceof Uint8Array ? data : new Uint8Array(data);
  return normalized.buffer.slice(
    normalized.byteOffset,
    normalized.byteOffset + normalized.byteLength,
  );
}

function parseMp4BoxHeaders(data, start = 0, end = data.byteLength) {
  const boxes = [];
  let offset = start;

  while (offset + 8 <= end) {
    let size =
      ((data[offset] << 24) |
        (data[offset + 1] << 16) |
        (data[offset + 2] << 8) |
        data[offset + 3]) >>>
      0;
    const type = String.fromCharCode(
      data[offset + 4],
      data[offset + 5],
      data[offset + 6],
      data[offset + 7],
    );
    let headerSize = 8;

    if (size === 1) {
      if (offset + 16 > end) {
        break;
      }

      const high =
        (data[offset + 8] * 0x1000000 +
          (data[offset + 9] << 16) +
          (data[offset + 10] << 8) +
          data[offset + 11]) >>>
        0;
      const low =
        (data[offset + 12] * 0x1000000 +
          (data[offset + 13] << 16) +
          (data[offset + 14] << 8) +
          data[offset + 15]) >>>
        0;
      size = high * 0x100000000 + low;
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }

    if (!Number.isFinite(size) || size < headerSize || offset + size > end) {
      break;
    }

    boxes.push({
      offset,
      size,
      headerSize,
      type,
    });

    offset += size;
  }

  return boxes;
}

function needsStandaloneMp4Rebuild(mp4Data) {
  const normalized =
    mp4Data instanceof Uint8Array ? mp4Data : new Uint8Array(mp4Data);
  const topLevelBoxes = parseMp4BoxHeaders(normalized);
  if (topLevelBoxes.some((box) => box.type === "moof")) {
    return true;
  }

  const moov = topLevelBoxes.find((box) => box.type === "moov");
  if (!moov) {
    return false;
  }

  return parseMp4BoxHeaders(
    normalized,
    moov.offset + moov.headerSize,
    moov.offset + moov.size,
  ).some((box) => box.type === "mvex");
}

function runLengthEncode(values) {
  const counts = [];
  const encodedValues = [];

  for (const value of values) {
    if (!counts.length || encodedValues[encodedValues.length - 1] !== value) {
      counts.push(1);
      encodedValues.push(value);
    } else {
      counts[counts.length - 1] += 1;
    }
  }

  return {
    counts,
    values: encodedValues,
  };
}

async function ensureMp4BoxModule() {
  if (!mp4BoxModulePromise) {
    mp4BoxModulePromise = import(
      chrome.runtime.getURL("lib/mp4box.all.js")
    ).catch((error) => {
      mp4BoxModulePromise = null;
      throw error;
    });
  }

  return mp4BoxModulePromise;
}

async function rebuildFragmentedMp4ToStandalone(mp4Data) {
  const normalizedInput =
    mp4Data instanceof Uint8Array ? mp4Data : new Uint8Array(mp4Data);
  if (
    !normalizedInput.byteLength ||
    !needsStandaloneMp4Rebuild(normalizedInput)
  ) {
    return normalizedInput;
  }

  const MP4Box = await ensureMp4BoxModule();
  const inputFile = MP4Box.createFile();
  inputFile.discardMdatData = false;

  let parseErrorMessage = "";
  inputFile.onError = (...args) => {
    parseErrorMessage = args
      .filter((value) => typeof value === "string" && value)
      .join(": ");
  };

  const inputBuffer = sliceArrayBufferFromUint8Array(normalizedInput);
  inputBuffer.fileStart = 0;
  inputFile.appendBuffer(inputBuffer);
  inputFile.flush();

  if (parseErrorMessage) {
    throw new Error(parseErrorMessage);
  }

  if (!inputFile?.moov?.traks?.length || !inputFile?.ftyp) {
    throw new Error("MP4 metadata could not be parsed.");
  }

  for (const trak of inputFile.moov.traks) {
    for (
      let sampleIndex = 0;
      sampleIndex < trak.samples.length;
      sampleIndex += 1
    ) {
      const sample = inputFile.getSample(trak, sampleIndex);
      if (!sample?.data) {
        throw new Error(
          `MP4 sample data is incomplete for track ${trak.tkhd.track_id}.`,
        );
      }
    }
  }

  inputFile.boxes = inputFile.boxes.filter(
    (box) => box.type !== "moof" && box.type !== "mdat",
  );
  inputFile.moov.boxes = inputFile.moov.boxes.filter(
    (box) => box && box.type !== "mvex",
  );
  delete inputFile.moov.mvex;

  const trackDataSizes = [];
  const mdatChunks = [];
  let movieDuration = 0;

  for (const trak of inputFile.moov.traks) {
    const stbl = trak?.mdia?.minf?.stbl;
    const stco = stbl?.stco || stbl?.co64;
    const stsc = stbl?.stsc;
    const stsz = stbl?.stsz || stbl?.stz2;
    const stts = stbl?.stts;
    if (!stbl || !stco || !stsc || !stsz || !stts) {
      throw new Error(
        `MP4 sample tables are unavailable for track ${trak?.tkhd?.track_id || "unknown"}.`,
      );
    }

    const samples = trak.samples || [];
    const trackChunkSize = samples.reduce(
      (sum, sample) => sum + sample.size,
      0,
    );
    trackDataSizes.push(trackChunkSize);

    stco.chunk_offsets = samples.length ? [0] : [];
    stsc.first_chunk = samples.length ? [1] : [];
    stsc.samples_per_chunk = samples.length ? [samples.length] : [];
    stsc.sample_description_index = samples.length ? [1] : [];
    stsz.sample_sizes = samples.map((sample) => sample.size);

    const durationRuns = runLengthEncode(
      samples.map((sample) => sample.duration),
    );
    stts.sample_counts = durationRuns.counts;
    stts.sample_deltas = durationRuns.values;

    const compositionOffsets = samples.map((sample) => sample.cts - sample.dts);
    if (compositionOffsets.some((offset) => offset !== 0)) {
      if (!stbl.ctts && MP4Box?.BoxParser?.box?.ctts) {
        const ctts = new MP4Box.BoxParser.box.ctts();
        stbl.ctts = ctts;
        const stssIndex = stbl.boxes.findIndex(
          (box) => box && box.type === "stss",
        );
        const stscIndex = stbl.boxes.findIndex(
          (box) => box && box.type === "stsc",
        );
        const insertIndex =
          stssIndex >= 0
            ? stssIndex + 1
            : stscIndex >= 0
              ? stscIndex
              : stbl.boxes.length;
        stbl.boxes.splice(insertIndex, 0, ctts);
      }

      if (stbl.ctts) {
        const compositionRuns = runLengthEncode(compositionOffsets);
        stbl.ctts.sample_counts = compositionRuns.counts;
        stbl.ctts.sample_offsets = compositionRuns.values;
      }
    } else if (stbl.ctts) {
      stbl.boxes = stbl.boxes.filter((box) => box && box.type !== "ctts");
      delete stbl.ctts;
    }

    const syncSamples = [];
    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
      if (samples[sampleIndex].is_sync) {
        syncSamples.push(sampleIndex + 1);
      }
    }

    if (syncSamples.length > 0 && syncSamples.length !== samples.length) {
      if (!stbl.stss && MP4Box?.BoxParser?.box?.stss) {
        const stss = new MP4Box.BoxParser.box.stss();
        stbl.stss = stss;
        const stscIndex = stbl.boxes.findIndex(
          (box) => box && box.type === "stsc",
        );
        if (stscIndex >= 0) {
          stbl.boxes.splice(stscIndex, 0, stss);
        } else {
          stbl.boxes.push(stss);
        }
      }

      if (stbl.stss) {
        stbl.stss.sample_numbers = syncSamples;
      }
    } else if (stbl.stss) {
      stbl.boxes = stbl.boxes.filter((box) => box && box.type !== "stss");
      delete stbl.stss;
    }

    trak.mdia.mdhd.duration = trak.samples_duration;
    const trackMovieDuration = trak.mdia.mdhd.timescale
      ? Math.round(
          (trak.samples_duration * inputFile.moov.mvhd.timescale) /
            trak.mdia.mdhd.timescale,
        )
      : 0;
    trak.tkhd.duration = trackMovieDuration;
    movieDuration = Math.max(movieDuration, trackMovieDuration);

    for (const sample of samples) {
      mdatChunks.push(
        sample.data instanceof Uint8Array
          ? sample.data
          : new Uint8Array(sample.data),
      );
    }
  }

  inputFile.moov.mvhd.duration = movieDuration;

  const tempStream = new MP4Box.DataStream();
  inputFile.ftyp.write(tempStream);
  inputFile.moov.write(tempStream);

  const mdatDataStart = tempStream.position + 8;
  let runningOffset = 0;

  for (
    let trackIndex = 0;
    trackIndex < inputFile.moov.traks.length;
    trackIndex += 1
  ) {
    const trak = inputFile.moov.traks[trackIndex];
    const stbl = trak.mdia.minf.stbl;
    const stco = stbl.stco || stbl.co64;
    if (!stco) {
      continue;
    }

    stco.chunk_offsets = trackDataSizes[trackIndex]
      ? [mdatDataStart + runningOffset]
      : [];
    runningOffset += trackDataSizes[trackIndex];
  }

  const mdat = new MP4Box.Box();
  mdat.type = "mdat";
  mdat.data = concatUint8Arrays(mdatChunks);
  inputFile.boxes = [inputFile.ftyp, inputFile.moov, mdat];

  const outputStream = new MP4Box.DataStream();
  inputFile.write(outputStream);

  return new Uint8Array(outputStream.buffer.slice(0, outputStream.position));
}

async function normalizeMp4ForCompatibleDownload(mp4Data) {
  const normalizedInput =
    mp4Data instanceof Uint8Array ? mp4Data : new Uint8Array(mp4Data);

  try {
    return await rebuildFragmentedMp4ToStandalone(normalizedInput);
  } catch (error) {
    console.warn(
      "[WebClass UX] Failed to rebuild fragmented MP4 into standalone MP4:",
      error,
    );
    return normalizedInput;
  }
}

function transmuxTsSegmentsToMp4Once(segmentBuffers, options = {}) {
  return new Promise((resolve, reject) => {
    const transmuxer = new globalThis.muxjs.Transmuxer({
      remux: true,
      ...options,
    });
    const outputChunks = [];
    const logs = [];
    let initSegmentWritten = false;
    let settled = false;

    const cleanup = () => {
      if (typeof transmuxer.dispose === "function") {
        transmuxer.dispose();
      }
    };

    const fail = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    transmuxer.on("log", (entry) => {
      if (entry?.message) {
        logs.push(entry.message);
      }
    });

    transmuxer.on("data", (segment) => {
      try {
        if (segment?.initSegment?.byteLength && !initSegmentWritten) {
          outputChunks.push(new Uint8Array(segment.initSegment));
          initSegmentWritten = true;
        }

        if (segment?.data?.byteLength) {
          outputChunks.push(new Uint8Array(segment.data));
        }
      } catch (error) {
        fail(error);
      }
    });

    transmuxer.on("done", () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();

      if (!outputChunks.length) {
        const details = logs.length ? ` (${logs.join(" | ")})` : "";
        reject(new Error(`Failed to transmux TS segments into MP4${details}`));
        return;
      }

      resolve(concatUint8Arrays(outputChunks));
    });

    try {
      for (const segmentBuffer of segmentBuffers) {
        const chunk =
          segmentBuffer instanceof Uint8Array
            ? segmentBuffer
            : new Uint8Array(segmentBuffer);
        transmuxer.push(chunk);
      }

      transmuxer.flush();
    } catch (error) {
      fail(error);
    }
  });
}

async function transmuxTsSegmentsToMp4(segmentBuffers) {
  if (!isMuxJsMp4TransmuxerAvailable()) {
    throw new Error("mux.js MP4 transmuxer is unavailable");
  }

  const normalizedBuffers = segmentBuffers.map((segmentBuffer) =>
    segmentBuffer instanceof Uint8Array
      ? segmentBuffer
      : new Uint8Array(segmentBuffer),
  );
  const attempts = [
    {
      // Feeding TS chunks segment-by-segment preserves packet/timestamp boundaries
      // better than concatenating the entire stream first, which can yield bogus
      // durations or blank output for some WebClass HLS recordings.
      name: "segmented-default",
      buffers: normalizedBuffers,
      options: {},
    },
    {
      name: "segmented-original-ts",
      buffers: normalizedBuffers,
      options: { keepOriginalTimestamps: true },
    },
    {
      name: "combined-default",
      buffers: [concatUint8Arrays(normalizedBuffers)],
      options: {},
    },
    {
      name: "combined-original-ts",
      buffers: [concatUint8Arrays(normalizedBuffers)],
      options: { keepOriginalTimestamps: true },
    },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      return await transmuxTsSegmentsToMp4Once(
        attempt.buffers,
        attempt.options,
      );
    } catch (error) {
      lastError = error;
      console.warn(
        "[WebClass UX] MP4 transmux attempt failed:",
        attempt.name,
        error,
      );
    }
  }

  throw lastError || new Error("Failed to transmux TS segments into MP4");
}

async function downloadHlsVideo(hlsUrl, baseName, onProgress) {
  const { playlistUrl, manifestText } = await resolveHlsMediaPlaylist(hlsUrl);
  const { initSegmentUrl, segmentUrls } = buildHlsSegmentPlan(
    manifestText,
    playlistUrl,
  );
  const total = segmentUrls.length + (initSegmentUrl ? 1 : 0);
  const parts = [];
  let completed = 0;
  let detectedFormat = null;

  if (typeof onProgress === "function") {
    onProgress(completed, total);
  }

  if (initSegmentUrl) {
    const initPart = await fetchArrayBufferWithCredentials(
      initSegmentUrl.url,
      initSegmentUrl.byteRange,
    );
    parts.push(initPart.buffer);
    detectedFormat = detectHlsOutputFormat(
      initSegmentUrl.url,
      initPart.contentType,
      true,
    );
    completed += 1;
    if (typeof onProgress === "function") {
      onProgress(completed, total);
    }
  }

  for (const segmentUrl of segmentUrls) {
    const segment = await fetchArrayBufferWithCredentials(
      segmentUrl.url,
      segmentUrl.byteRange,
    );
    if (!detectedFormat) {
      detectedFormat = detectHlsOutputFormat(
        segmentUrl.url,
        segment.contentType,
        false,
      );
    }
    parts.push(segment.buffer);
    completed += 1;
    if (typeof onProgress === "function") {
      onProgress(completed, total);
    }
  }

  const finalFormat = detectedFormat || {
    extension: ".mp4",
    mimeType: "video/mp4",
  };

  if (finalFormat.extension === ".ts") {
    try {
      const mp4Data = await normalizeMp4ForCompatibleDownload(
        await transmuxTsSegmentsToMp4(parts),
      );
      const fileName = `${baseName}.mp4`;
      await downloadBlobData(
        new Blob([mp4Data], { type: "video/mp4" }),
        fileName,
      );
      return fileName;
    } catch (error) {
      console.warn(
        "[WebClass UX] Falling back to TS download after MP4 transmux failure:",
        error,
      );
      const fileName = `${baseName}.ts`;
      await downloadBlobData(new Blob(parts, { type: "video/mp2t" }), fileName);
      return fileName;
    }
  }

  const fileName = `${baseName}${finalFormat.extension}`;
  if (finalFormat.extension === ".mp4") {
    const mp4Data = await normalizeMp4ForCompatibleDownload(
      concatUint8Arrays(
        parts.map((part) =>
          part instanceof Uint8Array ? part : new Uint8Array(part),
        ),
      ),
    );
    await downloadBlobData(
      new Blob([mp4Data], { type: finalFormat.mimeType }),
      fileName,
    );
    return fileName;
  }

  await downloadBlobData(
    new Blob(parts, { type: finalFormat.mimeType }),
    fileName,
  );
  return fileName;
}

/**
 * 特定のテキストを含む要素を非表示
 */
function hideTextContaining(searchText) {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false,
  );

  let node;
  while ((node = walker.nextNode())) {
    if (node.textContent.includes(searchText)) {
      let element = node.parentElement;
      // 親を遡って適切な要素を非表示にする
      while (element && element !== document.body) {
        if (
          element.tagName === "DIV" ||
          element.tagName === "P" ||
          element.tagName === "SPAN" ||
          element.tagName === "TD" ||
          element.tagName === "TR" ||
          element.tagName === "TABLE"
        ) {
          element.style.display = "none";
          log("Hidden element containing:", searchText);
          break;
        }
        element = element.parentElement;
      }
    }
  }
}

// NOTE: beforeunload blocking is now handled by beforeunload-blocker.js
// which is injected via manifest.json with world: "MAIN" to bypass CSP

/**
 * beforeunload警告を無効化する（指定されたウィンドウ）
 * WebClassが設定するページ離脱警告をブロックする
 * @param {Window} targetWindow - 対象のウィンドウオブジェクト
 */
function disableBeforeUnloadWarningForWindow(targetWindow) {
  try {
    // キャプチャフェーズで最優先でイベントを処理し、警告を完全にブロック
    // これが最も確実な方法
    targetWindow.addEventListener(
      "beforeunload",
      (e) => {
        // Stop other listeners without triggering the dialog.
        e.stopImmediatePropagation();
        e.stopPropagation();
        try {
          delete e.returnValue;
        } catch (ex) {}
      },
      true,
    );

    // window.onbeforeunloadをnullで上書き
    targetWindow.onbeforeunload = null;

    // Object.definePropertyで上書きを防止
    try {
      Object.defineProperty(targetWindow, "onbeforeunload", {
        get: () => null,
        set: (val) => {
          log("Blocked onbeforeunload assignment:", typeof val);
        },
        configurable: true,
      });
    } catch (e) {
      // 一部の環境ではdefinePropertyが失敗する
    }

    // addEventListenerを上書きしてbeforeunloadリスナーの追加をブロック
    if (!targetWindow.__uxAddEventListenerPatched) {
      targetWindow.__uxAddEventListenerPatched = true;
      const originalAddEventListener =
        targetWindow.addEventListener.bind(targetWindow);
      targetWindow.addEventListener = function (type, listener, options) {
        if (type === "beforeunload") {
          log("Blocked beforeunload listener registration");
          return;
        }
        return originalAddEventListener(type, listener, options);
      };
    }

    // 定期的にonbeforeunloadをクリア（WebClassが後から設定する場合に対応）
    // 最初の10秒間、500msごとにクリア
    if (!targetWindow.__uxBeforeUnloadClearerStarted) {
      targetWindow.__uxBeforeUnloadClearerStarted = true;
      let clearCount = 0;
      const maxClears = 20; // 10秒間 (500ms * 20)
      const clearerId = setInterval(() => {
        try {
          // 直接プロパティアクセスでnullを設定
          const descriptor = Object.getOwnPropertyDescriptor(
            targetWindow,
            "onbeforeunload",
          );
          if (!descriptor || descriptor.configurable) {
            // definePropertyが効いていない場合は直接クリア
            try {
              delete targetWindow.onbeforeunload;
            } catch (ex) {}
            targetWindow.onbeforeunload = null;
          }
        } catch (ex) {}

        clearCount++;
        if (clearCount >= maxClears) {
          clearInterval(clearerId);
        }
      }, 500);
    }

    log("Disabled beforeunload warning for window");
  } catch (e) {
    log("Error disabling beforeunload for window:", e?.message || e);
  }
}

/**
 * beforeunload警告を無効化する（現在のウィンドウとtop）
 */
function disableBeforeUnloadWarning() {
  // 現在のウィンドウ
  disableBeforeUnloadWarningForWindow(window);

  // window.topにも適用（フレーム内から呼ばれた場合）
  try {
    if (window.top && window.top !== window) {
      disableBeforeUnloadWarningForWindow(window.top);
    }
  } catch (e) {
    // クロスオリジンの場合はスキップ
  }
}

/**
 * 全フレームでbeforeunload警告を無効化
 */
function disableBeforeUnloadWarningInAllFrames() {
  try {
    // メインウィンドウとtop
    disableBeforeUnloadWarning();

    // 全てのフレームに適用
    const frameNames = [
      "webclass_title",
      "webclass_chapter",
      "webclass_content",
    ];
    frameNames.forEach((frameName) => {
      try {
        const frame = window.frames[frameName];
        if (frame) {
          // framesオブジェクトから直接アクセス（contentWindowを使わない）
          disableBeforeUnloadWarningForWindow(frame);
          log("Disabled beforeunload warning for frame:", frameName);
        }
      } catch (frameErr) {
        log(
          "Could not disable beforeunload for frame:",
          frameName,
          frameErr?.message || frameErr,
        );
      }
    });

    // 全てのframe/iframe要素にも適用
    try {
      const allFrameElements = document.querySelectorAll("frame, iframe");
      allFrameElements.forEach((el, idx) => {
        try {
          if (el.contentWindow) {
            disableBeforeUnloadWarningForWindow(el.contentWindow);
            log("Disabled beforeunload for frame element", idx);
          }
        } catch (e) {
          // クロスオリジンなど
        }
      });
    } catch (e) {
      // querySelectorAll失敗
    }
  } catch (e) {
    log("Error disabling beforeunload warnings:", e?.message || e);
  }
}

/**
 * リボン（ヘッダー）の表示切り替え
 * @param {boolean} show - 表示するかどうか
 */
function toggleRibbon(show) {
  const frameset = window.top.document.querySelector("frameset");
  if (!frameset) return;
  rememberUxOriginalAttributes(frameset);

  const topDoc = window.top.document;
  const tocOverlay = topDoc.getElementById("ux-toc-overlay-iframe");
  const tocResizeHandle = topDoc.getElementById("ux-toc-resize-handle");
  const loadingOverlay = topDoc.getElementById("ux-content-loading-overlay");
  const hoverZone = topDoc.getElementById("ux-toc-hover-zone");

  if (show) {
    // 表示 (55px)
    const rows = frameset.getAttribute("rows");
    if (rows) {
      frameset.setAttribute("rows", rows.replace(/^\d+/, "55"));
    }

    // 展開ボタンを削除
    removeFloatingExpandButton();

    // TOCオーバーレイの位置を調整（リボン分下に）
    if (tocOverlay) {
      tocOverlay.style.top = "55px";
      tocOverlay.style.height = "calc(100vh - 55px)";
    }
    if (tocResizeHandle) {
      tocResizeHandle.style.top = "55px";
      tocResizeHandle.style.height = "calc(100vh - 55px)";
    }
    if (loadingOverlay) {
      loadingOverlay.style.top = "55px";
    }
    if (hoverZone) {
      hoverZone.style.top = "55px";
      hoverZone.style.height = "calc(100vh - 55px)";
    }
  } else {
    // 非表示 (0px)
    const rows = frameset.getAttribute("rows");
    if (rows) {
      frameset.setAttribute("rows", rows.replace(/^\d+/, "0"));
    }

    // 展開ボタンを表示
    createFloatingExpandButton();

    // TOCオーバーレイの位置を調整（最上部から）
    if (tocOverlay) {
      tocOverlay.style.top = "0";
      tocOverlay.style.height = "100vh";
    }
    if (tocResizeHandle) {
      tocResizeHandle.style.top = "0";
      tocResizeHandle.style.height = "100vh";
    }
    if (loadingOverlay) {
      loadingOverlay.style.top = "0";
    }
    if (hoverZone) {
      hoverZone.style.top = "0";
      hoverZone.style.height = "100vh";
    }
  }
}

/**
 * フロート展開ボタンを作成・表示
 */
function createFloatingExpandButton() {
  const topDoc = window.top.document;
  ensureCourseColorTokens(topDoc);
  if (topDoc.getElementById("ux-ribbon-expand-btn")) return;

  const btn = topDoc.createElement("div");
  btn.id = "ux-ribbon-expand-btn";
  btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    `;
  btn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 48px;
        height: 48px;
        background: var(--ux-home-accent);
        color: var(--ux-home-surface);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 10000;
        transition: background 0.2s, transform 0.2s, box-shadow 0.2s;
        border: 1px solid rgba(10, 132, 255, 0.12);
        box-shadow: var(--ux-home-shadow-md);
        user-select: none;
        touch-action: none;
    `;
  btn.title = "リボンを表示";

  // ホバー効果
  btn.onmouseover = () => {
    btn.style.background = "var(--ux-home-accent-emphasis)";
    btn.style.boxShadow = "var(--ux-home-shadow-lg)";
    btn.style.transform = "scale(1.05)";
  };
  btn.onmouseout = () => {
    btn.style.background = "var(--ux-home-accent)";
    btn.style.boxShadow = "var(--ux-home-shadow-md)";
    btn.style.transform = "scale(1)";
  };

  // クリックでリボン表示
  btn.onclick = (e) => {
    if (btn.hasAttribute("data-dragged")) {
      btn.removeAttribute("data-dragged");
      return;
    }
    toggleRibbon(true);
  };

  // ドラッグ機能
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  const onMouseDown = (e) => {
    e.preventDefault(); // テキスト選択などを防止

    // タッチイベント対応
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);

    if (clientX === undefined || clientY === undefined) return;

    isDragging = true;
    startX = clientX;
    startY = clientY;

    const rect = btn.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    btn.style.bottom = "auto";
    btn.style.right = "auto";
    btn.style.left = initialLeft + "px";
    btn.style.top = initialTop + "px";
    btn.style.cursor = "grabbing";

    // イベントリスナーをdocumentに追加（フレーム外れ防止のためtopDocに）
    topDoc.addEventListener("mousemove", onMouseMove);
    topDoc.addEventListener("mouseup", onMouseUp);
    topDoc.addEventListener("touchmove", onMouseMove, { passive: false });
    topDoc.addEventListener("touchend", onMouseUp);
  };

  const onMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();

    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);

    if (clientX === undefined || clientY === undefined) return;

    const deltaX = clientX - startX;
    const deltaY = clientY - startY;

    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      btn.setAttribute("data-dragged", "true");
    }

    btn.style.left = initialLeft + deltaX + "px";
    btn.style.top = initialTop + deltaY + "px";
  };

  const onMouseUp = () => {
    isDragging = false;
    btn.style.cursor = "pointer";
    topDoc.removeEventListener("mousemove", onMouseMove);
    topDoc.removeEventListener("mouseup", onMouseUp);
    topDoc.removeEventListener("touchmove", onMouseMove);
    topDoc.removeEventListener("touchend", onMouseUp);

    // 画面外にはみ出さないように補正
    const rect = btn.getBoundingClientRect();
    const winWidth = window.top.innerWidth;
    const winHeight = window.top.innerHeight;

    let newLeft = rect.left;
    let newTop = rect.top;

    if (newLeft < 10) newLeft = 10;
    if (newLeft + rect.width > winWidth - 10)
      newLeft = winWidth - 10 - rect.width;
    if (newTop < 10) newTop = 10;
    if (newTop + rect.height > winHeight - 10)
      newTop = winHeight - 10 - rect.height;

    btn.style.left = newLeft + "px";
    btn.style.top = newTop + "px";
  };

  btn.addEventListener("mousedown", onMouseDown);
  btn.addEventListener("touchstart", onMouseDown, { passive: false });

  topDoc.documentElement.appendChild(btn);
}

/**
 * フロート展開ボタンを削除
 */
function removeFloatingExpandButton() {
  const topDoc = window.top.document;
  const btn = topDoc.getElementById("ux-ribbon-expand-btn");
  if (btn) {
    btn.remove();
  }
}

/**
 * フレームセット親のUI改善
 * トップリボンを削除し、新しいヘッダーを挿入
 */
function enhanceShiryouFrameset() {
  log("Enhancing shiryou frameset");
  rememberUxOriginalFrameStructure(document);

  // beforeunload警告を無効化（ページを閉じる・リロード時の警告を防止）
  disableBeforeUnloadWarning();
  // 各フレームが読み込まれた際にも警告を無効化
  window.addEventListener("load", () => {
    disableBeforeUnloadWarningInAllFrames();
  });

  // 親フレームから子フレーム（webclass_chapter）のonbeforeunloadを直接クリアする
  // ブラウザテストで手動クリアが成功したため、この方法を使用
  let clearCount = 0;
  const maxClears = 60; // 30秒間
  const chapterClearer = setInterval(() => {
    try {
      const chapterFrame = window.frames["webclass_chapter"];
      if (chapterFrame) {
        // chapterフレームのonbeforeunloadを直接クリア
        if (chapterFrame.onbeforeunload !== null) {
          log("Clearing webclass_chapter.onbeforeunload from parent frame");
          chapterFrame.onbeforeunload = null;
        }
      }
    } catch (e) {
      // クロスオリジンなど
    }

    clearCount++;
    if (clearCount >= maxClears) {
      clearInterval(chapterClearer);
      log("Stopped chapter frame beforeunload clearer after 30s");
    }
  }, 500);

  // 設定を読み込んでから実行
  chrome.storage.local.get(
    {
      tocInitialState: "open",
      tocInitialCloseDelay: "5",
      tocAutoHide: false,
      tocAutoHideDelay: "10",
      tocShowSectionTitles: true,
      tocHoverReveal: true,
      [UX_SHIRYOU_TOC_WIDTH_STORAGE_KEY]: UX_SHIRYOU_TOC_DEFAULT_WIDTH,
    },
    (options) => {
      // フレームセットの rows を変更 (上部フレームを55pxに変更してヘッダーとして使用)
      const framesets = document.querySelectorAll("frameset");

      framesets.forEach((fs) => {
        rememberUxOriginalAttributes(fs);
        rememberShiryouOriginalColsFallback(fs);
        const rows = fs.getAttribute("rows");
        if (rows) {
          // 55,* または他の行設定を 55,* に変更（ヘッダー用にサイズ調整）
          const newRows = rows.replace(/^\d+/, "55");
          fs.setAttribute("rows", newRows);
          log(
            "Adjusted title frame size for custom header:",
            rows,
            "->",
            newRows,
          );
        }

        // 内部のフレームセット（cols属性）をPDF全幅表示用に変更
        const cols = fs.getAttribute("cols");
        if (cols) {
          // 目次を非表示にしてPDFを全幅に（目次はiframeオーバーレイで表示）
          fs.setAttribute("cols", "0,*");
          log("Set PDF to full width, TOC will be shown as iframe overlay");
        }
      });

      // title_simple フレームを新しいヘッダーに変換
      // フレームの読み込みを待つために複数回試行
      let attempts = 0;
      const maxAttempts = 10;

      function tryInjectHeader() {
        attempts++;
        log("Attempting to inject header, attempt:", attempts);

        try {
          const titleFrame = window.frames["webclass_title"];
          if (titleFrame && titleFrame.document && titleFrame.document.body) {
            // 資料名を取得
            let contentName = "資料";
            let tocHtml = "";
            try {
              const chapterFrame = window.frames["webclass_chapter"];
              if (chapterFrame && chapterFrame.document) {
                const h2 = chapterFrame.document.querySelector("#WsTitle h2");
                if (h2) {
                  contentName = h2.textContent.trim();
                }
                const input = chapterFrame.document.querySelector(
                  'input[name="contents_name"]',
                );
                if (input && input.value) {
                  contentName = input.value;
                }
                // 目次の内容を取得
                const tocElement = chapterFrame.document.querySelector("#TOC");
                if (tocElement) {
                  tocHtml = tocElement.innerHTML;
                }
              }
            } catch (e) {
              log("Could not get content name from chapter frame");
            }

            // 現在のURLからset_contents_idを取得
            const urlParams = new URLSearchParams(window.location.search);
            const contentsId = urlParams.get("set_contents_id") || "";

            // title_simple フレームの内容を置換（目次オーバーレイ付き）
            createModernHeaderInFrame(
              titleFrame.document,
              contentName,
              contentsId,
              tocHtml,
              options,
            );
            log("Successfully injected modern header with TOC overlay");
            return;
          }
        } catch (e) {
          log("Could not access title frame:", e.message);
        }

        // まだ成功していない場合は再試行
        if (attempts < maxAttempts) {
          setTimeout(tryInjectHeader, 300);
        } else {
          log("Failed to inject header after", maxAttempts, "attempts");
        }
      }

      // 最初の試行を少し遅延させてフレームの読み込みを待つ
      setTimeout(tryInjectHeader, 500);
    },
  );
}

/**
 * フレーム内にモダンなヘッダーを作成（目次オーバーレイ付き）
 */
function createModernHeaderInFrame(
  doc,
  contentName,
  contentsId,
  tocHtml = "",
  options = {},
) {
  // 設定値
  const tocInitialState = options.tocInitialState || "open";
  const tocInitialCloseDelay = parseInt(
    options.tocInitialCloseDelay || "5",
    10,
  );
  const tocAutoHide = options.tocAutoHide || false;
  const tocAutoHideDelay = parseInt(options.tocAutoHideDelay || "10", 10);
  const tocShowSectionTitles =
    options.tocShowSectionTitles !== undefined
      ? options.tocShowSectionTitles
      : true;
  const topDoc = window.top.document;
  const getTocViewportWidth = () => {
    const docEl = topDoc.documentElement;
    return (
      docEl?.clientWidth ||
      topDoc.defaultView?.innerWidth ||
      window.top?.innerWidth ||
      UX_SHIRYOU_TOC_DEFAULT_WIDTH
    );
  };
  const clampTocWidth = (value) => {
    const viewportWidth = getTocViewportWidth();
    const raw = Number.parseInt(value, 10);
    const fallback = UX_SHIRYOU_TOC_DEFAULT_WIDTH;
    const desired = Number.isFinite(raw) ? raw : fallback;
    const viewportMax = Math.max(
      UX_SHIRYOU_TOC_MIN_WIDTH,
      Math.min(
        UX_SHIRYOU_TOC_MAX_WIDTH,
        Math.floor(viewportWidth * 0.9),
        viewportWidth - 280,
      ),
    );
    return Math.max(
      UX_SHIRYOU_TOC_MIN_WIDTH,
      Math.min(desired, viewportMax),
    );
  };
  let tocWidthPx = clampTocWidth(
    options[UX_SHIRYOU_TOC_WIDTH_STORAGE_KEY] || UX_SHIRYOU_TOC_DEFAULT_WIDTH,
  );

  // フレームの内容を完全に置換
  ensureCourseColorTokens(doc);
  rememberUxOriginalBodyState(doc);
  doc.body.innerHTML = "";
  doc.body.style.cssText =
    "margin: 0; padding: 0; overflow: hidden; background: var(--ux-home-page-bg);";

  // 目次オーバーレイ用のiframeを作成（フレームセットの制約を回避）
  ensureCourseColorTokens(topDoc);

  // ============================================================
  // Shiryou: 目次クリック時の白フラッシュ抑制（コンテンツ読み込みオーバーレイ）
  // ============================================================
  // 目次からページ切替を行うと webclass_content フレームがリロードされるため、
  // ロード中に一瞬白背景が見えてフラッシュのようになる。上にオーバーレイを被せて隠す。
  // グローバルなシーケンス番号を使用して、複数の呼び出し元からの競合を防ぐ
  if (!topDoc.__uxOverlayState) {
    topDoc.__uxOverlayState = {
      navSeq: 0,
      shownAt: 0,
      hideTimer: null,
      indicatorTimer: null,
    };
  }
  const uxState = topDoc.__uxOverlayState;

  function getOrCreateUxContentLoadingOverlay() {
    const overlayId = "ux-content-loading-overlay";
    let overlay = topDoc.getElementById(overlayId);
    if (overlay) return overlay;

    overlay = topDoc.createElement("div");
    overlay.id = overlayId;
    overlay.style.cssText = `
            position: fixed;
            top: 55px;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 9998;
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            background: rgba(245, 245, 247, 0.94);
            transition: opacity 120ms ease-out;
            will-change: opacity;
            backdrop-filter: blur(6px);
        `;

    const style = topDoc.createElement("style");
    style.textContent = `
            @keyframes uxspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `;

    const inner = topDoc.createElement("div");
    inner.id = "ux-loading-indicator";
    inner.style.cssText = `
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            font-family: 'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif;
            color: var(--ux-home-label);
            font-size: 14px;
            opacity: 0;
            transition: opacity 120ms ease;
        `;
    inner.innerHTML = `
            <div style="width:18px;height:18px;border:2px solid var(--ux-home-accent-soft);border-top-color:var(--ux-home-accent);border-radius:50%;animation:uxspin 0.8s linear infinite;"></div>
            <div>読み込み中…</div>
        `;

    overlay.appendChild(style);
    overlay.appendChild(inner);
    topDoc.documentElement.appendChild(overlay);
    return overlay;
  }

  function showUxContentLoadingOverlay(seq, expectsPdf = true) {
    // 非PDFページは点滅の原因になりやすいので基本出さない（判定不能なら expectsPdf=true）
    if (!expectsPdf) return;
    const overlay = getOrCreateUxContentLoadingOverlay();
    if (uxState.hideTimer) {
      clearTimeout(uxState.hideTimer);
      uxState.hideTimer = null;
    }

    const wasHidden =
      overlay.style.visibility !== "visible" || overlay.style.opacity === "0";
    // 即座に表示（トランジションなしで不透明に）
    overlay.style.transition = "none";
    overlay.style.visibility = "visible";
    overlay.style.opacity = "1";
    // 次フレームでトランジションを復活（非表示時のフェードアウト用）
    requestAnimationFrame(() => {
      overlay.style.transition = "opacity 120ms ease-out";
    });
    if (wasHidden) {
      uxState.shownAt =
        typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now();
    }

    // 速い遷移だとインジケータが点滅して見えるので、一定時間経ってまだロード中のときだけ出す
    const indicator = overlay.querySelector("#ux-loading-indicator");
    if (indicator) {
      indicator.style.opacity = "0";
      if (uxState.indicatorTimer) clearTimeout(uxState.indicatorTimer);
      uxState.indicatorTimer = setTimeout(() => {
        if (seq === uxState.navSeq) {
          indicator.style.opacity = "1";
        }
      }, 220);
    }
  }

  function hideUxContentLoadingOverlay(seq) {
    const overlay = topDoc.getElementById("ux-content-loading-overlay");
    if (!overlay) return;
    if (seq !== uxState.navSeq) return;

    if (uxState.indicatorTimer) {
      clearTimeout(uxState.indicatorTimer);
      uxState.indicatorTimer = null;
    }
    const indicator = overlay.querySelector("#ux-loading-indicator");
    if (indicator) indicator.style.opacity = "0";

    // すぐ消すと点滅に見えるので最小表示時間を確保
    const now =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
    const elapsed = uxState.shownAt ? now - uxState.shownAt : 9999;
    const minVisibleMs = 150;
    const delay = Math.max(0, minVisibleMs - elapsed);

    if (uxState.hideTimer) clearTimeout(uxState.hideTimer);
    uxState.hideTimer = setTimeout(() => {
      if (seq !== uxState.navSeq) return;
      overlay.style.opacity = "0";
      setTimeout(() => {
        if (seq === uxState.navSeq && overlay.style.opacity === "0") {
          overlay.style.visibility = "hidden";
        }
      }, 150);
    }, delay);
  }

  function attachUxContentFrameLoadHandler(seq, expectsPdf = true) {
    const frameEl = topDoc.querySelector(
      'frame[name="webclass_content"], iframe[name="webclass_content"]',
    );
    if (!frameEl) {
      // 見つからない場合でも、オーバーレイが残りっぱなしにならないようにする
      setTimeout(() => {
        if (seq === uxState.navSeq) hideUxContentLoadingOverlay(seq);
      }, 800);
      return;
    }

    const onLoad = () => {
      // 最新のナビゲーションだけ反映
      if (seq !== uxState.navSeq) return;

      // PDFビューア（pdf.js）はロード直後に真っ白になりやすいので、描画が始まるまで少し待つ
      waitForUxPdfViewerRender(seq, expectsPdf).finally(() => {
        if (seq === uxState.navSeq) hideUxContentLoadingOverlay(seq);
      });
    };

    try {
      frameEl.addEventListener("load", onLoad, { once: true });
    } catch (e) {
      frameEl.onload = onLoad;
    }

    // 念のため: 読み込み失敗/イベント未取得でも一定時間で消す
    setTimeout(() => {
      if (seq === uxState.navSeq) hideUxContentLoadingOverlay(seq);
    }, 12000);
  }

  function waitForUxPdfViewerRender(seq, expectsPdf = true, timeoutMs = 9000) {
    return new Promise((resolve) => {
      const start = Date.now();

      function isCanvasDrawn(canvas) {
        try {
          if (!canvas) return false;
          // PDF.jsはcanvasに描画する際に適切なサイズを設定するため、
          // サイズチェックのみで描画状態を判定する（getImageData警告を回避）
          const w = canvas.width || 0;
          const h = canvas.height || 0;
          // 有効なサイズ（100x100以上）であれば描画済みとみなす
          return w >= 100 && h >= 100;
        } catch (e) {
          // 読めない場合（稀）でも、いつまでも待たないようにする
          return Date.now() - start > 1200;
        }
      }

      const tick = () => {
        if (seq !== uxState.navSeq) return resolve();

        try {
          const contentWin = window.top.frames["webclass_content"];
          if (!contentWin) return resolve();

          // 非PDFページなら待ちを短くしてすぐ復帰（点滅抑制）
          let looksLikePdf = expectsPdf;
          try {
            const href = contentWin.location?.href || "";
            if (
              href.includes("loadit.php") ||
              /\.pdf(\b|$|[&#?])/i.test(href)
            ) {
              looksLikePdf = true;
            }
          } catch (_) {}

          const docCandidates = [];
          try {
            docCandidates.push(contentWin.document);
          } catch (_) {}

          // contentWin配下のiframe/frameも覗く（txtbk_show_text が frameset の場合がある）
          try {
            const nested =
              contentWin.document?.querySelectorAll?.("iframe, frame") || [];
            nested.forEach((el) => {
              try {
                const d = el.contentDocument || el.contentWindow?.document;
                if (d) docCandidates.push(d);
              } catch (_) {}
            });
          } catch (_) {}

          let foundViewer = false;
          for (const d of docCandidates) {
            if (!d) continue;
            const viewerContainer =
              d.getElementById("viewerContainer") || d.getElementById("viewer");
            if (!viewerContainer) continue;

            foundViewer = true;
            // pdf.js は canvas が実際に描画されてから解除（空canvasの段階だと白/点滅が出やすい）
            const canvases = viewerContainer.querySelectorAll("canvas");
            for (const canvas of canvases) {
              if (isCanvasDrawn(canvas)) {
                return resolve();
              }
            }
          }

          // PDFページでなさそうなら早めに消す（点滅防止）
          if (!looksLikePdf && !foundViewer && Date.now() - start > 180) {
            return resolve();
          }
        } catch (_) {
          return resolve();
        }

        if (Date.now() - start >= timeoutMs) return resolve();
        setTimeout(tick, 120);
      };

      tick();
    });
  }

  const header = doc.createElement("div");
  header.id = "ux-shiryou-header";
  header.style.cssText = `
        height: 55px;
        background: var(--ux-home-surface);
        color: var(--ux-home-label);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 20px;
        border-bottom: 1px solid var(--ux-home-separator);
        box-shadow: var(--ux-home-shadow-sm);
        font-family: 'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif;
        box-sizing: border-box;
    `;

  // 左側: 閉じるボタン + 目次トグルボタン
  const leftDiv = doc.createElement("div");
  leftDiv.style.cssText = "display: flex; align-items: center; gap: 10px;";

  const closeBtn = doc.createElement("button");
  closeBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
        閉じる
    `;
  closeBtn.style.cssText = `
        display: flex;
        align-items: center;
        padding: 8px 16px;
        border: 1px solid var(--ux-home-separator);
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        background: var(--ux-home-surface-soft);
        color: var(--ux-home-accent-emphasis);
        transition: all 0.2s ease;
    `;
  closeBtn.onmouseover = () => {
    closeBtn.style.background = "var(--ux-home-accent-softer)";
    closeBtn.style.color = "var(--ux-home-accent-emphasis)";
  };
  closeBtn.onmouseout = () => {
    closeBtn.style.background = "var(--ux-home-surface-soft)";
    closeBtn.style.color = "var(--ux-home-accent-emphasis)";
  };
  closeBtn.onclick = () => {
    // Prefer WebClass's quit flow to avoid beforeunload warnings.
    try {
      if (window.top && typeof window.top.quitContents === "function") {
        window.top.quitContents();
        return;
      }
    } catch (e) {
      // Ignore and fall back.
    }

    try {
      const chapterFrame =
        window.top.frames && window.top.frames["webclass_chapter"];
      if (chapterFrame) {
        if (typeof chapterFrame.quit === "function") {
          chapterFrame.quit();
          return;
        }
        if (
          chapterFrame.document &&
          chapterFrame.document.app &&
          typeof chapterFrame.document.app.quit === "function"
        ) {
          chapterFrame.document.app.quit();
          return;
        }
        const menu = chapterFrame.document && chapterFrame.document.menu;
        if (menu && menu.sendCmd) {
          menu.sendCmd.value = "quit";
          menu.submit();
          return;
        }
        const quitBtn =
          chapterFrame.document &&
          chapterFrame.document.querySelector(
            'input[name="quit"], input[value="資料を閉じる"]',
          );
        if (quitBtn) {
          quitBtn.click();
          return;
        }
      }
    } catch (e) {
      // Ignore and fall back.
    }

    if (contentsId) {
      window.top.location.href =
        "do_contents.php?set_contents_id=" + contentsId;
    } else {
      window.top.history.back();
    }
  };
  leftDiv.appendChild(closeBtn);

  // 目次オーバーレイ用のiframeを作成
  // 既存のオーバーレイを削除
  const existingOverlay = topDoc.getElementById("ux-toc-overlay-iframe");
  if (existingOverlay) {
    existingOverlay.remove();
  }
  const existingResizeHandle = topDoc.getElementById("ux-toc-resize-handle");
  if (existingResizeHandle) {
    existingResizeHandle.remove();
  }
  const existingResizeShield = topDoc.getElementById("ux-toc-resize-shield");
  if (existingResizeShield) {
    existingResizeShield.remove();
  }

  const tocOverlayIframe = topDoc.createElement("iframe");
  tocOverlayIframe.id = "ux-toc-overlay-iframe";
  tocOverlayIframe.style.cssText = `
        position: fixed;
        top: 55px;
        left: 0;
        width: ${tocWidthPx}px;
        height: calc(100vh - 55px);
        border: none;
        z-index: 9999;
        display: block;
        background: transparent;
        transform: translateX(0);
        transition: width 0.3s ease, transform 0.3s ease;
    `;

  // iframeを親ドキュメントに追加
  topDoc.documentElement.appendChild(tocOverlayIframe);

  if (!topDoc.getElementById("ux-shiryou-toc-resize-style")) {
    const resizeStyle = markUxCourseStyle(topDoc.createElement("style"));
    resizeStyle.id = "ux-shiryou-toc-resize-style";
    resizeStyle.textContent = `
            #ux-toc-resize-handle {
                position: fixed;
                top: 55px;
                left: ${tocWidthPx - 5}px;
                width: 10px;
                height: calc(100vh - 55px);
                z-index: 10000;
                display: none;
                cursor: col-resize;
                touch-action: none;
                transform: translateX(-${tocWidthPx}px);
                transition: transform 0.3s ease, background 0.15s ease;
            }
            #ux-toc-resize-handle::before {
                content: "";
                position: absolute;
                top: 0;
                bottom: 0;
                left: 4px;
                width: 2px;
                background: var(--ux-home-separator-strong);
                box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.65);
            }
            #ux-toc-resize-handle:hover::before,
            #ux-toc-resize-handle:focus-visible::before,
            html.ux-shiryou-toc-resizing #ux-toc-resize-handle::before {
                width: 3px;
                left: 3px;
                background: var(--ux-home-accent);
                box-shadow: var(--ux-home-focus-ring);
            }
            html.ux-shiryou-toc-resizing,
            html.ux-shiryou-toc-resizing * {
                cursor: col-resize !important;
                user-select: none !important;
            }
        `;
    (topDoc.head || topDoc.documentElement).appendChild(resizeStyle);
  }

  const tocResizeHandle = topDoc.createElement("div");
  tocResizeHandle.id = "ux-toc-resize-handle";
  tocResizeHandle.setAttribute("role", "separator");
  tocResizeHandle.setAttribute("aria-orientation", "vertical");
  tocResizeHandle.setAttribute("aria-label", "目次の幅を変更");
  tocResizeHandle.tabIndex = 0;
  topDoc.documentElement.appendChild(tocResizeHandle);

  const tocResizeShield = topDoc.createElement("div");
  tocResizeShield.id = "ux-toc-resize-shield";
  tocResizeShield.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 10001;
        display: none;
        cursor: col-resize;
        background: transparent;
        touch-action: none;
    `;
  topDoc.documentElement.appendChild(tocResizeShield);

  // ホバー表示用の透明ゾーンを作成（設定で有効な場合のみ）
  const tocHoverReveal =
    options.tocHoverReveal !== undefined ? options.tocHoverReveal : true;
  let hoverRevealZone = null;

  if (tocHoverReveal) {
    // 既存のホバーゾーンを削除
    const existingHoverZone = topDoc.getElementById("ux-toc-hover-zone");
    if (existingHoverZone) {
      existingHoverZone.remove();
    }

    hoverRevealZone = topDoc.createElement("div");
    hoverRevealZone.id = "ux-toc-hover-zone";
    hoverRevealZone.style.cssText = `
            position: fixed;
            top: 55px;
            left: 0;
            width: 8px;
            height: calc(100vh - 55px);
            background: transparent;
            z-index: 9997;
            cursor: pointer;
            display: block;
        `;
    hoverRevealZone.title = "目次を表示";

    // ホバー時に目次を開く
    hoverRevealZone.addEventListener("mouseenter", () => {
      if (!tocVisible) {
        openToc();
      }
    });

    topDoc.documentElement.appendChild(hoverRevealZone);
  }

  // 初期表示時に節タイトル（第○節など）をコンパクトな番号バッジにする処理
  let processedTocHtml = tocHtml;
  if (tocHtml) {
    // 一時的なDOMを作成して変換
    const tempDiv = topDoc.createElement("div");
    tempDiv.innerHTML = tocHtml;
    compactUxSectionLabels(tempDiv);
    processedTocHtml = tempDiv.innerHTML;
  }

  // iframeの内容を設定
  const iframeDoc =
    tocOverlayIframe.contentDocument || tocOverlayIframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                * { box-sizing: border-box; }
                body {
                    margin: 0;
                    padding: 8px 7px;
                    font-family: 'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif;
                    background: var(--ux-home-surface);
                    color: var(--ux-home-label);
                    height: 100vh;
                    overflow-y: auto;
                    border-right: 1px solid var(--ux-home-separator);
                    box-shadow: var(--ux-home-shadow-md);
                }
                body.ux-toc-collapsed {
                    overflow-x: hidden;
                    box-shadow: var(--ux-home-shadow-sm);
                }
                .header {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    position: relative;
                    height: 41px;
                    margin-bottom: 6px;
                    padding-bottom: 6px;
                    border-bottom: 1px solid var(--ux-home-separator);
                }
                body.ux-toc-collapsed .header {
                    justify-content: center;
                }
                .header h3 {
                    margin: 0;
                    padding: 0 40px;
                    font-size: 1.1rem;
                    font-weight: 600;
                    color: var(--ux-home-label);
                }
                body.ux-toc-collapsed .header h3 {
                    display: none;
                }
                .toc-frame-toggle-btn {
                    background: var(--ux-home-surface-soft);
                    border: 1px solid var(--ux-home-separator);
                    color: var(--ux-home-accent-emphasis);
                    width: 34px;
                    height: 34px;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: absolute;
                    top: 0;
                    left: 0;
                    padding: 0;
                    transition: all 0.2s;
                }
                .toc-frame-toggle-btn:hover {
                    background: var(--ux-home-accent-softer);
                    color: var(--ux-home-accent-emphasis);
                }
                .toc-frame-toggle-btn:focus-visible {
                    outline: 3px solid rgba(10, 132, 255, 0.18);
                    outline-offset: 2px;
                }
                .toc-frame-toggle-btn svg {
                    width: 17px;
                    height: 17px;
                    transition: transform 0.2s ease;
                }
                body.ux-toc-collapsed .toc-frame-toggle-btn svg {
                    transform: rotate(180deg);
                }
                #toc-content table {
                    width: 100%;
                    min-width: var(--ux-toc-open-content-width, 336px);
                    border-collapse: separate;
                    border-spacing: 0;
                }
                #toc-content tr {
                    height: 45px;
                    transition: background 0.2s;
                }
                #toc-content tr.ux-toc-page-row {
                    cursor: pointer;
                }
                #toc-content tr:hover,
                #toc-content tr.ux-toc-page-row:focus-visible {
                    background: var(--ux-home-accent-softer);
                }
                #toc-content tr.ux-toc-page-row:focus-visible {
                    outline: 3px solid rgba(10, 132, 255, 0.18);
                    outline-offset: -3px;
                }
                #toc-content td {
                    height: 45px;
                    padding: 5px 8px;
                    vertical-align: middle;
                    border-bottom: 1px solid var(--ux-home-separator);
                }
                #toc-content span {
                    color: var(--ux-home-label) !important;
                }
                #toc-content input[type="button"] {
                    background: var(--ux-home-accent);
                    color: var(--ux-home-surface);
                    border: none;
                    border-radius: 4px;
                    padding: 6px 12px;
                    cursor: pointer;
                    font-size: 0.85rem;
                    transition: all 0.2s;
                }
                #toc-content input[type="button"]:hover {
                    background: var(--ux-home-accent-emphasis);
                }
                #toc-content input[name="clickpage"] {
                    display: none !important;
                }
                #toc-content a[href*="file_down.php"] {
                    display: none !important;
                }
                /* ダウンロードボタンは表示する */
                .ux-inline-download-options {
                    display: inline-flex !important;
                    gap: 4px;
                    margin-left: 8px;
                }
                .ux-download-btn {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    background: var(--ux-home-surface-soft) !important;
                    color: var(--ux-home-accent-emphasis) !important;
                    border: none !important;
                    border-radius: 4px !important;
                    min-width: 30px !important;
                    min-height: 30px !important;
                    padding: 5px !important;
                    font-size: 0.75rem !important;
                    cursor: pointer !important;
                    transition: all 0.2s !important;
                }
                .ux-download-btn svg {
                    width: 17px !important;
                    height: 17px !important;
                    flex: 0 0 auto !important;
                }
                .ux-download-btn:hover {
                    background: var(--ux-home-accent-softer) !important;
                    color: var(--ux-home-accent-emphasis) !important;
                }
                ::-webkit-scrollbar { width: 8px; }
                ::-webkit-scrollbar-track { background: var(--ux-home-surface-soft); }
                ::-webkit-scrollbar-thumb { background: var(--ux-home-fill-strong); border-radius: 4px; }
                .ux-section-number-badge {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    min-width: 34px !important;
                    width: 34px !important;
                    height: 34px !important;
                    padding: 0 !important;
                    margin-right: 0.35rem !important;
                    border-radius: 8px !important;
                    background: var(--ux-home-surface-soft) !important;
                    border: 1px solid var(--ux-home-separator) !important;
                    color: var(--ux-home-accent-emphasis) !important;
                    font-size: 0.78rem !important;
                    font-weight: 700 !important;
                    line-height: 1 !important;
                    box-shadow: var(--ux-home-shadow-sm) !important;
                }
                body.ux-toc-collapsed #toc-content table,
                body.ux-toc-collapsed #toc-content tbody {
                    display: block;
                    width: 100%;
                    min-width: 0;
                }
                body.ux-toc-collapsed #toc-content tr {
                    display: none;
                    border-bottom: 0;
                }
                body.ux-toc-collapsed #toc-content tr:has(.ux-section-number-badge) {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 45px;
                    min-height: 45px;
                    margin: 0;
                    border-radius: 8px;
                }
                body.ux-toc-collapsed #toc-content td {
                    display: none;
                    padding: 0 !important;
                    border-bottom: 0 !important;
                }
                body.ux-toc-collapsed #toc-content td:has(.ux-section-number-badge) {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    color: transparent !important;
                    font-size: 0 !important;
                }
                body.ux-toc-collapsed #toc-content td:has(.ux-section-number-badge) > :not(.ux-section-number-badge),
                body.ux-toc-collapsed .ux-inline-download-options,
                body.ux-toc-collapsed .ux-download-btn {
                    display: none !important;
                }
                body.ux-toc-collapsed .ux-section-number-badge {
                    min-width: 34px !important;
                    width: 34px !important;
                    height: 34px !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    border-radius: 8px !important;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h3>目次</h3>
                <button class="toc-frame-toggle-btn" id="toc-frame-toggle-btn" type="button" aria-label="目次を開く" aria-expanded="false" title="目次を開く">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </button>
            </div>
            <div id="toc-content">
                ${processedTocHtml || '<p style="text-align: center; padding: 20px;">目次を読み込み中...</p>'}
            </div>
        </body>
        </html>
    `);
  iframeDoc.close();
  ensureCourseColorTokens(iframeDoc);
  iframeDoc.body?.classList.add("ux-toc-collapsed");
  const tocToggleBtn = iframeDoc.getElementById("toc-frame-toggle-btn");

  // iframeへの参照を保持（後でアクセスするため）
  let tocCloseSetup = false;

  // TOC更新イベントのリスナー
  doc.addEventListener("ux-toc-needs-update", () => {
    log("Received ux-toc-needs-update event");
    updateTocContent(iframeDoc);
  });

  // 目次の表示/非表示状態を追跡
  let tocVisible = false;
  let initialCloseTimer = null;
  let autoHideTimer = null;
  setupTocResizeHandle();
  applyTocWidth(tocWidthPx, { updateFrameset: false });

  // オートハイドタイマー開始（操作がない場合、一定時間後に閉じる）
  function startAutoHideTimer() {
    if (!tocAutoHide) return;
    stopAutoHideTimer();

    // iframeにマウスが乗っている場合はタイマーを開始しない
    // (ただし、iframe外から呼ばれた場合は開始する)

    autoHideTimer = setTimeout(() => {
      if (tocVisible) {
        closeToc();
      }
    }, tocAutoHideDelay * 1000);
  }

  // オートハイドタイマー停止
  function stopAutoHideTimer() {
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
  }

  // フレームセットのcolsをアニメーション
  // @param {number} targetValue - 目標のcols値（ピクセル）
  // @param {number} duration - アニメーション時間（ミリ秒）
  function getTocTargetFrameset() {
    const framesets = window.top.document.querySelectorAll("frameset");
    for (const fs of framesets) {
      if (fs.getAttribute("cols")) {
        return fs;
      }
    }
    return null;
  }

  function applyTocWidth(width, { updateFrameset = true } = {}) {
    tocWidthPx = clampTocWidth(width);
    const openContentWidth = Math.max(0, tocWidthPx - 14);
    iframeDoc.documentElement?.style.setProperty(
      "--ux-toc-open-content-width",
      `${openContentWidth}px`,
    );
    const displayWidth = tocVisible
      ? tocWidthPx
      : UX_SHIRYOU_TOC_COLLAPSED_WIDTH;
    tocOverlayIframe.style.width = `${displayWidth}px`;
    tocResizeHandle.style.left = `${tocWidthPx - 5}px`;
    tocResizeHandle.setAttribute("aria-valuenow", String(tocWidthPx));
    tocResizeHandle.setAttribute(
      "aria-valuemin",
      String(UX_SHIRYOU_TOC_MIN_WIDTH),
    );
    tocResizeHandle.setAttribute(
      "aria-valuemax",
      String(Math.max(tocWidthPx, clampTocWidth(UX_SHIRYOU_TOC_MAX_WIDTH))),
    );
    if (tocVisible) {
      tocResizeHandle.style.display = "block";
      tocResizeHandle.style.transform = "translateX(0)";
      if (updateFrameset && !isShiryouOriginDisplayActive(topDoc)) {
        const targetFrameset = getTocTargetFrameset();
        if (targetFrameset) {
          targetFrameset.setAttribute("cols", `${tocWidthPx},*`);
        }
      }
    } else {
      tocResizeHandle.style.display = "none";
      tocResizeHandle.style.transform = "translateX(0)";
    }
  }

  function setTocCollapsedMode(collapsed) {
    try {
      iframeDoc.body?.classList.toggle("ux-toc-collapsed", !!collapsed);
    } catch (_) {}
    if (tocToggleBtn) {
      tocToggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      tocToggleBtn.setAttribute(
        "aria-label",
        collapsed ? "目次を開く" : "目次を閉じる",
      );
      tocToggleBtn.title = collapsed ? "目次を開く" : "目次を閉じる";
    }
    tocOverlayIframe.setAttribute(
      "aria-label",
      collapsed ? "目次（節番号のみ）" : "目次",
    );
    tocOverlayIframe.title = collapsed ? "節番号をクリックして移動" : "目次";
  }

  function persistTocWidth() {
    try {
      chrome.storage.local.set({
        [UX_SHIRYOU_TOC_WIDTH_STORAGE_KEY]: tocWidthPx,
      });
    } catch {
      // ignore storage failures
    }
  }

  function animateFramesetCols(targetValue, duration = 300) {
    if (isShiryouOriginDisplayActive(topDoc)) return;

    // cols属性を持つフレームセット（ネストされたもの）を取得
    const targetFrameset = getTocTargetFrameset();
    if (!targetFrameset) return;

    const cols = targetFrameset.getAttribute("cols") || "0,*";
    const currentValue = parseInt(cols.split(",")[0]) || 0;
    const startTime = performance.now();
    const diff = targetValue - currentValue;

    if (diff === 0) return;

    function step(timestamp) {
      if (isShiryouOriginDisplayActive(topDoc)) return;

      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const newValue = Math.round(currentValue + diff * eased);
      targetFrameset.setAttribute("cols", `${newValue},*`);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  function setupTocResizeHandle() {
    let dragState = null;

    const getClientX = (event) => {
      if (event.touches && event.touches[0]) return event.touches[0].clientX;
      if (event.changedTouches && event.changedTouches[0]) {
        return event.changedTouches[0].clientX;
      }
      return event.clientX;
    };

    const beginDrag = (event) => {
      if (!tocVisible) return;
      event.preventDefault();
      dragState = {
        startX: getClientX(event),
        startWidth: tocWidthPx,
      };
      tocOverlayIframe.style.transition = "none";
      tocResizeHandle.style.transition = "background 0.15s ease";
      tocResizeShield.style.display = "block";
      topDoc.documentElement.classList.add("ux-shiryou-toc-resizing");
      topDoc.addEventListener("mousemove", onDragMove, true);
      topDoc.addEventListener("mouseup", endDrag, true);
      topDoc.addEventListener("touchmove", onDragMove, {
        capture: true,
        passive: false,
      });
      topDoc.addEventListener("touchend", endDrag, true);
      topDoc.addEventListener("touchcancel", endDrag, true);
    };

    const onDragMove = (event) => {
      if (!dragState) return;
      event.preventDefault();
      const nextWidth =
        dragState.startWidth + (getClientX(event) - dragState.startX);
      applyTocWidth(nextWidth);
    };

    const endDrag = () => {
      if (!dragState) return;
      dragState = null;
      topDoc.documentElement.classList.remove("ux-shiryou-toc-resizing");
      tocResizeShield.style.display = "none";
      tocOverlayIframe.style.transition = "transform 0.3s ease";
      tocResizeHandle.style.transition =
        "transform 0.3s ease, background 0.15s ease";
      topDoc.removeEventListener("mousemove", onDragMove, true);
      topDoc.removeEventListener("mouseup", endDrag, true);
      topDoc.removeEventListener("touchmove", onDragMove, true);
      topDoc.removeEventListener("touchend", endDrag, true);
      topDoc.removeEventListener("touchcancel", endDrag, true);
      applyTocWidth(tocWidthPx);
      persistTocWidth();
    };

    tocResizeHandle.addEventListener("mousedown", beginDrag);
    tocResizeHandle.addEventListener("touchstart", beginDrag, {
      passive: false,
    });
    tocResizeHandle.addEventListener("keydown", (event) => {
      if (!tocVisible) return;
      const step = event.shiftKey ? 40 : 16;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        applyTocWidth(tocWidthPx - step);
        persistTocWidth();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        applyTocWidth(tocWidthPx + step);
        persistTocWidth();
      } else if (event.key === "Home") {
        event.preventDefault();
        applyTocWidth(UX_SHIRYOU_TOC_MIN_WIDTH);
        persistTocWidth();
      } else if (event.key === "End") {
        event.preventDefault();
        applyTocWidth(UX_SHIRYOU_TOC_MAX_WIDTH);
        persistTocWidth();
      }
    });
  }

  // 目次を閉じる関数
  function closeToc() {
    tocVisible = false;
    setTocCollapsedMode(true);
    tocOverlayIframe.style.display = "block";
    tocOverlayIframe.style.transform = "translateX(0)";
    applyTocWidth(tocWidthPx, { updateFrameset: false });

    // 閉じた状態でも節番号レール分だけ幅を残す
    animateFramesetCols(UX_SHIRYOU_TOC_COLLAPSED_WIDTH, 300);

    // タイマー類をクリア
    if (initialCloseTimer) {
      clearTimeout(initialCloseTimer);
      initialCloseTimer = null;
    }
    stopAutoHideTimer();

    // ホバーゾーンを表示
    if (hoverRevealZone) {
      hoverRevealZone.style.display = "block";
    }
  }

  // 目次を開く関数
  function openToc(isInitial = false) {
    tocVisible = true;
    // まずdisplayをblockにして、次フレームでtransformを解除（スライドインアニメーション）
    tocOverlayIframe.style.display = "block";
    setTocCollapsedMode(false);
    applyTocWidth(tocWidthPx, { updateFrameset: false });
    // 強制的にレイアウトを再計算させてからアニメーション開始
    void tocOverlayIframe.offsetWidth;
    tocOverlayIframe.style.transform = "translateX(0)";
    tocResizeHandle.style.transform = "translateX(0)";

    // フレームセットのcolsをアニメーション（目次分PDFビューワーを縮小）
    animateFramesetCols(tocWidthPx, 300);

    // ホバーゾーンを非表示
    if (hoverRevealZone) {
      hoverRevealZone.style.display = "none";
    }

    const iframeDoc =
      tocOverlayIframe.contentDocument ||
      tocOverlayIframe.contentWindow.document;

    if (!tocCloseSetup) {
      // オートハイド用のイベント設定
      if (tocAutoHide || tocInitialCloseDelay > 0) {
        // マウスが入ったらタイマーキャンセル（ユーザーが操作しようとしている）
        iframeDoc.body.addEventListener("mouseenter", () => {
          // 初期表示タイマーキャンセル
          if (initialCloseTimer) {
            clearTimeout(initialCloseTimer);
            initialCloseTimer = null;
            log("Initial close timer cancelled by user interaction");
          }

          // オートハイドタイマーキャンセル
          stopAutoHideTimer();
        });

        // マウスが出たらオートハイドタイマー開始（設定されている場合）
        iframeDoc.body.addEventListener("mouseleave", () => {
          if (tocAutoHide) {
            startAutoHideTimer();
          }
        });
      }

      tocCloseSetup = true;
    }

    // 目次の内容を最新に更新
    updateTocContent(iframeDoc);

    // 初期表示の場合の自動クローズ処理
    if (isInitial && tocInitialCloseDelay > 0) {
      initialCloseTimer = setTimeout(() => {
        if (tocVisible) {
          closeToc();
        }
      }, tocInitialCloseDelay * 1000);
    }
    // 通常表示（手動）かつオートハイド有効の場合
    else if (!isInitial && tocAutoHide) {
      // 開いた直後もタイマー開始（マウスが入るまでの間）
      startAutoHideTimer();
    }
  }

  function navigateToTocPage(pageNum, event = null) {
    if (!pageNum) return;
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    uxDebugLog("[WebClass UX] Navigating to page:", pageNum);

    // 白フラッシュ抑制: PDFページのみオーバーレイを出して、描画完了で消す（点滅防止）
    const seq = ++uxState.navSeq;
    let expectsPdf = true;
    try {
      const chapterFrame = window.top.frames["webclass_chapter"];
      const jsonData =
        chapterFrame && chapterFrame.document
          ? chapterFrame.document.querySelector("#json-data")
          : null;
      if (jsonData) {
        const config = JSON.parse(jsonData.textContent);
        const targetUrl = config?.text_urls?.[pageNum];
        if (typeof targetUrl === "string" && targetUrl.length > 0) {
          expectsPdf =
            /\.pdf(\b|$|[&#?])/i.test(targetUrl) ||
            /file=[^&]*\.pdf/i.test(targetUrl);
        } else {
          expectsPdf = false;
        }
      }
    } catch (_) {
      // 判定不能なら保守的にPDF扱い
      expectsPdf = true;
    }

    showUxContentLoadingOverlay(seq, expectsPdf);
    attachUxContentFrameLoadHandler(seq, expectsPdf);

    function doPageNavigation() {
      try {
        // まず、チャプターフレームからtext_urlsを取得してみる
        const chapterFrame = window.top.frames["webclass_chapter"];
        if (chapterFrame && chapterFrame.document) {
          const jsonData = chapterFrame.document.querySelector("#json-data");
          if (jsonData) {
            const config = JSON.parse(jsonData.textContent);
            if (config.text_urls && config.text_urls[pageNum]) {
              // URLを取得してコンテンツフレームを更新
              const targetUrl = config.text_urls[pageNum];
              uxDebugLog("[WebClass UX] Navigating to URL:", targetUrl);

              // コンテンツフレームのsrcを変更
              const contentFrame = window.top.document.querySelector(
                'frame[name="webclass_content"]',
              );
              if (contentFrame) {
                contentFrame.src = targetUrl;
                uxDebugLog("[WebClass UX] Updated content frame src");
                return true;
              }
            }
          }
        }

        // フォールバック: gopage関数を直接呼び出す
        // 方法1: frame要素のcontentWindow経由
        const frames = window.top.document.querySelectorAll("frame");
        for (const frame of frames) {
          if (frame.name === "webclass_chapter") {
            const win = frame.contentWindow;
            if (win && typeof win.gopage === "function") {
              uxDebugLog("[WebClass UX] Calling gopage via contentWindow");
              win.gopage(pageNum);
              return true;
            }
            if (win && win.document && win.document.app) {
              uxDebugLog("[WebClass UX] Calling document.app.movePageTo");
              win.document.app.movePageTo(pageNum);
              return true;
            }
          }
        }

        // 方法2: window.top.frames経由
        const fallbackChapterFrame = window.top.frames["webclass_chapter"];
        if (fallbackChapterFrame) {
          if (typeof fallbackChapterFrame.gopage === "function") {
            uxDebugLog("[WebClass UX] Calling gopage via frames[]");
            fallbackChapterFrame.gopage(pageNum);
            return true;
          }
          if (
            fallbackChapterFrame.document &&
            fallbackChapterFrame.document.app
          ) {
            uxDebugLog("[WebClass UX] Calling app.movePageTo via frames[]");
            fallbackChapterFrame.document.app.movePageTo(pageNum);
            return true;
          }
        }

        uxDebugLog("[WebClass UX] Could not find navigation method");
        return false;
      } catch (err) {
        uxDebugLog("[WebClass UX] Error in doPageNavigation:", err);
        return false;
      }
    }

    if (doPageNavigation()) {
      // ページ移動後に目次を閉じる処理は削除（ユーザー要望）
      // closeToc();
    } else if (seq === uxState.navSeq) {
      hideUxContentLoadingOverlay(seq);
    }
  }

  function updateTocContent(iframeDoc) {
    try {
      const chapterFrame = window.top.frames["webclass_chapter"];
      if (chapterFrame && chapterFrame.document) {
        const tocElement = chapterFrame.document.querySelector("#TOC");
        if (tocElement) {
          const tocContent = iframeDoc.getElementById("toc-content");
          if (tocContent) {
            tocContent.innerHTML = tocElement.innerHTML;

            compactUxSectionLabels(tocContent);

            // ダウンロードボタンのイベントを設定
            const downloadBtns =
              tocContent.querySelectorAll(".ux-download-btn");
            downloadBtns.forEach((btn) => {
              bindInlineDownloadButton(btn);
            });

            // ページ移動ボタンを行全体のクリック領域へ置き換える
            const pageButtons = tocContent.querySelectorAll(
              'input[name="clickpage"]',
            );
            pageButtons.forEach((btn) => {
              const onclickAttr = btn.getAttribute("onclick");
              const pageMatch = onclickAttr.match(/gopage\(['"]?(\d+)['"]?\)/);
              if (!pageMatch) return;

              const pageNum = pageMatch[1];
              const row = btn.closest("tr");
              btn.remove();
              if (!row) return;

              row.classList.add("ux-toc-page-row");
              row.dataset.uxTocPage = pageNum;
              row.setAttribute("role", "button");
              row.setAttribute("tabindex", "0");
              row.setAttribute("aria-label", `${row.textContent.trim()}へ移動`);
              row.onclick = (e) => {
                if (e.target.closest("button, a, input, select, textarea")) {
                  return;
                }
                navigateToTocPage(pageNum, e);
              };
              row.onkeydown = (e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                navigateToTocPage(pageNum, e);
              };
            });
          }
        }
      }
    } catch (e) {
      uxDebugLog("[WebClass UX] Could not update TOC:", e);
    }
  }

  if (tocToggleBtn) {
    tocToggleBtn.onclick = () => {
      if (tocVisible) {
        closeToc();
      } else {
        openToc();
      }
    };
  }

  // 資料名
  const centerDiv = doc.createElement("div");
  centerDiv.style.cssText = "flex: 1; text-align: center;";

  const titleSpan = doc.createElement("span");
  titleSpan.textContent = contentName;
  titleSpan.style.cssText = `
        color: var(--ux-home-label);
        font-size: 1rem;
        font-weight: 600;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        max-width: 500px;
        display: inline-block;
    `;
  centerDiv.appendChild(titleSpan);

  // 別ウィンドウボタン
  const rightDiv = doc.createElement("div");
  rightDiv.style.cssText = "display: flex; align-items: center;";

  const newWindowBtn = doc.createElement("button");
  newWindowBtn.type = "button";
  newWindowBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
    `;
  newWindowBtn.setAttribute("aria-label", "PDFを開く");
  newWindowBtn.title = "PDFを開く";
  newWindowBtn.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 8px;
        margin-right: 8px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        background: transparent;
        color: var(--ux-home-secondary-label);
        transition: all 0.2s ease;
    `;
  newWindowBtn.onmouseover = () => {
    newWindowBtn.style.background = "var(--ux-home-fill)";
    newWindowBtn.style.color = "var(--ux-home-label)";
  };
  newWindowBtn.onmouseout = () => {
    newWindowBtn.style.background = "transparent";
    newWindowBtn.style.color = "var(--ux-home-secondary-label)";
  };
  newWindowBtn.onclick = () => {
    // PDFのURLを取得して別ウィンドウで開く
    let pdfUrl = null;

    try {
      const chapterFrame = window.top.frames["webclass_chapter"];
      if (chapterFrame && chapterFrame.document) {
        const jsonData = chapterFrame.document.querySelector("#json-data");
        if (jsonData) {
          const config = JSON.parse(jsonData.textContent);

          // contents_urlとfileパラメータからPDF URLを構築
          if (config.text_url && config.text_url.includes("file=")) {
            const textUrl = config.text_url;
            const fileMatch = textUrl.match(/file=([^&]+)/);
            const contentsUrlMatch = textUrl.match(/contents_url=([^&]+)/);

            if (fileMatch && fileMatch[1]) {
              const filePath = decodeURIComponent(fileMatch[1]);

              if (filePath && filePath.length > 0) {
                // contents_urlがある場合はそれを使用
                if (contentsUrlMatch && contentsUrlMatch[1]) {
                  const contentsUrl = decodeURIComponent(contentsUrlMatch[1]);
                  pdfUrl = window.top.location.origin + contentsUrl + filePath;
                } else {
                  // 直接パスを構築
                  pdfUrl =
                    window.top.location.origin +
                    "/webclass/data/course/" +
                    filePath;
                }
              }
            }
          }
        }
      }
    } catch (e) {
      uxDebugLog("[WebClass UX] Error getting PDF URL:", e);
    }

    if (pdfUrl) {
      uxDebugLog("[WebClass UX] Opening PDF:", pdfUrl);
      window.open(pdfUrl, "_blank");
    } else {
      // PDFがない場合（テキストコンテンツなど）
      alert("この資料にはPDFファイルがありません。");
    }
  };
  // リボン非表示ボタン
  const hideRibbonBtn = doc.createElement("button");
  hideRibbonBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
    `;
  hideRibbonBtn.title = "ヘッダーを隠す";
  hideRibbonBtn.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px;
        margin-right: 8px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        background: transparent;
        color: var(--ux-home-secondary-label);
        transition: all 0.2s ease;
    `;
  hideRibbonBtn.onmouseover = () => {
    hideRibbonBtn.style.background = "var(--ux-home-fill)";
    hideRibbonBtn.style.color = "var(--ux-home-label)";
  };
  hideRibbonBtn.onmouseout = () => {
    hideRibbonBtn.style.background = "transparent";
    hideRibbonBtn.style.color = "var(--ux-home-secondary-label)";
  };
  hideRibbonBtn.onclick = () => {
    toggleRibbon(false);
  };
  rightDiv.appendChild(hideRibbonBtn);
  rightDiv.appendChild(newWindowBtn);

  const originBtn = doc.createElement("button");
  originBtn.type = "button";
  originBtn.appendChild(
    createShiryouDisplayModeIcon(doc, UX_SHIRYOU_DISPLAY_MODE_ORIGIN),
  );
  originBtn.setAttribute("aria-label", "Origin表示に戻す");
  originBtn.title = "Origin表示に戻す";
  styleShiryouHeaderIconButton(originBtn);
  originBtn.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    applyShiryouOriginDisplayOnlyMode(window.top.document, { persist: true });
  };
  rightDiv.appendChild(originBtn);

  header.appendChild(leftDiv);
  header.appendChild(centerDiv);
  header.appendChild(rightDiv);

  doc.body.appendChild(header);
  updateTocContent(iframeDoc);

  // 初期状態で目次を開く設定の場合
  if (tocInitialState === "open") {
    setTimeout(() => {
      openToc(true); // isInitial = true
    }, 500);
  } else {
    closeToc();
  }

  log("Created modern header with TOC overlay in title frame");
}

/**
 * 左サイドバー（目次フレーム）のUI改善
 */
function enhanceShiryouChapterFrame() {
  log("Enhancing shiryou chapter frame");
  ensureUxFrameActionButtonFit(document);

  // NOTE: beforeunload blocking is now handled by beforeunload-blocker.js
  // which runs in MAIN world via manifest.json

  // 少し遅延して実行（DOMの読み込みを待つ）
  setTimeout(() => {
    // フレーム全体の内容を非表示（目次オーバーレイ使用時に元のTOCが見えないように）
    // visibility: hiddenを使用することでDOMはアクセス可能（gopage関数など）
    document.body.style.visibility = "hidden";
    document.body.style.background = "transparent";

    // 1. 青いヘッダー（bgc_sub）を非表示
    const bgcSub = document.querySelector("#WsTitle.bgc_sub, .bgc_sub");
    if (bgcSub) {
      bgcSub.style.display = "none";
      log("Hidden bgc_sub header");
    }

    // 2. ユーザー情報を非表示
    const userDiv = document.querySelector("#User");
    if (userDiv) {
      userDiv.style.display = "none";
    }

    // 3. hrを非表示
    const hrs = document.querySelectorAll("hr");
    hrs.forEach((hr) => {
      hr.style.display = "none";
    });

    // 4. 前のページ/次のページボタンを非表示
    const prevButton = document.querySelector(
      '#PrevButton, button[onclick*="prevPage"]',
    );
    const nextButton = document.querySelector(
      '#NextButton, button[onclick*="nextPage"]',
    );
    if (prevButton) {
      prevButton
        .closest("tr")
        ?.style.setProperty("display", "none", "important");
      log("Hidden prev button");
    }

    // ナビレイアウト全体を非表示（ボタンはヘッダーに移動）
    const naviLayout = document.querySelector("#naviLayout");
    if (naviLayout) {
      naviLayout.style.display = "none";
      log("Hidden naviLayout");
    }

    // 5. 「目次を隠す」の横の「資料を閉じる」ボタンを非表示
    const quitButtons = document.querySelectorAll(
      'input[name="quit"], input[value="資料を閉じる"]',
    );
    quitButtons.forEach((btn) => {
      btn.style.display = "none";
      log("Hidden quit button in chapter frame");
    });

    // 6. 「添付資料」リンクのテキストと画像のみ非表示（ダウンロードボタンは残す）
    const attachLinks = document.querySelectorAll('a[href*="file_down.php"]');
    attachLinks.forEach((link) => {
      // リンク自体を非表示（ダウンロードボタンは別要素なので残る）
      link.style.display = "none";
      log("Hidden attachment link text");
    });

    // 7. ヘッダーフレームのTOC更新をトリガー
    // ページ移動などでこのフレームがリロードされたとき、TOCの中身が変わっているので
    // ヘッダー側（titleフレーム）に通知してTOCオーバーレイを更新させる
    try {
      const titleFrame = window.top.frames["webclass_title"];
      if (titleFrame && titleFrame.document) {
        // カスタムイベントを発火
        const event = new CustomEvent("ux-toc-needs-update");
        titleFrame.document.dispatchEvent(event);
        log("Dispatched ux-toc-needs-update event");
      }
    } catch (e) {
      log("Could not dispatch event to title frame:", e);
    }

    // 8. 全体のスタイルを改善
    applyModernChapterStyles();

    // 9. 目次クリック時のPDF白フラッシュ抑制（左目次フレーム側）
    // フレームセットの表示構成や設定によっては左側の目次が使われる場合があるため、
    // clickpage ボタンのクリックを捕捉してコンテンツ側ロード完了までオーバーレイを表示する。
    try {
      setupShiryouContentFlashGuardFromChapterFrame();
    } catch (e) {
      log("Could not setup flash guard in chapter frame:", e?.message || e);
    }
  }, 100);
}

/**
 * 左目次フレームからのページ切替時に、コンテンツ側の白フラッシュを抑える
 * （クリックを捕捉して topDoc にオーバーレイを被せ、webclass_content の load 後に消す）
 */
function setupShiryouContentFlashGuardFromChapterFrame() {
  if (window.__uxShiryouFlashGuardInstalled) return;
  window.__uxShiryouFlashGuardInstalled = true;

  const topDoc = window.top?.document;
  if (!topDoc) return;

  // グローバルステートを共有（createModernHeaderInFrame と同じオーバーレイを管理）
  if (!topDoc.__uxOverlayState) {
    topDoc.__uxOverlayState = {
      navSeq: 0,
      shownAt: 0,
      hideTimer: null,
      indicatorTimer: null,
    };
  }
  const uxState = topDoc.__uxOverlayState;

  function getOrCreateUxContentLoadingOverlay() {
    const overlayId = "ux-content-loading-overlay";
    let overlay = topDoc.getElementById(overlayId);
    if (overlay) return overlay;

    overlay = topDoc.createElement("div");
    overlay.id = overlayId;
    overlay.style.cssText = `
            position: fixed;
            top: 55px;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 9998;
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            background: rgba(245, 245, 247, 0.94);
            transition: opacity 120ms ease-out;
            will-change: opacity;
            backdrop-filter: blur(6px);
        `;

    const style = topDoc.createElement("style");
    style.textContent = `
            @keyframes uxspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `;

    const inner = topDoc.createElement("div");
    inner.id = "ux-loading-indicator";
    inner.style.cssText = `
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            font-family: 'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif;
            color: var(--ux-home-label);
            font-size: 14px;
            opacity: 0;
            transition: opacity 120ms ease;
        `;
    inner.innerHTML = `
            <div style="width:18px;height:18px;border:2px solid var(--ux-home-accent-soft);border-top-color:var(--ux-home-accent);border-radius:50%;animation:uxspin 0.8s linear infinite;"></div>
            <div>読み込み中…</div>
        `;

    overlay.appendChild(style);
    overlay.appendChild(inner);
    topDoc.documentElement.appendChild(overlay);
    return overlay;
  }

  function showUxContentLoadingOverlay(seq, expectsPdf = true) {
    if (!expectsPdf) return;
    const overlay = getOrCreateUxContentLoadingOverlay();
    if (uxState.hideTimer) {
      clearTimeout(uxState.hideTimer);
      uxState.hideTimer = null;
    }

    const wasHidden =
      overlay.style.visibility !== "visible" || overlay.style.opacity === "0";
    // 即座に表示（トランジションなしで不透明に）
    overlay.style.transition = "none";
    overlay.style.visibility = "visible";
    overlay.style.opacity = "1";
    // 次フレームでトランジションを復活（非表示時のフェードアウト用）
    requestAnimationFrame(() => {
      overlay.style.transition = "opacity 120ms ease-out";
    });
    if (wasHidden) {
      uxState.shownAt =
        typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now();
    }

    const indicator = overlay.querySelector("#ux-loading-indicator");
    if (indicator) {
      indicator.style.opacity = "0";
      if (uxState.indicatorTimer) clearTimeout(uxState.indicatorTimer);
      uxState.indicatorTimer = setTimeout(() => {
        if (seq === uxState.navSeq) {
          indicator.style.opacity = "1";
        }
      }, 220);
    }
  }

  function hideUxContentLoadingOverlay(seq) {
    const overlay = topDoc.getElementById("ux-content-loading-overlay");
    if (!overlay) return;
    if (seq !== uxState.navSeq) return;

    if (uxState.indicatorTimer) {
      clearTimeout(uxState.indicatorTimer);
      uxState.indicatorTimer = null;
    }
    const indicator = overlay.querySelector("#ux-loading-indicator");
    if (indicator) indicator.style.opacity = "0";

    const now =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
    const elapsed = uxState.shownAt ? now - uxState.shownAt : 9999;
    const minVisibleMs = 150;
    const delay = Math.max(0, minVisibleMs - elapsed);

    if (uxState.hideTimer) clearTimeout(uxState.hideTimer);
    uxState.hideTimer = setTimeout(() => {
      if (seq !== uxState.navSeq) return;
      overlay.style.opacity = "0";
      setTimeout(() => {
        if (seq === uxState.navSeq && overlay.style.opacity === "0") {
          overlay.style.visibility = "hidden";
        }
      }, 150);
    }, delay);
  }

  function waitForUxPdfViewerRender(seq, expectsPdf = true, timeoutMs = 9000) {
    return new Promise((resolve) => {
      const start = Date.now();

      function isCanvasDrawn(canvas) {
        try {
          if (!canvas) return false;
          // PDF.jsはcanvasに描画する際に適切なサイズを設定するため、
          // サイズチェックのみで描画状態を判定する（getImageData警告を回避）
          const w = canvas.width || 0;
          const h = canvas.height || 0;
          // 有効なサイズ（100x100以上）であれば描画済みとみなす
          return w >= 100 && h >= 100;
        } catch (e) {
          return Date.now() - start > 1200;
        }
      }

      const tick = () => {
        if (seq !== uxState.navSeq) return resolve();

        try {
          const contentWin = window.top.frames?.["webclass_content"];
          if (!contentWin) return resolve();

          let looksLikePdf = expectsPdf;
          try {
            const href = contentWin.location?.href || "";
            if (
              href.includes("loadit.php") ||
              /\.pdf(\b|$|[&#?])/i.test(href)
            ) {
              looksLikePdf = true;
            }
          } catch (_) {}

          const docCandidates = [];
          try {
            docCandidates.push(contentWin.document);
          } catch (_) {}

          try {
            const nested =
              contentWin.document?.querySelectorAll?.("iframe, frame") || [];
            nested.forEach((el) => {
              try {
                const d = el.contentDocument || el.contentWindow?.document;
                if (d) docCandidates.push(d);
              } catch (_) {}
            });
          } catch (_) {}

          let foundViewer = false;
          for (const d of docCandidates) {
            if (!d) continue;
            const viewerContainer =
              d.getElementById("viewerContainer") || d.getElementById("viewer");
            if (!viewerContainer) continue;

            foundViewer = true;
            const canvases = viewerContainer.querySelectorAll("canvas");
            for (const canvas of canvases) {
              if (isCanvasDrawn(canvas)) {
                return resolve();
              }
            }
          }

          if (!looksLikePdf && !foundViewer && Date.now() - start > 180) {
            return resolve();
          }
        } catch (_) {
          return resolve();
        }

        if (Date.now() - start >= timeoutMs) return resolve();
        setTimeout(tick, 120);
      };

      tick();
    });
  }

  function attachUxContentFrameLoadHandler(seq, expectsPdf = true) {
    const frameEl = topDoc.querySelector(
      'frame[name="webclass_content"], iframe[name="webclass_content"]',
    );
    if (!frameEl) {
      setTimeout(() => {
        if (seq === uxState.navSeq) hideUxContentLoadingOverlay(seq);
      }, 800);
      return;
    }

    const onLoad = () => {
      if (seq !== uxState.navSeq) return;
      waitForUxPdfViewerRender(seq, expectsPdf).finally(() => {
        if (seq === uxState.navSeq) hideUxContentLoadingOverlay(seq);
      });
    };

    try {
      frameEl.addEventListener("load", onLoad, { once: true });
    } catch (e) {
      frameEl.onload = onLoad;
    }

    setTimeout(() => {
      if (seq === uxState.navSeq) hideUxContentLoadingOverlay(seq);
    }, 12000);
  }

  // inline onclick より先に走らせる（capture）ことで、遷移開始前にオーバーレイを出す
  document.addEventListener(
    "click",
    (e) => {
      const t = e.target;
      if (!t || t.nodeType !== 1) return;

      // 目次のページボタン
      if (t.tagName === "INPUT" && t.getAttribute("name") === "clickpage") {
        // クリック対象のページ番号を推定（onclickがある場合はそれを優先）
        const onclickAttr = t.getAttribute("onclick") || "";
        const m = onclickAttr.match(/gopage\(['"]?(\d+)['"]?\)/);
        const pageNum = m ? m[1] : (t.value || "").trim();

        let expectsPdf = true;
        try {
          const jsonData = document.querySelector("#json-data");
          if (jsonData) {
            const config = JSON.parse(jsonData.textContent);
            const targetUrl = config?.text_urls?.[pageNum];
            if (typeof targetUrl === "string" && targetUrl.length > 0) {
              expectsPdf =
                /\.pdf(\b|$|[&#?])/i.test(targetUrl) ||
                /file=[^&]*\.pdf/i.test(targetUrl);
            } else {
              expectsPdf = false;
            }
          }
        } catch (_) {
          expectsPdf = true;
        }

        const seq = ++uxState.navSeq;
        showUxContentLoadingOverlay(seq, expectsPdf);
        attachUxContentFrameLoadHandler(seq, expectsPdf);
      }
    },
    true,
  );
}

/**
 * 目次フレームにモダンなスタイルを適用
 */
function applyModernChapterStyles() {
  ensureCourseColorTokens(document);
  ensureUxFrameActionButtonFit(document);
  if (document.getElementById("ux-shiryou-chapter-style")) return;

  const style = markUxCourseStyle(document.createElement("style"));
  style.id = "ux-shiryou-chapter-style";
  style.textContent = `
        body {
            background: var(--ux-home-page-bg) !important;
            color: var(--ux-home-label) !important;
            font-family: 'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif !important;
            padding: 10px !important;
        }

        #top {
            background: transparent !important;
            min-height: 0 !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
        }

        #WsTitle.bgc_sub, .bgc_sub {
            display: none !important;
        }

        #User {
            display: none !important;
        }

        hr {
            display: none !important;
        }

        /* ナビゲーションテーブルのスタイル改善 */
        #naviLayout {
            width: 100% !important;
            margin: 0 0 10px 0 !important;
        }

        #naviLayout tr td {
            padding: 2px !important;
        }

        #naviLayout tr td br {
            display: none !important;
        }

        #naviLayout input[type="button"],
        #naviLayout button {
            background: var(--ux-home-accent) !important;
            color: var(--ux-home-surface) !important;
            border: 1px solid var(--ux-home-accent) !important;
            border-radius: 6px !important;
            padding: 8px 14px !important;
            font-size: 0.8rem !important;
            font-weight: 500 !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            box-shadow: var(--ux-home-shadow-sm) !important;
        }

        #naviLayout input[type="button"]:hover,
        #naviLayout button:hover {
            background: var(--ux-home-accent-emphasis) !important;
            border-color: var(--ux-home-accent-emphasis) !important;
            transform: translateY(-1px) !important;
            box-shadow: var(--ux-home-shadow-md) !important;
        }

        #naviLayout input[type="button"]:disabled,
        #naviLayout button:disabled {
            background: var(--ux-home-fill) !important;
            color: var(--ux-home-tertiary-label) !important;
            border-color: var(--ux-home-separator) !important;
            cursor: not-allowed !important;
            transform: none !important;
            box-shadow: none !important;
        }

        /* 目次テーブルのスタイル改善 */
        #TOC {
            background: var(--ux-home-surface) !important;
            border-radius: 8px !important;
            padding: 10px !important;
            margin-top: 5px !important;
            box-shadow: var(--ux-home-shadow-sm) !important;
        }

        #TOCLayout {
            width: 100% !important;
        }

        #TOCLayout tr {
            transition: background-color 0.15s ease !important;
        }

        #TOCLayout tr:hover {
            background-color: var(--ux-home-accent-softer) !important;
        }

        #TOCLayout td {
            padding: 8px 6px !important;
            vertical-align: middle !important;
        }

        #TOCLayout input[type="button"] {
            background: var(--ux-home-surface-soft) !important;
            color: var(--ux-home-accent-emphasis) !important;
            min-width: 32px !important;
            padding: 6px 10px !important;
            box-shadow: none !important;
        }

        #TOCLayout input[type="button"]:hover {
            background: var(--ux-home-accent-softer) !important;
        }

        .ux-section-number-badge {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            min-width: 1.65rem !important;
            height: 1.45rem !important;
            padding: 0 0.45rem !important;
            border-radius: 999px !important;
            background: var(--ux-home-surface-soft) !important;
            border: 1px solid var(--ux-home-separator) !important;
            color: var(--ux-home-accent-emphasis) !important;
            font-size: 0.78rem !important;
            font-weight: 700 !important;
            line-height: 1 !important;
            box-shadow: var(--ux-home-shadow-sm) !important;
        }

        /* 添付資料リンクのテキスト/画像のみ非表示（ダウンロードボタンは残す） */
        #TOCLayout a[href*="file_down.php"] {
            display: none !important;
        }

        /* 前/次ページボタンを非表示 */
        #PrevButton,
        #NextButton,
        button[onclick*="prevPage"],
        button[onclick*="nextPage"] {
            display: none !important;
        }

        /* 資料を閉じるボタン（目次横）を非表示 */
        input[name="quit"],
        input[value="資料を閉じる"] {
            display: none !important;
        }

        /* 目次を隠すボタンを非表示（ヘッダーにトグルボタンがあるため） */
        input[name="hide_content"],
        input[value="目次を隠す"],
        input[value="目次を表示"] {
            display: none !important;
        }

        /* 空の行を非表示 */
        #naviLayout tr:has(td > br:only-child) {
            display: none !important;
        }

        /* ナビゲーションテーブル自体を非表示（ボタンがすべてヘッダーに移動したため） */
        #naviLayout {
            display: none !important;
        }
    `;
  document.head.appendChild(style);
  compactUxSectionLabels(document);
  log("Applied modern chapter styles");
}

/**
 * フレーム全体を非表示にする
 */
function hideEntireFrame() {
  rememberUxOriginalBodyState(document);
  const style = markUxCourseStyle(document.createElement("style"));
  style.id = "ux-hidden-title-frame-style";
  style.textContent = `
        body, html {
            display: none !important;
            height: 0 !important;
            overflow: hidden !important;
        }
    `;
  document.head.appendChild(style);
  log("Hidden entire frame");
}

/**
 * loadit.phpの「表示に問題があるときは」メッセージフレームを非表示
 */
function hideLoaditMessageFrame() {
  log("Hiding loadit message frame");

  rememberUxOriginalBodyState(document);
  const style = markUxCourseStyle(document.createElement("style"));
  style.id = "ux-loadit-message-style";
  style.textContent = `
        body {
            visibility: hidden !important;
            height: 0 !important;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 0 !important;
        }
    `;
  document.head.appendChild(style);

  // 親のフレームセットの行を0にする
  try {
    if (window.parent && window.parent.document) {
      const parentFrameset =
        window.parent.document.querySelector("frameset[rows]");
      if (parentFrameset) {
        rememberUxOriginalAttributes(parentFrameset);
        const rows = parentFrameset.getAttribute("rows");
        if (rows && rows.includes("40")) {
          parentFrameset.setAttribute("rows", "0,*");
          log("Set parent frameset rows to 0,*");
        }
      }
    }
  } catch (e) {
    log("Could not modify parent frameset:", e.message);
  }
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Course contents page visual refresh (keeps existing layout/UX structure)
 */
function enhanceCourseContentsPageUI() {
  if (!isUxExtensionVisualEnabled()) return;
  if (window.top !== window) return;

  const STYLE_ID = "ux-course-contents-theme-style";
  const BODY_CLASS = "ux-course-contents-theme";
  const QUICK_NAV_ID = "ux-course-quick-nav";
  const QUICK_NAV_ENABLED_CLASS = "ux-course-quick-nav-enabled";
  const QUICK_NAV_COLLAPSED_CLASS = "ux-course-quick-nav-collapsed";
  const QUICK_NAV_COLLAPSED_STORAGE_KEY = "webclass_course_quick_nav_collapsed";
  const STORAGE_KEY_CUSTOM_COURSE_NAMES = "webclass_custom_course_names";
  const STORAGE_KEY_OPENAI_COURSE_CACHE = "openaiCourseNameCache";
  const STORAGE_KEY_OPENAI_COURSE_CACHE_LEGACY =
    "webclass_openai_course_name_cache";
  const STORAGE_KEY_SHORT_COURSE_CACHE = "webclass_course_short_name_cache";
  const STORAGE_KEY_COURSE_QUICK_NAV_COLLAPSED = "courseQuickNavCollapsed";
  const COURSE_TIMELINE_TARGET_ID = "ux-course-timeline";
  const COURSE_TIMELINE_PANEL_ID = "ux-course-timeline-panel";
  const COURSE_TIMELINE_HASH = "timeline";
  const COURSE_TIMELINE_VIEW_CLASS = "ux-course-timeline-view";
  const COURSE_TIMELINE_SOURCE_CLASS = "ux-course-timeline-source";
  const COURSE_TIMELINE_NAV_ITEM_CLASS = "ux-course-timeline-nav-item";
  const COURSE_TIMELINE_NAV_LINK_CLASS = "ux-course-timeline-nav-link";

  const normalizeCourseLabelText = (text) => {
    return (text || "")
      .replace(/^ﾂｻ\s*/, "")
      .replace("締切が近い課題があります。", "")
      .replace(/新着メッセージ\(\d+\)/g, "")
      .trim();
  };

  const resolveEditedCustomCourseName = (customName, fullName) => {
    const rawCustomName = (customName || "").trim();
    if (!rawCustomName) return "";
    const normalizedCustomName = normalizeCourseLabelText(rawCustomName);
    if (!normalizedCustomName) return "";
    const normalizedFullName = normalizeCourseLabelText(fullName || "");
    if (normalizedFullName && normalizedCustomName === normalizedFullName) {
      return "";
    }
    return rawCustomName;
  };

  const extractCourseIdFromUrl = (url) => {
    const raw = (url || "").trim();
    if (!raw) return "";
    const match = raw.match(/course\.php\/([^\/?]+)/);
    if (match) return (match[1] || "").trim();
    try {
      const parsed = new URL(raw, window.location.href);
      return (
        parsed.searchParams.get("course_id") ||
        parsed.searchParams.get("course") ||
        parsed.searchParams.get("id") ||
        ""
      ).trim();
    } catch {
      return "";
    }
  };

  const toAbsoluteUrl = (url) => {
    const raw = (url || "").trim();
    if (!raw) return "";
    try {
      return new URL(raw, window.location.href).href;
    } catch {
      return "";
    }
  };

  const normalizeCourseItemTypeLabel = (text) => {
    return (text || "")
      .replace(/\s+/g, "")
      .replace(/[()（）]/g, "")
      .trim();
  };

  const resolveCourseContentsItemType = (item) => {
    if (!item || typeof item.querySelector !== "function") return "other";

    const categoryLabel = normalizeCourseItemTypeLabel(
      item.querySelector(".cl-contentsList_categoryLabel")?.textContent || "",
    );

    if (categoryLabel.startsWith("試験")) return "shiken";
    if (categoryLabel.startsWith("資料")) return "shiryou";
    return "other";
  };

  const buildShortNameCacheKeys = (courseId, names = []) => {
    const keys = new Set();
    const normalizedId = (courseId || "").trim();

    if (normalizedId) {
      keys.add(`id::${normalizedId}`);
      keys.add(normalizedId);
    }

    names.forEach((name) => {
      const raw = (name || "").trim();
      if (!raw) return;
      const normalized = normalizeCourseLabelText(raw);

      if (normalizedId) {
        keys.add(`${normalizedId}::${raw}`);
        if (normalized && normalized !== raw) {
          keys.add(`${normalizedId}::${normalized}`);
        }
      }

      // home.js stores short course cache entries with name:: prefix
      if (normalized) {
        keys.add(`name::${normalized}`);
      }
      if (raw !== normalized) {
        keys.add(`name::${raw}`);
      }

      keys.add(raw);
      if (normalized && normalized !== raw) {
        keys.add(normalized);
      }
    });

    return Array.from(keys);
  };

  const readShortNameFromCache = (cache, courseId, names = []) => {
    if (!cache || typeof cache !== "object") return "";
    const keys = buildShortNameCacheKeys(courseId, names);
    for (const key of keys) {
      const value = cache[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    // Fallback for OpenAI cache keys like "<courseId>::<original full name>".
    // Quick-nav source labels can differ from the original label used to cache,
    // so strict key match may miss while a unique courseId match still exists.
    const normalizedId = (courseId || "").trim();
    if (normalizedId) {
      const idPrefix = `${normalizedId}::`;
      for (const [key, value] of Object.entries(cache)) {
        if (!key.startsWith(idPrefix)) continue;
        if (typeof value === "string" && value.trim()) {
          return value.trim();
        }
      }
    }

    return "";
  };

  const loadCourseNameCaches = async () => {
    const defaults = {
      [STORAGE_KEY_CUSTOM_COURSE_NAMES]: {},
      [STORAGE_KEY_OPENAI_COURSE_CACHE]: {},
      [STORAGE_KEY_OPENAI_COURSE_CACHE_LEGACY]: {},
      [STORAGE_KEY_SHORT_COURSE_CACHE]: {},
    };

    try {
      const data = await new Promise((resolve) => {
        chrome.storage.local.get(defaults, resolve);
      });
      return {
        customNames: data[STORAGE_KEY_CUSTOM_COURSE_NAMES] || {},
        openaiCache: {
          ...(data[STORAGE_KEY_OPENAI_COURSE_CACHE_LEGACY] || {}),
          ...(data[STORAGE_KEY_OPENAI_COURSE_CACHE] || {}),
        },
        shortCourseCache: data[STORAGE_KEY_SHORT_COURSE_CACHE] || {},
      };
    } catch (error) {
      uxDebugWarn(
        "[WebClass UX] Failed to load course-name cache for quick nav",
        error,
      );
      return {
        customNames: {},
        openaiCache: {},
        shortCourseCache: {},
      };
    }
  };

  const getCurrentAcsToken = () => {
    try {
      const current = new URL(window.location.href);
      return (current.searchParams.get("acs_") || "").trim();
    } catch {
      return "";
    }
  };

  const buildCourseLoginUrl = (courseId, acsToken) => {
    const qs = acsToken ? `?acs_=${encodeURIComponent(acsToken)}` : "";
    return `${window.location.origin}/webclass/course.php/${courseId}/login${qs}`;
  };

  const getQuickNavWeekdayIndexFromHeaderText = (text) => {
    const normalized = String(text || "")
      .replace(/\s+/g, "")
      .toLowerCase();
    if (!normalized) return null;

    const japaneseWeekdayPatterns = [
      /^日(?:曜(?:日)?)?$/,
      /^月(?:曜(?:日)?)?$/,
      /^火(?:曜(?:日)?)?$/,
      /^水(?:曜(?:日)?)?$/,
      /^木(?:曜(?:日)?)?$/,
      /^金(?:曜(?:日)?)?$/,
      /^土(?:曜(?:日)?)?$/,
    ];

    for (let i = 0; i < japaneseWeekdayPatterns.length; i++) {
      if (japaneseWeekdayPatterns[i].test(normalized)) return i;
    }

    const englishWeekdayPatterns = [
      /^sun(?:day)?$/,
      /^mon(?:day)?$/,
      /^tue(?:s|sday)?$/,
      /^wed(?:nesday)?$/,
      /^thu(?:rs|rsday)?$/,
      /^fri(?:day)?$/,
      /^sat(?:urday)?$/,
    ];

    for (let i = 0; i < englishWeekdayPatterns.length; i++) {
      if (englishWeekdayPatterns[i].test(normalized)) return i;
    }

    return null;
  };

  const getQuickNavPeriodFromRow = (row) => {
    if (!row) return null;

    const dataOrder = Number(row.dataset?.class_order);
    if (Number.isFinite(dataOrder) && dataOrder > 0) {
      return dataOrder;
    }

    const periodCell = row.querySelector(
      "td.schedule-table-class_order, th.schedule-table-class_order, td, th",
    );
    const match = periodCell?.textContent?.match(/(\d+)/);
    if (!match) return null;

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const getQuickNavSchedulePositionFromLink = (link) => {
    const table = link?.closest?.("table.schedule-table");
    const cell = link?.closest?.("td, th");
    const row = cell?.parentElement;
    if (
      !table ||
      !cell ||
      !row ||
      cell.classList.contains("schedule-table-class_order")
    ) {
      return null;
    }

    const period = getQuickNavPeriodFromRow(row);
    if (!period) return null;

    const headerRows = Array.from(table.tHead?.rows || []);
    const headerCells = Array.from(
      headerRows[headerRows.length - 1]?.cells || [],
    );
    const headerCell = headerCells[cell.cellIndex];
    const weekday = getQuickNavWeekdayIndexFromHeaderText(
      headerCell?.textContent,
    );
    if (weekday === null) return null;

    return { weekday, period };
  };

  const getQuickNavWeekdaySortRank = (weekday) => {
    if (weekday >= 1 && weekday <= 5) return weekday;
    if (weekday === 6) return 6;
    if (weekday === 0) return 7;
    return Number.POSITIVE_INFINITY;
  };

  const getQuickNavPositionSortRank = (position) => {
    if (!position) return Number.POSITIVE_INFINITY;
    const weekdayRank = getQuickNavWeekdaySortRank(position.weekday);
    const period = Number(position.period);
    if (
      !Number.isFinite(weekdayRank) ||
      !Number.isFinite(period) ||
      period <= 0
    ) {
      return Number.POSITIVE_INFINITY;
    }
    if (weekdayRank >= 1 && weekdayRank <= 5 && period >= 1 && period <= 5) {
      return (weekdayRank - 1) * 5 + period;
    }
    return 1000 + weekdayRank * 100 + period;
  };

  const compareQuickNavSchedulePositions = (a, b) => {
    const aRank = getQuickNavPositionSortRank(a);
    const bRank = getQuickNavPositionSortRank(b);
    const aHasRank = Number.isFinite(aRank);
    const bHasRank = Number.isFinite(bRank);
    if (aHasRank && bHasRank) return aRank - bRank;
    if (aHasRank) return -1;
    if (bHasRank) return 1;
    return 0;
  };

  const compareQuickNavCourses = (a, b) => {
    const positionDiff = compareQuickNavSchedulePositions(
      a?.schedulePosition,
      b?.schedulePosition,
    );
    if (positionDiff !== 0) return positionDiff;

    const aName = a?.displayName || a?.fullName || a?.rawFullName || "";
    const bName = b?.displayName || b?.fullName || b?.rawFullName || "";
    const nameDiff = aName.localeCompare(bName, "ja");
    if (nameDiff !== 0) return nameDiff;

    return String(a?.id || "").localeCompare(String(b?.id || ""), "ja");
  };

  const getQuickNavScheduleLabel = (position) => {
    if (!position) return "";
    const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];
    const weekday = Number(position.weekday);
    const period = Number(position.period);
    if (
      !Number.isInteger(weekday) ||
      !weekdayLabels[weekday] ||
      !Number.isFinite(period) ||
      period <= 0
    ) {
      return "";
    }
    return `${weekdayLabels[weekday]}${period}`;
  };

  const collectCourseLinksFromDocument = (
    root,
    { baseUrl = window.location.href, acsToken = "" } = {},
  ) => {
    if (!root || typeof root.querySelectorAll !== "function") return [];

    const buckets = [
      {
        priority: 5,
        links: root.querySelectorAll(
          'table.schedule-table a[href*="course.php"]',
        ),
      },
      {
        priority: 3,
        links: root.querySelectorAll(
          '.navbar-nav.navbar-left .dropdown-menu a[href*="course.php"]',
        ),
      },
      {
        priority: 2,
        links: root.querySelectorAll('ul.dropdown-menu a[href*="course.php"]'),
      },
      {
        priority: 1,
        links: root.querySelectorAll('a[href*="course.php"]'),
      },
    ];

    const byCourseId = new Map();
    buckets.forEach((bucket) => {
      bucket.links.forEach((link) => {
        const href = link.getAttribute("href") || "";
        if (!href || link.classList?.contains("no-link")) return;
        if (link.dataset?.uxCourseQuickNav === "1") return;

        const courseId = extractCourseIdFromUrl(href);
        if (!courseId) return;

        let absoluteUrl = "";
        try {
          absoluteUrl = new URL(href, baseUrl).href;
        } catch {
          return;
        }
        if (!absoluteUrl) return;

        const rawFullName = (
          link.dataset?.originalText ||
          link.textContent ||
          ""
        ).trim();
        const fullName = normalizeCourseLabelText(rawFullName);
        if (!fullName && !rawFullName) return;

        const schedulePosition = getQuickNavSchedulePositionFromLink(link);
        const existing = byCourseId.get(courseId);
        const shouldReplaceExisting =
          !existing ||
          bucket.priority > existing.priority ||
          (bucket.priority === existing.priority &&
            compareQuickNavSchedulePositions(
              schedulePosition,
              existing.schedulePosition,
            ) < 0);

        if (shouldReplaceExisting) {
          byCourseId.set(courseId, {
            id: courseId,
            fullName,
            rawFullName: rawFullName || fullName,
            url: absoluteUrl,
            priority: bucket.priority,
            schedulePosition,
          });
        }
      });
    });

    if (byCourseId.size === 0) return [];

    return Array.from(byCourseId.values()).map((course) => {
      let url = course.url;
      if (
        !url ||
        url.includes("/contents/") ||
        url.includes("do_contents.php")
      ) {
        url = buildCourseLoginUrl(course.id, acsToken);
      }
      return {
        id: course.id,
        fullName: course.fullName,
        rawFullName: course.rawFullName || course.fullName,
        url,
        schedulePosition: course.schedulePosition || null,
      };
    });
  };

  const collectCourseLinksFromCurrentPage = () => {
    const acsToken = getCurrentAcsToken();
    return collectCourseLinksFromDocument(document, {
      baseUrl: window.location.href,
      acsToken,
    });
  };

  const HOME_COURSE_CACHE_TTL_MS = 5 * 60 * 1000;
  let cachedHomeCourseLinks = null;
  let cachedHomeCourseLinksAt = 0;
  let pendingHomeCourseLinksPromise = null;

  const collectCourseLinksFromHomePage = async ({
    forceRefresh = false,
  } = {}) => {
    const now = Date.now();
    if (
      !forceRefresh &&
      Array.isArray(cachedHomeCourseLinks) &&
      cachedHomeCourseLinks.length > 0 &&
      now - cachedHomeCourseLinksAt < HOME_COURSE_CACHE_TTL_MS
    ) {
      return cachedHomeCourseLinks;
    }

    if (!forceRefresh && pendingHomeCourseLinksPromise) {
      return pendingHomeCourseLinksPromise;
    }

    const acsToken = getCurrentAcsToken();
    const homeUrl = acsToken
      ? `${window.location.origin}/webclass/?acs_=${encodeURIComponent(acsToken)}`
      : `${window.location.origin}/webclass/`;

    const task = (async () => {
      try {
        const response = await fetch(homeUrl, {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          uxDebugWarn(
            "[WebClass UX] Home fetch for quick nav failed:",
            response.status,
            response.statusText,
          );
          return [];
        }

        const html = await response.text();
        if (!html || html.length < 100) return [];

        const parsed = new DOMParser().parseFromString(html, "text/html");
        const courses = collectCourseLinksFromDocument(parsed, {
          baseUrl: homeUrl,
          acsToken,
        });
        if (courses.length > 0) {
          cachedHomeCourseLinks = courses;
          cachedHomeCourseLinksAt = Date.now();
        }
        return courses;
      } catch (error) {
        uxDebugWarn(
          "[WebClass UX] Failed to collect courses from home page",
          error,
        );
        return [];
      } finally {
        pendingHomeCourseLinksPromise = null;
      }
    })();

    pendingHomeCourseLinksPromise = task;
    return task;
  };

  const extractCourseShortName = (fullName) => {
    let name = fullName || "";
    name = name.replace(
      /[（(][^）)]*(?:計算|先端|情報|数理|理学|旧数コ|旧物コ|総理)[^）)]*[）)]/g,
      "",
    );
    const match = name.match(/^(.+?)\s*\((?:20\d{2})/);
    if (match) {
      name = match[1].trim();
    }
    if (name.includes("／")) {
      name = name.split("／")[0].trim();
    }
    name = name.replace(/^»\s*/, "");
    return name.trim();
  };

  const resolveQuickNavDisplayName = (course, caches) => {
    const rawFullName = (course.rawFullName || course.fullName || "").trim();
    const fullName = normalizeCourseLabelText(
      rawFullName || course.fullName || "",
    );
    const cacheNameCandidates = Array.from(
      new Set(
        [rawFullName, fullName, course.fullName]
          .map((name) => (name || "").trim())
          .filter(Boolean),
      ),
    );
    const customName = resolveEditedCustomCourseName(
      caches.customNames?.[course.id],
      fullName,
    );
    if (customName) return customName;

    const openaiShortName = readShortNameFromCache(
      caches.openaiCache,
      course.id,
      cacheNameCandidates,
    );
    if (openaiShortName) return openaiShortName;

    const ruleShortName = readShortNameFromCache(
      caches.shortCourseCache,
      course.id,
      cacheNameCandidates,
    );
    if (ruleShortName) return ruleShortName;

    const autoShortName = extractCourseShortName(fullName);
    if (autoShortName && autoShortName !== fullName) return autoShortName;

    return fullName || rawFullName || course.fullName || course.id;
  };

  let quickNavCollapsedPreference = null;

  const readLegacyQuickNavCollapsedState = () => {
    try {
      const val = localStorage.getItem(QUICK_NAV_COLLAPSED_STORAGE_KEY);
      if (val === null) return false; // default: expanded
      return val === "1";
    } catch {
      return false;
    }
  };

  const readQuickNavCollapsedState = () =>
    typeof quickNavCollapsedPreference === "boolean"
      ? quickNavCollapsedPreference
      : readLegacyQuickNavCollapsedState();

  const loadQuickNavCollapsedPreference = () =>
    new Promise((resolve) => {
      const fallback = readLegacyQuickNavCollapsedState();
      if (typeof chrome === "undefined" || !chrome?.storage?.local?.get) {
        quickNavCollapsedPreference = fallback;
        resolve(fallback);
        return;
      }

      chrome.storage.local.get(
        { [STORAGE_KEY_COURSE_QUICK_NAV_COLLAPSED]: null },
        (items) => {
          const lastError = chrome.runtime?.lastError;
          const storedValue = items?.[STORAGE_KEY_COURSE_QUICK_NAV_COLLAPSED];
          const collapsed =
            !lastError && typeof storedValue === "boolean"
              ? storedValue
              : fallback;
          quickNavCollapsedPreference = collapsed;
          resolve(collapsed);
        },
      );
    });

  const saveQuickNavCollapsedState = (collapsed) => {
    quickNavCollapsedPreference = !!collapsed;
    try {
      localStorage.setItem(
        QUICK_NAV_COLLAPSED_STORAGE_KEY,
        collapsed ? "1" : "0",
      );
    } catch {
      // ignore
    }
    try {
      if (typeof chrome !== "undefined" && chrome?.storage?.local?.set) {
        chrome.storage.local.set({
          [STORAGE_KEY_COURSE_QUICK_NAV_COLLAPSED]: !!collapsed,
        });
      }
    } catch {
      // ignore
    }
  };

  const removeQuickNav = () => {
    const existing = document.getElementById(QUICK_NAV_ID);
    if (existing) existing.remove();
    if (document.body) {
      document.body.classList.remove(QUICK_NAV_ENABLED_CLASS);
      document.body.classList.remove(QUICK_NAV_COLLAPSED_CLASS);
      document.body.style.removeProperty("--ux-course-quick-nav-width");
    }
  };

  const ensureQuickNavShell = () => {
    if (!document.body) return null;

    let root = document.getElementById(QUICK_NAV_ID);
    if (!root) {
      root = document.createElement("aside");
      root.id = QUICK_NAV_ID;
      root.innerHTML = `
                <div class="ux-course-quick-nav-header">
                    <a class="ux-course-quick-nav-home" href="/webclass/" title="WebClass">
                        <svg class="ux-course-quick-nav-home-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M3 10.75 12 3l9 7.75V21a1 1 0 0 1-1 1h-5.5a1 1 0 0 1-1-1v-5.25h-3V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10.75Z"></path>
                        </svg>
                        <span class="ux-course-quick-nav-home-label">WebClass</span>
                    </a>
                    <div class="ux-course-quick-nav-controls">
                        <button type="button" class="ux-course-quick-nav-toggle" aria-label="Toggle course list" aria-expanded="true">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="3" y1="6" x2="21" y2="6"></line>
                                <line x1="3" y1="12" x2="21" y2="12"></line>
                                <line x1="3" y1="18" x2="21" y2="18"></line>
                            </svg>
                        </button>
                        <span class="ux-course-quick-nav-title">Courses</span>
                    </div>
                </div>
                <div class="ux-course-quick-nav-list-wrap"></div>
            `;
      document.body.appendChild(root);
    }

    const quickNavHomeLink = root.querySelector(".ux-course-quick-nav-home");
    if (quickNavHomeLink) {
      const homeUrl = new URL("/webclass/", window.location.origin);
      quickNavHomeLink.href = homeUrl.href;
    }

    const toggleButton = root.querySelector(".ux-course-quick-nav-toggle");

    const setCollapsedState = (collapsed) => {
      root.classList.toggle("ux-collapsed", !!collapsed);
      document.body.classList.add(QUICK_NAV_ENABLED_CLASS);
      document.body.classList.toggle(QUICK_NAV_COLLAPSED_CLASS, !!collapsed);
      document.body.style.setProperty(
        "--ux-course-quick-nav-width",
        collapsed ? "64px" : "280px",
      );
      if (toggleButton) {
        toggleButton.setAttribute(
          "aria-expanded",
          collapsed ? "false" : "true",
        );
        toggleButton.setAttribute(
          "title",
          collapsed ? "Open course list" : "Collapse course list",
        );
      }
    };

    if (!root.dataset.uxCourseQuickNavBound) {
      if (toggleButton) {
        toggleButton.addEventListener("click", () => {
          const nextCollapsed = !root.classList.contains("ux-collapsed");
          setCollapsedState(nextCollapsed);
          saveQuickNavCollapsedState(nextCollapsed);
        });
      }
      root.dataset.uxCourseQuickNavBound = "1";
    }

    setCollapsedState(readQuickNavCollapsedState());
    root.__setCollapsedState = setCollapsedState;
    return root;
  };

  const COURSE_ICON_COLORS = [
    "var(--ux-home-accent)",
    "var(--ux-home-warning)",
    "var(--ux-home-success)",
    "var(--ux-home-purple)",
    "var(--ux-home-danger)",
    "var(--ux-home-accent-emphasis)",
    "var(--ux-home-warning)",
    "var(--ux-home-success)",
    "var(--ux-home-accent)",
    "var(--ux-home-purple)",
    "var(--ux-home-danger)",
    "var(--ux-home-success)",
  ];

  const getCourseIconColor = (courseId) => {
    let hash = 0;
    const str = courseId || "";
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return COURSE_ICON_COLORS[Math.abs(hash) % COURSE_ICON_COLORS.length];
  };

  const getCourseInitial = (displayName) => {
    if (!displayName) return "?";
    const first = displayName.charAt(0);
    if (/[A-Za-z0-9]/.test(first)) return first.toUpperCase();
    return first;
  };

  const renderQuickNav = (courses) => {
    const root = ensureQuickNavShell();
    if (!root) return;

    const listWrap = root.querySelector(".ux-course-quick-nav-list-wrap");
    if (!listWrap) return;

    listWrap.textContent = "";
    if (!Array.isArray(courses) || courses.length === 0) {
      removeQuickNav();
      return;
    }

    const currentCourseId = extractCourseIdFromUrl(window.location.href);
    const list = document.createElement("ul");
    list.className = "ux-course-quick-nav-list";

    courses.forEach((course) => {
      const li = document.createElement("li");
      li.className = "ux-course-quick-nav-item";

      const link = document.createElement("a");
      link.className = "ux-course-quick-nav-link";
      if (course.id && currentCourseId && course.id === currentCourseId) {
        link.classList.add("is-active");
      }
      link.href = course.url;
      const scheduleLabel = getQuickNavScheduleLabel(course.schedulePosition);
      link.title = scheduleLabel
        ? `${course.displayName} (${scheduleLabel})`
        : course.displayName;
      link.dataset.uxCourseQuickNav = "1";

      const iconColor = getCourseIconColor(course.id);
      const initial = getCourseInitial(course.displayName);

      const icon = document.createElement("span");
      icon.className = "ux-course-quick-nav-icon";
      icon.textContent = initial;
      icon.style.backgroundColor = iconColor;

      const nameSpan = document.createElement("span");
      nameSpan.className = "ux-course-quick-nav-name";
      nameSpan.textContent = course.displayName;

      link.appendChild(icon);
      link.appendChild(nameSpan);
      if (scheduleLabel) {
        const scheduleSpan = document.createElement("span");
        scheduleSpan.className = "ux-course-quick-nav-schedule";
        scheduleSpan.textContent = scheduleLabel;
        link.appendChild(scheduleSpan);
      }
      li.appendChild(link);
      list.appendChild(li);
    });

    listWrap.appendChild(list);
  };

  const refreshQuickNav = async () => {
    await loadQuickNavCollapsedPreference();
    let courseLinks = await collectCourseLinksFromHomePage();
    if (!Array.isArray(courseLinks) || courseLinks.length === 0) {
      courseLinks = collectCourseLinksFromCurrentPage();
    }
    if (courseLinks.length === 0) {
      removeQuickNav();
      return;
    }

    const caches = await loadCourseNameCaches();
    const courses = courseLinks
      .map((course) => ({
        ...course,
        displayName: resolveQuickNavDisplayName(course, caches),
      }))
      .sort(compareQuickNavCourses);
    renderQuickNav(courses);
  };

  let quickNavWarmupScheduled = false;
  const scheduleQuickNavWarmupRefresh = () => {
    if (quickNavWarmupScheduled) return;
    quickNavWarmupScheduled = true;
    [350, 1100, 2200].forEach((delay) => {
      window.setTimeout(() => {
        void refreshQuickNav();
      }, delay);
    });
  };

  let quickNavStorageListenerBound = false;
  const bindQuickNavStorageRefresh = () => {
    if (quickNavStorageListenerBound) return;
    if (!chrome?.storage?.onChanged?.addListener) return;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes) return;
      if (changes[STORAGE_KEY_COURSE_QUICK_NAV_COLLAPSED]) {
        quickNavCollapsedPreference =
          changes[STORAGE_KEY_COURSE_QUICK_NAV_COLLAPSED].newValue === true;
        const root = document.getElementById(QUICK_NAV_ID);
        if (typeof root?.__setCollapsedState === "function") {
          root.__setCollapsedState(quickNavCollapsedPreference);
        }
      }
      if (
        changes[STORAGE_KEY_CUSTOM_COURSE_NAMES] ||
        changes[STORAGE_KEY_OPENAI_COURSE_CACHE] ||
        changes[STORAGE_KEY_OPENAI_COURSE_CACHE_LEGACY] ||
        changes[STORAGE_KEY_SHORT_COURSE_CACHE]
      ) {
        void refreshQuickNav();
      }
    });
    quickNavStorageListenerBound = true;
  };

  const injectStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    ensureCourseColorTokens(document);

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
            body.${BODY_CLASS} {
                background: var(--ux-home-page-bg);
                color: #334155;
                --ux-course-quick-nav-width: 280px;
                padding-left: 0;
                box-sizing: border-box;
                transition: padding-left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                overflow-x: hidden;
            }

            body.${BODY_CLASS}.ux-course-quick-nav-enabled {
                padding-left: var(--ux-course-quick-nav-width);
            }

            body.${BODY_CLASS}.ux-course-quick-nav-enabled header,
            body.${BODY_CLASS}.ux-course-quick-nav-enabled #js-main,
            body.${BODY_CLASS}.ux-course-quick-nav-enabled footer {
                width: 100%;
                transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            }

            body.${BODY_CLASS} #top-info {
                position: static !important;
                z-index: auto !important;
                width: 100%;
                box-sizing: border-box;
                margin: 0 0 14px;
            }

            body.${BODY_CLASS} #js-main > .container > #top-info {
                display: block;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} {
                position: fixed;
                top: 0;
                left: 0;
                width: 280px;
                height: 100vh;
                display: flex;
                flex-direction: column;
                background: #ffffff;
                border-right: 1px solid #dbe4ef;
                box-shadow: 2px 0 12px rgba(15, 23, 42, 0.08);
                z-index: 1200;
                overflow: hidden;
                transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s ease;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID}.ux-collapsed {
                width: 64px;
                box-shadow: 2px 0 10px rgba(15, 23, 42, 0.05);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-header {
                display: flex;
                flex-direction: column;
                align-items: stretch;
                gap: 4px;
                padding: 8px 12px;
                border-bottom: 1px solid #dbe4ef;
                flex-shrink: 0;
                background: var(--ux-home-surface);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-home,
            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-controls {
                display: flex;
                align-items: center;
                gap: 14px;
                min-height: 40px;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-home {
                border-radius: 0 24px 24px 0;
                margin-right: 8px;
                padding: 6px 20px 6px 4px;
                color: #334155;
                text-decoration: none;
                font-size: 13px;
                font-weight: 700;
                transition: background-color 0.2s ease, color 0.2s ease;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-home:hover {
                background: #edf3ff;
                color: #1d4ed8;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-home-icon {
                display: inline-flex;
                width: 32px;
                height: 32px;
                min-width: 32px;
                padding: 6px;
                border-radius: 50%;
                color: #ffffff;
                background: #334155;
                box-sizing: border-box;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-home-label {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-title {
                font-size: 15px;
                font-weight: 700;
                color: #1e3a8a;
                letter-spacing: 0.01em;
                text-transform: none;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-toggle {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 40px;
                height: 40px;
                min-width: 40px;
                border: none;
                border-radius: 50%;
                background: transparent;
                color: #334155;
                cursor: pointer;
                transition: background-color 0.15s ease;
                padding: 0;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-toggle:hover {
                background: #edf3ff;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-toggle svg {
                display: block;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap {
                flex: 1;
                overflow-y: auto;
                padding: 8px 0;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list {
                margin: 0;
                padding: 0;
                list-style: none;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-item {
                margin: 0;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-item + .ux-course-quick-nav-item {
                margin-top: 0;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link {
                display: flex;
                align-items: center;
                gap: 14px;
                border-radius: 0 24px 24px 0;
                border: none;
                padding: 8px 20px 8px 16px;
                font-size: 13px;
                font-weight: 600;
                line-height: 1.35;
                color: #334155;
                background: transparent;
                text-decoration: none;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                transition: background-color 0.2s ease, color 0.2s ease;
                margin-right: 8px;
                min-height: 44px;
                min-width: 0;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link:hover {
                background: #edf3ff;
                color: #1d4ed8;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link.is-active {
                background: #dbeafe;
                color: #1e40af;
                font-weight: 700;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-icon {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                min-width: 32px;
                border-radius: 50%;
                color: #ffffff;
                font-size: 15px;
                font-weight: 600;
                line-height: 1;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-name {
                flex: 1 1 auto;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-schedule {
                flex: 0 0 auto;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 32px;
                height: 22px;
                padding: 0 7px;
                border-radius: 999px;
                background: #e2e8f0;
                color: #475569;
                font-size: 12px;
                font-weight: 700;
                line-height: 1;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap::-webkit-scrollbar {
                width: 4px;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap::-webkit-scrollbar-track {
                background: transparent;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap::-webkit-scrollbar-thumb {
                background: #c7d2fe;
                border-radius: 4px;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap::-webkit-scrollbar-thumb:hover {
                background: #93c5fd;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID}.ux-collapsed .ux-course-quick-nav-title,
            body.${BODY_CLASS} #${QUICK_NAV_ID}.ux-collapsed .ux-course-quick-nav-home-label,
            body.${BODY_CLASS} #${QUICK_NAV_ID}.ux-collapsed .ux-course-quick-nav-list-wrap {
                display: none;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID}.ux-collapsed .ux-course-quick-nav-header {
                align-items: center;
                padding: 8px 12px;
                border-bottom: 0;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID}.ux-collapsed .ux-course-quick-nav-home {
                justify-content: center;
                width: 40px;
                margin-right: 0;
                padding: 4px;
                border-radius: 50%;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID}.ux-collapsed .ux-course-quick-nav-controls {
                justify-content: center;
                width: 40px;
                min-height: 40px;
            }

            body.${BODY_CLASS} header .container,
            body.${BODY_CLASS} #js-main > .container,
            body.${BODY_CLASS} footer .container {
                width: auto;
                max-width: 1320px;
            }

            body.${BODY_CLASS} header {
                border-bottom: 0 !important;
                box-shadow: none !important;
            }

            body.${BODY_CLASS} .navbar.navbar-default {
                position: relative;
                z-index: 2000;
                min-height: 0 !important;
                margin-bottom: 0;
                border-width: 0;
                border-color: #e2e8f0;
                background: rgba(255, 255, 255, 0.96);
                box-shadow: none;
            }

            body.${BODY_CLASS} .ux-course-section-nav {
                position: -webkit-sticky;
                position: sticky;
                top: 0;
                z-index: 1100;
                margin: 0 0 14px;
                border-bottom: 1px solid #e2e8f0;
                background: rgba(255, 255, 255, 0.96);
                box-shadow: 0 10px 18px -16px rgba(15, 23, 42, 0.32);
                backdrop-filter: blur(10px);
            }

            body.${BODY_CLASS} .navbar.navbar-default > .container {
                min-height: 0 !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-header {
                min-height: 0 !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-collapse {
                min-height: 0 !important;
                padding-top: 0;
                padding-bottom: 0;
            }

            body.${BODY_CLASS} .navbar-default .ux-course-empty-menu-shell,
            body.${BODY_CLASS} .navbar-default .navbar-collapse.ux-course-empty-menu {
                display: none !important;
                height: 0 !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                border: 0 !important;
                overflow: hidden !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-brand {
                height: auto !important;
                min-height: 0 !important;
                padding-top: 13px;
                padding-bottom: 13px;
                line-height: 34px;
            }

            body.${BODY_CLASS} .navbar-default .navbar-brand .course-webclass {
                display: none !important;
            }

            body.${BODY_CLASS} .ux-course-list-button-hidden {
                display: none !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li:has(> a[href^="logout"]),
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li:has(> a[href*="/logout"]),
            body.${BODY_CLASS} header .navbar-nav.navbar-right > li:has(> a[href^="logout"]),
            body.${BODY_CLASS} header .navbar-nav.navbar-right > li:has(> a[href*="/logout"]) {
                display: none !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right {
                display: flex !important;
                align-items: center;
                justify-content: flex-end;
                gap: 5px;
                min-height: 42px;
                margin-top: 0;
                margin-bottom: 0;
                padding: 4px 0;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right.ux-course-header-actions {
                min-height: 0;
                padding-top: 13px;
                padding-bottom: 13px;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a {
                padding-top: 0;
                padding-bottom: 0;
                line-height: 1;
            }

            body.${BODY_CLASS} .ux-course-section-nav-inner {
                width: auto;
                max-width: 1320px;
                margin: 0 auto;
                padding: 0 15px;
            }

            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav.navbar-left {
                float: none !important;
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 4px;
                margin: 0;
                min-height: 48px;
            }

            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li {
                float: none !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-brand .course-webclass,
            body.${BODY_CLASS} .navbar-default .navbar-brand .course-name {
                color: #1e3a8a;
                transition: color 0.2s ease;
            }

            body.${BODY_CLASS} .navbar-default .navbar-brand .course-webclass:hover,
            body.${BODY_CLASS} .navbar-default .navbar-brand .course-name:hover {
                color: #2563eb;
            }

            /* Keep only the account image; language-switch labels must remain visible. */
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-account > span,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.dropdown-toggle[title="アカウントメニュー"] > span,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.dropdown-toggle[title*="Account"] > span {
                display: none !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li.ux-course-header-action-item {
                float: none !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                margin: 0 !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-language,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-account,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > #notification-dropdown-area > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a[title="アカウントメニュー"],
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a[title*="Account"] {
                position: relative;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 34px !important;
                height: 34px !important;
                min-width: 34px !important;
                min-height: 0 !important;
                padding: 0 !important;
                border: 1px solid transparent;
                border-radius: 9px !important;
                color: #475569;
                font-size: 17px;
                line-height: 1 !important;
                box-sizing: border-box !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-language {
                width: auto !important;
                max-width: 80px;
                padding: 0 8px !important;
                font-size: 12px;
                font-weight: 600;
                white-space: nowrap;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox img,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox svg,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-language img,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-language svg {
                width: 18px !important;
                height: 18px !important;
                object-fit: contain;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-account > img,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.dropdown-toggle[title="アカウントメニュー"] > img,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.dropdown-toggle[title*="Account"] > img {
                width: 28px !important;
                height: 28px !important;
                border-width: 1px !important;
                border-radius: 50% !important;
                box-sizing: border-box !important;
                object-fit: cover;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav > li > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li > a {
                border-radius: 8px;
                transition: background-color 0.2s ease, color 0.2s ease;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav > li > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav > .active > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav > .active > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav > .active > a:focus,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > .active > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > .active > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > .active > a:focus {
                background-color: #edf3ff;
                color: #2563eb;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav > li.open > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav > li.open > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav > li.open > a:focus,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li.open > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li.open > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li.open > a:focus {
                background-color: #edf3ff;
                color: #2563eb;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav > li.dropdown.open,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li.dropdown.open {
                position: relative;
                z-index: 2001;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu {
                z-index: 2002;
                margin-top: 6px;
                padding: 4px;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                background: #ffffff;
                box-shadow: 0 8px 16px rgba(15, 23, 42, 0.12);
                min-width: 210px;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > li > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > li > a {
                display: block;
                border-radius: 6px;
                padding: 6px 10px;
                font-size: 12px;
                color: #334155;
                text-decoration: none;
                white-space: nowrap;
                transition: background-color 0.2s ease, color 0.2s ease;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > li > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > li > a:focus,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > li > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > li > a:focus {
                background: #e8f2ff;
                color: #334155;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > .active > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > .active > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > .active > a:focus,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > .active > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > .active > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > .active > a:focus {
                background: #dbeafe;
                color: #1e3a8a;
                font-weight: 600;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu .divider,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu .divider {
                margin: 4px 0;
                background: #e2e8f0;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a[href*="logout.php"] {
                display: none !important;
            }

            /* Exception: enlarge left-header dropdown (course menu) text */
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-left > li.dropdown > .dropdown-menu > li > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav.navbar-left > li.dropdown > .dropdown-menu > li > a {
                font-size: 14px !important;
                line-height: 1.4;
                padding-top: 8px;
                padding-bottom: 8px;
            }

            body.${BODY_CLASS} #js-main > .container {
                margin-top: 14px;
                margin-bottom: 20px;
            }

            @media (min-width: 1200px) {
                body.${BODY_CLASS} .cm-contentsList .col-xs-12.col-sm-8.col-md-9.col-lg-10 {
                    width: calc(100% - clamp(220px, 23%, 300px)) !important;
                }

                body.${BODY_CLASS} .cm-contentsList .col-sm-4.col-md-3.col-lg-2.cm-sideNav_container {
                    width: clamp(220px, 23%, 300px) !important;
                }
            }

            body.${BODY_CLASS} #js-contents .page-header {
                margin-top: 0;
                border-bottom: 1px solid #dbe4ef;
                color: #334155;
                font-weight: 700;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder {
                margin-bottom: 14px;
                border: 1px solid #dbe4ef;
                border-radius: 14px;
                overflow: hidden;
                box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
                background: #ffffff;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder .panel-heading {
                background: var(--ux-home-surface-muted);
                border-bottom: 1px solid #dbe4ef;
                padding-top: 12px;
                padding-bottom: 12px;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder .panel-title {
                color: #1e3a8a;
                font-weight: 700;
                letter-spacing: 0.01em;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem {
                --ux-content-item-hover-bg: #f8fbff;
                --ux-content-label-bg: #f1f5f9;
                --ux-content-label-color: #475569;
                --ux-content-label-border: #dbe4ef;
                --ux-content-action-bg: #ffffff;
                --ux-content-action-border: #d1d5db;
                --ux-content-action-color: #6b7280;
                --ux-content-action-hover-bg: #ffffff;
                --ux-content-action-hover-border: #c5cad3;
                --ux-content-action-hover-color: #6b7280;
                border-right: 0;
                border-color: #edf2f8;
                border-left: 4px solid transparent;
                padding: 14px 16px;
                transition: background-color 0.2s ease, border-color 0.2s ease;
                background: #ffffff;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem:hover {
                background: var(--ux-content-item-hover-bg);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_content {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 14px;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentInfo {
                min-width: 0;
                flex: 1;
            }

            body.${BODY_CLASS} .cm-contentsList .cm-contentsList_contentName {
                margin-top: 0;
                margin-bottom: 8px;
                line-height: 1.45;
            }

            body.${BODY_CLASS} .cm-contentsList .cm-contentsList_contentName a {
                color: #1f2937;
                text-decoration: none;
                transition: color 0.2s ease;
            }

            body.${BODY_CLASS} .cm-contentsList .cm-contentsList_contentName a:hover {
                color: #1f2937;
            }

            /* Gray-out items without a valid link. */
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-contents-disabled .cl-contentsList_contentInfo {
                opacity: 0.5;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-contents-disabled .cm-contentsList_contentName {
                color: #9ca3af;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-contents-disabled .cl-contentsList_contentDetailListItemData a[href*="history"] {
                opacity: 0.5;
                color: #9ca3af;
                border-color: #d1d5db;
                background: #ffffff;
                font-weight: 400;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-contents-disabled:hover {
                background: #ffffff;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_new {
                display: block;
                width: max-content;
                margin: 0 0 4px -8px;
                padding: 1px 8px;
                border-radius: 999px;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.02em;
                background: #ef4444;
                color: #ffffff;
                vertical-align: middle;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_categoryLabel {
                display: inline-flex;
                align-items: center;
                border-radius: 999px;
                padding: 2px 10px;
                border: 1px solid var(--ux-content-label-border);
                background: var(--ux-content-label-bg);
                color: var(--ux-content-label-color);
                font-size: 12px;
                font-weight: 600;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailList {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                justify-content: flex-end;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailList:has(a[href*="history"]) {
                flex-direction: row-reverse;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItem {
                margin: 0;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-height: 34px;
                padding: 0 12px;
                border: 1px solid var(--ux-content-action-border);
                border-radius: 8px;
                background: var(--ux-content-action-bg);
                color: var(--ux-content-action-color);
                text-decoration: none;
                font-weight: 600;
                transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a:hover {
                background: var(--ux-content-action-hover-bg);
                border-color: var(--ux-content-action-hover-border);
                color: var(--ux-content-action-hover-color);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="/contents/"],
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="history"],
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="/contents/"]:hover,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="history"]:hover {
                background: #ffffff;
                border-color: #d1d5db;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="/contents/"]:not([href*="/history"]) {
                width: 34px;
                padding: 0;
                font-size: 0;
                font-weight: 400;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="/contents/"]:not([href*="/history"])::before {
                content: "...";
                font-size: 18px;
                font-weight: 400;
                line-height: 0;
                letter-spacing: 1px;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiryou {
                --ux-content-item-hover-bg: #f4f8ff;
                --ux-content-label-bg: #eaf2ff;
                --ux-content-label-color: #1f2937;
                --ux-content-label-border: #bfdbfe;
                --ux-content-action-bg: #eff6ff;
                --ux-content-action-border: #bfdbfe;
                --ux-content-action-color: #1f2937;
                --ux-content-action-hover-bg: #dbeafe;
                --ux-content-action-hover-border: #93c5fd;
                --ux-content-action-hover-color: #1f2937;
                border-left-color: #60a5fa;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiryou .cm-contentsList_contentName,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiryou .cm-contentsList_contentName a {
                color: #1f2937;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiryou .cm-contentsList_contentName a:hover {
                color: #1f2937;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiken {
                --ux-content-item-hover-bg: #fff8f1;
                --ux-content-label-bg: #fff2e8;
                --ux-content-label-color: #1f2937;
                --ux-content-label-border: #fdba74;
                --ux-content-action-bg: #fff7ed;
                --ux-content-action-border: #fdba74;
                --ux-content-action-color: #1f2937;
                --ux-content-action-hover-bg: #ffedd5;
                --ux-content-action-hover-border: #fb923c;
                --ux-content-action-hover-color: #1f2937;
                border-left-color: #f59e0b;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiken .cm-contentsList_contentName,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiken .cm-contentsList_contentName a {
                color: #1f2937;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiken .cm-contentsList_contentName a:hover {
                color: #1f2937;
            }

            body.${BODY_CLASS} .cm-sideNav_container {
                position: static;
                background: transparent;
                border: 0;
                border-radius: 0;
                padding-top: 0;
                padding-bottom: 0;
                box-shadow: none;
            }

            body.${BODY_CLASS} .ux-course-sideNav-sticky {
                position: -webkit-sticky;
                position: sticky;
                top: 84px;
                max-height: calc(100vh - 104px);
                background: #ffffff;
                border: 1px solid #dbe4ef;
                border-radius: 14px;
                padding: 12px;
                box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
                z-index: 50;
            }

            body.${BODY_CLASS} .cm-sideNav_folders {
                margin: 0;
                padding: 0;
                max-height: calc(100vh - 132px);
                overflow: auto;
                list-style: none;
            }

            body.${BODY_CLASS} .cm-sideNav_folders > li + li {
                margin-top: 6px;
            }

            body.${BODY_CLASS} .cm-sideNav_folderLink {
                display: block;
                padding: 8px 10px;
                border-radius: 10px;
                border: 1px solid transparent;
                text-decoration: none;
                color: #64748b;
                transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
            }

            body.${BODY_CLASS} .cm-sideNav_folderLink:hover {
                background: #edf3ff;
                color: #2563eb;
                border-color: #c7d8ff;
            }

            body.${BODY_CLASS} .timeline-messages {
                border: 1px solid #dbe4ef;
                border-radius: 12px;
                background: #ffffff;
                padding: 0;
                box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
                scroll-margin-top: 86px;
            }

            body.${BODY_CLASS} .ux-course-timeline-panel {
                display: none;
                margin: 0 0 14px;
            }

            body.${BODY_CLASS}.${COURSE_TIMELINE_VIEW_CLASS} .ux-course-timeline-panel:not([hidden]) {
                display: block;
            }

            body.${BODY_CLASS}:not(.${COURSE_TIMELINE_VIEW_CLASS}) #js-contents .cm-contentsList.tab-pane {
                float: none !important;
                width: 100% !important;
            }

            body.${BODY_CLASS}.${COURSE_TIMELINE_VIEW_CLASS} #js-contents .tab-content,
            body.${BODY_CLASS}.${COURSE_TIMELINE_VIEW_CLASS} #js-contents .cm-contentsList {
                display: none !important;
            }

            body.${BODY_CLASS} .ux-course-timeline-panel .${COURSE_TIMELINE_SOURCE_CLASS} {
                float: none !important;
                width: 100% !important;
                max-width: none !important;
                padding-left: 0;
                padding-right: 0;
            }

            body.${BODY_CLASS} .ux-course-timeline-panel .${COURSE_TIMELINE_SOURCE_CLASS} > .page-header {
                margin-bottom: 12px;
            }

            body.${BODY_CLASS}.${COURSE_TIMELINE_VIEW_CLASS} .ux-course-timeline-panel .timeline-messages {
                margin-bottom: 0;
            }

            body.${BODY_CLASS} .timeline-messages:focus-visible {
                outline: 3px solid rgba(10, 132, 255, 0.3);
                outline-offset: 4px;
            }

            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li.${COURSE_TIMELINE_NAV_ITEM_CLASS} > a:focus-visible {
                outline: 3px solid rgba(10, 132, 255, 0.24);
                outline-offset: 2px;
            }

            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li.${COURSE_TIMELINE_NAV_ITEM_CLASS}.ux-timeline-current > a {
                background: #edf3ff;
                color: #2563eb;
            }

            body.${BODY_CLASS} .btn.btn-default {
                border-color: #cbd5e1;
                background: #ffffff;
                color: #334155;
            }

            body.${BODY_CLASS} .btn.btn-default:hover {
                border-color: #9fb9ff;
                background: #edf3ff;
                color: #2563eb;
            }

            body.${BODY_CLASS} .btn.btn-primary {
                border-color: #2563eb;
                background: #2563eb;
                box-shadow: 0 2px 8px rgba(37, 99, 235, 0.22);
            }

            body.${BODY_CLASS} .btn.btn-primary:hover,
            body.${BODY_CLASS} .btn.btn-primary:focus {
                border-color: #1d4ed8;
                background: #1d4ed8;
            }

            body.${BODY_CLASS} .ft-footer {
                border-top: 1px solid #e2e8f0;
                background: transparent;
            }

            body.${BODY_CLASS} .ft-footer .ft-footer_message {
                color: #64748b;
            }

            @media (max-width: 1199px) {
                body.${BODY_CLASS} .cm-contentsList .cl-contentsList_content {
                    flex-direction: column;
                    gap: 10px;
                }

                body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailList {
                    justify-content: flex-start;
                }
            }

            @media (max-width: 991px) {
                body.${BODY_CLASS} #js-main > .container {
                    padding-left: 12px;
                    padding-right: 12px;
                }

                body.${BODY_CLASS} .cm-sideNav_container {
                    position: static;
                    margin-top: 12px;
                }

                body.${BODY_CLASS} .ux-course-sideNav-sticky {
                    position: static;
                    max-height: none;
                }

                body.${BODY_CLASS} .cm-sideNav_folders {
                    max-height: none;
                }

                body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder {
                    border-radius: 12px;
                }
            }

            @media (max-width: 991px) {
                body.${BODY_CLASS} #${QUICK_NAV_ID} {
                    display: none !important;
                }

                body.${BODY_CLASS}.ux-course-quick-nav-enabled {
                    padding-left: 0;
                }

                body.${BODY_CLASS} #js-main > .container,
                body.${BODY_CLASS} header .container,
                body.${BODY_CLASS} .ux-course-section-nav-inner,
                body.${BODY_CLASS} footer .container {
                    margin-left: auto;
                    margin-right: auto;
                    padding-left: 12px;
                }

                body.${BODY_CLASS} .ux-course-section-nav {
                    margin-bottom: 12px;
                }

                body.${BODY_CLASS} .ux-course-section-nav-inner {
                    overflow-x: auto;
                    padding-right: 12px;
                }

                body.${BODY_CLASS} .ux-course-section-nav .navbar-nav.navbar-left {
                    flex-wrap: nowrap;
                    min-height: 46px;
                    white-space: nowrap;
                }
            }
        `;

    style.textContent += `
            body.${BODY_CLASS} {
                background: var(--ux-home-page-bg);
                color: var(--ux-home-label);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} {
                background: var(--ux-home-surface);
                border-right: 1px solid var(--ux-home-separator);
                box-shadow: var(--ux-home-shadow-md);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-header {
                background: var(--ux-home-surface);
                border-bottom: 1px solid var(--ux-home-separator);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-title,
            body.${BODY_CLASS} .navbar-default .navbar-brand .course-webclass,
            body.${BODY_CLASS} .navbar-default .navbar-brand .course-name,
            body.${BODY_CLASS} #js-contents .page-header,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder .panel-title {
                color: var(--ux-home-label);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-home,
            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-toggle,
            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > li > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > li > a,
            body.${BODY_CLASS} .btn.btn-default,
            body.${BODY_CLASS} .cm-sideNav_folderLink,
            body.${BODY_CLASS} .ft-footer .ft-footer_message {
                color: var(--ux-home-secondary-label);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-home:hover,
            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-toggle:hover,
            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav > li > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav > .active > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav > .active > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav > .active > a:focus,
            body.${BODY_CLASS} .navbar-default .navbar-nav > li.open > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav > li.open > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav > li.open > a:focus,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > li > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > li > a:focus,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > .active > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > .active > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > .active > a:focus,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li.open > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li.open > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li.open > a:focus,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > li > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > li > a:focus,
            body.${BODY_CLASS} .btn.btn-default:hover,
            body.${BODY_CLASS} .cm-sideNav_folderLink:hover {
                background: var(--ux-home-accent-softer);
                color: var(--ux-home-accent-emphasis);
                border-color: var(--ux-home-accent-soft);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link.is-active,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > .active > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > .active > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > .active > a:focus,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > .active > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > .active > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > .active > a:focus {
                background: var(--ux-home-accent-soft);
                color: var(--ux-home-accent-emphasis);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-schedule {
                background: var(--ux-home-fill);
                color: var(--ux-home-secondary-label);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link:hover .ux-course-quick-nav-schedule,
            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link.is-active .ux-course-quick-nav-schedule {
                background: var(--ux-home-accent-soft);
                color: var(--ux-home-accent-emphasis);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-home-icon,
            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-icon {
                color: var(--ux-home-surface);
                box-shadow: var(--ux-home-shadow-sm);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap::-webkit-scrollbar-thumb {
                background: var(--ux-home-fill-strong);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap::-webkit-scrollbar-thumb:hover {
                background: var(--ux-home-separator-strong);
            }

            body.${BODY_CLASS} .navbar.navbar-default,
            body.${BODY_CLASS} .ux-course-section-nav,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder,
            body.${BODY_CLASS} .ux-course-sideNav-sticky,
            body.${BODY_CLASS} .timeline-messages {
                background: var(--ux-home-surface);
                border-color: var(--ux-home-separator);
                box-shadow: var(--ux-home-shadow-md);
            }

            body.${BODY_CLASS} .navbar.navbar-default,
            body.${BODY_CLASS} .ux-course-section-nav {
                background: var(--ux-home-header-backdrop);
                border-color: var(--ux-home-separator);
                backdrop-filter: blur(10px);
            }

            body.${BODY_CLASS} .navbar.navbar-default {
                box-shadow: none;
            }

            body.${BODY_CLASS} .ux-course-section-nav {
                box-shadow: 0 10px 18px -16px rgba(15, 23, 42, 0.32);
            }

            body.${BODY_CLASS} .navbar-default .navbar-brand .course-webclass:hover,
            body.${BODY_CLASS} .navbar-default .navbar-brand .course-name:hover {
                color: var(--ux-home-accent-emphasis);
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu .divider,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu .divider {
                background: var(--ux-home-separator);
            }

            body.${BODY_CLASS} .ft-footer {
                border-color: var(--ux-home-separator);
                background: transparent;
            }

            body.${BODY_CLASS} #js-contents .page-header,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder .panel-heading {
                border-bottom: 1px solid var(--ux-home-separator);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder .panel-heading {
                background: var(--ux-home-surface-muted);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem {
                --ux-content-item-hover-bg: var(--ux-home-accent-softer);
                --ux-content-label-bg: var(--ux-home-surface-soft);
                --ux-content-label-color: var(--ux-home-secondary-label);
                --ux-content-label-border: var(--ux-home-separator);
                --ux-content-action-bg: var(--ux-home-surface);
                --ux-content-action-border: var(--ux-home-separator);
                --ux-content-action-color: var(--ux-home-label);
                --ux-content-action-hover-bg: var(--ux-home-accent-softer);
                --ux-content-action-hover-border: var(--ux-home-accent-soft);
                --ux-content-action-hover-color: var(--ux-home-label);
                background: var(--ux-home-surface);
                border-color: rgba(60, 60, 67, 0.08);
            }

            body.${BODY_CLASS} .cm-contentsList .cm-contentsList_contentName a {
                color: var(--ux-home-label);
            }

            body.${BODY_CLASS} .cm-contentsList .cm-contentsList_contentName a:hover {
                color: var(--ux-home-label);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-contents-disabled .cm-contentsList_contentName {
                color: var(--ux-home-quaternary-label);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-contents-disabled .cl-contentsList_contentDetailListItemData a[href*="history"] {
                opacity: 0.5;
                color: var(--ux-home-quaternary-label);
                border-color: var(--ux-home-separator);
                background: var(--ux-home-surface);
                font-weight: 400;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-contents-disabled:hover {
                background: var(--ux-home-surface);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_new {
                background: var(--ux-home-danger);
                color: var(--ux-home-surface);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiryou {
                --ux-content-item-hover-bg: rgba(10, 132, 255, 0.08);
                --ux-content-label-bg: var(--ux-home-accent-soft);
                --ux-content-label-color: var(--ux-home-label);
                --ux-content-label-border: rgba(10, 132, 255, 0.22);
                --ux-content-action-bg: rgba(10, 132, 255, 0.08);
                --ux-content-action-border: rgba(10, 132, 255, 0.22);
                --ux-content-action-color: var(--ux-home-label);
                --ux-content-action-hover-bg: rgba(10, 132, 255, 0.14);
                --ux-content-action-hover-border: rgba(10, 132, 255, 0.28);
                --ux-content-action-hover-color: var(--ux-home-label);
                border-left-color: var(--ux-home-accent);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiryou .cm-contentsList_contentName,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiryou .cm-contentsList_contentName a,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiryou .cm-contentsList_contentName a:hover {
                color: var(--ux-home-label);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiken {
                --ux-content-item-hover-bg: rgba(255, 159, 10, 0.1);
                --ux-content-label-bg: var(--ux-home-warning-soft);
                --ux-content-label-color: var(--ux-home-label);
                --ux-content-label-border: rgba(255, 159, 10, 0.28);
                --ux-content-action-bg: rgba(255, 159, 10, 0.1);
                --ux-content-action-border: rgba(255, 159, 10, 0.28);
                --ux-content-action-color: var(--ux-home-label);
                --ux-content-action-hover-bg: rgba(255, 159, 10, 0.18);
                --ux-content-action-hover-border: rgba(255, 159, 10, 0.34);
                --ux-content-action-hover-color: var(--ux-home-label);
                border-left-color: var(--ux-home-warning);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiken .cm-contentsList_contentName,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiken .cm-contentsList_contentName a,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiken .cm-contentsList_contentName a:hover {
                color: var(--ux-home-label);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="/contents/"],
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="history"],
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="/contents/"]:hover,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="history"]:hover {
                background: var(--ux-home-surface);
                border-color: var(--ux-home-separator);
            }

            body.${BODY_CLASS} .btn.btn-default {
                background: var(--ux-home-surface);
                border-color: var(--ux-home-separator);
            }

            body.${BODY_CLASS} .btn.btn-primary {
                background: var(--ux-home-accent);
                border-color: var(--ux-home-accent);
                color: var(--ux-home-surface);
                box-shadow: var(--ux-home-shadow-sm);
            }

            body.${BODY_CLASS} .btn.btn-primary:hover,
            body.${BODY_CLASS} .btn.btn-primary:focus {
                background: var(--ux-home-accent-emphasis);
                border-color: var(--ux-home-accent-emphasis);
            }
        `;

    (document.head || document.documentElement).appendChild(style);
  };

  const ensureSideNavStickyCard = () => {
    const sideNav = document.querySelector(".cm-sideNav_container");
    if (!sideNav) return;

    let stickyCard = sideNav.querySelector(
      ":scope > .ux-course-sideNav-sticky",
    );
    if (!stickyCard) {
      stickyCard = document.createElement("div");
      stickyCard.className = "ux-course-sideNav-sticky";
      while (sideNav.firstChild) {
        stickyCard.appendChild(sideNav.firstChild);
      }
      sideNav.appendChild(stickyCard);
    }

    const syncSideNavHeight = () => {
      const mainColumn = document.querySelector(
        ".cm-contentsList .col-xs-12.col-sm-8.col-md-9.col-lg-10",
      );
      if (!mainColumn || window.matchMedia("(max-width: 991px)").matches) {
        sideNav.style.removeProperty("min-height");
        return;
      }

      const mainHeight = Math.ceil(mainColumn.getBoundingClientRect().height);
      sideNav.style.minHeight = `${Math.max(mainHeight, window.innerHeight)}px`;
    };

    syncSideNavHeight();
    window.setTimeout(syncSideNavHeight, 250);
    window.setTimeout(syncSideNavHeight, 1000);

    if (!sideNav.dataset.uxStickyHeightBound) {
      window.addEventListener("resize", syncSideNavHeight, { passive: true });
      sideNav.dataset.uxStickyHeightBound = "1";
    }
  };

  const normalizeCourseNavText = (text) => {
    return (text || "")
      .replace(/\s+/g, "")
      .replace(/[▼▾▿]/g, "")
      .trim()
      .toLowerCase();
  };

  const getCourseSectionNavList = () => {
    return (
      document.querySelector(
        ".ux-course-section-nav .navbar-nav.navbar-left",
      ) ||
      document.querySelector(
        "header .navbar.navbar-default .navbar-nav.navbar-left, .navbar.navbar-default .navbar-nav.navbar-left",
      )
    );
  };

  const getTimelineMessagesElement = () => {
    return document.querySelector(".timeline-messages");
  };

  const isTimelineHeader = (element) => {
    if (!element) return false;
    return (
      normalizeCourseNavText(element.textContent || "") ===
      normalizeCourseNavText("タイムライン")
    );
  };

  const getCourseTimelineHeader = (scope = document) => {
    return (
      Array.from(
        scope.querySelectorAll(
          "#js-contents .page-header, #js-contents h1, #js-contents h2, #js-contents h3, #js-contents h4",
        ),
      ).find((element) => {
        if (element.closest(`#${COURSE_TIMELINE_PANEL_ID}`)) return false;
        return isTimelineHeader(element);
      }) || null
    );
  };

  const getCourseTimelineSourceColumn = () => {
    const existingSource = document.querySelector(
      `.${COURSE_TIMELINE_SOURCE_CLASS}`,
    );
    if (existingSource) return existingSource;

    const timeline = getTimelineMessagesElement();
    const timelineColumn = timeline?.closest('#js-contents [class*="col-"]');
    if (
      timelineColumn &&
      !timelineColumn.classList.contains("cm-contentsList") &&
      !timelineColumn.classList.contains("cm-sideNav_container")
    ) {
      return timelineColumn;
    }

    const header = getCourseTimelineHeader();
    return (
      header?.closest('#js-contents [class*="col-"]') ||
      header?.parentElement ||
      null
    );
  };

  const getCourseContentsRoot = () => {
    return document.querySelector("#js-contents");
  };

  const prepareTimelineTarget = () => {
    const timeline = getTimelineMessagesElement();
    if (!timeline) return null;

    if (!timeline.id) {
      timeline.id = COURSE_TIMELINE_TARGET_ID;
    }
    if (!timeline.hasAttribute("tabindex")) {
      timeline.tabIndex = -1;
    }
    if (!timeline.hasAttribute("role")) {
      timeline.setAttribute("role", "region");
    }
    if (
      !timeline.hasAttribute("aria-label") &&
      !timeline.hasAttribute("aria-labelledby")
    ) {
      timeline.setAttribute("aria-label", "タイムライン");
    }

    return timeline;
  };

  const prepareTimelineSourceColumn = () => {
    const sourceColumn = getCourseTimelineSourceColumn();
    if (!sourceColumn) return null;

    sourceColumn.classList.add(COURSE_TIMELINE_SOURCE_CLASS);

    const header = Array.from(
      sourceColumn.querySelectorAll(".page-header, h1, h2, h3, h4"),
    ).find(isTimelineHeader);
    if (header && !header.id) {
      header.id = "ux-course-timeline-title";
    }

    return sourceColumn;
  };

  const ensureTimelinePanel = () => {
    const sourceColumn = prepareTimelineSourceColumn();
    const timeline = prepareTimelineTarget();
    if (!sourceColumn && !timeline) return null;

    const contentsRoot = getCourseContentsRoot();
    if (!contentsRoot) return null;

    let panel = document.getElementById(COURSE_TIMELINE_PANEL_ID);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = COURSE_TIMELINE_PANEL_ID;
      panel.className = "ux-course-timeline-panel";
      panel.setAttribute("aria-label", "タイムライン");
      panel.tabIndex = -1;
      panel.hidden = true;

      const anchor =
        Array.from(contentsRoot.children).find(
          (child) => child.id !== COURSE_TIMELINE_PANEL_ID,
        ) || null;
      contentsRoot.insertBefore(panel, anchor);
    }

    if (sourceColumn && sourceColumn.parentElement !== panel) {
      panel.appendChild(sourceColumn);
    } else if (!sourceColumn && timeline && timeline.parentElement !== panel) {
      panel.appendChild(timeline);
    }

    const preparedSource = sourceColumn || prepareTimelineSourceColumn();
    if (preparedSource && timeline && !preparedSource.contains(timeline)) {
      preparedSource.appendChild(timeline);
    }

    return panel;
  };

  const findCourseNavItemByLabel = (navList, labels) => {
    if (!navList) return null;

    const normalizedLabels = labels.map(normalizeCourseNavText).filter(Boolean);

    return (
      Array.from(navList.children).find((item) => {
        if (item.classList?.contains(COURSE_TIMELINE_NAV_ITEM_CLASS))
          return false;

        const link = item.querySelector(":scope > a");
        const label = normalizeCourseNavText(
          link?.textContent || item.textContent || "",
        );
        if (!label) return false;

        return normalizedLabels.some(
          (targetLabel) => label === targetLabel || label.includes(targetLabel),
        );
      }) || null
    );
  };

  const positionTimelineNavItem = (navList, navItem) => {
    if (!navList || !navItem) return;

    const attendanceItem = findCourseNavItemByLabel(navList, [
      "出席",
      "Attendance",
    ]);
    const otherItem = findCourseNavItemByLabel(navList, ["その他", "Other"]);

    if (otherItem && navItem.nextElementSibling !== otherItem) {
      navList.insertBefore(navItem, otherItem);
      return;
    }

    if (attendanceItem && attendanceItem.nextElementSibling !== navItem) {
      navList.insertBefore(navItem, attendanceItem.nextElementSibling);
      return;
    }

    if (navItem.parentElement !== navList) {
      navList.appendChild(navItem);
    }
  };

  const getTimelineViewActive = () => {
    const currentHash = (window.location.hash || "").replace(/^#/, "");
    return (
      currentHash === COURSE_TIMELINE_HASH ||
      currentHash === COURSE_TIMELINE_TARGET_ID ||
      currentHash === COURSE_TIMELINE_PANEL_ID
    );
  };

  const syncCourseNavActiveState = (timelineActive) => {
    const navList = getCourseSectionNavList();
    const timelineNavItem = navList?.querySelector(
      `:scope > .${COURSE_TIMELINE_NAV_ITEM_CLASS}`,
    );
    if (!navList || !timelineNavItem) return;

    Array.from(navList.children).forEach((item) => {
      if (item === timelineNavItem) return;

      if (timelineActive) {
        if (item.classList.contains("active")) {
          item.dataset.uxCourseOriginalActive = "1";
          item.classList.remove("active");
        }
        return;
      }

      if (item.dataset.uxCourseOriginalActive === "1") {
        item.classList.add("active");
        delete item.dataset.uxCourseOriginalActive;
      }
    });

    timelineNavItem.classList.toggle("active", timelineActive);
  };

  const syncTimelinePanelVisibility = ({
    focus = false,
    scroll = false,
  } = {}) => {
    const panel = ensureTimelinePanel();
    const timelineActive = getTimelineViewActive();

    document.body.classList.toggle(COURSE_TIMELINE_VIEW_CLASS, timelineActive);

    if (panel) {
      panel.toggleAttribute("hidden", !timelineActive);
    }

    syncCourseNavActiveState(timelineActive);

    if (!timelineActive || !panel) return;

    if (focus) {
      panel.focus({ preventScroll: true });
    }

    if (scroll) {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      panel.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    }
  };

  const syncTimelineNavActiveState = () => {
    const navItem = document.querySelector(
      `.${COURSE_TIMELINE_NAV_ITEM_CLASS}`,
    );
    if (!navItem) return;

    const link = navItem.querySelector(`.${COURSE_TIMELINE_NAV_LINK_CLASS}`);
    const isCurrent = getTimelineViewActive();

    navItem.classList.toggle("ux-timeline-current", isCurrent);
    if (link) {
      if (isCurrent) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    }
    syncTimelinePanelVisibility();
  };

  const isTimelineNavItem = (item) => {
    if (!item) return false;
    if (item.classList?.contains(COURSE_TIMELINE_NAV_ITEM_CLASS)) return true;

    const link = item.querySelector(":scope > a");
    const label = normalizeCourseNavText(
      link?.textContent || item.textContent || "",
    );
    const href = link?.getAttribute("href") || "";
    return (
      label === normalizeCourseNavText("タイムライン") ||
      href.endsWith(`#${COURSE_TIMELINE_HASH}`) ||
      href.includes(`#${COURSE_TIMELINE_HASH}`)
    );
  };

  const getOrCreateTimelineNavItem = (navList) => {
    const candidates = Array.from(navList.children).filter(isTimelineNavItem);
    let navItem =
      candidates.find(
        (item) => !item.classList.contains(COURSE_TIMELINE_NAV_ITEM_CLASS),
      ) ||
      candidates[0] ||
      null;

    if (!navItem) {
      navItem = document.createElement("li");
      const link = document.createElement("a");
      link.textContent = "タイムライン";
      navItem.appendChild(link);
    }

    candidates.forEach((candidate) => {
      if (candidate !== navItem) {
        candidate.remove();
      }
    });

    return navItem;
  };

  const ensureTimelineInCourseSectionNav = (
    navList = getCourseSectionNavList(),
  ) => {
    if (!navList) return;

    const panel = ensureTimelinePanel();

    let navItem = navList.querySelector(
      `:scope > .${COURSE_TIMELINE_NAV_ITEM_CLASS}`,
    );
    if (!panel) {
      if (navItem) navItem.remove();
      return;
    }

    navItem = getOrCreateTimelineNavItem(navList);
    navItem.classList.add(COURSE_TIMELINE_NAV_ITEM_CLASS);
    navItem.classList.remove(
      "visible-xs",
      "hidden-xs",
      "visible-sm",
      "hidden-sm",
      "visible-md",
      "hidden-md",
      "visible-lg",
      "hidden-lg",
    );

    let link = navItem.querySelector(":scope > a");
    if (!link) {
      link = document.createElement("a");
      navItem.appendChild(link);
    }

    link.classList.add(COURSE_TIMELINE_NAV_LINK_CLASS);
    link.id = "ux-course-timeline-nav-link";
    link.textContent = "タイムライン";
    link.href = `#${COURSE_TIMELINE_HASH}`;
    link.setAttribute("aria-controls", COURSE_TIMELINE_PANEL_ID);
    link.removeAttribute("data-toggle");
    panel.setAttribute("aria-labelledby", link.id);
    panel.removeAttribute("aria-label");

    if (link.dataset.uxCourseTimelineClickBound !== "1") {
      link.addEventListener("click", (event) => {
        const targetPanel = ensureTimelinePanel();
        if (!targetPanel) return;

        event.preventDefault();

        const nextHash = `#${COURSE_TIMELINE_HASH}`;
        try {
          if (window.location.hash !== nextHash) {
            history.pushState(null, "", nextHash);
          }
        } catch {
          window.location.hash = COURSE_TIMELINE_HASH;
        }

        syncTimelineNavActiveState();
        syncTimelinePanelVisibility({ focus: true, scroll: true });
      });
      link.dataset.uxCourseTimelineClickBound = "1";
    }

    positionTimelineNavItem(navList, navItem);
    syncTimelineNavActiveState();
  };

  const scheduleTimelineNavPlacement = () => {
    const run = () => ensureTimelineInCourseSectionNav();
    run();
    [250, 1000, 2200].forEach((delay) => {
      window.setTimeout(run, delay);
    });

    if (document.body?.dataset.uxCourseTimelineHashBound !== "1") {
      window.addEventListener("hashchange", syncTimelineNavActiveState, {
        passive: true,
      });
      window.addEventListener("popstate", syncTimelineNavActiveState, {
        passive: true,
      });
      document.body.dataset.uxCourseTimelineHashBound = "1";
    }

    // WebClass also updates the timeline area after render. Re-running from a
    // broad MutationObserver can fight that update loop, so keep this bounded.
  };

  const ensureCourseSectionNavStickyHeader = () => {
    const navbar = document.querySelector(
      "header .navbar.navbar-default, .navbar.navbar-default",
    );
    if (!navbar) return;

    let sectionNav = document.querySelector(".ux-course-section-nav");
    const navList = navbar.querySelector(".navbar-nav.navbar-left");
    const sourceMenu = navbar.querySelector("#menu.navbar-collapse");
    const syncEmptySourceMenu = () => {
      if (!sourceMenu) return;
      const hasVisibleControl = (child) => {
        if (!child || child === navList) return false;
        const childStyle = window.getComputedStyle(child);
        if (childStyle.display === "none" || childStyle.visibility === "hidden")
          return false;

        const controls = child.querySelectorAll(
          'a[href], button, input, select, textarea, [role="button"], [tabindex]',
        );
        return Array.from(controls).some((control) => {
          const controlStyle = window.getComputedStyle(control);
          if (
            controlStyle.display === "none" ||
            controlStyle.visibility === "hidden"
          )
            return false;
          const rect = control.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      };
      const hasRemainingContent = Array.from(sourceMenu.children).some(
        hasVisibleControl,
      );
      sourceMenu.classList.toggle("ux-course-empty-menu", !hasRemainingContent);
      if (sourceMenu.parentElement) {
        sourceMenu.parentElement.classList.toggle(
          "ux-course-empty-menu-shell",
          !hasRemainingContent,
        );
      }
    };

    if (!navList && sectionNav) {
      syncEmptySourceMenu();
      return;
    }
    if (!navList) {
      syncEmptySourceMenu();
      return;
    }

    if (!sectionNav) {
      sectionNav = document.createElement("nav");
      sectionNav.className = "ux-course-section-nav";
      sectionNav.setAttribute("aria-label", "Course sections");

      const inner = document.createElement("div");
      inner.className = "ux-course-section-nav-inner";
      sectionNav.appendChild(inner);

      const anchor = navbar.closest("header") || navbar;
      anchor.insertAdjacentElement("afterend", sectionNav);
    }

    const inner =
      sectionNav.querySelector(".ux-course-section-nav-inner") || sectionNav;
    inner.appendChild(navList);
    ensureTimelineInCourseSectionNav(navList);
    syncEmptySourceMenu();
  };

  const ensureCourseAlertsInMainContent = () => {
    if (!document.body) return;

    const topInfo = document.getElementById("top-info");
    if (!topInfo) return;

    const mainContainer = document.querySelector("#js-main > .container");
    if (!mainContainer) {
      const sectionNav = document.querySelector(".ux-course-section-nav");
      if (sectionNav?.parentElement) {
        if (
          topInfo.parentElement === sectionNav.parentElement &&
          topInfo === sectionNav.nextElementSibling
        )
          return;
        sectionNav.parentElement.insertBefore(topInfo, sectionNav.nextSibling);
        return;
      }
      if (
        topInfo.parentElement === document.body &&
        topInfo === document.body.firstElementChild
      )
        return;
      document.body.insertBefore(topInfo, document.body.firstChild);
      return;
    }

    if (
      topInfo.parentElement === mainContainer &&
      topInfo === mainContainer.firstElementChild
    )
      return;
    mainContainer.insertBefore(topInfo, mainContainer.firstElementChild);
  };

  const scheduleCourseAlertsRelocation = () => {
    ensureCourseAlertsInMainContent();
    window.setTimeout(ensureCourseAlertsInMainContent, 250);
    window.setTimeout(ensureCourseAlertsInMainContent, 1000);

    if (document.body.dataset.uxCourseAlertsObserverBound === "1") return;
    const alertObserver = new MutationObserver(ensureCourseAlertsInMainContent);
    if (
      safeObserveUxMutation(alertObserver, document.documentElement, {
        childList: true,
        subtree: true,
      })
    ) {
      document.body.dataset.uxCourseAlertsObserverBound = "1";
      window.setTimeout(() => alertObserver.disconnect(), 10000);
    }
  };

  const markDisabledContentsItems = () => {
    const items = document.querySelectorAll(
      ".cm-contentsList .cl-contentsList_listGroupItem",
    );
    items.forEach((item) => {
      const contentType = resolveCourseContentsItemType(item);
      item.dataset.uxContentType = contentType;
      item.classList.toggle(
        "ux-content-type-shiryou",
        contentType === "shiryou",
      );
      item.classList.toggle("ux-content-type-shiken", contentType === "shiken");

      const categoryLabel = item.querySelector(
        ".cl-contentsList_categoryLabel",
      );
      if (categoryLabel) {
        categoryLabel.dataset.uxContentType = contentType;
      }

      const nameEl = item.querySelector(".cm-contentsList_contentName");
      if (!nameEl) return;
      const link = nameEl.querySelector("a[href]");
      const hasValidLink =
        link &&
        link.getAttribute("href") &&
        !link.getAttribute("href").startsWith("javascript:");
      item.classList.toggle("ux-contents-disabled", !hasValidLink);

      item
        .querySelectorAll(
          '.cl-contentsList_contentDetailListItemData a[href*="history"]',
        )
        .forEach((historyLink) => {
          const match = (historyLink.textContent || "")
            .trim()
            .match(/^利用回数\s*(\d+)$/);
          if (match) {
            historyLink.textContent = `${match[1]}回`;
          }
        });
    });
  };

  const activateThemeIfContentsPage = () => {
    if (!document.body) return false;
    const hasContents = !!document.querySelector(
      "#js-contents .cm-contentsList",
    );
    if (!hasContents) return false;

    document.body.classList.add(BODY_CLASS);
    ensureCourseSectionNavStickyHeader();
    scheduleTimelineNavPlacement();
    scheduleCourseAlertsRelocation();
    ensureSideNavStickyCard();
    markDisabledContentsItems();
    void refreshQuickNav();
    scheduleQuickNavWarmupRefresh();
    bindQuickNavStorageRefresh();
    return true;
  };

  injectStyle();

  if (activateThemeIfContentsPage()) {
    log("Applied course contents visual refresh");
    return;
  }

  const observer = new MutationObserver(() => {
    if (!isUxExtensionVisualEnabled()) {
      observer.disconnect();
      return;
    }
    if (!activateThemeIfContentsPage()) return;
    observer.disconnect();
    log("Applied course contents visual refresh (after render)");
  });

  if (
    safeObserveUxMutation(observer, document.documentElement, {
      childList: true,
      subtree: true,
    })
  ) {
    document.__uxCourseContentsObserver = observer;
    setTimeout(() => observer.disconnect(), 10000);
  }
}

/**
 * Suppress 'beforeunload' dialog
 * Note: The main suppression is now done by beforeunload-blocker.js
 * which is injected via manifest.json with world: "MAIN"
 * This function provides fallback cleanup in the content script world.
 */
function suppressBeforeUnload() {
  log("suppressBeforeUnload called (content script world)");

  // The main blocking is done by beforeunload-blocker.js in the MAIN world
  // This content script can only do limited cleanup

  // Add a capturing listener in the content script world as backup
  window.addEventListener(
    "beforeunload",
    function (e) {
      e.stopImmediatePropagation();
      e.stopPropagation();
      try {
        delete e.returnValue;
      } catch (ex) {}
    },
    { capture: true },
  );

  log("Added beforeunload listener in content script world as backup");
}

// ============================================================
// Initialization
// ============================================================

function init() {
  if (!isUxExtensionVisualEnabled()) return;
  log("Initializing...");
  scheduleCustomUserIconApply(document);
  scheduleCourseHeaderUtilityControls(document);
  bindShiryouDisplayMessageListeners();

  const pageType = detectPageType();
  log("Detected page type:", pageType);

  // Suppress beforeunload on material pages IMMEDIATELY at document_start
  // This must run before any other scripts (especially Vue.js textbook.js)
  if (pageType === "shiryou" || pageType === "shiryou_title") {
    suppressBeforeUnload();
  }

  // For shiryou_title, we need to wait for body to exist
  if (pageType === "shiryou_title") {
    const setupTitleFrame = () => {
      rememberUxOriginalBodyState(document);
      if (isShiryouOriginDisplayActive(getShiryouRootDocument(document))) {
        ensureShiryouOriginHeaderToggle(
          document,
          getShiryouRootDocument(document),
        );
        return;
      }

      // 一時的に背景色を設定して読み込み中のチラつきを防ぐ
      if (document.body) {
        ensureCourseColorTokens(document);
        document.body.style.background = "var(--ux-home-page-bg)";
        document.body.style.margin = "0";
      }
      log("shiryou_title frame: waiting for parent to inject header");
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", setupTitleFrame);
    } else if (document.body) {
      setupTitleFrame();
    }
    return;
  }

  // loadit.phpの「表示に問題があるときは」メッセージフレームを非表示
  if (pageType === "loadit_message") {
    if (isShiryouOriginDisplayActive(getShiryouRootDocument(document))) {
      return;
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", hideLoaditMessageFrame);
    } else {
      hideLoaditMessageFrame();
    }
    return;
  }

  // 資料タイプのページはUI改善を適用
  if (pageType === "shiryou") {
    const runShiryouEnhancements = () => {
      enhanceShiryouPageUI();
      if (!isShiryouOriginDisplayActive(getShiryouRootDocument(document))) {
        setTimeout(observeFrames, 500);
      }
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", runShiryouEnhancements);
    } else {
      runShiryouEnhancements();
    }
    return;
  }

  if (pageType === "shiken") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        enhanceShikenPageUI();
        setTimeout(observeFrames, 500);
      });
    } else {
      enhanceShikenPageUI();
      setTimeout(observeFrames, 500);
    }
    return;
  }

  if (pageType === "course_list") {
    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        enhanceCourseContentsPageUI,
      );
    } else {
      enhanceCourseContentsPageUI();
    }
  }

  // ページ読み込み完了後に実行
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(observeFrames, 500);
    });
  } else {
    setTimeout(observeFrames, 500);
  }

  // フレームの場合、親ウィンドウからの情報も活用
  const getParentInfo = () => {
    if (window.parent !== window) {
      try {
        // 親ウィンドウの課題名を取得してみる
        const parentContentName = window.parent.document.querySelector(
          'input[name="contents_name"]',
        );
        if (parentContentName) {
          window.uxContentName = parentContentName.value;
          log("Got content name from parent:", window.uxContentName);
        }
      } catch (e) {
        // クロスオリジンの場合はスキップ
      }
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", getParentInfo);
  } else {
    getParentInfo();
  }
}

// 実行
chrome.storage.local.get(
  {
    [STORAGE_KEY_EXTENSION_VISUAL_ENABLED]: true,
    [MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_KEY]:
      MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_DEFAULT,
    [CUSTOM_USER_ICON_KEY]: "",
  },
  (items) => {
    setUxExtensionVisualEnabled(
      items[STORAGE_KEY_EXTENSION_VISUAL_ENABLED] !== false,
    );
    materialDownloadFilenameSeparator =
      normalizeMaterialDownloadFilenameSeparator(
        items[MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_KEY],
      );
    setCustomUserIconDataUrl(items[CUSTOM_USER_ICON_KEY]);
    if (!isUxExtensionVisualEnabled()) {
      log("Global visual modification is disabled. Skipping course.js init.");
      return;
    }
    init();
  },
);
