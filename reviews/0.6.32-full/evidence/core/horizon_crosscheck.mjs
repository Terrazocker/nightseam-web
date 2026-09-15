/* L2 independent cross-check of core/horizon.js contracts, so the lane report
 * does not rest only on a delegate's summary.
 *  1. visibleSkyBands: per column visible and blocked must be an exact partition
 *     of [altBottom, zenith].
 *  2. assumedOpenHatchPolys / skyBandPolygons in BIN space with azOffset != 0.
 *  3. xOfAz / azOfX round trip and the fov=360, azOffset=0 identity.
 *  4. fovBinRel: exactly one representative bin per (azOff, fov) frame start.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const C = await import(pathToFileURL(resolve("core/index.js")).href);

const mk = (over = {}) => ({
  paintMode: "obstacle", fov: 360, azOffset: 0, altBottom: 0, altTop: 60,
  blockAbove: false, profileBins: "world",
  profile: new Array(C.BINS).fill(C.NO_BLOCK),
  profileTop: new Array(C.BINS).fill(C.NO_BLOCK),
  ...over,
});

function bandCovers(bands, lo, hi) {
  // bands: [[from,to], ...] in altitude; true when the union == [lo,hi] exactly
  const ev = [];
  for (const b of bands) { ev.push([b[0], +1]); ev.push([b[1], -1]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let depth = 0, prev = null;
  for (const [x, d] of ev) {
    if (prev === null) {
      if (Math.abs(x - lo) > 1e-9) return false;
    } else if (Math.abs(x - prev) > 1e-9 && depth === 0) return false;
    depth += d;
    prev = x;
  }
  return prev !== null && Math.abs(prev - hi) < 1e-9 && depth === 0;
}

const report = { partition: { cases: 0, violations: [] } };

for (const fov of [360, 270, 180, 45]) {
  for (const azOffset of [0, 0.5, 33, 180, 359.5, 123.4]) {
    for (const paintMode of ["obstacle", "sky"]) {
      for (const blockAbove of [false, true]) {
        const ab = 5, at = 70;
        const p = mk({ fov, azOffset, paintMode, blockAbove, altBottom: ab, altTop: at,
                       profile: new Array(C.BINS).fill(-90),
                       profileTop: new Array(C.BINS).fill(-90) });
        // paint a band on every 3rd bin so both sentinels and real bands appear
        for (let i = 0; i < C.BINS; i += 3) {
          p.profile[i] = 20;
          p.profileTop[i] = blockAbove ? 55 : -90;
        }
        const res = C.visibleSkyBands(p, ab, 90);
        report.partition.cases++;
        for (const col of res) {
          const vis = col.vis || [];
          const blk = col.blocked || [];
          const lo = ab, hi = 90;
          const visOk = bandCovers(vis, lo, hi);
          const blkOk = bandCovers(blk, lo, hi);
          let overlap = false;
          for (const v of vis) {
            for (const b of blk) {
              if (Math.min(v[1], b[1]) - Math.max(v[0], b[0]) > 1e-9) overlap = true;
            }
          }
          if (!visOk || !blkOk || overlap) {
            const belowAb = vis.some((v) => v[0] < ab - 1e-9);
            if (report.partition.violations.length < 6) {
              report.partition.violations.push({
                fov, azOffset, paintMode, blockAbove,
                col: col.az != null ? col.az : null, vis, blk, visOk, blkOk,
                overlap, visStartsBelowAltBottom: belowAb,
              });
            }
            if (belowAb) report.partition.belowAltBottom = (report.partition.belowAltBottom || 0) + 1;
            if (overlap) report.partition.overlaps = (report.partition.overlaps || 0) + 1;
            if (!visOk && !belowAb) report.partition.gapsOrShort = (report.partition.gapsOrShort || 0) + 1;
          }
        }
      }
    }
  }
}

/* 3. xOfAz/azOfX */
{
  const p = mk({ fov: 360, azOffset: 0 });
  const ident = [0, 0.5, 179.5, 359.5, 359.99].map((az) => {
    const x = C.xOfAz(p, az);
    return { az, x, back: C.azOfX(p, x) };
  });
  const partial = mk({ fov: 180, azOffset: 90 });
  const partialRows = [90, 180, 269.5, 270, 0, 45].map((az) => {
    const x = C.xOfAz(partial, az);
    return { az, x, back: +C.azOfX(partial, x).toFixed(6) };
  });
  report.axial = { fov360Identity: ident, partialFov: partialRows };
}

/* 4. fovBinRel frame-start straddler */
{
  const rows = [];
  for (const azOff of [0, 0.5, 33.2, 123.4]) {
    for (const fov of [45, 180, 360]) {
      const reps = [];
      for (let i = 0; i < C.BINS; i++) {
        const r = C.fovBinRel(i, azOff, fov);
        if (r != null) reps.push({ i, r: +r.toFixed(3) });
      }
      const inside = reps.filter((x) => x.r >= 0 && x.r <= fov).length;
      const straddler = reps.filter((x) => x.r < 0.5).length;
      rows.push({ azOff, fov, reps: reps.length, inside, straddler,
                  expectedInside: Math.ceil(fov / 0.5) });
    }
  }
  report.fovBinRel = rows;
}

console.log(JSON.stringify(report, null, 1).slice(0, 6000));
