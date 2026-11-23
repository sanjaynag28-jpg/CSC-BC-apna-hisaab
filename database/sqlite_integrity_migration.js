const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const SCHEMA_PATH = path.join(__dirname, 'sqlite_schema.sql');
const DEFAULT_DATABASE_PATH = path.join(__dirname, 'data', 'cash_management.db');
const DEFAULT_BACKUP_DIRECTORY = path.join(__dirname, '..', 'database', 'backups');
const MIGRATION_NAME = 'sqlite_integrity_constraints_v1';
const USER_INDEXES = [
    'idx_Users_UX_Username',
    'idx_Users_UX_ApiToken',
    'idx_SystemSettings_UX_SettingKey',
    'idx_TxnModules_UX_ModuleCode',
    'idx_SchemaMigrations_UX_MigrationName',
    'idx_ServiceRecords_UX_Module_DocCode',
    'idx_UniversalTxnRegistry_UX_SNCode'
];
const APPROVED_ORPHAN = {
    child: 'BillPayments',
    childColumn: 'CustomerID',
    parent: 'Customers',
    parentColumn: 'CustomerID',
    softDeleteColumn: 'IsDeleted'
};

function quoteIdentifier(identifier) {
    return `"${String(identifier).replace(/"/g, '""')}"`;
}

function createCanonicalDatabase(schemaSql) {
    const canonical = new Database(':memory:');
    canonical.pragma('foreign_keys = ON');
    canonical.exec(schemaSql);
    return canonical;
}

function getTableNames(db) {
    return db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    `).all().map(row => row.name);
}

function getForeignKeySignatures(db, tables) {
    const signatures = [];
    for (const table of tables) {
        const rows = db.pragma(`foreign_key_list(${quoteIdentifier(table)})`);
        for (const row of rows) {
            signatures.push([
                table,
                row.from,
                row.table,
                row.to,
                String(row.on_delete).toUpperCase(),
                String(row.on_update).toUpperCase()
            ].join('|'));
        }
    }
    return signatures.sort();
}

function getForeignKeyRelations(db, tables) {
    const relations = [];
    for (const table of tables) {
        for (const row of db.pragma(`foreign_key_list(${quoteIdentifier(table)})`)) {
            relations.push({
                child: table,
                childColumn: row.from,
                parent: row.table,
                parentColumn: row.to
            });
        }
    }
    return relations;
}

function getColumnSignature(db, table) {
    return db.pragma(`table_info(${quoteIdentifier(table)})`).map(column => [
        column.name,
        String(column.type || '').toUpperCase(),
        Number(column.notnull),
        column.dflt_value,
        Number(column.pk)
    ]);
}

function getIndexDefinitions(db) {
    return new Map(db.prepare(`
        SELECT name, sql FROM sqlite_master
        WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%'
    `).all().map(index => [index.name, index.sql]));
}

function normalizeSql(sql) {
    return String(sql || '')
        .replace(/["`]/g, '')
        .replace(/\bIF\s+NOT\s+EXISTS\b/gi, '')
        .replace(/\s+/g, '')
        .replace(/;$/, '')
        .toLowerCase();
}

function getTriggerNames(db) {
    return db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all()
        .map(row => row.name).sort();
}

