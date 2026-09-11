/*
 * NightSeam Web — Horizon / panorama obstruction profiles.
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
/* The pure panorama/horizon geometry lives in core/ - baked to
   ./core/<hash>/ and imported through the stable ./core.js stub. The shell
   re-exports it so app.js/nightrank.js keep their public surface. */
import {
  NO_BLOCK, BINS, MASK_W, MASK_H,
  rebuildMask, wrapsFor, altOf, rowOfAlt, xOfAz, azOfX, profileFromMask,
  normalizeProfileBins, WORLD_BINS, profileSegments, visibleSkyBands,
  skyBandPolygons, computeProfile, clearMask, ceilFor, bandTopFor,
  overhangRuns, assumedOpenRuns, assumedOpenHatchPolys,
  effectiveMinAlt as coreMinAlt,
} from './core.js?v=15';

export {
  NO_BLOCK, BINS, MASK_W, MASK_H,
  rebuildMask, altOf, rowOfAlt, xOfAz, azOfX, profileSegments,
  visibleSkyBands, skyBandPolygons, computeProfile, clearMask, ceilFor,
  bandTopFor, overhangRuns, assumedOpenRuns, assumedOpenHatchPolys,
};

const LS_KEY = 'nightseam_panos_v1';

/* ----- compressed panorama-image cache (survives reload) -----
   The full-resolution photo is memory-only (it can exceed localStorage
   quota), but a downscaled JPEG copy is kept in IndexedDB so the painted
   horizon doesn't vanish after a reload — the user never has to re-upload. */
const PANOIMG_DB = 'nightseam-panoimg';
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
      if (Array.isArray(d.panos)) {
        // D1 adapter: stored profiles used to be FOV-relative mask columns;
        // convert once to the canonical world-azimuth bins (idempotent).
        d.panos.forEach(normalizeProfileBins);
        return d;
      }
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

/** Snapshot of all panoramas (in-memory image data URLs stripped).
 *  `hasImage` may be true here even though the JPEG only lives in IndexedDB;
 *  use `exportPanosWithImages()` for a backup that is TRUTHFUL about images. */
export function exportPanos() {
  return {
    ...db,
    panos: db.panos.map((p) => {
      const { _img, ...rest } = p;
      return rest;
    }),
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    try {
      const rd = new FileReader();
      rd.onload = () => resolve(typeof rd.result === 'string' ? rd.result : null);
      rd.onerror = () => resolve(null);
      rd.readAsDataURL(blob);
    } catch { resolve(null); }
  });
}

function dataUrlToBlob(dataUrl) {
  return new Promise((resolve) => {
    try {
      if (typeof fetch === 'function') {
        fetch(dataUrl).then((r) => r.blob()).then(resolve).catch(() => resolve(null));
        return;
      }
      const m = /^data:([^;,]*)(;base64)?,(.*)$/.exec(dataUrl);
      if (!m || typeof Blob !== 'function') { resolve(null); return; }
      const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      resolve(new Blob([arr], { type: m[1] || 'image/jpeg' }));
    } catch { resolve(null); }
  });
}

/** TRUE backup of panoramas: embed the compressed photo for every record whose
 *  image actually exists (IndexedDB, or the in-memory data URL), and force
 *  `hasImage` to match the data that is really included. This is what makes a
 *  restored record never claim an image that was not backed up. */
export async function exportPanosWithImages() {
  const panos = [];
  for (const p of db.panos) {
    const { _img, ...rest } = p;
    let image = null;
    if (p.hasImage) {
      const blob = await panoImgGet(p.id).catch(() => null);
      if (blob) image = await blobToDataUrl(blob);
      if (!image && typeof p._img === 'string' && p._img.startsWith('data:')) image = p._img;
    }
    const rec = { ...rest, hasImage: !!image };
    if (image) rec.image = image;
    panos.push(rec);
  }
  return { panos, activeId: db.activeId };
}

/** Validate + normalize a backup's panorama section into a canonical snapshot
 *  (PURE: no global mutation). Returns null when the shape is unusable.
 *
 *  - `hasImage` becomes true ONLY when the backup actually carried image bytes,
 *    so a restored record can never lie about having a photo.
 *  - profile/strokes are made consistent: strokes WIN when present, otherwise
 *    the stored profile is authoritative (never silently un-block a horizon). */
export function normalizePanos(data) {
  if (!data || !Array.isArray(data.panos)) return null;
  const blank = () => new Array(BINS).fill(NO_BLOCK);
  const num = (v, dflt) => (Number.isFinite(Number(v)) ? Number(v) : dflt);
  const panos = data.panos.map((p) => {
    const image = (typeof p.image === 'string' && p.image.startsWith('data:')) ? p.image : null;
    const strokes = Array.isArray(p.strokes) ? p.strokes : [];
    const rec = {
      id: String(p.id ?? ''),
      name: p.name || 'Panorama',
      azOffset: num(p.azOffset, 0),
      altBottom: num(p.altBottom, 0),
      altTop: num(p.altTop, 60),
      fov: num(p.fov, 360) > 0 ? num(p.fov, 360) : 360,
      paintMode: p.paintMode === 'sky' ? 'sky' : 'obstacle',
      // sky mode: TRUE when the user explicitly says "block above the band";
      // default FALSE = everything above the painted band is free sky
      blockAbove: !!p.blockAbove,
      strokes,
      profile: (Array.isArray(p.profile) && p.profile.length === BINS) ? p.profile : blank(),
      profileTop: (Array.isArray(p.profileTop) && p.profileTop.length === BINS) ? p.profileTop : blank(),
      // carry the bin-space marker: a CURRENT backup restores untouched, a
      // legacy (FOV-relative) one converts exactly once below
      profileBins: p.profileBins,
      _img: null,
      hasImage: !!image,
    };
    if (rec.strokes.length) {
      const mask = rebuildMask(rec.strokes, wrapsFor(rec));
      const { prof, top } = profileFromMask(rec, mask);
      rec.profile = prof;
      rec.profileTop = top;
    }
    normalizeProfileBins(rec);   // D1: legacy FOV-relative -> world bins
    if (image) rec.image = image;
    return rec;
  });
  let activeId = data.activeId || null;
  if (!activeId && panos.length) activeId = panos[0].id;
  if (activeId && !panos.some((p) => p.id === activeId)) activeId = panos.length ? panos[0].id : null;
  return { panos, activeId };
}

