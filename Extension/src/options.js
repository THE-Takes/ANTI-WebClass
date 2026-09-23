// options.js
// Options-page entry point and event bindings.

document.addEventListener('DOMContentLoaded', async () => {
    await initRuntimePlatform();
    initSettingsNavigation();
    initDashboardVisibleRangeControls();
    initCustomUserIconControls();
    initSettingsBackupControls();
    initTodoProviderControls();
    restoreOptions();
    initAutoSave();

    const ticktickCopyBtn = document.getElementById('ticktickTodoCopyRedirectUriBtn');
    if (ticktickCopyBtn) {
        ticktickCopyBtn.addEventListener('click', () => {
            const uriInput = document.getElementById('ticktickTodoRedirectUri');
            if (!uriInput?.value) return;
            navigator.clipboard.writeText(uriInput.value).then(() => {
                const originalHTML = ticktickCopyBtn.innerHTML;
                ticktickCopyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                ticktickCopyBtn.classList.add('copied');
                ticktickCopyBtn.disabled = true;
                setTimeout(() => {
                    ticktickCopyBtn.innerHTML = originalHTML;
                    ticktickCopyBtn.classList.remove('copied');
                    ticktickCopyBtn.disabled = false;
                }, 2000);
            }).catch(() => {
                ticktickCopyBtn.classList.remove('copied');
                ticktickCopyBtn.disabled = false;
                const originalTitle = ticktickCopyBtn.title;
                ticktickCopyBtn.title = 'コピーに失敗しました';
                setTimeout(() => {
                    ticktickCopyBtn.title = originalTitle;
                }, 2000);
            });
        });
    }
});
document.getElementById('autoLoginEnabled').addEventListener('change', (e) => {
    toggleCredentialsArea(e.target.checked);
});
document.getElementById('password').addEventListener('input', () => {
    autoLoginPasswordInputDirty = true;
    autoLoginPasswordPendingDeletion = false;
    updateAutoLoginPasswordUi();
});
document.getElementById('clearStoredPasswordButton').addEventListener('click', async () => {
    if (!autoLoginPasswordStored) return;
    const passwordInput = document.getElementById('password');
    autoLoginPasswordPendingDeletion = true;
    autoLoginPasswordInputDirty = false;
    if (passwordInput) {
        passwordInput.value = '';
    }
    updateAutoLoginPasswordUi();
    const saved = await saveOptions({ source: 'manual' });
    if (!saved) {
        autoLoginPasswordPendingDeletion = false;
        updateAutoLoginPasswordUi();
    }
});
document.getElementById('debugModeEnabled').addEventListener('change', async (e) => {
    await saveDebugModeSetting(e.target.checked);
});
document.getElementById('extensionUpdateCheckEnabled').addEventListener('change', (e) => {
    if (!e.target.checked) {
        renderExtensionUpdateStatus({ enabled: false });
        return;
    }
    refreshExtensionUpdateStatus();
});
document.getElementById('checkExtensionUpdateNow').addEventListener('click', runExtensionUpdateCheck);
document.getElementById('showExtensionUpdateNotificationPreview').addEventListener('click', showExtensionUpdateNotificationPreview);
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (Object.prototype.hasOwnProperty.call(changes, 'debugModeEnabled')) {
        markDebugModeSettingChanged();
        syncDebugModeSettingUi(changes.debugModeEnabled.newValue === true);
    }
    if (Object.keys(changes).some((key) => EXTENSION_UPDATE_STATUS_KEYS.has(key))) {
        refreshExtensionUpdateStatus();
    }
});
document.getElementById('todoApiEnabled').addEventListener('change', (e) => {
    updateTodoApiSettingsAvailability(!!e.target.checked);
});
document.getElementById('todoApiTaskTitleFormat').addEventListener('change', (e) => {
    updateTodoApiTaskTitleFormatUI(e.target.value);
});
document.getElementById('ticktickTodoConnectBtn').addEventListener('click', connectTickTickTodo);
document.getElementById('ticktickTodoDisconnectBtn').addEventListener('click', disconnectTickTickTodo);
