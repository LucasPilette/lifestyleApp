// Service worker : met l'app en cache pour fonctionner hors-ligne (salle de sport sans réseau).
// Le bloc ci-dessous est régénéré par `node tools/release.mjs` à chaque publication.

// <generated>
const VERSION = '2026.11.28-928754b';
const ASSETS = [
  "./",
  "./css/app.css",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512-maskable.png",
  "./icons/icon-512.png",
  "./index.html",
  "./js/components/calendar.js",
  "./js/components/chart.js",
  "./js/components/exercise-picker.js",
  "./js/components/goal-editor.js",
  "./js/components/prefs-ui.js",
  "./js/components/ring.js",
  "./js/components/session-editor.js",
  "./js/components/share-sheet.js",
  "./js/components/side-menu.js",
  "./js/components/tour.js",
  "./js/config.js",
  "./js/core/date.js",
  "./js/core/db.js",
  "./js/core/dom.js",
  "./js/core/feedback.js",
  "./js/core/format.js",
  "./js/core/goals.js",
  "./js/core/metrics.js",
  "./js/core/prefs.js",
  "./js/core/program.js",
  "./js/core/push.js",
  "./js/core/router.js",
  "./js/core/share.js",
  "./js/core/social.js",
  "./js/core/store.js",
  "./js/core/supabase.js",
  "./js/core/theme.js",
  "./js/core/training.js",
  "./js/core/ui.js",
  "./js/core/util.js",
  "./js/data/seed.js",
  "./js/main.js",
  "./js/views/coach.js",
  "./js/views/exercise.js",
  "./js/views/friends.js",
  "./js/views/goals.js",
  "./js/views/history.js",
  "./js/views/home.js",
  "./js/views/log.js",
  "./js/views/metric.js",
  "./js/views/profile.js",
  "./js/views/programs.js",
  "./js/views/settings.js",
  "./js/views/summary.js",
  "./js/views/train.js",
  "./js/views/welcome.js",
  "./js/views/widget-edit.js",
  "./js/views/workout.js",
  "./manifest.webmanifest",
  "./js/version.js"
];
// </generated>

const CACHE = `lifestyle-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lifestyle-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html', { cacheName: CACHE }).then((cached) => cached || fetch(req)),
    );
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true, cacheName: CACHE }).then((cached) => cached || fetch(req)),
  );
});

// --- Notifications push (envoyées par la fonction Edge « push ») ----------------
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Eclipse', {
    body: data.body || '',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: data.url || './' },
  }));
});

// Toucher une notification : ouvre l'app (ou la ramène au premier plan) sur le bon écran.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows[0];
    if (client) {
      client.postMessage({ type: 'open', url });
      if ('focus' in client) await client.focus();
      return;
    }
    await self.clients.openWindow(url);
  })());
});
