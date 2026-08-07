/* DigTrack Pro service worker: push notifications + app-shell caching. */

// Bump this to invalidate every cached asset. Old caches are deleted on activate.
const CACHE_VERSION = 'v1';
const CACHE_NAME = `digtrack-shell-${CACHE_VERSION}`;

self.addEventListener('install', () => {
  // Take over promptly so push handlers and fixes reach clients without waiting for every tab to
  // close. Safe here because index.html is fetched network-first and build assets are
  // content-hashed: a page running older code that requests an older chunk simply misses the
  // cache and gets it from the network, where Vercel still serves it.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('digtrack-shell-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

/**
 * Requests this worker must never touch.
 *
 * Supabase responses are the important one. The Cache API is scoped to the ORIGIN, not to the
 * signed-in user, so caching authenticated API responses here would let one tech's tickets be
 * served to the next person using the same device. Per-user offline data belongs in IndexedDB
 * (lib/offlineDb.ts), which is keyed per user for exactly this reason.
 */
const isCacheable = (request, url) =>
  request.method === 'GET' &&
  url.origin === self.location.origin &&
  !url.pathname.startsWith('/api/') &&
  (url.protocol === 'http:' || url.protocol === 'https:');

// Vite emits content-hashed filenames, so these are immutable and safe to serve from cache
// indefinitely.
const isHashedAsset = (url) =>
  url.pathname.startsWith('/assets/') && /-[A-Za-z0-9_]{8,}\.[a-z0-9]+$/.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!isCacheable(request, url)) return;

  // Navigations: network first, falling back to the cached shell. This is the escape hatch from a
  // bad deploy -- a broken cached index.html can otherwise brick every installed client, and
  // network-first means the next good deploy always wins.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put('/index.html', response.clone());
          return response;
        } catch {
          const cached = await caches.match('/index.html');
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      })()
    );
  }
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'DigTrack Pro Alert', body: 'New update required.' };

  const options = {
    body: data.body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
