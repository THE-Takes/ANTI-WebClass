// Apple uses the shared TickTick rules, with native I/O and independent item identifiers.
let appleRemindersQueue = Promise.resolve();

function sanitizedAppleAssignment(assignment) {
    const candidates = getTickTickAssignmentSyncCandidates(assignment);
    const url = candidates[0]?.normalizedUrl || '';
    const sanitized = { ...assignment, url, fallbackUrl: url };
    for (const key of ['title', 'course', 'courseFullName', 'sourceTitle', 'originalDeadline']) {
        if (typeof sanitized[key] === 'string') sanitized[key] = sanitized[key].replace(/[\r\n]+/g, ' ');
    }
    return sanitized;
}

function createAppleRemindersProvider(bridge, pendingMutations) {
    let itemIds = {};
    let list;
    let snapshot;
    let compactNotes = false;
    const displayCourses = new Map();
    const identityKey = (assignment) => getTickTickAssignmentSyncIdentity(assignment).stableId;
    const provider = {
        strictReads: true,
        deleteLegacy: false,
        async loadSettings() {
            const settings = await storageGet({
                todoApiEnabled: false, todoApiProvider: 'ticktick', appleRemindersConnected: false,
                [TODO_API_INCLUDE_NOT_YET_STARTED_KEY]: false,
                appleRemindersItemIds: {}, todoApiTaskTitleFormat: 'task_only', todoApiUltraShortCourseMap: {},
                assignments: [], webclass_todo_trash: []
            });
            if (settings.todoApiProvider !== 'apple_reminders') settings.todoApiEnabled = false;
            itemIds = settings.appleRemindersItemIds || {};
            for (const assignment of settings.assignments || []) {
                const identity = getTickTickAssignmentSyncIdentity(assignment).stableId;
                displayCourses.set(identity, String(assignment.course || assignment.courseFullName || 'WebClass').replace(/[\r\n]+/g, ' '));
            }
            return settings;
        },
        async prepare(settings) {
            if (!settings.appleRemindersConnected) throw new Error('設定画面でAppleリマインダーに接続してください。');
            const status = await bridge.request('status');
            if (!status?.authorized || !status.listId) throw new Error('リマインダーの権限または同期先リストを確認してください。');
            compactNotes = status.compactNotes === true;
            list = { id: status.listId, name: 'WebClass' };
            snapshot = [];
            let offset = 0;
            do {
                const page = await bridge.request('snapshot', { listId: list.id, offset });
                if (!Array.isArray(page?.tasks) || !Number.isInteger(page.total) || page.total < offset + page.tasks.length) {
                    throw new Error('補助アプリからの同期データが不正です。');
                }
                snapshot.push(...page.tasks);
                offset += page.tasks.length;
                if (offset >= page.total) break;
                if (page.tasks.length === 0) throw new Error('Incomplete reminder snapshot.');
            } while (true);
        },
        ensureList: async () => list,
        fetchActive: async () => snapshot.filter((task) => task.status !== 2),
        fetchCompleted: async () => snapshot.filter((task) => task.status === 2),
        fetchById: async (_listId, id) => snapshot.find((task) => task.id === id) || null,
        getTaskId: (assignment) => itemIds[identityKey(assignment)] || '',
        setTaskId(assignment, id) {
            itemIds[identityKey(assignment)] = id;
            return false;
        },
        buildLookup(entry) {
            return { ...buildTickTickAssignmentLookup(entry), storedTaskId: provider.getTaskId(entry.assignment) };
        },
        skipPull(assignment) {
            return pendingMutations.some((key) => key === assignment.url || key === assignment.fallbackUrl || key === identityKey(assignment));
        },
        exportAssignment: sanitizedAppleAssignment,
        deleteTask: (listId, id) => bridge.request('delete', { listId, id }),
        patchTask(id, task) {
            const identity = parseSyncMetadataFromTask(task).stableId;
            const displayCourse = displayCourses.get(identity);
            const payload = compactNotes && displayCourse && task.content
                ? { ...task, displayCourse } : task;
            return bridge.request('patch', { listId: list.id, id, task: payload });
        },
        completeTask: (listId, id) => bridge.request('complete', { listId, id }),
        createTask(listId, assignment, settings, forceCompleted, identity) {
            const task = buildDesiredTickTickTaskState(listId, sanitizedAppleAssignment(assignment), settings, forceCompleted, identity);
            if (compactNotes) task.displayCourse = displayCourses.get(identity.stableId) || 'WebClass';
            return bridge.request('create', { listId, task });
        },
        async persistIds() {
            await storageSet({ appleRemindersItemIds: itemIds });
        }
    };
    return provider;
}

function runAppleRemindersSync(options = {}) {
    // Serialize requests; only external synchronization is queued, never WebClass page retrieval.
    const execute = async () => {
        const settings = await storageGet({
            todoApiEnabled: false, todoApiProvider: 'ticktick',
            appleRemindersConnected: false, appleRemindersPendingMutations: []
        });
        if (!settings.todoApiEnabled || settings.todoApiProvider !== 'apple_reminders') {
            return { success: true, skipped: true, reason: 'integration_disabled' };
        }
        const pending = new Set(settings.appleRemindersPendingMutations);
        const localKey = options.mode === 'local_mutation' ? options.localMutation?.localKey : '';
        if (localKey) {
            pending.add(localKey);
            await storageSet({ appleRemindersPendingMutations: [...pending] });
        }
        // Selecting a provider does not establish a connection. Keep local edits for the next connected sync.
        if (!settings.appleRemindersConnected) {
            return { success: true, skipped: true, reason: 'provider_not_connected' };
        }
        let bridge;
        let provider;
        try {
            await assertAppleRemindersAvailable();
            bridge = await openAppleRemindersBridge();
            provider = createAppleRemindersProvider(bridge, [...pending]);
            const result = await runExternalTodoSync(provider, options);
            if (!result.skipped) {
                if (options.mode !== 'pull_only') {
                    if (options.mode === 'local_mutation') pending.delete(localKey);
                    else pending.clear();
                }
                await storageSet({ appleRemindersPendingMutations: [...pending], appleRemindersLastSyncAt: new Date().toISOString(), appleRemindersLastError: '' });
            }
            return result;
        } catch (error) {
            await storageSet({ appleRemindersLastError: error.message });
            throw error;
        } finally {
            try { await provider?.persistIds(); } finally { bridge?.close(); }
        }
    };
    const result = appleRemindersQueue.then(execute, execute);
    appleRemindersQueue = result.catch(() => {});
    return result;
}
