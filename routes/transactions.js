const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../database/db');
const { logAudit } = require('../utils/auditLogger');
const {
    VALID_TRANS_TYPES, parseId, parseOptionalId, todayLocal, isValidDateOnly,
    escapeLike, clampInt, monthRange, parseMoney
} = require('../utils/helpers');
const { registerGlobalTransaction, updateGlobalTransaction, deactivateGlobalTransaction } = require('../database/globalTxnRegistry');

// GET transactions with filters
router.get('/', async (req, res) => {
    try {
        const { startDate, endDate, type, accountId, categoryId, partyId, search } = req.query;

        const limit = clampInt(req.query.limit, 1, 500, 100);
        const offset = clampInt(req.query.offset, 0, 1000000, 0);

        const userId = req.user?.UserID || 1;
        let whereClause = 'WHERE t.UserID = @userId AND t.IsDeleted = 0';
        const params = { userId };

        if (startDate) { whereClause += ' AND t.TransDate >= @startDate'; params.startDate = startDate; }
        if (endDate) { whereClause += ' AND t.TransDate <= @endDate'; params.endDate = endDate; }
        if (type) { whereClause += ' AND t.TransType = @type'; params.type = type; }
        if (accountId) { whereClause += ' AND (t.AccountID = @accountId OR t.ToAccountID = @accountId)'; params.accountId = parseOptionalId(accountId); }
        if (categoryId) { whereClause += ' AND t.CategoryID = @categoryId'; params.categoryId = parseOptionalId(categoryId); }
        if (partyId) { whereClause += ' AND t.PartyID = @partyId'; params.partyId = parseOptionalId(partyId); }
        if (search) {
            whereClause += " AND (t.Description LIKE @search ESCAPE '\\' OR t.Reference LIKE @search ESCAPE '\\' OR t.Tags LIKE @search ESCAPE '\\' OR t.SNCode LIKE @search ESCAPE '\\' OR t.ModuleCode LIKE @search ESCAPE '\\')";
            params.search = `%${escapeLike(search)}%`;
        }

        const countResult = await query(`
            SELECT COUNT(*) as total FROM Transactions t ${whereClause}
        `, params);

        const totalsResult = await query(`
            SELECT
                ISNULL(SUM(CASE WHEN t.TransType = 'Income' THEN t.Amount ELSE 0 END), 0) as totalIncome,
                ISNULL(SUM(CASE WHEN t.TransType = 'Expense' THEN t.Amount ELSE 0 END), 0) as totalExpense,
                ISNULL(SUM(CASE WHEN t.TransType = 'Transfer' THEN t.Amount ELSE 0 END), 0) as totalTransfer,
                ISNULL(SUM(CASE WHEN t.TransType IN ('Loan Given', 'Loan Received', 'Loan Repay', 'Loan Recovery') THEN t.Amount ELSE 0 END), 0) as totalLoan,
                COUNT(*) as totalCount
            FROM Transactions t
            ${whereClause}
        `, params);

        const result = await query(`
            SELECT t.*,
                   a.AccountName, a.AccountType, a.Color as AccountColor,
                   ta.AccountName as ToAccountName,
                   c.CategoryName, c.Icon as CategoryIcon, c.Color as CategoryColor,
                   p.PartyName, p.Phone as PartyPhone
            FROM Transactions t
            LEFT JOIN Accounts a ON t.AccountID = a.AccountID
            LEFT JOIN Accounts ta ON t.ToAccountID = ta.AccountID
            LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
            LEFT JOIN Parties p ON t.PartyID = p.PartyID
            ${whereClause}
            ORDER BY t.TransDate DESC, ISNULL(t.TransTime, CAST(t.CreatedAt AS TIME)) DESC, t.CreatedAt DESC, t.TransactionID DESC
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `, { ...params, offset, limit });

        res.json({
            success: true,
            data: result.recordset,
            total: countResult.recordset[0].total,
            totals: totalsResult.recordset[0],
            limit,
            offset
        });
    } catch (err) {
        console.error('Transactions list error:', err);
        res.status(500).json({ success: false, error: 'Transactions load nahi ho paye' });
    }
});

