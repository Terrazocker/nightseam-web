/* pure derivations computed from raw night tracks + current preferences */

import { S } from "./state.js";
import { parseUTC, clamp, esc, fmtHM } from "./util.js";

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

function nightIndexRange() {
  const tl = S.night.timeline;
  let i0 = 0, i1 = tl.n - 1;
  for (let i = 0; i < tl.n; i++) {
    if (parseUTC(tl.times_iso[i]) >= parseUTC(S.night.dusk)) { i0 = i; break; }
  }
  for (let i = tl.n - 1; i >= 0; i--) {
    if (parseUTC(tl.times_iso[i]) <= parseUTC(S.night.dawn)) { i1 = i; break; }
  }
  return [i0, Math.max(i0, i1)];
}

/* ---------------- advanced catalog: synthesize tracks client-side -------- */

import { julianDay, precessJ2000ToDate, altazPrecessed } from "./astro.js";

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

/* The server ships advanced-mode objects as metadata only; compute their
   alt/az/ceil tracks here (precession once per object at the grid midpoint,
   then per-sample alt/az) so all views work unchanged. */
export function synthesizeAdvancedTracks(N) {
  const site = N.site;
  const jds = N.timeline.times_iso.map(iso => julianDay(parseUTC(iso)));
  const refJd = jds[Math.floor(jds.length / 2)];
  const ceil = ceilLookup(activeProfile());
  for (const o of N.objects) {
    if (!o.adv) continue;
    const [pr, pd] = precessJ2000ToDate(o.ra_hours * 15, o.dec_deg, refJd);
    const alts = [], azs = [], ceils = [];
    for (const jd of jds) {
      const [a, z] = altazPrecessed(pr, pd, jd, site.lat, site.lon);
      alts.push(Math.round(a * 10) / 10);
      azs.push(Math.round(z * 10) / 10);       // parity with server rounding
      ceils.push(Math.round(ceil(z) * 10) / 10);
    }
    o.alt = alts; o.az = azs; o.ceil = ceils;
    let maxi = 0;
    for (let i = 1; i < alts.length; i++) if (alts[i] > alts[maxi]) maxi = i;
    o.max_alt = alts[maxi];
    o.max_i = maxi;
  }
}

export function recomputeNightDerived() {
  const N = S.night;
  if (!N) return;
  const [i0, i1] = nightIndexRange();
  const nightN = Math.max(1, i1 - i0 + 1);
  const minAlt = S.minAlt;
  const illum = N.moon_illum || 0;

  for (const o of N.objects) {
    o.vis = o.alt.map((a, i) => a >= minAlt && a > o.ceil[i]);
    o.above = o.alt.map(a => a > 0);
    let visIn = 0, blocked = 0, sClassic = 0, sMoon = 0;
    for (let i = 0; i < o.vis.length; i++) {
      const v = o.vis[i], up = o.above[i];
      if (i >= i0 && i <= i1 && v) visIn++;
      if (up && !v) blocked++;
      if (v) {
        let w = Math.sin(Math.max(0, Math.min(90, o.alt[i])) * Math.PI / 180);
        sClassic += w;
        const ma = N.moon_alt[i];
        if (ma > 0) {
          const mfac = illum * Math.max(0, Math.min(1, ma / 45));
          w *= Math.max(0.08, 1 - 0.92 * mfac);
        }
        sMoon += w;
      }
    }
    o.obs_pct = Math.round(100 * visIn / nightN);
    o.best = longestRunJS(o.vis);
    o.best_above = longestRunJS(o.above);
    o.blocked_n = blocked;
    o.score = Math.round(sClassic * 10) / 100;
    o.score_moon = Math.round(sMoon * 10) / 100;
  }
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
  if (alt <= 0)    return { code: "hor", text: "Below horizon" };
  if (alt <= ceil) return { code: "blk", text: "Blocked" };
  if (alt < min)   return { code: "low", text: "Too low" };
  return              { code: "vis", text: "Observable" };
}

export function windowText(o) {
  if (!o.best) {
    if (o.best_above) {
      const [a, b] = o.best_above;
      return `<span class="wininfo">${fmtHM(S.night.timeline.times_iso[a])}&ndash;${fmtHM(S.night.timeline.times_iso[b])} <small>(obstructed)</small></span>`;
    }
    return '<span class="wininfo"><small>&mdash;</small></span>';
  }
  const [a, b] = o.best;
  const mins = (b - a) * S.night.timeline.step_min;
  return `<span class="wininfo">${fmtHM(S.night.timeline.times_iso[a])}&ndash;${fmtHM(S.night.timeline.times_iso[b])}<br>` +
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
export { activeProfile };

/* ---------------- scoring & filters ---------------- */

export function objScore(o) {
  if (S.cfg && S.cfg.moon_aware)
    return o.score_moon != null ? o.score_moon : (o.score || 0);
  return o.score || 0;
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
