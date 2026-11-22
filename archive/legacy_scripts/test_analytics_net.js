const { query } = require('../database/db');

async function testAnalytics() {
    try {
        const userId = 1;
        const yearStart = '2026-01-01';
        const yearEnd = '2026-12-31';

        // Old query without BP commission
        const oldRes = await query(`
            SELECT 
                SUM(ISNULL(t.Income, 0) - ISNULL(t.Expense, 0) + ISNULL(b.BCCommission, 0)) as NetProfit
            FROM (
                VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12)
            ) as m(MonthNumber)
            LEFT JOIN (
                SELECT 
                    MONTH(TransDate) as TransMonth,
                    SUM(CASE WHEN TransType = 'Income' THEN Amount ELSE 0 END) as Income,
                    SUM(CASE WHEN TransType = 'Expense' THEN Amount ELSE 0 END) as Expense
                FROM Transactions
                WHERE TransDate >= @yearStart AND TransDate <= @yearEnd AND UserID = @userId AND IsDeleted = 0
                GROUP BY MONTH(TransDate)
            ) t ON m.MonthNumber = t.TransMonth
            LEFT JOIN (
                SELECT 
                    MONTH(TransDate) as BCMonth,
                    SUM(CommissionEarned + CustomerCharge) as BCCommission
                FROM BCTransactions
                WHERE TransDate >= @yearStart AND TransDate <= @yearEnd AND Status = 'Success' AND UserID = @userId
                GROUP BY MONTH(TransDate)
            ) b ON m.MonthNumber = b.BCMonth
        `, { yearStart, yearEnd, userId });

        // New query with BP commission (IsDeleted = 0)
        const newRes = await query(`
            SELECT 
                SUM(ISNULL(t.Income, 0) - ISNULL(t.Expense, 0) + ISNULL(b.BCCommission, 0) + ISNULL(bp.BPCommission, 0)) as NetProfit,
                SUM(ISNULL(bp.BPCommission, 0)) as TotalBPCommission
            FROM (
                VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12)
            ) as m(MonthNumber)
            LEFT JOIN (
                SELECT 
                    MONTH(TransDate) as TransMonth,
                    SUM(CASE WHEN TransType = 'Income' THEN Amount ELSE 0 END) as Income,
                    SUM(CASE WHEN TransType = 'Expense' THEN Amount ELSE 0 END) as Expense
                FROM Transactions
                WHERE TransDate >= @yearStart AND TransDate <= @yearEnd AND UserID = @userId AND IsDeleted = 0
                GROUP BY MONTH(TransDate)
            ) t ON m.MonthNumber = t.TransMonth
            LEFT JOIN (
                SELECT 
                    MONTH(TransDate) as BCMonth,
                    SUM(CommissionEarned + CustomerCharge) as BCCommission
                FROM BCTransactions
                WHERE TransDate >= @yearStart AND TransDate <= @yearEnd AND Status = 'Success' AND UserID = @userId
                GROUP BY MONTH(TransDate)
            ) b ON m.MonthNumber = b.BCMonth
            LEFT JOIN (
                SELECT 
                    MONTH(PaymentDate) as BPMonth,
                    SUM(CommissionEarned) as BPCommission
                FROM BillPayments
                WHERE PaymentDate >= @yearStart AND PaymentDate <= @yearEnd AND UserID = @userId AND IsDeleted = 0
                GROUP BY MONTH(PaymentDate)
            ) bp ON m.MonthNumber = bp.BPMonth
        `, { yearStart, yearEnd, userId });

        console.log('Old Analytics Net:', oldRes.recordset[0].NetProfit);
        console.log('New Analytics Net:', newRes.recordset[0].NetProfit);
        console.log('Total BP Commission:', newRes.recordset[0].TotalBPCommission);

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

testAnalytics();
