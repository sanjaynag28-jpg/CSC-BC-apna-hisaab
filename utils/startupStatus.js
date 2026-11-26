'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const LOG_DIR = path.join(ROOT_DIR, 'logs');
const STATUS_JS_FILE = path.join(LOG_DIR, 'startup-status.js');

/**
 * Atomically writes logs/startup-status.js so file:///.../public/startup-wait.html
 * can read real-time boot progress via <script> tag even before port 4000 binds
 * and without CORS restrictions on file:// origins.
 */
function writeStartupStatus(payload = {}) {
    try {
        if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
        const data = {
            pct: Math.max(0, Math.min(100, Number(payload.pct ?? 0))),
            step: Number(payload.step ?? 1),
            stage: String(payload.stage || 'booting'),
            title: String(payload.title || 'Server start ho raha hai...'),
            detail: String(payload.detail || 'CSC & BC Apna Hisaab taiyaar ho raha hai...'),
            port: Number(payload.port || process.env.PORT || 4000),
            version: String(payload.version || ''),
            ok: Boolean(payload.ok),
            error: payload.error ? String(payload.error) : '',
            pid: process.pid,
            updatedAt: Date.now()
        };
        const content = `window.__CMBC_BOOT_STATUS = ${JSON.stringify(data)};\n`;
        const tmpFile = `${STATUS_JS_FILE}.${process.pid}.tmp`;
        fs.writeFileSync(tmpFile, content, 'utf8');
        try {
            fs.renameSync(tmpFile, STATUS_JS_FILE);
        } catch (_) {
            fs.writeFileSync(STATUS_JS_FILE, content, 'utf8');
            try { fs.unlinkSync(tmpFile); } catch (__) { }
        }
        return true;
    } catch (_) {
        return false;
    }
}

module.exports = {
    writeStartupStatus,
    STATUS_JS_FILE
};
