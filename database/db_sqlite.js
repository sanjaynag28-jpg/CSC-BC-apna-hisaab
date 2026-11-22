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

        db.function('VARCHAR', (len) => 'VARCHAR');
        db.function('NVARCHAR', (len) => 'NVARCHAR');
        db.function('INT', () => 'INT');

        db.function('FORMAT', (val, fmt) => {
            if (val === null || val === undefined) return '';
            return String(val);
        });

        // Auto-heal / Ensure schema & columns are up to date on boot
        try {
            const hasUsers = db.prepare("SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name='Users'").get();
            if (!hasUsers || hasUsers.cnt === 0) {
                const { setupSQLite } = require('./setup_sqlite');
                setupSQLite(db);
            }
        } catch (e) {
            console.warn('⚠️ [DB Init] auto-setup notice:', e.message);
        }
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

function normalizeValue(v) {
    if (v === undefined || v === null) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v instanceof Date) {
        if (isNaN(v.getTime())) return null;
        return v.toISOString().replace('T', ' ').slice(0, 19);
    }
    if (typeof v === 'object') {
        if ('value' in v) {
            return normalizeValue(v.value);
        }
        if (Buffer.isBuffer(v)) return v;
        try {
            return JSON.stringify(v);
        } catch (_) {
            return String(v);
        }
    }
    if (typeof v === 'symbol' || typeof v === 'function') return null;
    return v;
}

