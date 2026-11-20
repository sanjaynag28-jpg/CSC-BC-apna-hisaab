-- ===========================================================================
-- 008_fresh_install_parity_v1
-- ---------------------------------------------------------------------------
-- Live DB ke saare non-PK indexes, foreign keys aur check constraints ko
-- declarative, idempotent form me laata hai. Isse fresh install bhi production
-- ke barabar schema paata hai (perf indexes + relational integrity).
--
-- 100% NON-DESTRUCTIVE: Sirf CREATE IF NOT EXISTS. Koi DROP/TRUNCATE nahi.
-- Duplicate/orphan data ki wajah se unique index ya FK fail ho to TRY/CATCH
-- us object ko skip karta hai (migration nahi rukti).
-- ===========================================================================

-- Safety: agar koi object create fail ho to bhi migration transaction committable rahe.
SET XACT_ABORT OFF;
GO

-- Normalize legacy short ModuleCode column (007 ne pehle VARCHAR(20) banaya tha)
-- taaki FK_FieldDefs_Module -> TxnModules(ModuleCode VARCHAR(30)) ban sake.
IF COL_LENGTH('dbo.FieldDefinitions', 'ModuleCode') IS NOT NULL
   AND EXISTS (
       SELECT 1 FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.FieldDefinitions')
         AND name = 'ModuleCode'
         AND max_length < 30
   )
BEGIN
    ALTER TABLE dbo.FieldDefinitions ALTER COLUMN ModuleCode VARCHAR(30) NULL;
END
GO

