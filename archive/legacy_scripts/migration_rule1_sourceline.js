const path = require('path');
const db = require(path.join(__dirname, '../database/db'));

async function runRule1Migration() {
    try {
        console.log('--- Step 1: Ensuring columns exist in Transactions ---');
        const pool = await db.getPool();

        await db.withTransaction(async (tQuery) => {
            // 1. Add columns if not exist
            const colCheck = await tQuery(`
                SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'Transactions' AND COLUMN_NAME IN ('SourceModule', 'SourceID', 'LineType')
            `);
            const existingCols = colCheck.recordset.map(r => r.COLUMN_NAME);

            if (!existingCols.includes('SourceModule')) {
                await tQuery("ALTER TABLE Transactions ADD SourceModule VARCHAR(20) NULL");
                console.log('Added column SourceModule');
            }
            if (!existingCols.includes('SourceID')) {
                await tQuery("ALTER TABLE Transactions ADD SourceID INT NULL");
                console.log('Added column SourceID');
            }
            if (!existingCols.includes('LineType')) {
                await tQuery("ALTER TABLE Transactions ADD LineType VARCHAR(20) NULL");
                console.log('Added column LineType');
            }

            // Fresh setup does not create BillPayments; only run these backfills
            // where the source table is present.
            const billPaymentsRes = await tQuery(`
                SELECT OBJECT_ID('dbo.BillPayments', 'U') AS TableID
            `);
            if (billPaymentsRes.recordset[0]?.TableID) {
                const expRes = await tQuery(`
                    UPDATE t
                    SET t.SourceModule = 'BillPay',
                        t.SourceID = bp.PaymentID,
                        t.LineType = 'BILL_OUT'
                    FROM Transactions t
                    JOIN BillPayments bp ON t.Reference = 'BP-' + CAST(bp.PaymentID AS VARCHAR(20))
                    WHERE t.TransType = 'Expense' AND t.IsDeleted = 0 AND bp.IsDeleted = 0
                      AND (t.SourceModule IS NULL OR t.SourceID IS NULL OR t.LineType IS NULL)
                `);
                console.log(`Backfilled ${expRes.rowsAffected[0] || 0} BillPay Expense mirrors (BILL_OUT).`);

                const incRes = await tQuery(`
                    UPDATE t
                    SET t.SourceModule = 'BillPay',
                        t.SourceID = bp.PaymentID,
                        t.LineType = 'CASH_IN'
                    FROM Transactions t
                    JOIN BillPayments bp ON t.Reference = 'BP-' + CAST(bp.PaymentID AS VARCHAR(20))
                    WHERE t.TransType = 'Income' AND t.IsDeleted = 0 AND bp.IsDeleted = 0
                      AND (t.SourceModule IS NULL OR t.SourceID IS NULL OR t.LineType IS NULL)
                `);
                console.log(`Backfilled ${incRes.rowsAffected[0] || 0} BillPay Income mirrors (CASH_IN).`);
            } else {
                console.log('BillPayments table not present; skipped BillPay backfill.');
            }

            // 3. Backfill Invoices
            const invRes = await tQuery(`
                UPDATE t
                SET t.SourceModule = 'Invoices',
                    t.SourceID = inv.InvoiceID,
                    t.LineType = 'PAYMENT_IN'
                FROM Transactions t
                JOIN Invoices inv ON (t.Reference = 'INV-' + CAST(inv.InvoiceID AS VARCHAR(20)) OR t.Reference = inv.InvoiceNumber)
                WHERE t.TransType = 'Income' AND t.IsDeleted = 0
                  AND (t.SourceModule IS NULL OR t.SourceID IS NULL OR t.LineType IS NULL)
            `);
            console.log(`Backfilled ${invRes.rowsAffected[0] || 0} Invoice Income mirrors (PAYMENT_IN).`);

            // 4. Backfill CSC Applications
            // A. UPPCL Outflow
            const cscUppclOut = await tQuery(`
                UPDATE t
                SET t.SourceModule = 'CSC',
                    t.SourceID = c.AppID,
                    t.LineType = 'UPPCL_OUT'
                FROM Transactions t
                JOIN CSCApplications c ON (
                    (t.Reference LIKE 'APP-%' AND c.AppID = TRY_CAST(SUBSTRING(t.Reference, 5, 20) AS INT))
                    OR (c.AckNumber IS NOT NULL AND LEN(c.AckNumber) > 0 AND t.Reference = c.AckNumber)
                )
                WHERE t.Tags = 'UPPCL_BILL_OUT' AND t.IsDeleted = 0
                  AND (t.SourceModule IS NULL OR t.SourceID IS NULL OR t.LineType IS NULL)
            `);
            console.log(`Backfilled ${cscUppclOut.rowsAffected[0] || 0} CSC UPPCL Out mirrors (UPPCL_OUT).`);

            // B. UPPCL Inflow
            const cscUppclIn = await tQuery(`
                UPDATE t
                SET t.SourceModule = 'CSC',
                    t.SourceID = c.AppID,
                    t.LineType = 'UPPCL_IN'
                FROM Transactions t
                JOIN CSCApplications c ON (
                    (t.Reference LIKE 'APP-%' AND c.AppID = TRY_CAST(SUBSTRING(t.Reference, 5, 20) AS INT))
                    OR (c.AckNumber IS NOT NULL AND LEN(c.AckNumber) > 0 AND t.Reference = c.AckNumber)
                )
                WHERE t.Tags = 'UPPCL_BILL_IN' AND t.IsDeleted = 0
                  AND (t.SourceModule IS NULL OR t.SourceID IS NULL OR t.LineType IS NULL)
            `);
            console.log(`Backfilled ${cscUppclIn.rowsAffected[0] || 0} CSC UPPCL In mirrors (UPPCL_IN).`);

            // C. Standard Citizen Service FEE_IN
            const cscFeeIn = await tQuery(`
                UPDATE t
                SET t.SourceModule = 'CSC',
                    t.SourceID = c.AppID,
                    t.LineType = 'FEE_IN'
                FROM Transactions t
                JOIN CSCApplications c ON (
                    (t.Reference LIKE 'APP-%' AND c.AppID = TRY_CAST(SUBSTRING(t.Reference, 5, 20) AS INT))
                    OR (c.AckNumber IS NOT NULL AND LEN(c.AckNumber) > 0 AND t.Reference = c.AckNumber)
                )
                WHERE t.Tags = 'CSC_FEE_IN' AND t.IsDeleted = 0
                  AND (t.SourceModule IS NULL OR t.SourceID IS NULL OR t.LineType IS NULL)
            `);
            console.log(`Backfilled ${cscFeeIn.rowsAffected[0] || 0} CSC Fee In mirrors (FEE_IN).`);

            // D. Standard Citizen Service GOVT_OUT
            const cscGovtOut = await tQuery(`
                UPDATE t
                SET t.SourceModule = 'CSC',
                    t.SourceID = c.AppID,
                    t.LineType = 'GOVT_OUT'
                FROM Transactions t
                JOIN CSCApplications c ON (
                    (t.Reference LIKE 'APP-%' AND c.AppID = TRY_CAST(SUBSTRING(t.Reference, 5, 20) AS INT))
                    OR (c.AckNumber IS NOT NULL AND LEN(c.AckNumber) > 0 AND t.Reference = c.AckNumber)
                )
                WHERE t.Tags = 'CSC_GOVT_FEE_OUT' AND t.IsDeleted = 0
                  AND (t.SourceModule IS NULL OR t.SourceID IS NULL OR t.LineType IS NULL)
            `);
            console.log(`Backfilled ${cscGovtOut.rowsAffected[0] || 0} CSC Govt Fee Out mirrors (GOVT_OUT).`);

            // 5. Create or Refresh Unique Index
            await tQuery(`
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Txn_SourceLine' AND object_id = OBJECT_ID('Transactions'))
                BEGIN
                    CREATE UNIQUE INDEX UX_Txn_SourceLine
                    ON Transactions (SourceModule, SourceID, LineType)
                    WHERE SourceModule IS NOT NULL AND IsDeleted = 0;
                END
            `);
            console.log('Ensured UNIQUE INDEX UX_Txn_SourceLine on Transactions.');
        });

        console.log('✅ Rule 1 & Rule 3 System-Wide Schema Migration completed successfully!');
        if (require.main === module) process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        if (require.main === module) process.exit(1);
        throw err;
    }
}

if (require.main === module) {
    runRule1Migration();
}

module.exports = { runRule1Migration };
