// options/navigation.js
// Options navigation and auto-save behavior.

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

    const initialSection = new URLSearchParams(window.location.search).get('section');
    if (hasDetailSection(initialSection)) {
        showDetail(initialSection);
    } else {
        showRoot();
    }
};

const prepareSettingsOverlayReload = () => {
    if (window.parent === window) return Promise.resolve();

    const section = document.querySelector('.settings-detail:not([hidden])')?.dataset.section || '';
    return new Promise((resolve) => {
        const onReady = (event) => {
            if (event.source !== window.parent || event.data?.type !== 'ux-settings-reload-ready') return;
            clearTimeout(timeoutId);
            window.removeEventListener('message', onReady);
            resolve();
        };
        const timeoutId = setTimeout(() => {
            window.removeEventListener('message', onReady);
            resolve();
        }, 1000);
        window.addEventListener('message', onReady);
        window.parent.postMessage({ type: 'ux-settings-prepare-reload', section }, '*');
    });
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
        if (
            target.id === 'viewToggleShortcut'
            || target.id === 'password'
            || target.id === 'debugModeEnabled'
        ) return;
        scheduleAutoSave();
    });

    document.addEventListener('change', (event) => {
        const target = event.target;
        if (!isAutoSaveTarget(target)) return;
        if (target.id === 'viewToggleShortcut' || target.id === 'debugModeEnabled') return;
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
