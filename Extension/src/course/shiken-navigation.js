// course/shiken-navigation.js
// Exam navigation state, answer widgets, and one-by-one frameset behavior.

function collectShikenNavigationHrefs() {
  const hrefs = [];
  const addHref = (href) => {
    if (typeof href === "string" && href && !hrefs.includes(href)) {
      hrefs.push(href);
    }
  };

  addHref(window.location.href);

  try {
    addHref(window.parent?.frames?.button?.location?.href);
  } catch {}

  try {
    addHref(window.top?.frames?.button?.location?.href);
  } catch {}

  try {
    const buttonFrame = window.parent?.document?.querySelector?.(
      'frame[name="button"], iframe[name="button"]',
    );
    addHref(buttonFrame?.src);
  } catch {}

  try {
    const buttonFrame = window.top?.document?.querySelector?.(
      'frame[name="button"], iframe[name="button"]',
    );
    addHref(buttonFrame?.src);
  } catch {}

  return hrefs;
}

function collectShikenTocPageNumbers(doc = document) {
  const pages = new Set();
  const collectFromDoc = (targetDoc) => {
    if (!targetDoc) return;
    targetDoc
      .querySelectorAll(
        [
          'input[name="page_num"]',
          'button[name="page_num"]',
          'input[name="clickpage"]',
          'button[name="clickpage"]',
          'input[type="button"]',
          "button",
        ].join(","),
      )
      .forEach((control) => {
        const label = (
          control.value ||
          control.textContent ||
          control.getAttribute("aria-label") ||
          control.title ||
          ""
        ).trim();
        const number = parseUxPositiveInteger(label.replace(/[^\d]/g, ""));
        if (number) pages.add(number);

        const onclick = control.getAttribute("onclick") || "";
        const match = onclick.match(/(?:gopage|movePageTo)\(['"]?(\d+)['"]?\)/);
        if (match) pages.add(parseInt(match[1], 10));
      });
  };

  collectFromDoc(doc);

  try {
    const tocFrame = doc.getElementById("TOCContent");
    collectFromDoc(
      tocFrame?.contentDocument || tocFrame?.contentWindow?.document,
    );
  } catch {}

  try {
    const buttonDoc = window.parent?.frames?.button?.document;
    if (buttonDoc && buttonDoc !== doc) collectFromDoc(buttonDoc);
  } catch {}

  return Array.from(pages).filter((page) => Number.isFinite(page) && page > 0);
}

function getShikenNavigationState(doc = document) {
  let currentPage = null;
  let endPage = null;

  collectShikenNavigationHrefs().forEach((href) => {
    const params = readUxUrlSearchParams(href);
    if (!params) return;
    currentPage = currentPage || parseUxPositiveInteger(params.get("page"));
    endPage = endPage || parseUxPositiveInteger(params.get("end_page"));
  });

  const tocPages = collectShikenTocPageNumbers(doc);
  if (!endPage && tocPages.length > 0) {
    endPage = Math.max(...tocPages);
  }

  if (!currentPage) {
    try {
      const activeButton = doc.querySelector(
        ".ux-shiken-inline-page.is-active, tr.bkkhaki input, tr.bkkhaki button, td.bkkhaki input, td.bkkhaki button",
      );
      const activeLabel =
        activeButton?.value ||
        activeButton?.textContent ||
        activeButton?.getAttribute?.("aria-label") ||
        "";
      currentPage = parseUxPositiveInteger(
        String(activeLabel).replace(/[^\d]/g, ""),
      );
    } catch {}
  }

  if (!currentPage && endPage) currentPage = 1;
  if (!currentPage || !endPage) return null;

  endPage = Math.max(currentPage, endPage);
  return {
    currentPage,
    endPage,
    canPrev: currentPage > 1,
    canNext: currentPage < endPage,
  };
}

function isUxControlDisabled(control) {
  return !!(
    control?.disabled ||
    control?.getAttribute?.("aria-disabled") === "true" ||
    control?.classList?.contains("disabled") ||
    control?.classList?.contains("is-disabled")
  );
}

function buildShikenAnswerActionArea(form) {
  if (!form || form.dataset.uxNavBuilt === "true") return;
  form.dataset.uxNavBuilt = "true";
  const isFinishConfirmation = isShikenFinishConfirmationForm(form);

  const originalPrevBtn = findShikenAnswerActionControl(
    [/^前のページ$/, /^戻る$/],
    [
      "#QstnPrevBtn",
      'input[name="pre"]',
      'button[name="pre"]',
      'input[name="back"]',
      'button[name="back"]',
      'input[value="戻る"]',
      'button[value="戻る"]',
    ],
  );
  const originalNextBtn = findShikenAnswerActionControl(
    [/^次の(?:ページ|問題)(?:へ進む)?$/],
    ["#QstnNextBtn", 'input[name="next"]', 'button[name="next"]'],
  );
  const originalCheckBtn = findShikenAnswerActionControl(
    [/^解答チェック$/],
    ["#QstnChkBtn", 'input[name="check"]', 'button[name="check"]'],
  );
  const originalFinishBtn = findShikenAnswerActionControl(
    [
      /^(終了|採点|提出|送信|完了)(する)?$/,
      /^(テスト|課題|レポート).*(終了|提出)$/,
      /(終了|提出|採点)$/,
    ],
    [
      "#GradeBtn",
      'input[name="grade"]',
      'button[name="grade"]',
      'button[onclick*="gradeAndClose"]',
      'input[onclick*="gradeAndClose"]',
    ],
  );

  const canFinishFallback = typeof window.gradeAndClose === "function";
  if (
    !originalPrevBtn &&
    !originalNextBtn &&
    !originalCheckBtn &&
    !originalFinishBtn &&
    !canFinishFallback
  ) {
    return;
  }

  const navState = getShikenNavigationState(document);
  const actions = document.createElement("div");
  actions.className = "ux-answer-actions";

  if (originalPrevBtn || originalNextBtn) {
    const nav = document.createElement("div");
    nav.className = "ux-answer-nav";

    if (originalPrevBtn) {
      let returnToAnswer = null;
      if (isFinishConfirmation) {
        returnToAnswer = () => {
          if (
            !submitShikenAnswerCommand("back", form) &&
            originalPrevBtn
          ) {
            originalPrevBtn.click();
          }
        };
      } else if (typeof window.prevPage === "function") {
        returnToAnswer = () => window.prevPage();
      }
      nav.appendChild(
        createShikenAnswerProxyButton({
          source: isFinishConfirmation ? null : originalPrevBtn,
          label: isFinishConfirmation ? "戻る" : "前のページ",
          fallback: returnToAnswer,
          disabled:
            isUxControlDisabled(originalPrevBtn) ||
            (!isFinishConfirmation && navState ? !navState.canPrev : false),
          pendingLabel: isFinishConfirmation ? "戻り中…" : "",
        }),
      );
      hideMirroredShikenAnswerControl(originalPrevBtn);
    }

    if (originalNextBtn) {
      nav.appendChild(
        createShikenAnswerProxyButton({
          source: originalNextBtn,
          label: getShikenAnswerControlLabel(originalNextBtn) || "次のページ",
          fallback:
            typeof window.nextPage === "function"
              ? () => window.nextPage()
              : null,
          disabled:
            isUxControlDisabled(originalNextBtn) ||
            (navState ? !navState.canNext : false),
        }),
      );
      hideMirroredShikenAnswerControl(originalNextBtn);
    }

    actions.appendChild(nav);
  }

  if (originalCheckBtn || originalFinishBtn || canFinishFallback) {
    const primary = document.createElement("div");
    primary.className = "ux-answer-primary-actions";

    if (originalCheckBtn) {
      primary.appendChild(
        createShikenAnswerProxyButton({
          source: originalCheckBtn,
          label: getShikenAnswerControlLabel(originalCheckBtn) || "解答チェック",
        }),
      );
      hideMirroredShikenAnswerControl(originalCheckBtn);
    }

    if (originalFinishBtn || canFinishFallback) {
      const label = getShikenAnswerControlLabel(originalFinishBtn) || "終了";
      primary.appendChild(
        createShikenAnswerProxyButton({
          source: null,
          label,
          className: "ux-btn ux-danger",
          fallback: () => {
            if (!submitShikenAnswerGrade(form) && originalFinishBtn) {
              originalFinishBtn.click();
            }
          },
          disabled: isUxControlDisabled(originalFinishBtn),
          pendingLabel: isFinishConfirmation ? "終了中…" : "確認中…",
        }),
      );
      hideMirroredShikenAnswerControl(originalFinishBtn);
    }
    actions.appendChild(primary);
  }

  if (actions.children.length > 0) {
    form.appendChild(actions);
  }

  if (form.dataset.uxAnswerActionsObserved === "true") return;
  form.dataset.uxAnswerActionsObserved = "true";
  let refreshPending = false;
  const actionObserver = new MutationObserver((mutations) => {
    const hasSourceChange = mutations.some((mutation) => {
      const targetElement =
        mutation.target?.nodeType === Node.ELEMENT_NODE
          ? mutation.target
          : mutation.target?.parentElement;
      if (targetElement?.closest?.(".ux-answer-actions")) return false;
      if (mutation.type === "attributes" || mutation.type === "characterData") {
        return true;
      }
      return Array.from([
        ...mutation.addedNodes,
        ...mutation.removedNodes,
      ]).some(
        (node) =>
          node.nodeType !== Node.ELEMENT_NODE ||
          !node.classList.contains("ux-answer-actions"),
      );
    });
    if (!hasSourceChange || refreshPending) return;

    refreshPending = true;
    window.setTimeout(() => {
      refreshPending = false;
      if (!document.contains(form)) return;
      form.querySelector(".ux-answer-actions")?.remove();
      delete form.dataset.uxNavBuilt;
      buildShikenAnswerActionArea(form);
    }, 0);
  });
  safeObserveUxMutation(actionObserver, form, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
    attributeFilter: ["value", "disabled", "hidden", "style", "class"],
  });
}

function resolveShikenSelectVisibleCount(cb) {
  const defaultSelectVisibleCount = 12;
  try {
    chrome.storage.local.get(
      { shikenSelectVisibleCount: String(defaultSelectVisibleCount) },
      (items) => {
        let count = parseInt(items.shikenSelectVisibleCount, 10);
        if (Number.isNaN(count) || count < 0) {
          count = defaultSelectVisibleCount;
        }
        cb(count);
      },
    );
  } catch (e) {
    cb(defaultSelectVisibleCount);
  }
}

function getNextShikenSelectId(doc, prefix) {
  let index = 1;
  let id = `${prefix}-${index}`;
  while (doc.getElementById?.(id)) {
    index += 1;
    id = `${prefix}-${index}`;
  }
  return id;
}

function restoreShikenSelectAttribute(element, name, value) {
  if (!element) return;
  if (value === null) {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, value);
  }
}

function restoreShikenSelectRecord(record) {
  if (!record || record.restored) return;
  record.restored = true;

  const { select, wrap } = record;
  record.listeners?.forEach(({ type, listener }) => {
    select?.removeEventListener?.(type, listener);
  });

  if (select) {
    if (record.originalParent) {
      const nextSibling =
        record.originalNextSibling?.parentNode === record.originalParent
          ? record.originalNextSibling
          : null;
      record.originalParent.insertBefore(select, nextSibling);
    } else if (wrap?.parentNode) {
      wrap.parentNode.insertBefore(select, wrap);
    }

    if (!record.hadNativeClass) {
      select.classList.remove("ux-native-select");
    }
    restoreShikenSelectAttribute(
      select,
      "data-ux-select",
      record.originalUxSelect,
    );
    restoreShikenSelectAttribute(
      select,
      "tabindex",
      record.originalTabIndex,
    );
    restoreShikenSelectAttribute(
      select,
      "aria-hidden",
      record.originalAriaHidden,
    );
  }

  wrap?.remove();
}

function restoreShikenSelectState(state) {
  if (!state || state.restored) return;
  state.restored = true;
  state.cancelled = true;

  if (state.bound) {
    state.document.removeEventListener("click", state.onDocumentClick);
    state.window.removeEventListener("scroll", state.onScroll, true);
    state.window.removeEventListener("resize", state.onResize);
  }
  state.records.slice().reverse().forEach(restoreShikenSelectRecord);

  restoreShikenSelectAttribute(
    state.form,
    "data-ux-select-built",
    state.originalFormBuilt,
  );
  state.registry?.delete(state);
  if (state.registry?.size === 0) {
    delete state.document.__uxShikenSelectStates;
  }
}

function restoreShikenAnswerSelectControls(doc = document) {
  const states = doc.__uxShikenSelectStates;
  if (states?.forEach) {
    Array.from(states).forEach((state) => restoreShikenSelectState(state));
  }

  // Fallback for a partially-built custom select whose async setup was
  // interrupted before it could register a complete state object.
  doc.querySelectorAll?.(".ux-select-wrap").forEach((wrap) => {
    const state = wrap.__uxSelectState;
    if (state?.__uxRecord) {
      restoreShikenSelectRecord(state.__uxRecord);
    } else if (state?.select) {
      restoreShikenSelectRecord({
        select: state.select,
        wrap,
        originalParent: null,
        originalNextSibling: null,
        originalUxSelect: null,
        originalTabIndex: null,
        originalAriaHidden: null,
        hadNativeClass: false,
      });
    } else {
      wrap.remove();
    }
  });

  doc
    .querySelectorAll?.('select[data-ux-select="true"]')
    .forEach((select) => {
      select.classList.remove("ux-native-select");
      select.removeAttribute("data-ux-select");
      select.removeAttribute("tabindex");
      select.removeAttribute("aria-hidden");
    });
  doc
    .querySelectorAll?.('form[data-ux-select-built="true"]')
    .forEach((form) => form.removeAttribute("data-ux-select-built"));
}

function bindShikenSelectVisualRestoreListener() {
  if (globalThis.__uxShikenSelectVisualRestoreBound) return;
  if (
    typeof chrome === "undefined" ||
    !chrome.storage?.onChanged?.addListener
  ) {
    return;
  }
  globalThis.__uxShikenSelectVisualRestoreBound = true;
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (
        areaName === "local" &&
        changes.extensionVisualEnabled?.newValue === false
      ) {
        restoreShikenAnswerSelectControls(document);
      }
    });
  } catch {
    globalThis.__uxShikenSelectVisualRestoreBound = false;
  }
}

