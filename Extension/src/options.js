// options.js

const ensureSelectOption = (selectEl, value, labelSuffix = ' (custom)') => {
    if (!selectEl || !value) return;
    const hasOption = Array.from(selectEl.options).some(opt => opt.value === value);
    if (!hasOption) {
        const customOption = document.createElement('option');
        customOption.value = value;
        customOption.textContent = `${value}${labelSuffix}`;
        selectEl.appendChild(customOption);
    }
};

const DEFAULT_VIEW_TOGGLE_SHORTCUT = 'Alt+Shift+M';
const LEGACY_DEFAULT_VIEW_TOGGLE_SHORTCUT = 'Ctrl+Shift+M';
const SHORTCUT_MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'];
const SHORTCUT_MODIFIER_TOKEN_MAP = {
    ctrl: 'Ctrl',
    control: 'Ctrl',
    alt: 'Alt',
    option: 'Alt',
    shift: 'Shift',
    meta: 'Meta',
    command: 'Meta',
    cmd: 'Meta',
    win: 'Meta',
    windows: 'Meta',
};
let runtimePlatformOs = '';
const initRuntimePlatform = () => new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.getPlatformInfo) {
        resolve();
        return;
    }
    chrome.runtime.getPlatformInfo((info) => {
        runtimePlatformOs = info?.os || '';
        resolve();
    });
});
const isMacPlatform = () => {
    if (runtimePlatformOs === 'mac') return true;
    const platformHints = [
        navigator.userAgentData?.platform,
        navigator.platform,
        navigator.userAgent
    ]
        .filter(Boolean)
        .join(' ');
    return /\b(Mac|macOS|iPhone|iPad|iPod)\b/i.test(platformHints);
};
const displayShortcutForPlatform = (shortcut) => (
    isMacPlatform() ? shortcut.replace(/\bAlt\b/g, 'Option') : shortcut
);
const shortcutInputToStorageValue = (shortcut) => shortcut.replace(/\bOption\b/gi, 'Alt');
const shortcutPlaceholderForPlatform = () => displayShortcutForPlatform(DEFAULT_VIEW_TOGGLE_SHORTCUT);
const setShortcutInputDisplayValue = (shortcut) => {
    const shortcutInput = document.getElementById('viewToggleShortcut');
    if (!shortcutInput) return;
    shortcutInput.value = displayShortcutForPlatform(shortcut || '');
};

const TODO_API_PROVIDER_KEY = 'todoApiProvider';
const TODO_API_ENABLED_KEY = 'todoApiEnabled';
const TODO_API_TASK_TITLE_FORMAT_KEY = 'todoApiTaskTitleFormat';
const TODO_API_ULTRA_SHORT_MAP_KEY = 'todoApiUltraShortCourseMap';
const MS_TODO_CLIENT_ID_KEY = 'msTodoClientId';
const MS_TODO_TENANT_ID_KEY = 'msTodoTenantId';
const MS_TODO_LIST_NAME_KEY = 'msTodoListName';
const GOOGLE_TODO_CLIENT_ID_KEY = 'googleTodoClientId';
const GOOGLE_TODO_CLIENT_SECRET_KEY = 'googleTodoClientSecret';
const GOOGLE_TODO_LIST_NAME_KEY = 'googleTodoListName';
const TODOIST_TODO_API_TOKEN_KEY = 'todoistTodoApiToken';
const TODOIST_TODO_PROJECT_NAME_KEY = 'todoistTodoProjectName';
const TICKTICK_TODO_CLIENT_ID_KEY = 'ticktickTodoClientId';
const TICKTICK_TODO_CLIENT_SECRET_KEY = 'ticktickTodoClientSecret';
const TICKTICK_TODO_PROJECT_NAME_KEY = 'ticktickTodoProjectName';
const MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE_KEY = 'msTodoDefaultReminderDaysBefore';
const MS_TODO_DEFAULT_REMINDER_TIME_MODE_KEY = 'msTodoDefaultReminderTimeMode';
const MS_TODO_REMINDER_TIME_MODE_AT_9AM = 'at_9am';
const MS_TODO_REMINDER_TIME_MODE_EXACT_OFFSET = 'exact_offset';
const MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE = 1;
const MS_TODO_DEFAULT_TENANT = 'common';
const MS_TODO_DEFAULT_CLIENT_ID = '';
const GOOGLE_TODO_DEFAULT_CLIENT_ID = '';
const TODO_DEFAULT_LIST_NAME = 'SmartToDo Sync';
const TODO_API_VISIBLE_PROVIDER = 'ticktick';
const TODO_MOJIBAKE_PATTERN = /[繝鬯郢驛隴隱蜈蜷霑ｽ]/;
const EXTENSION_VISUAL_ENABLED_KEY = 'extensionVisualEnabled';
const EXTENSION_UPDATE_CHECK_ENABLED_KEY = 'extensionUpdateCheckEnabled';
const COURSE_QUICK_NAV_COLLAPSED_KEY = 'courseQuickNavCollapsed';
const DASHBOARD_DANGER_TODO_OUTLINE_ENABLED_KEY = 'dashboardDangerTodoOutlineEnabled';
const DASHBOARD_VISIBLE_START_PERIOD_KEY = 'dashboardVisibleStartPeriod';
const DASHBOARD_VISIBLE_END_PERIOD_KEY = 'dashboardVisibleEndPeriod';
const DASHBOARD_VISIBLE_START_WEEKDAY_KEY = 'dashboardVisibleStartWeekday';
const DASHBOARD_VISIBLE_END_WEEKDAY_KEY = 'dashboardVisibleEndWeekday';
const MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_KEY = 'materialDownloadFilenameSeparator';
const MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_DEFAULT = 'hyphen';
const MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_VALUES = new Set(['hyphen', 'space', 'underscore']);
const DASHBOARD_VISIBLE_RANGE_MIN = 1;
const DASHBOARD_VISIBLE_RANGE_MAX = 6;
const DASHBOARD_VISIBLE_WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土'];
const AUTO_SAVE_DEBOUNCE_MS = 220;
const WEBCLASS_TAB_URL_PATTERNS = [
    'https://kulms.kanagawa-u.ac.jp/webclass/*',
    'http://127.0.0.1/webclass/*',
    'http://localhost/webclass/*'
];
const WEBCLASS_HOME_URL = 'https://kulms.kanagawa-u.ac.jp/webclass/index.php';
const WEBCLASS_RELOAD_REQUIRED_CONTROL_IDS = new Set([
    'debugModeEnabled',
    'useCustomCourseNameEnabled',
    'useLlmCourseNameEnabled',
    'useRuleCourseNameEnabled',
    'autoRunCourseNameConversionOnDashboardLoad',
    'showLlmCourseStatusEnabled',
    'dashboardDangerTodoOutlineEnabled',
    'courseQuickNavDefaultExpanded',
    'courseQuickNavDefaultCollapsed',
    'tocInitialOpen',
    'tocInitialClosed',
    'tocInitialCloseDelay',
    'tocAutoHide',
    'tocAutoHideDelay',
    'tocShowSectionTitles',
    'materialDownloadFilenameSeparatorHyphen',
    'materialDownloadFilenameSeparatorSpace',
    'materialDownloadFilenameSeparatorUnderscore',
    'tocHoverReveal',
    'shikenSelectVisibleCount'
]);

let lastSavedViewToggleShortcut = DEFAULT_VIEW_TOGGLE_SHORTCUT;
let autoSaveTimerId = null;
let dashboardRangeDragState = null;

const clearAutoSaveTimer = () => {
    if (autoSaveTimerId === null) return;
    clearTimeout(autoSaveTimerId);
    autoSaveTimerId = null;
};

const showStatusMessage = (text, color = '#2e7d32', durationMs = 2000) => {
    const status = document.getElementById('status');
    if (!status) return;
    status.style.color = color;
    status.textContent = text;
    if (durationMs > 0) {
        setTimeout(() => {
            if (status.textContent === text) {
                status.textContent = '';
            }
        }, durationMs);
    }
};

const showInvalidShortcutStatus = () => {
    showStatusMessage('ショートカットは Windows: Alt+Shift+M / Mac: Option+Shift+M の形式で入力してください。', '#c62828', 2500);
};

const formatUpdateTimestamp = (rawValue) => {
    if (!rawValue) return '';
    const timestamp = Date.parse(rawValue);
    if (!Number.isFinite(timestamp)) return '';
    return new Date(timestamp).toLocaleString('ja-JP');
};

const renderExtensionUpdateStatus = (status) => {
    const statusEl = document.getElementById('extensionUpdateStatus');
    const buttonEl = document.getElementById('checkExtensionUpdateNow');
    if (!statusEl) return;

    if (buttonEl) {
        buttonEl.disabled = status?.enabled === false;
    }

    if (!status || status.enabled === false) {
        statusEl.style.color = '#666';
        statusEl.textContent = '自動確認はOFFです。';
        return;
    }

    const currentVersion = status.currentVersion ? `現在 v${status.currentVersion}` : '';
    const latestVersion = status.latestVersion ? `最新 v${status.latestVersion}` : '';
    const checkedAt = formatUpdateTimestamp(status.lastCheckedAt);
    const checkedPart = checkedAt ? ` / 最終確認 ${checkedAt}` : '';

    if (status.updateAvailable && status.latestVersion) {
        statusEl.style.color = '#0a84ff';
        statusEl.textContent = `新しい版があります: v${status.latestVersion}${currentVersion ? `（${currentVersion}）` : ''}${checkedPart}`;
        return;
    }

    if (status.error) {
        statusEl.style.color = '#c62828';
        statusEl.textContent = `更新確認に失敗しました: ${status.error}${checkedPart}`;
        return;
    }

    statusEl.style.color = '#666';
    if (latestVersion || currentVersion) {
        statusEl.textContent = `${[currentVersion, latestVersion].filter(Boolean).join(' / ')}${checkedPart}`;
        return;
    }
    statusEl.textContent = checkedAt ? `最終確認 ${checkedAt}` : '未確認';
};

const refreshExtensionUpdateStatus = () => {
    chrome.runtime.sendMessage({ type: 'GET_EXTENSION_UPDATE_STATUS' }, (response) => {
        if (chrome.runtime?.lastError) {
            renderExtensionUpdateStatus({
                enabled: true,
                error: chrome.runtime.lastError.message
            });
            return;
        }
        if (!response?.success) {
            renderExtensionUpdateStatus({
                enabled: true,
                error: response?.error || '更新状態を取得できませんでした。'
            });
            return;
        }
        renderExtensionUpdateStatus(response.status);
    });
};

const runExtensionUpdateCheck = () => {
    const buttonEl = document.getElementById('checkExtensionUpdateNow');
    const statusEl = document.getElementById('extensionUpdateStatus');
    if (buttonEl) {
        buttonEl.disabled = true;
    }
    if (statusEl) {
        statusEl.style.color = '#666';
        statusEl.textContent = 'GitHub Releases を確認中...';
    }

    chrome.runtime.sendMessage({ type: 'CHECK_EXTENSION_UPDATE_NOW' }, (response) => {
        const enabled = document.getElementById('extensionUpdateCheckEnabled')?.checked !== false;
        if (buttonEl) {
            buttonEl.disabled = !enabled;
        }

        if (chrome.runtime?.lastError) {
            renderExtensionUpdateStatus({
                enabled,
                error: chrome.runtime.lastError.message
            });
            return;
        }
        if (!response?.success) {
            renderExtensionUpdateStatus({
                enabled,
                error: response?.error || '更新確認に失敗しました。'
            });
            return;
        }
        renderExtensionUpdateStatus(response.status);
    });
};

const showExtensionUpdateNotificationPreview = () => {
    const statusEl = document.getElementById('extensionUpdateNotificationPreviewStatus');
    const buttonEl = document.getElementById('showExtensionUpdateNotificationPreview');
    if (buttonEl) {
        buttonEl.disabled = true;
    }
    if (statusEl) {
        statusEl.style.color = '#666';
        statusEl.textContent = '更新通知を表示中...';
    }

    chrome.runtime.sendMessage({ type: 'SHOW_EXTENSION_UPDATE_NOTIFICATION_PREVIEW' }, (response) => {
        if (buttonEl) {
            buttonEl.disabled = false;
        }
        if (!statusEl) return;

        if (chrome.runtime?.lastError) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = `通知表示に失敗しました: ${chrome.runtime.lastError.message}`;
            return;
        }
        if (!response?.success) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = response?.error || '通知表示に失敗しました。';
            return;
        }

        statusEl.style.color = '#2e7d32';
        statusEl.textContent = '更新通知を表示しました。';
    });
};

const shouldReloadWebClassTabsAfterControlChange = (target) => {
    if (!(target instanceof HTMLElement)) return false;
    return WEBCLASS_RELOAD_REQUIRED_CONTROL_IDS.has(target.id);
};

const reloadOpenWebClassTabs = () => {
    if (!chrome?.tabs?.query || !chrome?.tabs?.reload) return;
    chrome.tabs.query({ url: WEBCLASS_TAB_URL_PATTERNS }, (tabs) => {
        if (chrome.runtime?.lastError || !Array.isArray(tabs) || tabs.length === 0) return;
        tabs.forEach((tab) => {
            if (typeof tab.id !== 'number') return;
            chrome.tabs.reload(tab.id, () => {
                void chrome.runtime?.lastError;
            });
        });
    });
    /*
        statusEl.textContent = `謗･邯壹お繝ｩ繝ｼ: ${error instanceof Error ? error.message : String(error)}`;
    }
    */
};

const SENSITIVE_SESSION_DEFAULTS = {
    openaiApiKey: '',
    groqApiKey: '',
    // Legacy-only: Todoist token is now persisted in encrypted local storage.
    [TODOIST_TODO_API_TOKEN_KEY]: '',
};
const LEGACY_AUTO_LOGIN_SESSION_DEFAULTS = {
    username: '',
    password: '',
};

const hasSessionStorage = () => !!(chrome?.storage?.session?.get && chrome?.storage?.session?.set);

const storageSessionGetAsync = (defaults = {}) => new Promise((resolve) => {
    if (!hasSessionStorage()) {
        resolve({ ...defaults });
        return;
    }
    chrome.storage.session.get(defaults, resolve);
});

const storageSessionSetAsync = (values = {}) => new Promise((resolve) => {
    if (!hasSessionStorage()) {
        resolve();
        return;
    }
    chrome.storage.session.set(values, resolve);
});

const storageSessionRemoveAsync = (keys = []) => new Promise((resolve) => {
    if (!hasSessionStorage() || !Array.isArray(keys) || keys.length === 0) {
        resolve();
        return;
    }
    chrome.storage.session.remove(keys, resolve);
});

