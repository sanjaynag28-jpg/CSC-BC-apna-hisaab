function createSqlIdempotencyStore(query, sql) {
    function keyParams(userId, requestKey) {
        return {
            userId: { type: sql.Int, value: userId },
            requestKey: { type: sql.UniqueIdentifier, value: requestKey }
        };
    }

    async function readRequest(userId, requestKey) {
        const result = await query(`
            SELECT RequestHash, State, HttpStatus, ResponseBody
            FROM dbo.ApiIdempotencyRequests
            WHERE UserID = @userId AND RequestKey = @requestKey
        `, keyParams(userId, requestKey));
        return result.recordset && result.recordset[0];
    }

    return {
        async reserve({ userId, requestKey, requestHash }) {
            try {
                await query(`
                    INSERT INTO dbo.ApiIdempotencyRequests (
                        UserID, RequestKey, RequestHash, State, CreatedAt
                    )
                    VALUES (
                        @userId, @requestKey, @requestHash, N'processing', SYSUTCDATETIME()
                    )
                `, {
                    ...keyParams(userId, requestKey),
                    requestHash: { type: sql.Char(64), value: requestHash }
                });
                return { state: 'reserved' };
            } catch (err) {
                const errorNumbers = [
                    err && err.number,
                    err && err.originalError && err.originalError.info && err.originalError.info.number,
                    ...((err && err.precedingErrors) || []).map(previous => previous.number)
                ];
                if (!errorNumbers.some(number => number === 2601 || number === 2627)) {
                    throw err;
                }

                const existing = await readRequest(userId, requestKey);
                if (!existing) throw err;
                if (existing.RequestHash !== requestHash) return { state: 'hash_mismatch' };
                if (String(existing.State || '').toLowerCase() === 'completed') {
                    const status = Number(existing.HttpStatus);
                    if (!Number.isInteger(status) || status < 100 || status > 599 ||
                        existing.ResponseBody === null || existing.ResponseBody === undefined) {
                        throw new Error('Stored idempotency response is incomplete');
                    }
                    return {
                        state: 'completed',
                        httpStatus: status,
                        responseBody: existing.ResponseBody
                    };
                }
                return { state: 'processing' };
            }
        },

        async complete({ userId, requestKey, requestHash, httpStatus, responseBody }) {
            const result = await query(`
                UPDATE dbo.ApiIdempotencyRequests
                SET State = N'completed',
                    HttpStatus = @httpStatus,
                    ResponseBody = @responseBody,
                    CompletedAt = SYSUTCDATETIME()
                WHERE UserID = @userId
                  AND RequestKey = @requestKey
                  AND RequestHash = @requestHash
                  AND State = N'processing'
            `, {
                ...keyParams(userId, requestKey),
                requestHash: { type: sql.Char(64), value: requestHash },
                httpStatus: { type: sql.Int, value: httpStatus },
                responseBody: { type: sql.NVarChar(sql.MAX), value: responseBody }
            });
            if (!result.rowsAffected || result.rowsAffected[0] !== 1) {
                throw new Error('Idempotency reservation could not be completed');
            }
        }
    };
}

module.exports = { createSqlIdempotencyStore };
