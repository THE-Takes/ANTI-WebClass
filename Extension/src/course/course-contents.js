// course/course-contents.js
// Course-list visual refresh, quick navigation, and timeline behavior.

function hideEntireFrame() {
  rememberUxOriginalBodyState(document);
  const style = markUxCourseStyle(document.createElement("style"));
  style.id = "ux-hidden-title-frame-style";
  style.textContent = `
        body, html {
            display: none !important;
            height: 0 !important;
            overflow: hidden !important;
        }
    `;
  document.head.appendChild(style);
  log("Hidden entire frame");
}

/**
 * loadit.phpの「表示に問題があるときは」メッセージフレームを非表示
 */
function hideLoaditMessageFrame() {
  log("Hiding loadit message frame");

  rememberUxOriginalBodyState(document);
  const style = markUxCourseStyle(document.createElement("style"));
  style.id = "ux-loadit-message-style";
  style.textContent = `
        body {
            visibility: hidden !important;
            height: 0 !important;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 0 !important;
        }
    `;
  document.head.appendChild(style);

  // 親のフレームセットの行を0にする
  try {
    if (window.parent && window.parent.document) {
      const parentFrameset =
        window.parent.document.querySelector("frameset[rows]");
      if (parentFrameset) {
        rememberUxOriginalAttributes(parentFrameset);
        const rows = parentFrameset.getAttribute("rows");
        if (rows && rows.includes("40")) {
          parentFrameset.setAttribute("rows", "0,*");
          log("Set parent frameset rows to 0,*");
        }
      }
    }
  } catch (e) {
    log("Could not modify parent frameset:", e.message);
  }
}

/**
 * Course contents page visual refresh (keeps existing layout/UX structure)
 */
