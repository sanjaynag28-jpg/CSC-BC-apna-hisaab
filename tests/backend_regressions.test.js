const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { resolveTenantBillAccounts } = require('../utils/billPaymentAccounts');
const { createIdempotencyMiddleware, hashRequest } = require('../utils/idempotencyMiddleware');
const { createSqlIdempotencyStore } = require('../utils/idempotencyStore');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('authenticated routes never fall back to tenant 1 when identity is missing', () => {
    const routeFiles = fs.readdirSync(path.join(root, 'routes')).filter(file => file.endsWith('.js'));
    for (const file of routeFiles) {
        assert.doesNotMatch(
            read(path.join('routes', file)),
            /req\.user\?\.UserID\s*\|\|\s*1/,
            `${file} must not silently use tenant 1`
        );
    }
    assert.doesNotMatch(read('server.js'), /req\.user\?\.UserID\s*\|\|\s*1/);
});

function createMemoryIdempotencyStore() {
    const records = new Map();
    const recordKey = (userId, requestKey) => `${userId}:${requestKey}`;
    return {
        records,
        async reserve({ userId, requestKey, requestHash }) {
            const key = recordKey(userId, requestKey);
            const existing = records.get(key);
            if (!existing) {
                records.set(key, { requestHash, state: 'processing' });
                return { state: 'reserved' };
            }
            if (existing.requestHash !== requestHash) return { state: 'hash_mismatch' };
            return existing.state === 'completed'
                ? { state: 'completed', httpStatus: existing.httpStatus, responseBody: existing.responseBody }
                : { state: 'processing' };
        },
        async complete({ userId, requestKey, requestHash, httpStatus, responseBody }) {
            const existing = records.get(recordKey(userId, requestKey));
            if (!existing || existing.requestHash !== requestHash || existing.state !== 'processing') {
                throw new Error('reservation missing');
            }
            existing.state = 'completed';
            existing.httpStatus = httpStatus;
            existing.responseBody = responseBody;
        }
    };
}

function createMockResponse() {
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    const res = {
        statusCode: 200,
        body: undefined,
        finished: false,
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        json(body) {
            this.body = body;
            this.finished = true;
            finish({ status: this.statusCode, body });
            return this;
        },
        send(body) {
            this.body = body;
            this.finished = true;
            finish({ status: this.statusCode, body });
            return this;
        },
        write() {
            return true;
        },
        end(body) {
            if (body !== undefined) this.body = body;
            this.finished = true;
            finish({ status: this.statusCode, body: this.body });
            return this;
        }
    };
    res.waitForFinish = () => finished;
    return res;
}

function idempotentRequest({ userId = 4, key = 'b7a7b360-3b1a-4db4-b59c-d70886ce18f1', body = { amount: 25 }, path: requestPath = '/api/transactions' } = {}) {
    return {
        method: 'POST',
        originalUrl: requestPath,
        url: requestPath,
        body,
        headers: { 'idempotency-key': key },
        user: { UserID: userId }
    };
}

test('bill payment accounts are validated against the caller tenant', async () => {
    const billPaymentsRoute = read('routes/bill_payments.js');
    assert.doesNotMatch(billPaymentsRoute, /req\.user(?:\?\.UserID\s*\|\|\s*1|\s*\?\s*req\.user\.UserID\s*:\s*1)/);
    assert.doesNotMatch(billPaymentsRoute, /WalletAccountID\s*=\s*2|CashAccountID\s*=\s*1/);

    const calls = [];
    const owners = { 11: 7, 12: 7, 21: 8, 22: 8 };
    const dbQuery = async (sql, params) => {
        calls.push({ sql, params });
        if (params.id !== undefined) {
            return { recordset: owners[params.id] === params.userId ? [{ AccountID: params.id }] : [] };
        }
        const accountId = sql.includes("AccountType = 'Cash'") ? 11 : 12;
        return { recordset: owners[accountId] === params.userId ? [{ AccountID: accountId }] : [] };
    };

    await assert.rejects(
        resolveTenantBillAccounts(7, 21, 11, dbQuery),
        /Wallet\/Bank Account/
    );
    assert.equal(calls.length, 2);
    assert.equal(calls[0].params.userId, 7);
    assert.equal(calls[1].params.userId, 7);

    calls.length = 0;
    await assert.rejects(
        resolveTenantBillAccounts(7, '12x', 11, dbQuery),
        /valid hona chahiye/
    );
    assert.equal(calls.length, 1, 'invalid wallet ID must not trigger a fallback query');

    calls.length = 0;
    assert.deepEqual(await resolveTenantBillAccounts(7, undefined, undefined, dbQuery), {
        effCashId: 11,
        effWalletId: 12
    });
    assert.ok(calls.every(({ params }) => params.userId === 7));
});

