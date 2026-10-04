// Reset only local task data; never issue deletion requests to external providers.
async function deleteAllLocalTodoData() {
    if (todoSyncRuntimeState.running || todoSyncRuntimeState.activeRequests > 0 || todoSyncRuntimeState.clearing) {
        throw new Error('ToDoの同期中です。同期が完了してから、もう一度削除してください。');
    }

    todoSyncRuntimeState.clearing = true;
    try {
        // A reset token stops retrieval in every open home page, including an
        // empty reset where Chrome would not emit an assignments change.
        await storageSet({
            assignments: [],
            webclass_todo_trash: [],
            todoDataResetToken: crypto.randomUUID()
        });
        await chrome.storage.local.remove([
            'webclass_todo_list',
            'lastUpdated',
            'todoApiLastManualReloadAt',
            'todoApiLastMorningSyncDate',
            'todoApiLastAutoSyncAt',
            'appleRemindersItemIds',
            'appleRemindersPendingMutations',
            'appleRemindersLastSyncAt',
            'appleRemindersLastError'
        ]);
    } finally {
        todoSyncRuntimeState.clearing = false;
    }
}

async function handleDeleteAllLocalTodoData(sender, sendResponse) {
    if (!isTrustedExtensionPageUrl(sender?.url)) {
        sendResponse({ success: false, error: 'ToDoデータの削除は設定画面から実行してください。' });
        return;
    }
    try {
        await deleteAllLocalTodoData();
        sendResponse({ success: true });
    } catch (error) {
        sendResponse({ success: false, error: error?.message || 'ToDoタスクデータを削除できませんでした。' });
    }
}
