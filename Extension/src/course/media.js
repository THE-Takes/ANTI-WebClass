// course/media.js
// Material content and video download/transmux behavior.

function enhanceShiryouContentFrame() {
  log("Enhancing shiryou content frame");

  // framesetが含まれている場合のみ（PDFビューアを含むframeset）
  // メッセージバーを非表示にする処理を行う
  const hasFrameset = document.querySelector("frameset");

  if (hasFrameset) {
    // PDFを表示するframesetページの場合
    // 「表示に問題があるときは...」のメッセージはloaditフレームで処理済み
    log("Content frame has frameset, no additional processing needed");
    return;
  }

  // framesetがない場合（テキストコンテンツ等）は何もしない
  // コンテンツを正常に表示する
  log("Content frame has no frameset, showing content as-is");
  enhanceVideoMaterialDownloads();
}

let uxVideoEnhancementRetryTimer = null;
let uxVideoEnhancementRetryCount = 0;
const UX_VIDEO_ENHANCEMENT_MAX_RETRIES = 20;

function scheduleVideoMaterialEnhancementRetry() {
  if (
    uxVideoEnhancementRetryTimer ||
    uxVideoEnhancementRetryCount >= UX_VIDEO_ENHANCEMENT_MAX_RETRIES
  ) {
    return;
  }

  uxVideoEnhancementRetryTimer = setTimeout(() => {
    uxVideoEnhancementRetryTimer = null;
    uxVideoEnhancementRetryCount += 1;
    enhanceVideoMaterialDownloads();
  }, 250);
}

function enhanceVideoMaterialDownloads() {
  const videos = document.querySelectorAll("video");
  if (!videos.length) {
    return;
  }

  const contentName = getVideoMaterialContentName();
  log(`Found ${videos.length} video(s) in shiryou content frame`);
  let needsSourceRetry = false;

  videos.forEach((video, index) => {
    if (video.dataset.uxVideoDownloadEnhanced) return;

    // Fullscreen availability does not depend on the download source being
    // initialized, so prepare the native controls as soon as the video exists.
    ensureNativeVideoFullscreen(video);

    const sourceInfo = getVideoDownloadSourceInfo(video);
    if (
      !sourceInfo.blobUrl &&
      !sourceInfo.directUrl &&
      !sourceInfo.originalUrl
    ) {
      log(
        "Skipping video download enhancement because no source URL was found",
      );
      needsSourceRetry = true;
      return;
    }

    video.dataset.uxVideoDownloadEnhanced = "true";

    createVideoDownloadOptions(
      video,
      sourceInfo,
      contentName,
      videos.length > 1 ? index + 1 : null,
    );
  });

  if (needsSourceRetry) {
    scheduleVideoMaterialEnhancementRetry();
  } else {
    uxVideoEnhancementRetryCount = 0;
  }
}

function getVideoMaterialContentName() {
  const candidates = [
    getContentNameFromParent(),
    getContentNameFromUrl(),
    getContentName(),
    getVideoMaterialTitle(),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = String(candidate).trim();
    if (!normalized || normalized === "Unknown") continue;
    return normalized;
  }

  return "video";
}

function getVideoMaterialTitle() {
  const title = document.title.replace(/\s*-\s*WebClass.*$/i, "").trim();
  return title || "video";
}

function getCurrentVideoPageNumber() {
  try {
    const url = new URL(window.location.href);
    const pageParam = url.searchParams.get("page");
    if (pageParam && /^\d+$/.test(pageParam)) {
      return pageParam;
    }
  } catch (error) {
    log("Error extracting video page from URL:", error);
  }

  try {
    const chapterFrame =
      window.top.frames && window.top.frames["webclass_chapter"];
    const chapterDoc = chapterFrame && chapterFrame.document;
    if (!chapterDoc) {
      throw new Error("chapter frame not ready");
    }

    const activeButton = chapterDoc.querySelector(
      'tr.bkkhaki input[name="clickpage"], td.bkkhaki input[name="clickpage"]',
    );
    if (activeButton) {
      const value = activeButton.value && activeButton.value.trim();
      if (value) {
        return value;
      }
    }
  } catch (error) {
    log("Error extracting current video page from chapter frame:", error);
  }

  return null;
}

