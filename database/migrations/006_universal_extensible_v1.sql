-- ===========================================================================
-- 006_universal_extensible_v1
-- ---------------------------------------------------------------------------
-- Metadata-driven, future-proof module architecture.
--
-- Naya service/module add karne ke liye aage koi DDL nahi chahiye:
--   - naya module  -> 1 row in TxnModules
--   - naya service -> 1 row in CSCServices
--   - naya field   -> 1 row in FieldDefinitions
--   - naya record  -> ServiceRecords (ledger + khata + SN auto via recordEngine)
--
-- 100% NON-DESTRUCTIVE: sirf CREATE / ADD / INDEX. Koi DROP/TRUNCATE nahi.
-- Idempotent: jitni baar chalao, same result.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Existing table columns (guarded)
-- ---------------------------------------------------------------------------
IF COL_LENGTH('dbo.BillPayments', 'IsActive') IS NULL
    ALTER TABLE dbo.BillPayments ADD IsActive BIT NOT NULL CONSTRAINT DF_BillPayments_IsActive DEFAULT ((1));

IF COL_LENGTH('dbo.CSCServices', 'ModuleCode') IS NULL
    ALTER TABLE dbo.CSCServices ADD ModuleCode VARCHAR(30) NULL CONSTRAINT DF_CSCServices_ModuleCode DEFAULT ('CSC');

IF COL_LENGTH('dbo.CSCServices', 'CustomFieldsSchema') IS NULL
    ALTER TABLE dbo.CSCServices ADD CustomFieldsSchema NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.CSCServices', 'Category') IS NULL
    ALTER TABLE dbo.CSCServices ADD Category NVARCHAR(100) NULL CONSTRAINT DF_CSCServices_Category DEFAULT ('General');

IF COL_LENGTH('dbo.KhataEntries', 'PaymentID') IS NULL
    ALTER TABLE dbo.KhataEntries ADD PaymentID INT NULL;

IF COL_LENGTH('dbo.KhataEntries', 'SourceModule') IS NULL
    ALTER TABLE dbo.KhataEntries ADD SourceModule VARCHAR(30) NULL;

IF COL_LENGTH('dbo.KhataEntries', 'SourceID') IS NULL
    ALTER TABLE dbo.KhataEntries ADD SourceID INT NULL;

IF COL_LENGTH('dbo.Transactions', 'SourceModule') IS NULL
    ALTER TABLE dbo.Transactions ADD SourceModule VARCHAR(30) NULL;

IF COL_LENGTH('dbo.Transactions', 'SourceID') IS NULL
    ALTER TABLE dbo.Transactions ADD SourceID INT NULL;

IF COL_LENGTH('dbo.Transactions', 'LineType') IS NULL
    ALTER TABLE dbo.Transactions ADD LineType VARCHAR(30) NULL;
GO

-- Purane service rows ko canonical module/category do (data safe: sirf NULL fill)
UPDATE dbo.CSCServices SET ModuleCode = 'CSC' WHERE ModuleCode IS NULL;
UPDATE dbo.CSCServices SET Category = 'General' WHERE Category IS NULL;
GO

-- ---------------------------------------------------------------------------
-- 2. TxnModules — module catalog (code ki jagah data)
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'TxnModules')
BEGIN
    CREATE TABLE dbo.TxnModules (
        ModuleID INT IDENTITY(1,1) NOT NULL,
        ModuleCode VARCHAR(30) NOT NULL,
        ModuleName NVARCHAR(100) NOT NULL,
        Prefix VARCHAR(10) NOT NULL,
        TargetTable VARCHAR(50) NULL,
        PrimaryKeyColumn VARCHAR(50) NULL,
        IsCore BIT NOT NULL DEFAULT (1),
        IsActive BIT NOT NULL DEFAULT (1),
        DisplayOrder INT NOT NULL DEFAULT (0),
        CreatedAt DATETIME NOT NULL DEFAULT (GETDATE()),
        UpdatedAt DATETIME NOT NULL DEFAULT (GETDATE()),
        CONSTRAINT PK_TxnModules PRIMARY KEY CLUSTERED (ModuleID),
        CONSTRAINT UQ_TxnModules_ModuleCode UNIQUE (ModuleCode)
    );
END
GO

-- Seed idempotent (row by row)
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
GO

-- ---------------------------------------------------------------------------
-- 3. FieldDefinitions — dynamic form fields (naya field = 1 row)
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'FieldDefinitions')
BEGIN
    CREATE TABLE dbo.FieldDefinitions (
        FieldID INT IDENTITY(1,1) NOT NULL,
        ServiceID INT NOT NULL,
        FieldKey VARCHAR(50) NOT NULL,
        FieldLabel NVARCHAR(100) NOT NULL,
        FieldType VARCHAR(30) NOT NULL DEFAULT ('text'),
        FieldOptionsJson NVARCHAR(MAX) NULL,
        DefaultValue NVARCHAR(255) NULL,
        Placeholder NVARCHAR(255) NULL,
        IsRequired BIT NOT NULL DEFAULT (0),
        DisplayOrder INT NOT NULL DEFAULT (0),
        IsActive BIT NOT NULL DEFAULT (1),
        CreatedAt DATETIME NOT NULL DEFAULT (GETDATE()),
        UpdatedAt DATETIME NOT NULL DEFAULT (GETDATE()),
        CONSTRAINT PK_FieldDefinitions PRIMARY KEY CLUSTERED (FieldID),
        CONSTRAINT FK_FieldDefinitions_Services FOREIGN KEY (ServiceID) REFERENCES dbo.CSCServices (ServiceID),
        CONSTRAINT UQ_FieldDefinitions_Service_Key UNIQUE (ServiceID, FieldKey)
    );
