// shared.js
// Shared constants, state, and utilities loaded on all WebClass pages.
// Included as the first js file within each content_scripts entry.
// Uses var/function so it can safely be loaded multiple times on the same page.

var uxDebugModeState = globalThis.uxDebugModeState || { enabled: false };
globalThis.uxDebugModeState = uxDebugModeState;
var uxDebugModeListeners = globalThis.uxDebugModeListeners || new Set();
globalThis.uxDebugModeListeners = uxDebugModeListeners;
var uxDebugModeStorageRevision = globalThis.uxDebugModeStorageRevision || 0;
globalThis.uxDebugModeStorageRevision = uxDebugModeStorageRevision;

var STORAGE_KEY_EXTENSION_VISUAL_ENABLED = 'extensionVisualEnabled';
var PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED = 'webclass_ux_master_enabled';
var UX_MESSAGE_BADGE_STORAGE_KEY = 'webclass_messages';
var UX_MESSAGE_BADGE_STORAGE_VERSION = 2;
var UX_SESSION_EXPIRED_POPUP_ID = 'webclass-ux-session-expired-popup';
var UX_SESSION_EXPIRED_STYLE_ID = 'webclass-ux-session-expired-style';

if (!globalThis.uxThemeInitialized) {
    globalThis.uxThemeInitialized = true;
    const themeMedia = matchMedia('(prefers-color-scheme: dark)');
    const themeTransitionClass = 'ux-theme-transitioning';
    const themeTransitionDurationMs = 1000;
    let appearanceTheme = 'light';
    let themeTransitionTimer = null;
    const applyAppearanceTheme = (animate = false) => {
        const root = document.documentElement;
        if (!root) return;
        const dark = appearanceTheme === 'dark'
            || (appearanceTheme === 'system' && themeMedia.matches);
        const nextTheme = dark ? 'dark' : 'light';
        if (root.dataset.uxTheme === nextTheme) return;

        if (animate && ['light', 'dark'].includes(root.dataset.uxTheme)) {
            root.classList.add(themeTransitionClass);
            clearTimeout(themeTransitionTimer);
            themeTransitionTimer = setTimeout(() => {
                root.classList.remove(themeTransitionClass);
                themeTransitionTimer = null;
            }, themeTransitionDurationMs);
        }

        root.dataset.uxTheme = nextTheme;
    };

    chrome.storage.local.get({ appearanceTheme: 'light' }, (items) => {
        appearanceTheme = ['light', 'dark', 'system'].includes(items.appearanceTheme)
            ? items.appearanceTheme
            : 'light';
        applyAppearanceTheme();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.appearanceTheme) return;
        appearanceTheme = changes.appearanceTheme.newValue;
        applyAppearanceTheme(true);
    });
    themeMedia.addEventListener('change', () => applyAppearanceTheme(true));
    document.addEventListener('DOMContentLoaded', applyAppearanceTheme, { once: true });
    window.addEventListener('load', applyAppearanceTheme, { once: true });
}

// Shared compact language-change icon used by the course and home headers.
var UX_LANGUAGE_CHANGE_ICON_MARKUP = `
  <path d="m2 11 4-9 4 9M3.3 8h5.4"></path>
  <path d="M21 9V7a2 2 0 0 0-2-2h-5m2.5-2.5L14 5l2.5 2.5"></path>
  <path d="M3 15v2a2 2 0 0 0 2 2h5m-2.5-2.5L10 19l-2.5 2.5"></path>
  <path d="M17.5 12v2M13 14h9M20 14c-.8 4-3.2 6.5-7 8M15 16c1.2 2.8 3.5 4.8 7 6"></path>
`;

function normalizeUxMessageUnreadCount(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.floor(value));
    }

    const text = String(value ?? '').replace(/,/g, '').trim();
    if (!text) return null;

    const match = text.match(/\d+/);
    if (!match) return null;
    return Math.max(0, Number.parseInt(match[0], 10));
}

function getUxInboxUnreadMessageCount(doc = document) {
    const table = doc?.querySelector?.('#MsgListTable');
    if (!table) return null;

    return Array.from(table.querySelectorAll('tbody tr'))
        .filter((row) => row.querySelector('b') !== null)
        .length;
}

async function fetchUxInboxUnreadMessageCount(messageUrl) {
    if (!messageUrl || typeof fetch !== 'function' || typeof DOMParser !== 'function') {
        return null;
    }

    try {
        const response = await fetch(messageUrl, { credentials: 'same-origin' });
        if (!response.ok) return null;

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return getUxInboxUnreadMessageCount(doc);
    } catch {
        return null;
    }
}

