const { query } = require('../database/db');

async function checkPartyProc() {
    const res = await query("SELECT OBJECT_DEFINITION(OBJECT_ID('sp_UpdatePartyBalance')) as def");
    console.log(res.recordset[0]?.def);
    process.exit(0);
}
checkPartyProc();
