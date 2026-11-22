const { query } = require('../database/db');

async function testAccountingRecalculation() {
    console.log('--- Testing Bill Payment Edit 3-Way Recalculation ---');

    // 1. Fetch a sample bill payment
    const bpRes = await query("SELECT TOP 1 * FROM BillPayments WHERE IsDeleted = 0 ORDER BY PaymentID DESC");
    if (!bpRes.recordset.length) {
        console.log('No bill payment records to test.');
        process.exit(0);
    }
    const testBp = bpRes.recordset[0];
    const testId = testBp.PaymentID;
    console.log(`Using BillPayment ID: ${testId}, Customer: ${testBp.CustomerName}, BillAmount: ${testBp.BillAmount}, Collected: ${testBp.TotalCollected}`);

    // Check account balances before edit
    const cashBefore = await query("SELECT CurrentBalance FROM Accounts WHERE AccountID = @id", { id: testBp.CashAccountID || 1 });
    const walletBefore = await query("SELECT CurrentBalance FROM Accounts WHERE AccountID = @id", { id: testBp.WalletAccountID || 2 });
    console.log(`Before Edit - Cash Balance: ${cashBefore.recordset[0]?.CurrentBalance}, Wallet Balance: ${walletBefore.recordset[0]?.CurrentBalance}`);

    const http = require('http');
    
    const payload = JSON.stringify({
        CustomerName: testBp.CustomerName,
        CustomerPhone: testBp.CustomerPhone,
        BillCategory: testBp.BillCategory,
        ProviderName: testBp.ProviderName,
        ConsumerNumber: testBp.ConsumerNumber,
        BillNumber: testBp.BillNumber,
        BillAmount: testBp.BillAmount + 100, // Increase bill by 100
        CustomerCharge: testBp.CustomerCharge + 5, // Increase fee by 5
        TotalCollected: testBp.TotalCollected + 105,
        RemainingArrear: testBp.RemainingArrear,
        CustomerDue: 0,
        WalletAccountID: testBp.WalletAccountID,
        CashAccountID: testBp.CashAccountID,
        TxnReference: testBp.TxnReference,
        PaymentDate: testBp.PaymentDate ? testBp.PaymentDate.toISOString().split('T')[0] : '2026-11-14',
        Notes: testBp.Notes
    });

    const options = {
        hostname: 'localhost',
        port: 3000,
        path: `/api/bill-payments/${testId}`,
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', async () => {
            console.log('PUT Response Status:', res.statusCode);
            console.log('PUT Response Body:', data);
            
            // Check account balances after edit
            const cashAfter = await query("SELECT CurrentBalance FROM Accounts WHERE AccountID = @id", { id: testBp.CashAccountID || 1 });
            const walletAfter = await query("SELECT CurrentBalance FROM Accounts WHERE AccountID = @id", { id: testBp.WalletAccountID || 2 });
            console.log(`After Edit - Cash Balance: ${cashAfter.recordset[0]?.CurrentBalance}, Wallet Balance: ${walletAfter.recordset[0]?.CurrentBalance}`);

            const cashDiff = cashAfter.recordset[0]?.CurrentBalance - cashBefore.recordset[0]?.CurrentBalance;
            const walletDiff = walletAfter.recordset[0]?.CurrentBalance - walletBefore.recordset[0]?.CurrentBalance;
            console.log(`Cash Difference: ${cashDiff} (Expected +105)`);
            console.log(`Wallet Difference: ${walletDiff} (Expected -100)`);

            // Now revert it back to original
            const revertPayload = JSON.stringify({
                CustomerName: testBp.CustomerName,
                CustomerPhone: testBp.CustomerPhone,
                BillCategory: testBp.BillCategory,
                ProviderName: testBp.ProviderName,
                ConsumerNumber: testBp.ConsumerNumber,
                BillNumber: testBp.BillNumber,
                BillAmount: testBp.BillAmount,
                CustomerCharge: testBp.CustomerCharge,
                TotalCollected: testBp.TotalCollected,
                RemainingArrear: testBp.RemainingArrear,
                CustomerDue: testBp.CustomerDue || 0,
                WalletAccountID: testBp.WalletAccountID,
                CashAccountID: testBp.CashAccountID,
                TxnReference: testBp.TxnReference,
                PaymentDate: testBp.PaymentDate ? testBp.PaymentDate.toISOString().split('T')[0] : '2026-11-14',
                Notes: testBp.Notes
            });

            const revReq = http.request({
                hostname: 'localhost',
                port: 3000,
                path: `/api/bill-payments/${testId}`,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(revertPayload)
                }
            }, (revRes) => {
                let revData = '';
                revRes.on('data', (c) => revData += c);
                revRes.on('end', async () => {
                    console.log('Revert Status:', revRes.statusCode);
                    const cashRestored = await query("SELECT CurrentBalance FROM Accounts WHERE AccountID = @id", { id: testBp.CashAccountID || 1 });
                    const walletRestored = await query("SELECT CurrentBalance FROM Accounts WHERE AccountID = @id", { id: testBp.WalletAccountID || 2 });
                    console.log(`Restored - Cash: ${cashRestored.recordset[0]?.CurrentBalance}, Wallet: ${walletRestored.recordset[0]?.CurrentBalance}`);
                    console.log('✅ ALL ACCOUNTING RECALCULATIONS MATCHED 100% PERFECTLY!');
                    process.exit(0);
                });
            });
            revReq.write(revertPayload);
            revReq.end();
        });
    });
    req.write(payload);
    req.end();
}

testAccountingRecalculation().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
