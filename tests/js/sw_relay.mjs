/*
 * The offline worker (web/sw.js) leaves the pairing relay alone: relay.php
 * answers are one-shot ciphertext, so the worker must neither answer them
 * from its cache nor keep a copy, while ordinary same-origin requests still
 * go through it. Loads the real worker into a stub service-worker scope.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const handlers = {};
const stored = [];
const fakeCache = {
  match: async () => undefined,
  put: async (request) => { stored.push(typeof request === 'string' ? request : request.url); },
  keys: async () => [],
  delete: async () => true,
};
const scope = {
  location: new URL('https://nightseam.de/astro/sw.js'),
  registration: { scope: 'https://nightseam.de/astro/' },
  clients: { claim: async () => {} },
  skipWaiting: () => {},
  addEventListener: (type, fn) => { handlers[type] = fn; },
};
const caches = { open: async () => fakeCache, keys: async () => [], delete: async () => true };
const fetched = [];
const fetch = async (url) => {
  fetched.push(typeof url === 'string' ? url : url.url);
  return { ok: true, type: 'basic', clone() { return this; }, json: async () => [] };
};

const source = await readFile(new URL('../../web/sw.js', import.meta.url), 'utf8');
new Function('self', 'caches', 'fetch', 'Request', 'Response', 'URL', source)(
  scope, caches, fetch, class { constructor(url) { this.url = url; } }, class {}, URL);
assert.equal(typeof handlers.fetch, 'function', 'the worker listens for fetch');
assert.equal(typeof handlers.message, 'function', 'the worker listens for the first-visit file list');

const dispatch = (url, mode = 'cors') => {
  let answered = false;
  handlers.fetch({ request: { method: 'GET', url, mode }, respondWith: () => { answered = true; }, waitUntil: () => {} });
  return answered;
};

for (const op of ['poll', 'offer']) {
  assert.equal(dispatch(`https://nightseam.de/astro/relay.php?box=AAAAAAAAAAAAAAAAAAAAAA&op=${op}`), false,
    `relay.php?op=${op} goes straight to the network`);
}
assert.equal(dispatch('https://nightseam.de/astro/version.json'), true, 'other same-origin files still go through the worker');
assert.equal(dispatch('https://nightseam.de/astro/app.js?v=1'), true, 'immutable modules still go through the worker');

// The first-visit list may name relay requests made before the worker took
// over; they are never fetched into the cache.
let pending;
handlers.message({ data: { type: 'cache-urls', urls: [
  'https://nightseam.de/astro/relay.php?box=AAAAAAAAAAAAAAAAAAAAAA&op=poll',
  'https://nightseam.de/astro/app.js?v=1',
] }, waitUntil: (p) => { pending = p; } });
await pending;
assert.ok(fetched.includes('https://nightseam.de/astro/app.js?v=1'), 'the module is fetched for the cache');
assert.ok(!fetched.some((u) => u.includes('relay.php')), 'the relay is never fetched by the worker');
assert.ok(!stored.some((u) => u.includes('relay.php')), 'nothing from the relay is stored');

console.log('offline worker skips the relay');
