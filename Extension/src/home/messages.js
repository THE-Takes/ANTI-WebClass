// Home message workspace UI.

var UX_MESSAGE_ICONS = Object.freeze({
    course: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5 12 3l8 2.5-8 2.5-8-2.5Z"/><path d="M6.5 7v6.5c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3V7"/><path d="M20 6v6"/></svg>',
    messages: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m4 7 8 6 8-6"/></svg>',
    utilities: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6"/></svg>',
    debug: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9h8v7a4 4 0 0 1-8 0V9Z"/><path d="M9 9V7a3 3 0 0 1 6 0v2M4 13h4M16 13h4M5 19l3-2M19 19l-3-2"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M18.5 16A7 7 0 1 1 19 8l1 4"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
    attachment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20.5 11.5-8.2 8.2a6 6 0 0 1-8.5-8.5l8.6-8.6a4 4 0 0 1 5.7 5.7l-8.7 8.6a2 2 0 0 1-2.8-2.8l8-8"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>'
});

function createDashboardTabContent(tabInfo) {
    const icon = document.createElement('span');
    icon.className = 'ux-dashboard-v2-tab-icon';
    icon.innerHTML = UX_MESSAGE_ICONS[tabInfo.icon || 'course'] || UX_MESSAGE_ICONS.course;
    const label = document.createElement('span');
    label.className = 'ux-dashboard-v2-tab-label';
    label.textContent = tabInfo.name;
    return { icon, label };
}

function createMessageToolbarButton({ label, icon, className = '' }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ux-message-action ux-button ${className}`.trim();
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<span class="ux-message-action-icon">${icon}</span><span>${label}</span>`;
    return button;
}

function createMessageEmptyState({ title, detail, tone = '' }) {
    const state = document.createElement('div');
    state.className = `ux-message-empty${tone ? ` ux-message-empty-${tone}` : ''}`;
    const heading = document.createElement('strong');
    heading.textContent = title;
    state.appendChild(heading);
    if (detail) {
        const description = document.createElement('span');
        description.textContent = detail;
        state.appendChild(description);
    }
    return state;
}

function getMessageCourseTone(courseName) {
    let hash = 0;
    for (const character of courseName || '') {
        hash = ((hash << 5) - hash + character.codePointAt(0)) | 0;
    }
    return Math.abs(hash) % 6;
}

function createMessageAttachment(message) {
    if (!message?.attachmentUrl) return null;
    const link = document.createElement('a');
    link.href = message.attachmentUrl;
    link.className = 'ux-message-attachment-chip';
    link.title = message.attachment || '添付ファイルを開く';
    link.innerHTML = `<span class="ux-message-attachment-icon">${UX_MESSAGE_ICONS.attachment}</span>`;
    const label = document.createElement('span');
    label.textContent = message.attachment || '添付ファイル';
    link.appendChild(label);
    return link;
}

