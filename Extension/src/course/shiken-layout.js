// course/shiken-layout.js
// Exam page detection, persisted sizing, and base horizontal/vertical layouts.

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

var UX_SHIKEN_LAYOUT_HORIZONTAL = "horizontal";
var UX_SHIKEN_LAYOUT_VERTICAL = "vertical";
var UX_SHIKEN_LAYOUT_ORIGIN = "origin";
const UX_SHIKEN_LAYOUT_SESSION_KEY_PREFIX = "uxShikenLayoutMode";
const UX_SHIKEN_VERTICAL_COLS_SESSION_KEY_PREFIX = "uxShikenVerticalCols";
const UX_SHIKEN_HORIZONTAL_QUESTION_HEIGHT_SESSION_KEY_PREFIX =
  "uxShikenHorizontalQuestionHeight";
var UX_SHIKEN_VISUAL_REINIT_MESSAGE = "UX_SHIKEN_VISUAL_REINIT_REQUEST";
var UX_SHIKEN_ORIGIN_LAYOUT_STYLE_ID = "ux-shiken-origin-layout-style";
var UX_SHIKEN_DEFAULT_LEFT_WIDTH = 280;
const UX_SHIKEN_DEFAULT_RIGHT_WIDTH = 430;
var UX_SHIKEN_HORIZONTAL_QUESTION_MIN_HEIGHT = 280;
var UX_SHIKEN_HORIZONTAL_QUESTION_MAX_HEIGHT = 20000;

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
  requiredTrackCount = null,
) {
  try {
    const value = sessionStorage.getItem(
      getShikenVerticalColsSessionKey(doc, splitType),
    );
    const tracks = String(value || "")
      .split(",")
      .map((track) => track.trim());
    const hasValidTracks =
      tracks.length >= 2 &&
      tracks.length <= 3 &&
      tracks.every((track) => /^(?:\d+%?|\*)$/.test(track));
    const hasRequiredTrackCount =
      requiredTrackCount === null || tracks.length === requiredTrackCount;

    if (hasValidTracks && hasRequiredTrackCount) {
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

function applyVerticalOneByOneShikenLayout(doc = document) {
  rememberUxOriginalFrameStructure(doc);
  rememberUxOriginalShikenFrameStructure(doc);

  const outerFrameset =
    doc.querySelector("frameset[rows]") || doc.querySelector("frameset");
  const mainFrameset = Array.from(doc.querySelectorAll("frameset")).find(
    (frameset) => !!getDirectChildFrame(frameset, "button"),
  );
  if (!outerFrameset || !mainFrameset) return false;

  const buttonFrame = getDirectChildFrame(mainFrameset, "button");
  const contentRows = Array.from(mainFrameset.children).find(
    (child) =>
      child.tagName === "FRAMESET" &&
      !!getDirectChildFrame(child, "question"),
  );
  const questionFrame = getDirectChildFrame(contentRows, "question");
  const answerGroup = Array.from(contentRows?.children || []).find(
    (child) =>
      child.tagName === "FRAMESET" &&
      !!getDirectChildFrame(child, "answer"),
  );
  const answerFrame = getDirectChildFrame(answerGroup, "answer");
  const descriptionFrame = getDirectChildFrame(answerGroup, "description");
  if (!buttonFrame || !contentRows || !questionFrame || !answerGroup || !answerFrame) {
    return false;
  }

  hideShikenTitleRow(outerFrameset);
  mainFrameset.insertBefore(questionFrame, contentRows);
  mainFrameset.insertBefore(answerGroup, contentRows);
  contentRows.remove();

  mainFrameset.setAttribute(
    "cols",
    readShikenVerticalCols(
      doc,
      "onebyone",
      getDefaultDirectVerticalCols(),
      3,
    ),
  );
  mainFrameset.removeAttribute("rows");
  mainFrameset.dataset.uxShikenSplit = "vertical-onebyone";
  setFramesetChrome(mainFrameset, {
    border: "4",
    frameborder: "1",
    framespacing: "4",
  });

  answerGroup.dataset.uxDescriptionVisibleCols =
    answerGroup.dataset.uxDescriptionVisibleCols || "390,*";
  if (descriptionFrame) answerGroup.setAttribute("cols", "*,0");
  setFramesetChrome(answerGroup);

  setShikenFrameResizePolicy(buttonFrame, false);
  setShikenFrameResizePolicy(questionFrame, true);
  setShikenFrameResizePolicy(answerFrame, true);
  setShikenFrameResizePolicy(descriptionFrame, true);
  return true;
}

function applyVerticalShikenLayout(doc = document) {
  if (hasOneByOneShikenFrameset(doc)) {
    return applyVerticalOneByOneShikenLayout(doc);
  }
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
      readShikenVerticalCols(
        doc,
        "direct",
        getDefaultDirectVerticalCols(),
        3,
      ),
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