test('customer and CSC import/export routes pass the authenticated tenant', () => {
    const customers = read('routes/customers.js');
    const csc = read('routes/csc.js');
    const settings = read('routes/settings.js');
    const excel = read('routes/excel_manager.js');

    assert.match(customers, /exportCustomersToExcel\(res,\s*req\.user\.UserID\)/);
    assert.match(customers, /importCustomersFromExcel\(req\.file\.buffer,\s*req\.file\.originalname,\s*req\.user\.UserID\)/);
    assert.match(csc, /exportCSCToExcel\(req\.query,\s*res,\s*req\.user\.UserID\)/);
    assert.match(csc, /importCSCFromExcel\(req\.file\.buffer,\s*req\.file\.originalname,\s*req\.user\.UserID\)/);
    assert.match(settings, /exportCustomersToExcel\(res,\s*userId\)/);
    assert.match(settings, /importCustomersFromExcel\(req\.file\.buffer,\s*req\.file\.originalname,\s*userId\)/);
    assert.match(settings, /exportCSCToExcel\(req\.query,\s*res,\s*userId\)/);
    assert.match(settings, /importCSCFromExcel\(req\.file\.buffer,\s*req\.file\.originalname,\s*userId\)/);
    assert.doesNotMatch(excel, /(?:exportCustomersToExcel|importCustomersFromExcel|exportCSCToExcel|importCSCFromExcel)\([^)]*userId\s*=\s*1/);
});

test('cashbook and invoice audit entries include the authenticated user', () => {
    for (const file of ['routes/transactions.js', 'routes/invoices.js']) {
        const source = read(file);
        const auditCalls = [...source.matchAll(/await logAudit\(\{([\s\S]*?)\n\s*\}\);/g)];
        assert.ok(auditCalls.length > 0, `${file} should contain audit calls`);
        for (const call of auditCalls) {
            assert.match(call[1], /\buserId\s*,/, `${file} audit call must be tenant-scoped`);
        }
    }
});

test('invoice payment history keeps per-installment dates and does not move the cumulative mirror date', () => {
    const source = read('routes/invoices.js');
    assert.match(source, /entryDate:\s*PaymentDate\s*\|\|\s*todayLocal\(\)/);
    assert.match(source, /SET Amount = @amount, AccountID = @accId,\s*Description = @desc/);
    assert.doesNotMatch(source, /SET Amount = @amount, AccountID = @accId, TransDate = @date/);

    const reports = read('routes/reports.js');
    assert.match(reports, /payment\.EntryDate, payment\.EntryTime/);
    assert.match(reports, /NOT \(\$\{invoiceMirrorHasPaymentHistory\('t'\)\}\)/);
    assert.match(reports, /FROM KhataEntries k[\s\S]*?k\.EntryDate >= @yearStart/);
});

test('SSE only sends the live handshake after a successful database check', () => {
    const source = read('server.js');
    const route = source.slice(source.indexOf("app.get('/api/live-events'"), source.indexOf('function broadcastDataChange'));
    assert.ok(route.indexOf('await isDbAlive()') < route.indexOf('res.setHeader'));
    assert.ok(route.indexOf("res.status(503)") < route.indexOf("type: 'CONNECTED'"));
});

test('idempotency hashes JSON bodies independent of object key order', () => {
    assert.equal(
        hashRequest('post', '/api/transactions', { account: 2, amount: 25 }),
        hashRequest('POST', '/api/transactions', { amount: 25, account: 2 })
    );
    assert.notEqual(
        hashRequest('POST', '/api/transactions', { amount: 25 }),
        hashRequest('POST', '/api/transactions', { amount: 26 })
    );
});