function normalizeParams(params) {
    if (!params || typeof params !== 'object') return {};
    const norm = {};
    for (const [k, v] of Object.entries(params)) {
        norm[k] = normalizeValue(v);
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

    // 4. OUTPUT INSERTED.col -> RETURNING col at end of statement
    const outputRegex = /\bOUTPUT\s+((?:INSERTED\.\*)|(?:\*)|(?:INSERTED\.\w+(?:\s*,\s*INSERTED\.\w+)*))/i;
    const outMatch = s.match(outputRegex);
    if (outMatch) {
        const rawCols = outMatch[1];
        s = s.replace(outputRegex, '');
        const retCols = rawCols.replace(/INSERTED\./gi, '');
        s = s.trim();
        if (s.endsWith(';')) {
            s = s.slice(0, -1).trim() + ` RETURNING ${retCols};`;
        } else {
            s = s + ` RETURNING ${retCols}`;
        }
    }

    // 5. SCOPE_IDENTITY() & @@IDENTITY -> last_insert_rowid()
    s = s.replace(/\bSCOPE_IDENTITY\(\)/gi, 'last_insert_rowid()');
    s = s.replace(/\b@@IDENTITY\b/gi, 'last_insert_rowid()');

    // 6. DATEDIFF & DATEADD unquoted identifier fix: DATEDIFF(day, ...) -> DATEDIFF('day', ...)
    s = s.replace(/\bDATEDIFF\s*\(\s*([A-Za-z]+)\s*,/gi, "DATEDIFF('$1',");
    s = s.replace(/\bDATEADD\s*\(\s*([A-Za-z]+)\s*,/gi, "DATEADD('$1',");

    // 7. TRY_CAST(x AS type) -> CAST(x AS NUMERIC)
    s = s.replace(/\bTRY_CAST\s*\(\s*([\s\S]*?)\s+AS\s+([A-Za-z0-9_]+(?:\s*\([^)]*\))?)\s*\)/gi, (m, expr) => `CAST(${expr} AS NUMERIC)`);

    // 8. VALUES (1),(2)... as tbl(col) -> (SELECT 1 AS col UNION ALL SELECT 2 ...) AS tbl
    s = s.replace(/\(\s*VALUES\s*(\(\s*\d+\s*\)(?:\s*,\s*\(\s*\d+\s*\))*)\s*\)\s*(?:AS\s+)?(\w+)\s*\(\s*(\w+)\s*\)/gi, (m, vals, tbl, col) => {
        const numbers = vals.match(/\d+/g) || [];
        const unionSql = numbers.map(n => `SELECT ${n} AS ${col}`).join(' UNION ALL ');
        return `(${unionSql}) AS ${tbl}`;
    });

    // 8. JSON_VALUE(col, path) -> json_extract(col, path)
    s = s.replace(/\bJSON_VALUE\s*\(/gi, 'json_extract(');

    // 9. CHARINDEX(needle, haystack) -> INSTR(haystack, needle)
    s = s.replace(/\bCHARINDEX\s*\(\s*('[^']+'|[^,]+)\s*,\s*([^)]+)\s*\)/gi, 'INSTR($2, $1)');

    // 10. String functions: SUBSTRING -> SUBSTR, LEN -> LENGTH
    s = s.replace(/\bSUBSTRING\s*\(/gi, 'SUBSTR(');
    s = s.replace(/\bLEN\s*\(/gi, 'LENGTH(');

    // 11. SQL Server Date/Time translations
    s = s.replace(/CONVERT\s*\(\s*VARCHAR\s*\(\s*5\s*\)\s*,\s*GETDATE\s*\(\s*\)\s*,\s*108\s*\)/gi, "strftime('%H:%M', 'now', 'localtime')");
    s = s.replace(/CONVERT\s*\(\s*VARCHAR\s*\(\s*8\s*\)\s*,\s*GETDATE\s*\(\s*\)\s*,\s*108\s*\)/gi, "strftime('%H:%M:%S', 'now', 'localtime')");
    s = s.replace(/CONVERT\s*\(\s*VARCHAR\s*\(\s*10\s*\)\s*,\s*GETDATE\s*\(\s*\)\s*,\s*120\s*\)/gi, "date('now', 'localtime')");
    s = s.replace(/CONVERT\s*\(\s*DATE\s*,\s*GETDATE\s*\(\s*\)\s*\)/gi, "date('now', 'localtime')");
    s = s.replace(/CAST\s*\(\s*GETDATE\s*\(\s*\)\s*AS\s*DATE\s*\)/gi, "date('now', 'localtime')");
    s = s.replace(/CAST\s*\(\s*GETDATE\s*\(\s*\)\s*AS\s*TIME\s*\)/gi, "time('now', 'localtime')");
    s = s.replace(/CAST\s*\(\s*([^()]+)\s+AS\s+TIME\s*\)/gi, "time($1)");
    s = s.replace(/CAST\s*\(\s*([^()]+)\s+AS\s+DATE\s*\)/gi, "date($1)");
    s = s.replace(/GETDATE\s*\(\s*\)/gi, "datetime('now', 'localtime')");

    // 12. SELECT TOP n ... -> SELECT ... LIMIT n (Single query)
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

    // 13. OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY -> LIMIT limit OFFSET offset
    s = s.replace(/OFFSET\s+(@?\w+)\s+ROWS\s+FETCH\s+NEXT\s+(@?\w+)\s+ROWS\s+ONLY/gi, 'LIMIT $2 OFFSET $1');
    s = s.replace(/FETCH\s+NEXT\s+(@?\w+)\s+ROWS\s+ONLY/gi, 'LIMIT $1');

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
        // Strip SQL comments to check for multi-statement execution
        const stripped = cleanSql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
        const stmts = stripped.split(';').map(x => x.trim()).filter(x => x.length > 0);

        if (stmts.length > 1) {
            let lastResult = { recordset: [], recordsets: [[]], rowsAffected: [0] };
            for (let i = 0; i < stmts.length; i++) {
                const singleSql = stmts[i];
                const pMatches = singleSql.match(/@([a-zA-Z0-9_]+)/g);
                const stmtParams = {};
                if (pMatches) {
                    for (const m of pMatches) {
                        const k = m.slice(1);
                        stmtParams[k] = (k in params) ? params[k] : null;
                    }
                }
                const isSel = /^\s*(SELECT|PRAGMA|WITH)\b/i.test(singleSql) || /\bRETURNING\b/i.test(singleSql);
                const stmt = d.prepare(singleSql);
                if (isSel) {
                    const rows = stmt.all(stmtParams);
                    lastResult = {
                        recordset: rows,
                        recordsets: [rows],
                        rowsAffected: [rows.length]
                    };
                } else {
                    const info = stmt.run(stmtParams);
                    lastResult = {
                        recordset: [],
                        recordsets: [[]],
                        rowsAffected: [info.changes],
                        insertId: info.lastInsertRowid
                    };
                }
            }
            return lastResult;
        }

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
