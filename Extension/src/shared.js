// shared.js
// Shared constants, state, and utilities loaded on all WebClass pages.
// Included as the first js file within each content_scripts entry.
// Uses var/function so it can safely be loaded multiple times on the same page.

var uxDebugModeState = uxDebugModeState || { enabled: false };

var STORAGE_KEY_EXTENSION_VISUAL_ENABLED = 'extensionVisualEnabled';
var PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED = 'webclass_ux_master_enabled';

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
