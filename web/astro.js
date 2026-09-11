/*
 * NightSeam Web — astronomy engine.
 * Faithful JS port of NightSeam's pure-Python engine
 * (app/astro.py + planning.py + nightcalc.py concepts).
 * Algorithms: Meeus, "Astronomical Algorithms" (2nd ed.):
 *  solar coords ch.25 (~0.01 deg), lunar ch.47 truncated (~0.3 deg),
 *  sidereal time ch.12, precession ch.21, Saemundsson/Bennett refraction.
 */
export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;

/* keyboard scrub steps in minutes - shared with the desktop
   (static/js/derive.js) and pinned by tests/test_js_parity.py: a plain arrow
   key is the fine step (one 6-min night-grid sample), Shift is the coarse one. */
export const SCRUB_STEP_MIN = 6;
export const SCRUB_SHIFT_STEP_MIN = 60;

/* Scrub-range policy - SHARED with the desktop (static/js/derive.js) and pinned
   by the "scrubwindow" engine of tests/js/astro_parity.mjs. `viewFullDay` false
   => the planner's night window (dusk..dawn: the picked twilight level, or the
   site-zoned 20:00-04:00 polar fallback); true => the app's full span (web: the
   24 h noon->noon day; desktop: its payload grid). Inputs/outputs are epoch
   milliseconds; a missing night window degrades to the full span. */
export function scrubBounds(viewFullDay, nightStart, nightEnd, fullStart, fullEnd) {
  if (!viewFullDay && nightStart != null && nightEnd != null && nightEnd > nightStart) {
    return { start: nightStart, end: nightEnd };
  }
  return { start: fullStart, end: fullEnd };
}

/** Clamp an instant into a scrub range - the selected time must never sit
 *  outside the window when "View full day" is switched off (e.g. 1 pm). */
export function scrubClamp(t, start, end) {
  if (t < start) return start;
  if (t > end) return end;
  return t;
}

const ASEC2DEG = 1 / 3600;
const J2000 = 2451545.0;
const MS_PER_DAY = 86400000;
const JD_UNIX_EPOCH = 2440587.5;

/* Coordinates/time/precession/altaz are shared in core/ (Phase 2, concept 6);
   imported and re-exported so internal callers and external importers keep
   working. */
import {
  julianDay, dateFromJD, gmstDeg, precessJ2000ToDate, precessDateToJ2000,
  refractionDeg, altaz,
} from './core.js?v=9';

