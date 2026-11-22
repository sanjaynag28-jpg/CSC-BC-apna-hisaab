const { getPool } = require('../database/db');

async function inspectTxn() {
  const pool = await getPool();
  const cols = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Transactions'");
  console.log('Transactions columns:', cols.recordset.map(c => c.COLUMN_NAME).join(', '));

  const groups = await pool.request().query(`
    SELECT 
      TransType,
      COUNT(TransactionID) as Total,
      SUM(CASE WHEN GlobalSerialNo IS NOT NULL THEN 1 ELSE 0 END) as WithSN,
      SUM(CASE WHEN GlobalSerialNo IS NULL THEN 1 ELSE 0 END) as WithoutSN
    FROM Transactions
    GROUP BY TransType
  `);
  console.table(groups.recordset);

  // Check how many Transactions without SN have Reference or ModuleCode
  const refTypes = await pool.request().query(`
    SELECT 
      CASE 
        WHEN Reference LIKE 'BC-%' THEN 'BC Reference'
        WHEN Reference LIKE 'BP-%' THEN 'BP Reference'
        WHEN Reference LIKE 'CSC-%' THEN 'CSC Reference'
        WHEN Reference LIKE 'INV-%' THEN 'Invoice Reference'
        WHEN Reference IS NOT NULL AND Reference <> '' THEN 'Other Reference'
        ELSE 'Direct / Manual Entry'
      END as RefCategory,
      COUNT(TransactionID) as Count
    FROM Transactions
    WHERE GlobalSerialNo IS NULL
    GROUP BY 
      CASE 
        WHEN Reference LIKE 'BC-%' THEN 'BC Reference'
        WHEN Reference LIKE 'BP-%' THEN 'BP Reference'
        WHEN Reference LIKE 'CSC-%' THEN 'CSC Reference'
        WHEN Reference LIKE 'INV-%' THEN 'Invoice Reference'
        WHEN Reference IS NOT NULL AND Reference <> '' THEN 'Other Reference'
        ELSE 'Direct / Manual Entry'
      END
  `);
  console.table(refTypes.recordset);

  // Inspect the 33 transactions that DO have GlobalSerialNo
  const withSn = await pool.request().query(`
    SELECT TOP 10 TransactionID, TransType, Amount, Description, Reference, GlobalSerialNo, SNCode, ModuleCode
    FROM Transactions
    WHERE GlobalSerialNo IS NOT NULL
    ORDER BY TransactionID DESC
  `);
  console.table(withSn.recordset);

  process.exit(0);
}

inspectTxn();
