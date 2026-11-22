/**
 * Reconcile historical CSC Applications with Khata (KhataEntries).
 * Usage:
 *   node scripts/reconcile_csc_khata.js --dry-run
 *   node scripts/reconcile_csc_khata.js --apply
 */
const { query, withTransaction } = require('../database/db');
const { syncCSCToKhata, processKhataAfterChange } = require('../database/khataEngine');

function toDateOnly(d) {
    if (!d) return new Date().toISOString().slice(0, 10);
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    return String(d).slice(0, 10);
}

async function run() {
    const isApply = process.argv.includes('--apply');
    console.log(`\n======================================================`);
    console.log(`  CSC -> Khata Historical Reconciliation Script`);
    console.log(`  Mode: ${isApply ? 'APPLY (Live DB Write)' : 'DRY RUN (Preview Only)'}`);
    console.log(`======================================================\n`);

    const unsynced = await query(`
        SELECT 
            c.AppID, c.CustomerID, c.CustomerName, c.ServiceType,
            c.TotalFee, c.PaidAmount, c.DueAmount, c.PaymentMode,
            c.ApplyDate, c.UserID
        FROM CSCApplications c
        WHERE c.IsActive = 1 
          AND c.CustomerID IS NOT NULL 
          AND c.AppID NOT IN (SELECT DISTINCT CSCAppID FROM KhataEntries WHERE CSCAppID IS NOT NULL)
        ORDER BY c.AppID ASC
    `);

    const records = unsynced.recordset;
    console.log(`Found ${records.length} unsynced active CSC applications with CustomerID.\n`);

    if (records.length === 0) {
        console.log('Sabhi CSC applications pehle se Khata me synced hain! Kuch karne ki zaroorat nahi.');
        process.exit(0);
    }

    let totalFeeSum = 0;
    let totalPaidSum = 0;
    const affectedCustomers = new Set();

    records.forEach(r => {
        totalFeeSum += parseFloat(r.TotalFee || 0);
        totalPaidSum += parseFloat(r.PaidAmount || 0);
        affectedCustomers.add(r.CustomerID);
    });

    console.log(`Summary:`);
    console.log(`  Total Apps: ${records.length}`);
    console.log(`  Unique Customers: ${affectedCustomers.size}`);
    console.log(`  Total Fee: ₹${totalFeeSum.toLocaleString('en-IN')}`);
    console.log(`  Total Paid: ₹${totalPaidSum.toLocaleString('en-IN')}`);
    console.log(`  Net Balance Impact: ₹${(totalFeeSum - totalPaidSum).toLocaleString('en-IN')}\n`);

    if (!isApply) {
        console.log(`ℹ️ Ye DRY RUN tha. Koi data modify nahi kiya gaya.`);
        console.log(`Agar aap live database me sync apply karna chahte hain, to run karein:`);
        console.log(`node scripts/reconcile_csc_khata.js --apply\n`);
        process.exit(0);
    }

    console.log(`Syncing records in batches...`);
    let processed = 0;
    for (const app of records) {
        await withTransaction(async (tQuery) => {
            await syncCSCToKhata(tQuery, {
                CustomerID: app.CustomerID,
                CSCAppID: app.AppID,
                TotalFee: parseFloat(app.TotalFee || 0),
                PaidAmount: parseFloat(app.PaidAmount || 0),
                EntryDate: toDateOnly(app.ApplyDate),
                PaymentMode: app.PaymentMode || 'Cash',
                ServiceType: app.ServiceType || 'CSC Service',
                UserID: app.UserID || 1
            });
        });
        processed++;
        if (processed % 100 === 0 || processed === records.length) {
            console.log(`  Synced ${processed} / ${records.length} apps...`);
        }
    }

    console.log(`\nRecalculating customer balances and processing advances for ${affectedCustomers.size} customers...`);
    let custCount = 0;
    for (const custId of affectedCustomers) {
        await withTransaction(async (tQuery) => {
            await tQuery('EXEC sp_UpdateCustomerBalance @id', { id: custId });
            await processKhataAfterChange(tQuery, custId);
        });
        custCount++;
        if (custCount % 50 === 0 || custCount === affectedCustomers.size) {
            console.log(`  Updated ${custCount} / ${affectedCustomers.size} customers...`);
        }
    }

    console.log(`\n✅ Badhai ho! Sabhi ${records.length} CSC records successfully Khata me reconcile ho gaye.`);
    process.exit(0);
}

run().catch(err => {
    console.error('Reconciliation error:', err);
    process.exit(1);
});

