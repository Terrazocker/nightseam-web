/* Static sky map: whole-sky RA/Dec chart of the ingested image library.
   Unlike the planner's Sky View this chart never moves - objects sit at
   their catalog/header coordinates and dots scale with total integration. */

import { $, esc, TYPE_COLOR, TYPE_LABEL } from "./util.js";
import { S } from "./state.js";
import { CONSTELLATIONS, FIELD_STARS } from "./skydata.js";
import { vizTheme } from "./viztheme.js";

let SM_POINTS = [];
let SM_HOVER = null;
let SM_SELECTED = null;

/* RA hours 0..24 -> x, Dec -90..+90 -> y (0h left, north up) */
function xy(raH, decD, W, H) {
  return [raH / 24 * W, (1 - (decD + 90) / 180) * H];
}

/** DE-12: same rule as the Sky View legend - the chips are built once, so a
 *  toggle made in the other chart must be reflected here on every render. */
function syncTypeLegend() {
  const lg = $("#smLegend");
  if (!lg) return;
  const V = vizTheme();
  lg.querySelectorAll("[data-type]").forEach(chip => {
    chip.classList.toggle("off", S.disabledTypes.has(chip.dataset.type));
    chip.style.setProperty("--c", V.types[chip.dataset.type] || TYPE_COLOR[chip.dataset.type] || V.text);
  });
}

