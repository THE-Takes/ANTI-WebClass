// options/core.js
// Options constants, DOM references, backup, icon, security, and range helpers.

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

const TODO_API_ENABLED_KEY = 'todoApiEnabled';
const TODO_API_TASK_TITLE_FORMAT_KEY = 'todoApiTaskTitleFormat';
const TODO_API_ULTRA_SHORT_MAP_KEY = 'todoApiUltraShortCourseMap';
const TICKTICK_TODO_CLIENT_ID_KEY = 'ticktickTodoClientId';
const TICKTICK_TODO_CLIENT_SECRET_KEY = 'ticktickTodoClientSecret';
const TICKTICK_TODO_PROJECT_NAME_KEY = 'ticktickTodoProjectName';
const TODO_DEFAULT_LIST_NAME = 'SmartToDo Sync';
const TODO_DEFAULT_PROJECT_NAME = 'WebClass';
const TODO_MOJIBAKE_PATTERN = /[繝鬯郢驛隴隱蜈蜷霑ｽ]/;
const EXTENSION_VISUAL_ENABLED_KEY = 'extensionVisualEnabled';
const EXTENSION_UPDATE_CHECK_ENABLED_KEY = 'extensionUpdateCheckEnabled';
const EXTENSION_RELEASES_PAGE_URL = 'https://github.com/THE-Takes/ANTI-WebClass/releases';
const EXTENSION_UPDATE_STATUS_KEYS = new Set([
    EXTENSION_UPDATE_CHECK_ENABLED_KEY,
    'extensionUpdateLastCheckedAt',
    'extensionUpdateLastError',
    'extensionUpdateLatestVersion',
    'extensionUpdateReleaseUrl',
    'extensionUpdateAvailable'
]);
const COURSE_QUICK_NAV_COLLAPSED_KEY = 'courseQuickNavCollapsed';
const DASHBOARD_DANGER_TODO_OUTLINE_ENABLED_KEY = 'dashboardDangerTodoOutlineEnabled';
const DASHBOARD_VISIBLE_START_PERIOD_KEY = 'dashboardVisibleStartPeriod';
const DASHBOARD_VISIBLE_END_PERIOD_KEY = 'dashboardVisibleEndPeriod';
const DASHBOARD_VISIBLE_START_WEEKDAY_KEY = 'dashboardVisibleStartWeekday';
const DASHBOARD_VISIBLE_END_WEEKDAY_KEY = 'dashboardVisibleEndWeekday';
const CUSTOM_USER_ICON_KEY = 'customUserIconDataUrl';
const CUSTOM_USER_ICON_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const CUSTOM_USER_ICON_SIZE = 512;
const SETTINGS_BACKUP_FORMAT = 'anti-webclass-settings';
const SETTINGS_BACKUP_VERSION = 1;
const SETTINGS_BACKUP_MAX_FILE_BYTES = 25 * 1024 * 1024;
const SETTINGS_BACKUP_TODO_DATA_KEYS = new Set([
    'assignments',
    'webclass_todo_list',
    'webclass_todo_trash',
    'todoApiLastManualReloadAt',
    'todoApiLastMorningSyncDate',
    'todoApiLastAutoSyncAt'
]);
const SETTINGS_BACKUP_PRIVATE_KEYS = new Set([
    'username',
    'password',
    TICKTICK_TODO_CLIENT_SECRET_KEY,
    'ticktickTodoAuth',
    'ticktickTodoAuthSession',
    'ticktickTodoAuthLocal',
    'ticktickTodoRefreshToken',
    'ticktickTodoGatewayApiKey',
    'ticktickTodoGatewayApiKeySession',
    'ticktickTodoGatewaySigningKeySession',
    'ticktickTodoRefreshVaultId',
    'ticktickTodoVaultSessionToken'
]);
const SETTINGS_BACKUP_RUNTIME_KEYS = new Set([
    'webclass_messages',
    'webclass_course_short_name_cache',
    'ticktickTodoProjectId',
    'appleRemindersConnected',
    'appleRemindersListId',
    'appleRemindersItemIds',
    'appleRemindersPendingMutations',
    'appleRemindersLastSyncAt',
    'appleRemindersLastError',
    'extensionUpdateLastCheckedAt',
    'extensionUpdateLastError',
    'extensionUpdateLatestVersion',
    'extensionUpdateLatestReleaseName',
    'extensionUpdateReleaseUrl',
    'extensionUpdateReleasePublishedAt',
    'extensionUpdateAvailable',
    'extensionUpdateLastNotifiedVersion'
]);
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
    'useCustomCourseNameEnabled',
    'useRuleCourseNameEnabled',
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
    showStatusMessage('ショートカットは Windows: Alt+Shift+M / Mac: Option+Shift+M の形式で入力してください。', 'var(--options-danger)', 2500);
};

