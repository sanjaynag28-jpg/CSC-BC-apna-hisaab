const { query } = require('../database/db');

async function checkTxn1553() {
    const txn = await query("SELECT * FROM Transactions WHERE TransactionID = 1553");
    console.log('Transaction #1553:', txn.recordset[0]);
    if (txn.recordset[0] && txn.recordset[0].PartyID) {
        const party = await query("SELECT * FROM Parties WHERE PartyID = @id", { id: txn.recordset[0].PartyID });
        console.log('Associated Party:', party.recordset[0]);
    }
    process.exit(0);
}
checkTxn1553();
