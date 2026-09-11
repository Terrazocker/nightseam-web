/*
 * NightSeam Web - shared per-object night statistics.
 *
 * ONE implementation of the 6-minute dusk..dawn scoring loop behind the
 * Tonight ranking and the catalog "% visibility" column. Those were two inline
 * copies in app.js that could drift apart (a constant or clip change in one
 * loop would not touch the other) - the desktop's equivalent single loop lives
 * in static/js/derive.js (recomputeNightDerived). The detail modal has its own
 * sunset-anchored 120-sample loop by design, but it must keep the same
 * per-sample visibility predicate; sampleVisible() is exported so it can call
 * the very same rule (and tests/test_js_parity.py pins the inline copy against
 * this file until it does). Pinned by the "nightstats" engine of
 * tests/js/astro_parity.mjs.
 */
import * as E from './astro.js?v=7';
import { NO_BLOCK, ceilFor } from './horizon.js?v=30';
import { sampleVisible } from './core.js?v=7';

export { sampleVisible };

/** Per-object statistics over the grid [jd0, jd1] at `step` (step is a
 *  fraction of a day, e.g. 6/1440). The grid is the dark window (dusk..dawn),
 *  exactly like the desktop's clipped loop - twilight margins must never be
 *  counted, or "% of night" and the clear window disagree with the desktop.
 *
 *  ctx: {
 *    moonAlt, moonAz   per-sample moon track on the SAME grid (optional; the
 *                      moon penalty is applied per sample only when the moon
 *                      is above the horizon, like derive.js)
 *    illum, moonAgeDays, filterType, moonAware, typeF, bortleF
 *  }
 *
 *  Returns { n, maxAlt, transitJd, visN, blocked, bestRun, bestStart,
 *            sClassic, sMoon, pct, blockedPct } where bestRun/bestStart are
 *  the longest clear run as a HALF-OPEN sample range [start, start+run) and
 *  pct = round(100 * visN / (n+1)), the desktop's obs_pct formula.
 */
export function nightStats(obj, jd0, jd1, step, minAlt, pano, lat, lon, ctx = {}) {
  const ra = obj.ra_hours * 15;
  const n = Math.max(2, Math.round((jd1 - jd0) / step));
  let maxAlt = -90, transitJd = jd0, bestRun = 0, bestStart = jd0;
  let cur = 0, curStart = jd0, visN = 0, blocked = 0, sClassic = 0, sMoon = 0;
  for (let i = 0; i <= n; i++) {
    const jd = jd0 + i * step;
    const [alt, az] = E.altaz(ra, obj.dec_deg, jd, lat, lon);
    if (alt > maxAlt) { maxAlt = alt; transitJd = jd; }
    const ceil = pano ? ceilFor(pano, az) : { ceil: NO_BLOCK, ceilTop: null };
    const vis = sampleVisible(alt, minAlt, ceil.ceil, ceil.ceilTop);
    if (vis) {
      visN++;
      let w = Math.sin(Math.max(0, Math.min(90, alt)) * Math.PI / 180);
      sClassic += w;
      const ma = ctx.moonAlt ? ctx.moonAlt[i] : 0;
      if (ctx.moonAware && ctx.moonAlt && ma > 0) {
        const sep = E.sepDeg(alt, az, ma, ctx.moonAz[i]);
        const glow = E.effectiveMoonGlow(ctx.illum, sep, ctx.filterType, ctx.moonAgeDays);
        w *= E.moonPenalty(glow, ctx.typeF, ctx.bortleF);
      }
      sMoon += w;
      if (cur === 0) curStart = jd;
      cur++;
      if (cur > bestRun) { bestRun = cur; bestStart = curStart; }
    } else {
      if (alt > 0) blocked++;
      cur = 0;
    }
  }
  return {
    n, maxAlt, transitJd, visN, blocked, bestRun, bestStart,
    sClassic, sMoon,
    pct: Math.round(100 * visN / (n + 1)),
    blockedPct: Math.round(100 * blocked / (n + 1)),
  };
}