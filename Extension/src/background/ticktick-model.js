// background/ticktick-model.js
// TickTick constants, identity matching, deadlines, and task payload mapping.

const TODO_API_ENABLED_KEY = 'todoApiEnabled';
const TODO_API_TASK_TITLE_FORMAT_KEY = 'todoApiTaskTitleFormat';
const TODO_API_ULTRA_SHORT_MAP_KEY = 'todoApiUltraShortCourseMap';
const TODO_API_LAST_MANUAL_RELOAD_KEY = 'todoApiLastManualReloadAt';
const TODO_API_LAST_MORNING_SYNC_DATE_KEY = 'todoApiLastMorningSyncDate';
const TODO_API_LAST_AUTO_SYNC_AT_KEY = 'todoApiLastAutoSyncAt';
const TICKTICK_TODO_CLIENT_ID_KEY = 'ticktickTodoClientId';
const TICKTICK_TODO_CLIENT_SECRET_KEY = 'ticktickTodoClientSecret';
const TICKTICK_TODO_PROJECT_NAME_KEY = 'ticktickTodoProjectName';
const TICKTICK_TODO_PROJECT_ID_KEY = 'ticktickTodoProjectId';
const TICKTICK_TODO_AUTH_KEY = 'ticktickTodoAuth'; // legacy local key (migration only)
const TICKTICK_TODO_AUTH_SESSION_KEY = 'ticktickTodoAuthSession';
const TICKTICK_TODO_AUTH_LOCAL_KEY = 'ticktickTodoAuthLocal';
const TICKTICK_TODO_REFRESH_TOKEN_KEY = 'ticktickTodoRefreshToken';
const ASSIGNMENTS_STORAGE_KEY = 'assignments';
const TODO_TRASH_STORAGE_KEY = 'webclass_todo_trash';
const TODO_SYNC_ALARM_NAME = 'todoApiPeriodicSync';
const TODO_SYNC_ALARM_PERIOD_MINUTES = 1;
const TODO_AUTO_SYNC_INTERVAL_MINUTES = 5;
const TODO_AUTO_SYNC_START_HOUR = 7;
const TODO_AUTO_SYNC_END_HOUR = 23;
const TODO_SYNC_TIME_ZONE = 'Asia/Tokyo';
const TICKTICK_API_BASE_URL = 'https://api.ticktick.com/open/v1';
const TICKTICK_AUTH_BASE_URL = 'https://ticktick.com';
const TICKTICK_OAUTH_SCOPE = 'tasks:read tasks:write';
const TICKTICK_DEFAULT_PROJECT_NAME = 'WebClass';
const TODO_TITLE_FORMAT_TASK_ONLY = 'task_only';
const TODO_TITLE_FORMAT_SHORT = 'short_course_plus_task';
const TODO_TITLE_FORMAT_ULTRA_SHORT = 'ultra_short_plus_task';
const pendingDownloads = new Map();
const urlToFilename = new Map();
const todoSyncRuntimeState = {
    running: false,
    lastRunAt: 0
};

