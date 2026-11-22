const { query } = require('../database/db');

async function test() {
    try {
        const res = await query("SELECT TOP 1 * FROM BillPayments WHERE IsDeleted = 0 ORDER BY PaymentID DESC");
        console.log('Sample BillPayment record keys:');
        console.log(Object.keys(res.recordset[0] || {}));
        console.log('Sample record:');
        console.log(res.recordset[0]);
        process.exit(0);
    } catch (err) {
        console.error('Query error:', err);
        process.exit(1);
    }
}
test();
