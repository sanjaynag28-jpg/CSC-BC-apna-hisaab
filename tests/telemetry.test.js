const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const telemetry = require('../utils/telemetryAgent');

test('redactSensitive removes JWTs, secrets, Aadhaar numbers, and mobile numbers', () => {
    const raw = 'Token=Bearer eyJhbGciOiJIUzI1NiJ9.eyJVc2VySUQiOjF9.sig123456 Aadhaar 1234 5678 9012 phone +919876543210 password=mySecret99';
    const clean = telemetry.redactSensitive(raw);
    assert.doesNotMatch(clean, /eyJhbGci/);
    assert.doesNotMatch(clean, /1234 5678 9012/);
    assert.doesNotMatch(clean, /9876543210/);
    assert.doesNotMatch(clean, /mySecret99/);
    assert.match(clean, /\[REDACTED_JWT\]/);
    assert.match(clean, /XXXX-XXXX-XXXX/);
    assert.match(clean, /\[PHONE\]/);
});

test('queueErrorSync stores redacted error into queue and flushErrorQueue posts when configured', async (t) => {
    const queueFile = path.join(root, 'logs', 'telemetry-queue.json');
    const prevQueue = fs.existsSync(queueFile) ? fs.readFileSync(queueFile, 'utf8') : null;
    const prevEndpoint = process.env.TELEMETRY_ENDPOINT;
    const prevKey = process.env.TELEMETRY_INGEST_KEY;
    const prevFetch = global.fetch;

    t.after(() => {
        global.fetch = prevFetch;
        if (prevEndpoint === undefined) delete process.env.TELEMETRY_ENDPOINT;
        else process.env.TELEMETRY_ENDPOINT = prevEndpoint;
        if (prevKey === undefined) delete process.env.TELEMETRY_INGEST_KEY;
        else process.env.TELEMETRY_INGEST_KEY = prevKey;
        try {
            if (prevQueue === null) { if (fs.existsSync(queueFile)) fs.unlinkSync(queueFile); }
            else fs.writeFileSync(queueFile, prevQueue, 'utf8');
        } catch (_) { }
    });

    if (fs.existsSync(queueFile)) fs.unlinkSync(queueFile);
    telemetry.queueErrorSync({ source: 'test', errorType: 'crash', message: 'Aadhaar 4321-8765-1234 failed' });
    const queued = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
    assert.equal(queued.length, 1);
    assert.doesNotMatch(queued[0].message, /4321-8765-1234/);

    let postedUrl = '';
    let postedHeaders = null;
    process.env.TELEMETRY_ENDPOINT = 'https://cmbc-fleet.example.workers.dev';
    process.env.TELEMETRY_INGEST_KEY = 'write-token-123';
    global.fetch = async (url, opts) => {
        postedUrl = url;
        postedHeaders = opts.headers;
        return new Response(JSON.stringify({ success: true, recorded: 1 }), { status: 200 });
    };

    const res = await telemetry.flushErrorQueue('Test Shop');
    assert.equal(res.sent, 1);
    assert.equal(postedUrl, 'https://cmbc-fleet.example.workers.dev/api/ingest/errors');
    assert.equal(postedHeaders['X-Ingest-Key'], 'write-token-123');
});

