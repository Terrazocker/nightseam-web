/*
 * AstroPilot Web — Horizon / panorama obstruction profiles.
 * Port of the original panorama feature (Plesk web port):
 *  • Photo (or blank sky) uploaded in-browser, never leaves the machine
 *  • Calibrate: azimuth at left edge, elevation at bottom/top, horizontal FOV
 *  • Paint the mask (brush/eraser) in two modes:
 *      obstacle — paint over trees/houses; profile = obstruction top per bin
 *      sky      — paint the visible sky band; profile = band bottom edge,
 *                 profileTop = band top edge (overhang/balcony above)
 *  • Profile is exactly 720 bins (0.5 deg per azimuth), NO_BLOCK = -90,
 *    unpainted columns in sky mode block fully (90), outside FOV follows mode
 *  • Persisted per browser in localStorage (per visiting site)
 */
const LS_KEY = 'apweb_panos_v1';
export const NO_BLOCK = -90;
export const BINS = 720;
export const MASK_W = 720;
export const MASK_H = 360; // 0.25 deg per row of altitude

/* ----- compressed panorama-image cache (survives reload) -----
   The full-resolution photo is memory-only (it can exceed localStorage
   quota), but a downscaled JPEG copy is kept in IndexedDB so the painted
   horizon doesn't vanish after a reload — the user never has to re-upload. */
const PANOIMG_DB = 'apweb-panoimg';
const PANOIMG_MAX_W = 1400;   // downscale width cap
const PANOIMG_QUALITY = 0.78;

