/* Client-side planning (authority flip, 0.6.18): builds the SAME state shape
   the desktop UI already expects from GET /api/night, with the tracks computed
   locally by the shared core (computeNightTracks) and the horizon ceiling from
   the same world-azimuth bin rule the server uses.

   The builder is keyed to (site, date, catalog mode, horizon profile) and
   caches its payload: a site/date/catalog/profile change rebuilds the tracks,
   while preference changes (min-alt, Bortle, moonAware, filters, mag cap) never
   reach this module - derive.js::recomputeNightDerived rescores the stored
   tracks in place. Any failure throws; night.js/detail.js then use the
   retained server path and log the fallback.

   Desktop/server only: the web has no flag and no pref for this. */

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

/** Build the /api/night payload client-side. `siteId` is the siteSelect value;
 *  `date` is the wall date from #dateInput; tzMin the effective offset at it. */
export async function buildClientNight({ date, siteId, tzMin }) {
  if (window.__NS_PLAN_FORCE_FAIL) {
    throw new Error("forced client-planning failure (smoke hook)");
  }
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

  const catalog = await api("/api/catalog" + (adv ? "?adv=1" : ""));
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
      let maxI = 0;
      for (let i = 0; i < count; i++) {
        const a = tracks.alt[base + i], z = tracks.az[base + i];
        alts[i] = r1(a); azs[i] = r1(z); ceils[i] = r1(ceilAt(z));
        if (tops) tops[i] = r1(topAt(z));
        if (alts[i] > alts[maxI]) maxI = i;
      }
      const rec = {
        id: o.id,
        alt: alts, az: azs, ceil: ceils,
        max_alt: alts[maxI], max_i: maxI,
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

/** Client detail payload; throws on unknown/malformed ids so detail.js falls
 *  back to the retained server route. */
export async function buildClientDetail(oid, { date, tzMin, minAlt }) {
  if (window.__NS_PLAN_FORCE_FAIL) {
    throw new Error("forced client-planning failure (smoke hook)");
  }
  const meta = S.meta[oid];
  if (!meta || meta.ra_hours == null || meta.dec_deg == null) {
    throw new Error("object metadata unavailable");
  }
  const site = await siteFor(S.activeSiteId);
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