function validateSchemaShape(db, canonical, tables) {
    const actualTables = getTableNames(db);
    const expectedTables = getTableNames(canonical);
    if (JSON.stringify(actualTables) !== JSON.stringify(expectedTables)) {
        throw new Error(`Table set differs from canonical schema. Expected ${expectedTables.length}, found ${actualTables.length}.`);
    }

    for (const table of expectedTables) {
        const actualColumns = getColumnSignature(db, table);
        const expectedColumns = getColumnSignature(canonical, table);
        if (JSON.stringify(actualColumns) !== JSON.stringify(expectedColumns)) {
            throw new Error(`Column definitions differ from canonical schema for "${table}". No migration was applied.`);
        }
    }

    const expectedIndexes = getIndexDefinitions(canonical);
    const actualIndexes = getIndexDefinitions(db);
    for (const [name, sql] of actualIndexes) {
        if (!expectedIndexes.has(name)) {
            throw new Error(`Unexpected index "${name}" found; refusing to alter an unknown schema object.`);
        }
        if (normalizeSql(expectedIndexes.get(name)) !== normalizeSql(sql)) {
            throw new Error(`Index "${name}" differs from the canonical definition; refusing to replace it.`);
        }
    }

    const expectedTriggers = getTriggerNames(canonical);
    const actualTriggers = getTriggerNames(db);
    for (const name of actualTriggers) {
        if (!expectedTriggers.includes(name)) {
            throw new Error(`Unexpected trigger "${name}" found; refusing to alter an unknown schema object.`);
        }
    }

    const expectedForeignKeys = getForeignKeySignatures(canonical, tables);
    const actualForeignKeys = getForeignKeySignatures(db, tables);
    const missingForeignKeys = expectedForeignKeys.filter(item => !actualForeignKeys.includes(item));
    const extraForeignKeys = actualForeignKeys.filter(item => !expectedForeignKeys.includes(item));
    if (extraForeignKeys.length > 0) {
        throw new Error('Database contains foreign keys that are not in the canonical schema; no migration was applied.');
    }

    return {
        expectedTables,
        missingForeignKeys,
        expectedIndexes,
        actualIndexes
    };
}

function getOrphans(db, relations) {
    const results = [];
    for (const relation of relations) {
        const child = quoteIdentifier(relation.child);
        const childColumn = quoteIdentifier(relation.childColumn);
        const parent = quoteIdentifier(relation.parent);
        const parentColumn = quoteIdentifier(relation.parentColumn);
        const rows = db.prepare(`
            SELECT c.rowid AS rowid, c.${childColumn} AS reference
            FROM ${child} AS c
            LEFT JOIN ${parent} AS p ON p.${parentColumn} = c.${childColumn}
            WHERE c.${childColumn} IS NOT NULL AND p.${parentColumn} IS NULL
            ORDER BY c.rowid
        `).all();
        if (rows.length === 0) continue;

        const isApprovedRelation = relation.child === APPROVED_ORPHAN.child &&
            relation.childColumn === APPROVED_ORPHAN.childColumn &&
            relation.parent === APPROVED_ORPHAN.parent &&
            relation.parentColumn === APPROVED_ORPHAN.parentColumn;
        if (!isApprovedRelation || rows.length > 1) {
            throw new Error(`Found ${rows.length} orphan reference(s) in ${relation.child}.${relation.childColumn}; refusing to migrate.`);
        }

        const softDelete = quoteIdentifier(APPROVED_ORPHAN.softDeleteColumn);
        const softDeletedRow = db.prepare(`
            SELECT ${softDelete} AS isDeleted FROM ${child} WHERE rowid = ?
        `).get(rows[0].rowid);
        if (!softDeletedRow || Number(softDeletedRow.isDeleted) !== 1) {
            throw new Error('The approved BillPayments orphan is not soft-deleted; refusing to migrate.');
        }
        results.push({
            ...relation,
            rowid: rows[0].rowid,
            reference: rows[0].reference
        });
    }
    return results;
}

function encodeValue(value) {
    if (Buffer.isBuffer(value)) return { blob: value.toString('base64') };
    if (typeof value === 'bigint') return { bigint: value.toString() };
    return value;
}

function snapshotTables(db, tables) {
    const snapshots = new Map();
    for (const table of tables) {
        const columns = db.pragma(`table_info(${quoteIdentifier(table)})`).map(column => column.name);
        const hash = crypto.createHash('sha256');
        let count = 0;
        const statement = db.prepare(`SELECT rowid AS __integrity_rowid, * FROM ${quoteIdentifier(table)} ORDER BY rowid`);
        for (const row of statement.iterate()) {
            const values = [encodeValue(row.__integrity_rowid), ...columns.map(column => encodeValue(row[column]))];
            hash.update(JSON.stringify(values));
            hash.update('\n');
            count += 1;
        }
        snapshots.set(table, { count, hash: hash.digest('hex') });
    }
    return snapshots;
}

function assertSnapshotsEqual(before, after) {
    for (const [table, expected] of before) {
        const actual = after.get(table);
        if (!actual || actual.count !== expected.count || actual.hash !== expected.hash) {
            throw new Error(`Data preservation check failed for "${table}"; the migration was rolled back.`);
        }
    }
}

