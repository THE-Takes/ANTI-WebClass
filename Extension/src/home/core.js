// home/core.js
// Shared home-page state and academic-year helpers.

// Shared debug and visibility primitives are initialized by shared.js.

const uxExtensionVisualState = {
    enabled: (() => {
        try {
            const persisted = localStorage.getItem(PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED);
            if (persisted === '0') return false;
            if (persisted === '1') return true;
        } catch {
            // ignore
        }
        return true;
    })()
};
const uxDebugModeChangeListeners = new Set();

function uxSetExtensionVisualEnabled(enabled) {
    uxExtensionVisualState.enabled = !!enabled;
    syncUxMasterStateToPage(uxExtensionVisualState.enabled);
}

function uxIsExtensionVisualEnabled() {
    return !!uxExtensionVisualState.enabled;
}

function notifyDebugModeChange(enabled) {
    uxDebugModeChangeListeners.forEach((listener) => {
        try {
            listener(enabled);
        } catch {
            // ignore listener errors
        }
    });
}

onUxSharedDebugModeChange(notifyDebugModeChange);

(() => {
    try {
        chrome.storage.local.get({ [STORAGE_KEY_EXTENSION_VISUAL_ENABLED]: true }, (items) => {
            uxSetExtensionVisualEnabled(items[STORAGE_KEY_EXTENSION_VISUAL_ENABLED] !== false);
        });
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;

            if (changes[STORAGE_KEY_EXTENSION_VISUAL_ENABLED]) {
                const nextEnabled = changes[STORAGE_KEY_EXTENSION_VISUAL_ENABLED].newValue !== false;
                const prevEnabled = uxIsExtensionVisualEnabled();
                uxSetExtensionVisualEnabled(nextEnabled);
                if (isHomePage && prevEnabled !== nextEnabled) {
                    window.location.reload();
                }
            }
        });
    } catch {
        uxSetExtensionVisualEnabled(true);
    }
})();

function onUxDebugModeChange(listener) {
    if (typeof listener !== 'function') return () => { };
    uxDebugModeChangeListeners.add(listener);
    return () => uxDebugModeChangeListeners.delete(listener);
}

function uxIsDebugModeEnabled() {
    return !!uxDebugModeState.enabled;
}

function persistUxDebugMode(enabled) {
    const nextEnabled = !!enabled;
    setUxDebugModeEnabled(nextEnabled);
    try {
        const persistResult = chrome.storage.local.set({ debugModeEnabled: nextEnabled });
        if (persistResult && typeof persistResult.catch === 'function') {
            persistResult.catch((error) => {
                console.warn('[WebClass UX] Failed to persist debug mode setting.', error);
            });
        }
    } catch (error) {
        console.warn('[WebClass UX] Failed to persist debug mode setting.', error);
    }
}

function toggleUxDebugMode() {
    persistUxDebugMode(!uxIsDebugModeEnabled());
}

function getAcademicYearForDate(date) {
    const baseDate = date instanceof Date ? new Date(date.getTime()) : new Date(date);
    if (Number.isNaN(baseDate.getTime())) {
        const now = new Date();
        const month = now.getMonth() + 1;
        return month >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    }
    const month = baseDate.getMonth() + 1;
    return month >= 4 ? baseDate.getFullYear() : baseDate.getFullYear() - 1;
}

function getNextAcademicYearRevealDate(academicYear) {
    return new Date(academicYear + 1, 1, 1);
}

function getMaxVisibleAcademicYear(date = getWebClassNow()) {
    const baseDate = date instanceof Date ? new Date(date.getTime()) : new Date(date);
    const currentAcademicYear = getAcademicYearForDate(baseDate);
    const nextAcademicYearRevealDate = getNextAcademicYearRevealDate(currentAcademicYear);
    return baseDate >= nextAcademicYearRevealDate
        ? currentAcademicYear + 1
        : currentAcademicYear;
}

function parseAcademicYearOption(option) {
    if (!option) return null;
    const rawValue = `${option.value ?? ''}`.trim();
    const rawText = `${option.text ?? ''}`.trim();
    const source = rawValue || rawText;
    if (!/^\d{4}$/.test(source)) return null;
    const year = Number(source);
    return Number.isFinite(year) ? year : null;
}

function normalizeAcademicYearOptions(options, date = getWebClassNow()) {
    if (!Array.isArray(options) || !options.length) {
        return [];
    }

    const maxVisibleAcademicYear = getMaxVisibleAcademicYear(date);
    const currentAcademicYear = getAcademicYearForDate(date);
    const normalizedOptions = options.filter((option) => {
        const year = parseAcademicYearOption(option);
        return year === null || year <= maxVisibleAcademicYear;
    });

    if (!normalizedOptions.length) {
        return [];
    }

    const selectedOption = normalizedOptions.find((option) => option.selected);
    if (selectedOption) {
        return normalizedOptions;
    }

    const preferredYearOption =
        normalizedOptions.find((option) => parseAcademicYearOption(option) === currentAcademicYear) ||
        [...normalizedOptions]
            .reverse()
            .find((option) => {
                const year = parseAcademicYearOption(option);
                return year !== null && year <= maxVisibleAcademicYear;
            }) ||
        normalizedOptions[0];

    return normalizedOptions.map((option) => ({
        ...option,
        selected: option === preferredYearOption
    }));
}

// --- URL Check ---
// Only run on the WebClass home top page.
function isWebClassHomePath(pathname) {
    const normalizedPath = String(pathname || '').replace(/\/+$/, '');
    if (!normalizedPath) return false;
    if (normalizedPath === '/webclass') return true;
    return normalizedPath === '/webclass/index.php';
}

var isHomePage = isWebClassHomePath(window.location.pathname);

function getRequestedHomeDashboardTab() {
    try {
        const requestedTab = new URLSearchParams(window.location.search).get('ux_tab');
        if (requestedTab === 'messages') return 'tab-messages';
    } catch {
        // Ignore malformed or unavailable location state.
    }
    return 'tab-course';
}
