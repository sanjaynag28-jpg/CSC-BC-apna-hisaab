const { query } = require('../database/db');

async function checkNovGap() {
    console.log('--- Checking November Figures ---');
    const monthStart = '2026-11-01';
    const monthEnd = '2026-11-30';
    const userId = 1;

    // 1. Transactions Income & Expense
    const tRes = await query(`
        SELECT 
            ISNULL(SUM(CASE WHEN TransType = 'Income' THEN Amount ELSE 0 END), 0) as Income,
            ISNULL(SUM(CASE WHEN TransType = 'Expense' THEN Amount ELSE 0 END), 0) as Expense
        FROM Transactions
        WHERE TransDate >= @monthStart AND TransDate <= @monthEnd AND UserID = @userId AND IsDeleted = 0
    `, { monthStart, monthEnd, userId });
    console.log('Transactions (Nov):', tRes.recordset[0]);

    // 2. BC Commission & Charge
    const bcRes = await query(`
        SELECT 
            ISNULL(SUM(CommissionEarned), 0) as Comm,
            ISNULL(SUM(CustomerCharge), 0) as Charge
        FROM BCTransactions
        WHERE TransDate >= @monthStart AND TransDate <= @monthEnd AND Status = 'Success' AND UserID = @userId
    `, { monthStart, monthEnd, userId });
    console.log('BC Transactions (Nov):', bcRes.recordset[0]);

    const bcKhataRes = await query(`
        SELECT ISNULL(SUM(Amount), 0) as BCChargeOnKhata
        FROM KhataEntries
        WHERE EntryDate >= @monthStart AND EntryDate <= @monthEnd AND EntryType = 'Gave' AND BCID IS NOT NULL AND UserID = @userId
    `, { monthStart, monthEnd, userId });
    console.log('BC Khata Charge (Nov):', bcKhataRes.recordset[0]);

    // 3. BillPay Commission
    const bpRes = await query(`
        SELECT 
            ISNULL(SUM(CommissionEarned), 0) as BPComm,
            ISNULL(SUM(CustomerCharge), 0) as BPCharge
        FROM BillPayments
        WHERE PaymentDate >= @monthStart AND PaymentDate <= @monthEnd AND IsDeleted = 0 AND UserID = @userId
    `, { monthStart, monthEnd, userId });
    console.log('BillPayments (Nov):', bpRes.recordset[0]);

    // Total BillPayments All Time
    const bpAllRes = await query(`
        SELECT 
            ISNULL(SUM(CommissionEarned), 0) as BPCommAll,
            ISNULL(SUM(CustomerCharge), 0) as BPChargeAll
        FROM BillPayments
        WHERE IsDeleted = 0 AND UserID = @userId
    `, { userId });
    console.log('BillPayments (All Time):', bpAllRes.recordset[0]);

    process.exit(0);
}
checkNovGap();
