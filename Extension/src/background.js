// background.js
// Handles downloads and background tasks for WebClass UX Improver

try {
    importScripts(chrome.runtime.getURL('src/todo-sync-identity.js'));
} catch (error) {
    console.error('[WebClass UX] Failed to load todo-sync-identity.js', error);
}

try {
    importScripts(chrome.runtime.getURL('src/secure-storage.js'));
} catch (error) {
    console.error('[WebClass UX] Failed to load secure-storage.js', error);
}

const todoSyncIdentityApi = globalThis.WebClassTodoSyncIdentity || null;
if (!todoSyncIdentityApi) {
    throw new Error('[WebClass UX] todo-sync-identity module is unavailable');
}

const secureStorageApi = globalThis.WebClassSecureStorage || null;
if (!secureStorageApi) {
    throw new Error('[WebClass UX] secure-storage module is unavailable');
}

const NO_DEADLINE_TEXT = '期限なし';
const TODO_SYNC_NOTE_ID_PREFIX = todoSyncIdentityApi.NOTE_ID_PREFIX;
const TODO_SYNC_NOTE_URL_PREFIX = todoSyncIdentityApi.NOTE_URL_PREFIX;
const TODO_SYNC_NOTE_DEADLINE_PREFIX = 'WC_DEADLINE_TEXT:';
const getAssignmentSyncIdentity = todoSyncIdentityApi.getAssignmentSyncIdentity;
const parseSyncMetadataFromTask = todoSyncIdentityApi.parseSyncMetadataFromTask;

const uxDebugModeState = { enabled: false };

(() => {
    try {
        chrome.storage.local.get({ debugModeEnabled: false }, (items) => {
            uxDebugModeState.enabled = !!items.debugModeEnabled;
        });
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local' || !changes.debugModeEnabled) return;
            uxDebugModeState.enabled = !!changes.debugModeEnabled.newValue;
        });
    } catch {
        uxDebugModeState.enabled = false;
    }
})();

function uxDebugLog(...args) {
    if (!uxDebugModeState.enabled) return;
    console.log(...args);
}

function uxDebugWarn(...args) {
    if (!uxDebugModeState.enabled) return;
    console.warn(...args);
}

uxDebugLog('WebClass UX Improver: Background script loaded');

const EXTENSION_UPDATE_CHECK_ENABLED_KEY = 'extensionUpdateCheckEnabled';
const EXTENSION_UPDATE_LAST_CHECKED_AT_KEY = 'extensionUpdateLastCheckedAt';
const EXTENSION_UPDATE_LAST_ERROR_KEY = 'extensionUpdateLastError';
const EXTENSION_UPDATE_LATEST_VERSION_KEY = 'extensionUpdateLatestVersion';
const EXTENSION_UPDATE_LATEST_RELEASE_NAME_KEY = 'extensionUpdateLatestReleaseName';
const EXTENSION_UPDATE_RELEASE_URL_KEY = 'extensionUpdateReleaseUrl';
const EXTENSION_UPDATE_RELEASE_PUBLISHED_AT_KEY = 'extensionUpdateReleasePublishedAt';
const EXTENSION_UPDATE_AVAILABLE_KEY = 'extensionUpdateAvailable';
const EXTENSION_UPDATE_LAST_NOTIFIED_VERSION_KEY = 'extensionUpdateLastNotifiedVersion';
const EXTENSION_UPDATE_ALARM_NAME = 'extensionReleaseUpdateCheck';
const EXTENSION_UPDATE_ALARM_PERIOD_MINUTES = 360;
const EXTENSION_UPDATE_MIN_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const EXTENSION_UPDATE_NOTIFICATION_ID = 'webclass-extension-update';
const EXTENSION_RELEASES_API_URL = 'https://api.github.com/repos/THE-Takes/ANTI-WebClass/releases/latest';
const EXTENSION_UPDATE_ICON_PATH = 'src/update-notice.svg';

// ============================================================
// Storage Utilities
// ============================================================

function storageGet(defaults) {
    return chrome.storage.local.get(defaults);
}

function storageSet(values) {
    return chrome.storage.local.set(values);
}

function storageRemove(keys) {
    return chrome.storage.local.remove(keys);
}

function storageSessionGet(defaults) {
    if (!chrome?.storage?.session?.get) {
        return Promise.resolve({ ...defaults });
    }
    try {
        return chrome.storage.session.get(defaults).catch(() => ({ ...defaults }));
    } catch {
        return Promise.resolve({ ...defaults });
    }
}

function storageSessionSet(values) {
    if (!chrome?.storage?.session?.set) {
        return Promise.resolve();
    }
    try {
        return chrome.storage.session.set(values).catch(() => undefined);
    } catch {
        return Promise.resolve();
    }
}

function storageSessionRemove(keys) {
    if (!chrome?.storage?.session?.remove) {
        return Promise.resolve();
    }
    try {
        return chrome.storage.session.remove(keys).catch(() => undefined);
    } catch {
        return Promise.resolve();
    }
}

const AUTO_LOGIN_SESSION_DEFAULTS = {
    username: '',
    password: ''
};
const AUTO_LOGIN_SECURE_LOCAL_KEYS = ['username', 'password'];

async function getStoredAutoLoginSettings() {
    const [localSettings, sessionSecrets] = await Promise.all([
        loadSecureLocalStrings(
            {
                autoLoginEnabled: false,
                username: '',
                password: ''
            },
            AUTO_LOGIN_SECURE_LOCAL_KEYS
        ),
        storageSessionGet(AUTO_LOGIN_SESSION_DEFAULTS)
    ]);

    const localUsername = typeof localSettings.username === 'string' ? localSettings.username.trim() : '';
    const localPassword = typeof localSettings.password === 'string' ? localSettings.password.trim() : '';
    const sessionUsername = typeof sessionSecrets.username === 'string' ? sessionSecrets.username.trim() : '';
    const sessionPassword = typeof sessionSecrets.password === 'string' ? sessionSecrets.password.trim() : '';

    const nextSettings = {
        autoLoginEnabled: localSettings.autoLoginEnabled === true,
        username: localUsername,
        password: localPassword
    };

    const migratedSecureValues = {};
    const legacySessionKeysToRemove = [];

    if (sessionUsername) {
        migratedSecureValues.username = await encryptSecureLocalString(sessionUsername);
        nextSettings.username = sessionUsername;
        legacySessionKeysToRemove.push('username');
    }
    if (sessionPassword) {
        migratedSecureValues.password = await encryptSecureLocalString(sessionPassword);
        nextSettings.password = sessionPassword;
        legacySessionKeysToRemove.push('password');
    }

    if (Object.keys(migratedSecureValues).length > 0) {
        await storageSet(migratedSecureValues);
    }
    if (legacySessionKeysToRemove.length > 0) {
        await storageSessionRemove(legacySessionKeysToRemove);
    }

    return nextSettings;
}

function handleGetAutoLoginSettings(sendResponse) {
    getStoredAutoLoginSettings()
        .then((settings) => {
            sendResponse({
                success: true,
                settings
            });
        })
        .catch((error) => {
            uxDebugWarn('[WebClass UX] Failed to resolve auto-login settings', error);
            sendResponse({
                success: false,
                error: error?.message || 'Failed to resolve auto-login settings.'
            });
        });
}

function isEncryptedSecureStorageValue(value) {
    return !!secureStorageApi?.isEncryptedPayload?.(value);
}

async function encryptSecureLocalString(value) {
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
}

async function loadSecureLocalStrings(defaults, secureKeys = []) {
    const localData = await storageGet(defaults);
    const normalized = { ...localData };
    const migratedValues = {};

    for (const key of secureKeys) {
        const rawValue = localData[key];
        if (isEncryptedSecureStorageValue(rawValue)) {
            try {
                normalized[key] = await secureStorageApi.decryptString(rawValue);
            } catch (error) {
                uxDebugWarn('[WebClass UX] Failed to decrypt secure storage value', key, error);
                normalized[key] = typeof defaults[key] === 'string' ? defaults[key] : '';
            }
            continue;
        }

        const plainValue = typeof rawValue === 'string' ? rawValue.trim() : '';
        normalized[key] = plainValue;
        if (plainValue) {
            try {
                migratedValues[key] = await encryptSecureLocalString(plainValue);
            } catch (error) {
                uxDebugWarn('[WebClass UX] Failed to migrate secure storage value', key, error);
            }
        }
    }

    if (Object.keys(migratedValues).length > 0) {
        try {
            await storageSet(migratedValues);
        } catch (error) {
            uxDebugWarn('[WebClass UX] Failed to persist migrated secure storage values', error);
        }
    }

    return normalized;
}

function normalizeReleaseVersion(rawVersion) {
    const trimmed = typeof rawVersion === 'string' ? rawVersion.trim() : '';
    return trimmed.replace(/^[vV]/, '');
}

function compareVersions(left, right) {
    const leftParts = normalizeReleaseVersion(left).split('.');
    const rightParts = normalizeReleaseVersion(right).split('.');
    const maxLength = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < maxLength; index += 1) {
        const leftPart = leftParts[index] ?? '0';
        const rightPart = rightParts[index] ?? '0';
        const leftNumber = /^\d+$/.test(leftPart) ? parseInt(leftPart, 10) : 0;
        const rightNumber = /^\d+$/.test(rightPart) ? parseInt(rightPart, 10) : 0;
        if (leftNumber !== rightNumber) {
            return leftNumber > rightNumber ? 1 : -1;
        }
        if (!/^\d+$/.test(leftPart) || !/^\d+$/.test(rightPart)) {
            const lexicalCompare = leftPart.localeCompare(rightPart);
            if (lexicalCompare !== 0) {
                return lexicalCompare > 0 ? 1 : -1;
            }
        }
    }

    return 0;
}

function getExtensionUpdateStorageDefaults() {
    return {
        [EXTENSION_UPDATE_CHECK_ENABLED_KEY]: true,
        [EXTENSION_UPDATE_LAST_CHECKED_AT_KEY]: '',
        [EXTENSION_UPDATE_LAST_ERROR_KEY]: '',
        [EXTENSION_UPDATE_LATEST_VERSION_KEY]: '',
        [EXTENSION_UPDATE_LATEST_RELEASE_NAME_KEY]: '',
        [EXTENSION_UPDATE_RELEASE_URL_KEY]: '',
        [EXTENSION_UPDATE_RELEASE_PUBLISHED_AT_KEY]: '',
        [EXTENSION_UPDATE_AVAILABLE_KEY]: false,
        [EXTENSION_UPDATE_LAST_NOTIFIED_VERSION_KEY]: ''
    };
}

function buildExtensionUpdateStatus(items = {}) {
    const manifestVersion = chrome.runtime.getManifest().version;
    return {
        enabled: items[EXTENSION_UPDATE_CHECK_ENABLED_KEY] !== false,
        currentVersion: manifestVersion,
        latestVersion: items[EXTENSION_UPDATE_LATEST_VERSION_KEY] || '',
        latestReleaseName: items[EXTENSION_UPDATE_LATEST_RELEASE_NAME_KEY] || '',
        releaseUrl: items[EXTENSION_UPDATE_RELEASE_URL_KEY] || '',
        publishedAt: items[EXTENSION_UPDATE_RELEASE_PUBLISHED_AT_KEY] || '',
        lastCheckedAt: items[EXTENSION_UPDATE_LAST_CHECKED_AT_KEY] || '',
        error: items[EXTENSION_UPDATE_LAST_ERROR_KEY] || '',
        updateAvailable: items[EXTENSION_UPDATE_AVAILABLE_KEY] === true
    };
}

async function readExtensionUpdateStatus() {
    const items = await storageGet(getExtensionUpdateStorageDefaults());
    return buildExtensionUpdateStatus(items);
}

function setExtensionUpdateBadge(updateAvailable) {
    if (!chrome?.action?.setBadgeText || !chrome?.action?.setBadgeBackgroundColor) return;
    chrome.action.setBadgeText({ text: updateAvailable ? 'NEW' : '' });
    if (updateAvailable) {
        chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
    }
}

function clearExtensionUpdateNotification() {
    if (!chrome?.notifications?.clear) return;
    chrome.notifications.clear(EXTENSION_UPDATE_NOTIFICATION_ID, () => {
        void chrome.runtime?.lastError;
    });
}

function showExtensionUpdateNotification(status) {
    if (!chrome?.notifications?.create || !status?.latestVersion) return;
    chrome.notifications.create(EXTENSION_UPDATE_NOTIFICATION_ID, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL(EXTENSION_UPDATE_ICON_PATH),
        title: 'ANTI-WebClass update available',
        message: `v${status.latestVersion} is available. Current version is v${status.currentVersion}.`,
        priority: 2
    }, () => {
        if (chrome.runtime?.lastError) {
            uxDebugWarn('[WebClass UX] Failed to show extension update notification', chrome.runtime.lastError);
        }
    });
}

async function showExtensionUpdateNotificationPreview() {
    const status = await readExtensionUpdateStatus();
    const latestVersion = status.latestVersion || status.currentVersion || 'preview';
    if (!chrome?.notifications?.create) return;
    chrome.notifications.create(EXTENSION_UPDATE_NOTIFICATION_ID, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL(EXTENSION_UPDATE_ICON_PATH),
        title: 'ANTI-WebClass update available',
        message: `Debug preview: v${latestVersion} update notification.`,
        priority: 2
    }, () => {
        if (chrome.runtime?.lastError) {
            uxDebugWarn('[WebClass UX] Failed to show extension update preview notification', chrome.runtime.lastError);
        }
    });
}

async function fetchLatestExtensionRelease() {
    const response = await fetch(EXTENSION_RELEASES_API_URL, {
        headers: {
            'Accept': 'application/vnd.github+json'
        },
        cache: 'no-store'
    });

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('No published GitHub release was found yet.');
        }
        const errorText = await response.text();
        throw new Error(`GitHub Releases API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const latestVersion = normalizeReleaseVersion(data?.tag_name || data?.name || '');
    if (!latestVersion) {
        throw new Error('Latest release version could not be determined.');
    }

    return {
        latestVersion,
        latestReleaseName: typeof data?.name === 'string' ? data.name.trim() : '',
        releaseUrl: typeof data?.html_url === 'string' ? data.html_url.trim() : '',
        publishedAt: typeof data?.published_at === 'string' ? data.published_at : ''
    };
}

async function checkForExtensionUpdate({ force = false } = {}) {
    const items = await storageGet(getExtensionUpdateStorageDefaults());
    const enabled = items[EXTENSION_UPDATE_CHECK_ENABLED_KEY] !== false;
    if (!enabled) {
        setExtensionUpdateBadge(false);
        clearExtensionUpdateNotification();
        const disabledStatus = buildExtensionUpdateStatus(items);
        disabledStatus.updateAvailable = false;
        return disabledStatus;
    }

    const lastCheckedAt = Date.parse(items[EXTENSION_UPDATE_LAST_CHECKED_AT_KEY] || '');
    if (!force && Number.isFinite(lastCheckedAt) && (Date.now() - lastCheckedAt) < EXTENSION_UPDATE_MIN_CHECK_INTERVAL_MS) {
        const cachedStatus = buildExtensionUpdateStatus(items);
        setExtensionUpdateBadge(cachedStatus.updateAvailable);
        return cachedStatus;
    }

    try {
        const latestRelease = await fetchLatestExtensionRelease();
        const currentVersion = chrome.runtime.getManifest().version;
        const updateAvailable = compareVersions(latestRelease.latestVersion, currentVersion) > 0;

        const nextItems = {
            [EXTENSION_UPDATE_LAST_CHECKED_AT_KEY]: new Date().toISOString(),
            [EXTENSION_UPDATE_LAST_ERROR_KEY]: '',
            [EXTENSION_UPDATE_LATEST_VERSION_KEY]: latestRelease.latestVersion,
            [EXTENSION_UPDATE_LATEST_RELEASE_NAME_KEY]: latestRelease.latestReleaseName,
            [EXTENSION_UPDATE_RELEASE_URL_KEY]: latestRelease.releaseUrl,
            [EXTENSION_UPDATE_RELEASE_PUBLISHED_AT_KEY]: latestRelease.publishedAt,
            [EXTENSION_UPDATE_AVAILABLE_KEY]: updateAvailable
        };

        if (updateAvailable && items[EXTENSION_UPDATE_LAST_NOTIFIED_VERSION_KEY] !== latestRelease.latestVersion) {
            nextItems[EXTENSION_UPDATE_LAST_NOTIFIED_VERSION_KEY] = latestRelease.latestVersion;
        }

        await storageSet(nextItems);

        const status = buildExtensionUpdateStatus({
            ...items,
            ...nextItems
        });

        setExtensionUpdateBadge(status.updateAvailable);
        if (status.updateAvailable) {
            if (items[EXTENSION_UPDATE_LAST_NOTIFIED_VERSION_KEY] !== latestRelease.latestVersion) {
                showExtensionUpdateNotification(status);
            }
        } else {
            clearExtensionUpdateNotification();
        }

        return status;
    } catch (error) {
        const errorMessage = error?.message || 'Failed to check extension updates.';
        await storageSet({
            [EXTENSION_UPDATE_LAST_CHECKED_AT_KEY]: new Date().toISOString(),
            [EXTENSION_UPDATE_LAST_ERROR_KEY]: errorMessage
        });
        const errorStatus = buildExtensionUpdateStatus({
            ...items,
            [EXTENSION_UPDATE_LAST_CHECKED_AT_KEY]: new Date().toISOString(),
            [EXTENSION_UPDATE_LAST_ERROR_KEY]: errorMessage
        });
        setExtensionUpdateBadge(errorStatus.updateAvailable);
        return errorStatus;
    }
}

function ensureExtensionUpdateAlarmRegistered() {
    if (!chrome?.alarms?.create) return;
    chrome.alarms.create(EXTENSION_UPDATE_ALARM_NAME, {
        periodInMinutes: EXTENSION_UPDATE_ALARM_PERIOD_MINUTES
    });
}

// ============================================================
// OpenAI Course Name Shortening (Switch View 2)
// ============================================================
const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_DEFAULT_MODEL = 'llama-3.1-70b';
const OPENAI_COURSE_CACHE_KEY = 'openaiCourseNameCache';
const openaiCourseNameInFlight = new Map();

const TODO_API_PROVIDER_KEY = 'todoApiProvider';
const TODO_API_TASK_TITLE_FORMAT_KEY = 'todoApiTaskTitleFormat';
const TODO_API_ULTRA_SHORT_MAP_KEY = 'todoApiUltraShortCourseMap';
const MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE_KEY = 'msTodoDefaultReminderDaysBefore';
const MS_TODO_DEFAULT_REMINDER_TIME_MODE_KEY = 'msTodoDefaultReminderTimeMode';
const MS_TODO_CLIENT_ID_KEY = 'msTodoClientId';
const MS_TODO_TENANT_ID_KEY = 'msTodoTenantId';
const MS_TODO_LIST_NAME_KEY = 'msTodoListName';
const MS_TODO_AUTH_KEY = 'msTodoAuth'; // legacy local key (migration only)
const MS_TODO_AUTH_SESSION_KEY = 'msTodoAuthSession';
const MS_TODO_REFRESH_TOKEN_KEY = 'msTodoRefreshToken';
const MS_TODO_LIST_ID_KEY = 'msTodoListId';
const MS_TODO_LINKS_KEY = 'msTodoTaskLinks';
const MS_TODO_LAST_MANUAL_RELOAD_KEY = 'msTodoLastManualReloadAt';
const MS_TODO_LAST_MORNING_SYNC_DATE_KEY = 'msTodoLastMorningSyncDate';
const GOOGLE_TODO_CLIENT_ID_KEY = 'googleTodoClientId';
const GOOGLE_TODO_CLIENT_SECRET_KEY = 'googleTodoClientSecret';
const GOOGLE_TODO_LIST_NAME_KEY = 'googleTodoListName';
const GOOGLE_TODO_AUTH_KEY = 'googleTodoAuth'; // legacy local key (migration only)
const GOOGLE_TODO_AUTH_SESSION_KEY = 'googleTodoAuthSession';
const GOOGLE_TODO_REFRESH_TOKEN_KEY = 'googleTodoRefreshToken';
const GOOGLE_TODO_LIST_ID_KEY = 'googleTodoListId';
const TODOIST_TODO_API_TOKEN_KEY = 'todoistTodoApiToken';
const TODOIST_TODO_PROJECT_NAME_KEY = 'todoistTodoProjectName';
const TODOIST_TODO_PROJECT_ID_KEY = 'todoistTodoProjectId';
// legacy keys (kept for cleanup/migration)
const TICKTICK_TODO_CLIENT_ID_KEY = 'ticktickTodoClientId';
const TICKTICK_TODO_CLIENT_SECRET_KEY = 'ticktickTodoClientSecret';
const TICKTICK_TODO_PROJECT_NAME_KEY = 'ticktickTodoProjectName';
const TICKTICK_TODO_PROJECT_ID_KEY = 'ticktickTodoProjectId';
const TICKTICK_TODO_AUTH_KEY = 'ticktickTodoAuth'; // legacy local key (migration only)
const TICKTICK_TODO_AUTH_SESSION_KEY = 'ticktickTodoAuthSession';
const TICKTICK_TODO_AUTH_LOCAL_KEY = 'ticktickTodoAuthLocal';
const TICKTICK_TODO_REFRESH_TOKEN_KEY = 'ticktickTodoRefreshToken';
const ASSIGNMENTS_STORAGE_KEY = 'assignments';
const TODO_TRASH_STORAGE_KEY = 'webclass_todo_trash';
const TODO_SYNC_ALARM_NAME = 'todoApiPeriodicSync';
const TODO_SYNC_ALARM_PERIOD_MINUTES = 1;
const TODO_SYNC_TIME_ZONE = 'Asia/Tokyo';
const MS_GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const MS_TODO_OAUTH_SCOPE = 'offline_access openid profile Tasks.ReadWrite';
const MS_TODO_DEFAULT_LIST_NAME = 'SmartToDo Sync';
const MS_TODO_DEFAULT_TENANT = 'common';
const MS_TODO_DEFAULT_CLIENT_ID = '';
const GOOGLE_TASKS_BASE_URL = 'https://tasks.googleapis.com/tasks/v1';
const GOOGLE_TODO_OAUTH_SCOPE = 'https://www.googleapis.com/auth/tasks';
const GOOGLE_TODO_DEFAULT_LIST_NAME = 'SmartToDo Sync';
const GOOGLE_TODO_DEFAULT_CLIENT_ID = '';
const TODOIST_API_BASE_URL = 'https://api.todoist.com/api/v1';
const TODOIST_DEFAULT_PROJECT_NAME = 'SmartToDo Sync';
const TICKTICK_API_BASE_URL = 'https://api.ticktick.com/open/v1';
const TICKTICK_AUTH_BASE_URL = 'https://ticktick.com';
const TICKTICK_OAUTH_SCOPE = 'tasks:read tasks:write';
const TICKTICK_DEFAULT_PROJECT_NAME = 'SmartToDo Sync';
const TODOIST_COMPLETED_LOOKBACK_MONTHS = 3;
const TODOIST_COMPLETED_FETCH_WINDOW_MONTHS = 3;
const TODO_TITLE_FORMAT_TASK_ONLY = 'task_only';
const TODO_TITLE_FORMAT_SHORT = 'short_course_plus_task';
const TODO_TITLE_FORMAT_ULTRA_SHORT = 'ultra_short_plus_task';
const MS_TODO_REMINDER_TIME_MODE_AT_9AM = 'at_9am';
const MS_TODO_REMINDER_TIME_MODE_EXACT_OFFSET = 'exact_offset';
const MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE = 1;
const pendingDownloads = new Map();
const urlToFilename = new Map();
const todoSyncRuntimeState = {
    running: false,
    lastRunAt: 0
};

const OPENAI_COURSE_NAME_INSTRUCTIONS = [
    'You are a text normalizer that creates concise course names for a university timetable.',
    'Rules:',
    '- Output only the shortened course name; no quotes and no extra text.',
    '- Remove leading symbols such as bullets, stars, arrows, and dashes.',
    '- Remove term/year/time/course-code segments, e.g. "(2025-Spring Mon3 1-12AY592)".',
    '- Remove instructor names in brackets, e.g. "[Taro Yamada]".',
    '- Remove department/major lists in parentheses or trailing segments.',
    '- If multiple course names are separated by "/", keep only the first one.',
    '- Normalize full-width Latin letters, numbers, and parentheses to half-width.',
    '- Keep meaningful qualifiers like "(Speaking)", "(Lab)", or "(Project)".',
    '- Keep the wording natural; do not invent new abbreviations.',
];

function bytesToBase64Url(bytes) {
    let result = '';
    for (let i = 0; i < bytes.length; i += 1) {
        result += String.fromCharCode(bytes[i]);
    }
    return btoa(result).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Base64Url(input) {
    const encoded = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return bytesToBase64Url(new Uint8Array(digest));
}

function randomString(length = 32) {
    const safeLength = Number.isFinite(Number(length)) && Number(length) > 0
        ? Math.floor(Number(length))
        : 32;
    const bytes = new Uint8Array(safeLength);
    crypto.getRandomValues(bytes);
    const token = bytesToBase64Url(bytes);
    return token.slice(0, safeLength);
}

function computeExpiryTimestamp(expiresInSeconds) {
    const parsed = Number(expiresInSeconds);
    const safeSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 3600;
    const marginMs = 60 * 1000;
    return Date.now() + safeSeconds * 1000 - marginMs;
}

function isAuthTokenUsable(auth) {
    if (!auth || typeof auth !== 'object') return false;
    if (!auth.accessToken) return false;
    if (!auth.expiresAt) return true;
    return Number(auth.expiresAt) > Date.now();
}

function buildSessionAuthStateFromToken(token, fallbackScope = '', options = {}) {
    if (!token || typeof token !== 'object') return null;
    const accessToken = typeof token.access_token === 'string'
        ? token.access_token.trim()
        : '';
    if (!accessToken) return null;
    const parsedExpiry = Number(token.expires_in);
    const hasExplicitExpiry = Number.isFinite(parsedExpiry) && parsedExpiry > 0;
    const expiresAt = hasExplicitExpiry
        ? computeExpiryTimestamp(parsedExpiry)
        : (options.allowMissingExpiry ? 0 : computeExpiryTimestamp(undefined));
    return {
        accessToken,
        refreshToken: '',
        expiresAt,
        scope: token.scope || fallbackScope || '',
        tokenType: token.token_type || 'Bearer',
        obtainedAt: new Date().toISOString()
    };
}

function normalizeSessionAuthState(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const accessToken = typeof raw.accessToken === 'string' ? raw.accessToken.trim() : '';
    if (!accessToken) return null;
    const expiresAt = Number.isFinite(Number(raw.expiresAt)) ? Number(raw.expiresAt) : 0;
    return {
        accessToken,
        refreshToken: '',
        expiresAt,
        scope: typeof raw.scope === 'string' ? raw.scope : '',
        tokenType: typeof raw.tokenType === 'string' && raw.tokenType ? raw.tokenType : 'Bearer',
        obtainedAt: typeof raw.obtainedAt === 'string' ? raw.obtainedAt : ''
    };
}

async function encodePersistedSessionAuth(auth) {
    const normalized = normalizeSessionAuthState(auth);
    if (!normalized) return '';
    return encryptSecureLocalString(JSON.stringify(normalized));
}

function parsePersistedSessionAuth(rawValue) {
    if (typeof rawValue !== 'string' || !rawValue.trim()) return null;
    try {
        return normalizeSessionAuthState(JSON.parse(rawValue));
    } catch {
        return null;
    }
}

function extractCourseIdFromUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl) return '';
    const match = rawUrl.match(/course\.php\/([^\/?#]+)/);
    return match ? match[1].trim() : '';
}

function isAssignmentInTrashSet(assignment, trashSet) {
    if (!(trashSet instanceof Set) || !assignment || typeof assignment !== 'object') return false;
    const url = typeof assignment.url === 'string' ? assignment.url.trim() : '';
    const fallbackUrl = typeof assignment.fallbackUrl === 'string' ? assignment.fallbackUrl.trim() : '';
    return (url && trashSet.has(url)) || (fallbackUrl && trashSet.has(fallbackUrl));
}

function addAssignmentIdentifiersToTrashSet(assignment, trashSet) {
    if (!(trashSet instanceof Set) || !assignment || typeof assignment !== 'object') return false;
    const beforeSize = trashSet.size;
    const url = typeof assignment.url === 'string' ? assignment.url.trim() : '';
    const fallbackUrl = typeof assignment.fallbackUrl === 'string' ? assignment.fallbackUrl.trim() : '';
    if (url) trashSet.add(url);
    if (fallbackUrl) trashSet.add(fallbackUrl);
    return trashSet.size !== beforeSize;
}

function getRemoteTaskTimestamp(task) {
    if (!task || typeof task !== 'object') return 0;
    const timestamp = Date.parse(
        task.lastModifiedDateTime
        || task.updated
        || task.modifiedTime
        || task.createdDateTime
        || task.completedTime
        || task.dueDate
        || task.startDate
        || task.completed_at
        || task.completedAt
        || task.created_at
        || ''
    );
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function pickPreferredRemoteTask(first, second) {
    const firstTs = getRemoteTaskTimestamp(first);
    const secondTs = getRemoteTaskTimestamp(second);
    if (firstTs === secondTs) {
        return (String(first?.id || '') <= String(second?.id || '')) ? first : second;
    }
    return firstTs >= secondTs ? first : second;
}

function getCourseMapKey(assignment) {
    if (!assignment || typeof assignment !== 'object') return '';
    const byUrl = extractCourseIdFromUrl(assignment.url || assignment.fallbackUrl || '');
    if (byUrl) return byUrl;
    const fullName = typeof assignment.courseFullName === 'string' ? assignment.courseFullName.trim() : '';
    return fullName ? `full:${fullName}` : '';
}

function isLocalOnlyAssignment(assignment) {
    if (!assignment || typeof assignment !== 'object') return false;
    if (assignment.localOnly === true) return true;
    const category = typeof assignment.category === 'string' ? assignment.category.trim().toLowerCase() : '';
    const url = typeof assignment.url === 'string' ? assignment.url : '';
    const fallbackUrl = typeof assignment.fallbackUrl === 'string' ? assignment.fallbackUrl : '';
    return category === 'devdev'
        || url.startsWith('debug://')
        || fallbackUrl.startsWith('debug://');
}

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

function parseLocalDeadline(deadline) {
    if (typeof deadline !== 'string') return null;
    const trimmed = deadline.trim();
    if (!trimmed) return null;

    const parsedDirect = new Date(trimmed);
    if (!Number.isNaN(parsedDirect.getTime())) {
        return parsedDirect;
    }

    const normalized = trimmed.replace(/-/g, '/').replace(/\s+/g, ' ').trim();
    const dateTimeMatch = normalized.match(
        /(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s*(AM|PM)?\s*(\d{1,2})(?::)?(\d{1,2})?(?::)?(\d{1,2})?)?/i
    );
    if (!dateTimeMatch) return null;

    const year = Number(dateTimeMatch[1]);
    const month = Number(dateTimeMatch[2]);
    const day = Number(dateTimeMatch[3]);
    const ampmRaw = (dateTimeMatch[4] || '').toLowerCase();
    let hour = Number(dateTimeMatch[5] || 23);
    const minute = Number(dateTimeMatch[6] || 59);
    const second = Number(dateTimeMatch[7] || 0);

    if (ampmRaw === 'pm' && hour < 12) {
        hour += 12;
    } else if (ampmRaw === 'am' && hour === 12) {
        hour = 0;
    }

    const result = new Date(year, month - 1, day, hour, minute, second);
    if (Number.isNaN(result.getTime())) return null;
    return result;
}

function formatDateForTokyoGraph(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: TODO_SYNC_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = Object.fromEntries(
        formatter.formatToParts(date)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value])
    );
    if (!parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute || !parts.second) {
        return null;
    }
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function parseMicrosoftDueDateTime(dueDateTime) {
    if (!dueDateTime || typeof dueDateTime !== 'object' || !dueDateTime.dateTime) return null;
    const raw = String(dueDateTime.dateTime).trim();
    if (!raw) return null;
    const timeZone = (dueDateTime.timeZone || '').trim();
    const normalized = raw.replace(' ', 'T');

    if (timeZone === 'UTC') {
        const utcText = /Z$/i.test(normalized) ? normalized : `${normalized}Z`;
        const parsedUtc = new Date(utcText);
        return Number.isNaN(parsedUtc.getTime()) ? null : parsedUtc;
    }

    if (timeZone === TODO_SYNC_TIME_ZONE) {
        const withOffset = /[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}+09:00`;
        const parsedJst = new Date(withOffset);
        return Number.isNaN(parsedJst.getTime()) ? null : parsedJst;
    }

    const fallback = new Date(normalized);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function serializeRemoteDueDateTime(dueDateTime) {
    if (!dueDateTime || typeof dueDateTime !== 'object') return '';
    const rawDateTime = typeof dueDateTime.dateTime === 'string' ? dueDateTime.dateTime.trim() : '';
    const timeZone = typeof dueDateTime.timeZone === 'string' ? dueDateTime.timeZone.trim() : '';
    if (!rawDateTime) return '';
    return `${rawDateTime}|${timeZone}`;
}

function formatGoogleDueDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const tokyoDate = getTokyoDateParts(date);
    const month = String(tokyoDate.month).padStart(2, '0');
    const day = String(tokyoDate.day).padStart(2, '0');
    return `${tokyoDate.year}-${month}-${day}T00:00:00.000Z`;
}

function parseGoogleDueDateToDeadlineText(dueDateRaw) {
    if (typeof dueDateRaw !== 'string' || !dueDateRaw.trim()) return '';
    const trimmed = dueDateRaw.trim();

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
        const tokyoDate = getTokyoDateParts(parsed);
        const month = String(tokyoDate.month).padStart(2, '0');
        const day = String(tokyoDate.day).padStart(2, '0');
        return `${tokyoDate.year}/${month}/${day}`;
    }

    const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateOnlyMatch) {
        return `${dateOnlyMatch[1]}/${dateOnlyMatch[2]}/${dateOnlyMatch[3]}`;
    }
    return '';
}

function serializeGoogleDueDate(rawDueDate) {
    if (typeof rawDueDate !== 'string') return '';
    return rawDueDate.trim();
}

function hasExplicitTimeInDeadline(deadlineText) {
    if (typeof deadlineText !== 'string') return false;
    const normalized = deadlineText.trim();
    if (!normalized) return false;
    return /(\d{1,2}):(\d{1,2})/.test(normalized) || /(AM|PM)/i.test(normalized);
}

function buildTodoistDuePayloadFromAssignment(assignment) {
    const dueDate = parseLocalDeadline(assignment?.deadline);
    if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) {
        return { dueDate: '', dueDateTime: '', hasDue: false, isDateOnly: false };
    }

    const tokyoDate = getTokyoDateParts(dueDate);
    const month = String(tokyoDate.month).padStart(2, '0');
    const day = String(tokyoDate.day).padStart(2, '0');
    const hour = String(tokyoDate.hour).padStart(2, '0');
    const minute = String(tokyoDate.minute).padStart(2, '0');
    const dateOnly = `${tokyoDate.year}-${month}-${day}`;
    const withTime = `${tokyoDate.year}-${month}-${day}T${hour}:${minute}:00+09:00`;
    const hasExplicitTime = hasExplicitTimeInDeadline(assignment?.deadline);

    if (hasExplicitTime) {
        return { dueDate: '', dueDateTime: withTime, hasDue: true, isDateOnly: false };
    }
    return { dueDate: dateOnly, dueDateTime: '', hasDue: true, isDateOnly: true };
}

function parseTodoistDueToDeadlineText(due, description = '') {
    if (!due || typeof due !== 'object') {
        const fromNote = parseStoredDeadlineTextFromTaskBody(description);
        return fromNote || '';
    }

    const dateTimeValue = typeof due.datetime === 'string' ? due.datetime.trim() : '';
    if (dateTimeValue) {
        const parsed = new Date(dateTimeValue);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleString();
        }
    }

    const dateValue = typeof due.date === 'string' ? due.date.trim() : '';
    if (dateValue) {
        const parsed = new Date(`${dateValue}T00:00:00+09:00`);
        if (!Number.isNaN(parsed.getTime())) {
            const tokyoDate = getTokyoDateParts(parsed);
            const month = String(tokyoDate.month).padStart(2, '0');
            const day = String(tokyoDate.day).padStart(2, '0');
            return `${tokyoDate.year}/${month}/${day}`;
        }
        const dateOnlyMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateOnlyMatch) {
            return `${dateOnlyMatch[1]}/${dateOnlyMatch[2]}/${dateOnlyMatch[3]}`;
        }
    }

    const fromNote = parseStoredDeadlineTextFromTaskBody(description);
    return fromNote || '';
}

function serializeTodoistDue(due) {
    if (!due || typeof due !== 'object') return '';
    const dateTimeValue = typeof due.datetime === 'string' ? due.datetime.trim() : '';
    if (dateTimeValue) return `datetime:${dateTimeValue}`;
    const dateValue = typeof due.date === 'string' ? due.date.trim() : '';
    if (dateValue) return `date:${dateValue}`;
    return '';
}

function getTodoistTaskId(task) {
    if (!task || typeof task !== 'object') return '';
    const rawId = task.id ?? task.task_id ?? task.item_id ?? '';
    if (rawId === null || rawId === undefined) return '';
    const normalized = String(rawId).trim();
    return normalized;
}

function isTodoistTaskCompleted(task) {
    if (!task || typeof task !== 'object') return false;
    if (task.checked === true || task.is_completed === true) return true;
    const status = typeof task.status === 'string' ? task.status.toLowerCase() : '';
    return status === 'completed' || status === 'complete';
}

function formatTickTickDateTimeForApi(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const tokyoDate = getTokyoDateParts(date);
    const month = String(tokyoDate.month).padStart(2, '0');
    const day = String(tokyoDate.day).padStart(2, '0');
    const hour = String(tokyoDate.hour).padStart(2, '0');
    const minute = String(tokyoDate.minute).padStart(2, '0');
    const second = String(tokyoDate.second).padStart(2, '0');
    return `${tokyoDate.year}-${month}-${day}T${hour}:${minute}:${second}+0900`;
}

function buildTickTickDuePayloadFromAssignment(assignment) {
    const dueDate = parseLocalDeadline(assignment?.deadline);
    if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) {
        return { dueDate: '', hasDue: false };
    }
    return {
        dueDate: formatTickTickDateTimeForApi(dueDate),
        hasDue: true
    };
}

function parseTickTickDueToDeadlineText(dueDateRaw, content = '') {
    if (typeof dueDateRaw === 'string' && dueDateRaw.trim()) {
        const parsed = new Date(dueDateRaw.trim());
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleString();
        }
    }
    const fromNote = parseStoredDeadlineTextFromTaskBody(content);
    return fromNote || '';
}

function serializeTickTickDue(rawDueDate) {
    if (typeof rawDueDate !== 'string') return '';
    return rawDueDate.trim();
}

function getTickTickTaskStatus(task) {
    const status = Number(task?.status);
    if (Number.isFinite(status)) return status;
    return typeof task?.completedTime === 'string' && task.completedTime.trim() ? 2 : 0;
}

function isTickTickTaskCompleted(task) {
    return getTickTickTaskStatus(task) === 2;
}

function normalizeTickTickTaskId(taskId) {
    if (taskId === null || taskId === undefined) return '';
    return String(taskId).trim();
}

function getAssignmentTickTickTaskId(assignment) {
    if (!assignment || typeof assignment !== 'object') return '';
    return normalizeTickTickTaskId(assignment.ticktickTaskId);
}

function setAssignmentTickTickTaskId(assignment, taskId) {
    if (!assignment || typeof assignment !== 'object') return false;
    const normalized = normalizeTickTickTaskId(taskId);
    const current = getAssignmentTickTickTaskId(assignment);
    if (current === normalized) return false;
    if (normalized) {
        assignment.ticktickTaskId = normalized;
    } else {
        delete assignment.ticktickTaskId;
    }
    return true;
}

function isTickTickApiStatusError(error, statusCode) {
    const message = typeof error?.message === 'string' ? error.message : '';
    return message.includes(`TickTick API error (${statusCode})`);
}

function formatDeadlineTextWithTime(deadlineText) {
    const normalized = typeof deadlineText === 'string' ? deadlineText.trim() : '';
    if (!normalized) return '';

    const parsed = parseLocalDeadline(normalized);
    if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
        return normalized;
    }

    const tokyoDate = getTokyoDateParts(parsed);
    const month = String(tokyoDate.month).padStart(2, '0');
    const day = String(tokyoDate.day).padStart(2, '0');
    const hour = String(tokyoDate.hour).padStart(2, '0');
    const minute = String(tokyoDate.minute).padStart(2, '0');
    return `${tokyoDate.year}/${month}/${day} ${hour}:${minute}`;
}

function getAssignmentDeadlineTextForSync(assignment) {
    const deadline = typeof assignment?.deadline === 'string' ? assignment.deadline.trim() : '';
    if (!deadline) return '';
    return formatDeadlineTextWithTime(deadline);
}

function normalizeStoredDeadlineText(value) {
    if (typeof value !== 'string') return '';
    const normalized = value.trim();
    if (!normalized || normalized === NO_DEADLINE_TEXT) return '';
    return normalized;
}

function parseStoredDeadlineTextFromTaskBody(bodyContent) {
    if (typeof bodyContent !== 'string' || !bodyContent) return '';
    let currentDeadline = '';
    let metadataDeadline = '';
    const prefix = TODO_SYNC_NOTE_DEADLINE_PREFIX.toLowerCase();
    const lines = bodyContent.split(/\r?\n/);

    for (const rawLine of lines) {
        const line = typeof rawLine === 'string' ? rawLine.trim() : '';
        if (!line) continue;

        if (line.toLowerCase().startsWith(prefix)) {
            metadataDeadline = normalizeStoredDeadlineText(
                line.slice(TODO_SYNC_NOTE_DEADLINE_PREFIX.length)
            );
            continue;
        }

        const currentDeadlineMatch = line.match(/^Current\s+Deadline\s*:\s*(.+)$/i);
        if (currentDeadlineMatch?.[1]) {
            currentDeadline = normalizeStoredDeadlineText(currentDeadlineMatch[1]);
        }
    }

    if (currentDeadline) return currentDeadline;
    if (metadataDeadline) return metadataDeadline;
    return '';
}

function buildMicrosoftTodoTaskNote(assignment, syncIdentity = null) {
    const courseFullName = typeof assignment?.courseFullName === 'string' && assignment.courseFullName.trim()
        ? assignment.courseFullName.trim()
        : (typeof assignment?.course === 'string' && assignment.course.trim() ? assignment.course.trim() : '(Unknown)');
    const originalTaskTitle = typeof assignment?.sourceTitle === 'string' && assignment.sourceTitle.trim()
        ? assignment.sourceTitle.trim()
        : (typeof assignment?.title === 'string' && assignment.title.trim() ? assignment.title.trim() : '(Untitled)');
    const originalDeadline = typeof assignment?.originalDeadline === 'string' && assignment.originalDeadline.trim()
        ? assignment.originalDeadline.trim()
        : '';
    const lines = [
        `Course: ${courseFullName}`,
        `Original Task: ${originalTaskTitle}`,
        `Original Deadline: ${originalDeadline}`
    ];
    if (syncIdentity?.stableId) {
        lines.push(`${TODO_SYNC_NOTE_ID_PREFIX}${syncIdentity.stableId}`);
    }
    if (syncIdentity?.normalizedUrl) {
        lines.push(`${TODO_SYNC_NOTE_URL_PREFIX}${syncIdentity.normalizedUrl}`);
    }
    return lines.join('\n');
}

function buildMicrosoftTodoTaskTitle(assignment, syncSettings) {
    const title = typeof assignment?.title === 'string' ? assignment.title.trim() : '';
    const fallbackTitle = title || '(Untitled)';
    const format = syncSettings?.taskTitleFormat || TODO_TITLE_FORMAT_TASK_ONLY;

    if (format === TODO_TITLE_FORMAT_SHORT) {
        const shortName = typeof assignment?.course === 'string' ? assignment.course.trim() : '';
        return shortName ? `${shortName}${fallbackTitle}` : fallbackTitle;
    }

    if (format === TODO_TITLE_FORMAT_ULTRA_SHORT) {
        const ultraShortMap = syncSettings?.ultraShortCourseMap && typeof syncSettings.ultraShortCourseMap === 'object'
            ? syncSettings.ultraShortCourseMap
            : {};
        const courseKey = getCourseMapKey(assignment);
        const ultraShort = courseKey ? (ultraShortMap[courseKey] || '').trim() : '';
        const fallbackShort = typeof assignment?.course === 'string' ? assignment.course.trim() : '';
        const prefix = ultraShort || fallbackShort;
        return prefix ? `${prefix}${fallbackTitle}` : fallbackTitle;
    }

    return fallbackTitle;
}

function buildMicrosoftReminderDateTime(assignment, syncSettings, dueDate) {
    if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) return null;
    if (assignment?.msTodoReminderEnabled === false) return null;

    const defaultDaysBefore = normalizeMsTodoReminderDaysBefore(
        syncSettings?.defaultReminderDaysBefore,
        MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE
    );
    const defaultTimeMode = normalizeMsTodoReminderTimeMode(
        syncSettings?.defaultReminderTimeMode,
        MS_TODO_REMINDER_TIME_MODE_AT_9AM
    );
    const daysBefore = normalizeMsTodoReminderDaysBefore(
        assignment?.msTodoReminderDaysBefore,
        defaultDaysBefore
    );
    const timeMode = normalizeMsTodoReminderTimeMode(
        assignment?.msTodoReminderTimeMode,
        defaultTimeMode
    );

    const offsetMillis = daysBefore * 24 * 60 * 60 * 1000;
    let reminderDate = new Date(dueDate.getTime() - offsetMillis);
    if (timeMode === MS_TODO_REMINDER_TIME_MODE_AT_9AM) {
        const tokyoDate = getTokyoDateParts(reminderDate);
        reminderDate = buildTokyoDateUtc(tokyoDate.year, tokyoDate.month, tokyoDate.day, 9, 0, 0);
    }

    const formattedReminder = formatDateForTokyoGraph(reminderDate);
    if (!formattedReminder) return null;
    return {
        dateTime: formattedReminder,
        timeZone: TODO_SYNC_TIME_ZONE
    };
}

function buildDesiredMicrosoftTaskState(assignment, syncSettings, forceCompleted = false, syncIdentity = null) {
    const dueDate = parseLocalDeadline(assignment?.deadline);
    const formattedDate = dueDate ? formatDateForTokyoGraph(dueDate) : null;
    const dueDateTime = formattedDate
        ? {
            dateTime: formattedDate,
            timeZone: TODO_SYNC_TIME_ZONE
        }
        : null;
    const reminderDateTime = buildMicrosoftReminderDateTime(assignment, syncSettings, dueDate);
    const completed = forceCompleted === true || assignment?.isCompleted === true;
    return {
        title: buildMicrosoftTodoTaskTitle(assignment, syncSettings),
        status: completed ? 'completed' : 'notStarted',
        dueDateTime,
        reminderDateTime,
        isReminderOn: !!reminderDateTime,
        body: {
            contentType: 'text',
            content: buildMicrosoftTodoTaskNote(assignment, syncIdentity)
        }
    };
}

function buildGoogleTodoTaskNote(assignment, syncIdentity = null) {
    const courseFullName = typeof assignment?.courseFullName === 'string' && assignment.courseFullName.trim()
        ? assignment.courseFullName.trim()
        : (typeof assignment?.course === 'string' && assignment.course.trim() ? assignment.course.trim() : '(Unknown)');
    const originalTaskTitle = typeof assignment?.sourceTitle === 'string' && assignment.sourceTitle.trim()
        ? assignment.sourceTitle.trim()
        : (typeof assignment?.title === 'string' && assignment.title.trim() ? assignment.title.trim() : '(Untitled)');
    const originalDeadline = typeof assignment?.originalDeadline === 'string' && assignment.originalDeadline.trim()
        ? assignment.originalDeadline.trim()
        : '';
    const currentDeadline = getAssignmentDeadlineTextForSync(assignment);
    const lines = [
        `Course: ${courseFullName}`,
        `Original Task: ${originalTaskTitle}`,
        `Original Deadline: ${originalDeadline}`,
        `Current Deadline: ${currentDeadline}`,
        `${TODO_SYNC_NOTE_DEADLINE_PREFIX}${currentDeadline}`
    ];
    if (syncIdentity?.stableId) {
        lines.push(`${TODO_SYNC_NOTE_ID_PREFIX}${syncIdentity.stableId}`);
    }
    if (syncIdentity?.normalizedUrl) {
        lines.push(`${TODO_SYNC_NOTE_URL_PREFIX}${syncIdentity.normalizedUrl}`);
    }
    return lines.join('\n');
}

