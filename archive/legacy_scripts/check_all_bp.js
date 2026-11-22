const { query } = require('../database/db');

async function checkAll() {
    try {
        const rows = await query(`
            SELECT PaymentID, CustomerName, ConsumerNumber, BillAmount, TotalBillAmount, RemainingArrear, CustomerDue, CreatedAt 
            FROM BillPayments 
            ORDER BY PaymentID ASC
        `);
        console.table(rows.recordset);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

checkAll();
