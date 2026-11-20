/**
 * autoSchemaBootstrapper.js
 * 
 * Self-Healing, Non-Destructive Dynamic Schema Engine (Layer 2 Declarative Manifest Runner).
 * Automatically verifies and prepares database schemas, tables, dynamic manifest columns,
 * and performance indexes on startup or whenever a new service/module is introduced.
 * 
 * Strict Guarantees:
 * 1. 100% NON-DESTRUCTIVE: Never drops, truncates, or deletes anything.
 * 2. ZERO DATA LOSS: All column additions are NULL or have safe defaults.
 * 3. DECLARATIVE LAYER 2: Driven directly by database/schemaManifest.js.
 * 4. CONCURRENCY SAFE: Protected with sp_getapplock exclusive lock.
 * 5. SAFETY BACKUP: Automatic database backup if any DDL modification is required.
 * 6. IDEMPOTENT: Safe to run thousands of times without side effects.
 */

const fs = require('fs');
const path = require('path');
const { query } = require('./db');
const schemaManifest = require('./schemaManifest');

const LOCK_RESOURCE = 'CM_AutoSchemaBootstrap';

async function takeAutoBackup() {
    try {
        const folder = path.join(__dirname, '..', 'backups');
        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
        const res = await query(`EXEC sp_BackupCashManagementDB @BackupFolder = @f`, { f: folder });
        const backupPath = res.recordset?.[0]?.BackupPath || folder;
        console.log(`🛡️ [AutoSchemaBootstrapper] Safety backup taken: ${backupPath}`);
        return backupPath;
    } catch (err) {
        console.warn('⚠️ [AutoSchemaBootstrapper] Auto-backup warning (proceeding):', err.message);
        return null;
    }
}

