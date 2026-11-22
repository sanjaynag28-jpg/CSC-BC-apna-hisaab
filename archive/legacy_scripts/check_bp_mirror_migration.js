const { getPool } = require('../database/db');

async function check() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT t.TransactionID, t.Reference, t.TransType, t.Amount, bp.PaymentID, bp.TxnReference, bp.CustomerName
    FROM Transactions t
    JOIN BillPayments bp ON t.Reference = bp.TxnReference
    WHERE t.Reference NOT LIKE 'BP-%'
    ORDER BY bp.PaymentID ASC
  `);
  console.log('Transactions where Reference = TxnReference (not BP-<id>):', r.recordset.length);
  console.table(r.recordset);

  // Also check KhataEntries
  const kh = await pool.request().query(`
    SELECT k.KhataID, k.ReferenceNo, bp.PaymentID, bp.TxnReference
    FROM KhataEntries k
    JOIN BillPayments bp ON k.ReferenceNo = bp.TxnReference
    WHERE k.ReferenceNo NOT LIKE 'BP-%'
  `);
  console.log('KhataEntries where ReferenceNo = TxnReference (not BP-<id>):', kh.recordset.length);
  if (kh.recordset.length > 0) console.table(kh.recordset);

  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
