/* object detail modal + altitude-vs-time chart */

import { $, clamp, parseUTC, esc, fmtHM, fmtT, toast, tzOffAt,
         zoneHour,
         TYPE_LABEL, constName, fmtSize } from "./util.js";
import { S, IMG_VER } from "./state.js";
import { filterAdvice, frameCoverage, moonAt, moonBandX,
         windowEndISO } from "./derive.js";
import { buildClientDetail } from "./planning_client.js";
import { vizTheme, drawMoonPhaseMarker } from "./viztheme.js";
import { julianDay, sunRaDec, moonRaDec, moonIllumination } from "./core.js";

let DETAIL = null;      // cached detail payload
let DETAIL_HOVER = null;// hovered sample index for crosshair
let _imgUrl = null;     // current blob URL assigned to #dImage
let DETAIL_RETURN_FOCUS = null;

function revokeImgUrl() {
  if (_imgUrl) { URL.revokeObjectURL(_imgUrl); _imgUrl = null; }
}

/** Close the detail modal and DROP THE IDENTITY.
 *
 *  DE-14: the "modal closed while fetching" guard compared against `S.currentId`,
 *  which no close path ever cleared - so the else branch was only reachable by
 *  opening a DIFFERENT object, and closing the modal mid-fetch left the full-size
 *  blob assigned to the hidden <img> (decoded, retained for the session). Clearing
 *  it here makes both guards (`:49` image upgrade, `:67` detail loader) see the
 *  close. */
function closeDetail() {
  $("#detailModal").classList.add("hidden");
  DETAIL = null;
  S.currentId = null;
  revokeImgUrl();
  const returnFocus = DETAIL_RETURN_FOCUS;
  DETAIL_RETURN_FOCUS = null;
  if (returnFocus && returnFocus.isConnected && !returnFocus.hidden) {
    returnFocus.focus({ preventScroll: true });
  }
}

export async function openDetail(id) {
  S.currentId = id;
  const m = S.meta[id];
  if (!m) return;
  DETAIL_RETURN_FOCUS = document.activeElement instanceof HTMLElement
    ? document.activeElement : null;
  DETAIL_HOVER = null;
  $("#detailModal").classList.remove("hidden");
  $("#dClose").focus({ preventScroll: true });

  $("#dTitle").textContent = m.primary_name;
  const chips = [];
  if (m.messier) chips.push(`<span class="statuspill st-vis">${esc(m.messier)}</span>`);
  if (m.ngcic)   chips.push(`<span class="statuspill st-vis">${esc(m.ngcic)}</span>`);
  if (m.other)   m.other.split(",").forEach(x => x.trim() &&
                   chips.push(`<span class="typebadge">${esc(x.trim())}</span>`));
  $("#dNames").innerHTML = chips.join(" ");

  $("#dBlurb").textContent = m.blurb || "";
  // instant: cached image or placeholder - never block the modal on the
  // Wikipedia/DSS network chain; the real image upgrades in the background
  // (capped at 8 s so a slow chain can never hog a browser connection and
  // starve other requests)
  const img = $("#dImage");
  revokeImgUrl();   // drop the previous object's blob before replacing it
  img.src = `/api/object/${id}/image?thumb=1&v=${IMG_VER}`;
  const upCtl = new AbortController();
  const upTimer = setTimeout(() => upCtl.abort(), 8000);
  fetch(`/api/object/${id}/image?v=${Date.now()}`, { signal: upCtl.signal })
    .then(r => (r.ok ? r.blob() : null))
    .then(b => {
      if (!b) return;
      const u = URL.createObjectURL(b);
      if (S.currentId === id) { _imgUrl = u; img.src = u; }
      else URL.revokeObjectURL(u);   // modal closed while fetching - never leak
    })
    .catch(() => {})
    .finally(() => clearTimeout(upTimer));

  // Core-only planning (Phase C): the detail payload is built locally from
  // the shared core (planning_client.js) - there is no server fallback.
  let d;
  try {
    d = await buildClientDetail(id, { date: $("#dateInput").value,
      tzMin: tzOffAt($("#dateInput").value), minAlt: S.minAlt,
      siteId: S.activeSiteId });
  } catch (err) {
    toast("Object details failed: " + err.message);
    console.error(err);
    return;
  }
  if (S.currentId !== id) return;   // another object was opened while loading:
                                    // never paint this one's data under its title
  DETAIL = d;
  renderDetailMeta(m, DETAIL);
  drawAltChart();
}