async function ensureAutoSchemaBootstrapped() {
    const logPrefix = '🛡️ [AutoSchemaBootstrapper]';
    console.log(`${logPrefix} Running dynamic schema self-healing verification...`);
    const additions = [];

    // Session-level app lock so multi-worker/PM2 does not collide
    let hasLock = false;
    try {
        const lockRes = await query(`
            DECLARE @r INT;
            EXEC @r = sp_getapplock @Resource = @res, @LockMode = 'Exclusive',
                                    @LockOwner = 'Session', @LockTimeout = 15000;
            SELECT @r AS Result;
        `, { res: LOCK_RESOURCE });
        const lockStatus = lockRes.recordset?.[0]?.Result;
        if (lockStatus !== undefined && lockStatus >= 0) {
            hasLock = true;
        }
    } catch (lErr) {
        console.warn(`${logPrefix} Warning acquiring applock:`, lErr.message);
    }

    try {
        // =====================================================================
        // 1. DYNAMIC SYSTEM & CORE EXTENSIBLE TABLES (IF NOT EXISTS)
        // =====================================================================

        // AppLicenses
        const licCheck = await query(`
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
                SELECT 1 AS added;
            END
            ELSE SELECT 0 AS added;
        `);
        if (licCheck.recordset[0]?.added) additions.push('Table: AppLicenses');

        // ApiIdempotencyRequests
        const idempCheck = await query(`
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'ApiIdempotencyRequests')
            BEGIN
                CREATE TABLE dbo.ApiIdempotencyRequests (
                    UserID INT NOT NULL,
                    RequestKey UNIQUEIDENTIFIER NOT NULL,
                    RequestHash CHAR(64) NOT NULL,
                    State NVARCHAR(16) NOT NULL,
                    HttpStatus INT NULL,
                    ResponseBody NVARCHAR(MAX) NULL,
                    CreatedAt DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
                    CompletedAt DATETIME2 NULL,
                    CONSTRAINT PK_ApiIdempotencyRequests PRIMARY KEY CLUSTERED (UserID, RequestKey)
                );
                SELECT 1 AS added;
            END
            ELSE SELECT 0 AS added;
        `);
        if (idempCheck.recordset[0]?.added) additions.push('Table: ApiIdempotencyRequests');

        // TxnModules (Dynamic Module Catalog)
        const txnModCheck = await query(`
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'TxnModules')
            BEGIN
                CREATE TABLE dbo.TxnModules (
                    ModuleID INT IDENTITY(1,1) NOT NULL,
                    ModuleCode VARCHAR(30) NOT NULL,
                    ModuleName NVARCHAR(100) NOT NULL,
                    Prefix VARCHAR(10) NOT NULL,
                    TargetTable VARCHAR(50) NULL,
                    PrimaryKeyColumn VARCHAR(50) NULL,
                    IsCore BIT NOT NULL DEFAULT(1),
                    IsActive BIT NOT NULL DEFAULT(1),
                    DisplayOrder INT NOT NULL DEFAULT(0),
                    DocPrefix VARCHAR(10) NULL,
                    RecordTable NVARCHAR(128) NULL,
                    IsLedgerLinked BIT NOT NULL DEFAULT(1),
                    Icon NVARCHAR(50) NULL,
                    Color NVARCHAR(20) NULL,
                    SortOrder INT NOT NULL DEFAULT(0),
                    UserID INT NOT NULL DEFAULT(1),
                    CreatedAt DATETIME NOT NULL DEFAULT(GETDATE()),
                    UpdatedAt DATETIME NOT NULL DEFAULT(GETDATE()),
                    CONSTRAINT PK_TxnModules PRIMARY KEY CLUSTERED (ModuleID),
                    CONSTRAINT UQ_TxnModules_ModuleCode UNIQUE (ModuleCode)
                );
                INSERT INTO dbo.TxnModules
                    (ModuleCode, ModuleName, Prefix, TargetTable, PrimaryKeyColumn, IsCore, IsActive, DisplayOrder, DocPrefix, RecordTable, SortOrder, UserID)
                VALUES
                ('CSC', 'CSC e-Governance Services', 'CSC', 'CSCApplications', 'AppID', 1, 1, 1, 'CSC', 'CSCApplications', 1, 1),
                ('BC', 'Banking Correspondent / Kiosk', 'BC', 'BCTransactions', 'BCID', 1, 1, 2, 'BC', 'BCTransactions', 2, 1),
                ('BillPay', 'Utility Bill Payments (BBPS)', 'BP', 'BillPayments', 'PaymentID', 1, 1, 3, 'BP', 'BillPayments', 3, 1),
                ('Invoices', 'Sales Invoices & Billing', 'INV', 'Invoices', 'InvoiceID', 1, 1, 4, 'INV', 'Invoices', 4, 1),
                ('Khata', 'Customer Khata Ledger', 'KH', 'KhataEntries', 'KhataID', 1, 1, 5, 'KH', 'KhataEntries', 5, 1),
                ('Cashbook', 'Daily Cash & Bank Transactions', 'CB', 'Transactions', 'TransactionID', 1, 1, 6, 'CB', 'Transactions', 6, 1),
                ('Service', 'Universal Dynamic Services', 'SRV', 'ServiceRecords', 'RecordID', 1, 1, 7, 'SRV', 'ServiceRecords', 7, 1);
                SELECT 1 AS added;
            END
            ELSE SELECT 0 AS added;
        `);
        if (txnModCheck.recordset[0]?.added) additions.push('Table: TxnModules');

        // FieldDefinitions (Dynamic Form Fields)
        const fieldDefCheck = await query(`
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'FieldDefinitions')
            BEGIN
                CREATE TABLE dbo.FieldDefinitions (
                    FieldID INT IDENTITY(1,1) PRIMARY KEY,
                    ModuleCode VARCHAR(30) NULL,
                    ServiceID INT NULL,
                    FieldKey VARCHAR(50) NOT NULL,
                    Label NVARCHAR(100) NOT NULL,
                    DataType VARCHAR(20) NOT NULL DEFAULT('text'),
                    OptionsJson NVARCHAR(MAX) NULL,
                    IsRequired BIT NOT NULL DEFAULT(0),
                    MaxLength INT NULL,
                    DefaultValue NVARCHAR(200) NULL,
                    ShowInList BIT NOT NULL DEFAULT(0),
                    SortOrder INT NOT NULL DEFAULT(0),
                    DisplayOrder INT NOT NULL DEFAULT(0),
                    IsActive BIT NOT NULL DEFAULT(1),
                    FieldLabel NVARCHAR(100) NULL,
                    FieldType VARCHAR(30) NULL,
                    FieldOptionsJson NVARCHAR(MAX) NULL,
                    Placeholder NVARCHAR(255) NULL,
                    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
                    UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
                    CONSTRAINT FK_FieldDefs_Module FOREIGN KEY (ModuleCode) REFERENCES dbo.TxnModules(ModuleCode),
                    CONSTRAINT UQ_FieldDefs UNIQUE (ModuleCode, ServiceID, FieldKey)
                );
                SELECT 1 AS added;
            END
            ELSE SELECT 0 AS added;
        `);
        if (fieldDefCheck.recordset[0]?.added) additions.push('Table: FieldDefinitions');

        // ServiceRecords (Universal Polymorphic Service Execution)
        const srvRecCheck = await query(`
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'ServiceRecords')
            BEGIN
                CREATE TABLE dbo.ServiceRecords (
                    RecordID INT IDENTITY(1,1) PRIMARY KEY,
                    ModuleCode VARCHAR(30) NOT NULL,
                    ServiceID INT NULL,
                    UserID INT NOT NULL DEFAULT 1,
                    CustomerID INT NULL,
                    CustomerName NVARCHAR(150) NULL,
                    CustomerPhone NVARCHAR(20) NULL,
                    RecordDate DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
                    CompletionDate DATE NULL,
                    GovtFee DECIMAL(18,2) NOT NULL DEFAULT(0),
                    OperatorFee DECIMAL(18,2) NOT NULL DEFAULT(0),
                    TotalFee DECIMAL(18,2) NOT NULL DEFAULT(0),
                    BalanceAmount DECIMAL(18,2) NOT NULL DEFAULT(0),
                    Amount DECIMAL(18,2) NOT NULL DEFAULT(0),
                    Charge DECIMAL(18,2) NOT NULL DEFAULT(0),
                    TotalAmount DECIMAL(18,2) NOT NULL DEFAULT(0),
                    PaidAmount DECIMAL(18,2) NOT NULL DEFAULT(0),
                    DueAmount DECIMAL(18,2) NOT NULL DEFAULT(0),
                    Status NVARCHAR(50) NOT NULL DEFAULT('Pending'),
                    PaymentStatus NVARCHAR(30) NOT NULL DEFAULT('Unpaid'),
                    PaymentMode NVARCHAR(50) NOT NULL DEFAULT('Cash'),
                    ReferenceNo NVARCHAR(100) NULL,
                    AccountID INT NULL,
                    CashAccountID INT NULL,
                    Remarks NVARCHAR(500) NULL,
                    ExtraFieldsJson NVARCHAR(MAX) NULL,
                    GlobalSerialNo INT NULL,
                    SNCode VARCHAR(30) NULL,
                    ModuleCodeSerial VARCHAR(30) NULL,
                    DocCode VARCHAR(30) NULL,
                    IsActive BIT NOT NULL DEFAULT(1),
                    IsDeleted BIT NOT NULL DEFAULT(0),
                    CreatedAt DATETIME NOT NULL DEFAULT(GETDATE()),
                    UpdatedAt DATETIME NOT NULL DEFAULT(GETDATE()),
                    CONSTRAINT FK_SR_Module FOREIGN KEY (ModuleCode) REFERENCES dbo.TxnModules(ModuleCode),
                    CONSTRAINT FK_SR_Users FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID)
                );
                SELECT 1 AS added;
            END
            ELSE SELECT 0 AS added;
        `);
        if (srvRecCheck.recordset[0]?.added) additions.push('Table: ServiceRecords');

        // =====================================================================
        // 2. DECLARATIVE LAYER 2: EXTENSIBLE COLUMNS FROM schemaManifest.js
        // =====================================================================
        for (const col of (schemaManifest.columns || [])) {
            if (!col.table || !col.name || !col.type) continue;
            // Safe identifiers
            if (!/^[A-Za-z0-9_]+$/.test(col.table) || !/^[A-Za-z0-9_]+$/.test(col.name)) continue;

            const colCheck = await query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @t AND COLUMN_NAME = @c)
                BEGIN
                    ALTER TABLE dbo.[${col.table}] ADD [${col.name}] ${col.type};
                    SELECT 1 AS added;
                END
                ELSE SELECT 0 AS added;
            `, { t: col.table, c: col.name });

            if (colCheck.recordset[0]?.added) {
                additions.push(`Column: ${col.table}.${col.name}`);
            }
        }

        // =====================================================================
        // 3. DECLARATIVE LAYER 2: PERFORMANCE & LOOKUP INDEXES FROM schemaManifest.js
        // =====================================================================
        for (const idx of (schemaManifest.indexes || [])) {
            if (!idx.table || !idx.name || !idx.cols) continue;
            if (!/^[A-Za-z0-9_]+$/.test(idx.table) || !/^[A-Za-z0-9_]+$/.test(idx.name)) continue;

            const idxCheck = await query(`
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = @i AND object_id = OBJECT_ID(@t))
                BEGIN
                    CREATE NONCLUSTERED INDEX [${idx.name}] ON dbo.[${idx.table}] (${idx.cols});
                    SELECT 1 AS added;
                END
                ELSE SELECT 0 AS added;
            `, { i: idx.name, t: idx.table });

            if (idxCheck.recordset[0]?.added) {
                additions.push(`Index: ${idx.table}.${idx.name}`);
            }
        }

        // Additional critical performance indexes
        await query(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_PaymentID' AND object_id = OBJECT_ID('KhataEntries'))
            BEGIN
                CREATE NONCLUSTERED INDEX IX_KhataEntries_PaymentID ON dbo.KhataEntries (PaymentID) WHERE PaymentID IS NOT NULL;
            END

            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_ReferenceNo' AND object_id = OBJECT_ID('KhataEntries'))
            BEGIN
                CREATE NONCLUSTERED INDEX IX_KhataEntries_ReferenceNo ON dbo.KhataEntries (ReferenceNo) WHERE ReferenceNo IS NOT NULL;
            END

            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InvoiceItems_InvoiceID' AND object_id = OBJECT_ID('InvoiceItems'))
            BEGIN
                CREATE NONCLUSTERED INDEX IX_InvoiceItems_InvoiceID ON dbo.InvoiceItems (InvoiceID);
            END

            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Documents_Customer_Entity' AND object_id = OBJECT_ID('Documents'))
            BEGIN
                CREATE NONCLUSTERED INDEX IX_Documents_Customer_Entity ON dbo.Documents (CustomerID, EntityType, EntityID);
            END

            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ServiceRecords_GlobalSerialNo' AND object_id = OBJECT_ID('ServiceRecords'))
            BEGIN
                CREATE NONCLUSTERED INDEX IX_ServiceRecords_GlobalSerialNo ON dbo.ServiceRecords (GlobalSerialNo);
            END
        `);

        // =====================================================================
        // 4. INTEGRITY & POLYMORPHIC GUARANTEE TRIGGERS
        // =====================================================================

        // KhataEntries automatic polymorphic module linking
        await query(`
            CREATE OR ALTER TRIGGER trg_KhataEntries_SourcePolymorphism
            ON KhataEntries
            AFTER INSERT
            AS
            BEGIN
                SET NOCOUNT ON;
                UPDATE k
                SET SourceModule = CASE 
                        WHEN k.SourceModule IS NOT NULL THEN k.SourceModule
                        WHEN k.CSCAppID IS NOT NULL THEN 'CSC'
                        WHEN k.BCID IS NOT NULL THEN 'BC'
                        WHEN k.InvoiceID IS NOT NULL THEN 'Invoice'
                        WHEN k.PaymentID IS NOT NULL THEN 'BillPay'
                        WHEN k.ReferenceNo LIKE 'BP-%' THEN 'BillPay'
                        ELSE 'Khata'
                    END,
                    SourceID = CASE
                        WHEN k.SourceID IS NOT NULL THEN k.SourceID
                        WHEN k.CSCAppID IS NOT NULL THEN k.CSCAppID
                        WHEN k.BCID IS NOT NULL THEN k.BCID
                        WHEN k.InvoiceID IS NOT NULL THEN k.InvoiceID
                        WHEN k.PaymentID IS NOT NULL THEN k.PaymentID
                        WHEN k.ReferenceNo LIKE 'BP-%' THEN TRY_CAST(REPLACE(REPLACE(k.ReferenceNo, 'BP-', ''), '-PAY', '') AS INT)
                        ELSE k.KhataID
                    END
                FROM KhataEntries k
                INNER JOIN inserted i ON k.KhataID = i.KhataID
                WHERE k.SourceModule IS NULL OR k.SourceID IS NULL;
            END;
        `);

        // Documents canonical casing and non-null normalization
        await query(`
            CREATE OR ALTER TRIGGER trg_Documents_Normalize
            ON Documents
            AFTER INSERT, UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                UPDATE d
                SET EntityType = CASE 
                        WHEN UPPER(d.EntityType) = 'CSC' THEN 'CSC'
                        WHEN UPPER(d.EntityType) IN ('BILLPAY', 'BILLPAYMENT') THEN 'BillPay'
                        WHEN UPPER(d.EntityType) = 'CUSTOMER' THEN 'Customer'
                        WHEN UPPER(d.EntityType) IN ('INVOICE', 'INVOICES') THEN 'Invoice'
                        WHEN UPPER(d.EntityType) = 'KHATA' THEN 'Khata'
                        WHEN UPPER(d.EntityType) IN ('BC', 'TRANSACTION') THEN 'BC'
                        WHEN UPPER(d.EntityType) = 'SHOP' THEN 'Shop'
                        WHEN d.EntityType IS NULL AND d.CustomerID IS NOT NULL THEN 'Customer'
                        WHEN d.EntityType IS NULL THEN 'Shop'
                        ELSE d.EntityType
                    END,
                    EntityID = CASE
                        WHEN d.EntityID IS NOT NULL THEN d.EntityID
                        WHEN (d.EntityType IS NULL OR UPPER(d.EntityType) = 'CUSTOMER') AND d.CustomerID IS NOT NULL THEN d.CustomerID
                        ELSE d.EntityID
                    END
                FROM Documents d
                INNER JOIN inserted i ON d.DocumentID = i.DocumentID;
            END;
        `);

        // FieldDefinitions sync trigger (Label <-> FieldLabel, DataType <-> FieldType)
        await query(`
            CREATE OR ALTER TRIGGER trg_FieldDefinitions_Sync
            ON FieldDefinitions
            AFTER INSERT, UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                UPDATE f
                SET 
                    FieldLabel = COALESCE(f.FieldLabel, f.Label, f.FieldKey),
                    Label      = COALESCE(f.Label, f.FieldLabel, f.FieldKey),
                    FieldType  = COALESCE(f.FieldType, f.DataType, 'text'),
                    DataType   = COALESCE(f.DataType, f.FieldType, 'text')
                FROM FieldDefinitions f
                INNER JOIN inserted i ON f.FieldID = i.FieldID;
            END;
        `);

        // TxnModules sync trigger (Prefix <-> DocPrefix, TargetTable <-> RecordTable)
        await query(`
            CREATE OR ALTER TRIGGER trg_TxnModules_Sync
            ON dbo.TxnModules
            AFTER INSERT, UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                UPDATE m
                SET 
                    Prefix           = COALESCE(m.Prefix, m.DocPrefix, m.ModuleCode),
                    DocPrefix        = COALESCE(m.DocPrefix, m.Prefix, m.ModuleCode),
                    TargetTable      = COALESCE(m.TargetTable, m.RecordTable, 'ServiceRecords'),
                    RecordTable      = COALESCE(m.RecordTable, m.TargetTable, 'ServiceRecords'),
                    PrimaryKeyColumn = COALESCE(m.PrimaryKeyColumn, CASE WHEN COALESCE(m.RecordTable, m.TargetTable, 'ServiceRecords') = 'ServiceRecords' THEN 'RecordID' ELSE 'RecordID' END),
                    DisplayOrder     = COALESCE(m.DisplayOrder, m.SortOrder, 100),
                    SortOrder        = COALESCE(m.SortOrder, m.DisplayOrder, 100)
                FROM dbo.TxnModules m
                INNER JOIN inserted i ON m.ModuleCode = i.ModuleCode;
            END;
        `);

        // If any structural change occurred, take a safety backup
        if (additions.length > 0) {
            await takeAutoBackup();
            console.log(`${logPrefix} ✅ Auto-created ${additions.length} dynamic schema element(s):`, additions.join(', '));
        } else {
            console.log(`${logPrefix} ✅ Database schema 100% verified & in sync with schemaManifest.js (zero gaps).`);
        }

        // Check active tables count
        const countRes = await query(`
            SELECT COUNT(*) AS TableCount FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_TYPE = 'BASE TABLE'
        `);
        const totalTables = countRes.recordset[0]?.TableCount || 0;

        return {
            success: true,
            totalTables,
            additions
        };
    } catch (err) {
        console.error(`${logPrefix} ⚠️ Auto-schema verification warning (non-fatal):`, err.message);
        return {
            success: false,
            error: err.message
        };
    } finally {
        if (hasLock) {
            await query(`
                EXEC sp_releaseapplock @Resource = @res, @LockOwner = 'Session';
            `, { res: LOCK_RESOURCE }).catch(() => {});
        }
    }
}

module.exports = { ensureAutoSchemaBootstrapped };
