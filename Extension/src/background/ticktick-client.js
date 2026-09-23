// background/ticktick-client.js
// TickTick OAuth and API client operations.

async function getTickTickAuthSettings() {
    const [localData, sessionData] = await Promise.all([
        loadSecureLocalStrings({
            [TODO_API_ENABLED_KEY]: false,
            [TICKTICK_TODO_CLIENT_ID_KEY]: '',
            [TICKTICK_TODO_CLIENT_SECRET_KEY]: '',
            [TICKTICK_TODO_PROJECT_NAME_KEY]: TICKTICK_DEFAULT_PROJECT_NAME,
            [TICKTICK_TODO_PROJECT_ID_KEY]: '',
            [TICKTICK_TODO_AUTH_LOCAL_KEY]: '',
            [TICKTICK_TODO_REFRESH_TOKEN_KEY]: '',
            [TICKTICK_TODO_AUTH_KEY]: null
        }, [TICKTICK_TODO_CLIENT_SECRET_KEY, TICKTICK_TODO_AUTH_LOCAL_KEY, TICKTICK_TODO_REFRESH_TOKEN_KEY]),
        storageSessionGet({
            [TICKTICK_TODO_AUTH_SESSION_KEY]: null
        })
    ]);

    const sessionAuth = normalizeSessionAuthState(sessionData[TICKTICK_TODO_AUTH_SESSION_KEY]);
    const persistedAuth = parsePersistedSessionAuth(localData[TICKTICK_TODO_AUTH_LOCAL_KEY]);
    const legacyAuth = normalizeSessionAuthState(localData[TICKTICK_TODO_AUTH_KEY]);
    if (localData[TICKTICK_TODO_PROJECT_NAME_KEY] !== TICKTICK_DEFAULT_PROJECT_NAME) {
        await storageSet({ [TICKTICK_TODO_PROJECT_NAME_KEY]: TICKTICK_DEFAULT_PROJECT_NAME });
    }
    if (!persistedAuth && (sessionAuth || legacyAuth)) {
        const encodedAuth = await encodePersistedSessionAuth(sessionAuth || legacyAuth);
        if (encodedAuth) {
            await storageSet({
                [TICKTICK_TODO_AUTH_LOCAL_KEY]: encodedAuth,
                [TICKTICK_TODO_AUTH_KEY]: null
            });
            localData[TICKTICK_TODO_AUTH_LOCAL_KEY] = JSON.stringify(sessionAuth || legacyAuth);
        }
    }

    return {
        ...localData,
        ...sessionData,
        [TICKTICK_TODO_PROJECT_NAME_KEY]: TICKTICK_DEFAULT_PROJECT_NAME
    };
}

function getTickTickOauthCredentials(settings) {
    const clientId = typeof settings?.[TICKTICK_TODO_CLIENT_ID_KEY] === 'string'
        ? settings[TICKTICK_TODO_CLIENT_ID_KEY].trim()
        : '';
    const clientSecret = typeof settings?.[TICKTICK_TODO_CLIENT_SECRET_KEY] === 'string'
        ? settings[TICKTICK_TODO_CLIENT_SECRET_KEY].trim()
        : '';
    if (!clientId) {
        throw new Error('TickTick Client ID is not configured.');
    }
    if (!clientSecret) {
        throw new Error('TickTick Client Secret is not configured.');
    }
    return { clientId, clientSecret };
}

function buildTickTickAuthorizeUrl({ clientId, redirectUri, state, scope = TICKTICK_OAUTH_SCOPE }) {
    const authorizeUrl = new URL(`${TICKTICK_AUTH_BASE_URL}/oauth/authorize`);
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('scope', scope);
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('response_type', 'code');
    return authorizeUrl.toString();
}

