const assert = require('assert');
const fs = require('fs');
const {
    CREATE_TABLE_SQL,
    TABLE_EXISTS_SQL,
    COLUMNS_SQL,
    UNIQUE_KEY_SQL,
    EXPECTED_COLUMNS,
    inspectSchema,
    migrate
} = require('../database/migrate_api_idempotency_requests');

function validColumns() {
    return EXPECTED_COLUMNS.map((column) => ({
        ColumnName: column.name,
        TypeName: column.type,
        MaxLength: column.maxLength,
        Scale: column.scale || 0,
        IsNullable: column.nullable,
        IsIdentity: false,
        IsComputed: false,
        DefaultDefinition: column.name === 'CreatedAt' ? '(sysutcdatetime())' : null
    }));
}

function validIndexes() {
    return [
        {
            IndexName: 'PK_ApiIdempotencyRequests',
            IsUnique: true,
            HasFilter: false,
            IsDisabled: false,
            KeyOrdinal: 1,
            ColumnName: 'UserID'
        },
        {
            IndexName: 'PK_ApiIdempotencyRequests',
            IsUnique: true,
            HasFilter: false,
            IsDisabled: false,
            KeyOrdinal: 2,
            ColumnName: 'RequestKey'
        }
    ];
}

function result(recordset) {
    return { recordset };
}

async function testCompatibleSchema() {
    assert.deepStrictEqual(inspectSchema(validColumns(), validIndexes()), {
        compatible: true,
        errors: []
    });

    const wrongColumns = validColumns().map((column) => ({ ...column }));
    wrongColumns.find((column) => column.ColumnName === 'RequestHash').MaxLength = 32;
    assert.strictEqual(inspectSchema(wrongColumns, validIndexes()).compatible, false);

    const wrongKey = validIndexes().map((row) => ({ ...row }));
    wrongKey[0].ColumnName = 'RequestKey';
    wrongKey[1].ColumnName = 'UserID';
    assert.strictEqual(inspectSchema(validColumns(), wrongKey).compatible, false);
}

function testSetupDefinitionMatchesMigration() {
    const setup = fs.readFileSync(require.resolve('../database/setup.sql'), 'utf8');
    const start = setup.indexOf("IF OBJECT_ID('dbo.ApiIdempotencyRequests', 'U') IS NULL");
    const end = setup.indexOf('\nGO', start);
    assert(start >= 0 && end > start);
    const createMatch = setup.slice(start, end).match(/CREATE TABLE dbo\.ApiIdempotencyRequests\s*\([\s\S]*?\);/i);
    assert(createMatch);
    const normalize = (sql) => sql.replace(/\s+/g, ' ').trim().replace(/;$/, '').toLowerCase();
    assert.strictEqual(normalize(createMatch[0]), normalize(CREATE_TABLE_SQL));
}

async function testCreateWhenAbsent() {
    const calls = [];
    const queryMock = async (sql) => {
        calls.push(sql);
        if (sql === TABLE_EXISTS_SQL) return result([{ TableID: null }]);
        if (sql === CREATE_TABLE_SQL) return result([]);
        if (sql === COLUMNS_SQL) return result(validColumns());
        if (sql === UNIQUE_KEY_SQL) return result(validIndexes());
        throw new Error('Unexpected mocked query');
    };

    const outcome = await migrate(queryMock);
    assert.deepStrictEqual(outcome, { created: true });
    assert.strictEqual(calls.filter((sql) => sql === CREATE_TABLE_SQL).length, 1);
}

async function testExistingCompatibleTableIsNotChanged() {
    const calls = [];
    const queryMock = async (sql) => {
        calls.push(sql);
        if (sql === TABLE_EXISTS_SQL) return result([{ TableID: 123 }]);
        if (sql === COLUMNS_SQL) return result(validColumns());
        if (sql === UNIQUE_KEY_SQL) return result(validIndexes());
        throw new Error('Unexpected mocked query');
    };

    const outcome = await migrate(queryMock);
    assert.deepStrictEqual(outcome, { created: false });
    assert(!calls.includes(CREATE_TABLE_SQL));
    assert(calls.every((sql) => sql === TABLE_EXISTS_SQL || sql === COLUMNS_SQL || sql === UNIQUE_KEY_SQL));
}

async function testExistingIncompatibleTableFailsWithoutChangingIt() {
    const calls = [];
    const queryMock = async (sql) => {
        calls.push(sql);
        if (sql === TABLE_EXISTS_SQL) return result([{ TableID: 123 }]);
        if (sql === COLUMNS_SQL) {
            const columns = validColumns();
            columns.pop();
            return result(columns);
        }
        if (sql === UNIQUE_KEY_SQL) return result([]);
        throw new Error('Unexpected mocked query');
    };

    await assert.rejects(migrate(queryMock), /incompatible/);
    assert(!calls.includes(CREATE_TABLE_SQL));
    assert(calls.every((sql) => sql === TABLE_EXISTS_SQL || sql === COLUMNS_SQL || sql === UNIQUE_KEY_SQL));
}

(async () => {
    await testCompatibleSchema();
    testSetupDefinitionMatchesMigration();
    await testCreateWhenAbsent();
    await testExistingCompatibleTableIsNotChanged();
    await testExistingIncompatibleTableFailsWithoutChangingIt();
    console.log('Idempotency migration mocked tests passed.');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
