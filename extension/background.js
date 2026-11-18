// ============================================================================
// 💰 CASH MANAGEMENT BC - BACKGROUND SERVICE WORKER
// Zero-Touch Auto-Update (self-reload) + Communication Controller
// ----------------------------------------------------------------------------
// USER KO HAMESHA "Load unpacked" / "Reload" MANUALLY KARNE KI ZAROORAT NAHI.
// Koi bhi extension file change hoti hai -> server ka buildId badalta hai ->
// ye worker detect karta hai -> apne aap chrome.runtime.reload() karta hai ->
// aur reload ke baad khud ke open portal tabs me content script dobara inject
// kar deta hai (page refresh ki bhi zarurat nahi).
// ============================================================================

const API_SERVERS = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const UPDATE_ALARM = 'cm-extension-update-check';
const BUILD_KEY = 'cm_ext_build_id';
const PENDING_REINJECT_KEY = 'cm_pending_reinject';

let isCheckingUpdate = false;

// Pages jahan content script dobara inject karna hai (reload ke baad)
const REINJECT_URL_PATTERNS = [
    '<all_urls>'
];

// Fire-and-forget helper: never leaves an unhandled promise rejection behind
function fireAndForget(promise) {
    try {
        if (promise && typeof promise.catch === 'function') {
            promise.catch(() => { });
        }
    } catch (e) { }
}

// Auto Error Telemetry for Background Service Worker
self.addEventListener('error', (event) => {
    try {
        fetch('http://localhost:3000/api/logs/client-error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source: 'Chrome Extension (background.js)',
                type: 'worker_error',
                message: event.message || (event.error && event.error.message) || 'Service Worker Error',
                filename: event.filename || 'background.js',
                lineno: event.lineno || 0,
                colno: event.colno || 0,
                stack: event.error ? event.error.stack : ''
            })
        }).catch(() => { });
    } catch (e) { }
});

// 1. Intelligent Extension Hot-Reload & Auto-Update Engine
async function checkForExtensionUpdates() {
    if (isCheckingUpdate) return;
    isCheckingUpdate = true;

    try {
        for (const host of API_SERVERS) {
            try {
                const res = await fetch(`${host}/api/extension/version`, {
                    cache: 'no-store',
                    headers: { 'Cache-Control': 'no-cache' }
                });
                if (!res.ok) continue;

                const data = await res.json();
                if (!data || !data.buildId) continue;

                const stored = await chrome.storage.local.get([BUILD_KEY]);
                const localBuild = stored[BUILD_KEY];

                if (!localBuild) {
                    // Pehli baar: sirf yaad rakho (reload ki zarurat nahi)
                    await chrome.storage.local.set({ [BUILD_KEY]: data.buildId });
                } else if (String(data.buildId) !== String(localBuild)) {
                    console.log('🔄 [Cash Management] Extension update detected (' + localBuild + ' -> ' + data.buildId + '). Auto-reloading...');
                    // Pehle open tabs me toast dikhao (reload ke baad bhi clickable rahega)
                    await notifyTabsOfUpdate();
                    // Pehle flag set karo - naye service worker me isse pata chalega
                    // ki open tabs me content script dobara inject karna hai.
                    await chrome.storage.local.set({
                        [BUILD_KEY]: data.buildId,
                        [PENDING_REINJECT_KEY]: true
                    });
                    // Silently reload the extension in Chrome without user intervention!
                    chrome.runtime.reload();
                    return;
                }
                break;
            } catch (errHost) {
                // Try next host
            }
        }
    } catch (e) {
        // Local server temporarily offline, ignore
    } finally {
        isCheckingUpdate = false;
    }
}

// 2. Browser me loaded extension ki identity check.
//    NOTE: MV3 service worker apni hi extension files fetch nahi kar sakta
//    (chrome.runtime.getURL(...) ka fetch "Failed to fetch" deta hai), isliye
//    build identity manifest.json ke "version" se nikalti hai. Server code
//    badalne par manifest version auto-bump karta hai, isliye dono ka compare
//    karke pata chalta hai ki browser me stale copy hai ya nahi.
function getLocalVersion() {
    try {
        return (chrome.runtime.getManifest() || {}).version || null;
    } catch (e) {
        return null;
    }
}

