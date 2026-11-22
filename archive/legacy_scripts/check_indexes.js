const { getPool } = require('../database/db');

async function run() {
  const pool = await getPool();
  const res = await pool.request().query(`
    SELECT i.name as IndexName, i.is_unique, c.name as ColumnName
    FROM sys.indexes i
    JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
    JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
    WHERE i.object_id = OBJECT_ID('UniversalTxnRegistry')
  `);
  console.table(res.recordset);
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
