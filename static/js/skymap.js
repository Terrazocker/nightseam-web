/* Static sky map: whole-sky RA/Dec chart of the ingested image library.
   Unlike the planner's Sky View this chart never moves - objects sit at
   their catalog/header coordinates and dots scale with total integration. */

import { $, esc, TYPE_COLOR, TYPE_LABEL } from "./util.js";
import { S } from "./state.js";
import { CONSTELLATIONS, FIELD_STARS } from "./skydata.js";
import { openDetail } from "./detail.js";

let SM_POINTS = [];
let SM_HOVER = null;

/* RA hours 0..24 -> x, Dec -90..+90 -> y (0h left, north up) */
function xy(raH, decD, W, H) {
  return [raH / 24 * W, (1 - (decD + 90) / 180) * H];
}

export function renderSkyMap() {
  const cv = $("#skymapCanvas");
  if (!cv || !cv.clientWidth) return;
  // fit the 2:1 chart into the viewport: never taller than the window
  // minus top bar / tabs / padding, never wider than its container
  const availH = window.innerHeight - 120;
  const availW = cv.parentElement.clientWidth;
  const H = Math.max(240, Math.min(availH, Math.floor(availW / 2)));
  cv.style.width = (H * 2) + "px";
  cv.style.height = H + "px";
  const dpr = window.devicePixelRatio || 1;
  const W = H * 2;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0a0d15";
  ctx.fillRect(0, 0, W, H);

  const L = S.library;
  const objs = (L && L.objects) || [];
  const showCons = ($("#smCons") || {}).checked !== false;
  const showLabels = ($("#smLabels") || {}).checked !== false;
  const sizeByInteg = ($("#smSize") || {}).checked !== false;

  if (showCons) drawConstellations(ctx, W, H);

  // grid: RA hours + Dec every 15 deg
  ctx.strokeStyle = "#1b2232";
  ctx.lineWidth = 1;
  ctx.font = "10px Consolas, monospace";
  ctx.fillStyle = "#4d5870";
  for (let h = 0; h < 24; h++) {
    const x = h / 24 * W;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    if (h % 2 === 0) ctx.fillText(`${String(h).padStart(2, "0")}h`, x + 3, 12);
  }
  for (let d = -75; d <= 75; d += 15) {
    const y = (1 - (d + 90) / 180) * H;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.fillText(`${d > 0 ? "+" : ""}${d}\u00B0`, W - 34, y - 3);
  }

  // library objects
  const maxMin = Math.max(1, ...objs.map(o => o.total_exposure / 60));
  const pts = [];
  for (const o of objs) {
    if (o.ra_hours == null || o.dec_deg == null) continue;
    const mins = o.total_exposure / 60;
    const r = sizeByInteg ? 3 + 9 * Math.sqrt(mins / maxMin) : 4.5;
    const col = TYPE_COLOR[o.otype] || "#ffd166";
    const isHover = SM_HOVER && SM_HOVER.name === o.name;
    for (const wOff of [0, 1]) {            // wrap objects near RA 0h/24h
      const x = (o.ra_hours / 24 + wOff) * W;
      if (x < -20 || x > W + 20) continue;
      const y = (1 - (o.dec_deg + 90) / 180) * H;
      if (y < -20 || y > H + 20) continue;
      ctx.fillStyle = col;
      ctx.globalAlpha = isHover ? 1 : 0.8;
      ctx.beginPath(); ctx.arc(x, y, isHover ? r + 2 : r, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(0,0,0,.5)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, 7); ctx.stroke();
      pts.push({ x, y, name: o.name, obj: o });
    }
  }

  // labels, greedily placed
  if (showLabels) {
    ctx.font = "bold 11px Segoe UI";
    const placed = [];
    for (const p of pts) {
      if (p.x < 10 || p.x > W - 10) continue;
      const tx = Math.round(p.x) + 8, ty = Math.round(p.y) - 8;
      const text = `${p.obj.name} \u00B7 ${fmtDurShort(p.obj.total_exposure)}`;
      const w = ctx.measureText(text).width + 8, h = 14;
      let ok = true;
      for (const q of placed) {
        if (Math.abs(tx + w / 2 - q.x) < (w + q.w) / 2 &&
            Math.abs(ty - q.y) < h) { ok = false; break; }
      }
      if (!ok) continue;
      placed.push({ x: tx + w / 2, y: ty, w });
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.9)";
      ctx.shadowBlur = 4;
      ctx.fillStyle = "#e9edf6";
      ctx.fillText(text, tx, ty);
      ctx.restore();
    }
  }

  SM_POINTS = pts;
}

