/*
 * NightSeam Web — storage & settings module.
 * Browser-side mirror of the local NightSeam SQLite user tables:
 *   sites   — {id, name, lat, lon, elev, tz}            (local: sites table)
 *   rigs    — {id, name, focal_mm, sensor_w, sensor_h, fov_w, fov_h}  (rigs)
 *   targets — custom objects, id "u_*"                   (custom_objects)
 * Plus: per-site timezone helpers (DST-aware, Intl), backup/restore of all
 * user data as JSON, and the version stamp (version.json, git describe).
 * IndexedDB database: "nightseam-db-v1". Renaming the storage keys was free:
 * the app moved to nightseam.de, so every visitor starts on a fresh origin.
 */

import { offsetEastMin, wallFromUtcMs, utcFromWallMs } from './core.js?v=19';

const DB_NAME = 'nightseam-db-v1';
const DB_VER = 1;
const STORES = ['targets', 'sites', 'rigs', 'meta'];
let _db = null;
let _dbP = null;

function open() {
  if (_db) return Promise.resolve(_db);
  if (_dbP) return _dbP;
  _dbP = new Promise((resolve, reject) => {
    try {
      const rq = indexedDB.open(DB_NAME, DB_VER);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        for (const s of STORES) {
          if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
        }
      };
      rq.onsuccess = () => { _db = rq.result; resolve(_db); };
      // WB6 (review): an upgrade blocked by another open tab used to hang
      // forever; reject (and let a later call retry) instead.
      rq.onblocked = () => {
        _dbP = null;
        reject(new Error("IndexedDB upgrade is blocked by another tab"));
      };
      rq.onerror = () => { _dbP = null; reject(rq.error); };
    } catch (e) { reject(e); }
  });
  return _dbP;
}

/* ------------------------- generic store ops ------------------------- */

export async function get(store, key) {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readonly').objectStore(store).get(key);
      t.onsuccess = () => resolve(t.result ?? null);
      t.onerror = () => reject(t.error);
    });
  } catch { return null; }
}

export async function set(store, key, val) {
  try {
    const db = await open();
    await new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite').objectStore(store).put(val, key);
      t.onsuccess = () => resolve();
      t.onerror = () => reject(t.error);
    });
    return true;
  } catch { return false; }
}

export async function del(store, key) {
  try {
    const db = await open();
    await new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite').objectStore(store).delete(key);
      t.onsuccess = () => resolve();
      t.onerror = () => reject(t.error);
    });
    return true;
  } catch { return false; }
}

/** All entries of a store: [{ key, val }] sorted by key. */
export async function all(store) {
  const db = await open();
  return await new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly').objectStore(store).openCursor();
    const out = [];
    t.onsuccess = () => {
      const c = t.result;
      if (c) { out.push({ key: c.key, val: c.value }); c.continue(); }
      else resolve(out);
    };
    t.onerror = () => reject(t.error);
  });
}

export async function clearStore(store) {
  try {
    const db = await open();
    await new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite').objectStore(store).clear();
      t.onsuccess = () => resolve();
      t.onerror = () => reject(t.error);
    });
    return true;
  } catch { return false; }
}

/* ------------------------------ sites ------------------------------ */

