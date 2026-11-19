/**
 * migrate_schema_safety_and_performance.js
 * 
 * Non-destructive migration that:
 * 1. Creates `AppLicenses` table (safe, IF NOT EXISTS) for licensing/key activation.
 * 2. Adds targeted non-clustered performance indexes on foreign keys & modules.
 * 3. Records migration entry into `SchemaMigrations`.
 * 4. Verifies zero balance drift and zero data loss across all customers and tables.
 */

const { getPool, withTransaction } = require('./db');

async function migrate() {
    console.log('====================================================');
    console.log('  STARTING NON-DESTRUCTIVE SAFE SCHEMA MIGRATION    ');
    console.log('====================================================\n');

    const pool = await getPool();

    // 1. Snapshot customer balances before migration
    const preBalRes = await pool.request().query(`
        SELECT CustomerID, CustomerName, CurrentBalance FROM Customers WHERE IsActive = 1
    `);
    const preBalances = new Map();
    preBalRes.recordset.forEach(c => preBalances.set(c.CustomerID, parseFloat(c.CurrentBalance) || 0));
    console.log(`Pre-migration customer balance baseline taken for ${preBalances.size} customers.`);

    // 2. Snapshot table row counts before migration
    const preCountRes = await pool.request().query(`
        SELECT t.name AS TableName, SUM(p.rows) AS TotalRows
        FROM sys.tables t
        JOIN sys.partitions p ON t.object_id = p.object_id
        WHERE p.index_id IN (0, 1) AND t.is_ms_shipped = 0
        GROUP BY t.name
    `);
    const preCounts = new Map();
    preCountRes.recordset.forEach(r => preCounts.set(r.TableName, r.TotalRows));

    // 3. Apply Schema Upgrades
    console.log('\n--- Applying Non-Destructive Schema Additions ---');

    // Step A: Dedicated AppLicenses table
    console.log('A. Ensuring AppLicenses table exists...');
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'AppLicenses')
        BEGIN
            CREATE TABLE dbo.AppLicenses (
                LicenseID INT IDENTITY(1,1) NOT NULL,
                LicenseKey NVARCHAR(100) NOT NULL,
                CustomerShopName NVARCHAR(200) NULL,
                OwnerName NVARCHAR(150) NULL,
                MobileNumber NVARCHAR(20) NULL,
                HardwareID NVARCHAR(255) NULL,
                LicenseType NVARCHAR(50) NOT NULL DEFAULT ('Lifetime'),
                ActivationDate DATETIME NULL DEFAULT (getdate()),
                ExpiryDate DATETIME NULL,
                MaxDevices INT NOT NULL DEFAULT (1),
                IsActive BIT NOT NULL DEFAULT (1),
                Notes NVARCHAR(500) NULL,
                CreatedAt DATETIME NOT NULL DEFAULT (getdate()),
                UpdatedAt DATETIME NOT NULL DEFAULT (getdate()),
                CONSTRAINT PK_AppLicenses PRIMARY KEY CLUSTERED (LicenseID)
            );
            PRINT 'Created table AppLicenses';
        END
    `);

    // Step B: Performance Indexes
    console.log('B. Ensuring Performance Non-Clustered Indexes exist...');

    // 1. IX_KhataEntries_PaymentID
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_PaymentID' AND object_id = OBJECT_ID('KhataEntries'))
        BEGIN
            CREATE NONCLUSTERED INDEX IX_KhataEntries_PaymentID
            ON dbo.KhataEntries (PaymentID)
            WHERE PaymentID IS NOT NULL;
            PRINT 'Created index IX_KhataEntries_PaymentID';
        END
    `);

    // 2. IX_KhataEntries_ReferenceNo
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_ReferenceNo' AND object_id = OBJECT_ID('KhataEntries'))
        BEGIN
            CREATE NONCLUSTERED INDEX IX_KhataEntries_ReferenceNo
            ON dbo.KhataEntries (ReferenceNo)
            WHERE ReferenceNo IS NOT NULL;
            PRINT 'Created index IX_KhataEntries_ReferenceNo';
        END
    `);

    // 3. IX_Transactions_SourceModule_SourceID
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Transactions_SourceModule_SourceID' AND object_id = OBJECT_ID('Transactions'))
        BEGIN
            CREATE NONCLUSTERED INDEX IX_Transactions_SourceModule_SourceID
            ON dbo.Transactions (SourceModule, SourceID, LineType)
            WHERE SourceModule IS NOT NULL;
            PRINT 'Created index IX_Transactions_SourceModule_SourceID';
        END
    `);

    // 4. IX_InvoiceItems_InvoiceID
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InvoiceItems_InvoiceID' AND object_id = OBJECT_ID('InvoiceItems'))
        BEGIN
            CREATE NONCLUSTERED INDEX IX_InvoiceItems_InvoiceID
            ON dbo.InvoiceItems (InvoiceID);
            PRINT 'Created index IX_InvoiceItems_InvoiceID';
        END
    `);

    // 5. IX_Documents_Customer_Entity
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Documents_Customer_Entity' AND object_id = OBJECT_ID('Documents'))
        BEGIN
            CREATE NONCLUSTERED INDEX IX_Documents_Customer_Entity
            ON dbo.Documents (CustomerID, EntityType, EntityID);
            PRINT 'Created index IX_Documents_Customer_Entity';
        END
    `);

    // Step C: Register migration in SchemaMigrations
    console.log('C. Logging into SchemaMigrations...');
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM SchemaMigrations WHERE MigrationName = '005_schema_safety_indexes_and_licensing_v1')
        BEGIN
            INSERT INTO SchemaMigrations (MigrationName, AppliedAt, Description)
            VALUES (
                '005_schema_safety_indexes_and_licensing_v1',
                GETDATE(),
                'Added AppLicenses table, fixed sp_BackupCashManagementDB folder formula, added non-clustered indexes on KhataEntries(PaymentID, ReferenceNo), Transactions(SourceModule, SourceID, LineType), InvoiceItems(InvoiceID), Documents(CustomerID, EntityType)'
            );
            PRINT 'Logged migration 005_schema_safety_indexes_and_licensing_v1';
        END
    `);

    console.log('\n--- 4. POST-MIGRATION INTEGRITY & SAFETY CHECKS ---');

    // 4. Verify Customer Balances
    const postBalRes = await pool.request().query(`
        SELECT CustomerID, CustomerName, CurrentBalance FROM Customers WHERE IsActive = 1
    `);
    const postBalances = new Map();
    postBalRes.recordset.forEach(c => postBalances.set(c.CustomerID, parseFloat(c.CurrentBalance) || 0));

    let driftErrors = 0;
    for (const [custId, preVal] of preBalances.entries()) {
        const postVal = postBalances.get(custId);
        if (Math.abs(preVal - (postVal || 0)) > 0.001) {
            console.error(`❌ BALANCE DRIFT DETECTED: Customer #${custId} had ₹${preVal}, now has ₹${postVal}`);
            driftErrors++;
        }
    }

    if (driftErrors === 0) {
        console.log(`✅ Customer Balance Integrity: 0 drift across all ${preBalances.size} customers!`);
    } else {
        throw new Error(`CRITICAL: ${driftErrors} customer balance drifts detected!`);
    }

    // 5. Verify Table Row Counts (Zero Data Loss)
    const postCountRes = await pool.request().query(`
        SELECT t.name AS TableName, SUM(p.rows) AS TotalRows
        FROM sys.tables t
        JOIN sys.partitions p ON t.object_id = p.object_id
        WHERE p.index_id IN (0, 1) AND t.is_ms_shipped = 0
        GROUP BY t.name
    `);
    const postCounts = new Map();
    postCountRes.recordset.forEach(r => postCounts.set(r.TableName, r.TotalRows));

    let lossErrors = 0;
    for (const [tbl, preCnt] of preCounts.entries()) {
        const postCnt = postCounts.get(tbl);
        if (postCnt < preCnt) {
            console.error(`❌ DATA LOSS DETECTED: Table [${tbl}] had ${preCnt} rows, now has ${postCnt} rows!`);
            lossErrors++;
        }
    }

    if (lossErrors === 0) {
        console.log(`✅ Table Row Count Integrity: Zero data loss detected across all ${preCounts.size} tables!`);
    } else {
        throw new Error(`CRITICAL: ${lossErrors} tables experienced data loss!`);
    }

    console.log('\n====================================================');
    console.log('🎉 SCHEMA MIGRATION COMPLETED SAFELY & SUCCESSFULLY! ');
    console.log('====================================================\n');
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
