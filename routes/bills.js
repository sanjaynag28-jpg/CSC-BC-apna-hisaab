const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../database/db');
const { logAudit } = require('../utils/auditLogger');
const { parseId, parseOptionalId, todayLocal, isValidDateOnly, parseMoney } = require('../utils/helpers');
const { registerGlobalTransaction, deactivateGlobalTransaction } = require('../database/globalTxnRegistry');

// GET all bills
router.get('/', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const result = await query(`
            SELECT b.*, p.PartyName, c.CategoryName, c.Icon as CategoryIcon, c.Color as CategoryColor, a.AccountName
            FROM Bills b
            LEFT JOIN Parties p ON b.PartyID = p.PartyID
            LEFT JOIN Categories c ON b.CategoryID = c.CategoryID
            LEFT JOIN Accounts a ON b.AccountID = a.AccountID
            WHERE b.UserID = @userId
            ORDER BY b.IsPaid ASC, b.DueDate ASC
        `, { userId });
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('Bills list error:', err);
        res.status(500).json({ success: false, error: 'Bills load nahi ho paye' });
    }
});

// GET single bill by ID
router.get('/:id', async (req, res, next) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return next();
        const userId = req.user.UserID;

        const result = await query(`
            SELECT b.*, p.PartyName, c.CategoryName, c.Icon as CategoryIcon, c.Color as CategoryColor, a.AccountName
            FROM Bills b
            LEFT JOIN Parties p ON b.PartyID = p.PartyID
            LEFT JOIN Categories c ON b.CategoryID = c.CategoryID
            LEFT JOIN Accounts a ON b.AccountID = a.AccountID
            WHERE b.BillID = @id AND b.UserID = @userId
        `, { id, userId });

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Bill nahi mila' });
        }
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        console.error('Bill fetch error:', err);
        res.status(500).json({ success: false, error: 'Bill load nahi ho paya' });
    }
});

// Overdue sweep - GET read-only hona chahiye, isliye alag scheduled route
router.post('/refresh-overdue', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const result = await query(`
            UPDATE Bills SET Status = 'Overdue'
            WHERE IsPaid = 0 AND DueDate < CAST(GETDATE() AS DATE) AND Status = 'Pending' AND UserID = @userId
        `, { userId });
        res.json({ success: true, updated: result.rowsAffected ? result.rowsAffected[0] : 0 });
    } catch (err) {
        console.error('Bills overdue refresh error:', err);
        res.status(500).json({ success: false, error: 'Overdue refresh nahi ho paya' });
    }
});

// POST create bill
router.post('/', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const { BillName, BillType, Amount, DueDate, PartyID, AccountID, CategoryID, Notes, IsRecurring, Frequency } = req.body || {};

        if (!BillName || !String(BillName).trim()) {
            return res.status(400).json({ success: false, error: 'Bill name zaroori hai' });
        }
        const amount = parseMoney(Amount, NaN);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Amount galat hai' });
        }
        if (!DueDate || !isValidDateOnly(DueDate)) {
            return res.status(400).json({ success: false, error: 'Due date galat hai' });
        }

        let newBill = null;
        await withTransaction(async (tQuery) => {
            const result = await tQuery(`
                INSERT INTO Bills (UserID, BillName, BillType, Amount, DueDate, PartyID, AccountID, CategoryID, Notes, IsRecurring, Frequency)
                OUTPUT INSERTED.*
                VALUES (@userId, @name, @type, @amount, @dueDate, @partyId, @accountId, @categoryId, @notes, @isRecurring, @frequency)
            `, {
                userId,
                name: String(BillName).trim(), type: BillType || 'Other', amount: amount,
                dueDate: DueDate, partyId: parseOptionalId(PartyID), accountId: parseOptionalId(AccountID),
                categoryId: parseOptionalId(CategoryID), notes: Notes || null,
                isRecurring: IsRecurring ? 1 : 0, frequency: Frequency || null
            });
            newBill = result.recordset[0];

            // === UNIVERSAL GLOBAL SERIAL NUMBER REGISTRATION ===
            // Same transaction me — warna bill save ho jata aur SN register fail hone par orphan reh jata.
            const regInfo = await registerGlobalTransaction({
                sourceModule: 'Bills',
                recordId: newBill.BillID,
                entityName: String(BillName).trim(),
                amount: amount,
                transDate: DueDate,
                createdAt: new Date(),
                userId
            }, tQuery);
            newBill.GlobalSerialNo = regInfo.globalSerialNo;
            newBill.SNCode = regInfo.snCode;
            newBill.ModuleCode = regInfo.moduleCode;
        });

        await logAudit({
            action: 'CREATE',
            module: 'Bills',
            tableName: 'Bills',
            recordId: newBill.BillID,
            entityName: String(BillName).trim(),
            amount: amount,
            description: `Naya Bill Joda Gaya: ${BillName} (₹${amount.toLocaleString('en-IN')})`,
            newData: newBill,
            details: `Bill: ${BillName}, Type: ${BillType || 'Other'}, Amount: ₹${amount}, DueDate: ${DueDate}`
        });

        res.json({ success: true, data: newBill });
    } catch (err) {
        console.error('Bill create error:', err);
        res.status(500).json({ success: false, error: 'Bill save nahi ho paya' });
    }
});