// GET Dashboard Summary
router.get('/summary/dashboard', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const { start, end, m, y } = monthRange(req.query.month, req.query.year);

        const summary = await query(`
            SELECT
                ISNULL(SUM(CASE WHEN TransType = 'Income' THEN Amount ELSE 0 END), 0) as TotalIncome,
                ISNULL(SUM(CASE WHEN TransType = 'Expense' THEN Amount ELSE 0 END), 0) as TotalExpense,
                ISNULL(SUM(CASE WHEN TransType = 'Transfer' THEN Amount ELSE 0 END), 0) as TotalTransfer,
                ISNULL(SUM(CASE WHEN TransType = 'Loan Given' THEN Amount ELSE 0 END), 0) as TotalLoanGiven,
                ISNULL(SUM(CASE WHEN TransType = 'Loan Received' THEN Amount ELSE 0 END), 0) as TotalLoanReceived,
                ISNULL(SUM(CASE WHEN TransType = 'Loan Repay' THEN Amount ELSE 0 END), 0) as TotalLoanRepay,
                ISNULL(SUM(CASE WHEN TransType = 'Loan Recovery' THEN Amount ELSE 0 END), 0) as TotalLoanRecovery,
                COUNT(*) as TotalTransactions
            FROM Transactions
            WHERE TransDate >= @start AND TransDate <= @end AND UserID = @userId AND IsDeleted = 0
        `, { start, end, userId });

        const categoryWise = await query(`
            SELECT TOP 8 c.CategoryName, c.Color, c.Icon,
                   SUM(t.Amount) as Total, COUNT(*) as Count
            FROM Transactions t
            JOIN Categories c ON t.CategoryID = c.CategoryID
            WHERE t.TransType = 'Expense' AND t.TransDate >= @start AND t.TransDate <= @end AND t.UserID = @userId AND t.IsDeleted = 0
            GROUP BY c.CategoryName, c.Color, c.Icon
            ORDER BY Total DESC
        `, { start, end, userId });

        const dailyFlow = await query(`
            SELECT
                TransDate,
                ISNULL(SUM(CASE WHEN TransType = 'Income' THEN Amount ELSE 0 END), 0) as Income,
                ISNULL(SUM(CASE WHEN TransType = 'Expense' THEN Amount ELSE 0 END), 0) as Expense
            FROM Transactions
            WHERE TransDate >= @start AND TransDate <= @end AND UserID = @userId AND IsDeleted = 0
            GROUP BY TransDate
            ORDER BY TransDate
        `, { start, end, userId });

        const accountBalances = await query(`
            SELECT AccountID, AccountName, AccountType, CurrentBalance, Color, Icon
            FROM Accounts WHERE IsActive = 1 AND UserID = @userId
        `, { userId });

        const recentTrans = await query(`
            SELECT TOP 10 t.*, a.AccountName, c.CategoryName, c.Icon as CategoryIcon, c.Color as CategoryColor, p.PartyName
            FROM Transactions t
            LEFT JOIN Accounts a ON t.AccountID = a.AccountID
            LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
            LEFT JOIN Parties p ON t.PartyID = p.PartyID
            WHERE t.UserID = @userId AND t.IsDeleted = 0
            ORDER BY t.TransDate DESC, ISNULL(t.TransTime, CAST(t.CreatedAt AS TIME)) DESC, t.CreatedAt DESC, t.TransactionID DESC
        `, { userId });

        res.json({
            success: true,
            data: {
                summary: summary.recordset[0],
                categoryWise: categoryWise.recordset,
                dailyFlow: dailyFlow.recordset,
                accountBalances: accountBalances.recordset,
                recentTransactions: recentTrans.recordset,
                period: { month: m, year: y, startDate: start, endDate: end }
            }
        });
    } catch (err) {
        console.error('Dashboard summary error:', err);
        res.status(500).json({ success: false, error: 'Dashboard load nahi ho paya' });
    }
});

// GET single transaction
router.get('/:id', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const userId = req.user?.UserID || 1;
        if (!id) return res.status(400).json({ success: false, error: 'Transaction ID galat hai' });

        const result = await query(`
            SELECT t.*, a.AccountName, ta.AccountName as ToAccountName,
                   c.CategoryName, p.PartyName
            FROM Transactions t
            LEFT JOIN Accounts a ON t.AccountID = a.AccountID
            LEFT JOIN Accounts ta ON t.ToAccountID = ta.AccountID
            LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
            LEFT JOIN Parties p ON t.PartyID = p.PartyID
            WHERE t.TransactionID = @id AND t.UserID = @userId AND t.IsDeleted = 0
        `, { id, userId });
        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Transaction nahi mila' });
        }
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        console.error('Transaction fetch error:', err);
        res.status(500).json({ success: false, error: 'Transaction load nahi ho paya' });
    }
});