// 3. Open portal tabs me "extension updated" toast dikhao.
//    NOTE: world:'MAIN' me inject karte hain - extension reload ke baad
//    content script ka isolated world invalid ho jata hai, uska button dead
//    ho jayega. Main world ka toast reload ke baad bhi chalta rehta hai.
async function notifyTabsOfUpdate() {
    let tabs = [];
    try {
        tabs = await chrome.tabs.query({ url: REINJECT_URL_PATTERNS });
    } catch (e) { return 0; }

    let done = 0;
    for (const tab of tabs) {
        if (!tab || !tab.id) continue;
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: 'MAIN',
                func: () => {
                    try {
                        const old = document.getElementById('cm-update-toast');
                        if (old) old.remove();
                        const wrap = document.createElement('div');
                        wrap.id = 'cm-update-toast';
                        wrap.innerHTML =
                            '<div style="position:fixed;bottom:78px;right:24px;z-index:2147483641;display:flex;align-items:center;gap:10px;' +
                            'background:linear-gradient(135deg,#065f46,#047857);color:#fff;padding:11px 16px;border-radius:12px;' +
                            'box-shadow:0 10px 28px rgba(4,120,87,.45);font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;' +
                            'font-size:13px;font-weight:700;max-width:340px;border:2px solid rgba(255,255,255,.25)">' +
                            '<span style="font-size:16px;">&#128260;</span>' +
                            '<span>Extension update ho gaya! Naye features ke liye page refresh karein.</span>' +
                            '<button id="cm-toast-refresh" style="background:rgba(0,0,0,.28);border:none;color:#fff;padding:5px 11px;' +
                            'border-radius:7px;font-size:12px;font-weight:800;cursor:pointer">Refresh</button>' +
                            '<button id="cm-toast-close" style="background:transparent;border:none;color:#fff;opacity:.75;font-size:15px;' +
                            'cursor:pointer;padding:0 2px">&#10005;</button></div>';
                        document.body.appendChild(wrap);
                        const btn = document.getElementById('cm-toast-refresh');
                        if (btn) btn.onclick = () => location.reload();
                        const x = document.getElementById('cm-toast-close');
                        if (x) x.onclick = () => wrap.remove();
                        setTimeout(() => { try { wrap.remove(); } catch (e) { } }, 60000);
                    } catch (e) { }
                }
            });
            done++;
        } catch (e) {
            // Tab band hai ya host allowed nahi
        }
    }
    return done;
}

// 4. Reload ke baad khud ke open portal tabs me content script dobara inject karo,
//    taaki user ko page refresh bhi na karna pade.
async function reinjectIntoOpenTabs() {
    let tabs = [];
    try {
        tabs = await chrome.tabs.query({ url: REINJECT_URL_PATTERNS });
    } catch (e) {
        try {
            const all = await chrome.tabs.query({});
            tabs = all.filter(t => t.url && REINJECT_URL_PATTERNS.some(p => {
                const rx = new RegExp('^' + p.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
                return rx.test(t.url);
            }));
        } catch (e2) { return 0; }
    }

    let done = 0;
    for (const tab of tabs) {
        if (!tab || !tab.id) continue;
        try {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
            done++;
        } catch (e) {
            // Tab band ho chuka hai ya host allowed nahi - skip
        }
    }
    if (done) console.log('♻️ [Cash Management] Content script re-injected into ' + done + ' tab(s).');
    return done;
}

// 3. Naye service worker ke start me pending re-inject complete karo.
async function handleStartupReinjection() {
    try {
        const stored = await chrome.storage.local.get([PENDING_REINJECT_KEY]);
        if (!stored[PENDING_REINJECT_KEY]) return;
        await reinjectIntoOpenTabs();
        await chrome.storage.local.set({ [PENDING_REINJECT_KEY]: false });
    } catch (e) { }
}

// 4. Scheduled background watcher.
//    NOTE: a Manifest V3 service worker is terminated when idle, so setInterval
//    does NOT keep it alive and the timer silently stops. chrome.alarms is the
//    supported way to schedule recurring work in an MV3 service worker.
function scheduleUpdateCheck() {
    try {
        fireAndForget(chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: 1 }));
    } catch (e) { }
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm && alarm.name === UPDATE_ALARM) {
        fireAndForget(checkForExtensionUpdates());
    }
});