export const NEW_SITE_ID = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export async function getSites() {
  const rows = await all('sites');
  return rows.map((r) => r.val).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function saveSiteRec(site) {
  return set('sites', site.id, site);
}

export function deleteSiteRec(id) {
  return del('sites', id);
}

/* ------------------------------- rigs ------------------------------- */

export async function getRigs() {
  const rows = await all('rigs');
  const rigs = rows.map((r) => r.val);
  for (const r of rigs) {
    // D2 adapter: rigs stored before the unit normalization held DEGREES;
    // convert to arcmin once per load (in memory) and mark the record so the
    // next save persists arcmin and the conversion never runs twice.
    if (r && r.fov_w != null && r.fov_unit !== 'arcmin') {
      r.fov_w = Number(r.fov_w) * 60;
      if (r.fov_h != null) r.fov_h = Number(r.fov_h) * 60;
      r.fov_unit = 'arcmin';
    }
  }
  return rigs.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function saveRigRec(rig) { return set('rigs', rig.id, rig); }
export function deleteRigRec(id) { return del('rigs', id); }

/* Preset rigs for the "Add rig" picker: popular smart telescopes (ZWO Seestar,
 * DwarfLab DWARF). Twin of DEFAULT_RIGS in app/rig_presets.py - the web app is
 * static and cannot read Python, so keep both lists in sync. sensor_w/h are the
 * imaging sensor's active area in mm.
 * Nothing is ever stored automatically: a fresh browser has an EMPTY rig list
 * and the user picks a telescope in Setup -> Rigs -> Add rig (or builds a
 * custom rig from focal length + sensor size). */
export const DEFAULT_RIGS = [
  { id: 'rig-zwo-seestar-s50', name: 'ZWO Seestar S50', focal_mm: 250, sensor_w: 5.57, sensor_h: 3.13 },
  { id: 'rig-zwo-seestar-s30', name: 'ZWO Seestar S30', focal_mm: 150, sensor_w: 5.57, sensor_h: 3.13 },
  { id: 'rig-zwo-seestar-s30-pro', name: 'ZWO Seestar S30 Pro', focal_mm: 150, sensor_w: 11.14, sensor_h: 6.26 },
  { id: 'rig-dwarflab-dwarf-3', name: 'DwarfLab DWARF 3', focal_mm: 150, sensor_w: 7.68, sensor_h: 4.32 },
  { id: 'rig-dwarflab-dwarf-mini', name: 'DwarfLab DWARF mini', focal_mm: 150, sensor_w: 5.57, sensor_h: 3.13 },
  { id: 'rig-dwarflab-dwarf-2', name: 'DwarfLab DWARF II', focal_mm: 100, sensor_w: 5.60, sensor_h: 3.18 },
];

/** One-time cleanup of the rigs 0.6.1/0.6.2 auto-stored in this browser (the
 *  caller passes the `rigsSeeded` pref so it only runs once). Only rigs that
 *  still match a preset exactly are deleted - one the user edited or renamed is
 *  their data and stays. Returns the ids that were removed. */
export async function removeSeededRigs() {
  const near = (a, b) => Math.abs((Number(a) || 0) - b) < 1e-9;
  const gone = [];
  for (const r of await getRigs()) {
    const name = String(r.name || '').trim().toLowerCase();
    const p = DEFAULT_RIGS.find((x) => x.name.toLowerCase() === name);
    if (!p) continue;
    if (!near(r.focal_mm, p.focal_mm) || !near(r.sensor_w, p.sensor_w) ||
        !near(r.sensor_h, p.sensor_h)) continue;
    await deleteRigRec(r.id);
    gone.push(r.id);
  }
  return gone;
}

/** Field-of-view in ARCMINUTES from focal length + sensor size - the SAME unit
 *  as the desktop/server rig `fov_w`/`fov_h` (D2: one unit across the wire). */
export function fovArcmin(focalMm, sensorMm) {
  if (!(focalMm > 0) || !(sensorMm > 0)) return null;
  return 2 * Math.atan(sensorMm / (2 * focalMm)) * 180 / Math.PI * 60;
}

/** Field of view in degrees - DISPLAY ONLY (picker and form preview). */
export function fovDeg(focalMm, sensorMm) {
  const am = fovArcmin(focalMm, sensorMm);
  return am == null ? null : am / 60;
}

/* --------------------------- custom targets --------------------------- */

export async function getTargets() {
  const rows = await all('targets');
  return rows.map((r) => r.val);
}

export function saveTargetRec(t) { return set('targets', t.id, t); }
export function deleteTargetRec(id) { return del('targets', id); }

export const newTargetId = () => 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* Maybe-signed sexagesimal parsers; return number or NaN.
 * RA:  "5 34 31.9" / "5h34m32s" / "5.575" (decimal hours)
 * Dec: "+22 0 60" / "-26d31m" / "22.017" (decimal degrees)            */
export function parseRA(s) {
  const v = sexa(s);
  if (Number.isFinite(v)) return v < 24 ? v : NaN; // hours
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n < 24 ? n : NaN;
}
export function parseDec(s) {
  const sign = /^\s*-/.test(s) ? -1 : 1;
  const v = sexa(String(s).replace(/^\s*[+-]/, ''));
  if (Number.isFinite(v)) { const d = sign * v; return d >= -90 && d <= 90 ? d : NaN; }
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) && n >= -90 && n <= 90 ? n : NaN;
}
function sexa(s) {
  if (s == null) return NaN;
  const parts = String(s).trim().split(/[^\d.,-]+/).filter(Boolean);
  if (parts.length < 2) return NaN;
  const nums = parts.map((p) => parseFloat(p.replace(',', '.')));
  if (nums.some((n) => !Number.isFinite(n))) return NaN;
  if (nums.length === 2) return nums[0] + nums[1] / 60;
  if (nums.length === 3) return nums[0] + nums[1] / 60 + nums[2] / 3600;
  return NaN;
}

/* ---------------------------- timezone (DST-aware) ---------------------------- */

let activeTz = null; // IANA name of the active site, or null = browser local

export function setActiveTz(tz) { activeTz = tz || null; }
export function tz() { return activeTz; }

/** UTC offset of `tz` (minutes east of UTC) at the instant `date`. DST-aware.
 *  Phase 2: the IANA lookup is shared in core/time.js. */
export function tzOffMinAt(tzName, date) {
  return offsetEastMin(tzName, date.getTime());
}

/** A Date whose browser-local getters show the wall clock in the site timezone. */
export function utcToWall(date) {
  const off = tzOffMinAt(activeTz, date);
  if (off == null) return date;
  return new Date(wallFromUtcMs(date.getTime(), off, date.getTimezoneOffset()));
}

/** Inverse of utcToWall: interpret a wall-clock Date (site tz) as a UTC instant. */
export function wallToUtc(date) {
  const off = tzOffMinAt(activeTz, date);
  if (off == null) return date;
  return new Date(utcFromWallMs(date.getTime(), off, date.getTimezoneOffset()));
}

/** A Date whose calendar fields are the active site's date at noon —
 *  used as the night-planning anchor (what "today" means at the site). */
export function effToday() {
  const w = utcToWall(new Date());
  return new Date(w.getFullYear(), w.getMonth(), w.getDate(), 12, 0, 0);
}

/* ------------------------------ version ------------------------------ */

export async function loadVersion() {
  try {
    const r = await fetch('version.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (j && j.version) return j;
  } catch { /* pre-release builds have no version.json yet */ }
  return null;
}

/* --------------------------- backup / restore --------------------------- */

/** The authoritative theme value (the localStorage key the boot script reads). */
export function currentTheme() {
  try { return localStorage.getItem('nightseam_theme') === 'classic' ? 'classic' : 'dome'; }
  catch { return 'dome'; }
}

export async function collectBackup(prefs, panos, theme) {
  const [sites, rigs, targets] = await Promise.all([
    all('sites'), all('rigs'), all('targets'),
  ]);
  return {
    app: 'nightseam-web',
    version: 2,
    exportedAt: new Date().toISOString(),
    // the theme is stored in its own localStorage key (not in prefs) - back up
    // the key the boot script actually reads, so a restore can re-apply it
    theme: (theme === 'classic' || theme === 'dome') ? theme : currentTheme(),
    prefs: prefs || {},
    panos: panos || { panos: [], activeId: null },
    sites: sites.map((r) => r.val),
    rigs: rigs.map((r) => r.val),
    targets: targets.map((r) => r.val),
  };
}

/** Coerce one imported record, or drop it.
 *
 *  A backup file is UNTRUSTED input: its records are rendered into the DOM and
 *  their numbers feed `.toFixed()` calls while the Setup dialog builds, so a
 *  single malformed entry used to break the dialog and a crafted one could
 *  inject markup. Only records with a usable id survive, and every field the UI
 *  formats is coerced here. */
function cleanRecord(r, { numbers = [], strings = [] } = {}) {
  if (!r || typeof r !== 'object') return null;
  const id = String(r.id ?? '').trim();
  if (!id || id.length > 64) return null;
  const out = { ...r, id };
  for (const k of numbers) {
    const v = r[k];
    out[k] = (typeof v === 'number' && Number.isFinite(v)) ? v : null;
    if (out[k] == null && (k === 'lat' || k === 'lon' || k === 'ra_hours' || k === 'dec_deg')) {
      return null;                       // without a position the record is useless
    }
  }
  for (const k of strings) {
    if (r[k] != null) out[k] = String(r[k]).slice(0, 200);
  }
  return out;
}

/** Validate a backup into staged records WITHOUT touching storage.
 *  Throws on a malformed / foreign backup, so nothing is destroyed before the
 *  whole bundle is known to be usable. Pure (no I/O): unit-testable. */
export function stageBackup(data) {
  if (!data || data.app !== 'nightseam-web') {
    throw new Error('not a NightSeam Web backup');
  }
  const siteOf = (s) => cleanRecord(s, {
    numbers: ['lat', 'lon', 'elev'],
    strings: ['name', 'tz', 'notes'],
  });
  const rigOf = (r) => cleanRecord(r, {
    numbers: ['focal_mm', 'sensor_w', 'sensor_h', 'fov_w', 'fov_h'],
    strings: ['name'],
  });
  const targetOf = (t) => cleanRecord(t, {
    numbers: ['ra_hours', 'dec_deg', 'vmag'],
    strings: ['primary_name', 'otype', 'size_am', 'constellation', 'blurb'],
  });
  return {
    sites: (Array.isArray(data.sites) ? data.sites : []).map(siteOf).filter(Boolean),
    rigs: (Array.isArray(data.rigs) ? data.rigs : []).map(rigOf).filter(Boolean),
    targets: (Array.isArray(data.targets) ? data.targets : []).map(targetOf).filter(Boolean),
    prefs: (data.prefs && typeof data.prefs === 'object') ? data.prefs : null,
    panos: (data.panos && typeof data.panos === 'object') ? data.panos : null,
    // must match currentTheme(); ignore an unknown/legacy value rather than
    // writing junk into the theme key
    theme: (data.theme === 'classic' || data.theme === 'dome') ? data.theme : null,
  };
}

/** Write the staged site/rig/target records, clearing the other records first.
 *  Throws if ANY individual write fails (storage full / unavailable), so a
 *  caller can roll back instead of silently losing records. */
export async function writeStaged(staged) {
  await Promise.all(STORES.filter((s) => s !== 'meta').map((s) => clearStore(s)));
  const jobs = [];
  for (const rec of staged.sites) jobs.push(set('sites', rec.id, rec));
  for (const rec of staged.rigs) jobs.push(set('rigs', rec.id, rec));
  for (const rec of staged.targets) jobs.push(set('targets', rec.id, rec));
  const results = await Promise.all(jobs);
  if (results.some((ok) => ok === false)) {
    throw new Error('could not write all records (storage full or unavailable)');
  }
}

/** The last pre-restore safety snapshot, or null. */
export function lastSafetySnapshot() { return get('meta', 'safety'); }

/** Replace the browser's site/rig/target records from a validated backup.
 *
 *  `current` is a full snapshot of the CURRENT state. It is persisted to the
 *  `meta`/`safety` slot BEFORE any destructive write and re-applied if a write
 *  fails, so a failed restore never leaves a half-destroyed installation.
 *  Returns the staged records (including prefs/panos/theme) for the caller to
 *  apply to localStorage / IndexedDB. */
export async function restoreBackup(data, current) {
  const staged = stageBackup(data);          // validate FIRST - no writes yet
  if (current) {
    try { await set('meta', 'safety', current); } catch { /* best effort */ }
  }
  try {
    await writeStaged(staged);
  } catch (err) {
    if (current) {
      try { await writeStaged(stageBackup(current)); } catch { /* keep original error */ }
    }
    throw err;
  }
  return staged;
}

export function downloadText(filename, text) {
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  } catch { return false; }
}