/** Apply a snapshot produced by normalizePanos(): replace the live set, persist,
 *  and re-cache the embedded photos into IndexedDB (best-effort). */
export function applyPanosSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.panos)) return false;
  const pending = [];
  db = {
    panos: snapshot.panos.map((p) => {
      const { image, ...rest } = p;
      if (image) pending.push([p.id, image]);
      // keep the data URL in memory too, so the editor shows the restored
      // photo before the IndexedDB re-cache finishes
      return { ...rest, _img: image || null };
    }),
    activeId: snapshot.activeId || null,
  };
  if (!db.activeId && db.panos.length) db.activeId = db.panos[0].id;
  if (db.activeId && !db.panos.some((p) => p.id === db.activeId)) db.activeId = db.panos.length ? db.panos[0].id : null;
  save();
  for (const [id, image] of pending) {
    dataUrlToBlob(image).then((b) => { if (b) panoImgSet(id, b); }).catch(() => {});
  }
  return true;
}

/** Replace all panoramas from a backup snapshot. Returns true on success. */
export function importPanos(data) {
  const snapshot = normalizePanos(data);
  if (!snapshot) return false;
  return applyPanosSnapshot(snapshot);
}

export function newPano(name) {
  const id = 'p' + Math.random().toString(36).slice(2, 8);
  const p = {
    id, name,
    azOffset: 0, altBottom: 0, altTop: 60, fov: 360,
    paintMode: 'obstacle',
    blockAbove: false,
    strokes: [],
    hasImage: false,
    profile: new Array(BINS).fill(NO_BLOCK),
    profileTop: new Array(BINS).fill(NO_BLOCK),
    profileBins: WORLD_BINS,
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

/* ---------------- editor session: history + view (pure) ----------------
 *
 * History stores JSON snapshots of the EDITABLE state (strokes + calibration +
 * paint mode) - no bitmap copies. One paint gesture is one snapshot (committed
 * on pointer up), so a drag is a single undo step. The profile is not stored in
 * the snapshot: it is derived from the strokes (or kept when there are none).
 */
export function snapshotPano(p) {
  return JSON.stringify({
    a: p.azOffset, b: p.altBottom, t: p.altTop, f: p.fov,
    m: p.paintMode, s: p.strokes, o: p.blockAbove ? 1 : 0,
  });
}

export function applySnapshot(p, snap) {
  const o = JSON.parse(snap);
  p.azOffset = o.a; p.altBottom = o.b; p.altTop = o.t; p.fov = o.f;
  p.paintMode = o.m; p.strokes = o.s; p.blockAbove = !!o.o;
  return p;
}

export const HISTORY_LIMIT = 60;

/** New history for a panorama: one entry (the current state) + saved baseline. */
export function newHistory(p) {
  const snap = snapshotPano(p);
  return { entries: [snap], index: 0, baseline: snap };
}

/** Record the current state as a new history entry (no-op when unchanged).
 *  Drops any redo entries. Returns true when a new entry was added. */
export function historyCommit(h, p, limit = HISTORY_LIMIT) {
  const snap = snapshotPano(p);
  if (snap === h.entries[h.index]) return false;
  h.entries = h.entries.slice(0, h.index + 1);
  h.entries.push(snap);
  if (h.entries.length > limit) h.entries.shift();
  h.index = h.entries.length - 1;
  return true;
}

export function historyCanUndo(h) { return h.index > 0; }
export function historyCanRedo(h) { return h.index < h.entries.length - 1; }

export function historyUndo(h, p) {
  if (!historyCanUndo(h)) return false;
  h.index -= 1;
  applySnapshot(p, h.entries[h.index]);
  return true;
}

export function historyRedo(h, p) {
  if (!historyCanRedo(h)) return false;
  h.index += 1;
  applySnapshot(p, h.entries[h.index]);
  return true;
}

/** Mark the current state as saved: the dirty baseline moves to it. */
export function historyMarkSaved(h, p) { h.baseline = snapshotPano(p); }

/** True when the current state differs from the last saved state. Undoing all
 *  the way back to the baseline therefore clears it. */
export function historyDirty(h, p) { return snapshotPano(p) !== h.baseline; }

/* Editor zoom is presentation-only (never touches stored geometry). W/H are the
 * LOGICAL mask size (720x360), so the same transform drives drawing, hit
 * testing, guides and the cursor readout. */
export const EDITOR_ZOOM_MIN = 1;
export const EDITOR_ZOOM_MAX = 8;

export function editorClampZoom(z) {
  return Math.max(EDITOR_ZOOM_MIN, Math.min(EDITOR_ZOOM_MAX, z));
}

export function editorViewMatrix(W, H, zoom, fx, fy) {
  const cx = fx == null ? W / 2 : fx;
  const cy = fy == null ? H / 2 : fy;
  return { a: zoom, d: zoom, e: W / 2 - cx * zoom, f: H / 2 - cy * zoom };
}

/** Logical editor coords -> base mask coords (sx/sy already in logical units,
 *  i.e. CSS px * W / canvasWidth). */
export function editorScreenToBase(W, H, zoom, fx, fy, sx, sy) {
  const cx = fx == null ? W / 2 : fx;
  const cy = fy == null ? H / 2 : fy;
  return [cx + (sx - W / 2) / zoom, cy + (sy - H / 2) / zoom];
}

/** Keep the visible window inside the mask; zoom 1 is always centered. */
export function editorClampFocus(W, H, zoom, fx, fy) {
  if (zoom <= EDITOR_ZOOM_MIN) return [null, null];
  const hw = W / (2 * zoom), hh = H / (2 * zoom);
  const cx = fx == null ? W / 2 : fx;
  const cy = fy == null ? H / 2 : fy;
  return [Math.max(hw, Math.min(W - hw, cx)), Math.max(hh, Math.min(H - hh, cy))];
}

/* --------------------------- editor UI --------------------------- */

const $ = (s, root) => (root || document).querySelector(s);
let undoHandler = null;
let activeSession = null;   // the open editor's { dirty, revert, save } hooks

/** 16-point compass label for an azimuth (degrees). */
const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                   'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
function cardinal(azDeg) {
  const a = ((Number(azDeg) % 360) + 360) % 360;
  return CARDINALS[Math.round(a / 22.5) % 16];
}

// warn before closing the tab while the open editor has unsaved changes
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (ev) => {
    if (activeSession && activeSession.dirty()) {
      ev.preventDefault();
      ev.returnValue = '';
      return '';
    }
  });
}

