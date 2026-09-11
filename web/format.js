/*
 * NightSeam Web - display formatting that has a DESKTOP TWIN.
 *
 * Catalog sizes ("size_am") are ARCMINUTES and are shown in ONE user-chosen
 * unit. static/js/util.js::fmtSize is the reference implementation; this module
 * is imported by app.js and by tests/js/astro_parity.mjs ("size" engine), so the
 * two can never drift apart again.
 *
 * It also carries the two chart helpers that must match the desktop exactly:
 * the magnitude-limit rule (`magVisible`, twin of derive.js, "mag" engine) and
 * the "square" zoom geometry (`skyClampZoom`/`skyViewMatrix`/`skyScreenToBase`/
 * `skyClampFocus`, twin of derive.js, "skyzoom" engine).
 *
 * Why it is a module at all: app.js used to reformat only "NxM" strings and echo
 * everything else verbatim, so the 961 single-axis catalog entries (Hyades 330,
 * Pleiades 110, Ring Nebula 1.4, ...) rendered as a bare number - no unit, and
 * the arcmin/arcsec/deg setting did nothing for them - while the desktop showed
 * "330'". The same strict regex left the Frame % column empty for those objects,
 * because sizeArcmin() returned null.
 */

/** One dimension (arcminutes) in the chosen unit: 330 -> "330'", 1.4 -> "1.4'". */
function one(v, sizeUnit) {
  if (sizeUnit === 'deg') return parseFloat((v / 60).toFixed(2)) + '\u00B0';
  if (sizeUnit === 'arcsec') return Math.round(v * 60) + '\u2033';
  return parseFloat(v.toFixed(1)) + '\u2032';
}

/** "110" or "645x550" (arcminutes) in the chosen unit; empty -> em dash. */
export function fmtSize(s, sizeUnit = 'arcmin') {
  if (!s) return '\u2014';
  const parts = String(s).split(/[x\u00D7]/).map(parseFloat).filter((v) => !isNaN(v));
  if (!parts.length) return String(s);
  return parts.map((v) => one(v, sizeUnit)).join('\u00D7');
}

/** Largest dimension in arcminutes - a lone value is a diameter. null if none. */
export function sizeArcmin(s) {
  if (!s) return null;
  const parts = String(s).split(/[x\u00D7]/).map(parseFloat).filter((v) => !isNaN(v));
  if (!parts.length) return null;
  return Math.max(...parts);
}

/** Frame coverage: the OBJECT's span as a percentage of the FRAME - the same
 *  definition as the desktop's frameCoverage (static/js/derive.js), whose
 *  tooltip reads "object spans X% of the frame". Values above 100 mean the
 *  object does not fit in one frame (desktop: "needs ~N frames"); the old web
 *  column inverted the ratio (field/object, clamped 0-100) and showed "fits"
 *  at >= 100 - the same boolean, but the displayed number meant the opposite.
 *  `sizeAm` is the object's larger axis, `fovWArcmin` the rig's horizontal
 *  FOV - both in arcminutes. Returns null for missing/zero inputs.
 *  Pinned by the "frame" engine of tests/js/astro_parity.mjs. */
export function framePct(sizeAm, fovWArcmin) {
  if (sizeAm == null || sizeAm <= 0 || !(fovWArcmin > 0)) return null;
  return Math.round(100 * sizeAm / fovWArcmin);
}

/* Chart helpers shared with the desktop (static/js/derive.js) and pinned by the
   "mag" / "skyzoom" engines of tests/js/astro_parity.mjs. */

/** All-sky chart magnitude limit - desktop twin (derive.js::magVisible). An
 *  object with a magnitude shows when vmag <= limit; one WITHOUT a magnitude
 *  shows only at the slider's maximum. */
export function magVisible(vmag, limit, maxLimit) {
  return vmag != null ? vmag <= limit : limit >= maxLimit;
}

/** "Square" zoom - desktop twin (derive.js::skyClampZoom/skyViewMatrix/...).
 *  The disc lives in a square W x H space; zoom is one uniform scalar on both
 *  axes about a focus point, so the visible window is a rectangle W/zoom x
 *  H/zoom. `fx`/`fy` null = centered. */
export const SKY_ZOOM_MIN = 1;
export const SKY_ZOOM_MAX = 8;

export function skyClampZoom(z) {
  return Math.max(SKY_ZOOM_MIN, Math.min(SKY_ZOOM_MAX, z));
}

export function skyViewMatrix(zoom, W, H, fx, fy) {
  const cx = fx == null ? W / 2 : fx;
  const cy = fy == null ? H / 2 : fy;
  return { a: zoom, d: zoom, e: W / 2 - cx * zoom, f: H / 2 - cy * zoom };
}

export function skyScreenToBase(zoom, W, H, fx, fy, sx, sy) {
  const cx = fx == null ? W / 2 : fx;
  const cy = fy == null ? H / 2 : fy;
  return [cx + (sx - W / 2) / zoom, cy + (sy - H / 2) / zoom];
}

export function skyClampFocus(W, H, fx, fy) {
  const Rlim = Math.min(W, H) / 2 - 22;
  const at = (v, c) => (v == null ? null : Math.max(c - Rlim, Math.min(c + Rlim, v)));
  return [at(fx, W / 2), at(fy, H / 2)];
}
