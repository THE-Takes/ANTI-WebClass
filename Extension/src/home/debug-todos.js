// home/debug-todos.js
// Debug-only task creators for local UI and external ToDo integrations.

const UX_DEBUG_API_TODO_CATEGORY = 'debug-api';
const UX_DEBUG_TODO_TARGET_API = 'api';
const UX_DEBUG_TODO_TARGET_LOCAL = 'local';
const UX_DEBUG_API_TODO_QUERY_KEY = 'webclass_ux_debug_todo';

function getDebugApiCourseKey(course) {
    return course?.courseId || course?.displayName || '';
}

function buildDebugApiTodoUrl(course, uniqueId) {
    const baseUrl = course?.courseUrl || window.location.href;

    try {
        const parsed = new URL(baseUrl, window.location.href);
        // Do not copy the current WebClass session token into an external task.
        parsed.search = '';
        parsed.hash = '';
        parsed.searchParams.set(UX_DEBUG_API_TODO_QUERY_KEY, uniqueId);
        return parsed.toString();
    } catch {
        return `https://webclass-debug.invalid/todo/${encodeURIComponent(uniqueId)}`;
    }
}

function buildDebugLocalTodoUrl(course, uniqueId) {
    return course?.courseId
        ? `debug://course.php/${course.courseId}/todo/${uniqueId}`
        : `debug://todo/${uniqueId}`;
}

