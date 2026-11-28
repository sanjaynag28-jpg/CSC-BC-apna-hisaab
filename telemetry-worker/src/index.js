/**
 * CSC & BC Apna Hisaab — Cloudflare Worker + D1 Fleet & Error Telemetry API
 *
 * Security model:
 *   - Write endpoints (/api/ingest/*) validate X-Ingest-Key against env.INGEST_TOKEN
 *     (clients can ONLY write their own HWID heartbeat/errors; zero read access!).
 *   - Admin endpoints (/api/admin/*) validate X-Admin-Key / Bearer against env.ADMIN_KEY.
 *   - Built-in standalone Fleet Dashboard HTML at GET / (prompts for ADMIN_KEY).
 */

function jsonResponse(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Ingest-Key, X-Admin-Key, Authorization',
            ...extraHeaders
        }
    });
}

function timingSafeEqualStr(a, b) {
    const sa = String(a || '');
    const sb = String(b || '');
    if (!sa || !sb || sa.length !== sb.length) return false;
    let diff = 0;
    for (let i = 0; i < sa.length; i++) {
        diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
    }
    return diff === 0;
}

function isIngestAuthorized(request, env) {
    const token = request.headers.get('X-Ingest-Key') || '';
    return Boolean(env.INGEST_TOKEN && timingSafeEqualStr(token, env.INGEST_TOKEN));
}

function isAdminAuthorized(request, env) {
    const hdrKey = request.headers.get('X-Admin-Key') || '';
    const auth = request.headers.get('Authorization') || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const key = hdrKey || bearer;
    return Boolean(env.ADMIN_KEY && timingSafeEqualStr(key, env.ADMIN_KEY));
}

function clip(val, maxLen = 250) {
    if (val === undefined || val === null) return '';
    return String(val).trim().slice(0, maxLen);
}

async function readJsonSafe(request, maxBytes = 65536) {
    const text = await request.text();
    if (text.length > maxBytes) {
        const err = new Error('Payload too large');
        err.status = 413;
        throw err;
    }
    try {
        return text ? JSON.parse(text) : {};
    } catch (_) {
        const err = new Error('Invalid JSON payload');
        err.status = 400;
        throw err;
    }
}

async function pruneOldErrors(db) {
    try {
        // Keep last 30 days & max ~5000 error rows so D1 Free Tier stays spotless
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        await db.prepare('DELETE FROM error_logs WHERE last_seen_at < ?').bind(cutoff).run();
        await db.prepare(`
            DELETE FROM error_logs
            WHERE id NOT IN (SELECT id FROM error_logs ORDER BY last_seen_at DESC LIMIT 5000)
        `).run();
    } catch (_) { }
}

