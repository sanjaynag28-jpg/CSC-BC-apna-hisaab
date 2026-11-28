const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmbc-staff-test-'));
const testDbPath = path.join(tmpDir, 'test_shop.db');
process.env.CMBC_DB_PATH = testDbPath;
process.env.JWT_SECRET = 'test-secret-key-staff-shared-shop';
process.env.AUTO_UPDATE_DISABLED = '1';

const express = require('express');
const http = require('node:http');
const { query, withTransaction, closePool } = require('../database/db');
const { authenticateUser } = require('../middleware/auth');
const { enforceStaffPermissions, isStaffBlockedRequest } = require('../middleware/staffPermissions');
const { runWithActor } = require('../utils/requestContext');
const { registerGlobalTransaction } = require('../database/globalTxnRegistry');
const authRoutes = require('../routes/auth');
const adminRoutes = require('../routes/admin');
const transactionsRoutes = require('../routes/transactions');
const historyRoutes = require('../routes/history');

function createTestServer() {
    const app = express();
    app.use(express.json());
    app.use('/api', authenticateUser);
    app.use('/api', (req, res, next) => {
        if (req.user) return runWithActor(req.user, () => next());
        return next();
    });
    app.use('/api', enforceStaffPermissions);
    app.use('/api/auth', authRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/transactions', transactionsRoutes);
    app.use('/api/history', historyRoutes);
    app.delete('/api/csc/:id', (req, res) => res.json({ success: true }));
    app.post('/api/accounts', (req, res) => res.json({ success: true }));
    app.post('/api/settings', (req, res) => res.json({ success: true }));
    app.get('/api/settings', (req, res) => res.json({ success: true, settings: { ShopName: 'Main Shop' } }));
    app.post('/api/csc', (req, res) => res.json({ success: true, userId: req.user.UserID, actor: req.user.ActorName }));

    return new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
        });
    });
}