const storageLocalSetAsync = (values = {}) => new Promise((resolve, reject) => {
    try {
        chrome.storage.local.set(values, () => {
            const lastError = chrome.runtime?.lastError;
            if (lastError) {
                reject(new Error(lastError.message));
                return;
            }
            resolve();
        });
    } catch (error) {
        reject(error);
    }
});

const secureStorageApi = globalThis.WebClassSecureStorage || null;
let autoLoginPasswordStored = false;
let autoLoginPasswordInputDirty = false;
let autoLoginPasswordPendingDeletion = false;

const isEncryptedSecureStorageValue = (value) => !!secureStorageApi?.isEncryptedPayload?.(value);

const encryptSecureLocalString = async (value) => {
    if (typeof value !== 'string') {
        throw new Error('Secure storage expects string values.');
    }
    const normalizedValue = value.trim();
    if (!normalizedValue) {
        return '';
    }
    if (!secureStorageApi?.encryptString) {
        throw new Error('Secure storage is unavailable.');
    }
    return secureStorageApi.encryptString(normalizedValue);
};

const readSecureLocalString = async (localItems, key, migratedValues) => {
    const rawValue = localItems[key];
    if (isEncryptedSecureStorageValue(rawValue)) {
        try {
            return await secureStorageApi.decryptString(rawValue);
        } catch (error) {
            console.warn('[WebClass UX] Failed to decrypt secure local value', key, error);
            return '';
        }
    }

    const plainValue = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (plainValue && migratedValues) {
        try {
            migratedValues[key] = await encryptSecureLocalString(plainValue);
        } catch (error) {
            console.warn('[WebClass UX] Failed to migrate secure local value', key, error);
        }
    }
    return plainValue;
};

const readSecureLocalStringPresence = async (localItems, key, migratedValues) => {
    const rawValue = localItems[key];
    if (isEncryptedSecureStorageValue(rawValue)) {
        return true;
    }

    const plainValue = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (plainValue && migratedValues) {
        try {
            migratedValues[key] = await encryptSecureLocalString(plainValue);
        } catch (error) {
            console.warn('[WebClass UX] Failed to migrate secure local value', key, error);
        }
    }
    return !!plainValue;
};

const updateAutoLoginPasswordUi = () => {
    const passwordInput = document.getElementById('password');
    const statusEl = document.getElementById('autoLoginPasswordStatus');
    const clearButton = document.getElementById('clearStoredPasswordButton');
    if (!passwordInput || !statusEl || !clearButton) return;

    const hasPendingReplacement = autoLoginPasswordInputDirty && !!passwordInput.value.trim();

    if (autoLoginPasswordPendingDeletion) {
        passwordInput.placeholder = '削除予定です';
        statusEl.textContent = '保存済みパスワードは削除予定です。';
    } else if (hasPendingReplacement) {
        passwordInput.placeholder = '新しいパスワードを入力中';
        statusEl.textContent = '入力中のパスワードを次回保存時に反映します。';
    } else if (autoLoginPasswordStored) {
        passwordInput.placeholder = '変更する場合のみ入力';
        statusEl.textContent = 'パスワードは保存済みです。変更する場合のみ入力してください。';
    } else {
        passwordInput.placeholder = 'パスワードを入力';
        statusEl.textContent = '保存済みパスワードはありません。';
    }

    clearButton.disabled = !autoLoginPasswordStored || autoLoginPasswordPendingDeletion;
};

const resetAutoLoginPasswordState = ({ stored }) => {
    const passwordInput = document.getElementById('password');
    autoLoginPasswordStored = !!stored;
    autoLoginPasswordInputDirty = false;
    autoLoginPasswordPendingDeletion = false;
    if (passwordInput) {
        passwordInput.value = '';
    }
    updateAutoLoginPasswordUi();
};

const normalizeMsTodoReminderDaysBefore = (value, fallback = MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE) => {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(7, Math.max(0, parsed));
};

const normalizeMsTodoReminderTimeMode = (value, fallback = MS_TODO_REMINDER_TIME_MODE_AT_9AM) => {
    return value === MS_TODO_REMINDER_TIME_MODE_EXACT_OFFSET
        ? MS_TODO_REMINDER_TIME_MODE_EXACT_OFFSET
        : fallback;
};

const containsLikelyMojibake = (value) => {
    if (typeof value !== 'string') return false;
    return TODO_MOJIBAKE_PATTERN.test(value);
};

const sanitizeTodoName = (value, fallback = TODO_DEFAULT_LIST_NAME) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) return fallback;
    return containsLikelyMojibake(trimmed) ? fallback : trimmed;
};

const extractCourseIdFromUrl = (rawUrl) => {
    if (typeof rawUrl !== 'string' || !rawUrl) return '';
    const match = rawUrl.match(/course\.php\/([^\/?#]+)/);
    return match ? match[1].trim() : '';
};

const normalizeCourseMapKey = (assignment) => {
    if (!assignment || typeof assignment !== 'object') return '';
    const url = assignment.url || assignment.fallbackUrl || '';
    const courseId = extractCourseIdFromUrl(url);
    if (courseId) return courseId;
    const fullName = typeof assignment.courseFullName === 'string'
        ? assignment.courseFullName.trim()
        : '';
    return fullName ? `full:${fullName}` : '';
};

const canonicalizeShortcutKeyToken = (token) => {
    if (typeof token !== 'string') return '';
    const normalizedToken = typeof token.normalize === 'function' ? token.normalize('NFKC') : token;
    const trimmed = normalizedToken.trim();
    if (!trimmed) return '';
    const lower = trimmed.toLowerCase();

    if (lower === ' ') return 'Space';
    if (lower === 'space' || lower === 'spacebar') return 'Space';
    if (lower === 'esc' || lower === 'escape') return 'Escape';
    if (lower === 'up' || lower === 'arrowup') return 'ArrowUp';
    if (lower === 'down' || lower === 'arrowdown') return 'ArrowDown';
    if (lower === 'left' || lower === 'arrowleft') return 'ArrowLeft';
    if (lower === 'right' || lower === 'arrowright') return 'ArrowRight';
    if (lower === 'process' || lower === 'unidentified') return '';

    if (/^f\d{1,2}$/i.test(trimmed)) {
        return trimmed.toUpperCase();
    }
    if (trimmed.length === 1) {
        return trimmed.toUpperCase();
    }
    return trimmed[0].toUpperCase() + trimmed.slice(1);
};

const normalizeShortcut = (rawShortcut) => {
    if (typeof rawShortcut !== 'string') return '';
    const normalizedRawShortcut = typeof rawShortcut.normalize === 'function'
        ? rawShortcut.normalize('NFKC')
        : rawShortcut;
    const trimmedShortcut = normalizedRawShortcut.trim();
    if (!trimmedShortcut) return '';

    const tokens = trimmedShortcut
        .split('+')
        .map((part) => part.trim())
        .filter(Boolean);
    if (tokens.length === 0) return '';

    const modifiers = new Set();
    let keyToken = '';
    for (const token of tokens) {
        const mappedModifier = SHORTCUT_MODIFIER_TOKEN_MAP[token.toLowerCase()];
        if (mappedModifier) {
            modifiers.add(mappedModifier);
            continue;
        }
        if (keyToken) return null;
        keyToken = canonicalizeShortcutKeyToken(token);
    }

    if (!keyToken || SHORTCUT_MODIFIER_ORDER.includes(keyToken) || modifiers.size === 0) {
        return null;
    }

    const orderedModifiers = SHORTCUT_MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier));
    return [...orderedModifiers, keyToken].join('+');
};

const normalizeShorteningModeFlags = (llmEnabled, ruleEnabled) => {
    const llm = !!llmEnabled;
    const rule = !!ruleEnabled;
    if (llm && rule) {
        return { llmEnabled: true, ruleEnabled: false, changed: true };
    }
    if (!llm && !rule) {
        return { llmEnabled: false, ruleEnabled: true, changed: true };
    }
    return { llmEnabled: llm, ruleEnabled: rule, changed: false };
};

const enforceLlmRuleMutualExclusion = (changedToggleId = '') => {
    const llmToggle = document.getElementById('useLlmCourseNameEnabled');
    const ruleToggle = document.getElementById('useRuleCourseNameEnabled');
    if (!llmToggle || !ruleToggle) return;

    if (changedToggleId === 'useLlmCourseNameEnabled' && llmToggle.checked) {
        ruleToggle.checked = false;
    }
    if (changedToggleId === 'useRuleCourseNameEnabled' && ruleToggle.checked) {
        llmToggle.checked = false;
    }
    const normalizedFlags = normalizeShorteningModeFlags(llmToggle.checked, ruleToggle.checked);
    llmToggle.checked = normalizedFlags.llmEnabled;
    ruleToggle.checked = normalizedFlags.ruleEnabled;
    updateLlmProviderSettingsAvailability(normalizedFlags.llmEnabled);
};

const normalizeDashboardVisibleRangeValue = (value, fallback = DASHBOARD_VISIBLE_RANGE_MIN) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(DASHBOARD_VISIBLE_RANGE_MAX, Math.max(DASHBOARD_VISIBLE_RANGE_MIN, parsed));
};

const normalizeDashboardVisibleRange = (range = {}) => {
    const normalized = {
        startPeriod: normalizeDashboardVisibleRangeValue(range.startPeriod, DASHBOARD_VISIBLE_RANGE_MIN),
        endPeriod: normalizeDashboardVisibleRangeValue(range.endPeriod, DASHBOARD_VISIBLE_RANGE_MAX),
        startWeekday: normalizeDashboardVisibleRangeValue(range.startWeekday, DASHBOARD_VISIBLE_RANGE_MIN),
        endWeekday: normalizeDashboardVisibleRangeValue(range.endWeekday, DASHBOARD_VISIBLE_RANGE_MAX)
    };

    if (normalized.startPeriod > normalized.endPeriod) {
        normalized.endPeriod = normalized.startPeriod;
    }
    if (normalized.startWeekday > normalized.endWeekday) {
        normalized.endWeekday = normalized.startWeekday;
    }

    return normalized;
};

const getDashboardVisibleRangeFromInputs = () => normalizeDashboardVisibleRange({
    startPeriod: document.getElementById(DASHBOARD_VISIBLE_START_PERIOD_KEY)?.value,
    endPeriod: document.getElementById(DASHBOARD_VISIBLE_END_PERIOD_KEY)?.value,
    startWeekday: document.getElementById(DASHBOARD_VISIBLE_START_WEEKDAY_KEY)?.value,
    endWeekday: document.getElementById(DASHBOARD_VISIBLE_END_WEEKDAY_KEY)?.value
});

const setDashboardVisibleRangeInputs = (range = {}) => {
    const normalized = normalizeDashboardVisibleRange(range);
    [
        [DASHBOARD_VISIBLE_START_PERIOD_KEY, normalized.startPeriod],
        [DASHBOARD_VISIBLE_END_PERIOD_KEY, normalized.endPeriod],
        [DASHBOARD_VISIBLE_START_WEEKDAY_KEY, normalized.startWeekday],
        [DASHBOARD_VISIBLE_END_WEEKDAY_KEY, normalized.endWeekday]
    ].forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (input) {
            input.value = String(value);
        }
    });
    return normalized;
};

const formatDashboardVisibleRangeSummary = (range = {}) => {
    const normalized = normalizeDashboardVisibleRange(range);
    const startWeekday = DASHBOARD_VISIBLE_WEEKDAY_LABELS[normalized.startWeekday - 1] || String(normalized.startWeekday);
    const endWeekday = DASHBOARD_VISIBLE_WEEKDAY_LABELS[normalized.endWeekday - 1] || String(normalized.endWeekday);
    return `${normalized.startPeriod}限 - ${normalized.endPeriod}限 / ${startWeekday} - ${endWeekday}`;
};

const getDashboardVisibleRangeKey = (range = {}) => {
    const normalized = normalizeDashboardVisibleRange(range);
    return [
        normalized.startPeriod,
        normalized.endPeriod,
        normalized.startWeekday,
        normalized.endWeekday
    ].join(':');
};

const getDashboardRangePositionFromCell = (cell) => {
    if (!(cell instanceof HTMLElement) || !cell.classList.contains('dashboard-range-cell')) return null;
    return {
        period: normalizeDashboardVisibleRangeValue(cell.dataset.period, DASHBOARD_VISIBLE_RANGE_MIN),
        weekday: normalizeDashboardVisibleRangeValue(cell.dataset.weekday, DASHBOARD_VISIBLE_RANGE_MIN)
    };
};

const getDashboardRangeDragHandleMode = (cell, range = getDashboardVisibleRangeFromInputs(), event = null) => {
    const position = getDashboardRangePositionFromCell(cell);
    if (!position) return '';

    const isStart = position.period === range.startPeriod && position.weekday === range.startWeekday;
    const isEnd = position.period === range.endPeriod && position.weekday === range.endWeekday;
    if (isStart && isEnd) {
        if (!event) return 'end';
        const rect = cell.getBoundingClientRect();
        const relativeX = event.clientX - rect.left;
        const relativeY = event.clientY - rect.top;
        return relativeX + relativeY < (rect.width + rect.height) / 2 ? 'start' : 'end';
    }
    if (isStart) return 'start';
    if (isEnd) return 'end';
    return '';
};

const getDashboardVisibleRangeWithMovedHandle = (range, handleMode, targetPosition) => {
    const normalized = normalizeDashboardVisibleRange(range);
    if (handleMode === 'start') {
        return normalizeDashboardVisibleRange({
            ...normalized,
            startPeriod: Math.min(targetPosition.period, normalized.endPeriod),
            startWeekday: Math.min(targetPosition.weekday, normalized.endWeekday)
        });
    }
    if (handleMode === 'end') {
        return normalizeDashboardVisibleRange({
            ...normalized,
            endPeriod: Math.max(targetPosition.period, normalized.startPeriod),
            endWeekday: Math.max(targetPosition.weekday, normalized.startWeekday)
        });
    }
    return normalized;
};

const getDashboardRangeCellFromPointerEvent = (event) => {
    const elementAtPoint = document.elementFromPoint(event.clientX, event.clientY);
    return elementAtPoint?.closest?.('.dashboard-range-cell') || event.target?.closest?.('.dashboard-range-cell') || null;
};

