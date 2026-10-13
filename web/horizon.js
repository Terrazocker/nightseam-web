/*
 * NightSeam Web - Horizon editor, horizon storage and shared preferences.
 *
 * A horizon is a skyline on a compass grid (core/horizon.js): points of
 * azimuth/altitude joined by straight lines around the circle. A photo can sit
 * underneath as a tracing aid; moving it moves the skyline with it. Records
 * live in localStorage, photo bytes in IndexedDB. Every finished edit saves
 * automatically; undo/redo and the dirty state come from
 * core/horizonhistory.js. This module also owns the planner preferences.
 */
import { vizTheme } from './viztheme.js?v=7';
import { normalizeWebPrefs, WEB_PREF_DEFAULTS, wallFieldsToUtc, utcToWall } from './webstore.js?v=73';
import {
  NO_BLOCK, ALT_MIN, ALT_MAX, MAX_POINTS,
  wrapAz, azDelta, normalizePoints, normalizePhotoPlacement, normalizeHorizon,
  withProfile, ceilFor, replacePointsInRange, simplifyLine, detectSkylineRows,
  photoToWorld, worldToPhoto, reprojectPoints, headingForLandmark,
  normalizeOverhang, normalizeOverhangs, replaceOverhangsInRange, flatOverhang, reprojectOverhangs,
  photoCaptureTime, sunDirection, placementFromKnownDirection, devicePointing, julianDay,
  defaultPhotoPlacement, photoFileDimensions, parseHorizonFile, formatHorizonFile,
  effectiveMinAlt as coreMinAlt,
  newHistory, historyCommit, historyCanUndo, historyCanRedo, historyUndo,
  historyRedo, historyMarkSaved, historyDirty,
  PLANNER_CHANGE_EVENT, nextPlannerRevision, plannerChange, panoramaRevision,
} from './core.js?v=67';

export { NO_BLOCK, ceilFor };

const LS_KEY = 'nightseam_horizons_v2';
const PREFS_KEY = 'nightseam_prefs_v1';
const PHOTO_DB = 'nightseam-horizon-photos';
// Storage of the retired panorama editor. Its records are not converted.
const LEGACY_LS_KEY = 'nightseam_panos_v1';
const LEGACY_PHOTO_DB = 'nightseam-panoimg';
export const MAX_HORIZONS = 50;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_IMPORT_BYTES = 1024 * 1024;
const DETECT_WIDTH = 720;
const COMPASS_WAIT_MS = 3000;

/** The planner's active site ({ lat, lon, label, tz }), provided by app.js. */
let siteContext = () => null;

/* ------------------------------ planner events ------------------------------ */

let plannerRevision = 0;

/** Publish the shared planner invalidation contract for this web shell. */
export function announcePlannerChange(kind, fields = {}) {
  plannerRevision = nextPlannerRevision(plannerRevision);
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function'
      || typeof CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(PLANNER_CHANGE_EVENT, {
    detail: plannerChange(kind, plannerRevision, fields),
  }));
}

function announceHorizonChanged(h, cause = 'edit') {
  announcePlannerChange('horizon', {
    cause,
    horizonId: h ? h.id : null,
    horizonRevision: panoramaRevision(h),
  });
}

/* ------------------------------- photo storage ------------------------------- */

function photoDbOpen() {
  return new Promise((resolve, reject) => {
    try {
      const rq = indexedDB.open(PHOTO_DB, 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore('photos'); };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
      rq.onblocked = () => reject(new Error('Horizon photo storage is blocked by another tab'));
    } catch (e) { reject(e); }
  });
}

async function photoRequest(mode, operation) {
  const dbh = await photoDbOpen();
  try {
    return await new Promise((resolve, reject) => {
      const tx = dbh.transaction('photos', mode);
      let result = null;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || new Error('Horizon photo transaction aborted'));
      tx.onerror = () => {}; // onabort owns transaction failure, including commit failure
      try {
        const rq = operation(tx.objectStore('photos'));
        rq.onsuccess = () => { result = rq.result ?? null; };
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  } finally { dbh.close(); }
}
const photoGet = (id) => photoRequest('readonly', (store) => store.get(id));
const photoSet = (id, blob) => photoRequest('readwrite', (store) => store.put(blob, id));
const photoDel = (id) => photoRequest('readwrite', (store) => store.delete(id));

/** Decoded photos for this session: id -> { blob, img, url, width, height }. */
const photos = new Map();

function forgetPhoto(id) {
  const entry = photos.get(id);
  if (entry && entry.url && typeof URL !== 'undefined') URL.revokeObjectURL(entry.url);
  photos.delete(id);
}

async function decodePhoto(blob) {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try { await img.decode(); } catch (error) {
    URL.revokeObjectURL(url);
    throw new Error('The photo could not be decoded.');
  }
  return { blob, img, url, width: img.naturalWidth, height: img.naturalHeight };
}

/** The decoded photo of a horizon, or null when it has none or it is missing. */
async function loadPhoto(h) {
  if (!h || !h.hasPhoto) return null;
  if (photos.has(h.id)) return photos.get(h.id);
  const blob = await photoGet(h.id).catch(() => null);
  if (!(blob instanceof Blob) || !blob.size) return null;
  const entry = await decodePhoto(blob).catch(() => null);
  if (entry) photos.set(h.id, entry);
  return entry;
}

/* ------------------------------ horizon records ------------------------------ */

function removeLegacyStorage() {
  try { localStorage.removeItem(LEGACY_LS_KEY); } catch { /* ignore */ }
  try { if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase(LEGACY_PHOTO_DB); } catch { /* ignore */ }
}

function load() {
  removeLegacyStorage();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      const seen = new Set();
      const horizons = (Array.isArray(d.horizons) ? d.horizons : [])
        .map((h) => normalizeHorizon(h))
        .filter((h) => h && !seen.has(h.id) && seen.add(h.id))
        .slice(0, MAX_HORIZONS)
        .map(withProfile);
      const activeId = seen.has(d.activeId) ? d.activeId : (horizons[0]?.id ?? null);
      return { horizons, activeId };
    }
  } catch { /* ignore */ }
  return { horizons: [], activeId: null };
}

const stored = (h) => ({ id: h.id, name: h.name, points: h.points, overhangs: h.overhangs || [],
  photo: h.photo, hasPhoto: !!h.hasPhoto });

/** Persist records (never photo bytes or derived profiles). Returns false on a
 *  storage failure; callers must surface it rather than claim "Saved". */
function save(state = db) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      horizons: state.horizons.map(stored), activeId: state.activeId,
    }));
    return true;
  } catch { return false; }
}

let db = load();

// Two open tabs would overwrite each other's horizons: a change made in
// another tab reloads this one before any further edit.
if (typeof addEventListener === 'function') {
  addEventListener('storage', (e) => {
    if (e && (e.key === LS_KEY || e.key === PREFS_KEY)) location.reload();
  });
}

export function allHorizons() { return db.horizons; }
export function activeHorizon() { return db.horizons.find((h) => h.id === db.activeId) || null; }

function newId() {
  let id;
  do { id = 'h' + Math.random().toString(36).slice(2, 10); } while (db.horizons.some((h) => h.id === id));
  return id;
}

function uniqueName(base) {
  const names = new Set(db.horizons.map((h) => h.name));
  if (!names.has(base)) return base;
  for (let n = 2; ; n++) if (!names.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** Create a horizon, make it active and save. Returns it, or null when the
 *  limit is reached or storage fails. */
function createHorizon(name, fields = {}) {
  if (db.horizons.length >= MAX_HORIZONS) return null;
  const h = withProfile(normalizeHorizon({ id: newId(), name: uniqueName(name), ...fields }));
  h.hasPhoto = !!fields.hasPhoto && !!h.photo;
  const previous = db.activeId;
  db.horizons.push(h);
  db.activeId = h.id;
  if (!save()) {
    db.horizons.pop();
    db.activeId = previous;
    return null;
  }
  announceHorizonChanged(h, 'create');
  return h;
}

function setActive(id) {
  db.activeId = id;
  save();
  announceHorizonChanged(activeHorizon(), 'activate');
}

function deleteHorizon(id) {
  db.horizons = db.horizons.filter((h) => h.id !== id);
  if (db.activeId === id) db.activeId = db.horizons.length ? db.horizons[0].id : null;
  const ok = save();
  forgetPhoto(id);
  photoDel(id).catch(() => {}); // an orphaned photo does not affect planning
  announceHorizonChanged(activeHorizon(), 'delete');
  return ok;
}

/* ------------------------------ backup and restore ------------------------------ */

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    try {
      const rd = new FileReader();
      rd.onload = () => typeof rd.result === 'string'
        ? resolve(rd.result) : reject(new Error('Could not encode horizon photo'));
      rd.onerror = () => reject(rd.error || new Error('Could not read horizon photo'));
      rd.readAsDataURL(blob);
    } catch (error) { reject(error); }
  });
}

function dataUrlBytes(dataUrl) {
  // Decode locally: fetch(data:) is subject to connect-src.
  const m = typeof dataUrl === 'string'
    ? /^data:(image\/(?:jpeg|png))(;base64)?,([\s\S]*)$/i.exec(dataUrl) : null;
  if (!m) throw new Error('Invalid horizon photo data URL');
  const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  if (!bin.length) throw new Error('Horizon photo is empty');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return { type: m[1].toLowerCase(), bytes: arr };
}

function dataUrlToBlob(dataUrl) {
  const { type, bytes } = dataUrlBytes(dataUrl);
  return new Blob([bytes], { type });
}

/** Backup section with every stored photo embedded as a data URL. A photo that
 *  should exist but cannot be read fails the backup: a safety snapshot must
 *  not silently omit data needed for rollback. */
export async function exportHorizonsWithPhotos() {
  const horizons = [];
  for (const h of db.horizons) {
    const rec = stored(h);
    if (h.hasPhoto) {
      const blob = photos.get(h.id)?.blob || await photoGet(h.id);
      if (!(blob instanceof Blob) || !blob.size) {
        throw new Error(`The photo of horizon ${h.name} is missing or unreadable; backup cancelled`);
      }
      rec.image = await blobToDataUrl(blob);
    }
    horizons.push(rec);
  }
  return { horizons, activeId: db.activeId };
}

/** Validate a backup's horizon section into a canonical snapshot (pure).
 *  Returns null when anything in it is malformed: ids, points, placements,
 *  duplicates or photo bytes. `hasPhoto` is true only for embedded bytes. */
export function normalizeHorizons(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.horizons)) return null;
  if (data.horizons.length > MAX_HORIZONS) return null;
  try {
    const seen = new Set();
    const horizons = data.horizons.map((raw) => {
      const image = raw && raw.image != null ? raw.image : null;
      const rec = normalizeHorizon({ ...raw, hasPhoto: image != null }, true);
      if (seen.has(rec.id)) throw new Error('duplicate horizon id');
      seen.add(rec.id);
      if (image != null) {
        if (!rec.photo) throw new Error('a horizon photo needs a placement');
        photoFileDimensions(dataUrlBytes(image).bytes.subarray(0, 1048576));
        rec.image = image;
      }
      return withProfile(rec);
    });
    const activeId = seen.has(data.activeId) ? data.activeId : (horizons[0]?.id ?? null);
    return { horizons, activeId };
  } catch { return null; }
}

/** Replace all horizons and photos with a normalized snapshot. Resolves true
 *  after the photo transaction and the record write both committed, false on
 *  an ordinary failure (nothing changed). A failed rollback throws. */
