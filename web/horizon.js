/*
 * NightSeam Web - Horizon editor, horizon storage and shared preferences.
 *
 * A horizon is a skyline on a compass grid (core/horizon.js): points of
 * azimuth/altitude joined by straight lines around the circle, drawn by hand,
 * typed, imported or traced with the phone's camera and sensors (capture.js).
 * Records live in
 * localStorage. Every finished edit saves automatically; undo/redo and the
 * dirty state come from core/horizonhistory.js. This module also owns the
 * planner preferences.
 */
import { vizTheme } from './viztheme.js?v=7';
import { openCapture, captureAvailable, warmCompass } from './capture.js?v=31';
import { normalizeWebPrefs, WEB_PREF_DEFAULTS } from './webstore.js?v=84';
import {
  NO_BLOCK, ALT_MIN, ALT_MAX, MAX_POINTS,
  wrapAz, normalizePoints, normalizeHorizon,
  withProfile, ceilFor, replacePointsInRange, simplifyLine,
  normalizeOverhang, normalizeOverhangs, replaceOverhangsInRange, flatOverhang,
  splitAtNorth, parseHorizonFile, formatHorizonFile, encodeHorizonLink, decodeHorizonLink,
  effectiveMinAlt as coreMinAlt,
  newHistory, historyCommit, historyCanUndo, historyCanRedo, historyUndo,
  historyRedo, historyMarkSaved, historyDirty,
  PLANNER_CHANGE_EVENT, nextPlannerRevision, plannerChange, panoramaRevision,
} from './core.js?v=78';

export { NO_BLOCK, ceilFor };

const LS_KEY = 'nightseam_horizons_v2';
const PREFS_KEY = 'nightseam_prefs_v1';
// This device's camera calibration for the capture overlay (capture.js);
// device-specific, so not part of backups. Version 1 kept a scale per axis
// learned from any motion, which grew with turning speed; it is dropped.
const CAPTURE_CAL_KEY = 'nightseam_capture_cal_v2';
const LEGACY_CAPTURE_CAL_KEY = 'nightseam_capture_cal_v1';
// Storage of the retired panorama editor (records not converted) and the
// retired horizon photos (deleted; the skylines traced over them stay).
const LEGACY_LS_KEY = 'nightseam_panos_v1';
const LEGACY_PHOTO_DBS = ['nightseam-panoimg', 'nightseam-horizon-photos'];
export const MAX_HORIZONS = 50;
const MAX_IMPORT_BYTES = 1024 * 1024;

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

/* ------------------------------ horizon records ------------------------------ */

function removeLegacyStorage() {
  try { localStorage.removeItem(LEGACY_LS_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(LEGACY_CAPTURE_CAL_KEY); } catch { /* ignore */ }
  for (const name of LEGACY_PHOTO_DBS) {
    try { if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase(name); } catch { /* ignore */ }
  }
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

const stored = (h) => ({ id: h.id, name: h.name, points: h.points, overhangs: h.overhangs || [] });

/** Persist records (never derived profiles). Returns false on a
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
  announceHorizonChanged(activeHorizon(), 'delete');
  return ok;
}

/* ------------------------------ backup and restore ------------------------------ */

/** Backup section: the stored records. Embedded photos of older builds are
 *  gone, so nothing here can be missing or unreadable. */
export function exportHorizons() {
  return { horizons: db.horizons.map(stored), activeId: db.activeId };
}

/** Validate a backup's horizon section into a canonical snapshot (pure).
 *  Returns null when anything in it is malformed: ids, points, overhangs or
 *  duplicates. Photo placements and embedded images from older backups are
 *  ignored; their skylines and overhangs restore as they are. */
export function normalizeHorizons(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.horizons)) return null;
  if (data.horizons.length > MAX_HORIZONS) return null;
  try {
    const seen = new Set();
    const horizons = data.horizons.map((raw) => {
      const rec = normalizeHorizon(raw, true);
      if (seen.has(rec.id)) throw new Error('duplicate horizon id');
      seen.add(rec.id);
      return withProfile(rec);
    });
    const activeId = seen.has(data.activeId) ? data.activeId : (horizons[0]?.id ?? null);
    return { horizons, activeId };
  } catch { return null; }
}

/** Replace all horizons with a normalized snapshot. Resolves true after the
 *  record write committed, false on an ordinary failure (nothing changed). */
