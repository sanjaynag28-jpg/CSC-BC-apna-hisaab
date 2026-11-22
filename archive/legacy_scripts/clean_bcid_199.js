const { getPool, sql } = require('../database/db');

(async () => {
    try {
        const pool = await getPool();
        await pool.request().query(`
            UPDATE BCTransactions
            SET BankName = 'Indian Bank',
                Notes = 'Digipay Lite | TxnID: 627427670627454165',
                RRN_UTR = COALESCE(RRN_UTR, '627427670627454165')
            WHERE BCID = 199;

            UPDATE BCTransactions
            SET BankName = LTRIM(SUBSTRING(BankName, 2, LEN(BankName)))
            WHERE BCID = 199
              AND BankName LIKE ':%';

            UPDATE BCTransactions
            SET BankName = LTRIM(SUBSTRING(BankName, 2, LEN(BankName)))
            WHERE BCID = 199
              AND BankName LIKE '-%';
        `);

        const r = await pool.request().query('SELECT BCID, CustomerName, BankName, RRN_UTR, Notes FROM BCTransactions WHERE BCID = 199');
        console.log('Updated BCID 199:', r.recordset[0]);
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
})();
