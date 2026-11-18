// ============================================================================
// CASH MANAGEMENT BC — PWA SERVICE WORKER CLEANUP / UNREGISTER
// Purges all client caches and unregisters Service Worker cleanly
// ============================================================================

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
            .then(() => self.registration.unregister())
            .then(() => self.clients.matchAll())
            .then((clients) => {
                clients.forEach((client) => {
                    console.log('🧹 [ServiceWorker] Unregistered & cleaned cache for:', client.url);
                });
            })
    );
});
