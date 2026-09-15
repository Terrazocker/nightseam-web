/* L2 probe: do the two visibility predicates in core/visibility.js agree?
 *   sampleVisible(alt, minAlt, ceil, ceilTop)  - decides the per-sample o.vis
 *   statusOf(o, i, minAlt).code === "vis"      - decides the label
 * Both are documented to mirror each other ("status must never say Observable
 * where vis[] says no"), including a missing ceilTop.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const C = await import(pathToFileURL(resolve("core/index.js")).href);

const alts = [-90, -1, 0, 1e-12, 5, 10, 17, 20, 25, 30, 45, 60, 89.9, 90, 90.5, 91];
const mins = [0, 10, 17, 25, 90];
const ceils = [-90, -89.5, 0, 10, 20, 30, 45, 60, 89, 90];
const tops = [null, undefined, -90, 0, 20, 45, 60, 89, 90, 90.5, 91];

const mismatches = [];
let n = 0;
for (const alt of alts) {
  for (const minAlt of mins) {
    for (const ceil of ceils) {
      for (const ceilTop of tops) {
        n++;
        const vis = C.sampleVisible(alt, minAlt, ceil, ceilTop ?? undefined);
        const o = { alt: [alt], ceil: [ceil] };
        if (ceilTop != null) o.ceil_top = [ceilTop];
        const st = C.statusOf(o, 0, minAlt);
        const labelledVisible = st.code === "vis";
        const labelledObservable = st.text === "Observable";
        if (vis !== (labelledVisible && labelledObservable)) {
          mismatches.push({ alt, minAlt, ceil, ceilTop, vis, code: st.code, text: st.text });
        }
      }
    }
  }
}
console.log(JSON.stringify({
  combinations: n,
  mismatches: mismatches.length,
  examples: mismatches.slice(0, 8),
}, null, 1));