// POST create transaction
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const { TransDate, TransType, Amount, AccountID, ToAccountID, CategoryID, PartyID, Description, Reference, Tags } = req.body || {};

        const amount = parseMoney(Amount, NaN);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Amount galat hai' });
        }
        const accountId = parseOptionalId(AccountID);
        if (!accountId) return res.status(400).json({ success: false, error: 'Account select karo' });
        if (!TransType || !VALID_TRANS_TYPES.includes(TransType)) {
            return res.status(400).json({ success: false, error: 'Type select karo' });
        }
        const transDate = TransDate || todayLocal();
        if (!isValidDateOnly(transDate)) {
            return res.status(400).json({ success: false, error: 'Date galat hai' });
        }
        // ToAccountID sirf Transfer ke liye - warna paisa do account se kat jata tha
        const toAccountId = TransType === 'Transfer' ? parseOptionalId(ToAccountID) : null;
        if (TransType === 'Transfer' && !toAccountId) {
            return res.status(400).json({ success: false, error: 'Transfer me destination account select karo' });
        }
        if (toAccountId === accountId) {
            return res.status(400).json({ success: false, error: 'Source aur destination account same nahi ho sakta' });
        }

        // Ownership verification
        const accCheck = await query('SELECT AccountID FROM Accounts WHERE AccountID = @accountId AND UserID = @userId AND IsActive = 1', { accountId, userId });
        if (!accCheck.recordset.length) {
            return res.status(400).json({ success: false, error: 'Aapka chuna hua Account valid nahi hai' });
        }
        if (toAccountId) {
            const toAccCheck = await query('SELECT AccountID FROM Accounts WHERE AccountID = @toAccountId AND UserID = @userId AND IsActive = 1', { toAccountId, userId });
            if (!toAccCheck.recordset.length) {
                return res.status(400).json({ success: false, error: 'Aapka chuna hua Destination Account valid nahi hai' });
            }
        }
        const partyId = parseOptionalId(PartyID);
        if (partyId) {
            const partyCheck = await query('SELECT PartyID FROM Parties WHERE PartyID = @partyId AND UserID = @userId AND IsActive = 1', { partyId, userId });
            if (!partyCheck.recordset.length) {
                return res.status(400).json({ success: false, error: 'Aapki chuni hui Party valid nahi hai' });
            }
        }
        const categoryId = parseOptionalId(CategoryID);
        if (categoryId) {
            const catCheck = await query('SELECT CategoryID FROM Categories WHERE CategoryID = @categoryId AND (UserID = @userId OR UserID IS NULL) AND IsActive = 1', { categoryId, userId });
            if (!catCheck.recordset.length) {
                return res.status(400).json({ success: false, error: 'Aapki chuni hui Category valid nahi hai' });
            }
        }

        const result = await withTransaction(async (tQuery) => {
            const insertRes = await tQuery(`
                INSERT INTO Transactions (TransDate, TransType, Amount, AccountID, ToAccountID, CategoryID, PartyID, Description, Reference, Tags, UserID)
                OUTPUT INSERTED.*
                VALUES (@date, @type, @amount, @accountId, @toAccountId, @categoryId, @partyId, @desc, @ref, @tags, @userId)
            `, {
                date: transDate,
                type: TransType, amount: amount,
                accountId: accountId,
                toAccountId: toAccountId,
                categoryId: parseOptionalId(CategoryID),
                partyId: parseOptionalId(PartyID),
                desc: Description || null, ref: Reference || null, tags: Tags || null,
                userId
            });

            // Update account balance
            await tQuery('EXEC sp_UpdateAccountBalance @id', { id: accountId });
            if (toAccountId) {
                await tQuery('EXEC sp_UpdateAccountBalance @id', { id: toAccountId });
            }
            // Update party balance if applicable
            const partyId = parseOptionalId(PartyID);
            if (partyId) {
                await tQuery('EXEC sp_UpdatePartyBalance @id', { id: partyId });
            }

            const inserted = insertRes.recordset[0];

            await logAudit({
                action: 'CREATE',
                module: 'Transactions',
                tableName: 'Transactions',
                recordId: inserted.TransactionID,
                entityName: Description || `${TransType} Transaction`,
                amount: amount,
                description: `${TransType}: ₹${amount.toLocaleString('en-IN')} (${Description || 'Entry'})`,
                newData: inserted,
                details: `Type: ${TransType}, Amount: ${amount}, AccountID: ${accountId}, ToAccountID: ${toAccountId || 'N/A'}, CategoryID: ${CategoryID || 'N/A'}, Reference: ${Reference || 'N/A'}`,
                userId,
                tQuery
            });

            // Universal Global Transaction Registry (Rule 4 Atomic Registration)
            const regInfo = await registerGlobalTransaction({
                sourceModule: 'Cashbook',
                recordId: inserted.TransactionID,
                entityName: Description || `${TransType} Transaction`,
                amount: amount,
                transDate: transDate,
                createdAt: new Date(),
                userId
            }, tQuery);

            inserted.GlobalSerialNo = regInfo.globalSerialNo;
            inserted.SNCode = regInfo.snCode;
            inserted.ModuleCode = regInfo.moduleCode;

            return inserted;
        });

        res.json({ success: true, data: result, id: result.TransactionID, transactionId: result.TransactionID });
    } catch (err) {
        console.error('Transaction create error:', err);
        res.status(500).json({ success: false, error: 'Transaction save nahi ho paya' });
    }
});

