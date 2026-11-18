/**
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
        const batches = sql.split(/^\s*GO\s*$/im);

        for (const batch of batches) {
            let trimmed = batch.trim();
            if (/CREATE\s+OR\s+ALTER\s+PROCEDURE/i.test(trimmed)) {
                trimmed = trimmed.replace(/^(\s*--[^\r\n]*\r?\n)+/i, '').trim();
            }
            if (trimmed) {
                await pool.request().query(trimmed);
            }
        }

        // Ensure Rule 1 & Rule 3 Relational Source Identity & Unique Index exist
        const { runRule1Migration } = require('./scripts/migration_rule1_sourceline');
        await runRule1Migration();

        console.log('✅ Database setup completed & verified successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Database setup failed:', err.message);
        process.exit(1);
    }
}

setup();
