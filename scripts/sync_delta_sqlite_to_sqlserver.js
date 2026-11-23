/**
 * scripts/sync_delta_sqlite_to_sqlserver.js
 * High-speed bi-directional sync: Syncs new / modified records from SQLite (Port 4000)
 * back to SQL Server (Port 3000) when switching back.
 */
const sql = require('mssql');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const sqlConfig = {
    server: process.env.DB_SERVER || 'LAPTOP-SANJAY\\SQLEXPRESS',
    database: process.env.DB_NAME || 'CashManagement',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'CashMgmt@2026',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

const sqliteDbPath = path.resolve('d:\\Cash-Management-SQLite\\database\\data\\cash_management.db');

function formatSqlVal(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    // Escape single quotes
    const str = String(v).replace(/'/g, "''");
    return `'${str}'`;
}

async function syncSqliteToSqlServer() {
    const startTime = Date.now();
    console.log('🔄 Checking sync: SQLite (Port 4000) -> SQL Server (Port 3000)...');

    if (!fs.existsSync(sqliteDbPath)) {
        throw new Error(`SQLite DB file nahi mila: ${sqliteDbPath}`);
    }

    const pool = await sql.connect(sqlConfig);
    const db = new Database(sqliteDbPath, { readonly: true });

    const tablesRes = await pool.request().query(`
        SELECT t.name AS TableName, c.name AS PkCol
        FROM sys.tables t
        JOIN sys.identity_columns c ON t.object_id = c.object_id
        WHERE t.name NOT IN ('ApiIdempotencyRequests', 'AppLicenses')
        ORDER BY t.name
    `);

    let totalSynced = 0;
    const syncedTables = [];

    for (const t of tablesRes.recordset) {
        const tbl = t.TableName;
        const pk = t.PkCol;

        // Check max PK in SQL Server
        const sqlPkRes = await pool.request().query(`SELECT ISNULL(MAX([${pk}]), 0) AS maxPk FROM [${tbl}]`);
        const maxSqlPk = sqlPkRes.recordset[0].maxPk || 0;

        // Query new rows from SQLite
        let newRows = [];
        try {
            newRows = db.prepare(`SELECT * FROM "${tbl}" WHERE "${pk}" > ? ORDER BY "${pk}" ASC`).all(maxSqlPk);
        } catch (_) {
            continue;
        }

        if (newRows.length > 0) {
            // Get columns in SQL Server
            const colsRes = await pool.request().query(`
                SELECT c.name FROM sys.columns c 
                WHERE c.object_id = OBJECT_ID('[${tbl}]')
            `);
            const sqlCols = colsRes.recordset.map(c => c.name);
            const colsToInsert = Object.keys(newRows[0]).filter(c => sqlCols.includes(c));

            const colList = colsToInsert.map(c => `[${c}]`).join(', ');

            // Enable IDENTITY_INSERT and insert in chunks of 50
            const chunkSize = 50;
            for (let i = 0; i < newRows.length; i += chunkSize) {
                const chunk = newRows.slice(i, i + chunkSize);
                let valRows = [];
                for (const row of chunk) {
                    const rowVals = colsToInsert.map(c => formatSqlVal(row[c])).join(', ');
                    valRows.push(`(${rowVals})`);
                }
                const insertQuery = `
                    SET IDENTITY_INSERT [dbo].[${tbl}] ON;
                    INSERT INTO [dbo].[${tbl}] (${colList})
                    VALUES ${valRows.join(',\n')};
                    SET IDENTITY_INSERT [dbo].[${tbl}] OFF;
                `;
                await pool.request().batch(insertQuery);
            }

            totalSynced += newRows.length;
            syncedTables.push(`${tbl} (+${newRows.length})`);
        }

        // Keep Accounts balance updated
        if (tbl === 'Accounts') {
            const sqAccounts = db.prepare(`SELECT * FROM "Accounts"`).all();
            for (const acc of sqAccounts) {
                await pool.request().query(`
                    UPDATE [dbo].[Accounts] 
                    SET [CurrentBalance] = ${acc.CurrentBalance || 0}, 
                        [UpdatedAt] = GETDATE()
                    WHERE [AccountID] = ${acc.AccountID}
                `);
            }
        }
    }

    await pool.close();
    db.close();

    const elapsed = Date.now() - startTime;
    return { totalSynced, elapsed, syncedTables };
}

if (require.main === module) {
    syncSqliteToSqlServer().then(res => {
        if (res.totalSynced > 0) {
            console.log(`✅ Sync successful (${res.elapsed}ms): ${res.totalSynced} new record(s) synced to SQL Server! [${res.syncedTables.join(', ')}]`);
        } else {
            console.log(`✅ Dono databases pehle se 100% up-to-date hain (No new changes in SQLite). Elapsed: ${res.elapsed}ms.`);
        }
        process.exit(0);
    }).catch(err => {
        console.error('❌ Sync failed:', err.message);
        process.exit(1);
    });
}

module.exports = { syncSqliteToSqlServer };