// PUT update transaction
router.put('/:id', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const userId = req.user?.UserID || 1;
        if (!id) return res.status(400).json({ success: false, error: 'Transaction ID galat hai' });

        const { TransDate, TransType, Amount, AccountID, ToAccountID, CategoryID, PartyID, Description, Reference, Tags } = req.body || {};

        const result = await withTransaction(async (tQuery) => {
            // Get old transaction to update old accounts
            const oldTrans = await tQuery('SELECT * FROM Transactions WHERE TransactionID = @id AND UserID = @userId', { id, userId });
            if (!oldTrans.recordset.length) {
                throw Object.assign(new Error('Transaction nahi mila'), { status: 404 });
            }
            const oldRecord = oldTrans.recordset[0];

            // Body ke saath merge karo - partial edit pe NOT NULL violation hota tha
            const transDate = TransDate !== undefined && TransDate !== null && TransDate !== ''
                ? TransDate : oldRecord.TransDate;
            if (!isValidDateOnly(transDate)) {
                throw Object.assign(new Error('Date galat hai'), { status: 400 });
            }
            const type = TransType !== undefined && TransType !== null && TransType !== ''
                ? TransType : oldRecord.TransType;
            if (!VALID_TRANS_TYPES.includes(type)) {
                throw Object.assign(new Error('Type galat hai'), { status: 400 });
            }
            let amount = parseMoney(Amount, NaN);
            if (!Number.isFinite(amount) || amount <= 0) {
                amount = parseFloat(oldRecord.Amount);
                if (!Number.isFinite(amount) || amount <= 0) {
                    throw Object.assign(new Error('Amount galat hai'), { status: 400 });
                }
            }
            const accountId = AccountID !== undefined && AccountID !== null && AccountID !== ''
                ? parseOptionalId(AccountID) : oldRecord.AccountID;
            if (!accountId) {
                throw Object.assign(new Error('Account select karo'), { status: 400 });
            }
            if (accountId !== oldRecord.AccountID) {
                const accCheck = await tQuery('SELECT AccountID FROM Accounts WHERE AccountID = @accountId AND UserID = @userId AND IsActive = 1', { accountId, userId });
                if (!accCheck.recordset.length) {
                    throw Object.assign(new Error('Aapka chuna hua Account valid nahi hai'), { status: 400 });
                }
            }
            let toAccountId = null;
            if (type === 'Transfer') {
                toAccountId = (ToAccountID !== undefined && ToAccountID !== null && ToAccountID !== '')
                    ? parseOptionalId(ToAccountID)
                    : (oldRecord.TransType === 'Transfer' ? oldRecord.ToAccountID : null);

                if (!toAccountId) {
                    throw Object.assign(new Error('Transfer me destination account select karo'), { status: 400 });
                }
                if (toAccountId === accountId) {
                    throw Object.assign(new Error('Source aur destination account same nahi ho sakta'), { status: 400 });
                }
                if (toAccountId !== oldRecord.ToAccountID) {
                    const toAccCheck = await tQuery('SELECT AccountID FROM Accounts WHERE AccountID = @toAccountId AND UserID = @userId AND IsActive = 1', { toAccountId, userId });
                    if (!toAccCheck.recordset.length) {
                        throw Object.assign(new Error('Aapka chuna hua Destination Account valid nahi hai'), { status: 400 });
                    }
                }
            }
            const categoryId = CategoryID !== undefined
                ? parseOptionalId(CategoryID) : oldRecord.CategoryID;
            if (categoryId && categoryId !== oldRecord.CategoryID) {
                const catCheck = await tQuery('SELECT CategoryID FROM Categories WHERE CategoryID = @categoryId AND (UserID = @userId OR UserID IS NULL) AND IsActive = 1', { categoryId, userId });
                if (!catCheck.recordset.length) {
                    throw Object.assign(new Error('Aapki chuni hui Category valid nahi hai'), { status: 400 });
                }
            }
            const partyId = PartyID !== undefined
                ? parseOptionalId(PartyID) : oldRecord.PartyID;
            if (partyId && partyId !== oldRecord.PartyID) {
                const partyCheck = await tQuery('SELECT PartyID FROM Parties WHERE PartyID = @partyId AND UserID = @userId AND IsActive = 1', { partyId, userId });
                if (!partyCheck.recordset.length) {
                    throw Object.assign(new Error('Aapki chuni hui Party valid nahi hai'), { status: 400 });
                }
            }

            const updateRes = await tQuery(`
                UPDATE Transactions SET
                    TransDate = @date, TransType = @type, Amount = @amount,
                    AccountID = @accountId, ToAccountID = @toAccountId,
                    CategoryID = @categoryId, PartyID = @partyId,
                    Description = @desc, Reference = @ref, Tags = @tags, UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE TransactionID = @id AND UserID = @userId
            `, {
                id,
                userId,
                date: transDate, type, amount,
                accountId, toAccountId, categoryId, partyId,
                desc: Description !== undefined ? (Description || null) : oldRecord.Description,
                ref: Reference !== undefined ? (Reference || null) : oldRecord.Reference,
                tags: Tags !== undefined ? (Tags || null) : oldRecord.Tags
            });

            // Update affected accounts (purane + naye dono)
            const accountsToUpdate = new Set(
                [accountId, oldRecord.AccountID, toAccountId, oldRecord.ToAccountID]
                    .map(v => parseOptionalId(v))
                    .filter(Boolean)
            );
            for (const accId of accountsToUpdate) {
                await tQuery('EXEC sp_UpdateAccountBalance @id', { id: accId });
            }

            // Update parties (number parse karo - string '5' aur number 5 alag set me the)
            const partiesToUpdate = new Set(
                [partyId, oldRecord.PartyID]
                    .map(v => parseOptionalId(v))
                    .filter(Boolean)
            );
            for (const pId of partiesToUpdate) {
                await tQuery('EXEC sp_UpdatePartyBalance @id', { id: pId });
            }

            const updated = updateRes.recordset[0];

            await logAudit({
                action: 'UPDATE',
                module: 'Transactions',
                tableName: 'Transactions',
                recordId: updated.TransactionID,
                entityName: Description || oldRecord.Description || `${type} Transaction`,
                amount: amount,
                description: `Transaction Update Kiya Gaya: ${type} ₹${amount.toLocaleString('en-IN')}`,
                oldData: oldRecord,
                newData: updated,
                details: `Purana: ₹${oldRecord.Amount} (${oldRecord.TransType}) -> Naya: ₹${amount} (${type})`,
                userId,
                tQuery
            });

            // Update Universal Global Transaction Registry if registered
            try {
                await updateGlobalTransaction({
                    sourceModule: 'Cashbook',
                    recordId: id,
                    entityName: Description || oldRecord.Description || `${type} Transaction`,
                    amount: amount,
                    transDate: transDate
                }, tQuery);
            } catch (regErr) {
                console.error('Failed to update UniversalTxnRegistry for Cashbook:', regErr);
                throw new Error('Failed to update UniversalTxnRegistry for Cashbook: ' + regErr.message);
            }

            return updated;
        });

        res.json({ success: true, data: result, id: result.TransactionID, transactionId: result.TransactionID });
    } catch (err) {
        console.error('Transaction update error:', err);
        const status = err.status || 500;
        res.status(status).json({ success: false, error: err.status ? err.message : 'Transaction update nahi ho paya' });
    }
});

