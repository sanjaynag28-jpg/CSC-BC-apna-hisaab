'use strict';

const crypto = require('crypto');
const safety = require('../tests/test-safety');
safety.assertIsolatedDatabase();

const { query, withTransaction, closePool } = require('../database/db');

function requiredId(name) {
    const value = Number(process.env[name]);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive ID from the isolated test database.`);
    return value;
}

async function runTest() {
    const fixture = {
        customerId: requiredId('TEST_CUSTOMER_ID'),
        userId: requiredId('TEST_USER_ID'),
        cashAccountId: requiredId('TEST_CASH_ACCOUNT_ID'),
        walletAccountId: requiredId('TEST_WALLET_ACCOUNT_ID')
    };
    const runSuffix = `${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
    const testRef = `TEST-DUES-${runSuffix}`;
    const testRef2 = `TEST-DUES-RECOVER-${runSuffix}`;
    let testCust = null;
    let cleanupNeeded = false;

    try {
        await safety.verifyDatabaseTarget(query);
        const fixtureResult = await query(`
            SELECT CustomerID, CustomerName, CurrentBalance
            FROM Customers
            WHERE CustomerID = @customerId AND UserID = @userId
              AND CustomerName LIKE 'TEST[_]%' AND ISNULL(IsActive, 1) = 1
        `, { customerId: fixture.customerId, userId: fixture.userId });
        testCust = fixtureResult.recordset[0];
        if (!testCust) throw new Error('Configured customer fixture must be an active TEST_-prefixed customer owned by TEST_USER_ID.');

        const accountResult = await query(`
            SELECT AccountID, AccountType
            FROM Accounts
            WHERE UserID = @userId AND IsActive = 1
              AND AccountID IN (@cashAccountId, @walletAccountId)
        `, fixture);
        const accounts = accountResult.recordset;
        if (!accounts.some(a => a.AccountID === fixture.cashAccountId && a.AccountType === 'Cash') ||
            !accounts.some(a => a.AccountID === fixture.walletAccountId && a.AccountType !== 'Cash')) {
            throw new Error('Configured cash and wallet account fixtures must belong to TEST_USER_ID.');
        }

        const initialBalance = parseFloat(testCust.CurrentBalance || 0);
        console.log(`Using isolated test customer #${testCust.CustomerID} (${testCust.CustomerName}).`);

        cleanupNeeded = true;
        await withTransaction(async (tQuery) => {
            const insBp = await tQuery(`
                INSERT INTO BillPayments (
                    CustomerID, CustomerName, CustomerPhone, BillCategory, ProviderName, ConsumerNumber,
                    BillAmount, CustomerCharge, TotalCollected, CustomerDue, CommissionEarned, NetProfit,
                    PaymentMode, WalletAccountID, CashAccountID, Status, TxnReference, PaymentDate, PaymentTime, UserID
                )
                OUTPUT INSERTED.PaymentID
                VALUES (
                    @cId, @cName, '9999999999', 'Electricity', 'Test Provider', 'TEST-CONSUMER',
                    100.00, 10.00, 105.00, 5.00, 15.00, 25.00,
                    'Cash', @walletAccountId, @cashAccountId, 'Partial', @ref, CAST(GETDATE() AS DATE), '12:00', @userId
                )
            `, {
                cId: testCust.CustomerID, cName: testCust.CustomerName, ref: testRef,
                walletAccountId: fixture.walletAccountId, cashAccountId: fixture.cashAccountId, userId: fixture.userId
            });

            await tQuery(`
                INSERT INTO Transactions (AccountID, TransType, Amount, Description, Reference, TransDate, UserID, CreatedAt)
                VALUES (@walletAccountId, 'Expense', 100.00, 'Isolated test bill payment', @ref, CAST(GETDATE() AS DATE), @userId, GETDATE())
            `, { walletAccountId: fixture.walletAccountId, ref: testRef, userId: fixture.userId });
            await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @accountId', { accountId: fixture.walletAccountId });

            await tQuery(`
                INSERT INTO Transactions (AccountID, TransType, Amount, Description, Reference, TransDate, UserID, CreatedAt)
                VALUES (@cashAccountId, 'Income', 105.00, 'Isolated test cash collected', @ref, CAST(GETDATE() AS DATE), @userId, GETDATE())
            `, { cashAccountId: fixture.cashAccountId, ref: testRef, userId: fixture.userId });
            await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @accountId', { accountId: fixture.cashAccountId });

            await tQuery(`
                INSERT INTO KhataEntries (CustomerID, EntryDate, EntryTime, EntryType, Amount, AccountID, PaymentMode, Description, ReferenceNo, ModuleCode, UserID)
                VALUES (@cId, CAST(GETDATE() AS DATE), '12:00', 'Gave', 5.00, @cashAccountId, 'Due', 'Isolated test due', @ref, 'BP', @userId)
            `, { cId: testCust.CustomerID, cashAccountId: fixture.cashAccountId, ref: testRef, userId: fixture.userId });
            await tQuery('EXEC sp_UpdateCustomerBalance @CustomerID = @cId', { cId: testCust.CustomerID });
            return insBp.recordset[0].PaymentID;
        });

        const afterPartial = await query('SELECT CurrentBalance FROM Customers WHERE CustomerID = @cId', { cId: testCust.CustomerID });
        const partialBalance = parseFloat(afterPartial.recordset[0].CurrentBalance);
        if (Math.abs(partialBalance - (initialBalance + 5)) > 0.01) {
            throw new Error(`Customer balance mismatch after partial payment: expected ${initialBalance + 5}, got ${partialBalance}`);
        }

        await withTransaction(async (tQuery) => {
            await tQuery(`
                INSERT INTO BillPayments (
                    CustomerID, CustomerName, CustomerPhone, BillCategory, ProviderName, ConsumerNumber,
                    BillAmount, CustomerCharge, TotalCollected, CustomerDue, CommissionEarned, NetProfit,
                    PaymentMode, WalletAccountID, CashAccountID, Status, TxnReference, PaymentDate, PaymentTime, UserID
                )
                VALUES (
                    @cId, @cName, '9999999999', 'Electricity', 'Test Provider', 'TEST-CONSUMER',
                    200.00, 10.00, 215.00, 0.00, 15.00, 25.00,
                    'Cash', @walletAccountId, @cashAccountId, 'Success', @ref, CAST(GETDATE() AS DATE), '12:00', @userId
                )
            `, {
                cId: testCust.CustomerID, cName: testCust.CustomerName, ref: testRef2,
                walletAccountId: fixture.walletAccountId, cashAccountId: fixture.cashAccountId, userId: fixture.userId
            });

            await tQuery(`
                INSERT INTO Transactions (AccountID, TransType, Amount, Description, Reference, TransDate, UserID, CreatedAt)
                VALUES (@walletAccountId, 'Expense', 200.00, 'Isolated test recovery bill', @ref, CAST(GETDATE() AS DATE), @userId, GETDATE())
            `, { walletAccountId: fixture.walletAccountId, ref: testRef2, userId: fixture.userId });
            await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @accountId', { accountId: fixture.walletAccountId });

            await tQuery(`
                INSERT INTO Transactions (AccountID, TransType, Amount, Description, Reference, TransDate, UserID, CreatedAt)
                VALUES (@cashAccountId, 'Income', 215.00, 'Isolated test recovery cash', @ref, CAST(GETDATE() AS DATE), @userId, GETDATE())
            `, { cashAccountId: fixture.cashAccountId, ref: testRef2, userId: fixture.userId });
            await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @accountId', { accountId: fixture.cashAccountId });

            await tQuery(`
                INSERT INTO KhataEntries (CustomerID, EntryDate, EntryTime, EntryType, Amount, AccountID, PaymentMode, Description, ReferenceNo, ModuleCode, UserID)
                VALUES (@cId, CAST(GETDATE() AS DATE), '12:00', 'Got', 5.00, @cashAccountId, 'Cash', 'Isolated test recovery', @ref, 'BP', @userId)
            `, { cId: testCust.CustomerID, cashAccountId: fixture.cashAccountId, ref: testRef2, userId: fixture.userId });
            await tQuery('EXEC sp_UpdateCustomerBalance @CustomerID = @cId', { cId: testCust.CustomerID });
        });

        const afterRecovery = await query('SELECT CurrentBalance FROM Customers WHERE CustomerID = @cId', { cId: testCust.CustomerID });
        const recoveredBalance = parseFloat(afterRecovery.recordset[0].CurrentBalance);
        if (Math.abs(recoveredBalance - initialBalance) > 0.01) {
            throw new Error(`Customer balance mismatch after recovery: expected ${initialBalance}, got ${recoveredBalance}`);
        }
        console.log('✅ Isolated dues and recovery checks passed.');
    } finally {
        try {
            if (testCust && cleanupNeeded) {
                await withTransaction(async (tQuery) => {
                    await tQuery('DELETE FROM Transactions WHERE Reference IN (@r1, @r2)', { r1: testRef, r2: testRef2 });
                    await tQuery('DELETE FROM KhataEntries WHERE ReferenceNo IN (@r1, @r2)', { r1: testRef, r2: testRef2 });
                    await tQuery('DELETE FROM BillPayments WHERE TxnReference IN (@r1, @r2)', { r1: testRef, r2: testRef2 });
                    await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @accountId', { accountId: fixture.cashAccountId });
                    await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @accountId', { accountId: fixture.walletAccountId });
                    await tQuery('EXEC sp_UpdateCustomerBalance @CustomerID = @cId', { cId: testCust.CustomerID });
                });
            }
        } finally {
            await closePool();
        }
    }
}

runTest().catch((err) => {
    console.error('Test failed:', err);
    process.exitCode = 1;
});
