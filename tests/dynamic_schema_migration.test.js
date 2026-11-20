'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('dynamic field uniqueness is scoped to a service or module', () => {
    const migration = read('database/migrations/009_dynamic_field_scope_uniqueness_v1.sql');

    assert.match(migration, /DROP CONSTRAINT UQ_FieldDefinitions_Service_Key/);
    assert.match(migration, /DROP CONSTRAINT UQ_FieldDefs/);
    assert.match(migration, /UX_FieldDefinitions_Service_FieldKey[\s\S]*?WHERE ServiceID IS NOT NULL/i);
    assert.match(migration, /UX_FieldDefinitions_Module_FieldKey[\s\S]*?WHERE ServiceID IS NULL AND ModuleCode IS NOT NULL/i);
    assert.doesNotMatch(migration, /\b(DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE\s+TABLE|DELETE\s+FROM)\b/i);
});

test('fresh-install and startup schemas do not recreate the conflicting unique constraints', () => {
    const setup = read('database/setup.sql');
    const initialMigration = read('database/migrations/006_universal_extensible_v1.sql');
    const bootstrapper = read('database/autoSchemaBootstrapper.js');

    assert.doesNotMatch(setup, /UQ_FieldDefinitions_Service_Key/);
    assert.doesNotMatch(initialMigration, /UQ_FieldDefinitions_Service_Key/);
    assert.doesNotMatch(bootstrapper, /UQ_FieldDefs UNIQUE/);
    assert.match(bootstrapper, /UX_FieldDefinitions_Module_FieldKey/);
});
