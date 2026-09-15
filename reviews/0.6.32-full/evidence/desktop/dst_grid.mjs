/*
 * PROBE (desktop lane): the payload grid is a FIXED 241 x 6 min = exactly 24 h
 * from `Date.UTC(date,12:00) - tz_offset_at_local_noon(date)`.
 * AGENTS.md calls it "local noon -> next local noon". On a DST transition day
 * the next LOCAL noon is 23 h or 25 h away, so the two cannot both be true.
 * Measures which one the shipped builder produces, and what the scoring clip
 * does with dusk/dawn that fall outside / beyond the grid.
 *
 * Run: node reviews/0.6.32-full/evidence/desktop/dst_grid.mjs
 */
import { pathToFileURL } from "node:url";

const ROOT = pathToFileURL("<workspace>/AstroPilot-local/").href;
const realSetTimeout = globalThis.setTimeout;

const elements = {
  "#siteSelect": { options: [{}, {}], value: "1" },
  "#dateInput": { value: "2026-03-29" },
  "#timeSlider": { min: "0", max: "240", value: "0" },
  "#busy": { hidden: true, classList: { toggle(_c, f) { elements["#busy"].hidden = !!f; } },
             querySelector() { return null; } },
  "#toasts": { appendChild() {} },
};
globalThis.document = {
  querySelector: (s) => elements[s] || null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
  createElement: () => ({ classList: {}, style: {}, appendChild() {}, addEventListener() {} }),
  documentElement: { style: { setProperty() {} }, setAttribute() {} },
};
globalThis.window = globalThis;
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };
globalThis.requestAnimationFrame = (cb) => realSetTimeout(() => cb(0), 1);
globalThis.Worker = undefined;                      // sync path, deterministic

const CAT = [{ id: "m42", primary_name: "M42", ra_hours: 5.588, dec_deg: -5.39,
               vmag: 4, otype: "nebula" }];
const SITES = {
  berlin: { id: 1, name: "Berlin", lat: 52.52, lon: 13.405, elev: 34 },
};
const json = (b) => ({ ok: true, status: 200, statusText: "OK", json: async () => b });
let site = SITES.berlin;
globalThis.fetch = async (u) => {
  const s = String(u);
  if (s.startsWith("/api/sites")) return json([site]);
  if (s.startsWith("/api/catalog")) return json(CAT);
  throw new Error("unexpected fetch " + s);
};

const { S } = await import(ROOT + "static/js/state.js");
const util = await import(ROOT + "static/js/util.js");
const derive = await import(ROOT + "static/js/derive.js");
const night = await import(ROOT + "static/js/night.js");

function localNoonISO(dateStr, zone) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const off = util.tzOffAt.call(null, dateStr);      // uses effZone()
  return new Date(Date.UTC(y, m - 1, d, 12) - off * 60000);
}

async function probe(zone, dates) {
  util.setDisplayZone(zone);
  S.cfg = { adv_mode: false, bortle: 4, moon_aware: false, filters: { broadband: true },
            min_useful_alt: 25, min_useful_alt_explicit: true, view_full_day: false,
            sites: [{ id: 1 }], active_site_id: 1 };
  S.activeSiteId = 1; S.minAlt = 25; S.catalog = CAT; S.panos = []; S.meta = {};
  for (const o of CAT) S.meta[o.id] = o;
  const pc = await import(ROOT + "static/js/planning_client.js");
  pc.invalidatePlanCache();
  for (const date of dates) {
    elements["#dateInput"].value = date;
    S.night = null;
    night.loadNight();
    for (let i = 0; i < 300 && !S.night; i++) await new Promise((r) => realSetTimeout(r, 10));
    if (!S.night) { console.log(zone, date, "-> NO PAYLOAD"); continue; }
    const tl = S.night.timeline;
    const t0 = Date.parse(tl.times_iso[0] + "Z");
    const t1 = Date.parse(tl.times_iso[tl.n - 1] + "Z");
    /* what the NEXT local noon actually is */
    const [y, m, d] = date.split("-").map(Number);
    const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
    const nextStr = nextDay.toISOString().slice(0, 10);
    const noon0 = Date.UTC(y, m - 1, d, 12) - util.tzOffAt(date) * 60000;
    const noon1 = Date.UTC(y, m - 1, d + 1, 12) - util.tzOffAt(nextStr) * 60000;
    const realSpanH = (noon1 - noon0) / 3600000;
    const score = derive.nightIndexRange();
    const duskIdx = tl.times_iso.findIndex((s) => s === S.night.dusk);
    const dawnIdx = tl.times_iso.findIndex((s) => s === S.night.dawn);
    console.log(`${zone} ${date} grid=${((t1 - t0) / 3600000).toFixed(2)}h ` +
      `realNoonToNoon=${realSpanH.toFixed(2)}h tzOff=${util.tzOffAt(date)} ` +
      `dusk=${S.night.dusk} (exact grid idx ${duskIdx}) ` +
      `dawn=${S.night.dawn} (exact grid idx ${dawnIdx}) clip=${JSON.stringify(score)} n=${tl.n}`);
  }
}
await probe("Europe/Berlin", ["2026-03-28", "2026-03-29", "2026-03-30", "2026-10-25"]);
await probe("America/New_York", ["2026-03-07", "2026-03-08", "2026-11-01"]);
await probe("Australia/Lord_Howe", ["2026-10-03", "2026-10-04"]);   // 30-min DST
process.exit(0);
