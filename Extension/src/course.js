// course.js
// Handles Content Pages: Download renaming for shiryou/shiken types

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

var STORAGE_KEY_EXTENSION_VISUAL_ENABLED = typeof globalThis.STORAGE_KEY_EXTENSION_VISUAL_ENABLED === 'string'
    ? globalThis.STORAGE_KEY_EXTENSION_VISUAL_ENABLED
    : 'extensionVisualEnabled';
if (typeof globalThis.STORAGE_KEY_EXTENSION_VISUAL_ENABLED !== 'string') {
    globalThis.STORAGE_KEY_EXTENSION_VISUAL_ENABLED = STORAGE_KEY_EXTENSION_VISUAL_ENABLED;
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
            setUxExtensionVisualEnabled(items.extensionVisualEnabled !== false);
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
                const nextEnabled = changes.extensionVisualEnabled.newValue !== false;
                const prevEnabled = isUxExtensionVisualEnabled();
                setUxExtensionVisualEnabled(nextEnabled);
                if (prevEnabled !== nextEnabled && window.top === window) {
                    window.location.reload();
                }
            }
        });
    } catch {
        uxDebugModeState.enabled = false;
    }
})();

let uxExtensionVisualEnabled = true;

function setUxExtensionVisualEnabled(enabled) {
    uxExtensionVisualEnabled = !!enabled;
    syncUxMasterStateToPage(uxExtensionVisualEnabled);
}

function isUxExtensionVisualEnabled() {
    return !!uxExtensionVisualEnabled;
}

(() => {
    try {
        const persisted = localStorage.getItem(PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED);
        if (persisted === '0') {
            setUxExtensionVisualEnabled(false);
        } else if (persisted === '1') {
            setUxExtensionVisualEnabled(true);
        }
    } catch {
        // ignore
    }
})();

// ============================================================
// Configuration
// ============================================================
const CONFIG = {
    // ファイル名に使用できない文字を置換
    invalidChars: /[<>:"/\\|?*]/g,
    // デバッグモード
    debug: false
};

uxDebugLog("WebClass UX Improver: Course script loaded");

function log(...args) {
    if (uxDebugModeState.enabled) {
        uxDebugLog('[WebClass UX]', ...args);
    }
}

// ============================================================
// Page Type Detection
// ============================================================

/**
 * 現在のページタイプを検出
 * @returns {'shiryou' | 'shiken' | 'course_list' | 'download_window' | 'pdf_viewer' | 'unknown'}
 */
function detectPageType() {
    const url = window.location.href;

    // ダウンロードウィンドウ: file_down.php
    if (url.includes('file_down.php')) {
        return 'download_window';
    }

    // PDFビューア: loadit.php
    if (url.includes('loadit.php')) {
        // action=providePDF は「表示に問題があるときは」メッセージのフレーム
        if (url.includes('action=providePDF') || url.includes('action=provide')) {
            return 'loadit_message';
        }
        return 'pdf_viewer';
    }

    // 資料タイプ: txtbk_frame.php または txtbk_show_chapter.php、title_simple.php
    if (url.includes('txtbk_frame.php') || url.includes('txtbk_show_chapter.php') || url.includes('txtbk_show_text.php')) {
        return 'shiryou';
    }

    // title_simple.php は資料タイプの上部リボン（非表示対象）
    if (url.includes('title_simple.php')) {
        return 'shiryou_title';
    }

    // 試験タイプ: qstn_frame.php または dqstn_button.php
    if (url.includes('qstn_frame.php') || url.includes('dqstn_button.php') || url.includes('dqstn_answer.php')) {
        return 'shiken';
    }

    // コースリスト/教材一覧
    if (url.includes('course.php') && !url.includes('do_contents')) {
        return 'course_list';
    }

    // do_contents.php (教材表示開始)
    if (url.includes('do_contents.php')) {
        return 'do_contents';
    }

    return 'unknown';
}

// ============================================================
// Content Info Extraction
// ============================================================

/**
 * 課題名を取得
 * @returns {string}
 */
function getContentName() {
    // 方法1: hidden input から取得
    const hiddenInput = document.querySelector('input[name="contents_name"]');
    if (hiddenInput && hiddenInput.value) {
        return hiddenInput.value.trim();
    }

    // 方法2: h2タグから取得
    const h2 = document.querySelector('#WsTitle h2, .bgc_sub h2, h2');
    if (h2) {
        // "New" バッジなどを除去
        let text = h2.textContent.trim();
        text = text.replace(/^New\s*/i, '');
        return text;
    }

    // 方法3: タイトルから取得
    const title = document.title;
    if (title && title.includes(' - WebClass')) {
        return title.split(' - WebClass')[0].trim();
    }

    return 'Unknown';
}

/**
 * コース名を取得
 * @returns {string}
 */
function getCourseName() {
    const h1 = document.querySelector('#WsTitle h1, .bgc_sub h1, h1');
    if (h1) {
        let text = h1.textContent.trim();
        // ">" プレフィックスを除去
        text = text.replace(/^>\s*/, '');
        return text;
    }
    return '';
}

/**
 * 節/問番号を取得
 * @param {Element} element - ダウンロードリンクの近くの要素
 * @returns {number | null}
 */
function getSectionNumber(element) {
    // 親要素を遡って節番号を探す
    let parent = element.closest('tr');
    if (parent) {
        // "第N節" パターンを探す
        const sectionText = parent.textContent;
        const sectionMatch = sectionText.match(/第(\d+)節/);
        if (sectionMatch) {
            return parseInt(sectionMatch[1], 10);
        }

        // "問 N" パターンを探す (試験タイプ)
        const questionMatch = sectionText.match(/問\s*(\d+)/);
        if (questionMatch) {
            return parseInt(questionMatch[1], 10);
        }
    }
    return null;
}

/**
 * ファイル名から拡張子を取得
 * @param {string} url
 * @returns {string}
 */
function getExtensionFromUrl(url) {
    try {
        // file_name パラメータから取得
        const urlObj = new URL(url, window.location.origin);
        const fileName = urlObj.searchParams.get('file_name');
        if (fileName) {
            const decoded = decodeURIComponent(fileName);
            const ext = decoded.split('.').pop();
            if (ext && ext.length <= 5) {
                return '.' + ext.toLowerCase();
            }
        }

        // URLパスから取得
        const pathname = urlObj.pathname;
        const extMatch = pathname.match(/\.([a-zA-Z0-9]+)$/);
        if (extMatch) {
            return '.' + extMatch[1].toLowerCase();
        }
    } catch (e) {
        log('Error extracting extension:', e);
    }
    return '.pdf'; // デフォルト
}

/**
 * 元のファイル名を取得
 * @param {string} url
 * @returns {string}
 */
function getOriginalFileName(url) {
    try {
        const urlObj = new URL(url, window.location.origin);

        // file_name パラメータから取得
        const fileName = urlObj.searchParams.get('file_name');
        if (fileName) {
            return decodeURIComponent(fileName);
        }

        // URLパスから取得 (download.php/ファイル名.pdf の形式)
        const pathname = urlObj.pathname;
        const pathMatch = pathname.match(/download\.php\/(.+)$/);
        if (pathMatch) {
            return decodeURIComponent(pathMatch[1]);
        }

        // 通常のファイルパス
        const parts = pathname.split('/');
        const lastPart = parts[parts.length - 1];
        if (lastPart && lastPart.includes('.')) {
            return decodeURIComponent(lastPart);
        }
    } catch (e) {
        log('Error extracting filename:', e);
    }
    return null;
}

/**
 * ファイル名をサニタイズ
 * @param {string} name
 * @returns {string}
 */
function sanitizeFileName(name) {
    return name.replace(CONFIG.invalidChars, '_').trim();
}

// ============================================================
// Download Button Enhancement
// ============================================================

/**
 * ダウンロードボタンを強化（選択肢を追加）
 */
function enhanceDownloadLinks() {
    const pageType = detectPageType();
    log('Page type:', pageType);

    if (pageType === 'unknown' || pageType === 'course_list') {
        log('Skipping enhancement for this page type');
        return;
    }

    // ダウンロードウィンドウの場合は特別処理
    if (pageType === 'download_window') {
        enhanceDownloadWindow();
        return;
    }

    // PDFビューアの場合は特別処理
    if (pageType === 'pdf_viewer') {
        enhancePdfViewerPage();
        return;
    }

    const contentName = getContentName();
    const courseName = getCourseName();
    log('Content name:', contentName);
    log('Course name:', courseName);

    // 添付資料リンクを検出
    enhanceAttachmentLinks(contentName);

    // PDFビューアのダウンロードボタンを検出
    enhancePdfViewerDownload(contentName);
}

/**
 * 添付資料リンクを強化
 * file_down.phpへのリンクを検出し、ダウンロードウィンドウを開かずに
 * 直接2つのダウンロードオプションを表示する
 * @param {string} contentName
 */
function enhanceAttachmentLinks(contentName) {
    log('Enhancing attachment links');

    // file_down.php へのリンクを検出
    const attachmentLinks = document.querySelectorAll('a[href*="file_down.php"]');

    log(`Found ${attachmentLinks.length} attachment links`);

    attachmentLinks.forEach(link => {
        if (link.dataset.uxEnhanced) return;
        link.dataset.uxEnhanced = 'true';

        const fileDownUrl = link.href;

        // URLからファイル名を取得
        const originalFileName = getFileNameFromFileDownUrl(fileDownUrl);
        const extension = getExtensionFromUrl(fileDownUrl);

        // リネーム後のファイル名を生成
        const renamedFileName = sanitizeFileName(contentName || 'download') + extension;

        log('Attachment link:', { fileDownUrl, originalFileName, renamedFileName });

        // 元のonclickイベントを無効化（ポップアップウィンドウを開かないようにする）
        link.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        };
        link.removeAttribute('target');

        // ダウンロードオプションのUIを作成
        createInlineDownloadOptions(link, fileDownUrl, renamedFileName, originalFileName);
    });
}

/**
 * file_down.php URLからファイル名を取得
 * @param {string} url
 * @returns {string}
 */
function getFileNameFromFileDownUrl(url) {
    try {
        const urlObj = new URL(url, window.location.origin);
        const fileName = urlObj.searchParams.get('file_name');
        if (fileName) {
            return decodeURIComponent(fileName);
        }
    } catch (e) {
        log('Error extracting filename from file_down.php URL:', e);
    }
    return 'ファイル';
}

/**
 * インラインでダウンロードオプションを作成
 * 元のリンクの横に2つのダウンロードボタンを表示
 * @param {Element} originalLink
 * @param {string} fileDownUrl - file_down.php のURL
 * @param {string} renamedFileName
 * @param {string} originalFileName
 */
function createInlineDownloadOptions(originalLink, fileDownUrl, renamedFileName, originalFileName) {
    // コンテナを作成
    const container = document.createElement('span');
    container.className = 'ux-inline-download-options';

    // リネームダウンロードボタン
    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'ux-download-btn ux-download-rename';
    renameBtn.innerHTML = 'DL';
    renameBtn.title = `リネームしてダウンロード: ${renamedFileName}`;
    renameBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        renameBtn.disabled = true;
        renameBtn.innerHTML = '⏳';
        try {
            await downloadFromFileDownUrl(fileDownUrl, renamedFileName);
            renameBtn.innerHTML = '完了';
            setTimeout(() => { renameBtn.innerHTML = 'DL'; renameBtn.disabled = false; }, 2000);
        } catch (error) {
            log('Download error:', error);
            renameBtn.innerHTML = '失敗';
            setTimeout(() => { renameBtn.innerHTML = 'DL'; renameBtn.disabled = false; }, 2000);
        }
    });

    // 元のファイル名でダウンロードボタン
    const originalBtn = document.createElement('button');
    originalBtn.type = 'button';
    originalBtn.className = 'ux-download-btn ux-download-original';
    originalBtn.innerHTML = '元';
    originalBtn.title = `元のファイル名でダウンロード: ${originalFileName}`;
    originalBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        originalBtn.disabled = true;
        originalBtn.innerHTML = '⏳';
        try {
            await downloadFromFileDownUrl(fileDownUrl, null);
            originalBtn.innerHTML = '完了';
            setTimeout(() => { originalBtn.innerHTML = '元'; originalBtn.disabled = false; }, 2000);
        } catch (error) {
            log('Download error:', error);
            originalBtn.innerHTML = '失敗';
            setTimeout(() => { originalBtn.innerHTML = '元'; originalBtn.disabled = false; }, 2000);
        }
    });

    container.appendChild(renameBtn);
    container.appendChild(originalBtn);

    // 元のリンクの後ろにコンテナを追加
    originalLink.parentNode.insertBefore(container, originalLink.nextSibling);
}

/**
 * file_down.phpからダウンロードURLを取得してダウンロードを実行
 * @param {string} fileDownUrl - file_down.php のURL
 * @param {string|null} filename - リネーム後のファイル名（nullの場合は元のファイル名）
 */
async function downloadFromFileDownUrl(fileDownUrl, filename) {
    log('Fetching download URL from:', fileDownUrl);

    try {
        // file_down.phpページをフェッチ
        const response = await fetch(fileDownUrl, {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const html = await response.text();

        // HTMLからdownload.phpのURLを抽出
        const downloadUrl = extractDownloadUrlFromHtml(html);

        if (!downloadUrl) {
            throw new Error('Could not extract download URL');
        }

        log('Extracted download URL:', downloadUrl);

        // ダウンロードを実行
        triggerDownload(downloadUrl, filename);

    } catch (error) {
        log('Error fetching from file_down.php:', error);
        // フォールバック: 直接file_down.phpを開く（従来の動作）
        window.open(fileDownUrl, '_blank');
        throw error;
    }
}

/**
 * HTMLからdownload.phpのURLを抽出
 * @param {string} html
 * @returns {string|null}
 */
function extractDownloadUrlFromHtml(html) {
    // DOMパーサーでHTMLを解析
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // download.phpへのリンクを探す
    const downloadLink = doc.querySelector('a[href*="download.php"]');
    if (downloadLink) {
        return downloadLink.href;
    }

    // 正規表現でも試行
    const match = html.match(/href=["']([^"']*download\.php[^"']*)["']/i);
    if (match) {
        let url = match[1];
        // HTMLエンティティをデコード
        url = url.replace(/&amp;/g, '&');
        // 相対URLを絶対URLに変換
        if (!url.startsWith('http')) {
            url = new URL(url, window.location.origin).href;
        }
        return url;
    }

    return null;
}

/**
 * PDFビューアを開いて画像保存を促す
 * @param {string} fileDownUrl - file_down.php のURL
 * @param {string} baseFileName - ベースファイル名（拡張子なし）
 */
async function openPdfViewerForImageSave(fileDownUrl, baseFileName) {
    // file_down.phpからdownload.phpのURLを取得
    const response = await fetch(fileDownUrl, { credentials: 'include' });
    const html = await response.text();
    const downloadUrl = extractDownloadUrlFromHtml(html);

    if (!downloadUrl) {
        throw new Error('Could not extract PDF URL');
    }

    // background.jsにPDF変換リクエストを送信
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'CONVERT_PDF_TO_IMAGES',
            url: downloadUrl,
            baseFileName: baseFileName
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (response && response.success) {
                resolve();
            } else {
                reject(new Error(response?.error || 'Unknown error'));
            }
        });
    });
}

/**
 * PDFビューアのダウンロードボタンを強化
 * @param {string} contentName
 */
function enhancePdfViewerDownload(contentName) {
    // iframe内のPDFビューアを探す
    const iframes = document.querySelectorAll('iframe');

    iframes.forEach(iframe => {
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!iframeDoc) return;

            // ダウンロードボタンを探す
            const downloadBtn = iframeDoc.querySelector('#download, #secondaryDownload');
            if (downloadBtn && !downloadBtn.dataset.uxEnhanced) {
                downloadBtn.dataset.uxEnhanced = 'true';

                // PDFのURLを取得
                const pdfUrl = getPdfUrlFromViewer(iframeDoc);
                if (pdfUrl) {
                    const extension = '.pdf';
                    const renamedFileName = sanitizeFileName(contentName) + extension;
                    const originalFileName = getOriginalFileName(pdfUrl) || 'document.pdf';

                    // 既存のクリックイベントをインターセプト
                    downloadBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        showDownloadChoice(pdfUrl, renamedFileName, originalFileName, e);
                    }, true);
                }
            }
        } catch (e) {
            // クロスオリジンの場合はスキップ
            log('Cannot access iframe:', e.message);
        }
    });

    // 直接ページ上のダウンロードボタン
    const downloadBtns = document.querySelectorAll('#download, #secondaryDownload, button[data-l10n-id="download"]');
    downloadBtns.forEach(btn => {
        if (btn.dataset.uxEnhanced) return;
        btn.dataset.uxEnhanced = 'true';

        const pdfUrl = getPdfUrlFromViewer(document);
        if (pdfUrl) {
            const renamedFileName = sanitizeFileName(contentName) + '.pdf';
            const originalFileName = getOriginalFileName(pdfUrl) || 'document.pdf';

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showDownloadChoice(pdfUrl, renamedFileName, originalFileName, e);
            }, true);
        }
    });
}

/**
 * PDFビューアからPDF URLを取得
 * @param {Document} doc
 * @returns {string | null}
 */
function getPdfUrlFromViewer(doc) {
    // DEFAULT_URL変数から取得
    const scripts = doc.querySelectorAll('script');
    for (const script of scripts) {
        const content = script.textContent;
        const match = content.match(/DEFAULT_URL\s*=\s*['"]([^'"]+)['"]/);
        if (match) {
            return match[1];
        }
    }

    // コメントからURLを取得
    const html = doc.documentElement.outerHTML;
    const urlMatch = html.match(/saved from url=\([^)]+\)([^\s]+\.pdf)/);
    if (urlMatch) {
        return urlMatch[1];
    }

    return null;
}

/**
 * ダウンロードウィンドウを強化 (file_down.php)
 */
function enhanceDownloadWindow() {
    log('Enhancing download window');

    // download.php リンクを探す
    const downloadLinks = document.querySelectorAll('a[href*="download.php"]');

    downloadLinks.forEach(link => {
        if (link.dataset.uxEnhanced) return;
        link.dataset.uxEnhanced = 'true';

        const downloadUrl = link.href;
        const originalFileName = getOriginalFileName(downloadUrl);
        const extension = getExtensionFromUrl(downloadUrl);

        // 親ウィンドウから課題名を取得を試みる
        let contentName = getContentNameFromParent() || getContentName();
        if (!contentName || contentName === 'Unknown') {
            // ファイル名から推測（拡張子を除去）
            contentName = originalFileName ? originalFileName.replace(/\.[^.]+$/, '') : 'download';
        }

        const renamedFileName = sanitizeFileName(contentName) + extension;

        log('Download window link:', { downloadUrl, originalFileName, renamedFileName });

        // ダウンロードウィンドウ用のボタングループを作成
        createDownloadWindowButtonGroup(link, downloadUrl, renamedFileName, originalFileName);
    });
}

/**
 * ダウンロードウィンドウ用のボタングループを作成
 * @param {Element} originalLink
 * @param {string} downloadUrl - download.php のURL（実際のダウンロードURL）
 * @param {string} renamedFileName
 * @param {string} originalFileName
 */
function createDownloadWindowButtonGroup(originalLink, downloadUrl, renamedFileName, originalFileName) {
    const container = document.createElement('div');
    container.className = 'ux-download-group';
    container.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-top: 10px;';

    // リネームダウンロードボタン
    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'ux-download-btn ux-download-rename';
    renameBtn.innerHTML = 'リネームしてダウンロード<br><small>' + truncateFileName(renamedFileName, 30) + '</small>';
    renameBtn.title = `リネームしてダウンロード: ${renamedFileName}`;
    renameBtn.style.cssText = 'padding: 10px 16px; font-size: 14px;';
    renameBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerDownload(downloadUrl, renamedFileName);
    });

    // 元のファイル名でダウンロードボタン
    const originalBtn = document.createElement('button');
    originalBtn.type = 'button';
    originalBtn.className = 'ux-download-btn ux-download-original';
    originalBtn.innerHTML = '元のファイル名でダウンロード<br><small>' + truncateFileName(originalFileName || '不明', 30) + '</small>';
    originalBtn.title = `元のファイル名でダウンロード: ${originalFileName || '不明'}`;
    originalBtn.style.cssText = 'padding: 10px 16px; font-size: 14px;';
    originalBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerDownload(downloadUrl, null);
    });

    container.appendChild(renameBtn);
    container.appendChild(originalBtn);

    // PDFファイルの場合は「画像として保存」ボタンを追加
    const extension = getExtensionFromUrl(downloadUrl).toLowerCase();
    if (extension === '.pdf') {
        const imageBaseFileName = renamedFileName.replace(/\.pdf$/i, '');
        const imageBtn = createSaveAsImageButton(downloadUrl, imageBaseFileName);
        container.appendChild(imageBtn);
    }

    // 元のリンクをテキストに置換
    const fileNameText = document.createElement('span');
    fileNameText.className = 'ux-filename-text';
    fileNameText.style.cssText = 'display: block; margin-bottom: 10px; color: inherit;';
    fileNameText.textContent = '» ' + (originalFileName || 'ファイル');

    // 元のリンクを非表示にして、テキストを挿入
    originalLink.style.display = 'none';
    originalLink.parentNode.insertBefore(fileNameText, originalLink);
    originalLink.parentNode.insertBefore(container, fileNameText.nextSibling);
}

/**
 * 親ウィンドウから課題名を取得（フレームチェーンを遡る）
 * @returns {string | null}
 */
