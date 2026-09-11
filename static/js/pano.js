"use strict";

/* ================= panorama import / calibration / masking ================= */

import { $, clamp, esc, api, toast, num } from "./util.js";
import { S } from "./state.js";
import { loadNight } from "./night.js";

const NBIN = 720;

export const Pano = {
  cur: null,        // active record being edited
  img: null,        // HTMLImageElement
  maskCv: null,     // offscreen mask canvas
  painting: false,
  cropping: false,
  crop: null,       // side-band selection in canvas px
  tool: "b",
  saveTimer: null,
  undo: [],         // stroke snapshots for undo
  loupeOn: true,
  lastPos: null,    // last pointer position over canvas (css px)
};

window.Pano = Pano;

Pano.init = function () {
  $("#btnUploadPano").addEventListener("click", () => $("#panoFile").click());
  $("#panoFile").addEventListener("change", e => { uploadFile(e.target.files[0]); e.target.value=""; });
  // the mode buttons only exist in current index.html; a stale cached page
  // without them must not kill init (import would then fail silently)
  const mb = $("#modeObstacle"), ms = $("#modeSky");
  if (mb && ms) {
    mb.addEventListener("click", () => setPaintMode("obstacle"));
    ms.addEventListener("click", () => setPaintMode("sky"));
  }
  $("#toolBrush").addEventListener("click", () => setTool("b"));
  $("#toolErase").addEventListener("click", () => setTool("e"));
  $("#toolCrop").addEventListener("click", () => setTool("crop"));
  $("#btnCropCancel").addEventListener("click", () => cancelCrop());
  $("#btnCropApply").addEventListener("click", () => applyCrop());
  $("#btnClearMask").addEventListener("click", clearMask);
  $("#btnUndo").addEventListener("click", undoPaint);
  $("#chkLoupe").addEventListener("change", e => { Pano.loupeOn = e.target.checked; render(); });
  // "block above band": opt OUT of the default open-above assumption
  const ba = $("#chkBlockAbove");
  if (ba) ba.addEventListener("change", e => {
    if (!Pano.cur) return;
    Pano.cur.block_above = !!e.target.checked;
    render();
    scheduleSave(0);
  });
  $("#btnCalN").addEventListener("click", () => {
    if (!Pano.cur) return;
    Pano.calibrating = true;
    $("#calNHint").classList.remove("hidden");
    setTool("none");
    render();
  });
  $("#btnSaveProfile").addEventListener("click", () => { recomputeProfile(); scheduleSave(0); });
  $("#btnSetActive").addEventListener("click", activateCurrent);
  $("#btnDelPano").addEventListener("click", deleteCurrent);

  for (const [id, valId] of [
      ["azOffset","azOffVal"], ["altBottom","abVal"],
      ["altTop","atVal"], ["fovAz","fovVal"]]) {
    $(`#${id}`).addEventListener("input", e => {
      $(`#${valId}`).textContent = e.target.value + "\u00B0";
      if (id === "azOffset" || id === "fovAz") invalidateMask();  // grid only
      render(); scheduleSave();
    });
  }

  const cv = $("#panoCanvas");
  cv.addEventListener("pointerdown", e => {
    if (!Pano.img || !Pano.img.complete) return;
    if (Pano.calibrating) { calibrateAt(e); return; }
    cv.setPointerCapture(e.pointerId);
    if (Pano.tool === "crop") {
      pushUndo();
      Pano.crop = { x0: evX(e), x1: evX(e) };   // side band, full height
      Pano.cropping = true;
    } else {
      pushUndo();
      Pano.painting = true;
      dab(e); render();
    }
  });
  let _loupeRaf = null;
  cv.addEventListener("pointermove", e => {
    Pano.lastPos = { x: evX(e), y: evY(e) };
    if (Pano.cropping) {
      Pano.crop.x1 = evX(e); render();
    } else if (Pano.painting) {
      dab(e); render();
    } else if (Pano.loupeOn && (Pano.tool === "b" || Pano.tool === "e")) {
      if (!_loupeRaf) _loupeRaf = requestAnimationFrame(() => {
        _loupeRaf = null;
        updateLoupe();
      });
    }
  });
  cv.addEventListener("pointerleave", () => {
    Pano.lastPos = null;
    const lcv = $("#loupeCv");
    if (lcv) lcv.classList.add("hidden");
  });
  window.addEventListener("pointerup", () => {
    if (Pano.painting) { Pano.painting = false; scheduleSave(); }
    if (Pano.cropping) {
      Pano.cropping = false;
      const c = normCrop();
      if (!c || c.w < 4) Pano.crop = null;
      render();
    }
  });
  document.addEventListener("keydown", e => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
    // tab panes are toggled with .active, never with .hidden
    if (!$("#tab-horizon").classList.contains("active")) return;
    const t = e.target;
    const tag = ((t && t.tagName) || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" ||
        (t && t.isContentEditable)) return;      // keep native text undo
    undoPaint();
    e.preventDefault();
  });

  if (S.panos.length) select(S.panos.find(p=>p.active) || S.panos[0]);
};

