'use strict';

/**
 * CSC & BC Apna Hisaab — Non-Blocking Fleet Telemetry & Redacted Error Reporter
 *
 * Reports ONLY technical health metadata (HWID, Shop Name, App Version, Port,
 * OS/Node info, and PII-redacted error traces) to Sanjay Ji's private
 * Cloudflare Worker + D1 collector. Zero financial/customer data leaves the PC.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT_DIR = path.join(__dirname, '..');
const LOG_DIR = path.join(ROOT_DIR, 'logs');
const CFG_DIR = path.join(ROOT_DIR, 'config');
const CONFIG_FILE = path.join(CFG_DIR, 'telemetry.json');
const ADMIN_LOCAL_FILE = path.join(CFG_DIR, 'telemetry-admin.local.json');
const QUEUE_FILE = path.join(LOG_DIR, 'telemetry-queue.json');
const MAX_QUEUE_SIZE = 50;

let periodicTimer = null;

function ensureDir(dir) {
    try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (_) { }
}

function readJsonSafe(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
    } catch (_) {
        return null;
    }
}

function writeJsonSafe(filePath, obj) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function getTelemetryConfig() {
    const disabled = String(process.env.TELEMETRY_DISABLED || '').toLowerCase() === 'true';
    const fileCfg = readJsonSafe(CONFIG_FILE) || {};
    const adminCfg = readJsonSafe(ADMIN_LOCAL_FILE) || {};

    const endpoint = String(process.env.TELEMETRY_ENDPOINT || fileCfg.endpoint || '').trim().replace(/\/+$/, '');
    const ingestKey = String(process.env.TELEMETRY_INGEST_KEY || fileCfg.ingestKey || '').trim();
    const adminKey = String(process.env.TELEMETRY_ADMIN_KEY || adminCfg.adminKey || '').trim();

    return {
        disabled,
        configured: Boolean(endpoint && ingestKey && !disabled && !endpoint.includes('YOUR-SUBDOMAIN')),
        endpoint,
        ingestKey,
        adminKey
    };
}

function saveClientConfig({ endpoint, ingestKey, adminKey } = {}) {
    if (endpoint !== undefined || ingestKey !== undefined) {
        const cur = readJsonSafe(CONFIG_FILE) || {};
        const next = {
            endpoint: endpoint !== undefined ? String(endpoint).trim().replace(/\/+$/, '') : (cur.endpoint || ''),
            ingestKey: ingestKey !== undefined ? String(ingestKey).trim() : (cur.ingestKey || ''),
            updatedAt: new Date().toISOString()
        };
        writeJsonSafe(CONFIG_FILE, next);
    }
    if (adminKey !== undefined) {
        const curAdm = readJsonSafe(ADMIN_LOCAL_FILE) || {};
        const nextAdm = {
            adminKey: String(adminKey).trim() || curAdm.adminKey || '',
            updatedAt: new Date().toISOString()
        };
        writeJsonSafe(ADMIN_LOCAL_FILE, nextAdm);
    }
    return getTelemetryConfig();
}

/**
 * Strips secrets, JWTs, Aadhaar numbers, and mobile numbers from error strings
 * before persisting or forwarding telemetry.
 */
function redactSensitive(input) {
    if (!input) return '';
    let s = String(input);
    // JWT tokens
    s = s.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]');
    // Key-value secrets (supports plain k=v, Authorization: Bearer tok, and JSON "key": "value")
    s = s.replace(/((?:"?(?:JWT_SECRET|ApiToken|password|passwd|secret|X-Ingest-Key|X-Admin-Key|Authorization)"?\s*[:=]\s*)"?)(?:Bearer\s+)?[^"\s,;'"&}]+("?)/gi, '$1[REDACTED]$2');
    // 10-digit Indian mobile numbers (check before 12-digit Aadhaar so +91XXXXXXXXXX is caught first)
    s = s.replace(/(?:\+91[\s-]?|\b)[6-9]\d{9}\b/g, '[PHONE]');
    // 12-digit Aadhaar numbers (plain, spaced, or hyphenated)
    s = s.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, 'XXXX-XXXX-XXXX');
    return s;
}

function getSafeHardwareId() {
    try {
        const lm = require('./licenseManager');
        return lm.getHardwareId();
    } catch (_) {
        return `HWID-HOST-${(os.hostname() || 'PC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}`;
    }
}

