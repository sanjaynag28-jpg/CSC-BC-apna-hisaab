const { getPool } = require('../database/db');

async function run() {
  const pool = await getPool();
  const res = await pool.request().query(`
    SELECT r.GlobalSerialNo, r.SNCode, r.SourceModule, r.RecordID, r.ModuleCode, r.EntityName, r.Amount, r.IsActive
    FROM UniversalTxnRegistry r
    LEFT JOIN BCTransactions b ON r.SourceModule = 'BC' AND r.RecordID = b.BCID
    LEFT JOIN CSCApplications c ON r.SourceModule = 'CSC' AND r.RecordID = c.AppID
    LEFT JOIN BillPayments bp ON r.SourceModule = 'BillPay' AND r.RecordID = bp.PaymentID
    LEFT JOIN Invoices inv ON r.SourceModule = 'Invoices' AND r.RecordID = inv.InvoiceID
    LEFT JOIN KhataEntries k ON r.SourceModule = 'Khata' AND r.RecordID = k.KhataID
    LEFT JOIN Transactions t ON r.SourceModule = 'Cashbook' AND r.RecordID = t.TransactionID
    LEFT JOIN Bills bil ON r.SourceModule = 'Bills' AND r.RecordID = bil.BillID
    WHERE (b.BCID IS NULL AND c.AppID IS NULL AND bp.PaymentID IS NULL 
      AND inv.InvoiceID IS NULL AND k.KhataID IS NULL AND t.TransactionID IS NULL AND bil.BillID IS NULL)
      OR r.IsActive = 0
    ORDER BY r.GlobalSerialNo ASC
  `);
  console.log('Total orphan/inactive rows in Registry:', res.recordset.length);
  console.table(res.recordset);

  // Also check if any active rows in source modules have GlobalSerialNos between 833 and 1325 that might be orphaned from the perspective of source tables
  const orphanFromSource = await pool.request().query(`
    SELECT 'Transactions' as tbl, TransactionID as id, GlobalSerialNo, SNCode 
    FROM Transactions 
    WHERE GlobalSerialNo BETWEEN 833 AND 1325 
      AND GlobalSerialNo NOT IN (SELECT GlobalSerialNo FROM UniversalTxnRegistry)
  `);
  console.log('Transactions not in Registry:', orphanFromSource.recordset);

  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
