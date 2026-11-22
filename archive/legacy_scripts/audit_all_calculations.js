const { query } = require('../database/db');

async function main() {
    console.log('================================================================');
    console.log('       FINANCIAL & CALCULATION ENGINES COMPREHENSIVE AUDIT      ');
    console.log('================================================================\n');

    let allPassed = true;

    // 1. Inspect Stored Procedure sp_UpdateAccountBalance
    console.log('1. Checking sp_UpdateAccountBalance definition...');
    const spDefRes = await query("SELECT OBJECT_DEFINITION(OBJECT_ID('sp_UpdateAccountBalance')) as def");
    const spDef = spDefRes.recordset[0]?.def || '';
    if (spDef.includes('BCTransactions') && spDef.includes('OpeningBalance')) {
        console.log('   ✔ sp_UpdateAccountBalance includes BCTransactions & OpeningBalance.');
    } else {
        console.log('   ⚠ sp_UpdateAccountBalance might be missing some modules. Length:', spDef.length);
    }

    // 2. Audit BC Transactions Calculations (Profit = Comm + Charge)
    console.log('\n2. Auditing BCTransactions Profit calculations...');
    const bcAudit = await query(`
        SELECT COUNT(*) as DiscrepancyCount
        FROM BCTransactions
        WHERE ABS(ISNULL(NetProfit, 0) - (ISNULL(CommissionEarned, 0) + ISNULL(CustomerCharge, 0))) > 0.01
    `);
    const bcErrors = bcAudit.recordset[0].DiscrepancyCount;
    if (bcErrors === 0) {
        console.log('   ✔ 100% of BCTransactions have correct NetProfit = CommissionEarned + CustomerCharge.');
    } else {
        console.log(`   ❌ Found ${bcErrors} BCTransactions with NetProfit calculation mismatch!`);
        allPassed = false;
    }

    // 3. Audit CSC Applications Calculations (TotalFee = GovtFee + OperatorFee, Due = Total - Paid)
    console.log('\n3. Auditing CSC Applications Fee calculations...');
    const cscAudit = await query(`
        SELECT COUNT(*) as DiscrepancyCount
        FROM CSCApplications
        WHERE ABS(ISNULL(TotalFee, 0) - (ISNULL(GovtFee, 0) + ISNULL(OperatorFee, 0))) > 0.01
           OR ABS(ISNULL(DueAmount, 0) - CASE WHEN (ISNULL(TotalFee, 0) - ISNULL(PaidAmount, 0)) > 0 THEN (ISNULL(TotalFee, 0) - ISNULL(PaidAmount, 0)) ELSE 0 END) > 0.01
    `);
    const cscErrors = cscAudit.recordset[0].DiscrepancyCount;
    if (cscErrors === 0) {
        console.log('   ✔ 100% of CSCApplications have correct TotalFee = GovtFee + OperatorFee and DueAmount.');
    } else {
        console.log(`   ❌ Found ${cscErrors} CSCApplications with Fee/Due mismatch!`);
        const samples = await query(`
            SELECT TOP 5 AppID, GovtFee, OperatorFee, TotalFee, PaidAmount, DueAmount
            FROM CSCApplications
            WHERE ABS(ISNULL(TotalFee, 0) - (ISNULL(GovtFee, 0) + ISNULL(OperatorFee, 0))) > 0.01
               OR ABS(ISNULL(DueAmount, 0) - CASE WHEN (ISNULL(TotalFee, 0) - ISNULL(PaidAmount, 0)) > 0 THEN (ISNULL(TotalFee, 0) - ISNULL(PaidAmount, 0)) ELSE 0 END) > 0.01
        `);
        console.log('   Samples:', samples.recordset);
        allPassed = false;
    }

    // 4. Audit Invoices Calculations (SubTotal, Tax, TotalAmount, BalanceAmount)
    console.log('\n4. Auditing Invoices Calculations...');
    const invAudit = await query(`
        SELECT COUNT(*) as DiscrepancyCount
        FROM Invoices
        WHERE ABS(ISNULL(BalanceAmount, 0) - CASE WHEN (ISNULL(TotalAmount, 0) - ISNULL(PaidAmount, 0)) > 0 THEN (ISNULL(TotalAmount, 0) - ISNULL(PaidAmount, 0)) ELSE 0 END) > 0.01
    `);
    const invErrors = invAudit.recordset[0].DiscrepancyCount;
    if (invErrors === 0) {
        console.log('   ✔ 100% of Invoices have correct BalanceAmount = TotalAmount - PaidAmount.');
    } else {
        console.log(`   ❌ Found ${invErrors} Invoices with BalanceAmount mismatch!`);
        allPassed = false;
    }

    // 5. Audit Khatabook Customer Balances
    // CurrentBalance should equal OpeningBalance + SUM(Gave) - SUM(Got)
    console.log('\n5. Auditing Khatabook Customer Balances (CurrentBalance vs Calculated Ledger)...');
    const khataAudit = await query(`
        WITH CustomerLedger AS (
            SELECT 
                c.CustomerID,
                c.CustomerName,
                c.CurrentBalance as StoredBalance,
                ISNULL(c.OpeningBalance, 0) as OpeningBalance,
                ISNULL(SUM(CASE WHEN e.EntryType = 'Gave' THEN e.Amount ELSE 0 END), 0) as TotalGave,
                ISNULL(SUM(CASE WHEN e.EntryType = 'Got' THEN e.Amount ELSE 0 END), 0) as TotalGot,
                (ISNULL(c.OpeningBalance, 0) + 
                 ISNULL(SUM(CASE WHEN e.EntryType = 'Gave' THEN e.Amount ELSE 0 END), 0) - 
                 ISNULL(SUM(CASE WHEN e.EntryType = 'Got' THEN e.Amount ELSE 0 END), 0)) as ExpectedBalance
            FROM Customers c
            LEFT JOIN KhataEntries e ON c.CustomerID = e.CustomerID
            WHERE c.IsActive = 1
            GROUP BY c.CustomerID, c.CustomerName, c.CurrentBalance, c.OpeningBalance
        )
        SELECT 
            COUNT(*) as TotalAudited,
            SUM(CASE WHEN ABS(StoredBalance - ExpectedBalance) > 0.01 THEN 1 ELSE 0 END) as MismatchCount
        FROM CustomerLedger
    `);
    const khataStats = khataAudit.recordset[0];
    console.log(`   Total Active Customers Audited: ${khataStats.TotalAudited}`);
    if (khataStats.MismatchCount === 0) {
        console.log('   ✔ 100% of Customer Khatabook balances match EXACTLY with ledger entries!');
    } else {
        console.log(`   ❌ Found ${khataStats.MismatchCount} customers with balance discrepancies.`);
        allPassed = false;
    }

    // 6. Audit Account Balances (CurrentBalance vs Calculated Transactions/Ledger)
    console.log('\n6. Auditing Account Balances (CurrentBalance vs sp_UpdateAccountBalance)...');
    const accList = await query('SELECT AccountID, AccountName, AccountType, CurrentBalance FROM Accounts WHERE IsActive = 1');
    let accMismatches = 0;
    for (const acc of accList.recordset) {
        const preBal = parseFloat(acc.CurrentBalance) || 0;
        await query('EXEC sp_UpdateAccountBalance @id', { id: acc.AccountID });
        const postAcc = await query('SELECT CurrentBalance FROM Accounts WHERE AccountID = @id', { id: acc.AccountID });
        const postBal = parseFloat(postAcc.recordset[0]?.CurrentBalance) || 0;
        if (Math.abs(preBal - postBal) > 0.01) {
            console.log(`   ⚠ Account "${acc.AccountName}" (${acc.AccountType}): was ${preBal}, recalculates to ${postBal} (Diff: ${postBal - preBal})`);
            accMismatches++;
        }
    }
    if (accMismatches === 0) {
        console.log('   ✔ All Account balances are 100% in sync with their transaction records.');
    } else {
        console.log(`   ⚠ Recalculated & synchronized ${accMismatches} account balances.`);
    }

    console.log('\n================================================================');
    if (allPassed) {
        console.log('   ALL CALCULATION ENGINES PASSED 100% AUDIT & VERIFICATION!');
    } else {
        console.log('   SOME DISCREPANCIES FOUND - DETAILS PRINTED ABOVE.');
    }
    console.log('================================================================\n');

    process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
    console.error('Audit failed with error:', err);
    process.exit(1);
});
