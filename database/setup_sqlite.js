/**
 * Cash Management - Automated SQLite Database Setup & Starter Seeding
 * 100% Pure Embedded Zero-Install SQLite Edition
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'cash_management.db');
console.log(`🔄 Initializing SQLite database: ${dbPath}`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// 1. Run schema DDL
const schemaSql = fs.readFileSync(path.join(__dirname, 'sqlite_schema.sql'), 'utf8');
db.exec(schemaSql);
console.log('✅ SQLite Schema applied (28 tables & indexes ready).');

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
        console.log('✅ Admin account ready (localhost auto-login active).');
        console.log(`   Remote/LAN login credentials saved: ${credPath}`);
    } catch (credErr) {
        console.warn('⚠️ .admin-login.txt save notice:', credErr.message);
    }
} else {
    console.log('✅ Admin user already present.');
}

// 3. Starter Accounts
const accCount = db.prepare('SELECT COUNT(*) AS cnt FROM Accounts').get().cnt;
if (accCount === 0) {
    const insAcc = db.prepare(`
        INSERT INTO Accounts (AccountName, AccountType, BankName, OpeningBalance, CurrentBalance, Currency, IsActive, Color, Icon, UserID)
        VALUES (@name, @type, @bank, 0, 0, 'INR', 1, @color, @icon, 1)
    `);
    insAcc.run({ name: 'PHYSICAL CASH', type: 'Cash', bank: null, color: '#10b981', icon: 'banknote' });
    insAcc.run({ name: 'APNA BANK / PORTAL', type: 'Bank', bank: 'Main Bank', color: '#3b82f6', icon: 'landmark' });
    console.log('✅ Starter Cash & Bank accounts created.');
} else {
    console.log('✅ Accounts already present.');
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
    console.log('✅ Starter Income & Expense categories created.');
} else {
    console.log('✅ Categories already present.');
}

// 5. Starter CSC Services
const cscCount = db.prepare('SELECT COUNT(*) AS cnt FROM CSCServices').get().cnt;
if (cscCount === 0) {
    const insCsc = db.prepare(`
        INSERT INTO CSCServices (ServiceName, GovtFee, OperatorFee, DefaultDays, Icon, IsActive, SortOrder, UserID)
        VALUES (@name, @gFee, @oFee, @days, @icon, 1, @sort, 1)
    `);
    const svcs = [
        { name: 'Aay Praman Patra (Income Cert)', gFee: 15, oFee: 35, days: 7, icon: 'file-check', sort: 1 },
        { name: 'Jati Praman Patra (Caste Cert)', gFee: 15, oFee: 35, days: 7, icon: 'file-check', sort: 2 },
        { name: 'Niwas Praman Patra (Domicile)', gFee: 15, oFee: 35, days: 7, icon: 'home', sort: 3 },
        { name: 'PAN Card (New / Correction)', gFee: 107, oFee: 93, days: 15, icon: 'credit-card', sort: 4 },
        { name: 'Aadhaar Print / PVC Card', gFee: 50, oFee: 50, days: 1, icon: 'id-card', sort: 5 },
        { name: 'Ayushman Bharat Card', gFee: 0, oFee: 50, days: 2, icon: 'heart-pulse', sort: 6 },
        { name: 'PM Kisan e-KYC / Registration', gFee: 0, oFee: 50, days: 1, icon: 'sprout', sort: 7 },
        { name: 'Ration Card Apply / Unit Add', gFee: 0, oFee: 50, days: 15, icon: 'clipboard-list', sort: 8 },
        { name: 'Passport Online Apply', gFee: 1500, oFee: 200, days: 15, icon: 'globe', sort: 9 }
    ];
    for (const s of svcs) insCsc.run(s);
    console.log('✅ Starter CSC services created.');
} else {
    console.log('✅ CSC Services already present.');
}

db.close();
console.log('🎉 SQLite database successfully prepared & seeded!');
