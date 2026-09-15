/*
 * L3 probe P7 - boot the REAL app in a stub DOM and look at state/UI drift after
 * a topbar DATE change (the site/date path re-clamps S.skyTime).
 * Run: node reviews/0.6.32-full/evidence/web/web_probe_boot.mjs
 */
const LS = new Map();
globalThis.localStorage = {
  getItem: (k) => (LS.has(k) ? LS.get(k) : null),
  setItem: (k, v) => { LS.set(k, String(v)); },
  removeItem: (k) => { LS.delete(k); },
};

const _dbs = new Map();
const storesOf = (n) => { if (!_dbs.has(n)) _dbs.set(n, new Map()); return _dbs.get(n); };
const storeOf = (n, s) => { const d = storesOf(n); if (!d.has(s)) d.set(s, new Map()); return d.get(s); };
const req = () => ({ onsuccess: null, onerror: null, result: null, error: null });
const micro = (fn) => queueMicrotask(fn);
globalThis.indexedDB = {
  open(name) {
    const rq = req();
    micro(() => {
      const db = {
        objectStoreNames: { contains: (n) => storesOf(name).has(n) },
        createObjectStore: (n) => { storeOf(name, n); return {}; },
        transaction: (sname) => ({ objectStore: () => ({
          get(key) { const r = req(); micro(() => { const s = storeOf(name, sname); r.result = s.has(key) ? s.get(key) : null; r.onsuccess && r.onsuccess(); }); return r; },
          put(val, key) { const r = req(); micro(() => { storeOf(name, sname).set(key, val); r.result = key; r.onsuccess && r.onsuccess(); }); return r; },
          delete(key) { const r = req(); micro(() => { storeOf(name, sname).delete(key); r.onsuccess && r.onsuccess(); }); return r; },
          clear() { const r = req(); micro(() => { storeOf(name, sname).clear(); r.onsuccess && r.onsuccess(); }); return r; },
          openCursor() {
            const r = req();
            micro(() => {
              const entries = [...storeOf(name, sname).entries()];
              let i = 0;
              const step = () => { if (i < entries.length) { const [key, value] = entries[i++]; r.result = { key, value, continue: step }; r.onsuccess && r.onsuccess(); } else { r.result = null; r.onsuccess && r.onsuccess(); } };
              step();
            });
            return r;
          },
        }) }),
      };
      rq.result = db;
      rq.onupgradeneeded && rq.onupgradeneeded();
      rq.onsuccess && rq.onsuccess();
    });
    return rq;
  },
};

const CATALOG = [
  { id: 'ngc1976', primary_name: 'M42', messier: 'M42', ngcic: 'NGC 1976', otype: 'nebula', ra_hours: 5.588, dec_deg: -5.39, vmag: 4, size_am: '85x60', constellation: 'Ori', popularity: 165000 },
  { id: 'ngc224', primary_name: 'M31', messier: 'M31', ngcic: 'NGC 224', otype: 'galaxy', ra_hours: 0.712, dec_deg: 41.27, vmag: 3.4, size_am: '190x60', constellation: 'And', popularity: 120000 },
];
const CATALOG_FAIL = process.argv[2] === 'catalog-fail';
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith('catalog.json')) {
    if (CATALOG_FAIL) throw new TypeError('Failed to fetch');
    return { ok: true, status: 200, json: async () => CATALOG };
  }
  if (u.includes('popularity')) throw new TypeError('Failed to fetch');
  if (u.includes('version.json')) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: false, status: 404, json: async () => ({}) };
};

globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.location = { hash: '', href: 'http://localhost/', reload() {} };
globalThis.window = {
  matchMedia: () => ({ matches: false }), devicePixelRatio: 1, innerWidth: 1366, innerHeight: 900,
  location: { hash: '', href: 'http://localhost/' },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
};

