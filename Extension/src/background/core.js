// background/core.js
// Background dependencies, secure storage, sender validation, and update checks.

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
const getAssignmentSyncIdentityCandidates = typeof todoSyncIdentityApi.getAssignmentSyncIdentityCandidates === 'function'
    ? todoSyncIdentityApi.getAssignmentSyncIdentityCandidates
    : ((assignment) => {
        const identity = getAssignmentSyncIdentity(assignment);
        return identity?.stableId ? [identity] : [];
    });
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
const TRUSTED_WEBCLASS_ORIGINS = new Set([
    'https://kulms.kanagawa-u.ac.jp',
    'http://127.0.0.1',
    'http://localhost'
]);

function isTrustedWebClassUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl) {
        return false;
    }

    try {
        const parsedUrl = new URL(rawUrl);
        return TRUSTED_WEBCLASS_ORIGINS.has(parsedUrl.origin)
            && parsedUrl.pathname.startsWith('/webclass/');
    } catch {
        return false;
    }
}

function isTrustedWebClassSender(sender) {
    return isTrustedWebClassUrl(sender?.url)
        || isTrustedWebClassUrl(sender?.tab?.url);
}

function isTrustedExtensionPageUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl) {
        return false;
    }

    try {
        const parsedUrl = new URL(rawUrl);
        return parsedUrl.protocol === 'chrome-extension:'
            && parsedUrl.hostname === chrome.runtime.id;
    } catch {
        return false;
    }
}

function isTrustedRuntimeMessageSender(sender) {
    return isTrustedWebClassSender(sender)
        || isTrustedExtensionPageUrl(sender?.url);
}

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

function handleGetAutoLoginSettings(sender, sendResponse) {
    if (!isTrustedWebClassSender(sender)) {
        sendResponse({
            success: true,
            settings: {
                autoLoginEnabled: false,
                username: '',
                password: ''
            }
        });
        return;
    }

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
    const semverMatch = trimmed.match(/(\d+(?:\.\d+){0,2})/);
    return semverMatch ? semverMatch[1] : '';
}

function compareVersions(left, right) {
    const leftParts = normalizeReleaseVersion(left).split('.').map(part => parseInt(part, 10));
    const rightParts = normalizeReleaseVersion(right).split('.').map(part => parseInt(part, 10));
    const maxLength = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < maxLength; index += 1) {
        const leftNumber = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
        const rightNumber = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
        if (leftNumber !== rightNumber) {
            return leftNumber > rightNumber ? 1 : -1;
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
