/*
 * Deterministic regression harness for the night-loader supersession invariant:
 *
 *   An obsolete night calculation must never commit its payload to S.night,
 *   repaint, or clear the busy indicator - even when it resumes AFTER a newer
 *   load has already committed.
 *
 * The bug it pins: static/js/night.js checked `ctl !== _nightCtl` only before
 * `await synthesizeAdvancedTracks(N)`; everything after that await (S.night =
 * N, the timeline, the busy chip) ran unguarded, so a superseded 12k-object
 * load repainted the whole UI with the previous date's data.
 *
 * It drives the REAL module against a stub DOM + fetch, in advanced mode (the
 * only path with an await between the response and the commit). Exit code 0 =
 * invariant held; 1 = violated.
 */
const ROOT = new URL("../../", import.meta.url);

// ---------------------------------------------------------------- stub DOM
const elements = {
  "#siteSelect": { options: [{}, {}], value: "1" },
  "#dateInput": { value: "2026-09-10" },
  "#timeSlider": { max: 0 },
  "#busy": {
    hidden: true,          // true == the "hidden" class is present == not busy
    classList: {
      toggle(_cls, force) { elements["#busy"].hidden = !!force; },
    },
    querySelector() { return null; },
  },
  "#toasts": { appendChild() {} },
};
globalThis.document = {
  querySelector: (sel) => elements[sel] || null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
  createElement: () => ({ classList: {}, style: {}, appendChild() {}, addEventListener() {} }),
  documentElement: { style: { setProperty() {} } },
};
globalThis.window = globalThis;
globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(t) { this.type = t; } };
// authority flip: the harness drives the RETAINED SERVER PATH (client build
// throws at its first line), which is exactly the runtime-fallback flow -
// including the paint frame before the synchronous compute attempt.
globalThis.window.__NS_PLAN_FORCE_FAIL = true;

// ------------------------------------------------------------- stub fetch
const pending = [];
globalThis.fetch = () => new Promise((resolve) => { pending.push(resolve); });
const tick = () => new Promise((r) => setTimeout(r, 0));
const jsonResponse = (body) => ({
  ok: true, status: 200, statusText: "OK",
  json: async () => body,
  headers: { get: () => "application/json" },
});

// --------------------------------------------------------------- fixtures
function payload(day, nAdv, nSamples = 6) {
  const times = [];
  for (let i = 0; i < nSamples; i++) {
    times.push(`2026-09-${day}T${String(20 + i).padStart(2, "0")}:00:00`);
  }
  const objects = [];
  for (let i = 0; i < nAdv; i++) {
    objects.push({ id: `adv${i}`, adv: true, ra_hours: (i % 24), dec_deg: (i % 60) - 30 });
  }
  return {
    site: { lat: 52.5, lon: 13.4, elev: 40 },
    dusk: times[0], dawn: times[times.length - 1],
    moon_illum: 0.3, moon_age_days: 5,
    timeline: { t0: times[0], step_min: 6, n: nSamples, times_iso: times },
    sun_alt: times.map(() => -20), sun_az: times.map(() => 0),
    moon_alt: times.map(() => -10), moon_az: times.map(() => 0),
    objects,
  };
}

const { S } = await import(new URL("static/js/state.js", ROOT).href);
const night = await import(new URL("static/js/night.js", ROOT).href);
S.cfg = { adv_mode: true, min_useful_alt: 25, moon_aware: false,
          planning_client_compute: true };
S.panos = [];

const failures = [];

// ---------------------------------------------- load A, then supersede with B
const payloadA = payload("10", 600);          // large enough to yield mid-synthesis
const payloadB = payload("11", 4);

night.loadNight();                            // schedules doLoadNight(0)
await tick();
await tick();                                 // paint frame, then the fallback fetch
if (pending.length !== 1) failures.push(`expected 1 pending fetch, got ${pending.length}`);
pending.shift()(jsonResponse(payloadA));      // A's response lands
await tick();                                 // A is now inside the synthesis
if (S.night) failures.push("A committed before its synthesis finished");

night.loadNight();                            // the user changes the date: load B
await tick();
await tick();                                 // paint frame, then the fallback fetch
for (let i = 0; i < 5 && pending.length < 1; i++) await tick();
if (pending.length !== 1) failures.push(`expected B's fetch, got ${pending.length}`);
pending.shift()(jsonResponse(payloadB));
for (let i = 0; i < 40; i++) await tick();    // let both continuations finish

if (S.night !== payloadB) {
  failures.push("a superseded load overwrote S.night (stale payload committed)");
}
if (S.night && S.night.timeline.times_iso[0] !== payloadB.timeline.times_iso[0]) {
  failures.push("S.night holds the superseded date's timeline");
}
if (elements["#busy"].hidden !== true) {
  failures.push("the busy indicator was left visible after the current load finished");
}

// --------------------------- and the plain case still commits + clears busy
const payloadC = payload("12", 2);
night.loadNight();
await tick();
await tick();                                 // paint frame, then the fallback fetch
pending.shift()(jsonResponse(payloadC));
for (let i = 0; i < 20; i++) await tick();
if (S.night !== payloadC) failures.push("a current load failed to commit");
if (elements["#busy"].hidden !== true) failures.push("busy not cleared after a normal load");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("supersession invariant held");