function buildDesiredGoogleTaskState(assignment, syncSettings, forceCompleted = false, syncIdentity = null) {
    const dueDate = parseLocalDeadline(assignment?.deadline);
    const due = dueDate ? formatGoogleDueDate(dueDate) : null;
    const completed = forceCompleted === true || assignment?.isCompleted === true;
    return {
        title: buildMicrosoftTodoTaskTitle(assignment, syncSettings),
        status: completed ? 'completed' : 'needsAction',
        due,
        notes: buildGoogleTodoTaskNote(assignment, syncIdentity)
    };
}

function buildTodoistTaskNote(assignment, syncIdentity = null) {
    const courseFullName = typeof assignment?.courseFullName === 'string' && assignment.courseFullName.trim()
        ? assignment.courseFullName.trim()
        : (typeof assignment?.course === 'string' && assignment.course.trim() ? assignment.course.trim() : '(Unknown)');
    const originalTaskTitle = typeof assignment?.sourceTitle === 'string' && assignment.sourceTitle.trim()
        ? assignment.sourceTitle.trim()
        : (typeof assignment?.title === 'string' && assignment.title.trim() ? assignment.title.trim() : '(Untitled)');
    const originalDeadline = typeof assignment?.originalDeadline === 'string' && assignment.originalDeadline.trim()
        ? assignment.originalDeadline.trim()
        : '';
    const currentDeadline = getAssignmentDeadlineTextForSync(assignment);
    const sourceUrl = typeof assignment?.url === 'string' && assignment.url.trim()
        ? assignment.url.trim()
        : (typeof assignment?.fallbackUrl === 'string' ? assignment.fallbackUrl.trim() : '');
    const lines = [
        `Course: ${courseFullName}`,
        `Original Task: ${originalTaskTitle}`,
        `Original Deadline: ${originalDeadline}`,
        `Current Deadline: ${currentDeadline}`,
        `${TODO_SYNC_NOTE_DEADLINE_PREFIX}${currentDeadline}`
    ];
    if (sourceUrl) {
        lines.push(`Task URL: ${sourceUrl}`);
    }
    if (syncIdentity?.stableId) {
        lines.push(`${TODO_SYNC_NOTE_ID_PREFIX}${syncIdentity.stableId}`);
    }
    if (syncIdentity?.normalizedUrl) {
        lines.push(`${TODO_SYNC_NOTE_URL_PREFIX}${syncIdentity.normalizedUrl}`);
    }
    return lines.join('\n');
}

function buildDesiredTodoistTaskState(assignment, syncSettings, forceCompleted = false, syncIdentity = null) {
    const due = buildTodoistDuePayloadFromAssignment(assignment);
    const completed = forceCompleted === true || assignment?.isCompleted === true;
    return {
        content: buildMicrosoftTodoTaskTitle(assignment, syncSettings),
        checked: completed,
        dueDate: due.dueDate,
        dueDateTime: due.dueDateTime,
        hasDue: due.hasDue,
        description: buildTodoistTaskNote(assignment, syncIdentity)
    };
}

function buildTickTickTaskContent(assignment, syncIdentity = null) {
    const courseFullName = typeof assignment?.courseFullName === 'string' && assignment.courseFullName.trim()
        ? assignment.courseFullName.trim()
        : (typeof assignment?.course === 'string' && assignment.course.trim() ? assignment.course.trim() : '(Unknown)');
    const originalTaskTitle = typeof assignment?.sourceTitle === 'string' && assignment.sourceTitle.trim()
        ? assignment.sourceTitle.trim()
        : (typeof assignment?.title === 'string' && assignment.title.trim() ? assignment.title.trim() : '(Untitled)');
    const originalDeadline = typeof assignment?.originalDeadline === 'string' && assignment.originalDeadline.trim()
        ? assignment.originalDeadline.trim()
        : '';
    const currentDeadline = getAssignmentDeadlineTextForSync(assignment);
    const sourceUrl = typeof assignment?.url === 'string' && assignment.url.trim()
        ? assignment.url.trim()
        : (typeof assignment?.fallbackUrl === 'string' ? assignment.fallbackUrl.trim() : '');
    const lines = [
        `Course: ${courseFullName}`,
        `Original Task: ${originalTaskTitle}`,
        `Original Deadline: ${originalDeadline}`,
        `Current Deadline: ${currentDeadline}`,
        `${TODO_SYNC_NOTE_DEADLINE_PREFIX}${currentDeadline}`
    ];
    if (sourceUrl) {
        lines.push(`Task URL: ${sourceUrl}`);
    }
    if (syncIdentity?.stableId) {
        lines.push(`${TODO_SYNC_NOTE_ID_PREFIX}${syncIdentity.stableId}`);
    }
    if (syncIdentity?.normalizedUrl) {
        lines.push(`${TODO_SYNC_NOTE_URL_PREFIX}${syncIdentity.normalizedUrl}`);
    }
    return lines.join('\n');
}

function buildDesiredTickTickTaskState(projectId, assignment, syncSettings, forceCompleted = false, syncIdentity = null) {
    const due = buildTickTickDuePayloadFromAssignment(assignment);
    const completed = forceCompleted === true || assignment?.isCompleted === true;
    return {
        projectId,
        title: buildMicrosoftTodoTaskTitle(assignment, syncSettings),
        status: completed ? 2 : 0,
        dueDate: due.dueDate,
        hasDue: due.hasDue,
        content: buildTickTickTaskContent(assignment, syncIdentity)
    };
}

function applyRemoteTaskToAssignment(assignment, remoteTask) {
    if (!assignment || typeof assignment !== 'object' || !remoteTask || typeof remoteTask !== 'object') {
        return false;
    }
    let changed = false;

    const remoteTitle = typeof remoteTask.title === 'string' ? remoteTask.title : '';
    if (remoteTitle && assignment.title !== remoteTitle) {
        assignment.title = remoteTitle;
        assignment.titleEdited = true;
        changed = true;
    }

    const remoteCompleted = remoteTask.status === 'completed';
    if (assignment.isCompleted !== remoteCompleted) {
        assignment.isCompleted = remoteCompleted;
        changed = true;
    }

    const remoteDueDate = parseMicrosoftDueDateTime(remoteTask.dueDateTime);
    const remoteDeadlineText = remoteDueDate ? remoteDueDate.toLocaleString() : '';
    if ((assignment.deadline || '') !== remoteDeadlineText) {
        assignment.deadline = remoteDeadlineText;
        changed = true;
    }

    if (!assignment.originalDeadline || assignment.originalDeadline === '') {
        assignment.originalDeadline = remoteDeadlineText;
        changed = true;
    }

    return changed;
}

function applyGoogleRemoteTaskToAssignment(assignment, remoteTask) {
    if (!assignment || typeof assignment !== 'object' || !remoteTask || typeof remoteTask !== 'object') {
        return false;
    }
    let changed = false;

    const remoteTitle = typeof remoteTask.title === 'string' ? remoteTask.title : '';
    if (remoteTitle && assignment.title !== remoteTitle) {
        assignment.title = remoteTitle;
        assignment.titleEdited = true;
        changed = true;
    }

    const remoteCompleted = remoteTask.status === 'completed';
    if (assignment.isCompleted !== remoteCompleted) {
        assignment.isCompleted = remoteCompleted;
        changed = true;
    }

    const remoteDeadlineFromNote = parseStoredDeadlineTextFromTaskBody(remoteTask.notes);
    const remoteDeadlineText = remoteDeadlineFromNote || parseGoogleDueDateToDeadlineText(remoteTask.due);
    if ((assignment.deadline || '') !== remoteDeadlineText) {
        assignment.deadline = remoteDeadlineText;
        changed = true;
    }

    if (!assignment.originalDeadline || assignment.originalDeadline === '') {
        assignment.originalDeadline = remoteDeadlineText;
        changed = true;
    }

    return changed;
}

function applyTodoistRemoteTaskToAssignment(assignment, remoteTask) {
    if (!assignment || typeof assignment !== 'object' || !remoteTask || typeof remoteTask !== 'object') {
        return false;
    }
    let changed = false;

    const remoteTitle = typeof remoteTask.content === 'string' ? remoteTask.content : '';
    if (remoteTitle && assignment.title !== remoteTitle) {
        assignment.title = remoteTitle;
        assignment.titleEdited = true;
        changed = true;
    }

    const remoteCompleted = isTodoistTaskCompleted(remoteTask);
    if (assignment.isCompleted !== remoteCompleted) {
        assignment.isCompleted = remoteCompleted;
        changed = true;
    }

    const remoteDescription = typeof remoteTask.description === 'string' ? remoteTask.description : '';
    const deadlineFromNotes = parseStoredDeadlineTextFromTaskBody(remoteDescription);
    const hasRemoteDeadlineSignal = !!remoteTask.due || !!deadlineFromNotes;
    if (hasRemoteDeadlineSignal) {
        const remoteDeadlineText = parseTodoistDueToDeadlineText(remoteTask.due, remoteDescription);
        if ((assignment.deadline || '') !== remoteDeadlineText) {
            assignment.deadline = remoteDeadlineText;
            changed = true;
        }

        if (!assignment.originalDeadline || assignment.originalDeadline === '') {
            assignment.originalDeadline = remoteDeadlineText;
            changed = true;
        }
    }

    return changed;
}

function applyTickTickRemoteTaskToAssignment(assignment, remoteTask) {
    if (!assignment || typeof assignment !== 'object' || !remoteTask || typeof remoteTask !== 'object') {
        return false;
    }
    let changed = false;

    const remoteTitle = typeof remoteTask.title === 'string' ? remoteTask.title : '';
    if (remoteTitle && assignment.title !== remoteTitle) {
        assignment.title = remoteTitle;
        assignment.titleEdited = true;
        changed = true;
    }

    const remoteCompleted = isTickTickTaskCompleted(remoteTask);
    if (assignment.isCompleted !== remoteCompleted) {
        assignment.isCompleted = remoteCompleted;
        changed = true;
    }

    const remoteContent = typeof remoteTask.content === 'string' ? remoteTask.content : '';
    const deadlineFromNotes = parseStoredDeadlineTextFromTaskBody(remoteContent);
    const hasRemoteDeadlineSignal = !!serializeTickTickDue(remoteTask.dueDate) || !!deadlineFromNotes;
    if (hasRemoteDeadlineSignal) {
        const remoteDeadlineText = parseTickTickDueToDeadlineText(remoteTask.dueDate, remoteContent);
        if ((assignment.deadline || '') !== remoteDeadlineText) {
            assignment.deadline = remoteDeadlineText;
            changed = true;
        }

        if (!assignment.originalDeadline || assignment.originalDeadline === '') {
            assignment.originalDeadline = remoteDeadlineText;
            changed = true;
        }
    }

    return changed;
}

function buildTaskPatchFromAssignment(assignment, syncSettings, remoteTask, forceCompleted = false, syncIdentity = null) {
    const desired = buildDesiredMicrosoftTaskState(assignment, syncSettings, forceCompleted, syncIdentity);
    const patch = {};

    if (desired.title && desired.title !== (remoteTask?.title || '')) {
        patch.title = desired.title;
    }

    const remoteStatus = remoteTask?.status || '';
    if (desired.status !== remoteStatus) {
        patch.status = desired.status;
    }

    const remoteDueSerialized = serializeRemoteDueDateTime(remoteTask?.dueDateTime);
    const desiredDueSerialized = serializeRemoteDueDateTime(desired.dueDateTime);
    if (desiredDueSerialized !== remoteDueSerialized) {
        patch.dueDateTime = desired.dueDateTime;
    }

    const remoteReminderSerialized = serializeRemoteDueDateTime(remoteTask?.reminderDateTime);
    const desiredReminderSerialized = serializeRemoteDueDateTime(desired.reminderDateTime);
    if (desiredReminderSerialized !== remoteReminderSerialized) {
        patch.reminderDateTime = desired.reminderDateTime;
    }

    const remoteIsReminderOn = remoteTask?.isReminderOn === true;
    if (desired.isReminderOn !== remoteIsReminderOn) {
        patch.isReminderOn = desired.isReminderOn;
    }

    const remoteBodyContent = remoteTask?.body?.content || '';
    if (desired.body.content !== remoteBodyContent) {
        patch.body = desired.body;
    }

    return patch;
}

function buildGoogleTaskPatchFromAssignment(assignment, syncSettings, remoteTask, forceCompleted = false, syncIdentity = null) {
    const desired = buildDesiredGoogleTaskState(assignment, syncSettings, forceCompleted, syncIdentity);
    const patch = {};

    if (desired.title && desired.title !== (remoteTask?.title || '')) {
        patch.title = desired.title;
    }

    const remoteStatus = remoteTask?.status || '';
    if (desired.status !== remoteStatus) {
        patch.status = desired.status;
    }

    const remoteDue = serializeGoogleDueDate(remoteTask?.due);
    const desiredDue = serializeGoogleDueDate(desired.due);
    if (desiredDue && desiredDue !== remoteDue) {
        patch.due = desired.due;
    }

    const remoteNotes = typeof remoteTask?.notes === 'string' ? remoteTask.notes : '';
    if (desired.notes !== remoteNotes) {
        patch.notes = desired.notes || null;
    }

    return patch;
}

function buildTodoistTaskPatchFromAssignment(assignment, syncSettings, remoteTask, forceCompleted = false, syncIdentity = null) {
    const desired = buildDesiredTodoistTaskState(assignment, syncSettings, forceCompleted, syncIdentity);
    const payload = {};
    const remoteCompleted = isTodoistTaskCompleted(remoteTask);

    if (desired.content && desired.content !== (remoteTask?.content || '')) {
        payload.content = desired.content;
    }

    const remoteDescription = typeof remoteTask?.description === 'string' ? remoteTask.description : '';
    if (desired.description !== remoteDescription) {
        payload.description = desired.description || '';
    }

    const remoteDueSerialized = serializeTodoistDue(remoteTask?.due);
    const desiredDueSerialized = desired.dueDateTime
        ? `datetime:${desired.dueDateTime}`
        : (desired.dueDate ? `date:${desired.dueDate}` : '');
    if (desiredDueSerialized !== remoteDueSerialized) {
        if (desired.dueDateTime) {
            payload.due_datetime = desired.dueDateTime;
            payload.due_date = null;
        } else if (desired.dueDate) {
            payload.due_date = desired.dueDate;
            payload.due_datetime = null;
        } else {
            payload.due_string = 'no date';
            payload.due_lang = 'en';
        }
    }

    return {
        payload,
        shouldClose: desired.checked === true && !remoteCompleted,
        shouldReopen: desired.checked !== true && remoteCompleted
    };
}

function buildTickTickTaskPatchFromAssignment(
    projectId,
    assignment,
    syncSettings,
    remoteTask,
    forceCompleted = false,
    syncIdentity = null
) {
    const desired = buildDesiredTickTickTaskState(projectId, assignment, syncSettings, forceCompleted, syncIdentity);
    const remoteCompleted = isTickTickTaskCompleted(remoteTask);
    const taskId = typeof remoteTask?.id === 'string' ? remoteTask.id : String(remoteTask?.id || '');
    const payload = {
        id: taskId,
        projectId: remoteTask?.projectId || projectId
    };
    let hasPayloadDiff = false;

    if (desired.title && desired.title !== (remoteTask?.title || '')) {
        payload.title = desired.title;
        hasPayloadDiff = true;
    }

    const remoteContent = typeof remoteTask?.content === 'string' ? remoteTask.content : '';
    if (desired.content !== remoteContent) {
        payload.content = desired.content || '';
        hasPayloadDiff = true;
    }

    const remoteDueSerialized = serializeTickTickDue(remoteTask?.dueDate);
    const desiredDueSerialized = desired.hasDue ? serializeTickTickDue(desired.dueDate) : '';
    if (desiredDueSerialized !== remoteDueSerialized) {
        payload.dueDate = desired.hasDue ? desired.dueDate : null;
        hasPayloadDiff = true;
    }

    const remoteIsAllDay = remoteTask?.isAllDay === true;
    if (remoteIsAllDay !== false) {
        payload.isAllDay = false;
        hasPayloadDiff = true;
    }

    const remoteTimeZone = typeof remoteTask?.timeZone === 'string' ? remoteTask.timeZone.trim() : '';
    if (remoteTimeZone && remoteTimeZone !== TODO_SYNC_TIME_ZONE) {
        payload.timeZone = TODO_SYNC_TIME_ZONE;
        hasPayloadDiff = true;
    }

    const shouldComplete = desired.status === 2 && !remoteCompleted;
    const shouldReopen = desired.status !== 2 && remoteCompleted;
    if (shouldReopen) {
        payload.status = 0;
        hasPayloadDiff = true;
    }

    return {
        payload: hasPayloadDiff ? payload : null,
        shouldComplete,
        shouldReopen
    };
}

async function getMicrosoftAuthSettings() {
    const [localData, sessionData] = await Promise.all([
        storageGet({
            [TODO_API_PROVIDER_KEY]: 'none',
            [MS_TODO_CLIENT_ID_KEY]: MS_TODO_DEFAULT_CLIENT_ID,
            [MS_TODO_TENANT_ID_KEY]: MS_TODO_DEFAULT_TENANT,
            [MS_TODO_LIST_NAME_KEY]: MS_TODO_DEFAULT_LIST_NAME,
            [MS_TODO_REFRESH_TOKEN_KEY]: '',
            [MS_TODO_AUTH_KEY]: null
        }),
        storageSessionGet({
            [MS_TODO_AUTH_SESSION_KEY]: null
        })
    ]);
    return {
        ...localData,
        ...sessionData
    };
}

async function exchangeMicrosoftAuthCode({ tenantId, clientId, code, codeVerifier, redirectUri }) {
    const tokenEndpoint = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
    const payload = new URLSearchParams();
    payload.set('client_id', clientId);
    payload.set('grant_type', 'authorization_code');
    payload.set('code', code);
    payload.set('redirect_uri', redirectUri);
    payload.set('code_verifier', codeVerifier);
    payload.set('scope', MS_TODO_OAUTH_SCOPE);

    const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload.toString()
    });
    const rawText = await response.text();
    let parsed = {};
    try {
        parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
        parsed = {};
    }
    if (!response.ok) {
        const description = parsed?.error_description || rawText || 'Token exchange failed.';
        throw new Error(`Microsoft OAuth error: ${description}`);
    }
    return parsed;
}

async function refreshMicrosoftAccessToken({
    tenantId,
    clientId,
    refreshToken,
    scope = MS_TODO_OAUTH_SCOPE
}) {
    const tokenEndpoint = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
    const payload = new URLSearchParams();
    payload.set('client_id', clientId);
    payload.set('grant_type', 'refresh_token');
    payload.set('refresh_token', refreshToken);
    if (scope) {
        payload.set('scope', scope);
    }

    const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload.toString()
    });
    const rawText = await response.text();
    let parsed = {};
    try {
        parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
        parsed = {};
    }
    if (!response.ok) {
        const description = parsed?.error_description || parsed?.error || rawText || 'Microsoft token refresh failed.';
        throw new Error(`Microsoft OAuth error: ${description}`);
    }
    return parsed;
}

async function getValidMicrosoftAccessToken({ forceRefresh = false } = {}) {
    const settings = await getMicrosoftAuthSettings();
    if (settings[TODO_API_PROVIDER_KEY] !== 'microsoft') {
        throw new Error('Microsoft To Do is not connected.');
    }

    const clientId = (settings[MS_TODO_CLIENT_ID_KEY] || '').trim();
    const tenantId = (settings[MS_TODO_TENANT_ID_KEY] || MS_TODO_DEFAULT_TENANT).trim() || MS_TODO_DEFAULT_TENANT;
    if (!clientId) {
        throw new Error('Microsoft Client ID is not configured.');
    }

    const sessionAuth = normalizeSessionAuthState(settings[MS_TODO_AUTH_SESSION_KEY]);
    if (!forceRefresh && isAuthTokenUsable(sessionAuth)) {
        return sessionAuth.accessToken;
    }

    let refreshToken = typeof settings[MS_TODO_REFRESH_TOKEN_KEY] === 'string'
        ? settings[MS_TODO_REFRESH_TOKEN_KEY].trim()
        : '';
    const legacyAuth = settings[MS_TODO_AUTH_KEY];
    const legacyRefreshToken = typeof legacyAuth?.refreshToken === 'string' ? legacyAuth.refreshToken.trim() : '';
    if (!refreshToken && legacyRefreshToken) {
        refreshToken = legacyRefreshToken;
        await storageSet({
            [MS_TODO_REFRESH_TOKEN_KEY]: refreshToken,
            [MS_TODO_AUTH_KEY]: null
        });
    }

    if (!refreshToken) {
        throw new Error('Microsoft refresh token is not configured. Reconnect Microsoft To Do.');
    }

    const refreshed = await refreshMicrosoftAccessToken({
        tenantId,
        clientId,
        refreshToken,
        scope: MS_TODO_OAUTH_SCOPE
    });
    const nextAuth = buildSessionAuthStateFromToken(refreshed, MS_TODO_OAUTH_SCOPE);
    if (!nextAuth) {
        throw new Error('Microsoft token refresh did not return a usable access token.');
    }
    const rotatedRefreshToken = typeof refreshed?.refresh_token === 'string'
        ? refreshed.refresh_token.trim()
        : '';
    if (rotatedRefreshToken) {
        refreshToken = rotatedRefreshToken;
    }
    await Promise.all([
        storageSessionSet({ [MS_TODO_AUTH_SESSION_KEY]: nextAuth }),
        storageSet({
            [MS_TODO_AUTH_KEY]: null,
            [MS_TODO_REFRESH_TOKEN_KEY]: refreshToken
        })
    ]);
    return nextAuth.accessToken;
}

async function microsoftGraphRequest(pathOrUrl, options = {}) {
    const {
        method = 'GET',
        body = undefined,
        headers = {},
        retryOnUnauthorized = true
    } = options;
    const url = /^https?:\/\//.test(pathOrUrl)
        ? pathOrUrl
        : `${MS_GRAPH_BASE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;

    const execute = async (forceRefreshToken) => {
        const accessToken = await getValidMicrosoftAccessToken({ forceRefresh: forceRefreshToken });
        return fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...headers
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    };

    let response = await execute(false);
    if (response.status === 401 && retryOnUnauthorized) {
        response = await execute(true);
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Microsoft Graph API error (${response.status}): ${errorText}`);
    }

    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function fetchAllMicrosoftTodoLists() {
    const lists = [];
    let nextUrl = `${MS_GRAPH_BASE_URL}/me/todo/lists?$top=100`;
    while (nextUrl) {
        const data = await microsoftGraphRequest(nextUrl);
        if (Array.isArray(data?.value)) {
            lists.push(...data.value);
        }
        nextUrl = typeof data?.['@odata.nextLink'] === 'string' ? data['@odata.nextLink'] : '';
    }
    return lists;
}

async function ensureMicrosoftTodoDedicatedList() {
    const settings = await storageGet({
        [MS_TODO_LIST_NAME_KEY]: MS_TODO_DEFAULT_LIST_NAME,
        [MS_TODO_LIST_ID_KEY]: ''
    });
    const desiredListName = (settings[MS_TODO_LIST_NAME_KEY] || MS_TODO_DEFAULT_LIST_NAME).trim() || MS_TODO_DEFAULT_LIST_NAME;

    const lists = await fetchAllMicrosoftTodoLists();
    let matched = lists.find((item) => (item?.displayName || '').trim() === desiredListName);

    if (!matched) {
        matched = await microsoftGraphRequest('/me/todo/lists', {
            method: 'POST',
            body: { displayName: desiredListName }
        });
    }

    if (!matched?.id) {
        throw new Error('Failed to resolve Microsoft To Do list.');
    }

    await storageSet({
        [MS_TODO_LIST_ID_KEY]: matched.id
    });

    return {
        id: matched.id,
        name: matched.displayName || desiredListName
    };
}

async function fetchAllMicrosoftTodoTasks(listId) {
    const tasks = [];
    let nextUrl = `${MS_GRAPH_BASE_URL}/me/todo/lists/${encodeURIComponent(listId)}/tasks?$top=100`;
    while (nextUrl) {
        const data = await microsoftGraphRequest(nextUrl);
        if (Array.isArray(data?.value)) {
            tasks.push(...data.value);
        }
        nextUrl = typeof data?.['@odata.nextLink'] === 'string' ? data['@odata.nextLink'] : '';
    }
    return tasks;
}

