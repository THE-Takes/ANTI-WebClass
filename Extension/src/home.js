// home.js
// Handles Home Page improvements: ToDo list, Message widget, Layout changes

// --- URL Check ---
// Only run on the home page (index.php)
const isHomePage = window.location.pathname.endsWith('/webclass/') ||
    window.location.pathname.includes('index.php');

if (!isHomePage) {
    console.log("WebClass UX Improver: Not home page, skipping home.js");
    // Exit silently without throwing error
} else {

    console.log("WebClass UX Improver: Home script loaded");

    // --- Configuration & State ---
    const STORAGE_KEY_TODO = 'webclass_todo_list'; // Legacy key (user edits) - keeping for custom todos if needed
    const STORAGE_KEY_ASSIGNMENTS = 'assignments'; // Scraped assignments
    const STORAGE_KEY_MESSAGES = 'webclass_messages'; // Messages cache

    // --- UI State (タブの開閉状態を保持) ---
    const uiState = {
        completedSectionOpen: false,
        farFutureSectionOpen: false,
        indefiniteSectionOpen: false
    };

    // --- UI Helpers ---
    function createCard(title, content, actionElement) {
        // side-block-outer wrapper (WebClassのネイティブスタイルに合わせる)
        const wrapper = document.createElement('div');
        wrapper.className = 'side-block-outer ux-embedded-card';
        wrapper.style.marginBottom = '1em';

        const card = document.createElement('div');
        card.className = 'side-block';

        // タイトル (side-block-title スタイル)
        const h4 = document.createElement('h4');
        h4.className = 'side-block-title';
        h4.textContent = title;
        card.appendChild(h4);

        // コンテンツ (side-block-content スタイル)
        const body = document.createElement('div');
        body.className = 'side-block-content';
        body.style.padding = '0'; // List items will have padding
        body.appendChild(content);
        card.appendChild(body);

        if (actionElement) {
            const footer = document.createElement('div');
            footer.className = 'ux-card-footer';
            footer.style.padding = '0.5em';
            footer.style.borderTop = '1px solid #efefef';
            footer.style.textAlign = 'right';
            footer.style.backgroundColor = '#fafafa';
            footer.appendChild(actionElement);
            card.appendChild(footer);
        }

        wrapper.appendChild(card);
        return wrapper;
    }

    // --- Data Logic ---

    async function loadAssignments() {
        const data = await chrome.storage.local.get([STORAGE_KEY_ASSIGNMENTS]);
        return data[STORAGE_KEY_ASSIGNMENTS] || [];
    }

    async function saveAssignments(assignments) {
        await chrome.storage.local.set({ [STORAGE_KEY_ASSIGNMENTS]: assignments });
    }

    // 単一の課題を更新するヘルパー
    async function updateAssignment(targetTodo, updates) {
        const currentAssignments = await loadAssignments();
        const identifier = targetTodo.url || targetTodo.fallbackUrl;

        const index = currentAssignments.findIndex(a => {
            if (!identifier) return false;
            if (a.url === identifier) return true;
            return a.fallbackUrl === identifier;
        });

        if (index !== -1) {
            // フィールドを更新
            currentAssignments[index] = { ...currentAssignments[index], ...updates };
            await saveAssignments(currentAssignments);
            console.log('Assignment updated:', currentAssignments[index]);
        } else {
            console.warn('Assignment not found for update:', targetTodo);
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
                console.log('[Messages] ページ内リンクから acs_ を取得:', match[1]);
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
     * メッセージ一覧ページをフェッチして解析
     */
    async function fetchMessages() {
        const acs = getAcsParameter();
        if (!acs) {
            console.warn('[Messages] acs_ パラメータが見つかりません。ページ内にリンクがありません。');
            return { messages: [], unreadCount: 0, totalCount: 0, formAction: null, error: 'acs_not_found' };
        }

        const messageUrl = `https://kulms.kanagawa-u.ac.jp/webclass/msg_editor.php?msgappmode=inbox&acs_=${acs}`;
        console.log('[Messages] メッセージを取得中:', messageUrl);

        try {
            const response = await fetch(messageUrl);
            if (!response.ok) {
                console.error('[Messages] HTTPエラー:', response.status);
                return { messages: [], unreadCount: 0, totalCount: 0, formAction: null };
            }

            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const messages = [];
            const rows = doc.querySelectorAll('#MsgListTable tbody tr');

            // フォームのaction URLを取得（既読処理用）
            const form = doc.querySelector('form[name="condition"]');
            const formAction = form ? form.getAttribute('action') : null;
            const numCboxes = doc.querySelector('input[name="num_cboxes"]')?.value || '0';

            rows.forEach((row, index) => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 6) return;

                // チェックボックスからメッセージIDを取得
                const checkbox = cells[0].querySelector('input[type="checkbox"]');
                const messageId = checkbox ? checkbox.value : null;

                // 差出人
                const senderCell = cells[1];
                const sender = senderCell.textContent.trim();

                // 件名
                const subjectCell = cells[3];
                const subjectLink = subjectCell.querySelector('a');
                const subject = subjectLink ? subjectLink.textContent.trim() : subjectCell.textContent.trim();
                const messageUrl = subjectLink ? subjectLink.href : null;

                // 日付
                const dateCell = cells[5];
                const date = dateCell.textContent.trim();

                // 未読判定（<b>タグで囲まれているかどうか）
                const isUnread = senderCell.querySelector('b') !== null;

                messages.push({
                    id: messageId,
                    sender: sender,
                    subject: subject,
                    date: date,
                    url: messageUrl,
                    isUnread: isUnread,
                    index: index
                });
            });

            const unreadCount = messages.filter(m => m.isUnread).length;
            console.log(`[Messages] 取得完了: 全${messages.length}件, 未読${unreadCount}件`);

            return {
                messages: messages,
                unreadCount: unreadCount,
                totalCount: messages.length,
                formAction: formAction,
                numCboxes: numCboxes,
                acs: acs
            };
        } catch (error) {
            console.error('[Messages] メッセージ取得エラー:', error);
            return { messages: [], unreadCount: 0, totalCount: 0, formAction: null };
        }
    }

    /**
     * 指定したメッセージを既読にする
     */
    async function markMessagesAsRead(messageIds, formAction, numCboxes, acs) {
        if (!formAction || messageIds.length === 0) {
            console.warn('[Messages] 既読にするメッセージがありません');
            return false;
        }

        console.log('[Messages] 既読処理開始:', messageIds);

        try {
            // FormDataを構築
            const formData = new FormData();

            // メッセージIDをチェックボックスとして追加
            messageIds.forEach((id, idx) => {
                formData.append(`id[${idx}]`, id);
            });

            formData.append('num_cboxes', messageIds.length.toString());
            formData.append('UNSET_UNREADFLAG', '既読にする');

            const response = await fetch(formAction, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                console.log('[Messages] 既読処理成功');
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

    /**
     * メッセージウインドウをレンダリング
     */
    function renderMessageWindow(container, messageData) {
        container.innerHTML = '';

        const { messages, unreadCount, formAction, numCboxes, acs, error } = messageData;

        // エラー時の表示
        if (error === 'acs_not_found') {
            const errDiv = document.createElement('div');
            errDiv.style.padding = '20px';
            errDiv.style.textAlign = 'center';
            errDiv.style.color = '#856404';
            errDiv.style.backgroundColor = '#fff3cd';
            errDiv.style.borderRadius = '4px';
            errDiv.innerHTML = '⚠️ セッション情報が取得できませんでした。<br><small>ページを再読み込みしてください。</small>';
            container.appendChild(errDiv);
            return;
        }

        if (messages.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'メッセージがありません';
            empty.style.padding = '20px';
            empty.style.textAlign = 'center';
            empty.style.color = '#666';
            container.appendChild(empty);
            return;
        }

        // 未読メッセージ OR 今既読にしたメッセージを表示
        const displayMessages = messages.filter(m => m.isUnread || m.justRead);

        if (displayMessages.length === 0) {
            const allRead = document.createElement('div');
            allRead.textContent = '✓ 未読メッセージはありません';
            allRead.style.padding = '20px';
            allRead.style.textAlign = 'center';
            allRead.style.color = '#28a745';
            container.appendChild(allRead);
            return;
        }

        // メッセージリスト
        const ul = document.createElement('ul');
        ul.style.listStyle = 'none';
        ul.style.margin = '0';
        ul.style.padding = '0';

        displayMessages.forEach(msg => {
            const li = document.createElement('li');
            li.style.padding = '10px 15px';
            li.style.borderBottom = '1px solid #eee';
            li.style.cursor = 'pointer';
            li.style.transition = 'background-color 0.2s';

            // 背景色: 未読=黄色、今既読にした=緑
            if (msg.justRead) {
                li.style.backgroundColor = '#d4edda'; // 緑背景（既読にした）
                li.onmouseenter = () => { li.style.backgroundColor = '#c3e6cb'; };
                li.onmouseleave = () => { li.style.backgroundColor = '#d4edda'; };
            } else {
                li.style.backgroundColor = '#fff8e1'; // 黄色背景（未読）
                li.onmouseenter = () => { li.style.backgroundColor = '#fff3cd'; };
                li.onmouseleave = () => { li.style.backgroundColor = '#fff8e1'; };
            }

            // 差出人
            const senderLine = document.createElement('div');
            senderLine.style.fontSize = '0.8em';
            senderLine.style.color = '#666';
            senderLine.style.marginBottom = '4px';
            senderLine.textContent = msg.sender;
            li.appendChild(senderLine);

            // 件名
            const subjectLine = document.createElement('div');
            subjectLine.style.fontWeight = msg.justRead ? 'normal' : 'bold'; // 既読は通常フォント
            subjectLine.style.color = '#212529';
            subjectLine.style.overflow = 'hidden';
            subjectLine.style.textOverflow = 'ellipsis';
            subjectLine.style.whiteSpace = 'nowrap';
            subjectLine.textContent = msg.justRead ? `✓ ${msg.subject}` : msg.subject;
            li.appendChild(subjectLine);

            // 日付
            const dateLine = document.createElement('div');
            dateLine.style.fontSize = '0.75em';
            dateLine.style.color = '#999';
            dateLine.style.marginTop = '4px';
            dateLine.textContent = msg.date;
            li.appendChild(dateLine);

            // クリックでメッセージを開く
            li.onclick = () => {
                if (msg.url) {
                    window.open(msg.url, 'msgeditor', 'width=800,height=600,scrollbars=yes,resizable=yes');
                }
            };

            ul.appendChild(li);
        });

        container.appendChild(ul);
    }

    function sortTodos(todos) {
        return todos.sort((a, b) => {
            // 1. 未完了を上に
            if (a.isCompleted !== b.isCompleted) {
                return a.isCompleted ? 1 : -1;
            }

            // 2. 期限が近い順 (期限なしは後ろ)
            const dateA = a.deadline ? new Date(a.deadline) : new Date(8640000000000000);
            const dateB = b.deadline ? new Date(b.deadline) : new Date(8640000000000000);

            if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
            if (isNaN(dateA.getTime())) return 1;
            if (isNaN(dateB.getTime())) return -1;

            return dateA - dateB;
        });
    }

    function renderToDoList(assignments, container) {
        container.innerHTML = '';

        // 1. 分類ロジック
        const activeAssignments = assignments.filter(a => !a.isCompleted);
        const completedAssignments = assignments.filter(a => a.isCompleted);

        const normal = [];
        const farFuture = [];
        const indefinite = [];

        const now = new Date();
        const oneMonthLater = new Date();
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

        activeAssignments.forEach(todo => {
            if (!todo.deadline || todo.deadline === '期限なし') {
                indefinite.push(todo);
            } else {
                const d = new Date(todo.deadline);
                if (isNaN(d.getTime())) {
                    // 日付パース失敗 -> 期限なし扱い
                    indefinite.push(todo);
                } else if (d > oneMonthLater) {
                    farFuture.push(todo);
                } else {
                    normal.push(todo);
                }
            }
        });

        // 各グループをソート
        const sortedNormal = sortTodos(normal);
        const sortedFarFuture = sortTodos(farFuture);
        const sortedIndefinite = sortTodos(indefinite);

        // 2. 表示ロジック

        if (assignments.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = '課題データがありません。「更新」ボタンを押してください。';
            empty.style.padding = '20px';
            empty.style.textAlign = 'center';
            empty.style.color = '#666';
            container.appendChild(empty);
            return;
        }

        // アイテム作成関数
        const createItem = (todo) => {
            const li = document.createElement('li');
            li.style.padding = '10px 15px';
            li.style.borderBottom = '1px solid #eee';
            li.style.display = 'flex';
            li.style.alignItems = 'center';
            li.style.gap = '10px';
            li.style.backgroundColor = '#fff'; // デフォルト背景

            // 期限に基づいて背景色を設定 (通常リストのみ、または全リストで適用？ -> 全リストで適用しても良いが、期限なしは白)
            if (!todo.isCompleted && todo.deadline && todo.deadline !== '期限なし') {
                const deadlineDate = new Date(todo.deadline);
                const hoursRemaining = (deadlineDate - new Date()) / (1000 * 60 * 60);

                if (hoursRemaining <= 48) {
                    li.style.backgroundColor = '#ffebee'; // 赤
                } else if (hoursRemaining <= 168) {
                    li.style.backgroundColor = '#fff9c4'; // 黄
                }
            }

            // チェックボックス
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = todo.isCompleted || false;
            checkbox.style.width = '18px';
            checkbox.style.height = '18px';
            checkbox.style.cursor = 'pointer';

            checkbox.onclick = async (e) => {
                e.stopPropagation();
                todo.isCompleted = checkbox.checked;

                // ストレージに保存
                const currentAssignments = await loadAssignments();
                const identifier = todo.url || todo.fallbackUrl;
                const index = currentAssignments.findIndex(a => {
                    if (!identifier) return false;
                    if (a.url === identifier) return true;
                    return a.fallbackUrl === identifier;
                });
                if (index !== -1) {
                    currentAssignments[index].isCompleted = todo.isCompleted;
                    await saveAssignments(currentAssignments);
                }

                // UI再描画
                renderToDoList(currentAssignments, container);
            };

            li.appendChild(checkbox);

            // コンテンツ
            const content = document.createElement('div');
            content.style.flex = '1';

            if (todo.isCompleted) {
                li.style.opacity = '0.6';
                content.style.textDecoration = 'line-through';
            }

            // コース名
            const titleLine = document.createElement('div');
            titleLine.style.fontSize = '0.75em';
            titleLine.style.color = '#666';

            if (todo.category && todo.category !== 'Unknown') {
                const badge = document.createElement('span');
                badge.textContent = todo.category;
                badge.style.fontSize = '0.75em';
                badge.style.padding = '2px 6px';
                badge.style.borderRadius = '4px';
                badge.style.backgroundColor = '#e9ecef';
                badge.style.color = '#495057';
                badge.style.marginRight = '8px';
                titleLine.appendChild(badge);
            }

            titleLine.appendChild(document.createTextNode(todo.course || 'Unknown Course'));
            content.appendChild(titleLine);

            // 課題名 (編集可能)
            const assignmentLine = document.createElement('div');
            assignmentLine.style.marginTop = '4px';

            const titleInput = document.createElement('input');
            titleInput.type = 'text';
            titleInput.value = todo.title;
            titleInput.className = 'ux-todo-input-title'; // CSSでスタイル調整推奨
            // インラインスタイルで最低限の見た目を整える
            titleInput.style.width = '100%';
            titleInput.style.border = '1px solid transparent';
            titleInput.style.borderRadius = '3px';
            titleInput.style.padding = '2px 4px';
            titleInput.style.fontSize = '1.02em';
            titleInput.style.fontWeight = 'bold';
            titleInput.style.color = '#212529';
            titleInput.style.backgroundColor = 'transparent';
            titleInput.style.transition = 'border-color 0.2s, background-color 0.2s';

            titleInput.onfocus = () => {
                titleInput.style.borderColor = '#80bdff';
                titleInput.style.backgroundColor = '#fff';
                titleInput.style.outline = 'none';
            };
            titleInput.onblur = () => {
                titleInput.style.borderColor = 'transparent';
                titleInput.style.backgroundColor = 'transparent';
            };

            // タイトル変更時の保存処理
            titleInput.onchange = async () => {
                const newVal = titleInput.value.trim();
                if (!newVal) {
                    // 空の場合は元に戻すなどの処理が必要かも？ここではそのまま保存
                }
                await updateAssignment(todo, { title: newVal });
            };

            assignmentLine.appendChild(titleInput);
            content.appendChild(assignmentLine);

            // 期限 (編集可能)
            const deadlineLine = document.createElement('div');
            deadlineLine.style.fontSize = '0.85em';
            deadlineLine.style.color = '#666';
            deadlineLine.style.marginTop = '4px';
            deadlineLine.style.display = 'flex';
            deadlineLine.style.alignItems = 'center';
            deadlineLine.style.gap = '5px';
            const deadlineLabel = document.createElement('span');
            deadlineLabel.textContent = '期限: ';
            deadlineLine.appendChild(deadlineLabel);

            // 日付入力 (Flatpickr - Date Only)
            const dateOnlyInput = document.createElement('input');
            dateOnlyInput.type = 'text';
            dateOnlyInput.className = 'ux-todo-input-date';
            dateOnlyInput.style.fontSize = '0.9em';
            dateOnlyInput.style.border = '1px solid #ddd';
            dateOnlyInput.style.borderRadius = '3px';
            dateOnlyInput.style.padding = '1px 3px';
            dateOnlyInput.style.color = '#555';
            dateOnlyInput.style.width = '90px';
            dateOnlyInput.style.textAlign = 'center';
            dateOnlyInput.placeholder = '日付';

            // 時間入力 (MobileSelect - Time Only)
            const timeOnlyInput = document.createElement('input');
            timeOnlyInput.type = 'text';
            timeOnlyInput.className = 'ux-todo-input-time';
            timeOnlyInput.style.fontSize = '0.9em';
            timeOnlyInput.style.border = '1px solid #ddd';
            timeOnlyInput.style.borderRadius = '3px';
            timeOnlyInput.style.padding = '1px 3px';
            timeOnlyInput.style.color = '#555';
            timeOnlyInput.style.width = '70px';
            timeOnlyInput.style.textAlign = 'center';
            timeOnlyInput.placeholder = '時間';
            timeOnlyInput.readOnly = true; // Prevent keyboard input
            timeOnlyInput.style.cursor = 'pointer';
            const timeInputId = 'time-input-' + Math.random().toString(36).substr(2, 9);
            timeOnlyInput.id = timeInputId;

            // 初期値パース
            let currentDeadline = null;
            if (todo.deadline && todo.deadline !== '期限なし') {
                const d = new Date(todo.deadline);
                if (!isNaN(d.getTime())) {
                    currentDeadline = d;
                    dateOnlyInput.value = d.toLocaleDateString(); // YYYY/MM/DD or similar

                    // Format time for display: AM/PM hh:mm
                    let hours = d.getHours();
                    const minutes = d.getMinutes();
                    const ampm = hours >= 12 ? '午後' : '午前';
                    hours = hours % 12;
                    hours = hours ? hours : 12; // the hour '0' should be '12'
                    const strTime = ampm + ' ' + hours + ':' + (minutes < 10 ? '0' + minutes : minutes);
                    timeOnlyInput.value = strTime;
                }
            }

            // 保存処理ヘルパー
            const saveCombinedDeadline = async () => {
                const dateStr = dateOnlyInput.value; // YYYY/MM/DD
                const timeStr = timeOnlyInput.value; // 午後 8:00

                if (!dateStr) {
                    await updateAssignment(todo, { deadline: '期限なし' });
                    return;
                }

                // 日付のみで時間が未設定の場合はデフォルト時間を設定するか、日付のみで保存するか
                // ここでは時間を必須とせず、時間がなければ 23:59 扱いにするなどのロジックも考えられるが
                // シンプルに時間がなければ 00:00 とする

                let finalDate = new Date(dateStr);
                if (isNaN(finalDate.getTime())) {
                    await updateAssignment(todo, { deadline: '期限なし' });
                    return;
                }

                if (timeStr) {
                    // Parse "午後 8:00"
                    const parts = timeStr.match(/(午前|午後)\s(\d+):(\d+)/);
                    if (parts) {
                        let h = parseInt(parts[2]);
                        const m = parseInt(parts[3]);
                        if (parts[1] === '午後' && h < 12) h += 12;
                        if (parts[1] === '午前' && h === 12) h = 0;
                        finalDate.setHours(h, m);
                    }
                } else {
                    // 時間未設定時はとりあえずそのまま（00:00）
                    finalDate.setHours(0, 0);
                }

                const newDeadlineStr = finalDate.toLocaleString();
                if (todo.deadline !== newDeadlineStr) {
                    await updateAssignment(todo, { deadline: newDeadlineStr });
                }
            };

            // Flatpickr (Date)
            try {
                if (typeof flatpickr !== 'undefined') {
                    flatpickr(dateOnlyInput, {
                        locale: 'ja',
                        dateFormat: "Y/m/d",
                        disableMobile: true,
                        defaultDate: currentDeadline,
                        onClose: async (selectedDates, dateStr, instance) => {
                            await saveCombinedDeadline();
                        }
                    });
                } else {
                    console.warn('WebClass UX: flatpickr is not defined');
                }
            } catch (e) {
                console.error('WebClass UX: Failed to init flatpickr', e);
            }

            // MobileSelect (Time)
            // Generate wheels
            const hoursArr = [];
            for (let i = 1; i <= 12; i++) hoursArr.push(i.toString());
            const minutesArr = [];
            for (let i = 0; i < 60; i++) minutesArr.push(i < 10 ? '0' + i : i.toString());

            // Wrap in setTimeout to ensure element is in DOM
            setTimeout(() => {
                // Check if element still exists (in case of rapid re-renders)
                if (!document.getElementById(timeInputId)) return;

                try {
                    if (typeof MobileSelect === 'undefined') {
                        console.warn('WebClass UX: MobileSelect is not defined');
                        return;
                    }

                    const ms = new MobileSelect({
                        trigger: '#' + timeInputId,
                        title: '時刻',
                        wheels: [
                            { data: ['午前', '午後'] },
                            { data: hoursArr },
                            { data: minutesArr }
                        ],
                        position: [1, 0, 0], // Default position
                        transitionEnd: function (indexArr, data) {
                            // console.log(data);
                        },
                        callback: async function (indexArr, data) {
                            // data = ["午後", "8", "00"]
                            const timeString = `${data[0]} ${data[1]}:${data[2]}`;
                            timeOnlyInput.value = timeString;
                            await saveCombinedDeadline();
                        }
                    });

                    // 初期位置設定 (MobileSelectはinit時にpositionを指定するが、動的に計算が必要)
                    if (currentDeadline) {
                        const h = currentDeadline.getHours();
                        const m = currentDeadline.getMinutes();
                        const isPm = h >= 12;
                        const h12 = h % 12 || 12;

                        // Index calculation
                        // Wheel 0: 0=AM, 1=PM
                        // Wheel 1: h12 - 1 (since 1 is index 0)
                        // Wheel 2: m
                        ms.locatePosition(0, isPm ? 1 : 0);
                        ms.locatePosition(1, h12 - 1);
                        ms.locatePosition(2, m);
                    }
                } catch (e) {
                    console.error('WebClass UX: Failed to init MobileSelect', e);
                }
            }, 0);

            deadlineLine.appendChild(dateOnlyInput);
            deadlineLine.appendChild(timeOnlyInput);
            content.appendChild(deadlineLine);

            li.appendChild(content);
            return li;
        };

        // リスト作成ヘルパー
        const createList = (todos) => {
            const ul = document.createElement('ul');
            ul.style.listStyle = 'none';
            ul.style.margin = '0';
            ul.style.padding = '0';
            todos.forEach(t => ul.appendChild(createItem(t)));
            return ul;
        };

        // 折りたたみセクション作成ヘルパー
        // stateKey: uiStateのどのキーで開閉状態を保持するか
        const createCollapsible = (title, todos, defaultOpen = false, stateKey = null) => {
            if (todos.length === 0) return null;

            // stateKeyが指定されている場合は、保存された状態を使用
            const isOpen = stateKey && uiState[stateKey] !== undefined ? uiState[stateKey] : defaultOpen;

            const wrapper = document.createElement('div');
            wrapper.style.marginTop = '15px';
            wrapper.style.border = '1px solid #ddd';
            wrapper.style.borderRadius = '4px';
            // wrapper.style.overflow = 'hidden'; // Removed to allow sticky positioning

            const header = document.createElement('div');
            header.style.padding = '10px 15px';
            header.style.backgroundColor = '#f8f9fa';
            header.style.cursor = 'pointer';
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.alignItems = 'center';
            header.style.userSelect = 'none';
            // Sticky Header Styles
            header.style.position = 'sticky';
            header.style.top = '0';
            header.style.zIndex = '10';
            header.style.borderBottom = '1px solid #ddd';
            header.style.borderTopLeftRadius = '4px';
            header.style.borderTopRightRadius = '4px';

            const titleSpan = document.createElement('span');
            titleSpan.style.fontSize = '0.9em';
            titleSpan.style.fontWeight = 'bold';
            titleSpan.style.color = '#555';
            titleSpan.textContent = `${title} (${todos.length})`;
            header.appendChild(titleSpan);

            const icon = document.createElement('span');
            icon.textContent = isOpen ? '▼' : '▶';
            icon.style.fontSize = '0.8em';
            icon.style.color = '#777';
            header.appendChild(icon);

            const content = document.createElement('div');
            content.style.display = isOpen ? 'block' : 'none';
            content.style.borderTop = '1px solid #eee';
            content.appendChild(createList(todos));

            header.onclick = () => {
                const currentlyOpen = content.style.display !== 'none';
                content.style.display = currentlyOpen ? 'none' : 'block';
                icon.textContent = currentlyOpen ? '▶' : '▼';
                // 状態を保存
                if (stateKey) {
                    uiState[stateKey] = !currentlyOpen;
                }
            };

            wrapper.appendChild(header);
            wrapper.appendChild(content);
            return wrapper;
        };

        // --- レンダリング実行 ---

        // 1. 通常の課題 (常に表示)
        if (sortedNormal.length > 0) {
            container.appendChild(createList(sortedNormal));
        }

        // 2. 1カ月以上先の課題 (折りたたみ・デフォルト閉)
        const farFutureSection = createCollapsible('1カ月以上先の課題', sortedFarFuture, false, 'farFutureSectionOpen');
        if (farFutureSection) container.appendChild(farFutureSection);

        // 3. 期限なしの課題 (折りたたみ・デフォルト閉)
        const indefiniteSection = createCollapsible('期限なしの課題', sortedIndefinite, false, 'indefiniteSectionOpen');
        if (indefiniteSection) container.appendChild(indefiniteSection);

        // 4. 完了済みの課題 (既存のトグルスタイル)
        if (completedAssignments.length > 0) {
            // 保存された状態を使用
            const isCompletedOpen = uiState.completedSectionOpen;

            const toggle = document.createElement('div');
            toggle.textContent = isCompletedOpen ? '完了済みの課題を隠す' : `完了済みの課題を表示 (${completedAssignments.length})`;
            toggle.style.padding = '10px 15px';
            toggle.style.fontSize = '0.85em';
            toggle.style.color = '#0056b3';
            toggle.style.cursor = 'pointer';
            toggle.style.textAlign = 'center';
            toggle.style.backgroundColor = '#f8f9fa';
            toggle.style.marginTop = '15px';
            toggle.style.borderRadius = '4px';

            const completedContainer = document.createElement('div');
            completedContainer.style.display = isCompletedOpen ? 'block' : 'none';
            completedContainer.style.marginTop = '5px';
            completedContainer.appendChild(createList(completedAssignments));

            toggle.onclick = () => {
                const isHidden = completedContainer.style.display === 'none';
                completedContainer.style.display = isHidden ? 'block' : 'none';
                toggle.textContent = isHidden ? '完了済みの課題を隠す' : `完了済みの課題を表示 (${completedAssignments.length})`;
                // 状態を保存
                uiState.completedSectionOpen = isHidden;
            };

            container.appendChild(toggle);
            container.appendChild(completedContainer);
        }
    }

    async function initHome() {
        // 既存のレイアウトを変更して右側にカラムを追加
        const mainRow = document.querySelector('.container > .row');
        if (!mainRow) {
            console.warn('WebClass UX: メインレイアウトが見つかりません');
            return;
        }

        // 既存の右カラム（col-sm-9）はそのまま維持

        // rowをflexレイアウトに変更
        mainRow.classList.add('ux-flex-row');

        // 新しい右サイドバーカラムを作成
        const sidebarColumn = document.createElement('div');
        sidebarColumn.className = 'hidden-xs';
        sidebarColumn.id = 'ux-sidebar-column';

        // ダッシュボードコンテナを作成（side-blockスタイル）
        const dashboard = document.createElement('div');
        dashboard.id = 'ux-dashboard';

        sidebarColumn.appendChild(dashboard);

        // メインレイアウトに追加
        mainRow.appendChild(sidebarColumn);

        // --- Smart ToDo List Card ---
        const todoContent = document.createElement('div');
        todoContent.style.minHeight = '100px';
        todoContent.style.maxHeight = '400px';
        todoContent.style.overflowY = 'auto';

        const debugLog = document.createElement('div');
        debugLog.style.fontSize = '0.7em';
        debugLog.style.color = '#999';
        debugLog.style.marginTop = '5px';
        debugLog.style.display = 'none'; // Hide by default

        const log = (msg) => {
            console.log(msg);
            debugLog.textContent = msg;
            debugLog.style.display = 'block';
        };

        const refreshBtn = document.createElement('button');
        refreshBtn.textContent = '課題を更新 (全コース取得)';
        refreshBtn.className = 'btn btn-primary btn-sm'; // Use WebClass/Bootstrap class if available
        // Fallback styles
        refreshBtn.style.backgroundColor = '#0056b3';
        refreshBtn.style.color = 'white';
        refreshBtn.style.border = 'none';
        refreshBtn.style.padding = '5px 10px';
        refreshBtn.style.borderRadius = '4px';
        refreshBtn.style.cursor = 'pointer';

        refreshBtn.onclick = async () => {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '更新中...';
            log('開始: コース一覧を取得中...');

            try {
                if (window.WebClassScraper) {
                    let assignments = await window.WebClassScraper.updateAllAssignments();
                    renderToDoList(assignments, todoContent);
                    log(`完了: 合計 ${assignments.length} 件の課題を取得しました。`);
                    
                    // Microsoft To Doに同期（有効な場合のみ）
                    // Mtodoで完了になった課題はStodoにも反映される
                    const completedFromMtodo = await syncToMicrosoftTodo(assignments, log);
                    
                    // Mtodoで完了が見つかった場合、UIを更新
                    if (completedFromMtodo && completedFromMtodo.length > 0) {
                        // ストレージから最新のデータを再読み込み
                        assignments = await loadAssignments();
                        renderToDoList(assignments, todoContent);
                    }
                } else {
                    log('エラー: Scraperが見つかりません。ページを再読み込みしてください。');
                }
            } catch (e) {
                console.error(e);
                log('エラーが発生しました: ' + e.message);
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '課題を更新 (全コース取得)';
            }
        };
        
        /**
         * Microsoft To Doに課題を同期（双方向完了状態同期対応）
         * @returns {Array} Mtodo側で完了になっている課題のsyncKey配列
         */
        async function syncToMicrosoftTodo(assignments, logFn = console.log) {
            // 設定をチェック
            const settings = await new Promise(resolve => {
                chrome.storage.local.get({
                    msTodoEnabled: false,
                    msSelectedList: '',
                    msAccessToken: null,
                }, resolve);
            });
            
            if (!settings.msTodoEnabled || !settings.msSelectedList || !settings.msAccessToken) {
                console.log('[WebClass UX] MS To Do sync skipped (not configured)');
                return [];
            }
            
            logFn('MS To Do に同期中...');
            
            try {
                const response = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage({
                        type: 'MS_TODO_SYNC',
                        assignments: assignments,
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(response);
                        }
                    });
                });
                
                if (response && response.success) {
                    const results = response.results;
                    let msg = `MS To Do: ${results.success.length}件同期完了`;
                    
                    // Mtodoで完了にされたタスクがある場合
                    if (results.completedFromMtodo && results.completedFromMtodo.length > 0) {
                        msg += ` (${results.completedFromMtodo.length}件がMtodoで完了済み)`;
                        
                        // Stodoのストレージを更新
                        await updateCompletedFromMtodo(results.completedFromMtodo);
                    }
                    
                    logFn(msg);
                    return results.completedFromMtodo || [];
                } else {
                    console.warn('[WebClass UX] MS To Do sync failed:', response?.error);
                    return [];
                }
            } catch (error) {
                console.error('[WebClass UX] MS To Do sync error:', error);
                return [];
            }
        }
        
        /**
         * Mtodoで完了になった課題をStodoのストレージでも完了にする
         */
        async function updateCompletedFromMtodo(completedSyncKeys) {
            if (!completedSyncKeys || completedSyncKeys.length === 0) return;
            
            const currentAssignments = await loadAssignments();
            let updated = false;
            
            currentAssignments.forEach(assignment => {
                const syncKey = `${assignment.course || 'unknown'}_${assignment.title}`;
                if (completedSyncKeys.includes(syncKey) && !assignment.isCompleted) {
                    assignment.isCompleted = true;
                    updated = true;
                    console.log('[WebClass UX] Marked as completed from Mtodo:', assignment.title);
                }
            });
            
            if (updated) {
                await saveAssignments(currentAssignments);
            }
        }

        const actionContainer = document.createElement('div');
        actionContainer.appendChild(refreshBtn);
        actionContainer.appendChild(debugLog);

        // --- Debug Buttons (Dev Only) ---
        const debugContainer = document.createElement('div');
        debugContainer.style.marginTop = '10px';
        debugContainer.style.paddingTop = '10px';
        debugContainer.style.borderTop = '1px dashed #ccc';
        debugContainer.style.display = 'flex';
        debugContainer.style.gap = '5px';
        debugContainer.style.flexWrap = 'wrap';

        const createDebugBtn = (label, type) => {
            const btn = document.createElement('button');
            btn.textContent = `+ ${label}`;
            btn.style.fontSize = '0.75em';
            btn.style.padding = '2px 5px';
            btn.style.cursor = 'pointer';
            btn.onclick = async () => {
                const current = await loadAssignments();
                const now = new Date();
                let deadline = null;

                if (type === 'normal') {
                    // 1週間後
                    const d = new Date(now);
                    d.setDate(d.getDate() + 7);
                    deadline = d.toLocaleString();
                } else if (type === 'far') {
                    // 2ヶ月後
                    const d = new Date(now);
                    d.setMonth(d.getMonth() + 2);
                    deadline = d.toLocaleString();
                } else {
                    // 期限なし
                    deadline = '期限なし';
                }

                const dummy = {
                    title: `[devdev] Test Task ${Date.now().toString().slice(-4)}`,
                    course: '[devdev] Debug Course',
                    deadline: deadline,
                    url: `debug://${Date.now()}`,
                    isCompleted: false,
                    category: 'Debug'
                };

                current.push(dummy);
                await saveAssignments(current);
                renderToDoList(current, todoContent);
            };
            return btn;
        };

        debugContainer.appendChild(createDebugBtn('通常', 'normal'));
        debugContainer.appendChild(createDebugBtn('1カ月以上', 'far'));
        debugContainer.appendChild(createDebugBtn('期限なし', 'indefinite'));

        actionContainer.appendChild(debugContainer);

        const todoCard = createCard('スマートToDoリスト', todoContent, actionContainer);
        dashboard.appendChild(todoCard);

        // --- Message Window Card ---
        const messageContent = document.createElement('div');
        messageContent.style.minHeight = '60px';
        messageContent.style.maxHeight = '300px';
        messageContent.style.overflowY = 'auto';

        // ローディング表示
        const loadingMsg = document.createElement('div');
        loadingMsg.textContent = 'メッセージを読み込み中...';
        loadingMsg.style.padding = '20px';
        loadingMsg.style.textAlign = 'center';
        loadingMsg.style.color = '#666';
        messageContent.appendChild(loadingMsg);

        // メッセージデータを保持
        let currentMessageData = null;

        // アクションボタン
        const messageActionContainer = document.createElement('div');
        messageActionContainer.style.display = 'flex';
        messageActionContainer.style.gap = '10px';
        messageActionContainer.style.alignItems = 'center';

        const markAllReadBtn = document.createElement('button');
        markAllReadBtn.textContent = '全て既読にする';
        markAllReadBtn.style.backgroundColor = '#28a745';
        markAllReadBtn.style.color = 'white';
        markAllReadBtn.style.border = 'none';
        markAllReadBtn.style.padding = '5px 10px';
        markAllReadBtn.style.borderRadius = '4px';
        markAllReadBtn.style.cursor = 'pointer';
        markAllReadBtn.style.fontSize = '0.85em';

        markAllReadBtn.onclick = async () => {
            if (!currentMessageData || currentMessageData.messages.length === 0) {
                return;
            }

            const unreadMessages = currentMessageData.messages.filter(m => m.isUnread);
            if (unreadMessages.length === 0) {
                alert('未読メッセージはありません');
                return;
            }

            markAllReadBtn.disabled = true;
            markAllReadBtn.textContent = '処理中...';

            const unreadIds = unreadMessages.map(m => m.id).filter(id => id);
            const success = await markMessagesAsRead(
                unreadIds,
                currentMessageData.formAction,
                currentMessageData.numCboxes,
                currentMessageData.acs
            );

            if (success) {
                // ローカルで既読状態を更新（再取得せずに緑背景で表示を維持）
                currentMessageData.messages.forEach(m => {
                    if (m.isUnread) {
                        m.isUnread = false;
                        m.justRead = true; // 今既読にしたフラグ
                    }
                });
                currentMessageData.unreadCount = 0;
                renderMessageWindow(messageContent, currentMessageData);
                updateUnreadBadge();
            } else {
                alert('既読処理に失敗しました');
            }

            markAllReadBtn.disabled = false;
            markAllReadBtn.textContent = '全て既読にする';
        };

        const refreshMsgBtn = document.createElement('button');
        refreshMsgBtn.textContent = '更新';
        refreshMsgBtn.style.backgroundColor = '#6c757d';
        refreshMsgBtn.style.color = 'white';
        refreshMsgBtn.style.border = 'none';
        refreshMsgBtn.style.padding = '5px 10px';
        refreshMsgBtn.style.borderRadius = '4px';
        refreshMsgBtn.style.cursor = 'pointer';
        refreshMsgBtn.style.fontSize = '0.85em';

        refreshMsgBtn.onclick = async () => {
            refreshMsgBtn.disabled = true;
            refreshMsgBtn.textContent = '更新中...';
            messageContent.innerHTML = '';
            const loading = document.createElement('div');
            loading.textContent = 'メッセージを読み込み中...';
            loading.style.padding = '20px';
            loading.style.textAlign = 'center';
            loading.style.color = '#666';
            messageContent.appendChild(loading);

            currentMessageData = await fetchMessages();
            renderMessageWindow(messageContent, currentMessageData);
            updateUnreadBadge();

            refreshMsgBtn.disabled = false;
            refreshMsgBtn.textContent = '更新';
        };

        // 未読バッジ
        const unreadBadge = document.createElement('span');
        unreadBadge.style.backgroundColor = '#dc3545';
        unreadBadge.style.color = 'white';
        unreadBadge.style.padding = '2px 8px';
        unreadBadge.style.borderRadius = '10px';
        unreadBadge.style.fontSize = '0.8em';
        unreadBadge.style.marginLeft = 'auto';
        unreadBadge.style.display = 'none';

        const updateUnreadBadge = () => {
            if (currentMessageData && currentMessageData.unreadCount > 0) {
                unreadBadge.textContent = `未読 ${currentMessageData.unreadCount}`;
                unreadBadge.style.display = 'inline';
            } else {
                unreadBadge.style.display = 'none';
            }
        };

        messageActionContainer.appendChild(markAllReadBtn);
        messageActionContainer.appendChild(refreshMsgBtn);
        messageActionContainer.appendChild(unreadBadge);

        // --- Debug Button for Messages ---
        const msgDebugContainer = document.createElement('div');
        msgDebugContainer.style.marginTop = '10px';
        msgDebugContainer.style.paddingTop = '10px';
        msgDebugContainer.style.borderTop = '1px dashed #ccc';
        msgDebugContainer.style.display = 'flex';
        msgDebugContainer.style.gap = '5px';
        msgDebugContainer.style.flexWrap = 'wrap';

        const addDummyMsgBtn = document.createElement('button');
        addDummyMsgBtn.textContent = '+ ダミー未読';
        addDummyMsgBtn.style.fontSize = '0.75em';
        addDummyMsgBtn.style.padding = '2px 5px';
        addDummyMsgBtn.style.cursor = 'pointer';
        addDummyMsgBtn.onclick = () => {
            if (!currentMessageData) {
                currentMessageData = {
                    messages: [],
                    unreadCount: 0,
                    totalCount: 0,
                    formAction: null,
                    numCboxes: '0',
                    acs: ''
                };
            }

            const dummyId = 'debug_' + Date.now().toString(36);
            const dummyMsg = {
                id: dummyId,
                sender: '[DEBUG] テスト送信者',
                subject: `[DEBUG] テストメッセージ ${Date.now().toString().slice(-4)}`,
                date: new Date().toLocaleString('ja-JP', { 
                    year: '2-digit', 
                    month: '2-digit', 
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                }).replace(/\//g, '/'),
                url: null,
                isUnread: true,
                index: currentMessageData.messages.length
            };

            currentMessageData.messages.unshift(dummyMsg);
            currentMessageData.unreadCount++;
            currentMessageData.totalCount++;

            renderMessageWindow(messageContent, currentMessageData);
            updateUnreadBadge();
        };

        const clearDummyMsgBtn = document.createElement('button');
        clearDummyMsgBtn.textContent = 'ダミー削除';
        clearDummyMsgBtn.style.fontSize = '0.75em';
        clearDummyMsgBtn.style.padding = '2px 5px';
        clearDummyMsgBtn.style.cursor = 'pointer';
        clearDummyMsgBtn.onclick = () => {
            if (!currentMessageData) return;

            // debug_ で始まるIDのメッセージを削除
            currentMessageData.messages = currentMessageData.messages.filter(m => !m.id?.startsWith('debug_'));
            currentMessageData.unreadCount = currentMessageData.messages.filter(m => m.isUnread).length;
            currentMessageData.totalCount = currentMessageData.messages.length;

            renderMessageWindow(messageContent, currentMessageData);
            updateUnreadBadge();
        };

        msgDebugContainer.appendChild(addDummyMsgBtn);
        msgDebugContainer.appendChild(clearDummyMsgBtn);
        messageActionContainer.appendChild(msgDebugContainer);

        const messageCard = createCard('メッセージ', messageContent, messageActionContainer);
        dashboard.appendChild(messageCard);

        // Load initial data
        const assignments = await loadAssignments();
        renderToDoList(assignments, todoContent);

        // Load messages
        currentMessageData = await fetchMessages();
        renderMessageWindow(messageContent, currentMessageData);
        updateUnreadBadge();
    }

    // Run
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHome);
    } else {
        initHome();
    }

} // End of else block (home page only)
