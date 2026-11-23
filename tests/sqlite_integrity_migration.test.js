const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { applyMigration } = require('../database/sqlite_integrity_migration');
const { autoRepairSchema } = require('../database/setup_sqlite');

const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'database', 'sqlite_schema.sql'), 'utf8');
const addedUniqueIndexes = [
    'idx_Users_UX_Username',
    'idx_Users_UX_ApiToken',
    'idx_SystemSettings_UX_SettingKey',
    'idx_TxnModules_UX_ModuleCode',
    'idx_SchemaMigrations_UX_MigrationName',
    'idx_ServiceRecords_UX_Module_DocCode',
    'idx_UniversalTxnRegistry_UX_SNCode'
];

function createLegacyDatabase({ activeOrphan = false } = {}) {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    const legacySchema = schemaSql
        .split(/\r?\n/)
        .filter(line => !/^\s*FOREIGN KEY\b/i.test(line))
        .filter(line => !addedUniqueIndexes.some(name => line.includes(`"${name}"`)))
        .join('\n')
        .replace(/,\r?\n(\s*\);)/g, '\n$1');
    db.exec(legacySchema);

    db.prepare('INSERT INTO Users (UserID, Username, ApiToken) VALUES (1, ?, ?)').run('admin', 'token-1');
    db.prepare('INSERT INTO Accounts (AccountID, AccountName, UserID) VALUES (1, ?, 1)').run('Cash');
    db.prepare('INSERT INTO Customers (CustomerID, CustomerName, UserID) VALUES (42, ?, 1)').run('deleted customer');
    db.prepare('DELETE FROM Customers WHERE CustomerID = 42').run();
    db.prepare('INSERT INTO Customers (CustomerID, CustomerName, UserID) VALUES (2, ?, 1)').run('Customer A');
    db.prepare(`
        INSERT INTO BillPayments (PaymentID, CustomerID, IsDeleted, UserID)
        VALUES (7, 999, ?, 1)
    `).run(activeOrphan ? 0 : 1);
    db.prepare('INSERT INTO TxnModules (ModuleCode, ModuleName, UserID) VALUES (?, ?, 1)').run('CSC', 'CSC');
    db.prepare(`
        INSERT INTO ServiceRecords (ModuleCode, CustomerID, UserID, DocCode)
        VALUES ('CSC', 2, 1, 'DOC-1')
    `).run();
    db.prepare(`
        INSERT INTO ApiIdempotencyRequests (rowid, UserID, RequestKey, State)
        VALUES (99, 1, 'request-1', 'completed')
    `).run();
    db.prepare(`
        INSERT INTO SchemaMigrations (MigrationName, Description)
        VALUES ('existing_migration', 'existing record')
    `).run();
    return db;
}

test('constraint migration preserves data, rowids, sequences, and approved orphan', () => {
    const db = createLegacyDatabase();
    try {
        const result = applyMigration(db, schemaSql);

        assert.equal(result.alreadyApplied, false);
        assert.equal(result.preservedOrphans, 1);
        assert.equal(db.prepare('SELECT rowid FROM ApiIdempotencyRequests WHERE RequestKey = ?').get('request-1').rowid, 99);
        assert.equal(db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'Customers'").get().seq, 42);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM BillPayments WHERE PaymentID = 7 AND IsDeleted = 1').get().count, 1);
        assert.equal(db.pragma('foreign_key_list("Accounts")').length, 1);
        assert.equal(db.pragma('foreign_key_list("BillPayments")').length, 1);
        assert.equal(db.pragma('foreign_key_check').length, 1);

        assert.throws(() => {
            db.prepare('INSERT INTO Accounts (AccountName, UserID) VALUES (?, ?)').run('Invalid', 999);
        }, /FOREIGN KEY constraint failed/);
        assert.throws(() => {
            db.prepare('DELETE FROM Customers WHERE CustomerID = 2').run();
        }, /FOREIGN KEY constraint failed/);
        assert.throws(() => {
            db.prepare('INSERT INTO Users (Username) VALUES (?)').run('ADMIN');
        }, /UNIQUE constraint failed/);
        assert.throws(() => {
            db.prepare(`
                INSERT INTO ServiceRecords (ModuleCode, CustomerID, UserID, DocCode)
                VALUES ('CSC', 2, 1, 'DOC-1')
            `).run();
        }, /UNIQUE constraint failed/);
    } finally {
        db.close();
    }
});

test('constraint migration refuses an unapproved active orphan without changing schema', () => {
    const db = createLegacyDatabase({ activeOrphan: true });
    try {
        assert.throws(() => applyMigration(db, schemaSql), /not soft-deleted/);
        assert.equal(db.pragma('foreign_key_list("BillPayments")').length, 0);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM SchemaMigrations WHERE MigrationName = ?')
            .get('sqlite_integrity_constraints_v1').count, 0);
    } finally {
        db.close();
    }
});

test('constraint migration can restore a missing index after its marker exists', () => {
    const db = createLegacyDatabase();
    try {
        applyMigration(db, schemaSql);
        db.exec('DROP INDEX idx_ServiceRecords_UX_Module_DocCode');

        const result = applyMigration(db, schemaSql);

        assert.equal(result.alreadyApplied, true);
        assert.equal(result.uniqueIndexesAdded, 1);
        assert.ok(db.prepare(`
            SELECT 1 FROM sqlite_master
            WHERE type = 'index' AND name = 'idx_ServiceRecords_UX_Module_DocCode'
        `).get());
    } finally {
        db.close();
    }
});

test('schema auto-repair treats foreign-key declarations as constraints, not columns', () => {
    const db = createLegacyDatabase();
    try {
        db.exec('DELETE FROM Bills');
        autoRepairSchema(db, schemaSql);

        assert.equal(db.pragma('foreign_key_list("Bills")').length, 0);
        assert.equal(db.pragma('table_info("Bills")').some(column => column.name === 'FOREIGN'), false);
    } finally {
        db.close();
    }
});
