/* Review-only probe (L9): per-input-event cost of the Sky View magnitude slider
 * (web/app.js:868-872 computeCandidates) and activeCatalog().
 * Usage: node reviews/0.6.32-full/evidence/security/perf_sky_slider.mjs
 */
import { readFileSync } from "node:fs";

const ROOT = new URL("../../../../", import.meta.url);
const core = await import(new URL("web/core.js", ROOT));
const CAT = JSON.parse(readFileSync(new URL("web/catalog.json", ROOT), "utf8"));

const magVisible = core.magVisible;
const time = (n, fn) => {
  const s = performance.now();
  for (let i = 0; i < n; i++) fn();
  return +((performance.now() - s) / n).toFixed(3);
};

const out = {};
out.activeCatalog_ms = time(50, () => CAT.filter((o) => !o._adv));

function computeCandidates(skyMag, magMax) {
  return [
    ...CAT.filter((o) => !o._adv && magVisible(o.vmag, skyMag, magMax)),
    ...CAT.filter((o) => o._adv && o.vmag != null && magVisible(o.vmag, skyMag, magMax))
      .sort((a, b) => (a.vmag ?? 99) - (b.vmag ?? 99)).slice(0, 1400),
  ];
}
for (const [mag, max] of [[10, 14], [14, 14], [20, 20]]) {
  out[`computeCandidates_mag${mag}_max${max}_ms`] = time(20, () => computeCandidates(mag, max));
}
out.candidates_at_max = computeCandidates(20, 20).length;
out.comparator_note = "one input event on #sky-mag runs computeCandidates() then draw()";
console.log(JSON.stringify(out, null, 1));
