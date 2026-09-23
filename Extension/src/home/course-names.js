// home/course-names.js
// Course-name editing, shortening, and timetable color application.

async function openCourseNameEditor() {
    uxDebugLog('[WebClass UX] openCourseNameEditor: 関数開始');

    // 既存のモーダルがあれば削除
    const existingModal = document.getElementById('ux-course-name-modal');
    if (existingModal) {
        existingModal.remove();
    }

    // Scraperからカスタム名を読み込む
    uxDebugLog('[WebClass UX] openCourseNameEditor: カスタム名を読み込み中...');
    const customNames = await window.WebClassScraper.loadCustomCourseNames();
    uxDebugLog('[WebClass UX] openCourseNameEditor: カスタム名読み込み完了', customNames);

    // 時間割表からコース情報を取得（標準表示とSwitch View 2に対応）
    const scheduleTable = document.querySelector('table.schedule-table') || document.querySelector('table.ux-dashboard-v2-schedule-table');
    uxDebugLog('[WebClass UX] openCourseNameEditor: テーブル検索結果', scheduleTable ? 'found' : 'not found', scheduleTable?.className);
    const courseMap = new Map(); // id -> { fullName, currentDisplayName, link }

    if (scheduleTable) {
        const links = scheduleTable.querySelectorAll('a[href*="course.php"]');
        links.forEach(link => {
            const href = link.getAttribute('href');
            const match = href.match(/course\.php\/([^\/]+)/);
            if (match) {
                const courseId = match[1];
                const rawText = link.textContent.trim()
                    .replace(/^»\s*/, '')
                    .replace('締切が近い課題があります。', '')
                    .replace(/新着メッセージ\(\d+\)/, '')
                    .trim();

                if (!courseMap.has(courseId) && rawText.length > 2) {
                    const autoShortName = window.WebClassScraper.extractCourseName(rawText);
                    const customName = resolveEditedCustomCourseName(customNames[courseId], rawText);
                    courseMap.set(courseId, {
                        fullName: rawText,
                        autoShortName: autoShortName,
                        customName: customName,
                        currentDisplayName: customName || autoShortName
                    });
                }
            }
        });
    }

    // モーダル作成
    const modal = document.createElement('div');
    modal.id = 'ux-course-name-modal';
    modal.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: var(--ux-home-overlay) !important;
        z-index: 2147483647 !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: var(--ux-home-surface);
        border: 1px solid var(--ux-home-separator);
        border-radius: 14px;
        max-width: 700px;
        width: 90%;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    `;

    // ヘッダー
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 15px 20px;
        border-bottom: 1px solid var(--ux-home-separator);
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--ux-home-surface-muted);
    `;
    header.innerHTML = `
        <h3 style="margin: 0; font-size: 1.1em; color: var(--ux-home-label);">
            授業名の編集
        </h3>
    `;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
        background: none;
        border: none;
        font-size: 1.2em;
        cursor: pointer;
        color: var(--ux-home-secondary-label);
        padding: 5px;
    `;
    closeBtn.onclick = () => modal.remove();
    header.appendChild(closeBtn);

    // コンテンツ
    const content = document.createElement('div');
    content.style.cssText = `
        padding: 20px;
        overflow-y: auto;
        flex: 1;
    `;

    if (courseMap.size === 0) {
        content.innerHTML = `
            <p style="color: var(--ux-home-secondary-label); text-align: center;">
                時間割表からコースが見つかりませんでした。<br>
                ホームページの時間割表が表示されていることを確認してください。
            </p>
        `;
    } else {
        const description = document.createElement('p');
        description.style.cssText = 'margin-bottom: 15px; color: var(--ux-home-secondary-label); font-size: 0.9em;';
        description.innerHTML = `
            授業の表示名をカスタマイズできます。<br>
            好きな短縮名に編集してください。
        `;
        content.appendChild(description);

        const table = document.createElement('table');
        table.style.cssText = `
            width: 100%;
            border-collapse: collapse;
        `;

        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr style="background: var(--ux-home-surface-muted);">
                <th style="padding: 10px; text-align: left; border-bottom: 1px solid var(--ux-home-separator); width: 50%; color: var(--ux-home-secondary-label);">元の授業名</th>
                <th style="padding: 10px; text-align: left; border-bottom: 1px solid var(--ux-home-separator); width: 50%; color: var(--ux-home-secondary-label);">表示名</th>
            </tr>
        `;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        courseMap.forEach((info, courseId) => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--ux-home-separator)';

            // 元の授業名
            const tdFull = document.createElement('td');
            tdFull.style.cssText = 'padding: 10px; font-size: 0.85em; color: var(--ux-home-secondary-label); word-break: break-word;';
            tdFull.textContent = info.fullName;
            tr.appendChild(tdFull);

            // 表示名入力（カスタム名がなければ元の授業名をデフォルト値に）
            const tdCustom = document.createElement('td');
            tdCustom.style.padding = '10px';

            const input = document.createElement('input');
            input.type = 'text';
            input.value = info.customName || info.fullName;
            input.dataset.courseId = courseId;
            input.dataset.originalName = info.fullName;
            input.style.cssText = `
                width: 100%;
                padding: 6px 10px;
                border: 1px solid var(--ux-home-separator);
                border-radius: 8px;
                font-size: 0.9em;
                color: var(--ux-home-label);
                background: var(--ux-home-surface);
                box-sizing: border-box;
            `;
            input.onfocus = () => {
                input.style.borderColor = 'var(--ux-home-accent)';
                input.style.outline = 'var(--ux-focus-width) solid var(--ux-focus-color)';
                input.style.outlineOffset = 'var(--ux-focus-offset)';
            };
            input.onblur = () => {
                input.style.borderColor = 'var(--ux-home-separator)';
                input.style.outline = '';
                input.style.outlineOffset = '';
            };
            tdCustom.appendChild(input);
            tr.appendChild(tdCustom);

            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        content.appendChild(table);
    }

    // フッター
    const footer = document.createElement('div');
    footer.style.cssText = `
        padding: 15px 20px;
        border-top: 1px solid var(--ux-home-separator);
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        background: var(--ux-home-surface-muted);
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.style.cssText = `
        padding: 8px 16px;
        border: 1px solid var(--ux-home-separator);
        background: var(--ux-home-surface);
        color: var(--ux-home-secondary-label);
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.9em;
    `;
    cancelBtn.onclick = () => modal.remove();

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'コース名クリア';
    clearBtn.style.cssText = `
        padding: 8px 16px;
        border: 1px solid rgba(255, 69, 58, 0.18);
        background: var(--ux-home-danger-soft);
        color: var(--ux-home-danger-foreground);
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.9em;
        margin-right: auto;
    `;
    clearBtn.onclick = async () => {
        if (!confirm('カスタム名をすべて削除して元の表示に戻しますか？')) {
            return;
        }
        clearBtn.disabled = true;
        saveBtn.disabled = true;
        clearBtn.textContent = 'クリア中...';
        try {
            await window.WebClassScraper.saveCustomCourseNames({});
            await updateAssignmentCourseNames({});

            const assignments = await loadAssignments();
            const todoContent = document.querySelector('#ux-dashboard .side-block-content');
            if (todoContent) {
                renderToDoList(assignments, todoContent);
            }

            await applyCustomCourseNamesToTimetable();
            applyTimetableColorsFromTodo(assignments);

            modal.remove();
            uxDebugLog('[WebClass UX] カスタムコース名を全削除しました');
        } catch (error) {
            console.error('[WebClass UX] カスタムコース名の削除に失敗:', error);
            alert('削除に失敗しました: ' + error.message);
            clearBtn.disabled = false;
            saveBtn.disabled = false;
            clearBtn.textContent = 'コース名クリア';
        }
    };

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '保存して適用';
    saveBtn.style.cssText = `
        padding: 8px 16px;
        border: none;
        background: var(--ux-home-accent);
        color: white;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.9em;
    `;
    saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';

        try {
            // 入力値を収集
            const newCustomNames = {};
            const inputs = content.querySelectorAll('input[data-course-id]');
            inputs.forEach(input => {
                const courseId = input.dataset.courseId;
                const customName = resolveEditedCustomCourseName(
                    input.value,
                    input.dataset.originalName || ''
                );
                if (customName) {
                    newCustomNames[courseId] = customName;
                }
            });

            // 保存
            await window.WebClassScraper.saveCustomCourseNames(newCustomNames);

            // 既存の課題データを更新
            await updateAssignmentCourseNames(newCustomNames);

            // UIを更新
            const assignments = await loadAssignments();
            const todoContent = document.querySelector('#ux-dashboard .side-block-content');
            if (todoContent) {
                renderToDoList(assignments, todoContent);
            }

            // 時間割表にカスタム授業名を適用
            await applyCustomCourseNamesToTimetable();

            // 時間割表の色も更新
            applyTimetableColorsFromTodo(assignments);

            modal.remove();
            uxDebugLog('[WebClass UX] カスタムコース名を保存しました:', newCustomNames);
        } catch (error) {
            console.error('[WebClass UX] カスタムコース名の保存に失敗:', error);
            alert('保存に失敗しました: ' + error.message);
            saveBtn.disabled = false;
            saveBtn.textContent = '保存して適用';
        }
    };

    footer.appendChild(cancelBtn);
    footer.appendChild(clearBtn);
    footer.appendChild(saveBtn);

    dialog.appendChild(header);
    dialog.appendChild(content);
    dialog.appendChild(footer);
    modal.appendChild(dialog);

    // モーダル外クリックで閉じる
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    };

    uxDebugLog('[WebClass UX] openCourseNameEditor: モーダルをDOMに追加します');
    document.body.appendChild(modal);
    uxDebugLog('[WebClass UX] openCourseNameEditor: モーダル追加完了');
}

/**
 * 既存の課題データのコース名を更新する
 * @param {Object} customNames - コースID -> カスタム名のマップ
 */
async function updateAssignmentCourseNames(customNames) {
    const assignments = await loadAssignments();

    // 時間割表からコースID->フルネームのマッピングを取得（標準表示とSwitch View 2に対応）
    const scheduleTable = document.querySelector('table.schedule-table') || document.querySelector('table.ux-dashboard-v2-schedule-table');
    const courseIdMap = new Map(); // コースID -> { fullName }

    if (scheduleTable) {
        const links = scheduleTable.querySelectorAll('a[href*="course.php"]');
        links.forEach(link => {
            const href = link.getAttribute('href');
            const match = href.match(/course\.php\/([^\/]+)/);
            if (match) {
                const courseId = match[1];
                const rawText = link.textContent.trim()
                    .replace(/^»\s*/, '')
                    .replace('締切が近い課題があります。', '')
                    .replace(/新着メッセージ\(\d+\)/, '')
                    .trim();
                if (!courseIdMap.has(courseId) && rawText.length > 2) {
                    courseIdMap.set(courseId, { fullName: rawText });
                }
            }
        });
    }

    // 課題のcourseフィールドを更新
    let updated = false;
    assignments.forEach(assignment => {
        // URLからコースIDを抽出
        const urlMatch = (assignment.url || '').match(/course\.php\/([^\/]+)/);
        if (urlMatch) {
            const courseId = urlMatch[1];
            const courseInfo = courseIdMap.get(courseId);
            if (courseInfo) {
                const customName = resolveEditedCustomCourseName(customNames[courseId], courseInfo.fullName);
                const newDisplayName = customName || window.WebClassScraper.extractCourseName(courseInfo.fullName);
                if (assignment.course !== newDisplayName) {
                    assignment.course = newDisplayName;
                    updated = true;
                }
            }
        }
    });

    if (updated) {
        await saveAssignments(assignments);
        uxDebugLog('[WebClass UX] 課題のコース名を更新しました');
    }
}
async function applyCustomCourseNamesToTimetable() {
    const scheduleTable = document.querySelector('table.schedule-table');
    if (!scheduleTable) {
        uxDebugLog('[WebClass UX] 時間割表が見つかりません（カスタム名適用スキップ）');
        return;
    }

    // カスタムコース名を読み込む
    const customNames = await window.WebClassScraper.loadCustomCourseNames();

    uxDebugLog('[WebClass UX] 時間割表の授業名を整形中...');

    // 時間割表の各セルを処理
    const cells = scheduleTable.querySelectorAll('tbody td:not(.schedule-table-class_order)');

    cells.forEach(cell => {
        const link = cell.querySelector('a[href*="course.php"]');
        if (!link) return; // 空きコマ

        const href = link.getAttribute('href');
        const match = href.match(/course\.php\/([^\/]+)/);
        if (!match) return;

        const courseId = match[1];

        // 元のテキストを保存（復元用）
        if (!link.dataset.originalText) {
            link.dataset.originalText = stripTimetableCourseStatusIndicators(link);
        } else {
            stripTimetableCourseStatusIndicators(link);
        }

        const originalText = link.dataset.originalText;

        // カスタム名があればそれを使用、なければ元のテキストから「»」を削除
        let newText;
        const customName = resolveEditedCustomCourseName(customNames[courseId], originalText);
        if (customName) {
            newText = customName;
        } else {
            // 「»」と先頭の空白を削除
            newText = normalizeDevdevCourseText(originalText);
        }

        if (link.textContent !== newText) {
            link.textContent = newText;
            uxDebugLog(`[WebClass UX] 時間割セルを更新: ${newText}`);
        }
    });

    applyUniformTimetableCellLayout(scheduleTable);
}

function fallbackCourseName(fullName) {
    if (window.WebClassScraper?.extractCourseName) {
        return window.WebClassScraper.extractCourseName(fullName);
    }
    return (fullName || '').replace(/^»\s*/, '').trim();
}

/**
 * スマートToDoリストの背景色を時間割表のコマに反映する
 * 優先度: 紫(リマインダー期限切れ) > 赤(48時間以内) > 黄(7日以内)
 * @param {Array} assignments - 課題リスト
 */
function applyTimetableColorsFromTodo(assignments) {
    const scheduleTables = Array.from(document.querySelectorAll('table.schedule-table, table.ux-dashboard-v2-schedule-table'));
    if (scheduleTables.length === 0) {
        uxDebugLog('[WebClass UX] 時間割表が見つかりません（色反映スキップ）');
        return;
    }

    // まず全セルの背景色をリセット（元の色に戻す）
    scheduleTables.forEach(resetTimetableColors);

    // 削除済み・完了済み・ゴミ箱は除外
    const activeAssignments = assignments.filter(a => !a.isDeleted && !a.isCompleted && !isInTrashBin(a));

    if (activeAssignments.length === 0) {
        uxDebugLog('[WebClass UX] アクティブな課題がありません');
        scheduleTables.forEach(applyTimetableDayTimeHighlight);
        return;
    }

    // コースごとに最も優先度の高い色を決定
    // 優先度: 紫(3) > 赤(2) > 黄(1) > なし(0)
    const courseColorMap = new Map(); // コース名 -> { priority, color, hasDangerOutline }

    const now = getWebClassNow();

    activeAssignments.forEach(todo => {
        const courseName = todo.course;
        if (!courseName) return;
        const hasDangerOutline = getTodoPriority(todo) === 'High';

        const rememberCourseStyle = (priority, color, dangerOutline) => {
            if (priority <= 0 && !dangerOutline) return;
            const existing = courseColorMap.get(courseName);
            if (!existing) {
                courseColorMap.set(courseName, { priority, color, hasDangerOutline: !!dangerOutline });
                return;
            }
            if (priority > existing.priority) {
                existing.priority = priority;
                existing.color = color;
            }
            existing.hasDangerOutline = existing.hasDangerOutline || !!dangerOutline;
        };

        // 期限切れ判定（初期設定期限で判定）
        const deadlineForExpiredCheck = todo.originalDeadline || todo.deadline;
        const deadlineForDisplay = todo.deadline;

        let priority = 0;
        let color = null;

        if (!deadlineForDisplay || deadlineForDisplay === '期限なし') {
            // 期限なし → 色なし
            rememberCourseStyle(0, null, hasDangerOutline);
            return;
        }

        const d = new Date(deadlineForDisplay);
        const dOriginal = deadlineForExpiredCheck ? new Date(deadlineForExpiredCheck) : null;

        if (isNaN(d.getTime())) {
            // 日付パース失敗 → 色なし
            rememberCourseStyle(0, null, hasDangerOutline);
            return;
        }

        // 初期設定期限が過ぎている場合は期限切れセクションに行くので色なし（グレー扱い）
        if (dOriginal && !isNaN(dOriginal.getTime()) && dOriginal < now) {
            rememberCourseStyle(0, null, hasDangerOutline);
            return;
        }

        // 任意期限が過ぎているが初期設定期限はまだ → 紫（最優先）
        if (d < now) {
            priority = 3;
            color = 'var(--ux-home-purple-soft)';
        } else {
            const hoursRemaining = (d - now) / (1000 * 60 * 60);

            if (hoursRemaining <= 48) {
                priority = 2;
                color = 'var(--ux-home-danger-soft)';
            } else if (hoursRemaining <= 168) { // 7日 = 168時間
                priority = 1;
                color = 'var(--ux-home-warning-soft)';
            }
        }

        rememberCourseStyle(priority, color, hasDangerOutline);
    });

    if (courseColorMap.size === 0) {
        uxDebugLog('[WebClass UX] 背景色を設定する課題がありません');
        scheduleTables.forEach(applyTimetableDayTimeHighlight);
        return;
    }

    uxDebugLog('[WebClass UX] 時間割表に色を反映するコース:', [...courseColorMap.keys()]);

    // 時間割表の各セルをチェック
    scheduleTables.forEach(scheduleTable => {
        const cells = scheduleTable.querySelectorAll('tbody td:not(.schedule-table-class_order)');

        cells.forEach(cell => {
            // セル内のリンクからコース名を取得
            const link = cell.querySelector('a');
            if (!link) return; // 空きコマ

            const cellText = link.textContent || '';

            // 各コース名とマッチングを試みる
            for (const [courseName, { color, hasDangerOutline }] of courseColorMap) {
                // コース名の一部がセルのテキストに含まれているかチェック
                // 例: 課題のcourse = "離散数学II演習 （計算・先端・情報）"
                //     セル = "» 離散数学II演習 （計算・先端・情報） (2025-後期-火2-13HA014) [河野]"

                if (matchCourseNameToCell(courseName, cellText)) {
                    if (color) {
                        cell.style.backgroundColor = color;
                    }
                    if (dashboardDangerTodoOutlineEnabled && hasDangerOutline) {
                        cell.style.outline = '2px solid rgba(255, 69, 58, 0.42)';
                        cell.style.outlineOffset = '-2px';
                    }
                    uxDebugLog(`[WebClass UX] 時間割セルに色を適用: ${courseName.substring(0, 20)}... → ${color}`);
                    break; // 最初にマッチしたものを適用
                }
            }
        });
        applyTimetableDayTimeHighlight(scheduleTable);
    });
}

/**
 * 時間割表の背景色をリセット（元の色に戻す）
 * @param {HTMLTableElement} scheduleTable - 時間割表のテーブル要素
 */
function resetTimetableColors(scheduleTable) {
    const cells = scheduleTable.querySelectorAll('tbody td:not(.schedule-table-class_order)');

    cells.forEach(cell => {
        cell.style.outline = '';
        cell.style.outlineOffset = '';
        // 元の背景色がデータ属性に保存されていれば復元
        if (cell.dataset.originalBgColor) {
            cell.style.backgroundColor = cell.dataset.originalBgColor;
        } else {
            const removedClasses = [];
            TIMETABLE_HIGHLIGHT_CLASSES.forEach(className => {
                if (cell.classList.contains(className)) {
                    cell.classList.remove(className);
                    removedClasses.push(className);
                }
            });
            // 初回実行時: 元の背景色を保存
            const computedStyle = window.getComputedStyle(cell);
            cell.dataset.originalBgColor = computedStyle.backgroundColor;
            removedClasses.forEach(className => cell.classList.add(className));
        }
    });
}

/**
 * コース名とセルのテキストをマッチング
 * @param {string} courseName - 課題のコース名
 * @param {string} cellText - セル内のテキスト
 * @returns {boolean} マッチしたかどうか
 */
function matchCourseNameToCell(courseName, cellText) {
    if (!courseName || !cellText) return false;

    // 「»」を除去し、空白を正規化
    const normalizedCellText = cellText.replace(/»/g, '').trim();
    const normalizedCourseName = courseName.trim();

    // 完全一致または部分一致
    if (normalizedCellText.includes(normalizedCourseName)) {
        return true;
    }

    // コース名からコードや括弧を除いた主要部分で比較
    // 例: "離散数学II演習 （計算・先端・情報） (2025-後期-火2-13HA014) [河野]"
    //     → "離散数学II演習" で比較

    // 全角・半角括弧の前で分割して科目名の主要部分を取得
    const mainCourseName = normalizedCourseName.split(/[（(]/)[0].trim();
    const mainCellName = normalizedCellText.split(/[（(]/)[0].trim();

    if (mainCourseName && mainCellName && mainCourseName === mainCellName) {
        return true;
    }

    // さらに緩い比較: 科目名がセルに含まれている
    if (mainCourseName && normalizedCellText.includes(mainCourseName)) {
        return true;
    }

    return false;
}
