// options/persistence.js
// Options save and restore behavior.

let debugModeSettingRevision = 0;

const markDebugModeSettingChanged = () => {
    debugModeSettingRevision += 1;
};

const syncDebugModeSettingUi = (enabled) => {
    const normalizedEnabled = !!enabled;
    const debugToggle = document.getElementById('debugModeEnabled');
    if (debugToggle) {
        debugToggle.checked = normalizedEnabled;
    }
    updateDebugOnlySettingsVisibility(normalizedEnabled);
};

const saveDebugModeSetting = async (enabled) => {
    const normalizedEnabled = !!enabled;
    const saveRevision = debugModeSettingRevision;
    syncDebugModeSettingUi(normalizedEnabled);
    try {
        await storageLocalSetAsync({ debugModeEnabled: normalizedEnabled });
        return true;
    } catch (error) {
        console.error('[WebClass UX] Failed to save debug mode setting', error);
        try {
            const storedItems = await storageLocalGetAsync({ debugModeEnabled: false });
            if (saveRevision === debugModeSettingRevision) {
                syncDebugModeSettingUi(storedItems.debugModeEnabled === true);
            }
        } catch (restoreError) {
            console.error('[WebClass UX] Failed to restore debug mode setting after save error', restoreError);
        }
        showStatusMessage('設定の保存に失敗しました。', 'var(--options-danger)', 2500);
        return false;
    }
};