export async function applyHorizonsSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.horizons)) return false;
  const pending = [];
  let candidate;
  try {
    candidate = {
      horizons: snapshot.horizons.map((h) => {
        if (h.image) pending.push([h.id, dataUrlToBlob(h.image)]);
        const rec = withProfile(normalizeHorizon(stored(h), true));
        rec.hasPhoto = !!h.image && !!rec.photo;
        return rec;
      }),
      activeId: snapshot.activeId || null,
    };
  } catch { return false; }
  if (!candidate.horizons.some((h) => h.id === candidate.activeId)) {
    candidate.activeId = candidate.horizons[0]?.id ?? null;
  }
  // Without photos on either side, photo storage is not involved at all (it
  // may be unavailable, e.g. in some private windows).
  if (!pending.length && !db.horizons.some((h) => h.hasPhoto)) {
    if (!save(candidate)) return false;
    replaceAll(candidate);
    return true;
  }
  let dbh, previousRaw, wroteRecords = false, rollbackError = null;
  try {
    previousRaw = localStorage.getItem(LS_KEY);
    dbh = await photoDbOpen();
    await new Promise((resolve, reject) => {
      const tx = dbh.transaction('photos', 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror = () => {};
      tx.onabort = () => {
        // IndexedDB rolls the photos back; restore the record half too.
        if (wroteRecords) {
          try {
            if (previousRaw === null) localStorage.removeItem(LS_KEY);
            else localStorage.setItem(LS_KEY, previousRaw);
          } catch (error) { rollbackError = error; }
        }
        reject(tx.error || new Error('Horizon restore transaction aborted'));
      };
      try {
        const store = tx.objectStore('photos');
        let last = store.clear();
        for (const [id, blob] of pending) last = store.put(blob, id);
        // Runs while the transaction can still be aborted.
        last.onsuccess = () => {
          if (!save(candidate)) { tx.abort(); return; }
          wroteRecords = true;
        };
      } catch (error) { tx.abort(); reject(error); }
    });
  } catch (error) {
    if (rollbackError) throw new AggregateError([error, rollbackError], 'Horizon restore failed and its records could not be rolled back');
    return false;
  } finally { if (dbh) dbh.close(); }
  replaceAll(candidate);
  return true;
}

function replaceAll(candidate) {
  for (const id of [...photos.keys()]) forgetPhoto(id);
  db = candidate;
  // The open editor still references a replaced record; a later flush must
  // not save that obsolete session over the restored data.
  if (activeSession && activeSession.disconnect) activeSession.disconnect();
  activeSession = null;
  announceHorizonChanged(activeHorizon(), 'restore');
}

/* ------------------------------ editor session ------------------------------ */

let activeSession = null;   // { horizonId, hist, dirty, save, settle, disconnect }

/** True when the open editor has edits not yet persisted. */
export function horizonUnsaved() {
  return !!(activeSession && activeSession.dirty());
}

/** Persist pending editor edits (a no-op when clean). */
export function flushHorizonEdits() {
  if (activeSession && activeSession.dirty()) activeSession.save();
}

/** Keep the editor's undo history across a failed whole-app restore. */
export function captureEditorHistory() {
  if (!activeSession || !activeSession.hist) return null;
  activeSession.settle?.();
  return { horizonId: activeSession.horizonId, hist: JSON.parse(JSON.stringify(activeSession.hist)) };
}

/** Reattach a history checkpoint after the horizons were rolled back. The next
 *  render wires fresh controls around this same history. */
export function restoreEditorHistory(checkpoint) {
  if (!checkpoint || !checkpoint.hist) return false;
  const h = db.horizons.find((item) => item.id === checkpoint.horizonId);
  if (!h) return false;
  if (activeSession && activeSession.disconnect) activeSession.disconnect();
  const hist = JSON.parse(JSON.stringify(checkpoint.hist));
  activeSession = {
    horizonId: h.id, record: h, hist,
    dirty: () => historyDirty(hist, h),
    save: () => {
      withProfile(h);
      if (!save()) return false;
      historyMarkSaved(hist, h);
      return true;
    },
  };
  return true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (ev) => {
    if (activeSession && activeSession.dirty()) {
      ev.preventDefault();
      ev.returnValue = '';
      return '';
    }
  });
}

/* ------------------------------ preferences ------------------------------ */

let prefs = loadPrefs();
export function getPrefs() { return prefs; }
export const effectiveMinAlt = () => coreMinAlt(prefs.bortle, prefs.minAlt);

/** Patch preferences for ordinary UI edits. Failed writes leave live state intact. */
export function setPrefs(patch) {
  const candidate = normalizeWebPrefs({ ...prefs, ...patch });
  if (!savePrefs(candidate)) return false;
  prefs = candidate;
  return true;
}

/** Restore is replacement: absent preferences regain defaults instead of
 *  inheriting settings from the current browser. */
export function replacePrefs(value) {
  const candidate = normalizeWebPrefs({ ...WEB_PREF_DEFAULTS, ...value });
  if (!savePrefs(candidate)) return false;
  prefs = candidate;
  return true;
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return normalizeWebPrefs({ ...WEB_PREF_DEFAULTS, ...JSON.parse(raw) });
  } catch { /* ignore */ }
  return normalizeWebPrefs(WEB_PREF_DEFAULTS);
}

function savePrefs(value) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(value));
    return true;
  } catch { return false; }
}

/** Parse a decimal, accepting a comma (German locale). */
export function num(s) {
  if (typeof s === 'number') return s;
  const v = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
}

/** Filter recommendation: emission objects (nebula / SNR / planetary) need
 *  narrowband - Ha or OIII - and get a recommendation when none is owned; a
 *  broadband-only object only warns when the user owns narrowband but no
 *  broadband filter. Returns { ok, text } or null. `prefs` overrides the
 *  stored preferences (used by the parity harness). */
export function filterAdvice(otype, prefsOverride) {
  const p = prefsOverride || getPrefs();
  const hasNB = !!(p.fltHa || p.fltOiii);
  const hasBB = !!p.fltBb;
  const t = otype;
  if (t === 'nebula' || t === 'supernova_remnant' || t === 'planetary') {
    return hasNB ? { ok: true, text: 'narrowband ✓' } : { ok: false, text: 'narrowband' };
  }
  const broadbandOnly = t === 'galaxy' || t === 'open_cluster'
    || t === 'globular' || t === 'star_cloud' || t === 'asterism';
  if (broadbandOnly && !hasBB && hasNB) return { ok: false, text: 'broadband ✗' };
  return null;
}

/* --------------------------------- editor UI --------------------------------- */

const $ = (s, root) => (root || document).querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                   'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const cardinal = (az) => CARDINALS[Math.round(wrapAz(az) / 22.5) % 16];
const fmt = (v) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');

/* The grid: azimuth 0-360 across, altitude VIEW_ALT_MIN..VIEW_ALT_MAX up. */
const VIEW_ALT_MIN = -10;
const VIEW_ALT_MAX = 80;
const VIEW_ALT_SPAN = VIEW_ALT_MAX - VIEW_ALT_MIN;
const ZOOM_MIN = 1;
const ZOOM_MAX = 12;
const MARGIN = { l: 40, t: 24, r: 8, b: 8 };
const HIT_PX = 9;

/** Presentation state that survives re-rendering the same horizon. */
const ui = {
  id: null, mode: 'draw', zoom: 1, fx: 180, fy: 30, selected: -1, ohSel: null,
  opacity: 0.8, grid: true, guideFor: null, landmark: null, sun: null, compassOffset: 0,
  openPanels: { points: false, display: false, compass: false },
};

/** Clamp the view focus so the visible window stays inside the grid. */
export function clampView(zoom, fx, fy) {
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
  const hw = 180 / z, hh = VIEW_ALT_SPAN / (2 * z);
  return {
    zoom: z,
    fx: Math.max(hw, Math.min(360 - hw, fx)),
    fy: Math.max(VIEW_ALT_MIN + hh, Math.min(VIEW_ALT_MAX - hh, fy)),
  };
}

/** One-sentence description of a horizon for assistive technology. */
export function describeHorizon(h) {
  const overhangs = (h && h.overhangs) || [];
  let text;
  if (!h || !h.points.length) {
    text = 'No skyline yet: nothing is blocked from below. Click the grid to add points, or drag across it to sketch the skyline.';
  } else {
    let hi = h.points[0], lo = h.points[0];
    for (const p of h.points) { if (p.alt > hi.alt) hi = p; if (p.alt < lo.alt) lo = p; }
    text = `${h.points.length} skyline point${h.points.length === 1 ? '' : 's'}. `
      + `Highest obstruction ${fmt(hi.alt)}° toward ${cardinal(hi.az)} (${fmt(hi.az)}°); `
      + `lowest ${fmt(lo.alt)}° toward ${cardinal(lo.az)} (${fmt(lo.az)}°).`;
  }
  if (!overhangs.length) return text;
  let low = overhangs[0][0];
  for (const line of overhangs) for (const p of line) if (p.alt < low.alt) low = p;
  const spans = overhangs.map((line) => `${fmt(line[0].az)}–${fmt(line[line.length - 1].az)}°`).join(', ');
  return `${text} ${overhangs.length} overhang${overhangs.length === 1 ? '' : 's'} (${spans}) block the sky above them; `
    + `the lowest edge is ${fmt(low.alt)}° toward ${cardinal(low.az)}.`;
}

/** Small in-page confirm dialog (never a blocking browser alert/confirm). */
function confirmDialog(box, { title, body, ok, cancel = 'Cancel' }) {
  return new Promise((resolve) => {
    const before = document.activeElement;
    const el = document.createElement('div');
    el.className = 'ed-confirm';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'ed-confirm-title');
    el.innerHTML = `
      <div class="ed-confirm-box">
        <h4 id="ed-confirm-title">${esc(title)}</h4>
        <p>${esc(body)}</p>
        <div class="btnrow">
          <button class="btn" type="button" data-cancel>${esc(cancel)}</button>
          <button class="btn primary" type="button" data-ok>${esc(ok)}</button>
        </div>
      </div>`;
    const done = (v) => {
      el.remove();
      if (before && before.isConnected && typeof before.focus === 'function') before.focus();
      resolve(v);
    };
    el.querySelector('[data-cancel]').addEventListener('click', () => done(false));
    el.querySelector('[data-ok]').addEventListener('click', () => done(true));
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') done(false);
      if (ev.key === 'Tab') {   // keep focus inside the dialog
        const buttons = [...el.querySelectorAll('button')];
        const i = buttons.indexOf(document.activeElement);
        ev.preventDefault();
        buttons[(i + (ev.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
      }
    });
    el.addEventListener('click', (ev) => { if (ev.target === el) done(false); });
    (box || document.body).appendChild(el);
    el.querySelector('[data-ok]').focus();
  });
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const fileSlug = (name) => (String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'horizon');

/** Check an uploaded photo and decode it. Throws with a plain message. */
async function readPhotoFile(file) {
  if (!file || !/^image\/(jpeg|png)$/i.test(file.type || '')) throw new Error('Pick a JPEG or PNG photo.');
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`That photo is ${(file.size / 1048576).toFixed(1)} MB; the limit is 25 MB.`);
  }
  photoFileDimensions(new Uint8Array(await file.slice(0, 1048576).arrayBuffer()));
  return decodePhoto(file);
}

/**
 * Horizon tab. `box` is the #view container; `onChanged` runs after a change
 * that other views should notice (they also listen to planner events).
 */
