/*
 * AstroPilot Web — astronomy engine.
 * Faithful JS port of AstroPilot's pure-Python engine
 * (app/astro.py + planning.py + nightcalc.py concepts).
 * Algorithms: Meeus, "Astronomical Algorithms" (2nd ed.):
 *  solar coords ch.25 (~0.01 deg), lunar ch.47 truncated (~0.3 deg),
 *  sidereal time ch.12, precession ch.21, Saemundsson/Bennett refraction.
 */
export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;
const ASEC2DEG = 1 / 3600;
const J2000 = 2451545.0;
const MS_PER_DAY = 86400000;
const JD_UNIX_EPOCH = 2440587.5;

/** Julian Day from a Date (its UTC instant). */
export function julianDay(dt) {
  let y = dt.getUTCFullYear();
  let m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate() + (dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600) / 24;
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
}

/** Date (UTC) from a Julian Day. */
export function dateFromJD(jd) {
  return new Date((jd - JD_UNIX_EPOCH) * MS_PER_DAY);
}

/** Greenwich mean sidereal time in degrees. */
export function gmstDeg(jd) {
  const d = jd - J2000;
  const t = d / 36525.0;
  const g = 280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t ** 3) / 38710000.0;
  return ((g % 360) + 360) % 360;
}

/** Precess ICRS/J2000 coords to mean equinox of date (Meeus ch.21). */
export function precessJ2000ToDate(raDeg, decDeg, jd) {
  const t = (jd - J2000) / 36525.0;
  const xi = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) * ASEC2DEG;
  const ze = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) * ASEC2DEG;
  const th = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) * ASEC2DEG;

  const a = D2R * raDeg;
  const d = D2R * decDeg;
  const xia = D2R * xi, zea = D2R * ze, tha = D2R * th;

  const cosd = Math.cos(d), sind = Math.sin(d);
  const cosa = Math.cos(a), sina = Math.sin(a);
  const x = cosd * cosa;
  const y = cosd * sina;
  const z = sind;

  const cx = Math.cos(xia), sx = Math.sin(xia);
  const cz = Math.cos(zea), sz = Math.sin(zea);
  const ct = Math.cos(tha), st = Math.sin(tha);

  const x2 = cx * x - sx * y;
  const y2 = sx * x + cx * y;
  const x3 = x2;
  const y3 = ct * y2 - st * z;
  const z3 = st * y2 + ct * z;
  const xf = cz * x3 + sz * y3;
  const yf = -sz * x3 + cz * y3;
  const zf = z3;

  const raNew = ((Math.atan2(yf, xf) * R2D) % 360 + 360) % 360;
  const decNew = Math.asin(Math.max(-1, Math.min(1, zf))) * R2D;
  return [raNew, decNew];
}

/** Precess equinox-of-date back to J2000 (inverse). */
export function precessDateToJ2000(raDeg, decDeg, jd) {
  const t = (jd - J2000) / 36525.0;
  const xi = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) * ASEC2DEG;
  const ze = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) * ASEC2DEG;
  const th = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) * ASEC2DEG;

  const a = D2R * raDeg;
  const d = D2R * decDeg;
  const xia = D2R * xi, zea = D2R * ze, tha = D2R * th;

  const cosd = Math.cos(d), sind = Math.sin(d);
  const cosa = Math.cos(a), sina = Math.sin(a);
  const x = cosd * cosa;
  const y = cosd * sina;
  const z = sind;

  const cz = Math.cos(zea), sz = Math.sin(zea);
  const ct = Math.cos(tha), st = Math.sin(tha);

  const x2 = cz * x - sz * y;
  const y2 = sz * x + cz * y;
  const y3 = ct * y2 + st * z;
  const z3 = -st * y2 + ct * z;
  const x4 = x2;
  const cx = Math.cos(xia), sx = Math.sin(xia);
  const xf = cx * x4 + sx * y3;
  const yf = -sx * x4 + cx * y3;

  const raNew = ((Math.atan2(yf, xf) * R2D) % 360 + 360) % 360;
  const decNew = Math.asin(Math.max(-1, Math.min(1, z3))) * R2D;
  return [raNew, decNew];
}

