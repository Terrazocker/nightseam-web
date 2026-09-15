/* Review-only probe (L8/L9): what a malformed the popularity source response does to the
 * web ranking. Mirrors web/app.js:96-120 (loadPopularity/popularityOf/
 * popularityFactor) against the real baked core scoring module.
 * Usage: node reviews/0.6.32-full/evidence/security/popularity_malformed.mjs
 */
import { readFileSync } from "node:fs";

const ROOT = new URL("../../../../", import.meta.url);
const core = await import(new URL("web/core.js", ROOT));
const CAT = JSON.parse(readFileSync(new URL("web/catalog.json", ROOT), "utf8"));

const popKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/* exactly web/app.js::loadPopularity's map build + popularityOf lookup */
function buildMap(raw) {
  const m = {};
  for (const [k, v] of Object.entries(raw)) m[popKey(k)] = v;
  return m;
}
function popularityOf(map, o) {
  if (map) {
    for (const k of [o.messier, o.ngcic, o.primary_name].filter(Boolean)) {
      const v = map[popKey(k)];
      if (v) return v;
    }
  }
  return o.popularity || 0;
}
const factor = (o, map) => core.popularityFactor(popularityOf(map, o));

const m42 = CAT.find((o) => o.messier === "M42") || CAT[0];

const cases = {
  wellformed: { "M 42": 165350 },
  numeric_strings: { "M 42": "165350" },
  non_numeric_string: { "M 42": "n/a" },
  nested_object: { "M 42": { score: 12 } },
  boolean: { "M 42": true },
  null_value: { "M 42": null },
  wrong_shape_array: [1, 2, 3],
};

const out = {};
for (const [label, raw] of Object.entries(cases)) {
  let map = null;
  try { map = buildMap(raw); } catch (e) { out[label] = { map_error: String(e) }; continue; }
  const f = factor(m42, map);
  out[label] = { resolved: popularityOf(map, m42) === undefined ? "undefined" : typeof popularityOf(map, m42), factor: Number.isNaN(f) ? "NaN" : f };
}

/* the app's ranking comparator (web/app.js:665) with NaN popularity */
const rows = [
  { id: "b", score: 0.71, pop: 0.5 },
  { id: "a", score: 0.71, pop: NaN },
  { id: "c", score: 0.71, pop: 0.9 },
];
const cmp = (a, b) => (b.score - a.score) || (b.pop - a.pop);
out.comparator_returns = rows.slice().sort(cmp).map((r) => r.id);
out.comparator_sample = String(cmp(rows[1], rows[2]));

/* a plain-object map is also a prototype lookup */
out.inherited_member_lookup = {
  "constructor": typeof buildMap({})["constructor"],
  "toString": typeof buildMap({})["toString"],
  "factor_for_such_an_object": String(
    core.popularityFactor(buildMap({})["constructor"])),
};

/* unbounded response handling: what the code does NOT do (app.js:96-105) */
out.no_size_limit = true;
out.no_abort_or_timeout = true;

console.log(JSON.stringify(out, null, 1));