async function getUxStoredMessageUnreadState(fallback = null) {
    try {
        const data = await chrome.storage.local.get([UX_MESSAGE_BADGE_STORAGE_KEY]);
        const state = data?.[UX_MESSAGE_BADGE_STORAGE_KEY];
        return state && typeof state === 'object' ? state : fallback;
    } catch {
        return fallback;
    }
}

async function setUxStoredMessageUnreadCount(unreadCount, metadata = {}) {
    const normalizedCount = normalizeUxMessageUnreadCount(unreadCount);
    if (normalizedCount === null) return false;

    try {
        const existing = await chrome.storage.local.get([UX_MESSAGE_BADGE_STORAGE_KEY]);
        const previous = existing?.[UX_MESSAGE_BADGE_STORAGE_KEY];
        const nextState = previous && typeof previous === 'object' ? previous : {};
        await chrome.storage.local.set({
            [UX_MESSAGE_BADGE_STORAGE_KEY]: {
                ...nextState,
                ...metadata,
                version: UX_MESSAGE_BADGE_STORAGE_VERSION,
                unreadCount: normalizedCount,
                fetchedAt: new Date().toISOString(),
            },
        });
        return true;
    } catch {
        return false;
    }
}

function onUxMessageUnreadCountChange(listener) {
    if (typeof listener !== 'function') return () => { };

    const handleChange = (changes, areaName) => {
        if (areaName !== 'local' || !changes?.[UX_MESSAGE_BADGE_STORAGE_KEY]) return;
        const nextCount = normalizeUxMessageUnreadCount(
            changes[UX_MESSAGE_BADGE_STORAGE_KEY].newValue?.unreadCount,
        );
        try {
            listener(nextCount);
        } catch { }
    };

    try {
        chrome.storage.onChanged.addListener(handleChange);
        return () => {
            try {
                chrome.storage.onChanged.removeListener(handleChange);
            } catch { }
        };
    } catch {
        return () => { };
    }
}

function syncUxMasterStateToPage(enabled) {
    var normalized = enabled ? '1' : '0';
    try {
        if (document && document.documentElement) {
            document.documentElement.dataset.webclassUxMasterEnabled = normalized;
        }
    } catch { }
    try {
        localStorage.setItem(PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED, normalized);
    } catch { }
}

function setUxDebugModeEnabled(enabled) {
    var nextEnabled = !!enabled;
    var didChange = uxDebugModeState.enabled !== nextEnabled;
    uxDebugModeState.enabled = nextEnabled;
    try {
        if (document && document.documentElement) {
            document.documentElement.dataset.webclassUxDebugMode = uxDebugModeState.enabled ? '1' : '0';
        }
    } catch { }
    if (didChange) {
        uxDebugModeListeners.forEach((listener) => {
            try {
                listener(uxDebugModeState.enabled);
            } catch { }
        });
    }
}

function onUxSharedDebugModeChange(listener) {
    if (typeof listener !== 'function') return () => { };
    uxDebugModeListeners.add(listener);
    try {
        listener(uxDebugModeState.enabled);
    } catch { }
    return () => uxDebugModeListeners.delete(listener);
}

function initializeUxSharedState() {
    if (globalThis.__webclassUxSharedStateInitialized) return;
    globalThis.__webclassUxSharedStateInitialized = true;

    try {
        chrome.storage.local.get({
            debugModeEnabled: false,
            [STORAGE_KEY_EXTENSION_VISUAL_ENABLED]: true
        }, (items) => {
            if (uxDebugModeStorageRevision > 0) return;
            setUxDebugModeEnabled(items.debugModeEnabled);
            syncUxMasterStateToPage(items[STORAGE_KEY_EXTENSION_VISUAL_ENABLED] !== false);
        });

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;
            if (Object.prototype.hasOwnProperty.call(changes, 'debugModeEnabled')) {
                uxDebugModeStorageRevision += 1;
                globalThis.uxDebugModeStorageRevision = uxDebugModeStorageRevision;
                setUxDebugModeEnabled(changes.debugModeEnabled.newValue);
            }
            if (changes[STORAGE_KEY_EXTENSION_VISUAL_ENABLED]) {
                syncUxMasterStateToPage(
                    changes[STORAGE_KEY_EXTENSION_VISUAL_ENABLED].newValue !== false
                );
            }
        });
    } catch {
        setUxDebugModeEnabled(false);
        syncUxMasterStateToPage(true);
    }
}

initializeUxSharedState();

function uxDebugLog(...args) {
    if (!uxDebugModeState.enabled) return;
    console.log(...args);
}

function uxDebugWarn(...args) {
    if (!uxDebugModeState.enabled) return;
    console.warn(...args);
}

