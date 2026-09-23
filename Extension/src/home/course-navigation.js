// Drain any in-flight assignment request before allowing a course page request.
if (isHomePage && window.WebClassScraper?.stopAssignmentUpdateForNavigation) {
    let courseNavigationPending = false;
    let allowDeferredCourseFormSubmit = false;

    const isCoursePageUrl = (rawUrl) => {
        if (!rawUrl) return false;

        try {
            const url = new URL(rawUrl, window.location.href);
            return url.origin === window.location.origin
                && /(?:^|\/)course\.php(?:\/|$)/i.test(url.pathname);
        } catch {
            return false;
        }
    };

    const findCourseLink = (event) => {
        const eventPath = typeof event.composedPath === 'function'
            ? event.composedPath()
            : [event.target];
        const anchor = eventPath.find((node) => node instanceof HTMLAnchorElement);
        return anchor && isCoursePageUrl(anchor.href) ? anchor : null;
    };

    const getLinkTarget = (anchor) => anchor.target
        || document.querySelector('base[target]')?.target
        || '_self';

    const opensCourseLinkInNewContext = (event, target) => (
        event.type === 'auxclick'
        || event.button === 1
        || event.ctrlKey
        || event.metaKey
        || event.shiftKey
        || (target !== '_self' && target !== '_top' && target !== '_parent')
    );

    const navigateToCourseLink = (href, target, opensNewContext, newContext) => {
        if (opensNewContext) {
            if (newContext) {
                newContext.location.replace(href);
            } else {
                window.location.assign(href);
            }
            return;
        }

        if (target === '_top') {
            window.top.location.assign(href);
        } else if (target === '_parent') {
            window.parent.location.assign(href);
        } else {
            window.location.assign(href);
        }
    };

    const deferCourseLinkNavigation = (event) => {
        const anchor = findCourseLink(event);
        if (!anchor || anchor.hasAttribute('download')) return;
        if (courseNavigationPending) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }

        const waitForScraper = window.WebClassScraper.stopAssignmentUpdateForNavigation();
        if (!waitForScraper) return;

        courseNavigationPending = true;
        event.preventDefault();
        event.stopImmediatePropagation();
        const href = anchor.href;
        const target = getLinkTarget(anchor);
        const opensNewContext = opensCourseLinkInNewContext(event, target);
        const contextName = target === '_self' || target === '_top' || target === '_parent'
            ? '_blank'
            : target;
        const newContext = opensNewContext ? window.open('about:blank', contextName) : null;
        void waitForScraper.then(() => navigateToCourseLink(href, target, opensNewContext, newContext));
    };

    document.addEventListener('click', deferCourseLinkNavigation, true);
    document.addEventListener('auxclick', deferCourseLinkNavigation, true);

    document.addEventListener('submit', (event) => {
        const form = event.target;
        const submitterUrl = event.submitter?.formAction;
        const formUrl = form instanceof HTMLFormElement ? form.action : '';
        if (!isCoursePageUrl(submitterUrl || formUrl)) return;
        if (allowDeferredCourseFormSubmit) {
            allowDeferredCourseFormSubmit = false;
            return;
        }
        if (courseNavigationPending) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }

        const waitForScraper = window.WebClassScraper.stopAssignmentUpdateForNavigation();
        if (!waitForScraper) return;

        courseNavigationPending = true;
        event.preventDefault();
        event.stopImmediatePropagation();
        const submitter = event.submitter;
        void waitForScraper.then(() => {
            allowDeferredCourseFormSubmit = true;
            form.requestSubmit(submitter || undefined);
        });
    }, true);

    window.addEventListener('beforeunload', () => {
        window.WebClassScraper.stopAssignmentUpdateForNavigation();
    });
}