function renderDetailMeta(m, d) {
  const adv = filterAdvice(m);
  const cov = frameCoverage(m);
  const provenance = S.catalogProvenance?.objects?.[m.id];
  const provenanceRows = provenance ? [
    ["Catalog source", `<span title="${esc(provenance.source_version || "unknown")}">${esc(provenance.source || "unknown")} · ${esc(provenance.source_file || "")}</span>`],
    ["Aliases", provenance.aliases?.length ? esc(provenance.aliases.join(" · ")) : "—"],
    ["Designation history", provenance.designation_history?.length
      ? esc(provenance.designation_history.map((x) => x.designation).join(" → "))
      : "—"],
  ] : [["Catalog provenance", "not available"]];
  const covTxt = cov
      ? `<span class="statuspill ${!cov.fits ? "st-blk" : cov.pct > 85 ? "st-low" : "st-vis"}">` +
        (cov.fits ? `${cov.pct}% of frame width` : `~${cov.frames.toFixed(1)} frames`) +
        `</span> <small>${esc(activeRigName())}</small>`
      : "\u2014";
  const rows = [
    ["Type", esc(TYPE_LABEL[m.otype] || m.otype)],
    ["Filters", adv ? `<span class="fbadge ${adv.cls}">${adv.text}</span>` : "no special filter needed"],
    ["Magnitude", m.vmag != null ? m.vmag.toFixed(1) + " mag" : "\u2014"],
    ["Size", fmtSize(m.size_am, (S.cfg && S.cfg.size_unit) || "arcmin")],
    ["Frame coverage", covTxt],
    ["Constellation", esc(constName(m.constellation))],
    ["RA (J2000)", `<span class="mono">${d.meta.ra_hms}</span>`],
    ["Dec (J2000)", `<span class="mono">${d.meta.dec_dms}</span>`],
    ...provenanceRows,
    ["Visibility", visibilityText(d)],
    ["Culmination", `${d.max_alt.toFixed(1)}\u00B0 at ${fmtHM(d.max_time)}`],
    ["Rise / set", `${fmtHM(d.rise_time)} \u00B7 ${fmtHM(d.set_time)}`],
    ["Usable interval", d.best
        ? `${fmtHM(d.usable_start)}\u2013${fmtHM(d.usable_end)} (${durStr(d.usable_start, d.usable_end)})`
        : visibilityText(d)],
  ];
  $("#dMeta").innerHTML = rows.map(([k,v]) =>
    `<tr><td>${k}</td><td>${v}</td></tr>`).join("");
}

function activeRigName() {
  const rig = S.cfg && S.cfg.rigs &&
              S.cfg.rigs.find(r => r.id === S.cfg.active_rig_id);
  return rig ? rig.name : "";
}
function durStr(aIso, bIso) {
  // never render NaN for a valid window: both ends come from windowEndISO(),
  // which resolves an exclusive end index to a real timestamp
  if (!aIso || !bIso) return "\u2014";
  const mins = Math.max(0, Math.round((parseUTC(bIso) - parseUTC(aIso)) / 60000));
  if (!Number.isFinite(mins)) return "\u2014";
  return `${Math.floor(mins/60)}h ${String(mins%60).padStart(2,"0")}m`;
}

function visibilityText(d) {
  const why = {
    blocked_by_horizon: "blocked because of horizon",
    below_minimum_altitude: "below minimum altitude",
    outside_selected_window: "outside the selected window",
    never_rises: "never rises in this window",
    no_usable_window: "no usable visibility interval",
  }[d.visibility_reason];
  if (d.visibility_reason === "visible") {
    const minutes = Math.round(d.visible_minutes || 0);
    return `<b>visible for ${minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`}</b> of tonight's window`;
  }
  return why || "no usable visibility interval";
}

