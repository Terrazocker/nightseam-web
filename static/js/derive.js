/* pure derivations computed from raw night tracks + current preferences */

import { S } from "./state.js";
import { parseUTC, clamp, fmtHM } from "./util.js";

/* keyboard scrub steps in minutes - shared with the web (web/astro.js) and
   pinned by tests/test_js_parity.py: a plain arrow key is the fine step (one
   6-min night-grid sample), Shift is the coarse one (10 samples = 60 min). */
export const SCRUB_STEP_MIN = 6;
export const SCRUB_SHIFT_STEP_MIN = 60;

/* Selected-time sky visibility for the all-sky chart: a body (Sun, Moon or a
   catalog object) is a visible sky object only while its APPARENT altitude is
   above the horizon. Mirrors web/astro.js::aboveHorizon (pinned by the
   "abovehorizon" engine of tests/js/astro_parity.mjs). The chart's Sun/Moon
   used to be drawn down to a fixed -6 deg (civil-twilight) floor, so they
   appeared below the horizon near dusk/dawn; the astronomy is the only rule. */
export function aboveHorizon(apparentAltDeg) {
  return Number.isFinite(apparentAltDeg) && apparentAltDeg > 0;
}

/* All-sky chart magnitude limit - the ONE rule behind the desktop "#skyMag"
   slider and the web chart's equivalent control, pinned by the "mag" engine of
   tests/js/astro_parity.mjs (static/js/derive.js vs web/format.js):
     - an object WITH a measured magnitude is shown when vmag <= limit;
     - an object WITHOUT a magnitude (vmag == null) is shown only at the
       slider's maximum ("show everything"), never below it.
   Sun/Moon, field stars, constellations and the min-alt band are unaffected. */
export function magVisible(vmag, limit, maxLimit) {
  return vmag != null ? vmag <= limit : limit >= maxLimit;
}

/* "Square" chart zoom - the geometry behind the desktop sky chart's wheel zoom,
   mirrored by web/format.js (pinned by the "skyzoom" engine of
   tests/js/astro_parity.mjs). The all-sky disc is drawn in a square coordinate
   space W x H (the canvas box is aspect-ratio 1); zoom is ONE uniform scalar on
   both axes (equal angular scale, no distortion) about a focus point, so the
   visible window is a rectangle W/zoom x H/zoom over the disc. `fx`/`fy` are
   null at zoom 1 (view centered). */
export const SKY_ZOOM_MIN = 1;
export const SKY_ZOOM_MAX = 8;

export function skyClampZoom(z) {
  return Math.max(SKY_ZOOM_MIN, Math.min(SKY_ZOOM_MAX, z));
}

export function skyViewMatrix(zoom, W, H, fx, fy) {
  const cx = fx == null ? W / 2 : fx;
  const cy = fy == null ? H / 2 : fy;
  return { a: zoom, d: zoom, e: W / 2 - cx * zoom, f: H / 2 - cy * zoom };
}

export function skyScreenToBase(zoom, W, H, fx, fy, sx, sy) {
  const cx = fx == null ? W / 2 : fx;
  const cy = fy == null ? H / 2 : fy;
  return [cx + (sx - W / 2) / zoom, cy + (sy - H / 2) / zoom];
}

export function skyClampFocus(W, H, fx, fy) {
  const Rlim = Math.min(W, H) / 2 - 22;
  const at = (v, c) => (v == null ? null : Math.max(c - Rlim, Math.min(c + Rlim, v)));
  return [at(fx, W / 2), at(fy, H / 2)];
}

/* Longest run of true flags as a HALF-OPEN range [start, end) - the same
   contract as app/nightcalc.py's longest_run(): `end` is the first sample
   AFTER the run (== flags.length when the run reaches the last sample), so the
   run covers `end - start` samples. `end` is a boundary, never an index into
   the time grid. */
export function longestRunJS(flags) {
  let best = null, start = null;
  for (let i = 0; i <= flags.length; i++) {
    const f = i < flags.length && flags[i];
    if (f && start === null) start = i;
    else if (!f && start !== null) {
      if (!best || i - start > best[1] - best[0]) best = [start, i];
      start = null;
    }
  }
  return best;
}

