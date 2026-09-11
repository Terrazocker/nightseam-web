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

/** Per-object apparent alt/az tracks for ONE (site, night): the sidereal frame
 *  is shared and each object is precessed once at the grid midpoint. Flat
 *  typed arrays - alt[k*count + i], az[k*count + i] for object k, sample i -
 *  so the expensive astronomy can be computed once and REUSED by preference
 *  changes (min-alt/Bortle) without recomputation. */
export function computeNightTracks(objects, jd0, jd1, step, lat, lon) {
  const n = Math.max(2, Math.round((jd1 - jd0) / step));
  const count = n + 1;
  const latR = lat * Math.PI / 180;
  const sinp = Math.sin(latR), cosp = Math.cos(latR);
  const jds = new Float64Array(count);
  const lstArr = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const jd = jd0 + i * step;
    jds[i] = jd;
    let lst = (gmstDeg(jd) + lon) % 360;
    if (lst < 0) lst += 360;
    lstArr[i] = lst;
  }
  const alt = new Float64Array(objects.length * count);
  const az = new Float64Array(objects.length * count);
  const mid = Math.floor(count / 2);
  for (let k = 0; k < objects.length; k++) {
    const o = objects[k];
    const [ra, dec] = precessJ2000ToDate(o.ra_hours * 15, o.dec_deg, jds[mid]);
    const dR = dec * Math.PI / 180;
    const sind = Math.sin(dR), cosd = Math.cos(dR);
    const base = k * count;
    for (let i = 0; i < count; i++) {
      let ha = (lstArr[i] - ra) % 360;
      if (ha > 180) ha -= 360;
      const h = ha * Math.PI / 180;
      const cosh = Math.cos(h), sinh = Math.sin(h);
      const sinAlt = sind * sinp + cosd * cosp * cosh;
      let a = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
      const east = -cosd * sinh;
      const north = sind * cosp - cosd * sinp * cosh;
      let z = Math.atan2(east, north) * 180 / Math.PI % 360;
      if (z < 0) z += 360;
      alt[base + i] = a * 180 / Math.PI + refractionDeg(a * 180 / Math.PI);
      az[base + i] = z;
    }
  }
  return { n, count, alt, az };
}

/** Score precomputed tracks. This is the PREFERENCE-CHANGE path: a min-alt or
 *  Bortle change only calls this (no astronomy, no frame rebuild). `tracks`
 *  comes from computeNightTracks(); `step`/`jd0` reconstruct the sample times
 *  exactly as they were built. */
export function scoreNightTracks(tracks, objects, jd0, step, minAlt, pano, ctx = {}) {
  const { n, count, alt: altArr, az: azArr } = tracks;

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
    const base = k * count;
    let maxAlt = -90, transitJd = jd0, bestRun = 0, bestStart = jd0;
    let cur = 0, curStart = jd0, visN = 0, blocked = 0, sClassic = 0, sMoon = 0;
    for (let i = 0; i < count; i++) {
      const alt = altArr[base + i];
      const az = azArr[base + i];
      const jd = jd0 + i * step;

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

/** One-shot form: tracks + scoring for one (site, night, prefs). Identical
 *  output to scoring the precomputed tracks separately. */
export function nightStatsBatch(objects, jd0, jd1, step, minAlt, pano, lat, lon, ctx = {}) {
  return scoreNightTracks(computeNightTracks(objects, jd0, jd1, step, lat, lon),
                          objects, jd0, step, minAlt, pano, ctx);
}

/** Single-object form of nightStatsBatch (same implementation, no twin). */
export function nightStats(obj, jd0, jd1, step, minAlt, pano, lat, lon, ctx = {}) {
  return nightStatsBatch([obj], jd0, jd1, step, minAlt, pano, lat, lon, ctx)[0];
}