function bytesToBase64Url(bytes) {
    let result = '';
    for (let i = 0; i < bytes.length; i += 1) {
        result += String.fromCharCode(bytes[i]);
    }
    return btoa(result).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(length = 32) {
    const safeLength = Number.isFinite(Number(length)) && Number(length) > 0
        ? Math.floor(Number(length))
        : 32;
    const bytes = new Uint8Array(safeLength);
    crypto.getRandomValues(bytes);
    const token = bytesToBase64Url(bytes);
    return token.slice(0, safeLength);
}

function computeExpiryTimestamp(expiresInSeconds) {
    const parsed = Number(expiresInSeconds);
    const safeSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 3600;
    const marginMs = 60 * 1000;
    return Date.now() + safeSeconds * 1000 - marginMs;
}

function isAuthTokenUsable(auth) {
    if (!auth || typeof auth !== 'object') return false;
    if (!auth.accessToken) return false;
    if (!auth.expiresAt) return true;
    return Number(auth.expiresAt) > Date.now();
}

function buildSessionAuthStateFromToken(token, fallbackScope = '', options = {}) {
    if (!token || typeof token !== 'object') return null;
    const accessToken = typeof token.access_token === 'string'
        ? token.access_token.trim()
        : '';
    if (!accessToken) return null;
    const parsedExpiry = Number(token.expires_in);
    const hasExplicitExpiry = Number.isFinite(parsedExpiry) && parsedExpiry > 0;
    const expiresAt = hasExplicitExpiry
        ? computeExpiryTimestamp(parsedExpiry)
        : (options.allowMissingExpiry ? 0 : computeExpiryTimestamp(undefined));
    return {
        accessToken,
        refreshToken: '',
        expiresAt,
        scope: token.scope || fallbackScope || '',
        tokenType: token.token_type || 'Bearer',
        obtainedAt: new Date().toISOString()
    };
}

function normalizeSessionAuthState(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const accessToken = typeof raw.accessToken === 'string' ? raw.accessToken.trim() : '';
    if (!accessToken) return null;
    const expiresAt = Number.isFinite(Number(raw.expiresAt)) ? Number(raw.expiresAt) : 0;
    return {
        accessToken,
        refreshToken: '',
        expiresAt,
        scope: typeof raw.scope === 'string' ? raw.scope : '',
        tokenType: typeof raw.tokenType === 'string' && raw.tokenType ? raw.tokenType : 'Bearer',
        obtainedAt: typeof raw.obtainedAt === 'string' ? raw.obtainedAt : ''
    };
}

async function encodePersistedSessionAuth(auth) {
    const normalized = normalizeSessionAuthState(auth);
    if (!normalized) return '';
    return encryptSecureLocalString(JSON.stringify(normalized));
}

function parsePersistedSessionAuth(rawValue) {
    if (typeof rawValue !== 'string' || !rawValue.trim()) return null;
    try {
        return normalizeSessionAuthState(JSON.parse(rawValue));
    } catch {
        return null;
    }
}

function extractCourseIdFromUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl) return '';
    const match = rawUrl.match(/course\.php\/([^\/?#]+)/);
    return match ? match[1].trim() : '';
}

function isAssignmentInTrashSet(assignment, trashSet) {
    if (!(trashSet instanceof Set) || !assignment || typeof assignment !== 'object') return false;
    const url = typeof assignment.url === 'string' ? assignment.url.trim() : '';
    const fallbackUrl = typeof assignment.fallbackUrl === 'string' ? assignment.fallbackUrl.trim() : '';
    return (url && trashSet.has(url)) || (fallbackUrl && trashSet.has(fallbackUrl));
}

function addAssignmentIdentifiersToTrashSet(assignment, trashSet) {
    if (!(trashSet instanceof Set) || !assignment || typeof assignment !== 'object') return false;
    const beforeSize = trashSet.size;
    const url = typeof assignment.url === 'string' ? assignment.url.trim() : '';
    const fallbackUrl = typeof assignment.fallbackUrl === 'string' ? assignment.fallbackUrl.trim() : '';
    if (url) trashSet.add(url);
    if (fallbackUrl) trashSet.add(fallbackUrl);
    return trashSet.size !== beforeSize;
}

function getRemoteTaskTimestamp(task) {
    if (!task || typeof task !== 'object') return 0;
    const timestamp = Date.parse(
        task.lastModifiedDateTime
        || task.updated
        || task.modifiedTime
        || task.createdDateTime
        || task.completedTime
        || task.dueDate
        || task.startDate
        || task.completed_at
        || task.completedAt
        || task.created_at
        || ''
    );
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function pickPreferredRemoteTask(first, second) {
    const firstTs = getRemoteTaskTimestamp(first);
    const secondTs = getRemoteTaskTimestamp(second);
    if (firstTs === secondTs) {
        return (String(first?.id || '') <= String(second?.id || '')) ? first : second;
    }
    return firstTs >= secondTs ? first : second;
}

function getCourseMapKey(assignment) {
    if (!assignment || typeof assignment !== 'object') return '';
    const byUrl = extractCourseIdFromUrl(assignment.url || assignment.fallbackUrl || '');
    if (byUrl) return byUrl;
    const fullName = typeof assignment.courseFullName === 'string' ? assignment.courseFullName.trim() : '';
    return fullName ? `full:${fullName}` : '';
}

function isLocalOnlyAssignment(assignment) {
    if (!assignment || typeof assignment !== 'object') return false;
    if (assignment.localOnly === true) return true;
    const category = typeof assignment.category === 'string' ? assignment.category.trim().toLowerCase() : '';
    const debugTodoTarget = typeof assignment.debugTodoTarget === 'string'
        ? assignment.debugTodoTarget.trim().toLowerCase()
        : '';
    const url = typeof assignment.url === 'string' ? assignment.url : '';
    const fallbackUrl = typeof assignment.fallbackUrl === 'string' ? assignment.fallbackUrl : '';
    return debugTodoTarget === 'local'
        || category === 'devdev'
        || url.startsWith('debug://')
        || fallbackUrl.startsWith('debug://');
}

function parseLocalDeadline(deadline) {
    if (typeof deadline !== 'string') return null;
    const trimmed = deadline.trim();
    if (!trimmed) return null;

    const parsedDirect = new Date(trimmed);
    if (!Number.isNaN(parsedDirect.getTime())) {
        return parsedDirect;
    }

    const normalized = trimmed.replace(/-/g, '/').replace(/\s+/g, ' ').trim();
    const dateTimeMatch = normalized.match(
        /(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s*(AM|PM)?\s*(\d{1,2})(?::)?(\d{1,2})?(?::)?(\d{1,2})?)?/i
    );
    if (!dateTimeMatch) return null;

    const year = Number(dateTimeMatch[1]);
    const month = Number(dateTimeMatch[2]);
    const day = Number(dateTimeMatch[3]);
    const ampmRaw = (dateTimeMatch[4] || '').toLowerCase();
    let hour = Number(dateTimeMatch[5] || 23);
    const minute = Number(dateTimeMatch[6] || 59);
    const second = Number(dateTimeMatch[7] || 0);

    if (ampmRaw === 'pm' && hour < 12) {
        hour += 12;
    } else if (ampmRaw === 'am' && hour === 12) {
        hour = 0;
    }

    const result = new Date(year, month - 1, day, hour, minute, second);
    if (Number.isNaN(result.getTime())) return null;
    return result;
}

function formatTickTickDateTimeForApi(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const tokyoDate = getTokyoDateParts(date);
    const month = String(tokyoDate.month).padStart(2, '0');
    const day = String(tokyoDate.day).padStart(2, '0');
    const hour = String(tokyoDate.hour).padStart(2, '0');
    const minute = String(tokyoDate.minute).padStart(2, '0');
    const second = String(tokyoDate.second).padStart(2, '0');
    return `${tokyoDate.year}-${month}-${day}T${hour}:${minute}:${second}+0900`;
}

function buildTickTickDuePayloadFromAssignment(assignment) {
    const dueDate = parseLocalDeadline(assignment?.deadline);
    if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) {
        return { dueDate: '', hasDue: false };
    }
    return {
        dueDate: formatTickTickDateTimeForApi(dueDate),
        hasDue: true
    };
}

function parseTickTickDueToDeadlineText(dueDateRaw, content = '') {
    if (typeof dueDateRaw === 'string' && dueDateRaw.trim()) {
        const parsed = new Date(dueDateRaw.trim());
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleString();
        }
    }
    const fromNote = parseStoredDeadlineTextFromTaskBody(content);
    return fromNote || '';
}

function serializeTickTickDue(rawDueDate) {
    if (typeof rawDueDate !== 'string') return '';
    return rawDueDate.trim();
}

function getTickTickTaskStatus(task) {
    const status = Number(task?.status);
    if (Number.isFinite(status)) return status;
    return typeof task?.completedTime === 'string' && task.completedTime.trim() ? 2 : 0;
}

function isTickTickTaskCompleted(task) {
    return getTickTickTaskStatus(task) === 2;
}

function normalizeTickTickTaskId(taskId) {
    if (taskId === null || taskId === undefined) return '';
    return String(taskId).trim();
}

function getAssignmentTickTickTaskId(assignment) {
    if (!assignment || typeof assignment !== 'object') return '';
    return normalizeTickTickTaskId(assignment.ticktickTaskId);
}

function setAssignmentTickTickTaskId(assignment, taskId) {
    if (!assignment || typeof assignment !== 'object') return false;
    const normalized = normalizeTickTickTaskId(taskId);
    const current = getAssignmentTickTickTaskId(assignment);
    if (current === normalized) return false;
    if (normalized) {
        assignment.ticktickTaskId = normalized;
    } else {
        delete assignment.ticktickTaskId;
    }
    return true;
}

function isTickTickApiStatusError(error, statusCode) {
    const message = typeof error?.message === 'string' ? error.message : '';
    return message.includes(`TickTick API error (${statusCode})`);
}

function formatDeadlineTextWithTime(deadlineText) {
    const normalized = typeof deadlineText === 'string' ? deadlineText.trim() : '';
    if (!normalized) return '';

    const parsed = parseLocalDeadline(normalized);
    if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
        return normalized;
    }

    const tokyoDate = getTokyoDateParts(parsed);
    const month = String(tokyoDate.month).padStart(2, '0');
    const day = String(tokyoDate.day).padStart(2, '0');
    const hour = String(tokyoDate.hour).padStart(2, '0');
    const minute = String(tokyoDate.minute).padStart(2, '0');
    return `${tokyoDate.year}/${month}/${day} ${hour}:${minute}`;
}

