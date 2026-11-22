const { getPool, query } = require('../database/db');
const { registerGlobalTransaction } = require('../database/globalTxnRegistry');

async function backfillModule(sourceModule, pk, rows) {
    let done = 0;
    for (const r of rows) {
        const recordId = r[pk];
        if (!recordId) continue;
        try {
            await registerGlobalTransaction({
                sourceModule,
                recordId,
                entityName: r.entityName || r.Description || r.CustomerName || r.InvoiceNumber || sourceModule,
                amount: r.amount,
                transDate: r.transDate,
                createdAt: r.createdAt || null,
                userId: r.userId || 1
            });
            done++;
        } catch (e) {
            console.error(`[${sourceModule}] Failed ID ${recordId}:`, e.message);
        }
    }
    console.log(`✅ [${sourceModule}] ${done}/${rows.length} records registered in UniversalTxnRegistry.`);
}

async function runBackfillAndReconcile() {
    console.log('================================================================');
    console.log('🔄 UNIVERSAL SN BACKFILL & PROPAGATION SCRIPT');
    console.log('================================================================\n');

    const pool = await getPool();

    // 1. CSC Applications
    const csc = await query(`
        SELECT a.AppID, a.CustomerName, a.TotalFee AS amount, a.ApplyDate AS transDate, a.CreatedAt AS createdAt, a.UserID AS userId
        FROM CSCApplications a
        WHERE a.IsActive = 1 
          AND NOT EXISTS (
              SELECT 1 FROM UniversalTxnRegistry u 
              WHERE u.SourceModule = 'CSC' AND u.RecordID = a.AppID AND u.IsActive = 1
          )
    `);
    await backfillModule('CSC', 'AppID', csc.recordset.map(r => ({ AppID: r.AppID, entityName: r.CustomerName, amount: r.amount, transDate: r.transDate, createdAt: r.createdAt, userId: r.userId })));

    // 2. BC Transactions
    const bc = await query(`
        SELECT b.BCID, b.CustomerName, b.Amount AS amount, b.TransDate AS transDate, b.CreatedAt AS createdAt, b.UserID AS userId
        FROM BCTransactions b
        WHERE NOT EXISTS (
            SELECT 1 FROM UniversalTxnRegistry u 
            WHERE u.SourceModule = 'BC' AND u.RecordID = b.BCID AND u.IsActive = 1
        )
    `);
    await backfillModule('BC', 'BCID', bc.recordset.map(r => ({ BCID: r.BCID, entityName: r.CustomerName, amount: r.amount, transDate: r.transDate, createdAt: r.createdAt, userId: r.userId })));

    // 3. Bill Payments
    const bp = await query(`
        SELECT bp.PaymentID, bp.CustomerName, ISNULL(bp.TotalBillAmount, bp.BillAmount) AS amount, bp.PaymentDate AS transDate, bp.CreatedAt AS createdAt, bp.UserID AS userId
        FROM BillPayments bp
        WHERE ISNULL(bp.IsDeleted, 0) = 0
          AND NOT EXISTS (
              SELECT 1 FROM UniversalTxnRegistry u 
              WHERE u.SourceModule = 'BillPay' AND u.RecordID = bp.PaymentID AND u.IsActive = 1
          )
    `);
    await backfillModule('BillPay', 'PaymentID', bp.recordset.map(r => ({ PaymentID: r.PaymentID, entityName: r.CustomerName || 'Bill Payment', amount: r.amount, transDate: r.transDate, createdAt: r.createdAt, userId: r.userId })));

    // 4. Invoices
    const inv = await query(`
        SELECT i.InvoiceID, i.InvoiceNumber, i.TotalAmount AS amount, i.InvoiceDate AS transDate, i.CreatedAt AS createdAt, i.UserID AS userId
        FROM Invoices i
        WHERE ISNULL(i.Status,'') <> 'Cancelled' 
          AND NOT EXISTS (
              SELECT 1 FROM UniversalTxnRegistry u 
              WHERE u.SourceModule = 'Invoices' AND u.RecordID = i.InvoiceID AND u.IsActive = 1
          )
    `);
    await backfillModule('Invoices', 'InvoiceID', inv.recordset.map(r => ({ InvoiceID: r.InvoiceID, entityName: r.InvoiceNumber, amount: r.amount, transDate: r.transDate, createdAt: r.createdAt, userId: r.userId })));

    // 5. Khata Entries (Genuine Khata only - exclude mirror rows that inherit parent module SN)
    const kh = await query(`
        SELECT k.KhataID, ISNULL(c.CustomerName, k.Description) AS CustomerName, k.Description, k.Amount AS amount, k.EntryDate AS transDate, k.CreatedAt AS createdAt, k.UserID AS userId
        FROM KhataEntries k
        LEFT JOIN Customers c ON k.CustomerID = c.CustomerID
        WHERE k.BCID IS NULL
          AND ISNULL(k.EntryType, '') NOT IN ('BC-Flow', 'Settlement')
          AND NOT EXISTS (
              SELECT 1 FROM UniversalTxnRegistry u 
              WHERE u.SourceModule = 'Khata' AND u.RecordID = k.KhataID AND u.IsActive = 1
          )
    `);
    await backfillModule('Khata', 'KhataID', kh.recordset.map(r => ({ 
        KhataID: r.KhataID, 
        entityName: `${r.CustomerName || 'Customer'} (${r.Description || 'Khata'})`, 
        amount: r.amount, 
        transDate: r.transDate, 
        createdAt: r.createdAt, 
        userId: r.userId 
    })));

    // 6. Cashbook Transactions (Genuine Cashbook only - exclude mirror rows like APP-%, BP-%, INV-%, EW%)
    const tx = await query(`
        SELECT t.TransactionID, t.Description, t.Amount AS amount, t.TransDate AS transDate, t.CreatedAt AS createdAt, t.UserID AS userId
        FROM Transactions t
        WHERE ISNULL(t.IsDeleted, 0) = 0 
          AND (t.Reference IS NULL OR (
              t.Reference NOT LIKE 'APP-%' 
              AND t.Reference NOT LIKE 'BP-%' 
              AND t.Reference NOT LIKE 'INV-%'
              AND t.Reference NOT LIKE 'BILL-%'
              AND t.Reference NOT LIKE 'EW%'
          ))
          AND NOT EXISTS (
              SELECT 1 FROM UniversalTxnRegistry u 
              WHERE u.SourceModule = 'Cashbook' AND u.RecordID = t.TransactionID AND u.IsActive = 1
          )
    `);
    await backfillModule('Cashbook', 'TransactionID', tx.recordset.map(r => ({ TransactionID: r.TransactionID, entityName: r.Description, amount: r.amount, transDate: r.transDate, createdAt: r.createdAt, userId: r.userId })));

    // ================================================================
    // PROPAGATION TO ALL MIRROR ROWS
    // ================================================================
    console.log('\n--- Propagating Parent SN to Mirror Rows ---');

    // A. Link BC-Flow in KhataEntries from BCTransactions
    const bcFlow = await pool.request().query(`
        UPDATE k
        SET k.GlobalSerialNo = b.GlobalSerialNo,
            k.SNCode = b.SNCode,
            k.ModuleCode = b.ModuleCode
        FROM KhataEntries k
        JOIN BCTransactions b ON k.BCID = b.BCID
        WHERE k.EntryType = 'BC-Flow'
          AND (k.GlobalSerialNo IS NULL OR k.GlobalSerialNo = 0)
          AND b.GlobalSerialNo IS NOT NULL;
    `);
    console.log(`  -> Propagated to ${bcFlow.rowsAffected[0]} BC-Flow rows in Khata.`);

    // B. Link CSC mirror rows in Transactions by APP-<id>
    const cscAppTx = await pool.request().query(`
        UPDATE t
        SET t.GlobalSerialNo = c.GlobalSerialNo,
            t.SNCode = c.SNCode,
            t.ModuleCode = c.ModuleCode
        FROM Transactions t
        JOIN CSCApplications c ON t.Reference = 'APP-' + CAST(c.AppID AS VARCHAR(20))
        WHERE (t.GlobalSerialNo IS NULL OR t.GlobalSerialNo = 0)
          AND c.GlobalSerialNo IS NOT NULL;
    `);
    console.log(`  -> Propagated to ${cscAppTx.rowsAffected[0]} CSC APP-<id> mirror rows in Transactions.`);

    // C. Link CSC mirror rows in Transactions by AckNumber
    const cscAckTx = await pool.request().query(`
        UPDATE t
        SET t.GlobalSerialNo = c.GlobalSerialNo,
            t.SNCode = c.SNCode,
            t.ModuleCode = c.ModuleCode
        FROM Transactions t
        JOIN CSCApplications c ON t.Reference = c.AckNumber
        WHERE (t.GlobalSerialNo IS NULL OR t.GlobalSerialNo = 0)
          AND c.GlobalSerialNo IS NOT NULL
          AND ISNULL(c.AckNumber, '') <> '';
    `);
    console.log(`  -> Propagated to ${cscAckTx.rowsAffected[0]} CSC AckNumber mirror rows in Transactions.`);

    // D. Link BillPay mirror rows in Transactions by TxnReference or BP-<id>
    const bpTx = await pool.request().query(`
        UPDATE t
        SET t.GlobalSerialNo = b.GlobalSerialNo,
            t.SNCode = b.SNCode,
            t.ModuleCode = b.ModuleCode
        FROM Transactions t
        JOIN BillPayments b ON (t.Reference = b.TxnReference OR t.Reference = 'BP-' + CAST(b.PaymentID AS VARCHAR(20)))
        WHERE (t.GlobalSerialNo IS NULL OR t.GlobalSerialNo = 0)
          AND b.GlobalSerialNo IS NOT NULL;
    `);
    console.log(`  -> Propagated to ${bpTx.rowsAffected[0]} BillPay mirror rows in Transactions.`);

    // E. Link Invoice mirror rows in Transactions by InvoiceNumber
    const invTx = await pool.request().query(`
        UPDATE t
        SET t.GlobalSerialNo = i.GlobalSerialNo,
            t.SNCode = i.SNCode,
            t.ModuleCode = i.ModuleCode
        FROM Transactions t
        JOIN Invoices i ON t.Reference = i.InvoiceNumber
        WHERE (t.GlobalSerialNo IS NULL OR t.GlobalSerialNo = 0)
          AND i.GlobalSerialNo IS NOT NULL;
    `);
    console.log(`  -> Propagated to ${invTx.rowsAffected[0]} Invoice mirror rows in Transactions.`);

    console.log('\n================================================================');
    console.log('✅ ALL BACKFILL AND PROPAGATIONS COMPLETED');
    console.log('================================================================\n');
    process.exit(0);
}

runBackfillAndReconcile().catch(err => {
    console.error('Backfill error:', err);
    process.exit(1);
});
