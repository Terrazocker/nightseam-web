/* L2 probe: core/astro.js::altaz azimuth contract.
 * Doc/contract: az is degrees in [0, 360). It can return EXACTLY 360 because
 *   let az = (Math.atan2(east, north) * R2D) % 360;
 *   if (az < 0) az += 360;
 * turns a tiny negative az (-1e-13) into 360 via floating-point rounding.
 * Deterministic search for exact-360 outputs.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const C = await import(pathToFileURL(resolve("core/index.js")).href);
const utc = (y, mo, d, h = 0, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h, mi));

const hits = [];
let n = 0;
outer:
for (const lat of [-89.9, -66.5, -51.5, -23.5, 0, 23.5, 51.5, 66.5, 89.9]) {
  for (const dec of [-90, -45, 0, 45, 90]) {
    for (let ra = 0; ra < 360; ra += 0.5) {
      for (let h = 0; h < 24; h += 0.25) {
        const jd = C.julianDay(utc(2026, 3, 20, Math.floor(h), (h % 1) * 60));
        const [alt, az] = C.altaz(ra, dec, jd, lat, 0);
        n++;
        if (az === 360) {
          hits.push({ lat, dec, ra: +ra.toFixed(1), h: +h.toFixed(2), alt: +alt.toFixed(9), az });
          if (hits.length >= 4) break outer;
        }
      }
    }
  }
}
console.log(JSON.stringify({
  samples: n,
  exact360: hits.length,
  hits,
  rawAtan2Case: (() => {
    if (!hits.length) return null;
    const h0 = hits[0];
    const jd = C.julianDay(utc(2026, 3, 20, Math.floor(h0.h), (h0.h % 1) * 60));
    // recompute the pre-refraction geometry for the reported case
    const D2R = Math.PI / 180;
    const R2D = 180 / Math.PI;
    const [raP, decP] = C.precessJ2000ToDate(h0.ra, h0.dec, jd);
    let ha = (C.gmstDeg(jd) + 0 - raP) % 360;
    if (ha > 180) ha -= 360;
    const hh = D2R * ha, dd = D2R * decP, pp = D2R * h0.lat;
    const east = -Math.cos(dd) * Math.sin(hh);
    const north = Math.sin(dd) * Math.cos(pp) - Math.cos(dd) * Math.sin(pp) * Math.cos(hh);
    const raw = Math.atan2(east, north) * R2D;
    return { east, north, rawDeg: raw, rawMod360: raw % 360, afterAdd: (raw % 360) + 360 };
  })(),
}, null, 1));
