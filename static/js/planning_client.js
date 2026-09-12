/* Client-side planning (authority flip, 0.6.18): builds the SAME state shape
   the desktop UI already expects from GET /api/night, with the tracks computed
   locally by the shared core (computeNightTracks) and the horizon ceiling from
   the same world-azimuth bin rule the server uses.

   The builder is keyed to (site, date, catalog mode, horizon profile) and
   caches its payload: a site/date/catalog/profile change rebuilds the tracks,
   while preference changes (min-alt, Bortle, moonAware, filters, mag cap) never
   reach this module - derive.js::recomputeNightDerived rescores the stored
   tracks in place. A worker failure falls back to the synchronous client
   build; any failure then surfaces to the caller (no server compute exists). */

import { S } from "./state.js";
import { api, parseUTC } from "./util.js";
import { activeProfile, activeTopProfile, longestRunJS } from "./derive.js";
import {
  julianDay, altaz, sunRaDec, moonRaDec, moonIllumination, moonAge,
  nightInfo, pickDarkWindow, computeNightTracks,
} from "./core.js";

const GRID_STEP_MIN = 6;
const GRID_N = 241;               // local noon -> next local noon, inclusive
const BINS = 720;                 // 0.5 deg world-azimuth profile bins
const NO_BLOCK = -90.0;
const DETAIL_STEP_MIN = 4;
const TRACK_CHUNK = 2000;         // flat tracks are converted+released per chunk

let _cache = { key: null, payload: null };
let _catCache = { adv: null, list: null };

/* ---------------- worker (0.6.19): off-thread tracks + derived fields ------ */

class SupersededError extends Error {
  constructor() { super("superseded"); this.name = "SupersededError"; }
}

const BIND_MS = 8;                 // bind budget per frame (no long tasks)
let _worker = null, _workerBroken = false;
let _wgen = 0, _bindGen = 0, _dgen = 0;
const _pending = new Map();

function workerUsable() {
  return typeof Worker === "function" && !window.__NS_WORKER_FORCE_FAIL && !_workerBroken;
}

function getWorker() {
  if (_worker) return _worker;
  _worker = new Worker("/js/planning_worker.js", { type: "module" });
  _worker.onmessage = (ev) => {
    const m = ev.data || {};
    const p = _pending.get(m.gen);
    if (!p) return;
    _pending.delete(m.gen);
    if (m.type === "error") p.reject(new Error("worker: " + m.error));
    else if (m.type === "cancelled") p.reject(new SupersededError());
    else p.resolve(m);
  };
  _worker.onerror = (e) => {
    _workerBroken = true;
    for (const [, p] of _pending) p.reject(new Error("worker error: " + (e.message || "?")));
    _pending.clear();
  };
  return _worker;
}

function ask(msg) {
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pending.delete(msg.gen);
      _workerBroken = true;
      if (_worker) { _worker.terminate(); _worker = null; }
      reject(new Error("worker timeout"));
    }, 120000);
    _pending.set(msg.gen, {
      resolve: (m) => { clearTimeout(timer); resolve(m); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    try { w.postMessage(msg); } catch (e) {
      clearTimeout(timer); _pending.delete(msg.gen); reject(e);
    }
  });
}

const frame = () => new Promise((r) =>
  typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => r())
                                              : setTimeout(r, 0));

/* Dev-only test hooks (inert unless explicitly called; no effect on the app):
   gate 1 exercises a real terminate -> sync fallback -> fresh-worker recovery. */
if (typeof window !== "undefined") {
  window.__NS_KILL_WORKER = () => {
    if (!window.__NS_DEBUG_WORKER) return false;
    _workerBroken = true;
    if (_worker) { _worker.terminate(); _worker = null; }
    for (const [, p] of _pending) p.reject(new Error("worker terminated"));
    _pending.clear();
    return true;
  };
  window.__NS_REVIVE_WORKER = () => {
    if (!window.__NS_DEBUG_WORKER) return false;
    _workerBroken = false;
    return true;
  };
}

