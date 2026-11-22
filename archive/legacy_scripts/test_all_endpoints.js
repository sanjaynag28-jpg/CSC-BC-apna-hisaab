async function testAll() {
    console.log('Testing all main dashboard and data endpoints on localhost:3000...\n');
    const BASE_URL = 'http://localhost:3000';

    const endpoints = [
        '/api/accounts',
        '/api/categories',
        '/api/parties',
        '/api/customers',
        '/api/transactions?limit=20',
        '/api/transactions/summary/dashboard',
        '/api/bc?limit=20',
        '/api/bc/dashboard',
        '/api/bc/session/today',
        '/api/csc?limit=20',
        '/api/csc/stats',
        '/api/khatabook/summary',
        '/api/khatabook/customers',
        '/api/invoices?limit=20',
        '/api/budgets',
        '/api/bills',
        '/api/recurring',
        '/api/recyclebin',
        '/api/reports/kpis',
        '/api/reports/master',
        '/api/reports/analytics',
        '/api/auth/me',
        '/api/admin/users'
    ];

    let passed = 0;
    let failed = 0;

    for (const ep of endpoints) {
        try {
            const res = await fetch(`${BASE_URL}${ep}`);
            const data = await res.json();
            if (res.status === 200 && data.success !== false) {
                console.log(`✅ [${res.status}] ${ep} (OK)`);
                passed++;
            } else {
                console.error(`❌ [${res.status}] ${ep}:`, data.error || data);
                failed++;
            }
        } catch (err) {
            console.error(`❌ [FETCH ERROR] ${ep}:`, err.message);
            failed++;
        }
    }

    console.log(`\nResults: ${passed} PASSED, ${failed} FAILED.`);
    if (failed > 0) process.exit(1);
    process.exit(0);
}

testAll().catch(err => {
    console.error(err);
    process.exit(1);
});