function getContentNameFromParent() {
    // 検索対象のセレクタリスト
    const selectors = [
        'input[name="contents_name"]',
        '#WsTitle h2',
        '.bgc_sub h2',
        'h2'
    ];

    /**
     * ドキュメントから課題名を取得
     * @param {Document} doc
     * @returns {string | null}
     */
    function extractFromDoc(doc) {
        try {
            // input[name="contents_name"]から取得
            const input = doc.querySelector('input[name="contents_name"]');
            if (input && input.value) {
                return input.value.trim();
            }

            // h2から取得
            for (const selector of ['#WsTitle h2', '.bgc_sub h2']) {
                const h2 = doc.querySelector(selector);
                if (h2) {
                    let text = h2.textContent.trim();
                    text = text.replace(/^New\s*/i, '');
                    if (text && text !== '' && text !== '>') {
                        return text;
                    }
                }
            }
        } catch (e) {
            // アクセスエラー
        }
        return null;
    }

    /**
     * フレームチェーンを遡って検索
     * @param {Window} win
     * @param {number} depth
     * @returns {string | null}
     */
    function searchFrameChain(win, depth = 0) {
        if (depth > 10) return null; // 無限ループ防止

        try {
            // 現在のウィンドウのドキュメントをチェック
            const result = extractFromDoc(win.document);
            if (result) return result;

            // 親ウィンドウを検索
            if (win.parent && win.parent !== win) {
                const parentResult = searchFrameChain(win.parent, depth + 1);
                if (parentResult) return parentResult;
            }

            // 同じフレームセット内の他のフレームを検索
            if (win.parent && win.parent.frames) {
                for (let i = 0; i < win.parent.frames.length; i++) {
                    try {
                        const frame = win.parent.frames[i];
                        if (frame !== win) {
                            const frameResult = extractFromDoc(frame.document);
                            if (frameResult) return frameResult;
                        }
                    } catch (e) {
                        // クロスオリジン
                    }
                }
            }
        } catch (e) {
            log('Frame access error:', e.message);
        }
        return null;
    }

    // openerから取得を試みる
    try {
        if (window.opener) {
            const openerResult = extractFromDoc(window.opener.document);
            if (openerResult) return openerResult;
        }
    } catch (e) {
        // クロスオリジン
    }

    // フレームチェーンを検索
    return searchFrameChain(window);
}

/**
 * PDFビューアページを強化 (loadit.php)
 * 既存のダウンロードボタンは「元名」として機能するため、リネームボタンのみ追加
 */
function enhancePdfViewerPage() {
    log('Enhancing PDF viewer page');

    // ダウンロードボタンを探す（メインとセカンダリ両方）
    const downloadBtns = document.querySelectorAll('#download, #secondaryDownload, button[data-l10n-id="download"]');

    // 課題名を親から取得
    let contentName = getContentNameFromParent();
    log('Content name from parent:', contentName);

    if (!contentName || contentName === 'Unknown') {
        // URLから課題名を推測
        contentName = getContentNameFromUrl();
        log('Content name from URL:', contentName);
    }

    if (!contentName) {
        contentName = 'document';
    }

    // PDF URLを取得
    const pdfUrl = getPdfUrlFromViewer(document) || window.location.href;
    const renamedFileName = sanitizeFileName(contentName) + '.pdf';
    const imageBaseFileName = sanitizeFileName(contentName);

    log('PDF viewer:', { pdfUrl, renamedFileName, contentName });

    downloadBtns.forEach(btn => {
        if (btn.dataset.uxEnhanced) return;
        btn.dataset.uxEnhanced = 'true';

        // リネームダウンロードボタンを追加（既存ボタンは元名として機能）
        const renameBtn = document.createElement('button');
        renameBtn.type = 'button';
        renameBtn.className = 'ux-download-btn ux-download-rename';
        renameBtn.innerHTML = truncateFileName(renamedFileName, 15);
        renameBtn.title = `リネームしてダウンロード: ${renamedFileName}`;
        renameBtn.style.marginLeft = '8px';
        renameBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            triggerDownload(pdfUrl, renamedFileName);
        });

        // 画像として保存ボタンを追加
        const imageBtn = createSaveAsImageButtonForViewer(imageBaseFileName);
        imageBtn.style.marginLeft = '8px';

        // クリップボードにコピーボタンを追加
        const copyBtn = createCopyAsImageButtonForViewer();
        copyBtn.style.marginLeft = '8px';

        // 既存ボタンの隣に追加
        btn.parentNode.insertBefore(renameBtn, btn.nextSibling);
        btn.parentNode.insertBefore(imageBtn, renameBtn.nextSibling);
        btn.parentNode.insertBefore(copyBtn, imageBtn.nextSibling);
    });
}

/**
 * URLから課題名を推測
 * @returns {string | null}
 */
function getContentNameFromUrl() {
    try {
        const url = new URL(window.location.href);

        // contents_name パラメータから取得
        const contentsName = url.searchParams.get('contents_name');
        if (contentsName) {
            return decodeURIComponent(contentsName);
        }

        // set_contents_id から取得できないので、リファラーをチェック
        if (document.referrer) {
            const refUrl = new URL(document.referrer);
            const refContentsName = refUrl.searchParams.get('contents_name');
            if (refContentsName) {
                return decodeURIComponent(refContentsName);
            }
        }
    } catch (e) {
        log('Error extracting content name from URL:', e);
    }
    return null;
}

/**
 * ファイル名を切り詰め
 * @param {string} name
 * @param {number} maxLength
 * @returns {string}
 */
function truncateFileName(name, maxLength) {
    if (name.length <= maxLength) return name;
    const ext = name.split('.').pop();
    const base = name.slice(0, name.length - ext.length - 1);
    const truncated = base.slice(0, maxLength - ext.length - 4) + '...';
    return truncated + '.' + ext;
}

/**
 * ダウンロード選択ダイアログを表示
 * @param {string} url
 * @param {string} renamedFileName
 * @param {string} originalFileName
 * @param {Event} event
 */
function showDownloadChoice(url, renamedFileName, originalFileName, event) {
    // シンプルなconfirmダイアログ
    const choice = confirm(
        `ダウンロード方法を選択:\n\n` +
        `[OK] リネームしてダウンロード\n→ ${renamedFileName}\n\n` +
        `[キャンセル] 元のファイル名でダウンロード\n→ ${originalFileName}`
    );

    if (choice) {
        triggerDownload(url, renamedFileName);
    } else {
        triggerDownload(url, null);
    }
}

/**
 * ダウンロードをトリガー
 * @param {string} url
 * @param {string | null} filename - nullの場合は元のファイル名を使用
 */
function triggerDownload(url, filename) {
    log('Triggering download:', { url, filename });

    // background.jsにメッセージを送信
    chrome.runtime.sendMessage({
        type: 'DOWNLOAD_FILE',
        url: url,
        filename: filename, // nullならリネームしない
        rename: filename !== null
    }, (response) => {
        if (chrome.runtime.lastError) {
            log('Error sending message:', chrome.runtime.lastError);
            // フォールバック: 直接ダウンロード
            window.open(url, '_blank');
        } else {
            log('Download initiated:', response);
        }
    });
}

// ============================================================
// PDF to Image Conversion
// ============================================================

/**
 * ダウンロードウィンドウ用の「画像として保存」ボタンを作成
 * PDFビューアを開いて、そこで画像保存を行う
 * @param {string} pdfUrl - PDFのURL
 * @param {string} baseFileName - ベースファイル名（拡張子なし）
 * @returns {HTMLButtonElement}
 */
function createSaveAsImageButton(pdfUrl, baseFileName) {
    const imageBtn = document.createElement('button');
    imageBtn.type = 'button';
    imageBtn.className = 'ux-download-btn ux-download-image';
    imageBtn.innerHTML = '画像として保存<br><small>PDFビューアで開く</small>';
    imageBtn.title = `PDFを画像として保存: ${baseFileName}`;
    imageBtn.style.cssText = 'padding: 10px 16px; font-size: 14px;';

    imageBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        imageBtn.disabled = true;
        imageBtn.innerHTML = '⏳ 開いています...<br><small>しばらくお待ちください</small>';

        try {
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    type: 'CONVERT_PDF_TO_IMAGES',
                    url: pdfUrl,
                    baseFileName: baseFileName
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            });

            if (response && response.success) {
                imageBtn.innerHTML = 'ビューアで開きました<br><small>画像ボタンを押してください</small>';
            } else {
                throw new Error(response?.error || 'Unknown error');
            }
        } catch (error) {
            log('Error opening PDF viewer:', error);
            imageBtn.innerHTML = 'エラー<br><small>開けませんでした</small>';
        }

        setTimeout(() => {
            imageBtn.innerHTML = '画像として保存<br><small>PDFビューアで開く</small>';
            imageBtn.disabled = false;
        }, 3000);
    });

    return imageBtn;
}

/**
 * PDFビューア用の「画像として保存」ボタンを作成
 * PDFビューアの既存のPDFDocumentを使用
 * @param {string} baseFileName - ベースファイル名（拡張子なし）
 * @returns {HTMLButtonElement}
 */
function createSaveAsImageButtonForViewer(baseFileName) {
    const imageBtn = document.createElement('button');
    imageBtn.type = 'button';
    imageBtn.className = 'ux-download-btn ux-download-image';
    imageBtn.innerHTML = '画像';
    imageBtn.title = `PDFを画像として保存: ${baseFileName}`;

    imageBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        imageBtn.disabled = true;
        const originalText = imageBtn.innerHTML;
        imageBtn.innerHTML = '⏳';

        try {
            await convertViewerPdfToImages(baseFileName);
            imageBtn.innerHTML = '完了';
            setTimeout(() => {
                imageBtn.innerHTML = originalText;
                imageBtn.disabled = false;
            }, 2000);
        } catch (error) {
            log('Error converting PDF to images:', error);
            imageBtn.innerHTML = '失敗';
            setTimeout(() => {
                imageBtn.innerHTML = originalText;
                imageBtn.disabled = false;
            }, 3000);
        }
    });

    return imageBtn;
}

/**
 * PDFビューア用の「画像としてクリップボードにコピー」ボタンを作成
 * 現在表示中のページをクリップボードにコピー
 * @returns {HTMLButtonElement}
 */
function createCopyAsImageButtonForViewer() {
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'ux-download-btn ux-download-copy';
    copyBtn.innerHTML = 'コピー';
    copyBtn.title = '現在のページを画像としてクリップボードにコピー';

    copyBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        copyBtn.disabled = true;
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '⏳';

        try {
            await copyCurrentPageToClipboard();
            copyBtn.innerHTML = '完了';
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.disabled = false;
            }, 2000);
        } catch (error) {
            log('Error copying to clipboard:', error);
            copyBtn.innerHTML = '失敗';
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.disabled = false;
            }, 3000);
        }
    });

    return copyBtn;
}

/**
 * 現在表示中のPDFページをクリップボードにコピー
 */
async function copyCurrentPageToClipboard() {
    log('Copying current page to clipboard');

    // 現在表示中のページを取得
    const viewerContainer = document.getElementById('viewerContainer');
    if (!viewerContainer) {
        throw new Error('Viewer container not found');
    }

    // 表示領域の中央にあるページを特定
    const containerRect = viewerContainer.getBoundingClientRect();
    const centerY = containerRect.top + containerRect.height / 2;

    const pageContainers = document.querySelectorAll('.page[data-page-number]');
    let currentPage = null;

    for (const page of pageContainers) {
        const pageRect = page.getBoundingClientRect();
        if (pageRect.top <= centerY && pageRect.bottom >= centerY) {
            currentPage = page;
            break;
        }
    }

    // 中央にページがない場合は最も近いページを選択
    if (!currentPage && pageContainers.length > 0) {
        let minDistance = Infinity;
        for (const page of pageContainers) {
            const pageRect = page.getBoundingClientRect();
            const pageCenter = pageRect.top + pageRect.height / 2;
            const distance = Math.abs(pageCenter - centerY);
            if (distance < minDistance) {
                minDistance = distance;
                currentPage = page;
            }
        }
    }

    if (!currentPage) {
        throw new Error('No page found');
    }

    const pageNum = currentPage.dataset.pageNumber;
    log(`Copying page ${pageNum}`);

    // Canvas要素を取得
    const canvas = currentPage.querySelector('canvas');
    if (!canvas) {
        throw new Error('Canvas not found for current page');
    }

    // CanvasをBlobに変換
    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Failed to create blob from canvas'));
            }
        }, 'image/png');
    });

    // クリップボードにコピー
    try {
        await navigator.clipboard.write([
            new ClipboardItem({
                'image/png': blob
            })
        ]);
        log(`Page ${pageNum} copied to clipboard`);
    } catch (error) {
        // Clipboard API が使えない場合のフォールバック
        log('Clipboard API failed, trying fallback:', error);
        throw new Error('クリップボードへのコピーに失敗しました。ブラウザの権限を確認してください。');
    }
}

/**
 * PDFビューアから既存のCanvas要素をキャプチャして画像としてダウンロード
 * CSP制限を回避するため、既にレンダリングされているCanvasを使用
 * @param {string} baseFileName - ベースファイル名（拡張子なし）
 */
async function convertViewerPdfToImages(baseFileName) {
    log('Converting viewer PDF to images using existing canvases');

    // PDFビューアのページコンテナを取得
    const pageContainers = document.querySelectorAll('.page[data-page-number]');

    if (pageContainers.length === 0) {
        throw new Error('PDF pages not found');
    }

    log(`Found ${pageContainers.length} pages`);

    // 全ページを表示させるためにスクロール
    // まず現在のスクロール位置を保存
    const originalScrollTop = document.getElementById('viewerContainer')?.scrollTop || 0;

    const images = [];

    for (let i = 0; i < pageContainers.length; i++) {
        const pageContainer = pageContainers[i];
        const pageNum = parseInt(pageContainer.dataset.pageNumber, 10);

        log(`Processing page ${pageNum}`);

        // ページを表示領域にスクロール
        pageContainer.scrollIntoView();

        // レンダリングを待つ
        await new Promise(resolve => setTimeout(resolve, 500));

        // Canvas要素を取得
        let canvas = pageContainer.querySelector('canvas');

        if (!canvas) {
            log(`Canvas not found for page ${pageNum}, waiting...`);
            // レンダリングを待つ
            await new Promise(resolve => setTimeout(resolve, 1000));
            canvas = pageContainer.querySelector('canvas');
        }

        if (!canvas) {
            log(`Canvas still not found for page ${pageNum}, skipping`);
            continue;
        }

        try {
            // Canvasから画像データを取得
            const imageData = canvas.toDataURL('image/png');
            images.push({ pageNum, imageData });
            log(`Captured page ${pageNum}`);
        } catch (e) {
            log(`Error capturing page ${pageNum}:`, e);
            // tainted canvasの場合はスキップ
        }
    }

    // スクロール位置を復元
    const viewerContainer = document.getElementById('viewerContainer');
    if (viewerContainer) {
        viewerContainer.scrollTop = originalScrollTop;
    }

    if (images.length === 0) {
        throw new Error('No pages could be captured');
    }

    log(`Captured ${images.length} pages, starting download`);

    // 画像をダウンロード
    for (let i = 0; i < images.length; i++) {
        const { pageNum, imageData } = images[i];
        const fileName = images.length === 1
            ? `${baseFileName}.png`
            : `${baseFileName}_${String(pageNum).padStart(3, '0')}.png`;

        await downloadBase64AsImage(imageData, fileName);

        if (i < images.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }

    log('All pages downloaded');
}

/**
 * PDFをURLからフェッチして画像に変換
 * ダウンロードウィンドウから使用する場合、PDFビューアを開く方式を使用
 * @param {string} pdfUrl - PDFのURL
 * @param {string} baseFileName - ベースファイル名（拡張子なし）
 */
async function convertPdfToImages(pdfUrl, baseFileName) {
    log('Converting PDF to images from URL:', pdfUrl);

    // background.jsにPDF変換をリクエスト
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'CONVERT_PDF_TO_IMAGES',
            url: pdfUrl,
            baseFileName: baseFileName
        }, (response) => {
            if (chrome.runtime.lastError) {
                log('Error:', chrome.runtime.lastError);
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            if (response && response.success) {
                resolve();
            } else {
                reject(new Error(response?.error || 'Unknown error'));
            }
        });
    });
}

/**
 * Canvasを画像としてダウンロード
 * @param {HTMLCanvasElement} canvas
 * @param {string} fileName
 */
async function downloadCanvasAsImage(canvas, fileName) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Failed to create blob'));
                return;
            }

            // Blob URLを作成
            const blobUrl = URL.createObjectURL(blob);

            // background.jsにダウンロードリクエストを送信
            chrome.runtime.sendMessage({
                type: 'DOWNLOAD_BLOB',
                url: blobUrl,
                filename: fileName
            }, (response) => {
                // Blob URLを解放
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

                if (chrome.runtime.lastError) {
                    log('Error sending download message:', chrome.runtime.lastError);
                    // フォールバック: 直接ダウンロード
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    resolve();
                } else {
                    log('Image download initiated:', response);
                    resolve();
                }
            });
        }, 'image/png');
    });
}

/**
 * Base64画像データをダウンロード
 * @param {string} base64Data - data:image/png;base64,... 形式
 * @param {string} fileName
 */
async function downloadBase64AsImage(base64Data, fileName) {
    return new Promise((resolve, reject) => {
        try {
            // Base64をBlobに変換
            const byteString = atob(base64Data.split(',')[1]);
            const mimeType = base64Data.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([ab], { type: mimeType });

            // Blob URLを作成
            const blobUrl = URL.createObjectURL(blob);

            // 直接ダウンロード（aタグ使用）
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // Blob URLを解放
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

            log('Image downloaded:', fileName);
            resolve();
        } catch (error) {
            log('Error downloading image:', error);
            reject(error);
        }
    });
}

// ============================================================
// Frame Support
// ============================================================

/**
 * フレーム内のコンテンツを監視して強化
 */
