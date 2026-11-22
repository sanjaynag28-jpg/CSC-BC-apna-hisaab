const http = require('http');

async function run() {
    console.log('🔄 Running setup_sqlite first to ensure schema & columns are up to date...');
    const { setupSQLite } = require('../database/setup_sqlite');
    setupSQLite();

    console.log('🚀 Loading server...');
    process.env.PORT = '4000';
    const app = require('../server');

    // Wait a moment for server to initialize DB pool
    await new Promise(r => setTimeout(r, 2000));

    const endpoints = [
        '/api/accounts',
        '/api/categories',
        '/api/parties',
        '/api/customers?brief=1',
        '/api/customers',
        '/api/transactions',
        '/api/bc/dashboard',
        '/api/bc/transactions',
        '/api/csc/stats',
        '/api/csc/applications',
        '/api/ucl',
        '/api/reports/kpis',
        '/api/reports/master',
        '/api/reports/analytics',
        '/api/reports/monthly',
        '/api/reports/yearly',
        '/api/invoices',
        '/api/khatabook/customers',
        '/api/bills',
        '/api/bill-payments',
        '/api/budgets',
        '/api/documents',
        '/api/history',
        '/api/pac',
        '/api/recurring',
        '/api/recyclebin',
        '/api/service/modules',
        '/api/service/records',
        '/api/settings'
    ];

    console.log(`\n🔍 Testing ${endpoints.length} critical UI endpoints against SQLite:\n`);

    let passed = 0;
    let failed = 0;
    const errors = [];

    for (const ep of endpoints) {
        try {
            const res = await fetch(`http://localhost:4000${ep}`);
            const text = await res.text();
            let json;
            try {
                json = JSON.parse(text);
            } catch (err) { }

            if (res.status >= 400 || (json && json.success === false)) {
                console.log(`❌ [${res.status}] ${ep} -> FAIL`);
                const errMsg = json ? (json.error || json.message || JSON.stringify(json)) : text.slice(0, 150);
                console.log(`   Detail: ${errMsg}`);
                failed++;
                errors.push({ ep, status: res.status, error: errMsg });
            } else {
                console.log(`✅ [${res.status}] ${ep} -> OK`);
                passed++;
            }
        } catch (e) {
            console.log(`❌ [FETCH ERROR] ${ep} -> ${e.message}`);
            failed++;
            errors.push({ ep, status: 0, error: e.message });
        }
    }

    console.log(`\n========================================`);
    console.log(`Results: ${passed} Passed, ${failed} Failed out of ${endpoints.length} endpoints`);
    console.log(`========================================\n`);

    if (failed > 0) {
        console.error('FAILED ENDPOINTS SUMMARY:');
        errors.forEach(e => console.error(`- ${e.ep}: ${e.error}`));
        process.exit(1);
    } else {
        console.log('🎉🎉🎉 100% OF ALL SCREEN ENDPOINTS PASSED CLEANLY WITH ZERO RED ERRORS! 🎉🎉🎉');
        process.exit(0);
    }
}

run().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