export {
  julianDay, dateFromJD, gmstDeg, precessJ2000ToDate, precessDateToJ2000,
  refractionDeg, altaz,
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
export { aboveHorizon } from './core.js?v=9';

/** Geometric solar position -> RA/Dec in J2000 equivalents (Meeus ch.25). */
export function sunRaDec(jd) {
  const n = jd - J2000;
  const l = (280.460 + 0.9856474 * n) % 360;
  const g = D2R * ((357.528 + 0.9856003 * n) % 360);
  const lam = D2R * ((l + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) % 360);
  const eps = D2R * (23.439 - 0.0000004 * n);

  const x = Math.cos(lam);
  const y = Math.cos(eps) * Math.sin(lam);
  const z = Math.sin(eps) * Math.sin(lam);

  let ra = (Math.atan2(y, x) * R2D) % 360;
  if (ra < 0) ra += 360;
  const dec = Math.asin(z) * R2D;

  return precessDateToJ2000(ra, dec, jd);
}

/** Lunar RA/Dec (J2000-ish), truncated ELP/Meeus ch.47 (~0.3 deg). */
export function moonRaDec(jd) {
  const t = (jd - J2000) / 36525.0;

  const lp = D2R * ((218.316 + 481267.8813 * t) % 360);
  const dd = D2R * ((297.8502 + 445267.1115 * t) % 360);
  const m = D2R * ((357.5291 + 35999.0503 * t) % 360);
  const mp = D2R * ((134.9634 + 477198.8676 * t) % 360);
  const f = D2R * ((93.2721 + 483202.0175 * t) % 360);

  const lon = lp + D2R * (
    + 6.289 * Math.sin(mp)
    + 1.274 * Math.sin(2 * dd - mp)
    + 0.658 * Math.sin(2 * dd)
    + 0.214 * Math.sin(2 * mp)
    - 0.186 * Math.sin(m)
    - 0.114 * Math.sin(2 * f)
    + 0.059 * Math.sin(2 * dd - 2 * mp)
    + 0.057 * Math.sin(2 * dd - m - mp)
    + 0.053 * Math.sin(2 * dd + mp)
    - 0.046 * Math.sin(2 * dd - m)
    - 0.041 * Math.sin(m - mp)
    - 0.035 * Math.sin(dd)
    - 0.031 * Math.sin(m + mp)
  );
  const lat = D2R * (
    + 5.128 * Math.sin(f)
    + 0.281 * Math.sin(mp + f)
    - 0.278 * Math.sin(mp - f)
    + 0.173 * Math.sin(2 * dd - f)
    + 0.055 * Math.sin(2 * dd - mp + f)
    - 0.046 * Math.sin(2 * dd - mp - f)
    + 0.033 * Math.sin(2 * dd + f)
  );

  const eps = D2R * (23.4393 - 0.0130 * t);
  const sl = Math.sin(lon), cl = Math.cos(lon);
  const sb = Math.sin(lat), cb = Math.cos(lat);
  const x = cb * cl;
  const y = cb * sl * Math.cos(eps) - sb * Math.sin(eps);
  const z = cb * sl * Math.sin(eps) + sb * Math.cos(eps);

  let ra = (Math.atan2(y, x) * R2D) % 360;
  if (ra < 0) ra += 360;
  const dec = Math.asin(Math.max(-1, Math.min(1, z))) * R2D;

  return precessDateToJ2000(ra, dec, jd);
}

/** Fractional illuminated disc (0..1). */
export function moonIllumination(jd) {
  const [raS, decS] = sunRaDec(jd);
  const [raM, decM] = moonRaDec(jd);
  const ras = D2R * raS, decs = D2R * decS;
  const ram = D2R * raM, decm = D2R * decM;
  const cosElong = Math.sin(decs) * Math.sin(decm) + Math.cos(decs) * Math.cos(decm) * Math.cos(ras - ram);
  const psi = Math.acos(Math.max(-1, Math.min(1, cosElong)));
  const k = (1 - Math.cos(psi)) / 2;
  return Math.max(0, Math.min(1, k));
}

const SYNODIC_MONTH = 29.53058770576;
/** Moon age in days (0 = new, ~14.76 = full). Derived from elongation. */
export function moonAge(jd) {
  const [raS, decS] = sunRaDec(jd);
  const [raM, decM] = moonRaDec(jd);
  const ras = D2R * raS, decs = D2R * decS;
  const ram = D2R * raM, decm = D2R * decM;
  const cosElong = Math.sin(decs) * Math.sin(decm) + Math.cos(decs) * Math.cos(decm) * Math.cos(ras - ram);
  const psi = Math.acos(Math.max(-1, Math.min(1, cosElong)));
  return SYNODIC_MONTH * psi / (2 * Math.PI);
}

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

/* ------------------------------------------------------------------
 * night / planning helpers (scan-based like the Python original)
 * ------------------------------------------------------------------ */

/** Sun apparent altitude (refracted). */
export function sunAlt(jd, lat, lon) {
  const [ra, dec] = sunRaDec(jd);
  return altaz(ra, dec, jd, lat, lon)[0];
}

/**
 * Sun/Moon apparent altitude+azimuth at a selected time. sunRaDec/moonRaDec
 * return RA already in DEGREES, exactly like app/astro.py's sun_ra_dec /
 * moon_ra_dec, and altaz() takes degrees - these wrappers exist so a caller can
 * never again treat the result as hours (the chart used `ra * 15`, which put the
 * Sun high in the sky all night). Use these everywhere the chart, scoring or the
 * detail panel needs a Sun/Moon position.
 */
export function sunAltAz(jd, lat, lon) {
  const [ra, dec] = sunRaDec(jd);
  return altaz(ra, dec, jd, lat, lon);
}

export function moonAltAz(jd, lat, lon) {
  const [ra, dec] = moonRaDec(jd);
  return altaz(ra, dec, jd, lat, lon);
}

/**
 * Find UTC Date crossings of the sun's altitude through `thresholdDeg`
 * within a 30 h window starting at `scanStartUTC` (the SITE's local noon of
 * the target date - the same anchor app/planning.py uses: local noon + 30 h
 * contains exactly the target evening and the following morning for any
 * timezone). Returns { evening: Date|null, morning: Date|null } (evening =
 * descending). Linear refinement on a 10-minute scan (matches planning.py).
 *
 * Anchoring at NOON instead of midnight matters near the solstices at high
 * latitudes, where a twilight threshold can be crossed twice within one local
 * night (once just after midnight, once just before it): a midnight-anchored
 * 48 h scan then reports the PREVIOUS night's dusk as its "first descending"
 * crossing - one full night early (measured: the civil night at 59.5 N on
 * 2026-06-21 resolved as 2026-06-20T22:35Z). A noon-anchored scan always sees
 * the target night's dusk first, exactly like planning.py.
 */
export function sunCrossings(scanStartUTC, lat, lon, thresholdDeg) {
  const jd0 = julianDay(scanStartUTC);
  const N = 180; // 10-min steps over 30 h
  let prev = sunAlt(jd0, lat, lon) - thresholdDeg;
  let prevSign = Math.sign(prev);
  let evening = null, morning = null;
  for (let i = 1; i <= N; i++) {
    const jd = jd0 + i / 144; // 10 minutes = 1/144 day
    const v = sunAlt(jd, lat, lon) - thresholdDeg;
    const sign = Math.sign(v);
    if (sign !== prevSign && prevSign !== 0) {
      // crossing between step i-1 and i
      const f = prev / (prev - v); // fraction from i-1 to i
      const jdX = jd0 + (i - 1 + f) / 144;
      const dt = dateFromJD(jdX);
      // descending (sign becomes negative) = evening crossing; ascending =
      // morning. Within the noon+30 h window the FIRST descending crossing is
      // the target night's dusk and the LAST ascending its dawn.
      if (sign < 0) { if (!evening) evening = dt; }
      else { morning = dt; }
    }
    prev = v; prevSign = sign;
  }
  return { evening, morning };
}

/** Night summary for one local date at a site.
 *  Returns { sunset, civilDusk, nauticalDusk, astroDusk, astroDawn, nauticalDawn, civilDawn, sunrise }
 *  each Date|null, plus dayStart (scan window start).
 *
 *  `localNoon` is the REAL instant of the site's local noon for that date
 *  (app.js computes it with webstore's wallToUtc). Without it the browser's own
 *  zone stands in for the site's - correct only while both are the same. That
 *  fallback is what made planning for a site far EAST of the browser pick the
 *  previous evening's dusk and a dawn up to two days later: the scan window
 *  then started before the previous local noon, so "first descending crossing"
 *  is not tonight's dusk. */
export function nightInfo(localDate, lat, lon, localNoon) {
  // Scan window: the SITE's local noon of the target date + 30 h - the same
  // anchor as app/planning.py (local_utc(y, m, d, tz, 12) + 30 h), so the
  // first descending crossing is always the TARGET evening's dusk (a
  // midnight-anchored window can report the previous night's dusk at
  // twilight-edge latitudes, see sunCrossings). `new Date(y, m, d, 12)`
  // carries the BROWSER's zone, which is why `localNoon` must be the site's
  // real noon instant for sites outside it.
  const anchor = (localNoon instanceof Date && !isNaN(localNoon))
    ? localNoon
    : new Date(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), 12, 0, 0);
  const scanStart = new Date(anchor.getTime());
  const g = (thr) => sunCrossings(scanStart, lat, lon, thr);
  const zero = g(0), civil = g(-6), naut = g(-12), astro = g(-18);
  return {
    dayStart: scanStart,
    sunset: zero.evening, sunrise: zero.morning,
    civilDusk: civil.evening, civilDawn: civil.morning,
    nauticalDusk: naut.evening, nauticalDawn: naut.morning,
    astroDusk: astro.evening, astroDawn: astro.morning,
  };
}

