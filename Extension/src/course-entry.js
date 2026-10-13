// Marks WebClass-owned entry and result pages for scoped visual enhancements.

(() => {
  const supportedPages = new Set([
    "show_frame.php",
    "show_info.php",
    "reslt_frame.php",
    "reslt_menu.php",
    "reslt_answer.php",
  ]);
  const pageName = window.location.pathname.split("/").pop();

  if (!supportedPages.has(pageName)) return;
  if (
    typeof isUxExtensionVisualEnabled === "function" &&
    !isUxExtensionVisualEnabled()
  ) {
    return;
  }

  document.documentElement.classList.add("ux-course-entry");
})();

// Reorganizes the launch screen without cloning or replacing native form controls.
(() => {
  const pageName = window.location.pathname.split('/').pop();
  if (!['show_frame.php', 'show_info.php'].includes(pageName)) return;

  const ready = (callback) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else callback();
  };

  const buildLaunchScreen = () => {
    if (document.getElementById('ux-course-start')) return;
    const form = document.querySelector('form[name="info"]');
    const info = document.getElementById('ContentInfo');
    const courseLink = document.querySelector('#WsTitle a');
    const start = form?.querySelector('input[name="next"], button[name="next"]');
    const exit = form?.querySelector('input[name="giveup"], button[name="giveup"]');
    if (!form || !info || !courseLink || !start || !exit) return;
    const extraControls = [...form.querySelectorAll('input:not([type="hidden"]), button, select, textarea')]
      .filter((control) => control !== start && control !== exit);
    if (extraControls.length) return;

    const title = info.querySelector('th')?.textContent.trim();
    if (!title) return;
    const element = (tag, className, text) => {
      const node = document.createElement(tag);
      node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    const courseName = courseLink.textContent.replace(/^\s*[»>]\s*/, '').trim();
    const layout = element('div', 'ux-start-layout');
    layout.id = 'ux-course-start';
    const sidebar = element('aside', 'ux-start-sidebar');
    const brand = element('div', 'ux-start-brand', 'WebClass');
    const brandMark = element('span', 'ux-start-brand-mark', 'W');
    brand.prepend(brandMark);
    sidebar.append(brand);

    courseLink.classList.add('ux-start-back');
    courseLink.textContent = '← コースに戻る';
    sidebar.append(courseLink);
    const context = element('div', 'ux-start-context');
    context.append(element('p', 'ux-start-label', 'コース'));
    context.append(element('h2', 'ux-start-course', courseName.split('／')[0]));
    context.append(element('p', 'ux-start-course-detail', courseName));
    sidebar.append(context);
    const user = document.getElementById('User');
    if (user) {
      user.classList.add('ux-start-user');
      sidebar.append(user);
    }

    const main = element('main', 'ux-start-main');
    const workspace = element('div', 'ux-start-workspace');
    workspace.append(element('p', 'ux-start-eyebrow', '教材をはじめる'));
    const card = element('section', 'ux-start-card');
    const heading = element('h1', 'ux-start-title', title);
    heading.id = 'ux-start-title';
    card.setAttribute('aria-labelledby', heading.id);
    card.append(heading);
    // Keep all availability rules and teacher-supplied notices in their original nodes.
    info.querySelector('th')?.parentElement.setAttribute('hidden', '');
    info.classList.add('ux-start-info');
    info.querySelectorAll('li').forEach((item) => {
      const period = item.textContent.match(/^\s*¤?\s*利用可能時間\s*\[([^\]]+)\]\s*$/);
      if (!period) return;
      item.replaceChildren(
        element('span', 'ux-start-period-label', '利用可能期間'),
        element('span', 'ux-start-period-value', period[1].replace('〜', '  —  ')),
      );
    });
    card.append(info);
    const actions = element('div', 'ux-start-actions');
    start.classList.add('ux-start-primary');
    exit.classList.add('ux-start-secondary');
    actions.append(exit, start);
    card.append(actions);

    const hiddenFields = [...form.querySelectorAll('input[type="hidden"]')];
    // Preserve notices outside ContentInfo too; only empty legacy layout wrappers are omitted.
    const remainingContent = [...form.childNodes].filter((node) => {
      if (hiddenFields.includes(node)) return false;
      if (node.nodeType === Node.TEXT_NODE) return !!node.textContent.trim();
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      return !!node.textContent.trim() || !!node.querySelector('img, input, button, select, textarea');
    });
    if (remainingContent.length) {
      const notices = element('div', 'ux-start-notices');
      notices.append(...remainingContent);
      card.insertBefore(notices, actions);
    }
    form.replaceChildren(...hiddenFields, card);
    form.classList.add('ux-start-form');
    workspace.append(form);
    workspace.append(element('p', 'ux-start-caption', '利用可能期間を確認してから開始してください。'));
    main.append(workspace);
    layout.append(sidebar, main);
    document.body.append(layout);
    document.getElementById('PageBody').hidden = true;
    document.getElementById('PageFoot')?.setAttribute('hidden', '');
    document.documentElement.classList.add('ux-course-start');
    try {
      const parentDoc = window.parent.document;
      if (parentDoc.querySelector('frame[name="contentsInfo"]')?.contentWindow === window) {
        // Collapse duplicate navigation only after the replacement screen is ready.
        parentDoc.querySelector('frameset[rows]')?.setAttribute('rows', '0,*');
      }
    } catch {
      // A directly opened launch page has no accessible parent frameset.
    }
  };

  chrome.storage.local.get({ extensionVisualEnabled: true }, (settings) => {
    if (settings.extensionVisualEnabled === false) return;
    ready(() => {
      if (pageName === 'show_info.php') buildLaunchScreen();
    });
  });
})();