const mkStyle = () => ({ cssText: '', display: '', position: '', left: '', top: '', margin: '', transform: '', setProperty() {} });
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), style: mkStyle(), dataset: {}, hidden: false,
    innerHTML: '', textContent: '', value: '', checked: false, disabled: false, min: '', max: '',
    offsetWidth: 200, offsetHeight: 120, __h: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(t, fn) { (el.__h[t] = el.__h[t] || []).push(fn); },
    removeEventListener() {}, appendChild() {}, remove() {}, click() {},
    querySelector: () => null, querySelectorAll: () => [], focus() {}, blur() {},
    setAttribute() {}, getAttribute: () => null, closest: () => null, contains: () => false,
    getClientRects: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }),
    setSelectionRange() {}, isConnected: true,
  };
  return el;
}
const elCache = new Map();
const q = (sel) => { if (!elCache.has(sel)) elCache.set(sel, makeEl(sel)); return elCache.get(sel); };
globalThis.document = {
  documentElement: makeEl('html'), body: makeEl('body'), hidden: false, activeElement: null,
  createElement: (t) => makeEl(t),
  querySelector: q, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
};

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } };
const info = (m) => console.log('  ..    ' + m);
const fire = (el, type, ev) => (el.__h[type] || []).forEach((fn) => fn(ev));

const WS = await import(new URL('../../../../web/webstore.js?v=26', import.meta.url).href);
const savedDoc = globalThis.document;
delete globalThis.document;
const A = await import(new URL('./app-probe.mjs', import.meta.url).href);
globalThis.document = savedDoc;

/* one site so boot() does not open the first-run welcome dialog */
await WS.saveSiteRec({ id: 's1', name: 'Probe site', lat: 52.52, lon: 13.4, elev: 0, tz: null });

console.log(`== P7 boot + topbar scrub state ${CATALOG_FAIL ? '(catalog-fail variant)' : 'after a date change'} ====`);
let bootErr = null;
await A.boot().then(() => {}, (e) => { bootErr = e; });
info(`boot() ${bootErr ? 'REJECTED: ' + bootErr.message : 'resolved'}`);

if (CATALOG_FAIL) {
  info(`#splash.display="${q('#splash').style.display}" | #splash-text="${q('#splash-text').textContent}"`);
  ok(q('#splash').style.display !== 'none',
    'an offline / failing catalog fetch leaves the app on the splash for good (no retry, no view)  [expected FAIL = defect]');
  console.log(`\n== P7 summary: ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
}

ok(!bootErr, 'the app boots in the stub DOM (probe validity)');

const clock = (d) => { const w = WS.utcToWall(d); return `${String(w.getHours()).padStart(2, '0')}:${String(w.getMinutes()).padStart(2, '0')}`; };
const beforeTime = A.S.skyTime.getTime();
info(`boot: S.skyTime=${A.S.skyTime.toISOString()} (${clock(A.S.skyTime)}) | #tb-scrub-time="${q('#tb-scrub-time').textContent}" | scrub.value=${q('#tb-scrub').value}/${q('#tb-scrub').max}`);
ok(q('#tb-scrub-time').textContent === clock(A.S.skyTime), 'after boot the topbar label matches the selected time');

/* the user picks the NEXT night in the topbar date field */
const nextDay = new Date(A.S.date.getTime() + 24 * 3600000);
const iso = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
fire(q('#tb-date'), 'change', { target: { value: iso } });
const afterTime = A.S.skyTime.getTime();
info(`after date -> ${iso}: S.skyTime=${A.S.skyTime.toISOString()} (${clock(A.S.skyTime)}) | #tb-scrub-time="${q('#tb-scrub-time').textContent}" | scrub.value=${q('#tb-scrub').value}/${q('#tb-scrub').max}`);
ok(afterTime !== beforeTime, 'the date change re-clamps the selected time (clampSkyTime ran)');
ok(q('#tb-scrub-time').textContent === clock(A.S.skyTime),
  'the TOPBAR scrub label/position follow the re-clamped selected time  [expected FAIL = defect]');

console.log(`\n== P7 summary: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