async function getShopProfileSnapshot() {
    let shopName = '';
    let ownerName = '';
    let cspCode = '';
    try {
        const { query } = require('../database/db');
        const uRes = await query('SELECT ShopName, OwnerName, SettingsJson FROM Users WHERE UserID = 1');
        if (uRes && uRes.recordset && uRes.recordset.length > 0) {
            const u = uRes.recordset[0];
            shopName = u.ShopName || '';
            ownerName = u.OwnerName || '';
            if (u.SettingsJson) {
                try {
                    const sj = JSON.parse(u.SettingsJson);
                    if (sj.ShopName) shopName = sj.ShopName;
                    if (sj.ShopCSPCode) cspCode = sj.ShopCSPCode;
                } catch (_) { }
            }
        }
        if (!shopName) {
            const sRes = await query("SELECT SettingValue FROM SystemSettings WHERE SettingKey = 'ShopName' LIMIT 1");
            if (sRes && sRes.recordset && sRes.recordset.length > 0) {
                shopName = sRes.recordset[0].SettingValue || '';
            }
        }
    } catch (_) { }
    return { shopName, ownerName, cspCode };
}

function getLocalAppVersion() {
    try {
        const vJson = readJsonSafe(path.join(ROOT_DIR, 'version.json'));
        return (vJson && vJson.version) ? String(vJson.version) : '1.0.0';
    } catch (_) {
        return '1.0.0';
    }
}

function getLastUpdateSummary() {
    try {
        const logPath = path.join(LOG_DIR, 'auto-update.log');
        if (!fs.existsSync(logPath)) return '';
        const lines = fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/);
        for (let i = lines.length - 1; i >= Math.max(0, lines.length - 15); i--) {
            if (/Code version verified|Update failed|Local changes|Already up/i.test(lines[i])) {
                return lines[i].slice(0, 160);
            }
        }
    } catch (_) { }
    return '';
}

async function collectDeviceSnapshot(extra = {}) {
    const profile = await getShopProfileSnapshot();
    const version = extra.appVersion || getLocalAppVersion();
    const autostartObj = extra.autostartStatus && typeof extra.autostartStatus === 'object'
        ? `wsh=${extra.autostartStatus.wshEnabled};task=${extra.autostartStatus.scheduledTask};run=${extra.autostartStatus.runKey}`
        : String(extra.autostartStatus || '');

    return {
        hwid: getSafeHardwareId(),
        shopName: profile.shopName || 'My CSC & BC Center',
        ownerName: profile.ownerName || '',
        cspCode: profile.cspCode || '',
        hostname: os.hostname() || '',
        windowsUser: os.userInfo()?.username || process.env.USERNAME || '',
        osVersion: `${os.platform()} ${os.release()}`,
        arch: process.arch,
        nodeVersion: process.version,
        appVersion: version,
        port: Number(extra.port || process.env.PORT || 4000),
        autostartStatus: autostartObj.slice(0, 240),
        lastUpdateStatus: String(extra.lastUpdateStatus || getLastUpdateSummary()).slice(0, 180),
        uptimeSeconds: Math.round(process.uptime())
    };
}

function readQueue() {
    const q = readJsonSafe(QUEUE_FILE);
    return Array.isArray(q) ? q : [];
}

function writeQueue(list) {
    try {
        writeJsonSafe(QUEUE_FILE, list.slice(-MAX_QUEUE_SIZE));
    } catch (_) { }
}

/**
 * Synchronously queues an error to logs/telemetry-queue.json (safe inside uncaughtException
 * right before process.exit so it gets uploaded on next restart!).
 */
function queueErrorSync(errPayload = {}) {
    try {
        const entry = {
            queueId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            hwid: getSafeHardwareId(),
            appVersion: getLocalAppVersion(),
            source: String(errPayload.source || 'server').slice(0, 60),
            errorType: String(errPayload.errorType || errPayload.type || 'error').slice(0, 80),
            message: redactSensitive(errPayload.message || 'Unknown error').slice(0, 1200),
            stack: redactSensitive(errPayload.stack || '').slice(0, 3500),
            pageUrl: redactSensitive(errPayload.url || errPayload.pageUrl || '').slice(0, 300),
            createdAt: new Date().toISOString()
        };
        const queue = readQueue();
        queue.push(entry);
        writeQueue(queue);
        return entry;
    } catch (_) {
        return null;
    }
}

