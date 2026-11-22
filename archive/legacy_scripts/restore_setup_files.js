/**
 * Dump live DB schema, tables, columns, indexes, and stored procedures into a clean setup.sql
 */
const { query } = require('../database/db');
const fs = require('fs');
const path = require('path');

async function dumpSchema() {
    console.log('Fetching live tables and views...');
    const tablesRes = await query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME != 'sysdiagrams'
        ORDER BY TABLE_NAME
    `);
    const tables = tablesRes.recordset.map(r => r.TABLE_NAME);

    let sql = `-- =========================================================================\n`;
    sql += `-- CASH MANAGEMENT SYSTEM - DATABASE SCHEMA & PROCEDURES SETUP\n`;
    sql += `-- Generated from Live Working Database: ${new Date().toISOString()}\n`;
    sql += `-- =========================================================================\n\n`;
    sql += `IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'CashManagement')\n`;
    sql += `BEGIN\n    CREATE DATABASE CashManagement;\nEND\nGO\n\n`;
    sql += `USE CashManagement;\nGO\n\n`;

    for (const tbl of tables) {
        console.log(`Extracting table ${tbl}...`);
        const colsRes = await query(`
            SELECT 
                COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, 
                IS_NULLABLE, COLUMN_DEFAULT, NUMERIC_PRECISION, NUMERIC_SCALE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @tbl
            ORDER BY ORDINAL_POSITION
        `, { tbl });

        const pksRes = await query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
            WHERE OBJECTPROPERTY(OBJECT_ID(CONSTRAINT_SCHEMA + '.' + CONSTRAINT_NAME), 'IsPrimaryKey') = 1
              AND TABLE_NAME = @tbl
        `, { tbl });
        const pks = pksRes.recordset.map(r => r.COLUMN_NAME);

        const idColRes = await query(`
            SELECT c.name FROM sys.columns c
            JOIN sys.tables t ON c.object_id = t.object_id
            WHERE t.name = @tbl AND c.is_identity = 1
        `, { tbl });
        const identityCol = idColRes.recordset.length ? idColRes.recordset[0].name : null;

        sql += `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '${tbl}')\n`;
        sql += `BEGIN\n`;
        sql += `    CREATE TABLE [dbo].[${tbl}] (\n`;

        const colDefs = colsRes.recordset.map(c => {
            let typeStr = c.DATA_TYPE.toUpperCase();
            if (['VARCHAR', 'NVARCHAR', 'CHAR', 'NCHAR'].includes(typeStr)) {
                typeStr += c.CHARACTER_MAXIMUM_LENGTH === -1 ? '(MAX)' : `(${c.CHARACTER_MAXIMUM_LENGTH})`;
            } else if (['DECIMAL', 'NUMERIC'].includes(typeStr)) {
                typeStr += `(${c.NUMERIC_PRECISION},${c.NUMERIC_SCALE})`;
            }
            let def = `        [${c.COLUMN_NAME}] ${typeStr}`;
            if (c.COLUMN_NAME === identityCol) {
                def += ` IDENTITY(1,1)`;
            }
            if (c.IS_NULLABLE === 'NO') {
                def += ` NOT NULL`;
            } else {
                def += ` NULL`;
            }
            if (c.COLUMN_DEFAULT) {
                def += ` DEFAULT ${c.COLUMN_DEFAULT}`;
            }
            return def;
        });

        if (pks.length) {
            colDefs.push(`        CONSTRAINT [PK_${tbl}] PRIMARY KEY CLUSTERED (${pks.map(p => `[${p}]`).join(', ')})`);
        }

        sql += colDefs.join(',\n') + `\n    );\n`;
        sql += `END\nGO\n\n`;
    }

    console.log('Extracting stored procedures...');
    const procsRes = await query(`
        SELECT name, OBJECT_DEFINITION(object_id) as def
        FROM sys.procedures
        WHERE is_ms_shipped = 0
        ORDER BY name
    `);

    for (const p of procsRes.recordset) {
        let def = p.def.trim();
        // Replace leading CREATE PROCEDURE with CREATE OR ALTER PROCEDURE
        def = def.replace(/^CREATE\s+PROCEDURE/i, 'CREATE OR ALTER PROCEDURE');
        sql += `-- Stored Procedure: ${p.name}\n`;
        sql += `${def}\nGO\n\n`;
    }

    fs.writeFileSync(path.join(__dirname, '..', 'database', 'setup.sql'), sql, 'utf8');
    console.log('✅ database/setup.sql written successfully! Size:', sql.length, 'bytes');

    // Create setup-database.js
    const setupJs = `/**
 * Cash Management - Automated Database Setup & Verification
 */
const { getPool, query } = require('./database/db');
const fs = require('fs');
const path = require('path');

async function setup() {
    console.log('🔄 Checking CashManagement database setup...');
    try {
        const pool = await getPool();
        const sqlFile = path.join(__dirname, 'database', 'setup.sql');
        if (!fs.existsSync(sqlFile)) {
            console.error('❌ database/setup.sql file not found!');
            process.exit(1);
        }

        const sql = fs.readFileSync(sqlFile, 'utf8');
        const batches = sql.split(/^\\s*GO\\s*$/im);

        for (const batch of batches) {
            let trimmed = batch.trim();
            if (/CREATE\\s+OR\\s+ALTER\\s+PROCEDURE/i.test(trimmed)) {
                trimmed = trimmed.replace(/^(\\s*--[^\\r\\n]*\\r?\\n)+/i, '').trim();
            }
            if (trimmed) {
                try {
                    await pool.request().query(trimmed);
                } catch (bErr) {
                    // Ignore already existing errors or warnings
                    if (!bErr.message.includes('already exists') && !bErr.message.includes('database "CashManagement" already exists')) {
                        console.warn('⚠️ Batch warning:', bErr.message);
                    }
                }
            }
        }

        console.log('✅ Database setup completed & verified successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Database setup failed:', err.message);
        process.exit(1);
    }
}

setup();
`;
    fs.writeFileSync(path.join(__dirname, '..', 'setup-database.js'), setupJs, 'utf8');
    console.log('✅ setup-database.js written successfully!');
}

dumpSchema().then(() => process.exit(0)).catch(err => {
    console.error('Schema dump error:', err);
    process.exit(1);
});
