/* pure derivations computed from raw night tracks + current preferences */

import { S } from "./state.js";
import { parseUTC, clamp, fmtHM } from "./util.js";
import { statusOf as coreStatusOf, effectiveMinAlt as coreMinAlt,
         moonSensitivity, effectiveMoonGlow, moonPenalty, bortleMoonFactor,
         popularityFactor as corePopularityFactor, scrubWindowMs,
         scrubBounds, scrubClamp, sepDeg }
  from "./core.js";

/* keyboard scrub steps in minutes - shared with the web (web/astro.js) and
   pinned by tests/test_js_parity.py: a plain arrow key is the fine step (one
   6-min night-grid sample), Shift is the coarse one (10 samples = 60 min). */
export const SCRUB_STEP_MIN = 6;
export const SCRUB_SHIFT_STEP_MIN = 60;

/* Selected-time sky visibility, per-sample status and the min-alt rule are
   shared in core/ (Phase 2, concept 4); this shell supplies the live S.minAlt.
   Mirrors web/astro.js::aboveHorizon ("abovehorizon" engine of
   tests/js/astro_parity.mjs). */
export { aboveHorizon } from "./core.js";

export { scrubBounds, scrubClamp } from "./core.js";

/* All-sky chart magnitude limit and "square" chart zoom - shared in core/
   (Phase 2, concept 1), pinned by the "mag" / "skyzoom" engines of
   tests/js/astro_parity.mjs. Re-exported so skyview.js keeps its imports. */
export {
  magVisible, SKY_ZOOM_MIN, SKY_ZOOM_MAX, skyClampZoom, skyViewMatrix,
  skyScreenToBase, skyClampFocus,
} from "./core.js";

/* Moon-aware scoring curves and the silent popularity tiebreaker - shared in
   core/ (Phase 2, concept 5), pinned by the "scoring" engine of
   tests/js/astro_parity.mjs. Re-exported so existing importers keep working. */
export {
  MOON_TYPE_FACTOR, moonSensitivity, moonMinDist,
  effectiveMoonGlow, moonPenalty, bortleMoonFactor,
} from "./core.js";

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
  return indexRangeFor(S.night.dusk, S.night.dawn);
}

/** First/last grid indices inside [startISO, endISO]; the whole grid when a
 *  bound is missing (polar day). Shared by the SCORING clip (dusk..dawn) and
 *  the SCRUB range (sunset..sunrise) so they can never drift. */
function indexRangeFor(startISO, endISO) {
  const tl = S.night.timeline;
  let i0 = 0, i1 = tl.n - 1;
  if (!startISO || !endISO) return [i0, i1];
  for (let i = 0; i < tl.n; i++) {
    if (parseUTC(tl.times_iso[i]) >= parseUTC(startISO)) { i0 = i; break; }
  }
  for (let i = tl.n - 1; i >= 0; i--) {
    if (parseUTC(tl.times_iso[i]) <= parseUTC(endISO)) { i1 = i; break; }
  }
  return [i0, Math.max(i0, i1)];
}

/** Grid index bounds [lo, hi] the scrub may select: the WHOLE night, from the
 *  sunset..sunrise pair when it is coherent (core/planning.js::scrubWindowMs),
 *  else dusk..dawn, else the site-zoned 20:00-04:00 fallback; the whole payload
 *  grid with view_full_day. SCORING still clips to dusk..dawn via
 *  nightIndexRange(). */
export function scrubWindowRange() {
  const tl = S.night && S.night.timeline;
  if (!tl) return [0, 0];
  if (S.cfg && S.cfg.view_full_day) return [0, tl.n - 1];
  const s = scrubWindowMs({
    sunsetMs: isoMs(S.night.sunset),
    sunriseMs: isoMs(S.night.sunrise),
    duskMs: isoMs(S.night.dusk),
    dawnMs: isoMs(S.night.dawn),
    noonMs: siteNoonMs(),
  });
  return indexRangeFor(msISO(s.startMs), msISO(s.endMs));
}

/* payload ISO (no Z) -> epoch ms; epoch ms -> the payload's ISO shape */
function isoMs(iso) { return iso ? parseUTC(iso).getTime() : null; }
function msISO(ms) { return new Date(ms).toISOString().slice(0, 19); }

/* the SITE's local noon from the payload (date_local + tz_offset_min) */
function siteNoonMs() {
  const n = S.night;
  const [y, m, d] = String(n.date_local || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d, 12) - (n.tz_offset_min || 0) * 60000;
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


/* great-circle separation is shared in core/ (Phase 2, concept 9) */


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

export const statusOf = (o, i) => coreStatusOf(o, i, S.minAlt);

/* The authoritative minimum-altitude rule (shared with the server and the
   web): an explicitly stored min_useful_alt wins; otherwise the Bortle-derived
   default 17 + 2*bortle applies ("darker skies -> lower default"). The server
   ships the resolved value PLUS the explicit flag (api_state), so the client
   can re-derive the threshold live when Bortle changes instead of freezing it
   at boot (the web has always done this in horizon.js::effectiveMinAlt). */
export const effectiveMinAlt = (cfg) => coreMinAlt(
  cfg && cfg.bortle,
  cfg && cfg.min_useful_alt_explicit ? cfg.min_useful_alt : null);

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
  // the painted band top caps the sky ONLY with the explicit block-above
  // opt-in; by default everything above the band is free sky (open above)
  return (act && act.block_above && act.profile_top && act.profile_top.length)
      ? act.profile_top : null;
}

/** Raw painted band top (ignores block_above) - used to HATCH the assumed-open
 *  area above the band when open-above is in effect. */
export function activeBandTop() {
  const act = S.panos.find(p => p.active) ||
              S.panos.find(p => p.id === (S.cfg && S.cfg.active_pano_id));
  return act && act.profile_top && act.profile_top.length
      ? act.profile_top : null;
}

/** Paint mode of the active panorama ('obstacle' | 'sky'), or null when none. */
export function activePaintMode() {
  const act = S.panos.find(p => p.active) ||
              S.panos.find(p => p.id === (S.cfg && S.cfg.active_pano_id));
  return act ? (act.paint_mode === "sky" ? "sky" : "obstacle") : null;
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
/* Log-scale normalization: M42 (165k) → ~1.0, dim object (100) → ~0.3.
   Desktop callers pass the catalog meta object, so this shell resolves
   m.popularity and delegates to the pure core curve (number -> 0..1). */
export function popularityFactor(m) {
  return corePopularityFactor(m && m.popularity);
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
  // GREEN while the object fits in one frame, AMBER once it needs a mosaic
  // (0.6.30, the same method as the web). The old ramp went red above 100% and
  // amber above 85%, which flagged a merely-full frame as a problem.
  const cls = cov.pct > 100 ? "st-low" : "st-vis";
  const tip = cov.fits
    ? `object spans ${cov.pct}% of the frame`
    : `too large for one frame: needs ~${cov.frames.toFixed(1)} frames`;
  return `<span class="statuspill ${cls}" title="${tip}">${cov.pct}%</span>`;
}
