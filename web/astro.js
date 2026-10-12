/*
 * NightSeam Web — astronomy engine.
 * Thin wrapper over the SHARED core (core/astro.js + core/planning.js), which is
 * the ONE implementation; the retired pure-Python engine (app/astro.py +
 * planning.py + nightcalc.py) was deleted in Phase C/0.6.20.
 * Algorithms: Meeus, "Astronomical Algorithms" (2nd ed.):
 *  solar coords ch.25 (~0.01 deg), lunar ch.47 truncated (~0.3 deg),
 *  sidereal time ch.12, precession ch.21, Saemundsson/Bennett refraction.
 */
export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;

/* keyboard scrub steps in minutes, pinned by tests/test_js_parity.py: a plain arrow
   key is the fine step (one 6-min night-grid sample), Shift is the coarse one. */
export const SCRUB_STEP_MIN = 6;
export const SCRUB_SHIFT_STEP_MIN = 60;

const ASEC2DEG = 1 / 3600;
const J2000 = 2451545.0;
const MS_PER_DAY = 86400000;
const JD_UNIX_EPOCH = 2440587.5;

/* Coordinates/time/precession/altaz (concept 6), sun/moon (7) and the
   twilight/night-window planning (8) are shared in core/; imported and
   re-exported so internal callers and external importers keep working. */
import {
  julianDay, dateFromJD, gmstDeg, precessJ2000ToDate, precessDateToJ2000,
  refractionDeg, altaz,
  sunRaDec, moonRaDec, moonAltAz, objectDayInfo, objectNightInfo, moonIllumination, moonAge, sunAlt,
  sunCrossings, nightInfo, pickDarkWindow, scrubWindowMs,
  scrubBounds, scrubClamp, sepDeg,
} from './core.js?v=66';

export {
  julianDay, dateFromJD, gmstDeg, precessJ2000ToDate, precessDateToJ2000,
  refractionDeg, altaz,
  sunRaDec, moonRaDec, moonAltAz, objectDayInfo, objectNightInfo, moonIllumination, moonAge, sunAlt,
  sunCrossings, nightInfo, pickDarkWindow, scrubWindowMs,
  scrubBounds, scrubClamp, sepDeg,
};

/**
 * Selected-time sky visibility: a body (star, planet, the Sun or the Moon) is
 * a VISIBLE sky object only while its APPARENT (refracted) altitude is above
 * the horizon. This is deliberately astronomical, never a clock/“is it night”
 * shortcut: during polar day the Sun is up at midnight, during polar night it
 * is down at noon, and a body just below the rim can be lifted above it by
 * refraction. “Relevant to the night” (e.g. the Moon phase that scores a
 * target) is a different question and does NOT belong here.
 */
/** Apparent-altitude visibility predicate - shared in core/ (Phase 2). */
export { aboveHorizon } from './core.js?v=66';

/** Sun/moon elongation angle in degrees and phase label. */
export function moonPhase(jd) {
  const [raS, decS] = sunRaDec(jd);
  const [raM, decM] = moonRaDec(jd);
  const ras = D2R * raS, decs = D2R * decS;
  const ram = D2R * raM, decm = D2R * decM;
  const cosElong = Math.sin(decs) * Math.sin(decm) + Math.cos(decs) * Math.cos(decm) * Math.cos(ras - ram);
  const psi = Math.acos(Math.max(-1, Math.min(1, cosElong))) * R2D;
  // elongation sign: moon east (increasing) if RA is ahead of sun
  let dRA = (raM - raS + 360) % 360;
  const waxing = dRA < 180;
  const k = (1 - Math.cos(D2R * psi)) / 2;
  const names = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
  const idx = Math.min(7, Math.round(psi / 45)) % 8;
  return { elongation: psi, illumination: k, waxing, name: waxing ? names[idx] : names[(8 - idx) % 8], icon: ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'][waxing ? idx : (8 - idx) % 8] };
}

/**
 * Sun/Moon apparent altitude+azimuth at a selected time. sunRaDec/moonRaDec
 * return RA in DEGREES (the core/astro.js convention, like the retired
 * app/astro.py), and altaz() takes degrees - these wrappers exist so a caller can
 * never again treat the result as hours (the chart used `ra * 15`, which put the
 * Sun high in the sky all night). Use these everywhere the chart, scoring or the
 * detail panel needs a Sun/Moon position.
 */
export function sunAltAz(jd, lat, lon) {
  const [ra, dec] = sunRaDec(jd);
  return altaz(ra, dec, jd, lat, lon);
}

/* ---------------- moon-aware scoring model (desktop parity) ----------------
   The same constants and curves as static/js/derive.js. Both files export them
   so tests/test_js_parity.py can feed one input grid to both implementations
   and fail if they ever drift apart again - the web used to apply the moon
   penalty with the wrong illumination and a civil twilight window. */

/* The curves themselves are shared in core/ (Phase 2, concept 5) - both
   shells re-export them so tests/test_js_parity.py can still feed one input
   grid to both implementations. */
export {
  MOON_TYPE_FACTOR, moonSensitivity, moonMinDist,
  effectiveMoonGlow, moonPenalty, bortleMoonFactor,
} from './core.js?v=66';

/** Sample an object's altitude over [jd0, jd1] at stepMin minutes. */
export function objectTrack(raDeg, decDeg, jd0, jd1, lat, lon, stepMin = 4) {
  const steps = Math.max(2, Math.ceil((jd1 - jd0) * MS_PER_DAY / (stepMin * 60000)));
  const out = [];
  const dt0 = dateFromJD(jd0);
  for (let i = 0; i <= steps; i++) {
    const jd = jd0 + (i / steps) * (jd1 - jd0);
    const [alt, az] = altaz(raDeg, decDeg, jd, lat, lon);
    out.push({ jd, alt, az });
  }
  return { track: out, stepMin, start: jd0, end: jd1 };
}

/* ---------------------------- formatting ---------------------------- */

/** Great-circle separation between two (ra, dec) J2000 points in degrees. */
export function sepRaDec(ra1Deg, dec1Deg, ra2Deg, dec2Deg) {
  const p1 = D2R * dec1Deg, p2 = D2R * dec2Deg;
  const dra = D2R * (ra1Deg - ra2Deg);
  return Math.acos(Math.max(-1, Math.min(1,
    Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dra)))) * R2D;
}

/** RA hours -> "5h 34m 31s" */
export function formatRA(raHours) {
  const h = Math.floor(raHours);
  const m = Math.floor((raHours - h) * 60);
  const s = ((raHours - h) * 60 - m) * 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${s.toFixed(0).padStart(2, '0')}s`;
}

/** Dec deg -> "±22° 01′" */
export function formatDec(decDeg) {
  const sign = decDeg < 0 ? '-' : '+';
  const a = Math.abs(decDeg);
  const d = Math.floor(a);
  const m = (a - d) * 60;
  return `${sign}${d}° ${m.toFixed(1).padStart(4, '0')}′`;
}

/** Local time "HH:MM" from a Date. */
export function fmtTime(dt) {
  if (!dt) return '—';
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}
