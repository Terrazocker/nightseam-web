/* object detail modal + altitude-vs-time chart */

import { $, api, clamp, parseUTC, esc, fmtHM, fmtT, toast, tzOffAt,
         zoneHour,
         TYPE_LABEL, constName, fmtSize } from "./util.js";
import { S, IMG_VER } from "./state.js";
import { filterAdvice, frameCoverage, moonAt, moonBandX } from "./derive.js";

let DETAIL = null;      // cached detail payload
let DETAIL_HOVER = null;// hovered sample index for crosshair
let _imgUrl = null;     // current blob URL assigned to #dImage

function revokeImgUrl() {
  if (_imgUrl) { URL.revokeObjectURL(_imgUrl); _imgUrl = null; }
}

export async function openDetail(id) {
  S.currentId = id;
  const m = S.meta[id];
  if (!m) return;
  DETAIL_HOVER = null;
  $("#detailModal").classList.remove("hidden");

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

  const q = new URLSearchParams({date: $("#dateInput").value,
    tz_offset_min: tzOffAt($("#dateInput").value), minalt: S.minAlt});
  if (S.activeSiteId != null) q.set("site", S.activeSiteId);
  try {
    DETAIL = await api(`/api/object/${id}?` + q);
  } catch (err) {
    toast("Object details failed: " + err.message);
    console.error(err);
    return;
  }
  renderDetailMeta(m, DETAIL);
  drawAltChart();
}

