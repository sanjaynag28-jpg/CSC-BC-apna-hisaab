const { query } = require('../database/db');

async function findDuesCust() {
    const res = await query(`
        SELECT TOP 5 CustomerID, CustomerName, Phone, CurrentBalance, BalanceType
        FROM Customers
        WHERE CurrentBalance > 0 AND IsActive = 1
        ORDER BY CurrentBalance DESC
    `);
    console.log('Customers with dues:', res.recordset);
    process.exit(0);
}
findDuesCust();