// Saves options to chrome.storage
const saveOptions = async ({
    source = 'manual',
    showSuccess = source === 'manual',
    reloadWebClassTabsAfterSave = false
} = {}) => {
    clearAutoSaveTimer();
    try {

    const autoLoginEnabled = document.getElementById('autoLoginEnabled').checked;
    const username = (document.getElementById('username').value || '').trim();
    const passwordInput = document.getElementById('password');
    const password = (passwordInput?.value || '').trim();
    const shouldReplaceAutoLoginPassword = !!password;
    const shouldDeleteAutoLoginPassword = autoLoginPasswordPendingDeletion;
    const defaultViewVersion = document.querySelector('input[name="defaultViewVersion"]:checked')?.value || '2';
    const currentView = defaultViewVersion === 'original' ? 'plain' : 'dashboard';
    const extensionVisualEnabled = defaultViewVersion !== 'original';
    const extensionUpdateCheckEnabled = !!document.getElementById('extensionUpdateCheckEnabled')?.checked;
    const appearanceTheme = document.querySelector('input[name="appearanceTheme"]:checked')?.value || 'light';
    const dashboardDangerTodoOutlineEnabled = document.getElementById('dashboardDangerTodoOutlineEnabled')?.checked !== false;
    const courseQuickNavDefaultState = document.querySelector('input[name="courseQuickNavDefaultState"]:checked')?.value || 'expanded';
    const courseQuickNavCollapsed = courseQuickNavDefaultState === 'collapsed';
    const rawViewToggleShortcut = shortcutInputToStorageValue(document.getElementById('viewToggleShortcut').value.trim());
    const normalizedViewToggleShortcut = rawViewToggleShortcut
        ? normalizeShortcut(rawViewToggleShortcut)
        : '';

    const strictShortcutValidation = source === 'manual' || source === 'shortcut';
    let shortcutToPersist = normalizedViewToggleShortcut;
    if (rawViewToggleShortcut && !normalizedViewToggleShortcut) {
        if (strictShortcutValidation) {
            showInvalidShortcutStatus();
            return false;
        }
        shortcutToPersist = lastSavedViewToggleShortcut;
    } else {
        setShortcutInputDisplayValue(normalizedViewToggleShortcut);
    }

    const useCustomCourseNameEnabled = document.getElementById('useCustomCourseNameEnabled').checked;
    const useRuleCourseNameEnabled = document.getElementById('useRuleCourseNameEnabled').checked;
    let shikenSelectVisibleCount = document.getElementById('shikenSelectVisibleCount').value;
    const parsedSelectCount = parseInt(shikenSelectVisibleCount, 10);
    if (Number.isNaN(parsedSelectCount) || parsedSelectCount < 0) {
        shikenSelectVisibleCount = '12';
    } else {
        shikenSelectVisibleCount = String(parsedSelectCount);
    }
    const todoApiEnabled = !!document.getElementById('todoApiEnabled')?.checked;
    const todoApiIncludeNotYetStarted = !!document.getElementById('todoApiIncludeNotYetStarted')?.checked;
    let ticktickTodoClientId = (document.getElementById('ticktickTodoClientId')?.value || '').trim();
    let ticktickTodoClientSecret = (document.getElementById('ticktickTodoClientSecret')?.value || '').trim();
    const ticktickTodoProjectName = TODO_DEFAULT_PROJECT_NAME;
    const encryptedTickTickTodoClientSecret = ticktickTodoClientSecret
        ? await encryptSecureLocalString(ticktickTodoClientSecret)
        : '';
    const encryptedAutoLoginUsername = username
        ? await encryptSecureLocalString(username)
        : '';
    const encryptedAutoLoginPassword = shouldReplaceAutoLoginPassword
        ? await encryptSecureLocalString(password)
        : '';
    const todoApiTaskTitleFormat = document.getElementById('todoApiTaskTitleFormat')?.value || 'task_only';
    const todoApiUltraShortCourseMap = {};
    document.querySelectorAll('#todoApiUltraShortCourseMap input[data-course-key]').forEach((input) => {
        const key = input.dataset.courseKey;
        const value = (input.value || '').trim();
        if (key && value) {
            todoApiUltraShortCourseMap[key] = value;
        }
    });

    const tocInitialState = document.querySelector('input[name="tocInitialState"]:checked')?.value || 'open';
    const tocInitialCloseDelay = document.getElementById('tocInitialCloseDelay').value;
    const tocAutoHide = document.getElementById('tocAutoHide').checked;
    const tocAutoHideDelay = document.getElementById('tocAutoHideDelay').value;
    const tocShowSectionTitles = document.getElementById('tocShowSectionTitles').checked;
    const materialDownloadFilenameSeparator = normalizeMaterialDownloadFilenameSeparator(
        document.querySelector('input[name="materialDownloadFilenameSeparator"]:checked')?.value
    );
    const tocHoverReveal = document.getElementById('tocHoverReveal').checked;
    const dashboardVisibleRange = getDashboardVisibleRangeFromInputs();

        const localWritePayload = {
            autoLoginEnabled,
            username: encryptedAutoLoginUsername,
            defaultViewVersion,
            currentView,
            [EXTENSION_VISUAL_ENABLED_KEY]: extensionVisualEnabled,
            [EXTENSION_UPDATE_CHECK_ENABLED_KEY]: extensionUpdateCheckEnabled,
            appearanceTheme,
            [DASHBOARD_DANGER_TODO_OUTLINE_ENABLED_KEY]: dashboardDangerTodoOutlineEnabled,
            [COURSE_QUICK_NAV_COLLAPSED_KEY]: courseQuickNavCollapsed,
            viewToggleShortcut: shortcutToPersist,
            viewToggleShortcutMigratedToCtrlShiftM: false,
            useCustomCourseNameEnabled,
            useRuleCourseNameEnabled,
            useShortCourseNameEnabled: null,
            shikenSelectVisibleCount,
            [TODO_API_ENABLED_KEY]: todoApiEnabled,
            [TODO_API_INCLUDE_NOT_YET_STARTED_KEY]: todoApiIncludeNotYetStarted,
            todoApiProvider: selectedTodoProvider(),
            [TICKTICK_TODO_PROJECT_NAME_KEY]: ticktickTodoProjectName,
            [TICKTICK_TODO_CLIENT_ID_KEY]: ticktickTodoClientId,
            [TICKTICK_TODO_CLIENT_SECRET_KEY]: encryptedTickTickTodoClientSecret,
            [TODO_API_TASK_TITLE_FORMAT_KEY]: todoApiTaskTitleFormat,
            [TODO_API_ULTRA_SHORT_MAP_KEY]: todoApiUltraShortCourseMap,
            tocInitialState,
            tocInitialCloseDelay,
            tocAutoHide,
            tocAutoHideDelay,
            tocShowSectionTitles,
            [MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_KEY]: materialDownloadFilenameSeparator,
            tocHoverReveal,
            [DASHBOARD_VISIBLE_START_PERIOD_KEY]: dashboardVisibleRange.startPeriod,
            [DASHBOARD_VISIBLE_END_PERIOD_KEY]: dashboardVisibleRange.endPeriod,
            [DASHBOARD_VISIBLE_START_WEEKDAY_KEY]: dashboardVisibleRange.startWeekday,
            [DASHBOARD_VISIBLE_END_WEEKDAY_KEY]: dashboardVisibleRange.endWeekday
        };
        if (shouldDeleteAutoLoginPassword) {
            localWritePayload.password = '';
        } else if (shouldReplaceAutoLoginPassword) {
            localWritePayload.password = encryptedAutoLoginPassword;
        }

        await storageLocalSetAsync(localWritePayload);
        await storageSessionRemoveAsync(Object.keys(LEGACY_AUTO_LOGIN_SESSION_DEFAULTS));
        lastSavedViewToggleShortcut = shortcutToPersist;
        if (shouldDeleteAutoLoginPassword) {
            resetAutoLoginPasswordState({ stored: false });
        } else if (shouldReplaceAutoLoginPassword) {
            resetAutoLoginPasswordState({ stored: true });
        } else {
            updateAutoLoginPasswordUi();
        }
        if (showSuccess) {
            showStatusMessage('設定を保存しました。', 'var(--options-success)', 2000);
        }
        if (reloadWebClassTabsAfterSave) {
            await prepareSettingsOverlayReload();
            reloadOpenWebClassTabs();
        }
        return true;
    } catch (error) {
        console.error('[WebClass UX] Failed to save options', error);
        showStatusMessage('設定の保存に失敗しました。', 'var(--options-danger)', 2500);
        return false;
    }
};

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
const restoreOptions = () => {
    const restoreDebugModeRevision = debugModeSettingRevision;
    chrome.storage.local.get(
        {
            autoLoginEnabled: false,
            debugModeEnabled: false,
            username: '',
            password: '',
            defaultViewVersion: '2',
            appearanceTheme: 'light',
            currentView: 'dashboard',
            [EXTENSION_VISUAL_ENABLED_KEY]: true,
            [EXTENSION_UPDATE_CHECK_ENABLED_KEY]: true,
            [DASHBOARD_DANGER_TODO_OUTLINE_ENABLED_KEY]: true,
            [COURSE_QUICK_NAV_COLLAPSED_KEY]: false,
            viewToggleShortcut: DEFAULT_VIEW_TOGGLE_SHORTCUT,
            viewToggleShortcutMigratedToCtrlShiftM: false,
            useCustomCourseNameEnabled: null,
            useRuleCourseNameEnabled: null,
            useShortCourseNameEnabled: null,
            shikenSelectVisibleCount: '12',
            [TODO_API_ENABLED_KEY]: false,
            [TODO_API_INCLUDE_NOT_YET_STARTED_KEY]: false,
            todoApiProvider: 'ticktick',
            [TICKTICK_TODO_PROJECT_NAME_KEY]: TODO_DEFAULT_PROJECT_NAME,
            [TICKTICK_TODO_CLIENT_ID_KEY]: '',
            [TICKTICK_TODO_CLIENT_SECRET_KEY]: '',
            [TODO_API_TASK_TITLE_FORMAT_KEY]: 'task_only',
            [TODO_API_ULTRA_SHORT_MAP_KEY]: {},
            tocInitialState: 'open',
            tocInitialCloseDelay: '5',
            tocAutoHide: false,
            tocAutoHideDelay: '10',
            tocShowSectionTitles: true,
            [MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_KEY]: MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_DEFAULT,
            tocHoverReveal: true,
            [DASHBOARD_VISIBLE_START_PERIOD_KEY]: 1,
            [DASHBOARD_VISIBLE_END_PERIOD_KEY]: 6,
            [DASHBOARD_VISIBLE_START_WEEKDAY_KEY]: 1,
            [DASHBOARD_VISIBLE_END_WEEKDAY_KEY]: 6,
            [CUSTOM_USER_ICON_KEY]: ''
        },
        async (localItems) => {
            try {
                const sessionItems = await storageSessionGetAsync(LEGACY_AUTO_LOGIN_SESSION_DEFAULTS);
                const migratedSecureLocalValues = {};
                const legacySessionKeysToRemove = [];

                let autoLoginUsername = '';
                const legacySessionUsername = typeof sessionItems.username === 'string'
                    ? sessionItems.username.trim()
                    : '';
                if (legacySessionUsername) {
                    migratedSecureLocalValues.username = await encryptSecureLocalString(legacySessionUsername);
                    autoLoginUsername = legacySessionUsername;
                    legacySessionKeysToRemove.push('username');
                } else {
                    autoLoginUsername = await readSecureLocalString(localItems, 'username', migratedSecureLocalValues);
                }

                let autoLoginPasswordStoredNext = false;
                const legacySessionPassword = typeof sessionItems.password === 'string'
                    ? sessionItems.password.trim()
                    : '';
                if (legacySessionPassword) {
                    migratedSecureLocalValues.password = await encryptSecureLocalString(legacySessionPassword);
                    autoLoginPasswordStoredNext = true;
                    legacySessionKeysToRemove.push('password');
                } else {
                    autoLoginPasswordStoredNext = await readSecureLocalStringPresence(
                        localItems,
                        'password',
                        migratedSecureLocalValues
                    );
                }

                const ticktickTodoClientSecret = await readSecureLocalString(
                    localItems,
                    TICKTICK_TODO_CLIENT_SECRET_KEY,
                    migratedSecureLocalValues
                );
                if (Object.keys(migratedSecureLocalValues).length > 0) {
                    await storageLocalSetAsync(migratedSecureLocalValues);
                }
                if (legacySessionKeysToRemove.length > 0) {
                    await storageSessionRemoveAsync(legacySessionKeysToRemove);
                }

                const items = {
                    ...localItems,
                    ...sessionItems,
                    username: autoLoginUsername,
                    password: '',
                    [TICKTICK_TODO_CLIENT_SECRET_KEY]: ticktickTodoClientSecret
                };

                const appearanceTheme = ['light', 'dark', 'system'].includes(items.appearanceTheme)
                    ? items.appearanceTheme
                    : 'light';
                document.querySelector(`input[name="appearanceTheme"][value="${appearanceTheme}"]`).checked = true;

                const autoLoginEnabled = items.autoLoginEnabled === true;
                document.getElementById('autoLoginEnabled').checked = autoLoginEnabled;
                const debugModeEnabled = !!items.debugModeEnabled;
                if (restoreDebugModeRevision === debugModeSettingRevision) {
                    syncDebugModeSettingUi(debugModeEnabled);
                }
                document.getElementById('username').value = items.username;
                resetAutoLoginPasswordState({ stored: autoLoginPasswordStoredNext });
            const legacyShort = items.useShortCourseNameEnabled;
            const hasNewToggles =
                items.useCustomCourseNameEnabled !== null && items.useCustomCourseNameEnabled !== undefined ||
                items.useRuleCourseNameEnabled !== null && items.useRuleCourseNameEnabled !== undefined;
            const disableAll = !hasNewToggles && legacyShort === false;
            const customEnabled = disableAll
                ? false
                : (items.useCustomCourseNameEnabled === null || items.useCustomCourseNameEnabled === undefined)
                    ? true
                    : items.useCustomCourseNameEnabled;
            const ruleEnabled = disableAll
                ? false
                : (items.useRuleCourseNameEnabled === null || items.useRuleCourseNameEnabled === undefined)
                    ? true
                    : items.useRuleCourseNameEnabled;
            document.getElementById('useCustomCourseNameEnabled').checked = customEnabled;
            document.getElementById('useRuleCourseNameEnabled').checked = ruleEnabled;
            document.getElementById('shikenSelectVisibleCount').value = items.shikenSelectVisibleCount;
            const todoApiEnabled = items[TODO_API_ENABLED_KEY] === true;
            document.getElementById('todoApiEnabled').checked = todoApiEnabled;
            document.getElementById('todoApiIncludeNotYetStarted').checked = items[TODO_API_INCLUDE_NOT_YET_STARTED_KEY] === true;
            document.getElementById('todoApiProvider').value = items.todoApiProvider === 'apple_reminders' ? 'apple_reminders' : 'ticktick';
            const ticktickClientIdInput = document.getElementById('ticktickTodoClientId');
            if (ticktickClientIdInput) ticktickClientIdInput.value = items[TICKTICK_TODO_CLIENT_ID_KEY] || '';
            const ticktickClientSecretInput = document.getElementById('ticktickTodoClientSecret');
            if (ticktickClientSecretInput) ticktickClientSecretInput.value = items[TICKTICK_TODO_CLIENT_SECRET_KEY] || '';
            const ticktickRedirectUriInput = document.getElementById('ticktickTodoRedirectUri');
            if (ticktickRedirectUriInput) {
                ticktickRedirectUriInput.value = chrome?.identity?.getRedirectURL
                    ? chrome.identity.getRedirectURL('ticktick')
                    : `https://${chrome.runtime.id}.chromiumapp.org/ticktick`;
            }
            const ticktickProjectName = TODO_DEFAULT_PROJECT_NAME;
            document.getElementById('todoApiTaskTitleFormat').value = items[TODO_API_TASK_TITLE_FORMAT_KEY] || 'task_only';
            updateTodoApiSettingsAvailability(todoApiEnabled);
            updateTodoApiTaskTitleFormatUI(items[TODO_API_TASK_TITLE_FORMAT_KEY] || 'task_only');
            renderTodoApiUltraShortCourseMap(items[TODO_API_ULTRA_SHORT_MAP_KEY] || {});
            const todoMigrationPatch = {};
            const rawTicktickProjectName = typeof items[TICKTICK_TODO_PROJECT_NAME_KEY] === 'string'
                ? items[TICKTICK_TODO_PROJECT_NAME_KEY].trim()
                : '';
            if (rawTicktickProjectName !== ticktickProjectName) {
                todoMigrationPatch[TICKTICK_TODO_PROJECT_NAME_KEY] = ticktickProjectName;
            }
            if (Object.keys(todoMigrationPatch).length > 0) {
                chrome.storage.local.set(todoMigrationPatch);
            }

            if (items.tocInitialState === 'closed') {
                document.getElementById('tocInitialClosed').checked = true;
            } else {
                document.getElementById('tocInitialOpen').checked = true;
            }
            document.getElementById('tocInitialCloseDelay').value = items.tocInitialCloseDelay;
            document.getElementById('tocAutoHide').checked = items.tocAutoHide;
            document.getElementById('tocAutoHideDelay').value = items.tocAutoHideDelay;
            document.getElementById('tocShowSectionTitles').checked = items.tocShowSectionTitles;
            const materialDownloadFilenameSeparator = normalizeMaterialDownloadFilenameSeparator(
                items[MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_KEY]
            );
            const materialDownloadFilenameSeparatorRadio = document.querySelector(
                `input[name="materialDownloadFilenameSeparator"][value="${materialDownloadFilenameSeparator}"]`
            );
            if (materialDownloadFilenameSeparatorRadio) {
                materialDownloadFilenameSeparatorRadio.checked = true;
            }
            document.getElementById('tocHoverReveal').checked = items.tocHoverReveal;
            setDashboardVisibleRangeInputs({
                startPeriod: items[DASHBOARD_VISIBLE_START_PERIOD_KEY],
                endPeriod: items[DASHBOARD_VISIBLE_END_PERIOD_KEY],
                startWeekday: items[DASHBOARD_VISIBLE_START_WEEKDAY_KEY],
                endWeekday: items[DASHBOARD_VISIBLE_END_WEEKDAY_KEY]
            });
            renderDashboardVisibleRangeGrid();

            const visualEnabled = items[EXTENSION_VISUAL_ENABLED_KEY] !== false;
            const normalizedStoredDefaultViewVersion = items.defaultViewVersion === 'original' ? 'original' : '2';
            const normalizedDefaultViewVersion = visualEnabled
                ? normalizedStoredDefaultViewVersion
                : 'original';
            const normalizedCurrentView = normalizedDefaultViewVersion === 'original' ? 'plain' : 'dashboard';
            const defaultViewRadioId = normalizedDefaultViewVersion === 'original'
                ? 'defaultViewOriginal'
                : 'defaultView2';
            const defaultViewRadio = document.getElementById(defaultViewRadioId);
            if (defaultViewRadio) {
                defaultViewRadio.checked = true;
            }

            const expectedVisualEnabled = normalizedDefaultViewVersion !== 'original';
            if (
                items.defaultViewVersion !== normalizedDefaultViewVersion ||
                items.currentView !== normalizedCurrentView ||
                items[EXTENSION_VISUAL_ENABLED_KEY] !== expectedVisualEnabled
            ) {
                chrome.storage.local.set({
                    defaultViewVersion: normalizedDefaultViewVersion,
                    currentView: normalizedCurrentView,
                    [EXTENSION_VISUAL_ENABLED_KEY]: expectedVisualEnabled
                });
            }

            const normalizedViewToggleShortcut = normalizeShortcut(items.viewToggleShortcut);
            let resolvedViewToggleShortcut = normalizedViewToggleShortcut === null
                ? DEFAULT_VIEW_TOGGLE_SHORTCUT
                : normalizedViewToggleShortcut;
            if (
                items.viewToggleShortcutMigratedToCtrlShiftM === true &&
                resolvedViewToggleShortcut === LEGACY_DEFAULT_VIEW_TOGGLE_SHORTCUT
            ) {
                resolvedViewToggleShortcut = DEFAULT_VIEW_TOGGLE_SHORTCUT;
                chrome.storage.local.set({
                    viewToggleShortcut: DEFAULT_VIEW_TOGGLE_SHORTCUT,
                    viewToggleShortcutMigratedToCtrlShiftM: false,
                });
            }
            setShortcutInputDisplayValue(resolvedViewToggleShortcut);
            const extensionUpdateCheckToggle = document.getElementById('extensionUpdateCheckEnabled');
            if (extensionUpdateCheckToggle) {
                extensionUpdateCheckToggle.checked = items[EXTENSION_UPDATE_CHECK_ENABLED_KEY] !== false;
            }
            const dashboardDangerTodoOutlineToggle = document.getElementById('dashboardDangerTodoOutlineEnabled');
            if (dashboardDangerTodoOutlineToggle) {
                dashboardDangerTodoOutlineToggle.checked = items[DASHBOARD_DANGER_TODO_OUTLINE_ENABLED_KEY] !== false;
            }
            renderCustomUserIconSetting(items[CUSTOM_USER_ICON_KEY]);
            const courseQuickNavRadio = document.getElementById(
                items[COURSE_QUICK_NAV_COLLAPSED_KEY] === true
                    ? 'courseQuickNavDefaultCollapsed'
                    : 'courseQuickNavDefaultExpanded'
            );
            if (courseQuickNavRadio) {
                courseQuickNavRadio.checked = true;
            }
            refreshExtensionUpdateStatus();
            lastSavedViewToggleShortcut = resolvedViewToggleShortcut;
            toggleCredentialsArea(autoLoginEnabled);
            if (document.getElementById('todoApiEnabled').checked) {
                refreshTodoProviderStatus();
            }
            } catch (error) {
                console.error('[WebClass UX] Failed to restore options', error);
            }
        }
    );
};
