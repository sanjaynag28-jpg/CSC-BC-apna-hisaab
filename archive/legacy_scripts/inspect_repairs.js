const { getPool } = require('../database/db');

async function inspect() {
  const pool = await getPool();
  // 1. Orphan check in UniversalTxnRegistry (where source table record does not exist)
  const regCheck = await pool.request().query(`
    SELECT r.GlobalSerialNo, r.SNCode, r.ModuleCode, r.SourceModule, r.RecordID, r.EntityName, r.Amount, r.IsActive
    FROM UniversalTxnRegistry r
    LEFT JOIN BCTransactions b ON r.SourceModule = 'BC' AND r.RecordID = b.BCID
    LEFT JOIN CSCApplications c ON r.SourceModule = 'CSC' AND r.RecordID = c.AppID
    LEFT JOIN BillPayments bp ON r.SourceModule = 'BillPay' AND r.RecordID = bp.PaymentID
    LEFT JOIN Invoices inv ON r.SourceModule = 'Invoices' AND r.RecordID = inv.InvoiceID
    LEFT JOIN KhataEntries k ON r.SourceModule = 'Khata' AND r.RecordID = k.KhataID
    LEFT JOIN Transactions t ON r.SourceModule = 'Cashbook' AND r.RecordID = t.TransactionID
    LEFT JOIN Bills bil ON r.SourceModule = 'Bills' AND r.RecordID = bil.BillID
    WHERE b.BCID IS NULL AND c.AppID IS NULL AND bp.PaymentID IS NULL 
      AND inv.InvoiceID IS NULL AND k.KhataID IS NULL AND t.TransactionID IS NULL AND bil.BillID IS NULL
    ORDER BY r.GlobalSerialNo ASC
  `);
  console.log('Orphan SNs in Registry count:', regCheck.recordset.length);
  console.table(regCheck.recordset);

  // 2. Check CSC-808 amount
  const csc808 = await pool.request().query(`
    SELECT r.GlobalSerialNo, r.ModuleCode, r.Amount as RegAmt, c.AppID, c.TotalFee, c.PaidAmount
    FROM UniversalTxnRegistry r
    JOIN CSCApplications c ON r.RecordID = c.AppID AND r.SourceModule = 'CSC'
    WHERE r.ModuleCode = 'CSC-808' OR c.AppID = 808
  `);
  console.log('CSC-808 check:', csc808.recordset);

  // 3. Check BP-4 / BP-5 amount
  const bp45 = await pool.request().query(`
    SELECT r.GlobalSerialNo, r.ModuleCode, r.Amount as RegAmt, bp.PaymentID, bp.TotalCollected, bp.BillAmount, bp.CustomerCharge
    FROM UniversalTxnRegistry r
    JOIN BillPayments bp ON r.RecordID = bp.PaymentID AND r.SourceModule = 'BillPay'
    WHERE r.ModuleCode IN ('BP-4', 'BP-5') OR bp.PaymentID IN (4, 5)
  `);
  console.log('BP-4/5 check:', bp45.recordset);

  process.exit(0);
}
inspect().catch(err => { console.error(err); process.exit(1); });