/* Timestamp of a half-open window's END BOUNDARY, always a real time.
   `end` may equal the grid length (a run that reaches the last sample), where
   `timesIso[end]` does not exist - the window then ends one step after the
   final sample. Never returns undefined, so no consumer can render "--:--" or
   "NaNh NaNm" for a valid window. */
export function windowEndISO(timesIso, end, stepMin) {
  if (!timesIso || !timesIso.length) return null;
  if (end < timesIso.length) return timesIso[end];
  let step = stepMin;
  if (step == null) {
    step = timesIso.length > 1
      ? (parseUTC(timesIso[1]) - parseUTC(timesIso[0])) / 60000 : 0;
  }
  const d = parseUTC(timesIso[timesIso.length - 1]);
  d.setUTCMinutes(d.getUTCMinutes() + step);
  return d.toISOString().slice(0, 19);
}

export function timeIndexFor(dateObj) {
  if (!S.night) return -1;
  const tl = S.night.timeline;
  const t0 = parseUTC(tl.times_iso[0]).getTime();
  const step = tl.step_min * 60000;
  const i = Math.round((dateObj.getTime() - t0) / step);
  if (i < 0 || i >= tl.n) return -1;
  return i;
}

export function curTimeISO() {
  return S.night ? S.night.timeline.times_iso[S.tIdx] : null;
}

export function nightIndexRange() {
  const tl = S.night.timeline;
  let i0 = 0, i1 = tl.n - 1;
  // no astronomical night (polar summer) -> the whole grid is the window;
  // without this guard parseUTC(null) yields Invalid Date and every
  // comparison silently fails
  if (!S.night.dusk || !S.night.dawn) return [i0, i1];
  for (let i = 0; i < tl.n; i++) {
    if (parseUTC(tl.times_iso[i]) >= parseUTC(S.night.dusk)) { i0 = i; break; }
  }
  for (let i = tl.n - 1; i >= 0; i--) {
    if (parseUTC(tl.times_iso[i]) <= parseUTC(S.night.dawn)) { i1 = i; break; }
  }
  return [i0, Math.max(i0, i1)];
}

/** Scrub-range policy - SHARED with the web (web/astro.js) and pinned by the
 *  "scrubwindow" engine of tests/js/astro_parity.mjs. `viewFullDay` false =>
 *  the planner's night window (dusk..dawn, the picked twilight level or the
 *  site-zoned 20:00-04:00 polar fallback); true => the full payload grid
 *  (dusk-1h..dawn+1h). Inputs/outputs are epoch milliseconds. */
export function scrubBounds(viewFullDay, nightStart, nightEnd, fullStart, fullEnd) {
  if (!viewFullDay && nightStart != null && nightEnd != null && nightEnd > nightStart) {
    return { start: nightStart, end: nightEnd };
  }
  return { start: fullStart, end: fullEnd };
}

/** Clamp an instant into a scrub range (the selected time must stay inside). */
export function scrubClamp(t, start, end) {
  if (t < start) return start;
  if (t > end) return end;
  return t;
}

/** Grid index bounds [lo, hi] the scrub may select: the night window by
 *  default, the whole payload grid when view_full_day is on. */
export function scrubWindowRange() {
  const tl = S.night && S.night.timeline;
  if (!tl) return [0, 0];
  if (S.cfg && S.cfg.view_full_day) return [0, tl.n - 1];
  return nightIndexRange();
}

/* ---------------- advanced catalog: synthesize tracks client-side -------- */

import { julianDay, precessJ2000ToDate, altazFrame,
         altazFrameApply } from "./astro.js";

const NO_BLOCK = -90.0;
const BINS = 720;

function ceilLookup(profile) {
  if (!profile || profile.length !== BINS) return () => NO_BLOCK;
  return az => {
    let i = Math.floor(((az % 360) + 360) % 360 / 0.5);
    if (i >= BINS) i = BINS - 1;
    const v = profile[i];
    return v == null ? NO_BLOCK : v;
  };
}

/* sky-mode bands carry an upper ceiling (blocked above the painted sky);
   90.5 = no upper limit (altitude can never exceed 90) */