/* ---------------- paint mode (obstacle | sky) ---------------- */

function paintMode() {
  return (Pano.cur && Pano.cur.paint_mode === "sky") ? "sky" : "obstacle";
}

function updateModeButtons() {
  const m = paintMode();
  const b = $("#modeObstacle"), s = $("#modeSky");
  if (b) b.classList.toggle("active", m === "obstacle");
  if (s) s.classList.toggle("active", m === "sky");
}

function setPaintMode(m) {
  if (!Pano.cur || paintMode() === m) return;
  Pano.cur.paint_mode = m;
  Pano.cur.profile = [];
  Pano.cur.profile_top = [];
  invalidateMask();
  updateModeButtons();
  recomputeProfile();
  scheduleSave(0);
}

/* ---------------- undo ---------------- */

function pushUndo() {
  if (!Pano.cur) return;
  Pano.undo.push(JSON.stringify(Pano.cur.strokes));
  if (Pano.undo.length > 60) Pano.undo.shift();
}

function undoPaint() {
  if (!Pano.cur || !Pano.undo.length) return;
  Pano.cur.strokes = JSON.parse(Pano.undo.pop());
  Pano.cur.profile = [];
  Pano.cur.profile_top = [];
  invalidateMask();
  render();
  scheduleSave();
}

/* ---------------- landmark calibration ---------------- */

function calibrateAt(e) {
  const rect = $("#panoCanvas").getBoundingClientRect();
  const frac = clamp((e.clientX - rect.left) / rect.width, 0, 1);
  const azOff = +$("#azOffset").value || 0;
  const fov = +$("#fovAz").value || 360;
  const clickedAz = (azOff + frac * fov) % 360;
  const bearing = prompt(
    "Compass bearing of this point, in degrees (N=0, E=90, S=180, W=270):",
    clickedAz.toFixed(1));
  if (bearing != null) {
    const b = num(bearing);
    if (!isNaN(b)) {
      const newOff = (((b - frac * fov) % 360) + 360) % 360;
      $("#azOffset").value = newOff.toFixed(1);
      $("#azOffVal").textContent = newOff.toFixed(1) + "\u00B0";
      invalidateMask();          // calibration moved -> grid + line shift
      recomputeProfile();        // profile bins follow the new offset
      scheduleSave(0);
    }
  }
  Pano.calibrating = false;
  $("#calNHint").classList.add("hidden");
  setTool("b");
}

function evX(e) {
  const r = $("#panoCanvas").getBoundingClientRect();
  return clamp(e.clientX - r.left, 0, r.width);
}
function evY(e) {
  const r = $("#panoCanvas").getBoundingClientRect();
  return clamp(e.clientY - r.top, 0, r.height);
}

