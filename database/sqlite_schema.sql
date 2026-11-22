-- ============================================================================
-- CSC & BC Apna Hisaab - 100% Comprehensive SQLite Schema
-- Matches SQL Server 1:1 across all 30 core and auxiliary tables & columns
-- ============================================================================

CREATE TABLE IF NOT EXISTS Accounts (
    AccountID INTEGER PRIMARY KEY AUTOINCREMENT,
    AccountName TEXT NOT NULL,
    AccountType TEXT NOT NULL,
    BankName TEXT,
    AccountNumber TEXT,
    OpeningBalance NUMERIC DEFAULT 0 NOT NULL,
    CurrentBalance NUMERIC DEFAULT 0 NOT NULL,
    Currency TEXT DEFAULT 'INR',
    IsActive INTEGER DEFAULT 1,
    Color TEXT DEFAULT '#6366f1',
    Icon TEXT DEFAULT 'wallet',
    CreatedAt TEXT DEFAULT (date('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (date('now', 'localtime')),
    UserID INTEGER DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS AuditLogs (
    LogID INTEGER PRIMARY KEY AUTOINCREMENT,
    Action TEXT NOT NULL,
    TableName TEXT NOT NULL,
    RecordID INTEGER,
    Details TEXT,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')),
    Module TEXT,
    Description TEXT,
    EntityName TEXT,
    Amount NUMERIC,
    OldData TEXT,
    NewData TEXT,
    UserID INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS BCCounterSessions (
    SessionID INTEGER PRIMARY KEY AUTOINCREMENT,
    SessionDate TEXT NOT NULL,
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
    Notes TEXT,
    UpdatedAt TEXT DEFAULT (date('now', 'localtime')),
    UserID INTEGER DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS BCTransactions (
    BCID INTEGER PRIMARY KEY AUTOINCREMENT,
    TransDate TEXT NOT NULL,
    TransTime TEXT,
    ServiceType TEXT NOT NULL,
    CustomerName TEXT NOT NULL,
    CustomerPhone TEXT,
    CustomerAadhaarLast4 TEXT,
    BankName TEXT,
    AccountNumber TEXT,
    IFSC TEXT,
    BeneficiaryName TEXT,
    Amount NUMERIC NOT NULL,
    CommissionEarned NUMERIC DEFAULT 0,
    CustomerCharge NUMERIC DEFAULT 0,
    NetProfit NUMERIC DEFAULT 0,
    CashAccountID INTEGER,
    PortalAccountID INTEGER,
    QRProvider TEXT,
    QROperation TEXT DEFAULT 'Cash Given to Customer',
    RRN_UTR TEXT,
    Status TEXT DEFAULT 'Success',
    Notes TEXT,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (date('now', 'localtime')),
    Metadata TEXT,
    CustomerID INTEGER,
    AccountBalance NUMERIC,
    DateOfBirth TEXT,
    UserID INTEGER DEFAULT 1 NOT NULL,
    GlobalSerialNo INTEGER,
    SNCode TEXT,
    ModuleCode TEXT,
    PortalName TEXT
);

CREATE TABLE IF NOT EXISTS Bills (
    BillID INTEGER PRIMARY KEY AUTOINCREMENT,
    BillName TEXT NOT NULL,
    BillType TEXT,
    Amount NUMERIC NOT NULL,
    DueDate TEXT NOT NULL,
    PartyID INTEGER,
    AccountID INTEGER,
    CategoryID INTEGER,
    Status TEXT DEFAULT 'Pending',
    IsPaid INTEGER DEFAULT 0,
    PaidDate TEXT,
    Notes TEXT,
    IsRecurring INTEGER DEFAULT 0,
    Frequency TEXT,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')),
    UserID INTEGER DEFAULT 1 NOT NULL,
    GlobalSerialNo INTEGER,
    SNCode TEXT,
    ModuleCode TEXT
);

CREATE TABLE IF NOT EXISTS Budgets (
    BudgetID INTEGER PRIMARY KEY AUTOINCREMENT,
    BudgetName TEXT NOT NULL,
    CategoryID INTEGER,
    BudgetMonth INTEGER NOT NULL,
    BudgetYear INTEGER NOT NULL,
    BudgetAmount NUMERIC NOT NULL,
    AlertPercent INTEGER DEFAULT 80,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')),
    UserID INTEGER DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS Categories (
    CategoryID INTEGER PRIMARY KEY AUTOINCREMENT,
    CategoryName TEXT NOT NULL,
    CategoryType TEXT NOT NULL,
    Icon TEXT DEFAULT 'tag',
    Color TEXT DEFAULT '#8b5cf6',
    ParentID INTEGER,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')),
    UserID INTEGER DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS ClientErrorLogs (
    ErrorID INTEGER PRIMARY KEY AUTOINCREMENT,
    UserID INTEGER,
    ErrorType TEXT NOT NULL,
    ErrorMessage TEXT NOT NULL,
    ErrorStack TEXT,
    Url TEXT,
    UserAgent TEXT,
    DeviceInfo TEXT,
    Resolved INTEGER DEFAULT 0,
    CreatedAt TEXT DEFAULT (date('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS CSCApplications (
    AppID INTEGER PRIMARY KEY AUTOINCREMENT,
    CustomerID INTEGER,
    CustomerName TEXT NOT NULL,
    CustomerPhone TEXT,
    CustomerAadhaar TEXT,
    ServiceType TEXT NOT NULL,
    ServiceSubtype TEXT,
    AckNumber TEXT,
    PortalName TEXT,
    ApplyDate TEXT DEFAULT (date('now', 'localtime')) NOT NULL,
    ExpectedDate TEXT,
    CompletionDate TEXT,
    GovtFee NUMERIC DEFAULT 0.00 NOT NULL,
    OperatorFee NUMERIC DEFAULT 0.00 NOT NULL,
    TotalFee NUMERIC DEFAULT 0.00 NOT NULL,
    PaidAmount NUMERIC DEFAULT 0.00 NOT NULL,
    DueAmount NUMERIC DEFAULT 0.00 NOT NULL,
    PaymentStatus TEXT DEFAULT 'Paid' NOT NULL,
    PaymentMode TEXT DEFAULT 'Cash' NOT NULL,
    Status TEXT DEFAULT 'Applied' NOT NULL,
    StatusRemarks TEXT,
    CertificateDocNo TEXT,
    CertificateFile TEXT,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')) NOT NULL,
    UpdatedAt TEXT DEFAULT (date('now', 'localtime')) NOT NULL,
    IsActive INTEGER DEFAULT 1 NOT NULL,
    DateOfBirth TEXT,
    UserID INTEGER DEFAULT 1 NOT NULL,
    GlobalSerialNo INTEGER,
    SNCode TEXT,
    ModuleCode TEXT,
    ExtraFieldsJson TEXT
);

CREATE TABLE IF NOT EXISTS TxnModules (
    ModuleID INTEGER PRIMARY KEY AUTOINCREMENT,
    ModuleCode TEXT NOT NULL,
    ModuleName TEXT NOT NULL,
    Prefix TEXT NOT NULL,
    TargetTable TEXT,
    PrimaryKeyColumn TEXT,
    IsCore INTEGER DEFAULT 1 NOT NULL,
    IsActive INTEGER DEFAULT 1 NOT NULL,
    DisplayOrder INTEGER DEFAULT 0 NOT NULL,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')) NOT NULL,
    UpdatedAt TEXT DEFAULT (date('now', 'localtime')) NOT NULL
);

CREATE TABLE IF NOT EXISTS CSCServices (
    ServiceID INTEGER PRIMARY KEY AUTOINCREMENT,
    ServiceName TEXT NOT NULL,
    GovtFee NUMERIC DEFAULT 0.00 NOT NULL,
    OperatorFee NUMERIC DEFAULT 50.00 NOT NULL,
    DefaultDays INTEGER DEFAULT 10 NOT NULL,
    Icon TEXT DEFAULT 'file-text',
    IsActive INTEGER DEFAULT 1 NOT NULL,
    SortOrder INTEGER DEFAULT 0 NOT NULL,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')) NOT NULL,
    UpdatedAt TEXT DEFAULT (date('now', 'localtime')) NOT NULL,
    UserID INTEGER DEFAULT 1 NOT NULL,
    Category TEXT DEFAULT 'General',
    ModuleCode TEXT DEFAULT 'CSC',
    CustomFieldsSchema TEXT
);

CREATE TABLE IF NOT EXISTS FieldDefinitions (
    FieldID INTEGER PRIMARY KEY AUTOINCREMENT,
    ServiceID INTEGER NOT NULL,
    FieldKey TEXT NOT NULL,
    FieldLabel TEXT NOT NULL,
    FieldType TEXT DEFAULT 'text' NOT NULL,
    FieldOptionsJson TEXT,
    DefaultValue TEXT,
    Placeholder TEXT,
    IsRequired INTEGER DEFAULT 0 NOT NULL,
    DisplayOrder INTEGER DEFAULT 0 NOT NULL,
    IsActive INTEGER DEFAULT 1 NOT NULL,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')) NOT NULL,
    UpdatedAt TEXT DEFAULT (date('now', 'localtime')) NOT NULL
);

CREATE TABLE IF NOT EXISTS ServiceRecords (
    RecordID INTEGER PRIMARY KEY AUTOINCREMENT,
    ModuleCode TEXT DEFAULT 'Service' NOT NULL,
    ServiceID INTEGER NOT NULL,
    CustomerID INTEGER NOT NULL,
    UserID INTEGER DEFAULT 1 NOT NULL,
    GovtFee NUMERIC DEFAULT 0.00 NOT NULL,
    OperatorFee NUMERIC DEFAULT 0.00 NOT NULL,
    TotalFee NUMERIC DEFAULT 0.00 NOT NULL,
    PaidAmount NUMERIC DEFAULT 0.00 NOT NULL,
    BalanceAmount NUMERIC DEFAULT 0.00 NOT NULL,
    RecordDate TEXT NOT NULL,
    CompletionDate TEXT,
    Status TEXT DEFAULT 'Pending' NOT NULL,
    PaymentStatus TEXT DEFAULT 'Unpaid' NOT NULL,
    PaymentMode TEXT DEFAULT 'Cash' NOT NULL,
    Remarks TEXT,
    ExtraFieldsJson TEXT,
    GlobalSerialNo INTEGER,
    SNCode TEXT,
    ModuleCodeSerial TEXT,
    IsActive INTEGER DEFAULT 1 NOT NULL,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')) NOT NULL,
    UpdatedAt TEXT DEFAULT (date('now', 'localtime')) NOT NULL
);

CREATE TABLE IF NOT EXISTS Customers (
    CustomerID INTEGER PRIMARY KEY AUTOINCREMENT,
    CustomerName TEXT NOT NULL,
    Phone TEXT,
    Email TEXT,
    Address TEXT,
    GSTIN TEXT,
    OpeningBalance NUMERIC DEFAULT 0 NOT NULL,
    CurrentBalance NUMERIC DEFAULT 0 NOT NULL,
    BalanceType TEXT DEFAULT 'ToReceive',
    CreditLimit NUMERIC DEFAULT 0,
    Notes TEXT,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (date('now', 'localtime')),
    ParentCustomerID INTEGER,
    FamilyID INTEGER,
    IsFamilyHead INTEGER DEFAULT 1 NOT NULL,
    Relationship TEXT DEFAULT 'Self' NOT NULL,
    KhataMode TEXT DEFAULT 'Separate' NOT NULL,
    FamilyName TEXT,
    AadhaarNumber TEXT,
    DateOfBirth TEXT,
    UserID INTEGER DEFAULT 1 NOT NULL,
    ExtraFieldsJson TEXT
);

CREATE TABLE IF NOT EXISTS Documents (
    DocumentID INTEGER PRIMARY KEY AUTOINCREMENT,
    CustomerID INTEGER,
    FileName TEXT NOT NULL,
    OriginalName TEXT NOT NULL,
    FileType TEXT,
    FileSize INTEGER DEFAULT 0,
    FilePath TEXT NOT NULL,
    UploadedBy TEXT DEFAULT 'shop',
    Description TEXT,
    IsArchived INTEGER DEFAULT 0,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (date('now', 'localtime')),
    EntityType TEXT,
    EntityID INTEGER,
    UserID INTEGER DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS InvoiceItems (
    ItemID INTEGER PRIMARY KEY AUTOINCREMENT,
    InvoiceID INTEGER NOT NULL,
    ItemName TEXT NOT NULL,
    Quantity NUMERIC DEFAULT 1 NOT NULL,
    Unit TEXT DEFAULT 'Pcs',
    UnitPrice NUMERIC DEFAULT 0 NOT NULL,
    TotalPrice NUMERIC DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS Invoices (
    InvoiceID INTEGER PRIMARY KEY AUTOINCREMENT,
    InvoiceNumber TEXT NOT NULL,
    CustomerID INTEGER NOT NULL,
    InvoiceDate TEXT DEFAULT (date('now', 'localtime')) NOT NULL,
    DueDate TEXT,
    SubTotal NUMERIC DEFAULT 0 NOT NULL,
    DiscountAmount NUMERIC DEFAULT 0 NOT NULL,
    TaxPercent NUMERIC DEFAULT 0,
    TaxAmount NUMERIC DEFAULT 0 NOT NULL,
    TotalAmount NUMERIC DEFAULT 0 NOT NULL,
    PaidAmount NUMERIC DEFAULT 0 NOT NULL,
    BalanceAmount NUMERIC DEFAULT 0 NOT NULL,
    PaymentStatus TEXT DEFAULT 'Unpaid' NOT NULL,
    PaymentMode TEXT DEFAULT 'Udhar',
    AccountID INTEGER,
    Notes TEXT,
    Terms TEXT,
    Status TEXT DEFAULT 'Active',
    CreatedAt TEXT DEFAULT (date('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (date('now', 'localtime')),
    UserID INTEGER DEFAULT 1 NOT NULL,
    GlobalSerialNo INTEGER,
    SNCode TEXT,
    ModuleCode TEXT
);

CREATE TABLE IF NOT EXISTS KhataEntries (
    KhataID INTEGER PRIMARY KEY AUTOINCREMENT,
    CustomerID INTEGER NOT NULL,
    EntryDate TEXT DEFAULT (date('now', 'localtime')) NOT NULL,
    EntryTime TEXT,
    EntryType TEXT NOT NULL,
    Amount NUMERIC NOT NULL,
    BalanceAfter NUMERIC,
    InvoiceID INTEGER,
    AccountID INTEGER,
    PaymentMode TEXT DEFAULT 'Cash',
    Description TEXT,
    ReferenceNo TEXT,
    Attachment TEXT,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (date('now', 'localtime')),
    CSCAppID INTEGER,
    BCID INTEGER,
    PaymentID INTEGER,
    SourceModule TEXT,
    SourceID INTEGER,
    UserID INTEGER DEFAULT 1 NOT NULL,
    GlobalSerialNo INTEGER,
    SNCode TEXT,
    ModuleCode TEXT
);

CREATE TABLE IF NOT EXISTS Parties (
    PartyID INTEGER PRIMARY KEY AUTOINCREMENT,
    PartyName TEXT NOT NULL,
    PartyType TEXT,
    Phone TEXT,
    Email TEXT,
    Address TEXT,
    OpeningBalance NUMERIC DEFAULT 0,
    CurrentBalance NUMERIC DEFAULT 0,
    Notes TEXT,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (date('now', 'localtime')),
    UserID INTEGER DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS RecurringTransactions (
    RecurringID INTEGER PRIMARY KEY AUTOINCREMENT,
    TransType TEXT NOT NULL,
    Amount NUMERIC NOT NULL,
    AccountID INTEGER,
    CategoryID INTEGER,
    PartyID INTEGER,
    Description TEXT,
    Frequency TEXT NOT NULL,
    StartDate TEXT NOT NULL,
    EndDate TEXT,
    NextDueDate TEXT NOT NULL,
    LastRunDate TEXT,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')),
    ToAccountID INTEGER,
    UpdatedAt TEXT DEFAULT (date('now', 'localtime')),
    UserID INTEGER DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS SchemaMigrations (
    MigrationID INTEGER PRIMARY KEY AUTOINCREMENT,
    MigrationName TEXT NOT NULL,
    AppliedAt TEXT DEFAULT (date('now', 'localtime')),
    Description TEXT
);

CREATE TABLE IF NOT EXISTS SystemSettings (
    SettingKey TEXT NOT NULL,
    SettingValue TEXT,
    SettingGroup TEXT DEFAULT 'General',
    Description TEXT,
    UpdatedAt TEXT DEFAULT (date('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS Transactions (
    TransactionID INTEGER PRIMARY KEY AUTOINCREMENT,
    TransDate TEXT DEFAULT (date('now', 'localtime')) NOT NULL,
    TransTime TEXT,
    TransType TEXT NOT NULL,
    Amount NUMERIC NOT NULL,
    AccountID INTEGER NOT NULL,
    ToAccountID INTEGER,
    CategoryID INTEGER,
    PartyID INTEGER,
    Description TEXT,
    Reference TEXT,
    Tags TEXT,
    IsRecurring INTEGER DEFAULT 0,
    RecurringID INTEGER,
    Attachment TEXT,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (date('now', 'localtime')),
    Metadata TEXT,
    UserID INTEGER DEFAULT 1 NOT NULL,
    IsDeleted INTEGER DEFAULT 0 NOT NULL,
    GlobalSerialNo INTEGER,
    SNCode TEXT,
    ModuleCode TEXT,
    SourceModule TEXT,
    SourceID INTEGER,
    LineType TEXT
);

CREATE TABLE IF NOT EXISTS UniversalTxnRegistry (
    GlobalSerialNo INTEGER PRIMARY KEY AUTOINCREMENT,
    SNCode TEXT,
    SourceModule TEXT NOT NULL,
    RecordID INTEGER NOT NULL,
    ModuleSerialNo INTEGER,
    ModuleCode TEXT,
    EntityName TEXT,
    Amount NUMERIC,
    TransDate TEXT NOT NULL,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')) NOT NULL,
    UserID INTEGER DEFAULT 1 NOT NULL,
    IsActive INTEGER DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS Users (
    UserID INTEGER PRIMARY KEY AUTOINCREMENT,
    Username TEXT NOT NULL,
    PasswordHash TEXT NOT NULL,
    ShopName TEXT NOT NULL,
    OwnerName TEXT NOT NULL,
    MobileNumber TEXT,
    Role TEXT DEFAULT 'User' NOT NULL,
    IsActive INTEGER DEFAULT 1 NOT NULL,
    ApiToken TEXT,
    SettingsJson TEXT,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')) NOT NULL,
    UpdatedAt TEXT DEFAULT (date('now', 'localtime')) NOT NULL,
    ActiveSessionToken TEXT,
    LastLoginAt TEXT,
    LastLoginDevice TEXT
);

CREATE TABLE IF NOT EXISTS AppLicenses (
    LicenseID INTEGER PRIMARY KEY AUTOINCREMENT,
    LicenseKey TEXT NOT NULL,
    CustomerShopName TEXT,
    OwnerName TEXT,
    MobileNumber TEXT,
    HardwareID TEXT,
    LicenseType TEXT DEFAULT 'Lifetime' NOT NULL,
    ActivationDate TEXT DEFAULT (date('now', 'localtime')),
    ExpiryDate TEXT,
    MaxDevices INTEGER DEFAULT 1 NOT NULL,
    IsActive INTEGER DEFAULT 1 NOT NULL,
    Notes TEXT,
    CreatedAt TEXT DEFAULT (date('now', 'localtime')) NOT NULL,
    UpdatedAt TEXT DEFAULT (date('now', 'localtime')) NOT NULL
);

CREATE TABLE IF NOT EXISTS BillPayments (
    PaymentID INTEGER PRIMARY KEY AUTOINCREMENT,
    CustomerID INTEGER NULL,
    CustomerName TEXT NOT NULL,
    CustomerPhone TEXT NULL,
    CustomerAadhaar TEXT NULL,
    BillCategory TEXT NOT NULL,
    ProviderName TEXT NULL,
    ConsumerNumber TEXT NULL,
    BillNumber TEXT NULL,
    BillDate TEXT NULL,
    DueDate TEXT NULL,
    TotalBillAmount NUMERIC DEFAULT 0,
    BillAmount NUMERIC DEFAULT 0,
    CustomerCharge NUMERIC DEFAULT 0,
    TotalCollected NUMERIC DEFAULT 0,
    CustomerDue NUMERIC DEFAULT 0,
    CommissionEarned NUMERIC DEFAULT 0,
    NetProfit NUMERIC DEFAULT 0,
    RemainingArrear NUMERIC DEFAULT 0,
    PaymentMode TEXT NULL,
    WalletAccountID INTEGER NULL,
    CashAccountID INTEGER NULL,
    Status TEXT NULL,
    TxnReference TEXT NULL,
    PaymentDate TEXT DEFAULT (date('now', 'localtime')),
    PaymentTime TEXT NULL,
    Notes TEXT NULL,
    ExtraFieldsJson TEXT NULL,
    IsActive INTEGER DEFAULT 1,
    IsDeleted INTEGER DEFAULT 0,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1,
    GlobalSerialNo INTEGER NULL,
    SNCode TEXT NULL,
    ModuleCode TEXT NULL
);

CREATE TABLE IF NOT EXISTS UCLUpdates (
    UpdateID INTEGER PRIMARY KEY AUTOINCREMENT,
    AadhaarNumber TEXT NULL,
    ResidentName TEXT NOT NULL,
    MobileNumber TEXT NULL,
    UpdateType TEXT NOT NULL,
    OperatorID TEXT NULL,
    StationID TEXT NULL,
    UpdateDate TEXT DEFAULT (date('now', 'localtime')),
    FeeCharged NUMERIC DEFAULT 50,
    CommissionEarned NUMERIC DEFAULT 0,
    OperatorCost NUMERIC DEFAULT 0,
    Status TEXT DEFAULT 'Success',
    Remarks TEXT NULL,
    CashAccountID INTEGER NULL,
    UserID INTEGER NOT NULL DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS PACEntries (
    PACID INTEGER PRIMARY KEY AUTOINCREMENT,
    PACCode TEXT NOT NULL,
    OperatorName TEXT NOT NULL,
    OperatorMobile TEXT NULL,
    StationID TEXT NULL,
    IssueDate TEXT DEFAULT (date('now', 'localtime')),
    ValidUntil TEXT NULL,
    FeeCharged NUMERIC DEFAULT 0,
    CommissionEarned NUMERIC DEFAULT 0,
    Status TEXT DEFAULT 'Active',
    Remarks TEXT NULL,
    CashAccountID INTEGER NULL,
    UserID INTEGER NOT NULL DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS ApiIdempotencyRequests (
    UserID INTEGER NOT NULL,
    RequestKey TEXT NOT NULL,
    RequestHash TEXT NOT NULL,
    State TEXT NOT NULL,
    StatusCode INTEGER NULL,
    ResponseBody TEXT NULL,
    ResponseHeaders TEXT NULL,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    CompletedAt TEXT NULL,
    ExpiresAt TEXT NOT NULL
);

-- ============================================================================
-- Essential Performance Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS IX_Accounts_User ON Accounts (UserID, IsActive);
CREATE INDEX IF NOT EXISTS IX_Customers_User ON Customers (UserID, IsActive);
CREATE INDEX IF NOT EXISTS IX_Customers_Phone ON Customers (Phone, UserID);
CREATE INDEX IF NOT EXISTS IX_Parties_User ON Parties (UserID, IsActive);
CREATE INDEX IF NOT EXISTS IX_Transactions_User_Date ON Transactions (UserID, TransDate, IsDeleted);
CREATE INDEX IF NOT EXISTS IX_Transactions_Account ON Transactions (AccountID, IsDeleted);
CREATE INDEX IF NOT EXISTS IX_KhataEntries_Customer ON KhataEntries (CustomerID, EntryDate);
CREATE INDEX IF NOT EXISTS IX_BCTransactions_Date ON BCTransactions (TransDate, Status);
CREATE INDEX IF NOT EXISTS IX_CSCApplications_Date ON CSCApplications (ApplyDate, Status);
CREATE INDEX IF NOT EXISTS IX_UniversalTxn_SN ON UniversalTxnRegistry (GlobalSerialNo);
CREATE INDEX IF NOT EXISTS IX_UniversalTxn_Module ON UniversalTxnRegistry (SourceModule, RecordID);