function enhanceShikenAnswerSelectControls(form) {
  if (!form || form.dataset.uxSelectBuilt === "true") return;
  bindShikenSelectVisualRestoreListener();
  const originalFormBuilt = form.getAttribute("data-ux-select-built");
  form.dataset.uxSelectBuilt = "true";
  const selects = Array.from(form.querySelectorAll("select")).filter(
    (select) => !select.multiple,
  );
  if (selects.length === 0) return;

  const registry =
    document.__uxShikenSelectStates ||
    (document.__uxShikenSelectStates = new Set());
  const state = {
    document,
    window,
    form,
    records: [],
    originalFormBuilt,
    bound: false,
    cancelled: false,
    restored: false,
    registry,
  };
  registry.add(state);

  const closeAll = (restoreFocus = false) => {
    document.querySelectorAll(".ux-select-wrap.ux-open").forEach((wrap) => {
      const selectState = wrap.__uxSelectState;
      if (selectState) {
        selectState.pendingIndex = selectState.select.selectedIndex;
        const committedText =
          selectState.select.options[selectState.pendingIndex]?.text || "";
        selectState.display.textContent = committedText;
        selectState.items.forEach((item, idx) => {
          if (idx === selectState.pendingIndex) {
            item.setAttribute("aria-selected", "true");
          } else {
            item.setAttribute("aria-selected", "false");
          }
        });
        selectState.display.setAttribute("aria-expanded", "false");
        selectState.list.setAttribute("aria-hidden", "true");
        selectState.display.removeAttribute("aria-activedescendant");
        if (restoreFocus) selectState.display.focus?.();
      }
      wrap.classList.remove("ux-open");
    });
  };

  resolveShikenSelectVisibleCount((visibleCount) => {
    if (state.cancelled) return;
    const itemHeight = 32;
    const listMaxHeight =
      visibleCount === 0 ? "none" : `${visibleCount * itemHeight}px`;

    selects.forEach((select) => {
      if (select.dataset.uxSelect === "true" || !select.parentNode) return;
      const originalParent = select.parentNode;
      const originalNextSibling = select.nextSibling;
      const record = {
        select,
        wrap: null,
        originalParent,
        originalNextSibling,
        originalUxSelect: select.getAttribute("data-ux-select"),
        originalTabIndex: select.getAttribute("tabindex"),
        originalAriaHidden: select.getAttribute("aria-hidden"),
        hadNativeClass: select.classList.contains("ux-native-select"),
        listeners: [],
      };
      state.records.push(record);
      select.dataset.uxSelect = "true";

      const wrap = document.createElement("div");
      wrap.className = "ux-select-wrap";

      const display = document.createElement("button");
      display.type = "button";
      display.className = "ux-select-display";
      display.id = getNextShikenSelectId(document, "ux-shiken-select-display");
      display.setAttribute("role", "combobox");
      display.setAttribute("aria-haspopup", "listbox");
      display.setAttribute("aria-expanded", "false");
      display.setAttribute("aria-autocomplete", "none");
      if (select.hasAttribute("aria-labelledby")) {
        display.setAttribute(
          "aria-labelledby",
          select.getAttribute("aria-labelledby"),
        );
      } else {
        display.setAttribute(
          "aria-label",
          select.getAttribute("aria-label") ||
            select.getAttribute("title") ||
            "選択",
        );
      }
      display.textContent = select.options[select.selectedIndex]?.text || "";
      display.style.fontSize = "var(--ux-select-display-font-size, 14px)";
      display.style.minHeight = "34px";

      const list = document.createElement("div");
      list.className = "ux-select-list";
      list.id = getNextShikenSelectId(document, "ux-shiken-select-list");
      list.setAttribute("role", "listbox");
      list.setAttribute("aria-labelledby", display.id);
      list.setAttribute("aria-hidden", "true");
      display.setAttribute("aria-controls", list.id);
      list.style.maxHeight = listMaxHeight;
      list.style.overflowY = visibleCount === 0 ? "visible" : "auto";

      const items = [];
      select.parentNode.insertBefore(wrap, select);
      wrap.appendChild(select);
      wrap.appendChild(display);
      wrap.appendChild(list);

      record.wrap = wrap;
      const selectState = {
        select,
        display,
        list,
        items,
        pendingIndex: select.selectedIndex,
      };
      wrap.__uxSelectState = selectState;
      selectState.__uxRecord = record;
      select.classList.add("ux-native-select");
      select.setAttribute("tabindex", "-1");
      select.setAttribute("aria-hidden", "true");

      // ドロップダウンは祖先の overflow (table.qstnoptions など) でクリップ
      // されないよう position:fixed にし、開くたびに表示ボタンの位置から
      // 座標と高さを計算する。下に空きが無ければ上方向に開く。
      const positionList = () => {
        const rect = display.getBoundingClientRect();
        const gap = 6;
        const vh = window.innerHeight;

        // ドロップダウンは回答カード (.ux-shiken-answer-card) の表示領域内に
        // 収め、採点ボタンのバー (.ux-answer-actions) には重ならないよう、
        // 上下の表示可能範囲 (clipTop〜clipBottom) を求める。スクロールしても
        // この範囲を超えないようにする。
        let clipTop = 0;
        let clipBottom = vh;
        const answerCard = wrap.closest(
          ".ux-shiken-answer-card, .ux-shiken-upload-answer-card",
        );
        if (answerCard) {
          const cr = answerCard.getBoundingClientRect();
          clipTop = Math.max(clipTop, cr.top);
          clipBottom = Math.min(clipBottom, cr.bottom);
        }
        document.querySelectorAll(".ux-answer-actions").forEach((bar) => {
          const br = bar.getBoundingClientRect();
          if (br.height > 0 && br.top > clipTop && br.top < clipBottom) {
            clipBottom = br.top;
          }
        });

        list.style.position = "fixed";
        list.style.left = `${Math.round(rect.left)}px`;
        list.style.right = "auto";
        list.style.width = `${Math.round(rect.width)}px`;

        // scrollHeight は maxHeight/overflow に関係なく内容全体の高さを返すため、
        // 高さ測定のために maxHeight を一時解除する必要はない。解除すると開いた
        // 状態でのスクロール位置がリセットされ、スクロールがガクつく原因になる。
        const contentHeight = list.scrollHeight;
        let desired = contentHeight;
        if (visibleCount !== 0) {
          desired = Math.min(desired, visibleCount * itemHeight);
        }

        // ドロップダウンは clipTop〜clipBottom の範囲を超えないようにする。
        const clipHeight = clipBottom - clipTop;
        const finalHeight = Math.min(desired, Math.max(80, clipHeight - 4));

        // 開く方向: 範囲内で下に収まれば下、無理で上に収まれば上、どちらも
        // 無理ならより広い側に開く。選択ボタンがスクロールで範囲外に出ても、
        // 最終的な上端/下端を範囲内へクランプして採点ボタンへの侵入を防ぐ。
        const fitsDown = rect.bottom + gap + finalHeight <= clipBottom;
        const fitsUp = rect.top - gap - finalHeight >= clipTop;
        let openUp;
        if (fitsDown) {
          openUp = false;
        } else if (fitsUp) {
          openUp = true;
        } else {
          openUp = rect.top - clipTop > clipBottom - rect.bottom;
        }

        let listTop = openUp
          ? rect.top - gap - finalHeight
          : rect.bottom + gap;
        listTop = Math.max(clipTop, Math.min(listTop, clipBottom - finalHeight));

        list.style.maxHeight = `${finalHeight}px`;
        list.style.overflowY = "auto";
        list.style.bottom = "auto";
        list.style.top = `${Math.round(listTop)}px`;
      };
      selectState.positionList = positionList;

      const setOpen = (open, restoreFocus = false) => {
        wrap.classList.toggle("ux-open", open);
        display.setAttribute("aria-expanded", String(open));
        list.setAttribute("aria-hidden", String(!open));
        if (open) {
          positionList();
          const activeItem = selectState.items[selectState.pendingIndex];
          if (activeItem?.id) {
            display.setAttribute("aria-activedescendant", activeItem.id);
          }
        } else {
          display.removeAttribute("aria-activedescendant");
          if (restoreFocus) display.focus?.();
        }
      };
      selectState.setOpen = setOpen;

      const updatePending = (newIndex) => {
        if (newIndex < 0 || newIndex >= select.options.length) return;
        selectState.pendingIndex = newIndex;
        const nextText = select.options[newIndex]?.text || "";
        display.textContent = nextText;
        selectState.items.forEach((item, idx) => {
          if (idx === newIndex) {
            item.setAttribute("aria-selected", "true");
            item.scrollIntoView({ block: "nearest" });
          } else {
            item.setAttribute("aria-selected", "false");
          }
        });
        const activeItem = selectState.items[newIndex];
        if (activeItem?.id && wrap.classList.contains("ux-open")) {
          display.setAttribute("aria-activedescendant", activeItem.id);
        }
      };

      const commitIndex = (idx) => {
        if (idx < 0 || idx >= select.options.length) return;
        const opt = select.options[idx];
        if (!opt || opt.disabled) return;
        updatePending(idx);
        select.selectedIndex = idx;
        select.value = opt.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
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

      const findEdgeEnabled = (fromEnd) => {
        const start = fromEnd ? select.options.length - 1 : 0;
        const step = fromEnd ? -1 : 1;
        for (
          let index = start;
          index >= 0 && index < select.options.length;
          index += step
        ) {
          if (!select.options[index].disabled) return index;
        }
        return select.selectedIndex;
      };

      Array.from(select.options).forEach((opt, idx) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "ux-select-option";
        item.id = getNextShikenSelectId(document, "ux-shiken-select-option");
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", opt.selected ? "true" : "false");
        item.tabIndex = -1;
        item.textContent = opt.text;
        item.style.fontSize = "var(--ux-select-option-font-size, 14px)";
        item.style.minHeight = "34px";
        item.style.lineHeight = "1.25";
        if (opt.disabled) {
          item.disabled = true;
          item.setAttribute("aria-disabled", "true");
          item.style.opacity = "0.5";
        }
        item.addEventListener("click", (e) => {
          e.preventDefault();
          if (opt.disabled) return;
          commitIndex(idx);
          setOpen(false, true);
        });
        list.appendChild(item);
        items.push(item);
      });

      const syncFromNative = () => {
        updatePending(select.selectedIndex);
        if (!wrap.classList.contains("ux-open")) {
          display.setAttribute("aria-expanded", "false");
        }
      };
      ["input", "change"].forEach((type) => {
        select.addEventListener(type, syncFromNative);
        record.listeners.push({ type, listener: syncFromNative });
      });

      display.addEventListener("click", (e) => {
        e.preventDefault();
        const isOpen = wrap.classList.contains("ux-open");
        if (isOpen) {
          commitIndex(selectState.pendingIndex);
          setOpen(false, true);
        } else {
          closeAll();
          selectState.pendingIndex = select.selectedIndex;
          updatePending(selectState.pendingIndex);
          setOpen(true);
        }
      });

      display.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          if (!wrap.classList.contains("ux-open")) {
            closeAll();
            setOpen(true);
          }
          const step = e.key === "ArrowDown" ? 1 : -1;
          updatePending(findNextEnabled(selectState.pendingIndex, step));
        } else if (e.key === "Home" || e.key === "End") {
          e.preventDefault();
          if (!wrap.classList.contains("ux-open")) {
            closeAll();
            setOpen(true);
          }
          updatePending(findEdgeEnabled(e.key === "End"));
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!wrap.classList.contains("ux-open")) {
            closeAll();
            selectState.pendingIndex = select.selectedIndex;
            updatePending(selectState.pendingIndex);
            setOpen(true);
          } else {
            commitIndex(selectState.pendingIndex);
            setOpen(false, true);
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          updatePending(select.selectedIndex);
          setOpen(false, true);
        }
      });

      display.addEventListener(
        "wheel",
        (e) => {
          if (!wrap.classList.contains("ux-open")) return;
          e.preventDefault();
          const step = e.deltaY > 0 ? 1 : -1;
          updatePending(findNextEnabled(selectState.pendingIndex, step));
        },
        { passive: false },
      );
    });
  });

  // position:fixed のドロップダウンはスクロールに追従しないため、
  // 開いている間はスクロール/リサイズで座標を再計算する。
  const repositionOpen = (e) => {
    // リスト内部のスクロールでは再配置しない（再配置するとスクロール位置が
    // 揺れてガクつくため）。ページ/フレーム側のスクロール時のみ追従する。
    if (e && e.target && e.target.closest && e.target.closest(".ux-select-list"))
      return;
    const openWrap = document.querySelector(".ux-select-wrap.ux-open");
    const selectState = openWrap && openWrap.__uxSelectState;
    if (selectState && selectState.positionList) selectState.positionList();
  };
  state.onDocumentClick = (e) => {
    if (!e.target?.closest?.(".ux-select-wrap")) {
      closeAll();
    }
  };
  state.onScroll = repositionOpen;
  state.onResize = repositionOpen;
  document.addEventListener("click", state.onDocumentClick);
  window.addEventListener("scroll", state.onScroll, true);
  window.addEventListener("resize", state.onResize);
  state.bound = true;
}

