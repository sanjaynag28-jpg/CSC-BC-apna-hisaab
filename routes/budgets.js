const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const { parseId, parseOptionalId, clampInt, parseMoney, monthRange } = require('../utils/helpers');

// GET all budgets with spent amount
router.get('/', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const month = clampInt(req.query.month, 1, 12, new Date().getMonth() + 1);
        const year = clampInt(req.query.year, 1970, 2999, new Date().getFullYear());
        // Sargable range - MONTH()/YEAR() likhne se index use nahi hota tha
        const { start, end } = monthRange(month, year);

        const result = await query(`
            SELECT b.*, c.CategoryName, c.Icon, c.Color,
                   ISNULL((
                        SELECT SUM(t.Amount) FROM Transactions t
                        WHERE (b.CategoryID IS NULL OR t.CategoryID = b.CategoryID)
                          AND t.UserID = @userId
                          AND t.IsDeleted = 0
                          AND t.TransDate >= @start
                          AND t.TransDate <= @end
                          AND t.TransType = 'Expense'
                   ), 0) as SpentAmount
            FROM Budgets b
            LEFT JOIN Categories c ON b.CategoryID = c.CategoryID
            WHERE b.IsActive = 1 AND b.UserID = @userId AND b.BudgetMonth = @month AND b.BudgetYear = @year
            ORDER BY b.CreatedAt
        `, { userId, month, year, start, end });

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('Budget list error:', err);
        res.status(500).json({ success: false, error: 'Budget load nahi ho paye' });
    }
});

// POST create budget
router.post('/', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const { BudgetName, CategoryID, BudgetMonth, BudgetYear, BudgetAmount, AlertPercent } = req.body || {};

        if (!BudgetName || !String(BudgetName).trim()) {
            return res.status(400).json({ success: false, error: 'Budget name zaroori hai' });
        }
        const amount = parseMoney(BudgetAmount, NaN);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Budget amount galat hai' });
        }
        const month = clampInt(BudgetMonth, 1, 12, new Date().getMonth() + 1);
        const year = clampInt(BudgetYear, 1970, 2999, new Date().getFullYear());
        // AlertPercent: 0 bhi valid hai - `||` se 80 ho jata tha
        const alertRaw = (AlertPercent === undefined || AlertPercent === null || AlertPercent === '')
            ? 80 : Number(AlertPercent);
        if (!Number.isFinite(alertRaw) || alertRaw < 0 || alertRaw > 100) {
            return res.status(400).json({ success: false, error: 'Alert percent 0-100 ke beech hona chahiye' });
        }

        const result = await query(`
            INSERT INTO Budgets (UserID, BudgetName, CategoryID, BudgetMonth, BudgetYear, BudgetAmount, AlertPercent)
            OUTPUT INSERTED.*
            VALUES (@userId, @name, @categoryId, @month, @year, @amount, @alert)
        `, {
            userId,
            name: String(BudgetName).trim(),
            categoryId: parseOptionalId(CategoryID),
            month,
            year,
            amount,
            alert: alertRaw
        });
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        console.error('Budget create error:', err);
        res.status(500).json({ success: false, error: 'Budget save nahi hua' });
    }
});

// PUT update budget
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'Budget ID galat hai' });

        const { BudgetName, BudgetAmount, AlertPercent } = req.body || {};

        // Purana record se merge karo - partial edit me NaN/NULL na jaye
        const old = await query('SELECT * FROM Budgets WHERE BudgetID = @id AND UserID = @userId', { id, userId });
        if (!old.recordset.length) {
            return res.status(404).json({ success: false, error: 'Budget nahi mila' });
        }
        const cur = old.recordset[0];

        const name = (BudgetName !== undefined && BudgetName !== null && String(BudgetName).trim())
            ? String(BudgetName).trim() : cur.BudgetName;

        let amount = cur.BudgetAmount;
        if (BudgetAmount !== undefined && BudgetAmount !== null && BudgetAmount !== '') {
            const parsed = parseMoney(BudgetAmount, NaN);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                return res.status(400).json({ success: false, error: 'Budget amount galat hai' });
            }
            amount = parsed;
        }

        let alert = cur.AlertPercent;
        if (AlertPercent !== undefined && AlertPercent !== null && AlertPercent !== '') {
            const parsed = Number(AlertPercent);
            if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
                return res.status(400).json({ success: false, error: 'Alert percent 0-100 ke beech hona chahiye' });
            }
            alert = parsed;
        }

        await query(`
            UPDATE Budgets SET BudgetName = @name, BudgetAmount = @amount, AlertPercent = @alert
            WHERE BudgetID = @id AND UserID = @userId
        `, { id, userId, name, amount, alert });
        res.json({ success: true, message: 'Budget update ho gaya' });
    } catch (err) {
        console.error('Budget update error:', err);
        res.status(500).json({ success: false, error: 'Budget update nahi hua' });
    }
});

// DELETE budget (soft delete - audit/reporting ke liye record bacha rehta hai)
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'Budget ID galat hai' });
        const result = await query('UPDATE Budgets SET IsActive = 0 WHERE BudgetID = @id AND UserID = @userId', { id, userId });
        if (!result.rowsAffected || !result.rowsAffected[0]) {
            return res.status(404).json({ success: false, error: 'Budget nahi mila' });
        }
        res.json({ success: true, message: 'Budget delete ho gaya' });
    } catch (err) {
        console.error('Budget delete error:', err);
        res.status(500).json({ success: false, error: 'Budget delete nahi hua' });
    }
});

module.exports = router;
