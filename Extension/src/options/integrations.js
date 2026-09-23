// options/integrations.js
// Settings availability, TickTick connection, and update status.

const toggleCredentialsArea = (enabled) => {
    const area = document.getElementById('credentialsArea');
    area.style.display = enabled ? 'block' : 'none';
};

const updateDebugOnlySettingsVisibility = (enabled) => {
    const showDebugOnly = !!enabled;
    document.querySelectorAll('.debug-only-setting').forEach((group) => {
        group.hidden = !showDebugOnly;
        group.querySelectorAll('input, select, button, textarea').forEach((control) => {
            control.disabled = !showDebugOnly;
        });
    });
};

const updateTodoApiSettingsAvailability = (enabled) => {
    const settingsBody = document.getElementById('todoApiSettingsBody');
    if (!settingsBody) return;
    settingsBody.hidden = !enabled;
    settingsBody.querySelectorAll('input, select, button, textarea').forEach((control) => {
        control.disabled = !enabled;
    });
    updateTodoProviderUI();
};

const updateTodoApiTaskTitleFormatUI = (format) => {
    const ultraShortConfig = document.getElementById('todoApiUltraShortConfig');
    if (!ultraShortConfig) return;
    ultraShortConfig.style.display = format === 'ultra_short_plus_task' ? 'block' : 'none';
};

const renderTodoApiUltraShortCourseMap = (savedMap = {}) => {
    const container = document.getElementById('todoApiUltraShortCourseMap');
    if (!container) return;
    const safeMap = savedMap && typeof savedMap === 'object' ? savedMap : {};

    chrome.storage.local.get({ assignments: [] }, (items) => {
        container.innerHTML = '';

        const assignments = Array.isArray(items.assignments) ? items.assignments : [];
        const courseMap = new Map();

        assignments.forEach((assignment) => {
            const key = normalizeCourseMapKey(assignment);
            if (!key || courseMap.has(key)) return;
            const fullName = (assignment.courseFullName || assignment.course || '').trim();
            const shortName = (assignment.course || '').trim();
            courseMap.set(key, {
                key,
                fullName: fullName || '(コース名なし)',
                shortName: shortName || '',
                inferred: false
            });
        });

        Object.keys(safeMap).forEach((key) => {
            if (!key || courseMap.has(key)) return;
            const fallbackFullName = key.startsWith('full:') ? key.slice(5) : `(未分類コース: ${key})`;
            courseMap.set(key, {
                key,
                fullName: fallbackFullName || `(未分類コース: ${key})`,
                shortName: '',
                inferred: true
            });
        });

        const rows = Array.from(courseMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName, 'ja'));
        if (rows.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'ultra-short-empty';
            empty.textContent = 'コース情報がありません。Smart ToDo を一度同期すると候補が表示されます。';
            container.appendChild(empty);
            return;
        }

        rows.forEach((row) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'ultra-short-row';

            const label = document.createElement('label');
            label.className = 'ultra-short-label';

            const title = document.createElement('div');
            title.className = 'ultra-short-title';
            title.textContent = row.fullName;
            label.appendChild(title);

            const sub = document.createElement('div');
            sub.className = 'ultra-short-sub';
            const noteParts = [];
            if (row.shortName) noteParts.push(`短縮名: ${row.shortName}`);
            if (row.inferred) noteParts.push('自動推定したコース名');
            if (noteParts.length === 0) noteParts.push(`コースキー: ${row.key}`);
            sub.textContent = noteParts.join(' / ');
            label.appendChild(sub);

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'API連携用の短縮名';
            input.value = typeof safeMap[row.key] === 'string' ? safeMap[row.key] : '';
            input.dataset.courseKey = row.key;
            input.className = 'ultra-short-input';

            wrapper.appendChild(label);
            wrapper.appendChild(input);
            container.appendChild(wrapper);
        });
    });
};

const refreshTickTickTodoAuthStatus = () => {
    const statusEl = document.getElementById('ticktickTodoAuthStatus');
    if (!statusEl) return;
    statusEl.style.color = '#666';
    statusEl.textContent = '接続状態を確認中...';

    chrome.runtime.sendMessage({ type: 'TICKTICK_TODO_GET_STATUS' }, (response) => {
        if (chrome.runtime.lastError) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = `接続状態の取得エラー: ${chrome.runtime.lastError.message}`;
            return;
        }
        if (!response?.success) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = response?.error || '接続状態の取得に失敗しました。';
            return;
        }
        if (response.connected !== true) {
            statusEl.style.color = '#666';
            statusEl.textContent = '未接続';
            return;
        }
        const projectName = sanitizeTodoName(response.listName, TODO_DEFAULT_LIST_NAME);
        const listPart = projectName ? ` / プロジェクト: ${projectName}` : '';
        statusEl.style.color = '#2e7d32';
        statusEl.textContent = `接続済み${listPart}`;
    });
};