function getMigrationRows(db) {
    return db.prepare(`
        SELECT MigrationID, MigrationName, AppliedAt, Description
        FROM SchemaMigrations ORDER BY MigrationID
    `).all();
}

function getSequences(db, tables) {
    const available = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'").get();
    if (!available) return new Map();
    const tableSet = new Set(tables);
    return new Map(db.prepare('SELECT name, seq FROM sqlite_sequence').all()
        .filter(row => tableSet.has(row.name))
        .map(row => [row.name, row.seq]));
}

function restoreSequences(db, sequences) {
    for (const [table, seq] of sequences) {
        const existing = db.prepare('SELECT 1 FROM sqlite_sequence WHERE name = ?').get(table);
        if (existing) {
            db.prepare('UPDATE sqlite_sequence SET seq = ? WHERE name = ?').run(seq, table);
        } else {
            db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(table, seq);
        }
    }
}

function expectedForeignKeyViolations(db, expectedOrphans) {
    const actual = db.pragma('foreign_key_check');
    const remaining = [...expectedOrphans];
    for (const violation of actual) {
        const index = remaining.findIndex(orphan =>
            orphan.child === violation.table &&
            orphan.parent === violation.parent &&
            orphan.rowid === violation.rowid
        );
        if (index < 0) {
            throw new Error(`Unexpected foreign-key violation in "${violation.table}" referencing "${violation.parent}".`);
        }
        remaining.splice(index, 1);
    }
    if (remaining.length > 0 || actual.length !== expectedOrphans.length) {
        throw new Error('Foreign-key check did not match the approved preserved orphan.');
    }
    return actual.length;
}

function rebuildTable(db, canonical, table) {
    const canonicalSql = canonical.prepare(`
        SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?
    `).get(table).sql;
    const prefix = `CREATE TABLE "${table}"`;
    if (!canonicalSql.startsWith(prefix)) {
        throw new Error(`Cannot safely rebuild table "${table}": unexpected canonical DDL.`);
    }

    const temporaryTable = `${table}__integrity_migration`;
    const temporarySql = `CREATE TABLE "${temporaryTable}"${canonicalSql.slice(prefix.length)}`;
    db.exec(temporarySql);

    const columns = db.pragma(`table_info(${quoteIdentifier(table)})`).map(column => column.name);
    const columnList = columns.map(quoteIdentifier).join(', ');
    db.exec(`
        INSERT INTO ${quoteIdentifier(temporaryTable)} (rowid, ${columnList})
        SELECT rowid, ${columnList} FROM ${quoteIdentifier(table)} ORDER BY rowid
    `);
    db.exec(`DROP TABLE ${quoteIdentifier(table)}`);
    db.exec(`ALTER TABLE ${quoteIdentifier(temporaryTable)} RENAME TO ${quoteIdentifier(table)}`);
}