function getAssignmentDeadlineTextForSync(assignment) {
    const deadline = typeof assignment?.deadline === 'string' ? assignment.deadline.trim() : '';
    if (!deadline) return '';
    return formatDeadlineTextWithTime(deadline);
}

function normalizeStoredDeadlineText(value) {
    if (typeof value !== 'string') return '';
    const normalized = value.trim();
    if (!normalized || normalized === NO_DEADLINE_TEXT) return '';
    return normalized;
}

function parseStoredDeadlineTextFromTaskBody(bodyContent) {
    if (typeof bodyContent !== 'string' || !bodyContent) return '';
    let currentDeadline = '';
    let metadataDeadline = '';
    const prefix = TODO_SYNC_NOTE_DEADLINE_PREFIX.toLowerCase();
    const lines = bodyContent.split(/\r?\n/);

    for (const rawLine of lines) {
        const line = typeof rawLine === 'string' ? rawLine.trim() : '';
        if (!line) continue;

        if (line.toLowerCase().startsWith(prefix)) {
            metadataDeadline = normalizeStoredDeadlineText(
                line.slice(TODO_SYNC_NOTE_DEADLINE_PREFIX.length)
            );
            continue;
        }

        const currentDeadlineMatch = line.match(/^Current\s+Deadline\s*:\s*(.+)$/i);
        if (currentDeadlineMatch?.[1]) {
            currentDeadline = normalizeStoredDeadlineText(currentDeadlineMatch[1]);
        }
    }

    if (currentDeadline) return currentDeadline;
    if (metadataDeadline) return metadataDeadline;
    return '';
}

