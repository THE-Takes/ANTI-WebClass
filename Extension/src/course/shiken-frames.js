// course/shiken-frames.js
// Exam frameset, question frame, and button frame enhancements.

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
            background: var(--ux-color-page);
        }
        body {
            box-sizing: border-box;
            display: flex;
            align-items: stretch;
            padding: 14px 18px 8px;
            color: var(--ux-color-text);
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
            border: 1px solid var(--ux-color-border);
            border-radius: 6px;
            background: var(--ux-color-surface);
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
            background: var(--ux-color-surface);
            color: var(--ux-color-muted);
            font-size: 12px;
            font-weight: 700;
            line-height: 1.3;
        }
        .ux-shiken-question-card:focus-visible {
            outline: var(--ux-focus-width, 2px) solid var(--ux-focus-color, var(--ux-color-accent));
            outline-offset: var(--ux-focus-offset, 2px);
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
            color: var(--ux-color-muted);
            line-height: 0;
            flex: 0 0 12px;
            background-color: var(--ux-color-surface-muted);
            cursor: ns-resize;
            opacity: 1;
        }
        .ux-shiken-frame-resize-handle:hover,
        .ux-shiken-frame-resize-handle:focus-visible {
            opacity: 1;
            background-color: var(--ux-color-surface-subtle);
        }
        .ux-shiken-frame-resize-handle:focus-visible {
            outline: var(--ux-focus-width, 2px) solid var(--ux-focus-color, var(--ux-color-accent));
            outline-offset: var(--ux-focus-offset, 2px);
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
            background: var(--ux-color-page);
        }
        body {
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            padding: 8px;
            background: var(--ux-color-page);
            font-family: 'Noto Sans JP', 'Yu Gothic', 'Meiryo', 'Hiragino Sans', 'Segoe UI', sans-serif;
            color: var(--ux-color-text);
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
            background-color: var(--ux-color-page);
            border: 0;
            padding: 0;
            box-sizing: border-box;
            overflow-y: auto;
            overflow-x: hidden;
        }
        #WsTitle {
            background-color: var(--ux-color-page) !important;
            padding: 0 0 6px !important;
            margin: 0;
            border-bottom: 1px solid var(--ux-color-border);
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
            color: var(--ux-color-muted) !important;
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
            color: var(--ux-color-text) !important;
            line-height: 1.3;
        }
        #User,
        .User,
        div[id*="User"] {
            margin: 0;
            color: var(--ux-color-muted);
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
            background: var(--ux-color-surface);
            border: 1px solid var(--ux-color-border);
            border-radius: 6px;
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
            border: 1px solid var(--ux-color-border);
            border-radius: 6px;
            background: var(--ux-color-surface-subtle);
            color: var(--ux-color-accent-active);
            font-size: 12px;
            font-weight: 700;
            font-family: inherit;
            line-height: 26px;
            text-align: center;
            cursor: pointer;
        }
        .ux-shiken-inline-page.is-active {
            background: var(--ux-color-warning-surface);
            border-color: var(--ux-color-warning);
            color: var(--ux-color-warning);
        }
        .ux-btn {
            background: var(--ux-color-surface);
            border: 1px solid var(--ux-color-border);
            color: var(--ux-color-text);
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
            box-sizing: border-box;
            line-height: 1.25;
            white-space: normal;
            overflow-wrap: anywhere;
            width: 100%;
            justify-self: stretch;
        }
        .ux-btn:hover {
            background: var(--ux-color-surface);
            border-color: var(--ux-color-border-hover, #B1BEC6);
            color: var(--ux-color-text);
        }
        .ux-btn:focus-visible {
            border-color: var(--ux-color-accent);
            outline: var(--ux-focus-width, 2px) solid var(--ux-focus-color, var(--ux-color-accent));
            outline-offset: var(--ux-focus-offset, 2px);
        }
        .ux-btn.ux-danger {
            background: var(--ux-color-danger);
            border-color: var(--ux-color-danger);
            color: var(--ux-color-surface);
        }
        .ux-btn.ux-danger:hover {
            background: var(--ux-color-danger);
            border-color: var(--ux-color-danger);
        }
        .ux-btn:disabled {
            background: var(--ux-color-surface-muted);
            border-color: var(--ux-color-border);
            color: var(--ux-color-muted);
            cursor: not-allowed;
        }
        .ux-btn.ux-shiken-button-save {
            background: var(--ux-color-accent);
            border-color: var(--ux-color-accent);
            color: #fff;
        }
        .ux-btn.ux-shiken-button-save:hover {
            background: var(--ux-color-accent-active, var(--ux-color-accent));
            border-color: var(--ux-color-accent-active, var(--ux-color-accent));
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
            background: var(--ux-color-surface);
            border: 1px solid var(--ux-color-border);
            border-radius: 6px;
            font-size: 12px;
            line-height: 1.35;
            color: var(--ux-color-muted);
            text-align: center;
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
            background-color: var(--ux-color-page) !important;
            padding: 0 !important;
            margin: 0 !important;
        }
        #TOCContent {
            display: block !important;
            width: 100% !important;
            height: clamp(5.75rem, 14vh, 7.75rem) !important;
            border: 1px solid var(--ux-color-border);
            background: var(--ux-color-surface);
            border-radius: 6px;
        }
        .ux-shiken-layout-toggle {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 34px 34px 34px;
            align-items: center;
            gap: 4px;
            min-height: 34px;
            padding: 3px;
            border: 1px solid var(--ux-color-border);
            border-radius: 6px;
            background: var(--ux-color-surface);
            box-sizing: border-box;
        }
        .ux-shiken-layout-toggle-label {
            min-width: 0;
            padding: 0 6px;
            color: var(--ux-color-muted);
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
            border: 1px solid var(--ux-color-border);
            border-radius: 5px;
            background-color: var(--ux-color-surface);
            color: var(--ux-color-muted);
            font-size: 12px;
            font-weight: 800;
            font-family: inherit;
            line-height: 1;
            cursor: pointer;
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
            background: var(--ux-color-surface);
            border-color: var(--ux-color-border-hover, #B1BEC6);
            color: var(--ux-color-text);
        }
        .ux-shiken-layout-toggle button.is-active {
            border-color: var(--ux-color-accent);
            background: var(--ux-color-info-surface);
            color: var(--ux-color-accent-active);
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
            background: var(--ux-color-page);
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
                html, body { margin: 0; padding: 4px; background: var(--ux-color-surface); font-family: 'Noto Sans JP', 'Yu Gothic', 'Meiryo', 'Hiragino Sans', 'Segoe UI', sans-serif; color: var(--ux-color-text); box-sizing: border-box; }
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
                    background: var(--ux-color-muted);
                }
                .ux-toc-star {
                    margin-left: 6px;
                    color: var(--ux-color-muted);
                    font-weight: 600;
                    font-size: 11px;
                    line-height: 1;
                }
                tr.bkkhaki td,
                td.bkkhaki {
                    background-color: var(--ux-color-surface);
                }
                tr.bkkhaki td.ux-toc-item::before,
                td.bkkhaki.ux-toc-item::before {
                    background: var(--ux-color-accent);
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
                    background: var(--ux-color-surface-subtle);
                    border: 1px solid var(--ux-color-border);
                    border-radius: 6px;
                    padding: 0;
                    font-size: 12px;
                    font-weight: 700;
                    font-family: inherit;
                    line-height: 26px;
                    text-align: center;
                    cursor: pointer;
                    color: var(--ux-color-accent-active);
                }
                input[type="button"]:hover,
                button:hover {
                    background: var(--ux-color-surface-subtle);
                    border-color: var(--ux-color-border-hover, #B1BEC6);
                    color: var(--ux-color-text);
                }
                input[type="button"]:focus-visible,
                button:focus-visible {
                    border-color: var(--ux-color-accent);
                    outline: var(--ux-focus-width, 2px) solid var(--ux-focus-color, var(--ux-color-accent));
                    outline-offset: var(--ux-focus-offset, 2px);
                }
                tr.bkkhaki input[type="button"],
                tr.bkkhaki button,
                td.bkkhaki input[type="button"],
                td.bkkhaki button {
                    background: var(--ux-color-warning-surface);
                    border-color: var(--ux-color-warning);
                    color: var(--ux-color-warning);
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
      finishBtn.disabled = true;
      finishBtn.textContent = "確認中…";
      finishBtn.setAttribute("aria-busy", "true");
      window.setTimeout(() => {
        if (submitShikenAnswerGrade()) {
          return;
        }
        if (originalFinishBtn) {
          originalFinishBtn.click();
        } else if (typeof window.gradeAndClose === "function") {
          window.gradeAndClose();
        }
      }, 0);
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
