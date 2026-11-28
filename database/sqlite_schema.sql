-- ============================================================================
-- CSC & BC Apna Hisaab - 100% Faithful SQLite Schema (Generated from SQL Server)
-- 30 Tables with exact Column & Type Parity
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Accounts" (
    "AccountID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "AccountName" TEXT,
    "AccountType" TEXT,
    "BankName" TEXT,
    "AccountNumber" TEXT,
    "OpeningBalance" NUMERIC DEFAULT 0,
    "CurrentBalance" NUMERIC DEFAULT 0,
    "Currency" TEXT DEFAULT 'INR',
    "IsActive" INTEGER DEFAULT 1,
    "Color" TEXT DEFAULT '#6366f1',
    "Icon" TEXT DEFAULT 'wallet',
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UserID" INTEGER DEFAULT 1,
    "CreatedByUserID" INTEGER DEFAULT NULL,
    "CreatedByName" TEXT DEFAULT NULL,
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "ApiIdempotencyRequests" (
    "UserID" INTEGER,
    "RequestKey" TEXT,
    "RequestHash" TEXT,
    "State" TEXT,
    "HttpStatus" INTEGER,
    "ResponseBody" TEXT,
    "CreatedAt" TEXT,
    "CompletedAt" TEXT,
    PRIMARY KEY ("RequestKey", "UserID")
);

