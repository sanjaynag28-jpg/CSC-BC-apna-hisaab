const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const { lookupBySN } = require('../database/globalTxnRegistry');

// Quick Navigation items catalog
const QUICK_NAV_ITEMS = [
    { title: 'Dashboard (डैशबोर्ड)', page: 'dashboard', icon: 'layout-dashboard', keywords: ['dashboard', 'home', 'main', 'summary', 'hisaab'] },
    { title: 'BC Counter (CSP - कियोस्क बैंकिंग)', page: 'bc', icon: 'landmark', keywords: ['bc', 'csp', 'banking', 'kiosk', 'aeps', 'withdrawal', 'deposit', 'nikasi', 'jama', 'dmt'] },
    { title: 'Transactions Ledger (लेन-देन लेजर)', page: 'transactions', icon: 'arrow-left-right', keywords: ['transactions', 'ledger', 'cashbook', 'entry', 'income', 'expense'] },
    { title: 'Accounts & Wallets (खाते और वॉलेट)', page: 'accounts', icon: 'wallet', keywords: ['accounts', 'wallet', 'bank', 'cash in hand', 'digipay', 'lite', 'sbi'] },
    { title: 'Customers Directory (ग्राहक सूची)', page: 'customers', icon: 'user-check', keywords: ['customers', 'grahak', 'aadhaar', 'party', 'client'] },
    { title: 'Khatabook (खाताबुक - उधारी / जमा)', page: 'khatabook', icon: 'book-open', keywords: ['khatabook', 'khata', 'udhaar', 'jama', 'gave', 'got', 'hisab'] },
    { title: 'Billing & Invoices (बिलिंग और इनवॉइस)', page: 'billing', icon: 'receipt', keywords: ['billing', 'invoice', 'bill', 'receipt', 'tax invoice'] },
    { title: 'Reports & Analytics (रिपोर्ट्स)', page: 'reports', icon: 'bar-chart-2', keywords: ['reports', 'analytics', 'profit', 'statement', 'download'] },
    { title: 'Database Explorer (लाइव डेटाबेस)', page: 'database', icon: 'database', keywords: ['database', 'sql', 'tables', 'backup', 'restore'] },
    { title: 'Work Tracker (CSC सेवा - PAN, आय, निवास, राशन)', page: 'csc', icon: 'clipboard-check', keywords: ['csc', 'work', 'tracker', 'pan', 'aay', 'niwas', 'jati', 'ration', 'form', 'apply', 'token', 'aavedan'] }
];