END
GO

-- ---------------------------------------------------------------------------
-- 4. ServiceRecords — universal storage for naye modules
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ServiceRecords')
BEGIN
    CREATE TABLE dbo.ServiceRecords (
        RecordID INT IDENTITY(1,1) NOT NULL,
        ModuleCode VARCHAR(30) NOT NULL DEFAULT ('Service'),
        ServiceID INT NOT NULL,
        CustomerID INT NOT NULL,
        UserID INT NOT NULL DEFAULT (1),

        GovtFee DECIMAL(18,2) NOT NULL DEFAULT (0.00),
        OperatorFee DECIMAL(18,2) NOT NULL DEFAULT (0.00),
        TotalFee DECIMAL(18,2) NOT NULL DEFAULT (0.00),
        PaidAmount DECIMAL(18,2) NOT NULL DEFAULT (0.00),
        BalanceAmount DECIMAL(18,2) NOT NULL DEFAULT (0.00),

        RecordDate DATE NOT NULL DEFAULT (CAST(GETDATE() AS DATE)),
        CompletionDate DATE NULL,

        Status NVARCHAR(50) NOT NULL DEFAULT ('Pending'),
        PaymentStatus NVARCHAR(30) NOT NULL DEFAULT ('Unpaid'),
        PaymentMode NVARCHAR(50) NOT NULL DEFAULT ('Cash'),
        Remarks NVARCHAR(500) NULL,

        ExtraFieldsJson NVARCHAR(MAX) NULL,

        GlobalSerialNo INT NULL,
        SNCode VARCHAR(30) NULL,
        ModuleCodeSerial VARCHAR(30) NULL,

        IsActive BIT NOT NULL DEFAULT (1),
        CreatedAt DATETIME NOT NULL DEFAULT (GETDATE()),
        UpdatedAt DATETIME NOT NULL DEFAULT (GETDATE()),

        CONSTRAINT PK_ServiceRecords PRIMARY KEY CLUSTERED (RecordID),
        CONSTRAINT FK_ServiceRecords_Services FOREIGN KEY (ServiceID) REFERENCES dbo.CSCServices (ServiceID),
        CONSTRAINT FK_ServiceRecords_Customers FOREIGN KEY (CustomerID) REFERENCES dbo.Customers (CustomerID),
        CONSTRAINT FK_ServiceRecords_Users FOREIGN KEY (UserID) REFERENCES dbo.Users (UserID),
        CONSTRAINT CK_ServiceRecords_NonNegative
            CHECK (GovtFee >= 0 AND OperatorFee >= 0 AND TotalFee >= 0 AND PaidAmount >= 0 AND BalanceAmount >= 0)
    );
END
GO

-- CHECK constraint (agar bootstrapper ne table banaya ho aur yeh missing ho)
IF OBJECT_ID('dbo.ServiceRecords', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.check_constraints
                   WHERE name = 'CK_ServiceRecords_NonNegative'
                     AND parent_object_id = OBJECT_ID('dbo.ServiceRecords'))
BEGIN
    ALTER TABLE dbo.ServiceRecords WITH CHECK
        ADD CONSTRAINT CK_ServiceRecords_NonNegative
        CHECK (GovtFee >= 0 AND OperatorFee >= 0 AND TotalFee >= 0 AND PaidAmount >= 0 AND BalanceAmount >= 0);
END
GO

-- ---------------------------------------------------------------------------
-- 5. Performance indexes (idempotent)
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_PaymentID' AND object_id = OBJECT_ID('dbo.KhataEntries'))
    CREATE NONCLUSTERED INDEX IX_KhataEntries_PaymentID ON dbo.KhataEntries (PaymentID) WHERE PaymentID IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_ReferenceNo' AND object_id = OBJECT_ID('dbo.KhataEntries'))
    CREATE NONCLUSTERED INDEX IX_KhataEntries_ReferenceNo ON dbo.KhataEntries (ReferenceNo) WHERE ReferenceNo IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_SourceModule_SourceID' AND object_id = OBJECT_ID('dbo.KhataEntries'))
    CREATE NONCLUSTERED INDEX IX_KhataEntries_SourceModule_SourceID ON dbo.KhataEntries (SourceModule, SourceID);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Transactions_SourceModule_SourceID' AND object_id = OBJECT_ID('dbo.Transactions'))
    CREATE NONCLUSTERED INDEX IX_Transactions_SourceModule_SourceID ON dbo.Transactions (SourceModule, SourceID, LineType) WHERE SourceModule IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ServiceRecords_Module_Customer' AND object_id = OBJECT_ID('dbo.ServiceRecords'))
    CREATE NONCLUSTERED INDEX IX_ServiceRecords_Module_Customer ON dbo.ServiceRecords (ModuleCode, CustomerID, RecordDate);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ServiceRecords_GlobalSerialNo' AND object_id = OBJECT_ID('dbo.ServiceRecords'))
    CREATE NONCLUSTERED INDEX IX_ServiceRecords_GlobalSerialNo ON dbo.ServiceRecords (GlobalSerialNo);
GO
