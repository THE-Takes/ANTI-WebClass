// course/downloads.js
// Download controls, PDF actions, image conversion, and frame observation.

// ============================================================
// Download Button Enhancement
// ============================================================

/**
 * ダウンロードボタンを強化（選択肢を追加）
 */
function enhanceDownloadLinks() {
  if (!isUxExtensionVisualEnabled()) return;
  rememberUxOriginalBodyState(document);

  const pageType = detectPageType();
  log("Page type:", pageType);

  if (pageType === "unknown" || pageType === "course_list") {
    log("Skipping enhancement for this page type");
    return;
  }

  // ダウンロードウィンドウの場合は特別処理
  if (pageType === "download_window") {
    enhanceDownloadWindow();
    return;
  }

  // PDFビューアの場合は特別処理
  if (pageType === "pdf_viewer") {
    enhancePdfViewerPage();
    return;
  }

  const contentName = getContentName();
  const courseName = getCourseName();
  log("Content name:", contentName);
  log("Course name:", courseName);

  // 添付資料リンクを検出
  enhanceAttachmentLinks(contentName);

  // 添付資料がないページでは、教材本体のPDFをダウンロード対象にする
  enhancePrimaryPdfLinks(contentName);

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
  log("Enhancing attachment links");

  // file_down.php へのリンクを検出
  const attachmentLinks = document.querySelectorAll('a[href*="file_down.php"]');

  log(`Found ${attachmentLinks.length} attachment links`);

  attachmentLinks.forEach((link) => {
    if (link.dataset.uxEnhanced) return;
    link.dataset.uxEnhanced = "true";

    const fileDownUrl = link.href;

    // URLからファイル名を取得
    const originalFileName = getFileNameFromFileDownUrl(fileDownUrl);
    const extension = getExtensionFromUrl(fileDownUrl);

    // リネーム後のファイル名を生成
    const renamedFileName = buildMaterialDownloadFileName(
      contentName,
      link,
      extension,
    );

    log("Attachment link:", { fileDownUrl, originalFileName, renamedFileName });

    // 元のonclickイベントを無効化（ポップアップウィンドウを開かないようにする）
    link.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
    link.removeAttribute("target");

    // ダウンロードオプションのUIを作成
    createInlineDownloadOptions(
      link,
      fileDownUrl,
      renamedFileName,
      originalFileName,
    );
  });
}

function getPrimaryPdfDownloadInfo(textUrl, pageNumber) {
  try {
    const parsedTextUrl = new URL(textUrl, window.location.origin);
    const filePath = parsedTextUrl.searchParams.get("file");
    if (!filePath || !/\.pdf$/i.test(filePath)) return null;

    const contentsUrl = parsedTextUrl.searchParams.get("contents_url");
    const relativePdfUrl = contentsUrl
      ? `${contentsUrl.replace(/\/$/, "")}/${filePath.replace(/^\//, "")}`
      : `/webclass/data/course/${filePath.replace(/^\//, "")}`;
    const pdfUrl = new URL(relativePdfUrl, window.location.origin);
    if (pdfUrl.origin !== window.location.origin) return null;

    return {
      pageNumber: String(pageNumber),
      url: pdfUrl.href,
      originalFileName: filePath.split("/").filter(Boolean).pop() || "document.pdf",
    };
  } catch (error) {
    log("Could not parse primary PDF URL:", error);
    return null;
  }
}

function getPrimaryPdfDownloads() {
  const jsonData = document.querySelector("#json-data");
  if (!jsonData) return [];

  try {
    const config = JSON.parse(jsonData.textContent || "{}");
    const textUrls =
      config.text_urls && typeof config.text_urls === "object"
        ? config.text_urls
        : config.text_url
          ? { [config.page || 1]: config.text_url }
          : {};
    return Object.entries(textUrls)
      .map(([pageNumber, textUrl]) =>
        typeof textUrl === "string"
          ? getPrimaryPdfDownloadInfo(textUrl, pageNumber)
          : null,
      )
      .filter(Boolean);
  } catch (error) {
    log("Could not read primary PDF metadata:", error);
    return [];
  }
}

