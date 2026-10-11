/*
 * Horizon editor shell logic in web/horizon.js that runs without a DOM:
 * the view clamp, the text summary, loading and cleaning stored records,
 * the leave-page guard and storage-failure reporting. History and geometry
 * are pinned in horizon_model.mjs. Prints one marker line;
 * tests/test_js_behaviour.py asserts it.
 */
const store = {
  _m: {},
  fail: false,
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; },
  setItem(k, v) { if (this.fail) throw new Error('quota'); this._m[k] = String(v); },
  removeItem(k) { delete this._m[k]; },
};
globalThis.localStorage = store;

// Records as a previous session stored them: one valid, one duplicate id,
// one unsafe id; plus the retired panorama editor's storage.
store._m.nightseam_panos_v1 = JSON.stringify({ panos: [{ id: 'p1', strokes: [] }] });
store._m.nightseam_horizons_v2 = JSON.stringify({
  horizons: [
    { id: 'h1', name: 'Garden', points: [{ az: 90, alt: 20 }, { az: 270, alt: 5 }, { az: 'x', alt: 1 }], photo: null },
    { id: 'h1', name: 'Duplicate', points: [] },
    { id: '<script>', name: 'Unsafe', points: [] },
  ],
  activeId: 'missing',
});

// a window stub so horizon.js registers its beforeunload handler
globalThis.window = { _h: {}, addEventListener(type, fn) { this._h[type] = fn; }, removeEventListener() {} };

const H = await import(new URL('../../web/horizon.js', import.meta.url).href);

let ok = true;
const fail = (m) => { ok = false; console.log('  FAIL:', m); };
const assert = (c, m) => { if (!c) fail(m); };

/* loading -------------------------------------------------------------- */
assert(store.getItem('nightseam_panos_v1') === null, 'the retired panorama storage is removed, not converted');
const loaded = H.allHorizons();
assert(loaded.length === 1 && loaded[0].id === 'h1', 'duplicate and unsafe ids are dropped on load');
assert(loaded[0].points.length === 2, 'malformed points are dropped on load');
assert(H.activeHorizon() && H.activeHorizon().id === 'h1', 'a dangling active id falls back to the first horizon');
assert(H.ceilFor(H.activeHorizon(), 90).ceil === 20, 'the planner profile is derived on load');

/* view clamp ----------------------------------------------------------- */
const v1 = H.clampView(0.2, 0, 99);
assert(v1.zoom === 1 && v1.fx === 180 && v1.fy === 35, `zoom 1 shows the whole grid (${JSON.stringify(v1)})`);
const v4 = H.clampView(4, 0, -50);
assert(v4.zoom === 4 && v4.fx === 45 && v4.fy === -10 + 90 / 8, `the window stays inside the grid (${JSON.stringify(v4)})`);
assert(H.clampView(99, 180, 30).zoom === 12, 'zoom is capped');

/* summary -------------------------------------------------------------- */
assert(/nothing is blocked/.test(H.describeHorizon({ points: [] })), 'an empty skyline says nothing is blocked');
const text = H.describeHorizon(H.activeHorizon());
assert(/2 skyline points/.test(text) && /Highest obstruction 20° toward E \(90°\)/.test(text)
  && /lowest 5° toward W \(270°\)/.test(text), `the summary names heights and directions in words: ${text}`);

/* leave-page guard ------------------------------------------------------ */
const unload = window._h.beforeunload;
assert(typeof unload === 'function', 'a beforeunload handler is registered');
let prevented = false;
unload({ preventDefault() { prevented = true; } });
assert(!prevented && !H.horizonUnsaved(), 'a clean editor does not block leaving the page');

/* storage failures are reported, never hidden --------------------------- */
const before = JSON.stringify(H.allHorizons());
store.fail = true;
const snapshot = H.normalizeHorizons({ horizons: [{ id: 'h9', name: 'New', points: [{ az: 1, alt: 2 }] }], activeId: 'h9' });
assert(await H.applyHorizonsSnapshot(snapshot) === false, 'a failed record write reports false');
assert(JSON.stringify(H.allHorizons()) === before, 'a failed restore keeps the current horizons');
store.fail = false;
assert(await H.applyHorizonsSnapshot(snapshot) === true, 'without photos a restore needs no photo storage');
assert(H.activeHorizon().id === 'h9' && JSON.parse(store.getItem('nightseam_horizons_v2')).horizons[0].id === 'h9',
  'the restored horizons are live and stored');
assert(!('profile' in JSON.parse(store.getItem('nightseam_horizons_v2')).horizons[0]),
  'the derived profile is never stored');

/* preferences ----------------------------------------------------------- */
store.fail = true;
assert(H.setPrefs({ bortle: 7 }) === false && H.getPrefs().bortle !== 7, 'a failed preference write keeps the live value');
store.fail = false;
assert(H.setPrefs({ bortle: 7 }) === true && H.getPrefs().bortle === 7, 'preferences save');

console.log(ok ? 'horizon ui contract held' : 'horizon ui contract FAILED');
process.exit(ok ? 0 : 1);
