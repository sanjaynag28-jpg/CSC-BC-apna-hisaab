const { query } = require('../database/db');

async function fixTxn1553() {
    console.log('--- Applying Fix for F4: Transaction #1553 ---');
    
    // Check state before
    const beforeTxn = await query("SELECT TransactionID, TransType, Amount, Description, AccountID, PartyID FROM Transactions WHERE TransactionID = 1553");
    console.log('Before Txn 1553:', beforeTxn.recordset[0]);

    const beforeParty = await query("SELECT PartyID, PartyName, CurrentBalance FROM Parties WHERE PartyID = 1");
    console.log('Before Party 1 Balance:', beforeParty.recordset[0]);

    const beforeAcc = await query("SELECT AccountID, AccountName, CurrentBalance FROM Accounts WHERE AccountID = 1");
    console.log('Before Cash Account Balance:', beforeAcc.recordset[0]);

    // Update Transaction
    await query(`
        UPDATE Transactions 
        SET TransType = 'Loan Given', 
            UpdatedAt = GETDATE() 
        WHERE TransactionID = 1553
    `);
    console.log('Updated Transaction #1553 TransType to "Loan Given".');

    // Recalculate Party 1 and Account 1
    await query("EXEC sp_UpdatePartyBalance @PartyID = 1");
    await query("EXEC sp_UpdateAccountBalance @AccountID = 1");

    // Check state after
    const afterTxn = await query("SELECT TransactionID, TransType, Amount, Description, AccountID, PartyID FROM Transactions WHERE TransactionID = 1553");
    console.log('After Txn 1553:', afterTxn.recordset[0]);

    const afterParty = await query("SELECT PartyID, PartyName, CurrentBalance FROM Parties WHERE PartyID = 1");
    console.log('After Party 1 Balance:', afterParty.recordset[0]);

    const afterAcc = await query("SELECT AccountID, AccountName, CurrentBalance FROM Accounts WHERE AccountID = 1");
    console.log('After Cash Account Balance:', afterAcc.recordset[0]);

    console.log('✅ Fix for F4 completed successfully!');
    process.exit(0);
}

fixTxn1553().catch(e => {
    console.error('Error fixing F4:', e);
    process.exit(1);
});
