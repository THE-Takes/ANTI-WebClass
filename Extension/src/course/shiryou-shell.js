// course/shiryou-shell.js
// Material beforeunload handling, floating controls, and frameset setup.

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
    targetWindow.addEventListener(
      "beforeunload",
      (e) => {
        // Stop other listeners without triggering the dialog.
        e.stopImmediatePropagation();
        e.stopPropagation();
        try {
          delete e.returnValue;
        } catch (ex) {}
      },
      true,
    );

    // window.onbeforeunloadをnullで上書き
    targetWindow.onbeforeunload = null;

    // Object.definePropertyで上書きを防止
    try {
      Object.defineProperty(targetWindow, "onbeforeunload", {
        get: () => null,
        set: (val) => {
          log("Blocked onbeforeunload assignment:", typeof val);
        },
        configurable: true,
      });
    } catch (e) {
      // 一部の環境ではdefinePropertyが失敗する
    }

    // addEventListenerを上書きしてbeforeunloadリスナーの追加をブロック
    if (!targetWindow.__uxAddEventListenerPatched) {
      targetWindow.__uxAddEventListenerPatched = true;
      const originalAddEventListener =
        targetWindow.addEventListener.bind(targetWindow);
      targetWindow.addEventListener = function (type, listener, options) {
        if (type === "beforeunload") {
          log("Blocked beforeunload listener registration");
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
          const descriptor = Object.getOwnPropertyDescriptor(
            targetWindow,
            "onbeforeunload",
          );
          if (!descriptor || descriptor.configurable) {
            // definePropertyが効いていない場合は直接クリア
            try {
              delete targetWindow.onbeforeunload;
            } catch (ex) {}
            targetWindow.onbeforeunload = null;
          }
        } catch (ex) {}

        clearCount++;
        if (clearCount >= maxClears) {
          clearInterval(clearerId);
        }
      }, 500);
    }

    log("Disabled beforeunload warning for window");
  } catch (e) {
    log("Error disabling beforeunload for window:", e?.message || e);
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
    const frameNames = [
      "webclass_title",
      "webclass_chapter",
      "webclass_content",
    ];
    frameNames.forEach((frameName) => {
      try {
        const frame = window.frames[frameName];
        if (frame) {
          // framesオブジェクトから直接アクセス（contentWindowを使わない）
          disableBeforeUnloadWarningForWindow(frame);
          log("Disabled beforeunload warning for frame:", frameName);
        }
      } catch (frameErr) {
        log(
          "Could not disable beforeunload for frame:",
          frameName,
          frameErr?.message || frameErr,
        );
      }
    });

    // 全てのframe/iframe要素にも適用
    try {
      const allFrameElements = document.querySelectorAll("frame, iframe");
      allFrameElements.forEach((el, idx) => {
        try {
          if (el.contentWindow) {
            disableBeforeUnloadWarningForWindow(el.contentWindow);
            log("Disabled beforeunload for frame element", idx);
          }
        } catch (e) {
          // クロスオリジンなど
        }
      });
    } catch (e) {
      // querySelectorAll失敗
    }
  } catch (e) {
    log("Error disabling beforeunload warnings:", e?.message || e);
  }
}

/**
 * リボン（ヘッダー）の表示切り替え
 * @param {boolean} show - 表示するかどうか
 */
