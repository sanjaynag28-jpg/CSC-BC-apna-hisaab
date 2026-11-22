const { getPool } = require('../database/db');

async function applyDataRepairs() {
  console.log('--- Applying Data Repairs ---');
  const pool = await getPool();

  // 1. Repair CSC-808 amount
  const cscRes = await pool.request().query(`
    UPDATE UniversalTxnRegistry
    SET Amount = 200
    WHERE ModuleCode = 'CSC-808';
  `);
  console.log(`✅ CSC-808 Amount updated to ₹200 (rows affected: ${cscRes.rowsAffected[0]})`);

  // 2. Repair BP-4 and BP-5 amounts
  const bp4Res = await pool.request().query(`
    UPDATE UniversalTxnRegistry
    SET Amount = 1246
    WHERE ModuleCode = 'BP-4';
  `);
  const bp5Res = await pool.request().query(`
    UPDATE UniversalTxnRegistry
    SET Amount = 3010
    WHERE ModuleCode = 'BP-5';
  `);
  console.log(`✅ BP-4 updated to ₹1,246 (rows: ${bp4Res.rowsAffected[0]}), BP-5 updated to ₹3,010 (rows: ${bp5Res.rowsAffected[0]})`);

  // 3. Clean up the 15 orphan/deleted test registry records whose source records no longer exist
  const orphanRes = await pool.request().query(`
    DELETE r
    FROM UniversalTxnRegistry r
    LEFT JOIN BCTransactions b ON r.SourceModule = 'BC' AND r.RecordID = b.BCID
    LEFT JOIN CSCApplications c ON r.SourceModule = 'CSC' AND r.RecordID = c.AppID
    LEFT JOIN BillPayments bp ON r.SourceModule = 'BillPay' AND r.RecordID = bp.PaymentID
    LEFT JOIN Invoices inv ON r.SourceModule = 'Invoices' AND r.RecordID = inv.InvoiceID
    LEFT JOIN KhataEntries k ON r.SourceModule = 'Khata' AND r.RecordID = k.KhataID
    LEFT JOIN Transactions t ON r.SourceModule = 'Cashbook' AND r.RecordID = t.TransactionID
    LEFT JOIN Bills bil ON r.SourceModule = 'Bills' AND r.RecordID = bil.BillID
    WHERE b.BCID IS NULL AND c.AppID IS NULL AND bp.PaymentID IS NULL 
      AND inv.InvoiceID IS NULL AND k.KhataID IS NULL AND t.TransactionID IS NULL AND bil.BillID IS NULL;
  `);
  console.log(`✅ Deleted ${orphanRes.rowsAffected[0]} orphan test records from UniversalTxnRegistry.`);

  process.exit(0);
}

applyDataRepairs().catch(e => { console.error(e); process.exit(1); });
