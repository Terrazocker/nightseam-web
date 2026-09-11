/* Planning worker (0.6.19 spike): off-thread tracks.
 *
 * Module worker (new Worker('/js/planning_worker.js', { type: 'module' }))
 * importing the baked core. It fetches the catalog itself and receives only
 * site/night/adv; it returns a TRANSFERABLE flat result (zero-copy handoff).
 *
 * Cancellation: persistent worker + generation counter - a newer message
 * supersedes an in-flight run at the next chunk boundary; terminate() is only
 * for a hard failure/restart. */

import { julianDay, computeNightTracks } from "./core.js";

const CHUNK = 2000;             // objects per compute slice (cancel boundary)
let latestGen = -1;
let catalog = { adv: null, list: null, pending: null };

self.onmessage = (ev) => {
  const m = ev.data || {};
  if (m.type !== "tracks") return;
  latestGen = m.gen;
  runTracks(m).catch((err) => {
    self.postMessage({ gen: m.gen, type: "error",
                       error: String((err && err.message) || err) });
  });
};

async function catalogFor(adv) {
  if (catalog.adv === adv && catalog.list) return catalog.list;
  if (!catalog.pending) {
    catalog.pending = fetch("/api/catalog" + (adv ? "?adv=1" : ""))
      .then((r) => {
        if (!r.ok) throw new Error("catalog HTTP " + r.status);
        return r.json();
      })
      .then((list) => { catalog = { adv, list, pending: null }; return list; });
  }
  return catalog.pending;
}

function heap() {
  const m = performance.memory;
  return m ? m.usedJSHeapSize : null;
}

async function runTracks(m) {
  const t0 = performance.now();
  const st = m.stepMin || 6;
  const n = m.samples || 241;                    // inclusive grid samples
  const [y, mo, d] = String(m.date).split("-").map(Number);
  const noonMs = Date.UTC(y, mo - 1, d, 12) - (m.tzMin || 0) * 60000;
  const stepJd = st / 1440;
  const jd0 = julianDay(new Date(noonMs));
  const jd1 = julianDay(new Date(noonMs + (n - 1) * st * 60000));

  const list = await catalogFor(!!m.adv);
  if (m.gen !== latestGen) return cancelled(m, t0);

  const count = n;
  const total = list.length * count;
  const alt = new Float64Array(total);
  const az = new Float64Array(total);
  for (let start = 0; start < list.length; start += CHUNK) {
    if (m.gen !== latestGen) return cancelled(m, t0);
    const chunk = list.slice(start, start + CHUNK);
    const tr = computeNightTracks(chunk, jd0, jd1, stepJd, m.lat, m.lon);
    if (tr.count !== count) throw new Error("grid mismatch " + tr.count);
    alt.set(tr.alt, start * count);
    az.set(tr.az, start * count);
  }
  if (m.gen !== latestGen) return cancelled(m, t0);

  self.postMessage({
    gen: m.gen, type: "tracks", ms: +(performance.now() - t0).toFixed(1),
    n: list.length, count, ids: list.map((o) => o.id),
    heap: heap(), alt, az,
  }, { transfer: [alt.buffer, az.buffer] });
}

function cancelled(m, t0) {
  self.postMessage({ gen: m.gen, type: "cancelled",
                     ms: +(performance.now() - t0).toFixed(1) });
}