scheduleUpdateCheck();
fireAndForget(checkForExtensionUpdates());
fireAndForget(handleStartupReinjection());

// 5. Tab switched / activated watcher
chrome.tabs.onActivated.addListener(() => {
    fireAndForget(checkForExtensionUpdates());
});

// ============================================================================
// LIVE AADHAAR MEMORY & SYNC CONTROLLER (Cross-Frame, Cross-Domain)
// ============================================================================
const recentAadhaarMemory = new Map();

async function getRecentFullAadhaar(last4) {
    if (!last4) return null;
    const l4 = (last4 === '__last__') ? '__last__' : String(last4).replace(/\D/g, '').slice(-4);

    // 1. Check in-memory map
    if (recentAadhaarMemory.has(l4)) {
        const rec = recentAadhaarMemory.get(l4);
        if (rec && rec.fullAadhaar && rec.fullAadhaar.length === 12 && (Date.now() - rec.time < 60 * 60 * 1000)) {
            return rec.fullAadhaar;
        }
    }

    // 2. Check chrome.storage.local
    try {
        const key = (l4 === '__last__') ? 'cm_last_typed_aadhaar' : ('cm_aadhaar_' + l4);
        const stored = await chrome.storage.local.get([key, 'cm_recent_aadhaars', 'cm_last_typed_aadhaar']);
        if (stored[key] && stored[key].fullAadhaar && stored[key].fullAadhaar.length === 12) {
            return stored[key].fullAadhaar;
        }
        if (Array.isArray(stored.cm_recent_aadhaars)) {
            if (l4 === '__last__' && stored.cm_recent_aadhaars.length > 0) {
                return stored.cm_recent_aadhaars[0].fullAadhaar;
            }
            const match = stored.cm_recent_aadhaars.find(item => item.last4 === l4);
            if (match && match.fullAadhaar && match.fullAadhaar.length === 12) {
                return match.fullAadhaar;
            }
        }
        if (stored.cm_last_typed_aadhaar && stored.cm_last_typed_aadhaar.fullAadhaar) {
            const lt = stored.cm_last_typed_aadhaar;
            if ((l4 === '__last__' || lt.last4 === l4) && (Date.now() - lt.time < 60 * 60 * 1000)) {
                return lt.fullAadhaar;
            }
        }
    } catch (_) {}

    return null;
}

