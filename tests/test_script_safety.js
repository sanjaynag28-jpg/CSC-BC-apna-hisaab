'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const safety = require('./test-safety');
const gdrivePath = path.resolve(__dirname, '../scripts/gdrive_backup.js');
if (!fs.existsSync(gdrivePath)) {
    console.log('[SKIP] scripts/gdrive_backup.js not present; skipping gdrive restore target assertions.');
    process.exit(0);
}
const { validateRestoreTarget } = require('../scripts/gdrive_backup');

assert.throws(
    () => validateRestoreTarget(path.join(path.dirname(__dirname), 'restore-test'), false),
    /explicit --confirm/
);
assert.throws(
    () => validateRestoreTarget(path.dirname(__dirname), true),
    /Unsafe restore target/
);

let isolatedTarget = path.join(path.dirname(path.dirname(__dirname)), `CashManagement_Restore_Test_${process.pid}`);
if (require('fs').existsSync(isolatedTarget)) {
    isolatedTarget = path.join(path.dirname(path.dirname(__dirname)), `CashManagement_Restore_Test_${process.pid}_${Date.now()}`);
}
assert.strictEqual(validateRestoreTarget(isolatedTarget, true), path.resolve(isolatedTarget));

const oldDbName = process.env.DB_NAME;
const oldTestDbName = process.env.TEST_DB_NAME;
try {
    process.env.DB_NAME = 'CashManagement';
    process.env.TEST_DB_NAME = 'CashManagement';
    assert.throws(() => safety.assertIsolatedDatabase(), /CashManagement_Test/);
    process.env.DB_NAME = 'CashManagement_Test_Unit';
    process.env.TEST_DB_NAME = 'CashManagement_Test_Unit';
    assert.doesNotThrow(() => safety.assertIsolatedDatabase());
} finally {
    if (oldDbName === undefined) delete process.env.DB_NAME;
    else process.env.DB_NAME = oldDbName;
    if (oldTestDbName === undefined) delete process.env.TEST_DB_NAME;
    else process.env.TEST_DB_NAME = oldTestDbName;
}

console.log('Safe script guard checks passed.');
