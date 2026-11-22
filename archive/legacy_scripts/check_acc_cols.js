const { query } = require('../database/db');

async function test() {
    const res = await query("SELECT TOP 1 * FROM Accounts");
    console.log('Account columns:', Object.keys(res.recordset[0] || {}));
    console.log('Sample account:', res.recordset[0]);
    process.exit(0);
}
test();