/* selected side-crop band in canvas pixels: full height between two cuts */
function normCrop() {
  if (!Pano.crop) return null;
  const x0 = Math.min(Pano.crop.x0, Pano.crop.x1);
  const x1 = Math.max(Pano.crop.x0, Pano.crop.x1);
  return { x: x0, w: x1 - x0 };
}

Pano.onShow = function () { renderList(); render(); };
Pano.render = render;   // exposed for the global resize handler

Pano.refreshOverlay = function () { /* night reloads don't alter editor */ };

/* ---------------- data plumbing ---------------- */

async function refreshPanos() {
  S.panos = await api("/api/panoramas");
  renderList();
}

async function uploadFile(file) {
  if (!file) return;
  const fd = new FormData();
  fd.append("file", file);
  try {
    const res = await api("/api/panorama", { method: "POST", body: fd });
    await refreshPanos();
    const rec = S.panos.find(p => p.id === res.id);
    if (rec) await select(rec);
  } catch (err) {
    console.error("pano import failed:", err);
    alert(err.message);
  }
}

function renderList() {
  const box = $("#panoList");
  if (!S.panos.length) { box.innerHTML = '<p class="hint">No panoramas yet.</p>'; return; }
  box.innerHTML = S.panos.map(p => `
    <div class="pano-item ${p.active ? "active" : ""}" data-id="${p.id}">
      <span class="nm">${esc(p.name)}</span>
      ${p.profile && p.profile.length ? '<small class="hint">saved</small>' : '<small class="hint">draft</small>'}
      <button data-sel="${p.id}" class="ghost">Edit</button>
    </div>`).join("");
  box.querySelectorAll("[data-sel]").forEach(b =>
    b.addEventListener("click", () =>
      select(S.panos.find(p => p.id === b.dataset.sel))));
}

async function select(rec) {
  Pano.cur = rec;
  Pano.crop = null;
  // a pending auto-save belongs to the PREVIOUS panorama (its scheduleSave
  // captured Pano.cur); cancel it so a delayed save cannot write the old
  // strokes/profile into the record we are switching to
  if (Pano.saveTimer) { clearTimeout(Pano.saveTimer); Pano.saveTimer = null; }
  // undo history belongs to ONE panorama: without this, undoing after a switch
  // wrote the previous panorama's strokes into this one and auto-saved them
  Pano.undo = [];
  updateModeButtons();
  $("#calibBox").classList.remove("hidden");
  $("#azOffset").value = rec.az_offset ?? 0;
  $("#altBottom").value = rec.alt_bottom ?? 0;
  $("#altTop").value = rec.alt_top ?? 45;
  $("#fovAz").value = rec.fov ?? 360;
  $("#azOffVal").textContent = ($("#azOffset").value) + "\u00B0";
  $("#abVal").textContent = ($("#altBottom").value) + "\u00B0";
  $("#atVal").textContent = ($("#altTop").value) + "\u00B0";
  $("#fovVal").textContent = ($("#fovAz").value) + "\u00B0";
  const ba = $("#chkBlockAbove");
  if (ba) ba.checked = !!rec.block_above;
  Pano.img = new Image();
  Pano.img.onload = () => { $("#panoError").classList.add("hidden"); render(); };
  Pano.img.onerror = () => {
    $("#panoError").textContent =
      "Panorama image file is missing on disk - please re-import it.";
    $("#panoError").classList.remove("hidden");
    render();
  };
  // timestamp busts the browser cache after crops replaced the file
  Pano.img.src = `/api/panorama/${rec.id}/image?v=${Date.now()}`;
  renderList();
}

async function activateCurrent() {
  if (!Pano.cur) return;
  await api("/api/settings", { method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ active_pano_id: Pano.cur.id })});
  await refreshPanos();
  await loadNight();
}

