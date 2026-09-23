// course/shiryou-chapter.js
// Material chapter-frame navigation guard and chapter styling.

function enhanceShiryouChapterFrame() {
  log("Enhancing shiryou chapter frame");
  ensureUxFrameActionButtonFit(document);

  // NOTE: beforeunload blocking is now handled by beforeunload-blocker.js
  // which runs in MAIN world via manifest.json

  // 少し遅延して実行（DOMの読み込みを待つ）
  setTimeout(() => {
    // フレーム全体の内容を非表示（目次オーバーレイ使用時に元のTOCが見えないように）
    // visibility: hiddenを使用することでDOMはアクセス可能（gopage関数など）
    document.body.style.visibility = "hidden";
    document.body.style.background = "var(--ux-color-page)";

    // 1. 青いヘッダー（bgc_sub）を非表示
    const bgcSub = document.querySelector("#WsTitle.bgc_sub, .bgc_sub");
    if (bgcSub) {
      bgcSub.style.display = "none";
      log("Hidden bgc_sub header");
    }

    // 2. ユーザー情報を非表示
    const userDiv = document.querySelector("#User");
    if (userDiv) {
      userDiv.style.display = "none";
    }

    // 3. hrを非表示
    const hrs = document.querySelectorAll("hr");
    hrs.forEach((hr) => {
      hr.style.display = "none";
    });

    // 4. 前のページ/次のページボタンを非表示
    const prevButton = document.querySelector(
      '#PrevButton, button[onclick*="prevPage"]',
    );
    const nextButton = document.querySelector(
      '#NextButton, button[onclick*="nextPage"]',
    );
    if (prevButton) {
      prevButton
        .closest("tr")
        ?.style.setProperty("display", "none", "important");
      log("Hidden prev button");
    }

    // ナビレイアウト全体を非表示（ボタンはヘッダーに移動）
    const naviLayout = document.querySelector("#naviLayout");
    if (naviLayout) {
      naviLayout.style.display = "none";
      log("Hidden naviLayout");
    }

    // 5. 「目次を隠す」の横の「資料を閉じる」ボタンを非表示
    const quitButtons = document.querySelectorAll(
      'input[name="quit"], input[value="資料を閉じる"]',
    );
    quitButtons.forEach((btn) => {
      btn.style.display = "none";
      log("Hidden quit button in chapter frame");
    });

    // 6. 「添付資料」リンクのテキストと画像のみ非表示（ダウンロードボタンは残す）
    const attachLinks = document.querySelectorAll('a[href*="file_down.php"]');
    attachLinks.forEach((link) => {
      // リンク自体を非表示（ダウンロードボタンは別要素なので残る）
      link.style.display = "none";
      log("Hidden attachment link text");
    });

    // 7. ヘッダーフレームのTOC更新をトリガー
    // ページ移動などでこのフレームがリロードされたとき、TOCの中身が変わっているので
    // ヘッダー側（titleフレーム）に通知してTOCオーバーレイを更新させる
    try {
      const titleFrame = window.top.frames["webclass_title"];
      if (titleFrame && titleFrame.document) {
        // カスタムイベントを発火
        const event = new CustomEvent("ux-toc-needs-update");
        titleFrame.document.dispatchEvent(event);
        log("Dispatched ux-toc-needs-update event");
      }
    } catch (e) {
      log("Could not dispatch event to title frame:", e);
    }

    // 8. 全体のスタイルを改善
    applyModernChapterStyles();

    // 9. 目次クリック時のPDF白フラッシュ抑制（左目次フレーム側）
    // フレームセットの表示構成や設定によっては左側の目次が使われる場合があるため、
    // clickpage ボタンのクリックを捕捉してコンテンツ側ロード完了までオーバーレイを表示する。
    try {
      setupShiryouContentFlashGuardFromChapterFrame();
    } catch (e) {
      log("Could not setup flash guard in chapter frame:", e?.message || e);
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
      indicatorTimer: null,
    };
  }
  const uxState = topDoc.__uxOverlayState;

  function getOrCreateUxContentLoadingOverlay() {
    const overlayId = "ux-content-loading-overlay";
    let overlay = topDoc.getElementById(overlayId);
    if (overlay) return overlay;

    overlay = topDoc.createElement("div");
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
            background-color: var(--ux-color-page);
            transition: opacity 120ms ease-out;
            will-change: opacity;
        `;

    const style = topDoc.createElement("style");
    style.textContent = `
            @keyframes uxspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `;

    const inner = topDoc.createElement("div");
    inner.id = "ux-loading-indicator";
    inner.style.cssText = `
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            font-family: 'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif;
            color: var(--ux-color-text);
            font-size: 14px;
            opacity: 0;
            transition: opacity 120ms ease;
        `;
    inner.innerHTML = `
            <div style="width:18px;height:18px;border:2px solid var(--ux-color-info-surface);border-top-color:var(--ux-color-accent);border-radius:50%;animation:uxspin 0.8s linear infinite;"></div>
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

    const wasHidden =
      overlay.style.visibility !== "visible" || overlay.style.opacity === "0";
    // 即座に表示（トランジションなしで不透明に）
    overlay.style.transition = "none";
    overlay.style.visibility = "visible";
    overlay.style.opacity = "1";
    // 次フレームでトランジションを復活（非表示時のフェードアウト用）
    requestAnimationFrame(() => {
      overlay.style.transition = "opacity 120ms ease-out";
    });
    if (wasHidden) {
      uxState.shownAt =
        typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now();
    }

    const indicator = overlay.querySelector("#ux-loading-indicator");
    if (indicator) {
      indicator.style.opacity = "0";
      if (uxState.indicatorTimer) clearTimeout(uxState.indicatorTimer);
      uxState.indicatorTimer = setTimeout(() => {
        if (seq === uxState.navSeq) {
          indicator.style.opacity = "1";
        }
      }, 220);
    }
  }

  function hideUxContentLoadingOverlay(seq) {
    const overlay = topDoc.getElementById("ux-content-loading-overlay");
    if (!overlay) return;
    if (seq !== uxState.navSeq) return;

    if (uxState.indicatorTimer) {
      clearTimeout(uxState.indicatorTimer);
      uxState.indicatorTimer = null;
    }
    const indicator = overlay.querySelector("#ux-loading-indicator");
    if (indicator) indicator.style.opacity = "0";

    const now =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
    const elapsed = uxState.shownAt ? now - uxState.shownAt : 9999;
    const minVisibleMs = 150;
    const delay = Math.max(0, minVisibleMs - elapsed);

    if (uxState.hideTimer) clearTimeout(uxState.hideTimer);
    uxState.hideTimer = setTimeout(() => {
      if (seq !== uxState.navSeq) return;
      overlay.style.opacity = "0";
      setTimeout(() => {
        if (seq === uxState.navSeq && overlay.style.opacity === "0") {
          overlay.style.visibility = "hidden";
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
          const contentWin = window.top.frames?.["webclass_content"];
          if (!contentWin) return resolve();

          let looksLikePdf = expectsPdf;
          try {
            const href = contentWin.location?.href || "";
            if (
              href.includes("loadit.php") ||
              /\.pdf(\b|$|[&#?])/i.test(href)
            ) {
              looksLikePdf = true;
            }
          } catch (_) {}

          const docCandidates = [];
          try {
            docCandidates.push(contentWin.document);
          } catch (_) {}

          try {
            const nested =
              contentWin.document?.querySelectorAll?.("iframe, frame") || [];
            nested.forEach((el) => {
              try {
                const d = el.contentDocument || el.contentWindow?.document;
                if (d) docCandidates.push(d);
              } catch (_) {}
            });
          } catch (_) {}

          let foundViewer = false;
          for (const d of docCandidates) {
            if (!d) continue;
            const viewerContainer =
              d.getElementById("viewerContainer") || d.getElementById("viewer");
            if (!viewerContainer) continue;

            foundViewer = true;
            const canvases = viewerContainer.querySelectorAll("canvas");
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
    const frameEl = topDoc.querySelector(
      'frame[name="webclass_content"], iframe[name="webclass_content"]',
    );
    if (!frameEl) {
      setTimeout(() => {
        if (seq === uxState.navSeq) hideUxContentLoadingOverlay(seq);
      }, 800);
      return;
    }

    const onLoad = () => {
      if (seq !== uxState.navSeq) return;
      waitForUxPdfViewerRender(seq, expectsPdf).finally(() => {
        if (seq === uxState.navSeq) hideUxContentLoadingOverlay(seq);
      });
    };

    try {
      frameEl.addEventListener("load", onLoad, { once: true });
    } catch (e) {
      frameEl.onload = onLoad;
    }

    setTimeout(() => {
      if (seq === uxState.navSeq) hideUxContentLoadingOverlay(seq);
    }, 12000);
  }

  // inline onclick より先に走らせる（capture）ことで、遷移開始前にオーバーレイを出す
  document.addEventListener(
    "click",
    (e) => {
      const t = e.target;
      if (!t || t.nodeType !== 1) return;

      // 目次のページボタン
      if (t.tagName === "INPUT" && t.getAttribute("name") === "clickpage") {
        // クリック対象のページ番号を推定（onclickがある場合はそれを優先）
        const onclickAttr = t.getAttribute("onclick") || "";
        const m = onclickAttr.match(/gopage\(['"]?(\d+)['"]?\)/);
        const pageNum = m ? m[1] : (t.value || "").trim();

        let expectsPdf = true;
        try {
          const jsonData = document.querySelector("#json-data");
          if (jsonData) {
            const config = JSON.parse(jsonData.textContent);
            const targetUrl = config?.text_urls?.[pageNum];
            if (typeof targetUrl === "string" && targetUrl.length > 0) {
              expectsPdf =
                /\.pdf(\b|$|[&#?])/i.test(targetUrl) ||
                /file=[^&]*\.pdf/i.test(targetUrl);
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
    },
    true,
  );
}

/**
 * 目次フレームにモダンなスタイルを適用
 */
function applyModernChapterStyles() {
  ensureUxFrameActionButtonFit(document);
  if (document.getElementById("ux-shiryou-chapter-style")) return;

  const style = markUxCourseStyle(document.createElement("style"));
  style.id = "ux-shiryou-chapter-style";
  style.textContent = `
        body {
            background: var(--ux-color-page) !important;
            color: var(--ux-color-text) !important;
            font-family: var(--ux-font-family) !important;
            padding: 10px !important;
        }

        #top {
            background: var(--ux-color-page) !important;
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
            background: var(--ux-color-accent) !important;
            color: var(--ux-color-on-accent) !important;
            border: 1px solid var(--ux-color-accent) !important;
            border-radius: var(--ux-radius-sm) !important;
            padding: 8px 14px !important;
            font-size: 0.8rem !important;
            font-weight: 500 !important;
            cursor: pointer !important;
            transition: background-color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard), border-color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard), color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard), transform var(--ux-motion-duration-fast) var(--ux-motion-ease-standard) !important;
        }

        #naviLayout input[type="button"]:hover,
        #naviLayout button:hover {
            background: var(--ux-color-accent-hover) !important;
            border-color: var(--ux-color-accent-hover) !important;
        }

        #naviLayout input[type="button"]:disabled,
        #naviLayout button:disabled {
            background: var(--ux-color-surface-muted) !important;
            color: var(--ux-color-muted) !important;
            border-color: var(--ux-color-border) !important;
            cursor: not-allowed !important;
            transform: none !important;
        }

        /* 目次テーブルのスタイル改善 */
        #TOC {
            background: var(--ux-color-surface) !important;
            border: 1px solid var(--ux-color-border) !important;
            border-radius: var(--ux-radius-md) !important;
            padding: 10px !important;
            margin-top: 5px !important;
        }

        #TOCLayout {
            width: 100% !important;
        }

        #TOCLayout tr {
            transition: background-color 0.15s ease !important;
        }

        #TOCLayout tr:hover {
            background-color: var(--ux-color-surface-subtle) !important;
        }

        #TOCLayout td {
            padding: 8px 6px !important;
            vertical-align: middle !important;
        }

        #TOCLayout input[type="button"] {
            background: var(--ux-color-surface-subtle) !important;
            color: var(--ux-color-accent-active) !important;
            min-width: 32px !important;
            padding: 6px 10px !important;
        }

        #TOCLayout input[type="button"]:hover {
            background: var(--ux-color-surface-subtle) !important;
            border-color: var(--ux-color-border-hover, #B1BEC6) !important;
            color: var(--ux-color-text) !important;
        }

        .ux-section-number-badge {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            min-width: 1.65rem !important;
            height: 1.45rem !important;
            padding: 0 0.45rem !important;
            border-radius: var(--ux-radius-pill) !important;
            background: var(--ux-color-surface-subtle) !important;
            border: 1px solid var(--ux-color-border) !important;
            color: var(--ux-color-accent-active) !important;
            font-size: 0.78rem !important;
            font-weight: 700 !important;
            line-height: 1 !important;
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
  compactUxSectionLabels(document);
  log("Applied modern chapter styles");
}

/**
 * フレーム全体を非表示にする
 */