function renderDetailMeta(m, d) {
  const nObj = S.night ? S.night.objects.find(x => x.id === m.id) : null;
  const adv = filterAdvice(m);
  const cov = frameCoverage(m);
  const covTxt = cov
      ? `<span class="statuspill ${!cov.fits ? "st-blk" : cov.pct > 85 ? "st-low" : "st-vis"}">` +
        (cov.fits ? `${cov.pct}% of frame width` : `~${cov.frames.toFixed(1)} frames`) +
        `</span> <small>${esc(activeRigName())}</small>`
      : "\u2014";
  const rows = [
    ["Type", TYPE_LABEL[m.otype] || m.otype],
    ["Filters", adv ? `<span class="fbadge ${adv.cls}">${adv.text}</span>` : "no special filter needed"],
    ["Magnitude", m.vmag != null ? m.vmag.toFixed(1) + " mag" : "\u2014"],
    ["Size", fmtSize(m.size_am, (S.cfg && S.cfg.size_unit) || "arcmin")],
    ["Frame coverage", covTxt],
    ["Constellation", constName(m.constellation)],
    ["RA (J2000)", `<span class="mono">${d.meta.ra_hms}</span>`],
    ["Dec (J2000)", `<span class="mono">${d.meta.dec_dms}</span>`],
    ["Distance", m.distance || "\u2014"],
    ["Observable time", nObj && nObj.obs_pct != null
        ? `<b>${nObj.obs_pct}%</b> of astronomical night` : "\u2014"],
    ["Max altitude tonight", `${d.max_alt.toFixed(1)}\u00B0 at ${fmtHM(d.max_time)}`],
    ["Clear window", d.best ? durStr(d.times_iso[d.best[0]], d.times_iso[d.best[1]]) : "none"],
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
  const mins = Math.max(0, Math.round((parseUTC(bIso) - parseUTC(aIso)) / 60000));
  return `${Math.floor(mins/60)}h ${String(mins%60).padStart(2,"0")}m`;
}

export function bindDetail() {
  $("#dClose").addEventListener("click", () => {
    $("#detailModal").classList.add("hidden");
    DETAIL = null;
    revokeImgUrl();
  });
  // rig/filter/unit changes made elsewhere re-render the open modal
  document.addEventListener("detail:changed", () => {
    if (DETAIL && S.currentId) renderDetailMeta(S.meta[S.currentId], DETAIL);
  });
  $("#detailModal").addEventListener("mousedown", e => {
    if (e.target.id === "detailModal") {
      $("#detailModal").classList.add("hidden"); DETAIL = null; revokeImgUrl();
    }
  });
  $("#chkMoon").addEventListener("change", drawAltChart);
  window.addEventListener("resize", () => { if (DETAIL) drawAltChart(); });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      $("#detailModal").classList.add("hidden");
      $("#sitesModal").classList.add("hidden");
      DETAIL = null;
      revokeImgUrl();
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

  const css = getComputedStyle(document.documentElement);
  const C = {
    grid: "#232c41", dim:"#8b93a8",
    good: css.getPropertyValue("--good").trim(),
    bad:  css.getPropertyValue("--bad").trim(),
    warn: css.getPropertyValue("--warn").trim(),
  };

  // twilight shading outside dusk..dawn
  const duskXv = moonBandX(d.dusk, d, ML, pw), dawnXv = moonBandX(d.dawn, d, ML, pw);
  ctx.fillStyle = "rgba(90,130,255,0.07)";
  if (duskXv > ML) ctx.fillRect(ML, MT, duskXv-ML, ph);
  if (dawnXv < ML+pw) ctx.fillRect(dawnXv, MT, ML+pw-dawnXv, ph);

  // moon-up bands
  if ($("#chkMoon").checked && S.night) {
    ctx.fillStyle = "rgba(230,220,140,.10)";
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
    ctx.strokeStyle = a===0 ? "#39445f" : C.grid;
    ctx.beginPath(); ctx.moveTo(ML, Y(a)); ctx.lineTo(W-MR, Y(a)); ctx.stroke();
    ctx.fillStyle = a===0 ? C.dim : "#6b748c";
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
      ctx.fillStyle = "#6b748c";
      const lab = fmtT(dt);
      ctx.fillText(lab, x-14, H-10);
    }
  }

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
  ctx.fillStyle = "rgba(255,93,93,0.13)";
  ctx.fill();

  // ceiling dashed line
  ctx.setLineDash([5,4]);
  ctx.strokeStyle = "#98a2b8"; ctx.lineWidth = 1;
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
    ctx.fillStyle = "rgba(255,93,93,0.10)";
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
    ctx.setLineDash([6,4]);
    ctx.strokeStyle = "rgba(255,93,93,.55)"; ctx.lineWidth = 1;
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
  ctx.strokeStyle = "rgba(255,180,84,.55)";
  ctx.setLineDash([2,5]);
  ctx.beginPath(); ctx.moveTo(ML, Y(d.min_useful_alt)); ctx.lineTo(W-MR, Y(d.min_useful_alt)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,180,84,.8)";
  ctx.fillText(`min ${d.min_useful_alt}\u00B0`, W-MR-58, Y(d.min_useful_alt)-5);

  // moon track (clipped at the chart floor of -10 degrees)
  if ($("#chkMoon").checked && S.night) {
    ctx.strokeStyle = "rgba(230,220,140,.5)"; ctx.lineWidth = 1;
    ctx.beginPath();
    let pen = false;
    for (let i=0;i<nT;i++){
      const ma = moonAt(parseUTC(d.times_iso[i]));
      if (ma == null || ma < -10) { pen = false; continue; }
      pen ? ctx.lineTo(X(i), Y(ma)) : ctx.moveTo(X(i), Y(ma));
      pen = true;
    }
    ctx.stroke();
  }

  // altitude curve colored per segment
  const colorAt = i => {
    const a=d.alt[i];
    if (a<=0) return "#4a5468";
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

  // best window highlight
  if (d.best) {
    ctx.fillStyle = "rgba(53,208,127,.09)";
    ctx.fillRect(X(d.best[0]), MT, X(d.best[1])-X(d.best[0]), ph);
    ctx.fillStyle = C.good;
    ctx.beginPath(); ctx.arc(X(d.best[0]), Y(d.alt[d.best[0]]), 3.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(X(d.best[1]), Y(d.alt[d.best[1]]), 3.4, 0, 7); ctx.fill();
  }

  // max marker
  const mi = d.alt.indexOf(Math.max(...d.alt));
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(X(mi), Y(d.alt[mi]), 3.2, 0, 7); ctx.fill();
  ctx.font = "11px Consolas, monospace";
  ctx.fillText(`${d.max_alt.toFixed(0)}\u00B0`, X(mi)+6, Y(d.alt[mi])-6);

  // single hover crosshair drawn as part of this pass
  if (DETAIL_HOVER != null) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.4)";
    ctx.beginPath(); ctx.moveTo(X(DETAIL_HOVER), MT); ctx.lineTo(X(DETAIL_HOVER), MT+ph); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#fff";
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
}
