const { sql, getPool, query } = require('../database/db');

async function auditUniversalSN() {
  console.log('================================================================');
  console.log('🔍 DEEP AUDIT: UNIVERSAL SERIAL NUMBER (SN) ACROSS ALL MODULES');
  console.log('================================================================\n');

  const pool = await getPool();

  // 1. Audit UniversalTxnRegistry
  console.log('--- 1. UniversalTxnRegistry Stats & Integrity ---');
  const regStats = await pool.request().query(`
    SELECT 
      COUNT(*) as TotalRegistryRows,
      COUNT(DISTINCT GlobalSerialNo) as UniqueGlobalSerialNo,
      COUNT(DISTINCT SNCode) as UniqueSNCode,
      MIN(GlobalSerialNo) as MinGlobalSerialNo,
      MAX(GlobalSerialNo) as MaxGlobalSerialNo,
      SUM(CASE WHEN GlobalSerialNo IS NULL THEN 1 ELSE 0 END) as NullGlobalSerialNo,
      SUM(CASE WHEN SNCode IS NULL THEN 1 ELSE 0 END) as NullSNCode,
      SUM(CASE WHEN ModuleCode IS NULL THEN 1 ELSE 0 END) as NullModuleCode
    FROM UniversalTxnRegistry
  `);
  console.log('Registry Summary:', regStats.recordset[0]);

  // Breakdown by module in Registry
  const regByMod = await pool.request().query(`
    SELECT 
      SourceModule,
      COUNT(*) as TotalCount,
      SUM(CASE WHEN IsActive = 1 THEN 1 ELSE 0 END) as ActiveCount,
      MIN(GlobalSerialNo) as MinSN,
      MAX(GlobalSerialNo) as MaxSN
    FROM UniversalTxnRegistry
    GROUP BY SourceModule
    ORDER BY SourceModule
  `);
  console.log('\nRegistry Breakdown by SourceModule:');
  console.table(regByMod.recordset);

  // 2. Audit Each Source Module Table
  console.log('\n--- 2. Source Module Tables vs Universal SN ---');

  const modules = [
    { name: 'BC (BCTransactions)', table: 'BCTransactions', pk: 'BCID', mod: 'BC' },
    { name: 'CSC (CSCApplications)', table: 'CSCApplications', pk: 'AppID', mod: 'CSC' },
    { name: 'BillPay (BillPayments)', table: 'BillPayments', pk: 'PaymentID', mod: 'BillPay' },
    { name: 'Invoices (Invoices)', table: 'Invoices', pk: 'InvoiceID', mod: 'Invoices' },
    { name: 'Khata (KhataEntries)', table: 'KhataEntries', pk: 'KhataID', mod: 'Khata' },
    { name: 'Cashbook (Transactions)', table: 'Transactions', pk: 'TransactionID', mod: 'Cashbook' },
    { name: 'Bills (Bills)', table: 'Bills', pk: 'BillID', mod: 'Bills' }
  ];

  const auditResults = [];

  for (const m of modules) {
    try {
      // Check column existence
      const colCheck = await pool.request().query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = '${m.table}' 
          AND COLUMN_NAME IN ('GlobalSerialNo', 'SNCode', 'ModuleCode', 'IsDeleted')
      `);
      const existingCols = colCheck.recordset.map(c => c.COLUMN_NAME);
      const hasIsDeleted = existingCols.includes('IsDeleted');
      const delFilter = hasIsDeleted ? 'AND (IsDeleted = 0 OR IsDeleted IS NULL)' : '';

      const queryStr = `
        SELECT 
          COUNT(*) as TotalRows,
          SUM(CASE WHEN ${hasIsDeleted ? 'IsDeleted = 0 OR IsDeleted IS NULL' : '1=1'} THEN 1 ELSE 0 END) as ActiveRows,
          SUM(CASE WHEN GlobalSerialNo IS NOT NULL ${delFilter} THEN 1 ELSE 0 END) as WithGlobalSerialNo,
          SUM(CASE WHEN GlobalSerialNo IS NULL ${delFilter} THEN 1 ELSE 0 END) as MissingGlobalSerialNo,
          SUM(CASE WHEN SNCode IS NULL ${delFilter} THEN 1 ELSE 0 END) as MissingSNCode,
          MIN(CASE WHEN ${hasIsDeleted ? 'IsDeleted = 0 OR IsDeleted IS NULL' : '1=1'} THEN GlobalSerialNo END) as MinSN,
          MAX(CASE WHEN ${hasIsDeleted ? 'IsDeleted = 0 OR IsDeleted IS NULL' : '1=1'} THEN GlobalSerialNo END) as MaxSN
        FROM ${m.table}
      `;
      const res = await pool.request().query(queryStr);
      const row = res.recordset[0];

      // Check orphans: rows with GlobalSerialNo that do NOT exist in UniversalTxnRegistry
      const orphanCheck = await pool.request().query(`
        SELECT COUNT(*) as OrphanCount
        FROM ${m.table} t
        WHERE t.GlobalSerialNo IS NOT NULL
          ${delFilter}
          AND NOT EXISTS (
            SELECT 1 FROM UniversalTxnRegistry r 
            WHERE r.GlobalSerialNo = t.GlobalSerialNo
          )
      `);
      const orphanCount = orphanCheck.recordset[0].OrphanCount;

      auditResults.push({
        Module: m.name,
        Total: row.TotalRows,
        Active: row.ActiveRows,
        AssignedSN: row.WithGlobalSerialNo,
        MissingSN: row.MissingGlobalSerialNo,
        MissingSNCode: row.MissingSNCode,
        MinSN: row.MinSN || '-',
        MaxSN: row.MaxSN || '-',
        OrphanSN: orphanCount,
        Status: (row.MissingGlobalSerialNo === 0 && orphanCount === 0) ? '✅ 100% OK' : '⚠️ GAPS DETECTED'
      });
    } catch (err) {
      auditResults.push({
        Module: m.name,
        Total: 'ERROR',
        Active: 'ERROR',
        AssignedSN: '-',
        MissingSN: '-',
        MissingSNCode: '-',
        MinSN: '-',
        MaxSN: '-',
        OrphanSN: '-',
        Status: '❌ ' + err.message
      });
    }
  }

  console.table(auditResults);

  // 3. Inspect Any Specific Missing Records
  console.log('\n--- 3. Detailed Inspection of Any Missing SNs ---');
  for (const m of modules) {
    try {
      const colCheck = await pool.request().query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${m.table}' AND COLUMN_NAME = 'IsDeleted'
      `);
      const hasDel = colCheck.recordset.length > 0;
      const delFilter = hasDel ? 'AND (IsDeleted = 0 OR IsDeleted IS NULL)' : '';

      const missing = await pool.request().query(`
        SELECT TOP 5 ${m.pk}, GlobalSerialNo, SNCode, ModuleCode
        FROM ${m.table}
        WHERE GlobalSerialNo IS NULL ${delFilter}
        ORDER BY ${m.pk} DESC
      `);
      if (missing.recordset.length > 0) {
        console.log(`⚠️ ${m.name} has missing GlobalSerialNo:`, missing.recordset);
      }
    } catch (_) {}
  }

  // 4. Check Codebase Implementation of registerGlobalTransaction
  console.log('\n--- 4. Codebase Audit of registerGlobalTransaction across Routes ---');
  const routeFiles = [
    { file: 'routes/bc.js', name: 'BC Transactions' },
    { file: 'routes/csc.js', name: 'CSC Applications' },
    { file: 'routes/bill_payments.js', name: 'Bill & EMI Payments' },
    { file: 'routes/invoices.js', name: 'Invoices' },
    { file: 'routes/khatabook.js', name: 'Khata Book' },
    { file: 'routes/transactions.js', name: 'Cashbook' },
    { file: 'routes/bills.js', name: 'Bills' }
  ];

  const fs = require('fs');
  for (const rf of routeFiles) {
    if (fs.existsSync(rf.file)) {
      const content = fs.readFileSync(rf.file, 'utf8');
      const hasImport = content.includes('registerGlobalTransaction');
      const hasCall = content.includes('registerGlobalTransaction(');
      console.log(`${rf.name} (${rf.file}): ${hasCall ? '✅ Calls registerGlobalTransaction' : (hasImport ? '⚠️ Imported but check calls' : '❌ NOT FOUND')}`);
    }
  }

  console.log('\n================================================================');
  console.log('🎯 UNIVERSAL SN AUDIT FINISHED');
  console.log('================================================================');
  process.exit(0);
}

auditUniversalSN().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
