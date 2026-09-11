/*
 * NightSeam core - scoring curves (pure).
 *
 * Phase 2, concept 5. Single implementations of the moon-aware scoring curves
 * and the silent popularity tiebreaker, shared by the desktop
 * (static/js/derive.js) and the web (web/astro.js, web/app.js) shells. No
 * Python counterpart: the scoring model is client-owned (the server ships raw
 * tracks only). No DOM, storage, network or build tokens.
 */

import { altaz, sepDeg } from './astro.js';
import { NO_BLOCK, ceilFor } from './horizon.js';
import { sampleVisible } from './visibility.js';

/* how badly an object type suffers under moonlight (nebulae worst, clusters
   least) */
export const MOON_TYPE_FACTOR = {
  nebula: 1.6, supernova_remnant: 1.6, planetary: 1.3,
  star_cloud: 1.1, galaxy: 0.8, open_cluster: 0.55, globular: 0.5,
  asterism: 0.55,
};

export function moonSensitivity(otype) {
  return MOON_TYPE_FACTOR[otype] || 1.0;
}

/* Phase-dependent minimum moon distance (Lorentzian, symmetric about full
   moon): LARGEST at full (= BASE), smallest at new (= BASE/3.25).
   `moonAgeDays` is the folded age (0 = new ... ~14.76 = full). */
export function moonMinDist(filterType, moonAgeDays) {
  const BASE = { narrowband: 60, oiii: 90, lrgb: 120 }[filterType] || 120;
  const frac = moonAgeDays / 29.53;
  return BASE / (1 + Math.pow((0.5 - frac) / 0.333, 2));
}

/* Illumination attenuated by separation and the filter's distance tolerance. */
export function effectiveMoonGlow(illum, sep, filterType, moonAgeDays) {
  const minD = moonMinDist(filterType, moonAgeDays);
  const distDeg = Math.max(0, sep - minD);
  return illum * Math.max(0, 1 - distDeg / 180);
}

/* Multiplier applied to a sample's altitude weight under moonlight. */
export function moonPenalty(glow, typeF, bortleF) {
  return Math.max(0.05, 1 - 0.95 * glow * typeF * bortleF);
}

/* Bortle scaling - darker skies reduce the moon penalty more; continuous at
   the 3/4 junction (0.30 at bortle 1 ... 1.12 at bortle 9). */
export function bortleMoonFactor(bortle) {
  if (bortle <= 3) return 0.25 + 0.05 * bortle;
  return 0.40 + 0.12 * (bortle - 3);
}

/* Hidden popularity tiebreaker (The popularity source engagement scores). Pure number
   -> 0..1: log-scale normalization, M42 (165k) ~ 1.0, dim object (100) ~ 0.3.
   The shells resolve the live map/catalog field and pass the number. */
export function popularityFactor(pop) {
  if (!pop) return 0;
  return Math.min(1, 0.3 + 0.7 * Math.log10(pop) / 5.2);
}

/** Per-object statistics over the grid [jd0, jd1] at `step` (step is a
 *  fraction of a day, e.g. 6/1440). The grid is the dark window (dusk..dawn),
 *  exactly like the desktop's clipped loop - twilight margins must never be
 *  counted, or "% of night" and the clear window disagree with the desktop.
 *  The desktop's equivalent single loop lives in static/js/derive.js
 *  (recomputeNightDerived); the detail modal has its own sunset-anchored
 *  120-sample loop by design but shares the same per-sample predicate.
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
 *  pct = round(100 * visN / (n+1)), the desktop's obs_pct formula. */
export function nightStats(obj, jd0, jd1, step, minAlt, pano, lat, lon, ctx = {}) {
  const ra = obj.ra_hours * 15;
  const n = Math.max(2, Math.round((jd1 - jd0) / step));
  let maxAlt = -90, transitJd = jd0, bestRun = 0, bestStart = jd0;
  let cur = 0, curStart = jd0, visN = 0, blocked = 0, sClassic = 0, sMoon = 0;
  for (let i = 0; i <= n; i++) {
    const jd = jd0 + i * step;
    const [alt, az] = altaz(ra, obj.dec_deg, jd, lat, lon);
    if (alt > maxAlt) { maxAlt = alt; transitJd = jd; }
    const ceil = pano ? ceilFor(pano, az) : { ceil: NO_BLOCK, ceilTop: null };
    const vis = sampleVisible(alt, minAlt, ceil.ceil, ceil.ceilTop);
    if (vis) {
      visN++;
      let w = Math.sin(Math.max(0, Math.min(90, alt)) * Math.PI / 180);
      sClassic += w;
      const ma = ctx.moonAlt ? ctx.moonAlt[i] : 0;
      if (ctx.moonAware && ctx.moonAlt && ma > 0) {
        const sep = sepDeg(alt, az, ma, ctx.moonAz[i]);
        const glow = effectiveMoonGlow(ctx.illum, sep, ctx.filterType, ctx.moonAgeDays);
        w *= moonPenalty(glow, ctx.typeF, ctx.bortleF);
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
