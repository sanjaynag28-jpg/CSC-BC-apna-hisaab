const fs = require('fs');

const filePath = 'routes/reports.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. F3: Add BillPayments query in /api/reports/kpis and add to totalIncome
const oldPartiesQuery = `        // Loans Pending Snapshot (Parties)
        const partiesQuery = await query(\`
            SELECT 
                ISNULL(SUM(CASE WHEN CurrentBalance > 0 THEN CurrentBalance ELSE 0 END), 0) as TotalLoansPendingFromParties,
                ISNULL(SUM(CASE WHEN CurrentBalance < 0 THEN ABS(CurrentBalance) ELSE 0 END), 0) as TotalLoansOwedToParties
            FROM Parties
            WHERE IsActive = 1 AND UserID = @userId
        \`, { userId });`;

const newPartiesAndBPQuery = `        // Loans Pending Snapshot (Parties)
        const partiesQuery = await query(\`
            SELECT 
                ISNULL(SUM(CASE WHEN CurrentBalance > 0 THEN CurrentBalance ELSE 0 END), 0) as TotalLoansPendingFromParties,
                ISNULL(SUM(CASE WHEN CurrentBalance < 0 THEN ABS(CurrentBalance) ELSE 0 END), 0) as TotalLoansOwedToParties
            FROM Parties
            WHERE IsActive = 1 AND UserID = @userId
        \`, { userId });

        // Bill Payments KPIs (Fix F3: post BP commission into total profit)
        let dateCondBP = '';
        if (startDate && endDate) {
            dateCondBP = ' AND bp.PaymentDate >= @startDate AND bp.PaymentDate <= @endDate';
        } else if (startDate) {
            dateCondBP = ' AND bp.PaymentDate >= @startDate';
        } else if (endDate) {
            dateCondBP = ' AND bp.PaymentDate <= @endDate';
        }

        const bpQuery = await query(\`
            SELECT
                COUNT(*) as BPCount,
                ISNULL(SUM(bp.TotalCollected), 0) as BPTotalCollected,
                ISNULL(SUM(bp.BillAmount), 0) as BPBillAmount,
                ISNULL(SUM(bp.CustomerCharge), 0) as BPCustomerCharge,
                ISNULL(SUM(bp.CommissionEarned), 0) as BPCommissionEarned,
                ISNULL(SUM(bp.NetProfit), 0) as BPNetProfit
            FROM BillPayments bp
            WHERE bp.IsDeleted = 0 AND bp.UserID = @userId \${dateCondBP}
        \`, params);`;

if (!content.includes(oldPartiesQuery)) {
    console.error('oldPartiesQuery not found!');
    process.exit(1);
}
content = content.replace(oldPartiesQuery, newPartiesAndBPQuery);

// 2. F3: Update totalIncome formula in /api/reports/kpis
const oldIncomeFormula = `        const totalIncome = (t.TotalIncome || 0)
            + (b.BCTotalCommission || 0)
            + bcCashCharge
            + (k.KhataGotNoAccount || 0);`;

const newIncomeFormula = `        const bp = bpQuery.recordset[0] || {};
        const totalIncome = (t.TotalIncome || 0)
            + (b.BCTotalCommission || 0)
            + bcCashCharge
            + (bp.BPCommissionEarned || 0)
            + (k.KhataGotNoAccount || 0);`;

if (!content.includes(oldIncomeFormula)) {
    console.error('oldIncomeFormula not found!');
    process.exit(1);
}
content = content.replace(oldIncomeFormula, newIncomeFormula);

// Also add billPayments to response data
const oldResKpis = `                accounts: acc,
                marketUdhaar: mkt,
                parties: pty
            }
        });`;

const newResKpis = `                accounts: acc,
                marketUdhaar: mkt,
                parties: pty,
                billPayments: bp
            }
        });`;

if (!content.includes(oldResKpis)) {
    console.error('oldResKpis not found!');
    process.exit(1);
}
content = content.replace(oldResKpis, newResKpis);
console.log('F3 Applied: BillPay commission added to /kpis income & profit.');