test('idempotency reserves before effects, rejects concurrent duplicates, then replays completion', async () => {
    const store = createMemoryIdempotencyStore();
    const middleware = createIdempotencyMiddleware(store, { error() {} });
    const first = createMockResponse();
    let sideEffects = 0;
    await middleware(idempotentRequest(), first, () => { sideEffects++; });

    const concurrent = createMockResponse();
    await middleware(idempotentRequest(), concurrent, () => { sideEffects++; });
    assert.equal(concurrent.statusCode, 409);
    assert.equal(concurrent.body.code, 'IDEMPOTENCY_REQUEST_PROCESSING');
    assert.equal(sideEffects, 1);

    first.status(201);
    await first.json({ success: true, transactionId: 55 });
    const duplicate = createMockResponse();
    await middleware(idempotentRequest(), duplicate, () => { sideEffects++; });
    assert.equal(duplicate.statusCode, 201);
    assert.deepEqual(duplicate.body, { success: true, transactionId: 55 });
    assert.equal(sideEffects, 1);
});

test('idempotency rejects hash mismatch and scopes keys per user', async () => {
    const store = createMemoryIdempotencyStore();
    const middleware = createIdempotencyMiddleware(store, { error() {} });
    const first = createMockResponse();
    let sideEffects = 0;
    await middleware(idempotentRequest(), first, () => { sideEffects++; });
    await first.json({ success: true });

    const mismatch = createMockResponse();
    await middleware(idempotentRequest({ body: { amount: 26 } }), mismatch, () => { sideEffects++; });
    assert.equal(mismatch.statusCode, 409);
    assert.equal(mismatch.body.code, 'IDEMPOTENCY_KEY_REUSED');

    const otherUser = createMockResponse();
    await middleware(idempotentRequest({ userId: 5 }), otherUser, () => { sideEffects++; });
    assert.equal(sideEffects, 2);
    await otherUser.json({ success: true, tenant: 5 });
});

test('idempotency fails closed for stored processing state and unavailable storage', async () => {
    const request = idempotentRequest();
    const processingStore = createMemoryIdempotencyStore();
    await processingStore.reserve({
        userId: request.user.UserID,
        requestKey: request.headers['idempotency-key'],
        requestHash: hashRequest(request.method, request.originalUrl, request.body)
    });
    const processingResponse = createMockResponse();
    let effects = 0;
    await createIdempotencyMiddleware(processingStore, { error() {} })(
        request, processingResponse, () => { effects++; }
    );
    assert.equal(processingResponse.statusCode, 409);
    assert.equal(effects, 0);

    const unavailableResponse = createMockResponse();
    await createIdempotencyMiddleware({
        async reserve() { throw new Error('table missing'); }
    }, { error() {} })(request, unavailableResponse, () => { effects++; });
    assert.equal(unavailableResponse.statusCode, 503);
    assert.equal(unavailableResponse.body.code, 'IDEMPOTENCY_STORAGE_UNAVAILABLE');
    assert.equal(effects, 0);
});

test('completion persistence failure signals ambiguity and preserves processing reservation', async () => {
    const store = createMemoryIdempotencyStore();
    const middleware = createIdempotencyMiddleware({
        reserve: store.reserve,
        async complete() { throw new Error('write failed'); }
    }, { error() {} });
    const response = createMockResponse();
    await middleware(idempotentRequest(), response, () => {});
    await response.json({ success: true });
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.code, 'IDEMPOTENCY_OUTCOME_AMBIGUOUS');

    const retry = createMockResponse();
    await createIdempotencyMiddleware(store, { error() {} })(
        idempotentRequest(), retry, () => assert.fail('ambiguous request must not execute again')
    );
    assert.equal(retry.statusCode, 409);
    assert.equal(retry.body.code, 'IDEMPOTENCY_REQUEST_PROCESSING');
});