function topLookup(profileTop) {
  if (!profileTop || profileTop.length !== BINS) return () => 90.5;
  return ceilLookup(profileTop);
}

/* The server ships advanced-mode objects as metadata only; compute their
   alt/az/ceil tracks here (precession once per object at the grid midpoint,
   sidereal time once per sample) so all views work unchanged. Yields to the
   event loop periodically so the ~12k-object pass never freezes the UI. */
export async function synthesizeAdvancedTracks(N) {
  const site = N.site;
  const jds = N.timeline.times_iso.map(iso => julianDay(parseUTC(iso)));
  const refJd = jds[Math.floor(jds.length / 2)];
  const frame = altazFrame(site.lat, site.lon, jds);
  const ceil = ceilLookup(activeProfile());
  const hasTop = !!activeTopProfile();
  const ceilTop = topLookup(activeTopProfile());
  const n = frame.length;
  const objs = N.objects;
  for (let k = 0; k < objs.length; k++) {
    const o = objs[k];
    if (!o.adv) continue;
    const [pr, pd] = precessJ2000ToDate(o.ra_hours * 15, o.dec_deg, refJd);
    const alts = new Array(n), azs = new Array(n), ceils = new Array(n);
    const ceilsTop = hasTop ? new Array(n) : null;
    for (let i = 0; i < n; i++) {
      const [a, z] = altazFrameApply(frame, pr, pd, i);
      alts[i] = Math.round(a * 10) / 10;
      azs[i] = Math.round(z * 10) / 10;       // parity with server rounding
      ceils[i] = Math.round(ceil(z) * 10) / 10;
      if (ceilsTop) ceilsTop[i] = Math.round(ceilTop(z) * 10) / 10;
    }
    o.alt = alts; o.az = azs; o.ceil = ceils;
    if (ceilsTop) o.ceil_top = ceilsTop;
    let maxi = 0;
    for (let i = 1; i < n; i++) if (alts[i] > alts[maxi]) maxi = i;
    o.max_alt = alts[maxi];
    o.max_i = maxi;
    if ((k & 255) === 255) await new Promise(r => setTimeout(r, 0));
  }
}

/* ---------- moon scoring helpers (shared by desktop + web) ---------- */

/* Filter type derived from user settings — narrowband filters tolerate
   much closer moon distances than broadband. */
function filterType() {
  const F = (S.cfg && S.cfg.filters) || {};
  if (F.narrowband_oiii) return "oiii";   // 90° base
  if (F.narrowband_ha)   return "narrowband"; // 60° base
  if (F.broadband)       return "lrgb";    // 120° base
  return "lrgb";
}

/* Phase-dependent minimum moon distance (Lorentzian, symmetric about full moon).
   The threshold is LARGEST at full moon (= BASE) and smallest at new moon
   (= BASE/3.25); objects closer than the threshold take the full illumination
   penalty, and beyond it the glow decays over 180°. `moonAgeDays` is the folded
   age the server ships (0 = new ... ~14.76 = full), so `frac` spans 0-0.5 - the
   symmetry means a full 0-29.53 age would give the same result.
   The 0.333 constant controls how sharply the threshold rises toward full.

   EXPORTED TOGETHER WITH THE WEB TWIN (web/astro.js): tests/test_js_parity.py
   compares both implementations on one input grid, so the two apps cannot drift
   apart again the way they did when the web scored over a civil window with
   the wrong moon illumination. */
export function moonMinDist(filterType, moonAgeDays) {
  const BASE = { narrowband: 60, oiii: 90, lrgb: 120 }[filterType] || 120;
  const frac = moonAgeDays / 29.53;           // 0 = new, 0.5 = full
  return BASE / (1 + Math.pow((0.5 - frac) / 0.333, 2));
}

/* Effective moon illumination for scoring: raw illumination attenuated by
   angular separation AND filter-specific distance tolerance. */
export function effectiveMoonGlow(illum, sep, filterType, moonAgeDays) {
  const minD = moonMinDist(filterType, moonAgeDays);
  const distDeg = Math.max(0, sep - minD);   // excess beyond safe distance
  const distFactor = Math.max(0, 1 - distDeg / 180);
  return illum * distFactor;
}

