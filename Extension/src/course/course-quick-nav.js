// course/course-quick-nav.js
// Responsive state controller for the course quick-navigation ribbon.

const UX_COURSE_QUICK_NAV_NARROW_QUERY = "(max-width: 991px)";
const UX_COURSE_QUICK_NAV_NARROW_MAX_WIDTH = 991;
const UX_COURSE_QUICK_NAV_RESIZE_SETTLE_DELAY_MS = 120;

function resolveUxCourseQuickNavResponsiveState({
  currentNarrow,
  mediaNarrow,
  previousOuterWidth,
  currentOuterWidth,
}) {
  const outerWidthDelta = currentOuterWidth - previousOuterWidth;

  // Browser chrome can change the page viewport width while the window is
  // still moving in the opposite direction (for example, when Chrome hides
  // or restores its vertical tab strip). Keep the responsive state monotonic
  // for the duration of that resize direction so the page never reverses.
  if (outerWidthDelta < 0) {
    return currentNarrow || mediaNarrow;
  }
  if (outerWidthDelta > 0) {
    return currentNarrow && mediaNarrow;
  }
  return currentNarrow;
}

globalThis.createUxCourseQuickNavController = function ({
  root,
  body,
  toggleButton,
  enabledBodyClass,
  collapsedBodyClass,
  responsiveNarrowBodyClass,
  initialDesktopCollapsed,
  onDesktopCollapsedChange,
}) {
  const narrowViewport = window.matchMedia(
    UX_COURSE_QUICK_NAV_NARROW_QUERY,
  );
  const readResponsiveNarrow = () =>
    narrowViewport.matches ||
    window.innerWidth <= UX_COURSE_QUICK_NAV_NARROW_MAX_WIDTH ||
    document.documentElement.clientWidth <=
      UX_COURSE_QUICK_NAV_NARROW_MAX_WIDTH;
  let desktopCollapsed = !!initialDesktopCollapsed;
  let mobileOverlayOpen = false;
  let responsiveNarrow = readResponsiveNarrow();
  let previousOuterWidth = window.outerWidth;
  let responsiveSyncTimer = null;

  const render = () => {
    const isNarrow = responsiveNarrow;
    const isCollapsed = isNarrow ? !mobileOverlayOpen : desktopCollapsed;

    body.classList.toggle(responsiveNarrowBodyClass, isNarrow);
    root.classList.toggle(
      "ux-mobile-overlay-open",
      isNarrow && mobileOverlayOpen,
    );
    root.classList.toggle("ux-collapsed", isCollapsed);
    body.classList.add(enabledBodyClass);
    body.classList.toggle(collapsedBodyClass, isCollapsed);
    body.style.setProperty(
      "--ux-course-quick-nav-width",
      isCollapsed ? "64px" : "280px",
    );

    if (toggleButton) {
      toggleButton.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
      toggleButton.setAttribute(
        "title",
        isCollapsed ? "Open course list" : "Collapse course list",
      );
    }
  };

  const handleToggle = () => {
    if (responsiveNarrow) {
      mobileOverlayOpen = !mobileOverlayOpen;
    } else {
      desktopCollapsed = !desktopCollapsed;
      onDesktopCollapsedChange?.(desktopCollapsed);
    }
    render();
  };

  const setResponsiveNarrow = (nextResponsiveNarrow) => {
    if (nextResponsiveNarrow === responsiveNarrow) return;

    responsiveNarrow = nextResponsiveNarrow;
    mobileOverlayOpen = false;
    render();
  };

  const syncResponsiveNarrow = () => {
    previousOuterWidth = window.outerWidth;
    setResponsiveNarrow(readResponsiveNarrow());
  };

  const scheduleResponsiveSync = () => {
    if (responsiveSyncTimer !== null) {
      window.clearTimeout(responsiveSyncTimer);
    }
    responsiveSyncTimer = window.setTimeout(() => {
      responsiveSyncTimer = null;
      syncResponsiveNarrow();
    }, UX_COURSE_QUICK_NAV_RESIZE_SETTLE_DELAY_MS);
  };

  const handleResize = () => {
    const currentOuterWidth = window.outerWidth;
    const nextResponsiveNarrow = resolveUxCourseQuickNavResponsiveState({
      currentNarrow: responsiveNarrow,
      mediaNarrow: narrowViewport.matches,
      previousOuterWidth,
      currentOuterWidth,
    });
    previousOuterWidth = currentOuterWidth;
    setResponsiveNarrow(nextResponsiveNarrow);
    scheduleResponsiveSync();
  };

  const handleViewportChange = (event) => {
    // A MediaQueryList change can arrive after the last resize event. Apply
    // its authoritative state directly so crossing the breakpoint never
    // requires a page reload.
    previousOuterWidth = window.outerWidth;
    setResponsiveNarrow(event.matches);
  };

  const viewportResizeObserver = new ResizeObserver(scheduleResponsiveSync);

  const handleKeydown = (event) => {
    if (
      event.key !== "Escape" ||
      !responsiveNarrow ||
      !mobileOverlayOpen
    ) {
      return;
    }
    mobileOverlayOpen = false;
    render();
    toggleButton?.focus();
  };

  toggleButton?.addEventListener("click", handleToggle);
  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("resize", handleResize, { passive: true });
  narrowViewport.addEventListener("change", handleViewportChange);
  window.visualViewport?.addEventListener("resize", scheduleResponsiveSync, {
    passive: true,
  });
  viewportResizeObserver.observe(document.documentElement);
  render();

  return {
    setDesktopCollapsed(collapsed) {
      desktopCollapsed = !!collapsed;
      render();
    },
    destroy() {
      toggleButton?.removeEventListener("click", handleToggle);
      document.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("resize", handleResize);
      narrowViewport.removeEventListener("change", handleViewportChange);
      window.visualViewport?.removeEventListener(
        "resize",
        scheduleResponsiveSync,
      );
      viewportResizeObserver.disconnect();
      if (responsiveSyncTimer !== null) {
        window.clearTimeout(responsiveSyncTimer);
      }
      body.classList.remove(responsiveNarrowBodyClass);
    },
  };
};
