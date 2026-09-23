// background/downloads.js
// PDF viewer handoff and Chrome download requests.

/**
 * Open WebClass PDF in a viewer tab for manual page extraction.
 * @param {Object} message
 * @param {Object} sender
 * @param {Function} sendResponse
 */
async function handleConvertPdfToImages(message, sender, sendResponse) {
    const { url, baseFileName } = message;

    uxDebugLog('[WebClass UX] Convert PDF to images request:', { url, baseFileName });

    try {
        // Build the PDF viewer URL through WebClass loadit.php.
        let pdfViewerUrl;

        // Normalize relative links to absolute WebClass URLs.
        let absoluteUrl = url;
        if (!url.startsWith('http')) {
            absoluteUrl = 'https://kulms.kanagawa-u.ac.jp' + (url.startsWith('/') ? '' : '/') + url;
        }

        const encodedUrl = encodeURIComponent(absoluteUrl);
        pdfViewerUrl = `https://kulms.kanagawa-u.ac.jp/webclass/loadit.php?file=${encodedUrl}`;

        // Open a new tab with the PDF viewer.
        const tab = await chrome.tabs.create({
            url: pdfViewerUrl,
            active: true
        });

        // Extraction is performed from the PDF viewer tab by user action.
        // Return success once the viewer tab has been opened.
        sendResponse({
            success: true,
            message: 'PDF viewer was opened. Use the "Extract pages" button in the viewer tab.',
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
 * Download a blob/object URL via the Chrome downloads API.
 * @param {Object} sender
 * @param {Function} sendResponse
 */
async function handleDownloadBlob(message, sender, sendResponse) {
    const { url, filename } = message;

    uxDebugLog('[WebClass UX] Blob download request:', { url, filename });

    try {
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

            uxDebugLog('[WebClass UX] Blob download started:', downloadId);
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
 * Download a file URL and optionally apply a custom filename.
 * @param {Object} sender
 * @param {Function} sendResponse
 */
async function handleDownloadFile(message, sender, sendResponse) {
    const { url, filename, rename } = message;

    uxDebugLog('[WebClass UX] Download request:', { url, filename, rename });

    try {
        let absoluteUrl = url;
        if (!url.startsWith('http')) {
            if (sender.tab && sender.tab.url) {
                const baseUrl = new URL(sender.tab.url);
                absoluteUrl = new URL(url, baseUrl.origin).href;
            } else {
                absoluteUrl = 'https://kulms.kanagawa-u.ac.jp' + (url.startsWith('/') ? '' : '/') + url;
            }
        }

        if (rename && filename) {
            urlToFilename.set(absoluteUrl, filename);
            urlToFilename.set(url, filename);
        } else {
            // Do not reuse a stale rename mapping for an original-name download.
            urlToFilename.delete(absoluteUrl);
            urlToFilename.delete(url);
        }

        const downloadOptions = {
            url: absoluteUrl,
            saveAs: false
        };

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

            uxDebugLog('[WebClass UX] Download started:', downloadId);

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