-- ---------------------------------------------------------------------------
-- 1. INDEXES
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Accounts_IsActive_AccountType' AND object_id = OBJECT_ID('dbo.Accounts'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Accounts_IsActive_AccountType] ON [Accounts] ([IsActive] ASC, [AccountType] ASC) INCLUDE ([AccountName], [CurrentBalance]);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Accounts_IsActive_AccountType: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Accounts_UserID' AND object_id = OBJECT_ID('dbo.Accounts'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Accounts_UserID] ON [Accounts] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Accounts_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_Action' AND object_id = OBJECT_ID('dbo.AuditLogs'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_AuditLogs_Action] ON [AuditLogs] ([Action] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_AuditLogs_Action: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_CreatedAt' AND object_id = OBJECT_ID('dbo.AuditLogs'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_AuditLogs_CreatedAt] ON [AuditLogs] ([CreatedAt] DESC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_AuditLogs_CreatedAt: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_Module' AND object_id = OBJECT_ID('dbo.AuditLogs'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_AuditLogs_Module] ON [AuditLogs] ([Module] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_AuditLogs_Module: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_TableRecord' AND object_id = OBJECT_ID('dbo.AuditLogs'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_AuditLogs_TableRecord] ON [AuditLogs] ([TableName] ASC, [RecordID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_AuditLogs_TableRecord: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_UserID' AND object_id = OBJECT_ID('dbo.AuditLogs'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_AuditLogs_UserID] ON [AuditLogs] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_AuditLogs_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BCCounterSessions_UserID' AND object_id = OBJECT_ID('dbo.BCCounterSessions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_BCCounterSessions_UserID] ON [BCCounterSessions] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_BCCounterSessions_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_BCCounterSessions_User_Date' AND object_id = OBJECT_ID('dbo.BCCounterSessions'))
BEGIN
    BEGIN TRY
        CREATE UNIQUE NONCLUSTERED INDEX [UQ_BCCounterSessions_User_Date] ON [BCCounterSessions] ([UserID] ASC, [SessionDate] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index UQ_BCCounterSessions_User_Date: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BCTransactions_CashAccountID' AND object_id = OBJECT_ID('dbo.BCTransactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_BCTransactions_CashAccountID] ON [BCTransactions] ([CashAccountID] ASC, [Status] ASC) INCLUDE ([Amount], [ServiceType], [CustomerCharge], [TransDate]);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_BCTransactions_CashAccountID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BCTransactions_CustomerID' AND object_id = OBJECT_ID('dbo.BCTransactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_BCTransactions_CustomerID] ON [BCTransactions] ([CustomerID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_BCTransactions_CustomerID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BCTransactions_CustomerPhone' AND object_id = OBJECT_ID('dbo.BCTransactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_BCTransactions_CustomerPhone] ON [BCTransactions] ([CustomerPhone] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_BCTransactions_CustomerPhone: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BCTransactions_GlobalSerialNo' AND object_id = OBJECT_ID('dbo.BCTransactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_BCTransactions_GlobalSerialNo] ON [BCTransactions] ([GlobalSerialNo] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_BCTransactions_GlobalSerialNo: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BCTransactions_PortalAccountID' AND object_id = OBJECT_ID('dbo.BCTransactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_BCTransactions_PortalAccountID] ON [BCTransactions] ([PortalAccountID] ASC, [Status] ASC) INCLUDE ([Amount], [ServiceType], [CommissionEarned], [TransDate]);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_BCTransactions_PortalAccountID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BCTransactions_RRN_UTR' AND object_id = OBJECT_ID('dbo.BCTransactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_BCTransactions_RRN_UTR] ON [BCTransactions] ([RRN_UTR] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_BCTransactions_RRN_UTR: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BCTransactions_ServiceType' AND object_id = OBJECT_ID('dbo.BCTransactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_BCTransactions_ServiceType] ON [BCTransactions] ([ServiceType] ASC, [Status] ASC) INCLUDE ([Amount], [TransDate]);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_BCTransactions_ServiceType: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BCTransactions_SNCode' AND object_id = OBJECT_ID('dbo.BCTransactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_BCTransactions_SNCode] ON [BCTransactions] ([SNCode] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_BCTransactions_SNCode: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BCTransactions_TransDate_Status' AND object_id = OBJECT_ID('dbo.BCTransactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_BCTransactions_TransDate_Status] ON [BCTransactions] ([TransDate] ASC, [Status] ASC) INCLUDE ([ServiceType], [Amount], [CommissionEarned], [CustomerCharge], [NetProfit], [CashAccountID], [PortalAccountID], [QROperation]);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_BCTransactions_TransDate_Status: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BCTransactions_UserID' AND object_id = OBJECT_ID('dbo.BCTransactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_BCTransactions_UserID] ON [BCTransactions] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_BCTransactions_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BillPayments_BillCategory' AND object_id = OBJECT_ID('dbo.BillPayments'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_BillPayments_BillCategory] ON [BillPayments] ([BillCategory] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_BillPayments_BillCategory: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BillPayments_ConsumerNumber' AND object_id = OBJECT_ID('dbo.BillPayments'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_BillPayments_ConsumerNumber] ON [BillPayments] ([ConsumerNumber] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_BillPayments_ConsumerNumber: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BillPayments_CustomerID' AND object_id = OBJECT_ID('dbo.BillPayments'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_BillPayments_CustomerID] ON [BillPayments] ([CustomerID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_BillPayments_CustomerID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BillPayments_PaymentDate' AND object_id = OBJECT_ID('dbo.BillPayments'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_BillPayments_PaymentDate] ON [BillPayments] ([PaymentDate] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_BillPayments_PaymentDate: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Bills_AccountID' AND object_id = OBJECT_ID('dbo.Bills'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Bills_AccountID] ON [Bills] ([AccountID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Bills_AccountID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Bills_CategoryID' AND object_id = OBJECT_ID('dbo.Bills'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Bills_CategoryID] ON [Bills] ([CategoryID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Bills_CategoryID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Bills_GlobalSerialNo' AND object_id = OBJECT_ID('dbo.Bills'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Bills_GlobalSerialNo] ON [Bills] ([GlobalSerialNo] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Bills_GlobalSerialNo: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Bills_PartyID' AND object_id = OBJECT_ID('dbo.Bills'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Bills_PartyID] ON [Bills] ([PartyID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Bills_PartyID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Bills_SNCode' AND object_id = OBJECT_ID('dbo.Bills'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Bills_SNCode] ON [Bills] ([SNCode] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Bills_SNCode: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Bills_Status_DueDate' AND object_id = OBJECT_ID('dbo.Bills'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Bills_Status_DueDate] ON [Bills] ([Status] ASC, [DueDate] ASC, [IsPaid] ASC) INCLUDE ([Amount], [BillType], [PartyID], [CategoryID]);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Bills_Status_DueDate: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Bills_UserID' AND object_id = OBJECT_ID('dbo.Bills'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Bills_UserID] ON [Bills] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Bills_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Budgets_CategoryID' AND object_id = OBJECT_ID('dbo.Budgets'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Budgets_CategoryID] ON [Budgets] ([CategoryID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Budgets_CategoryID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Budgets_Month_Year' AND object_id = OBJECT_ID('dbo.Budgets'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Budgets_Month_Year] ON [Budgets] ([BudgetMonth] ASC, [BudgetYear] ASC, [IsActive] ASC) INCLUDE ([CategoryID], [BudgetAmount], [AlertPercent]);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Budgets_Month_Year: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Budgets_UserID' AND object_id = OBJECT_ID('dbo.Budgets'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Budgets_UserID] ON [Budgets] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Budgets_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Categories_ParentID' AND object_id = OBJECT_ID('dbo.Categories'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Categories_ParentID] ON [Categories] ([ParentID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Categories_ParentID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Categories_UserID' AND object_id = OBJECT_ID('dbo.Categories'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Categories_UserID] ON [Categories] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Categories_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ClientErrorLogs_CreatedAt' AND object_id = OBJECT_ID('dbo.ClientErrorLogs'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_ClientErrorLogs_CreatedAt] ON [ClientErrorLogs] ([CreatedAt] DESC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_ClientErrorLogs_CreatedAt: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ClientErrorLogs_UserID' AND object_id = OBJECT_ID('dbo.ClientErrorLogs'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_ClientErrorLogs_UserID] ON [ClientErrorLogs] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_ClientErrorLogs_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CSCApplications_ActiveUser' AND object_id = OBJECT_ID('dbo.CSCApplications'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_CSCApplications_ActiveUser] ON [CSCApplications] ([IsActive] ASC, [UserID] ASC, [ApplyDate] ASC) INCLUDE ([CustomerName], [CustomerPhone], [CustomerAadhaar], [AckNumber], [ServiceType], [ExpectedDate], [GovtFee], [OperatorFee], [TotalFee], [PaidAmount], [DueAmount], [Status], [CreatedAt]);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_CSCApplications_ActiveUser: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CSCApplications_GlobalSerialNo' AND object_id = OBJECT_ID('dbo.CSCApplications'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_CSCApplications_GlobalSerialNo] ON [CSCApplications] ([GlobalSerialNo] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_CSCApplications_GlobalSerialNo: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CSCApplications_SNCode' AND object_id = OBJECT_ID('dbo.CSCApplications'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_CSCApplications_SNCode] ON [CSCApplications] ([SNCode] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_CSCApplications_SNCode: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CSCApplications_UserID' AND object_id = OBJECT_ID('dbo.CSCApplications'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_CSCApplications_UserID] ON [CSCApplications] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_CSCApplications_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CSCApps_AckNumber' AND object_id = OBJECT_ID('dbo.CSCApplications'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_CSCApps_AckNumber] ON [CSCApplications] ([AckNumber] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_CSCApps_AckNumber: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CSCApps_ApplyDate' AND object_id = OBJECT_ID('dbo.CSCApplications'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_CSCApps_ApplyDate] ON [CSCApplications] ([ApplyDate] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_CSCApps_ApplyDate: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CSCApps_Customer' AND object_id = OBJECT_ID('dbo.CSCApplications'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_CSCApps_Customer] ON [CSCApplications] ([CustomerID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_CSCApps_Customer: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CSCApps_ServiceType' AND object_id = OBJECT_ID('dbo.CSCApplications'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_CSCApps_ServiceType] ON [CSCApplications] ([ServiceType] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_CSCApps_ServiceType: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CSCApps_Status' AND object_id = OBJECT_ID('dbo.CSCApplications'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_CSCApps_Status] ON [CSCApplications] ([Status] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_CSCApps_Status: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CSCServices_Module' AND object_id = OBJECT_ID('dbo.CSCServices'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_CSCServices_Module] ON [CSCServices] ([ModuleCode] ASC, [IsActive] ASC, [SortOrder] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_CSCServices_Module: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CSCServices_UserID' AND object_id = OBJECT_ID('dbo.CSCServices'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_CSCServices_UserID] ON [CSCServices] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_CSCServices_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_CSCServices_User_ServiceName' AND object_id = OBJECT_ID('dbo.CSCServices'))
BEGIN
    BEGIN TRY
        CREATE UNIQUE NONCLUSTERED INDEX [UQ_CSCServices_User_ServiceName] ON [CSCServices] ([UserID] ASC, [ServiceName] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index UQ_CSCServices_User_ServiceName: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Customers_ActiveUser' AND object_id = OBJECT_ID('dbo.Customers'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Customers_ActiveUser] ON [Customers] ([IsActive] ASC, [UserID] ASC) INCLUDE ([CustomerName], [Phone], [AadhaarNumber], [CurrentBalance], [CreatedAt]);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Customers_ActiveUser: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Customers_CurrentBalance' AND object_id = OBJECT_ID('dbo.Customers'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Customers_CurrentBalance] ON [Customers] ([IsActive] ASC, [CurrentBalance] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Customers_CurrentBalance: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Customers_FamilyID' AND object_id = OBJECT_ID('dbo.Customers'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Customers_FamilyID] ON [Customers] ([FamilyID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Customers_FamilyID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Customers_ParentCustomerID' AND object_id = OBJECT_ID('dbo.Customers'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Customers_ParentCustomerID] ON [Customers] ([ParentCustomerID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Customers_ParentCustomerID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Customers_Phone' AND object_id = OBJECT_ID('dbo.Customers'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Customers_Phone] ON [Customers] ([Phone] ASC, [IsActive] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Customers_Phone: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Customers_UserID' AND object_id = OBJECT_ID('dbo.Customers'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Customers_UserID] ON [Customers] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Customers_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Customers_User_Aadhaar' AND object_id = OBJECT_ID('dbo.Customers'))
BEGIN
    BEGIN TRY
        CREATE UNIQUE NONCLUSTERED INDEX [UQ_Customers_User_Aadhaar] ON [Customers] ([UserID] ASC, [AadhaarNumber] ASC) WHERE ([AadhaarNumber] IS NOT NULL AND [AadhaarNumber]<>'');
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index UQ_Customers_User_Aadhaar: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Documents_Customer_Entity' AND object_id = OBJECT_ID('dbo.Documents'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Documents_Customer_Entity] ON [Documents] ([CustomerID] ASC, [EntityType] ASC, [EntityID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Documents_Customer_Entity: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Documents_UserID' AND object_id = OBJECT_ID('dbo.Documents'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Documents_UserID] ON [Documents] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Documents_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InvoiceItems_InvoiceID' AND object_id = OBJECT_ID('dbo.InvoiceItems'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_InvoiceItems_InvoiceID] ON [InvoiceItems] ([InvoiceID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_InvoiceItems_InvoiceID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Invoices_AccountID' AND object_id = OBJECT_ID('dbo.Invoices'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Invoices_AccountID] ON [Invoices] ([AccountID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Invoices_AccountID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Invoices_Customer' AND object_id = OBJECT_ID('dbo.Invoices'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Invoices_Customer] ON [Invoices] ([CustomerID] ASC, [InvoiceDate] DESC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Invoices_Customer: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Invoices_GlobalSerialNo' AND object_id = OBJECT_ID('dbo.Invoices'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Invoices_GlobalSerialNo] ON [Invoices] ([GlobalSerialNo] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Invoices_GlobalSerialNo: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Invoices_SNCode' AND object_id = OBJECT_ID('dbo.Invoices'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Invoices_SNCode] ON [Invoices] ([SNCode] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Invoices_SNCode: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Invoices_UserID' AND object_id = OBJECT_ID('dbo.Invoices'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Invoices_UserID] ON [Invoices] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Invoices_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Invoices_User_InvoiceNumber' AND object_id = OBJECT_ID('dbo.Invoices'))
BEGIN
    BEGIN TRY
        CREATE UNIQUE NONCLUSTERED INDEX [UQ_Invoices_User_InvoiceNumber] ON [Invoices] ([UserID] ASC, [InvoiceNumber] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index UQ_Invoices_User_InvoiceNumber: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_AccountID' AND object_id = OBJECT_ID('dbo.KhataEntries'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_KhataEntries_AccountID] ON [KhataEntries] ([AccountID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_KhataEntries_AccountID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_BCID' AND object_id = OBJECT_ID('dbo.KhataEntries'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_KhataEntries_BCID] ON [KhataEntries] ([BCID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_KhataEntries_BCID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_CSCAppID' AND object_id = OBJECT_ID('dbo.KhataEntries'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_KhataEntries_CSCAppID] ON [KhataEntries] ([CSCAppID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_KhataEntries_CSCAppID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_Customer' AND object_id = OBJECT_ID('dbo.KhataEntries'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_KhataEntries_Customer] ON [KhataEntries] ([CustomerID] ASC, [EntryDate] DESC, [CreatedAt] DESC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_KhataEntries_Customer: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_GlobalSerialNo' AND object_id = OBJECT_ID('dbo.KhataEntries'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_KhataEntries_GlobalSerialNo] ON [KhataEntries] ([GlobalSerialNo] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_KhataEntries_GlobalSerialNo: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_InvoiceID' AND object_id = OBJECT_ID('dbo.KhataEntries'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_KhataEntries_InvoiceID] ON [KhataEntries] ([InvoiceID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_KhataEntries_InvoiceID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_PaymentID' AND object_id = OBJECT_ID('dbo.KhataEntries'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_KhataEntries_PaymentID] ON [KhataEntries] ([PaymentID] ASC) WHERE ([PaymentID] IS NOT NULL);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_KhataEntries_PaymentID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_ReferenceNo' AND object_id = OBJECT_ID('dbo.KhataEntries'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_KhataEntries_ReferenceNo] ON [KhataEntries] ([ReferenceNo] ASC) WHERE ([ReferenceNo] IS NOT NULL);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_KhataEntries_ReferenceNo: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_SNCode' AND object_id = OBJECT_ID('dbo.KhataEntries'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_KhataEntries_SNCode] ON [KhataEntries] ([SNCode] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_KhataEntries_SNCode: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_SourceModule_SourceID' AND object_id = OBJECT_ID('dbo.KhataEntries'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_KhataEntries_SourceModule_SourceID] ON [KhataEntries] ([SourceModule] ASC, [SourceID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_KhataEntries_SourceModule_SourceID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KhataEntries_UserID' AND object_id = OBJECT_ID('dbo.KhataEntries'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_KhataEntries_UserID] ON [KhataEntries] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_KhataEntries_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Parties_IsActive_CurrentBalance' AND object_id = OBJECT_ID('dbo.Parties'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Parties_IsActive_CurrentBalance] ON [Parties] ([IsActive] ASC, [CurrentBalance] ASC) INCLUDE ([PartyName], [PartyType], [Phone]);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Parties_IsActive_CurrentBalance: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Parties_UserID' AND object_id = OBJECT_ID('dbo.Parties'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Parties_UserID] ON [Parties] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Parties_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RecTxn_AccountID' AND object_id = OBJECT_ID('dbo.RecurringTransactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_RecTxn_AccountID] ON [RecurringTransactions] ([AccountID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_RecTxn_AccountID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RecTxn_CategoryID' AND object_id = OBJECT_ID('dbo.RecurringTransactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_RecTxn_CategoryID] ON [RecurringTransactions] ([CategoryID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_RecTxn_CategoryID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RecTxn_PartyID' AND object_id = OBJECT_ID('dbo.RecurringTransactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_RecTxn_PartyID] ON [RecurringTransactions] ([PartyID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_RecTxn_PartyID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RecTxn_ToAccountID' AND object_id = OBJECT_ID('dbo.RecurringTransactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_RecTxn_ToAccountID] ON [RecurringTransactions] ([ToAccountID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_RecTxn_ToAccountID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RecurringTransactions_UserID' AND object_id = OBJECT_ID('dbo.RecurringTransactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_RecurringTransactions_UserID] ON [RecurringTransactions] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_RecurringTransactions_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ServiceRecords_GlobalSerialNo' AND object_id = OBJECT_ID('dbo.ServiceRecords'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_ServiceRecords_GlobalSerialNo] ON [ServiceRecords] ([GlobalSerialNo] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_ServiceRecords_GlobalSerialNo: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ServiceRecords_Module_Customer' AND object_id = OBJECT_ID('dbo.ServiceRecords'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_ServiceRecords_Module_Customer] ON [ServiceRecords] ([ModuleCode] ASC, [CustomerID] ASC, [RecordDate] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_ServiceRecords_Module_Customer: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ServiceRecords_ServiceID' AND object_id = OBJECT_ID('dbo.ServiceRecords'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_ServiceRecords_ServiceID] ON [ServiceRecords] ([ServiceID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_ServiceRecords_ServiceID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ServiceRecords_UserID' AND object_id = OBJECT_ID('dbo.ServiceRecords'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_ServiceRecords_UserID] ON [ServiceRecords] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_ServiceRecords_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SR_Customer_Date' AND object_id = OBJECT_ID('dbo.ServiceRecords'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_SR_Customer_Date] ON [ServiceRecords] ([CustomerID] ASC, [RecordDate] DESC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_SR_Customer_Date: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SR_Module_Date' AND object_id = OBJECT_ID('dbo.ServiceRecords'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_SR_Module_Date] ON [ServiceRecords] ([ModuleCode] ASC, [RecordDate] DESC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_SR_Module_Date: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SR_Ref' AND object_id = OBJECT_ID('dbo.ServiceRecords'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_SR_Ref] ON [ServiceRecords] ([ReferenceNo] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_SR_Ref: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_SR_Doc' AND object_id = OBJECT_ID('dbo.ServiceRecords'))
BEGIN
    BEGIN TRY
        CREATE UNIQUE NONCLUSTERED INDEX [UQ_SR_Doc] ON [ServiceRecords] ([ModuleCode] ASC, [DocCode] ASC) WHERE ([DocCode] IS NOT NULL);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index UQ_SR_Doc: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Transactions_AccountID' AND object_id = OBJECT_ID('dbo.Transactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Transactions_AccountID] ON [Transactions] ([AccountID] ASC, [TransType] ASC) INCLUDE ([Amount], [ToAccountID], [TransDate]);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Transactions_AccountID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Transactions_CategoryID' AND object_id = OBJECT_ID('dbo.Transactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Transactions_CategoryID] ON [Transactions] ([CategoryID] ASC, [TransType] ASC) INCLUDE ([Amount], [TransDate]);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Transactions_CategoryID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Transactions_GlobalSerialNo' AND object_id = OBJECT_ID('dbo.Transactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Transactions_GlobalSerialNo] ON [Transactions] ([GlobalSerialNo] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Transactions_GlobalSerialNo: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Transactions_PartyID' AND object_id = OBJECT_ID('dbo.Transactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Transactions_PartyID] ON [Transactions] ([PartyID] ASC, [TransType] ASC) INCLUDE ([Amount], [TransDate]);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Transactions_PartyID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Transactions_SNCode' AND object_id = OBJECT_ID('dbo.Transactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Transactions_SNCode] ON [Transactions] ([SNCode] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Transactions_SNCode: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Transactions_SourceModule_SourceID' AND object_id = OBJECT_ID('dbo.Transactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Transactions_SourceModule_SourceID] ON [Transactions] ([SourceModule] ASC, [SourceID] ASC, [LineType] ASC) WHERE ([SourceModule] IS NOT NULL);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Transactions_SourceModule_SourceID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Transactions_ToAccountID' AND object_id = OBJECT_ID('dbo.Transactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Transactions_ToAccountID] ON [Transactions] ([ToAccountID] ASC) INCLUDE ([Amount], [TransDate]);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Transactions_ToAccountID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Transactions_TransDate' AND object_id = OBJECT_ID('dbo.Transactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Transactions_TransDate] ON [Transactions] ([TransDate] DESC, [CreatedAt] DESC) INCLUDE ([Amount], [TransType], [AccountID], [ToAccountID], [CategoryID], [PartyID]);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Transactions_TransDate: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Transactions_UserID' AND object_id = OBJECT_ID('dbo.Transactions'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_Transactions_UserID] ON [Transactions] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_Transactions_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Txn_SourceLine' AND object_id = OBJECT_ID('dbo.Transactions'))
BEGIN
    BEGIN TRY
        CREATE UNIQUE NONCLUSTERED INDEX [UX_Txn_SourceLine] ON [Transactions] ([SourceModule] ASC, [SourceID] ASC, [LineType] ASC) WHERE ([SourceModule] IS NOT NULL AND [IsDeleted]=(0));
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index UX_Txn_SourceLine: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TxnModules_UserID' AND object_id = OBJECT_ID('dbo.TxnModules'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_TxnModules_UserID] ON [TxnModules] ([UserID] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_TxnModules_UserID: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_UniversalTxn_Entity' AND object_id = OBJECT_ID('dbo.UniversalTxnRegistry'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_UniversalTxn_Entity] ON [UniversalTxnRegistry] ([EntityName] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_UniversalTxn_Entity: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_UniversalTxn_ModuleCode' AND object_id = OBJECT_ID('dbo.UniversalTxnRegistry'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_UniversalTxn_ModuleCode] ON [UniversalTxnRegistry] ([ModuleCode] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_UniversalTxn_ModuleCode: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_UniversalTxn_TransDate' AND object_id = OBJECT_ID('dbo.UniversalTxnRegistry'))
BEGIN
    BEGIN TRY
        CREATE NONCLUSTERED INDEX [IX_UniversalTxn_TransDate] ON [UniversalTxnRegistry] ([TransDate] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index IX_UniversalTxn_TransDate: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_UniversalTxn_Module_Record_Active' AND object_id = OBJECT_ID('dbo.UniversalTxnRegistry'))
BEGIN
    BEGIN TRY
        CREATE UNIQUE NONCLUSTERED INDEX [UQ_UniversalTxn_Module_Record_Active] ON [UniversalTxnRegistry] ([SourceModule] ASC, [RecordID] ASC) WHERE ([IsActive]=(1));
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index UQ_UniversalTxn_Module_Record_Active: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_UniversalTxn_ModuleSerial' AND object_id = OBJECT_ID('dbo.UniversalTxnRegistry'))
BEGIN
    BEGIN TRY
        CREATE UNIQUE NONCLUSTERED INDEX [UQ_UniversalTxn_ModuleSerial] ON [UniversalTxnRegistry] ([SourceModule] ASC, [ModuleSerialNo] ASC) WHERE ([IsActive]=(1) AND [ModuleSerialNo] IS NOT NULL);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index UQ_UniversalTxn_ModuleSerial: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_UniversalTxnRegistry_SNCode' AND object_id = OBJECT_ID('dbo.UniversalTxnRegistry'))
BEGIN
    BEGIN TRY
        CREATE UNIQUE NONCLUSTERED INDEX [UQ_UniversalTxnRegistry_SNCode] ON [UniversalTxnRegistry] ([SNCode] ASC);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index UQ_UniversalTxnRegistry_SNCode: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Users_ApiToken' AND object_id = OBJECT_ID('dbo.Users'))
BEGIN
    BEGIN TRY
        CREATE UNIQUE NONCLUSTERED INDEX [UQ_Users_ApiToken] ON [Users] ([ApiToken] ASC) WHERE ([ApiToken] IS NOT NULL);
    END TRY
    BEGIN CATCH
        PRINT 'SKIP index UQ_Users_ApiToken: ' + ERROR_MESSAGE();
    END CATCH
END
GO

-- ---------------------------------------------------------------------------
-- 2. FOREIGN KEYS
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__BCTransac__CashA__1AD3FDA4')
BEGIN
    BEGIN TRY
        ALTER TABLE [BCTransactions] ADD CONSTRAINT [FK__BCTransac__CashA__1AD3FDA4] FOREIGN KEY ([CashAccountID]) REFERENCES [Accounts] ([AccountID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__BCTransac__CashA__1AD3FDA4: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__BCTransac__Porta__1BC821DD')
BEGIN
    BEGIN TRY
        ALTER TABLE [BCTransactions] ADD CONSTRAINT [FK__BCTransac__Porta__1BC821DD] FOREIGN KEY ([PortalAccountID]) REFERENCES [Accounts] ([AccountID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__BCTransac__Porta__1BC821DD: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__Bills__AccountID__797309D9')
BEGIN
    BEGIN TRY
        ALTER TABLE [Bills] ADD CONSTRAINT [FK__Bills__AccountID__797309D9] FOREIGN KEY ([AccountID]) REFERENCES [Accounts] ([AccountID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__Bills__AccountID__797309D9: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__Bills__CategoryI__7A672E12')
BEGIN
    BEGIN TRY
        ALTER TABLE [Bills] ADD CONSTRAINT [FK__Bills__CategoryI__7A672E12] FOREIGN KEY ([CategoryID]) REFERENCES [Categories] ([CategoryID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__Bills__CategoryI__7A672E12: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__Bills__PartyID__787EE5A0')
BEGIN
    BEGIN TRY
        ALTER TABLE [Bills] ADD CONSTRAINT [FK__Bills__PartyID__787EE5A0] FOREIGN KEY ([PartyID]) REFERENCES [Parties] ([PartyID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__Bills__PartyID__787EE5A0: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__Budgets__Categor__6C190EBB')
BEGIN
    BEGIN TRY
        ALTER TABLE [Budgets] ADD CONSTRAINT [FK__Budgets__Categor__6C190EBB] FOREIGN KEY ([CategoryID]) REFERENCES [Categories] ([CategoryID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__Budgets__Categor__6C190EBB: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__Categorie__Paren__5629CD9C')
BEGIN
    BEGIN TRY
        ALTER TABLE [Categories] ADD CONSTRAINT [FK__Categorie__Paren__5629CD9C] FOREIGN KEY ([ParentID]) REFERENCES [Categories] ([CategoryID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__Categorie__Paren__5629CD9C: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__ClientErr__UserI__351DDF8C')
BEGIN
    BEGIN TRY
        ALTER TABLE [ClientErrorLogs] ADD CONSTRAINT [FK__ClientErr__UserI__351DDF8C] FOREIGN KEY ([UserID]) REFERENCES [Users] ([UserID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__ClientErr__UserI__351DDF8C: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__InvoiceIt__Invoi__7C1A6C5A')
BEGIN
    BEGIN TRY
        ALTER TABLE [InvoiceItems] ADD CONSTRAINT [FK__InvoiceIt__Invoi__7C1A6C5A] FOREIGN KEY ([InvoiceID]) REFERENCES [Invoices] ([InvoiceID]) ON DELETE CASCADE;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__InvoiceIt__Invoi__7C1A6C5A: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__Invoices__Accoun__76619304')
BEGIN
    BEGIN TRY
        ALTER TABLE [Invoices] ADD CONSTRAINT [FK__Invoices__Accoun__76619304] FOREIGN KEY ([AccountID]) REFERENCES [Accounts] ([AccountID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__Invoices__Accoun__76619304: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__KhataEntr__Accou__05A3D694')
BEGIN
    BEGIN TRY
        ALTER TABLE [KhataEntries] ADD CONSTRAINT [FK__KhataEntr__Accou__05A3D694] FOREIGN KEY ([AccountID]) REFERENCES [Accounts] ([AccountID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__KhataEntr__Accou__05A3D694: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__KhataEntr__Invoi__04AFB25B')
BEGIN
    BEGIN TRY
        ALTER TABLE [KhataEntries] ADD CONSTRAINT [FK__KhataEntr__Invoi__04AFB25B] FOREIGN KEY ([InvoiceID]) REFERENCES [Invoices] ([InvoiceID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__KhataEntr__Invoi__04AFB25B: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__Recurring__Accou__71D1E811')
BEGIN
    BEGIN TRY
        ALTER TABLE [RecurringTransactions] ADD CONSTRAINT [FK__Recurring__Accou__71D1E811] FOREIGN KEY ([AccountID]) REFERENCES [Accounts] ([AccountID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__Recurring__Accou__71D1E811: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__Recurring__Categ__72C60C4A')
BEGIN
    BEGIN TRY
        ALTER TABLE [RecurringTransactions] ADD CONSTRAINT [FK__Recurring__Categ__72C60C4A] FOREIGN KEY ([CategoryID]) REFERENCES [Categories] ([CategoryID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__Recurring__Categ__72C60C4A: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__Recurring__Party__73BA3083')
BEGIN
    BEGIN TRY
        ALTER TABLE [RecurringTransactions] ADD CONSTRAINT [FK__Recurring__Party__73BA3083] FOREIGN KEY ([PartyID]) REFERENCES [Parties] ([PartyID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__Recurring__Party__73BA3083: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__Recurring__ToAcc__7908F585')
BEGIN
    BEGIN TRY
        ALTER TABLE [RecurringTransactions] ADD CONSTRAINT [FK__Recurring__ToAcc__7908F585] FOREIGN KEY ([ToAccountID]) REFERENCES [Accounts] ([AccountID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__Recurring__ToAcc__7908F585: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__Transacti__Accou__6383C8BA')
BEGIN
    BEGIN TRY
        ALTER TABLE [Transactions] ADD CONSTRAINT [FK__Transacti__Accou__6383C8BA] FOREIGN KEY ([AccountID]) REFERENCES [Accounts] ([AccountID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__Transacti__Accou__6383C8BA: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__Transacti__Categ__656C112C')
BEGIN
    BEGIN TRY
        ALTER TABLE [Transactions] ADD CONSTRAINT [FK__Transacti__Categ__656C112C] FOREIGN KEY ([CategoryID]) REFERENCES [Categories] ([CategoryID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__Transacti__Categ__656C112C: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__Transacti__Party__66603565')
BEGIN
    BEGIN TRY
        ALTER TABLE [Transactions] ADD CONSTRAINT [FK__Transacti__Party__66603565] FOREIGN KEY ([PartyID]) REFERENCES [Parties] ([PartyID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__Transacti__Party__66603565: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__Transacti__ToAcc__6477ECF3')
BEGIN
    BEGIN TRY
        ALTER TABLE [Transactions] ADD CONSTRAINT [FK__Transacti__ToAcc__6477ECF3] FOREIGN KEY ([ToAccountID]) REFERENCES [Accounts] ([AccountID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK__Transacti__ToAcc__6477ECF3: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Accounts_Users')
BEGIN
    BEGIN TRY
        ALTER TABLE [Accounts] ADD CONSTRAINT [FK_Accounts_Users] FOREIGN KEY ([UserID]) REFERENCES [Users] ([UserID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_Accounts_Users: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_BCCounterSessions_Users')
BEGIN
    BEGIN TRY
        ALTER TABLE [BCCounterSessions] ADD CONSTRAINT [FK_BCCounterSessions_Users] FOREIGN KEY ([UserID]) REFERENCES [Users] ([UserID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_BCCounterSessions_Users: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_BCTransactions_Customer')
BEGIN
    BEGIN TRY
        ALTER TABLE [BCTransactions] ADD CONSTRAINT [FK_BCTransactions_Customer] FOREIGN KEY ([CustomerID]) REFERENCES [Customers] ([CustomerID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_BCTransactions_Customer: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_BCTransactions_Users')
BEGIN
    BEGIN TRY
        ALTER TABLE [BCTransactions] ADD CONSTRAINT [FK_BCTransactions_Users] FOREIGN KEY ([UserID]) REFERENCES [Users] ([UserID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_BCTransactions_Users: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Bills_Users')
BEGIN
    BEGIN TRY
        ALTER TABLE [Bills] ADD CONSTRAINT [FK_Bills_Users] FOREIGN KEY ([UserID]) REFERENCES [Users] ([UserID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_Bills_Users: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Budgets_Users')
BEGIN
    BEGIN TRY
        ALTER TABLE [Budgets] ADD CONSTRAINT [FK_Budgets_Users] FOREIGN KEY ([UserID]) REFERENCES [Users] ([UserID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_Budgets_Users: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Categories_Users')
BEGIN
    BEGIN TRY
        ALTER TABLE [Categories] ADD CONSTRAINT [FK_Categories_Users] FOREIGN KEY ([UserID]) REFERENCES [Users] ([UserID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_Categories_Users: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CSCApplications_Users')
BEGIN
    BEGIN TRY
        ALTER TABLE [CSCApplications] ADD CONSTRAINT [FK_CSCApplications_Users] FOREIGN KEY ([UserID]) REFERENCES [Users] ([UserID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_CSCApplications_Users: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CSCServices_Users')
BEGIN
    BEGIN TRY
        ALTER TABLE [CSCServices] ADD CONSTRAINT [FK_CSCServices_Users] FOREIGN KEY ([UserID]) REFERENCES [Users] ([UserID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_CSCServices_Users: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Customers_ParentCustomer')
BEGIN
    BEGIN TRY
        ALTER TABLE [Customers] ADD CONSTRAINT [FK_Customers_ParentCustomer] FOREIGN KEY ([ParentCustomerID]) REFERENCES [Customers] ([CustomerID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_Customers_ParentCustomer: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Customers_Users')
BEGIN
    BEGIN TRY
        ALTER TABLE [Customers] ADD CONSTRAINT [FK_Customers_Users] FOREIGN KEY ([UserID]) REFERENCES [Users] ([UserID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_Customers_Users: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Documents_Customer')
BEGIN
    BEGIN TRY
        ALTER TABLE [Documents] ADD CONSTRAINT [FK_Documents_Customer] FOREIGN KEY ([CustomerID]) REFERENCES [Customers] ([CustomerID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_Documents_Customer: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Documents_Users')
BEGIN
    BEGIN TRY
        ALTER TABLE [Documents] ADD CONSTRAINT [FK_Documents_Users] FOREIGN KEY ([UserID]) REFERENCES [Users] ([UserID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_Documents_Users: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_FieldDefinitions_Services')
BEGIN
    BEGIN TRY
        ALTER TABLE [FieldDefinitions] ADD CONSTRAINT [FK_FieldDefinitions_Services] FOREIGN KEY ([ServiceID]) REFERENCES [CSCServices] ([ServiceID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_FieldDefinitions_Services: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_FieldDefs_Module')
BEGIN
    BEGIN TRY
        ALTER TABLE [FieldDefinitions] ADD CONSTRAINT [FK_FieldDefs_Module] FOREIGN KEY ([ModuleCode]) REFERENCES [TxnModules] ([ModuleCode]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_FieldDefs_Module: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Invoices_Customer')
BEGIN
    BEGIN TRY
        ALTER TABLE [Invoices] ADD CONSTRAINT [FK_Invoices_Customer] FOREIGN KEY ([CustomerID]) REFERENCES [Customers] ([CustomerID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_Invoices_Customer: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Invoices_Users')
BEGIN
    BEGIN TRY
        ALTER TABLE [Invoices] ADD CONSTRAINT [FK_Invoices_Users] FOREIGN KEY ([UserID]) REFERENCES [Users] ([UserID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_Invoices_Users: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_KhataEntries_Customer')
BEGIN
    BEGIN TRY
        ALTER TABLE [KhataEntries] ADD CONSTRAINT [FK_KhataEntries_Customer] FOREIGN KEY ([CustomerID]) REFERENCES [Customers] ([CustomerID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_KhataEntries_Customer: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_KhataEntries_Users')
BEGIN
    BEGIN TRY
        ALTER TABLE [KhataEntries] ADD CONSTRAINT [FK_KhataEntries_Users] FOREIGN KEY ([UserID]) REFERENCES [Users] ([UserID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_KhataEntries_Users: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Parties_Users')
BEGIN
    BEGIN TRY
        ALTER TABLE [Parties] ADD CONSTRAINT [FK_Parties_Users] FOREIGN KEY ([UserID]) REFERENCES [Users] ([UserID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_Parties_Users: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_RecurringTransactions_Users')
BEGIN
    BEGIN TRY
        ALTER TABLE [RecurringTransactions] ADD CONSTRAINT [FK_RecurringTransactions_Users] FOREIGN KEY ([UserID]) REFERENCES [Users] ([UserID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_RecurringTransactions_Users: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ServiceRecords_Customers')
BEGIN
    BEGIN TRY
        ALTER TABLE [ServiceRecords] ADD CONSTRAINT [FK_ServiceRecords_Customers] FOREIGN KEY ([CustomerID]) REFERENCES [Customers] ([CustomerID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_ServiceRecords_Customers: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ServiceRecords_Services')
BEGIN
    BEGIN TRY
        ALTER TABLE [ServiceRecords] ADD CONSTRAINT [FK_ServiceRecords_Services] FOREIGN KEY ([ServiceID]) REFERENCES [CSCServices] ([ServiceID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_ServiceRecords_Services: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ServiceRecords_Users')
BEGIN
    BEGIN TRY
        ALTER TABLE [ServiceRecords] ADD CONSTRAINT [FK_ServiceRecords_Users] FOREIGN KEY ([UserID]) REFERENCES [Users] ([UserID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_ServiceRecords_Users: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SR_Module')
BEGIN
    BEGIN TRY
        ALTER TABLE [ServiceRecords] ADD CONSTRAINT [FK_SR_Module] FOREIGN KEY ([ModuleCode]) REFERENCES [TxnModules] ([ModuleCode]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_SR_Module: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Transactions_Users')
BEGIN
    BEGIN TRY
        ALTER TABLE [Transactions] ADD CONSTRAINT [FK_Transactions_Users] FOREIGN KEY ([UserID]) REFERENCES [Users] ([UserID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_Transactions_Users: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_TxnModules_Users')
BEGIN
    BEGIN TRY
        ALTER TABLE [TxnModules] ADD CONSTRAINT [FK_TxnModules_Users] FOREIGN KEY ([UserID]) REFERENCES [Users] ([UserID]) ;
    END TRY
    BEGIN CATCH
        PRINT 'SKIP FK FK_TxnModules_Users: ' + ERROR_MESSAGE();
    END CATCH
END
GO

-- ---------------------------------------------------------------------------
-- 3. CHECK CONSTRAINTS
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ServiceRecords_NonNegative' AND parent_object_id = OBJECT_ID('dbo.ServiceRecords'))
BEGIN
    BEGIN TRY
        ALTER TABLE [ServiceRecords] WITH CHECK ADD CONSTRAINT [CK_ServiceRecords_NonNegative] CHECK ([GovtFee]>=(0) AND [OperatorFee]>=(0) AND [TotalFee]>=(0) AND [PaidAmount]>=(0) AND [BalanceAmount]>=(0));
    END TRY
    BEGIN CATCH
        PRINT 'SKIP CHECK CK_ServiceRecords_NonNegative: ' + ERROR_MESSAGE();
    END CATCH
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_SR_Amount' AND parent_object_id = OBJECT_ID('dbo.ServiceRecords'))
BEGIN
    BEGIN TRY
        ALTER TABLE [ServiceRecords] WITH CHECK ADD CONSTRAINT [CK_SR_Amount] CHECK ([Amount]>=(0) AND [Charge]>=(0) AND [DueAmount]>=(0));
    END TRY
    BEGIN CATCH
        PRINT 'SKIP CHECK CK_SR_Amount: ' + ERROR_MESSAGE();
    END CATCH
END
GO