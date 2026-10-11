/*
 * Timezone entry points and the shared unknown-horizon reason (review, October 11).
 *
 * - every timezone entry point accepts only zones Intl can resolve; an unknown
 *   stored zone never reaches core/time.js, whose null offset would silently
 *   plan in the browser's zone
 * - backup sites with an unknown zone are rejected while the bundle is staged
 * - panoramaVisibilityReason is the one place that names an evidence-less
 *   horizon block, and otherwise agrees with visibilityReason + ceilFor
 */
import assert from 'node:assert/strict';

globalThis.localStorage = {
  _m: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; },
  setItem(k, v) { this._m[k] = String(v); },
  removeItem(k) { delete this._m[k]; },
};

const WS = await import('../../web/webstore.js');
const { ceilFor, normalizeCoverageEvidence } = await import('../../core/horizon.js');
const { VISIBILITY_REASON, visibilityReason, panoramaVisibilityReason } =
  await import('../../core/visibility.js');

/* 1. one validator ---------------------------------------------------------- */
assert.equal(WS.validTimeZone('Europe/Berlin'), true);
assert.equal(WS.validTimeZone('UTC'), true);
for (const bad of ['Mars/Olympus', '', null, 42, 'x'.repeat(101)]) {
  assert.equal(WS.validTimeZone(bad), false, `rejects ${String(bad).slice(0, 20)}`);
}

/* 2. the active zone never holds an unresolvable name ----------------------- */
WS.setActiveTz('Asia/Tokyo');
assert.equal(WS.tz(), 'Asia/Tokyo');
WS.setActiveTz('Mars/Olympus');
assert.equal(WS.tz(), null, 'planning and weather share the browser fallback');
WS.setActiveTz(null);

/* 3. backup sites ----------------------------------------------------------- */
const bundle = (tz) => ({ app: 'nightseam-web', version: 2, panos: { panos: [], activeId: null },
  sites: [{ id: 'site-a', name: 'A', lat: 10, lon: 20, elev: 0, tz }] });
assert.equal(WS.stageBackup(bundle('Asia/Tokyo')).sites[0].tz, 'Asia/Tokyo');
assert.equal(WS.stageBackup(bundle(null)).sites[0].tz, null, 'no zone keeps the browser default');
assert.equal(WS.stageBackup(bundle('')).sites[0].tz, '', 'legacy empty zone is unchanged');
assert.throws(() => WS.stageBackup(bundle('Mars/Olympus')), /unknown timezone/);
assert.throws(() => WS.normalizeWebPrefs({ tz: 'Mars/Olympus' }, { strict: true }), /tz is invalid/);

/* 4. shared reason ---------------------------------------------------------- */
const strict = {
  id: 'p1', fov: 80, azOffset: 350, altBottom: 0, altTop: 60, paintMode: 'obstacle', strokes: [],
  profile: Array(720).fill(10), profileTop: Array(720).fill(-90), profileBins: 'world',
  coverageEvidence: normalizeCoverageEvidence({ version: 1, policy: 'strict-measured' }, true),
};
const legacy = { ...strict, coverageEvidence: undefined };
const R = VISIBILITY_REASON;
assert.equal(R.UNKNOWN_HORIZON, 'unknown_horizon');
assert.equal(panoramaVisibilityReason(strict, 40, 180, 15), R.UNKNOWN_HORIZON, 'outside photographed azimuths');
assert.equal(panoramaVisibilityReason(strict, 80, 20, 15), R.UNKNOWN_HORIZON, 'above photographed altitudes');
assert.equal(panoramaVisibilityReason(strict, 5, 20, 0), R.BLOCKED_BY_HORIZON, 'recorded obstruction');
assert.equal(panoramaVisibilityReason(strict, 40, 20, 15), R.VISIBLE);
assert.equal(panoramaVisibilityReason(strict, 40, 20, 15, false), R.OUTSIDE_SELECTED_WINDOW);
assert.equal(panoramaVisibilityReason(null, 40, 180, 15), R.VISIBLE, 'no panorama: no ceiling');
for (const [alt, az] of [[40, 180], [5, 20], [12, 30], [-3, 90]]) {
  const c = ceilFor(legacy, az);
  assert.equal(panoramaVisibilityReason(legacy, alt, az, 0), visibilityReason(alt, 0, c.ceil, c.ceilTop),
    `legacy panoramas keep the historical reason at ${alt}/${az}`);
}

