// home/todo-controls.js
// ToDo sorting, title scrolling, and deadline input controls.

function getTodoStartDate(todo) {
    const startDateText = typeof todo?.startDate === 'string' ? todo.startDate.trim() : '';
    if (!startDateText) return null;
    const startDate = new Date(startDateText);
    return Number.isNaN(startDate.getTime()) ? null : startDate;
}

function isTodoNotYetStarted(todo, now = getWebClassNow()) {
    const startDate = getTodoStartDate(todo);
    return startDate instanceof Date && startDate > now;
}

function getTodoPriority(todo) {
    if (todo.isCompleted) return 'Done';
    if (isTodoNotYetStarted(todo)) return 'Low';
    const now = getWebClassNow();
    const deadline = todo.deadline && todo.deadline !== '期限なし' ? new Date(todo.deadline) : null;
    if (!deadline || isNaN(deadline.getTime())) return 'Low';
    if (deadline < now) return 'High';
    const hours = (deadline - now) / (1000 * 60 * 60);
    if (hours <= 48) return 'High';
    if (hours <= 168) return 'Medium';
    return 'Low';
}

function sortTodos(todos) {
    return todos.sort((a, b) => {
        // 1. 未完了を上に
        if (a.isCompleted !== b.isCompleted) {
            return a.isCompleted ? 1 : -1;
        }

        // 2. リマインダー期限切れ（紫）を最優先（赤よりも上）
        if (a._isReminderExpired !== b._isReminderExpired) {
            return a._isReminderExpired ? -1 : 1;
        }

        // 3. 期限が近い順 (期限なしは後ろ)
        const dateA = a.deadline ? new Date(a.deadline) : new Date(8640000000000000);
        const dateB = b.deadline ? new Date(b.deadline) : new Date(8640000000000000);

        if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
        if (isNaN(dateA.getTime())) return 1;
        if (isNaN(dateB.getTime())) return -1;

        return dateA - dateB;
    });
}

let uxActiveDatetimePopover = null;
let uxActiveDatetimeAnchor = null;
let uxActiveDatetimeCleanup = null;
let uxActiveDatetimeOnClose = null;
var uxTodoTitleAutoScrollCleanups = [];
const UX_TODO_TITLE_SCROLL_START_DELAY_MS = 500;
const UX_TODO_TITLE_SCROLL_LOOP_PAUSE_MS = 1000;
const UX_TODO_TITLE_SCROLL_SPEED_PX_PER_SEC = 42;
const UX_TODO_TITLE_SCROLL_MIN_DURATION_MS = 2600;
const UX_TODO_TITLE_SCROLL_LOOP_GAP_PX = 28;

function closeDatetimePopover() {
    const onClose = uxActiveDatetimeOnClose;
    uxActiveDatetimeOnClose = null;
    if (uxActiveDatetimeCleanup) {
        uxActiveDatetimeCleanup();
    }
    if (uxActiveDatetimePopover && uxActiveDatetimePopover.remove) {
        uxActiveDatetimePopover.remove();
    }
    uxActiveDatetimePopover = null;
    uxActiveDatetimeAnchor = null;
    uxActiveDatetimeCleanup = null;
    if (typeof onClose === 'function') {
        onClose();
    }
}

function cleanupTodoTitleAutoScroll() {
    if (!Array.isArray(uxTodoTitleAutoScrollCleanups) || uxTodoTitleAutoScrollCleanups.length === 0) {
        return;
    }
    uxTodoTitleAutoScrollCleanups.forEach((cleanup) => {
        if (typeof cleanup === 'function') {
            cleanup();
        }
    });
    uxTodoTitleAutoScrollCleanups = [];
}

