// home.js
// Home-page entry point.

if (!isHomePage) {
  uxDebugLog('WebClass UX Improver: Not home page, skipping home.js');
} else {
    async function initHome() {
        uxDebugLog("WebClass UX Improver: Initializing Home");
        const globalSettings = await chrome.storage.local.get({
            [STORAGE_KEY_EXTENSION_VISUAL_ENABLED]: true,
            [STORAGE_KEY_DASHBOARD_DANGER_TODO_OUTLINE_ENABLED]: true
        });
        uxSetExtensionVisualEnabled(globalSettings[STORAGE_KEY_EXTENSION_VISUAL_ENABLED] !== false);
        dashboardDangerTodoOutlineEnabled = globalSettings[STORAGE_KEY_DASHBOARD_DANGER_TODO_OUTLINE_ENABLED] !== false;

        if (!uxIsExtensionVisualEnabled()) {
            uxDebugLog("WebClass UX: Global visual modification is disabled");
            document.body.classList.remove('ux-dashboard-v2-mode');
            document.body.classList.remove('ux-grid-mode');
            runTodoApiSyncFromBackground = null;
            return;
        }

        // Get current view state
        const currentView = await getCurrentView();
        uxDebugLog("WebClass UX: Current View =", currentView);

        // Render the appropriate view based on currentView
        switch (currentView) {
            case 'dashboard':
                // Switch View 2: Dashboard View
                uxDebugLog("WebClass UX: Rendering Dashboard Layout");
                document.body.classList.add('ux-dashboard-v2-mode');
                document.body.classList.remove('ux-grid-mode');
                await renderDashboardLayout();
                break;

            case 'plain':
            default:
                // Default: 完全プレーン（拡張機能無効時と同じ）
                uxDebugLog("WebClass UX: Plain mode - no modifications");
                document.body.classList.remove('ux-dashboard-v2-mode');
                document.body.classList.remove('ux-grid-mode');
                runTodoApiSyncFromBackground = null;
                // Do nothing - leave the page as is
                break;
        }

        if (currentView !== 'plain') {
            startTimetableHighlightTimer();
        }
    }

    // Run
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHome);
    } else {
        initHome();
    }

}