async function createMicrosoftTodoTask(listId, assignment, syncSettings, forceCompleted = false, syncIdentity = null) {
    const payload = buildDesiredMicrosoftTaskState(assignment, syncSettings, forceCompleted, syncIdentity);
    if (payload.reminderDateTime === null) {
        delete payload.reminderDateTime;
    }
    if (payload.isReminderOn === false) {
        delete payload.isReminderOn;
    }
    return microsoftGraphRequest(`/me/todo/lists/${encodeURIComponent(listId)}/tasks`, {
        method: 'POST',
        body: payload
    });
}

async function patchMicrosoftTodoTask(listId, taskId, patch) {
    return microsoftGraphRequest(`/me/todo/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        body: patch
    });
}

async function deleteMicrosoftTodoTask(listId, taskId) {
    return microsoftGraphRequest(`/me/todo/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, {
        method: 'DELETE'
    });
}

async function runMicrosoftTodoSync({ mode = 'full', trigger = 'manual', localMutation = null } = {}) {
    if (todoSyncRuntimeState.running) {
        return { success: true, skipped: true, reason: 'sync_in_progress' };
    }

    todoSyncRuntimeState.running = true;
    todoSyncRuntimeState.lastRunAt = Date.now();

    try {
        const normalizedMode = mode === 'local_mutation' || mode === 'pull_only'
            ? mode
            : 'full';
        const syncSettings = await storageGet({
            [TODO_API_PROVIDER_KEY]: 'none',
            [TODO_API_TASK_TITLE_FORMAT_KEY]: TODO_TITLE_FORMAT_TASK_ONLY,
            [TODO_API_ULTRA_SHORT_MAP_KEY]: {},
            [MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE_KEY]: MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE,
            [MS_TODO_DEFAULT_REMINDER_TIME_MODE_KEY]: MS_TODO_REMINDER_TIME_MODE_AT_9AM,
            [MS_TODO_LIST_NAME_KEY]: MS_TODO_DEFAULT_LIST_NAME,
            [MS_TODO_CLIENT_ID_KEY]: MS_TODO_DEFAULT_CLIENT_ID,
            [MS_TODO_LIST_ID_KEY]: '',
            [ASSIGNMENTS_STORAGE_KEY]: [],
            [TODO_TRASH_STORAGE_KEY]: [],
        });

        if (syncSettings[TODO_API_PROVIDER_KEY] !== 'microsoft') {
            return { success: true, skipped: true, reason: 'provider_disabled' };
        }
        if (!syncSettings[MS_TODO_CLIENT_ID_KEY]) {
            throw new Error('Microsoft Client ID is not configured.');
        }

        // Hard cutover: remove legacy local link cache.
        await storageRemove([MS_TODO_LINKS_KEY]);

        const taskNameSettings = {
            taskTitleFormat: syncSettings[TODO_API_TASK_TITLE_FORMAT_KEY],
            ultraShortCourseMap: syncSettings[TODO_API_ULTRA_SHORT_MAP_KEY],
            defaultReminderDaysBefore: normalizeMsTodoReminderDaysBefore(
                syncSettings[MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE_KEY],
                MS_TODO_DEFAULT_REMINDER_DAYS_BEFORE
            ),
            defaultReminderTimeMode: normalizeMsTodoReminderTimeMode(
                syncSettings[MS_TODO_DEFAULT_REMINDER_TIME_MODE_KEY],
                MS_TODO_REMINDER_TIME_MODE_AT_9AM
            )
        };
        const assignments = Array.isArray(syncSettings[ASSIGNMENTS_STORAGE_KEY])
            ? syncSettings[ASSIGNMENTS_STORAGE_KEY].map((assignment) => ({ ...assignment }))
            : [];
        const trashSet = new Set(Array.isArray(syncSettings[TODO_TRASH_STORAGE_KEY]) ? syncSettings[TODO_TRASH_STORAGE_KEY] : []);

        let assignmentsChanged = false;
        let trashChanged = false;
        const nowIso = new Date().toISOString();

        const markAssignmentDeleted = (assignment) => {
            if (!assignment || typeof assignment !== 'object') return;
            if (assignment.isDeleted !== true) {
                assignment.isDeleted = true;
                assignment.deletedAt = nowIso;
                assignmentsChanged = true;
            }
            if (addAssignmentIdentifiersToTrashSet(assignment, trashSet)) {
                trashChanged = true;
            }
        };

        const assignmentMap = new Map();
        assignments.forEach((assignment) => {
            const syncIdentity = getAssignmentSyncIdentity(assignment);
            if (!syncIdentity.stableId) return;

            const existingEntry = assignmentMap.get(syncIdentity.stableId);
            if (!existingEntry) {
                assignmentMap.set(syncIdentity.stableId, { assignment, syncIdentity });
                return;
            }

            const existingAssignment = existingEntry.assignment;
            const preferExisting =
                (existingAssignment.isDeleted !== true && assignment.isDeleted === true)
                || (
                    existingAssignment.isDeleted === assignment.isDeleted
                    && (typeof existingAssignment.url === 'string' && existingAssignment.url)
                    && !(typeof assignment.url === 'string' && assignment.url)
                );

            if (preferExisting) {
                markAssignmentDeleted(assignment);
                return;
            }

            markAssignmentDeleted(existingAssignment);
            assignmentMap.set(syncIdentity.stableId, { assignment, syncIdentity });
        });

        const listInfo = await ensureMicrosoftTodoDedicatedList();
        const remoteTasks = await fetchAllMicrosoftTodoTasks(listInfo.id);
        const remoteById = new Map();
        const remoteByStableId = new Map();
        const remoteTaskDeleteReasons = new Map();

        remoteTasks.forEach((task) => {
            if (!task?.id) return;
            const metadata = parseSyncMetadataFromTask(task);
            if (!metadata.stableId) {
                remoteTaskDeleteReasons.set(task.id, 'legacy');
                return;
            }

            const existingTask = remoteByStableId.get(metadata.stableId);
            if (!existingTask) {
                remoteByStableId.set(metadata.stableId, task);
                remoteById.set(task.id, task);
                return;
            }

            const keepTask = pickPreferredRemoteTask(existingTask, task);
            const removeTask = keepTask === existingTask ? task : existingTask;
            remoteByStableId.set(metadata.stableId, keepTask);
            remoteById.set(keepTask.id, keepTask);
            remoteById.delete(removeTask.id);
            if (!remoteTaskDeleteReasons.has(removeTask.id)) {
                remoteTaskDeleteReasons.set(removeTask.id, 'duplicate');
            }
        });

        let remoteLegacyDeleted = 0;
        let remoteDuplicateDeleted = 0;
        for (const [taskId, reason] of remoteTaskDeleteReasons.entries()) {
            try {
                await deleteMicrosoftTodoTask(listInfo.id, taskId);
                if (reason === 'legacy') remoteLegacyDeleted += 1;
                if (reason === 'duplicate') remoteDuplicateDeleted += 1;
            } catch (error) {
                uxDebugWarn('[WebClass UX] failed to delete legacy/duplicate Microsoft task', { taskId, error });
            }
        }

        let mutationStableId = '';
        if (normalizedMode === 'local_mutation' && typeof localMutation?.localKey === 'string' && localMutation.localKey) {
            const mutationKey = localMutation.localKey;
            if (assignmentMap.has(mutationKey)) {
                mutationStableId = mutationKey;
            } else {
                for (const assignment of assignments) {
                    if (assignment?.url === mutationKey || assignment?.fallbackUrl === mutationKey) {
                        mutationStableId = getAssignmentSyncIdentity(assignment).stableId;
                        if (mutationStableId) break;
                    }
                }
            }
        }

        for (const [stableId, entry] of assignmentMap.entries()) {
            if (normalizedMode === 'local_mutation' && mutationStableId && stableId === mutationStableId) {
                continue;
            }
            const remoteTask = remoteByStableId.get(stableId);
            if (!remoteTask) continue;
            if (applyRemoteTaskToAssignment(entry.assignment, remoteTask)) {
                assignmentsChanged = true;
            }
        }

        const syncSingleAssignment = async (entry, modeForceCompleted = false) => {
            const assignment = entry?.assignment;
            const syncIdentity = entry?.syncIdentity;
            if (!assignment || !syncIdentity?.stableId) return;
            if (isLocalOnlyAssignment(assignment)) return;

            const remoteTask = remoteByStableId.get(syncIdentity.stableId);
            if (remoteTask) {
                const patch = buildTaskPatchFromAssignment(
                    assignment,
                    taskNameSettings,
                    remoteTask,
                    modeForceCompleted,
                    syncIdentity
                );
                if (Object.keys(patch).length === 0) return;

                const patched = await patchMicrosoftTodoTask(listInfo.id, remoteTask.id, patch);
                const latest = patched || remoteTask;
                if (latest?.id) {
                    const latestMetadata = parseSyncMetadataFromTask(latest);
                    const stableId = latestMetadata.stableId || syncIdentity.stableId;
                    remoteById.set(latest.id, latest);
                    remoteByStableId.set(stableId, latest);
                }
                return;
            }

            if (modeForceCompleted) return;

            const created = await createMicrosoftTodoTask(listInfo.id, assignment, taskNameSettings, false, syncIdentity);
            if (created?.id) {
                const metadata = parseSyncMetadataFromTask(created);
                const stableId = metadata.stableId || syncIdentity.stableId;
                remoteById.set(created.id, created);
                remoteByStableId.set(stableId, created);
            }
        };

        if (normalizedMode === 'local_mutation' && mutationStableId) {
            const mutationEntry = assignmentMap.get(mutationStableId);
            if (mutationEntry) {
                const forceCompleted = mutationEntry.assignment.isDeleted === true
                    || isAssignmentInTrashSet(mutationEntry.assignment, trashSet);
                await syncSingleAssignment(mutationEntry, forceCompleted);
            }
        }

        if (normalizedMode === 'full') {
            for (const entry of assignmentMap.values()) {
                const forceCompleted = entry.assignment.isDeleted === true
                    || isAssignmentInTrashSet(entry.assignment, trashSet);
                await syncSingleAssignment(entry, forceCompleted);
            }
        }

        const writePayload = {};
        if (assignmentsChanged) {
            writePayload[ASSIGNMENTS_STORAGE_KEY] = assignments;
        }
        if (trashChanged) {
            writePayload[TODO_TRASH_STORAGE_KEY] = Array.from(trashSet);
        }
        if (Object.keys(writePayload).length > 0) {
            await storageSet(writePayload);
        }

        return {
            success: true,
            listId: listInfo.id,
            listName: listInfo.name,
            assignmentsChanged,
            trashChanged,
            remoteLegacyDeleted,
            remoteDuplicateDeleted,
            mode: normalizedMode,
            trigger,
            localTaskCount: assignmentMap.size,
            remoteTaskCount: remoteById.size
        };
    } finally {
        todoSyncRuntimeState.running = false;
    }
}

async function getGoogleAuthSettings() {
    const [localData, sessionData] = await Promise.all([
        loadSecureLocalStrings({
            [TODO_API_PROVIDER_KEY]: 'none',
            [GOOGLE_TODO_CLIENT_ID_KEY]: '',
            [GOOGLE_TODO_CLIENT_SECRET_KEY]: '',
            [GOOGLE_TODO_LIST_NAME_KEY]: GOOGLE_TODO_DEFAULT_LIST_NAME,
            [GOOGLE_TODO_REFRESH_TOKEN_KEY]: '',
            [GOOGLE_TODO_AUTH_KEY]: null
        }, [GOOGLE_TODO_CLIENT_SECRET_KEY]),
        storageSessionGet({
            [GOOGLE_TODO_AUTH_SESSION_KEY]: null
        })
    ]);
    return { ...localData, ...sessionData };
}

async function exchangeGoogleAuthCode({ clientId, clientSecret, code, codeVerifier, redirectUri }) {
    const params = {
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
    };
    if (clientSecret) params.client_secret = clientSecret;
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString()
    });
    const text = await response.text();
    let parsed;
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = {}; }
    if (!response.ok) {
        throw new Error(`Google OAuth error: ${parsed?.error_description || parsed?.error || text || 'Token exchange failed.'}`);
    }
    return parsed;
}

async function refreshGoogleAccessToken({ clientId, clientSecret, refreshToken }) {
    const params = {
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
    };
    if (clientSecret) params.client_secret = clientSecret;
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString()
    });
    const text = await response.text();
    let parsed;
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = {}; }
    if (!response.ok) {
        throw new Error(`Google OAuth error: ${parsed?.error_description || parsed?.error || text || 'Token refresh failed.'}`);
    }
    return parsed;
}

function normalizeGoogleOAuthError(error, { interactive = false } = {}) {
    const message = extractErrorMessage(error, 'Google OAuth failed.');
    if (/invalid_client/i.test(message) || /unauthorized_client/i.test(message)) {
        return new Error('Google Client ID が正しくありません。設定画面で確認してください。');
    }
    if (/invalid_grant/i.test(message)) {
        return new Error('Google の認証が期限切れです。設定画面から再接続してください。');
    }
    if (/redirect_uri_mismatch/i.test(message)) {
        return new Error('リダイレクト URI が Google Cloud Console に登録されていません。設定画面に表示される URI を登録してください。');
    }
    if (/access_denied/i.test(message) || /did not approve access/i.test(message)
        || /user.*cancel/i.test(message)) {
        return interactive
            ? new Error('Google の認証がキャンセルされました。')
            : new Error('Google Tasks が未認証です。設定画面から再接続してください。');
    }
    return new Error(message);
}

async function getValidGoogleAccessToken({ forceRefresh = false } = {}) {
    const settings = await getGoogleAuthSettings();
    if (settings[TODO_API_PROVIDER_KEY] !== 'google') {
        throw new Error('Google Tasks is not connected.');
    }

    const clientId = (settings[GOOGLE_TODO_CLIENT_ID_KEY] || '').trim();
    if (!clientId) {
        throw new Error('設定画面で Google Client ID を入力してください。');
    }

    const sessionAuth = normalizeSessionAuthState(settings[GOOGLE_TODO_AUTH_SESSION_KEY]);
    if (!forceRefresh && isAuthTokenUsable(sessionAuth)) {
        return sessionAuth.accessToken;
    }

    let refreshToken = typeof settings[GOOGLE_TODO_REFRESH_TOKEN_KEY] === 'string'
        ? settings[GOOGLE_TODO_REFRESH_TOKEN_KEY].trim() : '';
    const legacyAuth = settings[GOOGLE_TODO_AUTH_KEY];
    if (!refreshToken && legacyAuth?.refreshToken) {
        refreshToken = legacyAuth.refreshToken.trim();
        await storageSet({ [GOOGLE_TODO_REFRESH_TOKEN_KEY]: refreshToken, [GOOGLE_TODO_AUTH_KEY]: null });
    }
    if (!refreshToken) {
        throw new Error('Google の認証情報がありません。設定画面から再接続してください。');
    }

    const clientSecret = (settings[GOOGLE_TODO_CLIENT_SECRET_KEY] || '').trim();
    const refreshed = await refreshGoogleAccessToken({ clientId, clientSecret, refreshToken });
    const nextAuth = buildSessionAuthStateFromToken(refreshed, GOOGLE_TODO_OAUTH_SCOPE);
    if (!nextAuth) {
        throw new Error('Google トークンの更新に失敗しました。設定画面から再接続してください。');
    }

    await Promise.all([
        storageSessionSet({ [GOOGLE_TODO_AUTH_SESSION_KEY]: nextAuth }),
        storageSet({ [GOOGLE_TODO_AUTH_KEY]: null })
    ]);
    return nextAuth.accessToken;
}

async function googleTasksRequest(pathOrUrl, options = {}) {
    const {
        method = 'GET',
        body = undefined,
        headers = {},
        retryOnUnauthorized = true
    } = options;
    const url = /^https?:\/\//.test(pathOrUrl)
        ? pathOrUrl
        : `${GOOGLE_TASKS_BASE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;

    const execute = async (forceRefreshToken) => {
        const accessToken = await getValidGoogleAccessToken({ forceRefresh: forceRefreshToken });
        return fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...headers
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    };

    let response = await execute(false);
    if (response.status === 401 && retryOnUnauthorized) {
        response = await execute(true);
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Tasks API error (${response.status}): ${errorText}`);
    }

    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function fetchAllGoogleTaskLists() {
    const lists = [];
    let pageToken = '';
    while (true) {
        const query = new URLSearchParams();
        query.set('maxResults', '100');
        if (pageToken) {
            query.set('pageToken', pageToken);
        }
        const data = await googleTasksRequest(`/users/@me/lists?${query.toString()}`);
        if (Array.isArray(data?.items)) {
            lists.push(...data.items);
        }
        pageToken = typeof data?.nextPageToken === 'string' ? data.nextPageToken : '';
        if (!pageToken) break;
    }
    return lists;
}

async function ensureGoogleTodoDedicatedList() {
    const settings = await storageGet({
        [GOOGLE_TODO_LIST_NAME_KEY]: GOOGLE_TODO_DEFAULT_LIST_NAME,
        [GOOGLE_TODO_LIST_ID_KEY]: ''
    });
    const desiredListName = (settings[GOOGLE_TODO_LIST_NAME_KEY] || GOOGLE_TODO_DEFAULT_LIST_NAME).trim()
        || GOOGLE_TODO_DEFAULT_LIST_NAME;

    const lists = await fetchAllGoogleTaskLists();
    let matched = lists.find((item) => (item?.title || '').trim() === desiredListName);

    if (!matched) {
        matched = await googleTasksRequest('/users/@me/lists', {
            method: 'POST',
            body: { title: desiredListName }
        });
    }

    if (!matched?.id) {
        throw new Error('Failed to resolve Google Tasks list.');
    }

    await storageSet({
        [GOOGLE_TODO_LIST_ID_KEY]: matched.id
    });

    return {
        id: matched.id,
        name: matched.title || desiredListName
    };
}

async function fetchAllGoogleTasks(listId) {
    const tasks = [];
    let pageToken = '';
    while (true) {
        const query = new URLSearchParams();
        query.set('maxResults', '100');
        query.set('showCompleted', 'true');
        query.set('showHidden', 'true');
        if (pageToken) {
            query.set('pageToken', pageToken);
        }
        const data = await googleTasksRequest(`/lists/${encodeURIComponent(listId)}/tasks?${query.toString()}`);
        if (Array.isArray(data?.items)) {
            tasks.push(...data.items);
        }
        pageToken = typeof data?.nextPageToken === 'string' ? data.nextPageToken : '';
        if (!pageToken) break;
    }
    return tasks;
}

async function createGoogleTodoTask(listId, assignment, syncSettings, forceCompleted = false, syncIdentity = null) {
    const payload = buildDesiredGoogleTaskState(assignment, syncSettings, forceCompleted, syncIdentity);
    if (!payload.due) {
        delete payload.due;
    }
    if (!payload.notes) {
        delete payload.notes;
    }
    return googleTasksRequest(`/lists/${encodeURIComponent(listId)}/tasks`, {
        method: 'POST',
        body: payload
    });
}

async function patchGoogleTodoTask(listId, taskId, patch) {
    return googleTasksRequest(`/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        body: patch
    });
}

async function deleteGoogleTodoTask(listId, taskId) {
    return googleTasksRequest(`/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, {
        method: 'DELETE'
    });
}

async function runGoogleTodoSync({ mode = 'full', trigger = 'manual', localMutation = null } = {}) {
    if (todoSyncRuntimeState.running) {
        return { success: true, skipped: true, reason: 'sync_in_progress' };
    }

    todoSyncRuntimeState.running = true;
    todoSyncRuntimeState.lastRunAt = Date.now();

    try {
        const normalizedMode = mode === 'local_mutation' || mode === 'pull_only'
            ? mode
            : 'full';
        const syncSettings = await storageGet({
            [TODO_API_PROVIDER_KEY]: 'none',
            [TODO_API_TASK_TITLE_FORMAT_KEY]: TODO_TITLE_FORMAT_TASK_ONLY,
            [TODO_API_ULTRA_SHORT_MAP_KEY]: {},
            [GOOGLE_TODO_LIST_NAME_KEY]: GOOGLE_TODO_DEFAULT_LIST_NAME,
            [GOOGLE_TODO_CLIENT_ID_KEY]: GOOGLE_TODO_DEFAULT_CLIENT_ID,
            [GOOGLE_TODO_LIST_ID_KEY]: '',
            [ASSIGNMENTS_STORAGE_KEY]: [],
            [TODO_TRASH_STORAGE_KEY]: [],
        });

        if (syncSettings[TODO_API_PROVIDER_KEY] !== 'google') {
            return { success: true, skipped: true, reason: 'provider_disabled' };
        }

        const taskNameSettings = {
            taskTitleFormat: syncSettings[TODO_API_TASK_TITLE_FORMAT_KEY],
            ultraShortCourseMap: syncSettings[TODO_API_ULTRA_SHORT_MAP_KEY],
        };
        const assignments = Array.isArray(syncSettings[ASSIGNMENTS_STORAGE_KEY])
            ? syncSettings[ASSIGNMENTS_STORAGE_KEY].map((assignment) => ({ ...assignment }))
            : [];
        const trashSet = new Set(Array.isArray(syncSettings[TODO_TRASH_STORAGE_KEY]) ? syncSettings[TODO_TRASH_STORAGE_KEY] : []);

        let assignmentsChanged = false;
        let trashChanged = false;
        const nowIso = new Date().toISOString();

        const markAssignmentDeleted = (assignment) => {
            if (!assignment || typeof assignment !== 'object') return;
            if (assignment.isDeleted !== true) {
                assignment.isDeleted = true;
                assignment.deletedAt = nowIso;
                assignmentsChanged = true;
            }
            if (addAssignmentIdentifiersToTrashSet(assignment, trashSet)) {
                trashChanged = true;
            }
        };

        const assignmentMap = new Map();
        assignments.forEach((assignment) => {
            const syncIdentity = getAssignmentSyncIdentity(assignment);
            if (!syncIdentity.stableId) return;

            const existingEntry = assignmentMap.get(syncIdentity.stableId);
            if (!existingEntry) {
                assignmentMap.set(syncIdentity.stableId, { assignment, syncIdentity });
                return;
            }

            const existingAssignment = existingEntry.assignment;
            const preferExisting =
                (existingAssignment.isDeleted !== true && assignment.isDeleted === true)
                || (
                    existingAssignment.isDeleted === assignment.isDeleted
                    && (typeof existingAssignment.url === 'string' && existingAssignment.url)
                    && !(typeof assignment.url === 'string' && assignment.url)
                );

            if (preferExisting) {
                markAssignmentDeleted(assignment);
                return;
            }

            markAssignmentDeleted(existingAssignment);
            assignmentMap.set(syncIdentity.stableId, { assignment, syncIdentity });
        });

        const listInfo = await ensureGoogleTodoDedicatedList();
        const remoteTasks = await fetchAllGoogleTasks(listInfo.id);
        const remoteById = new Map();
        const remoteByStableId = new Map();
        const remoteTaskDeleteReasons = new Map();

        remoteTasks.forEach((task) => {
            if (!task?.id) return;
            if (task?.deleted === true) return;

            const metadata = parseSyncMetadataFromTask(task);
            if (!metadata.stableId) {
                remoteTaskDeleteReasons.set(task.id, 'legacy');
                return;
            }

            const existingTask = remoteByStableId.get(metadata.stableId);
            if (!existingTask) {
                remoteByStableId.set(metadata.stableId, task);
                remoteById.set(task.id, task);
                return;
            }

            const keepTask = pickPreferredRemoteTask(existingTask, task);
            const removeTask = keepTask === existingTask ? task : existingTask;
            remoteByStableId.set(metadata.stableId, keepTask);
            remoteById.set(keepTask.id, keepTask);
            remoteById.delete(removeTask.id);
            if (!remoteTaskDeleteReasons.has(removeTask.id)) {
                remoteTaskDeleteReasons.set(removeTask.id, 'duplicate');
            }
        });

        let remoteLegacyDeleted = 0;
        let remoteDuplicateDeleted = 0;
        for (const [taskId, reason] of remoteTaskDeleteReasons.entries()) {
            try {
                await deleteGoogleTodoTask(listInfo.id, taskId);
                if (reason === 'legacy') remoteLegacyDeleted += 1;
                if (reason === 'duplicate') remoteDuplicateDeleted += 1;
            } catch (error) {
                uxDebugWarn('[WebClass UX] failed to delete legacy/duplicate Google task', { taskId, error });
            }
        }

        let mutationStableId = '';
        if (normalizedMode === 'local_mutation' && typeof localMutation?.localKey === 'string' && localMutation.localKey) {
            const mutationKey = localMutation.localKey;
            if (assignmentMap.has(mutationKey)) {
                mutationStableId = mutationKey;
            } else {
                for (const assignment of assignments) {
                    if (assignment?.url === mutationKey || assignment?.fallbackUrl === mutationKey) {
                        mutationStableId = getAssignmentSyncIdentity(assignment).stableId;
                        if (mutationStableId) break;
                    }
                }
            }
        }

        for (const [stableId, entry] of assignmentMap.entries()) {
            if (normalizedMode === 'local_mutation' && mutationStableId && stableId === mutationStableId) {
                continue;
            }
            const remoteTask = remoteByStableId.get(stableId);
            if (!remoteTask) continue;
            if (applyGoogleRemoteTaskToAssignment(entry.assignment, remoteTask)) {
                assignmentsChanged = true;
            }
        }

        const syncSingleAssignment = async (entry, modeForceCompleted = false) => {
            const assignment = entry?.assignment;
            const syncIdentity = entry?.syncIdentity;
            if (!assignment || !syncIdentity?.stableId) return;
            if (isLocalOnlyAssignment(assignment)) return;

            const remoteTask = remoteByStableId.get(syncIdentity.stableId);
            if (remoteTask) {
                const patch = buildGoogleTaskPatchFromAssignment(
                    assignment,
                    taskNameSettings,
                    remoteTask,
                    modeForceCompleted,
                    syncIdentity
                );
                if (Object.keys(patch).length === 0) return;

                const patched = await patchGoogleTodoTask(listInfo.id, remoteTask.id, patch);
                const latest = patched || remoteTask;
                if (latest?.id) {
                    const latestMetadata = parseSyncMetadataFromTask(latest);
                    const stableId = latestMetadata.stableId || syncIdentity.stableId;
                    remoteById.set(latest.id, latest);
                    remoteByStableId.set(stableId, latest);
                }
                return;
            }

            if (modeForceCompleted) return;

            const created = await createGoogleTodoTask(listInfo.id, assignment, taskNameSettings, false, syncIdentity);
            if (created?.id) {
                const metadata = parseSyncMetadataFromTask(created);
                const stableId = metadata.stableId || syncIdentity.stableId;
                remoteById.set(created.id, created);
                remoteByStableId.set(stableId, created);
            }
        };

        if (normalizedMode === 'local_mutation' && mutationStableId) {
            const mutationEntry = assignmentMap.get(mutationStableId);
            if (mutationEntry) {
                const forceCompleted = mutationEntry.assignment.isDeleted === true
                    || isAssignmentInTrashSet(mutationEntry.assignment, trashSet);
                await syncSingleAssignment(mutationEntry, forceCompleted);
            }
        }

        if (normalizedMode === 'full') {
            for (const entry of assignmentMap.values()) {
                const forceCompleted = entry.assignment.isDeleted === true
                    || isAssignmentInTrashSet(entry.assignment, trashSet);
                await syncSingleAssignment(entry, forceCompleted);
            }
        }

        const writePayload = {};
        if (assignmentsChanged) {
            writePayload[ASSIGNMENTS_STORAGE_KEY] = assignments;
        }
        if (trashChanged) {
            writePayload[TODO_TRASH_STORAGE_KEY] = Array.from(trashSet);
        }
        if (Object.keys(writePayload).length > 0) {
            await storageSet(writePayload);
        }

        return {
            success: true,
            listId: listInfo.id,
            listName: listInfo.name,
            assignmentsChanged,
            trashChanged,
            remoteLegacyDeleted,
            remoteDuplicateDeleted,
            mode: normalizedMode,
            trigger,
            localTaskCount: assignmentMap.size,
            remoteTaskCount: remoteById.size
        };
    } finally {
        todoSyncRuntimeState.running = false;
    }
}

