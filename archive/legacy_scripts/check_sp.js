const { query } = require('../database/db');

async function checkProc() {
    const r = await query("SELECT OBJECT_DEFINITION(OBJECT_ID('sp_UpdateAccountBalance')) as def");
    console.log(r.recordset[0].def);
}

checkProc().then(() => process.exit(0));