async function deleteCurrent() {
  if (!Pano.cur || !confirm(`Delete "${Pano.cur.name}"?`)) return;
  await api("/api/panorama/" + Pano.cur.id, { method: "DELETE" });
  Pano.cur = null; Pano.img = null;
  $("#panoCanvas").getContext("2d").clearRect(0,0,9999,9999);
  $("#calibBox").classList.add("hidden");
  $("#panoEmpty").classList.remove("hidden");
  await refreshPanos();
  await loadNight();
}

/* ---------------- painting ---------------- */

function setTool(t) {
  Pano.tool = t;
  $("#toolBrush").classList.toggle("active", t === "b");
  $("#toolErase").classList.toggle("active", t === "e");
  $("#toolCrop").classList.toggle("active", t === "crop");
  const cropUI = t === "crop";
  $("#btnCropApply").classList.toggle("hidden", !cropUI);
  $("#btnCropCancel").classList.toggle("hidden", !cropUI);
  $("#cropHint").classList.toggle("hidden", !cropUI);
  if (!cropUI) { Pano.crop = null; render(); }
}

/* ---------------- cropping ---------------- */

function cancelCrop() { setTool("b"); }

async function applyCrop() {
  const c = normCrop();
  const W = cvW(), H = cvH();
  if (!c || c.w < 4 || !Pano.img || !Pano.img.complete) return;
  // full-height side band: keep everything outside [c.x, c.x+c.w]
  const keepL = Math.round(c.x / W * Pano.img.naturalWidth);
  const keepR = Math.round((W - (c.x + c.w)) / W * Pano.img.naturalWidth);
  let sx = keepL, sw = Pano.img.naturalWidth - keepL - keepR;
  if (sw < 16) return alert("Selection removes too much of the image.");

  // cap output width: phone panoramas are often 10k+ px wide
  const MAXW = 4096;
  let outW = sw, outH = Pano.img.naturalHeight;
  if (outW > MAXW) {
    outH = Math.max(1, Math.round(outH * MAXW / outW));
    outW = MAXW;
  }
  const cv = document.createElement("canvas");
  cv.width = outW; cv.height = outH;
  cv.getContext("2d").drawImage(Pano.img,
      sx, 0, sw, Pano.img.naturalHeight,
      0, 0, outW, outH);
  const blob = await new Promise(res => cv.toBlob(res, "image/png"));
  if (!blob) return alert("Cropping failed");

  // recalibrate: removed degrees shift the left-edge azimuth / shrink FOV
  const fovOld = +$("#fovAz").value || 360;
  const azOffOld = +$("#azOffset").value || 0;
  const cutLeftDeg = c.x / W * fovOld;
  const fovNew = Math.round(fovOld * (1 - c.w / W));
  const azNew = ((azOffOld + cutLeftDeg) % 360 + 360) % 360;

  const fd = new FormData();
  fd.append("file", blob, `${Pano.cur.id}.png`);
  fd.append("az_offset", azNew.toFixed(2));
  fd.append("fov", String(Math.max(45, fovNew)));
  try {
    await api(`/api/panorama/${Pano.cur.id}/image`, { method: "POST", body: fd });
    await refreshPanos();
    const upd = S.panos.find(p => p.id === Pano.cur.id);
    if (upd) select(upd);
    setTool("b");
  } catch (err) { alert(err.message); }
}

function cvW() { return $("#panoCanvas").clientWidth; }
function cvH() { return $("#panoCanvas").clientHeight; }

function dab(ev) {
  const rect = $("#panoCanvas").getBoundingClientRect();
  const nx = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
  const ny = clamp((ev.clientY - rect.top) / rect.height, 0, 1);
  const r = (+$("#brushSize").value) / 2 / rect.width;
  Pano.cur.strokes.push({ m: Pano.tool, x: nx, y: ny, r });
  invalidateMask();
}

function clearMask() {
  if (!Pano.cur) return;
  Pano.cur.strokes = [];
  Pano.cur.profile = [];
  Pano.cur.profile_top = [];
  invalidateMask();
  render();
  scheduleSave();
}

