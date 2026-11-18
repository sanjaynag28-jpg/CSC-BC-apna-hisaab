const fs = require('fs');
const path = require('path');
const { query, closePool } = require('./db');

const RETENTION_DAYS = 7;
const MAX_BACKUPS_TO_KEEP = 10;

async function purgeOldBackups(backupDir) {
    try {
        const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
        const dbBakFiles = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('CashManagement_Backup_') && f.endsWith('.bak'))
            .map(f => {
                try {
                    return { name: f, time: fs.statSync(path.join(backupDir, f)).mtimeMs };
                } catch(e) { return null; }
            })
            .filter(Boolean);

        // Sort newest first
        dbBakFiles.sort((a, b) => b.time - a.time);

        let removed = 0;
        // Keep top MAX_BACKUPS_TO_KEEP, remove the rest
        for (let i = 0; i < dbBakFiles.length; i++) {
            if (i >= MAX_BACKUPS_TO_KEEP || dbBakFiles[i].time < cutoff) {
                const full = path.join(backupDir, dbBakFiles[i].name);
                try {
                    fs.unlinkSync(full);
                    removed++;
                } catch (e) { }
            }
        }
        return removed;
    } catch (e) {
        return 0;
    }
}

async function runBackup() {
    try {
        console.log('');
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║   🛡️  CASH MANAGEMENT SYSTEM - AUTOMATIC DATABASE BACKUP    ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log('');

        const localBackupDir = path.join(__dirname, '..', 'backups');
        if (!fs.existsSync(localBackupDir)) {
            fs.mkdirSync(localBackupDir, { recursive: true });
        }

        console.log('⏳ SQL Server Database ka live backup ho raha hai...');
        // Apne project ke andar wale 'backups' folder ka ABSOLUTE path stored procedure ko do,
        // taaki project kisi bhi drive/folder me ho to bhi backup sahi jagah bane
        // (warna procedure ka hardcoded default D:\... fail ho jata hai).
        const backupFolder = path.join(localBackupDir, '\\');
        const res = await query('EXEC sp_BackupCashManagementDB @BackupFolder = @folder', { folder: backupFolder });
        const backupResult = res.recordset[0];
        const backupPath = backupResult.BackupPath;

        const stats = fs.statSync(backupPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

        // VERIFYONLY - backup sach me readable hai ya nahi (corrupt backup bekaar hai)
        console.log('🔍 Backup verify ho raha hai (RESTORE VERIFYONLY)...');
        const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
        await query(`
            USE master;
            EXEC sp_executesql @verifySql;
        `, {
            verifySql: `RESTORE VERIFYONLY FROM DISK = ${lit(backupPath)};`
        });
        console.log('✅ Backup verify ho gaya — file readable hai.');

        // Retention policy: 30 din se purani backups hatao (disk unbounded na bade)
        const removed = await purgeOldBackups(localBackupDir);
        if (removed > 0) {
            console.log(`🧹 ${removed} purani backup (${RETENTION_DAYS} din+) delete kar di gayi.`);
        }

        console.log('');
        console.log('✅ BACKUP SAFALTA-PURVAK BAN GAYA!');
        console.log('📁 File Location: ' + backupPath);
        console.log('📦 File Size:     ' + sizeMB + ' MB');
        console.log('');
        console.log('💡 TIP: Data loss se 100% surakshit rehne ke liye is folder');
        console.log('        (' + localBackupDir + ') ko kabhi-kabhi');
        console.log('        Pen Drive ya Google Drive me copy kar liya karein.');
        console.log('');
        await closePool();
        process.exit(0);
    } catch (err) {
        console.error('❌ Backup Failed:', err.message);
        await closePool();
        process.exit(1);
    }
}

runBackup();