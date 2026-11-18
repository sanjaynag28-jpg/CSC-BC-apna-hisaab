const crypto = require('crypto');

const REQUEST_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stableJson(value) {
    if (value === null || typeof value !== 'object') {
        const encoded = JSON.stringify(value);
        if (encoded === undefined) throw new Error('Request body is not valid JSON');
        return encoded;
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableJson).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function hashRequest(method, requestPath, body) {
    const canonical = JSON.stringify([
        String(method || '').toUpperCase(),
        String(requestPath || ''),
        stableJson(body)
    ]);
    return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function createIdempotencyMiddleware(store, logger = console) {
    return async function idempotencyMiddleware(req, res, next) {
        const rawKey = req.headers && req.headers['idempotency-key'];
        if (rawKey === undefined) return next();

        if (!req.user || !Number.isSafeInteger(Number(req.user.UserID)) || Number(req.user.UserID) <= 0) {
            return res.status(401).json({
                success: false,
                code: 'AUTHENTICATION_REQUIRED',
                error: 'An authenticated user is required for idempotent requests.'
            });
        }
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(req.method || '').toUpperCase())) {
            return res.status(400).json({
                success: false,
                code: 'IDEMPOTENCY_METHOD_UNSUPPORTED',
                error: 'Idempotency-Key is supported only for POST, PUT, PATCH, and DELETE requests.'
            });
        }
        if (typeof rawKey !== 'string' || !REQUEST_KEY_RE.test(rawKey.trim())) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_IDEMPOTENCY_KEY',
                error: 'Idempotency-Key must be a UUID.'
            });
        }
        if (req.body === undefined) {
            return res.status(400).json({
                success: false,
                code: 'IDEMPOTENCY_BODY_REQUIRED',
                error: 'A valid request body is required with Idempotency-Key.'
            });
        }

        const requestKey = rawKey.trim().toLowerCase();
        const userId = Number(req.user.UserID);
        let requestHash;
        try {
            requestHash = hashRequest(req.method, req.originalUrl || req.url, req.body);
        } catch (err) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_IDEMPOTENCY_BODY',
                error: 'Request body must contain valid JSON data.'
            });
        }

        let reservation;
        try {
            reservation = await store.reserve({ userId, requestKey, requestHash });
        } catch (err) {
            if (logger && typeof logger.error === 'function') {
                logger.error('[Idempotency] Reservation storage unavailable:', err.message);
            }
            return res.status(503).json({
                success: false,
                code: 'IDEMPOTENCY_STORAGE_UNAVAILABLE',
                error: 'Idempotency storage is unavailable; the request was not executed.'
            });
        }

        if (reservation.state === 'hash_mismatch') {
            return res.status(409).json({
                success: false,
                code: 'IDEMPOTENCY_KEY_REUSED',
                error: 'This Idempotency-Key was already used with a different request.'
            });
        }
        if (reservation.state === 'processing') {
            // Never expire/reclaim this state: a crashed request may already have changed business data.
            return res.status(409).json({
                success: false,
                code: 'IDEMPOTENCY_REQUEST_PROCESSING',
                error: 'This request is still processing or has an ambiguous outcome. It will not be re-executed; resolve the existing request before retrying.'
            });
        }
        if (reservation.state === 'completed') {
            let responseBody;
            try {
                responseBody = JSON.parse(reservation.responseBody);
            } catch (err) {
                return res.status(503).json({
                    success: false,
                    code: 'IDEMPOTENCY_RESPONSE_UNAVAILABLE',
                    error: 'The stored response cannot be replayed. The request will not be re-executed.'
                });
            }
            return res.status(reservation.httpStatus).json(responseBody);
        }
        if (reservation.state !== 'reserved') {
            return res.status(503).json({
                success: false,
                code: 'IDEMPOTENCY_STORAGE_UNAVAILABLE',
                error: 'Idempotency storage returned an invalid reservation state; the request was not executed.'
            });
        }

        let responseState = 'reserved';
        let dispatchingAmbiguousResponse = false;
        const originalJson = res.json.bind(res);
        const originalSend = res.send.bind(res);
        const originalWrite = res.write.bind(res);
        const originalEnd = res.end.bind(res);

        function sendAmbiguousResponse(err) {
            if (responseState === 'ambiguous') return res;
            responseState = 'ambiguous';
            if (logger && typeof logger.error === 'function') {
                logger.error('[Idempotency] Failed to persist completed response:', err.message);
            }
            res.statusCode = 503;
            dispatchingAmbiguousResponse = true;
            try {
                return originalJson({
                    success: false,
                    code: 'IDEMPOTENCY_OUTCOME_AMBIGUOUS',
                    error: 'The operation may have completed, but its response could not be saved. Do not retry with a new key; the existing key is reserved for manual resolution.'
                });
            } finally {
                dispatchingAmbiguousResponse = false;
            }
        }

        async function persistThenSend(body, sendResponse) {
            if (responseState !== 'reserved') return res;
            responseState = 'persisting';
            let serializedBody;
            try {
                serializedBody = JSON.stringify(body);
                if (serializedBody === undefined) serializedBody = 'null';
                await store.complete({
                    userId,
                    requestKey,
                    requestHash,
                    httpStatus: res.statusCode,
                    responseBody: serializedBody
                });
                responseState = 'completed';
                return sendResponse();
            } catch (err) {
                return sendAmbiguousResponse(err);
            }
        }

        res.json = function (body) {
            return persistThenSend(body, () => originalJson(body));
        };

        res.send = function (body) {
            if (responseState === 'ambiguous' && !dispatchingAmbiguousResponse) return res;
            if (responseState !== 'reserved') return originalSend(body);
            if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
                return persistThenSend(body, () => originalJson(body));
            }
            const contentType = String(res.getHeader && res.getHeader('Content-Type') || '');
            if (!/application\/(?:[a-z0-9.+-]+\+)?json\b/i.test(contentType)) {
                return sendAmbiguousResponse(new Error('Idempotent API responses must be JSON'));
            }
            let parsed;
            try {
                parsed = Buffer.isBuffer(body) ? JSON.parse(body.toString('utf8')) : JSON.parse(String(body));
            } catch (err) {
                return sendAmbiguousResponse(new Error('Idempotent API responses must be JSON'));
            }
            return persistThenSend(parsed, () => originalSend(body));
        };

        res.write = function (...args) {
            if (responseState === 'reserved') {
                sendAmbiguousResponse(new Error('Idempotent API responses must be JSON'));
                return false;
            }
            if (responseState === 'ambiguous' && !dispatchingAmbiguousResponse) return false;
            return originalWrite(...args);
        };

        res.end = function (...args) {
            if (responseState === 'reserved') {
                sendAmbiguousResponse(new Error('Idempotent API responses must be JSON'));
                return res;
            }
            if (responseState === 'ambiguous' && !dispatchingAmbiguousResponse) return res;
            return originalEnd(...args);
        };

        return next();
    };
}

module.exports = {
    REQUEST_KEY_RE,
    stableJson,
    hashRequest,
    createIdempotencyMiddleware
};
