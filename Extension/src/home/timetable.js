// home/timetable.js
// Home-page styles, debug time controls, and timetable behavior.

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
    @keyframes ux-icon-swap-in {
        0% { opacity: 0; transform: scale(0.72) rotate(-18deg); }
        100% { opacity: 1; transform: scale(1) rotate(0deg); }
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
    .ux-refresh-btn.ux-success svg {
        animation: ux-icon-swap-in 0.18s ease-out forwards;
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
    .ux-todo-title-marquee-wrap {
        position: relative;
        display: block;
        width: 100%;
        min-width: 0;
        overflow: hidden;
    }
    .ux-todo-title-marquee-source {
        position: relative;
        z-index: 1;
    }
    .ux-todo-title-marquee-wrap.is-marquee:not(.is-editing) .ux-todo-title-marquee-source {
        color: transparent !important;
    }
    .ux-todo-title-marquee {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        overflow: hidden;
        pointer-events: none;
        opacity: 0;
        z-index: 2;
        box-sizing: border-box;
    }
    .ux-todo-title-marquee-wrap.is-marquee:not(.is-editing) .ux-todo-title-marquee {
        opacity: 1;
    }
    .ux-todo-title-marquee-track {
        display: inline-flex;
        align-items: center;
        flex-wrap: nowrap;
        white-space: nowrap;
        will-change: transform;
        transform: translateX(0);
    }
    .ux-todo-title-marquee-unit {
        flex: 0 0 auto;
        white-space: nowrap;
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
        background-color: var(--ux-home-current-slot-background) !important;
    }
    .ux-timetable-current-slot a {
        background-color: transparent !important;
        color: #FFFFFF !important;
        font-weight: 700;
    }
`;
document.head.appendChild(uxTimetableHighlightStyle);

// --- Configuration & State ---
var STORAGE_KEY_DASHBOARD_DANGER_TODO_OUTLINE_ENABLED = 'dashboardDangerTodoOutlineEnabled';
var STORAGE_KEY_ASSIGNMENTS = 'assignments'; // Scraped assignments
var STORAGE_KEY_MESSAGES = UX_MESSAGE_BADGE_STORAGE_KEY; // Messages cache
var STORAGE_KEY_TRASH = 'webclass_todo_trash'; // Trash bin for soft-deleted tasks
var STORAGE_KEY_SHORT_COURSE_CACHE = 'webclass_course_short_name_cache';
var STORAGE_KEY_DASHBOARD_VISIBLE_START_PERIOD = 'dashboardVisibleStartPeriod';
var STORAGE_KEY_DASHBOARD_VISIBLE_END_PERIOD = 'dashboardVisibleEndPeriod';
var STORAGE_KEY_DASHBOARD_VISIBLE_START_WEEKDAY = 'dashboardVisibleStartWeekday';
var STORAGE_KEY_DASHBOARD_VISIBLE_END_WEEKDAY = 'dashboardVisibleEndWeekday';
var STORAGE_KEY_TODO_API_ENABLED = 'todoApiEnabled';
var STORAGE_KEY_TODO_API_LAST_MANUAL_RELOAD = 'todoApiLastManualReloadAt';
// background.js の TODO_API_LAST_AUTO_SYNC_AT_KEY / TODO_AUTO_SYNC_INTERVAL_MINUTES と揃えること
var STORAGE_KEY_TODO_API_LAST_AUTO_SYNC = 'todoApiLastAutoSyncAt';
var TODO_AUTO_SYNC_STALE_MS = 5 * 60 * 1000;
var DASHBOARD_VISIBLE_RANGE_MIN = 1;
var DASHBOARD_VISIBLE_RANGE_MAX = 6;
const MESSAGE_TYPE_RUN_TODO_API_SYNC_FROM_BACKGROUND = 'RUN_TODO_API_SYNC_FROM_BACKGROUND';
var runTodoApiSyncFromBackground = null;
var dashboardDangerTodoOutlineEnabled = true;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
var uiState = {
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

var TIMETABLE_HIGHLIGHT_CLASSES = [
    'ux-timetable-day-muted',
    'ux-timetable-day-today',
    'ux-timetable-current-slot',
];
var DASHBOARD_TIMETABLE_INLINE_EDIT_LONG_PRESS_MS = 520;
var DASHBOARD_TIMETABLE_INLINE_EDIT_MOVE_TOLERANCE_PX = 12;

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

function stripTimetableCourseStatusIndicators(link) {
    if (!link) return '';

    link.querySelectorAll('.course-new-message, .course-contents-info').forEach((element) => {
        element.remove();
    });

    return normalizeDevdevCourseText(link.textContent || '');
}

function applyUniformTimetableCellLayout(scheduleTable = null) {
    const tables = scheduleTable
        ? [scheduleTable]
        : Array.from(document.querySelectorAll('table.schedule-table, table.ux-dashboard-v2-schedule-table'));

    tables.forEach((table) => {
        if (!table) return;
        if (table.classList.contains('schedule-table')) {
            table.classList.add('ux-optimized-cell-width');
        }

        table.querySelectorAll('tbody td').forEach((cell) => {
            if (cell.classList.contains('schedule-table-class_order')) return;
            cell.classList.add('ux-cell-optimized');

            const link = cell.querySelector('a[href*="course.php"]');
            if (!link) return;

            const courseName = stripTimetableCourseStatusIndicators(link);
            if (courseName && !link.title) {
                link.title = courseName;
            }
        });
    });
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

function normalizeDashboardVisibleRangeValue(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(DASHBOARD_VISIBLE_RANGE_MAX, Math.max(DASHBOARD_VISIBLE_RANGE_MIN, parsed));
}

function normalizeDashboardVisibleRange(settings = {}) {
    const normalized = {
        startPeriod: normalizeDashboardVisibleRangeValue(
            settings[STORAGE_KEY_DASHBOARD_VISIBLE_START_PERIOD] ?? settings.startPeriod,
            DASHBOARD_VISIBLE_RANGE_MIN
        ),
        endPeriod: normalizeDashboardVisibleRangeValue(
            settings[STORAGE_KEY_DASHBOARD_VISIBLE_END_PERIOD] ?? settings.endPeriod,
            DASHBOARD_VISIBLE_RANGE_MAX
        ),
        startWeekday: normalizeDashboardVisibleRangeValue(
            settings[STORAGE_KEY_DASHBOARD_VISIBLE_START_WEEKDAY] ?? settings.startWeekday,
            DASHBOARD_VISIBLE_RANGE_MIN
        ),
        endWeekday: normalizeDashboardVisibleRangeValue(
            settings[STORAGE_KEY_DASHBOARD_VISIBLE_END_WEEKDAY] ?? settings.endWeekday,
            DASHBOARD_VISIBLE_RANGE_MAX
        )
    };

    if (normalized.startPeriod > normalized.endPeriod) normalized.endPeriod = normalized.startPeriod;
    if (normalized.startWeekday > normalized.endWeekday) normalized.endWeekday = normalized.startWeekday;
    return normalized;
}

function isDashboardWeekdayWithinVisibleRange(weekdayIndex, visibleRange) {
    return weekdayIndex >= visibleRange.startWeekday && weekdayIndex <= visibleRange.endWeekday;
}

function isDashboardPeriodWithinVisibleRange(classOrder, visibleRange) {
    return classOrder >= visibleRange.startPeriod && classOrder <= visibleRange.endPeriod;
}

function shouldAlwaysKeepDashboardWeekdayColumn(headerCell, visibleRange = normalizeDashboardVisibleRange()) {
    const weekdayIndex = getWeekdayIndexFromHeaderText(headerCell?.textContent);
    return weekdayIndex >= 1 && weekdayIndex <= 6 && isDashboardWeekdayWithinVisibleRange(weekdayIndex, visibleRange);
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

function shouldAlwaysKeepDashboardPeriodRow(row, visibleRange = normalizeDashboardVisibleRange()) {
    const classOrder = getTimetableClassOrderFromRow(row);
    return classOrder >= 1 && classOrder <= 6 && isDashboardPeriodWithinVisibleRange(classOrder, visibleRange);
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
