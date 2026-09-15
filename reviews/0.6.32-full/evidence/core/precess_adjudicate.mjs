/*
 * Adjudicate: my literal 3x3 chain vs the analytic Meeus eq.21.4 equations
 * (the equations core/astro.js and tests/js/reference_anchors.mjs both use).
 *
 * Meeus p.134 (precession from J2000 to equinox of date):
 *   A = cos d0 * sin(a0 + zeta)
 *   B = cos theta * cos d0 * cos(a0 + zeta) - sin theta * sin d0
 *   C = sin theta * cos d0 * cos(a0 + zeta) + cos theta * sin d0
 *   a = atan2(A, B) + z      d = asin(C)
 * These are the STANDARD reduction equations (Explanatory Supplement /
 * Astronomical Almanac); they give the SAME answer as the honest three-rotation
 * product. This probe checks whether my matrix product reproduces them.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const C = await import(pathToFileURL(resolve("core/index.js")).href);
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const J2000 = 2451545.0;
const norm360 = (x) => ((x % 360) + 360) % 360;
const utc = (y, mo, d, h = 12) => new Date(Date.UTC(y, mo - 1, d, h));

function angles(jd) {
  const t = (jd - J2000) / 36525.0;
  return [
    (2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) / 3600,
    (2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) / 3600,
    (2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) / 3600,
  ];
}

const MV = (M, x) => [
  M[0] * x[0] + M[1] * x[1] + M[2] * x[2],
  M[3] * x[0] + M[4] * x[1] + M[5] * x[2],
  M[6] * x[0] + M[7] * x[1] + M[8] * x[2],
];
const MM = (A, B) => {
  const out = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[3 * r + c] = A[3 * r] * B[c] + A[3 * r + 1] * B[3 + c] + A[3 * r + 2] * B[6 + c];
    }
  }
  return out;
};
const R3 = (ang) => {
  const c = Math.cos(D2R * ang);
  const s = Math.sin(D2R * ang);
  return [c, -s, 0, s, c, 0, 0, 0, 1];   // active rotation by +ang about Z
};
const R2 = (ang) => {
  const c = Math.cos(D2R * ang);
  const s = Math.sin(D2R * ang);
  return [c, 0, s, 0, 1, 0, -s, 0, c];   // active rotation by +ang about Y
};
const toRaDec = (w) => [norm360(Math.atan2(w[1], w[0]) * R2D),
                        Math.asin(Math.max(-1, Math.min(1, w[2]))) * R2D];
const apply = (M, ra, dec) => {
  const a = D2R * ra;
  const d = D2R * dec;
  return toRaDec(MV(M, [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]));
};
const sepDeg = (ra1, d1, ra2, d2) => {
  const p1 = D2R * d1;
  const p2 = D2R * d2;
  const c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(D2R * (ra1 - ra2));
  return Math.acos(Math.max(-1, Math.min(1, c))) * R2D;
};

// analytic Meeus reduction equations, exactly as core/anchor write them
function analytic(raDeg, decDeg, jd, variant) {
  let [zeta, z, theta] = angles(jd);
  if (variant === "negZeta") zeta = -zeta;
  if (variant === "negTheta") theta = -theta;
  if (variant === "negZ") z = -z;
  const a0 = D2R * raDeg;
  const d0 = D2R * decDeg;
  const zr = D2R * zeta;
  const th = D2R * theta;
  const A = Math.cos(d0) * Math.sin(a0 + zr);
  const B = Math.cos(th) * Math.cos(d0) * Math.cos(a0 + zr) - Math.sin(th) * Math.sin(d0);
  const Cc = Math.sin(th) * Math.cos(d0) * Math.cos(a0 + zr) + Math.cos(th) * Math.sin(d0);
  return [norm360(Math.atan2(A, B) * R2D + z), Math.asin(Cc) * R2D];
}

const jd = C.julianDay(utc(2026, 1, 1));
const [zeta, z, theta] = angles(jd);
const variants = {
  "R3(z) R2(-theta) R3(-zeta)": MM(R3(z), MM(R2(-theta), R3(-zeta))),
  "R3(z) R2(+theta) R3(-zeta)": MM(R3(z), MM(R2(theta), R3(-zeta))),
  "R3(z) R2(-theta) R3(+zeta)": MM(R3(z), MM(R2(-theta), R3(zeta))),
  "R3(z) R2(+theta) R3(+zeta)": MM(R3(z), MM(R2(theta), R3(zeta))),
  "R3(-z) R2(+theta) R3(+zeta)": MM(R3(-z), MM(R2(theta), R3(zeta))),
};
const points = [[0, 0], [83.63, 22.01], [250.42, 36.46], [15, 89], [359.5, -70]];
const rows = [];
for (const [name, M] of Object.entries(variants)) {
  for (const [ra, dec] of points) {
    const got = apply(M, ra, dec);
    const want = analytic(ra, dec, jd, "none");
    const core = C.precessJ2000ToDate(ra, dec, jd);
    rows.push({
      variant: name, ra, dec,
      matrix_vs_analytic_arcsec: +(sepDeg(got[0], got[1], want[0], want[1]) * 3600).toExponential(2),
      core_vs_analytic_arcsec: +(sepDeg(core[0], core[1], want[0], want[1]) * 3600).toExponential(2),
    });
  }
}
// sign sweep on the analytic side too
const signRows = [];
for (const v of ["none", "negZeta", "negTheta", "negZ"]) {
  const got = analytic(83.63, 22.01, jd, v);
  const ref = analytic(83.63, 22.01, jd, "none");
  signRows.push({ variant: v, sep_as: +(sepDeg(got[0], got[1], ref[0], ref[1]) * 3600).toFixed(1) });
}
console.log(JSON.stringify({ angles: { zeta, z, theta }, rows: rows.slice(0, 25), signRows }, null, 1));
