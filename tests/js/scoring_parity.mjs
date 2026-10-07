/*
 * Scoring parity proof (Phase 3b): the batched engine against the PRE-CHANGE
 * characterization goldens. Those historical aggregates count the terminal
 * node as a whole extra cell. Keep their bytes and validate their original
 * counters with a direct per-sample oracle, then compare the bounded engine
 * against that oracle without the terminal node. The astronomical fields and
 * transit index remain unchanged; continuous score doubles are allowed the
 * owner-authorized precess-once drift (maxAlt <= 1e-5 deg, scores <= 2e-5).
 *
 * The INPUT objects are part of the golden (`g.objects`, baked into the fixture
 * when the curated catalog was removed): the proof must not silently re-point at
 * different objects because web/catalog.json changed. The old engine rebuilt its
 * inputs from the shipped catalog, so any catalog edit looked like a regression.
 *
 * Usage: node tests/js/scoring_parity.mjs <goldens.json> [coreDir]
 * The mutation test passes a tampered core copy and expects exit != 0.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const goldensPath = process.argv[2];
const coreDir = process.argv[3] || fileURLToPath(new URL("../../core", import.meta.url));
const g = JSON.parse(readFileSync(goldensPath, "utf8"));
const C = await import(pathToFileURL(coreDir + "/index.js").href);
const objects = g.objects;
if (!Array.isArray(objects) || !objects.length) {
  throw new Error("the goldens carry no `objects` inputs - the parity proof needs them baked in");
}

const DISPLAY = ["n", "blocked", "blockedPct"];
let ok = true;
const fail = (m) => { ok = false; console.log("  FAIL:", m); };
let maxDAlt = 0, maxDScore = 0, maxDMoon = 0;

// Independent of scoreNightTracks: direct per-sample precession/altaz (the
// historical algorithm), an array of visible indices, and exhaustive run
// enumeration. The bounded interval has exactly n cells; the old fixture has
// n+1 nodes. No fixture values are regenerated or loosened for the bug fix.
function oracle(obj, c, ctx) {
  const visible = [];
  let terminalClassic = 0, terminalMoon = 0;
  for (let i = 0; i <= g.n; i++) {
    const jd = g.jd0 + i * g.step;
    const [alt, az] = C.altaz(obj.ra_hours * 15, obj.dec_deg, jd, c.lat, c.lon);
    const clear = alt >= c.minAlt && alt > -90 && alt < 90.5;
    visible.push(clear);
    if (i === g.n && clear) {
      terminalClassic = Math.sin(Math.max(0, Math.min(90, alt)) * Math.PI / 180);
      terminalMoon = terminalClassic;
      if (c.moon && ctx.moonAlt[i] > 0) {
        const minDist = 120 / (1 + Math.pow((0.5 - 9.5 / 29.53) / 0.333, 2));
        const separation = C.sepDeg(alt, az, ctx.moonAlt[i], ctx.moonAz[i]);
        const glow = 0.7 * Math.max(0, 1 - Math.max(0, separation - minDist) / 180);
        terminalMoon *= Math.max(0.05, 1 - 0.95 * glow * 0.8 * 0.76);
      }
    }
  }
  const aggregate = (length) => {
    const indices = visible.slice(0, length).flatMap((clear, i) => clear ? [i] : []);
    const runs = indices.reduce((all, i) => {
      const last = all.at(-1);
      if (last && last.at(-1) === i - 1) last.push(i);
      else all.push([i]);
      return all;
    }, []);
    const best = runs.reduce((longest, run) => run.length > longest.length ? run : longest, []);
    const bestStart = best.length ? g.jd0 + best[0] * g.step : g.jd0;
    const bestEnd = best.length ? Math.min(g.jd0 + g.n * g.step,
      g.jd0 + (best.at(-1) + 1) * g.step) : null;
    return {
      visN: indices.length, bestRun: best.length, bestStart, bestEnd,
      pct: Math.round(100 * indices.length / length),
      visibleMinutes: indices.length * g.step * 1440,
    };
  };
  return { legacy: aggregate(g.n + 1), bounded: aggregate(g.n), terminalClassic, terminalMoon };
}

for (const c of g.cases) {
  const objs = objects.slice(0, c.stats.length);
  const ctx = {};
  if (c.moon) {
    ctx.moonAware = true; ctx.illum = 0.7; ctx.moonAgeDays = 9.5;
    ctx.filterType = "lrgb"; ctx.typeF = 0.8; ctx.bortleF = 0.76;
    ctx.moonAlt = []; ctx.moonAz = [];
    for (let i = 0; i <= g.n; i++) {
      const jd = g.jd0 + i * g.step;
      const [ra, dec] = C.moonRaDec(jd);
      const [a, z] = C.altaz(ra, dec, jd, c.lat, c.lon);
      ctx.moonAlt.push(a); ctx.moonAz.push(z);
    }
  }
  const got = C.nightStatsBatch(objs, g.jd0, g.jd0 + g.n * g.step, g.step,
                                c.minAlt, null, c.lat, c.lon, ctx);
  // the split path must be bit-identical to the one-shot form
  const tracks = C.computeNightTracks(objs, g.jd0, g.jd0 + g.n * g.step, g.step, c.lat, c.lon);
  const viaTracks = C.scoreNightTracks(tracks, objs, g.jd0, g.step, c.minAlt, null, ctx);
  for (const f of ["n", "maxAlt", "transitJd", "visN", "blocked", "bestRun",
                   "bestStart", "bestEnd", "bestMinutes", "visibleMinutes",
                   "windowMinutes", "sClassic", "sMoon", "pct", "blockedPct"]) {
    for (let k = 0; k < got.length; k++) {
      if (!Object.is(got[k][f], viaTracks[k][f])) {
        fail(`${c.name}[${k}] split mismatch on ${f}`);
      }
    }
  }
  for (let k = 0; k < got.length; k++) {
    const a = c.stats[k], b = got[k];
    const expected = oracle(objs[k], c, ctx);
    for (const f of DISPLAY) if (a[f] !== b[f]) {
      fail(`${c.name}[${k}] ${f}: ${a[f]} != ${b[f]}`);
    }
    for (const f of ["visN", "bestRun", "bestStart", "pct"]) {
      if (a[f] !== expected.legacy[f]) fail(`${c.name}[${k}] historical oracle ${f}: ${a[f]} != ${expected.legacy[f]}`);
      if (b[f] !== expected.bounded[f]) fail(`${c.name}[${k}] bounded oracle ${f}: ${b[f]} != ${expected.bounded[f]}`);
    }
    if ((b.bestEnd == null || expected.bounded.bestEnd == null)
        ? b.bestEnd !== expected.bounded.bestEnd
        : Math.abs(b.bestEnd - expected.bounded.bestEnd) > 1e-9) {
      fail(`${c.name}[${k}] bounded endpoint moved`);
    }
    if (Math.abs(b.visibleMinutes - expected.bounded.visibleMinutes) > 0.00001) {
      fail(`${c.name}[${k}] bounded visible duration moved`);
    }
    const bestMinutes = expected.bounded.bestEnd == null ? 0
      : (expected.bounded.bestEnd - expected.bounded.bestStart) * 1440;
    if (Math.abs(b.bestMinutes - bestMinutes) > 0.00001) fail(`${c.name}[${k}] bounded best duration moved`);
    if (a.transitJd !== b.transitJd) fail(`${c.name}[${k}] transit index moved`);
    maxDAlt = Math.max(maxDAlt, Math.abs(a.maxAlt - b.maxAlt));
    maxDScore = Math.max(maxDScore, Math.abs(a.sClassic - expected.terminalClassic - b.sClassic));
    maxDMoon = Math.max(maxDMoon, Math.abs(a.sMoon - expected.terminalMoon - b.sMoon));
  }
}
if (maxDAlt > 1e-5) fail(`maxAlt drift ${maxDAlt}`);
if (maxDScore > 2e-5 || maxDMoon > 2e-5) fail(`score drift ${maxDScore}/${maxDMoon}`);
console.log(ok ? "scoring batched parity held" : "scoring batched parity FAILED");
process.exit(ok ? 0 : 1);
