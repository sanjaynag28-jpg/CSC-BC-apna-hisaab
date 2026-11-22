const path = require('path');
const db = require(path.join(__dirname, '../database/db'));

async function run() {
    try {
        console.log('Connecting to database...');
        const pool = await db.getPool();

        await db.withTransaction(async (tQuery) => {
            // 1. Update 70 Transactions:
            const txnUpdate = await tQuery(`
                UPDATE t
                SET t.Reference = 'BP-' + CAST(bp.PaymentID AS VARCHAR(20))
                FROM Transactions t
                JOIN BillPayments bp ON t.Reference = bp.TxnReference
                WHERE t.Reference NOT LIKE 'BP-%'
            `);
            console.log(`Migrated ${txnUpdate.rowsAffected[0] || 0} Transactions to BP-<id> references.`);

            // 2. Update 2 KhataEntries:
            const khataUpdate = await tQuery(`
                UPDATE k
                SET k.ReferenceNo = 'BP-' + CAST(bp.PaymentID AS VARCHAR(20))
                FROM KhataEntries k
                JOIN BillPayments bp ON k.ReferenceNo = bp.TxnReference
                WHERE k.ReferenceNo NOT LIKE 'BP-%'
            `);
            console.log(`Migrated ${khataUpdate.rowsAffected[0] || 0} KhataEntries to BP-<id> references.`);

            await tQuery(`
                UPDATE Transactions
                SET GlobalSerialNo = 2835, SNCode = 'SN-2835', ModuleCode = 'BP-45'
                WHERE Reference = 'BP-45'
                  AND ((TransType = 'Expense' AND AccountID = 2 AND Amount = 220)
                    OR (TransType = 'Income' AND AccountID = 1 AND Amount = 230))
                  AND ISNULL(IsDeleted, 0) = 0
            `);

            // 3. Restore BP-45 Expense mirror only if it is missing:
            await tQuery(`
                INSERT INTO Transactions (
                    AccountID, TransType, Amount, Description, Reference, TransDate, UserID, CreatedAt,
                    GlobalSerialNo, SNCode, ModuleCode
                )
                SELECT
                    2, 'Expense', 220, 'Electricity Paid - UPPCL (MVVNL) [Acc: 4539766000] (Mohd Saleem)',
                    'BP-45', '2026-11-15', 1, '2026-11-15 19:57:12.837',
                    2835, 'SN-2835', 'BP-45'
                WHERE NOT EXISTS (
                    SELECT 1 FROM Transactions
                    WHERE Reference = 'BP-45'
                      AND TransType = 'Expense'
                      AND AccountID = 2
                      AND Amount = 220
                      AND ISNULL(IsDeleted, 0) = 0
                )
            `);
            console.log('Restored BP-45 Expense mirror if missing (-₹220 from Wallet Account 2).');

            // 4. Restore BP-45 Income mirror only if it is missing:
            await tQuery(`
                INSERT INTO Transactions (
                    AccountID, TransType, Amount, Description, Reference, TransDate, UserID, CreatedAt,
                    GlobalSerialNo, SNCode, ModuleCode
                )
                SELECT
                    1, 'Income', 230, 'Cash for Electricity - UPPCL (MVVNL) [Acc: 4539766000] (Mohd Saleem) [Bill: ₹220 + Fee: ₹10]',
                    'BP-45', '2026-11-15', 1, '2026-11-15 19:57:12.837',
                    2835, 'SN-2835', 'BP-45'
                WHERE NOT EXISTS (
                    SELECT 1 FROM Transactions
                    WHERE Reference = 'BP-45'
                      AND TransType = 'Income'
                      AND AccountID = 1
                      AND Amount = 230
                      AND ISNULL(IsDeleted, 0) = 0
                )
            `);
            console.log('Restored BP-45 Income mirror if missing (+₹230 to Cash Account 1).');

            // 5. Update balances:
            await tQuery('EXEC sp_UpdateAccountBalance @AccountID = 1');
            await tQuery('EXEC sp_UpdateAccountBalance @AccountID = 2');
            console.log('Recalculated balances for Account 1 and Account 2.');
        });

        console.log('✅ Migration and BP-45 restoration completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

run();
