// course/shiryou-navigation.js
// Material header and table-of-contents navigation UI.

function createModernHeaderInFrame(
  doc,
  contentName,
  contentsId,
  tocHtml = "",
  options = {},
) {
  // 設定値
  const tocInitialState = options.tocInitialState || "open";
  const tocInitialCloseDelay = parseInt(
    options.tocInitialCloseDelay || "5",
    10,
  );
  const tocAutoHide = options.tocAutoHide || false;
  const tocAutoHideDelay = parseInt(options.tocAutoHideDelay || "10", 10);
  const tocShowSectionTitles =
    options.tocShowSectionTitles !== undefined
      ? options.tocShowSectionTitles
      : true;
  const topDoc = window.top.document;
  const getTocViewportWidth = () => {
    const docEl = topDoc.documentElement;
    return (
      docEl?.clientWidth ||
      topDoc.defaultView?.innerWidth ||
      window.top?.innerWidth ||
      UX_SHIRYOU_TOC_DEFAULT_WIDTH
    );
  };
  const clampTocWidth = (value) => {
    const viewportWidth = getTocViewportWidth();
    const raw = Number.parseInt(value, 10);
    const fallback = UX_SHIRYOU_TOC_DEFAULT_WIDTH;
    const desired = Number.isFinite(raw) ? raw : fallback;
    const viewportMax = Math.max(
      UX_SHIRYOU_TOC_MIN_WIDTH,
      Math.min(
        UX_SHIRYOU_TOC_MAX_WIDTH,
        Math.floor(viewportWidth * 0.9),
        viewportWidth - 280,
      ),
    );
    return Math.max(
      UX_SHIRYOU_TOC_MIN_WIDTH,
      Math.min(desired, viewportMax),
    );
  };
  let tocWidthPx = clampTocWidth(
    options[UX_SHIRYOU_TOC_WIDTH_STORAGE_KEY] || UX_SHIRYOU_TOC_DEFAULT_WIDTH,
  );

  // フレームの内容を完全に置換
  rememberUxOriginalBodyState(doc);
  doc.body.innerHTML = "";
  doc.body.style.cssText =
    "margin: 0; padding: 0; overflow: hidden; background: var(--ux-color-page);";

  // 目次オーバーレイ用のiframeを作成（フレームセットの制約を回避）
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
            font-family: var(--ux-font-family);
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
    // 非PDFページは点滅の原因になりやすいので基本出さない（判定不能なら expectsPdf=true）
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

    // 速い遷移だとインジケータが点滅して見えるので、一定時間経ってまだロード中のときだけ出す
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

    // すぐ消すと点滅に見えるので最小表示時間を確保
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

  function attachUxContentFrameLoadHandler(seq, expectsPdf = true) {
    const frameEl = topDoc.querySelector(
      'frame[name="webclass_content"], iframe[name="webclass_content"]',
    );
    if (!frameEl) {
      // 見つからない場合でも、オーバーレイが残りっぱなしにならないようにする
      setTimeout(() => {
        if (seq === uxState.navSeq) hideUxContentLoadingOverlay(seq);
      }, 800);
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
      frameEl.addEventListener("load", onLoad, { once: true });
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
          const contentWin = window.top.frames["webclass_content"];
          if (!contentWin) return resolve();

          // 非PDFページなら待ちを短くしてすぐ復帰（点滅抑制）
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

          // contentWin配下のiframe/frameも覗く（txtbk_show_text が frameset の場合がある）
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
            // pdf.js は canvas が実際に描画されてから解除（空canvasの段階だと白/点滅が出やすい）
            const canvases = viewerContainer.querySelectorAll("canvas");
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

  const header = doc.createElement("div");
  header.id = "ux-shiryou-header";
  header.style.cssText = `
        height: 55px;
        background: var(--ux-color-surface);
        color: var(--ux-color-text);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 20px;
        border-bottom: 1px solid var(--ux-color-border);
        font-family: var(--ux-font-family);
        box-sizing: border-box;
    `;

  // 左側: 閉じるボタン + 目次トグルボタン
  const leftDiv = doc.createElement("div");
  leftDiv.style.cssText = "display: flex; align-items: center; gap: 10px;";

  const closeBtn = doc.createElement("button");
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
        border: 1px solid var(--ux-color-border);
        border-radius: var(--ux-radius-sm);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        background: var(--ux-color-surface-subtle);
        color: var(--ux-color-accent-active);
        transition: background-color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard), border-color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard), color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard);
    `;
  closeBtn.onmouseover = () => {
    closeBtn.style.background = "var(--ux-color-surface-subtle)";
    closeBtn.style.borderColor = "var(--ux-color-border-hover)";
    closeBtn.style.color = "var(--ux-color-accent-active)";
  };
  closeBtn.onmouseout = () => {
    closeBtn.style.background = "var(--ux-color-surface-subtle)";
    closeBtn.style.borderColor = "var(--ux-color-border)";
    closeBtn.style.color = "var(--ux-color-accent-active)";
  };
  closeBtn.onclick = () => {
    // Prefer WebClass's quit flow to avoid beforeunload warnings.
    try {
      if (window.top && typeof window.top.quitContents === "function") {
        window.top.quitContents();
        return;
      }
    } catch (e) {
      // Ignore and fall back.
    }

    try {
      const chapterFrame =
        window.top.frames && window.top.frames["webclass_chapter"];
      if (chapterFrame) {
        if (typeof chapterFrame.quit === "function") {
          chapterFrame.quit();
          return;
        }
        if (
          chapterFrame.document &&
          chapterFrame.document.app &&
          typeof chapterFrame.document.app.quit === "function"
        ) {
          chapterFrame.document.app.quit();
          return;
        }
        const menu = chapterFrame.document && chapterFrame.document.menu;
        if (menu && menu.sendCmd) {
          menu.sendCmd.value = "quit";
          menu.submit();
          return;
        }
        const quitBtn =
          chapterFrame.document &&
          chapterFrame.document.querySelector(
            'input[name="quit"], input[value="資料を閉じる"]',
          );
        if (quitBtn) {
          quitBtn.click();
          return;
        }
      }
    } catch (e) {
      // Ignore and fall back.
    }

    if (contentsId) {
      window.top.location.href =
        "do_contents.php?set_contents_id=" + contentsId;
    } else {
      window.top.history.back();
    }
  };
  leftDiv.appendChild(closeBtn);

  // 目次オーバーレイ用のiframeを作成
  // 既存のオーバーレイを削除
  const existingOverlay = topDoc.getElementById("ux-toc-overlay-iframe");
  if (existingOverlay) {
    existingOverlay.__uxThemeObserver?.disconnect();
    existingOverlay.remove();
  }
  const existingResizeHandle = topDoc.getElementById("ux-toc-resize-handle");
  if (existingResizeHandle) {
    existingResizeHandle.remove();
  }
  const existingResizeShield = topDoc.getElementById("ux-toc-resize-shield");
  if (existingResizeShield) {
    existingResizeShield.remove();
  }

  const tocOverlayIframe = topDoc.createElement("iframe");
  tocOverlayIframe.id = "ux-toc-overlay-iframe";
  tocOverlayIframe.style.cssText = `
        position: fixed;
        top: 55px;
        left: 0;
        width: ${tocWidthPx}px;
        height: calc(100vh - 55px);
        border: none;
        z-index: 9999;
        display: block;
        background: var(--ux-color-surface);
        transform: translateX(0);
        transition: width 0.3s ease, transform 0.3s ease;
    `;

  // iframeを親ドキュメントに追加
  topDoc.documentElement.appendChild(tocOverlayIframe);

  if (!topDoc.getElementById("ux-shiryou-toc-resize-style")) {
    const resizeStyle = markUxCourseStyle(topDoc.createElement("style"));
    resizeStyle.id = "ux-shiryou-toc-resize-style";
    resizeStyle.textContent = `
            #ux-toc-resize-handle {
                position: fixed;
                top: 55px;
                left: ${tocWidthPx - 5}px;
                width: 10px;
                height: calc(100vh - 55px);
                z-index: 10000;
                display: none;
                cursor: col-resize;
                touch-action: none;
                transform: translateX(-${tocWidthPx}px);
                transition: transform 0.3s ease, background 0.15s ease;
            }
            #ux-toc-resize-handle::before {
                content: "";
                position: absolute;
                top: 0;
                bottom: 0;
                left: 4px;
                width: 2px;
                background: var(--ux-color-border-strong);
            }
            #ux-toc-resize-handle:hover::before,
            #ux-toc-resize-handle:focus-visible::before,
            html.ux-shiryou-toc-resizing #ux-toc-resize-handle::before {
                width: 3px;
                left: 3px;
                background: var(--ux-color-accent);
            }
            #ux-toc-resize-handle:focus-visible::before {
                outline: var(--ux-focus-width, 2px) solid var(--ux-focus-color, var(--ux-color-accent));
                outline-offset: var(--ux-focus-offset, 2px);
            }
            html.ux-shiryou-toc-resizing,
            html.ux-shiryou-toc-resizing * {
                cursor: col-resize !important;
                user-select: none !important;
            }
        `;
    (topDoc.head || topDoc.documentElement).appendChild(resizeStyle);
  }

  const tocResizeHandle = topDoc.createElement("div");
  tocResizeHandle.id = "ux-toc-resize-handle";
  tocResizeHandle.setAttribute("role", "separator");
  tocResizeHandle.setAttribute("aria-orientation", "vertical");
  tocResizeHandle.setAttribute("aria-label", "目次の幅を変更");
  tocResizeHandle.tabIndex = 0;
  topDoc.documentElement.appendChild(tocResizeHandle);

  const tocResizeShield = topDoc.createElement("div");
  tocResizeShield.id = "ux-toc-resize-shield";
  tocResizeShield.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 10001;
        display: none;
        cursor: col-resize;
        background: var(--ux-color-page);
        opacity: 0;
        touch-action: none;
    `;
  topDoc.documentElement.appendChild(tocResizeShield);

  // ホバー表示用のヒットゾーンを作成（設定で有効な場合のみ）
  const tocHoverReveal =
    options.tocHoverReveal !== undefined ? options.tocHoverReveal : true;
  let hoverRevealZone = null;

  if (tocHoverReveal) {
    // 既存のホバーゾーンを削除
    const existingHoverZone = topDoc.getElementById("ux-toc-hover-zone");
    if (existingHoverZone) {
      existingHoverZone.remove();
    }

    hoverRevealZone = topDoc.createElement("div");
    hoverRevealZone.id = "ux-toc-hover-zone";
    hoverRevealZone.style.cssText = `
            position: fixed;
            top: 55px;
            left: 0;
            width: 8px;
            height: calc(100vh - 55px);
            background: var(--ux-color-page);
            opacity: 0;
            z-index: 9997;
            cursor: pointer;
            display: block;
        `;
    hoverRevealZone.title = "目次を表示";

    // ホバー時に目次を開く
    hoverRevealZone.addEventListener("mouseenter", () => {
      if (!tocVisible) {
        openToc();
      }
    });

    topDoc.documentElement.appendChild(hoverRevealZone);
  }

  // 初期表示時に節タイトル（第○節など）をコンパクトな番号バッジにする処理
  let processedTocHtml = tocHtml;
  if (tocHtml) {
    // 一時的なDOMを作成して変換
    const tempDiv = topDoc.createElement("div");
    tempDiv.innerHTML = tocHtml;
    compactUxSectionLabels(tempDiv);
    processedTocHtml = tempDiv.innerHTML;
  }

  // iframeの内容を設定
  const iframeDoc =
    tocOverlayIframe.contentDocument || tocOverlayIframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                :root {
                    --ux-color-page: #EBF6FF;
                    --ux-color-surface: #FFFFFF;
                    --ux-color-surface-subtle: #F5FAFF;
                    --ux-color-text: #1F2326;
                    --ux-color-muted: #6F767A;
                    --ux-color-border: #DCE8F0;
                    --ux-color-border-strong: #BFD4E1;
                    --ux-color-accent: #099BFF;
                    --ux-color-accent-active: #0677C7;
                    --ux-color-accent-hover: #0789E1;
                    --ux-color-on-accent: #FFFFFF;
                    --ux-color-info-surface: #EAF4FF;
                    --ux-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif;
                    --ux-motion-duration-fast: 120ms;
                    --ux-motion-ease-standard: cubic-bezier(0.2, 0, 0, 1);
                }
                * { box-sizing: border-box; }
                body {
                    margin: 0;
                    padding: 8px 7px;
                    font-family: var(--ux-font-family);
                    background: var(--ux-color-surface);
                    color: var(--ux-color-text);
                    height: 100vh;
                    overflow-y: auto;
                    border-right: 1px solid var(--ux-color-border);
                }
                body.ux-toc-collapsed {
                    overflow-x: hidden;
                }
                .header {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    position: relative;
                    height: 41px;
                    margin-bottom: 6px;
                    padding-bottom: 6px;
                    border-bottom: 1px solid var(--ux-color-border);
                }
                body.ux-toc-collapsed .header {
                    justify-content: center;
                }
                .header h3 {
                    margin: 0;
                    padding: 0 40px;
                    font-size: 1.1rem;
                    font-weight: 600;
                    color: var(--ux-color-text);
                }
                body.ux-toc-collapsed .header h3 {
                    display: none;
                }
                .toc-frame-toggle-btn {
                    background: var(--ux-color-surface-subtle);
                    border: 1px solid var(--ux-color-border);
                    color: var(--ux-color-accent-active);
                    width: 34px;
                    height: 34px;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: absolute;
                    top: 0;
                    left: 0;
                    padding: 0;
                    transition: background-color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard), border-color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard), color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard);
                }
                .toc-frame-toggle-btn:hover {
                    background: var(--ux-color-surface-subtle);
                    border-color: var(--ux-color-border-hover, #B1BEC6);
                    color: var(--ux-color-text);
                }
                .toc-frame-toggle-btn:focus-visible {
                    outline: var(--ux-focus-width, 2px) solid var(--ux-focus-color, var(--ux-color-accent));
                    outline-offset: var(--ux-focus-offset, 2px);
                }
                .toc-frame-toggle-btn svg {
                    width: 17px;
                    height: 17px;
                    transition: transform 0.2s ease;
                }
                body.ux-toc-collapsed .toc-frame-toggle-btn svg {
                    transform: rotate(180deg);
                }
                #toc-content table {
                    width: 100%;
                    min-width: var(--ux-toc-open-content-width, 336px);
                    border-collapse: separate;
                    border-spacing: 0;
                }
                #toc-content tr {
                    height: 45px;
                    transition: background 0.2s;
                }
                #toc-content tr.ux-toc-page-row {
                    cursor: pointer;
                }
                #toc-content tr:hover,
                #toc-content tr.ux-toc-page-row:focus-visible {
                    background: var(--ux-color-info-surface);
                }
                #toc-content tr.ux-toc-page-row:focus-visible {
                    outline: var(--ux-focus-width, 2px) solid var(--ux-focus-color, var(--ux-color-accent));
                    outline-offset: var(--ux-focus-offset, -3px);
                }
                #toc-content td {
                    height: 45px;
                    padding: 5px 8px;
                    vertical-align: middle;
                    border-bottom: 1px solid var(--ux-color-border);
                }
                #toc-content span {
                    color: var(--ux-color-text) !important;
                }
                #toc-content input[type="button"] {
                    background: var(--ux-color-accent);
                    color: var(--ux-color-on-accent);
                    border: 1px solid var(--ux-color-accent);
                    border-radius: 4px;
                    padding: 6px 12px;
                    cursor: pointer;
                    font-size: 0.85rem;
                    transition: background-color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard), border-color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard), color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard);
                }
                #toc-content input[type="button"]:hover {
                    background: var(--ux-color-accent-hover);
                }
                #toc-content input[name="clickpage"] {
                    display: none !important;
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
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    background: var(--ux-color-surface-subtle) !important;
                    color: var(--ux-color-accent-active) !important;
                    border: 1px solid var(--ux-color-border) !important;
                    border-radius: 4px !important;
                    min-width: 30px !important;
                    min-height: 30px !important;
                    padding: 5px !important;
                    font-size: 0.75rem !important;
                    cursor: pointer !important;
                    transition: background-color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard), border-color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard), color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard) !important;
                }
                .ux-download-btn svg {
                    width: 17px !important;
                    height: 17px !important;
                    flex: 0 0 auto !important;
                }
                .ux-download-btn:not(.ux-download-rename):not(.ux-download-image):not(.ux-download-copy):hover {
                    background: var(--ux-color-surface-subtle) !important;
                    border-color: var(--ux-color-border-hover, #B1BEC6) !important;
                    color: var(--ux-color-accent-active) !important;
                }
                ::-webkit-scrollbar { width: 8px; }
                ::-webkit-scrollbar-track { background: var(--ux-color-surface-subtle); }
                ::-webkit-scrollbar-thumb { background: var(--ux-color-border-strong); border-radius: 4px; }
                .ux-section-number-badge {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    min-width: 34px !important;
                    width: 34px !important;
                    height: 34px !important;
                    padding: 0 !important;
                    margin-right: 0.35rem !important;
                    border-radius: 8px !important;
                    background: var(--ux-color-surface-subtle) !important;
                    border: 1px solid var(--ux-color-border) !important;
                    color: var(--ux-color-accent-active) !important;
                    font-size: 0.78rem !important;
                    font-weight: 700 !important;
                    line-height: 1 !important;
                }
                body.ux-toc-collapsed #toc-content table,
                body.ux-toc-collapsed #toc-content tbody {
                    display: block;
                    width: 100%;
                    min-width: 0;
                }
                body.ux-toc-collapsed #toc-content tr {
                    display: none;
                    border-bottom: 0;
                }
                body.ux-toc-collapsed #toc-content tr:has(.ux-section-number-badge) {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 45px;
                    min-height: 45px;
                    margin: 0;
                    border-radius: 8px;
                }
                body.ux-toc-collapsed #toc-content td {
                    display: none;
                    padding: 0 !important;
                    border-bottom: 0 !important;
                }
                body.ux-toc-collapsed #toc-content td:has(.ux-section-number-badge) {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    color: var(--ux-color-surface) !important;
                    font-size: 0 !important;
                }
                body.ux-toc-collapsed #toc-content td:has(.ux-section-number-badge) > :not(.ux-section-number-badge),
                body.ux-toc-collapsed .ux-inline-download-options,
                body.ux-toc-collapsed .ux-download-btn {
                    display: none !important;
                }
                body.ux-toc-collapsed .ux-section-number-badge {
                    min-width: 34px !important;
                    width: 34px !important;
                    height: 34px !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    border-radius: 8px !important;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h3>目次</h3>
                <button class="toc-frame-toggle-btn" id="toc-frame-toggle-btn" type="button" aria-label="目次を開く" aria-expanded="false" title="目次を開く">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </button>
            </div>
            <div id="toc-content">
                ${processedTocHtml}
            </div>
        </body>
        </html>
    `);
  iframeDoc.close();
  const syncTocTheme = () => {
    const sourceStyle = topDoc.defaultView.getComputedStyle(topDoc.documentElement);
    const targetRoot = iframeDoc.documentElement;
    targetRoot.dataset.uxTheme = topDoc.documentElement.dataset.uxTheme || "light";
    targetRoot.style.colorScheme = targetRoot.dataset.uxTheme;
    [
      "page", "surface", "surface-subtle", "text", "muted", "border",
      "border-strong", "accent", "accent-active", "accent-hover",
      "on-accent", "info-surface"
    ].forEach((name) => {
      const token = `--ux-color-${name}`;
      targetRoot.style.setProperty(token, sourceStyle.getPropertyValue(token));
    });
  };
  syncTocTheme();
  const tocThemeObserver = new MutationObserver(syncTocTheme);
  tocThemeObserver.observe(topDoc.documentElement, {
    attributes: true,
    attributeFilter: ["data-ux-theme"]
  });
  tocOverlayIframe.__uxThemeObserver = tocThemeObserver;
  iframeDoc.body?.classList.add("ux-toc-collapsed");
  const tocToggleBtn = iframeDoc.getElementById("toc-frame-toggle-btn");

  // iframeへの参照を保持（後でアクセスするため）
  let tocCloseSetup = false;

  // TOC更新イベントのリスナー
  doc.addEventListener("ux-toc-needs-update", () => {
    log("Received ux-toc-needs-update event");
    updateTocContent(iframeDoc);
  });

  // 目次の表示/非表示状態を追跡
  let tocVisible = false;
  let initialCloseTimer = null;
  let autoHideTimer = null;
  setupTocResizeHandle();
  applyTocWidth(tocWidthPx, { updateFrameset: false });

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
  function getTocTargetFrameset() {
    const framesets = window.top.document.querySelectorAll("frameset");
    for (const fs of framesets) {
      if (fs.getAttribute("cols")) {
        return fs;
      }
    }
    return null;
  }

  function applyTocWidth(width, { updateFrameset = true } = {}) {
    tocWidthPx = clampTocWidth(width);
    const openContentWidth = Math.max(0, tocWidthPx - 14);
    iframeDoc.documentElement?.style.setProperty(
      "--ux-toc-open-content-width",
      `${openContentWidth}px`,
    );
    const displayWidth = tocVisible
      ? tocWidthPx
      : UX_SHIRYOU_TOC_COLLAPSED_WIDTH;
    tocOverlayIframe.style.width = `${displayWidth}px`;
    tocResizeHandle.style.left = `${tocWidthPx - 5}px`;
    tocResizeHandle.setAttribute("aria-valuenow", String(tocWidthPx));
    tocResizeHandle.setAttribute(
      "aria-valuemin",
      String(UX_SHIRYOU_TOC_MIN_WIDTH),
    );
    tocResizeHandle.setAttribute(
      "aria-valuemax",
      String(Math.max(tocWidthPx, clampTocWidth(UX_SHIRYOU_TOC_MAX_WIDTH))),
    );
    if (tocVisible) {
      tocResizeHandle.style.display = "block";
      tocResizeHandle.style.transform = "translateX(0)";
      if (updateFrameset && !isShiryouOriginDisplayActive(topDoc)) {
        const targetFrameset = getTocTargetFrameset();
        if (targetFrameset) {
          targetFrameset.setAttribute("cols", `${tocWidthPx},*`);
        }
      }
    } else {
      tocResizeHandle.style.display = "none";
      tocResizeHandle.style.transform = "translateX(0)";
    }
  }

  function setTocCollapsedMode(collapsed) {
    try {
      iframeDoc.body?.classList.toggle("ux-toc-collapsed", !!collapsed);
    } catch (_) {}
    if (tocToggleBtn) {
      tocToggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      tocToggleBtn.setAttribute(
        "aria-label",
        collapsed ? "目次を開く" : "目次を閉じる",
      );
      tocToggleBtn.title = collapsed ? "目次を開く" : "目次を閉じる";
    }
    tocOverlayIframe.setAttribute(
      "aria-label",
      collapsed ? "目次（節番号のみ）" : "目次",
    );
    tocOverlayIframe.title = collapsed ? "節番号をクリックして移動" : "目次";
  }

  function persistTocWidth() {
    try {
      chrome.storage.local.set({
        [UX_SHIRYOU_TOC_WIDTH_STORAGE_KEY]: tocWidthPx,
      });
    } catch {
      // ignore storage failures
    }
  }

  function animateFramesetCols(targetValue, duration = 300) {
    if (isShiryouOriginDisplayActive(topDoc)) return;

    // cols属性を持つフレームセット（ネストされたもの）を取得
    const targetFrameset = getTocTargetFrameset();
    if (!targetFrameset) return;

    if (duration <= 0) {
      targetFrameset.setAttribute("cols", `${Math.round(targetValue)},*`);
      return;
    }

    const cols = targetFrameset.getAttribute("cols") || "0,*";
    const currentValue = parseInt(cols.split(",")[0]) || 0;
    const startTime = performance.now();
    const diff = targetValue - currentValue;

    if (diff === 0) return;

    function step(timestamp) {
      if (isShiryouOriginDisplayActive(topDoc)) return;

      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const newValue = Math.round(currentValue + diff * eased);
      targetFrameset.setAttribute("cols", `${newValue},*`);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  function setupTocResizeHandle() {
    let dragState = null;

    const getClientX = (event) => {
      if (event.touches && event.touches[0]) return event.touches[0].clientX;
      if (event.changedTouches && event.changedTouches[0]) {
        return event.changedTouches[0].clientX;
      }
      return event.clientX;
    };

    const beginDrag = (event) => {
      if (!tocVisible) return;
      event.preventDefault();
      dragState = {
        startX: getClientX(event),
        startWidth: tocWidthPx,
      };
      tocOverlayIframe.style.transition = "none";
      tocResizeHandle.style.transition = "background 0.15s ease";
      tocResizeShield.style.display = "block";
      topDoc.documentElement.classList.add("ux-shiryou-toc-resizing");
      topDoc.addEventListener("mousemove", onDragMove, true);
      topDoc.addEventListener("mouseup", endDrag, true);
      topDoc.addEventListener("touchmove", onDragMove, {
        capture: true,
        passive: false,
      });
      topDoc.addEventListener("touchend", endDrag, true);
      topDoc.addEventListener("touchcancel", endDrag, true);
    };

    const onDragMove = (event) => {
      if (!dragState) return;
      event.preventDefault();
      const nextWidth =
        dragState.startWidth + (getClientX(event) - dragState.startX);
      applyTocWidth(nextWidth);
    };

    const endDrag = () => {
      if (!dragState) return;
      dragState = null;
      topDoc.documentElement.classList.remove("ux-shiryou-toc-resizing");
      tocResizeShield.style.display = "none";
      tocOverlayIframe.style.transition = "transform 0.3s ease";
      tocResizeHandle.style.transition =
        "transform 0.3s ease, background 0.15s ease";
      topDoc.removeEventListener("mousemove", onDragMove, true);
      topDoc.removeEventListener("mouseup", endDrag, true);
      topDoc.removeEventListener("touchmove", onDragMove, true);
      topDoc.removeEventListener("touchend", endDrag, true);
      topDoc.removeEventListener("touchcancel", endDrag, true);
      applyTocWidth(tocWidthPx);
      persistTocWidth();
    };

    tocResizeHandle.addEventListener("mousedown", beginDrag);
    tocResizeHandle.addEventListener("touchstart", beginDrag, {
      passive: false,
    });
    tocResizeHandle.addEventListener("keydown", (event) => {
      if (!tocVisible) return;
      const step = event.shiftKey ? 40 : 16;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        applyTocWidth(tocWidthPx - step);
        persistTocWidth();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        applyTocWidth(tocWidthPx + step);
        persistTocWidth();
      } else if (event.key === "Home") {
        event.preventDefault();
        applyTocWidth(UX_SHIRYOU_TOC_MIN_WIDTH);
        persistTocWidth();
      } else if (event.key === "End") {
        event.preventDefault();
        applyTocWidth(UX_SHIRYOU_TOC_MAX_WIDTH);
        persistTocWidth();
      }
    });
  }

  // 目次を閉じる関数
  function closeToc() {
    tocVisible = false;
    setTocCollapsedMode(true);
    tocOverlayIframe.style.display = "block";
    tocOverlayIframe.style.transform = "translateX(0)";
    applyTocWidth(tocWidthPx, { updateFrameset: false });

    // 閉じた状態でも節番号レール分だけ幅を残す
    animateFramesetCols(UX_SHIRYOU_TOC_COLLAPSED_WIDTH, 300);

    // タイマー類をクリア
    if (initialCloseTimer) {
      clearTimeout(initialCloseTimer);
      initialCloseTimer = null;
    }
    stopAutoHideTimer();

    // ホバーゾーンを表示
    if (hoverRevealZone) {
      hoverRevealZone.style.display = "block";
    }
  }

  // 目次を開く関数
  function openToc(isInitial = false) {
    tocVisible = true;
    if (isInitial) {
      tocOverlayIframe.style.transition = "none";
      tocResizeHandle.style.transition = "none";
    }
    tocOverlayIframe.style.display = "block";
    setTocCollapsedMode(false);
    applyTocWidth(tocWidthPx, { updateFrameset: false });
    tocOverlayIframe.style.transform = "translateX(0)";
    tocResizeHandle.style.transform = "translateX(0)";

    // 初期描画では最初から目次幅を確保し、手動操作時だけアニメーションする。
    animateFramesetCols(tocWidthPx, isInitial ? 0 : 300);
    if (isInitial) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          tocOverlayIframe.style.transition = "transform 0.3s ease";
          tocResizeHandle.style.transition =
            "transform 0.3s ease, background 0.15s ease";
        });
      });
    }

    // ホバーゾーンを非表示
    if (hoverRevealZone) {
      hoverRevealZone.style.display = "none";
    }

    const iframeDoc =
      tocOverlayIframe.contentDocument ||
      tocOverlayIframe.contentWindow.document;

    if (!tocCloseSetup) {
      // オートハイド用のイベント設定
      if (tocAutoHide || tocInitialCloseDelay > 0) {
        // マウスが入ったらタイマーキャンセル（ユーザーが操作しようとしている）
        iframeDoc.body.addEventListener("mouseenter", () => {
          // 初期表示タイマーキャンセル
          if (initialCloseTimer) {
            clearTimeout(initialCloseTimer);
            initialCloseTimer = null;
            log("Initial close timer cancelled by user interaction");
          }

          // オートハイドタイマーキャンセル
          stopAutoHideTimer();
        });

        // マウスが出たらオートハイドタイマー開始（設定されている場合）
        iframeDoc.body.addEventListener("mouseleave", () => {
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

  function navigateToTocPage(pageNum, event = null) {
    if (!pageNum) return;
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    uxDebugLog("[WebClass UX] Navigating to page:", pageNum);

    // 白フラッシュ抑制: PDFページのみオーバーレイを出して、描画完了で消す（点滅防止）
    const seq = ++uxState.navSeq;
    let expectsPdf = true;
    try {
      const chapterFrame = window.top.frames["webclass_chapter"];
      const jsonData =
        chapterFrame && chapterFrame.document
          ? chapterFrame.document.querySelector("#json-data")
          : null;
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
      // 判定不能なら保守的にPDF扱い
      expectsPdf = true;
    }

    showUxContentLoadingOverlay(seq, expectsPdf);
    attachUxContentFrameLoadHandler(seq, expectsPdf);

    function doPageNavigation() {
      try {
        // まず、チャプターフレームからtext_urlsを取得してみる
        const chapterFrame = window.top.frames["webclass_chapter"];
        if (chapterFrame && chapterFrame.document) {
          const jsonData = chapterFrame.document.querySelector("#json-data");
          if (jsonData) {
            const config = JSON.parse(jsonData.textContent);
            if (config.text_urls && config.text_urls[pageNum]) {
              // URLを取得してコンテンツフレームを更新
              const targetUrl = config.text_urls[pageNum];
              uxDebugLog("[WebClass UX] Navigating to URL:", targetUrl);

              // コンテンツフレームのsrcを変更
              const contentFrame = window.top.document.querySelector(
                'frame[name="webclass_content"], iframe[name="webclass_content"]',
              );
              if (contentFrame) {
                contentFrame.src = targetUrl;
                uxDebugLog("[WebClass UX] Updated content frame src");
                return true;
              }
            }
          }
        }

        // フォールバック: gopage関数を直接呼び出す
        // 方法1: frame要素のcontentWindow経由
        const frames = window.top.document.querySelectorAll("frame");
        for (const frame of frames) {
          if (frame.name === "webclass_chapter") {
            const win = frame.contentWindow;
            if (win && typeof win.gopage === "function") {
              uxDebugLog("[WebClass UX] Calling gopage via contentWindow");
              win.gopage(pageNum);
              return true;
            }
            if (win && win.document && win.document.app) {
              uxDebugLog("[WebClass UX] Calling document.app.movePageTo");
              win.document.app.movePageTo(pageNum);
              return true;
            }
          }
        }

        // 方法2: window.top.frames経由
        const fallbackChapterFrame = window.top.frames["webclass_chapter"];
        if (fallbackChapterFrame) {
          if (typeof fallbackChapterFrame.gopage === "function") {
            uxDebugLog("[WebClass UX] Calling gopage via frames[]");
            fallbackChapterFrame.gopage(pageNum);
            return true;
          }
          if (
            fallbackChapterFrame.document &&
            fallbackChapterFrame.document.app
          ) {
            uxDebugLog("[WebClass UX] Calling app.movePageTo via frames[]");
            fallbackChapterFrame.document.app.movePageTo(pageNum);
            return true;
          }
        }

        uxDebugLog("[WebClass UX] Could not find navigation method");
        return false;
      } catch (err) {
        uxDebugLog("[WebClass UX] Error in doPageNavigation:", err);
        return false;
      }
    }

    if (!doPageNavigation() && seq === uxState.navSeq) {
      hideUxContentLoadingOverlay(seq);
    }
  }

  function updateTocContent(iframeDoc) {
    try {
      const chapterFrame = window.top.frames["webclass_chapter"];
      if (chapterFrame && chapterFrame.document) {
        const tocElement = chapterFrame.document.querySelector("#TOC");
        if (tocElement && tocElement.innerHTML.trim()) {
          const tocContent = iframeDoc.getElementById("toc-content");
          if (tocContent) {
            tocContent.innerHTML = tocElement.innerHTML;

            compactUxSectionLabels(tocContent);

            // ダウンロードボタンのイベントを設定
            const downloadBtns =
              tocContent.querySelectorAll(".ux-download-btn");
            downloadBtns.forEach((btn) => {
              bindInlineDownloadButton(btn);
            });

            // ページ移動ボタンを行全体のクリック領域へ置き換える
            const pageButtons = tocContent.querySelectorAll(
              'input[name="clickpage"]',
            );
            pageButtons.forEach((btn) => {
              const onclickAttr = btn.getAttribute("onclick");
              if (!onclickAttr) return;
              const pageMatch = onclickAttr.match(/gopage\(['"]?(\d+)['"]?\)/);
              if (!pageMatch) return;

              const pageNum = pageMatch[1];
              const row = btn.closest("tr");
              btn.remove();
              if (!row) return;

              row.classList.add("ux-toc-page-row");
              row.dataset.uxTocPage = pageNum;
              row.setAttribute("role", "button");
              row.setAttribute("tabindex", "0");
              row.setAttribute("aria-label", `${row.textContent.trim()}へ移動`);
              row.onclick = (e) => {
                if (e.target.closest("button, a, input, select, textarea")) {
                  return;
                }
                navigateToTocPage(pageNum, e);
              };
              row.onkeydown = (e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                navigateToTocPage(pageNum, e);
              };
            });
            return true;
          }
        }
      }
    } catch (e) {
      uxDebugLog("[WebClass UX] Could not update TOC:", e);
    }
    return false;
  }

  if (tocToggleBtn) {
    tocToggleBtn.onclick = () => {
      if (tocVisible) {
        closeToc();
      } else {
        openToc();
      }
    };
  }

  // 資料名
  const centerDiv = doc.createElement("div");
  centerDiv.style.cssText = "flex: 1; text-align: center;";

  const titleSpan = doc.createElement("span");
  titleSpan.textContent = contentName;
  titleSpan.style.cssText = `
        color: var(--ux-color-text);
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
  const rightDiv = doc.createElement("div");
  rightDiv.style.cssText = "display: flex; align-items: center;";

  const newWindowBtn = doc.createElement("button");
  newWindowBtn.type = "button";
  newWindowBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
    `;
  newWindowBtn.setAttribute("aria-label", "PDFを開く");
  newWindowBtn.title = "PDFを開く";
  newWindowBtn.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 8px;
        margin-right: 8px;
        border: 1px solid var(--ux-color-border);
        border-radius: 6px;
        cursor: pointer;
        background: var(--ux-color-surface);
        color: var(--ux-color-muted);
        transition: background-color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard), border-color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard), color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard);
    `;
  newWindowBtn.onmouseover = () => {
    newWindowBtn.style.background = "var(--ux-color-surface)";
    newWindowBtn.style.borderColor = "var(--ux-color-border-hover)";
    newWindowBtn.style.color = "var(--ux-color-text)";
  };
  newWindowBtn.onmouseout = () => {
    newWindowBtn.style.background = "var(--ux-color-surface)";
    newWindowBtn.style.borderColor = "var(--ux-color-border)";
    newWindowBtn.style.color = "var(--ux-color-muted)";
  };
  newWindowBtn.onclick = () => {
    // PDFのURLを取得して別ウィンドウで開く
    let pdfUrl = null;

    try {
      const chapterFrame = window.top.frames["webclass_chapter"];
      if (chapterFrame && chapterFrame.document) {
        const jsonData = chapterFrame.document.querySelector("#json-data");
        if (jsonData) {
          const config = JSON.parse(jsonData.textContent);

          // contents_urlとfileパラメータからPDF URLを構築
          if (config.text_url && config.text_url.includes("file=")) {
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
                  pdfUrl =
                    window.top.location.origin +
                    "/webclass/data/course/" +
                    filePath;
                }
              }
            }
          }
        }
      }
    } catch (e) {
      uxDebugLog("[WebClass UX] Error getting PDF URL:", e);
    }

    if (pdfUrl) {
      uxDebugLog("[WebClass UX] Opening PDF:", pdfUrl);
      window.open(pdfUrl, "_blank");
    } else {
      // PDFがない場合（テキストコンテンツなど）
      alert("この資料にはPDFファイルがありません。");
    }
  };
  // リボン非表示ボタン
  const hideRibbonBtn = doc.createElement("button");
  hideRibbonBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
    `;
  hideRibbonBtn.title = "ヘッダーを隠す";
  hideRibbonBtn.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px;
        margin-right: 8px;
        border: 1px solid var(--ux-color-border);
        border-radius: 6px;
        cursor: pointer;
        background: var(--ux-color-surface);
        color: var(--ux-color-muted);
        transition: background-color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard), border-color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard), color var(--ux-motion-duration-fast) var(--ux-motion-ease-standard);
    `;
  hideRibbonBtn.onmouseover = () => {
    hideRibbonBtn.style.background = "var(--ux-color-surface)";
    hideRibbonBtn.style.borderColor = "var(--ux-color-border-hover)";
    hideRibbonBtn.style.color = "var(--ux-color-text)";
  };
  hideRibbonBtn.onmouseout = () => {
    hideRibbonBtn.style.background = "var(--ux-color-surface)";
    hideRibbonBtn.style.borderColor = "var(--ux-color-border)";
    hideRibbonBtn.style.color = "var(--ux-color-muted)";
  };
  hideRibbonBtn.onclick = () => {
    toggleRibbon(false);
  };
  rightDiv.appendChild(hideRibbonBtn);
  rightDiv.appendChild(newWindowBtn);

  const originBtn = doc.createElement("button");
  originBtn.type = "button";
  originBtn.appendChild(
    createShiryouDisplayModeIcon(doc, UX_SHIRYOU_DISPLAY_MODE_ORIGIN),
  );
  originBtn.setAttribute("aria-label", "Origin表示に戻す");
  originBtn.title = "Origin表示に戻す";
  styleShiryouHeaderIconButton(originBtn);
  originBtn.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    applyShiryouOriginDisplayOnlyMode(window.top.document, { persist: true });
  };
  rightDiv.appendChild(originBtn);

  header.appendChild(leftDiv);
  header.appendChild(centerDiv);
  header.appendChild(rightDiv);

  doc.body.appendChild(header);
  const initialTocWasUpdated = updateTocContent(iframeDoc);
  if (!initialTocWasUpdated && !processedTocHtml.trim()) {
    let tocRefreshAttempts = 0;
    const maxTocRefreshAttempts = 30;

    const refreshInitialToc = () => {
      if (!tocOverlayIframe.isConnected || updateTocContent(iframeDoc)) return;

      tocRefreshAttempts++;
      if (tocRefreshAttempts < maxTocRefreshAttempts) {
        setTimeout(refreshInitialToc, 100);
        return;
      }

      const tocContent = iframeDoc.getElementById("toc-content");
      if (tocContent && !tocContent.innerHTML.trim()) {
        tocContent.innerHTML =
          '<p style="text-align:center;padding:20px;color:var(--ux-color-muted);">この教材には目次がありません</p>';
      }
    };

    refreshInitialToc();
  }

  // 初期状態で目次を開く設定の場合
  if (tocInitialState === "open") {
    openToc(true);
  } else {
    closeToc();
  }

  log("Created modern header with TOC overlay in title frame");
}

/**
 * 左サイドバー（目次フレーム）のUI改善
 */
