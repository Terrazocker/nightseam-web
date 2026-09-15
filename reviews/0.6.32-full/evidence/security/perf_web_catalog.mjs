/* Review-only perf probe: web catalog load + the per-row nightInfo() cost.
 * Usage: node reviews/0.6.32-full/evidence/security/perf_web_catalog.mjs
 * Read-only: reads web/catalog.json and the baked core stub. No writes.
 */
import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ROOT = new URL("../../../../", import.meta.url);
const core = await import(new URL("web/core.js", ROOT));

const catPath = new URL("web/catalog.json", ROOT);
const bytes = statSync(catPath).size;
let t0 = performance.now();
const raw = readFileSync(catPath, "utf8");
const readMs = performance.now() - t0;
t0 = performance.now();
const CAT = JSON.parse(raw);
const parseMs = performance.now() - t0;

const out = {
  catalog_bytes: bytes,
  catalog_objects: CAT.length,
  read_ms: +readMs.toFixed(1),
  json_parse_ms: +parseMs.toFixed(1),
};

/* --- nightInfo cost, measured the way the web app calls it ------------- */
const nightAnchor = new Date(Date.UTC(2026, 1, 14, 0, 0, 0));
const siteNoon = new Date(Date.UTC(2026, 1, 14, 12, 0, 0));
const LAT = 51.0, LON = 7.0;

function timeIt(n, fn) {
  const s = performance.now();
  for (let i = 0; i < n; i++) fn();
  return (performance.now() - s) / n;
}

const perNightInfo = timeIt(40, () => core.nightInfo(nightAnchor, LAT, LON, siteNoon));
out.nightInfo_ms_each = +perNightInfo.toFixed(3);
/* obsNightGrid() -> nightWindow() -> nightInfo() is called once per ROW by
   cachedPctText(), i.e. 60 times for one 60-row catalog page. */
out.catalog_page_nightInfo_ms = +(perNightInfo * 60).toFixed(1);

/* --- full advanced-mode warm: nightStatsBatch over the whole catalog --- */
const info = core.nightInfo(nightAnchor, LAT, LON, siteNoon);
const w = core.pickDarkWindow(info, nightAnchor, siteNoon);
const jd0 = core.julianDay(w.dusk), jd1 = core.julianDay(w.dawn);
const step = 6 / 1440;
const pano = null, minAlt = 25.0;
t0 = performance.now();
let i = 0;
const CHUNK = 250;
while (i < CAT.length) {
  const chunk = CAT.slice(i, i + CHUNK);
  core.nightStatsBatch(chunk, jd0, jd1, step, minAlt, pano, LAT, LON);
  i += CHUNK;
}
out.warm_all_objects_ms = +(performance.now() - t0).toFixed(0);
out.warm_objects = CAT.length;

/* --- the catalog render's comparator, with the % sort ---------------- */
const TIER = core.assignPopularityTiers(CAT);
const obsCache = new Map();
const key = (o) => `2026-02-14|${minAlt.toFixed(2)}|-|${LAT.toFixed(2)}|${LON.toFixed(2)}|${o.id}`;
for (const o of CAT) obsCache.set(key(o), { pct: 42 });
t0 = performance.now();
const sorted = [...CAT].sort((a, b) => {
  const pa = (obsCache.get(key(a)) || {}).pct ?? -1;
  const pb = (obsCache.get(key(b)) || {}).pct ?? -1;
  return pa - pb;
});
out.pct_sort_ms = +(performance.now() - t0).toFixed(1);
out.pct_sort_rows = sorted.length;

t0 = performance.now();
const blob = [...CAT].sort((a, b) => {
  const p = (b.popularity || 0) - (a.popularity || 0);
  return p;
});
out.popularity_sort_ms = +(performance.now() - t0).toFixed(1);
void blob;

t0 = performance.now();
core.assignPopularityTiers(CAT);
out.assignPopularityTiers_ms = +(performance.now() - t0).toFixed(1);

/* --- build the 60-row page HTML the way renderCatalog() does --------- */
const page = CAT.slice(0, 60);
t0 = performance.now();
const html = page.map((o) => `<tr data-id="${o.id}"><td><span class="tname">${o.primary_name}</span></td>` +
  `<td class="tier"><span class="tier-badge t-${(TIER.get(o.id) || "F").toLowerCase()}">${TIER.get(o.id) || "F"}</span></td>` +
  `<td class="num">${o.vmag != null ? o.vmag.toFixed(1) : "—"}</td>` +
  `<td class="num pct" data-objid="${o.id}">…</td>` +
  `<td>${o.constellation}</td><td class="num">x</td>` +
  `<td class="num">${o.ra_hours}</td><td class="num">${o.dec_deg}</td></tr>`).join("");
out.page_html_build_ms = +(performance.now() - t0).toFixed(2);
out.page_html_bytes = html.length;

console.log(JSON.stringify(out, null, 1));
