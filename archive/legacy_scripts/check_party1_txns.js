const { query } = require('../database/db');

async function checkParty1Txns() {
    const res = await query("SELECT TransactionID, TransDate, TransType, Amount, Description, AccountID FROM Transactions WHERE PartyID = 1 AND IsDeleted = 0 ORDER BY TransactionID ASC");
    console.log('Transactions for Party 1 (Ajay Kumar Patel):');
    console.log(res.recordset);
    process.exit(0);
}
checkParty1Txns();
