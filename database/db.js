/**
 * database/db.js - Hybrid Database Switch
 * Automatically selects SQL Server or SQLite based on DB_TYPE in .env
 */
const path = require('path');
const fs = require('fs');

function isSqliteMode() {
    if (String(process.env.DB_TYPE || '').toLowerCase() === 'sqlite') {
        return true;
    }
    try {
        const envPath = path.join(__dirname, '..', '.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            if (/DB_TYPE\s*=\s*sqlite/i.test(content)) return true;
        }
    } catch (_) { }
    // If no SQL Server DB_SERVER configured, and SQLite DB exists or SQLite folder:
    const dbFile = path.join(__dirname, 'data', 'cash_management.db');
    if (!process.env.DB_SERVER && fs.existsSync(dbFile)) {
        return true;
    }
    return false;
}

if (isSqliteMode()) {
    module.exports = require('./db_sqlite');
} else {
    module.exports = require('./db_sqlserver');
}
