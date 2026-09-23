// course/shiken-answer.js
// Exam answer persistence status and answer frame UI.

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
            background: var(--ux-color-page);
        }
        body {
            background: var(--ux-color-page);
            font-family: 'Noto Sans JP', 'Yu Gothic', 'Meiryo', 'Hiragino Sans', 'Segoe UI', sans-serif;
            color: var(--ux-color-text);
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
            background-color: var(--ux-color-page);
            border: 0;
            border-radius: 0;
            padding: 0;
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
        form[name="answer_form"]:not(.ux-shiken-answer-form) {
            min-height: 0;
            flex: 0 0 auto;
        }
        form[name="answer_form"]:not(.ux-shiken-answer-form) .ux-answer-actions {
            margin-top: 12px;
        }
        .ux-shiken-answer-heading {
            margin: 0;
            color: var(--ux-color-muted);
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
            border: 1px solid var(--ux-color-border);
            border-radius: 6px;
            background: var(--ux-color-surface);
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
        .ux-shiken-answer-card > .ux-shiken-answer-heading:first-child,
        .ux-shiken-upload-answer-card > .ux-shiken-answer-heading:first-child {
            position: sticky;
            top: -16px;
            z-index: 1;
            display: flex;
            margin: -16px -20px 10px;
            padding: 16px 20px 4px;
            background: var(--ux-color-surface);
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
            color: var(--ux-color-muted);
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
            color: var(--ux-color-success);
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
            border: 2px solid var(--ux-color-success);
            background-color: var(--ux-color-success);
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
            color: var(--ux-color-muted);
        }
        .ux-answer-save-status.is-saving .ux-answer-save-check {
            border-color: var(--ux-color-border);
            background-color: var(--ux-color-surface-muted);
        }
        .ux-answer-save-status.is-saving .ux-answer-save-check span {
            display: none;
        }
        .ux-answer-save-status.is-last-saved {
            color: var(--ux-color-muted);
            font-weight: 600;
        }
        .ux-answer-save-status.is-last-saved .ux-answer-save-check {
            display: none;
        }
        .ux-native-select,
        select, input[type="text"], input[type="file"], textarea {
            border: 1px solid var(--ux-color-border);
            border-radius: 6px;
            padding: 8px 10px;
            font-size: 14px;
            font-family: inherit;
            background-color: var(--ux-color-surface);
            color: var(--ux-color-text);
        }
        input[type="file"] {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
            min-height: 40px;
        }
        select:focus, input[type="text"]:focus, input[type="file"]:focus, textarea:focus,
        .ux-select-display:focus {
            border-color: var(--ux-color-accent);
            outline: var(--ux-focus-width, 2px) solid var(--ux-focus-color, var(--ux-color-accent));
            outline-offset: var(--ux-focus-offset, 2px);
        }
        select:focus-visible, input[type="text"]:focus-visible, input[type="file"]:focus-visible, textarea:focus-visible,
        .ux-select-display:focus-visible,
        button:focus-visible,
        input[type="button"]:focus-visible,
        input[type="submit"]:focus-visible {
            border-color: var(--ux-color-accent);
            outline: var(--ux-focus-width, 2px) solid var(--ux-focus-color, var(--ux-color-accent));
            outline-offset: var(--ux-focus-offset, 2px);
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
            background: var(--ux-color-surface);
            border: 1px solid var(--ux-color-border);
            border-radius: 6px;
            padding: 4px 26px 4px 8px;
            font-size: var(--ux-select-display-font-size, 14px);
            color: var(--ux-color-text);
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
            background: var(--ux-color-surface);
            border: 1px solid var(--ux-color-border);
            border-radius: 8px;
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
            background-color: var(--ux-color-surface);
            border: none;
            padding: 6px 8px;
            border-radius: 6px;
            font-size: var(--ux-select-option-font-size, 14px);
            line-height: 1.25;
            min-height: 32px;
            cursor: pointer;
            color: var(--ux-color-text);
        }
        .ux-select-option:hover {
            background: var(--ux-color-surface-subtle);
        }
        .ux-select-option[aria-selected="true"] {
            background: var(--ux-color-info-surface);
            font-weight: 600;
        }
        input[type="button"], button {
            background: var(--ux-color-accent);
            border: 1px solid var(--ux-color-accent);
            color: var(--ux-color-surface);
            border-radius: 6px;
            padding: 0 12px;
            min-height: 38px;
            font-size: 13px;
            font-weight: 700;
            font-family: inherit;
            line-height: 1.2;
            cursor: pointer;
            transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
        }
        input[type="button"]:hover, button:hover {
            background: var(--ux-color-accent-active);
            border-color: var(--ux-color-accent-active);
        }
        input[type="button"]:disabled, button:disabled {
            background: var(--ux-color-surface-muted);
            border-color: var(--ux-color-border);
            color: var(--ux-color-muted);
            cursor: not-allowed;
        }
        .ux-answer-nav .ux-btn {
            background: var(--ux-color-surface);
            border-color: var(--ux-color-border);
            color: var(--ux-color-accent-active);
            min-width: 0;
            width: 100%;
            box-sizing: border-box;
            white-space: normal;
            overflow-wrap: anywhere;
            line-height: 1.25;
        }
        .ux-answer-nav .ux-btn:hover {
            background: var(--ux-color-surface);
            border-color: var(--ux-color-border-hover, #B1BEC6);
            color: var(--ux-color-text);
        }
        .ux-answer-nav .ux-btn:disabled {
            background: var(--ux-color-surface-muted);
            border-color: var(--ux-color-border);
            color: var(--ux-color-muted);
            cursor: not-allowed;
        }
        .ux-answer-primary-actions .ux-btn.ux-primary,
        .ux-answer-primary-actions .ux-btn.ux-danger {
            background: var(--ux-color-danger);
            border-color: var(--ux-color-danger);
            color: var(--ux-color-surface);
            min-width: 0;
            width: 100%;
            box-sizing: border-box;
            white-space: normal;
            overflow-wrap: anywhere;
            line-height: 1.25;
        }
        .ux-answer-primary-actions .ux-btn.ux-primary:hover,
        .ux-answer-primary-actions .ux-btn.ux-danger:hover {
            background: var(--ux-color-danger);
            border-color: var(--ux-color-danger);
            color: var(--ux-color-surface);
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

}

/**
 * コンテンツフレーム（右側のPDF表示部分）のUI改善
 */
