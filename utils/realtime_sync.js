/**
 * utils/realtime_sync.js
 * ============================================================================
 * Instant Real-Time Silent Sync: SQL Server (Port 3000) -> SQLite (Port 4000)
 * 
 * Guarantees:
 * 1. 100% Non-Blocking: Runs asynchronously in background via setImmediate / debounce.
 * 2. 100% Read-Only on SQL Server: Never modifies, locks, or drops SQL Server data.
 * 3. Atomic in SQLite: Uses better-sqlite3 transactions & WAL mode.
 * 4. Resilient: If SQLite file is momentarily busy, retries automatically with zero error on Port 3000.
 * ============================================================================
 */

const sql = require('mssql');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const sqliteDbCandidates = [
    path.resolve('d:\\Cash-Management-SQLite\\database\\data\\cash_management.db'),
    path.resolve(__dirname, '../../Cash-Management-SQLite/database/data/cash_management.db'),
    path.resolve(__dirname, '../database/data/cash_management.db')
];

let resolvedSqlitePath = null;
for (const p of sqliteDbCandidates) {
    if (fs.existsSync(p)) {
        resolvedSqlitePath = p;
        break;
    }
}
if (!resolvedSqlitePath) {
    resolvedSqlitePath = sqliteDbCandidates[0];
}

const syncStatePath = path.resolve(__dirname, '../database/data/.sync_state.json');

const sqlConfig = {
    server: process.env.DB_SERVER || 'LAPTOP-SANJAY\\SQLEXPRESS',
    database: process.env.DB_NAME || 'CashManagement',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'CashMgmt@2026',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        readOnlyIntent: true
    }
};

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

let isSyncing = false;
let pendingTrigger = false;
let debounceTimer = null;
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
        if (!fs.existsSync(path.dirname(resolvedSqlitePath))) {
            fs.mkdirSync(path.dirname(resolvedSqlitePath), { recursive: true });
        }
        sqliteDb = new Database(resolvedSqlitePath, { timeout: 4000 });
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
    return '1970-01-01 00:00:00';
}

function saveLastSyncTime(timeStr) {
    try {
        fs.writeFileSync(syncStatePath, JSON.stringify({ lastSyncTime: timeStr }, null, 2), 'utf8');
    } catch (_) { }
}

async function doSyncDelta() {
    if (isSyncing) {
        pendingTrigger = true;
        return;
    }
    isSyncing = true;
    const startTime = Date.now();
    const lastSyncTime = getLastSyncTime();

    try {
        const pool = await getSqlPool();
        const db = getSqliteDb();

        // Exact SQL Server clock with 5-second overlap
        let currentSyncTime = '1970-01-01 00:00:00';
        try {
            const timeRes = await pool.request().query('SELECT CONVERT(varchar(19), DATEADD(second, -5, GETDATE()), 120) AS SafeTime');
            if (timeRes.recordset && timeRes.recordset[0] && timeRes.recordset[0].SafeTime) {
                currentSyncTime = timeRes.recordset[0].SafeTime;
            }
        } catch (_) { }

        const tablesRes = await pool.request().query(`
            SELECT t.name AS TableName, c.name AS PkCol,
                   (SELECT COUNT(1) FROM sys.columns col WHERE col.object_id = t.object_id AND col.name = 'UpdatedAt') AS HasUpdatedAt
            FROM sys.tables t
            JOIN sys.identity_columns c ON t.object_id = c.object_id
            WHERE t.name NOT IN ('ApiIdempotencyRequests', 'AppLicenses')
            ORDER BY t.name
        `);

        let totalSynced = 0;

        for (const t of tablesRes.recordset) {
            const tbl = t.TableName;
            const pk = t.PkCol;
            const hasUpdatedAt = t.HasUpdatedAt > 0;

            let maxSqPk = 0;
            try {
                const row = db.prepare(`SELECT MAX("${pk}") as maxPk FROM "${tbl}"`).get();
                maxSqPk = (row && row.maxPk) ? Number(row.maxPk) : 0;
            } catch (_) { }

            let q = `SELECT * FROM [${tbl}] WHERE [${pk}] > ${maxSqPk}`;
            if (hasUpdatedAt) {
                q += ` OR [UpdatedAt] >= '${lastSyncTime}'`;
            }
            q += ` ORDER BY [${pk}] ASC`;

            const res = await pool.request().query(q);
            const rows = res.recordset;

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
                totalSynced += rows.length;
            }

            // Always sync Accounts real-time balance
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

        // Always sync SystemSettings if modified
        try {
            const settingsRes = await pool.request().query(`SELECT * FROM [SystemSettings] WHERE [UpdatedAt] >= '${lastSyncTime}'`);
            if (settingsRes.recordset && settingsRes.recordset.length > 0) {
                const sqliteCols = db.prepare(`PRAGMA table_info("SystemSettings")`).all().map(c => c.name);
                const colsToInsert = Object.keys(settingsRes.recordset[0]).filter(c => sqliteCols.includes(c));
                const colList = colsToInsert.map(c => `"${c}"`).join(', ');
                const placeholders = colsToInsert.map(() => '?').join(', ');
                const stmt = db.prepare(`INSERT OR REPLACE INTO "SystemSettings" (${colList}) VALUES (${placeholders})`);
                for (const r of settingsRes.recordset) {
                    stmt.run(...colsToInsert.map(c => formatVal(r[c])));
                }
                totalSynced += settingsRes.recordset.length;
            }
        } catch (_) { }

        saveLastSyncTime(currentSyncTime);
        if (totalSynced > 0) {
            console.log(`⚡ [Real-Time Sync] Mirrored ${totalSynced} row(s) to SQLite (Port 4000) in ${Date.now() - startTime}ms`);
        }
    } catch (err) {
        // Log quietly, never crash
        console.warn(`⚠️ [Real-Time Sync Notice] ${err.message}`);
    } finally {
        isSyncing = false;
        if (pendingTrigger) {
            pendingTrigger = false;
            setImmediate(() => doSyncDelta());
        }
    }
}

/**
 * Debounced trigger called whenever an API mutating request finishes on Port 3000
 */
function triggerSilentRealtimeSync(delayMs = 300) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        doSyncDelta().catch(() => { });
    }, delayMs);
}

/**
 * Start background periodic sync interval (e.g. every 15 seconds)
 */
function initRealtimeSyncDaemon(intervalSec = 15) {
    // Run once after 3 seconds on boot
    setTimeout(() => {
        doSyncDelta().then(() => {
            console.log('✅ [Real-Time Sync Engine] Initialized and monitoring SQL Server (Port 3000) -> SQLite (Port 4000)');
        }).catch(() => { });
    }, 3000);

    // Periodic sweep
    setInterval(() => {
        doSyncDelta().catch(() => { });
    }, intervalSec * 1000);
}

module.exports = {
    triggerSilentRealtimeSync,
    initRealtimeSyncDaemon,
    doSyncDelta
};
