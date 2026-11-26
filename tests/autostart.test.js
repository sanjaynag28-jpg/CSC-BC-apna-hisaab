const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const autostart = require('../utils/windows_autostart');
const { writeStartupStatus, STATUS_JS_FILE } = require('../utils/startupStatus');

test('windows_autostart exports all required helpers and space-safe silent-launch exists', () => {
    for (const fn of [
        'ensureWindowsAutostart',
        'ensureStartupEntry',
        'ensureShortcuts',
        'ensureRunKey',
        'ensureScheduledTask',
        'isWshEnabled',
        'isSystemServiceContext'
    ]) {
        assert.equal(typeof autostart[fn], 'function', `${fn} must be a function`);
    }
    assert.equal(fs.existsSync(path.join(root, 'scripts', 'silent-launch.ps1')), true);
    assert.equal(fs.existsSync(path.join(root, 'utils', 'open_browser.ps1')), true);
    assert.equal(fs.existsSync(path.join(root, 'public', 'startup-wait.html')), true);
});

test('autostart uses -File silent-launch.ps1 without fragile nested PowerShell quotes', () => {
    const src = fs.readFileSync(path.join(root, 'utils', 'windows_autostart.js'), 'utf8');
    assert.match(src, /silent-launch\.ps1/);
    assert.match(src, /-ExecutionPolicy Bypass -File/);
    assert.doesNotMatch(src, /\$hiddenPsArg/);
});

test('startup-wait.html polls live health and local startup-status.js without old SQL Server/Port 3000 text', () => {
    const html = fs.readFileSync(path.join(root, 'public', 'startup-wait.html'), 'utf8');
    assert.match(html, /\/api\/health/);
    assert.match(html, /\.\.\/logs\/startup-status\.js/);
    assert.match(html, /4000/);
    assert.doesNotMatch(html, /Port 3000/i);
    assert.doesNotMatch(html, /SQL_FIX\.bat/i);
});

test('server.js allows Origin null ONLY for /api/health and mounts startupGate early', () => {
    const srv = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    assert.match(srv, /const isHealthProbe = req\.path === '\/api\/health';/);
    assert.match(srv, /isHealthProbe && origin === 'null'/);
    assert.match(srv, /if \(!routesReady \|\| !dbStartupReady\) return next\(\);|if \(routesReady && dbStartupReady\) return next\(\);/);
    assert.ok(srv.indexOf('CMBC_DEFER_DB_INIT') < srv.indexOf("require('./database/db')"));
});

test('writeStartupStatus writes valid browser-loadable JS assignment to logs/startup-status.js', () => {
    const ok = writeStartupStatus({
        pct: 45,
        step: 3,
        stage: 'opening_db',
        title: 'Test Boot',
        detail: 'Testing status output',
        port: 4000,
        ok: false
    });
    assert.equal(ok, true);
    const content = fs.readFileSync(STATUS_JS_FILE, 'utf8');
    assert.match(content, /^window\.__CMBC_BOOT_STATUS = \{/);
    const jsonPart = content.replace(/^window\.__CMBC_BOOT_STATUS = /, '').replace(/;\s*$/, '');
    const parsed = JSON.parse(jsonPart);
    assert.equal(parsed.pct, 45);
    assert.equal(parsed.port, 4000);
    assert.equal(parsed.stage, 'opening_db');
});

test('3-dot action menus clamp to viewport and reposition cleanly on scroll instead of closing', () => {
    const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
    const styleCss = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
    assert.match(appJs, /function positionActionMenuViewport\(/);
    assert.match(appJs, /function repositionOpenActionMenus\(/);
    assert.doesNotMatch(appJs, /addEventListener\(['"]scroll['"],\s*closeActionDropdown/);
    assert.doesNotMatch(appJs, /addEventListener\(['"]scroll['"],\s*\(\)\s*=>\s*\{\s*closeAllActionMenus\(\)/);
    assert.match(styleCss, /max-height:\s*calc\(100vh\s*-\s*16px\)\s*!important/);
    assert.match(styleCss, /\.cad-items\s*\{[\s\S]*?overflow-y:\s*auto\s*!important/);
});

test('positionActionMenuViewport never clips off-screen on mid/bottom rows in 720p laptop viewport', () => {
    const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
    const fnMatch = appJs.match(/function positionActionMenuViewport\([\s\S]*?\n\}/);
    assert.ok(fnMatch, 'positionActionMenuViewport must exist in app.js');

    const mockWindow = { innerWidth: 1280, innerHeight: 720 };
    const mockDocument = { documentElement: { clientWidth: 1280, clientHeight: 720 } };
    const fn = new Function('window', 'document', `${fnMatch[0]}; return positionActionMenuViewport;`)(mockWindow, mockDocument);

    const makeMenu = (scrollHeight = 460) => {
        const cls = new Set();
        return {
            scrollHeight,
            offsetHeight: scrollHeight,
            style: {},
            classList: {
                add: (c) => cls.add(c),
                remove: (c) => cls.delete(c),
                contains: (c) => cls.has(c)
            }
        };
    };

    // Mid-screen row (exact screenshot scenario where neither side alone fits 460px):
    const midMenu = makeMenu(460);
    fn(midMenu, { getBoundingClientRect: () => ({ top: 360, bottom: 392, right: 1240 }) }, 280);
    const midTop = parseInt(midMenu.style.top, 10);
    assert.ok(midTop >= 10, `midTop (${midTop}) must be >= 10`);
    assert.ok(midTop + 460 <= 710, `midBottom (${midTop + 460}) must stay <= 710 (never clipped!)`);

    // Bottom row:
    const botMenu = makeMenu(460);
    fn(botMenu, { getBoundingClientRect: () => ({ top: 640, bottom: 672, right: 1240 }) }, 280);
    const botTop = parseInt(botMenu.style.top, 10);
    assert.ok(botTop >= 10, `botTop (${botTop}) must be >= 10`);
    assert.ok(botTop + 460 <= 710, `botBottom (${botTop + 460}) must stay <= 710`);

    // Row scrolled completely past top of viewport: menu stays clamped inside viewport, never vanishes off-screen
    const scrolledMenu = makeMenu(460);
    fn(scrolledMenu, { getBoundingClientRect: () => ({ top: -120, bottom: -88, right: 1240 }) }, 280);
    const scTop = parseInt(scrolledMenu.style.top, 10);
    assert.ok(scTop >= 10 && scTop + 460 <= 710, `scrolled menu must remain visible on screen (${scTop})`);
});

test('Offline-Splash Service Worker intercepts only failed navigations without caching app assets', () => {
    const sw = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
    const splash = fs.readFileSync(path.join(root, 'public', 'startup-wait.html'), 'utf8');
    assert.match(sw, /if\s*\(req\.mode\s*!==\s*'navigate'\)\s*return;/);
    assert.match(sw, /caches\.match\(SPLASH_URL\)/);
    assert.match(html, /serviceWorker\.register\('\/sw\.js'/);
    assert.match(splash, /window\.location\.reload\(\)/);
});

test('open_browser.ps1 never uses UriBuilder on file:// URLs (prevents %3F ERR_FILE_NOT_FOUND)', () => {
    const ob = fs.readFileSync(path.join(root, 'utils', 'open_browser.ps1'), 'utf8');
    assert.doesNotMatch(ob, /New-Object\s+System\.UriBuilder/);
    assert.match(ob, /\(\[System\.Uri\]\$splashPath\)\.AbsoluteUri/);
    assert.match(ob, /\$\{fileUri\}\?port=\$Port/);
});




