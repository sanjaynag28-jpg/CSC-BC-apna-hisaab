const { query } = require('../database/db');

async function test() {
    try {
        const res = await query("SELECT * FROM Transactions WHERE Reference = 'EW1571092108949282816' OR Reference = 'BP-28'");
        console.log('Transactions for BP 28:');
        console.log(res.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
test();