test('Staff Shared Shop (Model A): no-login loopback, staff scoping, CreatedBy stamping, concurrent writes, and permissions', async (t) => {
    const { server, baseUrl } = await createTestServer();
    t.after(async () => {
        await new Promise((r) => server.close(r));
        await closePool();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { }
    });

    // 1. Main PC loopback auto-login works without any token AND survives expired/junk Bearer tokens
    const meNoToken = await fetch(`${baseUrl}/api/auth/me`).then(r => r.json());
    assert.equal(meNoToken.success, true);
    assert.equal(meNoToken.user.UserID, 1);
    assert.equal(meNoToken.user.Role, 'SuperAdmin');

    const meBadToken = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: 'Bearer invalid.expired.jwt' }
    }).then(r => r.json());
    assert.equal(meBadToken.success, true);
    assert.equal(meBadToken.user.UserID, 1);
    assert.equal(meBadToken.user.Role, 'SuperAdmin');

    // 2. Non-loopback host (simulated LAN Agent) MUST require authentication
    const lanNoAuth = await fetch(`${baseUrl}/api/transactions`, {
        headers: { 'x-forwarded-for': '192.168.1.55' }
    });
    assert.equal(lanNoAuth.status, 401);

    // 3. SuperAdmin creates 2 Staff Agents sharing Shop UserID 1 (no duplicate Accounts/Services seeded)
    const beforeAcc = (await query('SELECT COUNT(*) AS c FROM Accounts')).recordset[0].c;
    const createStaff1 = await fetch(`${baseUrl}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ownerName: 'Rahul Counter',
            username: 'rahul_staff',
            password: 'pass1234',
            mobileNumber: '9876543210',
            role: 'Staff'
        })
    }).then(r => r.json());
    assert.equal(createStaff1.success, true);
    assert.equal(createStaff1.role, 'Staff');
    assert.equal(createStaff1.parentUserId, 1);

    const createStaff2 = await fetch(`${baseUrl}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ownerName: 'Sonu Counter',
            username: 'sonu_staff',
            password: 'pass1234',
            role: 'Staff'
        })
    }).then(r => r.json());
    assert.equal(createStaff2.success, true);

    const afterAcc = (await query('SELECT COUNT(*) AS c FROM Accounts')).recordset[0].c;
    assert.equal(afterAcc, beforeAcc, 'Creating Staff accounts must NOT duplicate shop Accounts');

    // 4. Staff login inherits Parent Shop UserID=1 while preserving ActualUserID & ActorName
    const loginStaff1 = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '192.168.1.51' },
        body: JSON.stringify({ username: 'rahul_staff', password: 'pass1234' })
    }).then(r => r.json());
    assert.equal(loginStaff1.success, true);
    assert.equal(loginStaff1.user.UserID, 1);
    assert.equal(loginStaff1.user.ActualUserID, createStaff1.userId);
    assert.equal(loginStaff1.user.Role, 'Staff');
    assert.equal(loginStaff1.user.IsStaff, true);
    assert.equal(loginStaff1.user.ActorName, 'Rahul Counter');

    const loginStaff2 = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '192.168.1.52' },
        body: JSON.stringify({ username: 'sonu_staff', password: 'pass1234' })
    }).then(r => r.json());
    assert.equal(loginStaff2.success, true);

    // Confirm Main PC admin session was NOT invalidated when Staff logged in
    const adminSessRow = (await query('SELECT ActiveSessionToken FROM Users WHERE UserID = 1')).recordset[0];
    assert.equal(adminSessRow.ActiveSessionToken, null);

    // 5. Staff creates a Transaction in Shared Shop UserID=1 and verifies CreatedByUserID / CreatedByName + AuditLogs
    const accRow = (await query('SELECT TOP 1 AccountID FROM Accounts WHERE UserID = 1 AND IsActive = 1')).recordset[0];
    const catRow = (await query("SELECT TOP 1 CategoryID FROM Categories WHERE UserID = 1 AND CategoryType = 'Income'")).recordset[0];

    const txnRes = await fetch(`${baseUrl}/api/transactions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${loginStaff1.token}`,
            'x-forwarded-for': '192.168.1.51'
        },
        body: JSON.stringify({
            TransType: 'Income',
            Amount: 250,
            AccountID: accRow.AccountID,
            CategoryID: catRow.CategoryID,
            Description: 'PAN fee collected by Rahul'
        })
    }).then(r => r.json());
    assert.equal(txnRes.success, true);

    // Verify row on shared shop UserID=1 has Rahul's CreatedBy stamps
    const savedTxn = (await query('SELECT UserID, CreatedByUserID, CreatedByName FROM Transactions WHERE TransactionID = @id', { id: txnRes.transactionId })).recordset[0];
    assert.equal(savedTxn.UserID, 1);
    assert.equal(savedTxn.CreatedByUserID, createStaff1.userId);
    assert.equal(savedTxn.CreatedByName, 'Rahul Counter');

    // Verify SuperAdmin sees Rahul's entry & CreatedByName in transactions list and Activity History
    const listOnMain = await fetch(`${baseUrl}/api/transactions`).then(r => r.json());
    assert.equal(listOnMain.success, true);
    const foundTxn = listOnMain.data.find(x => Number(x.TransactionID) === Number(txnRes.transactionId));
    assert.ok(foundTxn);
    assert.equal(foundTxn.CreatedByName, 'Rahul Counter');

    const histRes = await fetch(`${baseUrl}/api/history`).then(r => r.json());
    assert.equal(histRes.success, true);
    assert.ok(histRes.data.some(h => h.CreatedByName === 'Rahul Counter'));

    // 6. Staff permissions: allowed to create/view, blocked (403) on DELETE, Accounts write, Settings write, Admin, History
    const staffGetSettings = await fetch(`${baseUrl}/api/settings`, {
        headers: { Authorization: `Bearer ${loginStaff1.token}`, 'x-forwarded-for': '192.168.1.51' }
    });
    assert.equal(staffGetSettings.status, 200);

    const staffPostCsc = await fetch(`${baseUrl}/api/csc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginStaff1.token}`, 'x-forwarded-for': '192.168.1.51' },
        body: JSON.stringify({})
    }).then(r => r.json());
    assert.equal(staffPostCsc.success, true);
    assert.equal(staffPostCsc.userId, 1);

    const blockedCalls = [
        fetch(`${baseUrl}/api/csc/1`, { method: 'DELETE', headers: { Authorization: `Bearer ${loginStaff1.token}`, 'x-forwarded-for': '192.168.1.51' } }),
        fetch(`${baseUrl}/api/transactions/${txnRes.transactionId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${loginStaff1.token}`, 'x-forwarded-for': '192.168.1.51' } }),
        fetch(`${baseUrl}/api/accounts`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginStaff1.token}`, 'x-forwarded-for': '192.168.1.51' }, body: '{}' }),
        fetch(`${baseUrl}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginStaff1.token}`, 'x-forwarded-for': '192.168.1.51' }, body: '{}' }),
        fetch(`${baseUrl}/api/history`, { headers: { Authorization: `Bearer ${loginStaff1.token}`, 'x-forwarded-for': '192.168.1.51' } }),
        fetch(`${baseUrl}/api/admin/users`, { headers: { Authorization: `Bearer ${loginStaff1.token}`, 'x-forwarded-for': '192.168.1.51' } })
    ];
    for (const p of blockedCalls) {
        const res = await p;
        assert.equal(res.status, 403);
    }

    // 7. Concurrent multi-PC save safety: 6 parallel transactions + SN allocations never throw nested-tx or duplicate SN
    const concurrentWrites = await Promise.all([
        fetch(`${baseUrl}/api/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginStaff1.token}`, 'x-forwarded-for': '192.168.1.51' },
            body: JSON.stringify({ TransType: 'Income', Amount: 100, AccountID: accRow.AccountID, CategoryID: catRow.CategoryID, Description: 'Concurrent 1' })
        }).then(r => r.json()),
        fetch(`${baseUrl}/api/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginStaff2.token}`, 'x-forwarded-for': '192.168.1.52' },
            body: JSON.stringify({ TransType: 'Income', Amount: 200, AccountID: accRow.AccountID, CategoryID: catRow.CategoryID, Description: 'Concurrent 2' })
        }).then(r => r.json()),
        fetch(`${baseUrl}/api/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ TransType: 'Income', Amount: 300, AccountID: accRow.AccountID, CategoryID: catRow.CategoryID, Description: 'Concurrent Main' })
        }).then(r => r.json()),
        withTransaction(async (tQ) => {
            await new Promise(r => setTimeout(r, 15));
            const sn = await registerGlobalTransaction({ sourceModule: 'Cashbook', recordId: 901, entityName: 'Nested TX Test 1', amount: 50, userId: 1 }, tQ);
            return sn.snCode;
        }),
        withTransaction(async (tQ) => {
            await new Promise(r => setTimeout(r, 10));
            const sn = await registerGlobalTransaction({ sourceModule: 'Cashbook', recordId: 902, entityName: 'Nested TX Test 2', amount: 60, userId: 1 }, tQ);
            return sn.snCode;
        })
    ]);

    assert.equal(concurrentWrites[0].success, true);
    assert.equal(concurrentWrites[1].success, true);
    assert.equal(concurrentWrites[2].success, true);
    assert.notEqual(concurrentWrites[3], concurrentWrites[4]);

    const cIds = [concurrentWrites[0].transactionId, concurrentWrites[1].transactionId, concurrentWrites[2].transactionId];
    const cRows = (await query(`SELECT TransactionID, SNCode, CreatedByName FROM Transactions WHERE TransactionID IN (${cIds.join(',')})`)).recordset;
    assert.equal(cRows.length, 3);
    const snSet = new Set(cRows.map(r => r.SNCode).filter(Boolean));
    assert.equal(snSet.size, 3, 'All 3 concurrent transactions must receive distinct non-null SNCodes');
    assert.equal(cRows.find(r => r.TransactionID === cIds[0]).CreatedByName, 'Rahul Counter');
    assert.equal(cRows.find(r => r.TransactionID === cIds[1]).CreatedByName, 'Sonu Counter');
    assert.equal(cRows.find(r => r.TransactionID === cIds[2]).CreatedByName, 'Admin');

    const finalBal = (await query('SELECT CurrentBalance FROM Accounts WHERE AccountID = @id', { id: accRow.AccountID })).recordset[0].CurrentBalance;
    assert.equal(Number(finalBal), 850, 'All 4 shared deposits (250+100+200+300) must accumulate cleanly with zero lost updates');

    // 8. Unit test permission matrix helper directly
    assert.equal(isStaffBlockedRequest('DELETE', '/api/customers/5').blocked, true);
    assert.equal(isStaffBlockedRequest('GET', '/api/reports/export/excel').blocked, true);
    assert.equal(isStaffBlockedRequest('GET', '/reports/export/excel').blocked, true);
    assert.equal(isStaffBlockedRequest('GET', '/csc').blocked, false);
    assert.equal(isStaffBlockedRequest('PATCH', '/csc/12/status').blocked, false);
});