const renderDashboardVisibleRangeGrid = () => {
    const grid = document.getElementById('dashboardVisibleRangeGrid');
    const summary = document.getElementById('dashboardVisibleRangeSummary');
    if (!grid) return;

    const range = setDashboardVisibleRangeInputs(getDashboardVisibleRangeFromInputs());
    if (summary) {
        summary.textContent = `表示範囲: ${formatDashboardVisibleRangeSummary(range)}`;
    }

    grid.classList.toggle('is-dragging', !!dashboardRangeDragState);
    grid.replaceChildren();

    const corner = document.createElement('div');
    corner.className = 'dashboard-range-axis-label is-corner';
    grid.appendChild(corner);

    DASHBOARD_VISIBLE_WEEKDAY_LABELS.forEach((label) => {
        const header = document.createElement('div');
        header.className = 'dashboard-range-axis-label';
        header.textContent = label;
        grid.appendChild(header);
    });

    for (let period = DASHBOARD_VISIBLE_RANGE_MIN; period <= DASHBOARD_VISIBLE_RANGE_MAX; period += 1) {
        const rowHeader = document.createElement('div');
        rowHeader.className = 'dashboard-range-axis-label';
        rowHeader.textContent = String(period);
        grid.appendChild(rowHeader);

        for (let weekday = DASHBOARD_VISIBLE_RANGE_MIN; weekday <= DASHBOARD_VISIBLE_RANGE_MAX; weekday += 1) {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'dashboard-range-cell';
            cell.dataset.period = String(period);
            cell.dataset.weekday = String(weekday);

            const isSelected =
                period >= range.startPeriod &&
                period <= range.endPeriod &&
                weekday >= range.startWeekday &&
                weekday <= range.endWeekday;
            const isStart = period === range.startPeriod && weekday === range.startWeekday;
            const isEnd = period === range.endPeriod && weekday === range.endWeekday;
            const isDragOrigin =
                dashboardRangeDragState &&
                period === dashboardRangeDragState.anchorPeriod &&
                weekday === dashboardRangeDragState.anchorWeekday;

            cell.classList.toggle('is-selected', isSelected);
            cell.classList.toggle(
                'is-edge',
                isSelected && (
                    period === range.startPeriod ||
                    period === range.endPeriod ||
                    weekday === range.startWeekday ||
                    weekday === range.endWeekday
                )
            );
            cell.classList.toggle('is-start', isStart);
            cell.classList.toggle('is-end', isEnd);
            cell.classList.toggle('is-drag-origin', !!isDragOrigin);
            cell.classList.toggle('is-range-handle', isStart || isEnd);
            cell.dataset.handle = isStart && isEnd ? 'both' : isStart ? 'start' : isEnd ? 'end' : '';
            cell.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

            const cellStateLabel = isStart && isEnd
                ? ' 開始位置 終了位置'
                : isStart
                    ? ' 開始位置'
                    : isEnd
                        ? ' 終了位置'
                        : isSelected
                            ? ' 表示範囲内'
                            : '';
            cell.setAttribute('aria-label', `${period}限 ${DASHBOARD_VISIBLE_WEEKDAY_LABELS[weekday - 1]}曜${cellStateLabel}`);

            grid.appendChild(cell);
        }
    }
};

const normalizeMaterialDownloadFilenameSeparator = (value) => {
    return MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_VALUES.has(value)
        ? value
        : MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_DEFAULT;
};

const updateDashboardVisibleRangeDuringDrag = (targetCell) => {
    if (!dashboardRangeDragState) return null;
    const targetPosition = getDashboardRangePositionFromCell(targetCell);
    if (!targetPosition) return null;

    const nextRange = getDashboardVisibleRangeWithMovedHandle(
        dashboardRangeDragState.initialRange,
        dashboardRangeDragState.handleMode,
        targetPosition
    );
    const nextRangeKey = getDashboardVisibleRangeKey(nextRange);
    if (dashboardRangeDragState.lastRangeKey === nextRangeKey) return nextRange;

    dashboardRangeDragState.lastRangeKey = nextRangeKey;
    setDashboardVisibleRangeInputs(nextRange);
    renderDashboardVisibleRangeGrid();
    return nextRange;
};

const handleDashboardRangePointerDown = (event) => {
    if (event.button !== 0) return;
    const cell = event.target?.closest?.('.dashboard-range-cell');
    const position = getDashboardRangePositionFromCell(cell);
    if (!position) return;

    const grid = document.getElementById('dashboardVisibleRangeGrid');
    const initialRange = getDashboardVisibleRangeFromInputs();
    const handleMode = getDashboardRangeDragHandleMode(cell, initialRange, event);
    if (!handleMode) return;

    event.preventDefault();
    dashboardRangeDragState = {
        pointerId: event.pointerId,
        handleMode,
        anchorPeriod: position.period,
        anchorWeekday: position.weekday,
        initialRange,
        initialRangeKey: getDashboardVisibleRangeKey(initialRange),
        lastRangeKey: ''
    };

    if (grid?.setPointerCapture) {
        try {
            grid.setPointerCapture(event.pointerId);
        } catch (_error) {
            // Pointer capture is a nice-to-have for dragging beyond cell edges.
        }
    }

    updateDashboardVisibleRangeDuringDrag(cell);
};

const handleDashboardRangePointerMove = (event) => {
    if (!dashboardRangeDragState || dashboardRangeDragState.pointerId !== event.pointerId) return;
    event.preventDefault();
    const cell = getDashboardRangeCellFromPointerEvent(event);
    updateDashboardVisibleRangeDuringDrag(cell);
};

const finishDashboardRangeDrag = async (event) => {
    if (!dashboardRangeDragState || dashboardRangeDragState.pointerId !== event.pointerId) return;
    event.preventDefault();

    const grid = document.getElementById('dashboardVisibleRangeGrid');
    const cell = getDashboardRangeCellFromPointerEvent(event);
    updateDashboardVisibleRangeDuringDrag(cell);

    const completedDragState = dashboardRangeDragState;
    const finalRange = getDashboardVisibleRangeFromInputs();
    const didChangeRange = getDashboardVisibleRangeKey(finalRange) !== completedDragState.initialRangeKey;
    dashboardRangeDragState = null;

    if (grid?.hasPointerCapture?.(event.pointerId)) {
        try {
            grid.releasePointerCapture(event.pointerId);
        } catch (_error) {
            // Ignore capture release failures caused by browser timing.
        }
    }
    renderDashboardVisibleRangeGrid();

    if (didChangeRange) {
        await saveOptions({
            source: 'auto',
            showSuccess: false,
            reloadWebClassTabsAfterSave: true
        });
    }
};

const cancelDashboardRangeDrag = (event) => {
    if (!dashboardRangeDragState || dashboardRangeDragState.pointerId !== event.pointerId) return;
    const grid = document.getElementById('dashboardVisibleRangeGrid');
    setDashboardVisibleRangeInputs(dashboardRangeDragState.initialRange);
    dashboardRangeDragState = null;

    if (grid?.hasPointerCapture?.(event.pointerId)) {
        try {
            grid.releasePointerCapture(event.pointerId);
        } catch (_error) {
            // Ignore capture release failures caused by browser timing.
        }
    }
    renderDashboardVisibleRangeGrid();
};

const initDashboardVisibleRangeControls = () => {
    const grid = document.getElementById('dashboardVisibleRangeGrid');
    if (!grid) return;

    grid.addEventListener('pointerdown', handleDashboardRangePointerDown);
    grid.addEventListener('pointermove', handleDashboardRangePointerMove);
    grid.addEventListener('pointerup', finishDashboardRangeDrag);
    grid.addEventListener('pointercancel', cancelDashboardRangeDrag);

    renderDashboardVisibleRangeGrid();
};