function renderMessageWindow(container, messageData, options = {}) {
    container.replaceChildren();
    const messages = Array.isArray(messageData?.messages) ? messageData.messages : [];
    if (messageData?.error) {
        container.appendChild(createMessageEmptyState({
            title: messageData.error === 'acs_not_found' ? 'セッション情報を取得できませんでした' : 'メッセージを読み込めませんでした',
            detail: messageData.error === 'acs_not_found' ? 'ホームを再読み込みして、もう一度お試しください。' : '通信状態を確認して更新してください。',
            tone: 'warning'
        }));
        return;
    }
    if (messages.length === 0) {
        container.appendChild(createMessageEmptyState({
            title: options.emptyTitle || '受信箱は空です',
            detail: options.emptyDetail || '新しいメッセージが届くと、ここに表示されます。'
        }));
        return;
    }

    const list = document.createElement('ol');
    list.className = 'ux-message-list';
    list.setAttribute('aria-label', '受信メッセージ一覧');
    messages.forEach((message) => {
        const item = document.createElement('li');
        item.className = `ux-message-row${message.isUnread ? ' is-unread' : ''}`;
        item.dataset.messageId = message.id || '';
        item.dataset.courseTone = String(getMessageCourseTone(message.course));
        if (message.url) {
            item.classList.add('is-openable');
            item.setAttribute('role', 'link');
            item.setAttribute('tabindex', '0');
            item.setAttribute('aria-label', `${message.subject || '件名なし'}を開く`);
            const openMessage = (event) => {
                if (event.target.closest('.ux-message-checkbox, .ux-message-attachment-chip')) return;
                if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
                if (event.type === 'keydown') event.preventDefault();
                options.onOpen?.(message);
            };
            item.addEventListener('click', openMessage);
            item.addEventListener('keydown', openMessage);
        }

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'ux-message-checkbox';
        checkbox.value = message.id || '';
        checkbox.disabled = !message.id;
        checkbox.setAttribute('aria-label', `${message.subject || 'メッセージ'}を選択`);
        checkbox.addEventListener('change', () => {
            item.classList.toggle('is-selected', checkbox.checked);
            options.onSelectionChange?.();
        });
        item.appendChild(checkbox);

        const main = document.createElement('div');
        main.className = 'ux-message-row-main';
        const subjectLine = document.createElement('div');
        subjectLine.className = 'ux-message-subject-line';
        if (message.isUnread) {
            const unread = document.createElement('span');
            unread.className = 'ux-message-unread-label';
            unread.textContent = '未読';
            subjectLine.appendChild(unread);
        }
        const subject = document.createElement('span');
        subject.className = 'ux-message-subject-text';
        subject.textContent = message.subject || '件名なし';
        subjectLine.appendChild(subject);
        main.appendChild(subjectLine);

        const metadata = document.createElement('div');
        metadata.className = 'ux-message-metadata';
        const course = document.createElement('span');
        course.className = 'ux-message-course';
        course.textContent = message.course || 'コース指定なし';
        const sender = document.createElement('span');
        sender.className = 'ux-message-sender';
        sender.textContent = [message.sender || '差出人不明', message.senderId].filter(Boolean).join(' · ');
        metadata.appendChild(course);
        metadata.appendChild(sender);
        main.appendChild(metadata);
        const attachment = createMessageAttachment(message);
        if (attachment) main.appendChild(attachment);
        item.appendChild(main);

        const date = document.createElement('time');
        date.className = 'ux-message-date';
        date.textContent = message.date || '—';
        item.appendChild(date);
        list.appendChild(item);
    });
    container.appendChild(list);
}

function renderMessageDetail(container, message, detail, options = {}) {
    container.replaceChildren();
    const article = document.createElement('article');
    article.className = 'ux-message-detail';
    const backButton = createMessageToolbarButton({ label: '受信箱に戻る', icon: UX_MESSAGE_ICONS.back, className: 'ux-message-detail-back' });
    backButton.addEventListener('click', () => options.onBack?.());
    article.appendChild(backButton);

    const header = document.createElement('header');
    header.className = 'ux-message-detail-header';
    const course = document.createElement('p');
    course.className = 'ux-message-detail-course';
    course.textContent = detail?.course || message.course || 'コース指定なし';
    const title = document.createElement('h2');
    title.textContent = detail?.subject || message.subject || '件名なし';
    const metadata = document.createElement('dl');
    metadata.className = 'ux-message-detail-metadata';
    [['送信者', detail?.sender || message.sender || '—'], ['日付', detail?.date || message.date || '—'], ['宛先', detail?.recipient || '—']].forEach(([label, value]) => {
        const term = document.createElement('dt');
        term.textContent = label;
        const description = document.createElement('dd');
        description.textContent = value;
        metadata.appendChild(term);
        metadata.appendChild(description);
    });
    header.appendChild(course);
    header.appendChild(title);
    header.appendChild(metadata);
    article.appendChild(header);

    const body = document.createElement('div');
    body.className = 'ux-message-detail-body';
    if (detail?.error) {
        body.appendChild(createMessageEmptyState({ title: '本文を読み込めませんでした', detail: '受信箱に戻って、もう一度お試しください。', tone: 'warning' }));
    } else {
        body.textContent = detail?.body?.trim() || '本文はありません。';
    }
    article.appendChild(body);

    const attachment = createMessageAttachment({ attachment: detail?.attachment || message.attachment, attachmentUrl: detail?.attachmentUrl || message.attachmentUrl });
    if (attachment) {
        const footer = document.createElement('footer');
        footer.className = 'ux-message-detail-footer';
        footer.appendChild(attachment);
        article.appendChild(footer);
    }
    container.appendChild(article);
    backButton.focus();
}

function getSelectedMessageIds(container) {
    return Array.from(container.querySelectorAll('.ux-message-checkbox:checked')).map((checkbox) => checkbox.value.trim()).filter(Boolean);
}
