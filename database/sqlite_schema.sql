-- =========================================================================
-- CASH MANAGEMENT SYSTEM - SQLITE COMPLETE DATABASE SCHEMA
-- 100% Pure Embedded Zero-Install SQLite Edition
-- Compatible with all core accounting invariants & full app functionality
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
    CustomerID INTEGER NULL,
    TransDate TEXT DEFAULT (date('now', 'localtime')),
    TransTime TEXT DEFAULT (time('now', 'localtime')),
    ServiceType TEXT NOT NULL,
    CustomerName TEXT NOT NULL,
    CustomerPhone TEXT NULL,
    CustomerAadhaarLast4 TEXT NULL,
    DateOfBirth TEXT NULL,
    BankName TEXT NULL,
    AccountNumber TEXT NULL,
    IFSC TEXT NULL,
    BeneficiaryName TEXT NULL,
    Amount NUMERIC NOT NULL DEFAULT 0,
    CommissionEarned NUMERIC DEFAULT 0,
    CustomerCharge NUMERIC DEFAULT 0,
    NetProfit NUMERIC DEFAULT 0,
    CashAccountID INTEGER NULL,
    PortalAccountID INTEGER NULL,
    PortalName TEXT NULL,
    QRProvider TEXT NULL,
    QROperation TEXT NULL,
    RRN TEXT NULL,
    RRN_UTR TEXT NULL,
    Status TEXT DEFAULT 'Success',
    Remarks TEXT NULL,
    Notes TEXT NULL,
    AccountBalance NUMERIC NULL,
    Metadata TEXT NULL,
    GlobalSerialNo INTEGER NULL,
    SNCode TEXT NULL,
    ModuleCode TEXT NULL,
    ChargesMethod TEXT DEFAULT 'CASH',
    UniversalSN INTEGER NULL,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1
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
    ParentID INTEGER NULL,
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
    AppID INTEGER GENERATED ALWAYS AS (ApplicationID) VIRTUAL,
    CustomerID INTEGER NULL,
    CustomerName TEXT NOT NULL,
    CustomerPhone TEXT NULL,
    CustomerAadhaar TEXT NULL,
    DateOfBirth TEXT NULL,
    ServiceID INTEGER NULL,
    ServiceName TEXT NULL,
    ServiceType TEXT NULL,
    ServiceSubtype TEXT NULL,
    AckNumber TEXT NULL,
    PortalName TEXT NULL,
    ApplyDate TEXT DEFAULT (date('now', 'localtime')),
    ExpectedDate TEXT NULL,
    GovtFee NUMERIC DEFAULT 0,
    OperatorFee NUMERIC DEFAULT 0,
    TotalFee NUMERIC NOT NULL DEFAULT 0,
    PaidAmount NUMERIC DEFAULT 0,
    DueAmount NUMERIC DEFAULT 0,
    CommissionEarned NUMERIC DEFAULT 0,
    NetProfit NUMERIC DEFAULT 0,
    PaymentStatus TEXT DEFAULT 'Pending',
    PaymentMode TEXT DEFAULT 'Cash',
    ApplicationStatus TEXT DEFAULT 'Submitted',
    Status TEXT DEFAULT 'Submitted',
    StatusRemarks TEXT NULL,
    CertificateDocNo TEXT NULL,
    RefNumber TEXT NULL,
    AcknowledgementPath TEXT NULL,
    Remarks TEXT NULL,
    Notes TEXT NULL,
    ExtraFieldsJson TEXT NULL,
    AppDate TEXT DEFAULT (date('now', 'localtime')),
    AppTime TEXT DEFAULT (time('now', 'localtime')),
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1,
    UniversalSN INTEGER NULL,
    AccountID INTEGER NULL,
    WalletAccountID INTEGER NULL,
    CashAccountID INTEGER NULL,
    TargetAccountID INTEGER NULL,
    DeliveryDate TEXT NULL,
    GlobalSerialNo INTEGER NULL,
    SNCode TEXT NULL,
    ModuleCode TEXT NULL,
    IsActive INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS TxnModules (
    ModuleCode TEXT PRIMARY KEY,
    ModuleName TEXT NOT NULL,
    TableName TEXT NOT NULL,
    PkColumn TEXT NOT NULL,
    SnColumn TEXT NOT NULL DEFAULT 'UniversalSN',
    Prefix TEXT NULL,
    TargetTable TEXT NULL,
    PrimaryKeyColumn TEXT NULL,
    IsCore INTEGER DEFAULT 1,
    DisplayOrder INTEGER DEFAULT 1,
    DocPrefix TEXT NULL,
    RecordTable TEXT NULL,
    IsLedgerLinked INTEGER DEFAULT 1,
    Icon TEXT DEFAULT 'layers',
    Color TEXT DEFAULT '#4f46e5',
    SortOrder INTEGER DEFAULT 1,
    UserID INTEGER DEFAULT 1,
    IsActive INTEGER NOT NULL DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS CSCServices (
    ServiceID INTEGER PRIMARY KEY AUTOINCREMENT,
    ServiceName TEXT NOT NULL,
    ModuleCode TEXT NULL,
    Category TEXT NULL,
    GovtFee NUMERIC DEFAULT 0,
    OperatorFee NUMERIC DEFAULT 0,
    DefaultDays INTEGER DEFAULT 7,
    CustomFieldsSchema TEXT NULL,
    Icon TEXT DEFAULT 'file-text',
    IsActive INTEGER DEFAULT 1,
    SortOrder INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS FieldDefinitions (
    FieldID INTEGER PRIMARY KEY AUTOINCREMENT,
    ServiceID INTEGER NOT NULL,
    ModuleCode TEXT NULL,
    FieldName TEXT NOT NULL,
    FieldLabel TEXT NOT NULL,
    FieldType TEXT DEFAULT 'text',
    DataType TEXT DEFAULT 'text',
    Label TEXT NULL,
    IsRequired INTEGER DEFAULT 0,
    OptionsList TEXT NULL,
    OptionsJson TEXT NULL,
    MaxLength INTEGER NULL,
    ShowInList INTEGER DEFAULT 1,
    SortOrder INTEGER DEFAULT 1,
    DisplayOrder INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS ServiceRecords (
    RecordID INTEGER PRIMARY KEY AUTOINCREMENT,
    ServiceID INTEGER NULL,
    ModuleCode TEXT NULL,
    ServiceName TEXT NULL,
    CustomerID INTEGER NULL,
    CustomerName TEXT NOT NULL,
    CustomerPhone TEXT NULL,
    RecordDate TEXT DEFAULT (date('now', 'localtime')),
    RecordTime TEXT DEFAULT (time('now', 'localtime')),
    GovtFee NUMERIC DEFAULT 0,
    OperatorFee NUMERIC DEFAULT 0,
    TotalFee NUMERIC NOT NULL DEFAULT 0,
    Amount NUMERIC DEFAULT 0,
    Charge NUMERIC DEFAULT 0,
    TotalAmount NUMERIC DEFAULT 0,
    PaidAmount NUMERIC DEFAULT 0,
    DueAmount NUMERIC DEFAULT 0,
    BalanceAmount NUMERIC DEFAULT 0,
    CommissionEarned NUMERIC DEFAULT 0,
    NetProfit NUMERIC DEFAULT 0,
    RefNumber TEXT NULL,
    ReferenceNo TEXT NULL,
    FieldData TEXT NULL,
    PaymentStatus TEXT DEFAULT 'Paid',
    PaymentMode TEXT DEFAULT 'Cash',
    AccountID INTEGER NULL,
    CashAccountID INTEGER NULL,
    Remarks TEXT NULL,
    Status TEXT DEFAULT 'Completed',
    CompletionDate TEXT NULL,
    GlobalSerialNo INTEGER NULL,
    SNCode TEXT NULL,
    DocCode TEXT NULL,
    ModuleCodeSerial INTEGER NULL,
    ExtraFieldsJson TEXT NULL,
    IsActive INTEGER DEFAULT 1,
    IsDeleted INTEGER DEFAULT 0,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1,
    UniversalSN INTEGER NULL
);

CREATE TABLE IF NOT EXISTS Customers (
    CustomerID INTEGER PRIMARY KEY AUTOINCREMENT,
    CustomerName TEXT NOT NULL,
    Phone TEXT NULL,
    Email TEXT NULL,
    Address TEXT NULL,
    AadhaarNumber TEXT NULL,
    AadhaarLast4 TEXT NULL,
    GSTIN TEXT NULL,
    DateOfBirth TEXT NULL,
    ParentCustomerID INTEGER NULL,
    FamilyID INTEGER NULL,
    FamilyName TEXT NULL,
    Relationship TEXT NULL,
    IsFamilyHead INTEGER DEFAULT 0,
    KhataMode TEXT DEFAULT 'Individual',
    OpeningBalance NUMERIC DEFAULT 0,
    CurrentBalance NUMERIC DEFAULT 0,
    BalanceType TEXT DEFAULT 'Settled',
    CreditLimit NUMERIC DEFAULT 0,
    TotalTransactions INTEGER DEFAULT 0,
    TotalVolume NUMERIC DEFAULT 0,
    TotalCommission NUMERIC DEFAULT 0,
    Notes TEXT NULL,
    ExtraFieldsJson TEXT NULL,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS BillPayments (
    PaymentID INTEGER PRIMARY KEY AUTOINCREMENT,
    CustomerID INTEGER NULL,
    CustomerName TEXT NULL,
    CustomerPhone TEXT NULL,
    CustomerAadhaar TEXT NULL,
    BillerName TEXT NULL,
    BillerCategory TEXT NULL,
    BillCategory TEXT NULL,
    ProviderName TEXT NULL,
    ConsumerNumber TEXT NOT NULL,
    ConsumerName TEXT NULL,
    BillNumber TEXT NULL,
    BillDate TEXT NULL,
    DueDate TEXT NULL,
    BillDueDate TEXT NULL,
    TotalBillAmount NUMERIC DEFAULT 0,
    BillAmount NUMERIC NOT NULL DEFAULT 0,
    CustomerCharge NUMERIC DEFAULT 0,
    TotalCollected NUMERIC NOT NULL DEFAULT 0,
    CustomerDue NUMERIC DEFAULT 0,
    CommissionEarned NUMERIC DEFAULT 0,
    NetCommission NUMERIC DEFAULT 0,
    NetProfit NUMERIC DEFAULT 0,
    RemainingArrear NUMERIC DEFAULT 0,
    PaymentMode TEXT DEFAULT 'Cash',
    PaymentDate TEXT DEFAULT (date('now', 'localtime')),
    PaymentTime TEXT DEFAULT (time('now', 'localtime')),
    WalletAccountID INTEGER NULL,
    CashAccountID INTEGER NULL,
    TxnReference TEXT NOT NULL,
    SubCategory TEXT NULL,
    VibhagCode TEXT NULL,
    DiscomCode TEXT NULL,
    Notes TEXT NULL,
    ExtraFieldsJson TEXT NULL,
    Status TEXT DEFAULT 'SUCCESS',
    UniversalSN INTEGER NULL,
    GlobalSerialNo INTEGER NULL,
    SNCode TEXT NULL,
    ModuleCode TEXT NULL,
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
    Status TEXT DEFAULT 'Active',
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
    CSCAppID INTEGER NULL,
    InvoiceID INTEGER NULL,
    GlobalSerialNo INTEGER NULL,
    SNCode TEXT NULL,
    ModuleCode TEXT NULL,
    SourceModule TEXT NULL,
    SourceID INTEGER NULL,
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
    TransactionID INTEGER GENERATED ALWAYS AS (TransID) VIRTUAL,
    TransDate TEXT DEFAULT (date('now', 'localtime')),
    TransTime TEXT DEFAULT (time('now', 'localtime')),
    TransType TEXT NOT NULL,
    Amount NUMERIC NOT NULL,
    AccountID INTEGER NOT NULL,
    ToAccountID INTEGER NULL,
    CategoryID INTEGER NULL,
    PartyID INTEGER NULL,
    CustomerID INTEGER NULL,
    Reference TEXT NULL,
    ReferenceNo TEXT NULL,
    Description TEXT NULL,
    Tags TEXT NULL,
    PaymentMode TEXT DEFAULT 'Cash',
    Status TEXT DEFAULT 'Cleared',
    IsDeleted INTEGER DEFAULT 0,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1,
    UniversalSN INTEGER NULL,
    GlobalSerialNo INTEGER NULL,
    SNCode TEXT NULL,
    ModuleCode TEXT NULL,
    SourceModule TEXT NULL,
    SourceID INTEGER NULL,
    LineType TEXT NULL
);

CREATE TABLE IF NOT EXISTS UniversalTxnRegistry (
    GlobalSerialNo INTEGER PRIMARY KEY AUTOINCREMENT,
    UniversalSN INTEGER GENERATED ALWAYS AS (GlobalSerialNo) VIRTUAL,
    SNCode TEXT GENERATED ALWAYS AS ('TXN-' || printf('%06d', GlobalSerialNo)) VIRTUAL,
    SourceModule TEXT NOT NULL,
    RecordID INTEGER NULL,
    SourceID INTEGER NULL,
    SourceTable TEXT NULL,
    SourcePkColumn TEXT NULL,
    ModuleSerialNo INTEGER DEFAULT 1,
    ModuleCode TEXT NULL,
    EntityName TEXT NULL,
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
    TransDate TEXT NULL,
    TxnDate TEXT NULL,
    TxnTime TEXT NULL,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UserID INTEGER NOT NULL DEFAULT 1
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

CREATE TABLE IF NOT EXISTS UCLUpdates (
    UCLID INTEGER PRIMARY KEY AUTOINCREMENT,
    UserID INTEGER NOT NULL DEFAULT 1,
    SerialNo INTEGER NULL,
    CustomerID INTEGER NULL,
    CustomerName TEXT NOT NULL,
    CustomerPhone TEXT NULL,
    AadhaarLast4 TEXT NULL,
    AadhaarMasked TEXT NULL,
    SID TEXT NULL,
    UpdateType TEXT NULL,
    PACCode TEXT NULL,
    BiometricsUpdate INTEGER DEFAULT 0,
    UpdateDate TEXT DEFAULT (date('now', 'localtime')),
    TotalFee NUMERIC DEFAULT 0,
    OperatorFee NUMERIC DEFAULT 0,
    TotalAmount NUMERIC DEFAULT 0,
    PaidAmount NUMERIC DEFAULT 0,
    BalanceAmount NUMERIC DEFAULT 0,
    PaymentMode TEXT DEFAULT 'Cash',
    AccountID INTEGER NULL,
    Status TEXT DEFAULT 'Completed',
    ReceiptDocumentID INTEGER NULL,
    ReceiptPath TEXT NULL,
    Notes TEXT NULL,
    IsActive INTEGER DEFAULT 1,
    IsDeleted INTEGER DEFAULT 0,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS PACEntries (
    PACID INTEGER PRIMARY KEY AUTOINCREMENT,
    UserID INTEGER NOT NULL DEFAULT 1,
    PACCode TEXT NOT NULL,
    OperatorID TEXT NULL,
    WalletDeduction NUMERIC DEFAULT 0,
    GenerationDate TEXT DEFAULT (date('now', 'localtime')),
    ExpiryDate TEXT NULL,
    Status TEXT DEFAULT 'Available',
    Notes TEXT NULL,
    IsActive INTEGER DEFAULT 1,
    IsDeleted INTEGER DEFAULT 0,
    CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UpdatedAt TEXT DEFAULT (datetime('now', 'localtime'))
);

-- Essential Performance Indexes
CREATE INDEX IF NOT EXISTS IX_Transactions_Date ON Transactions(TransDate);
CREATE INDEX IF NOT EXISTS IX_Transactions_AccountID ON Transactions(AccountID);
CREATE INDEX IF NOT EXISTS IX_Transactions_Source ON Transactions(SourceModule, SourceID, LineType);
CREATE INDEX IF NOT EXISTS IX_UniversalTxnRegistry_Date ON UniversalTxnRegistry(TxnDate);
CREATE INDEX IF NOT EXISTS IX_KhataEntries_CustomerID ON KhataEntries(CustomerID);
CREATE INDEX IF NOT EXISTS IX_BillPayments_TxnRef ON BillPayments(TxnReference);
CREATE INDEX IF NOT EXISTS IX_BCTransactions_Date ON BCTransactions(TransDate);
CREATE INDEX IF NOT EXISTS IX_UCLUpdates_Date ON UCLUpdates(UpdateDate);
CREATE INDEX IF NOT EXISTS IX_PACEntries_Status ON PACEntries(Status);