export function renderHorizon(box, onChanged = () => {}, context = {}) {
  if (typeof context.site === 'function') siteContext = context.site;
  const h = activeHorizon();
  if (!h || ui.id !== h.id) {
    Object.assign(ui, { id: h ? h.id : null, mode: 'draw', zoom: 1, fx: 180, fy: 30, selected: -1,
      ohSel: null, landmark: null, sun: null });
    // Open a partial photo zoomed to itself rather than as a sliver of the circle.
    if (h && h.photo && h.photo.width < 360) {
      Object.assign(ui, clampView(Math.min(3, 360 / (h.photo.width * 1.4)), h.photo.heading, h.photo.tilt + 12));
    }
  }
  const row = (item) => `
    <li data-id="${esc(item.id)}">
      <input type="radio" name="hz-active" id="hz-r-${esc(item.id)}" ${h && item.id === h.id ? 'checked' : ''}>
      <label class="p-name" for="hz-r-${esc(item.id)}">${esc(item.name)}</label>
      <span class="p-tags">${item.points.length} pt${item.hasPhoto ? ' · photo' : ''}</span>
      <button class="btn small" type="button" data-del="${esc(item.id)}" aria-label="Delete horizon ${esc(item.name)}">🗑</button>
    </li>`;
  box.innerHTML = `
    <div class="horizon-layout">
      <aside class="horizon-tools-rail" aria-label="Horizons">
        <div class="card">
          <h3>Your horizons</h3>
          <ul class="pick" id="hz-list" aria-label="Horizon used for planning">${db.horizons.length
            ? db.horizons.map(row).join('') : '<li class="hz-empty">No horizon yet. Without one, only the minimum altitude limits the sky.</li>'}</ul>
          <div class="hz-new">
            <label class="btn primary" for="hz-photo-file" role="button" tabindex="0">📷 New from photo</label>
            <button class="btn" type="button" id="hz-new-draw">✏ Draw by hand</button>
            <label class="btn" for="hz-import-file" role="button" tabindex="0">⬆ Import file</label>
          </div>
          <input type="file" id="hz-photo-file" accept="image/jpeg,image/png" class="vhidden" hidden tabindex="-1">
          <input type="file" id="hz-import-file" accept=".txt,.hrz,.csv,text/plain" class="vhidden" hidden tabindex="-1">
          <p class="sub" id="hz-note" role="status" aria-live="polite">Horizons and photos stay in this browser. Changes save automatically.</p>
        </div>
      </aside>
      ${h ? editorHTML(h) : `<section class="horizon-stage" aria-label="Horizon editor">
        <h3 class="horizon-editor-title">Horizon editor</h3>
        <p class="sub">A horizon is the skyline your trees and roofs make. Start from a photo of it, draw it by hand on a compass grid, or import a Stellarium or N.I.N.A. horizon file.</p>
      </section>`}
    </div>`;
  const sp = $('.splash', box);
  if (sp) sp.style.display = 'none';
  wireList(box, onChanged);
  if (h) wireEditor(box, h, onChanged);
  else if (activeSession) { activeSession.disconnect?.(); activeSession = null; }
}

function editorHTML(h) {
  return `
    <section class="horizon-stage" aria-label="Horizon editor">
      <div class="hz-head">
        <label class="hz-name">Name <input id="hz-name" type="text" maxlength="80" value="${esc(h.name)}"></label>
        <button class="btn small" type="button" id="hz-export" title="Save as a plain azimuth/altitude text file">⬇ Export file</button>
      </div>
      <div class="ed-tools" role="toolbar" aria-label="Horizon editing">
        <div class="ed-group hz-modes" role="group" aria-label="Mode">
          <button class="btn" type="button" id="hz-mode-draw" aria-pressed="true">✏ Draw</button>
          <button class="btn" type="button" id="hz-mode-overhang" aria-pressed="false" title="Draw the edge of a balcony, roof or branch: the sky above it is blocked">⌒ Overhang</button>
          <button class="btn" type="button" id="hz-mode-align" aria-pressed="false">✥ Align photo</button>
        </div>
        <div class="ed-group ed-history">
          <button class="btn" type="button" id="ed-undo" title="Undo (Ctrl+Z)">↩ Undo</button>
          <button class="btn" type="button" id="ed-redo" title="Redo (Ctrl+Shift+Z)">↪ Redo</button>
          <button class="btn" type="button" id="hz-clear" title="Remove the skyline and all overhangs (asks first; undoable)">Clear…</button>
        </div>
        <span id="ed-status" class="ed-status" role="status" aria-live="polite">Saved</span>
      </div>
      <div id="hz-guide" class="hz-guide" hidden>
        <p><b>Photo added.</b> Three steps:</p>
        <ol>
          <li>Check its width under Photo (360° for a full panorama, about 65° for a phone photo).</li>
          <li>Line up north: <button class="btn small" type="button" data-guide="align">Align photo</button> and drag it, or use <i>Set north from a landmark</i>.</li>
          <li>Trace the skyline in Draw mode, or <button class="btn small" type="button" data-guide="detect">Detect skyline</button> and correct it.</li>
        </ol>
        <button class="btn small" type="button" data-guide="close">Got it</button>
      </div>
      <div class="hz-canvas-box" id="hz-box">
        <canvas id="hz-canvas" tabindex="0" role="img" aria-label="Horizon skyline on a compass grid" aria-describedby="hz-summary hz-keys"></canvas>
        <div class="ed-view-overlay" role="group" aria-label="View controls">
          <button class="btn small" type="button" id="ed-zoom-out" aria-label="Zoom out">−</button>
          <span id="ed-zoom-label" class="mono">1.0×</span>
          <button class="btn small" type="button" id="ed-zoom-in" aria-label="Zoom in">+</button>
          <button class="btn small" type="button" id="ed-fit" title="Show the whole circle">Fit</button>
        </div>
      </div>
      <p class="sub ed-hint">
        <output id="ed-pos" class="mono ed-readout">az — · alt —</output>
        <span id="hz-help" class="ed-help"></span>
      </p>
      <p id="hz-summary" class="sub hz-summary" role="note"></p>
      <p id="hz-keys" class="visually-hidden">Keyboard: in Draw mode the arrows work on skyline points, in Overhang mode on overhang edge points. Left and Right arrows select the previous or next point; with Shift they move it sideways. Up and Down arrows raise or lower it. Delete removes it. Use "Points by numbers" to add points and overhangs.</p>
    </section>
    <aside class="horizon-settings-rail" aria-label="Horizon settings">
      <section class="hz-panel" id="hz-photo-panel" aria-labelledby="hz-photo-title"></section>
      <details class="hz-panel" id="hz-points-panel">
        <summary>Points by numbers</summary>
        <fieldset class="hz-fields" id="hz-selected">
          <legend>Selected point</legend>
          <label>Azimuth (°) <input id="hz-sel-az" type="number" min="0" max="359.99" step="0.5" disabled></label>
          <label>Altitude (°) <input id="hz-sel-alt" type="number" min="${ALT_MIN}" max="${ALT_MAX}" step="0.5" disabled></label>
          <button class="btn small" type="button" id="hz-sel-del" disabled>Delete point</button>
        </fieldset>
        <fieldset class="hz-fields">
          <legend>Add a point</legend>
          <label>Azimuth (°) <input id="hz-add-az" type="number" min="0" max="359.99" step="0.5"></label>
          <label>Altitude (°) <input id="hz-add-alt" type="number" min="${ALT_MIN}" max="${ALT_MAX}" step="0.5"></label>
          <button class="btn small" type="button" id="hz-add">Add point</button>
        </fieldset>
        <fieldset class="hz-fields">
          <legend>Add an overhang (sky above it is blocked)</legend>
          <label>From azimuth (°) <input id="hz-oh-from" type="number" min="0" max="359.99" step="0.5"></label>
          <label>To azimuth (°) <input id="hz-oh-to" type="number" min="0" max="359.99" step="0.5"></label>
          <label>Edge altitude (°) <input id="hz-oh-alt" type="number" min="${ALT_MIN}" max="${ALT_MAX}" step="0.5"></label>
          <button class="btn small" type="button" id="hz-oh-add">Add overhang</button>
        </fieldset>
        <p class="sub">0° = north, 90° = east, 180° = south, 270° = west. Altitude is the angle above the level horizon.</p>
      </details>
      <details class="hz-panel" id="hz-compass-panel">
        <summary>Phone compass</summary>
        <p class="sub">On a phone: hold it upright and point the back camera at the skyline. Phone compasses are often several degrees off and point to magnetic north, so correct with a landmark first.</p>
        <div class="btnrow">
          <button class="btn small" type="button" id="hz-cmp-start" aria-pressed="false">Start compass</button>
        </div>
        <p class="mono" id="hz-cmp-read" aria-live="off">Not measuring.</p>
        <div class="btnrow">
          <button class="btn small primary" type="button" id="hz-cmp-add" disabled>Add point here</button>
          <button class="btn small" type="button" id="hz-cmp-trace" aria-pressed="false" disabled>Start tracing</button>
        </div>
        <fieldset class="hz-fields">
          <legend>Correct with a landmark</legend>
          <label>True direction of what you point at (°) <input id="hz-cmp-true" type="number" min="0" max="359.99" step="0.5"></label>
          <button class="btn small" type="button" id="hz-cmp-correct" disabled>Set correction</button>
        </fieldset>
        <p class="sub" id="hz-cmp-status" role="status" aria-live="polite"></p>
      </details>
      <details class="hz-panel ed-display" id="hz-display-panel">
        <summary>Display</summary>
        <label>Photo opacity <input id="hz-opacity" type="range" min="15" max="100" value="${Math.round(ui.opacity * 100)}"></label>
        <label><input id="hz-grid" type="checkbox" ${ui.grid ? 'checked' : ''}> Show grid</label>
      </details>
    </aside>`;
}

function wireList(box, onChanged) {
  const note = (text) => { const n = $('#hz-note', box); if (n) n.textContent = text; };
  const rerender = () => { renderHorizon(box, onChanged); onChanged(); };
  box.querySelectorAll('#hz-list li[data-id]').forEach((li) => {
    $('input[type=radio]', li).addEventListener('change', () => {
      flushHorizonEdits();
      setActive(li.dataset.id);
      rerender();
    });
    $('[data-del]', li).addEventListener('click', async () => {
      const item = db.horizons.find((x) => x.id === li.dataset.id);
      if (!item) return;
      const ok = await confirmDialog(box, {
        title: `Delete ${item.name}?`,
        body: item.hasPhoto ? 'The skyline and its photo are removed from this browser. This cannot be undone.'
          : 'The skyline is removed from this browser. This cannot be undone.',
        ok: 'Delete',
      });
      if (!ok) return;
      flushHorizonEdits();
      if (activeSession && activeSession.horizonId === item.id) { activeSession.disconnect?.(); activeSession = null; }
      if (!deleteHorizon(item.id)) note('Deleting failed: browser storage is full or blocked.');
      rerender();
    });
  });

  const keyOpens = (label) => label.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    $(`#${label.htmlFor}`, box).click();
  });
  box.querySelectorAll('.hz-new label[for]').forEach(keyOpens);

  const tooMany = () => {
    if (db.horizons.length < MAX_HORIZONS) return false;
    note(`You already have ${MAX_HORIZONS} horizons. Delete one first.`);
    return true;
  };
  const created = (h) => {
    if (!h) { note('Could not create the horizon: browser storage is full or blocked.'); return false; }
    return true;
  };

  $('#hz-new-draw', box).addEventListener('click', () => {
    if (tooMany()) return;
    flushHorizonEdits();
    if (created(createHorizon('Horizon'))) rerender();
  });

  const newFromPhoto = async (file) => {
    if (tooMany()) return;
    let entry;
    try { entry = await readPhotoFile(file); } catch (error) { note(error.message); return; }
    flushHorizonEdits();
    const name = String(file.name || 'Horizon').replace(/\.[a-z0-9]+$/i, '').slice(0, 60) || 'Horizon';
    const h = createHorizon(name, { photo: defaultPhotoPlacement(entry.width, entry.height), hasPhoto: true });
    if (!created(h)) { URL.revokeObjectURL(entry.url); return; }
    photos.set(h.id, entry);
    ui.guideFor = h.id;
    try { await photoSet(h.id, entry.blob); } catch {
      note('The photo could not be stored in this browser; it is only kept until you close the tab.');
    }
    rerender();
  };
  $('#hz-photo-file', box).addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (f) newFromPhoto(f);
  });

  $('#hz-import-file', box).addEventListener('change', async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f || tooMany()) return;
    if (f.size > MAX_IMPORT_BYTES) { note('That file is larger than 1 MB; a horizon file is much smaller.'); return; }
    let parsed;
    try { parsed = parseHorizonFile(await f.text()); } catch (error) {
      note(`Could not read ${f.name}: ${error.message}.`);
      return;
    }
    flushHorizonEdits();
    const name = String(f.name).replace(/\.[a-z0-9]+$/i, '').slice(0, 60) || 'Imported horizon';
    if (!created(createHorizon(name, { points: parsed.points }))) return;
    rerender();
    note(`Imported ${parsed.points.length} points from ${f.name}${parsed.skipped ? ` (${parsed.skipped} other lines skipped)` : ''}.`);
  });

  if (!box.__hzDrop) {
    box.__hzDrop = true;
    box.addEventListener('dragover', (ev) => {
      if (location.hash === '#horizon' && ev.dataTransfer?.types?.includes('Files')) ev.preventDefault();
    });
    box.addEventListener('drop', (ev) => {
      const f = ev.dataTransfer?.files?.[0];
      if (!f || location.hash !== '#horizon') return;
      ev.preventDefault();
      if (/^image\//.test(f.type)) newFromPhoto(f);
      else note('Drop a JPEG or PNG photo here, or use Import file for a horizon text file.');
    });
  }
}

