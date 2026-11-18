// Only explicitly allowlisted JSON create endpoints are queued. Legacy unscoped
// entries are retained for review and are never replayed.
const OFFLINE_DB_NAME = 'CashManagementOfflineDB';
const OFFLINE_DB_VERSION = 2;
const LEGACY_STORE_NAME = 'sync_queue';
const QUEUE_STORE_NAME = 'safe_sync_queue';
const CAPABILITY_CACHE_KEY = 'cm_offline_idempotency_capability_v1';
const QUEUEABLE_CREATE_OPERATIONS = new Map([
    ['/api/transactions', {
        fields: new Set([
            'TransDate', 'TransType', 'Amount', 'AccountID', 'ToAccountID',
            'CategoryID', 'PartyID', 'Description', 'Reference', 'Tags'
        ]),
        required: ['TransDate', 'TransType', 'Amount', 'AccountID'],
        validate(body) {
            return isValidDateOnly(body.TransDate) &&
                (body.TransType !== 'Transfer' || hasValue(body.ToAccountID));
        }
    }],
    ['/api/accounts', {
        fields: new Set([
            'AccountName', 'AccountType', 'BankName', 'AccountNumber',
            'OpeningBalance', 'Color', 'Icon', 'Currency'
        ]),
        required: ['AccountName', 'AccountType', 'OpeningBalance']
    }],
    ['/api/parties', {
        fields: new Set([
            'PartyName', 'PartyType', 'Phone', 'Email', 'Address',
            'OpeningBalance', 'Notes'
        ]),
        required: ['PartyName']
    }],
    ['/api/budgets', {
        fields: new Set([
            'BudgetName', 'CategoryID', 'BudgetMonth', 'BudgetYear',
            'BudgetAmount', 'AlertPercent'
        ]),
        required: ['BudgetName', 'BudgetMonth', 'BudgetYear', 'BudgetAmount'],
        validate(body) {
            const month = Number(body.BudgetMonth);
            const year = Number(body.BudgetYear);
            return Number.isInteger(month) && month >= 1 && month <= 12 &&
                Number.isInteger(year) && year >= 1970 && year <= 2999;
        }
    }],
    ['/api/categories', {
        fields: new Set(['CategoryName', 'CategoryType', 'Icon', 'Color', 'ParentID']),
        required: ['CategoryName']
    }]
]);
let offlineQueueDb = null;
let isSyncingOfflineQueue = false;

function openOfflineQueueDb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB is unavailable.'));
            return;
        }
        if (offlineQueueDb) {
            resolve(offlineQueueDb);
            return;
        }

        const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(QUEUE_STORE_NAME)) {
                db.createObjectStore(QUEUE_STORE_NAME, { keyPath: 'idempotencyKey' });
            }
        };
        request.onsuccess = (event) => {
            offlineQueueDb = event.target.result;
            offlineQueueDb.onversionchange = () => {
                offlineQueueDb.close();
                offlineQueueDb = null;
            };
            resolve(offlineQueueDb);
        };
        request.onerror = () => reject(request.error || new Error('Could not open the offline queue.'));
    });
}

function transactionComplete(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Offline queue transaction failed.'));
        tx.onabort = () => reject(tx.error || new Error('Offline queue transaction aborted.'));
    });
}

async function addQueueItem(item) {
    const db = await openOfflineQueueDb();
    const tx = db.transaction(QUEUE_STORE_NAME, 'readwrite');
    const done = transactionComplete(tx);
    tx.objectStore(QUEUE_STORE_NAME).add(item);
    await done;
}

async function getQueueItem(idempotencyKey) {
    const db = await openOfflineQueueDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(QUEUE_STORE_NAME, 'readonly');
        const request = tx.objectStore(QUEUE_STORE_NAME).get(idempotencyKey);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Could not read the offline queue item.'));
    });
}

async function getAllQueueItems() {
    const db = await openOfflineQueueDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(QUEUE_STORE_NAME, 'readonly');
        const request = tx.objectStore(QUEUE_STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error || new Error('Could not read the offline queue.'));
    });
}