function getTocPageNumber(pageButton) {
  const onclick = pageButton?.getAttribute("onclick") || "";
  const pageMatch = onclick.match(/gopage\(['"]?(\d+)['"]?\)/);
  if (pageMatch) return pageMatch[1];

  const value = normalizeDownloadNamePart(pageButton?.value);
  return /^\d+$/.test(value) ? value : null;
}

function enhancePrimaryPdfLinks(contentName) {
  const toc = document.querySelector("#TOC");
  if (!toc) return;

  const downloadsByPage = new Map(
    getPrimaryPdfDownloads().map((download) => [download.pageNumber, download]),
  );
  if (downloadsByPage.size === 0) return;

  toc.querySelectorAll('input[name="clickpage"]').forEach((pageButton) => {
    const pageNumber = getTocPageNumber(pageButton);
    const download = pageNumber ? downloadsByPage.get(pageNumber) : null;
    const row = pageButton.closest("tr");
    if (!download || !row) return;
    if (row.querySelector('a[href*="file_down.php"], .ux-inline-download-options')) {
      return;
    }

    const targetCell = pageButton.closest("td") || row.lastElementChild || row;
    const renamedFileName = buildMaterialDownloadFileName(
      contentName,
      pageButton,
      ".pdf",
    );
    const options = buildInlineDownloadOptions(
      targetCell.ownerDocument || document,
      download.url,
      renamedFileName,
      download.originalFileName,
      "direct",
    );
    options.dataset.uxPrimaryPdfDownload = "true";
    targetCell.appendChild(options);
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
    const fileName = urlObj.searchParams.get("file_name");
    if (fileName) {
      return decodeURIComponent(fileName);
    }
  } catch (e) {
    log("Error extracting filename from file_down.php URL:", e);
  }
  return "ファイル";
}

/**
 * インラインでダウンロードオプションを作成
 * 元のリンクの横に2つのダウンロードボタンを表示
 * @param {Element} originalLink
 * @param {string} fileDownUrl - file_down.php のURL
 * @param {string} renamedFileName
 * @param {string} originalFileName
 */
function buildInlineDownloadOptions(
  doc,
  fileDownUrl,
  renamedFileName,
  originalFileName,
  downloadSource = "file-down",
) {
  // コンテナを作成
  const container = doc.createElement("span");
  container.className = "ux-inline-download-options";

  // リネームダウンロードボタン
  const renameBtn = doc.createElement("button");
  renameBtn.type = "button";
  renameBtn.className = "ux-download-btn ux-download-rename";
  prepareInlineDownloadButton(
    renameBtn,
    "rename",
    fileDownUrl,
    renamedFileName,
    originalFileName,
    downloadSource,
  );
  bindInlineDownloadButton(renameBtn);

  // 元のファイル名でダウンロードボタン
  const originalBtn = doc.createElement("button");
  originalBtn.type = "button";
  originalBtn.className = "ux-download-btn ux-download-original";
  prepareInlineDownloadButton(
    originalBtn,
    "original",
    fileDownUrl,
    renamedFileName,
    originalFileName,
    downloadSource,
  );
  bindInlineDownloadButton(originalBtn);

  container.appendChild(renameBtn);
  container.appendChild(originalBtn);

  return container;
}

function createInlineDownloadOptions(
  originalLink,
  fileDownUrl,
  renamedFileName,
  originalFileName,
) {
  const doc = originalLink.ownerDocument || document;
  const container = buildInlineDownloadOptions(
    doc,
    fileDownUrl,
    renamedFileName,
    originalFileName,
  );
  originalLink.parentNode.insertBefore(container, originalLink.nextSibling);
}

/**
 * file_down.phpからダウンロードURLを取得してダウンロードを実行
 * @param {string} fileDownUrl - file_down.php のURL
 * @param {string|null} filename - リネーム後のファイル名（nullの場合は元のファイル名）
 */
async function downloadFromFileDownUrl(fileDownUrl, filename) {
  log("Fetching download URL from:", fileDownUrl);

  try {
    // file_down.phpページをフェッチ
    const response = await fetch(fileDownUrl, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const html = await response.text();

    // HTMLからdownload.phpのURLを抽出
    const downloadUrl = extractDownloadUrlFromHtml(html);

    if (!downloadUrl) {
      throw new Error("Could not extract download URL");
    }

    log("Extracted download URL:", downloadUrl);

    // ダウンロードを実行
    triggerDownload(downloadUrl, filename);
  } catch (error) {
    log("Error fetching from file_down.php:", error);
    // フォールバック: 直接file_down.phpを開く（従来の動作）
    window.open(fileDownUrl, "_blank");
    throw error;
  }
}

function downloadDirectUrl(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "DOWNLOAD_FILE", url, filename, rename: filename !== null },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.success) {
          reject(new Error(response?.error || "Download failed"));
          return;
        }
        resolve(response);
      },
    );
  });
}