// 6. Content script message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request) return false;

    if (request.action === 'RECORD_TYPED_AADHAAR' && request.fullAadhaar) {
        const digits = String(request.fullAadhaar).replace(/\D/g, '');
        if (digits.length === 12 && !/^0{12}$/.test(digits) && !/^(\d)\1{11}$/.test(digits)) {
            const last4 = digits.slice(-4);
            const record = {
                fullAadhaar: digits,
                last4: last4,
                time: Date.now(),
                origin: request.origin || ''
            };
            recentAadhaarMemory.set(last4, record);
            recentAadhaarMemory.set('__last__', record);

            chrome.storage.local.get(['cm_recent_aadhaars']).then(stored => {
                const list = Array.isArray(stored.cm_recent_aadhaars) ? stored.cm_recent_aadhaars : [];
                const oneHourAgo = Date.now() - 60 * 60 * 1000;
                const filtered = list.filter(item => item.last4 !== last4 && item.time > oneHourAgo);
                filtered.unshift(record);
                chrome.storage.local.set({
                    cm_recent_aadhaars: filtered.slice(0, 25),
                    ['cm_aadhaar_' + last4]: record,
                    cm_last_typed_aadhaar: record
                });
            }).catch(() => {});

            sendResponse({ success: true, recorded: true });
            return false;
        }
    }

    if (request.action === 'CHECK_UPDATE') {
        // Async response -> the channel must be kept open by returning true.
        checkForExtensionUpdates()
            .then(() => sendResponse({ success: true }))
            .catch(() => sendResponse({ success: false }));
        return true;
    }

    if (request.action === 'RELOAD_EXTENSION') {
        // Settings panel ka "Reload extension" button
        fireAndForget(
            (async () => {
                await notifyTabsOfUpdate();
                await chrome.storage.local.set({ [PENDING_REINJECT_KEY]: true });
                chrome.runtime.reload();
            })()
        );
        sendResponse({ success: true });
        return false;
    }

    if (request.action === 'SHOW_UPDATE_TOAST') {
        fireAndForget(notifyTabsOfUpdate());
        sendResponse({ success: true });
        return false;
    }

    if (request.action === 'GET_BUILD_INFO') {
        fireAndForget(
            (async () => {
                const stored = await chrome.storage.local.get([BUILD_KEY]);
                let serverBuild = null, serverVersion = null, serverPath = null, serverCodeHash = null;
                for (const host of API_SERVERS) {
                    try {
                        const r = await fetch(`${host}/api/extension/version`, { cache: 'no-store' });
                        if (r.ok) {
                            const d = await r.json();
                            serverBuild = d.buildId;
                            serverVersion = d.version;
                            serverCodeHash = d.codeHash;
                            serverPath = d.extPath;
                            break;
                        }
                    } catch (e) { }
                }
                const localVersion = getLocalVersion();
                const inSync = !!(serverVersion && localVersion && serverVersion === localVersion);
                if (!inSync && serverVersion) {
                    console.warn('⚠️ [Cash Management] Browser me loaded extension stale hai (local ' + localVersion +
                        ' vs server ' + serverVersion + '). Sahi folder load karein: ' + serverPath);
                }
                sendResponse({
                    success: true,
                    localBuild: stored[BUILD_KEY] || null,
                    serverBuild: serverBuild,
                    localVersion: localVersion,
                    serverVersion: serverVersion,
                    serverCodeHash: serverCodeHash,
                    serverPath: serverPath,
                    inSync: inSync,
                    manifestVersion: localVersion
                });
            })()
        );
        return true;
    }

    if (request.action === 'PROXY_API') {
        fireAndForget(
            (async () => {
                const path = request.path || '';
                const method = request.method || 'GET';
                const body = request.body ? JSON.stringify(request.body) : undefined;
                const headers = Object.assign({ 'Content-Type': 'application/json' }, request.headers || {});

                // Read custom remote server URL & shop API token if configured
                const cfg = await chrome.storage.local.get(['cm_server_url', 'cm_api_token']);
                if (cfg && cfg.cm_api_token) {
                    headers['X-Api-Token'] = cfg.cm_api_token;
                }

                const serversToTry = [];
                if (cfg && cfg.cm_server_url) {
                    serversToTry.push(cfg.cm_server_url);
                }
                for (const h of API_SERVERS) {
                    if (!serversToTry.includes(h)) serversToTry.push(h);
                }

                let lastError = 'Server offline';
                for (const host of serversToTry) {
                    try {
                        const res = await fetch(`${host}${path}`, {
                            method,
                            headers,
                            body,
                            cache: 'no-store'
                        });
                        let data = null;
                        try {
                            data = await res.json();
                        } catch (e) {
                            data = null;
                        }
                        if (res.ok) {
                            sendResponse({ success: true, status: res.status, data: data });
                            return;
                        } else {
                            lastError = (data && data.error) ? data.error : `HTTP ${res.status}`;
                        }
                    } catch (e) {
                        lastError = e.message || 'Fetch failed';
                    }
                }
                sendResponse({ success: false, error: lastError });
            })()
        );
        return true;
    }

    if (request.action === 'OPEN_IN_PROJECT') {
        fireAndForget(
            (async () => {
                await openProjectTabWithPayload(request.payload);
                sendResponse({ success: true });
            })()
        );
        return true;
    }

    if (request.action === 'SWITCH_BACK_TO_PORTAL' && request.tabId) {
        try {
            chrome.tabs.update(request.tabId, { active: true });
            sendResponse({ success: true });
        } catch (e) {
            sendResponse({ success: false, error: e.message });
        }
        return false;
    }

    if (request.action === 'GET_GRABBER_MODE') {
        chrome.storage.local.get(['cm_grabber_mode']).then(res => {
            sendResponse({ success: true, mode: res.cm_grabber_mode || 'project_tab' });
        });
        return true;
    }

    if (request.action === 'SET_GRABBER_MODE' && request.mode) {
        chrome.storage.local.set({ cm_grabber_mode: request.mode }).then(() => {
            sendResponse({ success: true, mode: request.mode });
        });
        return true;
    }

    if (request.action === 'TRIGGER_EXT_ACTION') {
        const tabId = (sender && sender.tab) ? sender.tab.id : null;
        if (tabId) {
            fireAndForget(handleExtensionTrigger({ id: tabId }, !!request.forceInPage));
        }
        sendResponse({ success: true });
        return false;
    }

    return false;
});