/* ---------------- rendering ---------------- */

function invalidateMask() { Pano.maskCv = null; }

/* stamp one stroke as filled circles; when the panorama covers a full
   circle, dabs touching an edge are duplicated on the opposite edge so the
   mask stays continuous across the azimuth seam */
function stampDab(ctx, s, W, H, wraps) {
  const r = Math.max(2, s.r * W);
  const cx0 = s.x * W;
  const xs = [cx0];
  if (wraps) {
    if (cx0 - r < 0) xs.push(cx0 + W);
    if (cx0 + r > W) xs.push(cx0 - W);
  }
  for (const cx of xs) {
    ctx.beginPath();
    ctx.arc(cx, s.y * H, r, 0, 7);
    ctx.fill();
  }
}

function buildMask(W, H) {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = paintMode() === "sky" ? "#4fd97a" : "#ff5d5d";
  const wraps = (+$("#fovAz").value || 360) >= 359.5;
  for (const s of Pano.cur.strokes) {
    ctx.globalCompositeOperation = s.m === "e" ? "destination-out" : "source-over";
    stampDab(ctx, s, W, H, wraps);
  }
  return cv;
}

function render() {
  const cv = $("#panoCanvas");
  const stage = $("#panoStage");
  if (!Pano.cur || !Pano.img || !Pano.img.complete) {
    $("#panoEmpty").classList.toggle("hidden", !!Pano.cur);
    return;
  }
  $("#panoEmpty").classList.add("hidden");

  const W = stage.clientWidth - 2;
  const ih = Pano.img.naturalHeight / Pano.img.naturalWidth;
  const H = Math.round(clamp(W * ih, 200, innerHeight * 0.72));
  const dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.height = H + "px";

  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(Pano.img, 0, 0, W, H);

  // mask layer
  if (!Pano.maskCv || Pano.maskCv.width !== W || Pano.maskCv.height !== H)
    Pano.maskCv = buildMask(W, H);
  ctx.drawImage(Pano.maskCv, 0, 0);

  drawCalibGrid(ctx, W, H);
  drawProfileLine(ctx, W, H);

  // crop overlay: dim the side bands marked for removal
  const c = normCrop();
  if (c && Pano.tool === "crop") {
    ctx.fillStyle = "rgba(5,7,12,.6)";
    ctx.fillRect(0, 0, c.x, H);
    ctx.fillRect(c.x + c.w, 0, W - c.x - c.w, H);
    ctx.strokeStyle = "#4f9cff";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    for (const lx of [c.x, c.x + c.w]) {
      ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, H); ctx.stroke();
    }
    ctx.setLineDash([]);
    const fov = +$("#fovAz").value || 360;
    const azOff = +$("#azOffset").value || 0;
    ctx.fillStyle = "#9cc4ff";
    ctx.font = "11px Consolas, monospace";
    const lTrim = (c.x / W * fov).toFixed(1);
    const rTrim = ((W - c.x - c.w) / W * fov).toFixed(1);
    ctx.fillText(`-\u00A0${lTrim}\u00B0`, 6, 18);
    ctx.fillText(`-\u00A0${rTrim}\u00B0`, W - 74, 18);
    ctx.fillText(`FOV \u2192 ${(fov - lTrim - rTrim).toFixed(0)}\u00B0`, c.x + 8, 18);
  }
}

/* magnifier overlay: samples the composite panorama canvas, works on hover
   AND while painting */