function buildTodoTaskTitle(assignment, syncSettings) {
    const title = typeof assignment?.title === 'string' ? assignment.title.trim() : '';
    const fallbackTitle = title || '(Untitled)';
    const format = syncSettings?.taskTitleFormat || TODO_TITLE_FORMAT_TASK_ONLY;

    if (format === TODO_TITLE_FORMAT_SHORT) {
        const shortName = typeof assignment?.course === 'string' ? assignment.course.trim() : '';
        return shortName ? `${shortName}${fallbackTitle}` : fallbackTitle;
    }

    if (format === TODO_TITLE_FORMAT_ULTRA_SHORT) {
        const ultraShortMap = syncSettings?.ultraShortCourseMap && typeof syncSettings.ultraShortCourseMap === 'object'
            ? syncSettings.ultraShortCourseMap
            : {};
        const courseKey = getCourseMapKey(assignment);
        const ultraShort = courseKey ? (ultraShortMap[courseKey] || '').trim() : '';
        const fallbackShort = typeof assignment?.course === 'string' ? assignment.course.trim() : '';
        const prefix = ultraShort || fallbackShort;
        return prefix ? `${prefix}${fallbackTitle}` : fallbackTitle;
    }

    return fallbackTitle;
}

function buildTickTickTaskContent(assignment, syncIdentity = null) {
    const courseFullName = typeof assignment?.courseFullName === 'string' && assignment.courseFullName.trim()
        ? assignment.courseFullName.trim()
        : (typeof assignment?.course === 'string' && assignment.course.trim() ? assignment.course.trim() : '(Unknown)');
    const originalTaskTitle = typeof assignment?.sourceTitle === 'string' && assignment.sourceTitle.trim()
        ? assignment.sourceTitle.trim()
        : (typeof assignment?.title === 'string' && assignment.title.trim() ? assignment.title.trim() : '(Untitled)');
    const originalDeadline = typeof assignment?.originalDeadline === 'string' && assignment.originalDeadline.trim()
        ? assignment.originalDeadline.trim()
        : '';
    const currentDeadline = getAssignmentDeadlineTextForSync(assignment);
    const sourceUrl = typeof assignment?.url === 'string' && assignment.url.trim()
        ? assignment.url.trim()
        : (typeof assignment?.fallbackUrl === 'string' ? assignment.fallbackUrl.trim() : '');
    const lines = [
        `Course: ${courseFullName}`,
        `Original Task: ${originalTaskTitle}`,
        `Original Deadline: ${originalDeadline}`,
        `Current Deadline: ${currentDeadline}`,
        `${TODO_SYNC_NOTE_DEADLINE_PREFIX}${currentDeadline}`
    ];
    if (sourceUrl) {
        lines.push(`Task URL: ${sourceUrl}`);
    }
    if (syncIdentity?.stableId) {
        lines.push(`${TODO_SYNC_NOTE_ID_PREFIX}${syncIdentity.stableId}`);
    }
    if (syncIdentity?.normalizedUrl) {
        lines.push(`${TODO_SYNC_NOTE_URL_PREFIX}${syncIdentity.normalizedUrl}`);
    }
    return lines.join('\n');
}

