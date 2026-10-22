/* NightSeam offline support: a service worker so an installed or bookmarked
 * planner reopens without a network, e.g. at a dark site with no signal.
 *
 * Published at the tree root (/astro/sw.js) beside the entry page, because a
 * service worker controls only pages at or below its own folder; every other
 * file lives in an immutable release folder (scripts/publication_assets.py).
 *
 * - Pages, version.json and other unversioned files: network first, the last
 *   good copy when offline. A reachable server always wins, so a release
 *   reaches users exactly as it does without this worker.
 * - Immutable files (a ?v=N cache token, /releases/<id>/, /core/<hash>/):
 *   cache first. Their bytes never change under the same URL.
 * - Other origins (Wikipedia photos, Open-Meteo): never touched.
 * - The pairing relay (relay.php): never touched. Its answers are one-shot
 *   ciphertext; a cached copy would keep it on the device and replay a stale
 *   box offline.
 * - Storage stays bounded: files of the two newest releases are kept, older
 *   releases are dropped as soon as a third one is cached.
 */
const CACHE = 'nightseam-offline-v1';
const RELEASES_KEY = '/__nightseam-offline-releases';
const KEEP_RELEASES = 2;

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('nightseam-offline-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

const relay = (url) => url.pathname.endsWith('/relay.php');
const releaseOf = (url) => (url.pathname.match(/\/releases\/([0-9a-f]{64})\//) || [])[1] || null;
const immutable = (url) => /^\d+$/.test(url.searchParams.get('v') || '')
  || releaseOf(url) !== null || /\/core\/[0-9a-f]{16}\//.test(url.pathname);

async function rememberRelease(cache, id) {
  const stored = await cache.match(RELEASES_KEY);
  const ids = stored ? await stored.json() : [];
  if (ids[0] === id) return;
  const next = [id, ...ids.filter((x) => x !== id)];
  const keep = next.slice(0, KEEP_RELEASES);
  await cache.put(RELEASES_KEY, new Response(JSON.stringify(keep), { headers: { 'Content-Type': 'application/json' } }));
  const drop = next.slice(KEEP_RELEASES);
  if (!drop.length) return;
  for (const request of await cache.keys()) {
    const old = releaseOf(new URL(request.url));
    if (old && drop.includes(old)) await cache.delete(request);
  }
}

async function store(request, response) {
  if (!response || !response.ok || response.type !== 'basic') return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response);
  const id = releaseOf(new URL(request.url));
  if (id) await rememberRelease(cache, id);
}

async function networkFirst(event) {
  const { request } = event;
  try {
    const response = await fetch(request);
    event.waitUntil(store(request, response.clone()));
    return response;
  } catch (error) {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request)
      // the entry page answers for its folder too: /astro/ and /astro/index.html
      || (request.mode === 'navigate' && (await cache.match(new URL('./', self.registration.scope).href)
        || await cache.match(new URL('./index.html', self.registration.scope).href)));
    if (hit) return hit;
    throw error;
  }
}

async function cacheFirst(event) {
  const { request } = event;
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  event.waitUntil(store(request, response.clone()));
  return response;
}

// The page lists the files its first visit loaded before this worker took
// over; fetch the ones not cached yet (the HTTP cache usually answers).
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'cache-urls' || !Array.isArray(data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // in parallel: a module missing from the cache stops the app from starting
    // offline, so the window in which only part of it is kept stays short
    await Promise.all(data.urls.slice(0, 300).map(async (href) => {
      let url;
      try { url = new URL(href); } catch { return; }
      if (url.origin !== self.location.origin || relay(url) || await cache.match(url.href)) return;
      try { await store(new Request(url.href), await fetch(url.href, { cache: 'force-cache' })); } catch { /* next */ }
    }));
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || relay(url)) return;
  event.respondWith(request.mode !== 'navigate' && immutable(url) ? cacheFirst(event) : networkFirst(event));
});
