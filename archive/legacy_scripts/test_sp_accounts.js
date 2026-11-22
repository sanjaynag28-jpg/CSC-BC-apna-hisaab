const { query } = require('../database/db');

async function testSpAccounts() {
    console.log('--- Checking Accounts sync with sp_UpdateAccountBalance ---');
    const accs = await query("SELECT AccountID, AccountName, CurrentBalance FROM Accounts WHERE IsActive = 1");
    for (const a of accs.recordset) {
        const balBefore = parseFloat(a.CurrentBalance);
        await query("EXEC sp_UpdateAccountBalance @AccountID = @id", { id: a.AccountID });
        const res = await query("SELECT CurrentBalance FROM Accounts WHERE AccountID = @id", { id: a.AccountID });
        const balAfter = parseFloat(res.recordset[0].CurrentBalance);
        const diff = balAfter - balBefore;
        console.log(`Account #${a.AccountID} (${a.AccountName}): Before: ₹${balBefore}, After SP: ₹${balAfter}, Diff: ₹${diff}`);
    }
}

testSpAccounts().then(() => process.exit(0));
