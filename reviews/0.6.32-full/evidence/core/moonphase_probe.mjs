/* L2 probe: web/astro.js::moonPhase decides waxing from the RA difference
 * (`dRA < 180`) but the phase NAME index from the angular elongation. Do the
 * two ever disagree (which would print "Waning Crescent" while the moon is
 * visibly waxing, or a "Full Moon" label with 50% illumination)?
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const A = await import(pathToFileURL(resolve("web/astro.js")).href);
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

const rows = [];
let n = 0, illumLabelMismatch = 0, dirMismatch = 0;
for (let day = 0; day < 400; day++) {
  const dt = new Date(Date.UTC(2026, 0, 1, 23));
  dt.setUTCDate(dt.getUTCDate() + day);
  const jd = (await import(pathToFileURL(resolve("core/index.js")).href)).julianDay(dt);
  const ph = A.moonPhase(jd);
  n++;
  // independent direction: is the elongation growing with time?
  const ph2 = A.moonPhase(jd + 0.02);
  const growing = ph2.elongation > ph.elongation;
  if (growing !== ph.waxing) dirMismatch++;
  // the name must be consistent with the illumination
  const full = ph.illumination > 0.98, isFull = ph.name === "Full Moon";
  const newish = ph.illumination < 0.02, isNew = ph.name === "New Moon";
  if ((full && !isFull) || (newish && !isNew)) {
    illumLabelMismatch++;
    if (rows.length < 8) {
      rows.push({ day, name: ph.name, illum: +ph.illumination.toFixed(4),
                  elongation: +ph.elongation.toFixed(2), waxing: ph.waxing,
                  growing });
    }
  }
}
console.log(JSON.stringify({ samples: n, directionMismatch: dirMismatch,
                             illuminationLabelMismatch: illumLabelMismatch,
                             examples: rows }, null, 1));
