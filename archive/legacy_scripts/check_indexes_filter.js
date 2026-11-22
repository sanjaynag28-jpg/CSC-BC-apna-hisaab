const { getPool } = require('../database/db');

async function run() {
  const pool = await getPool();
  const res = await pool.request().query(`
    SELECT name, is_unique, has_filter, filter_definition 
    FROM sys.indexes 
    WHERE object_id = OBJECT_ID('UniversalTxnRegistry')
  `);
  console.table(res.recordset);
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