function prepareShikenAnswerSurface(form) {
  if (!form || form.dataset.uxAnswerPrepared === "true")
    return getShikenAnswerSurfaceProfile(form);
  form.dataset.uxAnswerPrepared = "true";

  const profile = getShikenAnswerSurfaceProfile(form);
  document.body.classList.toggle(
    "ux-shiken-answer-card-page",
    profile.hasAnswerControl,
  );
  document.body.classList.toggle(
    "ux-shiken-upload-answer-page",
    profile.hasFile,
  );
  document.body.classList.toggle(
    "ux-shiken-text-answer-page",
    profile.hasTextarea || profile.hasTextInput,
  );
  document.body.classList.toggle(
    "ux-shiken-select-answer-page",
    profile.hasSelect,
  );
  form.classList.toggle("ux-shiken-answer-form", profile.hasAnswerControl);
  form.classList.toggle("ux-shiken-upload-answer-form", profile.hasFile);

  if (profile.hasAnswerControl) {
    setUploadAnswerFramesetRows();
  }

  profile.textareas.forEach((textarea) => {
    textarea.classList.add("ux-shiken-textarea");
    if (
      !textarea.hasAttribute("aria-label") &&
      !textarea.hasAttribute("aria-labelledby")
    ) {
      textarea.setAttribute("aria-label", "回答内容");
    }
    if (!textarea.name) {
      textarea.name = "answer";
    }
  });

  if (
    profile.hasAnswerControl &&
    !form.querySelector(".ux-shiken-answer-heading")
  ) {
    const heading = document.createElement("div");
    heading.className = "ux-shiken-answer-heading";
    heading.textContent = "回答";
    form.insertBefore(
      heading,
      getShikenAnswerSurfaceAnchor(form, profile) || form.firstChild,
    );
  }

  Array.from(
    form.querySelectorAll('button, input[type="button"], input[type="submit"]'),
  ).forEach((button) => {
    const label = getShikenAnswerControlLabel(button);
    if (label.includes("回答を保存")) {
      button.classList.add("ux-save-answer-button");
      if (!button.hasAttribute("aria-label")) {
        button.setAttribute("aria-label", "回答を保存");
      }
      const buttonParent = button.parentElement;
      if (buttonParent && buttonParent !== form) {
        buttonParent.classList.add("ux-save-answer-row");
      }
    }
  });

  if (profile.hasAnswerControl) {
    const answerCard = wrapShikenAnswerSurfaceContent(form);
    if (answerCard) {
      answerCard.tabIndex = 0;
      answerCard.setAttribute("role", "region");
      answerCard.setAttribute(
        "aria-label",
        profile.hasFile ? "回答ファイル" : "回答欄",
      );
      if (isShikenSinglePageActive()) {
        attachShikenFrameResizeHandle(answerCard, {
          frameName: "answer",
          label: profile.hasFile ? "回答ファイルフィールド" : "回答フィールド",
        });
      }
    }
  }

  return profile;
}

