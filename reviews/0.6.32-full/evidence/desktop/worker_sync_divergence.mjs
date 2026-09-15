/*
 * PROBE (desktop lane): worker vs sync on the SAME real input.
 *
 * The two paths derive `max_alt`/`max_i` from the same tracks but by different
 * recipes:
 *   worker (planning_client.js:259-262):  maxI = argmax(alts)   where alts[i]
 *                                         is the ROUNDED (r1) altitude, then
 *                                         max_alt = alts[maxI]
 *   sync   (planning_client.js:404-414):  maxI = argmax(raw altitude), then
 *                                         max_alt = r1(rawMax)
 * The sync recipe is the server's ("raw argmax"); the worker recipe rounds
 * first. The core tracks are deterministic, so the only divergence this can
 * produce is a different argmax when the top samples round together.
 *
 * This probe feeds the REAL core the REAL catalog geometry for a set of sites
 * and reports every object whose two recipes disagree.
 *
 * Run: node reviews/0.6.32-full/evidence/desktop/worker_sync_divergence.mjs
 */
import { pathToFileURL } from "node:url";

const ROOT = pathToFileURL("<workspace>/AstroPilot-local/").href;
const core = await import(ROOT + "static/js/core.js");

const r1 = (x) => Math.round(x * 10) / 10;
const GRID_STEP_MIN = 6, GRID_N = 241;

/* a real spread of catalog geometry: dec -85..+85, RA all over, both hemispheres
   and a few objects that culminate exactly at a grid sample */
const OBJS = [];
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let i = 0; i < 300; i++) {
  OBJS.push({ id: "o" + i, ra_hours: rnd() * 24, dec_deg: rnd() * 175 - 87.5 });
}
/* the classic culminators: meridian transit lands on a sample for integer RA */
for (let ra = 0; ra < 24; ra += 1) OBJS.push({ id: "m" + ra, ra_hours: ra, dec_deg: 41.27 });

const SITES = [
  { lat: 52.5, lon: 13.4 }, { lat: 41.27, lon: 0 }, { lat: -33.9, lon: 151.2 },
  { lat: 0, lon: 0 }, { lat: 69.6, lon: 18.9 }, { lat: -69.6, lon: -18.9 },
];
const DATES = ["2026-09-12", "2026-01-15", "2026-06-21"];

let checked = 0, diffIdx = 0, diffVal = 0, worst = 0, examples = [];
for (const site of SITES) {
  for (const date of DATES) {
    const [y, m, d] = date.split("-").map(Number);
    const noonMs = Date.UTC(y, m - 1, d, 12) - 120 * 60000;
    const timesIso = [];
    for (let i = 0; i < GRID_N; i++)
      timesIso.push(new Date(noonMs + i * GRID_STEP_MIN * 60000).toISOString().slice(0, 19));
    const jds = timesIso.map((s) => core.julianDay(new Date(s + "Z")));
    const tr = core.computeNightTracks(OBJS, jds[0], jds[jds.length - 1],
                                       GRID_STEP_MIN / 1440, site.lat, site.lon);
    for (let k = 0; k < OBJS.length; k++) {
      checked++;
      const base = k * tr.count;
      const alts = new Array(tr.count);
      for (let i = 0; i < tr.count; i++) alts[i] = r1(tr.alt[base + i]);
      /* worker recipe */
      let wI = 0;
      for (let i = 1; i < tr.count; i++) if (alts[i] > alts[wI]) wI = i;
      const wAlt = alts[wI];
      /* sync recipe */
      let sI = 0, sRaw = -Infinity;
      for (let i = 0; i < tr.count; i++) {
        const a = tr.alt[base + i];
        if (a > sRaw) { sRaw = a; sI = i; }
      }
      const sAlt = r1(sRaw);
      if (wI !== sI) {
        diffIdx++;
        const dv = Math.abs(wAlt - sAlt);
        if (dv > worst) worst = dv;
        if (examples.length < 6)
          examples.push(`${OBJS[k].id} site(${site.lat},${site.lon}) ${date}: ` +
                        `worker i=${wI} ${wAlt}deg vs sync i=${sI} ${sAlt}deg (dv=${dv.toFixed(3)})`);
      } else if (wAlt !== sAlt) diffVal++;
    }
  }
}
console.log("object/site/date combinations :", checked);
console.log("different argmax index        :", diffIdx, `(${(100*diffIdx/checked).toFixed(3)}%)`);
console.log("same index, different max_alt :", diffVal);
console.log("worst |max_alt| difference    :", worst.toFixed(3), "deg");
for (const e of examples) console.log("  ", e);
process.exit(0);
