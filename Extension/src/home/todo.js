// home/todo.js
// ToDo list rendering and item interactions.

function renderToDoList(assignments, container, renderOptions = {}) {
    closeDatetimePopover();
    cleanupTodoTitleAutoScroll();
    container.innerHTML = '';
    const { viewMode = 'normal' } = renderOptions;
    const todoCourseNameMap = buildTodoCourseDisplayNameMap();
    const preferShortCourseFallback = assignments.some((todo) => {
        const sourceUrl = todo?.url || todo?.fallbackUrl || '';
        const courseId = extractCourseIdFromUrl(sourceUrl);
        const fullName = normalizeDevdevCourseText(todo?.courseFullName || '');
        const byIdName = courseId && todoCourseNameMap.byId instanceof Map
            ? normalizeDevdevCourseText(todoCourseNameMap.byId.get(courseId) || '')
            : '';
        const byFullName = fullName && todoCourseNameMap.byFullName instanceof Map
            ? normalizeDevdevCourseText(todoCourseNameMap.byFullName.get(fullName) || '')
            : '';
        const timetableName = byIdName || byFullName;
        return !!(timetableName && fullName && timetableName !== fullName);
    });
    const getTodoIdentity = (todo) => {
        if (!todo || typeof todo !== 'object') return '';
        return todo.url || todo.fallbackUrl || `${todo.title || ''}::${todo.course || ''}::${todo.deadline || ''}`;
    };
    let expiredTodoKeys = new Set();

    // ダッシュボード用アイテム作成関数
    const createDashboardItem = (todo, options = {}) => {
        const li = document.createElement('li');
        li.style.padding = '12px 15px';
        li.style.borderBottom = 'none';
        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.style.gap = '12px';
        li.style.backgroundColor = 'var(--ux-home-surface)';

        const refreshDashboardList = async () => {
            if (renderOptions.onStatusChange) {
                renderOptions.onStatusChange();
                return;
            }
            const updatedAssignments = await loadAssignments();
            renderToDoList(updatedAssignments, container, renderOptions);
            applyTimetableColorsFromTodo(updatedAssignments);
        };

        // Priority color
        const priority = getTodoPriority(todo);
        let pColor = 'var(--ux-home-quaternary-label)';
        let priorityLabel = priority;
        const isDashboardExpired = viewMode === 'dashboard' && expiredTodoKeys.has(getTodoIdentity(todo));
        if (isDashboardExpired) {
            pColor = 'var(--ux-home-purple-foreground)';
            priorityLabel = 'end';
        } else {
            if (priority === 'High') pColor = 'var(--ux-home-danger)';
            if (priority === 'Medium') pColor = 'var(--ux-home-warning)';
            if (priority === 'Low') pColor = 'var(--ux-home-success)';
            if (priority === 'Done') pColor = 'var(--ux-home-quaternary-label)';
        }

        // Checkbox (Round)
        const checkbox = document.createElement('div');
        checkbox.className = 'ux-todo-checkbox';
        checkbox.style.width = '20px';
        checkbox.style.height = '20px';
        checkbox.style.borderRadius = '50%';
        checkbox.style.border = '2px solid ' + (todo.isCompleted ? 'var(--ux-home-success)' : pColor);
        checkbox.style.backgroundColor = todo.isCompleted ? 'var(--ux-home-success)' : 'transparent';
        checkbox.style.cursor = 'pointer';
        checkbox.style.display = 'flex';
        checkbox.style.alignItems = 'center';
        checkbox.style.justifyContent = 'center';
        checkbox.title = priorityLabel;
        checkbox.setAttribute('aria-label', priorityLabel);

        if (todo.isCompleted) {
            const checkMark = document.createElement('span');
            checkMark.textContent = '✓';
            checkMark.style.color = '#fff';
            checkMark.style.fontSize = '12px';
            checkbox.appendChild(checkMark);
        }

        checkbox.onclick = async (e) => {
            e.stopPropagation();
            todo.isCompleted = !todo.isCompleted;
            // Update Storage
            await updateAssignment(
                todo,
                { isCompleted: todo.isCompleted },
                { waitForTodoApiSync: false }
            );
            // Re-render
            if (renderOptions.onStatusChange) renderOptions.onStatusChange();
            else renderToDoList(assignments, container, renderOptions);
        };
        li.appendChild(checkbox);

        // Content
        const content = document.createElement('div');
        content.style.flex = '1';
        content.style.minWidth = '0';
        content.style.display = 'flex';
        content.style.flexDirection = 'column';
        content.style.gap = '0px';

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.value = todo.title || '';
        titleInput.className = 'ux-todo-input-title';
        titleInput.style.width = '100%';
        titleInput.style.border = '1px solid transparent';
        titleInput.style.borderRadius = '3px';
        titleInput.style.padding = '2px 0';
        titleInput.style.fontSize = '0.95em';
        titleInput.style.fontWeight = '500';
        titleInput.style.color = todo.isCompleted ? 'var(--ux-home-quaternary-label)' : 'var(--ux-home-label)';
        titleInput.style.backgroundColor = 'transparent';
        titleInput.style.overflow = 'hidden';
        titleInput.style.textDecoration = todo.isCompleted ? 'line-through' : 'none';
        titleInput.style.transition = 'border-color 0.2s, background-color 0.2s';

        titleInput.onfocus = () => {
            titleInput.style.borderColor = 'var(--ux-home-accent)';
            titleInput.style.backgroundColor = 'var(--ux-home-surface)';
            titleInput.style.outline = 'none';
        };
        titleInput.onblur = () => {
            titleInput.style.borderColor = 'transparent';
            titleInput.style.backgroundColor = 'transparent';
        };

        titleInput.onchange = async () => {
            const newVal = titleInput.value.trim();
            if (!newVal) {
                // 空の場合は元に戻すなどの処理が必要かも？ここではそのまま保存
            }
            await updateAssignment(todo, { title: newVal });
        };

        const dashboardTitleScrollCleanup = attachTodoTitleAutoScroll(titleInput);
        if (typeof dashboardTitleScrollCleanup === 'function') {
            uxTodoTitleAutoScrollCleanups.push(dashboardTitleScrollCleanup);
        }

        content.appendChild(titleInput);

        const dashboardCourseLabel = getTodoCourseDisplayName(todo, todoCourseNameMap, preferShortCourseFallback);
        if (dashboardCourseLabel) {
            const courseLine = document.createElement('div');
            courseLine.style.fontSize = '0.72em';
            courseLine.style.color = 'var(--ux-home-secondary-label)';
            courseLine.style.overflow = 'hidden';
            courseLine.style.textOverflow = 'ellipsis';
            courseLine.style.whiteSpace = 'nowrap';
            courseLine.textContent = dashboardCourseLabel;
            content.appendChild(courseLine);
        }

        const deadlineLine = document.createElement('div');
        deadlineLine.className = 'ux-todo-deadline-line';
        deadlineLine.style.fontSize = '0.8em';
        deadlineLine.style.color = 'var(--ux-home-secondary-label)';
        deadlineLine.style.display = 'flex';
        deadlineLine.style.alignItems = 'center';
        deadlineLine.style.gap = '0.4em';
        deadlineLine.style.flexWrap = 'nowrap';
        deadlineLine.style.whiteSpace = 'nowrap';

        const dateOnlyInput = document.createElement('input');
        dateOnlyInput.type = 'text';
        dateOnlyInput.className = 'ux-todo-input-date';
        dateOnlyInput.style.fontSize = '0.85em';
        dateOnlyInput.style.border = '1px solid transparent';
        dateOnlyInput.style.borderRadius = '0';
        dateOnlyInput.style.padding = '0';
        dateOnlyInput.style.color = 'var(--ux-home-secondary-label)';
        dateOnlyInput.style.backgroundColor = 'transparent';
        dateOnlyInput.style.width = '10ch';
        dateOnlyInput.style.minWidth = '0';
        dateOnlyInput.style.textAlign = 'left';
        dateOnlyInput.style.transition = 'border-color 0.2s';
        dateOnlyInput.style.borderBottom = '1px solid transparent';
        dateOnlyInput.placeholder = '期限';
        dateOnlyInput.readOnly = true;
        dateOnlyInput.style.cursor = 'pointer';

        const timeOnlyInput = document.createElement('input');
        timeOnlyInput.type = 'text';
        timeOnlyInput.className = 'ux-todo-input-time';
        timeOnlyInput.style.fontSize = '0.85em';
        timeOnlyInput.style.border = '1px solid transparent';
        timeOnlyInput.style.borderRadius = '0';
        timeOnlyInput.style.padding = '0';
        timeOnlyInput.style.color = 'var(--ux-home-secondary-label)';
        timeOnlyInput.style.backgroundColor = 'transparent';
        timeOnlyInput.style.width = '8ch';
        timeOnlyInput.style.minWidth = '0';
        timeOnlyInput.style.textAlign = 'left';
        timeOnlyInput.style.transition = 'border-color 0.2s';
        timeOnlyInput.style.borderBottom = '1px solid transparent';
        timeOnlyInput.placeholder = '時刻';
        timeOnlyInput.readOnly = true;
        timeOnlyInput.style.cursor = 'pointer';

        dateOnlyInput.size = 10;
        timeOnlyInput.size = 8;

        const formatDashboardTime = (date) => {
            let hours = date.getHours();
            const minutes = date.getMinutes();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12;
            return `${ampm} ${hours}:${minutes < 10 ? '0' + minutes : minutes}`;
        };

        const updateDeadlineDisplay = (date) => {
            if (!date) {
                dateOnlyInput.value = '期限なし';
                timeOnlyInput.value = '';
                timeOnlyInput.style.display = 'none';
                return;
            }
            dateOnlyInput.value = date.toLocaleDateString();
            timeOnlyInput.value = formatDashboardTime(date);
            timeOnlyInput.style.display = '';
        };

        let currentDeadline = null;
        if (todo.deadline && todo.deadline !== '期限なし') {
            const d = new Date(todo.deadline);
            if (!isNaN(d.getTime())) {
                currentDeadline = d;
                updateDeadlineDisplay(d);
            }
        }
        if (!currentDeadline) {
            updateDeadlineDisplay(null);
        }

        const commitDeadline = async (date, shouldRefresh = true) => {
            if (!date) {
                if (todo.deadline !== '期限なし') {
                    await updateAssignment(todo, { deadline: '期限なし' });
                    todo.deadline = '期限なし';
                    if (shouldRefresh) {
                        await refreshDashboardList();
                    }
                    return true;
                }
                return false;
            }

            const newDeadlineStr = date.toLocaleString();
            if (todo.deadline !== newDeadlineStr) {
                await updateAssignment(todo, { deadline: newDeadlineStr });
                todo.deadline = newDeadlineStr;
                if (shouldRefresh) {
                    await refreshDashboardList();
                }
                return true;
            }
            return false;
        };

        const openPicker = (event) => {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            let needsRefresh = false;
            openDatetimePopover(deadlineLine, {
                initialDate: currentDeadline,
                onCommit: async (date) => {
                    currentDeadline = date;
                    updateDeadlineDisplay(date);
                    const changed = await commitDeadline(date, false);
                    needsRefresh = needsRefresh || changed;
                },
                onClear: async () => {
                    currentDeadline = null;
                    updateDeadlineDisplay(null);
                    const changed = await commitDeadline(null, false);
                    needsRefresh = needsRefresh || changed;
                },
                onClose: async () => {
                    if (needsRefresh) {
                        await refreshDashboardList();
                    }
                }
            });
        };

        dateOnlyInput.addEventListener('click', openPicker);
        timeOnlyInput.addEventListener('click', openPicker);
        dateOnlyInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                openPicker(event);
            }
        });
        timeOnlyInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                openPicker(event);
            }
        });

        deadlineLine.appendChild(dateOnlyInput);
        deadlineLine.appendChild(timeOnlyInput);
        content.appendChild(deadlineLine);

        li.appendChild(content);

        const rightMeta = document.createElement('div');
        rightMeta.style.display = 'flex';
        rightMeta.style.alignItems = 'center';
        rightMeta.style.gap = '8px';

        li.appendChild(rightMeta);

        // Delete action (simple X for now)
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '&times;';
        deleteBtn.style.background = 'none';
        deleteBtn.style.border = 'none';
        deleteBtn.style.color = 'var(--ux-home-quaternary-label)';
        deleteBtn.style.fontSize = '18px';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.padding = '0 5px';
        deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            if (e.shiftKey || confirm('削除しますか？')) {
                await addToTrash(todo);
                await updateAssignment(todo, { isDeleted: true, deletedAt: getWebClassNow().toISOString() });
                if (renderOptions.onStatusChange) renderOptions.onStatusChange();
                else renderToDoList(assignments, container, renderOptions);
            }
        };
        li.appendChild(deleteBtn);

        return li;
    };

    // 1. 分類ロジック
    // 削除済み(isDeleted)またはゴミ箱に入っているタスクは表示しない
    const visibleAssignments = assignments.filter(a => !a.isDeleted && !isInTrashBin(a));
    const activeAssignments = visibleAssignments.filter(a => !a.isCompleted);
    const completedAssignments = visibleAssignments.filter(a => a.isCompleted);

    const normal = [];
    const farFuture = [];
    const indefinite = [];
    const expired = []; // 期限切れ（初期設定期限が過ぎている）

    const now = getWebClassNow();
    const oneMonthLater = new Date(now);
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

    activeAssignments.forEach(todo => {
        // 期限切れ判定には「初期設定期限（originalDeadline）」を使用
        // ユーザーが期限を変更しても、システム上の本来の期限で判断する
        const deadlineForExpiredCheck = todo.originalDeadline || todo.deadline;
        const deadlineForDisplay = todo.deadline; // 表示・分類用はユーザー変更後の期限

        if (!deadlineForDisplay || deadlineForDisplay === '期限なし') {
            indefinite.push(todo);
        } else {
            const d = new Date(deadlineForDisplay);
            const dOriginal = new Date(deadlineForExpiredCheck);

            if (isNaN(d.getTime())) {
                // 日付パース失敗 -> 期限なし扱い
                indefinite.push(todo);
            } else if (!isNaN(dOriginal.getTime()) && dOriginal < now) {
                // 期限切れ判定: 初期設定期限が過ぎている場合のみ
                expired.push(todo);
            } else if (d < now) {
                // 任意期限は過ぎているが初期設定期限はまだ → タブ所属なし（通常リストに追加）
                todo._isReminderExpired = true; // 紫背景用フラグ
                normal.push(todo);
            } else if (d > oneMonthLater) {
                farFuture.push(todo);
            } else {
                normal.push(todo);
            }
        }
    });

    // 各グループをソート
    const sortedNormal = sortTodos(normal);
    const sortedFarFuture = sortTodos(farFuture);
    const sortedIndefinite = sortTodos(indefinite);
    const sortedExpired = sortTodos(expired);
    expiredTodoKeys = new Set(sortedExpired.map(getTodoIdentity));

    // 2. 表示ロジック

    if (assignments.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = 'Task Complete🎉';
        empty.style.padding = '20px';
        empty.style.textAlign = 'center';
        empty.style.color = 'var(--ux-home-secondary-label)';
        container.appendChild(empty);
        return;
    }

    // アイテム作成関数
    // options: { isExpired, isReminderExpired, isCompleted, showDeleteButton }
    const createItem = (todo, options = {}) => {
        if (viewMode === 'dashboard') {
            return createDashboardItem(todo, options);
        }

        const { isExpired = false, isReminderExpired = false, isCompleted = false, showDeleteButton = false } = options;

        const li = document.createElement('li');
        li.style.padding = '10px 15px';
        li.style.borderBottom = 'none';
        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.style.gap = '10px';
        li.style.backgroundColor = 'var(--ux-home-surface)'; // デフォルト背景

        // 期限切れの場合はグレー背景
        if (isExpired) {
            li.style.backgroundColor = 'var(--ux-home-surface-muted)';
        }
        // 任意期限が過ぎているが初期設定期限はまだの場合は紫背景
        if (todo._isReminderExpired) {
            li.style.backgroundColor = 'var(--ux-home-purple-soft)';
        }
        // 期限に基づいて背景色を設定 (通常リストのみ、または全リストで適用？ -> 全リストで適用しても良いが、期限なしは白)
        else if (!todo.isCompleted && todo.deadline && todo.deadline !== '期限なし') {
            const deadlineDate = new Date(todo.deadline);
            const hoursRemaining = (deadlineDate - getWebClassNow()) / (1000 * 60 * 60);

            if (hoursRemaining <= 48) {
                li.style.backgroundColor = 'var(--ux-home-danger-soft)';
            } else if (hoursRemaining <= 168) {
                li.style.backgroundColor = 'var(--ux-home-warning-soft)';
            }
        }

        // チェックボックス
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = todo.isCompleted || false;
        checkbox.style.width = '18px';
        checkbox.style.height = '18px';
        checkbox.style.cursor = 'pointer';

        checkbox.onclick = async (e) => {
            e.stopPropagation();
            todo.isCompleted = checkbox.checked;
            await updateAssignment(
                todo,
                { isCompleted: todo.isCompleted },
                { waitForTodoApiSync: false }
            );
            const currentAssignments = await loadAssignments();

            // UI再描画
            renderToDoList(currentAssignments, container);

            // 時間割表の背景色も更新
            applyTimetableColorsFromTodo(currentAssignments);
        };

        li.appendChild(checkbox);

        // コンテンツ
        const content = document.createElement('div');
        content.style.flex = '1';
        content.style.minWidth = '0';

        if (todo.isCompleted) {
            li.style.opacity = '0.6';
            content.style.textDecoration = 'line-through';
        }

        // コース名
        const titleLine = document.createElement('div');
        titleLine.style.fontSize = '0.75em';
        titleLine.style.color = 'var(--ux-home-secondary-label)';

        if (todo.category && todo.category !== 'Unknown') {
            const badge = document.createElement('span');
            badge.textContent = todo.category;
            badge.style.fontSize = '0.75em';
            badge.style.padding = '2px 6px';
            badge.style.borderRadius = '4px';
            badge.style.backgroundColor = 'var(--ux-home-fill)';
            badge.style.color = 'var(--ux-home-secondary-label)';
            badge.style.marginRight = '8px';
            titleLine.appendChild(badge);
        }
        if (titleLine.childNodes.length > 0) {
            content.appendChild(titleLine);
        }

        // 課題名 (編集可能)
        const assignmentLine = document.createElement('div');
        assignmentLine.style.marginTop = '0px';
        assignmentLine.style.minWidth = '0';

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.value = todo.title;
        titleInput.className = 'ux-todo-input-title'; // CSSでスタイル調整推奨
        // インラインスタイルで最低限の見た目を整える
        titleInput.style.width = '100%';
        titleInput.style.border = '1px solid transparent';
        titleInput.style.borderRadius = '3px';
        titleInput.style.padding = '2px 0';
        titleInput.style.fontSize = '1.02em';
        titleInput.style.fontWeight = 'bold';
        titleInput.style.color = 'var(--ux-home-label)';
        titleInput.style.backgroundColor = 'transparent';
        titleInput.style.overflow = 'hidden';
        titleInput.style.transition = 'border-color 0.2s, background-color 0.2s';

        titleInput.onfocus = () => {
            titleInput.style.borderColor = 'var(--ux-home-accent)';
            titleInput.style.backgroundColor = 'var(--ux-home-surface)';
            titleInput.style.outline = 'none';
        };
        titleInput.onblur = () => {
            titleInput.style.borderColor = 'transparent';
            titleInput.style.backgroundColor = 'transparent';
        };

        // タイトル変更時の保存処理
        titleInput.onchange = async () => {
            const newVal = titleInput.value.trim();
            if (!newVal) {
                // 空の場合は元に戻すなどの処理が必要かも？ここではそのまま保存
            }
            await updateAssignment(todo, { title: newVal });
        };

        const normalTitleScrollCleanup = attachTodoTitleAutoScroll(titleInput);
        if (typeof normalTitleScrollCleanup === 'function') {
            uxTodoTitleAutoScrollCleanups.push(normalTitleScrollCleanup);
        }

        assignmentLine.appendChild(titleInput);
        content.appendChild(assignmentLine);

        const todoCourseLabel = getTodoCourseDisplayName(todo, todoCourseNameMap, preferShortCourseFallback);
        if (todoCourseLabel) {
            const courseLine = document.createElement('div');
            courseLine.style.fontSize = '0.75em';
            courseLine.style.color = 'var(--ux-home-secondary-label)';
            courseLine.style.marginTop = '0px';
            courseLine.style.overflow = 'hidden';
            courseLine.style.textOverflow = 'ellipsis';
            courseLine.style.whiteSpace = 'nowrap';
            courseLine.textContent = todoCourseLabel;
            content.appendChild(courseLine);
        }

        const deadlineLine = document.createElement('div');
        deadlineLine.style.fontSize = '0.85em';
        deadlineLine.style.color = 'var(--ux-home-secondary-label)';
        deadlineLine.style.marginTop = '0px';
        deadlineLine.style.display = 'flex';
        deadlineLine.style.alignItems = 'center';
        deadlineLine.style.gap = '5px';
        const deadlineLabel = document.createElement('span');
        deadlineLabel.textContent = '期限: ';
        deadlineLine.appendChild(deadlineLabel);

        // 日付入力 (Flatpickr - Date Only)
        const dateOnlyInput = document.createElement('input');
        dateOnlyInput.type = 'text';
        dateOnlyInput.className = 'ux-todo-input-date';
        dateOnlyInput.style.fontSize = '0.9em';
        dateOnlyInput.style.border = '1px solid var(--ux-home-separator)';
        dateOnlyInput.style.borderRadius = '3px';
        dateOnlyInput.style.padding = '1px 3px';
        dateOnlyInput.style.color = 'var(--ux-home-secondary-label)';
        dateOnlyInput.style.width = '90px';
        dateOnlyInput.style.textAlign = 'center';
        dateOnlyInput.placeholder = '日付';

        // 時間入力 (MobileSelect - Time Only)
        const timeOnlyInput = document.createElement('input');
        timeOnlyInput.type = 'text';
        timeOnlyInput.className = 'ux-todo-input-time';
        timeOnlyInput.style.fontSize = '0.9em';
        timeOnlyInput.style.border = '1px solid var(--ux-home-separator)';
        timeOnlyInput.style.borderRadius = '3px';
        timeOnlyInput.style.padding = '1px 3px';
        timeOnlyInput.style.color = 'var(--ux-home-secondary-label)';
        timeOnlyInput.style.width = '80px';
        timeOnlyInput.style.textAlign = 'center';
        timeOnlyInput.placeholder = '時間';
        timeOnlyInput.readOnly = true; // Prevent keyboard input
        timeOnlyInput.style.cursor = 'pointer';
        const timeInputId = 'time-input-' + Math.random().toString(36).substr(2, 9);
        timeOnlyInput.id = timeInputId;

        // 初期値パース
        let currentDeadline = null;
        if (todo.deadline && todo.deadline !== '期限なし') {
            const d = new Date(todo.deadline);
            if (!isNaN(d.getTime())) {
                currentDeadline = d;
                dateOnlyInput.value = d.toLocaleDateString(); // YYYY/MM/DD or similar

                // Format time for display: AM/PM hh:mm
                let hours = d.getHours();
                const minutes = d.getMinutes();
                const ampm = hours >= 12 ? '午後' : '午前';
                hours = hours % 12;
                hours = hours ? hours : 12; // the hour '0' should be '12'
                const strTime = ampm + ' ' + hours + ':' + (minutes < 10 ? '0' + minutes : minutes);
                timeOnlyInput.value = strTime;
                timeOnlyInput.style.display = '';
            }
        }

        // 保存処理ヘルパー
        if (!currentDeadline) {
            dateOnlyInput.value = '期限なし';
            timeOnlyInput.value = '';
            timeOnlyInput.style.display = 'none';
        }

        const saveCombinedDeadline = async () => {
            const dateStr = dateOnlyInput.value; // YYYY/MM/DD
            const timeStr = timeOnlyInput.value; // AM 8:00

            const isIndefinite = !dateStr || dateStr === '期限なし';
            if (isIndefinite) {
                await updateAssignment(todo, { deadline: '期限なし' });
                dateOnlyInput.value = '期限なし';
                timeOnlyInput.value = '';
                timeOnlyInput.style.display = 'none';
                const updatedAssignments = await loadAssignments();
                renderToDoList(updatedAssignments, container);
                applyTimetableColorsFromTodo(updatedAssignments);
                return;
            }

            let finalDate = new Date(dateStr);
            if (isNaN(finalDate.getTime())) {
                await updateAssignment(todo, { deadline: '期限なし' });
                dateOnlyInput.value = '期限なし';
                timeOnlyInput.value = '';
                timeOnlyInput.style.display = 'none';
                const updatedAssignments = await loadAssignments();
                renderToDoList(updatedAssignments, container);
                applyTimetableColorsFromTodo(updatedAssignments);
                return;
            }

            timeOnlyInput.style.display = '';

            if (timeStr) {
                const parts = timeStr.match(/((?:AM|PM)|午前|午後)\s(\d+):(\d+)/);
                if (parts) {
                    let h = parseInt(parts[2]);
                    const m = parseInt(parts[3]);
                    const meridiem = parts[1];
                    if ((meridiem === 'PM' || meridiem === '午後') && h < 12) h += 12;
                    if ((meridiem === 'AM' || meridiem === '午前') && h === 12) h = 0;
                    finalDate.setHours(h, m);
                }
            } else {
                finalDate.setHours(0, 0);
            }

            const newDeadlineStr = finalDate.toLocaleString();
            if (todo.deadline !== newDeadlineStr) {
                await updateAssignment(todo, { deadline: newDeadlineStr });
                const updatedAssignments = await loadAssignments();
                renderToDoList(updatedAssignments, container);
                applyTimetableColorsFromTodo(updatedAssignments);
            }
        };
        // Flatpickr (Date)
        try {
            if (typeof flatpickr !== 'undefined') {
                flatpickr(dateOnlyInput, {
                    locale: 'ja',
                    dateFormat: "Y/m/d",
                    disableMobile: true,
                    defaultDate: currentDeadline,
                    onClose: async (selectedDates, dateStr, instance) => {
                        await saveCombinedDeadline();
                    }
                });
            } else {
                uxDebugWarn('WebClass UX: flatpickr is not defined');
            }
        } catch (e) {
            console.error('WebClass UX: Failed to init flatpickr', e);
        }

        // MobileSelect (Time)
        // Generate wheels
        const hoursArr = [];
        for (let i = 1; i <= 12; i++) hoursArr.push(i.toString());
        const minutesArr = [];
        for (let i = 0; i < 60; i++) minutesArr.push(i < 10 ? '0' + i : i.toString());

        // Wrap in setTimeout to ensure element is in DOM
        setTimeout(() => {
            // Check if element still exists (in case of rapid re-renders)
            if (!document.getElementById(timeInputId)) return;

            try {
                if (typeof MobileSelect === 'undefined') {
                    uxDebugWarn('WebClass UX: MobileSelect is not defined');
                    return;
                }

                const ms = new MobileSelect({
                    trigger: '#' + timeInputId,
                    title: '時刻',
                    wheels: [
                        { data: ['午前', '午後'] },
                        { data: hoursArr },
                        { data: minutesArr }
                    ],
                    position: [1, 0, 0], // Default position
                    callback: async function (indexArr, data) {
                        const timeString = `${data[0]} ${data[1]}:${data[2]}`;
                        timeOnlyInput.value = timeString;
                        await saveCombinedDeadline();
                    }
                });

                // 初期位置設定 (MobileSelectはinit時にpositionを指定するが、動的に計算が必要)
                if (currentDeadline) {
                    const h = currentDeadline.getHours();
                    const m = currentDeadline.getMinutes();
                    const isPm = h >= 12;
                    const h12 = h % 12 || 12;

                    // Index calculation
                    // Wheel 0: 0=AM, 1=PM
                    // Wheel 1: h12 - 1 (since 1 is index 0)
                    // Wheel 2: m
                    ms.locatePosition(0, isPm ? 1 : 0);
                    ms.locatePosition(1, h12 - 1);
                    ms.locatePosition(2, m);
                }
            } catch (e) {
                console.error('WebClass UX: Failed to init MobileSelect', e);
            }
        }, 0);

        deadlineLine.appendChild(dateOnlyInput);
        deadlineLine.appendChild(timeOnlyInput);
        content.appendChild(deadlineLine);

        li.appendChild(content);

        // 削除ボタンを追加（期限切れ、リマインダー期限切れ、完了済み）
        if (showDeleteButton) {
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.textContent = '削除';
            deleteBtn.title = 'このリマインダーを削除';
            deleteBtn.style.cssText = 'background: transparent; border: 1px solid var(--ux-home-separator); border-radius: 8px; padding: 4px 8px; cursor: pointer; font-size: 14px; opacity: 0.8; color: var(--ux-home-secondary-label); transition: opacity 0.2s, background-color 0.2s, border-color 0.2s, color 0.2s;';
            deleteBtn.onmouseenter = () => { deleteBtn.style.opacity = '1'; };
            deleteBtn.onmouseleave = () => { deleteBtn.style.opacity = '0.7'; };

            deleteBtn.onclick = async (e) => {
                e.stopPropagation();

                // 確認ダイアログ
                if (!e.shiftKey && !confirm(`「${todo.title}」を削除しますか？`)) {
                    return;
                }

                // ゴミ箱に追加
                await addToTrash(todo);

                await updateAssignment(todo, { isDeleted: true, deletedAt: getWebClassNow().toISOString() });
                const currentAssignments = await loadAssignments();

                // UI再描画
                renderToDoList(currentAssignments, container);

                // 時間割表の背景色も更新
                applyTimetableColorsFromTodo(currentAssignments);
            };

            li.appendChild(deleteBtn);
        }

        return li;
    };

    // リスト作成ヘルパー
    // options: createItemに渡すオプション
    const createList = (todos, options = {}) => {
        const ul = document.createElement('ul');
        ul.style.listStyle = 'none';
        ul.style.margin = '0';
        ul.style.padding = '0';
        todos.forEach(t => ul.appendChild(createItem(t, options)));
        return ul;
    };

    // 折りたたみセクション作成ヘルパー
    // stateKey: uiStateのどのキーで開閉状態を保持するか
    const createCollapsible = (title, todos, defaultOpen = false, stateKey = null) => {
        if (todos.length === 0) return null;

        // stateKeyが指定されている場合は、保存された状態を使用
        const isOpen = stateKey && uiState[stateKey] !== undefined ? uiState[stateKey] : defaultOpen;

        const wrapper = document.createElement('div');
        wrapper.style.marginTop = '15px';
        wrapper.style.border = '1px solid var(--ux-home-separator)';
        wrapper.style.borderRadius = '4px';
        // wrapper.style.overflow = 'hidden'; // Removed to allow sticky positioning

        const header = document.createElement('div');
        header.style.padding = '10px 15px';
        header.style.backgroundColor = 'var(--ux-home-surface-muted)';
        header.style.cursor = 'pointer';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.userSelect = 'none';
        // Sticky Header Styles
        header.style.position = 'sticky';
        header.style.top = '0';
        header.style.zIndex = '10';
        header.style.borderBottom = '1px solid var(--ux-home-separator)';
        header.style.borderTopLeftRadius = '4px';
        header.style.borderTopRightRadius = '4px';

        const titleSpan = document.createElement('span');
        titleSpan.style.fontSize = '0.9em';
        titleSpan.style.fontWeight = 'bold';
        titleSpan.style.color = 'var(--ux-home-secondary-label)';
        titleSpan.textContent = `${title} (${todos.length})`;
        header.appendChild(titleSpan);

        const icon = document.createElement('span');
        icon.textContent = isOpen ? '▼' : '▶';
        icon.style.fontSize = '0.8em';
        icon.style.color = 'var(--ux-home-tertiary-label)';
        header.appendChild(icon);

        const content = document.createElement('div');
        content.style.display = isOpen ? 'block' : 'none';
        content.style.borderTop = '1px solid var(--ux-home-separator)';
        content.appendChild(createList(todos));

        header.onclick = () => {
            const currentlyOpen = content.style.display !== 'none';
            content.style.display = currentlyOpen ? 'none' : 'block';
            icon.textContent = currentlyOpen ? '▶' : '▼';
            // 状態を保存
            if (stateKey) {
                uiState[stateKey] = !currentlyOpen;
            }
        };

        wrapper.appendChild(header);
        wrapper.appendChild(content);
        return wrapper;
    };

    // --- レンダリング実行 ---

    if (viewMode === 'dashboard') {
        // Switch View 2では各グループを分割せず1つのリストに表示
        const mergedActive = sortTodos([...normal, ...farFuture, ...indefinite, ...expired, ...completedAssignments]);
        if (mergedActive.length > 0) {
            container.appendChild(createList(mergedActive, {}));
        }
    } else {
        // 1. 通常の課題 (常に表示)
        // ※任意期限が過ぎていても初期設定期限が過ぎていなければここに含まれる
        if (sortedNormal.length > 0) {
            container.appendChild(createList(sortedNormal, {}));
        }

        // 2. 1カ月以上先の課題 (折りたたみ・デフォルト閉)
        const farFutureSection = createCollapsible('1カ月以上先の課題', sortedFarFuture, false, 'farFutureSectionOpen');
        if (farFutureSection) container.appendChild(farFutureSection);

        // 4. 期限なしの課題 (折りたたみ・デフォルト閉)
        const indefiniteSection = createCollapsible('期限なしの課題', sortedIndefinite, false, 'indefiniteSectionOpen');
        if (indefiniteSection) container.appendChild(indefiniteSection);
    }

    // 4. 完了済みの課題 (既存のトグルスタイル)
    if (viewMode !== 'dashboard' && completedAssignments.length > 0) {
        // 保存された状態を使用
        const isCompletedOpen = uiState.completedSectionOpen;

        const toggle = document.createElement('div');
        toggle.textContent = isCompletedOpen ? '完了済みの課題を隠す' : `完了済みの課題を表示 (${completedAssignments.length})`;
        toggle.style.padding = '10px 15px';
        toggle.style.fontSize = '0.85em';
        toggle.style.color = 'var(--ux-home-accent-emphasis)';
        toggle.style.cursor = 'pointer';
        toggle.style.textAlign = 'center';
        toggle.style.backgroundColor = 'var(--ux-home-surface-muted)';
        toggle.style.marginTop = '15px';
        toggle.style.borderRadius = '4px';

        const completedContainer = document.createElement('div');
        completedContainer.style.display = isCompletedOpen ? 'block' : 'none';
        completedContainer.style.marginTop = '5px';
        completedContainer.appendChild(createList(completedAssignments, { isCompleted: true, showDeleteButton: true }));

        toggle.onclick = () => {
            const isHidden = completedContainer.style.display === 'none';
            completedContainer.style.display = isHidden ? 'block' : 'none';
            toggle.textContent = isHidden ? '完了済みの課題を隠す' : `完了済みの課題を表示 (${completedAssignments.length})`;
            // 状態を保存
            uiState.completedSectionOpen = isHidden;
        };

        container.appendChild(toggle);
        container.appendChild(completedContainer);
    }

    // 5. 期限切れの課題 (完了済みの下・折りたたみ・デフォルト閉・削除ボタン付き)
    if (viewMode !== 'dashboard' && sortedExpired.length > 0) {
        const expiredWrapper = document.createElement('div');
        expiredWrapper.style.marginTop = '15px';
        expiredWrapper.style.border = '1px solid rgba(255, 69, 58, 0.18)';
        expiredWrapper.style.borderRadius = '4px';

        // 保存された状態を使用（デフォルトは閉じている）
        const isExpiredOpen = uiState.expiredSectionOpen !== undefined ? uiState.expiredSectionOpen : false;

        const expiredHeader = document.createElement('div');
        expiredHeader.style.padding = '10px 15px';
        expiredHeader.style.backgroundColor = 'var(--ux-home-danger-soft)';
        expiredHeader.style.cursor = 'pointer';
        expiredHeader.style.display = 'flex';
        expiredHeader.style.justifyContent = 'space-between';
        expiredHeader.style.alignItems = 'center';
        expiredHeader.style.userSelect = 'none';
        expiredHeader.style.position = 'sticky';
        expiredHeader.style.top = '0';
        expiredHeader.style.zIndex = '10';
        expiredHeader.style.borderBottom = '1px solid rgba(255, 69, 58, 0.18)';
        expiredHeader.style.borderTopLeftRadius = '4px';
        expiredHeader.style.borderTopRightRadius = '4px';

        const expiredTitleSpan = document.createElement('span');
        expiredTitleSpan.style.fontSize = '0.9em';
        expiredTitleSpan.style.fontWeight = 'bold';
        expiredTitleSpan.style.color = 'var(--ux-home-danger-foreground)';
        expiredTitleSpan.textContent = `期限切れの課題 (${sortedExpired.length})`;
        expiredHeader.appendChild(expiredTitleSpan);

        const expiredIcon = document.createElement('span');
        expiredIcon.textContent = isExpiredOpen ? '▼' : '▶';
        expiredIcon.style.fontSize = '0.8em';
        expiredIcon.style.color = 'var(--ux-home-danger-foreground)';
        expiredHeader.appendChild(expiredIcon);

        const expiredContent = document.createElement('div');
        expiredContent.style.display = isExpiredOpen ? 'block' : 'none';
        expiredContent.style.borderTop = '1px solid rgba(255, 69, 58, 0.18)';
        expiredContent.appendChild(createList(sortedExpired, { isExpired: true, showDeleteButton: true }));

        expiredHeader.onclick = () => {
            const currentlyOpen = expiredContent.style.display !== 'none';
            expiredContent.style.display = currentlyOpen ? 'none' : 'block';
            expiredIcon.textContent = currentlyOpen ? '▶' : '▼';
            uiState.expiredSectionOpen = !currentlyOpen;
        };

        expiredWrapper.appendChild(expiredHeader);
        expiredWrapper.appendChild(expiredContent);
        container.appendChild(expiredWrapper);
    }
}

/**
 * 授業名編集モーダルを開く
 * 時間割表からコース情報を取得し、ユーザーがカスタム名を編集できるようにする
 */
