const { query } = require('../database/db');

async function cleanupOrphans() {
    console.log('=== REGISTRY ORPHANS CLEANUP (N4) ===');
    try {
        // 1. Khata orphans: UniversalTxnRegistry has SourceModule = 'Khata' and IsActive = 1, but KhataEntries doesn't exist
        const khataCleanup = await query(`
            UPDATE UniversalTxnRegistry
            SET IsActive = 0
            WHERE SourceModule = 'Khata' AND IsActive = 1
              AND RecordID NOT IN (SELECT KhataID FROM KhataEntries)
        `);
        console.log(`✅ Khata orphans deactivated: ${khataCleanup.rowsAffected[0]} rows`);

        // 2. CSC orphans: UniversalTxnRegistry has SourceModule = 'CSC' and IsActive = 1, but CSCApplications doesn't exist or IsActive = 0
        const cscCleanup = await query(`
            UPDATE UniversalTxnRegistry
            SET IsActive = 0
            WHERE SourceModule = 'CSC' AND IsActive = 1
              AND (
                  RecordID NOT IN (SELECT AppID FROM CSCApplications)
                  OR RecordID IN (SELECT AppID FROM CSCApplications WHERE IsActive = 0)
              )
        `);
        console.log(`✅ CSC orphans deactivated: ${cscCleanup.rowsAffected[0]} rows`);

        // 3. Verify remaining active orphans
        const remainingKhata = await query(`
            SELECT r.GlobalSerialNo, r.RecordID FROM UniversalTxnRegistry r
            LEFT JOIN KhataEntries k ON r.RecordID = k.KhataID
            WHERE r.SourceModule = 'Khata' AND r.IsActive = 1 AND k.KhataID IS NULL
        `);
        const remainingCsc = await query(`
            SELECT r.GlobalSerialNo, r.RecordID FROM UniversalTxnRegistry r
            LEFT JOIN CSCApplications c ON r.RecordID = c.AppID
            WHERE r.SourceModule = 'CSC' AND r.IsActive = 1 AND (c.AppID IS NULL OR c.IsActive = 0)
        `);

        console.log(`Remaining Khata orphans: ${remainingKhata.recordset.length}`);
        console.log(`Remaining CSC orphans: ${remainingCsc.recordset.length}`);

        if (remainingKhata.recordset.length === 0 && remainingCsc.recordset.length === 0) {
            console.log('🎉 ALL REGISTRY ORPHANS CLEANED UP SUCCESSFULLY!');
        } else {
            console.warn('⚠️ Some orphans still remain!');
        }

    } catch (e) {
        console.error('Cleanup error:', e);
    } finally {
        process.exit(0);
    }
}

cleanupOrphans();