// Saves options to chrome.storage
const saveOptions = async ({
    source = 'manual',
    showSuccess = source === 'manual',
    reloadWebClassTabsAfterSave = false
} = {}) => {
    clearAutoSaveTimer();
    try {

    const autoLoginEnabled = document.getElementById('autoLoginEnabled').checked;
    const debugModeEnabled = document.getElementById('debugModeEnabled').checked;
    const username = (document.getElementById('username').value || '').trim();
    const passwordInput = document.getElementById('password');
    const password = (passwordInput?.value || '').trim();
    const shouldReplaceAutoLoginPassword = !!password;
    const shouldDeleteAutoLoginPassword = autoLoginPasswordPendingDeletion;
    const defaultViewVersion = document.querySelector('input[name="defaultViewVersion"]:checked')?.value || '2';
    const currentView = defaultViewVersion === 'original' ? 'plain' : 'dashboard';
    const extensionVisualEnabled = defaultViewVersion !== 'original';
    const extensionUpdateCheckEnabled = !!document.getElementById('extensionUpdateCheckEnabled')?.checked;
    const dashboardDangerTodoOutlineEnabled = document.getElementById('dashboardDangerTodoOutlineEnabled')?.checked !== false;
    const courseQuickNavDefaultState = document.querySelector('input[name="courseQuickNavDefaultState"]:checked')?.value || 'expanded';
    const courseQuickNavCollapsed = courseQuickNavDefaultState === 'collapsed';
    const rawViewToggleShortcut = shortcutInputToStorageValue(document.getElementById('viewToggleShortcut').value.trim());
    const normalizedViewToggleShortcut = rawViewToggleShortcut
        ? normalizeShortcut(rawViewToggleShortcut)
        : '';

    const strictShortcutValidation = source === 'manual' || source === 'shortcut';
    let shortcutToPersist = normalizedViewToggleShortcut;
    if (rawViewToggleShortcut && !normalizedViewToggleShortcut) {
        if (strictShortcutValidation) {
            showInvalidShortcutStatus();
            return false;
        }
        shortcutToPersist = lastSavedViewToggleShortcut;
    } else {
        setShortcutInputDisplayValue(normalizedViewToggleShortcut);
    }

    const useCustomCourseNameEnabled = document.getElementById('useCustomCourseNameEnabled').checked;
    let useLlmCourseNameEnabled = document.getElementById('useLlmCourseNameEnabled').checked;
    let useRuleCourseNameEnabled = document.getElementById('useRuleCourseNameEnabled').checked;
    const normalizedShorteningFlags = normalizeShorteningModeFlags(useLlmCourseNameEnabled, useRuleCourseNameEnabled);
    useLlmCourseNameEnabled = normalizedShorteningFlags.llmEnabled;
    useRuleCourseNameEnabled = normalizedShorteningFlags.ruleEnabled;
    if (normalizedShorteningFlags.changed) {
        document.getElementById('useLlmCourseNameEnabled').checked = useLlmCourseNameEnabled;
        document.getElementById('useRuleCourseNameEnabled').checked = useRuleCourseNameEnabled;
    }
    updateLlmProviderSettingsAvailability(useLlmCourseNameEnabled);
    const autoRunCourseNameConversionOnDashboardLoad = document.getElementById('autoRunCourseNameConversionOnDashboardLoad').checked;
    const courseNameProvider = document.getElementById('courseNameProvider').value;
    const showLlmCourseStatusToggle = document.getElementById('showLlmCourseStatusEnabled');
    const showLlmCourseStatusEnabled = debugModeEnabled && !!showLlmCourseStatusToggle?.checked;
    if (showLlmCourseStatusToggle && !debugModeEnabled && showLlmCourseStatusToggle.checked) {
        showLlmCourseStatusToggle.checked = false;
    }
    const openaiApiKey = document.getElementById('openaiApiKey').value.trim();
    let openaiCourseNameModel = document.getElementById('openaiCourseNameModel').value.trim();
    if (!openaiCourseNameModel) {
        openaiCourseNameModel = 'gpt-4o-mini';
    }
    const groqApiKey = document.getElementById('groqApiKey').value.trim();
    let groqCourseNameModel = document.getElementById('groqCourseNameModel').value.trim();
    if (!groqCourseNameModel) {
        groqCourseNameModel = 'llama-3.1-70b';
    }
    let shikenSelectVisibleCount = document.getElementById('shikenSelectVisibleCount').value;
    const parsedSelectCount = parseInt(shikenSelectVisibleCount, 10);
    if (Number.isNaN(parsedSelectCount) || parsedSelectCount < 0) {
        shikenSelectVisibleCount = '12';
    } else {
        shikenSelectVisibleCount = String(parsedSelectCount);
    }
    const todoApiEnabled = !!document.getElementById('todoApiEnabled')?.checked;
    const selectedTodoApiProvider = normalizeTodoApiProviderForSurface(
        document.getElementById('todoApiProvider')?.value || 'none'
    );
    const todoApiProvider = todoApiEnabled ? selectedTodoApiProvider : 'none';
    const msTodoClientId = (document.getElementById('msTodoClientId')?.value || '').trim();
    const msTodoTenantId = getMicrosoftTenantValue();
    let msTodoListName = sanitizeTodoName(document.getElementById('msTodoListName')?.value, TODO_DEFAULT_LIST_NAME);
    const googleTodoClientId = (document.getElementById('googleTodoClientId')?.value || '').trim();
    const googleTodoClientSecret = (document.getElementById('googleTodoClientSecret')?.value || '').trim();
    let googleTodoListName = sanitizeTodoName(document.getElementById('googleTodoListName')?.value, TODO_DEFAULT_LIST_NAME);
    const todoistTodoApiToken = (document.getElementById('todoistTodoApiToken')?.value || '').trim();
    let todoistTodoProjectName = sanitizeTodoName(
        document.getElementById('todoistTodoProjectName')?.value,
        TODO_DEFAULT_LIST_NAME
    );
    let ticktickTodoClientId = (document.getElementById('ticktickTodoClientId')?.value || '').trim();
    let ticktickTodoClientSecret = (document.getElementById('ticktickTodoClientSecret')?.value || '').trim();
    let ticktickTodoProjectName = sanitizeTodoName(
        document.getElementById('ticktickTodoProjectName')?.value,
        TODO_DEFAULT_LIST_NAME
    );
    const encryptedGoogleTodoClientSecret = googleTodoClientSecret
        ? await encryptSecureLocalString(googleTodoClientSecret)
        : '';
    const encryptedTodoistTodoApiToken = todoistTodoApiToken
        ? await encryptSecureLocalString(todoistTodoApiToken)
        : '';
    const encryptedTickTickTodoClientSecret = ticktickTodoClientSecret
        ? await encryptSecureLocalString(ticktickTodoClientSecret)
        : '';
    const encryptedAutoLoginUsername = username
        ? await encryptSecureLocalString(username)
        : '';
    const encryptedAutoLoginPassword = shouldReplaceAutoLoginPassword
        ? await encryptSecureLocalString(password)
        : '';
    const todoApiTaskTitleFormat = document.getElementById('todoApiTaskTitleFormat')?.value || 'task_only';
    const msTodoDefaultReminderDaysBefore = normalizeMsTodoReminderDaysBefore(
        document.getElementById('msTodoDefaultReminderDaysBefore')?.value,
        MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE
    );
    const msTodoDefaultReminderTimeMode = normalizeMsTodoReminderTimeMode(
        document.getElementById('msTodoDefaultReminderTimeMode')?.value,
        MS_TODO_REMINDER_TIME_MODE_AT_9AM
    );
    const todoApiUltraShortCourseMap = {};
    document.querySelectorAll('#todoApiUltraShortCourseMap input[data-course-key]').forEach((input) => {
        const key = input.dataset.courseKey;
        const value = (input.value || '').trim();
        if (key && value) {
            todoApiUltraShortCourseMap[key] = value;
        }
    });

    const tocInitialState = document.querySelector('input[name="tocInitialState"]:checked')?.value || 'open';
    const tocInitialCloseDelay = document.getElementById('tocInitialCloseDelay').value;
    const tocAutoHide = document.getElementById('tocAutoHide').checked;
    const tocAutoHideDelay = document.getElementById('tocAutoHideDelay').value;
    const tocShowSectionTitles = document.getElementById('tocShowSectionTitles').checked;
    const materialDownloadFilenameSeparator = normalizeMaterialDownloadFilenameSeparator(
        document.querySelector('input[name="materialDownloadFilenameSeparator"]:checked')?.value
    );
    const tocHoverReveal = document.getElementById('tocHoverReveal').checked;
    const dashboardVisibleRange = getDashboardVisibleRangeFromInputs();

        const localWritePayload = {
            autoLoginEnabled,
            debugModeEnabled,
            username: encryptedAutoLoginUsername,
            defaultViewVersion,
            currentView,
            [EXTENSION_VISUAL_ENABLED_KEY]: extensionVisualEnabled,
            [EXTENSION_UPDATE_CHECK_ENABLED_KEY]: extensionUpdateCheckEnabled,
            [DASHBOARD_DANGER_TODO_OUTLINE_ENABLED_KEY]: dashboardDangerTodoOutlineEnabled,
            [COURSE_QUICK_NAV_COLLAPSED_KEY]: courseQuickNavCollapsed,
            viewToggleShortcut: shortcutToPersist,
            viewToggleShortcutMigratedToCtrlShiftM: false,
            useCustomCourseNameEnabled,
            useLlmCourseNameEnabled,
            useRuleCourseNameEnabled,
            autoRunCourseNameConversionOnDashboardLoad,
            courseNameProvider,
            showLlmCourseStatusEnabled,
            openaiApiKey: '',
            openaiCourseNameModel,
            groqApiKey: '',
            groqCourseNameModel,
            // backward-compat for older keys
            openaiCourseNameEnabled: useLlmCourseNameEnabled,
            useShortCourseNameEnabled: null,
            shikenSelectVisibleCount,
            [TODO_API_ENABLED_KEY]: todoApiEnabled,
            [TODO_API_PROVIDER_KEY]: todoApiProvider,
            [MS_TODO_CLIENT_ID_KEY]: msTodoClientId,
            [MS_TODO_TENANT_ID_KEY]: msTodoTenantId,
            [MS_TODO_LIST_NAME_KEY]: msTodoListName,
            [GOOGLE_TODO_CLIENT_ID_KEY]: googleTodoClientId,
            [GOOGLE_TODO_CLIENT_SECRET_KEY]: encryptedGoogleTodoClientSecret,
            [GOOGLE_TODO_LIST_NAME_KEY]: googleTodoListName,
            [TODOIST_TODO_API_TOKEN_KEY]: encryptedTodoistTodoApiToken,
            [TODOIST_TODO_PROJECT_NAME_KEY]: todoistTodoProjectName,
            [TICKTICK_TODO_PROJECT_NAME_KEY]: ticktickTodoProjectName,
            [TICKTICK_TODO_CLIENT_ID_KEY]: ticktickTodoClientId,
            [TICKTICK_TODO_CLIENT_SECRET_KEY]: encryptedTickTickTodoClientSecret,
            [TODO_API_TASK_TITLE_FORMAT_KEY]: todoApiTaskTitleFormat,
            [MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE_KEY]: msTodoDefaultReminderDaysBefore,
            [MS_TODO_DEFAULT_REMINDER_TIME_MODE_KEY]: msTodoDefaultReminderTimeMode,
            [TODO_API_ULTRA_SHORT_MAP_KEY]: todoApiUltraShortCourseMap,
            tocInitialState,
            tocInitialCloseDelay,
            tocAutoHide,
            tocAutoHideDelay,
            tocShowSectionTitles,
            [MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_KEY]: materialDownloadFilenameSeparator,
            tocHoverReveal,
            [DASHBOARD_VISIBLE_START_PERIOD_KEY]: dashboardVisibleRange.startPeriod,
            [DASHBOARD_VISIBLE_END_PERIOD_KEY]: dashboardVisibleRange.endPeriod,
            [DASHBOARD_VISIBLE_START_WEEKDAY_KEY]: dashboardVisibleRange.startWeekday,
            [DASHBOARD_VISIBLE_END_WEEKDAY_KEY]: dashboardVisibleRange.endWeekday
        };
        if (shouldDeleteAutoLoginPassword) {
            localWritePayload.password = '';
        } else if (shouldReplaceAutoLoginPassword) {
            localWritePayload.password = encryptedAutoLoginPassword;
        }

        await storageLocalSetAsync(localWritePayload);
        await Promise.all([
            storageSessionSetAsync({
                openaiApiKey,
                groqApiKey
            }),
            storageSessionRemoveAsync(Object.keys(LEGACY_AUTO_LOGIN_SESSION_DEFAULTS))
        ]);
        lastSavedViewToggleShortcut = shortcutToPersist;
        if (shouldDeleteAutoLoginPassword) {
            resetAutoLoginPasswordState({ stored: false });
        } else if (shouldReplaceAutoLoginPassword) {
            resetAutoLoginPasswordState({ stored: true });
        } else {
            updateAutoLoginPasswordUi();
        }
        if (showSuccess) {
            showStatusMessage('設定を保存しました。', '#2e7d32', 2000);
        }
        if (reloadWebClassTabsAfterSave) {
            reloadOpenWebClassTabs();
        }
        return true;
    } catch (error) {
        console.error('[WebClass UX] Failed to save options', error);
        showStatusMessage('設定の保存に失敗しました。', '#c62828', 2500);
        return false;
    }
};

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
const restoreOptions = () => {
    chrome.storage.local.get(
        {
            autoLoginEnabled: false,
            debugModeEnabled: false,
            username: '',
            password: '',
            defaultViewVersion: '2',
            currentView: 'dashboard',
            [EXTENSION_VISUAL_ENABLED_KEY]: true,
            [EXTENSION_UPDATE_CHECK_ENABLED_KEY]: true,
            [DASHBOARD_DANGER_TODO_OUTLINE_ENABLED_KEY]: true,
            [COURSE_QUICK_NAV_COLLAPSED_KEY]: false,
            viewToggleShortcut: DEFAULT_VIEW_TOGGLE_SHORTCUT,
            viewToggleShortcutMigratedToCtrlShiftM: false,
            useCustomCourseNameEnabled: null,
            useLlmCourseNameEnabled: null,
            useRuleCourseNameEnabled: null,
            autoRunCourseNameConversionOnDashboardLoad: false,
            useShortCourseNameEnabled: null,
            courseNameProvider: 'openai',
            showLlmCourseStatusEnabled: false,
            openaiCourseNameEnabled: false,
            openaiApiKey: '',
            openaiCourseNameModel: 'gpt-4o-mini',
            groqApiKey: '',
            groqCourseNameModel: 'llama-3.1-70b',
            shikenSelectVisibleCount: '12',
            [TODO_API_ENABLED_KEY]: null,
            [TODO_API_PROVIDER_KEY]: 'none',
            [MS_TODO_CLIENT_ID_KEY]: MS_TODO_DEFAULT_CLIENT_ID,
            [MS_TODO_TENANT_ID_KEY]: MS_TODO_DEFAULT_TENANT,
            [MS_TODO_LIST_NAME_KEY]: TODO_DEFAULT_LIST_NAME,
            [GOOGLE_TODO_CLIENT_ID_KEY]: GOOGLE_TODO_DEFAULT_CLIENT_ID,
            [GOOGLE_TODO_CLIENT_SECRET_KEY]: '',
            [GOOGLE_TODO_LIST_NAME_KEY]: TODO_DEFAULT_LIST_NAME,
            [TODOIST_TODO_API_TOKEN_KEY]: '',
            [TODOIST_TODO_PROJECT_NAME_KEY]: TODO_DEFAULT_LIST_NAME,
            [TICKTICK_TODO_PROJECT_NAME_KEY]: TODO_DEFAULT_LIST_NAME,
            [TICKTICK_TODO_CLIENT_ID_KEY]: '',
            [TICKTICK_TODO_CLIENT_SECRET_KEY]: '',
            [TODO_API_TASK_TITLE_FORMAT_KEY]: 'task_only',
            [MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE_KEY]: MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE,
            [MS_TODO_DEFAULT_REMINDER_TIME_MODE_KEY]: MS_TODO_REMINDER_TIME_MODE_AT_9AM,
            [TODO_API_ULTRA_SHORT_MAP_KEY]: {},
            tocInitialState: 'open',
            tocInitialCloseDelay: '5',
            tocAutoHide: false,
            tocAutoHideDelay: '10',
            tocShowSectionTitles: true,
            [MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_KEY]: MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_DEFAULT,
            tocHoverReveal: true,
            [DASHBOARD_VISIBLE_START_PERIOD_KEY]: 1,
            [DASHBOARD_VISIBLE_END_PERIOD_KEY]: 6,
            [DASHBOARD_VISIBLE_START_WEEKDAY_KEY]: 1,
            [DASHBOARD_VISIBLE_END_WEEKDAY_KEY]: 6
        },
        async (localItems) => {
            try {
                const sessionItems = await storageSessionGetAsync({
                    ...SENSITIVE_SESSION_DEFAULTS,
                    ...LEGACY_AUTO_LOGIN_SESSION_DEFAULTS
                });
                const migratedSessionValues = {};
                const migratedLocalClearValues = {};
                const migratedSecureLocalValues = {};
                const legacySessionKeysToRemove = [];

                const migrateIfNeeded = (key) => {
                    const sessionValue = typeof sessionItems[key] === 'string' ? sessionItems[key].trim() : '';
                    const localValue = typeof localItems[key] === 'string' ? localItems[key].trim() : '';
                    if (!sessionValue && localValue) {
                        migratedSessionValues[key] = localValue;
                        migratedLocalClearValues[key] = '';
                    }
                };

                migrateIfNeeded('openaiApiKey');
                migrateIfNeeded('groqApiKey');

                let autoLoginUsername = '';
                const legacySessionUsername = typeof sessionItems.username === 'string'
                    ? sessionItems.username.trim()
                    : '';
                if (legacySessionUsername) {
                    migratedSecureLocalValues.username = await encryptSecureLocalString(legacySessionUsername);
                    autoLoginUsername = legacySessionUsername;
                    legacySessionKeysToRemove.push('username');
                } else {
                    autoLoginUsername = await readSecureLocalString(localItems, 'username', migratedSecureLocalValues);
                }

                let autoLoginPasswordStoredNext = false;
                const legacySessionPassword = typeof sessionItems.password === 'string'
                    ? sessionItems.password.trim()
                    : '';
                if (legacySessionPassword) {
                    migratedSecureLocalValues.password = await encryptSecureLocalString(legacySessionPassword);
                    autoLoginPasswordStoredNext = true;
                    legacySessionKeysToRemove.push('password');
                } else {
                    autoLoginPasswordStoredNext = await readSecureLocalStringPresence(
                        localItems,
                        'password',
                        migratedSecureLocalValues
                    );
                }

                let todoistTodoApiToken = '';
                const legacyTodoistSessionToken = typeof sessionItems[TODOIST_TODO_API_TOKEN_KEY] === 'string'
                    ? sessionItems[TODOIST_TODO_API_TOKEN_KEY].trim()
                    : '';
                if (legacyTodoistSessionToken) {
                    migratedSecureLocalValues[TODOIST_TODO_API_TOKEN_KEY] =
                        await encryptSecureLocalString(legacyTodoistSessionToken);
                    todoistTodoApiToken = legacyTodoistSessionToken;
                    legacySessionKeysToRemove.push(TODOIST_TODO_API_TOKEN_KEY);
                } else {
                    todoistTodoApiToken = await readSecureLocalString(
                        localItems,
                        TODOIST_TODO_API_TOKEN_KEY,
                        migratedSecureLocalValues
                    );
                }

                if (Object.keys(migratedSessionValues).length > 0) {
                    await storageSessionSetAsync(migratedSessionValues);
                }
                const googleTodoClientSecret = await readSecureLocalString(
                    localItems,
                    GOOGLE_TODO_CLIENT_SECRET_KEY,
                    migratedSecureLocalValues
                );
                const ticktickTodoClientSecret = await readSecureLocalString(
                    localItems,
                    TICKTICK_TODO_CLIENT_SECRET_KEY,
                    migratedSecureLocalValues
                );
                if (Object.keys(migratedSecureLocalValues).length > 0) {
                    await storageLocalSetAsync(migratedSecureLocalValues);
                }
                if (Object.keys(migratedLocalClearValues).length > 0) {
                    await storageLocalSetAsync(migratedLocalClearValues);
                }
                if (legacySessionKeysToRemove.length > 0) {
                    await storageSessionRemoveAsync(legacySessionKeysToRemove);
                }

                const items = {
                    ...localItems,
                    ...sessionItems,
                    ...migratedSessionValues,
                    username: autoLoginUsername,
                    password: '',
                    [TODOIST_TODO_API_TOKEN_KEY]: todoistTodoApiToken,
                    [GOOGLE_TODO_CLIENT_SECRET_KEY]: googleTodoClientSecret,
                    [TICKTICK_TODO_CLIENT_SECRET_KEY]: ticktickTodoClientSecret
                };

                const autoLoginEnabled = items.autoLoginEnabled === true;
                document.getElementById('autoLoginEnabled').checked = autoLoginEnabled;
                const debugModeEnabled = !!items.debugModeEnabled;
                document.getElementById('debugModeEnabled').checked = debugModeEnabled;
                updateDebugOnlySettingsVisibility(debugModeEnabled);
                document.getElementById('username').value = items.username;
                resetAutoLoginPasswordState({ stored: autoLoginPasswordStoredNext });
            const legacyShort = items.useShortCourseNameEnabled;
            const hasNewToggles =
                items.useCustomCourseNameEnabled !== null && items.useCustomCourseNameEnabled !== undefined ||
                items.useLlmCourseNameEnabled !== null && items.useLlmCourseNameEnabled !== undefined ||
                items.useRuleCourseNameEnabled !== null && items.useRuleCourseNameEnabled !== undefined;
            const disableAll = !hasNewToggles && legacyShort === false;
            const customEnabled = disableAll
                ? false
                : (items.useCustomCourseNameEnabled === null || items.useCustomCourseNameEnabled === undefined)
                    ? true
                    : items.useCustomCourseNameEnabled;
            let llmEnabled = disableAll
                ? false
                : (items.useLlmCourseNameEnabled === null || items.useLlmCourseNameEnabled === undefined)
                    ? !!items.openaiCourseNameEnabled
                    : items.useLlmCourseNameEnabled;
            let ruleEnabled = disableAll
                ? false
                : (items.useRuleCourseNameEnabled === null || items.useRuleCourseNameEnabled === undefined)
                    ? true
                    : items.useRuleCourseNameEnabled;
            const normalizedShorteningFlags = normalizeShorteningModeFlags(llmEnabled, ruleEnabled);
            llmEnabled = normalizedShorteningFlags.llmEnabled;
            ruleEnabled = normalizedShorteningFlags.ruleEnabled;
            document.getElementById('useCustomCourseNameEnabled').checked = customEnabled;
            document.getElementById('useLlmCourseNameEnabled').checked = llmEnabled;
            document.getElementById('useRuleCourseNameEnabled').checked = ruleEnabled;
            if (normalizedShorteningFlags.changed) {
                chrome.storage.local.set({
                    useLlmCourseNameEnabled: llmEnabled,
                    useRuleCourseNameEnabled: ruleEnabled,
                    openaiCourseNameEnabled: llmEnabled
                });
            }
            updateLlmProviderSettingsAvailability(llmEnabled);
            document.getElementById('autoRunCourseNameConversionOnDashboardLoad').checked = !!items.autoRunCourseNameConversionOnDashboardLoad;
            updateCourseNameConversionActionState(!!items.autoRunCourseNameConversionOnDashboardLoad);
            document.getElementById('courseNameProvider').value = items.courseNameProvider || 'openai';
            const showLlmCourseStatusEnabled = debugModeEnabled && !!items.showLlmCourseStatusEnabled;
            document.getElementById('showLlmCourseStatusEnabled').checked = showLlmCourseStatusEnabled;
            if (!debugModeEnabled && items.showLlmCourseStatusEnabled) {
                chrome.storage.local.set({ showLlmCourseStatusEnabled: false });
            }
            document.getElementById('openaiApiKey').value = items.openaiApiKey;
            const openaiModelSelect = document.getElementById('openaiCourseNameModel');
            const openaiDesiredModel = items.openaiCourseNameModel;
            ensureSelectOption(openaiModelSelect, openaiDesiredModel);
            openaiModelSelect.value = openaiDesiredModel;
            document.getElementById('groqApiKey').value = items.groqApiKey;
            const groqModelSelect = document.getElementById('groqCourseNameModel');
            const groqDesiredModel = items.groqCourseNameModel;
            ensureSelectOption(groqModelSelect, groqDesiredModel);
            groqModelSelect.value = groqDesiredModel;
            updateCourseNameProviderUI(items.courseNameProvider || 'openai');
            document.getElementById('shikenSelectVisibleCount').value = items.shikenSelectVisibleCount;
            const storedTodoApiProvider = items[TODO_API_PROVIDER_KEY] || 'none';
            const storedTodoApiEnabledRaw = items[TODO_API_ENABLED_KEY];
            const supportedTodoApiProvider = normalizeTodoApiProviderForSurface(storedTodoApiProvider);
            const todoApiEnabled = (storedTodoApiEnabledRaw === null || storedTodoApiEnabledRaw === undefined
                ? supportedTodoApiProvider !== 'none'
                : !!storedTodoApiEnabledRaw)
                && supportedTodoApiProvider !== 'none';
            const effectiveTodoApiProvider = todoApiEnabled ? supportedTodoApiProvider : 'none';
            document.getElementById('todoApiEnabled').checked = todoApiEnabled;
            document.getElementById('todoApiProvider').value = effectiveTodoApiProvider;
            const msClientId = (items[MS_TODO_CLIENT_ID_KEY] || '').trim();
            const msTenantId = (items[MS_TODO_TENANT_ID_KEY] || MS_TODO_DEFAULT_TENANT).trim() || MS_TODO_DEFAULT_TENANT;
            const msClientInput = document.getElementById('msTodoClientId');
            if (msClientInput) msClientInput.value = msClientId;
            setMicrosoftTenantValue(msTenantId);
            updateMicrosoftTenantUi();
            const msListName = sanitizeTodoName(items[MS_TODO_LIST_NAME_KEY], TODO_DEFAULT_LIST_NAME);
            const msListInput = document.getElementById('msTodoListName');
            if (msListInput) msListInput.value = msListName;
            const googleClientId = (items[GOOGLE_TODO_CLIENT_ID_KEY] || '').trim();
            const googleClientInput = document.getElementById('googleTodoClientId');
            if (googleClientInput) googleClientInput.value = googleClientId;
            const googleSecretInput = document.getElementById('googleTodoClientSecret');
            if (googleSecretInput) googleSecretInput.value = items[GOOGLE_TODO_CLIENT_SECRET_KEY] || '';
            const googleRedirectUriInput = document.getElementById('googleTodoRedirectUri');
            if (googleRedirectUriInput) {
                googleRedirectUriInput.value = chrome?.identity?.getRedirectURL
                    ? chrome.identity.getRedirectURL('google')
                    : `https://${chrome.runtime.id}.chromiumapp.org/google`;
            }
            const googleListName = sanitizeTodoName(items[GOOGLE_TODO_LIST_NAME_KEY], TODO_DEFAULT_LIST_NAME);
            const googleListInput = document.getElementById('googleTodoListName');
            if (googleListInput) googleListInput.value = googleListName;
            const todoistTokenInput = document.getElementById('todoistTodoApiToken');
            if (todoistTokenInput) todoistTokenInput.value = todoistTodoApiToken;
            const todoistProjectName = sanitizeTodoName(items[TODOIST_TODO_PROJECT_NAME_KEY], TODO_DEFAULT_LIST_NAME);
            const todoistProjectInput = document.getElementById('todoistTodoProjectName');
            if (todoistProjectInput) todoistProjectInput.value = todoistProjectName;
            const ticktickClientIdInput = document.getElementById('ticktickTodoClientId');
            if (ticktickClientIdInput) ticktickClientIdInput.value = items[TICKTICK_TODO_CLIENT_ID_KEY] || '';
            const ticktickClientSecretInput = document.getElementById('ticktickTodoClientSecret');
            if (ticktickClientSecretInput) ticktickClientSecretInput.value = items[TICKTICK_TODO_CLIENT_SECRET_KEY] || '';
            const ticktickRedirectUriInput = document.getElementById('ticktickTodoRedirectUri');
            if (ticktickRedirectUriInput) {
                ticktickRedirectUriInput.value = chrome?.identity?.getRedirectURL
                    ? chrome.identity.getRedirectURL('ticktick')
                    : `https://${chrome.runtime.id}.chromiumapp.org/ticktick`;
            }
            const ticktickProjectName = sanitizeTodoName(items[TICKTICK_TODO_PROJECT_NAME_KEY], TODO_DEFAULT_LIST_NAME);
            const ticktickProjectInput = document.getElementById('ticktickTodoProjectName');
            if (ticktickProjectInput) ticktickProjectInput.value = ticktickProjectName;
            document.getElementById('todoApiTaskTitleFormat').value = items[TODO_API_TASK_TITLE_FORMAT_KEY] || 'task_only';
            const msReminderDaysBeforeInput = document.getElementById('msTodoDefaultReminderDaysBefore');
            if (msReminderDaysBeforeInput) {
                msReminderDaysBeforeInput.value = String(
                    normalizeMsTodoReminderDaysBefore(
                        items[MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE_KEY],
                        MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE
                    )
                );
            }
            const msReminderTimeModeInput = document.getElementById('msTodoDefaultReminderTimeMode');
            if (msReminderTimeModeInput) {
                msReminderTimeModeInput.value = normalizeMsTodoReminderTimeMode(
                    items[MS_TODO_DEFAULT_REMINDER_TIME_MODE_KEY],
                    MS_TODO_REMINDER_TIME_MODE_AT_9AM
                );
            }
            updateTodoApiProviderUI(effectiveTodoApiProvider);
            updateTodoApiSettingsAvailability(todoApiEnabled);
            updateTodoApiTaskTitleFormatUI(items[TODO_API_TASK_TITLE_FORMAT_KEY] || 'task_only');
            renderTodoApiUltraShortCourseMap(items[TODO_API_ULTRA_SHORT_MAP_KEY] || {});
            const todoMigrationPatch = {};
            if (
                storedTodoApiEnabledRaw === null
                || storedTodoApiEnabledRaw === undefined
                || !items[MS_TODO_TENANT_ID_KEY]
            ) {
                todoMigrationPatch[TODO_API_ENABLED_KEY] = todoApiEnabled;
                todoMigrationPatch[MS_TODO_TENANT_ID_KEY] = msTenantId;
            }
            if (!items[MS_TODO_CLIENT_ID_KEY] && msClientId) {
                todoMigrationPatch[MS_TODO_CLIENT_ID_KEY] = msClientId;
            }
            const rawMsListName = typeof items[MS_TODO_LIST_NAME_KEY] === 'string'
                ? items[MS_TODO_LIST_NAME_KEY].trim()
                : '';
            const rawGoogleListName = typeof items[GOOGLE_TODO_LIST_NAME_KEY] === 'string'
                ? items[GOOGLE_TODO_LIST_NAME_KEY].trim()
                : '';
            const rawGoogleClientId = typeof items[GOOGLE_TODO_CLIENT_ID_KEY] === 'string'
                ? items[GOOGLE_TODO_CLIENT_ID_KEY].trim()
                : '';
            const rawTodoistProjectName = typeof items[TODOIST_TODO_PROJECT_NAME_KEY] === 'string'
                ? items[TODOIST_TODO_PROJECT_NAME_KEY].trim()
                : '';
            const rawTicktickProjectName = typeof items[TICKTICK_TODO_PROJECT_NAME_KEY] === 'string'
                ? items[TICKTICK_TODO_PROJECT_NAME_KEY].trim()
                : '';
            if (rawMsListName !== msListName) {
                todoMigrationPatch[MS_TODO_LIST_NAME_KEY] = msListName;
            }
            if (rawGoogleListName !== googleListName) {
                todoMigrationPatch[GOOGLE_TODO_LIST_NAME_KEY] = googleListName;
            }
            if (rawTodoistProjectName !== todoistProjectName) {
                todoMigrationPatch[TODOIST_TODO_PROJECT_NAME_KEY] = todoistProjectName;
            }
            if (rawTicktickProjectName !== ticktickProjectName) {
                todoMigrationPatch[TICKTICK_TODO_PROJECT_NAME_KEY] = ticktickProjectName;
            }
            if (Object.keys(todoMigrationPatch).length > 0) {
                chrome.storage.local.set(todoMigrationPatch);
            }

            if (items.tocInitialState === 'closed') {
                document.getElementById('tocInitialClosed').checked = true;
            } else {
                document.getElementById('tocInitialOpen').checked = true;
            }
            document.getElementById('tocInitialCloseDelay').value = items.tocInitialCloseDelay;
            document.getElementById('tocAutoHide').checked = items.tocAutoHide;
            document.getElementById('tocAutoHideDelay').value = items.tocAutoHideDelay;
            document.getElementById('tocShowSectionTitles').checked = items.tocShowSectionTitles;
            const materialDownloadFilenameSeparator = normalizeMaterialDownloadFilenameSeparator(
                items[MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_KEY]
            );
            const materialDownloadFilenameSeparatorRadio = document.querySelector(
                `input[name="materialDownloadFilenameSeparator"][value="${materialDownloadFilenameSeparator}"]`
            );
            if (materialDownloadFilenameSeparatorRadio) {
                materialDownloadFilenameSeparatorRadio.checked = true;
            }
            document.getElementById('tocHoverReveal').checked = items.tocHoverReveal;
            setDashboardVisibleRangeInputs({
                startPeriod: items[DASHBOARD_VISIBLE_START_PERIOD_KEY],
                endPeriod: items[DASHBOARD_VISIBLE_END_PERIOD_KEY],
                startWeekday: items[DASHBOARD_VISIBLE_START_WEEKDAY_KEY],
                endWeekday: items[DASHBOARD_VISIBLE_END_WEEKDAY_KEY]
            });
            renderDashboardVisibleRangeGrid();

            const visualEnabled = items[EXTENSION_VISUAL_ENABLED_KEY] !== false;
            const normalizedStoredDefaultViewVersion = items.defaultViewVersion === 'original' ? 'original' : '2';
            const normalizedDefaultViewVersion = visualEnabled
                ? normalizedStoredDefaultViewVersion
                : 'original';
            const normalizedCurrentView = normalizedDefaultViewVersion === 'original' ? 'plain' : 'dashboard';
            const defaultViewRadioId = normalizedDefaultViewVersion === 'original'
                ? 'defaultViewOriginal'
                : 'defaultView2';
            const defaultViewRadio = document.getElementById(defaultViewRadioId);
            if (defaultViewRadio) {
                defaultViewRadio.checked = true;
            }

            const expectedVisualEnabled = normalizedDefaultViewVersion !== 'original';
            if (
                items.defaultViewVersion !== normalizedDefaultViewVersion ||
                items.currentView !== normalizedCurrentView ||
                items[EXTENSION_VISUAL_ENABLED_KEY] !== expectedVisualEnabled
            ) {
                chrome.storage.local.set({
                    defaultViewVersion: normalizedDefaultViewVersion,
                    currentView: normalizedCurrentView,
                    [EXTENSION_VISUAL_ENABLED_KEY]: expectedVisualEnabled
                });
            }

            const normalizedViewToggleShortcut = normalizeShortcut(items.viewToggleShortcut);
            let resolvedViewToggleShortcut = normalizedViewToggleShortcut === null
                ? DEFAULT_VIEW_TOGGLE_SHORTCUT
                : normalizedViewToggleShortcut;
            if (
                items.viewToggleShortcutMigratedToCtrlShiftM === true &&
                resolvedViewToggleShortcut === LEGACY_DEFAULT_VIEW_TOGGLE_SHORTCUT
            ) {
                resolvedViewToggleShortcut = DEFAULT_VIEW_TOGGLE_SHORTCUT;
                chrome.storage.local.set({
                    viewToggleShortcut: DEFAULT_VIEW_TOGGLE_SHORTCUT,
                    viewToggleShortcutMigratedToCtrlShiftM: false,
                });
            }
            setShortcutInputDisplayValue(resolvedViewToggleShortcut);
            const extensionUpdateCheckToggle = document.getElementById('extensionUpdateCheckEnabled');
            if (extensionUpdateCheckToggle) {
                extensionUpdateCheckToggle.checked = items[EXTENSION_UPDATE_CHECK_ENABLED_KEY] !== false;
            }
            const dashboardDangerTodoOutlineToggle = document.getElementById('dashboardDangerTodoOutlineEnabled');
            if (dashboardDangerTodoOutlineToggle) {
                dashboardDangerTodoOutlineToggle.checked = items[DASHBOARD_DANGER_TODO_OUTLINE_ENABLED_KEY] !== false;
            }
            const courseQuickNavRadio = document.getElementById(
                items[COURSE_QUICK_NAV_COLLAPSED_KEY] === true
                    ? 'courseQuickNavDefaultCollapsed'
                    : 'courseQuickNavDefaultExpanded'
            );
            if (courseQuickNavRadio) {
                courseQuickNavRadio.checked = true;
            }
            refreshExtensionUpdateStatus();
            lastSavedViewToggleShortcut = resolvedViewToggleShortcut;
            toggleCredentialsArea(autoLoginEnabled);
            const todoProvider = document.getElementById('todoApiEnabled').checked
                ? (document.getElementById('todoApiProvider').value || 'none')
                : 'none';
            if (todoProvider === 'microsoft') {
                refreshMicrosoftTodoAuthStatus();
            } else if (todoProvider === 'google') {
                refreshGoogleTodoAuthStatus();
            } else if (todoProvider === 'todoist') {
                refreshTodoistTodoAuthStatus();
            } else if (todoProvider === 'ticktick') {
                refreshTickTickTodoAuthStatus();
            }
            } catch (error) {
                console.error('[WebClass UX] Failed to restore options', error);
            }
        }
    );

    updateOpenAiCacheStatus();
};