CREATE TABLE IF NOT EXISTS "AppLicenses" (
    "LicenseID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "LicenseKey" TEXT,
    "CustomerShopName" TEXT,
    "OwnerName" TEXT,
    "MobileNumber" TEXT,
    "HardwareID" TEXT,
    "LicenseType" TEXT DEFAULT 'Lifetime',
    "ActivationDate" TEXT DEFAULT (datetime('now', 'localtime')),
    "ExpiryDate" TEXT,
    "MaxDevices" INTEGER DEFAULT 1,
    "IsActive" INTEGER DEFAULT 1,
    "Notes" TEXT,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS "AuditLogs" (
    "LogID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "Action" TEXT,
    "TableName" TEXT,
    "RecordID" INTEGER,
    "Details" TEXT,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "Module" TEXT,
    "Description" TEXT,
    "EntityName" TEXT,
    "Amount" NUMERIC,
    "OldData" TEXT,
    "NewData" TEXT,
    "UserID" INTEGER DEFAULT 1,
    "CreatedByUserID" INTEGER DEFAULT NULL,
    "CreatedByName" TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS "BCCounterSessions" (
    "SessionID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "SessionDate" TEXT DEFAULT (datetime('now', 'localtime')),
    "OpeningCash" NUMERIC DEFAULT 0,
    "Note500" INTEGER DEFAULT 0,
    "Note200" INTEGER DEFAULT 0,
    "Note100" INTEGER DEFAULT 0,
    "Note50" INTEGER DEFAULT 0,
    "Note20" INTEGER DEFAULT 0,
    "Note10" INTEGER DEFAULT 0,
    "Coins" NUMERIC DEFAULT 0,
    "ActualClosingCash" NUMERIC DEFAULT 0,
    "ExpectedClosingCash" NUMERIC DEFAULT 0,
    "CashDifference" NUMERIC DEFAULT 0,
    "Status" TEXT DEFAULT 'Open',
    "Notes" TEXT,
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UserID" INTEGER DEFAULT 1,
    "CreatedByUserID" INTEGER DEFAULT NULL,
    "CreatedByName" TEXT DEFAULT NULL,
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "BCTransactions" (
    "BCID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "TransDate" TEXT DEFAULT (datetime('now', 'localtime')),
    "TransTime" TEXT DEFAULT (datetime('now', 'localtime')),
    "ServiceType" TEXT,
    "CustomerName" TEXT,
    "CustomerPhone" TEXT,
    "CustomerAadhaarLast4" TEXT,
    "BankName" TEXT,
    "AccountNumber" TEXT,
    "IFSC" TEXT,
    "BeneficiaryName" TEXT,
    "Amount" NUMERIC,
    "CommissionEarned" NUMERIC DEFAULT 0,
    "CustomerCharge" NUMERIC DEFAULT 0,
    "NetProfit" NUMERIC DEFAULT 0,
    "CashAccountID" INTEGER,
    "PortalAccountID" INTEGER,
    "QRProvider" TEXT,
    "QROperation" TEXT DEFAULT 'Cash Given to Customer',
    "RRN_UTR" TEXT,
    "Status" TEXT DEFAULT 'Success',
    "Notes" TEXT,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "Metadata" TEXT,
    "CustomerID" INTEGER,
    "AccountBalance" NUMERIC,
    "DateOfBirth" TEXT,
    "UserID" INTEGER DEFAULT 1,
    "GlobalSerialNo" INTEGER,
    "SNCode" TEXT,
    "ModuleCode" TEXT,
    "PortalName" TEXT,
    "CreatedByUserID" INTEGER DEFAULT NULL,
    "CreatedByName" TEXT DEFAULT NULL,
    FOREIGN KEY ("CashAccountID") REFERENCES "Accounts" ("AccountID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("PortalAccountID") REFERENCES "Accounts" ("AccountID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("CustomerID") REFERENCES "Customers" ("CustomerID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "BillPayments" (
    "PaymentID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "CustomerID" INTEGER,
    "CustomerName" TEXT,
    "CustomerPhone" TEXT,
    "CustomerAadhaar" TEXT,
    "BillCategory" TEXT DEFAULT 'Electricity',
    "ProviderName" TEXT,
    "ConsumerNumber" TEXT,
    "BillNumber" TEXT,
    "BillDate" TEXT,
    "DueDate" TEXT,
    "BillAmount" NUMERIC DEFAULT 0,
    "CustomerCharge" NUMERIC DEFAULT 10,
    "TotalCollected" NUMERIC DEFAULT 0,
    "CommissionEarned" NUMERIC DEFAULT 0,
    "NetProfit" NUMERIC DEFAULT 0,
    "RemainingArrear" NUMERIC DEFAULT 0,
    "PaymentMode" TEXT DEFAULT 'Cash',
    "WalletAccountID" INTEGER,
    "CashAccountID" INTEGER DEFAULT 1,
    "Status" TEXT DEFAULT 'Success',
    "TxnReference" TEXT,
    "PaymentDate" TEXT DEFAULT (datetime('now', 'localtime')),
    "PaymentTime" TEXT,
    "Notes" TEXT,
    "GlobalSerialNo" INTEGER,
    "SNCode" TEXT,
    "ModuleCode" TEXT,
    "UserID" INTEGER DEFAULT 1,
    "IsActive" INTEGER DEFAULT 1,
    "IsDeleted" INTEGER DEFAULT 0,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "TotalBillAmount" NUMERIC DEFAULT 0,
    "CustomerDue" NUMERIC DEFAULT 0,
    "ExtraFieldsJson" TEXT,
    "CreatedByUserID" INTEGER DEFAULT NULL,
    "CreatedByName" TEXT DEFAULT NULL,
    FOREIGN KEY ("CustomerID") REFERENCES "Customers" ("CustomerID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "Bills" (
    "BillID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "BillName" TEXT,
    "BillType" TEXT,
    "Amount" NUMERIC,
    "DueDate" TEXT,
    "PartyID" INTEGER,
    "AccountID" INTEGER,
    "CategoryID" INTEGER,
    "Status" TEXT DEFAULT 'Pending',
    "IsPaid" INTEGER DEFAULT 0,
    "PaidDate" TEXT,
    "Notes" TEXT,
    "IsRecurring" INTEGER DEFAULT 0,
    "Frequency" TEXT,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UserID" INTEGER DEFAULT 1,
    "GlobalSerialNo" INTEGER,
    "SNCode" TEXT,
    "ModuleCode" TEXT,
    "CreatedByUserID" INTEGER DEFAULT NULL,
    "CreatedByName" TEXT DEFAULT NULL,
    FOREIGN KEY ("AccountID") REFERENCES "Accounts" ("AccountID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("CategoryID") REFERENCES "Categories" ("CategoryID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("PartyID") REFERENCES "Parties" ("PartyID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "Budgets" (
    "BudgetID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "BudgetName" TEXT,
    "CategoryID" INTEGER,
    "BudgetMonth" INTEGER,
    "BudgetYear" INTEGER,
    "BudgetAmount" NUMERIC,
    "AlertPercent" INTEGER DEFAULT 80,
    "IsActive" INTEGER DEFAULT 1,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UserID" INTEGER DEFAULT 1,
    FOREIGN KEY ("CategoryID") REFERENCES "Categories" ("CategoryID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "Categories" (
    "CategoryID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "CategoryName" TEXT,
    "CategoryType" TEXT,
    "Icon" TEXT DEFAULT 'tag',
    "Color" TEXT DEFAULT '#8b5cf6',
    "ParentID" INTEGER,
    "IsActive" INTEGER DEFAULT 1,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UserID" INTEGER DEFAULT 1,
    FOREIGN KEY ("ParentID") REFERENCES "Categories" ("CategoryID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "ClientErrorLogs" (
    "ErrorID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "UserID" INTEGER,
    "ErrorType" TEXT,
    "ErrorMessage" TEXT,
    "ErrorStack" TEXT,
    "Url" TEXT,
    "UserAgent" TEXT,
    "DeviceInfo" TEXT,
    "Resolved" INTEGER DEFAULT 0,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "CSCApplications" (
    "AppID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "CustomerID" INTEGER,
    "CustomerName" TEXT,
    "CustomerPhone" TEXT,
    "CustomerAadhaar" TEXT,
    "ServiceType" TEXT,
    "ServiceSubtype" TEXT,
    "AckNumber" TEXT,
    "PortalName" TEXT,
    "ApplyDate" TEXT DEFAULT (datetime('now', 'localtime')),
    "ExpectedDate" TEXT,
    "CompletionDate" TEXT,
    "GovtFee" NUMERIC DEFAULT 0.00,
    "OperatorFee" NUMERIC DEFAULT 0.00,
    "TotalFee" NUMERIC DEFAULT 0.00,
    "PaidAmount" NUMERIC DEFAULT 0.00,
    "DueAmount" NUMERIC DEFAULT 0.00,
    "PaymentStatus" TEXT DEFAULT 'Paid',
    "PaymentMode" TEXT DEFAULT 'Cash',
    "Status" TEXT DEFAULT 'Applied',
    "StatusRemarks" TEXT,
    "CertificateDocNo" TEXT,
    "CertificateFile" TEXT,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "IsActive" INTEGER DEFAULT 1,
    "DateOfBirth" TEXT,
    "UserID" INTEGER DEFAULT 1,
    "GlobalSerialNo" INTEGER,
    "SNCode" TEXT,
    "ModuleCode" TEXT,
    "ExtraFieldsJson" TEXT,
    "CreatedByUserID" INTEGER DEFAULT NULL,
    "CreatedByName" TEXT DEFAULT NULL,
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "CSCServices" (
    "ServiceID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "ServiceName" TEXT,
    "GovtFee" NUMERIC DEFAULT 0.00,
    "OperatorFee" NUMERIC DEFAULT 50.00,
    "DefaultDays" INTEGER DEFAULT 10,
    "Icon" TEXT DEFAULT 'file-text',
    "IsActive" INTEGER DEFAULT 1,
    "SortOrder" INTEGER DEFAULT 0,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UserID" INTEGER DEFAULT 1,
    "CustomFieldsSchema" TEXT,
    "Category" TEXT DEFAULT 'General',
    "ModuleCode" TEXT DEFAULT 'CSC',
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "Customers" (
    "CustomerID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "CustomerName" TEXT,
    "Phone" TEXT,
    "Email" TEXT,
    "Address" TEXT,
    "GSTIN" TEXT,
    "OpeningBalance" NUMERIC DEFAULT 0,
    "CurrentBalance" NUMERIC DEFAULT 0,
    "BalanceType" TEXT DEFAULT 'ToReceive',
    "CreditLimit" NUMERIC DEFAULT 0,
    "Notes" TEXT,
    "IsActive" INTEGER DEFAULT 1,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "ParentCustomerID" INTEGER,
    "FamilyID" INTEGER,
    "IsFamilyHead" INTEGER DEFAULT 1,
    "Relationship" TEXT DEFAULT 'Self',
    "KhataMode" TEXT DEFAULT 'Separate',
    "FamilyName" TEXT,
    "AadhaarNumber" TEXT,
    "DateOfBirth" TEXT,
    "UserID" INTEGER DEFAULT 1,
    "ExtraFieldsJson" TEXT,
    "TotalTransactions" INTEGER DEFAULT 0,
    "TotalVolume" NUMERIC DEFAULT 0,
    "CreatedByUserID" INTEGER DEFAULT NULL,
    "CreatedByName" TEXT DEFAULT NULL,
    FOREIGN KEY ("ParentCustomerID") REFERENCES "Customers" ("CustomerID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "Documents" (
    "DocumentID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "CustomerID" INTEGER,
    "FileName" TEXT,
    "OriginalName" TEXT,
    "FileType" TEXT,
    "FileSize" INTEGER DEFAULT 0,
    "FilePath" TEXT,
    "UploadedBy" TEXT DEFAULT 'shop',
    "Description" TEXT,
    "IsArchived" INTEGER DEFAULT 0,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "EntityType" TEXT,
    "EntityID" INTEGER,
    "UserID" INTEGER DEFAULT 1,
    "CreatedByUserID" INTEGER DEFAULT NULL,
    "CreatedByName" TEXT DEFAULT NULL,
    FOREIGN KEY ("CustomerID") REFERENCES "Customers" ("CustomerID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "FieldDefinitions" (
    "FieldID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "ServiceID" INTEGER,
    "FieldKey" TEXT,
    "FieldLabel" TEXT,
    "FieldType" TEXT DEFAULT 'text',
    "FieldOptionsJson" TEXT,
    "DefaultValue" TEXT,
    "Placeholder" TEXT,
    "IsRequired" INTEGER DEFAULT 0,
    "DisplayOrder" INTEGER DEFAULT 0,
    "IsActive" INTEGER DEFAULT 1,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "ModuleCode" TEXT,
    "Label" TEXT,
    "DataType" TEXT DEFAULT 'text',
    "OptionsJson" TEXT,
    "MaxLength" INTEGER,
    "ShowInList" INTEGER DEFAULT 0,
    "SortOrder" INTEGER DEFAULT 0,
    FOREIGN KEY ("ServiceID") REFERENCES "CSCServices" ("ServiceID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("ModuleCode") REFERENCES "TxnModules" ("ModuleCode") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "InvoiceItems" (
    "ItemID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "InvoiceID" INTEGER,
    "ItemName" TEXT,
    "Quantity" NUMERIC DEFAULT 1,
    "Unit" TEXT DEFAULT 'Pcs',
    "UnitPrice" NUMERIC DEFAULT 0,
    "TotalPrice" NUMERIC DEFAULT 0,
    FOREIGN KEY ("InvoiceID") REFERENCES "Invoices" ("InvoiceID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "Invoices" (
    "InvoiceID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "InvoiceNumber" TEXT,
    "CustomerID" INTEGER,
    "InvoiceDate" TEXT DEFAULT (datetime('now', 'localtime')),
    "DueDate" TEXT,
    "SubTotal" NUMERIC DEFAULT 0,
    "DiscountAmount" NUMERIC DEFAULT 0,
    "TaxPercent" NUMERIC DEFAULT 0,
    "TaxAmount" NUMERIC DEFAULT 0,
    "TotalAmount" NUMERIC DEFAULT 0,
    "PaidAmount" NUMERIC DEFAULT 0,
    "BalanceAmount" NUMERIC DEFAULT 0,
    "PaymentStatus" TEXT DEFAULT 'Unpaid',
    "PaymentMode" TEXT DEFAULT 'Udhar',
    "AccountID" INTEGER,
    "Notes" TEXT,
    "Terms" TEXT,
    "Status" TEXT DEFAULT 'Active',
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UserID" INTEGER DEFAULT 1,
    "GlobalSerialNo" INTEGER,
    "SNCode" TEXT,
    "ModuleCode" TEXT,
    "CreatedByUserID" INTEGER DEFAULT NULL,
    "CreatedByName" TEXT DEFAULT NULL,
    FOREIGN KEY ("AccountID") REFERENCES "Accounts" ("AccountID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("CustomerID") REFERENCES "Customers" ("CustomerID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "KhataEntries" (
    "KhataID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "CustomerID" INTEGER,
    "EntryDate" TEXT DEFAULT (datetime('now', 'localtime')),
    "EntryTime" TEXT,
    "EntryType" TEXT,
    "Amount" NUMERIC,
    "BalanceAfter" NUMERIC,
    "InvoiceID" INTEGER,
    "AccountID" INTEGER,
    "PaymentMode" TEXT DEFAULT 'Cash',
    "Description" TEXT,
    "ReferenceNo" TEXT,
    "Attachment" TEXT,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "CSCAppID" INTEGER,
    "BCID" INTEGER,
    "UserID" INTEGER DEFAULT 1,
    "GlobalSerialNo" INTEGER,
    "SNCode" TEXT,
    "ModuleCode" TEXT,
    "PaymentID" INTEGER,
    "SourceModule" TEXT,
    "SourceID" INTEGER,
    "CreatedByUserID" INTEGER DEFAULT NULL,
    "CreatedByName" TEXT DEFAULT NULL,
    FOREIGN KEY ("AccountID") REFERENCES "Accounts" ("AccountID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("CustomerID") REFERENCES "Customers" ("CustomerID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("InvoiceID") REFERENCES "Invoices" ("InvoiceID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "PACEntries" (
    "PACID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "UserID" INTEGER DEFAULT 1,
    "PACCode" TEXT,
    "OperatorID" TEXT,
    "WalletDeduction" NUMERIC DEFAULT 50.00,
    "GenerationDate" TEXT DEFAULT (datetime('now', 'localtime')),
    "ExpiryDate" TEXT,
    "Status" TEXT DEFAULT 'Available',
    "UsedForUCLID" INTEGER,
    "UsedForCustomerName" TEXT,
    "UsedForSID" TEXT,
    "UsedDate" TEXT,
    "Notes" TEXT,
    "IsActive" INTEGER DEFAULT 1,
    "IsDeleted" INTEGER DEFAULT 0,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "CreatedByUserID" INTEGER DEFAULT NULL,
    "CreatedByName" TEXT DEFAULT NULL,
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "Parties" (
    "PartyID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "PartyName" TEXT,
    "PartyType" TEXT,
    "Phone" TEXT,
    "Email" TEXT,
    "Address" TEXT,
    "OpeningBalance" NUMERIC DEFAULT 0,
    "CurrentBalance" NUMERIC DEFAULT 0,
    "Notes" TEXT,
    "IsActive" INTEGER DEFAULT 1,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UserID" INTEGER DEFAULT 1,
    "CreatedByUserID" INTEGER DEFAULT NULL,
    "CreatedByName" TEXT DEFAULT NULL,
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "RecurringTransactions" (
    "RecurringID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "TransType" TEXT,
    "Amount" NUMERIC,
    "AccountID" INTEGER,
    "CategoryID" INTEGER,
    "PartyID" INTEGER,
    "Description" TEXT,
    "Frequency" TEXT,
    "StartDate" TEXT,
    "EndDate" TEXT,
    "NextDueDate" TEXT,
    "LastRunDate" TEXT,
    "IsActive" INTEGER DEFAULT 1,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "ToAccountID" INTEGER,
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UserID" INTEGER DEFAULT 1,
    "CreatedByUserID" INTEGER DEFAULT NULL,
    "CreatedByName" TEXT DEFAULT NULL,
    FOREIGN KEY ("AccountID") REFERENCES "Accounts" ("AccountID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("CategoryID") REFERENCES "Categories" ("CategoryID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("PartyID") REFERENCES "Parties" ("PartyID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("ToAccountID") REFERENCES "Accounts" ("AccountID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "SchemaMigrations" (
    "MigrationID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "MigrationName" TEXT,
    "AppliedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "Description" TEXT
);

CREATE TABLE IF NOT EXISTS "ServiceRecords" (
    "RecordID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "ModuleCode" TEXT DEFAULT 'Service',
    "ServiceID" INTEGER,
    "CustomerID" INTEGER,
    "UserID" INTEGER DEFAULT 1,
    "GovtFee" NUMERIC DEFAULT 0.00,
    "OperatorFee" NUMERIC DEFAULT 0.00,
    "TotalFee" NUMERIC DEFAULT 0.00,
    "PaidAmount" NUMERIC DEFAULT 0.00,
    "BalanceAmount" NUMERIC DEFAULT 0.00,
    "RecordDate" TEXT DEFAULT (datetime('now', 'localtime')),
    "CompletionDate" TEXT,
    "Status" TEXT DEFAULT 'Pending',
    "PaymentStatus" TEXT DEFAULT 'Unpaid',
    "PaymentMode" TEXT DEFAULT 'Cash',
    "Remarks" TEXT,
    "ExtraFieldsJson" TEXT,
    "GlobalSerialNo" INTEGER,
    "SNCode" TEXT,
    "ModuleCodeSerial" TEXT,
    "IsActive" INTEGER DEFAULT 1,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "CustomerName" TEXT,
    "CustomerPhone" TEXT,
    "ReferenceNo" TEXT,
    "AccountID" INTEGER,
    "CashAccountID" INTEGER,
    "Amount" NUMERIC DEFAULT 0.00,
    "Charge" NUMERIC DEFAULT 0.00,
    "TotalAmount" NUMERIC DEFAULT 0.00,
    "DueAmount" NUMERIC DEFAULT 0.00,
    "DocCode" TEXT,
    "IsDeleted" INTEGER DEFAULT 0,
    "CreatedByUserID" INTEGER DEFAULT NULL,
    "CreatedByName" TEXT DEFAULT NULL,
    FOREIGN KEY ("CustomerID") REFERENCES "Customers" ("CustomerID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("ServiceID") REFERENCES "CSCServices" ("ServiceID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("ModuleCode") REFERENCES "TxnModules" ("ModuleCode") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "SystemSettings" (
    "SettingKey" TEXT,
    "SettingValue" TEXT,
    "SettingGroup" TEXT DEFAULT 'General',
    "Description" TEXT,
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UserID" INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS "Transactions" (
    "TransactionID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "TransDate" TEXT DEFAULT (datetime('now', 'localtime')),
    "TransTime" TEXT DEFAULT (datetime('now', 'localtime')),
    "TransType" TEXT,
    "Amount" NUMERIC,
    "AccountID" INTEGER,
    "ToAccountID" INTEGER,
    "CategoryID" INTEGER,
    "PartyID" INTEGER,
    "Description" TEXT,
    "Reference" TEXT,
    "Tags" TEXT,
    "IsRecurring" INTEGER DEFAULT 0,
    "RecurringID" INTEGER,
    "Attachment" TEXT,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "Metadata" TEXT,
    "UserID" INTEGER DEFAULT 1,
    "IsDeleted" INTEGER DEFAULT 0,
    "GlobalSerialNo" INTEGER,
    "SNCode" TEXT,
    "ModuleCode" TEXT,
    "SourceModule" TEXT,
    "SourceID" INTEGER,
    "LineType" TEXT,
    "CreatedByUserID" INTEGER DEFAULT NULL,
    "CreatedByName" TEXT DEFAULT NULL,
    FOREIGN KEY ("AccountID") REFERENCES "Accounts" ("AccountID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("CategoryID") REFERENCES "Categories" ("CategoryID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("PartyID") REFERENCES "Parties" ("PartyID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("ToAccountID") REFERENCES "Accounts" ("AccountID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "TxnModules" (
    "ModuleID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "ModuleCode" TEXT,
    "ModuleName" TEXT,
    "Prefix" TEXT,
    "TargetTable" TEXT,
    "PrimaryKeyColumn" TEXT,
    "IsCore" INTEGER DEFAULT 1,
    "IsActive" INTEGER DEFAULT 1,
    "DisplayOrder" INTEGER DEFAULT 0,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "DocPrefix" TEXT,
    "RecordTable" TEXT,
    "IsLedgerLinked" INTEGER DEFAULT 1,
    "Icon" TEXT,
    "Color" TEXT,
    "SortOrder" INTEGER DEFAULT 0,
    "UserID" INTEGER DEFAULT 1,
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "UCLUpdates" (
    "UCLID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "UserID" INTEGER DEFAULT 1,
    "CustomerID" INTEGER,
    "CustomerName" TEXT,
    "CustomerPhone" TEXT,
    "AadhaarLast4" TEXT,
    "AadhaarMasked" TEXT,
    "SID" TEXT,
    "UpdateType" TEXT DEFAULT 'Demographics Update',
    "PACCode" TEXT,
    "BiometricsUpdate" TEXT DEFAULT 'No',
    "UpdateDate" TEXT DEFAULT (datetime('now', 'localtime')),
    "TotalFee" NUMERIC DEFAULT 50.00,
    "OperatorFee" NUMERIC DEFAULT 0.00,
    "TotalAmount" NUMERIC DEFAULT 50.00,
    "PaidAmount" NUMERIC DEFAULT 50.00,
    "BalanceAmount" NUMERIC DEFAULT 0.00,
    "PaymentMode" TEXT DEFAULT 'Cash',
    "AccountID" INTEGER,
    "Status" TEXT DEFAULT 'Generated',
    "ReceiptDocumentID" INTEGER,
    "ReceiptPath" TEXT,
    "Notes" TEXT,
    "Registrar" TEXT,
    "EnrolmentAgency" TEXT,
    "LocationId" TEXT,
    "SerialNo" TEXT,
    "ExtraFieldsJson" TEXT,
    "IsActive" INTEGER DEFAULT 1,
    "IsDeleted" INTEGER DEFAULT 0,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "ModuleCode" TEXT DEFAULT 'UCL',
    "GlobalSerialNo" TEXT,
    "SNCode" TEXT,
    "CreatedByUserID" INTEGER DEFAULT NULL,
    "CreatedByName" TEXT DEFAULT NULL,
    FOREIGN KEY ("CustomerID") REFERENCES "Customers" ("CustomerID") ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS "UniversalTxnRegistry" (
    "GlobalSerialNo" INTEGER PRIMARY KEY AUTOINCREMENT,
    "SNCode" TEXT,
    "SourceModule" TEXT,
    "RecordID" INTEGER,
    "ModuleSerialNo" INTEGER,
    "ModuleCode" TEXT,
    "EntityName" TEXT,
    "Amount" NUMERIC,
    "TransDate" TEXT,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UserID" INTEGER DEFAULT 1,
    "IsActive" INTEGER DEFAULT 1,
    "CreatedByUserID" INTEGER DEFAULT NULL,
    "CreatedByName" TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS "Users" (
    "UserID" INTEGER PRIMARY KEY AUTOINCREMENT,
    "Username" TEXT,
    "PasswordHash" TEXT,
    "ShopName" TEXT,
    "OwnerName" TEXT,
    "MobileNumber" TEXT,
    "Role" TEXT DEFAULT 'User',
    "ParentUserID" INTEGER DEFAULT NULL,
    "IsActive" INTEGER DEFAULT 1,
    "ApiToken" TEXT,
    "SettingsJson" TEXT,
    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
    "ActiveSessionToken" TEXT,
    "LastLoginAt" TEXT,
    "LastLoginDevice" TEXT
);

-- Indexes from SQL Server
CREATE INDEX IF NOT EXISTS "idx_Accounts_IX_Accounts_IsActive_AccountType" ON "Accounts" ("AccountName", "CurrentBalance", "IsActive", "AccountType");
CREATE INDEX IF NOT EXISTS "idx_Accounts_IX_Accounts_UserID" ON "Accounts" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_AuditLogs_IX_AuditLogs_Action" ON "AuditLogs" ("Action");
CREATE INDEX IF NOT EXISTS "idx_AuditLogs_IX_AuditLogs_CreatedAt" ON "AuditLogs" ("CreatedAt");
CREATE INDEX IF NOT EXISTS "idx_AuditLogs_IX_AuditLogs_Module" ON "AuditLogs" ("Module");
CREATE INDEX IF NOT EXISTS "idx_AuditLogs_IX_AuditLogs_TableRecord" ON "AuditLogs" ("TableName", "RecordID");
CREATE INDEX IF NOT EXISTS "idx_AuditLogs_IX_AuditLogs_UserID" ON "AuditLogs" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_BCCounterSessions_IX_BCCounterSessions_UserID" ON "BCCounterSessions" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_BCTransactions_IX_BCTransactions_CashAccountID" ON "BCTransactions" ("Amount", "ServiceType", "CustomerCharge", "TransDate", "CashAccountID", "Status");
CREATE INDEX IF NOT EXISTS "idx_BCTransactions_IX_BCTransactions_CustomerID" ON "BCTransactions" ("CustomerID");
CREATE INDEX IF NOT EXISTS "idx_BCTransactions_IX_BCTransactions_CustomerPhone" ON "BCTransactions" ("CustomerPhone");
CREATE INDEX IF NOT EXISTS "idx_BCTransactions_IX_BCTransactions_GlobalSerialNo" ON "BCTransactions" ("GlobalSerialNo");
CREATE INDEX IF NOT EXISTS "idx_BCTransactions_IX_BCTransactions_PortalAccountID" ON "BCTransactions" ("Amount", "ServiceType", "CommissionEarned", "TransDate", "PortalAccountID", "Status");
CREATE INDEX IF NOT EXISTS "idx_BCTransactions_IX_BCTransactions_RRN_UTR" ON "BCTransactions" ("RRN_UTR");
CREATE INDEX IF NOT EXISTS "idx_BCTransactions_IX_BCTransactions_ServiceType" ON "BCTransactions" ("Amount", "TransDate", "ServiceType", "Status");
CREATE INDEX IF NOT EXISTS "idx_BCTransactions_IX_BCTransactions_SNCode" ON "BCTransactions" ("SNCode");
CREATE INDEX IF NOT EXISTS "idx_BCTransactions_IX_BCTransactions_TransDate_Status" ON "BCTransactions" ("ServiceType", "Amount", "CommissionEarned", "CustomerCharge", "NetProfit", "CashAccountID", "PortalAccountID", "QROperation", "TransDate", "Status");
CREATE INDEX IF NOT EXISTS "idx_BCTransactions_IX_BCTransactions_UserID" ON "BCTransactions" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_BillPayments_IX_BillPayments_BillCategory" ON "BillPayments" ("BillCategory");
CREATE INDEX IF NOT EXISTS "idx_BillPayments_IX_BillPayments_ConsumerNumber" ON "BillPayments" ("ConsumerNumber");
CREATE INDEX IF NOT EXISTS "idx_BillPayments_IX_BillPayments_CustomerID" ON "BillPayments" ("CustomerID");
CREATE INDEX IF NOT EXISTS "idx_BillPayments_IX_BillPayments_PaymentDate" ON "BillPayments" ("PaymentDate");
CREATE INDEX IF NOT EXISTS "idx_Bills_IX_Bills_AccountID" ON "Bills" ("AccountID");
CREATE INDEX IF NOT EXISTS "idx_Bills_IX_Bills_CategoryID" ON "Bills" ("CategoryID");
CREATE INDEX IF NOT EXISTS "idx_Bills_IX_Bills_GlobalSerialNo" ON "Bills" ("GlobalSerialNo");
CREATE INDEX IF NOT EXISTS "idx_Bills_IX_Bills_PartyID" ON "Bills" ("PartyID");
CREATE INDEX IF NOT EXISTS "idx_Bills_IX_Bills_SNCode" ON "Bills" ("SNCode");
CREATE INDEX IF NOT EXISTS "idx_Bills_IX_Bills_Status_DueDate" ON "Bills" ("Amount", "BillType", "PartyID", "CategoryID", "Status", "DueDate", "IsPaid");
CREATE INDEX IF NOT EXISTS "idx_Bills_IX_Bills_UserID" ON "Bills" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_Budgets_IX_Budgets_CategoryID" ON "Budgets" ("CategoryID");
CREATE INDEX IF NOT EXISTS "idx_Budgets_IX_Budgets_Month_Year" ON "Budgets" ("CategoryID", "BudgetAmount", "AlertPercent", "BudgetMonth", "BudgetYear", "IsActive");
CREATE INDEX IF NOT EXISTS "idx_Budgets_IX_Budgets_UserID" ON "Budgets" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_Categories_IX_Categories_ParentID" ON "Categories" ("ParentID");
CREATE INDEX IF NOT EXISTS "idx_Categories_IX_Categories_UserID" ON "Categories" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_ClientErrorLogs_IX_ClientErrorLogs_CreatedAt" ON "ClientErrorLogs" ("CreatedAt");
CREATE INDEX IF NOT EXISTS "idx_ClientErrorLogs_IX_ClientErrorLogs_UserID" ON "ClientErrorLogs" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_CSCApplications_IX_CSCApplications_ActiveUser" ON "CSCApplications" ("CustomerName", "CustomerPhone", "CustomerAadhaar", "AckNumber", "ServiceType", "ExpectedDate", "GovtFee", "OperatorFee", "TotalFee", "PaidAmount", "DueAmount", "Status", "CreatedAt", "IsActive", "UserID", "ApplyDate");
CREATE INDEX IF NOT EXISTS "idx_CSCApplications_IX_CSCApplications_GlobalSerialNo" ON "CSCApplications" ("GlobalSerialNo");
CREATE INDEX IF NOT EXISTS "idx_CSCApplications_IX_CSCApplications_SNCode" ON "CSCApplications" ("SNCode");
CREATE INDEX IF NOT EXISTS "idx_CSCApplications_IX_CSCApplications_UserID" ON "CSCApplications" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_CSCApplications_IX_CSCApps_AckNumber" ON "CSCApplications" ("AckNumber");
CREATE INDEX IF NOT EXISTS "idx_CSCApplications_IX_CSCApps_ApplyDate" ON "CSCApplications" ("ApplyDate");
CREATE INDEX IF NOT EXISTS "idx_CSCApplications_IX_CSCApps_Customer" ON "CSCApplications" ("CustomerID");
CREATE INDEX IF NOT EXISTS "idx_CSCApplications_IX_CSCApps_ServiceType" ON "CSCApplications" ("ServiceType");
CREATE INDEX IF NOT EXISTS "idx_CSCApplications_IX_CSCApps_Status" ON "CSCApplications" ("Status");
CREATE INDEX IF NOT EXISTS "idx_CSCServices_IX_CSCServices_Module" ON "CSCServices" ("ModuleCode", "IsActive", "SortOrder");
CREATE INDEX IF NOT EXISTS "idx_CSCServices_IX_CSCServices_UserID" ON "CSCServices" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_Customers_IX_Customers_ActiveUser" ON "Customers" ("CustomerName", "Phone", "AadhaarNumber", "CurrentBalance", "CreatedAt", "IsActive", "UserID");
CREATE INDEX IF NOT EXISTS "idx_Customers_IX_Customers_CurrentBalance" ON "Customers" ("IsActive", "CurrentBalance");
CREATE INDEX IF NOT EXISTS "idx_Customers_IX_Customers_FamilyID" ON "Customers" ("FamilyID");
CREATE INDEX IF NOT EXISTS "idx_Customers_IX_Customers_ParentCustomerID" ON "Customers" ("ParentCustomerID");
CREATE INDEX IF NOT EXISTS "idx_Customers_IX_Customers_Phone" ON "Customers" ("Phone", "IsActive");
CREATE INDEX IF NOT EXISTS "idx_Customers_IX_Customers_UserID" ON "Customers" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_Documents_IX_Documents_Customer_Entity" ON "Documents" ("CustomerID", "EntityType", "EntityID");
CREATE INDEX IF NOT EXISTS "idx_Documents_IX_Documents_UserID" ON "Documents" ("UserID");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_FieldDefinitions_UX_FieldDefinitions_Module_FieldKey" ON "FieldDefinitions" ("ModuleCode", "FieldKey");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_FieldDefinitions_UX_FieldDefinitions_Service_FieldKey" ON "FieldDefinitions" ("ServiceID", "FieldKey");
CREATE INDEX IF NOT EXISTS "idx_InvoiceItems_IX_InvoiceItems_InvoiceID" ON "InvoiceItems" ("InvoiceID");
CREATE INDEX IF NOT EXISTS "idx_Invoices_IX_Invoices_AccountID" ON "Invoices" ("AccountID");
CREATE INDEX IF NOT EXISTS "idx_Invoices_IX_Invoices_Customer" ON "Invoices" ("CustomerID", "InvoiceDate");
CREATE INDEX IF NOT EXISTS "idx_Invoices_IX_Invoices_GlobalSerialNo" ON "Invoices" ("GlobalSerialNo");
CREATE INDEX IF NOT EXISTS "idx_Invoices_IX_Invoices_SNCode" ON "Invoices" ("SNCode");
CREATE INDEX IF NOT EXISTS "idx_Invoices_IX_Invoices_UserID" ON "Invoices" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_KhataEntries_IX_KhataEntries_AccountID" ON "KhataEntries" ("AccountID");
CREATE INDEX IF NOT EXISTS "idx_KhataEntries_IX_KhataEntries_BCID" ON "KhataEntries" ("BCID");
CREATE INDEX IF NOT EXISTS "idx_KhataEntries_IX_KhataEntries_CSCAppID" ON "KhataEntries" ("CSCAppID");
CREATE INDEX IF NOT EXISTS "idx_KhataEntries_IX_KhataEntries_Customer" ON "KhataEntries" ("CustomerID", "EntryDate", "CreatedAt");
CREATE INDEX IF NOT EXISTS "idx_KhataEntries_IX_KhataEntries_GlobalSerialNo" ON "KhataEntries" ("GlobalSerialNo");
CREATE INDEX IF NOT EXISTS "idx_KhataEntries_IX_KhataEntries_InvoiceID" ON "KhataEntries" ("InvoiceID");
CREATE INDEX IF NOT EXISTS "idx_KhataEntries_IX_KhataEntries_PaymentID" ON "KhataEntries" ("PaymentID");
CREATE INDEX IF NOT EXISTS "idx_KhataEntries_IX_KhataEntries_ReferenceNo" ON "KhataEntries" ("ReferenceNo");
CREATE INDEX IF NOT EXISTS "idx_KhataEntries_IX_KhataEntries_SNCode" ON "KhataEntries" ("SNCode");
CREATE INDEX IF NOT EXISTS "idx_KhataEntries_IX_KhataEntries_SourceModule_SourceID" ON "KhataEntries" ("SourceModule", "SourceID");
CREATE INDEX IF NOT EXISTS "idx_KhataEntries_IX_KhataEntries_UserID" ON "KhataEntries" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_PACEntries_IX_PACEntries_Code" ON "PACEntries" ("PACCode");
CREATE INDEX IF NOT EXISTS "idx_PACEntries_IX_PACEntries_User_Status" ON "PACEntries" ("UserID", "Status");
CREATE INDEX IF NOT EXISTS "idx_Parties_IX_Parties_IsActive_CurrentBalance" ON "Parties" ("PartyName", "PartyType", "Phone", "IsActive", "CurrentBalance");
CREATE INDEX IF NOT EXISTS "idx_Parties_IX_Parties_UserID" ON "Parties" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_RecurringTransactions_IX_RecTxn_AccountID" ON "RecurringTransactions" ("AccountID");
CREATE INDEX IF NOT EXISTS "idx_RecurringTransactions_IX_RecTxn_CategoryID" ON "RecurringTransactions" ("CategoryID");
CREATE INDEX IF NOT EXISTS "idx_RecurringTransactions_IX_RecTxn_PartyID" ON "RecurringTransactions" ("PartyID");
CREATE INDEX IF NOT EXISTS "idx_RecurringTransactions_IX_RecTxn_ToAccountID" ON "RecurringTransactions" ("ToAccountID");
CREATE INDEX IF NOT EXISTS "idx_RecurringTransactions_IX_RecurringTransactions_UserID" ON "RecurringTransactions" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_ServiceRecords_IX_ServiceRecords_GlobalSerialNo" ON "ServiceRecords" ("GlobalSerialNo");
CREATE INDEX IF NOT EXISTS "idx_ServiceRecords_IX_ServiceRecords_Module_Customer" ON "ServiceRecords" ("ModuleCode", "CustomerID", "RecordDate");
CREATE INDEX IF NOT EXISTS "idx_ServiceRecords_IX_ServiceRecords_ServiceID" ON "ServiceRecords" ("ServiceID");
CREATE INDEX IF NOT EXISTS "idx_ServiceRecords_IX_ServiceRecords_UserID" ON "ServiceRecords" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_ServiceRecords_IX_SR_Customer_Date" ON "ServiceRecords" ("CustomerID", "RecordDate");
CREATE INDEX IF NOT EXISTS "idx_ServiceRecords_IX_SR_Module_Date" ON "ServiceRecords" ("ModuleCode", "RecordDate");
CREATE INDEX IF NOT EXISTS "idx_ServiceRecords_IX_SR_Ref" ON "ServiceRecords" ("ReferenceNo");
CREATE INDEX IF NOT EXISTS "idx_Transactions_IX_Transactions_AccountID" ON "Transactions" ("Amount", "ToAccountID", "TransDate", "AccountID", "TransType");
CREATE INDEX IF NOT EXISTS "idx_Transactions_IX_Transactions_CategoryID" ON "Transactions" ("Amount", "TransDate", "CategoryID", "TransType");
CREATE INDEX IF NOT EXISTS "idx_Transactions_IX_Transactions_GlobalSerialNo" ON "Transactions" ("GlobalSerialNo");
CREATE INDEX IF NOT EXISTS "idx_Transactions_IX_Transactions_PartyID" ON "Transactions" ("Amount", "TransDate", "PartyID", "TransType");
CREATE INDEX IF NOT EXISTS "idx_Transactions_IX_Transactions_SNCode" ON "Transactions" ("SNCode");
CREATE INDEX IF NOT EXISTS "idx_Transactions_IX_Transactions_SourceModule_SourceID" ON "Transactions" ("SourceModule", "SourceID", "LineType");
CREATE INDEX IF NOT EXISTS "idx_Transactions_IX_Transactions_ToAccountID" ON "Transactions" ("Amount", "TransDate", "ToAccountID");
CREATE INDEX IF NOT EXISTS "idx_Transactions_IX_Transactions_TransDate" ON "Transactions" ("Amount", "TransType", "AccountID", "ToAccountID", "CategoryID", "PartyID", "TransDate", "CreatedAt");
CREATE INDEX IF NOT EXISTS "idx_Transactions_IX_Transactions_UserID" ON "Transactions" ("UserID");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_Transactions_UX_Txn_SourceLine" ON "Transactions" ("SourceModule", "SourceID", "LineType");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_Users_UX_Username" ON "Users" (LOWER(TRIM("Username"))) WHERE "Username" IS NOT NULL AND TRIM("Username") <> '';
CREATE UNIQUE INDEX IF NOT EXISTS "idx_Users_UX_ApiToken" ON "Users" ("ApiToken") WHERE "ApiToken" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_Users_ParentUserID" ON "Users" ("ParentUserID");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_SystemSettings_UX_SettingKey" ON "SystemSettings" ("SettingKey") WHERE "SettingKey" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_TxnModules_UX_ModuleCode" ON "TxnModules" ("ModuleCode");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_SchemaMigrations_UX_MigrationName" ON "SchemaMigrations" ("MigrationName") WHERE "MigrationName" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ServiceRecords_UX_Module_DocCode" ON "ServiceRecords" ("ModuleCode", "DocCode") WHERE "DocCode" IS NOT NULL AND "DocCode" <> '';
CREATE UNIQUE INDEX IF NOT EXISTS "idx_UniversalTxnRegistry_UX_SNCode" ON "UniversalTxnRegistry" ("SNCode") WHERE "SNCode" IS NOT NULL AND "SNCode" <> '';
CREATE INDEX IF NOT EXISTS "idx_TxnModules_IX_TxnModules_UserID" ON "TxnModules" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_UCLUpdates_IX_UCLUpdates_Customer" ON "UCLUpdates" ("CustomerID");
CREATE INDEX IF NOT EXISTS "idx_UCLUpdates_IX_UCLUpdates_SID" ON "UCLUpdates" ("SID");
CREATE INDEX IF NOT EXISTS "idx_UCLUpdates_IX_UCLUpdates_Status" ON "UCLUpdates" ("Status");
CREATE INDEX IF NOT EXISTS "idx_UCLUpdates_IX_UCLUpdates_User_Date" ON "UCLUpdates" ("UserID", "UpdateDate");
CREATE INDEX IF NOT EXISTS "idx_UniversalTxnRegistry_IX_UniversalTxn_Entity" ON "UniversalTxnRegistry" ("EntityName");
CREATE INDEX IF NOT EXISTS "idx_UniversalTxnRegistry_IX_UniversalTxn_ModuleCode" ON "UniversalTxnRegistry" ("ModuleCode");
CREATE INDEX IF NOT EXISTS "idx_UniversalTxnRegistry_IX_UniversalTxn_TransDate" ON "UniversalTxnRegistry" ("TransDate");
CREATE INDEX IF NOT EXISTS "idx_UniversalTxnRegistry_IX_UniversalTxn_SNCode" ON "UniversalTxnRegistry" ("SNCode");
CREATE INDEX IF NOT EXISTS "idx_BillPayments_IX_BillPayments_GlobalSerialNo" ON "BillPayments" ("GlobalSerialNo");
CREATE INDEX IF NOT EXISTS "idx_BillPayments_IX_BillPayments_SNCode" ON "BillPayments" ("SNCode");
CREATE INDEX IF NOT EXISTS "idx_UCLUpdates_IX_UCLUpdates_GlobalSerialNo" ON "UCLUpdates" ("GlobalSerialNo");
CREATE INDEX IF NOT EXISTS "idx_UCLUpdates_IX_UCLUpdates_SNCode" ON "UCLUpdates" ("SNCode");
CREATE INDEX IF NOT EXISTS "idx_Customers_IX_Customers_Aadhaar" ON "Customers" ("AadhaarNumber");

CREATE TRIGGER IF NOT EXISTS "trg_UniversalTxnRegistry_SNCode"
AFTER INSERT ON "UniversalTxnRegistry"
FOR EACH ROW
WHEN NEW.SNCode IS NULL OR NEW.SNCode = '' OR NEW.SNCode LIKE 'TXN-%'
BEGIN
    UPDATE "UniversalTxnRegistry" 
    SET "SNCode" = 'SN-' || CAST(NEW.GlobalSerialNo AS INTEGER) 
    WHERE "GlobalSerialNo" = NEW.GlobalSerialNo;
END;