export function renderSkyMap() {
  syncTypeLegend();
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
  const V = vizTheme();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = V.canvas;
  ctx.fillRect(0, 0, W, H);

  const L = S.library;
  const objs = (L && L.objects) || [];
  if (SM_SELECTED) {
    SM_SELECTED = objs.find((object) => object.name === SM_SELECTED.name) || null;
  }
  renderSelection();
  const showCons = ($("#smCons") || {}).checked !== false;
  const showLabels = ($("#smLabels") || {}).checked !== false;
  const sizeByInteg = ($("#smSize") || {}).checked !== false;

  if (showCons) drawConstellations(ctx, W, H, V);

  // grid: RA hours + Dec every 15 deg
  ctx.strokeStyle = V.grid;
  ctx.lineWidth = 1;
  ctx.font = "10px Consolas, monospace";
  ctx.fillStyle = V.axis;
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
  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent").trim() || "#F9C85D";
  for (const o of objs) {
    if (o.ra_hours == null || o.dec_deg == null) continue;
    if (S.disabledTypes.has(o.otype)) continue;      // legend off
    const mins = o.total_exposure / 60;
    const r = sizeByInteg ? 3 + 9 * Math.sqrt(mins / maxMin) : 4.5;
    const col = V.types[o.otype] || TYPE_COLOR[o.otype] || V.text;
    const isHover = SM_HOVER && SM_HOVER.name === o.name;
    const isSelected = SM_SELECTED && SM_SELECTED.name === o.name;
    for (const wOff of [0, 1]) {            // wrap objects near RA 0h/24h
      const x = (o.ra_hours / 24 + wOff) * W;
      if (x < -20 || x > W + 20) continue;
      const y = (1 - (o.dec_deg + 90) / 180) * H;
      if (y < -20 || y > H + 20) continue;
      ctx.fillStyle = col;
      ctx.globalAlpha = isHover || isSelected ? 1 : 0.8;
      ctx.beginPath(); ctx.arc(x, y, isHover ? r + 2 : r, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isSelected ? accent : V.objectOutline;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.beginPath(); ctx.arc(x, y, isSelected ? r + 3 : r + 1.5, 0, 7); ctx.stroke();
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
      ctx.shadowColor = V.targetShadow;
      ctx.shadowBlur = V.labelBlur;
      ctx.fillStyle = V.targetLabel;
      ctx.fillText(text, tx, ty);
      ctx.restore();
    }
  }

  SM_POINTS = pts;
  const summary = $("#skymapChartSummary");
  if (summary) {
    summary.textContent = `Image library sky map; ${objs.length} library objects are plotted. Select a marker for its archive summary. Right ascension runs left to right and declination runs from south to north.`;
  }
}

function renderSelection() {
  const panel = $("#skymapSelection");
  if (!panel) return;
  if (!SM_SELECTED) {
    const hasObjects = (S.library?.objects || []).length > 0;
    panel.innerHTML = `<h2>Selected library object</h2><p class="hint">${hasObjects
      ? "Select a plotted object to see its archive summary."
      : "No mapped exposures yet. Import FITS files with object coordinates to populate this map."}</p>`;
    return;
  }
  const object = SM_SELECTED;
  const type = object.otype ? (TYPE_LABEL[object.otype] || object.otype) : "Unknown type";
  const ra = Number.isFinite(Number(object.ra_hours))
    ? `${Number(object.ra_hours).toFixed(2)}h` : "—";
  const dec = Number.isFinite(Number(object.dec_deg))
    ? `${Number(object.dec_deg).toFixed(2)}°` : "—";
  const sessions = Number(object.n_sessions) || 0;
  const images = Number(object.n_images) || 0;
  panel.innerHTML = `<h2>Selected library object</h2>
    <p class="library-map-name">${esc(object.name || "Unknown object")}</p>
    <p class="hint">${esc(object.designation || type)}${object.designation ? ` · ${esc(type)}` : ""}</p>
    <dl class="library-map-facts">
      <div><dt>Images</dt><dd>${images}</dd></div>
      <div><dt>Sessions</dt><dd>${sessions}</dd></div>
      <div><dt>Integration</dt><dd>${esc(fmtDurShort(object.total_exposure))}</dd></div>
      <div><dt>RA / Dec</dt><dd>${esc(ra)} · ${esc(dec)}</dd></div>
    </dl>`;
}

function fmtDurShort(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${sec}s`;
}

function drawConstellations(ctx, W, H, V) {
  ctx.save();
  ctx.fillStyle = V.fieldStar;
  for (const st of FIELD_STARS) {
    const [x, y] = xy(st[0], st[1], W, H);
    if (y < 0 || y > H) continue;
    ctx.beginPath(); ctx.arc(x, y, 1.05 * st[2], 0, 7); ctx.fill();
  }

  ctx.strokeStyle = V.constellation;
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

  ctx.fillStyle = V.constellationStar;
  for (const con of CONSTELLATIONS) {
    for (const [ra, de] of con.s) {
      const [x, y] = xy(ra, de, W, H);
      if (y < 0 || y > H) continue;
      ctx.beginPath(); ctx.arc(x, y, 1.4, 0, 7); ctx.fill();
    }
  }

  ctx.fillStyle = V.constellationLabel;
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
  // DE-11: value comparison - `best` is rebuilt on every render, so the identity
  // test was always true and this reallocated (width/height reassignment) a large
  // canvas on EVERY mousemove.
  const key = best ? best.name : null;
  const prev = SM_HOVER ? SM_HOVER.name : null;
  if (key !== prev) { SM_HOVER = best; renderSkyMap(); }
  const tip = $("#skymapTip");
  if (best) {
    const o = best.obj;
    const sess = o.n_sessions === 1 ? "1 session" : `${o.n_sessions} sessions`;
    tip.innerHTML =
      `<b>${esc(o.name)}</b>${o.designation ? ` <span style="color:#8b93a8">${esc(o.designation)}</span>` : ""}<br>` +
      `${esc(o.otype ? (TYPE_LABEL[o.otype] || "unknown") : "unknown")} \u00B7 ` +
      `${o.n_images} image${o.n_images === 1 ? "" : "s"} \u00B7 ` +
      `<b>${fmtDurShort(o.total_exposure)}</b> \u00B7 ${sess}` +
      (o.ra_hours != null ? `<br>RA ${o.ra_hours.toFixed(2)}h \u00B7 Dec ${o.dec_deg.toFixed(2)}\u00B0` : "");
    tip.classList.remove("hidden");
    // place next to the cursor, flipped when it would leave the window
    tip.style.left = (ev.clientX + 16) + "px";
    tip.style.top = (ev.clientY + 14) + "px";
    const r = tip.getBoundingClientRect();
    if (r.right > window.innerWidth - 6) tip.style.left = (ev.clientX - r.width - 12) + "px";
    if (r.bottom > window.innerHeight - 6) tip.style.top = (ev.clientY - r.height - 10) + "px";
  } else tip.classList.add("hidden");
}

export function bindSkyMap() {
  const cv = $("#skymapCanvas");
  cv.addEventListener("mousemove", onMove);
  cv.addEventListener("mouseleave", () => {
    SM_HOVER = null; $("#skymapTip").classList.add("hidden"); renderSkyMap();
  });
  cv.addEventListener("click", async (event) => {
    const rect = cv.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    let closest = null, distance = 225;
    for (const point of SM_POINTS) {
      const dx = point.x - x, dy = point.y - y, nextDistance = dx * dx + dy * dy;
      if (nextDistance < distance) { distance = nextDistance; closest = point; }
    }
    if (!closest) return;
    SM_HOVER = closest;
    if (document.body.classList.contains("catalog-only")) {
      SM_SELECTED = closest.obj;
      renderSkyMap();
      return;
    }
    const object = closest.obj;
    if (object.object_id && S.meta && S.meta[object.object_id]) {
      const { openDetail } = await import("./detail.js");
      openDetail(object.object_id, { opener: cv });
    } else {
      SM_SELECTED = object;
      renderSkyMap();
    }
  });
  for (const id of ["smLabels", "smSize", "smCons"]) {
    $(`#${id}`).addEventListener("change", renderSkyMap);
  }

  // object-type color legend (click a chip to grey that type out)
  const lg = $("#smLegend");
  if (lg) {
    // the chips are click-only in the markup: give them a keyboard path
    lg.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const chip = e.target.closest("[data-type]");
      if (!chip) return;
      e.preventDefault();
      chip.click();
    });
    const V = vizTheme();
    lg.innerHTML = Object.keys(TYPE_COLOR).map(t =>
      `<div class="lgchip${S.disabledTypes.has(t) ? " off" : ""}" data-type="${t}" role="button" tabindex="0" style="--c:${V.types[t] || TYPE_COLOR[t]}"><i></i>${TYPE_LABEL[t] || t}</div>`
    ).join("");
    lg.addEventListener("click", e => {
      const chip = e.target.closest("[data-type]");
      if (!chip) return;
      const t = chip.dataset.type;
      S.disabledTypes.has(t) ? S.disabledTypes.delete(t) : S.disabledTypes.add(t);
      chip.classList.toggle("off", S.disabledTypes.has(t));
      SM_HOVER = null;
      renderSkyMap();
    });
  }
}