function bindShikenAnswerSaveStatus(form) {
  if (!form || form.dataset.uxSaveStatusPrepared === "true") return;
  form.dataset.uxSaveStatusPrepared = "true";

  const saveButton = form.querySelector(".ux-save-answer-button");
  let saveStatus = form.querySelector(".ux-answer-save-status");
  if (saveButton && !saveStatus) {
    saveStatus = document.createElement("span");
    saveStatus.className = "ux-answer-save-status";
    saveStatus.setAttribute("role", "status");
    saveStatus.setAttribute("aria-live", "polite");
    saveStatus.appendChild(createShikenAnswerSaveCheck(document));
    const statusText = document.createElement("span");
    statusText.className = "ux-answer-save-status-text";
    saveStatus.appendChild(statusText);
    saveButton.insertAdjacentElement("beforebegin", saveStatus);
  }

  let saveStatusTimer = 0;
  const setSaveStatus = (state, timestamp = Date.now()) => {
    if (!saveStatus) return;
    const text = saveStatus.querySelector(".ux-answer-save-status-text");
    if (saveStatusTimer) {
      window.clearTimeout(saveStatusTimer);
      saveStatusTimer = 0;
    }
    saveStatus.classList.toggle(
      "is-visible",
      state === "saving" || state === "saved" || state === "last-saved",
    );
    saveStatus.classList.toggle("is-saving", state === "saving");
    saveStatus.classList.toggle("is-last-saved", state === "last-saved");
    if (text) {
      text.textContent =
        state === "saving"
          ? "保存中..."
          : state === "saved"
            ? "保存しました"
            : state === "last-saved"
              ? `最終保存 ${formatShikenAnswerSaveTime(timestamp)}`
              : "";
    }
    if (state === "saved") {
      saveStatusTimer = window.setTimeout(() => {
        setSaveStatus("last-saved", timestamp);
      }, 5000);
    }
  };

  if (saveButton && saveButton.dataset.uxSaveStatusBound !== "true") {
    saveButton.dataset.uxSaveStatusBound = "true";
    saveButton.addEventListener(
      "click",
      () => {
        markShikenAnswerSavePending();
        setSaveStatus("saving");
        window.setTimeout(() => {
          if (!document.contains(saveButton)) return;
          const savedAt = consumeShikenAnswerSavePending();
          if (!savedAt) return;
          setSaveStatus("saved", savedAt);
        }, 1800);
      },
      true,
    );
  }

  const savedAt = consumeShikenAnswerSavePending();
  if (savedAt) {
    setSaveStatus("saved", savedAt);
  }

  const answerControls = form.querySelectorAll(
    'textarea, select, input[type="file"], input[type="text"], input:not([type])',
  );
  answerControls.forEach((control) => {
    control.addEventListener("input", () => setSaveStatus("idle"), {
      once: true,
    });
    control.addEventListener("change", () => setSaveStatus("idle"), {
      once: true,
    });
  });
}