/* The catalog is metadata only: reuse the boot copy (main.js::S.catalog) or the
   previous fetch - a date/site change must not re-download ~4 MB. */
async function catalogFor(adv) {
  if (_catCache.adv === adv && _catCache.list) return _catCache.list;
  if (Array.isArray(S.catalog) && S.catalog.length &&
      !!(S.cfg && S.cfg.adv_mode) === adv) {
    _catCache = { adv, list: S.catalog };
    return S.catalog;
  }
  const list = await api("/api/catalog" + (adv ? "?adv=1" : ""));
  _catCache = { adv, list };
  return list;
}

/** Drop the cached tracks (tests / explicit invalidation). */
export function invalidatePlanCache() { _cache = { key: null, payload: null }; }

const iso = (dt) => (dt instanceof Date && !isNaN(dt))
  ? dt.toISOString().slice(0, 19) : null;
const r1 = (x) => Math.round(x * 10) / 10;

/** The server's ceil_lookup: pure world-bin lookup, no FOV gate - the stored
 *  profile already encodes outside-FOV behaviour per paint mode. */
function lookup(profile) {
  if (!profile || profile.length !== BINS) return () => NO_BLOCK;
  return (az) => {
    let i = Math.floor((((az % 360) + 360) % 360) / 0.5);
    if (i >= BINS) i = BINS - 1;
    const v = profile[i];
    return v == null ? NO_BLOCK : v;
  };
}

/** Grid + twilight window for one (date, site): the same site-zoned local-noon
 *  anchor the server uses (app/planning.py + nightcalc.compute_night). */
export function clientWindows(date, tzMin, lat, lon) {
  const [y, m, d] = String(date).split("-").map(Number);
  const noonMs = Date.UTC(y, m - 1, d, 12) - tzMin * 60000;
  const anchor = new Date(y, m - 1, d, 12, 0, 0);   // local getters = site date
  const info = nightInfo(anchor, lat, lon, new Date(noonMs));
  const w = pickDarkWindow(info, anchor, new Date(noonMs));
  return { y, m, d, noonMs, info, w };
}

function siteFor(siteId) {
  return api("/api/sites").then((sites) => {
    const wanted = siteId != null && siteId !== "" ? Number(siteId) : null;
    const site = sites.find((s) => s.id === wanted) ||
                 sites.find((s) => s.id === S.activeSiteId) || sites[0];
    if (!site) throw new Error("no observing site configured");
    return site;
  });
}

/** Worker-first night build; a worker failure falls back to the synchronous
 *  client path. */
export async function buildClientNight(opts) {
  if (workerUsable()) {
    try {
      return await buildWorkerNight(opts);
    } catch (err) {
      if (err && err.name === "SupersededError") throw err;
      console.warn("[planning] worker failed; synchronous client path:", err);
    }
  }
  return syncBuildClientNight(opts);
}

async function buildWorkerNight({ date, siteId, tzMin }) {
  const site = await siteFor(siteId);
  const adv = !!(S.cfg && S.cfg.adv_mode);
  const pano = activeProfile();
  const topProf = activeTopProfile();
  const catalog = await catalogFor(adv);
  const gen = ++_wgen;
  _bindGen++;
  const res = await ask({
    gen, type: "night", date, tzMin, lat: site.lat, lon: site.lon,
    elev: site.elev || 0, adv, profile: pano, topProfile: topProf,
    prefs: { minAlt: S.minAlt, bortle: S.cfg && S.cfg.bortle,
             moonAware: !!(S.cfg && S.cfg.moon_aware),
             filters: S.cfg && S.cfg.filters },
  });
  return bindWorkerNight(res, catalog, pano, topProf);
}

/** Bind transferred flat tracks + packed derived fields into the per-object
 *  arrays the UI expects, in BIND_MS slices so no frame blocks. */