function panoImgOpen() {
  return new Promise((resolve, reject) => {
    try {
      const rq = indexedDB.open(PANOIMG_DB, 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore('imgs'); };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    } catch (e) { reject(e); }
  });
}
async function panoImgGet(id) {
  try {
    const dbh = await panoImgOpen();
    return await new Promise((resolve, reject) => {
      const t = dbh.transaction('imgs', 'readonly').objectStore('imgs').get(id);
      t.onsuccess = () => resolve(t.result || null);
      t.onerror = () => reject(t.error);
    });
  } catch { return null; }
}
async function panoImgSet(id, blob) {
  try {
    const dbh = await panoImgOpen();
    await new Promise((resolve, reject) => {
      const t = dbh.transaction('imgs', 'readwrite').objectStore('imgs').put(blob, id);
      t.onsuccess = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } catch { /* storage unavailable — photo stays memory-only for the session */ }
}
async function panoImgDel(id) {
  try {
    const dbh = await panoImgOpen();
    await new Promise((resolve, reject) => {
      const t = dbh.transaction('imgs', 'readwrite').objectStore('imgs').delete(id);
      t.onsuccess = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } catch { /* ignore */ }
}

/** Downscale a data-URL image to a compressed JPEG blob (in-browser). */
function compressImage(dataUrl, maxW, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = img.width > maxW ? maxW / img.width : 1;
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        cv.toBlob((b) => resolve(b), 'image/jpeg', quality);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

let db = load();

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (Array.isArray(d.panos)) return d;
    }
  } catch { /* ignore */ }
  return { panos: [], activeId: null };
}

function save() {
  // strip in-memory image data URLs before persisting — they can exceed the
  // localStorage quota; profiles/strokes/calibration are what planning needs.
  try {
    const slim = { ...db, panos: db.panos.map((p) => {
      const { _img, ...rest } = p;
      return rest;
    }) };
    localStorage.setItem(LS_KEY, JSON.stringify(slim));
  } catch { /* ignore */ }
}

export function allPanos() { return db.panos; }
export function activePano() { return db.panos.find((p) => p.id === db.activeId) || null; }

/** Snapshot of all panoramas for backup (in-memory image pixels excluded). */
export function exportPanos() {
  return {
    ...db,
    panos: db.panos.map((p) => {
      const { _img, ...rest } = p;
      return rest;
    }),
  };
}

/** Replace all panoramas from a backup snapshot. Returns true on success.
 *  Imported records are validated and completed here: a snapshot from an older
 *  version (or a hand-edited file) may lack fov/profile/paintMode, and every
 *  consumer downstream assumes those exist. */
export function importPanos(data) {
  if (!data || !Array.isArray(data.panos)) return false;
  const blank = () => new Array(BINS).fill(NO_BLOCK);
  const num = (v, dflt) => (Number.isFinite(Number(v)) ? Number(v) : dflt);
  db = {
    panos: data.panos.map((p) => ({
      id: p.id,
      name: p.name || 'Panorama',
      azOffset: num(p.azOffset, 0),
      altBottom: num(p.altBottom, 0),
      altTop: num(p.altTop, 60),
      fov: num(p.fov, 360) > 0 ? num(p.fov, 360) : 360,
      paintMode: p.paintMode === 'sky' ? 'sky' : 'obstacle',
      strokes: Array.isArray(p.strokes) ? p.strokes : [],
      profile: (Array.isArray(p.profile) && p.profile.length === BINS)
        ? p.profile : blank(),
      profileTop: (Array.isArray(p.profileTop) && p.profileTop.length === BINS)
        ? p.profileTop : blank(),
      _img: null,
      hasImage: !!p.hasImage,
    })),
    activeId: data.activeId || null,
  };
  if (!db.activeId && db.panos.length) db.activeId = db.panos[0].id;
  if (db.activeId && !db.panos.some((p) => p.id === db.activeId)) db.activeId = db.panos.length ? db.panos[0].id : null;
  save();
  return true;
}

export function newPano(name) {
  const id = 'p' + Math.random().toString(36).slice(2, 8);
  const p = {
    id, name,
    azOffset: 0, altBottom: 0, altTop: 60, fov: 360,
    paintMode: 'obstacle',
    strokes: [],
    hasImage: false,
    profile: new Array(BINS).fill(NO_BLOCK),
    profileTop: new Array(BINS).fill(NO_BLOCK),
  };
  db.panos.push(p);
  if (!db.activeId) { db.activeId = id; }
  save();
  return p;
}

export function setActive(id) {
  db.activeId = id;
  save();
}

export function deletePano(id) {
  db.panos = db.panos.filter((p) => p.id !== id);
  if (db.activeId === id) db.activeId = db.panos.length ? db.panos[0].id : null;
  save();
  panoImgDel(id); // drop the cached compressed photo too
}

export function updatePano(p) {
  save();
}

/** Rebuild the binary mask (Uint8Array MASK_W*MASK_H) from the stroke list. */
export function rebuildMask(strokes) {
  const mask = new Uint8Array(MASK_W * MASK_H);
  for (const s of strokes) {
    const val = s.m === 'b' ? 255 : 0;
    const x0 = Math.max(0, Math.floor(s.x - s.r));
    const x1 = Math.min(MASK_W - 1, Math.ceil(s.x + s.r));
    for (let cx = x0; cx <= x1; cx++) {
      const dx = cx - s.x;
      const dy = Math.sqrt(Math.max(0, s.r * s.r - dx * dx));
      const y0 = Math.max(0, Math.floor(s.y - dy));
      const y1 = Math.min(MASK_H - 1, Math.ceil(s.y + dy));
      for (let cy = y0; cy <= y1; cy++) mask[cy * MASK_W + cx] = val;
    }
  }
  return mask;
}

const altOf = (p, row) => p.altTop - (row / (MASK_H - 1)) * (p.altTop - p.altBottom);

/** Recompute profile/profileTop (720 bins) from the current strokes. */
export function computeProfile(p) {
  const mask = rebuildMask(p.strokes);
  const prof = new Array(BINS).fill(NO_BLOCK);
  const top = new Array(BINS).fill(NO_BLOCK);
  for (let col = 0; col < BINS; col++) {
    let minRow = -1, maxRow = -1;
    for (let row = 0; row < MASK_H; row++) {
      if (mask[row * MASK_W + col]) { if (minRow < 0) minRow = row; maxRow = row; }
    }
    if (minRow >= 0) {
      if (p.paintMode === 'obstacle') {
        prof[col] = altOf(p, minRow);        // top of the painted mask
      } else {
        prof[col] = altOf(p, maxRow);        // sky mode: bottom edge of painted band
        top[col] = altOf(p, minRow);         // top edge (overhang)
      }
    } else if (p.paintMode === 'sky') {
      prof[col] = 90;                        // unpainted column = fully blocked
    }
  }
  p.profile = prof;
  p.profileTop = top;
  save();
  return prof;
}

/**
 * Ceiling lookup for one azimuth (deg). Returns { ceil, ceilTop }.
 * Blocking rule (applied per object sample):
 *   visible = alt >= minAlt && alt > ceil && alt < (ceilTop ?? 90.5)
 * Outside the calibrated FOV: obstacle mode = unblocked, sky mode = blocked.
 */
export function ceilFor(p, azDeg) {
  // Guard the record: an imported or legacy panorama without a well-formed
  // profile must degrade to "nothing blocks" (as the desktop and the server
  // do), never to `undefined` - `alt > undefined` is false, which would hide
  // every object in the sky.
  const prof = (p && Array.isArray(p.profile) && p.profile.length === BINS)
    ? p.profile : null;
  const tops = (p && Array.isArray(p.profileTop) && p.profileTop.length === BINS)
    ? p.profileTop : null;
  if (!prof) {
    return (p && p.paintMode === 'sky')
      ? { ceil: 90, ceilTop: null }
      : { ceil: NO_BLOCK, ceilTop: null };
  }
  const fov = Number(p.fov) > 0 ? Number(p.fov) : 360;
  const azOff = Number(p.azOffset) || 0;
  const d = ((azDeg - azOff) % 360 + 360) % 360;
  if (d > fov) {
    return p.paintMode === 'sky' ? { ceil: 90, ceilTop: null } : { ceil: NO_BLOCK, ceilTop: null };
  }
  const col = Math.min(BINS - 1, Math.floor((d / fov) * BINS));
  if (p.paintMode === 'sky') {
    return { ceil: prof[col], ceilTop: (tops && tops[col] > NO_BLOCK + 0.5) ? tops[col] : null };
  }
  return { ceil: prof[col], ceilTop: null };
}

/* --------------------------- editor UI --------------------------- */

const $ = (s, root) => (root || document).querySelector(s);
let undoHandler = null;

/**
 * Horizon tab UI. `box` = the #view container. `onChanged` is called after
 * save/activate/delete so other views (tonight/sky/detail) can re-render.
 */
export function renderHorizon(box, onChanged) {
  const pano = activePano();
  const active = pano ? pano.id : null;

  const panoRow = (p) => `
    <li data-id="${p.id}">
      <input type="radio" name="pano-active" ${p.id === active ? 'checked' : ''} title="use for planning">
      <span class="p-name">${esc(p.name)}</span>
      <span class="p-tags">${p.paintMode} · ${p.fov}°${p.hasImage ? ' · 📷' : ''}</span>
      <button class="btn small" data-del="${p.id}" title="delete">🗑</button>
    </li>`;

  box.innerHTML = `
    <div class="card">
      <h3>Your horizons</h3>
      <ul class="pick" id="pano-list">${db.panos.length ? db.panos.map(panoRow).join('') : '<li style="cursor:default">no horizon stored yet</li>'}</ul>
      <div style="margin-top:12px">
        <label>Name <input id="pano-name" type="text" value="backyard" style="width:120px"></label>
        <div class="btnrow" style="margin-top:8px">
          <label class="btn primary" for="pano-file" style="text-align:center" title="choose a photo">📷 Upload photo</label>
          <button class="btn" id="pano-blank">Blank sky</button>
        </div>
        <input type="file" id="pano-file" accept="image/*" class="vhidden">
        <p class="sub" id="pano-note" style="margin-top:8px">Nothing is uploaded to any server. A compressed copy of the photo is saved in your browser's storage so it returns after a reload; your painted profile is always saved.</p>
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <h3>${active ? `Horizon editor — ${esc(pano.name)}` : 'Horizon editor'}</h3>
      ${active ? haziEditorHTML(pano) : '<p class="sub">create or select a horizon to start painting.</p>'}
    </div>`;
  hideSplash(box);

  // panos list actions (skip the empty-state placeholder row, which has no controls)
  box.querySelectorAll('#pano-list li[data-id]').forEach((li) => {
    const radio = $('input[type=radio]', li);
    const del = $('[data-del]', li);
    if (radio) radio.addEventListener('change', () => { setActive(li.dataset.id); renderHorizon(box, onChanged); });
    if (del) del.addEventListener('click', (ev) => { ev.stopPropagation(); deletePano(li.dataset.id); renderHorizon(box, onChanged); });
  });

  // create
  const mk = (imgDataUrl) => {
    try {
      const name = ($('#pano-name').value.trim()) || 'horizon';
      const p = newPano(name);
      if (imgDataUrl) {
        p.hasImage = true; p._img = imgDataUrl;
        // keep a compressed JPEG copy so the photo survives reloads
        compressImage(imgDataUrl, PANOIMG_MAX_W, PANOIMG_QUALITY)
          .then((blob) => { if (blob) panoImgSet(p.id, blob); });
      }
      setActive(p.id); // show the new horizon in the editor immediately
      updatePano(p);
      renderHorizon(box, onChanged);
      onChanged();
    } catch (err) {
      const note = $('#pano-note');
      if (note) note.textContent = '😕 could not create horizon: ' + err.message;
    }
  };
  $('#pano-blank').addEventListener('click', () => mk(null));
  // the upload button is a <label for="pano-file"> — the browser opens the
  // file picker natively (no JS click involved, works in every browser);
  // drag & drop onto the page is wired once per view container below.
  $('#pano-file').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => mk(rd.result);
    rd.onerror = () => { const n = $('#pano-note'); if (n) n.textContent = '😕 could not read the file'; };
    rd.readAsDataURL(f);
  });
  if (!box.__panoDrop) {
    box.__panoDrop = true;
    box.addEventListener('dragover', (ev) => {
      if (ev.dataTransfer && ev.dataTransfer.types && ev.dataTransfer.types.includes('Files')) ev.preventDefault();
    });
    box.addEventListener('drop', (ev) => {
      const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (!f || !f.type.startsWith('image/')) return;
      ev.preventDefault();
      const rd = new FileReader();
      rd.onload = () => mk(rd.result);
      rd.readAsDataURL(f);
    });
  }

  if (active) {
    const p = activePano();
    if (p && p.hasImage && !p._img) {
      // restore the compressed photo from IndexedDB (was saved on upload)
      panoImgGet(p.id).then((blob) => {
        if (blob) {
          const rd = new FileReader();
          rd.onload = () => { p._img = rd.result; wireEditor(box, p, onChanged); };
          rd.readAsDataURL(blob);
        } else {
          wireEditor(box, p, onChanged); // no cached photo — blank canvas
        }
      }).catch(() => wireEditor(box, p, onChanged));
    } else {
      wireEditor(box, p, onChanged);
    }
  }
}