/**
 * HTMLからdownload.phpのURLを抽出
 * @param {string} html
 * @returns {string|null}
 */
function extractDownloadUrlFromHtml(html) {
  // DOMパーサーでHTMLを解析
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

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
    url = url.replace(/&amp;/g, "&");
    // 相対URLを絶対URLに変換
    if (!url.startsWith("http")) {
      url = new URL(url, window.location.origin).href;
    }
    return url;
  }

  return null;
}

/**
 * PDFビューアのダウンロードボタンを強化
 * @param {string} contentName
 */
function enhancePdfViewerDownload(contentName) {
  // iframe内のPDFビューアを探す
  const iframes = document.querySelectorAll("iframe");

  iframes.forEach((iframe) => {
    try {
      const iframeDoc =
        iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return;

      // ダウンロードボタンを探す
      const downloadBtn = iframeDoc.querySelector(
        "#download, #secondaryDownload",
      );
      if (downloadBtn && !downloadBtn.dataset.uxEnhanced) {
        downloadBtn.dataset.uxEnhanced = "true";

        // PDFのURLを取得
        const pdfUrl = getPdfUrlFromViewer(iframeDoc);
        if (pdfUrl) {
          const extension = ".pdf";
          const renamedFileName = sanitizeFileName(contentName) + extension;
          const originalFileName =
            getOriginalFileName(pdfUrl) || "document.pdf";

          // 既存のクリックイベントをインターセプト
          downloadBtn.addEventListener(
            "click",
            (e) => {
              e.preventDefault();
              e.stopPropagation();
              showDownloadChoice(pdfUrl, renamedFileName, originalFileName, e);
            },
            true,
          );
        }
      }
    } catch (e) {
      // クロスオリジンの場合はスキップ
      log("Cannot access iframe:", e.message);
    }
  });

  // 直接ページ上のダウンロードボタン
  const downloadBtns = document.querySelectorAll(
    '#download, #secondaryDownload, button[data-l10n-id="download"]',
  );
  downloadBtns.forEach((btn) => {
    if (btn.dataset.uxEnhanced) return;
    btn.dataset.uxEnhanced = "true";

    const pdfUrl = getPdfUrlFromViewer(document);
    if (pdfUrl) {
      const renamedFileName = sanitizeFileName(contentName) + ".pdf";
      const originalFileName = getOriginalFileName(pdfUrl) || "document.pdf";

      btn.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          showDownloadChoice(pdfUrl, renamedFileName, originalFileName, e);
        },
        true,
      );
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
  const scripts = doc.querySelectorAll("script");
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
  log("Enhancing download window");

  // download.php リンクを探す
  const downloadLinks = document.querySelectorAll('a[href*="download.php"]');

  downloadLinks.forEach((link) => {
    if (link.dataset.uxEnhanced) return;
    link.dataset.uxEnhanced = "true";

    const downloadUrl = link.href;
    const originalFileName = getOriginalFileName(downloadUrl);
    const extension = getExtensionFromUrl(downloadUrl);

    // 親ウィンドウから課題名を取得を試みる
    let contentName = getContentNameFromParent() || getContentName();
    if (!contentName || contentName === "Unknown") {
      // ファイル名から推測（拡張子を除去）
      contentName = originalFileName
        ? originalFileName.replace(/\.[^.]+$/, "")
        : "download";
    }

    const renamedFileName = sanitizeFileName(contentName) + extension;

    log("Download window link:", {
      downloadUrl,
      originalFileName,
      renamedFileName,
    });

    // ダウンロードウィンドウ用のボタングループを作成
    createDownloadWindowButtonGroup(
      link,
      downloadUrl,
      renamedFileName,
      originalFileName,
    );
  });
}

/**
 * ダウンロードウィンドウ用のボタングループを作成
 * @param {Element} originalLink
 * @param {string} downloadUrl - download.php のURL（実際のダウンロードURL）
 * @param {string} renamedFileName
 * @param {string} originalFileName
 */
function createDownloadWindowButtonGroup(
  originalLink,
  downloadUrl,
  renamedFileName,
  originalFileName,
) {
  const container = document.createElement("div");
  container.className = "ux-download-group";
  container.style.cssText =
    "display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;";

  // リネームダウンロードボタン
  const renameBtn = document.createElement("button");
  renameBtn.type = "button";
  renameBtn.className = "ux-download-btn ux-download-rename";
  setDownloadIconButton(
    renameBtn,
    "rename",
    "リネームしてダウンロード",
    renamedFileName,
  );
  renameBtn.style.cssText = "width: 44px; height: 44px; padding: 10px;";
  renameBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    triggerDownload(downloadUrl, renamedFileName);
  });

  // 元のファイル名でダウンロードボタン
  const originalBtn = document.createElement("button");
  originalBtn.type = "button";
  originalBtn.className = "ux-download-btn ux-download-original";
  setDownloadIconButton(
    originalBtn,
    "original",
    "元のファイル名でダウンロード",
    originalFileName || "不明",
  );
  originalBtn.style.cssText = "width: 44px; height: 44px; padding: 10px;";
  originalBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    triggerDownload(downloadUrl, null);
  });

  container.appendChild(renameBtn);
  container.appendChild(originalBtn);

  // PDFファイルの場合は「画像として保存」ボタンを追加
  const extension = getExtensionFromUrl(downloadUrl).toLowerCase();
  if (extension === ".pdf") {
    const imageBaseFileName = renamedFileName.replace(/\.pdf$/i, "");
    const imageBtn = createSaveAsImageButton(downloadUrl, imageBaseFileName);
    container.appendChild(imageBtn);
  }

  // 元のリンクをテキストに置換
  const fileNameText = document.createElement("span");
  fileNameText.className = "ux-filename-text";
  fileNameText.style.cssText =
    "display: block; margin-bottom: 10px; color: inherit;";
  fileNameText.textContent = "» " + (originalFileName || "ファイル");

  // 元のリンクを非表示にして、テキストを挿入
  originalLink.style.display = "none";
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
    "#WsTitle h2",
    ".bgc_sub h2",
    "h2",
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
      for (const selector of ["#WsTitle h2", ".bgc_sub h2"]) {
        const h2 = doc.querySelector(selector);
        if (h2) {
          let text = h2.textContent.trim();
          text = text.replace(/^New\s*/i, "");
          if (text && text !== "" && text !== ">") {
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
      log("Frame access error:", e.message);
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
  log("Enhancing PDF viewer page");
  bindShikenPdfScrollHandoff(document);

  // ダウンロードボタンを探す（メインとセカンダリ両方）
  const downloadBtns = document.querySelectorAll(
    '#download, #secondaryDownload, button[data-l10n-id="download"]',
  );

  // 課題名を親から取得
  let contentName = getContentNameFromParent();
  log("Content name from parent:", contentName);

  if (!contentName || contentName === "Unknown") {
    // URLから課題名を推測
    contentName = getContentNameFromUrl();
    log("Content name from URL:", contentName);
  }

  if (!contentName) {
    contentName = "document";
  }

  // PDF URLを取得
  const pdfUrl = getPdfUrlFromViewer(document) || window.location.href;
  const renamedFileName = sanitizeFileName(contentName) + ".pdf";
  const imageBaseFileName = sanitizeFileName(contentName);

  log("PDF viewer:", { pdfUrl, renamedFileName, contentName });

  downloadBtns.forEach((btn) => {
    if (btn.dataset.uxEnhanced) return;
    btn.dataset.uxEnhanced = "true";

    // リネームダウンロードボタンを追加（既存ボタンは元名として機能）
    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "ux-download-btn ux-download-rename";
    setDownloadIconButton(
      renameBtn,
      "rename",
      "リネームしてダウンロード",
      renamedFileName,
    );
    renameBtn.style.marginLeft = "8px";
    renameBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      triggerDownload(pdfUrl, renamedFileName);
    });

    // 画像として保存ボタンを追加
    const imageBtn = createSaveAsImageButtonForViewer(imageBaseFileName);
    imageBtn.style.marginLeft = "8px";

    // クリップボードにコピーボタンを追加
    const copyBtn = createCopyAsImageButtonForViewer();
    copyBtn.style.marginLeft = "8px";

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
    const contentsName = url.searchParams.get("contents_name");
    if (contentsName) {
      return decodeURIComponent(contentsName);
    }

    // set_contents_id から取得できないので、リファラーをチェック
    if (document.referrer) {
      const refUrl = new URL(document.referrer);
      const refContentsName = refUrl.searchParams.get("contents_name");
      if (refContentsName) {
        return decodeURIComponent(refContentsName);
      }
    }
  } catch (e) {
    log("Error extracting content name from URL:", e);
  }
  return null;
}

/**
 * ファイル名を切り詰め
 * @param {string} name
 * @param {number} maxLength
 * @returns {string}
 */
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
      `[キャンセル] 元のファイル名でダウンロード\n→ ${originalFileName}`,
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
  log("Triggering download:", { url, filename });

  // background.jsにメッセージを送信
  chrome.runtime.sendMessage(
    {
      type: "DOWNLOAD_FILE",
      url: url,
      filename: filename, // nullならリネームしない
      rename: filename !== null,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        log("Error sending message:", chrome.runtime.lastError);
        // フォールバック: 直接ダウンロード
        window.open(url, "_blank");
      } else {
        log("Download initiated:", response);
      }
    },
  );
}

