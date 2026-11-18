const express = require('express');
const router = express.Router();
const { query, withTransaction, sql } = require('../database/db');
const { logAudit } = require('../utils/auditLogger');

function parseId(value) {
    const id = parseInt(value, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
}

// GET all accounts
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const result = await query(`
            SELECT a.*,
                   a.CurrentBalance as CalculatedBalance
            FROM Accounts a
            WHERE a.IsActive = 1 AND a.UserID = @userId
            ORDER BY a.CreatedAt
        `, { userId });
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('Accounts list error:', err);
        res.status(500).json({ success: false, error: 'Accounts load nahi ho paye' });
    }
});

// GET single account
router.get('/:id', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const userId = req.user?.UserID || 1;
        if (!id) return res.status(400).json({ success: false, error: 'Account ID galat hai' });

        const result = await query(
            'SELECT * FROM Accounts WHERE AccountID = @id AND UserID = @userId',
            { id, userId }
        );
        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Account nahi mila' });
        }
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        console.error('Account fetch error:', err);
        res.status(500).json({ success: false, error: 'Account load nahi ho paya' });
    }
});

function toDateOnly(val) {
    if (!val) return null;
    if (val instanceof Date) {
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const d = String(val.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const str = String(val);
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : null;
}

function formatTimeVal(val, createdAt) {
    if (val) {
        if (val instanceof Date) {
            let hr = val.getUTCHours();
            const min = String(val.getUTCMinutes()).padStart(2, '0');
            const ampm = hr >= 12 ? 'PM' : 'AM';
            hr = hr % 12 || 12;
            return `${String(hr).padStart(2, '0')}:${min} ${ampm}`;
        }
        const str = String(val);
        const m = str.match(/(\d{1,2}):(\d{2})/);
        if (m) {
            let hr = parseInt(m[1], 10);
            const min = m[2];
            const ampm = hr >= 12 ? 'PM' : 'AM';
            hr = hr % 12 || 12;
            return `${String(hr).padStart(2, '0')}:${min} ${ampm}`;
        }
    }
    if (createdAt) {
        const d = (createdAt instanceof Date) ? createdAt : new Date(createdAt);
        if (!isNaN(d.getTime())) {
            let hr = d.getUTCHours();
            const min = String(d.getUTCMinutes()).padStart(2, '0');
            const ampm = hr >= 12 ? 'PM' : 'AM';
            hr = hr % 12 || 12;
            return `${String(hr).padStart(2, '0')}:${min} ${ampm}`;
        }
    }
    return '';
}

// GET /api/accounts/:id/passbook - Complete Bank-Style Passbook Statement with Running Balance
router.get('/:id/passbook', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'Account ID galat hai' });

        const userId = req.user?.UserID || 1;
        const accRes = await query('SELECT * FROM Accounts WHERE AccountID = @id AND UserID = @userId', { id, userId });
        if (accRes.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Account nahi mila' });
        }
        const account = accRes.recordset[0];

        const { startDate, endDate, search, sort = 'desc' } = req.query;

        // 1. Fetch all general transactions related to this account (Fast Indexed UNION ALL)
        const transRes = await query(`
            SELECT t.TransactionID, t.TransDate, t.TransTime, t.TransType, t.Amount,
                   t.AccountID, t.ToAccountID, t.Description, t.Reference, t.Tags, t.CreatedAt,
                   c.CategoryName, p.PartyName,
                   fa.AccountName as FromAccountName, ta.AccountName as ToAccountName
            FROM Transactions t
            LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
            LEFT JOIN Parties p ON t.PartyID = p.PartyID
            LEFT JOIN Accounts fa ON t.AccountID = fa.AccountID
            LEFT JOIN Accounts ta ON t.ToAccountID = ta.AccountID
            WHERE t.AccountID = @id AND t.IsDeleted = 0 AND t.UserID = @userId
            UNION ALL
            SELECT t.TransactionID, t.TransDate, t.TransTime, t.TransType, t.Amount,
                   t.AccountID, t.ToAccountID, t.Description, t.Reference, t.Tags, t.CreatedAt,
                   c.CategoryName, p.PartyName,
                   fa.AccountName as FromAccountName, ta.AccountName as ToAccountName
            FROM Transactions t
            LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
            LEFT JOIN Parties p ON t.PartyID = p.PartyID
            LEFT JOIN Accounts fa ON t.AccountID = fa.AccountID
            LEFT JOIN Accounts ta ON t.ToAccountID = ta.AccountID
            WHERE t.ToAccountID = @id AND (t.AccountID IS NULL OR t.AccountID != @id) AND t.IsDeleted = 0 AND t.UserID = @userId
        `, { id, userId });

        // 2. Fetch all BC transactions related to this account (Fast Indexed UNION ALL with pre-aggregated Khata link)
        const bcRes = await query(`
            SELECT b.BCID, b.TransDate, b.TransTime, b.ServiceType, b.CustomerName, b.CustomerPhone,
                   b.CustomerAadhaarLast4, b.BankName, b.Amount, b.CommissionEarned, b.CustomerCharge,
                   b.NetProfit, b.CashAccountID, b.PortalAccountID, b.QRProvider, b.QROperation,
                   b.RRN_UTR, b.Status, b.Notes, b.CreatedAt,
                   ca.AccountName as CashAccountName, pa.AccountName as PortalAccountName,
                   CASE WHEN kh.BCID IS NOT NULL THEN 1 ELSE 0 END as ChargeOnKhata
            FROM BCTransactions b
            LEFT JOIN Accounts ca ON b.CashAccountID = ca.AccountID
            LEFT JOIN Accounts pa ON b.PortalAccountID = pa.AccountID
            LEFT JOIN (
                SELECT DISTINCT BCID FROM KhataEntries WHERE EntryType = 'Gave' AND BCID IS NOT NULL AND UserID = @userId
            ) kh ON kh.BCID = b.BCID
            WHERE b.CashAccountID = @id AND b.Status = 'Success' AND b.UserID = @userId
            UNION ALL
            SELECT b.BCID, b.TransDate, b.TransTime, b.ServiceType, b.CustomerName, b.CustomerPhone,
                   b.CustomerAadhaarLast4, b.BankName, b.Amount, b.CommissionEarned, b.CustomerCharge,
                   b.NetProfit, b.CashAccountID, b.PortalAccountID, b.QRProvider, b.QROperation,
                   b.RRN_UTR, b.Status, b.Notes, b.CreatedAt,
                   ca.AccountName as CashAccountName, pa.AccountName as PortalAccountName,
                   CASE WHEN kh.BCID IS NOT NULL THEN 1 ELSE 0 END as ChargeOnKhata
            FROM BCTransactions b
            LEFT JOIN Accounts ca ON b.CashAccountID = ca.AccountID
            LEFT JOIN Accounts pa ON b.PortalAccountID = pa.AccountID
            LEFT JOIN (
                SELECT DISTINCT BCID FROM KhataEntries WHERE EntryType = 'Gave' AND BCID IS NOT NULL AND UserID = @userId
            ) kh ON kh.BCID = b.BCID
            WHERE b.PortalAccountID = @id AND (b.CashAccountID IS NULL OR b.CashAccountID != @id) AND b.Status = 'Success' AND b.UserID = @userId
        `, { id, userId });

        const entries = [];

        // 3. Normalize General Transactions
        for (const t of transRes.recordset) {
            let debit = 0, credit = 0;
            let typeLabel = t.TransType;
            let particulars = t.Description || t.CategoryName || 'General Transaction';

            if (t.TransType === 'Transfer') {
                if (t.AccountID === id) {
                    debit = parseFloat(t.Amount || 0);
                    typeLabel = 'Transfer (Out)';
                    particulars = `Transfer: Bheja ${t.ToAccountName ? 'to ' + t.ToAccountName : ''} ${t.Description ? '(' + t.Description + ')' : ''}`;
                } else if (t.ToAccountID === id) {
                    credit = parseFloat(t.Amount || 0);
                    typeLabel = 'Transfer (In)';
                    particulars = `Transfer: Prapt ${t.FromAccountName ? 'from ' + t.FromAccountName : ''} ${t.Description ? '(' + t.Description + ')' : ''}`;
                }
            } else if (['Income', 'Loan Received', 'Loan Recovery'].includes(t.TransType)) {
                credit = parseFloat(t.Amount || 0);
                typeLabel = t.TransType === 'Income' ? 'Aamadni (Income)' : t.TransType;
                if (t.PartyName) particulars += ` (Party: ${t.PartyName})`;
            } else if (['Expense', 'Loan Given', 'Loan Repay'].includes(t.TransType)) {
                debit = parseFloat(t.Amount || 0);
                typeLabel = t.TransType === 'Expense' ? 'Kharcha (Expense)' : t.TransType;
                if (t.PartyName) particulars += ` (Party: ${t.PartyName})`;
            }

            if (debit > 0 || credit > 0) {
                entries.push({
                    id: `tx_${t.TransactionID}`,
                    rawId: t.TransactionID,
                    source: 'Transaction',
                    date: t.TransDate,
                    time: formatTimeVal(t.TransTime, t.CreatedAt),
                    createdAt: t.CreatedAt,
                    particulars: particulars.trim(),
                    ref: t.Reference || '',
                    type: typeLabel,
                    debit,
                    credit
                });
            }
        }

        // 4. Normalize BC Counter Transactions
        for (const b of bcRes.recordset) {
            const isCashSide = b.CashAccountID === id;
            const isPortalSide = b.PortalAccountID === id;

            if (isCashSide) {
                let debit = 0, credit = 0;
                let typeLabel = b.ServiceType;
                let particulars = '';

                if (['Cash Deposit', 'Money Transfer'].includes(b.ServiceType)) {
                    credit = parseFloat(b.Amount || 0);
                    typeLabel = b.ServiceType === 'Cash Deposit' ? 'Cash Jama (Deposit)' : 'Money Transfer (DMT)';
                    particulars = `${b.ServiceType}: ${b.CustomerName || 'Grahak'} se cash prapt (${b.BankName || 'Bank'})`;
                } else if (b.ServiceType === 'Cash Withdrawal') {
                    debit = parseFloat(b.Amount || 0);
                    typeLabel = 'Cash Nikasi (AEPS)';
                    particulars = `AEPS Nikasi: ${b.CustomerName || 'Grahak'} ko cash diya (${b.BankName || 'Bank'})`;
                } else if (b.ServiceType === 'QR Pay') {
                    if (b.QROperation === 'Cash Given to Customer') {
                        debit = parseFloat(b.Amount || 0);
                        typeLabel = 'QR Cash Given';
                        particulars = `QR Pay: ${b.CustomerName || 'Grahak'} ko cash diya`;
                    } else if (b.QROperation === 'Send - Cash Taken from Customer') {
                        credit = parseFloat(b.Amount || 0);
                        typeLabel = 'QR Cash Taken';
                        particulars = `QR Pay: ${b.CustomerName || 'Grahak'} se cash liya`;
                    }
                }

                // CustomerCharge tabhi cash me aati hai jab wo Udhaar/Khata pe na ho (SP logic exact match)
                const charge = (!b.ChargeOnKhata) ? parseFloat(b.CustomerCharge || 0) : 0;
                if (charge > 0) {
                    credit += charge;
                    particulars += ` [Shulk: +₹${charge}]`;
                }

                if (debit > 0 || credit > 0) {
                    entries.push({
                        id: `bc_cash_${b.BCID}`,
                        rawId: b.BCID,
                        source: 'BC Banking',
                        date: b.TransDate,
                        time: formatTimeVal(b.TransTime, b.CreatedAt),
                        createdAt: b.CreatedAt,
                        particulars: particulars.trim(),
                        ref: b.RRN_UTR || '',
                        type: typeLabel,
                        debit,
                        credit,
                        customerName: b.CustomerName,
                        bankName: b.BankName
                    });
                }
            }

            if (isPortalSide) {
                let debit = 0, credit = 0;
                let typeLabel = b.ServiceType;
                let particulars = '';

                const comm = parseFloat(b.CommissionEarned || 0);

                if (b.ServiceType === 'Cash Withdrawal') {
                    credit = parseFloat(b.Amount || 0) + comm;
                    typeLabel = 'AEPS Portal Credit';
                    particulars = `AEPS Settlement: ${b.CustomerName || 'Grahak'} (${b.BankName || 'Bank'})` +
                        (comm > 0 ? ` [Comm: +₹${comm}]` : '');
                } else if (['Cash Deposit', 'Money Transfer'].includes(b.ServiceType)) {
                    debit = parseFloat(b.Amount || 0);
                    credit = comm;
                    typeLabel = 'Portal Wallet Debit';
                    particulars = `${b.ServiceType}: ${b.CustomerName || 'Grahak'} (${b.BankName || 'Bank'})` +
                        (comm > 0 ? ` [Comm: +₹${comm}]` : '');
                } else if (b.ServiceType === 'QR Pay') {
                    if (['Cash Given to Customer', 'Deposit/Payment'].includes(b.QROperation)) {
                        credit = parseFloat(b.Amount || 0) + comm;
                        typeLabel = 'QR Wallet Received';
                        particulars = `QR Payment Received: ${b.CustomerName || 'Grahak'}` +
                            (comm > 0 ? ` [Comm: +₹${comm}]` : '');
                    } else {
                        debit = parseFloat(b.Amount || 0);
                        credit = comm;
                        typeLabel = 'QR Wallet Debit';
                        particulars = `QR Transfer Sent: ${b.CustomerName || 'Grahak'}` +
                            (comm > 0 ? ` [Comm: +₹${comm}]` : '');
                    }
                } else {
                    credit = comm;
                    typeLabel = b.ServiceType;
                    particulars = `${b.ServiceType}: ${b.CustomerName || 'Grahak'}` +
                        (comm > 0 ? ` [Comm: +₹${comm}]` : '');
                }

                if (debit > 0 || credit > 0) {
                    entries.push({
                        id: `bc_portal_${b.BCID}`,
                        rawId: b.BCID,
                        source: 'BC Banking',
                        date: b.TransDate,
                        time: formatTimeVal(b.TransTime, b.CreatedAt),
                        createdAt: b.CreatedAt,
                        particulars: particulars.trim(),
                        ref: b.RRN_UTR || '',
                        type: typeLabel,
                        debit,
                        credit,
                        customerName: b.CustomerName,
                        bankName: b.BankName
                    });
                }
            }
        }

        // 5. Chronological Sort (Actual Transaction Date & Time, Oldest first)
        function getEntryTimestamp(e) {
            const dateStr = toDateOnly(e.date) || (e.createdAt ? toDateOnly(e.createdAt) : '1970-01-01');
            let hh = 0, mm = 0, ss = 0;
            if (e.time) {
                const str = String(e.time).trim().toLowerCase();
                const m = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
                if (m) {
                    hh = parseInt(m[1], 10);
                    mm = parseInt(m[2], 10);
                    ss = m[3] ? parseInt(m[3], 10) : 0;
                    if (str.includes('pm') && hh < 12) hh += 12;
                    if (str.includes('am') && hh === 12) hh = 0;
                }
            } else if (e.createdAt) {
                const cDt = new Date(e.createdAt);
                hh = cDt.getHours();
                mm = cDt.getMinutes();
                ss = cDt.getSeconds();
            }
            const dt = new Date(dateStr);
            dt.setHours(hh, mm, ss, 0);
            const ts = !isNaN(dt.getTime()) ? dt.getTime() : 0;
            const cTs = e.createdAt ? new Date(e.createdAt).getTime() : 0;
            return { ts, tieBreaker: cTs || 0, rawId: e.rawId || 0 };
        }

        entries.sort((a, b) => {
            const tA = getEntryTimestamp(a);
            const tB = getEntryTimestamp(b);
            if (tA.ts !== tB.ts) return tA.ts - tB.ts;
            if (tA.tieBreaker !== tB.tieBreaker) return tA.tieBreaker - tB.tieBreaker;
            return tA.rawId - tB.rawId;
        });

        // 6. Compute Running Balance starting from Opening Balance
        let currentRun = parseFloat(account.OpeningBalance || 0);
        let totalAllCredit = 0;
        let totalAllDebit = 0;

        for (const e of entries) {
            totalAllCredit += e.credit;
            totalAllDebit += e.debit;
            currentRun = currentRun + e.credit - e.debit;
            e.balanceAfter = Math.round(currentRun * 100) / 100;
        }

        // 7. Determine True Period Opening & Closing Balances
        let periodOpeningBalance = parseFloat(account.OpeningBalance || 0);
        if (startDate) {
            const priorEntries = entries.filter(e => {
                const d = toDateOnly(e.date);
                return d && d < startDate;
            });
            if (priorEntries.length > 0) {
                periodOpeningBalance = priorEntries[priorEntries.length - 1].balanceAfter;
            }
        }

        let periodTrueClosingBalance = Math.round(currentRun * 100) / 100;
        if (endDate) {
            const periodEntries = entries.filter(e => {
                const d = toDateOnly(e.date);
                return d && d <= endDate;
            });
            if (periodEntries.length > 0) {
                periodTrueClosingBalance = periodEntries[periodEntries.length - 1].balanceAfter;
            } else {
                periodTrueClosingBalance = periodOpeningBalance;
            }
        }

        // 8. Filtering (Search / Date range)
        let filtered = entries;
        if (startDate) {
            filtered = filtered.filter(e => {
                const d = toDateOnly(e.date);
                return d && d >= startDate;
            });
        }
        if (endDate) {
            filtered = filtered.filter(e => {
                const d = toDateOnly(e.date);
                return d && d <= endDate;
            });
        }
        const hasKeywordSearch = !!(search && search.trim());
        if (hasKeywordSearch) {
            const q = search.trim().toLowerCase();
            filtered = filtered.filter(e => {
                return (e.particulars && e.particulars.toLowerCase().includes(q)) ||
                       (e.ref && e.ref.toLowerCase().includes(q)) ||
                       (e.type && e.type.toLowerCase().includes(q)) ||
                       (e.customerName && e.customerName.toLowerCase().includes(q));
            });
        }

        // Summary for current view
        let viewCredit = 0, viewDebit = 0;
        for (const e of filtered) {
            viewCredit += e.credit;
            viewDebit += e.debit;
        }

        const hasDateFilter = !!(startDate || endDate);
        const hasSearchOnly = !hasDateFilter && hasKeywordSearch;
        const isFiltered = hasDateFilter || hasKeywordSearch;

        let summaryOpening = parseFloat(account.OpeningBalance || 0);
        let summaryCredit = Math.round(totalAllCredit * 100) / 100;
        let summaryDebit = Math.round(totalAllDebit * 100) / 100;
        let summaryClosing = Math.round(currentRun * 100) / 100;

        if (hasDateFilter) {
            summaryOpening = Math.round(periodOpeningBalance * 100) / 100;
            summaryCredit = Math.round(viewCredit * 100) / 100;
            summaryDebit = Math.round(viewDebit * 100) / 100;
            // Agar search keyword bhi laga hai, to closing balance partial na hokar us period ka SACHHA closing balance rahega
            summaryClosing = hasKeywordSearch
                ? Math.round(periodTrueClosingBalance * 100) / 100
                : Math.round((periodOpeningBalance + viewCredit - viewDebit) * 100) / 100;
        } else if (hasKeywordSearch) {
            // Search-only (no date range): show real account closing balance and matching results
            summaryOpening = parseFloat(account.OpeningBalance || 0);
            summaryCredit = Math.round(viewCredit * 100) / 100;
            summaryDebit = Math.round(viewDebit * 100) / 100;
            summaryClosing = Math.round(currentRun * 100) / 100;
        }

        // Sort for presentation: default 'desc' (latest first, like standard passbooks) or 'asc'
        if (sort === 'desc') {
            filtered = [...filtered].reverse();
        }

        const limitParam = req.query.limit ? parseInt(req.query.limit, 10) : null;
        const pageParam = req.query.page ? parseInt(req.query.page, 10) : 1;

        let outputRows = filtered;
        if (limitParam && limitParam > 0) {
            const startIdx = Math.max(0, (pageParam - 1) * limitParam);
            outputRows = filtered.slice(startIdx, startIdx + limitParam);
        }

        const cleanData = outputRows.map(e => ({
            id: e.id,
            date: e.date,
            time: e.time,
            particulars: e.particulars,
            ref: e.ref || '',
            type: e.type,
            debit: e.debit,
            credit: e.credit,
            balanceAfter: e.balanceAfter
        }));

        res.json({
            success: true,
            account: {
                AccountID: account.AccountID,
                AccountName: account.AccountName,
                AccountType: account.AccountType,
                BankName: account.BankName,
                AccountNumber: account.AccountNumber,
                OpeningBalance: parseFloat(account.OpeningBalance || 0),
                CurrentBalance: parseFloat(account.CurrentBalance || 0),
                Color: account.Color,
                Icon: account.Icon
            },
            summary: {
                openingBalance: summaryOpening,
                totalCredit: summaryCredit,
                totalDebit: summaryDebit,
                closingBalance: summaryClosing,
                lifetimeOpeningBalance: parseFloat(account.OpeningBalance || 0),
                lifetimeTotalCredit: Math.round(totalAllCredit * 100) / 100,
                lifetimeTotalDebit: Math.round(totalAllDebit * 100) / 100,
                lifetimeClosingBalance: Math.round(currentRun * 100) / 100,
                viewCredit: Math.round(viewCredit * 100) / 100,
                viewDebit: Math.round(viewDebit * 100) / 100,
                totalEntries: entries.length,
                filteredCount: filtered.length,
                isFiltered,
                hasDateFilter,
                hasSearchOnly
            },
            data: cleanData
        });
    } catch (err) {
        console.error('Account passbook error:', err);
        res.status(500).json({ success: false, error: 'Passbook load nahi ho payi: ' + err.message });
    }
});

