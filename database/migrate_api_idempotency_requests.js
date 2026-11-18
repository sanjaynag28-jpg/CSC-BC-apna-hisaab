const os = require('os');
const { query, closePool } = require('./db');

const TARGET_SQL = `
SELECT DB_NAME() AS DatabaseName,
       CAST(SERVERPROPERTY('MachineName') AS NVARCHAR(128)) AS MachineName;
`;

const TABLE_EXISTS_SQL = `
SELECT OBJECT_ID('dbo.ApiIdempotencyRequests', 'U') AS TableID;
`;

const CREATE_TABLE_SQL = `
CREATE TABLE dbo.ApiIdempotencyRequests (
    UserID INT NOT NULL,
    RequestKey UNIQUEIDENTIFIER NOT NULL,
    RequestHash CHAR(64) NOT NULL,
    State NVARCHAR(16) NOT NULL,
    HttpStatus INT NULL,
    ResponseBody NVARCHAR(MAX) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
    CompletedAt DATETIME2 NULL,
    PRIMARY KEY CLUSTERED (UserID, RequestKey)
);
`;

const COLUMNS_SQL = `
SELECT c.name AS ColumnName,
       t.name AS TypeName,
       c.max_length AS MaxLength,
       c.scale AS Scale,
       c.is_nullable AS IsNullable,
       c.is_identity AS IsIdentity,
       c.is_computed AS IsComputed,
       dc.definition AS DefaultDefinition
FROM sys.columns c
JOIN sys.types t ON t.user_type_id = c.user_type_id
LEFT JOIN sys.default_constraints dc
  ON dc.parent_object_id = c.object_id
 AND dc.parent_column_id = c.column_id
WHERE c.object_id = OBJECT_ID('dbo.ApiIdempotencyRequests', 'U')
ORDER BY c.column_id;
`;

const UNIQUE_KEY_SQL = `
SELECT i.name AS IndexName,
       i.is_unique AS IsUnique,
       i.has_filter AS HasFilter,
       i.is_disabled AS IsDisabled,
       ic.key_ordinal AS KeyOrdinal,
       c.name AS ColumnName
FROM sys.indexes i
JOIN sys.index_columns ic
  ON ic.object_id = i.object_id
 AND ic.index_id = i.index_id
JOIN sys.columns c
  ON c.object_id = ic.object_id
 AND c.column_id = ic.column_id
WHERE i.object_id = OBJECT_ID('dbo.ApiIdempotencyRequests', 'U')
  AND i.index_id > 0
  AND ic.key_ordinal > 0
ORDER BY i.name, ic.key_ordinal;
`;

const EXPECTED_COLUMNS = [
    { name: 'UserID', type: 'int', maxLength: 4, nullable: false },
    { name: 'RequestKey', type: 'uniqueidentifier', maxLength: 16, nullable: false },
    { name: 'RequestHash', type: 'char', maxLength: 64, nullable: false },
    { name: 'State', type: 'nvarchar', maxLength: 32, nullable: false },
    { name: 'HttpStatus', type: 'int', maxLength: 4, nullable: true },
    { name: 'ResponseBody', type: 'nvarchar', maxLength: -1, nullable: true },
    { name: 'CreatedAt', type: 'datetime2', maxLength: 8, scale: 7, nullable: false },
    { name: 'CompletedAt', type: 'datetime2', maxLength: 8, scale: 7, nullable: true }
];

function normalizeDefault(definition) {
    return String(definition || '').replace(/[()\s]/g, '').toLowerCase();
}