test('non-JSON or direct-ended responses fail closed without losing the processing state', async () => {
    const store = createMemoryIdempotencyStore();
    const response = createMockResponse();
    await createIdempotencyMiddleware(store, { error() {} })(idempotentRequest(), response, () => {});
    response.end('not JSON');
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.code, 'IDEMPOTENCY_OUTCOME_AMBIGUOUS');
    const retry = createMockResponse();
    await createIdempotencyMiddleware(store, { error() {} })(
        idempotentRequest(), retry, () => assert.fail('unpersisted response must not trigger re-execution')
    );
    assert.equal(retry.statusCode, 409);
});

test('SQL idempotency store uses the additive contract without schema mutations', async () => {
    const statements = [];
    const sql = {
        MAX: -1,
        Int: { name: 'Int' },
        UniqueIdentifier: { name: 'UniqueIdentifier' },
        Char: length => ({ name: 'Char', length }),
        NVarChar: length => ({ name: 'NVarChar', length })
    };
    const store = createSqlIdempotencyStore(async (statement, params) => {
        statements.push({ statement, params });
        return { rowsAffected: [1] };
    }, sql);

    await store.reserve({
        userId: 9,
        requestKey: 'b7a7b360-3b1a-4db4-b59c-d70886ce18f1',
        requestHash: 'a'.repeat(64)
    });
    await store.complete({
        userId: 9,
        requestKey: 'b7a7b360-3b1a-4db4-b59c-d70886ce18f1',
        requestHash: 'a'.repeat(64),
        httpStatus: 200,
        responseBody: '{"success":true}'
    });

    assert.equal(statements.length, 2);
    assert.match(statements[0].statement, /INSERT INTO dbo\.ApiIdempotencyRequests/);
    assert.match(statements[0].statement, /UserID, RequestKey, RequestHash, State, CreatedAt/);
    assert.match(statements[0].statement, /SYSUTCDATETIME\(\)/);
    assert.match(statements[1].statement, /HttpStatus = @httpStatus/);
    assert.match(statements[1].statement, /ResponseBody = @responseBody/);
    assert.match(statements[1].statement, /CompletedAt = SYSUTCDATETIME\(\)/);
    assert.doesNotMatch(statements.map(entry => entry.statement).join('\n'), /CREATE TABLE|ALTER TABLE|DROP TABLE/i);
    assert.equal(statements[1].params.responseBody.type.name, 'NVarChar');
    assert.equal(statements[1].params.responseBody.type.length, sql.MAX);
});

test('SQL idempotency store resolves unique-key races by reading the existing row', async () => {
    const calls = [];
    const sql = {
        Int: {},
        UniqueIdentifier: {},
        Char: length => ({ length }),
        NVarChar: length => ({ length })
    };
    const request = {
        userId: 9,
        requestKey: 'b7a7b360-3b1a-4db4-b59c-d70886ce18f1',
        requestHash: 'b'.repeat(64)
    };
    const store = createSqlIdempotencyStore(async statement => {
        calls.push(statement);
        if (statement.includes('INSERT INTO')) throw Object.assign(new Error('duplicate key'), { number: 2627 });
        return {
            recordset: [{
                RequestHash: request.requestHash,
                State: 'completed',
                HttpStatus: 201,
                ResponseBody: '{"success":true}'
            }]
        };
    }, sql);

    assert.deepEqual(await store.reserve(request), {
        state: 'completed',
        httpStatus: 201,
        responseBody: '{"success":true}'
    });
    assert.equal(calls.length, 2);
    assert.match(calls[1], /SELECT RequestHash, State, HttpStatus, ResponseBody/);
});