function attachTodoTitleAutoScroll(inputEl) {
    if (!(inputEl instanceof HTMLInputElement)) return null;

    let rafId = null;
    let startTimer = null;
    let pauseTimer = null;
    let setupRafId = null;
    let lastTime = 0;
    let currentOffset = 0;
    let loopDistance = 0;
    let loopDurationMs = UX_TODO_TITLE_SCROLL_MIN_DURATION_MS;
    let wrapperEl = null;
    let overlayEl = null;
    let trackEl = null;
    let firstTextEl = null;
    let secondTextEl = null;

    const parsePx = (value) => {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const measureTextWidth = (sourceText = null) => {
        const text = typeof sourceText === 'string' ? sourceText : (inputEl.value || '');
        if (!text) return 0;
        const style = window.getComputedStyle(inputEl);
        if (!style) return 0;
        // Shared canvas to avoid creating extra nodes for every title input.
        const sharedCanvas = attachTodoTitleAutoScroll.__measureCanvas
            || (attachTodoTitleAutoScroll.__measureCanvas = document.createElement('canvas'));
        const ctx = sharedCanvas.getContext('2d');
        if (!ctx) return 0;
        const fontStyle = style.fontStyle || 'normal';
        const fontVariant = style.fontVariant || 'normal';
        const fontWeight = style.fontWeight || '400';
        const fontSize = style.fontSize || '16px';
        const fontFamily = style.fontFamily || 'sans-serif';
        ctx.font = `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize} ${fontFamily}`;
        let width = ctx.measureText(text).width;
        const letterSpacing = parsePx(style.letterSpacing);
        if (letterSpacing) {
            width += letterSpacing * Math.max(0, text.length - 1);
        }
        return width;
    };

    const getTitleMetrics = () => {
        const domMax = Math.max(0, inputEl.scrollWidth - inputEl.clientWidth);
        const style = window.getComputedStyle(inputEl);
        const horizontalPadding = parsePx(style.paddingLeft) + parsePx(style.paddingRight);
        const visibleTextWidth = Math.max(0, inputEl.clientWidth - horizontalPadding);
        const textWidth = Math.ceil(measureTextWidth());
        const measuredMax = Math.max(0, textWidth - visibleTextWidth);
        return {
            domMax,
            horizontalPadding,
            visibleTextWidth,
            textWidth,
            maxScroll: Math.max(domMax, measuredMax)
        };
    };

    const applyOffset = (offset) => {
        const max = Math.max(0, loopDistance);
        const clamped = Math.max(0, Math.min(offset, max));
        currentOffset = clamped;
        if (trackEl) {
            trackEl.style.transform = `translateX(${-clamped}px)`;
        }
        return clamped;
    };

    const clearTimers = () => {
        if (startTimer !== null) {
            window.clearTimeout(startTimer);
            startTimer = null;
        }
        if (pauseTimer !== null) {
            window.clearTimeout(pauseTimer);
            pauseTimer = null;
        }
    };

    const stop = (resetScroll = false) => {
        clearTimers();
        if (rafId !== null) {
            window.cancelAnimationFrame(rafId);
            rafId = null;
        }
        lastTime = 0;
        if (resetScroll) {
            applyOffset(0);
            inputEl.scrollLeft = 0;
        }
    };

    const isRunnable = () => (
        document.body.contains(inputEl) &&
        document.visibilityState === 'visible' &&
        document.activeElement !== inputEl
    );

    const ensureMarqueeElements = () => {
        if (wrapperEl && wrapperEl.contains(inputEl) && overlayEl && trackEl) {
            return true;
        }

        const parent = inputEl.parentElement;
        if (!parent) return false;

        wrapperEl = document.createElement('div');
        wrapperEl.className = 'ux-todo-title-marquee-wrap';
        parent.insertBefore(wrapperEl, inputEl);
        wrapperEl.appendChild(inputEl);

        overlayEl = document.createElement('div');
        overlayEl.className = 'ux-todo-title-marquee';

        trackEl = document.createElement('div');
        trackEl.className = 'ux-todo-title-marquee-track';

        firstTextEl = document.createElement('span');
        firstTextEl.className = 'ux-todo-title-marquee-unit';
        secondTextEl = document.createElement('span');
        secondTextEl.className = 'ux-todo-title-marquee-unit';

        trackEl.appendChild(firstTextEl);
        trackEl.appendChild(secondTextEl);
        overlayEl.appendChild(trackEl);
        wrapperEl.appendChild(overlayEl);
        inputEl.classList.add('ux-todo-title-marquee-source');
        return true;
    };

    const syncMarqueeStyle = (gapPx) => {
        if (!overlayEl || !trackEl) return;
        const wasMarquee = !!(wrapperEl && wrapperEl.classList.contains('is-marquee'));
        if (wasMarquee) {
            wrapperEl.classList.remove('is-marquee');
        }
        const style = window.getComputedStyle(inputEl);
        overlayEl.style.fontStyle = style.fontStyle;
        overlayEl.style.fontVariant = style.fontVariant;
        overlayEl.style.fontWeight = style.fontWeight;
        overlayEl.style.fontSize = style.fontSize;
        overlayEl.style.fontFamily = style.fontFamily;
        overlayEl.style.lineHeight = style.lineHeight;
        overlayEl.style.letterSpacing = style.letterSpacing;
        overlayEl.style.textTransform = style.textTransform;
        overlayEl.style.textDecoration = style.textDecoration;
        overlayEl.style.color = style.color;
        overlayEl.style.paddingTop = style.paddingTop;
        overlayEl.style.paddingRight = style.paddingRight;
        overlayEl.style.paddingBottom = style.paddingBottom;
        overlayEl.style.paddingLeft = style.paddingLeft;
        overlayEl.style.borderRadius = style.borderRadius;
        trackEl.style.gap = `${gapPx}px`;
        if (wasMarquee) {
            wrapperEl.classList.add('is-marquee');
        }
    };

    const disableMarquee = () => {
        if (wrapperEl) {
            wrapperEl.classList.remove('is-marquee');
        }
        applyOffset(0);
        inputEl.scrollLeft = 0;
    };

    const prepareMarquee = () => {
        if (!ensureMarqueeElements()) return false;

        const text = inputEl.value || '';
        if (firstTextEl) firstTextEl.textContent = text;
        if (secondTextEl) secondTextEl.textContent = text;

        const metrics = getTitleMetrics();
        if (!text || metrics.visibleTextWidth <= 0 || metrics.maxScroll <= 1) {
            disableMarquee();
            return false;
        }

        const gapPx = Math.max(
            UX_TODO_TITLE_SCROLL_LOOP_GAP_PX,
            Math.min(56, Math.round(metrics.visibleTextWidth * 0.18))
        );
        syncMarqueeStyle(gapPx);
        const renderedTextWidth = firstTextEl
            ? Math.ceil(firstTextEl.getBoundingClientRect().width)
            : metrics.textWidth;
        loopDistance = Math.max(1, renderedTextWidth + gapPx);
        loopDurationMs = Math.max(
            UX_TODO_TITLE_SCROLL_MIN_DURATION_MS,
            (loopDistance / UX_TODO_TITLE_SCROLL_SPEED_PX_PER_SEC) * 1000
        );
        wrapperEl.classList.add('is-marquee');
        return true;
    };

    const queueNextFrame = () => {
        rafId = window.requestAnimationFrame(step);
    };

    const step = (timestamp) => {
        if (!isRunnable()) {
            stop(false);
            return;
        }

        if (!prepareMarquee()) {
            stop(true);
            return;
        }

        if (!lastTime) {
            lastTime = timestamp;
            queueNextFrame();
            return;
        }
        const elapsed = Math.max(0, timestamp - lastTime);
        lastTime = timestamp;
        if (elapsed <= 0) {
            queueNextFrame();
            return;
        }
        const deltaPx = (elapsed / Math.max(1, loopDurationMs)) * loopDistance;
        const nextScroll = currentOffset + deltaPx;

        if (nextScroll >= loopDistance) {
            applyOffset(loopDistance);
            rafId = null;
            pauseTimer = window.setTimeout(() => {
                pauseTimer = null;
                if (!isRunnable()) return;
                if (!prepareMarquee()) {
                    stop(true);
                    return;
                }
                applyOffset(0);
                lastTime = 0;
                queueNextFrame();
            }, UX_TODO_TITLE_SCROLL_LOOP_PAUSE_MS);
            return;
        }

        applyOffset(nextScroll);
        queueNextFrame();
    };

    const start = () => {
        stop(true);
        if (wrapperEl) {
            wrapperEl.classList.toggle('is-editing', document.activeElement === inputEl);
        }
        if (!isRunnable()) return;
        if (!prepareMarquee()) return;
        startTimer = window.setTimeout(() => {
            startTimer = null;
            if (!isRunnable()) return;
            if (!prepareMarquee()) return;
            lastTime = 0;
            queueNextFrame();
        }, UX_TODO_TITLE_SCROLL_START_DELAY_MS);
    };

    const handleFocus = () => {
        stop(true);
        if (wrapperEl) {
            wrapperEl.classList.add('is-editing');
        }
    };
    const handleBlur = () => {
        if (wrapperEl) {
            wrapperEl.classList.remove('is-editing');
        }
        start();
    };
    const handleChange = () => start();
    const handleInput = () => {
        if (wrapperEl && document.activeElement !== inputEl) {
            start();
        }
    };
    const handleResize = () => start();
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            start();
        } else {
            stop(false);
        }
    };

    inputEl.addEventListener('focus', handleFocus);
    inputEl.addEventListener('blur', handleBlur);
    inputEl.addEventListener('change', handleChange);
    inputEl.addEventListener('input', handleInput);
    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    setupRafId = window.requestAnimationFrame(() => {
        setupRafId = null;
        start();
    });

    return () => {
        stop(false);
        if (setupRafId !== null) {
            window.cancelAnimationFrame(setupRafId);
            setupRafId = null;
        }
        inputEl.removeEventListener('focus', handleFocus);
        inputEl.removeEventListener('blur', handleBlur);
        inputEl.removeEventListener('change', handleChange);
        inputEl.removeEventListener('input', handleInput);
        window.removeEventListener('resize', handleResize);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        inputEl.classList.remove('ux-todo-title-marquee-source');
        if (wrapperEl && wrapperEl.parentElement && wrapperEl.contains(inputEl)) {
            wrapperEl.parentElement.insertBefore(inputEl, wrapperEl);
            wrapperEl.remove();
        }
        wrapperEl = null;
        overlayEl = null;
        trackEl = null;
        firstTextEl = null;
        secondTextEl = null;
    };
}

