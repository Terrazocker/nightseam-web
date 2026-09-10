/*
 * NightSeam Web - display formatting that has a DESKTOP TWIN.
 *
 * Catalog sizes ("size_am") are ARCMINUTES and are shown in ONE user-chosen
 * unit. static/js/util.js::fmtSize is the reference implementation; this module
 * is imported by app.js and by tests/js/astro_parity.mjs ("size" engine), so the
 * two can never drift apart again.
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
