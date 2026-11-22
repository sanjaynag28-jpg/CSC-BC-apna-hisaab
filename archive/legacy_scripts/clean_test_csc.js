const { query } = require('../database/db');

async function cleanup() {
    await query("DELETE FROM KhataEntries WHERE CustomerID = 903");
    await query("DELETE FROM CSCApplications WHERE CustomerName = 'Test Error Check'");
    await query("DELETE FROM Customers WHERE CustomerID = 903");
    await query("DELETE FROM Transactions WHERE Description LIKE '%Test Error Check%'");
    await query("DELETE FROM UniversalTxnRegistry WHERE EntityName LIKE '%Test Error Check%'");
    console.log('Test record cleaned up successfully!');
    process.exit(0);
}
cleanup();