function hasOnlyFirstVideoPage() {
  try {
    const chapterFrame =
      window.top.frames && window.top.frames["webclass_chapter"];
    const chapterDoc = chapterFrame && chapterFrame.document;
    if (!chapterDoc) {
      throw new Error("chapter frame not ready");
    }

    const pageNumbers = new Set();
    chapterDoc.querySelectorAll('input[name="clickpage"]').forEach((button) => {
      const value = button.value && button.value.trim();
      if (/^\d+$/.test(value)) {
        pageNumbers.add(value);
        return;
      }

      const onclick = button.getAttribute("onclick") || "";
      const pageMatch = onclick.match(/gopage\(['"]?(\d+)['"]?\)/);
      if (pageMatch) {
        pageNumbers.add(pageMatch[1]);
      }
    });

    if (pageNumbers.size > 0) {
      return pageNumbers.size === 1 && pageNumbers.has("1");
    }

    const jsonData = chapterDoc.querySelector("#json-data");
    if (jsonData) {
      const config = JSON.parse(jsonData.textContent);
      const textUrls = config && config.text_urls;
      if (textUrls && typeof textUrls === "object") {
        const pages = Object.keys(textUrls).filter((page) =>
          /^\d+$/.test(page),
        );
        return pages.length === 1 && pages[0] === "1";
      }
    }
  } catch (error) {
    log("Error checking video page count:", error);
  }

  return false;
}

function shouldOmitSingleVideoPageNumber(pageNumber) {
  return String(pageNumber || "").trim() === "1" && hasOnlyFirstVideoPage();
}

function getCurrentVideoPageNumberForFileName() {
  const pageNumber = getCurrentVideoPageNumber();
  if (shouldOmitSingleVideoPageNumber(pageNumber)) {
    return null;
  }
  return pageNumber;
}

function buildVideoMaterialBaseName(
  contentName,
  pageNumber,
  suffixIndex = null,
) {
  let baseName = contentName;
  if (pageNumber && !shouldOmitSingleVideoPageNumber(pageNumber)) {
    baseName += `_${pageNumber}`;
  }
  if (suffixIndex !== null) {
    baseName += `_${suffixIndex}`;
  }
  return baseName;
}

function getVideoDownloadSourceInfo(video) {
  const currentSrc =
    video.currentSrc || video.src || video.getAttribute("src") || "";
  const blobUrl = currentSrc.startsWith("blob:") ? currentSrc : null;
  const directUrl =
    currentSrc && !currentSrc.startsWith("blob:") ? currentSrc : null;

  let originalUrl = null;
  try {
    const urlObj = new URL(window.location.href);
    const fileParam = urlObj.searchParams.get("file");
    if (fileParam) {
      const decodedFile = decodeURIComponent(fileParam);
      if (/^https?:/i.test(decodedFile)) {
        originalUrl = decodedFile;
      } else {
        const contentsUrl = decodeURIComponent(
          urlObj.searchParams.get("contents_url") || "",
        );
        if (contentsUrl) {
          originalUrl = new URL(
            decodedFile,
            window.location.origin + contentsUrl,
          ).href;
        } else {
          originalUrl = new URL(decodedFile, window.location.href).href;
        }
      }
    }
  } catch (error) {
    log("Error resolving video original URL:", error);
  }

  const hlsUrl = isHlsPlaylistUrl(originalUrl)
    ? originalUrl
    : isHlsPlaylistUrl(directUrl)
      ? directUrl
      : null;
  const originalExtension =
    getExtensionFromUrl(originalUrl || directUrl || "") ||
    (hlsUrl ? ".m3u8" : null);

  return {
    blobUrl,
    directUrl,
    originalUrl,
    hlsUrl,
    originalExtension,
  };
}

function getCurrentVideoDownloadBaseName(contentName, suffixIndex = null) {
  return sanitizeFileName(
    buildVideoMaterialBaseName(
      contentName,
      getCurrentVideoPageNumberForFileName(),
      suffixIndex,
    ),
  );
}

function normalizeVideoExtensionForCompatibility(extension) {
  const normalized =
    typeof extension === "string" ? extension.toLowerCase() : "";
  if (!normalized) {
    return ".mp4";
  }

  if (normalized === ".m4v" || normalized === ".mov") {
    return ".mp4";
  }

  return normalized;
}

function getPreferredDirectVideoExtension(sourceUrl) {
  return normalizeVideoExtensionForCompatibility(
    getExtensionFromUrl(sourceUrl) || ".mp4",
  );
}

function getCompatibleVideoFileName(baseName, sourceInfo) {
  if (sourceInfo?.hlsUrl) {
    return `${baseName}.mp4`;
  }

  if (sourceInfo?.blobUrl) {
    return `${baseName}.mp4`;
  }

  if (sourceInfo?.directUrl || sourceInfo?.originalUrl) {
    return `${baseName}${getPreferredDirectVideoExtension(sourceInfo.directUrl || sourceInfo.originalUrl)}`;
  }

  return `${baseName}.mp4`;
}

function removeVideoResizeLabel(video) {
  const scope = video.closest("form, td, section, article, div") || video.parentElement;
  if (!scope) return;

  scope
    .querySelectorAll("label, span, p, small, strong, b, a, button")
    .forEach((element) => {
      const text = (element.textContent || "")
        .replace(/^[»›>]+/, "")
        .replace(/\s+/g, "")
        .trim();
      if (/^サイズ変更[：:]?$/.test(text)) element.remove();
    });

  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const removable = [];
  while (walker.nextNode()) {
    const text = (walker.currentNode.textContent || "")
      .replace(/^[»›>]+/, "")
      .replace(/\s+/g, "")
      .trim();
    if (/^サイズ変更[：:]?$/.test(text)) removable.push(walker.currentNode);
  }
  removable.forEach((node) => node.remove());
}

function ensureNativeVideoFullscreen(video) {
  video.controls = true;
  video.setAttribute("controls", "");
  ensureVideoNativeFullscreenContext();
}

function wrapVideoPlayer(video) {
  const existing = video.closest(".ux-video-player-shell");
  if (existing) return existing;
  const shell = document.createElement("div");
  shell.className = "ux-video-player-shell";
  video.parentNode?.insertBefore(shell, video);
  shell.appendChild(video);
  return shell;
}

function shouldRenameVideoResponseToMp4(contentType, originalExtension) {
  const normalizedType = (contentType || "").toLowerCase();
  const normalizedExtension =
    normalizeVideoExtensionForCompatibility(originalExtension);

  if (normalizedExtension === ".webm" || normalizedExtension === ".ts") {
    return false;
  }

  if (
    normalizedType.includes("video/mp4") ||
    normalizedType.includes("audio/mp4") ||
    normalizedType.includes("quicktime")
  ) {
    return true;
  }

  return normalizedExtension === ".mp4";
}

function createVideoDownloadOptions(
  video,
  sourceInfo,
  contentName,
  suffixIndex = null,
) {
  removeVideoResizeLabel(video);
  const playerShell = wrapVideoPlayer(video);

  const container = document.createElement("div");
  container.className = "ux-download-group ux-video-download-controls";

  const initialBaseName = getCurrentVideoDownloadBaseName(
    contentName,
    suffixIndex,
  );
  const estimatedFileName = getCompatibleVideoFileName(
    initialBaseName,
    sourceInfo,
  );

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "ux-download-btn ux-download-rename ux-video-download-button";
  saveBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3v12"></path>
      <path d="m7 10 5 5 5-5"></path>
      <path d="M5 21h14"></path>
    </svg>
  `;
  saveBtn.setAttribute("aria-label", "動画をダウンロード");
  saveBtn.title = `動画を保存: ${estimatedFileName}`;

  const progress = document.createElement("div");
  progress.className = "ux-video-download-progress";
  progress.hidden = true;
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-label", "動画の取得状況");
  progress.setAttribute("aria-valuemin", "0");
  progress.setAttribute("aria-valuemax", "100");
  const progressFill = document.createElement("span");
  progress.appendChild(progressFill);
  container.appendChild(progress);

  const setProgress = (completed = 0, total = 0) => {
    progress.hidden = false;
    container.classList.add("is-downloading");
    if (total > 0) {
      const percent = Math.max(
        0,
        Math.min(100, Math.round((completed / total) * 100)),
      );
      progress.classList.remove("is-indeterminate");
      progressFill.style.width = `${percent}%`;
      progress.setAttribute("aria-valuenow", String(percent));
    } else {
      progress.classList.add("is-indeterminate");
      progress.removeAttribute("aria-valuenow");
    }
  };

  saveBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    saveBtn.disabled = true;
    saveBtn.setAttribute("aria-label", "動画を取得中");
    setProgress();

    try {
      const baseName = getCurrentVideoDownloadBaseName(
        contentName,
        suffixIndex,
      );
      if (sourceInfo.hlsUrl) {
        const fileName = await downloadHlsVideo(
          sourceInfo.hlsUrl,
          baseName,
          (completed, total) => {
            setProgress(completed, total);
          },
        );
        saveBtn.title = `動画を保存: ${fileName}`;
      } else if (sourceInfo.directUrl || sourceInfo.originalUrl) {
        const sourceUrl = sourceInfo.directUrl || sourceInfo.originalUrl;
        const fileName = `${baseName}${getPreferredDirectVideoExtension(sourceUrl)}`;
        await downloadRemoteFileAsBlob(sourceUrl, fileName);
        saveBtn.title = `動画を保存: ${fileName}`;
      } else if (sourceInfo.blobUrl) {
        const fileName = `${baseName}.mp4`;
        await triggerBlobDownload(sourceInfo.blobUrl, fileName);
        saveBtn.title = `動画を保存: ${fileName}`;
      } else {
        throw new Error("No downloadable source found");
      }
      setProgress(1, 1);
      saveBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m5 12 4 4L19 6"></path>
        </svg>
      `;
      saveBtn.setAttribute("aria-label", "動画のダウンロード完了");
    } catch (error) {
      console.error("[WebClass UX] Video download error:", error);
      log("Video download error:", error);
      saveBtn.title = error?.message || "Video download failed";
      saveBtn.setAttribute("aria-label", "動画のダウンロードに失敗");
      container.classList.add("has-error");
    }

    setTimeout(() => {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3v12"></path>
          <path d="m7 10 5 5 5-5"></path>
          <path d="M5 21h14"></path>
        </svg>
      `;
      saveBtn.setAttribute("aria-label", "動画をダウンロード");
      container.classList.remove("is-downloading", "has-error");
      progress.hidden = true;
      progress.classList.remove("is-indeterminate");
      progressFill.style.width = "0";
    }, 2000);
  });
  container.appendChild(saveBtn);

  playerShell.appendChild(container);
}

let activeVideoFrameFullscreenSession = null;

async function openVideoFullscreenOverlay(video, contentName) {
  const topDoc = window.top?.document;
  const frameEl =
    window.frameElement ||
    topDoc?.querySelector(
      'frame[name="webclass_content"], iframe[name="webclass_content"]',
    );

  if (video && shouldUseDirectVideoFullscreen(frameEl)) {
    try {
      prepareOwningFrameForVideoFullscreen(frameEl);
      await requestVideoFullscreen(video);
      return;
    } catch (error) {
      log("Video fullscreen failed, falling back to frame fullscreen:", error);
    }
  }

  if (frameEl) {
    releaseActiveVideoFrameFullscreenSession();
    const cleanupFullscreenLayout = video
      ? activateVideoFrameFullscreenLayout(video)
      : null;
    try {
      await requestElementFullscreen(frameEl);
      bindVideoFrameFullscreenCleanup(frameEl, cleanupFullscreenLayout);
      return;
    } catch (error) {
      cleanupFullscreenLayout?.();
      log("Frame fullscreen failed:", error);
    }
  }

  const label = contentName || "動画";
  alert(`${label} を全画面表示できませんでした。`);
}

function shouldUseDirectVideoFullscreen(frameEl) {
  if (!frameEl) {
    return true;
  }

  // Embedded course content is commonly loaded in <frame>/<iframe> contexts
  // where calling video.requestFullscreen() is blocked by the document policy.
  return false;
}

function prepareOwningFrameForVideoFullscreen(frameEl) {
  if (!frameEl || frameEl.tagName !== "IFRAME") {
    return;
  }

  if (!frameEl.hasAttribute("allowfullscreen")) {
    frameEl.setAttribute("allowfullscreen", "");
  }

  const allow = frameEl.getAttribute("allow") || "";
  if (!/\bfullscreen\b/i.test(allow)) {
    frameEl.setAttribute(
      "allow",
      allow ? `${allow}; fullscreen *` : "fullscreen *",
    );
  }
}

function requestVideoFullscreen(video) {
  if (!video) {
    return Promise.reject(new Error("Video element is unavailable"));
  }

  if (typeof video.requestFullscreen === "function") {
    return video.requestFullscreen();
  }

  if (typeof video.webkitEnterFullscreen === "function") {
    video.webkitEnterFullscreen();
    return Promise.resolve();
  }

  if (typeof video.webkitEnterFullScreen === "function") {
    video.webkitEnterFullScreen();
    return Promise.resolve();
  }

  return requestElementFullscreen(video);
}

function ensureVideoFrameFullscreenStyles() {
  if (document.getElementById("ux-video-frame-fullscreen-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "ux-video-frame-fullscreen-style";
  style.textContent = `
        html.ux-video-frame-fullscreen-active,
        html.ux-video-frame-fullscreen-active body {
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #000 !important;
        }

        html.ux-video-frame-fullscreen-active body {
            position: relative !important;
        }

        html.ux-video-frame-fullscreen-active body > * {
            visibility: hidden !important;
        }

        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-root,
        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-root * {
            visibility: visible !important;
        }

        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-root {
            position: fixed !important;
            inset: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100vw !important;
            height: 100vh !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #000 !important;
            z-index: 2147483646 !important;
        }

        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-root table,
        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-root tbody,
        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-root tr,
        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-root td {
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            background: #000000 !important;
        }

        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-root br,
        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-root a {
            display: none !important;
        }

        html.ux-video-frame-fullscreen-active .ux-video-fullscreen-target {
            display: block !important;
            width: 100vw !important;
            height: 100vh !important;
            max-width: 100vw !important;
            max-height: 100vh !important;
            margin: 0 auto !important;
            background: #000 !important;
            object-fit: contain !important;
        }

        html.ux-video-frame-fullscreen-active .ux-download-group {
            display: none !important;
        }
    `;

  (document.head || document.documentElement).appendChild(style);
}

function activateVideoFrameFullscreenLayout(video) {
  if (!video) {
    return null;
  }

  ensureVideoFrameFullscreenStyles();

  const layoutRoot =
    video.closest(".contentfile") || video.parentElement || video;
  document.documentElement.classList.add("ux-video-frame-fullscreen-active");
  if (document.body) {
    document.body.classList.add("ux-video-frame-fullscreen-active");
  }
  layoutRoot.classList.add("ux-video-fullscreen-root");
  video.classList.add("ux-video-fullscreen-target");

  return () => {
    document.documentElement.classList.remove(
      "ux-video-frame-fullscreen-active",
    );
    if (document.body) {
      document.body.classList.remove("ux-video-frame-fullscreen-active");
    }
    layoutRoot.classList.remove("ux-video-fullscreen-root");
    video.classList.remove("ux-video-fullscreen-target");
  };
}

function releaseActiveVideoFrameFullscreenSession() {
  if (!activeVideoFrameFullscreenSession) {
    return;
  }

  activeVideoFrameFullscreenSession.stop();
  activeVideoFrameFullscreenSession = null;
}

function bindVideoFrameFullscreenCleanup(frameEl, cleanup) {
  if (!cleanup) {
    return;
  }

  releaseActiveVideoFrameFullscreenSession();

  const docs = [];
  const events = [
    "fullscreenchange",
    "webkitfullscreenchange",
    "mozfullscreenchange",
    "MSFullscreenChange",
  ];
  const appendDoc = (doc) => {
    if (doc && !docs.includes(doc)) {
      docs.push(doc);
    }
  };

  appendDoc(document);

  try {
    appendDoc(frameEl?.ownerDocument);
  } catch (error) {
    log("Unable to access fullscreen owner document:", error);
  }

  try {
    appendDoc(window.top?.document);
  } catch (error) {
    log("Unable to access top document for fullscreen sync:", error);
  }

  let released = false;
  let syncFullscreenState = null;

  const release = () => {
    if (released) {
      return;
    }
    released = true;

    docs.forEach((doc) => {
      events.forEach((eventName) => {
        doc.removeEventListener(eventName, syncFullscreenState);
      });
    });

    cleanup();

    if (activeVideoFrameFullscreenSession?.release === release) {
      activeVideoFrameFullscreenSession = null;
    }
  };

  syncFullscreenState = () => {
    const isFrameStillFullscreen = docs.some((doc) => {
      const fullscreenElement =
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.msFullscreenElement;
      return fullscreenElement === frameEl;
    });

    if (!isFrameStillFullscreen) {
      release();
    }
  };

  docs.forEach((doc) => {
    events.forEach((eventName) => {
      doc.addEventListener(eventName, syncFullscreenState);
    });
  });

  activeVideoFrameFullscreenSession = {
    release,
    stop: release,
  };
}

function requestElementFullscreen(element) {
  if (element.requestFullscreen) {
    return element.requestFullscreen();
  }
  if (element.webkitRequestFullscreen) {
    return Promise.resolve(element.webkitRequestFullscreen());
  }
  if (element.msRequestFullscreen) {
    return Promise.resolve(element.msRequestFullscreen());
  }
  return Promise.reject(new Error("Fullscreen API is unavailable"));
}

function isHlsPlaylistUrl(url) {
  return typeof url === "string" && /\.m3u8(?:$|[?#])/i.test(url);
}

async function downloadRemoteFileAsBlob(url, filename) {
  const response = await fetch(url, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const blob = await response.blob();
  const originalExtension = getExtensionFromUrl(url) || ".mp4";
  const targetFilename = shouldRenameVideoResponseToMp4(
    blob.type,
    originalExtension,
  )
    ? `${filename.replace(/\.[^.]+$/, "")}.mp4`
    : filename;
  await downloadBlobData(blob, targetFilename);
}

async function downloadBlobData(blob, filename) {
  const blobUrl = URL.createObjectURL(blob);

  try {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  }
}

async function fetchTextWithCredentials(url) {
  const response = await fetch(url, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  return response.text();
}

async function fetchArrayBufferWithCredentials(url, byteRange = null) {
  const headers = {};
  if (
    byteRange &&
    Number.isFinite(byteRange.start) &&
    Number.isFinite(byteRange.end)
  ) {
    headers.Range = `bytes=${byteRange.start}-${byteRange.end}`;
  }

  const response = await fetch(url, {
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  return {
    buffer: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") || "",
  };
}

function parseHlsAttributeList(text) {
  const attributes = {};
  const regex = /([A-Z0-9-]+)=("(?:[^"\\]|\\.)*"|[^,]*)/gi;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const key = match[1];
    let value = match[2] || "";
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    attributes[key] = value;
  }

  return attributes;
}

function getHlsVariantScore(attributes) {
  const bandwidth = parseInt(attributes.BANDWIDTH || "0", 10) || 0;
  const resolution = attributes.RESOLUTION || "";
  const resolutionMatch = resolution.match(/(\d+)x(\d+)/i);
  const pixels = resolutionMatch
    ? (parseInt(resolutionMatch[1], 10) || 0) *
      (parseInt(resolutionMatch[2], 10) || 0)
    : 0;

  return pixels * 100000000 + bandwidth;
}

function parseHlsByteRange(value, previousByteRange = null) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const match = value.trim().match(/^(\d+)(?:@(\d+))?$/);
  if (!match) {
    return null;
  }

  const length = parseInt(match[1], 10);
  if (!Number.isFinite(length) || length <= 0) {
    return null;
  }

  const explicitStart = match[2] ? parseInt(match[2], 10) : null;
  const start = Number.isFinite(explicitStart)
    ? explicitStart
    : previousByteRange
      ? previousByteRange.end + 1
      : 0;

  return {
    start,
    end: start + length - 1,
  };
}

async function resolveHlsMediaPlaylist(hlsUrl, visited = new Set()) {
  const normalizedUrl = new URL(hlsUrl, window.location.href).href;
  if (visited.has(normalizedUrl)) {
    throw new Error("Detected recursive HLS playlist reference");
  }
  visited.add(normalizedUrl);

  const manifestText = await fetchTextWithCredentials(normalizedUrl);
  const lines = manifestText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("#EXT-X-STREAM-INF:")) {
      continue;
    }

    const nextLine = lines[i + 1];
    if (!nextLine || nextLine.startsWith("#")) {
      continue;
    }

    const attributes = parseHlsAttributeList(
      line.slice("#EXT-X-STREAM-INF:".length),
    );
    variants.push({
      url: new URL(nextLine, normalizedUrl).href,
      score: getHlsVariantScore(attributes),
    });
  }

  if (variants.length) {
    variants.sort((a, b) => b.score - a.score);
    return resolveHlsMediaPlaylist(variants[0].url, visited);
  }

  return {
    playlistUrl: normalizedUrl,
    manifestText,
  };
}

function buildHlsSegmentPlan(manifestText, playlistUrl) {
  const lines = manifestText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let initSegmentUrl = null;
  const segmentUrls = [];
  let pendingSegmentByteRange = null;
  let previousSegmentReference = null;

  for (const line of lines) {
    if (line.startsWith("#EXT-X-KEY:")) {
      const attributes = parseHlsAttributeList(
        line.slice("#EXT-X-KEY:".length),
      );
      const method = (attributes.METHOD || "NONE").toUpperCase();
      if (method !== "NONE") {
        throw new Error("Encrypted HLS streams are not supported yet");
      }
      continue;
    }

    if (line.startsWith("#EXT-X-MAP:")) {
      const attributes = parseHlsAttributeList(
        line.slice("#EXT-X-MAP:".length),
      );
      if (attributes.URI) {
        const resolvedUrl = new URL(attributes.URI, playlistUrl).href;
        initSegmentUrl = {
          url: resolvedUrl,
          byteRange: parseHlsByteRange(attributes.BYTERANGE || "", null),
        };
      }
      continue;
    }

    if (line.startsWith("#EXT-X-BYTERANGE:")) {
      pendingSegmentByteRange = line.slice("#EXT-X-BYTERANGE:".length).trim();
      continue;
    }

    if (line.startsWith("#")) {
      continue;
    }

    const resolvedUrl = new URL(line, playlistUrl).href;
    const previousByteRange =
      previousSegmentReference?.url === resolvedUrl
        ? previousSegmentReference.byteRange
        : null;
    const byteRange = parseHlsByteRange(
      pendingSegmentByteRange,
      previousByteRange,
    );
    const segmentReference = {
      url: resolvedUrl,
      byteRange,
    };

    segmentUrls.push(segmentReference);
    previousSegmentReference = segmentReference;
    pendingSegmentByteRange = null;
  }

  if (!segmentUrls.length) {
    throw new Error("No HLS segments were found");
  }

  return {
    initSegmentUrl,
    segmentUrls,
  };
}

function detectHlsOutputFormat(url, contentType, hasInitSegment) {
  const normalizedType = (contentType || "").toLowerCase();

  if (normalizedType.includes("mp2t") || /\.ts(?:$|[?#])/i.test(url)) {
    return {
      extension: ".ts",
      mimeType: "video/mp2t",
    };
  }

  if (
    hasInitSegment ||
    normalizedType.includes("mp4") ||
    /\.m4s(?:$|[?#])/i.test(url) ||
    /\.mp4(?:$|[?#])/i.test(url)
  ) {
    return {
      extension: ".mp4",
      mimeType: "video/mp4",
    };
  }

  return {
    extension: hasInitSegment ? ".mp4" : ".ts",
    mimeType: hasInitSegment ? "video/mp4" : "video/mp2t",
  };
}

function isMuxJsMp4TransmuxerAvailable() {
  return !!globalThis.muxjs?.Transmuxer;
}

function concatUint8Arrays(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return combined;
}

let mp4BoxModulePromise = null;

function sliceArrayBufferFromUint8Array(data) {
  const normalized = data instanceof Uint8Array ? data : new Uint8Array(data);
  return normalized.buffer.slice(
    normalized.byteOffset,
    normalized.byteOffset + normalized.byteLength,
  );
}

function parseMp4BoxHeaders(data, start = 0, end = data.byteLength) {
  const boxes = [];
  let offset = start;

  while (offset + 8 <= end) {
    let size =
      ((data[offset] << 24) |
        (data[offset + 1] << 16) |
        (data[offset + 2] << 8) |
        data[offset + 3]) >>>
      0;
    const type = String.fromCharCode(
      data[offset + 4],
      data[offset + 5],
      data[offset + 6],
      data[offset + 7],
    );
    let headerSize = 8;

    if (size === 1) {
      if (offset + 16 > end) {
        break;
      }

      const high =
        (data[offset + 8] * 0x1000000 +
          (data[offset + 9] << 16) +
          (data[offset + 10] << 8) +
          data[offset + 11]) >>>
        0;
      const low =
        (data[offset + 12] * 0x1000000 +
          (data[offset + 13] << 16) +
          (data[offset + 14] << 8) +
          data[offset + 15]) >>>
        0;
      size = high * 0x100000000 + low;
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }

    if (!Number.isFinite(size) || size < headerSize || offset + size > end) {
      break;
    }

    boxes.push({
      offset,
      size,
      headerSize,
      type,
    });

    offset += size;
  }

  return boxes;
}

function needsStandaloneMp4Rebuild(mp4Data) {
  const normalized =
    mp4Data instanceof Uint8Array ? mp4Data : new Uint8Array(mp4Data);
  const topLevelBoxes = parseMp4BoxHeaders(normalized);
  if (topLevelBoxes.some((box) => box.type === "moof")) {
    return true;
  }

  const moov = topLevelBoxes.find((box) => box.type === "moov");
  if (!moov) {
    return false;
  }

  return parseMp4BoxHeaders(
    normalized,
    moov.offset + moov.headerSize,
    moov.offset + moov.size,
  ).some((box) => box.type === "mvex");
}

function runLengthEncode(values) {
  const counts = [];
  const encodedValues = [];

  for (const value of values) {
    if (!counts.length || encodedValues[encodedValues.length - 1] !== value) {
      counts.push(1);
      encodedValues.push(value);
    } else {
      counts[counts.length - 1] += 1;
    }
  }

  return {
    counts,
    values: encodedValues,
  };
}

async function ensureMp4BoxModule() {
  if (!mp4BoxModulePromise) {
    mp4BoxModulePromise = import(
      chrome.runtime.getURL("lib/mp4box.all.js")
    ).catch((error) => {
      mp4BoxModulePromise = null;
      throw error;
    });
  }

  return mp4BoxModulePromise;
}

async function rebuildFragmentedMp4ToStandalone(mp4Data) {
  const normalizedInput =
    mp4Data instanceof Uint8Array ? mp4Data : new Uint8Array(mp4Data);
  if (
    !normalizedInput.byteLength ||
    !needsStandaloneMp4Rebuild(normalizedInput)
  ) {
    return normalizedInput;
  }

  const MP4Box = await ensureMp4BoxModule();
  const inputFile = MP4Box.createFile();
  inputFile.discardMdatData = false;

  let parseErrorMessage = "";
  inputFile.onError = (...args) => {
    parseErrorMessage = args
      .filter((value) => typeof value === "string" && value)
      .join(": ");
  };

  const inputBuffer = sliceArrayBufferFromUint8Array(normalizedInput);
  inputBuffer.fileStart = 0;
  inputFile.appendBuffer(inputBuffer);
  inputFile.flush();

  if (parseErrorMessage) {
    throw new Error(parseErrorMessage);
  }

  if (!inputFile?.moov?.traks?.length || !inputFile?.ftyp) {
    throw new Error("MP4 metadata could not be parsed.");
  }

  for (const trak of inputFile.moov.traks) {
    for (
      let sampleIndex = 0;
      sampleIndex < trak.samples.length;
      sampleIndex += 1
    ) {
      const sample = inputFile.getSample(trak, sampleIndex);
      if (!sample?.data) {
        throw new Error(
          `MP4 sample data is incomplete for track ${trak.tkhd.track_id}.`,
        );
      }
    }
  }

  inputFile.boxes = inputFile.boxes.filter(
    (box) => box.type !== "moof" && box.type !== "mdat",
  );
  inputFile.moov.boxes = inputFile.moov.boxes.filter(
    (box) => box && box.type !== "mvex",
  );
  delete inputFile.moov.mvex;

  const trackDataSizes = [];
  const mdatChunks = [];
  let movieDuration = 0;

  for (const trak of inputFile.moov.traks) {
    const stbl = trak?.mdia?.minf?.stbl;
    const stco = stbl?.stco || stbl?.co64;
    const stsc = stbl?.stsc;
    const stsz = stbl?.stsz || stbl?.stz2;
    const stts = stbl?.stts;
    if (!stbl || !stco || !stsc || !stsz || !stts) {
      throw new Error(
        `MP4 sample tables are unavailable for track ${trak?.tkhd?.track_id || "unknown"}.`,
      );
    }

    const samples = trak.samples || [];
    const trackChunkSize = samples.reduce(
      (sum, sample) => sum + sample.size,
      0,
    );
    trackDataSizes.push(trackChunkSize);

    stco.chunk_offsets = samples.length ? [0] : [];
    stsc.first_chunk = samples.length ? [1] : [];
    stsc.samples_per_chunk = samples.length ? [samples.length] : [];
    stsc.sample_description_index = samples.length ? [1] : [];
    stsz.sample_sizes = samples.map((sample) => sample.size);

    const durationRuns = runLengthEncode(
      samples.map((sample) => sample.duration),
    );
    stts.sample_counts = durationRuns.counts;
    stts.sample_deltas = durationRuns.values;

    const compositionOffsets = samples.map((sample) => sample.cts - sample.dts);
    if (compositionOffsets.some((offset) => offset !== 0)) {
      if (!stbl.ctts && MP4Box?.BoxParser?.box?.ctts) {
        const ctts = new MP4Box.BoxParser.box.ctts();
        stbl.ctts = ctts;
        const stssIndex = stbl.boxes.findIndex(
          (box) => box && box.type === "stss",
        );
        const stscIndex = stbl.boxes.findIndex(
          (box) => box && box.type === "stsc",
        );
        const insertIndex =
          stssIndex >= 0
            ? stssIndex + 1
            : stscIndex >= 0
              ? stscIndex
              : stbl.boxes.length;
        stbl.boxes.splice(insertIndex, 0, ctts);
      }

      if (stbl.ctts) {
        const compositionRuns = runLengthEncode(compositionOffsets);
        stbl.ctts.sample_counts = compositionRuns.counts;
        stbl.ctts.sample_offsets = compositionRuns.values;
      }
    } else if (stbl.ctts) {
      stbl.boxes = stbl.boxes.filter((box) => box && box.type !== "ctts");
      delete stbl.ctts;
    }

    const syncSamples = [];
    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
      if (samples[sampleIndex].is_sync) {
        syncSamples.push(sampleIndex + 1);
      }
    }

    if (syncSamples.length > 0 && syncSamples.length !== samples.length) {
      if (!stbl.stss && MP4Box?.BoxParser?.box?.stss) {
        const stss = new MP4Box.BoxParser.box.stss();
        stbl.stss = stss;
        const stscIndex = stbl.boxes.findIndex(
          (box) => box && box.type === "stsc",
        );
        if (stscIndex >= 0) {
          stbl.boxes.splice(stscIndex, 0, stss);
        } else {
          stbl.boxes.push(stss);
        }
      }

      if (stbl.stss) {
        stbl.stss.sample_numbers = syncSamples;
      }
    } else if (stbl.stss) {
      stbl.boxes = stbl.boxes.filter((box) => box && box.type !== "stss");
      delete stbl.stss;
    }

    trak.mdia.mdhd.duration = trak.samples_duration;
    const trackMovieDuration = trak.mdia.mdhd.timescale
      ? Math.round(
          (trak.samples_duration * inputFile.moov.mvhd.timescale) /
            trak.mdia.mdhd.timescale,
        )
      : 0;
    trak.tkhd.duration = trackMovieDuration;
    movieDuration = Math.max(movieDuration, trackMovieDuration);

    for (const sample of samples) {
      mdatChunks.push(
        sample.data instanceof Uint8Array
          ? sample.data
          : new Uint8Array(sample.data),
      );
    }
  }

  inputFile.moov.mvhd.duration = movieDuration;

  const tempStream = new MP4Box.DataStream();
  inputFile.ftyp.write(tempStream);
  inputFile.moov.write(tempStream);

  const mdatDataStart = tempStream.position + 8;
  let runningOffset = 0;

  for (
    let trackIndex = 0;
    trackIndex < inputFile.moov.traks.length;
    trackIndex += 1
  ) {
    const trak = inputFile.moov.traks[trackIndex];
    const stbl = trak.mdia.minf.stbl;
    const stco = stbl.stco || stbl.co64;
    if (!stco) {
      continue;
    }

    stco.chunk_offsets = trackDataSizes[trackIndex]
      ? [mdatDataStart + runningOffset]
      : [];
    runningOffset += trackDataSizes[trackIndex];
  }

  const mdat = new MP4Box.Box();
  mdat.type = "mdat";
  mdat.data = concatUint8Arrays(mdatChunks);
  inputFile.boxes = [inputFile.ftyp, inputFile.moov, mdat];

  const outputStream = new MP4Box.DataStream();
  inputFile.write(outputStream);

  return new Uint8Array(outputStream.buffer.slice(0, outputStream.position));
}

async function normalizeMp4ForCompatibleDownload(mp4Data) {
  const normalizedInput =
    mp4Data instanceof Uint8Array ? mp4Data : new Uint8Array(mp4Data);

  try {
    return await rebuildFragmentedMp4ToStandalone(normalizedInput);
  } catch (error) {
    console.warn(
      "[WebClass UX] Failed to rebuild fragmented MP4 into standalone MP4:",
      error,
    );
    return normalizedInput;
  }
}

function transmuxTsSegmentsToMp4Once(segmentBuffers, options = {}) {
  return new Promise((resolve, reject) => {
    const transmuxer = new globalThis.muxjs.Transmuxer({
      remux: true,
      ...options,
    });
    const outputChunks = [];
    const logs = [];
    let initSegmentWritten = false;
    let settled = false;

    const cleanup = () => {
      if (typeof transmuxer.dispose === "function") {
        transmuxer.dispose();
      }
    };

    const fail = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    transmuxer.on("log", (entry) => {
      if (entry?.message) {
        logs.push(entry.message);
      }
    });

    transmuxer.on("data", (segment) => {
      try {
        if (segment?.initSegment?.byteLength && !initSegmentWritten) {
          outputChunks.push(new Uint8Array(segment.initSegment));
          initSegmentWritten = true;
        }

        if (segment?.data?.byteLength) {
          outputChunks.push(new Uint8Array(segment.data));
        }
      } catch (error) {
        fail(error);
      }
    });

    transmuxer.on("done", () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();

      if (!outputChunks.length) {
        const details = logs.length ? ` (${logs.join(" | ")})` : "";
        reject(new Error(`Failed to transmux TS segments into MP4${details}`));
        return;
      }

      resolve(concatUint8Arrays(outputChunks));
    });

    try {
      for (const segmentBuffer of segmentBuffers) {
        const chunk =
          segmentBuffer instanceof Uint8Array
            ? segmentBuffer
            : new Uint8Array(segmentBuffer);
        transmuxer.push(chunk);
      }

      transmuxer.flush();
    } catch (error) {
      fail(error);
    }
  });
}

async function transmuxTsSegmentsToMp4(segmentBuffers) {
  if (!isMuxJsMp4TransmuxerAvailable()) {
    throw new Error("mux.js MP4 transmuxer is unavailable");
  }

  const normalizedBuffers = segmentBuffers.map((segmentBuffer) =>
    segmentBuffer instanceof Uint8Array
      ? segmentBuffer
      : new Uint8Array(segmentBuffer),
  );
  const attempts = [
    {
      // Feeding TS chunks segment-by-segment preserves packet/timestamp boundaries
      // better than concatenating the entire stream first, which can yield bogus
      // durations or blank output for some WebClass HLS recordings.
      name: "segmented-default",
      buffers: normalizedBuffers,
      options: {},
    },
    {
      name: "segmented-original-ts",
      buffers: normalizedBuffers,
      options: { keepOriginalTimestamps: true },
    },
    {
      name: "combined-default",
      buffers: [concatUint8Arrays(normalizedBuffers)],
      options: {},
    },
    {
      name: "combined-original-ts",
      buffers: [concatUint8Arrays(normalizedBuffers)],
      options: { keepOriginalTimestamps: true },
    },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      return await transmuxTsSegmentsToMp4Once(
        attempt.buffers,
        attempt.options,
      );
    } catch (error) {
      lastError = error;
      console.warn(
        "[WebClass UX] MP4 transmux attempt failed:",
        attempt.name,
        error,
      );
    }
  }

  throw lastError || new Error("Failed to transmux TS segments into MP4");
}

async function downloadHlsVideo(hlsUrl, baseName, onProgress) {
  const { playlistUrl, manifestText } = await resolveHlsMediaPlaylist(hlsUrl);
  const { initSegmentUrl, segmentUrls } = buildHlsSegmentPlan(
    manifestText,
    playlistUrl,
  );
  const total = segmentUrls.length + (initSegmentUrl ? 1 : 0);
  const parts = [];
  let completed = 0;
  let detectedFormat = null;

  if (typeof onProgress === "function") {
    onProgress(completed, total);
  }

  if (initSegmentUrl) {
    const initPart = await fetchArrayBufferWithCredentials(
      initSegmentUrl.url,
      initSegmentUrl.byteRange,
    );
    parts.push(initPart.buffer);
    detectedFormat = detectHlsOutputFormat(
      initSegmentUrl.url,
      initPart.contentType,
      true,
    );
    completed += 1;
    if (typeof onProgress === "function") {
      onProgress(completed, total);
    }
  }

  for (const segmentUrl of segmentUrls) {
    const segment = await fetchArrayBufferWithCredentials(
      segmentUrl.url,
      segmentUrl.byteRange,
    );
    if (!detectedFormat) {
      detectedFormat = detectHlsOutputFormat(
        segmentUrl.url,
        segment.contentType,
        false,
      );
    }
    parts.push(segment.buffer);
    completed += 1;
    if (typeof onProgress === "function") {
      onProgress(completed, total);
    }
  }

  const finalFormat = detectedFormat || {
    extension: ".mp4",
    mimeType: "video/mp4",
  };

  if (finalFormat.extension === ".ts") {
    try {
      const mp4Data = await normalizeMp4ForCompatibleDownload(
        await transmuxTsSegmentsToMp4(parts),
      );
      const fileName = `${baseName}.mp4`;
      await downloadBlobData(
        new Blob([mp4Data], { type: "video/mp4" }),
        fileName,
      );
      return fileName;
    } catch (error) {
      console.warn(
        "[WebClass UX] Falling back to TS download after MP4 transmux failure:",
        error,
      );
      const fileName = `${baseName}.ts`;
      await downloadBlobData(new Blob(parts, { type: "video/mp2t" }), fileName);
      return fileName;
    }
  }

  const fileName = `${baseName}${finalFormat.extension}`;
  if (finalFormat.extension === ".mp4") {
    const mp4Data = await normalizeMp4ForCompatibleDownload(
      concatUint8Arrays(
        parts.map((part) =>
          part instanceof Uint8Array ? part : new Uint8Array(part),
        ),
      ),
    );
    await downloadBlobData(
      new Blob([mp4Data], { type: finalFormat.mimeType }),
      fileName,
    );
    return fileName;
  }

  await downloadBlobData(
    new Blob(parts, { type: finalFormat.mimeType }),
    fileName,
  );
  return fileName;
}
