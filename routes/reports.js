const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const ExcelJS = require('exceljs');
const { escapeLike, parseId, todayLocal, monthRange, yearRange, clampInt } = require('../utils/helpers');

// Helper to escape/sanitize string for like queries
// % aur _ escape karo taaki user search pattern inject na kar sake
function safeLike(val) {
    if (!val) return '%';
    return `%${escapeLike(String(val).trim())}%`;
}

function invoiceMirrorHasPaymentHistory(transactionAlias) {
    return `${transactionAlias}.SourceModule = 'Invoices'
        AND ${transactionAlias}.LineType = 'PAYMENT_IN'
        AND EXISTS (
            SELECT 1
            FROM KhataEntries paymentHistory
            WHERE paymentHistory.UserID = ${transactionAlias}.UserID
              AND paymentHistory.InvoiceID = ${transactionAlias}.SourceID
              AND paymentHistory.EntryType = 'Got'
            GROUP BY paymentHistory.UserID, paymentHistory.InvoiceID
            HAVING SUM(paymentHistory.Amount) = ${transactionAlias}.Amount
        )`;
}

// Base root redirect to KPIs
router.get('/', (req, res) => res.redirect('/api/reports/kpis'));

// ============================================================================
// 1. GET /api/reports/kpis - Universal Aggregate KPIs across ALL Modules
// ============================================================================
router.get('/kpis', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const { startDate, endDate } = req.query;

        let dateCondTrans = '';
        let dateCondCSC = '';
        let dateCondBC = '';
        let dateCondKhata = '';
        const params = { userId };

        if (startDate && endDate) {
            dateCondTrans = ' AND t.TransDate >= @startDate AND t.TransDate <= @endDate';
            dateCondCSC = ' AND CAST(c.ApplyDate AS DATE) >= @startDate AND CAST(c.ApplyDate AS DATE) <= @endDate';
            dateCondBC = ' AND b.TransDate >= @startDate AND b.TransDate <= @endDate';
            dateCondKhata = ' AND k.EntryDate >= @startDate AND k.EntryDate <= @endDate';
            params.startDate = startDate;
            params.endDate = endDate;
        } else if (startDate) {
            dateCondTrans = ' AND t.TransDate >= @startDate';
            dateCondCSC = ' AND CAST(c.ApplyDate AS DATE) >= @startDate';
            dateCondBC = ' AND b.TransDate >= @startDate';
            dateCondKhata = ' AND k.EntryDate >= @startDate';
            params.startDate = startDate;
        } else if (endDate) {
            dateCondTrans = ' AND t.TransDate <= @endDate';
            dateCondCSC = ' AND CAST(c.ApplyDate AS DATE) <= @endDate';
            dateCondBC = ' AND b.TransDate <= @endDate';
            dateCondKhata = ' AND k.EntryDate <= @endDate';
            params.endDate = endDate;
        }

        // Cashbook transactions KPIs
        const transQuery = await query(`
            WITH CashbookRows AS (
                SELECT t.TransType, t.Amount
                FROM Transactions t
                WHERE t.UserID = @userId AND t.IsDeleted = 0
                  AND NOT (${invoiceMirrorHasPaymentHistory('t')}) ${dateCondTrans}

                UNION ALL

                SELECT 'Income', k.Amount
                FROM KhataEntries k
                WHERE k.UserID = @userId AND k.EntryType = 'Got'
                  AND k.InvoiceID IS NOT NULL ${dateCondKhata}
                  AND EXISTS (
                      SELECT 1
                      FROM Transactions mirror
                      WHERE mirror.UserID = k.UserID
                        AND mirror.SourceModule = 'Invoices'
                        AND mirror.SourceID = k.InvoiceID
                        AND mirror.LineType = 'PAYMENT_IN'
                        AND mirror.IsDeleted = 0
                        AND mirror.Amount = (
                            SELECT SUM(paymentHistory.Amount)
                            FROM KhataEntries paymentHistory
                            WHERE paymentHistory.UserID = k.UserID
                              AND paymentHistory.InvoiceID = k.InvoiceID
                              AND paymentHistory.EntryType = 'Got'
                        )
                  )
            )
            SELECT 
                ISNULL(SUM(CASE WHEN t.TransType = 'Income' THEN t.Amount ELSE 0 END), 0) as TotalIncome,
                ISNULL(SUM(CASE WHEN t.TransType = 'Expense' THEN t.Amount ELSE 0 END), 0) as TotalExpense,
                ISNULL(SUM(CASE WHEN t.TransType = 'Transfer' THEN t.Amount ELSE 0 END), 0) as TotalTransfer,
                ISNULL(SUM(CASE WHEN t.TransType = 'Loan Given' THEN t.Amount ELSE 0 END), 0) as TotalLoanGiven,
                ISNULL(SUM(CASE WHEN t.TransType = 'Loan Received' THEN t.Amount ELSE 0 END), 0) as TotalLoanReceived,
                ISNULL(SUM(CASE WHEN t.TransType = 'Loan Repay' THEN t.Amount ELSE 0 END), 0) as TotalLoanRepay,
                COUNT(*) as TotalTransCount
            FROM CashbookRows t
        `, params);

        // CSC Applications KPIs
        const cscQuery = await query(`
            SELECT
                COUNT(*) as CSCCount,
                ISNULL(SUM(c.TotalFee), 0) as CSCTotalFees,
                ISNULL(SUM(c.GovtFee), 0) as CSCGovtFees,
                ISNULL(SUM(c.OperatorFee), 0) as CSCOperatorProfit,
                ISNULL(SUM(c.DueAmount), 0) as CSCDueAmount,
                ISNULL(SUM(c.PaidAmount), 0) as CSCPaidAmount,
                ISNULL(SUM(CASE WHEN c.Status IN ('Completed', 'Delivered', 'Approved') THEN 1 ELSE 0 END), 0) as CSCCompletedCount,
                ISNULL(SUM(CASE WHEN c.Status IN ('Applied', 'Pending', 'In Progress', 'Under Process') THEN 1 ELSE 0 END), 0) as CSCPendingCount
            FROM CSCApplications c
            WHERE c.IsActive = 1 AND c.UserID = @userId ${dateCondCSC}
        `, params);

        // CSC me se auto-settle (advance se kata paisa) nikalo
        const cscSettleQuery = await query(`
            SELECT ISNULL(SUM(k.Amount), 0) as CSCAutoSettled
            FROM KhataEntries k
            WHERE k.EntryType = 'Settlement' AND k.CSCAppID IS NOT NULL AND k.UserID = @userId ${dateCondKhata}
        `, params);

        // BC Banking KPIs
        const bcQuery = await query(`
            SELECT
                COUNT(*) as BCCount,
                ISNULL(SUM(b.Amount), 0) as BCTotalVolume,
                ISNULL(SUM(b.CommissionEarned), 0) as BCTotalCommission,
                ISNULL(SUM(b.CustomerCharge), 0) as BCTotalCharge,
                ISNULL(SUM(b.NetProfit), 0) as BCNetProfit,
                ISNULL(SUM(CASE WHEN b.ServiceType = 'Cash Withdrawal' THEN b.Amount ELSE 0 END), 0) as BCWithdrawal,
                ISNULL(SUM(CASE WHEN b.ServiceType = 'Cash Deposit' THEN b.Amount ELSE 0 END), 0) as BCDeposit
            FROM BCTransactions b
            WHERE b.Status = 'Success' AND b.UserID = @userId ${dateCondBC}
        `, params);

        // BC ka shulk jo udhaar (Khata 'Gave') me daala gaya
        const bcKhataQuery = await query(`
            SELECT ISNULL(SUM(k.Amount), 0) as BCChargeOnKhata
            FROM KhataEntries k
            WHERE k.EntryType = 'Gave' AND k.BCID IS NOT NULL AND k.UserID = @userId ${dateCondKhata}
        `, params);

        // Customer Khata KPIs
        const khataQuery = await query(`
            SELECT
                COUNT(*) as KhataCount,
                ISNULL(SUM(CASE WHEN k.EntryType = 'Gave' THEN k.Amount ELSE 0 END), 0) as KhataUdhaarGave,
                ISNULL(SUM(CASE WHEN k.EntryType = 'Got' THEN k.Amount ELSE 0 END), 0) as KhataJamaGot,
                ISNULL(SUM(CASE WHEN k.EntryType = 'Got' AND k.AccountID IS NULL AND k.CSCAppID IS NULL AND k.BCID IS NULL THEN k.Amount ELSE 0 END), 0) as KhataGotNoAccount
            FROM KhataEntries k
            WHERE k.UserID = @userId ${dateCondKhata}
        `, params);

        // Overall Accounts Live Balances (Current Snapshot)
        const accountsQuery = await query(`
            SELECT 
                ISNULL(SUM(CurrentBalance), 0) as TotalNetBalance,
                ISNULL(SUM(CASE WHEN AccountType = 'Cash' THEN CurrentBalance ELSE 0 END), 0) as CashInHandBalance,
                ISNULL(SUM(CASE WHEN AccountType = 'Bank' THEN CurrentBalance ELSE 0 END), 0) as BankAccountsBalance,
                ISNULL(SUM(CASE WHEN AccountType IN ('UPI', 'Digipay', 'Portal', 'Wallet', 'Other') THEN CurrentBalance ELSE 0 END), 0) as WalletsBalance
            FROM Accounts
            WHERE IsActive = 1 AND UserID = @userId
        `, { userId });

        // Market Udhaar Outstanding Snapshot (All customers with positive balance)
        const marketUdhaarQuery = await query(`
            SELECT 
                ISNULL(SUM(CASE WHEN CurrentBalance > 0 THEN CurrentBalance ELSE 0 END), 0) as TotalMarketUdhaar,
                ISNULL(SUM(CASE WHEN CurrentBalance < 0 THEN ABS(CurrentBalance) ELSE 0 END), 0) as TotalAdvanceJama
            FROM Customers
            WHERE IsActive = 1 AND UserID = @userId
        `, { userId });

        // Loans Pending Snapshot (Parties)
        const partiesQuery = await query(`
            SELECT 
                ISNULL(SUM(CASE WHEN CurrentBalance > 0 THEN CurrentBalance ELSE 0 END), 0) as TotalLoansPendingFromParties,
                ISNULL(SUM(CASE WHEN CurrentBalance < 0 THEN ABS(CurrentBalance) ELSE 0 END), 0) as TotalLoansOwedToParties
            FROM Parties
            WHERE IsActive = 1 AND UserID = @userId
        `, { userId });

        // Bill Payments KPIs (Fix F3: post BP commission into total profit)
        let dateCondBP = '';
        if (startDate && endDate) {
            dateCondBP = ' AND bp.PaymentDate >= @startDate AND bp.PaymentDate <= @endDate';
        } else if (startDate) {
            dateCondBP = ' AND bp.PaymentDate >= @startDate';
        } else if (endDate) {
            dateCondBP = ' AND bp.PaymentDate <= @endDate';
        }

        const bpQuery = await query(`
            SELECT
                COUNT(*) as BPCount,
                ISNULL(SUM(bp.TotalCollected), 0) as BPTotalCollected,
                ISNULL(SUM(bp.BillAmount), 0) as BPBillAmount,
                ISNULL(SUM(bp.CustomerCharge), 0) as BPCustomerCharge,
                ISNULL(SUM(bp.CommissionEarned), 0) as BPCommissionEarned,
                ISNULL(SUM(bp.NetProfit), 0) as BPNetProfit
            FROM BillPayments bp
            WHERE bp.IsDeleted = 0 AND bp.UserID = @userId ${dateCondBP}
        `, params);

        // Aadhaar UCL KPIs
        let dateCondUCL = '';
        if (startDate && endDate) {
            dateCondUCL = ' AND CAST(u.UpdateDate AS DATE) >= @startDate AND CAST(u.UpdateDate AS DATE) <= @endDate';
        } else if (startDate) {
            dateCondUCL = ' AND CAST(u.UpdateDate AS DATE) >= @startDate';
        } else if (endDate) {
            dateCondUCL = ' AND CAST(u.UpdateDate AS DATE) <= @endDate';
        }
        const uclQuery = await query(`
            SELECT
                COUNT(*) as UCLCount,
                ISNULL(SUM(u.TotalAmount), 0) as UCLTotalAmount,
                ISNULL(SUM(u.PaidAmount), 0) as UCLPaidAmount,
                ISNULL(SUM(u.BalanceAmount), 0) as UCLDueAmount
            FROM UCLUpdates u
            WHERE ISNULL(u.IsDeleted, 0) = 0 AND u.UserID = @userId ${dateCondUCL}
        `, params);

        const t = transQuery.recordset[0] || {};
        const c = cscQuery.recordset[0] || {};
        const cs = cscSettleQuery.recordset[0] || {};
        const b = bcQuery.recordset[0] || {};
        const bk = bcKhataQuery.recordset[0] || {};
        const k = khataQuery.recordset[0] || {};
        const acc = accountsQuery.recordset[0] || {};
        const mkt = marketUdhaarQuery.recordset[0] || {};
        const pty = partiesQuery.recordset[0] || {};

        // --- Aggregate Totals (DOUBLE-COUNT FREE) ---
        // Rules:
        //  1. Cashbook (Transactions) = shop ki asli cash/bank ledger (includes CSC Income & Govt Expense)
        //  2. BC Commission & Cash Extra Charge are added to Income
        //  3. Khata entries without account link (KhataGotNoAccount) are added to Income
        //  4. No double-counting: CSC applications and Govt fees are already posted in Transactions ledger
        const bcCashCharge = Math.max(0, (b.BCTotalCharge || 0) - (bk.BCChargeOnKhata || 0));

        const bp = bpQuery.recordset[0] || {};
        const totalIncome = (t.TotalIncome || 0)
            + (b.BCTotalCommission || 0)
            + bcCashCharge
            + (bp.BPCommissionEarned || 0)
            + (k.KhataGotNoAccount || 0);

        const totalExpense = (t.TotalExpense || 0);

        const netProfit = totalIncome - totalExpense;

        res.json({
            success: true,
            data: {
                totalIncome,
                totalExpense,
                netProfit,
                cashbook: t,
                csc: c,
                cscSettlement: { autoSettled: cs.CSCAutoSettled || 0, receivedDirect: Math.max(0, (c.CSCPaidAmount || 0) - (cs.CSCAutoSettled || 0)) },
                bc: b,
                bcKhata: { chargeOnKhata: bk.BCChargeOnKhata || 0, cashCharge: bcCashCharge },
                khata: k,
                accounts: acc,
                marketUdhaar: mkt,
                parties: pty,
                billPayments: bp,
            ucl: uclQuery.recordset[0] || {}
            }
        });
    } catch (err) {
        console.error('Error fetching report KPIs:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// 2. GET /api/reports/master - Universal Master Feed across ANY or ALL Modules
// ============================================================================
router.get('/master', async (req, res) => {
    try {
        const {
            module = 'all',
            startDate,
            endDate,
            type,
            accountId,
            categoryId,
            customerId,
            status,
            search,
            limit = 150,
            offset = 0
        } = req.query;

        // Negative/NaN limit ya offset SQL me jaata tha -> FETCH NEXT -5 ROWS ONLY -> 500 error.
        const maxLimit = clampInt(limit, 1, 500, 150);
        const skip = clampInt(offset, 0, 1000000, 0);

        let records = [];
        let totalCount = 0;
        let summary = {
            totalAmount: 0,
            totalIncome: 0,
            totalExpense: 0,
            totalProfit: 0
        };

        const userId = req.user.UserID;
        const params = {
            limit: maxLimit,
            offset: skip,
            search: safeLike(search),
            userId
        };

        let dateCondTrans = '';
        let dateCondCSC = '';
        let dateCondBC = '';
        let dateCondKhata = '';
        let dateCondInvoices = '';
        let dateCondBP = '';
        let dateCondUCL = '';

        if (startDate && endDate) {
            dateCondTrans = ' AND t.TransDate >= @startDate AND t.TransDate <= @endDate';
            dateCondCSC = ' AND CAST(c.ApplyDate AS DATE) >= @startDate AND CAST(c.ApplyDate AS DATE) <= @endDate';
            dateCondBC = ' AND b.TransDate >= @startDate AND b.TransDate <= @endDate';
            dateCondKhata = ' AND k.EntryDate >= @startDate AND k.EntryDate <= @endDate';
            dateCondInvoices = ' AND i.InvoiceDate >= @startDate AND i.InvoiceDate <= @endDate';
            dateCondBP = ' AND bp.PaymentDate >= @startDate AND bp.PaymentDate <= @endDate';
            dateCondUCL = ' AND CAST(u.UpdateDate AS DATE) >= @startDate AND CAST(u.UpdateDate AS DATE) <= @endDate';
            params.startDate = startDate;
            params.endDate = endDate;
        } else if (startDate) {
            dateCondTrans = ' AND t.TransDate >= @startDate';
            dateCondCSC = ' AND CAST(c.ApplyDate AS DATE) >= @startDate';
            dateCondBC = ' AND b.TransDate >= @startDate';
            dateCondKhata = ' AND k.EntryDate >= @startDate';
            dateCondInvoices = ' AND i.InvoiceDate >= @startDate';
            dateCondBP = ' AND bp.PaymentDate >= @startDate';
            dateCondUCL = ' AND CAST(u.UpdateDate AS DATE) >= @startDate';
            params.startDate = startDate;
        } else if (endDate) {
            dateCondTrans = ' AND t.TransDate <= @endDate';
            dateCondCSC = ' AND CAST(c.ApplyDate AS DATE) <= @endDate';
            dateCondBC = ' AND b.TransDate <= @endDate';
            dateCondKhata = ' AND k.EntryDate <= @endDate';
            dateCondInvoices = ' AND i.InvoiceDate <= @endDate';
            dateCondBP = ' AND bp.PaymentDate <= @endDate';
            dateCondUCL = ' AND CAST(u.UpdateDate AS DATE) <= @endDate';
            params.endDate = endDate;
        }

        // ======================== MODULE: ALL (UNIVERSAL UNION) ========================
        if (module === 'all') {
            let whereClause = 'WHERE 1=1';
            if (search) {
                whereClause += ` AND (
                    SNCode LIKE @search ESCAPE '\\' OR
                    ModuleCode LIKE @search ESCAPE '\\' OR
                    EntityName LIKE @search ESCAPE '\\' OR
                    Title LIKE @search ESCAPE '\\' OR
                    CategoryOrService LIKE @search ESCAPE '\\' OR
                    RefNumber LIKE @search ESCAPE '\\' OR
                    AccountName LIKE @search ESCAPE '\\' OR
                    EntryType LIKE @search ESCAPE '\\'
                )`;
            }
            if (type && type !== 'all') {
                if (type === 'CSC' || type === 'CSC Application') {
                    whereClause += ` AND SourceModule = 'CSC'`;
                } else if (type === 'BC' || type === 'BC Banking') {
                    whereClause += ` AND SourceModule = 'BC Banking'`;
                } else if (type === 'BillPay') {
                    whereClause += ` AND SourceModule = 'BillPay'`;
                } else if (type === 'UCL') {
                    whereClause += ` AND SourceModule = 'UCL'`;
                } else if (type === 'Cashbook') {
                    whereClause += ` AND SourceModule = 'Cashbook'`;
                } else {
                    whereClause += ` AND (EntryType = @type OR SourceModule = @type OR CategoryOrService = @type OR CategoryOrService LIKE @typePattern OR Title LIKE @typePattern)`;
                    params.type = type;
                    params.typePattern = '%' + type + '%';
                }
            }
            if (status && status !== 'all') {
                if (status === 'Completed' || status === 'Success' || status === 'Delivered') {
                    whereClause += ` AND Status IN ('Completed', 'Success', 'Delivered', 'Approved', 'Recorded')`;
                } else if (status === 'Pending') {
                    whereClause += ` AND Status IN ('Pending', 'Applied', 'In Progress', 'Under Process')`;
                } else if (status === 'Failed' || status === 'Rejected') {
                    whereClause += ` AND Status IN ('Failed', 'Rejected', 'Cancelled')`;
                } else {
                    whereClause += ` AND Status = @status`;
                    params.status = status;
                }
            }
            if (customerId && customerId !== 'all') {
                whereClause += ` AND CustomerID = @customerId`;
                params.customerId = parseInt(customerId, 10) || 0;
            }
            if (accountId && accountId !== 'all') {
                whereClause += ` AND AccountName IN (SELECT AccountName FROM Accounts WHERE AccountID = @accountId AND UserID = @userId)`;
                params.accountId = parseInt(accountId, 10) || 0;
            }
            if (categoryId && categoryId !== 'all') {
                whereClause += ` AND CategoryOrService IN (SELECT CategoryName FROM Categories WHERE CategoryID = @categoryId)`;
                params.categoryId = parseInt(categoryId, 10) || 0;
            }

            const unionSql = `
                WITH MasterUnion AS (
                    -- 1. Cashbook Transactions
                    SELECT 
                        'Cashbook' as SourceModule,
                        t.TransactionID as RecordID,
                        t.GlobalSerialNo as GlobalSerialNo,
                        t.SNCode as SNCode,
                        t.ModuleCode as ModuleCode,
                        t.TransDate as RecordDate,
                        CAST(ISNULL(t.TransTime, CAST(t.CreatedAt AS TIME)) AS VARCHAR(8)) as RecordTime,
                        ISNULL(t.Description, t.TransType) as Title,
                        COALESCE(p.PartyName, a.AccountName, 'General') as EntityName,
                        ISNULL(c.CategoryName, t.TransType) as CategoryOrService,
                        t.Reference as RefNumber,
                        a.AccountName as AccountName,
                        t.TransType as EntryType,
                        t.Amount as Amount,
                        CASE 
                            WHEN t.TransType = 'Income' THEN t.Amount 
                            WHEN t.TransType = 'Expense' THEN -t.Amount
                            ELSE 0 
                        END as ProfitOrNet,
                        NULL as CustomerID,
                        'Completed' as Status,
                        ISNULL(t.CreatedAt, CAST(t.TransDate AS DATETIME)) as SortDate
                    FROM Transactions t
                    LEFT JOIN Accounts a ON t.AccountID = a.AccountID
                    LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
                    LEFT JOIN Parties p ON t.PartyID = p.PartyID
                    WHERE t.UserID = @userId AND t.IsDeleted = 0
                      AND NOT (${invoiceMirrorHasPaymentHistory('t')})
                      AND (t.SourceModule IS NULL OR t.SourceModule NOT IN ('CSC', 'BillPay', 'UCL'))
                      AND (t.Tags IS NULL OR (t.Tags NOT LIKE '%CSC_FEE_IN%' AND t.Tags NOT LIKE '%CSC_GOVT_FEE_OUT%')) ${dateCondTrans}

                    UNION ALL

                    -- 2. CSC Applications
                    SELECT 
                        'CSC' as SourceModule,
                        c.AppID as RecordID,
                        c.GlobalSerialNo as GlobalSerialNo,
                        c.SNCode as SNCode,
                        c.ModuleCode as ModuleCode,
                        CAST(c.ApplyDate AS DATE) as RecordDate,
                        CAST(ISNULL(CAST(c.CreatedAt AS TIME), CAST(c.ApplyDate AS TIME)) AS VARCHAR(8)) as RecordTime,
                        c.ServiceType as Title,
                        c.CustomerName as EntityName,
                        c.ServiceType as CategoryOrService,
                        c.AckNumber as RefNumber,
                        ISNULL(c.PaymentMode, 'Cash') as AccountName,
                        'CSC Application' as EntryType,
                        c.TotalFee as Amount,
                        c.OperatorFee as ProfitOrNet,
                        c.CustomerID as CustomerID,
                        c.Status as Status,
                        ISNULL(c.CreatedAt, c.ApplyDate) as SortDate
                    FROM CSCApplications c
                    WHERE c.IsActive = 1 AND c.UserID = @userId ${dateCondCSC}

                    UNION ALL

                    -- 3. BC Transactions
                    SELECT 
                        'BC Banking' as SourceModule,
                        b.BCID as RecordID,
                        b.GlobalSerialNo as GlobalSerialNo,
                        b.SNCode as SNCode,
                        b.ModuleCode as ModuleCode,
                        b.TransDate as RecordDate,
                        CAST(ISNULL(b.TransTime, CAST(b.CreatedAt AS TIME)) AS VARCHAR(8)) as RecordTime,
                        b.ServiceType + CASE WHEN b.BankName IS NOT NULL AND b.BankName != '' THEN ' - ' + b.BankName ELSE '' END as Title,
                        COALESCE(b.CustomerName, b.CustomerPhone, 'Walk-in Customer') as EntityName,
                        b.ServiceType as CategoryOrService,
                        b.RRN_UTR as RefNumber,
                        ISNULL(ca.AccountName, 'BC Counter') as AccountName,
                        b.ServiceType as EntryType,
                        b.Amount as Amount,
                        ISNULL(b.NetProfit, 0) as ProfitOrNet,
                        b.CustomerID as CustomerID,
                        b.Status as Status,
                        ISNULL(b.CreatedAt, CAST(b.TransDate AS DATETIME)) as SortDate
                    FROM BCTransactions b
                    LEFT JOIN Accounts ca ON b.CashAccountID = ca.AccountID
                    WHERE b.UserID = @userId ${dateCondBC}

                    UNION ALL

                    -- 4. Customer Khata Entries
                    SELECT 
                        'Khata' as SourceModule,
                        k.KhataID as RecordID,
                        k.GlobalSerialNo as GlobalSerialNo,
                        k.SNCode as SNCode,
                        k.ModuleCode as ModuleCode,
                        k.EntryDate as RecordDate,
                        ISNULL(NULLIF(k.EntryTime, ''), CAST(CAST(k.CreatedAt AS TIME) AS VARCHAR(8))) as RecordTime,
                        ISNULL(k.Description, CASE
                            WHEN k.EntryType = 'Gave' THEN 'Udhaar Diya'
                            WHEN k.EntryType = 'Got' THEN 'Jama Mila'
                            WHEN k.EntryType = 'Settlement' THEN 'Advance se Settlement'
                            ELSE 'BC Flow' END) as Title,
                        cust.CustomerName as EntityName,
                        'Khata Udhaar / Jama' as CategoryOrService,
                        k.ReferenceNo as RefNumber,
                        ISNULL(k.PaymentMode, 'Cash') as AccountName,
                        CASE
                            WHEN k.EntryType = 'Gave' THEN 'Udhaar (Debit)'
                            WHEN k.EntryType = 'Got' THEN 'Jama (Credit)'
                            WHEN k.EntryType = 'Settlement' THEN 'Settlement (Neutral)'
                            ELSE 'BC Flow (Neutral)' END as EntryType,
                        k.Amount as Amount,
                        CAST(0 AS DECIMAL(18,2)) as ProfitOrNet,
                        k.CustomerID as CustomerID,
                        'Recorded' as Status,
                        ISNULL(k.CreatedAt, CAST(k.EntryDate AS DATETIME)) as SortDate
                    FROM KhataEntries k
                    LEFT JOIN Customers cust ON k.CustomerID = cust.CustomerID
                    WHERE k.UserID = @userId ${dateCondKhata}

                    UNION ALL

                    -- 5. Sale Invoices
                    SELECT 
                        'Invoices' as SourceModule,
                        i.InvoiceID as RecordID,
                        i.GlobalSerialNo as GlobalSerialNo,
                        i.SNCode as SNCode,
                        i.ModuleCode as ModuleCode,
                        i.InvoiceDate as RecordDate,
                        CAST(CAST(ISNULL(i.CreatedAt, CAST(i.InvoiceDate AS DATETIME)) AS TIME) AS VARCHAR(8)) as RecordTime,
                        'Bill #' || i.InvoiceNumber as Title,
                        ISNULL(cust.CustomerName, 'Walk-in') as EntityName,
                        'Sale Invoice' as CategoryOrService,
                        i.InvoiceNumber as RefNumber,
                        ISNULL(i.PaymentMode, 'Cash') as AccountName,
                        'Invoice' as EntryType,
                        i.TotalAmount as Amount,
                        CAST(0 AS DECIMAL(18,2)) as ProfitOrNet,
                        i.CustomerID as CustomerID,
                        i.PaymentStatus as Status,
                        ISNULL(i.CreatedAt, CAST(i.InvoiceDate AS DATETIME)) as SortDate
                    FROM Invoices i
                    LEFT JOIN Customers cust ON i.CustomerID = cust.CustomerID
                    WHERE i.Status != 'Cancelled' AND i.UserID = @userId ${dateCondInvoices}

                    UNION ALL

                    -- 6. Bill & EMI Payments
                    SELECT
                        'BillPay' as SourceModule,
                        bp.PaymentID as RecordID,
                        bp.GlobalSerialNo as GlobalSerialNo,
                        bp.SNCode as SNCode,
                        bp.ModuleCode as ModuleCode,
                        bp.PaymentDate as RecordDate,
                        CAST(ISNULL(bp.PaymentTime, CAST(bp.CreatedAt AS TIME)) AS VARCHAR(8)) as RecordTime,
                        ISNULL(bp.BillCategory, 'Bill Pay') || CASE WHEN bp.ProviderName IS NOT NULL AND bp.ProviderName != '' THEN ' - ' || bp.ProviderName ELSE '' END as Title,
                        COALESCE(bp.CustomerName, bp.CustomerPhone, 'Customer') as EntityName,
                        ISNULL(bp.BillCategory, 'BillPay') as CategoryOrService,
                        ISNULL(bp.ConsumerNumber, bp.TxnReference) as RefNumber,
                        ISNULL(bp.PaymentMode, 'Cash') as AccountName,
                        ISNULL(bp.BillCategory, 'BillPay') as EntryType,
                        bp.TotalCollected as Amount,
                        ISNULL(bp.NetProfit, 0) as ProfitOrNet,
                        bp.CustomerID as CustomerID,
                        bp.Status as Status,
                        ISNULL(bp.CreatedAt, CAST(bp.PaymentDate AS DATETIME)) as SortDate
                    FROM BillPayments bp
                    WHERE ISNULL(bp.IsDeleted, 0) = 0 AND bp.UserID = @userId ${dateCondBP}

                    UNION ALL

                    -- 7. Aadhaar UCL Updates
                    SELECT
                        'UCL' as SourceModule,
                        u.UCLID as RecordID,
                        u.GlobalSerialNo as GlobalSerialNo,
                        u.SNCode as SNCode,
                        u.ModuleCode as ModuleCode,
                        CAST(u.UpdateDate AS DATE) as RecordDate,
                        CAST(ISNULL(CAST(u.CreatedAt AS TIME), CAST(u.UpdateDate AS TIME)) AS VARCHAR(8)) as RecordTime,
                        ISNULL(u.UpdateType, 'UCL Update') as Title,
                        COALESCE(u.CustomerName, u.CustomerPhone, 'Resident') as EntityName,
                        'Aadhaar UCL' as CategoryOrService,
                        ISNULL(u.SID, u.PACCode) as RefNumber,
                        ISNULL(u.PaymentMode, 'Cash') as AccountName,
                        ISNULL(u.UpdateType, 'UCL') as EntryType,
                        u.TotalAmount as Amount,
                        u.TotalAmount as ProfitOrNet,
                        u.CustomerID as CustomerID,
                        u.Status as Status,
                        ISNULL(u.CreatedAt, u.UpdateDate) as SortDate
                    FROM UCLUpdates u
                    WHERE ISNULL(u.IsDeleted, 0) = 0 AND u.UserID = @userId ${dateCondUCL}
                )
                SELECT 
                    *,
                    COUNT(*) OVER() as TotalRows,
                    SUM(Amount) OVER() as AggAmount,
                    SUM(ProfitOrNet) OVER() as AggProfit
                FROM MasterUnion
                ${whereClause}
                ORDER BY RecordDate DESC, ISNULL(RecordTime, '00:00:00') DESC, SortDate DESC, RecordID DESC
                OFFSET @offset ROWS
                FETCH NEXT @limit ROWS ONLY;
            `;

            const result = await query(unionSql, params);
            records = result.recordset || [];
            if (records.length > 0) {
                totalCount = records[0].TotalRows || records.length;
                summary.totalAmount = records[0].AggAmount || 0;
                summary.totalProfit = records[0].AggProfit || 0;
                summary.isMixedVolume = (module === 'all');
                summary.volumeLabel = (module === 'all') ? 'Kul Karobar (Gross Module-Volume)' : 'Kul Rashi';
            }
        }

        // ======================== MODULE: TRANSACTIONS (CASHBOOK) ========================
        else if (module === 'transactions') {
            let whereClause = 'WHERE t.UserID = @userId AND t.IsDeleted = 0 ' + dateCondTrans;
            if (search) {
                whereClause += ` AND (
                    t.Description LIKE @search ESCAPE '\\' OR
                    t.Reference LIKE @search ESCAPE '\\' OR
                    t.Tags LIKE @search ESCAPE '\\' OR
                    p.PartyName LIKE @search ESCAPE '\\' OR
                    c.CategoryName LIKE @search ESCAPE '\\' OR
                    a.AccountName LIKE @search ESCAPE '\\'
                )`;
            }
            if (type && type !== 'all') {
                whereClause += ` AND t.TransType = @type`;
                params.type = type;
            }
            if (accountId && accountId !== 'all') {
                whereClause += ` AND (t.AccountID = @accountId OR t.ToAccountID = @accountId)`;
                params.accountId = parseInt(accountId);
            }
            if (categoryId && categoryId !== 'all') {
                whereClause += ` AND t.CategoryID = @categoryId`;
                params.categoryId = parseInt(categoryId);
            }

            const sql = `
                WITH CashbookRows AS (
                    SELECT
                        t.TransactionID, t.GlobalSerialNo, t.SNCode, t.ModuleCode,
                        t.TransDate, t.TransTime, t.CreatedAt, t.Description, t.TransType,
                        t.Reference, t.AccountID, t.ToAccountID, t.CategoryID, t.PartyID,
                        t.Tags, t.Amount, t.UserID, t.IsDeleted
                    FROM Transactions t
                    WHERE t.UserID = @userId AND t.IsDeleted = 0
                      AND NOT (${invoiceMirrorHasPaymentHistory('t')})

                    UNION ALL

                    SELECT
                        -payment.KhataID, payment.GlobalSerialNo, payment.SNCode, payment.ModuleCode,
                        payment.EntryDate, payment.EntryTime, payment.CreatedAt, payment.Description,
                        'Income', payment.ReferenceNo, payment.AccountID, CAST(NULL AS INT),
                        (SELECT CategoryID FROM Categories
                         WHERE UserID = payment.UserID
                           AND (CategoryName = 'Business Income' OR CategoryType = 'Income') LIMIT 1),
                        CAST(NULL AS INT), CAST(NULL AS NVARCHAR(1000)), payment.Amount,
                        payment.UserID, CAST(0 AS BIT)
                    FROM KhataEntries payment
                    WHERE payment.UserID = @userId AND payment.EntryType = 'Got'
                      AND payment.InvoiceID IS NOT NULL
                      AND EXISTS (
                          SELECT 1
                          FROM Transactions mirror
                          WHERE mirror.UserID = payment.UserID
                            AND mirror.SourceModule = 'Invoices'
                            AND mirror.SourceID = payment.InvoiceID
                            AND mirror.LineType = 'PAYMENT_IN'
                            AND mirror.IsDeleted = 0
                            AND mirror.Amount = (
                                SELECT SUM(paymentHistory.Amount)
                                FROM KhataEntries paymentHistory
                                WHERE paymentHistory.UserID = payment.UserID
                                  AND paymentHistory.InvoiceID = payment.InvoiceID
                                  AND paymentHistory.EntryType = 'Got'
                            )
                      )
                )
                SELECT 
                    'Cashbook' as SourceModule,
                    t.TransactionID as RecordID,
                    t.GlobalSerialNo as GlobalSerialNo,
                    t.SNCode as SNCode,
                    t.ModuleCode as ModuleCode,
                    t.TransDate as RecordDate,
                    CAST(ISNULL(t.TransTime, CAST(t.CreatedAt AS TIME)) AS VARCHAR(8)) as RecordTime,
                    ISNULL(t.Description, t.TransType) as Title,
                    COALESCE(p.PartyName, a.AccountName, 'General') as EntityName,
                    ISNULL(c.CategoryName, t.TransType) as CategoryOrService,
                    t.Reference as RefNumber,
                    a.AccountName as AccountName,
                    to_a.AccountName as ToAccountName,
                    t.TransType as EntryType,
                    t.Amount as Amount,
                    CASE 
                        WHEN t.TransType = 'Income' THEN t.Amount 
                        WHEN t.TransType = 'Expense' THEN -t.Amount
                        ELSE 0 
                    END as ProfitOrNet,
                    'Completed' as Status,
                    t.Tags,
                    t.CreatedAt,
                    COUNT(*) OVER() as TotalRows,
                    SUM(t.Amount) OVER() as AggAmount,
                    SUM(CASE WHEN t.TransType = 'Income' THEN t.Amount ELSE 0 END) OVER() as AggIncome,
                    SUM(CASE WHEN t.TransType = 'Expense' THEN t.Amount ELSE 0 END) OVER() as AggExpense
                FROM CashbookRows t
                LEFT JOIN Accounts a ON t.AccountID = a.AccountID
                LEFT JOIN Accounts to_a ON t.ToAccountID = to_a.AccountID
                LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
                LEFT JOIN Parties p ON t.PartyID = p.PartyID
                ${whereClause}
                ORDER BY t.TransDate DESC, ISNULL(t.TransTime, CAST(t.CreatedAt AS TIME)) DESC, t.CreatedAt DESC, t.TransactionID DESC
                OFFSET @offset ROWS
                FETCH NEXT @limit ROWS ONLY;
            `;

            const result = await query(sql, params);
            records = result.recordset || [];
            if (records.length > 0) {
                totalCount = records[0].TotalRows || records.length;
                summary.totalAmount = records[0].AggAmount || 0;
                summary.totalIncome = records[0].AggIncome || 0;
                summary.totalExpense = records[0].AggExpense || 0;
                summary.totalProfit = summary.totalIncome - summary.totalExpense;
            }
        }

        // ======================== MODULE: CSC (APPLICATIONS) ========================
        else if (module === 'csc') {
            let whereClause = 'WHERE c.IsActive = 1 AND c.UserID = @userId ' + dateCondCSC;
            if (search) {
                whereClause += ` AND (
                    c.CustomerName LIKE @search ESCAPE '\\' OR
                    c.CustomerPhone LIKE @search ESCAPE '\\' OR
                    c.CustomerAadhaar LIKE @search ESCAPE '\\' OR
                    c.ServiceType LIKE @search ESCAPE '\\' OR
                    c.AckNumber LIKE @search ESCAPE '\\' OR
                    c.CertificateDocNo LIKE @search ESCAPE '\\'
                )`;
            }
            if (type && type !== 'all') {
                whereClause += ` AND (c.ServiceType = @type OR c.ServiceType LIKE @typePattern OR @type LIKE '%' || c.ServiceType || '%')`;
                params.type = type;
                params.typePattern = '%' + type + '%';
            }
            if (customerId && customerId !== 'all') {
                whereClause += ` AND c.CustomerID = @customerId`;
                params.customerId = parseInt(customerId, 10) || 0;
            }
            if (status && status !== 'all') {
                if (status === 'Completed' || status === 'Success' || status === 'Delivered') {
                    whereClause += ` AND c.Status IN ('Completed', 'Success', 'Delivered', 'Approved')`;
                } else if (status === 'Pending') {
                    whereClause += ` AND c.Status IN ('Pending', 'Applied', 'In Progress', 'Under Process')`;
                } else if (status === 'Failed' || status === 'Rejected') {
                    whereClause += ` AND c.Status IN ('Failed', 'Rejected', 'Cancelled')`;
                } else {
                    whereClause += ` AND c.Status = @status`;
                    params.status = status;
                }
            }

            const sql = `
                SELECT 
                    'CSC' as SourceModule,
                    c.AppID as RecordID,
                    c.GlobalSerialNo as GlobalSerialNo,
                    c.SNCode as SNCode,
                    c.ModuleCode as ModuleCode,
                    CAST(c.ApplyDate AS DATE) as RecordDate,
                    CAST(ISNULL(CAST(c.CreatedAt AS TIME), CAST(c.ApplyDate AS TIME)) AS VARCHAR(8)) as RecordTime,
                    c.ServiceType as Title,
                    c.CustomerName as EntityName,
                    c.CustomerPhone as Phone,
                    c.ServiceType as CategoryOrService,
                    c.AckNumber as RefNumber,
                    ISNULL(c.PaymentMode, 'Cash') as AccountName,
                    'CSC Application' as EntryType,
                    c.TotalFee as Amount,
                    c.GovtFee,
                    c.OperatorFee as ProfitOrNet,
                    c.PaidAmount,
                    c.DueAmount,
                    c.PaymentStatus,
                    c.Status as Status,
                    c.ExpectedDate,
                    c.CompletionDate,
                    c.StatusRemarks,
                    c.CreatedAt,
                    COUNT(*) OVER() as TotalRows,
                    SUM(c.TotalFee) OVER() as AggAmount,
                    SUM(c.OperatorFee) OVER() as AggProfit,
                    SUM(c.DueAmount) OVER() as AggDue
                FROM CSCApplications c
                ${whereClause}
                ORDER BY c.ApplyDate DESC, c.CreatedAt DESC, c.AppID DESC
                OFFSET @offset ROWS
                FETCH NEXT @limit ROWS ONLY;
            `;

            const result = await query(sql, params);
            records = result.recordset || [];
            if (records.length > 0) {
                totalCount = records[0].TotalRows || records.length;
                summary.totalAmount = records[0].AggAmount || 0;
                summary.totalProfit = records[0].AggProfit || 0;
                summary.totalExpense = (summary.totalAmount - summary.totalProfit);
            }
        }

        // ======================== MODULE: BC (BANKING TRANSACTIONS) ========================
        else if (module === 'bc') {
            let whereClause = 'WHERE b.UserID = @userId ' + dateCondBC;
            if (search) {
                whereClause += ` AND (
                    b.CustomerName LIKE @search ESCAPE '\\' OR
                    b.CustomerPhone LIKE @search ESCAPE '\\' OR
                    b.CustomerAadhaarLast4 LIKE @search ESCAPE '\\' OR
                    b.ServiceType LIKE @search ESCAPE '\\' OR
                    b.RRN_UTR LIKE @search ESCAPE '\\' OR
                    b.BankName LIKE @search ESCAPE '\\' OR
                    ca.AccountName LIKE @search ESCAPE '\\'
                )`;
            }
            if (type && type !== 'all') {
                whereClause += ` AND (b.ServiceType = @type OR b.ServiceType LIKE @typePattern OR @type LIKE '%' || b.ServiceType || '%')`;
                params.type = type;
                params.typePattern = '%' + type + '%';
            }
            if (customerId && customerId !== 'all') {
                whereClause += ` AND b.CustomerID = @customerId`;
                params.customerId = parseInt(customerId, 10) || 0;
            }
            if (status && status !== 'all') {
                if (status === 'Completed' || status === 'Success' || status === 'Delivered') {
                    whereClause += ` AND b.Status IN ('Completed', 'Success', 'Delivered')`;
                } else if (status === 'Pending') {
                    whereClause += ` AND b.Status IN ('Pending', 'In Progress', 'Under Process')`;
                } else if (status === 'Failed' || status === 'Rejected') {
                    whereClause += ` AND b.Status IN ('Failed', 'Rejected', 'Cancelled')`;
                } else {
                    whereClause += ` AND b.Status = @status`;
                    params.status = status;
                }
            }

            const sql = `
                SELECT 
                    'BC Banking' as SourceModule,
                    b.BCID as RecordID,
                    b.GlobalSerialNo as GlobalSerialNo,
                    b.SNCode as SNCode,
                    b.ModuleCode as ModuleCode,
                    b.TransDate as RecordDate,
                    CAST(ISNULL(b.TransTime, CAST(b.CreatedAt AS TIME)) AS VARCHAR(8)) as RecordTime,
                    b.ServiceType || CASE WHEN b.BankName IS NOT NULL AND b.BankName != '' THEN ' - ' || b.BankName ELSE '' END as Title,
                    COALESCE(b.CustomerName, b.CustomerPhone, 'Customer') as EntityName,
                    b.CustomerPhone as Phone,
                    b.ServiceType as CategoryOrService,
                    b.RRN_UTR as RefNumber,
                    ISNULL(ca.AccountName, 'Galla Cash') as AccountName,
                    ISNULL(pa.AccountName, 'Portal Account') as ToAccountName,
                    b.ServiceType as EntryType,
                    b.Amount as Amount,
                    b.CommissionEarned,
                    b.CustomerCharge,
                    ISNULL(b.NetProfit, 0) as ProfitOrNet,
                    b.Status as Status,
                    b.BankName,
                    b.CustomerAadhaarLast4,
                    b.CreatedAt,
                    COUNT(*) OVER() as TotalRows,
                    SUM(b.Amount) OVER() as AggAmount,
                    SUM(ISNULL(b.NetProfit, 0)) OVER() as AggProfit,
                    SUM(ISNULL(b.CommissionEarned, 0)) OVER() as AggCommission
                FROM BCTransactions b
                LEFT JOIN Accounts ca ON b.CashAccountID = ca.AccountID
                LEFT JOIN Accounts pa ON b.PortalAccountID = pa.AccountID
                ${whereClause}
                ORDER BY b.TransDate DESC, ISNULL(b.TransTime, CAST(b.CreatedAt AS TIME)) DESC, b.CreatedAt DESC, b.BCID DESC
                OFFSET @offset ROWS
                FETCH NEXT @limit ROWS ONLY;
            `;

            const result = await query(sql, params);
            records = result.recordset || [];
            if (records.length > 0) {
                totalCount = records[0].TotalRows || records.length;
                summary.totalAmount = records[0].AggAmount || 0;
                summary.totalProfit = records[0].AggProfit || 0;
            }
        }

        // ======================== MODULE: KHATA (CUSTOMER UDHAAR) ========================
        else if (module === 'khata') {
            let whereClause = 'WHERE k.UserID = @userId ' + dateCondKhata;
            if (search) {
                whereClause += ` AND (
                    cust.CustomerName LIKE @search ESCAPE '\\' OR
                    cust.Phone LIKE @search ESCAPE '\\' OR
                    k.Description LIKE @search ESCAPE '\\' OR
                    k.ReferenceNo LIKE @search ESCAPE '\\'
                )`;
            }
            if (type && type !== 'all') {
                whereClause += ` AND k.EntryType = @type`;
                params.type = type;
            }
            if (customerId && customerId !== 'all') {
                whereClause += ` AND k.CustomerID = @customerId`;
                params.customerId = parseInt(customerId, 10) || 0;
            }

            const sql = `
                SELECT 
                    'Khata' as SourceModule,
                    k.KhataID as RecordID,
                    k.GlobalSerialNo as GlobalSerialNo,
                    k.SNCode as SNCode,
                    k.ModuleCode as ModuleCode,
                    k.EntryDate as RecordDate,
                    ISNULL(NULLIF(k.EntryTime, ''), CAST(CAST(k.CreatedAt AS TIME) AS VARCHAR(8))) as RecordTime,
                    ISNULL(k.Description, CASE WHEN k.EntryType = 'Gave' THEN 'Udhaar Diya' ELSE 'Jama Mila' END) as Title,
                    cust.CustomerName as EntityName,
                    cust.Phone as Phone,
                    'Customer Khata' as CategoryOrService,
                    k.ReferenceNo as RefNumber,
                    ISNULL(k.PaymentMode, 'Cash') as AccountName,
                    CASE
                        WHEN k.EntryType = 'Gave' THEN 'Udhaar Diya'
                        WHEN k.EntryType = 'Got' THEN 'Jama Mila'
                        WHEN k.EntryType = 'Settlement' THEN 'Advance se Settlement'
                        ELSE 'BC Flow' END as EntryType,
                    k.Amount as Amount,
                    k.BalanceAfter,
                    CASE WHEN k.EntryType = 'Got' THEN k.Amount
                         WHEN k.EntryType = 'Gave' THEN -k.Amount
                         ELSE 0 END as ProfitOrNet,
                    'Recorded' as Status,
                    k.CreatedAt,
                    COUNT(*) OVER() as TotalRows,
                    ISNULL(SUM(CASE WHEN k.EntryType IN ('Gave','Got') THEN k.Amount ELSE 0 END) OVER(), 0) as AggAmount,
                    SUM(CASE WHEN k.EntryType = 'Gave' THEN k.Amount ELSE 0 END) OVER() as AggUdhaar,
                    SUM(CASE WHEN k.EntryType = 'Got' THEN k.Amount ELSE 0 END) OVER() as AggJama
                FROM KhataEntries k
                LEFT JOIN Customers cust ON k.CustomerID = cust.CustomerID
                ${whereClause}
                ORDER BY k.EntryDate DESC, ISNULL(NULLIF(k.EntryTime, ''), CAST(CAST(k.CreatedAt AS TIME) AS VARCHAR(8))) DESC, k.CreatedAt DESC, k.KhataID DESC
                OFFSET @offset ROWS
                FETCH NEXT @limit ROWS ONLY;
            `;

            const result = await query(sql, params);
            records = result.recordset || [];
            if (records.length > 0) {
                totalCount = records[0].TotalRows || records.length;
                summary.totalAmount = records[0].AggAmount || 0;
                summary.totalExpense = records[0].AggUdhaar || 0;
                summary.totalIncome = records[0].AggJama || 0;
            }
        }

        // ======================== MODULE: LOANS (PARTIES) ========================
        else if (module === 'loans') {
            let whereClause = `WHERE t.UserID = @userId AND t.IsDeleted = 0 AND t.TransType IN ('Loan Given', 'Loan Received', 'Loan Repay', 'Loan Recovery') ` + dateCondTrans;
            if (search) {
                whereClause += ` AND (
                    p.PartyName LIKE @search ESCAPE '\\' OR
                    p.Phone LIKE @search ESCAPE '\\' OR
                    t.Description LIKE @search ESCAPE '\\' OR
                    t.Reference LIKE @search ESCAPE '\\'
                )`;
            }
            if (type && type !== 'all') {
                whereClause += ` AND t.TransType = @type`;
                params.type = type;
            }

            const sql = `
                SELECT 
                    'Loan' as SourceModule,
                    t.TransactionID as RecordID,
                    t.GlobalSerialNo as GlobalSerialNo,
                    t.SNCode as SNCode,
                    t.ModuleCode as ModuleCode,
                    t.TransDate as RecordDate,
                    CAST(ISNULL(t.TransTime, CAST(t.CreatedAt AS TIME)) AS VARCHAR(8)) as RecordTime,
                    t.Description as Title,
                    p.PartyName as EntityName,
                    p.Phone as Phone,
                    p.PartyType as CategoryOrService,
                    t.Reference as RefNumber,
                    a.AccountName as AccountName,
                    t.TransType as EntryType,
                    t.Amount as Amount,
                    p.CurrentBalance as PartyBalance,
                    'Recorded' as Status,
                    t.CreatedAt,
                    COUNT(*) OVER() as TotalRows,
                    SUM(t.Amount) OVER() as AggAmount,
                    SUM(CASE WHEN t.TransType = 'Loan Given' THEN t.Amount ELSE 0 END) OVER() as AggGiven,
                    SUM(CASE WHEN t.TransType IN ('Loan Received', 'Loan Repay', 'Loan Recovery') THEN t.Amount ELSE 0 END) OVER() as AggRecovered
                FROM Transactions t
                JOIN Parties p ON t.PartyID = p.PartyID
                LEFT JOIN Accounts a ON t.AccountID = a.AccountID
                ${whereClause}
                ORDER BY t.TransDate DESC, ISNULL(t.TransTime, CAST(t.CreatedAt AS TIME)) DESC, t.CreatedAt DESC, t.TransactionID DESC
                OFFSET @offset ROWS
                FETCH NEXT @limit ROWS ONLY;
            `;

            const result = await query(sql, params);
            records = result.recordset || [];
            if (records.length > 0) {
                totalCount = records[0].TotalRows || records.length;
                summary.totalAmount = records[0].AggAmount || 0;
                summary.totalExpense = records[0].AggGiven || 0;
                summary.totalIncome = records[0].AggRecovered || 0;
            }
        }

        // ======================== MODULE: INVOICES ========================
        else if (module === 'invoices') {
            let whereClause = "WHERE i.Status != 'Cancelled' AND i.UserID = @userId " + dateCondInvoices;
            if (search) {
                whereClause += ` AND (
                    i.InvoiceNumber LIKE @search ESCAPE '\\' OR
                    cust.CustomerName LIKE @search ESCAPE '\\' OR
                    cust.Phone LIKE @search ESCAPE '\\' OR
                    i.Notes LIKE @search ESCAPE '\\'
                )`;
            }
            if (status && status !== 'all') {
                whereClause += ` AND i.PaymentStatus = @status`;
                params.status = status;
            }
            if (customerId && customerId !== 'all') {
                whereClause += ` AND i.CustomerID = @customerId`;
                params.customerId = parseInt(customerId, 10) || 0;
            }

            const sql = `
                SELECT 
                    'Invoices' as SourceModule,
                    i.InvoiceID as RecordID,
                    i.GlobalSerialNo as GlobalSerialNo,
                    i.SNCode as SNCode,
                    i.ModuleCode as ModuleCode,
                    i.InvoiceDate as RecordDate,
                    CAST(ISNULL(CAST(i.CreatedAt AS TIME), CAST(i.InvoiceDate AS TIME)) AS VARCHAR(8)) as RecordTime,
                    'Bill #' || i.InvoiceNumber as Title,
                    cust.CustomerName as EntityName,
                    cust.Phone as Phone,
                    'Sale Invoice' as CategoryOrService,
                    i.InvoiceNumber as RefNumber,
                    ISNULL(i.PaymentMode, 'Cash') as AccountName,
                    'Invoice' as EntryType,
                    i.TotalAmount as Amount,
                    i.PaidAmount,
                    i.BalanceAmount,
                    i.PaymentStatus as Status,
                    i.CreatedAt,
                    COUNT(*) OVER() as TotalRows,
                    SUM(i.TotalAmount) OVER() as AggAmount,
                    SUM(i.PaidAmount) OVER() as AggPaid,
                    SUM(i.BalanceAmount) OVER() as AggBalance
                FROM Invoices i
                LEFT JOIN Customers cust ON i.CustomerID = cust.CustomerID
                ${whereClause}
                ORDER BY i.InvoiceDate DESC, i.CreatedAt DESC, i.InvoiceID DESC
                OFFSET @offset ROWS
                FETCH NEXT @limit ROWS ONLY;
            `;

            const result = await query(sql, params);
            records = result.recordset || [];
            if (records.length > 0) {
                totalCount = records[0].TotalRows || records.length;
                summary.totalAmount = records[0].AggAmount || 0;
                summary.totalIncome = records[0].AggPaid || 0;
                summary.totalExpense = records[0].AggBalance || 0;
            }
        }

        // ======================== MODULE: BILLPAY (BILL & EMI PAYMENTS) ========================
        else if (module === 'billpay') {
            let whereClause = 'WHERE ISNULL(bp.IsDeleted, 0) = 0 AND bp.UserID = @userId ' + dateCondBP;
            if (search) {
                whereClause += ` AND (
                    bp.CustomerName LIKE @search ESCAPE '\\' OR
                    bp.CustomerPhone LIKE @search ESCAPE '\\' OR
                    bp.ConsumerNumber LIKE @search ESCAPE '\\' OR
                    bp.ProviderName LIKE @search ESCAPE '\\' OR
                    bp.TxnReference LIKE @search ESCAPE '\\' OR
                    bp.SNCode LIKE @search ESCAPE '\\'
                )`;
            }
            if (type && type !== 'all') {
                whereClause += ` AND bp.BillCategory LIKE @typePattern`;
                params.typePattern = '%' + type + '%';
            }
            if (customerId && customerId !== 'all') {
                whereClause += ` AND bp.CustomerID = @customerId`;
                params.customerId = parseInt(customerId, 10) || 0;
            }
            if (status && status !== 'all') {
                if (status === 'Completed' || status === 'Success' || status === 'Paid') {
                    whereClause += ` AND bp.Status = 'Paid'`;
                } else if (status === 'Pending' || status === 'Partial') {
                    whereClause += ` AND (bp.Status IN ('Partial', 'Pending') OR bp.CustomerDue > 0)`;
                } else {
                    whereClause += ` AND bp.Status = @status`;
                    params.status = status;
                }
            }

            const sql = `
                SELECT
                    'BillPay' as SourceModule,
                    bp.PaymentID as RecordID,
                    bp.GlobalSerialNo,
                    bp.SNCode,
                    bp.ModuleCode,
                    bp.PaymentDate as RecordDate,
                    CAST(ISNULL(bp.PaymentTime, CAST(bp.CreatedAt AS TIME)) AS VARCHAR(8)) as RecordTime,
                    ISNULL(bp.BillCategory, 'Bill Pay') || CASE WHEN bp.ProviderName IS NOT NULL AND bp.ProviderName != '' THEN ' - ' || bp.ProviderName ELSE '' END as Title,
                    COALESCE(bp.CustomerName, bp.CustomerPhone, 'Customer') as EntityName,
                    bp.CustomerPhone as Phone,
                    bp.BillCategory as CategoryOrService,
                    ISNULL(bp.ConsumerNumber, bp.TxnReference) as RefNumber,
                    ISNULL(bp.PaymentMode, 'Cash') as AccountName,
                    ISNULL(bp.BillCategory, 'BillPay') as EntryType,
                    bp.TotalCollected as Amount,
                    ISNULL(bp.NetProfit, 0) as ProfitOrNet,
                    bp.CustomerID,
                    bp.Status,
                    bp.CreatedAt,
                    COUNT(*) OVER() as TotalRows,
                    SUM(bp.TotalCollected) OVER() as AggAmount,
                    SUM(ISNULL(bp.NetProfit, 0)) OVER() as AggProfit
                FROM BillPayments bp
                ${whereClause}
                ORDER BY bp.PaymentDate DESC, bp.PaymentID DESC
                OFFSET @offset ROWS
                FETCH NEXT @limit ROWS ONLY;
            `;

            const result = await query(sql, params);
            records = result.recordset || [];
            if (records.length > 0) {
                totalCount = records[0].TotalRows || records.length;
                summary.totalAmount = records[0].AggAmount || 0;
                summary.totalProfit = records[0].AggProfit || 0;
            }
        }

        // ======================== MODULE: AADHAAR UCL ========================
        else if (module === 'ucl') {
            let whereClause = 'WHERE ISNULL(u.IsDeleted, 0) = 0 AND u.UserID = @userId ' + dateCondUCL;
            if (search) {
                whereClause += ` AND (
                    u.CustomerName LIKE @search ESCAPE '\\' OR
                    u.CustomerPhone LIKE @search ESCAPE '\\' OR
                    u.SID LIKE @search ESCAPE '\\' OR
                    u.PACCode LIKE @search ESCAPE '\\' OR
                    u.UpdateType LIKE @search ESCAPE '\\' OR
                    u.SNCode LIKE @search ESCAPE '\\'
                )`;
            }
            if (type && type !== 'all') {
                whereClause += ` AND u.UpdateType LIKE @typePattern`;
                params.typePattern = '%' + type + '%';
            }
            if (customerId && customerId !== 'all') {
                whereClause += ` AND u.CustomerID = @customerId`;
                params.customerId = parseInt(customerId, 10) || 0;
            }
            if (status && status !== 'all') {
                if (status === 'Completed' || status === 'Success') {
                    whereClause += ` AND u.Status IN ('Completed', 'Generated', 'Success')`;
                } else if (status === 'Pending') {
                    whereClause += ` AND (u.Status IN ('Pending', 'In Progress') OR u.BalanceAmount > 0)`;
                } else {
                    whereClause += ` AND u.Status = @status`;
                    params.status = status;
                }
            }

            const sql = `
                SELECT
                    'UCL' as SourceModule,
                    u.UCLID as RecordID,
                    u.GlobalSerialNo,
                    u.SNCode,
                    u.ModuleCode,
                    CAST(u.UpdateDate AS DATE) as RecordDate,
                    CAST(ISNULL(CAST(u.CreatedAt AS TIME), CAST(u.UpdateDate AS TIME)) AS VARCHAR(8)) as RecordTime,
                    ISNULL(u.UpdateType, 'UCL Update') as Title,
                    COALESCE(u.CustomerName, u.CustomerPhone, 'Resident') as EntityName,
                    u.CustomerPhone as Phone,
                    'Aadhaar UCL' as CategoryOrService,
                    ISNULL(u.SID, u.PACCode) as RefNumber,
                    ISNULL(u.PaymentMode, 'Cash') as AccountName,
                    ISNULL(u.UpdateType, 'UCL') as EntryType,
                    u.TotalAmount as Amount,
                    u.TotalAmount as ProfitOrNet,
                    u.CustomerID,
                    u.Status,
                    u.CreatedAt,
                    COUNT(*) OVER() as TotalRows,
                    SUM(u.TotalAmount) OVER() as AggAmount,
                    SUM(u.TotalAmount) OVER() as AggProfit
                FROM UCLUpdates u
                ${whereClause}
                ORDER BY u.UpdateDate DESC, u.UCLID DESC
                OFFSET @offset ROWS
                FETCH NEXT @limit ROWS ONLY;
            `;

            const result = await query(sql, params);
            records = result.recordset || [];
            if (records.length > 0) {
                totalCount = records[0].TotalRows || records.length;
                summary.totalAmount = records[0].AggAmount || 0;
                summary.totalProfit = records[0].AggProfit || 0;
            }
        }

        // ======================== MODULE: ACCOUNTS STATEMENT ========================
        else if (module === 'accounts') {
            const sql = `
                SELECT 
                    a.AccountID as RecordID,
                    a.AccountName,
                    a.AccountType,
                    a.BankName,
                    a.AccountNumber,
                    a.OpeningBalance,
                    a.CurrentBalance as Amount,
                    a.Color,
                    a.IsActive,
                    ISNULL((SELECT COUNT(*) FROM Transactions WHERE (AccountID = a.AccountID OR ToAccountID = a.AccountID) AND UserID = @userId AND IsDeleted = 0), 0) as TransCount,
                    ISNULL((SELECT SUM(Amount) FROM Transactions WHERE AccountID = a.AccountID AND TransType = 'Income' AND UserID = @userId AND IsDeleted = 0), 0) as TotalIncome,
                    ISNULL((SELECT SUM(Amount) FROM Transactions WHERE AccountID = a.AccountID AND TransType = 'Expense' AND UserID = @userId AND IsDeleted = 0), 0) as TotalExpense
                FROM Accounts a
                WHERE a.IsActive = 1 AND a.UserID = @userId
                ORDER BY a.CurrentBalance DESC
            `;
            const result = await query(sql, params);
            records = result.recordset || [];
            totalCount = records.length;
            summary.totalAmount = records.reduce((s, r) => s + (r.Amount || 0), 0);
        }

        res.json({
            success: true,
            data: {
                records,
                totalCount,
                summary,
                limit: maxLimit,
                offset: skip
            }
        });
    } catch (err) {
        console.error('Error fetching master report feed:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// 3. GET /api/reports/analytics - Visual Charts & Deep Analytics
// ============================================================================
router.get('/analytics', async (req, res) => {
    try {
        const userId = req.user.UserID;
        // Sargable range - YEAR(TransDate) = @year se index use nahi hota tha
        const { start: yearStart, end: yearEnd, y: year } = yearRange(req.query.year);
        const yearParams = { year, yearStart, yearEnd, userId };

        // 1. Monthly Trends (Income vs Expense vs CSC Profit vs BC Profit vs BillPay vs UCL)
        const monthlyTrends = await query(`
            SELECT 
                m.MonthNumber,
                ISNULL(t.Income, 0) as CashbookIncome,
                ISNULL(t.Expense, 0) as CashbookExpense,
                ISNULL(c.CSCProfit, 0) as CSCProfit,
                ISNULL(b.BCCommission, 0) as BCCommission,
                ISNULL(bp.BPCommission, 0) as BPCommission,
                ISNULL(ucl.UCLProfit, 0) as UCLProfit,
                (ISNULL(t.Income, 0) + ISNULL(b.BCCommission, 0) + ISNULL(bp.BPCommission, 0) + ISNULL(ucl.UCLProfit, 0)) as TotalIncome,
                ISNULL(t.Expense, 0) as TotalExpense,
                (ISNULL(t.Income, 0) - ISNULL(t.Expense, 0) + ISNULL(b.BCCommission, 0) + ISNULL(bp.BPCommission, 0) + ISNULL(ucl.UCLProfit, 0)) as NetProfit
            FROM (
                VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12)
            ) as m(MonthNumber)
            LEFT JOIN (
                SELECT TransMonth,
                    SUM(CASE WHEN TransType = 'Income' THEN Amount ELSE 0 END) as Income,
                    SUM(CASE WHEN TransType = 'Expense' THEN Amount ELSE 0 END) as Expense
                FROM (
                    SELECT MONTH(t.TransDate) as TransMonth, t.TransType, t.Amount
                    FROM Transactions t
                    WHERE t.TransDate >= @yearStart AND t.TransDate <= @yearEnd
                      AND t.UserID = @userId AND t.IsDeleted = 0
                      AND NOT (${invoiceMirrorHasPaymentHistory('t')})

                    UNION ALL

                    SELECT MONTH(k.EntryDate), 'Income', k.Amount
                    FROM KhataEntries k
                    WHERE k.EntryDate >= @yearStart AND k.EntryDate <= @yearEnd
                      AND k.UserID = @userId AND k.EntryType = 'Got'
                      AND k.InvoiceID IS NOT NULL
                      AND EXISTS (
                          SELECT 1
                          FROM Transactions mirror
                          WHERE mirror.UserID = k.UserID
                            AND mirror.SourceModule = 'Invoices'
                            AND mirror.SourceID = k.InvoiceID
                            AND mirror.LineType = 'PAYMENT_IN'
                            AND mirror.IsDeleted = 0
                            AND mirror.Amount = (
                                SELECT SUM(paymentHistory.Amount)
                                FROM KhataEntries paymentHistory
                                WHERE paymentHistory.UserID = k.UserID
                                  AND paymentHistory.InvoiceID = k.InvoiceID
                                  AND paymentHistory.EntryType = 'Got'
                            )
                      )
                ) CashbookHistory
                GROUP BY TransMonth
            ) t ON m.MonthNumber = t.TransMonth
            LEFT JOIN (
                SELECT 
                    MONTH(ApplyDate) as CSCMonth,
                    SUM(TotalFee) as CSCFees,
                    SUM(GovtFee) as CSCGovtFee,
                    SUM(OperatorFee) as CSCProfit
                FROM CSCApplications
                WHERE ApplyDate >= @yearStart AND ApplyDate <= @yearEnd AND IsActive = 1 AND UserID = @userId
                GROUP BY MONTH(ApplyDate)
            ) c ON m.MonthNumber = c.CSCMonth
            LEFT JOIN (
                SELECT 
                    MONTH(TransDate) as BCMonth,
                    SUM(CommissionEarned + CustomerCharge) as BCCommission
                FROM BCTransactions
                WHERE TransDate >= @yearStart AND TransDate <= @yearEnd AND Status = 'Success' AND UserID = @userId
                GROUP BY MONTH(TransDate)
            ) b ON m.MonthNumber = b.BCMonth
            LEFT JOIN (
                SELECT 
                    MONTH(PaymentDate) as BPMonth,
                    SUM(CommissionEarned) as BPCommission
                FROM BillPayments
                WHERE PaymentDate >= @yearStart AND PaymentDate <= @yearEnd AND IsDeleted = 0 AND UserID = @userId
                GROUP BY MONTH(PaymentDate)
            ) bp ON m.MonthNumber = bp.BPMonth
            LEFT JOIN (
                SELECT 
                    MONTH(UpdateDate) as UCLMonth,
                    SUM(TotalAmount) as UCLProfit
                FROM UCLUpdates
                WHERE UpdateDate >= @yearStart AND UpdateDate <= @yearEnd AND ISNULL(IsDeleted, 0) = 0 AND UserID = @userId
                GROUP BY MONTH(UpdateDate)
            ) ucl ON m.MonthNumber = ucl.UCLMonth
            ORDER BY m.MonthNumber
        `, yearParams);

        // 2. Top Expense Categories
        const topCategories = await query(`
            SELECT TOP 8
                ISNULL(c.CategoryName, 'Without Category') as CategoryName,
                ISNULL(c.Color, '#94a3b8') as Color,
                SUM(t.Amount) as TotalAmount,
                COUNT(*) as TransCount
            FROM Transactions t
            LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
            WHERE t.TransDate >= @yearStart AND t.TransDate <= @yearEnd AND t.TransType = 'Expense' AND t.UserID = @userId AND t.IsDeleted = 0
            GROUP BY ISNULL(c.CategoryName, 'Without Category'), ISNULL(c.Color, '#94a3b8')
            ORDER BY TotalAmount DESC
        `, yearParams);

        // 3. Top CSC Services
        const topCSCServices = await query(`
            SELECT TOP 8
                ServiceType,
                COUNT(*) as TotalApplications,
                SUM(TotalFee) as TotalRevenue,
                SUM(OperatorFee) as TotalProfit
            FROM CSCApplications
            WHERE ApplyDate >= @yearStart AND ApplyDate <= @yearEnd AND IsActive = 1 AND UserID = @userId
            GROUP BY ServiceType
            ORDER BY TotalApplications DESC
        `, yearParams);

        // 4. BC Banking Service Breakdown
        const bcServiceBreakdown = await query(`
            SELECT 
                ServiceType,
                COUNT(*) as TotalTransactions,
                SUM(Amount) as TotalVolume,
                SUM(CommissionEarned + CustomerCharge) as TotalEarnings
            FROM BCTransactions
            WHERE TransDate >= @yearStart AND TransDate <= @yearEnd AND Status = 'Success' AND UserID = @userId
            GROUP BY ServiceType
            ORDER BY TotalTransactions DESC
        `, yearParams);

        // 5. Account Balances Breakdown
        const accountBalances = await query(`
            SELECT 
                AccountID,
                AccountName,
                AccountType,
                CurrentBalance,
                Color
            FROM Accounts
            WHERE IsActive = 1 AND UserID = @userId
            ORDER BY CurrentBalance DESC
        `, { userId });

        res.json({
            success: true,
            data: {
                year,
                monthlyTrends: monthlyTrends.recordset,
                topCategories: topCategories.recordset,
                topCSCServices: topCSCServices.recordset,
                bcServiceBreakdown: bcServiceBreakdown.recordset,
                accountBalances: accountBalances.recordset
            }
        });
    } catch (err) {
        console.error('Error fetching analytics:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// 4. GET /api/reports/export/excel - Comprehensive Multi-Module Excel Export
// ============================================================================
router.get('/export/excel', async (req, res) => {
    try {
        const {
            module = 'all',
            startDate,
            endDate,
            type,
            status,
            search,
            accountId,
            categoryId,
            customerId,
        } = req.query;

        // Fetch up to 2000 records for excel export
        req.query.limit = 2000;
        req.query.offset = 0;

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Cash Management & BC System';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Report Data', {
            views: [{ showGridLines: true }]
        });

        // Title Row
        const titleRow = sheet.addRow(['CASH MANAGEMENT & BC SYSTEM - REPORTS & ANALYSIS']);
        titleRow.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        sheet.mergeCells('A1:J1');
        titleRow.height = 32;
        titleRow.alignment = { vertical: 'middle', horizontal: 'center' };

        // Subtitle / Filters Row
        const subText = `Module: ${module.toUpperCase()} | Date: ${startDate || 'All Time'} to ${endDate || 'Now'} | Exported On: ${new Date().toLocaleString('en-IN')}`;
        const subRow = sheet.addRow([subText]);
        subRow.font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
        sheet.mergeCells('A2:J2');
        subRow.height = 20;

        sheet.addRow([]); // Blank spacer

        // Table Columns Header
        const headerRow = sheet.addRow([
            'S.No',
            'Date & Time',
            'Module',
            'Title / Service',
            'Customer / Party / Account',
            'Reference / Ack / UTR',
            'Type',
            'Amount (₹)',
            'Status',
            'Customer ID'
        ]);

        headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
        headerRow.height = 24;
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

        // Fetch filtered records - multi-module (Cashbook / CSC / BC / Khata / Invoice)
        let records = [];
        const userId = req.user.UserID;
        const params = { userId };
        const MODULE_MAP = {
            'all': null,
            'cashbook': 'Cashbook',
            'transactions': 'Cashbook',
            'csc': 'CSC',
            'bc': 'BC Banking',
            'khata': 'Khata',
            'invoice': 'Invoice',
            'invoices': 'Invoice',
            'billpay': 'BillPay',
            'ucl': 'UCL',
            'loans': 'Loans',
            'loan': 'Loans',
            'accounts': null,
            'charts': null
        };
        const selectedModule = MODULE_MAP[String(module || 'all').toLowerCase()];
        if (selectedModule === undefined) {
            return res.status(400).json({ success: false, error: 'Module galat hai' });
        }

        // Date filter - dono dates dene zaruri nahi (sirf start ya sirf end bhi chalega)
        let dateCond = '';
        if (startDate) { dateCond += ' AND t.TransDate >= @startDate'; params.startDate = startDate; }
        if (endDate) { dateCond += ' AND t.TransDate <= @endDate'; params.endDate = endDate; }

        let typeCond = '';
        if (type && type !== 'all') {
            if (type === 'CSC' || type === 'CSC Application') {
                typeCond = " AND t.SourceModule = 'CSC'";
            } else if (type === 'BC' || type === 'BC Banking') {
                typeCond = " AND t.SourceModule = 'BC Banking'";
            } else if (type === 'Cashbook') {
                typeCond = " AND t.SourceModule = 'Cashbook'";
            } else if (type === 'Invoice' || type === 'Invoices') {
                typeCond = " AND t.SourceModule IN ('Invoices', 'Invoice')";
            } else {
                typeCond = ' AND t.EntryType = @type';
                params.type = type;
            }
        }

        let statusCond = '';
        if (status && status !== 'all') {
            if (status === 'Completed' || status === 'Success' || status === 'Delivered' || status === 'Approved') {
                statusCond = " AND t.Status IN ('Completed', 'Success', 'Delivered', 'Approved', 'Recorded', 'Paid')";
            } else if (status === 'Pending') {
                statusCond = " AND t.Status IN ('Pending', 'Applied', 'In Progress', 'Under Process', 'Unpaid')";
            } else if (status === 'Failed' || status === 'Rejected') {
                statusCond = " AND t.Status IN ('Failed', 'Rejected', 'Cancelled')";
            } else {
                statusCond = ' AND t.Status = @status';
                params.status = status;
            }
        }

        let searchCond = '';
        if (search) {
            searchCond = " AND (t.Title LIKE @search ESCAPE '\\' OR ISNULL(t.RefNumber, '') LIKE @search ESCAPE '\\')";
            params.search = `%${escapeLike(search)}%`;
        }

        const moduleFilter = selectedModule === 'Loans'
            ? " AND t.SourceModule = 'Cashbook' AND t.EntryType IN ('Loan Given', 'Loan Received', 'Loan Repay', 'Loan Recovery')"
            : (selectedModule ? ' AND t.SourceModule = @srcModule' : '');
        if (selectedModule && selectedModule !== 'Loans') params.srcModule = selectedModule;
        // Customer filter (Grahak ka saara data ek saath export karne ke liye)
        let exportFilterCond = '';
        if (customerId && customerId !== 'all') {
            exportFilterCond += ' AND t.CustomerID = @customerId';
            params.customerId = parseInt(customerId, 10) || 0;
        }

        // Account filter (union me AccountID nahi hota - naam se match)
        if (accountId && accountId !== 'all') {
            exportFilterCond += ' AND t.AccountName IN (SELECT AccountName FROM Accounts WHERE AccountID = @accountId)';
            params.accountId = parseInt(accountId, 10) || 0;
        }

        // Category filter
        if (categoryId && categoryId !== 'all') {
            exportFilterCond += ' AND t.CategoryOrService IN (SELECT CategoryName FROM Categories WHERE CategoryID = @categoryId)';
            params.categoryId = parseInt(categoryId, 10) || 0;
        }

        const dataRes = await query(`
            SELECT
                t.RecordDate,
                t.RecordTime,
                t.SourceModule,
                t.Title,
                t.EntityName,
                t.CategoryOrService,
                t.RefNumber,
                t.AccountName,
                t.EntryType,
                t.Amount,
                t.Status,
                t.CustomerID,
                t.SortDate
            FROM (
                SELECT
                    t.TransDate as RecordDate,
                    CAST(ISNULL(t.TransTime, CAST(t.CreatedAt AS TIME)) AS VARCHAR(8)) as RecordTime,
                    'Cashbook' as SourceModule,
                    ISNULL(t.Description, t.TransType) as Title,
                    COALESCE(p.PartyName, a.AccountName, 'General') as EntityName,
                    ISNULL(c.CategoryName, t.TransType) as CategoryOrService,
                    t.Reference as RefNumber,
                    a.AccountName,
                    t.TransType as EntryType,
                    t.Amount,
                    'Completed' as Status,
                    NULL as CustomerID,
                    ISNULL(t.CreatedAt, CAST(t.TransDate AS DATETIME)) as SortDate
                FROM Transactions t
                LEFT JOIN Accounts a ON t.AccountID = a.AccountID
                LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
                LEFT JOIN Parties p ON t.PartyID = p.PartyID
                WHERE t.UserID = @userId AND t.IsDeleted = 0
                  AND NOT (${invoiceMirrorHasPaymentHistory('t')})
                  AND (t.SourceModule IS NULL OR t.SourceModule NOT IN ('CSC', 'BillPay', 'UCL'))
                  AND (t.Tags IS NULL OR (t.Tags NOT LIKE '%CSC_FEE_IN%' AND t.Tags NOT LIKE '%CSC_GOVT_FEE_OUT%'))

                UNION ALL

                SELECT
                    CAST(c.ApplyDate AS DATE),
                    ISNULL(NULLIF(CAST(CAST(c.ApplyDate AS TIME) AS VARCHAR(8)), ''), ''),
                    'CSC',
                    ISNULL(c.ServiceType, 'CSC Service') || CASE WHEN c.ServiceSubtype IS NOT NULL AND c.ServiceSubtype != '' THEN ' - ' || c.ServiceSubtype ELSE '' END,
                    c.CustomerName,
                    ISNULL(c.PortalName, 'CSC'),
                    c.AckNumber,
                    c.PaymentMode,
                    c.PaymentStatus,
                    c.TotalFee,
                    c.Status,
                    c.CustomerID,
                    c.CreatedAt
                FROM CSCApplications c
                WHERE c.IsActive = 1 AND c.UserID = @userId

                UNION ALL

                SELECT
                    b.TransDate,
                    CAST(ISNULL(b.TransTime, CAST(b.CreatedAt AS TIME)) AS VARCHAR(8)),
                    'BC Banking',
                    ISNULL(b.ServiceType, 'BC Service'),
                    b.CustomerName,
                    ISNULL(b.BankName, 'BC'),
                    b.RRN_UTR,
                    NULL,
                    b.QROperation,
                    b.Amount,
                    b.Status,
                    b.CustomerID,
                    b.CreatedAt
                FROM BCTransactions b
                WHERE b.UserID = @userId

                UNION ALL

                SELECT
                    k.EntryDate,
                    ISNULL(NULLIF(k.EntryTime, ''), CAST(CAST(k.CreatedAt AS TIME) AS VARCHAR(8))),
                    'Khata',
                    ISNULL(k.Description, CASE
                        WHEN k.EntryType = 'Gave' THEN 'Udhaar Diya'
                        WHEN k.EntryType = 'Got' THEN 'Jama Mila'
                        WHEN k.EntryType = 'Settlement' THEN 'Advance se Settlement'
                        ELSE 'BC Flow' END),
                    cust.CustomerName,
                    'Khata Udhaar / Jama',
                    k.ReferenceNo,
                    ISNULL(k.PaymentMode, 'Cash'),
                    CASE
                        WHEN k.EntryType = 'Gave' THEN 'Udhaar (Debit)'
                        WHEN k.EntryType = 'Got' THEN 'Jama (Credit)'
                        WHEN k.EntryType = 'Settlement' THEN 'Settlement (Neutral)'
                        ELSE 'BC Flow (Neutral)' END,
                    k.Amount,
                    'Recorded',
                    k.CustomerID,
                    ISNULL(k.CreatedAt, CAST(k.EntryDate AS DATETIME))
                FROM KhataEntries k
                LEFT JOIN Customers cust ON k.CustomerID = cust.CustomerID
                WHERE k.UserID = @userId

                UNION ALL

                SELECT
                    i.InvoiceDate,
                    CAST(CAST(i.CreatedAt AS TIME) AS VARCHAR(8)),
                    'Invoice',
                    'Bill #' || i.InvoiceNumber,
                    cust.CustomerName,
                    ISNULL(i.PaymentMode, 'Bill'),
                    i.InvoiceNumber,
                    a.AccountName,
                    i.PaymentStatus,
                    i.TotalAmount,
                    ISNULL(i.Status, 'Active'),
                    i.CustomerID,
                    i.CreatedAt
                FROM Invoices i
                LEFT JOIN Customers cust ON i.CustomerID = cust.CustomerID
                LEFT JOIN Accounts a ON i.AccountID = a.AccountID
                WHERE i.Status != 'Cancelled' AND i.UserID = @userId

                UNION ALL

                SELECT
                    bp.PaymentDate,
                    CAST(ISNULL(bp.PaymentTime, CAST(bp.CreatedAt AS TIME)) AS VARCHAR(8)),
                    'BillPay',
                    ISNULL(bp.BillCategory, 'Bill Pay') || CASE WHEN bp.ProviderName IS NOT NULL AND bp.ProviderName != '' THEN ' - ' || bp.ProviderName ELSE '' END,
                    COALESCE(bp.CustomerName, bp.CustomerPhone, 'Customer'),
                    ISNULL(bp.BillCategory, 'BillPay'),
                    ISNULL(bp.ConsumerNumber, bp.TxnReference),
                    ISNULL(bp.PaymentMode, 'Cash'),
                    ISNULL(bp.BillCategory, 'BillPay'),
                    bp.TotalCollected,
                    bp.Status,
                    bp.CustomerID,
                    ISNULL(bp.CreatedAt, CAST(bp.PaymentDate AS DATETIME))
                FROM BillPayments bp
                WHERE ISNULL(bp.IsDeleted, 0) = 0 AND bp.UserID = @userId

                UNION ALL

                SELECT
                    CAST(u.UpdateDate AS DATE),
                    CAST(ISNULL(CAST(u.CreatedAt AS TIME), CAST(u.UpdateDate AS TIME)) AS VARCHAR(8)),
                    'UCL',
                    ISNULL(u.UpdateType, 'UCL Update'),
                    COALESCE(u.CustomerName, u.CustomerPhone, 'Resident'),
                    'Aadhaar UCL',
                    ISNULL(u.SID, u.PACCode),
                    ISNULL(u.PaymentMode, 'Cash'),
                    ISNULL(u.UpdateType, 'UCL'),
                    u.TotalAmount,
                    u.Status,
                    u.CustomerID,
                    ISNULL(u.CreatedAt, u.UpdateDate)
                FROM UCLUpdates u
                WHERE ISNULL(u.IsDeleted, 0) = 0 AND u.UserID = @userId
            ) t
            WHERE 1=1
              ${dateCond.replace(/t\.TransDate/g, 't.RecordDate')}
              ${moduleFilter}
              ${typeCond}
              ${statusCond}
              ${searchCond}
              ${exportFilterCond}
            ORDER BY t.SortDate DESC
            LIMIT 2001
        `, params);

        // TOP 2001 purposely - agar 2001 row aaye to matlab data truncate hua hai.
        // Bina is warning ke user ko pata hi nahi chalta ki export me rows missing hain.
        const EXPORT_ROW_CAP = 2000;
        const allFetched = dataRes.recordset || [];
        const truncated = allFetched.length > EXPORT_ROW_CAP;
        records = truncated ? allFetched.slice(0, EXPORT_ROW_CAP) : allFetched;

        let totalAmount = 0;
        records.forEach((r, idx) => {
            const dateStr = r.RecordDate ? new Date(r.RecordDate).toLocaleDateString('en-IN') : '';
            const timeStr = r.RecordTime ? String(r.RecordTime).substring(0, 5) : '';
            const dateTimeStr = dateStr + (timeStr ? ' ' + timeStr : '');
            const rowAmount = parseFloat(r.Amount) || 0;
            totalAmount += rowAmount;

            const row = sheet.addRow([
                idx + 1,
                dateTimeStr,
                r.SourceModule || 'Cashbook',
                r.Title || '',
                r.EntityName || '',
                r.RefNumber || '',
                r.EntryType || '',
                rowAmount,
                r.Status || 'Completed',
                r.CustomerID || ''
            ]);
            row.alignment = { vertical: 'middle' };
            row.getCell(8).numFmt = '₹#,##0.00';
            row.getCell(1).alignment = { horizontal: 'center' };
            row.getCell(2).alignment = { horizontal: 'center' };
            row.getCell(7).alignment = { horizontal: 'center' };
            row.getCell(9).alignment = { horizontal: 'center' };
        });

        // Summary Total Row
        const totRow = sheet.addRow(['', '', '', '', '', '', 'TOTAL:', totalAmount, '']);
        totRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        totRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } };
        totRow.getCell(8).numFmt = '₹#,##0.00';
        totRow.height = 24;

        // Truncation warning - export me rows missing hain to user ko dikhana zaroori hai
        if (truncated) {
            const warnRow = sheet.addRow(['', `⚠️ Sirf pehle ${EXPORT_ROW_CAP} rows export hui hain — isse zyada data ke liye date range / module filter use karein.`, '', '', '', '', '', '', '']);
            warnRow.font = { bold: true, size: 10, color: { argb: 'FFB91C1C' } };
            warnRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            warnRow.height = 22;
        }

        // Auto column widths
        sheet.columns = [
            { width: 8 },
            { width: 20 },
            { width: 14 },
            { width: 32 },
            { width: 28 },
            { width: 22 },
            { width: 16 },
            { width: 18 },
            { width: 14 },
            { width: 10 }
        ];

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Report_${module}_${todayLocal()}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Error generating Excel export:', err);
        res.status(500).json({ success: false, error: 'Excel export nahi ban paya' });
    }
});

// ============================================================================
// 5. GET /api/reports/export/csv - Universal CSV Export
// ============================================================================

// CSV formula injection se protection: value se pehle = + - @ \t \r ho to
// single quote laga do, warna Excel/Sheets me formula execute ho jaata hai
function csvCell(value) {
    if (value === undefined || value === null) return '""';
    let s = String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
}

router.get('/export/csv', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const { startDate, endDate, module = 'all', type, status, search, accountId, categoryId, customerId } = req.query;

        let dateCond = '';
        const params = { userId };
        if (startDate) { dateCond += ' AND t.TransDate >= @startDate'; params.startDate = startDate; }
        if (endDate) { dateCond += ' AND t.TransDate <= @endDate'; params.endDate = endDate; }

        const MODULE_MAP = {
            'all': null, 'cashbook': 'Cashbook', 'transactions': 'Cashbook',
            'csc': 'CSC', 'bc': 'BC Banking', 'khata': 'Khata',
            'invoice': 'Invoice', 'invoices': 'Invoice',
            'billpay': 'BillPay', 'ucl': 'UCL',
            'loans': 'Loans', 'loan': 'Loans',
            'accounts': null, 'charts': null
        };
        const selectedModule = MODULE_MAP[String(module || 'all').toLowerCase()];
        if (selectedModule === undefined) {
            return res.status(400).json({ success: false, error: 'Module galat hai' });
        }
        if (selectedModule === 'Loans') {
            dateCond += " AND t.SourceModule = 'Cashbook' AND t.EntryType IN ('Loan Given', 'Loan Received', 'Loan Repay', 'Loan Recovery')";
        } else if (selectedModule) {
            dateCond += ' AND t.SourceModule = @srcModule';
            params.srcModule = selectedModule;
        }

        // Extra filters (type/status/search/customer) - master mapping jaisa hi
        let csvExtraCond = '';
        const csvExtraParts = [];
        if (type && type !== 'all') {
            if (type === 'CSC' || type === 'CSC Application') { csvExtraParts.push("t.SourceModule = 'CSC'"); }
            else if (type === 'BC' || type === 'BC Banking') { csvExtraParts.push("t.SourceModule = 'BC Banking'"); }
            else if (type === 'Cashbook') { csvExtraParts.push("t.SourceModule = 'Cashbook'"); }
            else if (type === 'Invoice' || type === 'Invoices') { csvExtraParts.push("t.SourceModule IN ('Invoices', 'Invoice')"); }
            else { csvExtraParts.push('t.EntryType = @type'); params.type = type; }
        }
        if (status && status !== 'all') {
            if (status === 'Completed' || status === 'Success' || status === 'Delivered' || status === 'Approved') { csvExtraParts.push("t.Status IN ('Completed', 'Success', 'Delivered', 'Approved', 'Recorded', 'Paid')"); }
            else if (status === 'Pending') { csvExtraParts.push("t.Status IN ('Pending', 'Applied', 'In Progress', 'Under Process', 'Unpaid')"); }
            else if (status === 'Failed' || status === 'Rejected') { csvExtraParts.push("t.Status IN ('Failed', 'Rejected', 'Cancelled')"); }
            else { csvExtraParts.push('t.Status = @status'); params.status = status; }
        }
        if (search) {
            csvExtraParts.push("t.Title LIKE @search ESCAPE '\\' OR t.RefNumber LIKE @search ESCAPE '\\'");
            params.search = `%${escapeLike(search)}%`;
        }
        if (customerId && customerId !== 'all') { csvExtraParts.push('t.CustomerID = @customerId'); params.customerId = parseInt(customerId, 10) || 0; }
        if (accountId && accountId !== 'all') { csvExtraParts.push('t.AccountName IN (SELECT AccountName FROM Accounts WHERE AccountID = @accountId)'); params.accountId = parseInt(accountId, 10) || 0; }
        if (categoryId && categoryId !== 'all') { csvExtraParts.push('t.CategoryOrService IN (SELECT CategoryName FROM Categories WHERE CategoryID = @categoryId)'); params.categoryId = parseInt(categoryId, 10) || 0; }
        if (csvExtraParts.length > 0) { csvExtraCond = ' AND ' + csvExtraParts.join(' AND '); }

        const data = await query(`
            SELECT
                t.RecordDate, t.RecordTime, t.SourceModule, t.EntryType, t.Amount,
                t.Title, t.RefNumber, t.AccountName, t.EntityName, t.CategoryOrService, t.CustomerID
            FROM (
                SELECT
                    t.TransDate as RecordDate,
                    CAST(ISNULL(t.TransTime, CAST(t.CreatedAt AS TIME)) AS VARCHAR(8)) as RecordTime,
                    'Cashbook' as SourceModule,
                    t.TransType as EntryType,
                    t.Amount,
                    ISNULL(t.Description, t.TransType) as Title,
                    ISNULL(t.Reference, '') as RefNumber,
                    ISNULL(a.AccountName, '') as AccountName,
                    COALESCE(p.PartyName, a.AccountName, 'General') as EntityName,
                    ISNULL(c.CategoryName, t.TransType) as CategoryOrService,
                    ISNULL(t.CreatedAt, CAST(t.TransDate AS DATETIME)) as SortDate,
                    NULL as CustomerID
                FROM Transactions t
                LEFT JOIN Accounts a ON t.AccountID = a.AccountID
                LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
                LEFT JOIN Parties p ON t.PartyID = p.PartyID
                WHERE t.UserID = @userId AND t.IsDeleted = 0
                  AND NOT (${invoiceMirrorHasPaymentHistory('t')})
                  AND (t.SourceModule IS NULL OR t.SourceModule NOT IN ('CSC', 'BillPay', 'UCL'))
                  AND (t.Tags IS NULL OR (t.Tags NOT LIKE '%CSC_FEE_IN%' AND t.Tags NOT LIKE '%CSC_GOVT_FEE_OUT%'))

                UNION ALL

                SELECT
                    CAST(c.ApplyDate AS DATE),
                    ISNULL(NULLIF(CAST(CAST(c.ApplyDate AS TIME) AS VARCHAR(8)), ''), ''),
                    'CSC',
                    c.PaymentStatus,
                    c.TotalFee,
                    ISNULL(c.ServiceType, 'CSC Service'),
                    ISNULL(c.AckNumber, ''),
                    ISNULL(c.PaymentMode, ''),
                    ISNULL(c.CustomerName, ''),
                    ISNULL(c.PortalName, 'CSC'),
                    c.CreatedAt,
                    c.CustomerID
                FROM CSCApplications c
                WHERE c.IsActive = 1 AND c.UserID = @userId

                UNION ALL

                SELECT
                    b.TransDate,
                    CAST(ISNULL(b.TransTime, CAST(b.CreatedAt AS TIME)) AS VARCHAR(8)),
                    'BC Banking',
                    b.QROperation,
                    b.Amount,
                    ISNULL(b.ServiceType, 'BC Service'),
                    ISNULL(b.RRN_UTR, ''),
                    '',
                    ISNULL(b.CustomerName, ''),
                    ISNULL(b.BankName, 'BC'),
                    b.CreatedAt,
                    b.CustomerID
                FROM BCTransactions b
                WHERE b.UserID = @userId

                UNION ALL

                SELECT
                    k.EntryDate,
                    ISNULL(NULLIF(k.EntryTime, ''), CAST(CAST(k.CreatedAt AS TIME) AS VARCHAR(8))),
                    'Khata',
                    CASE
                        WHEN k.EntryType = 'Gave' THEN 'Udhaar (Debit)'
                        WHEN k.EntryType = 'Got' THEN 'Jama (Credit)'
                        WHEN k.EntryType = 'Settlement' THEN 'Settlement (Neutral)'
                        ELSE 'BC Flow (Neutral)' END,
                    k.Amount,
                    ISNULL(k.Description, k.EntryType),
                    ISNULL(k.ReferenceNo, ''),
                    ISNULL(k.PaymentMode, 'Cash'),
                    ISNULL(cust.CustomerName, ''),
                    'Khata Udhaar / Jama',
                    ISNULL(k.CreatedAt, CAST(k.EntryDate AS DATETIME)),
                    k.CustomerID
                FROM KhataEntries k
                LEFT JOIN Customers cust ON k.CustomerID = cust.CustomerID
                WHERE k.UserID = @userId

                UNION ALL

                SELECT
                    i.InvoiceDate,
                    CAST(CAST(i.CreatedAt AS TIME) AS VARCHAR(8)),
                    'Invoice',
                    i.PaymentStatus,
                    i.TotalAmount,
                    'Bill #' || i.InvoiceNumber,
                    ISNULL(i.InvoiceNumber, ''),
                    ISNULL(a.AccountName, ''),
                    ISNULL(cust.CustomerName, ''),
                    ISNULL(i.PaymentMode, 'Bill'),
                    i.CreatedAt,
                    i.CustomerID
                FROM Invoices i
                LEFT JOIN Customers cust ON i.CustomerID = cust.CustomerID
                LEFT JOIN Accounts a ON i.AccountID = a.AccountID
                WHERE i.Status != 'Cancelled' AND i.UserID = @userId

                UNION ALL

                SELECT
                    bp.PaymentDate,
                    CAST(ISNULL(bp.PaymentTime, CAST(bp.CreatedAt AS TIME)) AS VARCHAR(8)),
                    'BillPay',
                    ISNULL(bp.BillCategory, 'BillPay'),
                    bp.TotalCollected,
                    ISNULL(bp.BillCategory, 'Bill Pay') || CASE WHEN bp.ProviderName IS NOT NULL AND bp.ProviderName != '' THEN ' - ' || bp.ProviderName ELSE '' END,
                    ISNULL(bp.ConsumerNumber, bp.TxnReference),
                    ISNULL(bp.PaymentMode, 'Cash'),
                    COALESCE(bp.CustomerName, bp.CustomerPhone, 'Customer'),
                    ISNULL(bp.BillCategory, 'BillPay'),
                    ISNULL(bp.CreatedAt, CAST(bp.PaymentDate AS DATETIME)),
                    bp.CustomerID
                FROM BillPayments bp
                WHERE ISNULL(bp.IsDeleted, 0) = 0 AND bp.UserID = @userId

                UNION ALL

                SELECT
                    CAST(u.UpdateDate AS DATE),
                    CAST(ISNULL(CAST(u.CreatedAt AS TIME), CAST(u.UpdateDate AS TIME)) AS VARCHAR(8)),
                    'UCL',
                    ISNULL(u.UpdateType, 'UCL'),
                    u.TotalAmount,
                    ISNULL(u.UpdateType, 'UCL Update'),
                    ISNULL(u.SID, u.PACCode),
                    ISNULL(u.PaymentMode, 'Cash'),
                    COALESCE(u.CustomerName, u.CustomerPhone, 'Resident'),
                    'Aadhaar UCL',
                    ISNULL(u.CreatedAt, u.UpdateDate),
                    u.CustomerID
                FROM UCLUpdates u
                WHERE ISNULL(u.IsDeleted, 0) = 0 AND u.UserID = @userId
            ) t
            WHERE 1=1 ${dateCond.replace(/t\.TransDate/g, 't.RecordDate')} ${csvExtraCond}
            ORDER BY t.SortDate DESC
            LIMIT 5001
        `, params);

        let csv = 'Date,Time,Module,Type,Amount,Title,Reference,Account,Party,Category,CustomerID\r\n';
        // TOP 5001 purposely - 5001 row aaye to matlab truncate hua hai (warning ke liye)
        const CSV_ROW_CAP = 5000;
        const allRows = data.recordset || [];
        const csvTruncated = allRows.length > CSV_ROW_CAP;
        const rows = csvTruncated ? allRows.slice(0, CSV_ROW_CAP) : allRows;
        rows.forEach(r => {
            const dateStr = r.RecordDate ? new Date(r.RecordDate).toISOString().split('T')[0] : '';
            const timeStr = r.RecordTime ? String(r.RecordTime).substring(0, 5) : '';
            csv += [
                csvCell(dateStr), csvCell(timeStr), csvCell(r.SourceModule), csvCell(r.EntryType),
                parseFloat(r.Amount) || 0, csvCell(r.Title), csvCell(r.RefNumber),
                csvCell(r.AccountName), csvCell(r.EntityName), csvCell(r.CategoryOrService), csvCell(r.CustomerID || '')
            ].join(',') + '\r\n';
        });
        if (csvTruncated) {
            csv += `# WARNING: sirf pehle ${CSV_ROW_CAP} rows export hui hain - isse zyada data ke liye date range / module filter use karein\r\n`;
        }

        // UTF-8 BOM: Excel me Hindi/₹ characters sahi dikhne ke liye
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=Report_${module}_${todayLocal()}.csv`);
        res.send('\uFEFF' + csv);
    } catch (err) {
        console.error('Error generating CSV export:', err);
        res.status(500).json({ success: false, error: 'CSV export nahi ban paya' });
    }
});

// ============================================================================
// 6. LEGACY COMPATIBILITY ENDPOINTS: /monthly and /yearly
// ============================================================================
router.get('/monthly', async (req, res) => {
    try {
        const userId = req.user.UserID;
        // Sargable month range (MONTH()/YEAR() se index use nahi hota tha)
        const { start: monthStart, end: monthEnd, m: month, y: year } = monthRange(req.query.month, req.query.year);

        const data = await query(`
            SELECT
                t.TransDate, t.TransTime, t.CreatedAt, t.TransType, t.Amount, t.Description, t.Reference,
                a.AccountName, c.CategoryName, p.PartyName
            FROM Transactions t
            LEFT JOIN Accounts a ON t.AccountID = a.AccountID
            LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
            LEFT JOIN Parties p ON t.PartyID = p.PartyID
            WHERE t.TransDate >= @monthStart AND t.TransDate <= @monthEnd AND t.UserID = @userId AND t.IsDeleted = 0
            ORDER BY t.TransDate DESC, ISNULL(t.TransTime, CAST(t.CreatedAt AS TIME)) DESC, t.CreatedAt DESC
        `, { monthStart, monthEnd, userId });

        // F2 Fix: Include BC Profit & BillPay Commission so Monthly matches Universal KPI Net
        const bcProfitRes = await query(`
            SELECT 
                ISNULL(SUM(b.CommissionEarned), 0) as BCCommission,
                ISNULL(SUM(b.CustomerCharge), 0) as BCTotalCharge
            FROM BCTransactions b
            WHERE b.TransDate >= @monthStart AND b.TransDate <= @monthEnd 
              AND b.Status = 'Success' AND b.UserID = @userId
        `, { monthStart, monthEnd, userId });

        const bcKhataRes = await query(`
            SELECT ISNULL(SUM(k.Amount), 0) as BCChargeOnKhata
            FROM KhataEntries k
            WHERE k.EntryDate >= @monthStart AND k.EntryDate <= @monthEnd 
              AND k.EntryType = 'Gave' AND k.BCID IS NOT NULL AND k.UserID = @userId
        `, { monthStart, monthEnd, userId });

        const bpMonthRes = await query(`
            SELECT ISNULL(SUM(bp.CommissionEarned), 0) as BPCommission
            FROM BillPayments bp
            WHERE bp.PaymentDate >= @monthStart AND bp.PaymentDate <= @monthEnd 
              AND bp.IsDeleted = 0 AND bp.UserID = @userId
        `, { monthStart, monthEnd, userId });

        const bRow = bcProfitRes.recordset[0] || {};
        const bkRow = bcKhataRes.recordset[0] || {};
        const bpRow = bpMonthRes.recordset[0] || {};

        const bcCashCharge = Math.max(0, (bRow.BCTotalCharge || 0) - (bkRow.BCChargeOnKhata || 0));
        const bcProfit = (bRow.BCCommission || 0) + bcCashCharge;
        const bpCommission = bpRow.BPCommission || 0;

        const cashbookIncome = data.recordset.filter(r => r.TransType === 'Income').reduce((s, r) => s + r.Amount, 0);
        const expense = data.recordset.filter(r => r.TransType === 'Expense').reduce((s, r) => s + r.Amount, 0);
        const income = parseFloat((cashbookIncome + bcProfit + bpCommission).toFixed(2));
        const net = parseFloat((income - expense).toFixed(2));

        res.json({
            success: true,
            data: {
                transactions: data.recordset,
                summary: { 
                    income, 
                    expense, 
                    net,
                    cashbookIncome,
                    bcCommission: bRow.BCCommission || 0,
                    bcCharge: bcCashCharge,
                    bcProfit,
                    bpCommission
                },
                month, year
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Monthly report nahi ban paya' });
    }
});

router.get('/yearly', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const { start: yearStart, end: yearEnd, y: year } = yearRange(req.query.year);

        const monthly = await query(`
            WITH Months AS (
                SELECT 1 AS Month UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
                UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
                UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
            ),
            TransAgg AS (
                SELECT
                    MONTH(TransDate) as Month,
                    ISNULL(SUM(CASE WHEN TransType = 'Income' THEN Amount ELSE 0 END), 0) as CashIncome,
                    ISNULL(SUM(CASE WHEN TransType = 'Expense' THEN Amount ELSE 0 END), 0) as Expense
                FROM Transactions
                WHERE TransDate >= @yearStart AND TransDate <= @yearEnd AND UserID = @userId AND IsDeleted = 0
                GROUP BY MONTH(TransDate)
            ),
            BCAgg AS (
                SELECT
                    MONTH(b.TransDate) as Month,
                    ISNULL(SUM(b.CommissionEarned), 0) as BCCommission,
                    ISNULL(SUM(b.CustomerCharge), 0) as BCCharge
                FROM BCTransactions b
                WHERE b.TransDate >= @yearStart AND b.TransDate <= @yearEnd AND b.Status = 'Success' AND b.UserID = @userId
                GROUP BY MONTH(b.TransDate)
            ),
            BPAgg AS (
                SELECT
                    MONTH(bp.PaymentDate) as Month,
                    ISNULL(SUM(bp.CommissionEarned), 0) as BPCommission
                FROM BillPayments bp
                WHERE bp.PaymentDate >= @yearStart AND bp.PaymentDate <= @yearEnd AND bp.IsDeleted = 0 AND bp.UserID = @userId
                GROUP BY MONTH(bp.PaymentDate)
            )
            SELECT
                m.Month,
                ISNULL(t.CashIncome, 0) + ISNULL(bc.BCCommission, 0) + ISNULL(bc.BCCharge, 0) + ISNULL(bp.BPCommission, 0) AS Income,
                ISNULL(t.Expense, 0) AS Expense,
                ISNULL(t.CashIncome, 0) AS CashIncome,
                ISNULL(bc.BCCommission, 0) + ISNULL(bc.BCCharge, 0) AS BCProfit,
                ISNULL(bp.BPCommission, 0) AS BPCommission
            FROM Months m
            LEFT JOIN TransAgg t ON m.Month = t.Month
            LEFT JOIN BCAgg bc ON m.Month = bc.Month
            LEFT JOIN BPAgg bp ON m.Month = bp.Month
            WHERE ISNULL(t.CashIncome, 0) > 0 OR ISNULL(t.Expense, 0) > 0 OR ISNULL(bc.BCCommission, 0) > 0 OR ISNULL(bp.BPCommission, 0) > 0
            ORDER BY m.Month
        `, { yearStart, yearEnd, userId });

        const categoryWise = await query(`
            SELECT ISNULL(c.CategoryName, 'Without Category') as CategoryName, ISNULL(c.Color, '#94a3b8') as Color, SUM(t.Amount) as Total
            FROM Transactions t
            LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
            WHERE t.TransDate >= @yearStart AND t.TransDate <= @yearEnd AND t.TransType = 'Expense' AND t.UserID = @userId AND t.IsDeleted = 0
            GROUP BY ISNULL(c.CategoryName, 'Without Category'), ISNULL(c.Color, '#94a3b8')
            ORDER BY Total DESC
        `, { yearStart, yearEnd, userId });

        res.json({
            success: true,
            data: { monthly: monthly.recordset, categoryWise: categoryWise.recordset, year }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Yearly report nahi ban paya' });
    }
});

module.exports = router;
