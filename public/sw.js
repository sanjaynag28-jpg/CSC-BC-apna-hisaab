// ============================================================================
// CSC & BC Apna Hisaab — Offline Splash Guard Service Worker
// Caches ONLY /startup-wait.html (ZERO caching of app.js / style.css / APIs).
// Whenever localhost:4000 is booting/restarting and Chrome hits ERR_CONNECTION_REFUSED,
// navigation requests seamlessly display the animated loading splash screen
// instead of "This site can't be reached" and auto-reload the exact page once ready!
// ============================================================================

const SPLASH_CACHE = 'cmbc-offline-splash-v1';
const SPLASH_URL = '/startup-wait.html';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SPLASH_CACHE)
            .then((cache) => cache.add(new Request(SPLASH_URL, { cache: 'reload' })))
            .catch(() => { })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== SPLASH_CACHE).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    // Intercept ONLY top-level browser page navigations when network fails;
    // never intercept or cache /api/*, app.js, CSS, or static assets.
    if (req.mode !== 'navigate') return;

    event.respondWith(
        fetch(req).catch(async () => {
            const cached = await caches.match(SPLASH_URL);
            if (cached) return cached;
            return new Response(
                '<!doctype html><html><body style="background:#020617;color:#e2e8f0;font-family:sans-serif;display:grid;place-items:center;height:100vh;text-align:center"><div><h2>Apna Hisaab Server Start Ho Raha Hai...</h2><p>Automatic retry chal raha hai...</p><script>setInterval(()=>fetch("/api/health").then(r=>{if(r.ok)location.reload()}).catch(()=>{}),1000)</script></div></body></html>',
                { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
            );
        })
    );
});