async function bindWorkerNight(res, catalog, pano, topProf) {
  const gen = _bindGen;
  const { n, count, alt, az, derived, meta } = res;
  if (n !== catalog.length) {
    throw new Error("catalog mismatch " + n + " vs " + catalog.length);
  }
  const ceilAt = lookup(pano), topAt = lookup(topProf);
  const objects = new Array(n);
  let start = 0;
  while (start < n) {
    const t0 = performance.now();
    while (start < n && performance.now() - t0 < BIND_MS) {
      const o = catalog[start], base = start * count;
      const alts = new Array(count), azs = new Array(count), ceils = new Array(count);
      const tops = topProf ? new Array(count) : null;
      for (let i = 0; i < count; i++) {
        alts[i] = alt[base + i]; azs[i] = az[base + i];
        ceils[i] = r1(ceilAt(az[base + i]));
        if (tops) tops[i] = r1(topAt(az[base + i]));
      }
      let maxI = 0;
      for (let i = 1; i < count; i++) if (alts[i] > alts[maxI]) maxI = i;
      const rec = { id: o.id, alt: alts, az: azs, ceil: ceils,
                    max_alt: alts[maxI], max_i: maxI,
                    vis: new Array(count), above: new Array(count) };
      if (o._adv) {
        rec.adv = true;
        rec.ra_hours = o.ra_hours; rec.dec_deg = o.dec_deg;
        rec.vmag = o.vmag; rec.otype = o.otype;
        rec.popularity = o.popularity || 0;
      }
      if (tops) rec.ceil_top = tops;
      for (let i = 0; i < count; i++) {
        rec.vis[i] = !!derived.visBits[base + i];
        rec.above[i] = !!derived.aboveBits[base + i];
      }
      applyDerivedNumbers(rec, derived, start);
      objects[start] = rec;
      start++;
    }
    if (gen !== _bindGen) throw new SupersededError();
    await frame();
  }
  return Object.assign({ objects, _clientTracks: true, _derivedReady: true }, meta);
}

function applyDerivedNumbers(o, d, j) {
  o.obs_pct = d.obsPct[j]; o.blocked_n = d.blockedN[j];
  o.score = d.score[j]; o.score_moon = d.scoreMoon[j];
  o.best = d.bS[j] < 0 ? null : [d.bS[j], d.bE[j]];
  o.best_above = d.aS[j] < 0 ? null : [d.aS[j], d.aE[j]];
}

/** Preference-change rescore through the worker (uses its retained tracks);
 *  returns false when the caller must run the synchronous fallback. */
export async function requestPrefsDerived() {
  if (!S.night || !S.night._derivedReady || !workerUsable()) return false;
  const gen = ++_dgen;
  try {
    const res = await ask({
      gen: ++_wgen, type: "prefs", minAlt: S.minAlt,
      bortle: S.cfg && S.cfg.bortle,
      moonAware: !!(S.cfg && S.cfg.moon_aware),
      filters: S.cfg && S.cfg.filters,
    });
    if (gen !== _dgen) return true;         // superseded: discard, do not apply
    await bindDerived(S.night.objects, res.derived);
    return true;
  } catch (err) {
    if (err && err.name === "SupersededError") return true;
    console.warn("[planning] worker prefs failed; synchronous path:", err);
    return false;
  }
}

async function bindDerived(objects, d) {
  const gen = _dgen, n = objects.length, count = S.night.timeline.n;
  let start = 0;
  while (start < n) {
    const t0 = performance.now();
    while (start < n && performance.now() - t0 < BIND_MS) {
      const o = objects[start];
      o.vis = new Array(count); o.above = new Array(count);
      for (let i = 0; i < count; i++) {
        o.vis[i] = !!d.visBits[start * count + i];
        o.above[i] = !!d.aboveBits[start * count + i];
      }
      applyDerivedNumbers(o, d, start);
      start++;
    }
    if (gen !== _dgen) throw new SupersededError();
    await frame();
  }
}

/** Build the /api/night payload client-side. `siteId` is the siteSelect value;
 *  `date` is the wall date from #dateInput; tzMin the effective offset at it. */
