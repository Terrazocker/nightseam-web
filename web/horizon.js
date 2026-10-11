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
import { vizTheme } from './viztheme.js?v=6';
import { photoSetupHTML, wirePhotoSetup } from './horizonsetup.js?v=15';
import { traceToolsHTML, tracePointsHTML, wireTraceTools } from './horizontrace.js?v=14';
import { inspectPhoto, angularPhotoCanvas, wirePhotoConversion } from './horizonphoto.js?v=6';
import { wireGeographicEvidence } from './horizongeographic.js?v=4';
import { normalizeWebPrefs, WEB_PREF_DEFAULTS } from './webstore.js?v=61';
import {
  NO_BLOCK, BINS, MASK_W, MASK_H,
  rebuildMask, wrapsFor, altOf, rowOfAlt, xOfAz, azOfX, profileFromMask,
  normalizeSourceRect, normalizePanoCalibration, applyDabToMask, strokeSegment,
  normalizeSkylineStroke,
  normalizePhotoCalibration, photoPoint, photoPointAngles,
  normalizePhotoModel,normalizePhotoSource,photoFileDimensions,
  normalizeCoverageEvidence,queryHorizonEvidence,
  normalizeProfileBins, WORLD_BINS, profileSegments, visibleSkyBands,
  skyBandPolygons, computeProfile, clearMask, ceilFor, bandTopFor,
  overhangRuns, assumedOpenRuns, assumedOpenHatchPolys,
  CROP_MIN_FOV, cropPano, cropKeptBand, cropStrokes, clipProfileToFov,
  HORIZON_LANDMARK_KINDS, normalizeHorizonLandmarks,
  normalizeHorizonProvenance, normalizeHorizonConfidence, profileDifference,
  effectiveMinAlt as coreMinAlt,
  snapshotPanoState as coreSnapshotPano, applyPanoState as coreApplySnapshot,
  historyCommit as coreHistoryCommit, historyCanUndo as coreHistoryCanUndo,
  historyCanRedo as coreHistoryCanRedo, historyUndo as coreHistoryUndo,
  historyRedo as coreHistoryRedo, historyMarkSaved as coreHistoryMarkSaved,
  historyDirty as coreHistoryDirty, PANO_HISTORY_LIMIT as coreHISTORY_LIMIT,
  PLANNER_CHANGE_EVENT, nextPlannerRevision, plannerChange, panoramaRevision,
} from './core.js?v=62';

export {
  NO_BLOCK, BINS, MASK_W, MASK_H,
  rebuildMask, altOf, rowOfAlt, xOfAz, azOfX, profileSegments,
  visibleSkyBands, skyBandPolygons, computeProfile, clearMask, ceilFor,
  bandTopFor, overhangRuns, assumedOpenRuns, assumedOpenHatchPolys,
  wrapsFor, CROP_MIN_FOV, cropKeptBand, cropStrokes, clipProfileToFov, cropPano,
  HORIZON_LANDMARK_KINDS, normalizeHorizonLandmarks,
  normalizeHorizonProvenance, normalizeHorizonConfidence, profileDifference,
  normalizeCoverageEvidence, queryHorizonEvidence,
};

const LS_KEY = 'nightseam_panos_v1';
const PROFILE_HEIGHT = 150;
const pendingPhotoSetup = new Set();
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

function announcePanoChanged(pano, cause = 'edit') {
  announcePlannerChange('panorama', {
    cause,
    panoId: pano && pano.id ? pano.id : null,
    panoRevision: panoramaRevision(pano),
  });
}

/* Original panorama bytes live in IndexedDB; memory-only angular surfaces are
   rebuilt from validated geometry. Legacy records may retain only a compressed
   preview; conversion cannot restore detail or metadata already discarded. */
const PANOIMG_DB = 'nightseam-panoimg';

function panoImgOpen() {
  return new Promise((resolve, reject) => {
    try {
      const rq = indexedDB.open(PANOIMG_DB, 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore('imgs'); };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
      rq.onblocked = () => reject(new Error('Panorama image storage is blocked by another tab'));
    } catch (e) { reject(e); }
  });
}
async function panoImgRequest(mode, operation) {
  const dbh = await panoImgOpen();
  try {
    return await new Promise((resolve, reject) => {
      const tx = dbh.transaction('imgs', mode);
      let result = null;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || new Error('Panorama image transaction aborted'));
      tx.onerror = () => {}; // onabort owns transaction failure, including commit failure
      try {
        const rq = operation(tx.objectStore('imgs'));
        rq.onsuccess = () => { result = rq.result ?? null; };
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  } finally { dbh.close(); }
}
const panoImgGet = (id) => panoImgRequest('readonly', (store) => store.get(id));
const panoImgSet = (id, blob) => panoImgRequest('readwrite', (store) => store.put(blob, id));
const panoImgDel = (id) => panoImgRequest('readwrite', (store) => store.delete(id));

let db = load();

// WB4 (review): panoramas live in ONE localStorage blob. Without a cross-tab
// signal, two open tabs silently overwrite each other (last writer wins). A
// storage event from another tab reloads this one so it re-reads before any
// further edit; guarded for the Node harnesses (no addEventListener there).
if (typeof addEventListener === "function") {
  addEventListener("storage", (e) => {
    if (e && (e.key === LS_KEY || e.key === 'nightseam_prefs_v1')) {
      location.reload();
    }
  });
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (Array.isArray(d.panos)) {
        // D1 adapter: stored profiles used to be FOV-relative mask columns;
        // convert once to the canonical world-azimuth bins (idempotent).
        d.panos.forEach(normalizeProfileBins);
        d.panos.forEach((p) => {
          p.sourceRect = normalizeSourceRect(p.sourceRect);
          p.calibration = normalizePhotoCalibration(p.calibration);
          p.photoModel = normalizePhotoModel(p.photoModel);
          p.photoSource = normalizePhotoSource(p.photoSource);
          p.coverageEvidence = normalizeCoverageEvidence(p.coverageEvidence);
          const cal = normalizePanoCalibration(p.altBottom, p.altTop);
          if (cal.altBottom !== p.altBottom || cal.altTop !== p.altTop) {
            Object.assign(p, cal);
            if (p.strokes?.length) computeProfile(p);
          }
        });
        return d;
      }
    }
  } catch { /* ignore */ }
  return { panos: [], activeId: null };
}

function save(state = db) {
  // strip in-memory image data URLs before persisting — they can exceed the
  // localStorage quota; profiles/strokes/calibration are what planning needs.
  // Returns false on storage failure (quota/security): the caller MUST surface
  // it (FIX-5, review WB1) - swallowing it made the editor report "Saved"
  // while the previous state stayed in storage.
  try {
    const slim = { ...state, panos: state.panos.map((p) => {
      const { _img, ...rest } = p;
      return rest;
    }) };
    localStorage.setItem(LS_KEY, JSON.stringify(slim));
    return true;
  } catch { return false; }
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
  return new Promise((resolve, reject) => {
    try {
      const rd = new FileReader();
      rd.onload = () => typeof rd.result === 'string'
        ? resolve(rd.result) : reject(new Error('Could not encode panorama photograph'));
      rd.onerror = () => reject(rd.error || new Error('Could not read panorama photograph'));
      rd.readAsDataURL(blob);
    } catch (error) { reject(error); }
  });
}

function dataUrlToBlob(dataUrl) {
  // Decode locally: fetch(data:) is subject to connect-src, even though the
  // same data URL can be displayed under the document's img-src policy.
  const m = typeof dataUrl === 'string'
    ? /^data:(image\/[^;,]+)(;base64)?,([\s\S]*)$/i.exec(dataUrl) : null;
  if (!m || typeof Blob !== 'function') throw new Error('Invalid panorama photograph data URL');
  const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  if (!bin.length) throw new Error('Panorama photograph is empty');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: m[1] });
}

/** TRUE backup of panoramas: embed the retained original photo for every record whose
 *  image actually exists. A missing/unreadable photograph fails the backup:
 *  safety snapshots must not silently omit data needed for rollback. */
