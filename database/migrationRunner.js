/**
 * database/migrationRunner.js
 * ---------------------------------------------------------------------------
 * File-based, ledger-tracked, non-destructive migration runner.
 *
 * Folder: database/migrations/*.sql   (filename hi migration name hai)
 * Ledger: dbo.SchemaMigrations        (MigrationName unique)
 *
 * Safety rules:
 *   - Sirf pending files chalte hain (ledger se compare).
 *   - Har migration ek transaction me + sp_getapplock (double-run se bachao).
 *   - Har migration se pehle full DB backup (skip: --no-backup).
 *   - Koi DROP / TRUNCATE yahan nahi hota — files me bhi allowed nahi.
 *   - Dry-run: sirf list dikhata hai, kuch apply nahi karta.
 *
 * Usage:
 *   node database/migrationRunner.js --dry-run
 *   node database/migrationRunner.js
 *   node database/migrationRunner.js --no-backup
 */

const fs = require('fs');
const path = require('path');
const { query, withTransaction, closePool } = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const LOCK_RESOURCE = 'CM_SchemaMigration';

async function ensureLedger() {
    await query(`
        IF OBJECT_ID('dbo.SchemaMigrations', 'U') IS NULL
        BEGIN
            CREATE TABLE dbo.SchemaMigrations (
                MigrationID INT IDENTITY(1,1) NOT NULL,
                MigrationName NVARCHAR(200) NOT NULL,
                AppliedAt DATETIME NOT NULL DEFAULT (GETDATE()),
                Description NVARCHAR(500) NULL,
                CONSTRAINT PK_SchemaMigrations PRIMARY KEY CLUSTERED (MigrationID),
                CONSTRAINT UQ_SchemaMigrations_Name UNIQUE (MigrationName)
            );
        END
    `);
}

async function getAppliedSet() {
    const res = await query(`SELECT MigrationName FROM dbo.SchemaMigrations`);
    return new Set((res.recordset || []).map(r => r.MigrationName));
}

function listMigrationFiles() {
    if (!fs.existsSync(MIGRATIONS_DIR)) return [];
    return fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.toLowerCase().endsWith('.sql'))
        .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

// Ledger me naam bina .sql ke rehta hai (existing 001..005 convention).
function migrationKey(fileName) {
    return String(fileName).replace(/\.sql$/i, '');
}

function splitBatches(sqlText) {
    return String(sqlText)
        .split(/^\s*GO\s*$/im)
        .map(b => b.trim())
        .filter(Boolean);
}

function assertNonDestructive(fileName, sqlText) {
    // Guard: galti se data-destroying statement na chale
    const dangerous = [
        /\bDROP\s+TABLE\b/i,
        /\bDROP\s+DATABASE\b/i,
        /\bTRUNCATE\s+TABLE\b/i,
        /\bDROP\s+COLUMN\b/i
    ];
    for (const re of dangerous) {
        if (re.test(sqlText)) {
            throw new Error(`[SAFETY] ${fileName} me destructive statement mila (${re}). Migration reject.`);
        }
    }
}

async function takeBackup() {
    const folder = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    const res = await query(`EXEC sp_BackupCashManagementDB @BackupFolder = @f`, { f: folder });
    return res.recordset?.[0]?.BackupPath || folder;
}

/**
 * @param {Object} options
 * @param {boolean} [options.dryRun]
 * @param {boolean} [options.backup]   default true
 * @param {string}  [options.dir]
 */
async function runPendingMigrations({ dryRun = false, backup = true, dir = MIGRATIONS_DIR } = {}) {
    const log = (...a) => console.log('[migration]', ...a);

    await ensureLedger();
    const files = (dir === MIGRATIONS_DIR)
        ? listMigrationFiles()
        : fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.sql')).sort();

    const applied = await getAppliedSet();
    const pending = files.filter(f => !applied.has(f) && !applied.has(migrationKey(f)));

    if (!pending.length) {
        log(`Kuch pending nahi — ${applied.size} migration already applied.`);
        return { applied: [], pending: [], backupPath: null };
    }

    log(`Pending migrations (${pending.length}): ${pending.join(', ')}`);

    if (dryRun) {
        for (const f of pending) {
            const sqlText = fs.readFileSync(path.join(dir, f), 'utf8');
            assertNonDestructive(f, sqlText);
            log(`[DRY-RUN] would apply: ${f} (${splitBatches(sqlText).length} batch(es))`);
        }
        return { applied: [], pending, backupPath: null, dryRun: true };
    }

    let backupPath = null;
    if (backup) {
        try {
            backupPath = await takeBackup();
            log('Backup ready:', backupPath);
        } catch (err) {
            log('⚠️ Backup fail hua:', err.message);
            throw new Error('Backup ke bina migration apply nahi hogi. (--no-backup se force kar sakte hain)');
        }
    }

    const doneNow = [];
    for (const f of pending) {
        const filePath = path.join(dir, f);
        const sqlText = fs.readFileSync(filePath, 'utf8');
        assertNonDestructive(f, sqlText);
        const batches = splitBatches(sqlText);
        if (!batches.length) {
            log(`skip (empty): ${f}`);
            continue;
        }

        await withTransaction(async (tQuery) => {
            const lockRes = await tQuery(`
                DECLARE @r INT;
                EXEC @r = sp_getapplock @Resource = @res, @LockMode = 'Exclusive',
                                        @LockOwner = 'Transaction', @LockTimeout = 15000;
                SELECT @r AS Result;
            `, { res: LOCK_RESOURCE });

            const lockResult = lockRes.recordset?.[0]?.Result;
            if (lockResult !== undefined && lockResult < 0) {
                throw new Error('Schema migration lock nahi mila (doosra instance chal raha hai?)');
            }

            for (const batch of batches) {
                await tQuery(batch);
            }

            await tQuery(`
                INSERT INTO dbo.SchemaMigrations (MigrationName, Description)
                VALUES (@name, @desc)
            `, { name: migrationKey(f), desc: 'auto-applied by migrationRunner' });
        });

        doneNow.push(f);
        log('✅ applied:', f);
    }

    return { applied: doneNow, pending, backupPath };
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const backup = !args.includes('--no-backup');
    runPendingMigrations({ dryRun, backup })
        .then(async (r) => {
            console.log('\nResult:', JSON.stringify(r, null, 2));
            await closePool();
            process.exit(0);
        })
        .catch(async (err) => {
            console.error('\n❌ Migration failed:', err.message);
            try { await closePool(); } catch (_) { }
            process.exit(1);
        });
}

module.exports = { runPendingMigrations, listMigrationFiles };
