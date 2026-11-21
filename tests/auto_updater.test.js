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

test('missing declared npm dependencies are detected for repair', () => {
    const missing = autoUpdater.findMissingDependencies(
        { express: '^5.0.0', sharp: '^0.35.0' },
        (name) => {
            if (name === 'sharp') throw new Error('module missing');
            return name;
        }
    );

    assert.deepEqual(missing, ['sharp']);
});

test('Windows dependency installation runs npm.cmd through the command interpreter', () => {
    assert.deepEqual(
        autoUpdater.npmInstallCommand('win32', 'C:\\Windows\\System32\\cmd.exe'),
        {
            command: 'C:\\Windows\\System32\\cmd.exe',
            args: ['/d', '/c', 'npm.cmd install --omit=dev --no-audit --no-fund']
        }
    );
});
