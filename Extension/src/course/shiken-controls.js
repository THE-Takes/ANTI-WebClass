// course/shiken-controls.js
// Exam layout controls, answer surfaces, and resize controls.

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
            border: 1px solid var(--ux-color-border-strong);
            border-radius: 4px;
            background: var(--ux-color-surface);
            box-sizing: border-box;
            font-family: "Yu Gothic", "Meiryo", sans-serif;
            font-size: 12px;
            line-height: 1.2;
        }
        #ux-shiken-layout-toggle .ux-shiken-layout-toggle-label {
            padding: 0 4px;
            color: var(--ux-color-text);
            font-weight: 700;
            white-space: nowrap;
        }
        #ux-shiken-layout-toggle button {
            min-width: 0;
            width: 100%;
            min-height: 26px;
            padding: 0 4px;
            border: 1px solid var(--ux-color-border-strong);
            border-radius: 3px;
            background: var(--ux-color-surface-subtle);
            color: var(--ux-color-text);
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
            border-color: var(--ux-color-accent);
            background: var(--ux-color-info-surface);
            color: var(--ux-color-accent-active);
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
  const applyHeight = (height) => {
    const nextHeight = Math.max(
      UX_SHIKEN_SINGLE_PAGE_FIELD_MIN_HEIGHT,
      Math.round(height),
    );
    card.style.minHeight = `${nextHeight}px`;
    handle.setAttribute("aria-valuenow", String(nextHeight));
    postSinglePageShikenFrameHeight();
    return nextHeight;
  };

  handle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const currentHeight = card.getBoundingClientRect().height;
    const nextHeight = applyHeight(
      currentHeight + (event.key === "ArrowDown" ? 24 : -24),
    );
    saveShikenSinglePageFieldHeight(nextHeight, frameName);
  });

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startHeight = Math.round(card.getBoundingClientRect().height);
    const startScreenY = event.screenY;
    let latestHeight = startHeight;
    const pointerId = event.pointerId;

    document.body?.classList.add("ux-shiken-frame-resizing");
    try {
      handle.setPointerCapture(pointerId);
    } catch {}

    const onMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const deltaY = moveEvent.screenY - startScreenY;
      latestHeight = applyHeight(startHeight + deltaY);
    };

    const onEnd = (endEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);
      document.body?.classList.remove("ux-shiken-frame-resizing");
      saveShikenSinglePageFieldHeight(latestHeight, frameName);
      postSinglePageShikenFrameHeight();
      try {
        handle.releasePointerCapture(pointerId);
      } catch {}
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
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
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "horizontal");
  handle.setAttribute(
    "aria-valuemin",
    String(UX_SHIKEN_SINGLE_PAGE_FIELD_MIN_HEIGHT),
  );
  handle.style.touchAction = "none";
  handle.title = `${label}の高さをドラッグで変更`;
  card.appendChild(handle);

  if (isShikenSinglePageActive()) {
    attachShikenSinglePageFieldResizeHandle(card, handle, frameName);
    return;
  }

  handle.addEventListener("pointerdown", (event) => {
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
    const pointerId = event.pointerId;

    document.body?.classList.add("ux-shiken-frame-resizing");
    try {
      window.parent?.document?.body?.classList.add("ux-shiken-frame-resizing");
    } catch {
      // ignore
    }
    try {
      handle.setPointerCapture(pointerId);
    } catch {}

    const onMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
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

    const onEnd = (endEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);
      document.body?.classList.remove("ux-shiken-frame-resizing");
      try {
        window.parent?.document?.body?.classList.remove(
          "ux-shiken-frame-resizing",
        );
      } catch {
        // ignore
      }
      saveShikenFrameRows(latestRows);
      try {
        handle.releasePointerCapture(pointerId);
      } catch {}
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
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

function hideOneByOneButtonFrameCheckControls(root = document) {
  Array.from(
    root?.querySelectorAll?.(UX_ANSWER_ACTION_CONTROL_SELECTOR) || [],
  ).forEach((control) => {
    if (getShikenAnswerControlLabel(control) !== "解答チェック") return;
    hideMirroredShikenAnswerControl(control);
  });
}

function createShikenAnswerProxyButton({
  source,
  label,
  className = "ux-btn",
  fallback,
  disabled = false,
  pendingLabel = "",
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label || (typeof fallback === "string" ? fallback : "");
  button.disabled =
    disabled ||
    (!!source && isUxControlDisabled(source)) ||
    (!source && typeof fallback !== "function");

  let activationPending = false;
  const activate = (event) => {
    if (button.disabled || activationPending) return;
    event.preventDefault();
    event.stopPropagation();
    activationPending = true;

    const runAction = () => {
      if (source) {
        source.click();
      } else if (typeof fallback === "function") {
        fallback();
      }
    };

    if (!pendingLabel) {
      runAction();
      window.setTimeout(() => {
        activationPending = false;
      }, 0);
      return;
    }

    button.disabled = true;
    button.textContent = pendingLabel;
    button.setAttribute("aria-busy", "true");
    runAction();
  };

  button.addEventListener("pointerup", activate, true);
  button.addEventListener("click", activate, true);
  button.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    activate(event);
  });
  return button;
}

function isShikenFinishConfirmationForm(form) {
  if (!form) return false;
  const text = (form.textContent || "").replace(/\s+/g, "");
  return (
    text.includes("本当にこのまま終了しますか") ||
    (text.includes("まだ全ての問いに答えていません") &&
      text.includes("回答画面に戻ります"))
  );
}

function collectShikenAnswerDocuments() {
  const documents = [];
  const addDocument = (candidate) => {
    if (candidate && !documents.includes(candidate)) documents.push(candidate);
  };

  addDocument(document);

  [window.parent, window.top].forEach((frameOwner) => {
    try {
      addDocument(frameOwner?.frames?.answer?.document);
    } catch {
      // Ignore inaccessible frames and continue with documents from this origin.
    }
  });

  return documents;
}

function submitShikenAnswerCommand(command, preferredForm = null) {
  const normalizedCommand = String(command || "").trim();
  if (!normalizedCommand) return false;

  const forms = [];
  const addForm = (candidate) => {
    if (candidate && !forms.includes(candidate)) forms.push(candidate);
  };

  addForm(preferredForm);
  collectShikenAnswerDocuments().forEach((targetDocument) => {
    addForm(targetDocument.querySelector('form[name="answer_form"]'));
  });

  const form = forms.find((candidate) =>
    candidate.querySelector('input[name="sendCmd"]'),
  );
  if (!form) return false;

  const sendCommand = form.querySelector('input[name="sendCmd"]');
  sendCommand.value = normalizedCommand;

  try {
    const formWindow = form.ownerDocument?.defaultView;
    const nativeSubmit = formWindow?.HTMLFormElement?.prototype?.submit;
    if (typeof nativeSubmit === "function") {
      nativeSubmit.call(form);
    } else {
      form.submit();
    }
    return true;
  } catch (error) {
    uxDebugWarn(
      `[WebClass UX] Failed to submit answer command "${normalizedCommand}":`,
      error?.message || error,
    );
    return false;
  }
}

function submitShikenAnswerGrade(preferredForm = null) {
  return submitShikenAnswerCommand("grade", preferredForm);
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