// --------------------------------------------------------------------------
// 1. UNIVERSAL GLOBAL SEARCH
// --------------------------------------------------------------------------
router.get(['/', '/universal'], async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const rawQ = (req.query.q || '').trim();
        const type = (req.query.type || 'all').toLowerCase().trim();

        if (!rawQ || rawQ.length < 1) {
            return res.json({
                success: true,
                query: '',
                type,
                totalMatches: 0,
                results: {
                    customers: [],
                    bcTransactions: [],
                    khatabook: [],
                    invoices: [],
                    transactions: [],
                    cscApplications: [],
                    quickNav: []
                }
            });
        }

        const isAll = type === 'all';
        const topN = isAll ? 10 : 25;
        const shouldRun = (category) => isAll || type === category;

        const searchPattern = `%${rawQ}%`;
        const cleanDigits = rawQ.replace(/\D/g, '');
        const digitPattern = cleanDigits ? `%${cleanDigits}%` : '';
        const last4Digits = cleanDigits.length >= 4 ? cleanDigits.slice(-4) : cleanDigits;
        const custIdNum = parseInt(rawQ.replace(/^[#c\s]+/i, '').trim(), 10);
        const targetCustId = !isNaN(custIdNum) && custIdNum > 0 ? custIdNum : -1;
        const parsedSN = /^\d+$/.test(rawQ) ? parseInt(rawQ, 10) : (rawQ.toUpperCase().startsWith('SN-') ? parseInt(rawQ.substring(3), 10) : -1);
        const numericSN = !isNaN(parsedSN) && parsedSN > 0 ? parsedSN : -1;

        // Check if query matches Universal Global Serial Number or Module Code
        const snMatch = await lookupBySN(rawQ, userId);

        // Run queries in parallel for high speed
        const [
            custRes,
            bcRes,
            khataRes,
            invoiceRes,
            transRes,
            cscRes
        ] = await Promise.all([
            // A. Customers (Search by CustomerID, Name, Phone, 12-Digit Aadhaar, Family, Address)
            shouldRun('customers') ? query(`
                SELECT TOP (${topN}) c.CustomerID, c.CustomerName, c.Phone, c.AadhaarNumber, 
                               c.CurrentBalance, c.BalanceType, c.FamilyName, c.Relationship, 
                               c.IsFamilyHead, c.Address,
                               (SELECT COUNT(*) FROM Customers m WHERE m.FamilyID = c.FamilyID AND m.IsActive = 1 AND m.UserID = @userId) AS FamilyMembersCount
                FROM Customers c
                WHERE c.IsActive = 1 AND c.UserID = @userId AND (
                    c.CustomerID = @targetCustId OR
                    c.CustomerName LIKE @q OR 
                    c.Phone LIKE @q OR 
                    c.AadhaarNumber LIKE @q OR 
                    (@cleanDigits <> '' AND LEN(@cleanDigits) >= 3 AND REPLACE(REPLACE(ISNULL(c.AadhaarNumber, ''), ' ', ''), '-', '') LIKE @digitPattern) OR
                    (@cleanDigits <> '' AND LEN(@cleanDigits) >= 4 AND RIGHT(REPLACE(REPLACE(ISNULL(c.AadhaarNumber, ''), ' ', ''), '-', ''), 4) = @last4Digits) OR
                    c.FamilyName LIKE @q OR 
                    c.Address LIKE @q
                )
                ORDER BY 
                    CASE WHEN c.CustomerID = @targetCustId THEN 0
                         WHEN c.CustomerName LIKE @exactStart THEN 1 
                         WHEN c.Phone LIKE @exactStart THEN 2 
                         WHEN c.AadhaarNumber LIKE @exactStart THEN 3 
                         ELSE 4 END,
                    c.CustomerID DESC
            `, { userId, q: searchPattern, exactStart: `${rawQ}%`, targetCustId, cleanDigits, digitPattern, last4Digits }) : Promise.resolve({ recordset: [] }),

            // B. BC Transactions (Search by Txn ID, Customer, Mobile, Service, RRN/UTR, Bank, Account, Aadhaar, SNCode, ModuleCode)
            shouldRun('bc') ? query(`
                SELECT TOP (${topN}) b.BCID, b.GlobalSerialNo, b.SNCode, b.ModuleCode, b.ServiceType, b.CustomerName, b.CustomerPhone, 
                               b.CustomerAadhaarLast4, b.Amount, b.Status, b.TransDate, 
                               b.TransTime, b.CreatedAt, b.RRN_UTR, b.BankName, b.AccountNumber, b.CustomerID,
                               c.AadhaarNumber as LinkedCustomerAadhaar
                FROM BCTransactions b
                LEFT JOIN Customers c ON b.CustomerID = c.CustomerID AND c.UserID = @userId
                WHERE b.UserID = @userId AND (
                    b.SNCode = @exactStr OR
                    b.ModuleCode = @exactStr OR
                    b.GlobalSerialNo = @numericSN OR
                    b.SNCode LIKE @q OR
                    b.ModuleCode LIKE @q OR
                    b.CustomerName LIKE @q OR 
                    b.CustomerPhone LIKE @q OR 
                    b.CustomerAadhaarLast4 LIKE @q OR
                    (@cleanDigits <> '' AND LEN(@cleanDigits) >= 3 AND (
                        REPLACE(REPLACE(ISNULL(b.CustomerAadhaarLast4, ''), ' ', ''), '-', '') LIKE @digitPattern OR
                        REPLACE(REPLACE(ISNULL(c.AadhaarNumber, ''), ' ', ''), '-', '') LIKE @digitPattern
                    )) OR
                    b.RRN_UTR LIKE @q OR 
                    b.BankName LIKE @q OR 
                    b.AccountNumber LIKE @q OR 
                    b.ServiceType LIKE @q OR 
                    CAST(b.BCID AS VARCHAR) = @exactStr
                )
                ORDER BY b.TransDate DESC, ISNULL(b.TransTime, CAST(b.CreatedAt AS TIME)) DESC, b.BCID DESC
            `, { userId, q: searchPattern, exactStr: rawQ, numericSN, cleanDigits, digitPattern }) : Promise.resolve({ recordset: [] }),

            // C. Khatabook Entries (Search by Customer, Note, Reference, Aadhaar, SNCode, ModuleCode)
            shouldRun('khatabook') ? query(`
                SELECT TOP (${topN}) k.KhataID, k.GlobalSerialNo, k.SNCode, k.ModuleCode, k.CustomerID, c.CustomerName, c.Phone as CustomerPhone, 
                               c.AadhaarNumber as CustomerAadhaar, k.EntryType, k.Amount, 
                               k.EntryDate, k.EntryTime, k.CreatedAt, k.Description, k.ReferenceNo, k.PaymentMode
                FROM KhataEntries k
                JOIN Customers c ON k.CustomerID = c.CustomerID AND c.UserID = @userId
                WHERE k.UserID = @userId AND (
                    k.SNCode = @exactStr OR
                    k.ModuleCode = @exactStr OR
                    k.GlobalSerialNo = @numericSN OR
                    k.SNCode LIKE @q OR
                    k.ModuleCode LIKE @q OR
                    c.CustomerName LIKE @q OR 
                    c.Phone LIKE @q OR 
                    c.AadhaarNumber LIKE @q OR 
                    (@cleanDigits <> '' AND LEN(@cleanDigits) >= 3 AND REPLACE(REPLACE(ISNULL(c.AadhaarNumber, ''), ' ', ''), '-', '') LIKE @digitPattern) OR
                    k.Description LIKE @q OR 
                    k.ReferenceNo LIKE @q
                )
                ORDER BY k.EntryDate DESC, ISNULL(k.EntryTime, CAST(k.CreatedAt AS TIME)) DESC, k.KhataID DESC
            `, { userId, q: searchPattern, exactStr: rawQ, numericSN, cleanDigits, digitPattern }) : Promise.resolve({ recordset: [] }),

            // D. Invoices (Search by Invoice No, Customer, Phone, Aadhaar, SNCode, ModuleCode)
            shouldRun('invoices') ? query(`
                SELECT TOP (${topN}) i.InvoiceID, i.GlobalSerialNo, i.SNCode, i.ModuleCode, i.InvoiceNumber, i.CustomerID, i.InvoiceDate, i.CreatedAt,
                               i.TotalAmount, i.PaidAmount, i.BalanceAmount, i.PaymentStatus,
                               ISNULL(c.CustomerName, 'Walk-in') as CustomerName,
                               c.Phone as CustomerPhone, c.AadhaarNumber as CustomerAadhaar
                FROM Invoices i
                LEFT JOIN Customers c ON i.CustomerID = c.CustomerID AND c.UserID = @userId
                WHERE i.Status != 'Cancelled' AND i.UserID = @userId AND (
                    i.SNCode = @exactStr OR
                    i.ModuleCode = @exactStr OR
                    i.GlobalSerialNo = @numericSN OR
                    i.SNCode LIKE @q OR
                    i.ModuleCode LIKE @q OR
                    i.InvoiceNumber LIKE @q OR 
                    c.CustomerName LIKE @q OR 
                    c.Phone LIKE @q OR 
                    c.AadhaarNumber LIKE @q OR 
                    (@cleanDigits <> '' AND LEN(@cleanDigits) >= 3 AND REPLACE(REPLACE(ISNULL(c.AadhaarNumber, ''), ' ', ''), '-', '') LIKE @digitPattern)
                )
                ORDER BY i.InvoiceDate DESC, i.CreatedAt DESC, i.InvoiceID DESC
            `, { userId, q: searchPattern, exactStr: rawQ, numericSN, cleanDigits, digitPattern }) : Promise.resolve({ recordset: [] }),

            // E. Account Ledger Transactions (Search by Desc, Ref, SNCode, ModuleCode)
            shouldRun('transactions') ? query(`
                SELECT TOP (${topN}) t.TransactionID, t.GlobalSerialNo, t.SNCode, t.ModuleCode, t.TransType, t.Amount, t.Description, t.TransDate, t.TransTime, t.CreatedAt,
                               a.AccountName, cat.CategoryName
                FROM Transactions t
                LEFT JOIN Accounts a ON t.AccountID = a.AccountID
                LEFT JOIN Categories cat ON t.CategoryID = cat.CategoryID
                WHERE t.UserID = @userId AND t.IsDeleted = 0 AND (
                    t.SNCode = @exactStr OR
                    t.ModuleCode = @exactStr OR
                    t.GlobalSerialNo = @numericSN OR
                    t.SNCode LIKE @q OR
                    t.ModuleCode LIKE @q OR
                    t.Description LIKE @q OR 
                    t.Reference LIKE @q OR 
                    a.AccountName LIKE @q OR 
                    cat.CategoryName LIKE @q
                )
                ORDER BY t.TransDate DESC, ISNULL(t.TransTime, CAST(t.CreatedAt AS TIME)) DESC, t.TransactionID DESC
            `, { userId, q: searchPattern, exactStr: rawQ, numericSN }) : Promise.resolve({ recordset: [] }),

            // F. CSC Applications (Search by Customer, Token/Ack, Service, Certificate No, Aadhaar, SNCode, ModuleCode)
            shouldRun('csc') ? query(`
                SELECT TOP (${topN}) a.AppID, a.GlobalSerialNo, a.SNCode, a.ModuleCode, a.CustomerID, a.CustomerName, a.CustomerPhone, a.CustomerAadhaar,
                               a.ServiceType, a.AckNumber, a.PortalName,
                               a.ApplyDate, a.CreatedAt, a.TotalFee, a.PaidAmount, a.DueAmount, a.Status, a.CertificateDocNo
                FROM CSCApplications a
                LEFT JOIN Customers c ON a.CustomerID = c.CustomerID AND c.UserID = @userId
                WHERE a.IsActive = 1 AND a.UserID = @userId AND (
                    a.SNCode = @exactStr OR
                    a.ModuleCode = @exactStr OR
                    a.GlobalSerialNo = @numericSN OR
                    a.SNCode LIKE @q OR
                    a.ModuleCode LIKE @q OR
                    a.CustomerName LIKE @q OR 
                    a.CustomerPhone LIKE @q OR 
                    a.CustomerAadhaar LIKE @q OR 
                    (@cleanDigits <> '' AND LEN(@cleanDigits) >= 3 AND (
                        REPLACE(REPLACE(ISNULL(a.CustomerAadhaar, ''), ' ', ''), '-', '') LIKE @digitPattern OR
                        REPLACE(REPLACE(ISNULL(c.AadhaarNumber, ''), ' ', ''), '-', '') LIKE @digitPattern
                    )) OR
                    a.AckNumber LIKE @q OR 
                    a.CertificateDocNo LIKE @q OR 
                    a.ServiceType LIKE @q OR 
                    CAST(a.AppID AS VARCHAR) = @exactStr
                )
                ORDER BY a.ApplyDate DESC, a.AppID DESC
            `, { userId, q: searchPattern, exactStr: rawQ, numericSN, cleanDigits, digitPattern }) : Promise.resolve({ recordset: [] })
        ]);

        // Filter Quick Navigation items based on search query (only in 'all' mode)
        const qLower = rawQ.toLowerCase();
        const matchedNav = isAll ? QUICK_NAV_ITEMS.filter(item => {
            return item.title.toLowerCase().includes(qLower) ||
                item.page.toLowerCase().includes(qLower) ||
                item.keywords.some(k => k.includes(qLower));
        }) : [];

        const customers = custRes.recordset || [];
        const bcTransactions = bcRes.recordset || [];
        const khatabook = khataRes.recordset || [];
        const invoices = invoiceRes.recordset || [];
        const transactions = transRes.recordset || [];
        const cscApplications = cscRes ? (cscRes.recordset || []) : [];

        const totalMatches = customers.length + bcTransactions.length + khatabook.length + invoices.length + transactions.length + cscApplications.length + matchedNav.length + (snMatch ? 1 : 0);

        res.json({
            success: true,
            query: rawQ,
            type,
            totalMatches,
            universalMatch: snMatch,
            results: {
                customers,
                bcTransactions,
                khatabook,
                invoices,
                transactions,
                cscApplications,
                quickNav: matchedNav
            }
        });
    } catch (err) {
        console.error('Universal search error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --------------------------------------------------------------------------
// 2. CUSTOMER 360° ALL-IN-ONE DOSSIER (FETCH ALL DATA FOR A SINGLE CUSTOMER)
// --------------------------------------------------------------------------
router.get('/customer-360/:id', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const custId = parseInt(req.params.id);
        if (isNaN(custId)) {
            return res.status(400).json({ success: false, error: 'Invalid Customer ID' });
        }

        // A. Primary Customer Profile
        const custRes = await query(`
            SELECT c.*,
                   p.CustomerName as ParentCustomerName,
                   (SELECT COUNT(*) FROM Customers m WHERE m.FamilyID = c.FamilyID AND m.IsActive = 1 AND m.UserID = @userId) AS FamilyMembersCount,
                   (SELECT ISNULL(SUM(m.CurrentBalance), 0) FROM Customers m WHERE m.FamilyID = c.FamilyID AND m.IsActive = 1 AND m.UserID = @userId) AS FamilyTotalBalance
            FROM Customers c
            LEFT JOIN Customers p ON c.ParentCustomerID = p.CustomerID
            WHERE c.CustomerID = @id AND c.UserID = @userId AND c.IsActive = 1
        `, { id: custId, userId });

        if (custRes.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer nahi mila' });
        }

        const customer = custRes.recordset[0];

        // B. Family Members (if family exists)
        let familyMembers = [];
        if (customer.FamilyID) {
            const famRes = await query(`
                SELECT c.CustomerID, c.CustomerName, c.Phone, c.AadhaarNumber, c.Relationship, 
                       c.IsFamilyHead, c.CurrentBalance, c.BalanceType, c.KhataMode
                FROM Customers c
                WHERE c.IsActive = 1 AND c.FamilyID = @famId AND c.UserID = @userId
                ORDER BY c.IsFamilyHead DESC, c.CustomerName ASC
            `, { famId: customer.FamilyID, userId });
            familyMembers = famRes.recordset;
        }

        // C. Khatabook Ledger Entries (Chronologically ordered with Running Balance)
        const khataRes = await query(`
            SELECT k.*, 
                   i.InvoiceNumber, i.TotalAmount as InvoiceTotal,
                   a.AccountName
            FROM KhataEntries k
            LEFT JOIN Invoices i ON k.InvoiceID = i.InvoiceID
            LEFT JOIN Accounts a ON k.AccountID = a.AccountID
            WHERE k.CustomerID = @id AND k.UserID = @userId
            ORDER BY k.EntryDate ASC, ISNULL(k.EntryTime, CAST(k.CreatedAt AS TIME)) ASC, k.KhataID ASC
        `, { id: custId, userId });

        // Running balance
        const hasOpeningEntry = khataRes.recordset.some(r => r.ReferenceNo === 'OPENING-BAL');
        let runningBalance = hasOpeningEntry ? 0 : (customer.OpeningBalance || 0);
        let totalGave = 0;
        let totalGot = 0;

        const khataEntries = khataRes.recordset.map(row => {
            const amt = parseFloat(row.Amount) || 0;
            if (row.EntryType === 'Gave') {
                runningBalance += amt;
                totalGave += amt;
            } else if (row.EntryType === 'Got') {
                runningBalance -= amt;
                totalGot += amt;
            }
            return {
                ...row,
                RunningBalance: parseFloat(runningBalance.toFixed(2))
            };
        });

        // D. BC Kiosk Banking Transactions
        const bcRes = await query(`
            SELECT b.*,
                   a1.AccountName as CashAccountName,
                   a2.AccountName as PortalAccountName
            FROM BCTransactions b
            LEFT JOIN Accounts a1 ON b.CashAccountID = a1.AccountID
            LEFT JOIN Accounts a2 ON b.PortalAccountID = a2.AccountID
            WHERE b.UserID = @userId
              AND (
                b.CustomerID = @id
                OR (@phone IS NOT NULL AND @phone <> '' AND REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(b.CustomerPhone,''),' ',''),'-',''),'+',''),'  ','') LIKE '%' + RIGHT(@phoneDigits, 10) + '%')
                OR (@phone IS NOT NULL AND @phone <> '' AND @custName <> '' AND b.CustomerName = @custName AND ISNULL(b.CustomerPhone,'') <> '' AND REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(b.CustomerPhone,''),' ',''),'-',''),'+',''),'  ','') = REPLACE(REPLACE(REPLACE(REPLACE(@phone,' ',''),'-',''),'+',''),'  ',''))
              )
            ORDER BY b.TransDate DESC, b.TransTime DESC, b.BCID DESC
        `, { id: custId, userId, phone: customer.Phone || null, phoneDigits: (customer.Phone || '').replace(/\D/g, '').slice(-10) || '__________NOMATCH', custName: customer.CustomerName || '' });

        const bcTransactions = bcRes.recordset;
        const successfulBCTxns = bcTransactions.filter(t => t.Status === 'Success');
        const totalBCAmount = successfulBCTxns.reduce((acc, t) => acc + (parseFloat(t.Amount) || 0), 0);
        const totalBCProfit = successfulBCTxns.reduce((acc, t) => acc + (parseFloat(t.CustomerCharge || 0) + parseFloat(t.CommissionEarned || 0)), 0);

        // E. Invoices & Bills
        const invoiceRes = await query(`
            SELECT i.*, 
                   a.AccountName,
                   c.CustomerName, c.Phone as CustomerPhone, c.AadhaarNumber as CustomerAadhaar,
                   (SELECT COUNT(*) FROM InvoiceItems it WHERE it.InvoiceID = i.InvoiceID) AS TotalItemCount
            FROM Invoices i
            LEFT JOIN Accounts a ON i.AccountID = a.AccountID
            LEFT JOIN Customers c ON i.CustomerID = c.CustomerID
            WHERE i.Status != 'Cancelled' AND i.UserID = @userId AND (i.CustomerID = @id OR (@phone IS NOT NULL AND c.Phone = @phone))
            ORDER BY i.InvoiceDate DESC, i.InvoiceID DESC
        `, { id: custId, userId, phone: customer.Phone || null });

        const invoices = invoiceRes.recordset;
        const totalInvoiced = invoices.reduce((acc, inv) => acc + (parseFloat(inv.TotalAmount) || 0), 0);
        const totalInvoicePaid = invoices.reduce((acc, inv) => acc + (parseFloat(inv.PaidAmount) || 0), 0);
        const totalInvoiceDue = invoices.reduce((acc, inv) => acc + (parseFloat(inv.BalanceAmount) || 0), 0);

        // F. CSC Applications for Customer
        const cscAppRes = await query(`
            SELECT a.AppID, a.GlobalSerialNo, a.SNCode, a.ModuleCode, a.CustomerID, a.CustomerName, a.CustomerPhone,
                   a.ServiceType, a.AckNumber, a.PortalName, a.ApplyDate, a.ExpectedDate, a.CreatedAt,
                   a.TotalFee, a.PaidAmount, a.DueAmount, a.Status, a.CertificateDocNo, a.PaymentStatus, a.PaymentMode
            FROM CSCApplications a
            WHERE a.IsActive = 1 AND a.UserID = @userId AND (a.CustomerID = @id OR (@phone IS NOT NULL AND a.CustomerPhone = @phone))
            ORDER BY a.ApplyDate DESC, a.AppID DESC
        `, { id: custId, userId, phone: customer.Phone || null });
        const cscApps = cscAppRes.recordset || [];
        const totalCSCFee = cscApps.reduce((acc, a) => acc + (parseFloat(a.TotalFee) || 0), 0);
        const totalCSCDue = cscApps.reduce((acc, a) => acc + (parseFloat(a.DueAmount) || 0), 0);

        // G. Customer Profile Audit History (Track all updates, changes and diffs)
        const auditRes = await query(`
            SELECT TOP 100
                LogID, Action, Module, TableName, RecordID, Description, EntityName, Amount, OldData, NewData, Details, CreatedAt, UserID
            FROM AuditLogs
            WHERE TableName = 'Customers' AND RecordID = @id
              AND (UserID = @userId OR UserID IS NULL)
            ORDER BY CreatedAt DESC, LogID DESC
        `, { id: custId, userId });
        const auditHistory = auditRes.recordset || [];

        // H. Combined Summary KPI Dossier
        res.json({
            success: true,
            data: {
                customer,
                familyMembers,
                auditHistory,
                khatabook: {
                    entries: khataEntries.reverse(), // latest first for presentation
                    totalEntries: khataEntries.length,
                    totalGave,
                    totalGot,
                    currentBalance: customer.CurrentBalance,
                    balanceType: customer.BalanceType
                },
                bcBanking: {
                    transactions: bcTransactions,
                    totalCount: bcTransactions.length,
                    totalVolume: totalBCAmount,
                    totalProfit: totalBCProfit
                },
                billing: {
                    invoices,
                    totalCount: invoices.length,
                    totalInvoiced,
                    totalPaid: totalInvoicePaid,
                    totalDue: totalInvoiceDue
                },
                cscWork: {
                    applications: cscApps,
                    totalCount: cscApps.length,
                    totalFee: totalCSCFee,
                    totalDue: totalCSCDue
                }
            }
        });
    } catch (err) {
        console.error('Customer 360 error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
