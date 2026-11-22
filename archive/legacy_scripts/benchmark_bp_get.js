const { query } = require('../database/db');

async function benchmark() {
    const t0 = Date.now();
    const result = await query(
        `SELECT bp.*, c.FamilyName, c.Relationship, c.IsFamilyHead 
         FROM BillPayments bp 
         LEFT JOIN Customers c ON bp.CustomerID = c.CustomerID 
         WHERE bp.PaymentID = 28 AND bp.UserID = 1`
    );
    const ms = Date.now() - t0;
    console.log(`Query took ${ms} ms. Record found:`, result.recordset.length > 0);
    process.exit(0);
}
benchmark();
