const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../database/db');
const { processKhataAfterChange } = require('../database/khataEngine');
const { logAudit } = require('../utils/auditLogger');
const { todayLocal } = require('../utils/helpers');
const { resolveOrCreateCustomer } = require('../database/customerAutoRegister');
const { registerGlobalTransaction, deactivateGlobalTransaction } = require('../database/globalTxnRegistry');

// GET all invoices (Billing list)
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const { search, status, customerId, startDate, endDate } = req.query;
        let whereClauses = ["i.Status != 'Cancelled'", 'i.UserID = @userId'];
        let params = { userId };

        if (search && search.trim() !== '') {
            whereClauses.push('(i.InvoiceNumber LIKE @search OR c.CustomerName LIKE @search OR c.Phone LIKE @search OR i.SNCode LIKE @search OR i.ModuleCode LIKE @search)');
            params.search = `%${search.trim()}%`;
        }

        if (status && status !== 'all') {
            whereClauses.push('i.PaymentStatus = @status');
            params.status = status;
        }

        if (customerId) {
            whereClauses.push('i.CustomerID = @custId');
            params.custId = parseInt(customerId);
        }

        if (startDate) {
            whereClauses.push('i.InvoiceDate >= @sDate');
            params.sDate = startDate;
        }

        if (endDate) {
            whereClauses.push('i.InvoiceDate <= @eDate');
            params.eDate = endDate;
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const result = await query(`
            SELECT i.*, 
                   c.CustomerName, c.Phone as CustomerPhone, c.AadhaarNumber as CustomerAadhaar, c.Address as CustomerAddress,
                   a.AccountName,
                   (SELECT COUNT(*) FROM InvoiceItems it WHERE it.InvoiceID = i.InvoiceID) AS TotalItemCount
            FROM Invoices i
            LEFT JOIN Customers c ON i.CustomerID = c.CustomerID
            LEFT JOIN Accounts a ON i.AccountID = a.AccountID
            ${whereSql}
            ORDER BY i.InvoiceDate DESC, i.InvoiceID DESC
        `, params);

        // Summary metrics
        const stats = await query(`
            SELECT 
                COUNT(*) as TotalInvoices,
                ISNULL(SUM(TotalAmount), 0) as TotalSales,
                ISNULL(SUM(PaidAmount), 0) as TotalReceived,
                ISNULL(SUM(BalanceAmount), 0) as TotalDue,
                ISNULL(SUM(CASE WHEN PaymentStatus = 'Paid' THEN 1 ELSE 0 END), 0) as PaidCount,
                ISNULL(SUM(CASE WHEN PaymentStatus = 'Partial' THEN 1 ELSE 0 END), 0) as PartialCount,
                ISNULL(SUM(CASE WHEN PaymentStatus = 'Unpaid' THEN 1 ELSE 0 END), 0) as UnpaidCount
            FROM Invoices
            WHERE Status != 'Cancelled' AND UserID = @userId
        `, { userId });

        res.json({
            success: true,
            data: result.recordset,
            summary: stats.recordset[0] || {}
        });
    } catch (err) {
        console.error('Error fetching invoices:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET next suggested invoice number
router.get('/next-number', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const qDate = req.query.date || req.query.invoiceDate;
        const qYear = req.query.year ? parseInt(req.query.year, 10) : null;
        const year = qYear || ((qDate && /^\d{4}/.test(String(qDate))) ? parseInt(String(qDate).slice(0, 4), 10) : new Date().getFullYear());
        const prefix = `INV-${year}-`;

        // 1. Check active Invoices for this year
        const invRows = await query(`
            SELECT InvoiceNumber 
            FROM Invoices 
            WHERE InvoiceNumber LIKE @prefix AND UserID = @userId
        `, { prefix: `${prefix}%`, userId });

        // 2. Check deleted Invoices in AuditLogs (protects custom high numbers like INV-2026-0020 from reuse)
        const delRows = await query(`
            SELECT JSON_VALUE(OldData, '$.InvoiceNumber') AS DelInvNum 
            FROM AuditLogs 
            WHERE TableName = 'Invoices' AND Action = 'DELETE' 
              AND JSON_VALUE(OldData, '$.InvoiceNumber') LIKE @prefix 
              AND UserID = @userId
        `, { prefix: `${prefix}%`, userId });

        // 3. Check UniversalTxnRegistry for past sequence in this year
        const regRow = await query(`
            SELECT ISNULL(COUNT(*), 0) AS countInYear
            FROM UniversalTxnRegistry
            WHERE SourceModule = 'Invoices' AND UserID = @userId
              AND (YEAR(TransDate) = @year OR YEAR(CreatedAt) = @year)
        `, { userId, year });

        let maxSeq = regRow.recordset[0]?.countInYear || 0;
        for (const r of invRows.recordset) {
            const parts = (r.InvoiceNumber || '').split('-');
            if (parts.length >= 3) {
                const parsed = parseInt(parts[2], 10);
                if (!isNaN(parsed) && parsed > maxSeq) maxSeq = parsed;
            }
        }
        for (const r of delRows.recordset) {
            const parts = (r.DelInvNum || '').split('-');
            if (parts.length >= 3) {
                const parsed = parseInt(parts[2], 10);
                if (!isNaN(parsed) && parsed > maxSeq) maxSeq = parsed;
            }
        }

        const nextInvoiceNumber = `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
        res.json({ success: true, nextInvoiceNumber });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET single invoice with items and customer details
router.get('/:id', async (req, res) => {
    try {
        const invId = parseInt(req.params.id);
        const userId = req.user?.UserID || 1;
        const invResult = await query(`
            SELECT i.*, 
                   c.CustomerName, c.Phone as CustomerPhone, c.AadhaarNumber as CustomerAadhaar, c.Address as CustomerAddress, c.Email as CustomerEmail, c.GSTIN as CustomerGSTIN,
                   a.AccountName
            FROM Invoices i
            LEFT JOIN Customers c ON i.CustomerID = c.CustomerID
            LEFT JOIN Accounts a ON i.AccountID = a.AccountID
            WHERE i.InvoiceID = @id AND i.UserID = @userId
        `, { id: invId, userId });

        if (invResult.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Invoice nahi mila' });
        }

        const itemsResult = await query(`
            SELECT * FROM InvoiceItems WHERE InvoiceID = @id ORDER BY ItemID ASC
        `, { id: invId });

        const data = invResult.recordset[0];
        data.Items = itemsResult.recordset;

        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST create invoice
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const {
            CustomerID, InvoiceNumber, InvoiceDate, DueDate,
            Items, DiscountAmount, TaxPercent, PaidAmount,
            PaymentMode, AccountID, Notes, Terms,
            CustomerName, CustomerPhone, CustomerAadhaar, CustomerAddress
        } = req.body;

        let targetCustId = CustomerID ? parseInt(CustomerID) : null;
        let customerResolution = null;

        if (!targetCustId && (CustomerName || CustomerPhone)) {
            customerResolution = await resolveOrCreateCustomer({
                customerName: CustomerName,
                customerPhone: CustomerPhone,
                customerAadhaar: CustomerAadhaar,
                address: CustomerAddress,
                source: 'Billing Invoice',
                userId
            });
            targetCustId = customerResolution.customerId;
        }

        if (!targetCustId) {
            return res.status(400).json({ success: false, error: 'Customer select karna ya customer details bharna zaroori hai' });
        }

        if (!Items || !Array.isArray(Items) || Items.length === 0) {
            return res.status(400).json({ success: false, error: 'Kam se kam ek item bill me hona zaroori hai' });
        }

        // Verify customer exists
        const custCheck = await query('SELECT CustomerName, Phone FROM Customers WHERE CustomerID = @id AND IsActive = 1 AND UserID = @userId', { id: targetCustId, userId });
        if (custCheck.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Selected customer database me nahi mila' });
        }
        const customerName = custCheck.recordset[0].CustomerName;

        // Calculate totals
        let subTotal = 0;
        const processedItems = Items.map(item => {
            const qty = Math.max(0.01, parseFloat(item.Quantity) || 1);
            const rate = Math.max(0, parseFloat(item.UnitPrice) || 0);
            const total = parseFloat((qty * rate).toFixed(2));
            subTotal += total;
            return {
                ItemName: (item.ItemName || 'Item').trim(),
                Quantity: qty,
                Unit: (item.Unit || 'Pcs').trim(),
                UnitPrice: rate,
                TotalPrice: total
            };
        });

        const discount = Math.min(subTotal, Math.max(0, parseFloat(DiscountAmount) || 0));
        const taxable = Math.max(0, subTotal - discount);
        const taxPct = Math.max(0, parseFloat(TaxPercent) || 0);
        const taxAmt = parseFloat(((taxable * taxPct) / 100).toFixed(2));
        const grandTotal = parseFloat((taxable + taxAmt).toFixed(2));
        const rawPaid = Math.max(0, parseFloat(PaidAmount) || 0);
        if (rawPaid > grandTotal) {
            return res.status(400).json({ success: false, error: `Paid amount bill ke kul jod (₹${grandTotal}) se zyada nahi ho sakti` });
        }
        const paid = rawPaid;
        const balance = parseFloat((grandTotal - paid).toFixed(2));

        let paymentStatus = 'Unpaid';
        if (paid >= grandTotal) {
            paymentStatus = 'Paid';
        } else if (paid > 0) {
            paymentStatus = 'Partial';
        }

        if (AccountID) {
            const accCheck = await query('SELECT AccountID FROM Accounts WHERE AccountID = @id AND UserID = @userId AND IsActive = 1', { id: parseInt(AccountID), userId });
            if (!accCheck.recordset.length) return res.status(400).json({ success: false, error: 'Chuna hua Account valid nahi hai' });
        }

        // 1. Insert Invoice and all linked entries atomically
        const newInvoice = await withTransaction(async (tQuery) => {
            // Invoice number transaction ke andar generate karo (UPDLOCK) - warna do
            // concurrent create me same number generate hota tha (UNIQUE violation)
            let invNumber = InvoiceNumber ? InvoiceNumber.trim() : '';
            const effDate = InvoiceDate || todayLocal();
            const year = (effDate && /^\d{4}/.test(String(effDate))) ? parseInt(String(effDate).slice(0, 4), 10) : new Date().getFullYear();
            const prefix = `INV-${year}-`;

            // If empty or already exists in active Invoices, resolve the next safe unique number
            let checkExisting = invNumber ? await tQuery(`SELECT TOP 1 InvoiceID FROM Invoices WHERE InvoiceNumber = @chkNum AND UserID = @userId`, { chkNum: invNumber, userId }) : { recordset: [] };

            // Check if this number was previously used and deleted (AuditLogs permanent trail - prevents reusing deleted numbers like INV-2026-0020)
            let checkDeleted = invNumber ? await tQuery(`
                SELECT TOP 1 LogID FROM AuditLogs 
                WHERE TableName = 'Invoices' AND Action = 'DELETE' 
                  AND JSON_VALUE(OldData, '$.InvoiceNumber') = @chkNum 
                  AND UserID = @userId
            `, { chkNum: invNumber, userId }) : { recordset: [] };

            // Client ne jo number bheja hai wo pehle use ho chuka hai ya registry sequence se chhota hai?
            if (invNumber) {
                if (checkDeleted.recordset.length > 0) {
                    invNumber = ''; // Pehle delete kiya gaya number reuse mat hone do
                } else {
                    const regCheck = await tQuery(`
                        SELECT ISNULL(COUNT(*), 0) AS countInYear
                        FROM UniversalTxnRegistry WITH (UPDLOCK, HOLDLOCK)
                        WHERE SourceModule = 'Invoices' AND UserID = @userId
                          AND (YEAR(TransDate) = @year OR YEAR(CreatedAt) = @year)
                    `, { userId, year });
                    const maxRegSeq = regCheck.recordset[0]?.countInYear || 0;
                    const parts = invNumber.split('-');
                    if (parts.length >= 3 && invNumber.startsWith(prefix)) {
                        const seqPart = parseInt(parts[2], 10);
                        if (!isNaN(seqPart) && seqPart <= maxRegSeq) {
                            invNumber = ''; // Purana sequence number recycle mat hone do
                        }
                    }
                }
            }

            if (!invNumber || checkExisting.recordset.length > 0) {
                // Find highest sequence from Invoices, AuditLogs, AND UniversalTxnRegistry
                const allInvRes = await tQuery(`
                    SELECT InvoiceNumber FROM Invoices WITH (UPDLOCK, HOLDLOCK) 
                    WHERE InvoiceNumber LIKE @pfx AND UserID = @userId
                `, { pfx: `${prefix}%`, userId });
                let maxSeq = 0;
                for (const r of allInvRes.recordset) {
                    const parts = (r.InvoiceNumber || '').split('-');
                    if (parts.length >= 3) {
                        const num = parseInt(parts[2], 10);
                        if (!isNaN(num) && num > maxSeq) maxSeq = num;
                    }
                }

                // Check deleted Invoices in AuditLogs
                const delRes = await tQuery(`
                    SELECT JSON_VALUE(OldData, '$.InvoiceNumber') AS DelInvNum 
                    FROM AuditLogs WITH (UPDLOCK, HOLDLOCK)
                    WHERE TableName = 'Invoices' AND Action = 'DELETE' 
                      AND JSON_VALUE(OldData, '$.InvoiceNumber') LIKE @pfx 
                      AND UserID = @userId
                `, { pfx: `${prefix}%`, userId });
                for (const r of delRes.recordset) {
                    const parts = (r.DelInvNum || '').split('-');
                    if (parts.length >= 3) {
                        const num = parseInt(parts[2], 10);
                        if (!isNaN(num) && num > maxSeq) maxSeq = num;
                    }
                }

                // Check UniversalTxnRegistry for past sequence in this year
                const regSeqRes = await tQuery(`
                    SELECT ISNULL(COUNT(*), 0) AS countInYear
                    FROM UniversalTxnRegistry WITH (UPDLOCK, HOLDLOCK)
                    WHERE SourceModule = 'Invoices' AND UserID = @userId
                      AND (YEAR(TransDate) = @year OR YEAR(CreatedAt) = @year)
                `, { userId, year });
                const regSeq = regSeqRes.recordset[0]?.countInYear || 0;
                if (regSeq > maxSeq) {
                    maxSeq = regSeq;
                }

                invNumber = `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
            }

            const invInsert = await tQuery(`
                INSERT INTO Invoices (
                    InvoiceNumber, CustomerID, InvoiceDate, DueDate,
                    SubTotal, DiscountAmount, TaxPercent, TaxAmount,
                    TotalAmount, PaidAmount, BalanceAmount, PaymentStatus,
                    PaymentMode, AccountID, Notes, Terms, Status, UserID
                )
                OUTPUT INSERTED.*
                VALUES (
                    @invNum, @custId, @invDate, @dueDate,
                    @subTotal, @discount, @taxPct, @taxAmt,
                    @grandTotal, @paid, @balance, @payStatus,
                    @payMode, @accId, @notes, @terms, 'Active', @userId
                )
            `, {
                invNum: invNumber,
                custId: targetCustId,
                invDate: InvoiceDate || todayLocal(),
                dueDate: DueDate || null,
                subTotal: subTotal,
                discount: discount,
                taxPct: taxPct,
                taxAmt: taxAmt,
                grandTotal: grandTotal,
                paid: paid,
                balance: balance,
                payStatus: paymentStatus,
                payMode: PaymentMode || 'Udhar',
                accId: AccountID ? parseInt(AccountID) : null,
                notes: Notes ? Notes.trim() : null,
                terms: Terms ? Terms.trim() : null,
                userId
            });

            const createdInvoice = invInsert.recordset[0];
            const invoiceId = createdInvoice.InvoiceID;

            // 2. Insert Line Items
            for (const item of processedItems) {
                await tQuery(`
                    INSERT INTO InvoiceItems (InvoiceID, ItemName, Quantity, Unit, UnitPrice, TotalPrice)
                    VALUES (@invId, @name, @qty, @unit, @price, @total)
                `, {
                    invId: invoiceId,
                    name: item.ItemName,
                    qty: item.Quantity,
                    unit: item.Unit,
                    price: item.UnitPrice,
                    total: item.TotalPrice
                });
            }

            // 3. UNIFIED LINK TO KHATABOOK:
            // Entry 1: Bill Amount as 'Gave'
            await tQuery(`
                INSERT INTO KhataEntries (
                    CustomerID, EntryDate, EntryTime, EntryType, Amount, 
                    InvoiceID, PaymentMode, Description, ReferenceNo, UserID
                )
                VALUES (
                    @custId, @entryDate, CONVERT(VARCHAR(5), GETDATE(), 108), 'Gave', @amount,
                    @invId, @payMode, @desc, @refNo, @userId
                )
            `, {
                custId: targetCustId,
                entryDate: InvoiceDate || todayLocal(),
                amount: grandTotal,
                invId: invoiceId,
                payMode: PaymentMode || 'Bill Credit',
                desc: `Bill Banaya: ${invNumber} (${processedItems.length} items)`,
                refNo: invNumber,
                userId
            });

            // Entry 2: If customer made any advance / immediate payment, record 'Got' in Khata!
            if (paid > 0) {
                // Resolve AccountID - default to Cash Account (AccountID = 1) if not provided
                let effAccId = AccountID ? parseInt(AccountID) : null;
                if (!effAccId) {
                    const defAcc = await tQuery(`
                        SELECT TOP 1 AccountID FROM Accounts 
                        WHERE UserID = @userId AND IsActive = 1 AND (AccountType = 'Cash' OR AccountID = 1)
                        ORDER BY CASE WHEN AccountID = 1 THEN 0 ELSE 1 END
                    `, { userId });
                    effAccId = defAcc.recordset.length > 0 ? defAcc.recordset[0].AccountID : 1;
                }

                // Update invoice AccountID if it was empty
                await tQuery(`UPDATE Invoices SET AccountID = @accId WHERE InvoiceID = @invId`, {
                    accId: effAccId,
                    invId: invoiceId
                });

                await tQuery(`
                    INSERT INTO KhataEntries (
                        CustomerID, EntryDate, EntryTime, EntryType, Amount, 
                        InvoiceID, AccountID, PaymentMode, Description, ReferenceNo, UserID
                    )
                    VALUES (
                        @custId, @entryDate, CONVERT(VARCHAR(5), GETDATE(), 108), 'Got', @paidAmt,
                        @invId, @accId, @payMode, @desc, @refNo, @userId
                    )
                `, {
                    custId: targetCustId,
                    entryDate: InvoiceDate || todayLocal(),
                    paidAmt: paid,
                    invId: invoiceId,
                    accId: effAccId,
                    payMode: PaymentMode || 'Cash',
                    desc: `Bill Payment Received: ${invNumber}`,
                    refNo: `PAY-${invNumber}`,
                    userId
                });

                // 4. UNIFIED LINK TO ACCOUNTS & CASH REGISTER:
                await tQuery(`
                    INSERT INTO Transactions (
                        TransDate, TransType, Amount, AccountID, CategoryID, Description, Reference, UserID,
                        SourceModule, SourceID, LineType
                    )
                    VALUES (
                        @date, 'Income', @amount, @accId, 
                        (SELECT TOP 1 CategoryID FROM Categories WHERE (CategoryName = 'Business Income' OR CategoryType = 'Income') AND UserID = @userId),
                        @desc, @ref, @userId,
                        'Invoices', @invId, 'PAYMENT_IN'
                    )
                `, {
                    date: InvoiceDate || todayLocal(),
                    amount: paid,
                    accId: effAccId,
                    desc: `Billing Income: Bill #${invNumber} from ${customerName}`,
                    ref: invNumber,
                    userId,
                    invId: invoiceId
                });

                await tQuery('EXEC sp_UpdateAccountBalance @id', { id: effAccId });
            }

            // 5. Instantly Update Customer Balance
            await tQuery('EXEC sp_UpdateCustomerBalance @id', { id: targetCustId });

            // 6. ADVANCE AUTO-SETTLEMENT (agar customer ke paas advance hai)
            await processKhataAfterChange(tQuery, targetCustId);

            // 7. UNIVERSAL GLOBAL SERIAL NUMBER REGISTRATION (Rule 4 Atomic Registration)
            const regInfo = await registerGlobalTransaction({
                sourceModule: 'Invoices',
                recordId: createdInvoice.InvoiceID,
                entityName: customerName,
                amount: grandTotal,
                transDate: InvoiceDate || todayLocal(),
                createdAt: new Date(),
                userId
            }, tQuery);

            createdInvoice.GlobalSerialNo = regInfo.globalSerialNo;
            createdInvoice.SNCode = regInfo.snCode;
            createdInvoice.ModuleCode = regInfo.moduleCode;

            // Propagate Universal SN to child Transactions and KhataEntries
            if (paid > 0) {
                await tQuery(`
                    UPDATE Transactions
                    SET GlobalSerialNo = @GlobalSerialNo, SNCode = @SNCode, ModuleCode = @ModuleCode
                    WHERE UserID = @userId AND SourceModule = 'Invoices' AND SourceID = @invId
                `, {
                    GlobalSerialNo: regInfo.globalSerialNo,
                    SNCode: regInfo.snCode,
                    ModuleCode: regInfo.moduleCode,
                    userId,
                    invId: createdInvoice.InvoiceID
                });
            }

            await tQuery(`
                UPDATE KhataEntries
                SET GlobalSerialNo = @GlobalSerialNo, SNCode = @SNCode, ModuleCode = @ModuleCode
                WHERE UserID = @userId AND InvoiceID = @invId
            `, {
                GlobalSerialNo: regInfo.globalSerialNo,
                SNCode: regInfo.snCode,
                ModuleCode: regInfo.moduleCode,
                userId,
                invId: createdInvoice.InvoiceID
            });

            await logAudit({
                action: 'CREATE',
                module: 'Billing',
                tableName: 'Invoices',
                recordId: createdInvoice.InvoiceID,
                entityName: customerName || `Customer #${CustomerID}`,
                amount: grandTotal,
                description: `Naya Bill Banaya: #${invNumber} (₹${grandTotal.toLocaleString('en-IN')}) - ${customerName}`,
                newData: { ...createdInvoice, items: processedItems },
                details: `Bill No: ${invNumber}, Customer: ${customerName}, Total: ₹${grandTotal}, Paid: ₹${paid}, Due: ₹${balance}, Items: ${processedItems.length}`,
                userId,
                tQuery
            });

            return createdInvoice;
        });

        res.json({
            success: true,
            data: newInvoice,
            customerId: targetCustId,
            autoRegisteredCustomer: customerResolution && customerResolution.isNew ? customerResolution.customer : null,
            message: `Bill #${newInvoice.InvoiceNumber} ban gaya aur Khatabook me live link ho gaya!`
        });
    } catch (err) {
        console.error('Error creating invoice:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT record payment against existing invoice
router.put('/:id/pay', async (req, res) => {
    try {
        const invId = parseInt(req.params.id);
        const userId = req.user?.UserID || 1;
        const { PaidAmount, PaymentMode, AccountID, PaymentDate, Notes } = req.body;

        const payAmt = Math.max(0, parseFloat(PaidAmount) || 0);
        if (payAmt <= 0) {
            return res.status(400).json({ success: false, error: 'Payment amount zero se zyada hona chahiye' });
        }

        if (AccountID) {
            const accCheck = await query('SELECT AccountID FROM Accounts WHERE AccountID = @id AND UserID = @userId AND IsActive = 1', { id: parseInt(AccountID), userId });
            if (!accCheck.recordset.length) return res.status(400).json({ success: false, error: 'Chuna hua Account valid nahi hai' });
        }

        const invoiceNumber = await withTransaction(async (tQuery) => {
            const invResult = await tQuery(`
                SELECT i.*, c.CustomerName 
                FROM Invoices i WITH (UPDLOCK, HOLDLOCK)
                LEFT JOIN Customers c ON i.CustomerID = c.CustomerID
                WHERE i.InvoiceID = @id AND i.UserID = @userId
            `, { id: invId, userId });

            if (invResult.recordset.length === 0) {
                throw new Error('Invoice nahi mila');
            }

            const invoice = invResult.recordset[0];
            const currentBalance = parseFloat(invoice.BalanceAmount || 0);
            if (invoice.PaymentStatus === 'Paid' || currentBalance <= 0) {
                throw new Error('Yeh bill pehle se poori tarah chukta (Paid) hai');
            }
            if (payAmt > currentBalance) {
                throw new Error(`Payment amount baaki rashi (₹${currentBalance}) se zyada nahi ho sakti`);
            }

            const newPaidTotal = parseFloat((invoice.PaidAmount + payAmt).toFixed(2));
            const newBalance = Math.max(0, parseFloat((invoice.TotalAmount - newPaidTotal).toFixed(2)));
            const newStatus = newBalance === 0 ? 'Paid' : 'Partial';

            // 1. Update Invoice
            await tQuery(`
                UPDATE Invoices SET
                    PaidAmount = @paidTotal,
                    BalanceAmount = @balance,
                    PaymentStatus = @status,
                    UpdatedAt = GETDATE()
                WHERE InvoiceID = @id AND UserID = @userId
            `, {
                id: invId,
                paidTotal: newPaidTotal,
                balance: newBalance,
                status: newStatus,
                userId
            });

            // 2. Resolve Account & Check Existing Mirror
            const existingMirror = await tQuery(`
                SELECT TransactionID, AccountID FROM Transactions
                WHERE UserID = @userId AND SourceModule = 'Invoices' AND SourceID = @invId
                  AND LineType = 'PAYMENT_IN' AND IsDeleted = 0
            `, { userId, invId });

            let effAccId = AccountID ? parseInt(AccountID) : null;
            if (!effAccId && existingMirror.recordset.length > 0 && existingMirror.recordset[0].AccountID) {
                // User ne account select nahi kiya, to pehle mirror ka account hi use karo
                effAccId = existingMirror.recordset[0].AccountID;
            } else if (!effAccId) {
                const defAcc = await tQuery(`
                    SELECT TOP 1 AccountID FROM Accounts 
                    WHERE UserID = @userId AND IsActive = 1 AND (AccountType = 'Cash' OR AccountID = 1)
                    ORDER BY CASE WHEN AccountID = 1 THEN 0 ELSE 1 END
                `, { userId });
                effAccId = defAcc.recordset.length > 0 ? defAcc.recordset[0].AccountID : 1;
            }

            // Partially paid invoice ka account explicit change mat hone do (warna purane account
            // ke cashbook se pehle ka payment gayab dikhega)
            if (existingMirror.recordset.length > 0) {
                const old = existingMirror.recordset[0];
                if (AccountID && old.AccountID && old.AccountID !== effAccId) {
                    throw Object.assign(
                        new Error('Is bill ka pehla payment dusre account me hua tha. Baaki payment usi account me karein.'),
                        { status: 400 }
                    );
                }
            }

            // Add Khata 'Got' Entry
            await tQuery(`
                INSERT INTO KhataEntries (
                    CustomerID, EntryDate, EntryTime, EntryType, Amount, 
                    InvoiceID, AccountID, PaymentMode, Description, ReferenceNo, UserID,
                    GlobalSerialNo, SNCode, ModuleCode
                )
                VALUES (
                    @custId, @entryDate, CONVERT(VARCHAR(5), GETDATE(), 108), 'Got', @amt,
                    @invId, @accId, @payMode, @desc, @refNo, @userId,
                    @GlobalSerialNo, @SNCode, @ModuleCode
                )
            `, {
                custId: invoice.CustomerID,
                entryDate: PaymentDate || todayLocal(),
                amt: payAmt,
                invId: invId,
                accId: effAccId,
                payMode: PaymentMode || 'Cash',
                desc: `Payment Received for Bill #${invoice.InvoiceNumber}${Notes ? ' - ' + Notes : ''}`,
                refNo: `PAY-${invoice.InvoiceNumber}`,
                userId,
                GlobalSerialNo: invoice.GlobalSerialNo || null,
                SNCode: invoice.SNCode || null,
                ModuleCode: invoice.ModuleCode || null
            });

            // 3. Update the cumulative mirror but keep its original date; individual
            // payments retain their own dates and amounts in KhataEntries.
            if (existingMirror.recordset.length > 0) {
                const old = existingMirror.recordset[0];
                await tQuery(`
                    UPDATE Transactions
                    SET Amount = @amount, AccountID = @accId,
                        Description = @desc, Reference = @ref, UpdatedAt = GETDATE()
                    WHERE TransactionID = @txnId
                `, {
                    amount: newPaidTotal,
                    accId: effAccId,
                    desc: `Bill #${invoice.InvoiceNumber} Payment from ${invoice.CustomerName}`,
                    ref: invoice.InvoiceNumber,
                    txnId: old.TransactionID
                });
            } else {
                await tQuery(`
                    INSERT INTO Transactions (
                        TransDate, TransType, Amount, AccountID, CategoryID, Description, Reference, UserID,
                        GlobalSerialNo, SNCode, ModuleCode,
                        SourceModule, SourceID, LineType
                    )
                    VALUES (
                        @date, 'Income', @amount, @accId, 
                        (SELECT TOP 1 CategoryID FROM Categories WHERE (CategoryName = 'Business Income' OR CategoryType = 'Income') AND UserID = @userId),
                        @desc, @ref, @userId,
                        @GlobalSerialNo, @SNCode, @ModuleCode,
                        'Invoices', @invId, 'PAYMENT_IN'
                    )
                `, {
                    date: PaymentDate || todayLocal(),
                    amount: newPaidTotal,
                    accId: effAccId,
                    desc: `Bill #${invoice.InvoiceNumber} Payment from ${invoice.CustomerName}`,
                    ref: invoice.InvoiceNumber,
                    userId,
                    invId,
                    GlobalSerialNo: invoice.GlobalSerialNo || null,
                    SNCode: invoice.SNCode || null,
                    ModuleCode: invoice.ModuleCode || null
                });
            }

            await tQuery('EXEC sp_UpdateAccountBalance @id', { id: effAccId });

            // 4. Update Customer Balance
            await tQuery('EXEC sp_UpdateCustomerBalance @id', { id: invoice.CustomerID });

            // 5. ADVANCE AUTO-SETTLEMENT: agar customer ke paas advance hai to
            //    baaki CSC/bill dues automatically settle karo.
            await processKhataAfterChange(tQuery, invoice.CustomerID);

            await logAudit({
                action: 'PAYMENT',
                module: 'Billing',
                tableName: 'Invoices',
                recordId: invId,
                entityName: invoice.CustomerName || `Customer #${invoice.CustomerID}`,
                amount: payAmt,
                description: `Bill Payment Mila: #${invoice.InvoiceNumber} par ₹${payAmt.toLocaleString('en-IN')} jama hue`,
                oldData: { PaidAmount: invoice.PaidAmount, BalanceAmount: invoice.BalanceAmount, PaymentStatus: invoice.PaymentStatus },
                newData: { PaidAmount: newPaidTotal, BalanceAmount: newBalance, PaymentStatus: newStatus, PaymentMode: PaymentMode || 'Cash' },
                details: `Bill No: ${invoice.InvoiceNumber}, Customer: ${invoice.CustomerName}, Jama: ₹${payAmt}, Purana Bacha: ₹${invoice.BalanceAmount}, Naya Bacha: ₹${newBalance}`,
                userId,
                tQuery
            });

            return invoice.InvoiceNumber;
        });

        res.json({
            success: true,
            message: `Bill #${invoiceNumber} par ₹${payAmt} jama ho gaye aur Khata update ho gaya!`
        });
    } catch (err) {
        console.error('Error paying invoice:', err);
        const status = err.status || 500;
        res.status(status).json({ success: false, error: err.message });
    }
});

// DELETE invoice
router.delete('/:id', async (req, res) => {
    try {
        const invId = parseInt(req.params.id);
        const userId = req.user?.UserID || 1;

        await withTransaction(async (tQuery) => {
            const invResult = await tQuery(`
                SELECT i.*, c.CustomerName 
                FROM Invoices i 
                LEFT JOIN Customers c ON i.CustomerID = c.CustomerID 
                WHERE i.InvoiceID = @id AND i.UserID = @userId
            `, { id: invId, userId });

            if (invResult.recordset.length === 0) {
                throw new Error('Invoice nahi mila');
            }

            const oldInvoice = invResult.recordset[0];
            const customerId = oldInvoice.CustomerID;
            const invNum = oldInvoice.InvoiceNumber;
            const custName = oldInvoice.CustomerName;

            // Find and delete any linked Transactions and update accounts (Rule 1 Identity Deletion)
            const linkedTrans = await tQuery(`
                SELECT DISTINCT AccountID FROM Transactions 
                WHERE UserID = @userId AND SourceModule = 'Invoices' AND SourceID = @invId
            `, { invId, userId });

            await tQuery(`
                DELETE FROM Transactions 
                WHERE UserID = @userId AND SourceModule = 'Invoices' AND SourceID = @invId
            `, { invId, userId });

            for (const row of linkedTrans.recordset) {
                if (row.AccountID) {
                    await tQuery('EXEC sp_UpdateAccountBalance @id', { id: row.AccountID });
                }
            }

            // Delete linked khata entries and deactivate their registry records
            await tQuery(`
                UPDATE UniversalTxnRegistry
                SET IsActive = 0
                WHERE SourceModule = 'Khata'
                  AND RecordID IN (SELECT KhataID FROM KhataEntries WHERE InvoiceID = @id AND UserID = @userId)
            `, { id: invId, userId });
            await tQuery('DELETE FROM KhataEntries WHERE InvoiceID = @id AND UserID = @userId', { id: invId, userId });
            // Delete invoice items and invoice
            await tQuery('DELETE FROM InvoiceItems WHERE InvoiceID = @id', { id: invId });
            await tQuery('DELETE FROM Invoices WHERE InvoiceID = @id AND UserID = @userId', { id: invId, userId });

            // Recalculate customer balance and reopen/reallocate dues & advances (F9 Fix)
            if (customerId) {
                await tQuery('EXEC sp_UpdateCustomerBalance @id', { id: customerId });
                await processKhataAfterChange(tQuery, customerId);
            }

            await logAudit({
                action: 'DELETE',
                module: 'Billing',
                tableName: 'Invoices',
                recordId: invId,
                entityName: custName || `Customer #${customerId}`,
                amount: parseFloat(oldInvoice.TotalAmount) || 0,
                description: `Bill Delete Kiya Gaya: #${invNum} (₹${parseFloat(oldInvoice.TotalAmount || 0).toLocaleString('en-IN')})`,
                oldData: oldInvoice,
                details: `Bill No: ${invNum}, Customer: ${custName}, Total: ₹${oldInvoice.TotalAmount}, Paid: ₹${oldInvoice.PaidAmount} ko delete kiya gaya.`,
                userId,
                tQuery
            });

            try {
                await deactivateGlobalTransaction('Invoices', invId, tQuery);
            } catch (regErr) {
                console.error('Failed to deactivate global transaction for Invoices:', regErr);
                throw new Error('Failed to deactivate global transaction for Invoices: ' + regErr.message);
            }
        });

        res.json({ success: true, message: 'Invoice delete ho gaya aur Khata balance theek kar diya gaya' });
    } catch (err) {
        console.error('Error deleting invoice:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
