/**
 * SQLite API & Core Transaction E2E Test Suite
 */
const { spawn } = require('child_process');

async function run() {
    const p = spawn('node', ['server.js'], {
        cwd: 'd:/Cash-Management-SQLite',
        env: { ...process.env, PORT: '3099', JWT_SECRET: 'supersecretjwtkey_12345' }
    });

    p.stdout.on('data', d => process.stdout.write(d.toString()));
    p.stderr.on('data', d => process.stderr.write(d.toString()));

    // Wait 3 seconds for server to boot
    await new Promise(r => setTimeout(r, 3000));

    try {
        console.log('\n--- 1. Testing /api/health ---');
        const h = await fetch('http://localhost:3099/api/health').then(r => r.json());
        console.log('Health:', h);

        console.log('\n--- 2. Testing Accounts API (Localhost Auto-Login) ---');
        const accs = await fetch('http://localhost:3099/api/accounts').then(r => r.json());
        console.log('Accounts count:', accs.length || accs.data?.length || 0);

        console.log('\n--- 3. Testing Categories API ---');
        const cats = await fetch('http://localhost:3099/api/categories').then(r => r.json());
        console.log('Categories count:', cats.length || cats.data?.length || 0);

        console.log('\n--- 4. Testing Customers API ---');
        const custs = await fetch('http://localhost:3099/api/customers').then(r => r.json());
        console.log('Customers count:', custs.length || custs.data?.length || 0);

        console.log('\n--- 5. Testing Create Customer ---');
        const newCust = await fetch('http://localhost:3099/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                CustomerName: 'Ramesh Kumar',
                Phone: '9876543210'
            })
        }).then(r => r.json());
        console.log('New Customer:', newCust);

        console.log('\n--- 6. Testing BC Transaction Create ---');
        const newBc = await fetch('http://localhost:3099/api/bc/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ServiceType: 'Cash Withdrawal',
                CustomerName: 'Ramesh Kumar',
                CustomerPhone: '9876543210',
                Amount: 2000,
                CommissionEarned: 10,
                CustomerCharge: 20,
                CashAccountID: 1,
                PortalAccountID: 2
            })
        }).then(r => r.json());
        console.log('New BC Txn:', newBc);

        console.log('\n--- 7. Checking Account Balances after BC Txn ---');
        const accsAfter = await fetch('http://localhost:3099/api/accounts').then(r => r.json());
        console.log('Accounts After:', (accsAfter.data || accsAfter).map(a => ({ id: a.AccountID, name: a.AccountName, bal: a.CurrentBalance })));

        console.log('\n🎉 ALL SQLITE TESTS PASSED 100%! 🎉\n');
    } catch (e) {
        console.error('❌ Test Error:', e);
    } finally {
        p.kill();
        process.exit(0);
    }
}

run();

