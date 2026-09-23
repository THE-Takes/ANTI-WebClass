// Same-window message workspace for course pages.

const UX_COURSE_MESSAGE_OVERLAY_ID = "ux-course-message-overlay";
const UX_COURSE_MESSAGE_FRAME_ID = "ux-course-message-frame";
const UX_COURSE_MESSAGE_FRAME_STYLE_ID = "ux-course-message-frame-style";
const UX_COURSE_MESSAGE_LINK_HANDLER_PROPERTY =
  "__uxCourseMessageLinkHandler";
const UX_COURSE_MESSAGE_FRAME_OBSERVER_PROPERTY =
  "__uxCourseMessageFrameObserver";
const UX_COURSE_MESSAGE_PREVIOUS_FOCUS_PROPERTY =
  "__uxCourseMessagePreviousFocus";

const UX_COURSE_MESSAGE_FRAME_CSS = `
  html.ux-course-message-frame,
  html.ux-course-message-frame body {
    width: 100% !important;
    height: 100% !important;
    min-height: 100% !important;
    margin: 0 !important;
    overflow: hidden !important;
    background: var(--ux-color-surface-subtle) !important;
  }

  html.ux-course-message-frame body.ux-dashboard-v2-mode {
    min-height: 100% !important;
  }

  html.ux-course-message-frame .ux-dashboard-v2-container {
    width: 100% !important;
    max-width: none !important;
    height: 100% !important;
    min-height: 100% !important;
  }

  html.ux-course-message-frame .ux-dashboard-v2-header,
  html.ux-course-message-frame .ux-dashboard-v2-right,
  html.ux-course-message-frame .ux-dashboard-v2-center > :not(.ux-dashboard-v2-messages) {
    display: none !important;
  }

  html.ux-course-message-frame .ux-dashboard-v2-main {
    display: block !important;
    width: 100% !important;
    height: 100% !important;
    min-height: 100% !important;
    padding: 0 !important;
    overflow: hidden !important;
  }

  html.ux-course-message-frame .ux-dashboard-v2-center {
    display: block !important;
    width: 100% !important;
    height: 100% !important;
    min-height: 100% !important;
  }

  html.ux-course-message-frame #ux-messages-section {
    display: flex !important;
    width: 100% !important;
    height: 100% !important;
    min-height: 100% !important;
    box-sizing: border-box !important;
    padding: 14px 16px 16px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: var(--ux-color-surface) !important;
  }

  html.ux-course-message-frame #ux-messages-section .ux-dashboard-v2-message-list {
    min-height: 0 !important;
    overflow: auto !important;
  }
`;

function getCourseMessageFrameUrl(doc = document) {
  try {
    const messageUrl =
      typeof getCourseHomeMessagesUrl === "function"
        ? getCourseHomeMessagesUrl(doc)
        : "";
    if (messageUrl) return messageUrl;
  } catch {
    // Use the fallback URL when the course helpers are unavailable.
  }

  try {
    const view = doc.defaultView || window;
    const fallbackUrl = new URL("/webclass/", view.location.origin);
    fallbackUrl.searchParams.set("ux_tab", "messages");
    return fallbackUrl.toString();
  } catch {
    return "";
  }
}

function applyCourseMessageFramePresentation(frame) {
  const frameDoc = frame?.contentDocument;
  if (!frameDoc?.documentElement) return false;

  frameDoc.documentElement.classList.add("ux-course-message-frame");
  frameDoc.body?.classList.add("ux-course-message-frame");

  let style = frameDoc.getElementById(UX_COURSE_MESSAGE_FRAME_STYLE_ID);
  if (!style) {
    style = frameDoc.createElement("style");
    style.id = UX_COURSE_MESSAGE_FRAME_STYLE_ID;
    style.textContent = UX_COURSE_MESSAGE_FRAME_CSS;
    (frameDoc.head || frameDoc.documentElement).appendChild(style);
  }

  return !!frameDoc.querySelector("#ux-messages-section");
}

function observeCourseMessageFrame(frame) {
  try {
    frame?.[UX_COURSE_MESSAGE_FRAME_OBSERVER_PROPERTY]?.disconnect();
  } catch {
    // Ignore an observer that was already disconnected.
  }

  if (applyCourseMessageFramePresentation(frame)) return;

  const frameDoc = frame?.contentDocument;
  if (!frameDoc?.documentElement) return;

  const observer = new MutationObserver(() => {
    if (applyCourseMessageFramePresentation(frame)) {
      observer.disconnect();
      if (frame[UX_COURSE_MESSAGE_FRAME_OBSERVER_PROPERTY] === observer) {
        frame[UX_COURSE_MESSAGE_FRAME_OBSERVER_PROPERTY] = null;
      }
    }
  });
  frame[UX_COURSE_MESSAGE_FRAME_OBSERVER_PROPERTY] = observer;
  observer.observe(frameDoc.documentElement, {
    childList: true,
    subtree: true,
  });

  window.setTimeout(() => {
    observer.disconnect();
    if (frame[UX_COURSE_MESSAGE_FRAME_OBSERVER_PROPERTY] === observer) {
      frame[UX_COURSE_MESSAGE_FRAME_OBSERVER_PROPERTY] = null;
    }
  }, 15000);
}