test('idempotency status endpoint reports schema readiness without changing the schema', () => {
    const source = read('routes/idempotency.js');
    assert.match(source, /OBJECT_ID\(N'dbo\.ApiIdempotencyRequests', N'U'\)/);
    assert.match(source, /IDEMPOTENCY_SCHEMA_UNAVAILABLE/);
    assert.match(source, /i\.is_unique = 1/);
    assert.match(source, /userColumn\.name = N'UserID'/);
    assert.match(source, /requestColumn\.name = N'RequestKey'/);
    assert.match(source, /methods: \['POST', 'PUT', 'PATCH', 'DELETE'\]/);
    assert.match(source, /processingPolicy: 'fail-closed-manual-resolution'/);
    assert.match(source, /router\.get\('\/requests\/:uuid'/);
    assert.match(source, /WHERE UserID = @userId AND RequestKey = @requestKey/);
    assert.match(source, /state: 'not_found'/);
    assert.match(source, /state: 'processing'/);
    assert.match(source, /state: 'completed'/);
    assert.doesNotMatch(source, /\b(?:CREATE|ALTER|DROP)\s+TABLE\b/i);
});

test('requests without a key preserve normal routing and keyed requests require auth and a body', async () => {
    let reservations = 0;
    const middleware = createIdempotencyMiddleware({
        async reserve() { reservations++; return { state: 'reserved' }; }
    }, { error() {} });
    const noKeyResponse = createMockResponse();
    let nextCalls = 0;
    await middleware({ headers: {}, method: 'POST' }, noKeyResponse, () => { nextCalls++; });
    assert.equal(nextCalls, 1);
    assert.equal(reservations, 0);

    const unauthenticated = createMockResponse();
    await middleware({
        headers: { 'idempotency-key': 'b7a7b360-3b1a-4db4-b59c-d70886ce18f1' },
        method: 'POST',
        body: {},
        originalUrl: '/api/transactions'
    }, unauthenticated, () => assert.fail('unauthenticated requests must not reach route handlers'));
    assert.equal(unauthenticated.statusCode, 401);

    const missingBody = createMockResponse();
    await middleware({
        headers: { 'idempotency-key': 'b7a7b360-3b1a-4db4-b59c-d70886ce18f1' },
        method: 'POST',
        user: { UserID: 4 },
        originalUrl: '/api/transactions'
    }, missingBody, () => assert.fail('body-less requests must not reach route handlers'));
    assert.equal(missingBody.statusCode, 400);
    assert.equal(reservations, 0);
});

test('server runs authentication before idempotency and bypasses only the earlier liveness check for keyed requests', () => {
    const source = read('server.js');
    assert.ok(source.indexOf("app.use('/api', authenticateUser)") < source.indexOf('createIdempotencyMiddleware('));
    assert.match(source, /req\.headers\['idempotency-key'\] !== undefined\) return next\(\)/);
});

test('database/db exports callable mssql-compatible sql types for idempotencyStore', async () => {
    const prevDefer = process.env.CMBC_DEFER_DB_INIT;
    process.env.CMBC_DEFER_DB_INIT = '1';
    try {
        const db = require('../database/db');
        assert.equal(typeof db.sql.Char, 'function');
        assert.equal(typeof db.sql.NVarChar, 'function');
        assert.equal(db.sql.MAX, -1);

        const statements = [];
        const store = createSqlIdempotencyStore(async (statement, params) => {
            statements.push({ statement, params });
            return { rowsAffected: [1] };
        }, db.sql);

        await store.reserve({
            userId: 1,
            requestKey: 'b7a7b360-3b1a-4db4-b59c-d70886ce18f1',
            requestHash: 'c'.repeat(64)
        });
        await store.complete({
            userId: 1,
            requestKey: 'b7a7b360-3b1a-4db4-b59c-d70886ce18f1',
            requestHash: 'c'.repeat(64),
            httpStatus: 200,
            responseBody: '{"ok":true}'
        });
        assert.equal(statements[0].params.requestHash.type.name, 'Char');
        assert.equal(statements[0].params.requestHash.type.length, 64);
        assert.equal(statements[1].params.responseBody.type.name, 'NVarChar');
        assert.equal(statements[1].params.responseBody.type.length, db.sql.MAX);
    } finally {
        if (prevDefer === undefined) delete process.env.CMBC_DEFER_DB_INIT;
        else process.env.CMBC_DEFER_DB_INIT = prevDefer;
    }
});

test('BC dashboard and yearly report derive BCChargeOnKhata from KhataEntries instead of nonexistent column', () => {
    const bcSource = read('routes/bc.js');
    const reportsSource = read('routes/reports.js');
    assert.doesNotMatch(bcSource, /BCTransactions[\s\S]*BCChargeOnKhata/);
    assert.doesNotMatch(reportsSource, /b\.BCChargeOnKhata/);
});

