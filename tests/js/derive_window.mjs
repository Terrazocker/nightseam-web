/* Regression harness for the desktop night derivation (static/js/derive.js).

   Contract: the clear window, the "% of night" and the score are measured
   WITHIN the dark window (dusk..dawn). The payload grid carries an extra hour
   of twilight on each side for chart context - counting it made the desktop
   advertise windows that included daylight (measured on a real payload:
   164/197 objects, worst 690 min for a 590-min night) and score samples the
   web never sees.

   Builds a synthetic payload (no DB, no network) and asserts the invariant.
*/
const { S } = await import(new URL("../../static/js/state.js", import.meta.url).href);
const { recomputeNightDerived } = await import(new URL("../../static/js/derive.js", import.meta.url).href);

const STEP = 6;
const N = 40;                       // 4 h of samples
const times = [];
for (let i = 0; i < N; i++) {
  const mins = 18 * 60 + i * STEP;
  times.push(`2026-09-10T${String(Math.floor(mins / 60)).padStart(2, "0")}:`
             + `${String(mins % 60).padStart(2, "0")}:00`);
}
// dark window = samples 10..29 (two hours of twilight margins on each side)
const dusk = times[10];
const dawn = times[29];

function obj(id, altFn) {
  const alt = [];
  for (let i = 0; i < N; i++) alt.push(Math.round(altFn(i) * 10) / 10);
  return { id, alt, az: alt.map(() => 180), ceil: alt.map(() => -90), max_alt: 60,
           max_i: 0 };
}

const always = obj("always", () => 60);                 // clear in every sample
const onlyTwilight = obj("twilight", (i) => (i < 10 || i > 29 ? 60 : -10));
const half = obj("half", (i) => (i >= 22 && i <= 33 ? 60 : -10));
const below = obj("below", () => -5);

S.night = {
  timeline: { t0: times[0], step_min: STEP, n: N, times_iso: times },
  dusk, dawn, moon_illum: 0, moon_age_days: 0,
  sun_alt: times.map(() => -20), sun_az: times.map(() => 0),
  moon_alt: times.map(() => -10), moon_az: times.map(() => 0),
  objects: [always, onlyTwilight, half, below],
};
S.meta = {};
for (const o of S.night.objects) S.meta[o.id] = { otype: "galaxy" };
S.minAlt = 25;
S.cfg = { moon_aware: false, bortle: 4, filters: { broadband: true } };
S.panos = [];

recomputeNightDerived();

const failures = [];
const idx = (iso) => times.indexOf(iso);

// 1) an object clear in all 40 samples must report the DARK window only
if (always.best[0] !== idx(dusk) || always.best[1] !== idx(dawn) + 1) {
  failures.push(`always: best=${JSON.stringify(always.best)} expected `
                + `[${idx(dusk)}, ${idx(dawn) + 1}] (the dark window)`);
}
// 2) an object clear ONLY in the twilight margins has no clear window at all
if (onlyTwilight.best !== null) {
  failures.push(`twilight-only object got best=${JSON.stringify(onlyTwilight.best)}`);
}
// 3) a run crossing the window edge is clipped at the edge
if (half.best[0] !== 22 || half.best[1] !== idx(dawn) + 1) {
  failures.push(`half: best=${JSON.stringify(half.best)} expected [22, ${idx(dawn) + 1}]`);
}
// 4) percentages stay inside 0..100 and use the clipped denominator
for (const o of S.night.objects) {
  if (o.obs_pct < 0 || o.obs_pct > 100) failures.push(`${o.id}: obs_pct=${o.obs_pct}`);
}
if (always.obs_pct !== 100) failures.push(`always: obs_pct=${always.obs_pct} expected 100`);
if (onlyTwilight.obs_pct !== 0) failures.push(`twilight: obs_pct=${onlyTwilight.obs_pct} expected 0`);
if (below.obs_pct !== 0) failures.push(`below: obs_pct=${below.obs_pct} expected 0`);
// 5) the score counts only the dark window: 20 samples of sin(60 deg)
const want = Math.round(20 * Math.sin(60 * Math.PI / 180) * 10) / 100;
if (Math.abs(always.score - want) > 0.02) {
  failures.push(`always: score=${always.score} expected ~${want} (20 dark samples)`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("derive window contract held");