/** Pick the dark window used for every visibility number.
 *
 *  Desktop parity (app/planning.py `night_window`): use the ASTRONOMICAL night
 *  when the sun reaches -18 deg, else nautical (-12), else civil (-6). When no
 *  twilight level is reached at all (polar day, polar twilight - the sun may
 *  still set without ever crossing -6 deg) the same fixed evening-to-morning
 *  fallback applies as in planning.py: 20:00 local -> 04:00 local the next
 *  day, with level 'fallback'. Sunset/sunrise NEVER become the window: the
 *  desktop's fallback is the fixed 20:00-04:00 span, and using the actual
 *  sunset..sunrise pair instead produced a different (shorter) window for the
 *  same polar-twilight night (measured: 8.0 h vs 2.1 h at Tromso in May).
 *
 *  `localNoon` is the real instant of the SITE's local noon (app.js passes
 *  siteNoon()); the fallback is then built in the SITE's zone - 20:00/04:00
 *  local - exactly like planning.py's tz_min arithmetic. Without it the
 *  browser's zone stands in, correct only while both are the same.
 *  `dayDate` is the calendar day the window belongs to (defaults to today). */
export function pickDarkWindow(info, dayDate, localNoon) {
  const level = (info.astroDusk && info.astroDawn) ? "astronomical"
    : (info.nauticalDusk && info.nauticalDawn) ? "nautical"
      : (info.civilDusk && info.civilDawn) ? "civil"
        : null;
  const dusk = info.astroDusk || info.nauticalDusk || info.civilDusk || null;
  const dawn = info.astroDawn || info.nauticalDawn || info.civilDawn || null;
  if (dusk && dawn) return { dusk, dawn, level: level || "fallback" };

  const anchor = (localNoon instanceof Date && !isNaN(localNoon))
    ? localNoon
    : (dayDate || new Date());
  return {
    dusk: new Date(anchor.getTime() + 8 * 3600000),     // 20:00 local
    dawn: new Date(anchor.getTime() + 16 * 3600000),    // 04:00 local, next day
    level: level || "fallback",
  };
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
} from './core.js?v=9';

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

