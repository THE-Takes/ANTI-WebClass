// background.js
// Handles downloads and background tasks for WebClass UX Improver

console.log('WebClass UX Improver: Background script loaded');

// ============================================================
// Download Management
// ============================================================

// ダウンロード待機中のファイル情報を保持
// Key: downloadId, Value: { filename, rename }
const pendingDownloads = new Map();

// URL -> filename のマッピング（リネーム用）
const urlToFilename = new Map();

// ============================================================
// Message Handlers
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[WebClass UX] Message received:', message);
    
    switch (message.type) {
        case 'DOWNLOAD_FILE':
            handleDownloadFile(message, sender, sendResponse);
            return true; // 非同期レスポンスを示す
            
        case 'DOWNLOAD_BLOB':
            handleDownloadBlob(message, sender, sendResponse);
            return true; // 非同期レスポンスを示す
            
        case 'CONVERT_PDF_TO_IMAGES':
            handleConvertPdfToImages(message, sender, sendResponse);
            return true; // 非同期レスポンスを示す
            
        case 'PREPARE_DOWNLOAD_RENAME':
            // 従来のAPI（互換性のため）
            if (message.url && message.filename) {
                urlToFilename.set(message.url, message.filename);
                console.log(`[WebClass UX] Prepared rename: ${message.url} -> ${message.filename}`);
            }
            sendResponse({ success: true });
            return false;
            
        case 'CALDAV_REQUEST':
            // CalDAVリクエストをプロキシ（CORS回避）
            handleCalDAVRequest(message, sendResponse);
            return true; // 非同期レスポンスを示す
            
        case 'MS_TODO_SYNC':
            // Microsoft To Doに課題を同期
            handleMSTodoSync(message, sendResponse);
            return true; // 非同期レスポンスを示す
            
        default:
            console.log('[WebClass UX] Unknown message type:', message.type);
            return false;
    }
});

/**
 * PDFを画像に変換するリクエストを処理
 * ダウンロードウィンドウからの場合、PDFビューアを開いて変換を促す
 * @param {Object} message
 * @param {Object} sender
 * @param {Function} sendResponse
 */
