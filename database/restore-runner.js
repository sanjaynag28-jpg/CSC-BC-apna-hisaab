const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { getDb, closePool } = require('./db');

async function runRestore() {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║   🛡️  CASH MANAGEMENT SYSTEM - 1-CLICK DATABASE RESTORE    ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');

    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) {
        console.error('❌ Backups folder nahi mila:', backupDir);
        process.exit(1);
    }

    // Find requested or latest SQLite .db backup file
    let targetBackup = process.argv[2];
    if (!targetBackup) {
        const dbs = fs.readdirSync(backupDir)
            .filter(f => f.toLowerCase().endsWith('.db'))
            .map(f => ({ name: f, full: path.join(backupDir, f), time: fs.statSync(path.join(backupDir, f)).mtimeMs }))
            .sort((a, b) => b.time - a.time);

        if (dbs.length === 0) {
            console.error('❌ Koi bhi .db SQLite backup file nahi mili backups folder me.');
            process.exit(1);
        }
        targetBackup = dbs[0].full;
    } else if (!path.isAbsolute(targetBackup)) {
        targetBackup = path.join(backupDir, targetBackup);
    }

    if (!fs.existsSync(targetBackup)) {
        console.error('❌ Specified backup file nahi mili:', targetBackup);
        process.exit(1);
    }

    const bakFileName = path.basename(targetBackup);
    const sizeMB = (fs.statSync(targetBackup).size / (1024 * 1024)).toFixed(2);
    const liveDbPath = process.env.CMBC_DB_PATH
        ? path.resolve(process.env.CMBC_DB_PATH)
        : path.join(__dirname, 'data', 'cash_management.db');

    console.log(`📁 Backup File: ${bakFileName} (${sizeMB} MB)`);
    console.log('⏳ SQLite backup verify aur restore ho raha hai...');

    let backupDb = null;
    try {
        // 1. Integrity check on backup file before touching live DB
        backupDb = new Database(targetBackup, { readonly: true, fileMustExist: true });
        const chk = backupDb.prepare('PRAGMA integrity_check').get();
        const chkVal = chk && (chk.integrity_check || Object.values(chk)[0]);
        if (String(chkVal || '').toLowerCase() !== 'ok') {
            throw new Error(`Backup integrity check failed: ${chkVal}`);
        }
        console.log('✅ Backup file integrity_check = ok (surakshit hai).');

        // 2. Save safety pre-restore snapshot if live DB exists
        fs.mkdirSync(path.dirname(liveDbPath), { recursive: true });
        if (fs.existsSync(liveDbPath)) {
            const safetyName = `pre_restore_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
            const safetyPath = path.join(backupDir, safetyName);
            await getDb().backup(safetyPath);
            console.log(`🛟 Pre-restore safety snapshot saved: ${safetyName}`);
        }

        // 3. Close live pool & restore atomically via better-sqlite3 backup API
        await closePool();
        await backupDb.backup(liveDbPath);
        backupDb.close();
        backupDb = null;

        // Clean stale WAL/SHM sidecars if left from pre-restore DB
        for (const ext of ['-wal', '-shm']) {
            try {
                if (fs.existsSync(liveDbPath + ext)) fs.unlinkSync(liveDbPath + ext);
            } catch (_) { }
        }

        console.log('');
        console.log('========================================================');
        console.log('🎉 SQLITE DATABASE RESTORE SAFALTA-PURVAK HO GAYA!');
        console.log('========================================================');
        console.log('Saara purana data, grahak, len-den, khatabook 100% restore ho gaya!');
        console.log('');
        process.exit(0);
    } catch (err) {
        console.error('❌ Restore fail hua:', err.message);
        if (backupDb) {
            try { backupDb.close(); } catch (_) { }
        }
        await closePool();
        process.exit(1);
    }
}

runRestore();
