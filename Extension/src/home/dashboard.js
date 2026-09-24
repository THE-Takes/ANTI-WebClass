// home/dashboard.js
// Dashboard layout construction and dashboard widget behavior.

// --- View State Management ---
// View mode is derived from defaultViewVersion in options.

async function getCurrentView() {
    uxDebugLog('WebClass UX: Getting Current View State');
    const data = await chrome.storage.local.get(['currentView', 'defaultViewVersion']);
    uxDebugLog('WebClass UX: Current View retrieved', data);

    // Legacy migration for old view flags.
    const isLegacyCurrentView = data.currentView === 'enhanced' || data.currentView === 'grid';
    const isLegacyDefaultView = data.defaultViewVersion === '1' || data.defaultViewVersion === '3';
    const normalizedDefaultViewVersion = isLegacyDefaultView ? '2' : data.defaultViewVersion;

    const viewFromSettings = normalizedDefaultViewVersion === 'original' ? 'plain' : 'dashboard';
    const updates = {};

    if (isLegacyCurrentView) updates.currentView = 'dashboard';
    if (isLegacyDefaultView) updates.defaultViewVersion = '2';
    if (data.currentView !== viewFromSettings) updates.currentView = viewFromSettings;

    if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
    }

    return viewFromSettings;
}

/**
 * Dashboard View (Switch View 2) - 3カラムレイアウト
 * ユーザー提案の情報設計に基づいたレイアウト
 */