async function getTodoistAuthSettings() {
    const [localData, sessionData] = await Promise.all([
        loadSecureLocalStrings({
            [TODO_API_PROVIDER_KEY]: 'none',
            [TODOIST_TODO_API_TOKEN_KEY]: '',
            [TODOIST_TODO_PROJECT_NAME_KEY]: TODOIST_DEFAULT_PROJECT_NAME
        }, [TODOIST_TODO_API_TOKEN_KEY]),
        storageSessionGet({
            [TODOIST_TODO_API_TOKEN_KEY]: ''
        })
    ]);

    const sessionToken = typeof sessionData[TODOIST_TODO_API_TOKEN_KEY] === 'string'
        ? sessionData[TODOIST_TODO_API_TOKEN_KEY].trim()
        : '';
    const localToken = typeof localData[TODOIST_TODO_API_TOKEN_KEY] === 'string'
        ? localData[TODOIST_TODO_API_TOKEN_KEY].trim()
        : '';

    if (sessionToken) {
        const syncTasks = [storageSessionRemove([TODOIST_TODO_API_TOKEN_KEY])];
        if (!localToken) {
            syncTasks.push(
                encryptSecureLocalString(sessionToken).then((encryptedToken) => storageSet({
                    [TODOIST_TODO_API_TOKEN_KEY]: encryptedToken
                }))
            );
        }
        await Promise.all(syncTasks);
    }

    return {
        ...localData,
        [TODOIST_TODO_API_TOKEN_KEY]: localToken || sessionToken
    };
}

async function getValidTodoistApiToken() {
    const settings = await getTodoistAuthSettings();
    if (settings[TODO_API_PROVIDER_KEY] !== 'todoist') {
        throw new Error('Todoist integration is not enabled.');
    }

    const apiToken = (settings[TODOIST_TODO_API_TOKEN_KEY] || '').trim();
    if (!apiToken) {
        throw new Error('Todoist Personal Token is not configured.');
    }
    return apiToken;
}

async function todoistApiRequest(pathOrUrl, options = {}) {
    const {
        method = 'GET',
        body = undefined,
        headers = {}
    } = options;
    const url = /^https?:\/\//.test(pathOrUrl)
        ? pathOrUrl
        : `${TODOIST_API_BASE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
    const apiToken = await getValidTodoistApiToken();
    const response = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            ...headers
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Todoist API error (${response.status}): ${errorText}`);
    }

    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function fetchAllTodoistProjects() {
    const projects = [];
    let cursor = '';
    while (true) {
        const query = new URLSearchParams();
        query.set('limit', '200');
        if (cursor) {
            query.set('cursor', cursor);
        }
        const data = await todoistApiRequest(`/projects?${query.toString()}`);
        const results = Array.isArray(data?.results)
            ? data.results
            : (Array.isArray(data) ? data : []);
        if (results.length > 0) {
            projects.push(...results);
        }
        cursor = typeof data?.next_cursor === 'string' ? data.next_cursor : '';
        if (!cursor) break;
    }
    return projects;
}

async function ensureTodoistDedicatedProject() {
    const settings = await storageGet({
        [TODOIST_TODO_PROJECT_NAME_KEY]: TODOIST_DEFAULT_PROJECT_NAME,
        [TODOIST_TODO_PROJECT_ID_KEY]: ''
    });
    const desiredProjectName = (settings[TODOIST_TODO_PROJECT_NAME_KEY] || TODOIST_DEFAULT_PROJECT_NAME).trim()
        || TODOIST_DEFAULT_PROJECT_NAME;

    const projects = await fetchAllTodoistProjects();
    let matched = projects.find((item) => (item?.name || '').trim() === desiredProjectName);

    if (!matched) {
        matched = await todoistApiRequest('/projects', {
            method: 'POST',
            body: { name: desiredProjectName }
        });
    }

    const projectId = getTodoistTaskId(matched);
    if (!projectId) {
        throw new Error('Failed to resolve Todoist sync project.');
    }

    await storageSet({
        [TODOIST_TODO_PROJECT_ID_KEY]: projectId
    });

    return {
        id: projectId,
        name: matched?.name || desiredProjectName
    };
}

async function fetchAllTodoistTasks(projectId) {
    const tasks = [];
    let cursor = '';
    while (true) {
        const query = new URLSearchParams();
        query.set('project_id', projectId);
        query.set('limit', '200');
        if (cursor) {
            query.set('cursor', cursor);
        }
        const data = await todoistApiRequest(`/tasks?${query.toString()}`);
        const results = Array.isArray(data?.results)
            ? data.results
            : (Array.isArray(data) ? data : []);
        if (results.length > 0) {
            tasks.push(...results);
        }
        cursor = typeof data?.next_cursor === 'string' ? data.next_cursor : '';
        if (!cursor) break;
    }
    return tasks;
}

async function fetchAllTodoistCompletedTasks(projectId) {
    const tasks = [];
    const overallUntil = new Date();
    const overallSince = new Date(overallUntil);
    overallSince.setMonth(overallSince.getMonth() - TODOIST_COMPLETED_LOOKBACK_MONTHS);

    let windowStart = new Date(overallSince);
    while (windowStart.getTime() <= overallUntil.getTime()) {
        const windowEnd = new Date(windowStart);
        windowEnd.setMonth(windowEnd.getMonth() + TODOIST_COMPLETED_FETCH_WINDOW_MONTHS);
        if (windowEnd.getTime() > overallUntil.getTime()) {
            windowEnd.setTime(overallUntil.getTime());
        }

        let cursor = '';
        while (true) {
            const query = new URLSearchParams();
            query.set('project_id', projectId);
            query.set('since', windowStart.toISOString());
            query.set('until', windowEnd.toISOString());
            query.set('limit', '200');
            if (cursor) {
                query.set('cursor', cursor);
            }
            const data = await todoistApiRequest(`/tasks/completed/by_completion_date?${query.toString()}`);
            const items = Array.isArray(data?.items)
                ? data.items
                : (Array.isArray(data?.results) ? data.results : []);
            if (items.length > 0) {
                tasks.push(...items);
            }
            cursor = typeof data?.next_cursor === 'string' ? data.next_cursor : '';
            if (!cursor) break;
        }

        if (windowEnd.getTime() >= overallUntil.getTime()) {
            break;
        }
        windowStart = new Date(windowEnd.getTime() + 1);
    }

    return tasks;
}

async function createTodoistTask(projectId, assignment, syncSettings, forceCompleted = false, syncIdentity = null) {
    const desired = buildDesiredTodoistTaskState(assignment, syncSettings, forceCompleted, syncIdentity);
    const payload = {
        project_id: projectId,
        content: desired.content,
        description: desired.description
    };
    if (desired.dueDateTime) {
        payload.due_datetime = desired.dueDateTime;
    } else if (desired.dueDate) {
        payload.due_date = desired.dueDate;
    }
    const created = await todoistApiRequest('/tasks', {
        method: 'POST',
        body: payload
    });
    const createdTaskId = getTodoistTaskId(created);
    if (desired.checked === true && createdTaskId) {
        await closeTodoistTask(createdTaskId);
        return {
            ...(created || {}),
            id: createdTaskId,
            checked: true,
            completed_at: new Date().toISOString()
        };
    }
    return created;
}

async function patchTodoistTask(taskId, patch) {
    return todoistApiRequest(`/tasks/${encodeURIComponent(taskId)}`, {
        method: 'POST',
        body: patch
    });
}

async function closeTodoistTask(taskId) {
    return todoistApiRequest(`/tasks/${encodeURIComponent(taskId)}/close`, {
        method: 'POST'
    });
}

async function reopenTodoistTask(taskId) {
    return todoistApiRequest(`/tasks/${encodeURIComponent(taskId)}/reopen`, {
        method: 'POST'
    });
}

async function deleteTodoistTask(taskId) {
    return todoistApiRequest(`/tasks/${encodeURIComponent(taskId)}`, {
        method: 'DELETE'
    });
}

async function runTodoistTodoSync({ mode = 'full', trigger = 'manual', localMutation = null } = {}) {
    if (todoSyncRuntimeState.running) {
        return { success: true, skipped: true, reason: 'sync_in_progress' };
    }

    todoSyncRuntimeState.running = true;
    todoSyncRuntimeState.lastRunAt = Date.now();

    try {
        const normalizedMode = mode === 'local_mutation' || mode === 'pull_only'
            ? mode
            : 'full';
        const [todoistAuthSettings, syncSettingsBase] = await Promise.all([
            getTodoistAuthSettings(),
            storageGet({
                [TODO_API_PROVIDER_KEY]: 'none',
                [TODO_API_TASK_TITLE_FORMAT_KEY]: TODO_TITLE_FORMAT_TASK_ONLY,
                [TODO_API_ULTRA_SHORT_MAP_KEY]: {},
                [TODOIST_TODO_PROJECT_NAME_KEY]: TODOIST_DEFAULT_PROJECT_NAME,
                [TODOIST_TODO_PROJECT_ID_KEY]: '',
                [ASSIGNMENTS_STORAGE_KEY]: [],
                [TODO_TRASH_STORAGE_KEY]: [],
            })
        ]);
        const syncSettings = {
            ...syncSettingsBase,
            [TODO_API_PROVIDER_KEY]: todoistAuthSettings[TODO_API_PROVIDER_KEY] || syncSettingsBase[TODO_API_PROVIDER_KEY],
            [TODOIST_TODO_API_TOKEN_KEY]: todoistAuthSettings[TODOIST_TODO_API_TOKEN_KEY] || '',
            [TODOIST_TODO_PROJECT_NAME_KEY]:
                todoistAuthSettings[TODOIST_TODO_PROJECT_NAME_KEY] || syncSettingsBase[TODOIST_TODO_PROJECT_NAME_KEY]
        };

        if (syncSettings[TODO_API_PROVIDER_KEY] !== 'todoist') {
            return { success: true, skipped: true, reason: 'provider_disabled' };
        }
        if (!syncSettings[TODOIST_TODO_API_TOKEN_KEY]) {
            throw new Error('Todoist Personal Token is required.');
        }

        const taskNameSettings = {
            taskTitleFormat: syncSettings[TODO_API_TASK_TITLE_FORMAT_KEY],
            ultraShortCourseMap: syncSettings[TODO_API_ULTRA_SHORT_MAP_KEY],
        };
        const assignments = Array.isArray(syncSettings[ASSIGNMENTS_STORAGE_KEY])
            ? syncSettings[ASSIGNMENTS_STORAGE_KEY].map((assignment) => ({ ...assignment }))
            : [];
        const trashSet = new Set(Array.isArray(syncSettings[TODO_TRASH_STORAGE_KEY]) ? syncSettings[TODO_TRASH_STORAGE_KEY] : []);

        let assignmentsChanged = false;
        let trashChanged = false;
        const nowIso = new Date().toISOString();

        const markAssignmentDeleted = (assignment) => {
            if (!assignment || typeof assignment !== 'object') return;
            if (assignment.isDeleted !== true) {
                assignment.isDeleted = true;
                assignment.deletedAt = nowIso;
                assignmentsChanged = true;
            }
            if (addAssignmentIdentifiersToTrashSet(assignment, trashSet)) {
                trashChanged = true;
            }
        };

        const assignmentMap = new Map();
        assignments.forEach((assignment) => {
            const syncIdentity = getAssignmentSyncIdentity(assignment);
            if (!syncIdentity.stableId) return;

            const existingEntry = assignmentMap.get(syncIdentity.stableId);
            if (!existingEntry) {
                assignmentMap.set(syncIdentity.stableId, { assignment, syncIdentity });
                return;
            }

            const existingAssignment = existingEntry.assignment;
            const preferExisting =
                (existingAssignment.isDeleted !== true && assignment.isDeleted === true)
                || (
                    existingAssignment.isDeleted === assignment.isDeleted
                    && (typeof existingAssignment.url === 'string' && existingAssignment.url)
                    && !(typeof assignment.url === 'string' && assignment.url)
                );

            if (preferExisting) {
                markAssignmentDeleted(assignment);
                return;
            }

            markAssignmentDeleted(existingAssignment);
            assignmentMap.set(syncIdentity.stableId, { assignment, syncIdentity });
        });

        const listInfo = await ensureTodoistDedicatedProject();
        const remoteTasks = await fetchAllTodoistTasks(listInfo.id);
        const remoteCompletedTasks = await fetchAllTodoistCompletedTasks(listInfo.id).catch((error) => {
            uxDebugWarn('[WebClass UX] failed to fetch Todoist completed tasks', error);
            return [];
        });
        const remoteById = new Map();
        const remoteByStableId = new Map();
        const remoteTaskDeleteReasons = new Map();

        remoteTasks.forEach((task) => {
            const taskId = getTodoistTaskId(task);
            if (!taskId) return;
            const normalizedTask = { ...task, id: taskId };
            const metadata = parseSyncMetadataFromTask(normalizedTask);
            if (!metadata.stableId) {
                remoteTaskDeleteReasons.set(taskId, 'legacy');
                return;
            }

            const existingTask = remoteByStableId.get(metadata.stableId);
            if (!existingTask) {
                remoteByStableId.set(metadata.stableId, normalizedTask);
                remoteById.set(taskId, normalizedTask);
                return;
            }

            const keepTask = pickPreferredRemoteTask(existingTask, normalizedTask);
            const removeTask = keepTask === existingTask ? normalizedTask : existingTask;
            const keepTaskId = getTodoistTaskId(keepTask);
            const removeTaskId = getTodoistTaskId(removeTask);
            remoteByStableId.set(metadata.stableId, keepTask);
            if (keepTaskId) remoteById.set(keepTaskId, keepTask);
            if (removeTaskId) remoteById.delete(removeTaskId);
            if (removeTaskId && !remoteTaskDeleteReasons.has(removeTaskId)) {
                remoteTaskDeleteReasons.set(removeTaskId, 'duplicate');
            }
        });

        remoteCompletedTasks.forEach((task) => {
            const taskId = getTodoistTaskId(task);
            if (!taskId) return;
            const normalizedTask = { ...task, id: taskId, checked: true };
            const metadata = parseSyncMetadataFromTask(normalizedTask);
            if (!metadata.stableId) return;

            const existingTask = remoteByStableId.get(metadata.stableId);
            if (!existingTask) {
                remoteByStableId.set(metadata.stableId, normalizedTask);
                remoteById.set(taskId, normalizedTask);
                return;
            }

            const keepTask = pickPreferredRemoteTask(existingTask, normalizedTask);
            const keepTaskId = getTodoistTaskId(keepTask);
            remoteByStableId.set(metadata.stableId, keepTask);
            if (keepTaskId) remoteById.set(keepTaskId, keepTask);
        });

        let remoteLegacyDeleted = 0;
        let remoteDuplicateDeleted = 0;
        for (const [taskId, reason] of remoteTaskDeleteReasons.entries()) {
            try {
                await deleteTodoistTask(taskId);
                if (reason === 'legacy') remoteLegacyDeleted += 1;
                if (reason === 'duplicate') remoteDuplicateDeleted += 1;
            } catch (error) {
                uxDebugWarn('[WebClass UX] failed to delete legacy/duplicate Todoist task', { taskId, error });
            }
        }

        let mutationStableId = '';
        if (normalizedMode === 'local_mutation' && typeof localMutation?.localKey === 'string' && localMutation.localKey) {
            const mutationKey = localMutation.localKey;
            if (assignmentMap.has(mutationKey)) {
                mutationStableId = mutationKey;
            } else {
                for (const assignment of assignments) {
                    if (assignment?.url === mutationKey || assignment?.fallbackUrl === mutationKey) {
                        mutationStableId = getAssignmentSyncIdentity(assignment).stableId;
                        if (mutationStableId) break;
                    }
                }
            }
        }

        for (const [stableId, entry] of assignmentMap.entries()) {
            if (normalizedMode === 'local_mutation' && mutationStableId && stableId === mutationStableId) {
                continue;
            }
            const remoteTask = remoteByStableId.get(stableId);
            if (!remoteTask) continue;
            if (applyTodoistRemoteTaskToAssignment(entry.assignment, remoteTask)) {
                assignmentsChanged = true;
            }
        }

        const syncSingleAssignment = async (entry, modeForceCompleted = false) => {
            const assignment = entry?.assignment;
            const syncIdentity = entry?.syncIdentity;
            if (!assignment || !syncIdentity?.stableId) return;
            if (isLocalOnlyAssignment(assignment)) return;

            const remoteTask = remoteByStableId.get(syncIdentity.stableId);
            if (remoteTask) {
                const taskId = getTodoistTaskId(remoteTask);
                if (!taskId) return;

                const patch = buildTodoistTaskPatchFromAssignment(
                    assignment,
                    taskNameSettings,
                    remoteTask,
                    modeForceCompleted,
                    syncIdentity
                );
                let latest = remoteTask;

                if (patch.shouldReopen) {
                    await reopenTodoistTask(taskId);
                    latest = { ...latest, checked: false, completed_at: '' };
                }

                if (Object.keys(patch.payload).length > 0) {
                    const patched = await patchTodoistTask(taskId, patch.payload);
                    if (patched && typeof patched === 'object') {
                        latest = { ...latest, ...patched, id: taskId };
                    }
                }

                if (patch.shouldClose) {
                    await closeTodoistTask(taskId);
                    latest = { ...latest, checked: true, completed_at: new Date().toISOString() };
                }

                const latestMetadata = parseSyncMetadataFromTask(latest);
                const stableId = latestMetadata.stableId || syncIdentity.stableId;
                const latestTaskId = getTodoistTaskId(latest) || taskId;
                remoteById.set(latestTaskId, latest);
                remoteByStableId.set(stableId, latest);
                return;
            }

            if (modeForceCompleted) return;

            const created = await createTodoistTask(listInfo.id, assignment, taskNameSettings, false, syncIdentity);
            const createdTaskId = getTodoistTaskId(created);
            if (createdTaskId) {
                const createdTask = { ...(created || {}), id: createdTaskId };
                const metadata = parseSyncMetadataFromTask(createdTask);
                const stableId = metadata.stableId || syncIdentity.stableId;
                remoteById.set(createdTaskId, createdTask);
                remoteByStableId.set(stableId, createdTask);
            }
        };

        if (normalizedMode === 'local_mutation' && mutationStableId) {
            const mutationEntry = assignmentMap.get(mutationStableId);
            if (mutationEntry) {
                const forceCompleted = mutationEntry.assignment.isDeleted === true
                    || isAssignmentInTrashSet(mutationEntry.assignment, trashSet);
                await syncSingleAssignment(mutationEntry, forceCompleted);
            }
        }

        if (normalizedMode === 'full') {
            for (const entry of assignmentMap.values()) {
                const forceCompleted = entry.assignment.isDeleted === true
                    || isAssignmentInTrashSet(entry.assignment, trashSet);
                await syncSingleAssignment(entry, forceCompleted);
            }
        }

        const writePayload = {};
        if (assignmentsChanged) {
            writePayload[ASSIGNMENTS_STORAGE_KEY] = assignments;
        }
        if (trashChanged) {
            writePayload[TODO_TRASH_STORAGE_KEY] = Array.from(trashSet);
        }
        if (Object.keys(writePayload).length > 0) {
            await storageSet(writePayload);
        }

        return {
            success: true,
            listId: listInfo.id,
            listName: listInfo.name,
            assignmentsChanged,
            trashChanged,
            remoteLegacyDeleted,
            remoteDuplicateDeleted,
            mode: normalizedMode,
            trigger,
            localTaskCount: assignmentMap.size,
            remoteTaskCount: remoteById.size
        };
    } finally {
        todoSyncRuntimeState.running = false;
    }
}