function hideSplash(box) {
  const sp = $('.splash', box);
  if (sp) sp.style.display = 'none';
}

function haziEditorHTML(p) {
  return `
    <div class="btnrow">
      <select id="ed-mode" title="paint mode">
        <option value="obstacle" ${p.paintMode === 'obstacle' ? 'selected' : ''}>Obstacles (paint what blocks)</option>
        <option value="sky" ${p.paintMode === 'sky' ? 'selected' : ''}>Sky band (paint visible sky)</option>
      </select>
      <label>Brush <input id="ed-brush" type="range" min="3" max="80" value="28"></label>
      <button class="btn" id="ed-eraser" title="toggle eraser (also right-click)">🧽 Eraser</button>
      <button class="btn" id="ed-undo" title="undo last stroke (Ctrl+Z)">↩ Undo</button>
      <button class="btn" id="ed-clear">Clear</button>
    </div>
    <div class="cal-grid" style="margin-top:10px">
      <label>Az @ left
        <input id="ed-az" type="range" min="0" max="360" step="5" value="${p.azOffset}">
        <output id="ed-az-v">${p.azOffset}°</output>
      </label>
      <label>Alt bottom
        <input id="ed-ab" type="range" min="-30" max="90" step="5" value="${p.altBottom}">
        <output id="ed-ab-v">${p.altBottom}°</output>
      </label>
      <label>Alt top
        <input id="ed-at" type="range" min="0" max="90" step="5" value="${p.altTop}">
        <output id="ed-at-v">${p.altTop}°</output>
      </label>
      <label>FOV
        <input id="ed-fov" type="range" min="5" max="360" step="5" value="${p.fov}">
        <output id="ed-fov-v">${p.fov}°</output>
      </label>
    </div>
    <div class="pano-canvas-box" id="pano-box"><canvas id="pano-canvas" width="720" height="360"></canvas></div>
    <canvas id="pano-profile" width="720" height="56"></canvas>
    <p class="sub" style="margin-top:6px">profile preview scales to your alt-bottom / alt-top range · strokes are applied to the sky map and planning immediately</p>
    <div class="btnrow" style="margin-top:8px">
      <button class="btn primary" id="ed-save">💾 Save</button>
    </div>`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* prefs — shared with app.js via module state */
let prefs = loadPrefs();
export function getPrefs() { return prefs; }
export function effectiveMinAlt() { return prefs.minAlt != null ? prefs.minAlt : 17 + 2 * prefs.bortle; }
export function setPrefs(patch) { prefs = { ...prefs, ...patch }; savePrefs(); }
function loadPrefs() {
  try {
    const raw = localStorage.getItem('apweb_prefs_v1');
    if (raw) return { bortle: 4, minAlt: null, moonAware: true, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { bortle: 4, minAlt: null, moonAware: true };
}
function savePrefs() { try { localStorage.setItem('apweb_prefs_v1', JSON.stringify(prefs)); } catch { /* ignore */ } }

/** parse decimal accepting comma (German locale), like num() in the original. */
export function num(s) {
  if (typeof s === 'number') return s;
  const v = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
}

function wireEditor(box, p, onChanged) {
  const cvs = $('#pano-canvas', box);
  const ctx = cvs.getContext('2d');
  const profCvs = $('#pano-profile', box);
  const profCtx = profCvs.getContext('2d');
  const boxEl = $('#pano-box', box);
  let eraser = false;
  let baseCanvas = null; // pristine image base, so erasing really removes paint
  let mask = rebuildMask(p.strokes);

  const paintMode = () => p.paintMode;
  const maskColor = () => (paintMode() === 'obstacle' ? 'rgba(255,80,80,.5)' : 'rgba(120,230,140,.55)');

  function draw() {
    if (p._img) {
      const img = new Image();
      img.onload = () => {
        baseCanvas = document.createElement('canvas');
        baseCanvas.width = MASK_W;
        baseCanvas.height = MASK_H;
        drawImageCover(baseCanvas.getContext('2d'), img, MASK_W, MASK_H);
        overlay();
      };
      img.onerror = () => {
        baseCanvas = null;
        drawGrid();
        ctx.fillStyle = 'rgba(255,190,107,.9)';
        ctx.font = '15px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('😕 could not decode this image (HEIC files need conversion)', MASK_W / 2, MASK_H / 2);
      };
      img.src = p._img;
    } else {
      baseCanvas = null;
      drawGrid();
      overlay();
    }
  }

  function drawGrid() {
    ctx.fillStyle = '#0c1830';
    ctx.fillRect(0, 0, MASK_W, MASK_H);
    ctx.strokeStyle = 'rgba(124,196,255,.15)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const y = (i / 8) * MASK_H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MASK_W, y); ctx.stroke();
    }
  }

  function overlay() {
    // always start from the pristine base: erased/undone areas truly reappear
    ctx.clearRect(0, 0, MASK_W, MASK_H);
    if (baseCanvas) ctx.drawImage(baseCanvas, 0, 0);
    else drawGrid();
    // painted mask
    const img = ctx.getImageData(0, 0, MASK_W, MASK_H);
    const col = paintMode() === 'obstacle' ? [255, 80, 80] : [120, 230, 140];
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        img.data[i * 4] = img.data[i * 4] * 0.4 + col[0] * 0.6;
        img.data[i * 4 + 1] = img.data[i * 4 + 1] * 0.4 + col[1] * 0.6;
        img.data[i * 4 + 2] = img.data[i * 4 + 2] * 0.4 + col[2] * 0.6;
        img.data[i * 4 + 3] = 235;
      }
    }
    ctx.putImageData(img, 0, 0);
    // calibration hints (N/E/S/W at appropriate x)
    ctx.fillStyle = 'rgba(219,233,255,.85)';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';
    for (const az of [0, 90, 180, 270]) {
      const x = (az - p.azOffset + 360) % 360;
      if (x <= p.fov && paintMode() === 'obstacle') {
        ctx.fillText(['N', 'E', 'S', 'W'][az / 90], (x / 360) * MASK_W + 2, 14);
      }
    }
    drawProfile();
  }

  function drawProfile() {
    computeProfile(p);
    profCtx.clearRect(0, 0, 720, 56);
    profCtx.fillStyle = '#081022';
    profCtx.fillRect(0, 0, 720, 56);
    const lo = Math.min(p.altBottom, 0);
    const hi = Math.max(p.altTop, 10);
    const span = Math.max(1, hi - lo);
    const yOf = (alt) => 52 - ((alt - lo) / span) * 52;
    if (paintMode() === 'obstacle') {
      profCtx.strokeStyle = '#ff6b6b';
      profCtx.lineWidth = 2;
      profCtx.beginPath();
      let started = false;
      for (let i = 0; i <= BINS; i += 2) {
        const ceil = p.profile[Math.min(BINS - 1, i)];
        const y = yOf(ceil > NO_BLOCK + 0.5 ? ceil : -90);
        if (!started) { profCtx.moveTo(i / 2, y); started = true; } else profCtx.lineTo(i / 2, y);
      }
      profCtx.stroke();
    } else {
      profCtx.fillStyle = 'rgba(120,230,140,.35)';
      profCtx.beginPath();
      for (let i = 0; i <= BINS; i += 2) {
        const c = p.profile[Math.min(BINS - 1, i)];
        profCtx.lineTo(i / 2, yOf(c > NO_BLOCK + 0.5 ? c : 90));
      }
      for (let i = BINS; i >= 0; i -= 2) {
        const t = p.profileTop[Math.min(BINS - 1, i)];
        profCtx.lineTo(i / 2, yOf(t > NO_BLOCK + 0.5 ? t : 90));
      }
      profCtx.closePath();
      profCtx.fill();
    }
    profCtx.fillStyle = 'rgba(127,151,184,.8)';
    profCtx.font = '9px system-ui';
    profCtx.fillText(lo.toFixed(0) + '°', 2, 53);
    profCtx.fillText(hi.toFixed(0) + '°', 2, 12);
    profCtx.fillText('profile — ' + paintMode() + ' · alt ' + lo.toFixed(0) + '…' + hi.toFixed(0) + '°', 540, 12);
  }

  // pointer painting
  let painting = false;
  const toCanvas = (ev) => {
    const r = cvs.getBoundingClientRect();
    return [(ev.clientX - r.left) / r.width * MASK_W, (ev.clientY - r.top) / r.height * MASK_H];
  };
  const strokeAt = (x, y) => {
    const r = Number($('#ed-brush', box).value);
    p.strokes.push({ m: eraser ? 'e' : 'b', x, y, r });
    mask = rebuildMask(p.strokes);
    overlay();
  };
  cvs.addEventListener('pointerdown', (ev) => {
    painting = true;
    cvs.setPointerCapture(ev.pointerId);
    const [x, y] = toCanvas(ev);
    strokeAt(x, y);
    ev.preventDefault();
  });
  cvs.addEventListener('pointermove', (ev) => {
    if (!painting) return;
    const [x, y] = toCanvas(ev);
    strokeAt(x, y);
  });
  cvs.addEventListener('pointerup', (ev) => { painting = false; });
  cvs.addEventListener('contextmenu', (ev) => { ev.preventDefault(); eraser = true; const [x, y] = toCanvas(ev); strokeAt(x, y); eraser = false; });
  $('#ed-eraser', box).addEventListener('click', (ev) => { eraser = !eraser; ev.target.classList.toggle('on', eraser); });
  $('#ed-undo', box).addEventListener('click', () => { if (p.strokes.length) { p.strokes.pop(); mask = rebuildMask(p.strokes); overlay(); } });
  $('#ed-clear', box).addEventListener('click', () => { p.strokes = []; mask = rebuildMask(p.strokes); overlay(); });
  if (undoHandler) document.removeEventListener('keydown', undoHandler);
  undoHandler = (ev) => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== 'z') return;
    if (!document.querySelector('#pano-canvas')) return;
    if (!box.contains(document.activeElement)) return;
    ev.preventDefault();
    if (p.strokes.length) { p.strokes.pop(); mask = rebuildMask(p.strokes); overlay(); }
  };
  document.addEventListener('keydown', undoHandler);

  // calibration sliders (5-degree steps)
  const cal = () => {
    p.azOffset = clampNum($('#ed-az', box).value, 0, 360, 0);
    p.altBottom = clampNum($('#ed-ab', box).value, -30, 90, 0);
    p.altTop = clampNum($('#ed-at', box).value, -30, 90, 60);
    p.fov = clampNum($('#ed-fov', box).value, 5, 360, 360);
    if (p.altTop <= p.altBottom) p.altTop = p.altBottom + 5;
    const at = $('#ed-at', box);
    at.min = String(Math.min(90, p.altBottom + 5));
    at.value = String(p.altTop);
    $('#ed-az-v', box).textContent = p.azOffset + '°';
    $('#ed-ab-v', box).textContent = p.altBottom + '°';
    $('#ed-at-v', box).textContent = p.altTop + '°';
    $('#ed-fov-v', box).textContent = p.fov + '°';
    updatePano(p);
    overlay();
  };
  ['ed-az', 'ed-ab', 'ed-at', 'ed-fov'].forEach((id) => $('#' + id, box).addEventListener('input', cal));
  $('#ed-mode', box).addEventListener('change', (ev) => { p.paintMode = ev.target.value; updatePano(p); overlay(); });

  $('#ed-save', box).addEventListener('click', () => {
    computeProfile(p);
    updatePano(p);
    onChanged();
    const b = $('#ed-save', box);
    b.textContent = '✓ Saved';
    setTimeout(() => { b.textContent = '💾 Save'; }, 1200);
  });

  if (p._img) { draw(); } else { draw(); }
}

function drawImageCover(ctx, img, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  const dx = (w - dw) / 2, dy = (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function clampNum(v, lo, hi, dflt) {
  const n = num(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}