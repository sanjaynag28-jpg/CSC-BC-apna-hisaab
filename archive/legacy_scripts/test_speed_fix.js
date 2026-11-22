const { getPool, withTransaction } = require('../database/db');
const { syncBCFlowToKhata, processKhataAfterChange } = require('../database/khataEngine');

(async () => {
    const pool = await getPool();

    console.time('Transaction execution time WITHOUT deadlock');
    await withTransaction(async (tQuery) => {
        // Test idempotency delete
        await tQuery("DELETE FROM KhataEntries WHERE BCID = 99999 AND EntryType = 'BC-Flow'");
        
        // Test insert
        const inRes = await tQuery(`
            INSERT INTO KhataEntries (CustomerID, EntryDate, EntryTime, EntryType, Amount, BCID, PaymentMode, Description, ReferenceNo)
            VALUES (745, '2026-11-07', '10:00', 'BC-Flow', 10000, 99999, 'Cash', 'Test IN', 'BC-99999-IN');
        `);

        const outRes = await tQuery(`
            INSERT INTO KhataEntries (CustomerID, EntryDate, EntryTime, EntryType, Amount, BCID, PaymentMode, Description, ReferenceNo)
            VALUES (745, '2026-11-07', '10:00', 'BC-Flow', 10000, 99999, 'Portal', 'Test OUT', 'BC-99999-OUT');
        `);

        // Cleanup
        await tQuery("DELETE FROM KhataEntries WHERE BCID = 99999");
    });
    console.timeEnd('Transaction execution time WITHOUT deadlock');

    process.exit(0);
})();

