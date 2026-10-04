// Local task reset controls are independent of provider connection settings.
function initTodoDataControls() {
    const button = document.getElementById('deleteAllTodoData');
    const status = document.getElementById('todoDataDeletionStatus');
    if (!button || !status) return;

    button.addEventListener('click', async () => {
        if (button.disabled) return;
        const confirmed = window.confirm('この拡張機能に保存されたすべてのToDoタスクデータを削除しますか？\n完了済み・ゴミ箱・デバッグ用のタスクも削除され、元に戻せません。\n設定と外部サービス上のタスクは残ります。WebClassの課題は次回の取得で再登録されます。');
        if (!confirmed) return;

        button.disabled = true;
        status.textContent = 'ToDoタスクデータを削除中...';
        try {
            const result = await chrome.runtime.sendMessage({ type: 'TODO_DELETE_ALL_LOCAL_DATA' });
            if (!result?.success) throw new Error(result?.error || 'ToDoタスクデータを削除できませんでした。');
            status.textContent = 'すべてのToDoタスクデータを削除しました。';
        } catch (error) {
            status.textContent = error?.message || 'ToDoタスクデータを削除できませんでした。';
        } finally {
            button.disabled = false;
        }
    });
}
