/* Glyndwr Service Worker — Web Push + Offline Cache */
const CACHE_NAME = 'glyndwr-v1.1';
const OFFLINE_URLS = ['/', '/static/css/main.css', '/static/js/app.js'];

// ── Install: cache shell ───────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS).catch(() => {}))
  );
});

// ── Activate: clean old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for API, cache-first for assets ──────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always use network for API routes
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Push notifications ─────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'Glyndwr', body: 'You have a new notification.' };
  try {
    data = event.data ? JSON.parse(event.data.text()) : data;
  } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title || 'Glyndwr', {
      body: data.body || '',
      icon: data.icon || '/static/icon.svg',
      badge: '/static/icon.svg',
      tag: data.tag || 'glyndwr',
      data: data.url ? { url: data.url } : {},
      actions: data.actions || [],
    })
  );
});

// ── Notification click: focus or open ─────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