async function getTickTickAuthSettings() {
    const [localData, sessionData] = await Promise.all([
        loadSecureLocalStrings({
            [TODO_API_PROVIDER_KEY]: 'none',
            [TICKTICK_TODO_CLIENT_ID_KEY]: '',
            [TICKTICK_TODO_CLIENT_SECRET_KEY]: '',
            [TICKTICK_TODO_PROJECT_NAME_KEY]: TICKTICK_DEFAULT_PROJECT_NAME,
            [TICKTICK_TODO_PROJECT_ID_KEY]: '',
            [TICKTICK_TODO_AUTH_LOCAL_KEY]: '',
            [TICKTICK_TODO_REFRESH_TOKEN_KEY]: '',
            [TICKTICK_TODO_AUTH_KEY]: null
        }, [TICKTICK_TODO_CLIENT_SECRET_KEY, TICKTICK_TODO_AUTH_LOCAL_KEY]),
        storageSessionGet({
            [TICKTICK_TODO_AUTH_SESSION_KEY]: null
        })
    ]);

    const sessionAuth = normalizeSessionAuthState(sessionData[TICKTICK_TODO_AUTH_SESSION_KEY]);
    const persistedAuth = parsePersistedSessionAuth(localData[TICKTICK_TODO_AUTH_LOCAL_KEY]);
    const legacyAuth = normalizeSessionAuthState(localData[TICKTICK_TODO_AUTH_KEY]);
    if (!persistedAuth && (sessionAuth || legacyAuth)) {
        const encodedAuth = await encodePersistedSessionAuth(sessionAuth || legacyAuth);
        if (encodedAuth) {
            await storageSet({
                [TICKTICK_TODO_AUTH_LOCAL_KEY]: encodedAuth,
                [TICKTICK_TODO_AUTH_KEY]: null
            });
            localData[TICKTICK_TODO_AUTH_LOCAL_KEY] = JSON.stringify(sessionAuth || legacyAuth);
        }
    }

    return {
        ...localData,
        ...sessionData
    };
}

function getTickTickOauthCredentials(settings) {
    const clientId = typeof settings?.[TICKTICK_TODO_CLIENT_ID_KEY] === 'string'
        ? settings[TICKTICK_TODO_CLIENT_ID_KEY].trim()
        : '';
    const clientSecret = typeof settings?.[TICKTICK_TODO_CLIENT_SECRET_KEY] === 'string'
        ? settings[TICKTICK_TODO_CLIENT_SECRET_KEY].trim()
        : '';
    if (!clientId) {
        throw new Error('TickTick Client ID is not configured.');
    }
    if (!clientSecret) {
        throw new Error('TickTick Client Secret is not configured.');
    }
    return { clientId, clientSecret };
}

function buildTickTickAuthorizeUrl({ clientId, redirectUri, state, scope = TICKTICK_OAUTH_SCOPE }) {
    const authorizeUrl = new URL(`${TICKTICK_AUTH_BASE_URL}/oauth/authorize`);
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('scope', scope);
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('response_type', 'code');
    return authorizeUrl.toString();
}

async function requestTickTickToken({ clientId, clientSecret, payload }) {
    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    const response = await fetch(`${TICKTICK_AUTH_BASE_URL}/oauth/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: payload.toString()
    });
    const rawText = await response.text();
    let parsed = {};
    try {
        parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
        parsed = {};
    }
    if (!response.ok) {
        const description = parsed?.error_description || parsed?.error || rawText || 'TickTick token request failed.';
        throw new Error(`TickTick OAuth error: ${description}`);
    }
    return parsed;
}

async function exchangeTickTickAuthCode({ clientId, clientSecret, code, redirectUri }) {
    const payload = new URLSearchParams();
    payload.set('code', code);
    payload.set('grant_type', 'authorization_code');
    payload.set('scope', TICKTICK_OAUTH_SCOPE);
    payload.set('redirect_uri', redirectUri);
    return requestTickTickToken({ clientId, clientSecret, payload });
}

async function refreshTickTickAccessToken({
    clientId,
    clientSecret,
    refreshToken,
    scope = TICKTICK_OAUTH_SCOPE
}) {
    const payload = new URLSearchParams();
    payload.set('refresh_token', refreshToken);
    payload.set('grant_type', 'refresh_token');
    payload.set('scope', scope);
    return requestTickTickToken({ clientId, clientSecret, payload });
}

async function getValidTickTickAccessToken({ forceRefresh = false } = {}) {
    const settings = await getTickTickAuthSettings();
    if (settings[TODO_API_PROVIDER_KEY] !== 'ticktick') {
        throw new Error('TickTick integration is not enabled.');
    }
    const { clientId, clientSecret } = getTickTickOauthCredentials(settings);

    const sessionAuth = normalizeSessionAuthState(settings[TICKTICK_TODO_AUTH_SESSION_KEY]);
    const persistedAuth = parsePersistedSessionAuth(settings[TICKTICK_TODO_AUTH_LOCAL_KEY]);
    if (!forceRefresh && isAuthTokenUsable(sessionAuth)) {
        return sessionAuth.accessToken;
    }
    if (!forceRefresh && isAuthTokenUsable(persistedAuth)) {
        await storageSessionSet({ [TICKTICK_TODO_AUTH_SESSION_KEY]: persistedAuth });
        return persistedAuth.accessToken;
    }

    let refreshToken = typeof settings[TICKTICK_TODO_REFRESH_TOKEN_KEY] === 'string'
        ? settings[TICKTICK_TODO_REFRESH_TOKEN_KEY].trim()
        : '';
    const legacyAuth = settings[TICKTICK_TODO_AUTH_KEY];
    const legacyRefreshToken = typeof legacyAuth?.refreshToken === 'string' ? legacyAuth.refreshToken.trim() : '';
    if (!refreshToken && legacyRefreshToken) {
        refreshToken = legacyRefreshToken;
        await storageSet({
            [TICKTICK_TODO_REFRESH_TOKEN_KEY]: refreshToken,
            [TICKTICK_TODO_AUTH_KEY]: null
        });
    }

    if (!refreshToken) {
        if (sessionAuth?.accessToken) {
            throw new Error('TickTick access token can no longer be refreshed. Reconnect TickTick.');
        }
        throw new Error('TickTick authentication is not configured. Reconnect TickTick.');
    }

    const refreshed = await refreshTickTickAccessToken({
        clientId,
        clientSecret,
        refreshToken,
        scope: TICKTICK_OAUTH_SCOPE
    });
    const nextAuth = buildSessionAuthStateFromToken(
        refreshed,
        TICKTICK_OAUTH_SCOPE,
        { allowMissingExpiry: true }
    );
    if (!nextAuth) {
        throw new Error('TickTick token refresh did not return a usable access token.');
    }
    const rotatedRefreshToken = typeof refreshed?.refresh_token === 'string'
        ? refreshed.refresh_token.trim()
        : '';
    if (rotatedRefreshToken) {
        refreshToken = rotatedRefreshToken;
    }
    await Promise.all([
        storageSessionSet({ [TICKTICK_TODO_AUTH_SESSION_KEY]: nextAuth }),
        storageSet({
            [TICKTICK_TODO_AUTH_KEY]: null,
            [TICKTICK_TODO_AUTH_LOCAL_KEY]: await encodePersistedSessionAuth(nextAuth),
            [TICKTICK_TODO_REFRESH_TOKEN_KEY]: refreshToken
        })
    ]);
    return nextAuth.accessToken;
}

async function tickTickApiRequest(pathOrUrl, options = {}) {
    const {
        method = 'GET',
        body = undefined,
        headers = {},
        retryOnUnauthorized = true
    } = options;
    const url = /^https?:\/\//.test(pathOrUrl)
        ? pathOrUrl
        : `${TICKTICK_API_BASE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;

    const execute = async (forceRefreshToken) => {
        const accessToken = await getValidTickTickAccessToken({ forceRefresh: forceRefreshToken });
        return fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...headers
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    };

    let response = await execute(false);
    if (response.status === 401 && retryOnUnauthorized) {
        response = await execute(true);
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TickTick API error (${response.status}): ${errorText}`);
    }

    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function fetchAllTickTickProjects() {
    const data = await tickTickApiRequest('/project');
    return Array.isArray(data) ? data : [];
}

async function ensureTickTickDedicatedProject() {
    const settings = await storageGet({
        [TICKTICK_TODO_PROJECT_NAME_KEY]: TICKTICK_DEFAULT_PROJECT_NAME,
        [TICKTICK_TODO_PROJECT_ID_KEY]: ''
    });
    const desiredProjectName = (settings[TICKTICK_TODO_PROJECT_NAME_KEY] || TICKTICK_DEFAULT_PROJECT_NAME).trim()
        || TICKTICK_DEFAULT_PROJECT_NAME;

    const projects = await fetchAllTickTickProjects();
    let matched = projects.find((item) => {
        const name = (item?.name || '').trim();
        const kind = (item?.kind || 'TASK').toUpperCase();
        return name === desiredProjectName && kind !== 'NOTE';
    });

    if (!matched) {
        matched = await tickTickApiRequest('/project', {
            method: 'POST',
            body: {
                name: desiredProjectName,
                kind: 'TASK',
                viewMode: 'list'
            }
        });
    }

    const projectId = typeof matched?.id === 'string' ? matched.id : String(matched?.id || '');
    if (!projectId) {
        throw new Error('Failed to resolve TickTick sync project.');
    }

    await storageSet({
        [TICKTICK_TODO_PROJECT_ID_KEY]: projectId
    });

    return {
        id: projectId,
        name: matched?.name || desiredProjectName
    };
}

async function fetchAllTickTickTasks(projectId) {
    const data = await tickTickApiRequest(`/project/${encodeURIComponent(projectId)}/data`);
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    return tasks.map((task) => {
        const taskId = normalizeTickTickTaskId(task?.id);
        return taskId ? { ...task, id: taskId } : task;
    });
}

async function fetchTickTickTaskById(projectId, taskId) {
    const normalizedProjectId = normalizeTickTickTaskId(projectId);
    const normalizedTaskId = normalizeTickTickTaskId(taskId);
    if (!normalizedProjectId || !normalizedTaskId) return null;

    try {
        const task = await tickTickApiRequest(
            `/project/${encodeURIComponent(normalizedProjectId)}/task/${encodeURIComponent(normalizedTaskId)}`
        );
        if (!task || typeof task !== 'object') return null;
        return { ...task, id: normalizedTaskId };
    } catch (error) {
        if (isTickTickApiStatusError(error, 404)) {
            return null;
        }
        throw error;
    }
}

async function createTickTickTask(projectId, assignment, syncSettings, forceCompleted = false, syncIdentity = null) {
    const desired = buildDesiredTickTickTaskState(projectId, assignment, syncSettings, forceCompleted, syncIdentity);
    const payload = {
        projectId,
        title: desired.title,
        content: desired.content
    };
    if (desired.hasDue) {
        payload.dueDate = desired.dueDate;
        payload.timeZone = TODO_SYNC_TIME_ZONE;
        payload.isAllDay = false;
    }
    const created = await tickTickApiRequest('/task', {
        method: 'POST',
        body: payload
    });
    const createdTaskId = typeof created?.id === 'string' ? created.id : String(created?.id || '');
    if (desired.status === 2 && createdTaskId) {
        await completeTickTickTask(projectId, createdTaskId);
        return {
            ...(created || {}),
            id: createdTaskId,
            status: 2,
            completedTime: new Date().toISOString()
        };
    }
    return created;
}

async function patchTickTickTask(taskId, patch) {
    return tickTickApiRequest(`/task/${encodeURIComponent(taskId)}`, {
        method: 'POST',
        body: patch
    });
}

async function completeTickTickTask(projectId, taskId) {
    return tickTickApiRequest(`/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}/complete`, {
        method: 'POST'
    });
}

async function deleteTickTickTask(projectId, taskId) {
    return tickTickApiRequest(`/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}`, {
        method: 'DELETE'
    });
}

async function runTickTickTodoSync({ mode = 'full', trigger = 'manual', localMutation = null } = {}) {
    if (todoSyncRuntimeState.running) {
        return { success: true, skipped: true, reason: 'sync_in_progress' };
    }

    todoSyncRuntimeState.running = true;
    todoSyncRuntimeState.lastRunAt = Date.now();

    try {
        const normalizedMode = mode === 'local_mutation' || mode === 'pull_only'
            ? mode
            : 'full';
        const syncSettings = await loadSecureLocalStrings({
            [TODO_API_PROVIDER_KEY]: 'none',
            [TODO_API_TASK_TITLE_FORMAT_KEY]: TODO_TITLE_FORMAT_TASK_ONLY,
            [TODO_API_ULTRA_SHORT_MAP_KEY]: {},
            [TICKTICK_TODO_PROJECT_NAME_KEY]: TICKTICK_DEFAULT_PROJECT_NAME,
            [TICKTICK_TODO_PROJECT_ID_KEY]: '',
            [TICKTICK_TODO_CLIENT_ID_KEY]: '',
            [TICKTICK_TODO_CLIENT_SECRET_KEY]: '',
            [ASSIGNMENTS_STORAGE_KEY]: [],
            [TODO_TRASH_STORAGE_KEY]: [],
        }, [TICKTICK_TODO_CLIENT_SECRET_KEY]);

        if (syncSettings[TODO_API_PROVIDER_KEY] !== 'ticktick') {
            return { success: true, skipped: true, reason: 'provider_disabled' };
        }
        getTickTickOauthCredentials(syncSettings);

        const taskNameSettings = {
            taskTitleFormat: syncSettings[TODO_API_TASK_TITLE_FORMAT_KEY],
            ultraShortCourseMap: syncSettings[TODO_API_ULTRA_SHORT_MAP_KEY],
        };
        const assignments = Array.isArray(syncSettings[ASSIGNMENTS_STORAGE_KEY])
            ? syncSettings[ASSIGNMENTS_STORAGE_KEY].map((assignment) => ({ ...assignment }))
            : [];
        const trashSet = new Set(Array.isArray(syncSettings[TODO_TRASH_STORAGE_KEY]) ? syncSettings[TODO_TRASH_STORAGE_KEY] : []);

        let assignmentsChanged = false;
        let trashChanged = false;
        const nowIso = new Date().toISOString();

        const markAssignmentDeleted = (assignment) => {
            if (!assignment || typeof assignment !== 'object') return;
            if (assignment.isDeleted !== true) {
                assignment.isDeleted = true;
                assignment.deletedAt = nowIso;
                assignmentsChanged = true;
            }
            if (addAssignmentIdentifiersToTrashSet(assignment, trashSet)) {
                trashChanged = true;
            }
        };

        const assignmentMap = new Map();
        assignments.forEach((assignment) => {
            const syncIdentity = getAssignmentSyncIdentity(assignment);
            if (!syncIdentity.stableId) return;

            const existingEntry = assignmentMap.get(syncIdentity.stableId);
            if (!existingEntry) {
                assignmentMap.set(syncIdentity.stableId, { assignment, syncIdentity });
                return;
            }

            const existingAssignment = existingEntry.assignment;
            const preferExisting =
                (existingAssignment.isDeleted !== true && assignment.isDeleted === true)
                || (
                    existingAssignment.isDeleted === assignment.isDeleted
                    && (typeof existingAssignment.url === 'string' && existingAssignment.url)
                    && !(typeof assignment.url === 'string' && assignment.url)
                );

            if (preferExisting) {
                markAssignmentDeleted(assignment);
                return;
            }

            markAssignmentDeleted(existingAssignment);
            assignmentMap.set(syncIdentity.stableId, { assignment, syncIdentity });
        });

        const listInfo = await ensureTickTickDedicatedProject();
        const remoteTasks = await fetchAllTickTickTasks(listInfo.id);
        const remoteById = new Map();
        const remoteByStableId = new Map();
        const remoteTaskDeleteReasons = new Map();

        remoteTasks.forEach((task) => {
            const taskId = typeof task?.id === 'string' ? task.id : String(task?.id || '');
            if (!taskId) return;
            const normalizedTask = { ...task, id: taskId };
            const metadata = parseSyncMetadataFromTask(normalizedTask);
            if (!metadata.stableId) {
                remoteTaskDeleteReasons.set(taskId, 'legacy');
                return;
            }

            const existingTask = remoteByStableId.get(metadata.stableId);
            if (!existingTask) {
                remoteByStableId.set(metadata.stableId, normalizedTask);
                remoteById.set(taskId, normalizedTask);
                return;
            }

            const keepTask = pickPreferredRemoteTask(existingTask, normalizedTask);
            const removeTask = keepTask === existingTask ? normalizedTask : existingTask;
            const removeTaskId = typeof removeTask?.id === 'string' ? removeTask.id : String(removeTask?.id || '');
            remoteByStableId.set(metadata.stableId, keepTask);
            remoteById.set(keepTask.id, keepTask);
            if (removeTaskId) {
                remoteById.delete(removeTaskId);
                if (!remoteTaskDeleteReasons.has(removeTaskId)) {
                    remoteTaskDeleteReasons.set(removeTaskId, 'duplicate');
                }
            }
        });

        let remoteLegacyDeleted = 0;
        let remoteDuplicateDeleted = 0;
        for (const [taskId, reason] of remoteTaskDeleteReasons.entries()) {
            try {
                await deleteTickTickTask(listInfo.id, taskId);
                if (reason === 'legacy') remoteLegacyDeleted += 1;
                if (reason === 'duplicate') remoteDuplicateDeleted += 1;
            } catch (error) {
                uxDebugWarn('[WebClass UX] failed to delete legacy/duplicate TickTick task', { taskId, error });
            }
        }

        let mutationStableId = '';
        if (normalizedMode === 'local_mutation' && typeof localMutation?.localKey === 'string' && localMutation.localKey) {
            const mutationKey = localMutation.localKey;
            if (assignmentMap.has(mutationKey)) {
                mutationStableId = mutationKey;
            } else {
                for (const assignment of assignments) {
                    if (assignment?.url === mutationKey || assignment?.fallbackUrl === mutationKey) {
                        mutationStableId = getAssignmentSyncIdentity(assignment).stableId;
                        if (mutationStableId) break;
                    }
                }
            }
        }

        const hydrateTickTickRemoteTaskFromStoredId = async (entry) => {
            const assignment = entry?.assignment;
            const syncIdentity = entry?.syncIdentity;
            if (!assignment || !syncIdentity?.stableId) return null;

            const storedTaskId = getAssignmentTickTickTaskId(assignment);
            if (!storedTaskId) return null;

            const cachedById = remoteById.get(storedTaskId);
            if (cachedById) {
                remoteByStableId.set(syncIdentity.stableId, cachedById);
                return cachedById;
            }

            let fetchedTask = null;
            try {
                fetchedTask = await fetchTickTickTaskById(listInfo.id, storedTaskId);
            } catch (error) {
                uxDebugWarn('[WebClass UX] failed to fetch TickTick task by stored id', {
                    taskId: storedTaskId,
                    error
                });
                return null;
            }
            if (!fetchedTask) return null;

            const fetchedMetadata = parseSyncMetadataFromTask(fetchedTask);
            const fetchedStableId = fetchedMetadata.stableId || syncIdentity.stableId;
            remoteById.set(storedTaskId, fetchedTask);
            remoteByStableId.set(fetchedStableId, fetchedTask);
            if (fetchedStableId !== syncIdentity.stableId) {
                remoteByStableId.set(syncIdentity.stableId, fetchedTask);
            }
            return fetchedTask;
        };

        for (const [stableId, entry] of assignmentMap.entries()) {
            if (normalizedMode === 'local_mutation' && mutationStableId && stableId === mutationStableId) {
                continue;
            }
            let remoteTask = remoteByStableId.get(stableId);
            if (!remoteTask) {
                remoteTask = await hydrateTickTickRemoteTaskFromStoredId(entry);
            }
            if (!remoteTask) continue;

            if (setAssignmentTickTickTaskId(entry.assignment, remoteTask.id)) {
                assignmentsChanged = true;
            }
            if (applyTickTickRemoteTaskToAssignment(entry.assignment, remoteTask)) {
                assignmentsChanged = true;
            }
        }

        const syncSingleAssignment = async (entry, modeForceCompleted = false) => {
            const assignment = entry?.assignment;
            const syncIdentity = entry?.syncIdentity;
            if (!assignment || !syncIdentity?.stableId) return;
            if (isLocalOnlyAssignment(assignment)) return;

            let remoteTask = remoteByStableId.get(syncIdentity.stableId);
            if (!remoteTask) {
                remoteTask = await hydrateTickTickRemoteTaskFromStoredId(entry);
                if (remoteTask && normalizedMode !== 'local_mutation') {
                    if (applyTickTickRemoteTaskToAssignment(assignment, remoteTask)) {
                        assignmentsChanged = true;
                    }
                }
            }

            if (remoteTask) {
                const taskId = normalizeTickTickTaskId(remoteTask?.id);
                if (!taskId) return;

                if (setAssignmentTickTickTaskId(assignment, taskId)) {
                    assignmentsChanged = true;
                }

                const patch = buildTickTickTaskPatchFromAssignment(
                    listInfo.id,
                    assignment,
                    taskNameSettings,
                    remoteTask,
                    modeForceCompleted,
                    syncIdentity
                );
                let latest = remoteTask;

                if (patch.payload) {
                    const patched = await patchTickTickTask(taskId, patch.payload);
                    if (patched && typeof patched === 'object') {
                        latest = { ...latest, ...patched, id: taskId };
                    }
                }

                if (patch.shouldComplete) {
                    await completeTickTickTask(listInfo.id, taskId);
                    latest = { ...latest, status: 2, completedTime: new Date().toISOString() };
                }

                const latestMetadata = parseSyncMetadataFromTask(latest);
                const stableId = latestMetadata.stableId || syncIdentity.stableId;
                const latestTaskId = normalizeTickTickTaskId(latest?.id) || taskId;
                remoteById.set(latestTaskId, latest);
                remoteByStableId.set(stableId, latest);
                if (setAssignmentTickTickTaskId(assignment, latestTaskId)) {
                    assignmentsChanged = true;
                }
                return;
            }

            if (modeForceCompleted) return;

            const created = await createTickTickTask(listInfo.id, assignment, taskNameSettings, false, syncIdentity);
            const createdTaskId = normalizeTickTickTaskId(created?.id);
            if (createdTaskId) {
                const createdTask = { ...(created || {}), id: createdTaskId };
                const metadata = parseSyncMetadataFromTask(createdTask);
                const stableId = metadata.stableId || syncIdentity.stableId;
                remoteById.set(createdTaskId, createdTask);
                remoteByStableId.set(stableId, createdTask);
                if (setAssignmentTickTickTaskId(assignment, createdTaskId)) {
                    assignmentsChanged = true;
                }
            }
        };

        if (normalizedMode === 'local_mutation' && mutationStableId) {
            const mutationEntry = assignmentMap.get(mutationStableId);
            if (mutationEntry) {
                const forceCompleted = mutationEntry.assignment.isDeleted === true
                    || isAssignmentInTrashSet(mutationEntry.assignment, trashSet);
                await syncSingleAssignment(mutationEntry, forceCompleted);
            }
        }

        if (normalizedMode === 'full') {
            for (const entry of assignmentMap.values()) {
                const forceCompleted = entry.assignment.isDeleted === true
                    || isAssignmentInTrashSet(entry.assignment, trashSet);
                await syncSingleAssignment(entry, forceCompleted);
            }
        }

        const writePayload = {};
        if (assignmentsChanged) {
            writePayload[ASSIGNMENTS_STORAGE_KEY] = assignments;
        }
        if (trashChanged) {
            writePayload[TODO_TRASH_STORAGE_KEY] = Array.from(trashSet);
        }
        if (Object.keys(writePayload).length > 0) {
            await storageSet(writePayload);
        }

        return {
            success: true,
            listId: listInfo.id,
            listName: listInfo.name,
            assignmentsChanged,
            trashChanged,
            remoteLegacyDeleted,
            remoteDuplicateDeleted,
            mode: normalizedMode,
            trigger,
            localTaskCount: assignmentMap.size,
            remoteTaskCount: remoteById.size
        };
    } finally {
        todoSyncRuntimeState.running = false;
    }
}

async function runTodoApiSyncByProvider({ mode = 'full', trigger = 'manual', localMutation = null } = {}) {
    const data = await storageGet({ [TODO_API_PROVIDER_KEY]: 'none' });
    const provider = data[TODO_API_PROVIDER_KEY] || 'none';
    if (provider === 'microsoft') {
        return runMicrosoftTodoSync({ mode, trigger, localMutation });
    }
    if (provider === 'google') {
        return runGoogleTodoSync({ mode, trigger, localMutation });
    }
    if (provider === 'todoist') {
        return runTodoistTodoSync({ mode, trigger, localMutation });
    }
    if (provider === 'ticktick') {
        return runTickTickTodoSync({ mode, trigger, localMutation });
    }
    return { success: true, skipped: true, reason: 'provider_disabled' };
}

function extractErrorMessage(error, fallback) {
    if (error?.message) return error.message;
    return fallback;
}

async function handleMicrosoftTodoConnect(sendResponse) {
    try {
        const settings = await storageGet({
            [TODO_API_PROVIDER_KEY]: 'none',
            [MS_TODO_CLIENT_ID_KEY]: MS_TODO_DEFAULT_CLIENT_ID,
            [MS_TODO_TENANT_ID_KEY]: MS_TODO_DEFAULT_TENANT,
            [MS_TODO_LIST_NAME_KEY]: MS_TODO_DEFAULT_LIST_NAME,
            [MS_TODO_REFRESH_TOKEN_KEY]: ''
        });

        const clientId = (settings[MS_TODO_CLIENT_ID_KEY] || '').trim();
        const tenantId = (settings[MS_TODO_TENANT_ID_KEY] || MS_TODO_DEFAULT_TENANT).trim() || MS_TODO_DEFAULT_TENANT;
        const listName = (settings[MS_TODO_LIST_NAME_KEY] || MS_TODO_DEFAULT_LIST_NAME).trim() || MS_TODO_DEFAULT_LIST_NAME;
        if (!clientId) {
            sendResponse({ success: false, error: 'Microsoft Client ID is not configured.' });
            return;
        }

        const identityApi = chrome?.identity;
        const redirectUri = identityApi?.getRedirectURL
            ? identityApi.getRedirectURL('microsoft')
            : `https://${chrome.runtime.id}.chromiumapp.org/microsoft`;
        if (!identityApi?.launchWebAuthFlow) {
            throw new Error(
                `chrome.identity API is unavailable. Reload the extension and verify identity permission. ` +
                `Also register the Azure redirect URI: ${redirectUri}`
            );
        }

        const codeVerifier = randomString(96);
        const codeChallenge = await sha256Base64Url(codeVerifier);
        const state = randomString(24);
        const authUrl = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize`);
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_mode', 'query');
        authUrl.searchParams.set('scope', MS_TODO_OAUTH_SCOPE);
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('state', state);

        const callbackUrl = await new Promise((resolve, reject) => {
            identityApi.launchWebAuthFlow(
                {
                    url: authUrl.toString(),
                    interactive: true
                },
                (redirectedTo) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    if (!redirectedTo) {
                        reject(new Error('OAuth redirect URL was empty.'));
                        return;
                    }
                    resolve(redirectedTo);
                }
            );
        });

        const callback = new URL(callbackUrl);
        const callbackState = callback.searchParams.get('state') || '';
        if (!callbackState || callbackState !== state) {
            throw new Error('OAuth state verification failed.');
        }
        const code = callback.searchParams.get('code');
        if (!code) {
            const oauthError = callback.searchParams.get('error_description')
                || callback.searchParams.get('error')
                || 'Authorization code was not returned.';
            throw new Error(oauthError);
        }

        const token = await exchangeMicrosoftAuthCode({
            tenantId,
            clientId,
            code,
            codeVerifier,
            redirectUri
        });

        const refreshToken = typeof token?.refresh_token === 'string' ? token.refresh_token.trim() : '';
        if (!refreshToken) {
            throw new Error('Microsoft refresh token was not returned. Ensure offline_access scope is granted.');
        }

        const sessionAuth = buildSessionAuthStateFromToken(token, MS_TODO_OAUTH_SCOPE);
        if (!sessionAuth) {
            throw new Error('Microsoft access token was not returned.');
        }

        await Promise.all([
            storageSet({
                [TODO_API_PROVIDER_KEY]: 'microsoft',
                [MS_TODO_AUTH_KEY]: null,
                [MS_TODO_REFRESH_TOKEN_KEY]: refreshToken,
                [MS_TODO_TENANT_ID_KEY]: tenantId,
                [MS_TODO_CLIENT_ID_KEY]: clientId,
                [MS_TODO_LIST_NAME_KEY]: listName
            }),
            storageSessionSet({
                [MS_TODO_AUTH_SESSION_KEY]: sessionAuth
            })
        ]);

        const listInfo = await ensureMicrosoftTodoDedicatedList();
        sendResponse({
            success: true,
            connected: true,
            listId: listInfo.id,
            listName: listInfo.name
        });
    } catch (error) {
        uxDebugWarn('[WebClass UX] Microsoft connect failed', error);
        sendResponse({ success: false, error: extractErrorMessage(error, 'Failed to connect Microsoft To Do.') });
    }
}

async function handleMicrosoftTodoDisconnect(sendResponse) {
    try {
        await Promise.all([
            storageSet({
                [TODO_API_PROVIDER_KEY]: 'none',
                [MS_TODO_AUTH_KEY]: null,
                [MS_TODO_REFRESH_TOKEN_KEY]: '',
                [MS_TODO_LIST_ID_KEY]: '',
            }),
            storageSessionRemove([MS_TODO_AUTH_SESSION_KEY])
        ]);
        await storageRemove([MS_TODO_LINKS_KEY]);
        sendResponse({ success: true });
    } catch (error) {
        sendResponse({ success: false, error: extractErrorMessage(error, 'Failed to disconnect Microsoft To Do.') });
    }
}

async function handleMicrosoftTodoGetStatus(sendResponse) {
    try {
        const [localData, sessionData] = await Promise.all([
            storageGet({
                [TODO_API_PROVIDER_KEY]: 'none',
                [MS_TODO_REFRESH_TOKEN_KEY]: '',
                [MS_TODO_LIST_ID_KEY]: '',
                [MS_TODO_LIST_NAME_KEY]: MS_TODO_DEFAULT_LIST_NAME
            }),
            storageSessionGet({
                [MS_TODO_AUTH_SESSION_KEY]: null
            })
        ]);
        const sessionAuth = normalizeSessionAuthState(sessionData[MS_TODO_AUTH_SESSION_KEY]);
        const hasRefreshToken = typeof localData[MS_TODO_REFRESH_TOKEN_KEY] === 'string'
            && localData[MS_TODO_REFRESH_TOKEN_KEY].trim().length > 0;
        const connected = localData[TODO_API_PROVIDER_KEY] === 'microsoft'
            && (isAuthTokenUsable(sessionAuth) || hasRefreshToken);
        sendResponse({
            success: true,
            provider: localData[TODO_API_PROVIDER_KEY],
            connected,
            listId: localData[MS_TODO_LIST_ID_KEY] || '',
            listName: localData[MS_TODO_LIST_NAME_KEY] || MS_TODO_DEFAULT_LIST_NAME
        });
    } catch (error) {
        sendResponse({ success: false, error: extractErrorMessage(error, 'Failed to get Microsoft To Do status.') });
    }
}

async function handleMicrosoftTodoRunSync(message, sendResponse) {
    try {
        const mode = typeof message?.mode === 'string' ? message.mode : 'full';
        const trigger = typeof message?.trigger === 'string' ? message.trigger : 'manual';
        const localMutation = message?.localMutation && typeof message.localMutation === 'object'
            ? {
                localKey: typeof message.localMutation.localKey === 'string' ? message.localMutation.localKey : '',
            }
            : null;
        const result = await runMicrosoftTodoSync({ mode, trigger, localMutation });
        sendResponse(result);
    } catch (error) {
        uxDebugWarn('[WebClass UX] Microsoft sync failed', error);
        sendResponse({ success: false, error: extractErrorMessage(error, 'Microsoft To Do sync failed.') });
    }
}

async function handleGoogleTodoConnect(sendResponse) {
    try {
        const settings = await getGoogleAuthSettings();

        const listName = (settings[GOOGLE_TODO_LIST_NAME_KEY] || GOOGLE_TODO_DEFAULT_LIST_NAME).trim()
            || GOOGLE_TODO_DEFAULT_LIST_NAME;
        const clientId = (settings[GOOGLE_TODO_CLIENT_ID_KEY] || '').trim();
        const clientSecret = (settings[GOOGLE_TODO_CLIENT_SECRET_KEY] || '').trim();
        if (!clientId) {
            sendResponse({ success: false, error: '設定画面で Google Client ID を入力してください。' });
            return;
        }

        const identityApi = chrome?.identity;
        const redirectUri = identityApi?.getRedirectURL
            ? identityApi.getRedirectURL('google')
            : `https://${chrome.runtime.id}.chromiumapp.org/google`;
        if (!identityApi?.launchWebAuthFlow) {
            throw new Error('chrome.identity API is unavailable. Reload the extension.');
        }

        const codeVerifier = randomString(96);
        const codeChallenge = await sha256Base64Url(codeVerifier);
        const state = randomString(24);
        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('scope', GOOGLE_TODO_OAUTH_SCOPE);
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'consent');
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('state', state);

        const callbackUrl = await new Promise((resolve, reject) => {
            identityApi.launchWebAuthFlow(
                { url: authUrl.toString(), interactive: true },
                (redirectedTo) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    if (!redirectedTo) {
                        reject(new Error('OAuth redirect URL was empty.'));
                        return;
                    }
                    resolve(redirectedTo);
                }
            );
        });

        const callback = new URL(callbackUrl);
        if (callback.searchParams.get('state') !== state) {
            throw new Error('OAuth state verification failed.');
        }
        const code = callback.searchParams.get('code');
        if (!code) {
            throw new Error(callback.searchParams.get('error_description')
                || callback.searchParams.get('error')
                || 'Authorization code was not returned.');
        }

        const token = await exchangeGoogleAuthCode({ clientId, clientSecret, code, codeVerifier, redirectUri });

        const refreshToken = typeof token?.refresh_token === 'string' ? token.refresh_token.trim() : '';
        if (!refreshToken) {
            throw new Error('Google refresh token was not returned.');
        }
        const sessionAuth = buildSessionAuthStateFromToken(token, GOOGLE_TODO_OAUTH_SCOPE);
        if (!sessionAuth) {
            throw new Error('Google access token was not returned.');
        }
        const encryptedClientSecret = await encryptSecureLocalString(clientSecret);

        await Promise.all([
            storageSet({
                [TODO_API_PROVIDER_KEY]: 'google',
                [GOOGLE_TODO_AUTH_KEY]: null,
                [GOOGLE_TODO_CLIENT_ID_KEY]: clientId,
                [GOOGLE_TODO_CLIENT_SECRET_KEY]: encryptedClientSecret,
                [GOOGLE_TODO_REFRESH_TOKEN_KEY]: refreshToken,
                [GOOGLE_TODO_LIST_NAME_KEY]: listName
            }),
            storageSessionSet({ [GOOGLE_TODO_AUTH_SESSION_KEY]: sessionAuth })
        ]);

        const listInfo = await ensureGoogleTodoDedicatedList();
        sendResponse({ success: true, connected: true, listId: listInfo.id, listName: listInfo.name });
    } catch (error) {
        uxDebugWarn('[WebClass UX] Google connect failed', error);
        const normalized = normalizeGoogleOAuthError(error, { interactive: true });
        sendResponse({ success: false, error: extractErrorMessage(normalized, 'Failed to connect Google Tasks.') });
    }
}

