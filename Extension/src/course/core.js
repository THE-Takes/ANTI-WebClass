// course/core.js
// Course-page lifecycle state, restoration, configuration, and content metadata.

// Shared debug and visibility primitives are initialized by shared.js.

(() => {
  try {
    chrome.storage.local.get(
      { extensionVisualEnabled: true },
      (items) => {
        setUxExtensionVisualEnabled(items.extensionVisualEnabled !== false);
      },
    );
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
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
  } catch { }
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

var UX_ORIGINAL_ATTR_MISSING = "__webclass_ux_missing__";
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
  try {
    restoreFullscreenCapableVideoFrame(doc);
  } catch {
    // The video fullscreen helper may not be available during early startup.
  }

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
    "#ux-video-fullscreen-content-frame",
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
    "ux-choice-hidden-row",
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
    if (typeof restoreCourseHeaderUtilityControls === "function") {
      restoreCourseHeaderUtilityControls(doc);
    }
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

var MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_KEY =
  "materialDownloadFilenameSeparator";
var CUSTOM_USER_ICON_KEY = "customUserIconDataUrl";
var MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_DEFAULT = "hyphen";
const MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_CHARS = {
  hyphen: "-",
  space: " ",
  underscore: "_",
};
var materialDownloadFilenameSeparator =
  MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_DEFAULT;
let customUserIconDataUrl = "";

const UX_COURSE_HOME_TAB_PARAMETER = "ux_tab";
const UX_COURSE_HEADER_ICON_CLASS = "ux-course-header-icon";
const UX_COURSE_HEADER_MAILBOX_CLASS = "ux-course-header-mailbox";
const UX_COURSE_HEADER_MESSAGE_BADGE_CLASS =
  "ux-course-header-message-badge";
const UX_COURSE_HEADER_ORIGINAL_HREF_ATTRIBUTE =
  "data-ux-original-course-header-href";
const UX_COURSE_HEADER_ORIGINAL_TOGGLE_ATTRIBUTES = [
  "data-toggle",
  "data-bs-toggle",
  "aria-haspopup",
  "aria-expanded",
  "target",
];

const UX_COURSE_HEADER_LOGOUT_ICON = `
  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
  <polyline points="16 17 21 12 16 7"></polyline>
  <line x1="21" y1="12" x2="9" y2="12"></line>
`;
const UX_COURSE_HEADER_MAILBOX_ICON = `
  <rect x="3" y="5" width="18" height="14" rx="2"></rect>
  <polyline points="3 7 12 13 21 7"></polyline>
`;
const UX_COURSE_HEADER_LANGUAGE_ICON = UX_LANGUAGE_CHANGE_ICON_MARKUP;
function setCustomUserIconDataUrl(value) {
  customUserIconDataUrl =
    typeof value === "string" && value.startsWith("data:image/") ? value : "";
}

function getCourseHeaderLinkLabel(link) {
  if (!link) return "";
  return [
    link.getAttribute("title"),
    link.getAttribute("aria-label"),
    link.textContent,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getCourseHeaderSemanticLabel(link) {
  if (!link) return "";
  return [link.getAttribute("title"), link.getAttribute("aria-label")]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isCourseHeaderLanguageLink(link) {
  if (!link) return false;

  const semanticLabel = getCourseHeaderSemanticLabel(link);
  const visibleText = (link.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const href = (link.getAttribute("href") || "").toLowerCase();
  const isExactLanguageText = /^(?:言語(?:設定)?|language(?: settings?)?)$/i.test(
    visibleText,
  );

  return (
    semanticLabel.includes("言語") ||
    semanticLabel.includes("language") ||
    href.includes("language") ||
    href.includes("locale") ||
    /[?&](?:lang|locale)=/.test(href) ||
    isExactLanguageText
  );
}

function getCoursePageAcsToken(doc = document) {
  const readAcsFromUrl = (rawUrl, baseUrl) => {
    if (!rawUrl) return "";
    try {
      return (
        new URL(rawUrl, baseUrl || window.location.href).searchParams.get(
          "acs_",
        ) || ""
      ).trim();
    } catch {
      return "";
    }
  };

  try {
    const currentAcs = readAcsFromUrl(window.location.href);
    if (currentAcs) return currentAcs;
  } catch {
    // Continue with the page links when the current location is unavailable.
  }

  try {
    const candidates = doc.querySelectorAll(
      'a[href], form[action], input[name="acs_"]',
    );
    for (const candidate of candidates) {
      if (candidate.matches?.('input[name="acs_"]')) {
        const inputValue = (candidate.value || "").trim();
        if (inputValue) return inputValue;
        continue;
      }

      const rawUrl =
        candidate.getAttribute("href") || candidate.getAttribute("action") || "";
      const acs = readAcsFromUrl(rawUrl, window.location.href);
      if (acs) return acs;
    }
  } catch {
    // Ignore partially loaded documents.
  }

  return "";
}

function getCourseHomeUrl(doc = document, tab = "") {
  try {
    const homeUrl = new URL("/webclass/", window.location.origin);
    const acs = getCoursePageAcsToken(doc);
    if (acs) homeUrl.searchParams.set("acs_", acs);
    if (tab) homeUrl.searchParams.set(UX_COURSE_HOME_TAB_PARAMETER, tab);
    return homeUrl.toString();
  } catch {
    return "";
  }
}

function getCourseHomeMessagesUrl(doc = document) {
  return getCourseHomeUrl(doc, "messages");
}

function getCourseMessageInboxUrl(doc = document) {
  try {
    const inboxUrl = new URL(
      "/webclass/messages.php/inbox",
      window.location.origin,
    );
    const acs = getCoursePageAcsToken(doc);
    if (acs) inboxUrl.searchParams.set("acs_", acs);
    return inboxUrl.toString();
  } catch {
    return "";
  }
}

function rememberUxCourseHeaderAttribute(link, attributeName) {
  if (!link || !attributeName) return;
  const marker = `data-ux-original-course-header-${attributeName}`;
  if (link.hasAttribute(marker)) return;

  link.setAttribute(
    marker,
    link.hasAttribute(attributeName)
      ? link.getAttribute(attributeName) || ""
      : UX_ORIGINAL_ATTR_MISSING,
  );
}

function restoreUxCourseHeaderAttribute(link, attributeName) {
  if (!link || !attributeName) return;
  const marker = `data-ux-original-course-header-${attributeName}`;
  if (!link.hasAttribute(marker)) return;

  const originalValue = link.getAttribute(marker);
  if (originalValue === UX_ORIGINAL_ATTR_MISSING) {
    link.removeAttribute(attributeName);
  } else {
    link.setAttribute(attributeName, originalValue || "");
  }
  link.removeAttribute(marker);
}

function ensureUxCourseHeaderIcon(link, iconName, iconMarkup) {
  if (!link || !link.ownerDocument) return null;

  let icon = Array.from(link.children).find(
    (child) =>
      child.classList?.contains(UX_COURSE_HEADER_ICON_CLASS) &&
      child.classList?.contains(iconName),
  );
  if (!icon) {
    icon = link.ownerDocument.createElement("span");
    icon.className = `${UX_COURSE_HEADER_ICON_CLASS} ${iconName}`;
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconMarkup}</svg>`;
    link.appendChild(icon);
  } else if (!icon.querySelector("svg")) {
    // Avoid rewriting an attached icon on every observer pass. Rewriting its
    // children creates another childList mutation and can keep the observer in
    // a tight loop on course pages.
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconMarkup}</svg>`;
  }
  return icon;
}

function getCourseHeaderMailboxLink(doc = document) {
  return (
    doc.querySelector(
      `#notification-dropdown-icon.${UX_COURSE_HEADER_MAILBOX_CLASS}`,
    ) || doc.querySelector(`a.${UX_COURSE_HEADER_MAILBOX_CLASS}`)
  );
}

function ensureCourseHeaderMessageBadge(link) {
  if (!link?.ownerDocument) return null;

  const badges = Array.from(link.children).filter((child) =>
    child.classList?.contains(UX_COURSE_HEADER_MESSAGE_BADGE_CLASS),
  );
  const badge = badges[0] || link.ownerDocument.createElement("span");
  if (!badges.length) {
    badge.className = `badge ${UX_COURSE_HEADER_MESSAGE_BADGE_CLASS}`;
    badge.setAttribute("aria-hidden", "true");
    badge.hidden = true;
    link.appendChild(badge);
  }
  badges.slice(1).forEach((duplicate) => duplicate.remove());
  return badge;
}

function renderCourseHeaderMessageBadge(link, unreadCount) {
  const badge = ensureCourseHeaderMessageBadge(link);
  if (!badge) return 0;

  const count = normalizeUxMessageUnreadCount(unreadCount) ?? 0;
  const nextText = count > 99 ? "99+" : count > 0 ? String(count) : "";
  if (badge.textContent !== nextText) badge.textContent = nextText;
  const nextHidden = count <= 0;
  if (badge.hidden !== nextHidden) badge.hidden = nextHidden;
  return count;
}

function bindCourseHeaderMessageBadgeSync(
  doc = document,
  link = null,
) {
  let state = doc.__uxCourseMessageBadgeSync;

  const apply = (count) => {
    const targetLink = getCourseHeaderMailboxLink(doc) || state?.link || link;
    if (!targetLink) return;

    const normalizedCount = renderCourseHeaderMessageBadge(targetLink, count);
    targetLink.setAttribute(
      "aria-label",
      normalizedCount > 0
        ? `メッセージ 未読 ${normalizedCount}件`
        : "メッセージ 未読なし",
    );
  };

  if (state) {
    if (link && (link.id === "notification-dropdown-icon" || !state.link)) {
      state.link = link;
    }
    apply(state.currentCount);
    return;
  }

  state = {
    currentCount: 0,
    hasStoredCount: false,
    link,
    unsubscribe: null,
  };
  doc.__uxCourseMessageBadgeSync = state;
  state.unsubscribe = onUxMessageUnreadCountChange((nextCount) => {
    if (doc.__uxCourseMessageBadgeSync !== state) return;
    state.hasStoredCount = nextCount !== null;
    state.currentCount = nextCount ?? 0;
    apply(state.currentCount);
  });

  // The native WebClass badge is an announcements/notification count on this
  // installation, so do not use it as the message inbox count.
  apply(0);
  getUxStoredMessageUnreadState(null).then(async (storedState) => {
    if (doc.__uxCourseMessageBadgeSync !== state) return;

    const storedCount = normalizeUxMessageUnreadCount(storedState?.unreadCount);
    const hasVersionedStoredCount =
      storedState?.version === UX_MESSAGE_BADGE_STORAGE_VERSION &&
      storedCount !== null;
    state.hasStoredCount = hasVersionedStoredCount;
    state.currentCount = hasVersionedStoredCount ? storedCount : 0;
    apply(state.currentCount);

    if (
      hasVersionedStoredCount ||
      typeof fetchUxInboxUnreadMessageCount !== "function"
    ) {
      return;
    }

    const fetchedCount = await fetchUxInboxUnreadMessageCount(
      getCourseMessageInboxUrl(doc),
    );
    if (
      doc.__uxCourseMessageBadgeSync !== state
      || state.hasStoredCount
      || fetchedCount === null
    ) {
      return;
    }

    state.currentCount = fetchedCount;
    apply(state.currentCount);
    void setUxStoredMessageUnreadCount(fetchedCount, {
      source: "course-inbox-sync",
    });
  });
}

function isCourseHeaderCourseListLink(link) {
  const label = getCourseHeaderLinkLabel(link);
  return (
    label.includes("コースリスト") ||
    label.includes("コース一覧") ||
    label.includes("course list") ||
    label.includes("course-list")
  );
}

function isCourseHeaderCourseLogoutLink(link) {
  const href = link?.getAttribute("href") || "";
  return /\/course\.php\/[^/?#]+\/logout(?:[/?#]|$)/i.test(href);
}

function isCourseHeaderLogoutLink(link) {
  const label = getCourseHeaderLinkLabel(link);
  const href = (link?.getAttribute("href") || "").toLowerCase();
  return (
    label.includes("ログアウト") ||
    label.includes("logout") ||
    /(?:^|\/)logout(?:[/?#]|$)/i.test(href)
  );
}

function isTopLevelCourseHeaderUtilityLink(link) {
  if (!link) return false;
  if (link.closest(".dropdown-menu, .navbar-brand")) return false;

  const nav = link.closest(".navbar-nav.navbar-right");
  const item = link.closest("li");
  return !nav || !item || item.parentElement === nav;
}

function removeNestedCourseHeaderUtilityIcons(doc = document) {
  try {
    doc.querySelectorAll(`.${UX_COURSE_HEADER_ICON_CLASS}`).forEach((icon) => {
      const link = icon.closest("a");
      if (!link || isTopLevelCourseHeaderUtilityLink(link)) return;

      icon.remove();
      link.classList.remove(
        "ux-course-header-account",
        "ux-course-header-mailbox",
        "ux-course-header-language",
        "ux-course-header-logout",
      );
      link
        .closest("li")
        ?.classList.remove("ux-course-header-action-item");
    });
  } catch {
    // Ignore inaccessible or partially loaded documents.
  }
}

function getCourseHeaderUtilityLinks(doc = document) {
  const links = new Set();
  const selectors = [
    ".navbar-default .navbar-nav.navbar-right > li > a",
    ".navbar-default a",
    "header a",
  ];

  selectors.forEach((selector) => {
    try {
      doc.querySelectorAll(selector).forEach((link) => {
        if (isTopLevelCourseHeaderUtilityLink(link)) links.add(link);
      });
    } catch {
      // Ignore selectors that are unavailable during partial page loads.
    }
  });

  return Array.from(links);
}

function moveCourseHeaderLogoutIntoUtilityNav(link, nav, doc = document) {
  if (!link || !nav || link.closest(".dropdown-menu")) return;

  const item = link.closest("li");
  if (item) {
    if (item.parentElement !== nav) nav.appendChild(item);
    return;
  }

  if (link.parentElement === nav) return;

  const wrapper = doc.createElement("li");
  wrapper.appendChild(link);
  nav.appendChild(wrapper);
}

function redirectCourseHeaderMailboxToHome(link, doc = document) {
  if (!link) return;

  rememberUxCourseHeaderAttribute(link, "href");
  UX_COURSE_HEADER_ORIGINAL_TOGGLE_ATTRIBUTES.forEach((attributeName) => {
    rememberUxCourseHeaderAttribute(link, attributeName);
    link.removeAttribute(attributeName);
  });

  const homeMessagesUrl = getCourseHomeMessagesUrl(doc);
  if (homeMessagesUrl) link.setAttribute("href", homeMessagesUrl);
}

function restoreCourseHeaderUtilityControls(doc = document) {
  try {
    if (typeof unbindCourseHeaderMessageButtons === "function") {
      unbindCourseHeaderMessageButtons(doc);
    }

    const messageBadgeSync = doc.__uxCourseMessageBadgeSync;
    if (messageBadgeSync?.unsubscribe) {
      messageBadgeSync.unsubscribe();
    }
    doc.__uxCourseMessageBadgeSync = null;

    doc
      .querySelectorAll(`[${UX_COURSE_HEADER_ORIGINAL_HREF_ATTRIBUTE}]`)
      .forEach((link) => restoreUxCourseHeaderAttribute(link, "href"));

    UX_COURSE_HEADER_ORIGINAL_TOGGLE_ATTRIBUTES.forEach((attributeName) => {
      doc
        .querySelectorAll(
          `[data-ux-original-course-header-${attributeName}]`,
        )
        .forEach((link) => restoreUxCourseHeaderAttribute(link, attributeName));
    });

    doc
      .querySelectorAll(`.${UX_COURSE_HEADER_ICON_CLASS}`)
      .forEach((icon) => icon.remove());
    doc
      .querySelectorAll(`.${UX_COURSE_HEADER_MESSAGE_BADGE_CLASS}`)
      .forEach((badge) => badge.remove());
    doc
      .querySelectorAll(
        ".ux-course-header-account, .ux-course-header-mailbox, .ux-course-header-language, .ux-course-header-logout",
      )
      .forEach((link) => {
        link.classList.remove(
          "ux-course-header-account",
          "ux-course-header-mailbox",
          "ux-course-header-language",
          "ux-course-header-logout",
        );
      });
    doc
      .querySelectorAll(
        ".ux-course-header-action-item, .ux-course-header-actions",
      )
      .forEach((element) => {
        element.classList.remove(
          "ux-course-header-action-item",
          "ux-course-header-actions",
        );
      });
  } catch {
    // Ignore inaccessible or partially loaded documents.
  }
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
  removeNestedCourseHeaderUtilityIcons(doc);
  let nav;
  try {
    nav = doc.querySelector(
      ".navbar-default .navbar-nav.navbar-right, header .navbar-nav.navbar-right",
    );
  } catch {
    return redundantCourseListHidden;
  }
  if (!nav) return redundantCourseListHidden;

  let markedCount = 0;
  getCourseHeaderUtilityLinks(doc).forEach((link) => {
    let item = link.closest("li") || link.parentElement || link;

    const title = getCourseHeaderLinkLabel(link);
    const href = (link.getAttribute("href") || "").toLowerCase();
    const isCourseList =
      isCourseHeaderCourseListLink(link) ||
      isCourseHeaderCourseLogoutLink(link);
    if (isCourseList) {
      item.classList.add("ux-course-list-button-hidden");
      item.classList.remove("ux-course-header-action-item");
      link.classList.remove(
        "ux-course-header-account",
        "ux-course-header-mailbox",
        "ux-course-header-language",
        "ux-course-header-logout",
      );
      return;
    }

    const isAccount =
      title.includes("アカウントメニュー") || title.includes("account");
    const isMailbox =
      item.id === "notification-dropdown-area" ||
      (href.includes("msg_editor.php") && href.includes("msgappmode=inbox")) ||
      href.includes("messages.php/inbox") ||
      title.includes("受信箱") ||
      title.includes("メール") ||
      title.includes("メッセージ") ||
      title.includes("mailbox") ||
      title.includes("inbox");
    const isLanguage = isCourseHeaderLanguageLink(link);
    const isLogout = isCourseHeaderLogoutLink(link);

    link.classList.toggle("ux-course-header-account", isAccount);
    link.classList.toggle("ux-course-header-mailbox", isMailbox);
    link.classList.toggle("ux-course-header-language", isLanguage);
    link.classList.toggle("ux-course-header-logout", isLogout);
    item.classList.remove("ux-course-list-button-hidden");
    const isUtilityControl = isAccount || isMailbox || isLanguage || isLogout;
    item.classList.toggle("ux-course-header-action-item", isUtilityControl);
    if (isMailbox) {
      redirectCourseHeaderMailboxToHome(link, doc);
      const mailboxIcon = ensureUxCourseHeaderIcon(
        link,
        "ux-course-header-mailbox-icon",
        UX_COURSE_HEADER_MAILBOX_ICON,
      );
      // Keep one extension-owned icon so the source font icon cannot become
      // invisible when the compact utility link resets its font size.
      link
        .querySelectorAll(
          `.${UX_COURSE_HEADER_ICON_CLASS}.ux-course-header-mailbox-icon`,
        )
        .forEach((icon) => {
          if (icon !== mailboxIcon) icon.remove();
        });
      ensureCourseHeaderMessageBadge(link);
      bindCourseHeaderMessageBadgeSync(doc, link);
      if (typeof bindCourseHeaderMessageButton === "function") {
        bindCourseHeaderMessageButton(link, doc);
      }
      if (!link.getAttribute("aria-label")) {
        link.setAttribute("aria-label", "メッセージ");
      }
    }
    if (isLanguage) {
      ensureUxCourseHeaderIcon(
        link,
        "ux-course-header-language-icon",
        UX_COURSE_HEADER_LANGUAGE_ICON,
      );
      if (!link.getAttribute("aria-label")) {
        link.setAttribute("aria-label", "言語");
      }
    }
    if (isLogout) {
      moveCourseHeaderLogoutIntoUtilityNav(link, nav, doc);
      item = link.closest("li") || link.parentElement || link;
      item.classList.add("ux-course-header-action-item");
      ensureUxCourseHeaderIcon(
        link,
        "ux-course-header-logout-icon",
        UX_COURSE_HEADER_LOGOUT_ICON,
      );
      if (!link.getAttribute("aria-label")) {
        link.setAttribute("aria-label", "ログアウト");
      }
    }
    if (isUtilityControl) markedCount += 1;
  });

  nav.classList.toggle("ux-course-header-actions", markedCount > 0);
  return markedCount > 0;
}

function hideRedundantCourseListButton(doc = document) {
  try {
    const links = new Set();
    [
      ".navbar-default .navbar-nav.navbar-right > li > a",
      ".navbar-default a",
      "header a",
    ].forEach((selector) => {
      doc.querySelectorAll(selector).forEach((link) => links.add(link));
    });

    let hidden = false;
    links.forEach((link) => {
      const isCourseLogoutLink = isCourseHeaderCourseLogoutLink(link);
      if (!isCourseHeaderCourseListLink(link) && !isCourseLogoutLink) {
        return;
      }

      const item = link.closest("li") || link;
      item.classList.add("ux-course-list-button-hidden");
      hidden = true;
    });
    return hidden;
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
var UX_SHIRYOU_TOC_WIDTH_STORAGE_KEY = "shiryouTocWidthPx";
var UX_SHIRYOU_TOC_DEFAULT_WIDTH = 350;
var UX_SHIRYOU_TOC_MIN_WIDTH = 240;
var UX_SHIRYOU_TOC_MAX_WIDTH = 720;
var UX_SHIRYOU_TOC_COLLAPSED_WIDTH = 56;
const UX_COURSE_COLOR_TOKEN_CSS = `
    :root {
        color-scheme: light;
        --ux-color-page: #EBF6FF;
        --ux-color-surface: #FFFFFF;
        --ux-color-surface-subtle: #F5FAFF;
        --ux-color-surface-muted: #EEF5F9;
        --ux-color-text: #1F2326;
        --ux-color-muted: #6F767A;
        --ux-color-border: #DCE8F0;
        --ux-color-border-strong: #BFD4E1;
        --ux-color-border-hover: #B1BEC6;
        --ux-color-accent: #099BFF;
        --ux-color-accent-hover: #0789E1;
        --ux-color-accent-active: #0677C7;
        --ux-color-on-accent: #FFFFFF;
        --ux-color-success: #18794E;
        --ux-color-success-surface: #EAF8F0;
        --ux-color-warning: #9A6500;
        --ux-color-warning-surface: #FFF7E5;
        --ux-color-danger: #B42318;
        --ux-color-danger-surface: #FFF0EE;
        --ux-color-info: #1664A5;
        --ux-color-info-surface: #EAF4FF;
        --ux-home-page-bg: var(--ux-color-page);
        --ux-home-surface: var(--ux-color-surface);
        --ux-home-surface-muted: var(--ux-color-surface-muted);
        --ux-home-surface-soft: var(--ux-color-surface-subtle);
        --ux-home-fill: var(--ux-color-surface-subtle);
        --ux-home-fill-strong: #E6F2FA;
        --ux-home-label: var(--ux-color-text);
        --ux-home-secondary-label: var(--ux-color-muted);
        --ux-home-tertiary-label: #87939A;
        --ux-home-quaternary-label: #A8B4BA;
        --ux-home-separator: var(--ux-color-border);
        --ux-home-separator-strong: var(--ux-color-border-strong);
        --ux-home-accent: var(--ux-color-accent);
        --ux-home-accent-emphasis: var(--ux-color-accent-active);
        --ux-home-accent-soft: var(--ux-color-info-surface);
        --ux-home-accent-softer: var(--ux-color-surface-subtle);
        --ux-home-success: var(--ux-color-success);
        --ux-home-success-soft: var(--ux-color-success-surface);
        --ux-home-success-foreground: #12613F;
        --ux-home-warning: var(--ux-color-warning);
        --ux-home-warning-soft: var(--ux-color-warning-surface);
        --ux-home-warning-foreground: #795000;
        --ux-home-danger: var(--ux-color-danger);
        --ux-home-danger-soft: var(--ux-color-danger-surface);
        --ux-home-danger-foreground: #8C1C14;
        --ux-home-purple: #7A3DB8;
        --ux-home-purple-soft: #F1E9FF;
        --ux-home-purple-foreground: #62309B;
        --ux-home-header-surface: var(--ux-color-surface);
        --ux-home-overlay: #33424D;
        --ux-select-display-font-size: 14px;
        --ux-select-option-font-size: 14px;
    }

    :root[data-ux-theme="dark"] {
        --ux-home-fill-strong: #303b44;
        --ux-home-tertiary-label: #88939d;
        --ux-home-quaternary-label: #6c7780;
        --ux-home-success-foreground: #91e1b7;
        --ux-home-warning-foreground: #f5ca86;
        --ux-home-danger-foreground: #ffaaa5;
        --ux-home-purple: #b49aff;
        --ux-home-purple-soft: #302943;
        --ux-home-purple-foreground: #c9b8ff;
        --ux-home-overlay: #0d1013;
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
  const toc = row?.closest?.("#TOC") || row?.closest?.("table");
  const pageButtons = toc?.querySelectorAll?.(
    'input[name="clickpage"], button[name="clickpage"]',
  );
  const sectionNumber = getSectionNumberText(element);

  if (sectionNumber === "1" && pageButtons?.length === 1) {
    return null;
  }

  const label = getSectionLabelTextFromRow(row);
  if (label) return label;

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
  downloadSource = "file-down",
) {
  button.dataset.uxDownloadType = type;
  button.dataset.uxFileDownUrl = fileDownUrl;
  button.dataset.uxRenamedFileName = renamedFileName || "";
  button.dataset.uxOriginalFileName = originalFileName || "";
  button.dataset.uxDownloadSource = downloadSource;

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
  const downloadSource = button.dataset.uxDownloadSource || "file-down";
  if (!fileDownUrl || (type !== "rename" && type !== "original")) return false;
  if (downloadSource !== "file-down" && downloadSource !== "direct") {
    return false;
  }

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
      const requestedFileName = type === "rename" ? renamedFileName : null;
      if (downloadSource === "direct") {
        await downloadDirectUrl(fileDownUrl, requestedFileName);
      } else {
        await downloadFromFileDownUrl(fileDownUrl, requestedFileName);
      }
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