function applyMigration(db, schemaSql) {
    const canonical = createCanonicalDatabase(schemaSql);
    try {
        const tables = getTableNames(canonical);
        const inspection = validateSchemaShape(db, canonical, tables);
        const relations = getForeignKeyRelations(canonical, tables);
        const approvedOrphans = getOrphans(db, relations);
        const migrationExists = db.prepare(`
            SELECT 1 FROM SchemaMigrations WHERE MigrationName = ?
        `).get(MIGRATION_NAME);

        if (migrationExists) {
            if (inspection.missingForeignKeys.length > 0) {
                throw new Error('Migration marker exists but canonical foreign keys are missing; refusing automatic repair.');
            }
            const missingIndexes = USER_INDEXES.filter(name => !inspection.actualIndexes.has(name));
            if (missingIndexes.length === 0) {
                return {
                    alreadyApplied: true,
                    foreignKeysAdded: 0,
                    uniqueIndexesAdded: 0,
                    preservedOrphans: approvedOrphans.length
                };
            }

            const rowsBefore = snapshotTables(db, tables.filter(table => table !== 'SchemaMigrations'));
            db.pragma('foreign_keys = OFF');
            try {
                db.exec('BEGIN EXCLUSIVE');
                db.exec(schemaSql);
                assertSnapshotsEqual(rowsBefore, snapshotTables(db, tables.filter(table => table !== 'SchemaMigrations')));
                const integrity = db.pragma('integrity_check');
                if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
                    throw new Error(`SQLite integrity check failed: ${JSON.stringify(integrity)}`);
                }
                const preservedOrphans = expectedForeignKeyViolations(db, approvedOrphans);
                const afterIndexes = getIndexDefinitions(db);
                for (const name of USER_INDEXES) {
                    if (!afterIndexes.has(name)) {
                        throw new Error(`Required unique index "${name}" was not created.`);
                    }
                }
                db.exec('COMMIT');
                db.pragma('foreign_keys = ON');
                return {
                    alreadyApplied: true,
                    foreignKeysAdded: 0,
                    uniqueIndexesAdded: missingIndexes.length,
                    preservedOrphans
                };
            } catch (error) {
                try { db.exec('ROLLBACK'); } catch (_) { }
                throw error;
            } finally {
                db.pragma('foreign_keys = ON');
            }
        }

        const tablesToRebuild = [...new Set(inspection.missingForeignKeys.map(item => item.split('|')[0]))];
        const rowsBefore = snapshotTables(db, tables.filter(table => table !== 'SchemaMigrations'));
        const migrationRowsBefore = getMigrationRows(db);
        const sequencesBefore = getSequences(db, tables);

        db.pragma('foreign_keys = OFF');
        try {
            db.exec('BEGIN EXCLUSIVE');
            for (const table of tablesToRebuild) {
                rebuildTable(db, canonical, table);
            }
            db.exec(schemaSql);
            restoreSequences(db, sequencesBefore);

            const rowsAfter = snapshotTables(db, tables.filter(table => table !== 'SchemaMigrations'));
            assertSnapshotsEqual(rowsBefore, rowsAfter);

            const integrity = db.pragma('integrity_check');
            if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
                throw new Error(`SQLite integrity check failed: ${JSON.stringify(integrity)}`);
            }
            const preservedOrphans = expectedForeignKeyViolations(db, approvedOrphans);

            const afterIndexes = getIndexDefinitions(db);
            for (const name of USER_INDEXES) {
                if (!afterIndexes.has(name)) {
                    throw new Error(`Required unique index "${name}" was not created.`);
                }
            }

            const migrationRowsAfter = getMigrationRows(db);
            if (JSON.stringify(migrationRowsAfter) !== JSON.stringify(migrationRowsBefore)) {
                throw new Error('The schema migration ledger changed before the new migration marker was written.');
            }
            db.prepare(`
                INSERT INTO SchemaMigrations (MigrationName, AppliedAt, Description)
                VALUES (?, datetime('now', 'localtime'), ?)
            `).run(MIGRATION_NAME, 'Added restrictive foreign keys and natural-key unique indexes; preserved existing data.');
            db.exec('COMMIT');

            db.pragma('foreign_keys = ON');
            const finalIntegrity = db.pragma('integrity_check');
            if (finalIntegrity.length !== 1 || finalIntegrity[0].integrity_check !== 'ok') {
                throw new Error(`Post-migration SQLite integrity check failed: ${JSON.stringify(finalIntegrity)}`);
            }
            const finalViolations = expectedForeignKeyViolations(db, approvedOrphans);
            const finalInspection = validateSchemaShape(db, canonical, tables);
            if (finalInspection.missingForeignKeys.length > 0) {
                throw new Error('Post-migration foreign-key definitions do not match the canonical schema.');
            }

            return {
                alreadyApplied: false,
                foreignKeysAdded: inspection.missingForeignKeys.length,
                uniqueIndexesAdded: USER_INDEXES.filter(name => !inspection.actualIndexes.has(name)).length,
                preservedOrphans: finalViolations
            };
        } catch (error) {
            try { db.exec('ROLLBACK'); } catch (_) { }
            throw error;
        } finally {
            db.pragma('foreign_keys = ON');
        }
    } finally {
        canonical.close();
    }
}

function removeTemporaryDatabase(filePath) {
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
        const target = `${filePath}${suffix}`;
        if (fs.existsSync(target)) fs.unlinkSync(target);
    }
}

