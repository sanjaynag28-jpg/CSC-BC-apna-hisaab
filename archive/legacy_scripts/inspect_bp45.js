const { getPool } = require('../database/db');

async function inspect() {
  const pool = await getPool();

  console.log('--- 1. Inspecting BillPayments with PaymentID >= 44 ---');
  const bps = await pool.request().query(`
    SELECT PaymentID, CustomerName, TotalCollected, BillAmount, CustomerDue, TxnReference, Status, IsDeleted, GlobalSerialNo, SNCode, ModuleCode, CreatedAt
    FROM BillPayments
    WHERE PaymentID >= 44
    ORDER BY PaymentID ASC
  `);
  console.log(bps.recordset);

  console.log('\n--- 2. Inspecting Transactions for BP-45 or TxnReference EW1571528251046060032 ---');
  const txs = await pool.request().query(`
    SELECT TransactionID, AccountID, TransType, Amount, Description, Reference, GlobalSerialNo, SNCode, ModuleCode, CreatedAt, IsDeleted
    FROM Transactions
    WHERE Reference LIKE '%45%' OR Reference = 'EW1571528251046060032' OR Description LIKE '%Mohd Saleem%'
    ORDER BY TransactionID ASC
  `);
  console.log(txs.recordset);

  console.log('\n--- 3. Checking all active BillPayments vs their Transactions mirrors count ---');
  const mirrorCheck = await pool.request().query(`
    SELECT bp.PaymentID, bp.CustomerName, bp.TxnReference, bp.TotalCollected, bp.BillAmount,
      (SELECT COUNT(*) FROM Transactions t WHERE t.Reference = 'BP-' + CAST(bp.PaymentID AS VARCHAR) OR (ISNULL(bp.TxnReference, '') <> '' AND t.Reference = bp.TxnReference)) as MirrorCount
    FROM BillPayments bp
    WHERE ISNULL(bp.IsDeleted, 0) = 0
    ORDER BY bp.PaymentID ASC
  `);
  const missingMirrors = mirrorCheck.recordset.filter(m => m.MirrorCount === 0);
  console.log(`Active BillPayments with ZERO mirrors: ${missingMirrors.length}`);
  console.log(missingMirrors);

  process.exit(0);
}

inspect().catch(e => { console.error(e); process.exit(1); });
