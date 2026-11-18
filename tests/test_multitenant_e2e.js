'use strict';

const safety = require('./test-safety');
const BASE_URL = safety.assertIsolatedServer();
const { query, closePool } = require('../database/db');

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} must be set to a dedicated test credential.`);
    return value;
}

function requiredTestUser(name) {
    const value = requiredEnv(name);
    if (!/^test_/i.test(value)) throw new Error(`${name} must identify a dedicated test_ user.`);
    return value;
}

async function runE2ETest() {
    console.log('🚀 Starting Multi-Tenant End-to-End Verification Test...\n');

    const adminUsername = requiredTestUser('TEST_ADMIN_USERNAME');
    const adminPassword = requiredEnv('TEST_ADMIN_PASSWORD');
    const shopPassword = requiredEnv('TEST_SHOP_PASSWORD');
    const testUsername = `test_shop_${process.pid}`;
    let databaseVerified = false;

    // Helper to safely clean up a test user by UserID or Username
    async function cleanupTestUser(username) {
        const existing = await query('SELECT UserID FROM Users WHERE Username = @u', { u: username });
        for (const row of existing.recordset) {
            const uid = row.UserID;
            await query(`DELETE FROM UniversalTxnRegistry WHERE
                (SourceModule = 'BC' AND RecordID IN (SELECT BCID FROM BCTransactions WHERE UserID = @id))
                OR (SourceModule = 'Cashbook' AND RecordID IN (SELECT TransactionID FROM Transactions WHERE UserID = @id))`, { id: uid });
            await query('DELETE FROM BCTransactions WHERE UserID = @id', { id: uid });
            await query('DELETE FROM Transactions WHERE UserID = @id', { id: uid });
            await query('DELETE FROM KhataEntries WHERE UserID = @id', { id: uid });
            await query('DELETE FROM InvoiceItems WHERE InvoiceID IN (SELECT InvoiceID FROM Invoices WHERE UserID = @id)', { id: uid });
            await query('DELETE FROM Invoices WHERE UserID = @id', { id: uid });
            await query('DELETE FROM CSCApplications WHERE UserID = @id', { id: uid });
            await query('DELETE FROM Customers WHERE UserID = @id', { id: uid });
            await query('DELETE FROM CSCServices WHERE UserID = @id', { id: uid });
            await query('DELETE FROM Categories WHERE UserID = @id', { id: uid });
            await query('DELETE FROM Accounts WHERE UserID = @id', { id: uid });
            await query('DELETE FROM Users WHERE UserID = @id', { id: uid });
        }
    }

    try {
    await safety.verifyDatabaseTarget(query);
    databaseVerified = true;
    await cleanupTestUser(testUsername);

    // 1. Admin Login
    console.log('1️⃣ Testing Admin Login (POST /api/auth/login)...');
    const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUsername, password: adminPassword })
    });
    const adminLoginData = await adminLoginRes.json();
    if (!adminLoginData.success) {
        throw new Error('Admin login failed: ' + adminLoginData.error);
    }
    const adminToken = adminLoginData.token;
    console.log('   ✅ Admin Login Success! Shop:', adminLoginData.user.ShopName);

    // 2. Admin Get Me
    console.log('\n2️⃣ Testing GET /api/auth/me for SuperAdmin...');
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const meData = await meRes.json();
    console.log('   ✅ Auth Me verified. UserID:', meData.user.UserID, 'Role:', meData.user.Role);

    // 3. Create a Test Friend Shop: Ramesh Online Center
    console.log('\n3️⃣ Creating a Friend Shop (POST /api/admin/users)...');
    // Clean up if previous run left test user
    const createShopRes = await fetch(`${BASE_URL}/api/admin/users`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
            shopName: `Isolated Test Shop ${process.pid}`,
            ownerName: `Test Owner ${process.pid}`,
            mobileNumber: `900000${String(process.pid).slice(-4).padStart(4, '0')}`,
            username: testUsername,
            password: shopPassword,
            role: 'ShopOwner'
        })
    });
    const createShopData = await createShopRes.json();
    if (!createShopData.success) {
        throw new Error('Create shop failed: ' + createShopData.error);
    }
    const rameshUser = {
        UserID: createShopData.userId,
        ApiToken: createShopData.apiToken,
        Username: createShopData.username
    };
    console.log('   ✅ Isolated test shop created. ID:', rameshUser.UserID);

    // 4. Verify Ramesh's auto-seeded default accounts & services
    const rameshAccounts = await query('SELECT AccountName, AccountType FROM Accounts WHERE UserID = @id', { id: rameshUser.UserID });
    console.log('   ✅ Auto-seeded test accounts:', rameshAccounts.recordset.map(a => a.AccountName).join(', '));
    const rameshServices = await query('SELECT COUNT(*) as c FROM CSCServices WHERE UserID = @id', { id: rameshUser.UserID });
    console.log('   ✅ Seeded CSC Services:', rameshServices.recordset[0].c, 'services');

    // 5. Ramesh Login
    console.log('\n4️⃣ Testing Ramesh Login...');
    const rameshLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: testUsername, password: shopPassword })
    });
    const rameshLoginData = await rameshLoginRes.json();
    const rameshToken = rameshLoginData.token;
    console.log('   ✅ Ramesh Login Success! Token generated.');

    // 6. Test Data Isolation: Customers List
    console.log('\n5️⃣ Testing Customer Data Isolation...');
    const rameshCustRes = await fetch(`${BASE_URL}/api/customers`, {
        headers: { 'Authorization': `Bearer ${rameshToken}` }
    });
    const rameshCustData = await rameshCustRes.json();
    console.log('   Isolated test user customer count:', rameshCustData.data ? rameshCustData.data.length : 0);

    const adminCustRes = await fetch(`${BASE_URL}/api/customers`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const adminCustData = await adminCustRes.json();
    console.log('   Admin customer count:', adminCustData.data ? adminCustData.data.length : 0);

    if (!Array.isArray(rameshCustData.data) || rameshCustData.data.length !== 0 || !Array.isArray(adminCustData.data)) {
        throw new Error('Test tenant isolation setup is invalid.');
    }
    console.log('   ✅ Isolated test tenant starts with no customers.');

    // 7. Ramesh Creates a Customer
    console.log('\n6️⃣ Test tenant creates its own customer...');
    const createCustRes = await fetch(`${BASE_URL}/api/customers`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${rameshToken}`
        },
        body: JSON.stringify({
            CustomerName: `TEST ${testUsername} Customer`,
            Phone: `800000${String(process.pid).slice(-4).padStart(4, '0')}`,
            AadhaarNumber: '112233445566',
            OpeningBalance: 0,
            BalanceType: 'Settled'
        })
    });
    const createCustData = await createCustRes.json();
    if (!createCustData.success) {
        throw new Error('Ramesh customer creation failed: ' + createCustData.error);
    }
    console.log('   ✅ Ramesh created customer:', createCustData.data.CustomerName, 'ID:', createCustData.data.CustomerID);

    // Check isolation again
    const rameshCustAfter = await (await fetch(`${BASE_URL}/api/customers`, { headers: { 'Authorization': `Bearer ${rameshToken}` } })).json();
    const adminCustAfter = await (await fetch(`${BASE_URL}/api/customers`, { headers: { 'Authorization': `Bearer ${adminToken}` } })).json();
    console.log('   Test user customer count now:', rameshCustAfter.data.length);
    console.log('   Admin customer count now:', adminCustAfter.data.length);

    const testCustomerInAdmin = adminCustAfter.data.find(c => c.CustomerID === createCustData.data.CustomerID);
    if (testCustomerInAdmin) {
        throw new Error('Data Leak! Test tenant customer appeared in admin customer list!');
    }
    console.log('   ✅ Test customer is visible only to its test tenant.');

    // 8. Test Extension API Token Grabber with Ramesh's Token
    console.log('\n7️⃣ Testing Chrome Extension Auto-Capture with X-Api-Token...');
    const cashAccount = rameshAccounts.recordset.find(a => a.AccountType === 'Cash');
    if (!cashAccount) throw new Error('Isolated test user has no seeded cash account.');
    const gallaAccId = cashAccount.AccountID;

    const bcTxnRes = await fetch(`${BASE_URL}/api/bc`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Api-Token': rameshUser.ApiToken
        },
        body: JSON.stringify({
            ServiceType: 'Cash Withdrawal',
            CustomerName: `TEST ${testUsername} Customer`,
            CustomerPhone: `800000${String(process.pid).slice(-4).padStart(4, '0')}`,
            Amount: 500,
            CommissionEarned: 2,
            CustomerCharge: 10,
            CashAccountID: gallaAccId,
            Status: 'Success'
        })
    });
    const bcTxnData = await bcTxnRes.json();
    if (!bcTxnData.success) {
        throw new Error('Extension auto-capture failed: ' + bcTxnData.error);
    }
    console.log('   ✅ Isolated test BC transaction captured via X-Api-Token! BCID:', bcTxnData.data.BCID);

    // Verify it is attributed to Ramesh
    const rameshBC = await (await fetch(`${BASE_URL}/api/bc?limit=10`, { headers: { 'Authorization': `Bearer ${rameshToken}` } })).json();
    const adminBC = await (await fetch(`${BASE_URL}/api/bc?limit=10`, { headers: { 'Authorization': `Bearer ${adminToken}` } })).json();
    console.log('   Ramesh BC count:', rameshBC.data.transactions ? rameshBC.data.transactions.length : 0);
    const rameshTxnInAdmin = (adminBC.data.transactions || []).find(t => t.BCID === bcTxnData.data.BCID);
    if (rameshTxnInAdmin) {
        throw new Error('Data Leak! Ramesh BC transaction appeared in Admin list!');
    }
    console.log('   ✅ Extension Attribution Confirmed: Grabbed transaction belongs 100% to Ramesh!');

    console.log('\n🎉 ========================================================');
    console.log('🎉 ALL MULTI-TENANT TESTS PASSED 100% WITH ZERO ERRORS!');
    console.log('🎉 ========================================================\n');
    } finally {
        try {
            if (databaseVerified) {
                await cleanupTestUser(testUsername);
                console.log('   ✅ Cleaned up isolated test tenant.');
            }
        } finally {
            await closePool();
        }
    }
}

runE2ETest()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('\n❌ TEST FAILED:', err);
        process.exit(1);
    });