/**
 * Horizon tab UI. `box` = the #view container. `onChanged` is called after
 * save/activate/delete so other views (tonight/sky/detail) can re-render.
 */
export function renderHorizon(box, onChanged) {
  const pano = activePano();
  const active = pano ? pano.id : null;

  const panoRow = (p) => `
    <li data-id="${esc(p.id)}">
      <input type="radio" name="pano-active" ${p.id === active ? 'checked' : ''} title="use for planning">
      <span class="p-name">${esc(p.name)}</span>
      <span class="p-tags">${p.paintMode} · ${p.fov}°${p.hasImage ? ' · 📷' : ''}</span>
      <button class="btn small" data-del="${esc(p.id)}" title="delete">🗑</button>
    </li>`;

  box.innerHTML = `
    <div class="card">
      <h3>Your horizons</h3>
      <ul class="pick" id="pano-list">${db.panos.length ? db.panos.map(panoRow).join('') : '<li style="cursor:default">no horizon stored yet</li>'}</ul>
      <div style="margin-top:12px">
        <label>Name <input id="pano-name" type="text" value="backyard" style="width:120px"></label>
        <div class="btnrow action-row" style="margin-top:12px">
          <label class="btn primary" for="pano-file" style="text-align:center" title="choose a photo">📷 Upload photo</label>
          <button class="btn" id="pano-blank">Blank sky</button>
        </div>
        <input type="file" id="pano-file" accept="image/*" class="vhidden">
        <p class="sub" id="pano-note" style="margin-top:8px">Nothing is uploaded to any server. A compressed copy of the photo is saved in your browser's storage so it returns after a reload. Painting changes the live plan immediately; press Save in the editor to keep the changes (you are warned before switching or closing with unsaved edits).</p>
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
    if (radio) radio.addEventListener('change', () => {
      flushHorizonEdits();          // never lose edits when switching
      setActive(li.dataset.id);
      renderHorizon(box, onChanged);
    });
    if (del) del.addEventListener('click', (ev) => {
      ev.stopPropagation();
      flushHorizonEdits();
      deletePano(li.dataset.id);
      renderHorizon(box, onChanged);
    });
  });

  // create
  const mk = (imgDataUrl) => {
    flushHorizonEdits();
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
    <div class="ed-tools">
      <div class="ed-row">
        <span class="ed-rowlabel">Paint</span>
        <div class="ed-group ed-mode">
          <select id="ed-mode" title="paint mode" aria-label="Paint mode">
            <option value="obstacle" ${p.paintMode === 'obstacle' ? 'selected' : ''}>Obstacles (paint what blocks)</option>
            <option value="sky" ${p.paintMode === 'sky' ? 'selected' : ''}>Sky band (paint visible sky)</option>
          </select>
        </div>
        <div class="ed-group ed-paint">
          <label class="ed-brush">Brush
            <input id="ed-brush" type="range" min="3" max="80" value="28" aria-label="Brush size">
          </label>
          <button class="btn" id="ed-eraser" title="Toggle eraser (or right-click)" aria-pressed="false">🧽 Eraser</button>
          <label class="inline ed-blockabove" title="Treat everything ABOVE the painted band as blocked (an overhang / balcony). Off by default: the sky above the band is assumed free."><input type="checkbox" id="ed-block-above" ${p.blockAbove ? 'checked' : ''}> block above band</label>
        </div>
      </div>
      <div class="ed-row">
        <span class="ed-rowlabel">History</span>
        <div class="ed-group ed-history">
          <button class="btn" id="ed-undo" title="Undo (Ctrl+Z)" aria-label="Undo">↩ Undo</button>
          <button class="btn" id="ed-redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↪ Redo</button>
          <button class="btn" id="ed-revert" title="Discard changes and restore the last saved horizon (undoable)">⟲ Revert</button>
        </div>
        <div class="ed-group ed-destructive">
          <button class="btn" id="ed-clear" title="Remove all paint (asks first; undoable)">Clear…</button>
        </div>
        <div class="ed-group ed-status-group">
          <span id="ed-status" class="ed-status" role="status" aria-live="polite">Saved</span>
          <button class="btn primary" id="ed-save" title="Save this horizon">💾 Save</button>
        </div>
      </div>
    </div>
    <p class="sub ed-hint" style="margin-top:8px">
      cursor: <output id="ed-pos" class="mono">az \u2014 \u00B7 alt \u2014</output>
      \u00B7 wheel = zoom \u00B7 middle-drag or Space+drag = pan \u00B7 hold right-click = erase
    </p>
    <div class="cal-grid" style="margin-top:10px">
      <label>Az @ left
        <input id="ed-az" type="range" min="0" max="360" step="5" value="${p.azOffset}">
        <output id="ed-az-v">${p.azOffset}\u00B0</output>
      </label>
      <label>Alt bottom
        <input id="ed-ab" type="range" min="-30" max="90" step="5" value="${p.altBottom}">
        <output id="ed-ab-v">${p.altBottom}\u00B0</output>
      </label>
      <label>Alt top
        <input id="ed-at" type="range" min="0" max="90" step="5" value="${p.altTop}">
        <output id="ed-at-v">${p.altTop}\u00B0</output>
      </label>
      <label>FOV
        <input id="ed-fov" type="range" min="5" max="360" step="5" value="${p.fov}">
        <output id="ed-fov-v">${p.fov}\u00B0</output>
      </label>
    </div>
    <div class="pano-canvas-box" id="pano-box">
      <canvas id="pano-canvas" width="720" height="360" tabindex="0" aria-label="Panorama horizon editor"></canvas>
      <div class="ed-view-overlay" role="group" aria-label="View controls">
        <button class="btn small" id="ed-zoom-out" title="Zoom out" aria-label="Zoom out">\u2212</button>
        <span id="ed-zoom-label" class="mono">1.0\u00D7</span>
        <button class="btn small" id="ed-zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
        <button class="btn small" id="ed-fit" title="Fit the whole panorama">Fit</button>
      </div>
    </div>
    <canvas id="pano-profile" width="720" height="56" aria-label="Obstruction profile preview"></canvas>
    <p class="sub" style="margin-top:6px">Guides: amber = azimuth (N/E/S/W), green dashed = horizon (alt 0), blue = altitude. Profile preview scales to your alt-bottom / alt-top range &middot; edits apply to planning immediately; press Save to keep them.</p>`;
}