function moonPhaseAt(dateObj) {
  const jd = julianDay(dateObj);
  const [sunRa] = sunRaDec(jd);
  const [moonRa] = moonRaDec(jd);
  return {
    illumination: moonIllumination(jd),
    waxing: ((moonRa - sunRa + 360) % 360) < 180,
  };
}

export function bindDetail() {
  $("#dClose").addEventListener("click", () => {
    closeDetail();
  });
  // rig/filter/unit changes made elsewhere re-render the open modal
  document.addEventListener("detail:changed", () => {
    if (DETAIL && S.currentId) renderDetailMeta(S.meta[S.currentId], DETAIL);
  });
  $("#detailModal").addEventListener("mousedown", e => {
    if (e.target.id === "detailModal") closeDetail();
  });
  $("#chkMoon").addEventListener("change", drawAltChart);
  window.addEventListener("resize", () => { if (DETAIL) drawAltChart(); });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      $("#sitesModal").classList.add("hidden");
      closeDetail();
    }
    if (!DETAIL) return;
    if (e.key === "ArrowRight") stepDetail(+1);
    if (e.key === "ArrowLeft")  stepDetail(-1);
  });
}

function stepDetail(dir) {
  const ids = S.filteredIds.length ? S.filteredIds : Object.keys(S.meta);
  let i = ids.indexOf(S.currentId);
  if (i < 0) return;
  i = (i + dir + ids.length) % ids.length;
  openDetail(ids[i]);
}

