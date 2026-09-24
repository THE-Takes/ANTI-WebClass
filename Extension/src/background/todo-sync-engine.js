// Shared synchronization rules. Providers normalize external tasks to the existing TickTick task shape.

function getTickTickAssignmentMergeKey(assignment, index) {
    const syncIdentity = getTickTickAssignmentSyncIdentity(assignment);
    return syncIdentity.stableId || `untracked:${index}`;
}

function haveTickTickAssignmentsChanged(before, after) {
    return JSON.stringify(before) !== JSON.stringify(after);
}

async function mergeTickTickSyncAssignmentsWithLatestLocalChanges(initialAssignments, syncedAssignments) {
    if (typeof storageGet !== 'function') {
        return syncedAssignments;
    }
    const latestStorage = await storageGet({ [ASSIGNMENTS_STORAGE_KEY]: [] });
    const latestAssignments = Array.isArray(latestStorage[ASSIGNMENTS_STORAGE_KEY])
        ? latestStorage[ASSIGNMENTS_STORAGE_KEY]
        : [];
    const initialByKey = new Map();
    const syncedByKey = new Map();

    initialAssignments.forEach((assignment, index) => {
        initialByKey.set(getTickTickAssignmentMergeKey(assignment, index), assignment);
    });
    syncedAssignments.forEach((assignment, index) => {
        syncedByKey.set(getTickTickAssignmentMergeKey(assignment, index), assignment);
    });

    return latestAssignments.map((latestAssignment, index) => {
        const key = getTickTickAssignmentMergeKey(latestAssignment, index);
        const initialAssignment = initialByKey.get(key);
        const syncedAssignment = syncedByKey.get(key);

        // A user edit may happen while the network sync is in progress. Prefer
        // the newer storage value so a stale sync snapshot cannot undo it.
        if (!initialAssignment || !syncedAssignment || haveTickTickAssignmentsChanged(initialAssignment, latestAssignment)) {
            return latestAssignment;
        }
        return syncedAssignment;
    });
}

