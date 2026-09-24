// TickTick provider adapter, connection handlers, and existing scheduling decisions.
function createTickTickTodoProvider() {
    return {
        deleteLegacy: true,
        async loadSettings() {
            return loadSecureLocalStrings({
                [TODO_API_ENABLED_KEY]: false,
                [TODO_API_INCLUDE_NOT_YET_STARTED_KEY]: false,
                [TODO_API_TASK_TITLE_FORMAT_KEY]: TODO_TITLE_FORMAT_TASK_ONLY,
                [TODO_API_ULTRA_SHORT_MAP_KEY]: {},
                [TICKTICK_TODO_PROJECT_NAME_KEY]: TICKTICK_DEFAULT_PROJECT_NAME,
                [TICKTICK_TODO_PROJECT_ID_KEY]: '',
                [TICKTICK_TODO_CLIENT_ID_KEY]: '',
                [TICKTICK_TODO_CLIENT_SECRET_KEY]: '',
                [ASSIGNMENTS_STORAGE_KEY]: [],
                [TODO_TRASH_STORAGE_KEY]: []
            }, [TICKTICK_TODO_CLIENT_SECRET_KEY]);
        },
        prepare: getTickTickOauthCredentials,
        ensureList: ensureTickTickDedicatedProject,
        fetchActive: fetchAllTickTickTasks,
        fetchCompleted: fetchTickTickCompletedTasks,
        deleteTask: deleteTickTickTask,
        fetchById: fetchTickTickTaskById,
        getTaskId: getAssignmentTickTickTaskId,
        setTaskId: setAssignmentTickTickTaskId,
        buildLookup: buildTickTickAssignmentLookup,
        patchTask: patchTickTickTask,
        completeTask: completeTickTickTask,
        createTask: createTickTickTask
    };
}

async function runTickTickTodoSync(options = {}) {
    return runExternalTodoSync(createTickTickTodoProvider(), options);
}

async function runTodoApiSync({ mode = 'full', trigger = 'manual', localMutation = null } = {}) {
    const settings = await storageGet({ todoApiProvider: 'ticktick' });
    if (settings.todoApiProvider === 'apple_reminders') {
        return runAppleRemindersSync({ mode, trigger, localMutation });
    }
    if (settings.todoApiProvider !== 'ticktick') throw new Error('Unknown ToDo provider.');
    return runTickTickTodoSync({ mode, trigger, localMutation });
}

function extractErrorMessage(error, fallback) {
    if (error?.message) return error.message;
    return fallback;
}

async function handleTickTickTodoConnect(sendResponse) {
    try {
        const settings = await getTickTickAuthSettings();

        const { clientId, clientSecret } = getTickTickOauthCredentials(settings);
        const projectName = (settings[TICKTICK_TODO_PROJECT_NAME_KEY] || TICKTICK_DEFAULT_PROJECT_NAME).trim()
            || TICKTICK_DEFAULT_PROJECT_NAME;

        const identityApi = chrome?.identity;
        const redirectUri = identityApi?.getRedirectURL
            ? identityApi.getRedirectURL('ticktick')
            : `https://${chrome.runtime.id}.chromiumapp.org/ticktick`;
        if (!identityApi?.launchWebAuthFlow) {
            throw new Error('chrome.identity.launchWebAuthFlow is unavailable.');
        }

        const state = randomString(24);
        const authorizeUrl = buildTickTickAuthorizeUrl({
            clientId,
            redirectUri,
            state
        });
        const expectedState = state;

        const callbackUrl = await new Promise((resolve, reject) => {
            identityApi.launchWebAuthFlow(
                {
                    url: authorizeUrl,
                    interactive: true
                },
                (redirectedTo) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    if (!redirectedTo) {
                        reject(new Error('Authorization was cancelled.'));
                        return;
                    }
                    resolve(redirectedTo);
                }
            );
        });

        const callback = new URL(callbackUrl);
        const callbackState = callback.searchParams.get('state') || '';
        if (!callbackState || callbackState !== expectedState) {
            throw new Error('OAuth state mismatch.');
        }

        const code = callback.searchParams.get('code');
        if (!code) {
            const oauthError = callback.searchParams.get('error_description')
                || callback.searchParams.get('error')
                || 'Failed to obtain authorization code.';
            throw new Error(oauthError);
        }

        const token = await exchangeTickTickAuthCode({
            clientId,
            clientSecret,
            code,
            redirectUri
        });
        const refreshToken = typeof token?.refresh_token === 'string' ? token.refresh_token.trim() : '';
        const sessionAuth = buildSessionAuthStateFromToken(
            token,
            TICKTICK_OAUTH_SCOPE,
            { allowMissingExpiry: true }
        );
        if (!sessionAuth) {
            throw new Error('TickTick access token was not returned.');
        }
        const encryptedClientSecret = await encryptSecureLocalString(clientSecret);
        const encryptedRefreshToken = await encryptSecureLocalString(refreshToken);

        await Promise.all([
            storageSet({
                [TODO_API_ENABLED_KEY]: true,
                [TICKTICK_TODO_AUTH_KEY]: null,
                [TICKTICK_TODO_AUTH_LOCAL_KEY]: await encodePersistedSessionAuth(sessionAuth),
                [TICKTICK_TODO_REFRESH_TOKEN_KEY]: encryptedRefreshToken,
                [TICKTICK_TODO_PROJECT_NAME_KEY]: projectName,
                [TICKTICK_TODO_CLIENT_ID_KEY]: clientId,
                [TICKTICK_TODO_CLIENT_SECRET_KEY]: encryptedClientSecret
            }),
            storageSessionSet({
                [TICKTICK_TODO_AUTH_SESSION_KEY]: sessionAuth
            })
        ]);

        const projectInfo = await ensureTickTickDedicatedProject();
        sendResponse({
            success: true,
            connected: true,
            listId: projectInfo.id,
            listName: projectInfo.name
        });
    } catch (error) {
        await Promise.all([
            storageSet({
                [TODO_API_ENABLED_KEY]: false,
                [TICKTICK_TODO_AUTH_KEY]: null,
                [TICKTICK_TODO_AUTH_LOCAL_KEY]: '',
                [TICKTICK_TODO_REFRESH_TOKEN_KEY]: '',
                [TICKTICK_TODO_PROJECT_ID_KEY]: '',
            }),
            storageSessionRemove([TICKTICK_TODO_AUTH_SESSION_KEY])
        ]);
        uxDebugWarn('[WebClass UX] TickTick connect failed', error);
        sendResponse({ success: false, error: extractErrorMessage(error, 'TickTick connection failed.') });
    }
}

