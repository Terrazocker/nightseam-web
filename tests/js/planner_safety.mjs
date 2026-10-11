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

console.log('planner safety contracts: OK');
