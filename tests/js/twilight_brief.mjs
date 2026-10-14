/*
 * Brief twilight spells and same-level dark windows (core/planning.js).
 *
 * sunCrossings samples every 10 minutes. A dark spell (or a bright one)
 * shorter than a step leaves every sample on one side of the level, so it has
 * to be found between the samples. pickDarkWindow must take dusk and dawn
 * from one level, never an astronomical dusk with a nautical dawn.
 * Synthetic altitude curves make both cases exact. Prints one marker line.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const C = await import(process.argv[2]
  ? pathToFileURL(resolve(process.argv[2])).href
  : new URL("../../core/planning.js", import.meta.url).href);

let ok = true;
const fail = (m) => { ok = false; console.log("  FAIL:", m); };
const jdOf = (ms) => ms / 86400000 + 2440587.5;
const msOf = (jd) => (jd - 2440587.5) * 86400000;
const near = (date, wantJd, label) => {
  if (!date) return fail(`${label}: missing`);
  const err = Math.abs(+date - msOf(wantJd)) / 1000;
  if (err > 2) fail(`${label}: off by ${err.toFixed(1)} s`);
};

const START = Date.UTC(2026, 6, 25, 11, 0);
const jd0 = jdOf(START);
const K = 394.8;        // deg/day^2: curvature of a 20 deg cosine at its turn
const DEPTH = 0.00076;  // reaches the level for +-2 minutes around the turn
const HALF = Math.sqrt(DEPTH / K);

// 1. A 4-minute dip below -18 deg, centred between two samples (12 h 5 min).
{
  const tMin = jd0 + 0.5 + 5 / 1440;
  const alt = (jd) => -18 - DEPTH + K * (jd - tMin) ** 2;
  const r = C.sunCrossings(new Date(START), 0, 0, -18, alt);
  near(r.evening, tMin - HALF, "short night dusk");
  near(r.morning, tMin + HALF, "short night dawn");
}

// 2. After an evening, a 4-minute rise above the level is the morning.
{
  const tMax = jd0 + 1 + 5 / 1440;
  const alt = (jd) => Math.max(5 - 140 * (jd - jd0), DEPTH - K * (jd - tMax) ** 2);
  const r = C.sunCrossings(new Date(START), 0, 0, 0, alt);
  near(r.evening, jd0 + 5 / 140, "evening before a brief rise");
  near(r.morning, tMax - HALF, "brief rise is the morning");
}

// 3. A brief rise before any evening is not a morning; its descent is the evening.
{
  const tMax = jd0 + 0.25 + 5 / 1440;
  const alt = (jd) => DEPTH - K * (jd - tMax) ** 2;
  const r = C.sunCrossings(new Date(START), 0, 0, 0, alt);
  near(r.evening, tMax + HALF, "descent of a brief rise is the evening");
  if (r.morning) fail("a rise before any evening must not become the morning");
}

// 4. No crossing near a turn that stays on one side: nothing is invented.
{
  const tMin = jd0 + 0.5 + 5 / 1440;
  const alt = (jd) => -18 + 0.003 + K * (jd - tMin) ** 2;
  const r = C.sunCrossings(new Date(START), 0, 0, -18, alt);
  if (r.evening || r.morning) fail("a turn 0.003 deg above the level must not cross it");
}

// 5. Dusk and dawn come from the same level.
{
  const t = (h) => new Date(START + h * 3600000);
  const info = { astroDusk: t(10), astroDawn: null,
    nauticalDusk: t(9), nauticalDawn: t(14), civilDusk: t(8), civilDawn: t(15) };
  const w = C.pickDarkWindow(info, new Date(START), new Date(START));
  if (w.level !== "nautical" || +w.dusk !== +t(9) || +w.dawn !== +t(14)) {
    fail(`mixed levels: got ${w.level} ${w.dusk?.toISOString()}..${w.dawn?.toISOString()}`);
  }
}

console.log(ok ? "brief twilight policy held" : "brief twilight policy FAILED");
process.exit(ok ? 0 : 1);
