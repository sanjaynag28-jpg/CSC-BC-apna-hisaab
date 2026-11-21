const fs = require('fs');
const path = require('path');
const archiverModule = require('archiver');
// archiver v8+ named classes export karta hai; purane versions factory function.
const createZipArchive = (options = {}) => {
    const ZipArchive = archiverModule.ZipArchive || (archiverModule.default && archiverModule.default.ZipArchive);
    if (ZipArchive) return new ZipArchive(options);
    if (typeof archiverModule === 'function') return archiverModule('zip', options);
    throw new Error('archiver: unsupported export shape');
};
const { execSync } = require('child_process');

async function createBackupZip() {
    console.log('\n========================================================');
    console.log('   📦 CASH MANAGEMENT BC - GOOGLE DRIVE BACKUP PACKER');
    console.log('========================================================\n');

    // 1. First take fresh SQL Database Backup
    console.log('⏳ Step 1: SQL Server Database ka live backup le rahe hain...');
    const backupsDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupsDir)) throw new Error('Backups directory is missing.');
    const before = new Map(fs.readdirSync(backupsDir)
        .filter(f => f.toLowerCase().endsWith('.bak'))
        .map(f => {
            const stat = fs.statSync(path.join(backupsDir, f));
            return [f, `${stat.size}:${stat.mtimeMs}`];
        }));
    execSync('node database/backup-runner.js', { stdio: 'inherit' });

    const freshBackups = fs.readdirSync(backupsDir)
        .filter(f => f.toLowerCase().endsWith('.bak'))
        .map(f => {
            const fullPath = path.join(backupsDir, f);
            const stat = fs.statSync(fullPath);
            return { name: f, fullPath, time: stat.mtimeMs, size: stat.size, signature: `${stat.size}:${stat.mtimeMs}` };
        })
        .filter(f => f.signature !== before.get(f.name) && f.size > 0)
        .sort((a, b) => b.time - a.time);
    if (freshBackups.length === 0) {
        throw new Error('No new non-empty database backup was created in this run; ZIP operation aborted.');
    }
    const latestBak = freshBackups[0].name;
    console.log(`\n✅ Fresh Database Backup included: ${latestBak}`);

    // 2. Prepare Zip File
    const now = new Date();
    const dateStr = now.toISOString().replace(/T/, '_').replace(/:/g, '-').slice(0, 19);
    const outZipName = `CMBC_Full_Backup_${dateStr}.zip`;
    const outZipPath = path.join(backupsDir, outZipName);

    console.log(`\n⏳ Step 2: Project files aur Database ko ZIP me pack kiya ja raha hai...`);
    console.log(`📁 Target: ${outZipPath}`);

    const output = fs.createWriteStream(outZipPath);
    const archive = createZipArchive({ zlib: { level: 9 } });

    const projectRoot = path.join(__dirname, '..');
    const excludeDirs = new Set(['node_modules', '.git', 'brain', 'scratch', '.vscode', 'data']);

    function addDirToArchive(dirPath, zipInternalPath) {
        const items = fs.readdirSync(dirPath);
        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            const internalItem = zipInternalPath ? `${zipInternalPath}/${item}` : item;

            if (excludeDirs.has(item) && !zipInternalPath) continue;
            if (fullPath.toLowerCase().includes(path.join('database', 'data').toLowerCase())) continue;

            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                if (item === 'backups' && !zipInternalPath) {
                    // Only include the latest .bak file inside backups folder
                    if (latestBak) {
                        archive.file(path.join(backupsDir, latestBak), { name: `backups/${latestBak}` });
                    }
                } else {
                    addDirToArchive(fullPath, internalItem);
                }
            } else {
                if (!zipInternalPath && item.endsWith('.zip')) continue;
                if (!zipInternalPath && item.endsWith('.bak')) continue;
                archive.file(fullPath, { name: internalItem });
            }
        }
    }

    await new Promise((resolve, reject) => {
        output.once('close', resolve);
        output.once('error', reject);
        archive.once('error', reject);
        archive.pipe(output);
        try {
            addDirToArchive(projectRoot, '');
            archive.finalize();
        } catch (err) {
            archive.destroy();
            output.destroy();
            reject(err);
        }
    });

    const sizeMb = (archive.pointer() / (1024 * 1024)).toFixed(2);
    console.log('\n========================================================');
    console.log('🎉 BACKUP ZIP SAFALTA-PURVAK TAIYAR HO GAYI!');
    console.log('========================================================');
    console.log(`📦 File:     ${outZipName}`);
    console.log(`💾 Size:     ${sizeMb} MB`);
    console.log(`📁 Location: ${outZipPath}`);
    console.log('\n☁️ Google Drive par upload karne ke 2 aasan tareeqe:');
    console.log('  1. Browser me https://drive.google.com kholein aur is file ko Drag & Drop karein.');
    console.log('  2. Ya Google Drive Desktop app me "backups" folder ko sync kar lein.');
    console.log('========================================================\n');

    try {
        execSync(`explorer /select,"${outZipPath}"`);
    } catch (_) {}
}

createBackupZip().catch((err) => {
    console.error('❌ Backup ZIP failed:', err.message);
    process.exitCode = 1;
});
