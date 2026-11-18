const express = require('express');
const router = express.Router();
const { query } = require('../database/db');

// GET all categories
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const result = await query(`
            SELECT c.*, 
                   ISNULL(SUM(t.Amount), 0) as TotalAmount,
                   COUNT(t.TransactionID) as TransactionCount
            FROM Categories c
            LEFT JOIN Transactions t ON c.CategoryID = t.CategoryID AND t.UserID = @userId AND t.IsDeleted = 0
            WHERE c.IsActive = 1 AND c.UserID = @userId
            GROUP BY c.CategoryID, c.UserID, c.CategoryName, c.CategoryType, c.Icon, c.Color, c.ParentID, c.IsActive, c.CreatedAt
            ORDER BY c.CategoryType, c.CategoryName
        `, { userId });
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST create category
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const { CategoryName, CategoryType, Icon, Color, ParentID } = req.body;
        const result = await query(`
            INSERT INTO Categories (UserID, CategoryName, CategoryType, Icon, Color, ParentID)
            OUTPUT INSERTED.*
            VALUES (@userId, @name, @type, @icon, @color, @parentId)
        `, {
            userId,
            name: CategoryName, type: CategoryType || 'Expense',
            icon: Icon || 'tag', color: Color || '#8b5cf6',
            parentId: ParentID || null
        });
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT update category
router.put('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ success: false, error: 'Category ID galat hai' });

        const userId = req.user?.UserID || 1;
        const oldCatRes = await query('SELECT * FROM Categories WHERE CategoryID = @id AND UserID = @userId AND IsActive = 1', { id, userId });
        if (!oldCatRes.recordset.length) {
            return res.status(404).json({ success: false, error: 'Category nahi mili' });
        }
        const oldCat = oldCatRes.recordset[0];

        const { CategoryName, CategoryType, Icon, Color } = req.body || {};
        const name = (CategoryName !== undefined && String(CategoryName).trim()) ? String(CategoryName).trim() : oldCat.CategoryName;
        const type = (CategoryType !== undefined && String(CategoryType).trim()) ? String(CategoryType).trim() : oldCat.CategoryType;
        const icon = (Icon !== undefined) ? Icon : oldCat.Icon;
        const color = (Color !== undefined) ? Color : oldCat.Color;

        await query(`
            UPDATE Categories SET CategoryName = @name, CategoryType = @type, Icon = @icon, Color = @color
            WHERE CategoryID = @id AND UserID = @userId
        `, { id, userId, name, type, icon, color });
        res.json({ success: true, message: 'Category update ho gayi' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE category
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ success: false, error: 'Category ID galat hai' });

        const userId = req.user?.UserID || 1;
        const result = await query('UPDATE Categories SET IsActive = 0 WHERE CategoryID = @id AND UserID = @userId', { id, userId });
        if (!result.rowsAffected || result.rowsAffected[0] === 0) {
            return res.status(404).json({ success: false, error: 'Category nahi mili' });
        }
        res.json({ success: true, message: 'Category delete ho gayi' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