// DELETE transaction
router.delete('/:id', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const userId = req.user?.UserID || 1;
        if (!id) return res.status(400).json({ success: false, error: 'Transaction ID galat hai' });

        await withTransaction(async (tQuery) => {
            const trans = await tQuery('SELECT * FROM Transactions WHERE TransactionID = @id AND UserID = @userId', { id, userId });
            if (trans.recordset.length === 0) {
                throw Object.assign(new Error('Transaction nahi mila'), { status: 404 });
            }
            const oldRecord = trans.recordset[0];

            // Auto-linked module transaction protection (F6 Fix)
            const refStr = String(oldRecord.Reference || '');
            const tagsStr = String(oldRecord.Tags || '');
            const modCode = String(oldRecord.ModuleCode || '');

            if (refStr.startsWith('BILL-')) {
                throw Object.assign(new Error('Bill-linked transaction direct delete nahi ho sakta - pehle Bills module se bill delete karein.'), { status: 400 });
            }
            if (refStr.startsWith('BP-') || tagsStr.includes('BP') || modCode.startsWith('BP-')) {
                throw Object.assign(new Error('Bill & EMI Payment se linked transaction direct delete nahi ho sakta - isko Bill & EMI Payments module se manage/delete karein.'), { status: 400 });
            }
            if (refStr.startsWith('APP-') || tagsStr.includes('CSC_FEE_IN') || tagsStr.includes('CSC_GOVT_FEE_OUT') || tagsStr.includes('UPPCL_BILL') || modCode.startsWith('CSC-')) {
                throw Object.assign(new Error('CSC Aavedan se linked transaction direct delete nahi ho sakta - isko CSC Tracker se manage/delete karein.'), { status: 400 });
            }
            if (refStr.startsWith('INV-') || modCode.startsWith('INV-')) {
                throw Object.assign(new Error('Invoice se linked transaction direct delete nahi ho sakta - isko Billing module se manage/delete karein.'), { status: 400 });
            }
            if (refStr.startsWith('BC-') || modCode.startsWith('BC-')) {
                throw Object.assign(new Error('BC Counter se linked transaction direct delete nahi ho sakta - isko BC Counter se manage karein.'), { status: 400 });
            }
            if (refStr.startsWith('KHATA-') || refStr.startsWith('KH-') || modCode.startsWith('KH-')) {
                throw Object.assign(new Error('Khatabook se auto-linked transaction direct delete nahi ho sakta - isko Khatabook se manage karein.'), { status: 400 });
            }

            await tQuery('DELETE FROM Transactions WHERE TransactionID = @id AND UserID = @userId', { id, userId });

            // Update balances
            await tQuery('EXEC sp_UpdateAccountBalance @id', { id: oldRecord.AccountID });
            if (oldRecord.ToAccountID) {
                await tQuery('EXEC sp_UpdateAccountBalance @id', { id: oldRecord.ToAccountID });
            }
            if (oldRecord.PartyID) {
                await tQuery('EXEC sp_UpdatePartyBalance @id', { id: oldRecord.PartyID });
            }

            await logAudit({
                action: 'DELETE',
                module: 'Transactions',
                tableName: 'Transactions',
                recordId: id,
                entityName: oldRecord.Description || `${oldRecord.TransType} Transaction`,
                amount: parseFloat(oldRecord.Amount) || 0,
                description: `Transaction Delete Kiya Gaya: ${oldRecord.TransType} ₹${parseFloat(oldRecord.Amount || 0).toLocaleString('en-IN')}`,
                oldData: oldRecord,
                details: `Purana Transaction ID #${oldRecord.TransactionID} (${oldRecord.TransType}, Date: ${oldRecord.TransDate}, Ref: ${oldRecord.Reference || 'N/A'}) delete ho gaya.`,
                userId,
                tQuery
            });

            try {
                await deactivateGlobalTransaction('Cashbook', id, tQuery);
            } catch (regErr) {
                console.error('Failed to deactivate global transaction for Cashbook:', regErr);
                throw new Error('Failed to deactivate global transaction for Cashbook: ' + regErr.message);
            }
        });

        res.json({ success: true, message: 'Transaction delete ho gaya' });
    } catch (err) {
        console.error('Transaction delete error:', err);
        const status = err.status || 500;
        res.status(status).json({ success: false, error: err.status ? err.message : 'Transaction delete nahi ho paya' });
    }
});

module.exports = router;
