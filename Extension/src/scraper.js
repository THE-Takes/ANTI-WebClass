/**
 * WebClass Scraper
 * コース一覧と課題を取得するロジック
 */

// uxDebugModeState, uxDebugLog, uxDebugWarn, syncUxMasterStateToPage,
// STORAGE_KEY_EXTENSION_VISUAL_ENABLED, PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED
// are declared in shared.js (loaded before this file).
// Fallbacks are provided to avoid hard failure if shared.js is not available.
var uxDebugModeState = globalThis.uxDebugModeState || { enabled: false };
globalThis.uxDebugModeState = uxDebugModeState;

var uxDebugLog = typeof globalThis.uxDebugLog === 'function'
    ? globalThis.uxDebugLog
    : function (...args) {
        if (!uxDebugModeState.enabled) return;
        console.log(...args);
    };
if (typeof globalThis.uxDebugLog !== 'function') {
    globalThis.uxDebugLog = uxDebugLog;
}

var uxDebugWarn = typeof globalThis.uxDebugWarn === 'function'
    ? globalThis.uxDebugWarn
    : function (...args) {
        if (!uxDebugModeState.enabled) return;
        console.warn(...args);
    };
if (typeof globalThis.uxDebugWarn !== 'function') {
    globalThis.uxDebugWarn = uxDebugWarn;
}

var PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED = typeof globalThis.PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED === 'string'
    ? globalThis.PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED
    : 'webclass_ux_master_enabled';
if (typeof globalThis.PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED !== 'string') {
    globalThis.PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED = PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED;
}

var syncUxMasterStateToPage = typeof globalThis.syncUxMasterStateToPage === 'function'
    ? globalThis.syncUxMasterStateToPage
    : function (enabled) {
        const normalized = enabled ? '1' : '0';
        try {
            if (document && document.documentElement) {
                document.documentElement.dataset.webclassUxMasterEnabled = normalized;
            }
        } catch {
            // ignore
        }
        try {
            localStorage.setItem(PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED, normalized);
        } catch {
            // ignore
        }
    };
if (typeof globalThis.syncUxMasterStateToPage !== 'function') {
    globalThis.syncUxMasterStateToPage = syncUxMasterStateToPage;
}

(() => {
    try {
        chrome.storage.local.get({ debugModeEnabled: false, extensionVisualEnabled: true }, (items) => {
            uxDebugModeState.enabled = !!items.debugModeEnabled;
            syncUxMasterStateToPage(items.extensionVisualEnabled !== false);
            if (document && document.documentElement) {
                document.documentElement.dataset.webclassUxDebugMode = uxDebugModeState.enabled ? '1' : '0';
            }
        });
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;
            if (changes.debugModeEnabled) {
                uxDebugModeState.enabled = !!changes.debugModeEnabled.newValue;
                if (document && document.documentElement) {
                    document.documentElement.dataset.webclassUxDebugMode = uxDebugModeState.enabled ? '1' : '0';
                }
            }
            if (changes.extensionVisualEnabled) {
                syncUxMasterStateToPage(changes.extensionVisualEnabled.newValue !== false);
            }
        });
    } catch {
        uxDebugModeState.enabled = false;
    }
})();

const STORAGE_KEY_CUSTOM_COURSE_NAMES = 'webclass_custom_course_names';

