const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { query } = require('../database/db');
const { clampInt } = require('../utils/helpers');

// Security Guard: Database Explorer is restricted to SuperAdmin only
router.use((req, res, next) => {
    if (!req.user || req.user.Role !== 'SuperAdmin') {
        return res.status(403).json({ success: false, error: 'Database tools are restricted to SuperAdmin.' });
    }
    next();
});

// Friendly Hindi labels for tables
const TABLE_LABELS = {
    'Accounts': 'Bank aur Cash Khate (Accounts)',
    'AuditLogs': 'System Audit Logs (Suraksha Log)',
    'BCCounterSessions': 'BC Counter Sessions (Kiosk Opening/Closing)',
    'BCTransactions': 'BC Counter Len-Den (Withdrawal, Deposit, DMT)',
    'Bills': 'Bill aur Reminders (Bijli, Dukan, Recharge)',
    'Budgets': 'Mahina Budget Limits (Kharche ki Seema)',
    'Categories': 'Category Master (Kharcha aur Kamai Types)',
    'Customers': 'Customers (Grahak Master & Details)',
    'InvoiceItems': 'Invoice Items (Bill Items Detail)',
    'Invoices': 'Invoices / Billing (Grahak Bill)',
    'KhataEntries': 'Khatabook Ledger (Udhaar & Jama Khata)',
    'Parties': 'Parties & Suppliers (Vyapari & Len-Den)',
    'RecurringTransactions': 'Auto Recurring Transactions',
    'SchemaMigrations': 'Database Version Migrations',
    'SystemSettings': 'App Settings (Company Info, Profile)',
    'Transactions': 'Main Cash Transactions (Kharcha, Kamai, Transfer)'
};

// Root redirect to overview
router.get('/', (req, res) => res.redirect('/api/database/overview'));

