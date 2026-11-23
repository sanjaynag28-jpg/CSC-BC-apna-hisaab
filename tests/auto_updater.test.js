const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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

test('compareVersions compares numeric segments instead of strings', () => {
    assert.equal(autoUpdater.compareVersions('1.0.74', '1.0.73'), 1);
    assert.equal(autoUpdater.compareVersions('1.0.73', '1.0.73'), 0);
    assert.equal(autoUpdater.compareVersions('v1.0.73', '1.0.73'), 0);
    assert.equal(autoUpdater.compareVersions('1.0.9', '1.0.10'), -1);
    assert.equal(autoUpdater.compareVersions('2.0.0', '1.99.99'), 1);
    assert.equal(autoUpdater.compareVersions('', '0.0.0'), 0);
});

test('isUpdateAvailable never offers the same or an older release', () => {
    assert.equal(autoUpdater.isUpdateAvailable('1.0.73', '1.0.74'), true);
    assert.equal(autoUpdater.isUpdateAvailable('1.0.73', '1.0.73'), false);
    assert.equal(autoUpdater.isUpdateAvailable('1.0.73', '1.0.72'), false);
});

test('update manifests from another branch are rejected', () => {
    assert.equal(autoUpdater.isRemoteInfoForBranch({ version: '1.0.74', branch: 'sqlite' }), true);
    assert.equal(autoUpdater.isRemoteInfoForBranch({ version: '1.0.74' }), true);
    assert.equal(autoUpdater.isRemoteInfoForBranch({ version: '1.0.74', branch: 'main' }), false);
    assert.equal(autoUpdater.isRemoteInfoForBranch(null), false);
    assert.equal(autoUpdater.isRemoteInfoForBranch({ branch: 'sqlite' }), false);
});

test('AUTO_UPDATE_DISABLED is respected even during critical boot retries', async (t) => {
    const previous = process.env.AUTO_UPDATE_DISABLED;
    process.env.AUTO_UPDATE_DISABLED = 'true';
    t.after(() => {
        if (previous === undefined) delete process.env.AUTO_UPDATE_DISABLED;
        else process.env.AUTO_UPDATE_DISABLED = previous;
    });

    const result = await autoUpdater.runSilentAutoUpdate({ forceCritical: true, isCli: true });
    assert.equal(result.skipped, true);
    assert.equal(result.updated, false);
    assert.match(String(result.reason), /AUTO_UPDATE_DISABLED/);
});

test('user data and license config are protected from ZIP updates', () => {
    assert.equal(autoUpdater.isProtectedPath('config/licenses.json'), true);
    assert.equal(autoUpdater.isProtectedPath('.env'), true);
    assert.equal(autoUpdater.isProtectedPath('database/data/cash_management.db'), true);
    assert.equal(autoUpdater.isProtectedPath('public/uploads/customer.jpg'), true);
    assert.equal(autoUpdater.isProtectedPath('routes/auth.js'), false);
    assert.equal(autoUpdater.isProtectedPath('.env.example'), false);
});

test('downloaded archive must match the SQLite branch and target version', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmbc-update-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const writeManifest = (manifest) => {
        fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify(manifest));
    };

    writeManifest({ version: '1.0.75', branch: 'sqlite' });
    assert.equal(autoUpdater.validateArchiveVersion(dir, '1.0.74').ok, true);

    assert.equal(autoUpdater.validateArchiveVersion(dir, '1.0.76').ok, false);

    writeManifest({ version: '1.0.75', branch: 'main' });
    assert.equal(autoUpdater.validateArchiveVersion(dir, '1.0.74').ok, false);

    fs.rmSync(path.join(dir, 'version.json'));
    assert.equal(autoUpdater.validateArchiveVersion(dir, '1.0.74').ok, false);
});

test('standalone relaunch waits before spawning server.js with the current Node binary', () => {
    const relaunch = autoUpdater.buildStandaloneRelaunch();
    assert.equal(relaunch.command, process.execPath);
    assert.equal(relaunch.args[0], '-e');
    assert.match(relaunch.args[1], /server\.js/);
    assert.match(relaunch.args[1], /2000/);
    assert.equal(relaunch.options.detached, true);
    assert.equal(relaunch.options.windowsHide, true);
});
