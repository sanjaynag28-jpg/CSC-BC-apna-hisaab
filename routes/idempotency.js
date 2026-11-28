const express = require('express');
const router = express.Router();
const { query, sql } = require('../database/db');
const { REQUEST_KEY_RE } = require('../utils/idempotencyMiddleware');

router.get('/requests/:uuid', async (req, res) => {
    const requestKey = String(req.params.uuid || '').trim();
    if (!REQUEST_KEY_RE.test(requestKey)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_IDEMPOTENCY_KEY',
            error: 'Request key must be a UUID.'
        });
    }

    try {
        const result = await query(`
            SELECT State, HttpStatus, ResponseBody
            FROM dbo.ApiIdempotencyRequests
            WHERE UserID = @userId AND RequestKey = @requestKey
        `, {
            userId: { type: sql.Int, value: req.user.UserID },
            requestKey: { type: sql.UniqueIdentifier, value: requestKey.toLowerCase() }
        });
        const stored = result.recordset && result.recordset[0];
        if (!stored) {
            return res.json({ success: true, state: 'not_found' });
        }

        if (String(stored.State || '').toLowerCase() === 'processing') {
            return res.json({ success: true, state: 'processing' });
        }
        if (String(stored.State || '').toLowerCase() !== 'completed') {
            return res.status(503).json({
                success: false,
                code: 'IDEMPOTENCY_RESPONSE_UNAVAILABLE',
                error: 'The stored request state is invalid; do not replay it automatically.'
            });
        }

        const httpStatus = Number(stored.HttpStatus);
        let responseBody;
        try {
            if (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599 ||
                stored.ResponseBody === null || stored.ResponseBody === undefined) {
                throw new Error('Stored response is incomplete');
            }
            responseBody = JSON.parse(stored.ResponseBody);
        } catch (err) {
            return res.status(503).json({
                success: false,
                code: 'IDEMPOTENCY_RESPONSE_UNAVAILABLE',
                error: 'The stored response cannot be read; do not replay it automatically.'
            });
        }

        return res.json({
            success: true,
            state: 'completed',
            httpStatus,
            responseBody
        });
    } catch (err) {
        return res.status(503).json({
            success: false,
            code: 'IDEMPOTENCY_STORAGE_UNAVAILABLE',
            error: 'Idempotency storage is unavailable; request state could not be determined.'
        });
    }
});

router.get('/status', async (req, res) => {
    try {
        let available = false;
        try {
            // SQLite native schema verification
            const colsRes = await query(`PRAGMA table_info('ApiIdempotencyRequests')`);
            const colNames = new Set((colsRes.recordset || []).map(c => c.name));
            const requiredCols = ['UserID', 'RequestKey', 'RequestHash', 'State', 'HttpStatus', 'ResponseBody', 'CreatedAt', 'CompletedAt'];
            const hasAllCols = requiredCols.every(c => colNames.has(c));

            let hasUniquePair = false;
            if (hasAllCols) {
                const idxRes = await query(`PRAGMA index_list('ApiIdempotencyRequests')`);
                for (const idx of (idxRes.recordset || [])) {
                    if (!idx.unique || !idx.name) continue;
                    const infoRes = await query(`PRAGMA index_info('${String(idx.name).replace(/'/g, "''")}')`);
                    const idxCols = (infoRes.recordset || []).map(r => r.name);
                    if (idxCols.length === 2 && idxCols.includes('UserID') && idxCols.includes('RequestKey')) {
                        hasUniquePair = true;
                        break;
                    }
                }
            }
            available = hasAllCols && hasUniquePair;
        } catch (_sqliteErr) {
            // Legacy SQL Server readiness check (kept for dual-compatibility)
            const result = await query(`
                SELECT CASE
                    WHEN OBJECT_ID(N'dbo.ApiIdempotencyRequests', N'U') IS NULL THEN 0
                    WHEN COL_LENGTH(N'dbo.ApiIdempotencyRequests', N'UserID') IS NULL THEN 0
                    WHEN COL_LENGTH(N'dbo.ApiIdempotencyRequests', N'RequestKey') IS NULL THEN 0
                    WHEN COL_LENGTH(N'dbo.ApiIdempotencyRequests', N'RequestHash') IS NULL THEN 0
                    WHEN COL_LENGTH(N'dbo.ApiIdempotencyRequests', N'State') IS NULL THEN 0
                    WHEN COL_LENGTH(N'dbo.ApiIdempotencyRequests', N'HttpStatus') IS NULL THEN 0
                    WHEN COL_LENGTH(N'dbo.ApiIdempotencyRequests', N'ResponseBody') IS NULL THEN 0
                    WHEN COL_LENGTH(N'dbo.ApiIdempotencyRequests', N'CreatedAt') IS NULL THEN 0
                    WHEN COL_LENGTH(N'dbo.ApiIdempotencyRequests', N'CompletedAt') IS NULL THEN 0
                    WHEN NOT EXISTS (
                        SELECT 1
                        FROM sys.indexes i
                        INNER JOIN sys.index_columns userKey
                            ON userKey.object_id = i.object_id
                           AND userKey.index_id = i.index_id
                           AND userKey.key_ordinal = 1
                        INNER JOIN sys.columns userColumn
                            ON userColumn.object_id = userKey.object_id
                           AND userColumn.column_id = userKey.column_id
                        INNER JOIN sys.index_columns requestKey
                            ON requestKey.object_id = i.object_id
                           AND requestKey.index_id = i.index_id
                           AND requestKey.key_ordinal = 2
                        INNER JOIN sys.columns requestColumn
                            ON requestColumn.object_id = requestKey.object_id
                           AND requestColumn.column_id = requestKey.column_id
                        WHERE i.object_id = OBJECT_ID(N'dbo.ApiIdempotencyRequests', N'U')
                          AND i.is_unique = 1
                          AND userColumn.name = N'UserID'
                          AND requestColumn.name = N'RequestKey'
                    ) THEN 0
                    ELSE 1
                END AS IsAvailable
            `);
            available = Boolean(result.recordset && result.recordset[0] && result.recordset[0].IsAvailable);
        }
        if (!available) {
            return res.status(503).json({
                success: false,
                supported: true,
                available: false,
                code: 'IDEMPOTENCY_SCHEMA_UNAVAILABLE'
            });
        }
        return res.json({
            success: true,
            supported: true,
            available: true,
            scope: 'user',
            methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
            processingPolicy: 'fail-closed-manual-resolution'
        });
    } catch (err) {
        return res.status(503).json({
            success: false,
            supported: true,
            available: false,
            code: 'IDEMPOTENCY_SCHEMA_UNAVAILABLE'
        });
    }
});

module.exports = router;
