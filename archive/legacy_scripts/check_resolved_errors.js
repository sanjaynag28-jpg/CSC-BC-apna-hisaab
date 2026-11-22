const { query } = require('../database/db');

async function checkStatus() {
    const unres = await query("SELECT ErrorID, ErrorType, ErrorMessage, Url, CreatedAt FROM ClientErrorLogs WHERE Resolved = 0 ORDER BY ErrorID DESC");
    console.log(`Unresolved errors count: ${unres.recordset.length}`);
    console.log(unres.recordset.slice(0, 5));

    // Mark the CSC insertRes error as resolved
    await query("UPDATE ClientErrorLogs SET Resolved = 1 WHERE ErrorMessage LIKE '%insertRes%'");
    console.log('Marked insertRes error as resolved in ClientErrorLogs.');
    process.exit(0);
}
checkStatus();
