/**
 * database/schemaManifest.js
 * ---------------------------------------------------------------------------
 * Declarative Schema Manifest
 *
 * Defines core tables, extensible dynamic columns, and essential performance
 * indexes so that migration runners, self-healing boot engines, and verification
 * suites can idempotently inspect and guarantee schema health.
 */

module.exports = {
    tables: [
        'Users',
        'Accounts',
        'Customers',
        'Parties',
        'Transactions',
        'KhataEntries',
        'UniversalTxnRegistry',
        'Documents',
        'AuditLogs',
        'TxnModules',
        'CSCServices',
        'FieldDefinitions',
        'ServiceRecords',
        'CSCApplications',
        'BCTransactions',
        'BillPayments',
        'Invoices',
        'InvoiceItems',
        'AppLicenses',
        'ApiIdempotencyRequests',
        'SchemaMigrations'
    ],

    columns: [
        { table: 'CSCServices', name: 'ModuleCode', type: "VARCHAR(30) NULL DEFAULT('CSC')" },
        { table: 'CSCServices', name: 'CustomFieldsSchema', type: 'NVARCHAR(MAX) NULL' },
        { table: 'CSCServices', name: 'Category', type: "NVARCHAR(100) NULL DEFAULT('General')" },
        { table: 'KhataEntries', name: 'SourceModule', type: 'VARCHAR(30) NULL' },
        { table: 'KhataEntries', name: 'SourceID', type: 'INT NULL' },
        { table: 'KhataEntries', name: 'PaymentID', type: 'INT NULL' },
        { table: 'Transactions', name: 'SourceModule', type: 'VARCHAR(30) NULL' },
        { table: 'Transactions', name: 'SourceID', type: 'INT NULL' },
        { table: 'Transactions', name: 'LineType', type: 'VARCHAR(30) NULL' },
        { table: 'CSCApplications', name: 'ExtraFieldsJson', type: 'NVARCHAR(MAX) NULL' },
        { table: 'BillPayments', name: 'ExtraFieldsJson', type: 'NVARCHAR(MAX) NULL' },
        { table: 'Customers', name: 'ExtraFieldsJson', type: 'NVARCHAR(MAX) NULL' },
        { table: 'TxnModules', name: 'DocPrefix', type: 'VARCHAR(10) NULL' },
        { table: 'TxnModules', name: 'RecordTable', type: 'NVARCHAR(128) NULL' },
        { table: 'TxnModules', name: 'IsLedgerLinked', type: 'BIT NOT NULL DEFAULT(1)' },
        { table: 'FieldDefinitions', name: 'ModuleCode', type: 'VARCHAR(20) NULL' },
        { table: 'ServiceRecords', name: 'CustomerName', type: 'NVARCHAR(150) NULL' },
        { table: 'ServiceRecords', name: 'CustomerPhone', type: 'NVARCHAR(20) NULL' },
        { table: 'ServiceRecords', name: 'ReferenceNo', type: 'NVARCHAR(100) NULL' },
        { table: 'ServiceRecords', name: 'Amount', type: 'DECIMAL(18,2) NOT NULL DEFAULT(0)' },
        { table: 'ServiceRecords', name: 'Charge', type: 'DECIMAL(18,2) NOT NULL DEFAULT(0)' },
        { table: 'ServiceRecords', name: 'TotalAmount', type: 'DECIMAL(18,2) NOT NULL DEFAULT(0)' },
        { table: 'ServiceRecords', name: 'DueAmount', type: 'DECIMAL(18,2) NOT NULL DEFAULT(0)' },
        { table: 'ServiceRecords', name: 'DocCode', type: 'VARCHAR(30) NULL' },
        { table: 'ServiceRecords', name: 'ExtraFieldsJson', type: 'NVARCHAR(MAX) NULL' }
    ],

    indexes: [
        { table: 'CSCServices', name: 'IX_CSCServices_Module', cols: 'ModuleCode, IsActive, SortOrder' },
        { table: 'KhataEntries', name: 'IX_KhataEntries_SourceModule_SourceID', cols: 'SourceModule, SourceID' },
        { table: 'Transactions', name: 'IX_Transactions_SourceModule_SourceID', cols: 'SourceModule, SourceID, LineType' },
        { table: 'ServiceRecords', name: 'IX_SR_Module_Date', cols: 'ModuleCode, RecordDate DESC' },
        { table: 'ServiceRecords', name: 'IX_SR_Customer_Date', cols: 'CustomerID, RecordDate DESC' },
        { table: 'ServiceRecords', name: 'IX_SR_Ref', cols: 'ReferenceNo' },
        { table: 'ServiceRecords', name: 'UQ_SR_Doc', cols: 'ModuleCode, DocCode' }
    ]
};