function createTimeWheelColumn(values, initialIndex, onChange, options = {}) {
    const wheel = document.createElement('div');
    wheel.className = 'ux-time-wheel';

    const { loopCount = 50 } = options;
    const cycleLength = values.length;
    const repeatCount = Math.max(1, loopCount);
    const centerOffset = cycleLength * Math.floor(repeatCount / 2);
    const renderValues = Array.from({ length: repeatCount }, () => values).flat();

    renderValues.forEach((value, index) => {
        const item = document.createElement('div');
        item.className = 'ux-time-wheel-item';
        item.textContent = value;
        item.dataset.index = index.toString();
        item.addEventListener('click', () => {
            scrollToIndex(index, 'smooth');
        });
        wheel.appendChild(item);
    });

    let itemHeight = 32;
    let ready = false;

    const syncItemHeight = () => {
        const cssValue = getComputedStyle(wheel).getPropertyValue('--ux-time-wheel-item');
        const parsed = parseFloat(cssValue);
        if (Number.isFinite(parsed) && parsed > 0) {
            itemHeight = parsed;
        }
    };

    const clampIndex = (index) => Math.min(renderValues.length - 1, Math.max(0, index));

    const scrollToIndex = (index, behavior = 'auto') => {
        const safeIndex = clampIndex(index);
        wheel.scrollTo({ top: safeIndex * itemHeight, behavior });
    };

    const normalizeIndex = (index) => {
        const mod = index % cycleLength;
        return mod < 0 ? mod + cycleLength : mod;
    };

    let scrollTimer = 0;
    wheel.addEventListener('scroll', () => {
        if (!ready) return;
        if (scrollTimer) {
            clearTimeout(scrollTimer);
        }
        scrollTimer = window.setTimeout(() => {
            const rawIndex = clampIndex(Math.round(wheel.scrollTop / itemHeight));
            const valueIndex = normalizeIndex(rawIndex);
            onChange(values[valueIndex], valueIndex);
            scrollToIndex(rawIndex, 'smooth');
        }, 80);
    }, { passive: true });

    requestAnimationFrame(() => {
        syncItemHeight();
        const startIndex = centerOffset + normalizeIndex(initialIndex);
        scrollToIndex(startIndex, 'auto');
        ready = true;
    });

    return { wheel, scrollToIndex };
}