async function handleConvertPdfToImages(message, sender, sendResponse) {
    const { url, baseFileName } = message;
    
    console.log('[WebClass UX] Convert PDF to images request:', { url, baseFileName });
    
    try {
        // PDFビューアのURLを構築（loadit.phpを使用）
        // URLからfile_nameパラメータを取得
        let pdfViewerUrl;
        
        // 相対URLを絶対URLに変換
        let absoluteUrl = url;
        if (!url.startsWith('http')) {
            absoluteUrl = 'https://kulms.kanagawa-u.ac.jp' + (url.startsWith('/') ? '' : '/') + url;
        }
        
        // loadit.phpを使用してPDFを開く
        // WebClassのloadit.phpに渡すためのURLエンコード
        const encodedUrl = encodeURIComponent(absoluteUrl);
        pdfViewerUrl = `https://kulms.kanagawa-u.ac.jp/webclass/loadit.php?file=${encodedUrl}`;
        
        // 新しいタブでPDFビューアを開く
        const tab = await chrome.tabs.create({
            url: pdfViewerUrl,
            active: true
        });
        
        // ユーザーに通知
        // 注：このメッセージはcontent scriptでアラートとして表示される
        
        sendResponse({
            success: true,
            message: 'PDFビューアを開きました。ビューアの「画像」ボタンを使用してください。',
            tabId: tab.id
        });
        
    } catch (error) {
        console.error('[WebClass UX] Error converting PDF:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

/**
 * Blobダウンロードのリクエストを処理
 * @param {Object} message
 * @param {Object} sender
 * @param {Function} sendResponse
 */
async function handleDownloadBlob(message, sender, sendResponse) {
    const { url, filename } = message;
    
    console.log('[WebClass UX] Blob download request:', { url, filename });
    
    try {
        // ダウンロード開始
        const downloadOptions = {
            url: url,
            filename: filename,
            saveAs: false
        };
        
        chrome.downloads.download(downloadOptions, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error('[WebClass UX] Blob download error:', chrome.runtime.lastError);
                sendResponse({ 
                    success: false, 
                    error: chrome.runtime.lastError.message 
                });
                return;
            }
            
            console.log('[WebClass UX] Blob download started:', downloadId);
            sendResponse({ 
                success: true, 
                downloadId: downloadId 
            });
        });
        
    } catch (error) {
        console.error('[WebClass UX] Error handling blob download:', error);
        sendResponse({ 
            success: false, 
            error: error.message 
        });
    }
}

/**
 * ダウンロードファイルのリクエストを処理
 * @param {Object} message
 * @param {Object} sender
 * @param {Function} sendResponse
 */
async function handleDownloadFile(message, sender, sendResponse) {
    const { url, filename, rename } = message;
    
    console.log('[WebClass UX] Download request:', { url, filename, rename });
    
    try {
        // URLを絶対URLに変換
        let absoluteUrl = url;
        if (!url.startsWith('http')) {
            // 相対URLの場合、送信元タブのURLをベースに
            if (sender.tab && sender.tab.url) {
                const baseUrl = new URL(sender.tab.url);
                absoluteUrl = new URL(url, baseUrl.origin).href;
            } else {
                absoluteUrl = 'https://kulms.kanagawa-u.ac.jp' + (url.startsWith('/') ? '' : '/') + url;
            }
        }
        
        // リネームする場合はマッピングを保存
        if (rename && filename) {
            urlToFilename.set(absoluteUrl, filename);
            // 部分一致用にも保存
            urlToFilename.set(url, filename);
        }
        
        // ダウンロード開始
        const downloadOptions = {
            url: absoluteUrl,
            saveAs: false // 保存ダイアログを表示しない
        };
        
        // リネームする場合はfilenameを指定
        if (rename && filename) {
            downloadOptions.filename = filename;
        }
        
        chrome.downloads.download(downloadOptions, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error('[WebClass UX] Download error:', chrome.runtime.lastError);
                sendResponse({ 
                    success: false, 
                    error: chrome.runtime.lastError.message 
                });
                return;
            }
            
            console.log('[WebClass UX] Download started:', downloadId);
            
            // ダウンロード情報を保存
            if (rename && filename) {
                pendingDownloads.set(downloadId, { filename, rename: true });
            }
            
            sendResponse({ 
                success: true, 
                downloadId: downloadId 
            });
        });
        
    } catch (error) {
        console.error('[WebClass UX] Error handling download:', error);
        sendResponse({ 
            success: false, 
            error: error.message 
        });
    }
}

// ============================================================
// Download Filename Determination
// ============================================================

/**
 * ダウンロードファイル名の決定時に呼ばれるリスナー
 */
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    console.log('[WebClass UX] Determining filename for:', {
        id: downloadItem.id,
        url: downloadItem.url,
        finalUrl: downloadItem.finalUrl,
        filename: downloadItem.filename
    });
    
    // pendingDownloadsから確認
    const pending = pendingDownloads.get(downloadItem.id);
    if (pending && pending.rename && pending.filename) {
        console.log('[WebClass UX] Using pending filename:', pending.filename);
        suggest({
            filename: pending.filename,
            conflictAction: 'uniquify'
        });
        pendingDownloads.delete(downloadItem.id);
        return true;
    }
    
    // URLマッピングから確認
    let matchedFilename = null;
    
    // 完全一致
    if (urlToFilename.has(downloadItem.url)) {
        matchedFilename = urlToFilename.get(downloadItem.url);
    } else if (urlToFilename.has(downloadItem.finalUrl)) {
        matchedFilename = urlToFilename.get(downloadItem.finalUrl);
    } else {
        // 部分一致（URLにパラメータが付いている場合など）
        for (const [url, filename] of urlToFilename) {
            if (downloadItem.url.includes(url) || 
                downloadItem.finalUrl?.includes(url) ||
                url.includes(downloadItem.url)) {
                matchedFilename = filename;
                break;
            }
        }
    }
    
    if (matchedFilename) {
        console.log('[WebClass UX] Using mapped filename:', matchedFilename);
        suggest({
            filename: matchedFilename,
            conflictAction: 'uniquify'
        });
        
        // 使用後にクリア
        urlToFilename.delete(downloadItem.url);
        urlToFilename.delete(downloadItem.finalUrl);
        
        return true;
    }
    
    // マッチしない場合はデフォルトの動作
    console.log('[WebClass UX] No rename mapping found, using default');
    suggest();
    return true;
});