async function syncBuildClientNight({ date, siteId, tzMin }) {
  const site = await siteFor(siteId);
  const adv = !!(S.cfg && S.cfg.adv_mode);
  const pano = activeProfile();
  const panoId = (S.panos.find((p) => p.active) ||
                  S.panos.find((p) => p.id === (S.cfg && S.cfg.active_pano_id)))?.id;
  const key = [site.id, date, adv ? 1 : 0, panoId || "-",
               pano ? pano.length : 0].join("|");
  if (_cache.key === key && _cache.payload) return _cache.payload;

  const { noonMs, info, w } = clientWindows(date, tzMin, site.lat, site.lon);

  const timesIso = [];
  for (let i = 0; i < GRID_N; i++) {
    timesIso.push(new Date(noonMs + i * GRID_STEP_MIN * 60000)
      .toISOString().slice(0, 19));
  }
  const jds = timesIso.map((s) => julianDay(parseUTC(s)));
  const stepJd = GRID_STEP_MIN / 1440;

  const sunAlt = [], sunAz = [], moonAlt = [], moonAz = [];
  for (const jd of jds) {
    let [ra, dec] = sunRaDec(jd);
    let [a, z] = altaz(ra, dec, jd, site.lat, site.lon);
    sunAlt.push(r1(a)); sunAz.push(r1(z));
    [ra, dec] = moonRaDec(jd);
    [a, z] = altaz(ra, dec, jd, site.lat, site.lon);
    moonAlt.push(r1(a)); moonAz.push(r1(z));
  }
  const midJd = jds[Math.floor(jds.length / 2)];
  const moonIllum = Math.round(moonIllumination(midJd) * 100) / 100;
  const moonAgeDays = Math.round(moonAge(midJd) * 100) / 100;

  const catalog = await catalogFor(adv);
  const topProf = activeTopProfile();
  const ceilAt = lookup(pano);
  const topAt = lookup(topProf);

  const objects = [];
  for (let start = 0; start < catalog.length; start += TRACK_CHUNK) {
    const chunk = catalog.slice(start, start + TRACK_CHUNK);
    const tracks = computeNightTracks(chunk, jds[0], jds[jds.length - 1],
                                      stepJd, site.lat, site.lon);
    const count = tracks.count;
    for (let k = 0; k < chunk.length; k++) {
      const o = chunk[k];
      const base = k * count;
      const alts = new Array(count), azs = new Array(count), ceils = new Array(count);
      const tops = topProf ? new Array(count) : null;
      let maxI = 0, maxRaw = -Infinity;
      for (let i = 0; i < count; i++) {
        const a = tracks.alt[base + i], z = tracks.az[base + i];
        alts[i] = r1(a); azs[i] = r1(z); ceils[i] = r1(ceilAt(z));
        if (tops) tops[i] = r1(topAt(z));
        if (a > maxRaw) { maxRaw = a; maxI = i; }   // raw argmax (server)
      }
      const rec = {
        id: o.id,
        alt: alts, az: azs, ceil: ceils,
        max_alt: r1(maxRaw), max_i: maxI,
      };
      if (o._adv) {
        rec.adv = true;
        rec.ra_hours = o.ra_hours; rec.dec_deg = o.dec_deg;
        rec.vmag = o.vmag; rec.otype = o.otype;
        rec.popularity = o.popularity || 0;
      }
      if (tops) rec.ceil_top = tops;
      objects.push(rec);
    }
  }

  const payload = {
    site: { lat: site.lat, lon: site.lon, elev: site.elev || 0 },
    date_local: date,
    tz_offset_min: tzMin,
    twilight_level: w.level,
    sunset: iso(info.sunset), sunrise: iso(info.sunrise),
    dusk: iso(w.dusk), dawn: iso(w.dawn),
    moon_illum: moonIllum, moon_age_days: moonAgeDays,
    timeline: { t0: timesIso[0], step_min: GRID_STEP_MIN,
                n: timesIso.length, times_iso: timesIso },
    sun_alt: sunAlt, sun_az: sunAz, moon_alt: moonAlt, moon_az: moonAz,
    objects,
    _clientTracks: true,   // night.js skips synthesizeAdvancedTracks
  };
  _cache = { key, payload };
  return payload;
}

