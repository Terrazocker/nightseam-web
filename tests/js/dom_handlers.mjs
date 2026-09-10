/*
 * Desktop DOM-handler wiring checks (headless browsers cannot run in this
 * sandbox, so the real modules are driven through a minimal stub DOM):
 *   E5 - header.js must re-derive the Bortle default min altitude live and let
 *        an explicitly set value win afterwards;
 *   E8 - main.js must scrub by one 6-min night-grid sample (Shift = 60 min),
 *        clamped to the slider range.
 * Prints one marker line per invariant; tests/test_js_behaviour.py asserts
 * them. The relative /api/state fetch fails on purpose - no server is running
 * in Node; main.js already handles that (console.error + banner).
 */
const els = {};
const keydown = [];
const makeEl = (sel) => ({
  sel, _l: {}, _q: {},
  addEventListener(type, fn) { (this._l[type] ||= []).push(fn); },
  dispatch(type, ev = {}) {
    (this._l[type] || []).forEach((f) => f({ target: this, preventDefault() {}, ...ev }));
  },
  value: '', textContent: '', checked: false, max: '20', min: '0',
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  querySelector(s) { return (this._q[s] ||= makeEl(s)); },
  querySelectorAll: () => [],
  dataset: {}, style: {},
});
globalThis.document = {
  querySelector(sel) {
    if (sel.includes('.modal')) return null;      // no modal open
    return (els[sel] ||= makeEl(sel));
  },
  querySelectorAll: () => [],
  addEventListener(type, fn) { if (type === 'keydown') keydown.push(fn); },
  dispatchEvent() {},
  createElement: () => makeEl('created'),
  body: { prepend() {} },
  documentElement: { setAttribute() {}, getAttribute() { return ''; } },
};
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
globalThis.window = { addEventListener() {}, dispatchEvent() {} };
globalThis.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);

const { S } = await import(new URL('../../static/js/state.js', import.meta.url).href);
const D = await import(new URL('../../static/js/derive.js', import.meta.url).href);
const H = await import(new URL('../../static/js/header.js', import.meta.url).href);

/* ------------------------------- E5 ------------------------------- */
S.cfg = { min_useful_alt: 25, min_useful_alt_explicit: false, bortle: 4, sites: [] };
S.minAlt = D.effectiveMinAlt(S.cfg);
H.bindHeader();
const bortle = els['#bortle'], mua = els['#minUsefulAlt'];
const label = () => document.querySelector('#muaVal').textContent;

bortle.value = '7'; bortle.dispatch('input');
const auto7 = S.minAlt === 31 && mua.value == 31 && label() === '31\u00B0';
mua.value = '30'; mua.dispatch('input');
bortle.value = '9'; bortle.dispatch('input');
const explicit = S.minAlt === 30 && label() === '30\u00B0';
console.log(auto7 ? 'E5 handler: bortle re-derives min-alt held'
                  : `E5 handler: bortle FAILED (minAlt=${S.minAlt} slider=${mua.value})`);
console.log(explicit ? 'E5 handler: explicit min-alt survives bortle held'
                     : `E5 handler: explicit FAILED (minAlt=${S.minAlt} label=${label()})`);

/* ------------------------------- E8 ------------------------------- */
await import(new URL('../../static/js/main.js', import.meta.url).href);
const iso = Array.from({ length: 21 }, (_, i) =>
  `2026-09-10T${String((20 + Math.floor(i * 6 / 60)) % 24).padStart(2, '0')}:` +
  `${String((i * 6) % 60).padStart(2, '0')}:00`);
S.night = { timeline: { times_iso: iso, n: 21, step_min: 6 }, objects: [] };
els['#timeSlider'].max = '20';
const fire = (key, shiftKey = false) => {
  for (const h of keydown) h({ key, shiftKey, target: { tagName: 'BODY' }, preventDefault() {} });
};
S.tIdx = 5; fire('ArrowRight');
const r1 = S.tIdx === 6;
fire('ArrowLeft');
const r2 = S.tIdx === 5;
fire('ArrowRight', true);
const r3 = S.tIdx === 15;
S.tIdx = 19; fire('ArrowRight', true);
const r4 = S.tIdx === 20;
console.log(r1 && r2 && r3 && r4
  ? 'E8 handler: 6/60-min steps + clamp held'
  : `E8 handler: FAILED ${JSON.stringify({ r1, r2, r3, r4, tIdx: S.tIdx })}`);
process.exit(0);
