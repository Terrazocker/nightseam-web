/* Review-only perf probe: desktop night build over the FULL advanced catalog.
 * Mirrors static/js/planning_client.js::syncBuildClientNight's core calls
 * (GRID_N=241 samples, TRACK_CHUNK, computeNightTracks). Read-only.
 * Usage: node reviews/0.6.32-full/evidence/security/perf_desktop_night.mjs
 */
import { readFileSync } from "node:fs";

const ROOT = new URL("../../../../", import.meta.url);
const core = await import(new URL("static/js/core.js", ROOT));

const CAT = JSON.parse(readFileSync(new URL("web/catalog.json", ROOT), "utf8"));
const STANDARD = CAT.filter((o) => !o._adv);
const ADV = CAT.filter((o) => o._adv);

const GRID_N = 241, GRID_STEP_MIN = 6, TRACK_CHUNK = 400;
const LAT = 51.0, LON = 7.0;
const noon = Date.UTC(2026, 1, 14, 12, 0, 0);
const jds = [];
for (let i = 0; i < GRID_N; i++) {
  jds.push(core.julianDay(new Date(noon + i * GRID_STEP_MIN * 60000)));
}
const stepJd = GRID_STEP_MIN / 1440;

function build(catalog, label) {
  const t0 = performance.now();
  const objects = [];
  for (let start = 0; start < catalog.length; start += TRACK_CHUNK) {
    const chunk = catalog.slice(start, start + TRACK_CHUNK);
    const tracks = core.computeNightTracks(chunk, jds[0], jds[jds.length - 1],
                                           stepJd, LAT, LON);
    const count = tracks.count;
    for (let k = 0; k < chunk.length; k++) {
      const o = chunk[k];
      const base = k * count;
      const alts = new Array(count), azs = new Array(count), ceils = new Array(count);
      let maxI = 0, maxRaw = -Infinity;
      for (let i = 0; i < count; i++) {
        const a = tracks.alt[base + i], z = tracks.az[base + i];
        alts[i] = Math.round(a * 10) / 10;
        azs[i] = Math.round(z * 10) / 10;
        ceils[i] = Math.round(core.ceilFor(null, z) * 10) / 10;
        if (a > maxRaw) { maxRaw = a; maxI = i; }
      }
      objects.push({ id: o.id, alt: alts, az: azs, ceil: ceils,
                     max_alt: maxRaw, max_i: maxI });
    }
  }
  const ms = performance.now() - t0;
  const samples = catalog.length * GRID_N;
  return { label, objects: objects.length, samples, ms: +ms.toFixed(0),
           samples_per_s: Math.round(samples / (ms / 1000)) };
}

const m0 = process.memoryUsage().heapUsed;
const std = build(STANDARD, "standard(200)");
const adv = build(ADV, "advanced(11976)");
const m1 = process.memoryUsage().heapUsed;
console.log(JSON.stringify({
  catalog_total: CAT.length,
  standard: std,
  advanced: adv,
  combined_ms: std.ms + adv.ms,
  heap_mb_after_tracks: +((m1 - m0) / 1048576).toFixed(1),
  rss_mb: +(process.memoryUsage().rss / 1048576).toFixed(1),
}, null, 1));
