// ============================================================================
// 🛡️ CASH MANAGEMENT BC - CLIENT AUTO ERROR CAPTURE & TELEMETRY
// Automatically intercepts all unhandled JavaScript errors, promise rejections,
// and console.error calls, logs them to server's logs/ folder & SQL AuditLogs,
// and shows a toast notification that the error log has been saved!
// ============================================================================
(function() {
    'use strict';

    if (window.__CM_ERROR_LOGGER_INITIALIZED__) return;
    window.__CM_ERROR_LOGGER_INITIALIZED__ = true;

    var recentLogHashes = new Map();
    var DEDUP_MS = 3000;
    var isSending = false;
    var lastToastTime = 0;
    var TOAST_THROTTLE_MS = 3000;

    function getActivePageName() {
        try {
            var activeSection = document.querySelector('.page.active, section.page[style*="display: block"]');
            if (activeSection && activeSection.id) return activeSection.id.replace('page-', '');
            var hash = (window.location.hash || '').replace('#', '').trim();
            if (hash) return hash.replace('page-', '');
            return localStorage.getItem('cash_mgmt_active_page') || 'dashboard';
        } catch (e) {
            return 'unknown';
        }
    }

    function getOpenModalName() {
        try {
            var openModal = document.querySelector('.modal[style*="display: flex"], .modal[style*="display: block"], .modal.active, .modal.show');
            if (openModal && openModal.id) return openModal.id;
            var overlay = document.getElementById('cm-grabber-overlay');
            if (overlay) return 'ExtensionInPageOverlay';
            return '';
        } catch (e) {
            return '';
        }
    }

    function cacheErrorLocally(payload) {
        try {
            var raw = localStorage.getItem('cm_cached_error_logs');
            var list = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(list)) list = [];
            list.unshift(payload);
            if (list.length > 50) list = list.slice(0, 50);
            localStorage.setItem('cm_cached_error_logs', JSON.stringify(list));
        } catch(e) {}
    }

    function showClientErrorToast(payload) {
        try {
            if (!navigator.onLine) return; // Never show error toasts when offline

            var rawMsg = (payload && payload.message) ? String(payload.message) : 'Unknown Error';
            var lowerMsg = rawMsg.toLowerCase();
            if (lowerMsg.includes('failed to fetch') ||
                lowerMsg.includes('networkerror') ||
                lowerMsg.includes('offline') ||
                lowerMsg.includes('network/fetch failed') ||
                lowerMsg.includes('530') ||
                lowerMsg.includes('tunnel') ||
                lowerMsg.includes('net::err_') ||
                lowerMsg.includes('load failed') ||
                lowerMsg.includes('sampark toot gaya')) {
                return; // Benign network disconnect - no error toast
            }

            var now = Date.now();
            if (now - lastToastTime < TOAST_THROTTLE_MS) return;
            lastToastTime = now;

            var shortMsg = rawMsg.length > 70 ? rawMsg.substring(0, 70) + '...' : rawMsg;
            var pageText = (payload && payload.activePage && payload.activePage !== 'unknown') ? `[${payload.activePage}] ` : '';

            var fullToastMsg = `⚠️ Error Detect Hua & Log Ho Gaya! ${pageText}${shortMsg} (Details auto-saved in logs)`;

            if (typeof window.showToast === 'function') {
                window.showToast(fullToastMsg, 'error', '🚨 Error Log Saved');
            } else {
                renderFloatingErrorPill(fullToastMsg);
            }
        } catch(e) {}
    }

    function renderFloatingErrorPill(msg) {
        try {
            var existing = document.getElementById('cm-error-fallback-toast');
            if (existing) existing.remove();
            var pill = document.createElement('div');
            pill.id = 'cm-error-fallback-toast';
            pill.style.cssText = 'position:fixed;bottom:24px;right:24px;background:linear-gradient(135deg,#b91c1c,#ef4444);color:#fff;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;z-index:999999;box-shadow:0 10px 30px rgba(0,0,0,0.6);display:flex;align-items:center;gap:10px;font-family:system-ui,-apple-system,sans-serif;border:1px solid rgba(255,255,255,0.3);';
            pill.innerHTML = `<span style="font-size:16px;">🚨</span><span>${msg}</span>`;
            document.body.appendChild(pill);
            setTimeout(function() { if (pill) pill.remove(); }, 4000);
        } catch(e) {}
    }

    function sendErrorToServer(payload) {
        try {
            if (!payload || !payload.message || isSending) return;

            // Ignore benign third-party or browser-internal noise
            var raw = String(payload.message || '');
            var rawLower = raw.toLowerCase();
            if (raw.includes('chrome-extension://') ||
                raw.includes('moz-extension://') ||
                raw.includes('favicon.ico') ||
                raw.includes('ERR_BLOCKED_BY_CLIENT')) {
                return;
            }

            // Suppress offline or normal network disconnection noise
            if (!navigator.onLine ||
                rawLower.includes('failed to fetch') ||
                rawLower.includes('networkerror') ||
                rawLower.includes('offline') ||
                rawLower.includes('network/fetch failed') ||
                rawLower.includes('530') ||
                rawLower.includes('tunnel') ||
                rawLower.includes('net::err_') ||
                rawLower.includes('load failed') ||
                rawLower.includes('sampark toot gaya')) {
                cacheErrorLocally(payload);
                return;
            }

            var key = [payload.type, payload.message, payload.filename, payload.lineno].join(':::');
            var now = Date.now();
            var prev = recentLogHashes.get(key);
            if (prev && (now - prev < DEDUP_MS)) {
                return; // Suppress duplicate spam
            }
            recentLogHashes.set(key, now);

            // Clean old dedup keys
            if (recentLogHashes.size > 100) {
                recentLogHashes.forEach(function(time, k) {
                    if (now - time > DEDUP_MS * 3) recentLogHashes.delete(k);
                });
            }

            payload.source = payload.source || 'Browser App';
            payload.url = payload.url || window.location.href;
            payload.activePage = payload.activePage || getActivePageName();
            payload.activeModal = payload.activeModal || getOpenModalName();
            payload.timestamp = new Date().toISOString();

            cacheErrorLocally(payload);

            var jsonBody = JSON.stringify(payload);
            var headers = { 'Content-Type': 'application/json' };
            var token = localStorage.getItem('token');
            if (token) headers['Authorization'] = 'Bearer ' + token;

            isSending = true;
            fetch('/api/logs/client-error', {
                method: 'POST',
                headers: headers,
                body: jsonBody,
                keepalive: true
            }).then(function(res) {
                isSending = false;
                return res.json();
            }).then(function(data) {
                if (data && data.success) {
                    showClientErrorToast(payload);
                }
            }).catch(function() {
                isSending = false;
                // Fallback to sendBeacon if fetch failed
                if (navigator.sendBeacon) {
                    try {
                        var blob = new Blob([jsonBody], { type: 'application/json' });
                        navigator.sendBeacon('/api/logs/client-error', blob);
                    } catch(e) {}
                }
            });
        } catch (err) {
            isSending = false;
        }
    }

    // 1. Uncaught Runtime Errors (Syntax, Reference, Type errors)
    window.addEventListener('error', function(event) {
        try {
            if (!event) return;
            var err = event.error || {};
            sendErrorToServer({
                type: 'uncaught_exception',
                message: event.message || err.message || 'Script error',
                filename: event.filename || '',
                lineno: event.lineno || 0,
                colno: event.colno || 0,
                stack: err.stack || ''
            });
        } catch (e) {}
    });

    // 2. Unhandled Promise Rejections (failed fetch, rejected async functions)
    window.addEventListener('unhandledrejection', function(event) {
        try {
            if (!event) return;
            var reason = event.reason;
            var message = 'Unhandled Promise Rejection';
            var stack = '';

            if (reason instanceof Error) {
                message = reason.message || message;
                stack = reason.stack || '';
            } else if (typeof reason === 'string') {
                message = reason;
            } else if (reason && typeof reason === 'object') {
                try { message = JSON.stringify(reason); } catch (e) { message = String(reason); }
            }

            sendErrorToServer({
                type: 'unhandled_rejection',
                message: message,
                stack: stack
            });
        } catch (e) {}
    });

    // 3. Proxy console.error to auto-intercept ANY console error
    var originalConsoleError = console.error;
    console.error = function() {
        try {
            var args = Array.prototype.slice.call(arguments);
            var parts = [];
            var stackTrace = '';

            for (var i = 0; i < args.length; i++) {
                var a = args[i];
                if (a instanceof Error) {
                    parts.push(a.message || String(a));
                    if (!stackTrace && a.stack) stackTrace = a.stack;
                } else if (typeof a === 'object') {
                    try { parts.push(JSON.stringify(a)); } catch (e) { parts.push(String(a)); }
                } else {
                    parts.push(String(a));
                }
            }

            var fullMsg = parts.join(' ');

            if (fullMsg.trim().length > 0) {
                if (!stackTrace) {
                    try { stackTrace = (new Error()).stack || ''; } catch (e) {}
                }
                sendErrorToServer({
                    type: 'console_error',
                    message: fullMsg,
                    stack: stackTrace
                });
            }
        } catch (e) {}

        if (originalConsoleError) {
            originalConsoleError.apply(console, arguments);
        }
    };

    // 4. Global helper for manual error reporting in try/catch blocks
    window.reportManualError = function(message, err, context) {
        try {
            sendErrorToServer({
                type: 'manual_report',
                message: message || (err && err.message) || 'Manual error report',
                stack: err && err.stack ? err.stack : (new Error()).stack,
                context: context || null
            });
        } catch (e) {}
    };

    // 5. Expose getters for inspection
    window.getCachedErrorLogs = function() {
        try {
            var raw = localStorage.getItem('cm_cached_error_logs');
            return raw ? JSON.parse(raw) : [];
        } catch(e) {
            return [];
        }
    };

    window.clearCachedErrorLogs = function() {
        try {
            localStorage.removeItem('cm_cached_error_logs');
        } catch(e) {}
    };

    // 6. Auto-sync offline error logs when network/server recovers
    function flushCachedErrors() {
        try {
            var raw = localStorage.getItem('cm_cached_error_logs');
            if (!raw) return;
            var list = JSON.parse(raw);
            if (!Array.isArray(list) || list.length === 0) return;

            var headers = { 'Content-Type': 'application/json' };
            var token = localStorage.getItem('token');
            if (token) headers['Authorization'] = 'Bearer ' + token;

            fetch('/api/logs/client-error', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(list)
            }).then(function(res) {
                if (res.ok) {
                    localStorage.removeItem('cm_cached_error_logs');
                    console.log('✅ [ErrorLogger] Synced ' + list.length + ' offline error log(s) to server');
                }
            }).catch(function() {});
        } catch(e) {}
    }

    window.addEventListener('online', flushCachedErrors);
    setTimeout(flushCachedErrors, 5000);
    setInterval(flushCachedErrors, 30000);

    console.log('🛡️ [Cash Management] Auto error telemetry active. All errors will auto-log with toast notification.');
})();