/* Multiplier applied to a sample's altitude weight under moonlight. */
export function moonPenalty(glow, typeF, bortleF) {
  return Math.max(0.05, 1 - 0.95 * glow * typeF * bortleF);
}

/* Bortle scaling - darker skies reduce the moon penalty more. The curve is
   CONTINUOUS at the bortle 3/4 junction (0.40 either side of it): before, one
   slider step changed the penalty by ~67 %, more than any other step.
   Range: 0.30 (bortle 1) ... 0.40 (3) ... 1.12 (9). */
export function bortleMoonFactor(bortle) {
  if (bortle <= 3) return 0.25 + 0.05 * bortle;   // 0.30-0.40 (dark sites)
  return 0.40 + 0.12 * (bortle - 3);              // 0.52-1.12 (suburban->city)
}

export function recomputeNightDerived() {
  const N = S.night;
  if (!N) return;
  const [i0, i1] = nightIndexRange();
  const nightN = Math.max(1, i1 - i0 + 1);
  const minAlt = S.minAlt;
  const illum = N.moon_illum || 0;
  const bortle = (S.cfg && S.cfg.bortle) || 4;
  const fType = filterType();
  const moonAge = N.moon_age_days || 0;  // 0-14.76 (folded), 0 = new, ~14.76 = full
  const bortleF = bortleMoonFactor(bortle);

  for (const o of N.objects) {
    o.vis = o.alt.map((a, i) =>
      a >= minAlt && a > o.ceil[i] && a < (o.ceil_top ? o.ceil_top[i] : 90.5));
    o.above = o.alt.map(a => a > 0);
    let visIn = 0, blocked = 0, sClassic = 0, sMoon = 0;
    const m = S.meta[o.id];
    const typeF = moonSensitivity(m && m.otype);
    /* The clear window, the score and the "% of night" are all measured WITHIN
       the dark window (dusk..dawn = i0..i1). The payload's grid deliberately
       carries an hour of twilight on each side for chart context; counting it
       made the desktop advertise clear windows that included daylight (e.g.
       19:37-07:01 for a 20:37-06:02 night) and score samples the web - which
       clips to the same window - never sees. `o.vis` itself stays unclipped:
       the charts and the sky view colour every sample. */
    for (let i = 0; i < o.vis.length; i++) {
      const v = o.vis[i], up = o.above[i];
      const inNight = i >= i0 && i <= i1;
      if (inNight && v) visIn++;
      if (up && !v) blocked++;
      if (v && inNight) {
        let w = Math.sin(Math.max(0, Math.min(90, o.alt[i])) * Math.PI / 180);
        sClassic += w;
        const ma = N.moon_alt[i];
        if (ma > 0) {
          const sep = sepDeg(o.alt[i], o.az[i], ma, N.moon_az[i]);
          const glow = effectiveMoonGlow(illum, sep, fType, moonAge);
          w *= moonPenalty(glow, typeF, bortleF);
        }
        sMoon += w;
      }
    }
    const inNightFlags = o.vis.map((v, i) => v && i >= i0 && i <= i1);
    const nightOnly = o.above.map((v, i) => v && i >= i0 && i <= i1);
    o.obs_pct = Math.round(100 * visIn / nightN);
    o.best = longestRunJS(inNightFlags);
    o.best_above = longestRunJS(nightOnly);
    o.blocked_n = blocked;
    o.score = Math.round(sClassic * 10) / 100;
    o.score_moon = Math.round(sMoon * 10) / 100;
  }
}

/* how badly an object type suffers under moonlight: faint extended nebulae
   wash out, while star clusters and bright galaxies keep their cores.
   Shared with the web twin - tests/test_js_parity.py compares both. */
export const MOON_TYPE_FACTOR = {
  nebula: 1.6, supernova_remnant: 1.6, planetary: 1.3,
  star_cloud: 1.1, galaxy: 0.8, open_cluster: 0.55, globular: 0.5,
  asterism: 0.55,
};
export function moonSensitivity(otype) {
  return MOON_TYPE_FACTOR[otype] || 1.0;
}

