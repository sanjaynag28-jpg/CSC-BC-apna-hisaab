const { query } = require('../database/db');

async function checkClientErrors() {
    try {
        console.log('Querying ClientErrorLogs...');
        const res = await query(`
            SELECT TOP 20 
                ErrorID, ErrorType, ErrorMessage, ErrorStack, Url, DeviceInfo, CreatedAt
            FROM ClientErrorLogs
            ORDER BY CreatedAt DESC
        `);
        console.log(`Found ${res.recordset.length} client errors logged:`);
        res.recordset.forEach(r => {
            console.log(`[${r.CreatedAt?.toISOString?.() || r.CreatedAt}] [${r.ErrorType}] Msg: ${r.ErrorMessage?.slice(0, 100)} (URL: ${r.Url?.slice(0, 50)})`);
            if (r.ErrorStack) {
                console.log(`   Stack: ${r.ErrorStack.slice(0, 150)}...`);
            }
        });
        process.exit(0);
    } catch (e) {
        console.error('Error querying ClientErrorLogs:', e);
        process.exit(1);
    }
}

checkClientErrors();