const Scraper = {

    /**
     * カスタムコース名のキャッシュ（非同期読み込み用）
     */
    _customNamesCache: null,

    /**
     * カスタムコース名を読み込む
     * @returns {Promise<Object>} コースID -> カスタム名のマップ
     */
    loadCustomCourseNames: async () => {
        const data = await chrome.storage.local.get([STORAGE_KEY_CUSTOM_COURSE_NAMES]);
        Scraper._customNamesCache = data[STORAGE_KEY_CUSTOM_COURSE_NAMES] || {};
        return Scraper._customNamesCache;
    },

    /**
     * カスタムコース名を保存
     * @param {Object} customNames - コースID -> カスタム名のマップ
     */
    saveCustomCourseNames: async (customNames) => {
        Scraper._customNamesCache = customNames;
        await chrome.storage.local.set({ [STORAGE_KEY_CUSTOM_COURSE_NAMES]: customNames });
        uxDebugLog('[Scraper] カスタムコース名を保存しました:', customNames);
    },

    /**
     * 特定のコースのカスタム名を設定
     * @param {string} courseId - コースID
     * @param {string} customName - カスタム名（空文字で削除）
     */
    setCustomCourseName: async (courseId, customName) => {
        const customNames = await Scraper.loadCustomCourseNames();
        if (customName && customName.trim()) {
            customNames[courseId] = customName.trim();
        } else {
            delete customNames[courseId];
        }
        await Scraper.saveCustomCourseNames(customNames);
    },

    /**
     * コースIDからカスタム名を取得（キャッシュ使用）
     * @param {string} courseId - コースID
     * @returns {string|null} カスタム名（設定されていない場合はnull）
     */
    getCustomCourseName: (courseId) => {
        if (!Scraper._customNamesCache) return null;
        return Scraper._customNamesCache[courseId] || null;
    },

    /**
     * コース名から授業名のみを抽出（自動短縮）
     */
    extractCourseName: (fullName) => {
        let name = fullName;

        // "（計算・先端・情報）" のような学部名を削除
        name = name.replace(/[（(][^）)]*(?:計算|先端|情報|数理|理学|旧数コ|旧物コ|総理)[^）)]*[）)]/g, '');

        // "(2025-" のようなパターンの前まで抽出
        const match = name.match(/^(.+?)\s*\((?:20\d{2})/);
        if (match) {
            name = match[1].trim();
        }

        // "／" で分割されている場合は最初の部分を使用
        if (name.includes('／')) {
            name = name.split('／')[0].trim();
        }

        // 先頭の "»" を削除
        name = name.replace(/^»\s*/, '');

        return name.trim();
    },

    /**
     * コース名を取得（カスタム名優先、なければ自動短縮）
     * @param {string} courseId - コースID
     * @param {string} fullName - 完全なコース名
     * @returns {string} 表示用コース名
     */
    getDisplayCourseName: (courseId, fullName) => {
        // カスタム名が設定されていれば優先
        const customName = Scraper.getCustomCourseName(courseId);
        if (customName) {
            return customName;
        }
        // なければ自動短縮
        return Scraper.extractCourseName(fullName);
    },

    /**
     * ホームページのDOMからコース一覧を取得する
     * @returns {Array<{id: string, name: string, url: string}>}
     */
    getCourses: (logger = uxDebugLog) => {
        const log = typeof logger === 'function'
            ? (...args) => {
                if (!uxDebugModeState.enabled) return;
                logger(...args);
            }
            : uxDebugLog;
        const courses = [];
        // タイムテーブル内のリンクや、コース一覧のリンクを探す
        // 実際のHTMLでは、コースへのリンクは以下のような形式
        // <a href="https://kulms.kanagawa-u.ac.jp/webclass/course.php/25N1300000012AY592/login?acs_=..." ...>
        const courseLinks = document.querySelectorAll('a[href*="course.php"]');

        log(`[Scraper] コースリンクを検索中... 見つかった候補: ${courseLinks.length}個`);

        courseLinks.forEach(link => {
            const href = link.getAttribute('href');
            // 除外条件: 'no-link' クラスや、特定の不要なリンク
            if (link.classList.contains('no-link')) return;

            // テキストコンテンツが無い、または極端に短い場合はスキップ（アイコンリンクなど）
            const rawText = link.textContent.trim();
            if (rawText.length < 2 && !link.querySelector('img')) return;

            try {
                const url = new URL(href, window.location.href);
                let courseId = null;

                // URLパスからIDを抽出 (/webclass/course.php/COURSE_ID/...)
                // 例: https://kulms.kanagawa-u.ac.jp/webclass/course.php/25N1300000012AY592/login?acs_=...
                const match = href.match(/course\.php\/([^\/]+)/);
                if (match) {
                    courseId = match[1];
                } else {
                    courseId = url.searchParams.get('course_id') || url.searchParams.get('id') || url.searchParams.get('course');
                }

                // リンク内のテキストからコース名を取得
                // <div class="course-contents-info">などを除外して純粋なコース名だけを取りたい
                let name = rawText;

                // "» " が先頭についている場合があるので削除
                name = name.replace(/^»\s*/, '');

                // HTML構造内の子要素（通知バッジなど）のテキストが混ざるのを防ぐため、
                // 可能な限りテキストノードのみ、あるいは特定のクラスを除外して取得したいが、
                // 一旦単純な置換で対応
                name = name.replace('締切が近い課題があります。', '');
                name = name.replace(/新着メッセージ\(\d+\)/, '');
                name = name.trim();

                // Check for deadline indicator
                const hasDeadline = link.querySelector('.course-contents-info')?.textContent.includes('締切が近い課題があります。') || false;

                if (courseId && name) {
                    // 重複チェック (時間割表とリスト表示で同じコースが複数回出る可能性がある)
                    if (!courses.some(c => c.id === courseId)) {
                        // コース名を取得（カスタム名優先、なければ自動短縮）
                        const shortName = Scraper.getDisplayCourseName(courseId, name);

                        courses.push({
                            id: courseId,
                            name: shortName,  // 表示名を使用
                            fullName: name,   // 元の完全な名前も保持
                            url: url.href,
                            hasDeadline: hasDeadline
                        });
                    }
                }
            } catch (e) {
                log(`[Scraper] リンクの解析に失敗: ${href}`);
            }
        });

        log(`[Scraper] コース一覧の取得完了: ${courses.length}件`);
        if (courses.length > 0) {
            log(`[Scraper] 取得したコース名:`, courses.map(c => c.name));
        }
        return courses;
    },

    /**
     * 指定されたコースのページを取得し、課題を抽出する
     * @param {string} courseUrl - コースURL
     * @param {string} courseName - 短縮コース名
     * @param {string} courseFullName - 正式コース名
     */
    fetchAssignments: async (courseUrl, courseName, courseFullName = null) => {
        try {
            uxDebugLog(`[Scraper] 課題を取得中: ${courseName}`);
            uxDebugLog(`[Scraper] URL: ${courseUrl}`);

            const response = await fetch(courseUrl);
            if (!response.ok) {
                console.error(`[Scraper] HTTPエラー: ${response.status} ${response.statusText}`);
                return [];
            }

            let text = await response.text();
            uxDebugLog(`[Scraper] HTMLを取得しました (サイズ: ${text.length} bytes)`);
            uxDebugLog(`[Scraper] HTML冒頭サンプル:`, text.substring(0, 200));

            // JavaScriptリダイレクトを検出
            const redirectMatch = text.match(/window\.location\.href\s*=\s*["']([^"']+)["']/);
            if (redirectMatch) {
                const redirectPath = redirectMatch[1];
                const redirectUrl = new URL(redirectPath, courseUrl).href;
                uxDebugLog(`[Scraper] JavaScriptリダイレクトを検出`);
                uxDebugLog(`[Scraper] リダイレクト先: ${redirectUrl}`);

                // リダイレクト先に再度アクセス
                const redirectResponse = await fetch(redirectUrl);
                if (!redirectResponse.ok) {
                    console.error(`[Scraper] リダイレクト先HTTPエラー: ${redirectResponse.status}`);
                    return [];
                }
                text = await redirectResponse.text();
                uxDebugLog(`[Scraper] リダイレクト先HTMLを取得 (サイズ: ${text.length} bytes)`);
            }

            const parser = new DOMParser();
            let doc = parser.parseFromString(text, 'text/html');

            // Check for frameset and redirect to main frame
            const frameset = doc.querySelector('frameset');
            if (frameset) {
                uxDebugLog(`[Scraper] Framesetを検出: ${courseName}`);
                let frame = doc.querySelector('frame[name="main"]') || doc.querySelector('frame[src*="course_"]');

                if (frame) {
                    const frameSrc = frame.getAttribute('src');
                    if (frameSrc) {
                        const frameUrl = new URL(frameSrc, courseUrl).href;
                        uxDebugLog(`[Scraper] コンテンツフレームにリダイレクト: ${frameUrl}`);
                        const frameResponse = await fetch(frameUrl);
                        if (!frameResponse.ok) {
                            console.error(`[Scraper] フレームHTTPエラー: ${frameResponse.status}`);
                            return [];
                        }
                        const frameText = await frameResponse.text();
                        doc = parser.parseFromString(frameText, 'text/html');
                        uxDebugLog(`[Scraper] フレームHTMLを解析しました (サイズ: ${frameText.length} bytes)`);
                    }
                } else {
                    uxDebugWarn(`[Scraper] フレームが見つかりませんでした`);
                }
            }

            const assignments = [];

            // --- 新しい解析ロジック (cl-contentsList based) ---
            // .cl-contentsList_listGroupItem は "li" タグや "section" タグなどに付いている可能性がある
            // 提供されたHTMLでは <section class="list-group-item cl-contentsList_listGroupItem"> となっている
            const listItems = doc.querySelectorAll('.cl-contentsList_listGroupItem');
            uxDebugLog(`[Scraper] リストアイテムの検索: .cl-contentsList_listGroupItem`);
            uxDebugLog(`[Scraper] 見つかったアイテム数: ${listItems.length}`);

            if (listItems.length > 0) {
                uxDebugLog(`[Scraper] 新しいレイアウトで ${listItems.length} 個のアイテムを処理中...`);

                listItems.forEach(item => {
                    // カテゴリ取得 (試験, レポート, 資料, etc.)
                    const categoryEl = item.querySelector('.cl-contentsList_categoryLabel');
                    const category = categoryEl ? categoryEl.textContent.trim() : 'Unknown';

                    // 「資料」「リンク」などはスキップ
                    if (category === '資料' || category === 'リンク') return;

                    // タイトルとリンク
                    const titleEl = item.querySelector('.cm-contentsList_contentName a');
                    // Newバッジなどでaタグが直下じゃない場合も考慮して探す

                    if (!titleEl) return;

                    let title = titleEl.textContent.trim();
                    const titleHref = titleEl.getAttribute('href');
                    // 相対パスの場合があるので絶対パスに変換
                    const doContentsUrl = new URL(titleHref, courseUrl).href; // courseUrlがベースになるが、リダイレクト後のURLの方が正確かも

                    // course.php/.../contents/... 形式のリンクがあれば優先して使用（セッションエラー回避）
                    let detailUrl = null;
                    const detailCandidates = item.querySelectorAll('.cl-contentsList_contentDetailListItemData a[href*="course.php"][href*="/contents/"]');
                    for (const candidate of detailCandidates) {
                        const candidateHref = candidate.getAttribute('href');
                        if (candidateHref && !candidateHref.includes('history')) {
                            detailUrl = new URL(candidateHref, courseUrl).href;
                            break;
                        }
                    }

                    const preferredUrl = detailUrl || doContentsUrl;

                    // 期限情報の抽出
                    let deadline = null;
                    let startDate = null;

                    // 1. 詳細情報内の「利用可能期間」を探す
                    const detailItems = item.querySelectorAll('.cm-contentsList_contentDetailListItem');
                    detailItems.forEach(detail => {
                        const label = detail.querySelector('.cm-contentsList_contentDetailListItemLabel');
                        if (label && label.textContent.includes('利用可能期間')) {
                            const data = detail.querySelector('.cm-contentsList_contentDetailListItemData');
                            if (data) {
                                // Format: "2025/10/21 08:44 - 2025/11/10 23:59"
                                const rangeText = data.textContent.trim();
                                const parts = rangeText.split(' - ');
                                if (parts.length >= 1) startDate = parts[0].trim();
                                if (parts.length >= 2) deadline = parts[1].trim();
                            }
                        }
                    });

                    // 2. タイトル内の期限情報を探す (例: "練習問題(締め切り10月20日)")
                    // タイトルに含まれる "(締め切り...)" などの情報を抽出して、それを正規のdeadlineとして採用するか、
                    // あるいは利用可能期間を優先するか。通常は利用可能期間の方がシステム的な正確さがある。
                    // ただし、利用可能期間が無い場合もあるため、フォールバックとしてタイトル解析を行う。
                    if (!deadline) {
                        const titleDeadline = Scraper.extractDeadlineFromTitle(title);
                        if (titleDeadline) {
                            deadline = titleDeadline;
                        }
                    }

                    // 提出状況の推定 (利用回数など)
                    let attemptCount = 0;
                    // 利用回数は <a ...>利用回数 3</a> のようにリンクになっている場合がある
                    // または単なるテキストの場合も？ 提供HTMLでは <a ...>利用回数 3</a> となっている
                    const historyLinks = item.querySelectorAll('a[href*="history"]');
                    historyLinks.forEach(l => {
                        if (l.textContent.includes('利用回数')) {
                            const match = l.textContent.match(/利用回数\s*(\d+)/);
                            if (match) {
                                attemptCount = parseInt(match[1], 10);
                            }
                        }
                    });
                    // Fallback: テキストノードから探す
                    if (attemptCount === 0) {
                        const detailData = item.querySelectorAll('.cm-contentsList_contentDetailListItemData');
                        detailData.forEach(d => {
                            if (d.textContent.includes('利用回数')) {
                                const match = d.textContent.match(/利用回数\s*(\d+)/);
                                if (match) attemptCount = parseInt(match[1], 10);
                            }
                        });
                    }

                    // ステータス判定
                    // 期限切れかどうかは現在時刻と比較
                    let isExpired = false;
                    if (deadline) {
                        const deadlineDate = new Date(deadline);
                        if (!isNaN(deadlineDate.getTime()) && deadlineDate < new Date()) {
                            isExpired = true;
                        }
                    }

                    // システムによる自動判定（参考情報）
                    const isAutoCompleted = attemptCount > 0;

                    const assignment = {
                        course: courseName,              // 短縮コース名
                        courseFullName: courseFullName || courseName,  // 正式コース名
                        title: title,
                        sourceTitle: title,
                        titleEdited: false,
                        url: preferredUrl,
                        fallbackUrl: doContentsUrl,
                        deadline: deadline || "期限なし",
                        originalDeadline: deadline || "期限なし",  // 初期設定期限（ユーザー変更しても保持）
                        category: category,
                        isCompleted: false,  // ユーザーのチェック状態（初期値はfalse）
                        isAutoCompleted: isAutoCompleted,  // システム判定
                        isExpired: isExpired,
                        attemptCount: attemptCount,
                        localOnly: false
                    };
                    assignments.push(assignment);
                    uxDebugLog(`[Scraper] 課題を追加: [${category}] ${title} (期限: ${assignment.deadline})`);
                });

            } else {
                // --- 旧ロジック (フォールバック) ---
                uxDebugWarn(`[Scraper] リストアイテムが見つかりませんでした。フォールバックロジックを試行...`);
                uxDebugLog(`[Scraper] HTML構造の確認:`);
                uxDebugLog(`[Scraper] - body要素: ${doc.body ? 'あり' : 'なし'}`);
                uxDebugLog(`[Scraper] - container要素: ${doc.querySelector('.container') ? 'あり' : 'なし'}`);
                uxDebugLog(`[Scraper] - list-group要素: ${doc.querySelectorAll('.list-group').length}個`);
                // ... (省略、必要なら以前のコードを維持)
            }

            uxDebugLog(`[Scraper] ${courseName} から ${assignments.length} 件の課題を取得しました`);
            if (assignments.length > 0) {
                uxDebugLog(`[Scraper] 課題の詳細:`, assignments);
            }
            return assignments;

        } catch (error) {
            console.error(`[Scraper] ${courseName} の課題取得に失敗:`, error);
            console.error(`[Scraper] エラー詳細:`, error.message);
            console.error(`[Scraper] スタックトレース:`, error.stack);
            return [];
        }
    },

    /**
     * 文字列から日付を抽出するヘルパー
     */
    extractDeadlineFromTitle: (text) => {
        // 例: "締め切り10月20日" -> 今年の年を補完して返す
        // 全角数字も考慮する？ WebClassは半角が多そうだが。
        const match = text.match(/(?:締め切り|提出期限|期限)[:\s]*(\d{1,2})[\/月](\d{1,2})日?/);
        if (match) {
            const month = parseInt(match[1], 10);
            const day = parseInt(match[2], 10);
            const now = new Date();
            let year = now.getFullYear();

            // 期限が過去の月（例えば現在10月で期限が1月）なら来年と推測するロジックなどが必要だが、
            // 逆に（現在1月で期限が12月）なら去年（＝期限切れ）。
            // 単純に「現在より半年以上前の月なら来年」などのヒューリスティックを入れるか、
            // あるいは学期（4月始まり、9月始まり）を考慮するか。
            // ここではシンプルに「現在の月より3ヶ月以上前なら来年」としてみる
            if (month < now.getMonth() + 1 - 3) {
                year++;
            }
            // 逆に「現在の月より9ヶ月以上先」なら去年（ありえないが）...
            // 昨年度のコースを見ている可能性もあるので、安易に年を補完するのは危険だが、
            // とりあえず今年として処理し、isExpired判定に任せるのが無難。

            return `${year}/${month}/${day} 23:59`;
        }
        return null;
    },

    /**
     * 全コースの課題を一括取得して保存する
     */
    updateAllAssignments: async () => {
        // カスタムコース名を先に読み込む
        await Scraper.loadCustomCourseNames();

        // 既存の課題とチェック状態を取得
        const existingData = await new Promise(resolve => {
            chrome.storage.local.get(['assignments'], (result) => {
                resolve(result.assignments || []);
            });
        });

        // 既存の状態をマップに保存（URLをキーとして使用）
        const stateMap = {};
        const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
        const getPrimaryAssignmentKey = (assignment) => {
            if (!assignment || typeof assignment !== 'object') return '';
            if (typeof assignment.url === 'string' && assignment.url) {
                return `url:${assignment.url}`;
            }
            if (typeof assignment.fallbackUrl === 'string' && assignment.fallbackUrl) {
                return `fallback:${assignment.fallbackUrl}`;
            }
            return '';
        };
        const normalizeCategory = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
        const isLocalOnlyAssignment = (assignment) => {
            if (!assignment || typeof assignment !== 'object') return false;
            if (assignment.localOnly === true) return true;

            const category = normalizeCategory(assignment.category);
            const url = typeof assignment.url === 'string' ? assignment.url : '';
            const fallbackUrl = typeof assignment.fallbackUrl === 'string' ? assignment.fallbackUrl : '';

            return category === 'devdev'
                || url.startsWith('debug://')
                || fallbackUrl.startsWith('debug://');
        };
        const rememberState = (key, assignment) => {
            if (key) {
                stateMap[key] = {
                    isCompleted: assignment.isCompleted,
                    isDeleted: assignment.isDeleted,
                    deletedAt: assignment.deletedAt,
                    deadline: assignment.deadline,
                    originalDeadline: assignment.originalDeadline,
                    title: assignment.title,
                    sourceTitle: assignment.sourceTitle,
                    titleEdited: assignment.titleEdited === true,
                    ticktickTaskId: assignment.ticktickTaskId,
                };
            }
        };
        existingData.forEach(assignment => {
            rememberState(assignment.url, assignment);
            if (assignment.fallbackUrl) {
                rememberState(assignment.fallbackUrl, assignment);
            }
        });
        const courses = Scraper.getCourses();
        let allAssignments = [];

        for (const course of courses) {
            // 少しウェイトを入れる
            await new Promise(r => setTimeout(r, 500));
            const assignments = await Scraper.fetchAssignments(course.url, course.name, course.fullName);
            allAssignments = allAssignments.concat(assignments);
        }

        // 既存の状態をマージ
        allAssignments = allAssignments.map((assignment) => {
            let existingState = null;
            if (assignment.url && hasOwn(stateMap, assignment.url)) {
                existingState = stateMap[assignment.url];
            } else if (assignment.fallbackUrl && hasOwn(stateMap, assignment.fallbackUrl)) {
                existingState = stateMap[assignment.fallbackUrl];
            }

            const fetchedTitle = typeof assignment.title === 'string' ? assignment.title : '';
            assignment.sourceTitle = fetchedTitle;
            assignment.titleEdited = false;
            assignment.localOnly = false;

            if (existingState) {
                assignment.isCompleted = existingState.isCompleted;

                const existingTickTickTaskId = typeof existingState.ticktickTaskId === 'string'
                    ? existingState.ticktickTaskId.trim()
                    : '';
                if (existingTickTickTaskId) {
                    assignment.ticktickTaskId = existingTickTickTaskId;
                }

                if (existingState.isDeleted) {
                    assignment.isDeleted = existingState.isDeleted;
                    assignment.deletedAt = existingState.deletedAt;
                }

                if (existingState.originalDeadline) {
                    assignment.originalDeadline = existingState.originalDeadline;
                }

                if (existingState.deadline && existingState.deadline !== existingState.originalDeadline) {
                    assignment.deadline = existingState.deadline;
                }

                const existingTitle = typeof existingState.title === 'string' ? existingState.title : '';
                const existingSourceTitle = typeof existingState.sourceTitle === 'string' ? existingState.sourceTitle : '';
                const hasSourceTitle = !!existingSourceTitle;
                const titleWasEdited = existingState.titleEdited === true
                    || (hasSourceTitle
                        ? existingTitle !== existingSourceTitle
                        : (existingTitle && existingTitle !== fetchedTitle));

                if (titleWasEdited && typeof existingState.title === 'string') {
                    assignment.title = existingState.title;
                    assignment.titleEdited = true;
                }
            }

            return assignment;
        });

        const localOnlyAssignments = existingData.filter(isLocalOnlyAssignment);
        if (localOnlyAssignments.length > 0) {
            const mergedPrimaryKeys = new Set(
                allAssignments
                    .map(getPrimaryAssignmentKey)
                    .filter(Boolean)
            );

            localOnlyAssignments.forEach((assignment) => {
                const primaryKey = getPrimaryAssignmentKey(assignment);
                if (primaryKey && mergedPrimaryKeys.has(primaryKey)) {
                    return;
                }

                allAssignments.push({
                    ...assignment,
                    localOnly: true,
                });

                if (primaryKey) {
                    mergedPrimaryKeys.add(primaryKey);
                }
            });
        }
        uxDebugLog('[Scraper] 全ての課題を取得しました:', allAssignments);
        uxDebugLog(`[Scraper] 合計 ${allAssignments.length} 件の課題`);

        // 保存
        chrome.storage.local.set({
            'assignments': allAssignments,
            'lastUpdated': new Date().toISOString()
        }, () => {
            uxDebugLog('[Scraper] 課題をストレージに保存しました。');
        });

        return allAssignments;
    },

    // ...
};

window.WebClassScraper = Scraper;
