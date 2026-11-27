// Service worker : met l'app en cache pour fonctionner hors-ligne (salle de sport sans réseau).
// Le bloc ci-dessous est régénéré par `node tools/release.mjs` à chaque publication.

// <generated>
const VERSION = '2026.11.27-62d7ca7';
const ASSETS = [
  "./",
  "./css/app.css",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512-maskable.png",
  "./icons/icon-512.png",
  "./index.html",
  "./js/components/chart.js",
  "./js/components/exercise-picker.js",
  "./js/components/goal-editor.js",
  "./js/components/ring.js",
  "./js/components/session-editor.js",
  "./js/core/date.js",
  "./js/core/db.js",
  "./js/core/dom.js",
  "./js/core/feedback.js",
  "./js/core/format.js",
  "./js/core/goals.js",
  "./js/core/metrics.js",
  "./js/core/router.js",
  "./js/core/store.js",
  "./js/core/training.js",
  "./js/core/ui.js",
  "./js/core/util.js",
  "./js/data/seed.js",
  "./js/main.js",
  "./js/views/exercise.js",
  "./js/views/goals.js",
  "./js/views/history.js",
  "./js/views/home.js",
  "./js/views/log.js",
  "./js/views/metric.js",
  "./js/views/programs.js",
  "./js/views/settings.js",
  "./js/views/summary.js",
  "./js/views/train.js",
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
