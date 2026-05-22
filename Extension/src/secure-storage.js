// secure-storage.js
// Local-only encryption helpers backed by a non-extractable AES-GCM key in IndexedDB.

(function initWebClassSecureStorage(globalScope) {
    const DB_NAME = 'webclass_ux_secure_storage';
    const DB_VERSION = 1;
    const KEY_STORE_NAME = 'keys';
    const KEY_RECORD_ID = 'local_aes_gcm_v1';
    const PAYLOAD_MARKER_KEY = '__wcEncV1';
    const PAYLOAD_VERSION = 1;
    const AES_GCM_IV_BYTES = 12;

    let cachedCryptoKey = null;
    let pendingCryptoKeyPromise = null;

    function hasRequiredApis() {
        return !!(
            globalScope?.indexedDB
            && globalScope?.crypto
            && globalScope?.crypto?.subtle
            && typeof globalScope.btoa === 'function'
            && typeof globalScope.atob === 'function'
        );
    }

    function bytesToBase64(bytes) {
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const slice = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...slice);
        }
        return btoa(binary);
    }

    function base64ToBytes(base64Text) {
        const binary = atob(base64Text);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
                    db.createObjectStore(KEY_STORE_NAME, { keyPath: 'id' });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Failed to open secure storage database.'));
        });
    }

    function idbGet(db, storeName, key) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Failed to read secure storage key record.'));
        });
    }

    function idbPut(db, storeName, value) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Failed to write secure storage key record.'));
            tx.onabort = () => reject(tx.error || new Error('Secure storage key write was aborted.'));
            tx.objectStore(storeName).put(value);
        });
    }

    function isUsableCryptoKey(value) {
        return !!(value && typeof value === 'object' && value.type === 'secret');
    }

    async function getOrCreateCryptoKey() {
        if (cachedCryptoKey) return cachedCryptoKey;
        if (pendingCryptoKeyPromise) return pendingCryptoKeyPromise;

        pendingCryptoKeyPromise = (async () => {
            if (!hasRequiredApis()) {
                throw new Error('Secure storage APIs are unavailable.');
            }

            const db = await openDatabase();
            try {
                const existing = await idbGet(db, KEY_STORE_NAME, KEY_RECORD_ID);
                if (isUsableCryptoKey(existing?.key)) {
                    cachedCryptoKey = existing.key;
                    return cachedCryptoKey;
                }

                const created = await crypto.subtle.generateKey(
                    { name: 'AES-GCM', length: 256 },
                    false,
                    ['encrypt', 'decrypt']
                );

                await idbPut(db, KEY_STORE_NAME, {
                    id: KEY_RECORD_ID,
                    key: created,
                    createdAt: new Date().toISOString()
                });
                cachedCryptoKey = created;
                return cachedCryptoKey;
            } finally {
                db.close();
            }
        })();

        try {
            return await pendingCryptoKeyPromise;
        } finally {
            pendingCryptoKeyPromise = null;
        }
    }

    function isEncryptedPayload(payload) {
        return !!(
            payload
            && typeof payload === 'object'
            && payload[PAYLOAD_MARKER_KEY] === PAYLOAD_VERSION
            && typeof payload.iv === 'string'
            && typeof payload.data === 'string'
        );
    }

    async function encryptString(plainText) {
        if (typeof plainText !== 'string') {
            throw new Error('encryptString expects a string value.');
        }

        const key = await getOrCreateCryptoKey();
        const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
        const encoded = new TextEncoder().encode(plainText);
        const encryptedBuffer = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoded
        );

        return {
            [PAYLOAD_MARKER_KEY]: PAYLOAD_VERSION,
            iv: bytesToBase64(iv),
            data: bytesToBase64(new Uint8Array(encryptedBuffer))
        };
    }

    async function decryptString(payload) {
        if (!isEncryptedPayload(payload)) {
            throw new Error('decryptString received an invalid encrypted payload.');
        }

        const key = await getOrCreateCryptoKey();
        const ivBytes = base64ToBytes(payload.iv);
        const dataBytes = base64ToBytes(payload.data);
        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivBytes },
            key,
            dataBytes
        );

        return new TextDecoder().decode(decryptedBuffer);
    }

    globalScope.WebClassSecureStorage = {
        isAvailable: hasRequiredApis,
        isEncryptedPayload,
        encryptString,
        decryptString
    };
})(globalThis);
