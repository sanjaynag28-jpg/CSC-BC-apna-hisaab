-- =========================================================================
-- CASH MANAGEMENT SYSTEM - SQLITE COMPLETE DATABASE SCHEMA
-- 100% Pure Embedded Zero-Install SQLite Edition
-- =========================================================================

CREATE TABLE IF NOT EXISTS Accounts (
    AccountID INTEGER PRIMARY KEY AUTOINCREMENT,
    AccountName TEXT NOT NULL,
    AccountType TEXT NOT NULL,
    BankName TEXT NULL,
    AccountNumber TEXT NULL,
    OpeningBalance NUMERIC NOT NULL DEFAULT 0,
    CurrentBalance NUMERIC NOT NULL DEFAULT 0,
    Currency TEXT DEFAULT 'INR',
    IsActive INTEGER DEFAULT 1,
    Color TEXT DEFAULT '#6366f1',
    Icon TEXT DEFAULT 'wallet',
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS AuditLogs (
    LogID INTEGER PRIMARY KEY AUTOINCREMENT,
    Action TEXT NOT NULL,
    TableName TEXT NOT NULL,
    RecordID INTEGER NULL,
    Details TEXT NULL,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    Module TEXT NULL,
    Description TEXT NULL,
    EntityName TEXT NULL,
    Amount NUMERIC NULL,
    OldData TEXT NULL,
    NewData TEXT NULL,
    UserID INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS BCCounterSessions (
    SessionID INTEGER PRIMARY KEY AUTOINCREMENT,
    SessionDate TEXT DEFAULT (date('now', 'localtime')),
    OpeningCash NUMERIC DEFAULT 0,
    Note500 INTEGER DEFAULT 0,
    Note200 INTEGER DEFAULT 0,
    Note100 INTEGER DEFAULT 0,
    Note50 INTEGER DEFAULT 0,
    Note20 INTEGER DEFAULT 0,
    Note10 INTEGER DEFAULT 0,
    Coins NUMERIC DEFAULT 0,
    ActualClosingCash NUMERIC DEFAULT 0,
    ExpectedClosingCash NUMERIC DEFAULT 0,
    CashDifference NUMERIC DEFAULT 0,
    Status TEXT DEFAULT 'Open',
    Notes TEXT NULL,
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS BCTransactions (
    BCID INTEGER PRIMARY KEY AUTOINCREMENT,
    TransDate TEXT DEFAULT (date('now', 'localtime')),
    TransTime TEXT DEFAULT (time('now', 'localtime')),
    ServiceType TEXT NOT NULL,
    CustomerName TEXT NOT NULL,
    CustomerPhone TEXT NULL,
    CustomerAadhaarLast4 TEXT NULL,
    BankName TEXT NULL,
    AccountNumber TEXT NULL,
    IFSC TEXT NULL,
    BeneficiaryName TEXT NULL,
    Amount NUMERIC NOT NULL,
    CommissionEarned NUMERIC DEFAULT 0,
    CustomerCharge NUMERIC DEFAULT 0,
    NetProfit NUMERIC DEFAULT 0,
    CashAccountID INTEGER NULL,
    PortalAccountID INTEGER NULL,
    RRN TEXT NULL,
    Status TEXT DEFAULT 'Success',
    Remarks TEXT NULL,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1,
    UniversalSN INTEGER NULL,
    QROperation TEXT NULL,
    ChargesMethod TEXT DEFAULT 'CASH'
);

CREATE TABLE IF NOT EXISTS Bills (
    BillID INTEGER PRIMARY KEY AUTOINCREMENT,
    BillNumber TEXT NULL,
    BillerName TEXT NOT NULL,
    BillType TEXT NOT NULL,
    ConsumerNumber TEXT NULL,
    BillDate TEXT NULL,
    DueDate TEXT NULL,
    BillAmount NUMERIC NOT NULL,
    LateFee NUMERIC DEFAULT 0,
    TotalAmount NUMERIC NOT NULL,
    PaymentStatus TEXT DEFAULT 'Pending',
    PaidDate TEXT NULL,
    PaidAmount NUMERIC NULL,
    PaidFromAccountID INTEGER NULL,
    PaymentMode TEXT NULL,
    ReferenceNumber TEXT NULL,
    Notes TEXT NULL,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS Budgets (
    BudgetID INTEGER PRIMARY KEY AUTOINCREMENT,
    CategoryID INTEGER NOT NULL,
    BudgetMonth INTEGER NOT NULL,
    BudgetYear INTEGER NOT NULL,
    BudgetAmount NUMERIC NOT NULL,
    AlertThreshold NUMERIC DEFAULT 80,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS Categories (
    CategoryID INTEGER PRIMARY KEY AUTOINCREMENT,
    CategoryName TEXT NOT NULL,
    CategoryType TEXT NOT NULL,
    Icon TEXT DEFAULT 'tag',
    Color TEXT DEFAULT '#6366f1',
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ClientErrorLogs (
    ErrorID INTEGER PRIMARY KEY AUTOINCREMENT,
    ErrorMessage TEXT NOT NULL,
    ErrorStack TEXT NULL,
    Url TEXT NULL,
    LineNumber INTEGER NULL,
    ColumnNumber INTEGER NULL,
    UserAgent TEXT NULL,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER DEFAULT 1,
    Resolved INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS CSCApplications (
    ApplicationID INTEGER PRIMARY KEY AUTOINCREMENT,
    AppDate TEXT DEFAULT (date('now', 'localtime')),
    AppTime TEXT DEFAULT (time('now', 'localtime')),
    ServiceID INTEGER NULL,
    ServiceName TEXT NOT NULL,
    CustomerName TEXT NOT NULL,
    CustomerPhone TEXT NULL,
    GovtFee NUMERIC DEFAULT 0,
    OperatorFee NUMERIC DEFAULT 0,
    TotalFee NUMERIC NOT NULL,
    CommissionEarned NUMERIC DEFAULT 0,
    NetProfit NUMERIC DEFAULT 0,
    PaymentStatus TEXT DEFAULT 'Pending',
    ApplicationStatus TEXT DEFAULT 'Submitted',
    RefNumber TEXT NULL,
    AcknowledgementPath TEXT NULL,
    Remarks TEXT NULL,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1,
    UniversalSN INTEGER NULL,
    WalletAccountID INTEGER NULL,
    CashAccountID INTEGER NULL,
    TargetAccountID INTEGER NULL,
    DeliveryDate TEXT NULL
);

CREATE TABLE IF NOT EXISTS TxnModules (
    ModuleCode TEXT PRIMARY KEY,
    ModuleName TEXT NOT NULL,
    TableName TEXT NOT NULL,
    PkColumn TEXT NOT NULL,
    SnColumn TEXT NOT NULL DEFAULT 'UniversalSN',
    IsActive INTEGER NOT NULL DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS CSCServices (
    ServiceID INTEGER PRIMARY KEY AUTOINCREMENT,
    ServiceName TEXT NOT NULL,
    GovtFee NUMERIC DEFAULT 0,
    OperatorFee NUMERIC DEFAULT 0,
    DefaultDays INTEGER DEFAULT 7,
    Icon TEXT DEFAULT 'file-text',
    IsActive INTEGER DEFAULT 1,
    SortOrder INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS FieldDefinitions (
    FieldID INTEGER PRIMARY KEY AUTOINCREMENT,
    ServiceID INTEGER NOT NULL,
    FieldName TEXT NOT NULL,
    FieldLabel TEXT NOT NULL,
    FieldType TEXT DEFAULT 'text',
    IsRequired INTEGER DEFAULT 0,
    OptionsList TEXT NULL,
    SortOrder INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS ServiceRecords (
    RecordID INTEGER PRIMARY KEY AUTOINCREMENT,
    ServiceID INTEGER NOT NULL,
    ServiceName TEXT NOT NULL,
    CustomerName TEXT NOT NULL,
    CustomerPhone TEXT NULL,
    RecordDate TEXT DEFAULT (date('now', 'localtime')),
    RecordTime TEXT DEFAULT (time('now', 'localtime')),
    GovtFee NUMERIC DEFAULT 0,
    OperatorFee NUMERIC DEFAULT 0,
    TotalFee NUMERIC NOT NULL,
    CommissionEarned NUMERIC DEFAULT 0,
    NetProfit NUMERIC DEFAULT 0,
    RefNumber TEXT NULL,
    FieldData TEXT NULL,
    PaymentStatus TEXT DEFAULT 'Paid',
    PaymentMode TEXT DEFAULT 'Cash',
    AccountID INTEGER NULL,
    Remarks TEXT NULL,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1,
    UniversalSN INTEGER NULL,
    Status TEXT DEFAULT 'Completed'
);

CREATE TABLE IF NOT EXISTS Customers (
    CustomerID INTEGER PRIMARY KEY AUTOINCREMENT,
    CustomerName TEXT NOT NULL,
    Phone TEXT NULL,
    Email TEXT NULL,
    Address TEXT NULL,
    AadhaarLast4 TEXT NULL,
    CurrentBalance NUMERIC DEFAULT 0,
    TotalTransactions INTEGER DEFAULT 0,
    TotalVolume NUMERIC DEFAULT 0,
    TotalCommission NUMERIC DEFAULT 0,
    Notes TEXT NULL,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS BillPayments (
    PaymentID INTEGER PRIMARY KEY AUTOINCREMENT,
    BillerName TEXT NOT NULL,
    BillerCategory TEXT NOT NULL,
    ConsumerNumber TEXT NOT NULL,
    ConsumerName TEXT NOT NULL,
    BillAmount NUMERIC NOT NULL,
    CustomerCharge NUMERIC DEFAULT 0,
    TotalCollected NUMERIC NOT NULL,
    NetCommission NUMERIC DEFAULT 0,
    PaymentDate TEXT DEFAULT (date('now', 'localtime')),
    PaymentTime TEXT DEFAULT (time('now', 'localtime')),
    WalletAccountID INTEGER NULL,
    CashAccountID INTEGER NULL,
    TxnReference TEXT NOT NULL,
    BillDueDate TEXT NULL,
    SubCategory TEXT NULL,
    CustomerPhone TEXT NULL,
    VibhagCode TEXT NULL,
    DiscomCode TEXT NULL,
    Notes TEXT NULL,
    Status TEXT DEFAULT 'SUCCESS',
    UniversalSN INTEGER NULL,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ApiIdempotencyRequests (
    IdempotencyID INTEGER PRIMARY KEY AUTOINCREMENT,
    UserID INTEGER NOT NULL,
    RequestKey TEXT NOT NULL,
    RoutePath TEXT NOT NULL,
    ResponseBody TEXT NOT NULL,
    ResponseStatus INTEGER NOT NULL,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    ExpiresAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Documents (
    DocumentID INTEGER PRIMARY KEY AUTOINCREMENT,
    CustomerID INTEGER NULL,
    EntityType TEXT NULL DEFAULT 'Customer',
    EntityID INTEGER NULL,
    DocName TEXT NOT NULL,
    DocType TEXT NOT NULL,
    FilePath TEXT NOT NULL,
    FileSize INTEGER NULL,
    FileType TEXT NULL,
    Notes TEXT NULL,
    UploadedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS InvoiceItems (
    ItemID INTEGER PRIMARY KEY AUTOINCREMENT,
    InvoiceID INTEGER NOT NULL,
    Description TEXT NOT NULL,
    Quantity NUMERIC NOT NULL DEFAULT 1,
    Rate NUMERIC NOT NULL DEFAULT 0,
    Amount NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS Invoices (
    InvoiceID INTEGER PRIMARY KEY AUTOINCREMENT,
    InvoiceNumber TEXT NOT NULL,
    CustomerID INTEGER NOT NULL,
    CustomerName TEXT NOT NULL,
    CustomerPhone TEXT NULL,
    CustomerAddress TEXT NULL,
    InvoiceDate TEXT DEFAULT (date('now', 'localtime')),
    DueDate TEXT NULL,
    SubTotal NUMERIC NOT NULL DEFAULT 0,
    Discount NUMERIC NOT NULL DEFAULT 0,
    TotalAmount NUMERIC NOT NULL DEFAULT 0,
    PaidAmount NUMERIC NOT NULL DEFAULT 0,
    BalanceAmount NUMERIC NOT NULL DEFAULT 0,
    PaymentStatus TEXT DEFAULT 'Unpaid',
    Notes TEXT NULL,
    AccountID INTEGER NULL,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1,
    UniversalSN INTEGER NULL
);

CREATE TABLE IF NOT EXISTS KhataEntries (
    KhataID INTEGER PRIMARY KEY AUTOINCREMENT,
    CustomerID INTEGER NOT NULL,
    EntryType TEXT NOT NULL,
    Amount NUMERIC NOT NULL,
    Description TEXT NOT NULL,
    EntryDate TEXT DEFAULT (date('now', 'localtime')),
    EntryTime TEXT DEFAULT (time('now', 'localtime')),
    PaymentID INTEGER NULL,
    BCID INTEGER NULL,
    AppID INTEGER NULL,
    PaymentMode TEXT DEFAULT 'Cash',
    AccountID INTEGER NULL,
    ReferenceNo TEXT NULL,
    Notes TEXT NULL,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1,
    UniversalSN INTEGER NULL
);

CREATE TABLE IF NOT EXISTS Parties (
    PartyID INTEGER PRIMARY KEY AUTOINCREMENT,
    PartyName TEXT NOT NULL,
    PartyType TEXT NOT NULL,
    Phone TEXT NULL,
    Email TEXT NULL,
    Address TEXT NULL,
    CurrentBalance NUMERIC DEFAULT 0,
    IsActive INTEGER DEFAULT 1,
    Notes TEXT NULL,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS RecurringTransactions (
    RecurringID INTEGER PRIMARY KEY AUTOINCREMENT,
    Title TEXT NULL,
    Description TEXT NULL,
    TransType TEXT NOT NULL,
    Amount NUMERIC NOT NULL,
    AccountID INTEGER NOT NULL,
    ToAccountID INTEGER NULL,
    CategoryID INTEGER NULL,
    PartyID INTEGER NULL,
    Frequency TEXT NOT NULL,
    StartDate TEXT NOT NULL,
    EndDate TEXT NULL,
    NextDueDate TEXT NOT NULL,
    LastRunDate TEXT NULL,
    IsActive INTEGER DEFAULT 1,
    Notes TEXT NULL,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS SchemaMigrations (
    MigrationID INTEGER PRIMARY KEY AUTOINCREMENT,
    MigrationName TEXT NOT NULL UNIQUE,
    AppliedAt TEXT DEFAULT (datetime('now', 'localtime')),
    BatchNo INTEGER NOT NULL DEFAULT 1,
    Notes TEXT NULL
);

CREATE TABLE IF NOT EXISTS SystemSettings (
    SettingKey TEXT PRIMARY KEY,
    SettingValue TEXT NOT NULL,
    Description TEXT NULL,
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS Transactions (
    TransID INTEGER PRIMARY KEY AUTOINCREMENT,
    TransDate TEXT DEFAULT (date('now', 'localtime')),
    TransTime TEXT DEFAULT (time('now', 'localtime')),
    TransType TEXT NOT NULL,
    Amount NUMERIC NOT NULL,
    AccountID INTEGER NOT NULL,
    ToAccountID INTEGER NULL,
    CategoryID INTEGER NULL,
    PartyID INTEGER NULL,
    CustomerID INTEGER NULL,
    ReferenceNo TEXT NULL,
    Description TEXT NULL,
    PaymentMode TEXT DEFAULT 'Cash',
    Status TEXT DEFAULT 'Cleared',
    IsDeleted INTEGER DEFAULT 0,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1,
    UniversalSN INTEGER NULL,
    SourceModule TEXT NULL,
    SourceID INTEGER NULL,
    LineType TEXT NULL
);

CREATE TABLE IF NOT EXISTS UniversalTxnRegistry (
    UniversalSN INTEGER PRIMARY KEY AUTOINCREMENT,
    SourceModule TEXT NOT NULL,
    SourceID INTEGER NOT NULL,
    SourceTable TEXT NOT NULL,
    SourcePkColumn TEXT NOT NULL,
    TxnDate TEXT NOT NULL,
    TxnTime TEXT NOT NULL,
    CustomerName TEXT NULL,
    CustomerPhone TEXT NULL,
    RefNumber TEXT NULL,
    Amount NUMERIC NOT NULL DEFAULT 0,
    CommissionEarned NUMERIC NOT NULL DEFAULT 0,
    CustomerCharge NUMERIC NOT NULL DEFAULT 0,
    NetProfit NUMERIC NOT NULL DEFAULT 0,
    SummaryDetails TEXT NULL,
    PaymentMode TEXT NULL,
    Status TEXT NOT NULL DEFAULT 'Success',
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT UQ_UniversalRegistry_Source UNIQUE (SourceModule, SourceID)
);

CREATE TABLE IF NOT EXISTS Users (
    UserID INTEGER PRIMARY KEY AUTOINCREMENT,
    Username TEXT NOT NULL UNIQUE,
    PasswordHash TEXT NOT NULL,
    FullName TEXT NULL,
    ShopName TEXT NULL,
    OwnerName TEXT NULL,
    Phone TEXT NULL,
    Email TEXT NULL,
    Role TEXT DEFAULT 'Admin',
    IsActive INTEGER DEFAULT 1,
    ApiToken TEXT NULL,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS AppLicenses (
    LicenseID INTEGER PRIMARY KEY AUTOINCREMENT,
    LicenseKey TEXT NOT NULL UNIQUE,
    Tier TEXT NOT NULL DEFAULT 'PRO',
    Status TEXT NOT NULL DEFAULT 'ACTIVE',
    CustomerName TEXT NULL,
    CustomerPhone TEXT NULL,
    IssuedAt TEXT DEFAULT (datetime('now', 'localtime')),
    ExpiresAt TEXT NULL,
    Notes TEXT NULL
);

-- Essential Performance Indexes
CREATE INDEX IF NOT EXISTS IX_Transactions_Date ON Transactions(TransDate);
CREATE INDEX IF NOT EXISTS IX_Transactions_AccountID ON Transactions(AccountID);
CREATE INDEX IF NOT EXISTS IX_Transactions_Source ON Transactions(SourceModule, SourceID, LineType);
CREATE INDEX IF NOT EXISTS IX_UniversalTxnRegistry_Date ON UniversalTxnRegistry(TxnDate);
CREATE INDEX IF NOT EXISTS IX_KhataEntries_CustomerID ON KhataEntries(CustomerID);
CREATE INDEX IF NOT EXISTS IX_BillPayments_TxnRef ON BillPayments(TxnReference);
CREATE INDEX IF NOT EXISTS IX_BCTransactions_Date ON BCTransactions(TransDate);
