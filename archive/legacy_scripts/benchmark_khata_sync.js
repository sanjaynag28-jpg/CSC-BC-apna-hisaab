const { getPool, withTransaction } = require('../database/db');
const { syncBCFlowToKhata, processKhataAfterChange } = require('../database/khataEngine');

(async () => {
    const pool = await getPool();

    console.time('Full Khata Sync Benchmark');
    await withTransaction(async (tQuery) => {
        console.time('syncBCFlowToKhata');
        await syncBCFlowToKhata(tQuery, {
            CustomerID: 745,
            BCID: 199,
            ServiceType: 'Cash Withdrawal',
            QROperation: 'Send - Cash Taken from Customer',
            Amount: 10000,
            EntryDate: '2026-11-07',
            BankName: 'Indian Bank',
            RRN_UTR: '631110174250'
        });
        console.timeEnd('syncBCFlowToKhata');

        console.time('processKhataAfterChange');
        await processKhataAfterChange(tQuery, 745);
        console.timeEnd('processKhataAfterChange');

        // Rollback benchmark so we don't duplicate
        throw new Error('ROLLBACK_BENCHMARK');
    }).catch(e => {
        if (e.message !== 'ROLLBACK_BENCHMARK') console.error(e);
    });
    console.timeEnd('Full Khata Sync Benchmark');

    process.exit(0);
})();

