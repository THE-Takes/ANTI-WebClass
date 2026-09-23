// course/video-fullscreen.js
// Native video fullscreen support for WebClass' legacy material frames.

const UX_VIDEO_FULLSCREEN_CONTENT_IFRAME_ID =
  "ux-video-fullscreen-content-frame";
const UX_VIDEO_ORIGINAL_FRAME_NAME_ATTR =
  "data-ux-video-original-frame-name";

function grantVideoFullscreenPermission(frame) {
  if (!frame || frame.tagName !== "IFRAME") return;

  const allow = frame.getAttribute("allow") || "";
  const directives = allow
    .split(";")
    .map((directive) => directive.trim())
    .filter(Boolean);
  if (!directives.some((directive) => /^fullscreen(?:\s|$)/i.test(directive))) {
    directives.push("fullscreen");
    frame.setAttribute("allow", directives.join("; "));
  }
}

function getVideoContentFrameTopInset(topDoc) {
  const rows = topDoc
    ?.querySelector("frameset[rows]")
    ?.getAttribute("rows");
  const firstRow = String(rows || "55,*")
    .split(",")[0]
    .trim();
  const inset = Number.parseFloat(firstRow);
  return Number.isFinite(inset) ? Math.max(0, inset) : 55;
}

function setVideoContentFrameTopInset(frame, inset) {
  if (!frame) return;
  const safeInset = Number.isFinite(inset) ? Math.max(0, inset) : 55;
  frame.style.top = `${safeInset}px`;
  frame.style.height =
    safeInset > 0 ? `calc(100vh - ${safeInset}px)` : "100vh";
}

function syncFullscreenVideoContentFrameLayout(showRibbon) {
  try {
    const topDoc = window.top?.document || document;
    const frame = topDoc.getElementById(
      UX_VIDEO_FULLSCREEN_CONTENT_IFRAME_ID,
    );
    if (!frame) return;
    setVideoContentFrameTopInset(frame, showRibbon ? 55 : 0);
  } catch {
    // Ignore inaccessible parent documents.
  }
}

function promoteLegacyVideoFrameToFullscreenIframe() {
  try {
    const legacyFrame = window.frameElement;
    if (!legacyFrame || legacyFrame.tagName !== "FRAME") return null;

    const topDoc = window.top?.document;
    if (!topDoc) return null;

    const existing = topDoc.getElementById(
      UX_VIDEO_FULLSCREEN_CONTENT_IFRAME_ID,
    );
    if (existing) {
      grantVideoFullscreenPermission(existing);
      return existing;
    }

    const originalName = legacyFrame.getAttribute("name") || "";
    if (originalName !== "webclass_content") return null;

    const sourceUrl = window.location.href;
    legacyFrame.setAttribute(UX_VIDEO_ORIGINAL_FRAME_NAME_ATTR, originalName);
    legacyFrame.setAttribute("name", `${originalName}_legacy`);

    const iframe = topDoc.createElement("iframe");
    iframe.id = UX_VIDEO_FULLSCREEN_CONTENT_IFRAME_ID;
    iframe.setAttribute("name", originalName);
    iframe.setAttribute("src", sourceUrl);
    iframe.setAttribute("title", "教材コンテンツ");
    grantVideoFullscreenPermission(iframe);
    iframe.style.cssText = `
      position: fixed;
      left: 0;
      width: 100vw;
      border: 0;
      z-index: 1;
      display: block;
      background: var(--ux-color-surface);
    `;
    setVideoContentFrameTopInset(
      iframe,
      getVideoContentFrameTopInset(topDoc),
    );

    topDoc.documentElement.appendChild(iframe);
    return iframe;
  } catch (error) {
    log("Could not create fullscreen-capable video frame:", error);
    return null;
  }
}

function ensureVideoNativeFullscreenContext() {
  try {
    const frame = window.frameElement;
    if (!frame) return;

    if (frame.tagName === "IFRAME") {
      grantVideoFullscreenPermission(frame);
      return;
    }

    if (frame.tagName === "FRAME" && !document.fullscreenEnabled) {
      promoteLegacyVideoFrameToFullscreenIframe();
    }
  } catch (error) {
    log("Could not prepare native video fullscreen:", error);
  }
}

function restoreFullscreenCapableVideoFrame(doc = document) {
  try {
    const overlayFrame = doc.getElementById(
      UX_VIDEO_FULLSCREEN_CONTENT_IFRAME_ID,
    );
    let currentSource = "";
    try {
      currentSource =
        overlayFrame?.contentWindow?.location?.href ||
        overlayFrame?.getAttribute("src") ||
        "";
    } catch {
      currentSource = overlayFrame?.getAttribute("src") || "";
    }

    doc
      .querySelectorAll(`[${UX_VIDEO_ORIGINAL_FRAME_NAME_ATTR}]`)
      .forEach((legacyFrame) => {
        const originalName = legacyFrame.getAttribute(
          UX_VIDEO_ORIGINAL_FRAME_NAME_ATTR,
        );
        if (originalName) legacyFrame.setAttribute("name", originalName);
        legacyFrame.removeAttribute(UX_VIDEO_ORIGINAL_FRAME_NAME_ATTR);
        if (currentSource && currentSource !== "about:blank") {
          legacyFrame.setAttribute("src", currentSource);
        }
      });

    overlayFrame?.remove();
  } catch {
    // Ignore inaccessible or partially loaded frame documents.
  }
}