/* great-circle separation between two (alt, az) points in degrees */
function sepDeg(alt1, az1, alt2, az2) {
  const p1 = alt1 * Math.PI / 180, p2 = alt2 * Math.PI / 180;
  const dra = (az1 - az2) * Math.PI / 180;
  return Math.acos(Math.max(-1, Math.min(1,
      Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dra))))
      * 180 / Math.PI;
}

export function moonAt(dateObj) {
  if (!S.night) return null;
  const tl = S.night.timeline;
  const t0 = parseUTC(tl.times_iso[0]).getTime();
  const stepMs = tl.step_min * 60000;
  const f = (dateObj.getTime() - t0) / stepMs;
  if (f < 0 || f > tl.n - 1) return null;
  const i = Math.floor(f), j = Math.min(tl.n - 1, i + 1), fr = f - i;
  return S.night.moon_alt[i] * (1 - fr) + S.night.moon_alt[j] * fr;
}

/* x pixel for an absolute time within the detail-chart time span */
export function moonBandX(iso, d, ML, pw) {
  const t = parseUTC(iso).getTime();
  const t0 = parseUTC(d.times_iso[0]).getTime();
  const t1 = parseUTC(d.times_iso[d.times_iso.length - 1]).getTime();
  return ML + clamp((t - t0) / ((t1 - t0) || 1), 0, 1) * pw;
}

export function moonUpDownText() {
  if (!S.night) return "";
  const ma = S.night.moon_alt, tl = S.night.timeline;
  let first = -1, last = -1;
  for (let i = 0; i < tl.n; i++) if (ma[i] > 0) { if (first < 0) first = i; last = i; }
  if (first < 0) return "Moon below horizon all night";
  return `Moon up ${fmtHM(tl.times_iso[first])} \u2013 ${fmtHM(tl.times_iso[last])}`;
}

/* ---------------- per-object helpers ---------------- */

export function statusOf(o, i) {
  const alt = o.alt[i], ceil = o.ceil[i], min = S.minAlt;
  // mirror the visibility predicate (o.vis): a sky-mode upper ceiling
  // (ceil_top) blocks ABOVE the band, exactly like a horizon obstruction
  // blocks below it - status must never say "Observable" where vis[] says no
  const top = o.ceil_top ? o.ceil_top[i] : 90.5;
  if (alt <= 0)       return { code: "hor", text: "Below horizon" };
  if (alt <= ceil || alt >= top) return { code: "blk", text: "Blocked" };
  if (alt < min)      return { code: "low", text: "Too low" };
  return                 { code: "vis", text: "Observable" };
}

/* The authoritative minimum-altitude rule (shared with the server and the
   web): an explicitly stored min_useful_alt wins; otherwise the Bortle-derived
   default 17 + 2*bortle applies ("darker skies -> lower default"). The server
   ships the resolved value PLUS the explicit flag (api_state), so the client
   can re-derive the threshold live when Bortle changes instead of freezing it
   at boot (the web has always done this in horizon.js::effectiveMinAlt). */
export function effectiveMinAlt(cfg) {
  if (cfg && cfg.min_useful_alt_explicit && cfg.min_useful_alt != null)
    return cfg.min_useful_alt;
  return 17 + 2 * ((cfg && cfg.bortle) || 4);
}

export function windowText(o) {
  const tl = S.night.timeline;
  if (!o.best) {
    if (o.best_above) {
      const [a, b] = o.best_above;
      return `<span class="wininfo">${fmtHM(tl.times_iso[a])}&ndash;${fmtHM(windowEndISO(tl.times_iso, b, tl.step_min))} <small>(obstructed)</small></span>`;
    }
    return '<span class="wininfo"><small>&mdash;</small></span>';
  }
  const [a, b] = o.best;
  const mins = (b - a) * tl.step_min;
  return `<span class="wininfo">${fmtHM(tl.times_iso[a])}&ndash;${fmtHM(windowEndISO(tl.times_iso, b, tl.step_min))}<br>` +
         `<small>${Math.floor(mins/60)}h ${String(mins%60).padStart(2,"0")}m clear</small></span>`;
}

