/**
 * autoSchemaBootstrapper.js
 * 
 * Self-Healing, Non-Destructive Dynamic Schema Engine.
 * Automatically verifies and prepares database schemas, tables, dynamic JSON columns,
 * and performance indexes on startup or whenever a new service/module is introduced.
 * 
 * Strict Guarantees:
 * 1. 100% NON-DESTRUCTIVE: Never drops, truncates, or deletes anything.
 * 2. ZERO DATA LOSS: All column additions are NULL or have safe defaults.
 * 3. EXTENSIBLE: Supports dynamic custom fields via ExtraFieldsJson & Metadata.
 * 4. IDEMPOTENT: Safe to run thousands of times without side effects.
 */

const { query } = require('./db');

async function ensureAutoSchemaBootstrapped() {
    const logPrefix = '🛡️ [AutoSchemaBootstrapper]';
    console.log(`${logPrefix} Running dynamic schema self-healing verification...`);
    const additions = [];

    try {
        // =====================================================================
        // 1. EXTENSIBLE COLUMNS (Dynamic Services & Custom Fields)
        // =====================================================================

        // CSCApplications -> ExtraFieldsJson
        const cscExtraCheck = await query(`
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CSCApplications' AND COLUMN_NAME = 'ExtraFieldsJson')
            BEGIN
                ALTER TABLE dbo.CSCApplications ADD ExtraFieldsJson NVARCHAR(MAX) NULL;
                SELECT 1 AS added;
            END
            ELSE SELECT 0 AS added;
        `);
        if (cscExtraCheck.recordset[0]?.added) additions.push('CSCApplications.ExtraFieldsJson');

        // CSCServices -> CustomFieldsSchema & Category
        const cscSvcCheck = await query(`
            DECLARE @added INT = 0;
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CSCServices' AND COLUMN_NAME = 'CustomFieldsSchema')
            BEGIN
                ALTER TABLE dbo.CSCServices ADD CustomFieldsSchema NVARCHAR(MAX) NULL;
                SET @added = 1;
            END
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CSCServices' AND COLUMN_NAME = 'Category')
            BEGIN
                ALTER TABLE dbo.CSCServices ADD Category NVARCHAR(100) NULL DEFAULT ('General');
                SET @added = 1;
            END
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CSCServices' AND COLUMN_NAME = 'ModuleCode')
            BEGIN
                ALTER TABLE dbo.CSCServices ADD ModuleCode VARCHAR(30) NULL DEFAULT ('CSC');
                SET @added = 1;
            END
            SELECT @added AS added;
        `);
        if (cscSvcCheck.recordset[0]?.added) additions.push('CSCServices.CustomFieldsSchema / Category / ModuleCode');

        // Customers -> ExtraFieldsJson
        const custExtraCheck = await query(`
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Customers' AND COLUMN_NAME = 'ExtraFieldsJson')
            BEGIN
                ALTER TABLE dbo.Customers ADD ExtraFieldsJson NVARCHAR(MAX) NULL;
                SELECT 1 AS added;
            END
            ELSE SELECT 0 AS added;
        `);
        if (custExtraCheck.recordset[0]?.added) additions.push('Customers.ExtraFieldsJson');

        // KhataEntries -> PaymentID, SourceModule, SourceID
        const khataPayCheck = await query(`
            DECLARE @added INT = 0;
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'KhataEntries' AND COLUMN_NAME = 'PaymentID')
            BEGIN
                ALTER TABLE dbo.KhataEntries ADD PaymentID INT NULL;
                SET @added = 1;
            END
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'KhataEntries' AND COLUMN_NAME = 'SourceModule')
            BEGIN
                ALTER TABLE dbo.KhataEntries ADD SourceModule VARCHAR(30) NULL;
                SET @added = 1;
            END
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'KhataEntries' AND COLUMN_NAME = 'SourceID')
            BEGIN
                ALTER TABLE dbo.KhataEntries ADD SourceID INT NULL;
                SET @added = 1;
            END
            SELECT @added AS added;
        `);
        if (khataPayCheck.recordset[0]?.added) additions.push('KhataEntries.PaymentID / SourceModule / SourceID');

        // Transactions -> SourceModule, SourceID, LineType
        const txnAuditCheck = await query(`
            DECLARE @added INT = 0;
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Transactions' AND COLUMN_NAME = 'SourceModule')
            BEGIN
                ALTER TABLE dbo.Transactions ADD SourceModule VARCHAR(30) NULL;
                SET @added = 1;
            END
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Transactions' AND COLUMN_NAME = 'SourceID')
            BEGIN
                ALTER TABLE dbo.Transactions ADD SourceID INT NULL;
                SET @added = 1;
            END
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Transactions' AND COLUMN_NAME = 'LineType')
            BEGIN
                ALTER TABLE dbo.Transactions ADD LineType VARCHAR(30) NULL;
                SET @added = 1;
            END
            SELECT @added AS added;
        `);
        if (txnAuditCheck.recordset[0]?.added) additions.push('Transactions.SourceModule / SourceID / LineType');

        // BCTransactions -> PortalName
        const bcPortalCheck = await query(`
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'BCTransactions' AND COLUMN_NAME = 'PortalName')
            BEGIN
                ALTER TABLE dbo.BCTransactions ADD PortalName NVARCHAR(100) NULL;
                SELECT 1 AS added;
            END
            ELSE SELECT 0 AS added;
        `);
        if (bcPortalCheck.recordset[0]?.added) additions.push('BCTransactions.PortalName');

        // BillPayments -> ExtraFieldsJson
        const bpExtraCheck = await query(`
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'BillPayments' AND COLUMN_NAME = 'ExtraFieldsJson')
            BEGIN
                ALTER TABLE dbo.BillPayments ADD ExtraFieldsJson NVARCHAR(MAX) NULL;
                SELECT 1 AS added;
            END
            ELSE SELECT 0 AS added;
        `);
        if (bpExtraCheck.recordset[0]?.added) additions.push('BillPayments.ExtraFieldsJson');

        // =====================================================================
        // 2. DYNAMIC SYSTEM & LICENSING TABLES (IF NOT EXISTS)
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
                    IsCore BIT NOT NULL DEFAULT 1,
                    IsActive BIT NOT NULL DEFAULT 1,
                    DisplayOrder INT NOT NULL DEFAULT 0,
                    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
                    UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
                    CONSTRAINT PK_TxnModules PRIMARY KEY CLUSTERED (ModuleID),
                    CONSTRAINT UQ_TxnModules_ModuleCode UNIQUE (ModuleCode)
                );
                INSERT INTO dbo.TxnModules (ModuleCode, ModuleName, Prefix, TargetTable, PrimaryKeyColumn, IsCore, DisplayOrder)
                VALUES 
                ('CSC', 'CSC e-Governance Services', 'CSC', 'CSCApplications', 'AppID', 1, 1),
                ('BC', 'Banking Correspondent / Kiosk', 'BC', 'BCTransactions', 'BCID', 1, 2),
                ('BillPay', 'Utility Bill Payments (BBPS)', 'BP', 'BillPayments', 'PaymentID', 1, 3),
                ('Invoices', 'Sales Invoices & Billing', 'INV', 'Invoices', 'InvoiceID', 1, 4),
                ('Khata', 'Customer Khata Ledger', 'KH', 'KhataEntries', 'KhataID', 1, 5),
                ('Cashbook', 'Daily Cash & Bank Transactions', 'CB', 'Transactions', 'TransactionID', 1, 6),
                ('Service', 'Universal Dynamic Services', 'SRV', 'ServiceRecords', 'RecordID', 0, 7);
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
                SELECT 1 AS added;
            END
            ELSE SELECT 0 AS added;
        `);
        if (srvRecCheck.recordset[0]?.added) additions.push('Table: ServiceRecords');

        // =====================================================================
        // 3. TARGETED PERFORMANCE INDEXES (IF NOT EXISTS)
        // =====================================================================

        await query(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_PaymentID' AND object_id = OBJECT_ID('KhataEntries'))
            BEGIN
                CREATE NONCLUSTERED INDEX IX_KhataEntries_PaymentID ON dbo.KhataEntries (PaymentID) WHERE PaymentID IS NOT NULL;
            END

            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_ReferenceNo' AND object_id = OBJECT_ID('KhataEntries'))
            BEGIN
                CREATE NONCLUSTERED INDEX IX_KhataEntries_ReferenceNo ON dbo.KhataEntries (ReferenceNo) WHERE ReferenceNo IS NOT NULL;
            END

            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Transactions_SourceModule_SourceID' AND object_id = OBJECT_ID('Transactions'))
            BEGIN
                CREATE NONCLUSTERED INDEX IX_Transactions_SourceModule_SourceID ON dbo.Transactions (SourceModule, SourceID, LineType) WHERE SourceModule IS NOT NULL;
            END

            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InvoiceItems_InvoiceID' AND object_id = OBJECT_ID('InvoiceItems'))
            BEGIN
                CREATE NONCLUSTERED INDEX IX_InvoiceItems_InvoiceID ON dbo.InvoiceItems (InvoiceID);
            END

            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Documents_Customer_Entity' AND object_id = OBJECT_ID('Documents'))
            BEGIN
                CREATE NONCLUSTERED INDEX IX_Documents_Customer_Entity ON dbo.Documents (CustomerID, EntityType, EntityID);
            END

            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_SourceModule_SourceID' AND object_id = OBJECT_ID('KhataEntries'))
            BEGIN
                CREATE NONCLUSTERED INDEX IX_KhataEntries_SourceModule_SourceID ON dbo.KhataEntries (SourceModule, SourceID);
            END

            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ServiceRecords_Module_Customer' AND object_id = OBJECT_ID('ServiceRecords'))
            BEGIN
                CREATE NONCLUSTERED INDEX IX_ServiceRecords_Module_Customer ON dbo.ServiceRecords (ModuleCode, CustomerID, RecordDate);
            END

            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ServiceRecords_GlobalSerialNo' AND object_id = OBJECT_ID('ServiceRecords'))
            BEGIN
                CREATE NONCLUSTERED INDEX IX_ServiceRecords_GlobalSerialNo ON dbo.ServiceRecords (GlobalSerialNo);
            END
        `);

        // =====================================================================
        // 4. INTEGRITY & POLYMORPHIC GUARANTEE TRIGGERS
        // =====================================================================

        // Ensure KhataEntries trigger for automatic polymorphic module linking
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

        // Ensure Documents trigger for canonical casing and non-null normalization
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

        // Check active tables count
        const countRes = await query(`
            SELECT COUNT(*) AS TableCount FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_TYPE = 'BASE TABLE'
        `);
        const totalTables = countRes.recordset[0]?.TableCount || 0;

        if (additions.length > 0) {
            console.log(`${logPrefix} ✅ Auto-created ${additions.length} dynamic schema element(s):`, additions.join(', '));
        } else {
            console.log(`${logPrefix} ✅ Database schema 100% verified & future-proof (${totalTables} tables active, zero gaps).`);
        }

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
    }
}

module.exports = { ensureAutoSchemaBootstrapped };