const toggleCredentialsArea = (enabled) => {
    const area = document.getElementById('credentialsArea');
    area.style.display = enabled ? 'block' : 'none';
};

const updateDebugOnlySettingsVisibility = (enabled) => {
    const showDebugOnly = !!enabled;
    document.querySelectorAll('.debug-only-setting').forEach((group) => {
        group.hidden = !showDebugOnly;
        group.querySelectorAll('input, select, button, textarea').forEach((control) => {
            control.disabled = !showDebugOnly;
        });
    });
};

const updateCourseNameConversionActionState = (autoRunEnabled) => {
    const autoRunToggle = document.getElementById('autoRunCourseNameConversionOnDashboardLoad');
    const triggerButton = document.getElementById('runCourseNameConversionNow');
    if (!triggerButton) return;

    const shouldDisable = typeof autoRunEnabled === 'boolean'
        ? autoRunEnabled
        : !!autoRunToggle?.checked;
    triggerButton.disabled = shouldDisable;
    if (shouldDisable) {
        triggerButton.title = '自動実行がONのため手動実行は無効です。';
        return;
    }
    triggerButton.removeAttribute('title');
};

const updateLlmProviderSettingsAvailability = (llmEnabled) => {
    const settingsGroup = document.getElementById('llmProviderSettingsGroup');
    const enabled = !!llmEnabled;
    const openSettingsButton = document.getElementById('openLlmProviderSettings');
    if (openSettingsButton) {
        openSettingsButton.disabled = !enabled;
    }

    if (!settingsGroup) return;

    settingsGroup.classList.toggle('llm-provider-settings--disabled', !enabled);
    settingsGroup.querySelectorAll('input, select, button, textarea').forEach((control) => {
        control.disabled = !enabled;
    });
};

