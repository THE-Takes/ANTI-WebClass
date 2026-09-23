// Provider-specific settings stay separate from TickTick OAuth and common task formatting.
let appleRemindersSettingsBusy = false;

function selectedTodoProvider() {
    return document.getElementById('todoApiProvider').value;
}

function updateTodoProviderUI() {
    const apple = selectedTodoProvider() === 'apple_reminders';
    const mac = runtimePlatformOs === 'mac';
    const enabled = document.getElementById('todoApiEnabled').checked;
    document.querySelector('#todoApiProvider option[value="apple_reminders"]').disabled = !mac;
    document.getElementById('ticktickTodoFields').hidden = apple;
    document.getElementById('appleRemindersFields').hidden = !apple;
    for (const id of ['appleRemindersConnectBtn', 'appleRemindersDisconnectBtn', 'appleRemindersRefreshBtn']) {
        document.getElementById(id).disabled = !mac || !enabled || appleRemindersSettingsBusy;
    }
    document.getElementById('todoApiProvider').disabled = !enabled || appleRemindersSettingsBusy;
    if (apple && !mac) {
        document.getElementById('appleRemindersStatus').textContent = 'Appleリマインダー連携はmacOS限定です。この端末ではTickTickを選択してください。';
    }
}

async function refreshTodoProviderStatus() {
    if (selectedTodoProvider() !== 'apple_reminders') {
        refreshTickTickTodoAuthStatus();
        return;
    }
    if (runtimePlatformOs !== 'mac') return;
    const status = document.getElementById('appleRemindersStatus');
    try {
        const granted = await chrome.permissions.contains({ permissions: ['nativeMessaging'] });
        if (!granted) {
            status.textContent = '未接続。「接続」を押して補助アプリへのアクセスを許可してください。';
            return;
        }
        const result = await chrome.runtime.sendMessage({ type: 'APPLE_REMINDERS_GET_STATUS' });
        if (!result?.success) throw new Error(result?.error || '接続状態を確認できません。');
        const lastSync = result.lastSyncAt ? ` / 最終同期: ${new Date(result.lastSyncAt).toLocaleString()}` : '';
        status.textContent = (result.connected ? `接続済み / リスト: ${result.listName}${lastSync}` : '未接続。補助アプリを導入して接続してください。')
            + (result.lastError ? ` / 前回の同期エラー: ${result.lastError}` : '');
    } catch (error) {
        status.textContent = error.message;
    }
}

async function connectAppleReminders() {
    const status = document.getElementById('appleRemindersStatus');
    if (runtimePlatformOs !== 'mac' || appleRemindersSettingsBusy) return;
    appleRemindersSettingsBusy = true;
    updateTodoProviderUI();
    try {
        // Request inside the click gesture, before awaiting any other operation.
        const granted = await chrome.permissions.request({ permissions: ['nativeMessaging'] });
        if (!granted) throw new Error('補助アプリへの接続が許可されませんでした。');
        status.textContent = '接続中… macOSのリマインダーアクセスを許可してください。';
        if (!await saveOptions({ source: 'manual' })) throw new Error('設定を保存できませんでした。');
        const result = await chrome.runtime.sendMessage({ type: 'APPLE_REMINDERS_CONNECT' });
        if (!result?.success) throw new Error(result?.error || '接続に失敗しました。');
        status.textContent = `接続済み / リスト: ${result.listName || 'WebClass'}。ホーム画面の次回同期で課題を反映します。`;
    } catch (error) {
        status.textContent = error.message;
    } finally {
        appleRemindersSettingsBusy = false;
        updateTodoProviderUI();
    }
}

async function disconnectAppleReminders() {
    if (appleRemindersSettingsBusy) return;
    appleRemindersSettingsBusy = true;
    updateTodoProviderUI();
    const status = document.getElementById('appleRemindersStatus');
    try {
        const result = await chrome.runtime.sendMessage({ type: 'APPLE_REMINDERS_DISCONNECT' });
        if (!result?.success) throw new Error(result?.error || '接続解除に失敗しました。');
        status.textContent = '接続を解除しました。既存のリマインダーは残ります。';
    } catch (error) {
        status.textContent = error.message;
    } finally {
        appleRemindersSettingsBusy = false;
        updateTodoProviderUI();
    }
}

function initTodoProviderControls() {
    document.getElementById('todoApiProvider').addEventListener('change', () => {
        updateTodoProviderUI();
        refreshTodoProviderStatus();
    });
    document.getElementById('appleRemindersConnectBtn').addEventListener('click', connectAppleReminders);
    document.getElementById('appleRemindersDisconnectBtn').addEventListener('click', disconnectAppleReminders);
    document.getElementById('appleRemindersRefreshBtn').addEventListener('click', refreshTodoProviderStatus);
}
