// course/shiken-one-by-one.js
// One-by-one question-list, question, answer, and description frames.

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
            background: var(--ux-color-surface);
            color: var(--ux-color-text);
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
            border: 1px solid var(--ux-color-border);
            border-radius: 10px;
            color: var(--ux-color-text);
            font-size: 13px;
            font-weight: 650;
            line-height: 1.2;
            vertical-align: middle;
            background: var(--ux-color-surface);
        }
        tr.ux-qnav-item.is-current td.ux-qnav-label {
            border-color: var(--ux-color-accent);
            background: var(--ux-color-info-surface);
            color: var(--ux-color-accent-active);
        }
        tr.ux-qnav-item.is-unanswered:not(.is-current) td.ux-qnav-label {
            color: var(--ux-color-muted);
        }
        .red_moji {
            color: var(--ux-color-accent-active);
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
            border: 1px solid var(--ux-color-border);
            border-radius: 8px;
            padding: 0;
            background: var(--ux-color-surface-subtle);
            color: var(--ux-color-accent-active);
            font-family: inherit;
            font-size: 12px;
            font-weight: 700;
            line-height: 26px;
            text-align: center;
            cursor: pointer;
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
            background: var(--ux-color-page);
        }
        body {
            box-sizing: border-box;
            display: flex;
            align-items: stretch;
            padding: 14px 18px 10px 18px;
            color: var(--ux-color-text);
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
            border: 1px solid var(--ux-color-border);
            border-radius: 12px;
            background: var(--ux-color-surface);
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
            background: var(--ux-color-surface);
            color: var(--ux-color-muted);
            font-size: 12px;
            font-weight: 700;
            line-height: 1.3;
        }
        .ux-onebyone-question-card:focus-visible {
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

function shouldDisableOneByOneBackButton(
  backButton,
  navState,
  isGradeConfirmation,
) {
  if (isGradeConfirmation) return false;
  return backButton.disabled || !navState.canPrev;
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
  if (!document.getElementById("ux-onebyone-answer-style")) {
    const style = document.createElement("style");
    style.id = "ux-onebyone-answer-style";
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
            padding: 10px 10px 16px 18px;
            color: var(--ux-color-text);
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
            padding: 18px 20px;
            border: 1px solid var(--ux-color-border);
            border-radius: 12px;
            background: var(--ux-color-surface);
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
        .ux-onebyone-answer-shell {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box;
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
        body.ux-shiken-frame-resizing,
        body.ux-shiken-frame-resizing * {
            cursor: ns-resize !important;
            user-select: none !important;
        }
        .ux-onebyone-answer-heading {
            margin: 0;
            color: var(--ux-color-muted);
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
            border: 1px solid var(--ux-color-border);
            border-radius: 10px;
            background: var(--ux-color-surface-subtle);
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
            color: var(--ux-color-muted);
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
            background-color: var(--ux-color-surface);
            color: var(--ux-color-text);
            font-size: 15px;
            font-weight: 700;
            line-height: 1.35;
            white-space: nowrap;
            vertical-align: middle;
        }
        table.qstnoptions tr.ux-choice-hidden-row {
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
            color: var(--ux-color-muted);
            font-size: 12px;
            font-weight: 600;
            text-align: right;
            background-color: var(--ux-color-surface);
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
            border: 1px solid var(--ux-color-border);
            border-radius: 10px;
            background: var(--ux-color-surface-subtle);
            color: var(--ux-color-text);
            cursor: pointer;
            transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
        }
        .ux-onebyone-choice:hover {
            border-color: var(--ux-color-accent);
            background: var(--ux-color-surface-subtle);
        }
        .ux-onebyone-choice.is-selected {
            border-color: var(--ux-color-accent);
            background: var(--ux-color-info-surface);
            color: var(--ux-color-accent-active);
        }
        .ux-onebyone-choice-number {
            color: var(--ux-color-muted);
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
            color: var(--ux-color-muted);
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
            border: 1px solid var(--ux-color-border);
            border-left: 4px solid var(--ux-color-accent);
            border-radius: 10px;
            background: var(--ux-color-surface-subtle);
            color: var(--ux-color-text);
            font-size: 15px;
            font-weight: 800;
            line-height: 1.35;
        }
        .ux-onebyone-result-title.is-correct {
            border-left-color: var(--ux-color-success);
            background: var(--ux-color-success-surface);
            color: var(--ux-color-success);
        }
        .ux-onebyone-result-title.is-wrong {
            border-left-color: var(--ux-color-danger);
            background: var(--ux-color-danger-surface);
            color: var(--ux-color-danger);
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
            border: 1px solid var(--ux-color-border);
            border-radius: 10px;
            background: var(--ux-color-surface-subtle);
            color: var(--ux-color-text);
        }
        .ux-onebyone-result-choice.is-selected {
            border-color: var(--ux-color-accent);
            background: var(--ux-color-info-surface);
            color: var(--ux-color-accent-active);
        }
        .ux-onebyone-result-number {
            color: var(--ux-color-muted);
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
            border: 1px solid var(--ux-color-border);
            border-radius: 50%;
            color: var(--ux-color-muted);
            font-size: 12px;
            font-weight: 800;
            line-height: 1;
        }
        .ux-onebyone-result-choice.is-selected .ux-onebyone-result-marker {
            border-color: var(--ux-color-accent);
            background: var(--ux-color-accent);
            color: var(--ux-color-surface);
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
            color: var(--ux-color-muted);
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
            border-color: var(--ux-color-accent);
            background: var(--ux-color-surface-subtle);
        }
        table.qstnoptions tr.ux-choice-row.is-selected {
            border-color: var(--ux-color-accent);
            background: var(--ux-color-info-surface);
        }
        table.qstnoptions tr.ux-choice-row.is-selected td,
        table.qstnoptions tr.ux-choice-row.is-selected th {
            color: var(--ux-color-accent-active);
        }
        input[type="radio"] {
            width: 14px;
            height: 14px;
            margin: 0;
            accent-color: var(--ux-color-accent);
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
            border: 1px solid var(--ux-color-border);
            border-radius: 10px;
            padding: 8px 10px;
            background: var(--ux-color-surface);
            color: var(--ux-color-text);
            font-family: inherit;
            font-size: 14px;
        }
        textarea {
            min-height: clamp(16rem, 48vh, 34rem);
            line-height: 1.55;
            resize: vertical;
        }
        .ux-onebyone-answer-actions {
            width: 100%;
            margin-top: 6px;
            padding-top: 14px;
            border-top: 1px solid var(--ux-color-border);
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            gap: 8px;
            align-items: center;
        }
        .ux-onebyone-nav-actions,
        .ux-onebyone-primary-actions {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
        }
        .ux-onebyone-primary-actions {
            margin-left: auto;
        }
        .ux-onebyone-answer-actions button,
        .ux-onebyone-answer-actions input[type="button"] {
            width: auto !important;
            min-width: 132px;
            min-height: 38px;
            box-sizing: border-box;
            border: 1px solid var(--ux-color-border);
            border-radius: 8px;
            padding: 0 18px;
            background: var(--ux-color-surface-subtle);
            color: var(--ux-color-accent-active);
            font-family: inherit;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.2;
            cursor: pointer;
        }
        .ux-onebyone-answer-actions button:hover,
        .ux-onebyone-answer-actions input[type="button"]:hover {
            background: var(--ux-color-surface-subtle);
            border-color: var(--ux-color-border-hover, #B1BEC6);
            color: var(--ux-color-text);
        }
        .ux-onebyone-answer-actions button:disabled,
        .ux-onebyone-answer-actions input[type="button"]:disabled {
            background: var(--ux-color-surface-muted);
            border-color: var(--ux-color-border);
            color: var(--ux-color-muted);
            cursor: not-allowed;
        }
        .ux-onebyone-answer-actions button[name="grade"],
        .ux-onebyone-answer-actions input[name="grade"],
        .ux-onebyone-answer-actions .ux-danger,
        .ux-onebyone-answer-actions #GradeBtn {
            background: var(--ux-color-danger);
            border-color: var(--ux-color-danger);
            color: var(--ux-color-surface);
        }
        .ux-onebyone-answer-actions button[name="grade"]:hover,
        .ux-onebyone-answer-actions input[name="grade"]:hover,
        .ux-onebyone-answer-actions .ux-danger:hover,
        .ux-onebyone-answer-actions #GradeBtn:hover {
            background: var(--ux-color-danger);
            border-color: var(--ux-color-danger);
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
        @media (max-width: 520px) {
            form[name="answer_form"] {
                padding: 16px;
            }
            .ux-onebyone-answer-actions button,
            .ux-onebyone-answer-actions input[type="button"] {
                flex: 1 1 100%;
                width: 100%;
            }
            .ux-onebyone-nav-actions,
            .ux-onebyone-primary-actions {
                width: 100%;
                margin-left: 0;
            }
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
  }

  const form = document.querySelector('form[name="answer_form"]');
  if (!form) return;

  if (form.parentElement && form.parentElement !== document.body) {
    const answerRoot = form.parentElement;
    answerRoot.classList.add("ux-onebyone-answer-root");
    let answerShell = answerRoot;
    while (answerShell && answerShell !== document.body) {
      answerShell.classList.add("ux-onebyone-answer-shell");
      answerShell = answerShell.parentElement;
    }
    if (isShikenSinglePageActive()) {
      attachShikenFrameResizeHandle(answerRoot, {
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
      row.classList.add("ux-choice-hidden-row");
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

  const actionBar =
    form.querySelector(".ux-onebyone-answer-actions") ||
    document.createElement("div");
  if (!actionBar.parentElement) {
    actionBar.className = "ux-onebyone-answer-actions";
    form.appendChild(actionBar);
  }

  {
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
    const gradedResultVisible = !!form.querySelector(
      ".ux-onebyone-result-title, .ux-onebyone-result-list",
    );
    let backButton = findActionControl(
      [/^戻る$/, /^前のページ$/],
      [
        'input[name="back"]',
        'button[name="back"]',
        'input[value="戻る"]',
        'button[value="戻る"]',
      ],
    );
    const nextButton = findActionControl(
      [/^次の(?:ページ|問題)(?:へ進む)?$/],
      ["#QstnNextBtn", 'button[name="next"]', 'input[name="next"]'],
    );
    const checkButton = findActionControl(
      [/^解答チェック$/],
      ["#QstnChkBtn", 'button[name="check"], input[name="check"]'],
    );
    const gradeButton = findActionControl(
      [/^(終了|採点|提出|送信|完了)(する)?$/, /(終了|提出|採点)$/],
      ["#GradeBtn", 'button[name="grade"], input[name="grade"]'],
    );
    const navState = getShikenNavigationState(document);
    const normalizedFormText = (form.textContent || "")
      .replace(/\s+/g, "")
      .trim();
    const isGradeConfirmation =
      /(採点|終了|提出).*(よろしい|しますか|確認)/.test(normalizedFormText) ||
      /(よろしい|しますか|確認).*(採点|終了|提出)/.test(normalizedFormText);

    if (isGradeConfirmation && !backButton) {
      backButton = document.createElement("button");
      backButton.type = "button";
      backButton.className = "ux-btn";
      backButton.textContent = "戻る";
      backButton.setAttribute("aria-label", "採点をキャンセルして回答へ戻る");
      backButton.addEventListener("click", (event) => {
        event.preventDefault();
        window.history.back();
      });
    }

    if (navState) {
      if (backButton)
        backButton.disabled = shouldDisableOneByOneBackButton(
          backButton,
          navState,
          isGradeConfirmation,
        );
      if (nextButton)
        nextButton.disabled = nextButton.disabled || !navState.canNext;
    }
    if (gradeButton) gradeButton.classList.add("ux-danger");

    if (gradedResultVisible && backButton) {
      if (backButton.tagName === "INPUT") {
        backButton.value = "戻る";
      } else {
        backButton.textContent = "戻る";
      }
      backButton.setAttribute("aria-label", "採点結果から回答へ戻る");
    }

    const navActions =
      actionBar.querySelector(".ux-onebyone-nav-actions") ||
      document.createElement("div");
    if (!navActions.parentElement) {
      navActions.className = "ux-onebyone-nav-actions";
      actionBar.appendChild(navActions);
    }
    const primaryActions =
      actionBar.querySelector(".ux-onebyone-primary-actions") ||
      document.createElement("div");
    if (!primaryActions.parentElement) {
      primaryActions.className = "ux-onebyone-primary-actions";
      actionBar.appendChild(primaryActions);
    }

    [backButton, nextButton].forEach((button) => {
      if (!button || actionBar.contains(button)) return;
      navActions.appendChild(button);
    });
    [checkButton, gradeButton].forEach((button) => {
      if (!button || actionBar.contains(button)) return;
      primaryActions.appendChild(button);
    });

    navActions.hidden = navActions.children.length === 0;
    primaryActions.hidden = primaryActions.children.length === 0;
  }

  if (form.dataset.uxOneByOneActionsObserved !== "true") {
    form.dataset.uxOneByOneActionsObserved = "true";
    let actionRefreshPending = false;
    const actionObserver = new MutationObserver((mutations) => {
      if (
        mutations.every((mutation) => {
          const targetElement =
            mutation.target?.nodeType === Node.ELEMENT_NODE
              ? mutation.target
              : mutation.target?.parentElement;
          return !!targetElement?.closest?.(".ux-onebyone-answer-actions");
        })
      ) {
        return;
      }
      if (actionRefreshPending) return;
      actionRefreshPending = true;
      window.setTimeout(() => {
        actionRefreshPending = false;
        if (document.contains(form)) enhanceOneByOneShikenAnswerFrame();
      }, 0);
    });
    safeObserveUxMutation(actionObserver, form, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeFilter: ["value", "disabled", "hidden", "style", "class"],
    });
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
            background: var(--ux-color-page);
        }
        body {
            box-sizing: border-box;
            padding: 10px 18px 16px 10px;
            color: var(--ux-color-text);
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
            border: 1px solid var(--ux-color-border);
            border-radius: 12px;
            background: var(--ux-color-surface);
        }
        h1, h2, h3 {
            margin: 0 0 12px;
            padding: 0 0 10px;
            border-bottom: 1px solid var(--ux-color-border);
            color: var(--ux-color-muted);
            font-size: 13px;
            font-weight: 700;
            line-height: 1.35;
        }
        p,
        .ux-onebyone-description-card > div {
            max-width: 72em;
        }
        a {
            color: var(--ux-color-accent-active);
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
  const descriptionCard = wrapOneByOneBodyContent(
    "ux-onebyone-description-card",
  );
  if (!descriptionCard) return;

  const syncDescriptionVisibility = () => {
    const readableCard = descriptionCard.cloneNode(true);
    readableCard
      .querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')
      .forEach((heading) => {
        const headingText = (heading.textContent || "")
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (
          /^(解説|コメント|講評)/u.test(headingText) &&
          /全体を表示/u.test(headingText)
        ) {
          heading.remove();
        }
      });
    readableCard.querySelectorAll("a").forEach((link) => {
      if (/全体を表示/.test(link.textContent || "")) link.remove();
    });
    const text = (readableCard.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^(解説|コメント|講評)\s*[:：]?\s*$/u, "")
      .trim();
    const hasRichContent = !!readableCard.querySelector(
      "img, video, audio, iframe, table, pre, blockquote",
    );
    const visible = text.length > 0 || hasRichContent;
    document.documentElement.dataset.uxDescriptionVisible = visible
      ? "true"
      : "false";
    try {
      window.top.postMessage(
        {
          type: "UX_SHIKEN_ONEBYONE_DESCRIPTION_VISIBILITY",
          visible,
        },
        "*",
      );
    } catch {}
  };

  syncDescriptionVisibility();
  if (descriptionCard.dataset.uxDescriptionObserved !== "true") {
    descriptionCard.dataset.uxDescriptionObserved = "true";
    let visibilityRefreshPending = false;
    const descriptionObserver = new MutationObserver(() => {
      if (visibilityRefreshPending) return;
      visibilityRefreshPending = true;
      window.setTimeout(() => {
        visibilityRefreshPending = false;
        syncDescriptionVisibility();
      }, 0);
    });
    safeObserveUxMutation(descriptionObserver, descriptionCard, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
}