export function desigLine(m) {
  const parts = [];
  if (m.messier) parts.push(m.messier);
  if (m.ngcic)   parts.push(m.ngcic.split("/")[0]);
  return parts.join(" \u00B7 ") || (m.other || "");
}

export function shortName(m) {
  return (m.messier || m.ngcic || m.primary_name).split("/")[0];
}

function activeProfile() {
  const act = S.panos.find(p => p.active) ||
              S.panos.find(p => p.id === (S.cfg && S.cfg.active_pano_id));
  return act && act.profile && act.profile.length ? act.profile : null;
}
export { activeProfile, activeTopProfile };

function activeTopProfile() {
  const act = S.panos.find(p => p.active) ||
              S.panos.find(p => p.id === (S.cfg && S.cfg.active_pano_id));
  return act && act.profile_top && act.profile_top.length
      ? act.profile_top : null;
}

/* ---------------- scoring & filters ---------------- */

export function objScore(o) {
  if (S.cfg && S.cfg.moon_aware)
    return o.score_moon != null ? o.score_moon : (o.score || 0);
  return o.score || 0;
}

/* ---------------- hidden popularity scoring ----------------
   Popularity data from the popularity source (community engagement scores).
   Used as a silent tiebreaker — two objects with the same moon-aware
   score get differentiated by how popular they are with imagers.
   The score lives in the catalog as m.popularity (set during seed). */
/* Log-scale normalization: M42 (165k) → ~1.0, dim object (100) → ~0.3 */
export function popularityFactor(m) {
  if (!m || !m.popularity) return 0;
  return Math.min(1, 0.3 + 0.7 * Math.log10(m.popularity) / 5.2);
}

export function filterAdvice(m) {
  const F = (S.cfg && S.cfg.filters) || {};
  const hasNB = !!(F.narrowband_ha || F.narrowband_oiii);
  const hasBB = !!F.broadband;
  const t = m.otype;
  if (t === "nebula" || t === "supernova_remnant" || t === "planetary") {
    if (hasNB) return { pill: `<span class="fbadge ok">NB &#10003;</span>`,
                        text: "narrowband \u2713",
                        cls: "ok" };
    return { pill: `<span class="fbadge warn">NB</span>`,
             text: "narrowband",
             cls: "warn" };
  }
  const broadbandOnly = t === "galaxy" || t === "open_cluster"
                     || t === "globular" || t === "star_cloud" || t === "asterism";
  if (broadbandOnly && !hasBB && hasNB)
    return { pill: `<span class="fbadge bad">BB &#10007;</span>`,
             text: "broadband \u2717",
             cls: "bad" };
  return null;
}

/* ---------- rig profiles & frame coverage ---------- */

export function activeRig() {
  if (!S.cfg || !S.cfg.rigs) return null;
  return S.cfg.rigs.find(r => r.id === S.cfg.active_rig_id) || null;
}

/* linear span of the object's larger dimension vs its matching frame axis */
export function frameCoverage(m) {
  const rig = activeRig();
  if (!rig || !m.size_am) return null;
  const nums = String(m.size_am).split(/[x\u00D7]/).map(parseFloat)
                  .filter(v => !isNaN(v));
  if (!nums.length) return null;
  const ow = nums[0], oh = nums.length > 1 ? nums[1] : nums[0];  // arcmin
  const fw = rig.fov_w, fh = rig.fov_h;                          // arcmin
  if (!(fw > 0 && fh > 0)) return null;
  const span = Math.max(ow / fw, oh / fh);
  return { pct: Math.round(span * 100), fits: span <= 1,
           frames: span > 1 ? span : 1 };
}

export function coverageCell(cov) {
  if (!cov) return '<span class="hint">&mdash;</span>';
  const cls = !cov.fits ? "st-blk" : cov.pct > 85 ? "st-low" : "st-vis";
  const tip = cov.fits
    ? `object spans ${cov.pct}% of the frame`
    : `too large for one frame: needs ~${cov.frames.toFixed(1)} frames`;
  return `<span class="statuspill ${cls}" title="${tip}">${cov.pct}%</span>`;
}