async function postToWorker(endpointPath, body, { endpoint, ingestKey, adminKey, method = 'POST' } = {}) {
    const cfg = getTelemetryConfig();
    const base = (endpoint || cfg.endpoint || '').replace(/\/+$/, '');
    if (!base) throw new Error('Telemetry Worker URL not configured');

    const headers = { 'Content-Type': 'application/json' };
    if (ingestKey || cfg.ingestKey) headers['X-Ingest-Key'] = ingestKey || cfg.ingestKey;
    if (adminKey || cfg.adminKey) headers['X-Admin-Key'] = adminKey || cfg.adminKey;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
    try {
        const res = await fetch(`${base}${endpointPath}`, {
            method,
            headers,
            body: method === 'GET' ? undefined : JSON.stringify(body),
            signal: controller ? controller.signal : undefined
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || `HTTP ${res.status}`);
        }
        return data;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

let flushQueueInFlight = null;

async function flushErrorQueue(shopName = '') {
    if (flushQueueInFlight) return await flushQueueInFlight;
    flushQueueInFlight = (async () => {
        const cfg = getTelemetryConfig();
        if (!cfg.configured) return { sent: 0, skipped: true };
        const queue = readQueue();
        if (queue.length === 0) return { sent: 0 };

        const sentItems = queue.slice(0, 20);
        const batch = sentItems.map((item) => ({
            ...item,
            shopName: item.shopName || shopName || ''
        }));
        await postToWorker('/api/ingest/errors', { hwid: getSafeHardwareId(), shopName, errors: batch }, cfg);

        const sentKeys = new Set(sentItems.map(it => it.queueId || `${it.createdAt || ''}|${it.errorType || ''}|${it.message || ''}`));
        const latestQueue = readQueue();
        writeQueue(latestQueue.filter(it => !sentKeys.has(it.queueId || `${it.createdAt || ''}|${it.errorType || ''}|${it.message || ''}`)));
        return { sent: batch.length };
    })();
    try {
        return await flushQueueInFlight;
    } finally {
        flushQueueInFlight = null;
    }
}

async function sendHeartbeat(extra = {}) {
    const cfg = getTelemetryConfig();
    if (!cfg.configured) return { skipped: true, reason: cfg.disabled ? 'disabled' : 'not-configured' };
    try {
        const snap = await collectDeviceSnapshot(extra);
        const res = await postToWorker('/api/ingest/heartbeat', snap, cfg);
        try { await flushErrorQueue(snap.shopName); } catch (_) { }
        return { success: true, response: res };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function reportError(errPayload = {}) {
    const cfg = getTelemetryConfig();
    if (cfg.disabled) return { skipped: true };
    const queued = queueErrorSync(errPayload);
    if (!cfg.configured || !queued) return { queued: true, sent: false };
    try {
        const prof = await getShopProfileSnapshot();
        await flushErrorQueue(prof.shopName);
        return { sent: true };
    } catch (_) {
        return { queued: true, sent: false };
    }
}

function startPeriodicTelemetry(options = {}) {
    stopPeriodicTelemetry();
    const getSnapshotArgs = () => ({
        port: typeof options.getPort === 'function' ? options.getPort() : (process.env.PORT || 4000),
        appVersion: typeof options.getAppVersion === 'function' ? options.getAppVersion() : getLocalAppVersion(),
        autostartStatus: typeof options.getAutostartStatus === 'function' ? options.getAutostartStatus() : ''
    });

    const bootTimer = setTimeout(() => {
        sendHeartbeat(getSnapshotArgs()).catch(() => { });
    }, 15000);
    if (typeof bootTimer.unref === 'function') bootTimer.unref();

    const intervalMs = Number(options.intervalMs || 20 * 60 * 1000);
    periodicTimer = setInterval(() => {
        sendHeartbeat(getSnapshotArgs()).catch(() => { });
    }, intervalMs);
    if (typeof periodicTimer.unref === 'function') periodicTimer.unref();
}

function stopPeriodicTelemetry() {
    if (periodicTimer) {
        clearInterval(periodicTimer);
        periodicTimer = null;
    }
}

module.exports = {
    getTelemetryConfig,
    saveClientConfig,
    redactSensitive,
    getSafeHardwareId,
    collectDeviceSnapshot,
    queueErrorSync,
    sendHeartbeat,
    reportError,
    flushErrorQueue,
    postToWorker,
    startPeriodicTelemetry,
    stopPeriodicTelemetry
};