/** Small in-page confirm dialog (never a blocking browser alert/confirm). */
function confirmDialog(box, { title, body, ok, cancel = 'Cancel' }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'ed-confirm';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `
      <div class="ed-confirm-box">
        <h4>${esc(title)}</h4>
        <p>${esc(body)}</p>
        <div class="btnrow">
          <button class="btn" data-cancel>${esc(cancel)}</button>
          <button class="btn primary" data-ok>${esc(ok)}</button>
        </div>
      </div>`;
    const done = (v) => { el.remove(); resolve(v); };
    el.querySelector('[data-cancel]').addEventListener('click', () => done(false));
    el.querySelector('[data-ok]').addEventListener('click', () => done(true));
    el.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') done(false); });
    el.addEventListener('click', (ev) => { if (ev.target === el) done(false); });
    (box || document.body).appendChild(el);
    el.querySelector('[data-ok]').focus();
  });
}

/** True when the open editor has edits not yet persisted. */
export function horizonUnsaved() {
  return !!(activeSession && activeSession.dirty());
}

/** Persist any pending editor edits (no-op when clean). Callers flush before
 *  leaving the editor (switch panorama, create, navigate away) so an edit can
 *  never be silently lost; the in-tab "unsaved" chip + the beforeunload guard
 *  cover closing the app while the editor is open. */
export function flushHorizonEdits() {
  if (activeSession && activeSession.dirty()) activeSession.save();
}