async function renderDashboardLayout() {
    // ゴミ箱をキャッシュに読み込む
    await loadTrashBin();

    const requestedDashboardTabId = getRequestedHomeDashboardTab();

    // Get reference to original container (will be removed after scraping)
    const originalContainer = document.querySelector('.container');

    // === ページ内のリンクを収集 ===
    const acs = getAcsParameter();
    const baseUrl = 'https://kulms.kanagawa-u.ac.jp/webclass/';

    // サイドバーからリンクを取得する関数
    const findLinkByText = (searchTexts) => {
        const allLinks = document.querySelectorAll('a');
        for (const link of allLinks) {
            const text = link.textContent.trim();
            for (const searchText of searchTexts) {
                if (text.includes(searchText)) {
                    return link.href;
                }
            }
        }
        return null;
    };
    const logoutLinkOnPage = document.querySelector('a[href*="logout.php"]')?.href
        || findLinkByText(['ログアウト', 'Log out', 'Logout']);
    const fallbackLogoutLink = acs
        ? `${baseUrl}logout.php?acs_=${acs}`
        : `${baseUrl}logout.php`;

    // 各ページへのリンクを収集
    const pageLinks = {
        home: acs ? `${baseUrl}?acs_=${acs}` : baseUrl,
        courseList: findLinkByText(['コース一覧', 'Course List']) || (acs ? `${baseUrl}?acs_=${acs}` : baseUrl),
        availableCourses: findLinkByText(['参加可能なコース', 'コースの追加', 'Available Courses'])
            || (acs ? `${baseUrl}index.php/courses/?acs_=${acs}` : `${baseUrl}index.php/courses/`),
        grades: findLinkByText(['成績', 'Grade', '成績表']) || findLinkByText(['レポート']) || '#',
        learningRecord: findLinkByText(['学習記録', 'Learning Record', 'ビューア']) || '#',
        timetable: findLinkByText(['時間割', 'Timetable', 'Schedule']) || (acs ? `${baseUrl}?acs_=${acs}` : baseUrl),
        messages: getMessageInboxUrl(acs),
        logout: logoutLinkOnPage || fallbackLogoutLink,
        settings: chrome.runtime.getURL('src/options.html'),
    };

    const getTermFilterConfig = () => {
        const conditionForms = Array.from(document.querySelectorAll('form[name="condition"]'));
        const termForm = conditionForms.find((form) =>
            form.querySelector('select[name="year"]') && form.querySelector('select[name="semester"]')
        );
        if (!termForm) return null;

        const yearSelect = termForm.querySelector('select[name="year"]');
        const semesterSelect = termForm.querySelector('select[name="semester"]');
        if (!yearSelect || !semesterSelect) return null;

        const serializeSelectOptions = (selectElement) =>
            Array.from(selectElement.options).map((option) => ({
                value: option.value,
                text: option.textContent || option.value,
                selected: option.selected
            }));

        return {
            action: termForm.getAttribute('action') || window.location.href,
            method: (termForm.getAttribute('method') || 'GET').toUpperCase(),
            hiddenEntries: Array.from(new FormData(termForm).entries()).filter(
                ([name]) => name !== 'year' && name !== 'semester'
            ),
            yearOptions: normalizeAcademicYearOptions(serializeSelectOptions(yearSelect)),
            semesterOptions: serializeSelectOptions(semesterSelect)
        };
    };

    const termFilterConfig = getTermFilterConfig();

    // 通常ヘッダーのアカウント表示（アイコン + メニュー）を取得
    const accountMenuElement = document.querySelector('a[title*="アカウントメニュー"], a[title*="Account"]');
    const accountMenuListElement = accountMenuElement
        ? accountMenuElement.parentElement?.querySelector('ul.dropdown-menu')
        : null;
    const languageMenuElement = document.querySelector('a[title*="言語"], a[title*="Language"]');
    const languageMenuListElement = languageMenuElement
        ? languageMenuElement.parentElement?.querySelector('ul.dropdown-menu')
        : null;
    const accountIconElement = accountMenuElement ? accountMenuElement.querySelector('img') : null;
    const originalUserIconSrc = accountIconElement ? (accountIconElement.currentSrc || accountIconElement.src || '') : '';

    // Create Dashboard Container
    const dashboardContainer = document.createElement('div');
    dashboardContainer.id = 'ux-dashboard-v2-container';
    dashboardContainer.className = 'ux-dashboard-v2-container';
    const closeDashboardTermSelectMenus = () => {
        dashboardContainer.querySelectorAll('.ux-select-wrap.ux-open').forEach((wrap) => {
            wrap.classList.remove('ux-open');
            wrap.querySelector('.ux-select-display')?.setAttribute('aria-expanded', 'false');
        });
    };
    const closeDashboardAccountMenus = (exceptContainer = null) => {
        dashboardContainer.querySelectorAll('.ux-dashboard-v2-account.open').forEach((container) => {
            if (container === exceptContainer) return;
            container.classList.remove('open');
            container.querySelector('.ux-dashboard-v2-account-trigger')
                ?.setAttribute('aria-expanded', 'false');
        });
    };
    let closeDashboardLanguageMenu = () => { };
    let dashboardTimetableNameApplyPromise = Promise.resolve();
    let dashboardTimetableElement = null;
    let rerenderDashboardTodosAfterCourseNameApply = async () => { };
    runTodoApiSyncFromBackground = null;

    const dashboardViewSettings = await new Promise(resolve => {
        chrome.storage.local.get({
            [STORAGE_KEY_DASHBOARD_VISIBLE_START_PERIOD]: 1,
            [STORAGE_KEY_DASHBOARD_VISIBLE_END_PERIOD]: 6,
            [STORAGE_KEY_DASHBOARD_VISIBLE_START_WEEKDAY]: 1,
            [STORAGE_KEY_DASHBOARD_VISIBLE_END_WEEKDAY]: 6,
            useCustomCourseNameEnabled: null,
            useRuleCourseNameEnabled: null,
            useShortCourseNameEnabled: null,
            debugModeEnabled: false,
            customUserIconDataUrl: ''
        }, resolve);
    });
    const customUserIconDataUrl = typeof dashboardViewSettings.customUserIconDataUrl === 'string'
        && dashboardViewSettings.customUserIconDataUrl.startsWith('data:image/')
        ? dashboardViewSettings.customUserIconDataUrl
        : '';
    const displayUserIconSrc = customUserIconDataUrl || originalUserIconSrc;
    const debugModeEnabled = !!dashboardViewSettings.debugModeEnabled;
    const dashboardVisibleRange = normalizeDashboardVisibleRange(dashboardViewSettings);
    // レガシー互換性ロジック（options.jsと同じ）
    const legacyShort = dashboardViewSettings.useShortCourseNameEnabled;
    const hasNewToggles =
        dashboardViewSettings.useCustomCourseNameEnabled !== null && dashboardViewSettings.useCustomCourseNameEnabled !== undefined ||
        dashboardViewSettings.useRuleCourseNameEnabled !== null && dashboardViewSettings.useRuleCourseNameEnabled !== undefined;
    const disableAll = !hasNewToggles && legacyShort === false;
    const customNameEnabled = disableAll
        ? false
        : (dashboardViewSettings.useCustomCourseNameEnabled === null || dashboardViewSettings.useCustomCourseNameEnabled === undefined)
            ? true
            : dashboardViewSettings.useCustomCourseNameEnabled;
    const ruleNameEnabled = disableAll
        ? false
        : (dashboardViewSettings.useRuleCourseNameEnabled === null || dashboardViewSettings.useRuleCourseNameEnabled === undefined)
            ? true
            : dashboardViewSettings.useRuleCourseNameEnabled;
    const anyCourseNameSettingEnabled = customNameEnabled || ruleNameEnabled;
    let dashboardTimetableSectionElement = null;
    let dashboardTimetableBodyElement = null;
    let dashboardOutOfScheduleSectionElement = null;
    let dashboardTimetableEditMetaElement = null;
    let dashboardTimetableEditToolbarElement = null;
    let dashboardTimetableEditDoneButton = null;
    let dashboardTimetableEditCancelButton = null;
    let dashboardTimetableEditClearButton = null;
    let dashboardTimetableEditStatusElement = null;
    let dashboardTimetableInlineEditActive = false;
    let dashboardTimetableInlineEditDirty = false;
    let dashboardTimetableInlineEditSaving = false;
    let dashboardTimetableLongPressTimer = 0;
    let dashboardTimetableLongPressOrigin = null;
    let dashboardTimetableSuppressClickUntil = 0;
    let dashboardTimetableInlineEditReferenceBottom = 0;
    let dashboardTimetableInlineEditReferenceReleaseTimer = 0;

    const getDashboardTimetableEditableCells = () => {
        if (!dashboardTimetableElement) return [];
        return Array.from(dashboardTimetableElement.querySelectorAll('tbody td')).filter((cell) => {
            if (!cell || cell.classList.contains('schedule-table-class_order')) return false;
            return !!cell.querySelector('a[href*="course.php"]');
        });
    };

    const getDashboardTimetableInlineInputs = () => {
        if (!dashboardTimetableElement) return [];
        return Array.from(dashboardTimetableElement.querySelectorAll('.ux-timetable-inline-input'));
    };

    const clearDashboardTimetableLongPress = () => {
        if (dashboardTimetableLongPressTimer) {
            clearTimeout(dashboardTimetableLongPressTimer);
            dashboardTimetableLongPressTimer = 0;
        }
        dashboardTimetableLongPressOrigin = null;
    };

    const clearDashboardTimetableInlineEditReferenceReleaseTimer = () => {
        if (dashboardTimetableInlineEditReferenceReleaseTimer) {
            clearTimeout(dashboardTimetableInlineEditReferenceReleaseTimer);
            dashboardTimetableInlineEditReferenceReleaseTimer = 0;
        }
    };

    const captureDashboardTimetableInlineEditReferenceBottom = () => {
        clearDashboardTimetableInlineEditReferenceReleaseTimer();
        const mainStyle = mainContent ? window.getComputedStyle(mainContent) : null;
        const mainPaddingBottom = mainStyle ? (parseFloat(mainStyle.paddingBottom) || 0) : 0;
        const absoluteBottom = window.scrollY + window.innerHeight - mainPaddingBottom;
        if (!Number.isFinite(absoluteBottom) || absoluteBottom <= 0) return;
        dashboardTimetableInlineEditReferenceBottom = absoluteBottom;
    };

    const releaseDashboardTimetableInlineEditReferenceBottom = (delayMs = 180) => {
        if (!dashboardTimetableInlineEditReferenceBottom) return;
        clearDashboardTimetableInlineEditReferenceReleaseTimer();
        dashboardTimetableInlineEditReferenceReleaseTimer = window.setTimeout(() => {
            dashboardTimetableInlineEditReferenceReleaseTimer = 0;
            dashboardTimetableInlineEditReferenceBottom = 0;
            requestCourseLayoutSync();
        }, delayMs);
    };

    const updateDashboardTimetableInlineEditControls = () => {
        if (dashboardTimetableSectionElement) {
            dashboardTimetableSectionElement.classList.toggle('ux-timetable-inline-edit-active', dashboardTimetableInlineEditActive);
        }
        if (dashboardTimetableElement) {
            dashboardTimetableElement.classList.toggle('ux-inline-edit-mode', dashboardTimetableInlineEditActive);
        }
        if (dashboardTimetableEditMetaElement) {
            dashboardTimetableEditMetaElement.classList.toggle('is-active', dashboardTimetableInlineEditActive);
        }
        if (dashboardTimetableEditToolbarElement) {
            dashboardTimetableEditToolbarElement.hidden = !dashboardTimetableInlineEditActive;
            dashboardTimetableEditToolbarElement.classList.toggle('is-dirty', dashboardTimetableInlineEditDirty);
            dashboardTimetableEditToolbarElement.classList.toggle('is-saving', dashboardTimetableInlineEditSaving);
        }
        if (dashboardTimetableEditStatusElement) {
            dashboardTimetableEditStatusElement.textContent = dashboardTimetableInlineEditSaving
                ? '保存中...'
                : (dashboardTimetableInlineEditDirty ? '編集中' : '編集モード');
        }
        if (dashboardTimetableEditDoneButton) {
            dashboardTimetableEditDoneButton.disabled = dashboardTimetableInlineEditSaving;
            dashboardTimetableEditDoneButton.textContent = dashboardTimetableInlineEditSaving
                ? '保存中...'
                : (dashboardTimetableInlineEditDirty ? '保存' : '完了');
        }
        if (dashboardTimetableEditCancelButton) {
            dashboardTimetableEditCancelButton.disabled = dashboardTimetableInlineEditSaving;
        }
        if (dashboardTimetableEditClearButton) {
            dashboardTimetableEditClearButton.disabled = dashboardTimetableInlineEditSaving;
        }
    };

    const refreshDashboardTimetableInlineDirtyState = () => {
        const hasDirtyInput = getDashboardTimetableInlineInputs().some((input) => input.dataset.dirty === 'true');
        dashboardTimetableInlineEditDirty = hasDirtyInput;
        updateDashboardTimetableInlineEditControls();
    };

    const teardownDashboardTimetableInlineEdit = () => {
        getDashboardTimetableInlineInputs().forEach((input) => input.remove());
        if (!dashboardTimetableElement) return;

        dashboardTimetableElement.querySelectorAll('.ux-timetable-inline-link-hidden').forEach((link) => {
            link.classList.remove('ux-timetable-inline-link-hidden');
            link.removeAttribute('aria-hidden');
            link.removeAttribute('tabindex');
        });
        dashboardTimetableElement.querySelectorAll('.ux-inline-editable-cell').forEach((cell) => {
            cell.classList.remove('ux-inline-editable-cell', 'ux-inline-edit-dirty', 'ux-inline-edit-focus');
            cell.removeAttribute('data-editable-course');
            cell.style.removeProperty('--ux-inline-edit-delay');
        });
        dashboardTimetableInlineEditDirty = false;
    };

    const exitDashboardTimetableInlineEditMode = ({ keepDirtyState = false } = {}) => {
        if (!dashboardTimetableInlineEditActive && !getDashboardTimetableInlineInputs().length) return;
        clearDashboardTimetableLongPress();
        teardownDashboardTimetableInlineEdit();
        dashboardTimetableInlineEditActive = false;
        if (!keepDirtyState) {
            dashboardTimetableInlineEditDirty = false;
        }
        updateDashboardTimetableInlineEditControls();
        requestCourseLayoutSync();
        releaseDashboardTimetableInlineEditReferenceBottom();
    };

    const focusNextDashboardTimetableInlineInput = (currentInput) => {
        const inputs = getDashboardTimetableInlineInputs();
        const currentIndex = inputs.indexOf(currentInput);
        const nextInput = currentIndex >= 0 ? inputs[currentIndex + 1] : null;
        if (nextInput) {
            nextInput.focus();
            nextInput.select();
        } else if (currentInput) {
            currentInput.blur();
        }
    };

    const saveDashboardTimetableInlineCourseNames = async ({ clearAll = false } = {}) => {
        if (!customNameEnabled || dashboardTimetableInlineEditSaving) return;

        dashboardTimetableInlineEditSaving = true;
        updateDashboardTimetableInlineEditControls();

        try {
            const existingCustomNames = await window.WebClassScraper.loadCustomCourseNames().catch(() => ({}));
            const nextCustomNames = clearAll ? {} : { ...existingCustomNames };

            if (!clearAll) {
                getDashboardTimetableInlineInputs().forEach((input) => {
                    const courseId = (input.dataset.courseId || '').trim();
                    const originalName = input.dataset.originalName || '';
                    const hadCustom = input.dataset.hadCustom === 'true';
                    const isDirty = input.dataset.dirty === 'true';
                    if (!courseId || (!hadCustom && !isDirty)) {
                        return;
                    }

                    const nextCustomName = resolveEditedCustomCourseName(input.value, originalName);
                    if (nextCustomName) {
                        nextCustomNames[courseId] = nextCustomName;
                    } else {
                        delete nextCustomNames[courseId];
                    }
                });
            }

            await window.WebClassScraper.saveCustomCourseNames(nextCustomNames);
            await updateAssignmentCourseNames(nextCustomNames);

            exitDashboardTimetableInlineEditMode();

            const assignments = await loadAssignments();
            await applyCustomCourseNamesToTimetable();

            dashboardTimetableNameApplyPromise = applyDashboardCachedCourseNamesToTimetable().catch((error) => {
                uxDebugWarn('[WebClass UX] Dashboard timetable custom-name apply failed', error);
            });
            await dashboardTimetableNameApplyPromise;
            await rerenderDashboardTodosAfterCourseNameApply();
            applyTimetableColorsFromTodo(assignments);
            requestCourseLayoutSync();
        } catch (error) {
            console.error('[WebClass UX] インライン授業名編集の保存に失敗:', error);
            alert('授業名の保存に失敗しました: ' + error.message);
        } finally {
            dashboardTimetableInlineEditSaving = false;
            updateDashboardTimetableInlineEditControls();
        }
    };

    const requestDashboardTimetableInlineEditCancel = () => {
        if (dashboardTimetableInlineEditSaving) return;
        if (dashboardTimetableInlineEditDirty && !confirm('未保存の変更を破棄しますか？')) {
            return;
        }
        exitDashboardTimetableInlineEditMode();
    };

    const enterDashboardTimetableInlineEditMode = async () => {
        if (!customNameEnabled || dashboardTimetableInlineEditActive || dashboardTimetableInlineEditSaving || !dashboardTimetableElement) {
            return;
        }

        const editableCells = getDashboardTimetableEditableCells();
        if (!editableCells.length) return;

        clearDashboardTimetableLongPress();
        captureDashboardTimetableInlineEditReferenceBottom();
        dashboardTimetableInlineEditActive = true;
        dashboardTimetableInlineEditDirty = false;

        const customNames = await window.WebClassScraper.loadCustomCourseNames().catch(() => ({}));

        editableCells.forEach((cell, index) => {
            const link = cell.querySelector('a[href*="course.php"]');
            if (!link) return;

            const href = link.getAttribute('href') || '';
            const courseId = extractCourseIdFromUrl(href);
            if (!courseId) return;

            if (!link.dataset.originalText) {
                link.dataset.originalText = stripTimetableCourseStatusIndicators(link);
            } else {
                stripTimetableCourseStatusIndicators(link);
            }
            const originalName = normalizeDevdevCourseText(link.dataset.originalText || link.textContent || '');
            const currentDisplayName = normalizeDevdevCourseText(link.textContent || '') || originalName;
            const existingCustomName = resolveEditedCustomCourseName(customNames[courseId], originalName);

            cell.classList.add('ux-inline-editable-cell');
            cell.setAttribute('data-editable-course', 'true');
            cell.style.setProperty('--ux-inline-edit-delay', `${(index % 6) * 45}ms`);

            link.classList.add('ux-timetable-inline-link-hidden');
            link.setAttribute('aria-hidden', 'true');
            link.setAttribute('tabindex', '-1');

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'ux-timetable-inline-input';
            input.value = currentDisplayName;
            input.placeholder = originalName;
            input.spellcheck = false;
            input.autocomplete = 'off';
            input.dataset.courseId = courseId;
            input.dataset.originalName = originalName;
            input.dataset.initialValue = currentDisplayName;
            input.dataset.hadCustom = existingCustomName ? 'true' : 'false';
            input.dataset.dirty = 'false';

            const syncInputDirtyState = () => {
                const currentValue = normalizeDevdevCourseText(input.value || '');
                const initialValue = normalizeDevdevCourseText(input.dataset.initialValue || '');
                const isDirty = currentValue !== initialValue;
                input.dataset.dirty = isDirty ? 'true' : 'false';
                cell.classList.toggle('ux-inline-edit-dirty', isDirty);
                refreshDashboardTimetableInlineDirtyState();
            };

            input.addEventListener('input', syncInputDirtyState);
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    focusNextDashboardTimetableInlineInput(input);
                }
            });
            input.addEventListener('focus', () => {
                cell.classList.add('ux-inline-edit-focus');
            });
            input.addEventListener('blur', () => {
                cell.classList.remove('ux-inline-edit-focus');
            });

            cell.appendChild(input);
        });

        dashboardTimetableSuppressClickUntil = Date.now() + 800;
        updateDashboardTimetableInlineEditControls();
        requestCourseLayoutSync();
    };

    const handleDashboardTimetablePointerDown = (event) => {
        if (!customNameEnabled || dashboardTimetableInlineEditActive || dashboardTimetableInlineEditSaving || !dashboardTimetableBodyElement) {
            return;
        }
        if (!(event.target instanceof Element) || !dashboardTimetableBodyElement.contains(event.target)) {
            return;
        }
        if (dashboardTimetableEditMetaElement && dashboardTimetableEditMetaElement.contains(event.target)) {
            return;
        }
        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        clearDashboardTimetableLongPress();
        dashboardTimetableLongPressOrigin = {
            x: Number.isFinite(event.clientX) ? event.clientX : 0,
            y: Number.isFinite(event.clientY) ? event.clientY : 0
        };
        dashboardTimetableLongPressTimer = window.setTimeout(() => {
            dashboardTimetableLongPressTimer = 0;
            enterDashboardTimetableInlineEditMode();
        }, DASHBOARD_TIMETABLE_INLINE_EDIT_LONG_PRESS_MS);
    };

    const handleDashboardTimetablePointerMove = (event) => {
        if (!dashboardTimetableLongPressOrigin) return;
        const dx = (Number.isFinite(event.clientX) ? event.clientX : 0) - dashboardTimetableLongPressOrigin.x;
        const dy = (Number.isFinite(event.clientY) ? event.clientY : 0) - dashboardTimetableLongPressOrigin.y;
        if (Math.hypot(dx, dy) > DASHBOARD_TIMETABLE_INLINE_EDIT_MOVE_TOLERANCE_PX) {
            clearDashboardTimetableLongPress();
        }
    };

    const handleDashboardTimetableClickCapture = (event) => {
        if (Date.now() < dashboardTimetableSuppressClickUntil) {
            event.preventDefault();
            event.stopPropagation();
        }
    };

    const handleDashboardTimetableInlineEditClick = (event) => {
        if (!dashboardTimetableInlineEditActive) return;
        if (!(event.target instanceof Element) || !dashboardTimetableBodyElement) return;
        if (dashboardTimetableEditMetaElement && dashboardTimetableEditMetaElement.contains(event.target)) return;
        if (event.target.closest('.ux-timetable-inline-input')) return;

        const cell = event.target.closest('td');
        if (!cell || !dashboardTimetableBodyElement.contains(cell)) return;
        if (cell.classList.contains('schedule-table-class_order')) return;
        if (cell.querySelector('a[href*="course.php"]')) return;

        requestDashboardTimetableInlineEditCancel();
    };

    const handleDashboardTimetableInlineEditKeydown = (event) => {
        if (!dashboardTimetableInlineEditActive) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            requestDashboardTimetableInlineEditCancel();
        }
    };

    const applyDashboardCachedCourseNamesToTimetable = async () => {
        if (!dashboardTimetableElement) return;

        const storageData = await new Promise(resolve => {
            chrome.storage.local.get({
                [STORAGE_KEY_SHORT_COURSE_CACHE]: {}
            }, resolve);
        });
        const anyNameSettingForCustom = customNameEnabled || ruleNameEnabled;
        const customNames = anyNameSettingForCustom && window.WebClassScraper?.loadCustomCourseNames
            ? await window.WebClassScraper.loadCustomCourseNames().catch(() => ({}))
            : {};
        const shortCourseCache = ruleNameEnabled ? (storageData[STORAGE_KEY_SHORT_COURSE_CACHE] || {}) : {};

        const links = dashboardTimetableElement.querySelectorAll('tbody td a[href*="course.php"]');
        links.forEach((link) => {
            if (!link.dataset.originalText) {
                link.dataset.originalText = stripTimetableCourseStatusIndicators(link);
            } else {
                stripTimetableCourseStatusIndicators(link);
            }
            const rawFullName = (link.dataset.originalText || link.textContent || '').trim();
            const fullName = normalizeDevdevCourseText(rawFullName);
            if (!rawFullName) return;

            const href = link.getAttribute('href') || '';
            const courseIdFromHref = extractCourseIdFromUrl(href);
            const legacyCourseIdMatch = href.match(/course\.php\/([^\/]+)/);
            const legacyCourseId = legacyCourseIdMatch ? legacyCourseIdMatch[1].trim() : '';
            const courseIdCandidates = Array.from(new Set([courseIdFromHref, legacyCourseId].filter(Boolean)));
            const courseId = courseIdCandidates[0] || '';

            if (anyNameSettingForCustom) {
                const customName = resolveEditedCustomCourseName(
                    courseId ? customNames[courseId] : '',
                    rawFullName
                );
                if (customName) {
                    link.textContent = customName;
                    return;
                }
            }

            if (ruleNameEnabled) {
                const cachedShort = getShortCourseFromCache(shortCourseCache, courseId, [fullName, rawFullName, link.textContent || '']);
                if (cachedShort) {
                    link.textContent = cachedShort;
                    return;
                }
                link.textContent = fallbackCourseName(rawFullName);
            }
        });
    };

    const DEBUG_MODE_ACTIVATION_CLICK_COUNT = 7;
    const DEBUG_MODE_ACTIVATION_CLICK_TIMEOUT_MS = 1000;
    let debugModeActivationClicks = 0;
    let lastDebugModeActivationClickAt = 0;

    // === Header ===
    const header = document.createElement('header');
    header.className = 'ux-dashboard-v2-header';

    // Left: non-navigating WebClass brand
    const headerLeft = document.createElement('div');
    headerLeft.className = 'ux-dashboard-v2-header-left';
    const logo = document.createElement('button');
    logo.type = 'button';
    logo.className = 'ux-dashboard-v2-logo';
    logo.textContent = 'WebClass';
    logo.setAttribute('aria-label', 'WebClass');
    logo.addEventListener('click', () => {
        const clickedAt = Date.now();
        if (clickedAt - lastDebugModeActivationClickAt > DEBUG_MODE_ACTIVATION_CLICK_TIMEOUT_MS) {
            debugModeActivationClicks = 0;
        }
        lastDebugModeActivationClickAt = clickedAt;
        debugModeActivationClicks += 1;
        if (debugModeActivationClicks < DEBUG_MODE_ACTIVATION_CLICK_COUNT) return;

        debugModeActivationClicks = 0;
        toggleUxDebugMode();
    });
    headerLeft.appendChild(logo);

    // Center: Main tabs
    const headerCenter = document.createElement('nav');
    headerCenter.className = 'ux-dashboard-v2-header-nav';
    headerCenter.setAttribute('aria-label', 'ホームのメインタブ');
    headerCenter.setAttribute('role', 'tablist');

    const headerTabs = [
        { name: 'コース', icon: 'course', href: pageLinks.courseList, active: true, id: 'tab-course', mainTab: true },
        { name: 'メッセージ', icon: 'messages', href: '#', active: false, id: 'tab-messages', mainTab: true },
        { name: 'ユーティリティ', icon: 'utilities', href: '#', active: false, id: 'tab-stats', mainTab: true },
        { name: 'デバッグ', icon: 'debug', href: '#', active: false, id: 'tab-debug', mainTab: true }
    ];

    const openOptionsSafely = () => {
        if (chrome.runtime?.openOptionsPage) {
            chrome.runtime.openOptionsPage();
            return;
        }
        chrome.runtime?.sendMessage?.({ type: 'OPEN_OPTIONS_PAGE_FALLBACK' }, (res) => {
            if (chrome.runtime.lastError) {
                uxDebugWarn('openOptionsPage fallback error:', chrome.runtime.lastError.message);
            }
            if (res?.success) return;
            window.open(pageLinks.settings, '_blank');
        });
    };

    let requestCourseLayoutSync = () => { };
    let applyDashboardCourseNamesToOutOfSchedulePanel = async () => { };

    const setActiveDashboardMainTab = (tabId) => {
        headerCenter.querySelectorAll('.ux-dashboard-v2-tab[data-dashboard-main-tab="1"]').forEach((tabEl) => {
            tabEl.classList.remove('active');
            tabEl.setAttribute('aria-selected', 'false');
            tabEl.tabIndex = -1;
        });
        const activeTab = headerCenter.querySelector(`#${tabId}`);
        if (activeTab) {
            activeTab.classList.add('active');
            activeTab.setAttribute('aria-selected', 'true');
            activeTab.tabIndex = 0;
        }
    };

    const switchDashboardMainTab = (tabId) => {
        const timetableSectionEl = document.getElementById('ux-timetable-section');
        const messageSectionEl = document.getElementById('ux-messages-section');
        const statsSectionEl = document.getElementById('ux-stats-section');
        const debugSectionEl = document.getElementById('ux-debug-section');
        const rightCol = document.querySelector('.ux-dashboard-v2-right');
        const centerCol = document.querySelector('.ux-dashboard-v2-center');
        const outsideCourseSectionEl = document.getElementById('ux-outside-courses-section');

        const showCourse = tabId === 'tab-course';
        const showMessages = tabId === 'tab-messages';
        const showStats = tabId === 'tab-stats';
        const showDebug = tabId === 'tab-debug' && !!debugSectionEl;

        if (timetableSectionEl) timetableSectionEl.style.display = showCourse ? 'flex' : 'none';
        if (outsideCourseSectionEl) outsideCourseSectionEl.style.display = showCourse ? 'flex' : 'none';
        if (messageSectionEl) {
            messageSectionEl.style.display = showMessages ? 'flex' : 'none';
            messageSectionEl.setAttribute('aria-hidden', showMessages ? 'false' : 'true');
        }
        if (statsSectionEl) statsSectionEl.style.display = showStats ? 'block' : 'none';
        if (debugSectionEl) debugSectionEl.style.display = showDebug ? 'block' : 'none';

        if (rightCol) rightCol.style.display = showCourse ? 'flex' : 'none';
        if (centerCol) centerCol.style.gridColumn = showCourse ? '' : '1 / -1';
        if (showCourse) {
            requestCourseLayoutSync();
        } else {
            document.body.classList.remove('ux-dashboard-v2-stacked-layout');
        }
    };

    const activateDashboardMainTab = (tabId) => {
        const currentActiveTabId = headerCenter
            .querySelector('.ux-dashboard-v2-tab[data-dashboard-main-tab="1"].active')
            ?.id;
        if (currentActiveTabId === tabId) {
            return;
        }
        setActiveDashboardMainTab(tabId);
        switchDashboardMainTab(tabId);
    };

    let debugTabEl = null;
    headerTabs.forEach(tabInfo => {
        const tab = document.createElement('a');
        tab.href = tabInfo.href;
        tab.className = 'ux-dashboard-v2-tab' + (tabInfo.active ? ' active' : '');
        const tabContent = createDashboardTabContent(tabInfo);
        tab.appendChild(tabContent.icon);
        tab.appendChild(tabContent.label);
        if (tabInfo.id) tab.id = tabInfo.id;
        if (tabInfo.mainTab) {
            tab.dataset.dashboardMainTab = '1';
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-selected', tabInfo.active ? 'true' : 'false');
            tab.tabIndex = tabInfo.active ? 0 : -1;
        }
        if (tabInfo.id === 'tab-messages') {
            tab.setAttribute('aria-controls', 'ux-messages-section');
            tab.setAttribute('aria-label', 'メッセージ');
            const badge = document.createElement('span');
            badge.className = 'ux-dashboard-v2-tab-badge';
            badge.hidden = true;
            tab.appendChild(badge);
        }
        if (tabInfo.id === 'tab-debug') {
            debugTabEl = tab;
            tab.hidden = !debugModeEnabled;
            tab.setAttribute('aria-hidden', debugModeEnabled ? 'false' : 'true');
        }

        if (tabInfo.newTab) {
            tab.target = '_blank';
        }

        // Handle switching between Course / Utility / Debug
        if (tabInfo.mainTab) {
            tab.onclick = (e) => {
                e.preventDefault();
                activateDashboardMainTab(tabInfo.id);
            };
        }
        headerCenter.appendChild(tab);
    });

    headerCenter.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        const tabs = Array.from(
            headerCenter.querySelectorAll('.ux-dashboard-v2-tab[data-dashboard-main-tab="1"]:not([hidden])')
        );
        const currentIndex = tabs.indexOf(document.activeElement);
        if (currentIndex < 0) return;
        event.preventDefault();
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const nextTab = tabs[(currentIndex + direction + tabs.length) % tabs.length];
        activateDashboardMainTab(nextTab.id);
        nextTab.focus();
    });

    // Right: Actions and user info
    const headerRight = document.createElement('div');
    headerRight.className = 'ux-dashboard-v2-header-right';

    const createHeaderIconLink = ({ id, className, href, label, title, icon }) => {
        const link = document.createElement('a');
        link.className = `ux-dashboard-v2-header-link ${className}`;
        if (id) link.id = id;
        link.href = href;
        link.setAttribute('aria-label', label);
        link.title = title || label;
        link.innerHTML = icon;
        return link;
    };

    const createLanguageHeaderControl = () => {
        const languageContainer = document.createElement('div');
        languageContainer.className = 'ux-dashboard-v2-language';

        const languageTrigger = createHeaderIconLink({
            id: 'tab-language',
            className: 'ux-dashboard-v2-language-trigger',
            href: '#',
            label: '言語',
            title: '言語',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${UX_LANGUAGE_CHANGE_ICON_MARKUP}</svg>`,
        });
        languageTrigger.setAttribute('role', 'button');
        languageTrigger.setAttribute('aria-haspopup', 'true');
        languageTrigger.setAttribute('aria-expanded', 'false');

        const languageMenu = document.createElement('ul');
        languageMenu.className = 'ux-dashboard-v2-account-menu ux-dashboard-v2-language-menu';
        languageMenu.setAttribute('role', 'menu');
        if (languageMenuListElement) {
            Array.from(languageMenuListElement.children).forEach((child) => {
                const link = child.querySelector?.('a');
                if (!link) return;

                const menuItem = document.createElement('li');
                const clonedLink = link.cloneNode(true);
                clonedLink.setAttribute('role', 'menuitem');
                menuItem.appendChild(clonedLink);
                languageMenu.appendChild(menuItem);
            });
        }

        const closeLanguageMenu = () => {
            languageContainer.classList.remove('open');
            languageTrigger.setAttribute('aria-expanded', 'false');
        };
        closeDashboardLanguageMenu = closeLanguageMenu;

        languageTrigger.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const willOpen = !languageContainer.classList.contains('open');
            closeDashboardTermSelectMenus();
            closeDashboardAccountMenus();
            if (willOpen) {
                languageContainer.classList.add('open');
                languageTrigger.setAttribute('aria-expanded', 'true');
            } else {
                closeLanguageMenu();
            }
        });

        languageMenu.addEventListener('click', (event) => {
            if (event.target?.closest('a')) closeLanguageMenu();
        });

        document.addEventListener('click', (event) => {
            if (!languageContainer.contains(event.target)) closeLanguageMenu();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeLanguageMenu();
        });

        languageContainer.appendChild(languageTrigger);
        languageContainer.appendChild(languageMenu);
        return languageContainer;
    };

    const languageHeaderControl = createLanguageHeaderControl();
    let dashboardSettingsOverlay = null;
    const settingsButton = createHeaderIconLink({
        id: 'tab-settings',
        className: 'ux-dashboard-v2-settings',
        href: pageLinks.settings,
        label: '設定',
        title: '設定を開く',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15Z"/></svg>'
    });
    const openSettingsHandler = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (dashboardSettingsOverlay?.open()) return;
        openOptionsSafely();
    };
    settingsButton.setAttribute('role', 'button');
    dashboardSettingsOverlay = typeof createDashboardSettingsOverlay === 'function'
        ? createDashboardSettingsOverlay({
            container: dashboardContainer,
            settingsUrl: pageLinks.settings,
            trigger: settingsButton
        })
        : null;
    settingsButton.onclick = openSettingsHandler;
    settingsButton.onauxclick = openSettingsHandler; // Prevent opening a duplicate tab with the middle button.

    headerRight.appendChild(settingsButton);
    headerRight.appendChild(languageHeaderControl);
    const logoutButton = createHeaderIconLink({
        className: 'ux-dashboard-v2-logout',
        href: pageLinks.logout,
        label: 'ログアウト',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
    });
    headerRight.appendChild(logoutButton);

    if (displayUserIconSrc) {
        const accountContainer = document.createElement('div');
        accountContainer.className = 'ux-dashboard-v2-account';

        const accountTrigger = document.createElement('button');
        accountTrigger.type = 'button';
        accountTrigger.className = 'ux-dashboard-v2-account-trigger';
        accountTrigger.title = 'アカウントメニュー';
        accountTrigger.setAttribute('aria-haspopup', 'true');
        accountTrigger.setAttribute('aria-expanded', 'false');

        const userIcon = document.createElement('img');
        userIcon.className = 'ux-dashboard-v2-user-icon';
        userIcon.src = displayUserIconSrc;
        userIcon.alt = 'ユーザーアイコン';
        accountTrigger.appendChild(userIcon);

        const accountDropdown = document.createElement('ul');
        accountDropdown.className = 'ux-dashboard-v2-account-menu';
        const isCourseListMenuLabel = (label) => {
            const normalized = (label || '').replace(/\s+/g, '').toLowerCase();
            return normalized.includes('コースリスト') || normalized.includes('courselist');
        };
        const removeRedundantDividers = (menuElement) => {
            let previousWasDivider = true;
            Array.from(menuElement.children).forEach((item) => {
                const isDivider = item.classList?.contains('divider');
                if (isDivider && previousWasDivider) {
                    item.remove();
                    return;
                }
                previousWasDivider = !!isDivider;
            });
            const lastItem = menuElement.lastElementChild;
            if (lastItem && lastItem.classList?.contains('divider')) {
                lastItem.remove();
            }
        };

        if (accountMenuListElement) {
            Array.from(accountMenuListElement.children).forEach((child) => {
                const clonedChild = child.cloneNode(true);
                const link = clonedChild.querySelector ? clonedChild.querySelector('a') : null;
                const label = link ? (link.textContent || '').trim() : '';
                if (link && isCourseListMenuLabel(label)) return;
                accountDropdown.appendChild(clonedChild);
            });
        } else {
            const fallbackLinks = Array.from(document.querySelectorAll('a.account-menu__menu__link'));
            const seen = new Set();
            fallbackLinks.forEach((link) => {
                const href = link.getAttribute('href') || '';
                const label = (link.textContent || '').trim();
                const key = `${href}::${label}`;
                if (!label || seen.has(key) || isCourseListMenuLabel(label)) return;
                seen.add(key);
                const li = document.createElement('li');
                li.appendChild(link.cloneNode(true));
                accountDropdown.appendChild(li);
            });
        }
        removeRedundantDividers(accountDropdown);

        const closeAccountMenu = () => {
            accountContainer.classList.remove('open');
            accountTrigger.setAttribute('aria-expanded', 'false');
        };

        accountTrigger.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const willOpen = !accountContainer.classList.contains('open');
            if (willOpen) {
                closeDashboardTermSelectMenus();
                closeDashboardAccountMenus(accountContainer);
                closeDashboardLanguageMenu();
                accountContainer.classList.add('open');
                accountTrigger.setAttribute('aria-expanded', 'true');
            } else {
                closeAccountMenu();
            }
        });

        accountDropdown.addEventListener('click', (event) => {
            if (event.target && event.target.closest('a')) {
                closeAccountMenu();
            }
        });

        document.addEventListener('click', (event) => {
            if (!accountContainer.contains(event.target)) {
                closeAccountMenu();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeAccountMenu();
                closeDashboardTermSelectMenus();
            }
        });

        accountContainer.appendChild(accountTrigger);
        accountContainer.appendChild(accountDropdown);
        headerRight.appendChild(accountContainer);
    }

    header.appendChild(headerLeft);
    header.appendChild(headerCenter);
    header.appendChild(headerRight);
    dashboardContainer.appendChild(header);

    const syncDashboardHeaderHeightVariable = () => {
        const headerHeight = Math.ceil(header.getBoundingClientRect().height);
        if (Number.isFinite(headerHeight) && headerHeight > 0) {
            dashboardContainer.style.setProperty('--ux-dashboard-header-height', `${headerHeight}px`);
        }
    };
    syncDashboardHeaderHeightVariable();

    // === Main 2-Column Layout (Left Removed) ===
    const mainContent = document.createElement('div');
    mainContent.className = 'ux-dashboard-v2-main';

    // --- Center Column: Timetable ---
    const centerColumn = document.createElement('main');
    centerColumn.className = 'ux-dashboard-v2-center';

    // Get today's day of week
    const today = getWebClassNow();
    const todayWeekdayIndex = today.getDay();

    // Timetable Section (Week View)
    const timetableSection = document.createElement('section');
    timetableSection.id = 'ux-timetable-section';
    timetableSection.className = 'ux-dashboard-v2-section ux-dashboard-v2-timetable';
    timetableSection.setAttribute('aria-label', 'Weekly timetable');
    timetableSection.style.flex = '0 0 auto';
    timetableSection.style.minHeight = '0';
    timetableSection.style.boxSizing = 'border-box';
    dashboardTimetableSectionElement = timetableSection;

    // タイトル行
    const timetableHeaderRow = document.createElement('div');
    timetableHeaderRow.className = 'ux-timetable-header-row';
    timetableHeaderRow.style.display = 'flex';
    timetableHeaderRow.style.alignItems = 'baseline';
    timetableHeaderRow.style.justifyContent = 'flex-start';
    timetableHeaderRow.style.flexWrap = 'wrap';
    timetableHeaderRow.style.gap = '6px';

    const timetableHeaderActions = document.createElement('div');
    timetableHeaderActions.className = 'ux-timetable-header-actions';

    const addCourseButton = document.createElement('a');
    addCourseButton.className = 'ux-timetable-add-course-btn';
    addCourseButton.href = pageLinks.availableCourses;
    addCourseButton.setAttribute('aria-label', 'コースを追加');
    addCourseButton.title = '参加可能なコースを開く';
    addCourseButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>';
    timetableHeaderActions.appendChild(addCourseButton);

    if (termFilterConfig && termFilterConfig.yearOptions.length && termFilterConfig.semesterOptions.length) {
        const submitTermFilter = (yearValue, semesterValue) => {
            const submitForm = document.createElement('form');
            submitForm.method = termFilterConfig.method || 'GET';
            submitForm.action = termFilterConfig.action || window.location.href;
            submitForm.style.display = 'none';

            const appendHiddenInput = (name, value) => {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = name;
                input.value = value == null ? '' : String(value);
                submitForm.appendChild(input);
            };

            termFilterConfig.hiddenEntries.forEach(([name, value]) => {
                appendHiddenInput(name, value);
            });
            appendHiddenInput('year', yearValue);
            appendHiddenInput('semester', semesterValue);

            document.body.appendChild(submitForm);
            submitForm.submit();
        };

        const buildTermSelect = (name, options, ariaLabel, maxVisibleItems = 0) => {
            const itemHeight = 32;
            const listMaxHeight = maxVisibleItems === 0 ? 'none' : `${maxVisibleItems * itemHeight}px`;

            // ネイティブselect（非表示）
            const select = document.createElement('select');
            select.name = name;
            select.className = 'ux-native-select';
            select.setAttribute('aria-label', ariaLabel);

            let selectedIndex = 0;
            options.forEach((item, idx) => {
                const option = document.createElement('option');
                option.value = item.value;
                option.textContent = item.text;
                option.selected = !!item.selected;
                if (item.selected) selectedIndex = idx;
                select.appendChild(option);
            });

            // ラッパー
            const wrap = document.createElement('div');
            wrap.className = 'ux-select-wrap ux-term-select-wrap';

            // 表示ボタン
            const display = document.createElement('button');
            display.type = 'button';
            display.className = 'ux-select-display';
            display.textContent = options[selectedIndex]?.text || '';
            display.style.fontSize = 'var(--ux-select-display-font-size, 14px)';
            display.style.minHeight = '34px';
            display.setAttribute('aria-haspopup', 'listbox');
            display.setAttribute('aria-expanded', 'false');
            display.setAttribute('aria-label', ariaLabel);

            // ドロップダウンリスト
            const list = document.createElement('div');
            list.className = 'ux-select-list';
            list.style.maxHeight = listMaxHeight;
            list.style.overflowY = maxVisibleItems === 0 ? 'visible' : 'auto';
            list.setAttribute('role', 'listbox');
            list.setAttribute('aria-label', ariaLabel);

            const items = [];
            options.forEach((opt, idx) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'ux-select-option';
                item.textContent = opt.text;
                item.setAttribute('role', 'option');
                item.style.fontSize = 'var(--ux-select-option-font-size, 14px)';
                item.style.minHeight = '34px';
                item.style.lineHeight = '1.25';
                if (opt.selected) {
                    item.setAttribute('aria-selected', 'true');
                }
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const state = wrap.__uxSelectState;
                    if (!state) return;
                    state.pendingIndex = idx;
                    display.textContent = opt.text;
                    list.querySelectorAll('.ux-select-option').forEach((btn) => btn.removeAttribute('aria-selected'));
                    item.setAttribute('aria-selected', 'true');
                    // コミットして閉じる
                    select.value = opt.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    wrap.classList.remove('ux-open');
                    display.setAttribute('aria-expanded', 'false');
                });
                list.appendChild(item);
                items.push(item);
            });

            wrap.appendChild(select);
            wrap.appendChild(display);
            wrap.appendChild(list);

            const state = {
                select,
                display,
                list,
                items,
                pendingIndex: selectedIndex
            };
            wrap.__uxSelectState = state;

            // 表示ボタンクリックでトグル
            display.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isOpen = wrap.classList.contains('ux-open');
                // 他のオープン中のセレクトを閉じる
                dashboardContainer.querySelectorAll('.ux-select-wrap.ux-open').forEach((w) => {
                    w.classList.remove('ux-open');
                    w.querySelector('.ux-select-display')?.setAttribute('aria-expanded', 'false');
                });
                if (!isOpen) {
                    closeDashboardAccountMenus();
                    wrap.classList.add('ux-open');
                    display.setAttribute('aria-expanded', 'true');
                }
            });

            return { wrap, select };
        };

        const termFilterWrap = document.createElement('div');
        termFilterWrap.className = 'ux-dashboard-v2-term-filter';

        const { wrap: yearWrap, select: yearSelect } = buildTermSelect('year', termFilterConfig.yearOptions, '年度', 5);
        const { wrap: semesterWrap, select: semesterSelect } = buildTermSelect('semester', termFilterConfig.semesterOptions, '学期', 0);
        const onTermChanged = () => submitTermFilter(yearSelect.value, semesterSelect.value);

        yearSelect.addEventListener('change', onTermChanged);
        semesterSelect.addEventListener('change', onTermChanged);

        termFilterWrap.appendChild(yearWrap);
        termFilterWrap.appendChild(semesterWrap);
        timetableHeaderRow.appendChild(termFilterWrap);

        // 外側クリックで閉じる
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.ux-term-select-wrap')) {
                closeDashboardTermSelectMenus();
            }
        });
    }

    if (customNameEnabled) {
        const editMeta = document.createElement('div');
        editMeta.className = 'ux-timetable-inline-edit-meta';

        const editToolbar = document.createElement('div');
        editToolbar.className = 'ux-timetable-inline-edit-toolbar';
        editToolbar.hidden = true;

        const editStatus = document.createElement('span');
        editStatus.className = 'ux-timetable-inline-edit-status';
        editStatus.textContent = '編集モード';
        editToolbar.appendChild(editStatus);
        dashboardTimetableEditStatusElement = editStatus;

        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.className = 'ux-timetable-inline-edit-clear';
        clearButton.textContent = 'クリア';
        clearButton.addEventListener('click', async () => {
            if (!confirm('カスタム授業名をすべて削除して元の表示に戻しますか？')) {
                return;
            }
            await saveDashboardTimetableInlineCourseNames({ clearAll: true });
        });
        editToolbar.appendChild(clearButton);
        dashboardTimetableEditClearButton = clearButton;

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'ux-timetable-inline-edit-cancel';
        cancelButton.textContent = 'キャンセル';
        cancelButton.addEventListener('click', () => {
            requestDashboardTimetableInlineEditCancel();
        });
        editToolbar.appendChild(cancelButton);
        dashboardTimetableEditCancelButton = cancelButton;

        const doneButton = document.createElement('button');
        doneButton.type = 'button';
        doneButton.className = 'ux-timetable-inline-edit-done';
        doneButton.textContent = '完了';
        doneButton.addEventListener('click', async () => {
            if (dashboardTimetableInlineEditDirty) {
                await saveDashboardTimetableInlineCourseNames();
                return;
            }
            exitDashboardTimetableInlineEditMode();
        });
        editToolbar.appendChild(doneButton);
        dashboardTimetableEditDoneButton = doneButton;

        editMeta.appendChild(editToolbar);
        dashboardTimetableEditToolbarElement = editToolbar;
        dashboardTimetableEditMetaElement = editMeta;
        timetableHeaderActions.appendChild(editMeta);

        document.addEventListener('keydown', handleDashboardTimetableInlineEditKeydown, true);
    }

    timetableHeaderRow.appendChild(timetableHeaderActions);

    const timetableToolbar = document.createElement('div');
    timetableToolbar.className = 'ux-dashboard-v2-timetable-toolbar';
    timetableToolbar.appendChild(timetableHeaderRow);
    timetableSection.appendChild(timetableToolbar);

    const timetableBody = document.createElement('div');
    timetableBody.className = 'ux-dashboard-v2-timetable-body';
    dashboardTimetableBodyElement = timetableBody;
    timetableSection.appendChild(timetableBody);

    if (customNameEnabled) {
        timetableBody.addEventListener('pointerdown', handleDashboardTimetablePointerDown);
        timetableBody.addEventListener('pointermove', handleDashboardTimetablePointerMove);
        timetableBody.addEventListener('pointerup', clearDashboardTimetableLongPress);
        timetableBody.addEventListener('pointercancel', clearDashboardTimetableLongPress);
        timetableBody.addEventListener('pointerleave', clearDashboardTimetableLongPress);
        timetableBody.addEventListener('contextmenu', (event) => {
            if (!dashboardTimetableInlineEditActive) {
                event.preventDefault();
            }
        });
        timetableBody.addEventListener('click', handleDashboardTimetableClickCapture, true);
        timetableBody.addEventListener('click', handleDashboardTimetableInlineEditClick);
        updateDashboardTimetableInlineEditControls();
    }

    // Clone the original timetable if exists
    const originalTable = document.querySelector('.schedule-table');
    if (originalTable) {
        const clonedTable = originalTable.cloneNode(true);
        clonedTable.className = 'ux-dashboard-v2-schedule-table';

        // Highlight today's column and remove empty rows/columns
        const headerCells = clonedTable.querySelectorAll('thead th');
        const bodyRows = clonedTable.querySelectorAll('tbody tr');

        // 1. Identify empty columns (indices to remove)
        // Keep Monday-Friday even when empty. Saturday can still collapse.
        // Start from 1 because index 0 is the period header
        const columnsToRemove = [];

        // Loop through each day column (Monday=1 to Saturday/etc)
        for (let i = 1; i < headerCells.length; i++) {
            const weekdayIndex = getWeekdayIndexFromHeaderText(headerCells[i].textContent);
            if (
                weekdayIndex >= DASHBOARD_VISIBLE_RANGE_MIN &&
                weekdayIndex <= DASHBOARD_VISIBLE_RANGE_MAX &&
                !isDashboardWeekdayWithinVisibleRange(weekdayIndex, dashboardVisibleRange)
            ) {
                columnsToRemove.push(i);
                continue;
            }

            if (shouldAlwaysKeepDashboardWeekdayColumn(headerCells[i], dashboardVisibleRange)) {
                continue;
            }

            let hasClass = false;

            // Check all rows for this column index
            bodyRows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells[i]) {
                    // Check if cell has content (link or non-empty text that isn't just whitespace)
                    // Usually classes are links <a>
                    if (cells[i].querySelector('a') || cells[i].textContent.trim() !== '') {
                        hasClass = true;
                    }
                }
            });

            if (!hasClass) {
                columnsToRemove.push(i);
            }
        }

        // 2. Identify empty rows
        // Keep 1st-5th periods even when empty. 6th-8th can still collapse.
        const rowsToRemove = [];
        bodyRows.forEach((row) => {
            const classOrder = getTimetableClassOrderFromRow(row);
            if (
                classOrder >= DASHBOARD_VISIBLE_RANGE_MIN &&
                classOrder <= DASHBOARD_VISIBLE_RANGE_MAX &&
                !isDashboardPeriodWithinVisibleRange(classOrder, dashboardVisibleRange)
            ) {
                rowsToRemove.push(row);
                return;
            }

            if (shouldAlwaysKeepDashboardPeriodRow(row, dashboardVisibleRange)) {
                return;
            }

            let hasClassInRow = false;
            const cells = row.querySelectorAll('td');

            // Check cells in this row (skipping the first cell which is the period label)
            for (let i = 1; i < cells.length; i++) {
                // Check if content exists
                if (cells[i].querySelector('a') || cells[i].textContent.trim() !== '') {
                    hasClassInRow = true;
                    break;
                }
            }

            if (!hasClassInRow) {
                rowsToRemove.push(row);
            }
        });

        // 3. Remove identified empty columns (in reverse order to keep indices valid)
        for (let i = columnsToRemove.length - 1; i >= 0; i--) {
            const colIndex = columnsToRemove[i];

            // Remove header cell
            if (headerCells[colIndex]) {
                headerCells[colIndex].remove();
            }

            // Remove body cells in that column
            bodyRows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells[colIndex]) {
                    cells[colIndex].remove();
                }
            });
        }

        // 4. Remove identified empty rows
        rowsToRemove.forEach(row => row.remove());

        // 5. Clean up remaining empty cells and apply highlights
        const finalBodyRows = clonedTable.querySelectorAll('tbody tr');
        const newHeaderCells = clonedTable.querySelectorAll('thead th');

        finalBodyRows.forEach(row => {
            const cells = row.querySelectorAll('td');
            cells.forEach((cell, index) => {
                // Skip period column
                if (index === 0) return;

                // If cell text is empty or just whitespace, clear it completely for :empty CSS selector
                if (!cell.querySelector('a') && cell.textContent.trim() === '') {
                    cell.innerHTML = '';
                }
            });
        });

        newHeaderCells.forEach((th, index) => {
            // Today highlighting logic
            if (index > 0 && getWeekdayIndexFromHeaderText(th.textContent) === todayWeekdayIndex) {
                th.classList.add('today-highlight');

                // Highlight corresponding cells in remaining body rows
                finalBodyRows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells[index]) {
                        cells[index].classList.add('today-highlight');
                    }
                });
            }
        });

        timetableBody.appendChild(clonedTable);
        dashboardTimetableElement = clonedTable;
        applyUniformTimetableCellLayout(clonedTable);
        dashboardTimetableNameApplyPromise = Promise.resolve()
            .then(() => {
                if (!anyCourseNameSettingEnabled) return;
                return applyDashboardCachedCourseNamesToTimetable();
            })
            .catch((error) => {
                uxDebugWarn('[WebClass UX] Dashboard cached short-name apply failed', error);
            });
    } else {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'ux-dashboard-v2-timetable-empty';
        emptyMessage.textContent = '時間割表が見つかりません';
        timetableBody.appendChild(emptyMessage);
    }

    centerColumn.appendChild(timetableSection);

    // --- Stats / Misc Links Section ---
    const statsSection = document.createElement('section');
    statsSection.id = 'ux-stats-section';
    statsSection.className = 'ux-dashboard-v2-section ux-dashboard-v2-stats';
    statsSection.style.display = 'none'; // Hidden by default

    // Removed header text

    const statsContent = document.createElement('div');
    statsContent.className = 'ux-dashboard-v2-stats-content';

    // Collect miscellaneous links from original sidebar
    const statsLinks = [
        { text: '成績', keyword: '成績', href: pageLinks.grades },
        { text: '課題実施状況一覧', keyword: 'ダッシュボード' },
        { text: '学修と振り返りの記録', keyword: '学修レポート' },
        { text: '学習記録ビューア', keyword: 'コース活動状況' },
        { text: 'FAQ (学生向け)', keyword: 'FAQ' },
        { text: 'マニュアル (学生向け)', keyword: 'マニュアル' },
        { text: '学修レポートについて', keyword: '学修レポートについて' },
        { text: '問い合わせ先', keyword: '問い合わせ' }
    ];

    const statsList = document.createElement('ul');
    statsList.className = 'ux-dashboard-v2-stats-list';

    statsLinks.forEach(item => {
        const href = item.href || findLinkByText([item.keyword, item.text]);
        if (href && href !== '#') {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = href;
            a.textContent = item.text;
            li.appendChild(a);
            statsList.appendChild(li);
        }
    });

    statsContent.appendChild(statsList);
    statsSection.appendChild(statsContent);
    centerColumn.appendChild(statsSection);

    const debugSection = document.createElement('section');
    debugSection.id = 'ux-debug-section';
    debugSection.className = 'ux-dashboard-v2-section ux-dashboard-v2-debug';
    debugSection.style.display = 'none';
    debugSection.hidden = !debugModeEnabled;

    const debugTitle = document.createElement('h2');
    debugTitle.textContent = 'デバッグ';
    debugSection.appendChild(debugTitle);

    const debugIntro = document.createElement('p');
    debugIntro.className = 'ux-dashboard-v2-debug-intro';
    debugIntro.textContent = 'デバッグモード用の確認・疑似操作をここにまとめています。';
    debugSection.appendChild(debugIntro);

    const debugGrid = document.createElement('div');
    debugGrid.className = 'ux-dashboard-v2-debug-grid';

    const debugMessageCard = document.createElement('section');
    debugMessageCard.className = 'ux-dashboard-v2-debug-card';
    const debugMessageTitle = document.createElement('h3');
    debugMessageTitle.textContent = 'メッセージ';
    const debugMessageDescription = document.createElement('p');
    debugMessageDescription.textContent = '未読メッセージを疑似追加して表示を確認できます。';
    const debugMessageActions = document.createElement('div');
    debugMessageActions.className = 'ux-dashboard-v2-debug-actions';
    debugMessageCard.appendChild(debugMessageTitle);
    debugMessageCard.appendChild(debugMessageDescription);
    debugMessageCard.appendChild(debugMessageActions);

    const debugToolsCard = document.createElement('section');
    debugToolsCard.className = 'ux-dashboard-v2-debug-card';
    const debugToolsTitle = document.createElement('h3');
    debugToolsTitle.textContent = 'devdev ツール';
    const debugToolsDescription = document.createElement('p');
    debugToolsDescription.textContent = '時刻固定やデバッグ用 TODO 作成などの確認操作です。';
    const devdevTimeContainer = document.createElement('div');
    devdevTimeContainer.className = 'ux-dashboard-v2-debug-actions ux-dashboard-v2-debug-devtools';
    appendDevdevCourseTodoCreator(devdevTimeContainer, {
        onAfterCreate: async () => {
            await updateAssignments({ forceRemote: false });
        }
    });
    appendDevdevTimeControls(devdevTimeContainer);
    debugToolsCard.appendChild(debugToolsTitle);
    debugToolsCard.appendChild(debugToolsDescription);
    debugToolsCard.appendChild(devdevTimeContainer);

    // The debug task tool is optional. Keep a stale extension update or a
    // failed optional script load from preventing the home page from rendering.
    if (typeof appendDebugTodoCreator === 'function') {
        const debugTaskCard = document.createElement('section');
        debugTaskCard.className = 'ux-dashboard-v2-debug-card ux-dashboard-v2-debug-task-card';
        const debugTaskTitle = document.createElement('h3');
        debugTaskTitle.textContent = 'デバッグTODO追加';
        const debugTaskDescription = document.createElement('p');
        debugTaskDescription.textContent = '同期対象を選んでテストタスクを1件追加します。API連携対象を選んでも、連携設定OFF中は送信されません。';
        const debugTaskActions = document.createElement('div');
        debugTaskActions.className = 'ux-dashboard-v2-debug-actions';
        appendDebugTodoCreator(debugTaskActions, {
            onAfterCreate: async () => {
                await updateAssignments({ forceRemote: false });
            }
        });
        debugTaskCard.appendChild(debugTaskTitle);
        debugTaskCard.appendChild(debugTaskDescription);
        debugTaskCard.appendChild(debugTaskActions);
        debugGrid.appendChild(debugTaskCard);
    } else {
        uxDebugWarn('[WebClass UX] debug todo creator is unavailable; skipping optional debug UI.');
    }

    debugGrid.appendChild(debugMessageCard);
    debugGrid.appendChild(debugToolsCard);
    debugSection.appendChild(debugGrid);
    centerColumn.appendChild(debugSection);

    const syncDebugTabVisibility = (enabled = uxIsDebugModeEnabled()) => {
        const showDebug = !!enabled;
        debugSection.hidden = !showDebug;
        if (debugTabEl) {
            debugTabEl.hidden = !showDebug;
            debugTabEl.setAttribute('aria-hidden', showDebug ? 'false' : 'true');
        }
        if (!showDebug) {
            debugSection.style.display = 'none';
            if (debugTabEl?.classList.contains('active')) {
                activateDashboardMainTab('tab-course');
            }
        }
    };
    syncDebugTabVisibility(debugModeEnabled);
    onUxDebugModeChange((enabled) => {
        syncDebugTabVisibility(enabled);
    });

    // --- Right Column: ToDo + Announcements ---
    const rightColumn = document.createElement('aside');
    rightColumn.className = 'ux-dashboard-v2-right';

    // ToDo Section
    const todoSection = document.createElement('section');
    todoSection.className = 'ux-dashboard-v2-section ux-dashboard-v2-todo';
    todoSection.setAttribute('aria-label', 'Task list');
    todoSection.style.display = 'flex';
    todoSection.style.flexDirection = 'column';
    // Keep the card stretched by layout instead of syncing a fixed pixel height.
    todoSection.style.flex = '1';
    todoSection.style.minHeight = '0';
    todoSection.style.overflow = 'hidden';

    const todoToolbar = document.createElement('div');
    todoToolbar.className = 'ux-dashboard-v2-todo-toolbar';

    const todoHeader = document.createElement('div');
    todoHeader.className = 'ux-dashboard-v2-section-header';
    todoHeader.style.display = 'flex';
    todoHeader.style.justifyContent = 'space-between';
    todoHeader.style.alignItems = 'center';

    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'ux-dashboard-v2-todo-actions';
    actionsContainer.style.display = 'flex';
    actionsContainer.style.gap = '8px';
    actionsContainer.style.alignItems = 'center';
    actionsContainer.style.marginLeft = 'auto';

    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'ux-dashboard-v2-todo-action ux-dashboard-v2-todo-import ux-action-btn ux-icon-button';
    importBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>';
    importBtn.style.padding = '6px';
    importBtn.style.color = 'var(--ux-home-secondary-label)';
    importBtn.style.cursor = 'pointer';
    importBtn.style.display = 'flex';
    importBtn.style.alignItems = 'center';
    importBtn.style.justifyContent = 'center';
    importBtn.title = 'インポート';
    importBtn.setAttribute('aria-label', 'ToDoをインポート');

    const getImportIdentityCandidates = (item) => {
        if (!item || typeof item !== 'object') return [];

        const candidates = [];
        const pushCandidate = (prefix, value) => {
            if (typeof value !== 'string') return;
            const trimmed = value.trim();
            if (!trimmed) return;
            const key = `${prefix}:${trimmed}`;
            if (!candidates.includes(key)) {
                candidates.push(key);
            }
        };

        pushCandidate('url', item.url);
        pushCandidate('fallback', item.fallbackUrl);

        if (candidates.length === 0) {
            pushCandidate('id', item.id);
        }

        if (candidates.length === 0 && (item.title || item.course || item.deadline)) {
            candidates.push(`semantic:${item.title || ''}::${item.course || ''}::${item.deadline || ''}`);
        }

        return candidates;
    };

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const importedData = JSON.parse(text);
            if (!Array.isArray(importedData)) throw new Error('Invalid format: not an array');

            const existing = await loadAssignments();
            const mergedAssignments = [];
            const identityToIndex = new Map();
            const rememberAssignment = (assignment, index) => {
                getImportIdentityCandidates(assignment).forEach((candidate) => {
                    if (!identityToIndex.has(candidate)) {
                        identityToIndex.set(candidate, index);
                    }
                });
            };
            const findExistingImportIndex = (item) => {
                const candidates = getImportIdentityCandidates(item);
                return candidates
                    .map((candidate) => identityToIndex.get(candidate))
                    .find((index) => Number.isInteger(index));
            };

            existing.forEach((assignment) => {
                if (!assignment || typeof assignment !== 'object') return;
                const matchedIndex = findExistingImportIndex(assignment);
                if (Number.isInteger(matchedIndex)) {
                    mergedAssignments[matchedIndex] = {
                        ...mergedAssignments[matchedIndex],
                        ...assignment
                    };
                    rememberAssignment(mergedAssignments[matchedIndex], matchedIndex);
                } else {
                    const index = mergedAssignments.push({ ...assignment }) - 1;
                    rememberAssignment(assignment, index);
                }
            });

            let added = 0;
            let updated = 0;
            importedData.forEach((item) => {
                if (!item || typeof item !== 'object') return;

                const matchedIndex = findExistingImportIndex(item);

                if (Number.isInteger(matchedIndex)) {
                    mergedAssignments[matchedIndex] = {
                        ...mergedAssignments[matchedIndex],
                        ...item
                    };
                    rememberAssignment(mergedAssignments[matchedIndex], matchedIndex);
                    updated++;
                } else {
                    const index = mergedAssignments.push({ ...item }) - 1;
                    rememberAssignment(item, index);
                    added++;
                }
            });

            await saveAssignments(mergedAssignments);
            alert(`インポート完了: 追加 ${added} 件, 更新 ${updated} 件`);
            await updateAssignments({ forceRemote: false });
        } catch (err) {
            console.error('Import failed', err);
            alert('インポートに失敗しました: ' + err.message);
        }
        fileInput.value = '';
    };
    importBtn.onclick = () => fileInput.click();
    actionsContainer.appendChild(importBtn);
    actionsContainer.appendChild(fileInput);

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'ux-dashboard-v2-todo-action ux-dashboard-v2-todo-export ux-action-btn ux-icon-button';
    exportBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
    exportBtn.style.padding = '6px';
    exportBtn.style.color = 'var(--ux-home-secondary-label)';
    exportBtn.style.cursor = 'pointer';
    exportBtn.style.display = 'flex';
    exportBtn.style.alignItems = 'center';
    exportBtn.style.justifyContent = 'center';
    exportBtn.title = 'エクスポート';
    exportBtn.setAttribute('aria-label', 'ToDoをエクスポート');
    exportBtn.onclick = async () => {
        try {
            const assignments = await loadAssignments();
            const json = JSON.stringify(assignments, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const dateStr = new Date().toISOString().slice(0, 10);
            a.download = `mytodo_export_${dateStr}.json`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                URL.revokeObjectURL(url);
                a.remove();
            }, 0);
        } catch (e) {
            console.error('Export failed', e);
            alert('エクスポートに失敗しました');
        }
    };
    actionsContainer.appendChild(exportBtn);

    // Refresh Button (Icon only style) - Updated to UI1 style
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'ux-dashboard-v2-todo-action ux-dashboard-v2-todo-refresh ux-refresh-btn ux-icon-button';
    refreshBtn.type = 'button';
    refreshBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
    refreshBtn.style.padding = '6px';
    refreshBtn.style.color = 'var(--ux-home-secondary-label)';
    refreshBtn.style.cursor = 'pointer';
    refreshBtn.style.display = 'flex';
    refreshBtn.style.alignItems = 'center';
    refreshBtn.style.justifyContent = 'center';
    refreshBtn.title = '更新';
    refreshBtn.setAttribute('aria-label', 'ToDoを更新');
    actionsContainer.appendChild(refreshBtn);

    todoHeader.appendChild(actionsContainer);
    todoToolbar.appendChild(todoHeader);

    let dashboardAssignments = [];
    let viewCompleted = false;
    let activeTodoApiSyncPipelinePromise = null;
    let isManualTodoReloadRunning = false;
    let todoReloadAnimationToken = 0;
    const TODO_RELOAD_SUCCESS_VISIBLE_MS = 5000;
    const TODO_RELOAD_ICON_REFRESH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
    const TODO_RELOAD_ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path d="M4 12l6 6L20 6"/></svg>';

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const setTodoRefreshButtonLoading = () => {
        refreshBtn.innerHTML = TODO_RELOAD_ICON_REFRESH;
        refreshBtn.classList.remove('ux-check-btn', 'ux-drawing', 'ux-success');
        refreshBtn.classList.add('ux-loading');
        refreshBtn.style.color = 'var(--ux-home-secondary-label)';
        refreshBtn.title = '更新中';
        refreshBtn.setAttribute('aria-label', 'ToDoを更新中');
        refreshBtn.disabled = true;
    };

    const setTodoRefreshButtonIdle = () => {
        refreshBtn.innerHTML = TODO_RELOAD_ICON_REFRESH;
        refreshBtn.classList.remove('ux-loading', 'ux-check-btn', 'ux-drawing', 'ux-success');
        refreshBtn.style.color = 'var(--ux-home-secondary-label)';
        refreshBtn.title = '更新';
        refreshBtn.setAttribute('aria-label', 'ToDoを更新');
        refreshBtn.disabled = false;
    };

    const playTodoRefreshCompleteAnimation = () => {
        todoReloadAnimationToken += 1;
        refreshBtn.innerHTML = TODO_RELOAD_ICON_CHECK;
        refreshBtn.classList.remove('ux-loading');
        refreshBtn.classList.add('ux-check-btn', 'ux-success');
        refreshBtn.style.color = 'var(--ux-home-success-foreground)';
        refreshBtn.title = '更新完了';
        refreshBtn.setAttribute('aria-label', 'ToDoの更新が完了しました');

        requestAnimationFrame(() => {
            refreshBtn.classList.add('ux-drawing');
        });

        return todoReloadAnimationToken;
    };



    // View Completed Toggle
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'ux-dashboard-v2-todo-filter';

    const toggleLabel = document.createElement('span');
    toggleLabel.textContent = 'View Completed';
    toggleLabel.style.fontWeight = '500';
    toggleLabel.style.fontSize = '0.95em';
    toggleLabel.style.color = 'var(--ux-home-secondary-label)';

    const toggleSwitch = document.createElement('label');
    toggleSwitch.style.position = 'relative';
    toggleSwitch.style.display = 'inline-block';
    toggleSwitch.style.width = '40px';
    toggleSwitch.style.height = '24px';

    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = viewCompleted;
    toggleInput.style.opacity = '0';
    toggleInput.style.width = '0';
    toggleInput.style.height = '0';

    const toggleSlider = document.createElement('span');
    toggleSlider.style.position = 'absolute';
    toggleSlider.style.cursor = 'pointer';
    toggleSlider.style.top = '0';
    toggleSlider.style.left = '0';
    toggleSlider.style.right = '0';
    toggleSlider.style.bottom = '0';
    toggleSlider.style.backgroundColor = 'var(--ux-home-quaternary-label)';
    toggleSlider.style.transition = '.4s';
    toggleSlider.style.borderRadius = '24px';

    const toggleKnob = document.createElement('span');
    toggleKnob.style.position = 'absolute';
    toggleKnob.style.content = '""';
    toggleKnob.style.height = '16px';
    toggleKnob.style.width = '16px';
    toggleKnob.style.left = '4px';
    toggleKnob.style.bottom = '4px';
    toggleKnob.style.backgroundColor = 'white';
    toggleKnob.style.transition = '.4s';
    toggleKnob.style.borderRadius = '50%';

    toggleSlider.appendChild(toggleKnob);
    toggleSwitch.appendChild(toggleInput);
    toggleSwitch.appendChild(toggleSlider);

    toggleInput.addEventListener('change', async () => {
        viewCompleted = toggleInput.checked;
        if (viewCompleted) {
            toggleSlider.style.backgroundColor = 'var(--ux-home-accent)';
            toggleKnob.style.transform = 'translateX(16px)';
        } else {
            toggleSlider.style.backgroundColor = 'var(--ux-home-quaternary-label)';
            toggleKnob.style.transform = 'translateX(0)';
        }
        await renderDashboardTodos(dashboardAssignments, { syncLayout: false });
    });

    toggleContainer.appendChild(toggleLabel);
    toggleContainer.appendChild(toggleSwitch);
    todoHeader.insertBefore(toggleContainer, actionsContainer);
    todoSection.appendChild(todoToolbar);

    const todoStatus = document.createElement('div'); // Dummy for compatibility
    const todoListContainer = document.createElement('div');
    todoListContainer.className = 'ux-dashboard-v2-todo-list';
    todoListContainer.style.flex = '1';
    todoListContainer.style.minHeight = '0';
    todoListContainer.style.maxHeight = 'none';
    todoListContainer.style.overflowY = 'auto';

    const clearDashboardTimetableInlineSizing = () => {
        if (!dashboardTimetableElement) return;
        dashboardTimetableElement.style.height = '';
        dashboardTimetableElement.querySelectorAll('tbody tr').forEach((row) => {
            row.style.height = '';
            Array.from(row.children).forEach((cell) => {
                cell.style.height = '';
                cell.style.maxHeight = '';
            });
        });
    };

    const clearDashboardInlineLayoutSizing = () => {
        timetableSection.style.height = '';
        todoSection.style.height = '';
        if (dashboardOutOfScheduleSectionElement) {
            dashboardOutOfScheduleSectionElement.style.height = '';
        }
        clearDashboardTimetableInlineSizing();
    };

    const getDashboardOutOfScheduleMinimumHeight = () => {
        if (!dashboardOutOfScheduleSectionElement) return 0;

        const headerEl = dashboardOutOfScheduleSectionElement.querySelector('.ux-dashboard-v2-section-header');
        const bodyEl = dashboardOutOfScheduleSectionElement.querySelector('.ux-dashboard-v2-outside-courses-body');
        if (!bodyEl) return 0;

        const sectionStyle = window.getComputedStyle(dashboardOutOfScheduleSectionElement);
        const headerStyle = headerEl ? window.getComputedStyle(headerEl) : null;
        const sectionVerticalChrome =
            (parseFloat(sectionStyle.paddingTop) || 0) +
            (parseFloat(sectionStyle.paddingBottom) || 0) +
            (parseFloat(sectionStyle.borderTopWidth) || 0) +
            (parseFloat(sectionStyle.borderBottomWidth) || 0);
        const headerHeight = headerEl
            ? Math.ceil(headerEl.getBoundingClientRect().height) +
                (parseFloat(headerStyle?.marginBottom) || 0)
            : 0;

        const listEl = bodyEl.querySelector('.ux-dashboard-v2-outside-courses-list');
        const emptyEl = bodyEl.querySelector('.ux-dashboard-v2-outside-courses-empty');
        let bodyContentHeight = 0;

        if (listEl) {
            const items = Array.from(listEl.children);
            bodyContentHeight = items.reduce((maxHeight, item) => {
                return Math.max(maxHeight, Math.ceil(item.getBoundingClientRect().height));
            }, 0);
        } else if (emptyEl) {
            bodyContentHeight = Math.ceil(emptyEl.getBoundingClientRect().height);
        }

        if (!bodyContentHeight) {
            bodyContentHeight = Math.ceil(bodyEl.getBoundingClientRect().height);
        }

        return Math.ceil(sectionVerticalChrome + headerHeight + bodyContentHeight + 1);
    };

    const getDashboardOutOfScheduleTargetHeight = () => {
        const minimumHeight = getDashboardOutOfScheduleMinimumHeight();
        if (!minimumHeight) return 0;
        return minimumHeight;
    };

    const isDashboardStackedLayout = () => {
        const centerRect = centerColumn.getBoundingClientRect();
        const rightRect = rightColumn.getBoundingClientRect();
        if (!centerRect.width || !rightRect.width) {
            return window.matchMedia('(max-width: 1200px)').matches;
        }
        return (rightRect.top - centerRect.top) > 8;
    };

    const getDashboardTimetableViewportAvailableHeight = () => {
        const timetableSectionRect = timetableSection.getBoundingClientRect();
        const mainStyle = window.getComputedStyle(mainContent);
        const mainPaddingBottom = parseFloat(mainStyle.paddingBottom) || 0;
        const viewportBottom = Math.max(0, window.innerHeight - mainPaddingBottom);
        const totalAvailableHeight = Math.floor(viewportBottom - timetableSectionRect.top);

        return Number.isFinite(totalAvailableHeight) ? totalAvailableHeight : 0;
    };

    const syncDashboardTimetableSectionHeight = () => {
        if (window.getComputedStyle(timetableSection).display === 'none') return;

        const totalAvailableHeight = dashboardTimetableInlineEditReferenceBottom
            ? Math.floor(dashboardTimetableInlineEditReferenceBottom - (timetableSection.getBoundingClientRect().top + window.scrollY))
            : getDashboardTimetableViewportAvailableHeight();
        // The out-of-schedule panel now occupies space inside the timetable frame.
        const rawTargetHeight = Math.floor(totalAvailableHeight);
        if (!Number.isFinite(rawTargetHeight)) return;
        // 極端に低いウィンドウでも時間割が操作可能な高さを確保する
        const targetHeight = Math.max(rawTargetHeight, 240);

        const nextHeight = `${targetHeight}px`;
        if (timetableSection.style.height !== nextHeight) {
            timetableSection.style.height = nextHeight;
        }
    };

    const getDashboardTimetableNaturalSectionHeight = () => {
        if (!timetableBody) return 0;

        const sectionStyle = window.getComputedStyle(timetableSection);
        const sectionVerticalChrome =
            (parseFloat(sectionStyle.paddingTop) || 0) +
            (parseFloat(sectionStyle.paddingBottom) || 0) +
            (parseFloat(sectionStyle.borderTopWidth) || 0) +
            (parseFloat(sectionStyle.borderBottomWidth) || 0);
        const toolbarHeight = timetableToolbar
            ? Math.ceil(timetableToolbar.getBoundingClientRect().height)
            : timetableHeaderRow
                ? Math.ceil(timetableHeaderRow.getBoundingClientRect().height)
                : 0;
        const bodyContentHeight = Math.ceil(timetableBody.scrollHeight);
        const outOfScheduleHeight = dashboardOutOfScheduleSectionElement
            ? Math.ceil(dashboardOutOfScheduleSectionElement.getBoundingClientRect().height)
            : 0;
        const childGap = parseFloat(sectionStyle.rowGap || sectionStyle.gap || '0') || 0;
        const childCount = 2 + (outOfScheduleHeight > 0 ? 1 : 0);

        return Math.ceil(
            sectionVerticalChrome +
            toolbarHeight +
            bodyContentHeight +
            outOfScheduleHeight +
            childGap * Math.max(0, childCount - 1)
        );
    };

    const syncDashboardOutOfScheduleSectionHeight = () => {
        if (!dashboardOutOfScheduleSectionElement) return;
        if (window.getComputedStyle(dashboardOutOfScheduleSectionElement).display === 'none') return;

        const targetHeight = getDashboardOutOfScheduleTargetHeight();
        if (!Number.isFinite(targetHeight) || targetHeight <= 0) return;

        const nextHeight = `${targetHeight}px`;
        if (dashboardOutOfScheduleSectionElement.style.height !== nextHeight) {
            dashboardOutOfScheduleSectionElement.style.height = nextHeight;
        }
    };

    const stretchDashboardTimetableToBody = ({ bottomInset = 0 } = {}) => {
        if (!dashboardTimetableElement || !timetableBody) return;
        if (window.getComputedStyle(timetableSection).display === 'none') return;

        const availableHeight = Math.floor(timetableBody.clientHeight - bottomInset);
        if (!Number.isFinite(availableHeight) || availableHeight <= 0) return;

        const bodyRows = Array.from(dashboardTimetableElement.querySelectorAll('tbody tr'));
        if (bodyRows.length === 0) return;

        const tableStyle = window.getComputedStyle(dashboardTimetableElement);
        const spacingTokens = (tableStyle.borderSpacing || '0').trim().split(/\s+/);
        const spacingY = parseFloat(spacingTokens[1] || spacingTokens[0] || '0') || 0;
        const theadHeight = dashboardTimetableElement.tHead
            ? Math.ceil(dashboardTimetableElement.tHead.getBoundingClientRect().height)
            : 0;
        const spacingAllowance = spacingY * (bodyRows.length + 2);
        const computedRowHeight = Math.floor((availableHeight - theadHeight - spacingAllowance) / bodyRows.length);
        if (!Number.isFinite(computedRowHeight) || computedRowHeight <= 0) return;

        const nextTableHeight = `${availableHeight}px`;
        if (dashboardTimetableElement.style.height !== nextTableHeight) {
            dashboardTimetableElement.style.height = nextTableHeight;
        }
        // CSS側のtr高さ・td max-heightは最小値として効くため、inlineで両方上書きする
        const nextCellHeight = `${computedRowHeight}px`;
        bodyRows.forEach((row) => {
            if (row.style.height !== nextCellHeight) {
                row.style.height = nextCellHeight;
            }
            Array.from(row.children).forEach((cell) => {
                if (cell.style.height !== nextCellHeight) {
                    cell.style.height = nextCellHeight;
                }
                if (cell.style.maxHeight !== nextCellHeight) {
                    cell.style.maxHeight = nextCellHeight;
                }
            });
        });
    };

    const getDashboardTimetableFitMetrics = () => {
        if (!dashboardTimetableElement || !timetableBody) return null;

        const availableHeight = Math.floor(timetableBody.clientHeight);
        if (!Number.isFinite(availableHeight) || availableHeight <= 0) return null;

        const bodyRows = Array.from(dashboardTimetableElement.querySelectorAll('tbody tr'));
        if (bodyRows.length === 0) return null;

        const tableStyle = window.getComputedStyle(dashboardTimetableElement);
        const spacingTokens = (tableStyle.borderSpacing || '0').trim().split(/\s+/);
        const spacingY = parseFloat(spacingTokens[1] || spacingTokens[0] || '0') || 0;
        const theadHeight = dashboardTimetableElement.tHead
            ? Math.ceil(dashboardTimetableElement.tHead.getBoundingClientRect().height)
            : 0;
        const spacingAllowance = spacingY * (bodyRows.length + 2);
        const computedRowHeight = Math.floor((availableHeight - theadHeight - spacingAllowance) / bodyRows.length);

        return {
            availableHeight,
            bodyRowCount: bodyRows.length,
            computedRowHeight
        };
    };

    const getDashboardTimetableClipAmount = () => {
        if (!dashboardTimetableElement || !timetableBody) return 0;

        const tableRect = dashboardTimetableElement.getBoundingClientRect();
        const bodyRect = timetableBody.getBoundingClientRect();
        if (!tableRect.height || !bodyRect.height) return 0;

        return tableRect.bottom - bodyRect.bottom;
    };

    let courseLayoutSyncRafId = 0;

    const TIMETABLE_DENSITY_CLASSES = ['ux-compact-density', 'ux-ultra-compact-density'];

    const scheduleCourseLayoutSync = () => {
        if (courseLayoutSyncRafId && typeof window.cancelAnimationFrame === 'function') {
            window.cancelAnimationFrame(courseLayoutSyncRafId);
        }

        const runSync = () => {
            courseLayoutSyncRafId = 0;
            syncDashboardHeaderHeightVariable();
            clearDashboardInlineLayoutSizing();
            if (timetableBody) {
                timetableBody.classList.remove('ux-scroll-managed-fit', 'ux-scroll-managed-fit-safe', 'ux-scroll-managed-natural');
            }
            if (dashboardTimetableElement) {
                dashboardTimetableElement.classList.remove(...TIMETABLE_DENSITY_CLASSES);
            }
            const stackedLayout = isDashboardStackedLayout();
            const courseViewVisible =
                window.getComputedStyle(timetableSection).display !== 'none' &&
                window.getComputedStyle(rightColumn).display !== 'none';
            document.body.classList.toggle(
                'ux-dashboard-v2-stacked-layout',
                stackedLayout && courseViewVisible
            );

            if (stackedLayout) {
                if (timetableBody) {
                    timetableBody.classList.add('ux-scroll-managed-natural');
                }
                return;
            }
            syncDashboardOutOfScheduleSectionHeight();

            syncDashboardTimetableSectionHeight();
            const targetHeight = parseFloat(timetableSection.style.height || '0') || 0;
            const naturalHeight = getDashboardTimetableNaturalSectionHeight();

            if (!targetHeight || !naturalHeight || !dashboardTimetableElement || !timetableBody) {
                timetableSection.style.height = '';
                if (timetableBody) {
                    timetableBody.classList.add('ux-scroll-managed-natural');
                }
                return;
            }

            const fitMetrics = getDashboardTimetableFitMetrics();
            const fitRowHeight = fitMetrics?.computedRowHeight || 0;

            // 各密度には内容(コース名のクランプ高+padding)による最小行高があり、
            // 計算行高がそれを下回ると表が溢れる。緩い密度から順に試し、
            // 実際のクリップ有無で判定して詰めていく。
            const densityAttempts = [];
            if (naturalHeight <= targetHeight && fitRowHeight >= 90) {
                densityAttempts.push(null);
            }
            if (fitRowHeight >= 62) {
                densityAttempts.push('ux-compact-density');
            }
            densityAttempts.push('ux-ultra-compact-density');

            timetableBody.classList.add('ux-scroll-managed-fit');

            let fitted = false;
            for (const densityClass of densityAttempts) {
                dashboardTimetableElement.classList.remove(...TIMETABLE_DENSITY_CLASSES);
                if (densityClass) {
                    dashboardTimetableElement.classList.add(densityClass);
                }
                stretchDashboardTimetableToBody();
                // テーブルは指定高さ通りに描画されないことがあるため、
                // 実測したはみ出し量をインセットにして一度だけ再調整する
                let clipAmount = getDashboardTimetableClipAmount();
                if (clipAmount > 2) {
                    stretchDashboardTimetableToBody({ bottomInset: Math.ceil(clipAmount) + 1 });
                    clipAmount = getDashboardTimetableClipAmount();
                }
                if (clipAmount <= 2) {
                    fitted = true;
                    break;
                }
            }

            if (!fitted) {
                // Keep the timetable frame height fixed while the inner table scrolls.
                clearDashboardTimetableInlineSizing();
                timetableBody.classList.remove('ux-scroll-managed-fit');
                timetableBody.classList.add('ux-scroll-managed-fit-safe');
            }
            syncDashboardOutOfScheduleSectionHeight();
        };

        if (typeof window.requestAnimationFrame === 'function') {
            courseLayoutSyncRafId = window.requestAnimationFrame(runSync);
            return;
        }

        setTimeout(runSync, 0);
    };

    const requestStabilizedCourseLayoutSync = () => {
        scheduleCourseLayoutSync();
        setTimeout(scheduleCourseLayoutSync, 32);
        setTimeout(scheduleCourseLayoutSync, 120);
    };
    requestCourseLayoutSync = requestStabilizedCourseLayoutSync;

    if (typeof ResizeObserver === 'function') {
        const timetableResizeObserver = new ResizeObserver(() => {
            scheduleCourseLayoutSync();
        });
        timetableResizeObserver.observe(centerColumn);
        timetableResizeObserver.observe(timetableSection);
        timetableResizeObserver.observe(timetableBody);
    }
    window.addEventListener('resize', scheduleCourseLayoutSync);
    window.addEventListener('pageshow', requestStabilizedCourseLayoutSync);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            requestStabilizedCourseLayoutSync();
        }
    });

    const renderDashboardTodos = async (assignments, { syncLayout = true } = {}) => {
        dashboardAssignments = assignments || [];
        const visibleAssignments = uxIsDebugModeEnabled()
            ? dashboardAssignments
            : dashboardAssignments.filter((assignment) =>
                assignment?.category !== 'devdev' && assignment?.category !== 'debug-api'
            );



        // Filter
        let filtered = [...visibleAssignments];
        if (viewCompleted) {
            filtered = filtered.filter(a => a.isCompleted);
        } else {
            filtered = filtered.filter(a => !a.isCompleted);
        }

        // Custom sort for dashboard: High -> Medium -> Low -> Done
        filtered.sort((a, b) => {
            const pA = getTodoPriority(a);
            const pB = getTodoPriority(b);
            const score = { 'High': 3, 'Medium': 2, 'Low': 1, 'Done': 0 };
            if (score[pA] !== score[pB]) return score[pB] - score[pA];
            // Same priority -> Date asc
            const dA = a.deadline ? new Date(a.deadline) : new Date('2100-01-01');
            const dB = b.deadline ? new Date(b.deadline) : new Date('2100-01-01');
            return dA - dB;
        });

        renderToDoList(filtered, todoListContainer, {
            viewMode: 'dashboard',
            onAvailabilityChange: async () => {
                await renderDashboardTodos(await loadAssignments(), { syncLayout: false });
            },
            onStatusChange: () => {
                updateAssignments({ forceRemote: false });
            }
        });
        applyTimetableColorsFromTodo(filtered);
        if (syncLayout) {
            scheduleCourseLayoutSync();
        }

        todoStatus.textContent = '';
    };

    rerenderDashboardTodosAfterCourseNameApply = async () => {
        await applyDashboardCourseNamesToOutOfSchedulePanel();
        await renderDashboardTodos(dashboardAssignments);
        requestCourseLayoutSync();
    };
    onUxDebugModeChange(() => {
        void renderDashboardTodos(dashboardAssignments);
    });

    const updateAssignments = async ({ forceRemote = false, fallbackRemoteWhenEmpty = false } = {}) => {
        if (isManualTodoReloadRunning) {
            setTodoRefreshButtonLoading();
        } else {
            refreshBtn.disabled = true;
            refreshBtn.classList.add('ux-loading');
        }
        todoStatus.textContent = forceRemote ? '課題を取得中...' : '課題を読み込み中...';
        try {
            let assignments = [];

            if (forceRemote) {
                if (window.WebClassScraper?.updateAllAssignments) {
                    assignments = await window.WebClassScraper.updateAllAssignments({
                        allowAfterNavigation: isManualTodoReloadRunning
                    });
                } else {
                    assignments = await loadAssignments();
                }
            } else {
                assignments = await loadAssignments();
                if (fallbackRemoteWhenEmpty && assignments.length === 0 && window.WebClassScraper?.updateAllAssignments) {
                    assignments = await window.WebClassScraper.updateAllAssignments({
                        allowAfterNavigation: isManualTodoReloadRunning
                    });
                }
            }

            await dashboardTimetableNameApplyPromise;
            await renderDashboardTodos(assignments);
        } catch (error) {
            if (error?.isAssignmentFetchStopped) {
                todoStatus.textContent = '';
                return;
            }
            if (error && error.isSessionDropped) {
                // セッション切れ: 保存済みの既存データを保持して再描画し、ユーザーに再読込を促す
                try {
                    const preserved = await loadAssignments();
                    await renderDashboardTodos(preserved);
                } catch (renderErr) {
                    console.error('[WebClass UX] preserved render failed', renderErr);
                }
                todoStatus.textContent = 'セッションが切れました。ページを再読み込みしてください。';
                if (typeof globalThis.showUxSessionExpiredPopup === 'function') {
                    globalThis.showUxSessionExpiredPopup();
                }
                return;
            }
            if (error && error.isAssignmentFetchFailed) {
                try {
                    const preserved = await loadAssignments();
                    await renderDashboardTodos(preserved);
                } catch (renderErr) {
                    console.error('[WebClass UX] preserved render failed', renderErr);
                }
                const courseName = typeof error.courseName === 'string' ? `${error.courseName}の` : '';
                todoStatus.textContent = `${courseName}課題を取得できませんでした。保存済みの課題は維持しました。通信状態を確認して再度更新してください。`;
                return;
            }
            console.error('[WebClass UX] Dashboard ToDo update failed', error);
        } finally {
            if (!isManualTodoReloadRunning) {
                refreshBtn.disabled = false;
                refreshBtn.classList.remove('ux-loading');
            }
        }
    };

    const runTodoApiSyncPipeline = async ({
        trigger = 'manual',
        mode = 'full',
        forceRemoteReload = false,
        markManualReload = false
    } = {}) => {
        if (activeTodoApiSyncPipelinePromise) {
            if (!markManualReload) {
                return activeTodoApiSyncPipelinePromise;
            }
            return activeTodoApiSyncPipelinePromise.then(async (result) => {
                await chrome.storage.local.set({
                    [STORAGE_KEY_TODO_API_LAST_MANUAL_RELOAD]: new Date().toISOString()
                });
                return result;
            });
        }

        activeTodoApiSyncPipelinePromise = (async () => {
            const syncErrors = [];
            if (forceRemoteReload) {
                try {
                    await runTodoApiSync({ mode: 'pull_only', trigger: `${trigger}_api_pull` });
                } catch (error) {
                    uxDebugWarn('[WebClass UX] todo api pull phase failed', error);
                    syncErrors.push(error);
                }

                await updateAssignments({ forceRemote: true });

                if (markManualReload) {
                    await chrome.storage.local.set({
                        [STORAGE_KEY_TODO_API_LAST_MANUAL_RELOAD]: new Date().toISOString()
                    });
                }

                try {
                    await runTodoApiSync({ mode, trigger: `${trigger}_api_push` });
                } catch (error) {
                    uxDebugWarn('[WebClass UX] todo api push phase failed', error);
                    syncErrors.push(error);
                }

                await updateAssignments({ forceRemote: false });
                if (syncErrors.length > 0) {
                    throw syncErrors[0];
                }
                return;
            }

            try {
                await runTodoApiSync({ mode, trigger });
            } catch (error) {
                uxDebugWarn('[WebClass UX] todo api sync failed', error);
                syncErrors.push(error);
            }
            await updateAssignments({ forceRemote: false });
            if (syncErrors.length > 0) {
                throw syncErrors[0];
            }
        })();
        try {
            return await activeTodoApiSyncPipelinePromise;
        } finally {
            activeTodoApiSyncPipelinePromise = null;
        }
    };

    runTodoApiSyncFromBackground = async ({
        trigger = 'background',
        mode = 'full',
        forceRemoteReload = true
    } = {}) => {
        await runTodoApiSyncPipeline({
            trigger,
            mode,
            forceRemoteReload
        });
    };

    refreshBtn.onclick = async () => {
        if (isManualTodoReloadRunning) return;

        isManualTodoReloadRunning = true;
        todoReloadAnimationToken += 1;
        setTodoRefreshButtonLoading();

        try {
            await runTodoApiSyncPipeline({
                trigger: 'manual_reload',
                mode: 'full',
                forceRemoteReload: true,
                markManualReload: true
            });

            const animationToken = playTodoRefreshCompleteAnimation();
            await delay(TODO_RELOAD_SUCCESS_VISIBLE_MS);
            if (animationToken === todoReloadAnimationToken) {
                setTodoRefreshButtonIdle();
            }
        } catch (error) {
            uxDebugWarn('[WebClass UX] manual reload sync failed', error);
            alert(`ToDo同期に失敗しました: ${error?.message || 'Unknown error'}`);
            setTodoRefreshButtonIdle();
        } finally {
            isManualTodoReloadRunning = false;
            if (!refreshBtn.classList.contains('ux-success')) {
                setTodoRefreshButtonIdle();
            }
        }
    };

    todoSection.appendChild(todoListContainer);

    rightColumn.appendChild(todoSection);

    const normalizeDashboardCourseMetaText = (text) => String(text || '').replace(/\s+/g, ' ').trim();
    const collectDashboardOutOfScheduleCourses = () => {
        const scheduledCourseIds = new Set(
            Array.from(document.querySelectorAll('table.schedule-table a[href*="course.php"], table.ux-dashboard-v2-schedule-table a[href*="course.php"]'))
                .map((link) => extractCourseIdFromUrl(link.getAttribute('href') || ''))
                .filter(Boolean)
        );
        const courseMap = new Map();
        const candidateLinks = document.querySelectorAll('#courses_list_left a[href*="course.php"], .courseTree .course-title a[href*="course.php"]');

        candidateLinks.forEach((link) => {
            const href = link.getAttribute('href') || '';
            if (!href) return;

            const courseId = extractCourseIdFromUrl(href);
            const courseBox = link.closest('.course-data-box-normal') || link.closest('li') || link.parentElement;
            const fullName = normalizeDevdevCourseText(link.textContent || '');
            const detailText = normalizeDashboardCourseMetaText(courseBox?.querySelector('.course-info')?.textContent || '');
            const noticeText = normalizeDashboardCourseMetaText(courseBox?.querySelector('.course-contents-info')?.textContent || '');
            const shouldTreatAsOutOfSchedule =
                !scheduledCourseIds.has(courseId) ||
                /時間外/.test(fullName) ||
                /時間外/.test(detailText);
            if (!fullName || !shouldTreatAsOutOfSchedule) return;

            const key = courseId || href || fullName;
            if (courseMap.has(key)) return;

            let absoluteHref = href;
            try {
                absoluteHref = new URL(href, window.location.href).href;
            } catch {
                // keep raw href
            }

            courseMap.set(key, {
                courseId,
                href: absoluteHref,
                fullName,
                detailText,
                noticeText
            });
        });

        return Array.from(courseMap.values()).sort((a, b) => {
            const aName = fallbackCourseName(a.fullName || '');
            const bName = fallbackCourseName(b.fullName || '');
            return aName.localeCompare(bName, 'ja');
        });
    };

    const outOfScheduleCourses = collectDashboardOutOfScheduleCourses();
    const outOfScheduleSection = document.createElement('section');
    outOfScheduleSection.id = 'ux-outside-courses-section';
    outOfScheduleSection.className = 'ux-dashboard-v2-section ux-dashboard-v2-outside-courses';
    outOfScheduleSection.setAttribute('aria-label', 'Courses outside the timetable');
    outOfScheduleSection.style.display = 'flex';
    outOfScheduleSection.style.flexDirection = 'column';
    outOfScheduleSection.style.flex = '0 0 auto';
    outOfScheduleSection.style.minHeight = '0';
    outOfScheduleSection.style.overflow = 'hidden';
    // 高さ計算(getDashboardOutOfScheduleMinimumHeight)はborder-box前提
    outOfScheduleSection.style.boxSizing = 'border-box';

    const outOfScheduleBody = document.createElement('div');
    outOfScheduleBody.className = 'ux-dashboard-v2-outside-courses-body';
    dashboardOutOfScheduleSectionElement = outOfScheduleSection;

    if (outOfScheduleCourses.length > 0) {
        const outOfScheduleList = document.createElement('div');
        outOfScheduleList.className = 'ux-dashboard-v2-outside-courses-list';

        outOfScheduleCourses.forEach((course) => {
            const item = document.createElement('a');
            item.className = 'ux-dashboard-v2-outside-course-item';
            item.href = course.href || '#';
            item.dataset.courseId = course.courseId || '';
            item.dataset.originalName = course.fullName || '';

            const title = document.createElement('span');
            title.className = 'ux-dashboard-v2-outside-course-title';
            title.textContent = course.fullName || '';
            item.appendChild(title);

            if (course.noticeText) {
                const note = document.createElement('span');
                note.className = 'ux-dashboard-v2-outside-course-note';
                note.textContent = course.noticeText;
                item.appendChild(note);
            }

            outOfScheduleList.appendChild(item);
        });

        outOfScheduleBody.appendChild(outOfScheduleList);
    } else {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'ux-dashboard-v2-outside-courses-empty';
        emptyMessage.textContent = '対象科目はありません';
        outOfScheduleBody.appendChild(emptyMessage);
    }

    outOfScheduleSection.appendChild(outOfScheduleBody);
    // Keep the out-of-schedule frame independent while placing it below the timetable body.
    timetableSection.appendChild(outOfScheduleSection);

    applyDashboardCourseNamesToOutOfSchedulePanel = async () => {
        if (!dashboardOutOfScheduleSectionElement) return;

        const items = Array.from(dashboardOutOfScheduleSectionElement.querySelectorAll('.ux-dashboard-v2-outside-course-item'));
        if (!items.length) return;

        const storageData = await new Promise(resolve => {
            chrome.storage.local.get({
                [STORAGE_KEY_SHORT_COURSE_CACHE]: {}
            }, resolve);
        });
        const anyNameSettingForCustom = customNameEnabled || ruleNameEnabled;
        const customNames = anyNameSettingForCustom && window.WebClassScraper?.loadCustomCourseNames
            ? await window.WebClassScraper.loadCustomCourseNames().catch(() => ({}))
            : {};
        const shortCourseCache = ruleNameEnabled ? (storageData[STORAGE_KEY_SHORT_COURSE_CACHE] || {}) : {};

        items.forEach((item) => {
            const titleEl = item.querySelector('.ux-dashboard-v2-outside-course-title');
            if (!titleEl) return;

            const rawFullName = (item.dataset.originalName || '').trim();
            const courseId = (item.dataset.courseId || '').trim();
            if (!rawFullName) return;

            const customName = resolveEditedCustomCourseName(
                courseId ? customNames[courseId] : '',
                rawFullName
            );
            if (customNameEnabled && customName) {
                titleEl.textContent = customName;
                return;
            }

            const normalizedName = normalizeDevdevCourseText(rawFullName);

            if (ruleNameEnabled) {
                const cachedShort = getShortCourseFromCache(shortCourseCache, courseId, [normalizedName, rawFullName]);
                if (cachedShort) {
                    titleEl.textContent = cachedShort;
                    return;
                }
            }

            if (ruleNameEnabled) {
                titleEl.textContent = fallbackCourseName(rawFullName);
                return;
            }

            titleEl.textContent = rawFullName;
        });
    };
    void applyDashboardCourseNamesToOutOfSchedulePanel().finally(() => {
        requestCourseLayoutSync();
    });
    dashboardTimetableNameApplyPromise = dashboardTimetableNameApplyPromise.finally(async () => {
        await applyDashboardCourseNamesToOutOfSchedulePanel();
        requestCourseLayoutSync();
    });

    // Messages are a first-class dashboard tab backed by the WebClass inbox.
    const messageSection = document.createElement('section');
    messageSection.id = 'ux-messages-section';
    messageSection.className = 'ux-dashboard-v2-section ux-dashboard-v2-messages';
    messageSection.style.display = 'none';
    messageSection.setAttribute('aria-hidden', 'true');
    messageSection.setAttribute('role', 'tabpanel');
    messageSection.setAttribute('aria-labelledby', 'tab-messages');

    const messageHeading = document.createElement('div');
    messageHeading.className = 'ux-message-heading';

    const messageActions = document.createElement('div');
    messageActions.className = 'ux-message-toolbar';

    const unreadOnlyLabel = document.createElement('label');
    unreadOnlyLabel.className = 'ux-message-unread-filter';
    const unreadOnlyText = document.createElement('span');
    unreadOnlyText.textContent = '未読のみ';
    const unreadOnlySwitch = document.createElement('span');
    unreadOnlySwitch.className = 'ux-message-toggle';
    const unreadOnlyInput = document.createElement('input');
    unreadOnlyInput.type = 'checkbox';
    unreadOnlyInput.setAttribute('aria-label', '未読メッセージのみを表示');
    const unreadOnlyTrack = document.createElement('span');
    unreadOnlyTrack.className = 'ux-message-toggle-track';
    unreadOnlySwitch.appendChild(unreadOnlyInput);
    unreadOnlySwitch.appendChild(unreadOnlyTrack);
    unreadOnlyLabel.appendChild(unreadOnlyText);
    unreadOnlyLabel.appendChild(unreadOnlySwitch);

    const selectAllLabel = document.createElement('label');
    selectAllLabel.className = 'ux-message-select-all';
    const selectAllCheckbox = document.createElement('input');
    selectAllCheckbox.type = 'checkbox';
    selectAllCheckbox.setAttribute('aria-label', '表示中のメッセージをすべて選択');
    const selectAllText = document.createElement('span');
    selectAllText.textContent = 'すべて選択';
    selectAllLabel.appendChild(selectAllCheckbox);
    selectAllLabel.appendChild(selectAllText);

    const refreshMsgBtn = document.createElement('button');
    refreshMsgBtn.type = 'button';
    refreshMsgBtn.className = 'ux-message-refresh ux-refresh-btn ux-icon-button';
    refreshMsgBtn.innerHTML = TODO_RELOAD_ICON_REFRESH;
    refreshMsgBtn.title = '更新';
    refreshMsgBtn.setAttribute('aria-label', 'メッセージを更新');
    const markAllReadBtn = createMessageToolbarButton({
        label: '既読にする',
        icon: UX_MESSAGE_ICONS.check,
        className: 'ux-message-mark-read ux-button--primary'
    });

    const messagePagination = document.createElement('div');
    messagePagination.className = 'ux-message-pagination';
    const previousMessagePageBtn = document.createElement('button');
    previousMessagePageBtn.type = 'button';
    previousMessagePageBtn.className = 'ux-message-page-action ux-button';
    previousMessagePageBtn.textContent = '<';
    previousMessagePageBtn.title = '前のページ';
    previousMessagePageBtn.setAttribute('aria-label', '前のページ');
    const messagePageStatus = document.createElement('span');
    messagePageStatus.className = 'ux-message-page-status';
    messagePageStatus.textContent = '1 / 1';
    const nextMessagePageBtn = document.createElement('button');
    nextMessagePageBtn.type = 'button';
    nextMessagePageBtn.className = 'ux-message-page-action ux-button';
    nextMessagePageBtn.textContent = '>';
    nextMessagePageBtn.title = '次のページ';
    nextMessagePageBtn.setAttribute('aria-label', '次のページ');
    messagePagination.appendChild(previousMessagePageBtn);
    messagePagination.appendChild(messagePageStatus);
    messagePagination.appendChild(nextMessagePageBtn);

    const messageStatus = document.createElement('div');
    messageStatus.className = 'ux-message-status';

    const messageNavigation = document.createElement('div');
    messageNavigation.className = 'ux-message-navigation';
    messageNavigation.appendChild(messageStatus);
    messageNavigation.appendChild(refreshMsgBtn);
    messageNavigation.appendChild(messagePagination);
    messageActions.appendChild(unreadOnlyLabel);
    messageActions.appendChild(messageNavigation);
    messageHeading.appendChild(messageActions);
    messageSection.appendChild(messageHeading);

    const messageSelectionBar = document.createElement('div');
    messageSelectionBar.className = 'ux-message-selection-bar';
    messageSelectionBar.hidden = true;
    const messageSelectionStatus = document.createElement('span');
    messageSelectionStatus.className = 'ux-message-selection-status';
    messageSelectionBar.appendChild(selectAllLabel);
    messageSelectionBar.appendChild(messageSelectionStatus);
    messageSelectionBar.appendChild(markAllReadBtn);
    messageSection.appendChild(messageSelectionBar);

    const messageContent = document.createElement('div');
    messageContent.className = 'ux-dashboard-v2-message-list';
    messageContent.innerHTML = '<p class="ux-message-loading">メッセージを読み込み中...</p>';
    messageSection.appendChild(messageContent);
    centerColumn.appendChild(messageSection);

    const debugReceiveBtn = document.createElement('button');
    debugReceiveBtn.className = 'ux-message-debug-btn';
    debugReceiveBtn.type = 'button';
    debugReceiveBtn.textContent = 'デバッグ受信';
    debugReceiveBtn.title = '未読メッセージを1件疑似追加';
    debugReceiveBtn.style.display = uxIsDebugModeEnabled() ? 'inline-flex' : 'none';
    debugMessageActions.appendChild(debugReceiveBtn);

    mainContent.appendChild(centerColumn);
    mainContent.appendChild(rightColumn);
    dashboardContainer.appendChild(mainContent);

    // Remove original content completely (after all scraping is done)
    // Hide all direct children of body except our dashboard
    Array.from(document.body.children).forEach(child => {
        if (child === dashboardContainer ||
            child.tagName === 'SCRIPT' ||
            child.tagName === 'STYLE' ||
            child.tagName === 'LINK') {
            return;
        }
        child.style.display = 'none';
    });

    if (originalContainer) originalContainer.remove();

    document.body.appendChild(dashboardContainer);
    dashboardSettingsOverlay?.resume();
    scheduleCourseLayoutSync();

    // === ゴミ箱ボタン（デバッグモード時のみ表示） ===
    const setupDebugTrash = () => {
        const trashFab = document.createElement('button');
        trashFab.type = 'button';
        trashFab.id = 'ux-trash-fab';
        trashFab.className = 'ux-trash-fab';
        trashFab.title = 'ゴミ箱を表示';
        trashFab.innerHTML = '🗑';
        trashFab.hidden = !uxIsDebugModeEnabled();
        document.body.appendChild(trashFab);

        // ゴミ箱モーダル
        const trashOverlay = document.createElement('div');
        trashOverlay.id = 'ux-trash-overlay';
        trashOverlay.className = 'ux-trash-overlay';
        trashOverlay.style.display = 'none';

        const trashModal = document.createElement('div');
        trashModal.className = 'ux-trash-modal';

        const trashHeader = document.createElement('div');
        trashHeader.className = 'ux-trash-modal-header';

        const trashTitle = document.createElement('h3');
        trashTitle.textContent = 'ゴミ箱';
        trashHeader.appendChild(trashTitle);

        const trashCloseBtn = document.createElement('button');
        trashCloseBtn.type = 'button';
        trashCloseBtn.className = 'ux-trash-modal-close';
        trashCloseBtn.innerHTML = '&times;';
        trashCloseBtn.title = '閉じる';
        trashHeader.appendChild(trashCloseBtn);
        trashModal.appendChild(trashHeader);

        const trashBody = document.createElement('div');
        trashBody.className = 'ux-trash-modal-body';
        trashModal.appendChild(trashBody);

        trashOverlay.appendChild(trashModal);
        document.body.appendChild(trashOverlay);

        const renderTrashContents = async () => {
            trashBody.innerHTML = '';
            const trashBin = await loadTrashBin();
            const allAssignments = await loadAssignments();

            // ゴミ箱にあるタスクを表示
            const trashedTasks = [];
            for (const identifier of trashBin) {
                const match = allAssignments.find(a =>
                    (a.url && a.url === identifier) ||
                    (a.fallbackUrl && a.fallbackUrl === identifier)
                );
                if (match) {
                    trashedTasks.push(match);
                } else {
                    // assignment データにない場合は識別子のみ表示
                    trashedTasks.push({ url: identifier, fallbackUrl: '', title: identifier, course: '(不明)', deletedAt: '' });
                }
            }

            if (trashedTasks.length === 0) {
                const emptyMsg = document.createElement('p');
                emptyMsg.className = 'ux-trash-empty';
                emptyMsg.textContent = 'ゴミ箱は空です';
                trashBody.appendChild(emptyMsg);
                return;
            }

            const trashList = document.createElement('ul');
            trashList.className = 'ux-trash-list';

            for (const task of trashedTasks) {
                const li = document.createElement('li');
                li.className = 'ux-trash-item';

                const info = document.createElement('div');
                info.className = 'ux-trash-item-info';

                const titleSpan = document.createElement('span');
                titleSpan.className = 'ux-trash-item-title';
                titleSpan.textContent = task.title || '(無題)';
                info.appendChild(titleSpan);

                const meta = document.createElement('span');
                meta.className = 'ux-trash-item-meta';
                const courseName = task.course || '';
                const deletedDate = task.deletedAt
                    ? new Date(task.deletedAt).toLocaleString()
                    : '';
                meta.textContent = [courseName, deletedDate ? `削除: ${deletedDate}` : ''].filter(Boolean).join(' / ');
                info.appendChild(meta);

                li.appendChild(info);

                const restoreBtn = document.createElement('button');
                restoreBtn.type = 'button';
                restoreBtn.className = 'ux-trash-restore-btn';
                restoreBtn.textContent = '復元';
                restoreBtn.title = 'タスクを復元する';
                restoreBtn.onclick = async () => {
                    const identifier = task.url || task.fallbackUrl;
                    await removeFromTrash(identifier);

                    // assignment の isDeleted フラグも解除
                    const currentAssignments = await loadAssignments();
                    const idx = currentAssignments.findIndex(a =>
                        (a.url && a.url === identifier) ||
                        (a.fallbackUrl && a.fallbackUrl === identifier)
                    );
                    if (idx !== -1) {
                        currentAssignments[idx].isDeleted = false;
                        delete currentAssignments[idx].deletedAt;
                        await saveAssignments(currentAssignments);
                    }

                    // ゴミ箱モーダルとTODOリストを再描画
                    await renderTrashContents();
                    await updateAssignments({ forceRemote: false });
                };
                li.appendChild(restoreBtn);

                trashList.appendChild(li);
            }

            trashBody.appendChild(trashList);
        };

        trashFab.onclick = async () => {
            trashOverlay.style.display = 'flex';
            await renderTrashContents();
        };

        trashCloseBtn.onclick = () => {
            trashOverlay.style.display = 'none';
        };

        trashOverlay.onclick = (e) => {
            if (e.target === trashOverlay) {
                trashOverlay.style.display = 'none';
            }
        };
        onUxDebugModeChange((enabled) => {
            trashFab.hidden = !enabled;
            if (!enabled) {
                trashOverlay.style.display = 'none';
            }
        });
    };
    setupDebugTrash();

    // Initialize ToDo List in the dashboard
    todoStatus.textContent = '課題を読み込み中...';
    await updateAssignments({ fallbackRemoteWhenEmpty: true });
    scheduleCourseLayoutSync();

    // ページを開いた時点で前回同期が古ければ、バックグラウンドの定期同期を待たずに即同期する。
    // 表示自体はキャッシュ済みリストで先に済ませてあるため、ここは非同期で走らせる。
    void (async () => {
        try {
            if (!(await isTodoApiSyncEnabled())) return;
            const syncTimes = await chrome.storage.local.get({
                [STORAGE_KEY_TODO_API_LAST_AUTO_SYNC]: '',
                [STORAGE_KEY_TODO_API_LAST_MANUAL_RELOAD]: ''
            });
            const lastSyncTime = Math.max(
                0,
                ...[
                    syncTimes[STORAGE_KEY_TODO_API_LAST_AUTO_SYNC],
                    syncTimes[STORAGE_KEY_TODO_API_LAST_MANUAL_RELOAD]
                ]
                    .map((raw) => (raw ? new Date(raw).getTime() : NaN))
                    .filter((time) => Number.isFinite(time))
            );
            if (Date.now() - lastSyncTime < TODO_AUTO_SYNC_STALE_MS) return;
            await runTodoApiSyncPipeline({
                trigger: 'page_load',
                mode: 'full',
                forceRemoteReload: true
            });
            await chrome.storage.local.set({
                [STORAGE_KEY_TODO_API_LAST_AUTO_SYNC]: new Date().toISOString()
            });
        } catch (error) {
            uxDebugWarn('[WebClass UX] page load todo sync failed', error);
        }
    })();

    // Initialize Messages (Switch View 2)
    let currentMessageData = null;
    let synchronizedUnreadCount = null;
    const storedMessageState = await getUxStoredMessageUnreadState(null);
    if (storedMessageState?.version === UX_MESSAGE_BADGE_STORAGE_VERSION) {
        synchronizedUnreadCount = normalizeUxMessageUnreadCount(
            storedMessageState.unreadCount,
        );
    }
    let activeMessageDetail = null;
    let showUnreadMessagesOnly = false;
    let messageRefreshAnimationToken = 0;
    const messageTab = document.getElementById('tab-messages');
    const messageTabBadge = messageTab?.querySelector('.ux-dashboard-v2-tab-badge');

    const updateMessageSelectionControls = () => {
        const selectableCheckboxes = Array.from(
            messageContent.querySelectorAll('.ux-message-checkbox:not(:disabled)')
        );
        const selectedIds = getSelectedMessageIds(messageContent);
        const selectedCount = selectedIds.length;
        const selectedUnreadCount = selectableCheckboxes.filter((checkbox) =>
            checkbox.checked && checkbox.closest('.ux-message-row')?.classList.contains('is-unread')
        ).length;
        selectAllCheckbox.checked = selectableCheckboxes.length > 0
            && selectedCount === selectableCheckboxes.length;
        selectAllCheckbox.indeterminate = selectedCount > 0
            && selectedCount < selectableCheckboxes.length;
        selectAllCheckbox.disabled = selectableCheckboxes.length === 0;

        messageSelectionBar.hidden = activeMessageDetail !== null || selectedCount === 0;
        messageSelectionStatus.textContent = selectedCount > 0 ? `${selectedCount}件を選択中` : '';
        markAllReadBtn.disabled = selectedUnreadCount === 0;
        const actionLabel = markAllReadBtn.querySelector('span:last-child');
        if (actionLabel) {
            actionLabel.textContent = selectedUnreadCount > 0
                ? `${selectedUnreadCount}件を既読にする`
                : '未読を選択してください';
        }
    };

    const showMessageList = () => {
        activeMessageDetail = null;
        messageSection.classList.remove('is-detail-open');
        renderCurrentMessages();
    };

    const openMessageDetail = async (message) => {
        activeMessageDetail = message;
        messageSection.classList.add('is-detail-open');
        messageSelectionBar.hidden = true;
        messageContent.innerHTML = '<p class="ux-message-loading">本文を読み込み中...</p>';
        const detail = await fetchMessageDetail(message);
        if (activeMessageDetail !== message) return;
        renderMessageDetail(messageContent, message, detail, { onBack: showMessageList });
    };

    const renderCurrentMessages = () => {
        if (activeMessageDetail) return;
        const visibleMessageData = showUnreadMessagesOnly && currentMessageData
            ? {
                ...currentMessageData,
                messages: (currentMessageData.messages || []).filter((message) => message.isUnread)
            }
            : currentMessageData;
        renderMessageWindow(messageContent, visibleMessageData, {
            onSelectionChange: updateMessageSelectionControls,
            onOpen: openMessageDetail,
            emptyTitle: showUnreadMessagesOnly ? '未読メッセージはありません' : undefined,
            emptyDetail: showUnreadMessagesOnly ? 'このページのメッセージはすべて確認済みです。' : undefined
        });
        const pageInfo = currentMessageData?.pageInfo || {};
        messagePageStatus.textContent = `${pageInfo.currentPage || 1} / ${pageInfo.totalPages || 1}`;
        previousMessagePageBtn.disabled = !pageInfo.previousUrl;
        nextMessagePageBtn.disabled = !pageInfo.nextUrl;
        updateMessageSelectionControls();
    };

    const getSynchronizedUnreadCount = () => normalizeUxMessageUnreadCount(
        synchronizedUnreadCount ?? currentMessageData?.unreadCount,
    ) ?? 0;

    const updateUnreadBadge = () => {
        const unreadCount = getSynchronizedUnreadCount();
        if (unreadCount > 0) {
            if (messageTabBadge) {
                messageTabBadge.textContent = unreadCount > 99
                    ? '99+'
                    : String(unreadCount);
                messageTabBadge.hidden = false;
            }
            messageTab?.classList.add('has-unread');
            messageTab?.setAttribute('aria-label', `メッセージ 未読 ${unreadCount}件`);
        } else {
            if (messageTabBadge) {
                messageTabBadge.textContent = '';
                messageTabBadge.hidden = true;
            }
            messageTab?.classList.remove('has-unread');
            messageTab?.setAttribute('aria-label', 'メッセージ 未読なし');
        }
    };

    onUxMessageUnreadCountChange((nextCount) => {
        synchronizedUnreadCount = nextCount ?? 0;
        if (currentMessageData) {
            currentMessageData.unreadCount = synchronizedUnreadCount;
        }
        updateUnreadBadge();
        if (currentMessageData) {
            const totalCount = currentMessageData.totalCount || currentMessageData.messages?.length || 0;
            messageStatus.textContent = `${totalCount}件 · 未読 ${synchronizedUnreadCount}件`;
        }
    });

    const updateDebugReceiveButtonVisibility = (enabled = uxIsDebugModeEnabled()) => {
        debugReceiveBtn.style.display = enabled ? 'inline-flex' : 'none';
    };
    updateDebugReceiveButtonVisibility();
    onUxDebugModeChange((enabled) => {
        updateDebugReceiveButtonVisibility(enabled);
    });

    const persistMessageBadgeState = async () => {
        try {
            await setUxStoredMessageUnreadCount(getSynchronizedUnreadCount(), {
                totalCount: currentMessageData?.totalCount || currentMessageData?.messages?.length || 0,
                source: 'home-sync',
            });
        } catch {
            // ignore cache errors
        }
    };

    let messagePollTimer = null;
    const scheduleMessagePolling = (delayMs = 60000) => {
        if (messagePollTimer) {
            clearTimeout(messagePollTimer);
        }
        messagePollTimer = window.setTimeout(async () => {
            if (document.hidden) {
                scheduleMessagePolling(delayMs);
                return;
            }
            await updateMessages({ silent: true });
            scheduleMessagePolling(delayMs);
        }, delayMs);
    };

    const updateMessages = async ({ silent = false, pageUrl = null } = {}) => {
        let succeeded = false;
        if (!silent) {
            refreshMsgBtn.innerHTML = TODO_RELOAD_ICON_REFRESH;
            refreshMsgBtn.classList.remove('ux-check-btn', 'ux-drawing', 'ux-success');
            refreshMsgBtn.style.color = 'var(--ux-home-secondary-label)';
            refreshMsgBtn.disabled = true;
            refreshMsgBtn.classList.add('ux-loading');
            refreshMsgBtn.title = '更新中';
            refreshMsgBtn.setAttribute('aria-label', 'メッセージを更新中');
            markAllReadBtn.disabled = true;
            messageContent.innerHTML = '<p class="ux-message-loading">メッセージを読み込み中...</p>';
        }
        messageStatus.textContent = 'メッセージを取得中...';
        try {
            currentMessageData = await fetchMessages(pageUrl);
            const parsedUnreadCount = normalizeUxMessageUnreadCount(
                currentMessageData.unreadCount,
            );
            if (!currentMessageData.error) {
                synchronizedUnreadCount = parsedUnreadCount ?? 0;
            }
            currentMessageData.unreadCount = getSynchronizedUnreadCount();
            if (!currentMessageData.error) {
                await persistMessageBadgeState();
            }
            renderCurrentMessages();
            updateUnreadBadge();
            const totalCount = currentMessageData.totalCount || currentMessageData.messages?.length || 0;
            messageStatus.textContent = `${totalCount}件 · 未読 ${getSynchronizedUnreadCount()}件`;
            succeeded = !currentMessageData.error;
        } catch (err) {
            uxDebugWarn('[WebClass UX] Message fetch error', err);
            messageStatus.textContent = 'メッセージ取得に失敗しました';
            if (!silent) {
                messageContent.replaceChildren(createMessageEmptyState({
                    title: 'メッセージを読み込めませんでした',
                    detail: '通信状態を確認して更新してください。',
                    tone: 'warning'
                }));
            }
        } finally {
            if (!silent) {
                refreshMsgBtn.disabled = false;
                refreshMsgBtn.classList.remove('ux-loading');
                refreshMsgBtn.title = '更新';
                refreshMsgBtn.setAttribute('aria-label', 'メッセージを更新');
                updateMessageSelectionControls();
            }
        }
        return succeeded;
    };

    unreadOnlyInput.addEventListener('change', () => {
        showUnreadMessagesOnly = unreadOnlyInput.checked;
        renderCurrentMessages();
    });

    refreshMsgBtn.onclick = async () => {
        if (refreshMsgBtn.disabled) return;
        const animationToken = ++messageRefreshAnimationToken;
        const succeeded = await updateMessages({
            pageUrl: currentMessageData?.pageInfo?.currentUrl || null
        });
        if (!succeeded) return;

        refreshMsgBtn.innerHTML = TODO_RELOAD_ICON_CHECK;
        refreshMsgBtn.classList.add('ux-check-btn', 'ux-success');
        refreshMsgBtn.style.color = 'var(--ux-home-success-foreground)';
        refreshMsgBtn.title = '更新完了';
        refreshMsgBtn.setAttribute('aria-label', 'メッセージの更新が完了しました');
        requestAnimationFrame(() => refreshMsgBtn.classList.add('ux-drawing'));
        window.setTimeout(() => {
            if (animationToken !== messageRefreshAnimationToken) return;
            refreshMsgBtn.innerHTML = TODO_RELOAD_ICON_REFRESH;
            refreshMsgBtn.classList.remove('ux-check-btn', 'ux-drawing', 'ux-success');
            refreshMsgBtn.style.color = 'var(--ux-home-secondary-label)';
            refreshMsgBtn.title = '更新';
            refreshMsgBtn.setAttribute('aria-label', 'メッセージを更新');
        }, TODO_RELOAD_SUCCESS_VISIBLE_MS);
    };
    previousMessagePageBtn.onclick = () => updateMessages({
        pageUrl: currentMessageData?.pageInfo?.previousUrl || null
    });
    nextMessagePageBtn.onclick = () => updateMessages({
        pageUrl: currentMessageData?.pageInfo?.nextUrl || null
    });

    debugReceiveBtn.onclick = async () => {
        const now = new Date();
        const receivedAt = now.toLocaleString('ja-JP');
        if (!currentMessageData || !Array.isArray(currentMessageData.messages)) {
            currentMessageData = {
                messages: [],
                unreadCount: 0,
                totalCount: 0,
                formAction: null,
                numCboxes: '0',
                acs: getAcsParameter(),
                messageForm: null
            };
        }

        const nextUnreadCount = getSynchronizedUnreadCount() + 1;

        currentMessageData.messages.unshift({
            id: `debug-${now.getTime()}`,
            sender: 'Debug Sender',
            subject: `デバッグ受信メッセージ ${nextUnreadCount}`,
            date: receivedAt,
            url: null,
            isUnread: true,
            index: -1
        });
        synchronizedUnreadCount = nextUnreadCount;
        currentMessageData.unreadCount = synchronizedUnreadCount;
        currentMessageData.totalCount = currentMessageData.messages.length;
        renderCurrentMessages();
        updateUnreadBadge();
        messageStatus.textContent = `${currentMessageData.totalCount}件 · 未読 ${getSynchronizedUnreadCount()}件`;
        await persistMessageBadgeState();
        activateDashboardMainTab('tab-messages');
    };

    selectAllCheckbox.addEventListener('change', () => {
        messageContent.querySelectorAll('.ux-message-checkbox:not(:disabled)').forEach((checkbox) => {
            checkbox.checked = selectAllCheckbox.checked;
            checkbox.closest('.ux-message-row')?.classList.toggle('is-selected', checkbox.checked);
        });
        updateMessageSelectionControls();
    });

    markAllReadBtn.onclick = async () => {
        if (!currentMessageData || currentMessageData.messages.length === 0) {
            // アニメーションだけ再生
            markAllReadBtn.classList.add('ux-drawing');
            setTimeout(() => markAllReadBtn.classList.remove('ux-drawing'), 400);
            return;
        }
        const selectedIds = getSelectedMessageIds(messageContent);
        const selectedIdSet = new Set(selectedIds);
        const targetMessages = currentMessageData.messages.filter((message) =>
            message.isUnread && selectedIdSet.has(String(message.id))
        );
        if (targetMessages.length === 0) {
            // アニメーションだけ再生
            markAllReadBtn.classList.add('ux-drawing');
            setTimeout(() => markAllReadBtn.classList.remove('ux-drawing'), 400);
            return;
        }

        markAllReadBtn.disabled = true;
        markAllReadBtn.classList.add('ux-drawing');
        const targetIds = targetMessages.map(m => m.id).filter(id => id);
        const success = await markMessagesAsRead(targetIds, currentMessageData.messageForm);

        if (success) {
            currentMessageData.messages.forEach(m => {
                if (targetIds.includes(m.id)) {
                    m.isUnread = false;
                }
            });
            synchronizedUnreadCount = Math.max(
                0,
                getSynchronizedUnreadCount() - targetMessages.length,
            );
            currentMessageData.unreadCount = synchronizedUnreadCount;
            renderCurrentMessages();
            updateUnreadBadge();
            messageStatus.textContent = `${currentMessageData.totalCount}件 · 未読 ${getSynchronizedUnreadCount()}件`;
            await persistMessageBadgeState();
        } else {
            alert('既読処理に失敗しました');
        }

        markAllReadBtn.classList.remove('ux-drawing');
        updateMessageSelectionControls();
    };

    await updateMessages();
    if (requestedDashboardTabId === 'tab-messages') {
        activateDashboardMainTab(requestedDashboardTabId);
    }
    scheduleMessagePolling();
}
