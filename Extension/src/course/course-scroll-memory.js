// Course-page scroll position persistence across WebClass content transitions.

const COURSE_SCROLL_SESSION_KEY_PREFIX = "uxCourseScrollPosition";

function getCourseScrollLegacySessionKey(locationHref = window.location.href) {
  const url = new URL(locationHref, window.location.href);
  url.hash = "";
  return `${COURSE_SCROLL_SESSION_KEY_PREFIX}:${url.href}`;
}

function getCourseScrollStableSessionKey(locationHref = window.location.href) {
  const url = new URL(locationHref, window.location.href);
  const pathMatch = url.pathname.match(/\/course\.php\/([^/?#]+)/i);
  const courseId = (
    pathMatch?.[1] ||
    url.searchParams.get("course_id") ||
    url.searchParams.get("course") ||
    url.searchParams.get("id") ||
    ""
  ).trim();

  if (!courseId) return getCourseScrollLegacySessionKey(url.href);

  return `${COURSE_SCROLL_SESSION_KEY_PREFIX}:${url.origin}:course:${encodeURIComponent(courseId)}`;
}

function saveCourseScrollPosition() {
  try {
    sessionStorage.setItem(
      getCourseScrollStableSessionKey(),
      String(Math.max(0, Math.round(window.scrollY || 0))),
    );
  } catch {
    // Storage may be unavailable when the page is being discarded.
  }
}

function bindCourseScrollPositionMemory() {
  if (document.body?.dataset.uxCourseScrollMemoryBound === "1") return;
  document.body.dataset.uxCourseScrollMemoryBound = "1";

  let scrollSaveTimer = 0;
  let lastObservedScrollY = Math.max(0, Math.round(window.scrollY || 0));
  const scheduleScrollPositionSave = () => {
    window.clearTimeout(scrollSaveTimer);
    scrollSaveTimer = window.setTimeout(saveCourseScrollPosition, 80);
  };
  const saveChangedScrollPosition = () => {
    const currentScrollY = Math.max(0, Math.round(window.scrollY || 0));
    if (currentScrollY === lastObservedScrollY) return;
    lastObservedScrollY = currentScrollY;
    saveCourseScrollPosition();
  };
  const scrollFallbackTimer = window.setInterval(
    saveChangedScrollPosition,
    250,
  );
  const saveBeforePageHide = () => {
    window.clearInterval(scrollFallbackTimer);
    saveCourseScrollPosition();
  };

  // Capture before WebClass's own handlers submit forms or replace the page.
  document.addEventListener("click", saveCourseScrollPosition, true);
  document.addEventListener("submit", saveCourseScrollPosition, true);
  window.addEventListener("scroll", scheduleScrollPositionSave, {
    passive: true,
  });
  window.addEventListener("pagehide", saveBeforePageHide, {
    capture: true,
  });
}

function readCourseScrollPosition() {
  try {
    const stableKey = getCourseScrollStableSessionKey();
    const legacyKey = getCourseScrollLegacySessionKey();
    const stableValue = sessionStorage.getItem(stableKey);
    const rawValue = stableValue ?? sessionStorage.getItem(legacyKey) ?? "0";
    const saved = Number.parseInt(rawValue, 10);

    if (stableValue === null && saved > 0 && stableKey !== legacyKey) {
      sessionStorage.setItem(stableKey, String(saved));
    }

    return Number.isFinite(saved) ? Math.max(0, saved) : 0;
  } catch {
    return 0;
  }
}

function restoreCourseScrollPosition() {
  if (document.body?.dataset.uxCourseScrollRestored === "1") return;
  document.body.dataset.uxCourseScrollRestored = "1";

  const saved = readCourseScrollPosition();
  if (saved <= 0) return;

  const retryDelays = [80, 120, 250, 450, 700, 1000];
  const cancelEvents = ["wheel", "touchstart", "keydown"];
  let attempts = 0;
  let cancelled = false;

  const cleanup = () => {
    cancelEvents.forEach((eventName) => {
      window.removeEventListener(eventName, cancel, true);
    });
  };
  const cancel = () => {
    cancelled = true;
    cleanup();
  };

  cancelEvents.forEach((eventName) => {
    window.addEventListener(eventName, cancel, {
      capture: true,
      passive: true,
    });
  });

  const restore = () => {
    if (cancelled) return;
    const scrollHeight = Math.max(
      document.documentElement?.scrollHeight || 0,
      document.body?.scrollHeight || 0,
    );
    const maxScroll = Math.max(0, scrollHeight - window.innerHeight);
    window.scrollTo({ top: Math.min(saved, maxScroll), behavior: "auto" });

    // WebClass expands the content list and relocates navigation after rendering.
    // Keep applying briefly because late scroll anchoring can occur after full height.
    if (attempts < retryDelays.length) {
      window.setTimeout(restore, retryDelays[attempts]);
      attempts += 1;
    } else {
      cleanup();
    }
  };

  requestAnimationFrame(restore);
}