/* ---------------- altitude chart ---------------- */
export function drawAltChart() {
  const cv = $("#altChart"), tip = $("#chartTip");
  if (!DETAIL) return;
  const d = DETAIL;
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const ML=52, MR=16, MT=14, MB=34;
  const pw = W-ML-MR, ph = H-MT-MB;
  const nT = d.alt.length;
  const X = i => ML + (i/(nT-1))*pw;
  const Y = a => MT + (1 - (a - (-10)) / 100) * ph;   // -10..90 deg

  const C = vizTheme();

  // twilight shading outside dusk..dawn
  const duskXv = moonBandX(d.dusk, d, ML, pw), dawnXv = moonBandX(d.dawn, d, ML, pw);
  ctx.fillStyle = C.twilightShade;
  if (duskXv > ML) ctx.fillRect(ML, MT, duskXv-ML, ph);
  if (dawnXv < ML+pw) ctx.fillRect(dawnXv, MT, ML+pw-dawnXv, ph);

  // moon-up bands
  if ($("#chkMoon").checked && S.night) {
    ctx.fillStyle = C.moonBand;
    let segStart = null;
    for (let i=0;i<nT;i++) {
      const ma = moonAt(parseUTC(d.times_iso[i]));
      const up = ma != null && ma > 0;
      if (up && segStart === null) segStart = i;
      if (segStart !== null && !up) {
        ctx.fillRect(X(segStart), MT, X(Math.max(0,i-1))-X(segStart)+1, ph);
        segStart = null;
      }
    }
    if (segStart !== null) ctx.fillRect(X(segStart), MT, X(nT-1)-X(segStart)+1, ph);
  }

  // horizontal grid + labels
  ctx.font = "11px Consolas, monospace";
  for (let a=-10; a<=90; a+=15) {
    ctx.strokeStyle = a===0 ? C.gridStrong : C.grid;
    ctx.beginPath(); ctx.moveTo(ML, Y(a)); ctx.lineTo(W-MR, Y(a)); ctx.stroke();
    ctx.fillStyle = a===0 ? C.dim : C.axis;
    ctx.fillText(`${a}\u00B0`, 14, Y(a)+4);
  }

  // vertical hour lines
  let prevHour = -1;
  for (let i=0;i<nT;i++){
    const dt = parseUTC(d.times_iso[i]);
    const h = zoneHour(dt);
    if (h !== prevHour) {
      prevHour = h;
      const x = X(i);
      ctx.strokeStyle = C.grid;
      ctx.beginPath(); ctx.moveTo(x, MT); ctx.lineTo(x, MT+ph); ctx.stroke();
      ctx.fillStyle = C.axis;
      const lab = fmtT(dt);
      ctx.fillText(lab, x-14, H-10);
    }
  }

  // Keep data marks inside the plot rectangle. Moon altitude can be below the
  // chart floor; clipping prevents it from running into the time labels.
  ctx.save();
  ctx.beginPath();
  ctx.rect(ML, MT, pw, ph);
  ctx.clip();

  // obstruction fill between ceiling and horizon line
  ctx.beginPath();
  let started=false;
  for (let i=0;i<nT;i++){
    const y = Y(Math.max(0, Math.min(d.ceil[i], 88)));
    const x = X(i);
    if (!started){ ctx.moveTo(x,y); started=true; } else ctx.lineTo(x,y);
  }
  for (let i=nT-1;i>=0;i--) ctx.lineTo(X(i), Y(0));
  ctx.closePath();
  ctx.fillStyle = C.obstacleFill;
  ctx.fill();

  // ceiling dashed line
  ctx.setLineDash(C.guideCeilingDash);
  ctx.strokeStyle = C.ceiling; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i=0;i<nT;i++){
    const y = Y(clamp(d.ceil[i], -10, 88)), x = X(i);
    i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
  }
  ctx.stroke(); ctx.setLineDash([]);

  // sky-mode upper ceiling: blocked above the painted band. Values >= 88
  // mean "no upper ceiling" (painted to the frame top) - skip those.
  if (d.ceil_top) {
    // fill each contiguous band segment between its top line and Y(88)
    ctx.fillStyle = C.obstacleFill;
    let segStart = null;
    for (let i = 0; i <= nT; i++) {
      const v = i < nT ? d.ceil_top[i] : 90;
      if (i < nT && v < 88 && segStart === null) segStart = i;
      if (segStart !== null && (i === nT || v >= 88)) {
        ctx.beginPath();
        ctx.moveTo(X(segStart), Y(Math.min(88, Math.max(0, d.ceil_top[segStart]))));
        for (let j = segStart; j < i; j++) {
          ctx.lineTo(X(j), Y(Math.min(88, Math.max(0, d.ceil_top[j]))));
        }
        ctx.lineTo(X(i - 1), Y(88));
        ctx.lineTo(X(segStart), Y(88));
        ctx.closePath();
        ctx.fill();
        segStart = null;
      }
    }
    ctx.setLineDash(C.guideCeilingTopDash);
    ctx.strokeStyle = C.ceilingTop; ctx.lineWidth = 1;
    ctx.beginPath();
    let pen = false;
    for (let i=0;i<nT;i++){
      const v = d.ceil_top[i];
      if (v >= 88) { pen = false; continue; }
      const y = Y(clamp(v, -10, 88)), x = X(i);
      pen ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
      pen = true;
    }
    ctx.stroke(); ctx.setLineDash([]);
  }

  // min useful altitude
  ctx.strokeStyle = C.minStroke;
  ctx.setLineDash(C.guideMinDash);
  ctx.beginPath(); ctx.moveTo(ML, Y(d.min_useful_alt)); ctx.lineTo(W-MR, Y(d.min_useful_alt)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = C.minLabel;
  ctx.fillText(`min ${d.min_useful_alt}\u00B0`, W-MR-58, Y(d.min_useful_alt)-5);

  // moon track (clipped at the chart floor of -10 degrees)
  if ($("#chkMoon").checked && S.night) {
    ctx.strokeStyle = C.moonLine; ctx.lineWidth = 1; ctx.setLineDash(C.guideMoonDash);
    ctx.beginPath();
    let pen = false;
    const moonPoints = [];
    for (let i=0;i<nT;i++){
      const ma = moonAt(parseUTC(d.times_iso[i]));
      if (ma == null || ma < -10 || ma > 90) { pen = false; continue; }
      const x = X(i), y = Y(ma);
      pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      moonPoints.push({ i, x, y });
      pen = true;
    }
    ctx.stroke(); ctx.setLineDash([]);
    const markerStep = Math.max(1, Math.round(nT / 9));
    moonPoints.forEach((p) => {
      if (p.i % markerStep !== 0 || p.y <= MT + 5 || p.y >= H - MB - 5) return;
      drawMoonPhaseMarker(ctx, p.x, p.y,
        moonPhaseAt(parseUTC(d.times_iso[p.i])), C);
    });
  }

  // altitude curve colored per segment
  const colorAt = i => {
    const a=d.alt[i];
    if (a<=0) return C.below;
    if (a<=d.ceil[i]) return C.bad;
    if (d.ceil_top && a >= d.ceil_top[i]) return C.bad;
    if (a<d.min_useful_alt) return C.warn;
    return C.good;
  };
  ctx.lineWidth = 2.2;
  for (let i=0;i<nT-1;i++){
    ctx.strokeStyle = colorAt(i);
    ctx.beginPath(); ctx.moveTo(X(i),Y(d.alt[i])); ctx.lineTo(X(i+1),Y(d.alt[i+1])); ctx.stroke();
  }

  // best window highlight: the run is a half-open sample range, so the band
  // covers exactly the visible samples and never runs past the last one
  if (d.best) {
    const a = d.best[0];
    const b = Math.min(d.best[1], nT - 1);      // last visible sample
    ctx.fillStyle = C.goodFill;
    ctx.fillRect(X(a), MT, X(b) - X(a), ph);
    ctx.fillStyle = C.good;
    ctx.beginPath(); ctx.arc(X(a), Y(d.alt[a]), 3.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(X(b), Y(d.alt[b]), 3.4, 0, 7); ctx.fill();
  }
  ctx.restore();

  // max marker
  const mi = d.alt.indexOf(Math.max(...d.alt));
  ctx.fillStyle = C.target;
  ctx.beginPath(); ctx.arc(X(mi), Y(d.alt[mi]), 3.2, 0, 7); ctx.fill();
  ctx.font = "11px Consolas, monospace";
  ctx.fillText(`${d.max_alt.toFixed(0)}\u00B0`, X(mi)+6, Y(d.alt[mi])-6);

  // single hover crosshair drawn as part of this pass
  if (DETAIL_HOVER != null) {
    ctx.save();
    ctx.strokeStyle = C.crosshair;
    ctx.beginPath(); ctx.moveTo(X(DETAIL_HOVER), MT); ctx.lineTo(X(DETAIL_HOVER), MT+ph); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = C.target;
    ctx.beginPath(); ctx.arc(X(DETAIL_HOVER), Y(d.alt[DETAIL_HOVER]), 3.5, 0, 7); ctx.fill();
  }

  // hover interaction
  const hover = ev => {
    const rect = cv.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const i = clamp(Math.round((mx-ML)/pw*(nT-1)), 0, nT-1);
    const a=d.alt[i], z=d.az[i];
    const st = a<=0?"below horizon": a<=d.ceil[i]?`BLOCKED (ceiling ${d.ceil[i].toFixed(0)}\u00B0)`:
               a<d.min_useful_alt?"below your minimum":"clear";
    tip.innerHTML = `<b>${fmtT(parseUTC(d.times_iso[i]))}</b><br>` +
      `alt ${a.toFixed(1)}\u00B0 &middot; az ${z.toFixed(0)}\u00B0<br>${st}`;
    tip.classList.remove("hidden");
    tip.style.left = (ev.clientX+14)+"px";
    tip.style.top  = (rect.top+MT+20)+"px";
    if (DETAIL_HOVER !== i) { DETAIL_HOVER = i; drawAltChart(); }
  };
  const leave = () => {
    DETAIL_HOVER = null;
    tip.classList.add("hidden");
    drawAltChart();
  };
  cv.onmousemove = hover; cv.onmouseleave = leave;
  const summary = $("#altChartSummary");
  if (summary) {
    const name = S.meta[S.currentId]?.primary_name || "selected target";
    const reason = d.visibility_reason === "visible"
      ? `visible for ${Math.round(d.visible_minutes || 0)} minutes`
      : visibilityText(d).replace(/<[^>]+>/g, "");
    const usable = d.usable_start && d.usable_end
      ? ` Usable interval ${fmtHM(d.usable_start)} to ${fmtHM(d.usable_end)}.` : "";
    summary.textContent = `${name} altitude chart. Maximum altitude ${d.max_alt.toFixed(1)} degrees at ${fmtHM(d.max_time)}; ${reason}.${usable}`;
  }
}