function buildDesiredTickTickTaskState(projectId, assignment, syncSettings, forceCompleted = false, syncIdentity = null) {
    const due = buildTickTickDuePayloadFromAssignment(assignment);
    const completed = forceCompleted === true || assignment?.isCompleted === true;
    return {
        projectId,
        title: buildTodoTaskTitle(assignment, syncSettings),
        status: completed ? 2 : 0,
        dueDate: due.dueDate,
        hasDue: due.hasDue,
        content: buildTickTickTaskContent(assignment, syncIdentity)
    };
}

function normalizeTodoSemanticText(value) {
    return typeof value === 'string'
        ? value.replace(/\s+/g, ' ').trim()
        : '';
}

function parseLabeledValueFromBody(bodyContent, label) {
    if (typeof bodyContent !== 'string' || !bodyContent || typeof label !== 'string' || !label) {
        return '';
    }
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = bodyContent.match(new RegExp(`(?:^|\\n)\\s*${escapedLabel}\\s*:\\s*([^\\r\\n]*)`, 'i'));
    return match?.[1] ? match[1].trim() : '';
}

function getTickTickAssignmentSyncCandidates(assignment) {
    return getAssignmentSyncIdentityCandidates(assignment, { preferFallbackUrl: true });
}

function getTickTickAssignmentSyncIdentity(assignment) {
    const candidates = getTickTickAssignmentSyncCandidates(assignment);
    if (candidates.length > 0) {
        return {
            stableId: candidates[0].stableId,
            normalizedUrl: candidates[0].normalizedUrl
        };
    }
    return { stableId: '', normalizedUrl: '' };
}