const formatUpdateTimestamp = (rawValue) => {
    if (!rawValue) return '';
    const timestamp = Date.parse(rawValue);
    if (!Number.isFinite(timestamp)) return '';
    return new Date(timestamp).toLocaleString('ja-JP');
};

const getTrustedExtensionReleaseUrl = (rawUrl) => {
    try {
        const url = new URL(rawUrl);
        const isExpectedReleaseUrl = url.protocol === 'https:'
            && url.hostname === 'github.com'
            && url.pathname.startsWith('/THE-Takes/ANTI-WebClass/releases');
        return isExpectedReleaseUrl ? url.href : EXTENSION_RELEASES_PAGE_URL;
    } catch {
        return EXTENSION_RELEASES_PAGE_URL;
    }
};

const renderExtensionUpdateNotice = (status) => {
    const noticeEl = document.getElementById('extensionUpdateNotice');
    const versionEl = document.getElementById('extensionUpdateNoticeVersion');
    const linkEl = document.getElementById('extensionUpdateReleaseLink');
    if (!noticeEl || !versionEl || !linkEl) return;

    const shouldShow = status?.enabled !== false
        && status?.updateAvailable === true
        && !!status?.latestVersion;
    noticeEl.hidden = !shouldShow;
    if (!shouldShow) return;

    versionEl.textContent = `v${status.latestVersion}（現在 v${status.currentVersion || '不明'}）`;
    linkEl.href = getTrustedExtensionReleaseUrl(status.releaseUrl);
    linkEl.setAttribute('aria-label', `新しいバージョン v${status.latestVersion} をGitHubで確認`);
};