function updateLoupe() {
  const lcv = $("#loupeCv");
  const cv = $("#panoCanvas");
  if (!lcv || !cv || !Pano.img || !Pano.img.complete) return;
  const p = Pano.lastPos;
  if (!p) { lcv.classList.add("hidden"); return; }
  const dpr = window.devicePixelRatio || 1;
  const R = 66, Z = 3;
  const sw = 2 * R / Z * dpr;
  const sx = clamp(p.x * dpr - sw / 2, 0, Math.max(0, cv.width - sw));
  const sy = clamp(p.y * dpr - sw / 2, 0, Math.max(0, cv.height - sw));
  lcv.classList.remove("hidden");
  const ctx = lcv.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, lcv.width, lcv.height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, lcv.width, lcv.height);
  ctx.imageSmoothingEnabled = false;
  try { ctx.drawImage(cv, sx, sy, sw, sw, 0, 0, lcv.width, lcv.height); } catch (_) {}
  const ix = (p.x * dpr - sx) / Z;
  const iy = (p.y * dpr - sy) / Z;
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(ix, iy, 4, 0, 7); ctx.stroke();
}

function drawCalibGrid(ctx, W, H) {
  const azOff = +$("#azOffset").value;
  const ab = +$("#altBottom").value, at = +$("#altTop").value;
  const fov = +$("#fovAz").value || 360;

  // elevation lines
  ctx.strokeStyle = "rgba(120,160,255,.28)";
  ctx.fillStyle = "rgba(150,185,255,.8)";
  ctx.font = "10px Consolas, monospace";
  ctx.lineWidth = 1;
  for (let e = Math.ceil(ab / 15) * 15; e <= at; e += 15) {
    const y = H * (1 - (e - ab) / (at - ab));
    if (y < 8 || y > H - 4) continue;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.fillText(e + "\u00B0", 4, y - 3);
  }

  // compass ticks: azimuth runs azOff .. azOff+fov across the width
  const CARD = { 0: "N", 90: "E", 180: "S", 270: "W" };
  const firstTick = Math.ceil(azOff / 30) * 30;
  for (let a = firstTick; a <= azOff + fov; a += 30) {
    const x = (a - azOff) / fov * W;
    if (x < -1 || x > W + 1) continue;
    const cardA = ((a % 360) + 360) % 360;
    const major = cardA % 90 === 0 && fov >= 90 ? true : false;
    ctx.strokeStyle = major ? "rgba(255,209,102,.75)" : "rgba(255,209,102,.35)";
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, major ? 16 : 8); ctx.stroke();
    if (major && CARD[cardA] !== undefined) {
      ctx.fillStyle = "#ffd166";
      ctx.font = "bold 12px Segoe UI";
      ctx.fillText(CARD[cardA], x + 3, 14);
    }
  }
}

/* contiguous visible segments of one profile (seam jumps lift the pen).
   skipAbove hides bins at or above a ceiling value - used for the top edge
   of sky-mode bands, where no-ceiling columns carry the 90.5 sentinel. */
export function profileSegments(prof, W, H, ab, at, azOff, fov, skipAbove = 90.5) {
  const segments = [];
  let seg = null;
  let prevX = null;
  for (let i = 0; i < NBIN; i++) {
    const e = prof[i];
    // bin i covers azimuth azOff + i*0.5deg -> its pixel position depends
    // on the current calibration; outside the FOV there is nothing to draw
    const rel = (((i * 0.5 - azOff) % 360) + 360) % 360;
    if (rel > fov || e <= ab - 5 || e >= skipAbove) {
      seg = null; prevX = null; continue;
    }
    const x = rel / fov * W;
    // azimuth seam: consecutive bins can jump from the right edge back to
    // the left edge - lift the pen instead of drawing across the image
    if (seg && prevX != null && x < prevX - W * 0.5) seg = null;
    const y = H * (1 - (clamp(e, ab, at) - ab) / (at - ab));
    if (!seg) { seg = []; segments.push(seg); }
    seg.push([x, y]);
    prevX = x;
  }
  return segments;
}

function strokeSegments(ctx, segments) {
  ctx.beginPath();
  for (const s of segments) {
    s.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  }
  ctx.stroke();
}