// 3. F5: Update Master Summary in /api/reports/master (lines 472-477)
const oldMasterSummary = `            records = result.recordset || [];
            if (records.length > 0) {
                totalCount = records[0].TotalRows || records.length;
                summary.totalAmount = records[0].AggAmount || 0;
                summary.totalProfit = records[0].AggProfit || 0;
            }`;

const newMasterSummary = `            records = result.recordset || [];
            if (records.length > 0) {
                totalCount = records[0].TotalRows || records.length;
                summary.totalAmount = records[0].AggAmount || 0;
                summary.totalProfit = records[0].AggProfit || 0;
                summary.isMixedVolume = (module === 'all');
                summary.volumeLabel = (module === 'all') ? 'Kul Karobar (Gross Module-Volume)' : 'Kul Rashi';
            }`;

if (!content.includes(oldMasterSummary)) {
    console.error('oldMasterSummary not found!');
    process.exit(1);
}
content = content.replace(oldMasterSummary, newMasterSummary);
console.log('F5 Applied: Master summary tagged with isMixedVolume & volumeLabel.');

// 4. F2: Update /monthly and /yearly in routes/reports.js
const oldMonthly = `        const income = data.recordset.filter(r => r.TransType === 'Income').reduce((s, r) => s + r.Amount, 0);
        const expense = data.recordset.filter(r => r.TransType === 'Expense').reduce((s, r) => s + r.Amount, 0);

        res.json({
            success: true,
            data: {
                transactions: data.recordset,
                summary: { income, expense, net: income - expense },
                month, year
            }
        });`;

const newMonthly = `        // F2 Fix: Include BC Profit & BillPay Commission so Monthly matches Universal KPI Net
        const bcProfitRes = await query(\`
            SELECT 
                ISNULL(SUM(b.CommissionEarned), 0) as BCCommission,
                ISNULL(SUM(b.CustomerCharge), 0) as BCTotalCharge
            FROM BCTransactions b
            WHERE b.TransDate >= @monthStart AND b.TransDate <= @monthEnd 
              AND b.Status = 'Success' AND b.UserID = @userId
        \`, { monthStart, monthEnd, userId });

        const bcKhataRes = await query(\`
            SELECT ISNULL(SUM(k.Amount), 0) as BCChargeOnKhata
            FROM KhataEntries k
            WHERE k.EntryDate >= @monthStart AND k.EntryDate <= @monthEnd 
              AND k.EntryType = 'Gave' AND k.BCID IS NOT NULL AND k.UserID = @userId
        \`, { monthStart, monthEnd, userId });

        const bpMonthRes = await query(\`
            SELECT ISNULL(SUM(bp.CommissionEarned), 0) as BPCommission
            FROM BillPayments bp
            WHERE bp.PaymentDate >= @monthStart AND bp.PaymentDate <= @monthEnd 
              AND bp.IsDeleted = 0 AND bp.UserID = @userId
        \`, { monthStart, monthEnd, userId });

        const bRow = bcProfitRes.recordset[0] || {};
        const bkRow = bcKhataRes.recordset[0] || {};
        const bpRow = bpMonthRes.recordset[0] || {};

        const bcCashCharge = Math.max(0, (bRow.BCTotalCharge || 0) - (bkRow.BCChargeOnKhata || 0));
        const bcProfit = (bRow.BCCommission || 0) + bcCashCharge;
        const bpCommission = bpRow.BPCommission || 0;

        const cashbookIncome = data.recordset.filter(r => r.TransType === 'Income').reduce((s, r) => s + r.Amount, 0);
        const expense = data.recordset.filter(r => r.TransType === 'Expense').reduce((s, r) => s + r.Amount, 0);
        const income = parseFloat((cashbookIncome + bcProfit + bpCommission).toFixed(2));
        const net = parseFloat((income - expense).toFixed(2));

        res.json({
            success: true,
            data: {
                transactions: data.recordset,
                summary: { 
                    income, 
                    expense, 
                    net,
                    cashbookIncome,
                    bcCommission: bRow.BCCommission || 0,
                    bcCharge: bcCashCharge,
                    bcProfit,
                    bpCommission
                },
                month, year
            }
        });`;