function buildTickTickAssignmentSemanticKey(assignment) {
    if (!assignment || typeof assignment !== 'object') return '';

    const courseFullName = normalizeTodoSemanticText(
        assignment.courseFullName || assignment.course || ''
    );
    const originalTaskTitle = normalizeTodoSemanticText(
        assignment.sourceTitle || assignment.title || ''
    );
    const originalDeadline = normalizeTodoSemanticText(
        assignment.originalDeadline || NO_DEADLINE_TEXT
    ) || NO_DEADLINE_TEXT;

    if (!courseFullName || !originalTaskTitle) return '';
    return `${courseFullName}\n${originalTaskTitle}\n${originalDeadline}`;
}

function buildTickTickRemoteSemanticKey(remoteTask) {
    if (!remoteTask || typeof remoteTask !== 'object') return '';

    const remoteContent = typeof remoteTask.content === 'string' ? remoteTask.content : '';
    const courseFullName = normalizeTodoSemanticText(parseLabeledValueFromBody(remoteContent, 'Course'));
    const originalTaskTitle = normalizeTodoSemanticText(
        parseLabeledValueFromBody(remoteContent, 'Original Task') || remoteTask.title || ''
    );
    const originalDeadline = normalizeTodoSemanticText(
        parseLabeledValueFromBody(remoteContent, 'Original Deadline') || NO_DEADLINE_TEXT
    ) || NO_DEADLINE_TEXT;

    if (!courseFullName || !originalTaskTitle) return '';
    return `${courseFullName}\n${originalTaskTitle}\n${originalDeadline}`;
}

function buildTickTickAssignmentLookup(entry) {
    const assignment = entry?.assignment;
    const syncIdentity = entry?.syncIdentity;
    const candidates = getTickTickAssignmentSyncCandidates(assignment);
    const stableIds = new Set();
    const normalizedUrls = new Set();

    candidates.forEach((candidate) => {
        if (candidate?.stableId) stableIds.add(candidate.stableId);
        if (candidate?.normalizedUrl) normalizedUrls.add(candidate.normalizedUrl);
    });

    if (syncIdentity?.stableId) stableIds.add(syncIdentity.stableId);
    if (syncIdentity?.normalizedUrl) normalizedUrls.add(syncIdentity.normalizedUrl);

    return {
        stableIds,
        normalizedUrls,
        semanticKey: buildTickTickAssignmentSemanticKey(assignment),
        storedTaskId: getAssignmentTickTickTaskId(assignment)
    };
}

function buildTickTickRemoteLookup(task) {
    const metadata = parseSyncMetadataFromTask(task);
    return {
        stableId: typeof metadata?.stableId === 'string' ? metadata.stableId.trim() : '',
        normalizedUrl: typeof metadata?.normalizedUrl === 'string' ? metadata.normalizedUrl.trim() : '',
        semanticKey: buildTickTickRemoteSemanticKey(task)
    };
}

function pickPreferredTickTickTask(first, second) {
    const firstCompleted = isTickTickTaskCompleted(first);
    const secondCompleted = isTickTickTaskCompleted(second);
    if (firstCompleted !== secondCompleted) {
        return firstCompleted ? first : second;
    }
    return pickPreferredRemoteTask(first, second);
}

