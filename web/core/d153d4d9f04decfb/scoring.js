/*
 * NightSeam core - scoring curves (pure).
 *
 * Phase 2, concept 5. Single implementations of the moon-aware scoring curves
 * and the silent popularity tiebreaker, shared by the desktop
 * (static/js/derive.js) and the web (web/astro.js, web/app.js) shells. No
 * Python counterpart: the scoring model is client-owned (the server ships raw
 * tracks only). No DOM, storage, network or build tokens.
 */

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
