const { getPool } = require('../database/db');

async function run() {
  const pool = await getPool();
  // Check difference between UniversalTxnRegistry.CreatedAt and source module CreatedAt
  const res = await pool.request().query(`
    SELECT TOP 10 r.GlobalSerialNo, r.SourceModule, r.RecordID, r.CreatedAt as RegCreated, c.CreatedAt as CscCreated,
           DATEDIFF(MINUTE, r.CreatedAt, c.CreatedAt) as DiffMin
    FROM UniversalTxnRegistry r
    JOIN CSCApplications c ON r.SourceModule = 'CSC' AND r.RecordID = c.AppID
    WHERE DATEDIFF(MINUTE, r.CreatedAt, c.CreatedAt) <> 0
  `);
  console.log('CreatedAt diff samples:', res.recordset);

  const countDiff = await pool.request().query(`
    SELECT COUNT(*) as diffCount
    FROM UniversalTxnRegistry r
    JOIN CSCApplications c ON r.SourceModule = 'CSC' AND r.RecordID = c.AppID
    WHERE DATEDIFF(MINUTE, r.CreatedAt, c.CreatedAt) IN (330, -330)
  `);
  console.log('Total rows with 330 min diff in CSC:', countDiff.recordset[0]);

  // Check all source modules
  const allModulesDiff = await pool.request().query(`
    SELECT 'CSC' as Module, COUNT(*) as cnt FROM UniversalTxnRegistry r JOIN CSCApplications c ON r.SourceModule = 'CSC' AND r.RecordID = c.AppID WHERE DATEDIFF(MINUTE, r.CreatedAt, c.CreatedAt) IN (330, -330)
    UNION ALL
    SELECT 'BC' as Module, COUNT(*) as cnt FROM UniversalTxnRegistry r JOIN BCTransactions b ON r.SourceModule = 'BC' AND r.RecordID = b.BCID WHERE DATEDIFF(MINUTE, r.CreatedAt, b.CreatedAt) IN (330, -330)
    UNION ALL
    SELECT 'BillPay' as Module, COUNT(*) as cnt FROM UniversalTxnRegistry r JOIN BillPayments bp ON r.SourceModule = 'BillPay' AND r.RecordID = bp.PaymentID WHERE DATEDIFF(MINUTE, r.CreatedAt, bp.CreatedAt) IN (330, -330)
    UNION ALL
    SELECT 'Khata' as Module, COUNT(*) as cnt FROM UniversalTxnRegistry r JOIN KhataEntries k ON r.SourceModule = 'Khata' AND r.RecordID = k.KhataID WHERE DATEDIFF(MINUTE, r.CreatedAt, k.CreatedAt) IN (330, -330)
    UNION ALL
    SELECT 'Cashbook' as Module, COUNT(*) as cnt FROM UniversalTxnRegistry r JOIN Transactions t ON r.SourceModule = 'Cashbook' AND r.RecordID = t.TransactionID WHERE DATEDIFF(MINUTE, r.CreatedAt, t.CreatedAt) IN (330, -330)
  `);
  console.table(allModulesDiff.recordset);

  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
