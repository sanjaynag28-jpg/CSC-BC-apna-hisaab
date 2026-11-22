const { query } = require('../database/db');

async function checkAccProc() {
    const res = await query("SELECT OBJECT_DEFINITION(OBJECT_ID('sp_UpdateAccountBalance')) as def");
    console.log(res.recordset[0]?.def);
    process.exit(0);
}
checkAccProc();
