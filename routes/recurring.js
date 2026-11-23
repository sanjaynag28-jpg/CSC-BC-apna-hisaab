const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const { processRecurringTransactions, toISO } = require('../database/recurringEngine');
const { VALID_TRANS_TYPES, parseId, parseOptionalId, isValidDateOnly, todayLocal } = require('../utils/helpers');

function toDateStr(val) {
    if (!val) return null;
    if (val instanceof Date) {
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const d = String(val.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const s = String(val);
    return s.length >= 10 ? s.slice(0, 10) : s;
}

// GET all recurring transactions (upcoming + history)
router.get('/', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const result = await query(`
            SELECT r.*, a.AccountName, ta.AccountName as ToAccountName, c.CategoryName, p.PartyName
            FROM RecurringTransactions r
            LEFT JOIN Accounts a ON r.AccountID = a.AccountID
            LEFT JOIN Accounts ta ON r.ToAccountID = ta.AccountID
            LEFT JOIN Categories c ON r.CategoryID = c.CategoryID
            LEFT JOIN Parties p ON r.PartyID = p.PartyID
            WHERE r.UserID = @userId
            ORDER BY r.IsActive DESC, r.NextDueDate ASC
        `, { userId });
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('Recurring list error:', err);
        res.status(500).json({ success: false, error: 'Recurring list load nahi ho payi' });
    }
});

// GET one
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'Recurring ID galat hai' });

        const result = await query('SELECT * FROM RecurringTransactions WHERE RecurringID = @id AND UserID = @userId', { id, userId });
        if (!result.recordset.length) return res.status(404).json({ success: false, error: 'Recurring item nahi mila' });
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        console.error('Recurring fetch error:', err);
        res.status(500).json({ success: false, error: 'Recurring item load nahi hua' });
    }
});

// POST create recurring transaction
router.post('/', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const { TransType, Amount, AccountID, ToAccountID, CategoryID, PartyID, Description, Frequency, StartDate, EndDate } = req.body || {};

        if (!TransType || !VALID_TRANS_TYPES.includes(TransType)) {
            return res.status(400).json({ success: false, error: 'TransType galat hai (Income/Expense/Transfer...)' });
        }
        const amount = parseFloat(Amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Amount galat hai' });
        }
        const accountId = parseOptionalId(AccountID);
        if (!accountId) return res.status(400).json({ success: false, error: 'Account select karna zaroori hai (Transaction ke liye)' });
        if (!Frequency) return res.status(400).json({ success: false, error: 'Frequency select kariye (Daily/Weekly/Monthly/Yearly)' });

        const toAccountId = TransType === 'Transfer' ? parseOptionalId(ToAccountID) : null;
        if (TransType === 'Transfer' && !toAccountId) {
            return res.status(400).json({ success: false, error: 'Transfer me destination account select karo' });
        }
        if (toAccountId === accountId) {
            return res.status(400).json({ success: false, error: 'Source aur destination account same nahi ho sakta' });
        }

        const start = StartDate || toISO(new Date());
        if (!isValidDateOnly(start)) {
            return res.status(400).json({ success: false, error: 'Start date galat hai' });
        }

        const result = await query(`
            INSERT INTO RecurringTransactions
                (UserID, TransType, Amount, AccountID, ToAccountID, CategoryID, PartyID, Description, Frequency, StartDate, EndDate, NextDueDate, IsActive)
            OUTPUT INSERTED.*
            VALUES (@userId, @type, @amount, @acc, @toAcc, @cat, @party, @desc, @freq, @start, @end, @next, 1)
        `, {
            userId,
            type: TransType, amount: amount,
            acc: accountId, toAcc: toAccountId, cat: parseOptionalId(CategoryID),
            party: parseOptionalId(PartyID),
            desc: Description || null, freq: Frequency,
            start, end: EndDate || null, next: start
        });
        res.status(201).json({ success: true, data: result.recordset[0], message: 'Recurring transaction ban gaya' });
    } catch (err) {
        console.error('Recurring create error:', err);
        res.status(500).json({ success: false, error: 'Recurring transaction save nahi ho paya' });
    }
});