const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* prefs — shared with app.js via module state */
let prefs = loadPrefs();
export function getPrefs() { return prefs; }
export const effectiveMinAlt = () => coreMinAlt(prefs.bortle, prefs.minAlt);
export function setPrefs(patch) { prefs = { ...prefs, ...patch }; savePrefs(); }
function loadPrefs() {
  try {
    const raw = localStorage.getItem('nightseam_prefs_v1');
    if (raw) return { bortle: 4, minAlt: null, moonAware: false, viewFullDay: false, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { bortle: 4, minAlt: null, moonAware: false, viewFullDay: false };
}
function savePrefs() { try { localStorage.setItem('nightseam_prefs_v1', JSON.stringify(prefs)); } catch { /* ignore */ } }

/** parse decimal accepting comma (German locale), like num() in the original. */
export function num(s) {
  if (typeof s === 'number') return s;
  const v = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
}

/** Filter recommendation model - desktop parity (static/js/derive.js
 *  filterAdvice, pinned by the "advice" engine of tests/js/astro_parity.mjs):
 *  emission objects (nebula / SNR / planetary) need narrowband - any of Ha or
 *  OIII - and get a recommendation when none is owned; a broadband-only object
 *  only warns when the user owns narrowband but no broadband filter. Returns
 *  { ok, text } (text matches the desktop's badge text) or null.
 *  `prefs` overrides the stored preferences (used by the parity harness). */
export function filterAdvice(otype, prefs) {
  const p = prefs || getPrefs();
  const hasNB = !!(p.fltHa || p.fltOiii);
  const hasBB = !!p.fltBb;
  const t = otype;
  if (t === "nebula" || t === "supernova_remnant" || t === "planetary") {
    return hasNB ? { ok: true, text: "narrowband \u2713" }
                 : { ok: false, text: "narrowband" };
  }
  const broadbandOnly = t === "galaxy" || t === "open_cluster"
    || t === "globular" || t === "star_cloud" || t === "asterism";
  if (broadbandOnly && !hasBB && hasNB)
    return { ok: false, text: "broadband \u2717" };
  return null;
}

function wireEditor(box, p, onChanged) {
  const cvs = $('#pano-canvas', box);
  const ctx = cvs.getContext('2d');
  const profCvs = $('#pano-profile', box);
  const profCtx = profCvs.getContext('2d');
  const boxEl = $('#pano-box', box);

  let eraser = false;
  let gestureErase = false;   // right-button drag erases for the whole gesture
  let painting = false;
  let panning = false;
  let spaceDown = false;
  let panPrev = null;
  let imgEl = null;
  let imgErr = false;
  let mask = rebuildMask(p.strokes, wrapsFor(p));

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = MASK_W;
  maskCanvas.height = MASK_H;
  const maskCtx = maskCanvas.getContext('2d');

  const view = { zoom: 1, fx: null, fy: null };
  const hist = newHistory(p);
  let status = 'saved';                    // 'saved' | 'saving' | 'failed'
  const paintMode = () => p.paintMode;
  const paintRGB = () => (p.paintMode === 'obstacle' ? [255, 80, 80] : [120, 230, 140]);
  const dirty = () => historyDirty(hist, p);

  /* ---- DPR-aware sizing: the backing store follows the displayed size, so
   *      lines and labels stay sharp; all drawing stays in the 720x360 logical
   *      space, so the stored geometry and the pointer mapping never change. */
  function fitCanvas() {
    const w = Math.max(64, boxEl.clientWidth || MASK_W);
    const dpr = window.devicePixelRatio || 1;
    cvs.width = Math.round(w * dpr);
    cvs.height = Math.round((w / MASK_W) * MASK_H * dpr);
    profCvs.width = Math.round(w * dpr);
    profCvs.height = Math.round((w / MASK_W) * 56 * dpr);
    overlay();
  }

  function ctxTransform() {
    const sx = cvs.width / MASK_W, sy = cvs.height / MASK_H;
    const m = editorViewMatrix(MASK_W, MASK_H, view.zoom, view.fx, view.fy);
    ctx.setTransform(sx * m.a, 0, 0, sy * m.d, sx * m.e, sy * m.f);
  }

  function drawGrid(err) {
    ctx.fillStyle = '#0c1830';
    ctx.fillRect(0, 0, MASK_W, MASK_H);
    ctx.strokeStyle = 'rgba(124,196,255,.15)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const y = (i / 8) * MASK_H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MASK_W, y); ctx.stroke();
    }
    if (err) {
      ctx.fillStyle = 'rgba(255,190,107,.9)';
      ctx.font = '15px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('\uD83D\uDE15 could not decode this image (HEIC files need conversion)', MASK_W / 2, MASK_H / 2);
      ctx.textAlign = 'left';
    }
  }

  function loadImage() {
    imgEl = null; imgErr = false;
    if (p._img) {
      const img = new Image();
      img.onload = () => { imgEl = img; overlay(); };
      img.onerror = () => { imgErr = true; overlay(); };
      img.src = p._img;
    } else {
      overlay();
    }
  }

  function syncMaskCanvas() {
    maskCtx.setTransform(1, 0, 0, 1, 0, 0);
    maskCtx.clearRect(0, 0, MASK_W, MASK_H);
    const img = maskCtx.createImageData(MASK_W, MASK_H);
    const col = paintRGB();
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        const o = i * 4;
        img.data[o] = col[0];
        img.data[o + 1] = col[1];
        img.data[o + 2] = col[2];
        img.data[o + 3] = 165;
      }
    }
    maskCtx.putImageData(img, 0, 0);
  }

  function overlay() {
    ctxTransform();
    ctx.clearRect(0, 0, MASK_W, MASK_H);
    if (imgEl && imgEl.complete && imgEl.naturalWidth) drawImageCover(ctx, imgEl, MASK_W, MASK_H);
    else drawGrid(imgErr);
    syncMaskCanvas();
    ctx.drawImage(maskCanvas, 0, 0, MASK_W, MASK_H);
    drawGuides();
    drawProfile();
    renderStatus();
  }

  /** Guides use the SAME logical transform as the mask/calibration (they are
   *  drawn under ctxTransform), so a line that looks centered IS centered.
   *  Density rises with zoom; majors stay N/E/S/W + the horizon line. */
  function drawGuides() {
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    const altStep = view.zoom >= 3 ? 5 : 15;
    const azStep = view.zoom >= 3 ? 10 : 30;
    ctx.textAlign = 'left';
    ctx.font = '10px system-ui';
    const ab = Number(p.altBottom), at = Number(p.altTop);
    for (let alt = Math.ceil(ab / altStep) * altStep; alt <= at + 1e-6; alt += altStep) {
      const y = rowOfAlt(p, alt);
      if (y < 6 || y > MASK_H - 2) continue;
      const base = Math.abs(alt) < 1e-6;
      ctx.strokeStyle = base ? 'rgba(123,241,168,.6)' : 'rgba(124,196,255,.16)';
      ctx.lineWidth = base ? 1.4 : 1;
      ctx.setLineDash(base ? [7, 5] : []);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MASK_W, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = base ? 'rgba(123,241,168,.9)' : 'rgba(200,214,240,.7)';
      ctx.fillText((alt > 0 ? '+' : '') + alt + '\u00B0', 3, y - 3);
    }
    ctx.textAlign = 'center';
    const fov = Number(p.fov) || 360;
    const azOff = Number(p.azOffset) || 0;
    for (let a = Math.ceil(azOff / azStep) * azStep; a <= azOff + fov + 1e-6; a += azStep) {
      const x = xOfAz(p, a);
      if (x < -1 || x > MASK_W + 1) continue;
      const cardA = ((a % 360) + 360) % 360;
      const major = cardA % 90 === 0;
      ctx.strokeStyle = major ? 'rgba(255,209,102,.6)' : 'rgba(255,209,102,.22)';
      ctx.lineWidth = major ? 1.3 : 1;
      ctx.setLineDash(major ? [] : [3, 4]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MASK_H); ctx.stroke();
      ctx.setLineDash([]);
      const lab = major ? ['N', 'E', 'S', 'W'][cardA / 90] : cardA + '\u00B0';
      ctx.fillStyle = major ? '#ffd166' : 'rgba(255,209,102,.75)';
      ctx.font = major ? 'bold 11px system-ui' : '10px system-ui';
      ctx.fillText(lab, x, 13);
    }
    if (fov < 359.5) {
      const xc = xOfAz(p, azOff + fov / 2);
      if (xc >= 0 && xc <= MASK_W) {
        ctx.strokeStyle = 'rgba(255,255,255,.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(xc, 0); ctx.lineTo(xc, MASK_H); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        ctx.font = '10px system-ui';
        ctx.fillText('center', xc, MASK_H - 4);
      }
    }
    ctx.restore();
  }

  function drawProfile() {
    // Invariant: with no strokes the stored profile stays authoritative.
    if (p.strokes.length > 0) {
      const { prof, top } = profileFromMask(p, mask);
      p.profile = prof;
      p.profileTop = top;
    }
    const W = 720, H = 56;
    const sx = profCvs.width / W, sy = profCvs.height / H;
    profCtx.setTransform(sx, 0, 0, sy, 0, 0);
    profCtx.clearRect(0, 0, W, H);
    profCtx.fillStyle = '#081022';
    profCtx.fillRect(0, 0, W, H);
    const lo = Math.min(p.altBottom, 0);
    const hi = Math.max(p.altTop, 10);
    // preview geometry: the SAME shared transform as the desktop (one x per
    // 720 bins across the full width), so the sky band is the exact complement
    // of the blocked region and never self-intersects or wraps the seam.
    const azOff = 0, fov = 360;
    if (paintMode() === 'obstacle') {
      const segs = profileSegments(p.profile, W, H, lo, hi, azOff, fov, 90.5);
      profCtx.strokeStyle = '#ff6b6b';
      profCtx.lineWidth = 2;
      profCtx.beginPath();
      for (const s of segs) {
        s.forEach(([x, y], k) => (k ? profCtx.lineTo(x, y) : profCtx.moveTo(x, y)));
      }
      profCtx.stroke();
    } else {
      profCtx.fillStyle = 'rgba(120,230,140,.35)';
      for (const pts of skyBandPolygons(p, W, H, lo, hi, azOff, fov)) {
        profCtx.beginPath();
        pts.forEach(([x, y], k) => (k ? profCtx.lineTo(x, y) : profCtx.moveTo(x, y)));
        profCtx.closePath();
        profCtx.fill();
      }
      // hatch the assumed-open part above the painted band (parity with the
      // desktop mask view and the sky chart). The polygons are built in BIN
      // space - the same full-width transform as the band fill above.
      if (!p.blockAbove) {
        profCtx.save();
        profCtx.strokeStyle = 'rgba(210,225,255,.28)';
        profCtx.lineWidth = 1;
        for (const pts of assumedOpenHatchPolys(p, W, H, lo, hi)) {
          profCtx.save();
          profCtx.beginPath();
          pts.forEach(([x, y], k) => (k ? profCtx.lineTo(x, y) : profCtx.moveTo(x, y)));
          profCtx.closePath();
          profCtx.clip();
          const xs = pts.map((q) => q[0]);
          const minX = Math.min(...xs), maxX = Math.max(...xs);
          const diag = (maxX - minX) + H;
          for (let o = -diag; o < diag; o += 9) {
            profCtx.beginPath();
            profCtx.moveTo(minX + o, H);
            profCtx.lineTo(minX + o + diag, 0);
            profCtx.stroke();
          }
          profCtx.restore();
        }
        profCtx.restore();
      }
    }
    profCtx.fillStyle = 'rgba(127,151,184,.8)';
    profCtx.font = '9px system-ui';
    profCtx.fillText(lo.toFixed(0) + '\u00B0', 2, 53);
    profCtx.fillText(hi.toFixed(0) + '\u00B0', 2, 12);
    profCtx.fillText('profile \u2014 ' + paintMode() + ' \u00B7 alt ' + lo.toFixed(0) + '\u2026' + hi.toFixed(0) + '\u00B0', 540, 12);
  }

  function renderStatus() {
    const undoBtn = $('#ed-undo', box), redoBtn = $('#ed-redo', box);
    if (undoBtn) undoBtn.disabled = !historyCanUndo(hist);
    if (redoBtn) redoBtn.disabled = !historyCanRedo(hist);
    const zl = $('#ed-zoom-label', box);
    if (zl) zl.textContent = view.zoom.toFixed(1) + '\u00D7';
    const el = $('#ed-status', box);
    if (el) {
      const d = dirty();
      el.textContent = status === 'saving' ? 'Saving\u2026'
        : status === 'failed' ? 'Save failed'
        : d ? '\u25CF Unsaved changes' : 'Saved';
      el.classList.toggle('dirty', d && status === 'saved');
      el.classList.toggle('failed', status === 'failed');
    }
    const save = $('#ed-save', box);
    if (save) save.classList.toggle('primary', dirty());
  }

  const rebuildMaskNow = () => { mask = rebuildMask(p.strokes, wrapsFor(p)); };

  function commit() { historyCommit(hist, p); renderStatus(); }

  function doUndo() {
    if (!historyUndo(hist, p)) return;
    rebuildMaskNow();
    overlay();
    renderStatus();
  }
  function doRedo() {
    if (!historyRedo(hist, p)) return;
    rebuildMaskNow();
    overlay();
    renderStatus();
  }
  function revertSession() {
    if (!dirty()) return;
    applySnapshot(p, hist.baseline);
    rebuildMaskNow();
    overlay();
    commit();               // the revert itself is undoable
  }
  function saveSession() {
    status = 'saving';
    renderStatus();
    try {
      computeProfile(p);    // derive from strokes (or keep the stored profile)
      updatePano(p);        // the ONE persistence path (localStorage)
      historyMarkSaved(hist, p);
      status = 'saved';
      onChanged();
    } catch (e) {
      status = 'failed';
    }
    renderStatus();
  }

  async function doClear() {
    const ok = await confirmDialog(box, {
      title: 'Clear horizon?',
      body: 'Remove all paint from this horizon; the profile becomes open sky. You can undo this.',
      ok: 'Clear',
    });
    if (!ok) return;
    clearMask(p);
    rebuildMaskNow();
    overlay();
    commit();
  }

  /* ---- pointer: paint (left), pan (middle / Space+drag), readout ---- */
  const toCanvas = (ev) => {
    const r = cvs.getBoundingClientRect();
    const sx = (ev.clientX - r.left) / r.width * MASK_W;
    const sy = (ev.clientY - r.top) / r.height * MASK_H;
    return editorScreenToBase(MASK_W, MASK_H, view.zoom, view.fx, view.fy, sx, sy);
  };
  const strokeAt = (x, y, forceErase = false) => {
    const r = Number($('#ed-brush', box).value);
    p.strokes.push({ m: (forceErase || eraser) ? 'e' : 'b', x, y, r });
    rebuildMaskNow();
    overlay();
  };
  const updateReadout = (ev) => {
    const el = $('#ed-pos', box);
    if (!el) return;
    const [x, y] = toCanvas(ev);
    const az = azOfX(p, x), alt = altOf(p, y);
    const outside = (x < 0 || x > MASK_W || y < 0 || y > MASK_H);
    el.textContent = `az ${az.toFixed(1)}\u00B0 ${cardinal(az)} \u00B7 alt `
      + `${alt >= 0 ? '+' : ''}${alt.toFixed(1)}\u00B0`
      + (outside ? ' \u00B7 outside image' : '');
  };
  const setPanCursor = (on) => cvs.classList.toggle('panning', on);

  cvs.addEventListener('pointerdown', (ev) => {
    cvs.focus();
    const wantPan = ev.button === 1 || (ev.button === 0 && spaceDown);
    if (wantPan) {
      panning = true;
      panPrev = { x: ev.clientX, y: ev.clientY };
      cvs.setPointerCapture(ev.pointerId);
      setPanCursor(true);
      ev.preventDefault();
      return;
    }
    if (ev.button === 2) {
      // hold the right button to erase continuously (one history entry for the
      // whole gesture); the context menu is suppressed below
      painting = true;
      gestureErase = true;
      cvs.setPointerCapture(ev.pointerId);
      const [x, y] = toCanvas(ev);
      strokeAt(x, y, true);
      ev.preventDefault();
      return;
    }
    if (ev.button !== 0) return;
    painting = true;
    gestureErase = false;
    cvs.setPointerCapture(ev.pointerId);
    const [x, y] = toCanvas(ev);
    strokeAt(x, y);
    ev.preventDefault();
  });
  cvs.addEventListener('pointermove', (ev) => {
    updateReadout(ev);
    if (panning) {
      const r = cvs.getBoundingClientRect();
      const dx = (ev.clientX - panPrev.x) / r.width * MASK_W;
      const dy = (ev.clientY - panPrev.y) / r.height * MASK_H;
      const cx = view.fx == null ? MASK_W / 2 : view.fx;
      const cy = view.fy == null ? MASK_H / 2 : view.fy;
      [view.fx, view.fy] = editorClampFocus(
        MASK_W, MASK_H, view.zoom, cx - dx / view.zoom, cy - dy / view.zoom);
      panPrev = { x: ev.clientX, y: ev.clientY };
      overlay();
      return;
    }
    if (!painting) return;
    const [x, y] = toCanvas(ev);
    strokeAt(x, y, gestureErase);
  });
  const endPan = () => {
    if (!panning) return;
    panning = false;
    panPrev = null;
    setPanCursor(false);
  };
  cvs.addEventListener('pointerleave', () => {
    const el = $('#ed-pos', box);
    if (el) el.textContent = 'az \u2014 \u00B7 alt \u2014';
  });
  cvs.addEventListener('pointerup', () => {
    endPan();
    if (!painting) return;
    painting = false;
    gestureErase = false;
    commit();               // one history entry per gesture; persists only on Save
  });
  cvs.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();    // the right-button drag (above) already erased
  });

  function zoomTo(z, ax, ay) {
    const nz = editorClampZoom(z);
    if (nz === view.zoom) return;
    if (ax != null) {
      const r = cvs.getBoundingClientRect();
      const sx = ax / r.width * MASK_W, sy = ay / r.height * MASK_H;
      const [bx, by] = editorScreenToBase(MASK_W, MASK_H, view.zoom, view.fx, view.fy, sx, sy);
      view.zoom = nz;
      view.fx = bx - (sx - MASK_W / 2) / nz;
      view.fy = by - (sy - MASK_H / 2) / nz;
    } else {
      view.zoom = nz;
    }
    [view.fx, view.fy] = editorClampFocus(MASK_W, MASK_H, view.zoom, view.fx, view.fy);
    overlay();
    renderStatus();
  }
  cvs.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const r = cvs.getBoundingClientRect();
    zoomTo(view.zoom * (ev.deltaY < 0 ? 1.25 : 0.8),
           ev.clientX - r.left, ev.clientY - r.top);
  }, { passive: false });
  $('#ed-zoom-in', box).addEventListener('click', () => zoomTo(view.zoom * 1.25));
  $('#ed-zoom-out', box).addEventListener('click', () => zoomTo(view.zoom * 0.8));
  $('#ed-fit', box).addEventListener('click', () => {
    view.zoom = 1; view.fx = null; view.fy = null;
    overlay();
    renderStatus();
  });

  $('#ed-eraser', box).addEventListener('click', (ev) => {
    eraser = !eraser;
    ev.target.classList.toggle('on', eraser);
    ev.target.setAttribute('aria-pressed', String(eraser));
  });
  $('#ed-undo', box).addEventListener('click', doUndo);
  $('#ed-redo', box).addEventListener('click', doRedo);
  $('#ed-revert', box).addEventListener('click', revertSession);
  $('#ed-clear', box).addEventListener('click', doClear);
  $('#ed-save', box).addEventListener('click', saveSession);

  // calibration sliders: live preview on input, ONE history entry on release
  const calApply = () => {
    p.azOffset = clampNum($('#ed-az', box).value, 0, 360, 0);
    p.altBottom = clampNum($('#ed-ab', box).value, -30, 90, 0);
    p.altTop = clampNum($('#ed-at', box).value, -30, 90, 60);
    p.fov = clampNum($('#ed-fov', box).value, 5, 360, 360);
    if (p.altTop <= p.altBottom) p.altTop = p.altBottom + 5;
    const at = $('#ed-at', box);
    at.min = String(Math.min(90, p.altBottom + 5));
    at.value = String(p.altTop);
    $('#ed-az-v', box).textContent = p.azOffset + '\u00B0';
    $('#ed-ab-v', box).textContent = p.altBottom + '\u00B0';
    $('#ed-at-v', box).textContent = p.altTop + '\u00B0';
    $('#ed-fov-v', box).textContent = p.fov + '\u00B0';
    rebuildMaskNow();       // fov change toggles seam wrap
    overlay();
  };
  ['ed-az', 'ed-ab', 'ed-at', 'ed-fov'].forEach((id) => {
    const el = $('#' + id, box);
    el.addEventListener('input', calApply);
    el.addEventListener('change', () => { calApply(); commit(); });
  });
  $('#ed-mode', box).addEventListener('change', (ev) => {
    p.paintMode = ev.target.value;
    rebuildMaskNow();
    overlay();
    commit();
  });
  // "block above band": opt OUT of the default open-above assumption. Re-derives
  // the profile ceiling immediately (and is undoable like any other edit).
  $('#ed-block-above', box).addEventListener('change', (ev) => {
    p.blockAbove = !!ev.target.checked;
    renderStatus();
    overlay();
    commit();
  });

  if (undoHandler) document.removeEventListener('keydown', undoHandler);
  undoHandler = (ev) => {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    const k = ev.key.toLowerCase();
    const isUndo = k === 'z' && !ev.shiftKey;
    const isRedo = (k === 'z' && ev.shiftKey) || k === 'y';
    if (!isUndo && !isRedo) return;
    if (!document.querySelector('#pano-canvas') || !box.contains(document.activeElement)) return;
    ev.preventDefault();
    if (isUndo) doUndo(); else doRedo();
  };
  document.addEventListener('keydown', undoHandler);

  // Space = temporary pan tool (only while the editor has focus)
  const spaceKeys = (ev) => {
    if (ev.code !== 'Space') return;
    if (!box.contains(document.activeElement)) return;
    spaceDown = ev.type === 'keydown';
    setPanCursor(spaceDown);
    if (spaceDown) ev.preventDefault();   // do not scroll the page
  };
  document.addEventListener('keydown', spaceKeys);
  document.addEventListener('keyup', spaceKeys);

  // swap out any ResizeObserver from the previous editor, then observe this one
  if (activeSession && activeSession.disconnect) activeSession.disconnect();
  activeSession = { dirty, revert: revertSession, save: saveSession };
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => fitCanvas());
    ro.observe(boxEl);
    activeSession.disconnect = () => ro.disconnect();
  } else {
    activeSession.disconnect = null;
  }

  fitCanvas();
  loadImage();
  renderStatus();
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