async function handleGoogleTodoDisconnect(sendResponse) {
    try {
        try {
            const session = await storageSessionGet({ [GOOGLE_TODO_AUTH_SESSION_KEY]: null });
            const auth = normalizeSessionAuthState(session[GOOGLE_TODO_AUTH_SESSION_KEY]);
            if (auth?.accessToken) {
                await fetch('https://oauth2.googleapis.com/revoke', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ token: auth.accessToken }).toString()
                });
            }
        } catch (e) {
            uxDebugWarn('[WebClass UX] Google token revoke failed', e);
        }

        await Promise.all([
            storageSet({
                [TODO_API_PROVIDER_KEY]: 'none',
                [GOOGLE_TODO_AUTH_KEY]: null,
                [GOOGLE_TODO_LIST_ID_KEY]: '',
                [GOOGLE_TODO_REFRESH_TOKEN_KEY]: '',
            }),
            storageSessionRemove([GOOGLE_TODO_AUTH_SESSION_KEY])
        ]);
        sendResponse({ success: true });
    } catch (error) {
        sendResponse({ success: false, error: extractErrorMessage(error, 'Failed to disconnect Google Tasks.') });
    }
}

async function handleGoogleTodoGetStatus(sendResponse) {
    try {
        const data = await storageGet({
            [TODO_API_PROVIDER_KEY]: 'none',
            [GOOGLE_TODO_LIST_ID_KEY]: '',
            [GOOGLE_TODO_LIST_NAME_KEY]: GOOGLE_TODO_DEFAULT_LIST_NAME
        });
        let connected = false;
        if (data[TODO_API_PROVIDER_KEY] === 'google') {
            try {
                await getValidGoogleAccessToken({ interactive: false });
                connected = true;
            } catch {
                connected = false;
            }
        }
        sendResponse({
            success: true,
            provider: data[TODO_API_PROVIDER_KEY],
            connected,
            listId: data[GOOGLE_TODO_LIST_ID_KEY] || '',
            listName: data[GOOGLE_TODO_LIST_NAME_KEY] || GOOGLE_TODO_DEFAULT_LIST_NAME
        });
    } catch (error) {
        sendResponse({ success: false, error: extractErrorMessage(error, 'Failed to get Google Tasks status.') });
    }
}

async function handleGoogleTodoRunSync(message, sendResponse) {
    try {
        const mode = typeof message?.mode === 'string' ? message.mode : 'full';
        const trigger = typeof message?.trigger === 'string' ? message.trigger : 'manual';
        const localMutation = message?.localMutation && typeof message.localMutation === 'object'
            ? {
                localKey: typeof message.localMutation.localKey === 'string' ? message.localMutation.localKey : '',
            }
            : null;
        const result = await runGoogleTodoSync({ mode, trigger, localMutation });
        sendResponse(result);
    } catch (error) {
        uxDebugWarn('[WebClass UX] Google sync failed', error);
        sendResponse({ success: false, error: extractErrorMessage(error, 'Google Tasks sync failed.') });
    }
}

async function handleTodoistTodoConnect(sendResponse) {
    try {
        const settings = await getTodoistAuthSettings();

        const apiToken = (settings[TODOIST_TODO_API_TOKEN_KEY] || '').trim();
        const projectName = (settings[TODOIST_TODO_PROJECT_NAME_KEY] || TODOIST_DEFAULT_PROJECT_NAME).trim()
            || TODOIST_DEFAULT_PROJECT_NAME;
        if (!apiToken) {
            sendResponse({ success: false, error: 'Todoist Personal Token is required.' });
            return;
        }

        await storageSet({
            [TODO_API_PROVIDER_KEY]: 'todoist',
            [TODOIST_TODO_PROJECT_NAME_KEY]: projectName
        });

        const projectInfo = await ensureTodoistDedicatedProject();
        sendResponse({
            success: true,
            connected: true,
            listId: projectInfo.id,
            listName: projectInfo.name
        });
    } catch (error) {
        await storageSet({
            [TODO_API_PROVIDER_KEY]: 'none',
            [TODOIST_TODO_PROJECT_ID_KEY]: '',
        });
        uxDebugWarn('[WebClass UX] Todoist connect failed', error);
        sendResponse({ success: false, error: extractErrorMessage(error, 'Todoist connection failed.') });
    }
}

async function handleTodoistTodoDisconnect(sendResponse) {
    try {
        await Promise.all([
            storageSet({
                [TODO_API_PROVIDER_KEY]: 'none',
                [TODOIST_TODO_API_TOKEN_KEY]: '',
                [TODOIST_TODO_PROJECT_ID_KEY]: '',
            }),
            storageSessionRemove([TODOIST_TODO_API_TOKEN_KEY])
        ]);
        sendResponse({ success: true });
    } catch (error) {
        sendResponse({ success: false, error: extractErrorMessage(error, 'Failed to disconnect Todoist.') });
    }
}

async function handleTodoistTodoGetStatus(sendResponse) {
    try {
        const data = await getTodoistAuthSettings();
        const projectData = await storageGet({
            [TODO_API_PROVIDER_KEY]: 'none',
            [TODOIST_TODO_PROJECT_ID_KEY]: '',
            [TODOIST_TODO_PROJECT_NAME_KEY]: TODOIST_DEFAULT_PROJECT_NAME
        });
        const provider = projectData[TODO_API_PROVIDER_KEY] || data[TODO_API_PROVIDER_KEY] || 'none';
        const token = typeof data[TODOIST_TODO_API_TOKEN_KEY] === 'string'
            ? data[TODOIST_TODO_API_TOKEN_KEY].trim()
            : '';
        let connected = false;
        if (provider === 'todoist' && token) {
            try {
                await todoistApiRequest('/projects?limit=1');
                connected = true;
            } catch {
                connected = false;
            }
        }
        sendResponse({
            success: true,
            provider,
            connected,
            listId: projectData[TODOIST_TODO_PROJECT_ID_KEY] || '',
            listName: projectData[TODOIST_TODO_PROJECT_NAME_KEY] || TODOIST_DEFAULT_PROJECT_NAME
        });
    } catch (error) {
        sendResponse({ success: false, error: extractErrorMessage(error, 'Failed to fetch Todoist status.') });
    }
}

async function handleTodoistTodoRunSync(message, sendResponse) {
    try {
        const mode = typeof message?.mode === 'string' ? message.mode : 'full';
        const trigger = typeof message?.trigger === 'string' ? message.trigger : 'manual';
        const localMutation = message?.localMutation && typeof message.localMutation === 'object'
            ? {
                localKey: typeof message.localMutation.localKey === 'string' ? message.localMutation.localKey : '',
            }
            : null;
        const result = await runTodoistTodoSync({ mode, trigger, localMutation });
        sendResponse(result);
    } catch (error) {
        uxDebugWarn('[WebClass UX] Todoist sync failed', error);
        sendResponse({ success: false, error: extractErrorMessage(error, 'Todoist sync failed.') });
    }
}

async function handleTickTickTodoConnect(sendResponse) {
    try {
        const settings = await getTickTickAuthSettings();

        const { clientId, clientSecret } = getTickTickOauthCredentials(settings);
        const projectName = (settings[TICKTICK_TODO_PROJECT_NAME_KEY] || TICKTICK_DEFAULT_PROJECT_NAME).trim()
            || TICKTICK_DEFAULT_PROJECT_NAME;

        const identityApi = chrome?.identity;
        const redirectUri = identityApi?.getRedirectURL
            ? identityApi.getRedirectURL('ticktick')
            : `https://${chrome.runtime.id}.chromiumapp.org/ticktick`;
        if (!identityApi?.launchWebAuthFlow) {
            throw new Error('chrome.identity.launchWebAuthFlow is unavailable.');
        }

        const state = randomString(24);
        const authorizeUrl = buildTickTickAuthorizeUrl({
            clientId,
            redirectUri,
            state
        });
        const expectedState = state;

        const callbackUrl = await new Promise((resolve, reject) => {
            identityApi.launchWebAuthFlow(
                {
                    url: authorizeUrl,
                    interactive: true
                },
                (redirectedTo) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    if (!redirectedTo) {
                        reject(new Error('Authorization was cancelled.'));
                        return;
                    }
                    resolve(redirectedTo);
                }
            );
        });

        const callback = new URL(callbackUrl);
        const callbackState = callback.searchParams.get('state') || '';
        if (!callbackState || callbackState !== expectedState) {
            throw new Error('OAuth state mismatch.');
        }

        const code = callback.searchParams.get('code');
        if (!code) {
            const oauthError = callback.searchParams.get('error_description')
                || callback.searchParams.get('error')
                || 'Failed to obtain authorization code.';
            throw new Error(oauthError);
        }

        const token = await exchangeTickTickAuthCode({
            clientId,
            clientSecret,
            code,
            redirectUri
        });
        const refreshToken = typeof token?.refresh_token === 'string' ? token.refresh_token.trim() : '';
        const sessionAuth = buildSessionAuthStateFromToken(
            token,
            TICKTICK_OAUTH_SCOPE,
            { allowMissingExpiry: true }
        );
        if (!sessionAuth) {
            throw new Error('TickTick access token was not returned.');
        }
        const encryptedClientSecret = await encryptSecureLocalString(clientSecret);

        await Promise.all([
            storageSet({
                [TODO_API_PROVIDER_KEY]: 'ticktick',
                [TICKTICK_TODO_AUTH_KEY]: null,
                [TICKTICK_TODO_AUTH_LOCAL_KEY]: await encodePersistedSessionAuth(sessionAuth),
                [TICKTICK_TODO_REFRESH_TOKEN_KEY]: refreshToken,
                [TICKTICK_TODO_PROJECT_NAME_KEY]: projectName,
                [TICKTICK_TODO_CLIENT_ID_KEY]: clientId,
                [TICKTICK_TODO_CLIENT_SECRET_KEY]: encryptedClientSecret
            }),
            storageSessionSet({
                [TICKTICK_TODO_AUTH_SESSION_KEY]: sessionAuth
            })
        ]);

        const projectInfo = await ensureTickTickDedicatedProject();
        sendResponse({
            success: true,
            connected: true,
            listId: projectInfo.id,
            listName: projectInfo.name
        });
    } catch (error) {
        await Promise.all([
            storageSet({
                [TODO_API_PROVIDER_KEY]: 'none',
                [TICKTICK_TODO_AUTH_KEY]: null,
                [TICKTICK_TODO_AUTH_LOCAL_KEY]: '',
                [TICKTICK_TODO_REFRESH_TOKEN_KEY]: '',
                [TICKTICK_TODO_PROJECT_ID_KEY]: '',
            }),
            storageSessionRemove([TICKTICK_TODO_AUTH_SESSION_KEY])
        ]);
        uxDebugWarn('[WebClass UX] TickTick connect failed', error);
        sendResponse({ success: false, error: extractErrorMessage(error, 'TickTick connection failed.') });
    }
}

async function handleTickTickTodoDisconnect(sendResponse) {
    try {
        await Promise.all([
            storageSet({
                [TODO_API_PROVIDER_KEY]: 'none',
                [TICKTICK_TODO_AUTH_KEY]: null,
                [TICKTICK_TODO_AUTH_LOCAL_KEY]: '',
                [TICKTICK_TODO_REFRESH_TOKEN_KEY]: '',
                [TICKTICK_TODO_PROJECT_ID_KEY]: '',
            }),
            storageSessionRemove([TICKTICK_TODO_AUTH_SESSION_KEY])
        ]);
        sendResponse({ success: true });
    } catch (error) {
        sendResponse({ success: false, error: extractErrorMessage(error, 'Failed to disconnect TickTick.') });
    }
}

async function handleTickTickTodoGetStatus(sendResponse) {
    try {
        const localData = await getTickTickAuthSettings();

        const provider = localData[TODO_API_PROVIDER_KEY] || 'none';
        const hasCredentials =
            typeof localData[TICKTICK_TODO_CLIENT_ID_KEY] === 'string'
            && localData[TICKTICK_TODO_CLIENT_ID_KEY].trim().length > 0
            && typeof localData[TICKTICK_TODO_CLIENT_SECRET_KEY] === 'string'
            && localData[TICKTICK_TODO_CLIENT_SECRET_KEY].trim().length > 0;
        const hasRefreshToken = typeof localData[TICKTICK_TODO_REFRESH_TOKEN_KEY] === 'string'
            && localData[TICKTICK_TODO_REFRESH_TOKEN_KEY].trim().length > 0;

        const sessionAuth = normalizeSessionAuthState(localData[TICKTICK_TODO_AUTH_SESSION_KEY]);
        const persistedAuth = parsePersistedSessionAuth(localData[TICKTICK_TODO_AUTH_LOCAL_KEY]);
        const connected = provider === 'ticktick'
            && hasCredentials
            && (isAuthTokenUsable(sessionAuth) || isAuthTokenUsable(persistedAuth) || hasRefreshToken);

        sendResponse({
            success: true,
            provider,
            connected,
            listId: localData[TICKTICK_TODO_PROJECT_ID_KEY] || '',
            listName: localData[TICKTICK_TODO_PROJECT_NAME_KEY] || TICKTICK_DEFAULT_PROJECT_NAME
        });
    } catch (error) {
        sendResponse({ success: false, error: extractErrorMessage(error, 'Failed to fetch TickTick status.') });
    }
}

async function handleTickTickTodoRunSync(message, sendResponse) {
    try {
        const mode = typeof message?.mode === 'string' ? message.mode : 'full';
        const trigger = typeof message?.trigger === 'string' ? message.trigger : 'manual';
        const localMutation = message?.localMutation && typeof message.localMutation === 'object'
            ? {
                localKey: typeof message.localMutation.localKey === 'string' ? message.localMutation.localKey : '',
            }
            : null;
        const result = await runTickTickTodoSync({ mode, trigger, localMutation });
        sendResponse(result);
    } catch (error) {
        uxDebugWarn('[WebClass UX] TickTick sync failed', error);
        sendResponse({ success: false, error: extractErrorMessage(error, 'TickTick sync failed.') });
    }
}