// PUT update recurring
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'Recurring ID galat hai' });

        const existingRes = await query('SELECT * FROM RecurringTransactions WHERE RecurringID = @id AND UserID = @userId', { id, userId });
        if (!existingRes.recordset.length) {
            return res.status(404).json({ success: false, error: 'Recurring transaction nahi mila' });
        }
        const oldRec = existingRes.recordset[0];

        const { TransType, Amount, AccountID, ToAccountID, CategoryID, PartyID, Description, Frequency, StartDate, EndDate, IsActive } = req.body || {};

        const targetType = TransType !== undefined ? TransType : oldRec.TransType;
        if (!VALID_TRANS_TYPES.includes(targetType)) {
            return res.status(400).json({ success: false, error: 'TransType galat hai (Income/Expense/Transfer...)' });
        }

        const targetAccountId = AccountID !== undefined ? parseOptionalId(AccountID) : oldRec.AccountID;
        if (!targetAccountId) {
            return res.status(400).json({ success: false, error: 'Account select karna zaroori hai' });
        }

        let targetToAccountId = null;
        if (targetType === 'Transfer') {
            targetToAccountId = ToAccountID !== undefined
                ? parseOptionalId(ToAccountID)
                : (oldRec.TransType === 'Transfer' ? oldRec.ToAccountID : null);

            if (!targetToAccountId) {
                return res.status(400).json({ success: false, error: 'Transfer me destination account select karo' });
            }
            if (targetToAccountId === targetAccountId) {
                return res.status(400).json({ success: false, error: 'Source aur destination account same nahi ho sakta' });
            }
        }

        let numAmount = oldRec.Amount;
        if (Amount !== undefined && Amount !== null) {
            numAmount = parseFloat(Amount);
            if (!Number.isFinite(numAmount) || numAmount <= 0) {
                return res.status(400).json({ success: false, error: 'Amount galat hai' });
            }
        }

        const today = todayLocal();
        const oldStart = toDateStr(oldRec.StartDate);
        const newStart = StartDate ? toDateStr(StartDate) : oldStart;
        const oldFreq = (oldRec.Frequency || '').toLowerCase();
        const newFreq = (Frequency || oldRec.Frequency || '').toLowerCase();

        let targetNextDueDate = toDateStr(oldRec.NextDueDate);

        const freqChanged = Frequency && newFreq !== oldFreq;
        const startChanged = StartDate && newStart !== oldStart;

        if (startChanged) {
            // Agar start date badli hai aur future me hai, to wahi se shuru ho
            if (newStart > today) {
                targetNextDueDate = newStart;
            } else if (!targetNextDueDate || targetNextDueDate < newStart) {
                targetNextDueDate = newStart;
            }
        } else if (freqChanged) {
            // Agar frequency badli hai: purani StartDate par reset karke backdated flood se bachein.
            // Agar NextDueDate future me hai to barkaraar rakhein, warna aaj set karein
            if (!targetNextDueDate || targetNextDueDate <= today) {
                targetNextDueDate = today;
            }
        }
        // Agar na frequency badli na start date, to purana NextDueDate hi barkaraar rahega

        await query(`
            UPDATE RecurringTransactions SET
                TransType = @type,
                Amount = @amount,
                AccountID = @acc,
                ToAccountID = @toAcc,
                CategoryID = @cat,
                PartyID = @party,
                Description = @desc,
                Frequency = ISNULL(@freq, Frequency),
                StartDate = ISNULL(@start, StartDate),
                EndDate = @end,
                IsActive = ISNULL(@active, IsActive),
                NextDueDate = ISNULL(@next, NextDueDate),
                UpdatedAt = GETDATE()
            WHERE RecurringID = @id AND UserID = @userId
        `, {
            id,
            userId,
            type: targetType,
            amount: numAmount,
            acc: targetAccountId,
            toAcc: targetToAccountId,
            cat: CategoryID !== undefined ? parseOptionalId(CategoryID) : oldRec.CategoryID,
            party: PartyID !== undefined ? parseOptionalId(PartyID) : oldRec.PartyID,
            desc: Description !== undefined ? (Description || null) : oldRec.Description,
            freq: Frequency || null,
            start: StartDate || null,
            end: EndDate !== undefined ? EndDate : oldRec.EndDate,
            active: IsActive !== undefined ? (IsActive ? 1 : 0) : null,
            next: targetNextDueDate
        });
        res.json({ success: true, message: 'Recurring transaction update ho gaya' });
    } catch (err) {
        console.error('Recurring update error:', err);
        res.status(500).json({ success: false, error: 'Recurring transaction update nahi ho paya' });
    }
});

// DELETE recurring (soft deactivate — bani hui transactions rehti hain)
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'Recurring ID galat hai' });

        const result = await query('UPDATE RecurringTransactions SET IsActive = 0, UpdatedAt = GETDATE() WHERE RecurringID = @id AND UserID = @userId', { id, userId });
        if (!result.rowsAffected || result.rowsAffected[0] === 0) {
            return res.status(404).json({ success: false, error: 'Recurring item nahi mila' });
        }
        res.json({ success: true, message: 'Recurring transaction deactivate ho gaya (bani hui entries safe hain)' });
    } catch (err) {
        console.error('Recurring delete error:', err);
        res.status(500).json({ success: false, error: 'Recurring deactivate nahi ho paya' });
    }
});

// POST manual process — due recurring entries abhi generate karo
router.post('/process', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const result = await processRecurringTransactions(userId);
        res.json({ success: true, ...result, message: `Recurring process ho gaya: ${result.generated} transaction(s) bane` });
    } catch (err) {
        console.error('Recurring process error:', err);
        res.status(500).json({ success: false, error: 'Recurring process nahi ho paya' });
    }
});

module.exports = router;