/** Saemundsson/Bennett refraction (degrees). */
export function refractionDeg(trueAltDeg) {
  const h = Math.max(-1.5, trueAltDeg);
  let r = 1.02 / Math.tan(D2R * (h + 10.3 / (h + 5.11))) / 60.0;
  if (trueAltDeg < -1.5) r = 0;
  return r;
}

/** Topocentric altitude/azimuth (N=0, E=90). RA/Dec assumed J2000. */
export function altaz(raDeg, decDeg, jd, latDeg, lonDeg, refract = true) {
  const [ra, dec] = precessJ2000ToDate(raDeg, decDeg, jd);
  let ha = (gmstDeg(jd) + lonDeg - ra) % 360;
  if (ha > 180) ha -= 360;
  const h = D2R * ha;
  const d = D2R * dec;
  const p = D2R * latDeg;

  const sinAlt = Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(p) * Math.cos(h);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  const east = -Math.cos(d) * Math.sin(h);
  const north = Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(h);
  let az = (Math.atan2(east, north) * R2D) % 360;
  if (az < 0) az += 360;

  if (refract) {
    const altApp = alt * R2D + refractionDeg(alt * R2D);
    return [altApp, az];
  }
  return [alt * R2D, az];
}

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
 * Find UTC Date crossings of the sun's altitude through `thresholdDeg`
 * within a 48 h window starting at `scanStartUTC` (typically local-midnight
 * of the target date, i.e. target noon - 12 h), which contains exactly one
 * evening and one morning crossing for any timezone.
 * Returns { evening: Date|null, morning: Date|null } (evening = descending).
 * Linear refinement on a 10-minute scan (matches planning.py approach).
 */
export function sunCrossings(scanStartUTC, lat, lon, thresholdDeg) {
  const jd0 = julianDay(scanStartUTC);
  const N = 288; // 10-min steps over 48 h
  let prev = sunAlt(jd0, lat, lon) - thresholdDeg;
  let prevSign = Math.sign(prev);
  let evening = null, morning = null;
  for (let i = 1; i <= N; i++) {
    const jd = jd0 + i / (N / 2); // 288 steps x 10 min = 48 h window
    const v = sunAlt(jd, lat, lon) - thresholdDeg;
    const sign = Math.sign(v);
    if (sign !== prevSign && prevSign !== 0) {
      // crossing between step i-1 and i
      const f = prev / (prev - v); // fraction from i-1 to i
      const jdX = jd0 + (i - 1 + f) / (N / 2);
      const dt = dateFromJD(jdX);
      // descending (sign becomes negative) = evening crossing; ascending = morning.
      // The 48 h scan window holds two of each (today's and tomorrow's): keep the
      // FIRST descending (tonight's dusk) and the LAST ascending (tomorrow's dawn),
      // so dawns/sunrise always fall AFTER the dusk of the same night.
      if (sign < 0) { if (!evening) evening = dt; }
      else { morning = dt; }
    }
    prev = v; prevSign = sign;
  }
  return { evening, morning };
}

/** Night summary for one local date at a site.
 *  Returns { sunset, civilDusk, nauticalDusk, astroDusk, astroDawn, nauticalDawn, civilDawn, sunrise }
 *  each Date|null, plus dayStart (scan window start). */
export function nightInfo(localDate, lat, lon) {
  // Scan window: LOCAL midnight of the target date (local noon - 12 h) for 48 h
  // - always contains exactly the target evening and the following morning.
  // `new Date(y, m, d, 12)` already carries the browser's zone, so subtracting
  // getTimezoneOffset() here cancelled it and anchored the window at UTC
  // midnight instead - which shifted the whole night by a day for every site
  // outside roughly UTC-4..+2.
  const localNoon = new Date(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), 12, 0, 0);
  const scanStart = new Date(localNoon.getTime() - 12 * 3600000);
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