const connectTickTickTodo = async () => {
    const statusEl = document.getElementById('ticktickTodoAuthStatus');
    const connectBtn = document.getElementById('ticktickTodoConnectBtn');
    const disconnectBtn = document.getElementById('ticktickTodoDisconnectBtn');
    const clientIdEl = document.getElementById('ticktickTodoClientId');
    const clientSecretEl = document.getElementById('ticktickTodoClientSecret');
    if (!statusEl || !clientIdEl || !clientSecretEl) return;

    try {
        const clientId = (clientIdEl.value || '').trim();
        const clientSecret = (clientSecretEl.value || '').trim();
        const projectName = TODO_DEFAULT_PROJECT_NAME;

        if (!clientId) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = 'TickTick Client ID を入力してください。';
            return;
        }
        if (!clientSecret) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = 'TickTick Client Secret を入力してください。';
            return;
        }
        const encryptedClientSecret = await encryptSecureLocalString(clientSecret);

        if (connectBtn) connectBtn.disabled = true;
        if (disconnectBtn) disconnectBtn.disabled = true;
        statusEl.style.color = '#666';
        statusEl.textContent = 'TickTick に接続中...';

        await storageLocalSetAsync({
            [TODO_API_ENABLED_KEY]: true,
            [TICKTICK_TODO_PROJECT_NAME_KEY]: projectName,
            [TICKTICK_TODO_CLIENT_ID_KEY]: clientId,
            [TICKTICK_TODO_CLIENT_SECRET_KEY]: encryptedClientSecret,
        });

        chrome.runtime.sendMessage({ type: 'TICKTICK_TODO_CONNECT' }, (response) => {
            if (connectBtn) connectBtn.disabled = false;
            if (disconnectBtn) disconnectBtn.disabled = false;

            if (chrome.runtime.lastError) {
                statusEl.style.color = '#c62828';
                statusEl.textContent = `接続エラー: ${chrome.runtime.lastError.message}`;
                return;
            }
            if (!response?.success) {
                statusEl.style.color = '#c62828';
                statusEl.textContent = response?.error || '接続に失敗しました。';
                return;
            }
            const projectName = sanitizeTodoName(response.listName, TODO_DEFAULT_LIST_NAME);
            const listPart = projectName ? ` / プロジェクト: ${projectName}` : '';
            statusEl.style.color = '#2e7d32';
            statusEl.textContent = `接続完了${listPart}`;
        });
    } catch (error) {
        if (connectBtn) connectBtn.disabled = false;
        if (disconnectBtn) disconnectBtn.disabled = false;
        statusEl.style.color = '#c62828';
        statusEl.textContent = `接続エラー: ${error instanceof Error ? error.message : String(error)}`;
    }
};

const disconnectTickTickTodo = () => {
    const statusEl = document.getElementById('ticktickTodoAuthStatus');
    const connectBtn = document.getElementById('ticktickTodoConnectBtn');
    const disconnectBtn = document.getElementById('ticktickTodoDisconnectBtn');
    if (!statusEl) return;

    if (connectBtn) connectBtn.disabled = true;
    if (disconnectBtn) disconnectBtn.disabled = true;
    statusEl.style.color = '#666';
    statusEl.textContent = '接続解除中...';

    chrome.runtime.sendMessage({ type: 'TICKTICK_TODO_DISCONNECT' }, (response) => {
        if (connectBtn) connectBtn.disabled = false;
        if (disconnectBtn) disconnectBtn.disabled = false;

        if (chrome.runtime.lastError) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = `接続解除エラー: ${chrome.runtime.lastError.message}`;
            return;
        }
        if (!response?.success) {
            statusEl.style.color = '#c62828';
            statusEl.textContent = response?.error || '接続解除に失敗しました。';
            return;
        }
        const enabledEl = document.getElementById('todoApiEnabled');
        if (enabledEl) enabledEl.checked = false;
        updateTodoApiSettingsAvailability(false);
        statusEl.style.color = '#2e7d32';
        statusEl.textContent = '接続を解除しました。';
    });
};
