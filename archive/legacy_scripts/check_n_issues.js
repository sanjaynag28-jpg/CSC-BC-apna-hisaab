const { query } = require('../database/db');

async function check() {
    try {
        console.log('=== REGISTRY for Shameem or 819/821 ===');
        const reg = await query("SELECT GlobalSerialNo, SNCode, SourceModule, RecordID, EntityName, Amount, IsActive FROM UniversalTxnRegistry WHERE (RecordID IN (819, 821)) OR EntityName LIKE '%Shameem%'");
        console.log(reg.recordset);

        console.log('=== CHECK ORPHANS IN REGISTRY ===');
        // Khata records in registry that don't exist in KhataEntries
        const khataOrphans = await query(`
            SELECT r.GlobalSerialNo, r.SNCode, r.SourceModule, r.RecordID, r.EntityName, r.Amount, r.IsActive
            FROM UniversalTxnRegistry r
            LEFT JOIN KhataEntries k ON r.RecordID = k.KhataID
            WHERE r.SourceModule = 'Khata' AND r.IsActive = 1 AND k.KhataID IS NULL
        `);
        console.log('Khata Orphans in Registry:', khataOrphans.recordset);

        // CSC records in registry that don't exist in CSCApplications or are inactive
        const cscOrphans = await query(`
            SELECT r.GlobalSerialNo, r.SNCode, r.SourceModule, r.RecordID, r.EntityName, r.Amount, r.IsActive, c.IsActive as CscIsActive
            FROM UniversalTxnRegistry r
            LEFT JOIN CSCApplications c ON r.RecordID = c.AppID
            WHERE r.SourceModule = 'CSC' AND r.IsActive = 1 AND (c.AppID IS NULL OR c.IsActive = 0)
        `);
        console.log('CSC Orphans in Registry:', cscOrphans.recordset);

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

check();