/* ---------------- detail view (4-min grid, same computation as ----------- */
/* app/nightcalc.py::object_detail) ---------------------------------------- */

function fmtRA(raHours) {
  const h = ((raHours % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mmF = (h - hh) * 60;
  const mm = Math.floor(mmF);
  const ss = (mmF - mm) * 60;
  return `${String(hh).padStart(2, "0")}h ${String(mm).padStart(2, "0")}m ${ss.toFixed(1).padStart(4, "0")}s`;
}

function fmtDec(decDeg) {
  const sign = decDeg < 0 ? "-" : "+";
  const a = Math.abs(decDeg);
  const dd = Math.floor(a);
  const mmF = (a - dd) * 60;
  const mm = Math.floor(mmF);
  const ss = (mmF - mm) * 60;
  return `${sign}${String(dd).padStart(2, "0")}deg ${String(mm).padStart(2, "0")}' ${ss.toFixed(1).padStart(4, "0")}"`;
}

/** Client detail payload; throws on unknown/malformed ids. */
export async function buildClientDetail(oid, { date, tzMin, minAlt, siteId }) {
  const meta = S.meta[oid];
  if (!meta || meta.ra_hours == null || meta.dec_deg == null) {
    throw new Error("object metadata unavailable");
  }
  const site = await siteFor(siteId != null ? siteId : S.activeSiteId);
  const { noonMs, w } = clientWindows(date, tzMin, site.lat, site.lon);
  const t0 = Math.max(w.dusk.getTime() - 75 * 60000, noonMs);
  const t1 = Math.min(w.dawn.getTime() + 45 * 60000, noonMs + 24 * 3600000);
  const times = [];
  for (let t = t0; t <= t1; t += DETAIL_STEP_MIN * 60000) times.push(t);
  const stepJd = DETAIL_STEP_MIN / 1440;
  const jd0 = julianDay(new Date(times[0]));
  const jd1 = julianDay(new Date(times[times.length - 1]));
  const tracks = computeNightTracks([meta], jd0, jd1, stepJd, site.lat, site.lon);
  if (tracks.count !== times.length) throw new Error("detail grid mismatch");

  const pano = activeProfile();
  const topProf = activeTopProfile();
  const ceilAt = lookup(pano);
  const topAt = lookup(topProf);
  const alts = [], azs = [], ceils = [], tops = topProf ? [] : null, vis = [];
  const duskMs = w.dusk.getTime(), dawnMs = w.dawn.getTime();
  for (let i = 0; i < times.length; i++) {
    const a = tracks.alt[i], z = tracks.az[i];
    const c = ceilAt(z);
    alts.push(Math.round(a * 100) / 100);
    azs.push(r1(z));
    ceils.push(Math.round(c * 100) / 100);
    if (tops) tops.push(r1(topAt(z)));
    vis.push(a >= minAlt && a > c && (!tops || a < tops[i]));
  }
  let maxI = 0;
  for (let i = 1; i < alts.length; i++) if (alts[i] > alts[maxI]) maxI = i;
  const inNight = times.map((t) => t >= duskMs && t <= dawnMs);
  const best = longestRunJS(vis.map((v, i) => v && inNight[i]));

  const out = {
    meta: Object.assign({}, meta, {
      ra_hms: fmtRA(meta.ra_hours), dec_dms: fmtDec(meta.dec_deg),
    }),
    twilight_level: w.level,
    dusk: iso(w.dusk), dawn: iso(w.dawn),
    times_iso: times.map((t) => new Date(t).toISOString().slice(0, 19)),
    step_min: DETAIL_STEP_MIN,
    alt: alts, az: azs, ceil: ceils, vis,
    max_alt: alts[maxI],
    max_time: new Date(times[maxI]).toISOString().slice(0, 19),
    best,
    min_useful_alt: minAlt,
  };
  if (tops) out.ceil_top = tops;
  return out;
}