function drawProfileLine(ctx, W, H) {
  const prof = Pano.cur.profile;
  if (!prof || prof.length !== NBIN) return;
  const ab = +$("#altBottom").value, at = +$("#altTop").value;
  const azOff = +$("#azOffset").value || 0;
  const fov = +$("#fovAz").value || 360;
  const segs = profileSegments(prof, W, H, ab, at, azOff, fov);
  const sky = paintMode() === "sky";
  const blockAbove = sky && !!Pano.cur.block_above;
  const tops = (Pano.cur.profile_top && Pano.cur.profile_top.length === NBIN)
      ? Pano.cur.profile_top : null;
  // the band top is a real ceiling ONLY with "block above band"; by default
  // everything above the band is free sky (open above)
  const topSegs = blockAbove && tops
      ? profileSegments(tops, W, H, ab, at, azOff, fov, 88)
      : null;

  // blocked regions: below the obstruction line (and in sky mode also
  // above the painted band's top edge when block-above is on)
  ctx.fillStyle = "rgba(255,93,93,.14)";
  for (const s of segs) {
    ctx.beginPath();
    ctx.moveTo(s[0][0], H);
    s.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(s[s.length - 1][0], H);
    ctx.closePath();
    ctx.fill();
  }
  // sky mode, default open above: hatch the region ABOVE the painted band (it
  // is only visible because of the open-above assumption)
  if (sky && !blockAbove && tops) {
    for (const s of profileSegments(tops, W, H, ab, at, azOff, fov, 88)) {
      const xs = s.map(([x]) => x);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      ctx.save();
      ctx.beginPath();
      s.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.lineTo(maxX, 0);
      ctx.lineTo(minX, 0);
      ctx.closePath();
      ctx.clip();
      ctx.strokeStyle = "rgba(210,225,255,.28)";
      ctx.lineWidth = 1;
      const diag = (maxX - minX) + H;
      for (let o = -diag; o < diag; o += 9) {
        ctx.beginPath();
        ctx.moveTo(minX + o, H);
        ctx.lineTo(minX + o + diag, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  if (topSegs) {
    for (const s of topSegs) {
      ctx.beginPath();
      ctx.moveTo(s[0][0], 0);
      s.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(s[s.length - 1][0], 0);
      ctx.closePath();
      ctx.fill();
    }
  }

  // solid obstruction line: obstacle mode only. In sky mode the fully
  // blocked columns sit at 90 deg (top of the image) and would draw a
  // spurious line along the edge with radial connectors.
  if (paintMode() === "obstacle") {
    ctx.strokeStyle = "#ff5d5d";
    ctx.lineWidth = 2;
    strokeSegments(ctx, segs);
  }
  if (topSegs) {
    ctx.setLineDash([6, 4]);
    strokeSegments(ctx, topSegs);
    ctx.setLineDash([]);
  }
}

/* ---------------- obstruction profile from mask ---------------- */

function recomputeProfile() {
  if (!Pano.cur) return;
  const sky = paintMode() === "sky";
  // Invariant (mirrors web/horizon.js::computeProfile): strokes win when
  // present; with NO strokes the stored profile is authoritative. Deriving an
  // empty profile from an empty mask would silently remove a horizon we cannot
  // re-derive, so a stroke-less imported panorama must not be blanked just by
  // saving. clearMask()/setPaintMode() blank the profile explicitly first
  // (profile=[]), which the length check below turns into a canonical blank.
  if (!Pano.cur.strokes || Pano.cur.strokes.length === 0) {
    if (!Array.isArray(Pano.cur.profile) || Pano.cur.profile.length !== NBIN) {
      Pano.cur.profile = new Array(NBIN).fill(sky ? 90 : -90);
    }
    if (!Array.isArray(Pano.cur.profile_top)
        || (sky && Pano.cur.profile_top.length !== NBIN)) {
      Pano.cur.profile_top = sky ? new Array(NBIN).fill(90) : [];
    }
    invalidateMask();
    render();
    return;
  }
  const W2 = NBIN, H2 = 180;
  const cv = document.createElement("canvas");
  cv.width = W2; cv.height = H2;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff";
  const wraps = (+$("#fovAz").value || 360) >= 359.5;
  for (const s of Pano.cur.strokes) {
    ctx.globalCompositeOperation = s.m === "e" ? "destination-out" : "source-over";
    stampDab(ctx, s, W2, H2, wraps);
  }
  const data = ctx.getImageData(0, 0, W2, H2).data;
  const ab = +$("#altBottom").value, at = +$("#altTop").value;
  const azOff = +$("#azOffset").value;
  const fov = +$("#fovAz").value || 360;
  const prof = [];
  const profTop = [];
  for (let i = 0; i < NBIN; i++) {
    // azimuth of this bin; only within [azOff, azOff+fov] is the image valid
    const rel = (((i * 0.5 - azOff) % 360) + 360) % 360;
    if (rel > fov) {
      // outside the image: unblocked in obstacle mode, blocked in sky mode
      prof.push(sky ? 90 : -99);
      profTop.push(sky ? 90 : 90);
      continue;
    }
    const x = Math.min(W2 - 1, Math.floor(rel / fov * W2));
    if (sky) {
      // painted band = the visible sky. profile = bottom edge of the band
      // (blocked below), profile_top = top edge (blocked above - e.g. a
      // balcony out of frame). Unpainted column -> fully blocked.
      let topY = -1, botY = -1;
      for (let y = 0; y < H2; y++) {
        if (data[(y * W2 + x) * 4 + 3] > 40) { topY = y; break; }
      }
      for (let y = H2 - 1; y >= 0; y--) {
        if (data[(y * W2 + x) * 4 + 3] > 40) { botY = y; break; }
      }
      if (topY < 0) {
        prof.push(90);
        profTop.push(90);
      } else {
        const eBottom = at - (botY / H2) * (at - ab);
        const eTop = at - (topY / H2) * (at - ab);
        prof.push(+(eBottom).toFixed(1));
        // open above when the band reaches (near) the top of the frame:
        // brush strokes rarely touch the very edge, so a band within ~4
        // degrees of the calibration top counts as "painted to the top"
        // and leaves the sky above open. A band that stops well below the
        // top means the strip above it is unpainted -> blocked -> its top
        // edge becomes the ceiling (e.g. a balcony).
        profTop.push(eTop >= at - 4
                     ? 90.5
                     : +(eTop).toFixed(1));
      }
    } else {
      // top edge of the painted obstacle
      let top = -1;
      for (let y = 0; y < H2; y++) {
        if (data[(y * W2 + x) * 4 + 3] > 40) { top = y; break; }
      }
      prof.push(top < 0 ? -99 : +(at - (top / H2) * (at - ab)).toFixed(1));
    }
  }
  Pano.cur.profile = prof;
  Pano.cur.profile_top = sky ? profTop : [];
  invalidateMask();
  render();
}

/* ---------------- persistence ---------------- */

function scheduleSave(delay = 900) {
  clearTimeout(Pano.saveTimer);
  Pano.saveTimer = setTimeout(async () => {
    if (!Pano.cur) return;
    recomputeProfile();
    let saved = true;
    try {
      await api("/api/panorama/" + Pano.cur.id, { method: "PUT",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
          az_offset: +$("#azOffset").value,
          alt_bottom: +$("#altBottom").value,
          alt_top: +$("#altTop").value,
          fov: +$("#fovAz").value,
          strokes: Pano.cur.strokes,
          profile: Pano.cur.profile,
          profile_top: Pano.cur.profile_top || [],
          paint_mode: paintMode(),
          block_above: !!Pano.cur.block_above,
        })});
    } catch {
      saved = false;      // api() already toasted; keep the local painting
    }
    if (!saved) return;
    S.panos = await api("/api/panoramas");
    const upd = S.panos.find(p => p.id === Pano.cur.id);
    if (upd) Pano.cur = upd;
  }, delay);
}
