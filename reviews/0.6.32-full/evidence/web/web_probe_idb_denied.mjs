/*
 * L3 probe P4 - IndexedDB denied (private mode / blocked site data / no quota).
 * Needs its own process: web/webstore.js caches its connection, so a denied
 * open() must be the FIRST thing the module ever sees.
 * Run: node reviews/0.6.32-full/evidence/web/web_probe_idb_denied.mjs
 */
const LS = new Map();
globalThis.localStorage = {
  getItem: (k) => (LS.has(k) ? LS.get(k) : null),
  setItem: (k, v) => { LS.set(k, String(v)); },
  removeItem: (k) => { LS.delete(k); },
};

const MODE = process.argv[2] || 'throw-open';   // 'throw-open' | 'error-open' | 'quota'
const denied = () => {
  const e = new Error('SecurityError: access to IndexedDB is denied');
  e.name = 'SecurityError';
  return e;
};
const req = () => ({ onsuccess: null, onerror: null, result: null, error: null });
globalThis.indexedDB = {
  open() {
    const rq = req();
    if (MODE === 'throw-open') throw denied();
    const r = () => {       // 'error-open': the success handler never fires
      rq.error = denied();
      rq.onerror && rq.onerror();
    };
    (globalThis.queueMicrotask || queueMicrotask)(r);
    return rq;
  },
};

globalThis.fetch = async (url) => {
  if (String(url).startsWith('catalog.json')) return { ok: true, status: 200, json: async () => [] };
  if (String(url).includes('popularity')) throw new TypeError('Failed to fetch');
  if (String(url).includes('version.json')) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({}) };
};

const created = [];
globalThis.window = {
  matchMedia: () => ({ matches: false }), devicePixelRatio: 1, location: { hash: '', href: 'x' },
  addEventListener: (t, fn) => { globalThis.__win.push([t, fn]); }, removeEventListener: () => {}, dispatchEvent: () => {},
};
globalThis.__win = [];
const mkStyle = () => ({ cssText: '', display: '', setProperty() {} });
function makeEl(tag) {
  return {
    tagName: String(tag || 'div').toUpperCase(), style: mkStyle(), dataset: {}, hidden: false,
    innerHTML: '', textContent: '', value: '', checked: false, disabled: false,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [], focus() {},
    setAttribute() {}, getAttribute: () => null, closest: () => null, contains: () => false,
    getClientRects: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }),
    setSelectionRange() {}, isConnected: true,
  };
}
const elCache = new Map();
const q = (sel) => { if (!elCache.has(sel)) elCache.set(sel, makeEl(sel)); return elCache.get(sel); };
globalThis.document = {
  documentElement: makeEl('html'), body: makeEl('body'), hidden: false, activeElement: null,
  createElement: (t) => { const e = makeEl(t); created.push(e); return e; },
  querySelector: q, querySelectorAll: () => [], addEventListener: () => {}, removeEventListener: () => {},
};

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } };
const info = (m) => console.log('  ..    ' + m);

const WS = await import(new URL('../../../../web/webstore.js?v=26', import.meta.url).href);
const savedDoc = globalThis.document;
delete globalThis.document;
const A = await import(new URL('./app-probe.mjs', import.meta.url).href);
globalThis.document = savedDoc;

console.log(`== P4 IndexedDB denied (mode=${MODE}) ==========================`);

let err = null;
try { await WS.getSites(); } catch (e) { err = e; }
info(`WS.getSites() -> ${err ? err.name + ': ' + err.message : 'resolved'}`);
ok(!!err, 'all() rejects when IndexedDB is unavailable (get/set/del swallow it, all() does not)');

A.__setCAT([]);
q('#splash').style.display = '';
let bootErr = null;
await A.boot().then(() => { bootErr = 'RESOLVED'; }, (e) => { bootErr = e; });
const splash = q('#splash').style.display;
info(`boot() -> ${bootErr === 'RESOLVED' ? 'resolved' : (bootErr && bootErr.name + ': ' + bootErr.message)}`);
info(`#splash.style.display="${splash}" | #splash-text="${q('#splash-text').textContent}"`);
ok(bootErr !== 'RESOLVED' && !!bootErr, 'boot() rejects - it has no catch around the user-data load');
ok(splash !== 'none', 'the splash is NEVER hidden: the app stays a spinner with no view and no retry  [expected FAIL = defect]');

const urh = globalThis.__win.find(([t]) => t === 'unhandledrejection');
info(`window 'unhandledrejection' handler registered inside boot(): ${!!urh}`);
if (urh) {
  urh[1]({ reason: bootErr });
  const banner = created.find((e) => e.style && e.style.cssText && e.style.cssText.includes('position:fixed'));
  info(`error banner shown for ${15000 / 1000}s with: "${banner && banner.textContent}"`);
  ok(!!banner && banner.style.display === 'block', 'the only feedback is a 15 s banner over a frozen splash');
}
console.log(`\n== P4 summary: ${pass} passed, ${fail} failed ==`);
