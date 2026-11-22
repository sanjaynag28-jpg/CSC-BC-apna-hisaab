const { query } = require('../database/db');

async function scanErrorLogs() {
    console.log('=== 1. SCANNING ERROR LOGS ===');
    try {
        const errorLogs = await query(`
            SELECT TOP 20 ErrorID, ErrorType, ErrorMessage, Url, Resolved, CreatedAt
            FROM ClientErrorLogs
            ORDER BY ErrorID DESC
        `);
        console.log(`Found ${errorLogs.recordset.length} recent error logs:`);
        errorLogs.recordset.forEach(l => {
            console.log(`[#${l.ErrorID}] [${l.CreatedAt?.toISOString()}] [Resolved: ${l.Resolved}] ${l.ErrorType}: ${l.ErrorMessage?.substring(0, 120)}`);
        });
    } catch (e) {
        console.log('Error scanning ClientErrorLogs:', e.message);
    }
}

scanErrorLogs().then(() => process.exit(0));