async function handleTodoApiRunSync(message, sendResponse) {
    try {
        const mode = typeof message?.mode === 'string' ? message.mode : 'full';
        const trigger = typeof message?.trigger === 'string' ? message.trigger : 'manual';
        const localMutation = message?.localMutation && typeof message.localMutation === 'object'
            ? {
                localKey: typeof message.localMutation.localKey === 'string' ? message.localMutation.localKey : '',
            }
            : null;
        const result = await runTodoApiSyncByProvider({ mode, trigger, localMutation });
        sendResponse(result);
    } catch (error) {
        uxDebugWarn('[WebClass UX] provider todo sync failed', error);
        sendResponse({ success: false, error: extractErrorMessage(error, 'ToDo API sync failed.') });
    }
}

function getTokyoDateParts(baseDate = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: TODO_SYNC_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
        hour12: false
    });
    const parts = Object.fromEntries(
        formatter.formatToParts(baseDate)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value])
    );
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        second: Number(parts.second),
        weekday: parts.weekday || '',
        key: `${parts.year}-${parts.month}-${parts.day}`
    };
}

function buildTokyoDateUtc(year, month, day, hour, minute = 0, second = 0) {
    return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second));
}

async function requestTodoSyncOnOpenHomeTab(payload) {
    const tabs = await chrome.tabs.query({ url: 'https://kulms.kanagawa-u.ac.jp/webclass/*' });
    const homeTabs = tabs
        .filter((tab) => isWebClassHomeUrl(tab.url) && typeof tab.id === 'number')
        .sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)));
    if (homeTabs.length === 0) {
        return { success: false, error: 'WebClass home tab was not found.' };
    }

    let lastError = 'Todo sync target tab was not found.';
    for (const tab of homeTabs) {
        const response = await sendMessageToTab(tab.id, {
            type: 'RUN_TODO_API_SYNC_FROM_BACKGROUND',
            ...payload
        });
        if (response?.success) {
            return { success: true, tabId: tab.id };
        }
        if (response?.error) {
            lastError = response.error;
        }
    }
    return { success: false, error: lastError };
}

async function handleTodoSyncAlarmTick() {
    const settings = await storageGet({
        [TODO_API_PROVIDER_KEY]: 'none',
        [MS_TODO_LAST_MANUAL_RELOAD_KEY]: '',
        [MS_TODO_LAST_MORNING_SYNC_DATE_KEY]: ''
    });
    if (settings[TODO_API_PROVIDER_KEY] === 'none') return;

    const now = new Date();
    const tokyo = getTokyoDateParts(now);
    const isWeekday = tokyo.weekday !== 'Sat' && tokyo.weekday !== 'Sun';
    const inWorkHourRange = isWeekday
        && tokyo.hour >= 9
        && tokyo.hour < 19
        && tokyo.minute % 10 === 0;

    const sevenAmTokyoUtc = buildTokyoDateUtc(tokyo.year, tokyo.month, tokyo.day, 7, 0, 0);
    const lastManualReloadRaw = settings[MS_TODO_LAST_MANUAL_RELOAD_KEY];
    const lastManualReload = lastManualReloadRaw ? new Date(lastManualReloadRaw) : null;
    const hasManualReloadSinceSeven = lastManualReload instanceof Date
        && !Number.isNaN(lastManualReload.getTime())
        && lastManualReload.getTime() >= sevenAmTokyoUtc.getTime();
    const morningSyncDoneToday = settings[MS_TODO_LAST_MORNING_SYNC_DATE_KEY] === tokyo.key;
    const shouldMorningSync = now.getTime() >= sevenAmTokyoUtc.getTime()
        && !hasManualReloadSinceSeven
        && !morningSyncDoneToday;

    if (!shouldMorningSync && !inWorkHourRange) return;

    const trigger = shouldMorningSync ? 'morning_7am' : 'workhour_10min';
    const response = await requestTodoSyncOnOpenHomeTab({
        trigger,
        mode: 'full',
        forceRemoteReload: true
    });
    if (response.success && shouldMorningSync) {
        await storageSet({ [MS_TODO_LAST_MORNING_SYNC_DATE_KEY]: tokyo.key });
    }
}

function ensureTodoSyncAlarmRegistered() {
    if (!chrome?.alarms?.create) {
        uxDebugWarn('[WebClass UX] chrome.alarms API is unavailable; periodic ToDo sync is disabled.');
        return;
    }
    chrome.alarms.create(TODO_SYNC_ALARM_NAME, {
        periodInMinutes: TODO_SYNC_ALARM_PERIOD_MINUTES
    });
}

chrome.runtime.onInstalled.addListener(() => {
    ensureTodoSyncAlarmRegistered();
    ensureExtensionUpdateAlarmRegistered();
    checkForExtensionUpdate({ force: true }).catch((error) => {
        uxDebugWarn('[WebClass UX] extension update check on install failed', error);
    });
});

chrome.runtime.onStartup.addListener(() => {
    ensureTodoSyncAlarmRegistered();
    ensureExtensionUpdateAlarmRegistered();
    checkForExtensionUpdate().catch((error) => {
        uxDebugWarn('[WebClass UX] extension update check on startup failed', error);
    });
});

if (chrome?.alarms?.onAlarm?.addListener) {
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (!alarm?.name) return;
        if (alarm.name === TODO_SYNC_ALARM_NAME) {
            handleTodoSyncAlarmTick().catch((error) => {
                uxDebugWarn('[WebClass UX] todo sync alarm failed', error);
            });
            return;
        }
        if (alarm.name === EXTENSION_UPDATE_ALARM_NAME) {
            checkForExtensionUpdate().catch((error) => {
                uxDebugWarn('[WebClass UX] extension update alarm failed', error);
            });
        }
    });
} else {
    uxDebugWarn('[WebClass UX] chrome.alarms.onAlarm API is unavailable; skipping alarm listener registration.');
}

ensureTodoSyncAlarmRegistered();
ensureExtensionUpdateAlarmRegistered();
checkForExtensionUpdate().catch((error) => {
    uxDebugWarn('[WebClass UX] initial extension update check failed', error);
});

if (chrome?.notifications?.onClicked?.addListener) {
    chrome.notifications.onClicked.addListener((notificationId) => {
        if (notificationId !== EXTENSION_UPDATE_NOTIFICATION_ID) return;
        clearExtensionUpdateNotification();
        if (chrome.runtime?.openOptionsPage) {
            chrome.runtime.openOptionsPage(() => {
                void chrome.runtime?.lastError;
            });
            return;
        }
        chrome.tabs.create({ url: chrome.runtime.getURL('src/options.html') }, () => {
            void chrome.runtime?.lastError;
        });
    });
}

if (chrome?.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes[EXTENSION_UPDATE_CHECK_ENABLED_KEY]) return;
        const enabled = changes[EXTENSION_UPDATE_CHECK_ENABLED_KEY].newValue !== false;
        if (!enabled) {
            setExtensionUpdateBadge(false);
            clearExtensionUpdateNotification();
            return;
        }
        checkForExtensionUpdate({ force: true }).catch((error) => {
            uxDebugWarn('[WebClass UX] extension update check after enabling failed', error);
        });
    });
}

// ============================================================
// OpenAI Course Name Shortening
// ============================================================

function normalizeCourseNameKey(fullName, courseId) {
    const trimmed = (fullName || '').trim();
    if (courseId) {
        return `${courseId}::${trimmed}`;
    }
    return trimmed;
}

function sanitizeShortCourseName(text) {
    if (!text) return '';
    let cleaned = String(text).trim();
    cleaned = cleaned.replace(/^[\"']+/, '').replace(/[\"']+$/, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
}

function extractOpenAiOutputText(data) {
    if (!data) return '';
    if (typeof data.output_text === 'string' && data.output_text.trim()) {
        return data.output_text.trim();
    }
    const outputs = Array.isArray(data.output) ? data.output : [];
    const texts = [];
    for (const item of outputs) {
        if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
        for (const content of item.content) {
            if (content?.type === 'output_text' && typeof content.text === 'string') {
                texts.push(content.text);
            }
        }
    }
    return texts.join('\n').trim();
}

async function updateOpenAiCourseNameCache(cacheKey, shortName) {
    const data = await new Promise(resolve => {
        chrome.storage.local.get({ [OPENAI_COURSE_CACHE_KEY]: {} }, resolve);
    });
    const cache = { ...(data[OPENAI_COURSE_CACHE_KEY] || {}) };
    cache[cacheKey] = shortName;
    await new Promise(resolve => {
        chrome.storage.local.set({ [OPENAI_COURSE_CACHE_KEY]: cache }, resolve);
    });
    return cache;
}

async function callOpenAiForCourseName(fullName, model, apiKey) {
    const body = {
        model: model || OPENAI_DEFAULT_MODEL,
        instructions: OPENAI_COURSE_NAME_INSTRUCTIONS,
        input: `Original course name:\n${fullName}`,
        temperature: 0.2,
        max_output_tokens: 40,
        text: { format: { type: 'text' } },
        store: false
    };

    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const outputText = extractOpenAiOutputText(data);
    return sanitizeShortCourseName(outputText);
}

async function callGroqForCourseName(fullName, model, apiKey) {
    const body = {
        model: model || GROQ_DEFAULT_MODEL,
        messages: [
            { role: 'system', content: OPENAI_COURSE_NAME_INSTRUCTIONS },
            { role: 'user', content: `Original course name:\n${fullName}` }
        ],
        temperature: 0.2,
        max_completion_tokens: 40
    };

    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return sanitizeShortCourseName(content);
}

async function handleOpenAiCourseNameShorten(message, sendResponse) {
    try {
        const fullName = typeof message.fullName === 'string' ? message.fullName.trim() : '';
        const courseId = typeof message.courseId === 'string' ? message.courseId.trim() : '';

        if (!fullName) {
            sendResponse({ success: false, error: 'Course name is empty' });
            return;
        }

        const [settings, sessionSecrets] = await Promise.all([
            new Promise(resolve => {
                chrome.storage.local.get({
                    useLlmCourseNameEnabled: null,
                    openaiCourseNameEnabled: false,
                    courseNameProvider: 'openai',
                    openaiApiKey: '',
                    openaiCourseNameModel: OPENAI_DEFAULT_MODEL,
                    groqApiKey: '',
                    groqCourseNameModel: GROQ_DEFAULT_MODEL,
                    [OPENAI_COURSE_CACHE_KEY]: {}
                }, resolve);
            }),
            storageSessionGet({
                openaiApiKey: '',
                groqApiKey: ''
            })
        ]);

        const openaiApiKey = (sessionSecrets.openaiApiKey || settings.openaiApiKey || '').trim();
        const groqApiKey = (sessionSecrets.groqApiKey || settings.groqApiKey || '').trim();
        if ((!sessionSecrets.openaiApiKey && settings.openaiApiKey) || (!sessionSecrets.groqApiKey && settings.groqApiKey)) {
            await Promise.all([
                storageSessionSet({
                    openaiApiKey,
                    groqApiKey
                }),
                storageSet({
                    openaiApiKey: '',
                    groqApiKey: ''
                })
            ]);
        }

        const llmEnabled = (settings.useLlmCourseNameEnabled === null || settings.useLlmCourseNameEnabled === undefined)
            ? !!settings.openaiCourseNameEnabled
            : settings.useLlmCourseNameEnabled;
        const provider = settings.courseNameProvider || 'openai';

        if (!llmEnabled) {
            sendResponse({ success: false, error: 'LLM course name shortening is disabled' });
            return;
        }

        if (provider === 'groq') {
            if (!groqApiKey) {
                sendResponse({ success: false, error: 'Groq API key is missing' });
                return;
            }
        } else {
            if (!openaiApiKey) {
                sendResponse({ success: false, error: 'OpenAI API key is missing' });
                return;
            }
        }

        const cacheKey = normalizeCourseNameKey(fullName, courseId);
        const cache = settings[OPENAI_COURSE_CACHE_KEY] || {};
        const cachedValue = cache[cacheKey];
        if (cachedValue) {
            sendResponse({ success: true, shortName: cachedValue, cached: true });
            return;
        }

        if (openaiCourseNameInFlight.has(cacheKey)) {
            const result = await openaiCourseNameInFlight.get(cacheKey);
            sendResponse(result);
            return;
        }

        const requestPromise = (async () => {
            const shortName = provider === 'groq'
                ? await callGroqForCourseName(fullName, settings.groqCourseNameModel, groqApiKey)
                : await callOpenAiForCourseName(fullName, settings.openaiCourseNameModel, openaiApiKey);
            if (!shortName) {
                return { success: false, error: 'LLM returned empty output' };
            }
            await updateOpenAiCourseNameCache(cacheKey, shortName);
            return { success: true, shortName, cached: false };
        })();

        openaiCourseNameInFlight.set(cacheKey, requestPromise);
        try {
            const result = await requestPromise;
            sendResponse(result);
        } finally {
            openaiCourseNameInFlight.delete(cacheKey);
        }
    } catch (error) {
        console.error('[WebClass UX] LLM course name error:', error);
        sendResponse({ success: false, error: error.message || 'Unknown error' });
    }
}

/**
 * Open WebClass PDF in a viewer tab for manual page extraction.
 * @param {Object} message
 * @param {Object} sender
 * @param {Function} sendResponse
 */
async function handleConvertPdfToImages(message, sender, sendResponse) {
    const { url, baseFileName } = message;

    uxDebugLog('[WebClass UX] Convert PDF to images request:', { url, baseFileName });

    try {
        // Build the PDF viewer URL through WebClass loadit.php.
        let pdfViewerUrl;

        // Normalize relative links to absolute WebClass URLs.
        let absoluteUrl = url;
        if (!url.startsWith('http')) {
            absoluteUrl = 'https://kulms.kanagawa-u.ac.jp' + (url.startsWith('/') ? '' : '/') + url;
        }

        const encodedUrl = encodeURIComponent(absoluteUrl);
        pdfViewerUrl = `https://kulms.kanagawa-u.ac.jp/webclass/loadit.php?file=${encodedUrl}`;

        // Open a new tab with the PDF viewer.
        const tab = await chrome.tabs.create({
            url: pdfViewerUrl,
            active: true
        });

        // Extraction is performed from the PDF viewer tab by user action.
        // Return success once the viewer tab has been opened.
        sendResponse({
            success: true,
            message: 'PDF viewer was opened. Use the "Extract pages" button in the viewer tab.',
            tabId: tab.id
        });

    } catch (error) {
        console.error('[WebClass UX] Error converting PDF:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

/**
 * Download a blob/object URL via the Chrome downloads API.
 * @param {Object} sender
 * @param {Function} sendResponse
 */
async function handleDownloadBlob(message, sender, sendResponse) {
    const { url, filename } = message;

    uxDebugLog('[WebClass UX] Blob download request:', { url, filename });

    try {
        const downloadOptions = {
            url: url,
            filename: filename,
            saveAs: false
        };

        chrome.downloads.download(downloadOptions, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error('[WebClass UX] Blob download error:', chrome.runtime.lastError);
                sendResponse({
                    success: false,
                    error: chrome.runtime.lastError.message
                });
                return;
            }

            uxDebugLog('[WebClass UX] Blob download started:', downloadId);
            sendResponse({
                success: true,
                downloadId: downloadId
            });
        });

    } catch (error) {
        console.error('[WebClass UX] Error handling blob download:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

/**
 * Download a file URL and optionally apply a custom filename.
 * @param {Object} sender
 * @param {Function} sendResponse
 */
async function handleDownloadFile(message, sender, sendResponse) {
    const { url, filename, rename } = message;

    uxDebugLog('[WebClass UX] Download request:', { url, filename, rename });

    try {
        let absoluteUrl = url;
        if (!url.startsWith('http')) {
            if (sender.tab && sender.tab.url) {
                const baseUrl = new URL(sender.tab.url);
                absoluteUrl = new URL(url, baseUrl.origin).href;
            } else {
                absoluteUrl = 'https://kulms.kanagawa-u.ac.jp' + (url.startsWith('/') ? '' : '/') + url;
            }
        }

        if (rename && filename) {
            urlToFilename.set(absoluteUrl, filename);
            urlToFilename.set(url, filename);
        }

        const downloadOptions = {
            url: absoluteUrl,
            saveAs: false
        };

        if (rename && filename) {
            downloadOptions.filename = filename;
        }

        chrome.downloads.download(downloadOptions, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error('[WebClass UX] Download error:', chrome.runtime.lastError);
                sendResponse({
                    success: false,
                    error: chrome.runtime.lastError.message
                });
                return;
            }

            uxDebugLog('[WebClass UX] Download started:', downloadId);

            if (rename && filename) {
                pendingDownloads.set(downloadId, { filename, rename: true });
            }

            sendResponse({
                success: true,
                downloadId: downloadId
            });
        });

    } catch (error) {
        console.error('[WebClass UX] Error handling download:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

// ============================================================
// Message Router
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message?.type) return false;

    switch (message.type) {
        case 'GET_AUTO_LOGIN_SETTINGS':
            handleGetAutoLoginSettings(sendResponse);
            return true;
        case 'MICROSOFT_TODO_CONNECT':
            handleMicrosoftTodoConnect(sendResponse);
            return true;
        case 'MICROSOFT_TODO_DISCONNECT':
            handleMicrosoftTodoDisconnect(sendResponse);
            return true;
        case 'MICROSOFT_TODO_GET_STATUS':
            handleMicrosoftTodoGetStatus(sendResponse);
            return true;
        case 'GOOGLE_TODO_CONNECT':
            handleGoogleTodoConnect(sendResponse);
            return true;
        case 'GOOGLE_TODO_DISCONNECT':
            handleGoogleTodoDisconnect(sendResponse);
            return true;
        case 'GOOGLE_TODO_GET_STATUS':
            handleGoogleTodoGetStatus(sendResponse);
            return true;
        case 'TODOIST_TODO_CONNECT':
            handleTodoistTodoConnect(sendResponse);
            return true;
        case 'TODOIST_TODO_DISCONNECT':
            handleTodoistTodoDisconnect(sendResponse);
            return true;
        case 'TODOIST_TODO_GET_STATUS':
            handleTodoistTodoGetStatus(sendResponse);
            return true;
        case 'TICKTICK_TODO_CONNECT':
            handleTickTickTodoConnect(sendResponse);
            return true;
        case 'TICKTICK_TODO_DISCONNECT':
            handleTickTickTodoDisconnect(sendResponse);
            return true;
        case 'TICKTICK_TODO_GET_STATUS':
            handleTickTickTodoGetStatus(sendResponse);
            return true;
        case 'TODO_API_RUN_SYNC':
            handleTodoApiRunSync(message, sendResponse);
            return true;
        case 'OPENAI_SHORTEN_COURSE_NAME':
            handleOpenAiCourseNameShorten(message, sendResponse);
            return true;
        case 'CONVERT_PDF_TO_IMAGES':
            handleConvertPdfToImages(message, sender, sendResponse);
            return true;
        case 'DOWNLOAD_BLOB':
            handleDownloadBlob(message, sender, sendResponse);
            return true;
        case 'DOWNLOAD_FILE':
            handleDownloadFile(message, sender, sendResponse);
            return true;
        case 'GET_EXTENSION_UPDATE_STATUS':
            readExtensionUpdateStatus()
                .then((status) => {
                    sendResponse({ success: true, status });
                })
                .catch((error) => {
                    sendResponse({ success: false, error: error?.message || 'Failed to read update status.' });
                });
            return true;
        case 'CHECK_EXTENSION_UPDATE_NOW':
            checkForExtensionUpdate({ force: true })
                .then((status) => {
                    sendResponse({ success: true, status });
                })
                .catch((error) => {
                    sendResponse({ success: false, error: error?.message || 'Failed to check updates.' });
                });
            return true;
        case 'SHOW_EXTENSION_UPDATE_NOTIFICATION_PREVIEW':
            showExtensionUpdateNotificationPreview()
                .then(() => {
                    sendResponse({ success: true });
                })
                .catch((error) => {
                    sendResponse({ success: false, error: error?.message || 'Failed to show update preview.' });
                });
            return true;
        case 'OPEN_OPTIONS_PAGE_FALLBACK':
            if (chrome.runtime?.openOptionsPage) {
                chrome.runtime.openOptionsPage(() => {
                    if (chrome.runtime.lastError) {
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                        return;
                    }
                    sendResponse({ success: true });
                });
                return true;
            }
            chrome.tabs.create({ url: chrome.runtime.getURL('src/options.html') }, (tab) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    return;
                }
                sendResponse({ success: Boolean(tab?.id) });
            });
            return true;
        case 'RUN_DASHBOARD_COURSE_NAME_CONVERSION_FROM_OPTIONS':
            chrome.tabs.query({ url: 'https://kulms.kanagawa-u.ac.jp/webclass/*' }, (tabs) => {
                if (!tabs?.length) {
                    sendResponse({ success: false, error: 'WebClass のタブが見つかりません。' });
                    return;
                }
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'RUN_DASHBOARD_COURSE_NAME_CONVERSION'
                }, (resp) => {
                    if (chrome.runtime.lastError) {
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                        return;
                    }
                    sendResponse(resp || { success: false, error: '応答がありませんでした。' });
                });
            });
            return true;
        default:
            return false;
    }
});

// ============================================================
// Download Filename Determination
// ============================================================

/**
 * Rename downloads using pending requests or URL-to-filename mapping.
 */
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    uxDebugLog('[WebClass UX] Determining filename for:', {
        id: downloadItem.id,
        url: downloadItem.url,
        finalUrl: downloadItem.finalUrl,
        filename: downloadItem.filename
    });

    const pending = pendingDownloads.get(downloadItem.id);
    if (pending && pending.rename && pending.filename) {
        uxDebugLog('[WebClass UX] Using pending filename:', pending.filename);
        suggest({
            filename: pending.filename,
            conflictAction: 'uniquify'
        });
        pendingDownloads.delete(downloadItem.id);
        return true;
    }

    let matchedFilename = null;

    // Try exact URL mappings first, then fallback to partial matching.
    if (urlToFilename.has(downloadItem.url)) {
        matchedFilename = urlToFilename.get(downloadItem.url);
    } else if (urlToFilename.has(downloadItem.finalUrl)) {
        matchedFilename = urlToFilename.get(downloadItem.finalUrl);
    } else {
        for (const [url, filename] of urlToFilename) {
            if (downloadItem.url.includes(url) ||
                downloadItem.finalUrl?.includes(url) ||
                url.includes(downloadItem.url)) {
                matchedFilename = filename;
                break;
            }
        }
    }

    if (matchedFilename) {
        uxDebugLog('[WebClass UX] Using mapped filename:', matchedFilename);
        suggest({
            filename: matchedFilename,
            conflictAction: 'uniquify'
        });

        // Clean up mapping after applying the filename.
        urlToFilename.delete(downloadItem.url);
        urlToFilename.delete(downloadItem.finalUrl);

        return true;
    }

    uxDebugLog('[WebClass UX] No rename mapping found, using default');
    suggest();
    return true;
});

// ============================================================
// Download State Change Listener
// ============================================================

chrome.downloads.onChanged.addListener((downloadDelta) => {
    if (downloadDelta.state) {
        uxDebugLog('[WebClass UX] Download state changed:', {
            id: downloadDelta.id,
            state: downloadDelta.state.current
        });

        // Remove stale pending entries when download finishes or fails.
        if (downloadDelta.state.current === 'complete' ||
            downloadDelta.state.current === 'interrupted') {
            pendingDownloads.delete(downloadDelta.id);
        }
    }
});

// ============================================================
// Periodic Cleanup
// ============================================================


setInterval(() => {
    if (pendingDownloads.size > 100) {
        uxDebugLog('[WebClass UX] Cleaning up pending downloads');
        pendingDownloads.clear();
    }

    if (urlToFilename.size > 50) {
        uxDebugLog('[WebClass UX] Cleaning up URL mappings');
        urlToFilename.clear();
    }
}, 5 * 60 * 1000);

async function clearLegacyGatewayArtifacts() {
    try {
        await Promise.all([
            storageSet({
                ticktickTodoGatewayBaseUrl: '',
                ticktickTodoGatewayApiKey: '',
                msTodoRefreshVaultId: '',
                msTodoVaultSessionToken: '',
                ticktickTodoRefreshVaultId: '',
                ticktickTodoVaultSessionToken: ''
            }),
            storageSessionRemove([
                'ticktickTodoGatewayApiKeySession',
                'ticktickTodoGatewaySigningKeySession'
            ])
        ]);
    } catch (error) {
        uxDebugWarn('[WebClass UX] failed to clear legacy gateway artifacts', error);
    }
}

clearLegacyGatewayArtifacts();

uxDebugLog('[WebClass UX] Background script ready');