// 1. GET Overview: DB Status, Tables List & Row Counts
router.get('/overview', async (req, res) => {
    try {
        const result = await query(`
            SELECT name AS TableName 
            FROM sqlite_master 
            WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_backup_%' 
            ORDER BY name;
        `);

        const rawTables = result.recordset || [];
        const tables = [];
        let totalRows = 0;

        for (const r of rawTables) {
            const tableName = r.TableName;
            let rowCount = 0;
            try {
                const countRes = await query(`SELECT COUNT(*) AS cnt FROM [${tableName}];`);
                rowCount = parseInt(countRes.recordset?.[0]?.cnt, 10) || 0;
            } catch (_) {}
            totalRows += rowCount;
            tables.push({
                name: tableName,
                label: TABLE_LABELS[tableName] || tableName,
                rowCount
            });
        }

        res.json({
            success: true,
            server: 'SQLite 3 (Local Embedded)',
            database: 'cash_management.db',
            engine: 'SQLite 3 (Zero-Install Edition)',
            status: 'ONLINE',
            totalTables: tables.length,
            totalRows,
            tables
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. GET Table Data (Rows & Columns) with Pagination & Search
router.get('/table/:tableName', async (req, res) => {
    try {
        const tableName = req.params.tableName;

        // Security: Whitelist check against sqlite_master
        const checkTable = await query(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name = @tName
        `, { tName: tableName });

        if (!checkTable.recordset || checkTable.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Table nahi mila ya invalid table name!' });
        }

        // Fetch columns via PRAGMA table_info
        const colsResult = await query(`PRAGMA table_info([${tableName}])`);
        const columns = (colsResult.recordset || []).map(c => ({
            name: c.name,
            type: c.type || 'TEXT',
            nullable: c.notnull === 0,
            maxLength: null,
            isPk: c.pk === 1
        }));

        // Identify primary key column or default to first column / rowid
        const pkCol = columns.find(c => c.isPk)?.name || columns[0]?.name || 'rowid';
        const orderCol = pkCol;

        // Pagination & Search
        const page = clampInt(req.query.page, 1, 100000, 1);
        const limit = clampInt(req.query.limit, 1, 200, 50);
        const offset = (page - 1) * limit;
        const search = (req.query.search || '').trim();

        // Get total count
        const countRes = await query(`SELECT COUNT(*) AS TotalCount FROM [${tableName}]`);
        const totalRecords = countRes.recordset?.[0]?.TotalCount || 0;

        // Select Rows
        if (search) {
            // Find text columns to search or cast to TEXT
            const textCols = columns.filter(c => ['varchar', 'nvarchar', 'text', 'ntext', 'char', 'nchar'].some(t => (c.type || '').toLowerCase().includes(t)));
            let whereClause = '';
            if (textCols.length > 0) {
                whereClause = 'WHERE ' + textCols.map(c => `[${c.name}] LIKE @searchVal`).join(' OR ');
            } else {
                whereClause = `WHERE CAST([${orderCol}] AS TEXT) LIKE @searchVal`;
            }

            const filteredCountRes = await query(`SELECT COUNT(*) AS FilteredCount FROM [${tableName}] ${whereClause}`, { searchVal: `%${search}%` });
            const filteredRecords = filteredCountRes.recordset?.[0]?.FilteredCount || 0;

            const dataQuery = `
                SELECT * FROM [${tableName}]
                ${whereClause}
                ORDER BY [${orderCol}] DESC
                LIMIT ${limit} OFFSET ${offset}
            `;
            const dataResult = await query(dataQuery, { searchVal: `%${search}%` });

            return res.json({
                success: true,
                tableName,
                label: TABLE_LABELS[tableName] || tableName,
                columns,
                totalRecords,
                filteredRecords,
                page,
                limit,
                data: dataResult.recordset || []
            });
        } else {
            const dataQuery = `
                SELECT * FROM [${tableName}]
                ORDER BY [${orderCol}] DESC
                LIMIT ${limit} OFFSET ${offset}
            `;
            const dataResult = await query(dataQuery);

            return res.json({
                success: true,
                tableName,
                label: TABLE_LABELS[tableName] || tableName,
                columns,
                totalRecords,
                page,
                limit,
                data: dataResult.recordset || []
            });
        }
    } catch (err) {
        console.error('Database Table View Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. GET Table Detailed Schema (Structure, Primary Key, Foreign Keys, Indexes)
router.get('/table/:tableName/schema', async (req, res) => {
    try {
        const tableName = req.params.tableName;

        // Check table exists in sqlite_master
        const checkTable = await query(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name = @tName
        `, { tName: tableName });

        if (!checkTable.recordset || checkTable.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Table nahi mila ya invalid table name!' });
        }

        // Fetch columns via PRAGMA table_info
        const colsResult = await query(`PRAGMA table_info([${tableName}])`);
        const columns = (colsResult.recordset || []).map(c => ({
            COLUMN_NAME: c.name,
            DATA_TYPE: c.type || 'TEXT',
            CHARACTER_MAXIMUM_LENGTH: null,
            NUMERIC_PRECISION: null,
            NUMERIC_SCALE: null,
            IS_NULLABLE: c.notnull === 0 ? 'YES' : 'NO',
            COLUMN_DEFAULT: c.dflt_value,
            IsPrimaryKey: c.pk === 1 ? 1 : 0
        }));

        // Fetch foreign keys via PRAGMA foreign_key_list
        const fksResult = await query(`PRAGMA foreign_key_list([${tableName}])`);
        const foreignKeys = (fksResult.recordset || []).map(f => ({
            ConstraintName: 'FK_' + tableName + '_' + f.id,
            ColumnName: f.from,
            ReferencedTable: f.table,
            ReferencedColumn: f.to
        }));

        // Fetch indexes via PRAGMA index_list & PRAGMA index_info
        const idxListResult = await query(`PRAGMA index_list([${tableName}])`);
        const indexes = [];
        for (const idx of (idxListResult.recordset || [])) {
            const infoResult = await query(`PRAGMA index_info([${idx.name}])`);
            const colNames = (infoResult.recordset || []).map(ci => ci.name).join(', ');
            indexes.push({
                IndexName: idx.name,
                IndexType: 'INDEX',
                IsUnique: idx.unique === 1 ? 1 : 0,
                IsPrimaryKey: idx.origin === 'pk' ? 1 : 0,
                Columns: colNames
            });
        }

        res.json({
            success: true,
            tableName,
            label: TABLE_LABELS[tableName] || tableName,
            columns,
            foreignKeys,
            indexes
        });
    } catch (err) {
        console.error('Database Schema View Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. POST Safe SQL Query Runner for Browser Database Inspector
const BLOCKED_SQL_KEYWORDS = [
    'insert', 'update', 'delete', 'merge', 'drop', 'create', 'alter', 'truncate',
    'exec', 'execute', 'grant', 'revoke', 'deny', 'backup', 'restore', 'dbcc',
    'shutdown', 'revert', 'kill', 'bulk', 'openrowset', 'opendatasource',
    'openquery', 'xp_cmdshell', 'sp_', 'into', 'set', 'use', 'begin', 'commit',
    'rollback', 'declare', 'print', 'raiserror', 'throw', 'waitfor', 'save',
    'transaction', 'cursor', 'while', 'if', 'else'
];

function isReadOnlySelect(sqlText) {
    const trimmed = sqlText.trim().replace(/;+\s*$/, '');
    if (trimmed.includes(';')) return { ok: false, reason: 'Ek hi SELECT query allowed hai' };

    const withoutComments = trimmed
        .replace(/--[^\n]*/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/'(?:''|[^'])*'/g, "''");
    const lower = withoutComments.toLowerCase();

    if (!/^\s*(select|with)\s/.test(lower)) {
        return { ok: false, reason: 'Sirf SELECT query chal sakti hai' };
    }
    for (const kw of BLOCKED_SQL_KEYWORDS) {
        const re = kw.endsWith('_')
            ? new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
            : new RegExp('\\b' + kw + '\\b', 'i');
        if (re.test(withoutComments)) {
            return { ok: false, reason: `Dangerous keyword '${kw}' allowed nahi hai` };
        }
    }
    return { ok: true };
}

router.post('/execute-query', async (req, res) => {
    try {
        const { sqlQuery } = req.body || {};
        if (!sqlQuery || !String(sqlQuery).trim()) {
            return res.status(400).json({ success: false, error: 'SQL Query likhna zaroori hai' });
        }
        const trimmed = String(sqlQuery).trim();

        const guard = isReadOnlySelect(trimmed);
        if (!guard.ok) {
            return res.status(403).json({ success: false, error: guard.reason });
        }

        const start = performance.now();
        const result = await query(trimmed);
        const duration = (performance.now() - start).toFixed(2);

        res.json({
            success: true,
            executionTimeMs: duration,
            recordset: result.recordset || [],
            rowsAffected: result.rowsAffected,
            columns: result.recordset && result.recordset.length > 0 ? Object.keys(result.recordset[0]) : []
        });
    } catch (err) {
        console.error('SQL query error:', err.message);
        res.status(400).json({ success: false, error: 'Query chal nahi payi (syntax ya invalid table/column)' });
    }
});

// 5. GET Database Overall Statistics & Storage Metrics
router.get('/stats', async (req, res) => {
    try {
        const dbPath = path.join(__dirname, '..', 'database', 'data', 'cash_management.db');
        let totalSizeMB = 0;
        if (fs.existsSync(dbPath)) {
            const stats = fs.statSync(dbPath);
            totalSizeMB = +(stats.size / (1024 * 1024)).toFixed(2);
        }

        const versionRes = await query(`SELECT sqlite_version() AS version;`);
        const version = versionRes.recordset?.[0]?.version || '3';

        res.json({
            success: true,
            database: 'cash_management.db',
            server: 'SQLite 3 Local File',
            totalSizeMB,
            files: [
                {
                    name: 'cash_management.db',
                    SizeMB: totalSizeMB,
                    type_desc: 'SQLITE_MAIN_DB'
                }
            ],
            collation: 'BINARY / NOCASE',
            version: 'SQLite ' + version + ' (WAL Mode)'
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