/** Rise / transit / set + max altitude for an object over the local night.
 *  dayStartUTC should be the local-midnight instant (as Date, UTC-rendered) of the date of interest.
 *  Rise/set are searched over 24 h (midnight-12h .. midnight+12h) at 2-minute steps,
 *  transit/max-alt are restricted to the target calendar day (midnight .. midnight+24h)
 *  to avoid picking the next night. */
export function objectDayInfo(raDeg, decDeg, dayStartUTC, lat, lon) {
  const jdMidnight = julianDay(dayStartUTC);
  const jd0 = jdMidnight - 0.5;
  const N = 720; // 2-min steps over 24 h
  let prev = null, maxAlt = -90, maxJd = jdMidnight;
  let rise = null, set = null;
  for (let i = 0; i <= N; i++) {
    const jd = jd0 + i / N;
    const alt = altaz(raDeg, decDeg, jd, lat, lon)[0];
    if (jd >= jdMidnight && jd < jdMidnight + 1 && alt > maxAlt) { maxAlt = alt; maxJd = jd; }
    if (prev !== null) {
      const s1 = Math.sign(prev), s2 = Math.sign(alt);
      if (s1 !== s2 && s1 !== 0) {
        const f = prev / (prev - alt);
        const jdX = jd0 + (i - 1 + f) / N;
        const dt = dateFromJD(jdX);
        if (s2 > 0) { if (!rise) rise = dt; } else { if (!set) set = dt; }
      }
    }
    prev = alt;
  }
  return { rise, set, transit: dateFromJD(maxJd), maxAlt };
}

/* ---------------------------- formatting ---------------------------- */

/** Great-circle separation between two (alt, az) points in degrees. */
export function sepDeg(alt1Deg, az1Deg, alt2Deg, az2Deg) {
  const p1 = D2R * alt1Deg, p2 = D2R * alt2Deg;
  const dra = D2R * (az1Deg - az2Deg);
  return Math.acos(Math.max(-1, Math.min(1,
    Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dra)))) * R2D;
}

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