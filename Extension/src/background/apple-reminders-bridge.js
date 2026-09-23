// Native Messaging is only available to the extension, never to a WebClass page.
const APPLE_REMINDERS_HOST = 'jp.anti_webclass.reminders';
const APPLE_REMINDERS_PROTOCOL = 1;

async function assertAppleRemindersAvailable() {
    const platform = await chrome.runtime.getPlatformInfo();
    if (platform.os !== 'mac') throw new Error('Appleリマインダー連携はmacOS限定です。');
    const granted = await chrome.permissions.contains({ permissions: ['nativeMessaging'] });
    if (!granted) throw new Error('設定画面でAppleリマインダーへの接続を許可してください。');
}

async function openAppleRemindersBridge() {
    await assertAppleRemindersAvailable();
    const port = chrome.runtime.connectNative(APPLE_REMINDERS_HOST);
    const pending = new Map();
    let closed = false;
    const failAll = (error) => {
        closed = true;
        for (const entry of pending.values()) {
            clearTimeout(entry.timer);
            entry.reject(error);
        }
        pending.clear();
    };
    port.onDisconnect.addListener(() => {
        const detail = chrome.runtime.lastError?.message || 'Native host disconnected';
        failAll(new Error(`補助アプリとの接続が切れました。導入状態を確認してください。 (${detail})`));
    });
    port.onMessage.addListener((message) => {
        const entry = pending.get(message?.requestId);
        if (!entry) return;
        clearTimeout(entry.timer);
        pending.delete(message.requestId);
        if (message.version !== APPLE_REMINDERS_PROTOCOL) {
            entry.reject(new Error('補助アプリの更新が必要です。'));
        } else if (message.success !== true) {
            entry.reject(new Error(message.error || 'Appleリマインダー操作に失敗しました。'));
        } else {
            entry.resolve(message.result);
        }
    });
    return {
        request(command, fields = {}) {
            if (closed) return Promise.reject(new Error('Native connection is closed.'));
            return new Promise((resolve, reject) => {
                const requestId = crypto.randomUUID();
                const timer = setTimeout(() => {
                    failAll(new Error('補助アプリの応答がタイムアウトしました。権限と接続を確認してください。'));
                    port.disconnect();
                }, command === 'connect' ? 120000 : 30000);
                pending.set(requestId, { resolve, reject, timer });
                try {
                    port.postMessage({ ...fields, version: APPLE_REMINDERS_PROTOCOL, requestId, command });
                } catch (error) {
                    clearTimeout(timer);
                    pending.delete(requestId);
                    reject(error);
                }
            });
        },
        close() {
            failAll(new Error('Native connection closed.'));
            port.disconnect();
        }
    };
}

async function handleAppleRemindersMessage(message, sender, sendResponse) {
    // Permission prompts and connection settings may only originate in our options page.
    if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('src/options.html')) {
        sendResponse({ success: false, error: 'Only the extension settings page can manage this connection.' });
        return;
    }
    let bridge;
    try {
        if (message.type === 'APPLE_REMINDERS_DISCONNECT') {
            await storageSet({ appleRemindersConnected: false });
            sendResponse({ success: true, connected: false });
            return;
        }
        bridge = await openAppleRemindersBridge();
        const result = await bridge.request(message.type === 'APPLE_REMINDERS_CONNECT' ? 'connect' : 'status');
        if (message.type === 'APPLE_REMINDERS_CONNECT') {
            if (result?.authorized !== true || !result.listId) throw new Error('リマインダーへのアクセスが許可されていません。');
            await storageSet({ appleRemindersConnected: true, appleRemindersListId: result.listId });
        }
        const saved = await storageGet({ appleRemindersConnected: false, appleRemindersLastSyncAt: '', appleRemindersLastError: '' });
        sendResponse({ success: true, ...result, connected: saved.appleRemindersConnected && result?.authorized === true && !!result.listId,
            lastSyncAt: saved.appleRemindersLastSyncAt, lastError: saved.appleRemindersLastError });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    } finally {
        bridge?.close();
    }
}