function toggleRibbon(show) {
  const frameset = window.top.document.querySelector("frameset");
  if (!frameset) return;
  rememberUxOriginalAttributes(frameset);

  const topDoc = window.top.document;
  const tocOverlay = topDoc.getElementById("ux-toc-overlay-iframe");
  const tocResizeHandle = topDoc.getElementById("ux-toc-resize-handle");
  const loadingOverlay = topDoc.getElementById("ux-content-loading-overlay");
  const hoverZone = topDoc.getElementById("ux-toc-hover-zone");

  if (show) {
    // 表示 (55px)
    const rows = frameset.getAttribute("rows");
    if (rows) {
      frameset.setAttribute("rows", rows.replace(/^\d+/, "55"));
    }

    // 展開ボタンを削除
    removeFloatingExpandButton();

    // TOCオーバーレイの位置を調整（リボン分下に）
    if (tocOverlay) {
      tocOverlay.style.top = "55px";
      tocOverlay.style.height = "calc(100vh - 55px)";
    }
    if (tocResizeHandle) {
      tocResizeHandle.style.top = "55px";
      tocResizeHandle.style.height = "calc(100vh - 55px)";
    }
    if (loadingOverlay) {
      loadingOverlay.style.top = "55px";
    }
    if (hoverZone) {
      hoverZone.style.top = "55px";
      hoverZone.style.height = "calc(100vh - 55px)";
    }
    syncFullscreenVideoContentFrameLayout(true);
  } else {
    // 非表示 (0px)
    const rows = frameset.getAttribute("rows");
    if (rows) {
      frameset.setAttribute("rows", rows.replace(/^\d+/, "0"));
    }

    // 展開ボタンを表示
    createFloatingExpandButton();

    // TOCオーバーレイの位置を調整（最上部から）
    if (tocOverlay) {
      tocOverlay.style.top = "0";
      tocOverlay.style.height = "100vh";
    }
    if (tocResizeHandle) {
      tocResizeHandle.style.top = "0";
      tocResizeHandle.style.height = "100vh";
    }
    if (loadingOverlay) {
      loadingOverlay.style.top = "0";
    }
    if (hoverZone) {
      hoverZone.style.top = "0";
      hoverZone.style.height = "100vh";
    }
    syncFullscreenVideoContentFrameLayout(false);
  }
}

/**
 * フロート展開ボタンを作成・表示
 */
