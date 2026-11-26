/**
 * Cash Management - Automated SQLite Database Setup & Live Self-Healing Seeding
 * 100% Pure Embedded Zero-Install SQLite Edition
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

function parseSchemaStatements(schemaSql) {
    const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([A-Za-z0-9_]+)["`]?\s*\(([\s\S]*?)\n\s*\);/gi;
    let tm;
    const schemaTables = new Map();
    while ((tm = tableRegex.exec(schemaSql)) !== null) {
        schemaTables.set(tm[1], {
            createStmt: tm[0],
            body: tm[2]
        });
    }
    return schemaTables;
}

function repairSingleTable(db, tName, tMeta) {
    const tableExists = db.prepare("SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name=?").get(tName).cnt > 0;
    if (!tableExists) {
        try { db.exec(tMeta.createStmt); } catch (_) { }
        return;
    }

    const existingCols = db.prepare(`PRAGMA table_info("${tName}")`).all().map(r => r.name);
    const existingColLower = new Set(existingCols.map(c => c.toLowerCase()));

    const expectedCols = [];
    for (const rawLine of tMeta.body.split('\n')) {
        const line = rawLine.trim().replace(/,\s*$/, '');
        if (!line || /^(--|CONSTRAINT\b|PRIMARY\s+KEY\b|FOREIGN\s+KEY\b|UNIQUE\b|CHECK\b)/i.test(line)) continue;
        const colM = line.match(/^["`]?([A-Za-z0-9_]+)["`]?\s+([A-Za-z0-9_]+(?:\([^)]+\))?)([\s\S]*)$/);
        if (colM) {
            expectedCols.push({
                name: colM[1],
                type: colM[2],
                rest: colM[3],
                rawDef: line
            });
        }
    }

    const missingCols = expectedCols.filter(c => !existingColLower.has(c.name.toLowerCase()));
    if (missingCols.length === 0) return;

    let rowCount = 0;
    try {
        rowCount = db.prepare(`SELECT count(*) as cnt FROM "${tName}"`).get().cnt;
    } catch (_) { }

    const isPkMissing = missingCols.some(c => /PRIMARY\s+KEY/i.test(c.rest) || c.name === 'TransactionID' || c.name === 'GlobalSerialNo' || c.name === 'AccountID' || c.name === 'CustomerID');

    if (rowCount === 0 || isPkMissing) {
        const prevFk = db.pragma('foreign_keys', { simple: true });
        db.pragma('foreign_keys = OFF');
        try {
            if (rowCount === 0) {
                console.log(`⚡ [Auto-Repair] Table "${tName}" had 0 rows and missing columns. Re-creating clean table...`);
                db.exec(`DROP TABLE IF EXISTS "${tName}"`);
                db.exec(tMeta.createStmt);
            } else {
                console.log(`⚡ [Auto-Repair] Migrating table "${tName}" (${rowCount} rows) to canonical schema...`);
                const tempTbl = `${tName}__repair_${Date.now()}`;
                const tempCreate = tMeta.createStmt.replace(
                    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?[A-Za-z0-9_]+["`]?/i,
                    `CREATE TABLE "${tempTbl}"`
                );
                db.exec('BEGIN IMMEDIATE');
                try {
                    db.exec(`DROP TABLE IF EXISTS "${tempTbl}"`);
                    db.exec(tempCreate);

                    const tempCols = db.prepare(`PRAGMA table_info("${tempTbl}")`).all().map(r => r.name);
                    const commonCols = existingCols.filter(c => tempCols.some(tc => tc.toLowerCase() === c.toLowerCase()));

                    if (commonCols.length > 0) {
                        const colList = commonCols.map(c => `"${c}"`).join(', ');
                        db.exec(`INSERT INTO "${tempTbl}" (${colList}) SELECT ${colList} FROM "${tName}" ORDER BY rowid`);
                    }
                    db.exec(`DROP TABLE "${tName}"`);
                    db.exec(`ALTER TABLE "${tempTbl}" RENAME TO "${tName}"`);
                    db.exec('COMMIT');
                } catch (migErr) {
                    try { db.exec('ROLLBACK'); } catch (_) { }
                    throw migErr;
                }
            }
        } finally {
            db.pragma(`foreign_keys = ${prevFk ? 'ON' : 'OFF'}`);
        }
    } else {
        for (const mc of missingCols) {
            const hasTimestampDefault = /DEFAULT\s*\(?\s*(?:datetime|date|time|CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME)/i.test(mc.rest);
            let safeRest = mc.rest
                .replace(/\bPRIMARY\s+KEY\b/gi, '')
                .replace(/\bAUTOINCREMENT\b/gi, '')
                .replace(/\bUNIQUE\b/gi, '')
                .replace(/\bNOT\s+NULL\b/gi, '');
            if (hasTimestampDefault) {
                const defIdx = safeRest.search(/\bDEFAULT\b/i);
                if (defIdx !== -1) {
                    const tail = safeRest.slice(defIdx);
                    const parenOpen = tail.match(/^DEFAULT\s*\(/i);
                    if (parenOpen) {
                        let depth = 0;
                        let endPos = -1;
                        for (let pi = parenOpen[0].length - 1; pi < tail.length; pi++) {
                            if (tail[pi] === '(') depth++;
                            else if (tail[pi] === ')') {
                                depth--;
                                if (depth === 0) { endPos = pi + 1; break; }
                            }
                        }
                        if (endPos !== -1) {
                            safeRest = safeRest.slice(0, defIdx) + tail.slice(endPos);
                        }
                    } else {
                        safeRest = safeRest.replace(/\bDEFAULT\s+(?:CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME)\b/gi, '');
                    }
                }
            }
            safeRest = safeRest.trim();
            const colDef = safeRest ? `"${mc.name}" ${mc.type} ${safeRest}` : `"${mc.name}" ${mc.type}`;
            try {
                db.exec(`ALTER TABLE "${tName}" ADD COLUMN ${colDef}`);
                if (hasTimestampDefault) {
                    try {
                        db.exec(`UPDATE "${tName}" SET "${mc.name}" = datetime('now', 'localtime') WHERE "${mc.name}" IS NULL`);
                    } catch (_) { }
                }
                console.log(`⚡ [Auto-Repair] Added missing column: ${tName}.${mc.name}`);
            } catch (altErr) {
                console.warn(`⚠️ [Auto-Repair] Column add skipped (${tName}.${mc.name}): ${altErr.message}`);
            }
        }
    }
}

function applyIndexesAndTriggers(db, schemaSql) {
    const indexRegex = /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+["`]?([A-Za-z0-9_]+)["`]?\s+ON\s+[\s\S]*?;/gi;
    let im;
    while ((im = indexRegex.exec(schemaSql)) !== null) {
        try { db.exec(im[0]); } catch (_) { }
    }

    const triggerRegex = /CREATE\s+TRIGGER\s+IF\s+NOT\s+EXISTS\s+[\s\S]*?END;/gi;
    let trgM;
    while ((trgM = triggerRegex.exec(schemaSql)) !== null) {
        try { db.exec(trgM[0]); } catch (_) { }
    }
}

function autoRepairSchema(db, schemaSql) {
    try {
        const schemaTables = parseSchemaStatements(schemaSql);
        try { db.exec(schemaSql); } catch (_) { }
        for (const [tName, tMeta] of schemaTables.entries()) {
            repairSingleTable(db, tName, tMeta);
        }
        applyIndexesAndTriggers(db, schemaSql);
    } catch (err) {
        console.warn('⚠️ [Auto-Repair] Schema validation notice:', err.message);
    }
}

function yieldEventLoop() {
    return new Promise((resolve) => setImmediate(resolve));
}

async function autoRepairSchemaAsync(db, schemaSql, onProgress) {
    try {
        const schemaTables = parseSchemaStatements(schemaSql);
        try { db.exec(schemaSql); } catch (_) { }
        await yieldEventLoop();
        const entries = Array.from(schemaTables.entries());
        for (let i = 0; i < entries.length; i++) {
            const [tName, tMeta] = entries[i];
            repairSingleTable(db, tName, tMeta);
            if (typeof onProgress === 'function') {
                const pct = 42 + Math.round(((i + 1) / Math.max(1, entries.length)) * 28);
                onProgress('schema', pct, `Table verify (${i + 1}/${entries.length}): ${tName}`);
            }
            if ((i + 1) % 3 === 0) await yieldEventLoop();
        }
        applyIndexesAndTriggers(db, schemaSql);
        await yieldEventLoop();
    } catch (err) {
        console.warn('⚠️ [Auto-Repair] Schema validation notice:', err.message);
    }
}

function prepareSchemaInput(db) {
    db.pragma('busy_timeout = 7000');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');

    const schemaSql = fs.readFileSync(path.join(__dirname, 'sqlite_schema.sql'), 'utf8');
    const hasExistingTables = Boolean(db.prepare(`
        SELECT 1 FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        LIMIT 1
    `).get());
    const repairSchemaSql = hasExistingTables
        ? schemaSql.replace(/^\s*CREATE\s+UNIQUE\s+INDEX\b[^;]*;\s*$/gim, '')
        : schemaSql;
    return { hasExistingTables, repairSchemaSql };
}

function finalizeSeedData(db, hasExistingTables) {
    if (hasExistingTables) {
        const migrationApplied = db.prepare(`
            SELECT 1 FROM SchemaMigrations
            WHERE MigrationName = 'sqlite_integrity_constraints_v1'
        `).get();
        if (!migrationApplied) {
            const hasFk = db.prepare(`PRAGMA foreign_key_list('ServiceRecords')`).all().length > 0;
            if (hasFk) {
                try {
                    db.prepare(`INSERT OR IGNORE INTO SchemaMigrations (MigrationName) VALUES ('sqlite_integrity_constraints_v1')`).run();
                } catch (_) { }
            } else {
                console.warn('⚠️ [DB Init] Legacy schema detected without full SQLite integrity constraints.');
            }
        }
    } else {
        try {
            db.prepare(`INSERT OR IGNORE INTO SchemaMigrations (MigrationName) VALUES ('sqlite_integrity_constraints_v1')`).run();
        } catch (_) { }
    }

        // 2. Starter SuperAdmin user
        const userCount = db.prepare('SELECT COUNT(*) AS cnt FROM Users').get().cnt;
        if (userCount === 0) {
            const adminPassword = crypto.randomBytes(12).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 14);
            const passwordHash = bcrypt.hashSync(adminPassword, 10);
            const apiToken = crypto.randomBytes(24).toString('hex');

            db.prepare(`
                INSERT INTO Users (Username, PasswordHash, ShopName, OwnerName, Role, IsActive, ApiToken, CreatedAt, UpdatedAt)
                VALUES (@u, @p, @s, @o, 'SuperAdmin', 1, @t, datetime('now', 'localtime'), datetime('now', 'localtime'))
            `).run({
                u: 'admin',
                p: passwordHash,
                s: 'My CSC & BC Center',
                o: 'Admin',
                t: apiToken
            });

            try {
                const credPath = path.join(__dirname, '..', '.admin-login.txt');
                fs.writeFileSync(credPath, [
                    'CSC & BC Apna Hisaab — Admin Login (SQLite Edition)',
                    '====================================================',
                    'Username: admin',
                    `Password: ${adminPassword}`,
                    '',
                    'Is PC par localhost auto-login hai — password type karne ki zaroorat nahi.',
                    'Mobile / LAN se login karne ke liye upar wala password use karein.',
                    'Settings me apna password set karne ke baad ye file delete kar dein.',
                    ''
                ].join('\r\n'), 'utf8');
            } catch (credErr) { }
        }

        // 2b. Seed missing TxnModules idempotently (preserve any user-added modules)
        try {
            const existsMod = db.prepare('SELECT 1 FROM TxnModules WHERE ModuleCode = @code');
            const insMod = db.prepare(`
                INSERT OR IGNORE INTO TxnModules (ModuleCode, ModuleName, Prefix, TargetTable, PrimaryKeyColumn, IsCore, IsActive, DisplayOrder, DocPrefix, RecordTable, SortOrder, UserID)
                VALUES (@code, @name, @prefix, @tbl, @pk, 1, 1, @ord, @prefix, @tbl, @ord, 1)
            `);
            const starterMods = [
                { code: 'CSC', name: 'CSC e-Governance Services', prefix: 'CSC', tbl: 'CSCApplications', pk: 'AppID', ord: 1 },
                { code: 'BC', name: 'Banking Correspondent / Kiosk', prefix: 'BC', tbl: 'BCTransactions', pk: 'BCID', ord: 2 },
                { code: 'BillPay', name: 'Utility Bill Payments (BBPS)', prefix: 'BP', tbl: 'BillPayments', pk: 'PaymentID', ord: 3 },
                { code: 'Invoices', name: 'Billing / Tax Invoice', prefix: 'INV', tbl: 'Invoices', pk: 'InvoiceID', ord: 4 },
                { code: 'Khata', name: 'Khatabook Ledger', prefix: 'KH', tbl: 'KhataEntries', pk: 'KhataID', ord: 5 },
                { code: 'Cashbook', name: 'Len-Den Cashbook', prefix: 'TXN', tbl: 'Transactions', pk: 'TransactionID', ord: 6 },
                { code: 'Service', name: 'Dynamic Service Record', prefix: 'SRV', tbl: 'ServiceRecords', pk: 'RecordID', ord: 7 },
                { code: 'UCL', name: 'Aadhaar UCL Update', prefix: 'UCL', tbl: 'UCLUpdates', pk: 'UCLID', ord: 8 },
                { code: 'PAC', name: 'PAC Code', prefix: 'PAC', tbl: 'PACEntries', pk: 'PACID', ord: 9 }
            ];
            for (const m of starterMods) {
                if (!existsMod.get({ code: m.code })) {
                    insMod.run(m);
                }
            }
        } catch (_) { }

        // 3. Starter Accounts
        const accCount = db.prepare('SELECT COUNT(*) AS cnt FROM Accounts').get().cnt;
        if (accCount === 0) {
            const insAcc = db.prepare(`
                INSERT INTO Accounts (AccountName, AccountType, BankName, OpeningBalance, CurrentBalance, Currency, IsActive, Color, Icon, UserID)
                VALUES (@name, @type, @bank, 0, 0, 'INR', 1, @color, @icon, 1)
            `);
            insAcc.run({ name: 'PHYSICAL CASH', type: 'Cash', bank: null, color: '#10b981', icon: 'banknote' });
            insAcc.run({ name: 'APNA BANK / PORTAL', type: 'Bank', bank: 'Main Bank', color: '#3b82f6', icon: 'landmark' });
        }

        // 4. Starter Categories
        const catCount = db.prepare('SELECT COUNT(*) AS cnt FROM Categories').get().cnt;
        if (catCount === 0) {
            const insCat = db.prepare(`
                INSERT INTO Categories (CategoryName, CategoryType, Icon, Color, IsActive, UserID)
                VALUES (@name, @type, @icon, @color, 1, 1)
            `);
            const cats = [
                { name: 'CSC Service Fee', type: 'Income', icon: 'monitor', color: '#10b981' },
                { name: 'BC / AEPS Commission', type: 'Income', icon: 'landmark', color: '#059669' },
                { name: 'Bill Payment Charge', type: 'Income', icon: 'zap', color: '#0ea5e9' },
                { name: 'Photocopy / Print / Lamination', type: 'Income', icon: 'printer', color: '#8b5cf6' },
                { name: 'Online Form / Banking Charge', type: 'Income', icon: 'file-text', color: '#6366f1' },
                { name: 'Other Income', type: 'Income', icon: 'plus-circle', color: '#22c55e' },
                { name: 'Shop Rent', type: 'Expense', icon: 'home', color: '#ef4444' },
                { name: 'Electricity Bill', type: 'Expense', icon: 'zap', color: '#f59e0b' },
                { name: 'Internet / Wi-Fi', type: 'Expense', icon: 'wifi', color: '#3b82f6' },
                { name: 'Stationery / Paper / Ink', type: 'Expense', icon: 'shopping-bag', color: '#ec4899' },
                { name: 'Staff Salary', type: 'Expense', icon: 'users', color: '#f97316' },
                { name: 'Other Expense', type: 'Expense', icon: 'minus-circle', color: '#64748b' }
            ];
            for (const c of cats) insCat.run(c);
        }

        // 5. Starter CSC Services
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS "CSCServices" (
                    "ServiceID" INTEGER PRIMARY KEY AUTOINCREMENT,
                    "ServiceName" TEXT NOT NULL,
                    "GovtFee" NUMERIC DEFAULT 0.00,
                    "OperatorFee" NUMERIC DEFAULT 50.00,
                    "DefaultDays" INTEGER DEFAULT 10,
                    "Icon" TEXT DEFAULT 'file-text',
                    "IsActive" INTEGER DEFAULT 1,
                    "SortOrder" INTEGER DEFAULT 0,
                    "CreatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
                    "UpdatedAt" TEXT DEFAULT (datetime('now', 'localtime')),
                    "UserID" INTEGER DEFAULT 1,
                    "Category" TEXT DEFAULT 'General',
                    "ModuleCode" TEXT DEFAULT 'CSC',
                    "CustomFieldsSchema" TEXT
                )
            `);
            const cscCols = db.prepare('PRAGMA table_info("CSCServices")').all().map(c => c.name.toLowerCase());
            const requiredCscCols = [
                { name: 'GovtFee', def: 'NUMERIC DEFAULT 0.00' },
                { name: 'OperatorFee', def: 'NUMERIC DEFAULT 50.00' },
                { name: 'DefaultDays', def: 'INTEGER DEFAULT 10' },
                { name: 'Icon', def: "TEXT DEFAULT 'file-text'" },
                { name: 'IsActive', def: 'INTEGER DEFAULT 1' },
                { name: 'SortOrder', def: 'INTEGER DEFAULT 0' },
                { name: 'UserID', def: 'INTEGER DEFAULT 1' },
                { name: 'CreatedAt', def: 'TEXT', backfillNow: true },
                { name: 'UpdatedAt', def: 'TEXT', backfillNow: true },
                { name: 'Category', def: "TEXT DEFAULT 'General'" },
                { name: 'ModuleCode', def: "TEXT DEFAULT 'CSC'" }
            ];
            for (const col of requiredCscCols) {
                if (!cscCols.includes(col.name.toLowerCase())) {
                    try {
                        db.exec(`ALTER TABLE "CSCServices" ADD COLUMN "${col.name}" ${col.def}`);
                        if (col.backfillNow) {
                            db.exec(`UPDATE "CSCServices" SET "${col.name}" = datetime('now', 'localtime') WHERE "${col.name}" IS NULL`);
                        }
                    } catch (_) { }
                }
            }

            const cscCount = db.prepare('SELECT COUNT(*) AS cnt FROM CSCServices').get().cnt;
            if (cscCount === 0) {
                const insCsc = db.prepare(`
                    INSERT INTO CSCServices (ServiceName, GovtFee, OperatorFee, DefaultDays, Icon, IsActive, SortOrder, UserID)
                    VALUES (@name, @gFee, @oFee, @days, @icon, 1, @sort, 1)
                `);
                const svcs = [
                    { name: 'PAN Card (NSDL / UTI)', gFee: 107, oFee: 50, days: 12, icon: 'credit-card', sort: 1 },
                    { name: 'Aay Praman Patra (Income Certificate)', gFee: 15, oFee: 35, days: 7, icon: 'file-text', sort: 2 },
                    { name: 'Niwas Praman Patra (Domicile / Residence)', gFee: 15, oFee: 35, days: 7, icon: 'home', sort: 3 },
                    { name: 'Jati Praman Patra (Caste Certificate)', gFee: 15, oFee: 35, days: 7, icon: 'landmark', sort: 4 },
                    { name: 'Ration Card (नया / संशोधन / यूनिट)', gFee: 0, oFee: 50, days: 15, icon: 'wheat', sort: 5 },
                    { name: 'Voter ID (Pehchan Patra / Form 6, 8)', gFee: 0, oFee: 50, days: 15, icon: 'vote', sort: 6 },
                    { name: 'Ayushman Card (PMJAY Golden Card)', gFee: 0, oFee: 50, days: 2, icon: 'heart-pulse', sort: 7 },
                    { name: 'PM Kisan (Registration / eKYC / Land)', gFee: 0, oFee: 50, days: 1, icon: 'sprout', sort: 8 },
                    { name: 'E-Shram / Labour (Shramik Card)', gFee: 0, oFee: 30, days: 3, icon: 'hard-hat', sort: 9 },
                    { name: 'Janma / Mrityu Praman Patra (Birth / Death)', gFee: 10, oFee: 50, days: 15, icon: 'baby', sort: 10 },
                    { name: 'Driving License (Learner / Permanent)', gFee: 350, oFee: 100, days: 25, icon: 'car', sort: 11 },
                    { name: 'Passport Seva', gFee: 1500, oFee: 200, days: 15, icon: 'globe', sort: 12 },
                    { name: 'Bijli Bill / Electricity Service', gFee: 0, oFee: 20, days: 1, icon: 'zap', sort: 13 },
                    { name: 'Aadhaar Seva (Update / Correction / eKYC)', gFee: 50, oFee: 50, days: 1, icon: 'id-card', sort: 14 },
                    { name: 'Anya Government / CSC Seva', gFee: 0, oFee: 50, days: 10, icon: 'package', sort: 15 }
                ];
                for (const s of svcs) insCsc.run(s);
            }
        } catch (e) {
            console.warn('⚠️ CSC Services setup notice:', e.message);
        }

        // 6. Starter SystemSettings
        try {
            const settingsCount = db.prepare('SELECT COUNT(*) AS cnt FROM SystemSettings').get().cnt;
            if (settingsCount === 0) {
                const insSet = db.prepare(`
                    INSERT INTO SystemSettings (SettingKey, SettingValue, SettingGroup, Description, UpdatedAt, UserID)
                    VALUES (@k, @v, @g, @d, datetime('now', 'localtime'), 1)
                `);
                const defaultSettings = [
                    { k: 'ShopName', v: 'AAPKI DUKAAN / HISAB BC', g: 'General', d: 'Dukaan ka naam' },
                    { k: 'OwnerName', v: 'Shop Owner', g: 'General', d: 'Owner ka naam' },
                    { k: 'MobileNumber', v: '', g: 'General', d: 'Contact number' },
                    { k: 'Address', v: 'Main Market, Cash Management Counter', g: 'General', d: 'Dukaan ka pata' },
                    { k: 'Theme', v: 'light', g: 'Appearance', d: 'UI Theme' }
                ];
                for (const s of defaultSettings) insSet.run(s);
            }
        } catch (_) { }

    return true;
}

function setupSQLite(existingDb) {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'cash_management.db');
    const shouldClose = !existingDb;
    const db = existingDb || new Database(dbPath, { timeout: 7000 });

    try {
        const { hasExistingTables, repairSchemaSql } = prepareSchemaInput(db);
        autoRepairSchema(db, repairSchemaSql);
        return finalizeSeedData(db, hasExistingTables);
    } finally {
        if (shouldClose && db) {
            db.close();
        }
    }
}

async function setupSQLiteAsync(existingDb, onProgress) {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'cash_management.db');
    const shouldClose = !existingDb;
    const db = existingDb || new Database(dbPath, { timeout: 7000 });

    try {
        const { hasExistingTables, repairSchemaSql } = prepareSchemaInput(db);
        await autoRepairSchemaAsync(db, repairSchemaSql, onProgress);
        if (typeof onProgress === 'function') {
            onProgress('seeding', 74, 'Starter configuration & indexes verify ho rahe hain...');
        }
        await yieldEventLoop();
        return finalizeSeedData(db, hasExistingTables);
    } finally {
        if (shouldClose && db) {
            db.close();
        }
    }
}

if (require.main === module) {
    setupSQLite();
    console.log('🎉 SQLite database successfully prepared & verified!');
}

module.exports = { setupSQLite, setupSQLiteAsync, autoRepairSchema };