function appendDebugTodoCreator(container, options = {}) {
    const { onAfterCreate = null } = options;
    const formInstanceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const form = document.createElement('div');
    form.className = 'ux-dashboard-v2-debug-task-form';

    const fields = document.createElement('div');
    fields.className = 'ux-dashboard-v2-debug-task-fields';

    const courseLabel = document.createElement('label');
    courseLabel.className = 'ux-dashboard-v2-debug-task-field';
    const courseLabelText = document.createElement('span');
    courseLabelText.textContent = 'コース';
    const courseSelect = document.createElement('select');
    courseSelect.className = 'ux-dashboard-v2-debug-task-course';
    courseSelect.id = `ux-debug-task-course-${formInstanceId}`;
    courseLabel.htmlFor = courseSelect.id;
    courseLabel.appendChild(courseLabelText);
    courseLabel.appendChild(courseSelect);
    fields.appendChild(courseLabel);

    const targetLabel = document.createElement('label');
    targetLabel.className = 'ux-dashboard-v2-debug-task-field';
    const targetLabelText = document.createElement('span');
    targetLabelText.textContent = '同期対象';
    const targetSelect = document.createElement('select');
    targetSelect.className = 'ux-dashboard-v2-debug-task-target';
    targetSelect.id = `ux-debug-task-target-${formInstanceId}`;
    [
        { value: UX_DEBUG_TODO_TARGET_API, label: 'API連携対象' },
        { value: UX_DEBUG_TODO_TARGET_LOCAL, label: 'ローカルのみ' }
    ].forEach(({ value, label }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        targetSelect.appendChild(option);
    });
    targetLabel.htmlFor = targetSelect.id;
    targetLabel.appendChild(targetLabelText);
    targetLabel.appendChild(targetSelect);
    fields.appendChild(targetLabel);

    const titleLabel = document.createElement('label');
    titleLabel.className = 'ux-dashboard-v2-debug-task-field';
    const titleLabelText = document.createElement('span');
    titleLabelText.textContent = 'タスク名';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = '連携確認';
    titleInput.className = 'ux-dashboard-v2-debug-task-title';
    titleInput.id = `ux-debug-task-title-${formInstanceId}`;
    titleInput.maxLength = 200;
    titleLabel.htmlFor = titleInput.id;
    titleLabel.appendChild(titleLabelText);
    titleLabel.appendChild(titleInput);
    fields.appendChild(titleLabel);

    const deadlineLabel = document.createElement('label');
    deadlineLabel.className = 'ux-dashboard-v2-debug-task-field';
    const deadlineLabelText = document.createElement('span');
    deadlineLabelText.textContent = '期限';
    const deadlineInput = document.createElement('input');
    deadlineInput.type = 'text';
    deadlineInput.readOnly = true;
    deadlineInput.value = '期限なし';
    deadlineInput.className = 'ux-dashboard-v2-debug-task-deadline';
    deadlineInput.id = `ux-debug-task-deadline-${formInstanceId}`;
    deadlineInput.title = 'クリックで期限を設定（クリアで期限なし）';
    deadlineLabel.htmlFor = deadlineInput.id;
    deadlineLabel.appendChild(deadlineLabelText);
    deadlineLabel.appendChild(deadlineInput);
    fields.appendChild(deadlineLabel);

    form.appendChild(fields);

    const actions = document.createElement('div');
    actions.className = 'ux-dashboard-v2-debug-actions';

    const createButton = document.createElement('button');
    createButton.type = 'button';
    createButton.textContent = 'デバッグTODOを追加';
    createButton.title = '選択した同期対象でテストタスクを1件追加';
    createButton.disabled = true;
    actions.appendChild(createButton);

    const refreshCoursesButton = document.createElement('button');
    refreshCoursesButton.type = 'button';
    refreshCoursesButton.textContent = 'コース再読込';
    refreshCoursesButton.title = 'コース選択肢を現在の時間割から再取得';
    refreshCoursesButton.className = 'ux-dashboard-v2-debug-task-refresh';
    actions.appendChild(refreshCoursesButton);

    const status = document.createElement('span');
    status.className = 'ux-dashboard-v2-debug-task-status';
    actions.appendChild(status);
    form.appendChild(actions);

    let selectedDeadline = null;
    let courses = [];

    const updateDeadlineDisplay = () => {
        deadlineInput.value = selectedDeadline ? selectedDeadline.toLocaleString('ja-JP') : '期限なし';
    };

    const openDeadlinePicker = (event) => {
        event?.preventDefault();
        event?.stopPropagation();
        openDatetimePopover(deadlineInput, {
            initialDate: selectedDeadline || getWebClassNow(),
            onCommit: async (date) => {
                selectedDeadline = date ? new Date(date.getTime()) : null;
                updateDeadlineDisplay();
            },
            onClear: async () => {
                selectedDeadline = null;
                updateDeadlineDisplay();
            }
        });
    };

    deadlineInput.addEventListener('click', openDeadlinePicker);
    deadlineInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') openDeadlinePicker(event);
    });

    const refreshCourseOptions = async () => {
        const previousKey = courseSelect.value;
        createButton.disabled = true;
        refreshCoursesButton.disabled = true;
        courseSelect.disabled = true;
        status.textContent = 'コースを読み込み中...';

        try {
            courses = typeof collectDevdevCourseEntries === 'function'
                ? await collectDevdevCourseEntries()
                : [];
            courseSelect.replaceChildren();

            if (courses.length === 0) {
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.textContent = 'コースが見つかりません';
                courseSelect.appendChild(emptyOption);
                status.textContent = 'コースが見つかりません';
                return;
            }

            courses.forEach((course) => {
                const option = document.createElement('option');
                option.value = getDebugApiCourseKey(course);
                option.textContent = course.displayName || course.fullName || '(名称なし)';
                courseSelect.appendChild(option);
            });

            const nextKey = courses.some((course) => getDebugApiCourseKey(course) === previousKey)
                ? previousKey
                : getDebugApiCourseKey(courses[0]);
            courseSelect.value = nextKey;
            courseSelect.disabled = false;
            createButton.disabled = false;
            status.textContent = `${courses.length}コースから選択できます`;
        } catch (error) {
            courses = [];
            courseSelect.replaceChildren();
            status.textContent = 'コースの読み込みに失敗しました';
            uxDebugWarn('[WebClass UX] debug API course loading failed', error);
        } finally {
            refreshCoursesButton.disabled = false;
        }
    };

    refreshCoursesButton.addEventListener('click', () => {
        void refreshCourseOptions();
    });

    createButton.addEventListener('click', async () => {
        if (createButton.disabled) return;

        const course = courses.find((candidate) => getDebugApiCourseKey(candidate) === courseSelect.value);
        if (!course) {
            status.textContent = 'コースを選択してください';
            return;
        }

        createButton.disabled = true;
        refreshCoursesButton.disabled = true;
        status.textContent = '保存中...';

        const titleBase = titleInput.value.trim() || '連携確認';
        const deadlineValue = selectedDeadline ? selectedDeadline.toLocaleString() : '期限なし';
        const originalDeadlineValue = selectedDeadline ? deadlineValue : null;
        const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const target = targetSelect.value === UX_DEBUG_TODO_TARGET_LOCAL
            ? UX_DEBUG_TODO_TARGET_LOCAL
            : UX_DEBUG_TODO_TARGET_API;
        const isApiTarget = target === UX_DEBUG_TODO_TARGET_API;
        const titlePrefix = isApiTarget ? '[API debug]' : '[devdev]';
        const taskUrl = isApiTarget
            ? buildDebugApiTodoUrl(course, uniqueId)
            : buildDebugLocalTodoUrl(course, uniqueId);
        const assignment = {
            title: `${titlePrefix} ${titleBase}`,
            course: course.displayName,
            courseFullName: course.fullName || course.displayName,
            sourceTitle: `${titlePrefix} ${titleBase}`,
            titleEdited: false,
            deadline: deadlineValue,
            originalDeadline: originalDeadlineValue,
            url: taskUrl,
            fallbackUrl: taskUrl,
            isCompleted: false,
            isDeleted: false,
            category: isApiTarget ? UX_DEBUG_API_TODO_CATEGORY : 'devdev',
            debugTodoTarget: target,
            localOnly: !isApiTarget
        };

        let syncError = null;
        let syncResult = null;
        try {
            const current = await loadAssignments();
            await saveAssignments([...current, assignment]);
        } catch (error) {
            status.textContent = 'タスクの保存に失敗しました';
            uxDebugWarn('[WebClass UX] debug task save failed', error);
            createButton.disabled = false;
            refreshCoursesButton.disabled = false;
            return;
        }

        try {
            if (isApiTarget && typeof runTodoApiSync === 'function') {
                syncResult = await runTodoApiSync({
                    mode: 'local_mutation',
                    trigger: 'debug_api_task_create',
                    localMutation: { localKey: taskUrl }
                });
            }
        } catch (error) {
            syncError = error;
            uxDebugWarn('[WebClass UX] debug task sync failed', error);
        }

        try {
            if (typeof onAfterCreate === 'function') {
                await onAfterCreate(assignment, syncResult);
            }
        } catch (error) {
            uxDebugWarn('[WebClass UX] debug task refresh failed', error);
        }

        if (!isApiTarget) {
            status.textContent = 'ローカル保存完了';
        } else if (syncError) {
            status.textContent = `保存済み / API同期失敗: ${syncError.message || '設定を確認してください'}`;
        } else if (syncResult?.skipped && syncResult.reason === 'integration_disabled') {
            status.textContent = 'API連携対象として保存（連携OFFのため未送信）';
        } else if (syncResult?.success === true) {
            status.textContent = '追加・API同期完了';
        } else {
            status.textContent = '保存しました';
        }

        createButton.disabled = false;
        refreshCoursesButton.disabled = false;
    });

    container.appendChild(form);
    void refreshCourseOptions();
}