function createFloatingExpandButton() {
  const topDoc = window.top.document;
  if (topDoc.getElementById("ux-ribbon-expand-btn")) return;

  const btn = topDoc.createElement("button");
  btn.type = "button";
  btn.id = "ux-ribbon-expand-btn";
  btn.setAttribute("aria-label", "リボンを表示");
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
        background: var(--ux-color-accent);
        color: var(--ux-color-on-accent);
        border-radius: var(--ux-radius-pill);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 10000;
        transition: background-color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard), transform var(--ux-motion-duration-fast) var(--ux-motion-ease-standard);
        border: 1px solid var(--ux-color-accent-active);
        user-select: none;
        touch-action: none;
    `;
  btn.title = "リボンを表示";

  // ホバー効果
  btn.onmouseover = () => {
    btn.style.background = "var(--ux-color-accent-hover)";
    btn.style.transform = "scale(1.02)";
  };
  btn.onmouseout = () => {
    btn.style.background = "var(--ux-color-accent)";
    btn.style.transform = "scale(1)";
  };

  // クリックでリボン表示
  btn.onclick = (e) => {
    if (btn.hasAttribute("data-dragged")) {
      btn.removeAttribute("data-dragged");
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

    btn.style.bottom = "auto";
    btn.style.right = "auto";
    btn.style.left = initialLeft + "px";
    btn.style.top = initialTop + "px";
    btn.style.cursor = "grabbing";

    // イベントリスナーをdocumentに追加（フレーム外れ防止のためtopDocに）
    topDoc.addEventListener("mousemove", onMouseMove);
    topDoc.addEventListener("mouseup", onMouseUp);
    topDoc.addEventListener("touchmove", onMouseMove, { passive: false });
    topDoc.addEventListener("touchend", onMouseUp);
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
      btn.setAttribute("data-dragged", "true");
    }

    btn.style.left = initialLeft + deltaX + "px";
    btn.style.top = initialTop + deltaY + "px";
  };

  const onMouseUp = () => {
    isDragging = false;
    btn.style.cursor = "pointer";
    topDoc.removeEventListener("mousemove", onMouseMove);
    topDoc.removeEventListener("mouseup", onMouseUp);
    topDoc.removeEventListener("touchmove", onMouseMove);
    topDoc.removeEventListener("touchend", onMouseUp);

    // 画面外にはみ出さないように補正
    const rect = btn.getBoundingClientRect();
    const winWidth = window.top.innerWidth;
    const winHeight = window.top.innerHeight;

    let newLeft = rect.left;
    let newTop = rect.top;

    if (newLeft < 10) newLeft = 10;
    if (newLeft + rect.width > winWidth - 10)
      newLeft = winWidth - 10 - rect.width;
    if (newTop < 10) newTop = 10;
    if (newTop + rect.height > winHeight - 10)
      newTop = winHeight - 10 - rect.height;

    btn.style.left = newLeft + "px";
    btn.style.top = newTop + "px";
  };

  btn.addEventListener("mousedown", onMouseDown);
  btn.addEventListener("touchstart", onMouseDown, { passive: false });

  topDoc.documentElement.appendChild(btn);
}

/**
 * フロート展開ボタンを削除
 */
function removeFloatingExpandButton() {
  const topDoc = window.top.document;
  const btn = topDoc.getElementById("ux-ribbon-expand-btn");
  if (btn) {
    btn.remove();
  }
}

/**
 * フレームセット親のUI改善
 * トップリボンを削除し、新しいヘッダーを挿入
 */
function enhanceShiryouFrameset() {
  log("Enhancing shiryou frameset");
  rememberUxOriginalFrameStructure(document);

  // beforeunload警告を無効化（ページを閉じる・リロード時の警告を防止）
  disableBeforeUnloadWarning();
  // 各フレームが読み込まれた際にも警告を無効化
  window.addEventListener("load", () => {
    disableBeforeUnloadWarningInAllFrames();
  });

  // 親フレームから子フレーム（webclass_chapter）のonbeforeunloadを直接クリアする
  // ブラウザテストで手動クリアが成功したため、この方法を使用
  let clearCount = 0;
  const maxClears = 60; // 30秒間
  const chapterClearer = setInterval(() => {
    try {
      const chapterFrame = window.frames["webclass_chapter"];
      if (chapterFrame) {
        // chapterフレームのonbeforeunloadを直接クリア
        if (chapterFrame.onbeforeunload !== null) {
          log("Clearing webclass_chapter.onbeforeunload from parent frame");
          chapterFrame.onbeforeunload = null;
        }
      }
    } catch (e) {
      // クロスオリジンなど
    }

    clearCount++;
    if (clearCount >= maxClears) {
      clearInterval(chapterClearer);
      log("Stopped chapter frame beforeunload clearer after 30s");
    }
  }, 500);

  // 設定を読み込んでから実行
  chrome.storage.local.get(
    {
      tocInitialState: "open",
      tocInitialCloseDelay: "5",
      tocAutoHide: false,
      tocAutoHideDelay: "10",
      tocShowSectionTitles: true,
      tocHoverReveal: true,
      [UX_SHIRYOU_TOC_WIDTH_STORAGE_KEY]: UX_SHIRYOU_TOC_DEFAULT_WIDTH,
    },
    (options) => {
      // フレームセットの rows を変更 (上部フレームを55pxに変更してヘッダーとして使用)
      const framesets = document.querySelectorAll("frameset");

      framesets.forEach((fs) => {
        rememberUxOriginalAttributes(fs);
        rememberShiryouOriginalColsFallback(fs);
        const rows = fs.getAttribute("rows");
        if (rows) {
          // 55,* または他の行設定を 55,* に変更（ヘッダー用にサイズ調整）
          const newRows = rows.replace(/^\d+/, "55");
          fs.setAttribute("rows", newRows);
          log(
            "Adjusted title frame size for custom header:",
            rows,
            "->",
            newRows,
          );
        }

        // 内部のフレームセット（cols属性）をPDF全幅表示用に変更
        const cols = fs.getAttribute("cols");
        if (cols) {
          // 目次を非表示にしてPDFを全幅に（目次はiframeオーバーレイで表示）
          fs.setAttribute("cols", "0,*");
          log("Set PDF to full width, TOC will be shown as iframe overlay");
        }
      });

      // title_simple フレームを新しいヘッダーに変換
      // フレームの読み込みを待つために複数回試行
      let attempts = 0;
      const maxAttempts = 30;
      let injected = false;
      let retryTimer = null;

      const titleFrameElement = document.querySelector(
        'frame[name="webclass_title"], iframe[name="webclass_title"]',
      );
      const chapterFrameElement = document.querySelector(
        'frame[name="webclass_chapter"], iframe[name="webclass_chapter"]',
      );

      function isLoadedWebClassFrame(frameWindow) {
        if (!frameWindow || !frameWindow.document) return false;

        const frameDocument = frameWindow.document;
        const frameUrl = frameWindow.location?.href || "";
        return (
          frameUrl !== "" &&
          frameUrl !== "about:blank" &&
          frameDocument.readyState === "complete" &&
          !!frameDocument.body
        );
      }

      function scheduleHeaderRetry() {
        if (injected || retryTimer || attempts >= maxAttempts) return;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          tryInjectHeader();
        }, 150);
      }

      function tryInjectHeader() {
        if (injected) return;
        attempts++;
        log("Attempting to inject header, attempt:", attempts);

        try {
          const titleFrame = window.frames["webclass_title"];
          const chapterFrame = window.frames["webclass_chapter"];
          const titleReady = isLoadedWebClassFrame(titleFrame);
          const chapterReady = isLoadedWebClassFrame(chapterFrame);

          // about:blank へ注入すると、その直後の本来のフレーム読込で
          // カスタムヘッダーが上書きされる。両フレームの実URL読込を待つ。
          if (titleReady && (chapterReady || attempts >= maxAttempts)) {
            // 資料名を取得
            let contentName = "資料";
            let tocHtml = "";
            try {
              if (chapterReady && chapterFrame.document) {
                const h2 = chapterFrame.document.querySelector("#WsTitle h2");
                if (h2) {
                  contentName = h2.textContent.trim();
                }
                const input = chapterFrame.document.querySelector(
                  'input[name="contents_name"]',
                );
                if (input && input.value) {
                  contentName = input.value;
                }
                // 目次の内容を取得
                const tocElement = chapterFrame.document.querySelector("#TOC");
                if (tocElement) {
                  tocHtml = tocElement.innerHTML;
                }
              }
            } catch (e) {
              log("Could not get content name from chapter frame");
            }

            // 現在のURLからset_contents_idを取得
            const urlParams = new URLSearchParams(window.location.search);
            const contentsId = urlParams.get("set_contents_id") || "";

            // title_simple フレームの内容を置換（目次オーバーレイ付き）
            injected = true;
            createModernHeaderInFrame(
              titleFrame.document,
              contentName,
              contentsId,
              tocHtml,
              options,
            );
            log("Successfully injected modern header with TOC overlay");
            return;
          }
        } catch (e) {
          injected = false;
          log("Could not access title frame:", e.message);
        }

        // まだ成功していない場合は再試行
        if (attempts >= maxAttempts) {
          log("Failed to inject header after", maxAttempts, "attempts");
          return;
        }
        scheduleHeaderRetry();
      }

      // loadイベントを取りこぼさないよう先に監視し、実URLの読込完了後に注入する。
      titleFrameElement?.addEventListener("load", tryInjectHeader);
      chapterFrameElement?.addEventListener("load", tryInjectHeader);
      tryInjectHeader();
    },
  );
}

/**
 * フレーム内にモダンなヘッダーを作成（目次オーバーレイ付き）
 */