test('Cloudflare Worker handles ingest auth, heartbeat upsert, error dedup & admin fleet query', async () => {
    const workerUrl = require('url').pathToFileURL(path.join(root, 'telemetry-worker', 'src', 'index.js')).href;
    const { default: worker } = await import(workerUrl);

    const devices = new Map();
    const errors = [];
    const mockDb = {
        prepare(sql) {
            return {
                _args: [],
                bind(...args) { this._args = args; return this; },
                async run() {
                    if (sql.includes('INSERT INTO devices') && sql.includes('total_heartbeats') && this._args.length >= 16) {
                        const [hwid, shopName, ownerName, , hostname, winUser, , , nodeVer, appVer, port, , , , , , lastSeen] = this._args;
                        const prev = devices.get(hwid);
                        devices.set(hwid, {
                            hwid, shop_name: shopName, owner_name: ownerName, hostname, windows_user: winUser,
                            node_version: nodeVer, app_version: appVer, port, last_seen_at: lastSeen,
                            error_count: prev ? prev.error_count : 0,
                            total_heartbeats: prev ? prev.total_heartbeats + 1 : 1
                        });
                    } else if (sql.includes('INSERT INTO error_logs')) {
                        const [hwid, shopName, appVer, source, errorType, message, stack, pageUrl, createdAt, lastSeen] = this._args;
                        errors.push({
                            id: errors.length + 1, hwid, shop_name: shopName, app_version: appVer,
                            source, error_type: errorType, message, stack, page_url: pageUrl,
                            count: 1, resolved: 0, created_at: createdAt, last_seen_at: lastSeen
                        });
                    } else if (sql.includes('UPDATE error_logs SET count = count + 1')) {
                        const id = this._args[2];
                        const row = errors.find(e => e.id === id);
                        if (row) row.count++;
                    } else if (sql.includes('INSERT INTO devices') && sql.includes('last_error_msg')) {
                        const [hwid] = this._args;
                        const prev = devices.get(hwid);
                        if (prev) prev.error_count++;
                    }
                    return { success: true };
                },
                async first() {
                    if (sql.includes('FROM error_logs')) {
                        const [hwid, source, errorType, message] = this._args;
                        const found = errors.find(e => e.hwid === hwid && e.source === source && e.error_type === errorType && e.message === message && e.resolved === 0);
                        return found ? { id: found.id } : null;
                    }
                    if (sql.includes('FROM devices WHERE hwid')) {
                        return devices.get(this._args[0]) || null;
                    }
                    return null;
                },
                async all() {
                    if (sql.includes('FROM devices')) return { results: Array.from(devices.values()) };
                    if (sql.includes('FROM error_logs')) return { results: [...errors] };
                    return { results: [] };
                }
            };
        }
    };
    const env = { DB: mockDb, INGEST_TOKEN: 'ing-secret', ADMIN_KEY: 'adm-secret' };

    // Unauthorized ingest rejected
    const badRes = await worker.fetch(new Request('https://w.dev/api/ingest/heartbeat', { method: 'POST', body: '{}' }), env, {});
    assert.equal(badRes.status, 401);

    // Valid heartbeat upsert
    const hbRes = await worker.fetch(new Request('https://w.dev/api/ingest/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ingest-Key': 'ing-secret' },
        body: JSON.stringify({ hwid: 'HWID-AAAA-1111-2222', shopName: 'Gupta CSC', appVersion: '1.0.98', port: 4000 })
    }), env, {});
    assert.equal(hbRes.status, 200);

    // Duplicate error collapses into count = 2
    for (let i = 0; i < 2; i++) {
        await worker.fetch(new Request('https://w.dev/api/ingest/errors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Ingest-Key': 'ing-secret' },
            body: JSON.stringify({ hwid: 'HWID-AAAA-1111-2222', shopName: 'Gupta CSC', appVersion: '1.0.98', source: 'browser', message: 'Boom' })
        }), env, {});
    }
    assert.equal(errors.length, 1);
    assert.equal(errors[0].count, 2);

    // Admin overview returns counts & versions
    const admRes = await worker.fetch(new Request('https://w.dev/api/admin/fleet', {
        headers: { 'X-Admin-Key': 'adm-secret' }
    }), env, {});
    const fleet = await admRes.json();
    assert.equal(admRes.status, 200);
    assert.equal(fleet.summary.totalDevices, 1);
    assert.equal(fleet.summary.versionBreakdown['1.0.98'], 1);
    assert.equal(fleet.recentErrors[0].count, 2);
});