function openDatetimePopover(anchorEl, options) {
    if (!anchorEl) return;
    if (uxActiveDatetimeAnchor === anchorEl && uxActiveDatetimePopover) {
        closeDatetimePopover();
        return;
    }

    closeDatetimePopover();
    const {
        initialDate,
        onCommit,
        onClear,
        onClose
    } = options || {};

    const popover = document.createElement('div');
    popover.className = 'ux-datetime-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', '期限と時刻の設定');

    const panel = document.createElement('div');
    panel.className = 'ux-datetime-panel';
    popover.appendChild(panel);

    const calendarWrap = document.createElement('div');
    calendarWrap.className = 'ux-datetime-calendar';
    panel.appendChild(calendarWrap);

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'text';
    hiddenInput.className = 'ux-datetime-hidden-input';
    calendarWrap.appendChild(hiddenInput);

    const timeWrap = document.createElement('div');
    timeWrap.className = 'ux-datetime-time';
    panel.appendChild(timeWrap);

    const wheelShell = document.createElement('div');
    wheelShell.className = 'ux-time-wheel-shell';
    timeWrap.appendChild(wheelShell);

    const wheelRoot = document.createElement('div');
    wheelRoot.className = 'ux-time-wheel-root';
    wheelShell.appendChild(wheelRoot);

    const wheelColumns = document.createElement('div');
    wheelColumns.className = 'ux-time-wheel-columns';
    wheelRoot.appendChild(wheelColumns);

    const highlight = document.createElement('div');
    highlight.className = 'ux-time-wheel-highlight';
    wheelRoot.appendChild(highlight);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'ux-datetime-clear';
    clearBtn.textContent = '期限なし';
    timeWrap.appendChild(clearBtn);

    let selectedDate = initialDate instanceof Date && !isNaN(initialDate.getTime())
        ? new Date(initialDate.getTime())
        : null;

    let selectedAmpm = 'AM';
    let selectedHour = '12';
    let selectedMinute = '00';

    if (selectedDate) {
        const hours = selectedDate.getHours();
        const minutes = selectedDate.getMinutes();
        selectedAmpm = hours >= 12 ? 'PM' : 'AM';
        const hour12 = hours % 12 || 12;
        selectedHour = hour12.toString();
        selectedMinute = minutes < 10 ? `0${minutes}` : `${minutes}`;
    }

    const commitSelection = async () => {
        if (!selectedDate) return;
        const hour12 = parseInt(selectedHour, 10);
        const minute = parseInt(selectedMinute, 10);
        let hour24 = hour12 % 12;
        if (selectedAmpm === 'PM') hour24 += 12;
        if (selectedAmpm === 'AM' && hour12 === 12) hour24 = 0;
        const finalDate = new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth(),
            selectedDate.getDate(),
            hour24,
            minute,
            0,
            0
        );
        if (typeof onCommit === 'function') {
            await onCommit(finalDate);
        }
    };

    const hoursArr = [];
    for (let i = 1; i <= 12; i++) hoursArr.push(i.toString());
    const minutesArr = [];
    for (let i = 0; i < 60; i++) minutesArr.push(i < 10 ? `0${i}` : `${i}`);

    const ampmWheel = createTimeWheelColumn(
        ['AM', 'PM'],
        selectedAmpm === 'PM' ? 1 : 0,
        async (value) => {
            selectedAmpm = value;
            await commitSelection();
        },
        { loopCount: 1 }
    );

    const hourWheel = createTimeWheelColumn(
        hoursArr,
        Math.max(0, hoursArr.indexOf(selectedHour)),
        async (value) => {
            selectedHour = value;
            await commitSelection();
        },
        { loopCount: 50 }
    );

    const minuteWheel = createTimeWheelColumn(
        minutesArr,
        Math.max(0, minutesArr.indexOf(selectedMinute)),
        async (value) => {
            selectedMinute = value;
            await commitSelection();
        },
        { loopCount: 50 }
    );

    wheelColumns.appendChild(ampmWheel.wheel);
    wheelColumns.appendChild(hourWheel.wheel);

    const sep = document.createElement('div');
    sep.className = 'ux-time-wheel-sep';
    sep.textContent = ':';
    wheelColumns.appendChild(sep);

    wheelColumns.appendChild(minuteWheel.wheel);

    let fpInstance = null;
    const buildYearDropdown = (instance) => {
        if (!instance || !instance.currentYearElement || !instance.calendarContainer) return;

        const currentYear = instance.currentYear;
        const range = 10;
        const minYear = currentYear - range;
        const maxYear = currentYear + range;

        let yearSelect = instance.calendarContainer.querySelector('.ux-flatpickr-year-dropdown');
        if (!yearSelect) {
            yearSelect = document.createElement('select');
            yearSelect.className = 'ux-flatpickr-year-dropdown';
            yearSelect.setAttribute('aria-label', '年');
            yearSelect.addEventListener('change', () => {
                const year = parseInt(yearSelect.value, 10);
                if (!Number.isNaN(year)) {
                    instance.changeYear(year);
                }
            });

            const parent = instance.currentYearElement.parentNode;
            if (parent) {
                parent.replaceChild(yearSelect, instance.currentYearElement);
                instance.currentYearElement = yearSelect;
            }
        }

        yearSelect.innerHTML = '';
        for (let y = minYear; y <= maxYear; y++) {
            const opt = document.createElement('option');
            opt.value = `${y}`;
            opt.textContent = `${y}`;
            if (y === currentYear) opt.selected = true;
            yearSelect.appendChild(opt);
        }
        yearSelect.value = `${currentYear}`;
    };

    try {
        if (typeof flatpickr !== 'undefined') {
            fpInstance = flatpickr(hiddenInput, {
                locale: 'ja',
                dateFormat: 'Y/m/d',
                inline: true,
                disableMobile: true,
                defaultDate: selectedDate,
                onReady: (selectedDates, dateStr, instance) => {
                    buildYearDropdown(instance);
                },
                onMonthChange: (selectedDates, dateStr, instance) => {
                    buildYearDropdown(instance);
                },
                onYearChange: (selectedDates, dateStr, instance) => {
                    buildYearDropdown(instance);
                },
                onChange: async (selectedDates) => {
                    if (!selectedDates || !selectedDates.length) {
                        selectedDate = null;
                        return;
                    }
                    selectedDate = new Date(selectedDates[0].getTime());
                    await commitSelection();
                }
            });
        } else {
            uxDebugWarn('WebClass UX: flatpickr is not defined');
        }
    } catch (e) {
        console.error('WebClass UX: Failed to init flatpickr', e);
    }

    clearBtn.addEventListener('click', async (event) => {
        event.preventDefault();
        if (fpInstance) {
            fpInstance.clear();
        }
        selectedDate = null;
        if (typeof onClear === 'function') {
            await onClear();
        }
        closeDatetimePopover();
    });

    document.body.appendChild(popover);

    const positionPopover = () => {
        if (!document.body.contains(popover) || !document.body.contains(anchorEl)) return;
        const rect = anchorEl.getBoundingClientRect();
        const popRect = popover.getBoundingClientRect();
        let left = rect.left + window.scrollX;
        let top = rect.bottom + window.scrollY + 8;
        const maxLeft = window.scrollX + window.innerWidth - popRect.width - 12;
        if (left > maxLeft) left = Math.max(window.scrollX + 12, maxLeft);
        const maxTop = window.scrollY + window.innerHeight - popRect.height - 12;
        if (top > maxTop) {
            const altTop = rect.top + window.scrollY - popRect.height - 8;
            top = altTop > window.scrollY + 12 ? altTop : Math.max(window.scrollY + 12, maxTop);
        }
        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;
    };

    const handleDocPointer = (event) => {
        if (popover.contains(event.target) || anchorEl.contains(event.target)) return;
        closeDatetimePopover();
    };

    const handleKeydown = (event) => {
        if (event.key === 'Escape') {
            closeDatetimePopover();
        }
    };

    const handleReposition = () => {
        requestAnimationFrame(positionPopover);
    };

    document.addEventListener('mousedown', handleDocPointer);
    document.addEventListener('touchstart', handleDocPointer, { passive: true });
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    requestAnimationFrame(positionPopover);

    uxActiveDatetimePopover = popover;
    uxActiveDatetimeAnchor = anchorEl;
    uxActiveDatetimeOnClose = onClose || null;
    uxActiveDatetimeCleanup = () => {
        document.removeEventListener('mousedown', handleDocPointer);
        document.removeEventListener('touchstart', handleDocPointer);
        document.removeEventListener('keydown', handleKeydown);
        window.removeEventListener('resize', handleReposition);
        window.removeEventListener('scroll', handleReposition, true);
        if (fpInstance) {
            try {
                fpInstance.destroy();
            } catch {
                // ignore
            }
        }
    };
}
