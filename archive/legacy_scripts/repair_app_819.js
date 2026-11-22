const { query, withTransaction } = require('../database/db');
const { syncCSCToKhata, processKhataAfterChange } = require('../database/khataEngine');

async function repair819() {
    console.log('=== REPAIRING APP ID 819 (Shameem) ===');
    try {
        await withTransaction(async (tQuery) => {
            // Check App 819
            const appRes = await tQuery('SELECT * FROM CSCApplications WHERE AppID = 819');
            if (appRes.recordset.length === 0) {
                throw new Error('App 819 not found');
            }
            const app = appRes.recordset[0];
            const userId = app.UserID || 1;

            // Find Cash & Bank Accounts
            const cashAcc = await tQuery("SELECT TOP 1 AccountID FROM Accounts WHERE UserID = @userId AND AccountType = 'Cash' AND IsActive = 1 ORDER BY AccountID ASC", { userId });
            const bankAcc = await tQuery("SELECT TOP 1 AccountID FROM Accounts WHERE UserID = @userId AND AccountType = 'Bank' AND IsActive = 1 ORDER BY AccountID ASC", { userId });
            const cashAccId = cashAcc.recordset[0]?.AccountID || 1;
            const bankAccId = bankAcc.recordset[0]?.AccountID || 2;

            // 1. Insert CSC_FEE_IN
            const feeInDesc = `CSC Fee - ${app.ServiceType} (${app.CustomerName})${app.AckNumber ? ' [Ack: ' + app.AckNumber + ']' : ''}`;
            const feeIn = await tQuery(`
                INSERT INTO Transactions (
                    TransDate, TransTime, TransType, Amount, AccountID,
                    Description, Reference, UserID, Tags, IsDeleted, CreatedAt, UpdatedAt
                )
                SELECT
                    @date, '15:55:04', 'Income', @amt, @accId,
                    @desc, @ref, @userId, 'CSC_FEE_IN', 0, GETDATE(), GETDATE()
                WHERE NOT EXISTS (
                    SELECT 1 FROM Transactions
                    WHERE Reference = @ref AND UserID = @userId
                      AND Tags = 'CSC_FEE_IN' AND TransType = 'Income'
                      AND AccountID = @accId AND Amount = @amt AND ISNULL(IsDeleted, 0) = 0
                )
            `, {
                date: app.ApplyDate || '2026-11-14',
                amt: app.PaidAmount, // 200
                accId: cashAccId,
                desc: feeInDesc,
                ref: 'APP-819',
                userId
            });
            console.log(feeIn.rowsAffected[0] ? '✅ Inserted CSC_FEE_IN: ₹200 in Cash Account' : 'ℹ️ CSC_FEE_IN already exists; skipped duplicate:', cashAccId);

            // 2. Insert CSC_GOVT_FEE_OUT
            const govtDesc = `CSC Govt Fee - ${app.ServiceType} (${app.CustomerName})${app.AckNumber ? ' [Ack: ' + app.AckNumber + ']' : ''}`;
            const govtFeeOut = await tQuery(`
                INSERT INTO Transactions (
                    TransDate, TransTime, TransType, Amount, AccountID,
                    Description, Reference, UserID, Tags, IsDeleted, CreatedAt, UpdatedAt
                )
                SELECT
                    @date, '15:55:04', 'Expense', @amt, @accId,
                    @desc, @ref, @userId, 'CSC_GOVT_FEE_OUT', 0, GETDATE(), GETDATE()
                WHERE NOT EXISTS (
                    SELECT 1 FROM Transactions
                    WHERE Reference = @ref AND UserID = @userId
                      AND Tags = 'CSC_GOVT_FEE_OUT' AND TransType = 'Expense'
                      AND AccountID = @accId AND Amount = @amt AND ISNULL(IsDeleted, 0) = 0
                )
            `, {
                date: app.ApplyDate || '2026-11-14',
                amt: app.GovtFee, // 150
                accId: bankAccId,
                desc: govtDesc,
                ref: 'APP-819',
                userId
            });
            console.log(govtFeeOut.rowsAffected[0] ? '✅ Inserted CSC_GOVT_FEE_OUT: ₹150 in Bank Account' : 'ℹ️ CSC_GOVT_FEE_OUT already exists; skipped duplicate:', bankAccId);

            // 3. Update account balances
            await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: cashAccId });
            await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: bankAccId });
            console.log('✅ Account balances updated');

            // 4. Khata sync
            if (app.CustomerID) {
                await syncCSCToKhata(tQuery, {
                    CustomerID: app.CustomerID,
                    CSCAppID: 819,
                    TotalFee: app.TotalFee,
                    PaidAmount: app.PaidAmount,
                    EntryDate: '2026-11-14',
                    PaymentMode: app.PaymentMode || 'Cash',
                    ServiceType: app.ServiceType,
                    UserID: userId
                });
                await processKhataAfterChange(tQuery, app.CustomerID);
                console.log('✅ Khata sync completed for Customer', app.CustomerID);
            }
        });

        console.log('=== APP 819 REPAIR COMPLETE! ===');
    } catch (err) {
        console.error('Repair error:', err);
        throw err;
    }
}

repair819()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Repair failed:', err);
        process.exit(1);
    });