if (!content.includes(oldMonthly)) {
    console.error('oldMonthly not found!');
    process.exit(1);
}
content = content.replace(oldMonthly, newMonthly);
console.log('F2 Applied: /monthly updated with BC profit and BillPay commission.');

// 5. F2: Update /yearly in routes/reports.js
const oldYearly = `        const monthly = await query(\`
            SELECT
                MONTH(TransDate) as Month,
                ISNULL(SUM(CASE WHEN TransType = 'Income' THEN Amount ELSE 0 END), 0) as Income,
                ISNULL(SUM(CASE WHEN TransType = 'Expense' THEN Amount ELSE 0 END), 0) as Expense
            FROM Transactions
            WHERE TransDate >= @yearStart AND TransDate <= @yearEnd AND UserID = @userId AND IsDeleted = 0
            GROUP BY MONTH(TransDate)
            ORDER BY Month
        \`, { yearStart, yearEnd, userId });`;

const newYearly = `        const monthly = await query(\`
            WITH Months AS (
                SELECT 1 AS Month UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
                UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
                UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
            ),
            TransAgg AS (
                SELECT
                    MONTH(TransDate) as Month,
                    ISNULL(SUM(CASE WHEN TransType = 'Income' THEN Amount ELSE 0 END), 0) as CashIncome,
                    ISNULL(SUM(CASE WHEN TransType = 'Expense' THEN Amount ELSE 0 END), 0) as Expense
                FROM Transactions
                WHERE TransDate >= @yearStart AND TransDate <= @yearEnd AND UserID = @userId AND IsDeleted = 0
                GROUP BY MONTH(TransDate)
            ),
            BCAgg AS (
                SELECT
                    MONTH(b.TransDate) as Month,
                    ISNULL(SUM(b.CommissionEarned), 0) as BCCommission,
                    ISNULL(SUM(b.CustomerCharge), 0) as BCCharge
                FROM BCTransactions b
                WHERE b.TransDate >= @yearStart AND b.TransDate <= @yearEnd AND b.Status = 'Success' AND b.UserID = @userId
                GROUP BY MONTH(b.TransDate)
            ),
            BPAgg AS (
                SELECT
                    MONTH(bp.PaymentDate) as Month,
                    ISNULL(SUM(bp.CommissionEarned), 0) as BPCommission
                FROM BillPayments bp
                WHERE bp.PaymentDate >= @yearStart AND bp.PaymentDate <= @yearEnd AND bp.IsDeleted = 0 AND bp.UserID = @userId
                GROUP BY MONTH(bp.PaymentDate)
            )
            SELECT
                m.Month,
                ISNULL(t.CashIncome, 0) + ISNULL(bc.BCCommission, 0) + ISNULL(bc.BCCharge, 0) + ISNULL(bp.BPCommission, 0) AS Income,
                ISNULL(t.Expense, 0) AS Expense,
                ISNULL(t.CashIncome, 0) AS CashIncome,
                ISNULL(bc.BCCommission, 0) + ISNULL(bc.BCCharge, 0) AS BCProfit,
                ISNULL(bp.BPCommission, 0) AS BPCommission
            FROM Months m
            LEFT JOIN TransAgg t ON m.Month = t.Month
            LEFT JOIN BCAgg bc ON m.Month = bc.Month
            LEFT JOIN BPAgg bp ON m.Month = bp.Month
            WHERE ISNULL(t.CashIncome, 0) > 0 OR ISNULL(t.Expense, 0) > 0 OR ISNULL(bc.BCCommission, 0) > 0 OR ISNULL(bp.BPCommission, 0) > 0
            ORDER BY m.Month
        \`, { yearStart, yearEnd, userId });`;

if (!content.includes(oldYearly)) {
    console.error('oldYearly not found!');
    process.exit(1);
}
content = content.replace(oldYearly, newYearly);
console.log('F2 Applied: /yearly updated with unified income (Cash + BC + BP).');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated routes/reports.js with F2, F3, F5 fixes!');