async function handleHeartbeat(request, env) {
    if (!isIngestAuthorized(request, env)) {
        return jsonResponse({ success: false, error: 'Unauthorized ingest key' }, 401);
    }
    const body = await readJsonSafe(request);
    const hwid = clip(body.hwid, 80);
    if (!hwid || !/^HWID-[A-Z0-9-]+$/i.test(hwid)) {
        return jsonResponse({ success: false, error: 'Valid hwid required' }, 400);
    }

    const now = new Date().toISOString();
    const country = clip(request.cf && request.cf.country ? request.cf.country : '', 12);
    const port = Math.max(1, Math.min(65535, Number(body.port) || 4000));
    const uptime = Math.max(0, Number(body.uptimeSeconds) || 0);

    await env.DB.prepare(`
        INSERT INTO devices (
            hwid, shop_name, owner_name, csp_code, hostname, windows_user,
            os_version, arch, node_version, app_version, port,
            autostart_status, last_update_status, uptime_seconds, country,
            first_seen_at, last_seen_at, total_heartbeats
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(hwid) DO UPDATE SET
            shop_name = CASE WHEN excluded.shop_name <> '' THEN excluded.shop_name ELSE devices.shop_name END,
            owner_name = CASE WHEN excluded.owner_name <> '' THEN excluded.owner_name ELSE devices.owner_name END,
            csp_code = CASE WHEN excluded.csp_code <> '' THEN excluded.csp_code ELSE devices.csp_code END,
            hostname = excluded.hostname,
            windows_user = excluded.windows_user,
            os_version = excluded.os_version,
            arch = excluded.arch,
            node_version = excluded.node_version,
            app_version = excluded.app_version,
            port = excluded.port,
            autostart_status = excluded.autostart_status,
            last_update_status = CASE WHEN excluded.last_update_status <> '' THEN excluded.last_update_status ELSE devices.last_update_status END,
            uptime_seconds = excluded.uptime_seconds,
            country = excluded.country,
            last_seen_at = excluded.last_seen_at,
            total_heartbeats = devices.total_heartbeats + 1
    `).bind(
        hwid,
        clip(body.shopName, 160),
        clip(body.ownerName, 120),
        clip(body.cspCode, 80),
        clip(body.hostname, 120),
        clip(body.windowsUser, 120),
        clip(body.osVersion, 120),
        clip(body.arch, 32),
        clip(body.nodeVersion, 40),
        clip(body.appVersion, 40) || '0.0.0',
        port,
        clip(body.autostartStatus, 240),
        clip(body.lastUpdateStatus, 180),
        uptime,
        country,
        now,
        now
    ).run();

    return jsonResponse({ success: true, hwid, recordedAt: now });
}

async function handleIngestErrors(request, env, ctx) {
    if (!isIngestAuthorized(request, env)) {
        return jsonResponse({ success: false, error: 'Unauthorized ingest key' }, 401);
    }
    const body = await readJsonSafe(request);
    const items = Array.isArray(body.errors) ? body.errors.slice(0, 25) : [body];
    const now = new Date().toISOString();
    const dedupCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    let recorded = 0;
    for (const raw of items) {
        if (!raw) continue;
        const hwid = clip(raw.hwid || body.hwid, 80);
        const message = clip(raw.message, 1500);
        if (!hwid || !/^HWID-[A-Z0-9-]+$/i.test(hwid) || !message) continue;

        const shopName = clip(raw.shopName || body.shopName, 160);
        const appVersion = clip(raw.appVersion || body.appVersion, 40);
        const source = clip(raw.source || 'server', 60);
        const errorType = clip(raw.errorType || raw.type || 'error', 80);
        const stack = clip(raw.stack, 4000);
        const pageUrl = clip(raw.url || raw.pageUrl, 400);

        // Deduplicate identical unresolved error within 10 minutes
        const existing = await env.DB.prepare(`
            SELECT id FROM error_logs
            WHERE hwid = ? AND source = ? AND error_type = ? AND message = ? AND resolved = 0 AND last_seen_at >= ?
            ORDER BY id DESC LIMIT 1
        `).bind(hwid, source, errorType, message, dedupCutoff).first();

        if (existing && existing.id) {
            await env.DB.prepare(`
                UPDATE error_logs SET count = count + 1, last_seen_at = ?, app_version = COALESCE(NULLIF(?, ''), app_version) WHERE id = ?
            `).bind(now, appVersion, existing.id).run();
        } else {
            await env.DB.prepare(`
                INSERT INTO error_logs (hwid, shop_name, app_version, source, error_type, message, stack, page_url, count, resolved, created_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
            `).bind(hwid, shopName, appVersion, source, errorType, message, stack, pageUrl, now, now).run();
        }

        // Ensure device row exists & update last_error summary
        await env.DB.prepare(`
            INSERT INTO devices (hwid, shop_name, app_version, first_seen_at, last_seen_at, total_heartbeats, error_count, last_error_at, last_error_msg)
            VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)
            ON CONFLICT(hwid) DO UPDATE SET
                error_count = devices.error_count + 1,
                last_error_at = excluded.last_error_at,
                last_error_msg = excluded.last_error_msg,
                shop_name = CASE WHEN excluded.shop_name <> '' THEN excluded.shop_name ELSE devices.shop_name END,
                app_version = CASE WHEN excluded.app_version <> '' THEN excluded.app_version ELSE devices.app_version END
        `).bind(hwid, shopName, appVersion, now, now, now, clip(message, 250)).run();

        recorded++;
    }

    if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(pruneOldErrors(env.DB));
    }

    return jsonResponse({ success: true, recorded });
}