// PUT mark bill as paid
router.put('/:id/pay', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const { PaidDate, AccountID } = req.body || {};
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'Bill ID galat hai' });

        const paidDate = PaidDate || todayLocal();
        if (!isValidDateOnly(paidDate)) {
            return res.status(400).json({ success: false, error: 'Paid date galat hai' });
        }
        const accountId = parseOptionalId(AccountID);

        // Poora payment ek transaction me - warna bill "Paid" ho jata aur paisa record nahi hota
        await withTransaction(async (tQuery) => {
            // Lock ke saath re-read karo - do concurrent request me bill dobara pay na ho
            const existing = await tQuery('SELECT * FROM Bills WITH (UPDLOCK, HOLDLOCK) WHERE BillID = @id AND UserID = @userId', { id, userId });
            if (existing.recordset.length === 0) {
                throw Object.assign(new Error('Bill nahi mila'), { status: 404 });
            }
            if (existing.recordset[0].IsPaid) {
                throw Object.assign(new Error('Yeh bill pehle se paid hai. Dobara payment nahi ho sakti.'), { status: 400 });
            }
            const b = existing.recordset[0];

            // Account ownership check - dusre user ka account select na ho jaye
            if (accountId) {
                const accCheck = await tQuery('SELECT AccountID FROM Accounts WHERE AccountID = @accountId AND UserID = @userId AND IsActive = 1', { accountId, userId });
                if (!accCheck.recordset.length) {
                    throw Object.assign(new Error('Aapka chuna hua Account valid nahi hai'), { status: 400 });
                }
            }

            await tQuery(`UPDATE Bills SET IsPaid = 1, Status = 'Paid', PaidDate = @paidDate WHERE BillID = @id AND UserID = @userId`,
                { id, userId, paidDate });

            // Auto-create transaction if account provided with Rule 1 Identity
            if (accountId) {
                await tQuery(`
                    INSERT INTO Transactions (
                        UserID, TransDate, TransType, Amount, AccountID, CategoryID, PartyID, Description, Reference,
                        GlobalSerialNo, SNCode, ModuleCode,
                        SourceModule, SourceID, LineType
                    )
                    VALUES (
                        @userId, @date, 'Expense', @amount, @accountId, @categoryId, @partyId, @desc, @ref,
                        @GlobalSerialNo, @SNCode, @ModuleCode,
                        'Bills', @id, 'BILL_EXP'
                    )
                `, {
                    userId,
                    id,
                    date: paidDate,
                    amount: b.Amount, accountId: accountId,
                    categoryId: b.CategoryID || null, partyId: b.PartyID || null,
                    desc: `Bill Payment: ${b.BillName}`,
                    ref: `BILL-${id}`,
                    GlobalSerialNo: b.GlobalSerialNo || null,
                    SNCode: b.SNCode || null,
                    ModuleCode: b.ModuleCode || null
                });
                await tQuery('EXEC sp_UpdateAccountBalance @id', { id: accountId });
            }

            await logAudit({
                action: 'PAYMENT',
                module: 'Bills',
                tableName: 'Bills',
                recordId: id,
                entityName: b.BillName,
                amount: parseFloat(b.Amount) || 0,
                description: `Bill Paid Mark Hua: ${b.BillName} (₹${parseFloat(b.Amount || 0).toLocaleString('en-IN')})`,
                oldData: { IsPaid: 0, Status: b.Status },
                newData: { IsPaid: 1, Status: 'Paid', PaidDate: paidDate, AccountID: accountId },
                details: `Bill "${b.BillName}" (₹${b.Amount}) paid mark kiya gaya.`,
                tQuery
            });
        });

        res.json({ success: true, message: 'Bill paid mark ho gaya' });
    } catch (err) {
        console.error('Bill pay error:', err);
        const status = err.status || 500;
        res.status(status).json({ success: false, error: err.status ? err.message : 'Bill pay nahi ho paya' });
    }
});