function enhanceOneByOneShikenFrameset() {
  log("Enhancing one-by-one shiken frameset");
  rememberUxOriginalFrameStructure(document);
  rememberUxOriginalShikenFrameStructure(document);

  bindShikenLayoutMessageListener();
  const currentLayoutMode = resolveInitialShikenLayoutMode(document);
  if (currentLayoutMode === UX_SHIKEN_LAYOUT_HORIZONTAL) {
    if (applySinglePageOneByOneShikenLayout(document)) {
      document.documentElement.dataset.uxShikenLayoutMode =
        UX_SHIKEN_LAYOUT_HORIZONTAL;
      syncShikenLayoutClasses(document, UX_SHIKEN_LAYOUT_HORIZONTAL);
      return;
    }
  }

  if (currentLayoutMode === UX_SHIKEN_LAYOUT_VERTICAL) {
    if (applyVerticalOneByOneShikenLayout(document)) {
      document.documentElement.dataset.uxShikenLayoutMode =
        UX_SHIKEN_LAYOUT_VERTICAL;
      bindShikenVerticalResizePersistence(document);
      syncShikenLayoutClasses(document, UX_SHIKEN_LAYOUT_VERTICAL);
      syncShikenLayoutToggleControls(document, UX_SHIKEN_LAYOUT_VERTICAL);
      return;
    }
  }

  const outerFrameset = document.querySelector("frameset[rows]");
  const mainFrameset = Array.from(
    document.querySelectorAll("frameset[cols]"),
  ).find((frameset) => {
    return !!getDirectChildFrame(frameset, "button");
  });

  if (
    !outerFrameset ||
    !mainFrameset ||
    outerFrameset.getAttribute("data-ux-onebyone-shiken") === "true"
  ) {
    return;
  }

  const contentRows = getDirectChildFrameset(mainFrameset, "rows", [
    "question",
  ]);
  const answerCols = getDirectChildFrameset(contentRows, "cols", [
    "answer",
    "description",
  ]);

  outerFrameset.setAttribute("data-ux-onebyone-shiken", "true");
  outerFrameset.setAttribute("rows", "0,*");
  outerFrameset.setAttribute("border", "0");
  outerFrameset.setAttribute("frameborder", "0");
  outerFrameset.setAttribute("framespacing", "0");

  mainFrameset.setAttribute("cols", "280,*");
  mainFrameset.setAttribute("border", "0");
  mainFrameset.setAttribute("frameborder", "0");
  mainFrameset.setAttribute("framespacing", "0");

  if (contentRows) {
    contentRows.setAttribute("rows", "220,*");
    contentRows.setAttribute("border", "0");
    contentRows.setAttribute("frameborder", "0");
    contentRows.setAttribute("framespacing", "0");
  }

  if (answerCols) {
    answerCols.dataset.uxDescriptionVisibleCols = "390,*";
    answerCols.setAttribute("cols", "*,0");
    answerCols.setAttribute("border", "0");
    answerCols.setAttribute("frameborder", "0");
    answerCols.setAttribute("framespacing", "0");
  }

  ["button", "question", "answer", "description"].forEach((name) => {
    const frame = document.querySelector(`frame[name="${name}"]`);
    if (!frame) return;
    frame.setAttribute("noresize", "");
    frame.setAttribute("scrolling", "auto");
  });
}

