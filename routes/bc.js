const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../database/db');
const { addKhataEntry, syncBCFlowToKhata, processKhataAfterChange } = require('../database/khataEngine');
const { logAudit } = require('../utils/auditLogger');
const { todayLocal, escapeLike, clampInt, monthRange } = require('../utils/helpers');
const { resolveOrCreateCustomer } = require('../database/customerAutoRegister');
const { registerGlobalTransaction, updateGlobalTransaction, deactivateGlobalTransaction } = require('../database/globalTxnRegistry');

// Notes se PortalName (AEPS portal source) nikalna - purana data + fallback ke liye
// User requirement: sirf "Digipay" ya "Digipay Lite" hi portal name use karna hai.
function normalizePortalName(p) {
    if (!p) return null;
    const s = String(p).replace(/^[:\-#\s]+/, '').trim();
    if (!s) return null;
    const str = String(s).trim();
    if (/Lite/i.test(str)) return 'Digipay Lite';
    if (/Technology|Unified/i.test(str)) return 'Digipay Lite';
    if (/Digipay/i.test(str)) return 'Digipay';
    if (/SBI\s*Kiosk/i.test(str)) return 'SBI Kiosk Banking';
    if (/Spice\s*Money/i.test(str)) return 'Spice Money AEPS';
    if (/PayNearby/i.test(str)) return 'PayNearby AEPS';
    // If string is purely numeric or starts with TxnID/TID/RRN, it is NOT a portal name!
    if (/^\d+$/.test(str) || /^(?:TxnID|TID|Auth|RRN|UTR)/i.test(str)) {
        return 'Digipay Lite';
    }
    return str.slice(0, 100);
}
function derivePortalFromNotes(notes, explicitPortal) {
    if (explicitPortal && String(explicitPortal).trim() && String(explicitPortal).trim().toLowerCase() !== 'null') {
        const cleanExp = String(explicitPortal).trim();
        if (!/^\d+$/.test(cleanExp) && !/^(?:TxnID|TID|Auth|RRN|UTR)/i.test(cleanExp)) {
            return normalizePortalName(cleanExp);
        }
    }
    if (!notes) return null;
    const n = String(notes).trim();
    if (!n) return null;
    const m = n.match(/^Portal:\s*(.+?)\s*(?:\||$)/i);
    if (m) {
        const v = m[1].replace(/^[:\-#\s]+/, '').trim();
        if (v && !/^verified edit/i.test(v) && !/^\d+$/.test(v) && !/^(?:TxnID|TID|Auth|RRN|UTR)/i.test(v)) {
            return normalizePortalName(v);
        }
    }
    const first = n.split('|')[0].trim().replace(/^[:\-#\s]+/, '').trim();
    if (first && first.length >= 3 && !/^verified edit/i.test(first) && !/^all customers/i.test(first) && !/^\d+$/.test(first) && !/^(?:TxnID|TID|Auth|RRN|UTR)/i.test(first)) {
        return normalizePortalName(first);
    }
    return null;
}
function displayPortal(row) {
    if (!row) return 'Manual / Dashboard';
    const p = (row.PortalName && String(row.PortalName).trim()) || row.PortalNameDisplay || derivePortalFromNotes(row.Notes);
    if (!p || /^verified edit/i.test(String(p)) || /^all customers/i.test(String(p))) return 'Manual / Dashboard';
    return normalizePortalName(p) || String(p);
}
// GET /api/bc/dashboard - Today & monthly BC stats
router.get('/dashboard', async (req, res) => {
    try {
        const today = todayLocal();
        const userId = req.user?.UserID || 1;
        // Current month range (sargable - MONTH()/YEAR() se index use nahi hota tha)
        const { start: monthStart, end: monthEnd } = monthRange(new Date().getMonth() + 1, new Date().getFullYear());

        // Today's summary by service type
        const todayStats = await query(`
            SELECT 
                ServiceType,
                COUNT(*) as TotalCount,
                ISNULL(SUM(Amount), 0) as TotalAmount,
                ISNULL(SUM(CommissionEarned), 0) as TotalCommission,
                ISNULL(SUM(CustomerCharge), 0) as TotalCharge,
                ISNULL(SUM(NetProfit), 0) as TotalProfit
            FROM BCTransactions
            WHERE TransDate = @today AND Status = 'Success' AND UserID = @userId
            GROUP BY ServiceType
        `, { today, userId });

        // Month summary
        const monthStats = await query(`
            SELECT 
                COUNT(*) as TotalCount,
                ISNULL(SUM(Amount), 0) as TotalVolume,
                ISNULL(SUM(CommissionEarned), 0) as TotalCommission,
                ISNULL(SUM(CustomerCharge), 0) as TotalCharge,
                ISNULL(SUM(NetProfit), 0) as TotalProfit
            FROM BCTransactions
            WHERE TransDate >= @monthStart AND TransDate <= @monthEnd AND Status = 'Success' AND UserID = @userId
        `, { monthStart, monthEnd, userId });

        // Today's cash in & cash out for Galla (BC + ATM Refills + Cash Expenses)
        const cashFlow = await query(`
            SELECT 
                -- Cash Out (Counter se diya gaya physical cash)
                ISNULL(SUM(CASE 
                    WHEN ServiceType = 'Cash Withdrawal' THEN Amount 
                    WHEN ServiceType = 'QR Pay' AND QROperation = 'Cash Given to Customer' THEN Amount
                    ELSE 0 
                END), 0) as TotalCashOut,
                -- Cash In (Counter me jama hua physical cash)
                ISNULL(SUM(CASE 
                    WHEN ServiceType = 'Cash Deposit' THEN Amount 
                    WHEN ServiceType = 'Money Transfer' THEN Amount 
                    WHEN ServiceType = 'QR Pay' AND QROperation = 'Send - Cash Taken from Customer' THEN Amount
                    ELSE 0 
                END), 0) as TotalCashIn,
                -- Customer cash charges
                ISNULL(SUM(ISNULL(CustomerCharge, 0)), 0) as TotalCashCharges,
                -- Total bank commissions
                ISNULL(SUM(ISNULL(CommissionEarned, 0)), 0) as TotalBankCommissions,
                -- ATM / Bank Cash Refills or Outside Cash brought into Galla today
                ISNULL((SELECT SUM(Amount) FROM Transactions WHERE TransDate = @today AND UserID = @userId AND (
                    (TransType = 'Transfer' AND ToAccountID IN (SELECT AccountID FROM Accounts WHERE AccountType = 'Cash' AND UserID = @userId))
                    OR (TransType = 'Income' AND AccountID IN (SELECT AccountID FROM Accounts WHERE AccountType = 'Cash' AND UserID = @userId))
                )), 0) as TotalATMRefill,
                -- Cash expenses paid from Galla today
                ISNULL((SELECT SUM(Amount) FROM Transactions WHERE TransDate = @today AND TransType = 'Expense' AND UserID = @userId AND AccountID IN (SELECT AccountID FROM Accounts WHERE AccountType = 'Cash' AND UserID = @userId)), 0) as TotalCashExpense
            FROM BCTransactions
            WHERE TransDate = @today AND Status = 'Success' AND UserID = @userId
        `, { today, userId });

        // Today's counter session (if saved)
        const session = await query(`
            SELECT TOP 1 * FROM BCCounterSessions WHERE SessionDate = @today AND UserID = @userId
        `, { today, userId });

        // Recent 15 transactions
        const recent = await query(`
            SELECT TOP 15 
                b.*,
                ca.AccountName as CashAccountName,
                pa.AccountName as PortalAccountName
            FROM BCTransactions b
            LEFT JOIN Accounts ca ON b.CashAccountID = ca.AccountID
            LEFT JOIN Accounts pa ON b.PortalAccountID = pa.AccountID
            WHERE b.UserID = @userId
            ORDER BY b.TransDate DESC, b.BCID DESC
        `, { userId });

        // Balances of relevant accounts (Cash, Bank, Digipay, etc.)
        const accounts = await query(`
            SELECT AccountID, AccountName, AccountType, CurrentBalance, Color, Icon
            FROM Accounts
            WHERE IsActive = 1 AND UserID = @userId
        `, { userId });

        res.json({
            success: true,
            data: {
                today: todayStats.recordset,
                month: monthStats.recordset[0] || {},
                cashFlow: cashFlow.recordset[0] || {},
                session: session.recordset[0] || null,
                recent: recent.recordset,
                accounts: accounts.recordset
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/bc & /api/bc/transactions - List with filters
router.get(['/', '/transactions'], async (req, res) => {
    try {
        const { startDate, endDate, serviceType, qrProvider, status, search, limit = 100, offset = 0 } = req.query;
        const userId = req.user?.UserID || 1;
        let whereClause = 'WHERE b.UserID = @userId';
        const params = { userId };

        if (startDate) { whereClause += ' AND b.TransDate >= @startDate'; params.startDate = startDate; }
        if (endDate) { whereClause += ' AND b.TransDate <= @endDate'; params.endDate = endDate; }
        if (serviceType) { whereClause += ' AND b.ServiceType = @serviceType'; params.serviceType = serviceType; }
        if (qrProvider) { whereClause += ' AND b.QRProvider = @qrProvider'; params.qrProvider = qrProvider; }
        if (status) { whereClause += ' AND b.Status = @status'; params.status = status; }
        if (search) {
            const rawSearch = search.trim();
            const numericId = parseInt(rawSearch.replace(/^[#c]/i, '').trim(), 10);
            const likeParam = `%${escapeLike(rawSearch)}%`;
            const cleanDigits = rawSearch.replace(/\D/g, '');
            const digitLike = cleanDigits ? `%${cleanDigits}%` : '';

            params.search = likeParam;
            params.searchRaw = rawSearch;
            params.cleanDigits = cleanDigits;
            params.digitLike = digitLike;

            let aadhaarClause = '';
            if (cleanDigits.length >= 3) {
                aadhaarClause = ` OR REPLACE(REPLACE(ISNULL(b.CustomerAadhaarLast4, ''), ' ', ''), '-', '') LIKE @digitLike OR REPLACE(REPLACE(ISNULL(c.AadhaarNumber, ''), ' ', ''), '-', '') LIKE @digitLike`;
            }

            if (!isNaN(numericId) && numericId > 0) {
                whereClause += ` AND (b.CustomerID = @searchId OR b.SNCode = @searchRaw OR b.ModuleCode = @searchRaw OR b.SNCode LIKE @search ESCAPE '\\' OR b.ModuleCode LIKE @search ESCAPE '\\' OR b.CustomerName LIKE @search ESCAPE '\\' OR b.CustomerPhone LIKE @search ESCAPE '\\' OR b.CustomerAadhaarLast4 LIKE @search ESCAPE '\\' OR b.RRN_UTR LIKE @search ESCAPE '\\' OR b.BankName LIKE @search ESCAPE '\\' OR b.AccountNumber LIKE @search ESCAPE '\\'${aadhaarClause})`;
                params.searchId = numericId;
            } else {
                whereClause += ` AND (b.SNCode = @searchRaw OR b.ModuleCode = @searchRaw OR b.SNCode LIKE @search ESCAPE '\\' OR b.ModuleCode LIKE @search ESCAPE '\\' OR b.CustomerName LIKE @search ESCAPE '\\' OR b.CustomerPhone LIKE @search ESCAPE '\\' OR b.CustomerAadhaarLast4 LIKE @search ESCAPE '\\' OR b.RRN_UTR LIKE @search ESCAPE '\\' OR b.BankName LIKE @search ESCAPE '\\' OR b.AccountNumber LIKE @search ESCAPE '\\'${aadhaarClause})`;
            }
        }

        // Pagination clamp - parseInt('abc') = NaN se SQL error aata tha,
        // aur limit unbounded abuse bhi kar sakta tha
        const safeLimit = clampInt(limit, 1, 500, 100);
        const safeOffset = clampInt(offset, 0, 1000000, 0);

        const countResult = await query(`
            SELECT COUNT(*) as total 
            FROM BCTransactions b 
            LEFT JOIN Customers c ON b.CustomerID = c.CustomerID 
            ${whereClause}
        `, params);

        const result = await query(`
            SELECT
                b.BCID, b.GlobalSerialNo, b.SNCode, b.ModuleCode, b.TransDate, b.TransTime, b.ServiceType, b.CustomerName, b.CustomerPhone,
                b.CustomerAadhaarLast4, b.BankName, b.AccountNumber, b.IFSC, b.BeneficiaryName,
                b.Amount, b.CommissionEarned, b.CustomerCharge, b.NetProfit,
                b.CashAccountID, b.PortalAccountID, b.PortalName, b.QRProvider, b.QROperation, b.RRN_UTR,
                b.Status, b.Notes, b.CreatedAt, b.UpdatedAt, b.Metadata, b.CustomerID, b.DateOfBirth,
                -- Portal fallback: PortalName khali ho to Notes se pehla segment (purana data)
                CASE WHEN b.PortalName IS NULL OR LTRIM(RTRIM(b.PortalName)) = '' THEN NULLIF(LTRIM(RTRIM(SUBSTRING(b.Notes, 1, CHARINDEX('|', b.Notes + '|') - 1))), '') ELSE b.PortalName END AS PortalNameDisplay,
                -- A/C Balance: direct column or from Metadata JSON (auto-detected from AEPS receipt)
                ISNULL(b.AccountBalance, CASE 
                    WHEN b.Metadata IS NOT NULL 
                    THEN TRY_CAST(JSON_VALUE(b.Metadata, '$.accountBalance') AS DECIMAL(18,2))
                    ELSE NULL 
                END) as AccountBalance,
                ca.AccountName as CashAccountName,
                pa.AccountName as PortalAccountName,
                c.CustomerName as LinkedCustomerName,
                c.AadhaarNumber as LinkedCustomerAadhaar,
                c.CurrentBalance as LinkedCustomerBalance
            FROM BCTransactions b
            LEFT JOIN Accounts ca ON b.CashAccountID = ca.AccountID
            LEFT JOIN Accounts pa ON b.PortalAccountID = pa.AccountID
            LEFT JOIN Customers c ON b.CustomerID = c.CustomerID
            ${whereClause}
            ORDER BY b.TransDate DESC, ISNULL(b.TransTime, '00:00:00') DESC, b.BCID DESC
            OFFSET ${safeOffset} ROWS FETCH NEXT ${safeLimit} ROWS ONLY
        `, params);

        result.recordset.forEach(r => { if (!r.PortalName || !String(r.PortalName).trim()) r.PortalName = r.PortalNameDisplay || derivePortalFromNotes(r.Notes) || null; });

        res.json({
            success: true,
            data: result.recordset,
            total: countResult.recordset[0].total,
            limit: safeLimit,
            offset: safeOffset
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/bc/:id - Fetch single BC transaction by ID
router.get('/:id', async (req, res, next) => {
    try {
        const bcId = parseInt(req.params.id, 10);
        if (isNaN(bcId)) return next();
        const userId = req.user?.UserID || 1;

        const result = await query(`
            SELECT
                b.BCID, b.GlobalSerialNo, b.SNCode, b.ModuleCode, b.TransDate, b.TransTime, b.ServiceType, b.CustomerName, b.CustomerPhone,
                b.CustomerAadhaarLast4, b.BankName, b.AccountNumber, b.IFSC, b.BeneficiaryName,
                b.Amount, b.CommissionEarned, b.CustomerCharge, b.NetProfit,
                b.CashAccountID, b.PortalAccountID, b.PortalName, b.QRProvider, b.QROperation, b.RRN_UTR,
                b.Status, b.Notes, b.CreatedAt, b.UpdatedAt, b.Metadata, b.CustomerID, b.DateOfBirth,
                CASE WHEN b.PortalName IS NULL OR LTRIM(RTRIM(b.PortalName)) = '' THEN NULLIF(LTRIM(RTRIM(SUBSTRING(b.Notes, 1, CHARINDEX('|', b.Notes + '|') - 1))), '') ELSE b.PortalName END AS PortalNameDisplay,
                ISNULL(b.AccountBalance, CASE 
                    WHEN b.Metadata IS NOT NULL 
                    THEN TRY_CAST(JSON_VALUE(b.Metadata, '$.accountBalance') AS DECIMAL(18,2))
                    ELSE NULL 
                END) as AccountBalance,
                ca.AccountName as CashAccountName,
                pa.AccountName as PortalAccountName,
                c.CustomerName as LinkedCustomerName,
                c.AadhaarNumber as LinkedCustomerAadhaar,
                c.CurrentBalance as LinkedCustomerBalance
            FROM BCTransactions b
            LEFT JOIN Accounts ca ON b.CashAccountID = ca.AccountID
            LEFT JOIN Accounts pa ON b.PortalAccountID = pa.AccountID
            LEFT JOIN Customers c ON b.CustomerID = c.CustomerID
            WHERE b.BCID = @bcId AND b.UserID = @userId
        `, { bcId, userId });

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'BC transaction nahi mili' });
        }

        const rec = result.recordset[0];
        if (!rec.PortalName || !String(rec.PortalName).trim()) rec.PortalName = rec.PortalNameDisplay || derivePortalFromNotes(rec.Notes) || null;
        res.json({ success: true, data: rec });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/bc/session/today - Get today's counter cash reconciliation
router.get('/session/today', async (req, res) => {
    try {
        const today = todayLocal();
        const userId = req.user?.UserID || 1;
        let session = await query('SELECT TOP 1 * FROM BCCounterSessions WHERE SessionDate = @today AND UserID = @userId', { today, userId });

        if (session.recordset.length === 0) {
            const prevSession = await query('SELECT TOP 1 ISNULL(ActualClosingCash, ExpectedClosingCash) as PrevClosing FROM BCCounterSessions WHERE SessionDate < @today AND UserID = @userId ORDER BY SessionDate DESC', { today, userId });

            let opening = 0;
            if (prevSession.recordset.length > 0 && prevSession.recordset[0].PrevClosing != null) {
                opening = parseFloat(prevSession.recordset[0].PrevClosing) || 0;
            } else {
                const cashAcc = await query("SELECT TOP 1 CurrentBalance FROM Accounts WHERE AccountType = 'Cash' AND IsActive = 1 AND UserID = @userId ORDER BY AccountID ASC", { userId });
                const currentCash = parseFloat(cashAcc.recordset[0]?.CurrentBalance) || 0;

                const cf = await query(`
                    SELECT 
                        ISNULL(SUM(CASE WHEN ServiceType = 'Cash Deposit' THEN Amount WHEN ServiceType = 'Money Transfer' THEN Amount WHEN ServiceType = 'QR Pay' AND QROperation = 'Send - Cash Taken from Customer' THEN Amount ELSE 0 END), 0) +
                        ISNULL(SUM(ISNULL(CustomerCharge, 0)), 0) +
                        ISNULL((SELECT SUM(Amount) FROM Transactions WHERE TransDate = @today AND UserID = @userId AND (
                            (TransType = 'Transfer' AND ToAccountID IN (SELECT AccountID FROM Accounts WHERE AccountType = 'Cash' AND UserID = @userId))
                            OR (TransType = 'Income' AND AccountID IN (SELECT AccountID FROM Accounts WHERE AccountType = 'Cash' AND UserID = @userId))
                        )), 0) as CashIn,
                        ISNULL(SUM(CASE WHEN ServiceType = 'Cash Withdrawal' THEN Amount WHEN ServiceType = 'QR Pay' AND QROperation = 'Cash Given to Customer' THEN Amount ELSE 0 END), 0) +
                        ISNULL((SELECT SUM(Amount) FROM Transactions WHERE TransDate = @today AND TransType = 'Expense' AND UserID = @userId AND AccountID IN (SELECT AccountID FROM Accounts WHERE AccountType = 'Cash' AND UserID = @userId)), 0) as CashOut
                    FROM BCTransactions
                    WHERE TransDate = @today AND Status = 'Success' AND UserID = @userId
                `, { today, userId });

                const netToday = (parseFloat(cf.recordset[0]?.CashIn) || 0) - (parseFloat(cf.recordset[0]?.CashOut) || 0);
                opening = Math.max(0, currentCash - netToday);
            }

            await query(`
                INSERT INTO BCCounterSessions (SessionDate, OpeningCash, ExpectedClosingCash, UserID)
                VALUES (@today, @opening, @opening, @userId)
            `, { today, opening, userId });

            session = await query('SELECT TOP 1 * FROM BCCounterSessions WHERE SessionDate = @today AND UserID = @userId', { today, userId });
        }

        res.json({ success: true, data: session.recordset[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/bc/session - Save counter cash denominations
router.post('/session', async (req, res) => {
    try {
        const { SessionDate, OpeningCash, Note500, Note200, Note100, Note50, Note20, Note10, Coins, ExpectedClosingCash, Notes } = req.body;
        const date = SessionDate || todayLocal();
        const userId = req.user?.UserID || 1;

        const n500 = parseInt(Note500) || 0;
        const n200 = parseInt(Note200) || 0;
        const n100 = parseInt(Note100) || 0;
        const n50 = parseInt(Note50) || 0;
        const n20 = parseInt(Note20) || 0;
        const n10 = parseInt(Note10) || 0;
        const c = parseFloat(Coins) || 0;

        const actualClosing = (n500 * 500) + (n200 * 200) + (n100 * 100) + (n50 * 50) + (n20 * 20) + (n10 * 10) + c;
        const expected = parseFloat(ExpectedClosingCash) || 0;
        const diff = actualClosing - expected;

        const sessionStatus = (actualClosing > 0 || n500 > 0 || n200 > 0 || n100 > 0 || n50 > 0 || n20 > 0 || n10 > 0 || c > 0) ? 'Closed' : 'Open';

        await query(`
            IF EXISTS (SELECT 1 FROM BCCounterSessions WHERE SessionDate = @date AND UserID = @userId)
            BEGIN
                UPDATE BCCounterSessions SET
                    OpeningCash = @opening,
                    Note500 = @n500, Note200 = @n200, Note100 = @n100, Note50 = @n50,
                    Note20 = @n20, Note10 = @n10, Coins = @c,
                    ActualClosingCash = @actualClosing,
                    ExpectedClosingCash = @expected,
                    CashDifference = @diff,
                    Status = @status,
                    Notes = @notes,
                    UpdatedAt = GETDATE()
                WHERE SessionDate = @date AND UserID = @userId
            END
            ELSE
            BEGIN
                INSERT INTO BCCounterSessions 
                    (SessionDate, OpeningCash, Note500, Note200, Note100, Note50, Note20, Note10, Coins, ActualClosingCash, ExpectedClosingCash, CashDifference, Status, Notes, UserID)
                VALUES 
                    (@date, @opening, @n500, @n200, @n100, @n50, @n20, @n10, @c, @actualClosing, @expected, @diff, @status, @notes, @userId)
            END
        `, {
            date,
            opening: parseFloat(OpeningCash) || 0,
            n500, n200, n100, n50, n20, n10, c,
            actualClosing, expected, diff,
            status: sessionStatus,
            notes: Notes || null,
            userId
        });

        res.json({ success: true, message: 'Galla hisaab save ho gaya!', actualClosing, diff, status: sessionStatus });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/bc & /api/bc/transactions - Create new BC Transaction
router.post(['/', '/transactions'], async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const {
            ServiceType, CustomerID, CustomerName, CustomerPhone, CustomerAadhaarLast4,
            BankName, AccountNumber, IFSC, BeneficiaryName,
            Amount, CommissionEarned = 0, CustomerCharge,
            CashAccountID, PortalAccountID, PortalName,
            QRProvider, QROperation, RRN_UTR, Status = 'Success', Notes,
            TransDate, TransTime, ChargeOnKhata = false,
            AccountBalance, DateOfBirth, CustomerDateOfBirth
        } = req.body;

        if (!ServiceType) return res.status(400).json({ success: false, error: 'Service Type zaroori hai' });
        if (!CustomerName) return res.status(400).json({ success: false, error: 'Customer Name zaroori hai' });
        const isNonCashService = /balance\s*enquiry|mini\s*statement/i.test(ServiceType);
        const parsedAmt = parseFloat(Amount);
        if (!isNonCashService && (!Number.isFinite(parsedAmt) || parsedAmt <= 0)) {
            return res.status(400).json({ success: false, error: 'Valid Amount daalein' });
        }

        const dob = DateOfBirth || CustomerDateOfBirth || null;
        const portalName = derivePortalFromNotes(Notes, PortalName);

        if (CashAccountID) {
            const accChk = await query('SELECT AccountID FROM Accounts WHERE AccountID = @id AND UserID = @userId AND IsActive = 1', { id: parseInt(CashAccountID), userId });
            if (!accChk.recordset.length) return res.status(400).json({ success: false, error: 'Chuna hua Cash Account valid nahi hai' });
        }
        if (PortalAccountID) {
            const accChk = await query('SELECT AccountID FROM Accounts WHERE AccountID = @id AND UserID = @userId AND IsActive = 1', { id: parseInt(PortalAccountID), userId });
            if (!accChk.recordset.length) return res.status(400).json({ success: false, error: 'Chuna hua Portal Account valid nahi hai' });
        }

        // Auto-Register or Resolve Customer in Customers table
        const customerResolution = await resolveOrCreateCustomer({
            customerId: CustomerID ? parseInt(CustomerID) : null,
            customerName: CustomerName,
            customerPhone: CustomerPhone,
            customerAadhaar: CustomerAadhaarLast4,
            dob: dob,
            source: `BC Counter (${ServiceType})`,
            skipFamilyLink: !!(req.body.SkipFamilyLink || req.body.skipFamilyLink),
            userId
        });
        const resolvedCustId = customerResolution.customerId;

        const comm = parseFloat(CommissionEarned) || 0;
        const isEligibleCharge = /withdrawal|deposit|transfer|dmt|remittance|aadhaar\s*pay/i.test(ServiceType);
        const charge = (CustomerCharge !== undefined && CustomerCharge !== null && CustomerCharge !== '')
            ? (parseFloat(CustomerCharge) || 0)
            : ((isEligibleCharge && parsedAmt > 0) ? Math.ceil(parsedAmt / 1000) * 10 : 0);
        const profit = comm + charge;

        const result = await withTransaction(async (tQuery) => {
            const insertRes = await tQuery(`
                INSERT INTO BCTransactions (
                    CustomerID, ServiceType, CustomerName, CustomerPhone, CustomerAadhaarLast4, DateOfBirth,
                    BankName, AccountNumber, IFSC, BeneficiaryName,
                    Amount, CommissionEarned, CustomerCharge, NetProfit,
                    CashAccountID, PortalAccountID, PortalName,
                    QRProvider, QROperation, RRN_UTR, Status, Notes,
                    TransDate, TransTime, AccountBalance, Metadata, UserID
                )
                OUTPUT INSERTED.*
                VALUES (
                    @custId, @serviceType, @custName, @custPhone, @aadhaar, @dob,
                    @bank, @accNo, @ifsc, @beneficiary,
                    @amount, @comm, @charge, @profit,
                    @cashAcc, @portalAcc, @portalName,
                    @qrProvider, @qrOp, @rrn, @status, @notes,
                    @date, @time, @accountBalance, @metadata, @userId
                )
            `, {
                custId: resolvedCustId,
                serviceType: ServiceType,
                custName: CustomerName,
                custPhone: CustomerPhone || null,
                aadhaar: CustomerAadhaarLast4 || null,
                dob: dob || null,
                bank: BankName ? String(BankName).replace(/^[\s:\-–—#=]+/, '').trim() : null,
                accNo: AccountNumber || null,
                ifsc: IFSC || null,
                beneficiary: BeneficiaryName || null,
                amount: isNonCashService ? (parseFloat(Amount) || 0) : parseFloat(Amount),
                comm, charge, profit,
                cashAcc: CashAccountID ? parseInt(CashAccountID) : null,
                portalAcc: PortalAccountID ? parseInt(PortalAccountID) : null,
                portalName: portalName,
                qrProvider: QRProvider || null,
                qrOp: QROperation || 'Cash Given to Customer',
                rrn: RRN_UTR ? String(RRN_UTR).replace(/^[\s:\-–—#=]+/, '').trim() : null,
                status: Status || 'Success',
                notes: Notes ? String(Notes).replace(/TxnID:\s*[:\s]+/gi, 'TxnID: ').trim() : null,
                date: TransDate || todayLocal(),
                time: TransTime || new Date().toLocaleTimeString('en-GB'),
                accountBalance: (AccountBalance != null && AccountBalance !== '' && !isNaN(parseFloat(AccountBalance)))
                    ? parseFloat(AccountBalance)
                    : null,
                metadata: (AccountBalance != null && AccountBalance !== '' && !isNaN(parseFloat(AccountBalance)))
                    ? JSON.stringify({ accountBalance: parseFloat(AccountBalance) })
                    : null,
                userId
            });

            // Update balances for cash and portal accounts
            if (CashAccountID) {
                await tQuery('EXEC sp_UpdateAccountBalance @id', { id: parseInt(CashAccountID) });
            }
            if (PortalAccountID) {
                await tQuery('EXEC sp_UpdateAccountBalance @id', { id: parseInt(PortalAccountID) });
            }

            // === KHATA: BC transaction ko customer ke Khatabook me darj karo ===
            let bcKhataSettled = [];
            if (resolvedCustId) {
                // 1. CASH-FLOW REGISTER (2 balance-neutral lines): "paisa aaya -> cash diya"
                //    Ye udhaar balance ko chhoote nahi, sirf poori detail/audit ke liye.
                await syncBCFlowToKhata(tQuery, {
                    CustomerID: resolvedCustId,
                    BCID: insertRes.recordset[0].BCID,
                    ServiceType,
                    QROperation,
                    Amount: isNonCashService ? (parseFloat(Amount) || 0) : parseFloat(Amount),
                    EntryDate: TransDate || todayLocal(),
                    BankName,
                    RRN_UTR
                });

                // 2. CustomerCharge (hamara shulk) SIRF tab udhaar Khata me jaayega jab
                //    user ne "Shulk abhi na liya - Khata/Udhaar me daalein" tick kiya ho.
                //    (Turant cash liya to woh already cash register mein hai, yahan nahi.)
                if (ChargeOnKhata && charge > 0) {
                    await addKhataEntry(tQuery, {
                        CustomerID: resolvedCustId,
                        EntryType: 'Gave',
                        Amount: charge,
                        EntryDate: TransDate || todayLocal(),
                        BCID: insertRes.recordset[0].BCID,
                        PaymentMode: 'Udhar',
                        Description: `BC Shulk (${ServiceType})`,
                        ReferenceNo: `BC-${insertRes.recordset[0].BCID}`,
                        UserID: userId
                    });
                }

                // 3. Balance refresh + advance se pending dues auto-settle
                const settleRes = await processKhataAfterChange(tQuery, resolvedCustId);
                bcKhataSettled = settleRes.settled || [];
            }

            const insertedBC = insertRes.recordset[0];

            await logAudit({
                action: 'CREATE',
                module: 'BC Banking',
                tableName: 'BCTransactions',
                recordId: insertedBC.BCID,
                entityName: CustomerName,
                amount: isNonCashService ? (parseFloat(Amount) || 0) : parseFloat(Amount),
                description: `BC Banking: ${ServiceType} �${parseFloat(Amount).toLocaleString('en-IN')} (${CustomerName})`,
                newData: insertedBC,
                details: `Service: ${ServiceType}, Amount: �${Amount}, Comm: �${CommissionEarned}, Charge: �${CustomerCharge}, Customer: ${CustomerName}, RRN: ${RRN_UTR || 'N/A'}, Status: ${Status}, A/C Balance: �${AccountBalance || 'N/A'}`,
                tQuery
            });

            // Universal Global Transaction Registry (Rule 4 Atomic Registration)
            const regInfo = await registerGlobalTransaction({
                sourceModule: 'BC',
                recordId: insertedBC.BCID,
                entityName: CustomerName,
                amount: isNonCashService ? (parseFloat(Amount) || 0) : parseFloat(Amount),
                transDate: TransDate || todayLocal(),
                createdAt: new Date(),
                userId
            }, tQuery);

            insertedBC.GlobalSerialNo = regInfo.globalSerialNo;
            insertedBC.SNCode = regInfo.snCode;
            insertedBC.ModuleCode = regInfo.moduleCode;

            // Sync Universal SN to mirror KhataEntries (BC-Flow) created for this transaction
            await tQuery(`
                UPDATE KhataEntries
                SET GlobalSerialNo = @GlobalSerialNo, SNCode = @SNCode, ModuleCode = @ModuleCode
                WHERE BCID = @bcId AND (GlobalSerialNo IS NULL OR GlobalSerialNo = 0)
            `, {
                GlobalSerialNo: regInfo.globalSerialNo,
                SNCode: regInfo.snCode,
                ModuleCode: regInfo.moduleCode,
                bcId: insertedBC.BCID
            });

            return { bc: insertedBC, khataSettled: bcKhataSettled };
        });

        res.json({
            success: true,
            data: result.bc,
            customerId: resolvedCustId,
            autoRegisteredCustomer: customerResolution.isNew ? customerResolution.customer : null,
            khataSettled: result.khataSettled
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/bc/:id - Edit existing BC Transaction
router.put('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ success: false, error: 'BC ID galat hai' });
        const userId = req.user?.UserID || 1;

        const {
            ServiceType, CustomerID, CustomerName, CustomerPhone, CustomerAadhaarLast4,
            BankName, AccountNumber, IFSC, BeneficiaryName,
            Amount, CommissionEarned = 0, CustomerCharge,
            CashAccountID, PortalAccountID, PortalName,
            QRProvider, QROperation, RRN_UTR, Status, Notes,
            TransDate, TransTime, ChargeOnKhata = false,
            AccountBalance, DateOfBirth, CustomerDateOfBirth
        } = req.body;

        if (!ServiceType) return res.status(400).json({ success: false, error: 'Service Type zaroori hai' });
        if (!CustomerName) return res.status(400).json({ success: false, error: 'Customer Name zaroori hai' });
        const isNonCashService = /balance\s*enquiry|mini\s*statement/i.test(ServiceType);
        const parsedAmt = parseFloat(Amount);
        if (!isNonCashService && (!Number.isFinite(parsedAmt) || parsedAmt <= 0)) {
            return res.status(400).json({ success: false, error: 'Valid Amount daalein' });
        }

        const dob = DateOfBirth || CustomerDateOfBirth || null;
        const portalName = derivePortalFromNotes(Notes, PortalName);

        if (CashAccountID) {
            const accChk = await query('SELECT AccountID FROM Accounts WHERE AccountID = @id AND UserID = @userId AND IsActive = 1', { id: parseInt(CashAccountID), userId });
            if (!accChk.recordset.length) return res.status(400).json({ success: false, error: 'Chuna hua Cash Account valid nahi hai' });
        }
        if (PortalAccountID) {
            const accChk = await query('SELECT AccountID FROM Accounts WHERE AccountID = @id AND UserID = @userId AND IsActive = 1', { id: parseInt(PortalAccountID), userId });
            if (!accChk.recordset.length) return res.status(400).json({ success: false, error: 'Chuna hua Portal Account valid nahi hai' });
        }

        // Auto-Register or Resolve Customer in Customers table
        const customerResolution = await resolveOrCreateCustomer({
            customerId: CustomerID ? parseInt(CustomerID) : null,
            customerName: CustomerName,
            customerPhone: CustomerPhone,
            customerAadhaar: CustomerAadhaarLast4,
            dob: dob,
            source: `BC Counter (${ServiceType})`,
            skipFamilyLink: !!(req.body.SkipFamilyLink || req.body.skipFamilyLink),
            userId
        });
        const resolvedCustId = customerResolution.customerId;

        const comm = parseFloat(CommissionEarned) || 0;
        const isEligibleCharge = /withdrawal|deposit|transfer|dmt|remittance|aadhaar\s*pay/i.test(ServiceType);
        const charge = (CustomerCharge !== undefined && CustomerCharge !== null && CustomerCharge !== '')
            ? (parseFloat(CustomerCharge) || 0)
            : ((isEligibleCharge && parsedAmt > 0) ? Math.ceil(parsedAmt / 1000) * 10 : 0);
        const profit = comm + charge;

        const result = await withTransaction(async (tQuery) => {
            const oldRes = await tQuery('SELECT * FROM BCTransactions WHERE BCID = @id AND UserID = @userId', { id, userId });
            if (oldRes.recordset.length === 0) {
                throw new Error('BC Transaction nahi mila');
            }
            const oldRecord = oldRes.recordset[0];

            const updateRes = await tQuery(`
                UPDATE BCTransactions SET
                    CustomerID = @custId,
                    ServiceType = @serviceType,
                    CustomerName = @custName,
                    CustomerPhone = @custPhone,
                    CustomerAadhaarLast4 = @aadhaar,
                    DateOfBirth = @dob,
                    BankName = @bank,
                    AccountNumber = @accNo,
                    IFSC = @ifsc,
                    BeneficiaryName = @beneficiary,
                    Amount = @amount,
                    CommissionEarned = @comm,
                    CustomerCharge = @charge,
                    NetProfit = @profit,
                    CashAccountID = @cashAcc,
                    PortalAccountID = @portalAcc,
                    PortalName = @portalName,
                    QRProvider = @qrProvider,
                    QROperation = @qrOp,
                    RRN_UTR = @rrn,
                    Status = @status,
                    Notes = @notes,
                    TransDate = @date,
                    TransTime = @time,
                    AccountBalance = @accountBalance,
                    Metadata = @metadata,
                    UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE BCID = @id AND UserID = @userId
            `, {
                id,
                custId: resolvedCustId,
                serviceType: ServiceType,
                custName: CustomerName,
                custPhone: CustomerPhone || null,
                aadhaar: CustomerAadhaarLast4 || null,
                dob: dob || null,
                bank: BankName ? String(BankName).replace(/^[\s:\-–—#=]+/, '').trim() : null,
                accNo: AccountNumber || null,
                ifsc: IFSC || null,
                beneficiary: BeneficiaryName || null,
                amount: isNonCashService ? (parseFloat(Amount) || 0) : parseFloat(Amount),
                comm, charge, profit,
                cashAcc: CashAccountID ? parseInt(CashAccountID) : null,
                portalAcc: PortalAccountID ? parseInt(PortalAccountID) : null,
                portalName: portalName,
                qrProvider: QRProvider || null,
                qrOp: QROperation || 'Cash Given to Customer',
                rrn: RRN_UTR ? String(RRN_UTR).replace(/^[\s:\-–—#=]+/, '').trim() : null,
                notes: Notes ? String(Notes).replace(/TxnID:\s*[:\s]+/gi, 'TxnID: ').trim() : null,
                date: TransDate || oldRecord.TransDate,
                time: TransTime || oldRecord.TransTime,
                status: Status || oldRecord.Status,
                accountBalance: (AccountBalance != null && AccountBalance !== '' && !isNaN(parseFloat(AccountBalance)))
                    ? parseFloat(AccountBalance)
                    : null,
                metadata: (AccountBalance != null && AccountBalance !== '' && !isNaN(parseFloat(AccountBalance)))
                    ? JSON.stringify({ accountBalance: parseFloat(AccountBalance) })
                    : null,
                userId
            });

            // Update balances for both old and new accounts
            const affectedAccounts = new Set([
                oldRecord.CashAccountID,
                oldRecord.PortalAccountID,
                CashAccountID ? parseInt(CashAccountID) : null,
                PortalAccountID ? parseInt(PortalAccountID) : null
            ].filter(Boolean));

            for (const accId of affectedAccounts) {
                await tQuery('EXEC sp_UpdateAccountBalance @id', { id: accId });
            }

            // Clean up old khata entries for this BC transaction and re-sync
            const oldCustId = oldRecord.CustomerID;
            await tQuery(`
                UPDATE UniversalTxnRegistry
                SET IsActive = 0
                WHERE SourceModule = 'Khata'
                  AND RecordID IN (SELECT KhataID FROM KhataEntries WHERE BCID = @bcId)
            `, { bcId: id });
            await tQuery('DELETE FROM KhataEntries WHERE BCID = @bcId', { bcId: id });

            let bcKhataSettled = [];
            if (resolvedCustId) {
                await syncBCFlowToKhata(tQuery, {
                    CustomerID: resolvedCustId,
                    BCID: id,
                    ServiceType,
                    QROperation,
                    Amount: isNonCashService ? (parseFloat(Amount) || 0) : parseFloat(Amount),
                    EntryDate: TransDate || oldRecord.TransDate,
                    BankName,
                    RRN_UTR
                });

                if (ChargeOnKhata && charge > 0) {
                    await addKhataEntry(tQuery, {
                        CustomerID: resolvedCustId,
                        EntryType: 'Gave',
                        Amount: charge,
                        EntryDate: TransDate || oldRecord.TransDate,
                        BCID: id,
                        PaymentMode: 'Udhar',
                        Description: `BC Shulk (${ServiceType})`,
                        ReferenceNo: `BC-${id}`,
                        UserID: userId
                    });
                }

                const settleRes = await processKhataAfterChange(tQuery, resolvedCustId);
                bcKhataSettled = settleRes.settled || [];
            }

            if (oldCustId && oldCustId !== resolvedCustId) {
                await processKhataAfterChange(tQuery, oldCustId);
            }

            const updatedBC = updateRes.recordset[0];

            await logAudit({
                action: 'UPDATE',
                module: 'BC Banking',
                tableName: 'BCTransactions',
                recordId: id,
                entityName: CustomerName,
                amount: isNonCashService ? (parseFloat(Amount) || 0) : parseFloat(Amount),
                description: `BC Transaction Update: ${ServiceType} �${parseFloat(Amount).toLocaleString('en-IN')} (${CustomerName})`,
                oldData: oldRecord,
                newData: updatedBC,
                details: `BC ID #${id} update kiya gaya. Amount: �${Amount}, Comm: �${comm}, Charge: �${charge}, Customer: ${CustomerName}, RRN: ${RRN_UTR || 'N/A'}`,
                tQuery
            });

            // Update Universal Global Transaction Registry
            try {
                await updateGlobalTransaction({
                    sourceModule: 'BC',
                    recordId: id,
                    entityName: CustomerName,
                    amount: isNonCashService ? (parseFloat(Amount) || 0) : parseFloat(Amount),
                    transDate: TransDate || todayLocal()
                }, tQuery);

                if (updatedBC?.GlobalSerialNo) {
                    await tQuery(`
                        UPDATE KhataEntries
                        SET GlobalSerialNo = @GlobalSerialNo, SNCode = @SNCode, ModuleCode = @ModuleCode
                        WHERE BCID = @bcId AND (GlobalSerialNo IS NULL OR GlobalSerialNo = 0)
                    `, {
                        GlobalSerialNo: updatedBC.GlobalSerialNo,
                        SNCode: updatedBC.SNCode,
                        ModuleCode: updatedBC.ModuleCode,
                        bcId: id
                    });
                }
            } catch (regErr) {
                console.error('Failed to update global transaction for BC:', regErr);
                throw new Error('Failed to update global transaction for BC: ' + regErr.message);
            }

            return { bc: updatedBC, khataSettled: bcKhataSettled };
        });

        res.json({
            success: true,
            data: result.bc,
            customerId: resolvedCustId,
            autoRegisteredCustomer: customerResolution.isNew ? customerResolution.customer : null,
            khataSettled: result.khataSettled
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/bc/:id - Delete BC transaction
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        await withTransaction(async (tQuery) => {
            const trans = await tQuery('SELECT * FROM BCTransactions WHERE BCID = @id AND UserID = @userId', { id: parseInt(req.params.id), userId });
            if (trans.recordset.length === 0) {
                throw new Error('Transaction nahi mila');
            }

            const row = trans.recordset[0];
            await tQuery('DELETE FROM BCTransactions WHERE BCID = @id AND UserID = @userId', { id: parseInt(req.params.id), userId });

            if (row.CashAccountID) {
                await tQuery('EXEC sp_UpdateAccountBalance @id', { id: row.CashAccountID });
            }
            if (row.PortalAccountID) {
                await tQuery('EXEC sp_UpdateAccountBalance @id', { id: row.PortalAccountID });
            }

            // === KHATA CLEANUP: is BC se linked charge entries hatao ===
            if (row.CustomerID) {
                await tQuery(`
                    UPDATE UniversalTxnRegistry
                    SET IsActive = 0
                    WHERE SourceModule = 'Khata'
                      AND RecordID IN (SELECT KhataID FROM KhataEntries WHERE BCID = @bcId)
                `, { bcId: parseInt(req.params.id) });
                await tQuery('DELETE FROM KhataEntries WHERE BCID = @bcId', { bcId: parseInt(req.params.id) });
                await tQuery('EXEC sp_UpdateCustomerBalance @id', { id: row.CustomerID });
            }

            await logAudit({
                action: 'DELETE',
                module: 'BC Banking',
                tableName: 'BCTransactions',
                recordId: parseInt(req.params.id),
                entityName: row.CustomerName,
                amount: parseFloat(row.Amount) || 0,
                description: `BC Transaction Delete: ${row.ServiceType} �${parseFloat(row.Amount || 0).toLocaleString('en-IN')} (${row.CustomerName})`,
                oldData: row,
                details: `BC ID #${row.BCID}, Service: ${row.ServiceType}, Amount: �${row.Amount}, Date: ${row.TransDate}, RRN: ${row.RRN_UTR || 'N/A'} delete kiya gaya.`,
                tQuery
            });

            try {
                await deactivateGlobalTransaction('BC', parseInt(req.params.id), tQuery);
            } catch (regErr) {
                console.error('Failed to deactivate global transaction for BC:', regErr);
                throw new Error('Failed to deactivate global transaction for BC: ' + regErr.message);
            }
        });

        res.json({ success: true, message: 'BC Transaction delete ho gaya' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


// ============================================================
// SETTLEMENTS & PAYOUTS (Digipay, Digipay Lite, Bank, Cash)
// ============================================================

// GET /api/bc/settlements - List all settlement transfers
router.get('/settlements', async (req, res) => {
    try {
        const { limit = 50, offset = 0, type } = req.query;
        const userId = req.user?.UserID || 1;
        let whereClause = "WHERE t.UserID = @userId AND t.TransType = 'Transfer' AND (t.Tags LIKE '%BC Settlement%' OR t.Tags LIKE '%Payout%' OR t.Tags LIKE '%ATM Refill%' OR t.Tags LIKE '%Topup%')";
        const params = { userId };

        if (type) {
            whereClause += " AND t.Description LIKE @type ESCAPE '\\'";
            params.type = `%${escapeLike(type)}%`;
        }

        const safeLimit = clampInt(limit, 1, 500, 50);
        const safeOffset = clampInt(offset, 0, 1000000, 0);

        const countResult = await query(`SELECT COUNT(*) as total FROM Transactions t ${whereClause}`, params);

        const result = await query(`
            SELECT
                t.*,
                fa.AccountName as FromAccountName,
                fa.AccountType as FromAccountType,
                ta.AccountName as ToAccountName,
                ta.AccountType as ToAccountType
            FROM Transactions t
            LEFT JOIN Accounts fa ON t.AccountID = fa.AccountID
            LEFT JOIN Accounts ta ON t.ToAccountID = ta.AccountID
            ${whereClause}
            ORDER BY t.TransDate DESC, t.TransactionID DESC
            OFFSET ${safeOffset} ROWS FETCH NEXT ${safeLimit} ROWS ONLY
        `, params);

        res.json({
            success: true,
            data: result.recordset,
            total: countResult.recordset[0].total,
            limit: safeLimit,
            offset: safeOffset
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/bc/settlement - Record Payout to Bank, ATM Refill, or Wallet Topup
router.post('/settlement', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const {
            TransferType,     // 'Payout to Bank', 'ATM Cash Refill', 'Wallet Top-Up', 'Wallet to Wallet'
            FromAccountID,    // Source
            ToAccountID,      // Destination
            Amount,           // Main Amount
            Charges = 0,      // Payout charges (e.g. �5)
            TransferMode = 'IMPS', // 'IMPS', 'NEFT', 'ATM', 'Cheque', 'UPI'
            Reference,        // UTR / Txn Reference
            TransDate,
            Notes
        } = req.body;

        const fromAccId = parseInt(FromAccountID, 10);
        const toAccId = parseInt(ToAccountID, 10);

        if (!Number.isInteger(fromAccId) || fromAccId <= 0 || !Number.isInteger(toAccId) || toAccId <= 0) {
            return res.status(400).json({ success: false, error: 'From Account aur To Account valid hona zaroori hai' });
        }
        if (fromAccId === toAccId) {
            return res.status(400).json({ success: false, error: 'Source aur Destination account alag alag hone chahiye' });
        }

        const accCheck = await query('SELECT AccountID FROM Accounts WHERE AccountID IN (@fromAccId, @toAccId) AND UserID = @userId AND IsActive = 1', { fromAccId, toAccId, userId });
        if (accCheck.recordset.length < 2) {
            return res.status(400).json({ success: false, error: 'Chune gaye accounts valid nahi hain ya aapke account nahi hain' });
        }
        if (!Amount || parseFloat(Amount) <= 0 || !Number.isFinite(parseFloat(Amount))) {
            return res.status(400).json({ success: false, error: 'Valid amount daalein' });
        }

        const date = TransDate || todayLocal();
        const mainAmount = parseFloat(Amount);
        const fee = parseFloat(Charges) || 0;

        let desc = `${TransferType} (${TransferMode})`;
        if (Reference) desc += ` - UTR: ${Reference}`;
        if (Notes) desc += ` [${Notes}]`;

        // Atomic execution for Settlement Transfer
        const savedTransfer = await withTransaction(async (tQuery) => {
            // 1. Insert Transfer Record
            const transferResult = await tQuery(`
                INSERT INTO Transactions (
                    TransDate, TransType, Amount, AccountID, ToAccountID,
                    Description, Reference, Tags, UserID
                )
                OUTPUT INSERTED.*
                VALUES (
                    @date, 'Transfer', @amount, @fromAcc, @toAcc,
                    @desc, @ref, @tags, @userId
                )
            `, {
                date,
                amount: mainAmount,
                fromAcc: fromAccId,
                toAcc: toAccId,
                desc,
                ref: Reference || null,
                tags: `BC Settlement, ${TransferType}, ${TransferMode}`,
                userId
            });

            // 2. If there are Payout Charges (e.g. �5 fee deducted from wallet)
            if (fee > 0) {
                await tQuery(`
                    INSERT INTO Transactions (
                        TransDate, TransType, Amount, AccountID,
                        Description, Reference, Tags, CategoryID, UserID
                    )
                    VALUES (
                        @date, 'Expense', @fee, @fromAcc,
                        @desc, @ref, 'BC Payout Fee', 16, @userId
                    )
                `, {
                    date,
                    fee,
                    fromAcc: parseInt(FromAccountID),
                    desc: `${TransferType} Service Fee / Payout Charge`,
                    ref: Reference || null,
                    userId
                });
            }

            // 3. Update account balances
            await tQuery('EXEC sp_UpdateAccountBalance @id', { id: parseInt(FromAccountID) });
            await tQuery('EXEC sp_UpdateAccountBalance @id', { id: parseInt(ToAccountID) });

            const fromAccQ = await tQuery('SELECT AccountID, AccountName, AccountType, CurrentBalance FROM Accounts WHERE AccountID = @id', { id: parseInt(FromAccountID) });
            const toAccQ = await tQuery('SELECT AccountID, AccountName, AccountType, CurrentBalance FROM Accounts WHERE AccountID = @id', { id: parseInt(ToAccountID) });

            // Universal Global Transaction Registry (Rule 4 Atomic Registration)
            const transferRow = transferResult.recordset[0];
            const regInfo = await registerGlobalTransaction({
                sourceModule: 'Cashbook',
                recordId: transferRow.TransactionID,
                entityName: `${TransferType}: ${desc}`,
                amount: mainAmount,
                transDate: date,
                createdAt: new Date(),
                userId
            }, tQuery);
            transferRow.GlobalSerialNo = regInfo.globalSerialNo;
            transferRow.SNCode = regInfo.snCode;
            transferRow.ModuleCode = regInfo.moduleCode;

            return {
                transfer: transferRow,
                fromAccount: fromAccQ.recordset[0] || null,
                toAccount: toAccQ.recordset[0] || null
            };
        });

        res.json({
            success: true,
            data: savedTransfer.transfer,
            fromAccount: savedTransfer.fromAccount,
            toAccount: savedTransfer.toAccount,
            message: `${TransferType} safaltapoorvak ho gaya!`
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/bc/relink - Purani unlinked BC entries ko strictly verified Phone/Aadhaar se safe tareeqe se jodo
router.post('/relink', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;

        // 1. Relink strictly by matching 10-digit Phone numbers within the same UserID
        const r1 = await query(`
            UPDATE b SET b.CustomerID = c.CustomerID
            FROM BCTransactions b
            JOIN (
                SELECT MIN(CustomerID) as CustomerID,
                       RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(Phone,''),' ',''),'-',''),'+',''),'.',''), 10) as CleanPhone,
                       UserID
                FROM Customers
                WHERE IsActive = 1
                GROUP BY RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(Phone,''),' ',''),'-',''),'+',''),'.',''), 10), UserID
                HAVING LEN(RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(Phone,''),' ',''),'-',''),'+',''),'.',''), 10)) = 10
            ) c ON RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(b.CustomerPhone,''),' ',''),'-',''),'+',''),'.',''), 10) = c.CleanPhone AND b.UserID = c.UserID
            WHERE b.CustomerID IS NULL AND b.UserID = @userId
              AND LEN(RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(b.CustomerPhone,''),' ',''),'-',''),'+',''),'.',''), 10)) = 10
        `, { userId });

        // 2. Relink strictly by matching clean 12-digit Aadhaar within the same UserID
        const r2 = await query(`
            UPDATE b SET b.CustomerID = c.CustomerID
            FROM BCTransactions b
            JOIN (
                SELECT MIN(CustomerID) as CustomerID,
                       REPLACE(REPLACE(ISNULL(AadhaarNumber,''),' ',''),'-','') as CleanAadhaar,
                       UserID
                FROM Customers
                WHERE IsActive = 1
                GROUP BY REPLACE(REPLACE(ISNULL(AadhaarNumber,''),' ',''),'-',''), UserID
                HAVING LEN(REPLACE(REPLACE(ISNULL(AadhaarNumber,''),' ',''),'-','')) = 12
            ) c ON REPLACE(REPLACE(ISNULL(b.CustomerAadhaarLast4,''),' ',''),'-','') = c.CleanAadhaar AND b.UserID = c.UserID
            WHERE b.CustomerID IS NULL AND b.UserID = @userId
              AND LEN(REPLACE(REPLACE(ISNULL(b.CustomerAadhaarLast4,''),' ',''),'-','')) = 12
        `, { userId });

        // Blind name-only matching is permanently eliminated to prevent wrong customer data corruption.

        res.json({
            success: true,
            message: 'Purani BC entries surakshit tareeqe se phone/aadhaar se link ho gayi',
            phoneLinked: r1.rowsAffected ? r1.rowsAffected[0] : 0,
            aadhaarLinked: r2.rowsAffected ? r2.rowsAffected[0] : 0
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/customer/:customerId', async (req, res) => {
    try {
        const custId = parseInt(req.params.customerId, 10);
        if (!Number.isInteger(custId) || custId <= 0) {
            return res.status(400).json({ success: false, error: 'Valid customerId zaroori hai' });
        }
        const userId = req.user?.UserID || 1;
        const custInfo = await query(`SELECT CustomerName, Phone FROM Customers WHERE CustomerID = @id AND UserID = @userId`, { id: custId, userId });
        const cPhone = custInfo.recordset.length ? (custInfo.recordset[0].Phone || null) : null;
        const cleanPhoneDigits = (cPhone || '').replace(/\D/g, '').slice(-10);

        const result = await query(`
            SELECT b.*,
                   ca.AccountName as CashAccountName,
                   pa.AccountName as PortalAccountName
            FROM BCTransactions b
            LEFT JOIN Accounts ca ON b.CashAccountID = ca.AccountID
            LEFT JOIN Accounts pa ON b.PortalAccountID = pa.AccountID
            WHERE (b.CustomerID = @id
               OR (@phoneDigits <> '' AND LEN(@phoneDigits) = 10 AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(b.CustomerPhone,''),' ',''),'-',''),'+',''),'.',''), 10) = @phoneDigits))
               AND b.UserID = @userId
            ORDER BY b.TransDate DESC, b.BCID DESC
        `, { id: custId, phoneDigits: cleanPhoneDigits, userId });

        res.json({ success: true, data: result.recordset.map(r => { if (!r.PortalName || !String(r.PortalName).trim()) r.PortalName = derivePortalFromNotes(r.Notes) || null; return r; }) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
