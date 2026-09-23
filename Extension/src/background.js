// background.js
// Background service-worker entry point and event routing.

importScripts(
  chrome.runtime.getURL('src/background/core.js'),
  chrome.runtime.getURL('src/background/ticktick-model.js'),
  chrome.runtime.getURL('src/background/ticktick-client.js'),
  chrome.runtime.getURL('src/background/todo-sync-engine.js'),
  chrome.runtime.getURL('src/background/ticktick-sync.js'),
  chrome.runtime.getURL('src/background/apple-reminders-bridge.js'),
  chrome.runtime.getURL('src/background/apple-reminders-sync.js'),
  chrome.runtime.getURL('src/background/downloads.js')
);

const REMOVED_AI_COURSE_NAME_STORAGE_KEYS = [
    'openaiApiKey',
    'groqApiKey',
    'openaiCourseNameModel',
    'groqCourseNameModel',
    'openaiCourseNameCache',
    'webclass_openai_course_name_cache',
    'courseNameProvider',
    'useLlmCourseNameEnabled',
    'openaiCourseNameEnabled',
    'autoRunCourseNameConversionOnDashboardLoad',
    'showLlmCourseStatusEnabled',
    'webclass_short_name_mode_enabled'
];

function clearRemovedAiCourseNameSettings() {
    chrome.storage.local.remove(REMOVED_AI_COURSE_NAME_STORAGE_KEYS, () => {
        void chrome.runtime.lastError;
    });
    if (chrome.storage.session?.remove) {
        chrome.storage.session.remove(REMOVED_AI_COURSE_NAME_STORAGE_KEYS, () => {
            void chrome.runtime.lastError;
        });
    }
}

clearRemovedAiCourseNameSettings();

chrome.runtime.onInstalled.addListener(() => {
    ensureTodoSyncAlarmRegistered();
    ensureExtensionUpdateAlarmRegistered();
    checkForExtensionUpdate({ force: true }).catch((error) => {
        uxDebugWarn('[WebClass UX] extension update check on install failed', error);
    });
});

chrome.runtime.onStartup.addListener(() => {
    ensureTodoSyncAlarmRegistered();
    ensureExtensionUpdateAlarmRegistered();
    checkForExtensionUpdate().catch((error) => {
        uxDebugWarn('[WebClass UX] extension update check on startup failed', error);
    });
});

if (chrome?.alarms?.onAlarm?.addListener) {
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (!alarm?.name) return;
        if (alarm.name === TODO_SYNC_ALARM_NAME) {
            handleTodoSyncAlarmTick().catch((error) => {
                uxDebugWarn('[WebClass UX] todo sync alarm failed', error);
            });
            return;
        }
        if (alarm.name === EXTENSION_UPDATE_ALARM_NAME) {
            checkForExtensionUpdate().catch((error) => {
                uxDebugWarn('[WebClass UX] extension update alarm failed', error);
            });
        }
    });
} else {
    uxDebugWarn('[WebClass UX] chrome.alarms.onAlarm API is unavailable; skipping alarm listener registration.');
}

ensureTodoSyncAlarmRegistered();
ensureExtensionUpdateAlarmRegistered();
checkForExtensionUpdate().catch((error) => {
    uxDebugWarn('[WebClass UX] initial extension update check failed', error);
});

if (chrome?.notifications?.onClicked?.addListener) {
    chrome.notifications.onClicked.addListener((notificationId) => {
        if (notificationId !== EXTENSION_UPDATE_NOTIFICATION_ID) return;
        clearExtensionUpdateNotification();
        if (chrome.runtime?.openOptionsPage) {
            chrome.runtime.openOptionsPage(() => {
                void chrome.runtime?.lastError;
            });
            return;
        }
        chrome.tabs.create({ url: chrome.runtime.getURL('src/options.html') }, () => {
            void chrome.runtime?.lastError;
        });
    });
}

if (chrome?.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes[EXTENSION_UPDATE_CHECK_ENABLED_KEY]) return;
        const enabled = changes[EXTENSION_UPDATE_CHECK_ENABLED_KEY].newValue !== false;
        if (!enabled) {
            setExtensionUpdateBadge(false);
            clearExtensionUpdateNotification();
            return;
        }
        checkForExtensionUpdate({ force: true }).catch((error) => {
            uxDebugWarn('[WebClass UX] extension update check after enabling failed', error);
        });
    });
}