function ensureOneByOneShikenButtonActions() {
  const form = document.querySelector('form[name="button_form"]');
  if (!form || form.dataset.uxOneByOneButtonActionsBuilt === "true") return;

  const findControl = (patterns, selectors = []) =>
    findShikenAnswerActionControl(patterns, selectors, form);
  const prev = findControl(
    [/^前の(?:ページ|問題)$/, /^戻る$/],
    ['#QstnPrevBtn', 'input[name="pre"]', 'button[name="pre"]'],
  );
  const next = findControl(
    [/^次の(?:ページ|問題)(?:へ進む)?$/],
    ['#QstnNextBtn', 'input[name="next"]', 'button[name="next"]'],
  );
  const grade = findControl(
    [/^(終了|採点|提出|送信|完了)(する)?$/, /(終了|提出|採点)$/],
    [
      '#GradeBtn',
      'input[name="grade"]',
      'button[name="grade"]',
      'button[onclick*="gradeAndClose"]',
      'input[onclick*="gradeAndClose"]',
    ],
  );
  if (!prev && !next && !grade) return;

  form.dataset.uxOneByOneButtonActionsBuilt = "true";
  form.classList.add("ux-onebyone-button-form-visible");
  const actions = document.createElement("div");
  actions.className = "ux-onebyone-button-actions";

  const nav = document.createElement("div");
  nav.className = "ux-shiken-nav-row";
  if (prev) {
    nav.appendChild(
      createShikenAnswerProxyButton({
        source: prev,
        label: getShikenAnswerControlLabel(prev) || "前の問題",
      }),
    );
    hideMirroredShikenAnswerControl(prev);
  }
  if (next) {
    nav.appendChild(
      createShikenAnswerProxyButton({
        source: next,
        label: getShikenAnswerControlLabel(next) || "次の問題へ進む",
      }),
    );
    hideMirroredShikenAnswerControl(next);
  }
  if (nav.children.length) actions.appendChild(nav);

  if (grade) {
    const primary = document.createElement("div");
    primary.className = "ux-shiken-action-row";
    primary.appendChild(
      createShikenAnswerProxyButton({
        source: grade,
        label: getShikenAnswerControlLabel(grade) || "採点",
        className: "ux-btn ux-danger",
      }),
    );
    hideMirroredShikenAnswerControl(grade);
    actions.appendChild(primary);
  }

  form.appendChild(actions);
}

