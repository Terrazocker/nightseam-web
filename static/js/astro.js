/* JS port of app/astro.py (Meeus algorithms) - used to synthesize altitude
   tracks for the ~12k advanced-catalog objects directly in the browser, so
   the night payload stays small. Mirrors the Python engine: J2000 precession,
   sidereal time, Saemundsson refraction. */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const J2000 = 2451545.0;

export function julianDay(dt) {
  const y0 = dt.getUTCFullYear();
  const m0 = dt.getUTCMonth() + 1;
  const d0 = dt.getUTCDate() +
    (dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600) / 24;
  let y = y0, m = m0;
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d0 + b - 1524.5;
}

function gmstDeg(jd) {
  const d = jd - J2000;
  const t = d / 36525.0;
  let g = 280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t ** 3) / 38710000.0;
  g %= 360;
  return g < 0 ? g + 360 : g;
}

export function precessJ2000ToDate(raDeg, decDeg, jd) {
  const t = (jd - J2000) / 36525.0;
  const xi = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) / 3600.0;
  const ze = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) / 3600.0;
  const th = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) / 3600.0;
  const a = raDeg * D2R, d = decDeg * D2R;
  const xia = xi * D2R, zea = ze * D2R, tha = th * D2R;
  const cosd = Math.cos(d), sind = Math.sin(d);
  const cosa = Math.cos(a), sina = Math.sin(a);
  let x = cosd * cosa, y = cosd * sina, z = sind;
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
  let ra = Math.atan2(yf, xf) * R2D % 360;
  if (ra < 0) ra += 360;
  const dec = Math.asin(Math.max(-1, Math.min(1, z3))) * R2D;
  return [ra, dec];
}

function refractionDeg(altDeg) {
  const h = Math.max(-1.5, altDeg);
  let r = 1.02 / Math.tan(D2R * (h + 10.3 / (h + 5.11))) / 60.0;
  if (altDeg < -1.5) r = 0.0;
  return r;
}

/* alt/az from already-precessed RA/Dec (degrees) */
export function altazPrecessed(raDeg, decDeg, jd, latDeg, lonDeg) {
  let ha = (gmstDeg(jd) + lonDeg - raDeg) % 360;
  if (ha > 180) ha -= 360;
  const h = ha * D2R, d = decDeg * D2R, p = latDeg * D2R;
  const sinAlt = Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(p) * Math.cos(h);
  let alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const east = -Math.cos(d) * Math.sin(h);
  const north = Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(h);
  let az = Math.atan2(east, north) * R2D % 360;
  if (az < 0) az += 360;
  alt = alt * R2D + refractionDeg(alt * R2D);
  return [alt, az];
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

/* full pipeline for a J2000 object at a given JD (mirrors astro.altaz) */
export function altaz(raDeg, decDeg, jd, latDeg, lonDeg) {
  const [pr, pd] = precessJ2000ToDate(raDeg, decDeg, jd);
  return altazPrecessed(pr, pd, jd, latDeg, lonDeg);
}