/* 5. backlog: backup ranges and the slider-representable minimum altitude --- */
const rigBundle = (rig) => ({ app: 'nightseam-web', version: 2, panos: { panos: [], activeId: null },
  rigs: [{ id: 'rig-a', name: 'R', focal_mm: 400, sensor_w: 20, sensor_h: 15, ...rig }] });
assert.throws(() => WS.stageBackup({ ...bundle(null), sites: [{ id: 's', name: 'S', lat: 500, lon: 0 }] }), /out of range/);
assert.throws(() => WS.stageBackup({ ...bundle(null), sites: [{ id: 's', name: 'S', lat: 0, lon: -181 }] }), /out of range/);
assert.throws(() => WS.stageBackup(rigBundle({ focal_mm: -400 })), /non-positive/);
assert.throws(() => WS.stageBackup(rigBundle({ sensor_w: 0 })), /non-positive/);
assert.equal(WS.stageBackup(rigBundle({ fov_w: null })).rigs.length, 1, 'absent optics stay allowed');
for (const [given, kept] of [[2, 5], [33.4, 33], [80, 70], [null, null]]) {
  assert.equal(WS.normalizeWebPrefs({ minAlt: given }, { strict: true }).minAlt, kept, `minAlt ${given}`);
}

/* 6. backlog: scorer elements, popularity and moon inputs ------------------- */
const S = await import('../../core/scoring.js');
const H2 = await import('../../core/horizon.js');
const Hist = await import('../../core/panohistory.js');
assert.equal(S.popularityFactor(1e-4), 0, 'tiny counts never give a negative tiebreaker');
assert.equal(S.popularityFactor(-3), 0);
assert.ok(S.popularityFactor(1e9) <= 1 && S.popularityFactor(1000) > 0.3);
const obj = { id: 'm31', ra_hours: 0.7123, dec_deg: 41.269, otype: 'galaxy' };
const night = [2461325.3, 2461325.75, 6 / 1440];
const base = { id: 'p', fov: 360, azOffset: 0, altBottom: -10, altTop: 60, paintMode: 'obstacle', strokes: [] };
const stats = (profile) => S.nightStats(obj, ...night, 15, { ...base, profile }, 52.52, 13.405);
const open = stats(Array(720).fill(-90));
for (const bad of [NaN, '10', null]) {
  assert.deepEqual(stats(Array(720).fill(bad)), open, `a ${String(bad)} element reads as unrecorded, like ceilFor`);
}
const moon = S.nightStats(obj, ...night, 15, null, 52.52, 13.405, { moonAware: true,
  moonAlt: Array(76).fill(30), moonAz: Array(76).fill(180) });
assert.ok(Number.isFinite(moon.sMoon), 'missing moon inputs keep a finite score');

/* 7. backlog: blank horizons and history keys ------------------------------- */
const sky = { paintMode: 'sky', strokes: [] }; H2.clearMask(sky);
const ground = { paintMode: 'obstacle', strokes: [] }; H2.clearMask(ground);
assert.equal(H2.hasHorizonDrawing(sky), false, 'a blank sky-mode horizon can be converted');
assert.equal(H2.hasHorizonDrawing(ground), false);
assert.equal(H2.hasHorizonDrawing({ ...ground, strokes: [{ m: 'e', x: 1, y: 1, r: 4 }] }), false, 'eraser only');
assert.equal(H2.hasHorizonDrawing({ ...ground, strokes: [{ m: 'b', x: 1, y: 1, r: 4 }] }), true);
assert.equal(H2.hasHorizonDrawing({ ...sky, profile: Array(720).fill(-90) }), true, 'sky painted everywhere');
const record = { ...ground, azOffset: 0, altBottom: -10, altTop: 60, fov: 360, blockAbove: false };
const before = Hist.snapshot(record);
record.landmarks = [{ id: 'l1' }]; record.provenance = { source: 'x' }; record.confidence = [1];
Hist.applySnapshot(record, before);
for (const key of ['landmarks', 'provenance', 'confidence']) {
  assert.equal(Object.hasOwn(record, key), false, `undo removes ${key} added later`);
}

console.log('planner safety contracts: OK');