async function handleAdminFleet(request, env) {
    if (!isAdminAuthorized(request, env)) {
        return jsonResponse({ success: false, error: 'Invalid Admin Key' }, 403);
    }

    const url = new URL(request.url);
    const search = (url.searchParams.get('q') || '').trim().toLowerCase();
    const versionFilter = (url.searchParams.get('version') || '').trim();

    const nowMs = Date.now();
    const onlineCutoffIso = new Date(nowMs - 35 * 60 * 1000).toISOString();
    const todayCutoffIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

    const { results: allDevices } = await env.DB.prepare(`
        SELECT * FROM devices ORDER BY last_seen_at DESC LIMIT 1000
    `).all();

    const devAgg = await env.DB.prepare(`
        SELECT
            COUNT(*) AS totalDevices,
            COALESCE(SUM(CASE WHEN last_seen_at >= ? THEN 1 ELSE 0 END), 0) AS onlineNow,
            COALESCE(SUM(CASE WHEN last_seen_at >= ? THEN 1 ELSE 0 END), 0) AS activeToday
        FROM devices
    `).bind(onlineCutoffIso, todayCutoffIso).first();

    const { results: verRows } = await env.DB.prepare(`
        SELECT COALESCE(NULLIF(app_version, ''), 'unknown') AS ver, COUNT(*) AS cnt FROM devices GROUP BY ver
    `).all();
    const versionBreakdown = {};
    if (verRows && verRows.length && 'ver' in verRows[0]) {
        for (const r of verRows) versionBreakdown[r.ver] = Number(r.cnt || 0);
    } else {
        for (const d of allDevices) {
            const v = d.app_version || 'unknown';
            versionBreakdown[v] = (versionBreakdown[v] || 0) + 1;
        }
    }

    const { results: portRows } = await env.DB.prepare(`
        SELECT COALESCE(port, 4000) AS p, COUNT(*) AS cnt FROM devices GROUP BY p
    `).all();
    const portBreakdown = {};
    if (portRows && portRows.length && 'p' in portRows[0]) {
        for (const r of portRows) portBreakdown[String(r.p)] = Number(r.cnt || 0);
    } else {
        for (const d of allDevices) {
            const p = String(d.port || 4000);
            portBreakdown[p] = (portBreakdown[p] || 0) + 1;
        }
    }

    let totalDevices = devAgg && 'totalDevices' in devAgg ? Number(devAgg.totalDevices || 0) : allDevices.length;
    let onlineNow = devAgg && 'onlineNow' in devAgg ? Number(devAgg.onlineNow || 0) : 0;
    let activeToday = devAgg && 'activeToday' in devAgg ? Number(devAgg.activeToday || 0) : 0;
    if (!devAgg) {
        const onlineMs = nowMs - 35 * 60 * 1000;
        const todayMs = nowMs - 24 * 60 * 60 * 1000;
        for (const d of allDevices) {
            const ts = Date.parse(d.last_seen_at || '');
            if (!Number.isNaN(ts)) {
                if (ts >= onlineMs) onlineNow++;
                if (ts >= todayMs) activeToday++;
            }
        }
    }

    const filteredDevices = allDevices.filter((d) => {
        if (versionFilter && d.app_version !== versionFilter) return false;
        if (search) {
            const hay = `${d.hwid} ${d.shop_name} ${d.owner_name} ${d.hostname} ${d.windows_user} ${d.csp_code}`.toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });

    const errAgg = await env.DB.prepare(`
        SELECT
            COALESCE(SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END), 0) AS unresolvedErrors,
            COALESCE(SUM(CASE WHEN last_seen_at >= ? THEN count ELSE 0 END), 0) AS errorsToday
        FROM error_logs
    `).bind(todayCutoffIso).first();

    const { results: recentErrors } = await env.DB.prepare(`
        SELECT * FROM error_logs ORDER BY last_seen_at DESC LIMIT 200
    `).all();

    let unresolvedErrors = errAgg && 'unresolvedErrors' in errAgg ? Number(errAgg.unresolvedErrors || 0) : 0;
    let errorsToday = errAgg && 'errorsToday' in errAgg ? Number(errAgg.errorsToday || 0) : 0;
    if (!errAgg) {
        const todayMs = nowMs - 24 * 60 * 60 * 1000;
        for (const e of recentErrors) {
            if (!e.resolved) unresolvedErrors++;
            const ets = Date.parse(e.last_seen_at || '');
            if (!Number.isNaN(ets) && ets >= todayMs) errorsToday += Number(e.count || 1);
        }
    }

    return jsonResponse({
        success: true,
        summary: {
            totalDevices,
            onlineNow,
            activeToday,
            offlineOver24h: Math.max(0, totalDevices - activeToday),
            versionBreakdown,
            portBreakdown,
            unresolvedErrors,
            errorsToday
        },
        devices: filteredDevices,
        recentErrors
    });
}

async function handleDeviceDetail(request, env, hwid) {
    if (!isAdminAuthorized(request, env)) {
        return jsonResponse({ success: false, error: 'Invalid Admin Key' }, 403);
    }
    let decodedHwid = '';
    try {
        decodedHwid = decodeURIComponent(hwid || '');
    } catch (_) {
        return jsonResponse({ success: false, error: 'Invalid HWID encoding' }, 400);
    }
    const cleanHwid = clip(decodedHwid, 80);
    const device = await env.DB.prepare('SELECT * FROM devices WHERE hwid = ?').bind(cleanHwid).first();
    if (!device) {
        return jsonResponse({ success: false, error: 'Device not found' }, 404);
    }
    const { results: errors } = await env.DB.prepare(`
        SELECT * FROM error_logs WHERE hwid = ? ORDER BY last_seen_at DESC LIMIT 100
    `).bind(cleanHwid).all();
    return jsonResponse({ success: true, device, errors });
}

async function handleResolveError(request, env, errorId) {
    if (!isAdminAuthorized(request, env)) {
        return jsonResponse({ success: false, error: 'Invalid Admin Key' }, 403);
    }
    const idNum = Number(errorId);
    if (!Number.isInteger(idNum) || idNum <= 0) {
        return jsonResponse({ success: false, error: 'Invalid error id' }, 400);
    }
    const body = await readJsonSafe(request).catch(() => ({}));
    const resolvedVal = body.resolved === false ? 0 : 1;
    await env.DB.prepare('UPDATE error_logs SET resolved = ? WHERE id = ?').bind(resolvedVal, idNum).run();
    return jsonResponse({ success: true, id: idNum, resolved: resolvedVal });
}

async function handleClearErrors(request, env) {
    if (!isAdminAuthorized(request, env)) {
        return jsonResponse({ success: false, error: 'Invalid Admin Key' }, 403);
    }
    const body = await readJsonSafe(request).catch(() => ({}));
    if (body.hwid) {
        const cleanHwid = clip(body.hwid, 80);
        await env.DB.prepare('DELETE FROM error_logs WHERE hwid = ?').bind(cleanHwid).run();
        await env.DB.prepare('UPDATE devices SET error_count = 0, last_error_at = NULL, last_error_msg = NULL WHERE hwid = ?').bind(cleanHwid).run();
    } else if (body.onlyResolved) {
        await env.DB.prepare('DELETE FROM error_logs WHERE resolved = 1').run();
    } else {
        await env.DB.prepare('DELETE FROM error_logs').run();
        await env.DB.prepare('UPDATE devices SET error_count = 0, last_error_at = NULL, last_error_msg = NULL').run();
    }
    return jsonResponse({ success: true });
}

function renderStandaloneDashboard() {
    return `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>HisaabBC — Master PC Fleet &amp; Error Monitor</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",system-ui,sans-serif;background:#070d19;color:#e2e8f0;padding:18px}
.wrap{max-width:1280px;margin:0 auto}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px;padding:16px 20px;background:#0f172a;border:1px solid #1e293b;border-radius:14px}
h1{font-size:20px;color:#34d399}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
input{background:#020617;border:1px solid #334155;color:#f8fafc;padding:9px 12px;border-radius:9px;font-size:13px}
button{background:linear-gradient(135deg,#059669,#0284c7);color:#fff;border:0;padding:9px 16px;border-radius:9px;font-weight:700;cursor:pointer}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:12px;margin-bottom:18px}
.card{background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:14px 16px}
.card small{color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.6px}
.card b{display:block;font-size:26px;margin-top:4px;color:#f8fafc}
.box{background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:16px;overflow-x:auto;margin-bottom:18px}
table{width:100%;border-collapse:collapse;font-size:12.5px;text-align:left}
th,td{padding:10px 12px;border-bottom:1px solid #1e293b}
th{color:#94a3b8;font-size:11px;text-transform:uppercase}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700}
.on{background:rgba(16,185,129,.16);color:#34d399}
.off{background:rgba(148,163,184,.16);color:#94a3b8}
.err{background:rgba(239,68,68,.16);color:#f87171}
pre{background:#020617;padding:8px;border-radius:8px;max-height:140px;overflow:auto;font-size:11px;color:#cbd5e1;margin-top:6px;white-space:pre-wrap}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div><h1>CSC &amp; BC Apna Hisaab — Master Fleet Monitor</h1><small style="color:#94a3b8">Cloudflare Worker + D1 Live Telemetry</small></div>
    <div class="row">
      <input type="password" id="admKey" placeholder="Admin Key dalein...">
      <input type="text" id="q" placeholder="Shop / HWID search...">
      <button onclick="loadFleet()">Refresh Live</button>
    </div>
  </div>
  <div class="cards" id="cards"></div>
  <div class="box"><h3 style="margin-bottom:10px">Sabhi Installed PCs (<span id="devCnt">0</span>)</h3>
    <table><thead><tr><th>Status</th><th>Shop / Owner</th><th>HWID</th><th>PC / User</th><th>Version</th><th>Port</th><th>Last Seen</th><th>Errors</th></tr></thead><tbody id="devBody"></tbody></table>
  </div>
  <div class="box"><h3 style="margin-bottom:10px">Recent Error Logs</h3><div id="errList"></div></div>
</div>
<script>
const kEl=document.getElementById('admKey');
kEl.value=sessionStorage.getItem('cmbc_fleet_key')||'';
function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
async function loadFleet(){
  const key=kEl.value.trim(); if(!key){alert('Admin Key dalein');return;}
  sessionStorage.setItem('cmbc_fleet_key',key);
  const q=encodeURIComponent(document.getElementById('q').value||'');
  const r=await fetch('/api/admin/fleet?q='+q,{headers:{'X-Admin-Key':key}});
  const d=await r.json();
  if(!r.ok||!d.success){alert(d.error||'Error');return;}
  const s=d.summary;
  const verTxt=Object.entries(s.versionBreakdown||{}).map(([k,v])=>'v'+esc(k)+': '+Number(v||0)).join(' | ');
  document.getElementById('cards').innerHTML=
    '<div class="card"><small>Total PCs</small><b>'+Number(s.totalDevices||0)+'</b></div>'+
    '<div class="card"><small>Online Now (35m)</small><b style="color:#34d399">'+Number(s.onlineNow||0)+'</b></div>'+
    '<div class="card"><small>Active Today</small><b style="color:#38bdf8">'+Number(s.activeToday||0)+'</b></div>'+
    '<div class="card"><small>Errors Today</small><b style="color:#f87171">'+Number(s.errorsToday||0)+'</b></div>'+
    '<div class="card" style="grid-column:span 2"><small>Versions</small><div style="margin-top:8px;font-weight:700;color:#cbd5e1">'+(verTxt||'-')+'</div></div>';
  document.getElementById('devCnt').textContent=d.devices.length;
  const now=Date.now();
  document.getElementById('devBody').innerHTML=d.devices.map(x=>{
    const ago=Math.max(0,Math.round((now-Date.parse(x.last_seen_at||''))/60000));
    const online=ago<=35;
    return '<tr><td><span class="pill '+(online?'on':'off')+'">'+(online?'ONLINE':'OFFLINE')+'</span></td>'+
      '<td><b>'+esc(x.shop_name||'Unknown Shop')+'</b><br><small style="color:#94a3b8">'+esc(x.owner_name||'')+'</small></td>'+
      '<td style="font-family:monospace">'+esc(x.hwid)+'</td>'+
      '<td>'+esc(x.hostname||'')+' / '+esc(x.windows_user||'')+'<br><small style="color:#64748b">'+esc(x.node_version||'')+'</small></td>'+
      '<td><span class="pill on">v'+esc(x.app_version||'?')+'</span></td>'+
      '<td>'+Number(x.port||4000)+'</td>'+
      '<td>'+(Number.isFinite(ago)?(ago<60?ago+'m ago':Math.round(ago/60)+'h ago'):'-')+'</td>'+
      '<td>'+(x.error_count>0?'<span class="pill err">'+Number(x.error_count)+'</span>':'0')+'</td></tr>';
  }).join('');
  document.getElementById('errList').innerHTML=(d.recentErrors||[]).slice(0,50).map(e=>
    '<div style="padding:10px;border-bottom:1px solid #1e293b"><b>['+esc(e.source)+'] '+esc(e.shop_name||e.hwid)+' (v'+esc(e.app_version||'?')+') x'+Number(e.count||1)+'</b> — <span style="color:#fca5a5">'+esc(e.message)+'</span>'+(e.stack?'<pre>'+esc(e.stack)+'</pre>':'')+'</div>'
  ).join('')||'<p style="color:#94a3b8">Koi error nahi!</p>';
}
if(kEl.value) loadFleet();
</script>
</body></html>`;
}

export default {
    async fetch(request, env, ctx) {
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, X-Ingest-Key, X-Admin-Key, Authorization'
                }
            });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            if (path === '/api/health') {
                return jsonResponse({ success: true, service: 'cmbc-telemetry-worker', timestamp: new Date().toISOString() });
            }
            if (path === '/api/ingest/heartbeat' && request.method === 'POST') {
                return await handleHeartbeat(request, env);
            }
            if (path === '/api/ingest/errors' && request.method === 'POST') {
                return await handleIngestErrors(request, env, ctx);
            }
            if (path === '/api/admin/fleet' && request.method === 'GET') {
                return await handleAdminFleet(request, env);
            }
            if (path.startsWith('/api/admin/device/') && request.method === 'GET') {
                return await handleDeviceDetail(request, env, path.slice('/api/admin/device/'.length));
            }
            if (path.startsWith('/api/admin/errors/') && path.endsWith('/resolve') && request.method === 'POST') {
                const errId = path.slice('/api/admin/errors/'.length, -'/resolve'.length);
                return await handleResolveError(request, env, errId);
            }
            if (path === '/api/admin/errors/clear' && request.method === 'POST') {
                return await handleClearErrors(request, env);
            }
            if (path === '/' || path === '/dashboard') {
                return new Response(renderStandaloneDashboard(), {
                    status: 200,
                    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
                });
            }
            return jsonResponse({ success: false, error: 'Route not found' }, 404);
        } catch (err) {
            return jsonResponse({ success: false, error: err.message || 'Worker error' }, err.status || 500);
        }
    }
};