// ============================================================================
// 7. TARIKA B: GRAB LIVE DATA & AUTO-SWITCH TO CASH MANAGEMENT PROJECT TAB
// ============================================================================
async function grabFromTab(portalTabId) {
    if (!portalTabId) return null;

    // 1. Try sending message to top frame first
    try {
        const res = await chrome.tabs.sendMessage(portalTabId, { action: "GRAB_FOR_PROJECT" });
        if (res && res.success && res.data && (res.data.RRN_UTR || res.data.AckNumber || res.data.Amount || res.data.TotalFee || res.data.BankName || res.data.CustomerName || res.data.ApplicantName)) {
            return res;
        }
    } catch (_) {}

    // 2. Multi-frame inspect (if receipt is inside an iframe/modal)
    try {
        const frameResults = await chrome.scripting.executeScript({
            target: { tabId: portalTabId, allFrames: true },
            func: () => {
                if (typeof window.__CM_DETECT_AND_GRAB__ === 'function') {
                    return window.__CM_DETECT_AND_GRAB__();
                }
                return null;
            }
        });

        if (Array.isArray(frameResults)) {
            // Find frame with full success
            for (const f of frameResults) {
                const r = f.result;
                if (r && r.success && r.data && (r.data.RRN_UTR || r.data.AckNumber || r.data.Amount || r.data.TotalFee || r.data.BankName || r.data.CustomerName || r.data.ApplicantName)) {
                    return r;
                }
            }
            // Fallback: any frame with minimal data
            for (const f of frameResults) {
                const r = f.result;
                if (r && r.data && (r.data.RRN_UTR || r.data.AckNumber || r.data.Amount || r.data.TotalFee)) {
                    return r;
                }
            }
        }
    } catch (_) {}

    // 3. Fallback: Re-inject content.js into all frames and retry
    try {
        await chrome.scripting.executeScript({
            target: { tabId: portalTabId, allFrames: true },
            files: ["content.js"]
        });
        await new Promise(r => setTimeout(r, 180));
        const res = await chrome.tabs.sendMessage(portalTabId, { action: "GRAB_FOR_PROJECT" });
        if (res && res.success) return res;
    } catch (_) {}

    return null;
}

async function grabAndOpenInProject(portalTabId) {
    if (!portalTabId) return;

    try {
        let res = await grabFromTab(portalTabId);

        if (!res || !res.success) {
            // Fallback to In-page modal if response failed
            await triggerGrabberOnTab(portalTabId);
            return;
        }

        // Auto-resolve full 12-digit Aadhaar from background memory / local storage if masked
        if (res.data) {
            const currentAadhDigits = String(res.data.Aadhaar || '').replace(/\D/g, '');
            if (currentAadhDigits.length !== 12) {
                const l4 = res.data.CustomerAadhaarLast4 || currentAadhDigits.slice(-4);
                let full = null;
                if (l4 && l4.length === 4) {
                    full = await getRecentFullAadhaar(l4);
                    if (!full) {
                        const lastCandidate = await getRecentFullAadhaar('__last__');
                        if (lastCandidate && String(lastCandidate).replace(/\D/g, '').slice(-4) === l4) {
                            full = lastCandidate;
                        }
                    }
                }
                if (full && full.length === 12) {
                    res.data.Aadhaar = full;
                    res.data.CustomerAadhaar = full;
                    res.data.CustomerAadhaarLast4 = full.slice(-4);
                }
            }
        }

        const payload = {
            type: res.type,
            data: res.data,
            returnTabId: portalTabId,
            pageUrl: res.pageUrl
        };

        await openProjectTabWithPayload(payload);
    } catch (err) {
        console.error('grabAndOpenInProject error:', err);
        await triggerGrabberOnTab(portalTabId);
    }
}

