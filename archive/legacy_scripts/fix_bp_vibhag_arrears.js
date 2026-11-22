const { query, withTransaction } = require('../database/db');

async function fixVibhagArrears() {
    console.log('=== FIXING CORRUPTED VIBHAG ARREARS & TOTAL BILL AMOUNTS ===');

    try {
        await withTransaction(async (tQuery) => {
            // IDs with false RemainingArrear calculated from sticky previous TotalBillAmount
            const falseArrearIds = [8, 9, 10, 11, 12, 14, 20, 21, 28];
            // IDs with corrupted TotalBillAmount from sticky previous bill
            const falseTotalBillIds = [7, 16, 17, 19, 24, 25, 27];

            // 1. Fix false arrears: set RemainingArrear = 0 and TotalBillAmount = BillAmount
            const res1 = await tQuery(`
                UPDATE BillPayments
                SET RemainingArrear = 0,
                    TotalBillAmount = BillAmount,
                    UpdatedAt = GETDATE()
                WHERE PaymentID IN (${falseArrearIds.join(',')})
            `);
            console.log(`✅ Fixed false RemainingArrear for IDs [${falseArrearIds.join(', ')}]: ${res1.rowsAffected[0]} rows updated`);

            // 2. Fix false TotalBillAmount for bills where BillAmount exceeded the stuck old TotalBill
            const res2 = await tQuery(`
                UPDATE BillPayments
                SET TotalBillAmount = BillAmount,
                    UpdatedAt = GETDATE()
                WHERE PaymentID IN (${falseTotalBillIds.join(',')})
            `);
            console.log(`✅ Fixed TotalBillAmount for IDs [${falseTotalBillIds.join(', ')}]: ${res2.rowsAffected[0]} rows updated`);
        });

        // 3. Verify current state of BillPayments
        const check = await query(`
            SELECT PaymentID, CustomerName, BillAmount, TotalBillAmount, RemainingArrear, CustomerDue
            FROM BillPayments
            ORDER BY PaymentID ASC
        `);
        console.log('\n--- Current BillPayments Status ---');
        console.table(check.recordset);

    } catch (e) {
        console.error('Error fixing arrears:', e);
    } finally {
        process.exit(0);
    }
}

fixVibhagArrears();