async function updateQueueItem(idempotencyKey, userId, changes) {
    const db = await openOfflineQueueDb();
    const tx = db.transaction(QUEUE_STORE_NAME, 'readwrite');
    const done = transactionComplete(tx);
    const store = tx.objectStore(QUEUE_STORE_NAME);
    const request = store.get(idempotencyKey);
    request.onsuccess = () => {
        const item = request.result;
        if (item && item.userId === userId) {
            store.put({ ...item, ...changes, updatedAt: new Date().toISOString() });
        }
    };
    request.onerror = () => {
        try { tx.abort(); } catch (_) {}
    };
    await done;
}

async function removeCompletedQueueItem(idempotencyKey, userId) {
    const db = await openOfflineQueueDb();
    const tx = db.transaction(QUEUE_STORE_NAME, 'readwrite');
    const done = transactionComplete(tx);
    const store = tx.objectStore(QUEUE_STORE_NAME);
    const request = store.get(idempotencyKey);
    request.onsuccess = () => {
        const item = request.result;
        if (item && item.userId === userId) store.delete(idempotencyKey);
    };
    request.onerror = () => {
        try { tx.abort(); } catch (_) {}
    };
    await done;
}

async function getLegacyQueueCount() {
    const db = await openOfflineQueueDb();
    if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) return 0;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(LEGACY_STORE_NAME, 'readonly');
        const request = tx.objectStore(LEGACY_STORE_NAME).count();
        request.onsuccess = () => resolve(request.result || 0);
        request.onerror = () => reject(request.error || new Error('Could not inspect legacy entries.'));
    });
}

function showOfflineMessage(message, type = 'warning') {
    if (typeof window.showToast === 'function') window.showToast(message, type);
    else console.warn('[OfflineSync]', message);
}

function browserIsOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function getActiveToken() {
    try {
        const token = localStorage.getItem('token');
        if (token) return token;
    } catch (_) {}
    try {
        const match = String(document.cookie || '').match(/(?:^|;\s*)token=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    } catch (_) {
        return '';
    }
}

function getLocalUserIds() {
    const candidates = [];
    if (window.currentUser && window.currentUser.UserID !== undefined) {
        candidates.push(Number(window.currentUser.UserID));
    }
    try {
        const raw = localStorage.getItem('user');
        if (raw) {
            const user = JSON.parse(raw);
            if (user && user.UserID !== undefined) candidates.push(Number(user.UserID));
        }
    } catch (_) {}
    return candidates.filter(id => Number.isSafeInteger(id) && id > 0);
}

function getLocalUserId() {
    const ids = getLocalUserIds();
    return ids.length && ids.every(id => id === ids[0]) ? ids[0] : null;
}

function getTokenUserId(token) {
    try {
        const encoded = String(token || '').split('.')[1];
        if (!encoded) return null;
        const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(window.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
        const userId = Number(payload.UserID);
        return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
    } catch (_) {
        return null;
    }
}

function readCachedCapability() {
    try {
        const raw = localStorage.getItem(CAPABILITY_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

function writeCachedCapability(value) {
    try {
        localStorage.setItem(CAPABILITY_CACHE_KEY, JSON.stringify(value));
    } catch (_) {}
}

function makeAuthHeaders(token) {
    return new Headers({ Authorization: `Bearer ${token}` });
}

function requestIsQueueable(request) {
    if (!request || String(request.method || '').toUpperCase() !== 'POST' ||
        typeof request.url !== 'string' || typeof request.body !== 'string') return false;

    try {
        const parsed = new URL(request.url, window.location.origin);
        if (parsed.origin !== window.location.origin || parsed.search || parsed.hash) return false;
        const operation = QUEUEABLE_CREATE_OPERATIONS.get(parsed.pathname);
        if (!operation) return false;
        const headers = new Headers(request.headers || {});
        if (!/^application\/json(?:\s*;|$)/i.test(headers.get('Content-Type') || '')) return false;
        const body = JSON.parse(request.body);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
        if (Object.keys(body).some(key => !operation.fields.has(key)) ||
            operation.required.some(key => !hasValue(body[key]))) return false;
        return typeof operation.validate !== 'function' || operation.validate(body);
    } catch (_) {
        return false;
    }
}

function hasValue(value) {
    return value !== undefined && value !== null && value !== '';
}

function isValidDateOnly(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function generateUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID().toLowerCase();
    }
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') {
        throw new Error('Secure UUID generation is unavailable.');
    }
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function fetchAuthenticatedUser(token) {
    const response = await fetch('/api/auth/me', {
        method: 'GET',
        headers: makeAuthHeaders(token),
        cache: 'no-store',
        silent: true
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success || !data.user ||
        !Number.isSafeInteger(Number(data.user.UserID)) || Number(data.user.UserID) <= 0) {
        return { error: 'The current server session could not be verified.', response, data };
    }

    const userId = Number(data.user.UserID);
    if (getTokenUserId(token) !== userId) {
        return { error: 'The current token does not match the authenticated server account.', mismatch: true };
    }
    if (getLocalUserIds().some(localUserId => localUserId !== userId)) {
        return { error: 'The cached account does not match the authenticated server account.', mismatch: true };
    }
    return { userId };
}

async function fetchIdempotencyCapability(token) {
    const response = await fetch('/api/idempotency/status', {
        method: 'GET',
        headers: makeAuthHeaders(token),
        cache: 'no-store',
        silent: true
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 503 && data.code === 'IDEMPOTENCY_SCHEMA_UNAVAILABLE') {
        return { state: 'unavailable', data };
    }
    if (response.status === 404 || data.supported === false) return { state: 'unsupported', data };
    if (response.ok && data.success === true && data.available === true &&
        data.scope === 'user' && Array.isArray(data.methods) &&
        data.methods.includes('POST') &&
        data.processingPolicy === 'fail-closed-manual-resolution') {
        return { state: 'available', data };
    }
    return { state: 'unknown', data };
}

async function readVerifiedContext(token) {
    const auth = await fetchAuthenticatedUser(token);
    if (auth.error) return auth;
    const capability = await fetchIdempotencyCapability(token);
    if (capability.state === 'available') {
        const cached = {
            userId: auth.userId,
            available: true,
            savedAt: new Date().toISOString()
        };
        writeCachedCapability(cached);
    } else if (capability.state === 'unavailable' || capability.state === 'unsupported') {
        writeCachedCapability({
            userId: auth.userId,
            available: false,
            savedAt: new Date().toISOString()
        });
    }
    return { userId: auth.userId, capability };
}

function cachedContextFor(token) {
    const cached = readCachedCapability();
    const localUserIds = getLocalUserIds();
    const tokenUserId = getTokenUserId(token);
    if (!cached || cached.available !== true ||
        !Number.isSafeInteger(Number(cached.userId)) ||
        Number(cached.userId) <= 0 ||
        tokenUserId !== Number(cached.userId) ||
        localUserIds.some(userId => userId !== Number(cached.userId))) return null;
    return { userId: Number(cached.userId), capability: { state: 'available', cached: true } };
}

async function verifyContextForMutation() {
    const token = getActiveToken();
    if (!token) return { state: 'unavailable', reason: 'No active browser token is available.' };

    if (browserIsOffline()) {
        const cached = cachedContextFor(token);
        return cached
            ? { state: 'available', ...cached, token, cached: true }
            : { state: 'blocked', reason: 'This account has no previously verified idempotency capability.' };
    }

    try {
        const verified = await readVerifiedContext(token);
        if (verified.error) return { state: verified.mismatch ? 'mismatch' : 'unavailable', reason: verified.error };
        if (verified.capability.state === 'available') {
            return { state: 'available', ...verified, token };
        }
        if (verified.capability.state === 'unavailable' || verified.capability.state === 'unsupported') {
            return { state: 'disabled', reason: 'The server has not enabled idempotent writes.' };
        }
        return { state: 'unknown', reason: 'The server idempotency capability could not be confirmed.' };
    } catch (error) {
        const cached = cachedContextFor(token);
        if (cached) return { state: 'available', ...cached, token, cached: true };
        return { state: 'unknown', reason: 'The server idempotency capability could not be confirmed.' };
    }
}

async function prepareMutation(request) {
    if (!requestIsQueueable(request)) {
        return browserIsOffline()
            ? { blocked: true, reason: 'This operation cannot be safely queued while offline.' }
            : { status: 'unsupported' };
    }

    const context = await verifyContextForMutation();
    if (context.state === 'disabled') {
        return browserIsOffline()
            ? { blocked: true, reason: 'Offline queueing is disabled because server idempotency storage is unavailable.' }
            : { status: 'disabled' };
    }
    if (context.state === 'unavailable' && !browserIsOffline()) return { status: 'unavailable' };
    if (context.state !== 'available') {
        return {
            blocked: true,
            reason: context.reason || 'The authenticated account and idempotency capability could not be verified.'
        };
    }

    let key;
    try {
        key = generateUuid();
        const item = {
            idempotencyKey: key,
            userId: context.userId,
            method: request.method.toUpperCase(),
            url: request.url,
            body: request.body,
            status: 'prepared',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await addQueueItem(item);
    } catch (error) {
        return { blocked: true, reason: `The create could not be durably prepared in this browser: ${error.message}` };
    }

    return {
        status: 'prepared',
        idempotencyKey: key,
        userId: context.userId,
        authorization: `Bearer ${context.token}`,
        url: request.url,
        method: request.method.toUpperCase(),
        body: request.body
    };
}

async function isReplayAuthorized(request) {
    if (!request || !request.idempotencyKey || !request.userId) return false;
    try {
        const item = await getQueueItem(request.idempotencyKey);
        return Boolean(item &&
            item.userId === request.userId &&
            item.method === request.method &&
            item.url === request.url &&
            item.body === request.body &&
            !['processing', 'hash_mismatch', 'manual_resolution', 'rejected'].includes(item.status));
    } catch (_) {
        return false;
    }
}

async function readRequestStatus(item, token) {
    const response = await fetch(`/api/idempotency/requests/${encodeURIComponent(item.idempotencyKey)}`, {
        method: 'GET',
        headers: makeAuthHeaders(token),
        cache: 'no-store',
        silent: true
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
        return { state: 'unavailable', response, data };
    }
    if (['not_found', 'processing', 'completed'].includes(data.state)) {
        return { state: data.state, response, data };
    }
    return { state: 'unavailable', response, data };
}

async function handleStoredCompletion(item, httpStatus, responseBody) {
    if (httpStatus >= 200 && httpStatus < 300 && responseBody && responseBody.success === true) {
        await removeCompletedQueueItem(item.idempotencyKey, item.userId);
        return true;
    }
    await updateQueueItem(item.idempotencyKey, item.userId, {
        status: 'rejected',
        lastCode: `HTTP_${httpStatus}`,
        lastMessage: 'The server stored a non-success response. Review this entry before taking further action.'
    });
    return false;
}

async function processServerResponse(item, response) {
    const data = await response.clone().json().catch(() => null);
    if (response.status === 409 && data && data.code === 'IDEMPOTENCY_REQUEST_PROCESSING') {
        await updateQueueItem(item.idempotencyKey, item.userId, {
            status: 'processing',
            lastCode: data.code,
            lastMessage: data.error || 'The server still reports this request as processing.'
        });
        showOfflineMessage('A queued create has an ambiguous server state and will not be retried automatically.');
        return 'stop';
    }
    if (response.status === 409 && data && data.code === 'IDEMPOTENCY_KEY_REUSED') {
        await updateQueueItem(item.idempotencyKey, item.userId, {
            status: 'hash_mismatch',
            lastCode: data.code,
            lastMessage: data.error || 'The request key is bound to a different payload.'
        });
        showOfflineMessage('A queued create key/payload mismatch was detected. It was kept and blocked from replay.');
        return 'stop';
    }
    if (response.status === 503 && data && (
        data.code === 'IDEMPOTENCY_SCHEMA_UNAVAILABLE' ||
        data.code === 'IDEMPOTENCY_STORAGE_UNAVAILABLE'
    )) {
        await updateQueueItem(item.idempotencyKey, item.userId, {
            status: 'schema_unavailable',
            lastCode: data.code,
            lastMessage: data.error || 'Idempotency storage is unavailable.'
        });
        showOfflineMessage('Server idempotency storage is unavailable. The queued create was retained.');
        return 'stop';
    }
    if (response.status === 503 && data && (
        data.code === 'IDEMPOTENCY_OUTCOME_AMBIGUOUS' ||
        data.code === 'IDEMPOTENCY_RESPONSE_UNAVAILABLE'
    )) {
        await updateQueueItem(item.idempotencyKey, item.userId, {
            status: 'manual_resolution',
            lastCode: data.code,
            lastMessage: data.error || 'The request outcome requires manual resolution.'
        });
        showOfflineMessage('The server could not confirm a stored outcome. This create was retained for manual resolution.');
        return 'stop';
    }
    if (response.status === 401) {
        await updateQueueItem(item.idempotencyKey, item.userId, {
            status: 'auth_required',
            lastCode: data && data.code ? data.code : 'AUTHENTICATION_REQUIRED',
            lastMessage: 'Sign in as the original authenticated user before resolving this entry.'
        });
        showOfflineMessage('This queued create needs the original account to be authenticated. It was retained.');
        return 'stop';
    }

    if (response.ok && data && data.success === true) {
        await removeCompletedQueueItem(item.idempotencyKey, item.userId);
        return 'complete';
    }

    await updateQueueItem(item.idempotencyKey, item.userId, {
        status: 'rejected',
        lastCode: data && data.code ? data.code : `HTTP_${response.status}`,
        lastMessage: data && data.error ? data.error : 'The server returned a non-success response.'
    });
    showOfflineMessage('The server rejected a queued create. It was retained for review.');
    return 'stop';
}

async function processQueueItem(item, token) {
    if (['hash_mismatch', 'manual_resolution', 'rejected'].includes(item.status)) {
        return 'stop';
    }

    const stored = await readRequestStatus(item, token);
    if (stored.state === 'processing') {
        await updateQueueItem(item.idempotencyKey, item.userId, {
            status: 'processing',
            lastCode: 'IDEMPOTENCY_REQUEST_PROCESSING',
            lastMessage: 'The server has an in-progress or ambiguous request; automatic replay is stopped.'
        });
        showOfflineMessage('A queued create is still processing or has an ambiguous outcome. It will not be retried automatically.');
        return 'stop';
    }
    if (stored.state === 'completed') {
        return handleStoredCompletion(item, stored.data.httpStatus, stored.data.responseBody)
            ? 'complete'
            : 'stop';
    }
    if (stored.state !== 'not_found') {
        const code = stored.data && stored.data.code;
        const manualResolution = code === 'IDEMPOTENCY_RESPONSE_UNAVAILABLE';
        await updateQueueItem(item.idempotencyKey, item.userId, {
            status: manualResolution ? 'manual_resolution' : 'status_unavailable',
            lastCode: code || 'IDEMPOTENCY_STATUS_UNAVAILABLE',
            lastMessage: 'The server could not establish this request key state.'
        });
        showOfflineMessage('The server could not verify a queued create. It was retained and not replayed.');
        return 'stop';
    }
    if (item.status === 'processing') {
        await updateQueueItem(item.idempotencyKey, item.userId, {
            status: 'manual_resolution',
            lastCode: 'IDEMPOTENCY_STATE_DISAPPEARED',
            lastMessage: 'A previously processing request is now absent from the status store; automatic replay remains blocked.'
        });
        showOfflineMessage('A previously processing create is no longer visible in the status store. It remains blocked for manual resolution.');
        return 'stop';
    }

    await updateQueueItem(item.idempotencyKey, item.userId, { status: 'replaying' });
    try {
        const response = await fetch(item.url, {
            method: item.method,
            headers: new Headers({
                'Content-Type': 'application/json',
                'Idempotency-Key': item.idempotencyKey,
                Authorization: `Bearer ${token}`
            }),
            body: item.body,
            cache: 'no-store',
            silent: true,
            _offlineSyncReplay: true,
            _offlineSyncUserId: item.userId
        });
        return processServerResponse(item, response);
    } catch (error) {
        await updateQueueItem(item.idempotencyKey, item.userId, {
            status: 'uncertain',
            lastCode: 'NETWORK_OUTCOME_UNCONFIRMED',
            lastMessage: 'The server response was lost. The same key will be checked before any further attempt.'
        });
        showOfflineMessage('Connection was lost during replay. The same create key was retained; server outcome is unconfirmed.');
        return 'stop';
    }
}

async function syncOfflineQueue() {
    if (isSyncingOfflineQueue) return false;
    isSyncingOfflineQueue = true;
    try {
        const items = await getAllQueueItems();
        const legacyCount = await getLegacyQueueCount().catch(() => -1);
        if (!items.length) {
            if (legacyCount > 0) {
                showOfflineMessage(`${legacyCount} legacy item(s) have no user binding and will not be replayed.`);
            }
            await updateOfflineQueueBadge();
            return true;
        }
        if (browserIsOffline()) {
            showOfflineMessage('Offline queue is waiting for a network connection. No queued create was sent.');
            return false;
        }

        const token = getActiveToken();
        if (!token) {
            showOfflineMessage('Sign in to the original account before syncing queued creates. Items were retained.');
            return false;
        }
        const auth = await fetchAuthenticatedUser(token);
        if (auth.error) {
            showOfflineMessage(auth.mismatch
                ? 'The signed-in account does not match the cached account. Queued creates were retained.'
                : 'The server could not verify the current account. Queued creates were retained.');
            return false;
        }
        const userId = auth.userId;
        const mismatched = items.some(item => item.userId !== userId);
        if (mismatched) {
            showOfflineMessage('Some queued creates belong to a different account. They were retained and not replayed.');
        }

        const capability = await fetchIdempotencyCapability(token);
        if (capability.state !== 'available') {
            const code = capability.data && capability.data.code;
            const status = code === 'IDEMPOTENCY_SCHEMA_UNAVAILABLE'
                ? 'Server idempotency schema is unavailable; queued entries remain on this device.'
                : 'Server replay readiness could not be verified; queued entries remain on this device.';
            for (const item of items) {
                if (item.userId === userId) {
                    await updateQueueItem(item.idempotencyKey, userId, {
                        status: code === 'IDEMPOTENCY_SCHEMA_UNAVAILABLE' ? 'schema_unavailable' : 'status_unavailable',
                        lastCode: code || 'IDEMPOTENCY_STATUS_UNAVAILABLE',
                        lastMessage: status
                    });
                }
            }
            showOfflineMessage(status);
            return false;
        }
        writeCachedCapability({
            userId,
            available: true,
            savedAt: new Date().toISOString()
        });

        const userItems = items
            .filter(item => item.userId === userId)
            .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        for (const item of userItems) {
            const result = await processQueueItem(item, token);
            if (result === 'stop') break;
        }
        await updateOfflineQueueBadge();
        return true;
    } catch (error) {
        console.error('[OfflineSync] Queue processing failed:', error);
        showOfflineMessage('Offline queue could not be processed. Pending items were retained.');
        return false;
    } finally {
        isSyncingOfflineQueue = false;
    }
}

async function handlePreparedMutationResponse(prepared, response) {
    if (!prepared) return;
    try {
        const data = await response.clone().json();
        if (response.ok && data && data.success === true) {
            await removeCompletedQueueItem(prepared.idempotencyKey, prepared.userId);
        } else {
            await processServerResponse({
                ...prepared,
                status: 'prepared'
            }, response);
        }
    } catch (error) {
        console.warn('[OfflineSync] Could not update prepared transaction status:', error);
    }
    await updateOfflineQueueBadge();
}

async function markPreparedMutationUncertain(prepared) {
    if (!prepared) return;
    try {
        await updateQueueItem(prepared.idempotencyKey, prepared.userId, {
            status: 'uncertain',
            lastCode: 'NETWORK_OUTCOME_UNCONFIRMED',
            lastMessage: 'The initial server response was lost. The stored key will be checked before replay.'
        });
        showOfflineMessage('Create was stored in this browser’s queue; server save is not confirmed.');
        await updateOfflineQueueBadge();
    } catch (error) {
        console.error('[OfflineSync] Could not update queued transaction status:', error);
    }
}

async function validateReplay(request) {
    if (!request || !request.idempotencyKey || !request.userId) return false;
    try {
        const item = await getQueueItem(request.idempotencyKey);
        return Boolean(item &&
            item.userId === Number(request.userId) &&
            item.method === String(request.method || '').toUpperCase() &&
            item.url === request.url &&
            item.body === request.body &&
            !['processing', 'hash_mismatch', 'manual_resolution', 'rejected'].includes(item.status));
    } catch (_) {
        return false;
    }
}

async function getPendingOfflineMutations() {
    const [items, legacyCount] = await Promise.all([
        getAllQueueItems(),
        getLegacyQueueCount().catch(() => -1)
    ]);
    return {
        items: items.map(item => ({
            idempotencyKey: item.idempotencyKey,
            userId: item.userId,
            method: item.method,
            url: item.url,
            status: item.status,
            createdAt: item.createdAt,
            lastCode: item.lastCode || null
        })),
        legacyCount
    };
}

async function updateOfflineQueueBadge() {
    const badge = document.getElementById('offlineSyncBadge');
    if (!badge) return;
    try {
        const { items, legacyCount } = await getPendingOfflineMutations();
        const currentId = getLocalUserId();
        const mine = currentId ? items.filter(item => item.userId === currentId) : [];
        const otherCount = items.length - mine.length;
        if (!items.length && legacyCount <= 0) {
            badge.style.display = 'none';
            return;
        }

        badge.style.display = 'inline-flex';
        const blocked = mine.filter(item => ['processing', 'hash_mismatch', 'manual_resolution', 'rejected', 'schema_unavailable', 'status_unavailable', 'auth_required'].includes(item.status)).length;
        const pending = mine.length - blocked;
        badge.textContent = [
            pending ? `⏳ ${pending} Pending` : '',
            blocked ? `⚠ ${blocked} Needs review` : '',
            otherCount ? `🔒 ${otherCount} Other account` : '',
            legacyCount > 0 ? `⚠ ${legacyCount} Legacy` : ''
        ].filter(Boolean).join(' · ');
        badge.title = otherCount
            ? 'Some entries belong to another account. Sign in as their original user; they will never be replayed under this account.'
            : legacyCount > 0
                ? 'Legacy entries have no authenticated user binding and will never be replayed.'
                : blocked
                    ? 'Some entries are blocked by a server conflict, pending outcome, or unavailable idempotency schema. They were retained.'
                    : 'Pending creates are persisted per authenticated user and replayed only after server idempotency checks.';
    } catch (error) {
        console.warn('[OfflineSync] Could not update queue badge:', error);
        badge.style.display = 'inline-flex';
        badge.textContent = '⚠ Queue status unavailable';
        badge.title = 'Queue data was not removed; status could not be read.';
    }
}

window.offlineSyncEngine = {
    prepareMutation,
    handleResponse: handlePreparedMutationResponse,
    markUncertain: markPreparedMutationUncertain,
    validateReplay,
    sync: syncOfflineQueue,
    getPending: getPendingOfflineMutations,
    updateBadge: updateOfflineQueueBadge
};

window.addEventListener('online', syncOfflineQueue);
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        updateOfflineQueueBadge();
        syncOfflineQueue();
    }, { once: true });
} else {
    updateOfflineQueueBadge();
    syncOfflineQueue();
}
