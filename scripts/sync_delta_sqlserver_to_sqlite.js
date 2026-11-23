const sql = require('mssql');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const sqlConfig = {
    server: 'LAPTOP-SANJAY\\SQLEXPRESS',
    database: 'CashManagement',
    user: 'sa',
    password: 'CashMgmt@2026',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        readOnlyIntent: true
    }
};

const sqliteDbPath = path.resolve('d:\\Cash-Management-SQLite\\database\\data\\cash_management.db');
const syncStatePath = path.resolve('d:\\Cash-Management-SQLite\\database\\data\\.sync_state.json');

function formatVal(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) {
        if (isNaN(v.getTime())) return null;
        const iso = v.toISOString();
        if (iso.endsWith('T00:00:00.000Z')) return iso.slice(0, 10);
        return iso.replace('T', ' ').slice(0, 19);
    }
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (Buffer.isBuffer(v)) return v;
    return v;
}

let sqlPool = null;
let sqliteDb = null;

async function getSqlPool() {
    if (!sqlPool || !sqlPool.connected) {
        sqlPool = await sql.connect(sqlConfig);
    }
    return sqlPool;
}

function getSqliteDb() {
    if (!sqliteDb) {
        sqliteDb = new Database(sqliteDbPath, { timeout: 4000 });
        sqliteDb.pragma('journal_mode = WAL');
        sqliteDb.pragma('synchronous = NORMAL');
        sqliteDb.pragma('busy_timeout = 4000');
    }
    return sqliteDb;
}

function getLastSyncTime() {
    try {
        if (fs.existsSync(syncStatePath)) {
            const data = JSON.parse(fs.readFileSync(syncStatePath, 'utf8'));
            if (data && data.lastSyncTime) return data.lastSyncTime;
        }
    } catch (_) { }
    // Default to 1 hour ago if not recorded
    return new Date(Date.now() - 3600000).toISOString().replace('T', ' ').slice(0, 19);
}

function saveLastSyncTime(isoTime) {
    try {
        fs.writeFileSync(syncStatePath, JSON.stringify({ lastSyncTime: isoTime }, null, 2), 'utf8');
    } catch (_) { }
}

async function syncDelta() {
    const startTime = Date.now();
    const lastSyncTime = getLastSyncTime();
    const currentSyncTime = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const pool = await getSqlPool();
    const db = getSqliteDb();

    // Tables with primary key
    const tablesRes = await pool.request().query(`
        SELECT t.name AS TableName, c.name AS PkCol,
               (SELECT COUNT(1) FROM sys.columns col WHERE col.object_id = t.object_id AND col.name = 'UpdatedAt') AS HasUpdatedAt
        FROM sys.tables t
        JOIN sys.identity_columns c ON t.object_id = c.object_id
        WHERE t.name NOT IN ('ApiIdempotencyRequests', 'AppLicenses')
        ORDER BY t.name
    `);

    let totalSyncedRows = 0;
    const syncedTables = [];

    for (const t of tablesRes.recordset) {
        const tbl = t.TableName;
        const pk = t.PkCol;
        const hasUpdatedAt = t.HasUpdatedAt > 0;

        let maxSqPk = 0;
        try {
            const row = db.prepare(`SELECT MAX("${pk}") as maxPk FROM "${tbl}"`).get();
            maxSqPk = (row && row.maxPk) ? Number(row.maxPk) : 0;
        } catch (_) { }

        let query = `SELECT * FROM [${tbl}] WHERE [${pk}] > ${maxSqPk}`;
        if (hasUpdatedAt) {
            query += ` OR [UpdatedAt] >= '${lastSyncTime}'`;
        }
        query += ` ORDER BY [${pk}] ASC`;

        const newRowsRes = await pool.request().query(query);
        const rows = newRowsRes.recordset;

        if (rows.length > 0) {
            const sqliteCols = db.prepare(`PRAGMA table_info("${tbl}")`).all().map(c => c.name);
            const colsToInsert = Object.keys(rows[0]).filter(c => sqliteCols.includes(c));
            const colList = colsToInsert.map(c => `"${c}"`).join(', ');
            const placeholders = colsToInsert.map(() => '?').join(', ');
            const insertStmt = db.prepare(`INSERT OR REPLACE INTO "${tbl}" (${colList}) VALUES (${placeholders})`);

            const insertBatch = db.transaction((batch) => {
                for (const r of batch) {
                    const vals = colsToInsert.map(c => formatVal(r[c]));
                    insertStmt.run(...vals);
                }
            });

            insertBatch(rows);
            totalSyncedRows += rows.length;
            syncedTables.push(`${tbl} (${rows.length})`);
        }

        // Always sync Accounts to keep real-time balances exact
        if (tbl === 'Accounts') {
            const allRes = await pool.request().query(`SELECT * FROM [Accounts]`);
            const sqliteCols = db.prepare(`PRAGMA table_info("Accounts")`).all().map(c => c.name);
            const colsToInsert = Object.keys(allRes.recordset[0]).filter(c => sqliteCols.includes(c));
            const colList = colsToInsert.map(c => `"${c}"`).join(', ');
            const placeholders = colsToInsert.map(() => '?').join(', ');
            const updateStmt = db.prepare(`INSERT OR REPLACE INTO "Accounts" (${colList}) VALUES (${placeholders})`);

            const updateBatch = db.transaction((batch) => {
                for (const r of batch) {
                    const vals = colsToInsert.map(c => formatVal(r[c]));
                    updateStmt.run(...vals);
                }
            });
            updateBatch(allRes.recordset);
        }
    }

    saveLastSyncTime(currentSyncTime);
    const elapsed = Date.now() - startTime;
    return { totalSyncedRows, elapsed, syncedTables };
}

module.exports = { syncDelta };

if (require.main === module) {
    syncDelta().then(res => {
        console.log(`✅ Delta sync completed in ${res.elapsed} ms: ${res.totalSyncedRows} row(s) synced [${res.syncedTables.join(', ') || 'no changes'}]`);
        process.exit(0);
    }).catch(err => {
        console.error('❌ Sync error:', err.message);
        process.exit(1);
    });
}
