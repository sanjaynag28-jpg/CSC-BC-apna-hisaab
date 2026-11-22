/**
 * Cash Management - Embedded SQLite Database Engine & Compatibility Layer
 * 100% Zero-Install SQLite Edition
 * Provides drop-in compatibility with existing routes (query, withTransaction, sp_*, etc.)
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'cash_management.db');
let db = null;

function getDb() {
    if (!db) {
        db = new Database(dbPath, { timeout: 7000 });
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('foreign_keys = ON');
        db.pragma('busy_timeout = 7000');

        // Custom User-Defined Functions for T-SQL compatibility
        db.function('GETDATE', () => new Date().toISOString().replace('T', ' ').slice(0, 19));

        db.function('YEAR', (d) => {
            if (!d) return null;
            return new Date(d).getFullYear();
        });

        db.function('MONTH', (d) => {
            if (!d) return null;
            return new Date(d).getMonth() + 1;
        });

        db.function('DAY', (d) => {
            if (!d) return null;
            return new Date(d).getDate();
        });

        db.function('DATEDIFF', (unit, d1, d2) => {
            if (!d1 || !d2) return 0;
            const t1 = new Date(d1).getTime();
            const t2 = new Date(d2).getTime();
            return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
        });

        db.function('DATEADD', (unit, n, d) => {
            if (!d) return null;
            const dt = new Date(d);
            dt.setDate(dt.getDate() + Number(n));
            return dt.toISOString().slice(0, 10);
        });

        db.function('CONVERT', (type, val, style) => {
            if (val === null || val === undefined) return null;
            const sType = String(type).toLowerCase();
            if (sType === 'date') return String(val).slice(0, 10);
            return String(val);
        });

        db.function('FORMAT', (val, fmt) => {
            if (val === null || val === undefined) return '';
            return String(val);
        });
    }
    return db;
}

// Ensure database is initialized
getDb();

// Mock mssql types
const sql = {
    Int: 'Int',
    BigInt: 'BigInt',
    NVarChar: 'NVarChar',
    VarChar: 'VarChar',
    Text: 'Text',
    Decimal: 'Decimal',
    Numeric: 'Numeric',
    Bit: 'Bit',
    Date: 'Date',
    DateTime: 'DateTime',
    UniqueIdentifier: 'UniqueIdentifier'
};

function normalizeParams(params) {
    if (!params || typeof params !== 'object') return {};
    const norm = {};
    for (const [k, v] of Object.entries(params)) {
        if (v && typeof v === 'object' && 'value' in v) {
            norm[k] = v.value;
        } else {
            norm[k] = v;
        }
    }
    return norm;
}

function translateSql(queryStr) {
    let s = String(queryStr || '').trim();

    // 1. Remove dbo prefix
    s = s.replace(/\[dbo\]\.|\bdbo\./gi, '');

    // 2. Remove SQL Server Locking hints: WITH (NOLOCK), WITH (UPDLOCK, HOLDLOCK)
    s = s.replace(/WITH\s*\([^)]+\)/gi, '');

    // 3. ISNULL(a, b) -> IFNULL(a, b)
    s = s.replace(/\bISNULL\(/gi, 'IFNULL(');

    // 4. OUTPUT INSERTED.col -> RETURNING col
    s = s.replace(/OUTPUT\s+INSERTED\.(\w+|\*)/gi, 'RETURNING $1');

    // 5. SELECT TOP n ... -> SELECT ... LIMIT n (Single query)
    const topMatch = s.match(/^(\s*SELECT(?:\s+DISTINCT)?)\s+TOP\s+(\d+|\(\d+\))\s+([\s\S]+)$/i);
    if (topMatch && !s.includes('UNION') && !s.includes('EXCEPT')) {
        const sel = topMatch[1];
        const num = topMatch[2].replace(/[()]/g, '');
        const rest = topMatch[3];
        // If query does not already have a LIMIT
        if (!/\bLIMIT\s+\d+/i.test(rest)) {
            s = `${sel} ${rest} LIMIT ${num}`;
        }
    }

    return s;
}

// Stored Procedure Interceptor
async function handleStoredProcedure(execSql, rawParams) {
    const d = getDb();
    const params = normalizeParams(rawParams);

    // 1. sp_UpdateAccountBalance
    if (/sp_UpdateAccountBalance/i.test(execSql)) {
        const accId = params.AccountID || params.id || params.accId;
        if (!accId) return { recordset: [], rowsAffected: [0] };

        const acc = d.prepare('SELECT OpeningBalance FROM Accounts WHERE AccountID = @id').get({ id: accId });
        if (!acc) return { recordset: [], rowsAffected: [0] };
        const opening = Number(acc.OpeningBalance || 0);

        // Ledger
        const ledgerRow = d.prepare(`
            SELECT 
                IFNULL((SELECT SUM(Amount) FROM Transactions WHERE AccountID = @id AND TransType IN ('Income', 'Loan Received', 'Loan Recovery') AND IsDeleted = 0), 0) +
                IFNULL((SELECT SUM(Amount) FROM Transactions WHERE ToAccountID = @id AND TransType = 'Transfer' AND IsDeleted = 0), 0) -
                IFNULL((SELECT SUM(Amount) FROM Transactions WHERE AccountID = @id AND TransType IN ('Expense', 'Loan Given', 'Loan Repay') AND IsDeleted = 0), 0) -
                IFNULL((SELECT SUM(Amount) FROM Transactions WHERE AccountID = @id AND TransType = 'Transfer' AND IsDeleted = 0), 0) AS NetLedger
        `).get({ id: accId });
        const ledger = Number(ledgerRow?.NetLedger || 0);

        // BC Cash
        const bcCashRow = d.prepare(`
            SELECT 
                IFNULL((SELECT SUM(CASE
                    WHEN ServiceType IN ('Cash Deposit', 'Money Transfer') THEN Amount
                    WHEN ServiceType = 'Cash Withdrawal' THEN -Amount
                    WHEN ServiceType = 'QR Pay' AND QROperation = 'Cash Given to Customer' THEN -Amount
                    WHEN ServiceType = 'QR Pay' AND QROperation = 'Send - Cash Taken from Customer' THEN Amount
                    ELSE 0 END) FROM BCTransactions WHERE CashAccountID = @id AND Status = 'Success'), 0) +
                IFNULL((SELECT SUM(IFNULL(b.CustomerCharge, 0)) FROM BCTransactions b WHERE b.CashAccountID = @id AND b.Status = 'Success' AND NOT EXISTS (SELECT 1 FROM KhataEntries k WHERE k.BCID = b.BCID AND k.EntryType = 'Gave')), 0) AS NetBCCash
        `).get({ id: accId });
        const bcCash = Number(bcCashRow?.NetBCCash || 0);

        // BC Portal
        const bcPortalRow = d.prepare(`
            SELECT 
                IFNULL((SELECT SUM(CASE
                    WHEN ServiceType = 'Cash Withdrawal' THEN Amount
                    WHEN ServiceType = 'QR Pay' AND QROperation IN ('Cash Given to Customer', 'Deposit/Payment') THEN Amount
                    WHEN ServiceType = 'QR Pay' AND QROperation IN ('Send - Cash Taken from Customer', 'Send - Direct Transfer') THEN -Amount
                    WHEN ServiceType IN ('Cash Deposit', 'Money Transfer') THEN -Amount
                    ELSE 0 END) + SUM(IFNULL(CommissionEarned, 0)) FROM BCTransactions WHERE PortalAccountID = @id AND Status = 'Success'), 0) AS NetBCPortal
        `).get({ id: accId });
        const bcPortal = Number(bcPortalRow?.NetBCPortal || 0);

        const currentBal = opening + ledger + bcCash + bcPortal;
        d.prepare("UPDATE Accounts SET CurrentBalance = @bal, UpdatedAt = datetime('now', 'localtime') WHERE AccountID = @id").run({ bal: currentBal, id: accId });
        return { recordset: [{ CurrentBalance: currentBal }], rowsAffected: [1] };
    }

    // 2. sp_UpdateCustomerBalance
    if (/sp_UpdateCustomerBalance/i.test(execSql)) {
        const custId = params.CustomerID || params.id || params.custId;
        if (!custId) return { recordset: [], rowsAffected: [0] };

        const balRow = d.prepare(`
            SELECT 
                IFNULL((SELECT SUM(Amount) FROM KhataEntries WHERE CustomerID = @id AND EntryType = 'Gave'), 0) -
                IFNULL((SELECT SUM(Amount) FROM KhataEntries WHERE CustomerID = @id AND EntryType = 'Got'), 0) AS NetBalance,
                IFNULL((SELECT COUNT(*) FROM KhataEntries WHERE CustomerID = @id), 0) AS TxnCount,
                IFNULL((SELECT SUM(Amount) FROM KhataEntries WHERE CustomerID = @id), 0) AS TotalVol
        `).get({ id: custId });

        const bal = Number(balRow?.NetBalance || 0);
        d.prepare(`
            UPDATE Customers 
            SET CurrentBalance = @bal, TotalTransactions = @cnt, TotalVolume = @vol, UpdatedAt = datetime('now', 'localtime')
            WHERE CustomerID = @id
        `).run({ bal, cnt: balRow?.TxnCount || 0, vol: balRow?.TotalVol || 0, id: custId });
        return { recordset: [{ CurrentBalance: bal }], rowsAffected: [1] };
    }

    // 3. sp_UpdatePartyBalance
    if (/sp_UpdatePartyBalance/i.test(execSql)) {
        const pId = params.PartyID || params.id || params.partyId;
        if (!pId) return { recordset: [], rowsAffected: [0] };

        const balRow = d.prepare(`
            SELECT 
                IFNULL((SELECT SUM(Amount) FROM Transactions WHERE PartyID = @id AND TransType = 'Loan Given' AND IsDeleted = 0), 0) -
                IFNULL((SELECT SUM(Amount) FROM Transactions WHERE PartyID = @id AND TransType = 'Loan Recovery' AND IsDeleted = 0), 0) -
                IFNULL((SELECT SUM(Amount) FROM Transactions WHERE PartyID = @id AND TransType = 'Loan Received' AND IsDeleted = 0), 0) +
                IFNULL((SELECT SUM(Amount) FROM Transactions WHERE PartyID = @id AND TransType = 'Loan Repay' AND IsDeleted = 0), 0) AS NetBalance
        `).get({ id: pId });

        const bal = Number(balRow?.NetBalance || 0);
        d.prepare("UPDATE Parties SET CurrentBalance = @bal, UpdatedAt = datetime('now', 'localtime') WHERE PartyID = @id").run({ bal, id: pId });
        return { recordset: [{ CurrentBalance: bal }], rowsAffected: [1] };
    }

    // 4. sp_RecalculateAllBalances
    if (/sp_RecalculateAllBalances/i.test(execSql)) {
        const accs = d.prepare('SELECT AccountID FROM Accounts').all();
        for (const a of accs) await handleStoredProcedure('EXEC sp_UpdateAccountBalance @id', { id: a.AccountID });
        const custs = d.prepare('SELECT CustomerID FROM Customers').all();
        for (const c of custs) await handleStoredProcedure('EXEC sp_UpdateCustomerBalance @id', { id: c.CustomerID });
        const parties = d.prepare('SELECT PartyID FROM Parties').all();
        for (const p of parties) await handleStoredProcedure('EXEC sp_UpdatePartyBalance @id', { id: p.PartyID });
        return { recordset: [{ Status: 'SUCCESS' }], rowsAffected: [1] };
    }

    // 5. sp_BackupCashManagementDB
    if (/sp_BackupCashManagementDB/i.test(execSql)) {
        const destFolder = params.BackupFolder || params.folder || path.join(__dirname, '..', 'backups');
        if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const destFile = path.join(destFolder, `CashManagement_SQLite_${ts}.db`);
        fs.copyFileSync(dbPath, destFile);
        return { recordset: [{ BackupPath: destFile }], rowsAffected: [1] };
    }

    return { recordset: [], rowsAffected: [0] };
}

async function query(queryStr, rawParams = {}) {
    const s = String(queryStr || '').trim();
    if (/^\s*EXEC\s+sp_/i.test(s)) {
        return await handleStoredProcedure(s, rawParams);
    }

    const d = getDb();
    const cleanSql = translateSql(s);
    const params = normalizeParams(rawParams);

    // Auto-fill missing named parameters with null so better-sqlite3 doesn't complain
    const paramMatches = cleanSql.match(/@([a-zA-Z0-9_]+)/g);
    if (paramMatches) {
        for (const m of paramMatches) {
            const k = m.slice(1);
            if (!(k in params)) params[k] = null;
        }
    }

    try {
        const isSelect = /^\s*(SELECT|PRAGMA|WITH)\b/i.test(cleanSql) || /\bRETURNING\b/i.test(cleanSql);
        const stmt = d.prepare(cleanSql);

        if (isSelect) {
            const rows = stmt.all(params);
            return {
                recordset: rows,
                recordsets: [rows],
                rowsAffected: [rows.length]
            };
        } else {
            const info = stmt.run(params);
            return {
                recordset: [],
                recordsets: [[]],
                rowsAffected: [info.changes],
                insertId: info.lastInsertRowid
            };
        }
    } catch (err) {
        console.error('❌ SQLite Query Error:', err.message);
        console.error('   SQL:', cleanSql);
        throw err;
    }
}

async function withTransaction(callback) {
    const d = getDb();
    d.exec('BEGIN TRANSACTION');
    try {
        const transQuery = async (queryStr, rawParams = {}) => {
            return await query(queryStr, rawParams);
        };
        const result = await callback(transQuery);
        d.exec('COMMIT');
        return result;
    } catch (err) {
        try { d.exec('ROLLBACK'); } catch (_) { }
        throw err;
    }
}

async function isDbAlive() {
    try {
        const res = await query('SELECT 1 AS alive');
        return Boolean(res && res.recordset && res.recordset.length > 0);
    } catch (err) {
        return false;
    }
}

async function closePool() {
    if (db) {
        try { db.close(); } catch (_) { }
        db = null;
    }
}

async function getPool() {
    return {
        connected: true,
        request: () => {
            let localParams = {};
            const req = {
                input: (k, typeOrVal, val) => {
                    localParams[k] = (val !== undefined) ? val : typeOrVal;
                    return req;
                },
                query: async (q) => query(q, localParams)
            };
            return req;
        },
        close: async () => closePool()
    };
}

async function getMasterPool() {
    return getPool();
}

module.exports = {
    getDb,
    getPool,
    getMasterPool,
    isDbAlive,
    query,
    withTransaction,
    closePool,
    sql
};