// ============================================================
// Download State Change Listener
// ============================================================

chrome.downloads.onChanged.addListener((downloadDelta) => {
    if (downloadDelta.state) {
        console.log('[WebClass UX] Download state changed:', {
            id: downloadDelta.id,
            state: downloadDelta.state.current
        });
        
        // ダウンロード完了またはエラー時にクリーンアップ
        if (downloadDelta.state.current === 'complete' || 
            downloadDelta.state.current === 'interrupted') {
            pendingDownloads.delete(downloadDelta.id);
        }
    }
});

// ============================================================
// Periodic Cleanup
// ============================================================

// 古いマッピングを定期的にクリーンアップ（メモリリーク防止）
setInterval(() => {
    const maxAge = 5 * 60 * 1000; // 5分
    const now = Date.now();
    
    // pendingDownloadsのクリーンアップ
    if (pendingDownloads.size > 100) {
        console.log('[WebClass UX] Cleaning up pending downloads');
        pendingDownloads.clear();
    }
    
    // urlToFilenameのクリーンアップ
    if (urlToFilename.size > 50) {
        console.log('[WebClass UX] Cleaning up URL mappings');
        urlToFilename.clear();
    }
}, 5 * 60 * 1000);

// ============================================================
// Microsoft To Do Sync (Experimental)
// ============================================================

/**
 * Microsoft To Doに課題を同期する（双方向完了状態同期対応）
 */