const updateCourseNameProviderUI = (provider) => {
    const openaiFields = document.getElementById('openaiCourseNameFields');
    const groqFields = document.getElementById('groqCourseNameFields');
    if (!openaiFields || !groqFields) return;
    const useGroq = provider === 'groq';
    openaiFields.style.display = useGroq ? 'none' : 'block';
    groqFields.style.display = useGroq ? 'block' : 'none';
};

const normalizeTodoApiProviderForSurface = (provider) => (
    provider === TODO_API_VISIBLE_PROVIDER ? TODO_API_VISIBLE_PROVIDER : 'none'
);

const updateTodoApiProviderUI = (provider) => {
    const msFields = document.getElementById('microsoftTodoFields');
    const googleFields = document.getElementById('googleTodoFields');
    const todoistFields = document.getElementById('todoistTodoFields');
    const ticktickFields = document.getElementById('ticktickTodoFields');
    const commonFields = document.getElementById('todoApiCommonFields');
    const googleDueWarningText = document.getElementById('googleTodoDueWarningText');
    const visibleProvider = normalizeTodoApiProviderForSurface(provider);
    if (msFields) msFields.style.display = 'none';
    if (googleFields) googleFields.style.display = 'none';
    if (todoistFields) todoistFields.style.display = 'none';
    if (ticktickFields) ticktickFields.style.display = visibleProvider === 'ticktick' ? 'block' : 'none';
    if (commonFields) commonFields.style.display = visibleProvider === 'none' ? 'none' : 'block';
    if (googleDueWarningText) {
        googleDueWarningText.style.display = 'none';
    }
};

const getMicrosoftTenantElements = () => ({
    presetEl: document.getElementById('msTodoTenantPreset'),
    customFieldEl: document.getElementById('msTodoTenantCustomField'),
    customEl: document.getElementById('msTodoTenantCustom')
});

const getMicrosoftTenantValue = () => {
    const { presetEl, customEl } = getMicrosoftTenantElements();
    if (!presetEl) return MS_TODO_DEFAULT_TENANT;
    const presetValue = (presetEl.value || '').trim() || MS_TODO_DEFAULT_TENANT;
    if (presetValue === 'custom') {
        return (customEl?.value || '').trim() || MS_TODO_DEFAULT_TENANT;
    }
    return presetValue;
};

const setMicrosoftTenantValue = (tenantValue) => {
    const { presetEl, customEl } = getMicrosoftTenantElements();
    if (!presetEl) return;
    const normalizedTenant = (tenantValue || '').trim() || MS_TODO_DEFAULT_TENANT;
    if (normalizedTenant === 'common' || normalizedTenant === 'organizations' || normalizedTenant === 'consumers') {
        presetEl.value = normalizedTenant;
        if (customEl) customEl.value = '';
        return;
    }
    presetEl.value = 'custom';
    if (customEl) customEl.value = normalizedTenant;
};

const updateMicrosoftTenantUi = () => {
    const { presetEl, customFieldEl, customEl } = getMicrosoftTenantElements();
    if (!presetEl || !customFieldEl || !customEl) return;
    const useCustomTenant = presetEl.value === 'custom';
    customFieldEl.style.display = useCustomTenant ? 'block' : 'none';
    customEl.disabled = !useCustomTenant;
};

const updateTodoApiSettingsAvailability = (enabled) => {
    const settingsBody = document.getElementById('todoApiSettingsBody');
    if (!settingsBody) return;
    settingsBody.hidden = !enabled;
    settingsBody.querySelectorAll('input, select, button, textarea').forEach((control) => {
        control.disabled = !enabled;
    });
};

const updateTodoApiTaskTitleFormatUI = (format) => {
    const ultraShortConfig = document.getElementById('todoApiUltraShortConfig');
    if (!ultraShortConfig) return;
    ultraShortConfig.style.display = format === 'ultra_short_plus_task' ? 'block' : 'none';
};

const renderTodoApiUltraShortCourseMap = (savedMap = {}) => {
    const container = document.getElementById('todoApiUltraShortCourseMap');
    if (!container) return;
    const safeMap = savedMap && typeof savedMap === 'object' ? savedMap : {};

    chrome.storage.local.get({ assignments: [] }, (items) => {
        container.innerHTML = '';

        const assignments = Array.isArray(items.assignments) ? items.assignments : [];
        const courseMap = new Map();

        assignments.forEach((assignment) => {
            const key = normalizeCourseMapKey(assignment);
            if (!key || courseMap.has(key)) return;
            const fullName = (assignment.courseFullName || assignment.course || '').trim();
            const shortName = (assignment.course || '').trim();
            courseMap.set(key, {
                key,
                fullName: fullName || '(コース名なし)',
                shortName: shortName || '',
                inferred: false
            });
        });

        Object.keys(safeMap).forEach((key) => {
            if (!key || courseMap.has(key)) return;
            const fallbackFullName = key.startsWith('full:') ? key.slice(5) : `(未分類コース: ${key})`;
            courseMap.set(key, {
                key,
                fullName: fallbackFullName || `(未分類コース: ${key})`,
                shortName: '',
                inferred: true
            });
        });

        const rows = Array.from(courseMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName, 'ja'));
        if (rows.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'ultra-short-empty';
            empty.textContent = 'コース情報がありません。Smart ToDo を一度同期すると候補が表示されます。';
            container.appendChild(empty);
            return;
        }

        rows.forEach((row) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'ultra-short-row';

            const label = document.createElement('label');
            label.className = 'ultra-short-label';

            const title = document.createElement('div');
            title.className = 'ultra-short-title';
            title.textContent = row.fullName;
            label.appendChild(title);

            const sub = document.createElement('div');
            sub.className = 'ultra-short-sub';
            const noteParts = [];
            if (row.shortName) noteParts.push(`短縮名: ${row.shortName}`);
            if (row.inferred) noteParts.push('自動推定したコース名');
            if (noteParts.length === 0) noteParts.push(`コースキー: ${row.key}`);
            sub.textContent = noteParts.join(' / ');
            label.appendChild(sub);

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'API連携用の短縮名';
            input.value = typeof safeMap[row.key] === 'string' ? safeMap[row.key] : '';
            input.dataset.courseKey = row.key;
            input.className = 'ultra-short-input';

            wrapper.appendChild(label);
            wrapper.appendChild(input);
            container.appendChild(wrapper);
        });
    });
};

const refreshMicrosoftTodoAuthStatus = () => {
    const statusEl = document.getElementById('msTodoAuthStatus');
    if (!statusEl) return;
    statusEl.style.color = '#666';
    statusEl.textContent = '接続状態を確認中...';

    chrome.runtime.sendMessage({ type: 'MICROSOFT_TODO_GET_STATUS' }, (response) => {
        if (chrome.runtime.lastError) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = `接続状態の取得エラー: ${chrome.runtime.lastError.message}`;
            return;
        }
        if (!response?.success) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = response?.error || '接続状態の取得に失敗しました。';
            return;
        }
        const connected = response.connected === true;
        if (!connected) {
            statusEl.style.color = '#666';
            statusEl.textContent = '未接続';
            return;
        }
        const listName = sanitizeTodoName(response.listName, TODO_DEFAULT_LIST_NAME);
        const listPart = listName ? ` / リスト: ${listName}` : '';
        statusEl.style.color = '#2e7d32';
        statusEl.textContent = `接続済み${listPart}`;
    });
};

const connectMicrosoftTodo = async () => {
    const statusEl = document.getElementById('msTodoAuthStatus');
    const connectBtn = document.getElementById('msTodoConnectBtn');
    const disconnectBtn = document.getElementById('msTodoDisconnectBtn');
    const providerEl = document.getElementById('todoApiProvider');
    const clientIdEl = document.getElementById('msTodoClientId');
    const listNameEl = document.getElementById('msTodoListName');
    if (!statusEl || !providerEl || !listNameEl || !clientIdEl) return;

    const clientId = (clientIdEl.value || '').trim();
    const tenant = getMicrosoftTenantValue();
    const listName = sanitizeTodoName(listNameEl.value, TODO_DEFAULT_LIST_NAME);
    if (!clientId) {
        statusEl.style.color = '#c62828';
        statusEl.textContent = 'Microsoft Client ID を入力してください。';
        return;
    }

    providerEl.value = 'microsoft';
    updateTodoApiProviderUI('microsoft');

    if (connectBtn) connectBtn.disabled = true;
    if (disconnectBtn) disconnectBtn.disabled = true;
    statusEl.style.color = '#666';
    statusEl.textContent = 'Microsoft To Do に接続中...';

    chrome.storage.local.set({
        [TODO_API_PROVIDER_KEY]: 'microsoft',
        [MS_TODO_CLIENT_ID_KEY]: clientId,
        [MS_TODO_TENANT_ID_KEY]: tenant,
        [MS_TODO_LIST_NAME_KEY]: listName
    }, () => {
        chrome.runtime.sendMessage({ type: 'MICROSOFT_TODO_CONNECT' }, (response) => {
            if (connectBtn) connectBtn.disabled = false;
            if (disconnectBtn) disconnectBtn.disabled = false;

            if (chrome.runtime.lastError) {
                statusEl.style.color = '#c62828';
                statusEl.textContent = `接続エラー: ${chrome.runtime.lastError.message}`;
                return;
            }
            if (!response?.success) {
                statusEl.style.color = '#c62828';
                statusEl.textContent = response?.error || '接続に失敗しました。';
                return;
            }
            const listName = sanitizeTodoName(response.listName, TODO_DEFAULT_LIST_NAME);
            const listPart = listName ? ` / リスト: ${listName}` : '';
            statusEl.style.color = '#2e7d32';
            statusEl.textContent = `接続完了${listPart}`;
        });
    });
};

const disconnectMicrosoftTodo = () => {
    const statusEl = document.getElementById('msTodoAuthStatus');
    const connectBtn = document.getElementById('msTodoConnectBtn');
    const disconnectBtn = document.getElementById('msTodoDisconnectBtn');
    const providerEl = document.getElementById('todoApiProvider');
    if (!statusEl) return;

    if (connectBtn) connectBtn.disabled = true;
    if (disconnectBtn) disconnectBtn.disabled = true;
    statusEl.style.color = '#666';
    statusEl.textContent = '接続解除中...';

    chrome.runtime.sendMessage({ type: 'MICROSOFT_TODO_DISCONNECT' }, (response) => {
        if (connectBtn) connectBtn.disabled = false;
        if (disconnectBtn) disconnectBtn.disabled = false;

        if (chrome.runtime.lastError) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = `接続解除エラー: ${chrome.runtime.lastError.message}`;
            return;
        }
        if (!response?.success) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = response?.error || '接続解除に失敗しました。';
            return;
        }
        if (providerEl) {
            providerEl.value = 'none';
            updateTodoApiProviderUI('none');
        }
        statusEl.style.color = '#2e7d32';
        statusEl.textContent = '接続を解除しました。';
    });
};