const renderExtensionUpdateStatus = (status) => {
    const statusEl = document.getElementById('extensionUpdateStatus');
    const buttonEl = document.getElementById('checkExtensionUpdateNow');
    renderExtensionUpdateNotice(status);
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

const storageLocalGetAsync = (keys = null) => new Promise((resolve, reject) => {
    try {
        chrome.storage.local.get(keys, (items) => {
            const lastError = chrome.runtime?.lastError;
            if (lastError) {
                reject(new Error(lastError.message));
                return;
            }
            resolve(items || {});
        });
    } catch (error) {
        reject(error);
    }
});

const isPlainBackupObject = (value) => (
    !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);

const isPrivateBackupKey = (key) => (
    SETTINGS_BACKUP_PRIVATE_KEYS.has(key)
    || /(?:password|secret|token|auth|vault|api[_-]?key)/i.test(key)
);

const sanitizeBackupEntries = (value, allowedKeys = null) => {
    if (!isPlainBackupObject(value)) return {};
    const safeEntries = {};
    Object.entries(value).forEach(([key, entryValue]) => {
        if (key === '__proto__' || key === 'prototype' || key === 'constructor') return;
        if (allowedKeys && !allowedKeys.has(key)) return;
        safeEntries[key] = entryValue;
    });
    return safeEntries;
};

const buildSettingsBackup = (storedItems, includeTodoData) => {
    const settings = {};
    const todoData = {};
    Object.entries(storedItems || {}).forEach(([key, value]) => {
        if (isPrivateBackupKey(key) || SETTINGS_BACKUP_RUNTIME_KEYS.has(key)) return;
        if (SETTINGS_BACKUP_TODO_DATA_KEYS.has(key)) {
            if (includeTodoData) todoData[key] = value;
            return;
        }
        settings[key] = value;
    });

    return {
        format: SETTINGS_BACKUP_FORMAT,
        version: SETTINGS_BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        extensionVersion: chrome.runtime?.getManifest?.().version || '',
        includesTodoData: includeTodoData,
        settings,
        ...(includeTodoData ? { todoData } : {})
    };
};

const parseSettingsBackup = (text) => {
    let backup;
    try {
        backup = JSON.parse(text);
    } catch {
        throw new Error('JSONファイルの形式が正しくありません。');
    }
    if (!isPlainBackupObject(backup) || backup.format !== SETTINGS_BACKUP_FORMAT) {
        throw new Error('ANTI-WebClassの設定ファイルではありません。');
    }
    if (backup.version !== SETTINGS_BACKUP_VERSION) {
        throw new Error(`対応していないバックアップ形式です（version: ${String(backup.version)}）。`);
    }
    if (!isPlainBackupObject(backup.settings)) {
        throw new Error('設定データが見つかりません。');
    }

    const settings = sanitizeBackupEntries(backup.settings);
    Object.keys(settings).forEach((key) => {
        if (isPrivateBackupKey(key)) delete settings[key];
    });
    SETTINGS_BACKUP_RUNTIME_KEYS.forEach((key) => delete settings[key]);
    SETTINGS_BACKUP_TODO_DATA_KEYS.forEach((key) => delete settings[key]);
    const todoData = sanitizeBackupEntries(backup.todoData, SETTINGS_BACKUP_TODO_DATA_KEYS);
    return { settings, todoData };
};

const setSettingsBackupStatus = (message, isError = false) => {
    const status = document.getElementById('settingsBackupStatus');
    if (!status) return;
    status.style.color = isError ? '#c62828' : '#2e7d32';
    status.textContent = message;
};

const exportSettingsBackup = async () => {
    const exportButton = document.getElementById('exportSettingsButton');
    const includeTodoData = !!document.getElementById('backupIncludeTodoData')?.checked;
    if (exportButton) exportButton.disabled = true;
    try {
        const storedItems = await storageLocalGetAsync(null);
        const backup = buildSettingsBackup(storedItems, includeTodoData);
        const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        link.href = url;
        link.download = `anti-webclass-settings-${date}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setSettingsBackupStatus(includeTodoData
            ? '設定とToDoデータをエクスポートしました。'
            : '設定をエクスポートしました。');
    } catch (error) {
        setSettingsBackupStatus(error instanceof Error ? error.message : 'エクスポートに失敗しました。', true);
    } finally {
        if (exportButton) exportButton.disabled = false;
    }
};

const importSettingsBackup = async (file) => {
    if (!file) return;
    if (file.size > SETTINGS_BACKUP_MAX_FILE_BYTES) {
        throw new Error('設定ファイルは25MB以下にしてください。');
    }
    const parsedBackup = parseSettingsBackup(await file.text());
    const includeTodoData = !!document.getElementById('backupIncludeTodoData')?.checked;
    const todoKeys = Object.keys(parsedBackup.todoData);
    const willImportTodoData = includeTodoData && todoKeys.length > 0;
    const confirmed = window.confirm(willImportTodoData
        ? '現在の設定とToDoデータを、選択したファイルの内容で上書きします。よろしいですか？'
        : '現在の設定を、選択したファイルの内容で上書きします。よろしいですか？');
    if (!confirmed) {
        setSettingsBackupStatus('インポートをキャンセルしました。');
        return;
    }

    await storageLocalSetAsync({
        ...parsedBackup.settings,
        ...(willImportTodoData ? parsedBackup.todoData : {})
    });
    restoreOptions();
    reloadOpenWebClassTabs();
    setSettingsBackupStatus(willImportTodoData
        ? '設定とToDoデータをインポートしました。'
        : '設定をインポートしました。');
};

const initSettingsBackupControls = () => {
    const exportButton = document.getElementById('exportSettingsButton');
    const chooseImportButton = document.getElementById('chooseSettingsImportButton');
    const importFileInput = document.getElementById('settingsImportFile');
    if (!exportButton || !chooseImportButton || !importFileInput) return;

    exportButton.addEventListener('click', exportSettingsBackup);
    chooseImportButton.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', async () => {
        const file = importFileInput.files?.[0];
        if (!file) return;
        chooseImportButton.disabled = true;
        try {
            await importSettingsBackup(file);
        } catch (error) {
            setSettingsBackupStatus(error instanceof Error ? error.message : 'インポートに失敗しました。', true);
        } finally {
            importFileInput.value = '';
            chooseImportButton.disabled = false;
        }
    });
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('画像を読み込めませんでした。'));
    reader.readAsDataURL(file);
});

const loadImageFromUrl = (url) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('この画像形式は読み込めません。'));
    image.src = url;
});

const createCustomUserIconDataUrl = async (file) => {
    if (!file?.type?.startsWith('image/')) {
        throw new Error('画像ファイルを選択してください。');
    }
    if (file.size > CUSTOM_USER_ICON_MAX_SOURCE_BYTES) {
        throw new Error('10MB以下の画像を選択してください。');
    }

    const sourceUrl = await readFileAsDataUrl(file);
    const image = await loadImageFromUrl(sourceUrl);
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    if (!sourceWidth || !sourceHeight) {
        throw new Error('画像のサイズを取得できませんでした。');
    }

    const cropSize = Math.min(sourceWidth, sourceHeight);
    const sourceX = Math.floor((sourceWidth - cropSize) / 2);
    const sourceY = Math.floor((sourceHeight - cropSize) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = CUSTOM_USER_ICON_SIZE;
    canvas.height = CUSTOM_USER_ICON_SIZE;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('画像を加工できませんでした。');
    }
    context.drawImage(
        image,
        sourceX,
        sourceY,
        cropSize,
        cropSize,
        0,
        0,
        CUSTOM_USER_ICON_SIZE,
        CUSTOM_USER_ICON_SIZE
    );
    return canvas.toDataURL('image/webp', 0.9);
};

const renderCustomUserIconSetting = (dataUrl = '') => {
    const preview = document.getElementById('customUserIconPreview');
    const resetButton = document.getElementById('resetCustomUserIcon');
    const hasCustomIcon = typeof dataUrl === 'string' && dataUrl.startsWith('data:image/');
    if (preview) {
        preview.hidden = !hasCustomIcon;
        if (hasCustomIcon) {
            preview.src = dataUrl;
        } else {
            preview.removeAttribute('src');
        }
    }
    if (resetButton) {
        resetButton.disabled = !hasCustomIcon;
    }
};

const initCustomUserIconControls = () => {
    const chooseButton = document.getElementById('chooseCustomUserIcon');
    const fileInput = document.getElementById('customUserIconFile');
    const resetButton = document.getElementById('resetCustomUserIcon');
    const status = document.getElementById('customUserIconStatus');
    if (!chooseButton || !fileInput || !resetButton) return;

    chooseButton.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        try {
            if (status) status.textContent = '画像を処理しています...';
            const dataUrl = await createCustomUserIconDataUrl(file);
            await storageLocalSetAsync({ [CUSTOM_USER_ICON_KEY]: dataUrl });
            renderCustomUserIconSetting(dataUrl);
            if (status) status.textContent = '右上のアイコンを変更しました。';
            reloadOpenWebClassTabs();
        } catch (error) {
            if (status) {
                status.textContent = error instanceof Error ? error.message : '画像の保存に失敗しました。';
            }
        } finally {
            fileInput.value = '';
        }
    });

    resetButton.addEventListener('click', async () => {
        try {
            await storageLocalSetAsync({ [CUSTOM_USER_ICON_KEY]: '' });
            renderCustomUserIconSetting('');
            if (status) status.textContent = 'WebClass標準のアイコンに戻しました。';
            reloadOpenWebClassTabs();
        } catch {
            if (status) status.textContent = 'アイコン設定の削除に失敗しました。';
        }
    });
};

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
