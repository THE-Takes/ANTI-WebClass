// Keep extension-owned surfaces in sync with the saved appearance preference.
(() => {
    if (globalThis.uxThemeInitialized) return;
    globalThis.uxThemeInitialized = true;

    const key = 'appearanceTheme';
    const media = matchMedia('(prefers-color-scheme: dark)');
    const transitionClass = 'ux-theme-transitioning';
    const transitionDurationMs = 1000;
    let preference = 'light';
    let transitionTimer = null;

    const apply = (animate = false) => {
        const root = document.documentElement;
        if (!root) return;
        const dark = preference === 'dark' || (preference === 'system' && media.matches);
        const nextTheme = dark ? 'dark' : 'light';
        if (root.dataset.uxTheme === nextTheme) return;

        if (animate && ['light', 'dark'].includes(root.dataset.uxTheme)) {
            root.classList.add(transitionClass);
            clearTimeout(transitionTimer);
            transitionTimer = setTimeout(() => {
                root.classList.remove(transitionClass);
                transitionTimer = null;
            }, transitionDurationMs);
        }

        root.dataset.uxTheme = nextTheme;
    };

    chrome.storage.local.get({ [key]: 'light' }, (items) => {
        preference = ['light', 'dark', 'system'].includes(items[key]) ? items[key] : 'light';
        apply();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[key]) return;
        preference = changes[key].newValue;
        apply(true);
    });
    media.addEventListener('change', () => apply(true));
})();