function wireEditor(box, h, onChanged) {
  const cvs = $('#hz-canvas', box);
  const ctx = cvs.getContext('2d');
  const stage = $('.horizon-stage', box);
  const status = $('#ed-status', box);
  const note = (text) => { const n = $('#hz-note', box); if (n) n.textContent = text; };

  // Re-rendering the SAME horizon keeps its history and saved baseline; only
  // another horizon (or one replaced by a restore) starts a new history.
  const same = !!(activeSession && activeSession.horizonId === h.id && activeSession.hist && activeSession.record === h);
  const hist = same ? activeSession.hist : newHistory(h);
  if (activeSession?.disconnect) activeSession.disconnect();

  let photo = photos.get(h.id) || null;   // decoded photo entry, once loaded
  let gesture = null;                     // the pointer gesture in progress
  let spaceDown = false;
  let saveFailed = false;
  let size = { w: 0, h: 0, dpr: 1 };

  const settle = () => { if (gesture) finishGesture(false); };
  const dirty = () => !!gesture || historyDirty(hist, h);
  const persist = () => {
    withProfile(h);
    const ok = save();
    if (ok) historyMarkSaved(hist, h);
    saveFailed = !ok;
    return ok;
  };
  // The editor DOM is replaced when another tab renders into #view; the
  // observer then stops instead of drawing into a detached canvas.
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (!cvs.isConnected) { observer.disconnect(); return; }
    resize(); draw();
  }) : null;
  activeSession = {
    horizonId: h.id, record: h, hist, dirty, settle,
    save: persist,
    disconnect: () => { observer?.disconnect(); gesture = null; stopCompass(); },
  };

  /* ---- geometry ---- */
  const plot = () => ({ x: MARGIN.l, y: MARGIN.t, w: size.w - MARGIN.l - MARGIN.r, h: size.h - MARGIN.t - MARGIN.b });
  const frame = () => {
    const p = plot();
    const spanAz = 360 / ui.zoom, spanAlt = VIEW_ALT_SPAN / ui.zoom;
    return { ...p, a0: ui.fx - spanAz / 2, alt1: ui.fy + spanAlt / 2, kx: p.w / spanAz, ky: p.h / spanAlt };
  };
  const X = (f, az) => f.x + (az - f.a0) * f.kx;
  const Y = (f, alt) => f.y + (f.alt1 - alt) * f.ky;
  const toWorld = (f, x, y) => ({ az: f.a0 + (x - f.x) / f.kx, alt: f.alt1 - (y - f.y) / f.ky });
  const local = (ev) => { const r = cvs.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  const clampAlt = (a) => Math.max(ALT_MIN, Math.min(ALT_MAX, a));

  function resize() {
    const wrap = $('#hz-box', box);
    const w = Math.max(280, Math.floor(wrap.clientWidth));
    const height = Math.round(Math.max(240, Math.min(560, (w - MARGIN.l) * 0.3 + MARGIN.t + MARGIN.b)));
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    if (w === size.w && height === size.h && dpr === size.dpr) return;
    size = { w, h: height, dpr };
    cvs.width = Math.round(w * dpr);
    cvs.height = Math.round(height * dpr);
    cvs.style.width = `${w}px`;
    cvs.style.height = `${height}px`;
  }

  /* ---- drawing ---- */
  function draw() {
    if (!size.w) return;
    const V = vizTheme();
    const f = frame();
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.fillStyle = V.canvas;
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(f.x, f.y, f.w, f.h);
    ctx.clip();
    if (photo && h.photo) drawPhoto(f);
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    if (ui.grid) drawGrid(f, V);
    drawMinAlt(f, V);
    drawSkyline(f, V);
    drawOverhangs(f, V);
    if (gesture?.type === 'sketch') drawSketch(f, V);
    if (ui.mode === 'align' && photo && h.photo) drawAlignHandles(f, V);
    ctx.restore();
    drawRulers(f, V);
  }

  function drawPhoto(f) {
    const pl = h.photo, iw = photo.width, ih = photo.height;
    const s = pl.width / iw, r = pl.roll * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r);
    const shifts = pl.width >= 360 ? [-360, 0, 360] : [-360, 0, 360].filter((k) => {
      const az = pl.heading + k;
      return az + pl.width > f.a0 && az - pl.width < f.a0 + 360 / ui.zoom;
    });
    ctx.globalAlpha = ui.opacity;
    for (const k of shifts) {
      // photo pixel -> world -> screen, as one affine transform (see photoToWorld)
      const a = f.kx * c * s, b = -f.ky * sn * s, cc = f.kx * sn * s, d = f.ky * c * s;
      const e = f.x + (pl.heading + k - f.a0) * f.kx + f.kx * (c * (-s * iw / 2) - sn * (s * ih / 2));
      const ff = f.y + (f.alt1 - pl.tilt) * f.ky - f.ky * (sn * (-s * iw / 2) + c * (s * ih / 2));
      const D = size.dpr;
      ctx.setTransform(a * D, b * D, cc * D, d * D, e * D, ff * D);
      ctx.drawImage(photo.img, 0, 0);
    }
    ctx.globalAlpha = 1;
  }

  const niceStep = (pxPerDeg, minPx, steps) => steps.find((s) => s * pxPerDeg >= minPx) || steps[steps.length - 1];

  function drawGrid(f, V) {
    const azStep = niceStep(f.kx, 46, [1, 2, 5, 10, 15, 30, 45, 90]);
    const altStep = niceStep(f.ky, 24, [1, 2, 5, 10, 20]);
    ctx.lineWidth = 1;
    for (let az = Math.ceil(f.a0 / azStep) * azStep; az <= f.a0 + f.w / f.kx; az += azStep) {
      ctx.strokeStyle = az % 90 === 0 ? V.gridStrong : V.grid;
      ctx.beginPath(); ctx.moveTo(Math.round(X(f, az)) + 0.5, f.y); ctx.lineTo(Math.round(X(f, az)) + 0.5, f.y + f.h); ctx.stroke();
    }
    const altLo = f.alt1 - f.h / f.ky;
    for (let alt = Math.ceil(altLo / altStep) * altStep; alt <= f.alt1; alt += altStep) {
      ctx.strokeStyle = alt === 0 ? V.gridStrong : V.grid;
      ctx.beginPath(); ctx.moveTo(f.x, Math.round(Y(f, alt)) + 0.5); ctx.lineTo(f.x + f.w, Math.round(Y(f, alt)) + 0.5); ctx.stroke();
    }
  }

  function drawMinAlt(f, V) {
    const y = Y(f, effectiveMinAlt());
    ctx.save();
    ctx.strokeStyle = V.minStroke;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(f.x, y); ctx.lineTo(f.x + f.w, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = V.minLabel;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`min altitude ${fmt(effectiveMinAlt())}°`, f.x + f.w - 6, y - 4);
    ctx.restore();
  }

  /* Straight lines in azimuth/altitude are straight on this grid, so the
     skyline is the polyline through its points, repeated one turn each way. */
  function ringPoints(points) {
    if (points.length === 1) return [{ az: -360, alt: points[0].alt }, { az: 720, alt: points[0].alt }];
    const out = [];
    for (const k of [-360, 0, 360]) for (const p of points) out.push({ az: p.az + k, alt: p.alt });
    return out;
  }

  function drawSkyline(f, V) {
    const pts = gesture?.type === 'point' ? gesture.points : h.points;
    if (!pts.length) return;
    const ring = ringPoints(pts);
    const bottom = f.y + f.h + 2;
    ctx.beginPath();
    ctx.moveTo(X(f, ring[0].az), bottom);
    for (const p of ring) ctx.lineTo(X(f, p.az), Y(f, p.alt));
    ctx.lineTo(X(f, ring[ring.length - 1].az), bottom);
    ctx.closePath();
    ctx.fillStyle = V.obstacleFill;
    ctx.fill();
    ctx.beginPath();
    ring.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(f, p.az), Y(f, p.alt)));
    ctx.strokeStyle = V.obstacleStroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (ui.mode !== 'draw') return;
    pts.forEach((p, i) => {
      for (const k of [-360, 0, 360]) {
        const x = X(f, p.az + k), y = Y(f, p.alt);
        if (x < f.x - 8 || x > f.x + f.w + 8) continue;
        const sel = i === ui.selected;
        ctx.beginPath();
        ctx.arc(x, y, sel ? 6 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = sel ? V.text : V.obstacleStroke;
        ctx.fill();
        if (sel) { ctx.lineWidth = 2; ctx.strokeStyle = V.canvas; ctx.stroke(); }
      }
    });
  }

  /* Overhangs block everything above their edge: shade from the edge to the
     top of the grid, with a dashed edge so they read apart from the skyline. */
  function drawOverhangs(f, V) {
    const lines = gesture?.type === 'ohpoint' ? gesture.lines : (h.overhangs || []);
    const top = f.y - 2;
    lines.forEach((line, i) => {
      ctx.beginPath();
      ctx.moveTo(X(f, line[0].az), top);
      for (const p of line) ctx.lineTo(X(f, p.az), Y(f, p.alt));
      ctx.lineTo(X(f, line[line.length - 1].az), top);
      ctx.closePath();
      ctx.fillStyle = V.obstacleFill;
      ctx.fill();
      ctx.beginPath();
      line.forEach((p, j) => (j ? ctx.lineTo : ctx.moveTo).call(ctx, X(f, p.az), Y(f, p.alt)));
      ctx.strokeStyle = V.obstacleStroke;
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (ui.mode !== 'overhang') return;
      line.forEach((p, j) => {
        const sel = ui.ohSel && ui.ohSel.i === i && ui.ohSel.j === j;
        ctx.beginPath();
        ctx.arc(X(f, p.az), Y(f, p.alt), sel ? 6 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = sel ? V.text : V.obstacleStroke;
        ctx.fill();
        if (sel) { ctx.lineWidth = 2; ctx.strokeStyle = V.canvas; ctx.stroke(); }
      });
    });
  }

  function drawSketch(f, V) {
    const s = gesture.samples;
    if (s.length < 2) return;
    ctx.beginPath();
    s.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(f, p.az), Y(f, p.alt)));
    ctx.strokeStyle = V.text;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* The level line runs through the photo centre along its own horizontal;
     the two round handles rotate the photo (roll). */
  function levelHandles() {
    const pl = h.photo, iw = photo.width, ih = photo.height;
    const half = (iw / 2) * Math.min(1, 50 / pl.width);
    return [-1, 1].map((side) => photoToWorld(pl, iw, ih, iw / 2 + side * half, ih / 2));
  }

  /* A full panorama is not rolled: on a sphere its tilt would be a wave, not a
     rotation, and panorama apps level their output. Only partial photos get
     level handles. */
  const canRoll = () => !!(h.photo && photo && h.photo.width < 360);

  function drawAlignHandles(f, V) {
    if (!canRoll()) return;
    const [a, b] = levelHandles();
    const bx = X(f, a.az + azDelta(b.az, a.az));   // keep the line unbroken across north
    ctx.strokeStyle = V.warn;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(f, a.az), Y(f, a.alt)); ctx.lineTo(bx, Y(f, b.alt)); ctx.stroke();
    for (const [x, y] of [[X(f, a.az), Y(f, a.alt)], [bx, Y(f, b.alt)]]) {
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = V.canvas; ctx.fill(); ctx.stroke();
    }
    if (h.photo.width < 360) {   // outline of a partial photo
      const pl = h.photo, iw = photo.width, ih = photo.height;
      const corners = [[0, 0], [iw, 0], [iw, ih], [0, ih]].map(([x, y]) => photoToWorld(pl, iw, ih, x, y));
      ctx.strokeStyle = V.dim;
      ctx.lineWidth = 1;
      ctx.beginPath();
      corners.forEach((p, i) => {
        const az = pl.heading + azDelta(p.az, pl.heading);
        (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(f, az), Y(f, p.alt));
      });
      ctx.closePath();
      ctx.stroke();
    }
  }

  function drawRulers(f, V) {
    ctx.fillStyle = V.text;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const azStep = niceStep(f.kx, 46, [1, 2, 5, 10, 15, 30, 45, 90]);
    for (let az = Math.ceil(f.a0 / azStep) * azStep; az <= f.a0 + f.w / f.kx; az += azStep) {
      const a = wrapAz(az);
      const label = a % 45 === 0 ? CARDINALS[a / 22.5] : `${fmt(a)}°`;
      ctx.fillStyle = a % 90 === 0 ? V.text : V.dim;
      ctx.fillText(label, X(f, az), f.y / 2);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = V.dim;
    const altStep = niceStep(f.ky, 24, [1, 2, 5, 10, 20]);
    const altLo = f.alt1 - f.h / f.ky;
    for (let alt = Math.ceil(altLo / altStep) * altStep; alt <= f.alt1; alt += altStep) {
      ctx.fillText(`${fmt(alt)}°`, f.x - 6, Y(f, alt));
    }
    ctx.textBaseline = 'alphabetic';
  }

  /* ---- state changes ---- */
  function renderStatus() {
    const d = historyDirty(hist, h);
    status.textContent = saveFailed ? 'Save failed: browser storage is full or blocked' : (d ? 'Saving…' : 'Saved');
    status.classList.toggle('failed', saveFailed);
    $('#ed-undo', box).disabled = !historyCanUndo(hist);
    $('#ed-redo', box).disabled = !historyCanRedo(hist);
    $('#hz-clear', box).disabled = !h.points.length && !(h.overhangs || []).length;
  }

  function renderSummary() {
    $('#hz-summary', box).textContent = describeHorizon(h);
    const tag = box.querySelector(`#hz-list li[data-id="${CSS.escape(h.id)}"] .p-tags`);
    if (tag) tag.textContent = `${h.points.length} pt${h.hasPhoto ? ' · photo' : ''}`;
  }

  /** The selected point of the current mode's layer, or undefined. */
  const selectedPoint = () => (ui.mode === 'overhang'
    ? (ui.ohSel ? h.overhangs[ui.ohSel.i]?.[ui.ohSel.j] : undefined)
    : h.points[ui.selected]);

  function renderSelection() {
    const p = ui.mode === 'align' ? undefined : selectedPoint();
    const az = $('#hz-sel-az', box), alt = $('#hz-sel-alt', box), del = $('#hz-sel-del', box);
    for (const el of [az, alt, del]) el.disabled = !p;
    az.value = p ? String(p.az) : '';
    alt.value = p ? String(p.alt) : '';
  }

  function renderMode() {
    const hasPhoto = !!(h.photo && photo);
    if (ui.mode === 'align' && !hasPhoto) ui.mode = 'draw';
    $('#hz-mode-draw', box).setAttribute('aria-pressed', String(ui.mode === 'draw'));
    $('#hz-mode-overhang', box).setAttribute('aria-pressed', String(ui.mode === 'overhang'));
    $('#hz-mode-align', box).setAttribute('aria-pressed', String(ui.mode === 'align'));
    $('#hz-mode-align', box).disabled = !hasPhoto;
    cvs.dataset.mode = ui.mode;
    $('#hz-help', box).textContent = ui.sun === 'pick'
      ? 'Click the centre of the Sun in the photo. Esc cancels.'
      : ui.landmark === 'pick'
      ? 'Click the landmark in the photo. Esc cancels.'
      : ui.mode === 'align'
        ? `Drag the photo to move it (north and tilt)${canRoll() ? ' · drag a round handle to level it' : ''} · the skyline moves with the photo`
        : ui.mode === 'overhang'
          ? 'Drag along the underside of a balcony, roof or branch: the sky above that edge is blocked · drag a point = move · Delete = remove'
          : 'Click = add point · drag a point = move · drag across the grid = sketch the skyline · Delete = remove · wheel = zoom · Space+drag = pan';
    $('#ed-zoom-label', box).textContent = `${ui.zoom.toFixed(1)}×`;
  }

  /** After any change to points or photo: derive, save, announce, repaint. */
  function changed(cause = 'edit') {
    withProfile(h);
    persist();
    announceHorizonChanged(h, cause);
    if (ui.selected >= h.points.length) ui.selected = -1;
    if (ui.ohSel && !h.overhangs[ui.ohSel.i]?.[ui.ohSel.j]) ui.ohSel = null;
    renderStatus(); renderSummary(); renderSelection(); renderPhotoPanel(); renderMode();
    draw();
    onChanged();
  }

  function commit(cause = 'edit') {
    if (historyCommit(hist, h)) changed(cause);
    else draw();
  }

  /** Keep the photo in view after it jumps (typed numbers or a landmark). */
  function followPhoto() {
    if (!h.photo || !size.w) return;
    const f = frame(), x = X(f, h.photo.heading);
    if (x < f.x || x > f.x + f.w) Object.assign(ui, clampView(ui.zoom, h.photo.heading, ui.fy));
  }

  const selectAz = (az) => { ui.selected = h.points.findIndex((p) => Math.abs(p.az - az) < 0.006); };

  /** Select the overhang point nearest a world position (after a re-sort). */
  const selectOverhangAt = (az, alt) => {
    let best = null, bestD = Infinity;
    h.overhangs.forEach((line, i) => line.forEach((p, j) => {
      const d = Math.hypot(p.az - az, p.alt - alt);
      if (d < bestD) { bestD = d; best = { i, j }; }
    }));
    ui.ohSel = bestD < 0.02 ? best : null;
  };

  /** Move the photo; the skyline and overhangs move with it. */
  function placePhoto(next, from = h.photo, points = h.points, overhangs = h.overhangs) {
    h.points = reprojectPoints(points, photo.width, photo.height, from, next);
    h.overhangs = reprojectOverhangs(overhangs, photo.width, photo.height, from, next);
    h.photo = next;
  }

  /* ---- pointer gestures ---- */
  function hitPoint(f, x, y) {
    let best = -1, bestD = HIT_PX;
    h.points.forEach((p, i) => {
      for (const k of [-360, 0, 360]) {
        const d = Math.hypot(X(f, p.az + k) - x, Y(f, p.alt) - y);
        if (d < bestD) { bestD = d; best = i; }
      }
    });
    return best;
  }

  function hitOverhang(f, x, y) {
    let best = null, bestD = HIT_PX;
    (h.overhangs || []).forEach((line, i) => line.forEach((p, j) => {
      const d = Math.hypot(X(f, p.az) - x, Y(f, p.alt) - y);
      if (d < bestD) { bestD = d; best = { i, j }; }
    }));
    return best;
  }

  function hitHandle(f, x, y) {
    if (!canRoll()) return -1;
    const [a, b] = levelHandles();
    const bAz = a.az + azDelta(b.az, a.az);
    return [[a.az, a.alt], [bAz, b.alt]].findIndex(([az, alt]) => Math.hypot(X(f, az) - x, Y(f, alt) - y) <= 10);
  }

  cvs.addEventListener('contextmenu', (ev) => ev.preventDefault());
  cvs.addEventListener('pointerdown', (ev) => {
    if (gesture) return;
    const f = frame(), { x, y } = local(ev), w = toWorld(f, x, y);
    cvs.focus({ preventScroll: true });
    if (ev.button === 1 || (ev.button === 0 && spaceDown)) {
      gesture = { type: 'pan', x, y, fx: ui.fx, fy: ui.fy };
    } else if (ev.button !== 0) {
      return;
    } else if (ui.sun === 'pick' && photo && h.photo) {
      const px = worldToPhoto(h.photo, photo.width, photo.height, wrapAz(w.az), w.alt);
      ui.sun = { x: px.x, y: px.y };
      renderPhotoPanel(); renderMode();
      openSunForm();
      return;
    } else if (ui.landmark === 'pick' && photo && h.photo) {
      const px = worldToPhoto(h.photo, photo.width, photo.height, wrapAz(w.az), w.alt);
      ui.landmark = { x: px.x, y: px.y };
      renderPhotoPanel(); renderMode();
      $('#hz-landmark-az', box)?.focus();
      return;
    } else if (ui.mode === 'align' && photo && h.photo) {
      const handle = hitHandle(f, x, y);
      gesture = { type: handle >= 0 ? 'roll' : 'move', start: w, photo0: { ...h.photo },
        points0: h.points.map((p) => ({ ...p })), overhangs0: h.overhangs.map((l) => l.map((p) => ({ ...p }))) };
      if (handle >= 0) gesture.angle0 = Math.atan2(w.alt - h.photo.tilt, azDelta(w.az, h.photo.heading));
    } else if (ui.mode === 'overhang') {
      const hit = hitOverhang(f, x, y);
      if (hit) {
        ui.ohSel = hit;
        gesture = { type: 'ohpoint', ...hit, lines: h.overhangs.map((l) => l.map((p) => ({ ...p }))), moved: false };
        renderSelection();
      } else {
        gesture = { type: 'sketch', x, y, far: false, samples: [{ az: Math.max(0, Math.min(360, w.az)), alt: clampAlt(w.alt) }] };
      }
    } else {
      const hit = hitPoint(f, x, y);
      if (hit >= 0) {
        ui.selected = hit;
        gesture = { type: 'point', index: hit, points: h.points.map((p) => ({ ...p })), moved: false };
        renderSelection();
      } else {
        gesture = { type: 'sketch', x, y, far: false, samples: [{ az: Math.max(0, Math.min(360, w.az)), alt: clampAlt(w.alt) }] };
      }
    }
    cvs.setPointerCapture(ev.pointerId);
    if (gesture.type === 'pan') cvs.classList.add('panning');
    draw();
  });

  cvs.addEventListener('pointermove', (ev) => {
    const f = frame(), { x, y } = local(ev), w = toWorld(f, x, y);
    $('#ed-pos', box).textContent = (x >= f.x && y >= f.y)
      ? `az ${fmt(wrapAz(w.az))}° ${cardinal(w.az)} · alt ${fmt(w.alt)}°` : 'az — · alt —';
    if (!gesture) return;
    if (gesture.type === 'pan') {
      Object.assign(ui, clampView(ui.zoom, gesture.fx - (x - gesture.x) / f.kx, gesture.fy + (y - gesture.y) / f.ky));
    } else if (gesture.type === 'point') {
      const pts = gesture.points, i = gesture.index;
      // A dragged point stays between its neighbours, so the skyline order holds.
      const lo = i > 0 ? pts[i - 1].az + 0.01 : 0;
      const hi = i < pts.length - 1 ? pts[i + 1].az - 0.01 : 359.99;
      pts[i] = { az: Math.max(lo, Math.min(hi, w.az)), alt: clampAlt(w.alt) };
      gesture.moved = true;
    } else if (gesture.type === 'ohpoint') {
      const line = gesture.lines[gesture.i], j = gesture.j;
      const lo = j > 0 ? line[j - 1].az + 0.01 : 0;
      const hi = j < line.length - 1 ? line[j + 1].az - 0.01 : 360;
      line[j] = { az: Math.max(lo, Math.min(hi, w.az)), alt: clampAlt(w.alt) };
      gesture.moved = true;
    } else if (gesture.type === 'sketch') {
      if (Math.hypot(x - gesture.x, y - gesture.y) > 4) gesture.far = true;
      gesture.samples.push({ az: Math.max(0, Math.min(360, w.az)), alt: clampAlt(w.alt) });
    } else if (gesture.type === 'move' || gesture.type === 'roll') {
      const p0 = gesture.photo0;
      let next;
      if (gesture.type === 'move') {
        next = { ...p0, heading: wrapAz(p0.heading + (w.az - gesture.start.az)), tilt: Math.max(-90, Math.min(90, p0.tilt + (w.alt - gesture.start.alt))) };
      } else {
        const angle = Math.atan2(w.alt - p0.tilt, azDelta(w.az, p0.heading));
        next = { ...p0, roll: azDelta(p0.roll + (angle - gesture.angle0) * 180 / Math.PI, 0) };
      }
      placePhoto(normalizePhotoPlacement(next), p0, gesture.points0, gesture.overhangs0);
      gesture.moved = true;
      renderPhotoFields();
    }
    draw();
  });

  function finishGesture(apply = true) {
    const g = gesture;
    gesture = null;
    cvs.classList.remove('panning');
    if (!g) return;
    if (g.type === 'point' && g.moved && apply) {
      const moved = g.points[g.index];
      h.points = normalizePoints(g.points);
      selectAz(Math.round(moved.az * 100) / 100);
      commit();
    } else if (g.type === 'ohpoint' && g.moved && apply) {
      const moved = g.lines[g.i][g.j];
      h.overhangs = normalizeOverhangs(g.lines);
      selectOverhangAt(moved.az, moved.alt);
      commit();
    } else if (g.type === 'sketch' && apply && ui.mode === 'overhang') {
      if (!g.far) { note('Drag along the underside of the overhang to draw its edge.'); draw(); return; }
      const buckets = new Map();
      for (const s of g.samples) buckets.set(Math.round(s.az * 4), s);
      const edge = simplifyLine([...buckets.values()].sort((a, b) => a.az - b.az), 0.15);
      if (!normalizeOverhang(edge)) { note('An overhang edge needs to span some azimuth: drag sideways.'); draw(); return; }
      h.overhangs = replaceOverhangsInRange(h.overhangs, edge);
      ui.ohSel = null;
      commit();
    } else if (g.type === 'sketch' && apply) {
      if (!g.far) {
        const p = g.samples[0];
        if (h.points.length >= MAX_POINTS) { note(`A horizon has at most ${MAX_POINTS} points.`); draw(); return; }
        h.points = normalizePoints([...h.points, p]);
        selectAz(Math.round(wrapAz(p.az) * 100) / 100);
        commit();
      } else {
        // The latest sample per 0.25 deg wins, so going back over a stretch redraws it.
        const buckets = new Map();
        for (const s of g.samples) buckets.set(Math.round(s.az * 4), s);
        const line = simplifyLine([...buckets.values()].sort((a, b) => a.az - b.az), 0.15);
        h.points = replacePointsInRange(h.points, line).slice(0, MAX_POINTS);
        ui.selected = -1;
        commit();
      }
    } else if ((g.type === 'move' || g.type === 'roll') && g.moved) {
      if (apply) commit('align');
      else { h.photo = g.photo0; h.points = g.points0; h.overhangs = g.overhangs0; draw(); }
    } else draw();
  }

  cvs.addEventListener('pointerup', () => finishGesture(true));
  cvs.addEventListener('pointercancel', () => finishGesture(false));
  cvs.addEventListener('pointerleave', () => { if (!gesture) $('#ed-pos', box).textContent = 'az — · alt —'; });

  cvs.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const f = frame(), { x, y } = local(ev), w = toWorld(f, x, y);
    const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, ui.zoom * (ev.deltaY < 0 ? 1.25 : 0.8)));
    zoomAround(zoom, w, x - f.x, y - f.y, f);
  }, { passive: false });

  function zoomAround(zoom, w, px, py, f) {
    const spanAz = 360 / zoom, spanAlt = VIEW_ALT_SPAN / zoom;
    const a0 = w.az - px * spanAz / f.w, alt1 = w.alt + py * spanAlt / f.h;
    Object.assign(ui, clampView(zoom, a0 + spanAz / 2, alt1 - spanAlt / 2));
    renderMode();
    draw();
  }
  const zoomCentre = (zoom) => {
    const f = frame();
    zoomAround(zoom, { az: ui.fx, alt: ui.fy }, f.w / 2, f.h / 2, f);
  };
  $('#ed-zoom-in', box).addEventListener('click', () => zoomCentre(Math.min(ZOOM_MAX, ui.zoom * 1.5)));
  $('#ed-zoom-out', box).addEventListener('click', () => zoomCentre(Math.max(ZOOM_MIN, ui.zoom / 1.5)));
  $('#ed-fit', box).addEventListener('click', () => { Object.assign(ui, clampView(1, 180, 35)); renderMode(); draw(); });

  /* ---- keyboard ---- */
  cvs.addEventListener('keydown', (ev) => {
    if (ev.key === ' ') { spaceDown = true; ev.preventDefault(); return; }
    if (ev.key === 'Escape') {
      if (gesture) finishGesture(false);
      else if (ui.landmark || ui.sun) { ui.landmark = null; ui.sun = null; renderPhotoPanel(); renderMode(); }
      else { ui.selected = -1; renderSelection(); draw(); }
      return;
    }
    if (ui.mode === 'overhang') { overhangKey(ev); return; }
    if (ui.mode !== 'draw' || !h.points.length) return;
    const n = h.points.length;
    const i = ui.selected;
    const step = ev.shiftKey ? 2 : 0.5;
    if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && !ev.shiftKey) {
      ev.preventDefault();
      ui.selected = i < 0 ? 0 : (i + (ev.key === 'ArrowRight' ? 1 : n - 1)) % n;
      const p = h.points[ui.selected];
      if (X(frame(), p.az) < MARGIN.l || X(frame(), p.az) > size.w - MARGIN.r) Object.assign(ui, clampView(ui.zoom, p.az, ui.fy));
      renderSelection(); draw();
      $('#ed-pos', box).textContent = `point ${ui.selected + 1} of ${n}: az ${fmt(p.az)}° ${cardinal(p.az)} · alt ${fmt(p.alt)}°`;
      return;
    }
    if (i < 0) return;
    const p = h.points[i];
    let next = null;
    if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') next = { az: p.az, alt: clampAlt(p.alt + (ev.key === 'ArrowUp' ? step : -step)) };
    if (ev.shiftKey && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
      const lo = i > 0 ? h.points[i - 1].az + 0.01 : 0, hi = i < n - 1 ? h.points[i + 1].az - 0.01 : 359.99;
      next = { az: Math.max(lo, Math.min(hi, p.az + (ev.key === 'ArrowRight' ? 0.5 : -0.5))), alt: p.alt };
    }
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      h.points = h.points.filter((_, k) => k !== i);
      ui.selected = Math.min(i, h.points.length - 1);
      commit();
      return;
    }
    if (next) {
      ev.preventDefault();
      h.points = normalizePoints(h.points.map((q, k) => (k === i ? next : q)));
      selectAz(Math.round(next.az * 100) / 100);
      commit();
      $('#ed-pos', box).textContent = `az ${fmt(next.az)}° · alt ${fmt(next.alt)}°`;
    }
  });
  /** Arrow/Delete keys on overhang edge points (Overhang mode). */
  function overhangKey(ev) {
    const flat = [];
    h.overhangs.forEach((line, i) => line.forEach((_, j) => flat.push({ i, j })));
    if (!flat.length) return;
    const at = ui.ohSel ? flat.findIndex((q) => q.i === ui.ohSel.i && q.j === ui.ohSel.j) : -1;
    if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && !ev.shiftKey) {
      ev.preventDefault();
      ui.ohSel = flat[at < 0 ? 0 : (at + (ev.key === 'ArrowRight' ? 1 : flat.length - 1)) % flat.length];
      const p = selectedPoint();
      if (X(frame(), p.az) < MARGIN.l || X(frame(), p.az) > size.w - MARGIN.r) Object.assign(ui, clampView(ui.zoom, p.az, ui.fy));
      renderSelection(); draw();
      $('#ed-pos', box).textContent = `overhang ${ui.ohSel.i + 1}, point ${ui.ohSel.j + 1}: az ${fmt(p.az)}° ${cardinal(p.az)} · alt ${fmt(p.alt)}°`;
      return;
    }
    if (at < 0) return;
    const { i, j } = ui.ohSel, line = h.overhangs[i], p = line[j];
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      const rest = line.filter((_, k) => k !== j);
      h.overhangs = normalizeOverhangs(h.overhangs.map((l, k) => (k === i ? rest : l)));
      ui.ohSel = null;
      commit();
      $('#ed-pos', box).textContent = rest.length < 2 ? 'overhang removed' : 'point removed';
      return;
    }
    let next = null;
    const step = ev.shiftKey ? 2 : 0.5;
    if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') next = { az: p.az, alt: clampAlt(p.alt + (ev.key === 'ArrowUp' ? step : -step)) };
    if (ev.shiftKey && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
      const lo = j > 0 ? line[j - 1].az + 0.01 : 0, hi = j < line.length - 1 ? line[j + 1].az - 0.01 : 360;
      next = { az: Math.max(lo, Math.min(hi, p.az + (ev.key === 'ArrowRight' ? 0.5 : -0.5))), alt: p.alt };
    }
    if (!next) return;
    ev.preventDefault();
    h.overhangs = normalizeOverhangs(h.overhangs.map((l, k) => (k === i ? l.map((q, m) => (m === j ? next : q)) : l)));
    selectOverhangAt(Math.round(next.az * 100) / 100, Math.round(next.alt * 100) / 100);
    commit();
    $('#ed-pos', box).textContent = `az ${fmt(next.az)}° · alt ${fmt(next.alt)}°`;
  }
  cvs.addEventListener('keyup', (ev) => { if (ev.key === ' ') spaceDown = false; });
  cvs.addEventListener('blur', () => { spaceDown = false; });

  stage.addEventListener('keydown', (ev) => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
    if (ev.target.matches('input, textarea, select')) return;
    const k = ev.key.toLowerCase();
    if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); undo(); }
    else if ((k === 'z' && ev.shiftKey) || k === 'y') { ev.preventDefault(); redo(); }
  });

  /* ---- toolbar ---- */
  function undo() { settle(); if (historyUndo(hist, h)) { ui.selected = -1; changed('undo'); } }
  function redo() { settle(); if (historyRedo(hist, h)) { ui.selected = -1; changed('redo'); } }
  $('#ed-undo', box).addEventListener('click', undo);
  $('#ed-redo', box).addEventListener('click', redo);
  $('#hz-clear', box).addEventListener('click', async () => {
    const ok = await confirmDialog(box, { title: 'Clear the horizon?', body: 'The skyline and all overhangs are removed. Undo brings them back.', ok: 'Clear' });
    if (!ok) return;
    h.points = [];
    h.overhangs = [];
    ui.selected = -1;
    ui.ohSel = null;
    commit();
  });
  const setMode = (mode) => { settle(); ui.mode = mode; ui.landmark = null; ui.sun = null; renderMode(); renderPhotoPanel(); draw(); };
  $('#hz-mode-draw', box).addEventListener('click', () => setMode('draw'));
  $('#hz-mode-overhang', box).addEventListener('click', () => setMode('overhang'));
  $('#hz-mode-align', box).addEventListener('click', () => setMode('align'));

  $('#hz-name', box).addEventListener('change', (ev) => {
    const name = ev.target.value.trim().slice(0, 80);
    if (!name) { ev.target.value = h.name; return; }
    h.name = name;
    if (!save()) note('Renaming failed: browser storage is full or blocked.');
    const label = box.querySelector(`#hz-list li[data-id="${CSS.escape(h.id)}"] .p-name`);
    if (label) label.textContent = name;
    box.querySelector(`#hz-list li[data-id="${CSS.escape(h.id)}"] [data-del]`)?.setAttribute('aria-label', `Delete horizon ${name}`);
  });
  $('#hz-export', box).addEventListener('click', () => {
    if (!h.points.length) { note('There is nothing to export yet: the skyline has no points.'); return; }
    download(`${fileSlug(h.name)}-horizon.txt`, formatHorizonFile(h));
    if (h.overhangs.length) note('Exported the skyline. Horizon files have no overhangs, so those stay only in NightSeam and its backups.');
  });

  /* ---- guide after a new photo ---- */
  const guide = $('#hz-guide', box);
  guide.hidden = ui.guideFor !== h.id;
  guide.addEventListener('click', (ev) => {
    const action = ev.target.closest('[data-guide]')?.dataset.guide;
    if (action === 'align') setMode('align');
    if (action === 'detect') detect();
    if (action === 'close') { ui.guideFor = null; guide.hidden = true; cvs.focus(); }
  });

  /* ---- points by numbers ---- */
  const field = (id) => num($(id, box).value);
  $('#hz-sel-az', box).addEventListener('change', () => editSelected());
  $('#hz-sel-alt', box).addEventListener('change', () => editSelected());
  function editSelected() {
    const az = field('#hz-sel-az'), alt = field('#hz-sel-alt');
    if (!selectedPoint() || !Number.isFinite(az) || !Number.isFinite(alt)) { renderSelection(); return; }
    if (ui.mode === 'overhang') {
      const { i, j } = ui.ohSel;
      const a = Math.max(0, Math.min(360, az));
      h.overhangs = normalizeOverhangs(h.overhangs.map((l, k) => (k === i ? l.map((q, m) => (m === j ? { az: a, alt } : q)) : l)));
      selectOverhangAt(Math.round(a * 100) / 100, Math.round(Math.max(ALT_MIN, Math.min(ALT_MAX, alt)) * 100) / 100);
    } else {
      h.points = normalizePoints([...h.points.filter((_, k) => k !== ui.selected), { az, alt }]);
      selectAz(Math.round(wrapAz(az) * 100) / 100);
    }
    commit();
  }
  $('#hz-sel-del', box).addEventListener('click', () => {
    if (!selectedPoint()) return;
    if (ui.mode === 'overhang') {
      const { i, j } = ui.ohSel;
      h.overhangs = normalizeOverhangs(h.overhangs.map((l, k) => (k === i ? l.filter((_, m) => m !== j) : l)));
      ui.ohSel = null;
    } else {
      h.points = h.points.filter((_, k) => k !== ui.selected);
      ui.selected = -1;
    }
    commit();
  });
  $('#hz-oh-add', box).addEventListener('click', () => {
    const from = field('#hz-oh-from'), to = field('#hz-oh-to'), alt = field('#hz-oh-alt');
    if (![from, to, alt].every(Number.isFinite)) {
      note('Enter where the overhang starts and ends (going east; the same direction twice means all the way round) and the altitude of its edge, in degrees.');
      return;
    }
    let next = h.overhangs;
    for (const piece of flatOverhang(from, to, alt)) next = replaceOverhangsInRange(next, piece);
    h.overhangs = next;
    if (ui.mode !== 'overhang') { ui.mode = 'overhang'; renderMode(); }
    ui.ohSel = null;
    commit();
    note(wrapAz(from) === wrapAz(to)
      ? `Overhang added: the sky above ${fmt(alt)}° is blocked all the way round.`
      : `Overhang added: the sky above ${fmt(alt)}° is blocked from ${fmt(wrapAz(from))}° to ${fmt(wrapAz(to))}°.`);
  });
  $('#hz-add', box).addEventListener('click', () => {
    const az = field('#hz-add-az'), alt = field('#hz-add-alt');
    if (!Number.isFinite(az) || !Number.isFinite(alt)) { note('Enter an azimuth and an altitude in degrees.'); return; }
    if (h.points.length >= MAX_POINTS) { note(`A horizon has at most ${MAX_POINTS} points.`); return; }
    h.points = normalizePoints([...h.points, { az, alt }]);
    selectAz(Math.round(wrapAz(az) * 100) / 100);
    commit();
  });
  for (const [id, key] of [['#hz-points-panel', 'points'], ['#hz-display-panel', 'display'], ['#hz-compass-panel', 'compass']]) {
    const el = $(id, box);
    el.open = !!ui.openPanels[key];
    el.addEventListener('toggle', () => { ui.openPanels[key] = el.open; });
  }

  /* ---- display ---- */
  $('#hz-opacity', box).addEventListener('input', (ev) => { ui.opacity = Number(ev.target.value) / 100; draw(); });
  $('#hz-grid', box).addEventListener('change', (ev) => { ui.grid = ev.target.checked; draw(); });

  /* ---- photo panel ---- */
  const panel = $('#hz-photo-panel', box);
  function renderPhotoPanel() {
    const missing = h.hasPhoto && !photo;
    if (!h.photo || !h.hasPhoto) {
      panel.innerHTML = `
        <h4 id="hz-photo-title">Photo</h4>
        <p class="sub">A photo of your skyline makes tracing easier. It stays in this browser.</p>
        <label class="btn" for="hz-attach-file" role="button" tabindex="0">📷 Add a photo</label>
        <input type="file" id="hz-attach-file" accept="image/jpeg,image/png" class="vhidden" hidden tabindex="-1">`;
    } else if (missing) {
      panel.innerHTML = `
        <h4 id="hz-photo-title">Photo</h4>
        <p class="sub" id="hz-photo-state">Loading the photo…</p>
        <button class="btn small" type="button" id="hz-photo-remove">Remove photo</button>`;
      $('#hz-photo-remove', panel).addEventListener('click', removePhoto);
    } else if (panel.dataset.state !== 'fields') {
      panel.innerHTML = `
        <h4 id="hz-photo-title">Photo</h4>
        <div class="hz-fields">
          <label>Width (°) <input id="hz-ph-width" type="number" min="1" max="360" step="1"></label>
          <label>North: centre direction (°) <input id="hz-ph-heading" type="number" min="0" max="359.99" step="0.5"></label>
          <label>Tilt: centre altitude (°) <input id="hz-ph-tilt" type="number" min="-90" max="90" step="0.5"></label>
          <label>Roll (°) <input id="hz-ph-roll" type="number" min="-180" max="180" step="0.5"></label>
        </div>
        <p class="sub">360° is a full panorama; a phone photo is about 65° wide, a phone panorama 120–240°. The skyline moves with the photo.</p>
        <div class="btnrow">
          <button class="btn small" type="button" id="hz-landmark">Set north from a landmark</button>
          <button class="btn small" type="button" id="hz-sun">Set north from the Sun</button>
          <button class="btn small" type="button" id="hz-detect">Detect skyline</button>
          <button class="btn small" type="button" id="hz-photo-remove">Remove photo</button>
        </div>
        <div id="hz-landmark-form" class="hz-landmark" hidden>
          <label>Compass direction of that landmark (°) <input id="hz-landmark-az" type="number" min="0" max="359.99" step="0.5"></label>
          <div class="btnrow">
            <button class="btn small primary" type="button" id="hz-landmark-apply">Apply</button>
            <button class="btn small" type="button" id="hz-landmark-cancel">Cancel</button>
          </div>
        </div>
        <div id="hz-sun-form" class="hz-landmark" hidden>
          <label>When the photo was taken (site time) <input id="hz-sun-time" type="datetime-local" step="1"></label>
          <p class="sub" id="hz-sun-source"></p>
          <div class="btnrow">
            <button class="btn small primary" type="button" id="hz-sun-apply">Apply</button>
            <button class="btn small" type="button" id="hz-sun-cancel">Cancel</button>
          </div>
        </div>`;
      wirePhotoFields();
    }
    panel.dataset.state = h.photo && h.hasPhoto && !missing ? 'fields' : 'other';
    const attach = $('#hz-attach-file', panel);
    if (attach) {
      const label = $('label[for="hz-attach-file"]', panel);
      label.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); attach.click(); }
      });
      attach.addEventListener('change', async (ev) => {
        const f = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!f) return;
        let entry;
        try { entry = await readPhotoFile(f); } catch (error) { note(error.message); return; }
        try { await photoSet(h.id, entry.blob); } catch {
          note('The photo could not be stored in this browser; it is only kept until you close the tab.');
        }
        forgetPhoto(h.id);
        photos.set(h.id, entry);
        photo = entry;
        h.photo = defaultPhotoPlacement(entry.width, entry.height);
        h.hasPhoto = true;
        ui.guideFor = h.id;
        guide.hidden = false;
        // Adding a photo cannot be undone step by step: the history restarts here.
        Object.assign(hist, newHistory(h));
        changed('photo');
      });
    }
    renderPhotoFields();
  }

  function renderPhotoFields() {
    if (!h.photo || !$('#hz-ph-width', panel)) return;
    const set = (id, v) => { const el = $(id, panel); if (el && document.activeElement !== el) el.value = String(v); };
    set('#hz-ph-width', h.photo.width);
    set('#hz-ph-heading', h.photo.heading);
    set('#hz-ph-tilt', h.photo.tilt);
    set('#hz-ph-roll', h.photo.roll);
    const roll = $('#hz-ph-roll', panel);
    roll.disabled = h.photo.width >= 360;
    roll.title = roll.disabled ? 'A full panorama is levelled by the panorama app; roll applies to partial photos.' : '';
    const form = $('#hz-landmark-form', panel);
    if (form) form.hidden = !(ui.landmark && typeof ui.landmark === 'object');
    const btn = $('#hz-landmark', panel);
    if (btn) btn.setAttribute('aria-pressed', String(!!ui.landmark));
    const sunForm = $('#hz-sun-form', panel);
    if (sunForm) sunForm.hidden = !(ui.sun && typeof ui.sun === 'object');
    $('#hz-sun', panel)?.setAttribute('aria-pressed', String(!!ui.sun));
  }

  function wirePhotoFields() {
    for (const key of ['width', 'heading', 'tilt', 'roll']) {
      $(`#hz-ph-${key}`, panel).addEventListener('change', (ev) => {
        const v = num(ev.target.value);
        const patch = { [key]: v };
        if (key === 'width' && v >= 360) patch.roll = 0;   // full panoramas are not rolled
        const next = Number.isFinite(v) ? normalizePhotoPlacement({ ...h.photo, ...patch }) : null;
        if (!next || !photo) { renderPhotoFields(); note('Width is 1–360°, tilt −90 to 90°.'); return; }
        placePhoto(next);
        followPhoto();
        commit('align');
      });
    }
    $('#hz-landmark', panel).addEventListener('click', () => {
      settle();
      ui.landmark = ui.landmark ? null : 'pick';
      renderPhotoFields(); renderMode();
      if (ui.landmark) { note('Click a landmark in the photo whose compass direction you know.'); cvs.focus(); }
    });
    $('#hz-landmark-cancel', panel).addEventListener('click', () => { ui.landmark = null; renderPhotoFields(); renderMode(); });
    $('#hz-landmark-apply', panel).addEventListener('click', () => {
      const az = num($('#hz-landmark-az', panel).value);
      if (!Number.isFinite(az) || !photo || typeof ui.landmark !== 'object' || !ui.landmark) {
        note('Enter the landmark’s compass direction in degrees (0 = north, 90 = east).');
        return;
      }
      const next = normalizePhotoPlacement({
        ...h.photo, heading: headingForLandmark(h.photo, photo.width, photo.height, ui.landmark.x, ui.landmark.y, az),
      });
      placePhoto(next);
      ui.landmark = null;
      followPhoto();
      renderMode();
      commit('align');
      note(`North set: the photo centre now faces ${fmt(next.heading)}° (${cardinal(next.heading)}).`);
    });
    $('#hz-sun', panel).addEventListener('click', () => {
      settle();
      if (!siteContext()) { note('Set an observing site first: the Sun\u2019s position depends on where you are.'); return; }
      ui.sun = ui.sun ? null : 'pick';
      ui.landmark = null;
      renderPhotoFields(); renderMode();
      if (ui.sun) { note('Click the centre of the Sun in the photo.'); cvs.focus(); }
    });
    $('#hz-sun-cancel', panel).addEventListener('click', () => { ui.sun = null; renderPhotoFields(); renderMode(); });
    $('#hz-sun-apply', panel).addEventListener('click', applySun);
    $('#hz-detect', panel).addEventListener('click', detect);
    $('#hz-photo-remove', panel).addEventListener('click', removePhoto);
  }

  /* ---- north from the Sun ---- */
  const pad = (n) => String(n).padStart(2, '0');
  const wallInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  /** Fill the capture time from the photo's EXIF data when it has one. */
  async function openSunForm() {
    const input = $('#hz-sun-time', panel), source = $('#hz-sun-source', panel);
    if (!input) return;
    source.textContent = 'Enter when the photo was taken, in the observing site\u2019s time.';
    input.focus();
    let taken = null;
    try { taken = photoCaptureTime(new Uint8Array(await photo.blob.slice(0, 262144).arrayBuffer())); } catch { /* no EXIF */ }
    if (!taken || !input.isConnected || input.value) return;
    if (taken.offsetMin == null) {
      const d = new Date(taken.wall);
      input.value = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
      source.textContent = 'From the photo\u2019s camera clock, read as site time. Check it if the camera was set to another zone.';
    } else {
      input.value = wallInput(utcToWall(new Date(taken.wall - taken.offsetMin * 60000)));
      source.textContent = 'From the photo\u2019s capture time, shown in the observing site\u2019s time.';
    }
  }

  function applySun() {
    const site = siteContext();
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec($('#hz-sun-time', panel).value || '');
    if (!site || !photo || !ui.sun || typeof ui.sun !== 'object' || !m) {
      note('Enter the date and time the photo was taken.');
      return;
    }
    const [y, mo, d, hh, mi, ss] = m.slice(1).map((v) => Number(v || 0));
    const when = wallFieldsToUtc(y, mo - 1, d, hh, mi, ss);
    const sun = sunDirection(julianDay(when), site.lat, site.lon);
    if (sun.alt < -0.5) {
      note(`At that time the Sun was ${fmt(-sun.alt)}° below the horizon at ${site.label || 'this site'}. Check the date, time and observing site.`);
      return;
    }
    const next = placementFromKnownDirection(h.photo, photo.width, photo.height, ui.sun.x, ui.sun.y, sun.az, sun.alt);
    placePhoto(next);
    ui.sun = null;
    followPhoto();
    renderMode();
    commit('align');
    note(`The Sun was at ${fmt(sun.az)}° (${cardinal(sun.az)}), ${fmt(sun.alt)}° high: north and tilt are set from it.`);
  }

  async function removePhoto() {
    const ok = await confirmDialog(box, {
      title: 'Remove the photo?',
      body: 'The skyline stays. The photo is deleted from this browser and undo history starts again.',
      ok: 'Remove photo',
    });
    if (!ok) return;
    settle();
    forgetPhoto(h.id);
    photoDel(h.id).catch(() => {});
    photo = null;
    h.photo = null;
    h.hasPhoto = false;
    ui.mode = 'draw';
    ui.guideFor = null;
    guide.hidden = true;
    Object.assign(hist, newHistory(h));
    changed('photo');
  }

  /** Find the skyline in the photo and replace the points it spans. */
  function detect() {
    if (!photo || !h.photo) return;
    settle();
    const dw = Math.min(DETECT_WIDTH, photo.width);
    const dh = Math.max(2, Math.round(photo.height * dw / photo.width));
    const c = document.createElement('canvas');
    c.width = dw; c.height = dh;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(photo.img, 0, 0, dw, dh);
    let rows;
    try { rows = detectSkylineRows(cx.getImageData(0, 0, dw, dh)); } catch {
      note('The photo could not be read for detection.');
      return;
    }
    const sx = photo.width / dw, sy = photo.height / dh;
    const line = [];
    let unwrap = null;
    rows.forEach((row, x) => {
      if (row == null) return;
      const w = photoToWorld(h.photo, photo.width, photo.height, (x + 0.5) * sx, row * sy);
      const az = unwrap == null ? w.az : unwrap + azDelta(w.az, unwrap);
      unwrap = az;
      line.push({ az, alt: clampAlt(w.alt) });
    });
    if (line.length < 2) { note('No skyline found. Detection needs a daylight photo with clear sky above the skyline.'); return; }
    const simple = simplifyLine(line, 0.25);
    h.points = replacePointsInRange(h.points, simple).slice(0, MAX_POINTS);
    ui.selected = -1;
    ui.mode = 'draw';
    commit('detect');
    note(`Detected ${simple.length} skyline points. Check them and drag any that are off (trees and wires can confuse detection).`);
  }

  /* ---- phone compass ---- */
  const cmp = { on: false, reading: null, absoluteAt: 0, trace: null, timer: null, frame: null };
  const cmpStatus = (text) => { const el = $('#hz-cmp-status', box); if (el) el.textContent = text; };

  function onOrientation(ev) {
    if (ev.alpha == null || ev.beta == null || ev.gamma == null) return;
    let alpha = ev.alpha, absolute = ev.type === 'deviceorientationabsolute' || ev.absolute === true;
    if (typeof ev.webkitCompassHeading === 'number') { alpha = 360 - ev.webkitCompassHeading; absolute = true; }
    // Prefer absolute (compass) readings while they keep arriving.
    if (!absolute && Date.now() - cmp.absoluteAt < 1000) return;
    if (absolute) cmp.absoluteAt = Date.now();
    const raw = devicePointing(alpha, ev.beta, ev.gamma);
    cmp.reading = { raw: raw.az, az: wrapAz(raw.az + ui.compassOffset), alt: raw.alt, absolute };
    if (cmp.trace) {
      const last = cmp.trace[cmp.trace.length - 1];
      if (!last || Math.abs(azDelta(cmp.reading.az, last.az)) >= 0.3 || Math.abs(cmp.reading.alt - last.alt) >= 0.3) {
        cmp.trace.push({ az: cmp.reading.az, alt: clampAlt(cmp.reading.alt) });
      }
    }
    if (cmp.frame == null) cmp.frame = requestAnimationFrame(renderCompass);
  }

  function renderCompass() {
    cmp.frame = null;
    const read = $('#hz-cmp-read', box);
    if (!read) return;
    const r = cmp.reading;
    read.textContent = !cmp.on ? 'Not measuring.' : !r ? 'Waiting for the compass…'
      : `Pointing ${fmt(r.az)}° ${cardinal(r.az)} · ${fmt(r.alt)}° high${r.absolute ? '' : ' (relative: set a correction)'}`
        + `${cmp.trace ? ` · tracing ${cmp.trace.length} samples` : ''}`;
    $('#hz-cmp-start', box).textContent = cmp.on ? 'Stop compass' : 'Start compass';
    $('#hz-cmp-start', box).setAttribute('aria-pressed', String(cmp.on));
    for (const id of ['#hz-cmp-add', '#hz-cmp-trace', '#hz-cmp-correct']) $(id, box).disabled = !(cmp.on && r);
    $('#hz-cmp-trace', box).textContent = cmp.trace ? 'Finish tracing' : 'Start tracing';
    $('#hz-cmp-trace', box).setAttribute('aria-pressed', String(!!cmp.trace));
  }

  function stopCompass() {
    if (!cmp.on) return;
    removeEventListener('deviceorientationabsolute', onOrientation);
    removeEventListener('deviceorientation', onOrientation);
    clearTimeout(cmp.timer);
    Object.assign(cmp, { on: false, reading: null, trace: null });
    if (cvs.isConnected) renderCompass();
  }

  async function startCompass() {
    if (typeof DeviceOrientationEvent === 'undefined') { cmpStatus('This browser has no orientation sensor.'); return; }
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // iOS asks; some browsers expose the call but never settle it. Only an
      // explicit refusal stops us; otherwise listen, and readings arrive once
      // (or if) access is granted.
      const answer = await Promise.race([
        DeviceOrientationEvent.requestPermission().catch(() => 'denied'),
        new Promise((resolve) => setTimeout(() => resolve('pending'), 1500)),
      ]);
      if (answer === 'denied') { cmpStatus('Motion and orientation access was not allowed.'); return; }
    }
    cmp.on = true;
    addEventListener('deviceorientationabsolute', onOrientation);
    addEventListener('deviceorientation', onOrientation);
    cmpStatus('Compass started. Correct it with a landmark, then add points or trace along the skyline.');
    cmp.timer = setTimeout(() => {
      if (cmp.on && !cmp.reading) cmpStatus('No orientation readings: this device may have no compass. Use a phone or tablet.');
    }, COMPASS_WAIT_MS);
    renderCompass();
  }

  $('#hz-cmp-start', box).addEventListener('click', () => (cmp.on ? stopCompass() : startCompass()));
  $('#hz-cmp-add', box).addEventListener('click', () => {
    const r = cmp.reading;
    if (!r) return;
    if (h.points.length >= MAX_POINTS) { cmpStatus(`A horizon has at most ${MAX_POINTS} points.`); return; }
    h.points = normalizePoints([...h.points, { az: r.az, alt: r.alt }]);
    selectAz(Math.round(r.az * 100) / 100);
    commit('compass');
    cmpStatus(`Added a point at ${fmt(r.az)}° ${cardinal(r.az)}, ${fmt(r.alt)}° high.`);
  });
  $('#hz-cmp-trace', box).addEventListener('click', () => {
    if (!cmp.trace) {
      cmp.trace = cmp.reading ? [{ az: cmp.reading.az, alt: clampAlt(cmp.reading.alt) }] : [];
      cmpStatus('Tracing: sweep slowly along the skyline, then press Finish tracing.');
      renderCompass();
      return;
    }
    const samples = cmp.trace;
    cmp.trace = null;
    renderCompass();
    if (samples.length < 2) { cmpStatus('Nothing traced: sweep the phone along the skyline while tracing.'); return; }
    let prev = null;
    const line = simplifyLine(samples.map((p) => {
      const az = prev == null ? p.az : prev + azDelta(p.az, prev);
      prev = az;
      return { az, alt: p.alt };
    }), 0.3);
    h.points = replacePointsInRange(h.points, line).slice(0, MAX_POINTS);
    ui.selected = -1;
    commit('compass');
    cmpStatus(`Traced ${line.length} points from ${fmt(wrapAz(line[0].az))}° to ${fmt(wrapAz(line[line.length - 1].az))}°.`);
  });
  $('#hz-cmp-correct', box).addEventListener('click', () => {
    const truth = num($('#hz-cmp-true', box).value), r = cmp.reading;
    if (!Number.isFinite(truth) || !r) { cmpStatus('Point at a landmark and enter its true direction in degrees.'); return; }
    ui.compassOffset = azDelta(truth, r.raw);
    r.az = wrapAz(r.raw + ui.compassOffset);   // show the corrected reading at once
    renderCompass();
    cmpStatus(`Correction set: ${ui.compassOffset >= 0 ? '+' : ''}${fmt(ui.compassOffset)}°. It applies until you reload the page.`);
  });

  /* ---- start ---- */
  Object.assign(ui, clampView(ui.zoom, ui.fx, ui.fy));
  resize();
  observer?.observe($('#hz-box', box));
  renderStatus(); renderSummary(); renderSelection(); renderPhotoPanel(); renderMode();
  draw();
  if (h.hasPhoto && !photo) {
    loadPhoto(h).then((entry) => {
      if (activeSession?.record !== h) return;
      photo = entry;
      if (!entry) {
        const s = $('#hz-photo-state', panel);
        if (s) s.textContent = 'The photo is missing from this browser’s storage. Remove it to keep working, or add it again.';
        return;
      }
      renderPhotoPanel(); renderMode(); draw();
    });
  }
}
