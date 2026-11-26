/**
 * Cash Management - Automated Setup (SQLite Edition)
 * 100% Embedded Zero-Install
 */
const path = require('path');

function getStoredProcedureName(batch) {
    const match = String(batch).match(
        /\bCREATE\s+(?:OR\s+ALTER\s+)?PROCEDURE\s+((?:\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_$#]*)(?:\s*\.\s*(?:\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_$#]*))?)/i
    );
    if (!match) throw new Error('Stored procedure declaration not found.');

    const parts = match[1].split('.').map(part => part.trim().replace(/^\[|\]$/g, ''));
    if (parts.length === 1) parts.unshift('dbo');
    return {
        objectName: parts.join('.'),
        declarationName: parts.map(part => `[${part.replace(/]/g, ']]')}]`).join('.')
    };
}

function prepareStoredProcedureBatch(batch, exists) {
    const source = String(batch).replace(/^(?:\s*--[^\r\n]*(?:\r?\n|$))+\s*/, '');
    const { declarationName } = getStoredProcedureName(source);
    return source.replace(
        /\bCREATE\s+(?:OR\s+ALTER\s+)?PROCEDURE\s+(?:\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_$#]*)(?:\s*\.\s*(?:\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_$#]*))?/i,
        `${exists ? 'ALTER' : 'CREATE'} PROCEDURE ${declarationName}`
    );
}

if (require.main === module) {
    console.log('====================================================');
    console.log('   CASH MANAGEMENT SYSTEM - SQLITE EDITION SETUP     ');
    console.log('   100% Zero-Install Embedded Database               ');
    console.log('====================================================');

    try {
        const fs = require('fs');
        for (const d of ['logs', 'backups', 'database/data', 'public/uploads/documents']) {
            const p = path.join(__dirname, d);
            if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
        }
        const { setupSQLite } = require('./database/setup_sqlite.js');
        setupSQLite();
    } catch (err) {
        console.error('❌ [Setup] SQLite database initialization failed:', err.message);
        process.exit(1);
    }
}

module.exports = { getStoredProcedureName, prepareStoredProcedureBatch };