const refreshGoogleTodoAuthStatus = () => {
    const statusEl = document.getElementById('googleTodoAuthStatus');
    if (!statusEl) return;
    statusEl.style.color = '#666';
    statusEl.textContent = '接続状態を確認中...';

    chrome.runtime.sendMessage({ type: 'GOOGLE_TODO_GET_STATUS' }, (response) => {
        if (chrome.runtime.lastError) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = `接続状態の取得エラー: ${chrome.runtime.lastError.message}`;
            return;
        }
        if (!response?.success) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = response?.error || '接続状態の取得に失敗しました。';
            return;
        }
        const connected = response.connected === true;
        if (!connected) {
            statusEl.style.color = '#666';
            statusEl.textContent = '未接続';
            return;
        }
        const listName = sanitizeTodoName(response.listName, TODO_DEFAULT_LIST_NAME);
        const listPart = listName ? ` / リスト: ${listName}` : '';
        statusEl.style.color = '#2e7d32';
        statusEl.textContent = `接続済み${listPart}`;
    });
};

const connectGoogleTodo = async () => {
    const statusEl = document.getElementById('googleTodoAuthStatus');
    const connectBtn = document.getElementById('googleTodoConnectBtn');
    const disconnectBtn = document.getElementById('googleTodoDisconnectBtn');
    const providerEl = document.getElementById('todoApiProvider');
    const clientIdEl = document.getElementById('googleTodoClientId');
    const listNameEl = document.getElementById('googleTodoListName');
    if (!statusEl || !providerEl || !clientIdEl || !listNameEl) return;

    try {
        const clientId = (clientIdEl.value || '').trim();
        const clientSecretEl = document.getElementById('googleTodoClientSecret');
        const clientSecret = (clientSecretEl?.value || '').trim();
        if (!clientId) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = 'Google Client ID を入力してください。';
            return;
        }
        if (!clientSecret) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = 'Google Client Secret を入力してください。';
            return;
        }
        const encryptedClientSecret = await encryptSecureLocalString(clientSecret);
        const listName = sanitizeTodoName(listNameEl.value, TODO_DEFAULT_LIST_NAME);

        providerEl.value = 'google';
        updateTodoApiProviderUI('google');

        if (connectBtn) connectBtn.disabled = true;
        if (disconnectBtn) disconnectBtn.disabled = true;
        statusEl.style.color = '#666';
        statusEl.textContent = 'Google Tasks に接続中...';

        await storageLocalSetAsync({
            [TODO_API_PROVIDER_KEY]: 'google',
            [GOOGLE_TODO_CLIENT_ID_KEY]: clientId,
            [GOOGLE_TODO_CLIENT_SECRET_KEY]: encryptedClientSecret,
            [GOOGLE_TODO_LIST_NAME_KEY]: listName
        });

        chrome.runtime.sendMessage({ type: 'GOOGLE_TODO_CONNECT' }, (response) => {
            if (connectBtn) connectBtn.disabled = false;
            if (disconnectBtn) disconnectBtn.disabled = false;

            if (chrome.runtime.lastError) {
                statusEl.style.color = '#c62828';
                statusEl.textContent = `接続エラー: ${chrome.runtime.lastError.message}`;
                return;
            }
            if (!response?.success) {
                statusEl.style.color = '#c62828';
                statusEl.textContent = response?.error || '接続に失敗しました。';
                return;
            }
            const listName = sanitizeTodoName(response.listName, TODO_DEFAULT_LIST_NAME);
            const listPart = listName ? ` / リスト: ${listName}` : '';
            statusEl.style.color = '#2e7d32';
            statusEl.textContent = `接続完了${listPart}`;
        });
    } catch (error) {
        if (connectBtn) connectBtn.disabled = false;
        if (disconnectBtn) disconnectBtn.disabled = false;
        statusEl.style.color = '#c62828';
        statusEl.textContent = `接続エラー: ${error instanceof Error ? error.message : String(error)}`;
    }
};

const disconnectGoogleTodo = () => {
    const statusEl = document.getElementById('googleTodoAuthStatus');
    const connectBtn = document.getElementById('googleTodoConnectBtn');
    const disconnectBtn = document.getElementById('googleTodoDisconnectBtn');
    const providerEl = document.getElementById('todoApiProvider');
    if (!statusEl) return;

    if (connectBtn) connectBtn.disabled = true;
    if (disconnectBtn) disconnectBtn.disabled = true;
    statusEl.style.color = '#666';
    statusEl.textContent = '接続解除中...';

    chrome.runtime.sendMessage({ type: 'GOOGLE_TODO_DISCONNECT' }, (response) => {
        if (connectBtn) connectBtn.disabled = false;
        if (disconnectBtn) disconnectBtn.disabled = false;

        if (chrome.runtime.lastError) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = `接続解除エラー: ${chrome.runtime.lastError.message}`;
            return;
        }
        if (!response?.success) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = response?.error || '接続解除に失敗しました。';
            return;
        }
        if (providerEl) {
            providerEl.value = 'none';
            updateTodoApiProviderUI('none');
        }
        statusEl.style.color = '#2e7d32';
        statusEl.textContent = '接続を解除しました。';
    });
};

const refreshTodoistTodoAuthStatus = () => {
    const statusEl = document.getElementById('todoistTodoAuthStatus');
    if (!statusEl) return;
    statusEl.style.color = '#666';
    statusEl.textContent = '接続状態を確認中...';

    chrome.runtime.sendMessage({ type: 'TODOIST_TODO_GET_STATUS' }, (response) => {
        if (chrome.runtime.lastError) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = `接続状態の取得エラー: ${chrome.runtime.lastError.message}`;
            return;
        }
        if (!response?.success) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = response?.error || '接続状態の取得に失敗しました。';
            return;
        }
        const connected = response.connected === true;
        if (!connected) {
            statusEl.style.color = '#666';
            statusEl.textContent = '未接続';
            return;
        }
        const projectName = sanitizeTodoName(response.listName, TODO_DEFAULT_LIST_NAME);
        const listPart = projectName ? ` / プロジェクト: ${projectName}` : '';
        statusEl.style.color = '#2e7d32';
        statusEl.textContent = `接続済み${listPart}`;
    });
};

const connectTodoistTodo = async () => {
    const statusEl = document.getElementById('todoistTodoAuthStatus');
    const connectBtn = document.getElementById('todoistTodoConnectBtn');
    const disconnectBtn = document.getElementById('todoistTodoDisconnectBtn');
    const providerEl = document.getElementById('todoApiProvider');
    const tokenEl = document.getElementById('todoistTodoApiToken');
    const projectNameEl = document.getElementById('todoistTodoProjectName');
    if (!statusEl || !providerEl || !tokenEl || !projectNameEl) return;

    const apiToken = tokenEl.value.trim();
    const projectName = sanitizeTodoName(projectNameEl.value, TODO_DEFAULT_LIST_NAME);
    if (!apiToken) {
        statusEl.style.color = '#c62828';
        statusEl.textContent = 'Todoist Personal Token を入力してください。';
        return;
    }

    providerEl.value = 'todoist';
    updateTodoApiProviderUI('todoist');

    if (connectBtn) connectBtn.disabled = true;
    if (disconnectBtn) disconnectBtn.disabled = true;
    statusEl.style.color = '#666';
    statusEl.textContent = 'Todoist に接続中...';

    try {
        const encryptedApiToken = await encryptSecureLocalString(apiToken);
        await storageLocalSetAsync({
            [TODO_API_PROVIDER_KEY]: 'todoist',
            [TODOIST_TODO_API_TOKEN_KEY]: encryptedApiToken,
            [TODOIST_TODO_PROJECT_NAME_KEY]: projectName
        });
        await storageSessionSetAsync({
            [TODOIST_TODO_API_TOKEN_KEY]: ''
        });
        chrome.runtime.sendMessage({ type: 'TODOIST_TODO_CONNECT' }, (response) => {
            if (connectBtn) connectBtn.disabled = false;
            if (disconnectBtn) disconnectBtn.disabled = false;

            if (chrome.runtime.lastError) {
                statusEl.style.color = '#c62828';
                statusEl.textContent = `接続エラー: ${chrome.runtime.lastError.message}`;
                return;
            }
            if (!response?.success) {
                statusEl.style.color = '#c62828';
                statusEl.textContent = response?.error || '接続に失敗しました。';
                return;
            }
            const projectName = sanitizeTodoName(response.listName, TODO_DEFAULT_LIST_NAME);
            const listPart = projectName ? ` / プロジェクト: ${projectName}` : '';
            statusEl.style.color = '#2e7d32';
            statusEl.textContent = `接続完了${listPart}`;
        });
    } catch (error) {
        if (connectBtn) connectBtn.disabled = false;
        if (disconnectBtn) disconnectBtn.disabled = false;
        statusEl.style.color = '#c62828';
        statusEl.textContent = `謗･邯壹お繝ｩ繝ｼ: ${error instanceof Error ? error.message : String(error)}`;
    }
};

const disconnectTodoistTodo = () => {
    const statusEl = document.getElementById('todoistTodoAuthStatus');
    const connectBtn = document.getElementById('todoistTodoConnectBtn');
    const disconnectBtn = document.getElementById('todoistTodoDisconnectBtn');
    const providerEl = document.getElementById('todoApiProvider');
    if (!statusEl) return;

    if (connectBtn) connectBtn.disabled = true;
    if (disconnectBtn) disconnectBtn.disabled = true;
    statusEl.style.color = '#666';
    statusEl.textContent = '接続解除中...';

    chrome.runtime.sendMessage({ type: 'TODOIST_TODO_DISCONNECT' }, (response) => {
        if (connectBtn) connectBtn.disabled = false;
        if (disconnectBtn) disconnectBtn.disabled = false;

        if (chrome.runtime.lastError) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = `接続解除エラー: ${chrome.runtime.lastError.message}`;
            return;
        }
        if (!response?.success) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = response?.error || '接続解除に失敗しました。';
            return;
        }
        if (providerEl) {
            providerEl.value = 'none';
            updateTodoApiProviderUI('none');
        }
        statusEl.style.color = '#2e7d32';
        statusEl.textContent = '接続を解除しました。';
    });
};

const refreshTickTickTodoAuthStatus = () => {
    const statusEl = document.getElementById('ticktickTodoAuthStatus');
    if (!statusEl) return;
    statusEl.style.color = '#666';
    statusEl.textContent = '接続状態を確認中...';

    chrome.runtime.sendMessage({ type: 'TICKTICK_TODO_GET_STATUS' }, (response) => {
        if (chrome.runtime.lastError) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = `接続状態の取得エラー: ${chrome.runtime.lastError.message}`;
            return;
        }
        if (!response?.success) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = response?.error || '接続状態の取得に失敗しました。';
            return;
        }
        if (response.connected !== true) {
            statusEl.style.color = '#666';
            statusEl.textContent = '未接続';
            return;
        }
        const projectName = sanitizeTodoName(response.listName, TODO_DEFAULT_LIST_NAME);
        const listPart = projectName ? ` / プロジェクト: ${projectName}` : '';
        statusEl.style.color = '#2e7d32';
        statusEl.textContent = `接続済み${listPart}`;
    });
};

const connectTickTickTodo = async () => {
    const statusEl = document.getElementById('ticktickTodoAuthStatus');
    const connectBtn = document.getElementById('ticktickTodoConnectBtn');
    const disconnectBtn = document.getElementById('ticktickTodoDisconnectBtn');
    const providerEl = document.getElementById('todoApiProvider');
    const clientIdEl = document.getElementById('ticktickTodoClientId');
    const clientSecretEl = document.getElementById('ticktickTodoClientSecret');
    const projectNameEl = document.getElementById('ticktickTodoProjectName');
    if (!statusEl || !providerEl || !clientIdEl || !clientSecretEl || !projectNameEl) return;

    try {
        const clientId = (clientIdEl.value || '').trim();
        const clientSecret = (clientSecretEl.value || '').trim();
        const projectName = sanitizeTodoName(projectNameEl.value, TODO_DEFAULT_LIST_NAME);

        if (!clientId) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = 'TickTick Client ID を入力してください。';
            return;
        }
        if (!clientSecret) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = 'TickTick Client Secret を入力してください。';
            return;
        }
        const encryptedClientSecret = await encryptSecureLocalString(clientSecret);

        providerEl.value = 'ticktick';
        updateTodoApiProviderUI('ticktick');

        if (connectBtn) connectBtn.disabled = true;
        if (disconnectBtn) disconnectBtn.disabled = true;
        statusEl.style.color = '#666';
        statusEl.textContent = 'TickTick に接続中...';

        await storageLocalSetAsync({
            [TODO_API_PROVIDER_KEY]: 'ticktick',
            [TICKTICK_TODO_PROJECT_NAME_KEY]: projectName,
            [TICKTICK_TODO_CLIENT_ID_KEY]: clientId,
            [TICKTICK_TODO_CLIENT_SECRET_KEY]: encryptedClientSecret,
        });

        chrome.runtime.sendMessage({ type: 'TICKTICK_TODO_CONNECT' }, (response) => {
            if (connectBtn) connectBtn.disabled = false;
            if (disconnectBtn) disconnectBtn.disabled = false;

            if (chrome.runtime.lastError) {
                statusEl.style.color = '#c62828';
                statusEl.textContent = `接続エラー: ${chrome.runtime.lastError.message}`;
                return;
            }
            if (!response?.success) {
                statusEl.style.color = '#c62828';
                statusEl.textContent = response?.error || '接続に失敗しました。';
                return;
            }
            const projectName = sanitizeTodoName(response.listName, TODO_DEFAULT_LIST_NAME);
            const listPart = projectName ? ` / プロジェクト: ${projectName}` : '';
            statusEl.style.color = '#2e7d32';
            statusEl.textContent = `接続完了${listPart}`;
        });
    } catch (error) {
        if (connectBtn) connectBtn.disabled = false;
        if (disconnectBtn) disconnectBtn.disabled = false;
        statusEl.style.color = '#c62828';
        statusEl.textContent = `接続エラー: ${error instanceof Error ? error.message : String(error)}`;
    }
};