export async function applyHorizonsSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.horizons)) return false;
  let candidate;
  try {
    candidate = {
      horizons: snapshot.horizons.map((h) => withProfile(normalizeHorizon(stored(h), true))),
      activeId: snapshot.activeId || null,
    };
  } catch { return false; }
  if (!candidate.horizons.some((h) => h.id === candidate.activeId)) {
    candidate.activeId = candidate.horizons[0]?.id ?? null;
  }
  if (!save(candidate)) return false;
  replaceAll(candidate);
  return true;
}

function replaceAll(candidate) {
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
  grid: true,
  // The capture panel starts open on phones and tablets, where it is the quickest way in.
  openPanels: { points: false, display: false,
    capture: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches },
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

/* -------------------------- capture calibration -------------------------- */

/** The stored camera calibration of this device, or null if none or invalid. */
function loadCaptureCalibration() {
  try {
    const v = JSON.parse(localStorage.getItem(CAPTURE_CAL_KEY) || 'null');
    if (!v || typeof v !== 'object') return null;
    const ok = (x, lo, hi) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
    if (!ok(v.delayMs, 0, 400) || !ok(v.k, 0.5, 1.4)) return null;
    return { delayMs: v.delayMs, k: v.k, measured: !!v.measured, scaleMeasured: !!v.scaleMeasured, asked: !!v.asked };
  } catch { return null; }
}

/** Store this device's camera calibration; null forgets it. */
function saveCaptureCalibration(v) {
  try {
    if (v == null) localStorage.removeItem(CAPTURE_CAL_KEY);
    else localStorage.setItem(CAPTURE_CAL_KEY, JSON.stringify(v));
  } catch { /* a convenience only */ }
}

/* ------------------------------ share links ------------------------------ */

const hzNote = (box, text) => { const n = $('#hz-note', box); if (n) n.textContent = text; };

/** The address that carries a horizon to another device. Its points ride in
 *  the fragment (after #), which browsers never send to a server. */
export function horizonLinkUrl(h) {
  return `${location.origin}${location.pathname}#horizon=${encodeHorizonLink(h)}`;
}

/** Show a link to copy by hand where sharing and the clipboard are not available. */
function linkDialog(box, url) {
  const before = document.activeElement;
  const el = document.createElement('div');
  el.className = 'ed-confirm';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'hz-link-title');
  el.innerHTML = `
    <div class="ed-confirm-box">
      <h4 id="hz-link-title">Copy this link</h4>
      <p>Open it on the other device to add the horizon there.</p>
      <textarea class="hz-link-text" id="hz-link-text" rows="4" readonly aria-label="Horizon link">${esc(url)}</textarea>
      <div class="btnrow"><button class="btn primary" type="button" data-ok>Close</button></div>
    </div>`;
  const done = () => { el.remove(); if (before && before.isConnected) before.focus(); };
  el.querySelector('[data-ok]').addEventListener('click', done);
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') done();
    if (ev.key === 'Tab') {   // keep focus inside the dialog
      const items = [el.querySelector('textarea'), el.querySelector('[data-ok]')];
      ev.preventDefault();
      items[(items.indexOf(document.activeElement) + 1) % items.length].focus();
    }
  });
  (box || document.body).appendChild(el);
  const text = el.querySelector('textarea');
  text.focus();
  text.select();
}

/** Send a horizon on: the system share sheet where there is one, else the
 *  clipboard, else a dialog with the link to copy. */
async function shareHorizon(box, h) {
  let url;
  try { url = horizonLinkUrl(h); } catch (error) {
    hzNote(box, `No link made: ${error.message}.`);
    return;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: `NightSeam horizon: ${h.name}`, url });
      hzNote(box, 'Shared. Open the link on the other device to add the horizon there.');
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return;   // the user closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    hzNote(box, 'Link copied. Open it on the other device to add the horizon there.');
  } catch {
    linkDialog(box, url);
  }
}

/** Offer the horizon a shared link carries. Nothing is saved before the user
 *  agrees, and a damaged link changes nothing. Resolves true when added. */
