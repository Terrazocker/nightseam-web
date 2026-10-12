/*
 * Timezone entry points and the shared horizon reason (review, October 11).
 *
 * - every timezone entry point accepts only zones Intl can resolve; an unknown
 *   stored zone never reaches core/time.js, whose null offset would silently
 *   plan in the browser's zone
 * - backup sites with an unknown zone are rejected while the bundle is staged
 * - panoramaVisibilityReason agrees with visibilityReason + ceilFor, so every
 *   view names a horizon block identically
 */
import assert from 'node:assert/strict';

globalThis.localStorage = {
  _m: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; },
  setItem(k, v) { this._m[k] = String(v); },
  removeItem(k) { delete this._m[k]; },
};

const WS = await import('../../web/webstore.js');
const { ceilFor, withProfile } = await import('../../core/horizon.js');
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
const skyline = withProfile({ id: 'h1', points: [{ az: 0, alt: 10 }, { az: 180, alt: 30 }] });
const R = VISIBILITY_REASON;
assert.equal(Object.values(R).includes('unknown_horizon'), false, 'there is no unknown-coverage reason any more');
assert.equal(panoramaVisibilityReason(skyline, 25, 180, 15), R.BLOCKED_BY_HORIZON, 'recorded obstruction');
assert.equal(panoramaVisibilityReason(skyline, 35, 180, 15), R.VISIBLE);
assert.equal(panoramaVisibilityReason(skyline, 12, 0, 15), R.BELOW_MINIMUM_ALTITUDE);
assert.equal(panoramaVisibilityReason(skyline, 35, 180, 15, false), R.OUTSIDE_SELECTED_WINDOW);
assert.equal(panoramaVisibilityReason(null, 40, 180, 15), R.VISIBLE, 'no horizon: no ceiling');
for (const [alt, az] of [[40, 180], [5, 20], [12, 30], [-3, 90]]) {
  const c = ceilFor(skyline, az);
  assert.equal(panoramaVisibilityReason(skyline, alt, az, 0), visibilityReason(alt, 0, c.ceil, c.ceilTop),
    `the horizon reason is visibilityReason + ceilFor at ${alt}/${az}`);
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
assert.equal(S.popularityFactor(1e-4), 0, 'tiny counts never give a negative tiebreaker');
assert.equal(S.popularityFactor(-3), 0);
assert.ok(S.popularityFactor(1e9) <= 1 && S.popularityFactor(1000) > 0.3);
const obj = { id: 'm31', ra_hours: 0.7123, dec_deg: 41.269, otype: 'galaxy' };
const night = [2461325.3, 2461325.75, 6 / 1440];
const stats = (profile) => S.nightStats(obj, ...night, 15, { id: 'h', profile }, 52.52, 13.405);
const open = stats(Array(720).fill(-90));
const blocked = stats(Array(720).fill(89));
assert.ok(blocked.visibleMinutes === 0 && open.visibleMinutes > 0, 'the scorer reads the horizon profile');
const roofed = S.nightStats(obj, ...night, 15, { id: 'h', profile: Array(720).fill(-90), profileTop: Array(720).fill(10) }, 52.52, 13.405);
assert.equal(roofed.visibleMinutes, 0, 'the scorer reads the overhang profile: nothing above a 10 deg roof edge');
const highRoof = S.nightStats(obj, ...night, 15, { id: 'h', profile: Array(720).fill(-90), profileTop: Array(720).fill(90.5) }, 52.52, 13.405);
assert.deepEqual(highRoof, open, 'an open top (90.5) changes nothing');
for (const bad of [NaN, '10', null]) {
  assert.deepEqual(stats(Array(720).fill(bad)), open, `a ${String(bad)} element reads as unrecorded, like ceilFor`);
}
const moon = S.nightStats(obj, ...night, 15, null, 52.52, 13.405, { moonAware: true,
  moonAlt: Array(76).fill(30), moonAz: Array(76).fill(180) });
assert.ok(Number.isFinite(moon.sMoon), 'missing moon inputs keep a finite score');

console.log('planner safety contracts: OK');
