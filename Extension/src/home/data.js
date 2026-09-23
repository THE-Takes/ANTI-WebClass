// home/data.js
// Assignment storage, remote synchronization, and message data behavior.

// --- UI Helpers ---
// --- Data Logic ---

async function loadAssignments() {
    const data = await chrome.storage.local.get([STORAGE_KEY_ASSIGNMENTS]);
    return data[STORAGE_KEY_ASSIGNMENTS] || [];
}

async function saveAssignments(assignments) {
    await chrome.storage.local.set({ [STORAGE_KEY_ASSIGNMENTS]: assignments });
}

// --- Trash Bin (ゴミ箱) Functions ---
// 削除されたタスクの識別子を独立ストレージに保存し、
// 再スクレイピングでも復活しないようにする。
let cachedTrashBin = [];

async function loadTrashBin() {
    const data = await chrome.storage.local.get([STORAGE_KEY_TRASH]);
    cachedTrashBin = data[STORAGE_KEY_TRASH] || [];
    return cachedTrashBin;
}

async function saveTrashBin(trashBin) {
    cachedTrashBin = trashBin;
    await chrome.storage.local.set({ [STORAGE_KEY_TRASH]: trashBin });
}

async function addToTrash(todo) {
    await loadTrashBin();
    const identifier = todo.url || todo.fallbackUrl;
    if (!identifier) return;
    if (!cachedTrashBin.includes(identifier)) {
        cachedTrashBin.push(identifier);
        await saveTrashBin(cachedTrashBin);
    }
}

async function removeFromTrash(identifier) {
    await loadTrashBin();
    cachedTrashBin = cachedTrashBin.filter(id => id !== identifier);
    await saveTrashBin(cachedTrashBin);
}

function isInTrashBin(todo) {
    const identifier = todo.url || todo.fallbackUrl;
    if (!identifier) return false;
    return cachedTrashBin.includes(identifier);
}

function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(response || null);
        });
    });
}

async function isTodoApiSyncEnabled() {
    const data = await chrome.storage.local.get({ [STORAGE_KEY_TODO_API_ENABLED]: false });
    return data[STORAGE_KEY_TODO_API_ENABLED] === true;
}

async function runTodoApiSync({ mode = 'full', trigger = 'manual', localMutation = null } = {}) {
    const enabled = await isTodoApiSyncEnabled();
    if (!enabled) return { success: true, skipped: true, reason: 'integration_disabled' };
    const response = await sendRuntimeMessage({
        type: 'TODO_API_RUN_SYNC',
        mode,
        trigger,
        localMutation
    });
    if (!response) {
        throw new Error('ToDo API sync returned no response.');
    }
    if (response.success === false) {
        throw new Error(response.error || 'ToDo API sync failed.');
    }
    return response;
}

function shouldTriggerTodoApiMutationSync(updates) {
    if (!updates || typeof updates !== 'object') return false;
    const keys = [
        'isCompleted',
        'title',
        'deadline',
        'isDeleted'
    ];
    return keys.some((key) => Object.prototype.hasOwnProperty.call(updates, key));
}

