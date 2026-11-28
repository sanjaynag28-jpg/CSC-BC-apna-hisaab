-- ============================================================================
-- CSC & BC Apna Hisaab — Cloudflare D1 Fleet Monitor & Error Telemetry Schema
-- Zero-cost serverless storage for PC count, app versions & error diagnostics
-- ============================================================================

CREATE TABLE IF NOT EXISTS devices (
    hwid TEXT PRIMARY KEY,
    shop_name TEXT DEFAULT '',
    owner_name TEXT DEFAULT '',
    csp_code TEXT DEFAULT '',
    hostname TEXT DEFAULT '',
    windows_user TEXT DEFAULT '',
    os_version TEXT DEFAULT '',
    arch TEXT DEFAULT '',
    node_version TEXT DEFAULT '',
    app_version TEXT DEFAULT '0.0.0',
    port INTEGER DEFAULT 4000,
    autostart_status TEXT DEFAULT '',
    last_update_status TEXT DEFAULT '',
    uptime_seconds INTEGER DEFAULT 0,
    country TEXT DEFAULT '',
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    total_heartbeats INTEGER DEFAULT 1,
    error_count INTEGER DEFAULT 0,
    last_error_at TEXT DEFAULT '',
    last_error_msg TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_devices_version ON devices(app_version);

CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hwid TEXT NOT NULL,
    shop_name TEXT DEFAULT '',
    app_version TEXT DEFAULT '',
    source TEXT DEFAULT 'server',
    error_type TEXT DEFAULT 'error',
    message TEXT NOT NULL,
    stack TEXT DEFAULT '',
    page_url TEXT DEFAULT '',
    count INTEGER DEFAULT 1,
    resolved INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_errors_hwid_last ON error_logs(hwid, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_errors_last_seen ON error_logs(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_errors_dedup ON error_logs(hwid, source, error_type, resolved, last_seen_at DESC);