async function createVerifiedBackup(sourceDb, databasePath, backupDirectory) {
    fs.mkdirSync(backupDirectory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDirectory, `cash_management_pre_constraints_${stamp}.db`);
    if (fs.existsSync(backupPath)) throw new Error(`Backup path already exists: ${backupPath}`);

    const tables = getTableNames(sourceDb);
    const sourceSnapshot = snapshotTables(sourceDb, tables);
    try {
        await sourceDb.backup(backupPath);
        const backupDb = new Database(backupPath, { readonly: true, fileMustExist: true });
        try {
            const integrity = backupDb.pragma('integrity_check');
            if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
                throw new Error('SQLite backup integrity check failed.');
            }
            assertSnapshotsEqual(sourceSnapshot, snapshotTables(backupDb, tables));
        } finally {
            backupDb.close();
        }
        return backupPath;
    } catch (error) {
        removeTemporaryDatabase(backupPath);
        throw new Error(`Verified database backup failed; migration was not started: ${error.message}`);
    }
}

async function runDryRun(databasePath) {
    const sourceDb = new Database(databasePath, { readonly: true, fileMustExist: true });
    let temporaryPath;
    try {
        const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
        const canonical = createCanonicalDatabase(schemaSql);
        try {
            const tables = getTableNames(canonical);
            validateSchemaShape(sourceDb, canonical, tables);
            getOrphans(sourceDb, getForeignKeyRelations(canonical, tables));
        } finally {
            canonical.close();
        }

        temporaryPath = path.join(os.tmpdir(), `cash-management-integrity-${process.pid}-${crypto.randomBytes(6).toString('hex')}.db`);
        try {
            await sourceDb.backup(temporaryPath);
        } catch (error) {
            removeTemporaryDatabase(temporaryPath);
            throw error;
        }
    } finally {
        sourceDb.close();
    }

    const testDb = new Database(temporaryPath);
    try {
        const result = applyMigration(testDb, fs.readFileSync(SCHEMA_PATH, 'utf8'));
        return { ...result, temporaryCopy: true };
    } finally {
        testDb.close();
        removeTemporaryDatabase(temporaryPath);
    }
}

async function runApply(databasePath, backupDirectory) {
    const db = new Database(databasePath, { fileMustExist: true, timeout: 10000 });
    db.pragma('busy_timeout = 10000');
    try {
        const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
        const canonical = createCanonicalDatabase(schemaSql);
        let needsMigration;
        try {
            const tables = getTableNames(canonical);
            const inspection = validateSchemaShape(db, canonical, tables);
            const migrationExists = db.prepare(`
                SELECT 1 FROM SchemaMigrations WHERE MigrationName = ?
            `).get(MIGRATION_NAME);
            needsMigration = !migrationExists ||
                inspection.missingForeignKeys.length > 0 ||
                USER_INDEXES.some(name => !inspection.actualIndexes.has(name));
        } finally {
            canonical.close();
        }

        let backupPath = null;
        if (needsMigration) {
            backupPath = await createVerifiedBackup(db, databasePath, backupDirectory);
        }
        const result = applyMigration(db, schemaSql);
        return { ...result, backupPath };
    } finally {
        db.close();
    }
}

function parseArguments(argv) {
    const options = { mode: 'dry-run', databasePath: DEFAULT_DATABASE_PATH, backupDirectory: DEFAULT_BACKUP_DIRECTORY };
    for (const argument of argv) {
        if (argument === '--apply') options.mode = 'apply';
        else if (argument === '--dry-run') options.mode = 'dry-run';
        else if (argument.startsWith('--db=')) options.databasePath = path.resolve(argument.slice('--db='.length));
        else if (argument.startsWith('--backup-dir=')) options.backupDirectory = path.resolve(argument.slice('--backup-dir='.length));
        else throw new Error(`Unknown argument: ${argument}`);
    }
    return options;
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const result = options.mode === 'apply'
        ? await runApply(options.databasePath, options.backupDirectory)
        : await runDryRun(options.databasePath);

    console.log(options.mode === 'apply' ? 'SQLite integrity migration completed.' : 'SQLite integrity migration dry-run passed.');
    console.log(`Foreign keys added: ${result.foreignKeysAdded}`);
    console.log(`Unique indexes added: ${result.uniqueIndexesAdded}`);
    console.log(`Preserved approved soft-deleted orphan(s): ${result.preservedOrphans}`);
    if (result.backupPath) console.log(`Verified backup: ${result.backupPath}`);
}

if (require.main === module) {
    main().catch(error => {
        console.error(`SQLite integrity migration failed: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    applyMigration,
    parseArguments,
    runApply,
    runDryRun
};
