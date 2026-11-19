-- =========================================================================
-- CASH MANAGEMENT SYSTEM - DATABASE SCHEMA & PROCEDURES SETUP
-- Generated from Live Working Database: 2026-11-09T11:18:57.114Z
-- =========================================================================

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'CashManagement')
BEGIN
    CREATE DATABASE CashManagement;
END
GO

USE CashManagement;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Accounts')
BEGIN
    CREATE TABLE [dbo].[Accounts] (
        [AccountID] INT IDENTITY(1,1) NOT NULL,
        [AccountName] NVARCHAR(100) NOT NULL,
        [AccountType] NVARCHAR(50) NOT NULL,
        [BankName] NVARCHAR(100) NULL,
        [AccountNumber] NVARCHAR(50) NULL,
        [OpeningBalance] DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        [CurrentBalance] DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        [Currency] NVARCHAR(10) NULL DEFAULT ('INR'),
        [IsActive] BIT NULL DEFAULT ((1)),
        [Color] NVARCHAR(20) NULL DEFAULT ('#6366f1'),
        [Icon] NVARCHAR(50) NULL DEFAULT ('wallet'),
        [CreatedAt] DATETIME NULL DEFAULT (getdate()),
        [UpdatedAt] DATETIME NULL DEFAULT (getdate()),
        [UserID] INT NOT NULL DEFAULT ((1)),
        CONSTRAINT [PK_Accounts] PRIMARY KEY CLUSTERED ([AccountID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AuditLogs')
BEGIN
    CREATE TABLE [dbo].[AuditLogs] (
        [LogID] BIGINT IDENTITY(1,1) NOT NULL,
        [Action] NVARCHAR(50) NOT NULL,
        [TableName] NVARCHAR(50) NOT NULL,
        [RecordID] INT NULL,
        [Details] NVARCHAR(MAX) NULL,
        [CreatedAt] DATETIME NULL DEFAULT (getdate()),
        [Module] NVARCHAR(50) NULL,
        [Description] NVARCHAR(500) NULL,
        [EntityName] NVARCHAR(255) NULL,
        [Amount] DECIMAL(18,2) NULL,
        [OldData] NVARCHAR(MAX) NULL,
        [NewData] NVARCHAR(MAX) NULL,
        [UserID] INT NULL DEFAULT ((1)),
        CONSTRAINT [PK_AuditLogs] PRIMARY KEY CLUSTERED ([LogID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BCCounterSessions')
BEGIN
    CREATE TABLE [dbo].[BCCounterSessions] (
        [SessionID] INT IDENTITY(1,1) NOT NULL,
        [SessionDate] DATE NOT NULL DEFAULT (CONVERT([date],getdate())),
        [OpeningCash] DECIMAL(18,2) NULL DEFAULT ((0)),
        [Note500] INT NULL DEFAULT ((0)),
        [Note200] INT NULL DEFAULT ((0)),
        [Note100] INT NULL DEFAULT ((0)),
        [Note50] INT NULL DEFAULT ((0)),
        [Note20] INT NULL DEFAULT ((0)),
        [Note10] INT NULL DEFAULT ((0)),
        [Coins] DECIMAL(18,2) NULL DEFAULT ((0)),
        [ActualClosingCash] DECIMAL(18,2) NULL DEFAULT ((0)),
        [ExpectedClosingCash] DECIMAL(18,2) NULL DEFAULT ((0)),
        [CashDifference] DECIMAL(18,2) NULL DEFAULT ((0)),
        [Status] NVARCHAR(20) NULL DEFAULT ('Open'),
        [Notes] NVARCHAR(500) NULL,
        [UpdatedAt] DATETIME NULL DEFAULT (getdate()),
        [UserID] INT NOT NULL DEFAULT ((1)),
        CONSTRAINT [PK_BCCounterSessions] PRIMARY KEY CLUSTERED ([SessionID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BCTransactions')
BEGIN
    CREATE TABLE [dbo].[BCTransactions] (
        [BCID] INT IDENTITY(1,1) NOT NULL,
        [TransDate] DATE NOT NULL DEFAULT (CONVERT([date],getdate())),
        [TransTime] NVARCHAR(10) NULL DEFAULT (CONVERT([nvarchar](8),getdate(),(108))),
        [ServiceType] NVARCHAR(50) NOT NULL,
        [CustomerName] NVARCHAR(100) NOT NULL,
        [CustomerPhone] NVARCHAR(20) NULL,
        [CustomerAadhaarLast4] NVARCHAR(20) NULL,
        [BankName] NVARCHAR(100) NULL,
        [AccountNumber] NVARCHAR(50) NULL,
        [IFSC] NVARCHAR(20) NULL,
        [BeneficiaryName] NVARCHAR(100) NULL,
        [Amount] DECIMAL(18,2) NOT NULL,
        [CommissionEarned] DECIMAL(18,2) NULL DEFAULT ((0)),
        [CustomerCharge] DECIMAL(18,2) NULL DEFAULT ((0)),
        [NetProfit] DECIMAL(18,2) NULL DEFAULT ((0)),
        [CashAccountID] INT NULL,
        [PortalAccountID] INT NULL,
        [QRProvider] NVARCHAR(50) NULL,
        [QROperation] NVARCHAR(50) NULL DEFAULT ('Cash Given to Customer'),
        [RRN_UTR] NVARCHAR(100) NULL,
        [Status] NVARCHAR(20) NULL DEFAULT ('Success'),
        [Notes] NVARCHAR(500) NULL,
        [CreatedAt] DATETIME NULL DEFAULT (getdate()),
        [UpdatedAt] DATETIME NULL DEFAULT (getdate()),
        [Metadata] NVARCHAR(MAX) NULL,
        [CustomerID] INT NULL,
        [AccountBalance] DECIMAL(18,2) NULL,
        [DateOfBirth] DATE NULL,
        [UserID] INT NOT NULL DEFAULT ((1)),
        [GlobalSerialNo] INT NULL,
        [SNCode] VARCHAR(30) NULL,
        [ModuleCode] VARCHAR(30) NULL,
        [PortalName] NVARCHAR(100) NULL,
        CONSTRAINT [PK_BCTransactions] PRIMARY KEY CLUSTERED ([BCID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Bills')
BEGIN
    CREATE TABLE [dbo].[Bills] (
        [BillID] INT IDENTITY(1,1) NOT NULL,
        [BillName] NVARCHAR(100) NOT NULL,
        [BillType] NVARCHAR(50) NULL,
        [Amount] DECIMAL(18,2) NOT NULL,
        [DueDate] DATE NOT NULL,
        [PartyID] INT NULL,
        [AccountID] INT NULL,
        [CategoryID] INT NULL,
        [Status] NVARCHAR(20) NULL DEFAULT ('Pending'),
        [IsPaid] BIT NULL DEFAULT ((0)),
        [PaidDate] DATE NULL,
        [Notes] NVARCHAR(500) NULL,
        [IsRecurring] BIT NULL DEFAULT ((0)),
        [Frequency] NVARCHAR(20) NULL,
        [CreatedAt] DATETIME NULL DEFAULT (getdate()),
        [UserID] INT NOT NULL DEFAULT ((1)),
        [GlobalSerialNo] INT NULL,
        [SNCode] VARCHAR(30) NULL,
        [ModuleCode] VARCHAR(30) NULL,
        CONSTRAINT [PK_Bills] PRIMARY KEY CLUSTERED ([BillID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Budgets')
BEGIN
    CREATE TABLE [dbo].[Budgets] (
        [BudgetID] INT IDENTITY(1,1) NOT NULL,
        [BudgetName] NVARCHAR(100) NOT NULL,
        [CategoryID] INT NULL,
        [BudgetMonth] INT NOT NULL,
        [BudgetYear] INT NOT NULL,
        [BudgetAmount] DECIMAL(18,2) NOT NULL,
        [AlertPercent] INT NULL DEFAULT ((80)),
        [IsActive] BIT NULL DEFAULT ((1)),
        [CreatedAt] DATETIME NULL DEFAULT (getdate()),
        [UserID] INT NOT NULL DEFAULT ((1)),
        CONSTRAINT [PK_Budgets] PRIMARY KEY CLUSTERED ([BudgetID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Categories')
BEGIN
    CREATE TABLE [dbo].[Categories] (
        [CategoryID] INT IDENTITY(1,1) NOT NULL,
        [CategoryName] NVARCHAR(100) NOT NULL,
        [CategoryType] NVARCHAR(20) NOT NULL,
        [Icon] NVARCHAR(50) NULL DEFAULT ('tag'),
        [Color] NVARCHAR(20) NULL DEFAULT ('#8b5cf6'),
        [ParentID] INT NULL,
        [IsActive] BIT NULL DEFAULT ((1)),
        [CreatedAt] DATETIME NULL DEFAULT (getdate()),
        [UserID] INT NOT NULL DEFAULT ((1)),
        CONSTRAINT [PK_Categories] PRIMARY KEY CLUSTERED ([CategoryID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ClientErrorLogs')
BEGIN
    CREATE TABLE [dbo].[ClientErrorLogs] (
        [ErrorID] INT IDENTITY(1,1) NOT NULL,
        [UserID] INT NULL,
        [ErrorType] NVARCHAR(100) NOT NULL,
        [ErrorMessage] NVARCHAR(MAX) NOT NULL,
        [ErrorStack] NVARCHAR(MAX) NULL,
        [Url] NVARCHAR(500) NULL,
        [UserAgent] NVARCHAR(500) NULL,
        [DeviceInfo] NVARCHAR(255) NULL,
        [Resolved] BIT NULL DEFAULT ((0)),
        [CreatedAt] DATETIME NULL DEFAULT (getdate()),
        CONSTRAINT [PK_ClientErrorLogs] PRIMARY KEY CLUSTERED ([ErrorID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CSCApplications')
BEGIN
    CREATE TABLE [dbo].[CSCApplications] (
        [AppID] INT IDENTITY(1,1) NOT NULL,
        [CustomerID] INT NULL,
        [CustomerName] NVARCHAR(150) NOT NULL,
        [CustomerPhone] NVARCHAR(20) NULL,
        [CustomerAadhaar] NVARCHAR(20) NULL,
        [ServiceType] NVARCHAR(80) NOT NULL,
        [ServiceSubtype] NVARCHAR(100) NULL,
        [AckNumber] NVARCHAR(100) NULL,
        [PortalName] NVARCHAR(80) NULL,
        [ApplyDate] DATETIME NOT NULL DEFAULT (getdate()),
        [ExpectedDate] DATE NULL,
        [CompletionDate] DATETIME NULL,
        [GovtFee] DECIMAL(18,2) NOT NULL DEFAULT ((0.00)),
        [OperatorFee] DECIMAL(18,2) NOT NULL DEFAULT ((0.00)),
        [TotalFee] DECIMAL(18,2) NOT NULL DEFAULT ((0.00)),
        [PaidAmount] DECIMAL(18,2) NOT NULL DEFAULT ((0.00)),
        [DueAmount] DECIMAL(18,2) NOT NULL DEFAULT ((0.00)),
        [PaymentStatus] NVARCHAR(30) NOT NULL DEFAULT ('Paid'),
        [PaymentMode] NVARCHAR(30) NOT NULL DEFAULT ('Cash'),
        [Status] NVARCHAR(50) NOT NULL DEFAULT ('Applied'),
        [StatusRemarks] NVARCHAR(MAX) NULL,
        [CertificateDocNo] NVARCHAR(100) NULL,
        [CertificateFile] NVARCHAR(300) NULL,
        [CreatedAt] DATETIME NOT NULL DEFAULT (getdate()),
        [UpdatedAt] DATETIME NOT NULL DEFAULT (getdate()),
        [IsActive] BIT NOT NULL DEFAULT ((1)),
        [DateOfBirth] DATE NULL,
        [UserID] INT NOT NULL DEFAULT ((1)),
        [GlobalSerialNo] INT NULL,
        [SNCode] VARCHAR(30) NULL,
        [ModuleCode] VARCHAR(30) NULL,
        CONSTRAINT [PK_CSCApplications] PRIMARY KEY CLUSTERED ([AppID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CSCServices')
BEGIN
    CREATE TABLE [dbo].[CSCServices] (
        [ServiceID] INT IDENTITY(1,1) NOT NULL,
        [ServiceName] NVARCHAR(150) NOT NULL,
        [GovtFee] DECIMAL(18,2) NOT NULL DEFAULT ((0.00)),
        [OperatorFee] DECIMAL(18,2) NOT NULL DEFAULT ((50.00)),
        [DefaultDays] INT NOT NULL DEFAULT ((10)),
        [Icon] NVARCHAR(50) NULL DEFAULT ('file-text'),
        [IsActive] BIT NOT NULL DEFAULT ((1)),
        [SortOrder] INT NOT NULL DEFAULT ((0)),
        [CreatedAt] DATETIME NOT NULL DEFAULT (getdate()),
        [UpdatedAt] DATETIME NOT NULL DEFAULT (getdate()),
        [UserID] INT NOT NULL DEFAULT ((1)),
        CONSTRAINT [PK_CSCServices] PRIMARY KEY CLUSTERED ([ServiceID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Customers')
BEGIN
    CREATE TABLE [dbo].[Customers] (
        [CustomerID] INT IDENTITY(1,1) NOT NULL,
        [CustomerName] NVARCHAR(150) NOT NULL,
        [Phone] NVARCHAR(20) NULL,
        [Email] NVARCHAR(100) NULL,
        [Address] NVARCHAR(500) NULL,
        [GSTIN] NVARCHAR(50) NULL,
        [OpeningBalance] DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        [CurrentBalance] DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        [BalanceType] NVARCHAR(20) NULL DEFAULT ('ToReceive'),
        [CreditLimit] DECIMAL(18,2) NULL DEFAULT ((0)),
        [Notes] NVARCHAR(1000) NULL,
        [IsActive] BIT NULL DEFAULT ((1)),
        [CreatedAt] DATETIME NULL DEFAULT (getdate()),
        [UpdatedAt] DATETIME NULL DEFAULT (getdate()),
        [ParentCustomerID] INT NULL,
        [FamilyID] INT NULL,
        [IsFamilyHead] BIT NOT NULL DEFAULT ((1)),
        [Relationship] NVARCHAR(50) NOT NULL DEFAULT ('Self'),
        [KhataMode] NVARCHAR(20) NOT NULL DEFAULT ('Separate'),
        [FamilyName] NVARCHAR(150) NULL,
        [AadhaarNumber] NVARCHAR(20) NULL,
        [DateOfBirth] DATE NULL,
        [UserID] INT NOT NULL DEFAULT ((1)),
        CONSTRAINT [PK_Customers] PRIMARY KEY CLUSTERED ([CustomerID])
    );
END
GO

IF COL_LENGTH('dbo.Customers', 'DateOfBirth') IS NULL
BEGIN
    ALTER TABLE dbo.Customers ADD DateOfBirth DATE NULL;
END
GO

IF OBJECT_ID('dbo.BillPayments', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BillPayments (
        PaymentID INT IDENTITY(1,1) NOT NULL,
        CustomerID INT NULL,
        CustomerName NVARCHAR(150) NOT NULL,
        CustomerPhone NVARCHAR(20) NULL,
        CustomerAadhaar NVARCHAR(20) NULL,
        BillCategory NVARCHAR(80) NOT NULL,
        ProviderName NVARCHAR(150) NULL,
        ConsumerNumber NVARCHAR(100) NULL,
        BillNumber NVARCHAR(100) NULL,
        BillDate DATE NULL,
        DueDate DATE NULL,
        TotalBillAmount DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        BillAmount DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        CustomerCharge DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        TotalCollected DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        CustomerDue DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        CommissionEarned DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        NetProfit DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        RemainingArrear DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        PaymentMode NVARCHAR(50) NULL,
        WalletAccountID INT NULL,
        CashAccountID INT NULL,
        Status NVARCHAR(30) NULL,
        TxnReference NVARCHAR(100) NULL,
        PaymentDate DATE NOT NULL DEFAULT (CONVERT(date, GETDATE())),
        PaymentTime NVARCHAR(10) NULL,
        Notes NVARCHAR(1000) NULL,
        ExtraFieldsJson NVARCHAR(MAX) NULL,
        IsDeleted BIT NOT NULL DEFAULT ((0)),
        CreatedAt DATETIME NOT NULL DEFAULT (GETDATE()),
        UpdatedAt DATETIME NOT NULL DEFAULT (GETDATE()),
        UserID INT NOT NULL DEFAULT ((1)),
        GlobalSerialNo INT NULL,
        SNCode VARCHAR(30) NULL,
        ModuleCode VARCHAR(30) NULL,
        CONSTRAINT PK_BillPayments PRIMARY KEY CLUSTERED (PaymentID)
    );
END
GO

IF OBJECT_ID('dbo.ApiIdempotencyRequests', 'U') IS NULL
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
        PRIMARY KEY CLUSTERED (UserID, RequestKey)
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Documents')
BEGIN
    CREATE TABLE [dbo].[Documents] (
        [DocumentID] INT IDENTITY(1,1) NOT NULL,
        [CustomerID] INT NULL,
        [FileName] NVARCHAR(255) NOT NULL,
        [OriginalName] NVARCHAR(255) NOT NULL,
        [FileType] NVARCHAR(100) NULL,
        [FileSize] BIGINT NULL DEFAULT ((0)),
        [FilePath] NVARCHAR(500) NOT NULL,
        [UploadedBy] NVARCHAR(50) NULL DEFAULT ('shop'),
        [Description] NVARCHAR(500) NULL,
        [IsArchived] BIT NULL DEFAULT ((0)),
        [CreatedAt] DATETIME NULL DEFAULT (getdate()),
        [UpdatedAt] DATETIME NULL DEFAULT (getdate()),
        [EntityType] NVARCHAR(50) NULL,
        [EntityID] INT NULL,
        [UserID] INT NOT NULL DEFAULT ((1)),
        CONSTRAINT [PK_Documents] PRIMARY KEY CLUSTERED ([DocumentID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InvoiceItems')
BEGIN
    CREATE TABLE [dbo].[InvoiceItems] (
        [ItemID] INT IDENTITY(1,1) NOT NULL,
        [InvoiceID] INT NOT NULL,
        [ItemName] NVARCHAR(200) NOT NULL,
        [Quantity] DECIMAL(12,2) NOT NULL DEFAULT ((1)),
        [Unit] NVARCHAR(20) NULL DEFAULT ('Pcs'),
        [UnitPrice] DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        [TotalPrice] DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        CONSTRAINT [PK_InvoiceItems] PRIMARY KEY CLUSTERED ([ItemID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Invoices')
BEGIN
    CREATE TABLE [dbo].[Invoices] (
        [InvoiceID] INT IDENTITY(1,1) NOT NULL,
        [InvoiceNumber] NVARCHAR(50) NOT NULL,
        [CustomerID] INT NOT NULL,
        [InvoiceDate] DATE NOT NULL DEFAULT (getdate()),
        [DueDate] DATE NULL,
        [SubTotal] DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        [DiscountAmount] DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        [TaxPercent] DECIMAL(5,2) NULL DEFAULT ((0)),
        [TaxAmount] DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        [TotalAmount] DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        [PaidAmount] DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        [BalanceAmount] DECIMAL(18,2) NOT NULL DEFAULT ((0)),
        [PaymentStatus] NVARCHAR(30) NOT NULL DEFAULT ('Unpaid'),
        [PaymentMode] NVARCHAR(50) NULL DEFAULT ('Udhar'),
        [AccountID] INT NULL,
        [Notes] NVARCHAR(1000) NULL,
        [Terms] NVARCHAR(1000) NULL,
        [Status] NVARCHAR(30) NULL DEFAULT ('Active'),
        [CreatedAt] DATETIME NULL DEFAULT (getdate()),
        [UpdatedAt] DATETIME NULL DEFAULT (getdate()),
        [UserID] INT NOT NULL DEFAULT ((1)),
        [GlobalSerialNo] INT NULL,
        [SNCode] VARCHAR(30) NULL,
        [ModuleCode] VARCHAR(30) NULL,
        CONSTRAINT [PK_Invoices] PRIMARY KEY CLUSTERED ([InvoiceID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'KhataEntries')
BEGIN
    CREATE TABLE [dbo].[KhataEntries] (
        [KhataID] INT IDENTITY(1,1) NOT NULL,
        [CustomerID] INT NOT NULL,
        [EntryDate] DATE NOT NULL DEFAULT (getdate()),
        [EntryTime] NVARCHAR(10) NULL,
        [EntryType] NVARCHAR(30) NOT NULL,
        [Amount] DECIMAL(18,2) NOT NULL,
        [BalanceAfter] DECIMAL(18,2) NULL,
        [InvoiceID] INT NULL,
        [AccountID] INT NULL,
        [PaymentMode] NVARCHAR(50) NULL DEFAULT ('Cash'),
        [Description] NVARCHAR(500) NULL,
        [ReferenceNo] NVARCHAR(100) NULL,
        [Attachment] NVARCHAR(500) NULL,
        [CreatedAt] DATETIME NULL DEFAULT (getdate()),
        [UpdatedAt] DATETIME NULL DEFAULT (getdate()),
        [CSCAppID] INT NULL,
        [BCID] INT NULL,
        [PaymentID] INT NULL,
        [UserID] INT NOT NULL DEFAULT ((1)),
        [GlobalSerialNo] INT NULL,
        [SNCode] VARCHAR(30) NULL,
        [ModuleCode] VARCHAR(30) NULL,
        CONSTRAINT [PK_KhataEntries] PRIMARY KEY CLUSTERED ([KhataID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Parties')
BEGIN
    CREATE TABLE [dbo].[Parties] (
        [PartyID] INT IDENTITY(1,1) NOT NULL,
        [PartyName] NVARCHAR(100) NOT NULL,
        [PartyType] NVARCHAR(50) NULL,
        [Phone] NVARCHAR(20) NULL,
        [Email] NVARCHAR(100) NULL,
        [Address] NVARCHAR(500) NULL,
        [OpeningBalance] DECIMAL(18,2) NULL DEFAULT ((0)),
        [CurrentBalance] DECIMAL(18,2) NULL DEFAULT ((0)),
        [Notes] NVARCHAR(1000) NULL,
        [IsActive] BIT NULL DEFAULT ((1)),
        [CreatedAt] DATETIME NULL DEFAULT (getdate()),
        [UpdatedAt] DATETIME NULL DEFAULT (getdate()),
        [UserID] INT NOT NULL DEFAULT ((1)),
        CONSTRAINT [PK_Parties] PRIMARY KEY CLUSTERED ([PartyID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RecurringTransactions')
BEGIN
    CREATE TABLE [dbo].[RecurringTransactions] (
        [RecurringID] INT IDENTITY(1,1) NOT NULL,
        [TransType] NVARCHAR(20) NOT NULL,
        [Amount] DECIMAL(18,2) NOT NULL,
        [AccountID] INT NULL,
        [CategoryID] INT NULL,
        [PartyID] INT NULL,
        [Description] NVARCHAR(500) NULL,
        [Frequency] NVARCHAR(20) NOT NULL,
        [StartDate] DATE NOT NULL,
        [EndDate] DATE NULL,
        [NextDueDate] DATE NOT NULL,
        [LastRunDate] DATE NULL,
        [IsActive] BIT NULL DEFAULT ((1)),
        [CreatedAt] DATETIME NULL DEFAULT (getdate()),
        [ToAccountID] INT NULL,
        [UpdatedAt] DATETIME NULL DEFAULT (getdate()),
        [UserID] INT NOT NULL DEFAULT ((1)),
        CONSTRAINT [PK_RecurringTransactions] PRIMARY KEY CLUSTERED ([RecurringID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SchemaMigrations')
BEGIN
    CREATE TABLE [dbo].[SchemaMigrations] (
        [MigrationID] INT IDENTITY(1,1) NOT NULL,
        [MigrationName] NVARCHAR(150) NOT NULL,
        [AppliedAt] DATETIME NULL DEFAULT (getdate()),
        [Description] NVARCHAR(500) NULL,
        CONSTRAINT [PK_SchemaMigrations] PRIMARY KEY CLUSTERED ([MigrationID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SystemSettings')
BEGIN
    CREATE TABLE [dbo].[SystemSettings] (
        [SettingKey] NVARCHAR(100) NOT NULL,
        [SettingValue] NVARCHAR(MAX) NULL,
        [SettingGroup] NVARCHAR(50) NULL DEFAULT ('General'),
        [Description] NVARCHAR(250) NULL,
        [UpdatedAt] DATETIME NULL DEFAULT (getdate()),
        CONSTRAINT [PK_SystemSettings] PRIMARY KEY CLUSTERED ([SettingKey])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Transactions')
BEGIN
    CREATE TABLE [dbo].[Transactions] (
        [TransactionID] INT IDENTITY(1,1) NOT NULL,
        [TransDate] DATE NOT NULL DEFAULT (getdate()),
        [TransTime] TIME NULL DEFAULT (CONVERT([time],getdate())),
        [TransType] NVARCHAR(20) NOT NULL,
        [Amount] DECIMAL(18,2) NOT NULL,
        [AccountID] INT NOT NULL,
        [ToAccountID] INT NULL,
        [CategoryID] INT NULL,
        [PartyID] INT NULL,
        [Description] NVARCHAR(500) NULL,
        [Reference] NVARCHAR(100) NULL,
        [Tags] NVARCHAR(200) NULL,
        [IsRecurring] BIT NULL DEFAULT ((0)),
        [RecurringID] INT NULL,
        [Attachment] NVARCHAR(500) NULL,
        [CreatedAt] DATETIME NULL DEFAULT (getdate()),
        [UpdatedAt] DATETIME NULL DEFAULT (getdate()),
        [Metadata] NVARCHAR(MAX) NULL,
        [UserID] INT NOT NULL DEFAULT ((1)),
        [IsDeleted] BIT NOT NULL DEFAULT ((0)),
        [GlobalSerialNo] INT NULL,
        [SNCode] VARCHAR(30) NULL,
        [ModuleCode] VARCHAR(30) NULL,
        [SourceModule] VARCHAR(30) NULL,
        [SourceID] INT NULL,
        [LineType] VARCHAR(30) NULL,
        CONSTRAINT [PK_Transactions] PRIMARY KEY CLUSTERED ([TransactionID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'UniversalTxnRegistry')
BEGIN
    CREATE TABLE [dbo].[UniversalTxnRegistry] (
        [GlobalSerialNo] INT IDENTITY(1,1) NOT NULL,
        [SNCode] VARCHAR(23) NULL,
        [SourceModule] VARCHAR(30) NOT NULL,
        [RecordID] INT NOT NULL,
        [ModuleSerialNo] INT NULL,
        [ModuleCode] VARCHAR(30) NULL,
        [EntityName] NVARCHAR(150) NULL,
        [Amount] DECIMAL(18,2) NULL,
        [TransDate] DATE NOT NULL,
        [CreatedAt] DATETIME NOT NULL DEFAULT (getdate()),
        [UserID] INT NOT NULL DEFAULT ((1)),
        [IsActive] BIT NOT NULL DEFAULT ((1)),
        CONSTRAINT [PK_UniversalTxnRegistry] PRIMARY KEY CLUSTERED ([GlobalSerialNo])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
BEGIN
    CREATE TABLE [dbo].[Users] (
        [UserID] INT IDENTITY(1,1) NOT NULL,
        [Username] NVARCHAR(100) NOT NULL,
        [PasswordHash] NVARCHAR(255) NOT NULL,
        [ShopName] NVARCHAR(200) NOT NULL,
        [OwnerName] NVARCHAR(150) NOT NULL,
        [MobileNumber] NVARCHAR(20) NULL,
        [Role] NVARCHAR(50) NOT NULL DEFAULT ('User'),
        [IsActive] BIT NOT NULL DEFAULT ((1)),
        [ApiToken] NVARCHAR(128) NULL,
        [SettingsJson] NVARCHAR(MAX) NULL,
        [CreatedAt] DATETIME NOT NULL DEFAULT (getdate()),
        [UpdatedAt] DATETIME NOT NULL DEFAULT (getdate()),
        [ActiveSessionToken] VARCHAR(64) NULL,
        [LastLoginAt] DATETIME NULL,
        [LastLoginDevice] NVARCHAR(255) NULL,
        CONSTRAINT [PK_Users] PRIMARY KEY CLUSTERED ([UserID])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ApiIdempotencyRequests')
BEGIN
    CREATE TABLE [dbo].[ApiIdempotencyRequests] (
        [UserID] INT NOT NULL,
        [RequestKey] UNIQUEIDENTIFIER NOT NULL,
        [RequestHash] CHAR(64) NOT NULL,
        [State] NVARCHAR(16) NOT NULL,
        [HttpStatus] INT NULL,
        [ResponseBody] NVARCHAR(MAX) NULL,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
        [CompletedAt] DATETIME2 NULL,
        CONSTRAINT [PK_ApiIdempotencyRequests] PRIMARY KEY CLUSTERED ([UserID], [RequestKey])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AppLicenses')
BEGIN
    CREATE TABLE [dbo].[AppLicenses] (
        [LicenseID] INT IDENTITY(1,1) NOT NULL,
        [LicenseKey] NVARCHAR(100) NOT NULL,
        [CustomerShopName] NVARCHAR(200) NULL,
        [OwnerName] NVARCHAR(150) NULL,
        [MobileNumber] NVARCHAR(20) NULL,
        [HardwareID] NVARCHAR(255) NULL,
        [LicenseType] NVARCHAR(50) NOT NULL DEFAULT ('Lifetime'),
        [ActivationDate] DATETIME NULL DEFAULT (getdate()),
        [ExpiryDate] DATETIME NULL,
        [MaxDevices] INT NOT NULL DEFAULT (1),
        [IsActive] BIT NOT NULL DEFAULT (1),
        [Notes] NVARCHAR(500) NULL,
        [CreatedAt] DATETIME NOT NULL DEFAULT (getdate()),
        [UpdatedAt] DATETIME NOT NULL DEFAULT (getdate()),
        CONSTRAINT [PK_AppLicenses] PRIMARY KEY CLUSTERED ([LicenseID])
    );
END
GO

-- Stored Procedure: sp_BackupCashManagementDB
CREATE OR ALTER PROCEDURE sp_BackupCashManagementDB     @BackupFolder NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @TargetFolder NVARCHAR(500);

    IF @BackupFolder IS NOT NULL AND @BackupFolder <> ''
    BEGIN
        SET @TargetFolder = @BackupFolder;
    END
    ELSE
    BEGIN
        -- Default folder DB ke apne data path se derive karo (hardcoded dev path nahi)
        DECLARE @DbPath NVARCHAR(400);
        SELECT @DbPath = LEFT(mf.physical_name, LEN(mf.physical_name) - CHARINDEX('\', REVERSE(mf.physical_name)) + 1)
        FROM sys.master_files mf
        WHERE mf.database_id = DB_ID('CashManagement') AND mf.type = 0;
        SET @TargetFolder = ISNULL(@DbPath, 'D:\Cash Managment BC\backups\');
    END

    IF RIGHT(@TargetFolder, 1) <> '\' SET @TargetFolder = @TargetFolder + '\';

    DECLARE @Timestamp NVARCHAR(30) = REPLACE(REPLACE(REPLACE(CONVERT(NVARCHAR(19), GETDATE(), 120), '-', ''), ' ', '_'), ':', '');
    DECLARE @BackupFileName NVARCHAR(500) = @TargetFolder + 'CashManagement_Backup_' + @Timestamp + '.bak';

    -- Dynamic SQL me path inject na ho -> single quotes escape karo
    DECLARE @SafePath NVARCHAR(1000) = REPLACE(@BackupFileName, '''', '''''');
    DECLARE @Sql NVARCHAR(2000) = 'BACKUP DATABASE ' + QUOTENAME(DB_NAME()) + ' TO DISK = ''' + @SafePath + ''' WITH INIT, STATS = 10, NAME = ''CashManagement Full Backup''';
    EXEC sp_executesql @Sql;

    INSERT INTO AuditLogs (Action, TableName, Details)
    VALUES ('BACKUP', 'CashManagement', 'Full database backup saved to: ' + @BackupFileName);

    SELECT @BackupFileName AS BackupPath, 'Backup created successfully!' AS Message;
END;
GO

-- Stored Procedure: sp_RecalculateAllBalances
CREATE OR ALTER PROCEDURE sp_RecalculateAllBalances AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        -- Accounts: har account ko sp_UpdateAccountBalance se nikalo (BC + ledger dono)
        DECLARE @accId INT;
        DECLARE accCur CURSOR FOR SELECT AccountID FROM Accounts WHERE IsActive = 1;
        OPEN accCur;
        FETCH NEXT FROM accCur INTO @accId;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            EXEC sp_UpdateAccountBalance @AccountID = @accId;
            FETCH NEXT FROM accCur INTO @accId;
        END
        CLOSE accCur;
        DEALLOCATE accCur;

        -- Parties: same logic sp_UpdatePartyBalance me hai (single source of truth)
        DECLARE @ptyId INT;
        DECLARE ptyCur CURSOR FOR SELECT PartyID FROM Parties WHERE IsActive = 1;
        OPEN ptyCur;
        FETCH NEXT FROM ptyCur INTO @ptyId;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            EXEC sp_UpdatePartyBalance @PartyID = @ptyId;
            FETCH NEXT FROM ptyCur INTO @ptyId;
        END
        CLOSE ptyCur;
        DEALLOCATE ptyCur;

        UPDATE c SET
            CurrentBalance =
                CASE WHEN EXISTS (SELECT 1 FROM KhataEntries k WHERE k.CustomerID = c.CustomerID AND k.ReferenceNo = 'OPENING-BAL')
                     THEN 0  -- Opening balance already ek OPENING-BAL KhataEntry me darj hai, dobara mat jodo
                     ELSE c.OpeningBalance END +
                ISNULL((SELECT SUM(Amount) FROM KhataEntries WHERE CustomerID = c.CustomerID AND EntryType = 'Gave'), 0) -
                ISNULL((SELECT SUM(Amount) FROM KhataEntries WHERE CustomerID = c.CustomerID AND EntryType = 'Got'), 0),
            BalanceType = CASE
                WHEN (CASE WHEN EXISTS (SELECT 1 FROM KhataEntries k WHERE k.CustomerID = c.CustomerID AND k.ReferenceNo = 'OPENING-BAL')
                           THEN 0 ELSE c.OpeningBalance END +
                      ISNULL((SELECT SUM(Amount) FROM KhataEntries WHERE CustomerID = c.CustomerID AND EntryType = 'Gave'), 0) -
                      ISNULL((SELECT SUM(Amount) FROM KhataEntries WHERE CustomerID = c.CustomerID AND EntryType = 'Got'), 0)) > 0 THEN 'ToReceive'
                WHEN (CASE WHEN EXISTS (SELECT 1 FROM KhataEntries k WHERE k.CustomerID = c.CustomerID AND k.ReferenceNo = 'OPENING-BAL')
                           THEN 0 ELSE c.OpeningBalance END +
                      ISNULL((SELECT SUM(Amount) FROM KhataEntries WHERE CustomerID = c.CustomerID AND EntryType = 'Gave'), 0) -
                      ISNULL((SELECT SUM(Amount) FROM KhataEntries WHERE CustomerID = c.CustomerID AND EntryType = 'Got'), 0)) < 0 THEN 'ToPay'
                ELSE 'Settled'
            END,
            UpdatedAt = GETDATE()
        FROM Customers c;

        COMMIT TRANSACTION;
        SELECT 'SUCCESS' AS Status, 'All balances verified and recalculated!' AS Message;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- Stored Procedure: sp_UpdateAccountBalance
CREATE OR ALTER PROCEDURE sp_UpdateAccountBalance
    @AccountID INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @Opening DECIMAL(18,2);
        SELECT @Opening = ISNULL(OpeningBalance, 0)
        FROM Accounts WITH (UPDLOCK, HOLDLOCK)
        WHERE AccountID = @AccountID;

        -- Main Transactions ledger:
        -- Inflow (+): Income, Loan Received (borrowed money coming in), Loan Recovery (lent money recovered)
        -- Outflow (-): Expense, Loan Given (lent money going out), Loan Repay (paying back borrowed money)
        DECLARE @Ledger DECIMAL(18,2) =
            ISNULL((SELECT SUM(Amount) FROM Transactions WHERE AccountID = @AccountID AND TransType IN ('Income', 'Loan Received', 'Loan Recovery') AND IsDeleted = 0), 0) +
            ISNULL((SELECT SUM(Amount) FROM Transactions WHERE ToAccountID = @AccountID AND TransType = 'Transfer' AND IsDeleted = 0), 0) -
            ISNULL((SELECT SUM(Amount) FROM Transactions WHERE AccountID = @AccountID AND TransType IN ('Expense', 'Loan Given', 'Loan Repay') AND IsDeleted = 0), 0) -
            ISNULL((SELECT SUM(Amount) FROM Transactions WHERE AccountID = @AccountID AND TransType = 'Transfer' AND IsDeleted = 0), 0);

        -- BC counter: PHYSICAL CASH flow
        DECLARE @BCCash DECIMAL(18,2) = ISNULL((
            SELECT SUM(CASE
                    WHEN ServiceType IN ('Cash Deposit', 'Money Transfer') THEN Amount
                    WHEN ServiceType = 'Cash Withdrawal' THEN -Amount
                    WHEN ServiceType = 'QR Pay' AND QROperation = 'Cash Given to Customer' THEN -Amount
                    WHEN ServiceType = 'QR Pay' AND QROperation = 'Send - Cash Taken from Customer' THEN Amount
                    ELSE 0 END)
            FROM BCTransactions WHERE CashAccountID = @AccountID AND Status = 'Success'
        ), 0) + ISNULL((
            SELECT SUM(ISNULL(b.CustomerCharge, 0))
            FROM BCTransactions b
            WHERE b.CashAccountID = @AccountID 
              AND b.Status = 'Success'
              AND NOT EXISTS (
                  SELECT 1 FROM KhataEntries k 
                  WHERE k.BCID = b.BCID AND k.EntryType = 'Gave'
              )
        ), 0);

        -- BC counter: PORTAL / BANK side
        DECLARE @BCPortal DECIMAL(18,2) = ISNULL((
            SELECT SUM(CASE
                    WHEN ServiceType = 'Cash Withdrawal' THEN Amount
                    WHEN ServiceType = 'QR Pay' AND QROperation IN ('Cash Given to Customer', 'Deposit/Payment') THEN Amount
                    WHEN ServiceType = 'QR Pay' AND QROperation IN ('Send - Cash Taken from Customer', 'Send - Direct Transfer') THEN -Amount
                    WHEN ServiceType IN ('Cash Deposit', 'Money Transfer') THEN -Amount
                    ELSE 0 END) + SUM(ISNULL(CommissionEarned, 0))
            FROM BCTransactions WHERE PortalAccountID = @AccountID AND Status = 'Success'
        ), 0);

        DECLARE @Net DECIMAL(18,2) = @Opening + @Ledger + @BCCash + @BCPortal;
        UPDATE Accounts SET CurrentBalance = @Net, UpdatedAt = GETDATE() WHERE AccountID = @AccountID;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- Stored Procedure: sp_UpdateCustomerBalance
CREATE OR ALTER PROCEDURE sp_UpdateCustomerBalance     @CustomerID INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Opening DECIMAL(18,2) = 0;
    SELECT @Opening = ISNULL(OpeningBalance, 0) FROM Customers WHERE CustomerID = @CustomerID;

    DECLARE @HasOpeningEntry INT = 0;
    SELECT @HasOpeningEntry = COUNT(*) FROM KhataEntries WHERE CustomerID = @CustomerID AND ReferenceNo = 'OPENING-BAL';

    DECLARE @TotalGave DECIMAL(18,2) = 0;
    DECLARE @TotalGot DECIMAL(18,2) = 0;

    SELECT @TotalGave = ISNULL(SUM(Amount), 0) FROM KhataEntries WHERE CustomerID = @CustomerID AND EntryType = 'Gave';
    SELECT @TotalGot = ISNULL(SUM(Amount), 0) FROM KhataEntries WHERE CustomerID = @CustomerID AND EntryType = 'Got';

    DECLARE @NetBalance DECIMAL(18,2) = 0;
    IF @HasOpeningEntry > 0
    BEGIN
        SET @NetBalance = @TotalGave - @TotalGot;
    END
    ELSE
    BEGIN
        SET @NetBalance = @Opening + @TotalGave - @TotalGot;
    END

    UPDATE Customers SET
        CurrentBalance = @NetBalance,
        BalanceType = CASE 
            WHEN @NetBalance > 0 THEN 'ToReceive'
            WHEN @NetBalance < 0 THEN 'ToPay'
            ELSE 'Settled'
        END,
        UpdatedAt = GETDATE()
    WHERE CustomerID = @CustomerID;
END;
GO

-- Stored Procedure: sp_UpdatePartyBalance
CREATE OR ALTER PROCEDURE sp_UpdatePartyBalance     @PartyID INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @Opening DECIMAL(18,2);
        SELECT @Opening = ISNULL(OpeningBalance, 0)
        FROM Parties WITH (UPDLOCK, HOLDLOCK)
        WHERE PartyID = @PartyID;

        -- Party ledger:
        -- Opening
        -- + Loan Given (Receivable increases +)
        -- - Loan Recovery (Receivable reduced -)
        -- - Loan Received (Payable increases -)
        -- + Loan Repay (Payable reduced +)
        UPDATE Parties SET
            CurrentBalance = @Opening +
                ISNULL((SELECT SUM(Amount) FROM Transactions WHERE PartyID = @PartyID AND TransType = 'Loan Given' AND IsDeleted = 0), 0) -
                ISNULL((SELECT SUM(Amount) FROM Transactions WHERE PartyID = @PartyID AND TransType = 'Loan Recovery' AND IsDeleted = 0), 0) -
                ISNULL((SELECT SUM(Amount) FROM Transactions WHERE PartyID = @PartyID AND TransType = 'Loan Received' AND IsDeleted = 0), 0) +
                ISNULL((SELECT SUM(Amount) FROM Transactions WHERE PartyID = @PartyID AND TransType = 'Loan Repay' AND IsDeleted = 0), 0),
            UpdatedAt = GETDATE()
        WHERE PartyID = @PartyID;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

-- Non-Clustered Performance Indexes
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_PaymentID' AND object_id = OBJECT_ID('KhataEntries'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_KhataEntries_PaymentID ON dbo.KhataEntries (PaymentID) WHERE PaymentID IS NOT NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_ReferenceNo' AND object_id = OBJECT_ID('KhataEntries'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_KhataEntries_ReferenceNo ON dbo.KhataEntries (ReferenceNo) WHERE ReferenceNo IS NOT NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Transactions_SourceModule_SourceID' AND object_id = OBJECT_ID('Transactions'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Transactions_SourceModule_SourceID ON dbo.Transactions (SourceModule, SourceID, LineType) WHERE SourceModule IS NOT NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InvoiceItems_InvoiceID' AND object_id = OBJECT_ID('InvoiceItems'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_InvoiceItems_InvoiceID ON dbo.InvoiceItems (InvoiceID);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Documents_Customer_Entity' AND object_id = OBJECT_ID('Documents'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Documents_Customer_Entity ON dbo.Documents (CustomerID, EntityType, EntityID);
END
GO

