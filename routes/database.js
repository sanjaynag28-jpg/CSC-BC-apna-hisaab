const express = require('express');
const router = express.Router();
const { query, sql } = require('../database/db');
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
            SELECT 
                t.NAME AS TableName,
                SUM(p.rows) AS RowCounts
            FROM sys.tables t
            INNER JOIN sys.partitions p ON t.OBJECT_ID = p.OBJECT_ID
            WHERE p.index_id IN (0,1)
            GROUP BY t.NAME
            ORDER BY t.NAME
        `);

        const tables = (result.recordset || []).map(r => ({
            name: r.TableName,
            label: TABLE_LABELS[r.TableName] || r.TableName,
            rowCount: parseInt(r.RowCounts, 10) || 0
        }));

        const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);

        res.json({
            success: true,
            server: process.env.DB_SERVER || 'SQL Server',
            database: process.env.DB_NAME || 'CashManagement',
            engine: 'Microsoft SQL Server (SQLEXPRESS)',
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

        // Security: Whitelist check against sys.tables
        const checkTable = await query(`
            SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME = @tName
        `, { tName: tableName });

        if (!checkTable.recordset || checkTable.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Table nahi mila ya invalid table name!' });
        }

        // Get Columns
        const colsResult = await query(`
            SELECT 
                COLUMN_NAME, 
                DATA_TYPE, 
                IS_NULLABLE,
                CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @tName
            ORDER BY ORDINAL_POSITION
        `, { tName: tableName });

        const columns = colsResult.recordset.map(c => ({
            name: c.COLUMN_NAME,
            type: c.DATA_TYPE,
            nullable: c.IS_NULLABLE === 'YES',
            maxLength: c.CHARACTER_MAXIMUM_LENGTH
        }));

        // Negative limit/page SQL me jaata tha -> FETCH NEXT -5 ROWS ONLY -> 500 error
        const page = clampInt(req.query.page, 1, 100000, 1);
        const limit = clampInt(req.query.limit, 1, 200, 50);
        const offset = (page - 1) * limit;
        const search = (req.query.search || '').trim();

        // Get total count
        const countQuery = `SELECT COUNT(*) AS TotalCount FROM [${tableName}]`;
        const countRes = await query(countQuery);
        const totalRecords = countRes.recordset[0]?.TotalCount || 0;

        // Get Primary Key / Ordering column
        const pkResult = await query(`
            SELECT c.COLUMN_NAME
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS pk 
            INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE c 
                ON pk.TABLE_NAME = c.TABLE_NAME 
                AND pk.CONSTRAINT_NAME = c.CONSTRAINT_NAME
            WHERE pk.TABLE_NAME = @tName AND pk.CONSTRAINT_TYPE = 'PRIMARY KEY'
        `, { tName: tableName });

        const orderCol = pkResult.recordset[0]?.COLUMN_NAME || columns[0]?.name || '1';

        // Select Rows
        let dataQuery;
        if (search) {
            // Find text columns to search
            const textCols = columns.filter(c => ['varchar', 'nvarchar', 'text', 'ntext', 'char', 'nchar'].includes(c.type.toLowerCase()));
            let whereClause = '';
            if (textCols.length > 0) {
                whereClause = 'WHERE ' + textCols.map(c => `[${c.name}] LIKE @searchVal`).join(' OR ');
            } else {
                whereClause = `WHERE CAST([${orderCol}] AS NVARCHAR(MAX)) LIKE @searchVal`;
            }

            dataQuery = `
                SELECT * FROM [${tableName}]
                ${whereClause}
                ORDER BY [${orderCol}] DESC
                OFFSET ${offset} ROWS
                FETCH NEXT ${limit} ROWS ONLY
            `;
            const dataResult = await query(dataQuery, { searchVal: `%${search}%` });
            return res.json({
                success: true,
                tableName,
                label: TABLE_LABELS[tableName] || tableName,
                columns,
                totalRecords,
                filteredRecords: dataResult.recordset.length,
                page,
                limit,
                data: dataResult.recordset
            });
        } else {
            dataQuery = `
                SELECT * FROM [${tableName}]
                ORDER BY [${orderCol}] DESC
                OFFSET ${offset} ROWS
                FETCH NEXT ${limit} ROWS ONLY
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
                data: dataResult.recordset
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

        // Security: Check table exists
        const checkTable = await query(`
            SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME = @tName
        `, { tName: tableName });

        if (!checkTable.recordset || checkTable.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Table nahi mila ya invalid table name!' });
        }

        // 1. Column details with Data Types, Nullable, Default, Precision, Scale, Primary Key
        const cols = await query(`
            SELECT 
                c.COLUMN_NAME,
                c.DATA_TYPE,
                c.CHARACTER_MAXIMUM_LENGTH,
                c.NUMERIC_PRECISION,
                c.NUMERIC_SCALE,
                c.IS_NULLABLE,
                c.COLUMN_DEFAULT,
                CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS IsPrimaryKey
            FROM INFORMATION_SCHEMA.COLUMNS c
            LEFT JOIN (
                SELECT ku.TABLE_NAME, ku.COLUMN_NAME
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                    ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
                WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_NAME = @tName
            ) pk ON c.TABLE_NAME = pk.TABLE_NAME AND c.COLUMN_NAME = pk.COLUMN_NAME
            WHERE c.TABLE_NAME = @tName
            ORDER BY c.ORDINAL_POSITION
        `, { tName: tableName });

        // 2. Foreign Keys
        const fks = await query(`
            SELECT 
                fk.name AS ConstraintName,
                COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS ColumnName,
                OBJECT_NAME(fkc.referenced_object_id) AS ReferencedTable,
                COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS ReferencedColumn
            FROM sys.foreign_keys fk
            INNER JOIN sys.foreign_key_columns fkc 
                ON fk.object_id = fkc.constraint_object_id
            WHERE OBJECT_NAME(fkc.parent_object_id) = @tName
        `, { tName: tableName });

        // 3. Indexes
        const indexes = await query(`
            SELECT 
                i.name AS IndexName,
                i.type_desc AS IndexType,
                i.is_unique AS IsUnique,
                i.is_primary_key AS IsPrimaryKey,
                STRING_AGG(c.name, ', ') AS Columns
            FROM sys.indexes i
            INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
            INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
            WHERE i.object_id = OBJECT_ID(@tName) AND i.name IS NOT NULL
            GROUP BY i.name, i.type_desc, i.is_unique, i.is_primary_key
        `, { tName: tableName });

        res.json({
            success: true,
            tableName,
            label: TABLE_LABELS[tableName] || tableName,
            columns: cols.recordset,
            foreignKeys: fks.recordset,
            indexes: indexes.recordset
        });
    } catch (err) {
        console.error('Database Schema View Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. POST Safe SQL Query Runner for Browser Database Inspector
// Sirf READ-ONLY SELECT allowed. Koi bhi write/ddl/exec statement reject.
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
    // Sirf ek statement allowed
    if (trimmed.includes(';')) return { ok: false, reason: 'Ek hi SELECT query allowed hai' };

    const withoutComments = trimmed
        .replace(/--[^\n]*/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/'(?:''|[^'])*'/g, "''"); // String literals strip karo taaki false-positive na ho
    const lower = withoutComments.toLowerCase();

    if (!/^\s*(select|with)\s/.test(lower)) {
        return { ok: false, reason: 'Sirf SELECT query chal sakti hai' };
    }
    for (const kw of BLOCKED_SQL_KEYWORDS) {
        // Word-boundary match - 'Intro' jaise column names false-positive na de
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
        const filesRes = await query(`
            SELECT name, size * 8 / 1024 AS SizeMB, type_desc 
            FROM sys.master_files 
            WHERE database_id = DB_ID()
        `);

        const versionRes = await query(`SELECT @@VERSION AS VersionString`);
        const collationRes = await query(`SELECT DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS Collation`);

        const totalSizeMB = (filesRes.recordset || []).reduce((sum, f) => sum + (f.SizeMB || 0), 0);

        res.json({
            success: true,
            database: process.env.DB_NAME || 'CashManagement',
            server: process.env.DB_SERVER || 'SQL Server',
            totalSizeMB,
            files: filesRes.recordset,
            collation: collationRes.recordset[0]?.Collation || 'SQL_Latin1_General_CP1_CI_AS',
            version: versionRes.recordset[0]?.VersionString || 'Microsoft SQL Server'
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
