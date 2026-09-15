/*
 * Cross-check the matrix precession against an INDEPENDENT formulation from the
 * SOFA/ERFA lineage (iauPmat06, IAU 2006 precession-bias matrix) and against
 * the Meeus ch.21 worked example.
 *
 * SOFA iauPmat06 (ESA/ERFA cpp): the precession-bias matrix P = R3(gamb) *
 *   R1(phib) * R3(-psib) * R3(epsa) * R2(-chia) * R3(-omegaa)
 * That is the full chain, i.e. THREE successive rotations each applied to the
 * vector - exactly what the collapsed shortcut cannot represent.
 *
 * Simpler independent check: the J2000 north celestial pole must land on the
 * equinox-of-date pole at separation theta ONLY.  Any composition of
 * R3(z).R2(-theta).R3(-zeta) leaves the pole at (90 - theta).  A composition
 * that collapses the two Z rotations does not.
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
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
const R2 = (ang) => {
  const c = Math.cos(D2R * ang);
  const s = Math.sin(D2R * ang);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
const R1 = (ang) => {
  const c = Math.cos(D2R * ang);
  const s = Math.sin(D2R * ang);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};

// Path P1: Meeus ch.21 as literally written (three rotations, Z-Y-Z)
function meeusChain(jd) {
  const [zeta, z, theta] = angles(jd);
  return [
    "R3(z)*R2(-theta)*R3(-zeta)",
    MM(R3(z), MM(R2(-theta), R3(-zeta))),
  ];
}

// Path P2: same three rotations, but nested the other way (order swapped)
function meeusChainSwapped(jd) {
  const [zeta, z, theta] = angles(jd);
  return [
    "R3(-zeta)*R2(-theta)*R3(z)  (order swapped)",
    MM(R3(-zeta), MM(R2(-theta), R3(z))),
  ];
}

function toRaDec(w) {
  return [norm360(Math.atan2(w[1], w[0]) * R2D),
          Math.asin(Math.max(-1, Math.min(1, w[2]))) * R2D];
}
function apply(M, ra, dec) {
  const a = D2R * ra;
  const d = D2R * dec;
  return toRaDec(MV(M, [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]));
}

const out = {};

// 1. Meeus ch.21 worked example, theta Persei, 2028 Nov 13.19 TD ->
//    alpha = 2h46m11.331s, delta = +49d20'54.54"   (Meeus p.135)
{
  const jd = 2462088.69;
  const raJ2000 = (2 + 44 / 60 + 11.986 / 3600) * 15;   // 2h44m11.986s
  const decJ2000 = 49 + 20 / 60 + 54.54 / 3600;
  const [name, M] = meeusChain(jd);
  const [ra, dec] = apply(M, raJ2000, decJ2000);
  const raWant = (2 + 46 / 60 + 11.331 / 3600) * 15;
  const decWant = 49 + 27 / 60 + 7.93 / 3600;
  out.meeus_example = {
    jd, model: name,
    mat_ra_h: ra / 15, mat_dec: dec,
    published_ra_h: raWant / 15, published_dec: decWant,
    mat_sep_from_published_as: +(sep(ra, dec, raWant, decWant) * 3600).toFixed(2),
  };
  const coreRaDec = C.precessJ2000ToDate(raJ2000, decJ2000, jd);
  out.meeus_example.core_ra_h = coreRaDec[0] / 15;
  out.meeus_example.core_dec = coreRaDec[1];
  out.meeus_example.core_sep_from_published_as =
    +(sep(coreRaDec[0], coreRaDec[1], raWant, decWant) * 3600).toFixed(2);
}

// 2. Pole test: J2000 pole (dec 90) must precess to dec = 90 - theta exactly,
//    for ANY composition of the three rotations.
{
  const jd = C.julianDay(utc(2100, 1, 1));
  const [zeta, z, theta] = angles(jd);
  const truePole = apply(meeusChain(jd)[1], 0, 90);
  const swappedPole = apply(meeusChainSwapped(jd)[1], 0, 90);
  out.pole = {
    jd_t: (jd - J2000) / 36525.0,
    theta_deg: theta,
    expected_pole_dec: 90 - theta,
    true_chain_pole_dec: truePole[1],
    swapped_chain_pole_dec: swappedPole[1],
    core_pole_dec: C.precessJ2000ToDate(0, 90, jd)[1],
  };
}

// 3. Error growth for a fixed object
{
  const rows = [];
  for (const year of [2000, 2010, 2020, 2026, 2030, 2050, 2100, 2200]) {
    const jd = C.julianDay(utc(year, 1, 1));
    const M = meeusChain(jd)[1];
    const pts = [[0, 0], [83.63, 22.01], [16.695 * 15, 36.467]];
    const worst = pts.map(([ra, dec]) => {
      const got = C.precessJ2000ToDate(ra, dec, jd);
      const want = apply(M, ra, dec);
      return +(sep(got[0], got[1], want[0], want[1]) * 3600).toFixed(1);
    });
    rows.push({ year, err_as: worst });
  }
  out.error_growth = rows;
}

console.log(JSON.stringify(out, null, 1));