test('KPI KhataGotNoAccount excludes module-linked Got entries already counted via Transactions', () => {
    const reportsSource = read('routes/reports.js');
    assert.match(reportsSource, /k\.PaymentID IS NULL AND k\.InvoiceID IS NULL AND \(k\.SourceModule IS NULL OR k\.SourceModule = ''\)/);
});

test('Staff users are blocked from system log inspection routes and SuperAdmin check', () => {
    const { isStaffBlockedRequest } = require('../middleware/staffPermissions');
    assert.equal(isStaffBlockedRequest('GET', '/api/logs').blocked, true);
    assert.equal(isStaffBlockedRequest('GET', '/api/logs/db-errors').blocked, true);
    assert.equal(isStaffBlockedRequest('GET', '/api/logs/client-errors').blocked, true);
    assert.equal(isStaffBlockedRequest('PUT', '/api/logs/client-errors/1/fix').blocked, true);
    assert.equal(isStaffBlockedRequest('POST', '/api/logs/client-error').blocked, false);

    const logsSource = read('routes/logs.js');
    assert.match(logsSource, /req\.user\.Role === 'Staff' \|\| req\.user\.ParentUserID/);
    assert.match(logsSource, /req\.user\.ActualUserID \|\| req\.user\.UserID/);
});

test('recordEngine and billPayLedger preserve account links and zero-amount balance syncs on update', () => {
    const recSource = read('database/recordEngine.js');
    assert.match(recSource, /ensureModuleRegistered/);
    assert.match(recSource, /cur\.AccountID \|\| null/);
    assert.match(recSource, /cur\.CashAccountID \|\| null/);
    assert.match(recSource, /UPDATE dbo\.UniversalTxnRegistry/);

    const bpSource = read('database/billPayLedger.js');
    assert.match(bpSource, /effWalletId && numBillAmount <= 0/);
    assert.match(bpSource, /effCashId && numTotalCollected <= 0/);
});

test('nested CAST(... AS TIME/DATETIME) translates cleanly and exports scope Accounts by UserID', () => {
    const prevDefer = process.env.CMBC_DEFER_DB_INIT;
    process.env.CMBC_DEFER_DB_INIT = '1';
    try {
        const db = require('../database/db');
        const translated = db.translateSql("SELECT CAST(CAST(ISNULL(i.CreatedAt, CAST(i.InvoiceDate AS DATETIME)) AS TIME) AS VARCHAR(8)) AS RecordTime FROM Invoices i");
        assert.match(translated, /CAST\s*\(\s*time\s*\(\s*IFNULL\s*\(\s*i\.CreatedAt\s*,\s*datetime\s*\(\s*i\.InvoiceDate\s*\)\s*\)\s*\)\s*AS\s*VARCHAR\s*\(\s*8\s*\)\s*\)/i);
    } finally {
        if (prevDefer === undefined) delete process.env.CMBC_DEFER_DB_INIT;
        else process.env.CMBC_DEFER_DB_INIT = prevDefer;
    }

    const reportsSource = read('routes/reports.js');
    assert.doesNotMatch(reportsSource, /FROM Accounts WHERE AccountID = @accountId\)/);
});

test('service_records tenant isolation, UCL fee bounds, and verifyPersonalKey expiry rejection', () => {
    const svcSource = read('routes/service_records.js');
    assert.match(svcSource, /isPlatformAdmin/);
    assert.match(svcSource, /SELECT ServiceID, UserID FROM dbo\.CSCServices WHERE ServiceID = @id/);

    const uclSource = read('routes/ucl.js');
    assert.match(uclSource, /parseUclAmounts/);

    const crypto = require('node:crypto');
    const lm = require('../utils/licenseManager');
    const expiredPayload = 'HISAAB-PRO-ALL-20200101';
    const sig = crypto.createHmac('sha256', 'SanjayKendra_SecretSalt_2026_SecureKey!#99')
        .update(expiredPayload).digest('hex').substring(0, 6).toUpperCase();
    const res = lm.verifyPersonalKey(`${expiredPayload}-${sig}`, 'ABCD1234');
    assert.equal(res.valid, false);
});
