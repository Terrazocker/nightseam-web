/* Lane probe: does the WEB scoring grid (anchored at dusk) sample the SAME
 * instants as the DESKTOP grid (anchored at the site's local noon, clipped to
 * dusk..dawn)?  Both sides use the shipped core for the astronomy; the desktop
 * side replicates derive.js::recomputeNightDerived's 6-line clip exactly
 * (indexRangeFor = first/last grid sample inside [dusk,dawn]). */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const R = fileURLToPath(new URL('../../../../', import.meta.url));
const S = await import(pathToFileURL(R + 'core/scoring.js').href);
const P = await import(pathToFileURL(R + 'core/planning.js').href);
const A = await import(pathToFileURL(R + 'core/astro.js').href);

const rows = JSON.parse(readFileSync(R + 'web/catalog.json', 'utf8')).filter((o) => !o._adv);
const STEP = 6 / 1440;
const MINALT = 25;   // 17 + 2*4, the Bortle-4 default

const cases = [
  ['Berlin 2026-09-22', 52.52, 13.40, new Date(Date.UTC(2026, 8, 22, 10, 0, 0))],
  ['Berlin 2026-06-21', 52.52, 13.40, new Date(Date.UTC(2026, 5, 21, 10, 0, 0))],
  ['Tenerife 2026-01-15', 28.29, -16.51, new Date(Date.UTC(2026, 0, 15, 12, 0, 0))],
];
for (const [label, lat, lon, noon] of cases) {
  const info = P.nightInfo(noon, lat, lon, noon);
  const w = P.pickDarkWindow(info, noon, noon);
  const dusk = w.dusk, dawn = w.dawn;
  if (!dusk || !dawn) { console.log(label, 'no window'); continue; }
  const objs = rows.map((o) => ({ ra_hours: o.ra_hours, dec_deg: o.dec_deg }));
  // desktop: noon-anchored grid, clip dusk..dawn, vis = alt >= minAlt
  const n = 240, jdNoon = A.julianDay(noon);
  const tr = S.computeNightTracks(objs, jdNoon, jdNoon + n * STEP, STEP, lat, lon);
  let i0 = 0, i1 = n;
  for (let i = 0; i <= n; i++) if (A.dateFromJD(jdNoon + i * STEP) >= dusk) { i0 = i; break; }
  for (let i = n; i >= 0; i--) if (A.dateFromJD(jdNoon + i * STEP) <= dawn) { i1 = i; break; }
  const nightN = Math.max(1, i1 - i0 + 1);
  const dPct = objs.map((o, k) => {
    let visIn = 0;
    for (let i = i0; i <= i1; i++) if (tr.alt[k * tr.count + i] >= MINALT) visIn++;
    return Math.round(100 * visIn / nightN);
  });
  // web: core grid anchored at dusk
  const jd0 = A.julianDay(dusk), jd1 = A.julianDay(dawn);
  const wStats = S.nightStatsBatch(objs, jd0, jd1, STEP, MINALT, null, lat, lon);
  const wPct = wStats.map((s) => s.pct);
  let diff = 0, maxD = 0, ex = null, gate = 0, gateEx = null;
  for (let k = 0; k < objs.length; k++) {
    const d = Math.abs(dPct[k] - wPct[k]);
    if (d) { diff++; if (d > maxD) { maxD = d; ex = [rows[k].id, dPct[k], wPct[k]]; } }
    // the web Min-visibility gate (default 1%) keeps `web pct >= 1`; the desktop
    // shows `obs_pct`. A row the desktop shows at >=1% but the web drops at 0 is
    // a MEMBERSHIP difference between the two apps.
    if (dPct[k] >= 1 && wPct[k] < 1) { gate++; if (!gateEx) gateEx = [rows[k].id, dPct[k], wPct[k]]; }
  }
  if (gate) console.log(`   gate-membership rows: desktop>=1% but web<1% = ${gate}`, gateEx);
  const phase = (dusk.getTime() - noon.getTime()) / 60000 % 6;
  console.log(`${label}: dusk-noon mod 6min=${phase.toFixed(3)}`,
    `deskGrid=${i1 - i0 + 1} webGrid=${wStats[0].n + 1} nightN=${nightN}`,
    `rows differing=${diff}/${objs.length} maxDiff=${maxD}pp`,
    ex ? `example ${ex[0]}: desktop ${ex[1]}% vs web ${ex[2]}%` : '');
}
