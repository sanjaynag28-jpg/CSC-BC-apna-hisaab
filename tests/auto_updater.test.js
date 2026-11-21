const assert = require('node:assert/strict');
const test = require('node:test');
const autoUpdater = require('../utils/autoUpdater');

test('periodic updater is exported and update status is JSON serializable', (t) => {
    assert.equal(typeof autoUpdater.startPeriodicCheck, 'function');
    assert.equal(typeof autoUpdater.stopPeriodicCheck, 'function');

    autoUpdater.startPeriodicCheck(60_000);
    t.after(() => autoUpdater.stopPeriodicCheck());

    const status = autoUpdater.getUpdateStatus();
    assert.equal(status.periodicCheckActive, true);
    assert.equal('periodicTimer' in status, false);
    assert.doesNotThrow(() => JSON.stringify(status));
});
