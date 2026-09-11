/*
 * NightSeam core - coordinates, time and topocentric position (pure).
 *
 * Phase 2, concept 6. One implementation of the Meeus algorithms both shells
 * used to carry separately (desktop static/js/astro.js, web web/astro.js):
 * Julian day, Greenwich mean sidereal time, J2000 precession both ways,
 * Saemundsson refraction and topocentric alt/az, plus the desktop batch
 * altazFrame/altazFrameApply fast path for advanced-track synthesis.
 *
 * Python app/astro.py is the oracle (fixtures tests/fixtures/core_fixtures.json).
 */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const ASEC2DEG = 1 / 3600;
const J2000 = 2451545.0;
const MS_PER_DAY = 86400000;
const JD_UNIX_EPOCH = 2440587.5;

/** Julian Day from a Date (its UTC instant). */
export function julianDay(dt) {
  let y = dt.getUTCFullYear();
  let m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate()
    + (dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600
       + dt.getUTCMilliseconds() / 3600000) / 24;
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

/** Precess ICRS/J2000 coords to mean equinox of date (Meeus ch.21).
 *  Z(zeta) -> Y(theta) -> Z(z): the MIDDLE rotation is about the Y axis.
 *  `app/astro.py` is the oracle and implements the same equations;
 *  tests/test_js_parity.py compares both shells against published values. */
export function precessJ2000ToDate(raDeg, decDeg, jd) {
  const t = (jd - J2000) / 36525.0;
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) * ASEC2DEG;
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) * ASEC2DEG;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) * ASEC2DEG;

  const a = D2R * raDeg;
  const d = D2R * decDeg;
  const zr = D2R * zeta, th = D2R * theta;

  const cosd = Math.cos(d), sind = Math.sin(d);
  const sinAz = Math.sin(a + zr), cosAz = Math.cos(a + zr);

  const A = cosd * sinAz;
  const B = Math.cos(th) * cosd * cosAz - Math.sin(th) * sind;
  const C = Math.sin(th) * cosd * cosAz + Math.cos(th) * sind;

  const raNew = ((Math.atan2(A, B) * R2D + z) % 360 + 360) % 360;
  const decNew = Math.asin(Math.max(-1, Math.min(1, C))) * R2D;
  return [raNew, decNew];
}

/** Precess equinox-of-date back to J2000 (inverse).
 *  Meeus ch.21: same equations with (zeta, z, theta) -> (-z, -zeta, -theta). */
export function precessDateToJ2000(raDeg, decDeg, jd) {
  const t = (jd - J2000) / 36525.0;
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) * ASEC2DEG;
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) * ASEC2DEG;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) * ASEC2DEG;

  const a = D2R * raDeg;
  const d = D2R * decDeg;
  const zr = D2R * (-z), th = D2R * (-theta);

  const cosd = Math.cos(d), sind = Math.sin(d);
  const sinAz = Math.sin(a + zr), cosAz = Math.cos(a + zr);

  const A = cosd * sinAz;
  const B = Math.cos(th) * cosd * cosAz - Math.sin(th) * sind;
  const C = Math.sin(th) * cosd * cosAz + Math.cos(th) * sind;

  const raNew = ((Math.atan2(A, B) * R2D - zeta) % 360 + 360) % 360;
  const decNew = Math.asin(Math.max(-1, Math.min(1, C))) * R2D;
  return [raNew, decNew];
}

/** Saemundsson/Bennett refraction (degrees). */
export function refractionDeg(trueAltDeg) {
  const h = Math.max(-1.5, trueAltDeg);
  let r = 1.02 / Math.tan(D2R * (h + 10.3 / (h + 5.11))) / 60.0;
  if (trueAltDeg < -1.5) r = 0;
  return r;
}

/** Topocentric altitude/azimuth (N=0, E=90). RA/Dec assumed J2000; the site
 *  altitude is apparent unless `refract` is false. `precess` false is for the
 *  decorative sky backdrop, which deliberately plots J2000 field stars without
 *  the (tiny) precession shift - the projection only uses sin/cos of az, so
 *  the normalized return matches the old raw atan2 drawing exactly. */
export function altaz(raDeg, decDeg, jd, latDeg, lonDeg, refract = true, precess = true) {
  const [ra, dec] = precess ? precessJ2000ToDate(raDeg, decDeg, jd) : [raDeg, decDeg];
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

/* Batch fast path for the ~12k advanced-object synth: the sidereal time and
   site terms only depend on the time sample, so they are computed once per
   sample instead of once per object per sample. */
export function altazFrame(latDeg, lonDeg, jds) {
  const p = latDeg * D2R;
  const sinp = Math.sin(p), cosp = Math.cos(p);
  return jds.map(jd => {
    let lst = (gmstDeg(jd) + lonDeg) % 360;
    if (lst < 0) lst += 360;
    return { lst, sinp, cosp };
  });
}

export function altazFrameApply(frame, raDeg, decDeg, i) {
  const f = frame[i];
  let ha = (f.lst - raDeg) % 360;
  if (ha > 180) ha -= 360;
  const h = ha * D2R, d = decDeg * D2R;
  const sind = Math.sin(d), cosd = Math.cos(d);
  const sinAlt = sind * f.sinp + cosd * f.cosp * Math.cos(h);
  let alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const east = -cosd * Math.sin(h);
  const north = sind * f.cosp - cosd * f.sinp * Math.cos(h);
  let az = Math.atan2(east, north) * R2D % 360;
  if (az < 0) az += 360;
  alt = alt * R2D + refractionDeg(alt * R2D);
  return [alt, az];
}
