// Provider-specific settings stay separate from TickTick OAuth and common task formatting.
let appleRemindersSettingsBusy = false;
let appleRemindersStatusCheckBusy = false;
let appleRemindersStatusCheckAnimationToken = 0;
let appleRemindersStatusCheckTimeout = null;
const APPLE_REMINDERS_SUPPORTED_BROWSER_MESSAGE = 'Appleリマインダー連携はGoogle ChromeまたはDiaに対応しています。ブラウザーごとに補助アプリを登録してください。';
const APPLE_REMINDERS_STATUS_CHECK_ICON = WebClassUxComponents.checkIconMarkup();

function supportsAppleRemindersInCurrentBrowser() {
    const brands = new Set(navigator.userAgentData?.brands?.map(({ brand }) => brand) || []);
    const isGoogleChrome = brands.has('Google Chrome');
    const otherChromiumBrand = ['Microsoft Edge', 'Brave', 'Opera', 'Vivaldi', 'Yandex', 'Arc']
        .some((brand) => brands.has(brand));
    const isDiaChromium = brands.has('Chromium') && !otherChromiumBrand;
    // The optional nativeMessaging permission can hide connectNative until the user grants it.
    return (isGoogleChrome || isDiaChromium)
        && typeof chrome.permissions?.contains === 'function'
        && typeof chrome.permissions?.request === 'function';
}

function selectedTodoProvider() {
    return document.getElementById('todoApiProvider').value;
}

function updateTodoProviderUI() {
    const apple = selectedTodoProvider() === 'apple_reminders';
    const mac = runtimePlatformOs === 'mac';
    const browserSupported = supportsAppleRemindersInCurrentBrowser();
    const enabled = document.getElementById('todoApiEnabled').checked;
    const controlsBusy = appleRemindersSettingsBusy || appleRemindersStatusCheckBusy;
    document.querySelector('#todoApiProvider option[value="apple_reminders"]').disabled = !mac || !browserSupported;
    document.getElementById('ticktickTodoFields').hidden = apple;
    document.getElementById('appleRemindersFields').hidden = !apple;
    document.getElementById('appleRemindersConnectBtn').disabled = !mac || !enabled || !browserSupported || controlsBusy;
    document.getElementById('appleRemindersDisconnectBtn').disabled = !mac || !enabled || controlsBusy;
    document.getElementById('appleRemindersRefreshBtn').disabled = !mac || !enabled || !browserSupported || controlsBusy;
    document.getElementById('todoApiProvider').disabled = !enabled || controlsBusy;
    if (apple && !browserSupported) {
        document.getElementById('appleRemindersStatus').textContent = APPLE_REMINDERS_SUPPORTED_BROWSER_MESSAGE;
    } else if (apple && !mac) {
        document.getElementById('appleRemindersStatus').textContent = 'Appleリマインダー連携はmacOS限定です。この端末ではTickTickを選択してください。';
    }
}

function resetAppleRemindersStatusCheckButton() {
    const button = document.getElementById('appleRemindersRefreshBtn');
    appleRemindersStatusCheckAnimationToken += 1;
    if (appleRemindersStatusCheckTimeout !== null) {
        window.clearTimeout(appleRemindersStatusCheckTimeout);
        appleRemindersStatusCheckTimeout = null;
    }
    button.textContent = '状態を確認';
    button.classList.remove('ux-check-btn', 'ux-drawing', 'apple-reminders-status-check--success');
    button.removeAttribute('aria-label');
}

function showAppleRemindersStatusCheckButtonSuccess() {
    const button = document.getElementById('appleRemindersRefreshBtn');
    const animationToken = ++appleRemindersStatusCheckAnimationToken;
    button.innerHTML = APPLE_REMINDERS_STATUS_CHECK_ICON;
    button.classList.remove('ux-drawing');
    button.classList.add('ux-check-btn', 'apple-reminders-status-check--success');
    button.setAttribute('aria-label', '状態の確認が完了しました');

    requestAnimationFrame(() => {
        if (animationToken === appleRemindersStatusCheckAnimationToken) {
            button.classList.add('ux-drawing');
        }
    });

    appleRemindersStatusCheckTimeout = window.setTimeout(() => {
        if (animationToken === appleRemindersStatusCheckAnimationToken) {
            resetAppleRemindersStatusCheckButton();
        }
    }, 1500);
}

async function refreshTodoProviderStatus({ animateButton = false } = {}) {
    if (selectedTodoProvider() !== 'apple_reminders') {
        refreshTickTickTodoAuthStatus();
        return;
    }
    if (runtimePlatformOs !== 'mac') return;
    const status = document.getElementById('appleRemindersStatus');
    if (!supportsAppleRemindersInCurrentBrowser()) {
        status.textContent = APPLE_REMINDERS_SUPPORTED_BROWSER_MESSAGE;
        return;
    }
    if (animateButton) {
        if (appleRemindersSettingsBusy || appleRemindersStatusCheckBusy) return;
        appleRemindersStatusCheckBusy = true;
        resetAppleRemindersStatusCheckButton();
        updateTodoProviderUI();
    }
    let checkCompleted = false;
    try {
        const granted = await chrome.permissions.contains({ permissions: ['nativeMessaging'] });
        if (!granted) {
            status.textContent = '未接続。「Appleリマインダーに接続」を押して補助アプリへのアクセスを許可してください。';
            checkCompleted = true;
            return;
        }
        const result = await chrome.runtime.sendMessage({ type: 'APPLE_REMINDERS_GET_STATUS' });
        if (!result?.success) throw new Error(result?.error || '接続状態を確認できません。');
        const lastSync = result.lastSyncAt ? ` / 最終同期: ${new Date(result.lastSyncAt).toLocaleString()}` : '';
        status.textContent = (result.connected ? `接続済み / リスト: ${result.listName}${lastSync}` : '未接続。補助アプリを導入して接続してください。')
            + (result.lastError ? ` / 前回の同期エラー: ${result.lastError}` : '');
        checkCompleted = true;
    } catch (error) {
        status.textContent = error.message;
    } finally {
        if (animateButton) {
            appleRemindersStatusCheckBusy = false;
            updateTodoProviderUI();
            if (checkCompleted) showAppleRemindersStatusCheckButtonSuccess();
        }
    }
}

async function connectAppleReminders() {
    const status = document.getElementById('appleRemindersStatus');
    if (runtimePlatformOs !== 'mac' || appleRemindersSettingsBusy) return;
    if (!supportsAppleRemindersInCurrentBrowser()) {
        status.textContent = APPLE_REMINDERS_SUPPORTED_BROWSER_MESSAGE;
        return;
    }
    appleRemindersSettingsBusy = true;
    updateTodoProviderUI();
    try {
        // Request inside the click gesture, before awaiting any other operation.
        const granted = await chrome.permissions.request({ permissions: ['nativeMessaging'] });
        if (!granted) throw new Error('補助アプリへの接続が許可されませんでした。');
        status.textContent = '接続中… macOSのリマインダーアクセスを許可し、同期先リストを1つ選択してください。';
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
    document.getElementById('appleRemindersRefreshBtn').addEventListener('click', () => refreshTodoProviderStatus({ animateButton: true }));
}
