/*
 * L3 probe P8 - the REAL horizon editor (web/horizon.js::renderHorizon +
 * wireEditor) in a stub DOM: paint, then re-render the view the way
 * app.js::refreshView() does, and look at the unsaved state.
 * Run: node reviews/0.6.32-full/evidence/web/web_probe_editor.mjs
 */
const LS = new Map();
globalThis.localStorage = {
  getItem: (k) => (LS.has(k) ? LS.get(k) : null),
  setItem: (k, v) => { LS.set(k, String(v)); },
  removeItem: (k) => { LS.delete(k); },
};

/* --- IDB (panorama photo cache is the only use) --- */
const _dbs = new Map();
const storeOf = (n, s) => { if (!_dbs.has(n)) _dbs.set(n, new Map()); const d = _dbs.get(n); if (!d.has(s)) d.set(s, new Map()); return d.get(s); };
const req = () => ({ onsuccess: null, onerror: null, result: null, error: null });
globalThis.indexedDB = { open(name) { const rq = req(); queueMicrotask(() => { const db = { objectStoreNames: { contains: () => true }, createObjectStore: () => ({}), transaction: (s) => ({ objectStore: () => ({ get(k) { const r = req(); queueMicrotask(() => { r.result = storeOf(name, s).get(k) || null; r.onsuccess && r.onsuccess(); }); return r; }, put(v, k) { const r = req(); queueMicrotask(() => { storeOf(name, s).set(k, v); r.onsuccess && r.onsuccess(); }); return r; }, delete(k) { const r = req(); queueMicrotask(() => { storeOf(name, s).delete(k); r.onsuccess && r.onsuccess(); }); return r; } }) }) }; rq.result = db; rq.onupgradeneeded && rq.onupgradeneeded(); rq.onsuccess && rq.onsuccess(); }); return rq; } };

/* --- 2D context: any method is a no-op, the few value-returning ones matter --- */
const ctxStub = () => new Proxy({}, {
  get: (t, p) => {
    if (p === 'canvas') return { width: 1440, height: 720 };
    if (p === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
    if (p === 'measureText') return () => ({ width: 10 });
    if (p === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (p in t) return t[p];
    return () => {};
  },
  set: () => true,
});

function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), style: { cssText: '', display: '', setProperty() {} },
    dataset: {}, hidden: false, innerHTML: '', textContent: '', value: '28', checked: false, disabled: false,
    clientWidth: 720, clientHeight: 360, width: 720, height: 360, offsetWidth: 720, offsetHeight: 360,
    __h: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(t, fn) { (el.__h[t] = el.__h[t] || []).push(fn); }, removeEventListener() {},
    appendChild() {}, remove() {}, click() {}, focus() {}, blur() {}, setAttribute() {},
    getAttribute: () => null, closest: () => null, contains: () => false,
    getClientRects: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 720, height: 360 }),
    setSelectionRange() {}, setPointerCapture() {}, isConnected: true,
    getContext: () => ctxStub(),
    querySelector: (s) => makeEl(s), querySelectorAll: () => [],
  };
  return el;
}
const q = (s) => makeEl(s);
globalThis.document = {
  documentElement: makeEl('html'), body: makeEl('body'), hidden: false, activeElement: null,
  createElement: (t) => makeEl(t), querySelector: q, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
};
globalThis.window = { matchMedia: () => ({ matches: false }), devicePixelRatio: 1, innerWidth: 1366, innerHeight: 900, addEventListener() {}, removeEventListener() {} };
globalThis.location = { hash: '', href: 'http://localhost/' };
globalThis.ResizeObserver = class { constructor(fn) { this.fn = fn; } observe() {} disconnect() {} };
globalThis.Image = class { set src(v) { this._src = v; queueMicrotask(() => this.onerror && this.onerror()); } };
globalThis.FileReader = class { readAsDataURL() { this.result = null; this.onerror && this.onerror(); } };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } };
const info = (m) => console.log('  ..    ' + m);

const H = await import(new URL('../../../../web/horizon.js?v=48', import.meta.url).href);

console.log('== P8 horizon editor: unsaved state across a view re-render =====');
const p = H.newPano('editor-probe');
const box = makeEl('div');
const onChanged = () => {};
const stored = () => JSON.parse(localStorage.getItem('nightseam_panos_v1')).panos.find((x) => x.id === p.id).strokes.length;

H.renderHorizon(box, onChanged);                       // the editor opens
ok(H.allPanos().length === 1 && H.activePano().id === p.id, 'a panorama is created and active');
ok(!H.horizonUnsaved(), 'the freshly opened editor is not unsaved');
info(`stored strokes=${stored()}`);

/* the user paints: wireEditor's strokeAt() mutates p.strokes in place */
H.activePano().strokes.push({ m: 'b', x: 100, y: 200, r: 28 });
ok(H.horizonUnsaved(), 'painting marks the editor unsaved (the chip says "Unsaved changes")');
info(`stored strokes=${stored()} (still the pre-paint state, persisted only on Save)`);

/* app.js::refreshView() -> renderHorizonView() -> Hor.renderHorizon(box, ...) */
H.renderHorizon(box, onChanged);
const unsavedAfter = H.horizonUnsaved();
info(`after the re-render: horizonUnsaved()=${unsavedAfter}, stored strokes=${stored()}`);
ok(unsavedAfter, 'the re-render keeps the unsaved state  [expected FAIL = defect]');

/* what app.js::route() does when leaving the editor: flush only when unsaved */
H.flushHorizonEdits();
info(`after route()'s flushHorizonEdits(): stored strokes=${stored()}`);
ok(stored() === 1, 'leaving the editor persists the paint (flushHorizonEdits is not a no-op)  [expected FAIL = defect]');

/* and a reload (localStorage is the source of truth) */
const reloaded = JSON.parse(localStorage.getItem('nightseam_panos_v1')).panos.find((x) => x.id === p.id).strokes.length;
ok(reloaded === 1, `a reload keeps the paint (stored strokes=${reloaded})  [expected FAIL = defect]`);

console.log(`\n== P8 summary: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