async function handleTickTickTodoDisconnect(sendResponse) {
    try {
        await Promise.all([
            storageSet({
                [TODO_API_ENABLED_KEY]: false,
                [TICKTICK_TODO_AUTH_KEY]: null,
                [TICKTICK_TODO_AUTH_LOCAL_KEY]: '',
                [TICKTICK_TODO_REFRESH_TOKEN_KEY]: '',
                [TICKTICK_TODO_PROJECT_ID_KEY]: '',
            }),
            storageSessionRemove([TICKTICK_TODO_AUTH_SESSION_KEY])
        ]);
        sendResponse({ success: true });
    } catch (error) {
        sendResponse({ success: false, error: extractErrorMessage(error, 'Failed to disconnect TickTick.') });
    }
}

async function handleTickTickTodoGetStatus(sendResponse) {
    try {
        const localData = await getTickTickAuthSettings();

        const enabled = localData[TODO_API_ENABLED_KEY] === true;
        const hasCredentials =
            typeof localData[TICKTICK_TODO_CLIENT_ID_KEY] === 'string'
            && localData[TICKTICK_TODO_CLIENT_ID_KEY].trim().length > 0
            && typeof localData[TICKTICK_TODO_CLIENT_SECRET_KEY] === 'string'
            && localData[TICKTICK_TODO_CLIENT_SECRET_KEY].trim().length > 0;
        const hasRefreshToken = typeof localData[TICKTICK_TODO_REFRESH_TOKEN_KEY] === 'string'
            && localData[TICKTICK_TODO_REFRESH_TOKEN_KEY].trim().length > 0;

        const sessionAuth = normalizeSessionAuthState(localData[TICKTICK_TODO_AUTH_SESSION_KEY]);
        const persistedAuth = parsePersistedSessionAuth(localData[TICKTICK_TODO_AUTH_LOCAL_KEY]);
        const connected = enabled
            && hasCredentials
            && (isAuthTokenUsable(sessionAuth) || isAuthTokenUsable(persistedAuth) || hasRefreshToken);

        sendResponse({
            success: true,
            connected,
            listId: localData[TICKTICK_TODO_PROJECT_ID_KEY] || '',
            listName: localData[TICKTICK_TODO_PROJECT_NAME_KEY] || TICKTICK_DEFAULT_PROJECT_NAME
        });
    } catch (error) {
        sendResponse({ success: false, error: extractErrorMessage(error, 'Failed to fetch TickTick status.') });
    }
}

async function handleTodoApiRunSync(message, sendResponse) {
    try {
        const mode = typeof message?.mode === 'string' ? message.mode : 'full';
        const trigger = typeof message?.trigger === 'string' ? message.trigger : 'manual';
        const localMutation = message?.localMutation && typeof message.localMutation === 'object'
            ? {
                localKey: typeof message.localMutation.localKey === 'string' ? message.localMutation.localKey : '',
            }
            : null;
        const result = await runTodoApiSync({ mode, trigger, localMutation });
        sendResponse(result);
    } catch (error) {
        uxDebugWarn('[WebClass UX] ToDo sync failed', error);
        sendResponse({ success: false, error: extractErrorMessage(error, 'ToDo API sync failed.') });
    }
}

function getTokyoDateParts(baseDate = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: TODO_SYNC_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
        hour12: false
    });
    const parts = Object.fromEntries(
        formatter.formatToParts(baseDate)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value])
    );
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        second: Number(parts.second),
        weekday: parts.weekday || '',
        key: `${parts.year}-${parts.month}-${parts.day}`
    };
}

