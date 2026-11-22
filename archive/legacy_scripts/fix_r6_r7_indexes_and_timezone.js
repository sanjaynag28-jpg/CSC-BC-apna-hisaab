const { getPool } = require('../database/db');

async function fixR6AndR7() {
  console.log('--- Applying Fix R6 (Indexes) and R7 (CreatedAt Timezone) ---');
  const pool = await getPool();

  // ==========================================
  // R6: UNIQUE INDEXES IN SQL SERVER
  // ==========================================
  console.log('1. Checking and creating filtered unique index on UniversalTxnRegistry...');

  // Drop old unfiltered constraint/index if exists
  try {
    await pool.request().query(`
      IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_UniversalTxn_Module_Record' AND object_id = OBJECT_ID('UniversalTxnRegistry'))
      BEGIN
        DROP INDEX UQ_UniversalTxn_Module_Record ON UniversalTxnRegistry;
        PRINT 'Dropped old UQ_UniversalTxn_Module_Record';
      END
    `);
  } catch (e) {
    // If it was a constraint
    try {
      await pool.request().query(`ALTER TABLE UniversalTxnRegistry DROP CONSTRAINT UQ_UniversalTxn_Module_Record;`);
    } catch (_) { }
  }

  // Create filtered unique index on (SourceModule, RecordID) WHERE IsActive = 1
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_UniversalTxn_Module_Record_Active' AND object_id = OBJECT_ID('UniversalTxnRegistry'))
    BEGIN
      CREATE UNIQUE NONCLUSTERED INDEX UQ_UniversalTxn_Module_Record_Active 
      ON UniversalTxnRegistry (SourceModule, RecordID) 
      WHERE IsActive = 1;
      PRINT 'Created filtered UQ_UniversalTxn_Module_Record_Active';
    END
  `);
  console.log('✅ UQ_UniversalTxn_Module_Record_Active filtered index ready.');

  // Create unique index on SNCode
  await pool.request().query(`
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_UniversalTxn_SNCode' AND object_id = OBJECT_ID('UniversalTxnRegistry'))
    BEGIN
      DROP INDEX IX_UniversalTxn_SNCode ON UniversalTxnRegistry;
    END

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_UniversalTxnRegistry_SNCode' AND object_id = OBJECT_ID('UniversalTxnRegistry'))
    BEGIN
      CREATE UNIQUE NONCLUSTERED INDEX UQ_UniversalTxnRegistry_SNCode 
      ON UniversalTxnRegistry (SNCode) 
      WHERE SNCode IS NOT NULL;
    END
  `);
  console.log('✅ UQ_UniversalTxnRegistry_SNCode unique index ready.');

  // ==========================================
  // R7: SYNCHRONIZE CREATEDAT TIMESTAMPS
  // ==========================================
  console.log('\n2. Synchronizing CreatedAt timestamps across UniversalTxnRegistry and source tables...');

  // CSC
  const cscUp = await pool.request().query(`
    UPDATE r
    SET r.CreatedAt = c.CreatedAt
    FROM UniversalTxnRegistry r
    JOIN CSCApplications c ON r.SourceModule = 'CSC' AND r.RecordID = c.AppID
    WHERE DATEDIFF(MINUTE, r.CreatedAt, c.CreatedAt) IN (330, -330);
  `);
  console.log(`  -> Synced ${cscUp.rowsAffected[0]} CSC CreatedAt timestamps.`);

  // BC
  const bcUp = await pool.request().query(`
    UPDATE r
    SET r.CreatedAt = b.CreatedAt
    FROM UniversalTxnRegistry r
    JOIN BCTransactions b ON r.SourceModule = 'BC' AND r.RecordID = b.BCID
    WHERE DATEDIFF(MINUTE, r.CreatedAt, b.CreatedAt) IN (330, -330);
  `);
  console.log(`  -> Synced ${bcUp.rowsAffected[0]} BC CreatedAt timestamps.`);

  // BillPay
  const bpUp = await pool.request().query(`
    UPDATE r
    SET r.CreatedAt = bp.CreatedAt
    FROM UniversalTxnRegistry r
    JOIN BillPayments bp ON r.SourceModule = 'BillPay' AND r.RecordID = bp.PaymentID
    WHERE DATEDIFF(MINUTE, r.CreatedAt, bp.CreatedAt) IN (330, -330);
  `);
  console.log(`  -> Synced ${bpUp.rowsAffected[0]} BillPay CreatedAt timestamps.`);

  // Khata
  const khUp = await pool.request().query(`
    UPDATE r
    SET r.CreatedAt = k.CreatedAt
    FROM UniversalTxnRegistry r
    JOIN KhataEntries k ON r.SourceModule = 'Khata' AND r.RecordID = k.KhataID
    WHERE DATEDIFF(MINUTE, r.CreatedAt, k.CreatedAt) IN (330, -330);
  `);
  console.log(`  -> Synced ${khUp.rowsAffected[0]} Khata CreatedAt timestamps.`);

  // Cashbook
  const cbUp = await pool.request().query(`
    UPDATE r
    SET r.CreatedAt = t.CreatedAt
    FROM UniversalTxnRegistry r
    JOIN Transactions t ON r.SourceModule = 'Cashbook' AND r.RecordID = t.TransactionID
    WHERE DATEDIFF(MINUTE, r.CreatedAt, t.CreatedAt) IN (330, -330);
  `);
  console.log(`  -> Synced ${cbUp.rowsAffected[0]} Cashbook CreatedAt timestamps.`);

  console.log('✅ CreatedAt timezone synchronization complete.');
  process.exit(0);
}

fixR6AndR7().catch(e => { console.error('Error:', e); process.exit(1); });

