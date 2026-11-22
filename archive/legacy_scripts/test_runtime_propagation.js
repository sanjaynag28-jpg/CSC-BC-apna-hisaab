const { getPool, query } = require('../database/db');

async function testRuntimePropagation() {
  console.log('--- Testing Runtime Propagation Logic ---');
  const pool = await getPool();

  // Test 1: Check CSC-808 repaired amount
  const csc808 = await pool.request().query("SELECT Amount FROM UniversalTxnRegistry WHERE ModuleCode = 'CSC-808'");
  console.log('CSC-808 in Registry Amount:', csc808.recordset[0]?.Amount, csc808.recordset[0]?.Amount === 200 ? '✅ PASS' : '❌ FAIL');

  // Test 2: Check BP-4 and BP-5 repaired amounts
  const bp4 = await pool.request().query("SELECT Amount FROM UniversalTxnRegistry WHERE ModuleCode = 'BP-4'");
  const bp5 = await pool.request().query("SELECT Amount FROM UniversalTxnRegistry WHERE ModuleCode = 'BP-5'");
  console.log('BP-4 in Registry Amount:', bp4.recordset[0]?.Amount, bp4.recordset[0]?.Amount === 1246 ? '✅ PASS' : '❌ FAIL');
  console.log('BP-5 in Registry Amount:', bp5.recordset[0]?.Amount, bp5.recordset[0]?.Amount === 3010 ? '✅ PASS' : '❌ FAIL');

  // Test 3: Check that NO KhataEntries have fake ModuleCode = 'BP'
  const fakeBp = await pool.request().query("SELECT COUNT(*) as cnt FROM KhataEntries WHERE ModuleCode = 'BP'");
  console.log('KhataEntries with fake ModuleCode=\'BP\':', fakeBp.recordset[0].cnt, fakeBp.recordset[0].cnt === 0 ? '✅ PASS (Zero fake codes)' : '⚠️ Still present');

  // Test 4: Check that all 7 orphan registry rows are gone
  const orphanCheck = await pool.request().query(`
    SELECT COUNT(*) as cnt
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
  `);
  console.log('Orphans in UniversalTxnRegistry:', orphanCheck.recordset[0].cnt, orphanCheck.recordset[0].cnt === 0 ? '✅ PASS (Zero orphans)' : '❌ FAIL');

  process.exit(0);
}

testRuntimePropagation().catch(e => { console.error(e); process.exit(1); });