function enhanceOneByOneShikenButtonFrame() {
  ensureCourseColorTokens(document);
  enableUxAutoOverflowScrolling(document);
  ensureUxFrameActionButtonFit(document);
  syncCurrentFrameShikenLayoutClassFromParent();
  document.documentElement.classList.toggle(
    "ux-shiken-single-page-frame",
    isShikenSinglePageActive(),
  );
  bindSinglePageShikenChildBridge(document);
  hideOneByOneButtonFrameCheckControls(document);

  if (isOneByOneQuestionListFrame()) {
    enhanceOneByOneQuestionListFrame();
    return;
  }

  if (document.getElementById("ux-onebyone-button-style")) {
    ensureShikenLayoutToggleControl();
    ensureOneByOneShikenButtonActions();
    return;
  }

  const style = document.createElement("style");
  style.id = "ux-onebyone-button-style";
  style.textContent = `
        html, body {
            height: 100%;
            margin: 0;
            background: var(--ux-color-page);
        }
        body {
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            padding: 8px;
            color: var(--ux-color-text);
            font-family: 'Noto Sans JP', 'Yu Gothic', 'Meiryo', 'Hiragino Sans', 'Segoe UI', sans-serif;
            -webkit-font-smoothing: antialiased;
            overflow: auto;
        }
        #top {
            flex: 1 1 auto;
            height: 100%;
            min-height: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
            box-sizing: border-box;
        }
        #top > * {
            flex: 0 0 auto;
        }
        .ux-shiken-layout-toggle {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 34px 34px 34px;
            align-items: center;
            gap: 4px;
            width: 100%;
            min-height: 38px;
            margin: 0;
            padding: 4px;
            border: 1px solid var(--ux-color-border);
            border-radius: 10px;
            background: var(--ux-color-surface);
            box-sizing: border-box;
        }
        .ux-shiken-layout-toggle-label {
            min-width: 0;
            padding: 0 6px;
            overflow: hidden;
            color: var(--ux-color-muted);
            font-size: 12px;
            font-weight: 700;
            line-height: 1.2;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .ux-shiken-layout-toggle button {
            min-width: 0;
            width: 100%;
            min-height: 28px;
            padding: 0;
            border: 1px solid var(--ux-color-border);
            border-radius: 8px;
            background: var(--ux-color-surface-subtle);
            color: var(--ux-color-muted);
            box-sizing: border-box;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        }
        .ux-shiken-layout-toggle button svg {
            width: 17px;
            height: 17px;
            pointer-events: none;
        }
        .ux-shiken-layout-toggle button:hover {
            background: var(--ux-color-surface-subtle);
            border-color: var(--ux-color-border-hover, #B1BEC6);
            color: var(--ux-color-text);
        }
        .ux-shiken-layout-toggle button.is-active {
            border-color: var(--ux-color-accent);
            background: var(--ux-color-info-surface);
            color: var(--ux-color-accent-active);
        }
        #WsTitle {
            margin: 0;
            padding: 0 0 6px;
            border-bottom: 1px solid var(--ux-color-border);
            background-color: var(--ux-color-page) !important;
        }
        #WsTitle h1,
        #WsTitle h2 {
            margin: 0;
            padding: 0;
            word-break: break-word;
            overflow-wrap: anywhere;
            letter-spacing: 0;
        }
        #WsTitle h1 {
            display: block !important;
            color: var(--ux-color-muted) !important;
            font-size: 11px;
            font-weight: 500;
            line-height: 1.35;
        }
        #WsTitle h1 *,
        #WsTitle h2 * {
            color: inherit !important;
        }
        #WsTitle h2 {
            margin-top: 3px;
            color: var(--ux-color-text) !important;
            font-size: 15px;
            font-weight: 700;
            line-height: 1.3;
        }
        #User,
        .User,
        div[id*="User"] {
            margin: 0;
            color: var(--ux-color-muted);
            font-size: 12px;
            line-height: 1.4;
            text-align: right;
        }
        form[name="button_form"] {
            display: none !important;
        }
        form[name="button_form"].ux-onebyone-button-form-visible {
            display: flex !important;
            flex-direction: column;
            gap: 8px;
            margin-top: auto;
        }
        .ux-onebyone-button-actions {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        form[name="button_form"] button,
        form[name="button_form"] input[type="button"] {
            width: 100%;
            min-height: 36px;
            box-sizing: border-box;
            border: 1px solid var(--ux-color-border);
            border-radius: 10px;
            background: var(--ux-color-surface);
            color: var(--ux-color-accent-active);
            font-size: 13px;
            font-weight: 700;
            font-family: inherit;
            line-height: 1.2;
            cursor: pointer;
        }
        .ux-source-action-hidden {
            display: none !important;
        }
        form[name="button_form"] button:hover,
        form[name="button_form"] input[type="button"]:hover {
            background: var(--ux-color-surface);
            border-color: var(--ux-color-border-hover, #B1BEC6);
            color: var(--ux-color-text);
        }
        form[name="button_form"] button[name="grade"],
        form[name="button_form"] input[name="grade"] {
            background: var(--ux-color-danger);
            border-color: var(--ux-color-danger);
            color: var(--ux-color-surface);
        }
        form[name="button_form"] button[name="grade"]:hover,
        form[name="button_form"] input[name="grade"]:hover {
            background: var(--ux-color-danger);
            border-color: var(--ux-color-danger);
        }
        .limitInfo {
            margin: 0 !important;
            min-height: 32px;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 5px 10px !important;
            border: 1px solid var(--ux-color-border);
            border-radius: 10px;
            background: var(--ux-color-surface);
            color: var(--ux-color-muted);
            font-size: 12px;
            line-height: 1.35;
            text-align: center;
        }
        #TOC {
            flex: 1 1 auto;
            min-height: 0;
            display: block;
            padding: 0 !important;
            margin: 0 !important;
            background-color: var(--ux-color-page) !important;
        }
        #TOCContent {
            display: block !important;
            width: 100% !important;
            height: 100% !important;
            min-height: 0;
            border: 1px solid var(--ux-color-border) !important;
            border-radius: 6px;
            background: var(--ux-color-surface);
        }
        hr,
        br + br {
            display: none;
        }
    `;
  document.head.appendChild(style);

  // 横3レイアウトではボタンフレームが iframe 化されるため、通常試験と同じ
  // レイアウト切替コントロールをこのフレームにも配置する。
  ensureShikenLayoutToggleControl();
  ensureOneByOneShikenButtonActions();

  const top = document.getElementById("top");
  const limitInfo = document.querySelector(".limitInfo");
  const toc = document.getElementById("TOC");

  if (top) {
    top.querySelectorAll("hr, br").forEach((node) => node.remove());
    Array.from(top.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === "") {
        node.remove();
      }
    });
  }

  if (
    top &&
    limitInfo &&
    toc &&
    limitInfo.parentElement === top &&
    toc.previousElementSibling !== limitInfo
  ) {
    top.insertBefore(toc, limitInfo.nextSibling);
  }

  const tocIframe = document.getElementById("TOCContent");
  if (tocIframe) {
    const inject = () => {
      try {
        const tocDoc =
          tocIframe.contentDocument || tocIframe.contentWindow?.document;
        if (tocDoc) enhanceOneByOneQuestionListFrame(tocDoc);
      } catch (e) {
        log("Could not style one-by-one TOC frame:", e?.message || e);
      }
    };
    tocIframe.addEventListener("load", inject);
    inject();
  }
}
