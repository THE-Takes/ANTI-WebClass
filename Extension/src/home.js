// home.js
// Handles Home Page improvements: ToDo list, Message widget, Layout changes

// uxDebugModeState, uxDebugLog, uxDebugWarn, syncUxMasterStateToPage,
// STORAGE_KEY_EXTENSION_VISUAL_ENABLED, PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED
// are declared in shared.js (loaded before this file).
// Fallbacks are provided here so this script does not crash if shared.js
// fails to load for any reason.
var uxDebugModeState = globalThis.uxDebugModeState || { enabled: false };
globalThis.uxDebugModeState = uxDebugModeState;

var uxDebugLog = typeof globalThis.uxDebugLog === 'function'
    ? globalThis.uxDebugLog
    : function (...args) {
        if (!uxDebugModeState.enabled) return;
        console.log(...args);
    };
if (typeof globalThis.uxDebugLog !== 'function') {
    globalThis.uxDebugLog = uxDebugLog;
}

var uxDebugWarn = typeof globalThis.uxDebugWarn === 'function'
    ? globalThis.uxDebugWarn
    : function (...args) {
        if (!uxDebugModeState.enabled) return;
        console.warn(...args);
    };
if (typeof globalThis.uxDebugWarn !== 'function') {
    globalThis.uxDebugWarn = uxDebugWarn;
}

var STORAGE_KEY_EXTENSION_VISUAL_ENABLED = typeof globalThis.STORAGE_KEY_EXTENSION_VISUAL_ENABLED === 'string'
    ? globalThis.STORAGE_KEY_EXTENSION_VISUAL_ENABLED
    : 'extensionVisualEnabled';
if (typeof globalThis.STORAGE_KEY_EXTENSION_VISUAL_ENABLED !== 'string') {
    globalThis.STORAGE_KEY_EXTENSION_VISUAL_ENABLED = STORAGE_KEY_EXTENSION_VISUAL_ENABLED;
}

var PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED = typeof globalThis.PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED === 'string'
    ? globalThis.PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED
    : 'webclass_ux_master_enabled';
if (typeof globalThis.PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED !== 'string') {
    globalThis.PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED = PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED;
}

var syncUxMasterStateToPage = typeof globalThis.syncUxMasterStateToPage === 'function'
    ? globalThis.syncUxMasterStateToPage
    : function (enabled) {
        const normalized = enabled ? '1' : '0';
        try {
            if (document && document.documentElement) {
                document.documentElement.dataset.webclassUxMasterEnabled = normalized;
            }
        } catch {
            // ignore
        }
        try {
            localStorage.setItem(PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED, normalized);
        } catch {
            // ignore
        }
    };
if (typeof globalThis.syncUxMasterStateToPage !== 'function') {
    globalThis.syncUxMasterStateToPage = syncUxMasterStateToPage;
}

const uxExtensionVisualState = {
    enabled: (() => {
        try {
            const persisted = localStorage.getItem(PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED);
            if (persisted === '0') return false;
            if (persisted === '1') return true;
        } catch {
            // ignore
        }
        return true;
    })()
};
const uxDebugModeChangeListeners = new Set();

function uxSetExtensionVisualEnabled(enabled) {
    uxExtensionVisualState.enabled = !!enabled;
    syncUxMasterStateToPage(uxExtensionVisualState.enabled);
}

function uxIsExtensionVisualEnabled() {
    return !!uxExtensionVisualState.enabled;
}

(() => {
    const notifyDebugModeChange = () => {
        uxDebugModeChangeListeners.forEach((listener) => {
            try {
                listener(uxDebugModeState.enabled);
            } catch {
                // ignore listener errors
            }
        });
        try {
            if (document && document.documentElement) {
                document.documentElement.dataset.webclassUxDebugMode = uxDebugModeState.enabled ? '1' : '0';
            }
        } catch {
            // ignore
        }
    };

    try {
        chrome.storage.local.get({ debugModeEnabled: false, [STORAGE_KEY_EXTENSION_VISUAL_ENABLED]: true }, (items) => {
            uxDebugModeState.enabled = !!items.debugModeEnabled;
            uxSetExtensionVisualEnabled(items[STORAGE_KEY_EXTENSION_VISUAL_ENABLED] !== false);
            notifyDebugModeChange();
        });
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;

            if (changes.debugModeEnabled) {
                uxDebugModeState.enabled = !!changes.debugModeEnabled.newValue;
                notifyDebugModeChange();
            }
            if (changes[STORAGE_KEY_EXTENSION_VISUAL_ENABLED]) {
                const nextEnabled = changes[STORAGE_KEY_EXTENSION_VISUAL_ENABLED].newValue !== false;
                const prevEnabled = uxIsExtensionVisualEnabled();
                uxSetExtensionVisualEnabled(nextEnabled);
                if (isHomePage && prevEnabled !== nextEnabled) {
                    window.location.reload();
                }
            }
        });
    } catch {
        uxDebugModeState.enabled = false;
        uxSetExtensionVisualEnabled(true);
        notifyDebugModeChange();
    }
})();

function onUxDebugModeChange(listener) {
    if (typeof listener !== 'function') return () => { };
    uxDebugModeChangeListeners.add(listener);
    return () => uxDebugModeChangeListeners.delete(listener);
}

// uxDebugLog and uxDebugWarn are declared in scraper.js (loaded before home.js)

function uxIsDebugModeEnabled() {
    return !!uxDebugModeState.enabled;
}

function getAcademicYearForDate(date) {
    const baseDate = date instanceof Date ? new Date(date.getTime()) : new Date(date);
    if (Number.isNaN(baseDate.getTime())) {
        const now = new Date();
        const month = now.getMonth() + 1;
        return month >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    }
    const month = baseDate.getMonth() + 1;
    return month >= 4 ? baseDate.getFullYear() : baseDate.getFullYear() - 1;
}

function getNextAcademicYearRevealDate(academicYear) {
    return new Date(academicYear + 1, 1, 1);
}

function getMaxVisibleAcademicYear(date = getWebClassNow()) {
    const baseDate = date instanceof Date ? new Date(date.getTime()) : new Date(date);
    const currentAcademicYear = getAcademicYearForDate(baseDate);
    const nextAcademicYearRevealDate = getNextAcademicYearRevealDate(currentAcademicYear);
    return baseDate >= nextAcademicYearRevealDate
        ? currentAcademicYear + 1
        : currentAcademicYear;
}

function parseAcademicYearOption(option) {
    if (!option) return null;
    const rawValue = `${option.value ?? ''}`.trim();
    const rawText = `${option.text ?? ''}`.trim();
    const source = rawValue || rawText;
    if (!/^\d{4}$/.test(source)) return null;
    const year = Number(source);
    return Number.isFinite(year) ? year : null;
}

function normalizeAcademicYearOptions(options, date = getWebClassNow()) {
    if (!Array.isArray(options) || !options.length) {
        return [];
    }

    const maxVisibleAcademicYear = getMaxVisibleAcademicYear(date);
    const currentAcademicYear = getAcademicYearForDate(date);
    const normalizedOptions = options.filter((option) => {
        const year = parseAcademicYearOption(option);
        return year === null || year <= maxVisibleAcademicYear;
    });

    if (!normalizedOptions.length) {
        return [];
    }

    const selectedOption = normalizedOptions.find((option) => option.selected);
    if (selectedOption) {
        return normalizedOptions;
    }

    const preferredYearOption =
        normalizedOptions.find((option) => parseAcademicYearOption(option) === currentAcademicYear) ||
        [...normalizedOptions]
            .reverse()
            .find((option) => {
                const year = parseAcademicYearOption(option);
                return year !== null && year <= maxVisibleAcademicYear;
            }) ||
        normalizedOptions[0];

    return normalizedOptions.map((option) => ({
        ...option,
        selected: option === preferredYearOption
    }));
}

// --- URL Check ---
// Only run on the WebClass home top page.
function isWebClassHomePath(pathname) {
    const normalizedPath = String(pathname || '').replace(/\/+$/, '');
    if (!normalizedPath) return false;
    if (normalizedPath === '/webclass') return true;
    return normalizedPath === '/webclass/index.php';
}

const isHomePage = isWebClassHomePath(window.location.pathname);