function closeCourseMessageOverlay(doc = document) {
  const overlay = doc.getElementById(UX_COURSE_MESSAGE_OVERLAY_ID);
  if (!overlay || overlay.hidden) return;

  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
  doc.documentElement.classList.remove("ux-course-message-open");
  doc.body?.classList.remove("ux-course-message-open");

  const previousFocus = overlay[UX_COURSE_MESSAGE_PREVIOUS_FOCUS_PROPERTY];
  overlay[UX_COURSE_MESSAGE_PREVIOUS_FOCUS_PROPERTY] = null;
  if (previousFocus?.isConnected && typeof previousFocus.focus === "function") {
    previousFocus.focus({ preventScroll: true });
  }
}

function ensureCourseMessageOverlay(doc = document) {
  const existingOverlay = doc.getElementById(UX_COURSE_MESSAGE_OVERLAY_ID);
  if (existingOverlay) {
    return {
      overlay: existingOverlay,
      frame: existingOverlay.querySelector(`#${UX_COURSE_MESSAGE_FRAME_ID}`),
      closeButton: existingOverlay.querySelector(
        ".ux-course-message-dialog-close",
      ),
    };
  }

  const overlay = doc.createElement("div");
  overlay.id = UX_COURSE_MESSAGE_OVERLAY_ID;
  overlay.className = "ux-course-message-overlay";
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");

  const dialog = doc.createElement("section");
  dialog.className = "ux-course-message-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "ux-course-message-dialog-title");

  const header = doc.createElement("header");
  header.className = "ux-course-message-dialog-header";

  const title = doc.createElement("h2");
  title.id = "ux-course-message-dialog-title";
  title.textContent = "メッセージ";

  const closeButton = doc.createElement("button");
  closeButton.type = "button";
  closeButton.className = "ux-course-message-dialog-close";
  closeButton.setAttribute("aria-label", "メッセージを閉じる");
  closeButton.title = "閉じる";
  closeButton.innerHTML = "<span aria-hidden=\"true\">×</span>";
  closeButton.addEventListener("click", () => closeCourseMessageOverlay(doc));

  header.appendChild(title);
  header.appendChild(closeButton);

  const frame = doc.createElement("iframe");
  frame.id = UX_COURSE_MESSAGE_FRAME_ID;
  frame.className = "ux-course-message-frame";
  frame.title = "ホームのメッセージ";
  frame.setAttribute("loading", "eager");
  frame.addEventListener("load", () => {
    frame.removeAttribute("aria-busy");
    observeCourseMessageFrame(frame);
  });

  dialog.appendChild(header);
  dialog.appendChild(frame);
  overlay.appendChild(dialog);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeCourseMessageOverlay(doc);
  });
  doc.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || overlay.hidden) return;
      event.preventDefault();
      closeCourseMessageOverlay(doc);
    },
    true,
  );

  (doc.body || doc.documentElement).appendChild(overlay);
  return { overlay, frame, closeButton };
}

function openCourseMessageOverlay(doc = document) {
  const { overlay, frame, closeButton } = ensureCourseMessageOverlay(doc);
  if (!overlay || !frame) return false;

  if (overlay.hidden) {
    overlay[UX_COURSE_MESSAGE_PREVIOUS_FOCUS_PROPERTY] = doc.activeElement;
  }

  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
  doc.documentElement.classList.add("ux-course-message-open");
  doc.body?.classList.add("ux-course-message-open");

  const frameUrl = getCourseMessageFrameUrl(doc);
  if (frameUrl && frame.getAttribute("src") !== frameUrl) {
    frame.setAttribute("aria-busy", "true");
    frame.src = frameUrl;
  }

  closeButton?.focus({ preventScroll: true });
  return true;
}

function bindCourseHeaderMessageButton(link, doc = document) {
  if (!link || link[UX_COURSE_MESSAGE_LINK_HANDLER_PROPERTY]) return;

  const handler = (event) => {
    if (typeof openCourseMessageOverlay !== "function") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openCourseMessageOverlay(doc);
  };
  link.addEventListener("click", handler, true);
  link[UX_COURSE_MESSAGE_LINK_HANDLER_PROPERTY] = handler;
}

function unbindCourseHeaderMessageButtons(doc = document) {
  doc
    .querySelectorAll("a.ux-course-header-mailbox")
    .forEach((link) => {
      const handler = link[UX_COURSE_MESSAGE_LINK_HANDLER_PROPERTY];
      if (handler) link.removeEventListener("click", handler, true);
      link[UX_COURSE_MESSAGE_LINK_HANDLER_PROPERTY] = null;
    });
  closeCourseMessageOverlay(doc);
}
