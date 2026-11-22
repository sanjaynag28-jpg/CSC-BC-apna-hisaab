const fs = require('fs');

const filePath = 'routes/bill_payments.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update import to include updateGlobalTransaction
content = content.replace(
    "const { registerGlobalTransaction, deactivateGlobalTransaction } = require('../database/globalTxnRegistry');",
    "const { registerGlobalTransaction, deactivateGlobalTransaction, updateGlobalTransaction } = require('../database/globalTxnRegistry');"
);

// 2. Add PUT /:id before DELETE /:id
const targetDelete = "// ============================================================================\n// 5. DELETE /api/bill-payments/:id";
if (!content.includes(targetDelete)) {
    console.error('Target delete string not found!');
    process.exit(1);
}

const putRouteCode = `// ============================================================================
// 5. PUT /api/bill-payments/:id - Edit / Update Existing Bill Payment Entry
// Recalculates 3 impacts: 
//   1. Wallet Outflow (Transactions table)
//   2. Cash Inflow (Transactions table)
//   3. Customer Khata Udhaar (KhataEntries table)
// ============================================================================
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user ? req.user.UserID : 1;
        const id = parseInt(req.params.id, 10);

        if (!id || isNaN(id)) {
            return res.status(400).json({ success: false, error: 'Awaidh Payment ID' });
        }

        // 1. Fetch existing record
        const check = await query(
            "SELECT * FROM BillPayments WHERE PaymentID = @id AND UserID = @userId AND IsDeleted = 0",
            { id, userId }
        );
        if (!check.recordset.length) {
            return res.status(404).json({ success: false, error: 'Bill payment record nahi mila ya pehle se deleted hai' });
        }
        const oldBp = check.recordset[0];

        const {
            CustomerName,
            CustomerPhone,
            CustomerAadhaar,
            BillCategory = oldBp.BillCategory || 'Electricity',
            ProviderName = oldBp.ProviderName,
            ConsumerNumber = oldBp.ConsumerNumber,
            BillNumber,
            BillDate,
            DueDate,
            BillAmount,
            CustomerCharge,
            CommissionEarned,
            RemainingArrear,
            PaymentMode = oldBp.PaymentMode || 'Cash',
            WalletAccountID,
            CashAccountID,
            Status,
            TxnReference,
            PaymentDate,
            PaymentTime,
            Notes
        } = req.body;

        const cleanCustName = cleanCustomerName(CustomerName || oldBp.CustomerName);
        if (!cleanCustName) {
            return res.status(400).json({ success: false, error: 'Grahak ka naam aavashyak hai.' });
        }
        if (!ConsumerNumber) {
            return res.status(400).json({ success: false, error: 'Khata / Consumer / Loan number aavashyak hai.' });
        }

        const numBillAmount = parseFloat(BillAmount) || 0;
        const numTotalBillAmount = parseFloat(req.body.TotalBillAmount) || numBillAmount;
        const defaultCharge = calculateBillCustomerCharge(BillCategory, numBillAmount);
        const numCustomerCharge = !isNaN(parseFloat(CustomerCharge)) ? parseFloat(CustomerCharge) : defaultCharge;
        const numCommission = CommissionEarned !== undefined ? (parseFloat(CommissionEarned) || 0) : calculateCommission(BillCategory, numBillAmount);
        const numPayable = parseFloat((numBillAmount + numCustomerCharge).toFixed(2));
        
        let numTotalCollected = parseFloat(req.body.TotalCollected);
        if (isNaN(numTotalCollected) || (numTotalCollected <= 0 && parseFloat(req.body.CustomerDue || 0) <= 0 && numPayable > 0)) {
            numTotalCollected = parseFloat(req.body.CashReceived) || numPayable;
        }
        const numCustomerDue = req.body.CustomerDue !== undefined && !isNaN(parseFloat(req.body.CustomerDue))
            ? parseFloat(req.body.CustomerDue)
            : Math.max(0, parseFloat((numPayable - numTotalCollected).toFixed(2)));
        const numNetProfit = parseFloat((numCustomerCharge + numCommission).toFixed(2));
        const numRemainingArrear = req.body.RemainingArrear !== undefined && !isNaN(parseFloat(req.body.RemainingArrear))
            ? parseFloat(req.body.RemainingArrear)
            : Math.max(0, parseFloat((numTotalBillAmount - numBillAmount).toFixed(2)));

        const resolvedStatus = Status ? Status : (numCustomerDue > 0 ? 'Partial' : 'Success');

        // Auto-Register or resolve Customer in Customers table
        let resolvedCustomerId = oldBp.CustomerID;
        try {
            const customerResolution = await resolveOrCreateCustomer({
                customerName: cleanCustName,
                customerPhone: CustomerPhone || null,
                phone: CustomerPhone || null,
                customerAadhaar: CustomerAadhaar || null,
                aadhaar: CustomerAadhaar || null,
                source: \`Auto-registered via Bill Payment (\${BillCategory} - \${ProviderName || ''})\`,
                notes: \`Auto-registered via Bill Payment (\${BillCategory} - \${ProviderName || ''})\`,
                skipFamilyLink: !!(req.body.SkipFamilyLink || req.body.skipFamilyLink),
                userId
            });
            if (customerResolution && customerResolution.customer) {
                resolvedCustomerId = customerResolution.customer.CustomerID;
            }
        } catch (cErr) {
            console.error('Customer auto-resolution warning on edit:', cErr.message);
        }

        const todayStr = todayLocal();
        const payDate = PaymentDate || (oldBp.PaymentDate ? (oldBp.PaymentDate.toISOString ? oldBp.PaymentDate.toISOString().split('T')[0] : String(oldBp.PaymentDate).slice(0, 10)) : todayStr);
        const payTime = PaymentTime || oldBp.PaymentTime || new Date().toLocaleTimeString('en-US', { hour12: false });
        const effWalletId = WalletAccountID ? parseInt(WalletAccountID, 10) : (oldBp.WalletAccountID || 2);
        const effCashId = CashAccountID ? parseInt(CashAccountID, 10) : (oldBp.CashAccountID || 1);
        const oldWalletId = oldBp.WalletAccountID;
        const oldCashId = oldBp.CashAccountID || 1;
        const oldCustomerId = oldBp.CustomerID;
        const txnRef = TxnReference || oldBp.TxnReference || \`BP-\${id}\`;

        // Atomic DB Transaction: Recalculate and update the 3 impacts + BillPayments
        await withTransaction(async (tQuery) => {
            // -------------------------------------------------------------
            // IMPACT 1: Wallet Outflow Recalculation (Transactions table)
            // -------------------------------------------------------------
            if (oldWalletId) {
                await tQuery(\`
                    DELETE FROM Transactions
                    WHERE AccountID = @wId AND UserID = @userId AND TransType = 'Expense' AND (
                        Reference = @ref1 OR (LEN(@ref2) > 0 AND Reference = @ref2)
                    )
                \`, { wId: oldWalletId, userId, ref1: \`BP-\${id}\`, ref2: oldBp.TxnReference || '' });
                await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @wId', { wId: oldWalletId });
            }

            if (effWalletId && numBillAmount > 0) {
                await tQuery(\`
                    INSERT INTO Transactions (
                        AccountID, TransType, Amount, Description, Reference, TransDate, UserID, CreatedAt
                    ) VALUES (
                        @walletId, 'Expense', @amount, @desc, @ref, @date, @userId, GETDATE()
                    )
                \`, {
                    walletId: effWalletId,
                    amount: numBillAmount,
                    desc: \`\${BillCategory} Paid - \${ProviderName} [Acc: \${ConsumerNumber}] (\${cleanCustName})\`,
                    ref: txnRef,
                    date: payDate,
                    userId
                });
                await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: effWalletId });
            }

            // -------------------------------------------------------------
            // IMPACT 2: Cash Inflow Recalculation (Galla Transactions table)
            // -------------------------------------------------------------
            if (oldCashId) {
                await tQuery(\`
                    DELETE FROM Transactions
                    WHERE AccountID = @cId AND UserID = @userId AND TransType = 'Income' AND (
                        Reference = @ref1 OR (LEN(@ref2) > 0 AND Reference = @ref2)
                    )
                \`, { cId: oldCashId, userId, ref1: \`BP-\${id}\`, ref2: oldBp.TxnReference || '' });
                await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @cId', { cId: oldCashId });
            }

            if (effCashId && numTotalCollected > 0) {
                await tQuery(\`
                    INSERT INTO Transactions (
                        AccountID, TransType, Amount, Description, Reference, TransDate, UserID, CreatedAt
                    ) VALUES (
                        @cashId, 'Income', @amount, @desc, @ref, @date, @userId, GETDATE()
                    )
                \`, {
                    cashId: effCashId,
                    amount: numTotalCollected,
                    desc: \`Cash for \${BillCategory} - \${ProviderName} [Acc: \${ConsumerNumber}] (\${cleanCustName}) [Bill: ₹\${numBillAmount} + Fee: ₹\${numCustomerCharge}]\`,
                    ref: txnRef,
                    date: payDate,
                    userId
                });
                await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: effCashId });
            }

            // -------------------------------------------------------------
            // IMPACT 3: Customer Udhaar / Khatabook Recalculation (KhataEntries)
            // -------------------------------------------------------------
            await tQuery(\`
                DELETE FROM KhataEntries
                WHERE UserID = @userId AND (
                    ReferenceNo = @ref1 OR (LEN(@ref2) > 0 AND ReferenceNo = @ref2)
                )
            \`, { userId, ref1: \`BP-\${id}\`, ref2: oldBp.TxnReference || '' });

            if (oldCustomerId) {
                await tQuery('EXEC sp_UpdateCustomerBalance @CustomerID = @cId', { cId: oldCustomerId });
            }

            if (resolvedCustomerId && numCustomerDue > 0) {
                await tQuery(\`
                    INSERT INTO KhataEntries (
                        CustomerID, EntryDate, EntryTime, EntryType, Amount,
                        AccountID, PaymentMode, Description, ReferenceNo, ModuleCode, UserID
                    )
                    VALUES (
                        @cId, @date, @time, 'Gave', @amount,
                        @accId, 'Due', @desc, @ref, 'BP', @userId
                    )
                \`, {
                    cId: resolvedCustomerId,
                    date: payDate,
                    time: payTime ? payTime.slice(0, 5) : '12:00',
                    amount: numCustomerDue,
                    accId: effCashId,
                    desc: \`Bill Payment Bakiya - \${BillCategory} (\${ProviderName || ''}) [Consumer: \${ConsumerNumber}]\`,
                    ref: txnRef,
                    userId
                });
                await tQuery('EXEC sp_UpdateCustomerBalance @CustomerID = @cId', { cId: resolvedCustomerId });
            }

            // -------------------------------------------------------------
            // 4. Update BillPayments Table Row
            // -------------------------------------------------------------
            const updateSql = \`
                UPDATE BillPayments SET
                    CustomerID = @CustomerID,
                    CustomerName = @CustomerName,
                    CustomerPhone = @CustomerPhone,
                    CustomerAadhaar = @CustomerAadhaar,
                    BillCategory = @BillCategory,
                    ProviderName = @ProviderName,
                    ConsumerNumber = @ConsumerNumber,
                    BillNumber = @BillNumber,
                    BillDate = @BillDate,
                    DueDate = @DueDate,
                    TotalBillAmount = @TotalBillAmount,
                    BillAmount = @BillAmount,
                    CustomerCharge = @CustomerCharge,
                    TotalCollected = @TotalCollected,
                    CustomerDue = @CustomerDue,
                    CommissionEarned = @CommissionEarned,
                    NetProfit = @NetProfit,
                    RemainingArrear = @RemainingArrear,
                    PaymentMode = @PaymentMode,
                    WalletAccountID = @WalletAccountID,
                    CashAccountID = @CashAccountID,
                    Status = @Status,
                    TxnReference = @TxnReference,
                    PaymentDate = @PaymentDate,
                    PaymentTime = @PaymentTime,
                    Notes = @Notes,
                    ExtraFieldsJson = @ExtraFieldsJson,
                    UpdatedAt = GETDATE()
                WHERE PaymentID = @id AND UserID = @userId
            \`;

            const updateParams = {
                id,
                CustomerID: resolvedCustomerId,
                CustomerName: cleanCustName,
                CustomerPhone: CustomerPhone || null,
                CustomerAadhaar: CustomerAadhaar || null,
                BillCategory: BillCategory || 'Electricity',
                ProviderName: ProviderName || '',
                ConsumerNumber: ConsumerNumber,
                BillNumber: BillNumber || null,
                BillDate: BillDate || null,
                DueDate: DueDate || null,
                TotalBillAmount: numTotalBillAmount,
                BillAmount: numBillAmount,
                CustomerCharge: numCustomerCharge,
                TotalCollected: numTotalCollected,
                CustomerDue: numCustomerDue,
                CommissionEarned: numCommission,
                NetProfit: numNetProfit,
                RemainingArrear: numRemainingArrear,
                PaymentMode: PaymentMode || 'Cash',
                WalletAccountID: effWalletId,
                CashAccountID: effCashId,
                Status: resolvedStatus,
                TxnReference: txnRef,
                PaymentDate: payDate,
                PaymentTime: payTime,
                Notes: Notes || null,
                ExtraFieldsJson: req.body.ExtraFieldsJson ? (typeof req.body.ExtraFieldsJson === 'object' ? JSON.stringify(req.body.ExtraFieldsJson) : String(req.body.ExtraFieldsJson)) : null,
                userId
            };

            await tQuery(updateSql, updateParams);
        });

        // Update Universal Transaction Registry
        try {
            if (typeof updateGlobalTransaction === 'function') {
                await updateGlobalTransaction({
                    sourceModule: 'BillPay',
                    recordId: id,
                    entityName: \`\${cleanCustName} (\${BillCategory})\`,
                    amount: numTotalCollected,
                    transDate: payDate
                });
            }
        } catch (gErr) {
            console.error('UniversalTxnRegistry update warning:', gErr.message);
        }

        // Audit Log
        try {
            await logAudit({
                action: 'UPDATE',
                table: 'BillPayments',
                recordId: id,
                entityName: cleanCustName,
                amount: numTotalCollected,
                module: 'BillPay',
                description: \`Bill payment ID \${id} edit kiya gaya. Galla (₹\${numTotalCollected}), Wallet (₹\${numBillAmount}), Udhaar (₹\${numCustomerDue}) teeno recalculate ho gaye.\`,
                userId
            });
        } catch (_) { }

        res.json({
            success: true,
            message: \`Bill Payment safaltapoorvak update ho gaya! (Galla, Wallet aur Khata teeno recalculate ho gaye)\`,
            paymentId: id
        });

    } catch (err) {
        console.error('Error updating bill payment:', err);
        res.status(500).json({ success: false, error: 'Bill payment update karne me error: ' + err.message });
    }
});

// ============================================================================
// 6. DELETE /api/bill-payments/:id`;

content = content.replace(targetDelete, putRouteCode);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated routes/bill_payments.js with PUT /:id!');
