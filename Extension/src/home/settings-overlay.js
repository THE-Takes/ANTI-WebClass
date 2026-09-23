// home/settings-overlay.js
// Same-page settings workspace opened from the dashboard settings icon.

var UX_DASHBOARD_SETTINGS_OVERLAY_ID = 'ux-dashboard-settings-overlay';
const UX_DASHBOARD_SETTINGS_FRAME_ID = 'ux-dashboard-settings-frame';
const UX_DASHBOARD_SETTINGS_PREVIOUS_FOCUS = '__uxDashboardSettingsPreviousFocus';
const UX_DASHBOARD_SETTINGS_RESUME_KEY = 'ux-dashboard-settings-resume';

function createDashboardSettingsOverlay({ container, settingsUrl, trigger = null } = {}) {
    if (!container || !settingsUrl) return null;

    const existingOverlay = container.querySelector(`#${UX_DASHBOARD_SETTINGS_OVERLAY_ID}`);
    if (existingOverlay) return null;

    const overlay = document.createElement('div');
    overlay.id = UX_DASHBOARD_SETTINGS_OVERLAY_ID;
    overlay.className = 'ux-dashboard-settings-overlay';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');

    const dialog = document.createElement('section');
    dialog.className = 'ux-dashboard-settings-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'ux-dashboard-settings-dialog-title');

    const header = document.createElement('header');
    header.className = 'ux-dashboard-settings-dialog-header';

    const title = document.createElement('h2');
    title.id = 'ux-dashboard-settings-dialog-title';
    title.textContent = '設定';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'ux-dashboard-settings-dialog-close';
    closeButton.setAttribute('aria-label', '設定を閉じる');
    closeButton.title = '閉じる';
    closeButton.innerHTML = '<span aria-hidden="true">×</span>';

    const frame = document.createElement('iframe');
    frame.id = UX_DASHBOARD_SETTINGS_FRAME_ID;
    frame.className = 'ux-dashboard-settings-frame';
    frame.title = 'WebClass UX 改善設定';
    frame.setAttribute('loading', 'eager');
    frame.setAttribute('aria-busy', 'true');
    frame.addEventListener('load', () => frame.removeAttribute('aria-busy'));

    header.appendChild(title);
    header.appendChild(closeButton);
    dialog.appendChild(header);
    dialog.appendChild(frame);
    overlay.appendChild(dialog);

    const setTriggerExpanded = (expanded) => {
        if (!trigger) return;
        trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    };

    const close = () => {
        if (overlay.hidden) return;

        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
        document.documentElement.classList.remove('ux-dashboard-settings-open');
        document.body?.classList.remove('ux-dashboard-settings-open');
        setTriggerExpanded(false);

        const previousFocus = overlay[UX_DASHBOARD_SETTINGS_PREVIOUS_FOCUS];
        overlay[UX_DASHBOARD_SETTINGS_PREVIOUS_FOCUS] = null;
        if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') {
            previousFocus.focus({ preventScroll: true });
        }
    };

    const open = (section = '') => {
        if (!overlay.hidden) return true;

        overlay[UX_DASHBOARD_SETTINGS_PREVIOUS_FOCUS] = document.activeElement;
        overlay.hidden = false;
        overlay.setAttribute('aria-hidden', 'false');
        document.documentElement.classList.add('ux-dashboard-settings-open');
        document.body?.classList.add('ux-dashboard-settings-open');
        setTriggerExpanded(true);

        const frameUrl = new URL(settingsUrl);
        if (typeof section === 'string' && section) {
            frameUrl.searchParams.set('section', section);
        }
        // A srcdoc attribute takes precedence over the extension settings URL.
        frame.removeAttribute('srcdoc');
        if (frame.getAttribute('src') !== frameUrl.href) {
            frame.setAttribute('aria-busy', 'true');
            frame.setAttribute('src', frameUrl.href);
        }
        closeButton.focus({ preventScroll: true });
        return true;
    };

    closeButton.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !overlay.hidden) {
            event.preventDefault();
            close();
        }
    }, true);

    window.addEventListener('message', (event) => {
        if (event.source !== frame.contentWindow
            || event.origin !== new URL(settingsUrl).origin
            || event.data?.type !== 'ux-settings-prepare-reload') return;

        try {
            sessionStorage.setItem(UX_DASHBOARD_SETTINGS_RESUME_KEY, event.data.section || '');
            event.source.postMessage({ type: 'ux-settings-reload-ready' }, event.origin);
        } catch (error) {
            console.error('[WebClass UX] Could not preserve the settings overlay', error);
        }
    });

    trigger?.setAttribute('aria-haspopup', 'dialog');
    trigger?.setAttribute('aria-controls', UX_DASHBOARD_SETTINGS_OVERLAY_ID);
    setTriggerExpanded(false);

    const resume = () => {
        const section = sessionStorage.getItem(UX_DASHBOARD_SETTINGS_RESUME_KEY);
        if (section === null) return;
        sessionStorage.removeItem(UX_DASHBOARD_SETTINGS_RESUME_KEY);
        open(section);
    };

    container.appendChild(overlay);
    return { open, close, resume, overlay, frame };
}