function triggerBlobDownload(url, filename) {
  log("Triggering blob download:", { url, filename });

  return new Promise((resolve, reject) => {
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      resolve();
    } catch (error) {
      reject(error);
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
  const imageBtn = document.createElement("button");
  imageBtn.type = "button";
  imageBtn.className = "ux-download-btn ux-download-image";
  imageBtn.innerHTML = "画像として保存<br><small>PDFビューアで開く</small>";
  imageBtn.title = `PDFを画像として保存: ${baseFileName}`;
  imageBtn.style.cssText = "padding: 10px 16px; font-size: 14px;";

  imageBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    imageBtn.disabled = true;
    imageBtn.innerHTML =
      "⏳ 開いています...<br><small>しばらくお待ちください</small>";

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: "CONVERT_PDF_TO_IMAGES",
            url: pdfUrl,
            baseFileName: baseFileName,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          },
        );
      });

      if (response && response.success) {
        imageBtn.innerHTML =
          "ビューアで開きました<br><small>画像ボタンを押してください</small>";
      } else {
        throw new Error(response?.error || "Unknown error");
      }
    } catch (error) {
      log("Error opening PDF viewer:", error);
      imageBtn.innerHTML = "エラー<br><small>開けませんでした</small>";
    }

    setTimeout(() => {
      imageBtn.innerHTML = "画像として保存<br><small>PDFビューアで開く</small>";
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
  const imageBtn = document.createElement("button");
  imageBtn.type = "button";
  imageBtn.className = "ux-download-btn ux-download-image";
  imageBtn.innerHTML = "画像";
  imageBtn.title = `PDFを画像として保存: ${baseFileName}`;

  imageBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    imageBtn.disabled = true;
    const originalText = imageBtn.innerHTML;
    imageBtn.innerHTML = "⏳";

    try {
      await convertViewerPdfToImages(baseFileName);
      imageBtn.innerHTML = "完了";
      setTimeout(() => {
        imageBtn.innerHTML = originalText;
        imageBtn.disabled = false;
      }, 2000);
    } catch (error) {
      log("Error converting PDF to images:", error);
      imageBtn.innerHTML = "失敗";
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
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "ux-download-btn ux-download-copy";
  copyBtn.innerHTML = "コピー";
  copyBtn.title = "現在のページを画像としてクリップボードにコピー";

  copyBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    copyBtn.disabled = true;
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = "⏳";

    try {
      await copyCurrentPageToClipboard();
      copyBtn.innerHTML = "完了";
      setTimeout(() => {
        copyBtn.innerHTML = originalText;
        copyBtn.disabled = false;
      }, 2000);
    } catch (error) {
      log("Error copying to clipboard:", error);
      copyBtn.innerHTML = "失敗";
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
  log("Copying current page to clipboard");

  // 現在表示中のページを取得
  const viewerContainer = document.getElementById("viewerContainer");
  if (!viewerContainer) {
    throw new Error("Viewer container not found");
  }

  // 表示領域の中央にあるページを特定
  const containerRect = viewerContainer.getBoundingClientRect();
  const centerY = containerRect.top + containerRect.height / 2;

  const pageContainers = document.querySelectorAll(".page[data-page-number]");
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
    throw new Error("No page found");
  }

  const pageNum = currentPage.dataset.pageNumber;
  log(`Copying page ${pageNum}`);

  // Canvas要素を取得
  const canvas = currentPage.querySelector("canvas");
  if (!canvas) {
    throw new Error("Canvas not found for current page");
  }

  // CanvasをBlobに変換
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Failed to create blob from canvas"));
      }
    }, "image/png");
  });

  // クリップボードにコピー
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob,
      }),
    ]);
    log(`Page ${pageNum} copied to clipboard`);
  } catch (error) {
    // Clipboard API が使えない場合のフォールバック
    log("Clipboard API failed, trying fallback:", error);
    throw new Error(
      "クリップボードへのコピーに失敗しました。ブラウザの権限を確認してください。",
    );
  }
}

