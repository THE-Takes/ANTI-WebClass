// course.js
// Handles Content Pages: Download renaming for shiryou/shiken types

console.log("WebClass UX Improver: Course script loaded");

// ============================================================
// Configuration
// ============================================================
const CONFIG = {
    // ファイル名に使用できない文字を置換
    invalidChars: /[<>:"/\\|?*]/g,
    // デバッグモード
    debug: true
};

function log(...args) {
    if (CONFIG.debug) {
        console.log('[WebClass UX]', ...args);
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
        return 'pdf_viewer';
    }
    
    // 資料タイプ: txtbk_frame.php または txtbk_show_chapter.php
    if (url.includes('txtbk_frame.php') || url.includes('txtbk_show_chapter.php') || url.includes('txtbk_show_text.php')) {
        return 'shiryou';
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
 * 注: 添付資料リンクはそのまま（元の動作を維持）
 * @param {string} contentName
 */
function enhanceAttachmentLinks(contentName) {
    // 添付資料リンクの改造は行わない（元の動作を維持）
    // ダウンロードウィンドウ（file_down.php）内でリネームボタンを提供
    log('Attachment links: keeping original behavior');
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
    renameBtn.innerHTML = '📥 リネームしてダウンロード<br><small>' + truncateFileName(renamedFileName, 30) + '</small>';
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
    originalBtn.innerHTML = '📄 元のファイル名でダウンロード<br><small>' + truncateFileName(originalFileName || '不明', 30) + '</small>';
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
        renameBtn.innerHTML = '📥 ' + truncateFileName(renamedFileName, 15);
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
        
        // 既存ボタンの隣に追加
        btn.parentNode.insertBefore(renameBtn, btn.nextSibling);
        btn.parentNode.insertBefore(imageBtn, renameBtn.nextSibling);
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
    imageBtn.innerHTML = '🖼️ 画像として保存<br><small>PDFビューアで開く</small>';
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
                imageBtn.innerHTML = '✅ ビューアで開きました<br><small>画像ボタンを押してください</small>';
            } else {
                throw new Error(response?.error || 'Unknown error');
            }
        } catch (error) {
            log('Error opening PDF viewer:', error);
            imageBtn.innerHTML = '❌ エラー<br><small>開けませんでした</small>';
        }
        
        setTimeout(() => {
            imageBtn.innerHTML = '🖼️ 画像として保存<br><small>PDFビューアで開く</small>';
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
    imageBtn.innerHTML = '🖼️ 画像';
    imageBtn.title = `PDFを画像として保存: ${baseFileName}`;
    
    imageBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        imageBtn.disabled = true;
        const originalText = imageBtn.innerHTML;
        imageBtn.innerHTML = '⏳';
        
        try {
            await convertViewerPdfToImages(baseFileName);
            imageBtn.innerHTML = '✅';
            setTimeout(() => {
                imageBtn.innerHTML = originalText;
                imageBtn.disabled = false;
            }, 2000);
        } catch (error) {
            log('Error converting PDF to images:', error);
            imageBtn.innerHTML = '❌';
            setTimeout(() => {
                imageBtn.innerHTML = originalText;
                imageBtn.disabled = false;
            }, 3000);
        }
    });
    
    return imageBtn;
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
// Initialization
// ============================================================

function init() {
    log('Initializing...');
    
    // ページ読み込み完了後に実行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(observeFrames, 500);
        });
    } else {
        setTimeout(observeFrames, 500);
    }
    
    // フレームの場合、親ウィンドウからの情報も活用
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
}

// 実行
init();
