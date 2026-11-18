const fs = require('fs');
const path = require('path');
const { query, closePool } = require('./db');

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

    // Find requested or latest .bak file
    let targetBak = process.argv[2];
    if (!targetBak) {
        const baks = fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.bak'))
            .map(f => ({ name: f, full: path.join(backupDir, f), time: fs.statSync(path.join(backupDir, f)).mtimeMs }))
            .sort((a, b) => b.time - a.time);

        if (baks.length === 0) {
            console.error('❌ Koi bhi .bak backup file nahi mili backups folder me.');
            process.exit(1);
        }
        targetBak = baks[0].full;
    } else if (!path.isAbsolute(targetBak)) {
        targetBak = path.join(backupDir, targetBak);
    }

    if (!fs.existsSync(targetBak)) {
        console.error('❌ Specified backup file nahi mili:', targetBak);
        process.exit(1);
    }

    const bakFileName = path.basename(targetBak);
    const sizeMB = (fs.statSync(targetBak).size / (1024 * 1024)).toFixed(2);

    console.log(`📁 Backup File: ${bakFileName} (${sizeMB} MB)`);
    console.log('⏳ SQL Server me database restore ho raha hai...');

    try {
        const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

        // 1. Verify backup file first
        await query(`RESTORE VERIFYONLY FROM DISK = ${lit(targetBak)};`);
        console.log('✅ Backup file verify ho gayi (readable hai).');

        // 2. Disconnect existing users and restore with replace
        await query(`
            USE master;
            IF DB_ID('CashManagement') IS NOT NULL
            BEGIN
                ALTER DATABASE CashManagement SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
            END;
            RESTORE DATABASE CashManagement FROM DISK = ${lit(targetBak)} WITH REPLACE;
            ALTER DATABASE CashManagement SET MULTI_USER;
        `);

        console.log('');
        console.log('========================================================');
        console.log('🎉 DATABASE RESTORE SAFALTA-PURVAK HO GAYA!');
        console.log('========================================================');
        console.log('Saara purana data, grahak, len-den, khatabook 100% restore ho gaya!');
        console.log('');
        await closePool();
        process.exit(0);
    } catch (err) {
        console.error('❌ Restore fail hua:', err.message);
        try {
            await query(`
                USE master;
                IF DB_ID('CashManagement') IS NOT NULL
                BEGIN
                    ALTER DATABASE CashManagement SET MULTI_USER;
                END;
            `);
        } catch (_) {}
        await closePool();
        process.exit(1);
    }
}

runRestore();