export async function offerHorizonLink(code, box, onChanged = () => {}) {
  let rec;
  try { rec = decodeHorizonLink(code); } catch (error) {
    hzNote(box, `This horizon link could not be read (${error.message}). Nothing was added.`);
    return false;
  }
  if (db.horizons.length >= MAX_HORIZONS) {
    hzNote(box, `You already have ${MAX_HORIZONS} horizons. Delete one, then open the link again.`);
    return false;
  }
  const what = [`${rec.points.length} skyline point${rec.points.length === 1 ? '' : 's'}`];
  if (rec.overhangs.length) what.push(`${rec.overhangs.length} overhang${rec.overhangs.length === 1 ? '' : 's'}`);
  const ok = await confirmDialog(box, {
    title: `Add the horizon “${rec.name}”?`,
    body: `From a shared link: ${what.join(' and ')}. It is saved in this browser and used for planning.`,
    ok: 'Add horizon',
  });
  if (!ok) { hzNote(box, 'The shared horizon was not added.'); return false; }
  flushHorizonEdits();
  const h = createHorizon(rec.name, { points: rec.points, overhangs: rec.overhangs });
  if (!h) { hzNote(box, 'Could not add the horizon: browser storage is full or blocked.'); return false; }
  renderHorizon(box, onChanged);
  onChanged();
  hzNote(box, `Added “${h.name}” from the shared link. It is now the horizon used for planning.`);
  return true;
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

/**
 * Horizon tab. `box` is the #view container; `onChanged` runs after a change
 * that other views should notice (they also listen to planner events).
 */
export function renderHorizon(box, onChanged = () => {}, context = {}) {
  if (typeof context.site === 'function') siteContext = context.site;
  const h = activeHorizon();
  if (!h || ui.id !== h.id) {
    Object.assign(ui, { id: h ? h.id : null, mode: 'draw', zoom: 1, fx: 180, fy: 30, selected: -1, ohSel: null });
  }
  const row = (item) => `
    <li data-id="${esc(item.id)}">
      <input type="radio" name="hz-active" id="hz-r-${esc(item.id)}" ${h && item.id === h.id ? 'checked' : ''}>
      <label class="p-name" for="hz-r-${esc(item.id)}">${esc(item.name)}</label>
      <span class="p-tags">${item.points.length} pt</span>
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
            <button class="btn primary" type="button" id="hz-new-draw">✏ Draw by hand</button>
            <label class="btn" for="hz-import-file" role="button" tabindex="0">⬆ Import file</label>
          </div>
          <input type="file" id="hz-import-file" accept=".txt,.hrz,.csv,text/plain" class="vhidden" hidden tabindex="-1">
          <p class="sub" id="hz-note" role="status" aria-live="polite">Horizons stay in this browser. Changes save automatically.</p>
        </div>
      </aside>
      ${h ? editorHTML(h) : `<section class="horizon-stage" aria-label="Horizon editor">
        <h3 class="horizon-editor-title">Horizon editor</h3>
        <p class="sub">A horizon is the skyline your trees and roofs make. Draw it on a compass grid, trace it with a phone, or import a Stellarium or N.I.N.A. horizon file.</p>
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
        <button class="btn small" type="button" id="hz-share" title="Send this horizon to another device as a link">🔗 Share link</button>
        <button class="btn small" type="button" id="hz-export" title="Save as a plain azimuth/altitude text file">⬇ Export file</button>
      </div>
      <div class="ed-tools" role="toolbar" aria-label="Horizon editing">
        <div class="ed-group hz-modes" role="group" aria-label="Mode">
          <button class="btn" type="button" id="hz-mode-draw" aria-pressed="true">✏ Draw</button>
          <button class="btn" type="button" id="hz-mode-overhang" aria-pressed="false" title="Draw the edge of a balcony, roof or branch: the sky above it is blocked">⌒ Overhang</button>
        </div>
        <div class="ed-group ed-history">
          <button class="btn" type="button" id="ed-undo" title="Undo (Ctrl+Z)">↩ Undo</button>
          <button class="btn" type="button" id="ed-redo" title="Redo (Ctrl+Shift+Z)">↪ Redo</button>
          <button class="btn" type="button" id="hz-clear" title="Remove the skyline and all overhangs (asks first; undoable)">Clear…</button>
        </div>
        <span id="ed-status" class="ed-status" role="status" aria-live="polite">Saved</span>
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
      <details class="hz-panel" id="hz-capture-panel">
        <summary>Phone capture</summary>
        <p class="sub">On a phone or tablet: tap Start tracing, turn with the cross on the skyline, then tap Stop. The phone's motion sensors give the shape. North comes from its compass, which can be several degrees off near cars, railings and buildings; the Moon or a landmark is more exact.</p>
        <div class="btnrow">
          <button class="btn small primary" type="button" id="hz-cap-start">📱 Capture with the camera</button>
        </div>
        <p class="sub" id="hz-cap-status" role="status" aria-live="polite"></p>
      </details>
      <details class="hz-panel ed-display" id="hz-display-panel">
        <summary>Display</summary>
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
        body: 'The skyline is removed from this browser. This cannot be undone.',
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

  const importFile = async (f) => {
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
    const extra = [parsed.thinned ? `thinned from ${parsed.points.length + parsed.thinned} to fit the ${MAX_POINTS}-point limit` : '',
      parsed.skipped ? `${parsed.skipped} other lines skipped` : ''].filter(Boolean).join('; ');
    note(`Imported ${parsed.points.length} points from ${f.name}${extra ? ` (${extra})` : ''}.`);
  };
  $('#hz-import-file', box).addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    importFile(f);
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
      if (/^image\//.test(f.type)) note('Photos are no longer used for horizons. Draw the skyline, trace it with a phone, or drop a horizon text file.');
      else importFile(f);
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

  let gesture = null;
  let capture = null;                     // the open phone capture view
  let warm = null, warmTimer = null;      // the compass warm-up (stop function) and its check
  function stopWarm() {
    if (warm) { warm(); warm = null; }
    if (warmTimer && !cvs.isConnected) { clearInterval(warmTimer); warmTimer = null; }
  }                     // the pointer gesture in progress
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
    disconnect: () => { observer?.disconnect(); gesture = null; capture?.close(); stopWarm(); },
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
  // The canvas may show narrower than it draws (max-width: 100% until the
  // resize observer catches up, or a box under the 280 px minimum), so a
  // pointer position is scaled from the shown size to drawing coordinates.
  const local = (ev) => {
    const r = cvs.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * (r.width ? size.w / r.width : 1), y: (ev.clientY - r.top) * (r.height ? size.h / r.height : 1) };
  };
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
    if (ui.grid) drawGrid(f, V);
    drawMinAlt(f, V);
    drawSkyline(f, V);
    drawOverhangs(f, V);
    if (gesture?.type === 'sketch') drawSketch(f, V);
    ctx.restore();
    drawRulers(f, V);
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
    if (tag) tag.textContent = `${h.points.length} pt`;
  }

  /** The selected point of the current mode's layer, or undefined. */
  const selectedPoint = () => (ui.mode === 'overhang'
    ? (ui.ohSel ? h.overhangs[ui.ohSel.i]?.[ui.ohSel.j] : undefined)
    : h.points[ui.selected]);

  function renderSelection() {
    const p = selectedPoint();
    const az = $('#hz-sel-az', box), alt = $('#hz-sel-alt', box), del = $('#hz-sel-del', box);
    for (const el of [az, alt, del]) el.disabled = !p;
    az.value = p ? String(p.az) : '';
    alt.value = p ? String(p.alt) : '';
  }

  function renderMode() {
    $('#hz-mode-draw', box).setAttribute('aria-pressed', String(ui.mode === 'draw'));
    $('#hz-mode-overhang', box).setAttribute('aria-pressed', String(ui.mode === 'overhang'));
    cvs.dataset.mode = ui.mode;
    $('#hz-help', box).textContent = ui.mode === 'overhang'
      ? 'Drag along the underside of a balcony, roof or branch: the sky above that edge is blocked · drag a point = move · Delete = remove'
      : 'Click = add point · drag a point = move · drag across the grid = sketch the skyline · Delete = remove · wheel = zoom · Space+drag = pan';
    $('#ed-zoom-label', box).textContent = `${ui.zoom.toFixed(1)}×`;
  }

  /** After any change to points or overhangs: derive, save, announce, repaint. */
  function changed(cause = 'edit') {
    withProfile(h);
    persist();
    announceHorizonChanged(h, cause);
    if (ui.selected >= h.points.length) ui.selected = -1;
    if (ui.ohSel && !h.overhangs[ui.ohSel.i]?.[ui.ohSel.j]) ui.ohSel = null;
    renderStatus(); renderSummary(); renderSelection(); renderMode();
    draw();
    onChanged();
  }

  function commit(cause = 'edit') {
    if (historyCommit(hist, h)) changed(cause);
    else draw();
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

  cvs.addEventListener('contextmenu', (ev) => ev.preventDefault());
  cvs.addEventListener('pointerdown', (ev) => {
    if (gesture) return;
    const f = frame(), { x, y } = local(ev), w = toWorld(f, x, y);
    cvs.focus({ preventScroll: true });
    if (ev.button === 1 || (ev.button === 0 && spaceDown)) {
      gesture = { type: 'pan', x, y, fx: ui.fx, fy: ui.fy };
    } else if (ev.button !== 0) {
      return;
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
  const setMode = (mode) => { settle(); ui.mode = mode; renderMode(); draw(); };
  $('#hz-mode-draw', box).addEventListener('click', () => setMode('draw'));
  $('#hz-mode-overhang', box).addEventListener('click', () => setMode('overhang'));

  $('#hz-name', box).addEventListener('change', (ev) => {
    const name = ev.target.value.trim().slice(0, 80);
    if (!name) { ev.target.value = h.name; return; }
    h.name = name;
    if (!save()) note('Renaming failed: browser storage is full or blocked.');
    const label = box.querySelector(`#hz-list li[data-id="${CSS.escape(h.id)}"] .p-name`);
    if (label) label.textContent = name;
    box.querySelector(`#hz-list li[data-id="${CSS.escape(h.id)}"] [data-del]`)?.setAttribute('aria-label', `Delete horizon ${name}`);
  });
  $('#hz-share', box).addEventListener('click', () => {
    if (!h.points.length && !h.overhangs.length) { note('There is nothing to share yet: the skyline has no points.'); return; }
    shareHorizon(box, h);
  });
  $('#hz-export', box).addEventListener('click', () => {
    if (!h.points.length) { note('There is nothing to export yet: the skyline has no points.'); return; }
    download(`${fileSlug(h.name)}-horizon.txt`, formatHorizonFile(h));
    if (h.overhangs.length) note('Exported the skyline. Horizon files have no overhangs, so those stay only in NightSeam and its backups.');
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
  for (const [id, key] of [['#hz-points-panel', 'points'], ['#hz-display-panel', 'display'], ['#hz-capture-panel', 'capture']]) {
    const el = $(id, box);
    el.open = !!ui.openPanels[key];
    el.addEventListener('toggle', () => { ui.openPanels[key] = el.open; });
  }

  /* ---- display ---- */
  $('#hz-grid', box).addEventListener('change', (ev) => { ui.grid = ev.target.checked; draw(); });

  /* ---- phone capture ---- */
  const capStatus = (text) => { const el = $('#hz-cap-status', box); if (el) el.textContent = text; };
  // Warm the compass while the Phone capture panel is open, so north is ready
  // when the capture starts. Leaving the editor (another tab replaces it
  // without telling it) is noticed within 2 s.
  function syncWarm() {
    const want = cvs.isConnected && $('#hz-capture-panel', box)?.open && captureAvailable();
    if (want && !warm) warm = warmCompass();
    if (!want) stopWarm();
  }
  $('#hz-capture-panel', box).addEventListener('toggle', syncWarm);
  warmTimer = setInterval(syncWarm, 2000);
  syncWarm();
  $('#hz-cap-start', box).addEventListener('click', () => {
    if (capture) return;
    if (!captureAvailable()) { capStatus('This browser has no camera or motion sensor access. Use a phone or tablet.'); return; }
    settle();
    capture = openCapture({
      horizon: () => h,
      onLine: (line, kind) => {
        if (kind === 'overhang') {
          const edges = splitAtNorth(line);
          if (!edges.length) return 'An overhang edge needs to span some azimuth: turn sideways while tracing.';
          let next = h.overhangs;
          for (const edge of edges) next = replaceOverhangsInRange(next, edge);
          h.overhangs = next;
          ui.ohSel = null;
        } else {
          h.points = replacePointsInRange(h.points, line).slice(0, MAX_POINTS);
          ui.selected = -1;
        }
        commit('capture');
        const from = wrapAz(line[0].az), to = wrapAz(line[line.length - 1].az);
        return `${kind === 'overhang' ? 'Overhang traced' : 'Skyline traced'} from ${fmt(from)}° ${cardinal(from)} to ${fmt(to)}° ${cardinal(to)}.`;
      },
      onPoint: (p) => {
        if (h.points.length >= MAX_POINTS) return `A horizon has at most ${MAX_POINTS} points.`;
        h.points = normalizePoints([...h.points, p]);
        selectAz(Math.round(wrapAz(p.az) * 100) / 100);
        commit('capture');
        return `Added a point at ${fmt(p.az)}° ${cardinal(p.az)}, ${fmt(p.alt)}° high.`;
      },
      onUndo: undo,
      canUndo: () => historyCanUndo(hist),
      site: () => siteContext(),
      calibration: loadCaptureCalibration(),
      onCalibrated: saveCaptureCalibration,
      onClose: (message) => {
        capture = null;
        if (!cvs.isConnected) return;
        capStatus(message);
        draw();
      },
    });
  });

  /* ---- start ---- */
  Object.assign(ui, clampView(ui.zoom, ui.fx, ui.fy));
  resize();
  observer?.observe($('#hz-box', box));
  renderStatus(); renderSummary(); renderSelection(); renderMode();
  draw();
}