export async function exportPanosWithImages() {
  const panos = [];
  for (const p of db.panos) {
    const { _img, ...rest } = p;
    let image = null;
    if (p.hasImage) {
      // Uploaded/restored bytes are authoritative for this session; an older
      // cached photo with the same id must never replace them in a backup.
      if (typeof p._img === 'string' && p._img.startsWith('data:')) image = p._img;
      else {
        const blob = await panoImgGet(p.id);
        if (!(blob instanceof Blob) || !blob.size) {
          throw new Error(`Photograph for horizon ${p.name || p.id} is missing or unreadable; backup cancelled`);
        }
        image = await blobToDataUrl(blob);
      }
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
  // Validate every supplied photograph before callers write any other store.
  // Even an entry later discarded for its id must not hide malformed bytes.
  try {
    for (const p of data.panos) {
      if (p && p.image !== undefined && p.image !== null) dataUrlToBlob(p.image);
      if (p) normalizeSourceRect(p.sourceRect, true);
      if (p) normalizePhotoCalibration(p.calibration, true);
      if (p) normalizeCoverageEvidence(p.coverageEvidence, true);
      if(p){const model=normalizePhotoModel(p.photoModel,true);
        const source=normalizePhotoSource(p.photoSource,true);
        if(model&&source&&(model.width!==source.width||model.height!==source.height))throw new Error('Photo source dimensions do not match the projection');
        if((model||source)&&p.image){
          const match=/^data:(image\/[^;,]+)(;base64)?,([\s\S]*)$/i.exec(p.image);
          const prefix=match[2]?atob(match[3].slice(0,1398104)):decodeURIComponent(match[3]).slice(0,1048576);
          const size=photoFileDimensions(Uint8Array.from(prefix,c=>c.charCodeAt(0)));
          const expected=model??source;
          if(size.width!==expected.width||size.height!==expected.height)throw new Error('Photo bytes do not match stored source dimensions');
        }
        if(model&&[2,3].includes(p.calibration?.version))throw new Error('Converted photos require source-aware calibration evidence');}
      for (const stroke of p?.strokes || []) {
        if (stroke?.m === 'trace') {
          normalizeSkylineStroke(stroke);
          if (p.paintMode === 'sky') throw new Error('A skyline cannot represent a sky band');
        }
      }
      if ((p?.strokes || []).filter(s => s?.m === 'trace').length > 32) throw new Error('Too many skyline traces');
    }
  } catch { return null; }
  const blank = () => new Array(BINS).fill(NO_BLOCK);
  const num = (v, dflt) => (Number.isFinite(Number(v)) ? Number(v) : dflt);
  // WB5 (review): ids reach DOM data-attributes and IndexedDB keys, so an
  // untrusted backup must not smuggle a non-token/duplicate id into the set,
  // and strokes are bounded (a crafted bundle could otherwise freeze the
  // editor by rebuilding a million-stroke mask).
  const token = (v) => (typeof v === 'string'
    && /^[A-Za-z0-9_-]{1,64}$/.test(v)) ? v : null;
  const seen = new Set();
  const panos = data.panos.filter((p) => {
    const id = token(p && p.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map((p) => {
    const image = (typeof p.image === 'string' && p.image.startsWith('data:')) ? p.image : null;
    const strokes = (Array.isArray(p.strokes) ? p.strokes : []).slice(0, 60000)
      .map(s => s?.m === 'trace' ? normalizeSkylineStroke(s) : { ...s }); // legacy dabs stay ordered
    const rec = {
      id: token(p.id),
      name: p.name || 'Panorama',
      azOffset: num(p.azOffset, 0),
      ...normalizePanoCalibration(p.altBottom, p.altTop),
      fov: num(p.fov, 360) > 0 ? num(p.fov, 360) : 360,
      sourceRect: normalizeSourceRect(p.sourceRect),
      calibration: normalizePhotoCalibration(p.calibration),
      photoModel:normalizePhotoModel(p.photoModel),
      photoSource:normalizePhotoSource(p.photoSource),
      coverageEvidence:normalizeCoverageEvidence(p.coverageEvidence),
      paintMode: p.paintMode === 'sky' ? 'sky' : 'obstacle',
      // sky mode: TRUE when the user explicitly says "block above the band";
      // default FALSE = everything above the painted band is free sky
      blockAbove: !!p.blockAbove,
      strokes,
      profile: (Array.isArray(p.profile) && p.profile.length === BINS) ? p.profile : blank(),
      profileTop: (Array.isArray(p.profileTop) && p.profileTop.length === BINS) ? p.profileTop : blank(),
      landmarks: normalizeHorizonLandmarks(p.landmarks),
      provenance: normalizeHorizonProvenance(p.provenance),
      confidence: normalizeHorizonConfidence(p.confidence),
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

/** Replace panorama records and photos together. Resolves true only after the
 *  image transaction commits; ordinary persistence failures resolve false.
 *  A failed rollback throws, so callers cannot claim the old data is safe. */
export async function applyPanosSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.panos)) return false;
  const pending = [];
  let candidate;
  try {
    candidate = {
      panos: snapshot.panos.map((p) => {
        const { image, _img, ...rest } = p;
        if (image) pending.push([p.id, dataUrlToBlob(image)]);
        else if (p.hasImage) throw new Error('Panorama snapshot is missing photograph bytes');
        return { ...rest, hasImage: !!image, _img: image || null };
      }),
      activeId: snapshot.activeId || null,
    };
  } catch { return false; }
  if (!candidate.activeId && candidate.panos.length) candidate.activeId = candidate.panos[0].id;
  if (candidate.activeId && !candidate.panos.some((p) => p.id === candidate.activeId)) {
    candidate.activeId = candidate.panos.length ? candidate.panos[0].id : null;
  }
  if (!pending.length && !db.panos.some((p) => p.hasImage)) {
    if (!save(candidate)) return false;
  } else {
    let dbh, previousRaw, wroteRecords = false, rollbackError = null;
    try {
      previousRaw = localStorage.getItem(LS_KEY);
      dbh = await panoImgOpen();
      await new Promise((resolve, reject) => {
        const tx = dbh.transaction('imgs', 'readwrite');
        tx.oncomplete = resolve;
        tx.onerror = () => {};
        tx.onabort = () => {
          // IDB rolls photo changes back atomically. If it aborts after the
          // record write, restore the localStorage half before reporting it.
          if (wroteRecords) {
            try {
              if (previousRaw === null) localStorage.removeItem(LS_KEY);
              else localStorage.setItem(LS_KEY, previousRaw);
            } catch (error) { rollbackError = error; }
          }
          reject(tx.error || new Error('Panorama restore transaction aborted'));
        };
        try {
          const store = tx.objectStore('imgs');
          let last = store.clear();
          for (const [id, blob] of pending) last = store.put(blob, id);
          // This callback runs while the transaction can still be aborted.
          last.onsuccess = () => {
            if (!save(candidate)) { tx.abort(); return; }
            wroteRecords = true;
          };
        } catch (error) { tx.abort(); reject(error); }
      });
    } catch (error) {
      if (rollbackError) throw new AggregateError([error, rollbackError], 'Panorama restore failed and its records could not be rolled back');
      return false;
    } finally { if (dbh) dbh.close(); }
  }
  db = candidate;
  // The editor still references the pre-restore object. A later view flush
  // must not save that obsolete session over the restored records.
  if (activeSession && activeSession.disconnect) activeSession.disconnect();
  activeSession = null;
  announcePanoChanged(activePano(), 'restore');
  return true;
}

/** Replace all panoramas from a backup snapshot. Await the committed result. */
export async function importPanos(data) {
  const snapshot = normalizePanos(data);
  if (!snapshot) {
    return false;
  }
  return applyPanosSnapshot(snapshot);
}

export function newPano(name) {
  const id = 'p' + Math.random().toString(36).slice(2, 8);
  const p = {
    id, name,
    azOffset: 0, altBottom: 0, altTop: 60, fov: 360,
    sourceRect: normalizeSourceRect(null),
    calibration: normalizePhotoCalibration(null),
    photoModel: null, photoSource: null,
    coverageEvidence:normalizeCoverageEvidence(null),
    paintMode: 'obstacle',
    blockAbove: false,
    strokes: [],
    hasImage: false,
    profile: new Array(BINS).fill(NO_BLOCK),
    profileTop: new Array(BINS).fill(NO_BLOCK),
    profileBins: WORLD_BINS,
    landmarks: [],
    provenance: normalizeHorizonProvenance({ source: 'manual' }),
    confidence: normalizeHorizonConfidence([]),
  };
  db.panos.push(p);
  if (!db.activeId) { db.activeId = id; }
  save();
  announcePanoChanged(p, 'create');
  return p;
}

export function setActive(id) {
  db.activeId = id;
  save();
  announcePanoChanged(activePano(), 'activate');
}

export function deletePano(id) {
  db.panos = db.panos.filter((p) => p.id !== id);
  if (db.activeId === id) db.activeId = db.panos.length ? db.panos[0].id : null;
  save();
  panoImgDel(id).catch(() => {}); // orphaned photo cleanup does not affect the deleted profile
  announcePanoChanged(activePano(), 'delete');
}

export function updatePano(p) {
  return save();
}

/* ---------------- editor session: history + view (pure) ----------------
 *
 * History stores JSON snapshots of the EDITABLE state (strokes + calibration +
 * paint mode) - no bitmap copies. One paint gesture is one snapshot (committed
 * on pointer up), so a drag is a single undo step. The profile is not stored in
 * the snapshot: it is derived from the strokes (or kept when there are none).
 */
/* The panorama editor's history model lives ONCE in core/panohistory.js and is
   shared with the desktop (shell-unification pass): the two shells had separate
   undo implementations - a bounded stack with no redo and no dirty state on the
   desktop, this step-list-with-baseline here - so "is this edit saved?" could
   be answered differently. The wrappers below keep this module's public surface
   (and the `pano_ui` / `web_backup` engines) intact. */
const HISTORY_KEYS = {
  azOffset: 'azOffset', altBottom: 'altBottom', altTop: 'altTop', fov: 'fov',
  paintMode: 'paintMode', strokes: 'strokes', blockAbove: 'blockAbove',
  profile: 'profile', profileTop: 'profileTop', landmarks: 'landmarks',
  provenance: 'provenance', confidence: 'confidence', sourceRect: 'sourceRect', calibration: 'calibration',photoModel:'photoModel',
  coverageEvidence:'coverageEvidence',
};

/** JSON snapshot of a panorama's EDITABLE state (strokes + calibration + paint
 *  mode; the stored profile only when there are no strokes, because a mask
 *  reproduces a stroke-y profile exactly while a stroke-less one is
 *  AUTHORITATIVE - ruling C, DE-03/WE-02). */
export function snapshotPano(p) {
  return coreSnapshotPano(p, HISTORY_KEYS);
}

export function applySnapshot(p, snap) {
  return coreApplySnapshot(p, snap, HISTORY_KEYS);
}

export const HISTORY_LIMIT = coreHISTORY_LIMIT;

/** New history for a panorama: one entry (the current state) + saved baseline. */
export function newHistory(p) {
  const snap = snapshotPano(p);
  return { entries: [snap], index: 0, baseline: snap, keys: HISTORY_KEYS };
}

export function historyCommit(h, p, limit = HISTORY_LIMIT) {
  return coreHistoryCommit(h, p, limit);
}

export function historyCanUndo(h) { return coreHistoryCanUndo(h); }
export function historyCanRedo(h) { return coreHistoryCanRedo(h); }

export function historyUndo(h, p) { return coreHistoryUndo(h, p); }
export function historyRedo(h, p) { return coreHistoryRedo(h, p); }

/** Mark the current state as saved: the dirty baseline moves to it. */
export function historyMarkSaved(h, p) { return coreHistoryMarkSaved(h, p); }

/** True when the current state differs from the last saved state. Undoing all
 *  the way back to the baseline therefore clears it. */
export function historyDirty(h, p) { return coreHistoryDirty(h, p); }

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
      <input type="radio" name="pano-active" ${p.id === active ? 'checked' : ''} aria-label="Use horizon ${esc(p.name)} for planning">
      <span class="p-name">${esc(p.name)}</span>
      <span class="p-tags">${p.paintMode} · ${p.fov}°${p.hasImage ? ' · 📷' : ''}</span>
      <button class="btn small" data-del="${esc(p.id)}" aria-label="Delete horizon ${esc(p.name)}">🗑</button>
    </li>`;

  box.innerHTML = `
    <div class="card">
      <h3>Your horizons</h3>
      <ul class="pick" id="pano-list">${db.panos.length ? db.panos.map(panoRow).join('') : '<li style="cursor:default">no horizon stored yet</li>'}</ul>
      <div style="margin-top:12px">
        <label>Name <input id="pano-name" type="text" value="backyard" style="width:120px"></label>
        <div class="btnrow action-row" style="margin-top:12px">
          <label class="btn primary" for="pano-file" role="button" tabindex="0" style="text-align:center" title="choose a photo">📷 Add horizon photo</label>
          <button class="btn" id="pano-blank">Blank sky</button>
        </div>
        <input type="file" id="pano-file" accept="image/*" class="vhidden" hidden tabindex="-1">
        <p class="sub" id="pano-note" style="margin-top:8px">Photos stay in this browser. Edits affect your plan immediately; Save horizon keeps them after reload.</p>
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <h3>${active ? `Horizon editor — ${esc(pano.name)}` : 'Horizon editor'}</h3>
      ${active ? haziEditorHTML(pano) : '<p class="sub">create or select a horizon to start painting.</p>'}
    </div>`;
  const cards = [...box.querySelectorAll(':scope > .card')];
  const layout = document.createElement('div');
  layout.className = 'horizon-layout';
  layout.innerHTML = `
    <aside class="horizon-tools-rail" aria-label="Horizon tools" tabindex="0"></aside>
    <section class="horizon-stage" aria-label="Horizon editor"></section>
    <aside class="horizon-settings-rail" aria-label="Horizon calibration and profile settings"></aside>`;
  const tools = layout.querySelector('.horizon-tools-rail');
  const stage = layout.querySelector('.horizon-stage');
  const settings = layout.querySelector('.horizon-settings-rail');
  if (cards[0]) tools.append(cards[0]);
  const editor = cards[1];
  if (editor) {
    const title = editor.querySelector('h3');
    if (title) {
      title.classList.add('horizon-editor-title');
      stage.append(title);
    }
    const controlBar = editor.querySelector('.ed-tools');
    const hint = editor.querySelector('.ed-hint');
    const calibration = editor.querySelector(':scope > .ed-calibration');
    const setup = editor.querySelector(':scope > .horizon-setup');
    const meta = [...editor.querySelectorAll(':scope > .horizon-meta')];
    const canvasBox = editor.querySelector('#pano-box');
    const profile = editor.querySelector('.horizon-profile-panel');
    const profileSelection = editor.querySelector('.horizon-selected-bin');
    if (controlBar) stage.append(controlBar);
    if (hint) stage.append(hint);
    const display = editor.querySelector('.ed-display');
    if (setup) settings.append(setup);
    if (display) settings.append(display);
    const tracePoints = editor.querySelector('.ed-trace-tools');
    const advanced = document.createElement('details');
    advanced.className = 'horizon-advanced';
    const summary = document.createElement('summary'); summary.textContent = 'Advanced editing'; advanced.append(summary);
    if (tracePoints) advanced.append(tracePoints);
    if (calibration) advanced.append(calibration);
    meta.forEach((item) => advanced.append(item));
    if (profileSelection) advanced.append(profileSelection);
    const paintModes = controlBar?.querySelector('.ed-mode');
    if (paintModes) advanced.insertBefore(paintModes, summary.nextSibling);
    settings.append(advanced);
    if (settings.childElementCount) layout.append(settings);
    const canvasStage = document.createElement('section');
    canvasStage.className = 'horizon-canvas-stage';
    canvasStage.setAttribute('aria-label', 'Panorama and obstruction profile');
    if (canvasBox) canvasStage.append(canvasBox);
    if (profile) canvasStage.append(profile);
    if (canvasStage.childElementCount) stage.append(canvasStage);
    const empty = editor.querySelector(':scope > .sub');
    if (empty) stage.append(empty);
  }
  box.replaceChildren(layout);
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
  const mk = (imgDataUrl,photoSource=null) => {
    flushHorizonEdits();
    try {
      const name = ($('#pano-name').value.trim()) || 'horizon';
      const p = newPano(name);
      if (imgDataUrl) {
        p.hasImage = true; p._img = imgDataUrl;
        p.photoSource=photoSource;
        pendingPhotoSetup.add(p.id);
        // Retain original bytes. Angular previews are derived in memory only.
        panoImgSet(p.id,dataUrlToBlob(imgDataUrl)).catch(() => {
            const note = $('#pano-note', box);
            if (note) note.textContent = 'The photograph could not be saved in browser storage. Export a backup before closing this tab to keep it.';
          });
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
  /* SP-07 (0.6.32 review): an uploaded panorama is decoded to a data URL and held
   *  for the whole session, so an unbounded photo costs several times its own size
   *  in RAM (a 60 MB JPEG measured ~80 MB of base64 string plus ~200 MB of decoded
   *  bitmap). Cap it and say why, instead of freezing the tab. */
  const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
  function acceptUpload(f) {
    const note = $('#pano-note');
    if (!f.type || !f.type.startsWith('image/')) {
      if (note) note.textContent = '😕 that is not an image file — pick a JPEG or PNG';
      return false;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      const mb = (f.size / 1048576).toFixed(1);
      if (note) note.textContent = `😕 that image is ${mb} MB — the limit is `
        + `${MAX_UPLOAD_BYTES / 1048576} MB, because the whole photo is decoded and `
        + `kept in memory while the editor is open.`;
      return false;
    }
    return true;
  }

  $('#pano-blank').addEventListener('click', () => mk(null));
  box.querySelector('label[for="pano-file"]').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault(); $('#pano-file').click();
  });
  // the upload button is a <label for="pano-file"> — the browser opens the
  // file picker natively (no JS click involved, works in every browser);
  // drag & drop onto the page is wired once per view container below.
  $('#pano-file').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f || !acceptUpload(f)) return;
    const rd = new FileReader();
    rd.onload = async () => {try{const source=await inspectPhoto(rd.result,f);mk(rd.result,source);}catch(err){$('#pano-note').textContent=err.message;}};
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
      if (!f) return;
      ev.preventDefault();
      if (!acceptUpload(f)) return;
      const rd = new FileReader();
      rd.onload = async () => {try{const source=await inspectPhoto(rd.result,f);mk(rd.result,source);}catch(err){$('#pano-note').textContent=err.message;}};
      rd.readAsDataURL(f);
    });
  }

  if (active) {
    const p = activePano();
    if (p && p.hasImage && !p._img) {
      // Restore retained bytes; legacy records may contain compressed previews.
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
      ${traceToolsHTML()}
      <div class="ed-row" id="ed-paint-options">
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
        <span class="ed-rowlabel">Crop</span>
        <div class="ed-group ed-crop">
          <button class="btn" id="ed-crop" title="Crop horizontally — drag the azimuth band to KEEP">✂ Crop</button>
          <button class="btn primary hidden" id="ed-crop-apply" title="Apply the crop (one undo step)">Apply crop</button>
          <button class="btn hidden" id="ed-crop-cancel" title="Cancel the crop (Esc)">Cancel</button>
          <span id="ed-crop-hint" class="ed-status"></span>
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
          <button class="btn primary" id="ed-save" title="Save this horizon">💾 Save horizon</button>
        </div>
      </div>
    </div>
    <p class="sub ed-hint" style="margin-top:8px">
      <span class="ed-readout">cursor: <output id="ed-pos" class="mono">az \u2014 \u00B7 alt \u2014</output></span>
      <span id="ed-brush-value" class="mono"></span>
      <span class="ed-help">wheel = zoom \u00B7 middle-drag or Space+drag = pan \u00B7 hold right-click = erase</span>
    </p>
    ${tracePointsHTML()}
    ${photoSetupHTML()}
    <details class="ed-calibration"><summary>Exact angles / fine adjustment</summary>
    <p class="sub">Use Photo setup to align known features. Manual changes may require another check.</p>
    <div class="cal-grid" style="margin-top:10px">
      <label>Left edge true bearing (°)
        <input id="ed-az-n" type="number" min="0" max="360" step="any" value="${p.azOffset}">
        <input id="ed-az" type="range" min="0" max="360" step="any" value="${p.azOffset}">
        <output id="ed-az-v">${p.azOffset}\u00B0</output>
      </label>
      <label>Bottom edge altitude (°)
        <input id="ed-ab-n" type="number" min="-30" max="85" step="any" value="${p.altBottom}">
        <input id="ed-ab" type="range" min="-30" max="85" step="any" value="${p.altBottom}">
        <output id="ed-ab-v">${p.altBottom}\u00B0</output>
      </label>
      <label>Top edge altitude (°)
        <input id="ed-at-n" type="number" min="${p.altBottom + 5}" max="90" step="any" value="${p.altTop}">
        <input id="ed-at" type="range" min="0" max="90" step="any" value="${p.altTop}">
        <output id="ed-at-v">${p.altTop}\u00B0</output>
      </label>
      <label>Horizontal width (°)
        <input id="ed-fov-n" type="number" min="5" max="360" step="any" value="${p.fov}">
        <input id="ed-fov" type="range" min="5" max="360" step="any" value="${p.fov}">
        <output id="ed-fov-v">${p.fov}\u00B0</output>
      </label>
    </div><p id="ed-cal-error" class="sub" role="alert"></p></details>
    <details class="ed-display">
      <summary>Display</summary>
      <label>Paint opacity <input id="ed-opacity" type="range" min="15" max="85" value="65" aria-label="Paint opacity"></label>
      <label><input id="ed-grid" type="checkbox" checked> Show grid</label>
      <p class="sub">Brush size covers the same angles at every zoom; its preview magnifies with the photo.</p>
    </details>
    <details class="horizon-meta">
      <summary>Named obstruction landmarks</summary>
      <div id="ed-landmarks" class="landmark-list" role="list"></div>
      <div class="landmark-add">
        <input id="ed-landmark-name" type="text" maxlength="96" placeholder="Name (e.g. east roof)" aria-label="Landmark name">
        <select id="ed-landmark-kind" aria-label="Landmark type">${HORIZON_LANDMARK_KINDS.map((v) => `<option value="${v}">${v}</option>`).join('')}</select>
        <input id="ed-landmark-az" type="number" min="0" max="359.99" step="0.5" placeholder="Az °" aria-label="Landmark azimuth">
        <input id="ed-landmark-alt" type="number" min="-90" max="90" step="0.5" placeholder="Alt °" aria-label="Landmark altitude">
        <button class="btn small" id="ed-landmark-add" type="button">Add</button>
      </div>
      <p class="sub">Landmarks document what the profile represents; they do not change visibility by themselves.</p>
    </details>
    <details class="horizon-meta">
      <summary>Precise horizon values (advanced)</summary>
      <p class="sub">Applying a bin keeps the current world profile, changes that bin and replaces all brush paint and editable traces. Undo restores them. For ordinary terrain, use Trace skyline; use Brush for local corrections or sky openings.</p>
      <div class="cal-grid">
        <label>Direction (azimuth °)
          <input id="ed-profile-az" type="number" min="0" max="359.5" step="0.5" value="0">
        </label>
        <label><span id="ed-profile-alt-label">${p.paintMode === 'sky' ? 'Visible sky starts at (°)' : 'Obstruction height (°)'}</span>
          <input id="ed-profile-alt" type="number" min="-90" max="90.5" step="0.1" value="${Number(p.profile?.[0] ?? NO_BLOCK)}">
        </label>
        <label>Visible sky ends at (°, sky mode)
          <input id="ed-profile-top" type="number" min="-90" max="90.5" step="0.1" value="${Number(p.profileTop?.[0] ?? NO_BLOCK)}" ${p.paintMode === 'sky' ? '' : 'disabled'}>
        </label>
        <label>Measurement confidence (optional)
          <input id="ed-profile-confidence" type="number" min="0" max="1" step="0.05" placeholder="Unknown; 0–1">
        </label>
      </div>
      <div class="btnrow">
        <button class="btn" id="ed-profile-read" type="button">Read direction</button>
        <button class="btn" id="ed-profile-apply" type="button">Apply values</button>
        <select id="ed-profile-compare" aria-label="Compare this horizon with another"><option value="">Compare with…</option>${db.panos.filter((q) => q.id !== p.id).map((q) => `<option value="${esc(q.id)}">${esc(q.name)}</option>`).join('')}</select>
      </div>
      <p class="sub">0° = north, 90° = east, 180° = south, 270° = west. Directions are stored every 0.5°. Height is above the level horizon; −90 means no recorded obstruction or band edge. Confidence: 0 = uncertain, 1 = confident; it does not change visibility.</p>
      <p id="ed-profile-compare-summary" class="sub" role="status" aria-live="polite">Choose another horizon to compare its obstruction heights or lower sky edge. Comparison does not change either horizon.</p>
      <p class="sub">Apply values keeps the current horizon heights and changes this direction, but replaces all editable paint strokes with stored angles. Undo restores the previous state. Press Save to keep the change.</p>
    </details>
    <div class="pano-canvas-box" id="pano-box">
      <canvas id="pano-ruler-top" aria-hidden="true"></canvas>
      <canvas id="pano-ruler-left" aria-hidden="true"></canvas>
      <canvas id="pano-canvas" width="720" height="360" tabindex="0" role="img" aria-label="Panorama horizon editor" aria-describedby="panoChartSummary"></canvas>
      <button id="ed-point-remove" class="btn small" type="button" hidden>Remove point</button>
      <p id="panoChartSummary" class="visually-hidden" role="note">Panorama horizon editor. Use the paint controls to mark obstructions or visible sky.</p>
      <div class="ed-view-overlay" role="group" aria-label="View controls">
        <button class="btn small" id="ed-zoom-out" title="Zoom out" aria-label="Zoom out">\u2212</button>
        <span id="ed-zoom-label" class="mono">1.0\u00D7</span>
        <button class="btn small" id="ed-zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
        <button class="btn small" id="ed-fit" title="Fit the whole panorama">Fit</button>
      </div>
    </div>
    <details class="horizon-profile-panel" aria-labelledby="panoProfileHeading">
      <summary id="panoProfileHeading">Horizon profile · 720 bins</summary>
      <canvas id="pano-profile" width="720" height="${PROFILE_HEIGHT}" tabindex="0" role="img" aria-label="Horizon profile by world azimuth" aria-describedby="panoProfileSummary panoProfileBinSummary"></canvas>
      <p id="panoProfileSummary" class="visually-hidden" role="note">Horizon profile preview.</p>
      <div class="horizon-profile-metrics" role="group" aria-label="Stored horizon profile summary">
        <span><small>Azimuth coverage</small><b id="horizon-profile-coverage">—</b></span>
        <span><small id="horizon-profile-peak-label">Highest obstruction</small><b id="horizon-profile-peak">—</b></span>
        <span><small>Named landmarks</small><b id="horizon-profile-landmarks">0</b></span>
        <span><small>Confidence recorded</small><b id="horizon-profile-confidence">0 / 0 bins</b></span>
      </div>
      <div class="horizon-profile-legend" aria-label="Profile chart legend">
        <span><i class="profile-legend-stroke" aria-hidden="true"></i>Stored profile</span>
        <span><i class="profile-legend-minimum" aria-hidden="true"></i>Minimum altitude</span>
        <span><i class="profile-legend-compare" aria-hidden="true"></i>Comparison profile</span>
        <span>Confidence recorded</span>
      </div>
      <details class="horizon-profile-help"><summary>Profile guide</summary>
        <p>Click the graph to select a world-azimuth bin. The solid profile is stored data; the dashed blue line appears only when another horizon is selected for comparison. Amber marks the existing minimum-altitude guide.</p>
        <p>Edits affect planning immediately. Press Save to keep them, or Revert to discard them.</p>
      </details>
    </details>
    <section class="horizon-selected-bin" aria-labelledby="panoProfileBinHeading">
      <h4 id="panoProfileBinHeading">Selected profile bin</h4>
      <p id="panoProfileBinSummary" class="profile-bin-summary" role="status" aria-live="polite">Select a point on the profile to inspect its 0.5° world-azimuth bin.</p>
    </section>`;
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

/** Keep the editor's saved baseline and undo branch across a failed whole-app
 *  restore. Panorama backup bytes alone cannot describe that session history. */
export function captureEditorHistory() {
  if (!activeSession || !activeSession.hist) return null;
  activeSession.settle?.();
  return {
    panoId: activeSession.panoId,
    hist: JSON.parse(JSON.stringify(activeSession.hist)),
  };
}

/** Reattach a history checkpoint after the original panorama snapshot has been
 *  rolled back. The next render wires fresh controls around this same history. */
export function restoreEditorHistory(checkpoint) {
  if (!checkpoint || !checkpoint.hist) return false;
  const p = db.panos.find((item) => item.id === checkpoint.panoId);
  if (!p) return false;
  if (activeSession && activeSession.disconnect) activeSession.disconnect();
  const hist = JSON.parse(JSON.stringify(checkpoint.hist));
  activeSession = {
    panoId: p.id, hist,
    dirty: () => historyDirty(hist, p),
    save: () => {
      computeProfile(p);
      if (!updatePano(p)) return false;
      historyMarkSaved(hist, p);
      return true;
    },
  };
  return true;
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
function cleanPrefs(value) {
  return normalizeWebPrefs(value);
}
/** Patch preferences for ordinary UI edits. Failed writes leave live state intact. */
export function setPrefs(patch) {
  const candidate = cleanPrefs({ ...prefs, ...patch });
  if (!savePrefs(candidate)) return false;
  prefs = candidate;
  return true;
}
/** Restore is replacement: absent preferences regain defaults instead of inheriting
 *  settings from the current browser. */
export function replacePrefs(value) {
  const candidate = cleanPrefs({ ...WEB_PREF_DEFAULTS, ...value });
  if (!savePrefs(candidate)) return false;
  prefs = candidate;
  return true;
}
function loadPrefs() {
  try {
    const raw = localStorage.getItem('nightseam_prefs_v1');
    if (raw) return cleanPrefs({ ...WEB_PREF_DEFAULTS, ...JSON.parse(raw) });
  } catch { /* ignore */ }
  return cleanPrefs(WEB_PREF_DEFAULTS);
}
function savePrefs(value) {
  try {
    localStorage.setItem('nightseam_prefs_v1', JSON.stringify(value));
    return true;
  } catch { return false; }
}

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
  const rulerTop = $('#pano-ruler-top', box), rulerLeft = $('#pano-ruler-left', box);

  const ui = activeSession?.panoId === p.id && activeSession.ui ? activeSession.ui : {
    view: { zoom: 1, fx: null, fy: null }, brush: 28, eraser: false, opacity: 65, grid: true,
    setupStep: pendingPhotoSetup.has(p.id) ? 0 : 4,
  };
  pendingPhotoSetup.delete(p.id);
  let setup = null;
  let traceTools = null, tracing = false;
  let eraser = ui.eraser;
  let gestureErase = false;   // right-button drag erases for the whole gesture
  let painting = false;
  let panning = false;
  let cropTool = false;       // crop mode: drag a band to KEEP
  let cropSel = null;         // {x0,x1} in logical mask px (base coords)
  let cropping = false;
  let spaceDown = false;
  let panPrev = null;
  let imgEl = null;
  let angularEl=null,angularKey='',conversionPreview=null;
  function ensurePhotoSurface(){
    const key=JSON.stringify(p.photoModel??null);if(key===angularKey)return;
    angularEl=p.photoModel&&imgEl?angularPhotoCanvas(imgEl,p.photoModel):null;angularKey=key;
  }
  let imgErr = false;
  let mask = rebuildMask(p.strokes, wrapsFor(p));

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = MASK_W;
  maskCanvas.height = MASK_H;
  const maskCtx = maskCanvas.getContext('2d');

  const view = ui.view;
  $('#ed-brush', box).value = String(ui.brush);
  $('#ed-opacity', box).value = String(ui.opacity);
  $('#ed-grid', box).checked = ui.grid;
  $('#ed-eraser', box).classList.toggle('on', eraser);
  $('#ed-eraser', box).setAttribute('aria-pressed', String(eraser));
  let brushPoint = null, activePointerId = null, lastPaintPoint = null;
  let paintFrame = null, maskDirty = true, profileDirty = true;
  /* WE-05 (0.6.32 review): re-rendering the SAME panorama must NOT reset the
     history baseline. `newHistory(p)` makes the CURRENT state - including
     unsaved paint - the "saved" baseline, so any `refreshView()` while the
     editor was open (a min-alt, site, date, rig, Bortle, filter, size-unit,
     moon-aware or timezone change) flipped the chip to "Saved", made
     `horizonUnsaved()` false, and silently disarmed BOTH the `flushHorizonEdits()`
     call on navigating away AND the `beforeunload` guard: the paint was lost on
     reload. Only a DIFFERENT panorama (switch or create) starts a new history. */
  const samePano = !!(activeSession && activeSession.panoId
                      && activeSession.panoId === p.id && activeSession.hist);
  const hist = samePano ? activeSession.hist : newHistory(p);
  if (activeSession?.disconnect) activeSession.disconnect();
  ui.disclosures ??= {};
  box.querySelectorAll('details').forEach(el => {
    const key = el.id || el.querySelector(':scope > summary')?.textContent;
    if (key && key in ui.disclosures) el.open = ui.disclosures[key];
    el.addEventListener('toggle', () => { if (key && el.isConnected) ui.disclosures[key] = el.open; });
  });
  let status = 'saved';                    // 'saved' | 'saving' | 'failed'
  let metadataPending = false;
  const paintMode = () => p.paintMode;
  const paintRGB = () => (p.paintMode === 'obstacle' ? [255, 80, 80] : [120, 230, 140]);
  const dirty = () => painting || tracing || metadataPending || historyDirty(hist, p);

  function markMetadataPending() {
    metadataPending = true;
    renderStatus();
  }

  let displayedBin = profileIndex();
  function syncMetadataFromUI() {
    finishGesture();
    const field = $('#ed-profile-confidence', box);
    if (!field || (field.value !== '' && !field.validity.valid)) return;
    const value = field.value === '' ? null : num(field.value);
    if (value !== null && !Number.isFinite(value)) return;
    p.confidence = normalizeHorizonConfidence(p.confidence);
    if (p.confidence[displayedBin] === value) return;
    p.confidence[displayedBin] = value;
    markMetadataPending();
  }

  function profileIndex() {
    const az = num($('#ed-profile-az', box)?.value);
    const a = Number.isFinite(az) ? ((az % 360) + 360) % 360 : 0;
    return Math.min(BINS - 1, Math.max(0, Math.round(a * 2)));
  }

  function updateProfileMetrics() {
    const coverage = $('#horizon-profile-coverage', box);
    const peakLabel = $('#horizon-profile-peak-label', box);
    const peak = $('#horizon-profile-peak', box);
    const landmarks = $('#horizon-profile-landmarks', box);
    const confidence = $('#horizon-profile-confidence', box);
    const span = Math.max(1, Math.min(BINS, Math.round(Math.min(360, Number(p.fov) || 0) * 2)));
    const start = ((Math.round(Number(p.azOffset || 0) * 2) % BINS) + BINS) % BINS;
    const indices = Array.from({ length: span }, (_, i) => (start + i) % BINS);
    const values = (arr) => indices.map((i) => Number(arr?.[i]))
      .filter((value) => Number.isFinite(value) && value > NO_BLOCK && value <= 90);
    const bottoms = values(p.profile);
    const tops = values(p.profileTop);
    const recorded = indices.reduce((n, i) => n + (p.confidence?.[i] != null
      && Number.isFinite(Number(p.confidence[i])) ? 1 : 0), 0);
    if (coverage) coverage.textContent = Number.isFinite(Number(p.fov))
      ? `${Math.min(360, Number(p.fov)).toFixed(0)}°` : '—';
    if (landmarks) landmarks.textContent = String(Array.isArray(p.landmarks) ? p.landmarks.length : 0);
    if (confidence) confidence.textContent = `${recorded} / ${span} bins`;
    if (peakLabel) peakLabel.textContent = p.paintMode === 'sky'
      ? 'Band bottom / top' : 'Highest obstruction';
    if (peak) {
      if (p.paintMode === 'sky') {
        const bottom = bottoms.length ? `${Math.max(...bottoms).toFixed(0)}°` : '—';
        const top = tops.length ? `${Math.max(...tops).toFixed(0)}°` : '—';
        peak.textContent = `${bottom} / ${top}`;
      } else {
        peak.textContent = bottoms.length ? `${Math.max(...bottoms).toFixed(0)}°` : '—';
      }
    }
  }

  function readProfileBin() {
    commitMetadata();
    const idx = profileIndex();
    displayedBin = idx;
    const alt = $('#ed-profile-alt', box);
    const top = $('#ed-profile-top', box);
    const conf = $('#ed-profile-confidence', box);
    if (alt) alt.value = String(Number(p.profile?.[idx] ?? NO_BLOCK));
    if (top) top.value = String(Number(p.profileTop?.[idx] ?? NO_BLOCK));
    const cv = normalizeHorizonConfidence(p.confidence)[idx];
    if (conf) conf.value = cv == null ? '' : String(cv);
    const summary = $('#panoProfileBinSummary', box);
    if (summary) {
      const lower = Number(p.profile?.[idx] ?? NO_BLOCK);
      const upper = Number(p.profileTop?.[idx] ?? NO_BLOCK);
      const skyMode = p.paintMode === 'sky';
      const lowerText = lower <= NO_BLOCK
        ? (skyMode ? 'band bottom not recorded' : 'no obstruction')
        : `${skyMode ? 'band bottom' : 'obstruction ceiling'} ${lower.toFixed(1)}°`;
      const upperText = skyMode
        ? ` · band top ${upper > NO_BLOCK && upper <= 90 ? `${upper.toFixed(1)}° (block above ${p.blockAbove ? 'on' : 'off'})` : 'not recorded'}`
        : (p.blockAbove && upper > NO_BLOCK ? ` · upper boundary ${upper.toFixed(1)}°` : '');
      const confidence = cv == null ? 'confidence not recorded' : `confidence ${(cv * 100).toFixed(0)}%`;
      summary.textContent = `Azimuth ${(idx / 2).toFixed(1)}° · ${lowerText}${upperText} · ${confidence}.`;
    }
    drawProfile();
  }

  function renderLandmarkRows() {
    const list = $('#ed-landmarks', box);
    if (!list) return;
    list.innerHTML = p.landmarks.map((lm, i) => `
      <div class="landmark-row" data-lm-index="${i}" role="listitem">
        <input data-lm="name" type="text" maxlength="96" value="${esc(lm.name)}" aria-label="Landmark ${i + 1} name">
        <select data-lm="kind" aria-label="Landmark ${i + 1} type">${HORIZON_LANDMARK_KINDS.map((v) => `<option value="${v}"${lm.kind === v ? ' selected' : ''}>${v}</option>`).join('')}</select>
        <input data-lm="azimuth" type="number" min="0" max="359.99" step="0.5" value="${lm.azimuth}" aria-label="Landmark ${i + 1} azimuth">
        <input data-lm="altitude" type="number" min="-90" max="90" step="0.5" value="${lm.altitude}" aria-label="Landmark ${i + 1} altitude">
        <button class="btn small" data-lm-remove type="button" aria-label="Remove ${esc(lm.name)}">Remove</button>
      </div>`).join('') || '<p class="sub">No named landmarks yet.</p>';
    list.querySelectorAll('[data-lm]').forEach((el) => el.addEventListener('change', () => {
      finishGesture();
      const row = el.closest('[data-lm-index]');
      const i = Number(row?.dataset.lmIndex);
      if (!Number.isInteger(i) || !p.landmarks[i]) return;
      const key = el.dataset.lm;
      p.landmarks[i] = { ...p.landmarks[i], [key]: key === 'kind' || key === 'name'
        ? el.value : num(el.value) };
      p.landmarks = normalizeHorizonLandmarks(p.landmarks);
      markMetadataPending();
    }));
    list.querySelectorAll('[data-lm-remove]').forEach((el) => el.addEventListener('click', () => {
      finishGesture();
      const row = el.closest('[data-lm-index]');
      const i = Number(row?.dataset.lmIndex);
      if (!Number.isInteger(i)) return;
      p.landmarks.splice(i, 1);
      renderLandmarkRows();
      markMetadataPending();
    }));
  }

  function compareProfile() {
    const sel = $('#ed-profile-compare', box);
    const out = $('#ed-profile-compare-summary', box);
    if (!sel || !out || !sel.value) {
      if (out) out.textContent = 'Choose another horizon to compare its obstruction heights or lower sky edge. Comparison does not change either horizon.';
      return;
    }
    const other = db.panos.find((q) => q.id === sel.value);
    if (!other) return;
    const d = profileDifference(p.profile, other.profile);
    out.textContent = d.compared
      ? `${other.name}: mean difference ${d.meanAbs.toFixed(1)}°; maximum ${d.maxAbs.toFixed(1)}° at azimuth ${d.azAtMax.toFixed(1)}° (${d.compared} bins compared).`
      : `${other.name}: no comparable profile bins.`;
  }

  /* ---- DPR-aware sizing: the backing store follows the displayed size, so
   *      lines and labels stay sharp; all drawing stays in the 720x360 logical
   *      space, so the stored geometry and the pointer mapping never change. */
  function fitCanvas() {
    if (!cvs.isConnected) return; // a late photo decode cannot repaint an old editor/profile
    const w = Math.max(64, (boxEl.clientWidth || MASK_W) - 43);
    const dpr = window.devicePixelRatio || 1;
    const photo=angularEl??imgEl;
    const sourceRatio = photo && (photo.naturalWidth||photo.width)>0
      ? (photo.naturalHeight||photo.height) * normalizeSourceRect(p.sourceRect).h /
        ((photo.naturalWidth||photo.width) * normalizeSourceRect(p.sourceRect).w) : MASK_H / MASK_W;
    cvs.width = Math.round(w * dpr);
    cvs.height = Math.round(w * sourceRatio * dpr);
    rulerTop.width = cvs.width; rulerTop.height = Math.round(23 * dpr);
    rulerLeft.width = Math.round(43 * dpr); rulerLeft.height = cvs.height;
    profCvs.width = Math.round((boxEl.clientWidth || MASK_W) * dpr);
    profCvs.height = Math.round(PROFILE_HEIGHT * dpr);
    overlay();
  }

  function ctxTransform() {
    const sx = cvs.width / MASK_W, sy = cvs.height / MASK_H;
    const m = editorViewMatrix(MASK_W, MASK_H, view.zoom, view.fx, view.fy);
    ctx.setTransform(sx * m.a, 0, 0, sy * m.d, sx * m.e, sy * m.f);
  }

  function drawGrid(err) {
    const V = vizTheme();
    ctx.fillStyle = V.canvas;
    ctx.fillRect(0, 0, MASK_W, MASK_H);
    ctx.strokeStyle = V.grid;
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const y = (i / 8) * MASK_H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MASK_W, y); ctx.stroke();
    }
    if (err) {
      ctx.fillStyle = V.warn;
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
      img.onload = () => {try{imgEl=img;angularKey='';ensurePhotoSurface();fitCanvas();}
        catch(err){imgErr=true;imgEl=null;angularEl=null;$('#photo-result',box).textContent=err.message;fitCanvas();}};
      img.onerror = () => { imgErr = true; fitCanvas(); };
      img.src = p._img;
    } else {
      overlay();
    }
  }

  function syncMaskCanvas() {
    if (!maskDirty) return;
    maskDirty = false;
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
        img.data[o + 3] = Math.round(ui.opacity * 2.55);
      }
    }
    maskCtx.putImageData(img, 0, 0);
  }

  function overlay() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctxTransform();
    if (imgEl && imgEl.complete && imgEl.naturalWidth) drawImageStage(ctx, angularEl??imgEl, MASK_W, MASK_H, p.sourceRect);
    else drawGrid(imgErr);
    syncMaskCanvas();
    ctx.drawImage(maskCanvas, 0, 0, MASK_W, MASK_H);
    drawCropOverlay();
    drawGuides();
    drawCalibrationPoints();
    traceTools?.draw(ctx);
    drawBrushPreview();
    drawProfile();
    renderStatus();
  }

  /** Project angular guides, then draw rulers/text in CSS pixels, never image pixels. */
  function screenGeometry() {
    const r = cvs.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    const m = editorViewMatrix(MASK_W, MASK_H, view.zoom, view.fx, view.fy);
    return { w, h, x: (x) => (m.a * x + m.e) * w / MASK_W,
      y: (y) => (m.d * y + m.f) * h / MASK_H };
  }
  function drawGuides() {
    const V = vizTheme(), g = screenGeometry();
    const q = setup?.preview() || p;
    const top = rulerTop.getContext('2d'), left = rulerLeft.getContext('2d');
    top.setTransform(rulerTop.width/g.w,0,0,rulerTop.height/23,0,0);
    left.setTransform(rulerLeft.width/43,0,0,rulerLeft.height/g.h,0,0);
    top.clearRect(0,0,g.w,23); left.clearRect(0,0,43,g.h);
    for (const axis of [top,left]) { axis.font = '12px system-ui'; axis.textBaseline = 'middle'; }
    ctx.save();
    ctx.setTransform(cvs.width / g.w, 0, 0, cvs.height / g.h, 0, 0);
    const line = (x0, y0, x1, y1, color, dashed = false) => {
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.setLineDash(dashed ? [4, 4] : []);
      ctx.beginPath(); ctx.moveTo(Math.round(x0) + 0.5, Math.round(y0) + 0.5);
      ctx.lineTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5); ctx.stroke();
      ctx.setLineDash([]);
    };
    ctx.font = '12px system-ui'; ctx.textBaseline = 'middle';
    const niceStep = (desired) => [1, 2, 5, 10, 15, 30, 45, 90].find((v) => v >= desired) || 90;
    const altStep = niceStep((q.altTop - q.altBottom) / view.zoom * 40 / g.h);
    for (let alt = Math.ceil(q.altBottom / altStep) * altStep; alt <= q.altTop; alt += altStep) {
      const y = g.y(rowOfAlt(q, alt));
      const zero = Math.abs(alt) < 1e-6;
      if (y < -1 || y > g.h + 1) continue;
      const labelY = Math.min(g.h - 8, Math.max(8, y));
      if (ui.grid || zero) line(0, Math.min(g.h - 1, y), g.w, Math.min(g.h - 1, y), zero ? V.good : V.grid, zero);
      left.fillStyle = zero ? V.good : V.axis; left.textAlign = 'left';
      left.fillText(`${alt > 0 ? '+' : ''}${alt}°`, 4, labelY);
    }
    const step = niceStep(q.fov / view.zoom * 65 / g.w);
    let labels = 0;
    for (let a = Math.ceil(q.azOffset / step) * step; a <= q.azOffset + q.fov + 1e-6; a += step) {
      const x = g.x(xOfAz(q, a));
      if (x < 18 || x > g.w - 18) continue;
      const az = ((a % 360) + 360) % 360, major = az % 90 === 0;
      if (ui.grid) line(x, 0, x, g.h, major ? V.gridStrong : V.gridSub, !major);
      top.font = major ? '600 12px system-ui' : '12px system-ui';
      top.fillStyle = major ? V.minLabel : V.axis; top.textAlign = 'center';
      top.fillText(major ? ['N', 'E', 'S', 'W'][az / 90] : `${az}°`, x, 12);
      labels++;
    }
    if (!labels) {
      const [x] = editorScreenToBase(MASK_W, MASK_H, view.zoom, view.fx, view.fy, MASK_W / 2, MASK_H / 2);
      top.fillStyle = V.axis; top.textAlign = 'center';
      top.fillText(`${azOfX(q, x).toFixed(1)}°`, g.w / 2, 12);
    }
    ctx.restore();
  }
  function drawBrushPreview() {
    if (!brushPoint || cropTool || panning || (traceTools?.active() && !gestureErase) || setup?.isPicking()) return;
    const g = screenGeometry(), r = ui.brush;
    ctx.save(); ctx.setTransform(cvs.width / g.w, 0, 0, cvs.height / g.h, 0, 0);
    ctx.lineWidth = 1.5; ctx.strokeStyle = (eraser || gestureErase) ? vizTheme().warn : vizTheme().text;
    ctx.setLineDash((eraser || gestureErase) ? [3, 3] : []);
    ctx.beginPath();
    const xs = wrapsFor(p) ? [brushPoint[0] - MASK_W, brushPoint[0], brushPoint[0] + MASK_W] : [brushPoint[0]];
    for (const x of xs) {
      ctx.moveTo(g.x(x) + r * g.w / MASK_W * view.zoom, g.y(brushPoint[1]));
      ctx.ellipse(g.x(x), g.y(brushPoint[1]), r * g.w / MASK_W * view.zoom,
        r * g.h / MASK_H * view.zoom, 0, 0, Math.PI * 2);
    }
    ctx.stroke(); ctx.restore();
  }

  function drawCalibrationPoints() {
    if (ui.setupStep === 4) return;
    const e = normalizePhotoCalibration(p.calibration), g = screenGeometry(), V = vizTheme();
    const draftMarkers = setup?.markers();
    const points = draftMarkers ? draftMarkers.map(v => [photoPoint(p,v.x,v.y),v.label])
      : [[e.bearing, 'D'], [e.vertical[0], 'L'], [e.vertical[1], 'V'], [e.check, 'C']];
    ctx.save(); ctx.setTransform(cvs.width / g.w, 0, 0, cvs.height / g.h, 0, 0);
    ctx.font = '600 12px system-ui'; ctx.lineWidth = 2; ctx.textAlign = 'left';
    for (const [point, label] of points) {
      if (!point) continue;
      const position = photoPointAngles(p, point);
      if (!position.inside) continue;
      const x = g.x(position.x * MASK_W), y = g.y(position.y * (MASK_H - 1));
      ctx.strokeStyle = V.text; ctx.fillStyle = V.canvas;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillRect(x + 8, y - 10, 18, 20); ctx.fillStyle = V.text; ctx.fillText(label, x + 11, y + 4);
    }
    ctx.restore();
  }

  function drawProfile() {
    const V = vizTheme();
    // Invariant: with no strokes the stored profile stays authoritative.
    if (p.strokes.length > 0 && profileDirty) {
      profileDirty = false;
      const { prof, top } = profileFromMask(p, mask);
      p.profile = prof;
      p.profileTop = top;
    }
    const W = Math.max(1, profCvs.getBoundingClientRect().width), H = PROFILE_HEIGHT;
    const sx = profCvs.width / W, sy = profCvs.height / H;
    profCtx.setTransform(sx, 0, 0, sy, 0, 0);
    profCtx.clearRect(0, 0, W, H);
    profCtx.fillStyle = V.canvas;
    profCtx.fillRect(0, 0, W, H);
    const lo = Math.min(p.altBottom, 0);
    const hi = Math.max(p.altTop, 10);
    const altY = (alt) => H - ((alt - lo) / Math.max(1, hi - lo)) * H;
    const minimum = effectiveMinAlt();
    const guides = [
      { alt: 0, color: V.dim, dash: [2, 4], label: 'horizon 0°' },
      { alt: minimum, color: V.minStroke, dash: [7, 4], label: `min ${minimum.toFixed(0)}°` },
    ].filter((guide, i, all) => guide.alt >= lo && guide.alt <= hi
      && all.findIndex((item) => Math.abs(item.alt - guide.alt) < 0.1) === i);
    for (const guide of guides) {
      const y = altY(guide.alt);
      profCtx.save();
      profCtx.strokeStyle = guide.color;
      profCtx.fillStyle = guide.color;
      profCtx.lineWidth = 1;
      profCtx.setLineDash(guide.dash);
      profCtx.beginPath(); profCtx.moveTo(0, y); profCtx.lineTo(W, y); profCtx.stroke();
      profCtx.setLineDash([]);
      profCtx.font = '10px system-ui';
      profCtx.fillText(guide.label, 6, Math.max(12, y - 3));
      profCtx.restore();
    }
    // preview geometry: the SAME shared transform as the desktop (one x per
    // 720 bins across the full width), so the sky band is the exact complement
    // of the blocked region and never self-intersects or wraps the seam.
    const azOff = 0, fov = 360;
    if (paintMode() === 'obstacle') {
      const segs = profileSegments(p.profile, W, H, lo, hi, azOff, fov, 90.5);
      profCtx.strokeStyle = V.bad;
      profCtx.lineWidth = 2;
      profCtx.beginPath();
      for (const s of segs) {
        s.forEach(([x, y], k) => (k ? profCtx.lineTo(x, y) : profCtx.moveTo(x, y)));
      }
      profCtx.stroke();
    } else {
      profCtx.fillStyle = V.goodFill;
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
        profCtx.strokeStyle = V.assumedHatch;
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
    const compareId = $('#ed-profile-compare', box)?.value;
    const compare = compareId ? db.panos.find((q) => q.id === compareId) : null;
    if (compare && Array.isArray(compare.profile) && compare.profile.length === BINS) {
      const compareSegs = profileSegments(compare.profile, W, H, lo, hi, azOff, fov, 90.5);
      profCtx.save();
      profCtx.strokeStyle = V.targetSecondary;
      profCtx.lineWidth = 1.5;
      profCtx.setLineDash([5, 3]);
      profCtx.beginPath();
      for (const s of compareSegs) {
        s.forEach(([x, y], k) => (k ? profCtx.lineTo(x, y) : profCtx.moveTo(x, y)));
      }
      profCtx.stroke();
      if (paintMode() === 'sky' && compare.blockAbove &&
          Array.isArray(compare.profileTop) && compare.profileTop.length === BINS) {
        const topSegs = profileSegments(compare.profileTop, W, H, lo, hi, azOff, fov, 90.5);
        profCtx.beginPath();
        for (const s of topSegs) {
          s.forEach(([x, y], k) => (k ? profCtx.lineTo(x, y) : profCtx.moveTo(x, y)));
        }
        profCtx.stroke();
      }
      profCtx.restore();
    }
    profCtx.fillStyle = V.axis;
    profCtx.font = '12px system-ui';
    profCtx.fillText(lo.toFixed(0) + '\u00B0', 2, H - 3);
    profCtx.fillText(hi.toFixed(0) + '\u00B0', 2, 12);
    profCtx.fillText('profile \u2014 ' + paintMode() + ' \u00B7 alt ' + lo.toFixed(0) + '\u2026' + hi.toFixed(0) + '\u00B0', Math.max(45, W - 230), 14);
    const selected = profileIndex();
    const selectedX = selected / Math.max(1, BINS - 1) * W;
    profCtx.strokeStyle = V.minStroke;
    profCtx.lineWidth = 1;
    profCtx.setLineDash([3, 3]);
    profCtx.beginPath(); profCtx.moveTo(selectedX, 0); profCtx.lineTo(selectedX, H); profCtx.stroke();
    profCtx.setLineDash([]);
    updateProfileMetrics();
  }

  function drawCropOverlay() {
    const hint = $('#ed-crop-hint', box);
    if (!cropTool || !cropSel) {
      if (hint) hint.textContent = cropTool ? 'drag to mark the band to KEEP' : '';
      return;
    }
    const requestedX = Math.min(cropSel.x0, cropSel.x1);
    const requestedWidth = Math.abs(cropSel.x1 - cropSel.x0);
    const { fov, azOffset, kept, expanded, minimumApplied } =
      cropKeptBand(p.fov, p.azOffset, { x: requestedX, w: requestedWidth }, MASK_W);
    const x0 = kept.x, x1 = kept.x + kept.w;
    ctx.save();
    ctx.fillStyle = 'rgba(5,7,12,.55)';
    ctx.fillRect(0, 0, x0, MASK_H);
    ctx.fillRect(x1, 0, MASK_W - x1, MASK_H);
    ctx.strokeStyle = '#4f9cff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 5]);
    for (const lx of [x0, x1]) {
      ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, MASK_H); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = '#9cc4ff';
    ctx.font = '11px system-ui';
    ctx.fillText(`keep ${Math.round(x1 - x0)}px`, x0 + 6, 16);
    ctx.restore();
    if (hint) {
      hint.textContent = `FOV \u2192 ${fov}\u00B0 \u00B7 az left ${+azOffset.toFixed(2)}\u00B0${minimumApplied ? ' · kept band expanded to minimum FOV' : expanded ? ' · rounded to whole-degree FOV' : ''}`;
    }
  }

  function renderStatus() {
    setup?.render();
    const activeRow = $('#pano-list input:checked', box)?.closest('li');
    if (activeRow?.dataset.id === p.id) {
      const tags = activeRow.querySelector('.p-tags');
      if (tags) tags.textContent = `${p.paintMode} · ${+p.fov.toFixed(2)}°${p.hasImage ? ' · 📷' : ''}`;
    }
    const brush = $('#ed-brush-value', box);
    if (brush) brush.textContent = ` · brush ${(ui.brush * 2 / MASK_W * p.fov).toFixed(1)}° az × ${(ui.brush * 2 / (MASK_H - 1) * (p.altTop - p.altBottom)).toFixed(1)}° alt`;
    const modeInput = $('#ed-mode', box);
    if (modeInput) modeInput.value = p.paintMode;
    const blockInput = $('#ed-block-above', box);
    if (blockInput) blockInput.checked = !!p.blockAbove;
    const topInput = $('#ed-profile-top', box);
    if (topInput) topInput.disabled = p.paintMode !== 'sky';
    const altLabel = $('#ed-profile-alt-label', box);
    if (altLabel) altLabel.textContent = p.paintMode === 'sky' ? 'Visible sky starts at (°)' : 'Obstruction height (°)';
    const undoBtn = $('#ed-undo', box), redoBtn = $('#ed-redo', box);
    if (undoBtn) undoBtn.disabled = !metadataPending && !historyCanUndo(hist);
    if (redoBtn) redoBtn.disabled = metadataPending || !historyCanRedo(hist);
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
    const profileSummary = $('#panoProfileSummary', box);
    if (profileSummary) {
      const mode = p.paintMode === 'sky' ? 'visible sky band' : 'obstruction ceiling';
      const assumed = p.paintMode === 'sky' && !p.blockAbove ? ' Above-band sky is assumed open.' : '';
      profileSummary.textContent = `Horizon profile preview: ${mode}, azimuth ${p.azOffset.toFixed(1)} to ${(p.azOffset + p.fov).toFixed(1)} degrees, altitude ${p.altBottom.toFixed(1)} to ${p.altTop.toFixed(1)} degrees.${assumed}`;
    }
    const chartSummary = $('#panoChartSummary', box);
    if (chartSummary) {
      const modeName = p.paintMode === 'sky' ? 'sky-band' : 'obstacle';
      chartSummary.textContent = `Panorama horizon editor in ${modeName} mode. Azimuth offset ${p.azOffset.toFixed(1)} degrees, field of view ${p.fov.toFixed(1)} degrees, altitude range ${p.altBottom.toFixed(1)} to ${p.altTop.toFixed(1)} degrees.${dirty() ? ' Unsaved changes.' : ' Saved.'}`;
    }
    updateProfileMetrics();
  }

  const rebuildMaskNow = () => { mask = rebuildMask(p.strokes, wrapsFor(p)); maskDirty = true; profileDirty = true; };

  function schedulePaint() {
    if (paintFrame !== null) return;
    paintFrame = requestAnimationFrame(() => {
      paintFrame = null;
      if (cvs.isConnected) overlay();
    });
  }
  function flushPaint() {
    if (paintFrame !== null) { cancelAnimationFrame(paintFrame); paintFrame = null; }
    overlay();
  }

  function commit() {
    metadataPending = false;
    historyCommit(hist, p);
    traceTools?.sync();
    announcePanoChanged(p, 'edit');
    renderStatus();
  }

  function commitMetadata() {
    if (!metadataPending) return;
    metadataPending = false;
    commit();
  }

  function syncRestoredControls() {
    ensurePhotoSurface();
    metadataPending = false;
    rebuildMaskNow();
    syncCalInputs();
    setup?.sync();
    traceTools?.restore();
    renderLandmarkRows();
    readProfileBin();
    compareProfile();
    fitCanvas();
    renderStatus();
  }
  function doUndo() {
    finishGesture();
    commitMetadata();
    if (!historyUndo(hist, p)) return;
    syncRestoredControls();
    announcePanoChanged(p, 'undo');
  }
  function doRedo() {
    finishGesture();
    commitMetadata();
    if (!historyRedo(hist, p)) return;
    syncRestoredControls();
    announcePanoChanged(p, 'redo');
  }
  function revertSession() {
    finishGesture();
    if (!dirty()) return;
    commitMetadata();
    applySnapshot(p, hist.baseline);
    syncRestoredControls();
    commit();               // the revert itself is undoable
  }
  function saveSession() {
    finishGesture();
    flushPaint();
    status = 'saving';
    renderStatus();
    syncMetadataFromUI();
    commitMetadata();
    computeProfile(p);    // derive from strokes (or keep the stored profile)
    // FIX-5: only a REAL write may clear the dirty baseline; on failure keep
    // the edits and let the caller show "Save failed".
    if (updatePano(p)) {
      historyMarkSaved(hist, p);
      status = 'saved';
      onChanged();
    } else {
      status = 'failed';
    }
    renderStatus();
  }

  async function doClear() {
    finishGesture();
    const ok = await confirmDialog(box, {
      title: 'Clear horizon?',
      body: 'Remove all paint from this horizon; the profile becomes open sky. You can undo this.',
      ok: 'Clear',
    });
    if (!ok) return;
    clearMask(p);
    traceTools?.restore(true);
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
    const samples = strokeSegment(lastPaintPoint, [x, y], ui.brush, (forceErase || eraser) ? 'e' : 'b');
    for (const dab of samples) { p.strokes.push(dab); applyDabToMask(mask, dab, wrapsFor(p)); }
    lastPaintPoint = [x, y];
    maskDirty = true; profileDirty = true;
    schedulePaint();
  };
  const updateReadout = (ev) => {
    const [x, y] = toCanvas(ev);
    brushPoint = [x, y];
    const az = azOfX(p, x), alt = altOf(p, y);
    const outside = x < 0 || x > MASK_W || y < 0 || y > MASK_H;
    $('#ed-pos', box).textContent = `az ${az.toFixed(1)}° ${cardinal(az)} · alt ${alt >= 0 ? '+' : ''}${alt.toFixed(1)}°${outside ? ' · outside image' : ''}`;
  };
  const setPanCursor = (on) => cvs.classList.toggle('panning', on);
  const endPan = () => { panning = false; panPrev = null; setPanCursor(false); };

  // Cancel/lost capture/blur retains visible partial paint as ONE undoable edit.
  function finishGesture(ev = null, cancelled = false) {
    if (activePointerId === null || (ev && ev.pointerId !== activePointerId)) return;
    const pointer = activePointerId;
    if (painting && ev && !cancelled && ev.type === 'pointerup') {
      const [x, y] = toCanvas(ev); strokeAt(x, y, gestureErase);
    }
    if (tracing && ev && !cancelled && ev.type === 'pointerup') {
      const [x, y] = toCanvas(ev); traceTools.move(x, y);
    }
    const edited = painting || (tracing && traceTools.finish());
    if (cropping && (cancelled || !cropSel || Math.abs(cropSel.x1 - cropSel.x0) < 4)) cropSel = null;
    activePointerId = null; painting = false; tracing = false; cropping = false; gestureErase = false; lastPaintPoint = null;
    endPan();
    if (cvs.hasPointerCapture(pointer)) cvs.releasePointerCapture(pointer);
    setup?.finishDrag();
    flushPaint();
    if (edited) commit();
  }
  cvs.addEventListener('pointerdown', (ev) => {
    if (activePointerId !== null || ![0, 1, 2].includes(ev.button)) return;
    if (!setup?.isPicking() && ev.button === 0 && !spaceDown) {
      const [x,y] = toCanvas(ev); setup?.hit(x/MASK_W,y/(MASK_H-1),screenGeometry());
    }
    if (setup?.isPicking() && ev.button !== 1 && !spaceDown) {
      ev.preventDefault();
      if (ev.button === 0) {
        const [x, y] = toCanvas(ev);
        if (x >= 0 && x <= MASK_W && y >= 0 && y <= MASK_H) {
          // Own the whole pick gesture until up/cancel. Selecting its point
          // exits pick mode, but a second held pointer must not start painting.
          activePointerId = ev.pointerId;
          cvs.setPointerCapture(ev.pointerId);
          setup.pick(x / MASK_W, Math.min(1, y / (MASK_H - 1)));
        }
      }
      return;
    }
    if (ui.setupStep !== 4 && !ui.legacySetup && ev.button !== 1 && !spaceDown) return;
    commitMetadata();
    cvs.focus();
    activePointerId = ev.pointerId;
    cvs.setPointerCapture(ev.pointerId);
    updateReadout(ev);
    if (cropTool) {
      const [cx] = toCanvas(ev), x = Math.max(0, Math.min(MASK_W, cx));
      cropSel = { x0: x, x1: x }; cropping = true; overlay();
    } else if (ev.button === 1 || (ev.button === 0 && spaceDown)) {
      panning = true; panPrev = { x: ev.clientX, y: ev.clientY }; setPanCursor(true);
    } else if (traceTools?.active() && ev.button === 0) {
      const [x, y] = toCanvas(ev); tracing = traceTools.down(x, y);
    } else {
      painting = true; gestureErase = ev.button === 2; lastPaintPoint = null;
      const [x, y] = toCanvas(ev); strokeAt(x, y, gestureErase);
    }
    ev.preventDefault();
  });
  cvs.addEventListener('pointermove', (ev) => {
    if (activePointerId !== null && ev.pointerId !== activePointerId) return;
    updateReadout(ev);
    if (setup?.isDragging()) {
      const [x,y] = toCanvas(ev); setup.drag(x/MASK_W,y/(MASK_H-1));
    } else if (cropping && cropSel) {
      const [cx] = toCanvas(ev); cropSel.x1 = Math.max(0, Math.min(MASK_W, cx)); schedulePaint();
    } else if (panning) {
      const r = cvs.getBoundingClientRect();
      const dx = (ev.clientX - panPrev.x) / r.width * MASK_W;
      const dy = (ev.clientY - panPrev.y) / r.height * MASK_H;
      [view.fx, view.fy] = editorClampFocus(MASK_W, MASK_H, view.zoom,
        (view.fx ?? MASK_W / 2) - dx / view.zoom, (view.fy ?? MASK_H / 2) - dy / view.zoom);
      panPrev = { x: ev.clientX, y: ev.clientY }; schedulePaint();
    } else if (tracing) {
      const [x, y] = toCanvas(ev); traceTools.move(x, y);
    } else if (painting) {
      const samples = ev.getCoalescedEvents?.() || [];
      for (const sample of samples.length ? samples : [ev]) {
        const [x, y] = toCanvas(sample); strokeAt(x, y, gestureErase);
      }
    } else schedulePaint();
  });
  cvs.addEventListener('pointerleave', () => {
    if (activePointerId !== null) return;
    brushPoint = null; $('#ed-pos', box).textContent = 'az — · alt —'; schedulePaint();
  });
  cvs.addEventListener('pointerup', (ev) => finishGesture(ev));
  cvs.addEventListener('pointercancel', (ev) => finishGesture(ev, true));
  cvs.addEventListener('lostpointercapture', (ev) => finishGesture(ev, true));
  cvs.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();    // the right-button drag (above) already erased
  });

  /** Push p's calibration back into the slider DOM (used after a crop and
   *  after undo/redo, which previously left the sliders showing stale values). */
  function syncCalInputs(except = null) {
    const az = $('#ed-az', box), ab = $('#ed-ab', box), at = $('#ed-at', box), fv = $('#ed-fov', box);
    if (az) az.value = String(p.azOffset);
    if (ab) ab.value = String(p.altBottom);
    if (at) { at.min = String(Math.min(90, p.altBottom + 5)); at.value = String(p.altTop); }
    if (fv) fv.value = String(p.fov);
    for (const [id, key] of [['ed-az', 'azOffset'], ['ed-ab', 'altBottom'], ['ed-at', 'altTop'], ['ed-fov', 'fov']]) {
      const el = $('#' + id + '-n', box);
      if (el) { if (el !== except) el.value = String(p[key]); if (key === 'altTop') el.min = String(p.altBottom + 5); }
    }
    const set = (sel, txt) => { const e = $(sel, box); if (e) e.textContent = txt; };
    set('#ed-az-v', +p.azOffset.toFixed(2) + '\u00B0');
    set('#ed-ab-v', +p.altBottom.toFixed(2) + '\u00B0');
    set('#ed-at-v', +p.altTop.toFixed(2) + '\u00B0');
    set('#ed-fov-v', +p.fov.toFixed(2) + '\u00B0');
  }

  function setCropTool(on) {
    finishGesture(null, true);
    if (on) setup?.cancelPick();
    brushPoint = null;
    cropTool = !!on;
    if (!cropTool) { cropSel = null; cropping = false; }
    const apply = $('#ed-crop-apply', box), cancel = $('#ed-crop-cancel', box), btn = $('#ed-crop', box);
    if (apply) apply.classList.toggle('hidden', !cropTool);
    if (cancel) cancel.classList.toggle('hidden', !cropTool);
    if (btn) btn.classList.toggle('on', cropTool);
    cvs.style.cursor = cropTool ? 'crosshair' : '';
    overlay();
  }

  /** Commit the kept-band crop as ONE history entry (undo restores fov, az,
   *  strokes and profile). Non-destructive: the photo, alt bounds, paint mode
   *  and block-above are untouched (core cropPano owns the semantics). */
  function applyCrop() {
    if (!cropSel) return;
    const x0 = Math.min(cropSel.x0, cropSel.x1);
    const x1 = Math.max(cropSel.x0, cropSel.x1);
    if (x1 - x0 < 4) return;
    cropPano(p, { x: x0, w: x1 - x0 }, MASK_W);
    rebuildMaskNow();
    setCropTool(false);
    syncCalInputs();
    setup?.sync();
    traceTools?.restore(true);
    commit();
    view.zoom = 1; view.fx = null; view.fy = null;
    fitCanvas();
  }

  function zoomTo(z, ax, ay) {
    finishGesture();
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
    finishGesture();
    view.zoom = 1; view.fx = null; view.fy = null;
    overlay();
    renderStatus();
  });

  $('#ed-eraser', box).addEventListener('click', (ev) => {
    finishGesture();
    traceTools?.choose('brush');
    eraser = !eraser; ui.eraser = eraser;
    ev.target.classList.toggle('on', eraser);
    ev.target.setAttribute('aria-pressed', String(eraser));
    overlay();
  });
  $('#ed-brush', box).addEventListener('input', (ev) => {
    finishGesture(); ui.brush = Number(ev.target.value); overlay();
  });
  $('#ed-opacity', box).addEventListener('input', (ev) => {
    ui.opacity = Number(ev.target.value); maskDirty = true; schedulePaint();
  });
  $('#ed-grid', box).addEventListener('change', (ev) => { ui.grid = ev.target.checked; overlay(); });
  $('#ed-undo', box).addEventListener('click', doUndo);
  $('#ed-redo', box).addEventListener('click', doRedo);
  $('#ed-revert', box).addEventListener('click', revertSession);
  $('#ed-clear', box).addEventListener('click', doClear);
  $('#ed-save', box).addEventListener('click', saveSession);
  $('#ed-crop', box).addEventListener('click', () => setCropTool(!cropTool));
  $('#ed-crop-apply', box).addEventListener('click', applyCrop);
  $('#ed-crop-cancel', box).addEventListener('click', () => setCropTool(false));

  // calibration sliders: live preview on input, ONE history entry on release
  const calApply = (ev) => {
    finishGesture();
    const source = ev?.target;
    if (source?.id.endsWith('-n')) {
      if (source.value === '' || !source.checkValidity()) {
        $('#ed-cal-error', box).textContent = 'Enter an angle within the displayed limits.';
        if (ev.type === 'change') syncCalInputs();
        return;
      }
      $('#' + source.id.slice(0, -2), box).value = source.value;
    }
    $('#ed-cal-error', box).textContent = '';
    const oldFov = p.fov;
    p.azOffset = clampNum($('#ed-az', box).value, 0, 360, 0);
    Object.assign(p, normalizePanoCalibration($('#ed-ab', box).value, $('#ed-at', box).value));
    p.fov = clampNum($('#ed-fov', box).value, 5, 360, 360);
    if (oldFov !== p.fov) setup?.syncCoverage();
    syncCalInputs(ev?.type === 'input' ? source : null);
    metadataPending = true;
    rebuildMaskNow(); overlay();
  };
  ['ed-az', 'ed-ab', 'ed-at', 'ed-fov'].forEach((id) => {
    for (const suffix of ['', '-n']) {
      const el = $('#' + id + suffix, box);
      el.addEventListener('input', calApply);
      el.addEventListener('change', (ev) => { calApply(ev); commitMetadata(); });
    }
  });
  $('#ed-mode', box).addEventListener('change', async (ev) => {
    finishGesture();
    const next = ev.target.value;
    if (next === 'sky' && p.strokes.some(s => s.m === 'trace')) {
      const ok = await confirmDialog(box, { title: 'Switch to visible sky?',
        body: 'Skyline traces describe obstacles. Switching removes the traces and keeps brush paint, which becomes visible sky. You can undo this. Paint the sky opening and choose block above band for an overhang.', ok: 'Switch mode' });
      if (!ok) { ev.target.value = p.paintMode; return; }
      p.strokes = p.strokes.filter(s => s.m !== 'trace');
    }
    p.paintMode = next;
    // Ruling C (DE-03/WE-02): a DELIBERATE paint-mode switch is mode-specific for
    // a record with no strokes - the stored values were authored in the other
    // mode - so re-derive the canonical blank for the new mode. This is the ONLY
    // place a mode switch may touch the profile (never on load, open or save),
    // and the snapshot above makes the switch ONE undoable history entry.
    if (!p.strokes.length) clearMask(p);
    rebuildMaskNow();
    traceTools?.restore(true);
    overlay();
    commit();
  });
  // "block above band": opt OUT of the default open-above assumption. Re-derives
  // the profile ceiling immediately (and is undoable like any other edit).
  $('#ed-block-above', box).addEventListener('change', (ev) => {
    finishGesture();
    p.blockAbove = !!ev.target.checked;
    profileDirty = true;
    renderStatus();
    overlay();
    commit();
  });

  // Write to the displayed bin immediately; navigation settles one history entry.
  const confEl = $('#ed-profile-confidence', box);
  if (confEl) confEl.addEventListener('input', syncMetadataFromUI);
  if (confEl) confEl.addEventListener('change', commitMetadata);
  const readBin = $('#ed-profile-read', box);
  if (readBin) readBin.addEventListener('click', readProfileBin);
  const azBin = $('#ed-profile-az', box);
  if (azBin) azBin.addEventListener('change', readProfileBin);
  profCvs.tabIndex = 0;
  profCvs.setAttribute('aria-describedby', 'panoProfileSummary panoProfileBinSummary');
  profCvs.addEventListener('click', (ev) => {
    const rect = profCvs.getBoundingClientRect();
    const az = Math.max(0, Math.min(359.5, (ev.clientX - rect.left) / Math.max(1, rect.width) * 360));
    $('#ed-profile-az', box).value = (Math.round(az * 2) / 2).toFixed(1);
    readProfileBin();
  });
  profCvs.addEventListener('keydown', (ev) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const current = num($('#ed-profile-az', box).value) || 0;
    const next = ev.key === 'Home' ? 0 : ev.key === 'End' ? 359.5
      : Math.max(0, Math.min(359.5, current + (ev.key === 'ArrowRight' ? 0.5 : -0.5)));
    $('#ed-profile-az', box).value = next.toFixed(1);
    readProfileBin();
  });
  const applyBin = $('#ed-profile-apply', box);
  if (applyBin) applyBin.addEventListener('click', () => {
    finishGesture();
    const idx = profileIndex();
    const alt = num($('#ed-profile-alt', box)?.value);
    const top = num($('#ed-profile-top', box)?.value);
    if (!Number.isFinite(alt) || alt < -90 || alt > 90.5) return;
    if (p.paintMode === 'sky' && (!Number.isFinite(top) || top < -90 || top > 90.5)) return;
    p.strokes = [];
    p.profile = Array.isArray(p.profile) && p.profile.length === BINS
      ? p.profile.slice() : new Array(BINS).fill(p.paintMode === 'sky' ? 90 : NO_BLOCK);
    p.profileTop = Array.isArray(p.profileTop) && p.profileTop.length === BINS
      ? p.profileTop.slice() : new Array(BINS).fill(NO_BLOCK);
    p.profile[idx] = +alt.toFixed(1);
    if (p.paintMode === 'sky') p.profileTop[idx] = +top.toFixed(1);
    p.confidence = normalizeHorizonConfidence(p.confidence);
    const cv = $('#ed-profile-confidence', box)?.value;
    p.confidence[idx] = cv === '' ? null : Math.max(0, Math.min(1, num(cv)));
    p.profileBins = WORLD_BINS;
    metadataPending = false;
    rebuildMaskNow();
    traceTools?.restore(true);
    overlay();
    commit();
  });
  const addLandmark = $('#ed-landmark-add', box);
  if (addLandmark) addLandmark.addEventListener('click', () => {
    finishGesture();
    const name = $('#ed-landmark-name', box)?.value.trim();
    const az = num($('#ed-landmark-az', box)?.value);
    const alt = num($('#ed-landmark-alt', box)?.value);
    if (!name || !Number.isFinite(az) || !Number.isFinite(alt)) return;
    p.landmarks.push({
      id: `landmark-${Date.now().toString(36)}`,
      name, kind: $('#ed-landmark-kind', box)?.value || 'other',
      azimuth: az, altitude: alt, notes: '',
    });
    p.landmarks = normalizeHorizonLandmarks(p.landmarks);
    $('#ed-landmark-name', box).value = '';
    $('#ed-landmark-az', box).value = '';
    $('#ed-landmark-alt', box).value = '';
    renderLandmarkRows();
    metadataPending = false;
    commit();
  });
  const cmp = $('#ed-profile-compare', box);
  if (cmp) cmp.addEventListener('change', () => { compareProfile(); drawProfile(); });
  renderLandmarkRows();
  readProfileBin();
  compareProfile();

  if (undoHandler) document.removeEventListener('keydown', undoHandler);
  undoHandler = (ev) => {
    if (ev.key === 'Escape' && setup?.isPicking()) {
      ev.preventDefault(); setup.cancelPick(); return;
    }
    if (ev.key === 'Escape' && cropTool) {
      if (!document.querySelector('#pano-canvas') || !box.contains(document.activeElement)) return;
      ev.preventDefault();
      setCropTool(false);
      return;
    }
    if (!(ev.ctrlKey || ev.metaKey)) return;
    if (ev.target.closest?.('input, textarea, [contenteditable="true"]')) return;
    const k = ev.key.toLowerCase();
    const isUndo = k === 'z' && !ev.shiftKey;
    const isRedo = (k === 'z' && ev.shiftKey) || k === 'y';
    if (!isUndo && !isRedo) return;
    if (!document.querySelector('#pano-canvas') || !box.contains(document.activeElement)) return;
    ev.preventDefault();
    if (isUndo) doUndo(); else doRedo();
  };
  document.addEventListener('keydown', undoHandler);

  const currentUndoHandler = undoHandler;
  const releaseSpace = () => { spaceDown = false; setPanCursor(false); };
  // Native text and button Space behavior is preserved outside the canvas.
  const spaceKeys = (ev) => {
    if (ev.code !== 'Space') return;
    if (ev.type === 'keyup') { releaseSpace(); return; }
    if (document.activeElement !== cvs) return;
    spaceDown = true;
    setPanCursor(true);
    ev.preventDefault();
  };
  document.addEventListener('keydown', spaceKeys);
  document.addEventListener('keyup', spaceKeys);
  cvs.addEventListener('blur', releaseSpace);
  const blurGesture = () => { finishGesture(null, true); releaseSpace(); };
  window.addEventListener('blur', blurGesture);

  const cleanup = [() => {
    finishGesture(null, true);
    commitMetadata();
    releaseSpace();
    if (paintFrame !== null) cancelAnimationFrame(paintFrame);
    document.removeEventListener('keydown', currentUndoHandler);
    document.removeEventListener('keydown', spaceKeys);
    document.removeEventListener('keyup', spaceKeys);
    cvs.removeEventListener('blur', releaseSpace);
    window.removeEventListener('blur', blurGesture);
  }];
  activeSession = { panoId: p.id, hist, ui, dirty, revert: revertSession, save: saveSession,
    settle: () => { finishGesture(null, true); flushPaint(); commitMetadata(); }, disconnect: () => cleanup.forEach((fn) => fn()) };
  if (typeof ResizeObserver !== 'undefined') {
    let resizeFrame = null;
    const ro = new ResizeObserver(() => {
      if (resizeFrame !== null) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        if (boxEl.isConnected) fitCanvas();
      });
    });
    ro.observe(boxEl);
    cleanup.push(() => {
      ro.disconnect();
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
    });
  }

  setup = wirePhotoSetup(box.querySelector('.horizon-setup'), p, ui, {
    settle: () => { finishGesture(); commitMetadata(); setCropTool(false); },
    redraw: schedulePaint,
    focusCanvas: () => { cvs.focus(); cvs.scrollIntoView({ block: 'center', behavior: 'instant' }); },
    changed: () => { syncCalInputs(); rebuildMaskNow(); overlay(); fitCanvas();commit(); },
    drawing: () => traceTools?.choose(p.paintMode === 'obstacle' ? 'trace' : 'brush'),
    prepareGeometry:model=>{if(!imgEl)throw new Error('Wait for the photograph to load.');const surface=angularPhotoCanvas(imgEl,model);angularEl=surface;angularKey=JSON.stringify(model);},
    previewGeometry:model=>{const target=$('#photo-preview-canvas',box);if(!model){target.hidden=true;conversionPreview=null;return;}
      if(!imgEl)throw new Error('Wait for the photograph to load.');const surface=angularPhotoCanvas(imgEl,model);conversionPreview={key:JSON.stringify(model),surface};
      target.width=surface.width;target.height=surface.height;target.getContext('2d').drawImage(surface,0,0);target.hidden=false;},
  });
  const geographicEvidence=wireGeographicEvidence(box,p,{
    settle:()=>{finishGesture();commitMetadata();setCropTool(false);},
    changed:()=>{rebuildMaskNow();overlay();commit();},
  });
  wirePhotoConversion(box,p,{
    settle:()=>{finishGesture();commitMetadata();setCropTool(false);setup?.cancelPick();},
    photoSize:()=>imgEl?{width:imgEl.naturalWidth,height:imgEl.naturalHeight}:null,
    preview:model=>{const target=$('#photo-preview-canvas',box);
      if(!model){target.hidden=true;conversionPreview=null;return;}
      const surface=angularPhotoCanvas(imgEl,model);conversionPreview={key:JSON.stringify(model),surface};
      target.width=surface.width;target.height=surface.height;target.getContext('2d').drawImage(surface,0,0);target.hidden=false;},
    prepare:model=>{const key=JSON.stringify(model);angularEl=conversionPreview?.key===key?conversionPreview.surface:angularPhotoCanvas(imgEl,model);angularKey=key;},
    changed:()=>{syncCalInputs();rebuildMaskNow();setup?.sync();geographicEvidence.sync();fitCanvas();commit();},
  });
  traceTools = wireTraceTools(box, p, ui, {
    canvas: cvs, geometry: screenGeometry,
    pointActions: () => !cropTool && !panning,
    settle: () => { finishGesture(); commitMetadata(); },
    cancelOtherTools: () => { setCropTool(false); setup?.cancelPick(); },
    redraw: schedulePaint,
    changed: (saveHistory) => { rebuildMaskNow(); overlay(); if (saveHistory) commit(); },
  });
  $('.horizon-profile-panel',box).addEventListener('toggle', () => { fitCanvas(); });
  fitCanvas();
  readProfileBin();
  loadImage();
  renderStatus();
}
function drawImageStage(ctx, img, w, h, sourceRect) {
  // The backing store adopts the source image's aspect ratio. The canonical
  // 720x360 editor transform then scales both photo and mask together into that
  // aspect; all source pixels stay visible and stored coordinates stay fixed.
  const source = normalizeSourceRect(sourceRect);
  const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
  ctx.drawImage(img, source.x * iw, source.y * ih,
    source.w * iw, source.h * ih, 0, 0, w, h);
}

function clampNum(v, lo, hi, dflt) {
  const n = num(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}
