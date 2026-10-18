/*
 * NightSeam Web — storage & settings module.
 * User records in IndexedDB (nightseam-db-v1):
 *   sites   — {id, name, lat, lon, elev, tz}
 *   rigs    — {id, name, focal_mm, sensor_w, sensor_h, fov_w, fov_h}
 *   targets — custom objects, id "u_*"
 * Plus: per-site timezone helpers (DST-aware, Intl), backup/restore of all
 * user data as JSON, and the version stamp (version.json, git describe).
 * IndexedDB database: "nightseam-db-v1". Renaming the storage keys was free:
 * the app moved to nightseam.de, so every visitor starts on a fresh origin.
 */

import { offsetEastMin, zonedWallToUtcMs } from './core.js?v=78';

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
      const transaction = db.transaction(store, 'readonly');
      const request = transaction.objectStore(store).get(key);
      transaction.oncomplete = () => resolve(request.result ?? null);
      transaction.onabort = () => reject(transaction.error || new Error('storage read aborted'));
    });
  } catch { return null; }
}

// Request success precedes commit. Only transaction completion proves that a
// write survived; an abort after a successful request must still reject.
async function commitWrite(stores, enqueue) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(stores, 'readwrite');
    let failure = null;
    transaction.oncomplete = () => resolve();
    transaction.onerror = (event) => { failure = event.target?.error || transaction.error; };
    transaction.onabort = () => reject(failure || transaction.error || new Error('storage transaction aborted'));
    try { enqueue(transaction); }
    catch (error) {
      failure = error;
      try { transaction.abort(); } catch { reject(error); }
    }
  });
}

export async function set(store, key, val) {
  try {
    await commitWrite(store, (transaction) => transaction.objectStore(store).put(val, key));
    return true;
  } catch { return false; }
}

export async function del(store, key) {
  try {
    await commitWrite(store, (transaction) => transaction.objectStore(store).delete(key));
    return true;
  } catch { return false; }
}

/** All entries of a store: [{ key, val }] sorted by key.
 *
 *  A failing read must not reject into the boot path: `boot()` awaits this
 *  before anything renders, and an unhandled rejection left the whole app on the
 *  splash (WE-06, 0.6.32 review). Storage that is genuinely unavailable is
 *  detected up front by `storageOk()`, which shows an actionable message; here a
 *  failure degrades to "no records" so the UI still comes up. */
export async function allStrict(store) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readonly');
    const out = [];
    let failure = null;
    transaction.oncomplete = () => resolve(out);
    transaction.onerror = (event) => { failure = event.target?.error || transaction.error; };
    transaction.onabort = () => reject(failure || transaction.error || new Error('could not read stored records'));
    const request = transaction.objectStore(store).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) { out.push({ key: cursor.key, val: cursor.value }); cursor.continue(); }
    };
  });
}

export async function all(store) {
  try { return await allStrict(store); }
  catch (err) {
    warnStorageOnce(err);
    return [];
  }
}

/** Can this browser give us IndexedDB at all? (private mode, blocked cookies,
 *  a hardened profile). Probed once, before any view renders. */
export async function storageOk() {
  try {
    const db = await open();
    if (!db) return false;
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('sites', 'readonly');
      transaction.objectStore('sites').count();
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('storage probe aborted'));
    });
    return true;
  } catch (err) {
    warnStorageOnce(err);
    return false;
  }
}

let _storageWarned = false;
function warnStorageOnce(err) {
  if (_storageWarned) return;
  _storageWarned = true;
  try { console.warn('NightSeam: local storage unavailable —', err); } catch (_) {}
}

export async function clearStore(store) {
  try {
    await commitWrite(store, (transaction) => transaction.objectStore(store).clear());
    return true;
  } catch { return false; }
}

/* ------------------------------ sites ------------------------------ */

