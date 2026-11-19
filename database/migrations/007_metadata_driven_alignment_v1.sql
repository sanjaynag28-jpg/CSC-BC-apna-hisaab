-- ===========================================================================
-- 007_metadata_driven_alignment_v1
-- ---------------------------------------------------------------------------
-- Complete alignment for metadata-driven dynamic architecture:
--   1. TxnModules: Add DocPrefix, RecordTable, IsLedgerLinked, Icon, Color, SortOrder, UserID
--   2. CSCServices: Add IX_CSCServices_Module index
--   3. FieldDefinitions: Add ModuleCode, Label, DataType, OptionsJson, MaxLength, ShowInList, SortOrder
--   4. ServiceRecords: Add CustomerName, CustomerPhone, ReferenceNo, AccountID, CashAccountID,
--                      Amount, Charge, TotalAmount, DueAmount, DocCode, IsDeleted
--                      and performance indexes.
--
-- 100% NON-DESTRUCTIVE: Sirf ADD/INDEX/UPDATE. Zero DROP.
-- Idempotent: Can be run multiple times safely.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. TxnModules Alignment
-- ---------------------------------------------------------------------------
IF COL_LENGTH('dbo.TxnModules', 'DocPrefix') IS NULL
    ALTER TABLE dbo.TxnModules ADD DocPrefix VARCHAR(10) NULL;

IF COL_LENGTH('dbo.TxnModules', 'RecordTable') IS NULL
    ALTER TABLE dbo.TxnModules ADD RecordTable NVARCHAR(128) NULL;

IF COL_LENGTH('dbo.TxnModules', 'IsLedgerLinked') IS NULL
    ALTER TABLE dbo.TxnModules ADD IsLedgerLinked BIT NOT NULL CONSTRAINT DF_TxnModules_IsLedgerLinked DEFAULT ((1));

IF COL_LENGTH('dbo.TxnModules', 'Icon') IS NULL
    ALTER TABLE dbo.TxnModules ADD Icon NVARCHAR(50) NULL;

IF COL_LENGTH('dbo.TxnModules', 'Color') IS NULL
    ALTER TABLE dbo.TxnModules ADD Color NVARCHAR(20) NULL;

IF COL_LENGTH('dbo.TxnModules', 'SortOrder') IS NULL
    ALTER TABLE dbo.TxnModules ADD SortOrder INT NOT NULL CONSTRAINT DF_TxnModules_SortOrder DEFAULT ((0));

IF COL_LENGTH('dbo.TxnModules', 'UserID') IS NULL
    ALTER TABLE dbo.TxnModules ADD UserID INT NOT NULL CONSTRAINT DF_TxnModules_UserID DEFAULT ((1));
GO

UPDATE dbo.TxnModules SET DocPrefix = Prefix WHERE DocPrefix IS NULL;
UPDATE dbo.TxnModules SET RecordTable = TargetTable WHERE RecordTable IS NULL;
UPDATE dbo.TxnModules SET SortOrder = DisplayOrder WHERE SortOrder = 0 AND DisplayOrder > 0;
GO

-- ---------------------------------------------------------------------------
-- 2. CSCServices Index
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CSCServices_Module' AND object_id = OBJECT_ID('dbo.CSCServices'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_CSCServices_Module ON dbo.CSCServices (ModuleCode, IsActive, SortOrder);
END
GO

-- ---------------------------------------------------------------------------
-- 3. FieldDefinitions Alignment
-- ---------------------------------------------------------------------------
IF COL_LENGTH('dbo.FieldDefinitions', 'ModuleCode') IS NULL
    ALTER TABLE dbo.FieldDefinitions ADD ModuleCode VARCHAR(20) NULL;

IF COL_LENGTH('dbo.FieldDefinitions', 'Label') IS NULL
    ALTER TABLE dbo.FieldDefinitions ADD Label NVARCHAR(100) NULL;

IF COL_LENGTH('dbo.FieldDefinitions', 'DataType') IS NULL
    ALTER TABLE dbo.FieldDefinitions ADD DataType VARCHAR(20) NOT NULL CONSTRAINT DF_FieldDefs_DataType DEFAULT ('text');

IF COL_LENGTH('dbo.FieldDefinitions', 'OptionsJson') IS NULL
    ALTER TABLE dbo.FieldDefinitions ADD OptionsJson NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.FieldDefinitions', 'MaxLength') IS NULL
    ALTER TABLE dbo.FieldDefinitions ADD MaxLength INT NULL;

IF COL_LENGTH('dbo.FieldDefinitions', 'ShowInList') IS NULL
    ALTER TABLE dbo.FieldDefinitions ADD ShowInList BIT NOT NULL CONSTRAINT DF_FieldDefs_ShowInList DEFAULT ((0));

IF COL_LENGTH('dbo.FieldDefinitions', 'SortOrder') IS NULL
    ALTER TABLE dbo.FieldDefinitions ADD SortOrder INT NOT NULL CONSTRAINT DF_FieldDefs_SortOrder DEFAULT ((0));
GO

-- Make ServiceID nullable in FieldDefinitions so module-level fields can exist without specific service
ALTER TABLE dbo.FieldDefinitions ALTER COLUMN ServiceID INT NULL;
GO

