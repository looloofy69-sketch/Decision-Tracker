const CACHE_NAME = 'decision-ledger-shell-v2';
const APP_ROOT = new URL('./', self.registration.scope).href;
const MANIFEST_URL = new URL('./manifest.json', self.registration.scope).href;

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const rootResponse = await fetch(APP_ROOT, { cache: 'reload' });
  if (!rootResponse.ok) {
    throw new Error('The app shell could not be fetched for offline caching.');
  }

  await cache.put(APP_ROOT, rootResponse.clone());
  const html = await rootResponse.text();

  try {
    const manifestResponse = await fetch(MANIFEST_URL, { cache: 'reload' });
    if (manifestResponse.ok) await cache.put(MANIFEST_URL, manifestResponse.clone());
  } catch {
    // The app shell can still work offline if the optional manifest is unavailable.
  }

  const assetReferences = Array.from(
    html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)
  )
    .map(match => match[1])
    .filter(reference => /\.(?:m?js|css)(?:[?#]|$)/i.test(reference));

  const assetUrls = Array.from(new Set(assetReferences))
    .map(reference => new URL(reference, self.registration.scope).href)
    .filter(url => new URL(url).origin === self.location.origin);

  await Promise.all(assetUrls.map(async url => {
    try {
      const response = await fetch(url, { cache: 'reload' });
      if (response.ok && response.type === 'basic') {
        await cache.put(url, response.clone());
      }
    } catch {
      // A single optional asset failure must not prevent the rest of the shell being cached.
    }
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(APP_ROOT, copy)));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(APP_ROOT);
          return cached || new Response('Decision Ledger is not cached yet. Open it once while online, then retry offline.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
        }
        return response;
      });
    })
  );
});