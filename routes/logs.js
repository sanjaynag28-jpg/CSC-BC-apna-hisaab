const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { query } = require('../database/db');

const LOGS_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'browser_errors.log');
const JSON_FILE = path.join(LOGS_DIR, 'browser_errors.json');

// Ensure directory exists
if (!fs.existsSync(LOGS_DIR)) {
    try {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
    } catch (e) {
        console.error('Could not create logs directory:', e.message);
    }
}

// In-memory rate-limiter / deduplicator (prevents log flooding)
const recentErrors = new Map();
const DEDUP_WINDOW_MS = 5000;
const MAX_JSON_ENTRIES = 200;

function cleanOldDedupKeys() {
    const now = Date.now();
    for (const [key, item] of recentErrors.entries()) {
        if (now - item.lastSeen > DEDUP_WINDOW_MS * 2) {
            recentErrors.delete(key);
        }
    }
}
setInterval(cleanOldDedupKeys, 30000);

// Helper to format local Indian date/time
function getISTTimestamp() {
    return new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

// Helper to record error into ClientErrorLogs table
async function recordToClientErrorLogs(item, reqUser, userAgent) {
    try {
        const userId = reqUser?.UserID || item.userId || null;
        const errType = String(item.type || item.errorType || 'ClientError').substring(0, 100);
        const errMsg = String(item.message || item.errorMessage || 'Unknown error').substring(0, 2000);
        const errStack = String(item.stack || item.errorStack || '').substring(0, 8000);
        const url = String(item.url || '').substring(0, 1000);
        const ua = String(userAgent || '').substring(0, 500);
        const devInfo = String(item.deviceInfo || item.source || '').substring(0, 500);

        await query(`
            INSERT INTO ClientErrorLogs (UserID, ErrorType, ErrorMessage, ErrorStack, Url, UserAgent, DeviceInfo, Resolved, CreatedAt)
            VALUES (@userId, @errType, @errMsg, @errStack, @url, @ua, @devInfo, 0, GETDATE())
        `, {
            userId,
            errType,
            errMsg,
            errStack,
            url,
            ua,
            devInfo
        });
    } catch (dbErr) {
        console.error('Failed to insert into ClientErrorLogs:', dbErr.message);
    }
}

router.post('/client-error', async (req, res) => {
    try {
        let payload = req.body || {};
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch(e) { payload = { message: payload }; }
        }

        const userAgent = req.headers['user-agent'] || '';

        // Support bulk sync if remote client reconnects after being offline
        if (Array.isArray(payload)) {
            let inserted = 0;
            for (const item of payload) {
                if (item && (item.message || item.errorMessage)) {
                    await recordToClientErrorLogs(item, req.user, userAgent);
                    inserted++;
                }
            }
            return res.json({ success: true, count: inserted });
        }

        const {
            source = 'Browser App',
            type = 'error',
            message = 'Unknown error',
            filename = '',
            lineno = '',
            colno = '',
            stack = '',
            url = '',
            activePage = '',
            activeModal = '',
            context = '',
            timestamp = new Date().toISOString()
        } = payload || {};

        const dedupKey = `${source}:${type}:${message}:${filename}:${lineno}`;
        const now = Date.now();
        const existing = recentErrors.get(dedupKey);

        if (existing && (now - existing.lastSeen < DEDUP_WINDOW_MS)) {
            existing.count = (existing.count || 1) + 1;
            existing.lastSeen = now;
            return res.json({ success: true, deduped: true, count: existing.count });
        }

        recentErrors.set(dedupKey, { count: 1, lastSeen: now });

        const istTime = getISTTimestamp();

        try {
            const telemetry = require('../utils/telemetryAgent');
            setImmediate(() => {
                telemetry.reportError({
                    source,
                    errorType: type,
                    message,
                    stack,
                    url: url || activePage || ''
                }).catch(() => { });
            });
        } catch (_) { }

        // 1. Format human-readable entry for browser_errors.log
        const logEntry = [
            '================================================================================',
            `🚨 [CLIENT ERROR] ${istTime} (${timestamp})`,
            `Source       : ${source}`,
            `Error Type   : ${type}`,
            `Page URL     : ${url || 'N/A'}${activePage ? ` [Page: ${activePage}]` : ''}${activeModal ? ` [Modal: ${activeModal}]` : ''}`,
            `File Location: ${filename || 'N/A'}${lineno ? `:${lineno}` : ''}${colno ? `:${colno}` : ''}`,
            `Message      : ${message}`,
            context ? `Context      : ${typeof context === 'object' ? JSON.stringify(context) : context}` : null,
            stack ? `Stack Trace  :\n${stack}` : 'Stack Trace  : (No stack available)',
            '================================================================================\n\n'
        ].filter(Boolean).join('\n');

        console.error(`🚨 [AUTO ERROR CAPTURE] [${activePage || 'App'}] [${type}]: ${message}`);

        // Append to log file
        fs.appendFile(LOG_FILE, logEntry, (err) => {
            if (err) console.error('Failed to write to browser_errors.log:', err.message);
        });

        // 2. Structured JSON for programmatic inspection
        const jsonEntry = {
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            istTime,
            timestamp,
            source,
            type,
            message,
            filename,
            lineno,
            colno,
            stack,
            url,
            activePage,
            activeModal,
            context
        };

        let list = [];
        try {
            if (fs.existsSync(JSON_FILE)) {
                const raw = fs.readFileSync(JSON_FILE, 'utf8');
                list = JSON.parse(raw);
                if (!Array.isArray(list)) list = [];
            }
        } catch (e) {
            list = [];
        }

        list.unshift(jsonEntry);
        if (list.length > MAX_JSON_ENTRIES) list = list.slice(0, MAX_JSON_ENTRIES);

        fs.writeFile(JSON_FILE, JSON.stringify(list, null, 2), (err) => {
            if (err) console.error('Failed to update browser_errors.json:', err.message);
        });

        // 3. Insert into ClientErrorLogs SQL Server table for remote client tracking
        await recordToClientErrorLogs(payload, req.user, userAgent);

        // 4. Also log into AuditLogs database table for persistent historical record
        try {
            const { logAudit } = require('../utils/auditLogger');
            if (typeof logAudit === 'function') {
                logAudit({
                    action: 'CLIENT_ERROR',
                    tableName: 'BrowserErrors',
                    recordId: null,
                    module: activePage || 'Frontend',
                    entityName: type || 'Error',
                    description: (message || '').substring(0, 480),
                    details: logEntry
                }).catch(() => {});
            }
        } catch(e) {}

        res.json({ success: true, logged: true, id: jsonEntry.id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

function isSuperAdminUser(req) {
    if (!req.user) return false;
    if (req.user.Role === 'Staff' || req.user.ParentUserID) return false;
    const actualUserId = Number(req.user.ActualUserID || req.user.UserID);
    return req.user.Role === 'SuperAdmin' || actualUserId === 1;
}

// Root redirect to client errors list
router.get('/', (req, res) => {
    if (!isSuperAdminUser(req)) {
        return res.status(403).json({ success: false, error: 'SuperAdmin access required' });
    }
    return res.redirect('/api/logs/client-errors');
});

// GET /api/logs/db-errors - Retrieve client error logs (SuperAdmin sees all; shops see only their own)
router.get('/db-errors', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    try {
        const isSuper = isSuperAdminUser(req);
        const userId = Number(req.user.ActualUserID || req.user.UserID);
        const sql = `
            SELECT TOP 100
                e.ErrorID, e.UserID, e.ErrorType, e.ErrorMessage, e.ErrorStack, e.Url, 
                e.UserAgent, e.DeviceInfo, e.Resolved, e.CreatedAt,
                COALESCE(u.ShopName, 'System/Public') AS ShopName,
                COALESCE(u.OwnerName, 'N/A') AS OwnerName,
                COALESCE(u.Username, 'N/A') AS Username
            FROM ClientErrorLogs e
            LEFT JOIN Users u ON e.UserID = u.UserID
            ${isSuper ? '' : 'WHERE e.UserID = @userId'}
            ORDER BY e.CreatedAt DESC
        `;
        const result = await query(sql, isSuper ? {} : { userId });
        res.json({ success: true, total: result.recordset.length, errors: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/logs/client-errors - Inspect recent errors (SuperAdmin only)
router.get('/client-errors', (req, res) => {
    if (!isSuperAdminUser(req)) {
        return res.status(403).json({ success: false, error: 'SuperAdmin access required' });
    }
    try {
        if (req.query.format === 'text') {
            if (!fs.existsSync(LOG_FILE)) {
                return res.type('text/plain').send('No errors logged yet. (All clear! 🎉)');
            }
            return res.sendFile(LOG_FILE);
        }

        let list = [];
        if (fs.existsSync(JSON_FILE)) {
            try {
                const raw = fs.readFileSync(JSON_FILE, 'utf8');
                list = JSON.parse(raw);
            } catch (e) {}
        }
        res.json({
            success: true,
            total: list.length,
            logFilePath: LOG_FILE,
            errors: list
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/logs/client-errors/:id/fix - Mark single error as Fixed (SuperAdmin only)
router.put('/client-errors/:id/fix', (req, res) => {
    if (!isSuperAdminUser(req)) {
        return res.status(403).json({ success: false, error: 'SuperAdmin access required' });
    }
    try {
        const { id } = req.params;
        const note = (req.body && req.body.note) || 'Bug fixed and verified';
        let list = [];
        if (fs.existsSync(JSON_FILE)) {
            try { list = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8') || '[]'); } catch(e) { list = []; }
        }
        let matched = false;
        list = list.map(item => {
            if (item.id === id) {
                matched = true;
                return {
                    ...item,
                    status: 'Fixed',
                    fixedAt: getISTTimestamp(),
                    resolution: note
                };
            }
            return item;
        });
        if (matched) {
            fs.writeFileSync(JSON_FILE, JSON.stringify(list, null, 2));
            return res.json({ success: true, message: `Error log ${id} marked as Fixed.` });
        }
        return res.status(404).json({ success: false, error: 'Error log not found' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/logs/client-errors/:id - Delete single error log (SuperAdmin only)
router.delete('/client-errors/:id', (req, res) => {
    if (!isSuperAdminUser(req)) {
        return res.status(403).json({ success: false, error: 'SuperAdmin access required' });
    }
    try {
        const { id } = req.params;
        let list = [];
        if (fs.existsSync(JSON_FILE)) {
            try { list = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8') || '[]'); } catch(e) { list = []; }
        }
        const filtered = list.filter(item => item.id !== id);
        if (filtered.length !== list.length) {
            fs.writeFileSync(JSON_FILE, JSON.stringify(filtered, null, 2));
            return res.json({ success: true, message: `Error log ${id} deleted.` });
        }
        return res.status(404).json({ success: false, error: 'Error log not found' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/logs/client-errors - Clear all logs (SuperAdmin only)
router.delete('/client-errors', (req, res) => {
    if (!isSuperAdminUser(req)) {
        return res.status(403).json({ success: false, error: 'SuperAdmin access required' });
    }
    try {
        if (fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '');
        if (fs.existsSync(JSON_FILE)) fs.writeFileSync(JSON_FILE, JSON.stringify([], null, 2));
        res.json({ success: true, message: 'All browser error logs cleared.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
