const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../database/db');
const { logAudit } = require('../utils/auditLogger');

function parseId(value) {
    const id = parseInt(value, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
}

// GET all parties
router.get('/', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const result = await query(`
            SELECT p.*,
                   COUNT(t.TransactionID) as TransactionCount,
                   ISNULL(SUM(CASE WHEN t.TransType = 'Loan Given' THEN t.Amount ELSE 0 END), 0) as TotalLoanGiven,
                   ISNULL(SUM(CASE WHEN t.TransType = 'Loan Received' THEN t.Amount ELSE 0 END), 0) as TotalLoanReceived,
                   ISNULL(SUM(CASE WHEN t.TransType = 'Loan Repay' THEN t.Amount ELSE 0 END), 0) as TotalRepaid,
                   ISNULL(SUM(CASE WHEN t.TransType = 'Loan Recovery' THEN t.Amount ELSE 0 END), 0) as TotalRecovery
            FROM Parties p
            LEFT JOIN Transactions t ON p.PartyID = t.PartyID AND t.UserID = @userId AND t.IsDeleted = 0
            WHERE p.IsActive = 1 AND p.UserID = @userId
            GROUP BY p.PartyID, p.UserID, p.PartyName, p.PartyType, p.Phone, p.Email, p.Address,
                     p.OpeningBalance, p.CurrentBalance, p.Notes, p.IsActive, p.CreatedAt, p.UpdatedAt
            ORDER BY ABS(p.CurrentBalance) DESC
        `, { userId });
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('Parties list error:', err);
        res.status(500).json({ success: false, error: 'Parties load nahi ho paye' });
    }
});

// POST create party
router.post('/', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const { PartyName, PartyType, Phone, Email, Address, OpeningBalance, Notes } = req.body || {};
        if (!PartyName || !String(PartyName).trim()) {
            return res.status(400).json({ success: false, error: 'Party name zaroori hai' });
        }
        const opening = OpeningBalance === undefined || OpeningBalance === null || OpeningBalance === '' ? 0 : parseFloat(OpeningBalance);
        if (isNaN(opening)) {
            return res.status(400).json({ success: false, error: 'Opening balance galat hai' });
        }

        const result = await query(`
            INSERT INTO Parties (PartyName, PartyType, Phone, Email, Address, OpeningBalance, CurrentBalance, Notes, UserID)
            OUTPUT INSERTED.*
            VALUES (@name, @type, @phone, @email, @address, @opening, @opening, @notes, @userId)
        `, {
            name: String(PartyName).trim(), type: PartyType || 'Other',
            phone: Phone || null, email: Email || null, address: Address || null,
            opening: opening, notes: Notes || null,
            userId
        });
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        console.error('Party create error:', err);
        res.status(500).json({ success: false, error: 'Party save nahi ho payi' });
    }
});

// PUT update party
router.put('/:id', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const userId = req.user.UserID;
        if (!id) return res.status(400).json({ success: false, error: 'Party ID galat hai' });

        const { PartyName, PartyType, Phone, Email, Address, OpeningBalance, Notes } = req.body || {};

        await withTransaction(async (tQuery) => {
            const existing = await tQuery('SELECT * FROM Parties WHERE PartyID = @id AND UserID = @userId', { id, userId });
            if (existing.recordset.length === 0) {
                throw Object.assign(new Error('Party nahi mili'), { status: 404 });
            }
            const old = existing.recordset[0];

            // Field na bheja ho to purana value rakho (warna opening udhaar wipe ho jata tha)
            const name = PartyName !== undefined ? String(PartyName).trim() : old.PartyName;
            const type = PartyType !== undefined ? (PartyType || 'Other') : old.PartyType;
            const phone = Phone !== undefined ? (Phone || null) : old.Phone;
            const email = Email !== undefined ? (Email || null) : old.Email;
            const address = Address !== undefined ? (Address || null) : old.Address;
            let opening = old.OpeningBalance;
            if (OpeningBalance !== undefined && OpeningBalance !== null && OpeningBalance !== '') {
                const parsed = parseFloat(OpeningBalance);
                if (isNaN(parsed)) {
                    throw Object.assign(new Error('Opening balance galat hai'), { status: 400 });
                }
                opening = parsed;
            }
            const notes = Notes !== undefined ? (Notes || null) : old.Notes;

            if (!name) {
                throw Object.assign(new Error('Party name zaroori hai'), { status: 400 });
            }

            await tQuery(`
                UPDATE Parties SET
                    PartyName = @name, PartyType = @type, Phone = @phone, Email = @email,
                    Address = @address, OpeningBalance = @opening, Notes = @notes, UpdatedAt = GETDATE()
                WHERE PartyID = @id AND UserID = @userId
            `, { id, name, type, phone, email, address, opening, notes, userId });

            // Balance recalc usi transaction me
            await tQuery('EXEC sp_UpdatePartyBalance @id', { id });

            await logAudit({
                action: 'UPDATE',
                module: 'Parties',
                tableName: 'Parties',
                recordId: id,
                entityName: name,
                amount: opening,
                description: `Party update hui: ${name}`,
                oldData: old,
                newData: { PartyName: name, PartyType: type, OpeningBalance: opening },
                details: `Name: ${old.PartyName} -> ${name}`,
                tQuery
            });
        });

        res.json({ success: true, message: 'Party update ho gayi' });
    } catch (err) {
        console.error('Party update error:', err);
        const status = err.status || 500;
        res.status(status).json({ success: false, error: err.status ? err.message : 'Party update nahi ho gayi' });
    }
});

// DELETE party
router.delete('/:id', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const userId = req.user.UserID;
        if (!id) return res.status(400).json({ success: false, error: 'Party ID galat hai' });

        const result = await query(
            'UPDATE Parties SET IsActive = 0, UpdatedAt = GETDATE() WHERE PartyID = @id AND UserID = @userId',
            { id, userId }
        );
        if (!result.rowsAffected || result.rowsAffected[0] === 0) {
            return res.status(404).json({ success: false, error: 'Party nahi mili' });
        }
        res.json({ success: true, message: 'Party delete ho gayi' });
    } catch (err) {
        console.error('Party delete error:', err);
        res.status(500).json({ success: false, error: 'Party delete nahi ho gayi' });
    }
});

// GET party transactions
router.get('/:id/transactions', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const userId = req.user.UserID;
        if (!id) return res.status(400).json({ success: false, error: 'Party ID galat hai' });

        const result = await query(`
            SELECT t.*, a.AccountName, c.CategoryName
            FROM Transactions t
            LEFT JOIN Accounts a ON t.AccountID = a.AccountID
            LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
            WHERE t.PartyID = @id AND t.UserID = @userId AND t.IsDeleted = 0
            ORDER BY t.TransDate DESC
        `, { id, userId });
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('Party transactions error:', err);
        res.status(500).json({ success: false, error: 'Transactions load nahi ho paye' });
    }
});

module.exports = router;
