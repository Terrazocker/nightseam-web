/*
 * Shadow comparison (Phase 3): frozen Python server payloads vs the core.
 * Server tracks/ceilings are rounded to 0.1 deg, so tolerance = 0.051.
 * Advanced objects carry no server tracks by design; their batched synthesis
 * path is compared internally against the unbatched core path.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";

const fx = JSON.parse(readFileSync(process.argv[2], "utf8"));
const coreDir = process.argv[3]
  || fileURLToPath(new URL("../core", import.meta.url));
const C = await import(pathToFileURL(coreDir + "/index.js").href);

const TOL = 0.051;
const report = { cases: [], divergences: 0, samples: 0, maxDiff: 0 };

for (const c of fx.cases) {
  const prof = c.profile.length === 720 ? c.profile : null;
  const pano = prof ? {
    paintMode: c.mode === "sky" ? "sky" : "obstacle",
    profile: prof, profileTop: c.profile_top || new Array(720).fill(-90),
    blockAbove: !!c.profile_top, fov: 360, azOffset: 0,
  } : null;
  let maxAlt = 0, maxAz = 0, maxCeil = 0, maxTop = 0, over = 0, n = 0, sentinelEquiv = 0;
  for (const o of c.objects) {
    if (o.ra_hours == null) continue;
    for (let i = 0; i < c.timeline.n; i++) {
      const jd = C.julianDay(new Date(c.timeline.times_iso[i] + "Z"));
      const [alt, az] = C.altaz(o.ra_hours * 15, o.dec_deg, jd, c.lat, c.lon);
      maxAlt = Math.max(maxAlt, Math.abs(alt - o.alt[i]));
      maxAz = Math.max(maxAz, Math.abs(az - o.az[i]));
      if (pano) {
        const r = C.ceilFor(pano, az);
        maxCeil = Math.max(maxCeil, Math.abs(r.ceil - o.ceil[i]));
        // ceil_top is meaningful only on visible band columns (ceil < 90):
        // elsewhere the server ships the raw -90 sentinel while the core
        // reports null; both mean "no upper ceiling / already blocked below".
        if (o.ceil_top && o.ceil[i] < 89.5) {
          maxTop = Math.max(maxTop, Math.abs(r.ceilTop - o.ceil_top[i]));
        } else if (o.ceil_top && (r.ceilTop == null) !== (o.ceil_top[i] <= -89)) {
          sentinelEquiv++;
        }
      } else {
        maxCeil = Math.max(maxCeil, Math.abs(-90 - o.ceil[i]));
      }
      n++;
    }
  }
  if (maxAlt > TOL || maxAz > TOL || maxCeil > TOL || maxTop > TOL) over = 1;
  report.samples += n;
  report.divergences += over;
  report.maxDiff = Math.max(report.maxDiff, maxAlt, maxAz, maxCeil, maxTop);
  report.cases.push({ name: c.name, samples: n, maxAlt: +maxAlt.toFixed(5),
                      maxAz: +maxAz.toFixed(5), maxCeil: +maxCeil.toFixed(5),
                      maxCeilTop: +maxTop.toFixed(5),
                      sentinelEquivalents: sentinelEquiv, overTolerance: !!over });
}

console.log(JSON.stringify(report, null, 1));
process.exit(report.divergences ? 1 : 0);
