const { query } = require('../database/db');

async function checkBillPayments() {
    try {
        const bpRows = await query('SELECT TOP 10 * FROM BillPayments ORDER BY PaymentID DESC');
        console.log('Columns in BillPayments:', Object.keys(bpRows.recordset[0] || {}));
        console.log('Recent 10 rows:');
        bpRows.recordset.forEach(r => {
            console.log({
                PaymentID: r.PaymentID,
                CustomerName: r.CustomerName,
                BillType: r.BillType,
                BillAmount: r.BillAmount,
                TotalBillAmount: r.TotalBillAmount,
                PaidAmount: r.PaidAmount,
                TotalCollected: r.TotalCollected,
                CustomerDue: r.CustomerDue,
                RemainingBill: r.RemainingBill,
                PaymentStatus: r.PaymentStatus,
                Status: r.Status
            });
        });
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

checkBillPayments();
