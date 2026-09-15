/*
 * L2 probe: is core/astro.js::precessJ2000ToDate a faithful Meeus ch.21 eq.21.4
 * composition R3(z) . R2(-theta) . R3(-zeta), or a collapsed single rotation?
 *
 * Compares:
 *   core     - C.precessJ2000ToDate
 *   matrix   - literal 3x3 product of the three Meeus rotation matrices
 *   anchor   - verbatim copy of tests/js/reference_anchors.mjs::meeusPrecess
 *   iau      - verbatim copy of reference_anchors.mjs::iau2006Precess
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const C = await import(pathToFileURL(resolve("core/index.js")).href);
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const J2000 = 2451545.0;
const norm360 = (x) => ((x % 360) + 360) % 360;
const utc = (y, mo, d, h = 12) => new Date(Date.UTC(y, mo - 1, d, h));

function sep(ra1, dec1, ra2, dec2) {
  const d1 = D2R * dec1;
  const d2 = D2R * dec2;
  const cc = Math.sin(d1) * Math.sin(d2)
    + Math.cos(d1) * Math.cos(d2) * Math.cos(D2R * (ra1 - ra2));
  return Math.acos(Math.max(-1, Math.min(1, cc))) * R2D;
}

function meeusAngles(jd) {
  const t = (jd - J2000) / 36525.0;
  return [
    (2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) / 3600,
    (2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) / 3600,
    (2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) / 3600,
  ];
}

function iauAngles(jd) {
  const t = (jd - J2000) / 36525.0;
  return [
    (2.650545 + 2306.083227 * t + 0.2988499 * t ** 2 + 0.01801828 * t ** 3
      - 5.971e-6 * t ** 4 - 3.173e-7 * t ** 5) / 3600,
    (-2.650545 + 2306.077181 * t + 1.0927348 * t ** 2 + 0.01826837 * t ** 3
      - 2.8596e-5 * t ** 4 - 2.904e-7 * t ** 5) / 3600,
    (2004.191903 * t - 0.4294934 * t ** 2 - 0.04182264 * t ** 3
      - 7.089e-6 * t ** 4 - 1.274e-7 * t ** 5) / 3600,
  ];
}

function matrixFrom(anglesFn, jd, reverse) {
  let [zeta, z, theta] = anglesFn(jd);
  if (reverse) {
    const t2 = [-z, -zeta, -theta];
    [zeta, z, theta] = t2;
  }
  const R3 = (ang) => {
    const c = Math.cos(D2R * ang);
    const s = Math.sin(D2R * ang);
    return [c, -s, 0, s, c, 0, 0, 0, 1];
  };
  const R2 = (ang) => {
    const c = Math.cos(D2R * ang);
    const s = Math.sin(D2R * ang);
    return [c, 0, s, 0, 1, 0, -s, 0, c];
  };
  const mv = (M, x) => [
    M[0] * x[0] + M[1] * x[1] + M[2] * x[2],
    M[3] * x[0] + M[4] * x[1] + M[5] * x[2],
    M[6] * x[0] + M[7] * x[1] + M[8] * x[2],
  ];
  const mm = (A, B) => {
    const out = new Array(9);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        out[3 * r + c] = A[3 * r] * B[c] + A[3 * r + 1] * B[3 + c] + A[3 * r + 2] * B[6 + c];
      }
    }
    return out;
  };
  // Meeus (zeta_A, z_A, theta_A): zeta = -zeta_A, z = -z_A, theta = +theta_A
  return mm(R3(z), mm(R2(-theta), R3(-zeta)));
}

function applyMatrix(M, raDeg, decDeg) {
  const a = D2R * raDeg;
  const d = D2R * decDeg;
  const v = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  const w = [
    M[0] * v[0] + M[1] * v[1] + M[2] * v[2],
    M[3] * v[0] + M[4] * v[1] + M[5] * v[2],
    M[6] * v[0] + M[7] * v[1] + M[8] * v[2],
  ];
  return [norm360(Math.atan2(w[1], w[0]) * R2D),
          Math.asin(Math.max(-1, Math.min(1, w[2]))) * R2D];
}

// the collapsed shortcut shared by core/astro.js and the Meeus anchor
function collapsed(anglesFn, raDeg, decDeg, jd, reverse) {
  let [zeta, z, theta] = anglesFn(jd);
  if (reverse) {
    const t2 = [-z, -zeta, -theta];
    [zeta, z, theta] = t2;
  }
  const a0 = D2R * raDeg;
  const d0 = D2R * decDeg;
  const zr = D2R * zeta;
  const th = D2R * theta;
  const A = Math.cos(d0) * Math.sin(a0 + zr);
  const B = Math.cos(th) * Math.cos(d0) * Math.cos(a0 + zr) - Math.sin(th) * Math.sin(d0);
  const Cc = Math.sin(th) * Math.cos(d0) * Math.cos(a0 + zr) + Math.cos(th) * Math.sin(d0);
  return [norm360(Math.atan2(A, B) * R2D + z), Math.asin(Cc) * R2D];
}

const points = [
  [0.0, 0.0], [41.049942, 49.228467], [250.42, 36.46],
  [210.80, -45.50], [15.0, 89.0], [359.5, -70.0], [83.63, 22.01], [120.0, 0.0],
];
const rows = [];
for (const year of [2000, 2026, 2050, 2100]) {
  const jd = C.julianDay(utc(year, 1, 1));
  const M = matrixFrom(meeusAngles, jd, false);
  const MI = matrixFrom(meeusAngles, jd, true);
  const MIAU = matrixFrom(iauAngles, jd, false);
  for (const [ra, dec] of points) {
    const core = C.precessJ2000ToDate(ra, dec, jd);
    const mat = applyMatrix(M, ra, dec);
    const matIAU = applyMatrix(MIAU, ra, dec);
    const anc = collapsed(meeusAngles, ra, dec, jd, false);
    const ancIAU = collapsed(iauAngles, ra, dec, jd, false);
    // core inverse vs the matrix inverse
    const coreOfDate = core;
    const inv = C.precessDateToJ2000(coreOfDate[0], coreOfDate[1], jd);
    const matInv = applyMatrix(MI, mat[0], mat[1]);
    rows.push({
      year, ra, dec,
      coreMinusMatrix_as: +(sep(core[0], core[1], mat[0], mat[1]) * 3600).toFixed(2),
      coreMinusMatrixIAU_as: +(sep(core[0], core[1], matIAU[0], matIAU[1]) * 3600).toFixed(2),
      coreMinusAnchor_as: +(sep(core[0], core[1], anc[0], anc[1]) * 3600).toExponential(2),
      anchorMinusMatrix_as: +(sep(anc[0], anc[1], mat[0], mat[1]) * 3600).toFixed(2),
      anchorIAU_MinusMatrixIAU_as: +(sep(ancIAU[0], ancIAU[1], matIAU[0], matIAU[1]) * 3600).toFixed(2),
      coreInverse_roundtrip_as: +(sep(inv[0], inv[1], ra, dec) * 3600).toExponential(2),
    });
  }
}
console.log(JSON.stringify({ rows }, null, 1));
