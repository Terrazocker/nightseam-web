/* EXECUTED cross-shell check: run the REAL desktop derivation
 * (static/js/state.js + derive.js::recomputeNightDerived, exactly as
 * tests/js/derive_window.mjs drives it) against the REAL web path
 * (core/scoring.js::nightStats on the dusk-anchored window the web builds in
 * web/app.js::nightWindow/obsNightGrid) for the same site, date and objects. */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const R = fileURLToPath(new URL('../../../../', import.meta.url));
const { S } = await import(pathToFileURL(R + 'static/js/state.js').href);
const D = await import(pathToFileURL(R + 'static/js/derive.js').href);
const A = await import(pathToFileURL(R + 'core/astro.js').href);
const P = await import(pathToFileURL(R + 'core/planning.js').href);
const SC = await import(pathToFileURL(R + 'core/scoring.js').href);
const rows = JSON.parse(readFileSync(R + 'web/catalog.json', 'utf8')).filter((o) => !o._adv);

const STEP = 6, N = 241, STEP_JD = STEP / 1440, MINALT = 25;
const iso = (d) => new Date(d).toISOString().slice(0, 19);

for (const [label, lat, lon, noonUTC] of [
  ['Berlin 2026-09-22', 52.52, 13.405, '2026-09-22T10:00:00Z'],
  ['Berlin 2026-06-21', 52.52, 13.405, '2026-06-21T10:00:00Z'],
  ['Tenerife 2026-01-15', 28.29, -16.51, '2026-01-15T12:00:00Z'],
]) {
  const noon = new Date(noonUTC);
  const info = P.nightInfo(noon, lat, lon, noon);
  const w = P.pickDarkWindow(info, noon, noon);
  const times = [];
  for (let i = 0; i < N; i++) times.push(iso(new Date(noon.getTime() + i * STEP * 60000)));
  // desktop payload: full 24 h noon-anchored grid, tracks from the shipped core
  const jdNoon = A.julianDay(noon);
  const objs = rows.map((o) => ({ ...o }));
  const tr = SC.computeNightTracks(objs, jdNoon, jdNoon + (N - 1) * STEP_JD, STEP_JD, lat, lon);
  S.night = {
    timeline: { t0: times[0], step_min: STEP, n: N, times_iso: times },
    dusk: iso(w.dusk), dawn: iso(w.dawn), moon_illum: 0, moon_age_days: 0,
    sun_alt: times.map(() => -20), sun_az: times.map(() => 0),
    moon_alt: times.map(() => -10), moon_az: times.map(() => 0),
    objects: objs.map((o, k) => ({
      id: o.id,
      alt: Array.from(tr.alt.subarray(k * tr.count, (k + 1) * tr.count)),
      az: Array.from(tr.az.subarray(k * tr.count, (k + 1) * tr.count)),
      ceil: new Array(tr.count).fill(-90),
    })),
  };
  S.meta = {}; for (const o of objs) S.meta[o.id] = { otype: o.otype };
  S.minAlt = MINALT;
  S.cfg = { moon_aware: false, bortle: 4, filters: { broadband: true } };
  S.panos = [];
  D.recomputeNightDerived();                       // THE desktop implementation
  // web: exactly what web/app.js::obsNightGrid hands to core nightStats
  const webStats = SC.nightStatsBatch(objs, A.julianDay(w.dusk), A.julianDay(w.dawn),
                                      STEP_JD, MINALT, null, lat, lon);
  let diff = 0, maxD = 0, ex = null;
  const [i0, i1] = D.nightIndexRange();
  if (typeof S.night.objects[0].obs_pct !== 'number') {
    console.log('PROBE ERROR: derive.js did not write obs_pct');
  }
  S.night.objects.forEach((o, k) => {
    const d = Math.abs(o.obs_pct - webStats[k].pct);
    if (d) { diff++; if (d > maxD) { maxD = d; ex = [o.id, o.obs_pct, webStats[k].pct]; } }
  });
  console.log(`${label}: desktop nightN=${i1 - i0 + 1} webGrid=${webStats[0].n + 1}`,
    `differing=${diff}/${objs.length} maxDiff=${maxD}pp`,
    ex ? `example ${ex[0]}: desktop ${ex[1]}% vs web ${ex[2]}%` : '');
}
