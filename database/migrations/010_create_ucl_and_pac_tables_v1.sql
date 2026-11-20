-- ============================================================================
-- Migration 010: Create UCLUpdates & PACEntries Tables for Aadhaar UCL Service
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'UCLUpdates')
BEGIN
    CREATE TABLE dbo.UCLUpdates (
        UCLID INT IDENTITY(1,1) PRIMARY KEY,
        UserID INT NOT NULL DEFAULT(1),
        CustomerID INT NULL,
        CustomerName NVARCHAR(150) NOT NULL,
        CustomerPhone NVARCHAR(20) NULL,
        AadhaarLast4 VARCHAR(10) NULL,
        AadhaarMasked VARCHAR(20) NULL,
        SID NVARCHAR(60) NULL,
        UpdateType NVARCHAR(100) NOT NULL DEFAULT('Demographics Update'),
        PACCode NVARCHAR(50) NULL,
        BiometricsUpdate VARCHAR(10) NOT NULL DEFAULT('No'),
        UpdateDate DATETIME NOT NULL DEFAULT(GETDATE()),
        TotalFee DECIMAL(18,2) NOT NULL DEFAULT(50.00),
        OperatorFee DECIMAL(18,2) NOT NULL DEFAULT(0.00),
        TotalAmount DECIMAL(18,2) NOT NULL DEFAULT(50.00),
        PaidAmount DECIMAL(18,2) NOT NULL DEFAULT(50.00),
        BalanceAmount DECIMAL(18,2) NOT NULL DEFAULT(0.00),
        PaymentMode NVARCHAR(50) NOT NULL DEFAULT('Cash'),
        AccountID INT NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT('Generated'),
        ReceiptDocumentID INT NULL,
        ReceiptPath NVARCHAR(500) NULL,
        Notes NVARCHAR(500) NULL,
        Registrar NVARCHAR(100) NULL,
        EnrolmentAgency NVARCHAR(100) NULL,
        LocationId NVARCHAR(100) NULL,
        SerialNo VARCHAR(30) NULL,
        ModuleCode NVARCHAR(30) NULL DEFAULT('UCL'),
        GlobalSerialNo NVARCHAR(50) NULL,
        SNCode NVARCHAR(50) NULL,
        ExtraFieldsJson NVARCHAR(MAX) NULL,
        IsActive BIT NOT NULL DEFAULT(1),
        IsDeleted BIT NOT NULL DEFAULT(0),
        CreatedAt DATETIME NOT NULL DEFAULT(GETDATE()),
        UpdatedAt DATETIME NOT NULL DEFAULT(GETDATE()),
        CONSTRAINT FK_UCLUpdates_Customer FOREIGN KEY (CustomerID) REFERENCES dbo.Customers(CustomerID),
        CONSTRAINT FK_UCLUpdates_User FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID)
    );

    CREATE NONCLUSTERED INDEX IX_UCLUpdates_User_Date ON dbo.UCLUpdates(UserID, UpdateDate DESC);
    CREATE NONCLUSTERED INDEX IX_UCLUpdates_Customer ON dbo.UCLUpdates(CustomerID);
    CREATE NONCLUSTERED INDEX IX_UCLUpdates_SID ON dbo.UCLUpdates(SID);
    CREATE NONCLUSTERED INDEX IX_UCLUpdates_Status ON dbo.UCLUpdates(Status);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PACEntries')
BEGIN
    CREATE TABLE dbo.PACEntries (
        PACID INT IDENTITY(1,1) PRIMARY KEY,
        UserID INT NOT NULL DEFAULT(1),
        PACCode NVARCHAR(50) NOT NULL,
        OperatorID NVARCHAR(100) NULL,
        WalletDeduction DECIMAL(18,2) NOT NULL DEFAULT(50.00),
        GenerationDate DATETIME NOT NULL DEFAULT(GETDATE()),
        ExpiryDate DATETIME NULL,
        Status NVARCHAR(30) NOT NULL DEFAULT('Available'),
        UsedForUCLID INT NULL,
        UsedForCustomerName NVARCHAR(150) NULL,
        UsedForSID NVARCHAR(60) NULL,
        UsedDate DATETIME NULL,
        Notes NVARCHAR(500) NULL,
        IsActive BIT NOT NULL DEFAULT(1),
        IsDeleted BIT NOT NULL DEFAULT(0),
        CreatedAt DATETIME NOT NULL DEFAULT(GETDATE()),
        UpdatedAt DATETIME NOT NULL DEFAULT(GETDATE()),
        CONSTRAINT FK_PACEntries_User FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID)
    );

    CREATE NONCLUSTERED INDEX IX_PACEntries_User_Status ON dbo.PACEntries(UserID, Status);
    CREATE NONCLUSTERED INDEX IX_PACEntries_Code ON dbo.PACEntries(PACCode);
END;

-- Ensure Module registration in TxnModules
IF NOT EXISTS (SELECT 1 FROM dbo.TxnModules WHERE ModuleCode = 'UCL')
BEGIN
    INSERT INTO dbo.TxnModules (
        ModuleCode, ModuleName, Prefix, DocPrefix, TargetTable, RecordTable,
        PrimaryKeyColumn, IsCore, IsActive, DisplayOrder, UserID
    ) VALUES (
        'UCL', 'Aadhaar UCL Update Service', 'UCL', 'UCL', 'UCLUpdates', 'UCLUpdates',
        'UCLID', 1, 1, 8, 1
    );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.TxnModules WHERE ModuleCode = 'PAC')
BEGIN
    INSERT INTO dbo.TxnModules (
        ModuleCode, ModuleName, Prefix, DocPrefix, TargetTable, RecordTable,
        PrimaryKeyColumn, IsCore, IsActive, DisplayOrder, UserID
    ) VALUES (
        'PAC', 'CSC Aadhaar PAC Code Management', 'PAC', 'PAC', 'PACEntries', 'PACEntries',
        'PACID', 1, 1, 9, 1
    );
END;