function enhanceCourseContentsPageUI() {
  if (!isUxExtensionVisualEnabled()) return;
  if (window.top !== window) return;

  const STYLE_ID = "ux-course-contents-theme-style";
  const BODY_CLASS = "ux-course-contents-theme";
  const QUICK_NAV_ID = "ux-course-quick-nav";
  const QUICK_NAV_ENABLED_CLASS = "ux-course-quick-nav-enabled";
  const QUICK_NAV_COLLAPSED_CLASS = "ux-course-quick-nav-collapsed";
  const QUICK_NAV_RESPONSIVE_NARROW_CLASS =
    "ux-course-quick-nav-responsive-narrow";
  const QUICK_NAV_COLLAPSED_STORAGE_KEY = "webclass_course_quick_nav_collapsed";
  const STORAGE_KEY_CUSTOM_COURSE_NAMES = "webclass_custom_course_names";
  const STORAGE_KEY_SHORT_COURSE_CACHE = "webclass_course_short_name_cache";
  const STORAGE_KEY_COURSE_QUICK_NAV_COLLAPSED = "courseQuickNavCollapsed";
  const COURSE_TIMELINE_TARGET_ID = "ux-course-timeline";
  const COURSE_TIMELINE_PANEL_ID = "ux-course-timeline-panel";
  const COURSE_TIMELINE_HASH = "timeline";
  const COURSE_TIMELINE_VIEW_CLASS = "ux-course-timeline-view";
  const COURSE_TIMELINE_SOURCE_CLASS = "ux-course-timeline-source";
  const COURSE_TIMELINE_NAV_ITEM_CLASS = "ux-course-timeline-nav-item";
  const COURSE_TIMELINE_NAV_LINK_CLASS = "ux-course-timeline-nav-link";

  const normalizeCourseLabelText = (text) => {
    return (text || "")
      .replace(/^ﾂｻ\s*/, "")
      .replace("締切が近い課題があります。", "")
      .replace(/新着メッセージ\(\d+\)/g, "")
      .trim();
  };

  const resolveEditedCustomCourseName = (customName, fullName) => {
    const rawCustomName = (customName || "").trim();
    if (!rawCustomName) return "";
    const normalizedCustomName = normalizeCourseLabelText(rawCustomName);
    if (!normalizedCustomName) return "";
    const normalizedFullName = normalizeCourseLabelText(fullName || "");
    if (normalizedFullName && normalizedCustomName === normalizedFullName) {
      return "";
    }
    return rawCustomName;
  };

  const extractCourseIdFromUrl = (url) => {
    const raw = (url || "").trim();
    if (!raw) return "";
    const match = raw.match(/course\.php\/([^\/?]+)/);
    if (match) return (match[1] || "").trim();
    try {
      const parsed = new URL(raw, window.location.href);
      return (
        parsed.searchParams.get("course_id") ||
        parsed.searchParams.get("course") ||
        parsed.searchParams.get("id") ||
        ""
      ).trim();
    } catch {
      return "";
    }
  };

  const normalizeCourseItemTypeLabel = (text) => {
    return (text || "")
      .replace(/\s+/g, "")
      .replace(/[()（）]/g, "")
      .trim();
  };

  const resolveCourseContentsItemType = (item) => {
    if (!item || typeof item.querySelector !== "function") return "other";

    const categoryLabel = normalizeCourseItemTypeLabel(
      item.querySelector(".cl-contentsList_categoryLabel")?.textContent || "",
    );

    if (categoryLabel.startsWith("試験")) return "shiken";
    if (categoryLabel.startsWith("資料")) return "shiryou";
    return "other";
  };

  const buildShortNameCacheKeys = (courseId, names = []) => {
    const keys = new Set();
    const normalizedId = (courseId || "").trim();

    if (normalizedId) {
      keys.add(`id::${normalizedId}`);
      keys.add(normalizedId);
    }

    names.forEach((name) => {
      const raw = (name || "").trim();
      if (!raw) return;
      const normalized = normalizeCourseLabelText(raw);

      if (normalizedId) {
        keys.add(`${normalizedId}::${raw}`);
        if (normalized && normalized !== raw) {
          keys.add(`${normalizedId}::${normalized}`);
        }
      }

      // home.js stores short course cache entries with name:: prefix
      if (normalized) {
        keys.add(`name::${normalized}`);
      }
      if (raw !== normalized) {
        keys.add(`name::${raw}`);
      }

      keys.add(raw);
      if (normalized && normalized !== raw) {
        keys.add(normalized);
      }
    });

    return Array.from(keys);
  };

  const readShortNameFromCache = (cache, courseId, names = []) => {
    if (!cache || typeof cache !== "object") return "";
    const keys = buildShortNameCacheKeys(courseId, names);
    for (const key of keys) {
      const value = cache[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    const normalizedId = (courseId || "").trim();
    if (normalizedId) {
      const idPrefix = `${normalizedId}::`;
      for (const [key, value] of Object.entries(cache)) {
        if (!key.startsWith(idPrefix)) continue;
        if (typeof value === "string" && value.trim()) {
          return value.trim();
        }
      }
    }

    return "";
  };

  const loadCourseNameCaches = async () => {
    const defaults = {
      [STORAGE_KEY_CUSTOM_COURSE_NAMES]: {},
      [STORAGE_KEY_SHORT_COURSE_CACHE]: {},
    };

    try {
      const data = await new Promise((resolve) => {
        chrome.storage.local.get(defaults, resolve);
      });
      return {
        customNames: data[STORAGE_KEY_CUSTOM_COURSE_NAMES] || {},
        shortCourseCache: data[STORAGE_KEY_SHORT_COURSE_CACHE] || {},
      };
    } catch (error) {
      uxDebugWarn(
        "[WebClass UX] Failed to load course-name cache for quick nav",
        error,
      );
      return {
        customNames: {},
        shortCourseCache: {},
      };
    }
  };

  const getCurrentAcsToken = () => {
    try {
      const current = new URL(window.location.href);
      return (current.searchParams.get("acs_") || "").trim();
    } catch {
      return "";
    }
  };

  const buildCourseLoginUrl = (courseId, acsToken) => {
    const qs = acsToken ? `?acs_=${encodeURIComponent(acsToken)}` : "";
    return `${window.location.origin}/webclass/course.php/${courseId}/login${qs}`;
  };

  const getQuickNavWeekdayIndexFromHeaderText = (text) => {
    const normalized = String(text || "")
      .replace(/\s+/g, "")
      .toLowerCase();
    if (!normalized) return null;

    const japaneseWeekdayPatterns = [
      /^日(?:曜(?:日)?)?$/,
      /^月(?:曜(?:日)?)?$/,
      /^火(?:曜(?:日)?)?$/,
      /^水(?:曜(?:日)?)?$/,
      /^木(?:曜(?:日)?)?$/,
      /^金(?:曜(?:日)?)?$/,
      /^土(?:曜(?:日)?)?$/,
    ];

    for (let i = 0; i < japaneseWeekdayPatterns.length; i++) {
      if (japaneseWeekdayPatterns[i].test(normalized)) return i;
    }

    const englishWeekdayPatterns = [
      /^sun(?:day)?$/,
      /^mon(?:day)?$/,
      /^tue(?:s|sday)?$/,
      /^wed(?:nesday)?$/,
      /^thu(?:rs|rsday)?$/,
      /^fri(?:day)?$/,
      /^sat(?:urday)?$/,
    ];

    for (let i = 0; i < englishWeekdayPatterns.length; i++) {
      if (englishWeekdayPatterns[i].test(normalized)) return i;
    }

    return null;
  };

  const getQuickNavPeriodFromRow = (row) => {
    if (!row) return null;

    const dataOrder = Number(row.dataset?.class_order);
    if (Number.isFinite(dataOrder) && dataOrder > 0) {
      return dataOrder;
    }

    const periodCell = row.querySelector(
      "td.schedule-table-class_order, th.schedule-table-class_order, td, th",
    );
    const match = periodCell?.textContent?.match(/(\d+)/);
    if (!match) return null;

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const getQuickNavSchedulePositionFromLink = (link) => {
    const table = link?.closest?.("table.schedule-table");
    const cell = link?.closest?.("td, th");
    const row = cell?.parentElement;
    if (
      !table ||
      !cell ||
      !row ||
      cell.classList.contains("schedule-table-class_order")
    ) {
      return null;
    }

    const period = getQuickNavPeriodFromRow(row);
    if (!period) return null;

    const headerRows = Array.from(table.tHead?.rows || []);
    const headerCells = Array.from(
      headerRows[headerRows.length - 1]?.cells || [],
    );
    const headerCell = headerCells[cell.cellIndex];
    const weekday = getQuickNavWeekdayIndexFromHeaderText(
      headerCell?.textContent,
    );
    if (weekday === null) return null;

    return { weekday, period };
  };

  const getQuickNavWeekdaySortRank = (weekday) => {
    if (weekday >= 1 && weekday <= 5) return weekday;
    if (weekday === 6) return 6;
    if (weekday === 0) return 7;
    return Number.POSITIVE_INFINITY;
  };

  const getQuickNavPositionSortRank = (position) => {
    if (!position) return Number.POSITIVE_INFINITY;
    const weekdayRank = getQuickNavWeekdaySortRank(position.weekday);
    const period = Number(position.period);
    if (
      !Number.isFinite(weekdayRank) ||
      !Number.isFinite(period) ||
      period <= 0
    ) {
      return Number.POSITIVE_INFINITY;
    }
    if (weekdayRank >= 1 && weekdayRank <= 5 && period >= 1 && period <= 5) {
      return (weekdayRank - 1) * 5 + period;
    }
    return 1000 + weekdayRank * 100 + period;
  };

  const compareQuickNavSchedulePositions = (a, b) => {
    const aRank = getQuickNavPositionSortRank(a);
    const bRank = getQuickNavPositionSortRank(b);
    const aHasRank = Number.isFinite(aRank);
    const bHasRank = Number.isFinite(bRank);
    if (aHasRank && bHasRank) return aRank - bRank;
    if (aHasRank) return -1;
    if (bHasRank) return 1;
    return 0;
  };

  const compareQuickNavCourses = (a, b) => {
    const positionDiff = compareQuickNavSchedulePositions(
      a?.schedulePosition,
      b?.schedulePosition,
    );
    if (positionDiff !== 0) return positionDiff;

    const aName = a?.displayName || a?.fullName || a?.rawFullName || "";
    const bName = b?.displayName || b?.fullName || b?.rawFullName || "";
    const nameDiff = aName.localeCompare(bName, "ja");
    if (nameDiff !== 0) return nameDiff;

    return String(a?.id || "").localeCompare(String(b?.id || ""), "ja");
  };

  const getQuickNavScheduleLabel = (position) => {
    if (!position) return "";
    const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];
    const weekday = Number(position.weekday);
    const period = Number(position.period);
    if (
      !Number.isInteger(weekday) ||
      !weekdayLabels[weekday] ||
      !Number.isFinite(period) ||
      period <= 0
    ) {
      return "";
    }
    return `${weekdayLabels[weekday]}${period}`;
  };

  const collectCourseLinksFromDocument = (
    root,
    { baseUrl = window.location.href, acsToken = "" } = {},
  ) => {
    if (!root || typeof root.querySelectorAll !== "function") return [];

    const buckets = [
      {
        priority: 5,
        links: root.querySelectorAll(
          'table.schedule-table a[href*="course.php"]',
        ),
      },
      {
        priority: 3,
        links: root.querySelectorAll(
          '.navbar-nav.navbar-left .dropdown-menu a[href*="course.php"]',
        ),
      },
      {
        priority: 2,
        links: root.querySelectorAll('ul.dropdown-menu a[href*="course.php"]'),
      },
      {
        priority: 1,
        links: root.querySelectorAll('a[href*="course.php"]'),
      },
    ];

    const byCourseId = new Map();
    buckets.forEach((bucket) => {
      bucket.links.forEach((link) => {
        const href = link.getAttribute("href") || "";
        if (!href || link.classList?.contains("no-link")) return;
        if (link.dataset?.uxCourseQuickNav === "1") return;

        const courseId = extractCourseIdFromUrl(href);
        if (!courseId) return;

        let absoluteUrl = "";
        try {
          absoluteUrl = new URL(href, baseUrl).href;
        } catch {
          return;
        }
        if (!absoluteUrl) return;

        const rawFullName = (
          link.dataset?.originalText ||
          link.textContent ||
          ""
        ).trim();
        const fullName = normalizeCourseLabelText(rawFullName);
        if (!fullName && !rawFullName) return;

        const schedulePosition = getQuickNavSchedulePositionFromLink(link);
        const existing = byCourseId.get(courseId);
        const shouldReplaceExisting =
          !existing ||
          bucket.priority > existing.priority ||
          (bucket.priority === existing.priority &&
            compareQuickNavSchedulePositions(
              schedulePosition,
              existing.schedulePosition,
            ) < 0);

        if (shouldReplaceExisting) {
          byCourseId.set(courseId, {
            id: courseId,
            fullName,
            rawFullName: rawFullName || fullName,
            url: absoluteUrl,
            priority: bucket.priority,
            schedulePosition,
          });
        }
      });
    });

    if (byCourseId.size === 0) return [];

    return Array.from(byCourseId.values()).map((course) => {
      let url = course.url;
      if (
        !url ||
        url.includes("/contents/") ||
        url.includes("do_contents.php")
      ) {
        url = buildCourseLoginUrl(course.id, acsToken);
      }
      return {
        id: course.id,
        fullName: course.fullName,
        rawFullName: course.rawFullName || course.fullName,
        url,
        schedulePosition: course.schedulePosition || null,
      };
    });
  };

  const collectCourseLinksFromCurrentPage = () => {
    const acsToken = getCurrentAcsToken();
    return collectCourseLinksFromDocument(document, {
      baseUrl: window.location.href,
      acsToken,
    });
  };

  const HOME_COURSE_CACHE_TTL_MS = 5 * 60 * 1000;
  let cachedHomeCourseLinks = null;
  let cachedHomeCourseLinksAt = 0;
  let pendingHomeCourseLinksPromise = null;

  const collectCourseLinksFromHomePage = async ({
    forceRefresh = false,
  } = {}) => {
    const now = Date.now();
    if (
      !forceRefresh &&
      Array.isArray(cachedHomeCourseLinks) &&
      cachedHomeCourseLinks.length > 0 &&
      now - cachedHomeCourseLinksAt < HOME_COURSE_CACHE_TTL_MS
    ) {
      return cachedHomeCourseLinks;
    }

    if (!forceRefresh && pendingHomeCourseLinksPromise) {
      return pendingHomeCourseLinksPromise;
    }

    const acsToken = getCurrentAcsToken();
    const homeUrl = acsToken
      ? `${window.location.origin}/webclass/?acs_=${encodeURIComponent(acsToken)}`
      : `${window.location.origin}/webclass/`;

    const task = (async () => {
      try {
        const response = await fetch(homeUrl, {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          uxDebugWarn(
            "[WebClass UX] Home fetch for quick nav failed:",
            response.status,
            response.statusText,
          );
          return [];
        }

        const html = await response.text();
        if (!html || html.length < 100) return [];

        const parsed = new DOMParser().parseFromString(html, "text/html");
        const courses = collectCourseLinksFromDocument(parsed, {
          baseUrl: homeUrl,
          acsToken,
        });
        if (courses.length > 0) {
          cachedHomeCourseLinks = courses;
          cachedHomeCourseLinksAt = Date.now();
        }
        return courses;
      } catch (error) {
        uxDebugWarn(
          "[WebClass UX] Failed to collect courses from home page",
          error,
        );
        return [];
      } finally {
        pendingHomeCourseLinksPromise = null;
      }
    })();

    pendingHomeCourseLinksPromise = task;
    return task;
  };

  const extractCourseShortName = (fullName) => {
    let name = fullName || "";
    name = name.replace(
      /[（(][^）)]*(?:計算|先端|情報|数理|理学|旧数コ|旧物コ|総理)[^）)]*[）)]/g,
      "",
    );
    const match = name.match(/^(.+?)\s*\((?:20\d{2})/);
    if (match) {
      name = match[1].trim();
    }
    if (name.includes("／")) {
      name = name.split("／")[0].trim();
    }
    name = name.replace(/^»\s*/, "");
    return name.trim();
  };

  const resolveQuickNavDisplayName = (course, caches) => {
    const rawFullName = (course.rawFullName || course.fullName || "").trim();
    const fullName = normalizeCourseLabelText(
      rawFullName || course.fullName || "",
    );
    const cacheNameCandidates = Array.from(
      new Set(
        [rawFullName, fullName, course.fullName]
          .map((name) => (name || "").trim())
          .filter(Boolean),
      ),
    );
    const customName = resolveEditedCustomCourseName(
      caches.customNames?.[course.id],
      fullName,
    );
    if (customName) return customName;

    const ruleShortName = readShortNameFromCache(
      caches.shortCourseCache,
      course.id,
      cacheNameCandidates,
    );
    if (ruleShortName) return ruleShortName;

    const autoShortName = extractCourseShortName(fullName);
    if (autoShortName && autoShortName !== fullName) return autoShortName;

    return fullName || rawFullName || course.fullName || course.id;
  };

  let quickNavCollapsedPreference = null;

  const readLegacyQuickNavCollapsedState = () => {
    try {
      const val = localStorage.getItem(QUICK_NAV_COLLAPSED_STORAGE_KEY);
      if (val === null) return false; // default: expanded
      return val === "1";
    } catch {
      return false;
    }
  };

  const readQuickNavCollapsedState = () =>
    typeof quickNavCollapsedPreference === "boolean"
      ? quickNavCollapsedPreference
      : readLegacyQuickNavCollapsedState();

  const loadQuickNavCollapsedPreference = () =>
    new Promise((resolve) => {
      const fallback = readLegacyQuickNavCollapsedState();
      if (typeof chrome === "undefined" || !chrome?.storage?.local?.get) {
        quickNavCollapsedPreference = fallback;
        resolve(fallback);
        return;
      }

      chrome.storage.local.get(
        { [STORAGE_KEY_COURSE_QUICK_NAV_COLLAPSED]: null },
        (items) => {
          const lastError = chrome.runtime?.lastError;
          const storedValue = items?.[STORAGE_KEY_COURSE_QUICK_NAV_COLLAPSED];
          const collapsed =
            !lastError && typeof storedValue === "boolean"
              ? storedValue
              : fallback;
          quickNavCollapsedPreference = collapsed;
          resolve(collapsed);
        },
      );
    });

  const saveQuickNavCollapsedState = (collapsed) => {
    quickNavCollapsedPreference = !!collapsed;
    try {
      localStorage.setItem(
        QUICK_NAV_COLLAPSED_STORAGE_KEY,
        collapsed ? "1" : "0",
      );
    } catch {
      // ignore
    }
    try {
      if (typeof chrome !== "undefined" && chrome?.storage?.local?.set) {
        chrome.storage.local.set({
          [STORAGE_KEY_COURSE_QUICK_NAV_COLLAPSED]: !!collapsed,
        });
      }
    } catch {
      // ignore
    }
  };

  const removeQuickNav = () => {
    const existing = document.getElementById(QUICK_NAV_ID);
    if (existing) {
      existing.__uxQuickNavController?.destroy();
      existing.remove();
    }
    if (document.body) {
      document.body.classList.remove(QUICK_NAV_ENABLED_CLASS);
      document.body.classList.remove(QUICK_NAV_COLLAPSED_CLASS);
      document.body.classList.remove(QUICK_NAV_RESPONSIVE_NARROW_CLASS);
      document.body.style.removeProperty("--ux-course-quick-nav-width");
    }
    requestAnimationFrame(() => {
      document.body?.classList.remove("ux-course-quick-nav-initializing");
    });
  };

  const finishQuickNavInitialRender = () => {
    if (!document.body?.classList.contains("ux-course-quick-nav-initializing")) {
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body?.classList.remove("ux-course-quick-nav-initializing");
      });
    });
  };

  const ensureQuickNavShell = () => {
    if (!document.body) return null;

    let root = document.getElementById(QUICK_NAV_ID);
    if (!root) {
      root = document.createElement("aside");
      root.id = QUICK_NAV_ID;
      root.innerHTML = `
                <div class="ux-course-quick-nav-header">
                    <a class="ux-course-quick-nav-home" href="/webclass/" title="WebClass">
                        <svg class="ux-course-quick-nav-home-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M3 10.75 12 3l9 7.75V21a1 1 0 0 1-1 1h-5.5a1 1 0 0 1-1-1v-5.25h-3V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10.75Z"></path>
                        </svg>
                        <span class="ux-course-quick-nav-home-label">WebClass</span>
                    </a>
                    <div class="ux-course-quick-nav-controls">
                        <button type="button" class="ux-course-quick-nav-toggle" aria-label="Toggle course list" aria-expanded="true">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="3" y1="6" x2="21" y2="6"></line>
                                <line x1="3" y1="12" x2="21" y2="12"></line>
                                <line x1="3" y1="18" x2="21" y2="18"></line>
                            </svg>
                        </button>
                        <span class="ux-course-quick-nav-title">Courses</span>
                    </div>
                </div>
                <div class="ux-course-quick-nav-list-wrap"></div>
            `;
      document.body.appendChild(root);
    }

    const quickNavHomeLink = root.querySelector(".ux-course-quick-nav-home");
    if (quickNavHomeLink) {
      const homeUrl = getCourseHomeUrl(document);
      quickNavHomeLink.href =
        homeUrl || new URL("/webclass/", window.location.origin).href;
    }

    const toggleButton = root.querySelector(".ux-course-quick-nav-toggle");

    if (!root.__uxQuickNavController) {
      root.__uxQuickNavController =
        globalThis.createUxCourseQuickNavController({
          root,
          body: document.body,
          toggleButton,
          enabledBodyClass: QUICK_NAV_ENABLED_CLASS,
          collapsedBodyClass: QUICK_NAV_COLLAPSED_CLASS,
          responsiveNarrowBodyClass: QUICK_NAV_RESPONSIVE_NARROW_CLASS,
          initialDesktopCollapsed: readQuickNavCollapsedState(),
          onDesktopCollapsedChange: saveQuickNavCollapsedState,
        });
    }

    root.__uxQuickNavController.setDesktopCollapsed(
      readQuickNavCollapsedState(),
    );
    root.__setCollapsedState = (collapsed) => {
      root.__uxQuickNavController?.setDesktopCollapsed(collapsed);
    };
    return root;
  };

  const COURSE_ICON_COLORS = [
    "var(--ux-home-accent)",
    "var(--ux-home-warning)",
    "var(--ux-home-success)",
    "var(--ux-home-purple)",
    "var(--ux-home-danger)",
    "var(--ux-home-accent-emphasis)",
    "var(--ux-home-warning)",
    "var(--ux-home-success)",
    "var(--ux-home-accent)",
    "var(--ux-home-purple)",
    "var(--ux-home-danger)",
    "var(--ux-home-success)",
  ];

  const getCourseIconColor = (courseId) => {
    let hash = 0;
    const str = courseId || "";
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return COURSE_ICON_COLORS[Math.abs(hash) % COURSE_ICON_COLORS.length];
  };

  const getCourseInitial = (displayName) => {
    if (!displayName) return "?";
    const first = displayName.charAt(0);
    if (/[A-Za-z0-9]/.test(first)) return first.toUpperCase();
    return first;
  };

  const renderQuickNav = (courses) => {
    const root = ensureQuickNavShell();
    if (!root) return;

    const listWrap = root.querySelector(".ux-course-quick-nav-list-wrap");
    if (!listWrap) return;

    listWrap.textContent = "";
    if (!Array.isArray(courses) || courses.length === 0) {
      removeQuickNav();
      return;
    }

    const currentCourseId = extractCourseIdFromUrl(window.location.href);
    const list = document.createElement("ul");
    list.className = "ux-course-quick-nav-list";

    courses.forEach((course) => {
      const li = document.createElement("li");
      li.className = "ux-course-quick-nav-item";

      const link = document.createElement("a");
      link.className = "ux-course-quick-nav-link";
      if (course.id && currentCourseId && course.id === currentCourseId) {
        link.classList.add("is-active");
      }
      link.href = course.url;
      const scheduleLabel = getQuickNavScheduleLabel(course.schedulePosition);
      link.title = scheduleLabel
        ? `${course.displayName} (${scheduleLabel})`
        : course.displayName;
      link.dataset.uxCourseQuickNav = "1";

      const iconColor = getCourseIconColor(course.id);
      const initial = getCourseInitial(course.displayName);

      const icon = document.createElement("span");
      icon.className = "ux-course-quick-nav-icon";
      icon.textContent = initial;
      icon.style.backgroundColor = iconColor;

      const nameSpan = document.createElement("span");
      nameSpan.className = "ux-course-quick-nav-name";
      nameSpan.textContent = course.displayName;

      link.appendChild(icon);
      link.appendChild(nameSpan);
      if (scheduleLabel) {
        const scheduleSpan = document.createElement("span");
        scheduleSpan.className = "ux-course-quick-nav-schedule";
        scheduleSpan.textContent = scheduleLabel;
        link.appendChild(scheduleSpan);
      }
      li.appendChild(link);
      list.appendChild(li);
    });

    listWrap.appendChild(list);
    finishQuickNavInitialRender();
  };

  const updateCourseFooter = () => {
    document.querySelectorAll(".ft-footer_message").forEach((message) => {
      message.textContent = "Powered by WebClass  ANTIed by ANTI-WebClass";
    });
    alignCourseFooterWithTopButton();
  };

  const alignCourseFooterWithTopButton = () => {
    if (
      document.body?.classList.contains(QUICK_NAV_RESPONSIVE_NARROW_CLASS)
    ) {
      document.querySelectorAll(".ft-footer_message").forEach((message) => {
        message.style.removeProperty("transform");
      });
      return;
    }

    const topButton = Array.from(
      document.querySelectorAll(
        'button, a, input[type="button"], input[type="submit"]',
      ),
    ).find((element) => {
      const label =
        element instanceof HTMLInputElement
          ? element.value.trim()
          : element.textContent?.trim();
      if (label !== "Top") return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    document.querySelectorAll(".ft-footer_message").forEach((message) => {
      if (!topButton) {
        message.style.removeProperty("transform");
        return;
      }
      const topButtonRect = topButton.getBoundingClientRect();
      const messageRect = message.getBoundingClientRect();
      const offset =
        topButtonRect.left + topButtonRect.width / 2 -
        (messageRect.left + messageRect.width / 2);
      message.style.transform = `translateX(${Math.round(offset)}px)`;
    });
  };

  const bindCourseFooterAlignment = () => {
    if (document.body?.dataset.uxCourseFooterAlignmentBound === "1") return;
    document.body.dataset.uxCourseFooterAlignmentBound = "1";
    let frameId = 0;
    const scheduleAlignment = () => {
      if (frameId) return;
      frameId = requestAnimationFrame(() => {
        frameId = 0;
        alignCourseFooterWithTopButton();
      });
    };
    window.addEventListener("resize", scheduleAlignment, { passive: true });
    requestAnimationFrame(scheduleAlignment);
    window.setTimeout(scheduleAlignment, 300);
  };

  const refreshQuickNav = async () => {
    await loadQuickNavCollapsedPreference();
    let courseLinks = await collectCourseLinksFromHomePage();
    if (!Array.isArray(courseLinks) || courseLinks.length === 0) {
      courseLinks = collectCourseLinksFromCurrentPage();
    }
    if (courseLinks.length === 0) {
      removeQuickNav();
      return;
    }

    const caches = await loadCourseNameCaches();
    const courses = courseLinks
      .map((course) => ({
        ...course,
        displayName: resolveQuickNavDisplayName(course, caches),
      }))
      .sort(compareQuickNavCourses);
    renderQuickNav(courses);
  };

  let quickNavWarmupScheduled = false;
  const scheduleQuickNavWarmupRefresh = () => {
    if (quickNavWarmupScheduled) return;
    quickNavWarmupScheduled = true;
    [350, 1100, 2200].forEach((delay) => {
      window.setTimeout(() => {
        void refreshQuickNav();
      }, delay);
    });
  };

  let quickNavStorageListenerBound = false;
  const bindQuickNavStorageRefresh = () => {
    if (quickNavStorageListenerBound) return;
    if (!chrome?.storage?.onChanged?.addListener) return;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes) return;
      if (changes[STORAGE_KEY_COURSE_QUICK_NAV_COLLAPSED]) {
        quickNavCollapsedPreference =
          changes[STORAGE_KEY_COURSE_QUICK_NAV_COLLAPSED].newValue === true;
        const root = document.getElementById(QUICK_NAV_ID);
        if (typeof root?.__setCollapsedState === "function") {
          root.__setCollapsedState(quickNavCollapsedPreference);
        }
      }
      if (
        changes[STORAGE_KEY_CUSTOM_COURSE_NAMES] ||
        changes[STORAGE_KEY_SHORT_COURSE_CACHE]
      ) {
        void refreshQuickNav();
      }
    });
    quickNavStorageListenerBound = true;
  };

  const injectStyle = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
            body.${BODY_CLASS} {
                background-color: var(--ux-color-page, #EBF6FF);
                color: var(--ux-color-text, #1F2326);
                font-family: var(--ux-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
                --ux-home-page-bg: var(--ux-color-page, #EBF6FF);
                --ux-home-surface: var(--ux-color-surface, #FFFFFF);
                --ux-home-surface-muted: var(--ux-color-surface-muted, #EEF5F9);
                --ux-home-surface-soft: var(--ux-color-surface-subtle, #F5FAFF);
                --ux-home-fill: var(--ux-color-surface-muted, #EEF5F9);
                --ux-home-fill-strong: var(--ux-color-border-strong, #BFD4E1);
                --ux-home-label: var(--ux-color-text, #1F2326);
                --ux-home-secondary-label: var(--ux-color-muted, #6F767A);
                --ux-home-tertiary-label: var(--ux-color-muted, #6F767A);
                --ux-home-quaternary-label: var(--ux-color-muted, #6F767A);
                --ux-home-separator: var(--ux-color-border, #DCE8F0);
                --ux-home-separator-strong: var(--ux-color-border-strong, #BFD4E1);
                --ux-home-accent: var(--ux-color-accent, #099BFF);
                --ux-home-accent-emphasis: var(--ux-color-accent-hover, #0789E1);
                --ux-home-accent-soft: var(--ux-color-info-surface, #EAF4FF);
                --ux-home-accent-softer: var(--ux-color-surface-subtle, #F5FAFF);
                --ux-home-success: var(--ux-color-success, #18794E);
                --ux-home-warning: var(--ux-color-warning, #9A6500);
                --ux-home-warning-soft: var(--ux-color-warning-surface, #FFF7E5);
                --ux-home-danger: var(--ux-color-danger, #B42318);
                --ux-home-purple: var(--ux-color-accent, #099BFF);
                --ux-course-quick-nav-width: 280px;
                padding-left: 0;
                box-sizing: border-box;
                transition: padding-left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                overflow-x: hidden;
            }

            body.${BODY_CLASS}.ux-course-quick-nav-initializing,
            body.${BODY_CLASS}.ux-course-quick-nav-initializing header,
            body.${BODY_CLASS}.ux-course-quick-nav-initializing #js-main,
            body.${BODY_CLASS}.ux-course-quick-nav-initializing footer,
            body.${BODY_CLASS}.ux-course-quick-nav-initializing #${QUICK_NAV_ID},
            body.${BODY_CLASS}.ux-course-quick-nav-initializing #${QUICK_NAV_ID} * {
                transition: none !important;
                animation: none !important;
            }

            body.${BODY_CLASS}.ux-course-quick-nav-enabled {
                padding-left: var(--ux-course-quick-nav-width);
            }

            body.${BODY_CLASS}.ux-course-quick-nav-enabled header,
            body.${BODY_CLASS}.ux-course-quick-nav-enabled #js-main,
            body.${BODY_CLASS}.ux-course-quick-nav-enabled footer {
                width: 100%;
                transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            }

            body.${BODY_CLASS}.ux-course-quick-nav-enabled footer {
                width: 100vw;
                max-width: 100vw;
                margin-left: calc(-1 * var(--ux-course-quick-nav-width));
                box-sizing: border-box;
            }

            body.${BODY_CLASS} #top-info {
                position: static !important;
                z-index: auto !important;
                width: 100%;
                box-sizing: border-box;
                margin: 0 0 14px;
            }

            body.${BODY_CLASS} #js-main > .container > #top-info {
                display: block;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} {
                position: fixed;
                top: 0;
                left: 0;
                width: 280px;
                height: 100vh;
                display: flex;
                flex-direction: column;
                background-color: var(--ux-color-surface, #FFFFFF);
                border-right: 1px solid var(--ux-color-border, #DCE8F0);
                z-index: 1200;
                overflow: hidden;
                transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID}.ux-collapsed {
                width: 64px;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-header {
                display: flex;
                flex-direction: column;
                align-items: stretch;
                gap: 4px;
                padding: 8px 12px;
                border-bottom: 1px solid #dbe4ef;
                flex-shrink: 0;
                background: var(--ux-home-surface);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-home,
            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-controls {
                display: flex;
                align-items: center;
                gap: 14px;
                min-height: 40px;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-home {
                border-radius: 0 24px 24px 0;
                margin-right: 8px;
                padding: 6px 20px 6px 4px;
                color: #334155;
                text-decoration: none;
                font-size: 13px;
                font-weight: 700;
                transition: background-color 0.2s ease, color 0.2s ease;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-home:hover {
                background: #edf3ff;
                color: #1d4ed8;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-home-icon {
                display: inline-flex;
                width: 32px;
                height: 32px;
                min-width: 32px;
                padding: 6px;
                border-radius: 50%;
                color: #ffffff;
                background: #334155;
                box-sizing: border-box;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-home-label {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-title {
                font-size: 15px;
                font-weight: 700;
                color: #1e3a8a;
                letter-spacing: 0.01em;
                text-transform: none;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-toggle {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 40px;
                height: 40px;
                min-width: 40px;
                border: 1px solid var(--ux-color-border, #DCE8F0);
                border-radius: 50%;
                background-color: var(--ux-color-surface, #FFFFFF);
                color: var(--ux-color-text, #1F2326);
                cursor: pointer;
                transition: background-color 0.15s ease, border-color 0.15s ease;
                padding: 0;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-toggle:hover {
                background: var(--ux-color-surface);
                border-color: var(--ux-color-border-hover, #B1BEC6);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} :where(a, button):focus-visible,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li > a:focus-visible {
                outline: var(--ux-focus-width, 2px) solid var(--ux-focus-color, var(--ux-color-accent, #099BFF));
                outline-offset: var(--ux-focus-offset, 2px);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-toggle svg {
                display: block;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap {
                flex: 1;
                overflow-y: auto;
                padding: 8px 0;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list {
                margin: 0;
                padding: 0;
                list-style: none;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-item {
                margin: 0;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-item + .ux-course-quick-nav-item {
                margin-top: 0;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link {
                display: flex;
                align-items: center;
                gap: 14px;
                border-radius: 0 24px 24px 0;
                border: none;
                padding: 8px 20px 8px 16px;
                font-size: 13px;
                font-weight: 600;
                line-height: 1.35;
                color: var(--ux-color-text, #1F2326);
                background-color: var(--ux-color-surface, #FFFFFF);
                text-decoration: none;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                transition: background-color 0.2s ease, color 0.2s ease;
                margin-right: 8px;
                min-height: 44px;
                min-width: 0;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link:hover {
                background: #edf3ff;
                color: #1d4ed8;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link.is-active {
                background: #dbeafe;
                color: #1e40af;
                font-weight: 700;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-icon {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                min-width: 32px;
                border-radius: 50%;
                color: #ffffff;
                font-size: 15px;
                font-weight: 600;
                line-height: 1;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-name {
                flex: 1 1 auto;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-schedule {
                flex: 0 0 auto;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 32px;
                height: 22px;
                padding: 0 7px;
                border-radius: 999px;
                background: #e2e8f0;
                color: #475569;
                font-size: 12px;
                font-weight: 700;
                line-height: 1;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap::-webkit-scrollbar {
                width: 4px;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap::-webkit-scrollbar-track {
                background: var(--ux-color-surface-subtle, #F5FAFF);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap::-webkit-scrollbar-thumb {
                background: #c7d2fe;
                border-radius: 4px;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap::-webkit-scrollbar-thumb:hover {
                background: #93c5fd;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID}.ux-collapsed .ux-course-quick-nav-title,
            body.${BODY_CLASS} #${QUICK_NAV_ID}.ux-collapsed .ux-course-quick-nav-home-label,
            body.${BODY_CLASS} #${QUICK_NAV_ID}.ux-collapsed .ux-course-quick-nav-list-wrap {
                display: none;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID}.ux-collapsed .ux-course-quick-nav-header {
                align-items: center;
                padding: 8px 12px;
                border-bottom: 0;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID}.ux-collapsed .ux-course-quick-nav-home {
                justify-content: center;
                width: 40px;
                margin-right: 0;
                padding: 4px;
                border-radius: 50%;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID}.ux-collapsed .ux-course-quick-nav-controls {
                justify-content: center;
                width: 40px;
                min-height: 40px;
            }

            body.${BODY_CLASS} header .container,
            body.${BODY_CLASS} #js-main > .container,
            body.${BODY_CLASS} footer .container {
                width: auto;
                max-width: 1320px;
            }

            body.${BODY_CLASS} header {
                border-bottom: 0 !important;
            }

            body.${BODY_CLASS} .navbar.navbar-default {
                position: relative;
                z-index: 2000;
                min-height: 0 !important;
                margin-bottom: 0;
                border-width: 0;
                border-color: var(--ux-color-border, #DCE8F0);
                background-color: var(--ux-color-surface, #FFFFFF);
            }

            body.${BODY_CLASS} .ux-course-section-nav {
                position: -webkit-sticky;
                position: sticky;
                top: 0;
                z-index: 1100;
                margin: 0 0 14px;
                border-bottom: 1px solid var(--ux-color-border, #DCE8F0);
                background-color: var(--ux-color-surface, #FFFFFF);
            }

            body.${BODY_CLASS} .navbar.navbar-default > .container {
                min-height: 0 !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-header {
                min-height: 0 !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-collapse {
                min-height: 0 !important;
                padding-top: 0;
                padding-bottom: 0;
            }

            body.${BODY_CLASS} .navbar-default .ux-course-empty-menu-shell,
            body.${BODY_CLASS} .navbar-default .navbar-collapse.ux-course-empty-menu {
                display: none !important;
                height: 0 !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                border: 0 !important;
                overflow: hidden !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-brand {
                height: auto !important;
                min-height: 0 !important;
                padding-top: 13px;
                padding-bottom: 13px;
                line-height: 34px;
            }

            body.${BODY_CLASS} .navbar-default .navbar-brand .course-webclass {
                display: none !important;
            }

            body.${BODY_CLASS} .ux-course-list-button-hidden {
                display: none !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right {
                display: flex !important;
                align-items: center;
                justify-content: flex-end;
                flex-wrap: nowrap;
                gap: 8px;
                min-height: 60px;
                margin-top: 0;
                margin-bottom: 0;
                padding: 8px 0;
                white-space: nowrap;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right.ux-course-header-actions {
                min-height: 60px;
                padding-top: 8px;
                padding-bottom: 8px;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a {
                padding-top: 0;
                padding-bottom: 0;
                line-height: 1;
            }

            body.${BODY_CLASS} .ux-course-section-nav-inner {
                width: auto;
                max-width: 1320px;
                margin: 0 auto;
                padding: 0 15px;
            }

            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav.navbar-left {
                float: none !important;
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 4px;
                margin: 0;
                min-height: 48px;
            }

            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li {
                float: none !important;
            }

            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li > a {
                display: flex;
                align-items: center;
                padding: 7px 14px !important;
                line-height: 20px !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-brand .course-webclass,
            body.${BODY_CLASS} .navbar-default .navbar-brand .course-name {
                color: #1e3a8a;
                transition: color 0.2s ease;
            }

            body.${BODY_CLASS} .navbar-default .navbar-brand .course-webclass:hover,
            body.${BODY_CLASS} .navbar-default .navbar-brand .course-name:hover {
                color: #2563eb;
            }

            /* Keep header utilities compact while preserving their accessible labels. */
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-account > span,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.dropdown-toggle[title="アカウントメニュー"] > span,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.dropdown-toggle[title*="Account"] > span {
                display: none !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li.ux-course-header-action-item {
                float: none !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                margin: 0 !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-language,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-logout,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-account,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > #notification-dropdown-area > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a[title="アカウントメニュー"],
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a[title*="Account"] {
                position: relative;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 40px !important;
                height: 40px !important;
                min-width: 40px !important;
                min-height: 40px !important;
                padding: 0 !important;
                border: 1px solid transparent !important;
                border-radius: var(--ux-radius-pill, 999px) !important;
                background-color: transparent !important;
                color: var(--ux-color-text, #1F2326);
                font-size: 0;
                line-height: 1 !important;
                box-sizing: border-box !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-language,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-logout {
                width: 40px !important;
                min-width: 40px !important;
                font-size: 0 !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-language > *,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-logout > * {
                display: none !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox > i,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox > img,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox > svg,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox > span:not(.ux-course-header-icon):not(.badge) {
                display: none !important;
            }

            /* The native badge is replaced by the shared extension count. */
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox > #js-unread-message-count,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox > #mobile-menu-message-badge,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox > .hd-notification_badge,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox > .hd-mobileMenu_messageBadge {
                display: none !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox > .ux-course-header-icon,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-language > .ux-course-header-icon,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-logout > .ux-course-header-icon {
                display: inline-flex !important;
                align-items: center;
                justify-content: center;
                width: 19px;
                height: 19px;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox img,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox svg,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-language img,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-language svg,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-logout svg {
                width: 19px !important;
                height: 19px !important;
                object-fit: contain;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox > .ux-course-header-message-badge {
                position: absolute;
                top: 1px;
                right: -3px;
                display: inline-flex !important;
                align-items: center;
                justify-content: center;
                width: 20px;
                min-width: 20px;
                height: 20px;
                padding: 0;
                border: 2px solid var(--ux-home-header-surface, #FFFFFF);
                border-radius: 50%;
                box-sizing: border-box;
                background-color: var(--ux-home-danger, #B42318);
                color: #FFFFFF;
                font-size: 0.62rem;
                font-weight: 700;
                line-height: 1;
                z-index: 1;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox > .ux-course-header-message-badge[hidden] {
                display: none !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-account > img,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.dropdown-toggle[title="アカウントメニュー"] > img,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.dropdown-toggle[title*="Account"] > img {
                width: 30px !important;
                height: 30px !important;
                border: 2px solid #ffffff !important;
                border-radius: 50% !important;
                box-sizing: border-box !important;
                object-fit: cover;
                outline: 1px solid var(--ux-color-border-strong, #BFD4E1);
                outline-offset: 2px;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-language:hover {
                color: var(--ux-color-accent-active, #0677C7);
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-logout:hover {
                color: var(--ux-color-danger, #B42318);
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-mailbox:focus-visible,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-language:focus-visible,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-logout:focus-visible,
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a.ux-course-header-account:focus-visible {
                outline: var(--ux-focus-width, 2px) solid var(--ux-focus-color, var(--ux-color-accent, #099BFF));
                outline-offset: var(--ux-focus-offset, 2px);
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav > li > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li > a {
                border-radius: 8px;
                transition: background-color 0.2s ease, color 0.2s ease;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav > li > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav > .active > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav > .active > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav > .active > a:focus,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > .active > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > .active > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > .active > a:focus {
                background-color: #edf3ff;
                color: #2563eb;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav > li.open > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav > li.open > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav > li.open > a:focus,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li.open > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li.open > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li.open > a:focus {
                background-color: #edf3ff;
                color: #2563eb;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav > li.dropdown.open,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li.dropdown.open {
                position: relative;
                z-index: 2001;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu {
                z-index: 2002;
                margin-top: 6px;
                padding: 4px;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                background: var(--ux-color-surface);
                min-width: 210px;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > li > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > li > a {
                display: block;
                border-radius: 6px;
                padding: 6px 10px;
                font-size: 12px;
                color: #334155;
                text-decoration: none;
                white-space: nowrap;
                transition: background-color 0.2s ease, color 0.2s ease;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > li > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > li > a:focus,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > li > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > li > a:focus {
                background: #e8f2ff;
                color: #334155;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > .active > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > .active > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > .active > a:focus,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > .active > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > .active > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > .active > a:focus {
                background: #dbeafe;
                color: #1e3a8a;
                font-weight: 600;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu .divider,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu .divider {
                margin: 4px 0;
                background: #e2e8f0;
            }

            /* Exception: enlarge left-header dropdown (course menu) text */
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-left > li.dropdown > .dropdown-menu > li > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav.navbar-left > li.dropdown > .dropdown-menu > li > a {
                font-size: 14px !important;
                line-height: 1.4;
                padding-top: 8px;
                padding-bottom: 8px;
            }

            body.${BODY_CLASS} #js-main > .container {
                margin-top: 14px;
                margin-bottom: 20px;
            }

            @media (min-width: 1200px) {
                body.${BODY_CLASS} .cm-contentsList .col-xs-12.col-sm-8.col-md-9.col-lg-10 {
                    width: calc(100% - clamp(220px, 23%, 300px)) !important;
                }

                body.${BODY_CLASS} .cm-contentsList .col-sm-4.col-md-3.col-lg-2.cm-sideNav_container {
                    width: clamp(220px, 23%, 300px) !important;
                }
            }

            body.${BODY_CLASS} #js-contents .page-header {
                margin-top: 0;
                border-bottom: 1px solid #dbe4ef;
                color: #334155;
                font-weight: 700;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder {
                margin-bottom: 14px;
                border: 1px solid #dbe4ef;
                border-radius: 14px;
                overflow: hidden;
                background: var(--ux-color-surface);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder .panel-heading {
                background: var(--ux-home-surface-muted);
                border-bottom: 1px solid #dbe4ef;
                padding-top: 12px;
                padding-bottom: 12px;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder .panel-title {
                color: #1e3a8a;
                font-weight: 700;
                letter-spacing: 0.01em;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem {
                --ux-content-item-hover-bg: #f8fbff;
                --ux-content-label-bg: #f1f5f9;
                --ux-content-label-color: #475569;
                --ux-content-label-border: #dbe4ef;
                --ux-content-action-bg: var(--ux-color-surface);
                --ux-content-action-border: #d1d5db;
                --ux-content-action-color: #6b7280;
                --ux-content-action-hover-bg: var(--ux-color-surface);
                --ux-content-action-hover-border: #c5cad3;
                --ux-content-action-hover-color: #6b7280;
                border-right: 0;
                border-color: #edf2f8;
                border-left: 4px solid var(--ux-color-border, #DCE8F0);
                padding: 14px 16px;
                transition: background-color 0.2s ease, border-color 0.2s ease;
                background: var(--ux-color-surface);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem:hover {
                background: var(--ux-content-item-hover-bg);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_content {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 14px;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentInfo {
                display: grid;
                grid-template-columns: minmax(0, max-content) max-content minmax(0, 1fr);
                align-items: center;
                column-gap: 8px;
                row-gap: 5px;
                min-width: 0;
                flex: 1;
            }

            body.${BODY_CLASS} .cm-contentsList .cm-contentsList_contentName {
                display: flex;
                align-items: center;
                gap: 8px;
                min-width: 0;
                overflow: hidden;
                margin-top: 0;
                margin-bottom: 0;
                line-height: 1.45;
            }

            body.${BODY_CLASS} .cm-contentsList .cm-contentsList_contentName a {
                display: block;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                color: #1f2937;
                text-decoration: none;
                transition: color 0.2s ease;
            }

            body.${BODY_CLASS} .cm-contentsList .cm-contentsList_contentName a:hover {
                color: #1f2937;
            }

            /* Gray-out items without a valid link. */
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-contents-disabled .cl-contentsList_contentInfo {
                opacity: 0.5;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-contents-disabled .cm-contentsList_contentName {
                color: #9ca3af;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-contents-disabled .cl-contentsList_contentDetailListItemData a[href*="history"] {
                opacity: 0.5;
                color: #9ca3af;
                border-color: #d1d5db;
                background: var(--ux-color-surface);
                font-weight: 400;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-contents-disabled:hover {
                background: var(--ux-color-surface);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_new {
                display: inline-flex;
                flex: 0 0 auto;
                width: max-content;
                margin: 0;
                padding: 1px 8px;
                border-radius: 999px;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.02em;
                background: #ef4444;
                color: #ffffff;
                vertical-align: middle;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_categoryLabel {
                display: inline-flex;
                flex: 0 0 auto;
                justify-self: start;
                align-items: center;
                border-radius: 999px;
                padding: 2px 10px;
                border: 1px solid var(--ux-content-label-border);
                background: var(--ux-content-label-bg);
                color: var(--ux-content-label-color);
                font-size: 12px;
                font-weight: 600;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentInfo > .cm-contentsList_contentDetailListItem {
                grid-column: 1 / -1;
                grid-row: 2;
                min-width: 0;
                overflow: hidden;
                color: var(--ux-home-secondary-label, #64748b);
                font-size: 12px;
                line-height: 1.4;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentInfo > .cm-contentsList_contentDetailListItem > * {
                white-space: inherit;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailList {
                display: flex;
                flex-wrap: nowrap;
                gap: 8px;
                justify-content: flex-end;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetail {
                flex: 0 0 auto;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailList:has(a[href*="history"]) {
                flex-direction: row-reverse;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItem {
                margin: 0;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-height: 34px;
                padding: 0 12px;
                border: 1px solid var(--ux-content-action-border);
                border-radius: 8px;
                background: var(--ux-content-action-bg);
                color: var(--ux-content-action-color);
                text-decoration: none;
                font-weight: 600;
                transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a:hover {
                background: var(--ux-content-action-hover-bg);
                border-color: var(--ux-content-action-hover-border);
                color: var(--ux-content-action-hover-color);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="/contents/"],
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="history"],
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="/contents/"]:hover,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="history"]:hover {
                background: var(--ux-color-surface);
                border-color: #d1d5db;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="/contents/"]:not([href*="/history"]) {
                width: 34px;
                padding: 0;
                font-size: 0;
                font-weight: 400;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="/contents/"]:not([href*="/history"])::before {
                content: "...";
                font-size: 18px;
                font-weight: 400;
                line-height: 0;
                letter-spacing: 1px;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiryou {
                --ux-content-item-hover-bg: #f4f8ff;
                --ux-content-label-bg: #eaf2ff;
                --ux-content-label-color: #1f2937;
                --ux-content-label-border: #bfdbfe;
                --ux-content-action-bg: #eff6ff;
                --ux-content-action-border: #bfdbfe;
                --ux-content-action-color: #1f2937;
                --ux-content-action-hover-bg: #dbeafe;
                --ux-content-action-hover-border: #93c5fd;
                --ux-content-action-hover-color: #1f2937;
                border-left-color: #60a5fa;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiryou .cm-contentsList_contentName,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiryou .cm-contentsList_contentName a {
                color: #1f2937;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiryou .cm-contentsList_contentName a:hover {
                color: #1f2937;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiken {
                --ux-content-item-hover-bg: #fff8f1;
                --ux-content-label-bg: #fff2e8;
                --ux-content-label-color: #1f2937;
                --ux-content-label-border: #fdba74;
                --ux-content-action-bg: #fff7ed;
                --ux-content-action-border: #fdba74;
                --ux-content-action-color: #1f2937;
                --ux-content-action-hover-bg: #ffedd5;
                --ux-content-action-hover-border: #fb923c;
                --ux-content-action-hover-color: #1f2937;
                border-left-color: #f59e0b;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiken .cm-contentsList_contentName,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiken .cm-contentsList_contentName a {
                color: #1f2937;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiken .cm-contentsList_contentName a:hover {
                color: #1f2937;
            }

            body.${BODY_CLASS} .cm-sideNav_container {
                position: static;
                background-color: var(--ux-color-page, #EBF6FF);
                border: 0;
                border-radius: 0;
                padding-top: 0;
                padding-bottom: 0;
            }

            body.${BODY_CLASS} .ux-course-sideNav-sticky {
                position: -webkit-sticky;
                position: sticky;
                top: 84px;
                max-height: calc(100vh - 104px);
                background: var(--ux-color-surface);
                border: 1px solid #dbe4ef;
                border-radius: 14px;
                padding: 12px;
                z-index: 50;
            }

            body.${BODY_CLASS} .cm-sideNav_folders {
                margin: 0;
                padding: 0;
                max-height: calc(100vh - 132px);
                overflow: auto;
                list-style: none;
            }

            body.${BODY_CLASS} .cm-sideNav_folders > li + li {
                margin-top: 6px;
            }

            body.${BODY_CLASS} .cm-sideNav_folderLink {
                display: block;
                padding: 8px 10px;
                border-radius: 10px;
                border: 1px solid var(--ux-color-border, #DCE8F0);
                text-decoration: none;
                color: #64748b;
                transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
            }

            body.${BODY_CLASS} .cm-sideNav_folderLink:hover {
                background: #edf3ff;
                color: #2563eb;
                border-color: #c7d8ff;
            }

            body.${BODY_CLASS} .timeline-messages {
                display: grid;
                gap: 14px;
                border: 0;
                border-radius: 0;
                background-color: var(--ux-color-page, #EBF6FF);
                padding: 0;
                scroll-margin-top: 86px;
            }

            body.${BODY_CLASS} .ux-course-timeline-panel {
                display: none;
                margin: 0 0 14px;
                padding: 4px 0 18px;
                border: 0;
                background-color: var(--ux-color-page, #EBF6FF);
            }

            body.${BODY_CLASS}.${COURSE_TIMELINE_VIEW_CLASS} .ux-course-timeline-panel:not([hidden]) {
                display: block;
            }

            body.${BODY_CLASS}:not(.${COURSE_TIMELINE_VIEW_CLASS}) #js-contents .cm-contentsList.tab-pane {
                float: none !important;
                width: 100% !important;
            }

            body.${BODY_CLASS}.${COURSE_TIMELINE_VIEW_CLASS} #js-contents .tab-content,
            body.${BODY_CLASS}.${COURSE_TIMELINE_VIEW_CLASS} #js-contents .cm-contentsList {
                display: none !important;
            }

            body.${BODY_CLASS} .ux-course-timeline-panel .${COURSE_TIMELINE_SOURCE_CLASS} {
                float: none !important;
                width: 100% !important;
                max-width: none !important;
                padding-left: 0;
                padding-right: 0;
            }

            body.${BODY_CLASS} .ux-course-timeline-panel .${COURSE_TIMELINE_SOURCE_CLASS} > .page-header {
                display: none !important;
            }

            body.${BODY_CLASS}.${COURSE_TIMELINE_VIEW_CLASS} .ux-course-timeline-panel .timeline-messages {
                margin-bottom: 0;
            }

            body.${BODY_CLASS} .ux-course-timeline-panel .timeline-action:has(+ .timeline-messages) {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                min-height: 40px;
                margin: 0 4px 14px;
            }

            body.${BODY_CLASS} .ux-course-timeline-panel .timeline-action:has(+ .timeline-messages) > div {
                width: 100%;
            }

            body.${BODY_CLASS} .ux-course-timeline-panel .timeline-messages ~ .timeline-action {
                margin: 14px 0 0;
                text-align: center;
            }

            body.${BODY_CLASS} .timeline-messages > .timeline-message.list-group-item {
                position: relative;
                margin: 0 !important;
                padding: 18px 20px 14px;
                border: 1px solid var(--ux-color-border, #DCE8F0);
                border-radius: var(--ux-radius-lg, 16px) !important;
                background-color: var(--ux-color-surface, #FFFFFF);
                overflow: visible;
                transition:
                    transform var(--ux-motion-duration-normal, 180ms) var(--ux-motion-ease-standard),
                    border-color var(--ux-motion-duration-fast, 120ms) var(--ux-motion-ease-standard);
            }

            body.${BODY_CLASS} .timeline-messages > .timeline-message.list-group-item:hover {
                transform: translateY(-2px);
                border-color: var(--ux-color-border-strong, #BFD4E1);
            }

            body.${BODY_CLASS} .timeline-message > .timeline-message-head {
                position: absolute;
                top: 12px;
                right: 12px;
                z-index: 1;
            }

            body.${BODY_CLASS} .timeline-message > .timeline-message-head .btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                padding: 0;
                border-color: var(--ux-color-border, #DCE8F0);
                border-radius: 50%;
                background-color: var(--ux-color-surface-subtle, #F5FAFF);
            }

            body.${BODY_CLASS} .timeline-message > :not(.timeline-message-head):not(.timeline-message-foot) {
                padding-right: 40px;
                color: var(--ux-home-label);
                line-height: 1.65;
            }

            body.${BODY_CLASS} .timeline-message > .timeline-message-foot {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin-top: 16px;
                padding-top: 12px;
                border-top: 1px solid var(--ux-color-border, #DCE8F0);
                color: var(--ux-home-tertiary-label);
                font-size: 12px;
            }

            body.${BODY_CLASS} .timeline-messages:focus-visible {
                outline: var(--ux-focus-width, 2px) solid var(--ux-focus-color, var(--ux-color-accent, #099BFF));
                outline-offset: var(--ux-focus-offset, 4px);
            }

            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li.${COURSE_TIMELINE_NAV_ITEM_CLASS} > a:focus-visible {
                outline: var(--ux-focus-width, 2px) solid var(--ux-focus-color, var(--ux-color-accent, #099BFF));
                outline-offset: var(--ux-focus-offset, 2px);
            }

            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li.${COURSE_TIMELINE_NAV_ITEM_CLASS}.ux-timeline-current > a {
                background: #edf3ff;
                color: #2563eb;
            }

            body.${BODY_CLASS} .btn.btn-default {
                border-color: #cbd5e1;
                background: var(--ux-color-surface);
                color: #334155;
            }

            body.${BODY_CLASS} .btn.btn-default:hover {
                border-color: var(--ux-color-border-hover, #B1BEC6);
                background: var(--ux-color-surface);
                color: #334155;
            }

            body.${BODY_CLASS} .btn.btn-primary {
                border-color: #2563eb;
                background: #2563eb;
            }

            body.${BODY_CLASS} .btn.btn-primary:hover,
            body.${BODY_CLASS} .btn.btn-primary:focus {
                border-color: #1d4ed8;
                background: #1d4ed8;
            }

            body.${BODY_CLASS} .ft-footer {
                border-top: 1px solid #e2e8f0;
                background-color: var(--ux-color-page, #EBF6FF);
            }

            body.${BODY_CLASS} .ft-footer .ft-footer_message {
                color: #64748b;
            }

            body.${BODY_CLASS} footer .container {
                text-align: center;
            }

            body.${BODY_CLASS} .ft-footer .ft-footer_message {
                display: inline-block;
                width: 100%;
                text-align: center;
            }

            @media (max-width: 991px) {
                body.${BODY_CLASS} #js-main > .container {
                    padding-left: 12px;
                    padding-right: 12px;
                }

                body.${BODY_CLASS} .cm-sideNav_container {
                    position: static;
                    margin-top: 12px;
                }

                body.${BODY_CLASS} .ux-course-sideNav-sticky {
                    position: static;
                    max-height: none;
                }

                body.${BODY_CLASS} .cm-sideNav_folders {
                    max-height: none;
                }

                body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder {
                    border-radius: 12px;
                }
            }

            body.${BODY_CLASS}.${QUICK_NAV_RESPONSIVE_NARROW_CLASS} #${QUICK_NAV_ID} {
                display: flex !important;
                width: 64px;
                z-index: 2200;
            }

            body.${BODY_CLASS}.${QUICK_NAV_RESPONSIVE_NARROW_CLASS} #${QUICK_NAV_ID}.ux-mobile-overlay-open {
                width: min(280px, calc(100vw - 16px));
            }

            body.${BODY_CLASS}.${QUICK_NAV_RESPONSIVE_NARROW_CLASS}.ux-course-quick-nav-enabled {
                padding-left: 64px;
            }

            body.${BODY_CLASS}.${QUICK_NAV_RESPONSIVE_NARROW_CLASS}.ux-course-quick-nav-enabled footer {
                width: 100vw;
                max-width: 100vw;
                margin-left: -64px;
            }

            body.${BODY_CLASS}.${QUICK_NAV_RESPONSIVE_NARROW_CLASS} #js-main > .container,
            body.${BODY_CLASS}.${QUICK_NAV_RESPONSIVE_NARROW_CLASS} header .container,
            body.${BODY_CLASS}.${QUICK_NAV_RESPONSIVE_NARROW_CLASS} .ux-course-section-nav-inner,
            body.${BODY_CLASS}.${QUICK_NAV_RESPONSIVE_NARROW_CLASS} footer .container {
                margin-left: auto;
                margin-right: auto;
                padding-left: 12px;
            }

            body.${BODY_CLASS}.${QUICK_NAV_RESPONSIVE_NARROW_CLASS} .ux-course-section-nav {
                margin-bottom: 12px;
            }

            body.${BODY_CLASS}.${QUICK_NAV_RESPONSIVE_NARROW_CLASS} .ux-course-section-nav-inner {
                overflow-x: auto;
                padding-right: 12px;
            }

            body.${BODY_CLASS}.${QUICK_NAV_RESPONSIVE_NARROW_CLASS} .ux-course-section-nav .navbar-nav.navbar-left {
                flex-wrap: nowrap;
                min-height: 46px;
                white-space: nowrap;
            }
        `;

    style.textContent += `
            body.${BODY_CLASS} {
                background: var(--ux-home-page-bg);
                color: var(--ux-home-label);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} {
                background: var(--ux-home-surface);
                border-right: 1px solid var(--ux-home-separator);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-header {
                background: var(--ux-home-surface);
                border-bottom: 1px solid var(--ux-home-separator);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-title,
            body.${BODY_CLASS} .navbar-default .navbar-brand .course-webclass,
            body.${BODY_CLASS} .navbar-default .navbar-brand .course-name,
            body.${BODY_CLASS} #js-contents .page-header,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder .panel-title {
                color: var(--ux-home-label);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-home,
            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-toggle,
            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > li > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > li > a,
            body.${BODY_CLASS} .btn.btn-default,
            body.${BODY_CLASS} .cm-sideNav_folderLink,
            body.${BODY_CLASS} .ft-footer .ft-footer_message {
                color: var(--ux-home-secondary-label);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-home:hover,
            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav > li > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav > .active > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav > .active > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav > .active > a:focus,
            body.${BODY_CLASS} .navbar-default .navbar-nav > li.open > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav > li.open > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav > li.open > a:focus,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > li > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > li > a:focus,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > .active > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > .active > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > .active > a:focus,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li.open > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li.open > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav > li.open > a:focus,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > li > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > li > a:focus,
            body.${BODY_CLASS} .cm-sideNav_folderLink:hover {
                background: var(--ux-home-accent-softer);
                color: var(--ux-home-accent-emphasis);
                border-color: var(--ux-home-accent-soft);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-toggle:hover,
            body.${BODY_CLASS} .btn.btn-default:hover {
                background: var(--ux-home-surface);
                border-color: var(--ux-color-border-hover, #B1BEC6);
                color: var(--ux-home-label);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link.is-active,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > .active > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > .active > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > .active > a:focus,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > .active > a,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > .active > a:hover,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu > .active > a:focus {
                background: var(--ux-home-accent-soft);
                color: var(--ux-home-accent-emphasis);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-schedule {
                background: var(--ux-home-fill);
                color: var(--ux-home-secondary-label);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link:hover .ux-course-quick-nav-schedule,
            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link.is-active .ux-course-quick-nav-schedule {
                background: var(--ux-home-accent-soft);
                color: var(--ux-home-accent-emphasis);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-home-icon,
            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-icon {
                color: var(--ux-home-surface);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap::-webkit-scrollbar-thumb {
                background: var(--ux-home-fill-strong);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap::-webkit-scrollbar-thumb:hover {
                background: var(--ux-home-separator-strong);
            }

            body.${BODY_CLASS} .navbar.navbar-default,
            body.${BODY_CLASS} .ux-course-section-nav,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder,
            body.${BODY_CLASS} .ux-course-sideNav-sticky {
                background: var(--ux-home-surface);
                border-color: var(--ux-home-separator);
            }

            body.${BODY_CLASS} .navbar.navbar-default,
            body.${BODY_CLASS} .ux-course-section-nav {
                background-color: var(--ux-home-surface);
                border-color: var(--ux-home-separator);
            }

            body.${BODY_CLASS} .navbar-default .navbar-brand .course-webclass:hover,
            body.${BODY_CLASS} .navbar-default .navbar-brand .course-name:hover {
                color: var(--ux-home-accent-emphasis);
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu .divider,
            body.${BODY_CLASS} .ux-course-section-nav .navbar-nav .dropdown-menu .divider {
                background: var(--ux-home-separator);
            }

            body.${BODY_CLASS} .ft-footer {
                border-color: var(--ux-home-separator);
                background-color: var(--ux-home-page-bg);
            }

            body.${BODY_CLASS} #js-contents .page-header,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder .panel-heading {
                border-bottom: 1px solid var(--ux-home-separator);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder .panel-heading {
                background: var(--ux-home-surface-muted);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem {
                --ux-content-item-hover-bg: var(--ux-home-accent-softer);
                --ux-content-label-bg: var(--ux-home-surface-soft);
                --ux-content-label-color: var(--ux-home-secondary-label);
                --ux-content-label-border: var(--ux-home-separator);
                --ux-content-action-bg: var(--ux-home-surface);
                --ux-content-action-border: var(--ux-home-separator);
                --ux-content-action-color: var(--ux-home-label);
                --ux-content-action-hover-bg: var(--ux-content-action-bg);
                --ux-content-action-hover-border: var(--ux-color-border-hover, #B1BEC6);
                --ux-content-action-hover-color: var(--ux-home-label);
                background: var(--ux-home-surface);
                border-color: var(--ux-home-separator);
            }

            body.${BODY_CLASS} .cm-contentsList .cm-contentsList_contentName a {
                color: var(--ux-home-label);
            }

            body.${BODY_CLASS} .cm-contentsList .cm-contentsList_contentName a:hover {
                color: var(--ux-home-label);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-contents-disabled .cm-contentsList_contentName {
                color: var(--ux-home-quaternary-label);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-contents-disabled .cl-contentsList_contentDetailListItemData a[href*="history"] {
                opacity: 0.5;
                color: var(--ux-home-quaternary-label);
                border-color: var(--ux-home-separator);
                background: var(--ux-home-surface);
                font-weight: 400;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-contents-disabled:hover {
                background: var(--ux-home-surface);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_new {
                background: var(--ux-home-danger);
                color: var(--ux-home-surface);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiryou {
                --ux-content-item-hover-bg: var(--ux-color-info-surface, #EAF4FF);
                --ux-content-label-bg: var(--ux-home-accent-soft);
                --ux-content-label-color: var(--ux-home-label);
                --ux-content-label-border: var(--ux-color-border-strong, #BFD4E1);
                --ux-content-action-bg: var(--ux-color-info-surface, #EAF4FF);
                --ux-content-action-border: var(--ux-color-border-strong, #BFD4E1);
                --ux-content-action-color: var(--ux-home-label);
                --ux-content-action-hover-bg: var(--ux-color-surface-subtle, #F5FAFF);
                --ux-content-action-hover-border: var(--ux-color-accent, #099BFF);
                --ux-content-action-hover-color: var(--ux-home-label);
                border-left-color: var(--ux-home-accent);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiryou .cm-contentsList_contentName,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiryou .cm-contentsList_contentName a,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiryou .cm-contentsList_contentName a:hover {
                color: var(--ux-home-label);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiken {
                --ux-content-item-hover-bg: var(--ux-color-warning-surface, #FFF7E5);
                --ux-content-label-bg: var(--ux-home-warning-soft);
                --ux-content-label-color: var(--ux-home-label);
                --ux-content-label-border: var(--ux-color-border-strong, #BFD4E1);
                --ux-content-action-bg: var(--ux-color-warning-surface, #FFF7E5);
                --ux-content-action-border: var(--ux-color-border-strong, #BFD4E1);
                --ux-content-action-color: var(--ux-home-label);
                --ux-content-action-hover-bg: var(--ux-color-surface-subtle, #F5FAFF);
                --ux-content-action-hover-border: var(--ux-color-warning, #9A6500);
                --ux-content-action-hover-color: var(--ux-home-label);
                border-left-color: var(--ux-home-warning);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiken .cm-contentsList_contentName,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiken .cm-contentsList_contentName a,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-content-type-shiken .cm-contentsList_contentName a:hover {
                color: var(--ux-home-label);
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="/contents/"],
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="history"],
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="/contents/"]:hover,
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a[href*="history"]:hover {
                background: var(--ux-home-surface);
                border-color: var(--ux-home-separator);
            }

            body.${BODY_CLASS} .btn.btn-default {
                background: var(--ux-home-surface);
                border-color: var(--ux-home-separator);
            }

            body.${BODY_CLASS} .btn.btn-primary {
                background: var(--ux-home-accent);
                border-color: var(--ux-home-accent);
                color: var(--ux-home-surface);
            }

            body.${BODY_CLASS} .btn.btn-primary:hover,
            body.${BODY_CLASS} .btn.btn-primary:focus {
                background: var(--ux-home-accent-emphasis);
                border-color: var(--ux-home-accent-emphasis);
            }

            html[data-ux-theme="dark"] body.${BODY_CLASS} :is(
                .navbar-default .navbar-nav .dropdown-menu > li > a,
                #js-contents .page-header,
                .btn.btn-default
            ) {
                color: var(--ux-color-text);
            }

            html[data-ux-theme="dark"] body.${BODY_CLASS} :is(
                .cm-contentsList .cl-contentsList_folder .panel-title,
                .ux-course-section-nav .navbar-nav > li.ux-timeline-current > a
            ) {
                color: var(--ux-color-accent-active);
            }

            html[data-ux-theme="dark"] body.${BODY_CLASS} :is(
                .navbar-default .navbar-nav .dropdown-menu,
                .ux-course-section-nav .navbar-nav .dropdown-menu,
                .cm-contentsList .cl-contentsList_folder,
                .ux-course-sideNav-sticky
            ) {
                border-color: var(--ux-color-border);
                background: var(--ux-color-surface);
            }
        `;


    (document.head || document.documentElement).appendChild(style);
  };

  const ensureSideNavStickyCard = () => {
    const sideNav = document.querySelector(".cm-sideNav_container");
    if (!sideNav) return;

    let stickyCard = sideNav.querySelector(
      ":scope > .ux-course-sideNav-sticky",
    );
    if (!stickyCard) {
      stickyCard = document.createElement("div");
      stickyCard.className = "ux-course-sideNav-sticky";
      while (sideNav.firstChild) {
        stickyCard.appendChild(sideNav.firstChild);
      }
      sideNav.appendChild(stickyCard);
    }

    const syncSideNavHeight = () => {
      const mainColumn = document.querySelector(
        ".cm-contentsList .col-xs-12.col-sm-8.col-md-9.col-lg-10",
      );
      if (!mainColumn || window.matchMedia("(max-width: 991px)").matches) {
        sideNav.style.removeProperty("min-height");
        return;
      }

      const mainHeight = Math.ceil(mainColumn.getBoundingClientRect().height);
      sideNav.style.minHeight = `${Math.max(mainHeight, window.innerHeight)}px`;
    };

    syncSideNavHeight();
    window.setTimeout(syncSideNavHeight, 250);
    window.setTimeout(syncSideNavHeight, 1000);

    if (!sideNav.dataset.uxStickyHeightBound) {
      window.addEventListener("resize", syncSideNavHeight, { passive: true });
      sideNav.dataset.uxStickyHeightBound = "1";
    }
  };

  const normalizeCourseNavText = (text) => {
    return (text || "")
      .replace(/\s+/g, "")
      .replace(/[▼▾▿]/g, "")
      .trim()
      .toLowerCase();
  };

  const getCourseSectionNavList = () => {
    return (
      document.querySelector(
        ".ux-course-section-nav .navbar-nav.navbar-left",
      ) ||
      document.querySelector(
        "header .navbar.navbar-default .navbar-nav.navbar-left, .navbar.navbar-default .navbar-nav.navbar-left",
      )
    );
  };

  const getTimelineMessagesElement = () => {
    return document.querySelector(".timeline-messages");
  };

  const isTimelineHeader = (element) => {
    if (!element) return false;
    return (
      normalizeCourseNavText(element.textContent || "") ===
      normalizeCourseNavText("タイムライン")
    );
  };

  const getCourseTimelineHeader = (scope = document) => {
    return (
      Array.from(
        scope.querySelectorAll(
          "#js-contents .page-header, #js-contents h1, #js-contents h2, #js-contents h3, #js-contents h4",
        ),
      ).find((element) => {
        if (element.closest(`#${COURSE_TIMELINE_PANEL_ID}`)) return false;
        return isTimelineHeader(element);
      }) || null
    );
  };

  const getCourseTimelineSourceColumn = () => {
    const existingSource = document.querySelector(
      `.${COURSE_TIMELINE_SOURCE_CLASS}`,
    );
    if (existingSource) return existingSource;

    const timeline = getTimelineMessagesElement();
    const timelineColumn = timeline?.closest('#js-contents [class*="col-"]');
    if (
      timelineColumn &&
      !timelineColumn.classList.contains("cm-contentsList") &&
      !timelineColumn.classList.contains("cm-sideNav_container")
    ) {
      return timelineColumn;
    }

    const header = getCourseTimelineHeader();
    return (
      header?.closest('#js-contents [class*="col-"]') ||
      header?.parentElement ||
      null
    );
  };

  const getCourseContentsRoot = () => {
    return document.querySelector("#js-contents");
  };

  const prepareTimelineTarget = () => {
    const timeline = getTimelineMessagesElement();
    if (!timeline) return null;

    if (!timeline.id) {
      timeline.id = COURSE_TIMELINE_TARGET_ID;
    }
    if (!timeline.hasAttribute("tabindex")) {
      timeline.tabIndex = -1;
    }
    if (!timeline.hasAttribute("role")) {
      timeline.setAttribute("role", "region");
    }
    if (
      !timeline.hasAttribute("aria-label") &&
      !timeline.hasAttribute("aria-labelledby")
    ) {
      timeline.setAttribute("aria-label", "タイムライン");
    }

    return timeline;
  };

  const prepareTimelineSourceColumn = () => {
    const sourceColumn = getCourseTimelineSourceColumn();
    if (!sourceColumn) return null;

    sourceColumn.classList.add(COURSE_TIMELINE_SOURCE_CLASS);

    const header = Array.from(
      sourceColumn.querySelectorAll(".page-header, h1, h2, h3, h4"),
    ).find(isTimelineHeader);
    if (header && !header.id) {
      header.id = "ux-course-timeline-title";
    }

    return sourceColumn;
  };

  const ensureTimelinePanel = () => {
    const sourceColumn = prepareTimelineSourceColumn();
    const timeline = prepareTimelineTarget();
    if (!sourceColumn && !timeline) return null;

    const contentsRoot = getCourseContentsRoot();
    if (!contentsRoot) return null;

    let panel = document.getElementById(COURSE_TIMELINE_PANEL_ID);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = COURSE_TIMELINE_PANEL_ID;
      panel.className = "ux-course-timeline-panel";
      panel.setAttribute("aria-label", "タイムライン");
      panel.tabIndex = -1;
      panel.hidden = true;

      const anchor =
        Array.from(contentsRoot.children).find(
          (child) => child.id !== COURSE_TIMELINE_PANEL_ID,
        ) || null;
      contentsRoot.insertBefore(panel, anchor);
    }

    if (sourceColumn && sourceColumn.parentElement !== panel) {
      panel.appendChild(sourceColumn);
    } else if (!sourceColumn && timeline && timeline.parentElement !== panel) {
      panel.appendChild(timeline);
    }

    const preparedSource = sourceColumn || prepareTimelineSourceColumn();
    if (preparedSource && timeline && !preparedSource.contains(timeline)) {
      preparedSource.appendChild(timeline);
    }

    return panel;
  };

  const findCourseNavItemByLabel = (navList, labels) => {
    if (!navList) return null;

    const normalizedLabels = labels.map(normalizeCourseNavText).filter(Boolean);

    return (
      Array.from(navList.children).find((item) => {
        if (item.classList?.contains(COURSE_TIMELINE_NAV_ITEM_CLASS))
          return false;

        const link = item.querySelector(":scope > a");
        const label = normalizeCourseNavText(
          link?.textContent || item.textContent || "",
        );
        if (!label) return false;

        return normalizedLabels.some(
          (targetLabel) => label === targetLabel || label.includes(targetLabel),
        );
      }) || null
    );
  };

  const positionTimelineNavItem = (navList, navItem) => {
    if (!navList || !navItem) return;

    const attendanceItem = findCourseNavItemByLabel(navList, [
      "出席",
      "Attendance",
    ]);
    const otherItem = findCourseNavItemByLabel(navList, ["その他", "Other"]);

    if (otherItem && navItem.nextElementSibling !== otherItem) {
      navList.insertBefore(navItem, otherItem);
      return;
    }

    if (attendanceItem && attendanceItem.nextElementSibling !== navItem) {
      navList.insertBefore(navItem, attendanceItem.nextElementSibling);
      return;
    }

    if (navItem.parentElement !== navList) {
      navList.appendChild(navItem);
    }
  };

  const getTimelineViewActive = () => {
    const currentHash = (window.location.hash || "").replace(/^#/, "");
    return (
      currentHash === COURSE_TIMELINE_HASH ||
      currentHash === COURSE_TIMELINE_TARGET_ID ||
      currentHash === COURSE_TIMELINE_PANEL_ID
    );
  };

  const syncCourseNavActiveState = (timelineActive) => {
    const navList = getCourseSectionNavList();
    const timelineNavItem = navList?.querySelector(
      `:scope > .${COURSE_TIMELINE_NAV_ITEM_CLASS}`,
    );
    if (!navList || !timelineNavItem) return;

    Array.from(navList.children).forEach((item) => {
      if (item === timelineNavItem) return;

      if (timelineActive) {
        if (item.classList.contains("active")) {
          item.dataset.uxCourseOriginalActive = "1";
          item.classList.remove("active");
        }
        return;
      }

      if (item.dataset.uxCourseOriginalActive === "1") {
        item.classList.add("active");
        delete item.dataset.uxCourseOriginalActive;
      }
    });

    timelineNavItem.classList.toggle("active", timelineActive);
  };

  const syncTimelinePanelVisibility = ({
    focus = false,
    scroll = false,
  } = {}) => {
    const panel = ensureTimelinePanel();
    const timelineActive = getTimelineViewActive();

    document.body.classList.toggle(COURSE_TIMELINE_VIEW_CLASS, timelineActive);

    if (panel) {
      panel.toggleAttribute("hidden", !timelineActive);
    }

    syncCourseNavActiveState(timelineActive);

    if (!timelineActive || !panel) return;

    if (focus) {
      panel.focus({ preventScroll: true });
    }

    if (scroll) {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      panel.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    }
  };

  const syncTimelineNavActiveState = () => {
    const navItem = document.querySelector(
      `.${COURSE_TIMELINE_NAV_ITEM_CLASS}`,
    );
    if (!navItem) return;

    const link = navItem.querySelector(`.${COURSE_TIMELINE_NAV_LINK_CLASS}`);
    const isCurrent = getTimelineViewActive();

    navItem.classList.toggle("ux-timeline-current", isCurrent);
    if (link) {
      if (isCurrent) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    }
    syncTimelinePanelVisibility();
  };

  const isTimelineNavItem = (item) => {
    if (!item) return false;
    if (item.classList?.contains(COURSE_TIMELINE_NAV_ITEM_CLASS)) return true;

    const link = item.querySelector(":scope > a");
    const label = normalizeCourseNavText(
      link?.textContent || item.textContent || "",
    );
    const href = link?.getAttribute("href") || "";
    return (
      label === normalizeCourseNavText("タイムライン") ||
      href.endsWith(`#${COURSE_TIMELINE_HASH}`) ||
      href.includes(`#${COURSE_TIMELINE_HASH}`)
    );
  };

  const getOrCreateTimelineNavItem = (navList) => {
    const candidates = Array.from(navList.children).filter(isTimelineNavItem);
    let navItem =
      candidates.find(
        (item) => !item.classList.contains(COURSE_TIMELINE_NAV_ITEM_CLASS),
      ) ||
      candidates[0] ||
      null;

    if (!navItem) {
      navItem = document.createElement("li");
      const link = document.createElement("a");
      link.textContent = "タイムライン";
      navItem.appendChild(link);
    }

    candidates.forEach((candidate) => {
      if (candidate !== navItem) {
        candidate.remove();
      }
    });

    return navItem;
  };

  const ensureTimelineInCourseSectionNav = (
    navList = getCourseSectionNavList(),
  ) => {
    if (!navList) return;

    const panel = ensureTimelinePanel();

    let navItem = navList.querySelector(
      `:scope > .${COURSE_TIMELINE_NAV_ITEM_CLASS}`,
    );
    if (!panel) {
      if (navItem) navItem.remove();
      return;
    }

    navItem = getOrCreateTimelineNavItem(navList);
    navItem.classList.add(COURSE_TIMELINE_NAV_ITEM_CLASS);
    navItem.classList.remove(
      "visible-xs",
      "hidden-xs",
      "visible-sm",
      "hidden-sm",
      "visible-md",
      "hidden-md",
      "visible-lg",
      "hidden-lg",
    );

    let link = navItem.querySelector(":scope > a");
    if (!link) {
      link = document.createElement("a");
      navItem.appendChild(link);
    }

    link.classList.add(COURSE_TIMELINE_NAV_LINK_CLASS);
    link.id = "ux-course-timeline-nav-link";
    link.textContent = "タイムライン";
    link.href = `#${COURSE_TIMELINE_HASH}`;
    link.setAttribute("aria-controls", COURSE_TIMELINE_PANEL_ID);
    link.removeAttribute("data-toggle");
    panel.setAttribute("aria-labelledby", link.id);
    panel.removeAttribute("aria-label");

    if (link.dataset.uxCourseTimelineClickBound !== "1") {
      link.addEventListener("click", (event) => {
        const targetPanel = ensureTimelinePanel();
        if (!targetPanel) return;

        event.preventDefault();

        const nextHash = `#${COURSE_TIMELINE_HASH}`;
        try {
          if (window.location.hash !== nextHash) {
            history.pushState(null, "", nextHash);
          }
        } catch {
          window.location.hash = COURSE_TIMELINE_HASH;
        }

        syncTimelineNavActiveState();
        syncTimelinePanelVisibility({ focus: true, scroll: true });
      });
      link.dataset.uxCourseTimelineClickBound = "1";
    }

    positionTimelineNavItem(navList, navItem);
    syncTimelineNavActiveState();
  };

  const scheduleTimelineNavPlacement = () => {
    const run = () => ensureTimelineInCourseSectionNav();
    run();
    [250, 1000, 2200].forEach((delay) => {
      window.setTimeout(run, delay);
    });

    if (document.body?.dataset.uxCourseTimelineHashBound !== "1") {
      window.addEventListener("hashchange", syncTimelineNavActiveState, {
        passive: true,
      });
      window.addEventListener("popstate", syncTimelineNavActiveState, {
        passive: true,
      });
      document.body.dataset.uxCourseTimelineHashBound = "1";
    }

    // WebClass also updates the timeline area after render. Re-running from a
    // broad MutationObserver can fight that update loop, so keep this bounded.
  };

  const ensureCourseSectionNavStickyHeader = () => {
    const navbar = document.querySelector(
      "header .navbar.navbar-default, .navbar.navbar-default",
    );
    if (!navbar) return;

    let sectionNav = document.querySelector(".ux-course-section-nav");
    const navList = navbar.querySelector(".navbar-nav.navbar-left");
    const sourceMenu = navbar.querySelector("#menu.navbar-collapse");
    const syncEmptySourceMenu = () => {
      if (!sourceMenu) return;
      const hasVisibleControl = (child) => {
        if (!child || child === navList) return false;
        const childStyle = window.getComputedStyle(child);
        if (childStyle.display === "none" || childStyle.visibility === "hidden")
          return false;

        const controls = child.querySelectorAll(
          'a[href], button, input, select, textarea, [role="button"], [tabindex]',
        );
        return Array.from(controls).some((control) => {
          const controlStyle = window.getComputedStyle(control);
          if (
            controlStyle.display === "none" ||
            controlStyle.visibility === "hidden"
          )
            return false;
          const rect = control.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      };
      const hasRemainingContent = Array.from(sourceMenu.children).some(
        hasVisibleControl,
      );
      sourceMenu.classList.toggle("ux-course-empty-menu", !hasRemainingContent);
      if (sourceMenu.parentElement) {
        sourceMenu.parentElement.classList.toggle(
          "ux-course-empty-menu-shell",
          !hasRemainingContent,
        );
      }
    };

    if (!navList && sectionNav) {
      syncEmptySourceMenu();
      return;
    }
    if (!navList) {
      syncEmptySourceMenu();
      return;
    }

    if (!sectionNav) {
      sectionNav = document.createElement("nav");
      sectionNav.className = "ux-course-section-nav";
      sectionNav.setAttribute("aria-label", "Course sections");

      const inner = document.createElement("div");
      inner.className = "ux-course-section-nav-inner";
      sectionNav.appendChild(inner);

      const anchor = navbar.closest("header") || navbar;
      anchor.insertAdjacentElement("afterend", sectionNav);
    }

    const inner =
      sectionNav.querySelector(".ux-course-section-nav-inner") || sectionNav;
    inner.appendChild(navList);
    ensureTimelineInCourseSectionNav(navList);
    syncEmptySourceMenu();
  };

  const ensureCourseAlertsInMainContent = () => {
    if (!document.body) return;

    const topInfo = document.getElementById("top-info");
    if (!topInfo) return;

    const mainContainer = document.querySelector("#js-main > .container");
    if (!mainContainer) {
      const sectionNav = document.querySelector(".ux-course-section-nav");
      if (sectionNav?.parentElement) {
        if (
          topInfo.parentElement === sectionNav.parentElement &&
          topInfo === sectionNav.nextElementSibling
        )
          return;
        sectionNav.parentElement.insertBefore(topInfo, sectionNav.nextSibling);
        return;
      }
      if (
        topInfo.parentElement === document.body &&
        topInfo === document.body.firstElementChild
      )
        return;
      document.body.insertBefore(topInfo, document.body.firstChild);
      return;
    }

    if (
      topInfo.parentElement === mainContainer &&
      topInfo === mainContainer.firstElementChild
    )
      return;
    mainContainer.insertBefore(topInfo, mainContainer.firstElementChild);
  };

  const scheduleCourseAlertsRelocation = () => {
    ensureCourseAlertsInMainContent();
    window.setTimeout(ensureCourseAlertsInMainContent, 250);
    window.setTimeout(ensureCourseAlertsInMainContent, 1000);

    if (document.body.dataset.uxCourseAlertsObserverBound === "1") return;
    const alertObserver = new MutationObserver(ensureCourseAlertsInMainContent);
    if (
      safeObserveUxMutation(alertObserver, document.documentElement, {
        childList: true,
        subtree: true,
      })
    ) {
      document.body.dataset.uxCourseAlertsObserverBound = "1";
      window.setTimeout(() => alertObserver.disconnect(), 10000);
    }
  };

  const markDisabledContentsItems = () => {
    const items = document.querySelectorAll(
      ".cm-contentsList .cl-contentsList_listGroupItem",
    );
    items.forEach((item) => {
      const contentType = resolveCourseContentsItemType(item);
      item.dataset.uxContentType = contentType;
      item.classList.toggle(
        "ux-content-type-shiryou",
        contentType === "shiryou",
      );
      item.classList.toggle("ux-content-type-shiken", contentType === "shiken");

      const categoryLabel = item.querySelector(
        ".cl-contentsList_categoryLabel",
      );
      if (categoryLabel) {
        categoryLabel.dataset.uxContentType = contentType;
      }

      const nameEl = item.querySelector(".cm-contentsList_contentName");
      if (!nameEl) return;
      const link = nameEl.querySelector("a[href]");
      const hasValidLink =
        link &&
        link.getAttribute("href") &&
        !link.getAttribute("href").startsWith("javascript:");
      item.classList.toggle("ux-contents-disabled", !hasValidLink);

      item
        .querySelectorAll(
          '.cl-contentsList_contentDetailListItemData a[href*="history"]',
        )
        .forEach((historyLink) => {
          const match = (historyLink.textContent || "")
            .trim()
            .match(/^利用回数\s*(\d+)$/);
          if (match) {
            historyLink.textContent = `${match[1]}回`;
          }
        });
    });
  };

  const activateThemeIfContentsPage = () => {
    if (!document.body) return false;
    const hasContents = !!document.querySelector(
      "#js-contents .cm-contentsList",
    );
    if (!hasContents) return false;

    document.body.classList.add(BODY_CLASS);
    document.body.classList.add("ux-course-quick-nav-initializing");
    if (typeof scheduleCourseHeaderUtilityControls === "function") {
      scheduleCourseHeaderUtilityControls(document);
    }
    ensureQuickNavShell();
    ensureCourseSectionNavStickyHeader();
    scheduleTimelineNavPlacement();
    scheduleCourseAlertsRelocation();
    ensureSideNavStickyCard();
    markDisabledContentsItems();
    updateCourseFooter();
    bindCourseFooterAlignment();
    bindCourseScrollPositionMemory();
    restoreCourseScrollPosition();
    void refreshQuickNav();
    scheduleQuickNavWarmupRefresh();
    bindQuickNavStorageRefresh();
    return true;
  };

  injectStyle();

  if (activateThemeIfContentsPage()) {
    log("Applied course contents visual refresh");
    return;
  }

  const observer = new MutationObserver(() => {
    if (!isUxExtensionVisualEnabled()) {
      observer.disconnect();
      return;
    }
    if (!activateThemeIfContentsPage()) return;
    observer.disconnect();
    log("Applied course contents visual refresh (after render)");
  });

  if (
    safeObserveUxMutation(observer, document.documentElement, {
      childList: true,
      subtree: true,
    })
  ) {
    document.__uxCourseContentsObserver = observer;
    setTimeout(() => observer.disconnect(), 10000);
  }
}

/**
 * Suppress 'beforeunload' dialog
 * Note: The main suppression is now done by beforeunload-blocker.js
 * which is injected via manifest.json with world: "MAIN"
 * This function provides fallback cleanup in the content script world.
 */
function suppressBeforeUnload() {
  log("suppressBeforeUnload called (content script world)");

  // The main blocking is done by beforeunload-blocker.js in the MAIN world
  // This content script can only do limited cleanup

  // Add a capturing listener in the content script world as backup
  window.addEventListener(
    "beforeunload",
    function (e) {
      e.stopImmediatePropagation();
      e.stopPropagation();
      try {
        delete e.returnValue;
      } catch (ex) {}
    },
    { capture: true },
  );

  log("Added beforeunload listener in content script world as backup");
}

// ============================================================