UPDATE dbo.FieldDefinitions SET Label = FieldLabel WHERE Label IS NULL;
UPDATE dbo.FieldDefinitions SET DataType = FieldType WHERE DataType IS NULL;
UPDATE dbo.FieldDefinitions SET OptionsJson = FieldOptionsJson WHERE OptionsJson IS NULL;
UPDATE dbo.FieldDefinitions SET SortOrder = DisplayOrder WHERE SortOrder = 0 AND DisplayOrder > 0;
GO

-- ---------------------------------------------------------------------------
-- 4. ServiceRecords Alignment
-- ---------------------------------------------------------------------------
-- Make ServiceID and CustomerID nullable in ServiceRecords for generic/counter transactions
ALTER TABLE dbo.ServiceRecords ALTER COLUMN ServiceID INT NULL;
ALTER TABLE dbo.ServiceRecords ALTER COLUMN CustomerID INT NULL;
GO

IF COL_LENGTH('dbo.ServiceRecords', 'CustomerName') IS NULL
    ALTER TABLE dbo.ServiceRecords ADD CustomerName NVARCHAR(150) NULL;

IF COL_LENGTH('dbo.ServiceRecords', 'CustomerPhone') IS NULL
    ALTER TABLE dbo.ServiceRecords ADD CustomerPhone NVARCHAR(20) NULL;

IF COL_LENGTH('dbo.ServiceRecords', 'ReferenceNo') IS NULL
    ALTER TABLE dbo.ServiceRecords ADD ReferenceNo NVARCHAR(100) NULL;

IF COL_LENGTH('dbo.ServiceRecords', 'AccountID') IS NULL
    ALTER TABLE dbo.ServiceRecords ADD AccountID INT NULL;

IF COL_LENGTH('dbo.ServiceRecords', 'CashAccountID') IS NULL
    ALTER TABLE dbo.ServiceRecords ADD CashAccountID INT NULL;

IF COL_LENGTH('dbo.ServiceRecords', 'Amount') IS NULL
    ALTER TABLE dbo.ServiceRecords ADD Amount DECIMAL(18,2) NOT NULL CONSTRAINT DF_ServiceRecords_Amount DEFAULT ((0.00));

IF COL_LENGTH('dbo.ServiceRecords', 'Charge') IS NULL
    ALTER TABLE dbo.ServiceRecords ADD Charge DECIMAL(18,2) NOT NULL CONSTRAINT DF_ServiceRecords_Charge DEFAULT ((0.00));

IF COL_LENGTH('dbo.ServiceRecords', 'TotalAmount') IS NULL
    ALTER TABLE dbo.ServiceRecords ADD TotalAmount DECIMAL(18,2) NOT NULL CONSTRAINT DF_ServiceRecords_TotalAmount DEFAULT ((0.00));

IF COL_LENGTH('dbo.ServiceRecords', 'DueAmount') IS NULL
    ALTER TABLE dbo.ServiceRecords ADD DueAmount DECIMAL(18,2) NOT NULL CONSTRAINT DF_ServiceRecords_DueAmount DEFAULT ((0.00));

IF COL_LENGTH('dbo.ServiceRecords', 'DocCode') IS NULL
    ALTER TABLE dbo.ServiceRecords ADD DocCode VARCHAR(30) NULL;

IF COL_LENGTH('dbo.ServiceRecords', 'IsDeleted') IS NULL
    ALTER TABLE dbo.ServiceRecords ADD IsDeleted BIT NOT NULL CONSTRAINT DF_ServiceRecords_IsDeleted DEFAULT ((0));
GO

UPDATE dbo.ServiceRecords SET Amount = GovtFee WHERE Amount = 0 AND GovtFee > 0;
UPDATE dbo.ServiceRecords SET Charge = OperatorFee WHERE Charge = 0 AND OperatorFee > 0;
UPDATE dbo.ServiceRecords SET TotalAmount = TotalFee WHERE TotalAmount = 0 AND TotalFee > 0;
UPDATE dbo.ServiceRecords SET DueAmount = BalanceAmount WHERE DueAmount = 0 AND BalanceAmount > 0;
UPDATE dbo.ServiceRecords SET DocCode = ModuleCodeSerial WHERE DocCode IS NULL;
GO

-- ---------------------------------------------------------------------------
-- 5. Performance Indexes on ServiceRecords
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SR_Module_Date' AND object_id = OBJECT_ID('dbo.ServiceRecords'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_SR_Module_Date ON dbo.ServiceRecords (ModuleCode, RecordDate DESC);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SR_Customer_Date' AND object_id = OBJECT_ID('dbo.ServiceRecords'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_SR_Customer_Date ON dbo.ServiceRecords (CustomerID, RecordDate DESC);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SR_Ref' AND object_id = OBJECT_ID('dbo.ServiceRecords'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_SR_Ref ON dbo.ServiceRecords (ReferenceNo);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_SR_Doc' AND object_id = OBJECT_ID('dbo.ServiceRecords'))
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX UQ_SR_Doc ON dbo.ServiceRecords (ModuleCode, DocCode) WHERE DocCode IS NOT NULL;
END
GO
