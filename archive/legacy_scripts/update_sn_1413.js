const { getPool, sql } = require('../database/db');

(async () => {
    try {
        const pool = await getPool();
        
        // Fetch current record
        const check = await pool.request().query("SELECT * FROM BCTransactions WHERE SNCode = 'SN-1413' OR GlobalSerialNo = 1413 OR BCID = 199");
        console.log('Current Record before update:', check.recordset[0]);

        // Update record with exact portal data provided by user
        await pool.request().query(`
            UPDATE BCTransactions
            SET ServiceType = 'Cash Withdrawal',
                BankName = 'Indian Bank',
                RRN_UTR = '631110174250',
                Amount = 10000,
                AccountBalance = 2476,
                TransTime = '10:13:54',
                Status = 'Success',
                PortalName = 'Digipay Lite',
                Notes = 'Digipay Lite | TxnID: 627427670627454165',
                Metadata = '{"accountBalance":2476,"transactionId":"627427670627454165","apiTid":"631110174250"}'
            WHERE SNCode = 'SN-1413' OR GlobalSerialNo = 1413 OR BCID = 199;
        `);

        // Also check if any ledger or universal transactions mirror table exists
        try {
            await pool.request().query(`
                UPDATE Transactions
                SET Reference = '631110174250'
                WHERE Reference = 'BC-2026-0199' OR Reference = 'BC-199' OR Notes LIKE '%627427670627454165%';
            `);
        } catch (err) {}

        const updated = await pool.request().query("SELECT BCID, SNCode, ServiceType, CustomerName, CustomerPhone, CustomerAadhaarLast4, BankName, RRN_UTR, Amount, AccountBalance, TransTime, Notes, PortalName FROM BCTransactions WHERE SNCode = 'SN-1413' OR GlobalSerialNo = 1413 OR BCID = 199");
        console.log('\nUpdated Record successfully:', updated.recordset[0]);
        process.exit(0);
    } catch (e) {
        console.error('Error updating SN-1413:', e);
        process.exit(1);
    }
})();