function observeFrames() {
    // 現在のフレームを処理
    enhanceDownloadLinks();

    // MutationObserverでDOMの変更を監視
    const observer = new MutationObserver((mutations) => {
        let shouldEnhance = false;
        for (const mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                shouldEnhance = true;
                break;
            }
        }
        if (shouldEnhance) {
            // デバウンス
            clearTimeout(window.uxEnhanceTimeout);
            window.uxEnhanceTimeout = setTimeout(() => {
                enhanceDownloadLinks();
            }, 500);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// ============================================================
// Shiryou (資料) Page UI Enhancement
// ============================================================

/**
 * 資料ページのUI改善を適用
 * 試験ページ(out_shiken1)の配色に合わせたリボン/テーマへ調整
 */
function enhanceShiryouPageUI() {
    const url = window.location.href;

    // txtbk_frame.php (フレームセット親) の場合
    if (url.includes('txtbk_frame.php')) {
        enhanceShiryouFrameset();
        return;
    }

    // txtbk_show_chapter.php (左サイドバー) の場合
    if (url.includes('txtbk_show_chapter.php')) {
        enhanceShiryouChapterFrame();
        return;
    }

    // txtbk_show_text.php (コンテンツフレーム) の場合
    if (url.includes('txtbk_show_text.php')) {
        enhanceShiryouContentFrame();
        return;
    }

    // title_simple.php (トップリボン) の場合 - 非表示にする
    if (url.includes('title_simple.php')) {
        hideEntireFrame();
        return;
    }
}

// ============================================================
// Shiken (試験) Page UI Enhancement
// ============================================================

function enhanceShikenPageUI() {
    const url = window.location.href;

    if (url.includes('qstn_frame.php')) {
        enhanceShikenFrameset();
        return;
    }

    if (url.includes('dqstn_button.php')) {
        enhanceShikenButtonFrame();
        return;
    }

    if (url.includes('dqstn_answer.php')) {
        enhanceShikenAnswerFrame();
        return;
    }
}

function enhanceShikenFrameset() {
    log('Enhancing shiken frameset');

    const outerFrameset = document.querySelector('frameset[rows]');
    const innerCols = document.querySelector('frameset[cols]');
    if (!outerFrameset || !innerCols) {
        log('Shiken frameset not found');
        return;
    }

    if (outerFrameset.getAttribute('data-ux-shiken') === 'true') {
        return;
    }
    outerFrameset.setAttribute('data-ux-shiken', 'true');

    // Hide top ribbon frame.
    const rows = outerFrameset.getAttribute('rows');
    if (rows && !rows.startsWith('0')) {
        outerFrameset.setAttribute('rows', rows.replace(/^\s*\d+/, '0'));
    }

    // Rebuild inner layout: left TOC, center PDF, right answers.
    const innerRows = innerCols.querySelector('frameset[rows]');
    const buttonFrame = innerCols.querySelector('frame[name="button"]');
    let questionFrame = innerCols.querySelector('frame[name="question"]');
    let answerFrame = innerCols.querySelector('frame[name="answer"]');

    if (innerRows) {
        questionFrame = innerRows.querySelector('frame[name="question"]') || questionFrame;
        answerFrame = innerRows.querySelector('frame[name="answer"]') || answerFrame;
        try {
            innerRows.remove();
        } catch (e) {
            innerRows.parentNode && innerRows.parentNode.removeChild(innerRows);
        }
    }

    if (buttonFrame) innerCols.appendChild(buttonFrame);
    if (questionFrame) innerCols.appendChild(questionFrame);
    if (answerFrame) innerCols.appendChild(answerFrame);

    innerCols.setAttribute('cols', '25%,*,25%');
    innerCols.setAttribute('frameborder', '1');
    innerCols.setAttribute('border', '0');
    innerCols.setAttribute('framespacing', '0');

    [questionFrame, answerFrame].forEach((frame) => {
        if (frame) {
            frame.setAttribute('noresize', '');
        }
    });

    // No top ribbon for shiken.
}

function tryInjectShikenHeader() {
    let attempts = 0;
    const maxAttempts = 12;

    const inject = () => {
        attempts += 1;
        try {
            const titleFrame = window.top.frames && window.top.frames['webclass_title'];
            if (!titleFrame || !titleFrame.document || !titleFrame.document.body) {
                throw new Error('title frame not ready');
            }

            if (titleFrame.document.getElementById('ux-shiken-header')) {
                return;
            }

            const titles = getShikenTitlesFromFrames();
            renderShikenHeader(titleFrame.document, titles);
            log('Injected shiken header');
            return;
        } catch (e) {
            if (attempts < maxAttempts) {
                setTimeout(inject, 250);
            } else {
                log('Failed to inject shiken header:', e?.message || e);
            }
        }
    };

    inject();
}

function getShikenTitlesFromFrames() {
    let courseName = '';
    let contentName = '';

    try {
        const buttonFrame = window.top.frames && window.top.frames['button'];
        if (buttonFrame && buttonFrame.document) {
            const h1 = buttonFrame.document.querySelector('#WsTitle h1');
            const h2 = buttonFrame.document.querySelector('#WsTitle h2');
            if (h1) courseName = h1.textContent.trim().replace(/^>\s*/, '');
            if (h2) contentName = h2.textContent.trim();
        }
    } catch (e) {
        // ignore cross-frame timing issues
    }

    if (!courseName) courseName = document.title.replace(/\s*-\s*WebClass.*/i, '').trim();
    if (!contentName) contentName = '試験';

    return { courseName, contentName };
}

function renderShikenHeader(doc, titles) {
    const { courseName, contentName } = titles;

    doc.body.innerHTML = '';
    doc.body.style.margin = '0';
    doc.body.style.padding = '0';
    doc.body.style.background = '#ffffff';
    doc.body.style.overflow = 'hidden';
    doc.body.style.fontFamily = `'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif`;

    const header = doc.createElement('div');
    header.id = 'ux-shiken-header';
    header.style.cssText = `
        height: 56px;
        background: #0056b3;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 18px;
        border-bottom: 1px solid #004a96;
        box-shadow: 0 2px 6px rgba(0,0,0,0.08);
        box-sizing: border-box;
    `;

    const titleBlock = doc.createElement('div');
    titleBlock.style.cssText = 'display:flex; flex-direction:column; gap:2px;';
    titleBlock.innerHTML = `
        <div style="font-size:12px;color:rgba(255,255,255,0.75); line-height:1;">${escapeHtml(courseName)}</div>
        <div style="font-size:15px;font-weight:600;color:#ffffff; line-height:1.2;">${escapeHtml(contentName)}</div>
    `;

    const badge = doc.createElement('div');
    badge.textContent = '試験';
    badge.style.cssText = `
        font-size: 11px;
        color: #0f172a;
        background: #e0f2fe;
        padding: 4px 10px;
        border-radius: 999px;
        letter-spacing: 0.06em;
        font-weight: 600;
    `;

    header.appendChild(titleBlock);
    header.appendChild(badge);
    doc.body.appendChild(header);
}

function enhanceShikenButtonFrame() {
    log('Enhancing shiken button frame');

    if (document.getElementById('ux-shiken-button-style')) return;

    const style = document.createElement('style');
    style.id = 'ux-shiken-button-style';
    style.textContent = `
        html, body { height: 100%; }
        body {
            margin: 0;
            background: #f4f7f6;
            font-family: 'Noto Sans JP', 'Yu Gothic', 'Meiryo', 'Hiragino Sans', 'Segoe UI', sans-serif;
            color: #0f172a;
            -webkit-font-smoothing: antialiased;
        }
        #top {
            min-height: 0 !important;
            background: #ffffff;
            border-bottom: 1px solid #e2e8f0;
            box-shadow: 0 2px 6px rgba(0,0,0,0.05);
            padding: 12px 12px 10px;
            box-sizing: border-box;
            overflow: visible;
        }
        #WsTitle {
            background: transparent !important;
            padding: 0 !important;
            margin: 0 0 6px 0;
            max-width: 100%;
        }
        #WsTitle h1 { display: none !important; }
        #WsTitle h2 {
            margin: 0;
            font-size: 12px;
            color: #475569;
            line-height: 1.3;
            white-space: normal;
            word-break: break-word;
            overflow-wrap: anywhere;
        }
        #User,
        .User,
        div[id*="User"] {
            margin-top: 6px;
            font-size: 11px;
            color: #94a3b8;
            display: none !important;
        }
        #top hr {
            border-color: #e2e8f0;
            margin: 8px 0 10px;
        }
        form[name="button_form"] {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .ux-shiken-nav-row {
            display: flex;
            gap: 6px;
            align-items: center;
            justify-content: center;
        }
        .ux-shiken-action-row {
            display: flex;
            justify-content: flex-end;
            gap: 6px;
        }
        .ux-btn {
            background: #ffffff;
            border: 1px solid #cbd5e1;
            color: #0f172a;
            border-radius: 6px;
            padding: 6px 10px;
            font-size: 12px;
            cursor: pointer;
            transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
            min-width: 84px;
        }
        .ux-btn:hover { background: #f1f5f9; }
        .ux-btn.ux-danger {
            background: #dc2626;
            border-color: #dc2626;
            color: #ffffff;
        }
        .ux-btn.ux-danger:hover {
            background: #b91c1c;
            border-color: #b91c1c;
        }
        .ux-btn:disabled {
            background: #e2e8f0;
            border-color: #cbd5e1;
            color: #94a3b8;
            cursor: not-allowed;
        }
        .limitInfo {
            margin-top: 8px !important;
            padding: 6px 8px !important;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            font-size: 11px;
            color: #475569;
        }
        #TOC {
            background: #f4f7f6;
            padding: 10px 12px 12px;
        }
        #TOCContent {
            border: none;
            background: #ffffff;
            border-radius: 10px;
            box-shadow: 0 4px 8px rgba(15, 23, 42, 0.05);
        }
    `;
    document.head.appendChild(style);

    const existingHeading = document.getElementById('ux-toc-heading');
    if (existingHeading) {
        existingHeading.remove();
    }

    // Style the TOC iframe (question list) if accessible.
    const tocIframe = document.getElementById('TOCContent');
    const injectTocStyle = () => {
        try {
            const tocDoc = tocIframe && (tocIframe.contentDocument || tocIframe.contentWindow?.document);
            if (!tocDoc || tocDoc.getElementById('ux-shiken-toc-style')) return;
            const tocStyle = tocDoc.createElement('style');
            tocStyle.id = 'ux-shiken-toc-style';
            tocStyle.textContent = `
                html, body { margin: 0; padding: 6px; background: #ffffff; font-family: 'Noto Sans JP', 'Yu Gothic', 'Meiryo', 'Hiragino Sans', 'Segoe UI', sans-serif; color: #0f172a; box-sizing: border-box; }
                table { width: 100%; border-collapse: collapse; }
                td { padding: 6px 8px; font-size: 12px; }
                .red_moji { display: none !important; }
                td.ux-toc-item { position: relative; padding-left: 18px; display: flex; align-items: center; gap: 6px; }
                td.ux-toc-item::before {
                    content: '';
                    position: absolute;
                    left: 7px;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: #94a3b8;
                    box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.2);
                }
                .ux-toc-label {
                    font-size: 12px;
                    line-height: 1;
                    color: #0f172a;
                }
                .ux-toc-star {
                    margin-left: 6px;
                    color: #94a3b8;
                    font-weight: 600;
                    font-size: 11px;
                    line-height: 1;
                }
                tr.bkkhaki td,
                td.bkkhaki {
                    background: transparent;
                    box-shadow: none;
                }
                tr.bkkhaki td.ux-toc-item::before,
                td.bkkhaki.ux-toc-item::before {
                    background: #0056b3;
                    box-shadow: 0 0 0 2px rgba(0, 86, 179, 0.15);
                }
                input[type="button"] {
                    background: #ffffff;
                    border: 1px solid #cbd5e1;
                    border-radius: 8px;
                    padding: 4px 8px;
                    font-size: 12px;
                    cursor: pointer;
                    min-width: 34px;
                }
                tr.bkkhaki input[type="button"],
                td.bkkhaki input[type="button"] {
                    background: #fde68a;
                    border-color: #f59e0b;
                    color: #92400e;
                }
            `;
            tocDoc.head.appendChild(tocStyle);

            const tocCells = tocDoc.querySelectorAll('td');
            tocCells.forEach((cell) => {
                const button = cell.querySelector('input[name="page_num"]');
                if (!button) return;
                if (cell.classList.contains('ux-toc-item')) return; // Already processed
                cell.classList.add('ux-toc-item');

                // Detect if star should be shown (before clearing the cell)
                const shouldAddStar = cell.textContent.includes('*');

                // Clear the cell completely and rebuild with clean structure
                // This ensures no stray text nodes remain
                while (cell.firstChild) {
                    if (cell.firstChild === button) {
                        // Keep button reference, just remove from DOM temporarily
                        cell.removeChild(button);
                    } else {
                        cell.removeChild(cell.firstChild);
                    }
                }

                // Rebuild: label + button + star (if needed)
                const label = tocDoc.createElement('span');
                label.className = 'ux-toc-label';
                label.textContent = '問';
                cell.appendChild(label);
                cell.appendChild(button);

                if (shouldAddStar) {
                    const star = tocDoc.createElement('span');
                    star.className = 'ux-toc-star';
                    star.textContent = '*';
                    cell.appendChild(star);
                }
            });
        } catch (e) {
            log('Could not style TOC iframe:', e?.message || e);
        }
    };

    if (tocIframe) {
        tocIframe.addEventListener('load', injectTocStyle);
        if (tocIframe.contentDocument && tocIframe.contentDocument.readyState !== 'loading') {
            injectTocStyle();
        }
    }

    const form = document.querySelector('form[name="button_form"]');
    if (form && !form.dataset.uxRebuilt) {
        form.dataset.uxRebuilt = 'true';
        const originalPrevBtn = form.querySelector('button[name="pre"], input[name="pre"]');
        const originalNextBtn = form.querySelector('button[name="next"], input[name="next"]');
        const originalFinishBtn = form.querySelector('button[name="grade"], input[name="grade"], button[onclick*="gradeAndClose"], input[onclick*="gradeAndClose"]');
        const hasPrev = !!originalPrevBtn;
        const hasNext = !!originalNextBtn;
        const hasFinish = !!originalFinishBtn;

        const hiddenInputs = Array.from(form.querySelectorAll('input[type="hidden"]'));

        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'ux-btn';
        prevBtn.textContent = '前のページ';
        prevBtn.disabled = !hasPrev;
        prevBtn.addEventListener('click', () => {
            if (originalPrevBtn) {
                originalPrevBtn.click();
            } else if (typeof window.prevPage === 'function') {
                window.prevPage();
            }
        });

        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'ux-btn';
        nextBtn.textContent = '次のページ';
        nextBtn.disabled = !hasNext;
        nextBtn.addEventListener('click', () => {
            if (originalNextBtn) {
                originalNextBtn.click();
            } else if (typeof window.nextPage === 'function') {
                window.nextPage();
            }
        });

        const finishBtn = document.createElement('button');
        finishBtn.type = 'button';
        finishBtn.className = 'ux-btn ux-danger';
        finishBtn.textContent = '終了';
        finishBtn.disabled = !hasFinish;
        finishBtn.addEventListener('click', () => {
            if (originalFinishBtn) {
                originalFinishBtn.click();
            } else if (typeof window.gradeAndClose === 'function') {
                window.gradeAndClose();
            }
        });

        const navRow = document.createElement('div');
        navRow.className = 'ux-shiken-nav-row';
        navRow.appendChild(prevBtn);
        navRow.appendChild(nextBtn);

        const actionRow = document.createElement('div');
        actionRow.className = 'ux-shiken-action-row';
        actionRow.appendChild(finishBtn);

        form.innerHTML = '';
        hiddenInputs.forEach((input) => form.appendChild(input));
        // 元のボタンを非表示でフォームに追加（クリック可能にするため）
        if (originalPrevBtn) {
            originalPrevBtn.style.display = 'none';
            form.appendChild(originalPrevBtn);
        }
        if (originalNextBtn) {
            originalNextBtn.style.display = 'none';
            form.appendChild(originalNextBtn);
        }
        if (originalFinishBtn) {
            originalFinishBtn.style.display = 'none';
            form.appendChild(originalFinishBtn);
        }
        form.appendChild(navRow);
        form.appendChild(actionRow);
    }
}

function enhanceShikenAnswerFrame() {
    log('Enhancing shiken answer frame');
    if (document.getElementById('ux-shiken-answer-style')) return;

    const style = document.createElement('style');
    style.id = 'ux-shiken-answer-style';
    style.textContent = `
        html, body { height: 100%; }
        body {
            margin: 0;
            background: #f4f7f6;
            font-family: 'Noto Sans JP', 'Yu Gothic', 'Meiryo', 'Hiragino Sans', 'Segoe UI', sans-serif;
            color: #0f172a;
            padding: 12px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
        }
        form[name="answer_form"] {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 12px;
            box-shadow: 0 4px 8px rgba(15, 23, 42, 0.06);
            flex: 1 1 auto;
            min-height: calc(100vh - 24px);
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 12px;
            height: 100%;
        }
        table.qstnoptions { flex: 1 1 auto; }
        #QstnOperation { display: none !important; }
        .ux-answer-nav {
            margin-top: auto;
            display: flex;
            justify-content: center;
            gap: 6px;
            padding-top: 8px;
        }
        .ux-answer-nav .ux-btn {
            min-width: 96px;
            flex: 0 0 auto;
        }
        #GradeBtn { display: none !important; }
        table.qstnoptions, table#QstnOperation {
            width: 100%;
        }
        table.qstnoptions th, table.qstnoptions td {
            padding: 6px 8px;
            vertical-align: top;
        }
        table.qstnoptions th {
            width: 36px;
            text-align: center;
            vertical-align: top;
            font-weight: 600;
            color: #475569;
        }
        table.qstnoptions td {
            vertical-align: top;
        }
        table.selcomplex th,
        table.selcomplex td {
            padding: 6px 6px;
            vertical-align: top;
        }
        .ux-native-select,
        select, input[type="text"], textarea {
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 4px 6px;
            font-size: 12px;
            font-family: inherit;
            background-color: #ffffff;
            color: #0f172a;
        }
        select:focus, input[type="text"]:focus, textarea:focus,
        .ux-select-display:focus {
            outline: none;
            border-color: #0056b3;
            box-shadow: 0 0 0 2px rgba(0, 86, 179, 0.15);
        }
        .ux-select-wrap {
            position: relative;
            display: inline-block;
            min-width: 140px;
            vertical-align: top;
        }
        .ux-native-select {
            position: absolute !important;
            inset: 0;
            opacity: 0;
            pointer-events: none;
        }
        .ux-select-display {
            width: 100%;
            text-align: left;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 4px 26px 4px 8px;
            font-size: var(--ux-select-display-font-size, 14px);
            color: #0f172a;
            cursor: pointer;
            position: relative;
            display: flex;
            align-items: center;
            min-height: 32px;
            height: auto;
            line-height: 1.25;
            box-sizing: border-box;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .ux-select-display::after {
            content: '';
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            width: 10px;
            height: 10px;
            background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23647569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat center;
            opacity: 0.8;
        }
        .ux-select-list {
            position: absolute;
            left: 0;
            right: 0;
            top: calc(100% + 6px);
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            box-shadow: 0 8px 16px rgba(15, 23, 42, 0.12);
            max-height: 220px;
            overflow-y: auto;
            display: none;
            z-index: 5;
            padding: 4px;
            box-sizing: border-box;
        }
        .ux-select-wrap.ux-open .ux-select-list { display: block; }
        .ux-select-option {
            width: 100%;
            text-align: left;
            background: transparent;
            border: none;
            padding: 6px 8px;
            border-radius: 6px;
            font-size: var(--ux-select-option-font-size, 14px);
            line-height: 1.25;
            min-height: 32px;
            cursor: pointer;
            color: #0f172a;
        }
        .ux-select-option:hover {
            background: #e8f2ff;
        }
        .ux-select-option[aria-selected="true"] {
            background: #dbeafe;
            font-weight: 600;
        }
        input[type="button"], button {
            background: #0056b3;
            border: 1px solid #0056b3;
            color: #ffffff;
            border-radius: 6px;
            padding: 6px 10px;
            font-size: 12px;
            cursor: pointer;
        }
        input[type="button"]:hover, button:hover {
            background: #004a96;
            border-color: #004a96;
        }
        input[type="button"]:disabled, button:disabled {
            background: #e2e8f0;
            border-color: #cbd5e1;
            color: #94a3b8;
            cursor: not-allowed;
        }
    `;
    document.head.appendChild(style);

    const opTable = document.getElementById('QstnOperation');
    if (opTable && !opTable.dataset.uxRebuilt) {
        opTable.dataset.uxRebuilt = 'true';
        const rows = Array.from(opTable.querySelectorAll('tr'));
        rows.forEach((row) => {
            const hasControls = row.querySelector('input, button');
            const text = row.textContent.replace(/\s|\u00a0/g, '');
            if (!hasControls && text.length === 0) {
                row.remove();
            }
        });

        const ensureDisabledButton = (label) => {
            const hasBtn = Array.from(opTable.querySelectorAll('input, button')).some((el) => {
                return (el.value && el.value.includes(label)) || (el.textContent && el.textContent.includes(label));
            });
            if (hasBtn) return;
            const targetCell = Array.from(opTable.querySelectorAll('td')).find((td) => td.textContent.includes(label));
            if (!targetCell) return;
            targetCell.textContent = '';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label;
            btn.disabled = true;
            targetCell.appendChild(btn);
        };

        ensureDisabledButton('前のページ');
        ensureDisabledButton('次のページ');

        // Remove any finish button on the right side.
        Array.from(opTable.querySelectorAll('button, input')).forEach((el) => {
            const label = el.value || el.textContent || '';
            if (label.includes('終了')) {
                el.remove();
            }
        });
    }

    const form = document.querySelector('form[name="answer_form"]');
    if (form && !form.dataset.uxNavBuilt) {
        form.dataset.uxNavBuilt = 'true';
        const originalPrevBtn = document.querySelector('#QstnPrevBtn, input[name="pre"], button[name="pre"]');
        const originalNextBtn = document.querySelector('#QstnNextBtn, input[name="next"], button[name="next"]');
        const hasPrev = !!originalPrevBtn;
        const hasNext = !!originalNextBtn;

        const nav = document.createElement('div');
        nav.className = 'ux-answer-nav';

        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'ux-btn';
        prevBtn.textContent = '前のページ';
        prevBtn.disabled = !hasPrev;
        prevBtn.addEventListener('click', () => {
            if (originalPrevBtn) {
                originalPrevBtn.click();
            } else if (typeof window.prevPage === 'function') {
                window.prevPage();
            }
        });

        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'ux-btn';
        nextBtn.textContent = '次のページ';
        nextBtn.disabled = !hasNext;
        nextBtn.addEventListener('click', () => {
            if (originalNextBtn) {
                originalNextBtn.click();
            } else if (typeof window.nextPage === 'function') {
                window.nextPage();
            }
        });

        nav.appendChild(prevBtn);
        nav.appendChild(nextBtn);
        form.appendChild(nav);
    }

    const defaultSelectVisibleCount = 12;
    const resolveSelectVisibleCount = (cb) => {
        try {
            chrome.storage.local.get({ shikenSelectVisibleCount: String(defaultSelectVisibleCount) }, (items) => {
                let count = parseInt(items.shikenSelectVisibleCount, 10);
                if (Number.isNaN(count) || count < 0) {
                    count = defaultSelectVisibleCount;
                }
                cb(count);
            });
        } catch (e) {
            cb(defaultSelectVisibleCount);
        }
    };

    if (form && !form.dataset.uxSelectBuilt) {
        form.dataset.uxSelectBuilt = 'true';
        const selects = Array.from(form.querySelectorAll('select'));

        const closeAll = () => {
            document.querySelectorAll('.ux-select-wrap.ux-open').forEach((wrap) => {
                const state = wrap.__uxSelectState;
                if (state) {
                    state.pendingIndex = state.select.selectedIndex;
                    const committedText = state.select.options[state.pendingIndex]?.text || '';
                    state.display.textContent = committedText;
                    state.items.forEach((item, idx) => {
                        if (idx === state.pendingIndex) {
                            item.setAttribute('aria-selected', 'true');
                        } else {
                            item.removeAttribute('aria-selected');
                        }
                    });
                }
                wrap.classList.remove('ux-open');
            });
        };

        resolveSelectVisibleCount((visibleCount) => {
            const itemHeight = 32;
            const listMaxHeight = visibleCount === 0 ? 'none' : `${visibleCount * itemHeight}px`;

            selects.forEach((select) => {
                if (select.dataset.uxSelect === 'true') return;
                select.dataset.uxSelect = 'true';

                const wrap = document.createElement('div');
                wrap.className = 'ux-select-wrap';

                const display = document.createElement('button');
                display.type = 'button';
                display.className = 'ux-select-display';
                display.textContent = select.options[select.selectedIndex]?.text || '';
                display.style.fontSize = 'var(--ux-select-display-font-size, 14px)';
                display.style.minHeight = '34px';

                const list = document.createElement('div');
                list.className = 'ux-select-list';
                list.style.maxHeight = listMaxHeight;
                list.style.overflowY = visibleCount === 0 ? 'visible' : 'auto';

                const items = [];
                Array.from(select.options).forEach((opt, idx) => {
                    const item = document.createElement('button');
                    item.type = 'button';
                    item.className = 'ux-select-option';
                    item.textContent = opt.text;
                    item.style.fontSize = 'var(--ux-select-option-font-size, 14px)';
                    item.style.minHeight = '34px';
                    item.style.lineHeight = '1.25';
                    if (opt.disabled) {
                        item.disabled = true;
                        item.style.opacity = '0.5';
                    }
                    if (opt.selected) {
                        item.setAttribute('aria-selected', 'true');
                    }
                    item.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (opt.disabled) return;
                        const state = wrap.__uxSelectState;
                        if (!state) return;
                        state.pendingIndex = idx;
                        display.textContent = opt.text;
                        list.querySelectorAll('.ux-select-option').forEach((btn) => btn.removeAttribute('aria-selected'));
                        item.setAttribute('aria-selected', 'true');
                    });
                    list.appendChild(item);
                    items.push(item);
                });

                select.classList.add('ux-native-select');
                select.parentNode.insertBefore(wrap, select);
                wrap.appendChild(select);
                wrap.appendChild(display);
                wrap.appendChild(list);

                const state = {
                    select,
                    display,
                    list,
                    items,
                    pendingIndex: select.selectedIndex
                };
                wrap.__uxSelectState = state;

                const updatePending = (newIndex) => {
                    if (newIndex < 0 || newIndex >= select.options.length) return;
                    state.pendingIndex = newIndex;
                    const nextText = select.options[newIndex]?.text || '';
                    display.textContent = nextText;
                    state.items.forEach((item, idx) => {
                        if (idx === newIndex) {
                            item.setAttribute('aria-selected', 'true');
                            item.scrollIntoView({ block: 'nearest' });
                        } else {
                            item.removeAttribute('aria-selected');
                        }
                    });
                };

                const commitPending = () => {
                    const idx = state.pendingIndex;
                    if (idx < 0 || idx >= select.options.length) return;
                    const opt = select.options[idx];
                    if (opt && !opt.disabled) {
                        select.value = opt.value;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                };

                const findNextEnabled = (start, step) => {
                    const total = select.options.length;
                    if (total === 0) return start;
                    let idx = start;
                    for (let i = 0; i < total; i += 1) {
                        idx = (idx + step + total) % total;
                        if (!select.options[idx].disabled) {
                            return idx;
                        }
                    }
                    return start;
                };

                display.addEventListener('click', (e) => {
                    e.preventDefault();
                    const isOpen = wrap.classList.contains('ux-open');
                    if (isOpen) {
                        commitPending();
                        wrap.classList.remove('ux-open');
                    } else {
                        closeAll();
                        state.pendingIndex = select.selectedIndex;
                        updatePending(state.pendingIndex);
                        wrap.classList.add('ux-open');
                    }
                });

                display.addEventListener('wheel', (e) => {
                    if (!wrap.classList.contains('ux-open')) return;
                    e.preventDefault();
                    const step = e.deltaY > 0 ? 1 : -1;
                    const nextIndex = findNextEnabled(state.pendingIndex, step);
                    updatePending(nextIndex);
                }, { passive: false });
            });
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.ux-select-wrap')) {
                closeAll();
            }
        });
    }

    // 終了確認ダイアログに終了ボタンを追加する機能
    const addFinishButtonToDialog = () => {
        // すべての「戻る」ボタンを探す
        const backButtons = document.querySelectorAll('input[value="戻る"], button[value="戻る"]');

        backButtons.forEach((backButton) => {
            // 既に終了ボタンが追加されているか確認
            if (backButton.dataset.uxFinishButtonAdded) return;

            // 親要素のテキストを確認
            let container = backButton.closest('table, div, form, body');
            if (!container) container = backButton.parentElement;

            const text = container.textContent || '';
            if (text.includes('まだ全ての問いに答えていません') ||
                text.includes('本当にこのまま終了しますか')) {

                backButton.dataset.uxFinishButtonAdded = 'true';
                log('Found finish confirmation dialog, adding finish button');

                // 終了ボタンを作成
                const finishButton = document.createElement('input');
                finishButton.type = 'button';
                finishButton.value = '終了';
                finishButton.className = backButton.className; // 同じスタイルを適用
                finishButton.style.marginLeft = '8px';
                finishButton.style.backgroundColor = '#dc3545';
                finishButton.style.borderColor = '#dc3545';
                finishButton.style.color = '#ffffff';
                finishButton.style.cursor = 'pointer';

                // ホバー効果を追加
                finishButton.addEventListener('mouseenter', () => {
                    finishButton.style.backgroundColor = '#c82333';
                    finishButton.style.borderColor = '#bd2130';
                });
                finishButton.addEventListener('mouseleave', () => {
                    finishButton.style.backgroundColor = '#dc3545';
                    finishButton.style.borderColor = '#dc3545';
                });

                finishButton.addEventListener('click', () => {
                    log('Finish button clicked in dialog');
                    // 元のgradeAndClose関数を呼び出す
                    if (typeof window.gradeAndClose === 'function') {
                        window.gradeAndClose();
                    } else if (window.parent && typeof window.parent.gradeAndClose === 'function') {
                        window.parent.gradeAndClose();
                    } else {
                        // フォールバック: grade送信を試みる
                        const form = document.querySelector('form[name="answer_form"]');
                        if (form) {
                            const sendCmd = form.querySelector('input[name="sendCmd"]');
                            if (sendCmd) {
                                sendCmd.value = 'grade';
                                form.submit();
                            }
                        }
                    }
                });

                // 戻るボタンの後に終了ボタンを追加
                if (backButton.nextSibling) {
                    backButton.parentNode.insertBefore(finishButton, backButton.nextSibling);
                } else {
                    backButton.parentNode.appendChild(finishButton);
                }

                log('Finish button added to dialog after back button');
            }
        });
    };

    // 初回チェック
    addFinishButtonToDialog();

    // MutationObserverでダイアログの表示を監視
    const dialogObserver = new MutationObserver((mutations) => {
        addFinishButtonToDialog();
    });

    dialogObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

/**
 * コンテンツフレーム（右側のPDF表示部分）のUI改善
 */
function enhanceShiryouContentFrame() {
    log('Enhancing shiryou content frame');

    // framesetが含まれている場合のみ（PDFビューアを含むframeset）
    // メッセージバーを非表示にする処理を行う
    const hasFrameset = document.querySelector('frameset');

    if (hasFrameset) {
        // PDFを表示するframesetページの場合
        // 「表示に問題があるときは...」のメッセージはloaditフレームで処理済み
        log('Content frame has frameset, no additional processing needed');
        return;
    }

    // framesetがない場合（テキストコンテンツ等）は何もしない
    // コンテンツを正常に表示する
    log('Content frame has no frameset, showing content as-is');
}

/**
 * 特定のテキストを含む要素を非表示
 */
function hideTextContaining(searchText) {
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let node;
    while (node = walker.nextNode()) {
        if (node.textContent.includes(searchText)) {
            let element = node.parentElement;
            // 親を遡って適切な要素を非表示にする
            while (element && element !== document.body) {
                if (element.tagName === 'DIV' || element.tagName === 'P' ||
                    element.tagName === 'SPAN' || element.tagName === 'TD' ||
                    element.tagName === 'TR' || element.tagName === 'TABLE') {
                    element.style.display = 'none';
                    log('Hidden element containing:', searchText);
                    break;
                }
                element = element.parentElement;
            }
        }
    }
}

// NOTE: beforeunload blocking is now handled by beforeunload-blocker.js
// which is injected via manifest.json with world: "MAIN" to bypass CSP

/**
 * beforeunload警告を無効化する（指定されたウィンドウ）
 * WebClassが設定するページ離脱警告をブロックする
 * @param {Window} targetWindow - 対象のウィンドウオブジェクト
 */
function disableBeforeUnloadWarningForWindow(targetWindow) {
    try {
        // キャプチャフェーズで最優先でイベントを処理し、警告を完全にブロック
        // これが最も確実な方法
        targetWindow.addEventListener('beforeunload', (e) => {
            // Stop other listeners without triggering the dialog.
            e.stopImmediatePropagation();
            e.stopPropagation();
            try {
                delete e.returnValue;
            } catch (ex) { }
        }, true);

        // window.onbeforeunloadをnullで上書き
        targetWindow.onbeforeunload = null;

        // Object.definePropertyで上書きを防止
        try {
            Object.defineProperty(targetWindow, 'onbeforeunload', {
                get: () => null,
                set: (val) => {
                    log('Blocked onbeforeunload assignment:', typeof val);
                },
                configurable: true
            });
        } catch (e) {
            // 一部の環境ではdefinePropertyが失敗する
        }

        // addEventListenerを上書きしてbeforeunloadリスナーの追加をブロック
        if (!targetWindow.__uxAddEventListenerPatched) {
            targetWindow.__uxAddEventListenerPatched = true;
            const originalAddEventListener = targetWindow.addEventListener.bind(targetWindow);
            targetWindow.addEventListener = function (type, listener, options) {
                if (type === 'beforeunload') {
                    log('Blocked beforeunload listener registration');
                    return;
                }
                return originalAddEventListener(type, listener, options);
            };
        }

        // 定期的にonbeforeunloadをクリア（WebClassが後から設定する場合に対応）
        // 最初の10秒間、500msごとにクリア
        if (!targetWindow.__uxBeforeUnloadClearerStarted) {
            targetWindow.__uxBeforeUnloadClearerStarted = true;
            let clearCount = 0;
            const maxClears = 20; // 10秒間 (500ms * 20)
            const clearerId = setInterval(() => {
                try {
                    // 直接プロパティアクセスでnullを設定
                    const descriptor = Object.getOwnPropertyDescriptor(targetWindow, 'onbeforeunload');
                    if (!descriptor || descriptor.configurable) {
                        // definePropertyが効いていない場合は直接クリア
                        try {
                            delete targetWindow.onbeforeunload;
                        } catch (ex) { }
                        targetWindow.onbeforeunload = null;
                    }
                } catch (ex) { }

                clearCount++;
                if (clearCount >= maxClears) {
                    clearInterval(clearerId);
                }
            }, 500);
        }

        log('Disabled beforeunload warning for window');
    } catch (e) {
        log('Error disabling beforeunload for window:', e?.message || e);
    }
}

/**
 * beforeunload警告を無効化する（現在のウィンドウとtop）
 */
function disableBeforeUnloadWarning() {
    // 現在のウィンドウ
    disableBeforeUnloadWarningForWindow(window);

    // window.topにも適用（フレーム内から呼ばれた場合）
    try {
        if (window.top && window.top !== window) {
            disableBeforeUnloadWarningForWindow(window.top);
        }
    } catch (e) {
        // クロスオリジンの場合はスキップ
    }
}

/**
 * 全フレームでbeforeunload警告を無効化
 */
function disableBeforeUnloadWarningInAllFrames() {
    try {
        // メインウィンドウとtop
        disableBeforeUnloadWarning();

        // 全てのフレームに適用
        const frameNames = ['webclass_title', 'webclass_chapter', 'webclass_content'];
        frameNames.forEach(frameName => {
            try {
                const frame = window.frames[frameName];
                if (frame) {
                    // framesオブジェクトから直接アクセス（contentWindowを使わない）
                    disableBeforeUnloadWarningForWindow(frame);
                    log('Disabled beforeunload warning for frame:', frameName);
                }
            } catch (frameErr) {
                log('Could not disable beforeunload for frame:', frameName, frameErr?.message || frameErr);
            }
        });

        // 全てのframe/iframe要素にも適用
        try {
            const allFrameElements = document.querySelectorAll('frame, iframe');
            allFrameElements.forEach((el, idx) => {
                try {
                    if (el.contentWindow) {
                        disableBeforeUnloadWarningForWindow(el.contentWindow);
                        log('Disabled beforeunload for frame element', idx);
                    }
                } catch (e) {
                    // クロスオリジンなど
                }
            });
        } catch (e) {
            // querySelectorAll失敗
        }

    } catch (e) {
        log('Error disabling beforeunload warnings:', e?.message || e);
    }
}

/**
 * リボン（ヘッダー）の表示切り替え
 * @param {boolean} show - 表示するかどうか
 */
function toggleRibbon(show) {
    const frameset = window.top.document.querySelector('frameset');
    if (!frameset) return;

    const topDoc = window.top.document;
    const tocOverlay = topDoc.getElementById('ux-toc-overlay-iframe');
    const loadingOverlay = topDoc.getElementById('ux-content-loading-overlay');
    const hoverZone = topDoc.getElementById('ux-toc-hover-zone');

    if (show) {
        // 表示 (55px)
        const rows = frameset.getAttribute('rows');
        if (rows) {
            frameset.setAttribute('rows', rows.replace(/^\d+/, '55'));
        }

        // 展開ボタンを削除
        removeFloatingExpandButton();

        // TOCオーバーレイの位置を調整（リボン分下に）
        if (tocOverlay) {
            tocOverlay.style.top = '55px';
            tocOverlay.style.height = 'calc(100vh - 55px)';
        }
        if (loadingOverlay) {
            loadingOverlay.style.top = '55px';
        }
        if (hoverZone) {
            hoverZone.style.top = '55px';
            hoverZone.style.height = 'calc(100vh - 55px)';
        }
    } else {
        // 非表示 (0px)
        const rows = frameset.getAttribute('rows');
        if (rows) {
            frameset.setAttribute('rows', rows.replace(/^\d+/, '0'));
        }

        // 展開ボタンを表示
        createFloatingExpandButton();

        // TOCオーバーレイの位置を調整（最上部から）
        if (tocOverlay) {
            tocOverlay.style.top = '0';
            tocOverlay.style.height = '100vh';
        }
        if (loadingOverlay) {
            loadingOverlay.style.top = '0';
        }
        if (hoverZone) {
            hoverZone.style.top = '0';
            hoverZone.style.height = '100vh';
        }
    }
}

/**
 * フロート展開ボタンを作成・表示
 */
function createFloatingExpandButton() {
    const topDoc = window.top.document;
    if (topDoc.getElementById('ux-ribbon-expand-btn')) return;

    const btn = topDoc.createElement('div');
    btn.id = 'ux-ribbon-expand-btn';
    btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    `;
    btn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 48px;
        height: 48px;
        background: rgba(19, 101, 181, 0.75);
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 10000;
        transition: background 0.2s, transform 0.2s;
        backdrop-filter: blur(4px);
        box-shadow: 0 4px 6px rgba(12, 62, 112, 0.25);
        user-select: none;
        touch-action: none;
    `;
    btn.title = 'リボンを表示';

    // ホバー効果
    btn.onmouseover = () => {
        btn.style.background = 'rgba(19, 101, 181, 0.9)';
        btn.style.transform = 'scale(1.05)';
    };
    btn.onmouseout = () => {
        btn.style.background = 'rgba(19, 101, 181, 0.75)';
        btn.style.transform = 'scale(1)';
    };

    // クリックでリボン表示
    btn.onclick = (e) => {
        if (btn.hasAttribute('data-dragged')) {
            btn.removeAttribute('data-dragged');
            return;
        }
        toggleRibbon(true);
    };

    // ドラッグ機能
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    const onMouseDown = (e) => {
        e.preventDefault(); // テキスト選択などを防止

        // タッチイベント対応
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);

        if (clientX === undefined || clientY === undefined) return;

        isDragging = true;
        startX = clientX;
        startY = clientY;

        const rect = btn.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        btn.style.bottom = 'auto';
        btn.style.right = 'auto';
        btn.style.left = initialLeft + 'px';
        btn.style.top = initialTop + 'px';
        btn.style.cursor = 'grabbing';

        // イベントリスナーをdocumentに追加（フレーム外れ防止のためtopDocに）
        topDoc.addEventListener('mousemove', onMouseMove);
        topDoc.addEventListener('mouseup', onMouseUp);
        topDoc.addEventListener('touchmove', onMouseMove, { passive: false });
        topDoc.addEventListener('touchend', onMouseUp);
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        e.preventDefault();

        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);

        if (clientX === undefined || clientY === undefined) return;

        const deltaX = clientX - startX;
        const deltaY = clientY - startY;

        if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
            btn.setAttribute('data-dragged', 'true');
        }

        btn.style.left = (initialLeft + deltaX) + 'px';
        btn.style.top = (initialTop + deltaY) + 'px';
    };

    const onMouseUp = () => {
        isDragging = false;
        btn.style.cursor = 'pointer';
        topDoc.removeEventListener('mousemove', onMouseMove);
        topDoc.removeEventListener('mouseup', onMouseUp);
        topDoc.removeEventListener('touchmove', onMouseMove);
        topDoc.removeEventListener('touchend', onMouseUp);

        // 画面外にはみ出さないように補正
        const rect = btn.getBoundingClientRect();
        const winWidth = window.top.innerWidth;
        const winHeight = window.top.innerHeight;

        let newLeft = rect.left;
        let newTop = rect.top;

        if (newLeft < 10) newLeft = 10;
        if (newLeft + rect.width > winWidth - 10) newLeft = winWidth - 10 - rect.width;
        if (newTop < 10) newTop = 10;
        if (newTop + rect.height > winHeight - 10) newTop = winHeight - 10 - rect.height;

        btn.style.left = newLeft + 'px';
        btn.style.top = newTop + 'px';
    };

    btn.addEventListener('mousedown', onMouseDown);
    btn.addEventListener('touchstart', onMouseDown, { passive: false });

    topDoc.documentElement.appendChild(btn);
}