const disconnectTickTickTodo = () => {
    const statusEl = document.getElementById('ticktickTodoAuthStatus');
    const connectBtn = document.getElementById('ticktickTodoConnectBtn');
    const disconnectBtn = document.getElementById('ticktickTodoDisconnectBtn');
    const providerEl = document.getElementById('todoApiProvider');
    if (!statusEl) return;

    if (connectBtn) connectBtn.disabled = true;
    if (disconnectBtn) disconnectBtn.disabled = true;
    statusEl.style.color = '#666';
    statusEl.textContent = '接続解除中...';

    chrome.runtime.sendMessage({ type: 'TICKTICK_TODO_DISCONNECT' }, (response) => {
        if (connectBtn) connectBtn.disabled = false;
        if (disconnectBtn) disconnectBtn.disabled = false;

        if (chrome.runtime.lastError) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = `接続解除エラー: ${chrome.runtime.lastError.message}`;
            return;
        }
        if (!response?.success) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = response?.error || '接続解除に失敗しました。';
            return;
        }
        if (providerEl) {
            providerEl.value = 'none';
            updateTodoApiProviderUI('none');
        }
        statusEl.style.color = '#2e7d32';
        statusEl.textContent = '接続を解除しました。';
    });
};

const updateOpenAiCacheStatus = () => {
    const statusEl = document.getElementById('openaiCacheStatus');
    if (!statusEl) return;
    chrome.storage.local.get({ openaiCourseNameCache: {} }, (items) => {
        const cache = items.openaiCourseNameCache || {};
        const count = Object.keys(cache).length;
        statusEl.textContent = `キャッシュ件数: ${count}`;
    });
};

const clearOpenAiCourseNameCache = () => {
    chrome.storage.local.set({ openaiCourseNameCache: {} }, () => {
        const statusEl = document.getElementById('openaiCacheStatus');
        if (statusEl) {
            statusEl.textContent = 'キャッシュを削除しました。';
            statusEl.style.color = '#2e7d32';
            setTimeout(() => {
                statusEl.style.color = '#666';
                updateOpenAiCacheStatus();
            }, 2000);
        }
    });
};

const runCourseNameConversionFromSettings = () => {
    const triggerButton = document.getElementById('runCourseNameConversionNow');
    const statusEl = document.getElementById('courseNameConversionStatus');
    if (!triggerButton || !statusEl) return;
    const autoRunEnabled = !!document.getElementById('autoRunCourseNameConversionOnDashboardLoad')?.checked;
    if (autoRunEnabled) {
        updateCourseNameConversionActionState(true);
        statusEl.style.color = '#666';
        statusEl.textContent = '自動実行がONのため手動実行はできません。';
        return;
    }

    const originalLabel = triggerButton.textContent;
    triggerButton.disabled = true;
    triggerButton.textContent = '実行中...';
    statusEl.style.color = '#666';
    statusEl.textContent = 'WebClassホームタブで短縮名更新を実行しています...';

    chrome.runtime.sendMessage({ type: 'RUN_DASHBOARD_COURSE_NAME_CONVERSION_FROM_OPTIONS' }, (response) => {
        triggerButton.textContent = originalLabel;
        updateCourseNameConversionActionState();

        if (chrome.runtime.lastError) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = `実行エラー: ${chrome.runtime.lastError.message}`;
            return;
        }

        if (response?.success) {
            statusEl.style.color = '#2e7d32';
            statusEl.textContent = '短縮名更新を実行しました。';
            return;
        }

        statusEl.style.color = '#c62828';
        statusEl.textContent = response?.error || '短縮名更新の実行に失敗しました。';
    });
};

const initSettingsNavigation = () => {
    const root = document.getElementById('settingsRoot');
    const detailSections = Array.from(document.querySelectorAll('.settings-detail'));
    if (!root || detailSections.length === 0) return;

    const hasDetailSection = (sectionName) => {
        if (!sectionName) return false;
        return detailSections.some((section) => section.dataset.section === sectionName);
    };

    const showRoot = () => {
        root.hidden = false;
        detailSections.forEach((section) => {
            section.hidden = true;
        });
    };

    const showDetail = (sectionName) => {
        if (!hasDetailSection(sectionName)) return;
        root.hidden = true;
        detailSections.forEach((section) => {
            section.hidden = section.dataset.section !== sectionName;
        });
        window.scrollTo(0, 0);
    };

    document.querySelectorAll('[data-open-section]').forEach((button) => {
        button.addEventListener('click', () => {
            const sectionName = button.dataset.openSection;
            if (!sectionName) return;
            showDetail(sectionName);
        });
    });

    document.querySelectorAll('[data-back]').forEach((button) => {
        button.addEventListener('click', () => {
            const explicitBackSection = button.dataset.backSection;
            if (hasDetailSection(explicitBackSection)) {
                showDetail(explicitBackSection);
                return;
            }
            const parentSection = button.closest('.settings-detail')?.dataset.parentSection;
            if (hasDetailSection(parentSection)) {
                showDetail(parentSection);
                return;
            }
            showRoot();
        });
    });

    showRoot();
};

const isAutoSaveTarget = (target) => {
    if (!(target instanceof HTMLElement)) return false;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
        return false;
    }
    if (target instanceof HTMLInputElement) {
        const ignoredTypes = new Set(['button', 'submit', 'reset', 'image', 'file']);
        if (ignoredTypes.has((target.type || '').toLowerCase())) {
            return false;
        }
    }
    return true;
};

const scheduleAutoSave = () => {
    clearAutoSaveTimer();
    autoSaveTimerId = setTimeout(() => {
        autoSaveTimerId = null;
        saveOptions({ source: 'auto', showSuccess: false });
    }, AUTO_SAVE_DEBOUNCE_MS);
};

const initAutoSave = () => {
    document.addEventListener('input', (event) => {
        const target = event.target;
        if (!isAutoSaveTarget(target)) return;
        if (target.id === 'viewToggleShortcut' || target.id === 'password') return;
        scheduleAutoSave();
    });

    document.addEventListener('change', (event) => {
        const target = event.target;
        if (!isAutoSaveTarget(target)) return;
        if (target.id === 'viewToggleShortcut') return;
        const reloadWebClassTabsAfterSave = shouldReloadWebClassTabsAfterControlChange(target);
        saveOptions({ source: 'auto', showSuccess: false, reloadWebClassTabsAfterSave });
    });

    const shortcutInput = document.getElementById('viewToggleShortcut');
    if (shortcutInput) {
        shortcutInput.placeholder = shortcutPlaceholderForPlatform();
        const saveShortcutWithValidation = () => {
            saveOptions({ source: 'shortcut', showSuccess: false });
        };
        shortcutInput.addEventListener('change', saveShortcutWithValidation);
        shortcutInput.addEventListener('blur', saveShortcutWithValidation);
    }

    const flushPendingAutoSave = () => {
        if (autoSaveTimerId === null && !autoLoginPasswordInputDirty && !autoLoginPasswordPendingDeletion) {
            return;
        }
        saveOptions({ source: 'auto', showSuccess: false });
    };
    window.addEventListener('beforeunload', flushPendingAutoSave);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            flushPendingAutoSave();
        }
    });
};

document.addEventListener('DOMContentLoaded', async () => {
    await initRuntimePlatform();
    initSettingsNavigation();
    initDashboardVisibleRangeControls();
    restoreOptions();
    initAutoSave();

    const ticktickCopyBtn = document.getElementById('ticktickTodoCopyRedirectUriBtn');
    if (ticktickCopyBtn) {
        ticktickCopyBtn.addEventListener('click', () => {
            const uriInput = document.getElementById('ticktickTodoRedirectUri');
            if (!uriInput?.value) return;
            navigator.clipboard.writeText(uriInput.value).then(() => {
                const originalHTML = ticktickCopyBtn.innerHTML;
                ticktickCopyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                ticktickCopyBtn.classList.add('copied');
                ticktickCopyBtn.disabled = true;
                setTimeout(() => {
                    ticktickCopyBtn.innerHTML = originalHTML;
                    ticktickCopyBtn.classList.remove('copied');
                    ticktickCopyBtn.disabled = false;
                }, 2000);
            }).catch(() => {
                ticktickCopyBtn.classList.remove('copied');
                ticktickCopyBtn.disabled = false;
                const originalTitle = ticktickCopyBtn.title;
                ticktickCopyBtn.title = 'コピーに失敗しました';
                setTimeout(() => {
                    ticktickCopyBtn.title = originalTitle;
                }, 2000);
            });
        });
    }

    document.getElementById('goToWebClassHome').addEventListener('click', () => {
        chrome.tabs.query({ url: WEBCLASS_TAB_URL_PATTERNS }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.update(tabs[0].id, { active: true });
                if (tabs[0].windowId != null) {
                    chrome.windows.update(tabs[0].windowId, { focused: true });
                }
            } else {
                chrome.tabs.create({ url: WEBCLASS_HOME_URL });
            }
        });
    });
});
document.getElementById('autoLoginEnabled').addEventListener('change', (e) => {
    toggleCredentialsArea(e.target.checked);
});
document.getElementById('password').addEventListener('input', () => {
    autoLoginPasswordInputDirty = true;
    autoLoginPasswordPendingDeletion = false;
    updateAutoLoginPasswordUi();
});
document.getElementById('clearStoredPasswordButton').addEventListener('click', async () => {
    if (!autoLoginPasswordStored) return;
    const passwordInput = document.getElementById('password');
    autoLoginPasswordPendingDeletion = true;
    autoLoginPasswordInputDirty = false;
    if (passwordInput) {
        passwordInput.value = '';
    }
    updateAutoLoginPasswordUi();
    const saved = await saveOptions({ source: 'manual' });
    if (!saved) {
        autoLoginPasswordPendingDeletion = false;
        updateAutoLoginPasswordUi();
    }
});
document.getElementById('debugModeEnabled').addEventListener('change', (e) => {
    updateDebugOnlySettingsVisibility(!!e.target.checked);
});
document.getElementById('autoRunCourseNameConversionOnDashboardLoad').addEventListener('change', (e) => {
    updateCourseNameConversionActionState(!!e.target.checked);
});
document.getElementById('extensionUpdateCheckEnabled').addEventListener('change', (e) => {
    if (!e.target.checked) {
        renderExtensionUpdateStatus({ enabled: false });
        return;
    }
    refreshExtensionUpdateStatus();
});
document.getElementById('useLlmCourseNameEnabled').addEventListener('change', () => {
    enforceLlmRuleMutualExclusion('useLlmCourseNameEnabled');
});
document.getElementById('useRuleCourseNameEnabled').addEventListener('change', () => {
    enforceLlmRuleMutualExclusion('useRuleCourseNameEnabled');
});
document.getElementById('clearOpenaiCourseNameCache').addEventListener('click', clearOpenAiCourseNameCache);
document.getElementById('runCourseNameConversionNow').addEventListener('click', runCourseNameConversionFromSettings);
document.getElementById('checkExtensionUpdateNow').addEventListener('click', runExtensionUpdateCheck);
document.getElementById('showExtensionUpdateNotificationPreview').addEventListener('click', showExtensionUpdateNotificationPreview);
document.getElementById('courseNameProvider').addEventListener('change', (e) => {
    updateCourseNameProviderUI(e.target.value);
});
document.getElementById('todoApiEnabled').addEventListener('change', (e) => {
    const enabled = !!e.target.checked;
    const providerEl = document.getElementById('todoApiProvider');
    if (!providerEl) {
        updateTodoApiSettingsAvailability(enabled);
        return;
    }
    if (!enabled) {
        providerEl.value = 'none';
    } else if (normalizeTodoApiProviderForSurface(providerEl.value) === 'none') {
        providerEl.value = TODO_API_VISIBLE_PROVIDER;
    }
    updateTodoApiProviderUI(enabled ? normalizeTodoApiProviderForSurface(providerEl.value) : 'none');
    updateTodoApiSettingsAvailability(enabled);
});
document.getElementById('todoApiProvider').addEventListener('change', (e) => {
    const provider = normalizeTodoApiProviderForSurface(e.target.value);
    e.target.value = provider;
    updateTodoApiProviderUI(provider);

    const msStatusEl = document.getElementById('msTodoAuthStatus');
    const googleStatusEl = document.getElementById('googleTodoAuthStatus');
    const todoistStatusEl = document.getElementById('todoistTodoAuthStatus');
    const ticktickStatusEl = document.getElementById('ticktickTodoAuthStatus');
    if (provider !== 'microsoft' && msStatusEl) {
        msStatusEl.style.color = '#666';
        msStatusEl.textContent = '未接続';
    }
    if (provider !== 'google' && googleStatusEl) {
        googleStatusEl.style.color = '#666';
        googleStatusEl.textContent = '未接続';
    }
    if (provider !== 'todoist' && todoistStatusEl) {
        todoistStatusEl.style.color = '#666';
        todoistStatusEl.textContent = '未接続';
    }
    if (provider !== 'ticktick' && ticktickStatusEl) {
        ticktickStatusEl.style.color = '#666';
        ticktickStatusEl.textContent = '未接続';
    }

    if (provider === 'microsoft') {
        refreshMicrosoftTodoAuthStatus();
        return;
    }
    if (provider === 'google') {
        refreshGoogleTodoAuthStatus();
        return;
    }
    if (provider === 'todoist') {
        refreshTodoistTodoAuthStatus();
        return;
    }
    if (provider === 'ticktick') {
        refreshTickTickTodoAuthStatus();
    }
});
document.getElementById('todoApiTaskTitleFormat').addEventListener('change', (e) => {
    updateTodoApiTaskTitleFormatUI(e.target.value);
});
document.getElementById('msTodoTenantPreset')?.addEventListener('change', () => {
    updateMicrosoftTenantUi();
});
/*
document.getElementById('msTodoConnectBtn').addEventListener('click', connectMicrosoftTodo);
document.getElementById('msTodoDisconnectBtn').addEventListener('click', disconnectMicrosoftTodo);
document.getElementById('googleTodoConnectBtn')?.addEventListener('click', connectGoogleTodo);
document.getElementById('googleTodoDisconnectBtn')?.addEventListener('click', disconnectGoogleTodo);
document.getElementById('todoistTodoConnectBtn').addEventListener('click', connectTodoistTodo);
document.getElementById('todoistTodoDisconnectBtn').addEventListener('click', disconnectTodoistTodo);
*/
document.getElementById('ticktickTodoConnectBtn').addEventListener('click', connectTickTickTodo);
document.getElementById('ticktickTodoDisconnectBtn').addEventListener('click', disconnectTickTickTodo);
