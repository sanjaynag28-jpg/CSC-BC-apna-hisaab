const db = require('../database/db').getDb();

// Fix UCLID 17 specifically
db.prepare(`
    UPDATE UCLUpdates 
    SET GlobalSerialNo = CAST(ROUND(CAST(GlobalSerialNo AS REAL)) AS INTEGER),
        SNCode = 'SN-' || CAST(ROUND(CAST(GlobalSerialNo AS REAL)) AS INTEGER),
        SerialNo = 'SN-' || CAST(ROUND(CAST(GlobalSerialNo AS REAL)) AS INTEGER)
    WHERE UCLID = 17
`).run();

// Clean up any .0 in SNCode across all tables
const tables = [
    'UniversalTxnRegistry',
    'UCLUpdates',
    'BCTransactions',
    'CSCApplications',
    'BillPayments',
    'Invoices',
    'KhataEntries',
    'Transactions',
    'ServiceRecords'
];

for (const t of tables) {
    try {
        const rows = db.prepare(`SELECT * FROM "${t}" WHERE SNCode LIKE '%.0%' OR CAST(GlobalSerialNo AS TEXT) LIKE '%.0%'`).all();
        if (rows.length > 0) {
            console.log(`Found ${rows.length} rows with .0 in "${t}". Fixing...`);
            db.prepare(`
                UPDATE "${t}" 
                SET GlobalSerialNo = CAST(ROUND(CAST(GlobalSerialNo AS REAL)) AS INTEGER),
                    SNCode = 'SN-' || CAST(ROUND(CAST(GlobalSerialNo AS REAL)) AS INTEGER)
                WHERE SNCode LIKE '%.0%' OR CAST(GlobalSerialNo AS TEXT) LIKE '%.0%'
            `).run();
        }
    } catch (_) {}
}

console.log('\n--- VERIFICATION OF UCLUpdates ---');
console.table(db.prepare(`SELECT UCLID, GlobalSerialNo, SNCode, ModuleCode, CustomerName FROM UCLUpdates ORDER BY UCLID DESC LIMIT 5`).all());

console.log('\n--- VERIFICATION OF UniversalTxnRegistry ---');
console.table(db.prepare(`SELECT GlobalSerialNo, SNCode, SourceModule, RecordID, ModuleCode FROM UniversalTxnRegistry ORDER BY GlobalSerialNo DESC LIMIT 5`).all());
