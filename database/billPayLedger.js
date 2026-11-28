/**
 * database/billPayLedger.js
 * Rule 1 Single-Point Ledger Writer for Bill Payments (CREATE / UPDATE / DELETE).
 * Enforces SourceModule='BillPay', SourceID, and LineType ('BILL_OUT', 'CASH_IN').
 */

async function writeBillPayLedger(tQuery, bp, action, options = {}) {
    const paymentId = bp.PaymentID || bp.id;
    if (!paymentId) throw new Error('writeBillPayLedger: PaymentID missing');

    const userId = bp.UserID || bp.userId || options.userId || 1;
    const effWalletId = (bp.WalletAccountID !== undefined && bp.WalletAccountID !== null) ? bp.WalletAccountID : options.walletId;
    const effCashId = (bp.CashAccountID !== undefined && bp.CashAccountID !== null) ? bp.CashAccountID : options.cashId;
    const oldWalletId = options.oldWalletId || bp.oldWalletId;
    const oldCashId = options.oldCashId || bp.oldCashId;

    // Strict multi-tenant security verification: ensure accounts belong strictly to the same UserID
    if (effWalletId) {
        const wChk = await tQuery('SELECT AccountID FROM Accounts WHERE AccountID = @id AND UserID = @userId', { id: effWalletId, userId });
        if (wChk.recordset.length === 0) {
            throw new Error(`writeBillPayLedger multi-tenant security error: WalletAccountID ${effWalletId} does not belong to UserID ${userId}`);
        }
    }

    if (effCashId) {
        const cChk = await tQuery('SELECT AccountID FROM Accounts WHERE AccountID = @id AND UserID = @userId', { id: effCashId, userId });
        if (cChk.recordset.length === 0) {
            throw new Error(`writeBillPayLedger multi-tenant security error: CashAccountID ${effCashId} does not belong to UserID ${userId}`);
        }
    }

    if (action === 'DELETE' || action === 'UPDATE') {
        // Strictly delete ONLY this payment's mirror rows by SourceModule + SourceID + UserID
        await tQuery(`
            DELETE FROM Transactions
            WHERE SourceModule = 'BillPay' AND SourceID = @paymentId AND UserID = @userId
        `, { paymentId, userId });

        // Recalculate balances for old accounts if changed
        if (action === 'DELETE') {
            if (effWalletId) await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: effWalletId });
            if (effCashId) await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: effCashId });
            return;
        }
    }

    if (action === 'CREATE' || action === 'UPDATE') {
        const bpRef = `BP-${paymentId}`;
        const numBillAmount = Number(bp.BillAmount || bp.numBillAmount || 0);
        const numTotalCollected = Number(bp.TotalCollected || bp.numTotalCollected || 0);
        const payDate = bp.PaymentDate || options.payDate || new Date().toISOString().slice(0, 10);
        const cleanCustName = bp.CustomerName || bp.cleanCustName || 'Customer';
        const billCategory = bp.BillCategory || 'Electricity';
        const providerName = bp.ProviderName || '';
        const consumerNumber = bp.ConsumerNumber || '';
        const numCustomerCharge = Number(bp.CustomerCharge || 0);

        const sn = bp.GlobalSerialNo || options.globalSerialNo || null;
        const snCode = bp.SNCode || options.snCode || null;
        const modCode = bp.ModuleCode || options.moduleCode || null;

        // 1. Wallet Outflow (Bill Paid)
        if (effWalletId && numBillAmount > 0) {
            await tQuery(`
                INSERT INTO Transactions (
                    AccountID, TransType, Amount, Description, Reference, TransDate, UserID, CreatedAt,
                    SourceModule, SourceID, LineType, GlobalSerialNo, SNCode, ModuleCode
                ) VALUES (
                    @walletId, 'Expense', @amount, @desc, @ref, @date, @userId, GETDATE(),
                    'BillPay', @paymentId, 'BILL_OUT', @sn, @snCode, @modCode
                )
            `, {
                walletId: effWalletId,
                amount: numBillAmount,
                desc: `${billCategory} Paid - ${providerName} [Acc: ${consumerNumber}] (${cleanCustName})`,
                ref: bpRef,
                date: payDate,
                userId,
                paymentId,
                sn,
                snCode,
                modCode
            });
            await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: effWalletId });
        }

        // 2. Cash in Hand Inflow (Cash Collected from Customer)
        if (effCashId && numTotalCollected > 0) {
            await tQuery(`
                INSERT INTO Transactions (
                    AccountID, TransType, Amount, Description, Reference, TransDate, UserID, CreatedAt,
                    SourceModule, SourceID, LineType, GlobalSerialNo, SNCode, ModuleCode
                ) VALUES (
                    @cashId, 'Income', @amount, @desc, @ref, @date, @userId, GETDATE(),
                    'BillPay', @paymentId, 'CASH_IN', @sn, @snCode, @modCode
                )
            `, {
                cashId: effCashId,
                amount: numTotalCollected,
                desc: `Cash for ${billCategory} - ${providerName} [Acc: ${consumerNumber}] (${cleanCustName}) [Bill: ₹${numBillAmount} + Fee: ₹${numCustomerCharge}]`,
                ref: bpRef,
                date: payDate,
                userId,
                paymentId,
                sn,
                snCode,
                modCode
            });
            await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: effCashId });
        }

        // Reconcile current & old accounts even when amounts become 0 on UPDATE
        if (action === 'UPDATE') {
            if (effWalletId && numBillAmount <= 0) {
                await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: effWalletId });
            }
            if (effCashId && numTotalCollected <= 0 && effCashId !== effWalletId) {
                await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: effCashId });
            }
            if (oldWalletId && oldWalletId !== effWalletId) {
                const oWChk = await tQuery('SELECT AccountID FROM Accounts WHERE AccountID = @id AND UserID = @userId', { id: oldWalletId, userId });
                if (oWChk.recordset.length > 0) {
                    await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: oldWalletId });
                }
            }
            if (oldCashId && oldCashId !== effCashId) {
                const oCChk = await tQuery('SELECT AccountID FROM Accounts WHERE AccountID = @id AND UserID = @userId', { id: oldCashId, userId });
                if (oCChk.recordset.length > 0) {
                    await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: oldCashId });
                }
            }
        }
    }
}

module.exports = {
    writeBillPayLedger
};
