/*
 * PROBE (desktop lane): the 24 h payload grid + the viewFullDay toggle.
 *
 * Drives the REAL static/js/night.js + planning_client.js + derive.js under
 * Node (no browser) and measures:
 *   1. grid length / step / span of the built payload (local noon -> noon)
 *   2. the scrub range with view_full_day OFF and ON
 *   3. that toggling OFF clamps S.tIdx back inside the range (header.js
 *      applyScrubRange is the production path; called directly here)
 *   4. that no index can point one past the end (max index is tl.n-1)
 *   5. the scoring clip (dusk..dawn) is unchanged by the toggle
 *
 * Run: node reviews/0.6.32-full/evidence/desktop/grid_fullday.mjs
 */
import { pathToFileURL } from "node:url";

const ROOT = pathToFileURL("<workspace>/AstroPilot-local/").href;
const realSetTimeout = globalThis.setTimeout;

/* ---- DOM --------------------------------------------------------------- */
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
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };
globalThis.requestAnimationFrame = (cb) => realSetTimeout(() => cb(0), 1);
globalThis.Worker = undefined;                 // force the SYNC path (deterministic)

const CAT = [
  { id: "m42", primary_name: "M42", ra_hours: 5.588, dec_deg: -5.39, vmag: 4, otype: "nebula" },
  { id: "m31", primary_name: "M31", ra_hours: 0.712, dec_deg: 41.27, vmag: 3.4, otype: "galaxy" },
  { id: "ngc7000", primary_name: "NGC 7000", ra_hours: 20.98, dec_deg: 44.5, vmag: 4, otype: "nebula" },
];
const json = (b) => ({ ok: true, status: 200, statusText: "OK", json: async () => b });
globalThis.fetch = async (u) => {
  const s = String(u);
  if (s.startsWith("/api/sites")) return json([{ id: 1, name: "Home", lat: 52.5, lon: 13.4, elev: 40 }]);
  if (s.startsWith("/api/catalog")) return json(CAT);
  throw new Error("unexpected fetch " + s);
};

const { S } = await import(ROOT + "static/js/state.js");
const derive = await import(ROOT + "static/js/derive.js");
const night = await import(ROOT + "static/js/night.js");
await import(ROOT + "static/js/header.js");   // applyScrubRange

S.cfg = { adv_mode: false, bortle: 4, moon_aware: false, filters: { broadband: true },
          min_useful_alt: 25, min_useful_alt_explicit: true, view_full_day: false,
          sites: [{ id: 1 }], active_site_id: 1 };
S.activeSiteId = 1;
S.minAlt = 25;
S.catalog = CAT;
S.panos = [];
S.meta = {};
for (const o of CAT) S.meta[o.id] = o;

night.loadNight();
for (let i = 0; i < 400 && !S.night; i++) await new Promise((r) => realSetTimeout(r, 10));
if (!S.night) { console.error("FAIL: no night payload built"); process.exit(1); }

const tl = S.night.timeline;
const t0 = Date.parse(tl.times_iso[0] + "Z");
const t1 = Date.parse(tl.times_iso[tl.n - 1] + "Z");
console.log("grid n           :", tl.n, "step_min", tl.step_min);
console.log("grid span hours  :", ((t1 - t0) / 3600000).toFixed(3));
console.log("grid t0/t1 UTC   :", tl.times_iso[0], "/", tl.times_iso[tl.n - 1]);
console.log("date_local/tz    :", S.night.date_local, S.night.tz_offset_min);
console.log("objects          :", S.night.objects.length,
            "| alt arrays of len", S.night.objects[0].alt.length);
console.log("dusk/dawn        :", S.night.dusk, "/", S.night.dawn);

const off = derive.scrubWindowRange();
const scoreOff = derive.nightIndexRange();
console.log("scrub OFF        :", JSON.stringify(off), " scoring clip", JSON.stringify(scoreOff));

S.cfg.view_full_day = true;
const on = derive.scrubWindowRange();
const scoreOn = derive.nightIndexRange();
console.log("scrub ON         :", JSON.stringify(on), " scoring clip", JSON.stringify(scoreOn));

/* toggle ON -> pick the last index -> toggle OFF (header.js:91-97 path) */
S.tIdx = on[1];
S.cfg.view_full_day = false;
const header = await import(ROOT + "static/js/header.js");
header.applyScrubRange();
console.log("after ON->OFF    : tIdx", S.tIdx, "slider", elements["#timeSlider"].min,
            "-", elements["#timeSlider"].max, "| in range:",
            S.tIdx >= off[0] && S.tIdx <= off[1]);

/* index one past the end must never be selectable or rendered */
console.log("max selectable   : scrub", on[1], "grid n-1", tl.n - 1,
            "| times_iso[n-1] exists:", !!tl.times_iso[tl.n - 1],
            "| times_iso[n] is:", String(tl.times_iso[tl.n]));
const cur = derive.curTimeISO();
console.log("curTimeISO valid :", typeof cur === "string" && !cur.includes("undefined"), cur);
process.exit(0);