function applyTickTickRemoteTaskToAssignment(assignment, remoteTask) {
    if (!assignment || typeof assignment !== 'object' || !remoteTask || typeof remoteTask !== 'object') {
        return false;
    }
    let changed = false;

    const remoteTitle = typeof remoteTask.title === 'string' ? remoteTask.title : '';
    if (remoteTitle && assignment.title !== remoteTitle) {
        assignment.title = remoteTitle;
        assignment.titleEdited = true;
        changed = true;
    }

    const remoteCompleted = isTickTickTaskCompleted(remoteTask);
    if (assignment.isCompleted !== remoteCompleted) {
        assignment.isCompleted = remoteCompleted;
        changed = true;
    }

    const remoteContent = typeof remoteTask.content === 'string' ? remoteTask.content : '';
    const deadlineFromNotes = parseStoredDeadlineTextFromTaskBody(remoteContent);
    const hasRemoteDeadlineSignal = !!serializeTickTickDue(remoteTask.dueDate) || !!deadlineFromNotes;
    if (hasRemoteDeadlineSignal) {
        const remoteDeadlineText = parseTickTickDueToDeadlineText(remoteTask.dueDate, remoteContent);
        if ((assignment.deadline || '') !== remoteDeadlineText) {
            assignment.deadline = remoteDeadlineText;
            changed = true;
        }

        if (!assignment.originalDeadline || assignment.originalDeadline === '') {
            assignment.originalDeadline = remoteDeadlineText;
            changed = true;
        }
    }

    return changed;
}

function buildTickTickTaskPatchFromAssignment(
    projectId,
    assignment,
    syncSettings,
    remoteTask,
    forceCompleted = false,
    syncIdentity = null
) {
    const desired = buildDesiredTickTickTaskState(projectId, assignment, syncSettings, forceCompleted, syncIdentity);
    const remoteCompleted = isTickTickTaskCompleted(remoteTask);
    const taskId = typeof remoteTask?.id === 'string' ? remoteTask.id : String(remoteTask?.id || '');
    const payload = {
        id: taskId,
        projectId: remoteTask?.projectId || projectId
    };
    let hasPayloadDiff = false;

    if (desired.title && desired.title !== (remoteTask?.title || '')) {
        payload.title = desired.title;
        hasPayloadDiff = true;
    }

    const remoteContent = typeof remoteTask?.content === 'string' ? remoteTask.content : '';
    if (desired.content !== remoteContent) {
        payload.content = desired.content || '';
        hasPayloadDiff = true;
    }

    const remoteDueSerialized = serializeTickTickDue(remoteTask?.dueDate);
    const desiredDueSerialized = desired.hasDue ? serializeTickTickDue(desired.dueDate) : '';
    if (desiredDueSerialized !== remoteDueSerialized) {
        payload.dueDate = desired.hasDue ? desired.dueDate : null;
        hasPayloadDiff = true;
    }

    const remoteIsAllDay = remoteTask?.isAllDay === true;
    if (remoteIsAllDay !== false) {
        payload.isAllDay = false;
        hasPayloadDiff = true;
    }

    const remoteTimeZone = typeof remoteTask?.timeZone === 'string' ? remoteTask.timeZone.trim() : '';
    if (remoteTimeZone && remoteTimeZone !== TODO_SYNC_TIME_ZONE) {
        payload.timeZone = TODO_SYNC_TIME_ZONE;
        hasPayloadDiff = true;
    }

    if (desired.status === 0 && remoteCompleted) {
        payload.status = 0;
        hasPayloadDiff = true;
    }

    const shouldComplete = desired.status === 2 && !remoteCompleted;
    const shouldReopen = false;

    return {
        payload: hasPayloadDiff ? payload : null,
        shouldComplete,
        shouldReopen
    };
}
