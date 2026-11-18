const http = require('http');
const crypto = require('crypto');
const safety = require('./test-safety');
const BASE_URL = safety.assertIsolatedServer();
const serverUrl = new URL(BASE_URL);
const { query, closePool } = require('../database/db');

function requiredTestUser(name) {
    const value = process.env[name];
    if (!value || !/^test_/i.test(value)) throw new Error(`${name} must identify a dedicated test_ user.`);
    return value;
}

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} must be set to a dedicated test credential.`);
    return value;
}

function post(path, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body || {});
        const req = http.request({
            hostname: serverUrl.hostname,
            port: serverUrl.port || 80,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                ...headers
            }
        }, (res) => {
            let resBody = '';
            res.on('data', chunk => resBody += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(resBody) });
                } catch (e) {
                    resolve({ status: res.statusCode, text: resBody });
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function get(path, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: serverUrl.hostname,
            port: serverUrl.port || 80,
            path,
            method: 'GET',
            headers: {
                ...headers
            }
        }, (res) => {
            let resBody = '';
            res.on('data', chunk => resBody += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(resBody) });
                } catch (e) {
                    resolve({ status: res.statusCode, text: resBody });
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function runTests() {
    console.log('🧪 Starting Single Active Session & Remote Error Logging Tests...\n');
    const friendUsername = requiredTestUser('TEST_SESSION_USERNAME');
    const friendPassword = requiredEnv('TEST_SESSION_PASSWORD');
    const adminUsername = requiredTestUser('TEST_ADMIN_USERNAME');
    const adminPassword = requiredEnv('TEST_ADMIN_PASSWORD');
    const marker = `test-telemetry-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
    let databaseVerified = false;
    try {
    await safety.verifyDatabaseTarget(query);
    databaseVerified = true;

    // 1. Friend (Test shop) Login in Browser A
    console.log('--- Test 1: Friend login in Browser A ---');
    // Notice: We pass a remote header like cf-ray to simulate a remote request over tunnel
    const tunnelHeaders = { 'cf-ray': marker, 'host': new URL(BASE_URL).host };

    const loginResA = await post('/api/auth/login', { username: friendUsername, password: friendPassword }, tunnelHeaders);
    if (!loginResA.data.success || !loginResA.data.token) {
        throw new Error('Login A failed: ' + JSON.stringify(loginResA.data));
    }
    const tokenA = loginResA.data.token;
    console.log('✅ Browser A logged in successfully. User:', loginResA.data.user.ShopName);

    // Call API with Token A
    const custResA = await get('/api/customers', { ...tunnelHeaders, 'Authorization': `Bearer ${tokenA}` });
    if (custResA.status !== 200) {
        throw new Error('Browser A customer fetch failed: ' + custResA.status);
    }
    console.log('✅ Browser A API request succeeded (Status: 200).');

    // 2. Friend Login in Browser B (Same user, different browser/session)
    console.log('\n--- Test 2: Friend login in Browser B (Session Invalidation Test) ---');
    const loginResB = await post('/api/auth/login', { username: friendUsername, password: friendPassword }, tunnelHeaders);
    if (!loginResB.data.success || !loginResB.data.token) {
        throw new Error('Login B failed: ' + JSON.stringify(loginResB.data));
    }
    const tokenB = loginResB.data.token;
    console.log('✅ Browser B logged in successfully.');

    // 3. Browser A makes a request now (MUST be invalidated with 401 sessionTerminated)
    console.log('\n--- Test 3: Browser A old session verification ---');
    const oldSessionRes = await get('/api/customers', { ...tunnelHeaders, 'Authorization': `Bearer ${tokenA}` });
    console.log('Browser A response status:', oldSessionRes.status, 'Body:', oldSessionRes.data);

    if (oldSessionRes.status === 401 && oldSessionRes.data && oldSessionRes.data.sessionTerminated) {
        console.log('✅ PASS: Browser A correctly invalidated with sessionTerminated: true!');
    } else {
        throw new Error('FAIL: Browser A was NOT rejected with sessionTerminated: true');
    }

    // 4. Browser B makes a request (MUST succeed 200 OK)
    console.log('\n--- Test 4: Browser B active session verification ---');
    const newSessionRes = await get('/api/customers', { ...tunnelHeaders, 'Authorization': `Bearer ${tokenB}` });
    if (newSessionRes.status === 200) {
        console.log('✅ PASS: Browser B active session works smoothly (Status: 200).');
    } else {
        throw new Error('FAIL: Browser B failed with status ' + newSessionRes.status);
    }

    // 5. Super Admin Multi-Browser Exemption Test
    console.log('\n--- Test 5: Super Admin Unrestricted Multi-Browser Test ---');
    const adminLogin1 = await post('/api/auth/login', { username: adminUsername, password: adminPassword });
    const adminToken1 = adminLogin1.data.token;

    const adminLogin2 = await post('/api/auth/login', { username: adminUsername, password: adminPassword });
    const adminToken2 = adminLogin2.data.token;

    const adminReq1 = await get('/api/customers', { 'Authorization': `Bearer ${adminToken1}` });
    const adminReq2 = await get('/api/customers', { 'Authorization': `Bearer ${adminToken2}` });

    if (adminReq1.status === 200 && adminReq2.status === 200) {
        console.log('✅ PASS: Super Admin (Sanjay Nag) retains unrestricted multi-browser access!');
    } else {
        throw new Error('FAIL: Super Admin session was incorrectly blocked');
    }

    // 6. Remote Client Error Logging Test
    console.log('\n--- Test 6: Remote Client Error Telemetry Test ---');
    const testErrorPayload = {
        type: 'uncaught_exception',
        message: `Isolated test telemetry ${marker}`,
        stack: 'TypeError: calculateTax\n    at HTMLButtonElement.onclick (index.html:123)',
        url: `${BASE_URL}/#page-transactions`,
        deviceInfo: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        activePage: 'transactions'
    };

    const errReportRes = await post('/api/logs/client-error', testErrorPayload, {
        ...tunnelHeaders,
        'Authorization': `Bearer ${tokenB}`
    });
    console.log('Error report response:', errReportRes.data);
    if (!errReportRes.data.success) {
        throw new Error('Client error report failed: ' + JSON.stringify(errReportRes.data));
    }
    console.log('✅ Error reported to server successfully.');

    // Query admin client error log endpoint
    const adminLogsRes = await get('/api/admin/client-errors', { 'Authorization': `Bearer ${adminToken1}` });
    if (adminLogsRes.status !== 200 || !adminLogsRes.data.success) {
        throw new Error('Admin fetch client errors failed: ' + JSON.stringify(adminLogsRes.data));
    }

    const recorded = adminLogsRes.data.errors.find(e => e.ErrorMessage.includes(marker));
    if (recorded) {
        console.log(`✅ PASS: Client error recorded in SQL Server! ErrorID: #${recorded.ErrorID}, Shop: ${recorded.ShopName}, Owner: ${recorded.OwnerName}`);
    } else {
        throw new Error('FAIL: Recorded error not found in ClientErrorLogs table');
    }

    console.log('\n======================================================');
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY 100%!');
    console.log('======================================================\n');
    } finally {
        try {
            if (databaseVerified) {
                await query('DELETE FROM ClientErrorLogs WHERE ErrorMessage LIKE @marker', { marker: `%${marker}%` });
            }
        } finally {
            await closePool();
        }
    }
}

runTests().catch(err => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
});