/**
 * PDFビューアから既存のCanvas要素をキャプチャして画像としてダウンロード
 * CSP制限を回避するため、既にレンダリングされているCanvasを使用
 * @param {string} baseFileName - ベースファイル名（拡張子なし）
 */
async function convertViewerPdfToImages(baseFileName) {
  log("Converting viewer PDF to images using existing canvases");

  // PDFビューアのページコンテナを取得
  const pageContainers = document.querySelectorAll(".page[data-page-number]");

  if (pageContainers.length === 0) {
    throw new Error("PDF pages not found");
  }

  log(`Found ${pageContainers.length} pages`);

  // 全ページを表示させるためにスクロール
  // まず現在のスクロール位置を保存
  const originalScrollTop =
    document.getElementById("viewerContainer")?.scrollTop || 0;

  const images = [];

  for (let i = 0; i < pageContainers.length; i++) {
    const pageContainer = pageContainers[i];
    const pageNum = parseInt(pageContainer.dataset.pageNumber, 10);

    log(`Processing page ${pageNum}`);

    // ページを表示領域にスクロール
    pageContainer.scrollIntoView();

    // レンダリングを待つ
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Canvas要素を取得
    let canvas = pageContainer.querySelector("canvas");

    if (!canvas) {
      log(`Canvas not found for page ${pageNum}, waiting...`);
      // レンダリングを待つ
      await new Promise((resolve) => setTimeout(resolve, 1000));
      canvas = pageContainer.querySelector("canvas");
    }

    if (!canvas) {
      log(`Canvas still not found for page ${pageNum}, skipping`);
      continue;
    }

    try {
      // Canvasから画像データを取得
      const imageData = canvas.toDataURL("image/png");
      images.push({ pageNum, imageData });
      log(`Captured page ${pageNum}`);
    } catch (e) {
      log(`Error capturing page ${pageNum}:`, e);
      // tainted canvasの場合はスキップ
    }
  }

  // スクロール位置を復元
  const viewerContainer = document.getElementById("viewerContainer");
  if (viewerContainer) {
    viewerContainer.scrollTop = originalScrollTop;
  }

  if (images.length === 0) {
    throw new Error("No pages could be captured");
  }

  log(`Captured ${images.length} pages, starting download`);

  // 画像をダウンロード
  for (let i = 0; i < images.length; i++) {
    const { pageNum, imageData } = images[i];
    const fileName =
      images.length === 1
        ? `${baseFileName}.png`
        : `${baseFileName}_${String(pageNum).padStart(3, "0")}.png`;

    await downloadBase64AsImage(imageData, fileName);

    if (i < images.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  log("All pages downloaded");
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
      const byteString = atob(base64Data.split(",")[1]);
      const mimeType = base64Data.split(",")[0].split(":")[1].split(";")[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: mimeType });

      // Blob URLを作成
      const blobUrl = URL.createObjectURL(blob);

      // 直接ダウンロード（aタグ使用）
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Blob URLを解放
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      log("Image downloaded:", fileName);
      resolve();
    } catch (error) {
      log("Error downloading image:", error);
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
  if (!isUxExtensionVisualEnabled()) return;

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
      if (!isUxExtensionVisualEnabled()) return;
      // デバウンス
      clearTimeout(window.uxEnhanceTimeout);
      window.uxEnhanceTimeout = setTimeout(() => {
        if (!isUxExtensionVisualEnabled()) return;
        enhanceDownloadLinks();
      }, 500);
    }
  });

  if (
    safeObserveUxMutation(observer, document.body, {
      childList: true,
      subtree: true,
    })
  ) {
    document.__uxDownloadObserver = observer;
  }
}
