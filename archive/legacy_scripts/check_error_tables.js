const { query } = require('../database/db');

async function checkRecentLogs() {
    try {
        console.log('--- Checking Database Tables for Error Logs ---');
        const tablesRes = await query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%Error%' OR TABLE_NAME LIKE '%Log%'");
        console.log('Log tables:', tablesRes.recordset.map(r => r.TABLE_NAME));

        for (const t of tablesRes.recordset) {
            try {
                const countRes = await query(`SELECT COUNT(*) as cnt FROM ${t.TABLE_NAME}`);
                console.log(`Table ${t.TABLE_NAME}: ${countRes.recordset[0].cnt} rows`);
                const recentRes = await query(`SELECT TOP 5 * FROM ${t.TABLE_NAME} ORDER BY 1 DESC`);
                console.log(`Recent 5 in ${t.TABLE_NAME}:`, recentRes.recordset);
            } catch (e) {
                console.log(`Error reading ${t.TABLE_NAME}:`, e.message);
            }
        }
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkRecentLogs();
