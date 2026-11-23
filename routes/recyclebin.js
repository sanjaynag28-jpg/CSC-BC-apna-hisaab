// ==========================================================================
// RECYCLE BIN API — Soft-delete (IsActive = 0) items: list, restore, purge.
// Sirf whitelisted tables allowed hain (SQL injection suraksha).
// ==========================================================================
const express = require('express');
const router = express.Router();
const { query } = require('../database/db');

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const TYPES = {
    customer: {
        table: 'Customers', idCol: 'CustomerID',
        label: 'Customer (ग्राहक)', icon: 'user-check', color: '#3b82f6',
        sql: `SELECT CustomerID AS id, CustomerName AS name,
                     ISNULL(Phone, '') AS phone, ISNULL(Address, '') AS address,
                     CurrentBalance AS amount, UpdatedAt AS deletedAt
              FROM Customers WHERE IsActive = 0 AND UserID = @userId`
    },
    account: {
        table: 'Accounts', idCol: 'AccountID',
        label: 'Account (खाता)', icon: 'wallet', color: '#8b5cf6',
        sql: `SELECT AccountID AS id, AccountName AS name,
                     ISNULL(AccountType, '') AS accountType,
                     ISNULL(BankName, '') AS bankName,
                     CurrentBalance AS amount
              FROM Accounts WHERE IsActive = 0 AND UserID = @userId`
    },
    party: {
        table: 'Parties', idCol: 'PartyID',
        label: 'Party (व्यापारी)', icon: 'users', color: '#f59e0b',
        sql: `SELECT PartyID AS id, PartyName AS name,
                     ISNULL(PartyType, '') AS partyType, ISNULL(Phone, '') AS phone,
                     CurrentBalance AS amount
              FROM Parties WHERE IsActive = 0 AND UserID = @userId`
    },
    category: {
        table: 'Categories', idCol: 'CategoryID',
        label: 'Category (श्रेणी)', icon: 'tags', color: '#10b981',
        sql: `SELECT CategoryID AS id, CategoryName AS name,
                     ISNULL(CategoryType, '') AS categoryType
              FROM Categories WHERE IsActive = 0 AND UserID = @userId`
    },
    budget: {
        table: 'Budgets', idCol: 'BudgetID',
        label: 'Budget (बजट)', icon: 'target', color: '#ef4444',
        sql: `SELECT BudgetID AS id, BudgetName AS name,
                     BudgetMonth AS budgetMonth, BudgetYear AS budgetYear,
                     BudgetAmount AS amount
              FROM Budgets WHERE IsActive = 0 AND UserID = @userId`
    }
};

function buildDetail(type, row) {
    if (type === 'customer') return [row.phone, row.address].filter(Boolean).join(' • ') || 'Koi contact detail nahi';
    if (type === 'account') return [row.accountType, row.bankName].filter(Boolean).join(' • ') || 'Khata';
    if (type === 'party') return [row.partyType, row.phone].filter(Boolean).join(' • ') || 'Koi detail nahi';
    if (type === 'category') return row.categoryType || 'Category';
    if (type === 'budget') {
        const m = parseInt(row.budgetMonth) || 0;
        return `${MONTH_NAMES[m - 1] || '?'} ${row.budgetYear || ''}`.trim() || 'Budget';
    }
    return '';
}

// GET /api/recyclebin — saare deleted items
router.get('/', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const entries = Object.entries(TYPES);
        const results = await Promise.all(entries.map(([, t]) => query(t.sql, { userId })));

        const items = [];
        const counts = { total: 0 };
        entries.forEach(([type, meta], i) => {
            const rows = results[i].recordset || [];
            counts[type] = rows.length;
            counts.total += rows.length;
            rows.forEach(r => {
                items.push({
                    type,
                    typeLabel: meta.label,
                    icon: meta.icon,
                    color: meta.color,
                    id: r.id,
                    name: r.name,
                    detail: buildDetail(type, r),
                    amount: (r.amount !== undefined && r.amount !== null) ? Number(r.amount) : null,
                    deletedAt: r.deletedAt || null
                });
            });
        });

        res.json({ success: true, data: items, counts });
    } catch (err) {
        console.error('Recycle Bin list error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/recyclebin/restore — { type, id } se wapas lao
router.post('/restore', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const { type, id } = req.body || {};
        const meta = TYPES[type];
        const numId = parseInt(id);
        if (!meta || !numId) {
            return res.status(400).json({ success: false, error: 'Galat item type ya id' });
        }
        await query(`UPDATE ${meta.table} SET IsActive = 1 WHERE ${meta.idCol} = @id AND UserID = @userId`, { id: numId, userId });
        res.json({ success: true, message: `${meta.label} wapas aa gaya!` });
    } catch (err) {
        console.error('Recycle Bin restore error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/recyclebin/:type/:id — permanent delete
router.delete('/:type/:id', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const meta = TYPES[req.params.type];
        const numId = parseInt(req.params.id);
        if (!meta || !numId) {
            return res.status(400).json({ success: false, error: 'Galat item type ya id' });
        }
        await query(`DELETE FROM ${meta.table} WHERE ${meta.idCol} = @id AND UserID = @userId`, { id: numId, userId });
        res.json({ success: true, message: 'Hamesha ke liye mita diya gaya' });
    } catch (err) {
        // FK constraint (547) — juda hua data hai
        if (err && (err.number === 547 || /FOREIGN KEY|REFERENCE/i.test(err.message || ''))) {
            return res.status(409).json({
                success: false,
                error: 'Isse juda hua data hai (transactions/entries) — pehle wo hatayein ya ise Restore hi rakhein.'
            });
        }
        console.error('Recycle Bin permanent delete error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