export const NEW_SITE_ID = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export async function getSites({ strict = false } = {}) {
  const rows = await (strict ? allStrict('sites') : all('sites'));
  return rows.map((r) => r.val).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function saveSiteRec(site) {
  return set('sites', site.id, site);
}

export function deleteSiteRec(id) {
  return del('sites', id);
}

/* ------------------------------- rigs ------------------------------- */

export async function getRigs({ strict = false } = {}) {
  const rows = await (strict ? allStrict('rigs') : all('rigs'));
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
  for (const r of await getRigs({ strict: true })) {
    const name = String(r.name || '').trim().toLowerCase();
    const p = DEFAULT_RIGS.find((x) => x.name.toLowerCase() === name);
    if (!p) continue;
    if (!near(r.focal_mm, p.focal_mm) || !near(r.sensor_w, p.sensor_w) ||
        !near(r.sensor_h, p.sensor_h)) continue;
    if (!await deleteRigRec(r.id)) throw new Error('could not remove an old preset rig');
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

export async function getTargets({ strict = false } = {}) {
  const rows = await (strict ? allStrict('targets') : all('targets'));
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
  return Number.isFinite(v) && v >= 0 && v < 24 ? v : NaN;
}
export function parseDec(s) {
  const v = sexa(s);
  return Number.isFinite(v) && v >= -90 && v <= 90 ? v : NaN;
}
function sexa(s) {
  if (s == null) return NaN;
  const text = String(s).trim().replace(/,/g, '.');
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[hHdD°])?$/.test(text)) {
    return Number(text.replace(/[hHdD°]$/, ''));
  }
  const match = text.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:[hHdD°:]|\s)\s*(\d+(?:\.\d+)?)(?:\s*(?:[mM'′:]|\s)\s*(\d+(?:\.\d+)?))?\s*(?:[sS"″]|[mM'′])?$/);
  if (!match) return NaN;
  const sign = match[1].startsWith('-') ? -1 : 1;
  // Preserve documented carries such as +22 0 60 while rejecting extra parts
  // and arbitrary text instead of silently using the first decimal prefix.
  return sign * (Math.abs(Number(match[1])) + Number(match[2]) / 60 + Number(match[3] || 0) / 3600);
}

/* ---------------------------- timezone (DST-aware) ---------------------------- */

let activeTz = null; // IANA name of the active site, or null = browser local

/** True for an IANA zone this browser resolves. Every timezone entry point
 *  (site form, backup sites, settings) uses it: core/time.js treats an unknown
 *  zone as "no zone", which would silently plan in the browser's zone. */
export function validTimeZone(v) {
  if (typeof v !== 'string' || !v || v.length > 100) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; }
}

// An unknown stored zone falls back to browser local for planning AND weather.
export function setActiveTz(tz) { activeTz = validTimeZone(tz) ? tz : null; }
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
  const w = new Date(date.getTime() + off * 60000);
  return new Date(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(),
    w.getUTCHours(), w.getUTCMinutes(), w.getUTCSeconds(), w.getUTCMilliseconds());
}

