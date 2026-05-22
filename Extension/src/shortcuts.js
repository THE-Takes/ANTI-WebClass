// shortcuts.js
// Global shortcut handling across WebClass pages.

(() => {
    if (window.__webclassUxShortcutsInitialized) return;
    window.__webclassUxShortcutsInitialized = true;

    const STORAGE_KEY_EXTENSION_VISUAL_ENABLED = 'extensionVisualEnabled';
    const STORAGE_KEY_VIEW_TOGGLE_SHORTCUT = 'viewToggleShortcut';
    const STORAGE_KEY_VIEW_TOGGLE_SHORTCUT_MIGRATED = 'viewToggleShortcutMigratedToCtrlShiftM';
    const PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED = 'webclass_ux_master_enabled';
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

    const shortcutState = {
        extensionVisualEnabled: true,
        viewToggleShortcut: DEFAULT_VIEW_TOGGLE_SHORTCUT,
        isHandling: false,
    };

    function syncUxMasterStateToPage(enabled) {
        const normalized = enabled ? '1' : '0';
        try {
            if (document && document.documentElement) {
                document.documentElement.dataset.webclassUxMasterEnabled = normalized;
            }
        } catch {
            // ignore
        }
        try {
            localStorage.setItem(PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED, normalized);
        } catch {
            // ignore
        }
    }

    function canonicalizeShortcutKeyToken(token) {
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
        if (lower === 'dead') return '';

        if (/^f\d{1,2}$/i.test(trimmed)) {
            return trimmed.toUpperCase();
        }
        if (trimmed.length === 1) {
            return trimmed.toUpperCase();
        }
        return trimmed[0].toUpperCase() + trimmed.slice(1);
    }

    function normalizeShortcut(rawShortcut) {
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
    }

    function shortcutTokenFromCode(code) {
        if (typeof code !== 'string' || !code) return '';

        if (/^Key[A-Z]$/.test(code)) {
            return code.slice(3);
        }
        if (/^Digit[0-9]$/.test(code)) {
            return code.slice(5);
        }
        if (/^F\d{1,2}$/.test(code)) {
            return code;
        }
        if (/^Numpad[0-9]$/.test(code)) {
            return code.slice(6);
        }

        const codeMap = {
            Space: 'Space',
            Escape: 'Escape',
            ArrowUp: 'ArrowUp',
            ArrowDown: 'ArrowDown',
            ArrowLeft: 'ArrowLeft',
            ArrowRight: 'ArrowRight',
            Minus: '-',
            Equal: '=',
            BracketLeft: '[',
            BracketRight: ']',
            Backslash: '\\',
            Semicolon: ';',
            Quote: '\'',
            Comma: ',',
            Period: '.',
            Slash: '/',
            Backquote: '`',
        };

        return codeMap[code] || '';
    }

    function normalizeOrDefaultShortcut(rawShortcut, defaultShortcut) {
        const normalized = normalizeShortcut(rawShortcut);
        if (normalized === null) return defaultShortcut;
        return normalized;
    }

    function shortcutFromKeyboardEvent(event) {
        if (!event) return '';
        const codeToken = shortcutTokenFromCode(event.code || '');
        const keyTokenFromEvent = canonicalizeShortcutKeyToken(event.key || '');
        const keyToken = codeToken || keyTokenFromEvent;
        if (!keyToken || SHORTCUT_MODIFIER_ORDER.includes(keyToken)) return '';

        const pressedModifiers = [];
        if (event.ctrlKey) pressedModifiers.push('Ctrl');
        if (event.altKey) pressedModifiers.push('Alt');
        if (event.shiftKey) pressedModifiers.push('Shift');
        if (event.metaKey) pressedModifiers.push('Meta');

        if (pressedModifiers.length === 0) return '';
        const orderedModifiers = SHORTCUT_MODIFIER_ORDER.filter((modifier) => pressedModifiers.includes(modifier));
        return [...orderedModifiers, keyToken].join('+');
    }

    function isEditableShortcutTarget(target) {
        const element = target instanceof Element ? target : target?.parentElement;
        if (!element || typeof element.closest !== 'function') return false;
        return !!element.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]');
    }

    function reloadTopPage() {
        try {
            if (window.top && window.top !== window) {
                window.top.location.reload();
                return;
            }
        } catch {
            // ignore
        }
        window.location.reload();
    }

    function isCourseContentPath(pathname = '') {
        return /\/webclass\/(?:course\.php|do_contents\.php|txtbk_frame\.php|txtbk_show_chapter\.php|txtbk_show_text\.php|title_simple\.php|qstn_frame\.php|dqstn_button\.php|dqstn_question\.php|dqstn_answer\.php|dqstn_answer_all\.php|reslt_description\.php|loadit\.php|file_down\.php)$/i.test(pathname || '');
    }

    function shouldToggleDisplayModeWithoutReload() {
        try {
            if (isCourseContentPath(window.location.pathname)) return true;
        } catch {
            // ignore
        }

        try {
            if (window.top?.location && isCourseContentPath(window.top.location.pathname)) return true;
        } catch {
            // ignore inaccessible top frame
        }

        try {
            if (window.parent?.location && isCourseContentPath(window.parent.location.pathname)) return true;
        } catch {
            // ignore inaccessible parent frame
        }

        return false;
    }

    async function toggleDisplayModeByShortcut() {
        if (shortcutState.isHandling) return;
        shortcutState.isHandling = true;
        try {
            const nextExtensionVisualEnabled = !shortcutState.extensionVisualEnabled;
            shortcutState.extensionVisualEnabled = nextExtensionVisualEnabled;

            const nextDefaultViewVersion = nextExtensionVisualEnabled ? '2' : 'original';
            const nextCurrentView = nextExtensionVisualEnabled ? 'dashboard' : 'plain';

            syncUxMasterStateToPage(nextExtensionVisualEnabled);
            await chrome.storage.local.set({
                [STORAGE_KEY_EXTENSION_VISUAL_ENABLED]: nextExtensionVisualEnabled,
                defaultViewVersion: nextDefaultViewVersion,
                currentView: nextCurrentView,
            });
            if (!shouldToggleDisplayModeWithoutReload()) {
                reloadTopPage();
            }
        } finally {
            shortcutState.isHandling = false;
        }
    }

    function handleShortcutKeydown(event) {
        if (event.defaultPrevented || event.repeat) return;
        if (isEditableShortcutTarget(event.target)) return;

        const pressedShortcut = shortcutFromKeyboardEvent(event);
        if (!pressedShortcut) return;

        if (
            shortcutState.viewToggleShortcut &&
            pressedShortcut === shortcutState.viewToggleShortcut
        ) {
            event.preventDefault();
            event.stopPropagation();
            void toggleDisplayModeByShortcut();
        }
    }

    function refreshShortcutStateFromStorage(items) {
        shortcutState.extensionVisualEnabled = items[STORAGE_KEY_EXTENSION_VISUAL_ENABLED] !== false;
        const normalizedStoredShortcut = normalizeShortcut(items[STORAGE_KEY_VIEW_TOGGLE_SHORTCUT]);
        const hasMigratedLegacyDefault = items[STORAGE_KEY_VIEW_TOGGLE_SHORTCUT_MIGRATED] === true;

        if (hasMigratedLegacyDefault && normalizedStoredShortcut === LEGACY_DEFAULT_VIEW_TOGGLE_SHORTCUT) {
            shortcutState.viewToggleShortcut = DEFAULT_VIEW_TOGGLE_SHORTCUT;
            chrome.storage.local.set({
                [STORAGE_KEY_VIEW_TOGGLE_SHORTCUT]: DEFAULT_VIEW_TOGGLE_SHORTCUT,
                [STORAGE_KEY_VIEW_TOGGLE_SHORTCUT_MIGRATED]: false,
            });
        } else {
            shortcutState.viewToggleShortcut = normalizeOrDefaultShortcut(
                items[STORAGE_KEY_VIEW_TOGGLE_SHORTCUT],
                DEFAULT_VIEW_TOGGLE_SHORTCUT
            );
        }
        syncUxMasterStateToPage(shortcutState.extensionVisualEnabled);
    }

    function initializeShortcutState() {
        chrome.storage.local.get({
            [STORAGE_KEY_EXTENSION_VISUAL_ENABLED]: true,
            [STORAGE_KEY_VIEW_TOGGLE_SHORTCUT]: DEFAULT_VIEW_TOGGLE_SHORTCUT,
            [STORAGE_KEY_VIEW_TOGGLE_SHORTCUT_MIGRATED]: false,
        }, (items) => {
            refreshShortcutStateFromStorage(items);
        });

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;

            if (changes[STORAGE_KEY_EXTENSION_VISUAL_ENABLED]) {
                shortcutState.extensionVisualEnabled = changes[STORAGE_KEY_EXTENSION_VISUAL_ENABLED].newValue !== false;
                syncUxMasterStateToPage(shortcutState.extensionVisualEnabled);
            }

            if (changes[STORAGE_KEY_VIEW_TOGGLE_SHORTCUT]) {
                shortcutState.viewToggleShortcut = normalizeOrDefaultShortcut(
                    changes[STORAGE_KEY_VIEW_TOGGLE_SHORTCUT].newValue,
                    DEFAULT_VIEW_TOGGLE_SHORTCUT
                );
            }
        });
    }

    initializeShortcutState();
    document.addEventListener('keydown', handleShortcutKeydown, true);
})();