async function handleMSTodoSync(message, sendResponse) {
    const { assignments } = message;
    
    console.log('[WebClass UX] MS To Do sync request:', assignments?.length || 0, 'assignments');
    
    try {
        // 設定を読み込み
        const settings = await new Promise(resolve => {
            chrome.storage.local.get({
                msTodoEnabled: false,
                msClientId: '',
                msSelectedList: '',
                msAccessToken: null,
                msRefreshToken: null,
                msTokenExpiry: null,
                msSyncedItems: {},
                msReminderDays: '1',   // デフォルト: 1日前
                msReminderTime: '9am', // デフォルト: 朝9時
            }, resolve);
        });
        
        if (!settings.msTodoEnabled) {
            console.log('[WebClass UX] MS To Do sync is disabled');
            sendResponse({ success: false, error: 'MS To Do sync is disabled' });
            return;
        }
        
        if (!settings.msAccessToken) {
            console.log('[WebClass UX] Not authenticated with MS To Do');
            sendResponse({ success: false, error: 'Not authenticated' });
            return;
        }
        
        if (!settings.msSelectedList) {
            console.log('[WebClass UX] No task list selected');
            sendResponse({ success: false, error: 'No task list selected' });
            return;
        }
        
        // トークンの有効性チェック & リフレッシュ
        let accessToken = settings.msAccessToken;
        if (settings.msTokenExpiry && Date.now() > settings.msTokenExpiry - 5 * 60 * 1000) {
            console.log('[WebClass UX] Token expired, refreshing...');
            try {
                accessToken = await refreshMSToken(settings.msClientId, settings.msRefreshToken);
            } catch (e) {
                console.error('[WebClass UX] Token refresh failed:', e);
                sendResponse({ success: false, error: 'Token refresh failed' });
                return;
            }
        }
        
        // 同期実行
        const results = { success: [], failed: [], completedFromMtodo: [] };
        const syncedItems = { ...settings.msSyncedItems };
        
        console.log('[WebClass UX] Synced items from storage:', Object.keys(syncedItems).length);
        console.log('[WebClass UX] Current synced items:', JSON.stringify(syncedItems, null, 2));
        
        // 1. まずMtodoから既存タスクの完了状態を取得
        console.log('[WebClass UX] Fetching tasks from MS To Do...');
        const mtodoTasks = await getMSTasks(accessToken, settings.msSelectedList);
        console.log('[WebClass UX] Got', mtodoTasks.length, 'tasks from MS To Do');
        
        const mtodoStatusMap = {}; // taskId -> completed status
        const mtodoTaskByTitle = {}; // 課題タイトル -> タスク情報 (既存タスクをタイトルで検索用)
        
        mtodoTasks.forEach(task => {
            if (task.title) {
                mtodoStatusMap[task.id] = task.status === 'completed';
                
                // タイトルから課題タイトルを抽出
                // 旧形式: [WebClass] 課題タイトル or [教科名] 課題タイトル
                // 新形式: 教科名 課題タイトル
                let assignmentTitle = task.title;
                const bracketMatch = task.title.match(/^\[.+?\]\s*(.+)$/);
                if (bracketMatch) {
                    // 旧形式（ブラケットあり）
                    assignmentTitle = bracketMatch[1];
                }
                // 新形式はそのままタイトル全体をキーにする（課題タイトル部分での一致も試みる）
                
                mtodoTaskByTitle[assignmentTitle] = {
                    id: task.id,
                    fullTitle: task.title,
                    status: task.status,
                    isCompleted: task.status === 'completed'
                };
                console.log('[WebClass UX] Mtodo task:', task.title, '| extracted:', assignmentTitle, '| status:', task.status);
            }
        });
        
        for (const assignment of assignments) {
            try {
                const syncKey = `${assignment.course || 'unknown'}_${assignment.title}`;
                console.log('[WebClass UX] Processing:', syncKey, '| isCompleted:', assignment.isCompleted);
                
                // 既存の同期情報があるか確認
                let existingSyncInfo = syncedItems[syncKey];
                console.log('[WebClass UX] Existing sync info:', existingSyncInfo);
                
                // syncedItemsにない場合、MTodoのタスク一覧からタイトルで検索
                if (!existingSyncInfo && mtodoTaskByTitle[assignment.title]) {
                    const foundTask = mtodoTaskByTitle[assignment.title];
                    console.log('[WebClass UX] Found existing task by title:', assignment.title, '| id:', foundTask.id);
                    // syncedItemsに追加して次回以降も正しく同期できるようにする
                    existingSyncInfo = {
                        taskId: foundTask.id,
                        syncedAt: new Date().toISOString(),
                    };
                    syncedItems[syncKey] = existingSyncInfo;
                }
                
                // 2. Mtodo側で完了になっている場合、Stodo側も完了にマーク
                if (existingSyncInfo) {
                    const mtodoCompleted = mtodoStatusMap[existingSyncInfo.taskId];
                    console.log('[WebClass UX] Mtodo completed status for', assignment.title, ':', mtodoCompleted);
                    
                    if (mtodoCompleted === true && !assignment.isCompleted) {
                        console.log('[WebClass UX] Marking as completed from Mtodo:', assignment.title);
                        results.completedFromMtodo.push(syncKey);
                        assignment.isCompleted = true;
                    }
                } else {
                    console.log('[WebClass UX] No existing sync info for:', syncKey);
                }
                
                // タスクデータを準備
                // タイトル: 短縮教科名 課題タイトル
                const shortCourseName = assignment.course || '不明';
                const taskTitle = `${shortCourseName} ${assignment.title}`;
                
                // メモ欄: 期限、正式科目名、URL
                const fullCourseName = assignment.courseFullName || assignment.course || '不明';
                const deadlineText = assignment.deadline && assignment.deadline !== '期限なし' 
                    ? `📅 期限: ${assignment.deadline}` 
                    : '📅 期限: なし';
                const bodyContent = [
                    deadlineText,
                    `科目: ${fullCourseName}`,
                    assignment.url ? `URL: ${assignment.url}` : '',
                ].filter(Boolean).join('\n');
                
                const taskData = {
                    title: taskTitle,
                    body: {
                        content: bodyContent,
                        contentType: 'text',
                    },
                };
                
                // リマインダーを設定（設定に基づく）
                const reminderDays = parseInt(settings.msReminderDays || '1', 10);
                const reminderTime = settings.msReminderTime || '9am';
                console.log('[WebClass UX] Reminder settings:', { reminderDays, reminderTime, deadline: assignment.deadline });
                
                if (reminderDays > 0 && assignment.deadline && assignment.deadline !== '期限なし') {
                    const deadlineDate = new Date(assignment.deadline);
                    if (!isNaN(deadlineDate.getTime())) {
                        const reminderDate = calculateReminderDate(deadlineDate, reminderDays, reminderTime);
                        console.log('[WebClass UX] Calculated reminder date:', reminderDate?.toLocaleString('ja-JP'));
                        
                        // リマインダーが現在より未来の場合のみ設定
                        if (reminderDate && reminderDate > new Date()) {
                            taskData.isReminderOn = true;
                            // ローカル時刻をISO形式に変換（UTCではなくローカル時刻を使用）
                            taskData.reminderDateTime = {
                                dateTime: formatLocalDateTime(reminderDate),
                                timeZone: 'Asia/Tokyo',
                            };
                            console.log('[WebClass UX] Reminder set:', taskData.reminderDateTime);
                        }
                    }
                }
                
                // 3. Stodoで完了ならMtodoも完了に（completedDateTimeも必要）
                if (assignment.isCompleted) {
                    taskData.status = 'completed';
                    taskData.completedDateTime = {
                        dateTime: new Date().toISOString(),
                        timeZone: 'UTC',
                    };
                    console.log('[WebClass UX] Setting task as completed:', assignment.title);
                } else {
                    taskData.status = 'notStarted';
                    // 完了解除の場合はcompletedDateTimeをnullに
                    taskData.completedDateTime = null;
                }
                
                if (assignment.deadline && assignment.deadline !== '期限なし') {
                    const dueDate = new Date(assignment.deadline);
                    if (!isNaN(dueDate.getTime())) {
                        taskData.dueDateTime = {
                            dateTime: dueDate.toISOString().split('T')[0] + 'T00:00:00',
                            timeZone: 'Asia/Tokyo',
                        };
                    }
                }
                
                console.log('[WebClass UX] Task data to send:', JSON.stringify(taskData, null, 2));
                
                if (existingSyncInfo) {
                    // 既存タスクを更新（完了状態も含む）
                    try {
                        console.log('[WebClass UX] Updating existing task:', existingSyncInfo.taskId);
                        const updateResult = await updateMSTask(accessToken, settings.msSelectedList, existingSyncInfo.taskId, taskData);
                        console.log('[WebClass UX] Update result:', updateResult?.status);
                    } catch (e) {
                        console.log('[WebClass UX] Update error:', e.message);
                        // タスクが見つからない場合は新規作成
                        if (e.message.includes('not found') || e.message.includes('404')) {
                            console.log('[WebClass UX] Task not found, creating new one');
                            const result = await createMSTask(accessToken, settings.msSelectedList, taskData);
                            syncedItems[syncKey] = {
                                taskId: result.id,
                                syncedAt: new Date().toISOString(),
                            };
                        } else {
                            throw e;
                        }
                    }
                } else {
                    // 新規作成
                    console.log('[WebClass UX] Creating new task');
                    const result = await createMSTask(accessToken, settings.msSelectedList, taskData);
                    console.log('[WebClass UX] Created task with id:', result.id);
                    syncedItems[syncKey] = {
                        taskId: result.id,
                        syncedAt: new Date().toISOString(),
                    };
                }
                
                results.success.push(assignment);
            } catch (error) {
                console.error('[WebClass UX] Failed to sync:', assignment.title, error);
                results.failed.push({ assignment, error: error.message });
            }
        }
        
        // 同期情報を保存
        await new Promise(resolve => {
            chrome.storage.local.set({
                msSyncedItems: syncedItems,
                msLastSync: new Date().toISOString(),
            }, resolve);
        });
        
        console.log('[WebClass UX] MS To Do sync completed:', results.success.length, 'success,', results.failed.length, 'failed,', results.completedFromMtodo.length, 'completed from Mtodo');
        sendResponse({ success: true, results });
        
    } catch (error) {
        console.error('[WebClass UX] MS To Do sync error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * リマインダー日時を計算する
 * @param {Date} deadlineDate - 締め切り日時
 * @param {number} days - 何日前か（1〜7）
 * @param {string} time - 'exact'（ちょうど同時刻）または '9am'（朝9時）
 * @returns {Date|null} - リマインダー日時
 */
function calculateReminderDate(deadlineDate, days, time) {
    if (days <= 0) return null;
    
    const reminderDate = new Date(deadlineDate);
    
    // 指定日数前に設定
    reminderDate.setDate(reminderDate.getDate() - days);
    
    // 時刻を設定
    if (time === '9am') {
        reminderDate.setHours(9, 0, 0, 0);
    }
    // 'exact'の場合は締め切りと同じ時刻のまま
    
    return reminderDate;
}

/**
 * ローカル時刻をISO 8601形式（タイムゾーンなし）にフォーマット
 * MS Graph APIのdateTimeTimeZone形式で使用
 * @param {Date} date - 日時
 * @returns {string} - "YYYY-MM-DDTHH:mm:ss" 形式
 */
function formatLocalDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/**
 * Microsoft To Doからタスク一覧を取得
 */
async function getMSTasks(accessToken, listId) {
    const response = await fetch(`https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    });
    
    if (!response.ok) {
        console.error('[WebClass UX] Failed to get tasks:', response.status);
        return [];
    }
    
    const data = await response.json();
    return data.value || [];
}

async function refreshMSToken(clientId, refreshToken) {
    const response = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            scope: 'Tasks.ReadWrite User.Read offline_access',
        }).toString(),
    });
    
    if (!response.ok) throw new Error('Token refresh failed');
    
    const data = await response.json();
    
    await new Promise(resolve => {
        chrome.storage.local.set({
            msAccessToken: data.access_token,
            msRefreshToken: data.refresh_token || refreshToken,
            msTokenExpiry: Date.now() + (data.expires_in * 1000),
        }, resolve);
    });
    
    return data.access_token;
}

async function createMSTask(accessToken, listId, taskData) {
    const response = await fetch(`https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(taskData),
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create task');
    }
    
    return response.json();
}

async function updateMSTask(accessToken, listId, taskId, taskData) {
    const response = await fetch(`https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(taskData),
    });
    
    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('Task not found');
        }
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to update task');
    }
    
    return response.json();
}

// ============================================================
// CalDAV Proxy (Experimental)
// ============================================================

/**
 * CalDAVリクエストをプロキシする
 * オプションページからのCORS制限を回避するため
 */
async function handleCalDAVRequest(message, sendResponse) {
    const { url, method, headers, body } = message;
    
    console.log('[WebClass UX] CalDAV request:', { url, method });
    
    try {
        const fetchOptions = {
            method: method || 'GET',
            headers: headers || {},
            credentials: 'omit',
        };
        
        if (body) {
            fetchOptions.body = body;
        }
        
        const response = await fetch(url, fetchOptions);
        const text = await response.text();
        
        sendResponse({
            success: true,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body: text,
        });
    } catch (error) {
        console.error('[WebClass UX] CalDAV request error:', error);
        sendResponse({
            success: false,
            error: error.message,
        });
    }
}

console.log('[WebClass UX] Background script ready');
