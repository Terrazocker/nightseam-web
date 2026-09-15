/*
 * PROBE (desktop lane, 0.6.32 full review): does a SECOND preference change
 * while the first worker `prefs` request is in flight leave the first
 * promise unsettled?
 *
 * static/js/planning_worker.js:44-48 sets latestPrefsGen synchronously in
 * self.onmessage, then calls runPrefs(m); runPrefs:218 returns WITHOUT
 * posting when m.gen < latestPrefsGen. Because Worker message delivery is
 * strictly ordered and onmessage is synchronous, latestPrefsGen always
 * equals m.gen at that comparison -> the branch is dead and every prefs
 * message is answered. This probe measures the main-thread side: every
 * promise ask() created must settle.
 *
 * The fake worker mirrors the REAL rule (set latestPrefsGen at dispatch,
 * compare at run) rather than assuming the answer.
 *
 * Run: node reviews/0.6.32-full/evidence/desktop/prefs_burst.mjs
 */
import { pathToFileURL } from "node:url";

const ROOT = pathToFileURL("<workspace>/AstroPilot-local/").href;

/* shrink planning_client.js's 120 s worker timeout so the probe is quick */
const realSetTimeout = globalThis.setTimeout;
let timeoutFired = 0;
globalThis.setTimeout = (fn, ms, ...a) =>
  realSetTimeout(() => { if (ms >= 100000) timeoutFired++; fn(); },
                 ms >= 100000 ? 120 : ms, ...a);

/* ---- minimal DOM ------------------------------------------------------- */
const elements = {
  "#siteSelect": { options: [{}, {}], value: "1" },
  "#dateInput": { value: "2026-09-12" },
  "#timeSlider": { min: "0", max: "240", value: "0" },
  "#busy": { hidden: true, classList: { toggle(_c, f) { elements["#busy"].hidden = !!f; } },
             querySelector() { return null; } },
  "#toasts": { appendChild() {} },
};
globalThis.document = {
  querySelector: (s) => elements[s] || null,
  querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  dispatchEvent: () => true,
  createElement: () => ({ classList: {}, style: {}, appendChild() {}, addEventListener() {} }),
  documentElement: { style: { setProperty() {} }, setAttribute() {} },
};
globalThis.window = globalThis;
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };
globalThis.requestAnimationFrame = (cb) => realSetTimeout(() => cb(0), 1);

/* ---- fake worker: the REAL prefs generation rule ----------------------- */
let latestPrefsGen = -1;
const delivered = [];
const dropped = [];
let terminated = false;
class FaithfulWorker {
  constructor() { this.onmessage = null; this.onerror = null; }
  postMessage(m) {
    if (terminated) return;
    realSetTimeout(() => {                       // queued delivery
      if (terminated) return;
      if (m.type !== "prefs") return;
      latestPrefsGen = m.gen;                    // planning_worker.js:45
      if (m.gen < latestPrefsGen) { dropped.push(m.gen); return; }  // :218
      delivered.push(m.gen);
      if (this.onmessage) this.onmessage({ data: { gen: m.gen, type: "prefs",
        derived: { visBits: new Uint8Array(1), aboveBits: new Uint8Array(1),
                   obsPct: new Int32Array(1), blockedN: new Int32Array(1),
                   score: new Float64Array(1), scoreMoon: new Float64Array(1),
                   bS: new Int32Array([-1]), bE: new Int32Array([-1]),
                   aS: new Int32Array([-1]), aE: new Int32Array([-1]) } } });
    }, 0);
  }
  terminate() { terminated = true; }
}
globalThis.Worker = FaithfulWorker;

/* ---- fetch + app state ------------------------------------------------- */
const json = (b) => ({ ok: true, status: 200, statusText: "OK", json: async () => b });
globalThis.fetch = async (u) => {
  const s = String(u);
  if (s.startsWith("/api/sites")) return json([{ id: 1, name: "Home", lat: 52.5, lon: 13.4 }]);
  if (s.startsWith("/api/catalog")) return json([]);
  throw new Error("unexpected fetch " + s);
};

const { S } = await import(ROOT + "static/js/state.js");
const pc = await import(ROOT + "static/js/planning_client.js");

S.cfg = { adv_mode: false, bortle: 4, moon_aware: false, filters: { broadband: true } };
S.minAlt = 25;
S.night = { timeline: { n: 1, step_min: 6, times_iso: ["2026-09-12T12:00:00"] },
            objects: [{ id: "a", alt: [40], az: [180], ceil: [-90] }],
            moon_alt: [0], moon_az: [0], moon_illum: 0, moon_age_days: 0,
            dusk: null, dawn: null, _derivedReady: true };
S.meta = { a: { id: "a", otype: "galaxy" } };

const settle = [];
const watch = (p, name) => {
  const rec = { name, state: "pending" };
  settle.push(rec);
  p.then(() => { rec.state = "resolved"; }, () => { rec.state = "rejected"; });
  return rec;
};

/* --- probe 1: ONE prefs change (baseline) ------------------------------- */
watch(pc.requestPrefsDerived(), "single");
await new Promise((r) => realSetTimeout(r, 40));
console.log("probe1 one prefs   :", settle.map((x) => x.name + "=" + x.state).join(", "),
            "| delivered", JSON.stringify(delivered), "| dropped", JSON.stringify(dropped));

/* --- probe 2: many prefs changes back-to-back (ONE slider drag) --------- */
delivered.length = 0; dropped.length = 0; settle.length = 0;
for (let i = 0; i < 8; i++) watch(pc.requestPrefsDerived(), "p" + i);
await new Promise((r) => realSetTimeout(r, 80));
console.log("probe2 eight prefs :", settle.map((x) => x.name + "=" + x.state).join(", "),
            "| delivered", JSON.stringify(delivered), "| dropped", JSON.stringify(dropped));

/* --- probe 3: after the (shrunk) timeout window, is the worker still ok? - */
await new Promise((r) => realSetTimeout(r, 200));
settle.length = 0; delivered.length = 0; dropped.length = 0;
watch(pc.requestPrefsDerived(), "late");
await new Promise((r) => realSetTimeout(r, 60));
console.log("probe3 after window:", settle.map((x) => x.name + "=" + x.state).join(", "),
            "| delivered", JSON.stringify(delivered), "| dropped", JSON.stringify(dropped),
            "| worker terminated:", terminated, "| timeouts fired:", timeoutFired);
process.exit(0);