if (!isHomePage) {
    uxDebugLog("WebClass UX Improver: Not home page, skipping home.js");
    // Exit silently without throwing error
} else {

    uxDebugLog("WebClass UX Improver: Home script loaded");

    // --- Inject CSS for spinning refresh icon ---
    const uxRefreshStyle = document.createElement('style');
    uxRefreshStyle.textContent = `
        @keyframes ux-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        @keyframes ux-pulse {
            0% { opacity: 0.3; }
            50% { opacity: 1; }
            100% { opacity: 0.3; }
        }
        @keyframes ux-check-draw {
            0% { stroke-dashoffset: 24; }
            30% { stroke-dashoffset: 15.5; }
            60% { stroke-dashoffset: 15.5; }
            100% { stroke-dashoffset: 0; }
        }
        @keyframes ux-title-burst-beam {
            0% { transform: translateX(-130%) skewX(-18deg); opacity: 0; }
            14% { opacity: 0.96; }
            76% { opacity: 0.82; }
            100% { transform: translateX(135%) skewX(-18deg); opacity: 0; }
        }
        @keyframes ux-title-burst-ring {
            0% { transform: translate(-50%, -50%) scale(0.28); opacity: 0; }
            18% { opacity: 0.55; }
            100% { transform: translate(-50%, -50%) scale(1.12); opacity: 0; }
        }
        @keyframes ux-title-burst-spark {
            0% {
                transform: translate(0, 0) scale(0.65);
                opacity: 0;
            }
            14% { opacity: 1; }
            100% {
                transform: translate(var(--ux-spark-x), var(--ux-spark-y)) scale(0.18);
                opacity: 0;
            }
        }
        .ux-refresh-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        .ux-refresh-btn svg {
            width: 16px;
            height: 16px;
            fill: currentColor;
        }
        .ux-refresh-btn.ux-loading svg {
            animation: ux-spin 1s linear infinite;
        }
        .ux-check-btn svg {
            fill: none;
            stroke: currentColor;
            stroke-width: 3;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .ux-check-btn svg path {
            stroke-dasharray: 24;
            stroke-dashoffset: 0;
        }
        .ux-check-btn.ux-drawing svg path {
            animation: ux-check-draw 0.4s ease-out forwards;
        }
        .ux-llm-course-status {
            display: none;
            align-items: center;
            gap: 6px;
            font-size: 1em;
            line-height: 1.2;
            color: var(--ux-home-warning-foreground);
        }
        .ux-llm-course-status .ux-llm-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: var(--ux-home-warning);
            animation: ux-pulse 1s ease-in-out infinite;
        }
        .ux-title-burst-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            pointer-events: none;
            border-radius: inherit;
            z-index: 11;
            mix-blend-mode: screen;
        }
        .ux-title-burst-beam {
            position: absolute;
            top: -40%;
            left: -55%;
            width: 48%;
            height: 180%;
            background: linear-gradient(
                90deg,
                rgba(149, 224, 255, 0) 0%,
                rgba(149, 224, 255, 0.92) 34%,
                rgba(255, 255, 255, 0.98) 52%,
                rgba(149, 224, 255, 0.88) 72%,
                rgba(149, 224, 255, 0) 100%
            );
            filter: blur(0.25px);
            animation: ux-title-burst-beam 620ms cubic-bezier(0.22, 0.81, 0.26, 1) forwards;
        }
        .ux-title-burst-ring {
            position: absolute;
            top: 50%;
            left: 50%;
            width: clamp(12px, 1.7vw, 18px);
            aspect-ratio: 1;
            border: 1px solid rgba(214, 247, 255, 0.9);
            border-radius: 999px;
            box-shadow: 0 0 0 1px rgba(145, 215, 255, 0.36);
            animation: ux-title-burst-ring 560ms ease-out forwards;
        }
        .ux-title-burst-spark {
            position: absolute;
            top: 50%;
            left: 52%;
            width: 4px;
            aspect-ratio: 1;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.96);
            box-shadow: 0 0 12px rgba(170, 224, 255, 0.9);
            animation: ux-title-burst-spark 520ms cubic-bezier(0.25, 0.82, 0.2, 1) forwards;
            animation-delay: var(--ux-spark-delay, 0ms);
        }
    `;
    document.head.appendChild(uxRefreshStyle);

    // --- Timetable highlight colors (day + current slot) ---
    const uxTimetableHighlightStyle = document.createElement('style');
    uxTimetableHighlightStyle.textContent = `
        .ux-timetable-day-muted {
            background-color: var(--ux-home-surface) !important;
            color: inherit !important;
        }
        .ux-timetable-day-muted a {
            color: inherit !important;
        }
        .ux-timetable-day-today {
            color: var(--ux-home-accent-emphasis) !important;
        }
        .ux-timetable-day-today a {
            color: var(--ux-home-accent-emphasis) !important;
        }
        .ux-timetable-current-slot {
            background-color: var(--ux-home-warning-soft) !important;
        }
        .ux-timetable-current-slot a {
            background-color: transparent !important;
            color: var(--ux-home-warning-foreground) !important;
            font-weight: 600;
        }
    `;
    document.head.appendChild(uxTimetableHighlightStyle);

    // --- Configuration & State ---
    const STORAGE_KEY_TODO = 'webclass_todo_list'; // Legacy key (user edits) - keeping for custom todos if needed
    const STORAGE_KEY_ASSIGNMENTS = 'assignments'; // Scraped assignments
    const STORAGE_KEY_MESSAGES = 'webclass_messages'; // Messages cache
    const STORAGE_KEY_TRASH = 'webclass_todo_trash'; // Trash bin for soft-deleted tasks
    const STORAGE_KEY_OPENAI_COURSE_CACHE = 'openaiCourseNameCache';
    const STORAGE_KEY_SHORT_COURSE_CACHE = 'webclass_course_short_name_cache';
    const STORAGE_KEY_AUTO_RUN_COURSE_NAME_CONVERSION = 'autoRunCourseNameConversionOnDashboardLoad';
    const STORAGE_KEY_SHORT_NAME_MODE_ENABLED = 'webclass_short_name_mode_enabled';
    const STORAGE_KEY_TODO_API_PROVIDER = 'todoApiProvider';
    const STORAGE_KEY_MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE = 'msTodoDefaultReminderDaysBefore';
    const STORAGE_KEY_MS_TODO_DEFAULT_REMINDER_TIME_MODE = 'msTodoDefaultReminderTimeMode';
    const STORAGE_KEY_MS_TODO_LAST_MANUAL_RELOAD = 'msTodoLastManualReloadAt';
    const MS_TODO_REMINDER_TIME_MODE_AT_9AM = 'at_9am';
    const MS_TODO_REMINDER_TIME_MODE_EXACT_OFFSET = 'exact_offset';
    const MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE = 1;
    const MESSAGE_TYPE_RUN_DASHBOARD_COURSE_NAME_CONVERSION = 'RUN_DASHBOARD_COURSE_NAME_CONVERSION';
    const MESSAGE_TYPE_RUN_TODO_API_SYNC_FROM_BACKGROUND = 'RUN_TODO_API_SYNC_FROM_BACKGROUND';
    let runDashboardCourseNameConversionFromSettings = null;
    let runTodoApiSyncFromBackground = null;

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type === MESSAGE_TYPE_RUN_DASHBOARD_COURSE_NAME_CONVERSION) {
            if (typeof runDashboardCourseNameConversionFromSettings !== 'function') {
                sendResponse({
                    success: false,
                    error: 'Switch View 2 が表示されていないため実行できません。'
                });
                return false;
            }

            runDashboardCourseNameConversionFromSettings()
                .then(() => sendResponse({ success: true }))
                .catch((error) => {
                    uxDebugWarn('[WebClass UX] settings short-name convert failed', error);
                    sendResponse({
                        success: false,
                        error: error?.message || '短縮名更新に失敗しました。'
                    });
                });
            return true;
        }

        if (message?.type === MESSAGE_TYPE_RUN_TODO_API_SYNC_FROM_BACKGROUND) {
            if (typeof runTodoApiSyncFromBackground !== 'function') {
                sendResponse({
                    success: false,
                    error: 'Switch View 2 が表示されていないため同期できません。'
                });
                return false;
            }

            runTodoApiSyncFromBackground({
                trigger: message.trigger || 'background',
                mode: message.mode || 'full',
                forceRemoteReload: message.forceRemoteReload === true
            })
                .then(() => sendResponse({ success: true }))
                .catch((error) => {
                    uxDebugWarn('[WebClass UX] background todo sync failed', error);
                    sendResponse({
                        success: false,
                        error: error?.message || 'ToDo API 同期に失敗しました。'
                    });
                });
            return true;
        }

        return false;
    });

    // --- UI State (タブの開閉状態を保持) ---
    const uiState = {
        completedSectionOpen: false,
        farFutureSectionOpen: false,
        indefiniteSectionOpen: false,
        expiredSectionOpen: false // 期限切れセクションはデフォルトで閉じる（完了済みの下に配置）
    };

    // [devdev] Debug time override (WebClassが認識する時刻を固定)
    const UX_DEBUG_TIME_STORAGE_KEY = 'webclass_debug_time_override_devdev';
    const UX_DEBUG_TIME_ENABLED_KEY = 'webclass_debug_time_enabled_devdev';
    const uxDebugTimeState = { enabled: false, timestamp: null };

    const TIMETABLE_CLASS_ORDER_RANGES = [
        { order: 1, start: 9 * 60, end: 10 * 60 + 40 },
        { order: 2, start: 10 * 60 + 50, end: 12 * 60 + 30 },
        { order: 3, start: 13 * 60 + 30, end: 15 * 60 + 10 },
        { order: 4, start: 15 * 60 + 20, end: 17 * 60 + 0 },
        { order: 5, start: 17 * 60 + 10, end: 18 * 60 + 50 },
        { order: 6, start: 19 * 60 + 0, end: 20 * 60 + 40 },
        { order: 7, start: 20 * 60 + 45, end: 22 * 60 + 25 },
    ];

    const TIMETABLE_HIGHLIGHT_CLASSES = [
        'ux-timetable-day-muted',
        'ux-timetable-day-today',
        'ux-timetable-current-slot',
    ];
    const DASHBOARD_TIMETABLE_INLINE_EDIT_LONG_PRESS_MS = 520;
    const DASHBOARD_TIMETABLE_INLINE_EDIT_MOVE_TOLERANCE_PX = 12;

    function parseDebugTimeInput(value) {
        if (value instanceof Date) {
            return isNaN(value.getTime()) ? null : new Date(value.getTime());
        }
        if (typeof value === 'number') {
            const d = new Date(value);
            return isNaN(d.getTime()) ? null : d;
        }
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (!trimmed) return null;
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? null : d;
    }

    function formatDebugDate(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) return '';
        return date.toLocaleDateString('ja-JP');
    }

    function formatDebugTime(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) return '';
        let hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? '午後' : '午前';
        hours = hours % 12;
        hours = hours ? hours : 12;
        return `${ampm} ${hours}:${minutes < 10 ? '0' + minutes : minutes}`;
    }

    function parseDebugDate(value) {
        if (!value) return null;
        const cleaned = value.trim().replace(/[-.]/g, '/');
        const match = cleaned.match(/^(\d{4})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})$/);
        if (!match) return null;
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        return { year, month, day };
    }

    function parseDebugTime(value) {
        if (!value) return null;
        const match = value.match(/^(午前|午後)\s*(\d+):(\d+)$/);
        if (!match) return null;
        let h = parseInt(match[2], 10);
        const m = parseInt(match[3], 10);
        if (match[1] === '午後' && h < 12) h += 12;
        if (match[1] === '午前' && h === 12) h = 0;
        return { hh: h, mm: m };
    }

    function loadDebugTimeState() {
        try {
            const enabled = localStorage.getItem(UX_DEBUG_TIME_ENABLED_KEY) === '1';
            const raw = localStorage.getItem(UX_DEBUG_TIME_STORAGE_KEY);
            const parsed = raw ? parseDebugTimeInput(raw) : null;
            uxDebugTimeState.enabled = enabled && !!parsed;
            uxDebugTimeState.timestamp = parsed ? parsed.getTime() : null;
        } catch {
            uxDebugTimeState.enabled = false;
            uxDebugTimeState.timestamp = null;
        }
    }

    function setWebClassDebugTime(value) {
        if (!uxIsDebugModeEnabled()) return false;
        const parsed = parseDebugTimeInput(value);
        if (!parsed) return false;
        uxDebugTimeState.enabled = true;
        uxDebugTimeState.timestamp = parsed.getTime();
        try {
            localStorage.setItem(UX_DEBUG_TIME_STORAGE_KEY, parsed.toISOString());
            localStorage.setItem(UX_DEBUG_TIME_ENABLED_KEY, '1');
        } catch {
            // ignore storage errors
        }
        return true;
    }

    function clearWebClassDebugTime() {
        uxDebugTimeState.enabled = false;
        uxDebugTimeState.timestamp = null;
        try {
            localStorage.removeItem(UX_DEBUG_TIME_STORAGE_KEY);
            localStorage.removeItem(UX_DEBUG_TIME_ENABLED_KEY);
        } catch {
            // ignore storage errors
        }
    }

    function getWebClassDebugTimeState() {
        if (!uxIsDebugModeEnabled()) {
            return { enabled: false, date: null };
        }
        if (!uxDebugTimeState.enabled || !Number.isFinite(uxDebugTimeState.timestamp)) {
            return { enabled: false, date: null };
        }
        return { enabled: true, date: new Date(uxDebugTimeState.timestamp) };
    }

    function getWebClassNow() {
        if (!uxIsDebugModeEnabled()) {
            return new Date();
        }
        if (uxDebugTimeState.enabled && Number.isFinite(uxDebugTimeState.timestamp)) {
            return new Date(uxDebugTimeState.timestamp);
        }
        return new Date();
    }

    function formatDebugTimeLabel(state) {
        if (!state.enabled || !state.date) {
            return `[devdev] 現在: ${new Date().toLocaleString('ja-JP')}`;
        }
        return `[devdev] 現在: ${state.date.toLocaleString('ja-JP')}`;
    }

    async function refreshTimeSensitiveUI() {
        applyTimetableDayTimeHighlightAll();
        try {
            const assignments = await loadAssignments();
            applyTimetableColorsFromTodo(assignments);
        } catch {
            // ignore refresh errors
        }
    }

    function appendDevdevTimeControls(container) {
        const debugLabel = document.createElement('span');
        debugLabel.textContent = '[devdev] 時刻';
        debugLabel.style.fontSize = '0.75em';
        debugLabel.style.color = '#555';

        const debugDateInput = document.createElement('input');
        debugDateInput.type = 'text';
        debugDateInput.placeholder = '日付';
        debugDateInput.readOnly = true;
        debugDateInput.style.fontSize = '0.75em';
        debugDateInput.style.padding = '2px 4px';
        debugDateInput.style.border = '1px solid #ccc';
        debugDateInput.style.borderRadius = '4px';
        debugDateInput.style.width = '9ch';
        debugDateInput.style.cursor = 'pointer';

        const debugTimeInput = document.createElement('input');
        debugTimeInput.type = 'text';
        debugTimeInput.placeholder = '時間';
        debugTimeInput.readOnly = true;
        debugTimeInput.style.fontSize = '0.75em';
        debugTimeInput.style.padding = '2px 4px';
        debugTimeInput.style.border = '1px solid #ccc';
        debugTimeInput.style.borderRadius = '4px';
        debugTimeInput.style.width = '9ch';
        debugTimeInput.style.cursor = 'pointer';

        const debugTimeResetBtn = document.createElement('button');
        debugTimeResetBtn.textContent = '[devdev] 実時間へ';
        debugTimeResetBtn.style.fontSize = '0.75em';
        debugTimeResetBtn.style.padding = '2px 5px';
        debugTimeResetBtn.style.cursor = 'pointer';

        const debugTimeStatus = document.createElement('span');
        debugTimeStatus.style.fontSize = '0.7em';
        debugTimeStatus.style.color = '#555';

        const updateDebugTimeStatus = () => {
            const state = getWebClassDebugTimeState();
            debugTimeStatus.textContent = formatDebugTimeLabel(state);
            if (state.enabled && state.date) {
                debugDateInput.value = formatDebugDate(state.date);
                debugTimeInput.value = formatDebugTime(state.date);
            } else {
                debugDateInput.value = '';
                debugTimeInput.value = '';
            }
        };

        updateDebugTimeStatus();

        const openDebugPicker = (event) => {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            const state = getWebClassDebugTimeState();
            let needsRefresh = false;
            openDatetimePopover(debugDateInput, {
                initialDate: state.date || new Date(),
                onCommit: async (date) => {
                    const ok = setWebClassDebugTime(date);
                    if (!ok) {
                        debugTimeStatus.textContent = '[devdev] 時刻が正しくありません';
                        return;
                    }
                    updateDebugTimeStatus();
                    needsRefresh = true;
                },
                onClear: async () => {
                    clearWebClassDebugTime();
                    updateDebugTimeStatus();
                    needsRefresh = true;
                },
                onClose: async () => {
                    if (needsRefresh) {
                        await refreshTimeSensitiveUI();
                    }
                }
            });
        };

        debugDateInput.addEventListener('click', openDebugPicker);
        debugTimeInput.addEventListener('click', openDebugPicker);
        debugDateInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                openDebugPicker(event);
            }
        });
        debugTimeInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                openDebugPicker(event);
            }
        });
        debugTimeResetBtn.onclick = async () => {
            clearWebClassDebugTime();
            updateDebugTimeStatus();
            await refreshTimeSensitiveUI();
        };

        container.appendChild(debugLabel);
        container.appendChild(debugDateInput);
        container.appendChild(debugTimeInput);
        container.appendChild(debugTimeResetBtn);
        container.appendChild(debugTimeStatus);
    }

    function normalizeDevdevCourseText(text) {
        return (text || '')
            .replace(/^»\s*/, '')
            .replace('締切が近い課題があります。', '')
            .replace(/新着メッセージ\(\d+\)/, '')
            .trim();
    }

    function resolveEditedCustomCourseName(customName, fullName) {
        const rawCustomName = (customName || '').trim();
        if (!rawCustomName) return '';
        const normalizedCustomName = normalizeDevdevCourseText(rawCustomName);
        if (!normalizedCustomName) return '';
        const normalizedFullName = normalizeDevdevCourseText(fullName || '');
        if (normalizedFullName && normalizedCustomName === normalizedFullName) {
            return '';
        }
        return rawCustomName;
    }

    function extractCourseIdFromUrl(url) {
        const raw = url || '';
        const match = raw.match(/course\.php\/([^\/?]+)/);
        if (match) return match[1];
        try {
            const parsed = new URL(raw, window.location.href);
            return (
                parsed.searchParams.get('course_id') ||
                parsed.searchParams.get('course') ||
                parsed.searchParams.get('id') ||
                ''
            );
        } catch {
            return '';
        }
    }

    function buildTodoCourseDisplayNameMap() {
        const byId = new Map();
        const byFullName = new Map();
        const tables = Array.from(document.querySelectorAll('table.ux-dashboard-v2-schedule-table, table.schedule-table'));

        // Prefer Switch View 2 timetable when both tables exist.
        tables.sort((a, b) => {
            const aScore = a.classList.contains('ux-dashboard-v2-schedule-table') ? 1 : 0;
            const bScore = b.classList.contains('ux-dashboard-v2-schedule-table') ? 1 : 0;
            return bScore - aScore;
        });

        const shouldReplace = (existingValue, nextValue, fullName) => {
            const existing = normalizeDevdevCourseText(existingValue || '');
            const next = normalizeDevdevCourseText(nextValue || '');
            const normalizedFull = normalizeDevdevCourseText(fullName || '');
            if (!next) return false;
            if (!existing) return true;
            if (existing === next) return false;
            if (normalizedFull && existing === normalizedFull && next !== normalizedFull) return true;
            if (next.length < existing.length && next !== normalizedFull) return true;
            return false;
        };

        tables.forEach((table) => {
            const links = table.querySelectorAll('a[href*="course.php"]');
            links.forEach((link) => {
                const href = link.getAttribute('href') || '';
                const displayName = normalizeDevdevCourseText(link.textContent || '');
                if (!displayName) return;

                const fullName = normalizeDevdevCourseText(link.dataset.originalText || displayName);
                const courseId = extractCourseIdFromUrl(href);

                if (courseId) {
                    const existingById = byId.get(courseId) || '';
                    if (shouldReplace(existingById, displayName, fullName)) {
                        byId.set(courseId, displayName);
                    }
                }

                if (fullName && fullName !== displayName) {
                    const existingByFull = byFullName.get(fullName) || '';
                    if (shouldReplace(existingByFull, displayName, fullName)) {
                        byFullName.set(fullName, displayName);
                    }
                }
            });
        });

        return { byId, byFullName };
    }

    function getTodoCourseDisplayName(todo, courseNameMap = null, preferShortFallback = false) {
        if (!todo || typeof todo !== 'object') return '';

        const fullName = normalizeDevdevCourseText(todo.courseFullName || '');
        const shortOrCurrentName = normalizeDevdevCourseText(todo.course || '');
        const sourceUrl = todo.url || todo.fallbackUrl || '';
        const courseId = extractCourseIdFromUrl(sourceUrl);
        const byId = courseNameMap && courseNameMap.byId instanceof Map ? courseNameMap.byId : null;
        const byFullName = courseNameMap && courseNameMap.byFullName instanceof Map ? courseNameMap.byFullName : null;

        if (byId && courseId && byId.has(courseId)) {
            const hitById = normalizeDevdevCourseText(byId.get(courseId) || '');
            if (hitById) return hitById;
        }

        if (byFullName && fullName && byFullName.has(fullName)) {
            const hitByName = normalizeDevdevCourseText(byFullName.get(fullName) || '');
            if (hitByName) return hitByName;
        }

        return preferShortFallback
            ? (shortOrCurrentName || fullName)
            : (fullName || shortOrCurrentName);
    }

    function makeShortCourseCacheNameKey(name) {
        const normalized = normalizeDevdevCourseText(name);
        return normalized ? `name::${normalized}` : '';
    }

    function makeShortCourseCacheIdKey(courseId) {
        const normalized = (courseId || '').trim();
        return normalized ? `id::${normalized}` : '';
    }

    function putShortCourseCache(cache, { courseId = '', sourceName = '', shortName = '', overwrite = true } = {}) {
        if (!cache || typeof cache !== 'object') return;
        const short = normalizeDevdevCourseText(shortName);
        if (!short) return;

        const idKey = makeShortCourseCacheIdKey(courseId);
        if (idKey) {
            if (overwrite || !cache[idKey]) {
                cache[idKey] = short;
            }
        }

        const nameKey = makeShortCourseCacheNameKey(sourceName);
        if (nameKey) {
            if (overwrite || !cache[nameKey]) {
                cache[nameKey] = short;
            }
        }
    }

    function getShortCourseFromCache(cache, courseId, nameCandidates = []) {
        if (!cache || typeof cache !== 'object') return '';
        const canonicalize = (value) => normalizeDevdevCourseText(value).replace(/\s+/g, '');
        const normalizedCandidates = Array.from(new Set(
            (nameCandidates || [])
                .map(name => canonicalize(name))
                .filter(Boolean)
        ));

        const pickCached = (value) => {
            if (typeof value !== 'string' || !value.trim()) return '';
            const normalized = normalizeDevdevCourseText(value);
            if (!normalized) return '';
            // Ignore stale entries that are identical to known original names.
            if (normalizedCandidates.includes(canonicalize(normalized))) return '';
            return normalized;
        };

        const idKey = makeShortCourseCacheIdKey(courseId);
        if (idKey) {
            const byId = pickCached(cache[idKey]);
            if (byId) return byId;
        }
        for (const name of nameCandidates) {
            const nameKey = makeShortCourseCacheNameKey(name);
            if (!nameKey) continue;
            const byName = pickCached(cache[nameKey]);
            if (byName) return byName;
        }
        return '';
    }

    async function collectDevdevCourseEntries() {
        const courseMap = new Map();
        const scheduleTables = document.querySelectorAll('table.schedule-table, table.ux-dashboard-v2-schedule-table');

        scheduleTables.forEach((table) => {
            const links = table.querySelectorAll('a[href*="course.php"]');
            links.forEach((link) => {
                const href = link.getAttribute('href') || '';
                const courseId = extractCourseIdFromUrl(href);
                const displayName = normalizeDevdevCourseText(link.textContent);
                const fullName = normalizeDevdevCourseText(link.dataset.originalText || displayName);
                const resolvedDisplay = displayName || (fullName ? fallbackCourseName(fullName) : '');
                if (!resolvedDisplay) return;

                const key = courseId || resolvedDisplay;
                if (courseMap.has(key)) return;
                let absoluteUrl = href;
                try {
                    absoluteUrl = new URL(href, window.location.href).href;
                } catch {
                    // keep raw href
                }
                courseMap.set(key, {
                    courseId,
                    displayName: resolvedDisplay,
                    fullName: fullName || resolvedDisplay,
                    courseUrl: absoluteUrl
                });
            });
        });

        if (courseMap.size === 0) {
            const assignments = await loadAssignments();
            assignments.forEach((todo) => {
                if (!todo || todo.isDeleted) return;
                const displayName = normalizeDevdevCourseText(todo.course);
                if (!displayName) return;
                const sourceUrl = todo.url || todo.fallbackUrl || '';
                const courseId = extractCourseIdFromUrl(sourceUrl);
                const key = courseId || displayName;
                if (courseMap.has(key)) return;
                courseMap.set(key, {
                    courseId,
                    displayName,
                    fullName: normalizeDevdevCourseText(todo.courseFullName || displayName),
                    courseUrl: sourceUrl
                });
            });
        }

        return Array.from(courseMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'));
    }

    function appendDevdevCourseTodoCreator(container, options = {}) {
        const { onAfterCreate = null } = options;

        const wrapper = document.createElement('div');
        wrapper.style.display = 'inline-flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '6px';
        wrapper.style.flexWrap = 'wrap';
        wrapper.style.padding = '4px 0';

        const label = document.createElement('span');
        label.textContent = '[devdev] コースTODO';
        label.style.fontSize = '0.75em';
        label.style.color = '#555';
        wrapper.appendChild(label);

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.value = '確認用リマインダー';
        titleInput.style.fontSize = '0.75em';
        titleInput.style.padding = '2px 4px';
        titleInput.style.border = '1px solid #ccc';
        titleInput.style.borderRadius = '4px';
        titleInput.style.width = '16ch';
        titleInput.title = '作成するTODOのタイトル（各コースに作成）';
        wrapper.appendChild(titleInput);

        let selectedDeadline = null;

        const deadlineInput = document.createElement('input');
        deadlineInput.type = 'text';
        deadlineInput.readOnly = true;
        deadlineInput.value = '期限なし';
        deadlineInput.style.fontSize = '0.75em';
        deadlineInput.style.padding = '2px 4px';
        deadlineInput.style.border = '1px solid #ccc';
        deadlineInput.style.borderRadius = '4px';
        deadlineInput.style.width = '16ch';
        deadlineInput.style.cursor = 'pointer';
        deadlineInput.title = 'クリックで期限を設定（クリアで期限なし）';
        wrapper.appendChild(deadlineInput);

        const updateDeadlineDisplay = () => {
            deadlineInput.value = selectedDeadline ? selectedDeadline.toLocaleString('ja-JP') : '期限なし';
        };

        const openDeadlinePicker = (event) => {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            openDatetimePopover(deadlineInput, {
                initialDate: selectedDeadline || getWebClassNow(),
                onCommit: async (date) => {
                    selectedDeadline = date ? new Date(date.getTime()) : null;
                    updateDeadlineDisplay();
                },
                onClear: async () => {
                    selectedDeadline = null;
                    updateDeadlineDisplay();
                }
            });
        };

        deadlineInput.addEventListener('click', openDeadlinePicker);
        deadlineInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                openDeadlinePicker(event);
            }
        });

        const createBtn = document.createElement('button');
        createBtn.textContent = '+ 各コース';
        createBtn.style.fontSize = '0.75em';
        createBtn.style.padding = '2px 5px';
        createBtn.style.cursor = 'pointer';
        createBtn.title = '時間割の各コースに [devdev] タグ付きTODOを一括作成';
        wrapper.appendChild(createBtn);

        const status = document.createElement('span');
        status.style.fontSize = '0.7em';
        status.style.color = '#666';
        wrapper.appendChild(status);

        createBtn.onclick = async () => {
            createBtn.disabled = true;
            status.textContent = '作成中...';
            try {
                const courses = await collectDevdevCourseEntries();
                if (!courses.length) {
                    status.textContent = 'コースが見つかりません';
                    return;
                }

                const titleBase = titleInput.value.trim() || '確認用リマインダー';
                const deadlineValue = selectedDeadline ? selectedDeadline.toLocaleString() : '期限なし';
                const originalDeadlineValue = selectedDeadline ? deadlineValue : null;
                const current = await loadAssignments();
                const now = Date.now();

                courses.forEach((course, index) => {
                    const uniqueId = `${now}_${index}_${Math.random().toString(36).slice(2, 8)}`;
                    const debugUrl = course.courseId
                        ? `debug://course.php/${course.courseId}/todo/${uniqueId}`
                        : `debug://todo/${uniqueId}`;
                    current.push({
                        title: `[devdev] ${titleBase} (${course.displayName})`,
                        course: course.displayName,
                        courseFullName: course.fullName || course.displayName,
                        sourceTitle: `[devdev] ${titleBase} (${course.displayName})`,
                        titleEdited: false,
                        deadline: deadlineValue,
                        originalDeadline: originalDeadlineValue,
                        url: debugUrl,
                        fallbackUrl: course.courseUrl || '',
                        isCompleted: false,
                        isDeleted: false,
                        category: 'devdev',
                        localOnly: true
                    });
                });

                await saveAssignments(current);

                if (typeof onAfterCreate === 'function') {
                    await onAfterCreate(current);
                }
                status.textContent = `${courses.length}件作成`;
            } catch (error) {
                console.error('[WebClass UX] devdev course todo create failed', error);
                status.textContent = '作成失敗';
            } finally {
                createBtn.disabled = false;
            }
        };

        container.appendChild(wrapper);
    }

    function getCurrentClassOrder(now = getWebClassNow()) {
        const minutes = now.getHours() * 60 + now.getMinutes();
        for (const range of TIMETABLE_CLASS_ORDER_RANGES) {
            if (minutes >= range.start && minutes < range.end) {
                return range.order;
            }
        }
        return null;
    }

    function getWeekdayIndexFromHeaderText(text) {
        const normalized = String(text || '').replace(/\s+/g, '').toLowerCase();
        if (!normalized) return -1;

        const japaneseWeekdayPatterns = [
            /^日(?:曜(?:日)?)?$/,
            /^月(?:曜(?:日)?)?$/,
            /^火(?:曜(?:日)?)?$/,
            /^水(?:曜(?:日)?)?$/,
            /^木(?:曜(?:日)?)?$/,
            /^金(?:曜(?:日)?)?$/,
            /^土(?:曜(?:日)?)?$/
        ];

        for (let i = 0; i < japaneseWeekdayPatterns.length; i++) {
            if (japaneseWeekdayPatterns[i].test(normalized)) {
                return i;
            }
        }

        const englishWeekdayPatterns = [
            /^sun(?:day)?$/,
            /^mon(?:day)?$/,
            /^tue(?:s|sday)?$/,
            /^wed(?:nesday)?$/,
            /^thu(?:rs|rsday)?$/,
            /^fri(?:day)?$/,
            /^sat(?:urday)?$/
        ];

        for (let i = 0; i < englishWeekdayPatterns.length; i++) {
            if (englishWeekdayPatterns[i].test(normalized)) {
                return i;
            }
        }

        return -1;
    }

    function shouldAlwaysKeepDashboardWeekdayColumn(headerCell) {
        const weekdayIndex = getWeekdayIndexFromHeaderText(headerCell?.textContent);
        return weekdayIndex >= 1 && weekdayIndex <= 5;
    }

    function getTimetableClassOrderFromRow(row) {
        if (!row) return null;

        const dataOrder = Number(row.dataset?.class_order);
        if (Number.isFinite(dataOrder) && dataOrder > 0) {
            return dataOrder;
        }

        const periodCell = row.querySelector('td.schedule-table-class_order, th.schedule-table-class_order, td, th');
        const match = periodCell?.textContent?.match(/(\d+)/);
        if (!match) return null;

        const parsed = Number(match[1]);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function shouldAlwaysKeepDashboardPeriodRow(row) {
        const classOrder = getTimetableClassOrderFromRow(row);
        return classOrder >= 1 && classOrder <= 5;
    }

    function getTodayColumnIndex(scheduleTable, now = getWebClassNow()) {
        const headerCells = scheduleTable.querySelectorAll('thead th');
        if (!headerCells.length) return -1;
        const todayWeekdayIndex = now.getDay();
        for (let i = 0; i < headerCells.length; i++) {
            const headerWeekdayIndex = getWeekdayIndexFromHeaderText(headerCells[i].textContent);
            if (headerWeekdayIndex === todayWeekdayIndex) {
                return i;
            }
        }
        return -1;
    }

    function clearTimetableHighlightClasses(scheduleTable) {
        const selector = TIMETABLE_HIGHLIGHT_CLASSES.map(name => `.${name}`).join(',');
        if (!selector) return;
        scheduleTable.querySelectorAll(selector).forEach(el => {
            el.classList.remove(...TIMETABLE_HIGHLIGHT_CLASSES);
        });
    }

    function applyTimetableDayTimeHighlight(scheduleTable) {
        if (!scheduleTable) return;

        clearTimetableHighlightClasses(scheduleTable);

        const todayIndex = getTodayColumnIndex(scheduleTable);
        const headerCells = scheduleTable.querySelectorAll('thead th');
        const bodyRows = scheduleTable.querySelectorAll('tbody tr');
        if (todayIndex < 1) {
            headerCells.forEach((cell, index) => {
                if (index === 0) return;
                cell.classList.add('ux-timetable-day-muted');
            });
            bodyRows.forEach(row => {
                const cells = row.querySelectorAll('td');
                cells.forEach((cell, index) => {
                    if (index === 0) return;
                    cell.classList.add('ux-timetable-day-muted');
                });
            });
            return;
        }

        headerCells.forEach((cell, index) => {
            if (index === 0) return;
            if (index === todayIndex) {
                cell.classList.add('ux-timetable-day-today');
            } else {
                cell.classList.add('ux-timetable-day-muted');
            }
        });

        bodyRows.forEach(row => {
            const cells = row.querySelectorAll('td');
            cells.forEach((cell, index) => {
                if (index === 0) return;
                if (index === todayIndex) {
                    cell.classList.add('ux-timetable-day-today');
                } else {
                    cell.classList.add('ux-timetable-day-muted');
                }
            });
        });

        const currentOrder = getCurrentClassOrder();
        if (!currentOrder) return;

        const currentRow = scheduleTable.querySelector(`tbody tr[data-class_order="${currentOrder}"]`);
        if (!currentRow) return;

        const currentCells = currentRow.querySelectorAll('td');
        if (currentCells[todayIndex]) {
            currentCells[todayIndex].classList.add('ux-timetable-current-slot');
        }
    }

    function applyTimetableDayTimeHighlightAll() {
        const tables = document.querySelectorAll(
            'table.schedule-table, table.ux-dashboard-v2-schedule-table'
        );
        tables.forEach(table => applyTimetableDayTimeHighlight(table));
    }

    function startTimetableHighlightTimer() {
        const timerKey = '__uxTimetableHighlightTimer';
        applyTimetableDayTimeHighlightAll();
        if (window[timerKey]) return;
        window[timerKey] = window.setInterval(() => {
            applyTimetableDayTimeHighlightAll();
        }, 60 * 1000);
    }

    loadDebugTimeState();
    onUxDebugModeChange((enabled) => {
        if (enabled) return;
        void refreshTimeSensitiveUI();
    });

    if (!window.devdevSetWebClassTime) {
        window.devdevSetWebClassTime = async (value) => {
            if (!uxIsDebugModeEnabled()) return getWebClassDebugTimeState();
            const ok = setWebClassDebugTime(value);
            if (ok) await refreshTimeSensitiveUI();
            return getWebClassDebugTimeState();
        };
        window.devdevClearWebClassTime = async () => {
            if (!uxIsDebugModeEnabled()) return getWebClassDebugTimeState();
            clearWebClassDebugTime();
            await refreshTimeSensitiveUI();
            return getWebClassDebugTimeState();
        };
        window.devdevGetWebClassTime = () => getWebClassDebugTimeState();
    }

    // --- UI Helpers ---
    // --- Data Logic ---

    function normalizeMsTodoReminderDaysBefore(value, fallback = MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE) {
        const parsed = parseInt(value, 10);
        if (Number.isNaN(parsed)) return fallback;
        return Math.min(7, Math.max(0, parsed));
    }

    function normalizeMsTodoReminderTimeMode(value, fallback = MS_TODO_REMINDER_TIME_MODE_AT_9AM) {
        return value === MS_TODO_REMINDER_TIME_MODE_EXACT_OFFSET
            ? MS_TODO_REMINDER_TIME_MODE_EXACT_OFFSET
            : fallback;
    }

    async function loadMsTodoReminderSettings() {
        const data = await chrome.storage.local.get({
            [STORAGE_KEY_TODO_API_PROVIDER]: 'none',
            [STORAGE_KEY_MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE]: MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE,
            [STORAGE_KEY_MS_TODO_DEFAULT_REMINDER_TIME_MODE]: MS_TODO_REMINDER_TIME_MODE_AT_9AM
        });
        return {
            provider: data[STORAGE_KEY_TODO_API_PROVIDER] || 'none',
            defaultDaysBefore: normalizeMsTodoReminderDaysBefore(
                data[STORAGE_KEY_MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE],
                MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE
            ),
            defaultTimeMode: normalizeMsTodoReminderTimeMode(
                data[STORAGE_KEY_MS_TODO_DEFAULT_REMINDER_TIME_MODE],
                MS_TODO_REMINDER_TIME_MODE_AT_9AM
            )
        };
    }

    function buildMsTodoReminderConfig(todo, reminderSettings) {
        const defaultDaysBefore = normalizeMsTodoReminderDaysBefore(
            reminderSettings?.defaultDaysBefore,
            MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE
        );
        const defaultTimeMode = normalizeMsTodoReminderTimeMode(
            reminderSettings?.defaultTimeMode,
            MS_TODO_REMINDER_TIME_MODE_AT_9AM
        );
        return {
            enabled: todo?.msTodoReminderEnabled !== false,
            daysBefore: normalizeMsTodoReminderDaysBefore(todo?.msTodoReminderDaysBefore, defaultDaysBefore),
            timeMode: normalizeMsTodoReminderTimeMode(todo?.msTodoReminderTimeMode, defaultTimeMode)
        };
    }

    function formatMsTodoReminderDaysBefore(daysBefore) {
        if (daysBefore <= 0) return '当日';
        if (daysBefore === 7) return '1週間前';
        return `${daysBefore}日前`;
    }

    function formatMsTodoReminderSummary(reminderConfig) {
        if (!reminderConfig || reminderConfig.enabled === false) {
            return '通知オフ';
        }
        const whenText = formatMsTodoReminderDaysBefore(reminderConfig.daysBefore);
        const modeText = reminderConfig.timeMode === MS_TODO_REMINDER_TIME_MODE_EXACT_OFFSET
            ? '期限から24h×日前'
            : '選択日の9:00';
        return `${whenText} / ${modeText}`;
    }

    function setMsReminderButtonIcon(buttonEl, enabled) {
        if (!(buttonEl instanceof HTMLElement)) return;
        const iconSvg = enabled
            ? `
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M12 4c-3.3 0-6 2.7-6 6v3.8L4.8 16h14.4L18 13.8V10c0-3.3-2.7-6-6-6Z"></path>
                    <path d="M9.5 18.5a2.5 2.5 0 0 0 5 0"></path>
                </svg>
            `
            : `
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M12 4c-3.3 0-6 2.7-6 6v3.8L4.8 16h14.4L18 13.8V10c0-3.3-2.7-6-6-6Z"></path>
                    <path d="M9.5 18.5a2.5 2.5 0 0 0 5 0"></path>
                    <path d="M5 5l14 14"></path>
                </svg>
            `;
        buttonEl.innerHTML = iconSvg;
        buttonEl.classList.toggle('is-off', !enabled);
    }

    async function loadAssignments() {
        const data = await chrome.storage.local.get([STORAGE_KEY_ASSIGNMENTS]);
        return data[STORAGE_KEY_ASSIGNMENTS] || [];
    }

    async function saveAssignments(assignments) {
        await chrome.storage.local.set({ [STORAGE_KEY_ASSIGNMENTS]: assignments });
    }

    // --- Trash Bin (ゴミ箱) Functions ---
    // 削除されたタスクの識別子を独立ストレージに保存し、
    // 再スクレイピングでも復活しないようにする。
    let cachedTrashBin = [];

    async function loadTrashBin() {
        const data = await chrome.storage.local.get([STORAGE_KEY_TRASH]);
        cachedTrashBin = data[STORAGE_KEY_TRASH] || [];
        return cachedTrashBin;
    }

    async function saveTrashBin(trashBin) {
        cachedTrashBin = trashBin;
        await chrome.storage.local.set({ [STORAGE_KEY_TRASH]: trashBin });
    }

    async function addToTrash(todo) {
        await loadTrashBin();
        const identifier = todo.url || todo.fallbackUrl;
        if (!identifier) return;
        if (!cachedTrashBin.includes(identifier)) {
            cachedTrashBin.push(identifier);
            await saveTrashBin(cachedTrashBin);
        }
    }

    async function removeFromTrash(identifier) {
        await loadTrashBin();
        cachedTrashBin = cachedTrashBin.filter(id => id !== identifier);
        await saveTrashBin(cachedTrashBin);
    }

    function isInTrashBin(todo) {
        const identifier = todo.url || todo.fallbackUrl;
        if (!identifier) return false;
        return cachedTrashBin.includes(identifier);
    }

    function sendRuntimeMessage(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(response || null);
            });
        });
    }

    async function isTodoApiSyncEnabled() {
        const data = await chrome.storage.local.get({ [STORAGE_KEY_TODO_API_PROVIDER]: 'none' });
        return (data[STORAGE_KEY_TODO_API_PROVIDER] || 'none') !== 'none';
    }

    async function runTodoApiSync({ mode = 'full', trigger = 'manual', localMutation = null } = {}) {
        const enabled = await isTodoApiSyncEnabled();
        if (!enabled) return { success: true, skipped: true, reason: 'provider_disabled' };
        const response = await sendRuntimeMessage({
            type: 'TODO_API_RUN_SYNC',
            mode,
            trigger,
            localMutation
        });
        if (!response) {
            throw new Error('ToDo API sync returned no response.');
        }
        if (response.success === false) {
            throw new Error(response.error || 'ToDo API sync failed.');
        }
        return response;
    }

    function shouldTriggerTodoApiMutationSync(updates) {
        if (!updates || typeof updates !== 'object') return false;
        const keys = [
            'isCompleted',
            'title',
            'deadline',
            'isDeleted',
            'msTodoReminderEnabled',
            'msTodoReminderDaysBefore',
            'msTodoReminderTimeMode'
        ];
        return keys.some((key) => Object.prototype.hasOwnProperty.call(updates, key));
    }

    // 単一の課題を更新するヘルパー
    async function updateAssignment(targetTodo, updates, options = {}) {
        const waitForTodoApiSync = options.waitForTodoApiSync !== false;
        const currentAssignments = await loadAssignments();
        const identifier = targetTodo.url || targetTodo.fallbackUrl;

        const index = currentAssignments.findIndex(a => {
            if (!identifier) return false;
            if (a.url === identifier) return true;
            return a.fallbackUrl === identifier;
        });

        if (index !== -1) {
            // フィールドを更新
            const currentAssignment = currentAssignments[index];
            const normalizedUpdates = { ...updates };

            if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'title')) {
                const currentTitle = typeof currentAssignment.title === 'string' ? currentAssignment.title : '';
                const sourceTitle = typeof currentAssignment.sourceTitle === 'string' && currentAssignment.sourceTitle
                    ? currentAssignment.sourceTitle
                    : currentTitle;
                const nextTitle = typeof normalizedUpdates.title === 'string'
                    ? normalizedUpdates.title
                    : '';

                normalizedUpdates.titleEdited = nextTitle !== sourceTitle;
                if (!(typeof currentAssignment.sourceTitle === 'string' && currentAssignment.sourceTitle)) {
                    normalizedUpdates.sourceTitle = sourceTitle;
                }
            }

            currentAssignments[index] = { ...currentAssignment, ...normalizedUpdates };
            await saveAssignments(currentAssignments);
            uxDebugLog('Assignment updated:', currentAssignments[index]);
            if (shouldTriggerTodoApiMutationSync(normalizedUpdates)) {
                const syncPromise = runTodoApiSync({
                    mode: 'local_mutation',
                    trigger: 'local_update',
                    localMutation: {
                        localKey: identifier
                    }
                }).catch((syncError) => {
                    uxDebugWarn('[WebClass UX] todo mutation sync failed', syncError);
                });
                if (waitForTodoApiSync) {
                    await syncPromise;
                }
            }
        } else {
            uxDebugWarn('Assignment not found for update:', targetTodo);
        }
    }

    // --- Message Functions ---

    /**
     * acsパラメータを抽出する（URLまたはページ内リンクから）
     */
    function getAcsParameter() {
        // 1. まずURLのクエリパラメータから試す
        const urlParams = new URLSearchParams(window.location.search);
        let acs = urlParams.get('acs_');
        if (acs) return acs;

        // 2. ページ内のリンクから acs_ パラメータを探す
        const links = document.querySelectorAll('a[href*="acs_="]');
        for (const link of links) {
            const href = link.getAttribute('href');
            const match = href.match(/acs_=([a-zA-Z0-9]+)/);
            if (match) {
                uxDebugLog('[Messages] ページ内リンクから acs_ を取得:', match[1]);
                return match[1];
            }
        }

        // 3. フォームのhidden inputから探す
        const hiddenInput = document.querySelector('input[name="acs_"]');
        if (hiddenInput) {
            return hiddenInput.value;
        }

        return '';
    }

    /**
     * メッセージ一覧ページをフェッチして解析
     */
    async function fetchMessages() {
        const acs = getAcsParameter();
        if (!acs) {
            uxDebugWarn('[Messages] acs_ パラメータが見つかりません。ページ内にリンクがありません。');
            return { messages: [], unreadCount: 0, totalCount: 0, formAction: null, error: 'acs_not_found' };
        }

        const messageUrl = `https://kulms.kanagawa-u.ac.jp/webclass/msg_editor.php?msgappmode=inbox&acs_=${acs}`;
        uxDebugLog('[Messages] メッセージを取得中:', messageUrl);

        try {
            const response = await fetch(messageUrl);
            if (!response.ok) {
                uxDebugWarn('[Messages] HTTP error while fetching inbox', response.status);
                return { messages: [], unreadCount: 0, totalCount: 0, formAction: null, error: 'fetch_failed' };
            }

            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const messages = [];
            const rows = doc.querySelectorAll('#MsgListTable tbody tr');

            // フォームのaction URLを取得（既読処理用）
            const form = doc.querySelector('form[name="condition"]');
            const formAction = form ? form.getAttribute('action') : null;
            const numCboxes = doc.querySelector('input[name="num_cboxes"]')?.value || '0';

            rows.forEach((row, index) => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 6) return;

                // チェックボックスからメッセージIDを取得
                const checkbox = cells[0].querySelector('input[type="checkbox"]');
                const messageId = checkbox ? checkbox.value : null;

                // 差出人
                const senderCell = cells[1];
                const sender = senderCell.textContent.trim();

                // 件名
                const subjectCell = cells[3];
                const subjectLink = subjectCell.querySelector('a');
                const subject = subjectLink ? subjectLink.textContent.trim() : subjectCell.textContent.trim();
                const messageUrl = subjectLink ? subjectLink.href : null;

                // 日付
                const dateCell = cells[5];
                const date = dateCell.textContent.trim();

                // 未読判定（<b>タグで囲まれているかどうか）
                const isUnread = senderCell.querySelector('b') !== null;

                messages.push({
                    id: messageId,
                    sender: sender,
                    subject: subject,
                    date: date,
                    url: messageUrl,
                    isUnread: isUnread,
                    index: index
                });
            });

            const unreadCount = messages.filter(m => m.isUnread).length;
            uxDebugLog(`[Messages] 取得完了: 全${messages.length}件, 未読${unreadCount}件`);

            return {
                messages: messages,
                unreadCount: unreadCount,
                totalCount: messages.length,
                formAction: formAction,
                numCboxes: numCboxes,
                acs: acs
            };
        } catch (error) {
            uxDebugWarn('[Messages] inbox fetch failed', error);
            return { messages: [], unreadCount: 0, totalCount: 0, formAction: null, error: 'fetch_failed' };
        }
    }

    /**
     * 指定したメッセージを既読にする
     */
    async function markMessagesAsRead(messageIds, formAction, numCboxes, acs) {
        if (!formAction || messageIds.length === 0) {
            uxDebugWarn('[Messages] 既読にするメッセージがありません');
            return false;
        }

        uxDebugLog('[Messages] 既読処理開始:', messageIds);

        try {
            // FormDataを構築
            const formData = new FormData();

            // メッセージIDをチェックボックスとして追加
            messageIds.forEach((id, idx) => {
                formData.append(`id[${idx}]`, id);
            });

            formData.append('num_cboxes', messageIds.length.toString());
            formData.append('UNSET_UNREADFLAG', '既読にする');

            const response = await fetch(formAction, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                uxDebugLog('[Messages] 既読処理成功');
                return true;
            } else {
                console.error('[Messages] 既読処理失敗:', response.status);
                return false;
            }
        } catch (error) {
            console.error('[Messages] 既読処理エラー:', error);
            return false;
        }
    }

    /**
     * メッセージウインドウをレンダリング
     */
    function renderMessageWindow(container, messageData) {
        container.innerHTML = '';

        const { messages, unreadCount, formAction, numCboxes, acs, error } = messageData;

        // エラー時の表示
        if (error === 'acs_not_found') {
            const errDiv = document.createElement('div');
            errDiv.style.padding = '20px';
            errDiv.style.textAlign = 'center';
            errDiv.style.color = 'var(--ux-home-warning-foreground)';
            errDiv.style.backgroundColor = 'var(--ux-home-warning-soft)';
            errDiv.style.borderRadius = '4px';
            errDiv.innerHTML = 'セッション情報が取得できませんでした。<br><small>ページを再読み込みしてください。</small>';
            container.appendChild(errDiv);
            return;
        }

        if (messages.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'メッセージがありません';
            empty.style.padding = '20px';
            empty.style.textAlign = 'center';
            empty.style.color = 'var(--ux-home-secondary-label)';
            container.appendChild(empty);
            return;
        }

        // 未読メッセージ OR 今既読にしたメッセージを表示
        const displayMessages = messages.filter(m => m.isUnread || m.justRead);

        if (displayMessages.length === 0) {
            const allRead = document.createElement('div');
            allRead.textContent = '✓ 未読メッセージはありません';
            allRead.style.padding = '20px';
            allRead.style.textAlign = 'center';
            allRead.style.color = 'var(--ux-home-success-foreground)';
            container.appendChild(allRead);
            return;
        }

        // メッセージリスト
        const ul = document.createElement('ul');
        ul.style.listStyle = 'none';
        ul.style.margin = '0';
        ul.style.padding = '0';

        displayMessages.forEach(msg => {
            const li = document.createElement('li');
            li.style.padding = '10px 15px';
            li.style.borderBottom = '1px solid var(--ux-home-separator)';
            li.style.cursor = 'pointer';
            li.style.transition = 'background-color 0.2s';

            // 背景色: 未読=warning, 今既読にした=success
            if (msg.justRead) {
                li.style.backgroundColor = 'var(--ux-home-success-soft)';
                li.onmouseenter = () => { li.style.backgroundColor = 'rgba(52, 199, 89, 0.2)'; };
                li.onmouseleave = () => { li.style.backgroundColor = 'var(--ux-home-success-soft)'; };
            } else {
                li.style.backgroundColor = 'var(--ux-home-warning-soft)';
                li.onmouseenter = () => { li.style.backgroundColor = 'rgba(255, 159, 10, 0.22)'; };
                li.onmouseleave = () => { li.style.backgroundColor = 'var(--ux-home-warning-soft)'; };
            }

            // 差出人
            const senderLine = document.createElement('div');
            senderLine.style.fontSize = '0.8em';
            senderLine.style.color = 'var(--ux-home-secondary-label)';
            senderLine.style.marginBottom = '4px';
            senderLine.textContent = msg.sender;
            li.appendChild(senderLine);

            // 件名
            const subjectLine = document.createElement('div');
            subjectLine.style.fontWeight = msg.justRead ? 'normal' : 'bold'; // 既読は通常フォント
            subjectLine.style.color = 'var(--ux-home-label)';
            subjectLine.style.overflow = 'hidden';
            subjectLine.style.textOverflow = 'ellipsis';
            subjectLine.style.whiteSpace = 'nowrap';
            subjectLine.textContent = msg.justRead ? `✓ ${msg.subject}` : msg.subject;
            li.appendChild(subjectLine);

            // 日付
            const dateLine = document.createElement('div');
            dateLine.style.fontSize = '0.75em';
            dateLine.style.color = 'var(--ux-home-tertiary-label)';
            dateLine.style.marginTop = '4px';
            dateLine.textContent = msg.date;
            li.appendChild(dateLine);

            // クリックでメッセージを開く
            li.onclick = () => {
                if (msg.url) {
                    window.open(msg.url, 'msgeditor', 'width=800,height=600,scrollbars=yes,resizable=yes');
                }
            };

            ul.appendChild(li);
        });

        container.appendChild(ul);
    }

    function getTodoPriority(todo) {
        if (todo.isCompleted) return 'Done';
        const now = getWebClassNow();
        const deadline = todo.deadline && todo.deadline !== '期限なし' ? new Date(todo.deadline) : null;
        if (!deadline || isNaN(deadline.getTime())) return 'Low';
        if (deadline < now) return 'High';
        const hours = (deadline - now) / (1000 * 60 * 60);
        if (hours <= 48) return 'High';
        if (hours <= 168) return 'Medium';
        return 'Low';
    }

    function sortTodos(todos) {
        return todos.sort((a, b) => {
            // 1. 未完了を上に
            if (a.isCompleted !== b.isCompleted) {
                return a.isCompleted ? 1 : -1;
            }

            // 2. リマインダー期限切れ（紫）を最優先（赤よりも上）
            if (a._isReminderExpired !== b._isReminderExpired) {
                return a._isReminderExpired ? -1 : 1;
            }

            // 3. 期限が近い順 (期限なしは後ろ)
            const dateA = a.deadline ? new Date(a.deadline) : new Date(8640000000000000);
            const dateB = b.deadline ? new Date(b.deadline) : new Date(8640000000000000);

            if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
            if (isNaN(dateA.getTime())) return 1;
            if (isNaN(dateB.getTime())) return -1;

            return dateA - dateB;
        });
    }

    let uxActiveDatetimePopover = null;
    let uxActiveDatetimeAnchor = null;
    let uxActiveDatetimeCleanup = null;
    let uxActiveDatetimeOnClose = null;
    let uxActiveReminderPopover = null;
    let uxActiveReminderAnchor = null;
    let uxActiveReminderCleanup = null;
    let uxTodoTitleAutoScrollCleanups = [];
    const UX_TODO_TITLE_SCROLL_START_DELAY_MS = 500;
    const UX_TODO_TITLE_SCROLL_RESET_PAUSE_MS = 700;
    const UX_TODO_TITLE_SCROLL_TRAVERSE_MS = 3200;
    let uxTodoTitleScrollControllerSeq = 0;
    const uxTodoTitleScrollControllers = new Map();

    function closeDatetimePopover() {
        const onClose = uxActiveDatetimeOnClose;
        uxActiveDatetimeOnClose = null;
        if (uxActiveDatetimeCleanup) {
            uxActiveDatetimeCleanup();
        }
        if (uxActiveDatetimePopover && uxActiveDatetimePopover.remove) {
            uxActiveDatetimePopover.remove();
        }
        uxActiveDatetimePopover = null;
        uxActiveDatetimeAnchor = null;
        uxActiveDatetimeCleanup = null;
        if (typeof onClose === 'function') {
            onClose();
        }
    }

    function closeReminderPopover() {
        if (uxActiveReminderCleanup) {
            uxActiveReminderCleanup();
        }
        if (uxActiveReminderPopover && uxActiveReminderPopover.remove) {
            uxActiveReminderPopover.remove();
        }
        uxActiveReminderPopover = null;
        uxActiveReminderAnchor = null;
        uxActiveReminderCleanup = null;
    }

    function cleanupTodoTitleAutoScroll() {
        if (!Array.isArray(uxTodoTitleAutoScrollCleanups) || uxTodoTitleAutoScrollCleanups.length === 0) {
            return;
        }
        uxTodoTitleAutoScrollCleanups.forEach((cleanup) => {
            if (typeof cleanup === 'function') {
                cleanup();
            }
        });
        uxTodoTitleAutoScrollCleanups = [];
        uxTodoTitleScrollControllers.clear();
    }

    function getTodoTitleScrollEligibleControllers() {
        const eligible = [];
        uxTodoTitleScrollControllers.forEach((controller) => {
            if (!controller || typeof controller.canParticipate !== 'function') return;
            if (controller.canParticipate()) {
                eligible.push(controller);
            }
        });
        return eligible;
    }

    function reportTodoTitleReachedRight(controllerId) {
        const reporter = uxTodoTitleScrollControllers.get(controllerId);
        if (!reporter) return false;
        if (typeof reporter.setReachedRight === 'function') {
            reporter.setReachedRight(true);
        }

        const eligible = getTodoTitleScrollEligibleControllers();
        if (eligible.length === 0) return false;

        const allReached = eligible.every((controller) => {
            if (typeof controller.getReachedRight !== 'function') return false;
            return !!controller.getReachedRight();
        });
        if (!allReached) return false;

        eligible.forEach((controller) => {
            if (typeof controller.setReachedRight === 'function') {
                controller.setReachedRight(false);
            }
        });
        eligible.forEach((controller) => {
            if (typeof controller.startBurst === 'function') {
                controller.startBurst();
            }
        });
        return true;
    }

    function attachTodoTitleAutoScroll(inputEl) {
        if (!(inputEl instanceof HTMLInputElement)) return null;

        const controllerId = `ux-todo-title-scroll-${++uxTodoTitleScrollControllerSeq}`;
        let rafId = null;
        let burstRafId = null;
        let startTimer = null;
        let burstTimer = null;
        let burstSessionSeq = 0;
        let burstStyleSnapshot = null;
        let burstOverlayEl = null;
        let burstOverlayParent = null;
        let burstParentPositionSnapshot = null;
        let lastTime = 0;
        let currentOffset = 0;
        let mode = 'normal'; // normal | waiting | burst
        let reachedRightInRound = false;

        const parsePx = (value) => {
            const parsed = parseFloat(value);
            return Number.isFinite(parsed) ? parsed : 0;
        };

        const measureTextWidth = (sourceText = null) => {
            const text = typeof sourceText === 'string' ? sourceText : (inputEl.value || '');
            if (!text) return 0;
            const style = window.getComputedStyle(inputEl);
            if (!style) return 0;
            // Shared canvas to avoid creating extra nodes for every title input.
            const sharedCanvas = attachTodoTitleAutoScroll.__measureCanvas
                || (attachTodoTitleAutoScroll.__measureCanvas = document.createElement('canvas'));
            const ctx = sharedCanvas.getContext('2d');
            if (!ctx) return 0;
            const fontStyle = style.fontStyle || 'normal';
            const fontVariant = style.fontVariant || 'normal';
            const fontWeight = style.fontWeight || '400';
            const fontSize = style.fontSize || '16px';
            const fontFamily = style.fontFamily || 'sans-serif';
            ctx.font = `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize} ${fontFamily}`;
            let width = ctx.measureText(text).width;
            const letterSpacing = parsePx(style.letterSpacing);
            if (letterSpacing) {
                width += letterSpacing * Math.max(0, text.length - 1);
            }
            return width;
        };

        const getMaxScroll = () => {
            const domMax = Math.max(0, inputEl.scrollWidth - inputEl.clientWidth);
            const style = window.getComputedStyle(inputEl);
            const horizontalPadding = parsePx(style.paddingLeft) + parsePx(style.paddingRight);
            const visibleTextWidth = Math.max(0, inputEl.clientWidth - horizontalPadding);
            const measuredMax = Math.max(0, Math.ceil(measureTextWidth() - visibleTextWidth));
            return Math.max(domMax, measuredMax);
        };

        const applyOffset = (offset, maxScroll = null) => {
            const max = Number.isFinite(maxScroll) ? Math.max(0, maxScroll) : getMaxScroll();
            const clamped = Math.max(0, Math.min(offset, max));
            currentOffset = clamped;
            inputEl.scrollLeft = clamped;
            return clamped;
        };

        const captureBurstStyleSnapshot = () => {
            if (burstStyleSnapshot) return;
            burstStyleSnapshot = {
                transition: inputEl.style.transition || '',
                transform: inputEl.style.transform || '',
                filter: inputEl.style.filter || '',
                opacity: inputEl.style.opacity || '',
                willChange: inputEl.style.willChange || ''
            };
        };

        const applyBurstStyle = ({ transition, transform, filter, opacity } = {}) => {
            captureBurstStyleSnapshot();
            if (typeof transition === 'string') {
                inputEl.style.transition = transition;
            }
            if (typeof transform === 'string') {
                inputEl.style.transform = transform;
            }
            if (typeof filter === 'string') {
                inputEl.style.filter = filter;
            }
            if (typeof opacity === 'number') {
                const clamped = Math.max(0, Math.min(1, opacity));
                inputEl.style.opacity = `${clamped}`;
            }
            inputEl.style.willChange = 'transform, filter, opacity';
        };

        const restoreBurstStyle = () => {
            if (!burstStyleSnapshot) return;
            inputEl.style.transition = burstStyleSnapshot.transition;
            inputEl.style.transform = burstStyleSnapshot.transform;
            inputEl.style.filter = burstStyleSnapshot.filter;
            inputEl.style.opacity = burstStyleSnapshot.opacity;
            inputEl.style.willChange = burstStyleSnapshot.willChange;
            burstStyleSnapshot = null;
        };

        const clearBurstOverlay = () => {
            if (burstOverlayEl && burstOverlayEl.parentElement) {
                burstOverlayEl.remove();
            }
            burstOverlayEl = null;
            if (burstOverlayParent && burstParentPositionSnapshot !== null) {
                burstOverlayParent.style.position = burstParentPositionSnapshot;
            }
            burstOverlayParent = null;
            burstParentPositionSnapshot = null;
        };

        const createBurstOverlay = () => {
            clearBurstOverlay();
            const parent = inputEl.parentElement;
            if (!parent) return;

            const parentStyle = window.getComputedStyle(parent);
            if (parentStyle.position === 'static') {
                burstParentPositionSnapshot = parent.style.position || '';
                parent.style.position = 'relative';
            }

            const overlay = document.createElement('div');
            overlay.className = 'ux-title-burst-overlay';
            overlay.style.top = `${inputEl.offsetTop}px`;
            overlay.style.left = `${inputEl.offsetLeft}px`;
            overlay.style.width = `${inputEl.offsetWidth}px`;
            overlay.style.height = `${inputEl.offsetHeight}px`;
            overlay.innerHTML = `
                <span class="ux-title-burst-beam"></span>
                <span class="ux-title-burst-ring"></span>
                <span class="ux-title-burst-spark" style="--ux-spark-x: 66%; --ux-spark-y: -10px; --ux-spark-delay: 24ms;"></span>
                <span class="ux-title-burst-spark" style="--ux-spark-x: 42%; --ux-spark-y: 12px; --ux-spark-delay: 60ms;"></span>
                <span class="ux-title-burst-spark" style="--ux-spark-x: 88%; --ux-spark-y: 4px; --ux-spark-delay: 84ms;"></span>
            `;

            parent.appendChild(overlay);
            burstOverlayParent = parent;
            burstOverlayEl = overlay;
        };

        const clearTimers = () => {
            if (startTimer !== null) {
                window.clearTimeout(startTimer);
                startTimer = null;
            }
            if (burstTimer !== null) {
                window.clearTimeout(burstTimer);
                burstTimer = null;
            }
        };

        const stop = (resetScroll = false) => {
            clearTimers();
            burstSessionSeq += 1;
            if (rafId !== null) {
                window.cancelAnimationFrame(rafId);
                rafId = null;
            }
            if (burstRafId !== null) {
                window.cancelAnimationFrame(burstRafId);
                burstRafId = null;
            }
            lastTime = 0;
            restoreBurstStyle();
            clearBurstOverlay();
            if (resetScroll) {
                applyOffset(0, 0);
            }
        };

        const isRunnable = () => (
            document.body.contains(inputEl) &&
            document.visibilityState === 'visible' &&
            document.activeElement !== inputEl
        );

        const canParticipate = () => isRunnable() && getMaxScroll() > 1;

        const queueNextFrame = () => {
            if (!isRunnable()) {
                stop(false);
                return;
            }
            const maxScroll = getMaxScroll();
            if (maxScroll <= 1) {
                stop(true);
                return;
            }
            rafId = window.requestAnimationFrame(step);
        };

        const enterBurstMode = () => {
            if (!canParticipate()) return;
            mode = 'burst';
            stop(false);
            mode = 'burst';
            const sessionId = ++burstSessionSeq;

            const isBurstSessionAlive = () => (
                mode === 'burst' &&
                sessionId === burstSessionSeq &&
                isRunnable()
            );

            const maxScroll = getMaxScroll();
            if (maxScroll <= 1) {
                mode = 'normal';
                return;
            }

            const startScroll = Math.max(0, Math.min(Math.max(currentOffset, maxScroll), maxScroll));
            applyOffset(startScroll, maxScroll);

            const HOLD_DURATION = 90;
            const WARP_DURATION = 620;
            const SETTLE_DURATION = 260;
            const LOOP_PAUSE = UX_TODO_TITLE_SCROLL_RESET_PAUSE_MS;

            const easeOutExpo = (value) => {
                if (value >= 1) return 1;
                return 1 - Math.pow(2, -10 * value);
            };
            const easeOutBack = (value) => {
                const c1 = 1.70158;
                const c3 = c1 + 1;
                const x = value - 1;
                return 1 + (c3 * x * x * x) + (c1 * x * x);
            };

            createBurstOverlay();
            applyBurstStyle({
                transition: 'none',
                opacity: 1,
                transform: 'translateX(0px) scaleX(1)',
                filter: 'brightness(1) saturate(1)'
            });

            const finalizeBurst = () => {
                burstRafId = null;
                restoreBurstStyle();
                clearBurstOverlay();

                if (!isRunnable()) {
                    mode = 'normal';
                    return;
                }

                mode = 'normal';
                lastTime = 0;
                reachedRightInRound = false;
                startTimer = window.setTimeout(() => {
                    startTimer = null;
                    if (!isRunnable()) return;
                    if (getMaxScroll() <= 1) {
                        stop(true);
                        return;
                    }
                    queueNextFrame();
                }, LOOP_PAUSE);
            };

            const startSettle = () => {
                let settleStart = null;
                const animateSettle = (timestamp) => {
                    if (!isBurstSessionAlive()) {
                        stop(false);
                        return;
                    }
                    if (!settleStart) settleStart = timestamp;
                    const elapsed = timestamp - settleStart;
                    const progress = Math.min(1, elapsed / SETTLE_DURATION);
                    const eased = easeOutBack(progress);
                    const overshootShift = (1 - eased) * 5;
                    const wobble = Math.sin(progress * Math.PI * 3) * (1 - progress) * 1.8;
                    const scaleX = 1 + ((1 - progress) * 0.015);
                    const brightness = 1 + ((1 - progress) * 0.1);
                    const saturate = 1 + ((1 - progress) * 0.15);

                    applyOffset(0, 0);
                    applyBurstStyle({
                        transition: 'none',
                        opacity: 1,
                        transform: `translateX(${(overshootShift + wobble).toFixed(3)}px) scaleX(${scaleX.toFixed(4)})`,
                        filter: `brightness(${brightness.toFixed(3)}) saturate(${saturate.toFixed(3)})`
                    });

                    if (progress < 1) {
                        burstRafId = window.requestAnimationFrame(animateSettle);
                        return;
                    }

                    finalizeBurst();
                };

                burstRafId = window.requestAnimationFrame(animateSettle);
            };

            const startWarp = () => {
                let warpStart = null;
                const animateWarp = (timestamp) => {
                    if (!isBurstSessionAlive()) {
                        stop(false);
                        return;
                    }
                    if (!warpStart) warpStart = timestamp;
                    const elapsed = timestamp - warpStart;
                    const progress = Math.min(1, elapsed / WARP_DURATION);
                    const eased = easeOutExpo(progress);
                    const nextScroll = startScroll * (1 - eased);
                    const jitter = Math.sin(progress * 24) * (1 - progress) * 2.6;
                    const scaleX = 1 + (Math.sin(progress * Math.PI) * 0.08);
                    const skewX = (1 - progress) * 1.8;
                    const blur = (1 - progress) * 1.2;
                    const brightness = 1.3 - (0.25 * progress);
                    const saturate = 1.8 - (0.6 * progress);
                    const opacity = 0.84 + (0.16 * progress);

                    applyOffset(nextScroll, maxScroll);
                    applyBurstStyle({
                        transition: 'none',
                        opacity,
                        transform: `translateX(${jitter.toFixed(3)}px) scaleX(${scaleX.toFixed(4)}) skewX(${skewX.toFixed(3)}deg)`,
                        filter: `brightness(${brightness.toFixed(3)}) saturate(${saturate.toFixed(3)}) blur(${blur.toFixed(3)}px)`
                    });

                    if (progress < 1) {
                        burstRafId = window.requestAnimationFrame(animateWarp);
                        return;
                    }

                    applyOffset(0, 0);
                    burstRafId = null;
                    startSettle();
                };

                burstRafId = window.requestAnimationFrame(animateWarp);
            };

            burstTimer = window.setTimeout(() => {
                burstTimer = null;
                if (!isBurstSessionAlive()) {
                    stop(false);
                    return;
                }
                startWarp();
            }, HOLD_DURATION);
        };

        const step = (timestamp) => {
            if (!isRunnable()) {
                stop(false);
                return;
            }

            const maxScroll = getMaxScroll();
            if (maxScroll <= 1) {
                stop(true);
                return;
            }

            if (!lastTime) {
                lastTime = timestamp;
                queueNextFrame();
                return;
            }
            const elapsed = Math.max(0, timestamp - lastTime);
            lastTime = timestamp;
            if (elapsed <= 0) {
                queueNextFrame();
                return;
            }
            if (mode !== 'normal') {
                stop(false);
                return;
            }
            const traverseMs = Math.max(1, UX_TODO_TITLE_SCROLL_TRAVERSE_MS);
            const deltaPx = (elapsed / traverseMs) * maxScroll;

            if (currentOffset > maxScroll) {
                applyOffset(maxScroll, maxScroll);
            }

            let nextScroll = currentOffset + deltaPx;
            if (nextScroll >= maxScroll) {
                applyOffset(maxScroll, maxScroll);
                reachedRightInRound = true;
                const allReached = reportTodoTitleReachedRight(controllerId);
                if (!allReached) {
                    mode = 'waiting';
                    stop(false);
                }
                return;
            }

            applyOffset(nextScroll, maxScroll);
            queueNextFrame();
        };

        const start = () => {
            stop(true);
            mode = 'normal';
            reachedRightInRound = false;
            if (!isRunnable()) return;
            if (getMaxScroll() <= 1) return;
            startTimer = window.setTimeout(() => {
                startTimer = null;
                if (!isRunnable()) return;
                if (getMaxScroll() <= 1) return;
                lastTime = 0;
                queueNextFrame();
            }, UX_TODO_TITLE_SCROLL_START_DELAY_MS);
        };

        const handleFocus = () => {
            stop(true);
            mode = 'normal';
            reachedRightInRound = false;
        };
        const handleBlur = () => start();
        const handleChange = () => start();
        const handleResize = () => start();
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                start();
            } else {
                stop(false);
            }
        };

        uxTodoTitleScrollControllers.set(controllerId, {
            id: controllerId,
            canParticipate,
            getReachedRight: () => reachedRightInRound,
            setReachedRight: (value) => {
                reachedRightInRound = !!value;
            },
            startBurst: () => {
                enterBurstMode();
            }
        });

        inputEl.addEventListener('focus', handleFocus);
        inputEl.addEventListener('blur', handleBlur);
        inputEl.addEventListener('change', handleChange);
        window.addEventListener('resize', handleResize);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        window.requestAnimationFrame(() => {
            start();
        });

        return () => {
            stop(false);
            inputEl.removeEventListener('focus', handleFocus);
            inputEl.removeEventListener('blur', handleBlur);
            inputEl.removeEventListener('change', handleChange);
            window.removeEventListener('resize', handleResize);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            uxTodoTitleScrollControllers.delete(controllerId);
        };
    }

    function createTimeWheelColumn(values, initialIndex, onChange, options = {}) {
        const wheel = document.createElement('div');
        wheel.className = 'ux-time-wheel';

        const { loopCount = 50 } = options;
        const cycleLength = values.length;
        const repeatCount = Math.max(1, loopCount);
        const centerOffset = cycleLength * Math.floor(repeatCount / 2);
        const renderValues = Array.from({ length: repeatCount }, () => values).flat();

        renderValues.forEach((value, index) => {
            const item = document.createElement('div');
            item.className = 'ux-time-wheel-item';
            item.textContent = value;
            item.dataset.index = index.toString();
            item.addEventListener('click', () => {
                scrollToIndex(index, 'smooth');
            });
            wheel.appendChild(item);
        });

        let itemHeight = 32;
        let ready = false;

        const syncItemHeight = () => {
            const cssValue = getComputedStyle(wheel).getPropertyValue('--ux-time-wheel-item');
            const parsed = parseFloat(cssValue);
            if (Number.isFinite(parsed) && parsed > 0) {
                itemHeight = parsed;
            }
        };

        const clampIndex = (index) => Math.min(renderValues.length - 1, Math.max(0, index));

        const scrollToIndex = (index, behavior = 'auto') => {
            const safeIndex = clampIndex(index);
            wheel.scrollTo({ top: safeIndex * itemHeight, behavior });
        };

        const normalizeIndex = (index) => {
            const mod = index % cycleLength;
            return mod < 0 ? mod + cycleLength : mod;
        };

        let scrollTimer = 0;
        wheel.addEventListener('scroll', () => {
            if (!ready) return;
            if (scrollTimer) {
                clearTimeout(scrollTimer);
            }
            scrollTimer = window.setTimeout(() => {
                const rawIndex = clampIndex(Math.round(wheel.scrollTop / itemHeight));
                const valueIndex = normalizeIndex(rawIndex);
                onChange(values[valueIndex], valueIndex);
                scrollToIndex(rawIndex, 'smooth');
            }, 80);
        }, { passive: true });

        requestAnimationFrame(() => {
            syncItemHeight();
            const startIndex = centerOffset + normalizeIndex(initialIndex);
            scrollToIndex(startIndex, 'auto');
            ready = true;
        });

        return { wheel, scrollToIndex };
    }

    function openDatetimePopover(anchorEl, options) {
        if (!anchorEl) return;
        if (uxActiveDatetimeAnchor === anchorEl && uxActiveDatetimePopover) {
            closeDatetimePopover();
            return;
        }

        closeDatetimePopover();
        closeReminderPopover();

        const {
            initialDate,
            onCommit,
            onClear,
            onClose
        } = options || {};

        const popover = document.createElement('div');
        popover.className = 'ux-datetime-popover';
        popover.setAttribute('role', 'dialog');
        popover.setAttribute('aria-label', '期限と時刻の設定');

        const panel = document.createElement('div');
        panel.className = 'ux-datetime-panel';
        popover.appendChild(panel);

        const calendarWrap = document.createElement('div');
        calendarWrap.className = 'ux-datetime-calendar';
        panel.appendChild(calendarWrap);

        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'text';
        hiddenInput.className = 'ux-datetime-hidden-input';
        calendarWrap.appendChild(hiddenInput);

        const timeWrap = document.createElement('div');
        timeWrap.className = 'ux-datetime-time';
        panel.appendChild(timeWrap);

        const wheelShell = document.createElement('div');
        wheelShell.className = 'ux-time-wheel-shell';
        timeWrap.appendChild(wheelShell);

        const wheelRoot = document.createElement('div');
        wheelRoot.className = 'ux-time-wheel-root';
        wheelShell.appendChild(wheelRoot);

        const wheelColumns = document.createElement('div');
        wheelColumns.className = 'ux-time-wheel-columns';
        wheelRoot.appendChild(wheelColumns);

        const highlight = document.createElement('div');
        highlight.className = 'ux-time-wheel-highlight';
        wheelRoot.appendChild(highlight);

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'ux-datetime-clear';
        clearBtn.textContent = '期限なし';
        timeWrap.appendChild(clearBtn);

        let selectedDate = initialDate instanceof Date && !isNaN(initialDate.getTime())
            ? new Date(initialDate.getTime())
            : null;

        let selectedAmpm = 'AM';
        let selectedHour = '12';
        let selectedMinute = '00';

        if (selectedDate) {
            const hours = selectedDate.getHours();
            const minutes = selectedDate.getMinutes();
            selectedAmpm = hours >= 12 ? 'PM' : 'AM';
            const hour12 = hours % 12 || 12;
            selectedHour = hour12.toString();
            selectedMinute = minutes < 10 ? `0${minutes}` : `${minutes}`;
        }

        const commitSelection = async () => {
            if (!selectedDate) return;
            const hour12 = parseInt(selectedHour, 10);
            const minute = parseInt(selectedMinute, 10);
            let hour24 = hour12 % 12;
            if (selectedAmpm === 'PM') hour24 += 12;
            if (selectedAmpm === 'AM' && hour12 === 12) hour24 = 0;
            const finalDate = new Date(
                selectedDate.getFullYear(),
                selectedDate.getMonth(),
                selectedDate.getDate(),
                hour24,
                minute,
                0,
                0
            );
            if (typeof onCommit === 'function') {
                await onCommit(finalDate);
            }
        };

        const hoursArr = [];
        for (let i = 1; i <= 12; i++) hoursArr.push(i.toString());
        const minutesArr = [];
        for (let i = 0; i < 60; i++) minutesArr.push(i < 10 ? `0${i}` : `${i}`);

        const ampmWheel = createTimeWheelColumn(
            ['AM', 'PM'],
            selectedAmpm === 'PM' ? 1 : 0,
            async (value) => {
                selectedAmpm = value;
                await commitSelection();
            },
            { loopCount: 1 }
        );

        const hourWheel = createTimeWheelColumn(
            hoursArr,
            Math.max(0, hoursArr.indexOf(selectedHour)),
            async (value) => {
                selectedHour = value;
                await commitSelection();
            },
            { loopCount: 50 }
        );

        const minuteWheel = createTimeWheelColumn(
            minutesArr,
            Math.max(0, minutesArr.indexOf(selectedMinute)),
            async (value) => {
                selectedMinute = value;
                await commitSelection();
            },
            { loopCount: 50 }
        );

        wheelColumns.appendChild(ampmWheel.wheel);
        wheelColumns.appendChild(hourWheel.wheel);

        const sep = document.createElement('div');
        sep.className = 'ux-time-wheel-sep';
        sep.textContent = ':';
        wheelColumns.appendChild(sep);

        wheelColumns.appendChild(minuteWheel.wheel);

        let fpInstance = null;
        const buildYearDropdown = (instance) => {
            if (!instance || !instance.currentYearElement || !instance.calendarContainer) return;

            const currentYear = instance.currentYear;
            const range = 10;
            const minYear = currentYear - range;
            const maxYear = currentYear + range;

            let yearSelect = instance.calendarContainer.querySelector('.ux-flatpickr-year-dropdown');
            if (!yearSelect) {
                yearSelect = document.createElement('select');
                yearSelect.className = 'ux-flatpickr-year-dropdown';
                yearSelect.setAttribute('aria-label', '年');
                yearSelect.addEventListener('change', () => {
                    const year = parseInt(yearSelect.value, 10);
                    if (!Number.isNaN(year)) {
                        instance.changeYear(year);
                    }
                });

                const parent = instance.currentYearElement.parentNode;
                if (parent) {
                    parent.replaceChild(yearSelect, instance.currentYearElement);
                    instance.currentYearElement = yearSelect;
                }
            }

            yearSelect.innerHTML = '';
            for (let y = minYear; y <= maxYear; y++) {
                const opt = document.createElement('option');
                opt.value = `${y}`;
                opt.textContent = `${y}`;
                if (y === currentYear) opt.selected = true;
                yearSelect.appendChild(opt);
            }
            yearSelect.value = `${currentYear}`;
        };

        try {
            if (typeof flatpickr !== 'undefined') {
                fpInstance = flatpickr(hiddenInput, {
                    locale: 'ja',
                    dateFormat: 'Y/m/d',
                    inline: true,
                    disableMobile: true,
                    defaultDate: selectedDate,
                    onReady: (selectedDates, dateStr, instance) => {
                        buildYearDropdown(instance);
                    },
                    onMonthChange: (selectedDates, dateStr, instance) => {
                        buildYearDropdown(instance);
                    },
                    onYearChange: (selectedDates, dateStr, instance) => {
                        buildYearDropdown(instance);
                    },
                    onChange: async (selectedDates) => {
                        if (!selectedDates || !selectedDates.length) {
                            selectedDate = null;
                            return;
                        }
                        selectedDate = new Date(selectedDates[0].getTime());
                        await commitSelection();
                    }
                });
            } else {
                uxDebugWarn('WebClass UX: flatpickr is not defined');
            }
        } catch (e) {
            console.error('WebClass UX: Failed to init flatpickr', e);
        }

        clearBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            if (fpInstance) {
                fpInstance.clear();
            }
            selectedDate = null;
            if (typeof onClear === 'function') {
                await onClear();
            }
            closeDatetimePopover();
        });

        document.body.appendChild(popover);

        const positionPopover = () => {
            if (!document.body.contains(popover) || !document.body.contains(anchorEl)) return;
            const rect = anchorEl.getBoundingClientRect();
            const popRect = popover.getBoundingClientRect();
            let left = rect.left + window.scrollX;
            let top = rect.bottom + window.scrollY + 8;
            const maxLeft = window.scrollX + window.innerWidth - popRect.width - 12;
            if (left > maxLeft) left = Math.max(window.scrollX + 12, maxLeft);
            const maxTop = window.scrollY + window.innerHeight - popRect.height - 12;
            if (top > maxTop) {
                const altTop = rect.top + window.scrollY - popRect.height - 8;
                top = altTop > window.scrollY + 12 ? altTop : Math.max(window.scrollY + 12, maxTop);
            }
            popover.style.left = `${left}px`;
            popover.style.top = `${top}px`;
        };

        const handleDocPointer = (event) => {
            if (popover.contains(event.target) || anchorEl.contains(event.target)) return;
            closeDatetimePopover();
        };

        const handleKeydown = (event) => {
            if (event.key === 'Escape') {
                closeDatetimePopover();
            }
        };

        const handleReposition = () => {
            requestAnimationFrame(positionPopover);
        };

        document.addEventListener('mousedown', handleDocPointer);
        document.addEventListener('touchstart', handleDocPointer, { passive: true });
        document.addEventListener('keydown', handleKeydown);
        window.addEventListener('resize', handleReposition);
        window.addEventListener('scroll', handleReposition, true);

        requestAnimationFrame(positionPopover);

        uxActiveDatetimePopover = popover;
        uxActiveDatetimeAnchor = anchorEl;
        uxActiveDatetimeOnClose = onClose || null;
        uxActiveDatetimeCleanup = () => {
            document.removeEventListener('mousedown', handleDocPointer);
            document.removeEventListener('touchstart', handleDocPointer);
            document.removeEventListener('keydown', handleKeydown);
            window.removeEventListener('resize', handleReposition);
            window.removeEventListener('scroll', handleReposition, true);
            if (fpInstance) {
                try {
                    fpInstance.destroy();
                } catch {
                    // ignore
                }
            }
        };
    }

    function openReminderPopover(anchorEl, options) {
        if (!anchorEl) return;
        if (uxActiveReminderAnchor === anchorEl && uxActiveReminderPopover) {
            closeReminderPopover();
            return;
        }

        closeReminderPopover();
        closeDatetimePopover();

        const {
            initialConfig = {},
            onCommit,
            onReset
        } = options || {};

        const safeConfig = {
            enabled: initialConfig.enabled !== false,
            daysBefore: normalizeMsTodoReminderDaysBefore(initialConfig.daysBefore, MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE),
            timeMode: normalizeMsTodoReminderTimeMode(initialConfig.timeMode, MS_TODO_REMINDER_TIME_MODE_AT_9AM)
        };

        const popover = document.createElement('div');
        popover.className = 'ux-reminder-popover';
        popover.setAttribute('role', 'dialog');
        popover.setAttribute('aria-label', '通知設定');

        const panel = document.createElement('div');
        panel.className = 'ux-reminder-panel';
        popover.appendChild(panel);

        const enabledRow = document.createElement('label');
        enabledRow.className = 'ux-reminder-row';
        const enabledLabel = document.createElement('span');
        enabledLabel.className = 'ux-reminder-label';
        enabledLabel.textContent = '通知';
        enabledRow.appendChild(enabledLabel);
        const enabledSelect = document.createElement('select');
        enabledSelect.className = 'ux-reminder-select';
        enabledSelect.innerHTML = `
            <option value="on">オン</option>
            <option value="off">オフ</option>
        `;
        enabledSelect.value = safeConfig.enabled ? 'on' : 'off';
        enabledRow.appendChild(enabledSelect);
        panel.appendChild(enabledRow);

        const daysRow = document.createElement('label');
        daysRow.className = 'ux-reminder-row';
        const daysLabel = document.createElement('span');
        daysLabel.className = 'ux-reminder-label';
        daysLabel.textContent = '通知日';
        daysRow.appendChild(daysLabel);
        const daysSelect = document.createElement('select');
        daysSelect.className = 'ux-reminder-select';
        for (let day = 0; day <= 7; day += 1) {
            const option = document.createElement('option');
            option.value = String(day);
            option.textContent = formatMsTodoReminderDaysBefore(day);
            daysSelect.appendChild(option);
        }
        daysSelect.value = String(safeConfig.daysBefore);
        daysRow.appendChild(daysSelect);
        panel.appendChild(daysRow);

        const modeRow = document.createElement('label');
        modeRow.className = 'ux-reminder-row';
        const modeLabel = document.createElement('span');
        modeLabel.className = 'ux-reminder-label';
        modeLabel.textContent = '時刻';
        modeRow.appendChild(modeLabel);
        const modeSelect = document.createElement('select');
        modeSelect.className = 'ux-reminder-select';
        modeSelect.innerHTML = `
            <option value="${MS_TODO_REMINDER_TIME_MODE_AT_9AM}">選択日の午前9:00</option>
            <option value="${MS_TODO_REMINDER_TIME_MODE_EXACT_OFFSET}">期限日時から24h×日前</option>
        `;
        modeSelect.value = safeConfig.timeMode;
        modeRow.appendChild(modeSelect);
        panel.appendChild(modeRow);

        const actions = document.createElement('div');
        actions.className = 'ux-reminder-actions';
        panel.appendChild(actions);

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'ux-reminder-btn';
        resetBtn.textContent = '既定に戻す';
        actions.appendChild(resetBtn);

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'ux-reminder-btn ux-reminder-btn-primary';
        saveBtn.textContent = '保存';
        actions.appendChild(saveBtn);

        const setControlDisabled = () => {
            const disabled = enabledSelect.value === 'off';
            daysSelect.disabled = disabled;
            modeSelect.disabled = disabled;
        };
        setControlDisabled();
        enabledSelect.addEventListener('change', setControlDisabled);

        const withBusy = async (runner) => {
            if (saveBtn.disabled || resetBtn.disabled) return;
            saveBtn.disabled = true;
            resetBtn.disabled = true;
            try {
                await runner();
            } finally {
                saveBtn.disabled = false;
                resetBtn.disabled = false;
            }
        };

        saveBtn.addEventListener('click', () => {
            void withBusy(async () => {
                const enabled = enabledSelect.value !== 'off';
                const updates = enabled
                    ? {
                        msTodoReminderEnabled: true,
                        msTodoReminderDaysBefore: normalizeMsTodoReminderDaysBefore(daysSelect.value, safeConfig.daysBefore),
                        msTodoReminderTimeMode: normalizeMsTodoReminderTimeMode(modeSelect.value, safeConfig.timeMode)
                    }
                    : {
                        msTodoReminderEnabled: false,
                        msTodoReminderDaysBefore: null,
                        msTodoReminderTimeMode: null
                    };
                if (typeof onCommit === 'function') {
                    await onCommit(updates);
                }
                closeReminderPopover();
            });
        });

        resetBtn.addEventListener('click', () => {
            void withBusy(async () => {
                if (typeof onReset === 'function') {
                    await onReset({
                        msTodoReminderEnabled: null,
                        msTodoReminderDaysBefore: null,
                        msTodoReminderTimeMode: null
                    });
                }
                closeReminderPopover();
            });
        });

        document.body.appendChild(popover);

        const positionPopover = () => {
            if (!document.body.contains(popover) || !document.body.contains(anchorEl)) return;
            const rect = anchorEl.getBoundingClientRect();
            const popRect = popover.getBoundingClientRect();
            let left = rect.left + window.scrollX;
            let top = rect.bottom + window.scrollY + 8;
            const maxLeft = window.scrollX + window.innerWidth - popRect.width - 12;
            if (left > maxLeft) left = Math.max(window.scrollX + 12, maxLeft);
            const maxTop = window.scrollY + window.innerHeight - popRect.height - 12;
            if (top > maxTop) {
                const altTop = rect.top + window.scrollY - popRect.height - 8;
                top = altTop > window.scrollY + 12 ? altTop : Math.max(window.scrollY + 12, maxTop);
            }
            popover.style.left = `${left}px`;
            popover.style.top = `${top}px`;
        };

        const handleDocPointer = (event) => {
            if (popover.contains(event.target) || anchorEl.contains(event.target)) return;
            closeReminderPopover();
        };

        const handleKeydown = (event) => {
            if (event.key === 'Escape') {
                closeReminderPopover();
            }
        };

        const handleReposition = () => {
            requestAnimationFrame(positionPopover);
        };

        document.addEventListener('mousedown', handleDocPointer);
        document.addEventListener('touchstart', handleDocPointer, { passive: true });
        document.addEventListener('keydown', handleKeydown);
        window.addEventListener('resize', handleReposition);
        window.addEventListener('scroll', handleReposition, true);

        requestAnimationFrame(positionPopover);

        uxActiveReminderPopover = popover;
        uxActiveReminderAnchor = anchorEl;
        uxActiveReminderCleanup = () => {
            document.removeEventListener('mousedown', handleDocPointer);
            document.removeEventListener('touchstart', handleDocPointer);
            document.removeEventListener('keydown', handleKeydown);
            window.removeEventListener('resize', handleReposition);
            window.removeEventListener('scroll', handleReposition, true);
        };
    }

    function renderToDoList(assignments, container, renderOptions = {}) {
        closeDatetimePopover();
        closeReminderPopover();
        cleanupTodoTitleAutoScroll();
        container.innerHTML = '';
        const { viewMode = 'normal' } = renderOptions;
        const reminderSettings = {
            provider: renderOptions.msTodoReminderSettings?.provider || 'none',
            defaultDaysBefore: normalizeMsTodoReminderDaysBefore(
                renderOptions.msTodoReminderSettings?.defaultDaysBefore,
                MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE
            ),
            defaultTimeMode: normalizeMsTodoReminderTimeMode(
                renderOptions.msTodoReminderSettings?.defaultTimeMode,
                MS_TODO_REMINDER_TIME_MODE_AT_9AM
            )
        };
        const showMicrosoftReminderControl = reminderSettings.provider === 'microsoft';
        const todoCourseNameMap = buildTodoCourseDisplayNameMap();
        const preferShortCourseFallback = assignments.some((todo) => {
            const sourceUrl = todo?.url || todo?.fallbackUrl || '';
            const courseId = extractCourseIdFromUrl(sourceUrl);
            const fullName = normalizeDevdevCourseText(todo?.courseFullName || '');
            const byIdName = courseId && todoCourseNameMap.byId instanceof Map
                ? normalizeDevdevCourseText(todoCourseNameMap.byId.get(courseId) || '')
                : '';
            const byFullName = fullName && todoCourseNameMap.byFullName instanceof Map
                ? normalizeDevdevCourseText(todoCourseNameMap.byFullName.get(fullName) || '')
                : '';
            const timetableName = byIdName || byFullName;
            return !!(timetableName && fullName && timetableName !== fullName);
        });
        const getTodoIdentity = (todo) => {
            if (!todo || typeof todo !== 'object') return '';
            return todo.url || todo.fallbackUrl || `${todo.title || ''}::${todo.course || ''}::${todo.deadline || ''}`;
        };
        let expiredTodoKeys = new Set();

        // ダッシュボード用アイテム作成関数
        const createDashboardItem = (todo, options = {}) => {
            const li = document.createElement('li');
            li.style.padding = '12px 15px';
            li.style.borderBottom = 'none';
            li.style.display = 'flex';
            li.style.alignItems = 'center';
            li.style.gap = '12px';
            li.style.backgroundColor = 'var(--ux-home-surface)';

            const refreshDashboardList = async () => {
                if (renderOptions.onStatusChange) {
                    renderOptions.onStatusChange();
                    return;
                }
                const updatedAssignments = await loadAssignments();
                renderToDoList(updatedAssignments, container, renderOptions);
                applyTimetableColorsFromTodo(updatedAssignments);
            };

            // Checkbox (Round)
            const checkbox = document.createElement('div');
            checkbox.className = 'ux-todo-checkbox';
            checkbox.style.width = '20px';
            checkbox.style.height = '20px';
            checkbox.style.borderRadius = '50%';
            checkbox.style.border = '2px solid ' + (todo.isCompleted ? 'var(--ux-home-success)' : 'var(--ux-home-separator)');
            checkbox.style.backgroundColor = todo.isCompleted ? 'var(--ux-home-success)' : 'transparent';
            checkbox.style.cursor = 'pointer';
            checkbox.style.display = 'flex';
            checkbox.style.alignItems = 'center';
            checkbox.style.justifyContent = 'center';

            if (todo.isCompleted) {
                const checkMark = document.createElement('span');
                checkMark.textContent = '✓';
                checkMark.style.color = '#fff';
                checkMark.style.fontSize = '12px';
                checkbox.appendChild(checkMark);
            }

            checkbox.onclick = async (e) => {
                e.stopPropagation();
                todo.isCompleted = !todo.isCompleted;
                // Update Storage
                await updateAssignment(
                    todo,
                    { isCompleted: todo.isCompleted },
                    { waitForTodoApiSync: false }
                );
                // Re-render
                if (renderOptions.onStatusChange) renderOptions.onStatusChange();
                else renderToDoList(assignments, container, renderOptions);
            };
            li.appendChild(checkbox);

            // Content
            const content = document.createElement('div');
            content.style.flex = '1';
            content.style.minWidth = '0';
            content.style.display = 'flex';
            content.style.flexDirection = 'column';
            content.style.gap = '0px';

            const titleInput = document.createElement('input');
            titleInput.type = 'text';
            titleInput.value = todo.title || '';
            titleInput.className = 'ux-todo-input-title';
            titleInput.style.width = '100%';
            titleInput.style.border = '1px solid transparent';
            titleInput.style.borderRadius = '3px';
            titleInput.style.padding = '2px 0';
            titleInput.style.fontSize = '0.95em';
            titleInput.style.fontWeight = '500';
            titleInput.style.color = todo.isCompleted ? 'var(--ux-home-quaternary-label)' : 'var(--ux-home-label)';
            titleInput.style.backgroundColor = 'transparent';
            titleInput.style.overflow = 'hidden';
            titleInput.style.textDecoration = todo.isCompleted ? 'line-through' : 'none';
            titleInput.style.transition = 'border-color 0.2s, background-color 0.2s';

            titleInput.onfocus = () => {
                titleInput.style.borderColor = 'var(--ux-home-accent)';
                titleInput.style.backgroundColor = 'var(--ux-home-surface)';
                titleInput.style.outline = 'none';
            };
            titleInput.onblur = () => {
                titleInput.style.borderColor = 'transparent';
                titleInput.style.backgroundColor = 'transparent';
            };

            titleInput.onchange = async () => {
                const newVal = titleInput.value.trim();
                if (!newVal) {
                    // 空の場合は元に戻すなどの処理が必要かも？ここではそのまま保存
                }
                await updateAssignment(todo, { title: newVal });
            };

            const dashboardTitleScrollCleanup = attachTodoTitleAutoScroll(titleInput);
            if (typeof dashboardTitleScrollCleanup === 'function') {
                uxTodoTitleAutoScrollCleanups.push(dashboardTitleScrollCleanup);
            }

            content.appendChild(titleInput);

            const dashboardCourseLabel = getTodoCourseDisplayName(todo, todoCourseNameMap, preferShortCourseFallback);
            if (dashboardCourseLabel) {
                const courseLine = document.createElement('div');
                courseLine.style.fontSize = '0.72em';
                courseLine.style.color = 'var(--ux-home-secondary-label)';
                courseLine.style.overflow = 'hidden';
                courseLine.style.textOverflow = 'ellipsis';
                courseLine.style.whiteSpace = 'nowrap';
                courseLine.textContent = dashboardCourseLabel;
                content.appendChild(courseLine);
            }

            const deadlineLine = document.createElement('div');
            deadlineLine.className = 'ux-todo-deadline-line';
            deadlineLine.style.fontSize = '0.8em';
            deadlineLine.style.color = 'var(--ux-home-secondary-label)';
            deadlineLine.style.display = 'flex';
            deadlineLine.style.alignItems = 'center';
            deadlineLine.style.gap = '0.4em';
            deadlineLine.style.flexWrap = 'nowrap';
            deadlineLine.style.whiteSpace = 'nowrap';

            const dateOnlyInput = document.createElement('input');
            dateOnlyInput.type = 'text';
            dateOnlyInput.className = 'ux-todo-input-date';
            dateOnlyInput.style.fontSize = '0.85em';
            dateOnlyInput.style.border = '1px solid transparent';
            dateOnlyInput.style.borderRadius = '0';
            dateOnlyInput.style.padding = '0';
            dateOnlyInput.style.color = 'var(--ux-home-secondary-label)';
            dateOnlyInput.style.backgroundColor = 'transparent';
            dateOnlyInput.style.width = '10ch';
            dateOnlyInput.style.minWidth = '0';
            dateOnlyInput.style.textAlign = 'left';
            dateOnlyInput.style.boxShadow = 'none';
            dateOnlyInput.style.transition = 'border-color 0.2s';
            dateOnlyInput.style.borderBottom = '1px solid transparent';
            dateOnlyInput.placeholder = '期限';
            dateOnlyInput.readOnly = true;
            dateOnlyInput.style.cursor = 'pointer';

            const timeOnlyInput = document.createElement('input');
            timeOnlyInput.type = 'text';
            timeOnlyInput.className = 'ux-todo-input-time';
            timeOnlyInput.style.fontSize = '0.85em';
            timeOnlyInput.style.border = '1px solid transparent';
            timeOnlyInput.style.borderRadius = '0';
            timeOnlyInput.style.padding = '0';
            timeOnlyInput.style.color = 'var(--ux-home-secondary-label)';
            timeOnlyInput.style.backgroundColor = 'transparent';
            timeOnlyInput.style.width = '8ch';
            timeOnlyInput.style.minWidth = '0';
            timeOnlyInput.style.textAlign = 'left';
            timeOnlyInput.style.boxShadow = 'none';
            timeOnlyInput.style.transition = 'border-color 0.2s';
            timeOnlyInput.style.borderBottom = '1px solid transparent';
            timeOnlyInput.placeholder = '時刻';
            timeOnlyInput.readOnly = true;
            timeOnlyInput.style.cursor = 'pointer';

            dateOnlyInput.size = 10;
            timeOnlyInput.size = 8;

            const formatDashboardTime = (date) => {
                let hours = date.getHours();
                const minutes = date.getMinutes();
                const ampm = hours >= 12 ? 'PM' : 'AM';
                hours = hours % 12;
                hours = hours ? hours : 12;
                return `${ampm} ${hours}:${minutes < 10 ? '0' + minutes : minutes}`;
            };

            const updateDeadlineDisplay = (date) => {
                if (!date) {
                    dateOnlyInput.value = '期限なし';
                    timeOnlyInput.value = '';
                    timeOnlyInput.style.display = 'none';
                    return;
                }
                dateOnlyInput.value = date.toLocaleDateString();
                timeOnlyInput.value = formatDashboardTime(date);
                timeOnlyInput.style.display = '';
            };

            let currentDeadline = null;
            if (todo.deadline && todo.deadline !== '期限なし') {
                const d = new Date(todo.deadline);
                if (!isNaN(d.getTime())) {
                    currentDeadline = d;
                    updateDeadlineDisplay(d);
                }
            }
            if (!currentDeadline) {
                updateDeadlineDisplay(null);
            }

            const commitDeadline = async (date, shouldRefresh = true) => {
                if (!date) {
                    if (todo.deadline !== '期限なし') {
                        await updateAssignment(todo, { deadline: '期限なし' });
                        todo.deadline = '期限なし';
                        if (shouldRefresh) {
                            await refreshDashboardList();
                        }
                        return true;
                    }
                    return false;
                }

                const newDeadlineStr = date.toLocaleString();
                if (todo.deadline !== newDeadlineStr) {
                    await updateAssignment(todo, { deadline: newDeadlineStr });
                    todo.deadline = newDeadlineStr;
                    if (shouldRefresh) {
                        await refreshDashboardList();
                    }
                    return true;
                }
                return false;
            };

            const openPicker = (event) => {
                if (event) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                let needsRefresh = false;
                openDatetimePopover(deadlineLine, {
                    initialDate: currentDeadline,
                    onCommit: async (date) => {
                        currentDeadline = date;
                        updateDeadlineDisplay(date);
                        const changed = await commitDeadline(date, false);
                        needsRefresh = needsRefresh || changed;
                    },
                    onClear: async () => {
                        currentDeadline = null;
                        updateDeadlineDisplay(null);
                        const changed = await commitDeadline(null, false);
                        needsRefresh = needsRefresh || changed;
                    },
                    onClose: async () => {
                        if (needsRefresh) {
                            await refreshDashboardList();
                        }
                    }
                });
            };

            dateOnlyInput.addEventListener('click', openPicker);
            timeOnlyInput.addEventListener('click', openPicker);
            dateOnlyInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    openPicker(event);
                }
            });
            timeOnlyInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    openPicker(event);
                }
            });

            deadlineLine.appendChild(dateOnlyInput);
            deadlineLine.appendChild(timeOnlyInput);
            content.appendChild(deadlineLine);

            li.appendChild(content);

            const rightMeta = document.createElement('div');
            rightMeta.style.display = 'flex';
            rightMeta.style.alignItems = 'center';
            rightMeta.style.gap = '8px';

            // Priority
            const priority = getTodoPriority(todo);
            const priorityBadge = document.createElement('div');
            priorityBadge.style.display = 'flex';
            priorityBadge.style.alignItems = 'center';
            priorityBadge.style.gap = '4px';
            priorityBadge.style.fontSize = '0.75em';
            priorityBadge.style.fontWeight = 'bold';

            let pColor = 'var(--ux-home-quaternary-label)';
            let pText = priority;
            const isDashboardExpired = viewMode === 'dashboard' && expiredTodoKeys.has(getTodoIdentity(todo));
            if (isDashboardExpired) {
                pColor = 'var(--ux-home-purple-foreground)';
                pText = 'end';
            } else {
                if (priority === 'High') pColor = 'var(--ux-home-danger)';
                if (priority === 'Medium') pColor = 'var(--ux-home-warning)';
                if (priority === 'Low') pColor = 'var(--ux-home-success)';
                if (priority === 'Done') pColor = 'var(--ux-home-quaternary-label)';
            }

            priorityBadge.style.color = pColor;

            const dot = document.createElement('span');
            dot.style.width = '6px';
            dot.style.height = '6px';
            dot.style.borderRadius = '50%';
            dot.style.backgroundColor = pColor;

            priorityBadge.appendChild(dot);
            priorityBadge.appendChild(document.createTextNode(pText));

            if (showMicrosoftReminderControl) {
                const reminderConfig = buildMsTodoReminderConfig(todo, reminderSettings);
                const reminderBtn = document.createElement('button');
                reminderBtn.type = 'button';
                reminderBtn.className = 'ux-ms-reminder-btn';
                setMsReminderButtonIcon(reminderBtn, reminderConfig.enabled);
                reminderBtn.title = `通知: ${formatMsTodoReminderSummary(reminderConfig)}`;
                reminderBtn.setAttribute('aria-label', reminderBtn.title);

                reminderBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openReminderPopover(reminderBtn, {
                        initialConfig: reminderConfig,
                        onCommit: async (updates) => {
                            await updateAssignment(todo, updates);
                            Object.assign(todo, updates);
                            await refreshDashboardList();
                        },
                        onReset: async (updates) => {
                            await updateAssignment(todo, updates);
                            Object.assign(todo, updates);
                            await refreshDashboardList();
                        }
                    });
                });

                rightMeta.appendChild(reminderBtn);
            }

            rightMeta.appendChild(priorityBadge);
            li.appendChild(rightMeta);

            // Delete action (simple X for now)
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '&times;';
            deleteBtn.style.background = 'none';
            deleteBtn.style.border = 'none';
            deleteBtn.style.color = 'var(--ux-home-quaternary-label)';
            deleteBtn.style.fontSize = '18px';
            deleteBtn.style.cursor = 'pointer';
            deleteBtn.style.padding = '0 5px';
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm('削除しますか？')) {
                    await addToTrash(todo);
                    await updateAssignment(todo, { isDeleted: true, deletedAt: getWebClassNow().toISOString() });
                    if (renderOptions.onStatusChange) renderOptions.onStatusChange();
                    else renderToDoList(assignments, container, renderOptions);
                }
            };
            li.appendChild(deleteBtn);

            return li;
        };

        // 1. 分類ロジック
        // 削除済み(isDeleted)またはゴミ箱に入っているタスクは表示しない
        const visibleAssignments = assignments.filter(a => !a.isDeleted && !isInTrashBin(a));
        const activeAssignments = visibleAssignments.filter(a => !a.isCompleted);
        const completedAssignments = visibleAssignments.filter(a => a.isCompleted);

        const normal = [];
        const farFuture = [];
        const indefinite = [];
        const expired = []; // 期限切れ（初期設定期限が過ぎている）

        const now = getWebClassNow();
        const oneMonthLater = new Date(now);
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

        activeAssignments.forEach(todo => {
            // 期限切れ判定には「初期設定期限（originalDeadline）」を使用
            // ユーザーが期限を変更しても、システム上の本来の期限で判断する
            const deadlineForExpiredCheck = todo.originalDeadline || todo.deadline;
            const deadlineForDisplay = todo.deadline; // 表示・分類用はユーザー変更後の期限

            if (!deadlineForDisplay || deadlineForDisplay === '期限なし') {
                indefinite.push(todo);
            } else {
                const d = new Date(deadlineForDisplay);
                const dOriginal = new Date(deadlineForExpiredCheck);

                if (isNaN(d.getTime())) {
                    // 日付パース失敗 -> 期限なし扱い
                    indefinite.push(todo);
                } else if (!isNaN(dOriginal.getTime()) && dOriginal < now) {
                    // 期限切れ判定: 初期設定期限が過ぎている場合のみ
                    expired.push(todo);
                } else if (d < now) {
                    // 任意期限は過ぎているが初期設定期限はまだ → タブ所属なし（通常リストに追加）
                    todo._isReminderExpired = true; // 紫背景用フラグ
                    normal.push(todo);
                } else if (d > oneMonthLater) {
                    farFuture.push(todo);
                } else {
                    normal.push(todo);
                }
            }
        });

        // 各グループをソート
        const sortedNormal = sortTodos(normal);
        const sortedFarFuture = sortTodos(farFuture);
        const sortedIndefinite = sortTodos(indefinite);
        const sortedExpired = sortTodos(expired);
        expiredTodoKeys = new Set(sortedExpired.map(getTodoIdentity));

        // 2. 表示ロジック

        if (assignments.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = '課題データがありません。「更新」ボタンを押してください。';
            empty.style.padding = '20px';
            empty.style.textAlign = 'center';
            empty.style.color = 'var(--ux-home-secondary-label)';
            container.appendChild(empty);
            return;
        }

        // アイテム作成関数
        // options: { isExpired, isReminderExpired, isCompleted, showDeleteButton }
        const createItem = (todo, options = {}) => {
            if (viewMode === 'dashboard') {
                return createDashboardItem(todo, options);
            }

            const { isExpired = false, isReminderExpired = false, isCompleted = false, showDeleteButton = false } = options;

            const li = document.createElement('li');
            li.style.padding = '10px 15px';
            li.style.borderBottom = 'none';
            li.style.display = 'flex';
            li.style.alignItems = 'center';
            li.style.gap = '10px';
            li.style.backgroundColor = 'var(--ux-home-surface)'; // デフォルト背景

            // 期限切れの場合はグレー背景
            if (isExpired) {
                li.style.backgroundColor = 'var(--ux-home-surface-muted)';
            }
            // 任意期限が過ぎているが初期設定期限はまだの場合は紫背景
            if (todo._isReminderExpired) {
                li.style.backgroundColor = 'var(--ux-home-purple-soft)';
            }
            // 期限に基づいて背景色を設定 (通常リストのみ、または全リストで適用？ -> 全リストで適用しても良いが、期限なしは白)
            else if (!todo.isCompleted && todo.deadline && todo.deadline !== '期限なし') {
                const deadlineDate = new Date(todo.deadline);
                const hoursRemaining = (deadlineDate - getWebClassNow()) / (1000 * 60 * 60);

                if (hoursRemaining <= 48) {
                    li.style.backgroundColor = 'var(--ux-home-danger-soft)';
                } else if (hoursRemaining <= 168) {
                    li.style.backgroundColor = 'var(--ux-home-warning-soft)';
                }
            }

            // チェックボックス
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = todo.isCompleted || false;
            checkbox.style.width = '18px';
            checkbox.style.height = '18px';
            checkbox.style.cursor = 'pointer';

            checkbox.onclick = async (e) => {
                e.stopPropagation();
                todo.isCompleted = checkbox.checked;
                await updateAssignment(
                    todo,
                    { isCompleted: todo.isCompleted },
                    { waitForTodoApiSync: false }
                );
                const currentAssignments = await loadAssignments();

                // UI再描画
                renderToDoList(currentAssignments, container);

                // 時間割表の背景色も更新
                applyTimetableColorsFromTodo(currentAssignments);
            };

            li.appendChild(checkbox);

            // コンテンツ
            const content = document.createElement('div');
            content.style.flex = '1';
            content.style.minWidth = '0';

            if (todo.isCompleted) {
                li.style.opacity = '0.6';
                content.style.textDecoration = 'line-through';
            }

            // コース名
            const titleLine = document.createElement('div');
            titleLine.style.fontSize = '0.75em';
            titleLine.style.color = 'var(--ux-home-secondary-label)';

            if (todo.category && todo.category !== 'Unknown') {
                const badge = document.createElement('span');
                badge.textContent = todo.category;
                badge.style.fontSize = '0.75em';
                badge.style.padding = '2px 6px';
                badge.style.borderRadius = '4px';
                badge.style.backgroundColor = 'var(--ux-home-fill)';
                badge.style.color = 'var(--ux-home-secondary-label)';
                badge.style.marginRight = '8px';
                titleLine.appendChild(badge);
            }
            if (titleLine.childNodes.length > 0) {
                content.appendChild(titleLine);
            }

            // 課題名 (編集可能)
            const assignmentLine = document.createElement('div');
            assignmentLine.style.marginTop = '0px';
            assignmentLine.style.minWidth = '0';

            const titleInput = document.createElement('input');
            titleInput.type = 'text';
            titleInput.value = todo.title;
            titleInput.className = 'ux-todo-input-title'; // CSSでスタイル調整推奨
            // インラインスタイルで最低限の見た目を整える
            titleInput.style.width = '100%';
            titleInput.style.border = '1px solid transparent';
            titleInput.style.borderRadius = '3px';
            titleInput.style.padding = '2px 0';
            titleInput.style.fontSize = '1.02em';
            titleInput.style.fontWeight = 'bold';
            titleInput.style.color = 'var(--ux-home-label)';
            titleInput.style.backgroundColor = 'transparent';
            titleInput.style.overflow = 'hidden';
            titleInput.style.transition = 'border-color 0.2s, background-color 0.2s';

            titleInput.onfocus = () => {
                titleInput.style.borderColor = 'var(--ux-home-accent)';
                titleInput.style.backgroundColor = 'var(--ux-home-surface)';
                titleInput.style.outline = 'none';
            };
            titleInput.onblur = () => {
                titleInput.style.borderColor = 'transparent';
                titleInput.style.backgroundColor = 'transparent';
            };

            // タイトル変更時の保存処理
            titleInput.onchange = async () => {
                const newVal = titleInput.value.trim();
                if (!newVal) {
                    // 空の場合は元に戻すなどの処理が必要かも？ここではそのまま保存
                }
                await updateAssignment(todo, { title: newVal });
            };

            const normalTitleScrollCleanup = attachTodoTitleAutoScroll(titleInput);
            if (typeof normalTitleScrollCleanup === 'function') {
                uxTodoTitleAutoScrollCleanups.push(normalTitleScrollCleanup);
            }

            assignmentLine.appendChild(titleInput);
            content.appendChild(assignmentLine);

            const todoCourseLabel = getTodoCourseDisplayName(todo, todoCourseNameMap, preferShortCourseFallback);
            if (todoCourseLabel) {
                const courseLine = document.createElement('div');
                courseLine.style.fontSize = '0.75em';
                courseLine.style.color = 'var(--ux-home-secondary-label)';
                courseLine.style.marginTop = '0px';
                courseLine.style.overflow = 'hidden';
                courseLine.style.textOverflow = 'ellipsis';
                courseLine.style.whiteSpace = 'nowrap';
                courseLine.textContent = todoCourseLabel;
                content.appendChild(courseLine);
            }

            const deadlineLine = document.createElement('div');
            deadlineLine.style.fontSize = '0.85em';
            deadlineLine.style.color = 'var(--ux-home-secondary-label)';
            deadlineLine.style.marginTop = '0px';
            deadlineLine.style.display = 'flex';
            deadlineLine.style.alignItems = 'center';
            deadlineLine.style.gap = '5px';
            const deadlineLabel = document.createElement('span');
            deadlineLabel.textContent = '期限: ';
            deadlineLine.appendChild(deadlineLabel);

            // 日付入力 (Flatpickr - Date Only)
            const dateOnlyInput = document.createElement('input');
            dateOnlyInput.type = 'text';
            dateOnlyInput.className = 'ux-todo-input-date';
            dateOnlyInput.style.fontSize = '0.9em';
            dateOnlyInput.style.border = '1px solid var(--ux-home-separator)';
            dateOnlyInput.style.borderRadius = '3px';
            dateOnlyInput.style.padding = '1px 3px';
            dateOnlyInput.style.color = 'var(--ux-home-secondary-label)';
            dateOnlyInput.style.width = '90px';
            dateOnlyInput.style.textAlign = 'center';
            dateOnlyInput.placeholder = '日付';

            // 時間入力 (MobileSelect - Time Only)
            const timeOnlyInput = document.createElement('input');
            timeOnlyInput.type = 'text';
            timeOnlyInput.className = 'ux-todo-input-time';
            timeOnlyInput.style.fontSize = '0.9em';
            timeOnlyInput.style.border = '1px solid var(--ux-home-separator)';
            timeOnlyInput.style.borderRadius = '3px';
            timeOnlyInput.style.padding = '1px 3px';
            timeOnlyInput.style.color = 'var(--ux-home-secondary-label)';
            timeOnlyInput.style.width = '80px';
            timeOnlyInput.style.textAlign = 'center';
            timeOnlyInput.placeholder = '時間';
            timeOnlyInput.readOnly = true; // Prevent keyboard input
            timeOnlyInput.style.cursor = 'pointer';
            const timeInputId = 'time-input-' + Math.random().toString(36).substr(2, 9);
            timeOnlyInput.id = timeInputId;

            // 初期値パース
            let currentDeadline = null;
            if (todo.deadline && todo.deadline !== '期限なし') {
                const d = new Date(todo.deadline);
                if (!isNaN(d.getTime())) {
                    currentDeadline = d;
                    dateOnlyInput.value = d.toLocaleDateString(); // YYYY/MM/DD or similar

                    // Format time for display: AM/PM hh:mm
                    let hours = d.getHours();
                    const minutes = d.getMinutes();
                    const ampm = hours >= 12 ? '午後' : '午前';
                    hours = hours % 12;
                    hours = hours ? hours : 12; // the hour '0' should be '12'
                    const strTime = ampm + ' ' + hours + ':' + (minutes < 10 ? '0' + minutes : minutes);
                    timeOnlyInput.value = strTime;
                    timeOnlyInput.style.display = '';
                }
            }

            // 保存処理ヘルパー
            if (!currentDeadline) {
                dateOnlyInput.value = '期限なし';
                timeOnlyInput.value = '';
                timeOnlyInput.style.display = 'none';
            }

            const saveCombinedDeadline = async () => {
                const dateStr = dateOnlyInput.value; // YYYY/MM/DD
                const timeStr = timeOnlyInput.value; // AM 8:00

                const isIndefinite = !dateStr || dateStr === '期限なし';
                if (isIndefinite) {
                    await updateAssignment(todo, { deadline: '期限なし' });
                    dateOnlyInput.value = '期限なし';
                    timeOnlyInput.value = '';
                    timeOnlyInput.style.display = 'none';
                    const updatedAssignments = await loadAssignments();
                    renderToDoList(updatedAssignments, container);
                    applyTimetableColorsFromTodo(updatedAssignments);
                    return;
                }

                let finalDate = new Date(dateStr);
                if (isNaN(finalDate.getTime())) {
                    await updateAssignment(todo, { deadline: '期限なし' });
                    dateOnlyInput.value = '期限なし';
                    timeOnlyInput.value = '';
                    timeOnlyInput.style.display = 'none';
                    const updatedAssignments = await loadAssignments();
                    renderToDoList(updatedAssignments, container);
                    applyTimetableColorsFromTodo(updatedAssignments);
                    return;
                }

                timeOnlyInput.style.display = '';

                if (timeStr) {
                    const parts = timeStr.match(/((?:AM|PM)|午前|午後)\s(\d+):(\d+)/);
                    if (parts) {
                        let h = parseInt(parts[2]);
                        const m = parseInt(parts[3]);
                        const meridiem = parts[1];
                        if ((meridiem === 'PM' || meridiem === '午後') && h < 12) h += 12;
                        if ((meridiem === 'AM' || meridiem === '午前') && h === 12) h = 0;
                        finalDate.setHours(h, m);
                    }
                } else {
                    finalDate.setHours(0, 0);
                }

                const newDeadlineStr = finalDate.toLocaleString();
                if (todo.deadline !== newDeadlineStr) {
                    await updateAssignment(todo, { deadline: newDeadlineStr });
                    const updatedAssignments = await loadAssignments();
                    renderToDoList(updatedAssignments, container);
                    applyTimetableColorsFromTodo(updatedAssignments);
                }
            };
            // Flatpickr (Date)
            try {
                if (typeof flatpickr !== 'undefined') {
                    flatpickr(dateOnlyInput, {
                        locale: 'ja',
                        dateFormat: "Y/m/d",
                        disableMobile: true,
                        defaultDate: currentDeadline,
                        onClose: async (selectedDates, dateStr, instance) => {
                            await saveCombinedDeadline();
                        }
                    });
                } else {
                    uxDebugWarn('WebClass UX: flatpickr is not defined');
                }
            } catch (e) {
                console.error('WebClass UX: Failed to init flatpickr', e);
            }

            // MobileSelect (Time)
            // Generate wheels
            const hoursArr = [];
            for (let i = 1; i <= 12; i++) hoursArr.push(i.toString());
            const minutesArr = [];
            for (let i = 0; i < 60; i++) minutesArr.push(i < 10 ? '0' + i : i.toString());

            // Wrap in setTimeout to ensure element is in DOM
            setTimeout(() => {
                // Check if element still exists (in case of rapid re-renders)
                if (!document.getElementById(timeInputId)) return;

                try {
                    if (typeof MobileSelect === 'undefined') {
                        uxDebugWarn('WebClass UX: MobileSelect is not defined');
                        return;
                    }

                    const ms = new MobileSelect({
                        trigger: '#' + timeInputId,
                        title: '時刻',
                        wheels: [
                            { data: ['午前', '午後'] },
                            { data: hoursArr },
                            { data: minutesArr }
                        ],
                        position: [1, 0, 0], // Default position
                        transitionEnd: function (indexArr, data) {
                            // uxDebugLog(data);
                        },
                        callback: async function (indexArr, data) {
                            // data = ["午後", "8", "00"]
                            const timeString = `${data[0]} ${data[1]}:${data[2]}`;
                            timeOnlyInput.value = timeString;
                            await saveCombinedDeadline();
                        }
                    });

                    // 初期位置設定 (MobileSelectはinit時にpositionを指定するが、動的に計算が必要)
                    if (currentDeadline) {
                        const h = currentDeadline.getHours();
                        const m = currentDeadline.getMinutes();
                        const isPm = h >= 12;
                        const h12 = h % 12 || 12;

                        // Index calculation
                        // Wheel 0: 0=AM, 1=PM
                        // Wheel 1: h12 - 1 (since 1 is index 0)
                        // Wheel 2: m
                        ms.locatePosition(0, isPm ? 1 : 0);
                        ms.locatePosition(1, h12 - 1);
                        ms.locatePosition(2, m);
                    }
                } catch (e) {
                    console.error('WebClass UX: Failed to init MobileSelect', e);
                }
            }, 0);

            deadlineLine.appendChild(dateOnlyInput);
            deadlineLine.appendChild(timeOnlyInput);
            content.appendChild(deadlineLine);

            li.appendChild(content);

            // 削除ボタンを追加（期限切れ、リマインダー期限切れ、完了済み）
            if (showDeleteButton) {
                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.textContent = '削除';
                deleteBtn.title = 'このリマインダーを削除';
                deleteBtn.style.cssText = 'background: transparent; border: 1px solid var(--ux-home-separator); border-radius: 8px; padding: 4px 8px; cursor: pointer; font-size: 14px; opacity: 0.8; color: var(--ux-home-secondary-label); transition: opacity 0.2s, background-color 0.2s, border-color 0.2s, color 0.2s;';
                deleteBtn.onmouseenter = () => { deleteBtn.style.opacity = '1'; };
                deleteBtn.onmouseleave = () => { deleteBtn.style.opacity = '0.7'; };

                deleteBtn.onclick = async (e) => {
                    e.stopPropagation();

                    // 確認ダイアログ
                    if (!confirm(`「${todo.title}」を削除しますか？`)) {
                        return;
                    }

                    // ゴミ箱に追加
                    await addToTrash(todo);

                    await updateAssignment(todo, { isDeleted: true, deletedAt: getWebClassNow().toISOString() });
                    const currentAssignments = await loadAssignments();

                    // UI再描画
                    renderToDoList(currentAssignments, container);

                    // 時間割表の背景色も更新
                    applyTimetableColorsFromTodo(currentAssignments);
                };

                li.appendChild(deleteBtn);
            }

            return li;
        };

        // リスト作成ヘルパー
        // options: createItemに渡すオプション
        const createList = (todos, options = {}) => {
            const ul = document.createElement('ul');
            ul.style.listStyle = 'none';
            ul.style.margin = '0';
            ul.style.padding = '0';
            todos.forEach(t => ul.appendChild(createItem(t, options)));
            return ul;
        };

        // 折りたたみセクション作成ヘルパー
        // stateKey: uiStateのどのキーで開閉状態を保持するか
        const createCollapsible = (title, todos, defaultOpen = false, stateKey = null) => {
            if (todos.length === 0) return null;

            // stateKeyが指定されている場合は、保存された状態を使用
            const isOpen = stateKey && uiState[stateKey] !== undefined ? uiState[stateKey] : defaultOpen;

            const wrapper = document.createElement('div');
            wrapper.style.marginTop = '15px';
            wrapper.style.border = '1px solid var(--ux-home-separator)';
            wrapper.style.borderRadius = '4px';
            // wrapper.style.overflow = 'hidden'; // Removed to allow sticky positioning

            const header = document.createElement('div');
            header.style.padding = '10px 15px';
            header.style.backgroundColor = 'var(--ux-home-surface-muted)';
            header.style.cursor = 'pointer';
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.alignItems = 'center';
            header.style.userSelect = 'none';
            // Sticky Header Styles
            header.style.position = 'sticky';
            header.style.top = '0';
            header.style.zIndex = '10';
            header.style.borderBottom = '1px solid var(--ux-home-separator)';
            header.style.borderTopLeftRadius = '4px';
            header.style.borderTopRightRadius = '4px';

            const titleSpan = document.createElement('span');
            titleSpan.style.fontSize = '0.9em';
            titleSpan.style.fontWeight = 'bold';
            titleSpan.style.color = 'var(--ux-home-secondary-label)';
            titleSpan.textContent = `${title} (${todos.length})`;
            header.appendChild(titleSpan);

            const icon = document.createElement('span');
            icon.textContent = isOpen ? '▼' : '▶';
            icon.style.fontSize = '0.8em';
            icon.style.color = 'var(--ux-home-tertiary-label)';
            header.appendChild(icon);

            const content = document.createElement('div');
            content.style.display = isOpen ? 'block' : 'none';
            content.style.borderTop = '1px solid var(--ux-home-separator)';
            content.appendChild(createList(todos));

            header.onclick = () => {
                const currentlyOpen = content.style.display !== 'none';
                content.style.display = currentlyOpen ? 'none' : 'block';
                icon.textContent = currentlyOpen ? '▶' : '▼';
                // 状態を保存
                if (stateKey) {
                    uiState[stateKey] = !currentlyOpen;
                }
            };

            wrapper.appendChild(header);
            wrapper.appendChild(content);
            return wrapper;
        };

        // --- レンダリング実行 ---

        if (viewMode === 'dashboard') {
            // Switch View 2では各グループを分割せず1つのリストに表示
            const mergedActive = sortTodos([...normal, ...farFuture, ...indefinite, ...expired, ...completedAssignments]);
            if (mergedActive.length > 0) {
                container.appendChild(createList(mergedActive, {}));
            }
        } else {
            // 1. 通常の課題 (常に表示)
            // ※任意期限が過ぎていても初期設定期限が過ぎていなければここに含まれる
            if (sortedNormal.length > 0) {
                container.appendChild(createList(sortedNormal, {}));
            }

            // 2. 1カ月以上先の課題 (折りたたみ・デフォルト閉)
            const farFutureSection = createCollapsible('1カ月以上先の課題', sortedFarFuture, false, 'farFutureSectionOpen');
            if (farFutureSection) container.appendChild(farFutureSection);

            // 4. 期限なしの課題 (折りたたみ・デフォルト閉)
            const indefiniteSection = createCollapsible('期限なしの課題', sortedIndefinite, false, 'indefiniteSectionOpen');
            if (indefiniteSection) container.appendChild(indefiniteSection);
        }

        // 4. 完了済みの課題 (既存のトグルスタイル)
        if (viewMode !== 'dashboard' && completedAssignments.length > 0) {
            // 保存された状態を使用
            const isCompletedOpen = uiState.completedSectionOpen;

            const toggle = document.createElement('div');
            toggle.textContent = isCompletedOpen ? '完了済みの課題を隠す' : `完了済みの課題を表示 (${completedAssignments.length})`;
            toggle.style.padding = '10px 15px';
            toggle.style.fontSize = '0.85em';
            toggle.style.color = 'var(--ux-home-accent-emphasis)';
            toggle.style.cursor = 'pointer';
            toggle.style.textAlign = 'center';
            toggle.style.backgroundColor = 'var(--ux-home-surface-muted)';
            toggle.style.marginTop = '15px';
            toggle.style.borderRadius = '4px';

            const completedContainer = document.createElement('div');
            completedContainer.style.display = isCompletedOpen ? 'block' : 'none';
            completedContainer.style.marginTop = '5px';
            completedContainer.appendChild(createList(completedAssignments, { isCompleted: true, showDeleteButton: true }));

            toggle.onclick = () => {
                const isHidden = completedContainer.style.display === 'none';
                completedContainer.style.display = isHidden ? 'block' : 'none';
                toggle.textContent = isHidden ? '完了済みの課題を隠す' : `完了済みの課題を表示 (${completedAssignments.length})`;
                // 状態を保存
                uiState.completedSectionOpen = isHidden;
            };

            container.appendChild(toggle);
            container.appendChild(completedContainer);
        }

        // 5. 期限切れの課題 (完了済みの下・折りたたみ・デフォルト閉・削除ボタン付き)
        if (viewMode !== 'dashboard' && sortedExpired.length > 0) {
            const expiredWrapper = document.createElement('div');
            expiredWrapper.style.marginTop = '15px';
            expiredWrapper.style.border = '1px solid rgba(255, 69, 58, 0.18)';
            expiredWrapper.style.borderRadius = '4px';

            // 保存された状態を使用（デフォルトは閉じている）
            const isExpiredOpen = uiState.expiredSectionOpen !== undefined ? uiState.expiredSectionOpen : false;

            const expiredHeader = document.createElement('div');
            expiredHeader.style.padding = '10px 15px';
            expiredHeader.style.backgroundColor = 'var(--ux-home-danger-soft)';
            expiredHeader.style.cursor = 'pointer';
            expiredHeader.style.display = 'flex';
            expiredHeader.style.justifyContent = 'space-between';
            expiredHeader.style.alignItems = 'center';
            expiredHeader.style.userSelect = 'none';
            expiredHeader.style.position = 'sticky';
            expiredHeader.style.top = '0';
            expiredHeader.style.zIndex = '10';
            expiredHeader.style.borderBottom = '1px solid rgba(255, 69, 58, 0.18)';
            expiredHeader.style.borderTopLeftRadius = '4px';
            expiredHeader.style.borderTopRightRadius = '4px';

            const expiredTitleSpan = document.createElement('span');
            expiredTitleSpan.style.fontSize = '0.9em';
            expiredTitleSpan.style.fontWeight = 'bold';
            expiredTitleSpan.style.color = 'var(--ux-home-danger-foreground)';
            expiredTitleSpan.textContent = `期限切れの課題 (${sortedExpired.length})`;
            expiredHeader.appendChild(expiredTitleSpan);

            const expiredIcon = document.createElement('span');
            expiredIcon.textContent = isExpiredOpen ? '▼' : '▶';
            expiredIcon.style.fontSize = '0.8em';
            expiredIcon.style.color = 'var(--ux-home-danger-foreground)';
            expiredHeader.appendChild(expiredIcon);

            const expiredContent = document.createElement('div');
            expiredContent.style.display = isExpiredOpen ? 'block' : 'none';
            expiredContent.style.borderTop = '1px solid rgba(255, 69, 58, 0.18)';
            expiredContent.appendChild(createList(sortedExpired, { isExpired: true, showDeleteButton: true }));

            expiredHeader.onclick = () => {
                const currentlyOpen = expiredContent.style.display !== 'none';
                expiredContent.style.display = currentlyOpen ? 'none' : 'block';
                expiredIcon.textContent = currentlyOpen ? '▶' : '▼';
                uiState.expiredSectionOpen = !currentlyOpen;
            };

            expiredWrapper.appendChild(expiredHeader);
            expiredWrapper.appendChild(expiredContent);
            container.appendChild(expiredWrapper);
        }
    }

    /**
     * 授業名編集モーダルを開く
     * 時間割表からコース情報を取得し、ユーザーがカスタム名を編集できるようにする
     */
    async function openCourseNameEditor() {
        uxDebugLog('[WebClass UX] openCourseNameEditor: 関数開始');

        // 既存のモーダルがあれば削除
        const existingModal = document.getElementById('ux-course-name-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Scraperからカスタム名を読み込む
        uxDebugLog('[WebClass UX] openCourseNameEditor: カスタム名を読み込み中...');
        const customNames = await window.WebClassScraper.loadCustomCourseNames();
        uxDebugLog('[WebClass UX] openCourseNameEditor: カスタム名読み込み完了', customNames);

        // 時間割表からコース情報を取得（標準表示とSwitch View 2に対応）
        const scheduleTable = document.querySelector('table.schedule-table') || document.querySelector('table.ux-dashboard-v2-schedule-table');
        uxDebugLog('[WebClass UX] openCourseNameEditor: テーブル検索結果', scheduleTable ? 'found' : 'not found', scheduleTable?.className);
        const courseMap = new Map(); // id -> { fullName, currentDisplayName, link }

        if (scheduleTable) {
            const links = scheduleTable.querySelectorAll('a[href*="course.php"]');
            links.forEach(link => {
                const href = link.getAttribute('href');
                const match = href.match(/course\.php\/([^\/]+)/);
                if (match) {
                    const courseId = match[1];
                    const rawText = link.textContent.trim()
                        .replace(/^»\s*/, '')
                        .replace('締切が近い課題があります。', '')
                        .replace(/新着メッセージ\(\d+\)/, '')
                        .trim();

                    if (!courseMap.has(courseId) && rawText.length > 2) {
                        const autoShortName = window.WebClassScraper.extractCourseName(rawText);
                        const customName = resolveEditedCustomCourseName(customNames[courseId], rawText);
                        courseMap.set(courseId, {
                            fullName: rawText,
                            autoShortName: autoShortName,
                            customName: customName,
                            currentDisplayName: customName || autoShortName
                        });
                    }
                }
            });
        }

        // モーダル作成
        const modal = document.createElement('div');
        modal.id = 'ux-course-name-modal';
        modal.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: var(--ux-home-overlay) !important;
            z-index: 2147483647 !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: rgba(255, 255, 255, 0.96);
            border: 1px solid var(--ux-home-separator);
            border-radius: 14px;
            max-width: 700px;
            width: 90%;
            max-height: 80vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: var(--ux-home-shadow-lg);
        `;

        // ヘッダー
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 15px 20px;
            border-bottom: 1px solid var(--ux-home-separator);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--ux-home-surface-muted);
        `;
        header.innerHTML = `
            <h3 style="margin: 0; font-size: 1.1em; color: var(--ux-home-label);">
                授業名の編集
            </h3>
        `;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            font-size: 1.2em;
            cursor: pointer;
            color: var(--ux-home-secondary-label);
            padding: 5px;
        `;
        closeBtn.onclick = () => modal.remove();
        header.appendChild(closeBtn);

        // コンテンツ
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 20px;
            overflow-y: auto;
            flex: 1;
        `;

        if (courseMap.size === 0) {
            content.innerHTML = `
                <p style="color: var(--ux-home-secondary-label); text-align: center;">
                    時間割表からコースが見つかりませんでした。<br>
                    ホームページの時間割表が表示されていることを確認してください。
                </p>
            `;
        } else {
            const description = document.createElement('p');
            description.style.cssText = 'margin-bottom: 15px; color: var(--ux-home-secondary-label); font-size: 0.9em;';
            description.innerHTML = `
                授業の表示名をカスタマイズできます。<br>
                好きな短縮名に編集してください。
            `;
            content.appendChild(description);

            const table = document.createElement('table');
            table.style.cssText = `
                width: 100%;
                border-collapse: collapse;
            `;

            const thead = document.createElement('thead');
            thead.innerHTML = `
                <tr style="background: var(--ux-home-surface-muted);">
                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid var(--ux-home-separator); width: 50%; color: var(--ux-home-secondary-label);">元の授業名</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid var(--ux-home-separator); width: 50%; color: var(--ux-home-secondary-label);">表示名</th>
                </tr>
            `;
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            courseMap.forEach((info, courseId) => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid var(--ux-home-separator)';

                // 元の授業名
                const tdFull = document.createElement('td');
                tdFull.style.cssText = 'padding: 10px; font-size: 0.85em; color: var(--ux-home-secondary-label); word-break: break-word;';
                tdFull.textContent = info.fullName;
                tr.appendChild(tdFull);

                // 表示名入力（カスタム名がなければ元の授業名をデフォルト値に）
                const tdCustom = document.createElement('td');
                tdCustom.style.padding = '10px';

                const input = document.createElement('input');
                input.type = 'text';
                input.value = info.customName || info.fullName;
                input.dataset.courseId = courseId;
                input.dataset.originalName = info.fullName;
                input.style.cssText = `
                    width: 100%;
                    padding: 6px 10px;
                    border: 1px solid var(--ux-home-separator);
                    border-radius: 8px;
                    font-size: 0.9em;
                    color: var(--ux-home-label);
                    background: var(--ux-home-surface);
                    box-sizing: border-box;
                `;
                input.onfocus = () => {
                    input.style.borderColor = 'var(--ux-home-accent)';
                    input.style.outline = 'none';
                    input.style.boxShadow = 'var(--ux-home-focus-ring)';
                };
                input.onblur = () => {
                    input.style.borderColor = 'var(--ux-home-separator)';
                    input.style.boxShadow = 'none';
                };
                tdCustom.appendChild(input);
                tr.appendChild(tdCustom);

                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            content.appendChild(table);
        }

        // フッター
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 15px 20px;
            border-top: 1px solid var(--ux-home-separator);
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            background: var(--ux-home-surface-muted);
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'キャンセル';
        cancelBtn.style.cssText = `
            padding: 8px 16px;
            border: 1px solid var(--ux-home-separator);
            background: var(--ux-home-surface);
            color: var(--ux-home-secondary-label);
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9em;
        `;
        cancelBtn.onclick = () => modal.remove();

        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'コース名クリア';
        clearBtn.style.cssText = `
            padding: 8px 16px;
            border: 1px solid rgba(255, 69, 58, 0.18);
            background: var(--ux-home-danger-soft);
            color: var(--ux-home-danger-foreground);
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9em;
            margin-right: auto;
        `;
        clearBtn.onclick = async () => {
            if (!confirm('カスタム名をすべて削除して元の表示に戻しますか？')) {
                return;
            }
            clearBtn.disabled = true;
            saveBtn.disabled = true;
            clearBtn.textContent = 'クリア中...';
            try {
                await window.WebClassScraper.saveCustomCourseNames({});
                await updateAssignmentCourseNames({});

                const assignments = await loadAssignments();
                const todoContent = document.querySelector('#ux-dashboard .side-block-content');
                if (todoContent) {
                    renderToDoList(assignments, todoContent);
                }

                await applyCustomCourseNamesToTimetable();
                await applyLlmCourseNamesToDashboardTimetable();
                applyTimetableColorsFromTodo(assignments);

                modal.remove();
                uxDebugLog('[WebClass UX] カスタムコース名を全削除しました');
            } catch (error) {
                console.error('[WebClass UX] カスタムコース名の削除に失敗:', error);
                alert('削除に失敗しました: ' + error.message);
                clearBtn.disabled = false;
                saveBtn.disabled = false;
                clearBtn.textContent = 'コース名クリア';
            }
        };

        const saveBtn = document.createElement('button');
        saveBtn.textContent = '保存して適用';
        saveBtn.style.cssText = `
            padding: 8px 16px;
            border: none;
            background: var(--ux-home-accent);
            color: white;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9em;
        `;
        saveBtn.onclick = async () => {
            saveBtn.disabled = true;
            saveBtn.textContent = '保存中...';

            try {
                // 入力値を収集
                const newCustomNames = {};
                const inputs = content.querySelectorAll('input[data-course-id]');
                inputs.forEach(input => {
                    const courseId = input.dataset.courseId;
                    const customName = resolveEditedCustomCourseName(
                        input.value,
                        input.dataset.originalName || ''
                    );
                    if (customName) {
                        newCustomNames[courseId] = customName;
                    }
                });

                // 保存
                await window.WebClassScraper.saveCustomCourseNames(newCustomNames);

                // 既存の課題データを更新
                await updateAssignmentCourseNames(newCustomNames);

                // UIを更新
                const assignments = await loadAssignments();
                const todoContent = document.querySelector('#ux-dashboard .side-block-content');
                if (todoContent) {
                    renderToDoList(assignments, todoContent);
                }

                // 時間割表にカスタム授業名を適用
                await applyCustomCourseNamesToTimetable();

                // 時間割表の色も更新
                applyTimetableColorsFromTodo(assignments);

                modal.remove();
                uxDebugLog('[WebClass UX] カスタムコース名を保存しました:', newCustomNames);
            } catch (error) {
                console.error('[WebClass UX] カスタムコース名の保存に失敗:', error);
                alert('保存に失敗しました: ' + error.message);
                saveBtn.disabled = false;
                saveBtn.textContent = '保存して適用';
            }
        };

        footer.appendChild(cancelBtn);
        footer.appendChild(clearBtn);
        footer.appendChild(saveBtn);

        dialog.appendChild(header);
        dialog.appendChild(content);
        dialog.appendChild(footer);
        modal.appendChild(dialog);

        // モーダル外クリックで閉じる
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        };

        uxDebugLog('[WebClass UX] openCourseNameEditor: モーダルをDOMに追加します');
        document.body.appendChild(modal);
        uxDebugLog('[WebClass UX] openCourseNameEditor: モーダル追加完了');
    }

    /**
     * 既存の課題データのコース名を更新する
     * @param {Object} customNames - コースID -> カスタム名のマップ
     */
    async function updateAssignmentCourseNames(customNames) {
        const assignments = await loadAssignments();

        // 時間割表からコースID->フルネームのマッピングを取得（標準表示とSwitch View 2に対応）
        const scheduleTable = document.querySelector('table.schedule-table') || document.querySelector('table.ux-dashboard-v2-schedule-table');
        const courseIdMap = new Map(); // コースID -> { fullName }

        if (scheduleTable) {
            const links = scheduleTable.querySelectorAll('a[href*="course.php"]');
            links.forEach(link => {
                const href = link.getAttribute('href');
                const match = href.match(/course\.php\/([^\/]+)/);
                if (match) {
                    const courseId = match[1];
                    const rawText = link.textContent.trim()
                        .replace(/^»\s*/, '')
                        .replace('締切が近い課題があります。', '')
                        .replace(/新着メッセージ\(\d+\)/, '')
                        .trim();
                    if (!courseIdMap.has(courseId) && rawText.length > 2) {
                        courseIdMap.set(courseId, { fullName: rawText });
                    }
                }
            });
        }

        // 課題のcourseフィールドを更新
        let updated = false;
        assignments.forEach(assignment => {
            // URLからコースIDを抽出
            const urlMatch = (assignment.url || '').match(/course\.php\/([^\/]+)/);
            if (urlMatch) {
                const courseId = urlMatch[1];
                const courseInfo = courseIdMap.get(courseId);
                if (courseInfo) {
                    const customName = resolveEditedCustomCourseName(customNames[courseId], courseInfo.fullName);
                    const newDisplayName = customName || window.WebClassScraper.extractCourseName(courseInfo.fullName);
                    if (assignment.course !== newDisplayName) {
                        assignment.course = newDisplayName;
                        updated = true;
                    }
                }
            }
        });

        if (updated) {
            await saveAssignments(assignments);
            uxDebugLog('[WebClass UX] 課題のコース名を更新しました');
        }
    }
    async function applyCustomCourseNamesToTimetable() {
        const scheduleTable = document.querySelector('table.schedule-table');
        if (!scheduleTable) {
            uxDebugLog('[WebClass UX] 時間割表が見つかりません（カスタム名適用スキップ）');
            return;
        }

        // カスタムコース名を読み込む
        const customNames = await window.WebClassScraper.loadCustomCourseNames();

        uxDebugLog('[WebClass UX] 時間割表の授業名を整形中...');

        // 時間割表の各セルを処理
        const cells = scheduleTable.querySelectorAll('tbody td:not(.schedule-table-class_order)');

        cells.forEach(cell => {
            const link = cell.querySelector('a[href*="course.php"]');
            if (!link) return; // 空きコマ

            const href = link.getAttribute('href');
            const match = href.match(/course\.php\/([^\/]+)/);
            if (!match) return;

            const courseId = match[1];

            // 元のテキストを保存（復元用）
            if (!link.dataset.originalText) {
                link.dataset.originalText = link.textContent;
            }

            const originalText = link.dataset.originalText;

            // カスタム名があればそれを使用、なければ元のテキストから「»」を削除
            let newText;
            const customName = resolveEditedCustomCourseName(customNames[courseId], originalText);
            if (customName) {
                newText = customName;
            } else {
                // 「»」と先頭の空白を削除
                newText = originalText.replace(/^»\s*/, '').trim();
            }

            if (link.textContent !== newText) {
                link.textContent = newText;
                uxDebugLog(`[WebClass UX] 時間割セルを更新: ${newText}`);
            }
        });
    }

    function requestOpenAiShortCourseName(fullName, courseId) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                type: 'OPENAI_SHORTEN_COURSE_NAME',
                fullName,
                courseId
            }, (response) => {
                if (chrome.runtime.lastError) {
                    resolve({ success: false, error: chrome.runtime.lastError.message });
                    return;
                }
                resolve(response || { success: false, error: 'No response from background' });
            });
        });
    }

    function fallbackCourseName(fullName) {
        if (window.WebClassScraper?.extractCourseName) {
            return window.WebClassScraper.extractCourseName(fullName);
        }
        return (fullName || '').replace(/^»\s*/, '').trim();
    }

    function ensureLlmStatusElement(scheduleTable) {
        if (!scheduleTable) return null;
        const section = scheduleTable.closest('section');
        if (!section) return null;
        let status = section.querySelector('.ux-llm-course-status');
        if (!status) {
            status = document.createElement('span');
            status.className = 'ux-llm-course-status';
            const dot = document.createElement('span');
            dot.className = 'ux-llm-dot';
            const label = document.createElement('span');
            label.className = 'ux-llm-label';
            label.textContent = 'LLM短縮表示実行中';
            status.appendChild(dot);
            status.appendChild(label);

            const headerRow = section.querySelector('.ux-timetable-header-row');
            if (headerRow) {
                headerRow.appendChild(status);
            } else {
                section.insertBefore(status, section.firstChild);
            }
        }
        return status;
    }

    async function loadLlmStatusVisibilitySetting() {
        const data = await new Promise(resolve => {
            chrome.storage.local.get({ showLlmCourseStatusEnabled: false }, resolve);
        });
        return !!data.showLlmCourseStatusEnabled;
    }

    async function applyLlmCourseNamesToDashboardTimetable(tableElement = null, options = {}) {
        const cacheOnly = !!options.cacheOnly;
        const scheduleTable = tableElement || document.querySelector('table.ux-dashboard-v2-schedule-table');
        if (!scheduleTable) {
            uxDebugLog('[WebClass UX] Dashboard時間割表が見つかりません（LLM短縮スキップ）');
            return;
        }

        const settings = await new Promise(resolve => {
            chrome.storage.local.get({
                useCustomCourseNameEnabled: null,
                useLlmCourseNameEnabled: null,
                useRuleCourseNameEnabled: null,
                useShortCourseNameEnabled: null,
                openaiCourseNameEnabled: false,
                [STORAGE_KEY_SHORT_NAME_MODE_ENABLED]: false,
                [STORAGE_KEY_OPENAI_COURSE_CACHE]: {},
                [STORAGE_KEY_SHORT_COURSE_CACHE]: {}
            }, resolve);
        });

        const legacyShort = settings.useShortCourseNameEnabled;
        const hasNewToggles =
            settings.useCustomCourseNameEnabled !== null && settings.useCustomCourseNameEnabled !== undefined ||
            settings.useLlmCourseNameEnabled !== null && settings.useLlmCourseNameEnabled !== undefined ||
            settings.useRuleCourseNameEnabled !== null && settings.useRuleCourseNameEnabled !== undefined;
        const disableAll = !hasNewToggles && legacyShort === false;
        const customEnabled = disableAll
            ? false
            : (settings.useCustomCourseNameEnabled === null || settings.useCustomCourseNameEnabled === undefined)
                ? true
                : settings.useCustomCourseNameEnabled;
        const openaiEnabled = disableAll
            ? false
            : (settings.useLlmCourseNameEnabled === null || settings.useLlmCourseNameEnabled === undefined)
                ? (!!settings.openaiCourseNameEnabled || !!settings[STORAGE_KEY_SHORT_NAME_MODE_ENABLED])
                : settings.useLlmCourseNameEnabled;
        const ruleEnabled = disableAll
            ? false
            : (settings.useRuleCourseNameEnabled === null || settings.useRuleCourseNameEnabled === undefined)
                ? true
                : settings.useRuleCourseNameEnabled;
        const cache = settings[STORAGE_KEY_OPENAI_COURSE_CACHE] || {};
        const shortCourseCache = { ...(settings[STORAGE_KEY_SHORT_COURSE_CACHE] || {}) };
        let shortCacheTouched = false;
        const rememberShortCourseName = (courseId, sourceName, shortName) => {
            const normalizedSource = normalizeDevdevCourseText(sourceName);
            const normalizedShort = normalizeDevdevCourseText(shortName);
            if (!normalizedSource || !normalizedShort || normalizedSource === normalizedShort) return;

            const idKey = makeShortCourseCacheIdKey(courseId);
            const nameKey = makeShortCourseCacheNameKey(normalizedSource);
            const beforeId = idKey ? shortCourseCache[idKey] : undefined;
            const beforeName = nameKey ? shortCourseCache[nameKey] : undefined;

            putShortCourseCache(shortCourseCache, {
                courseId,
                sourceName: normalizedSource,
                shortName: normalizedShort,
                overwrite: true
            });

            const afterId = idKey ? shortCourseCache[idKey] : undefined;
            const afterName = nameKey ? shortCourseCache[nameKey] : undefined;
            if (beforeId !== afterId || beforeName !== afterName) {
                shortCacheTouched = true;
            }
        };
        const persistShortCourseCacheIfNeeded = async () => {
            if (!shortCacheTouched) return;
            await new Promise(resolve => {
                chrome.storage.local.set({
                    [STORAGE_KEY_SHORT_COURSE_CACHE]: shortCourseCache
                }, resolve);
            });
        };
        const customNames = await window.WebClassScraper.loadCustomCourseNames();

        const links = scheduleTable.querySelectorAll('tbody td a[href*="course.php"]');
        const pendingByKey = new Map();
        const showStatus = await loadLlmStatusVisibilitySetting();
        const statusEl = showStatus ? ensureLlmStatusElement(scheduleTable) : null;

        links.forEach(link => {
            const href = link.getAttribute('href') || '';
            const courseIdFromHref = extractCourseIdFromUrl(href);
            const legacyCourseIdMatch = href.match(/course\.php\/([^\/]+)/);
            const legacyCourseId = legacyCourseIdMatch ? legacyCourseIdMatch[1].trim() : '';
            const courseIdCandidates = Array.from(new Set([courseIdFromHref, legacyCourseId].filter(Boolean)));
            const courseId = courseIdCandidates[0] || '';

            if (!link.dataset.originalText) {
                link.dataset.originalText = link.textContent || '';
            }
            const fullName = (link.dataset.originalText || link.textContent || '').trim();
            if (!fullName) return;

            const customName = resolveEditedCustomCourseName(
                courseId ? customNames[courseId] : '',
                fullName
            );
            if (customEnabled && customName) {
                link.textContent = customName;
                rememberShortCourseName(courseId, fullName, customName);
                return;
            }

            const cacheKeys = [];
            courseIdCandidates.forEach(id => cacheKeys.push(`${id}::${fullName}`));
            cacheKeys.push(fullName);
            const cachedKey = cacheKeys.find(key => typeof cache[key] === 'string' && cache[key].trim());
            if (openaiEnabled && cachedKey) {
                const cached = cache[cachedKey];
                link.textContent = cached;
                rememberShortCourseName(courseId, fullName, cached);
                return;
            }

            if (openaiEnabled) {
                const requestCacheKey = cacheKeys[0] || fullName;
                if (!pendingByKey.has(requestCacheKey)) {
                    pendingByKey.set(requestCacheKey, { fullName, courseId, links: [] });
                }
                pendingByKey.get(requestCacheKey).links.push(link);
                return;
            }

            if (ruleEnabled) {
                const fallback = fallbackCourseName(fullName);
                link.textContent = fallback;
                rememberShortCourseName(courseId, fullName, fallback);
                return;
            }

            link.textContent = fullName;
        });

        if (statusEl) {
            statusEl.style.display = 'inline-flex';
        }

        if (!openaiEnabled || pendingByKey.size === 0) {
            await persistShortCourseCacheIfNeeded();
            return;
        }

        if (cacheOnly) {
            await persistShortCourseCacheIfNeeded();
            return;
        }

        try {
            for (const [cacheKey, payload] of pendingByKey.entries()) {
                const { fullName, courseId, links: targetLinks } = payload;
                const result = await requestOpenAiShortCourseName(fullName, courseId);
                if (result?.success && result.shortName) {
                    cache[cacheKey] = result.shortName;
                    rememberShortCourseName(courseId, fullName, result.shortName);
                    targetLinks.forEach(link => {
                        link.textContent = result.shortName;
                    });
                } else {
                    const fallback = ruleEnabled ? fallbackCourseName(fullName) : fullName;
                    rememberShortCourseName(courseId, fullName, fallback);
                    targetLinks.forEach(link => {
                        link.textContent = fallback;
                    });
                }
            }
        } finally {
            await persistShortCourseCacheIfNeeded();
            // Keep status visibility as-is; this function only updates names.
        }
    }

    /**
     * スマートToDoリストの背景色を時間割表のコマに反映する
     * 優先度: 紫(リマインダー期限切れ) > 赤(48時間以内) > 黄(7日以内)
     * @param {Array} assignments - 課題リスト
     */
    function applyTimetableColorsFromTodo(assignments) {
        const scheduleTable = document.querySelector('table.schedule-table');
        if (!scheduleTable) {
            uxDebugLog('[WebClass UX] 時間割表が見つかりません（色反映スキップ）');
            return;
        }

        // まず全セルの背景色をリセット（元の色に戻す）
        resetTimetableColors(scheduleTable);

        // 削除済み・完了済み・ゴミ箱は除外
        const activeAssignments = assignments.filter(a => !a.isDeleted && !a.isCompleted && !isInTrashBin(a));

        if (activeAssignments.length === 0) {
            uxDebugLog('[WebClass UX] アクティブな課題がありません');
            applyTimetableDayTimeHighlight(scheduleTable);
            return;
        }

        // コースごとに最も優先度の高い色を決定
        // 優先度: 紫(3) > 赤(2) > 黄(1) > なし(0)
        const courseColorMap = new Map(); // コース名 -> { priority, color }

        const now = getWebClassNow();

        activeAssignments.forEach(todo => {
            const courseName = todo.course;
            if (!courseName) return;

            // 期限切れ判定（初期設定期限で判定）
            const deadlineForExpiredCheck = todo.originalDeadline || todo.deadline;
            const deadlineForDisplay = todo.deadline;

            let priority = 0;
            let color = null;

            if (!deadlineForDisplay || deadlineForDisplay === '期限なし') {
                // 期限なし → 色なし
                return;
            }

            const d = new Date(deadlineForDisplay);
            const dOriginal = deadlineForExpiredCheck ? new Date(deadlineForExpiredCheck) : null;

            if (isNaN(d.getTime())) {
                // 日付パース失敗 → 色なし
                return;
            }

            // 初期設定期限が過ぎている場合は期限切れセクションに行くので色なし（グレー扱い）
            if (dOriginal && !isNaN(dOriginal.getTime()) && dOriginal < now) {
                return;
            }

            // 任意期限が過ぎているが初期設定期限はまだ → 紫（最優先）
            if (d < now) {
                priority = 3;
                color = 'var(--ux-home-purple-soft)';
            } else {
                const hoursRemaining = (d - now) / (1000 * 60 * 60);

                if (hoursRemaining <= 48) {
                    priority = 2;
                    color = 'var(--ux-home-danger-soft)';
                } else if (hoursRemaining <= 168) { // 7日 = 168時間
                    priority = 1;
                    color = 'var(--ux-home-warning-soft)';
                }
            }

            if (priority > 0 && color) {
                const existing = courseColorMap.get(courseName);
                if (!existing || priority > existing.priority) {
                    courseColorMap.set(courseName, { priority, color });
                }
            }
        });

        if (courseColorMap.size === 0) {
            uxDebugLog('[WebClass UX] 背景色を設定する課題がありません');
            applyTimetableDayTimeHighlight(scheduleTable);
            return;
        }

        uxDebugLog('[WebClass UX] 時間割表に色を反映するコース:', [...courseColorMap.keys()]);

        // 時間割表の各セルをチェック
        const cells = scheduleTable.querySelectorAll('tbody td:not(.schedule-table-class_order)');

        cells.forEach(cell => {
            // セル内のリンクからコース名を取得
            const link = cell.querySelector('a');
            if (!link) return; // 空きコマ

            const cellText = link.textContent || '';

            // 各コース名とマッチングを試みる
            for (const [courseName, { color }] of courseColorMap) {
                // コース名の一部がセルのテキストに含まれているかチェック
                // 例: 課題のcourse = "離散数学II演習 （計算・先端・情報）"
                //     セル = "» 離散数学II演習 （計算・先端・情報） (2025-後期-火2-13HA014) [河野]"

                if (matchCourseNameToCell(courseName, cellText)) {
                    cell.style.backgroundColor = color;
                    uxDebugLog(`[WebClass UX] 時間割セルに色を適用: ${courseName.substring(0, 20)}... → ${color}`);
                    break; // 最初にマッチしたものを適用
                }
            }
        });
        applyTimetableDayTimeHighlight(scheduleTable);
    }

    /**
     * 時間割表の背景色をリセット（元の色に戻す）
     * @param {HTMLTableElement} scheduleTable - 時間割表のテーブル要素
     */
    function resetTimetableColors(scheduleTable) {
        const cells = scheduleTable.querySelectorAll('tbody td:not(.schedule-table-class_order)');

        cells.forEach(cell => {
            // 元の背景色がデータ属性に保存されていれば復元
            if (cell.dataset.originalBgColor) {
                cell.style.backgroundColor = cell.dataset.originalBgColor;
            } else {
                const removedClasses = [];
                TIMETABLE_HIGHLIGHT_CLASSES.forEach(className => {
                    if (cell.classList.contains(className)) {
                        cell.classList.remove(className);
                        removedClasses.push(className);
                    }
                });
                // 初回実行時: 元の背景色を保存
                const computedStyle = window.getComputedStyle(cell);
                cell.dataset.originalBgColor = computedStyle.backgroundColor;
                removedClasses.forEach(className => cell.classList.add(className));
            }
        });
    }

    /**
     * コース名とセルのテキストをマッチング
     * @param {string} courseName - 課題のコース名
     * @param {string} cellText - セル内のテキスト
     * @returns {boolean} マッチしたかどうか
     */
    function matchCourseNameToCell(courseName, cellText) {
        if (!courseName || !cellText) return false;

        // 「»」を除去し、空白を正規化
        const normalizedCellText = cellText.replace(/»/g, '').trim();
        const normalizedCourseName = courseName.trim();

        // 完全一致または部分一致
        if (normalizedCellText.includes(normalizedCourseName)) {
            return true;
        }

        // コース名からコードや括弧を除いた主要部分で比較
        // 例: "離散数学II演習 （計算・先端・情報） (2025-後期-火2-13HA014) [河野]"
        //     → "離散数学II演習" で比較

        // 全角・半角括弧の前で分割して科目名の主要部分を取得
        const mainCourseName = normalizedCourseName.split(/[（(]/)[0].trim();
        const mainCellName = normalizedCellText.split(/[（(]/)[0].trim();

        if (mainCourseName && mainCellName && mainCourseName === mainCellName) {
            return true;
        }

        // さらに緩い比較: 科目名がセルに含まれている
        if (mainCourseName && normalizedCellText.includes(mainCourseName)) {
            return true;
        }

        return false;
    }

    // --- View State Management ---
    // View mode is derived from defaultViewVersion in options.

    async function getCurrentView() {
        uxDebugLog('WebClass UX: Getting Current View State');
        const data = await chrome.storage.local.get(['currentView', 'defaultViewVersion']);
        uxDebugLog('WebClass UX: Current View retrieved', data);

        // Legacy migration for old view flags.
        const isLegacyCurrentView = data.currentView === 'enhanced' || data.currentView === 'grid';
        const isLegacyDefaultView = data.defaultViewVersion === '1' || data.defaultViewVersion === '3';
        const normalizedDefaultViewVersion = isLegacyDefaultView ? '2' : data.defaultViewVersion;

        const viewFromSettings = normalizedDefaultViewVersion === 'original' ? 'plain' : 'dashboard';
        const updates = {};

        if (isLegacyCurrentView) updates.currentView = 'dashboard';
        if (isLegacyDefaultView) updates.defaultViewVersion = '2';
        if (data.currentView !== viewFromSettings) updates.currentView = viewFromSettings;

        if (Object.keys(updates).length > 0) {
            await chrome.storage.local.set(updates);
        }

        return viewFromSettings;
    }

    /**
     * Dashboard View (Switch View 2) - 3カラムレイアウト
     * ユーザー提案の情報設計に基づいたレイアウト
     */
    async function renderDashboardLayout() {
        // ゴミ箱をキャッシュに読み込む
        await loadTrashBin();

        // Get reference to original container (will be removed after scraping)
        const originalContainer = document.querySelector('.container');

        // === ページ内のリンクを収集 ===
        const acs = getAcsParameter();
        const baseUrl = 'https://kulms.kanagawa-u.ac.jp/webclass/';

        // サイドバーからリンクを取得する関数
        const findLinkByText = (searchTexts) => {
            const allLinks = document.querySelectorAll('a');
            for (const link of allLinks) {
                const text = link.textContent.trim();
                for (const searchText of searchTexts) {
                    if (text.includes(searchText)) {
                        return link.href;
                    }
                }
            }
            return null;
        };
        const logoutLinkOnPage = document.querySelector('a[href*="logout.php"]')?.href
            || findLinkByText(['ログアウト', 'Log out', 'Logout']);
        const fallbackLogoutLink = acs
            ? `${baseUrl}logout.php?acs_=${acs}`
            : `${baseUrl}logout.php`;

        // 各ページへのリンクを収集
        const pageLinks = {
            home: acs ? `${baseUrl}?acs_=${acs}` : baseUrl,
            courseList: findLinkByText(['コース一覧', 'Course List']) || (acs ? `${baseUrl}?acs_=${acs}` : baseUrl),
            availableCourses: findLinkByText(['参加可能なコース', 'コースの追加', 'Available Courses'])
                || (acs ? `${baseUrl}index.php/courses/?acs_=${acs}` : `${baseUrl}index.php/courses/`),
            grades: findLinkByText(['成績', 'Grade', '成績表']) || findLinkByText(['レポート']) || '#',
            learningRecord: findLinkByText(['学習記録', 'Learning Record', 'ビューア']) || '#',
            timetable: findLinkByText(['時間割', 'Timetable', 'Schedule']) || (acs ? `${baseUrl}?acs_=${acs}` : baseUrl),
            messages: acs ? `${baseUrl}msg_editor.php?msgappmode=inbox&acs_=${acs}` : '#',
            logout: logoutLinkOnPage || fallbackLogoutLink,
            settings: chrome.runtime.getURL('src/options.html'),
        };

        const getTermFilterConfig = () => {
            const conditionForms = Array.from(document.querySelectorAll('form[name="condition"]'));
            const termForm = conditionForms.find((form) =>
                form.querySelector('select[name="year"]') && form.querySelector('select[name="semester"]')
            );
            if (!termForm) return null;

            const yearSelect = termForm.querySelector('select[name="year"]');
            const semesterSelect = termForm.querySelector('select[name="semester"]');
            if (!yearSelect || !semesterSelect) return null;

            const serializeSelectOptions = (selectElement) =>
                Array.from(selectElement.options).map((option) => ({
                    value: option.value,
                    text: option.textContent || option.value,
                    selected: option.selected
                }));

            return {
                action: termForm.getAttribute('action') || window.location.href,
                method: (termForm.getAttribute('method') || 'GET').toUpperCase(),
                hiddenEntries: Array.from(new FormData(termForm).entries()).filter(
                    ([name]) => name !== 'year' && name !== 'semester'
                ),
                yearOptions: normalizeAcademicYearOptions(serializeSelectOptions(yearSelect)),
                semesterOptions: serializeSelectOptions(semesterSelect)
            };
        };

        const termFilterConfig = getTermFilterConfig();

        // 通常ヘッダーのアカウント表示（アイコン + メニュー）を取得
        const accountMenuElement = document.querySelector('a[title*="アカウントメニュー"], a[title*="Account"]');
        const accountMenuListElement = accountMenuElement
            ? accountMenuElement.parentElement?.querySelector('ul.dropdown-menu')
            : null;
        const accountIconElement = accountMenuElement ? accountMenuElement.querySelector('img') : null;
        const displayUserIconSrc = accountIconElement ? (accountIconElement.currentSrc || accountIconElement.src || '') : '';

        // Create Dashboard Container
        const dashboardContainer = document.createElement('div');
        dashboardContainer.id = 'ux-dashboard-v2-container';
        dashboardContainer.className = 'ux-dashboard-v2-container';
        let dashboardTimetableLlmApplyPromise = Promise.resolve();
        let dashboardTimetableElement = null;
        let rerenderDashboardTodosAfterCourseNameApply = async () => { };
        runDashboardCourseNameConversionFromSettings = null;
        runTodoApiSyncFromBackground = null;

        const dashboardViewSettings = await new Promise(resolve => {
            chrome.storage.local.get({
                [STORAGE_KEY_AUTO_RUN_COURSE_NAME_CONVERSION]: false,
                [STORAGE_KEY_SHORT_NAME_MODE_ENABLED]: false,
                useCustomCourseNameEnabled: null,
                useLlmCourseNameEnabled: null,
                useRuleCourseNameEnabled: null,
                useShortCourseNameEnabled: null,
                openaiCourseNameEnabled: false,
                debugModeEnabled: false
            }, resolve);
        });
        const autoRunCourseNameConversion = !!dashboardViewSettings[STORAGE_KEY_AUTO_RUN_COURSE_NAME_CONVERSION];
        const debugModeEnabled = !!dashboardViewSettings.debugModeEnabled;
        // レガシー互換性ロジック（options.jsと同じ）
        const legacyShort = dashboardViewSettings.useShortCourseNameEnabled;
        const hasNewToggles =
            dashboardViewSettings.useCustomCourseNameEnabled !== null && dashboardViewSettings.useCustomCourseNameEnabled !== undefined ||
            dashboardViewSettings.useLlmCourseNameEnabled !== null && dashboardViewSettings.useLlmCourseNameEnabled !== undefined ||
            dashboardViewSettings.useRuleCourseNameEnabled !== null && dashboardViewSettings.useRuleCourseNameEnabled !== undefined;
        const disableAll = !hasNewToggles && legacyShort === false;
        const customNameEnabled = disableAll
            ? false
            : (dashboardViewSettings.useCustomCourseNameEnabled === null || dashboardViewSettings.useCustomCourseNameEnabled === undefined)
                ? true
                : dashboardViewSettings.useCustomCourseNameEnabled;
        const llmNameEnabled = disableAll
            ? false
            : (dashboardViewSettings.useLlmCourseNameEnabled === null || dashboardViewSettings.useLlmCourseNameEnabled === undefined)
                ? (!!dashboardViewSettings.openaiCourseNameEnabled || !!dashboardViewSettings[STORAGE_KEY_SHORT_NAME_MODE_ENABLED])
                : dashboardViewSettings.useLlmCourseNameEnabled;
        const ruleNameEnabled = disableAll
            ? false
            : (dashboardViewSettings.useRuleCourseNameEnabled === null || dashboardViewSettings.useRuleCourseNameEnabled === undefined)
                ? true
                : dashboardViewSettings.useRuleCourseNameEnabled;
        // 3つの短縮名設定のいずれかが有効なら、キャッシュからの表示を行う
        const anyCourseNameSettingEnabled = customNameEnabled || llmNameEnabled || ruleNameEnabled;
        let dashboardTimetableSectionElement = null;
        let dashboardTimetableBodyElement = null;
        let dashboardOutOfScheduleSectionElement = null;
        let dashboardTimetableEditMetaElement = null;
        let dashboardTimetableEditToolbarElement = null;
        let dashboardTimetableEditDoneButton = null;
        let dashboardTimetableEditCancelButton = null;
        let dashboardTimetableEditClearButton = null;
        let dashboardTimetableEditStatusElement = null;
        let dashboardTimetableInlineEditActive = false;
        let dashboardTimetableInlineEditDirty = false;
        let dashboardTimetableInlineEditSaving = false;
        let dashboardTimetableLongPressTimer = 0;
        let dashboardTimetableLongPressOrigin = null;
        let dashboardTimetableSuppressClickUntil = 0;

        const getDashboardTimetableEditableCells = () => {
            if (!dashboardTimetableElement) return [];
            return Array.from(dashboardTimetableElement.querySelectorAll('tbody td')).filter((cell) => {
                if (!cell || cell.classList.contains('schedule-table-class_order')) return false;
                return !!cell.querySelector('a[href*="course.php"]');
            });
        };

        const getDashboardTimetableInlineInputs = () => {
            if (!dashboardTimetableElement) return [];
            return Array.from(dashboardTimetableElement.querySelectorAll('.ux-timetable-inline-input'));
        };

        const clearDashboardTimetableLongPress = () => {
            if (dashboardTimetableLongPressTimer) {
                clearTimeout(dashboardTimetableLongPressTimer);
                dashboardTimetableLongPressTimer = 0;
            }
            dashboardTimetableLongPressOrigin = null;
        };

        const updateDashboardTimetableInlineEditControls = () => {
            if (dashboardTimetableSectionElement) {
                dashboardTimetableSectionElement.classList.toggle('ux-timetable-inline-edit-active', dashboardTimetableInlineEditActive);
            }
            if (dashboardTimetableElement) {
                dashboardTimetableElement.classList.toggle('ux-inline-edit-mode', dashboardTimetableInlineEditActive);
            }
            if (dashboardTimetableEditMetaElement) {
                dashboardTimetableEditMetaElement.classList.toggle('is-active', dashboardTimetableInlineEditActive);
            }
            if (dashboardTimetableEditToolbarElement) {
                dashboardTimetableEditToolbarElement.hidden = !dashboardTimetableInlineEditActive;
                dashboardTimetableEditToolbarElement.classList.toggle('is-dirty', dashboardTimetableInlineEditDirty);
                dashboardTimetableEditToolbarElement.classList.toggle('is-saving', dashboardTimetableInlineEditSaving);
            }
            if (dashboardTimetableEditStatusElement) {
                dashboardTimetableEditStatusElement.textContent = dashboardTimetableInlineEditSaving
                    ? '保存中...'
                    : (dashboardTimetableInlineEditDirty ? '編集中' : '編集モード');
            }
            if (dashboardTimetableEditDoneButton) {
                dashboardTimetableEditDoneButton.disabled = dashboardTimetableInlineEditSaving;
                dashboardTimetableEditDoneButton.textContent = dashboardTimetableInlineEditSaving
                    ? '保存中...'
                    : (dashboardTimetableInlineEditDirty ? '保存' : '完了');
            }
            if (dashboardTimetableEditCancelButton) {
                dashboardTimetableEditCancelButton.disabled = dashboardTimetableInlineEditSaving;
            }
            if (dashboardTimetableEditClearButton) {
                dashboardTimetableEditClearButton.disabled = dashboardTimetableInlineEditSaving;
            }
        };

        const refreshDashboardTimetableInlineDirtyState = () => {
            const hasDirtyInput = getDashboardTimetableInlineInputs().some((input) => input.dataset.dirty === 'true');
            dashboardTimetableInlineEditDirty = hasDirtyInput;
            updateDashboardTimetableInlineEditControls();
        };

        const teardownDashboardTimetableInlineEdit = () => {
            getDashboardTimetableInlineInputs().forEach((input) => input.remove());
            if (!dashboardTimetableElement) return;

            dashboardTimetableElement.querySelectorAll('.ux-timetable-inline-link-hidden').forEach((link) => {
                link.classList.remove('ux-timetable-inline-link-hidden');
                link.removeAttribute('aria-hidden');
                link.removeAttribute('tabindex');
            });
            dashboardTimetableElement.querySelectorAll('.ux-inline-editable-cell').forEach((cell) => {
                cell.classList.remove('ux-inline-editable-cell', 'ux-inline-edit-dirty');
                cell.removeAttribute('data-editable-course');
                cell.style.removeProperty('--ux-inline-edit-delay');
            });
            dashboardTimetableInlineEditDirty = false;
        };

        const exitDashboardTimetableInlineEditMode = ({ keepDirtyState = false } = {}) => {
            if (!dashboardTimetableInlineEditActive && !getDashboardTimetableInlineInputs().length) return;
            clearDashboardTimetableLongPress();
            teardownDashboardTimetableInlineEdit();
            dashboardTimetableInlineEditActive = false;
            if (!keepDirtyState) {
                dashboardTimetableInlineEditDirty = false;
            }
            updateDashboardTimetableInlineEditControls();
            requestCourseLayoutSync();
        };

        const focusNextDashboardTimetableInlineInput = (currentInput) => {
            const inputs = getDashboardTimetableInlineInputs();
            const currentIndex = inputs.indexOf(currentInput);
            const nextInput = currentIndex >= 0 ? inputs[currentIndex + 1] : null;
            if (nextInput) {
                nextInput.focus();
                nextInput.select();
            } else if (currentInput) {
                currentInput.blur();
            }
        };

        const saveDashboardTimetableInlineCourseNames = async ({ clearAll = false } = {}) => {
            if (!customNameEnabled || dashboardTimetableInlineEditSaving) return;

            dashboardTimetableInlineEditSaving = true;
            updateDashboardTimetableInlineEditControls();

            try {
                const existingCustomNames = await window.WebClassScraper.loadCustomCourseNames().catch(() => ({}));
                const nextCustomNames = clearAll ? {} : { ...existingCustomNames };

                if (!clearAll) {
                    getDashboardTimetableInlineInputs().forEach((input) => {
                        const courseId = (input.dataset.courseId || '').trim();
                        const originalName = input.dataset.originalName || '';
                        const hadCustom = input.dataset.hadCustom === 'true';
                        const isDirty = input.dataset.dirty === 'true';
                        if (!courseId || (!hadCustom && !isDirty)) {
                            return;
                        }

                        const nextCustomName = resolveEditedCustomCourseName(input.value, originalName);
                        if (nextCustomName) {
                            nextCustomNames[courseId] = nextCustomName;
                        } else {
                            delete nextCustomNames[courseId];
                        }
                    });
                }

                await window.WebClassScraper.saveCustomCourseNames(nextCustomNames);
                await updateAssignmentCourseNames(nextCustomNames);

                exitDashboardTimetableInlineEditMode();

                const assignments = await loadAssignments();
                await applyCustomCourseNamesToTimetable();

                dashboardTimetableLlmApplyPromise = applyLlmCourseNamesToDashboardTimetable(dashboardTimetableElement).catch((error) => {
                    uxDebugWarn('[WebClass UX] Dashboard timetable custom-name apply failed', error);
                });
                await dashboardTimetableLlmApplyPromise;
                await rerenderDashboardTodosAfterCourseNameApply();
                applyTimetableColorsFromTodo(assignments);
                requestCourseLayoutSync();
            } catch (error) {
                console.error('[WebClass UX] インライン授業名編集の保存に失敗:', error);
                alert('授業名の保存に失敗しました: ' + error.message);
            } finally {
                dashboardTimetableInlineEditSaving = false;
                updateDashboardTimetableInlineEditControls();
            }
        };

        const requestDashboardTimetableInlineEditCancel = () => {
            if (dashboardTimetableInlineEditSaving) return;
            if (dashboardTimetableInlineEditDirty && !confirm('未保存の変更を破棄しますか？')) {
                return;
            }
            exitDashboardTimetableInlineEditMode();
        };

        const enterDashboardTimetableInlineEditMode = async () => {
            if (!customNameEnabled || dashboardTimetableInlineEditActive || dashboardTimetableInlineEditSaving || !dashboardTimetableElement) {
                return;
            }

            const editableCells = getDashboardTimetableEditableCells();
            if (!editableCells.length) return;

            clearDashboardTimetableLongPress();
            dashboardTimetableInlineEditActive = true;
            dashboardTimetableInlineEditDirty = false;

            const customNames = await window.WebClassScraper.loadCustomCourseNames().catch(() => ({}));

            editableCells.forEach((cell, index) => {
                const link = cell.querySelector('a[href*="course.php"]');
                if (!link) return;

                const href = link.getAttribute('href') || '';
                const courseId = extractCourseIdFromUrl(href);
                if (!courseId) return;

                if (!link.dataset.originalText) {
                    link.dataset.originalText = link.textContent || '';
                }
                const originalName = normalizeDevdevCourseText(link.dataset.originalText || link.textContent || '');
                const currentDisplayName = normalizeDevdevCourseText(link.textContent || '') || originalName;
                const existingCustomName = resolveEditedCustomCourseName(customNames[courseId], originalName);

                cell.classList.add('ux-inline-editable-cell');
                cell.setAttribute('data-editable-course', 'true');
                cell.style.setProperty('--ux-inline-edit-delay', `${(index % 6) * 45}ms`);

                link.classList.add('ux-timetable-inline-link-hidden');
                link.setAttribute('aria-hidden', 'true');
                link.setAttribute('tabindex', '-1');

                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'ux-timetable-inline-input';
                input.value = currentDisplayName;
                input.placeholder = originalName;
                input.spellcheck = false;
                input.autocomplete = 'off';
                input.dataset.courseId = courseId;
                input.dataset.originalName = originalName;
                input.dataset.initialValue = currentDisplayName;
                input.dataset.hadCustom = existingCustomName ? 'true' : 'false';
                input.dataset.dirty = 'false';

                const syncInputDirtyState = () => {
                    const currentValue = normalizeDevdevCourseText(input.value || '');
                    const initialValue = normalizeDevdevCourseText(input.dataset.initialValue || '');
                    const isDirty = currentValue !== initialValue;
                    input.dataset.dirty = isDirty ? 'true' : 'false';
                    cell.classList.toggle('ux-inline-edit-dirty', isDirty);
                    refreshDashboardTimetableInlineDirtyState();
                };

                input.addEventListener('input', syncInputDirtyState);
                input.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        focusNextDashboardTimetableInlineInput(input);
                    }
                });
                input.addEventListener('focus', () => {
                    cell.classList.add('ux-inline-edit-focus');
                });
                input.addEventListener('blur', () => {
                    cell.classList.remove('ux-inline-edit-focus');
                });

                cell.appendChild(input);
            });

            dashboardTimetableSuppressClickUntil = Date.now() + 800;
            updateDashboardTimetableInlineEditControls();
            requestCourseLayoutSync();
        };

        const handleDashboardTimetablePointerDown = (event) => {
            if (!customNameEnabled || dashboardTimetableInlineEditActive || dashboardTimetableInlineEditSaving || !dashboardTimetableBodyElement) {
                return;
            }
            if (!(event.target instanceof Element) || !dashboardTimetableBodyElement.contains(event.target)) {
                return;
            }
            if (dashboardTimetableEditMetaElement && dashboardTimetableEditMetaElement.contains(event.target)) {
                return;
            }
            if (event.pointerType === 'mouse' && event.button !== 0) {
                return;
            }

            clearDashboardTimetableLongPress();
            dashboardTimetableLongPressOrigin = {
                x: Number.isFinite(event.clientX) ? event.clientX : 0,
                y: Number.isFinite(event.clientY) ? event.clientY : 0
            };
            dashboardTimetableLongPressTimer = window.setTimeout(() => {
                dashboardTimetableLongPressTimer = 0;
                enterDashboardTimetableInlineEditMode();
            }, DASHBOARD_TIMETABLE_INLINE_EDIT_LONG_PRESS_MS);
        };

        const handleDashboardTimetablePointerMove = (event) => {
            if (!dashboardTimetableLongPressOrigin) return;
            const dx = (Number.isFinite(event.clientX) ? event.clientX : 0) - dashboardTimetableLongPressOrigin.x;
            const dy = (Number.isFinite(event.clientY) ? event.clientY : 0) - dashboardTimetableLongPressOrigin.y;
            if (Math.hypot(dx, dy) > DASHBOARD_TIMETABLE_INLINE_EDIT_MOVE_TOLERANCE_PX) {
                clearDashboardTimetableLongPress();
            }
        };

        const handleDashboardTimetableClickCapture = (event) => {
            if (Date.now() < dashboardTimetableSuppressClickUntil) {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        const handleDashboardTimetableInlineEditClick = (event) => {
            if (!dashboardTimetableInlineEditActive) return;
            if (!(event.target instanceof Element) || !dashboardTimetableBodyElement) return;
            if (dashboardTimetableEditMetaElement && dashboardTimetableEditMetaElement.contains(event.target)) return;
            if (event.target.closest('.ux-timetable-inline-input')) return;

            const cell = event.target.closest('td');
            if (!cell || !dashboardTimetableBodyElement.contains(cell)) return;
            if (cell.classList.contains('schedule-table-class_order')) return;
            if (cell.querySelector('a[href*="course.php"]')) return;

            requestDashboardTimetableInlineEditCancel();
        };

        const handleDashboardTimetableInlineEditKeydown = (event) => {
            if (!dashboardTimetableInlineEditActive) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                requestDashboardTimetableInlineEditCancel();
            }
        };

        const runDashboardCourseNameConversion = async () => {
            if (!dashboardTimetableElement) return;
            dashboardTimetableLlmApplyPromise = applyLlmCourseNamesToDashboardTimetable(dashboardTimetableElement).catch((error) => {
                uxDebugWarn('[WebClass UX] Dashboard timetable short-name apply failed', error);
            });
            await dashboardTimetableLlmApplyPromise;
            await rerenderDashboardTodosAfterCourseNameApply();
        };

        runDashboardCourseNameConversionFromSettings = async () => {
            if (!dashboardTimetableElement) {
                throw new Error('Switch View 2 の時間割表が見つかりません。');
            }
            await runDashboardCourseNameConversion();
            await new Promise(resolve => {
                chrome.storage.local.set({ [STORAGE_KEY_SHORT_NAME_MODE_ENABLED]: true }, resolve);
            });
        };

        const applyDashboardCachedCourseNamesToTimetable = async () => {
            if (!dashboardTimetableElement) return;

            const storageData = await new Promise(resolve => {
                chrome.storage.local.get({
                    [STORAGE_KEY_OPENAI_COURSE_CACHE]: {},
                    [STORAGE_KEY_SHORT_COURSE_CACHE]: {}
                }, resolve);
            });
            // カスタム名が有効な場合（カスタム名・LLM・ルールのいずれかが有効な場合）のみ読み込む
            const anyNameSettingForCustom = customNameEnabled || llmNameEnabled || ruleNameEnabled;
            const customNames = anyNameSettingForCustom && window.WebClassScraper?.loadCustomCourseNames
                ? await window.WebClassScraper.loadCustomCourseNames().catch(() => ({}))
                : {};
            // ルールが有効な場合のみshortCourseCacheを使用（LLMはopenaiCacheのみ使用）
            const shortCourseCache = ruleNameEnabled ? (storageData[STORAGE_KEY_SHORT_COURSE_CACHE] || {}) : {};
            const openaiCache = llmNameEnabled ? (storageData[STORAGE_KEY_OPENAI_COURSE_CACHE] || {}) : {};

            const links = dashboardTimetableElement.querySelectorAll('tbody td a[href*="course.php"]');
            links.forEach((link) => {
                if (!link.dataset.originalText) {
                    link.dataset.originalText = link.textContent || '';
                }
                const rawFullName = (link.dataset.originalText || link.textContent || '').trim();
                const fullName = normalizeDevdevCourseText(rawFullName);
                if (!rawFullName) return;

                const href = link.getAttribute('href') || '';
                const courseIdFromHref = extractCourseIdFromUrl(href);
                const legacyCourseIdMatch = href.match(/course\.php\/([^\/]+)/);
                const legacyCourseId = legacyCourseIdMatch ? legacyCourseIdMatch[1].trim() : '';
                const courseIdCandidates = Array.from(new Set([courseIdFromHref, legacyCourseId].filter(Boolean)));
                const courseId = courseIdCandidates[0] || '';

                // カスタム名が有効な場合（カスタム名・LLM・ルールのいずれかが有効な場合）のみ適用
                if (anyNameSettingForCustom) {
                    const customName = resolveEditedCustomCourseName(
                        courseId ? customNames[courseId] : '',
                        rawFullName
                    );
                    if (customName) {
                        link.textContent = customName;
                        return;
                    }
                }

                // LLMが有効な場合は、ルールより先にLLMキャッシュを優先（優先順位: カスタム -> LLM -> ルール）
                if (llmNameEnabled) {
                    const currentTextRaw = (link.textContent || '').trim();
                    const currentText = normalizeDevdevCourseText(currentTextRaw);
                    const keyCandidates = new Set();
                    const pushKeyCandidates = (name) => {
                        const trimmedName = (name || '').trim();
                        if (!trimmedName) return;
                        courseIdCandidates.forEach(id => keyCandidates.add(`${id}::${trimmedName}`));
                        keyCandidates.add(trimmedName);
                        const normalizedName = normalizeDevdevCourseText(trimmedName);
                        if (normalizedName && normalizedName !== trimmedName) {
                            courseIdCandidates.forEach(id => keyCandidates.add(`${id}::${normalizedName}`));
                            keyCandidates.add(normalizedName);
                        }
                    };

                    // 背景スクリプトでは「生文字列」でキー化されるため、生文字列を最優先で確認する。
                    pushKeyCandidates(rawFullName);
                    pushKeyCandidates(currentTextRaw);
                    pushKeyCandidates(fullName);
                    pushKeyCandidates(currentText);

                    for (const key of keyCandidates) {
                        const hit = openaiCache[key];
                        if (typeof hit === 'string' && hit.trim()) {
                            link.textContent = hit;
                            return;
                        }
                    }
                }

                // ルールが有効な場合のみshortCourseCacheから適用
                if (ruleNameEnabled) {
                    const cachedShort = getShortCourseFromCache(shortCourseCache, courseId, [fullName, rawFullName, link.textContent || '']);
                    if (cachedShort) {
                        link.textContent = cachedShort;
                        return;
                    }
                }
            });
        };

        // === Header ===
        const header = document.createElement('header');
        header.className = 'ux-dashboard-v2-header';

        // Left: Logo + WebClass
        const headerLeft = document.createElement('div');
        headerLeft.className = 'ux-dashboard-v2-header-left';
        const logo = document.createElement('a');
        logo.className = 'ux-dashboard-v2-logo';
        logo.href = pageLinks.home;
        logo.textContent = 'WebClass';
        logo.style.textDecoration = 'none';
        logo.style.color = 'inherit';
        headerLeft.appendChild(logo);

        // Center: Main tabs
        const headerCenter = document.createElement('nav');
        headerCenter.className = 'ux-dashboard-v2-header-nav';

        const headerTabs = [
            { name: 'コース', href: pageLinks.courseList, active: true, id: 'tab-course', mainTab: true },
            { name: 'ユーティリティ', href: '#', active: false, id: 'tab-stats', mainTab: true },
            { name: 'デバッグ', href: '#', active: false, id: 'tab-debug', mainTab: true, debugOnly: true },
            { name: '設定', href: '#', active: false, id: 'tab-settings' },
        ];

        const openOptionsSafely = () => {
            if (chrome.runtime?.openOptionsPage) {
                chrome.runtime.openOptionsPage();
                return;
            }
            chrome.runtime?.sendMessage?.({ type: 'OPEN_OPTIONS_PAGE_FALLBACK' }, (res) => {
                if (chrome.runtime.lastError) {
                    uxDebugWarn('openOptionsPage fallback error:', chrome.runtime.lastError.message);
                }
                if (res?.success) return;
                window.open(pageLinks.settings, '_blank');
            });
        };

        let requestCourseLayoutSync = () => { };
        let applyDashboardCourseNamesToOutOfSchedulePanel = async () => { };

        const setActiveDashboardMainTab = (tabId) => {
            headerCenter.querySelectorAll('.ux-dashboard-v2-tab[data-dashboard-main-tab="1"]').forEach((tabEl) => {
                tabEl.classList.remove('active');
            });
            const activeTab = headerCenter.querySelector(`#${tabId}`);
            if (activeTab) {
                activeTab.classList.add('active');
            }
        };

        const switchDashboardMainTab = (tabId) => {
            const timetableSectionEl = document.getElementById('ux-timetable-section');
            const statsSectionEl = document.getElementById('ux-stats-section');
            const debugSectionEl = document.getElementById('ux-debug-section');
            const rightCol = document.querySelector('.ux-dashboard-v2-right');
            const centerCol = document.querySelector('.ux-dashboard-v2-center');
            const outsideCourseSectionEl = document.getElementById('ux-outside-courses-section');

            const showCourse = tabId === 'tab-course';
            const showStats = tabId === 'tab-stats';
            const showDebug = tabId === 'tab-debug' && !!debugSectionEl && !debugSectionEl.hidden;

            if (timetableSectionEl) timetableSectionEl.style.display = showCourse ? 'flex' : 'none';
            if (outsideCourseSectionEl) outsideCourseSectionEl.style.display = showCourse ? 'flex' : 'none';
            if (statsSectionEl) statsSectionEl.style.display = showStats ? 'block' : 'none';
            if (debugSectionEl) debugSectionEl.style.display = showDebug ? 'block' : 'none';

            if (rightCol) rightCol.style.display = showCourse ? 'flex' : 'none';
            if (centerCol) centerCol.style.gridColumn = showCourse ? '' : '1 / -1';
            if (showCourse) requestCourseLayoutSync();
        };

        const activateDashboardMainTab = (tabId) => {
            const currentActiveTabId = headerCenter
                .querySelector('.ux-dashboard-v2-tab[data-dashboard-main-tab="1"].active')
                ?.id;
            if (currentActiveTabId === tabId) {
                return;
            }
            setActiveDashboardMainTab(tabId);
            switchDashboardMainTab(tabId);
        };

        let debugTabEl = null;
        headerTabs.forEach(tabInfo => {
            const tab = document.createElement('a');
            tab.href = tabInfo.href;
            tab.className = 'ux-dashboard-v2-tab' + (tabInfo.active ? ' active' : '');
            tab.textContent = tabInfo.name;
            if (tabInfo.id) tab.id = tabInfo.id;
            if (tabInfo.mainTab) {
                tab.dataset.dashboardMainTab = '1';
            }
            if (tabInfo.id === 'tab-debug') {
                debugTabEl = tab;
                tab.hidden = !debugModeEnabled;
                tab.setAttribute('aria-hidden', debugModeEnabled ? 'false' : 'true');
            }

            if (tabInfo.newTab) {
                tab.target = '_blank';
            }

            // 設定タブはボタン扱いにして遷移させない
            if (tabInfo.id === 'tab-settings') {
                tab.href = 'javascript:void(0)';
                tab.setAttribute('role', 'button');
                const handler = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openOptionsSafely();
                };
                tab.onclick = handler;
                tab.onauxclick = handler; // ミドルクリック対策
            }

            // Handle switching between Course / Utility / Debug
            if (tabInfo.mainTab) {
                tab.onclick = (e) => {
                    e.preventDefault();
                    activateDashboardMainTab(tabInfo.id);
                };
            }
            headerCenter.appendChild(tab);
        });

        // Right: User info
        const headerRight = document.createElement('div');
        headerRight.className = 'ux-dashboard-v2-header-right';
        const inboxButton = document.createElement('a');
        inboxButton.className = 'ux-dashboard-v2-header-link ux-dashboard-v2-inbox';
        inboxButton.href = pageLinks.messages;
        inboxButton.textContent = '受信箱';
        inboxButton.title = 'WebClass標準の受信箱を開く';
        headerRight.appendChild(inboxButton);
        const logoutButton = document.createElement('a');
        logoutButton.className = 'ux-dashboard-v2-header-link ux-dashboard-v2-logout';
        logoutButton.href = pageLinks.logout;
        logoutButton.textContent = 'ログアウト';
        logoutButton.title = 'ログアウト';
        headerRight.appendChild(logoutButton);

        if (displayUserIconSrc) {
            const accountContainer = document.createElement('div');
            accountContainer.className = 'ux-dashboard-v2-account';

            const accountTrigger = document.createElement('button');
            accountTrigger.type = 'button';
            accountTrigger.className = 'ux-dashboard-v2-account-trigger';
            accountTrigger.title = 'アカウントメニュー';
            accountTrigger.setAttribute('aria-haspopup', 'true');
            accountTrigger.setAttribute('aria-expanded', 'false');

            const userIcon = document.createElement('img');
            userIcon.className = 'ux-dashboard-v2-user-icon';
            userIcon.src = displayUserIconSrc;
            userIcon.alt = 'ユーザーアイコン';
            accountTrigger.appendChild(userIcon);

            const accountDropdown = document.createElement('ul');
            accountDropdown.className = 'ux-dashboard-v2-account-menu';
            const isCourseListMenuLabel = (label) => {
                const normalized = (label || '').replace(/\s+/g, '').toLowerCase();
                return normalized.includes('コースリスト') || normalized.includes('courselist');
            };
            const removeRedundantDividers = (menuElement) => {
                let previousWasDivider = true;
                Array.from(menuElement.children).forEach((item) => {
                    const isDivider = item.classList?.contains('divider');
                    if (isDivider && previousWasDivider) {
                        item.remove();
                        return;
                    }
                    previousWasDivider = !!isDivider;
                });
                const lastItem = menuElement.lastElementChild;
                if (lastItem && lastItem.classList?.contains('divider')) {
                    lastItem.remove();
                }
            };

            if (accountMenuListElement) {
                Array.from(accountMenuListElement.children).forEach((child) => {
                    const clonedChild = child.cloneNode(true);
                    const link = clonedChild.querySelector ? clonedChild.querySelector('a') : null;
                    const label = link ? (link.textContent || '').trim() : '';
                    if (link && isCourseListMenuLabel(label)) return;
                    accountDropdown.appendChild(clonedChild);
                });
            } else {
                const fallbackLinks = Array.from(document.querySelectorAll('a.account-menu__menu__link'));
                const seen = new Set();
                fallbackLinks.forEach((link) => {
                    const href = link.getAttribute('href') || '';
                    const label = (link.textContent || '').trim();
                    const key = `${href}::${label}`;
                    if (!label || seen.has(key) || isCourseListMenuLabel(label)) return;
                    seen.add(key);
                    const li = document.createElement('li');
                    li.appendChild(link.cloneNode(true));
                    accountDropdown.appendChild(li);
                });
            }
            removeRedundantDividers(accountDropdown);

            const closeAccountMenu = () => {
                accountContainer.classList.remove('open');
                accountTrigger.setAttribute('aria-expanded', 'false');
            };

            accountTrigger.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const willOpen = !accountContainer.classList.contains('open');
                if (willOpen) {
                    accountContainer.classList.add('open');
                    accountTrigger.setAttribute('aria-expanded', 'true');
                } else {
                    closeAccountMenu();
                }
            });

            accountDropdown.addEventListener('click', (event) => {
                if (event.target && event.target.closest('a')) {
                    closeAccountMenu();
                }
            });

            document.addEventListener('click', (event) => {
                if (!accountContainer.contains(event.target)) {
                    closeAccountMenu();
                }
            });

            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    closeAccountMenu();
                }
            });

            accountContainer.appendChild(accountTrigger);
            accountContainer.appendChild(accountDropdown);
            headerRight.appendChild(accountContainer);
        }

        header.appendChild(headerLeft);
        header.appendChild(headerCenter);
        header.appendChild(headerRight);
        dashboardContainer.appendChild(header);

        // === Main 2-Column Layout (Left Removed) ===
        const mainContent = document.createElement('div');
        mainContent.className = 'ux-dashboard-v2-main';

        // --- Center Column: Timetable ---
        const centerColumn = document.createElement('main');
        centerColumn.className = 'ux-dashboard-v2-center';

        // Get today's day of week
        const today = getWebClassNow();
        const todayWeekdayIndex = today.getDay();

        // Timetable Section (Week View)
        const timetableSection = document.createElement('section');
        timetableSection.id = 'ux-timetable-section';
        timetableSection.className = 'ux-dashboard-v2-section ux-dashboard-v2-timetable';
        timetableSection.style.flex = '0 0 auto';
        timetableSection.style.minHeight = '0';
        timetableSection.style.boxSizing = 'border-box';
        dashboardTimetableSectionElement = timetableSection;

        // タイトル行
        const timetableHeaderRow = document.createElement('div');
        timetableHeaderRow.className = 'ux-timetable-header-row';
        timetableHeaderRow.style.display = 'flex';
        timetableHeaderRow.style.alignItems = 'baseline';
        timetableHeaderRow.style.justifyContent = 'flex-start';
        timetableHeaderRow.style.flexWrap = 'wrap';
        timetableHeaderRow.style.gap = '6px';

        const timetableTitle = document.createElement('h2');
        timetableTitle.textContent = '週間時間割';
        timetableTitle.style.margin = '0';
        timetableTitle.style.lineHeight = '1.2';
        timetableHeaderRow.appendChild(timetableTitle);

        const timetableHeaderActions = document.createElement('div');
        timetableHeaderActions.className = 'ux-timetable-header-actions';

        const addCourseButton = document.createElement('a');
        addCourseButton.className = 'ux-timetable-add-course-btn';
        addCourseButton.href = pageLinks.availableCourses;
        addCourseButton.textContent = 'コースを追加';
        addCourseButton.title = '参加可能なコースを開く';
        timetableHeaderActions.appendChild(addCourseButton);

        if (termFilterConfig && termFilterConfig.yearOptions.length && termFilterConfig.semesterOptions.length) {
            const submitTermFilter = (yearValue, semesterValue) => {
                const submitForm = document.createElement('form');
                submitForm.method = termFilterConfig.method || 'GET';
                submitForm.action = termFilterConfig.action || window.location.href;
                submitForm.style.display = 'none';

                const appendHiddenInput = (name, value) => {
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = name;
                    input.value = value == null ? '' : String(value);
                    submitForm.appendChild(input);
                };

                termFilterConfig.hiddenEntries.forEach(([name, value]) => {
                    appendHiddenInput(name, value);
                });
                appendHiddenInput('year', yearValue);
                appendHiddenInput('semester', semesterValue);

                document.body.appendChild(submitForm);
                submitForm.submit();
            };

            const buildTermSelect = (name, options, ariaLabel, maxVisibleItems = 0) => {
                const itemHeight = 32;
                const listMaxHeight = maxVisibleItems === 0 ? 'none' : `${maxVisibleItems * itemHeight}px`;

                // ネイティブselect（非表示）
                const select = document.createElement('select');
                select.name = name;
                select.className = 'ux-native-select';
                select.setAttribute('aria-label', ariaLabel);

                let selectedIndex = 0;
                options.forEach((item, idx) => {
                    const option = document.createElement('option');
                    option.value = item.value;
                    option.textContent = item.text;
                    option.selected = !!item.selected;
                    if (item.selected) selectedIndex = idx;
                    select.appendChild(option);
                });

                // ラッパー
                const wrap = document.createElement('div');
                wrap.className = 'ux-select-wrap ux-term-select-wrap';

                // 表示ボタン
                const display = document.createElement('button');
                display.type = 'button';
                display.className = 'ux-select-display';
                display.textContent = options[selectedIndex]?.text || '';
                display.style.fontSize = 'var(--ux-select-display-font-size, 14px)';
                display.style.minHeight = '34px';

                // ドロップダウンリスト
                const list = document.createElement('div');
                list.className = 'ux-select-list';
                list.style.maxHeight = listMaxHeight;
                list.style.overflowY = maxVisibleItems === 0 ? 'visible' : 'auto';

                const items = [];
                options.forEach((opt, idx) => {
                    const item = document.createElement('button');
                    item.type = 'button';
                    item.className = 'ux-select-option';
                    item.textContent = opt.text;
                    item.style.fontSize = 'var(--ux-select-option-font-size, 14px)';
                    item.style.minHeight = '34px';
                    item.style.lineHeight = '1.25';
                    if (opt.selected) {
                        item.setAttribute('aria-selected', 'true');
                    }
                    item.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const state = wrap.__uxSelectState;
                        if (!state) return;
                        state.pendingIndex = idx;
                        display.textContent = opt.text;
                        list.querySelectorAll('.ux-select-option').forEach((btn) => btn.removeAttribute('aria-selected'));
                        item.setAttribute('aria-selected', 'true');
                        // コミットして閉じる
                        select.value = opt.value;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                        wrap.classList.remove('ux-open');
                    });
                    list.appendChild(item);
                    items.push(item);
                });

                wrap.appendChild(select);
                wrap.appendChild(display);
                wrap.appendChild(list);

                const state = {
                    select,
                    display,
                    list,
                    items,
                    pendingIndex: selectedIndex
                };
                wrap.__uxSelectState = state;

                // 表示ボタンクリックでトグル
                display.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const isOpen = wrap.classList.contains('ux-open');
                    // 他のオープン中のセレクトを閉じる
                    document.querySelectorAll('.ux-select-wrap.ux-open').forEach((w) => {
                        w.classList.remove('ux-open');
                    });
                    if (!isOpen) {
                        wrap.classList.add('ux-open');
                    }
                });

                return { wrap, select };
            };

            const termFilterWrap = document.createElement('div');
            termFilterWrap.className = 'ux-dashboard-v2-term-filter';

            const { wrap: yearWrap, select: yearSelect } = buildTermSelect('year', termFilterConfig.yearOptions, '年度', 5);
            const { wrap: semesterWrap, select: semesterSelect } = buildTermSelect('semester', termFilterConfig.semesterOptions, '学期', 0);
            const onTermChanged = () => submitTermFilter(yearSelect.value, semesterSelect.value);

            yearSelect.addEventListener('change', onTermChanged);
            semesterSelect.addEventListener('change', onTermChanged);

            termFilterWrap.appendChild(yearWrap);
            termFilterWrap.appendChild(semesterWrap);
            timetableHeaderRow.appendChild(termFilterWrap);

            // 外側クリックで閉じる
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.ux-term-select-wrap')) {
                    document.querySelectorAll('.ux-term-select-wrap.ux-open').forEach((wrap) => {
                        wrap.classList.remove('ux-open');
                    });
                }
            });
        }

        if (customNameEnabled) {
            const editMeta = document.createElement('div');
            editMeta.className = 'ux-timetable-inline-edit-meta';

            const editToolbar = document.createElement('div');
            editToolbar.className = 'ux-timetable-inline-edit-toolbar';
            editToolbar.hidden = true;

            const editStatus = document.createElement('span');
            editStatus.className = 'ux-timetable-inline-edit-status';
            editStatus.textContent = '編集モード';
            editToolbar.appendChild(editStatus);
            dashboardTimetableEditStatusElement = editStatus;

            const clearButton = document.createElement('button');
            clearButton.type = 'button';
            clearButton.className = 'ux-timetable-inline-edit-clear';
            clearButton.textContent = 'クリア';
            clearButton.addEventListener('click', async () => {
                if (!confirm('カスタム授業名をすべて削除して元の表示に戻しますか？')) {
                    return;
                }
                await saveDashboardTimetableInlineCourseNames({ clearAll: true });
            });
            editToolbar.appendChild(clearButton);
            dashboardTimetableEditClearButton = clearButton;

            const cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.className = 'ux-timetable-inline-edit-cancel';
            cancelButton.textContent = 'キャンセル';
            cancelButton.addEventListener('click', () => {
                requestDashboardTimetableInlineEditCancel();
            });
            editToolbar.appendChild(cancelButton);
            dashboardTimetableEditCancelButton = cancelButton;

            const doneButton = document.createElement('button');
            doneButton.type = 'button';
            doneButton.className = 'ux-timetable-inline-edit-done';
            doneButton.textContent = '完了';
            doneButton.addEventListener('click', async () => {
                if (dashboardTimetableInlineEditDirty) {
                    await saveDashboardTimetableInlineCourseNames();
                    return;
                }
                exitDashboardTimetableInlineEditMode();
            });
            editToolbar.appendChild(doneButton);
            dashboardTimetableEditDoneButton = doneButton;

            editMeta.appendChild(editToolbar);
            dashboardTimetableEditToolbarElement = editToolbar;
            dashboardTimetableEditMetaElement = editMeta;
            timetableHeaderActions.appendChild(editMeta);

            document.addEventListener('keydown', handleDashboardTimetableInlineEditKeydown, true);
        }

        timetableHeaderRow.appendChild(timetableHeaderActions);

        timetableSection.appendChild(timetableHeaderRow);

        const timetableBody = document.createElement('div');
        timetableBody.className = 'ux-dashboard-v2-timetable-body';
        dashboardTimetableBodyElement = timetableBody;
        timetableSection.appendChild(timetableBody);

        if (customNameEnabled) {
            timetableBody.addEventListener('pointerdown', handleDashboardTimetablePointerDown);
            timetableBody.addEventListener('pointermove', handleDashboardTimetablePointerMove);
            timetableBody.addEventListener('pointerup', clearDashboardTimetableLongPress);
            timetableBody.addEventListener('pointercancel', clearDashboardTimetableLongPress);
            timetableBody.addEventListener('pointerleave', clearDashboardTimetableLongPress);
            timetableBody.addEventListener('contextmenu', (event) => {
                if (!dashboardTimetableInlineEditActive) {
                    event.preventDefault();
                }
            });
            timetableBody.addEventListener('click', handleDashboardTimetableClickCapture, true);
            timetableBody.addEventListener('click', handleDashboardTimetableInlineEditClick);
            updateDashboardTimetableInlineEditControls();
        }

        // Clone the original timetable if exists
        const originalTable = document.querySelector('.schedule-table');
        if (originalTable) {
            const clonedTable = originalTable.cloneNode(true);
            clonedTable.className = 'ux-dashboard-v2-schedule-table';

            // Highlight today's column and remove empty rows/columns
            const headerCells = clonedTable.querySelectorAll('thead th');
            const bodyRows = clonedTable.querySelectorAll('tbody tr');

            // 1. Identify empty columns (indices to remove)
            // Keep Monday-Friday even when empty. Saturday can still collapse.
            // Start from 1 because index 0 is the period header
            const columnsToRemove = [];

            // Loop through each day column (Monday=1 to Saturday/etc)
            for (let i = 1; i < headerCells.length; i++) {
                if (shouldAlwaysKeepDashboardWeekdayColumn(headerCells[i])) {
                    continue;
                }

                let hasClass = false;

                // Check all rows for this column index
                bodyRows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells[i]) {
                        // Check if cell has content (link or non-empty text that isn't just whitespace)
                        // Usually classes are links <a>
                        if (cells[i].querySelector('a') || cells[i].textContent.trim() !== '') {
                            hasClass = true;
                        }
                    }
                });

                if (!hasClass) {
                    columnsToRemove.push(i);
                }
            }

            // 2. Identify empty rows
            // Keep 1st-5th periods even when empty. 6th-8th can still collapse.
            const rowsToRemove = [];
            bodyRows.forEach((row) => {
                if (shouldAlwaysKeepDashboardPeriodRow(row)) {
                    return;
                }

                let hasClassInRow = false;
                const cells = row.querySelectorAll('td');

                // Check cells in this row (skipping the first cell which is the period label)
                for (let i = 1; i < cells.length; i++) {
                    // Check if content exists
                    if (cells[i].querySelector('a') || cells[i].textContent.trim() !== '') {
                        hasClassInRow = true;
                        break;
                    }
                }

                if (!hasClassInRow) {
                    rowsToRemove.push(row);
                }
            });

            // 3. Remove identified empty columns (in reverse order to keep indices valid)
            for (let i = columnsToRemove.length - 1; i >= 0; i--) {
                const colIndex = columnsToRemove[i];

                // Remove header cell
                if (headerCells[colIndex]) {
                    headerCells[colIndex].remove();
                }

                // Remove body cells in that column
                bodyRows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells[colIndex]) {
                        cells[colIndex].remove();
                    }
                });
            }

            // 4. Remove identified empty rows
            rowsToRemove.forEach(row => row.remove());

            // 5. Clean up remaining empty cells and apply highlights
            const finalBodyRows = clonedTable.querySelectorAll('tbody tr');
            const newHeaderCells = clonedTable.querySelectorAll('thead th');

            finalBodyRows.forEach(row => {
                const cells = row.querySelectorAll('td');
                cells.forEach((cell, index) => {
                    // Skip period column
                    if (index === 0) return;

                    // If cell text is empty or just whitespace, clear it completely for :empty CSS selector
                    if (!cell.querySelector('a') && cell.textContent.trim() === '') {
                        cell.innerHTML = '';
                    }
                });
            });

            newHeaderCells.forEach((th, index) => {
                // Today highlighting logic
                if (index > 0 && getWeekdayIndexFromHeaderText(th.textContent) === todayWeekdayIndex) {
                    th.classList.add('today-highlight');

                    // Highlight corresponding cells in remaining body rows
                    finalBodyRows.forEach(row => {
                        const cells = row.querySelectorAll('td');
                        if (cells[index]) {
                            cells[index].classList.add('today-highlight');
                        }
                    });
                }
            });

            timetableBody.appendChild(clonedTable);
            dashboardTimetableElement = clonedTable;
            dashboardTimetableLlmApplyPromise = Promise.resolve()
                .then(() => {
                    // 3つの短縮名設定のいずれかが有効な場合のみキャッシュから表示
                    if (!anyCourseNameSettingEnabled) return;
                    return applyDashboardCachedCourseNamesToTimetable();
                })
                .then(() => {
                    // 初期表示では、LLM変換APIは呼ばずにLLMキャッシュのみを適用する
                    if (!llmNameEnabled) return;
                    return applyLlmCourseNamesToDashboardTimetable(clonedTable, { cacheOnly: true }).catch((error) => {
                        uxDebugWarn('[WebClass UX] Dashboard cached LLM short-name apply failed', error);
                    });
                })
                .catch((error) => {
                    uxDebugWarn('[WebClass UX] Dashboard cached short-name apply failed', error);
                })
                .then(() => {
                    // autoRunCourseNameConversion: 設定で有効化されている場合のみLLM生成を自動実行
                    if (!autoRunCourseNameConversion) return;
                    return applyLlmCourseNamesToDashboardTimetable(clonedTable).catch((error) => {
                        uxDebugWarn('[WebClass UX] Dashboard timetable short-name apply failed', error);
                    });
                });
        } else {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'ux-dashboard-v2-timetable-empty';
            emptyMessage.textContent = '時間割表が見つかりません';
            timetableBody.appendChild(emptyMessage);
        }

        centerColumn.appendChild(timetableSection);

        // --- Stats / Misc Links Section ---
        const statsSection = document.createElement('section');
        statsSection.id = 'ux-stats-section';
        statsSection.className = 'ux-dashboard-v2-section ux-dashboard-v2-stats';
        statsSection.style.display = 'none'; // Hidden by default

        // Removed header text
        // const statsTitle = document.createElement('h2');
        // statsTitle.textContent = 'スタッツ・その他';
        // statsSection.appendChild(statsTitle);

        const statsContent = document.createElement('div');
        statsContent.className = 'ux-dashboard-v2-stats-content';

        // Collect miscellaneous links from original sidebar
        const statsLinks = [
            { text: '成績', keyword: '成績', href: pageLinks.grades },
            { text: '課題実施状況一覧', keyword: 'ダッシュボード' },
            { text: '学修と振り返りの記録', keyword: '学修レポート' },
            { text: '学習記録ビューア', keyword: 'コース活動状況' },
            { text: 'FAQ (学生向け)', keyword: 'FAQ' },
            { text: 'マニュアル (学生向け)', keyword: 'マニュアル' },
            { text: '学修レポートについて', keyword: '学修レポートについて' },
            { text: '問い合わせ先', keyword: '問い合わせ' }
        ];

        const statsList = document.createElement('ul');
        statsList.className = 'ux-dashboard-v2-stats-list';

        statsLinks.forEach(item => {
            const href = item.href || findLinkByText([item.keyword, item.text]);
            if (href && href !== '#') {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = href;
                a.textContent = item.text;
                li.appendChild(a);
                statsList.appendChild(li);
            }
        });

        statsContent.appendChild(statsList);
        statsSection.appendChild(statsContent);
        centerColumn.appendChild(statsSection);

        const debugSection = document.createElement('section');
        debugSection.id = 'ux-debug-section';
        debugSection.className = 'ux-dashboard-v2-section ux-dashboard-v2-debug';
        debugSection.style.display = 'none';
        debugSection.hidden = !debugModeEnabled;

        const debugTitle = document.createElement('h2');
        debugTitle.textContent = 'デバッグ';
        debugSection.appendChild(debugTitle);

        const debugIntro = document.createElement('p');
        debugIntro.className = 'ux-dashboard-v2-debug-intro';
        debugIntro.textContent = 'デバッグモード用の確認・疑似操作をここにまとめています。';
        debugSection.appendChild(debugIntro);

        const debugGrid = document.createElement('div');
        debugGrid.className = 'ux-dashboard-v2-debug-grid';

        const debugMessageCard = document.createElement('section');
        debugMessageCard.className = 'ux-dashboard-v2-debug-card';
        const debugMessageTitle = document.createElement('h3');
        debugMessageTitle.textContent = 'メッセージ';
        const debugMessageDescription = document.createElement('p');
        debugMessageDescription.textContent = '未読メッセージを疑似追加して表示を確認できます。';
        const debugMessageActions = document.createElement('div');
        debugMessageActions.className = 'ux-dashboard-v2-debug-actions';
        debugMessageCard.appendChild(debugMessageTitle);
        debugMessageCard.appendChild(debugMessageDescription);
        debugMessageCard.appendChild(debugMessageActions);

        const debugToolsCard = document.createElement('section');
        debugToolsCard.className = 'ux-dashboard-v2-debug-card';
        const debugToolsTitle = document.createElement('h3');
        debugToolsTitle.textContent = 'devdev ツール';
        const debugToolsDescription = document.createElement('p');
        debugToolsDescription.textContent = '時刻固定やデバッグ用 TODO 作成などの確認操作です。';
        const devdevTimeContainer = document.createElement('div');
        devdevTimeContainer.className = 'ux-dashboard-v2-debug-actions ux-dashboard-v2-debug-devtools';
        appendDevdevCourseTodoCreator(devdevTimeContainer, {
            onAfterCreate: async () => {
                await updateAssignments({ forceRemote: false });
            }
        });
        appendDevdevTimeControls(devdevTimeContainer);
        debugToolsCard.appendChild(debugToolsTitle);
        debugToolsCard.appendChild(debugToolsDescription);
        debugToolsCard.appendChild(devdevTimeContainer);

        debugGrid.appendChild(debugMessageCard);
        debugGrid.appendChild(debugToolsCard);
        debugSection.appendChild(debugGrid);
        centerColumn.appendChild(debugSection);

        const syncDebugTabVisibility = (enabled = uxIsDebugModeEnabled()) => {
            const showDebug = !!enabled;
            debugSection.hidden = !showDebug;
            if (debugTabEl) {
                debugTabEl.hidden = !showDebug;
                debugTabEl.setAttribute('aria-hidden', showDebug ? 'false' : 'true');
            }
            if (!showDebug) {
                debugSection.style.display = 'none';
                if (debugTabEl?.classList.contains('active')) {
                    activateDashboardMainTab('tab-course');
                }
            }
        };
        syncDebugTabVisibility(debugModeEnabled);
        onUxDebugModeChange((enabled) => {
            syncDebugTabVisibility(enabled);
        });

        // --- Right Column: ToDo + Announcements ---
        const rightColumn = document.createElement('aside');
        rightColumn.className = 'ux-dashboard-v2-right';

        // ToDo Section
        const todoSection = document.createElement('section');
        todoSection.className = 'ux-dashboard-v2-section ux-dashboard-v2-todo';
        todoSection.style.display = 'flex';
        todoSection.style.flexDirection = 'column';
        // Keep the card stretched by layout instead of syncing a fixed pixel height.
        todoSection.style.flex = '1';
        todoSection.style.minHeight = '0';
        todoSection.style.overflow = 'hidden';

        const todoHeader = document.createElement('div');
        todoHeader.className = 'ux-dashboard-v2-section-header';
        todoHeader.style.display = 'flex';
        todoHeader.style.justifyContent = 'space-between';
        todoHeader.style.alignItems = 'center';

        const todoTitle = document.createElement('h2');
        todoTitle.textContent = 'My TODOs';
        todoHeader.appendChild(todoTitle);

        // Refresh Button (Icon only style) - Updated to UI1 style
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'ux-dashboard-v2-todo-refresh ux-refresh-btn';
        refreshBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
        refreshBtn.style.padding = '6px';
        refreshBtn.style.border = 'none';
        refreshBtn.style.background = 'transparent';
        refreshBtn.style.color = 'var(--ux-home-secondary-label)';
        refreshBtn.style.cursor = 'pointer';
        refreshBtn.title = '更新';
        todoHeader.appendChild(refreshBtn);

        todoSection.appendChild(todoHeader);

        let dashboardAssignments = [];
        let viewCompleted = false;

        // Status Cards
        const statsContainer = document.createElement('div');
        statsContainer.style.display = 'flex';
        statsContainer.style.gap = '15px';
        statsContainer.style.marginBottom = '20px';

        const createStatCard = (label, count, colorClass) => {
            const card = document.createElement('div');
            card.className = 'ux-todo-stat-card';
            card.style.flex = '1';
            card.style.padding = '15px';
            card.style.borderRadius = '12px';
            card.style.textAlign = 'center';
            card.style.boxShadow = 'var(--ux-home-shadow-sm)';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.alignItems = 'center';
            card.style.justifyContent = 'center';

            // Colors
            let bg = 'var(--ux-home-surface)';
            let text = 'var(--ux-home-label)';
            if (colorClass === 'blue') { bg = 'var(--ux-home-accent-soft)'; text = 'var(--ux-home-accent-emphasis)'; }
            if (colorClass === 'green') { bg = 'var(--ux-home-success-soft)'; text = 'var(--ux-home-success-foreground)'; }
            if (colorClass === 'red') { bg = 'var(--ux-home-danger-soft)'; text = 'var(--ux-home-danger-foreground)'; }

            card.style.backgroundColor = bg;
            card.style.color = text;

            const countSpan = document.createElement('span');
            countSpan.style.fontSize = '1.8em';
            countSpan.style.fontWeight = 'bold';
            countSpan.style.lineHeight = '1';
            countSpan.style.marginBottom = '4px';
            countSpan.textContent = count;

            const labelSpan = document.createElement('span');
            labelSpan.style.fontSize = '0.85em';
            labelSpan.style.opacity = '0.9';
            labelSpan.textContent = label;

            card.appendChild(countSpan);
            card.appendChild(labelSpan);
            return { card, update: (n) => countSpan.textContent = n };
        };

        const totalCard = createStatCard('Total', 0, 'blue');
        const doneCard = createStatCard('Done', 0, 'green');
        const pendingCard = createStatCard('Pending', 0, 'red');

        statsContainer.appendChild(totalCard.card);
        statsContainer.appendChild(doneCard.card);
        statsContainer.appendChild(pendingCard.card);
        todoSection.appendChild(statsContainer);

        // View Completed Toggle
        const toggleContainer = document.createElement('div');
        toggleContainer.style.display = 'flex';
        toggleContainer.style.justifyContent = 'space-between';
        toggleContainer.style.alignItems = 'center';
        toggleContainer.style.marginBottom = '15px';
        toggleContainer.style.padding = '0 5px';

        const toggleLabel = document.createElement('span');
        toggleLabel.textContent = 'View Completed';
        toggleLabel.style.fontWeight = '500';
        toggleLabel.style.fontSize = '0.95em';
        toggleLabel.style.color = 'var(--ux-home-secondary-label)';

        const toggleSwitch = document.createElement('label');
        toggleSwitch.style.position = 'relative';
        toggleSwitch.style.display = 'inline-block';
        toggleSwitch.style.width = '40px';
        toggleSwitch.style.height = '24px';

        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.checked = viewCompleted;
        toggleInput.style.opacity = '0';
        toggleInput.style.width = '0';
        toggleInput.style.height = '0';

        const toggleSlider = document.createElement('span');
        toggleSlider.style.position = 'absolute';
        toggleSlider.style.cursor = 'pointer';
        toggleSlider.style.top = '0';
        toggleSlider.style.left = '0';
        toggleSlider.style.right = '0';
        toggleSlider.style.bottom = '0';
        toggleSlider.style.backgroundColor = 'var(--ux-home-quaternary-label)';
        toggleSlider.style.transition = '.4s';
        toggleSlider.style.borderRadius = '24px';

        const toggleKnob = document.createElement('span');
        toggleKnob.style.position = 'absolute';
        toggleKnob.style.content = '""';
        toggleKnob.style.height = '16px';
        toggleKnob.style.width = '16px';
        toggleKnob.style.left = '4px';
        toggleKnob.style.bottom = '4px';
        toggleKnob.style.backgroundColor = 'white';
        toggleKnob.style.transition = '.4s';
        toggleKnob.style.borderRadius = '50%';

        toggleSlider.appendChild(toggleKnob);
        toggleSwitch.appendChild(toggleInput);
        toggleSwitch.appendChild(toggleSlider);

        toggleInput.addEventListener('change', async () => {
            viewCompleted = toggleInput.checked;
            if (viewCompleted) {
                toggleSlider.style.backgroundColor = 'var(--ux-home-accent)';
                toggleKnob.style.transform = 'translateX(16px)';
            } else {
                toggleSlider.style.backgroundColor = 'var(--ux-home-quaternary-label)';
                toggleKnob.style.transform = 'translateX(0)';
            }
            await renderDashboardTodos(dashboardAssignments);
            requestStabilizedCourseLayoutSync();
        });

        toggleContainer.appendChild(toggleLabel);
        toggleContainer.appendChild(toggleSwitch);
        todoSection.appendChild(toggleContainer);

        const todoStatus = document.createElement('div'); // Dummy for compatibility
        const todoListContainer = document.createElement('div');
        todoListContainer.className = 'ux-dashboard-v2-todo-list';
        todoListContainer.style.flex = '1';
        todoListContainer.style.minHeight = '0';
        todoListContainer.style.maxHeight = 'none';
        todoListContainer.style.overflowY = 'auto';
        const DASHBOARD_TIMETABLE_BOTTOM_LIFT_PX = 300; // 時間割表の底辺を調整したい場合はこの数値を変更する。

        const clearDashboardInlineLayoutSizing = () => {
            timetableSection.style.height = '';
            todoSection.style.height = '';
            if (dashboardOutOfScheduleSectionElement) {
                dashboardOutOfScheduleSectionElement.style.height = '';
            }
            if (!dashboardTimetableElement) return;
            dashboardTimetableElement.style.height = '';
            dashboardTimetableElement.querySelectorAll('tbody tr > *').forEach((cell) => {
                cell.style.height = '';
            });
        };

        const getDashboardOutOfScheduleMinimumHeight = () => {
            if (!dashboardOutOfScheduleSectionElement) return 0;

            const headerEl = dashboardOutOfScheduleSectionElement.querySelector('.ux-dashboard-v2-section-header');
            const bodyEl = dashboardOutOfScheduleSectionElement.querySelector('.ux-dashboard-v2-outside-courses-body');
            if (!headerEl || !bodyEl) return 0;

            const sectionStyle = window.getComputedStyle(dashboardOutOfScheduleSectionElement);
            const headerStyle = window.getComputedStyle(headerEl);
            const sectionVerticalChrome =
                (parseFloat(sectionStyle.paddingTop) || 0) +
                (parseFloat(sectionStyle.paddingBottom) || 0) +
                (parseFloat(sectionStyle.borderTopWidth) || 0) +
                (parseFloat(sectionStyle.borderBottomWidth) || 0);
            const headerHeight =
                Math.ceil(headerEl.getBoundingClientRect().height) +
                (parseFloat(headerStyle.marginBottom) || 0);

            const listEl = bodyEl.querySelector('.ux-dashboard-v2-outside-courses-list');
            const emptyEl = bodyEl.querySelector('.ux-dashboard-v2-outside-courses-empty');
            let bodyContentHeight = 0;

            if (listEl) {
                const visibleItems = Array.from(listEl.children).slice(0, 2);
                const listStyle = window.getComputedStyle(listEl);
                const gap = parseFloat(listStyle.rowGap || listStyle.gap || '0') || 0;
                bodyContentHeight = visibleItems.reduce((sum, item) => {
                    return sum + Math.ceil(item.getBoundingClientRect().height);
                }, 0);
                bodyContentHeight += gap * Math.max(0, visibleItems.length - 1);
            } else if (emptyEl) {
                bodyContentHeight = Math.ceil(emptyEl.getBoundingClientRect().height);
            }

            if (!bodyContentHeight) {
                bodyContentHeight = Math.ceil(bodyEl.getBoundingClientRect().height);
            }

            return Math.ceil(sectionVerticalChrome + headerHeight + bodyContentHeight + 1);
        };

        const getDashboardOutOfScheduleTargetHeight = () => {
            const minimumHeight = getDashboardOutOfScheduleMinimumHeight();
            if (!minimumHeight) return 0;
            return minimumHeight;
        };

        const getDashboardCenterColumnSectionGap = () => {
            const centerColumnStyle = window.getComputedStyle(centerColumn);
            return parseFloat(centerColumnStyle.rowGap || centerColumnStyle.gap || '0') || 0;
        };

        const isDashboardStackedLayout = () => {
            const centerRect = centerColumn.getBoundingClientRect();
            const rightRect = rightColumn.getBoundingClientRect();
            if (!centerRect.width || !rightRect.width) {
                return window.matchMedia('(max-width: 1200px)').matches;
            }
            return (rightRect.top - centerRect.top) > 8;
        };

        const syncDashboardTimetableSectionHeight = () => {
            if (window.getComputedStyle(timetableSection).display === 'none') return;

            const timetableSectionRect = timetableSection.getBoundingClientRect();
            const todoSectionRect = todoSection.getBoundingClientRect();
            const totalAvailableHeight = Math.floor(todoSectionRect.bottom - timetableSectionRect.top);
            const outOfScheduleTargetHeight = getDashboardOutOfScheduleTargetHeight();
            const sectionGap = getDashboardCenterColumnSectionGap();
            const targetHeight = outOfScheduleTargetHeight > 0
                ? Math.floor(totalAvailableHeight - outOfScheduleTargetHeight - sectionGap)
                : Math.floor(totalAvailableHeight - DASHBOARD_TIMETABLE_BOTTOM_LIFT_PX);
            if (!Number.isFinite(targetHeight) || targetHeight <= 0) return;

            const nextHeight = `${targetHeight}px`;
            if (timetableSection.style.height !== nextHeight) {
                timetableSection.style.height = nextHeight;
            }
        };

        const getDashboardTimetableNaturalSectionHeight = () => {
            if (!timetableBody) return 0;

            const sectionStyle = window.getComputedStyle(timetableSection);
            const sectionVerticalChrome =
                (parseFloat(sectionStyle.paddingTop) || 0) +
                (parseFloat(sectionStyle.paddingBottom) || 0) +
                (parseFloat(sectionStyle.borderTopWidth) || 0) +
                (parseFloat(sectionStyle.borderBottomWidth) || 0);
            const headerHeight = timetableHeaderRow
                ? Math.ceil(timetableHeaderRow.getBoundingClientRect().height)
                : 0;
            const bodyContentHeight = Math.ceil(timetableBody.scrollHeight);

            return Math.ceil(sectionVerticalChrome + headerHeight + bodyContentHeight);
        };

        const syncDashboardOutOfScheduleSectionHeight = () => {
            if (!dashboardOutOfScheduleSectionElement) return;
            if (window.getComputedStyle(dashboardOutOfScheduleSectionElement).display === 'none') return;

            const targetHeight = getDashboardOutOfScheduleTargetHeight();
            if (!Number.isFinite(targetHeight) || targetHeight <= 0) return;

            const nextHeight = `${targetHeight}px`;
            if (dashboardOutOfScheduleSectionElement.style.height !== nextHeight) {
                dashboardOutOfScheduleSectionElement.style.height = nextHeight;
            }
        };

        const stretchDashboardTimetableToBody = () => {
            if (!dashboardTimetableElement || !timetableBody) return;
            if (window.getComputedStyle(timetableSection).display === 'none') return;

            const availableHeight = Math.floor(timetableBody.clientHeight);
            if (!Number.isFinite(availableHeight) || availableHeight <= 0) return;

            const bodyRows = Array.from(dashboardTimetableElement.querySelectorAll('tbody tr'));
            if (bodyRows.length === 0) return;

            const tableStyle = window.getComputedStyle(dashboardTimetableElement);
            const spacingTokens = (tableStyle.borderSpacing || '0').trim().split(/\s+/);
            const spacingY = parseFloat(spacingTokens[1] || spacingTokens[0] || '0') || 0;
            const theadHeight = dashboardTimetableElement.tHead
                ? Math.ceil(dashboardTimetableElement.tHead.getBoundingClientRect().height)
                : 0;
            const spacingAllowance = spacingY * (bodyRows.length + 2);
            const computedRowHeight = Math.floor((availableHeight - theadHeight - spacingAllowance) / bodyRows.length);
            if (!Number.isFinite(computedRowHeight) || computedRowHeight <= 0) return;

            const nextTableHeight = `${availableHeight}px`;
            if (dashboardTimetableElement.style.height !== nextTableHeight) {
                dashboardTimetableElement.style.height = nextTableHeight;
            }
            const nextCellHeight = `${computedRowHeight}px`;
            bodyRows.forEach((row) => {
                Array.from(row.children).forEach((cell) => {
                    if (cell.style.height !== nextCellHeight) {
                        cell.style.height = nextCellHeight;
                    }
                });
            });
        };

        const getDashboardTimetableFitMetrics = () => {
            if (!dashboardTimetableElement || !timetableBody) return null;

            const availableHeight = Math.floor(timetableBody.clientHeight);
            if (!Number.isFinite(availableHeight) || availableHeight <= 0) return null;

            const bodyRows = Array.from(dashboardTimetableElement.querySelectorAll('tbody tr'));
            if (bodyRows.length === 0) return null;

            const tableStyle = window.getComputedStyle(dashboardTimetableElement);
            const spacingTokens = (tableStyle.borderSpacing || '0').trim().split(/\s+/);
            const spacingY = parseFloat(spacingTokens[1] || spacingTokens[0] || '0') || 0;
            const theadHeight = dashboardTimetableElement.tHead
                ? Math.ceil(dashboardTimetableElement.tHead.getBoundingClientRect().height)
                : 0;
            const spacingAllowance = spacingY * (bodyRows.length + 2);
            const computedRowHeight = Math.floor((availableHeight - theadHeight - spacingAllowance) / bodyRows.length);

            return {
                availableHeight,
                bodyRowCount: bodyRows.length,
                computedRowHeight
            };
        };

        let courseLayoutSyncRafId = 0;

        const scheduleCourseLayoutSync = () => {
            if (courseLayoutSyncRafId && typeof window.cancelAnimationFrame === 'function') {
                window.cancelAnimationFrame(courseLayoutSyncRafId);
            }

            const runSync = () => {
                courseLayoutSyncRafId = 0;
                clearDashboardInlineLayoutSizing();
                if (timetableBody) {
                    timetableBody.classList.remove('ux-scroll-managed-fit', 'ux-scroll-managed-natural');
                }
                if (dashboardTimetableElement) {
                    dashboardTimetableElement.classList.remove('ux-compact-density');
                }
                if (isDashboardStackedLayout()) {
                    return;
                }
                syncDashboardOutOfScheduleSectionHeight();

                syncDashboardTimetableSectionHeight();
                const targetHeight = parseFloat(timetableSection.style.height || '0') || 0;
                const naturalHeight = getDashboardTimetableNaturalSectionHeight();
                const fitMetrics = getDashboardTimetableFitMetrics();
                const fitRowHeight = fitMetrics?.computedRowHeight || 0;
                const canUseCompactFit = fitRowHeight >= 68;

                if (!targetHeight || !naturalHeight || (!canUseCompactFit && naturalHeight > targetHeight)) {
                    timetableSection.style.height = '';
                    if (timetableBody) {
                        timetableBody.classList.add('ux-scroll-managed-natural');
                    }
                    return;
                }

                if (dashboardTimetableElement && (naturalHeight > targetHeight || fitRowHeight < 90)) {
                    dashboardTimetableElement.classList.add('ux-compact-density');
                }
                if (timetableBody) {
                    timetableBody.classList.add('ux-scroll-managed-fit');
                }
                stretchDashboardTimetableToBody();
                syncDashboardOutOfScheduleSectionHeight();
            };

            if (typeof window.requestAnimationFrame === 'function') {
                courseLayoutSyncRafId = window.requestAnimationFrame(runSync);
                return;
            }

            setTimeout(runSync, 0);
        };

        const requestStabilizedCourseLayoutSync = () => {
            scheduleCourseLayoutSync();
            setTimeout(scheduleCourseLayoutSync, 32);
            setTimeout(scheduleCourseLayoutSync, 120);
        };
        requestCourseLayoutSync = requestStabilizedCourseLayoutSync;

        if (typeof ResizeObserver === 'function') {
            const timetableResizeObserver = new ResizeObserver(() => {
                scheduleCourseLayoutSync();
            });
            timetableResizeObserver.observe(centerColumn);
            timetableResizeObserver.observe(rightColumn);
            timetableResizeObserver.observe(timetableSection);
            timetableResizeObserver.observe(timetableBody);
            timetableResizeObserver.observe(todoSection);
        }
        window.addEventListener('resize', scheduleCourseLayoutSync);
        window.addEventListener('pageshow', requestStabilizedCourseLayoutSync);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                requestStabilizedCourseLayoutSync();
            }
        });

        const renderDashboardTodos = async (assignments) => {
            dashboardAssignments = assignments || [];
            const visibleAssignments = debugModeEnabled
                ? dashboardAssignments
                : dashboardAssignments.filter(a => a?.category !== 'devdev');

            // Stats
            const total = visibleAssignments.length;
            const done = visibleAssignments.filter(a => a.isCompleted).length;
            const pending = total - done;

            totalCard.update(total);
            doneCard.update(done);
            pendingCard.update(pending);

            // Filter
            let filtered = [...visibleAssignments];
            if (viewCompleted) {
                filtered = filtered.filter(a => a.isCompleted);
            } else {
                filtered = filtered.filter(a => !a.isCompleted);
            }

            // Custom sort for dashboard: High -> Medium -> Low -> Done
            filtered.sort((a, b) => {
                const pA = getTodoPriority(a);
                const pB = getTodoPriority(b);
                const score = { 'High': 3, 'Medium': 2, 'Low': 1, 'Done': 0 };
                if (score[pA] !== score[pB]) return score[pB] - score[pA];
                // Same priority -> Date asc
                const dA = a.deadline ? new Date(a.deadline) : new Date('2100-01-01');
                const dB = b.deadline ? new Date(b.deadline) : new Date('2100-01-01');
                return dA - dB;
            });

            const msTodoReminderSettings = await loadMsTodoReminderSettings();
            renderToDoList(filtered, todoListContainer, {
                viewMode: 'dashboard',
                msTodoReminderSettings,
                onStatusChange: () => {
                    updateAssignments({ forceRemote: false });
                }
            });
            applyTimetableColorsFromTodo(filtered);
            scheduleCourseLayoutSync();

            todoStatus.textContent = '';
        };

        rerenderDashboardTodosAfterCourseNameApply = async () => {
            await applyDashboardCourseNamesToOutOfSchedulePanel();
            await renderDashboardTodos(dashboardAssignments);
            requestCourseLayoutSync();
        };

        const updateAssignments = async ({ forceRemote = false, fallbackRemoteWhenEmpty = false } = {}) => {
            refreshBtn.disabled = true;
            refreshBtn.classList.add('ux-loading');
            todoStatus.textContent = forceRemote ? '課題を取得中...' : '課題を読み込み中...';
            try {
                let assignments = [];

                if (forceRemote) {
                    if (window.WebClassScraper?.updateAllAssignments) {
                        assignments = await window.WebClassScraper.updateAllAssignments();
                    } else {
                        assignments = await loadAssignments();
                    }
                } else {
                    assignments = await loadAssignments();
                    if (fallbackRemoteWhenEmpty && assignments.length === 0 && window.WebClassScraper?.updateAllAssignments) {
                        assignments = await window.WebClassScraper.updateAllAssignments();
                    }
                }

                await dashboardTimetableLlmApplyPromise;
                await renderDashboardTodos(assignments);
            } catch (error) {
                console.error('[WebClass UX] Dashboard ToDo update failed', error);
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.classList.remove('ux-loading');
            }
        };

        const runTodoApiSyncPipeline = async ({
            trigger = 'manual',
            mode = 'full',
            forceRemoteReload = false,
            markManualReload = false
        } = {}) => {
            const syncErrors = [];
            if (forceRemoteReload) {
                try {
                    await runTodoApiSync({ mode: 'pull_only', trigger: `${trigger}_api_pull` });
                } catch (error) {
                    uxDebugWarn('[WebClass UX] todo api pull phase failed', error);
                    syncErrors.push(error);
                }

                await updateAssignments({ forceRemote: true });

                if (markManualReload) {
                    await chrome.storage.local.set({
                        [STORAGE_KEY_MS_TODO_LAST_MANUAL_RELOAD]: new Date().toISOString()
                    });
                }

                try {
                    await runTodoApiSync({ mode, trigger: `${trigger}_api_push` });
                } catch (error) {
                    uxDebugWarn('[WebClass UX] todo api push phase failed', error);
                    syncErrors.push(error);
                }

                await updateAssignments({ forceRemote: false });
                if (syncErrors.length > 0) {
                    throw syncErrors[0];
                }
                return;
            }

            try {
                await runTodoApiSync({ mode, trigger });
            } catch (error) {
                uxDebugWarn('[WebClass UX] todo api sync failed', error);
                syncErrors.push(error);
            }
            await updateAssignments({ forceRemote: false });
            if (syncErrors.length > 0) {
                throw syncErrors[0];
            }
        };

        runTodoApiSyncFromBackground = async ({
            trigger = 'background',
            mode = 'full',
            forceRemoteReload = true
        } = {}) => {
            await runTodoApiSyncPipeline({
                trigger,
                mode,
                forceRemoteReload
            });
        };

        refreshBtn.onclick = () => {
            runTodoApiSyncPipeline({
                trigger: 'manual_reload',
                mode: 'full',
                forceRemoteReload: true,
                markManualReload: true
            }).catch((error) => {
                uxDebugWarn('[WebClass UX] manual reload sync failed', error);
                alert(`ToDo同期に失敗しました: ${error?.message || 'Unknown error'}`);
            });
        };

        todoSection.appendChild(todoListContainer);

        rightColumn.appendChild(todoSection);

        const normalizeDashboardCourseMetaText = (text) => String(text || '').replace(/\s+/g, ' ').trim();
        const collectDashboardOutOfScheduleCourses = () => {
            const scheduledCourseIds = new Set(
                Array.from(document.querySelectorAll('table.schedule-table a[href*="course.php"], table.ux-dashboard-v2-schedule-table a[href*="course.php"]'))
                    .map((link) => extractCourseIdFromUrl(link.getAttribute('href') || ''))
                    .filter(Boolean)
            );
            const courseMap = new Map();
            const candidateLinks = document.querySelectorAll('#courses_list_left a[href*="course.php"], .courseTree .course-title a[href*="course.php"]');

            candidateLinks.forEach((link) => {
                const href = link.getAttribute('href') || '';
                if (!href) return;

                const courseId = extractCourseIdFromUrl(href);
                const courseBox = link.closest('.course-data-box-normal') || link.closest('li') || link.parentElement;
                const fullName = normalizeDevdevCourseText(link.textContent || '');
                const detailText = normalizeDashboardCourseMetaText(courseBox?.querySelector('.course-info')?.textContent || '');
                const noticeText = normalizeDashboardCourseMetaText(courseBox?.querySelector('.course-contents-info')?.textContent || '');
                const shouldTreatAsOutOfSchedule =
                    !scheduledCourseIds.has(courseId) ||
                    /時間外/.test(fullName) ||
                    /時間外/.test(detailText);
                if (!fullName || !shouldTreatAsOutOfSchedule) return;

                const key = courseId || href || fullName;
                if (courseMap.has(key)) return;

                let absoluteHref = href;
                try {
                    absoluteHref = new URL(href, window.location.href).href;
                } catch {
                    // keep raw href
                }

                courseMap.set(key, {
                    courseId,
                    href: absoluteHref,
                    fullName,
                    detailText,
                    noticeText
                });
            });

            return Array.from(courseMap.values()).sort((a, b) => {
                const aName = fallbackCourseName(a.fullName || '');
                const bName = fallbackCourseName(b.fullName || '');
                return aName.localeCompare(bName, 'ja');
            });
        };

        const outOfScheduleCourses = collectDashboardOutOfScheduleCourses();
        const outOfScheduleSection = document.createElement('section');
        outOfScheduleSection.id = 'ux-outside-courses-section';
        outOfScheduleSection.className = 'ux-dashboard-v2-section ux-dashboard-v2-outside-courses';
        outOfScheduleSection.style.display = 'flex';
        outOfScheduleSection.style.flexDirection = 'column';
        outOfScheduleSection.style.flex = '0 0 auto';
        outOfScheduleSection.style.minHeight = '0';
        outOfScheduleSection.style.overflow = 'hidden';

        const outOfScheduleHeader = document.createElement('div');
        outOfScheduleHeader.className = 'ux-dashboard-v2-section-header';

        const outOfScheduleTitle = document.createElement('h2');
        outOfScheduleTitle.textContent = '時間外科目';
        outOfScheduleHeader.appendChild(outOfScheduleTitle);

        const outOfScheduleCount = document.createElement('span');
        outOfScheduleCount.className = 'ux-dashboard-v2-outside-courses-count';
        outOfScheduleCount.textContent = `${outOfScheduleCourses.length}件`;
        outOfScheduleHeader.appendChild(outOfScheduleCount);
        outOfScheduleSection.appendChild(outOfScheduleHeader);

        const outOfScheduleBody = document.createElement('div');
        outOfScheduleBody.className = 'ux-dashboard-v2-outside-courses-body';
        dashboardOutOfScheduleSectionElement = outOfScheduleSection;

        if (outOfScheduleCourses.length > 0) {
            const outOfScheduleList = document.createElement('div');
            outOfScheduleList.className = 'ux-dashboard-v2-outside-courses-list';

            outOfScheduleCourses.forEach((course) => {
                const item = document.createElement('a');
                item.className = 'ux-dashboard-v2-outside-course-item';
                item.href = course.href || '#';
                item.dataset.courseId = course.courseId || '';
                item.dataset.originalName = course.fullName || '';

                const title = document.createElement('span');
                title.className = 'ux-dashboard-v2-outside-course-title';
                title.textContent = course.fullName || '';
                item.appendChild(title);

                if (course.noticeText) {
                    const note = document.createElement('span');
                    note.className = 'ux-dashboard-v2-outside-course-note';
                    note.textContent = course.noticeText;
                    item.appendChild(note);
                }

                outOfScheduleList.appendChild(item);
            });

            outOfScheduleBody.appendChild(outOfScheduleList);
        } else {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'ux-dashboard-v2-outside-courses-empty';
            emptyMessage.textContent = '時間外科目はありません';
            outOfScheduleBody.appendChild(emptyMessage);
        }

        outOfScheduleSection.appendChild(outOfScheduleBody);
        centerColumn.insertBefore(outOfScheduleSection, statsSection);

        applyDashboardCourseNamesToOutOfSchedulePanel = async () => {
            if (!dashboardOutOfScheduleSectionElement) return;

            const items = Array.from(dashboardOutOfScheduleSectionElement.querySelectorAll('.ux-dashboard-v2-outside-course-item'));
            if (!items.length) return;

            const storageData = await new Promise(resolve => {
                chrome.storage.local.get({
                    [STORAGE_KEY_OPENAI_COURSE_CACHE]: {},
                    [STORAGE_KEY_SHORT_COURSE_CACHE]: {}
                }, resolve);
            });
            const anyNameSettingForCustom = customNameEnabled || llmNameEnabled || ruleNameEnabled;
            const customNames = anyNameSettingForCustom && window.WebClassScraper?.loadCustomCourseNames
                ? await window.WebClassScraper.loadCustomCourseNames().catch(() => ({}))
                : {};
            const shortCourseCache = ruleNameEnabled ? (storageData[STORAGE_KEY_SHORT_COURSE_CACHE] || {}) : {};
            const openaiCache = llmNameEnabled ? (storageData[STORAGE_KEY_OPENAI_COURSE_CACHE] || {}) : {};

            items.forEach((item) => {
                const titleEl = item.querySelector('.ux-dashboard-v2-outside-course-title');
                if (!titleEl) return;

                const rawFullName = (item.dataset.originalName || '').trim();
                const courseId = (item.dataset.courseId || '').trim();
                if (!rawFullName) return;

                const customName = resolveEditedCustomCourseName(
                    courseId ? customNames[courseId] : '',
                    rawFullName
                );
                if (customNameEnabled && customName) {
                    titleEl.textContent = customName;
                    return;
                }

                const cacheKeys = [];
                if (courseId) {
                    cacheKeys.push(`${courseId}::${rawFullName}`);
                    const normalizedFullName = normalizeDevdevCourseText(rawFullName);
                    if (normalizedFullName && normalizedFullName !== rawFullName) {
                        cacheKeys.push(`${courseId}::${normalizedFullName}`);
                    }
                }
                cacheKeys.push(rawFullName);
                const normalizedName = normalizeDevdevCourseText(rawFullName);
                if (normalizedName && normalizedName !== rawFullName) {
                    cacheKeys.push(normalizedName);
                }
                const cachedOpenAiKey = cacheKeys.find((key) => typeof openaiCache[key] === 'string' && openaiCache[key].trim());
                if (llmNameEnabled && cachedOpenAiKey) {
                    titleEl.textContent = openaiCache[cachedOpenAiKey];
                    return;
                }

                if (ruleNameEnabled) {
                    const cachedShort = getShortCourseFromCache(shortCourseCache, courseId, [normalizedName, rawFullName]);
                    if (cachedShort) {
                        titleEl.textContent = cachedShort;
                        return;
                    }
                }

                if (llmNameEnabled) {
                    titleEl.textContent = rawFullName;
                    return;
                }

                if (ruleNameEnabled) {
                    titleEl.textContent = fallbackCourseName(rawFullName);
                    return;
                }

                titleEl.textContent = rawFullName;
            });
        };
        void applyDashboardCourseNamesToOutOfSchedulePanel().finally(() => {
            requestCourseLayoutSync();
        });
        dashboardTimetableLlmApplyPromise = dashboardTimetableLlmApplyPromise.finally(async () => {
            await applyDashboardCourseNamesToOutOfSchedulePanel();
            requestCourseLayoutSync();
        });

        // Messages Section (Switch View 2 ではお知らせの代わりにメッセージを表示)
        const messageSection = document.createElement('section');
        messageSection.id = 'ux-messages-section';
        messageSection.className = 'ux-dashboard-v2-section ux-dashboard-v2-messages ux-home-message-panel';
        messageSection.style.display = 'none';
        messageSection.setAttribute('aria-hidden', 'true');

        const messageHeader = document.createElement('div');
        messageHeader.className = 'ux-dashboard-v2-section-header';
        messageHeader.style.display = 'flex';
        messageHeader.style.alignItems = 'center';
        messageHeader.style.gap = '12px';

        const messageTitle = document.createElement('h2');
        messageTitle.textContent = 'メッセージ';
        messageHeader.appendChild(messageTitle);

        const unreadBadge = document.createElement('span');
        unreadBadge.style.backgroundColor = 'var(--ux-home-danger)';
        unreadBadge.style.color = '#fff';
        unreadBadge.style.padding = '4px 10px';
        unreadBadge.style.borderRadius = '12px';
        unreadBadge.style.fontSize = '0.85em';
        unreadBadge.style.marginLeft = 'auto';
        unreadBadge.style.display = 'none';
        messageHeader.appendChild(unreadBadge);

        const closeMessagePanelBtn = document.createElement('button');
        closeMessagePanelBtn.type = 'button';
        closeMessagePanelBtn.className = 'ux-home-message-close';
        closeMessagePanelBtn.innerHTML = '&times;';
        closeMessagePanelBtn.title = '閉じる';
        closeMessagePanelBtn.setAttribute('aria-label', 'メッセージを閉じる');
        messageHeader.appendChild(closeMessagePanelBtn);

        messageSection.appendChild(messageHeader);

        const messageActions = document.createElement('div');
        messageActions.style.display = 'flex';
        messageActions.style.gap = '8px';
        messageActions.style.flexWrap = 'wrap';
        messageActions.style.alignItems = 'center';
        messageActions.style.marginBottom = '8px';

        const refreshMsgBtn = document.createElement('button');
        refreshMsgBtn.className = 'ux-refresh-btn';
        refreshMsgBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
        refreshMsgBtn.style.padding = '6px';
        refreshMsgBtn.style.border = 'none';
        refreshMsgBtn.style.background = 'transparent';
        refreshMsgBtn.style.color = 'var(--ux-home-secondary-label)';
        refreshMsgBtn.style.cursor = 'pointer';

        const markAllReadBtn = document.createElement('button');
        markAllReadBtn.className = 'ux-refresh-btn ux-check-btn';
        markAllReadBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12l6 6L20 6"/></svg>';
        markAllReadBtn.style.padding = '6px';
        markAllReadBtn.style.border = 'none';
        markAllReadBtn.style.background = 'transparent';
        markAllReadBtn.style.color = 'var(--ux-home-success-foreground)';
        markAllReadBtn.style.cursor = 'pointer';

        const messageStatus = document.createElement('div');
        messageStatus.style.fontSize = '0.85em';
        messageStatus.style.color = 'var(--ux-home-secondary-label)';

        messageActions.appendChild(refreshMsgBtn);
        messageActions.appendChild(markAllReadBtn);
        messageActions.appendChild(messageStatus);
        messageSection.appendChild(messageActions);

        const messageContent = document.createElement('div');
        messageContent.className = 'ux-dashboard-v2-message-list';
        messageContent.style.minHeight = '120px';
        messageContent.style.maxHeight = 'none';
        messageContent.style.flex = '1';
        messageContent.style.minHeight = '0';
        messageContent.style.overflowY = 'auto';
        messageContent.innerHTML = '<p class="loading" style="padding:12px;">メッセージを読み込み中...</p>';
        messageSection.appendChild(messageContent);

        const homeMessageDock = document.createElement('div');
        homeMessageDock.className = 'ux-home-message-dock';

        const debugReceiveBtn = document.createElement('button');
        debugReceiveBtn.className = 'ux-message-debug-btn';
        debugReceiveBtn.type = 'button';
        debugReceiveBtn.textContent = 'デバッグ受信';
        debugReceiveBtn.title = '未読メッセージを1件疑似追加';
        debugReceiveBtn.style.display = uxIsDebugModeEnabled() ? 'inline-flex' : 'none';
        debugMessageActions.appendChild(debugReceiveBtn);

        const messageFab = document.createElement('button');
        messageFab.type = 'button';
        messageFab.className = 'ux-home-message-fab';
        messageFab.title = 'メッセージ';
        messageFab.setAttribute('aria-label', 'メッセージ');
        messageFab.setAttribute('aria-controls', 'ux-messages-section');
        messageFab.setAttribute('aria-expanded', 'false');
        messageFab.style.display = 'none';
        messageFab.innerHTML = `
            <svg class="ux-home-message-fab-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M3 6.75A2.75 2.75 0 0 1 5.75 4h12.5A2.75 2.75 0 0 1 21 6.75v10.5A2.75 2.75 0 0 1 18.25 20H5.75A2.75 2.75 0 0 1 3 17.25zm2.2-.75 6.8 5.07L18.8 6zM19 7.25l-6.4 4.77a1 1 0 0 1-1.2 0L5 7.25v10c0 .41.34.75.75.75h12.5c.41 0 .75-.34.75-.75z"/>
            </svg>
        `;
        const messageFabUnreadBadge = document.createElement('span');
        messageFabUnreadBadge.className = 'ux-home-message-fab-badge';
        messageFabUnreadBadge.style.display = 'none';
        messageFab.appendChild(messageFabUnreadBadge);
        homeMessageDock.appendChild(messageFab);

        // Assemble columns (Left removed)
        mainContent.appendChild(centerColumn);
        mainContent.appendChild(rightColumn);
        dashboardContainer.appendChild(mainContent);
        dashboardContainer.appendChild(messageSection);
        dashboardContainer.appendChild(homeMessageDock);

        // Remove original content completely (after all scraping is done)
        // Hide all direct children of body except our dashboard
        Array.from(document.body.children).forEach(child => {
            if (child === dashboardContainer ||
                child.tagName === 'SCRIPT' ||
                child.tagName === 'STYLE' ||
                child.tagName === 'LINK') {
                return;
            }
            child.style.display = 'none';
        });

        if (originalContainer) originalContainer.remove();

        document.body.appendChild(dashboardContainer);
        scheduleCourseLayoutSync();

        // === ゴミ箱ボタン（デバッグモード時のみ表示） ===
        if (debugModeEnabled) {
            const trashFab = document.createElement('button');
            trashFab.id = 'ux-trash-fab';
            trashFab.className = 'ux-trash-fab';
            trashFab.title = 'ゴミ箱を表示';
            trashFab.innerHTML = '🗑';
            document.body.appendChild(trashFab);

            // ゴミ箱モーダル
            const trashOverlay = document.createElement('div');
            trashOverlay.id = 'ux-trash-overlay';
            trashOverlay.className = 'ux-trash-overlay';
            trashOverlay.style.display = 'none';

            const trashModal = document.createElement('div');
            trashModal.className = 'ux-trash-modal';

            const trashHeader = document.createElement('div');
            trashHeader.className = 'ux-trash-modal-header';

            const trashTitle = document.createElement('h3');
            trashTitle.textContent = 'ゴミ箱';
            trashHeader.appendChild(trashTitle);

            const trashCloseBtn = document.createElement('button');
            trashCloseBtn.className = 'ux-trash-modal-close';
            trashCloseBtn.innerHTML = '&times;';
            trashCloseBtn.title = '閉じる';
            trashHeader.appendChild(trashCloseBtn);
            trashModal.appendChild(trashHeader);

            const trashBody = document.createElement('div');
            trashBody.className = 'ux-trash-modal-body';
            trashModal.appendChild(trashBody);

            trashOverlay.appendChild(trashModal);
            document.body.appendChild(trashOverlay);

            const renderTrashContents = async () => {
                trashBody.innerHTML = '';
                const trashBin = await loadTrashBin();
                const allAssignments = await loadAssignments();

                // ゴミ箱にあるタスクを表示
                const trashedTasks = [];
                for (const identifier of trashBin) {
                    const match = allAssignments.find(a =>
                        (a.url && a.url === identifier) ||
                        (a.fallbackUrl && a.fallbackUrl === identifier)
                    );
                    if (match) {
                        trashedTasks.push(match);
                    } else {
                        // assignment データにない場合は識別子のみ表示
                        trashedTasks.push({ url: identifier, fallbackUrl: '', title: identifier, course: '(不明)', deletedAt: '' });
                    }
                }

                if (trashedTasks.length === 0) {
                    const emptyMsg = document.createElement('p');
                    emptyMsg.className = 'ux-trash-empty';
                    emptyMsg.textContent = 'ゴミ箱は空です';
                    trashBody.appendChild(emptyMsg);
                    return;
                }

                const trashList = document.createElement('ul');
                trashList.className = 'ux-trash-list';

                for (const task of trashedTasks) {
                    const li = document.createElement('li');
                    li.className = 'ux-trash-item';

                    const info = document.createElement('div');
                    info.className = 'ux-trash-item-info';

                    const titleSpan = document.createElement('span');
                    titleSpan.className = 'ux-trash-item-title';
                    titleSpan.textContent = task.title || '(無題)';
                    info.appendChild(titleSpan);

                    const meta = document.createElement('span');
                    meta.className = 'ux-trash-item-meta';
                    const courseName = task.course || '';
                    const deletedDate = task.deletedAt
                        ? new Date(task.deletedAt).toLocaleString()
                        : '';
                    meta.textContent = [courseName, deletedDate ? `削除: ${deletedDate}` : ''].filter(Boolean).join(' / ');
                    info.appendChild(meta);

                    li.appendChild(info);

                    const restoreBtn = document.createElement('button');
                    restoreBtn.className = 'ux-trash-restore-btn';
                    restoreBtn.textContent = '復元';
                    restoreBtn.title = 'タスクを復元する';
                    restoreBtn.onclick = async () => {
                        const identifier = task.url || task.fallbackUrl;
                        await removeFromTrash(identifier);

                        // assignment の isDeleted フラグも解除
                        const currentAssignments = await loadAssignments();
                        const idx = currentAssignments.findIndex(a =>
                            (a.url && a.url === identifier) ||
                            (a.fallbackUrl && a.fallbackUrl === identifier)
                        );
                        if (idx !== -1) {
                            currentAssignments[idx].isDeleted = false;
                            delete currentAssignments[idx].deletedAt;
                            await saveAssignments(currentAssignments);
                        }

                        // ゴミ箱モーダルとTODOリストを再描画
                        await renderTrashContents();
                        await updateAssignments({ forceRemote: false });
                    };
                    li.appendChild(restoreBtn);

                    trashList.appendChild(li);
                }

                trashBody.appendChild(trashList);
            };

            trashFab.onclick = async () => {
                trashOverlay.style.display = 'flex';
                await renderTrashContents();
            };

            trashCloseBtn.onclick = () => {
                trashOverlay.style.display = 'none';
            };

            trashOverlay.onclick = (e) => {
                if (e.target === trashOverlay) {
                    trashOverlay.style.display = 'none';
                }
            };
        }

        // Initialize ToDo List in the dashboard
        todoStatus.textContent = '課題を読み込み中...';
        await updateAssignments({ fallbackRemoteWhenEmpty: true });
        scheduleCourseLayoutSync();

        // Initialize Messages (Switch View 2)
        let currentMessageData = null;
        let isMessagePanelOpen = false;

        const setMessagePanelOpen = (open) => {
            const shouldOpen = !!open && messageFab.style.display !== 'none';
            isMessagePanelOpen = shouldOpen;
            messageSection.style.display = shouldOpen ? 'flex' : 'none';
            messageSection.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
            messageFab.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        };

        closeMessagePanelBtn.onclick = () => {
            setMessagePanelOpen(false);
        };
        messageFab.onclick = () => {
            setMessagePanelOpen(!isMessagePanelOpen);
        };
        document.addEventListener('click', (event) => {
            if (!isMessagePanelOpen) return;
            const target = event.target;
            if (messageSection.contains(target) || homeMessageDock.contains(target)) {
                return;
            }
            setMessagePanelOpen(false);
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && isMessagePanelOpen) {
                setMessagePanelOpen(false);
            }
        });

        const updateUnreadBadge = () => {
            if (currentMessageData && currentMessageData.unreadCount > 0) {
                unreadBadge.textContent = `未読 ${currentMessageData.unreadCount}`;
                unreadBadge.style.display = 'inline-block';
                messageFabUnreadBadge.textContent = currentMessageData.unreadCount > 99
                    ? '99+'
                    : String(currentMessageData.unreadCount);
                messageFabUnreadBadge.style.display = 'inline-flex';
                messageFab.style.display = 'inline-flex';
                messageFab.classList.add('has-unread');
                messageFab.setAttribute('aria-label', `メッセージ 未読 ${currentMessageData.unreadCount}件`);
            } else {
                unreadBadge.style.display = 'none';
                messageFabUnreadBadge.style.display = 'none';
                messageFab.style.display = 'none';
                messageFab.classList.remove('has-unread');
                messageFab.setAttribute('aria-label', 'メッセージ 未読なし');
                setMessagePanelOpen(false);
            }
        };

        const updateDebugReceiveButtonVisibility = (enabled = uxIsDebugModeEnabled()) => {
            debugReceiveBtn.style.display = enabled ? 'inline-flex' : 'none';
        };
        updateDebugReceiveButtonVisibility();
        onUxDebugModeChange((enabled) => {
            updateDebugReceiveButtonVisibility(enabled);
        });

        const persistMessageBadgeState = async () => {
            try {
                await chrome.storage.local.set({
                    [STORAGE_KEY_MESSAGES]: {
                        unreadCount: currentMessageData?.unreadCount || 0,
                        totalCount: currentMessageData?.totalCount || currentMessageData?.messages?.length || 0,
                        fetchedAt: new Date().toISOString()
                    }
                });
            } catch {
                // ignore cache errors
            }
        };

        let messagePollTimer = null;
        const scheduleMessagePolling = (delayMs = 60000) => {
            if (messagePollTimer) {
                clearTimeout(messagePollTimer);
            }
            messagePollTimer = window.setTimeout(async () => {
                if (document.hidden) {
                    scheduleMessagePolling(delayMs);
                    return;
                }
                await updateMessages({ silent: true });
                scheduleMessagePolling(delayMs);
            }, delayMs);
        };

        const updateMessages = async ({ silent = false } = {}) => {
            if (!silent) {
                refreshMsgBtn.disabled = true;
                refreshMsgBtn.classList.add('ux-loading');
                markAllReadBtn.disabled = true;
                messageContent.innerHTML = '<p class="loading" style="padding:12px;">メッセージを読み込み中...</p>';
            }
            messageStatus.textContent = 'メッセージを取得中...';
            try {
                currentMessageData = await fetchMessages();
                await persistMessageBadgeState();
                renderMessageWindow(messageContent, currentMessageData);
                updateUnreadBadge();
                messageStatus.textContent = `総件数: ${currentMessageData.totalCount || currentMessageData.messages?.length || 0}`;
            } catch (err) {
                uxDebugWarn('[WebClass UX] Message fetch error', err);
                messageStatus.textContent = 'メッセージ取得に失敗しました';
                if (!silent) {
                    messageContent.innerHTML = '<p class="error" style="padding:12px;color:var(--ux-home-danger-foreground);">取得に失敗しました</p>';
                }
            } finally {
                if (!silent) {
                    refreshMsgBtn.disabled = false;
                    refreshMsgBtn.classList.remove('ux-loading');
                    markAllReadBtn.disabled = false;
                }
            }
        };

        refreshMsgBtn.onclick = updateMessages;

        debugReceiveBtn.onclick = async () => {
            const now = new Date();
            const receivedAt = now.toLocaleString('ja-JP');
            if (!currentMessageData || !Array.isArray(currentMessageData.messages)) {
                currentMessageData = {
                    messages: [],
                    unreadCount: 0,
                    totalCount: 0,
                    formAction: null,
                    numCboxes: '0',
                    acs: getAcsParameter()
                };
            }

            currentMessageData.messages.unshift({
                id: `debug-${now.getTime()}`,
                sender: 'Debug Sender',
                subject: `デバッグ受信メッセージ ${currentMessageData.unreadCount + 1}`,
                date: receivedAt,
                url: null,
                isUnread: true,
                index: -1
            });
            currentMessageData.unreadCount += 1;
            currentMessageData.totalCount = currentMessageData.messages.length;
            renderMessageWindow(messageContent, currentMessageData);
            updateUnreadBadge();
            messageStatus.textContent = `総件数: ${currentMessageData.totalCount}`;
            await persistMessageBadgeState();
            setMessagePanelOpen(true);
        };

        markAllReadBtn.onclick = async () => {
            if (!currentMessageData || currentMessageData.messages.length === 0) {
                // アニメーションだけ再生
                markAllReadBtn.classList.add('ux-drawing');
                setTimeout(() => markAllReadBtn.classList.remove('ux-drawing'), 400);
                return;
            }
            const unreadMessages = currentMessageData.messages.filter(m => m.isUnread);
            if (unreadMessages.length === 0) {
                // アニメーションだけ再生
                markAllReadBtn.classList.add('ux-drawing');
                setTimeout(() => markAllReadBtn.classList.remove('ux-drawing'), 400);
                return;
            }

            markAllReadBtn.disabled = true;
            markAllReadBtn.classList.add('ux-drawing');
            const unreadIds = unreadMessages.map(m => m.id).filter(id => id);
            const success = await markMessagesAsRead(
                unreadIds,
                currentMessageData.formAction,
                currentMessageData.numCboxes,
                currentMessageData.acs
            );

            if (success) {
                currentMessageData.messages.forEach(m => {
                    if (m.isUnread) {
                        m.isUnread = false;
                        m.justRead = true;
                    }
                });
                currentMessageData.unreadCount = 0;
                renderMessageWindow(messageContent, currentMessageData);
                updateUnreadBadge();
                await persistMessageBadgeState();
            } else {
                alert('既読処理に失敗しました');
            }

            markAllReadBtn.disabled = false;
            markAllReadBtn.classList.remove('ux-drawing');
        };

        await updateMessages();
        scheduleMessagePolling();
    }

    async function initHome() {
        uxDebugLog("WebClass UX Improver: Initializing Home");
        const globalSettings = await chrome.storage.local.get({ [STORAGE_KEY_EXTENSION_VISUAL_ENABLED]: true });
        uxSetExtensionVisualEnabled(globalSettings[STORAGE_KEY_EXTENSION_VISUAL_ENABLED] !== false);

        if (!uxIsExtensionVisualEnabled()) {
            uxDebugLog("WebClass UX: Global visual modification is disabled");
            document.body.classList.remove('ux-dashboard-v2-mode');
            document.body.classList.remove('ux-grid-mode');
            runDashboardCourseNameConversionFromSettings = null;
            runTodoApiSyncFromBackground = null;
            return;
        }

        // Get current view state
        const currentView = await getCurrentView();
        uxDebugLog("WebClass UX: Current View =", currentView);

        // Render the appropriate view based on currentView
        switch (currentView) {
            case 'dashboard':
                // Switch View 2: Dashboard View
                uxDebugLog("WebClass UX: Rendering Dashboard Layout");
                document.body.classList.add('ux-dashboard-v2-mode');
                document.body.classList.remove('ux-grid-mode');
                await renderDashboardLayout();
                break;

            case 'plain':
            default:
                // Default: 完全プレーン（拡張機能無効時と同じ）
                uxDebugLog("WebClass UX: Plain mode - no modifications");
                document.body.classList.remove('ux-dashboard-v2-mode');
                document.body.classList.remove('ux-grid-mode');
                runDashboardCourseNameConversionFromSettings = null;
                runTodoApiSyncFromBackground = null;
                // Do nothing - leave the page as is
                break;
        }

        if (currentView !== 'plain') {
            startTimetableHighlightTimer();
        }
    }

    // Run
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHome);
    } else {
        initHome();
    }

} // End of else block (home page only)