// POST create account
router.post('/', async (req, res) => {
    try {
        const { AccountName, AccountType, BankName, AccountNumber, OpeningBalance, Color, Icon, Currency } = req.body || {};
        if (!AccountName || !String(AccountName).trim()) {
            return res.status(400).json({ success: false, error: 'Account name zaroori hai' });
        }
        if (!AccountType || !String(AccountType).trim()) {
            return res.status(400).json({ success: false, error: 'Account type zaroori hai' });
        }
        const opening = parseFloat(OpeningBalance);
        if (isNaN(opening)) {
            return res.status(400).json({ success: false, error: 'Opening balance galat hai' });
        }

        const userId = req.user?.UserID || 1;
        const result = await query(`
            INSERT INTO Accounts (AccountName, AccountType, BankName, AccountNumber, OpeningBalance, CurrentBalance, Color, Icon, Currency, UserID)
            OUTPUT INSERTED.*
            VALUES (@name, @type, @bank, @accNo, @opening, @opening, @color, @icon, @currency, @userId)
        `, {
            name: String(AccountName).trim(), type: String(AccountType).trim(),
            bank: BankName || null,
            accNo: AccountNumber || null, opening: opening,
            color: Color || '#6366f1', icon: Icon || 'wallet', currency: Currency || 'INR',
            userId
        });
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        console.error('Account create error:', err);
        res.status(500).json({ success: false, error: 'Account save nahi ho paya' });
    }
});