function buildTokyoDateUtc(year, month, day, hour, minute = 0, second = 0) {
    return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second));
}

async function requestTodoSyncOnOpenHomeTab(payload) {
    const tabs = await chrome.tabs.query({
        url: [
            'https://kulms.kanagawa-u.ac.jp/webclass/*',
            'http://127.0.0.1/webclass/*',
            'http://localhost/webclass/*'
        ]
    });
    const homeTabs = tabs
        .filter((tab) => isWebClassHomeUrl(tab.url) && typeof tab.id === 'number')
        .sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)));
    if (homeTabs.length === 0) {
        return { success: false, error: 'WebClass home tab was not found.' };
    }

    let lastError = 'Todo sync target tab was not found.';
    for (const tab of homeTabs) {
        const response = await sendMessageToTab(tab.id, {
            type: 'RUN_TODO_API_SYNC_FROM_BACKGROUND',
            ...payload
        });
        if (response?.success) {
            return { success: true, tabId: tab.id };
        }
        if (response?.error) {
            lastError = response.error;
        }
    }
    return { success: false, error: lastError };
}

async function handleTodoSyncAlarmTick() {
    const settings = await storageGet({
        [TODO_API_ENABLED_KEY]: false,
        todoApiProvider: 'ticktick',
        appleRemindersConnected: false,
        [TODO_API_LAST_MANUAL_RELOAD_KEY]: '',
        [TODO_API_LAST_MORNING_SYNC_DATE_KEY]: '',
        [TODO_API_LAST_AUTO_SYNC_AT_KEY]: ''
    });
    if (settings[TODO_API_ENABLED_KEY] !== true) return;
    if (settings.todoApiProvider === 'apple_reminders') {
        if (!settings.appleRemindersConnected) return;
        const platform = await chrome.runtime.getPlatformInfo();
        if (platform.os !== 'mac') return;
    }

    const now = new Date();
    const tokyo = getTokyoDateParts(now);

    const sevenAmTokyoUtc = buildTokyoDateUtc(tokyo.year, tokyo.month, tokyo.day, 7, 0, 0);
    const lastManualReloadRaw = settings[TODO_API_LAST_MANUAL_RELOAD_KEY];
    const lastManualReload = lastManualReloadRaw ? new Date(lastManualReloadRaw) : null;
    const hasManualReloadSinceSeven = lastManualReload instanceof Date
        && !Number.isNaN(lastManualReload.getTime())
        && lastManualReload.getTime() >= sevenAmTokyoUtc.getTime();
    const morningSyncDoneToday = settings[TODO_API_LAST_MORNING_SYNC_DATE_KEY] === tokyo.key;
    const shouldMorningSync = now.getTime() >= sevenAmTokyoUtc.getTime()
        && !hasManualReloadSinceSeven
        && !morningSyncDoneToday;

    // 定期同期は「分のジャスト一致」ではなく前回同期からの経過時間で判定する。
    // alarm発火がMV3のSW休止などで遅延しても、次のtickで必ず同期できる。
    // 手動リロードも前回同期として扱い、直後の二重同期を避ける。
    const lastSyncCandidates = [settings[TODO_API_LAST_AUTO_SYNC_AT_KEY], lastManualReloadRaw]
        .map((raw) => (raw ? new Date(raw).getTime() : NaN))
        .filter((time) => Number.isFinite(time));
    const lastSyncTime = lastSyncCandidates.length > 0 ? Math.max(...lastSyncCandidates) : 0;
    const autoSyncDue = now.getTime() - lastSyncTime >= TODO_AUTO_SYNC_INTERVAL_MINUTES * 60 * 1000;
    const inAutoSyncWindow = tokyo.hour >= TODO_AUTO_SYNC_START_HOUR && tokyo.hour < TODO_AUTO_SYNC_END_HOUR;
    const shouldPeriodicSync = inAutoSyncWindow && autoSyncDue;

    if (!shouldMorningSync && !shouldPeriodicSync) return;

    const trigger = shouldMorningSync ? 'morning_7am' : `periodic_${TODO_AUTO_SYNC_INTERVAL_MINUTES}min`;
    const response = await requestTodoSyncOnOpenHomeTab({
        trigger,
        mode: 'full',
        forceRemoteReload: true
    });
    if (response.success) {
        const updates = { [TODO_API_LAST_AUTO_SYNC_AT_KEY]: new Date().toISOString() };
        if (shouldMorningSync) {
            updates[TODO_API_LAST_MORNING_SYNC_DATE_KEY] = tokyo.key;
        }
        await storageSet(updates);
    }
}

function ensureTodoSyncAlarmRegistered() {
    if (!chrome?.alarms?.create) {
        uxDebugWarn('[WebClass UX] chrome.alarms API is unavailable; periodic ToDo sync is disabled.');
        return;
    }
    chrome.alarms.create(TODO_SYNC_ALARM_NAME, {
        periodInMinutes: TODO_SYNC_ALARM_PERIOD_MINUTES
    });
}