/** Inverse of utcToWall: interpret a wall-clock Date (site tz) as a UTC instant. */
export function wallToUtc(date) {
  return wallFieldsToUtc(date.getFullYear(), date.getMonth(), date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}

/** Critical planning callers pass calendar fields directly, avoiding host DST gaps. */
export function wallFieldsToUtc(y, month, day, hour = 0, minute = 0, second = 0, millis = 0) {
  const zone = activeTz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const instant = zonedWallToUtcMs(zone, Date.UTC(y, month, day, hour, minute, second, millis));
  return instant == null ? new Date(y, month, day, hour, minute, second, millis) : new Date(instant);
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
    const r = await fetch(new URL('version.json', import.meta.url), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (j && j.version) return j;
  } catch { /* pre-release builds have no version.json yet */ }
  return null;
}

/* --------------------------- backup / restore --------------------------- */

/** Normalize the retired theme selector to the sole supported Workbench look. */
export function currentTheme() {
  try {
    const value = localStorage.getItem('nightseam_theme');
    const theme = 'workbench';
    if (value !== theme) localStorage.setItem('nightseam_theme', theme);
    return theme;
  } catch { return 'workbench'; }
}

export async function collectBackup(prefs, horizons, theme) {
  const [sites, rigs, targets] = await Promise.all([
    allStrict('sites'), allStrict('rigs'), allStrict('targets'),
  ]);
  return {
    app: 'nightseam-web',
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    // the theme is stored in its own localStorage key (not in prefs) - back up
    // the key the boot script actually reads, so a restore can re-apply it
    theme: currentTheme(),
    prefs: cleanWebPrefs(prefs),
    horizons: horizons || { horizons: [], activeId: null },
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

/** Backup bundle format. An older client refuses a newer bundle rather than
 * silently losing data it cannot keep. Format 11 replaced the panorama section
 * (`panos`) with skyline horizons (`horizons`); formats 1-10 still restore
 * their sites, rigs, targets and settings, but their panoramas are not
 * converted. Bump this together with any incompatible bundle change. */
export const BUNDLE_VERSION = 11;
const FIRST_HORIZON_VERSION = 11;

const bundleVersion = (data) => (data && data.version != null ? Number(data.version) : 1);

/** The horizon section a bundle restores: its own for format 11+, an empty one
 *  for older bundles (whose retired panorama section is ignored). */
export function backupHorizonSection(data) {
  const v = bundleVersion(data);
  if (Number.isInteger(v) && v < FIRST_HORIZON_VERSION) return { horizons: [], activeId: null };
  return data ? data.horizons : undefined;
}

/** True when an older bundle carried panoramas that will not be imported. */
export function backupHasRetiredHorizons(data) {
  const v = bundleVersion(data);
  return Number.isInteger(v) && v < FIRST_HORIZON_VERSION
    && Array.isArray(data?.panos?.panos) && data.panos.panos.length > 0;
}

export const WEB_PREF_DEFAULTS = Object.freeze({
  bortle: 4, minAlt: null, moonAware: false, viewFullDay: false, edge: 16,
  minVis: 1, advMode: false, weatherAuto: false, fltBb: false, fltHa: false,
  fltOiii: false, sizeUnit: 'arcmin', activeSiteId: null, activeRigId: '',
  tz: '', savedTargetIds: Object.freeze([]), rigsSeeded: false, rigsPresetCleaned: false,
});

/** Missing v1/v2 settings acquire current defaults. Strict import validation
 * rejects malformed known values before storage changes; loading older local
 * settings can instead recover those defaults. */
export function normalizeWebPrefs(value, { strict = false } = {}) {
  const record = value && typeof value === 'object' && !Array.isArray(value);
  if (strict && value != null && !record) throw new Error('backup settings must be an object');
  const source = record ? value : {};
  const out = { ...WEB_PREF_DEFAULTS, ...source, savedTargetIds: [] };
  for (const key of ['skyBrightnessProvider', 'theme', 'themeId', 'themeMode', 'themeVariant']) delete out[key];
  const check = (key, valid) => {
    if (!Object.prototype.hasOwnProperty.call(source, key) || valid(source[key])) return;
    if (strict) throw new Error(`backup setting ${key} is invalid`);
    out[key] = WEB_PREF_DEFAULTS[key];
  };
  for (const key of ['moonAware', 'viewFullDay', 'advMode', 'weatherAuto',
    'fltBb', 'fltHa', 'fltOiii', 'rigsSeeded', 'rigsPresetCleaned']) {
    check(key, (v) => typeof v === 'boolean');
  }
  const inRange = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  check('bortle', (v) => Number.isInteger(v) && inRange(v, 1, 9));
  check('minAlt', (v) => v === null || inRange(v, 0, 90));
  // The top-bar slider is whole degrees from 5 to 70; a stored value it cannot
  // show would leave the thumb and the planner disagreeing.
  if (typeof out.minAlt === 'number') out.minAlt = Math.min(70, Math.max(5, Math.round(out.minAlt)));
  check('edge', (v) => inRange(v, 0, 300));
  check('minVis', (v) => inRange(v, 0, 100));
  check('sizeUnit', (v) => ['arcmin', 'arcsec', 'deg'].includes(v));
  const id = (v) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v);
  check('activeSiteId', (v) => v === null || v === '' || id(v));
  check('activeRigId', (v) => v === null || v === '' || id(v));
  if (out.activeRigId === null) out.activeRigId = ''; // older no-rig convention
  check('tz', (v) => v === null || v === '' || v === 'auto' || validTimeZone(v));
  if (out.tz === null || out.tz === 'auto') out.tz = '';
  check('savedTargetIds', Array.isArray);
  if (Array.isArray(source.savedTargetIds)) {
    out.savedTargetIds = [...new Set(source.savedTargetIds.filter((id) =>
      typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)))].slice(0, 2000);
  }
  return out;
}

function cleanWebPrefs(value) { return normalizeWebPrefs(value, { strict: true }); }

/** Validate a backup into staged records WITHOUT touching storage.
 *  Throws on a malformed / foreign / too-new backup, so nothing is destroyed
 *  before the whole bundle is known to be usable. Pure (no I/O): unit-testable.

 *  WB7 (forward compatibility): `version` was written at export time and then
 *  ignored on import, so a bundle produced by a LATER build was accepted and its
 *  fields read under this build's rules - silent misreading dressed up as a
 *  successful restore. A version above BUNDLE_VERSION is now refused with a
 *  message that says to update; an older/absent one still restores, because v1
 *  and v2 share the field layout. */
export function stageBackup(data) {
  if (!data || data.app !== 'nightseam-web') {
    throw new Error('not a NightSeam Web backup');
  }
  const v = bundleVersion(data);
  if (!Number.isInteger(v) || v < 1) {
    throw new Error('backup has an unusable version stamp');
  }
  if (v > BUNDLE_VERSION) {
    throw new Error(
      `this backup was written by a newer version of the app (format ${v}, ` +
      `this build reads ${BUNDLE_VERSION}) - reload/update the page and try ` +
      `again`);
  }
  const siteOf = (s) => {
    const clean = cleanRecord(s, {
      numbers: ['lat', 'lon', 'elev'],
      strings: ['name', 'tz', 'notes'],
    });
    if (clean && (clean.lat < -90 || clean.lat > 90 || clean.lon < -180 || clean.lon > 180)) {
      throw new Error('backup site has coordinates out of range');
    }
    if (!clean || clean.tz == null || clean.tz === '') return clean;
    if (!validTimeZone(clean.tz)) throw new Error('backup site has an unknown timezone');
    return clean;
  };
  const rigOf = (r) => {
    const clean = cleanRecord(r, {
      numbers: ['focal_mm', 'sensor_w', 'sensor_h', 'fov_w', 'fov_h'],
      strings: ['name'],
    });
    // Optics feed field-of-view arithmetic: absent is allowed, zero/negative is not.
    if (clean && ['focal_mm', 'sensor_w', 'sensor_h', 'fov_w', 'fov_h'].some((k) => clean[k] != null && !(clean[k] > 0))) {
      throw new Error('backup rig has a non-positive focal length, sensor or field size');
    }
    return clean;
  };
  const targetOf = (t) => cleanRecord(t, {
    numbers: ['ra_hours', 'dec_deg', 'vmag'],
    strings: ['primary_name', 'otype', 'size_am', 'constellation', 'blurb'],
  });
  // WE-02 (0.6.32 review): the horizon section is required and its outer
  // shape must be validated HERE, with everything else. The UI performs the
  // deeper horizon normalization before calling restoreBackup, so no caller
  // can clear IndexedDB and only then discover that the horizon payload was
  // unusable. Older formats restore an empty section.
  const horizons = backupHorizonSection(data);
  if (!horizons || typeof horizons !== 'object') {
    throw new Error('backup horizon section is missing');
  }
  if (!Array.isArray(horizons.horizons)) {
    throw new Error('backup horizon section is not a list of horizons');
  }
  const records = (key, clean) => {
    // Legacy exports could omit empty sections; a present section of the
    // wrong type must never be converted into a destructive empty array.
    if (data[key] == null) return [];
    if (!Array.isArray(data[key])) throw new Error(`backup ${key} must be a list`);
    return data[key].map(clean).filter(Boolean);
  };
  const targets = records('targets', (target) => {
    if (!target || typeof target.id !== 'string' || !/^u_[A-Za-z0-9_-]{1,62}$/.test(target.id)) {
      throw new Error('backup custom target has an invalid id (expected u_...)');
    }
    const clean = targetOf(target);
    if (!clean || clean.ra_hours < 0 || clean.ra_hours >= 24 || clean.dec_deg < -90 || clean.dec_deg > 90) {
      throw new Error('backup custom target has invalid coordinates');
    }
    return clean;
  });
  if (new Set(targets.map((target) => target.id)).size !== targets.length) {
    throw new Error('backup contains duplicate custom target ids');
  }
  return {
    sites: records('sites', siteOf),
    rigs: records('rigs', rigOf),
    targets,
    prefs: cleanWebPrefs(data.prefs),
    horizons,
    // Keep unknown values out of localStorage. The old flat names are safe
    // aliases and are staged under the new canonical default name.
    theme: 'workbench',
  };
}

/** Replace records and their optional safety snapshot atomically. A request
 *  or commit failure aborts every clear/put and preserves previous data. */
export async function writeStaged(staged, safety = null) {
  const records = STORES.filter((store) => store !== 'meta');
  await commitWrite(safety ? STORES : records, (transaction) => {
    if (safety) transaction.objectStore('meta').put(safety, 'safety');
    for (const name of records) {
      const store = transaction.objectStore(name);
      store.clear();
      for (const record of staged[name]) store.put(record, record.id);
    }
  });
}

/** The last pre-restore safety snapshot, or null. */
export function lastSafetySnapshot() { return get('meta', 'safety'); }

/** Replace the browser's site/rig/target records from a validated backup.
 *
 *  `current` is a full snapshot of the CURRENT state. Its safety record and
 *  the replacement commit together; a failed transaction preserves all old
 *  records and metadata without a second destructive rollback transaction.
 *  Returns the staged records (including prefs/horizons/theme) for the caller to
 *  apply to localStorage / IndexedDB. */
export async function restoreBackup(data, current) {
  const staged = stageBackup(data);          // validate FIRST - no writes yet
  if (current) stageBackup(current);         // safety must be usable too
  await writeStaged(staged, current);
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
