/**
 * Cash Management - Automated Fresh & Existing Database Setup, Migration & Starter Seeding
 * Safe & Idempotent:
 * - On a brand-new SQL Server: creates the database from master, builds all 24 tables,
 *   all 5 stored procedures, Rule 1/3 migrations, and starter accounts/categories/services/admin.
 * - On an existing database: preserves 100% of existing data and only applies missing objects.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { sql, getPool, getMasterPool } = require('./database/db');

function updateDotEnv(key, value) {
    try {
        const envPath = path.join(__dirname, '.env');
        let lines = [];
        if (fs.existsSync(envPath)) {
            lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
        }
        let found = false;
        lines = lines.map(line => {
            if (line.trim().startsWith(`${key}=`)) {
                found = true;
                return `${key}=${value}`;
            }
            return line;
        });
        if (!found) {
            lines.push(`${key}=${value}`);
        }
        fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
        process.env[key] = value;
    } catch (e) {
        console.warn(`⚠️ .env update warning: ${e.message}`);
    }
}

function loadEnvConfig() {
    return {
        server: process.env.DB_SERVER || 'localhost\\SQLEXPRESS',
        database: process.env.DB_NAME || 'CashManagement',
        user: process.env.DB_USER || 'sa',
        password: process.env.DB_PASSWORD || '',
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true
        },
        connectionTimeout: 20000,
        requestTimeout: 60000
    };
}

function safeBracketIdent(name) {
    return '[' + String(name || 'CashManagement').replace(/\]/g, ']]') + ']';
}

function getStoredProcedureName(batch) {
    const match = String(batch).match(/^CREATE\s+OR\s+ALTER\s+PROCEDURE\s+((?:\[?\w+\]?\.)?\[?\w+\]?)/i);
    if (!match) return null;

    const parts = match[1].split('.').map((part) => part.replace(/^\[|\]$/g, ''));
    if (parts.length === 1) parts.unshift('dbo');

    return {
        objectName: parts.join('.'),
        declarationName: parts.map((part) => `[${part.replace(/\]/g, ']]')}]`).join('.')
    };
}

function prepareStoredProcedureBatch(batch, exists) {
    let trimmed = String(batch).trim();
    if (!/CREATE\s+OR\s+ALTER\s+PROCEDURE/i.test(trimmed)) return trimmed;

    trimmed = trimmed.replace(/^(\s*--[^\r\n]*\r?\n)+/i, '').trim();
    const procedure = getStoredProcedureName(trimmed);
    if (!procedure) {
        throw new Error('Unsupported stored procedure declaration in database/setup.sql');
    }

    const verb = exists ? 'ALTER' : 'CREATE';
    return trimmed.replace(
        /^CREATE\s+OR\s+ALTER\s+PROCEDURE\s+(?:\[?\w+\]?\.)?\[?\w+\]?/i,
        `${verb} PROCEDURE ${procedure.declarationName}`
    );
}

async function ensureDatabaseExists(baseCfg, isClean = false, forceNewDb = false) {
    let dbName = baseCfg.database || 'CashManagement';
    if (forceNewDb) {
        dbName = dbName === 'CashManagement' ? 'CashManagement_v1' : 'CSC_BC_DB';
        updateDotEnv('DB_NAME', dbName);
        console.log(`🔄 Force New DB mode: Target database "${dbName}" set kiya gaya.`);
    }

    console.log(`🔍 SQL Server master pool se connect kar rahe hain...`);
    const masterPool = await getMasterPool();
    try {
        const res = await masterPool.request()
            .input('dbName', sql.NVarChar(128), dbName)
            .query('SELECT name FROM sys.databases WHERE name = @dbName');
        
        if (isClean && res.recordset.length > 0) {
            console.log(`🧹 Clean Install Mode: Database "${dbName}" ko fresh re-create kar rahe hain...`);
            let dropped = false;
            try {
                await masterPool.request().query(`
                    ALTER DATABASE ${safeBracketIdent(dbName)} SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                    DROP DATABASE ${safeBracketIdent(dbName)};
                `);
                console.log(`🗑️ Purana "${dbName}" database successfully drop ho gaya.`);
                dropped = true;
            } catch (dropErr) {
                console.warn(`⚠️ Purana database drop warning (${dropErr.message}). Naye database par switch kar rahe hain...`);
                dbName = dbName === 'CashManagement' ? 'CashManagement_v1' : 'CSC_BC_DB';
                updateDotEnv('DB_NAME', dbName);
                console.log(`🔄 Switched target database to: "${dbName}"`);
            }
            await masterPool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'${dbName.replace(/'/g, "''")}')
                    CREATE DATABASE ${safeBracketIdent(dbName)};
            `);
            console.log(`✅ Fresh "${dbName}" database create ho gaya!`);
        } else if (res.recordset.length === 0) {
            console.log(`🆕 Database "${dbName}" nahi mila — naya database create kar rahe hain...`);
            try {
                await masterPool.request().query(`CREATE DATABASE ${safeBracketIdent(dbName)}`);
                console.log(`✅ Database "${dbName}" successfully create ho gaya!`);
            } catch (createErr) {
                console.warn(`⚠️ Database "${dbName}" create error (${createErr.message}). Alternate database try kar rahe hain...`);
                dbName = dbName === 'CashManagement' ? 'CashManagement_v1' : 'CSC_BC_DB';
                updateDotEnv('DB_NAME', dbName);
                await masterPool.request().query(`
                    IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'${dbName.replace(/'/g, "''")}')
                        CREATE DATABASE ${safeBracketIdent(dbName)};
                `);
                console.log(`✅ Alternate database "${dbName}" successfully create ho gaya!`);
            }
        } else {
            console.log(`✅ Database "${dbName}" already exists.`);
        }
        return dbName;
    } finally {
        try { await masterPool.close(); } catch (_) { }
    }
}

async function seedStarterDataIfEmpty(pool) {
    // 1. Starter SuperAdmin user (ONLY if Users table is completely empty)
    const userCount = (await pool.request().query('SELECT COUNT(*) AS cnt FROM Users')).recordset[0].cnt;
    if (userCount === 0) {
        // Koi fixed/default password nahi: har install par random password banta hai.
        // Is PC par localhost auto-login hai, isliye password type karne ki zaroorat nahi.
        // Mobile / LAN se login ke liye credentials .admin-login.txt me save hote hain.
        const adminPassword = crypto.randomBytes(12).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 14);
        const passwordHash = await bcrypt.hash(adminPassword, 10);
        const apiToken = crypto.randomBytes(24).toString('hex');
        await pool.request()
            .input('u', sql.NVarChar, 'admin')
            .input('p', sql.NVarChar, passwordHash)
            .input('s', sql.NVarChar, 'My CSC & BC Center')
            .input('o', sql.NVarChar, 'Admin')
            .input('t', sql.NVarChar, apiToken)
            .query(`
                INSERT INTO Users (Username, PasswordHash, ShopName, OwnerName, Role, IsActive, ApiToken, CreatedAt, UpdatedAt)
                VALUES (@u, @p, @s, @o, 'SuperAdmin', 1, @t, GETDATE(), GETDATE())
            `);

        try {
            const credPath = path.join(__dirname, '.admin-login.txt');
            fs.writeFileSync(credPath, [
                'CSC & BC Apna Hisaab — Admin Login',
                '=================================',
                'Username: admin',
                `Password: ${adminPassword}`,
                '',
                'Is PC par localhost auto-login hai — password type karne ki zaroorat nahi.',
                'Mobile / LAN se login karne ke liye upar wala password use karein.',
                'Settings me apna password set karne ke baad ye file delete kar dein.',
                ''
            ].join('\r\n'), 'utf8');
            console.log('✅ Admin account ready — is PC par bina password (localhost auto-login).');
            console.log(`   Remote/LAN login credentials saved: ${credPath}`);
        } catch (credErr) {
            console.warn('⚠️ .admin-login.txt save nahi ho payi:', credErr.message);
            console.log(`   Admin password (is baar ke liye): ${adminPassword}`);
        }
    }

    // 2. Starter Accounts (ONLY if Accounts table is completely empty)
    const accCount = (await pool.request().query('SELECT COUNT(*) AS cnt FROM Accounts')).recordset[0].cnt;
    if (accCount === 0) {
        await pool.request().query(`
            INSERT INTO Accounts (AccountName, AccountType, BankName, OpeningBalance, CurrentBalance, Currency, IsActive, Color, Icon, UserID)
            VALUES
                (N'PHYSICAL CASH', N'Cash', NULL, 0, 0, 'INR', 1, '#10b981', 'banknote', 1),
                (N'APNA BANK / PORTAL', N'Bank', N'Main Bank', 0, 0, 'INR', 1, '#3b82f6', 'landmark', 1)
        `);
        console.log('✅ Starter Cash & Bank accounts created.');
    }

    // 3. Starter Categories (ONLY if Categories table is completely empty)
    const catCount = (await pool.request().query('SELECT COUNT(*) AS cnt FROM Categories')).recordset[0].cnt;
    if (catCount === 0) {
        await pool.request().query(`
            INSERT INTO Categories (CategoryName, CategoryType, Icon, Color, IsActive, UserID)
            VALUES
                (N'CSC Service Fee', N'Income', 'monitor', '#10b981', 1, 1),
                (N'BC / AEPS Commission', N'Income', 'landmark', '#059669', 1, 1),
                (N'Bill Payment Charge', N'Income', 'zap', '#0ea5e9', 1, 1),
                (N'Photocopy / Print / Lamination', N'Income', 'printer', '#8b5cf6', 1, 1),
                (N'Online Form / Banking Charge', N'Income', 'file-text', '#6366f1', 1, 1),
                (N'Other Income', N'Income', 'plus-circle', '#22c55e', 1, 1),
                (N'Shop Rent', N'Expense', 'home', '#ef4444', 1, 1),
                (N'Electricity Bill', N'Expense', 'zap', '#f59e0b', 1, 1),
                (N'Internet / Wi-Fi', N'Expense', 'wifi', '#3b82f6', 1, 1),
                (N'Stationery / Paper / Ink', N'Expense', 'shopping-bag', '#ec4899', 1, 1),
                (N'Staff Salary', N'Expense', 'users', '#f97316', 1, 1),
                (N'Other Expense', N'Expense', 'minus-circle', '#64748b', 1, 1)
        `);
        console.log('✅ Starter Income & Expense categories created.');
    }

    // 4. Starter CSC Services (ONLY if CSCServices table is completely empty)
    const cscSvcCount = (await pool.request().query('SELECT COUNT(*) AS cnt FROM CSCServices')).recordset[0].cnt;
    if (cscSvcCount === 0) {
        await pool.request().query(`
            INSERT INTO CSCServices (ServiceName, GovtFee, OperatorFee, DefaultDays, Icon, IsActive, SortOrder, UserID)
            VALUES
                (N'Aay Praman Patra (Income Cert)', 15, 35, 7, 'file-check', 1, 1, 1),
                (N'Jati Praman Patra (Caste Cert)', 15, 35, 7, 'file-check', 1, 2, 1),
                (N'Niwas Praman Patra (Domicile)', 15, 35, 7, 'home', 1, 3, 1),
                (N'PAN Card (New / Correction)', 107, 93, 15, 'credit-card', 1, 4, 1),
                (N'Aadhaar Print / PVC Card', 50, 50, 1, 'id-card', 1, 5, 1),
                (N'Ayushman Bharat Card', 0, 50, 2, 'heart-pulse', 1, 6, 1),
                (N'PM Kisan e-KYC / Registration', 0, 50, 1, 'sprout', 1, 7, 1),
                (N'Ration Card Apply / Unit Add', 0, 50, 15, 'clipboard-list', 1, 8, 1),
                (N'Passport Online Apply', 1500, 200, 15, 'globe', 1, 9, 1),
                (N'Scholarship / Online Form', 0, 100, 1, 'graduation-cap', 1, 10, 1),
                (N'Birth / Death Certificate', 20, 80, 10, 'file-text', 1, 11, 1),
                (N'Photocopy / Print / Scan', 0, 10, 0, 'printer', 1, 12, 1)
        `);
        console.log('✅ Starter CSC services created.');
    }

    // 5. Starter SystemSettings (ONLY missing keys)
    const defaultSettings = [
        ['ShopName', 'My CSC & BC Center', 'General', 'Dukan / Counter ka naam'],
        ['ShopSubtitle', 'Grahak Seva Kendra, CSC Center & Digital Banking', 'ShopProfile', 'Dukaan subtitle'],
        ['ShopPhone', '', 'ShopProfile', 'Shop phone number'],
        ['ShopAddress', '', 'ShopProfile', 'Shop address'],
        ['ShopEmail', '', 'ShopProfile', 'Shop email'],
        ['ShopGSTIN', '', 'ShopProfile', 'Shop GSTIN'],
        ['ShopCSPCode', '', 'ShopProfile', 'CSP / CSC ID'],
        ['ShopFooterMsg', 'Thank you for visiting! Phir Padhaarein.', 'ShopProfile', 'Receipt footer message'],
        ['AutoBackupEnabled', '1', 'Backup', 'Automatic backup enabled (1=Yes, 0=No)'],
        ['BackupRetentionDays', '30', 'Backup', 'Kitne dino tak ke backups rakhne hain'],
        ['DefaultCashAccount', '1', 'Accounts', 'Counter primary cash account']
    ];
    for (const [k, v, grp, desc] of defaultSettings) {
        await pool.request()
            .input('k', sql.NVarChar(100), k)
            .input('v', sql.NVarChar(sql.MAX), v)
            .input('g', sql.NVarChar(50), grp)
            .input('d', sql.NVarChar(255), desc)
            .query(`
                IF NOT EXISTS (SELECT 1 FROM SystemSettings WHERE SettingKey = @k)
                INSERT INTO SystemSettings (SettingKey, SettingValue, SettingGroup, Description, UpdatedAt)
                VALUES (@k, @v, @g, @d, GETDATE())
            `);
    }
}

async function setup(options = {}) {
    console.log('🔄 Checking CashManagement database setup...');
    try {
        const isClean = Boolean(options.clean) ||
            process.argv.includes('--clean') ||
            process.argv.includes('--fresh') ||
            process.env.CLEAN_DB === '1' ||
            process.env.CLEAN_INSTALL === '1';

        const forceNewDb = Boolean(options.forceNewDb) ||
            process.argv.includes('--force-new-db') ||
            process.env.FORCE_NEW_DB === '1';

        const cfg = loadEnvConfig();

        // Step 1: Ensure target database exists via master connection (drop & recreate if isClean)
        const actualDb = await ensureDatabaseExists(cfg, isClean, forceNewDb);
        cfg.database = actualDb;

        // Step 2: Connect to target database
        const pool = await getPool({ database: actualDb });
        const sqlFile = path.join(__dirname, 'database', 'setup.sql');
        if (!fs.existsSync(sqlFile)) {
            console.error('❌ database/setup.sql file not found!');
            process.exit(1);
        }

        const rawSql = fs.readFileSync(sqlFile, 'utf8');
        const batches = rawSql.split(/^\s*GO\s*$/im);

        for (const batch of batches) {
            let trimmed = batch.trim();
            if (!trimmed) continue;
            // Skip CREATE DATABASE / USE <any_db> batches (already connected to target DB!)
            if (/^\s*IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+name\s+FROM\s+sys\.databases/i.test(trimmed)) continue;
            if (/^\s*USE\s+\[?\w+\]?\s*;?\s*$/i.test(trimmed)) continue;
            if (/CREATE\s+OR\s+ALTER\s+PROCEDURE/i.test(trimmed)) {
                const procedure = getStoredProcedureName(
                    trimmed.replace(/^(\s*--[^\r\n]*\r?\n)+/i, '').trim()
                );
                if (!procedure) {
                    throw new Error('Unsupported stored procedure declaration in database/setup.sql');
                }

                const result = await pool.request()
                    .input('objectName', sql.NVarChar(776), procedure.objectName)
                    .query("SELECT OBJECT_ID(@objectName, 'P') AS ObjectId");
                trimmed = prepareStoredProcedureBatch(trimmed, Boolean(result.recordset[0].ObjectId));
            }
            if (trimmed) {
                await pool.request().query(trimmed);
            }
        }

        // Step 3: Ensure Rule 1 & Rule 3 Relational Source Identity & Unique Index exist
        let runRule1Migration = null;
        try {
            runRule1Migration = require('./scripts/migration_rule1_sourceline').runRule1Migration;
        } catch (_) {
            try {
                runRule1Migration = require('./archive/legacy_scripts/migration_rule1_sourceline').runRule1Migration;
            } catch (_) { }
        }
        if (runRule1Migration) {
            await runRule1Migration();
        }

        // Step 4: Seed clean starter data ONLY if brand-new empty DB
        await seedStarterDataIfEmpty(pool);

        // Step 5: Apply file-based migrations (006+) — fresh install ko live schema ke barabar laane ke liye.
        // Seeding ke BAAD chalte hain taaki Users/Accounts exist hon aur FK constraints ban sakein.
        // Existing DB par backup ke saath, brand-new empty DB par backup skip.
        const { runPendingMigrations } = require('./database/migrationRunner');
        let hasExistingData = false;
        try {
            const custRes = await pool.request().query('SELECT COUNT(*) AS c FROM Customers');
            hasExistingData = Boolean(custRes.recordset[0]?.c > 0);
        } catch (_) {
            hasExistingData = false;
        }
        const migResult = await runPendingMigrations({ dryRun: false, backup: hasExistingData });
        if (migResult.applied.length) {
            console.log(`✅ ${migResult.applied.length} migration(s) applied: ${migResult.applied.join(', ')}`);
        }

        // Step 6: Ensure Layer 2 Dynamic Schema & Indexes are bootstrapped
        try {
            const { ensureAutoSchemaBootstrapped } = require('./database/autoSchemaBootstrapper');
            await ensureAutoSchemaBootstrapped();
        } catch (sErr) {
            console.warn('⚠️ AutoSchemaBootstrap warning:', sErr.message);
        }

        console.log('✅ Database setup completed & verified successfully!');
        if (options.exitOnDone !== false && require.main === module) {
            process.exit(0);
        }
        return true;
    } catch (err) {
        console.error('❌ Database setup failed:', err.message);
        if (options.exitOnDone !== false && require.main === module) {
            process.exit(1);
        }
        throw err;
    }
}

if (require.main === module) {
    setup();
}

module.exports = {
    setup,
    getStoredProcedureName,
    prepareStoredProcedureBatch
};
