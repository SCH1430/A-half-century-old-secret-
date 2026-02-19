/* Project 1430 — PWA Service Worker
 * - precaches core files
 * - runtime cache for images/audio
 * - works on GitHub Pages (relative paths)
 */

// RELEASE CANDIDATE: bump cache version so updates are guaranteed to apply
// RC hotfix: credits update (consultant mention)
const VERSION = 'p1430-pwa-rc1.1';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './scenes.json',
  './facts.json',
  './glossary.json',
  './towers.json',
  './waves.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(CORE_ASSETS);
  })());
});

// Позволяет приложению «мягко» применить обновление по кнопке
self.addEventListener('message', (event) => {
  const data = event && event.data;
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (key !== STATIC_CACHE && key !== RUNTIME_CACHE) {
        return caches.delete(key);
      }
      return Promise.resolve();
    }));
    self.clients.claim();
  })());
});

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // no fallback for images/audio beyond cache
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  return cached || (await fetchPromise) || new Response('Offline', { status: 503, statusText: 'Offline' });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // HTML navigation: always serve the cached shell if offline
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match('./index.html');
      try {
        const response = await fetch(request);
        if (response && response.status === 200) {
          cache.put('./index.html', response.clone());
        }
        return response;
      } catch (_) {
        return cached || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Images & audio: cache-first runtime
  if (request.destination === 'image' || request.destination === 'audio') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else: SWR
  event.respondWith(staleWhileRevalidate(request));
});
