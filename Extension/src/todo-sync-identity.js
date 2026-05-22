// todo-sync-identity.js
// Shared, API-agnostic identity helpers for ToDo synchronization.

(function initTodoSyncIdentity(globalScope) {
    const NOTE_ID_PREFIX = 'WC_SYNC_ID:';
    const NOTE_URL_PREFIX = 'WC_SOURCE_URL:';
    const ID_PREFIX = 'wc_v1_';
    const VOLATILE_QUERY_KEYS = new Set([
        'acs_',
        'acs',
        'token',
        'session',
        'sid',
        'phpsessid'
    ]);

    function normalizeSyncTaskUrl(rawUrl) {
        if (typeof rawUrl !== 'string') return '';
        const trimmed = rawUrl.trim();
        if (!trimmed) return '';

        try {
            const parsed = new URL(trimmed);
            parsed.hash = '';

            const keptParams = [];
            parsed.searchParams.forEach((value, key) => {
                const normalizedKey = String(key || '').trim().toLowerCase();
                if (!normalizedKey || VOLATILE_QUERY_KEYS.has(normalizedKey)) {
                    return;
                }
                keptParams.push([key, value]);
            });

            keptParams.sort((a, b) => {
                if (a[0] === b[0]) return a[1].localeCompare(b[1]);
                return a[0].localeCompare(b[0]);
            });

            parsed.search = '';
            keptParams.forEach(([key, value]) => parsed.searchParams.append(key, value));

            let normalizedPath = parsed.pathname || '/';
            if (normalizedPath.length > 1) {
                normalizedPath = normalizedPath.replace(/\/+$/, '');
            }

            return `${parsed.protocol}//${parsed.host.toLowerCase()}${normalizedPath}${parsed.search}`;
        } catch {
            const noHash = trimmed.split('#')[0];
            const [pathOnly] = noHash.split('?');
            return pathOnly || '';
        }
    }

    function buildStableSyncIdFromNormalizedUrl(normalizedUrl) {
        if (typeof normalizedUrl !== 'string' || !normalizedUrl) return '';

        // 64-bit FNV-1a for deterministic cross-device IDs.
        let hash = 0xcbf29ce484222325n;
        const prime = 0x100000001b3n;
        const modMask = 0xffffffffffffffffn;

        for (let i = 0; i < normalizedUrl.length; i += 1) {
            hash ^= BigInt(normalizedUrl.charCodeAt(i));
            hash = (hash * prime) & modMask;
        }

        return `${ID_PREFIX}${hash.toString(16).padStart(16, '0')}`;
    }

    function getAssignmentSyncIdentity(assignment) {
        if (!assignment || typeof assignment !== 'object') {
            return { stableId: '', normalizedUrl: '' };
        }

        const candidates = [];
        if (typeof assignment.url === 'string' && assignment.url.trim()) {
            candidates.push(assignment.url.trim());
        }
        if (typeof assignment.fallbackUrl === 'string' && assignment.fallbackUrl.trim()) {
            candidates.push(assignment.fallbackUrl.trim());
        }

        for (const candidate of candidates) {
            const normalizedUrl = normalizeSyncTaskUrl(candidate);
            if (!normalizedUrl) continue;
            const stableId = buildStableSyncIdFromNormalizedUrl(normalizedUrl);
            if (!stableId) continue;
            return { stableId, normalizedUrl };
        }

        return { stableId: '', normalizedUrl: '' };
    }

    function parseSyncMetadataFromBody(bodyContent) {
        if (typeof bodyContent !== 'string' || !bodyContent) {
            return { stableId: '', normalizedUrl: '' };
        }
        const stableIdMatch = bodyContent.match(/(?:^|\n)\s*WC_SYNC_ID:([^\r\n]+)/i);
        const urlMatch = bodyContent.match(/(?:^|\n)\s*WC_SOURCE_URL:([^\r\n]+)/i);
        const stableId = stableIdMatch?.[1] ? stableIdMatch[1].trim() : '';
        const normalizedUrl = urlMatch?.[1] ? urlMatch[1].trim() : '';
        return { stableId, normalizedUrl };
    }

    function parseSyncMetadataFromTask(task) {
        const bodyContent = task?.body?.content;
        if (typeof bodyContent === 'string' && bodyContent.trim()) {
            return parseSyncMetadataFromBody(bodyContent);
        }
        const notes = task?.notes;
        if (typeof notes === 'string' && notes.trim()) {
            return parseSyncMetadataFromBody(notes);
        }
        const description = task?.description;
        if (typeof description === 'string' && description.trim()) {
            return parseSyncMetadataFromBody(description);
        }
        const content = task?.content;
        if (typeof content === 'string' && content.trim()) {
            return parseSyncMetadataFromBody(content);
        }
        const desc = task?.desc;
        if (typeof desc === 'string' && desc.trim()) {
            return parseSyncMetadataFromBody(desc);
        }
        return { stableId: '', normalizedUrl: '' };
    }

    globalScope.WebClassTodoSyncIdentity = {
        NOTE_ID_PREFIX,
        NOTE_URL_PREFIX,
        ID_PREFIX,
        normalizeSyncTaskUrl,
        buildStableSyncIdFromNormalizedUrl,
        getAssignmentSyncIdentity,
        parseSyncMetadataFromBody,
        parseSyncMetadataFromTask
    };
})(globalThis);
