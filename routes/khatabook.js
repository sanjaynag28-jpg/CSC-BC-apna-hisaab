const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../database/db');
const { processKhataAfterChange, deleteKhataWithSN } = require('../database/khataEngine');
const { logAudit } = require('../utils/auditLogger');
const { todayLocal } = require('../utils/helpers');
const { resolveOrCreateCustomer } = require('../database/customerAutoRegister');
const { registerGlobalTransaction, deactivateGlobalTransaction } = require('../database/globalTxnRegistry');

// Base root redirect to summary
router.get('/', (req, res) => res.redirect('/api/khatabook/summary'));

// GET overall Khatabook summary
router.get('/summary', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const stats = await query(`
            SELECT 
                COUNT(*) as TotalCustomers,
                ISNULL(SUM(CASE WHEN CurrentBalance > 0 THEN CurrentBalance ELSE 0 END), 0) as TotalToReceive,
                ISNULL(SUM(CASE WHEN CurrentBalance < 0 THEN ABS(CurrentBalance) ELSE 0 END), 0) as TotalToPay,
                ISNULL(SUM(CurrentBalance), 0) as NetBalance,
                (SELECT COUNT(*) FROM KhataEntries WHERE UserID = @userId) as TotalEntries,
                (SELECT ISNULL(SUM(Amount), 0) FROM KhataEntries WHERE EntryType = 'Gave' AND UserID = @userId) as TotalGaveAmount,
                (SELECT ISNULL(SUM(Amount), 0) FROM KhataEntries WHERE EntryType = 'Got' AND UserID = @userId) as TotalGotAmount
            FROM Customers
            WHERE IsActive = 1 AND UserID = @userId
        `, { userId });

        res.json({
            success: true,
            data: stats.recordset[0] || {}
        });
    } catch (err) {
        console.error('Error fetching khata summary:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET customer list for Khatabook (quick switcher with balances)
router.get('/customers', async (req, res) => {
    try {
        const { search, filter } = req.query;
        const userId = req.user?.UserID || 1;
        let whereClauses = ['c.IsActive = 1', 'c.UserID = @userId'];
        let params = { userId };

        if (search && search.trim() !== '') {
            const rawSearch = search.trim();
            const numericId = parseInt(rawSearch.replace(/^[#c]/i, '').trim(), 10);
            if (!isNaN(numericId) && numericId > 0) {
                whereClauses.push('(c.CustomerID = @searchId OR c.CustomerName LIKE @search OR c.Phone LIKE @search OR c.AadhaarNumber LIKE @search OR EXISTS (SELECT 1 FROM KhataEntries ke WHERE ke.CustomerID = c.CustomerID AND (ke.SNCode = @rawSearch OR ke.ModuleCode = @rawSearch OR ke.SNCode LIKE @search OR ke.ModuleCode LIKE @search)))');
                params.search = `%${rawSearch}%`;
                params.rawSearch = rawSearch;
                params.searchId = numericId;
            } else {
                whereClauses.push('(c.CustomerName LIKE @search OR c.Phone LIKE @search OR c.AadhaarNumber LIKE @search OR EXISTS (SELECT 1 FROM KhataEntries ke WHERE ke.CustomerID = c.CustomerID AND (ke.SNCode = @rawSearch OR ke.ModuleCode = @rawSearch OR ke.SNCode LIKE @search OR ke.ModuleCode LIKE @search)))');
                params.search = `%${rawSearch}%`;
                params.rawSearch = rawSearch;
            }
        }

        if (filter === 'to_receive') {
            whereClauses.push('c.CurrentBalance > 0');
        } else if (filter === 'to_pay') {
            whereClauses.push('c.CurrentBalance < 0');
        } else if (filter === 'settled') {
            whereClauses.push('c.CurrentBalance = 0');
        }

        const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

        const result = await query(`
            SELECT c.CustomerID, c.CustomerName, c.Phone, c.AadhaarNumber, c.Address,
                   c.OpeningBalance, c.CurrentBalance, c.BalanceType,
                   c.IsFamilyHead, c.Relationship, c.FamilyID, c.FamilyName, c.KhataMode, c.ParentCustomerID,
                   c.CreatedAt,
                   p.CustomerName as ParentCustomerName,
                   (SELECT COUNT(*) FROM Customers m WHERE m.FamilyID = c.FamilyID AND m.IsActive = 1 AND m.UserID = @userId) as FamilyMembersCount,
                   k.LastDate,
                   k.MaxKhataID,
                   ISNULL(k.EntryCount, 0) as EntryCount
            FROM Customers c
            LEFT JOIN Customers p ON c.ParentCustomerID = p.CustomerID
            LEFT JOIN (
                SELECT CustomerID, 
                       MAX(EntryDate) as LastDate, 
                       MAX(KhataID) as MaxKhataID, 
                       COUNT(*) as EntryCount
                FROM KhataEntries
                WHERE UserID = @userId
                GROUP BY CustomerID
            ) k ON c.CustomerID = k.CustomerID
            ${whereSql}
            ORDER BY 
                ${params.searchId ? 'CASE WHEN c.CustomerID = @searchId THEN 0 ELSE 1 END,' : ''}
                COALESCE(k.LastDate, CAST(c.CreatedAt AS DATE), '1900-01-01') DESC,
                ISNULL(k.MaxKhataID, 0) DESC,
                c.CustomerID DESC
        `, params);

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/khatabook/entry/:id - Single Khata entry by ID
router.get('/entry/:id', async (req, res, next) => {
    try {
        const khataId = parseInt(req.params.id, 10);
        if (isNaN(khataId)) return next();
        const userId = req.user?.UserID || 1;

        const result = await query(`
            SELECT k.*, 
                   c.CustomerName, c.Phone as CustomerPhone, c.AadhaarNumber as CustomerAadhaar,
                   i.InvoiceNumber, i.TotalAmount as InvoiceTotal, i.PaymentStatus as InvoiceStatus,
                   a.AccountName
            FROM KhataEntries k
            LEFT JOIN Customers c ON k.CustomerID = c.CustomerID
            LEFT JOIN Invoices i ON k.InvoiceID = i.InvoiceID
            LEFT JOIN Accounts a ON k.AccountID = a.AccountID
            WHERE k.KhataID = @khataId AND k.UserID = @userId
        `, { khataId, userId });

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Khata entry nahi mili' });
        }

        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET complete Khata statement for a single customer
router.get('/statement/:customerId', async (req, res) => {
    try {
        const custId = parseInt(req.params.customerId);
        const userId = req.user?.UserID || 1;

        // Customer details with family links
        const custResult = await query(`
            SELECT c.*,
                   p.CustomerName as ParentCustomerName,
                   (SELECT COUNT(*) FROM Customers m WHERE m.FamilyID = c.FamilyID AND m.IsActive = 1 AND m.UserID = @userId) as FamilyMembersCount,
                   (SELECT ISNULL(SUM(m.CurrentBalance), 0) FROM Customers m WHERE m.FamilyID = c.FamilyID AND m.IsActive = 1 AND m.UserID = @userId) as FamilyTotalBalance
            FROM Customers c
            LEFT JOIN Customers p ON c.ParentCustomerID = p.CustomerID
            WHERE c.CustomerID = @id AND c.IsActive = 1 AND c.UserID = @userId
        `, { id: custId, userId });

        if (custResult.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer nahi mila' });
        }

        const customer = custResult.recordset[0];

        // All Khata entries ordered chronologically for running balance calculation
        const entriesResult = await query(`
            SELECT k.*, 
                   i.InvoiceNumber, i.TotalAmount as InvoiceTotal, i.PaymentStatus as InvoiceStatus,
                   bp.BillCategory, bp.ProviderName, bp.ConsumerNumber, bp.BillAmount as BPBillAmount,
                   a.AccountName
            FROM KhataEntries k
            LEFT JOIN Invoices i ON k.InvoiceID = i.InvoiceID
            LEFT JOIN BillPayments bp ON bp.PaymentID = COALESCE(k.PaymentID, CASE WHEN k.SourceModule = 'BillPay' THEN k.SourceID END)
            LEFT JOIN Accounts a ON k.AccountID = a.AccountID
            WHERE k.CustomerID = @id AND k.UserID = @userId
            ORDER BY k.EntryDate ASC, ISNULL(k.EntryTime, CAST(k.CreatedAt AS TIME)) ASC, k.KhataID ASC
        `, { id: custId, userId });

        // Calculate running balance row by row
        // NOTE: 'Settlement' entries (advance se auto-settle) balance-neutral hain
        //       -> sirf history dikhane ke liye, running balance change nahi karte.
        // IMPORTANT: Agar customer ka opening balance ek 'OPENING-BAL' KhataEntry ke
        // roop me darj hai, to running balance 0 se shuru karo (warna opening double
        // count ho jayega). Yeh bilkul sp_UpdateCustomerBalance jaisa logic hai, taaki
        // ledger ke last row ka balance customer ke CurrentBalance se match kare.
        const hasOpeningEntry = entriesResult.recordset.some(r => r.ReferenceNo === 'OPENING-BAL');
        let runningBalance = hasOpeningEntry ? 0 : (customer.OpeningBalance || 0);
        const formattedEntries = entriesResult.recordset.map(row => {
            const amt = parseFloat(row.Amount) || 0;
            if (row.EntryType === 'Gave') {
                runningBalance += amt;
            } else if (row.EntryType === 'Got') {
                runningBalance -= amt;
            }
            // 'Settlement' -> koi balance change nahi
            return {
                ...row,
                RunningBalance: parseFloat(runningBalance.toFixed(2))
            };
        });

        // Customer's Bills list (latest first)
        const billsResult = await query(`
            SELECT i.InvoiceID, i.InvoiceNumber, i.InvoiceDate, i.TotalAmount, i.PaidAmount, i.BalanceAmount, i.PaymentStatus, i.PaymentMode
            FROM Invoices i
            WHERE i.CustomerID = @id AND i.Status != 'Cancelled' AND i.UserID = @userId
            ORDER BY i.InvoiceDate DESC, i.InvoiceID DESC
        `, { id: custId, userId });

        res.json({
            success: true,
            customer,
            // Universal Latest-first for presentation (running balance ASC me calculate ho chuka hai)
            entries: formattedEntries.slice().reverse(),
            bills: billsResult.recordset,
            currentBalance: customer.CurrentBalance,
            balanceType: customer.BalanceType
        });
    } catch (err) {
        console.error('Error fetching statement:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST direct Khata entry (Maine Diya / Mujhe Mila)
router.post('/entry', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const { CustomerID, EntryType, Amount, EntryDate, PaymentMode, AccountID, Description, ReferenceNo, CustomerName, CustomerPhone, CustomerAadhaar } = req.body;

        let targetCustId = CustomerID ? parseInt(CustomerID) : null;
        let customerResolution = null;

        if (!['Gave', 'Got'].includes(EntryType)) {
            return res.status(400).json({ success: false, error: "Entry Type 'Gave' ya 'Got' hona chahiye" });
        }

        const amt = parseFloat(Amount);
        if (isNaN(amt) || amt <= 0) {
            return res.status(400).json({ success: false, error: 'Valid amount enter karein (greater than 0)' });
        }

        // Auto-register AFTER basic validation — warna galat request par
        // naya customer create ho jata aur request fail hone par orphan reh jata.
        if (!targetCustId && (CustomerName || CustomerPhone)) {
            customerResolution = await resolveOrCreateCustomer({
                customerName: CustomerName,
                customerPhone: CustomerPhone,
                customerAadhaar: CustomerAadhaar,
                source: 'Khatabook Entry',
                userId
            });
            targetCustId = customerResolution.customerId;
        }

        if (!targetCustId) {
            return res.status(400).json({ success: false, error: 'Customer select karna ya customer details bharna zaroori hai' });
        }

        // Customer verify
        const custCheck = await query('SELECT CustomerName FROM Customers WHERE CustomerID = @id AND IsActive = 1 AND UserID = @userId', { id: targetCustId, userId });
        if (custCheck.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer nahi mila' });
        }
        const customerName = custCheck.recordset[0].CustomerName;

        const dateVal = EntryDate || todayLocal();
        const mode = PaymentMode || 'Cash';
        const desc = Description ? Description.trim() : (EntryType === 'Gave' ? 'Udhaar / Diya' : 'Jama / Mila');
        const ref = ReferenceNo ? ReferenceNo.trim() : null;
        let accId = AccountID ? parseInt(AccountID) : null;
        // Account ownership check — dusre user ka account select na ho jaye
        if (accId) {
            const accOwn = await query('SELECT AccountID FROM Accounts WHERE AccountID = @id AND UserID = @userId AND IsActive = 1', { id: accId, userId });
            if (!accOwn.recordset.length) {
                return res.status(400).json({ success: false, error: 'Chuna hua Account valid nahi hai' });
            }
        }
        // Agar customer ne payment diya (Got) aur account specify nahi kiya, to
        // us user ka default Cash account use karo (hardcoded AccountID = 1 nahi).
        if (!accId && EntryType === 'Got') {
            const cashAcc = await query("SELECT TOP 1 AccountID FROM Accounts WHERE UserID = @userId AND AccountType = 'Cash' AND IsActive = 1 ORDER BY AccountID ASC", { userId });
            accId = cashAcc.recordset[0]?.AccountID || (userId === 1 ? 1 : null);
        }

        const savedEntry = await withTransaction(async (tQuery) => {
            // 1. Insert Khata Entry
            const insertResult = await tQuery(`
                INSERT INTO KhataEntries (
                    CustomerID, EntryDate, EntryTime, EntryType, Amount, 
                    AccountID, PaymentMode, Description, ReferenceNo, UserID
                )
                VALUES (
                    @custId, @date, CONVERT(VARCHAR(5), GETDATE(), 108), @type, @amt,
                    @accId, @mode, @desc, @ref, @userId
                );
                -- KhataEntries par AFTER INSERT trigger hai, isliye OUTPUT nahi
                SELECT * FROM KhataEntries WHERE KhataID = SCOPE_IDENTITY();
            `, {
                custId: targetCustId,
                date: dateVal,
                type: EntryType,
                amt: amt,
                accId: accId,
                mode: mode,
                desc: desc,
                ref: ref,
                userId
            });

            const newKhata = insertResult.recordset[0];
            const linkedRef = `KHATA-ENTRY-${newKhata.KhataID}`;

            // 2. UNIFIED LINK TO REAL CASH/BANK TRANSACTIONS
            if (accId) {
                if (EntryType === 'Got') {
                    // Mujhe Mila (Payment In) -> Shop/Counter received cash/UPI -> Income
                    const incRes = await tQuery(`
                        INSERT INTO Transactions (
                            TransDate, TransType, Amount, AccountID, CategoryID, Description, Reference, UserID
                        )
                        OUTPUT INSERTED.TransactionID
                        VALUES (
                            @date, 'Income', @amount, @accId,
                            (SELECT TOP 1 CategoryID FROM Categories WHERE (CategoryName = 'Business Income' OR CategoryType = 'Income') AND UserID = @userId),
                            @desc, @ref, @userId
                        )
                    `, {
                        date: dateVal,
                        amount: amt,
                        accId: accId,
                        desc: `Khata Jama: ${customerName} se mila (${desc})`,
                        ref: linkedRef,
                        userId
                    });
                    const incTxnId = incRes.recordset[0]?.TransactionID;
                    if (incTxnId) {
                        try {
                            await registerGlobalTransaction({
                                sourceModule: 'Cashbook',
                                recordId: incTxnId,
                                entityName: customerName,
                                amount: amt,
                                transDate: dateVal,
                                createdAt: new Date(),
                                userId
                            }, tQuery);
                        } catch (e) {
                            console.error('Khata-linked income SN reg error:', e);
                            throw new Error('Khata-linked income SN registration failed: ' + e.message);
                        }
                    }
                    await tQuery('EXEC sp_UpdateAccountBalance @id', { id: accId });
                } else if (EntryType === 'Gave') {
                    // Maine Diya (Cash Out from account) -> Expense/Loan Given
                    const expRes = await tQuery(`
                        INSERT INTO Transactions (
                            TransDate, TransType, Amount, AccountID, CategoryID, Description, Reference, UserID
                        )
                        OUTPUT INSERTED.TransactionID
                        VALUES (
                            @date, 'Expense', @amount, @accId,
                            (SELECT TOP 1 CategoryID FROM Categories WHERE (CategoryName = 'Miscellaneous' OR CategoryType = 'Expense') AND UserID = @userId),
                            @desc, @ref, @userId
                        )
                    `, {
                        date: dateVal,
                        amount: amt,
                        accId: accId,
                        desc: `Khata Diya: ${customerName} ko diya (${desc})`,
                        ref: linkedRef,
                        userId
                    });
                    const expTxnId = expRes.recordset[0]?.TransactionID;
                    if (expTxnId) {
                        try {
                            await registerGlobalTransaction({
                                sourceModule: 'Cashbook',
                                recordId: expTxnId,
                                entityName: customerName,
                                amount: amt,
                                transDate: dateVal,
                                createdAt: new Date(),
                                userId
                            }, tQuery);
                        } catch (e) {
                            console.error('Khata-linked expense SN reg error:', e);
                            throw new Error('Khata-linked expense SN registration failed: ' + e.message);
                        }
                    }
                    await tQuery('EXEC sp_UpdateAccountBalance @id', { id: accId });
                }
            }

            // 3. Update customer balance + advance se pending dues auto-settle
            // Agar 'Got' entry hai (customer ne paisa jama kiya / advance diya),
            // to uske CSC aur Bill ke pending dues automatically settle karo.
            if (EntryType === 'Got') {
                await processKhataAfterChange(tQuery, targetCustId);
            } else {
                await tQuery('EXEC sp_UpdateCustomerBalance @id', { id: targetCustId });
            }

            // 4. Activity History / Audit Log
            await logAudit({
                action: 'CREATE',
                module: 'Khatabook',
                tableName: 'KhataEntries',
                recordId: newKhata.KhataID,
                entityName: customerName,
                amount: amt,
                description: `Khatabook: ${customerName} - ${EntryType === 'Gave' ? 'Maine Diya' : 'Mujhe Mila'} ₹${amt.toLocaleString('en-IN')}`,
                newData: newKhata,
                details: `EntryType: ${EntryType}, PaymentMode: ${mode}, Description: ${desc}, Reference: ${ref || 'N/A'}, AccountID: ${accId || 'None'}`,
                tQuery
            });

            // Universal Global Transaction Registry (Rule 4 Atomic Registration)
            const regInfo = await registerGlobalTransaction({
                sourceModule: 'Khata',
                recordId: newKhata.KhataID,
                entityName: customerName,
                amount: amt,
                transDate: dateVal,
                createdAt: new Date(),
                userId
            }, tQuery);

            newKhata.GlobalSerialNo = regInfo.globalSerialNo;
            newKhata.SNCode = regInfo.snCode;
            newKhata.ModuleCode = regInfo.moduleCode;

            return newKhata;
        });

        res.json({
            success: true,
            data: savedEntry,
            khataId: savedEntry.KhataID,
            id: savedEntry.KhataID,
            customerId: targetCustId,
            autoRegisteredCustomer: customerResolution && customerResolution.isNew ? customerResolution.customer : null,
            message: `Khata entry safalta se darj ho gayi (₹${amt})`
        });
    } catch (err) {
        console.error('Error adding khata entry:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE Khata entry
router.delete('/entry/:id', async (req, res) => {
    try {
        const entryId = parseInt(req.params.id);
        const userId = req.user?.UserID || 1;

        await withTransaction(async (tQuery) => {
            const check = await tQuery(`
                SELECT k.*, c.CustomerName 
                FROM KhataEntries k 
                LEFT JOIN Customers c ON k.CustomerID = c.CustomerID 
                WHERE k.KhataID = @id AND k.UserID = @userId
            `, { id: entryId, userId });

            if (check.recordset.length === 0) {
                throw new Error('Khata entry nahi mili');
            }

            const oldEntry = check.recordset[0];
            const { CustomerID, AccountID, CustomerName, Amount, EntryType, Description } = oldEntry;

            // Auto-linked entry protection (F7 Fix)
            if (oldEntry.CSCAppID) {
                throw Object.assign(new Error('Yeh entry CSC Application se auto-linked hai. Isko CSC Tracker se hi manage ya delete karein.'), { status: 400 });
            }
            if (oldEntry.BCID) {
                throw Object.assign(new Error('Yeh entry BC Banking se auto-linked hai. Isko BC Counter se hi manage karein.'), { status: 400 });
            }
            if (oldEntry.InvoiceID) {
                throw Object.assign(new Error('Yeh entry Bill/Invoice se auto-linked hai. Isko Invoices module se hi manage ya delete karein.'), { status: 400 });
            }
            if (oldEntry.PaymentID || oldEntry.ModuleCode === 'BP' || (oldEntry.ReferenceNo && String(oldEntry.ReferenceNo).startsWith('BP-'))) {
                throw Object.assign(new Error('Yeh entry Bill & EMI Payment se auto-linked hai. Isko Bill Payments module se hi manage ya delete karein.'), { status: 400 });
            }
            if (oldEntry.EntryType === 'Opening' || (oldEntry.PaymentMode === 'Opening' && !oldEntry.Description)) {
                throw Object.assign(new Error('Customer Opening Balance entry direct delete nahi ho sakti.'), { status: 400 });
            }

            // Safely delete Khata entry, deactivating Universal SN and linked transactions
            await deleteKhataWithSN(tQuery, {
                khataId: entryId,
                userId,
                customerId: CustomerID,
                entryType: EntryType
            });

            // Activity History / Audit Log for deletion
            await logAudit({
                action: 'DELETE',
                module: 'Khatabook',
                tableName: 'KhataEntries',
                recordId: entryId,
                entityName: CustomerName || `Customer #${CustomerID}`,
                amount: parseFloat(Amount) || 0,
                description: `Khatabook Entry Hatayi Gayi: ${CustomerName || 'Grahak'} - ${EntryType} ₹${parseFloat(Amount || 0).toLocaleString('en-IN')}`,
                oldData: oldEntry,
                details: `Purani Entry Type: ${EntryType}, Amount: ${Amount}, Description: ${Description || 'N/A'} ko delete kiya gaya.`,
                tQuery
            });

            try {
                await deactivateGlobalTransaction('Khata', entryId, tQuery);
            } catch (regErr) {
                console.error('Failed to deactivate global transaction for Khata:', regErr);
                throw new Error('Failed to deactivate global transaction for Khata: ' + regErr.message);
            }
        });

        res.json({ success: true, message: 'Khata entry delete ho gayi aur balance theek ho gaya' });
    } catch (err) {
        console.error('Error deleting khata entry:', err);
        const status = err.status || 500;
        res.status(status).json({ success: false, error: err.message });
    }
});

module.exports = router;