/**
 * フロート展開ボタンを削除
 */
function removeFloatingExpandButton() {
    const topDoc = window.top.document;
    const btn = topDoc.getElementById('ux-ribbon-expand-btn');
    if (btn) {
        btn.remove();
    }
}

/**
 * フレームセット親のUI改善
 * トップリボンを削除し、新しいヘッダーを挿入
 */
function enhanceShiryouFrameset() {
    log('Enhancing shiryou frameset');

    // beforeunload警告を無効化（ページを閉じる・リロード時の警告を防止）
    disableBeforeUnloadWarning();
    // 各フレームが読み込まれた際にも警告を無効化
    window.addEventListener('load', () => {
        disableBeforeUnloadWarningInAllFrames();
    });

    // 親フレームから子フレーム（webclass_chapter）のonbeforeunloadを直接クリアする
    // ブラウザテストで手動クリアが成功したため、この方法を使用
    let clearCount = 0;
    const maxClears = 60; // 30秒間
    const chapterClearer = setInterval(() => {
        try {
            const chapterFrame = window.frames['webclass_chapter'];
            if (chapterFrame) {
                // chapterフレームのonbeforeunloadを直接クリア
                if (chapterFrame.onbeforeunload !== null) {
                    log('Clearing webclass_chapter.onbeforeunload from parent frame');
                    chapterFrame.onbeforeunload = null;
                }
            }
        } catch (e) {
            // クロスオリジンなど
        }

        clearCount++;
        if (clearCount >= maxClears) {
            clearInterval(chapterClearer);
            log('Stopped chapter frame beforeunload clearer after 30s');
        }
    }, 500);

    // 設定を読み込んでから実行
    chrome.storage.local.get({
        tocInitialState: 'open',
        tocInitialCloseDelay: '5',
        tocAutoHide: false,
        tocAutoHideDelay: '10',
        tocShowSectionTitles: true,
        tocHoverReveal: true
    }, (options) => {
        // フレームセットの rows を変更 (上部フレームを55pxに変更してヘッダーとして使用)
        const framesets = document.querySelectorAll('frameset');

        framesets.forEach(fs => {
            const rows = fs.getAttribute('rows');
            if (rows) {
                // 55,* または他の行設定を 55,* に変更（ヘッダー用にサイズ調整）
                const newRows = rows.replace(/^\d+/, '55');
                fs.setAttribute('rows', newRows);
                log('Adjusted title frame size for custom header:', rows, '->', newRows);
            }

            // 内部のフレームセット（cols属性）をPDF全幅表示用に変更
            const cols = fs.getAttribute('cols');
            if (cols) {
                // 目次を非表示にしてPDFを全幅に（目次はiframeオーバーレイで表示）
                fs.setAttribute('cols', '0,*');
                log('Set PDF to full width, TOC will be shown as iframe overlay');
            }
        });

        // title_simple フレームを新しいヘッダーに変換
        // フレームの読み込みを待つために複数回試行
        let attempts = 0;
        const maxAttempts = 10;

        function tryInjectHeader() {
            attempts++;
            log('Attempting to inject header, attempt:', attempts);

            try {
                const titleFrame = window.frames['webclass_title'];
                if (titleFrame && titleFrame.document && titleFrame.document.body) {
                    // 資料名を取得
                    let contentName = '資料';
                    let tocHtml = '';
                    try {
                        const chapterFrame = window.frames['webclass_chapter'];
                        if (chapterFrame && chapterFrame.document) {
                            const h2 = chapterFrame.document.querySelector('#WsTitle h2');
                            if (h2) {
                                contentName = h2.textContent.trim();
                            }
                            const input = chapterFrame.document.querySelector('input[name="contents_name"]');
                            if (input && input.value) {
                                contentName = input.value;
                            }
                            // 目次の内容を取得
                            const tocElement = chapterFrame.document.querySelector('#TOC');
                            if (tocElement) {
                                tocHtml = tocElement.innerHTML;
                            }
                        }
                    } catch (e) {
                        log('Could not get content name from chapter frame');
                    }

                    // 現在のURLからset_contents_idを取得
                    const urlParams = new URLSearchParams(window.location.search);
                    const contentsId = urlParams.get('set_contents_id') || '';

                    // title_simple フレームの内容を置換（目次オーバーレイ付き）
                    createModernHeaderInFrame(titleFrame.document, contentName, contentsId, tocHtml, options);
                    log('Successfully injected modern header with TOC overlay');
                    return;
                }
            } catch (e) {
                log('Could not access title frame:', e.message);
            }

            // まだ成功していない場合は再試行
            if (attempts < maxAttempts) {
                setTimeout(tryInjectHeader, 300);
            } else {
                log('Failed to inject header after', maxAttempts, 'attempts');
            }
        }

        // 最初の試行を少し遅延させてフレームの読み込みを待つ
        setTimeout(tryInjectHeader, 500);
    });
}

/**
 * フレーム内にモダンなヘッダーを作成（目次オーバーレイ付き）
 */