function fmtDurShort(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${sec}s`;
}

function drawConstellations(ctx, W, H) {
  ctx.save();
  ctx.fillStyle = "rgba(165,175,200,.35)";
  for (const st of FIELD_STARS) {
    const [x, y] = xy(st[0], st[1], W, H);
    if (y < 0 || y > H) continue;
    ctx.beginPath(); ctx.arc(x, y, 1.05 * st[2], 0, 7); ctx.fill();
  }

  ctx.strokeStyle = "rgba(150,160,185,.30)";
  ctx.lineWidth = 1;
  for (const con of CONSTELLATIONS) {
    if (!con.g.length) continue;
    const pts = con.s.map(([ra, de]) => xy(ra, de, W, H));
    ctx.beginPath();
    for (const [i0, i1] of con.g) {
      const [x0, y0] = pts[i0], [x1, y1] = pts[i1];
      if (Math.abs(x1 - x0) > W / 2) {       // line crosses the RA wrap seam
        ctx.moveTo(x0, y0); ctx.lineTo(x1 + (x0 < x1 ? -W : W), y1);
        ctx.moveTo(x0 + (x0 < x1 ? W : -W), y0); ctx.lineTo(x1, y1);
      } else {
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      }
    }
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(185,194,220,.50)";
  for (const con of CONSTELLATIONS) {
    for (const [ra, de] of con.s) {
      const [x, y] = xy(ra, de, W, H);
      if (y < 0 || y > H) continue;
      ctx.beginPath(); ctx.arc(x, y, 1.4, 0, 7); ctx.fill();
    }
  }

  ctx.fillStyle = "rgba(139,147,168,.62)";
  ctx.font = "10px Segoe UI";
  ctx.textAlign = "center";
  for (const con of CONSTELLATIONS) {
    if (!con.t.length) continue;
    const [x, y] = xy(con.t[0], con.t[1], W, H);
    if (y < 0 || y > H) continue;
    ctx.fillText(con.n, x, y);
  }
  ctx.textAlign = "left";
  ctx.restore();
}

/* ---------------- hover / click ---------------- */

function onMove(ev) {
  const cv = $("#skymapCanvas");
  const rect = cv.getBoundingClientRect();
  const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
  let best = null, bd = 225;
  for (const p of SM_POINTS) {
    const dx = p.x - mx, dy = p.y - my, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = p; }
  }
  if (best !== SM_HOVER) { SM_HOVER = best; renderSkyMap(); }
  const tip = $("#skymapTip");
  if (best) {
    const o = best.obj;
    const sess = o.n_sessions === 1 ? "1 session" : `${o.n_sessions} sessions`;
    tip.innerHTML =
      `<b>${esc(o.name)}</b>${o.designation ? ` <span style="color:#8b93a8">${esc(o.designation)}</span>` : ""}<br>` +
      `${esc(o.otype ? TYPE_LABEL[o.otype] : "unknown")} \u00B7 ` +
      `${o.n_images} image${o.n_images === 1 ? "" : "s"} \u00B7 ` +
      `<b>${fmtDurShort(o.total_exposure)}</b> \u00B7 ${sess}` +
      (o.ra_hours != null ? `<br>RA ${o.ra_hours.toFixed(2)}h \u00B7 Dec ${o.dec_deg.toFixed(2)}\u00B0` : "");
    tip.classList.remove("hidden");
    tip.style.left = (rect.left + best.x + 14) + "px";
    tip.style.top = (rect.top + best.y + 10) + "px";
  } else tip.classList.add("hidden");
}

export function bindSkyMap() {
  const cv = $("#skymapCanvas");
  cv.addEventListener("mousemove", onMove);
  cv.addEventListener("mouseleave", () => {
    SM_HOVER = null; $("#skymapTip").classList.add("hidden"); renderSkyMap();
  });
  cv.addEventListener("click", () => {
    if (!SM_HOVER) return;
    const o = SM_HOVER.obj;
    if (o.object_id && S.meta && S.meta[o.object_id]) openDetail(o.object_id);
  });
  for (const id of ["smLabels", "smSize", "smCons"]) {
    $(`#${id}`).addEventListener("change", renderSkyMap);
  }

  // object-type color legend
  const lg = $("#smLegend");
  if (lg) {
    lg.innerHTML = Object.keys(TYPE_COLOR).map(t =>
      `<div class="lgchip" style="--c:${TYPE_COLOR[t]}"><i></i>${TYPE_LABEL[t] || t}</div>`
    ).join("");
  }
}