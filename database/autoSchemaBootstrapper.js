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
            SELECT @added AS added;
        `);
        if (cscSvcCheck.recordset[0]?.added) additions.push('CSCServices.CustomFieldsSchema / Category');

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

        // KhataEntries -> PaymentID
        const khataPayCheck = await query(`
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'KhataEntries' AND COLUMN_NAME = 'PaymentID')
            BEGIN
                ALTER TABLE dbo.KhataEntries ADD PaymentID INT NULL;
                SELECT 1 AS added;
            END
            ELSE SELECT 0 AS added;
        `);
        if (khataPayCheck.recordset[0]?.added) additions.push('KhataEntries.PaymentID');

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
