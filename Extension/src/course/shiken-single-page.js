// course/shiken-single-page.js
// Single-page exam layout, frame bridges, and layout synchronization.

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
                overflow-y: visible;
                overflow-x: clip;
                background: var(--ux-color-page, #f4f4f6);
                scrollbar-gutter: stable;
            }
            body.ux-shiken-single-page > .ux-shiken-single-button {
                flex: 0 0 ${UX_SHIKEN_DEFAULT_LEFT_WIDTH}px;
                width: ${UX_SHIKEN_DEFAULT_LEFT_WIDTH}px;
                height: 100vh;
                position: fixed;
                top: 0;
                left: 0;
                z-index: 10;
                border: 0;
                background-color: var(--ux-color-page, #EBF6FF);
            }
            body.ux-shiken-single-page > .ux-shiken-scroll {
                flex: 1 1 auto;
                min-width: 0;
                min-height: 100vh;
                margin-left: ${UX_SHIKEN_DEFAULT_LEFT_WIDTH}px;
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
                background: var(--ux-color-page, #f4f4f6);
                cursor: ns-resize;
                touch-action: none;
            }
            body.ux-shiken-single-page .ux-shiken-question-resize-handle::before {
                content: "";
                position: absolute;
                left: 12px;
                right: 12px;
                top: 6px;
                height: 2px;
                border-radius: 999px;
                background: var(--ux-color-border-strong, #BFD4E1);
                transition: height 120ms ease, top 120ms ease, background-color 120ms ease;
            }
            body.ux-shiken-single-page .ux-shiken-question-resize-handle:hover::before,
            body.ux-shiken-single-page .ux-shiken-question-resize-handle:focus-visible::before,
            body.ux-shiken-single-page.ux-shiken-question-resizing .ux-shiken-question-resize-handle::before {
                top: 5px;
                height: 4px;
                background: var(--ux-color-accent, #0071e3);
            }
            body.ux-shiken-single-page .ux-shiken-question-resize-handle:focus-visible {
                outline: var(--ux-focus-width, 2px) solid var(--ux-focus-color, var(--ux-color-accent, #0071e3));
                outline-offset: var(--ux-focus-offset, -2px);
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
                /* Invisible hit target preserves pointer capture during resize. */
                background-color: var(--ux-color-page, #EBF6FF);
                opacity: 0;
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

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();

    const startY = event.screenY;
    const startHeight = questionIframe.getBoundingClientRect().height;
    let latestHeight = startHeight;
    const pointerId = event.pointerId;
    const shield = doc.createElement("div");
    shield.className = "ux-shiken-question-resize-shield";
    doc.body.appendChild(shield);
    doc.body.classList.add("ux-shiken-question-resizing");
    try {
      handle.setPointerCapture(pointerId);
    } catch {}

    const onMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      latestHeight = setHeight(startHeight + moveEvent.screenY - startY);
    };
    const onEnd = (endEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);
      shield.remove();
      doc.body.classList.remove("ux-shiken-question-resizing");
      saveShikenHorizontalQuestionHeight(latestHeight, doc);
      try {
        handle.releasePointerCapture(pointerId);
      } catch {}
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
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
    if (info.name === "description") {
      iframe.hidden = true;
      iframe.style.display = "none";
    }
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
  if (
    structure.mainFrameset?.dataset?.uxShikenSplit === "vertical-onebyone" &&
    structure.mainFrameset.hasAttribute("cols")
  ) {
    saveShikenVerticalCols(
      structure.mainFrameset.getAttribute("cols"),
      doc,
      "onebyone",
    );
    return;
  }
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
    if (data.type === "UX_SHIKEN_ONEBYONE_DESCRIPTION_VISIBILITY") {
      const descriptionFrame = document.querySelector(
        'iframe[name="description"], frame[name="description"]',
      );
      if (!descriptionFrame) return;

      let isDirectDescriptionFrame = false;
      try {
        isDirectDescriptionFrame =
          descriptionFrame.contentWindow === event.source;
      } catch {}
      if (!isDirectDescriptionFrame) return;

      const visible = data.visible === true;
      if (descriptionFrame.tagName === "IFRAME") {
        descriptionFrame.hidden = !visible;
        descriptionFrame.style.display = visible ? "block" : "none";
        if (visible) bindShikenIframeAutoHeight(descriptionFrame);
        return;
      }

      const answerCols = descriptionFrame.parentElement;
      if (answerCols?.tagName === "FRAMESET") {
        const visibleCols =
          answerCols.dataset.uxDescriptionVisibleCols || "390,*";
        answerCols.setAttribute("cols", visible ? visibleCols : "*,0");
      }
      return;
    }
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
