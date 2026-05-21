// options.js

// Saves options to chrome.storage
const saveOptions = () => {
    const autoLoginEnabled = document.getElementById('autoLoginEnabled').checked;
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const reminderDays = document.getElementById('reminderDays').value;
    const reminderTime = document.getElementById('reminderTime').value;

    chrome.storage.local.set(
        { autoLoginEnabled, username, password, msReminderDays: reminderDays, msReminderTime: reminderTime },
        () => {
            const status = document.getElementById('status');
            status.textContent = '設定を保存しました。';
            setTimeout(() => {
                status.textContent = '';
            }, 2000);
        }
    );
};

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
const restoreOptions = () => {
    chrome.storage.local.get(
        { autoLoginEnabled: false, username: '', password: '', msReminderDays: '1', msReminderTime: '9am' },
        (items) => {
            document.getElementById('autoLoginEnabled').checked = items.autoLoginEnabled;
            document.getElementById('username').value = items.username;
            document.getElementById('password').value = items.password;
            document.getElementById('reminderDays').value = items.msReminderDays;
            document.getElementById('reminderTime').value = items.msReminderTime;
            toggleCredentialsArea(items.autoLoginEnabled);
        }
    );
    
    // MS To Do の同期状態を確認
    updateMsSyncStatus();
};

const toggleCredentialsArea = (enabled) => {
    const area = document.getElementById('credentialsArea');
    area.style.display = enabled ? 'block' : 'none';
};

// MS To Doの同期状態を更新
const updateMsSyncStatus = () => {
    chrome.storage.local.get({
        msTodoEnabled: false,
        msAccessToken: null,
        msSelectedListName: '',
        msLastSync: null,
    }, (items) => {
        const statusEl = document.getElementById('msSyncStatus');
        
        if (items.msTodoEnabled && items.msAccessToken && items.msSelectedListName) {
            statusEl.className = 'sync-status connected';
            let statusText = `✅ 接続中: ${items.msSelectedListName}`;
            if (items.msLastSync) {
                const lastSync = new Date(items.msLastSync);
                statusText += ` (最終同期: ${lastSync.toLocaleString('ja-JP')})`;
            }
            statusEl.textContent = statusText;
        } else if (items.msTodoEnabled && items.msAccessToken) {
            statusEl.className = 'sync-status disconnected';
            statusEl.textContent = '⚠️ リストが未選択です';
        } else if (items.msTodoEnabled) {
            statusEl.className = 'sync-status disconnected';
            statusEl.textContent = '⚠️ サインインが必要です';
        } else {
            statusEl.className = 'sync-status disconnected';
            statusEl.textContent = '⚪ 未設定';
        }
    });
};

// MS To Do 設定ページを開く
const openMsSettings = () => {
    chrome.tabs.create({
        url: chrome.runtime.getURL('experimental/microsoft-todo/ms-todo-ui.html')
    });
};

// 同期データをリセット
const resetSyncData = () => {
    const confirmMsg = '同期データをリセットしますか？\n\n' +
        '• スマートToDoの完了状態がリセットされます\n' +
        '• Microsoft To Doのタスクは削除されません\n' +
        '• 次回同期時に全ての課題が再同期されます';
    
    if (!confirm(confirmMsg)) {
        return;
    }
    
    // 課題の完了状態をリセット
    chrome.storage.local.get({ assignments: [] }, (result) => {
        const assignments = result.assignments.map(a => ({
            ...a,
            isCompleted: false
        }));
        
        chrome.storage.local.set({
            assignments: assignments,
            msSyncedItems: {},
            msLastSync: null,
        }, () => {
            const statusEl = document.getElementById('resetStatus');
            statusEl.textContent = '✅ 同期データをリセットしました';
            statusEl.style.color = '#2e7d32';
            
            // 同期状態を更新
            updateMsSyncStatus();
            
            setTimeout(() => {
                statusEl.textContent = '';
            }, 3000);
        });
    });
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);
document.getElementById('autoLoginEnabled').addEventListener('change', (e) => {
    toggleCredentialsArea(e.target.checked);
});
document.getElementById('openMsSettings').addEventListener('click', openMsSettings);
document.getElementById('resetSyncData').addEventListener('click', resetSyncData);