async function runExternalTodoSync(provider, { mode = 'full', trigger = 'manual', localMutation = null } = {}) {
    if (todoSyncRuntimeState.running) {
        return { success: true, skipped: true, reason: 'sync_in_progress' };
    }

    todoSyncRuntimeState.running = true;
    todoSyncRuntimeState.lastRunAt = Date.now();

    try {
        const normalizedMode = mode === 'local_mutation' || mode === 'pull_only'
            ? mode
            : 'full';
        const syncSettings = await provider.loadSettings();
        if (syncSettings[TODO_API_ENABLED_KEY] !== true) {
            return { success: true, skipped: true, reason: 'integration_disabled' };
        }
        await provider.prepare(syncSettings);

        const taskNameSettings = {
            taskTitleFormat: syncSettings[TODO_API_TASK_TITLE_FORMAT_KEY],
            ultraShortCourseMap: syncSettings[TODO_API_ULTRA_SHORT_MAP_KEY],
        };
        const assignments = Array.isArray(syncSettings[ASSIGNMENTS_STORAGE_KEY])
            ? syncSettings[ASSIGNMENTS_STORAGE_KEY].map((assignment) => ({ ...assignment }))
            : [];
        const initialAssignments = assignments.map((assignment) => ({ ...assignment }));
        const trashSet = new Set(Array.isArray(syncSettings[TODO_TRASH_STORAGE_KEY]) ? syncSettings[TODO_TRASH_STORAGE_KEY] : []);
        const includeNotYetStarted = syncSettings[TODO_API_INCLUDE_NOT_YET_STARTED_KEY] === true;

        let assignmentsChanged = false;
        let trashChanged = false;
        const nowIso = new Date().toISOString();

        const markAssignmentDeleted = (assignment) => {
            if (!assignment || typeof assignment !== 'object') return;
            if (assignment.isDeleted !== true) {
                assignment.isDeleted = true;
                assignment.deletedAt = nowIso;
                assignmentsChanged = true;
            }
            if (addAssignmentIdentifiersToTrashSet(assignment, trashSet)) {
                trashChanged = true;
            }
        };

        const assignmentMap = new Map();
        assignments.forEach((assignment) => {
            const isRemoved = assignment?.isDeleted === true || isAssignmentInTrashSet(assignment, trashSet);
            if (!includeNotYetStarted && !isRemoved && isAssignmentNotYetStarted(assignment)) return;

            const syncIdentity = getTickTickAssignmentSyncIdentity(assignment);
            if (!syncIdentity.stableId) return;

            const existingEntry = assignmentMap.get(syncIdentity.stableId);
            if (!existingEntry) {
                assignmentMap.set(syncIdentity.stableId, { assignment, syncIdentity });
                return;
            }

            const existingAssignment = existingEntry.assignment;
            const preferExisting =
                (existingAssignment.isDeleted !== true && assignment.isDeleted === true)
                || (
                    existingAssignment.isDeleted === assignment.isDeleted
                    && (typeof existingAssignment.url === 'string' && existingAssignment.url)
                    && !(typeof assignment.url === 'string' && assignment.url)
                );

            if (preferExisting) {
                markAssignmentDeleted(assignment);
                return;
            }

            markAssignmentDeleted(existingAssignment);
            assignmentMap.set(syncIdentity.stableId, { assignment, syncIdentity });
        });

        const listInfo = await provider.ensureList();
        const remoteTasks = await provider.fetchActive(listInfo.id);
        const remoteCompletedTasks = await provider.fetchCompleted(listInfo.id).catch((error) => {
            if (provider.strictReads) throw error;
            uxDebugWarn('[WebClass UX] failed to fetch completed tasks', error);
            return [];
        });
        const remoteById = new Map();
        const remoteByStableId = new Map();
        const remoteByNormalizedUrl = new Map();
        const remoteBySemanticKey = new Map();
        const remoteLookupById = new Map();
        const remoteTaskDeleteReasons = new Map();
        const remoteTaskSources = [
            ...remoteTasks.map((task) => ({ task, allowLegacyDelete: provider.deleteLegacy === true, forceCompleted: false })),
            ...remoteCompletedTasks.map((task) => ({ task, allowLegacyDelete: false, forceCompleted: true }))
        ];

        const rememberTickTickRemoteTask = (task, fallbackSyncIdentity = null) => {
            const taskId = normalizeTickTickTaskId(task?.id);
            if (!taskId) return null;

            const normalizedTask = { ...task, id: taskId };
            const lookup = buildTickTickRemoteLookup(normalizedTask);
            const storedLookup = {
                stableId: lookup.stableId || fallbackSyncIdentity?.stableId || '',
                normalizedUrl: lookup.normalizedUrl || fallbackSyncIdentity?.normalizedUrl || '',
                semanticKey: lookup.semanticKey || ''
            };

            remoteLookupById.set(taskId, storedLookup);
            remoteById.set(taskId, normalizedTask);

            if (storedLookup.stableId) {
                remoteByStableId.set(storedLookup.stableId, normalizedTask);
            }
            if (fallbackSyncIdentity?.stableId) {
                remoteByStableId.set(fallbackSyncIdentity.stableId, normalizedTask);
            }
            if (storedLookup.normalizedUrl) {
                remoteByNormalizedUrl.set(storedLookup.normalizedUrl, normalizedTask);
            }
            if (fallbackSyncIdentity?.normalizedUrl) {
                remoteByNormalizedUrl.set(fallbackSyncIdentity.normalizedUrl, normalizedTask);
            }
            if (storedLookup.semanticKey) {
                remoteBySemanticKey.set(storedLookup.semanticKey, normalizedTask);
            }

            return normalizedTask;
        };

        remoteTaskSources.forEach(({ task, allowLegacyDelete, forceCompleted }) => {
            const taskId = normalizeTickTickTaskId(task?.id);
            if (!taskId) return;

            const normalizedTask = {
                ...task,
                id: taskId,
                ...(forceCompleted ? { status: 2 } : {})
            };
            const lookup = buildTickTickRemoteLookup(normalizedTask);
            if (!lookup.stableId) {
                if (allowLegacyDelete) {
                    remoteTaskDeleteReasons.set(taskId, 'legacy');
                } else {
                    // The completed-task endpoint can omit content metadata.
                    // Keep it addressable by the locally stored TickTick task ID.
                    remoteById.set(taskId, normalizedTask);
                }
                return;
            }

            const relatedTasksById = new Map();
            const rememberRelatedTask = (candidate) => {
                const candidateId = normalizeTickTickTaskId(candidate?.id);
                if (!candidateId) return;
                relatedTasksById.set(candidateId, candidate);
            };

            rememberRelatedTask(remoteByStableId.get(lookup.stableId));
            if (lookup.normalizedUrl) {
                rememberRelatedTask(remoteByNormalizedUrl.get(lookup.normalizedUrl));
            }
            if (lookup.semanticKey) {
                rememberRelatedTask(remoteBySemanticKey.get(lookup.semanticKey));
            }

            let keepTask = normalizedTask;
            for (const relatedTask of relatedTasksById.values()) {
                keepTask = pickPreferredTickTickTask(keepTask, relatedTask);
            }

            const keepTaskId = normalizeTickTickTaskId(keepTask?.id);
            const tasksToReindex = new Map();
            tasksToReindex.set(taskId, { task: normalizedTask, lookup });
            for (const relatedTask of relatedTasksById.values()) {
                const relatedTaskId = normalizeTickTickTaskId(relatedTask?.id);
                if (!relatedTaskId) continue;
                const relatedLookup = remoteLookupById.get(relatedTaskId) || buildTickTickRemoteLookup(relatedTask);
                remoteLookupById.set(relatedTaskId, relatedLookup);
                tasksToReindex.set(relatedTaskId, { task: relatedTask, lookup: relatedLookup });
            }

            for (const [candidateTaskId, descriptor] of tasksToReindex.entries()) {
                const candidateLookup = descriptor.lookup || {};
                if (candidateLookup.stableId) {
                    remoteByStableId.set(candidateLookup.stableId, keepTask);
                }
                if (candidateLookup.normalizedUrl) {
                    remoteByNormalizedUrl.set(candidateLookup.normalizedUrl, keepTask);
                }
                if (candidateLookup.semanticKey) {
                    remoteBySemanticKey.set(candidateLookup.semanticKey, keepTask);
                }
                if (candidateTaskId !== keepTaskId) {
                    remoteById.delete(candidateTaskId);
                    if (
                        !remoteTaskDeleteReasons.has(candidateTaskId)
                        && !isTickTickTaskCompleted(descriptor.task)
                    ) {
                        remoteTaskDeleteReasons.set(candidateTaskId, 'duplicate');
                    }
                }
            }

            if (keepTaskId) {
                remoteById.set(keepTaskId, keepTask);
            }
        });

        let remoteLegacyDeleted = 0;
        let remoteDuplicateDeleted = 0;
        for (const [taskId, reason] of remoteTaskDeleteReasons.entries()) {
            try {
                await provider.deleteTask(listInfo.id, taskId);
                if (reason === 'legacy') remoteLegacyDeleted += 1;
                if (reason === 'duplicate') remoteDuplicateDeleted += 1;
            } catch (error) {
                uxDebugWarn('[WebClass UX] failed to delete legacy/duplicate TickTick task', { taskId, error });
            }
        }

        const findMatchingTickTickRemoteTask = (entry) => {
            const assignmentLookup = provider.buildLookup(entry);

            for (const stableId of assignmentLookup.stableIds) {
                const remoteTask = remoteByStableId.get(stableId);
                if (remoteTask) return remoteTask;
            }

            for (const normalizedUrl of assignmentLookup.normalizedUrls) {
                const remoteTask = remoteByNormalizedUrl.get(normalizedUrl);
                if (remoteTask) return remoteTask;
            }

            if (assignmentLookup.semanticKey) {
                const remoteTask = remoteBySemanticKey.get(assignmentLookup.semanticKey);
                if (remoteTask) return remoteTask;
            }

            if (assignmentLookup.storedTaskId) {
                return remoteById.get(assignmentLookup.storedTaskId) || null;
            }

            return null;
        };

        let mutationStableId = '';
        if (normalizedMode === 'local_mutation' && typeof localMutation?.localKey === 'string' && localMutation.localKey) {
            const mutationKey = localMutation.localKey;
            if (assignmentMap.has(mutationKey)) {
                mutationStableId = mutationKey;
            } else {
                for (const assignment of assignments) {
                    if (assignment?.url === mutationKey || assignment?.fallbackUrl === mutationKey) {
                        mutationStableId = getTickTickAssignmentSyncIdentity(assignment).stableId;
                        if (mutationStableId) break;
                    }
                }
            }
        }

        const hydrateTickTickRemoteTaskFromStoredId = async (entry) => {
            const assignment = entry?.assignment;
            const syncIdentity = entry?.syncIdentity;
            if (!assignment || !syncIdentity?.stableId) return null;

            const matchedRemoteTask = findMatchingTickTickRemoteTask(entry);
            if (matchedRemoteTask) {
                return matchedRemoteTask;
            }

            const storedTaskId = provider.getTaskId(assignment);
            if (!storedTaskId) return null;

            const cachedById = remoteById.get(storedTaskId);
            if (cachedById) {
                return rememberTickTickRemoteTask(cachedById, syncIdentity);
            }

            let fetchedTask = null;
            try {
                fetchedTask = await provider.fetchById(listInfo.id, storedTaskId);
            } catch (error) {
                if (provider.strictReads) throw error;
                uxDebugWarn('[WebClass UX] failed to fetch task by stored id', {
                    taskId: storedTaskId,
                    error
                });
                return null;
            }
            if (!fetchedTask) return null;

            return rememberTickTickRemoteTask(fetchedTask, syncIdentity);
        };

        for (const [stableId, entry] of assignmentMap.entries()) {
            if (provider.skipPull?.(entry.assignment) || (normalizedMode === 'local_mutation' && mutationStableId && stableId === mutationStableId)) {
                continue;
            }
            let remoteTask = findMatchingTickTickRemoteTask(entry);
            if (!remoteTask) {
                remoteTask = await hydrateTickTickRemoteTaskFromStoredId(entry);
            }
            if (!remoteTask) continue;

            if (provider.setTaskId(entry.assignment, remoteTask.id)) {
                assignmentsChanged = true;
            }
            if (applyTickTickRemoteTaskToAssignment(entry.assignment, remoteTask)) {
                assignmentsChanged = true;
            }
        }

        const syncSingleAssignment = async (entry, modeForceCompleted = false) => {
            const assignment = entry?.assignment;
            const syncIdentity = entry?.syncIdentity;
            if (!assignment || !syncIdentity?.stableId) return;
            if (isLocalOnlyAssignment(assignment)) return;

            let remoteTask = findMatchingTickTickRemoteTask(entry);
            if (!remoteTask) {
                remoteTask = await hydrateTickTickRemoteTaskFromStoredId(entry);
                if (remoteTask && normalizedMode !== 'local_mutation' && !provider.skipPull?.(assignment)) {
                    if (applyTickTickRemoteTaskToAssignment(assignment, remoteTask)) {
                        assignmentsChanged = true;
                    }
                }
            }

            if (remoteTask) {
                const taskId = normalizeTickTickTaskId(remoteTask?.id);
                if (!taskId) return;

                if (provider.setTaskId(assignment, taskId)) {
                    assignmentsChanged = true;
                }

                const patch = buildTickTickTaskPatchFromAssignment(
                    listInfo.id,
                    provider.exportAssignment ? provider.exportAssignment(assignment) : assignment,
                    taskNameSettings,
                    remoteTask,
                    modeForceCompleted,
                    syncIdentity
                );
                let latest = remoteTask;

                if (patch.payload) {
                    const patched = await provider.patchTask(taskId, patch.payload);
                    if (patched && typeof patched === 'object') {
                        latest = { ...latest, ...patched, id: taskId };
                    }
                }

                if (patch.shouldComplete) {
                    await provider.completeTask(listInfo.id, taskId);
                    latest = { ...latest, status: 2, completedTime: new Date().toISOString() };
                }

                const latestTask = rememberTickTickRemoteTask(latest, syncIdentity);
                const latestTaskId = normalizeTickTickTaskId(latestTask?.id) || taskId;
                if (provider.setTaskId(assignment, latestTaskId)) {
                    assignmentsChanged = true;
                }
                return;
            }

            if (modeForceCompleted) return;

            const created = await provider.createTask(listInfo.id, assignment, taskNameSettings, false, syncIdentity);
            const createdTaskId = normalizeTickTickTaskId(created?.id);
            if (createdTaskId) {
                const createdTask = rememberTickTickRemoteTask(
                    { ...(created || {}), id: createdTaskId },
                    syncIdentity
                );
                if (provider.setTaskId(assignment, createdTask?.id || createdTaskId)) {
                    assignmentsChanged = true;
                }
            }
        };

        if (normalizedMode === 'local_mutation' && mutationStableId) {
            const mutationEntry = assignmentMap.get(mutationStableId);
            if (mutationEntry) {
                const forceCompleted = mutationEntry.assignment.isDeleted === true
                    || isAssignmentInTrashSet(mutationEntry.assignment, trashSet);
                await syncSingleAssignment(mutationEntry, forceCompleted);
            }
        }

        if (normalizedMode === 'full') {
            for (const entry of assignmentMap.values()) {
                const forceCompleted = entry.assignment.isDeleted === true
                    || isAssignmentInTrashSet(entry.assignment, trashSet);
                await syncSingleAssignment(entry, forceCompleted);
            }
        }

        const writePayload = {};
        if (assignmentsChanged) {
            writePayload[ASSIGNMENTS_STORAGE_KEY] = await mergeTickTickSyncAssignmentsWithLatestLocalChanges(
                initialAssignments,
                assignments
            );
        }
        if (trashChanged) {
            writePayload[TODO_TRASH_STORAGE_KEY] = Array.from(trashSet);
        }
        if (Object.keys(writePayload).length > 0) {
            await storageSet(writePayload);
        }

        return {
            success: true,
            listId: listInfo.id,
            listName: listInfo.name,
            assignmentsChanged,
            trashChanged,
            remoteLegacyDeleted,
            remoteDuplicateDeleted,
            mode: normalizedMode,
            trigger,
            localTaskCount: assignmentMap.size,
            remoteTaskCount: remoteById.size
        };
    } finally {
        todoSyncRuntimeState.running = false;
    }
}