// 単一の課題を更新するヘルパー
async function updateAssignment(targetTodo, updates, options = {}) {
    const waitForTodoApiSync = options.waitForTodoApiSync !== false;
    const currentAssignments = await loadAssignments();
    const identifier = targetTodo.url || targetTodo.fallbackUrl;

    const index = currentAssignments.findIndex(a => {
        if (!identifier) return false;
        if (a.url === identifier) return true;
        return a.fallbackUrl === identifier;
    });

    if (index !== -1) {
        // フィールドを更新
        const currentAssignment = currentAssignments[index];
        const normalizedUpdates = { ...updates };

        if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'title')) {
            const currentTitle = typeof currentAssignment.title === 'string' ? currentAssignment.title : '';
            const sourceTitle = typeof currentAssignment.sourceTitle === 'string' && currentAssignment.sourceTitle
                ? currentAssignment.sourceTitle
                : currentTitle;
            const nextTitle = typeof normalizedUpdates.title === 'string'
                ? normalizedUpdates.title
                : '';

            normalizedUpdates.titleEdited = nextTitle !== sourceTitle;
            if (!(typeof currentAssignment.sourceTitle === 'string' && currentAssignment.sourceTitle)) {
                normalizedUpdates.sourceTitle = sourceTitle;
            }
        }

        currentAssignments[index] = { ...currentAssignment, ...normalizedUpdates };
        await saveAssignments(currentAssignments);
        uxDebugLog('Assignment updated:', currentAssignments[index]);
        if (shouldTriggerTodoApiMutationSync(normalizedUpdates)) {
            const syncPromise = runTodoApiSync({
                mode: 'local_mutation',
                trigger: 'local_update',
                localMutation: {
                    localKey: identifier
                }
            }).catch((syncError) => {
                uxDebugWarn('[WebClass UX] todo mutation sync failed', syncError);
            });
            if (waitForTodoApiSync) {
                await syncPromise;
            }
        }
    } else {
        uxDebugWarn('Assignment not found for update:', targetTodo);
    }
}

// --- Message Functions ---

/**
 * acsパラメータを抽出する（URLまたはページ内リンクから）
 */
function getAcsParameter() {
    // 1. まずURLのクエリパラメータから試す
    const urlParams = new URLSearchParams(window.location.search);
    let acs = urlParams.get('acs_');
    if (acs) return acs;

    // 2. ページ内のリンクから acs_ パラメータを探す
    const links = document.querySelectorAll('a[href*="acs_="]');
    for (const link of links) {
        const href = link.getAttribute('href');
        const match = href.match(/acs_=([a-zA-Z0-9]+)/);
        if (match) {
            uxDebugLog('[Messages] ページ内リンクから acs_ を取得:', match[1]);
            return match[1];
        }
    }

    // 3. フォームのhidden inputから探す
    const hiddenInput = document.querySelector('input[name="acs_"]');
    if (hiddenInput) {
        return hiddenInput.value;
    }

    return '';
}

/**
 * Resolve the WebClass inbox URL from the current page.
 *
 * WebClass has changed the inbox endpoint over time. Prefer the link rendered
 * by WebClass itself so the dashboard follows the endpoint used by the
 * current installation, and keep a path-based fallback for pages that do not
 * render the standard header.
 */