async function requestTickTickToken({ clientId, clientSecret, payload }) {
    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    const response = await fetch(`${TICKTICK_AUTH_BASE_URL}/oauth/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: payload.toString()
    });
    const rawText = await response.text();
    let parsed = {};
    try {
        parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
        parsed = {};
    }
    if (!response.ok) {
        const description = parsed?.error_description || parsed?.error || rawText || 'TickTick token request failed.';
        throw new Error(`TickTick OAuth error: ${description}`);
    }
    return parsed;
}

async function exchangeTickTickAuthCode({ clientId, clientSecret, code, redirectUri }) {
    const payload = new URLSearchParams();
    payload.set('code', code);
    payload.set('grant_type', 'authorization_code');
    payload.set('scope', TICKTICK_OAUTH_SCOPE);
    payload.set('redirect_uri', redirectUri);
    return requestTickTickToken({ clientId, clientSecret, payload });
}

async function refreshTickTickAccessToken({
    clientId,
    clientSecret,
    refreshToken,
    scope = TICKTICK_OAUTH_SCOPE
}) {
    const payload = new URLSearchParams();
    payload.set('refresh_token', refreshToken);
    payload.set('grant_type', 'refresh_token');
    payload.set('scope', scope);
    return requestTickTickToken({ clientId, clientSecret, payload });
}

async function getValidTickTickAccessToken({ forceRefresh = false } = {}) {
    const settings = await getTickTickAuthSettings();
    if (settings[TODO_API_ENABLED_KEY] !== true) {
        throw new Error('TickTick integration is not enabled.');
    }
    const { clientId, clientSecret } = getTickTickOauthCredentials(settings);

    const sessionAuth = normalizeSessionAuthState(settings[TICKTICK_TODO_AUTH_SESSION_KEY]);
    const persistedAuth = parsePersistedSessionAuth(settings[TICKTICK_TODO_AUTH_LOCAL_KEY]);
    if (!forceRefresh && isAuthTokenUsable(sessionAuth)) {
        return sessionAuth.accessToken;
    }
    if (!forceRefresh && isAuthTokenUsable(persistedAuth)) {
        await storageSessionSet({ [TICKTICK_TODO_AUTH_SESSION_KEY]: persistedAuth });
        return persistedAuth.accessToken;
    }

    let refreshToken = typeof settings[TICKTICK_TODO_REFRESH_TOKEN_KEY] === 'string'
        ? settings[TICKTICK_TODO_REFRESH_TOKEN_KEY].trim()
        : '';
    const legacyAuth = settings[TICKTICK_TODO_AUTH_KEY];
    const legacyRefreshToken = typeof legacyAuth?.refreshToken === 'string' ? legacyAuth.refreshToken.trim() : '';
    if (!refreshToken && legacyRefreshToken) {
        refreshToken = legacyRefreshToken;
        const encryptedRefreshToken = await encryptSecureLocalString(refreshToken);
        await storageSet({
            [TICKTICK_TODO_REFRESH_TOKEN_KEY]: encryptedRefreshToken,
            [TICKTICK_TODO_AUTH_KEY]: null
        });
    }

    if (!refreshToken) {
        if (sessionAuth?.accessToken) {
            throw new Error('TickTick access token can no longer be refreshed. Reconnect TickTick.');
        }
        throw new Error('TickTick authentication is not configured. Reconnect TickTick.');
    }

    const refreshed = await refreshTickTickAccessToken({
        clientId,
        clientSecret,
        refreshToken,
        scope: TICKTICK_OAUTH_SCOPE
    });
    const nextAuth = buildSessionAuthStateFromToken(
        refreshed,
        TICKTICK_OAUTH_SCOPE,
        { allowMissingExpiry: true }
    );
    if (!nextAuth) {
        throw new Error('TickTick token refresh did not return a usable access token.');
    }
    const rotatedRefreshToken = typeof refreshed?.refresh_token === 'string'
        ? refreshed.refresh_token.trim()
        : '';
    if (rotatedRefreshToken) {
        refreshToken = rotatedRefreshToken;
    }
    const encryptedRefreshToken = await encryptSecureLocalString(refreshToken);
    const encodedAuth = await encodePersistedSessionAuth(nextAuth);
    await Promise.all([
        storageSessionSet({ [TICKTICK_TODO_AUTH_SESSION_KEY]: nextAuth }),
        storageSet({
            [TICKTICK_TODO_AUTH_KEY]: null,
            [TICKTICK_TODO_AUTH_LOCAL_KEY]: encodedAuth,
            [TICKTICK_TODO_REFRESH_TOKEN_KEY]: encryptedRefreshToken
        })
    ]);
    return nextAuth.accessToken;
}

async function tickTickApiRequest(pathOrUrl, options = {}) {
    const {
        method = 'GET',
        body = undefined,
        headers = {},
        retryOnUnauthorized = true
    } = options;
    const url = /^https?:\/\//.test(pathOrUrl)
        ? pathOrUrl
        : `${TICKTICK_API_BASE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;

    const execute = async (forceRefreshToken) => {
        const accessToken = await getValidTickTickAccessToken({ forceRefresh: forceRefreshToken });
        return fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...headers
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    };

    let response = await execute(false);
    if (response.status === 401 && retryOnUnauthorized) {
        response = await execute(true);
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TickTick API error (${response.status}): ${errorText}`);
    }

    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function fetchAllTickTickProjects() {
    const data = await tickTickApiRequest('/project');
    return Array.isArray(data) ? data : [];
}

async function ensureTickTickDedicatedProject() {
    const settings = await storageGet({
        [TICKTICK_TODO_PROJECT_NAME_KEY]: TICKTICK_DEFAULT_PROJECT_NAME,
        [TICKTICK_TODO_PROJECT_ID_KEY]: ''
    });
    const desiredProjectName = TICKTICK_DEFAULT_PROJECT_NAME;

    const projects = await fetchAllTickTickProjects();
    let matched = projects.find((item) => {
        const name = (item?.name || '').trim();
        const kind = (item?.kind || 'TASK').toUpperCase();
        return name === desiredProjectName && kind !== 'NOTE';
    });

    if (!matched) {
        matched = await tickTickApiRequest('/project', {
            method: 'POST',
            body: {
                name: desiredProjectName,
                kind: 'TASK',
                viewMode: 'list'
            }
        });
    }

    const projectId = typeof matched?.id === 'string' ? matched.id : String(matched?.id || '');
    if (!projectId) {
        throw new Error('Failed to resolve TickTick sync project.');
    }

    await storageSet({
        [TICKTICK_TODO_PROJECT_ID_KEY]: projectId
    });

    return {
        id: projectId,
        name: matched?.name || desiredProjectName
    };
}

async function fetchAllTickTickTasks(projectId) {
    const data = await tickTickApiRequest(`/project/${encodeURIComponent(projectId)}/data`);
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    return tasks.map((task) => {
        const taskId = normalizeTickTickTaskId(task?.id);
        return taskId ? { ...task, id: taskId } : task;
    });
}

async function fetchTickTickCompletedTasks(projectId) {
    const normalizedProjectId = normalizeTickTickTaskId(projectId);
    if (!normalizedProjectId) return [];

    const data = await tickTickApiRequest('/task/completed', {
        method: 'POST',
        body: {
            projectIds: [normalizedProjectId]
        }
    });
    const tasks = Array.isArray(data) ? data : [];
    return tasks.map((task) => {
        const taskId = normalizeTickTickTaskId(task?.id);
        const completedTask = { ...task, status: 2 };
        return taskId ? { ...completedTask, id: taskId } : completedTask;
    });
}

async function fetchTickTickTaskById(projectId, taskId) {
    const normalizedProjectId = normalizeTickTickTaskId(projectId);
    const normalizedTaskId = normalizeTickTickTaskId(taskId);
    if (!normalizedProjectId || !normalizedTaskId) return null;

    try {
        const task = await tickTickApiRequest(
            `/project/${encodeURIComponent(normalizedProjectId)}/task/${encodeURIComponent(normalizedTaskId)}`
        );
        if (!task || typeof task !== 'object') return null;
        return { ...task, id: normalizedTaskId };
    } catch (error) {
        if (isTickTickApiStatusError(error, 404)) {
            return null;
        }
        throw error;
    }
}

async function createTickTickTask(projectId, assignment, syncSettings, forceCompleted = false, syncIdentity = null) {
    const desired = buildDesiredTickTickTaskState(projectId, assignment, syncSettings, forceCompleted, syncIdentity);
    const payload = {
        projectId,
        title: desired.title,
        content: desired.content
    };
    if (desired.hasDue) {
        payload.dueDate = desired.dueDate;
        payload.timeZone = TODO_SYNC_TIME_ZONE;
        payload.isAllDay = false;
    }
    const created = await tickTickApiRequest('/task', {
        method: 'POST',
        body: payload
    });
    const createdTaskId = typeof created?.id === 'string' ? created.id : String(created?.id || '');
    if (desired.status === 2 && createdTaskId) {
        await completeTickTickTask(projectId, createdTaskId);
        return {
            ...(created || {}),
            id: createdTaskId,
            status: 2,
            completedTime: new Date().toISOString()
        };
    }
    return created;
}

async function patchTickTickTask(taskId, patch) {
    return tickTickApiRequest(`/task/${encodeURIComponent(taskId)}`, {
        method: 'POST',
        body: patch
    });
}

async function completeTickTickTask(projectId, taskId) {
    return tickTickApiRequest(`/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}/complete`, {
        method: 'POST'
    });
}

async function deleteTickTickTask(projectId, taskId) {
    return tickTickApiRequest(`/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}`, {
        method: 'DELETE'
    });
}
