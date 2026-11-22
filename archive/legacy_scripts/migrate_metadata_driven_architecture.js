/**
 * migrate_metadata_driven_architecture.js
 * 
 * Safe, non-destructive migration script to implement:
 * 1. TxnModules (Dynamic Module Catalog)
 * 2. CSCServices.ModuleCode (linking services to modules)
 * 3. FieldDefinitions (Dynamic form fields defined as rows)
 * 4. ServiceRecords (Universal execution record with strictly typed decimals and ExtraFieldsJson)
 * 
 * Strict Guarantees:
 * - 0 Data Loss (No drop, no truncate, no row deleted)
 * - 0 Balance Drift (Customer balance integrity checked before and after)
 * - 0 Customer Data Mix-up
 */

const { getPool } = require('../database/db');

async function runMigration() {
    console.log('====================================================');
    console.log('   METADATA-DRIVEN ARCHITECTURE MIGRATION SUITE     ');
    console.log('====================================================\n');

    const pool = await getPool();

    // 1. Take Customer Balance Snapshot
    console.log('--- Step 1: Capturing Customer Balances Baseline ---');
    const custRes = await pool.request().query(`
        SELECT CustomerID, CustomerName, CurrentBalance FROM Customers WHERE IsActive = 1
    `);
    const preBalances = new Map();
    custRes.recordset.forEach(c => preBalances.set(c.CustomerID, parseFloat(c.CurrentBalance) || 0));
    console.log(`Baseline recorded for ${preBalances.size} active customers.`);

    // 2. Take Record Counts Snapshot
    const tablesToCheck = [
        'Customers', 'KhataEntries', 'Transactions', 'CSCApplications', 
        'CSCServices', 'BCTransactions', 'BillPayments', 'Documents', 'Users'
    ];
    const preCounts = {};
    for (const tbl of tablesToCheck) {
        const r = await pool.request().query(`SELECT COUNT(*) as c FROM dbo.${tbl}`);
        preCounts[tbl] = r.recordset[0].c;
    }
    console.log('Baseline Record Counts:', preCounts);

    // 3. Create TxnModules Table
    console.log('\n--- Step 2: Creating TxnModules Table ---');
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'TxnModules')
        BEGIN
            CREATE TABLE dbo.TxnModules (
                ModuleID INT IDENTITY(1,1) NOT NULL,
                ModuleCode VARCHAR(30) NOT NULL,
                ModuleName NVARCHAR(100) NOT NULL,
                Prefix VARCHAR(10) NOT NULL,
                TargetTable VARCHAR(50) NULL,
                PrimaryKeyColumn VARCHAR(50) NULL,
                IsCore BIT NOT NULL DEFAULT 1,
                IsActive BIT NOT NULL DEFAULT 1,
                DisplayOrder INT NOT NULL DEFAULT 0,
                CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
                UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
                CONSTRAINT PK_TxnModules PRIMARY KEY CLUSTERED (ModuleID),
                CONSTRAINT UQ_TxnModules_ModuleCode UNIQUE (ModuleCode)
            );
            PRINT 'Created table TxnModules';
        END
    `);

    // Pre-seed core existing modules
    console.log('Pre-seeding core modules in TxnModules...');
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.TxnModules WHERE ModuleCode = 'CSC')
            INSERT INTO dbo.TxnModules (ModuleCode, ModuleName, Prefix, TargetTable, PrimaryKeyColumn, IsCore, DisplayOrder)
            VALUES ('CSC', 'CSC e-Governance Services', 'CSC', 'CSCApplications', 'AppID', 1, 1);

        IF NOT EXISTS (SELECT 1 FROM dbo.TxnModules WHERE ModuleCode = 'BC')
            INSERT INTO dbo.TxnModules (ModuleCode, ModuleName, Prefix, TargetTable, PrimaryKeyColumn, IsCore, DisplayOrder)
            VALUES ('BC', 'Banking Correspondent / Kiosk', 'BC', 'BCTransactions', 'BCID', 1, 2);

        IF NOT EXISTS (SELECT 1 FROM dbo.TxnModules WHERE ModuleCode = 'BillPay')
            INSERT INTO dbo.TxnModules (ModuleCode, ModuleName, Prefix, TargetTable, PrimaryKeyColumn, IsCore, DisplayOrder)
            VALUES ('BillPay', 'Utility Bill Payments (BBPS)', 'BP', 'BillPayments', 'PaymentID', 1, 3);

        IF NOT EXISTS (SELECT 1 FROM dbo.TxnModules WHERE ModuleCode = 'Invoices')
            INSERT INTO dbo.TxnModules (ModuleCode, ModuleName, Prefix, TargetTable, PrimaryKeyColumn, IsCore, DisplayOrder)
            VALUES ('Invoices', 'Sales Invoices & Billing', 'INV', 'Invoices', 'InvoiceID', 1, 4);

        IF NOT EXISTS (SELECT 1 FROM dbo.TxnModules WHERE ModuleCode = 'Khata')
            INSERT INTO dbo.TxnModules (ModuleCode, ModuleName, Prefix, TargetTable, PrimaryKeyColumn, IsCore, DisplayOrder)
            VALUES ('Khata', 'Customer Khata Ledger', 'KH', 'KhataEntries', 'KhataID', 1, 5);

        IF NOT EXISTS (SELECT 1 FROM dbo.TxnModules WHERE ModuleCode = 'Cashbook')
            INSERT INTO dbo.TxnModules (ModuleCode, ModuleName, Prefix, TargetTable, PrimaryKeyColumn, IsCore, DisplayOrder)
            VALUES ('Cashbook', 'Daily Cash & Bank Transactions', 'CB', 'Transactions', 'TransactionID', 1, 6);

        IF NOT EXISTS (SELECT 1 FROM dbo.TxnModules WHERE ModuleCode = 'Service')
            INSERT INTO dbo.TxnModules (ModuleCode, ModuleName, Prefix, TargetTable, PrimaryKeyColumn, IsCore, DisplayOrder)
            VALUES ('Service', 'Universal Dynamic Services', 'SRV', 'ServiceRecords', 'RecordID', 0, 7);
    `);

    // 4. Add ModuleCode to CSCServices
    console.log('\n--- Step 3: Adding ModuleCode to CSCServices ---');
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CSCServices' AND COLUMN_NAME = 'ModuleCode')
        BEGIN
            ALTER TABLE dbo.CSCServices ADD ModuleCode VARCHAR(30) NULL DEFAULT 'CSC';
            PRINT 'Added ModuleCode to CSCServices';
        END
    `);
    await pool.request().query(`
        UPDATE dbo.CSCServices SET ModuleCode = 'CSC' WHERE ModuleCode IS NULL;
    `);
    console.log('CSCServices ModuleCode populated with default CSC.');

    // 5. Create FieldDefinitions Table
    console.log('\n--- Step 4: Creating FieldDefinitions Table ---');
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'FieldDefinitions')
        BEGIN
            CREATE TABLE dbo.FieldDefinitions (
                FieldID INT IDENTITY(1,1) NOT NULL,
                ServiceID INT NOT NULL,
                FieldKey VARCHAR(50) NOT NULL,
                FieldLabel NVARCHAR(100) NOT NULL,
                FieldType VARCHAR(30) NOT NULL DEFAULT 'text',
                FieldOptionsJson NVARCHAR(MAX) NULL,
                DefaultValue NVARCHAR(255) NULL,
                Placeholder NVARCHAR(255) NULL,
                IsRequired BIT NOT NULL DEFAULT 0,
                DisplayOrder INT NOT NULL DEFAULT 0,
                IsActive BIT NOT NULL DEFAULT 1,
                CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
                UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
                CONSTRAINT PK_FieldDefinitions PRIMARY KEY CLUSTERED (FieldID),
                CONSTRAINT FK_FieldDefinitions_Services FOREIGN KEY (ServiceID) REFERENCES dbo.CSCServices(ServiceID),
                CONSTRAINT UQ_FieldDefinitions_Service_Key UNIQUE (ServiceID, FieldKey)
            );
            PRINT 'Created table FieldDefinitions';
        END
    `);

    // 6. Create ServiceRecords Table
    console.log('\n--- Step 5: Creating ServiceRecords Table ---');
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'ServiceRecords')
        BEGIN
            CREATE TABLE dbo.ServiceRecords (
                RecordID INT IDENTITY(1,1) NOT NULL,
                ModuleCode VARCHAR(30) NOT NULL DEFAULT 'Service',
                ServiceID INT NOT NULL,
                CustomerID INT NOT NULL,
                UserID INT NOT NULL DEFAULT 1,
                
                GovtFee DECIMAL(18,2) NOT NULL DEFAULT 0.00,
                OperatorFee DECIMAL(18,2) NOT NULL DEFAULT 0.00,
                TotalFee DECIMAL(18,2) NOT NULL DEFAULT 0.00,
                PaidAmount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
                BalanceAmount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
                
                RecordDate DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
                CompletionDate DATE NULL,
                
                Status NVARCHAR(50) NOT NULL DEFAULT 'Pending',
                PaymentStatus NVARCHAR(30) NOT NULL DEFAULT 'Unpaid',
                PaymentMode NVARCHAR(50) NOT NULL DEFAULT 'Cash',
                Remarks NVARCHAR(500) NULL,
                
                ExtraFieldsJson NVARCHAR(MAX) NULL,
                
                GlobalSerialNo INT NULL,
                SNCode VARCHAR(30) NULL,
                ModuleCodeSerial VARCHAR(30) NULL,
                
                IsActive BIT NOT NULL DEFAULT 1,
                CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
                UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
                
                CONSTRAINT PK_ServiceRecords PRIMARY KEY CLUSTERED (RecordID),
                CONSTRAINT FK_ServiceRecords_Services FOREIGN KEY (ServiceID) REFERENCES dbo.CSCServices(ServiceID),
                CONSTRAINT FK_ServiceRecords_Customers FOREIGN KEY (CustomerID) REFERENCES dbo.Customers(CustomerID),
                CONSTRAINT FK_ServiceRecords_Users FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID)
            );
            PRINT 'Created table ServiceRecords';
        END

        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ServiceRecords_Module_Customer' AND object_id = OBJECT_ID('ServiceRecords'))
        BEGIN
            CREATE NONCLUSTERED INDEX IX_ServiceRecords_Module_Customer ON dbo.ServiceRecords (ModuleCode, CustomerID, RecordDate);
            PRINT 'Created index IX_ServiceRecords_Module_Customer';
        END

        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ServiceRecords_GlobalSerialNo' AND object_id = OBJECT_ID('ServiceRecords'))
        BEGIN
            CREATE NONCLUSTERED INDEX IX_ServiceRecords_GlobalSerialNo ON dbo.ServiceRecords (GlobalSerialNo);
            PRINT 'Created index IX_ServiceRecords_GlobalSerialNo';
        END
    `);

    // 7. Post-Migration Verification: Check Record Counts
    console.log('\n--- Step 6: Verifying Zero Data Loss across Existing Tables ---');
    let countErrors = 0;
    for (const tbl of tablesToCheck) {
        const r = await pool.request().query(`SELECT COUNT(*) as c FROM dbo.${tbl}`);
        const post = r.recordset[0].c;
        const pre = preCounts[tbl];
        if (post !== pre) {
            console.error(`❌ COUNT MISMATCH on ${tbl}: Pre=${pre}, Post=${post}`);
            countErrors++;
        } else {
            console.log(`✅ Table ${tbl}: ${post} rows (100% matched, 0 rows lost)`);
        }
    }
    if (countErrors > 0) throw new Error('Data count mismatch detected!');

    // 8. Post-Migration Verification: Check Customer Balances
    console.log('\n--- Step 7: Verifying Customer Balance Drift ---');
    const postCustRes = await pool.request().query(`
        SELECT CustomerID, CustomerName, CurrentBalance FROM Customers WHERE IsActive = 1
    `);
    const postBalances = new Map();
    postCustRes.recordset.forEach(c => postBalances.set(c.CustomerID, parseFloat(c.CurrentBalance) || 0));

    let balanceErrors = 0;
    for (const [custId, preVal] of preBalances.entries()) {
        const postVal = postBalances.get(custId);
        if (Math.abs(preVal - (postVal || 0)) > 0.001) {
            console.error(`❌ BALANCE DRIFT DETECTED: Customer #${custId} had ₹${preVal}, now has ₹${postVal}`);
            balanceErrors++;
        }
    }

    if (balanceErrors === 0) {
        console.log(`✅ Customer Balance Integrity: 0.00 drift across all ${preBalances.size} active customers!`);
    } else {
        throw new Error(`${balanceErrors} customer balance drifts detected!`);
    }

    console.log('\n====================================================');
    console.log('🎉 METADATA-DRIVEN ARCHITECTURE MIGRATION COMPLETE! ');
    console.log('====================================================\n');
    process.exit(0);
}

runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