function getMessageInboxUrl(acs = getAcsParameter()) {
    const normalizedAcs = typeof acs === 'string' ? acs.trim() : '';
    const sourceLink = Array.from(document.querySelectorAll('a[href]')).find((link) => {
        const href = link.getAttribute('href') || '';
        return /(?:^|\/)messages\.php\/inbox(?:[/?#]|$)/i.test(href);
    });

    if (sourceLink) {
        try {
            const inboxUrl = new URL(
                sourceLink.getAttribute('href') || sourceLink.href,
                window.location.href
            );
            if (normalizedAcs) inboxUrl.searchParams.set('acs_', normalizedAcs);
            return inboxUrl.toString();
        } catch {
            // Fall through to the path-based fallback when the source link is malformed.
        }
    }

    if (!normalizedAcs) return '#';

    const inboxUrl = new URL('/webclass/messages.php/inbox', window.location.origin);
    inboxUrl.searchParams.set('acs_', normalizedAcs);
    return inboxUrl.toString();
}

function resolveMessageFormAction(form, fallbackUrl, acs = '') {
    const rawAction = form?.getAttribute('action')?.trim() || fallbackUrl;

    try {
        const actionUrl = new URL(rawAction, fallbackUrl);
        const normalizedAcs = typeof acs === 'string' ? acs.trim() : '';
        if (normalizedAcs && !actionUrl.searchParams.has('acs_')) {
            actionUrl.searchParams.set('acs_', normalizedAcs);
        }
        return actionUrl.toString();
    } catch {
        return null;
    }
}

function getMessageColumnIndexes(doc, sampleRow) {
    const headerCells = Array.from(
        doc.querySelectorAll('#MsgListTable thead tr:first-child th')
    );
    const findHeaderIndex = (pattern, fallbackIndex) => {
        const index = headerCells.findIndex((cell) => pattern.test(cell.textContent || ''));
        return index >= 0 ? index : fallbackIndex;
    };

    const hasCurrentMessageLayout = (sampleRow?.cells?.length || 0) >= 7;
    return {
        course: findHeaderIndex(/コース|course/i, hasCurrentMessageLayout ? 1 : 0),
        sender: findHeaderIndex(/差出人|from/i, hasCurrentMessageLayout ? 2 : 1),
        senderId: findHeaderIndex(/ユーザID|user\s*id/i, hasCurrentMessageLayout ? 3 : 2),
        subject: findHeaderIndex(/件名|subject/i, hasCurrentMessageLayout ? 4 : 3),
        attachment: findHeaderIndex(/添付ファイル|attachment/i, hasCurrentMessageLayout ? 5 : 4),
        date: findHeaderIndex(/日付|date/i, hasCurrentMessageLayout ? 6 : 5)
    };
}

function getMessageFormConfig(doc, messageUrl, acs) {
    const form = doc.querySelector('#message-form')
        || doc.querySelector('form[name="condition"]')
        || Array.from(doc.querySelectorAll('form')).find((candidate) =>
            candidate.querySelector('#MsgListTable input[name="id[]"]')
            && candidate.querySelector('[name="UNSET_UNREADFLAG"]')
        );
    const messageCheckbox = form?.querySelector(
        '#MsgListTable tbody input[type="checkbox"][name]'
    ) || doc.querySelector('#MsgListTable tbody input[type="checkbox"][name]');
    const markReadControl = form?.querySelector('[name="UNSET_UNREADFLAG"]')
        || doc.querySelector('[name="UNSET_UNREADFLAG"]');
    const hiddenFields = form
        ? Array.from(form.querySelectorAll('input[type="hidden"][name]')).map((input) => ({
            name: input.name,
            value: input.value
        }))
        : [];

    return {
        action: resolveMessageFormAction(form, messageUrl, acs),
        idFieldName: messageCheckbox?.name || 'id[]',
        submitName: markReadControl?.getAttribute('name') || 'UNSET_UNREADFLAG',
        submitValue: markReadControl?.getAttribute('value') ?? '1',
        hiddenFields,
        numCboxes: form?.querySelector('input[name="num_cboxes"]')?.value || null
    };
}

/**
 * メッセージ一覧ページをフェッチして解析
 */
async function fetchMessages(messagePageUrl = null) {
    const acs = getAcsParameter();
    if (!acs) {
        uxDebugWarn('[Messages] acs_ パラメータが見つかりません。ページ内にリンクがありません。');
        return { messages: [], unreadCount: 0, totalCount: 0, formAction: null, error: 'acs_not_found' };
    }

    let messageUrl = getMessageInboxUrl(acs);
    if (messagePageUrl) {
        try {
            const requestedUrl = new URL(messagePageUrl, window.location.origin);
            const isSameOrigin = requestedUrl.origin === window.location.origin;
            const isInboxPage = /\/messages\.php\/inbox(?:\/|$)/i.test(requestedUrl.pathname);
            if (isSameOrigin && isInboxPage) messageUrl = requestedUrl.toString();
        } catch {
            // Keep the default inbox URL when a stale pagination URL is malformed.
        }
    }
    uxDebugLog('[Messages] メッセージを取得中:', messageUrl);

    try {
        const response = await fetch(messageUrl);
        if (!response.ok) {
            uxDebugWarn('[Messages] HTTP error while fetching inbox', response.status);
            return { messages: [], unreadCount: 0, totalCount: 0, formAction: null, error: 'fetch_failed' };
        }

        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const messages = [];
        const rows = doc.querySelectorAll('#MsgListTable tbody tr');
        const columnIndexes = getMessageColumnIndexes(doc, rows[0]);
        const messageForm = getMessageFormConfig(doc, messageUrl, acs);
        const currentPage = Math.max(1, Number(new URL(messageUrl).searchParams.get('page')) || 1);
        const paginationLinks = Array.from(doc.querySelectorAll('#message-form a[href*="page="]'))
            .map((link) => {
                try {
                    const url = new URL(link.getAttribute('href') || link.href, messageUrl);
                    return { page: Number(url.searchParams.get('page')) || 1, url: url.toString() };
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
        const totalPages = Math.max(currentPage, ...paginationLinks.map((link) => link.page));
        const findPageUrl = (page) => paginationLinks.find((link) => link.page === page)?.url || null;

        rows.forEach((row, index) => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 6) return;

            // チェックボックスからメッセージIDを取得
            const checkbox = cells[0].querySelector('input[type="checkbox"]');
            const messageId = checkbox ? checkbox.value : null;

            const courseCell = cells[columnIndexes.course];
            const course = courseCell ? courseCell.textContent.trim() : '';

            // The current inbox has seven columns; use the table headers so older layouts still work.
            const senderCell = cells[columnIndexes.sender];
            const sender = senderCell.textContent.trim();
            const senderIdCell = cells[columnIndexes.senderId];
            const senderId = senderIdCell ? senderIdCell.textContent.trim() : '';

            // 件名
            const subjectCell = cells[columnIndexes.subject];
            const subjectLink = subjectCell.querySelector('a');
            const subject = subjectLink ? subjectLink.textContent.trim() : subjectCell.textContent.trim();
            const messageDetailUrl = subjectLink
                ? new URL(subjectLink.getAttribute('href') || subjectLink.href, messageUrl).toString()
                : null;

            const attachmentCell = cells[columnIndexes.attachment];
            const attachmentLink = attachmentCell?.querySelector('a');
            const attachment = attachmentLink
                ? attachmentLink.textContent.trim()
                : (attachmentCell?.textContent || '').trim();
            const attachmentUrl = attachmentLink
                ? new URL(attachmentLink.getAttribute('href') || attachmentLink.href, messageUrl).toString()
                : null;

            // 日付
            const dateCell = cells[columnIndexes.date];
            const date = dateCell.textContent.trim();

            // Unread rows are rendered in bold by WebClass.
            const isUnread = row.querySelector('b') !== null;

            messages.push({
                id: messageId,
                course: course,
                sender: sender,
                senderId: senderId,
                subject: subject,
                attachment: attachment,
                attachmentUrl: attachmentUrl,
                date: date,
                url: messageDetailUrl,
                isUnread: isUnread,
                index: index
            });
        });

        const unreadCount = getUxInboxUnreadMessageCount(doc)
            ?? messages.filter(m => m.isUnread).length;
        uxDebugLog(`[Messages] 取得完了: 全${messages.length}件, 未読${unreadCount}件`);

        return {
            messages: messages,
            unreadCount: unreadCount,
            totalCount: messages.length,
            formAction: messageForm.action,
            numCboxes: messageForm.numCboxes,
            messageForm: messageForm,
            pageInfo: {
                currentPage,
                totalPages,
                currentUrl: messageUrl,
                previousUrl: currentPage > 1 ? findPageUrl(currentPage - 1) : null,
                nextUrl: currentPage < totalPages ? findPageUrl(currentPage + 1) : null
            },
            acs: acs
        };
    } catch (error) {
        uxDebugWarn('[Messages] inbox fetch failed', error);
        return { messages: [], unreadCount: 0, totalCount: 0, formAction: null, error: 'fetch_failed' };
    }
}

function getMessageDetailLines(doc) {
    return doc.body.innerText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function getMessageDetailValue(doc, labelPattern, subject) {
    const lines = getMessageDetailLines(doc);
    const subjectIndex = Math.max(0, lines.findIndex((line) => line === subject));
    const labelIndex = lines.findIndex((line, index) => {
        if (index <= subjectIndex) return false;
        const label = line.match(/^([^：:]+)[：:]/)?.[1];
        return labelPattern.test(label ? `${label}：` : line);
    });
    if (labelIndex < 0) return '';
    const inlineValue = lines[labelIndex].replace(/^[^：:]+[：:]\s*/, '').trim();
    return inlineValue || lines[labelIndex + 1] || '';
}

function getMessageBodyText(doc, subject) {
    const lines = getMessageDetailLines(doc);
    const subjectIndex = Math.max(0, lines.findIndex((line) => line === subject));
    const recipientIndex = lines.findIndex((line, index) => index > subjectIndex && /^宛先[：:]?/.test(line));
    const recipientIsInline = recipientIndex >= 0 && /^宛先[：:]\s*\S/.test(lines[recipientIndex]);
    const startIndex = recipientIndex >= 0
        ? recipientIndex + (recipientIsInline ? 1 : 2)
        : subjectIndex + 1;
    const endIndex = lines.findIndex((line, index) => index >= startIndex && /^(メールへ転送|返事を書く)$/.test(line));
    const metadataPattern = /^(日付|送信者|コース|宛先)[：:]?$/;
    return lines
        .slice(startIndex, endIndex >= 0 ? endIndex : undefined)
        .filter((line) => !metadataPattern.test(line))
        .join('\n');
}

/**
 * Fetches a WebClass message and extracts only the content needed by the home workspace.
 */
async function fetchMessageDetail(message) {
    try {
        const detailUrl = new URL(message?.url || '', window.location.origin);
        if (detailUrl.origin !== window.location.origin || !/\/messages\.php\/inbox\//i.test(detailUrl.pathname)) {
            throw new Error('Invalid message detail URL');
        }
        const response = await fetch(detailUrl.toString(), { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const subject = message?.subject || doc.querySelector('main h3, h3')?.textContent?.trim() || '';
        const attachmentLink = doc.querySelector('a[href*="/attachment/"]');
        return {
            subject,
            date: getMessageDetailValue(doc, /^日付[：:]?$/, subject) || message?.date || '',
            sender: getMessageDetailValue(doc, /^送信者[：:]?$/, subject) || message?.sender || '',
            course: getMessageDetailValue(doc, /^コース[：:]?$/, subject) || message?.course || '',
            recipient: getMessageDetailValue(doc, /^宛先[：:]?$/, subject),
            body: getMessageBodyText(doc, subject),
            attachment: attachmentLink?.textContent?.trim() || message?.attachment || '',
            attachmentUrl: attachmentLink ? new URL(attachmentLink.getAttribute('href'), detailUrl).toString() : message?.attachmentUrl || null
        };
    } catch (error) {
        uxDebugWarn('[Messages] message detail fetch failed', error);
        return { ...message, body: '', error: 'fetch_failed' };
    }
}

/**
 * 指定したメッセージを既読にする
 */
async function markMessagesAsRead(messageIds, messageForm) {
    const normalizedIds = Array.isArray(messageIds)
        ? Array.from(new Set(
            messageIds
                .map((id) => `${id ?? ''}`.trim())
                .filter(Boolean)
        ))
        : [];
    const action = messageForm?.action || '';

    if (!action || normalizedIds.length === 0) {
        uxDebugWarn('[Messages] 既読にするメッセージがありません');
        return false;
    }

    uxDebugLog('[Messages] 既読処理開始:', normalizedIds);

    try {
        const formData = new FormData();

        (messageForm.hiddenFields || []).forEach(({ name, value }) => {
            if (name) formData.append(name, value ?? '');
        });

        normalizedIds.forEach((id) => {
            formData.append(messageForm.idFieldName || 'id[]', id);
        });
        formData.append(
            messageForm.submitName || 'UNSET_UNREADFLAG',
            messageForm.submitValue ?? '1'
        );

        const response = await fetch(action, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        });

        if (response.ok) {
            uxDebugLog('[Messages] 既読処理成功');
            return true;
        } else {
            console.error('[Messages] 既読処理失敗:', response.status);
            return false;
        }
    } catch (error) {
        console.error('[Messages] 既読処理エラー:', error);
        return false;
    }
}