// DELETE bill
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'Bill ID galat hai' });

        await withTransaction(async (tQuery) => {
            const billCheck = await tQuery('SELECT * FROM Bills WHERE BillID = @id AND UserID = @userId', { id, userId });
            if (billCheck.recordset.length === 0) {
                throw Object.assign(new Error('Bill nahi mila'), { status: 404 });
            }
            const oldBill = billCheck.recordset[0];

            // Rule 1 Identity Deletion for linked bill expense transaction
            const linkedTrans = await tQuery(
                'SELECT TransactionID, AccountID FROM Transactions WHERE UserID = @userId AND SourceModule = \'Bills\' AND SourceID = @id',
                { id, userId }
            );
            const affectedAccIds = new Set();
            for (const row of linkedTrans.recordset) {
                if (row.AccountID) affectedAccIds.add(row.AccountID);
            }
            if (linkedTrans.recordset.length > 0) {
                await tQuery(
                    'DELETE FROM Transactions WHERE UserID = @userId AND SourceModule = \'Bills\' AND SourceID = @id',
                    { id, userId }
                );
            }

            await tQuery('DELETE FROM Bills WHERE BillID = @id AND UserID = @userId', { id, userId });

            for (const accId of affectedAccIds) {
                await tQuery('EXEC sp_UpdateAccountBalance @id', { id: accId });
            }

            await logAudit({
                action: 'DELETE',
                module: 'Bills',
                tableName: 'Bills',
                recordId: id,
                entityName: oldBill.BillName,
                amount: parseFloat(oldBill.Amount) || 0,
                description: `Bill Delete Kiya Gaya: ${oldBill.BillName} (₹${parseFloat(oldBill.Amount || 0).toLocaleString('en-IN')})`,
                oldData: oldBill,
                details: `Bill "${oldBill.BillName}" (Amount: ₹${oldBill.Amount}, DueDate: ${oldBill.DueDate}) delete kiya gaya.`,
                tQuery
            });

            try {
                await deactivateGlobalTransaction('Bills', id, tQuery);
            } catch (regErr) {
                console.error('Failed to deactivate global transaction for Bills:', regErr);
                throw new Error('Failed to deactivate global transaction for Bills: ' + regErr.message);
            }
        });
        res.json({ success: true, message: 'Bill delete ho gaya' });
    } catch (err) {
        console.error('Bill delete error:', err);
        const status = err.status || 500;
        res.status(status).json({ success: false, error: err.status ? err.message : 'Bill delete nahi ho paya' });
    }
});

module.exports = router;
