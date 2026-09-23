// course.js
// Course-page entry point and page-type dispatch.

// Initialization
// ============================================================

function init() {
  if (!isUxExtensionVisualEnabled()) return;
  log("Initializing...");
  scheduleCustomUserIconApply(document);
  bindShiryouDisplayMessageListeners();

  const pageType = detectPageType();
  log("Detected page type:", pageType);

  // Suppress beforeunload on material pages IMMEDIATELY at document_start
  // This must run before any other scripts (especially Vue.js textbook.js)
  if (pageType === "shiryou" || pageType === "shiryou_title") {
    suppressBeforeUnload();
  }

  // For shiryou_title, we need to wait for body to exist
  if (pageType === "shiryou_title") {
    const setupTitleFrame = () => {
      rememberUxOriginalBodyState(document);
      if (isShiryouOriginDisplayActive(getShiryouRootDocument(document))) {
        ensureShiryouOriginHeaderToggle(
          document,
          getShiryouRootDocument(document),
        );
        return;
      }

      // 一時的に背景色を設定して読み込み中のチラつきを防ぐ
      if (document.body) {
        ensureCourseColorTokens(document);
        document.body.style.background = "var(--ux-home-page-bg)";
        document.body.style.margin = "0";
      }
      log("shiryou_title frame: waiting for parent to inject header");
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", setupTitleFrame);
    } else if (document.body) {
      setupTitleFrame();
    }
    return;
  }

  // loadit.phpの「表示に問題があるときは」メッセージフレームを非表示
  if (pageType === "loadit_message") {
    if (isShiryouOriginDisplayActive(getShiryouRootDocument(document))) {
      return;
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", hideLoaditMessageFrame);
    } else {
      hideLoaditMessageFrame();
    }
    return;
  }

  // 資料タイプのページはUI改善を適用
  if (pageType === "shiryou") {
    const runShiryouEnhancements = () => {
      enhanceShiryouPageUI();
      if (!isShiryouOriginDisplayActive(getShiryouRootDocument(document))) {
        setTimeout(observeFrames, 500);
      }
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", runShiryouEnhancements);
    } else {
      runShiryouEnhancements();
    }
    return;
  }

  if (pageType === "shiken") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        enhanceShikenPageUI();
        setTimeout(observeFrames, 500);
      });
    } else {
      enhanceShikenPageUI();
      setTimeout(observeFrames, 500);
    }
    return;
  }

  if (pageType === "course_list") {
    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        enhanceCourseContentsPageUI,
      );
    } else {
      enhanceCourseContentsPageUI();
    }
  }

  // ページ読み込み完了後に実行
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
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
        const parentContentName = window.parent.document.querySelector(
          'input[name="contents_name"]',
        );
        if (parentContentName) {
          window.uxContentName = parentContentName.value;
          log("Got content name from parent:", window.uxContentName);
        }
      } catch (e) {
        // クロスオリジンの場合はスキップ
      }
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", getParentInfo);
  } else {
    getParentInfo();
  }
}

// 実行
chrome.storage.local.get(
  {
    [STORAGE_KEY_EXTENSION_VISUAL_ENABLED]: true,
    [MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_KEY]:
      MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_DEFAULT,
    [CUSTOM_USER_ICON_KEY]: "",
  },
  (items) => {
    setUxExtensionVisualEnabled(
      items[STORAGE_KEY_EXTENSION_VISUAL_ENABLED] !== false,
    );
    materialDownloadFilenameSeparator =
      normalizeMaterialDownloadFilenameSeparator(
        items[MATERIAL_DOWNLOAD_FILENAME_SEPARATOR_KEY],
      );
    setCustomUserIconDataUrl(items[CUSTOM_USER_ICON_KEY]);
    if (!isUxExtensionVisualEnabled()) {
      log("Global visual modification is disabled. Skipping course.js init.");
      return;
    }
    init();
  },
);
