// Shared display and synchronization policy. Archiving never changes completion state.
var WebClassTodoPolicy = (() => {
    const dayMs = 24 * 60 * 60 * 1000;
    const graceMs = 3 * dayMs;
    const upcomingDaysKey = 'todoUpcomingVisibilityDays';
    const debugSyncSettingsDefaults = { debugModeEnabled: false, debugTodoApiSyncEnabled: true };
    function isExternalSyncPaused(settings) {
        return settings.debugModeEnabled === true && settings.debugTodoApiSyncEnabled === false;
    }
    function parseDate(value) {
        if (!value || value === '期限なし') return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    function normalizeUpcomingDays(value) {
        const days = Number(value);
        return value !== null && value !== '' && Number.isInteger(days) && days >= 0 && days <= 365 ? days : 7;
    }
    function archiveAt(todo) {
        const deadline = parseDate(todo?.originalDeadline || todo?.deadline);
        return deadline ? deadline.getTime() + graceMs : null;
    }
    function isArchived(todo, now = new Date()) {
        const timestamp = archiveAt(todo);
        return timestamp !== null && now.getTime() > timestamp;
    }
    function isInCompletedView(todo, now = new Date()) {
        return todo?.isCompleted === true || isArchived(todo, now);
    }
    function isBeyondUpcomingWindow(todo, days = 7, now = new Date()) {
        const start = parseDate(todo?.startDate);
        return !isInCompletedView(todo, now) && start !== null
            && start.getTime() - now.getTime() >= normalizeUpcomingDays(days) * dayMs
            && start > now;
    }
    function shouldSkipSync(todo, now = new Date()) {
        return todo?.externalSyncExcluded === true || isArchived(todo, now);
    }
    function initializeAcquisition(todo, existing, now = new Date()) {
        // Persist the initial acquisition decision even if a deadline is later edited.
        todo.externalSyncExcluded = existing
            ? existing.externalSyncExcluded === true
            : isArchived(todo, now);
    }
    function nextTransition(todo, days = 7, now = new Date()) {
        if (todo?.isCompleted) return Infinity;
        const start = parseDate(todo?.startDate);
        const candidates = [archiveAt(todo)];
        if (start) candidates.push(start.getTime(), start.getTime() - normalizeUpcomingDays(days) * dayMs);
        return Math.min(...candidates.filter(time => time !== null && time >= now.getTime()));
    }
    return { debugSyncSettingsDefaults, isExternalSyncPaused, upcomingDaysKey, normalizeUpcomingDays, archiveAt, isArchived, isInCompletedView,
        isBeyondUpcomingWindow, shouldSkipSync, initializeAcquisition, nextTransition };
})();
