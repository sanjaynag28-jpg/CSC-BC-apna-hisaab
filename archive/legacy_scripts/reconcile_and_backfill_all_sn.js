const { getPool, query } = require('../database/db');
const { registerGlobalTransaction } = require('../database/globalTxnRegistry');

async function reconcileAndBackfill() {
  console.log('================================================================');
  console.log('🚀 RECONCILE & COMPLETE UNIVERSAL SN BACKFILL ACROSS ALL MODULES');
  console.log('================================================================\n');

  const pool = await getPool();

  // 1. Clean up dummy test artifact CSC AppID 822
  console.log('--- Step 1: Clean up Dummy Test CSC AppID 822 ---');
  const dummyCsc = await pool.request().query("SELECT AppID, CustomerName, ServiceType, IsActive FROM CSCApplications WHERE AppID = 822");
  if (dummyCsc.recordset.length > 0) {
    const row = dummyCsc.recordset[0];
    if (row.CustomerName === 'Dummy Test App' && row.IsActive === false) {
      await pool.request().query("DELETE FROM CSCApplications WHERE AppID = 822");
      console.log('✅ Deleted dummy test app AppID 822 from CSCApplications.');
    }
  } else {
    console.log('ℹ️ No dummy CSC AppID 822 found (already cleaned).');
  }

  // 2. Register KhataID 706 (Bill Payment Bakiya)
  console.log('\n--- Step 2: Register KhataID 706 in UniversalTxnRegistry ---');
  const khata706 = await pool.request().query("SELECT * FROM KhataEntries WHERE KhataID = 706");
  if (khata706.recordset.length > 0 && !khata706.recordset[0].GlobalSerialNo) {
    const k = khata706.recordset[0];
    const custRes = await pool.request().query(`SELECT CustomerName FROM Customers WHERE CustomerID = ${k.CustomerID}`);
    const custName = custRes.recordset[0]?.CustomerName || 'Customer';
    const reg = await registerGlobalTransaction({
      sourceModule: 'Khata',
      recordId: 706,
      entityName: `${custName} (Bill Bakiya)`,
      amount: k.Amount,
      transDate: k.EntryDate,
      createdAt: k.CreatedAt,
      userId: k.UserID || 1
    });
    console.log(`✅ KhataID 706 successfully registered: SN = ${reg.snCode}, ModuleCode = ${reg.moduleCode}`);
  } else {
    console.log('ℹ️ KhataID 706 already has SN or not found.');
  }

  // 3. Link 90 BC-Flow rows in KhataEntries from parent BCTransactions
  console.log('\n--- Step 3: Link BC-Flow rows in KhataEntries from parent BC ---');
  const bcFlowUpdate = await pool.request().query(`
    UPDATE k
    SET 
      k.GlobalSerialNo = b.GlobalSerialNo,
      k.SNCode = b.SNCode,
      k.ModuleCode = b.ModuleCode
    FROM KhataEntries k
    JOIN BCTransactions b ON k.BCID = b.BCID
    WHERE k.EntryType = 'BC-Flow' 
      AND (k.GlobalSerialNo IS NULL OR k.GlobalSerialNo = 0)
      AND b.GlobalSerialNo IS NOT NULL;
  `);
  console.log(`✅ Updated ${bcFlowUpdate.rowsAffected[0]} BC-Flow rows in KhataEntries with parent BC Universal SN!`);

  // 4. Register only explicit BC Settlement transfers in UniversalTxnRegistry
  console.log('\n--- Step 4: Register BC Settlement Transfers in Cashbook ---');
  const unregTransfers = await pool.request().query(`
    SELECT TransactionID, TransDate, Amount, Description, UserID, CreatedAt
    FROM Transactions
    WHERE TransType = 'Transfer' 
      AND GlobalSerialNo IS NULL
      AND (IsDeleted = 0 OR IsDeleted IS NULL)
      AND Tags LIKE 'BC Settlement,%'
    ORDER BY TransactionID ASC
  `);

  console.log(`Found ${unregTransfers.recordset.length} unregistered BC Settlement transfers.`);
  for (const t of unregTransfers.recordset) {
    const reg = await registerGlobalTransaction({
      sourceModule: 'Cashbook',
      recordId: t.TransactionID,
      entityName: t.Description || 'BC Settlement Transfer',
      amount: t.Amount,
      transDate: t.TransDate,
      createdAt: t.CreatedAt || new Date(),
      userId: t.UserID || 1
    });
    console.log(`  -> TransactionID ${t.TransactionID} (${t.Description}): Registered as ${reg.snCode} (${reg.moduleCode})`);
  }

  // 5. Link Mirror Cashbook Transactions to Parent Universal SNs
  console.log('\n--- Step 5: Link Cashbook Mirror Postings to Parent Module Universal SN ---');

  // A. Link CSC Mirror rows (by APP-<id>)
  const linkCscApp = await pool.request().query(`
    UPDATE t
    SET 
      t.GlobalSerialNo = c.GlobalSerialNo,
      t.SNCode = c.SNCode,
      t.ModuleCode = c.ModuleCode
    FROM Transactions t
    JOIN CSCApplications c ON t.Reference = 'APP-' + CAST(c.AppID AS VARCHAR(20))
    WHERE (t.GlobalSerialNo IS NULL OR t.GlobalSerialNo = 0)
      AND c.GlobalSerialNo IS NOT NULL;
  `);
  console.log(`  -> Linked ${linkCscApp.rowsAffected[0]} CSC APP-<id> mirror transactions in Cashbook.`);

  // B. Link CSC Mirror rows (by AckNumber)
  const linkCscAck = await pool.request().query(`
    UPDATE t
    SET 
      t.GlobalSerialNo = c.GlobalSerialNo,
      t.SNCode = c.SNCode,
      t.ModuleCode = c.ModuleCode
    FROM Transactions t
    JOIN CSCApplications c ON t.Reference = c.AckNumber
    WHERE (t.GlobalSerialNo IS NULL OR t.GlobalSerialNo = 0)
      AND c.GlobalSerialNo IS NOT NULL;
  `);
  console.log(`  -> Linked ${linkCscAck.rowsAffected[0]} CSC AckNumber mirror transactions in Cashbook.`);

  // C. Link Bill Payment Mirror rows (by TxnReference)
  const linkBp = await pool.request().query(`
    UPDATE t
    SET 
      t.GlobalSerialNo = b.GlobalSerialNo,
      t.SNCode = b.SNCode,
      t.ModuleCode = b.ModuleCode
    FROM Transactions t
    JOIN BillPayments b ON t.Reference = b.TxnReference
    WHERE (t.GlobalSerialNo IS NULL OR t.GlobalSerialNo = 0)
      AND b.GlobalSerialNo IS NOT NULL;
  `);
  console.log(`  -> Linked ${linkBp.rowsAffected[0]} BillPay mirror transactions in Cashbook.`);

  // D. Link Invoice Mirror rows (by InvoiceNumber)
  const linkInv = await pool.request().query(`
    UPDATE t
    SET 
      t.GlobalSerialNo = inv.GlobalSerialNo,
      t.SNCode = inv.SNCode,
      t.ModuleCode = inv.ModuleCode
    FROM Transactions t
    JOIN Invoices inv ON t.Reference = inv.InvoiceNumber
    WHERE (t.GlobalSerialNo IS NULL OR t.GlobalSerialNo = 0)
      AND inv.GlobalSerialNo IS NOT NULL;
  `);
  console.log(`  -> Linked ${linkInv.rowsAffected[0]} Invoice mirror transactions in Cashbook.`);

  console.log('\n================================================================');
  console.log('✅ RECONCILIATION & BACKFILL COMPLETED SUCCESSFULLY');
  console.log('================================================================\n');

  process.exit(0);
}

reconcileAndBackfill().catch(err => {
  console.error('Fatal error during reconciliation:', err);
  process.exit(1);
});
