// beforeunload-blocker.js
// This script runs in the MAIN world to intercept beforeunload events
// It must be loaded as a separate file (not inline) to comply with CSP

(function () {
    'use strict';

    const PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED = 'webclass_ux_master_enabled';
    const MASTER_STATE_DATASET_ATTRIBUTE = 'data-webclass-ux-master-enabled';
    const MASTER_STATE_FALLBACK_POLL_MS = 500;

    function uxIsDebugModeEnabled() {
        try {
            return !!(document && document.documentElement && document.documentElement.dataset.webclassUxDebugMode === '1');
        } catch {
            return false;
        }
    }

    function uxDebugLog(...args) {
        if (!uxIsDebugModeEnabled()) return;
        console.log(...args);
    }

    function uxDebugWarn(...args) {
        if (!uxIsDebugModeEnabled()) return;
        console.warn(...args);
    }

    function readMasterStateFromPage() {
        try {
            const datasetValue = document?.documentElement?.dataset?.webclassUxMasterEnabled;
            if (datasetValue === '0') return false;
            if (datasetValue === '1') return true;
        } catch {
            // ignore
        }
        try {
            const stored = localStorage.getItem(PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED);
            if (stored === '0') return false;
            if (stored === '1') return true;
        } catch {
            // ignore
        }
        return true;
    }

    const existingController = window.__webclassUxBeforeUnloadController;
    if (existingController && typeof existingController.setEnabled === 'function') {
        existingController.setEnabled(readMasterStateFromPage());
        return;
    }

    const state = {
        active: false,
        beforeUnloadPrototype: null,
        originalBeforeUnloadDescriptor: null,
        hadOwnBeforeUnloadDescriptor: false,
        originalWindowOnBeforeUnloadDescriptor: null,
        hadOwnWindowOnBeforeUnload: false,
        originalAddEventListener: null,
        captureListener: null
    };

    function applyBeforeUnloadSuppression() {
        if (state.active) return;
        state.active = true;
        window.__webclassUxBeforeUnloadBlocked = true;
        uxDebugLog('[WebClass UX] Initializing beforeunload suppression (external script)...');

        try {
            if (typeof BeforeUnloadEvent !== 'undefined' && BeforeUnloadEvent.prototype) {
                state.beforeUnloadPrototype = BeforeUnloadEvent.prototype;
                state.originalBeforeUnloadDescriptor = Object.getOwnPropertyDescriptor(BeforeUnloadEvent.prototype, 'returnValue');
                state.hadOwnBeforeUnloadDescriptor = !!state.originalBeforeUnloadDescriptor;
                Object.defineProperty(BeforeUnloadEvent.prototype, 'returnValue', {
                    get: function () {
                        return '';
                    },
                    set: function (val) {
                        uxDebugLog('[WebClass UX] Blocked BeforeUnloadEvent.returnValue =', typeof val);
                    },
                    configurable: true
                });
                uxDebugLog('[WebClass UX] Intercepted BeforeUnloadEvent.returnValue');
            }
        } catch (e) {
            uxDebugWarn('[WebClass UX] Failed to intercept BeforeUnloadEvent.returnValue:', e);
        }

        try {
            state.hadOwnWindowOnBeforeUnload = Object.prototype.hasOwnProperty.call(window, 'onbeforeunload');
            state.originalWindowOnBeforeUnloadDescriptor = Object.getOwnPropertyDescriptor(window, 'onbeforeunload');
            Object.defineProperty(window, 'onbeforeunload', {
                get: function () {
                    return null;
                },
                set: function () {
                    uxDebugLog('[WebClass UX] Blocked onbeforeunload assignment');
                },
                configurable: true,
                enumerable: true
            });
            uxDebugLog('[WebClass UX] Blocked onbeforeunload property');
        } catch (e) {
            uxDebugWarn('[WebClass UX] Failed to block onbeforeunload property:', e);
        }

        try {
            if (!state.originalAddEventListener) {
                state.originalAddEventListener = EventTarget.prototype.addEventListener;
            }
            EventTarget.prototype.addEventListener = function (type, listener, options) {
                if (type === 'beforeunload') {
                    uxDebugLog('[WebClass UX] Blocked addEventListener("beforeunload")');
                    return;
                }
                return state.originalAddEventListener.call(this, type, listener, options);
            };

            if (!state.captureListener) {
                state.captureListener = function (e) {
                    e.stopImmediatePropagation();
                    e.stopPropagation();
                    try {
                        delete e.returnValue;
                    } catch { }
                };
            }
            state.originalAddEventListener.call(window, 'beforeunload', state.captureListener, { capture: true });
        } catch (e) {
            uxDebugWarn('[WebClass UX] Failed to intercept addEventListener("beforeunload"):', e);
        }

        uxDebugLog('[WebClass UX] beforeunload suppression initialized (external script)');
    }

    function restoreBeforeUnloadSuppression() {
        if (!state.active) return;
        state.active = false;
        window.__webclassUxBeforeUnloadBlocked = false;
        uxDebugLog('[WebClass UX] Restoring beforeunload behavior');

        try {
            if (state.beforeUnloadPrototype) {
                if (state.hadOwnBeforeUnloadDescriptor && state.originalBeforeUnloadDescriptor) {
                    Object.defineProperty(state.beforeUnloadPrototype, 'returnValue', state.originalBeforeUnloadDescriptor);
                } else {
                    delete state.beforeUnloadPrototype.returnValue;
                }
            }
        } catch (e) {
            uxDebugWarn('[WebClass UX] Failed to restore BeforeUnloadEvent.returnValue:', e);
        }

        try {
            if (state.hadOwnWindowOnBeforeUnload && state.originalWindowOnBeforeUnloadDescriptor) {
                Object.defineProperty(window, 'onbeforeunload', state.originalWindowOnBeforeUnloadDescriptor);
            } else {
                delete window.onbeforeunload;
            }
        } catch (e) {
            uxDebugWarn('[WebClass UX] Failed to restore window.onbeforeunload:', e);
        }

        try {
            if (state.originalAddEventListener) {
                EventTarget.prototype.addEventListener = state.originalAddEventListener;
            }
            if (state.captureListener) {
                window.removeEventListener('beforeunload', state.captureListener, { capture: true });
            }
        } catch (e) {
            uxDebugWarn('[WebClass UX] Failed to restore addEventListener:', e);
        }
    }

    function setEnabled(enabled) {
        if (enabled) {
            applyBeforeUnloadSuppression();
            return;
        }
        restoreBeforeUnloadSuppression();
    }

    function refreshEnabledStateFromPage() {
        setEnabled(readMasterStateFromPage());
    }

    function startMasterStateObserver() {
        const observeFromStorage = () => {
            window.addEventListener('storage', (event) => {
                if (event?.key && event.key !== PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED) return;
                refreshEnabledStateFromPage();
            });
        };

        try {
            const root = document?.documentElement;
            if (!root || typeof MutationObserver !== 'function') {
                throw new Error('MutationObserver is unavailable.');
            }
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'attributes' && mutation.attributeName === MASTER_STATE_DATASET_ATTRIBUTE) {
                        refreshEnabledStateFromPage();
                        break;
                    }
                }
            });
            observer.observe(root, {
                attributes: true,
                attributeFilter: [MASTER_STATE_DATASET_ATTRIBUTE]
            });
            observeFromStorage();
        } catch (error) {
            uxDebugWarn('[WebClass UX] Failed to attach master-state observer:', error);
            setInterval(refreshEnabledStateFromPage, MASTER_STATE_FALLBACK_POLL_MS);
            observeFromStorage();
        }
    }

    window.__webclassUxBeforeUnloadController = { setEnabled };
    refreshEnabledStateFromPage();
    startMasterStateObserver();
})();
