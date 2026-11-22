const { query } = require('../database/db');

async function inspectErrorLogs() {
    const res = await query(`
        SELECT TOP 15 ErrorID, ErrorType, Message, Details, PageURL, CreatedAt
        FROM ClientErrorLogs
        ORDER BY CreatedAt DESC;
    `);
    console.log('--- RECENT CLIENT & SERVER ERROR LOGS ---');
    res.recordset.forEach(r => {
        console.log(`[${r.CreatedAt?.toISOString()}] [${r.ErrorType}] ${r.Message}`);
        if (r.Details) console.log(`   Details: ${r.Details.substring(0, 150)}`);
    });
    process.exit(0);
}

inspectErrorLogs().catch(err => {
    console.error(err);
    process.exit(1);
});