// ============================================================
// Message Router
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message?.type) return false;
    if (!isTrustedRuntimeMessageSender(sender)) {
        sendResponse({
            success: false,
            error: 'Unauthorized message sender.'
        });
        return false;
    }

    switch (message.type) {
        case 'GET_AUTO_LOGIN_SETTINGS':
            handleGetAutoLoginSettings(sender, sendResponse);
            return true;
        case 'APPLE_REMINDERS_CONNECT':
        case 'APPLE_REMINDERS_DISCONNECT':
        case 'APPLE_REMINDERS_GET_STATUS':
            handleAppleRemindersMessage(message, sender, sendResponse);
            return true;
        case 'TICKTICK_TODO_CONNECT':
            handleTickTickTodoConnect(sendResponse);
            return true;
        case 'TICKTICK_TODO_DISCONNECT':
            handleTickTickTodoDisconnect(sendResponse);
            return true;
        case 'TICKTICK_TODO_GET_STATUS':
            handleTickTickTodoGetStatus(sendResponse);
            return true;
        case 'TODO_API_RUN_SYNC':
            handleTodoApiRunSync(message, sendResponse);
            return true;
        case 'CONVERT_PDF_TO_IMAGES':
            handleConvertPdfToImages(message, sender, sendResponse);
            return true;
        case 'DOWNLOAD_BLOB':
            handleDownloadBlob(message, sender, sendResponse);
            return true;
        case 'DOWNLOAD_FILE':
            handleDownloadFile(message, sender, sendResponse);
            return true;
        case 'GET_EXTENSION_UPDATE_STATUS':
            readExtensionUpdateStatus()
                .then((status) => {
                    sendResponse({ success: true, status });
                })
                .catch((error) => {
                    sendResponse({ success: false, error: error?.message || 'Failed to read update status.' });
                });
            return true;
        case 'CHECK_EXTENSION_UPDATE_NOW':
            checkForExtensionUpdate({ force: true })
                .then((status) => {
                    sendResponse({ success: true, status });
                })
                .catch((error) => {
                    sendResponse({ success: false, error: error?.message || 'Failed to check updates.' });
                });
            return true;
        case 'SHOW_EXTENSION_UPDATE_NOTIFICATION_PREVIEW':
            showExtensionUpdateNotificationPreview()
                .then(() => {
                    sendResponse({ success: true });
                })
                .catch((error) => {
                    sendResponse({ success: false, error: error?.message || 'Failed to show update preview.' });
                });
            return true;
        case 'OPEN_OPTIONS_PAGE_FALLBACK':
            if (chrome.runtime?.openOptionsPage) {
                chrome.runtime.openOptionsPage(() => {
                    if (chrome.runtime.lastError) {
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                        return;
                    }
                    sendResponse({ success: true });
                });
                return true;
            }
            chrome.tabs.create({ url: chrome.runtime.getURL('src/options.html') }, (tab) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    return;
                }
                sendResponse({ success: Boolean(tab?.id) });
            });
            return true;
        default:
            return false;
    }
});

// ============================================================
// Download Filename Determination
// ============================================================

/**
 * Rename downloads using pending requests or URL-to-filename mapping.
 */
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    uxDebugLog('[WebClass UX] Determining filename for:', {
        id: downloadItem.id,
        url: downloadItem.url,
        finalUrl: downloadItem.finalUrl,
        filename: downloadItem.filename
    });

    const pending = pendingDownloads.get(downloadItem.id);
    if (pending && pending.rename && pending.filename) {
        uxDebugLog('[WebClass UX] Using pending filename:', pending.filename);
        suggest({
            filename: pending.filename,
            conflictAction: 'uniquify'
        });
        pendingDownloads.delete(downloadItem.id);
        return true;
    }

    let matchedFilename = null;
    let matchedUrlKey = null;

    // Try exact URL mappings first, then fallback to partial matching.
    if (urlToFilename.has(downloadItem.url)) {
        matchedFilename = urlToFilename.get(downloadItem.url);
        matchedUrlKey = downloadItem.url;
    } else if (urlToFilename.has(downloadItem.finalUrl)) {
        matchedFilename = urlToFilename.get(downloadItem.finalUrl);
        matchedUrlKey = downloadItem.finalUrl;
    } else {
        for (const [url, filename] of urlToFilename) {
            if (downloadItem.url.includes(url) ||
                downloadItem.finalUrl?.includes(url) ||
                url.includes(downloadItem.url)) {
                matchedFilename = filename;
                matchedUrlKey = url;
                break;
            }
        }
    }

    if (matchedFilename) {
        uxDebugLog('[WebClass UX] Using mapped filename:', matchedFilename);
        suggest({
            filename: matchedFilename,
            conflictAction: 'uniquify'
        });

        // Clean up mapping after applying the filename.
        if (matchedUrlKey) {
            urlToFilename.delete(matchedUrlKey);
        }
        urlToFilename.delete(downloadItem.url);
        urlToFilename.delete(downloadItem.finalUrl);

        return true;
    }

    uxDebugLog('[WebClass UX] No rename mapping found, using default');
    suggest();
    return true;
});

// ============================================================
// Download State Change Listener
// ============================================================

chrome.downloads.onChanged.addListener((downloadDelta) => {
    if (downloadDelta.state) {
        uxDebugLog('[WebClass UX] Download state changed:', {
            id: downloadDelta.id,
            state: downloadDelta.state.current
        });

        // Remove stale pending entries when download finishes or fails.
        if (downloadDelta.state.current === 'complete' ||
            downloadDelta.state.current === 'interrupted') {
            pendingDownloads.delete(downloadDelta.id);
        }
    }
});

// ============================================================
// Periodic Cleanup
// ============================================================


setInterval(() => {
    if (pendingDownloads.size > 100) {
        uxDebugLog('[WebClass UX] Cleaning up pending downloads');
        pendingDownloads.clear();
    }

    if (urlToFilename.size > 50) {
        uxDebugLog('[WebClass UX] Cleaning up URL mappings');
        urlToFilename.clear();
    }
}, 5 * 60 * 1000);

async function clearLegacyGatewayArtifacts() {
    try {
        await Promise.all([
            storageSet({
                ticktickTodoGatewayBaseUrl: '',
                ticktickTodoGatewayApiKey: '',
                ticktickTodoRefreshVaultId: '',
                ticktickTodoVaultSessionToken: ''
            }),
            storageSessionRemove([
                'ticktickTodoGatewayApiKeySession',
                'ticktickTodoGatewaySigningKeySession'
            ])
        ]);
    } catch (error) {
        uxDebugWarn('[WebClass UX] failed to clear legacy gateway artifacts', error);
    }
}

clearLegacyGatewayArtifacts();

uxDebugLog('[WebClass UX] Background script ready');