function createModernHeaderInFrame(doc, contentName, contentsId, tocHtml = '', options = {}) {
    // 設定値
    const tocInitialState = options.tocInitialState || 'open';
    const tocInitialCloseDelay = parseInt(options.tocInitialCloseDelay || '5', 10);
    const tocAutoHide = options.tocAutoHide || false;
    const tocAutoHideDelay = parseInt(options.tocAutoHideDelay || '10', 10);
    const tocShowSectionTitles = options.tocShowSectionTitles !== undefined ? options.tocShowSectionTitles : true;

    // フレームの内容を完全に置換
    doc.body.innerHTML = '';
    doc.body.style.cssText = 'margin: 0; padding: 0; overflow: hidden; background: #1365b5;';

    // 目次オーバーレイ用のiframeを作成（フレームセットの制約を回避）
    const topDoc = window.top.document;

    // ============================================================
    // Shiryou: 目次クリック時の白フラッシュ抑制（コンテンツ読み込みオーバーレイ）
    // ============================================================
    // 目次からページ切替を行うと webclass_content フレームがリロードされるため、
    // ロード中に一瞬白背景が見えてフラッシュのようになる。上にオーバーレイを被せて隠す。
    // グローバルなシーケンス番号を使用して、複数の呼び出し元からの競合を防ぐ
    if (!topDoc.__uxOverlayState) {
        topDoc.__uxOverlayState = {
            navSeq: 0,
            shownAt: 0,
            hideTimer: null,
            indicatorTimer: null
        };
    }
    const uxState = topDoc.__uxOverlayState;

    function getOrCreateUxContentLoadingOverlay() {
        const overlayId = 'ux-content-loading-overlay';
        let overlay = topDoc.getElementById(overlayId);
        if (overlay) return overlay;

        overlay = topDoc.createElement('div');
        overlay.id = overlayId;
        overlay.style.cssText = `
            position: fixed;
            top: 55px;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 9998;
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            background: #0c3e70;
            transition: opacity 120ms ease-out;
            will-change: opacity;
        `;

        const style = topDoc.createElement('style');
        style.textContent = `
            @keyframes uxspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `;

        const inner = topDoc.createElement('div');
        inner.id = 'ux-loading-indicator';
        inner.style.cssText = `
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            font-family: 'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif;
            color: rgba(255,255,255,0.92);
            font-size: 14px;
            opacity: 0;
            transition: opacity 120ms ease;
        `;
        inner.innerHTML = `
            <div style="width:18px;height:18px;border:2px solid rgba(255,204,102,0.35);border-top-color:rgba(255,204,102,0.95);border-radius:50%;animation:uxspin 0.8s linear infinite;"></div>
            <div>読み込み中…</div>
        `;

        overlay.appendChild(style);
        overlay.appendChild(inner);
        topDoc.documentElement.appendChild(overlay);
        return overlay;
    }

    function showUxContentLoadingOverlay(seq, expectsPdf = true) {
        // 非PDFページは点滅の原因になりやすいので基本出さない（判定不能なら expectsPdf=true）
        if (!expectsPdf) return;
        const overlay = getOrCreateUxContentLoadingOverlay();
        if (uxState.hideTimer) {
            clearTimeout(uxState.hideTimer);
            uxState.hideTimer = null;
        }

        const wasHidden = overlay.style.visibility !== 'visible' || overlay.style.opacity === '0';
        // 即座に表示（トランジションなしで不透明に）
        overlay.style.transition = 'none';
        overlay.style.visibility = 'visible';
        overlay.style.opacity = '1';
        // 次フレームでトランジションを復活（非表示時のフェードアウト用）
        requestAnimationFrame(() => {
            overlay.style.transition = 'opacity 120ms ease-out';
        });
        if (wasHidden) {
            uxState.shownAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        }

        // 速い遷移だとインジケータが点滅して見えるので、一定時間経ってまだロード中のときだけ出す
        const indicator = overlay.querySelector('#ux-loading-indicator');
        if (indicator) {
            indicator.style.opacity = '0';
            if (uxState.indicatorTimer) clearTimeout(uxState.indicatorTimer);
            uxState.indicatorTimer = setTimeout(() => {
                if (seq === uxState.navSeq) {
                    indicator.style.opacity = '1';
                }
            }, 220);
        }
    }

    function hideUxContentLoadingOverlay(seq) {
        const overlay = topDoc.getElementById('ux-content-loading-overlay');
        if (!overlay) return;
        if (seq !== uxState.navSeq) return;

        if (uxState.indicatorTimer) {
            clearTimeout(uxState.indicatorTimer);
            uxState.indicatorTimer = null;
        }
        const indicator = overlay.querySelector('#ux-loading-indicator');
        if (indicator) indicator.style.opacity = '0';

        // すぐ消すと点滅に見えるので最小表示時間を確保
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const elapsed = uxState.shownAt ? (now - uxState.shownAt) : 9999;
        const minVisibleMs = 150;
        const delay = Math.max(0, minVisibleMs - elapsed);

        if (uxState.hideTimer) clearTimeout(uxState.hideTimer);
        uxState.hideTimer = setTimeout(() => {
            if (seq !== uxState.navSeq) return;
            overlay.style.opacity = '0';
            setTimeout(() => {
                if (seq === uxState.navSeq && overlay.style.opacity === '0') {
                    overlay.style.visibility = 'hidden';
                }
            }, 150);
        }, delay);
    }

    function attachUxContentFrameLoadHandler(seq, expectsPdf = true) {
        const frameEl = topDoc.querySelector('frame[name="webclass_content"], iframe[name="webclass_content"]');
        if (!frameEl) {
            // 見つからない場合でも、オーバーレイが残りっぱなしにならないようにする
            setTimeout(() => { if (seq === uxState.navSeq) hideUxContentLoadingOverlay(seq); }, 800);
            return;
        }

        const onLoad = () => {
            // 最新のナビゲーションだけ反映
            if (seq !== uxState.navSeq) return;

            // PDFビューア（pdf.js）はロード直後に真っ白になりやすいので、描画が始まるまで少し待つ
            waitForUxPdfViewerRender(seq, expectsPdf).finally(() => {
                if (seq === uxState.navSeq) hideUxContentLoadingOverlay(seq);
            });
        };

        try {
            frameEl.addEventListener('load', onLoad, { once: true });
        } catch (e) {
            frameEl.onload = onLoad;
        }

        // 念のため: 読み込み失敗/イベント未取得でも一定時間で消す
        setTimeout(() => {
            if (seq === uxState.navSeq) hideUxContentLoadingOverlay(seq);
        }, 12000);
    }

    function waitForUxPdfViewerRender(seq, expectsPdf = true, timeoutMs = 9000) {
        return new Promise((resolve) => {
            const start = Date.now();

            function isCanvasDrawn(canvas) {
                try {
                    if (!canvas) return false;
                    // PDF.jsはcanvasに描画する際に適切なサイズを設定するため、
                    // サイズチェックのみで描画状態を判定する（getImageData警告を回避）
                    const w = canvas.width || 0;
                    const h = canvas.height || 0;
                    // 有効なサイズ（100x100以上）であれば描画済みとみなす
                    return w >= 100 && h >= 100;
                } catch (e) {
                    // 読めない場合（稀）でも、いつまでも待たないようにする
                    return Date.now() - start > 1200;
                }
            }

            const tick = () => {
                if (seq !== uxState.navSeq) return resolve();

                try {
                    const contentWin = window.top.frames['webclass_content'];
                    if (!contentWin) return resolve();

                    // 非PDFページなら待ちを短くしてすぐ復帰（点滅抑制）
                    let looksLikePdf = expectsPdf;
                    try {
                        const href = contentWin.location?.href || '';
                        if (href.includes('loadit.php') || /\.pdf(\b|$|[&#?])/i.test(href)) {
                            looksLikePdf = true;
                        }
                    } catch (_) { }

                    const docCandidates = [];
                    try { docCandidates.push(contentWin.document); } catch (_) { }

                    // contentWin配下のiframe/frameも覗く（txtbk_show_text が frameset の場合がある）
                    try {
                        const nested = contentWin.document?.querySelectorAll?.('iframe, frame') || [];
                        nested.forEach(el => {
                            try {
                                const d = el.contentDocument || el.contentWindow?.document;
                                if (d) docCandidates.push(d);
                            } catch (_) { }
                        });
                    } catch (_) { }

                    let foundViewer = false;
                    for (const d of docCandidates) {
                        if (!d) continue;
                        const viewerContainer = d.getElementById('viewerContainer') || d.getElementById('viewer');
                        if (!viewerContainer) continue;

                        foundViewer = true;
                        // pdf.js は canvas が実際に描画されてから解除（空canvasの段階だと白/点滅が出やすい）
                        const canvases = viewerContainer.querySelectorAll('canvas');
                        for (const canvas of canvases) {
                            if (isCanvasDrawn(canvas)) {
                                return resolve();
                            }
                        }
                    }

                    // PDFページでなさそうなら早めに消す（点滅防止）
                    if (!looksLikePdf && !foundViewer && Date.now() - start > 180) {
                        return resolve();
                    }
                } catch (_) {
                    return resolve();
                }

                if (Date.now() - start >= timeoutMs) return resolve();
                setTimeout(tick, 120);
            };

            tick();
        });
    }

    const header = doc.createElement('div');
    header.style.cssText = `
        height: 55px;
        background: #1365b5;
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 20px;
        border-bottom: 1px solid #0c3e70;
        box-shadow: 0 2px 4px rgba(12, 62, 112, 0.25);
        font-family: 'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif;
        box-sizing: border-box;
    `;

    // 左側: 閉じるボタン + 目次トグルボタン
    const leftDiv = doc.createElement('div');
    leftDiv.style.cssText = 'display: flex; align-items: center; gap: 10px;';

    const closeBtn = doc.createElement('button');
    closeBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
        閉じる
    `;
    closeBtn.style.cssText = `
        display: flex;
        align-items: center;
        padding: 8px 16px;
        border: 1px solid rgba(12, 62, 112, 0.2);
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        background: #f9f9f9;
        color: #1365b5;
        transition: all 0.2s ease;
    `;
    closeBtn.onmouseover = () => { closeBtn.style.background = '#e7e7e7'; closeBtn.style.color = '#0c3e70'; };
    closeBtn.onmouseout = () => { closeBtn.style.background = '#f9f9f9'; closeBtn.style.color = '#1365b5'; };
    closeBtn.onclick = () => {
        // Prefer WebClass's quit flow to avoid beforeunload warnings.
        try {
            if (window.top && typeof window.top.quitContents === 'function') {
                window.top.quitContents();
                return;
            }
        } catch (e) {
            // Ignore and fall back.
        }

        try {
            const chapterFrame = window.top.frames && window.top.frames['webclass_chapter'];
            if (chapterFrame) {
                if (typeof chapterFrame.quit === 'function') {
                    chapterFrame.quit();
                    return;
                }
                if (chapterFrame.document && chapterFrame.document.app && typeof chapterFrame.document.app.quit === 'function') {
                    chapterFrame.document.app.quit();
                    return;
                }
                const menu = chapterFrame.document && chapterFrame.document.menu;
                if (menu && menu.sendCmd) {
                    menu.sendCmd.value = 'quit';
                    menu.submit();
                    return;
                }
                const quitBtn = chapterFrame.document && chapterFrame.document.querySelector('input[name="quit"], input[value="資料を閉じる"]');
                if (quitBtn) {
                    quitBtn.click();
                    return;
                }
            }
        } catch (e) {
            // Ignore and fall back.
        }

        if (contentsId) {
            window.top.location.href = 'do_contents.php?set_contents_id=' + contentsId;
        } else {
            window.top.history.back();
        }
    };
    leftDiv.appendChild(closeBtn);

    // 目次オーバーレイ用のiframeを作成
    // 既存のオーバーレイを削除
    const existingOverlay = topDoc.getElementById('ux-toc-overlay-iframe');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    const tocOverlayIframe = topDoc.createElement('iframe');
    tocOverlayIframe.id = 'ux-toc-overlay-iframe';
    tocOverlayIframe.style.cssText = `
        position: fixed;
        top: 55px;
        left: 0;
        width: 350px;
        max-width: 90vw;
        height: calc(100vh - 55px);
        border: none;
        z-index: 9999;
        display: none;
        background: transparent;
        transform: translateX(-100%);
        transition: transform 0.3s ease;
    `;

    // iframeを親ドキュメントに追加
    topDoc.documentElement.appendChild(tocOverlayIframe);

    // ホバー表示用の透明ゾーンを作成（設定で有効な場合のみ）
    const tocHoverReveal = options.tocHoverReveal !== undefined ? options.tocHoverReveal : true;
    let hoverRevealZone = null;

    if (tocHoverReveal) {
        // 既存のホバーゾーンを削除
        const existingHoverZone = topDoc.getElementById('ux-toc-hover-zone');
        if (existingHoverZone) {
            existingHoverZone.remove();
        }

        hoverRevealZone = topDoc.createElement('div');
        hoverRevealZone.id = 'ux-toc-hover-zone';
        hoverRevealZone.style.cssText = `
            position: fixed;
            top: 55px;
            left: 0;
            width: 8px;
            height: calc(100vh - 55px);
            background: transparent;
            z-index: 9997;
            cursor: pointer;
            display: block;
        `;
        hoverRevealZone.title = '目次を表示';

        // ホバー時に目次を開く
        hoverRevealZone.addEventListener('mouseenter', () => {
            if (!tocVisible) {
                openToc();
            }
        });

        topDoc.documentElement.appendChild(hoverRevealZone);
    }

    // 初期表示時に節タイトル（第○節など）のみを非表示にする処理
    let processedTocHtml = tocHtml;
    if (!tocShowSectionTitles && tocHtml) {
        // 一時的なDOMを作成してフィルタリング
        const tempDiv = topDoc.createElement('div');
        tempDiv.innerHTML = tocHtml;
        // 「第○節」を含むspanタグのみを非表示にする（行全体ではない）
        const spans = tempDiv.querySelectorAll('span');
        spans.forEach(span => {
            const spanText = span.textContent.trim();
            // 「第○節」「第○章」「第○部」のパターンにマッチ
            if (/^第[0-9０-９一二三四五六七八九十百]+[節章部]$/u.test(spanText)) {
                span.style.display = 'none';
            }
        });
        processedTocHtml = tempDiv.innerHTML;
    }

    // iframeの内容を設定
    const iframeDoc = tocOverlayIframe.contentDocument || tocOverlayIframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                * { box-sizing: border-box; }
                body {
                    margin: 0;
                    padding: 20px;
                    font-family: 'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif;
                    background: white;
                    color: #333;
                    height: 100vh;
                    overflow-y: auto;
                    border-right: 1px solid #c6d3e4;
                    box-shadow: 2px 0 8px rgba(19, 101, 181, 0.18);
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                    padding-bottom: 12px;
                    border-bottom: 1px solid #c6d3e4;
                }
                .header h3 {
                    margin: 0;
                    font-size: 1.1rem;
                    font-weight: 600;
                    color: #1365b5;
                }
                .close-btn {
                    background: #f9f9f9;
                    border: none;
                    color: #1365b5;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 1.2rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }
                .close-btn:hover {
                    background: #e7e7e7;
                    color: #0c3e70;
                }
                #toc-content table {
                    width: 100%;
                    border-collapse: collapse;
                }
                #toc-content tr {
                    border-bottom: 1px solid #c6d3e4;
                    transition: background 0.2s;
                }
                #toc-content tr:hover {
                    background: #f4f7fb;
                }
                #toc-content td {
                    padding: 12px 8px;
                    vertical-align: middle;
                }
                #toc-content span {
                    color: #333333 !important;
                }
                #toc-content input[type="button"] {
                    background: #1365b5;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 6px 12px;
                    cursor: pointer;
                    font-size: 0.85rem;
                    transition: all 0.2s;
                }
                #toc-content input[type="button"]:hover {
                    background: #0c3e70;
                }
                #toc-content a[href*="file_down.php"] {
                    display: none !important;
                }
                /* ダウンロードボタンは表示する */
                .ux-inline-download-options {
                    display: inline-flex !important;
                    gap: 4px;
                    margin-left: 8px;
                }
                .ux-download-btn {
                    background: #f9f9f9 !important;
                    color: #1365b5 !important;
                    border: none !important;
                    border-radius: 4px !important;
                    padding: 4px 8px !important;
                    font-size: 0.75rem !important;
                    cursor: pointer !important;
                    transition: all 0.2s !important;
                }
                .ux-download-btn:hover {
                    background: #e7e7e7 !important;
                    color: #0c3e70 !important;
                }
                ::-webkit-scrollbar { width: 8px; }
                ::-webkit-scrollbar-track { background: #eef2f6; }
                ::-webkit-scrollbar-thumb { background: #b7c7dd; border-radius: 4px; }
                /* 節タイトル非表示用のクラス */
                .ux-hide-section-titles {
                    display: none !important;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h3>📖 目次</h3>
                <button class="close-btn" id="close-btn">×</button>
            </div>
            <div id="toc-content">
                ${processedTocHtml || '<p style="text-align: center; padding: 20px;">目次を読み込み中...</p>'}
            </div>
        </body>
        </html>
    `);
    iframeDoc.close();

    // iframeへの参照を保持（後でアクセスするため）
    let tocCloseSetup = false;

    // TOC更新イベントのリスナー
    doc.addEventListener('ux-toc-needs-update', () => {
        log('Received ux-toc-needs-update event');
        if (tocVisible) {
            updateTocContent(iframeDoc);
        }
    });

    // 目次トグルボタン
    const tocToggleBtn = doc.createElement('button');
    tocToggleBtn.id = 'ux-toc-toggle-btn';
    tocToggleBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
        <span id="ux-toc-toggle-text">目次</span>
    `;
    tocToggleBtn.style.cssText = `
        display: flex;
        align-items: center;
        padding: 8px 16px;
        border: 1px solid rgba(12, 62, 112, 0.2);
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        background: #f9f9f9;
        color: #1365b5;
        transition: all 0.2s ease;
    `;
    tocToggleBtn.onmouseover = () => { tocToggleBtn.style.background = '#e7e7e7'; tocToggleBtn.style.color = '#0c3e70'; };
    tocToggleBtn.onmouseout = () => {
        const isActive = tocOverlayIframe.style.display !== 'none';
        tocToggleBtn.style.background = isActive ? '#ffcc66' : '#f9f9f9';
        tocToggleBtn.style.color = isActive ? '#333333' : '#1365b5';
    };

    // 目次の表示/非表示状態を追跡
    let tocVisible = false;
    let initialCloseTimer = null;
    let autoHideTimer = null;

    // オートハイドタイマー開始（操作がない場合、一定時間後に閉じる）
    function startAutoHideTimer() {
        if (!tocAutoHide) return;
        stopAutoHideTimer();

        // iframeにマウスが乗っている場合はタイマーを開始しない
        // (ただし、iframe外から呼ばれた場合は開始する)

        autoHideTimer = setTimeout(() => {
            if (tocVisible) {
                closeToc();
            }
        }, tocAutoHideDelay * 1000);
    }

    // オートハイドタイマー停止
    function stopAutoHideTimer() {
        if (autoHideTimer) {
            clearTimeout(autoHideTimer);
            autoHideTimer = null;
        }
    }

    // フレームセットのcolsをアニメーション
    // @param {number} targetValue - 目標のcols値（ピクセル）
    // @param {number} duration - アニメーション時間（ミリ秒）
    function animateFramesetCols(targetValue, duration = 300) {
        // cols属性を持つフレームセット（ネストされたもの）を取得
        const framesets = window.top.document.querySelectorAll('frameset');
        let targetFrameset = null;
        for (const fs of framesets) {
            if (fs.getAttribute('cols')) {
                targetFrameset = fs;
                break;
            }
        }
        if (!targetFrameset) return;

        const cols = targetFrameset.getAttribute('cols') || '0,*';
        const currentValue = parseInt(cols.split(',')[0]) || 0;
        const startTime = performance.now();
        const diff = targetValue - currentValue;

        if (diff === 0) return;

        function step(timestamp) {
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // easeOutCubic for smooth deceleration
            const eased = 1 - Math.pow(1 - progress, 3);
            const newValue = Math.round(currentValue + diff * eased);
            targetFrameset.setAttribute('cols', `${newValue},*`);

            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }

        requestAnimationFrame(step);
    }

    // 目次を閉じる関数
    function closeToc() {
        tocVisible = false;
        // 左にスライドアウトするアニメーション
        tocOverlayIframe.style.transform = 'translateX(-100%)';
        tocToggleBtn.style.background = '#f9f9f9';
        tocToggleBtn.style.color = '#1365b5';

        // フレームセットのcolsをアニメーション（PDFビューワーを全幅に戻す）
        animateFramesetCols(0, 300);

        // アニメーション完了後にdisplayをnoneにする
        setTimeout(() => {
            if (!tocVisible) {
                tocOverlayIframe.style.display = 'none';
            }
        }, 300);

        // タイマー類をクリア
        if (initialCloseTimer) {
            clearTimeout(initialCloseTimer);
            initialCloseTimer = null;
        }
        stopAutoHideTimer();

        // ホバーゾーンを表示
        if (hoverRevealZone) {
            hoverRevealZone.style.display = 'block';
        }
    }

    // 目次を開く関数
    function openToc(isInitial = false) {
        tocVisible = true;
        // まずdisplayをblockにして、次フレームでtransformを解除（スライドインアニメーション）
        tocOverlayIframe.style.display = 'block';
        // 強制的にレイアウトを再計算させてからアニメーション開始
        void tocOverlayIframe.offsetWidth;
        tocOverlayIframe.style.transform = 'translateX(0)';
        tocToggleBtn.style.background = '#ffcc66';
        tocToggleBtn.style.color = '#333333';

        // フレームセットのcolsをアニメーション（目次分PDFビューワーを縮小）
        animateFramesetCols(350, 300);

        // ホバーゾーンを非表示
        if (hoverRevealZone) {
            hoverRevealZone.style.display = 'none';
        }

        const iframeDoc = tocOverlayIframe.contentDocument || tocOverlayIframe.contentWindow.document;

        // 閉じるボタンのイベントを設定
        if (!tocCloseSetup) {
            const closeBtn = iframeDoc.getElementById('close-btn');
            if (closeBtn) {
                closeBtn.onclick = closeToc;
            }

            // オートハイド用のイベント設定
            if (tocAutoHide || tocInitialCloseDelay > 0) {
                // マウスが入ったらタイマーキャンセル（ユーザーが操作しようとしている）
                iframeDoc.body.addEventListener('mouseenter', () => {
                    // 初期表示タイマーキャンセル
                    if (initialCloseTimer) {
                        clearTimeout(initialCloseTimer);
                        initialCloseTimer = null;
                        log('Initial close timer cancelled by user interaction');
                    }

                    // オートハイドタイマーキャンセル
                    stopAutoHideTimer();
                });

                // マウスが出たらオートハイドタイマー開始（設定されている場合）
                iframeDoc.body.addEventListener('mouseleave', () => {
                    if (tocAutoHide) {
                        startAutoHideTimer();
                    }
                });
            }

            tocCloseSetup = true;
        }

        // 目次の内容を最新に更新
        updateTocContent(iframeDoc);

        // 初期表示の場合の自動クローズ処理
        if (isInitial && tocInitialCloseDelay > 0) {
            initialCloseTimer = setTimeout(() => {
                if (tocVisible) {
                    closeToc();
                }
            }, tocInitialCloseDelay * 1000);
        }
        // 通常表示（手動）かつオートハイド有効の場合
        else if (!isInitial && tocAutoHide) {
            // 開いた直後もタイマー開始（マウスが入るまでの間）
            startAutoHideTimer();
        }
    }

    function updateTocContent(iframeDoc) {
        try {
            const chapterFrame = window.top.frames['webclass_chapter'];
            if (chapterFrame && chapterFrame.document) {
                const tocElement = chapterFrame.document.querySelector('#TOC');
                if (tocElement) {
                    const tocContent = iframeDoc.getElementById('toc-content');
                    if (tocContent) {
                        tocContent.innerHTML = tocElement.innerHTML;

                        // 節タイトル（第○節など）のみの表示/非表示を制御
                        // 「第○節」を含むspanタグのみを非表示にする（行全体ではない）
                        const spans = tocContent.querySelectorAll('span');
                        spans.forEach(span => {
                            const spanText = span.textContent.trim();
                            // 「第○節」「第○章」「第○部」のパターンにマッチ
                            if (/^第[0-9０-９一二三四五六七八九十百]+[節章部]$/u.test(spanText)) {
                                if (!tocShowSectionTitles) {
                                    span.classList.add('ux-hide-section-titles');
                                } else {
                                    span.classList.remove('ux-hide-section-titles');
                                }
                            }
                        });

                        // ダウンロードボタンのイベントを設定
                        const downloadBtns = tocContent.querySelectorAll('.ux-download-btn');
                        downloadBtns.forEach(btn => {
                            const title = btn.getAttribute('title') || '';
                            const isRename = btn.classList.contains('ux-download-rename');

                            // 元のボタンからdata属性を取得
                            const originalBtn = chapterFrame.document.querySelector(`.ux-download-btn[title="${title}"]`);
                            if (originalBtn) {
                                btn.onclick = (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    // 元のボタンのクリックをトリガー
                                    originalBtn.click();
                                };
                            }
                        });

                        // ページ移動ボタンのイベントを設定
                        const pageButtons = tocContent.querySelectorAll('input[name="clickpage"]');
                        pageButtons.forEach(btn => {
                            const onclickAttr = btn.getAttribute('onclick');
                            if (onclickAttr) {
                                const pageMatch = onclickAttr.match(/gopage\(['"]?(\d+)['"]?\)/);
                                if (pageMatch) {
                                    const pageNum = pageMatch[1];
                                    // 既存のonclickを削除して新しいイベントを設定
                                    btn.removeAttribute('onclick');
                                    btn.onclick = (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        uxDebugLog('[WebClass UX] Navigating to page:', pageNum);

                                        // 白フラッシュ抑制: PDFページのみオーバーレイを出して、描画完了で消す（点滅防止）
                                        const seq = ++uxState.navSeq;
                                        let expectsPdf = true;
                                        try {
                                            const chapterFrame = window.top.frames['webclass_chapter'];
                                            const jsonData = chapterFrame && chapterFrame.document ? chapterFrame.document.querySelector('#json-data') : null;
                                            if (jsonData) {
                                                const config = JSON.parse(jsonData.textContent);
                                                const targetUrl = config?.text_urls?.[pageNum];
                                                if (typeof targetUrl === 'string' && targetUrl.length > 0) {
                                                    expectsPdf = /\.pdf(\b|$|[&#?])/i.test(targetUrl) || /file=[^&]*\.pdf/i.test(targetUrl);
                                                } else {
                                                    expectsPdf = false;
                                                }
                                            }
                                        } catch (_) {
                                            // 判定不能なら保守的にPDF扱い
                                            expectsPdf = true;
                                        }

                                        showUxContentLoadingOverlay(seq, expectsPdf);
                                        attachUxContentFrameLoadHandler(seq, expectsPdf);

                                        // ページ移動を実行する関数
                                        function doPageNavigation() {
                                            try {
                                                // まず、チャプターフレームからtext_urlsを取得してみる
                                                const chapterFrame = window.top.frames['webclass_chapter'];
                                                if (chapterFrame && chapterFrame.document) {
                                                    const jsonData = chapterFrame.document.querySelector('#json-data');
                                                    if (jsonData) {
                                                        const config = JSON.parse(jsonData.textContent);
                                                        if (config.text_urls && config.text_urls[pageNum]) {
                                                            // URLを取得してコンテンツフレームを更新
                                                            const targetUrl = config.text_urls[pageNum];
                                                            uxDebugLog('[WebClass UX] Navigating to URL:', targetUrl);

                                                            // コンテンツフレームのsrcを変更
                                                            const contentFrame = window.top.document.querySelector('frame[name="webclass_content"]');
                                                            if (contentFrame) {
                                                                contentFrame.src = targetUrl;
                                                                uxDebugLog('[WebClass UX] Updated content frame src');
                                                                return true;
                                                            }
                                                        }
                                                    }
                                                }

                                                // フォールバック: gopage関数を直接呼び出す
                                                // 方法1: frame要素のcontentWindow経由
                                                const frames = window.top.document.querySelectorAll('frame');
                                                for (const frame of frames) {
                                                    if (frame.name === 'webclass_chapter') {
                                                        const win = frame.contentWindow;
                                                        if (win && typeof win.gopage === 'function') {
                                                            uxDebugLog('[WebClass UX] Calling gopage via contentWindow');
                                                            win.gopage(pageNum);
                                                            return true;
                                                        }
                                                        if (win && win.document && win.document.app) {
                                                            uxDebugLog('[WebClass UX] Calling document.app.movePageTo');
                                                            win.document.app.movePageTo(pageNum);
                                                            return true;
                                                        }
                                                    }
                                                }

                                                // 方法2: window.top.frames経由
                                                if (chapterFrame) {
                                                    if (typeof chapterFrame.gopage === 'function') {
                                                        uxDebugLog('[WebClass UX] Calling gopage via frames[]');
                                                        chapterFrame.gopage(pageNum);
                                                        return true;
                                                    }
                                                    if (chapterFrame.document && chapterFrame.document.app) {
                                                        uxDebugLog('[WebClass UX] Calling app.movePageTo via frames[]');
                                                        chapterFrame.document.app.movePageTo(pageNum);
                                                        return true;
                                                    }
                                                }

                                                uxDebugLog('[WebClass UX] Could not find navigation method');
                                                return false;
                                            } catch (err) {
                                                uxDebugLog('[WebClass UX] Error in doPageNavigation:', err);
                                                return false;
                                            }
                                        }

                                        if (doPageNavigation()) {
                                            // ページ移動後に目次を閉じる処理は削除（ユーザー要望）
                                            // closeToc();
                                        } else {
                                            // 失敗した場合はオーバーレイを引っ込める
                                            if (seq === uxState.navSeq) hideUxContentLoadingOverlay(seq);
                                        }
                                    };
                                }
                            }
                        });
                    }
                }
            }
        } catch (e) {
            uxDebugLog('[WebClass UX] Could not update TOC:', e);
        }
    }

    tocToggleBtn.onclick = () => {
        if (tocVisible) {
            closeToc();
        } else {
            openToc();
        }
    };
    leftDiv.appendChild(tocToggleBtn);

    // 資料名
    const centerDiv = doc.createElement('div');
    centerDiv.style.cssText = 'flex: 1; text-align: center;';

    const titleSpan = doc.createElement('span');
    titleSpan.textContent = contentName;
    titleSpan.style.cssText = `
        color: #ffffff;
        font-size: 1rem;
        font-weight: 600;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        max-width: 500px;
        display: inline-block;
    `;
    centerDiv.appendChild(titleSpan);

    // 別ウィンドウボタン
    const rightDiv = doc.createElement('div');
    rightDiv.style.cssText = 'display: flex; align-items: center;';

    const newWindowBtn = doc.createElement('button');
    newWindowBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
        PDFを開く
    `;
    newWindowBtn.style.cssText = `
        display: flex;
        align-items: center;
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        background: #ffcc66;
        color: #333333;
        transition: all 0.2s ease;
    `;
    newWindowBtn.onmouseover = () => {
        newWindowBtn.style.background = '#ffb84d';
        newWindowBtn.style.boxShadow = '0 2px 8px rgba(255, 184, 77, 0.35)';
    };
    newWindowBtn.onmouseout = () => {
        newWindowBtn.style.background = '#ffcc66';
        newWindowBtn.style.boxShadow = 'none';
    };
    newWindowBtn.onclick = () => {
        // PDFのURLを取得して別ウィンドウで開く
        let pdfUrl = null;

        try {
            const chapterFrame = window.top.frames['webclass_chapter'];
            if (chapterFrame && chapterFrame.document) {
                const jsonData = chapterFrame.document.querySelector('#json-data');
                if (jsonData) {
                    const config = JSON.parse(jsonData.textContent);

                    // contents_urlとfileパラメータからPDF URLを構築
                    if (config.text_url && config.text_url.includes('file=')) {
                        const textUrl = config.text_url;
                        const fileMatch = textUrl.match(/file=([^&]+)/);
                        const contentsUrlMatch = textUrl.match(/contents_url=([^&]+)/);

                        if (fileMatch && fileMatch[1]) {
                            const filePath = decodeURIComponent(fileMatch[1]);

                            if (filePath && filePath.length > 0) {
                                // contents_urlがある場合はそれを使用
                                if (contentsUrlMatch && contentsUrlMatch[1]) {
                                    const contentsUrl = decodeURIComponent(contentsUrlMatch[1]);
                                    pdfUrl = window.top.location.origin + contentsUrl + filePath;
                                } else {
                                    // 直接パスを構築
                                    pdfUrl = window.top.location.origin + '/webclass/data/course/' + filePath;
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {
            uxDebugLog('[WebClass UX] Error getting PDF URL:', e);
        }

        if (pdfUrl) {
            uxDebugLog('[WebClass UX] Opening PDF:', pdfUrl);
            window.open(pdfUrl, '_blank');
        } else {
            // PDFがない場合（テキストコンテンツなど）
            alert('この資料にはPDFファイルがありません。');
        }
    };
    // リボン非表示ボタン
    const hideRibbonBtn = doc.createElement('button');
    hideRibbonBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
    `;
    hideRibbonBtn.title = 'ヘッダーを隠す';
    hideRibbonBtn.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px;
        margin-right: 8px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        background: transparent;
        color: rgba(255,255,255,0.9);
        transition: all 0.2s ease;
    `;
    hideRibbonBtn.onmouseover = () => {
        hideRibbonBtn.style.background = 'rgba(255,255,255,0.2)';
        hideRibbonBtn.style.color = '#ffffff';
    };
    hideRibbonBtn.onmouseout = () => {
        hideRibbonBtn.style.background = 'transparent';
        hideRibbonBtn.style.color = 'rgba(255,255,255,0.9)';
    };
    hideRibbonBtn.onclick = () => {
        toggleRibbon(false);
    };
    rightDiv.appendChild(hideRibbonBtn);

    rightDiv.appendChild(newWindowBtn);

    header.appendChild(leftDiv);
    header.appendChild(centerDiv);
    header.appendChild(rightDiv);

    doc.body.appendChild(header);

    // 初期状態で目次を開く設定の場合
    if (tocInitialState === 'open') {
        setTimeout(() => {
            openToc(true); // isInitial = true
        }, 500);
    }

    log('Created modern header with TOC overlay in title frame');
}

/**
 * 左サイドバー（目次フレーム）のUI改善
 */
function enhanceShiryouChapterFrame() {
    log('Enhancing shiryou chapter frame');

    // NOTE: beforeunload blocking is now handled by beforeunload-blocker.js
    // which runs in MAIN world via manifest.json

    // 少し遅延して実行（DOMの読み込みを待つ）
    setTimeout(() => {
        // フレーム全体の内容を非表示（目次オーバーレイ使用時に元のTOCが見えないように）
        // visibility: hiddenを使用することでDOMはアクセス可能（gopage関数など）
        document.body.style.visibility = 'hidden';
        document.body.style.background = 'transparent';

        // 1. 青いヘッダー（bgc_sub）を非表示
        const bgcSub = document.querySelector('#WsTitle.bgc_sub, .bgc_sub');
        if (bgcSub) {
            bgcSub.style.display = 'none';
            log('Hidden bgc_sub header');
        }

        // 2. ユーザー情報を非表示
        const userDiv = document.querySelector('#User');
        if (userDiv) {
            userDiv.style.display = 'none';
        }

        // 3. hrを非表示
        const hrs = document.querySelectorAll('hr');
        hrs.forEach(hr => {
            hr.style.display = 'none';
        });

        // 4. 前のページ/次のページボタンを非表示
        const prevButton = document.querySelector('#PrevButton, button[onclick*="prevPage"]');
        const nextButton = document.querySelector('#NextButton, button[onclick*="nextPage"]');
        if (prevButton) {
            prevButton.closest('tr')?.style.setProperty('display', 'none', 'important');
            log('Hidden prev button');
        }

        // ナビレイアウト全体を非表示（ボタンはヘッダーに移動）
        const naviLayout = document.querySelector('#naviLayout');
        if (naviLayout) {
            naviLayout.style.display = 'none';
            log('Hidden naviLayout');
        }

        // 5. 「目次を隠す」の横の「資料を閉じる」ボタンを非表示
        const quitButtons = document.querySelectorAll('input[name="quit"], input[value="資料を閉じる"]');
        quitButtons.forEach(btn => {
            btn.style.display = 'none';
            log('Hidden quit button in chapter frame');
        });

        // 6. 「添付資料」リンクのテキストと画像のみ非表示（ダウンロードボタンは残す）
        const attachLinks = document.querySelectorAll('a[href*="file_down.php"]');
        attachLinks.forEach(link => {
            // リンク自体を非表示（ダウンロードボタンは別要素なので残る）
            link.style.display = 'none';
            log('Hidden attachment link text');
        });

        // 7. ヘッダーフレームのTOC更新をトリガー
        // ページ移動などでこのフレームがリロードされたとき、TOCの中身が変わっているので
        // ヘッダー側（titleフレーム）に通知してTOCオーバーレイを更新させる
        try {
            const titleFrame = window.top.frames['webclass_title'];
            if (titleFrame && titleFrame.document) {
                // カスタムイベントを発火
                const event = new CustomEvent('ux-toc-needs-update');
                titleFrame.document.dispatchEvent(event);
                log('Dispatched ux-toc-needs-update event');
            }
        } catch (e) {
            log('Could not dispatch event to title frame:', e);
        }

        // 8. 全体のスタイルを改善
        applyModernChapterStyles();

        // 9. 目次クリック時のPDF白フラッシュ抑制（左目次フレーム側）
        // フレームセットの表示構成や設定によっては左側の目次が使われる場合があるため、
        // clickpage ボタンのクリックを捕捉してコンテンツ側ロード完了までオーバーレイを表示する。
        try {
            setupShiryouContentFlashGuardFromChapterFrame();
        } catch (e) {
            log('Could not setup flash guard in chapter frame:', e?.message || e);
        }

    }, 100);
}

/**
 * 左目次フレームからのページ切替時に、コンテンツ側の白フラッシュを抑える
 * （クリックを捕捉して topDoc にオーバーレイを被せ、webclass_content の load 後に消す）
 */
function setupShiryouContentFlashGuardFromChapterFrame() {
    if (window.__uxShiryouFlashGuardInstalled) return;
    window.__uxShiryouFlashGuardInstalled = true;

    const topDoc = window.top?.document;
    if (!topDoc) return;

    // グローバルステートを共有（createModernHeaderInFrame と同じオーバーレイを管理）
    if (!topDoc.__uxOverlayState) {
        topDoc.__uxOverlayState = {
            navSeq: 0,
            shownAt: 0,
            hideTimer: null,
            indicatorTimer: null
        };
    }
    const uxState = topDoc.__uxOverlayState;

    function getOrCreateUxContentLoadingOverlay() {
        const overlayId = 'ux-content-loading-overlay';
        let overlay = topDoc.getElementById(overlayId);
        if (overlay) return overlay;

        overlay = topDoc.createElement('div');
        overlay.id = overlayId;
        overlay.style.cssText = `
            position: fixed;
            top: 55px;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 9998;
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            background: #0c3e70;
            transition: opacity 120ms ease-out;
            will-change: opacity;
        `;

        const style = topDoc.createElement('style');
        style.textContent = `
            @keyframes uxspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `;

        const inner = topDoc.createElement('div');
        inner.id = 'ux-loading-indicator';
        inner.style.cssText = `
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            font-family: 'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif;
            color: rgba(255,255,255,0.92);
            font-size: 14px;
            opacity: 0;
            transition: opacity 120ms ease;
        `;
        inner.innerHTML = `
            <div style="width:18px;height:18px;border:2px solid rgba(255,204,102,0.35);border-top-color:rgba(255,204,102,0.95);border-radius:50%;animation:uxspin 0.8s linear infinite;"></div>
            <div>読み込み中…</div>
        `;

        overlay.appendChild(style);
        overlay.appendChild(inner);
        topDoc.documentElement.appendChild(overlay);
        return overlay;
    }

    function showUxContentLoadingOverlay(seq, expectsPdf = true) {
        if (!expectsPdf) return;
        const overlay = getOrCreateUxContentLoadingOverlay();
        if (uxState.hideTimer) {
            clearTimeout(uxState.hideTimer);
            uxState.hideTimer = null;
        }

        const wasHidden = overlay.style.visibility !== 'visible' || overlay.style.opacity === '0';
        // 即座に表示（トランジションなしで不透明に）
        overlay.style.transition = 'none';
        overlay.style.visibility = 'visible';
        overlay.style.opacity = '1';
        // 次フレームでトランジションを復活（非表示時のフェードアウト用）
        requestAnimationFrame(() => {
            overlay.style.transition = 'opacity 120ms ease-out';
        });
        if (wasHidden) {
            uxState.shownAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        }

        const indicator = overlay.querySelector('#ux-loading-indicator');
        if (indicator) {
            indicator.style.opacity = '0';
            if (uxState.indicatorTimer) clearTimeout(uxState.indicatorTimer);
            uxState.indicatorTimer = setTimeout(() => {
                if (seq === uxState.navSeq) {
                    indicator.style.opacity = '1';
                }
            }, 220);
        }
    }

    function hideUxContentLoadingOverlay(seq) {
        const overlay = topDoc.getElementById('ux-content-loading-overlay');
        if (!overlay) return;
        if (seq !== uxState.navSeq) return;

        if (uxState.indicatorTimer) {
            clearTimeout(uxState.indicatorTimer);
            uxState.indicatorTimer = null;
        }
        const indicator = overlay.querySelector('#ux-loading-indicator');
        if (indicator) indicator.style.opacity = '0';

        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const elapsed = uxState.shownAt ? (now - uxState.shownAt) : 9999;
        const minVisibleMs = 150;
        const delay = Math.max(0, minVisibleMs - elapsed);

        if (uxState.hideTimer) clearTimeout(uxState.hideTimer);
        uxState.hideTimer = setTimeout(() => {
            if (seq !== uxState.navSeq) return;
            overlay.style.opacity = '0';
            setTimeout(() => {
                if (seq === uxState.navSeq && overlay.style.opacity === '0') {
                    overlay.style.visibility = 'hidden';
                }
            }, 150);
        }, delay);
    }

    function waitForUxPdfViewerRender(seq, expectsPdf = true, timeoutMs = 9000) {
        return new Promise((resolve) => {
            const start = Date.now();

            function isCanvasDrawn(canvas) {
                try {
                    if (!canvas) return false;
                    // PDF.jsはcanvasに描画する際に適切なサイズを設定するため、
                    // サイズチェックのみで描画状態を判定する（getImageData警告を回避）
                    const w = canvas.width || 0;
                    const h = canvas.height || 0;
                    // 有効なサイズ（100x100以上）であれば描画済みとみなす
                    return w >= 100 && h >= 100;
                } catch (e) {
                    return Date.now() - start > 1200;
                }
            }

            const tick = () => {
                if (seq !== uxState.navSeq) return resolve();

                try {
                    const contentWin = window.top.frames?.['webclass_content'];
                    if (!contentWin) return resolve();

                    let looksLikePdf = expectsPdf;
                    try {
                        const href = contentWin.location?.href || '';
                        if (href.includes('loadit.php') || /\.pdf(\b|$|[&#?])/i.test(href)) {
                            looksLikePdf = true;
                        }
                    } catch (_) { }

                    const docCandidates = [];
                    try { docCandidates.push(contentWin.document); } catch (_) { }

                    try {
                        const nested = contentWin.document?.querySelectorAll?.('iframe, frame') || [];
                        nested.forEach(el => {
                            try {
                                const d = el.contentDocument || el.contentWindow?.document;
                                if (d) docCandidates.push(d);
                            } catch (_) { }
                        });
                    } catch (_) { }

                    let foundViewer = false;
                    for (const d of docCandidates) {
                        if (!d) continue;
                        const viewerContainer = d.getElementById('viewerContainer') || d.getElementById('viewer');
                        if (!viewerContainer) continue;

                        foundViewer = true;
                        const canvases = viewerContainer.querySelectorAll('canvas');
                        for (const canvas of canvases) {
                            if (isCanvasDrawn(canvas)) {
                                return resolve();
                            }
                        }
                    }

                    if (!looksLikePdf && !foundViewer && Date.now() - start > 180) {
                        return resolve();
                    }
                } catch (_) {
                    return resolve();
                }

                if (Date.now() - start >= timeoutMs) return resolve();
                setTimeout(tick, 120);
            };

            tick();
        });
    }

    function attachUxContentFrameLoadHandler(seq, expectsPdf = true) {
        const frameEl = topDoc.querySelector('frame[name="webclass_content"], iframe[name="webclass_content"]');
        if (!frameEl) {
            setTimeout(() => { if (seq === uxState.navSeq) hideUxContentLoadingOverlay(seq); }, 800);
            return;
        }

        const onLoad = () => {
            if (seq !== uxState.navSeq) return;
            waitForUxPdfViewerRender(seq, expectsPdf).finally(() => {
                if (seq === uxState.navSeq) hideUxContentLoadingOverlay(seq);
            });
        };

        try {
            frameEl.addEventListener('load', onLoad, { once: true });
        } catch (e) {
            frameEl.onload = onLoad;
        }

        setTimeout(() => {
            if (seq === uxState.navSeq) hideUxContentLoadingOverlay(seq);
        }, 12000);
    }

    // inline onclick より先に走らせる（capture）ことで、遷移開始前にオーバーレイを出す
    document.addEventListener('click', (e) => {
        const t = e.target;
        if (!t || t.nodeType !== 1) return;

        // 目次のページボタン
        if (t.tagName === 'INPUT' && t.getAttribute('name') === 'clickpage') {
            // クリック対象のページ番号を推定（onclickがある場合はそれを優先）
            const onclickAttr = t.getAttribute('onclick') || '';
            const m = onclickAttr.match(/gopage\(['"]?(\d+)['"]?\)/);
            const pageNum = m ? m[1] : (t.value || '').trim();

            let expectsPdf = true;
            try {
                const jsonData = document.querySelector('#json-data');
                if (jsonData) {
                    const config = JSON.parse(jsonData.textContent);
                    const targetUrl = config?.text_urls?.[pageNum];
                    if (typeof targetUrl === 'string' && targetUrl.length > 0) {
                        expectsPdf = /\.pdf(\b|$|[&#?])/i.test(targetUrl) || /file=[^&]*\.pdf/i.test(targetUrl);
                    } else {
                        expectsPdf = false;
                    }
                }
            } catch (_) {
                expectsPdf = true;
            }

            const seq = ++uxState.navSeq;
            showUxContentLoadingOverlay(seq, expectsPdf);
            attachUxContentFrameLoadHandler(seq, expectsPdf);
        }
    }, true);
}

/**
 * 目次フレームにモダンなスタイルを適用
 */
function applyModernChapterStyles() {
    const style = document.createElement('style');
    style.textContent = `
        body {
            background: #eeeeee !important;
            font-family: 'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif !important;
            padding: 10px !important;
        }
        
        #top {
            background: transparent !important;
            min-height: 0 !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
        }
        
        #WsTitle.bgc_sub, .bgc_sub {
            display: none !important;
        }
        
        #User {
            display: none !important;
        }
        
        hr {
            display: none !important;
        }
        
        /* ナビゲーションテーブルのスタイル改善 */
        #naviLayout {
            width: 100% !important;
            margin: 0 0 10px 0 !important;
        }
        
        #naviLayout tr td {
            padding: 2px !important;
        }
        
        #naviLayout tr td br {
            display: none !important;
        }
        
        #naviLayout input[type="button"],
        #naviLayout button {
            background: linear-gradient(135deg, #1365b5 0%, #0c3e70 100%) !important;
            color: white !important;
            border: none !important;
            border-radius: 6px !important;
            padding: 8px 14px !important;
            font-size: 0.8rem !important;
            font-weight: 500 !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            box-shadow: 0 2px 4px rgba(19, 101, 181, 0.25) !important;
        }
        
        #naviLayout input[type="button"]:hover,
        #naviLayout button:hover {
            transform: translateY(-1px) !important;
            box-shadow: 0 4px 8px rgba(12, 62, 112, 0.35) !important;
        }
        
        #naviLayout input[type="button"]:disabled,
        #naviLayout button:disabled {
            background: #b0b0b0 !important;
            cursor: not-allowed !important;
            transform: none !important;
            box-shadow: none !important;
        }
        
        /* 目次テーブルのスタイル改善 */
        #TOC {
            background: white !important;
            border-radius: 8px !important;
            padding: 10px !important;
            margin-top: 5px !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
        }
        
        #TOCLayout {
            width: 100% !important;
        }
        
        #TOCLayout tr {
            transition: background-color 0.15s ease !important;
        }
        
        #TOCLayout tr:hover {
            background-color: #f4f7fb !important;
        }
        
        #TOCLayout td {
            padding: 8px 6px !important;
            vertical-align: middle !important;
        }
        
        #TOCLayout input[type="button"] {
            background: #f9f9f9 !important;
            color: #1365b5 !important;
            min-width: 32px !important;
            padding: 6px 10px !important;
            box-shadow: none !important;
        }

        #TOCLayout input[type="button"]:hover {
            background: #e7e7e7 !important;
        }
        
        /* 添付資料リンクのテキスト/画像のみ非表示（ダウンロードボタンは残す） */
        #TOCLayout a[href*="file_down.php"] {
            display: none !important;
        }
        
        /* 前/次ページボタンを非表示 */
        #PrevButton,
        #NextButton,
        button[onclick*="prevPage"],
        button[onclick*="nextPage"] {
            display: none !important;
        }
        
        /* 資料を閉じるボタン（目次横）を非表示 */
        input[name="quit"],
        input[value="資料を閉じる"] {
            display: none !important;
        }
        
        /* 目次を隠すボタンを非表示（ヘッダーにトグルボタンがあるため） */
        input[name="hide_content"],
        input[value="目次を隠す"],
        input[value="目次を表示"] {
            display: none !important;
        }
        
        /* 空の行を非表示 */
        #naviLayout tr:has(td > br:only-child) {
            display: none !important;
        }
        
        /* ナビゲーションテーブル自体を非表示（ボタンがすべてヘッダーに移動したため） */
        #naviLayout {
            display: none !important;
        }
    `;
    document.head.appendChild(style);
    log('Applied modern chapter styles');
}

/**
 * フレーム全体を非表示にする
 */
function hideEntireFrame() {
    const style = document.createElement('style');
    style.textContent = `
        body, html {
            display: none !important;
            height: 0 !important;
            overflow: hidden !important;
        }
    `;
    document.head.appendChild(style);
    log('Hidden entire frame');
}

/**
 * loadit.phpの「表示に問題があるときは」メッセージフレームを非表示
 */
function hideLoaditMessageFrame() {
    log('Hiding loadit message frame');

    const style = document.createElement('style');
    style.textContent = `
        body {
            visibility: hidden !important;
            height: 0 !important;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 0 !important;
        }
    `;
    document.head.appendChild(style);

    // 親のフレームセットの行を0にする
    try {
        if (window.parent && window.parent.document) {
            const parentFrameset = window.parent.document.querySelector('frameset[rows]');
            if (parentFrameset) {
                const rows = parentFrameset.getAttribute('rows');
                if (rows && rows.includes('40')) {
                    parentFrameset.setAttribute('rows', '0,*');
                    log('Set parent frameset rows to 0,*');
                }
            }
        }
    } catch (e) {
        log('Could not modify parent frameset:', e.message);
    }
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Course contents page visual refresh (keeps existing layout/UX structure)
 */
function enhanceCourseContentsPageUI() {
    if (window.top !== window) return;

    const STYLE_ID = 'ux-course-contents-theme-style';
    const BODY_CLASS = 'ux-course-contents-theme';
    const QUICK_NAV_ID = 'ux-course-quick-nav';
    const QUICK_NAV_ENABLED_CLASS = 'ux-course-quick-nav-enabled';
    const QUICK_NAV_COLLAPSED_CLASS = 'ux-course-quick-nav-collapsed';
    const QUICK_NAV_COLLAPSED_STORAGE_KEY = 'webclass_course_quick_nav_collapsed';
    const STORAGE_KEY_CUSTOM_COURSE_NAMES = 'webclass_custom_course_names';
    const STORAGE_KEY_OPENAI_COURSE_CACHE = 'openaiCourseNameCache';
    const STORAGE_KEY_OPENAI_COURSE_CACHE_LEGACY = 'webclass_openai_course_name_cache';
    const STORAGE_KEY_SHORT_COURSE_CACHE = 'webclass_course_short_name_cache';

    const normalizeCourseLabelText = (text) => {
        return (text || '')
            .replace(/^ﾂｻ\s*/, '')
            .replace('締切が近い課題があります。', '')
            .replace(/新着メッセージ\(\d+\)/g, '')
            .trim();
    };

    const resolveEditedCustomCourseName = (customName, fullName) => {
        const rawCustomName = (customName || '').trim();
        if (!rawCustomName) return '';
        const normalizedCustomName = normalizeCourseLabelText(rawCustomName);
        if (!normalizedCustomName) return '';
        const normalizedFullName = normalizeCourseLabelText(fullName || '');
        if (normalizedFullName && normalizedCustomName === normalizedFullName) {
            return '';
        }
        return rawCustomName;
    };

    const extractCourseIdFromUrl = (url) => {
        const raw = (url || '').trim();
        if (!raw) return '';
        const match = raw.match(/course\.php\/([^\/?]+)/);
        if (match) return (match[1] || '').trim();
        try {
            const parsed = new URL(raw, window.location.href);
            return (
                parsed.searchParams.get('course_id') ||
                parsed.searchParams.get('course') ||
                parsed.searchParams.get('id') ||
                ''
            ).trim();
        } catch {
            return '';
        }
    };

    const toAbsoluteUrl = (url) => {
        const raw = (url || '').trim();
        if (!raw) return '';
        try {
            return new URL(raw, window.location.href).href;
        } catch {
            return '';
        }
    };

    const buildShortNameCacheKeys = (courseId, names = []) => {
        const keys = new Set();
        const normalizedId = (courseId || '').trim();

        if (normalizedId) {
            keys.add(`id::${normalizedId}`);
            keys.add(normalizedId);
        }

        names.forEach((name) => {
            const raw = (name || '').trim();
            if (!raw) return;
            const normalized = normalizeCourseLabelText(raw);

            if (normalizedId) {
                keys.add(`${normalizedId}::${raw}`);
                if (normalized && normalized !== raw) {
                    keys.add(`${normalizedId}::${normalized}`);
                }
            }

            // home.js stores short course cache entries with name:: prefix
            if (normalized) {
                keys.add(`name::${normalized}`);
            }
            if (raw !== normalized) {
                keys.add(`name::${raw}`);
            }

            keys.add(raw);
            if (normalized && normalized !== raw) {
                keys.add(normalized);
            }
        });

        return Array.from(keys);
    };

    const readShortNameFromCache = (cache, courseId, names = []) => {
        if (!cache || typeof cache !== 'object') return '';
        const keys = buildShortNameCacheKeys(courseId, names);
        for (const key of keys) {
            const value = cache[key];
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }

        // Fallback for OpenAI cache keys like "<courseId>::<original full name>".
        // Quick-nav source labels can differ from the original label used to cache,
        // so strict key match may miss while a unique courseId match still exists.
        const normalizedId = (courseId || '').trim();
        if (normalizedId) {
            const idPrefix = `${normalizedId}::`;
            for (const [key, value] of Object.entries(cache)) {
                if (!key.startsWith(idPrefix)) continue;
                if (typeof value === 'string' && value.trim()) {
                    return value.trim();
                }
            }
        }

        return '';
    };

    const loadCourseNameCaches = async () => {
        const defaults = {
            [STORAGE_KEY_CUSTOM_COURSE_NAMES]: {},
            [STORAGE_KEY_OPENAI_COURSE_CACHE]: {},
            [STORAGE_KEY_OPENAI_COURSE_CACHE_LEGACY]: {},
            [STORAGE_KEY_SHORT_COURSE_CACHE]: {}
        };

        try {
            const data = await new Promise((resolve) => {
                chrome.storage.local.get(defaults, resolve);
            });
            return {
                customNames: data[STORAGE_KEY_CUSTOM_COURSE_NAMES] || {},
                openaiCache: {
                    ...(data[STORAGE_KEY_OPENAI_COURSE_CACHE_LEGACY] || {}),
                    ...(data[STORAGE_KEY_OPENAI_COURSE_CACHE] || {})
                },
                shortCourseCache: data[STORAGE_KEY_SHORT_COURSE_CACHE] || {}
            };
        } catch (error) {
            uxDebugWarn('[WebClass UX] Failed to load course-name cache for quick nav', error);
            return {
                customNames: {},
                openaiCache: {},
                shortCourseCache: {}
            };
        }
    };

    const getCurrentAcsToken = () => {
        try {
            const current = new URL(window.location.href);
            return (current.searchParams.get('acs_') || '').trim();
        } catch {
            return '';
        }
    };

    const buildCourseLoginUrl = (courseId, acsToken) => {
        const qs = acsToken ? `?acs_=${encodeURIComponent(acsToken)}` : '';
        return `${window.location.origin}/webclass/course.php/${courseId}/login${qs}`;
    };

    const collectCourseLinksFromDocument = (root, { baseUrl = window.location.href, acsToken = '' } = {}) => {
        if (!root || typeof root.querySelectorAll !== 'function') return [];

        const buckets = [
            {
                priority: 5,
                links: root.querySelectorAll('table.schedule-table a[href*="course.php"]')
            },
            {
                priority: 3,
                links: root.querySelectorAll('.navbar-nav.navbar-left .dropdown-menu a[href*="course.php"]')
            },
            {
                priority: 2,
                links: root.querySelectorAll('ul.dropdown-menu a[href*="course.php"]')
            },
            {
                priority: 1,
                links: root.querySelectorAll('a[href*="course.php"]')
            }
        ];

        const byCourseId = new Map();
        buckets.forEach((bucket) => {
            bucket.links.forEach((link) => {
                const href = link.getAttribute('href') || '';
                if (!href || link.classList?.contains('no-link')) return;
                if (link.dataset?.uxCourseQuickNav === '1') return;

                const courseId = extractCourseIdFromUrl(href);
                if (!courseId) return;

                let absoluteUrl = '';
                try {
                    absoluteUrl = new URL(href, baseUrl).href;
                } catch {
                    return;
                }
                if (!absoluteUrl) return;

                const rawFullName = (
                    link.dataset?.originalText ||
                    link.textContent ||
                    ''
                ).trim();
                const fullName = normalizeCourseLabelText(rawFullName);
                if (!fullName && !rawFullName) return;

                const existing = byCourseId.get(courseId);
                if (!existing || bucket.priority > existing.priority) {
                    byCourseId.set(courseId, {
                        id: courseId,
                        fullName,
                        rawFullName: rawFullName || fullName,
                        url: absoluteUrl,
                        priority: bucket.priority
                    });
                }
            });
        });

        if (byCourseId.size === 0) return [];

        return Array.from(byCourseId.values()).map((course) => {
            let url = course.url;
            if (!url || url.includes('/contents/') || url.includes('do_contents.php')) {
                url = buildCourseLoginUrl(course.id, acsToken);
            }
            return {
                id: course.id,
                fullName: course.fullName,
                rawFullName: course.rawFullName || course.fullName,
                url
            };
        });
    };

    const collectCourseLinksFromCurrentPage = () => {
        const acsToken = getCurrentAcsToken();
        return collectCourseLinksFromDocument(document, {
            baseUrl: window.location.href,
            acsToken
        });
    };

    const HOME_COURSE_CACHE_TTL_MS = 5 * 60 * 1000;
    let cachedHomeCourseLinks = null;
    let cachedHomeCourseLinksAt = 0;
    let pendingHomeCourseLinksPromise = null;

    const collectCourseLinksFromHomePage = async ({ forceRefresh = false } = {}) => {
        const now = Date.now();
        if (!forceRefresh && Array.isArray(cachedHomeCourseLinks) && cachedHomeCourseLinks.length > 0 && (now - cachedHomeCourseLinksAt) < HOME_COURSE_CACHE_TTL_MS) {
            return cachedHomeCourseLinks;
        }

        if (!forceRefresh && pendingHomeCourseLinksPromise) {
            return pendingHomeCourseLinksPromise;
        }

        const acsToken = getCurrentAcsToken();
        const homeUrl = acsToken
            ? `${window.location.origin}/webclass/?acs_=${encodeURIComponent(acsToken)}`
            : `${window.location.origin}/webclass/`;

        const task = (async () => {
            try {
                const response = await fetch(homeUrl, {
                    credentials: 'include',
                    cache: 'no-store'
                });
                if (!response.ok) {
                    uxDebugWarn('[WebClass UX] Home fetch for quick nav failed:', response.status, response.statusText);
                    return [];
                }

                const html = await response.text();
                if (!html || html.length < 100) return [];

                const parsed = new DOMParser().parseFromString(html, 'text/html');
                const courses = collectCourseLinksFromDocument(parsed, {
                    baseUrl: homeUrl,
                    acsToken
                });
                if (courses.length > 0) {
                    cachedHomeCourseLinks = courses;
                    cachedHomeCourseLinksAt = Date.now();
                }
                return courses;
            } catch (error) {
                uxDebugWarn('[WebClass UX] Failed to collect courses from home page', error);
                return [];
            } finally {
                pendingHomeCourseLinksPromise = null;
            }
        })();

        pendingHomeCourseLinksPromise = task;
        return task;
    };

    const extractCourseShortName = (fullName) => {
        let name = fullName || '';
        name = name.replace(/[（(][^）)]*(?:計算|先端|情報|数理|理学|旧数コ|旧物コ|総理)[^）)]*[）)]/g, '');
        const match = name.match(/^(.+?)\s*\((?:20\d{2})/);
        if (match) {
            name = match[1].trim();
        }
        if (name.includes('／')) {
            name = name.split('／')[0].trim();
        }
        name = name.replace(/^»\s*/, '');
        return name.trim();
    };

    const resolveQuickNavDisplayName = (course, caches) => {
        const rawFullName = (course.rawFullName || course.fullName || '').trim();
        const fullName = normalizeCourseLabelText(rawFullName || course.fullName || '');
        const cacheNameCandidates = Array.from(new Set([
            rawFullName,
            fullName,
            course.fullName
        ].map((name) => (name || '').trim()).filter(Boolean)));
        const customName = resolveEditedCustomCourseName(caches.customNames?.[course.id], fullName);
        if (customName) return customName;

        const openaiShortName = readShortNameFromCache(caches.openaiCache, course.id, cacheNameCandidates);
        if (openaiShortName) return openaiShortName;

        const ruleShortName = readShortNameFromCache(caches.shortCourseCache, course.id, cacheNameCandidates);
        if (ruleShortName) return ruleShortName;

        const autoShortName = extractCourseShortName(fullName);
        if (autoShortName && autoShortName !== fullName) return autoShortName;

        return fullName || rawFullName || course.fullName || course.id;
    };

    const readQuickNavCollapsedState = () => {
        try {
            const val = localStorage.getItem(QUICK_NAV_COLLAPSED_STORAGE_KEY);
            if (val === null) return true; // default: collapsed (drawer closed)
            return val === '1';
        } catch {
            return true;
        }
    };

    const saveQuickNavCollapsedState = (collapsed) => {
        try {
            localStorage.setItem(QUICK_NAV_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
        } catch {
            // ignore
        }
    };

    const removeQuickNav = () => {
        const existing = document.getElementById(QUICK_NAV_ID);
        if (existing) existing.remove();
        const floatingBtn = document.querySelector('.ux-course-quick-nav-floating-toggle');
        if (floatingBtn) floatingBtn.remove();
        if (document.body) {
            document.body.classList.remove(QUICK_NAV_ENABLED_CLASS);
            document.body.classList.remove(QUICK_NAV_COLLAPSED_CLASS);
        }
    };

    const ensureQuickNavShell = () => {
        if (!document.body) return null;

        let root = document.getElementById(QUICK_NAV_ID);
        if (!root) {
            root = document.createElement('aside');
            root.id = QUICK_NAV_ID;
            root.innerHTML = `
                <div class="ux-course-quick-nav-header">
                    <button type="button" class="ux-course-quick-nav-toggle" aria-label="Toggle course list" aria-expanded="true">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="3" y1="12" x2="21" y2="12"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                    </button>
                    <span class="ux-course-quick-nav-title">Courses</span>
                </div>
                <div class="ux-course-quick-nav-list-wrap"></div>
            `;
            document.body.appendChild(root);

            // Create floating hamburger button (visible when sidebar is collapsed)
            const floatingBtn = document.createElement('button');
            floatingBtn.className = 'ux-course-quick-nav-floating-toggle';
            floatingBtn.setAttribute('aria-label', 'Open course list');
            floatingBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
            `;
            document.body.appendChild(floatingBtn);
        }

        const toggleButton = root.querySelector('.ux-course-quick-nav-toggle');
        const floatingBtn = document.querySelector('.ux-course-quick-nav-floating-toggle');

        const setCollapsedState = (collapsed) => {
            root.classList.toggle('ux-collapsed', !!collapsed);
            document.body.classList.add(QUICK_NAV_ENABLED_CLASS);
            document.body.classList.toggle(QUICK_NAV_COLLAPSED_CLASS, !!collapsed);
            if (toggleButton) {
                toggleButton.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                toggleButton.setAttribute('title', collapsed ? 'Open course list' : 'Collapse course list');
            }
        };

        if (!root.dataset.uxCourseQuickNavBound) {
            if (toggleButton) {
                toggleButton.addEventListener('click', () => {
                    const nextCollapsed = !root.classList.contains('ux-collapsed');
                    setCollapsedState(nextCollapsed);
                    saveQuickNavCollapsedState(nextCollapsed);
                });
            }
            if (floatingBtn) {
                floatingBtn.addEventListener('click', () => {
                    setCollapsedState(false);
                    saveQuickNavCollapsedState(false);
                });
            }
            root.dataset.uxCourseQuickNavBound = '1';
        }

        setCollapsedState(readQuickNavCollapsedState());
        root.__setCollapsedState = setCollapsedState;
        return root;
    };

    const COURSE_ICON_COLORS = [
        '#1a73e8', '#e8710a', '#137333', '#a142f4',
        '#d93025', '#188038', '#1967d2', '#e37400',
        '#b06000', '#9334e6', '#c5221f', '#0d652d'
    ];

    const getCourseIconColor = (courseId) => {
        let hash = 0;
        const str = courseId || '';
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return COURSE_ICON_COLORS[Math.abs(hash) % COURSE_ICON_COLORS.length];
    };

    const getCourseInitial = (displayName) => {
        if (!displayName) return '?';
        const first = displayName.charAt(0);
        if (/[A-Za-z0-9]/.test(first)) return first.toUpperCase();
        return first;
    };

    const renderQuickNav = (courses) => {
        const root = ensureQuickNavShell();
        if (!root) return;

        const listWrap = root.querySelector('.ux-course-quick-nav-list-wrap');
        if (!listWrap) return;

        listWrap.textContent = '';
        if (!Array.isArray(courses) || courses.length === 0) {
            removeQuickNav();
            return;
        }

        const currentCourseId = extractCourseIdFromUrl(window.location.href);
        const list = document.createElement('ul');
        list.className = 'ux-course-quick-nav-list';

        courses.forEach((course) => {
            const li = document.createElement('li');
            li.className = 'ux-course-quick-nav-item';

            const link = document.createElement('a');
            link.className = 'ux-course-quick-nav-link';
            if (course.id && currentCourseId && course.id === currentCourseId) {
                link.classList.add('is-active');
            }
            link.href = course.url;
            link.title = course.displayName;
            link.dataset.uxCourseQuickNav = '1';

            const iconColor = getCourseIconColor(course.id);
            const initial = getCourseInitial(course.displayName);

            const icon = document.createElement('span');
            icon.className = 'ux-course-quick-nav-icon';
            icon.textContent = initial;
            icon.style.backgroundColor = iconColor;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'ux-course-quick-nav-name';
            nameSpan.textContent = course.displayName;

            link.appendChild(icon);
            link.appendChild(nameSpan);
            li.appendChild(link);
            list.appendChild(li);
        });

        listWrap.appendChild(list);
    };

    const refreshQuickNav = async () => {
        let courseLinks = await collectCourseLinksFromHomePage();
        if (!Array.isArray(courseLinks) || courseLinks.length === 0) {
            courseLinks = collectCourseLinksFromCurrentPage();
        }
        if (courseLinks.length === 0) {
            removeQuickNav();
            return;
        }

        const caches = await loadCourseNameCaches();
        const courses = courseLinks.map((course) => ({
            ...course,
            displayName: resolveQuickNavDisplayName(course, caches)
        }));
        renderQuickNav(courses);
    };

    let quickNavWarmupScheduled = false;
    const scheduleQuickNavWarmupRefresh = () => {
        if (quickNavWarmupScheduled) return;
        quickNavWarmupScheduled = true;
        [350, 1100, 2200].forEach((delay) => {
            window.setTimeout(() => {
                void refreshQuickNav();
            }, delay);
        });
    };

    let quickNavStorageListenerBound = false;
    const bindQuickNavStorageRefresh = () => {
        if (quickNavStorageListenerBound) return;
        if (!chrome?.storage?.onChanged?.addListener) return;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local' || !changes) return;
            if (
                changes[STORAGE_KEY_CUSTOM_COURSE_NAMES] ||
                changes[STORAGE_KEY_OPENAI_COURSE_CACHE] ||
                changes[STORAGE_KEY_OPENAI_COURSE_CACHE_LEGACY] ||
                changes[STORAGE_KEY_SHORT_COURSE_CACHE]
            ) {
                void refreshQuickNav();
            }
        });
        quickNavStorageListenerBound = true;
    };

    const injectStyle = () => {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            body.${BODY_CLASS} {
                background: linear-gradient(180deg, #f8fbff 0%, #f5f7fb 42%, #f5f7fb 100%);
                color: #334155;
            }

            body.${BODY_CLASS}.ux-course-quick-nav-enabled #js-main > .container,
            body.${BODY_CLASS}.ux-course-quick-nav-enabled header .container,
            body.${BODY_CLASS}.ux-course-quick-nav-enabled footer .container {
                margin-left: calc((100% - min(1320px, 100%)) / 2 + 140px);
                margin-right: auto;
                transition: margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            }

            body.${BODY_CLASS}.ux-course-quick-nav-enabled.ux-course-quick-nav-collapsed #js-main > .container,
            body.${BODY_CLASS}.ux-course-quick-nav-enabled.ux-course-quick-nav-collapsed header .container,
            body.${BODY_CLASS}.ux-course-quick-nav-enabled.ux-course-quick-nav-collapsed footer .container {
                margin-left: auto;
                margin-right: auto;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} {
                position: fixed;
                top: 0;
                left: 0;
                width: 280px;
                height: 100vh;
                display: flex;
                flex-direction: column;
                background: #ffffff;
                border-right: 1px solid #dbe4ef;
                box-shadow: 2px 0 12px rgba(15, 23, 42, 0.08);
                z-index: 1200;
                overflow: hidden;
                transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s ease;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID}.ux-collapsed {
                transform: translateX(-280px);
                box-shadow: none;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-header {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 16px;
                border-bottom: 1px solid #dbe4ef;
                flex-shrink: 0;
                background: linear-gradient(135deg, #eef4ff 0%, #f8fbff 100%);
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-title {
                font-size: 15px;
                font-weight: 700;
                color: #1e3a8a;
                letter-spacing: 0.01em;
                text-transform: none;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-toggle {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 40px;
                height: 40px;
                min-width: 40px;
                border: none;
                border-radius: 50%;
                background: transparent;
                color: #334155;
                cursor: pointer;
                transition: background-color 0.15s ease;
                padding: 0;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-toggle:hover {
                background: #edf3ff;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-toggle svg {
                display: block;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap {
                flex: 1;
                overflow-y: auto;
                padding: 8px 0;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list {
                margin: 0;
                padding: 0;
                list-style: none;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-item {
                margin: 0;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-item + .ux-course-quick-nav-item {
                margin-top: 0;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link {
                display: flex;
                align-items: center;
                gap: 14px;
                border-radius: 0 24px 24px 0;
                border: none;
                padding: 8px 20px 8px 16px;
                font-size: 13px;
                font-weight: 600;
                line-height: 1.35;
                color: #334155;
                background: transparent;
                text-decoration: none;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                transition: background-color 0.2s ease, color 0.2s ease;
                margin-right: 8px;
                min-height: 44px;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link:hover {
                background: #edf3ff;
                color: #1d4ed8;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-link.is-active {
                background: #dbeafe;
                color: #1e40af;
                font-weight: 700;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-icon {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                min-width: 32px;
                border-radius: 50%;
                color: #ffffff;
                font-size: 15px;
                font-weight: 600;
                line-height: 1;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-name {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap::-webkit-scrollbar {
                width: 4px;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap::-webkit-scrollbar-track {
                background: transparent;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap::-webkit-scrollbar-thumb {
                background: #c7d2fe;
                border-radius: 4px;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID} .ux-course-quick-nav-list-wrap::-webkit-scrollbar-thumb:hover {
                background: #93c5fd;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID}.ux-collapsed .ux-course-quick-nav-title,
            body.${BODY_CLASS} #${QUICK_NAV_ID}.ux-collapsed .ux-course-quick-nav-list-wrap {
                display: none;
            }

            body.${BODY_CLASS} #${QUICK_NAV_ID}.ux-collapsed .ux-course-quick-nav-header {
                padding: 12px 16px;
                border-bottom: 0;
            }

            /* Floating hamburger button when sidebar is collapsed */
            body.${BODY_CLASS} .ux-course-quick-nav-floating-toggle {
                position: fixed;
                top: 12px;
                left: 12px;
                z-index: 1201;
                display: none;
                align-items: center;
                justify-content: center;
                width: 40px;
                height: 40px;
                border: 1px solid #dbe4ef;
                border-radius: 50%;
                background: #ffffff;
                color: #334155;
                cursor: pointer;
                box-shadow: 0 2px 8px rgba(15, 23, 42, 0.1);
                transition: background-color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
                padding: 0;
            }

            body.${BODY_CLASS} .ux-course-quick-nav-floating-toggle:hover {
                background: #edf3ff;
                border-color: #93c5fd;
                box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
            }

            body.${BODY_CLASS}.ux-course-quick-nav-collapsed .ux-course-quick-nav-floating-toggle {
                display: inline-flex;
            }

            body.${BODY_CLASS} header .container,
            body.${BODY_CLASS} #js-main > .container,
            body.${BODY_CLASS} footer .container {
                width: auto;
                max-width: 1320px;
            }

            body.${BODY_CLASS} .navbar.navbar-default {
                border-color: #e2e8f0;
                background: rgba(255, 255, 255, 0.96);
                box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
            }

            body.${BODY_CLASS} .navbar-default .navbar-brand .course-webclass,
            body.${BODY_CLASS} .navbar-default .navbar-brand .course-name {
                color: #1e3a8a;
                transition: color 0.2s ease;
            }

            body.${BODY_CLASS} .navbar-default .navbar-brand .course-webclass:hover,
            body.${BODY_CLASS} .navbar-default .navbar-brand .course-name:hover {
                color: #2563eb;
            }

            /* Hide account name text (keep user icon) to avoid 2-line header */
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li.dropdown:not(#notification-dropdown-area) > a.dropdown-toggle > span {
                display: none !important;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav > li > a {
                border-radius: 8px;
                transition: background-color 0.2s ease, color 0.2s ease;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav > li > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav > .active > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav > .active > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav > .active > a:focus {
                background-color: #edf3ff;
                color: #2563eb;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav > li.open > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav > li.open > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav > li.open > a:focus {
                background-color: #edf3ff;
                color: #2563eb;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu {
                margin-top: 6px;
                padding: 4px;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                background: #ffffff;
                box-shadow: 0 8px 16px rgba(15, 23, 42, 0.12);
                min-width: 210px;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > li > a {
                display: block;
                border-radius: 6px;
                padding: 6px 10px;
                font-size: 12px;
                color: #334155;
                text-decoration: none;
                white-space: nowrap;
                transition: background-color 0.2s ease, color 0.2s ease;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > li > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > li > a:focus {
                background: #e8f2ff;
                color: #334155;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > .active > a,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > .active > a:hover,
            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu > .active > a:focus {
                background: #dbeafe;
                color: #1e3a8a;
                font-weight: 600;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav .dropdown-menu .divider {
                margin: 4px 0;
                background: #e2e8f0;
            }

            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-right > li > a[href*="logout.php"] {
                display: none !important;
            }

            /* Exception: enlarge left-header dropdown (course menu) text */
            body.${BODY_CLASS} .navbar-default .navbar-nav.navbar-left > li.dropdown > .dropdown-menu > li > a {
                font-size: 14px !important;
                line-height: 1.4;
                padding-top: 8px;
                padding-bottom: 8px;
            }

            body.${BODY_CLASS} #js-main > .container {
                margin-top: 14px;
                margin-bottom: 20px;
            }

            @media (min-width: 1200px) {
                body.${BODY_CLASS} .cm-contentsList > div > .col-xs-12.col-sm-8.col-md-9.col-lg-10 {
                    width: calc(100% - clamp(220px, 23%, 300px));
                }

                body.${BODY_CLASS} .cm-contentsList > div > .col-sm-4.col-md-3.col-lg-2.cm-sideNav_container {
                    width: clamp(220px, 23%, 300px);
                }
            }

            body.${BODY_CLASS} #js-contents .page-header {
                margin-top: 0;
                border-bottom: 1px solid #dbe4ef;
                color: #334155;
                font-weight: 700;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder {
                margin-bottom: 14px;
                border: 1px solid #dbe4ef;
                border-radius: 14px;
                overflow: hidden;
                box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
                background: #ffffff;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder .panel-heading {
                background: linear-gradient(135deg, #eef4ff 0%, #f8fbff 100%);
                border-bottom: 1px solid #dbe4ef;
                padding-top: 12px;
                padding-bottom: 12px;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder .panel-title {
                color: #1e3a8a;
                font-weight: 700;
                letter-spacing: 0.01em;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem {
                border-left: 0;
                border-right: 0;
                border-color: #edf2f8;
                padding: 14px 16px;
                transition: background-color 0.2s ease;
                background: #ffffff;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem:hover {
                background: #f8fbff;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_content {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 14px;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentInfo {
                min-width: 0;
                flex: 1;
            }

            body.${BODY_CLASS} .cm-contentsList .cm-contentsList_contentName {
                margin-top: 0;
                margin-bottom: 8px;
                line-height: 1.45;
            }

            body.${BODY_CLASS} .cm-contentsList .cm-contentsList_contentName a {
                color: #1f2937;
                text-decoration: none;
                transition: color 0.2s ease;
            }

            body.${BODY_CLASS} .cm-contentsList .cm-contentsList_contentName a:hover {
                color: #2563eb;
            }

            /* Gray-out items without a valid link (content info only, keep detail buttons intact) */
            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-contents-disabled .cl-contentsList_contentInfo {
                opacity: 0.5;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-contents-disabled .cm-contentsList_contentName {
                color: #9ca3af;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_listGroupItem.ux-contents-disabled:hover {
                background: #ffffff;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_new {
                display: inline-block;
                margin-right: 8px;
                padding: 1px 8px;
                border-radius: 999px;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.02em;
                background: #ef4444;
                color: #ffffff;
                vertical-align: middle;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_categoryLabel {
                display: inline-flex;
                align-items: center;
                border-radius: 999px;
                padding: 2px 10px;
                background: #eaf2ff;
                color: #1d4ed8;
                font-size: 12px;
                font-weight: 600;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailList {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                justify-content: flex-end;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailList:has(a[href*="history"]) {
                flex-direction: row-reverse;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItem {
                margin: 0;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-height: 34px;
                padding: 0 12px;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                background: #ffffff;
                color: #6b7280;
                text-decoration: none;
                font-weight: 600;
                transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
            }

            body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailListItemData a:hover {
                background: #ffffff;
                border-color: #c5cad3;
                color: #6b7280;
            }

            body.${BODY_CLASS} .cm-sideNav_container {
                position: sticky;
                top: 84px;
                background: #ffffff;
                border: 1px solid #dbe4ef;
                border-radius: 14px;
                padding: 12px;
                box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
            }

            body.${BODY_CLASS} .cm-sideNav_folders {
                margin: 0;
                padding: 0;
                max-height: calc(100vh - 140px);
                overflow: auto;
                list-style: none;
            }

            body.${BODY_CLASS} .cm-sideNav_folders > li + li {
                margin-top: 6px;
            }

            body.${BODY_CLASS} .cm-sideNav_folderLink {
                display: block;
                padding: 8px 10px;
                border-radius: 10px;
                border: 1px solid transparent;
                text-decoration: none;
                color: #64748b;
                transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
            }

            body.${BODY_CLASS} .cm-sideNav_folderLink:hover {
                background: #edf3ff;
                color: #2563eb;
                border-color: #c7d8ff;
            }

            body.${BODY_CLASS} .timeline-messages {
                border: 1px solid #dbe4ef;
                border-radius: 12px;
                background: #ffffff;
                padding: 0;
                box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
            }

            body.${BODY_CLASS} .btn.btn-default {
                border-color: #cbd5e1;
                background: #ffffff;
                color: #334155;
            }

            body.${BODY_CLASS} .btn.btn-default:hover {
                border-color: #9fb9ff;
                background: #edf3ff;
                color: #2563eb;
            }

            body.${BODY_CLASS} .btn.btn-primary {
                border-color: #2563eb;
                background: #2563eb;
                box-shadow: 0 2px 8px rgba(37, 99, 235, 0.22);
            }

            body.${BODY_CLASS} .btn.btn-primary:hover,
            body.${BODY_CLASS} .btn.btn-primary:focus {
                border-color: #1d4ed8;
                background: #1d4ed8;
            }

            body.${BODY_CLASS} .ft-footer {
                border-top: 1px solid #e2e8f0;
                background: transparent;
            }

            body.${BODY_CLASS} .ft-footer .ft-footer_message {
                color: #64748b;
            }

            @media (max-width: 1199px) {
                body.${BODY_CLASS} .cm-contentsList .cl-contentsList_content {
                    flex-direction: column;
                    gap: 10px;
                }

                body.${BODY_CLASS} .cm-contentsList .cl-contentsList_contentDetailList {
                    justify-content: flex-start;
                }
            }

            @media (max-width: 991px) {
                body.${BODY_CLASS} #js-main > .container {
                    padding-left: 12px;
                    padding-right: 12px;
                }

                body.${BODY_CLASS} .cm-sideNav_container {
                    position: static;
                    margin-top: 12px;
                }

                body.${BODY_CLASS} .cm-contentsList .cl-contentsList_folder {
                    border-radius: 12px;
                }
            }

            @media (max-width: 1199px) {
                body.${BODY_CLASS} #${QUICK_NAV_ID},
                body.${BODY_CLASS} .ux-course-quick-nav-floating-toggle {
                    display: none !important;
                }

                body.${BODY_CLASS}.ux-course-quick-nav-enabled #js-main > .container,
                body.${BODY_CLASS}.ux-course-quick-nav-enabled.ux-course-quick-nav-collapsed #js-main > .container,
                body.${BODY_CLASS}.ux-course-quick-nav-enabled header .container,
                body.${BODY_CLASS}.ux-course-quick-nav-enabled footer .container {
                    margin-left: auto;
                    margin-right: auto;
                    padding-left: 12px;
                }
            }
        `;

        (document.head || document.documentElement).appendChild(style);
    };

    const markDisabledContentsItems = () => {
        const items = document.querySelectorAll('.cm-contentsList .cl-contentsList_listGroupItem');
        items.forEach(item => {
            const nameEl = item.querySelector('.cm-contentsList_contentName');
            if (!nameEl) return;
            const link = nameEl.querySelector('a[href]');
            const hasValidLink = link && link.getAttribute('href') && !link.getAttribute('href').startsWith('javascript:');
            item.classList.toggle('ux-contents-disabled', !hasValidLink);
        });
    };

    const activateThemeIfContentsPage = () => {
        if (!document.body) return false;
        const hasContents = !!document.querySelector('#js-contents .cm-contentsList');
        if (!hasContents) return false;

        document.body.classList.add(BODY_CLASS);
        markDisabledContentsItems();
        void refreshQuickNav();
        scheduleQuickNavWarmupRefresh();
        bindQuickNavStorageRefresh();
        return true;
    };

    injectStyle();

    if (activateThemeIfContentsPage()) {
        log('Applied course contents visual refresh');
        return;
    }

    const observer = new MutationObserver(() => {
        if (!activateThemeIfContentsPage()) return;
        observer.disconnect();
        log('Applied course contents visual refresh (after render)');
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
}


/**
 * Suppress 'beforeunload' dialog
 * Note: The main suppression is now done by beforeunload-blocker.js
 * which is injected via manifest.json with world: "MAIN"
 * This function provides fallback cleanup in the content script world.
 */
function suppressBeforeUnload() {
    log('suppressBeforeUnload called (content script world)');

    // The main blocking is done by beforeunload-blocker.js in the MAIN world
    // This content script can only do limited cleanup

    // Add a capturing listener in the content script world as backup
    window.addEventListener('beforeunload', function (e) {
        e.stopImmediatePropagation();
        e.stopPropagation();
        try {
            delete e.returnValue;
        } catch (ex) { }
    }, { capture: true });

    log('Added beforeunload listener in content script world as backup');
}

// ============================================================
// Initialization
// ============================================================

function init() {
    log('Initializing...');

    const pageType = detectPageType();
    log('Detected page type:', pageType);

    // Suppress beforeunload on material pages IMMEDIATELY at document_start
    // This must run before any other scripts (especially Vue.js textbook.js)
    if (pageType === 'shiryou' || pageType === 'shiryou_title') {
        suppressBeforeUnload();
    }

    // For shiryou_title, we need to wait for body to exist
    if (pageType === 'shiryou_title') {
        const setupTitleFrame = () => {
            // 一時的に背景色を設定して読み込み中のチラつきを防ぐ
            if (document.body) {
                document.body.style.background = '#1365b5';
                document.body.style.margin = '0';
            }
            log('shiryou_title frame: waiting for parent to inject header');
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupTitleFrame);
        } else if (document.body) {
            setupTitleFrame();
        }
        return;
    }

    // loadit.phpの「表示に問題があるときは」メッセージフレームを非表示
    if (pageType === 'loadit_message') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', hideLoaditMessageFrame);
        } else {
            hideLoaditMessageFrame();
        }
        return;
    }

    // 資料タイプのページはUI改善を適用
    if (pageType === 'shiryou') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                enhanceShiryouPageUI();
                setTimeout(observeFrames, 500);
            });
        } else {
            enhanceShiryouPageUI();
            setTimeout(observeFrames, 500);
        }
        return;
    }

    if (pageType === 'shiken') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                enhanceShikenPageUI();
                setTimeout(observeFrames, 500);
            });
        } else {
            enhanceShikenPageUI();
            setTimeout(observeFrames, 500);
        }
        return;
    }

    if (pageType === 'course_list') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', enhanceCourseContentsPageUI);
        } else {
            enhanceCourseContentsPageUI();
        }
    }

    // ページ読み込み完了後に実行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(observeFrames, 500);
        });
    } else {
        setTimeout(observeFrames, 500);
    }

    // フレームの場合、親ウィンドウからの情報も活用
    const getParentInfo = () => {
        if (window.parent !== window) {
            try {
                // 親ウィンドウの課題名を取得してみる
                const parentContentName = window.parent.document.querySelector('input[name="contents_name"]');
                if (parentContentName) {
                    window.uxContentName = parentContentName.value;
                    log('Got content name from parent:', window.uxContentName);
                }
            } catch (e) {
                // クロスオリジンの場合はスキップ
            }
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', getParentInfo);
    } else {
        getParentInfo();
    }
}

// 実行
chrome.storage.local.get({
    [STORAGE_KEY_EXTENSION_VISUAL_ENABLED]: true
}, (items) => {
    setUxExtensionVisualEnabled(items[STORAGE_KEY_EXTENSION_VISUAL_ENABLED] !== false);
    if (!isUxExtensionVisualEnabled()) {
        log('Global visual modification is disabled. Skipping course.js init.');
        return;
    }
    init();
});
