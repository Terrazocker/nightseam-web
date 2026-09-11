/*
 * NightSeam core - scoring curves (pure).
 *
 * Phase 2, concept 5. Single implementations of the moon-aware scoring curves
 * and the silent popularity tiebreaker, shared by the desktop
 * (static/js/derive.js) and the web (web/astro.js, web/app.js) shells. No
 * Python counterpart: the scoring model is client-owned (the server ships raw
 * tracks only). No DOM, storage, network or build tokens.
 */

import { gmstDeg, precessJ2000ToDate, refractionDeg, sepDeg } from './astro.js';

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
 *
 *  BATCHED (Phase 3b, owner-authorized): alt/az are computed from ONE sidereal
 *  frame per (site, night) and ONE precession per object at the grid midpoint -
 *  the same semantics the desktop's advanced synthesis has always used
 *  (`static/js/derive.js::synthesizeAdvancedTracks`). Every DISPLAYED value
 *  (visN, pct, blockedPct, bestRun/bestStart, transit index) is identical to
 *  the former per-sample-precession loop; only the continuous score doubles
 *  shift in the last bits (<= ~1.1e-5 on the accumulated sum, precession over
 *  one night ~7.8e-6 deg). Documented for the release notes.
 *
 *  ctx: {
 *    moonAlt, moonAz   per-sample moon track on the SAME grid (optional; the
 *                      moon penalty is applied per sample only when the moon
 *                      is above the horizon, like derive.js)
 *    illum, moonAgeDays, filterType, moonAware, typeF, bortleF
 *  }
 *
 *  Returns an array parallel to `objects` of
 *  { n, maxAlt, transitJd, visN, blocked, bestRun, bestStart, sClassic, sMoon,
 *    pct, blockedPct } with bestRun/bestStart the longest clear run as a
 *    HALF-OPEN sample range [start, start+run) and pct = round(100*visN/(n+1)),
 *    the desktop's obs_pct formula. */
export function nightStatsBatch(objects, jd0, jd1, step, minAlt, pano, lat, lon, ctx = {}) {
  const n = Math.max(2, Math.round((jd1 - jd0) / step));
  const count = n + 1;
  const latR = lat * Math.PI / 180;
  const sinp = Math.sin(latR), cosp = Math.cos(latR);

  // object-independent per-sample work, computed once per (site, night)
  const jds = new Float64Array(count);
  const lstArr = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const jd = jd0 + i * step;
    jds[i] = jd;
    let lst = (gmstDeg(jd) + lon) % 360;
    if (lst < 0) lst += 360;
    lstArr[i] = lst;
  }

  // horizon profile as flat typed arrays; the ceiling is inlined bit-for-bit
  // with core/horizon.js::ceilFor (world-azimuth bins, FOV gate, blockAbove)
  const prof = (pano && Array.isArray(pano.profile) && pano.profile.length === 720)
    ? Float64Array.from(pano.profile) : null;
  const topsArr = (pano && Array.isArray(pano.profileTop) && pano.profileTop.length === 720)
    ? Float64Array.from(pano.profileTop) : null;
  const sky = !!(pano && pano.paintMode === 'sky');
  const fov = pano && Number(pano.fov) > 0 ? Number(pano.fov) : 360;
  const azOff = pano ? (Number(pano.azOffset) || 0) : 0;
  const blockAbove = !!(pano && pano.blockAbove);

  // moon path: the minimum distance only depends on the night's age + filter,
  // so the Math.pow curve is evaluated once per batch
  const moonAware = !!ctx.moonAware && Array.isArray(ctx.moonAlt);
  const moonAlt = moonAware ? ctx.moonAlt : null;
  const moonAz = moonAware ? ctx.moonAz : null;
  const minD = moonAware ? moonMinDist(ctx.filterType, ctx.moonAgeDays) : 0;
  const illum = ctx.illum;

  const out = new Array(objects.length);
  for (let k = 0; k < objects.length; k++) {
    const o = objects[k];
    // precess once per object at the grid midpoint (desktop synth semantics)
    const mid = Math.floor(count / 2);
    const [ra, dec] = precessJ2000ToDate(o.ra_hours * 15, o.dec_deg, jds[mid]);
    const dR = dec * Math.PI / 180;
    const sind = Math.sin(dR), cosd = Math.cos(dR);

    let maxAlt = -90, transitJd = jd0, bestRun = 0, bestStart = jd0;
    let cur = 0, curStart = jd0, visN = 0, blocked = 0, sClassic = 0, sMoon = 0;
    for (let i = 0; i < count; i++) {
      const jd = jds[i];
      // inlined altazFrameApply (no per-sample array allocation)
      let ha = (lstArr[i] - ra) % 360;
      if (ha > 180) ha -= 360;
      const h = ha * Math.PI / 180;
      const cosh = Math.cos(h), sinh = Math.sin(h);
      const sinAlt = sind * sinp + cosd * cosp * cosh;
      let alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
      const east = -cosd * sinh;
      const north = sind * cosp - cosd * sinp * cosh;
      let az = Math.atan2(east, north) * 180 / Math.PI % 360;
      if (az < 0) az += 360;
      alt = alt * 180 / Math.PI + refractionDeg(alt * 180 / Math.PI);

      if (alt > maxAlt) { maxAlt = alt; transitJd = jd; }

      let ceil = -90, top = null;
      if (prof) {
        const d = (((az - azOff) % 360) + 360) % 360;
        if (d > fov) {
          ceil = sky ? 90 : -90;
        } else {
          let b = Math.floor((((az % 360) + 360) % 360) / 0.5);
          if (b > 719) b = 719;
          ceil = prof[b];
          if (sky && blockAbove && topsArr && topsArr[b] > -89.5) top = topsArr[b];
        }
      }

      const vis = alt >= minAlt && alt > ceil && alt < (top == null ? 90.5 : top);
      if (vis) {
        visN++;
        let w = Math.sin(Math.max(0, Math.min(90, alt)) * Math.PI / 180);
        sClassic += w;
        if (moonAware && moonAlt[i] > 0) {
          const sep = sepDeg(alt, az, moonAlt[i], moonAz[i]);
          const glow = illum * Math.max(0, 1 - Math.max(0, sep - minD) / 180);
          const typeF = ctx.typeF, bortleF = ctx.bortleF;
          w *= Math.max(0.05, 1 - 0.95 * glow * typeF * bortleF);
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
    out[k] = {
      n, maxAlt, transitJd, visN, blocked, bestRun, bestStart, sClassic, sMoon,
      pct: Math.round(100 * visN / (n + 1)),
      blockedPct: Math.round(100 * blocked / (n + 1)),
    };
  }
  return out;
}

/** Single-object form of nightStatsBatch (same implementation, no twin). */
export function nightStats(obj, jd0, jd1, step, minAlt, pano, lat, lon, ctx = {}) {
  return nightStatsBatch([obj], jd0, jd1, step, minAlt, pano, lat, lon, ctx)[0];
}
