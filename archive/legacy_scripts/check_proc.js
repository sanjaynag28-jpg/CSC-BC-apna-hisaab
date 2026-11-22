const { query } = require('../database/db');

async function checkProc() {
    const res = await query(`SELECT OBJECT_DEFINITION(OBJECT_ID('sp_UpdateCustomerBalance')) AS def`);
    console.log(res.recordset[0].def);
    process.exit(0);
}
checkProc();
