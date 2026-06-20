// shared.js
// Shared constants, state, and utilities loaded on all WebClass pages.
// Included as the first js file within each content_scripts entry.
// Uses var/function so it can safely be loaded multiple times on the same page.

var uxDebugModeState = uxDebugModeState || { enabled: false };

var STORAGE_KEY_EXTENSION_VISUAL_ENABLED = 'extensionVisualEnabled';
var PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED = 'webclass_ux_master_enabled';
var UX_SESSION_EXPIRED_POPUP_ID = 'webclass-ux-session-expired-popup';
var UX_SESSION_EXPIRED_STYLE_ID = 'webclass-ux-session-expired-style';

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
            box-shadow: 0 24px 64px rgba(15, 23, 42, 0.24);
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
