const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    getStoredProcedureName,
    prepareStoredProcedureBatch
} = require('../setup-database');

test('procedure batches use CREATE for a missing procedure and a separate batch', () => {
    const batch = [
        '-- Stored Procedure: sp_Test',
        'CREATE OR ALTER PROCEDURE sp_Test',
        'AS',
        'BEGIN',
        '    SELECT 1;',
        'END;'
    ].join('\n');

    const prepared = prepareStoredProcedureBatch(batch, false);

    assert.match(prepared, /^CREATE PROCEDURE \[dbo\]\.\[sp_Test\]/);
    assert.doesNotMatch(prepared, /CREATE\s+OR\s+ALTER/i);
    assert.match(prepared, /SELECT 1;/);
});

test('procedure batches use ALTER for an existing procedure', () => {
    const prepared = prepareStoredProcedureBatch(
        'CREATE OR ALTER PROCEDURE [custom].[sp_Test]\nAS SELECT 1;',
        true
    );

    assert.match(prepared, /^ALTER PROCEDURE \[custom\]\.\[sp_Test\]/);
});

test('procedure name lookup defaults unqualified procedures to dbo', () => {
    assert.deepEqual(getStoredProcedureName('CREATE OR ALTER PROCEDURE sp_Test AS SELECT 1;'), {
        objectName: 'dbo.sp_Test',
        declarationName: '[dbo].[sp_Test]'
    });
});

test('all setup.sql procedure batches become SQL Server 2012-compatible CREATE or ALTER batches', () => {
    const setupSql = fs.readFileSync(path.join(__dirname, '..', 'database', 'setup.sql'), 'utf8');
    const procedureBatches = setupSql
        .split(/^\s*GO\s*$/im)
        .map((batch) => batch.trim())
        .filter((batch) => /CREATE\s+OR\s+ALTER\s+PROCEDURE/i.test(batch));

    assert.ok(procedureBatches.length > 0);
    for (const batch of procedureBatches) {
        for (const exists of [false, true]) {
            const prepared = prepareStoredProcedureBatch(batch, exists);
            assert.match(prepared, new RegExp(`^${exists ? 'ALTER' : 'CREATE'} PROCEDURE \\[dbo\\]\\.\\[`));
            assert.doesNotMatch(prepared, /CREATE\s+OR\s+ALTER/i);
        }
    }
});