// PUT update account
router.put('/:id', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const userId = req.user?.UserID || 1;
        if (!id) return res.status(400).json({ success: false, error: 'Account ID galat hai' });

        const { AccountName, AccountType, BankName, AccountNumber, OpeningBalance, Color, Icon } = req.body || {};

        const updated = await withTransaction(async (tQuery) => {
            const existing = await tQuery('SELECT * FROM Accounts WHERE AccountID = @id AND UserID = @userId', { id, userId });
            if (existing.recordset.length === 0) {
                throw Object.assign(new Error('Account nahi mila'), { status: 404 });
            }
            const old = existing.recordset[0];

            // Field na bheja ho to purana value rakho (warna data wipe ho jata tha)
            const name = AccountName !== undefined ? String(AccountName).trim() : old.AccountName;
            const type = AccountType !== undefined ? String(AccountType).trim() : old.AccountType;
            const bank = BankName !== undefined ? (BankName || null) : old.BankName;
            const accNo = AccountNumber !== undefined ? (AccountNumber || null) : old.AccountNumber;
            let opening = old.OpeningBalance;
            if (OpeningBalance !== undefined && OpeningBalance !== null && OpeningBalance !== '') {
                const parsed = parseFloat(OpeningBalance);
                if (isNaN(parsed)) {
                    throw Object.assign(new Error('Opening balance galat hai'), { status: 400 });
                }
                opening = parsed;
            }
            const color = Color !== undefined ? (Color || '#6366f1') : old.Color;
            const icon = Icon !== undefined ? (Icon || 'wallet') : old.Icon;

            if (!name || !type) {
                throw Object.assign(new Error('Account name aur type zaroori hain'), { status: 400 });
            }

            const result = await tQuery(`
                UPDATE Accounts SET
                    AccountName = @name, AccountType = @type, BankName = @bank,
                    AccountNumber = @accNo, OpeningBalance = @opening, Color = @color, Icon = @icon, UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE AccountID = @id AND UserID = @userId
            `, { id, name, type, bank, accNo, opening, color, icon, userId });

            // Balance recalc usi transaction me - warna update ke baad stale balance reh jata hai
            await tQuery('EXEC sp_UpdateAccountBalance @id', { id });

            await logAudit({
                action: 'UPDATE',
                module: 'Accounts',
                tableName: 'Accounts',
                recordId: id,
                entityName: name,
                amount: opening,
                description: `Account update hua: ${name}`,
                oldData: old,
                newData: result.recordset[0],
                details: `Name: ${old.AccountName} -> ${name}, Type: ${old.AccountType} -> ${type}`,
                tQuery
            });

            return result.recordset[0];
        });

        res.json({ success: true, data: updated });
    } catch (err) {
        console.error('Account update error:', err);
        const status = err.status || 500;
        res.status(status).json({ success: false, error: err.status ? err.message : 'Account update nahi ho paya' });
    }
});

// DELETE account
router.delete('/:id', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const userId = req.user?.UserID || 1;
        if (!id) return res.status(400).json({ success: false, error: 'Account ID galat hai' });

        const existing = await query('SELECT AccountName, AccountType FROM Accounts WHERE AccountID = @id AND UserID = @userId', { id, userId });
        if (existing.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Account nahi mila' });
        }
        if (existing.recordset[0].AccountType === 'Cash') {
            return res.status(400).json({ success: false, error: 'Primary Cash / Galla account delete nahi kiya ja sakta kyonki yeh system ke hisaab-kitaab ke liye zaroori hai.' });
        }

        const result = await query(
            'UPDATE Accounts SET IsActive = 0, UpdatedAt = GETDATE() WHERE AccountID = @id AND UserID = @userId',
            { id, userId }
        );
        if (!result.rowsAffected || result.rowsAffected[0] === 0) {
            return res.status(404).json({ success: false, error: 'Account nahi mila' });
        }
        res.json({ success: true, message: 'Account delete ho gaya' });
    } catch (err) {
        console.error('Account delete error:', err);
        res.status(500).json({ success: false, error: 'Account delete nahi ho paya' });
    }
});

module.exports = router;
