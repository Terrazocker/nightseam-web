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
      rq.onerror = () => reject(rq.error);
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
  return rows.map((r) => r.val).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function saveRigRec(rig) { return set('rigs', rig.id, rig); }
export function deleteRigRec(id) { return del('rigs', id); }

/** Field-of-view from focal length + sensor size (mirrors the local app). */
export function fovFrom(focalMm, sensorMm) {
  if (!(focalMm > 0) || !(sensorMm > 0)) return null;
  return 2 * Math.atan(sensorMm / (2 * focalMm)) * 180 / Math.PI;
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

/** UTC offset of `tz` (minutes east of UTC) at the instant `date`. DST-aware. */
export function tzOffMinAt(tzName, date) {
  if (!tzName) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName, timeZoneName: 'longOffset', hour12: false,
    }).formatToParts(date);
    const p = parts.find((x) => x.type === 'timeZoneName');
    if (!p || !p.value) return null;
    if (p.value === 'GMT' || p.value === 'UTC') return 0;
    const m = p.value.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
    if (!m) return null;
    const sign = m[1] === '-' ? -1 : 1;
    return sign * (Number(m[2]) * 60 + Number(m[3] || 0));
  } catch { return null; }
}

/** A Date whose browser-local getters show the wall clock in the site timezone. */
export function utcToWall(date) {
  const off = tzOffMinAt(activeTz, date);
  if (off == null) return date;
  return new Date(date.getTime() + (off + date.getTimezoneOffset()) * 60000);
}

/** Inverse of utcToWall: interpret a wall-clock Date (site tz) as a UTC instant. */
export function wallToUtc(date) {
  const off = tzOffMinAt(activeTz, date);
  if (off == null) return date;
  return new Date(date.getTime() - (off + date.getTimezoneOffset()) * 60000);
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

export async function collectBackup(prefs, panos) {
  const [sites, rigs, targets] = await Promise.all([
    all('sites'), all('rigs'), all('targets'),
  ]);
  return {
    app: 'nightseam-web',
    exportedAt: new Date().toISOString(),
    prefs: prefs || {},
    panos: panos || { panos: [], activeId: null },
    sites: sites.map((r) => r.val),
    rigs: rigs.map((r) => r.val),
    targets: targets.map((r) => r.val),
  };
}

/** Write a previously exported backup into storage.
 *  Returns { prefs, panos } for the caller to apply to localStorage. */
export async function restoreBackup(data) {
  if (!data || data.app !== 'nightseam-web') {
    throw new Error('not a NightSeam Web backup');
  }
  await Promise.all(STORES.filter((s) => s !== 'meta').map((s) => clearStore(s)));
  const jobs = [];
  for (const s of (data.sites || [])) { if (s && s.id) jobs.push(set('sites', s.id, s)); }
  for (const r of (data.rigs || [])) { if (r && r.id) jobs.push(set('rigs', r.id, r)); }
  for (const t of (data.targets || [])) { if (t && t.id) jobs.push(set('targets', t.id, t)); }
  await Promise.all(jobs);
  return {
    prefs: (data.prefs && typeof data.prefs === 'object') ? data.prefs : null,
    panos: (data.panos && typeof data.panos === 'object') ? data.panos : null,
  };
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