function getUxTopDocument() {
    try {
        if (window.top && window.top.document) {
            return window.top.document;
        }
    } catch { }
    return document;
}

function ensureUxSessionExpiredStyles(targetDocument) {
    if (targetDocument.getElementById(UX_SESSION_EXPIRED_STYLE_ID)) return;

    var style = targetDocument.createElement('style');
    style.id = UX_SESSION_EXPIRED_STYLE_ID;
    style.textContent = `
        #${UX_SESSION_EXPIRED_POPUP_ID} {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            display: flex !important;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            padding: 24px;
            background: rgba(15, 23, 42, 0.48);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        #${UX_SESSION_EXPIRED_POPUP_ID} .webclass-ux-session-dialog {
            width: min(100%, 420px);
            box-sizing: border-box;
            padding: 28px;
            border: 1px solid rgba(148, 163, 184, 0.35);
            border-radius: 16px;
            background: #ffffff;
            color: #0f172a;
            text-align: center;
        }
        #${UX_SESSION_EXPIRED_POPUP_ID} .webclass-ux-session-icon {
            display: grid;
            width: 48px;
            height: 48px;
            margin: 0 auto 16px;
            place-items: center;
            border-radius: 50%;
            background: #fef3c7;
            color: #92400e;
            font-size: 26px;
            line-height: 1;
        }
        #${UX_SESSION_EXPIRED_POPUP_ID} h2 {
            margin: 0 0 8px;
            color: #0f172a;
            font-size: 20px;
            font-weight: 700;
            line-height: 1.4;
        }
        #${UX_SESSION_EXPIRED_POPUP_ID} p {
            margin: 0 0 22px;
            color: #475569;
            font-size: 14px;
            line-height: 1.7;
        }
        #${UX_SESSION_EXPIRED_POPUP_ID} button {
            width: 100%;
            min-height: 44px;
            padding: 10px 18px;
            border: 0;
            border-radius: 10px;
            background: #2563eb;
            color: #ffffff;
            cursor: pointer;
            font: inherit;
            font-size: 15px;
            font-weight: 700;
        }
        #${UX_SESSION_EXPIRED_POPUP_ID} button:hover {
            background: #1d4ed8;
        }
        #${UX_SESSION_EXPIRED_POPUP_ID} button:focus-visible {
            outline: 3px solid rgba(37, 99, 235, 0.35);
            outline-offset: 3px;
        }
        @media (prefers-color-scheme: dark) {
            #${UX_SESSION_EXPIRED_POPUP_ID} .webclass-ux-session-dialog {
                border-color: #334155;
                background: #1e293b;
                color: #f8fafc;
            }
            #${UX_SESSION_EXPIRED_POPUP_ID} h2 { color: #f8fafc; }
            #${UX_SESSION_EXPIRED_POPUP_ID} p { color: #cbd5e1; }
        }
    `;
    (targetDocument.head || targetDocument.documentElement).appendChild(style);
}

function showUxSessionExpiredPopup() {
    var targetDocument = getUxTopDocument();
    var existingPopup = targetDocument.getElementById(UX_SESSION_EXPIRED_POPUP_ID);
    if (existingPopup) {
        existingPopup.querySelector('button')?.focus();
        return existingPopup;
    }

    ensureUxSessionExpiredStyles(targetDocument);

    var overlay = targetDocument.createElement('div');
    overlay.id = UX_SESSION_EXPIRED_POPUP_ID;
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'webclass-ux-session-expired-title');
    overlay.setAttribute('aria-describedby', 'webclass-ux-session-expired-description');

    var dialog = targetDocument.createElement('div');
    dialog.className = 'webclass-ux-session-dialog';

    var icon = targetDocument.createElement('div');
    icon.className = 'webclass-ux-session-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '!';

    var title = targetDocument.createElement('h2');
    title.id = 'webclass-ux-session-expired-title';
    title.textContent = 'セッションの有効期限が切れました';

    var description = targetDocument.createElement('p');
    description.id = 'webclass-ux-session-expired-description';
    description.textContent = 'ページを再読み込みして、WebClassに再接続してください。';

    var reloadButton = targetDocument.createElement('button');
    reloadButton.type = 'button';
    reloadButton.textContent = '再読み込み';
    reloadButton.addEventListener('click', () => {
        reloadButton.disabled = true;
        reloadButton.textContent = '再読み込み中...';
        try {
            window.top.location.reload();
        } catch {
            window.location.reload();
        }
    });

    dialog.append(icon, title, description, reloadButton);
    overlay.appendChild(dialog);
    (targetDocument.body || targetDocument.documentElement).appendChild(overlay);
    reloadButton.focus();
    return overlay;
}

globalThis.showUxSessionExpiredPopup = showUxSessionExpiredPopup;
