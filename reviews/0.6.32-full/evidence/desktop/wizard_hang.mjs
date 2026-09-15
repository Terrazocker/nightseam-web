/*
 * PROBE (desktop lane, 0.6.32 full review): wizard.js step-1 validate.
 *
 * Two things measured:
 *  A) the 20 s unstuck guard: next() must drop _busy and show an inline error
 *     when validate() hangs;
 *  B) what the guard does NOT cancel: after the timeout the still-pending
 *     validate keeps running (util.js::api has a 30 s timeout, so it aborts
 *     ~10 s LATER). A second Next click therefore runs the location step a
 *     SECOND time against the SAME stale S.cfg - and wizard.js:62-70 chooses
 *     POST /api/sites whenever the snapshot has no active site, so a first-run
 *     wizard that stalls once creates TWO sites from ONE location.
 *
 * Run: node reviews/0.6.32-full/evidence/desktop/wizard_hang.mjs
 */
import { pathToFileURL } from "node:url";

const ROOT = pathToFileURL("<workspace>/AstroPilot-local/").href;
const realSetTimeout = globalThis.setTimeout;

/* ---- fake timers: honour the app's 20000 ms guard without waiting 20 s --- */
let now = 0;
const timers = [];
globalThis.setTimeout = (fn, ms, ...a) => {
  if (ms === 20000) ms = 30;              // wizard.js:174 guard
  const t = { at: now + (ms || 0), fn, a, id: timers.length };
  timers.push(t);
  return t.id;
};
globalThis.clearTimeout = (id) => {
  const t = timers.find((x) => x.id === id);
  if (t) t.cancelled = true;
};
const pump = async (until) => {
  now = until;
  for (;;) {
    const due = timers.filter((t) => !t.cancelled && !t.done && t.at <= now)
                      .sort((x, y) => x.at - y.at)[0];
    if (!due) break;
    due.done = true;
    due.fn(...due.a);
    await Promise.resolve();
  }
};

/* ---- DOM ---------------------------------------------------------------- */
function mkEl(id) {
  const listeners = {};
  return {
    id, value: "", textContent: "", innerHTML: "", checked: false,
    classList: { _s: new Set(),
                 add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
                 toggle(c, f) { const on = f === undefined ? !this._s.has(c) : !!f;
                                on ? this._s.add(c) : this._s.delete(c); },
                 contains(c) { return this._s.has(c); } },
    style: {}, dataset: {}, elements: [],
    addEventListener(t, fn) { (listeners[t] ||= []).push(fn); },
    click() { (listeners["click"] || []).forEach((f) => f({ target: this,
                                                             preventDefault() {} })); },
    querySelector() { return null; }, querySelectorAll: () => [],
    appendChild() {}, focus() {},
  };
}
const els = new Map();
const el = (sel) => {
  if (!els.has(sel)) els.set(sel, mkEl(sel));
  return els.get(sel);
};
globalThis.alert = () => {};
globalThis.document = {
  querySelector: (s) => (s === ".modal:not(.hidden)" ? null : el(s)),
  querySelectorAll: (s) => (s === "#tabs .tab[data-tab=\"horizon\"]"
    ? [{ click() { /* tab switch */ } }] : []),
  addEventListener(t, fn) { if (t === "click") (this._clicks ||= []).push(fn); },
  dispatchEvent: () => true,
  createElement: () => mkEl("created"),
  body: { prepend() {} },
  documentElement: { setAttribute() {}, getAttribute: () => "" },
};
globalThis.window = globalThis;
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };
globalThis.requestAnimationFrame = (fn) => realSetTimeout(fn, 0);
/* leave Node's own `navigator` alone: it has no geolocation, which is what
   wizard.js's "Use my location" branch tests for */

/* ---- fetch: record site writes, never settle the FIRST validate -------- */
const calls = [];
/* the FIRST validate is the "slow local request" the 20 s guard exists for:
   it does not fail, it just takes longer than the guard (measured shape:
   /api/sites POST that lands after ~25 s). */
let firstPostLandsAt = Infinity;
let siteSeq = 100;
const sites = [];
const json = (b) => ({ ok: true, status: 200, statusText: "OK", json: async () => b });
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), m = (opts.method || "GET").toUpperCase();
  calls.push(m + " " + u);
  if (u === "/api/sites" && m === "GET") return json(sites.slice());
  if (u === "/api/sites" && m === "POST") {
    const id = ++siteSeq;
    if (firstPostLandsAt !== Infinity) {
      const at = firstPostLandsAt; firstPostLandsAt = Infinity;
      await new Promise((r) => { const t = { at, fn: r, a: [], id: -1 }; timers.push(t); });
    }
    sites.push({ id, name: "Backyard", lat: 52.52, lon: 13.405 });
    return json({ id });
  }
  if (u === "/api/state") return json({ sites: sites.slice(), active_site_id: sites[0] ? sites[0].id : null,
                                        version: "0.6.32" });
  if (u === "/api/settings") return json({ ok: true });
  if (u === "/api/catalog") return json([]);
  if (u === "/api/panoramas") return json([]);
  throw new Error("unexpected " + m + " " + u);
};

const { S } = await import(ROOT + "static/js/state.js");
const { openWizard } = await import(ROOT + "static/js/wizard.js");

/* the wizard's own state is module-private; observe through the DOM + fetch */
S.cfg = { sites: [], active_site_id: null, image_dir: "", version: "0.6.32" };
S.panos = [];
openWizard();

const next = el("#wizNext");
const lat = el("#wizLat"), lon = el("#wizLon");
next.click();                                   // step 0 -> 1 (no validate)
await Promise.resolve();
lat.value = "52.5200"; lon.value = "13.4050";
el("#wizName").value = "Backyard";

next.click();                                   // step 1 validate #1 -> slow
firstPostLandsAt = 25000;                       // ... lands 25 s later (> guard)
await Promise.resolve(); await Promise.resolve();
console.log("after 1st Next : posts so far", JSON.stringify(calls.filter((c) => c.startsWith("POST"))),
            "| err", JSON.stringify(el("#wizErr").textContent));

await pump(now + 40);                           // let the 20 s guard fire
console.log("after guard    : err", JSON.stringify(el("#wizErr").textContent),
            "| posts", JSON.stringify(calls.filter((c) => c.startsWith("POST"))));

next.click();                                   // 2nd attempt (allowed again)
await Promise.resolve(); await Promise.resolve();
await pump(now + 30000);                        // the slow response lands
for (let i = 0; i < 40; i++) await Promise.resolve();
console.log("after 2nd Next : posts", JSON.stringify(calls.filter((c) => c.startsWith("POST"))));
console.log("server sites   :", JSON.stringify(sites));
console.log("S.cfg.sites    :", JSON.stringify(S.cfg.sites));
process.exit(0);