async function openProjectTabWithPayload(payload) {
    if (!payload) return;
    try {
        await chrome.storage.local.set({ cm_pending_grabber: payload });
    } catch (e) { }

    const cfg = await chrome.storage.local.get(['cm_server_url']);
    const targetBase = (cfg && cfg.cm_server_url) ? cfg.cm_server_url : 'http://localhost:3000';
    let targetHost = 'localhost:3000';
    try { targetHost = new URL(targetBase).host; } catch (e) { }

    // Find any existing project tab
    const allTabs = await chrome.tabs.query({});
    const projectTab = allTabs.find(t => t.url && (t.url.includes(targetHost) || t.url.includes('localhost:3000') || t.url.includes('127.0.0.1:3000')));

    if (projectTab && projectTab.id) {
        // Activate existing tab
        await chrome.tabs.update(projectTab.id, { active: true });
        if (projectTab.windowId) {
            try { await chrome.windows.update(projectTab.windowId, { focused: true }); } catch (e) { }
        }

        // Deliver payload via MAIN world script injection (100% reliable, direct in-page execution)
        setTimeout(async () => {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: projectTab.id },
                    world: 'MAIN',
                    func: (p) => {
                        try {
                            localStorage.setItem('cm_pending_grabber', JSON.stringify(p));
                        } catch (_) {}
                        if (typeof window.handleExtensionGrabbedEntry === 'function') {
                            window.handleExtensionGrabbedEntry(p);
                        } else {
                            window.postMessage({ type: 'cm-grabber-fill-project', payload: p }, '*');
                        }
                    },
                    args: [payload]
                });
            } catch (e) {
                // Fallback to tabs.sendMessage
                try {
                    await chrome.tabs.sendMessage(projectTab.id, { action: "FILL_GRABBER_ENTRY", payload });
                } catch (err2) { }
            }
        }, 120);
    } else {
        // Open a new tab with project with hash payload so it immediately loads & auto-fills
        await chrome.tabs.create({
            url: `${targetBase}/#grabbed=${encodeURIComponent(JSON.stringify(payload))}`,
            active: true
        });
    }
}

// 8. Trigger Grabber In-Page Modal helper (Tarika C: In-Page Overlay)
async function triggerGrabberOnTab(tabId) {
    if (!tabId) return;

    try {
        await chrome.tabs.sendMessage(tabId, { action: "TOGGLE_GRABBER" });
        return;
    } catch (err) {
        // Tab existed prior to extension reload: inject script dynamically
    }

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ["content.js"]
        });
        setTimeout(() => {
            fireAndForget(chrome.tabs.sendMessage(tabId, { action: "TOGGLE_GRABBER" }));
        }, 120);
    } catch (e) {
        // Tab closed / host not permitted
    }
}

// 9. Router for extension triggers (Alt+C and Action Icon)
async function handleExtensionTrigger(tab, forceInPage = false) {
    if (!tab || !tab.id) return;
    if (forceInPage) {
        await triggerGrabberOnTab(tab.id);
        return;
    }

    // Default mode is 'project_tab' (Tarika B) as chosen by user
    let mode = 'project_tab';
    try {
        const stored = await chrome.storage.local.get(['cm_grabber_mode']);
        if (stored && stored.cm_grabber_mode) mode = stored.cm_grabber_mode;
    } catch (e) { }

    if (mode === 'in_page') {
        await triggerGrabberOnTab(tab.id);
    } else {
        await grabAndOpenInProject(tab.id);
    }
}

// 10. Action Icon Click listener
chrome.action.onClicked.addListener((tab) => {
    fireAndForget(handleExtensionTrigger(tab, false));
});

// 11. Keyboard Shortcut (Alt + C) listener
chrome.commands.onCommand.addListener((command) => {
    fireAndForget(
        chrome.tabs.query({ active: true, currentWindow: true })
            .then((tabs) => {
                if (tabs && tabs[0] && tabs[0].id) {
                    const forceInPage = (command === 'open_inpage_overlay');
                    return handleExtensionTrigger(tabs[0], forceInPage);
                }
            })
    );
});