function inspectSchema(columns, indexes) {
    const errors = [];
    const actualByName = new Map((columns || []).map((column) => [column.ColumnName, column]));

    for (const expected of EXPECTED_COLUMNS) {
        const actual = actualByName.get(expected.name);
        if (!actual) {
            errors.push(`missing column ${expected.name}`);
            continue;
        }

        if (String(actual.TypeName).toLowerCase() !== expected.type) {
            errors.push(`${expected.name} has an unexpected type`);
        }
        if (Number(actual.MaxLength) !== expected.maxLength) {
            errors.push(`${expected.name} has an unexpected length`);
        }
        if (Boolean(actual.IsNullable) !== expected.nullable) {
            errors.push(`${expected.name} has unexpected nullability`);
        }
        if (Boolean(actual.IsIdentity) || Boolean(actual.IsComputed)) {
            errors.push(`${expected.name} must not be identity or computed`);
        }
        if (expected.scale !== undefined && Number(actual.Scale) !== expected.scale) {
            errors.push(`${expected.name} has an unexpected scale`);
        }

        const expectedDefault = expected.name === 'CreatedAt' ? 'sysutcdatetime' : '';
        if (normalizeDefault(actual.DefaultDefinition) !== expectedDefault) {
            errors.push(`${expected.name} has an unexpected default`);
        }
    }

    for (const column of columns || []) {
        if (!EXPECTED_COLUMNS.some((expected) => expected.name === column.ColumnName)) {
            errors.push(`unexpected column ${column.ColumnName}`);
        }
    }

    const indexesByName = new Map();
    for (const row of indexes || []) {
        if (!indexesByName.has(row.IndexName)) {
            indexesByName.set(row.IndexName, {
                unique: Boolean(row.IsUnique),
                filtered: Boolean(row.HasFilter),
                disabled: Boolean(row.IsDisabled),
                keyColumns: []
            });
        }
        indexesByName.get(row.IndexName).keyColumns.push({
            ordinal: Number(row.KeyOrdinal),
            name: row.ColumnName
        });
    }

    const hasExpectedUniqueKey = Array.from(indexesByName.values()).some((index) => {
        const keyColumns = index.keyColumns
            .sort((a, b) => a.ordinal - b.ordinal)
            .map((column) => column.name);
        return index.unique
            && !index.filtered
            && !index.disabled
            && keyColumns.length === 2
            && keyColumns[0] === 'UserID'
            && keyColumns[1] === 'RequestKey';
    });

    if (!hasExpectedUniqueKey) {
        errors.push('missing enabled, nonfiltered unique key ordered (UserID, RequestKey)');
    }

    return { compatible: errors.length === 0, errors };
}

async function verifyExistingTable(queryFn) {
    const [columnsResult, indexesResult] = await Promise.all([
        queryFn(COLUMNS_SQL),
        queryFn(UNIQUE_KEY_SQL)
    ]);
    const inspection = inspectSchema(columnsResult.recordset, indexesResult.recordset);
    if (!inspection.compatible) {
        throw new Error(`dbo.ApiIdempotencyRequests is incompatible: ${inspection.errors.join('; ')}`);
    }
}

function isDuplicateObjectError(error) {
    return error?.number === 2714 || error?.originalError?.info?.number === 2714;
}

function configuredEndpointIsLocal() {
    const server = process.env.DB_SERVER || 'localhost\\SQLEXPRESS';
    const host = server.replace(/^tcp:/i, '').split(/[\\,]/)[0].trim().toLowerCase();
    const localHosts = new Set([os.hostname().toLowerCase(), 'localhost', '(local)', '.', '127.0.0.1', '::1']);
    return process.platform === 'win32'
        && (process.env.DB_NAME || 'CashManagement') === 'CashManagement'
        && localHosts.has(host);
}

async function assertLocalTarget(queryFn = query) {
    if (!configuredEndpointIsLocal()) {
        throw new Error('Configured database is not confirmed as the current local Windows CashManagement database.');
    }
    const result = await queryFn(TARGET_SQL);
    const row = result.recordset[0];
    const localHosts = new Set([os.hostname().toLowerCase(), 'localhost', '(local)', '.', '127.0.0.1', '::1']);
    if (!row || row.DatabaseName !== 'CashManagement' || !localHosts.has(String(row.MachineName || '').toLowerCase())) {
        throw new Error('Connected database is not confirmed as the current local Windows CashManagement database.');
    }
}

async function migrate(queryFn = query) {
    const tableResult = await queryFn(TABLE_EXISTS_SQL);
    const exists = Boolean(tableResult.recordset[0]?.TableID);
    let created = false;

    if (!exists) {
        try {
            await queryFn(CREATE_TABLE_SQL);
            created = true;
        } catch (error) {
            if (!isDuplicateObjectError(error)) throw error;
        }
    }

    await verifyExistingTable(queryFn);
    return { created };
}

if (require.main === module) {
    assertLocalTarget()
        .then(() => migrate())
        .then(({ created }) => {
            console.log(created
                ? '✅ dbo.ApiIdempotencyRequests created and verified.'
                : '✅ dbo.ApiIdempotencyRequests already exists and is compatible.');
        })
        .catch((error) => {
            console.error('❌ ApiIdempotencyRequests migration failed:', error.message);
            process.exitCode = 1;
        })
        .finally(() => closePool());
}

module.exports = {
    CREATE_TABLE_SQL,
    TABLE_EXISTS_SQL,
    COLUMNS_SQL,
    UNIQUE_KEY_SQL,
    TARGET_SQL,
    EXPECTED_COLUMNS,
    inspectSchema,
    assertLocalTarget,
    migrate
};
