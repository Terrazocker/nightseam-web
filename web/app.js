/*
 * NightSeam Web — static in-browser night-planning app.
 * Port of NightSeam (<archive>\Object-Astro) core features:
 *   • Tonight  — dark time, moon phase, ranked best targets
 *   • Sky map  — live polar all-dome chart with sun/moon/all catalog objects
 *   • Catalog  — search/sort across 12,116 objects (Messier + OpenNGC)
 *   • Detail   — meta + tonight rise/transit/set + altitude chart
 *   • Settings — sites, rigs, custom targets, backup/restore (webstore.js)
 * All sky math runs client-side (astro.js, Meeus algorithms).
 */
import * as E from './astro.js?v=4';
import * as Hor from './horizon.js?v=13';
import * as WS from './webstore.js?v=5';
import { initDragWindows } from './dragwin.js?v=1';
import { fmtSize, sizeArcmin } from './format.js?v=1';

const TYPE_COLORS = {
  galaxy: '#ffd166',
  open_cluster: '#7cc4ff',
  globular: '#9be0ff',
  nebula: '#7bf1a8',
  planetary: '#8fe3d9',
  supernova_remnant: '#ff8fa3',
  asterism: '#c9b8ff',
  star_cloud: '#e0e6ff',
};
const TYPE_LABELS = {
  galaxy: 'Galaxy', open_cluster: 'Open cluster', globular: 'Globular cluster',
  nebula: 'Nebula', planetary: 'Planetary nebula', supernova_remnant: 'Supernova remnant',
  asterism: 'Asterism', star_cloud: 'Star cloud',
};

/** Debounce timer for the catalog search box — re-renders at most every
 *  150 ms while typing instead of once per keystroke (12k-row filter). */
let _catQDeb = null;

/* ------------------------------ state ------------------------------ */

/** Legacy single-site key — migrated into the sites store on first run. */
const LS_KEY = 'nightseam_site_v1';
function legacySite() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (typeof s.lat === 'number' && typeof s.lon === 'number') return s;
    }
  } catch { /* ignore */ }
  return null;
}

let SITES = [];            // site records from the store
const CONSTELLATIONS = []; // all constellation names from the catalog

/** Active site record from the sites store. */
function activeSite() { return SITES.find((s) => s.id === S.site.id) || SITES[0] || null; }

/** Apply a site record as the active one (state, timezone, top bar). */
function applyActiveSite(site) {
  S.site = { lat: site.lat, lon: site.lon, label: site.name, id: site.id, tz: site.tz || null };
  // global timezone override (hamburger menu, advanced mode) wins over the site's
  const tzPref = Hor.getPrefs().tz;
  WS.setActiveTz(tzPref || site.tz || null);
  Hor.setPrefs({ activeSiteId: site.id });
  const sel = $('#tb-site');
  if (sel) {
    sel.innerHTML = SITES.map((s) => `<option value="${esc(s.id)}"${s.id === site.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
    sel.value = site.id;
  }
}

let CAT = null;                 // array of catalog objects
const byId = new Map();         // id -> object
const searchCache = new Map();  // object -> lowercase search blob
const S = {
  site: { lat: 52.52, lon: 13.4, label: 'Berlin (default)' },
  date: new Date(),
  skyTime: new Date(),
  playing: false,
  view: 'tonight',
  detailId: null,
  cat: { q: '', chip: 'all', con: '', sort: 'mag', up: true, page: 0 },
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const typeColor = (o) => TYPE_COLORS[o.otype] || '#9fb4d8';

/* Hidden popularity scoring — log-scale normalization of the popularity source data.
   M42 (165k) → ~1.0, dim object (100) → ~0.3, no data → 0. */
let _popMap = null;   // normalized-name -> score, from the live the popularity source fetch

/* the popularity source keys Messier objects with a space ("M 42") while the catalog
   stores "M42", so both sides are normalized before lookup - otherwise the
   live values were never found and the baked fallback silently won. */
const popKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
async function loadPopularity() {
  try {
    const r = await fetch('https://popularity-source.invalid/');
    if (r.ok) {
      const raw = await r.json();
      _popMap = {};
      for (const [k, v] of Object.entries(raw)) _popMap[popKey(k)] = v;
    }
  } catch (_) { /* offline or blocked — scoring still works without it */ }
}
function popularityOf(o) {
  /* Prefer the live the popularity source fetch; fall back to the baked catalog
     field (from the DB via build_web.py) when offline/blocked. */
  if (_popMap) {
    const keys = [o.messier, o.ngcic, o.primary_name].filter(Boolean);
    for (const k of keys) {
      const v = _popMap[popKey(k)];
      if (v) return v;
    }
  }
  return o.popularity || 0;
}
function popularityFactor(o) {
  const pop = popularityOf(o);
  if (!pop) return 0;
  return Math.min(1, 0.3 + 0.7 * Math.log10(pop) / 5.2);
}

function searchBlob(o) {
  let b = searchCache.get(o);
  if (b === undefined) {
    b = [o.id, o.primary_name, o.messier, o.ngcic, o.other, o.otype, o.constellation, o.blurb, o.distance]
      .filter(Boolean).join(' ').toLowerCase();
    searchCache.set(o, b);
  }
  return b;
}

function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

/* visible-% cache shared between Tonight and Catalog (key: date|minAlt|pano|obj) */
const obsCache = new Map();
function computeObs(obj, jd0, jd1, step, minAlt, pano, lat, lon) {
  let visN = 0, blocked = 0;
  const ra = obj.ra_hours * 15;
  const n = Math.max(2, Math.round((jd1 - jd0) / step));
  for (let i = 0; i <= n; i++) {
    const jd = jd0 + i * step;
    const [alt, az] = E.altaz(ra, obj.dec_deg, jd, lat, lon);
    const ceil = pano ? Hor.ceilFor(pano, az) : { ceil: Hor.NO_BLOCK, ceilTop: null };
    if (alt >= minAlt && alt > ceil.ceil && alt < (ceil.ceilTop ?? 90.5)) visN++;
    else if (alt > 0) blocked++;
  }
  return { pct: Math.round(100 * visN / (n + 1)), blk: Math.round(100 * blocked / (n + 1)) };
}
/* ONE definition of the night window behind every visibility number, so the
   catalog % column and the Tonight ranking can never disagree with each other
   or with the desktop: astronomical twilight first (app/planning.py), then
   nautical, then civil, then sunset/sunrise, sampled every 6 minutes
   (nightcalc.py's night grid). */
const NIGHT_STEP_MIN = 6;

/** The real instant of the SITE's local noon for a calendar date whose
 *  browser-local getters carry the site's date (see nightAnchor/effToday).
 *  nightInfo() anchors its 48 h scan here, so a site in another timezone is
 *  planned for ITS night instead of the browser's. */
function siteNoon(d) {
  const day = (d && d instanceof Date && !isNaN(d)) ? d : WS.effToday();
  return WS.wallToUtc(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0));
}

function nightWindow() {
  const { lat, lon } = S.site;
  const info = E.nightInfo(nightAnchor(), lat, lon, siteNoon(nightAnchor()));
  const d = (S.date && S.date instanceof Date) ? S.date : WS.effToday();
  // pickDarkWindow applies the polar-day fallback (20:00 -> 04:00) itself, the
  // same one app/planning.py uses
  const { dusk, dawn } = E.pickDarkWindow(info, d);
  return {
    jd0: E.julianDay(dusk), jd1: E.julianDay(dawn),
    step: NIGHT_STEP_MIN / 1440,
    startT: dusk, endT: dawn, info,
  };
}
function obsNightGrid() {
  const { lat, lon } = S.site;
  const w = nightWindow();
  return {
    jd0: w.jd0, jd1: w.jd1, step: w.step,
    minAlt: Hor.effectiveMinAlt(), pano: Hor.activePano(), lat, lon,
  };
}
function obsKey(g, oid) {
  if (obsCache.size > 250000) obsCache.clear(); // guard against stale-site growth
  // the ANCHOR date (topbar "night of", else today at the site) - NOT today:
  // otherwise changing the date re-served the previous night's percentages
  return `${dateKey(nightAnchor())}|${g.minAlt.toFixed(2)}|${g.pano ? g.pano.id : '-'}|${g.lat.toFixed(2)}|${g.lon.toFixed(2)}|${oid}`;
}
function escAttr(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c); }
function cachedPctText(oid) {
  const v = obsCache.get(obsKey(obsNightGrid(), oid));
  if (!v) return '…';
  return `${v.pct}%`;
}

/* ---- desktop-parity helpers: night anchor, catalog mode, units, rig, filters ---- */

/** The date the "night of" is anchored to: the topbar date if set, else
 *  the effective today at the active site. */
function nightAnchor() {
  if (S.date && S.date instanceof Date && !isNaN(S.date)) return S.date;
  return WS.effToday();
}

/** Standard vs advanced catalog (desktop parity: curated 197 vs full 12k). */
function advMode() { return !!Hor.getPrefs().advMode; }
function activeCatalog() {
  return advMode() ? CAT : CAT.filter((o) => !o._adv);
}
/** An object's size in the user's chosen unit. The formatting itself lives in
 *  web/format.js - the web twin of static/js/util.js::fmtSize, pinned by the
 *  "size" engine of tests/js/astro_parity.mjs. It handles BOTH shapes: the
 *  paired "645x550" and the single-axis "330" (a diameter), which used to be
 *  echoed verbatim without a unit and without the unit setting. */
const fmtSizeU = (s) => fmtSize(s, Hor.getPrefs().sizeUnit || 'arcmin');

const RIGS = []; // rig records (filled at boot)
function activeRig() {
  const id = Hor.getPrefs().activeRigId;
  return RIGS.find((r) => r.id === id) || null;
}

/** Frame coverage % for an object with the active rig (fov vs object size). */
function rigFramePct(o) {
  const rig = activeRig();
  if (!rig || !(rig.fov_w > 0)) return null;
  const size = sizeArcmin(o.size_am);
  if (size == null || size <= 0) return null;
  return Math.max(0, Math.min(100, Math.round(100 * (rig.fov_w * 60) / size)));
}

/** Which filter the object wants, if owned. */
function filterOwned(o) {
  const p = Hor.getPrefs();
  const want = { nebula: 'OIII', supernova_remnant: 'Ha', star_cloud: 'L', planetary: 'OIII' }[o.otype];
  if (!want) return null;
  const own = want === 'L' ? p.fltBb : want === 'Ha' ? p.fltHa : p.fltOiii;
  return own ? want : null;
}

/* ---- busy indicator (desktop parity) ---- */
function busy(on, text) {
  const el = $('#busy');
  if (!el) return;
  el.classList.toggle('hidden', !on);
  const t = el.querySelector('.busy-txt');
  if (t) t.textContent = text || '';
}

/* ---- theme (desktop parity) ---- */
const THEME_KEY = 'nightseam_theme';
/** Commit a theme choice (user action): apply attribute + persist.
 *  Glass ('dome') is the default look; 'classic' is the flat blue one.
 *  The key is always persisted (its ABSENCE means "use the default =
 *  Glass" — the head script falls back to 'dome'). */
function applyTheme(t) {
  const name = t === 'classic' || t === '' ? 'classic' : 'dome';
  document.documentElement.setAttribute('data-theme', name);
  try { localStorage.setItem(THEME_KEY, name); } catch { /* ignore */ }
  reflectTheme();
}
/** Sync the picker's active state only — never touches storage or the
 *  attribute (boot must not undo the theme the head script applied). */
function reflectTheme() {
  const t = document.documentElement.getAttribute('data-theme') || '';
  const row = $('#themeRow');
  if (row) row.querySelectorAll('.theme-btn').forEach((b) => b.classList.toggle('active', b.dataset.theme === t));
}

/* ---- weather: Open-Meteo, load-on-demand — nothing is fetched until the
   user clicks the top-bar chip (or auto-load is switched on) ---- */
const WX_STATE = { data: null, loading: false, error: false };
const WMO_INFO = {
  0: ['☀️', 'Clear sky'], 1: ['🌤️', 'Mainly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
  45: ['🌫️', 'Fog'], 48: ['🌫️', 'Icy fog'],
  51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌦️', 'Dense drizzle'],
  56: ['🌧️', 'Freezing drizzle'], 57: ['🌧️', 'Freezing drizzle'],
  61: ['🌧️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
  66: ['🌧️', 'Freezing rain'], 67: ['🌧️', 'Freezing rain'],
  71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['🌨️', 'Heavy snow'], 77: ['🌨️', 'Snow grains'],
  80: ['🌦️', 'Rain showers'], 81: ['🌦️', 'Rain showers'], 82: ['🌧️', 'Violent rain showers'],
  85: ['🌨️', 'Snow showers'], 86: ['🌨️', 'Snow showers'],
  95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm, hail'], 99: ['⛈️', 'Thunderstorm, hail'],
};
function wxInfo(code) { return WMO_INFO[code] || ['🌡️', 'Condition ' + code]; }

async function loadWeather() {
  const chip = $('#wxChip');
  if (!chip) return;
  WX_STATE.loading = true; WX_STATE.error = false;
  wxRenderChip();
  const { lat, lon } = S.site;
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=auto&forecast_days=4';
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 15000);
    const r = await fetch(url, { signal: ac.signal });
    clearTimeout(to);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    WX_STATE.data = await r.json();
  } catch {
    WX_STATE.error = true; WX_STATE.data = null;
  } finally {
    WX_STATE.loading = false;
  }
  wxRenderChip();
  if (!$('#weatherPanel').classList.contains('hidden')) wxRenderPanel();
}

function wxChipText() {
  if (WX_STATE.loading) return '⏳ loading weather…';
  if (WX_STATE.error) return '⚠️ weather unavailable — click to retry';
  if (!WX_STATE.data) return '☁️ Weather — click to load';
  const c = WX_STATE.data.current;
  const [icon] = wxInfo(c.weather_code);
  return `${icon} ${Math.round(c.temperature_2m)}°C · ${Math.round(c.wind_speed_10m)} km/h`;
}

function wxRenderChip() {
  const chip = $('#wxChip');
  if (chip) chip.textContent = wxChipText();
}

/** Re-fetch weather when the active site changed, but only if the user has
 *  already loaded it once (or auto-load is on) — never fetch unasked. */
function refreshWeatherForSite() {
  if (!$( '#wxChip')) return;
  if (WX_STATE.data || WX_STATE.error || Hor.getPrefs().weatherAuto) loadWeather();
}

function wxRenderPanel() {
  const body = $('#wxBody'), siteEl = $('#wxSite');
  if (!body) return;
  const siteName = (activeSite() && activeSite().name) || S.site.label || 'active site';
  if (siteEl) siteEl.textContent = siteName;
  if (WX_STATE.loading) { body.innerHTML = '<p class="hint">loading…</p>'; return; }
  if (WX_STATE.error || !WX_STATE.data) {
    body.innerHTML = '<p class="wx-err">⚠️ Could not load weather' + (WX_STATE.error ? ' — are you offline?' : '') + '</p>' +
      '<p class="hint">Weather comes from Open-Meteo and is only fetched when you click the chip. Try again in a moment.</p>';
    return;
  }
  const d = WX_STATE.data, c = d.current, daily = d.daily || {};
  const [icon, label] = wxInfo(c.weather_code);
  const days = (daily.time || []).map((t, i) => {
    const dt = new Date(t + 'T12:00:00');
    const [di] = wxInfo((daily.weather_code || [])[i] ?? 0);
    const hi = daily.temperature_2m_max ? Math.round(daily.temperature_2m_max[i]) : '—';
    const lo = daily.temperature_2m_min ? Math.round(daily.temperature_2m_min[i]) : '—';
    const pc = daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : null;
    return `<div class="wx-day"><div class="wx-di">${di}</div><div>${dt.toLocaleDateString(undefined, { weekday: 'short' })}</div><div class="wx-t">${hi}°/${lo}°</div>${pc != null ? `<div class="wx-p">💧${pc}%</div>` : ''}</div>`;
  }).join('');
  body.innerHTML = `
    <div class="wx-now">
      <span class="wx-icon">${icon}</span>
      <span class="wx-big">${Math.round(c.temperature_2m)}°C</span>
      <span class="sub" style="flex:1">${label}<br>feels like ${Math.round(c.apparent_temperature)}°</span>
    </div>
    <div class="wx-grid">
      <div><span>Wind</span><b>${Math.round(c.wind_speed_10m)} km/h</b></div>
      <div><span>Gusts</span><b>${Math.round(c.wind_gusts_10m)} km/h</b></div>
      <div><span>Humidity</span><b>${Math.round(c.relative_humidity_2m)}%</b></div>
      <div><span>Clouds</span><b>${Math.round(c.cloud_cover)}%</b></div>
      <div><span>Rain now</span><b>${c.precipitation ? c.precipitation.toFixed(1) + ' mm' : '0 mm'}</b></div>
      <div><span>Updated</span><b>${(c.time || '').slice(11, 16) || '—'}</b></div>
    </div>
    ${days ? `<div class="wx-days">${days}</div>` : ''}
    <p class="hint" style="margin-top:8px">Weather by <a href="https://open-meteo.com/" target="_blank" rel="noopener" style="color:var(--accent)">Open-Meteo</a>, for the active site.</p>`;
}

/* ---------- Wikipedia thumbnails with IndexedDB cache ---------- */
// Only objects without a bundled photo fetch from Wikipedia, only when their
// detail view is opened, thumbnails only. Results (image blobs AND definite
// "no photo" answers) are cached in IndexedDB per object; transient network
// failures are NOT cached so they retry next open.
function idbOpen() {
  return new Promise((resolve, reject) => {
    try {
      const rq = indexedDB.open('nightseam-images', 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore('thumbs'); };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    } catch (e) { reject(e); }
  });
}
async function idbGet(key) {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const t = db.transaction('thumbs', 'readonly').objectStore('thumbs').get(key);
      t.onsuccess = () => resolve(t.result || null);
      t.onerror = () => reject(t.error);
    });
  } catch { return null; }
}
async function idbSet(key, val) {
  try {
    const db = await idbOpen();
    await new Promise((resolve, reject) => {
      const t = db.transaction('thumbs', 'readwrite').objectStore('thumbs').put(val, key);
      t.onsuccess = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } catch { /* storage unavailable — display-only for the session */ }
}
const NEG_TTL = 30 * 86400000; // remember "no photo" for 30 days
const WIKI_API = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
let currentObjUrl = null;

async function loadWikiThumb(o, imgEl, phEl) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-data: reduce)').matches) {
    phEl.textContent = 'photo skipped — reduced data mode';
    return;
  }
  const key = 'w:' + o.id;
  const cached = await idbGet(key);
  if (cached && cached.blob) { showBlob(cached.blob); return; }
  if (cached && cached.missing && Date.now() - cached.ts < NEG_TTL) {
    phEl.textContent = 'no photo on Wikipedia — see the link below';
    return;
  }
  const title = o.wiki || o.primary_name;
  phEl.textContent = 'loading Wikipedia photo…';
  let definitive = false;
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 12000);
  try {
    const r = await fetch(WIKI_API + encodeURIComponent(title), { signal: ac.signal });
    if (r.status === 404 || r.status === 410) { definitive = true; throw new Error('no-page'); }
    if (!r.ok) throw new Error('err-' + r.status);
    const j = await r.json();
    const src = j && j.thumbnail && j.thumbnail.source;
    if (!src) { definitive = true; throw new Error('no-thumb'); }
    const ir = await fetch(src, { signal: ac.signal });
    if (!ir.ok) { definitive = true; throw new Error('no-img'); }
    const blob = await ir.blob();
    if (!blob.type.startsWith('image/')) { definitive = true; throw new Error('bad-type'); }
    await idbSet(key, { blob, ts: Date.now() });
    showBlob(blob);
  } catch {
    if (definitive) await idbSet(key, { missing: true, ts: Date.now() });
    phEl.textContent = definitive ? 'no photo on Wikipedia — see the link below' : 'photo unavailable (offline?) — see the link below';
  } finally {
    clearTimeout(to);
  }
  function showBlob(blob) {
    // a slow fetch for an earlier object must not revoke the URL of the image
    // that is on screen now - once the modal moved on, its element is detached
    if (!imgEl.isConnected) return;
    if (currentObjUrl) URL.revokeObjectURL(currentObjUrl);
    currentObjUrl = URL.createObjectURL(blob);
    imgEl.src = currentObjUrl;
    imgEl.style.display = '';
    phEl.style.display = 'none';
  }
}

/* ------------------------------ shell ------------------------------ */

function splashText(t) { const el = $('#splash-text'); if (el) el.textContent = t; }

function hideSplash() {
  const sp = $('#splash');
  if (sp) sp.style.display = 'none';
}

function route() {
  const h = location.hash || '#tonight';
  S.view = h.slice(1);
  if (!['tonight', 'sky', 'catalog', 'horizon'].includes(S.view)) S.view = 'tonight';
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.v === S.view));
  if (S.view === 'tonight') renderTonight();
  else if (S.view === 'sky') renderSky();
  else if (S.view === 'catalog') renderCatalog();
  else renderHorizonView();
}

function renderHorizonView() {
  const box = $('#view');
  box.innerHTML = '';
  Hor.renderHorizon(box, () => { /* other views re-read H state at render time */ });
}

/* ----------------------------- tonight ----------------------------- */

let tonightTimer = null;
let tonightToken = 0;

function fmtClock(dt) {
  if (!dt) return '—';
  const d = WS.utcToWall(dt);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtDur(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

function renderTonight(silent) {
  // `silent` (pref changes, auto-refresh): keep the current cards on screen
  // and swap in the new ones when the compute finishes — no blank-splash
  // frame that makes the recommended targets vanish and reappear.
  const token = ++tonightToken;
  const box = $('#view');
  if (!silent) {
    splashText('computing tonight…');
    box.innerHTML = `<div class="splash"><div class="splash-inner"><div class="spinner"></div><p id="splash-text">computing tonight…</p></div></div>`;
    // no busy chip here — the ranking compute takes a few milliseconds and
    // toggling the topbar chip shifts the layout for nothing.
  }
  // defer heavy math so the UI paints first
  setTimeout(() => {
    if (token !== tonightToken || S.view !== 'tonight') return; // superseded / view switched
    const { lat, lon } = S.site;
    const win = nightWindow();
    const info = win.info;
    // The selected observing time is the source of truth, exactly like the
    // desktop's scrubbed S.tIdx: "visible now" means "visible at the selected
    // time", and the topbar/sky scrub re-renders this view (see the sky:time
    // listener at boot). S.skyTime is initialised to the current instant, so an
    // untouched page still shows the live situation.
    const selTime = (S.skyTime instanceof Date && !isNaN(S.skyTime))
      ? S.skyTime : new Date();
    const jdSel = E.julianDay(selTime);

    const gridStart = win.startT;
    const gridEnd = win.endT;
    const jd0 = win.jd0, jd1 = win.jd1;
    const step = win.step;                      // 6 min, like the desktop
    const n = Math.max(2, Math.round((jd1 - jd0) / step));
    // moon values for the PLANNED NIGHT (its midpoint), not for "now" - the
    // desktop ships N.moon_illum/N.moon_age_days for the same grid midpoint,
    // and mixing in tonight's live moon made the penalty wrong
    const jdMid = (jd0 + jd1) / 2;
    const mo = E.moonPhase(jdMid);

    const pano = Hor.activePano();
    const prefs = Hor.getPrefs();
    const minAlt = Hor.effectiveMinAlt();
    const moonAware = prefs.moonAware;
    const tfOf = (o) => E.moonSensitivity(o.otype);
    const illum = E.moonIllumination(jdMid);
    /* Moon-aware model shared with the desktop (static/js/derive.js) - the
       curves themselves live in web/astro.js so tests/test_js_parity.py can
       compare them with the desktop's. The filter checkboxes persist as flat
       prefs (fltBb/fltHa/fltOiii), so that is what selects the base separation
       - OIII 90, Ha 60, broadband 120 - exactly like the desktop's
       filterType() (the old `prefs.filters` object was never written by any
       code, which locked the web to the broadband base). */
    const filterType = prefs.fltOiii ? 'oiii' : prefs.fltHa ? 'narrowband' : 'lrgb';
    const moonAge = E.moonAge(jdMid);
    const bortleF = E.bortleMoonFactor(prefs.bortle);
    // moon track over the night grid (computed once)
    const moonAlt = [], moonAz = [];
    for (let i = 0; i <= n; i++) {
      const jd = jd0 + i * step;
      const [mr, md] = E.moonRaDec(jd);
      const [ma, maz] = E.altaz(mr * 15, md, jd, lat, lon);
      moonAlt.push(ma); moonAz.push(maz);
    }

    // Standard mode mirrors the desktop exactly: every curated object is a
    // Tonight candidate (the desktop applies no magnitude gate here - its mag
    // filter belongs to the Targets view). The advanced catalog is the one
    // exception: 12k objects x 121 samples would make this view sluggish in the
    // browser, so the web caps advanced candidates at mag 9 (documented
    // intentional difference; the desktop filters those in Targets instead).
    const candidates = activeCatalog().filter(
      (o) => o.vmag != null && (!o._adv || o.vmag <= 9));
    const rows = [];
    for (const o of candidates) {
      let maxAlt = -90, transitJd = jd0, bestRun = 0, bestStart = jd0;
      let cur = 0, curStart = jd0, visN = 0, blocked = 0;
      let sClassic = 0, sMoon = 0;
      const ra = o.ra_hours * 15;
      const tf = tfOf(o);
      for (let i = 0; i <= n; i++) {
        const jd = jd0 + i * step;
        const [alt, az] = E.altaz(ra, o.dec_deg, jd, lat, lon);
        if (alt > maxAlt) { maxAlt = alt; transitJd = jd; }
        const ceil = pano ? Hor.ceilFor(pano, az) : { ceil: Hor.NO_BLOCK, ceilTop: null };
        const vis = alt >= minAlt && alt > ceil.ceil && alt < (ceil.ceilTop ?? 90.5);
        if (vis) {
          visN++;
          let w = Math.sin(Math.max(0, Math.min(90, alt)) * Math.PI / 180);
          sClassic += w;
          if (moonAware && moonAlt[i] > 0) {
            const sep = E.sepDeg(alt, az, moonAlt[i], moonAz[i]);
            const glow = E.effectiveMoonGlow(illum, sep, filterType, moonAge);
            w *= E.moonPenalty(glow, tf, bortleF);
          }
          sMoon += w;
          if (cur === 0) curStart = jd;
          cur++;
          if (cur > bestRun) { bestRun = cur; bestStart = curStart; }
        } else {
          if (alt > 0) blocked++;
          cur = 0;
        }
      }
      const [altNow, azNow] = E.altaz(ra, o.dec_deg, jdSel, lat, lon);
      const ceilNow = pano ? Hor.ceilFor(pano, azNow) : { ceil: Hor.NO_BLOCK, ceilTop: null };
      const visNow = altNow >= minAlt && altNow > ceilNow.ceil && altNow < (ceilNow.ceilTop ?? 90.5);
      const obsPct = Math.round(100 * visN / (n + 1));
      const blockedPct = Math.round(100 * blocked / (n + 1));
      const pop = popularityFactor(o);
      // popularity is a silent TIEBREAKER (like the desktop): the pure
      // visibility score decides, popularity only separates equal scores
      const score = Math.round((moonAware ? sMoon : sClassic) * 10) / 100;
      rows.push({ o, maxAlt, altNow, visNow, score, bestRun, bestStart, transitJd, visN, obsPct, blockedPct, pop });
    }
    rows.sort((a, b) => (b.score - a.score) || (b.pop - a.pop));
    // share the computed visibility with the catalog column
    {
      const g = { minAlt, pano, lat, lon, jd0, jd1, step };
      for (const r of rows) obsCache.set(obsKey(g, r.o.id), { pct: r.obsPct, blk: r.blockedPct });
    }
    const top = rows.slice(0, 16);
    const visibleAll = rows.filter((r) => r.visNow);
    const nowVisible = visibleAll.slice().sort((a, b) => b.altNow - a.altNow).slice(0, 8);
    const risingLater = rows.filter((r) => !r.visNow && r.maxAlt > 0)
      .sort((a, b) => a.transitJd - b.transitJd).slice(0, 8);

    const darkStart = info.astroDusk, darkEnd = info.astroDawn;
    const darkH = darkStart && darkEnd ? Math.round(((darkEnd - darkStart) / 3600000 + (darkEnd < darkStart ? 24 : 0)) * 10) / 10 : null;
    const visibleCount = visibleAll.length;   // the real count, not the top-8 list

    const pickItem = (r) => {
      const o = r.o;
      const tags = [o.messier, o.ngcic].filter(Boolean).join(' · ');
      const win = r.bestRun > 0
        ? `clear ${fmtClock(E.dateFromJD(r.bestStart))} – ${fmtClock(E.dateFromJD(r.bestStart + r.bestRun * step))}`
        : 'no clear window';
      const fOwn = filterOwned(o);
      return `<li data-id="${esc(o.id)}">
        <span class="dot" style="background:${typeColor(o)}"></span>
        <span><span class="p-name">${esc(o.primary_name)}</span>${tags ? `<span class="p-tags">${esc(tags)}</span>` : ''}${fOwn ? `<span class="f-own" title="filter owned">${esc(fOwn)}</span>` : ''}</span>
        <span class="p-right">
          <b>${r.maxAlt.toFixed(0)}°</b>
          <span class="p-vis">${r.visN ? `${r.obsPct}% of night · ${fmtDur(r.visN * step * 1440)} visible` : 'not clear tonight'}</span>${win}</span>
      </li>`;
    };

    const html = `
      <div class="grid3">
        <div class="card">
          <h3>Dark time</h3>
          <div class="big">${darkH != null ? darkH + ' h' : '—'}</div>
          <div class="sub">astronomical night<br>${darkStart ? fmtClock(darkStart) + ' – ' + fmtClock(darkEnd) : 'no full dark night'}</div>
        </div>
        <div class="card">
          <h3>Moon</h3>
          <div class="big">${mo.icon} ${(mo.illumination * 100).toFixed(0)}%</div>
          <div class="sub">${mo.name}</div>
        </div>
        <div class="card">
          <h3>Visible at ${fmtClock(selTime)}</h3>
          <div class="big">${visibleCount}</div>
          <div class="sub">catalog objects clear at the selected time</div>
        </div>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>Best targets tonight</h3>
        <ul class="pick">${top.length ? top.map(pickItem).join('') : '<li style="cursor:default">nothing tonight — check again in darker skies</li>'}</ul>
      </div>
      <div class="grid2" style="margin-top:14px">
        <div class="card"><h3>Visible at ${fmtClock(selTime)}</h3><ul class="pick">${nowVisible.length ? nowVisible.map((r) => `<li data-id="${esc(r.o.id)}">
          <span class="dot" style="background:${typeColor(r.o)}"></span>
          <span><span class="p-name">${esc(r.o.primary_name)}</span>${r.o.messier ? `<span class="p-tags">${esc(r.o.messier)}</span>` : ''}</span>
          <span class="p-right"><b>${r.altNow.toFixed(0)}° alt</b>transit ${fmtClock(E.dateFromJD(r.transitJd))}</span>
        </li>`).join('') : '<li style="cursor:default">nothing clear at the selected time</li>'}</ul></div>
        <div class="card"><h3>Rising later tonight</h3><ul class="pick">${risingLater.length ? risingLater.map((r) => `<li data-id="${esc(r.o.id)}">
          <span class="dot" style="background:${typeColor(r.o)}"></span>
          <span><span class="p-name">${esc(r.o.primary_name)}</span>${r.o.messier ? `<span class="p-tags">${esc(r.o.messier)}</span>` : ''}</span>
          <span class="p-right"><b>transit ${fmtClock(E.dateFromJD(r.transitJd))}</b>peaks ${r.maxAlt.toFixed(0)}°</span>
        </li>`).join('') : '<li style="cursor:default">everything already up or setting</li>'}</ul></div>
      </div>
      <p class="cat-count" style="margin-top:10px;text-align:center">night of ${dateKey(nightAnchor())} · ${esc(S.site.label || `${S.site.lat.toFixed(2)}, ${S.site.lon.toFixed(2)}`)} · horizon: ${pano ? esc(pano.name) : 'none'} · click any target for details</p>`;
    if (token !== tonightToken || S.view !== 'tonight') return; // superseded / view switched
    box.innerHTML = html;
    box.querySelectorAll('.pick li[data-id]').forEach((li) => li.addEventListener('click', () => openDetail(li.dataset.id)));
    hideSplash();
  }, 30);
}

/* ----------------------------- sky map ----------------------------- */

let skyItems = [];
// uranometria-style rectangular viewport zoom: the chart is a circle in a
// square, but zooming opens a RECTANGLE window (1..8x) over the chart —
// the disc edge can leave the screen, so you see more sky than a circular
// magnifier would show. Wheel = zoom to cursor, drag = pan, double-click
// (or Reset view) = back to 1x.
let SKYV = { zoom: 1, fx: null, fy: null, drag: null, suppressClick: false };

function skyResetView() {
  SKYV.zoom = 1; SKYV.fx = null; SKYV.fy = null;
  if (SKYV.onReset) SKYV.onReset();
}

/** screen (css px within the canvas) -> base chart coords */
function skyScreenToBase(W, sx, sy) {
  const fx = SKYV.fx == null ? W / 2 : SKYV.fx;
  const fy = SKYV.fy == null ? W / 2 : SKYV.fy;
  return [fx + (sx - W / 2) / SKYV.zoom, fy + (sy - W / 2) / SKYV.zoom];
}

function skyClampFocus(W) {
  const Rlim = W / 2 - 22;
  if (SKYV.fx != null) SKYV.fx = Math.max(W / 2 - Rlim, Math.min(W / 2 + Rlim, SKYV.fx));
  if (SKYV.fy != null) SKYV.fy = Math.max(W / 2 - Rlim, Math.min(W / 2 + Rlim, SKYV.fy));
}

/** Start of the 24 h scrub window that CONTAINS the given time: the most
 *  recent noon at-or-before it (yesterday's noon when the clock reads
 *  before 12:00). Without this, any time before noon lands outside the
 *  noon->next-noon range and the slider clamps to its left edge. */
function skyRangeStart(t) {
  const w = WS.utcToWall(t);
  const dayOffset = w.getHours() < 12 ? -1 : 0;
  return WS.wallToUtc(new Date(w.getFullYear(), w.getMonth(), w.getDate() + dayOffset, 12, 0, 0));
}

/* Stable scrub anchor: SKY_ANCHOR is fixed at the first noon, and stays
 * fixed while the time moves WITHIN its 24 h window — this is what stops
 * the slider from jumping back when the time crosses noon mid-drag (a
 * naive "re-anchor to the most recent noon" flips the window under the
 * drag). Only when the time leaves the window (wall-clock picker, "Now",
 * arrows, date change) does it re-anchor, in whole-day steps so a jump is
 * always to an adjacent day, never mid-window. */
let SKY_ANCHOR = null;
function skyAnchor(t) {
  if (SKY_ANCHOR && t >= SKY_ANCHOR && t.getTime() <= SKY_ANCHOR.getTime() + 24 * 3600000) {
    return SKY_ANCHOR;
  }
  if (SKY_ANCHOR) {
    let a = SKY_ANCHOR.getTime();
    while (t.getTime() > a + 24 * 3600000) a += 24 * 3600000;
    while (t.getTime() < a) a -= 24 * 3600000;
    SKY_ANCHOR = new Date(a);
    return SKY_ANCHOR;
  }
  SKY_ANCHOR = skyRangeStart(t);
  return SKY_ANCHOR;
}

function dtoLocalInput(d) {
  const w = WS.utcToWall(d);
  const p = (x) => String(x).padStart(2, '0');
  return `${w.getFullYear()}-${p(w.getMonth() + 1)}-${p(w.getDate())}T${p(w.getHours())}:${p(w.getMinutes())}`;
}

function renderSky() {
  const box = $('#view');
  box.innerHTML = `
    <div class="sky-wrap">
      <div class="sky-canvas-box card"><canvas id="sky"></canvas></div>
      <div class="sky-side">
        <div class="card">
          <h3>Time</h3>
          <label>Wall clock <input id="sky-time" type="datetime-local" value="${dtoLocalInput(S.skyTime)}"></label>
          <label style="margin-top:12px">Scrub <output id="sky-sout"></output>
            <input type="range" id="sky-slider" min="0" max="1440" step="15">
          </label>
          <div class="btnrow" style="margin-top:12px">
            <button class="btn primary" id="sky-now">Now</button>
            <button class="btn" id="sky-reset" title="double-click the chart also resets">↺ Reset view</button>
          </div>
          <p class="sub" style="margin-top:10px">slider spans noon → next noon, site time</p>
        </div>
        <div class="card">
          <h3>Legend</h3>
          <ul class="legend">
            <li><span class="dot" style="background:#ffd166;border-radius:50%"></span>Sun</li>
            <li><span class="dot" style="background:#e6e9ff;border-radius:50%"></span>Moon</li>
            <li><span class="dot" style="background:transparent;border:2px dashed #7bf1a8;border-radius:50%"></span>min altitude</li>
            ${Object.entries(TYPE_COLORS).map(([t, c]) => `<li><span class="dot" style="background:${c}"></span>${TYPE_LABELS[t]}</li>`).join('')}
          </ul>
        </div>
        <div class="card"><h3>Hint</h3><p class="sub" style="font-size:13px">Click an object to open its detail panel. The chart is an all-sky polar view: center = zenith, rim = horizon, north at top. <b>Scroll = zoom · drag = pan · double-click = reset</b> — zooming opens a rectangular window over the chart, so you see more sky than a circular magnifier.</p></div>
      </div>
    </div>`;
  hideSplash();

  const cvs = $('#sky');
  const ctx = cvs.getContext('2d');
  const tip = $('#tooltip');

  const base = activeCatalog();
  const candidates = [
    ...base.filter((o) => !o._adv),
    ...base.filter((o) => o._adv && o.vmag != null && o.vmag <= 9.5)
      .sort((a, b) => (a.vmag ?? 99) - (b.vmag ?? 99)).slice(0, 1400),
  ];

  let _dpr = 1;
  function sizeCanvas() {
    const w = cvs.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    _dpr = dpr;
    cvs.width = w * dpr; cvs.height = w * dpr;
  }

  /** apply the rectangular viewport: zoom about the focus point (which sits
   *  under the canvas centre), so the visible window is a RECTANGLE of the
   *  chart, exactly like the uranometria sky map. */
  function applyView(W) {
    const fx = SKYV.fx == null ? W / 2 : SKYV.fx;
    const fy = SKYV.fy == null ? W / 2 : SKYV.fy;
    ctx.setTransform(_dpr * SKYV.zoom, 0, 0, _dpr * SKYV.zoom,
                     _dpr * (W / 2 - fx * SKYV.zoom),
                     _dpr * (W / 2 - fy * SKYV.zoom));
  }

  function draw() {
    const W = cvs.clientWidth;
    const cx = W / 2, cy = W / 2;
    const R = W / 2 - 22;
    // reset to identity then clear in DEVICE pixels, then apply the view
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    applyView(W);
    skyClampFocus(W);

    // grid
    ctx.strokeStyle = 'rgba(124, 196, 255, .16)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    for (const alt of [20, 40, 60]) {
      ctx.beginPath(); ctx.arc(cx, cy, R * (1 - alt / 90), 0, Math.PI * 2); ctx.stroke();
    }
    // min-altitude ring (planning prefs)
    const minRing = Hor.effectiveMinAlt();
    ctx.strokeStyle = 'rgba(123, 241, 168, .55)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(cx, cy, R * (1 - minRing / 90), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(123, 241, 168, .9)';
    ctx.font = '10.5px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`min ${minRing.toFixed(0)}°`, cx + (R * (1 - minRing / 90)) + 6, cy + 3);
    ctx.strokeStyle = 'rgba(124, 196, 255, .10)';
    for (let az = 0; az < 360; az += 30) {
      const a = E.D2R * az;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.sin(a), cy - R * Math.cos(a));
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(127, 151, 184, .85)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const [az, t] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
      const a = E.D2R * az;
      ctx.fillText(t, cx + (R + 14) * Math.sin(a), cy - (R + 14) * Math.cos(a) + 4);
    }

    // horizon obstruction silhouette (active panorama).
    // Blocked = alt BELOW the ceiling => the OUTER ring between the ceiling
    // curve and the horizon rim (the inner disc is the free sky).
    const pano = Hor.activePano();
    if (pano) {
      const radiusFor = (az, altDeg) => {
        const a = E.D2R * az;
        const r = R * (1 - Math.max(0, Math.min(90, altDeg)) / 90);
        return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
      };
      const ceilPts = [], topPts = [];
      for (let az = 0; az <= 360; az += 2) {
        const { ceil, ceilTop } = Hor.ceilFor(pano, az);
        ceilPts.push(radiusFor(az, ceil > Hor.NO_BLOCK + 0.5 ? ceil : 0));
        if (ceilTop != null) topPts.push(radiusFor(az, ceilTop));
      }
      ctx.fillStyle = 'rgba(255, 80, 80, .15)';
      ctx.strokeStyle = 'rgba(255, 80, 80, .85)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ceilPts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      for (let az = 360; az >= 0; az -= 2) {
        const a = E.D2R * az;
        ctx.lineTo(cx + R * Math.sin(a), cy - R * Math.cos(a));
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // sky mode: blocked ABOVE the visible band = the disc inside the ceiling-top curve
      if (pano.paintMode === 'sky' && topPts.length > 2) {
        ctx.fillStyle = 'rgba(255, 209, 102, .12)';
        ctx.beginPath();
        topPts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
      }
    }

    const jd = E.julianDay(S.skyTime);
    const { lat, lon } = S.site;

    const [sunRa, sunDec] = E.sunRaDec(jd);
    const [moonRa, moonDec] = E.moonRaDec(jd);

    const plot = (ra, dec, drawF) => {
      const [alt, az] = E.altaz(ra, dec, jd, lat, lon);
      if (alt <= 0) return null;
      const a = E.D2R * az;
      const r = R * (1 - alt / 90);
      const x = cx + r * Math.sin(a), y = cy - r * Math.cos(a);
      drawF(x, y, alt, az);
      return { x, y };
    };

    skyItems = [];

    // sun and moon
    plot(sunRa * 15, sunDec, (x, y) => {
      ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 22;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      skyItems.push({ x, y, id: 'SUN', label: 'Sun' });
    });
    plot(moonRa * 15, moonDec, (x, y) => {
      ctx.shadowColor = '#e6e9ff'; ctx.shadowBlur = 16;
      ctx.fillStyle = '#e6e9ff';
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      skyItems.push({ x, y, id: 'MOON', label: 'Moon' });
    });

    // catalog objects
    const labelCands = [];
    for (const o of candidates) {
      const hit = plot(o.ra_hours * 15, o.dec_deg, (x, y, alt) => {
        const mag = o.vmag ?? 99;
        const rad = Math.max(1.1, Math.min(4.2, 4.6 - mag * 0.32));
        ctx.fillStyle = typeColor(o);
        ctx.globalAlpha = Math.min(1, Math.max(.35, 1.25 - alt / 90));
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        if (!o._adv && o.vmag != null && o.vmag < 8.5) {
          labelCands.push({ x, y, text: o.messier || o.primary_name, prio: o.vmag });
        }
      });
      if (hit) skyItems.push({ x: hit.x, y: hit.y, id: o.id, label: o.primary_name, o });
    }

    // names, greedily placed so they never sit on top of the dots (same
    // approach as the desktop: label above-right of the dot, dark halo,
    // brightest first, skipped when it would overlap an earlier label)
    if (labelCands.length) {
      ctx.font = 'bold 10.5px system-ui, sans-serif';
      const placed = [];
      labelCands.sort((a, b) => a.prio - b.prio);
      for (const c of labelCands) {
        const tx = Math.round(c.x) + 5, ty = Math.round(c.y) - 5;
        const w = ctx.measureText(c.text).width + 8, h = 14;
        let ok = true;
        for (const p of placed) {
          if (Math.abs(tx + w / 2 - p.x) < (w + p.w) / 2 &&
              Math.abs(ty - p.y) < h) { ok = false; break; }
        }
        if (!ok) continue;
        placed.push({ x: tx + w / 2, y: ty, w });
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.9)';
        ctx.shadowBlur = 4;
        ctx.fillStyle = 'rgba(219, 233, 255, .85)';
        ctx.fillText(c.text, tx, ty);
        ctx.restore();
      }
    }

    // obstruction-free note: horizon line already drawn
  }

  function posEl(ev) {
    const r = cvs.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  /* screen px -> base chart coords (zoom-aware hit-testing) */
  const toBase = (ev) => {
    const [sx, sy] = posEl(ev);
    return skyScreenToBase(cvs.clientWidth || 1, sx, sy);
  };

  cvs.addEventListener('mousemove', (ev) => {
    const [x, y] = toBase(ev);
    let best = null, bestD = 10000;
    for (const it of skyItems) {
      const d = (it.x - x) ** 2 + (it.y - y) ** 2;
      if (d < bestD) { bestD = d; best = it; }
    }
    if (best && bestD < 130) {
      const extra = best.o
        ? `${best.label} · ${TYPE_LABELS[best.o.otype] || best.o.otype} · mag ${best.o.vmag ?? '—'}`
        : best.label;
      tip.innerHTML = `<b>${esc(extra)}</b>${best.o ? `<br>${esc(best.o.constellation)} · click for detail` : ''}`;
      tip.hidden = false;
      tip.style.left = (ev.clientX + 14) + 'px';
      tip.style.top = (ev.clientY + 14) + 'px';
    } else tip.hidden = true;
  });
  cvs.addEventListener('mouseleave', () => { tip.hidden = true; });
  cvs.addEventListener('click', (ev) => {
    if (SKYV.suppressClick) { SKYV.suppressClick = false; return; }
    const [x, y] = toBase(ev);
    let best = null, bestD = 10000;
    for (const it of skyItems) {
      if (it.id === 'SUN' || it.id === 'MOON') continue;
      const d = (it.x - x) ** 2 + (it.y - y) ** 2;
      if (d < bestD) { bestD = d; best = it; }
    }
    if (best && bestD < 140) openDetail(best.id);
  });

  // ---- rectangular viewport zoom: wheel = zoom-to-cursor, drag = pan,
  //      double-click = reset (uranometria-style) ----
  SKYV.onReset = () => { if (S.view === 'sky') { const w = cvs.clientWidth; sizeCanvas(); draw(); } };
  cvs.addEventListener('wheel', (ev) => {
    if (S.view !== 'sky') return;
    ev.preventDefault();
    const W = cvs.clientWidth || 1;
    const [sx, sy] = posEl(ev);
    const [bx, by] = skyScreenToBase(W, sx, sy);
    const factor = ev.deltaY < 0 ? 1.25 : 0.8;
    const nz = Math.max(1, Math.min(8, SKYV.zoom * factor));
    if (nz === SKYV.zoom) return;
    SKYV.zoom = nz;
    if (SKYV.zoom > 1) {
      // keep the point under the cursor fixed while zooming
      SKYV.fx = bx - (sx - W / 2) / SKYV.zoom;
      SKYV.fy = by - (sy - W / 2) / SKYV.zoom;
      skyClampFocus(W);
    } else { SKYV.fx = null; SKYV.fy = null; }
    draw();
  }, { passive: false });
  cvs.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const rect = cvs.getBoundingClientRect();
    SKYV.drag = {
      sx: ev.clientX, sy: ev.clientY,
      fx: SKYV.fx == null ? rect.width / 2 : SKYV.fx,
      fy: SKYV.fy == null ? rect.width / 2 : SKYV.fy,
      moved: false,
    };
  });
  cvs.addEventListener('pointermove', (ev) => {
    if (SKYV.drag && (ev.buttons & 1)) {
      if (SKYV.zoom <= 1) return;
      const rect = cvs.getBoundingClientRect();
      const dx = ev.clientX - SKYV.drag.sx, dy = ev.clientY - SKYV.drag.sy;
      if (!SKYV.drag.moved && Math.hypot(dx, dy) > 4) {
        SKYV.drag.moved = true;
        tip.hidden = true;
      }
      if (SKYV.drag.moved) {
        SKYV.fx = SKYV.drag.fx - dx / SKYV.zoom;
        SKYV.fy = SKYV.drag.fy - dy / SKYV.zoom;
        skyClampFocus(rect.width);
        draw();
      }
      return;
    }
    cvs.dispatchEvent(new MouseEvent('mousemove', { clientX: ev.clientX, clientY: ev.clientY, bubbles: true }));
  });
  window.addEventListener('pointerup', () => {
    if (SKYV.drag && SKYV.drag.moved) { SKYV.suppressClick = true; setTimeout(() => { SKYV.suppressClick = false; }, 0); }
    SKYV.drag = null;
  });
  cvs.addEventListener('dblclick', (ev) => {
    ev.preventDefault();
    skyResetView();
  });
  const resetBtn = $('#sky-reset');
  if (resetBtn) resetBtn.addEventListener('click', () => { skyResetView(); });

  // time scrub slider: 24 h window containing the current sky time
  const timeEl = $('#sky-time');
  const slider = $('#sky-slider');
  const sout = $('#sky-sout');
  const pad2 = (x) => String(x).padStart(2, '0');
  const rangeStart = () => skyAnchor(S.skyTime);
  const sliderVal = () => {
    const rs = rangeStart();
    return Math.max(0, Math.min(1440, Math.round((S.skyTime.getTime() - rs.getTime()) / 60000)));
  };
  const syncControls = () => {
    slider.value = String(sliderVal());
    sout.textContent = fmtClock(S.skyTime); // wall clock at the site
    timeEl.value = dtoLocalInput(S.skyTime);
  };
  syncControls();
  // every control here also announces the change, so the always-visible topbar
  // scrub (bound to 'sky:time') never keeps showing a stale time
  const announceTime = () => window.dispatchEvent(new CustomEvent('sky:time'));
  slider.addEventListener('input', () => {
    S.skyTime = new Date(rangeStart().getTime() + Number(slider.value) * 60000);
    syncControls();
    draw();
    announceTime();
  });
  timeEl.addEventListener('input', () => {
    const v = timeEl.value;
    if (v) { S.skyTime = WS.wallToUtc(new Date(v)); syncControls(); draw(); announceTime(); }
  });
  $('#sky-now').addEventListener('click', () => {
    S.skyTime = new Date();
    syncControls();
    draw();
    announceTime();
  });

  if (skyTimeHandler) window.removeEventListener('sky:time', skyTimeHandler);
  skyTimeHandler = () => { try { syncControls(); draw(); } catch { /* view gone */ } };
  window.addEventListener('sky:time', skyTimeHandler);

  sizeCanvas();
  draw();
  // ONE resize listener for the app's lifetime: re-adding an anonymous one on
  // every render leaked handlers, and stale ones then drew on detached canvases
  if (skyResizeHandler) window.removeEventListener('resize', skyResizeHandler);
  skyResizeHandler = () => {
    if (S.view !== 'sky') return;
    try { sizeCanvas(); draw(); } catch { /* view switched away */ }
  };
  window.addEventListener('resize', skyResizeHandler);
}

let skyTimeHandler = null;
let skyResizeHandler = null;

/* ----------------------------- catalog ----------------------------- */

/* Chip row for the catalog. Popularity is deliberately NOT a chip: it is a
 * hidden scoring input (see popularityFactor), never a user-facing criterion. */
const CHIP_LABELS = { all: 'All', messier: 'Messier', bright: 'Bright <8', galaxies: 'Galaxies', nebulae: 'Nebulae', clusters: 'Clusters', custom: 'Custom' };
const CHIP_FILTERS = {
  all: () => true,
  messier: (o) => !!o.messier,
  bright: (o) => o.vmag != null && o.vmag < 8,
  galaxies: (o) => o.otype === 'galaxy',
  nebulae: (o) => ['nebula', 'planetary', 'supernova_remnant', 'star_cloud'].includes(o.otype),
  clusters: (o) => ['open_cluster', 'globular', 'asterism'].includes(o.otype),
  custom: (o) => !!o.custom,
};

function filteredCatalog() {
  const f = S.cat;
  const q = f.q.trim().toLowerCase();
  let out = activeCatalog().filter((o) => CHIP_FILTERS[f.chip](o));
  if (f.con) out = out.filter((o) => o.constellation === f.con);
  if (q) out = out.filter((o) => searchBlob(o).includes(q));
  const col = f.sort;
  const pctG = obsNightGrid();
  out = [...out].sort((a, b) => {
    let v = 0;
    if (col === 'name') v = a.primary_name.localeCompare(b.primary_name);
    else if (col === 'ra') v = a.ra_hours - b.ra_hours;
    else if (col === 'dec') v = a.dec_deg - b.dec_deg;
    else if (col === 'type') v = (TYPE_LABELS[a.otype] || a.otype).localeCompare(TYPE_LABELS[b.otype] || b.otype);
    else if (col === 'con') v = a.constellation.localeCompare(b.constellation);
    else if (col === 'size') v = parseFloat(String(a.size_am || '0').split('x')[0]) - parseFloat(String(b.size_am || '0').split('x')[0]);
    else if (col === 'pct') {
      const pa = (obsCache.get(obsKey(pctG, a.id)) || {}).pct ?? -1;
      const pb = (obsCache.get(obsKey(pctG, b.id)) || {}).pct ?? -1;
      v = pa - pb;
    }
    else v = (a.vmag ?? 99) - (b.vmag ?? 99);
    return f.up ? v : -v;
  });
  return out;
}

function renderCatalog() {
  const box = $('#view');
  const list = filteredCatalog();
  const perPage = 60;
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  if (S.cat.page >= pages) S.cat.page = 0;
  const slice = list.slice(S.cat.page * perPage, (S.cat.page + 1) * perPage);
  const rig = activeRig();
  const showFrame = !!rig && rig.fov_w > 0;

  const th = (key, label, num = false) =>
    `<th class="${num ? 'num' : ''}" data-k="${key}">${label}${S.cat.sort === key ? (S.cat.up ? ' ▲' : ' ▼') : ''}</th>`;

  // focus/caret in the search box must survive the re-render below
  const qHadFocus = !!document.activeElement && document.activeElement.id === 'cat-q';
  const qCaret = qHadFocus ? document.activeElement.selectionStart : null;
  box.innerHTML = `
    <div class="cat-bar">
      <input type="search" id="cat-q" aria-label="Search the catalog" placeholder="Search: name, M 31, NGC 7000, galaxy, Cyg…" value="${esc(S.cat.q)}">
      <div class="chips">${Object.keys(CHIP_FILTERS).map((c) => `<button class="chip${S.cat.chip === c ? ' on' : ''}" data-c="${c}">${CHIP_LABELS[c]}</button>`).join('')}</div>
      <select id="cat-con" title="constellation filter">
        <option value="">All constellations</option>
        ${CONSTELLATIONS.map((c) => `<option value="${esc(c)}"${S.cat.con === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      <span class="cat-count">${list.length.toLocaleString()} of ${CAT.length.toLocaleString()} objects${advMode() ? '' : ' (standard mode)'}</span>
      <span class="cat-count" id="pct-status" style="margin-left:12px"></span>
    </div>
    <div class="card" style="padding:8px 10px">
      <table class="cat">
        <thead><tr>${th('name', 'Name')}${th('mag', 'Mag', true)}${th('pct', '% visibility', true)}${th('type', 'Type')}${th('con', 'Con')}${th('size', 'Size', true)}${showFrame ? `<th class="frame" title="frame coverage with the active rig">Frame</th>` : ''}${th('ra', 'RA', true)}${th('dec', 'Dec', true)}</tr></thead>
        <tbody>
          ${slice.map((o) => {
            const tags = [o.messier, o.ngcic].filter(Boolean).join(' · ');
            const fOwn = filterOwned(o);
            const fp = showFrame ? rigFramePct(o) : null;
            return `<tr data-id="${esc(o.id)}">
              <td><span class="tname">${esc(o.primary_name)}</span> ${tags ? `<span class="tags">${esc(tags)}</span>` : ''}${fOwn ? `<span class="f-own" title="filter owned">${esc(fOwn)}</span>` : ''}</td>
              <td class="num">${o.vmag != null ? o.vmag.toFixed(1) : '—'}</td>
              <td class="num pct" data-objid="${escAttr(o.id)}">${cachedPctText(o.id)}</td>
              <td><span class="tag-dot" style="color:${typeColor(o)}">●</span> ${esc(TYPE_LABELS[o.otype] || o.otype || "")}</td>
              <td>${esc(o.constellation)}</td>
              <td class="num">${esc(fmtSizeU(o.size_am))}</td>
              ${showFrame ? `<td class="frame">${fp == null ? '—' : fp >= 100 ? '<span class="fit">fits</span>' : fp + '%'}</td>` : ''}
              <td class="num">${E.formatRA(o.ra_hours)}</td>
              <td class="num">${E.formatDec(o.dec_deg)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="pager">
      <button class="btn" id="pg-prev" ${S.cat.page === 0 ? 'disabled' : ''}>← prev</button>
      <span>page ${S.cat.page + 1} / ${pages}</span>
      <button class="btn" id="pg-next" ${S.cat.page >= pages - 1 ? 'disabled' : ''}>next →</button>
    </div>`;
  hideSplash();

  $('#cat-q').addEventListener('input', (ev) => {
    S.cat.q = ev.target.value;
    S.cat.page = 0;
    clearTimeout(_catQDeb);
    _catQDeb = setTimeout(renderCatalog, 150);
  });
  document.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { S.cat.chip = c.dataset.c; S.cat.page = 0; renderCatalog(); }));
  document.querySelectorAll('th[data-k]').forEach((thEl) => thEl.addEventListener('click', () => {
    const k = thEl.dataset.k;
    if (S.cat.sort === k) S.cat.up = !S.cat.up;
    else { S.cat.sort = k; S.cat.up = k === 'pct' ? false : true; } // visibility: descending first
    renderCatalog();
  }));
  document.querySelectorAll('tbody tr').forEach((tr) => tr.addEventListener('click', () => openDetail(tr.dataset.id)));
  $('#pg-prev').addEventListener('click', () => { if (S.cat.page > 0) { S.cat.page--; renderCatalog(); } });
  $('#pg-next').addEventListener('click', () => { if (S.cat.page < pages - 1) { S.cat.page++; renderCatalog(); } });
  $('#cat-con').addEventListener('change', (ev) => { S.cat.con = ev.target.value; S.cat.page = 0; renderCatalog(); });
  if (qHadFocus) {                       // typing must not be interrupted
    const inp = $('#cat-q');
    if (inp) { inp.focus(); if (qCaret != null) inp.setSelectionRange(qCaret, qCaret); }
  }
  fillPctCells(slice);
  if (S.cat.sort === 'pct') warmPct(list);
}

/** Compute visibility for every row of the current filter (background chunks),
 *  then re-render so the % visibility sort is correct across the whole list. */
function warmPct(list) {
  const g = obsNightGrid();
  if (!(g.jd1 > g.jd0) || !list.length) return;
  const missing = list.filter((o) => !obsCache.has(obsKey(g, o.id)));
  const status = document.querySelector('#pct-status');
  const total = missing.length;
  if (!total) return;
  busy(true, 'computing visibility…');
  let i = 0;
  const tick = () => {
    const t0 = performance.now();
    while (i < missing.length && performance.now() - t0 < 14) {
      const o = missing[i];
      obsCache.set(obsKey(g, o.id), computeObs(o, g.jd0, g.jd1, g.step, g.minAlt, g.pano, g.lat, g.lon));
      i++;
    }
    if (status) status.textContent = `computing visibility… ${Math.round(100 * i / total)}%`;
    if (i < missing.length) setTimeout(tick, 0);
    else {
      if (status) status.textContent = '';
      busy(false);
      // only repaint if the catalog is still the visible view - otherwise this
      // stale chunk overwrote whatever the user had switched to
      if (S.view === 'catalog') renderCatalog();
    }
  };
  tick();
}

/** Lazily compute and fill the "% tonight" column for the current page. */
function fillPctCells(objs) {
  const g = obsNightGrid();
  if (!(g.jd1 > g.jd0) || !objs.length) return;
  let i = 0;
  const tick = () => {
    const t0 = performance.now();
    while (i < objs.length && performance.now() - t0 < 14) {
      const o = objs[i];
      const key = obsKey(g, o.id);
      let v = obsCache.get(key);
      if (!v) { v = computeObs(o, g.jd0, g.jd1, g.step, g.minAlt, g.pano, g.lat, g.lon); obsCache.set(key, v); }
      const cell = document.querySelector(`#view td[data-objid="${escAttr(o.id)}"]`);
      if (cell) cell.textContent = `${v.pct}%`;
      i++;
    }
    if (i < objs.length) setTimeout(tick, 0);
  };
  tick();
}

/* ------------------------------ detail ----------------------------- */

function openDetail(id) {
  const o = byId.get(id);
  if (!o) return;
  const modal = $('#modal');
  const pano = Hor.activePano();
  const { lat, lon } = S.site;
  const info = E.nightInfo(nightAnchor(), lat, lon, siteNoon(nightAnchor()));
  const jd = E.julianDay(new Date());
  const [altNow, azNow] = E.altaz(o.ra_hours * 15, o.dec_deg, jd, lat, lon);
  // the SITE's 00:30, not the browser's (same anchoring rule as nightInfo)
  const localMidnight = WS.wallToUtc(new Date(
    S.date.getFullYear(), S.date.getMonth(), S.date.getDate(), 0, 30));
  const dayInfo = E.objectDayInfo(o.ra_hours * 15, o.dec_deg, localMidnight, lat, lon);

  // Moon distance now + at tonight's peak (proximity awareness, like the smart-scope apps)
  const [moonRa, moonDec] = E.moonRaDec(jd);
  const [moonAltNow, moonAzNow] = E.altaz(moonRa * 15, moonDec, jd, lat, lon);
  const sepNow = E.sepDeg(altNow, azNow, moonAltNow, moonAzNow);
  const illumNow = E.moonIllumination ? E.moonIllumination(jd) : 0;
  let sepPeak = null;
  const peakJd = E.julianDay(dayInfo.transit instanceof Date ? dayInfo.transit : jd);
  try {
    const [mr2, md2] = E.moonRaDec(peakJd);
    const [ma2, maz2] = E.altaz(mr2 * 15, md2, peakJd, lat, lon);
    const [pa, paz] = E.altaz(o.ra_hours * 15, o.dec_deg, peakJd, lat, lon);
    sepPeak = E.sepDeg(pa, paz, ma2, maz2);
  } catch { /* e.g. transit not a Date — keep null */ }
  const moonRow = (label, sep) => {
    if (sep == null) return '';
    const a = Math.round(sep);
    const col = illumNow < 15 ? 'var(--green)' : a >= 90 ? 'var(--green)' : a >= 45 ? 'var(--amber)' : 'var(--bad)';
    const note = a < 30 ? ' — very close to the Moon' : a < 60 ? ' — close to the Moon' : '';
    return `<dt>${label}</dt><dd><span style="color:${col}">${a}°</span><span class="tags">from Moon${note}</span></dd>`;
  };

  const tags = [o.messier, o.ngcic, o.other].filter(Boolean).map(esc).join(' · ');
  const wiki = o.wiki || o.primary_name;

  modal.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
      <div class="modal-head">
        <h2 id="m-title">${esc(o.primary_name)}</h2>
        <button class="close" id="m-close" title="close" aria-label="Close">✕</button>
      </div>
      <span class="tags">${tags}</span>
      <div class="detail-grid">
        <div id="objimg-wrap">
          <img class="objimg" id="d-img" src="img/${encodeURIComponent(id)}.jpg" alt="">
          <div class="objimg-ph" id="d-imgph" style="display:none"></div>
        </div>
        <div>
          <dl class="meta">
            <dt>Type</dt><dd><span style="color:${typeColor(o)}">●</span> ${esc(TYPE_LABELS[o.otype] || o.otype || "")}</dd>
            <dt>Magnitude</dt><dd>${o.vmag != null ? o.vmag.toFixed(1) : '—'}</dd>
            <dt>Size</dt><dd>${esc(fmtSizeU(o.size_am)) || '—'}</dd>
            <dt>Constellation</dt><dd>${esc(o.constellation || '—')}</dd>
            <dt>Distance</dt><dd>${esc(o.distance || '—')}</dd>
            <dt>RA / Dec (J2000)</dt><dd>${E.formatRA(o.ra_hours)} · ${E.formatDec(o.dec_deg)}</dd>
            <dt>Right now</dt><dd>alt ${altNow.toFixed(1)}°, az ${azNow.toFixed(0)}°</dd>
            <dt>Tonight</dt><dd>rises ${fmtClock(dayInfo.rise)} · transits ${fmtClock(dayInfo.transit)} · sets ${fmtClock(dayInfo.set)} · peaks ${dayInfo.maxAlt.toFixed(0)}°</dd>
            ${moonRow('Moon dist now', sepNow)}
            ${sepPeak != null ? moonRow('Moon dist @ peak', sepPeak) : ''}
            <dt>Observable</dt><dd id="d-obs">—</dd>
          </dl>
          ${o.blurb ? `<p class="blurb">${esc(o.blurb)}</p>` : ''}
          <p class="blurb" style="margin-top:8px;font-size:13px"><a class="wiki" href="https://en.wikipedia.org/wiki/${encodeURIComponent(wiki)}" target="_blank" rel="noopener">Wikipedia ↗</a></p>
          ${o.custom ? '<button class="btn small" id="m-del" style="margin-top:10px" title="remove this custom target">🗑 delete target</button>' : ''}
        </div>
      </div>
      <div class="tonight-box">
        <h3>Altitude tonight <span class="cat-count">(local time)</span></h3>
        <canvas id="graph"></canvas>
        <div class="graph-legend">
          <span><i class="sw" style="background:#7bf1a8"></i>clear</span>
          <span><i class="sw" style="background:#ff6b6b"></i>blocked</span>
          <span><i class="sw" style="background:#ffb86b"></i>below min</span>
          <span><i class="sw" style="background:#3a4a66"></i>below horizon</span>
          <span><i class="sw" style="background:#ffd166"></i>moon</span>
          ${pano ? '<span><i class="sw" style="background:#ff6b6b"></i>obstruction</span>' : ''}
        </div>
        <p class="win-note" id="win-note"></p>
      </div>
    </div>`;
  modal.hidden = false;
  $('#m-close').addEventListener('click', closeDetail);
  modal.addEventListener('click', (ev) => { if (ev.target === modal) closeDetail(); });
  wireDetailExtras(modal, o);

  // bundled photo first; if missing, fetch a Wikipedia thumbnail (cached)
  const dImg = $('#d-img');
  const dPh = $('#d-imgph');
  let wikiStarted = false;
  dImg.addEventListener('error', () => {
    if (wikiStarted) return;
    wikiStarted = true;
    dImg.style.display = 'none';
    dPh.style.display = 'flex';
    dPh.textContent = 'loading Wikipedia photo…';
    loadWikiThumb(o, dImg, dPh);
  });

  // ---- altitude chart ----
  const startT = info.sunset || WS.wallToUtc(new Date(S.date.getFullYear(), S.date.getMonth(), S.date.getDate(), 19, 0));
  const endT = info.sunrise || WS.wallToUtc(new Date(S.date.getFullYear(), S.date.getMonth(), S.date.getDate() + 1, 6, 0));
  const t0 = new Date(startT.getTime() - 60 * 60000);
  const t1 = new Date(endT.getTime() + 60 * 60000);
  const jd0 = E.julianDay(t0), jd1 = E.julianDay(t1);
  const steps = 120;
  const minAlt = Hor.effectiveMinAlt();
  const samples = [];
  for (let i = 0; i <= steps; i++) {
    const jdt = jd0 + (i / steps) * (jd1 - jd0);
    const [alt, az] = E.altaz(o.ra_hours * 15, o.dec_deg, jdt, lat, lon);
    const ceil = pano ? Hor.ceilFor(pano, az) : { ceil: Hor.NO_BLOCK, ceilTop: null };
    const vis = alt >= minAlt && alt > ceil.ceil && alt < (ceil.ceilTop ?? 90.5);
    const [mr, md] = E.moonRaDec(jdt);
    const mAlt = E.altaz(mr * 15, md, jdt, lat, lon)[0];
    samples.push({
      t: jdt, alt, az, ceil,
      vis,
      state: alt < 0 ? 'below' : (!vis ? 'blocked' : (alt < minAlt ? 'warn' : 'clear')),
      mAlt,
    });
  }
  const tStart = new Date(t0.getTime());
  const tEnd = new Date(t1.getTime());
  const durMs = tEnd - tStart;

  // The statistics below use the SAME dark window as the targets table
  // (dusk..dawn). The chart itself spans sunset-1h..sunrise+1h for visual
  // context, and counting that wider span made the modal's "% of night" and
  // "best window" disagree with the table (and with the desktop, which clips to
  // dusk..dawn for exactly the same reason).
  const darkWin = E.pickDarkWindow(info, nightAnchor());
  const jdDusk = E.julianDay(darkWin.dusk), jdDawn = E.julianDay(darkWin.dawn);
  const inNight = samples.map((s) => s.t >= jdDusk && s.t <= jdDawn);

  // best window = longest clear run INSIDE the dark window ([start, end) over
  // samples - the same half-open contract as the table's bestRun)
  let run = 0, best = 0, bestStart = -1, curStart = -1;
  for (let i = 0; i <= steps; i++) {
    if (samples[i].vis && inNight[i]) {
      if (run === 0) curStart = i;
      run++;
      if (run > best) { best = run; bestStart = curStart; }
    } else run = 0;
  }
  const winNote = bestStart >= 0 && best > 1
    ? `Best window (clear, ≥${minAlt.toFixed(0)}°): ${fmtClock(new Date(tStart.getTime() + (bestStart / steps) * durMs))} – ${fmtClock(new Date(tStart.getTime() + ((bestStart + best) / steps) * durMs))}`
    : 'No clear window tonight';
  $('#win-note').textContent = winNote;
  const visCount = samples.reduce((a, s, i) => a + (s.vis && inNight[i] ? 1 : 0), 0);
  const nightSamples = inNight.filter(Boolean).length || 1;
  const obsEl = $('#d-obs');
  if (obsEl) {
    const pct = Math.round(100 * visCount / nightSamples);
    const visMin = visCount * (durMs / 60000 / steps);
    obsEl.textContent = visCount ? `${pct}% of night · ${fmtDur(visMin)} visible (min ${minAlt.toFixed(0)}°${pano ? ` + horizon "${esc(pano.name)}"` : ''})` : 'nothing clear at your min altitude / horizon';
  }

  const g = $('#graph');
  const gCtx = g.getContext('2d');
  (function sizeG() {
    const w = g.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    g.width = w * dpr; g.height = 300 * dpr;
    gCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  })();
  const W = g.clientWidth, H = 300, padL = 34, padR = 10, padT = 12, padB = 22;
  const xOf = (ms) => padL + (ms / durMs) * (W - padL - padR);
  const yOf = (alt) => padT + (1 - (alt + 10) / 100) * (H - padT - padB);

  function drawGraph(hoverMs = null) {
    gCtx.clearRect(0, 0, W, H);
    // twilight bands
    const bands = [
      [info.sunset, info.civilDusk, '#123a58'],
      [info.civilDusk, info.nauticalDusk, '#0e2c46'],
      [info.nauticalDusk, info.astroDusk, '#0a2036'],
      [info.astroDawn, info.nauticalDawn, '#0a2036'],
      [info.nauticalDawn, info.civilDawn, '#0e2c46'],
      [info.civilDawn, info.sunrise, '#123a58'],
    ];
    for (const [a, b, col] of bands) {
      if (!a || !b) continue;
      const x1 = xOf(Math.max(0, a.getTime() - tStart.getTime()));
      const x2 = xOf(Math.min(durMs, b.getTime() - tStart.getTime()));
      if (x2 > x1) {
        gCtx.fillStyle = col;
        gCtx.fillRect(x1, padT, x2 - x1, H - padT - padB);
      }
    }
    // horizon + 20° line
    gCtx.strokeStyle = 'rgba(255,255,255,.22)'; gCtx.lineWidth = 1;
    gCtx.setLineDash([]);
    gCtx.beginPath(); gCtx.moveTo(padL, yOf(0)); gCtx.lineTo(W - padR, yOf(0)); gCtx.stroke();
    gCtx.strokeStyle = 'rgba(123, 241, 168, .35)'; gCtx.setLineDash([4, 4]);
    gCtx.beginPath(); gCtx.moveTo(padL, yOf(20)); gCtx.lineTo(W - padR, yOf(20)); gCtx.stroke();
    gCtx.setLineDash([]);
    // axis
    gCtx.fillStyle = 'rgba(127,151,184,.9)';
    gCtx.font = '10px ui-monospace, monospace';
    gCtx.textAlign = 'right';
    for (const alt of [0, 20, 40, 60, 80]) gCtx.fillText(`${alt}°`, padL - 6, yOf(alt) + 3);
    gCtx.textAlign = 'center';
    const ticks = 10;
    for (let i = 0; i <= ticks; i++) {
      const ms = (i / ticks) * durMs;
      gCtx.fillText(fmtClock(new Date(tStart.getTime() + ms)), xOf(ms), H - 6);
    }
    // best window highlight
    if (bestStart >= 0 && best > 1) {
      const x1 = xOf((bestStart / steps) * durMs), x2 = xOf(((bestStart + best) / steps) * durMs);
      gCtx.fillStyle = 'rgba(123, 241, 168, .10)';
      gCtx.fillRect(x1, padT, x2 - x1, H - padT - padB);
    }
    // min altitude line
    gCtx.strokeStyle = 'rgba(123, 241, 168, .5)'; gCtx.lineWidth = 1; gCtx.setLineDash([4, 4]);
    gCtx.beginPath(); gCtx.moveTo(padL, yOf(minAlt)); gCtx.lineTo(W - padR, yOf(minAlt)); gCtx.stroke();
    gCtx.setLineDash([]);
    gCtx.fillStyle = 'rgba(123, 241, 168, .85)'; gCtx.font = '10px ui-monospace, monospace'; gCtx.textAlign = 'right';
    gCtx.fillText(`min ${minAlt.toFixed(0)}°`, W - padR - 4, yOf(minAlt) - 4);
    // obstruction ceilings (active panorama)
    if (pano) {
      gCtx.lineWidth = 1.4;
      const ceilY = (c) => yOf(Math.max(-10, Math.min(92, c)));
      gCtx.setLineDash([5, 4]);
      gCtx.strokeStyle = 'rgba(255, 107, 107, .9)';
      gCtx.beginPath();
      let anyCeil = false, started = false;
      samples.forEach((s, i) => {
        const c = s.ceil.ceil;
        if (c <= Hor.NO_BLOCK + 0.5) { started = false; return; }
        anyCeil = true;
        const x = xOf((i / steps) * durMs), y = ceilY(c);
        if (!started) { gCtx.moveTo(x, y); started = true; } else gCtx.lineTo(x, y);
      });
      if (anyCeil) gCtx.stroke();
      gCtx.strokeStyle = 'rgba(255, 209, 102, .8)';
      gCtx.beginPath();
      let anyTop = false; started = false;
      samples.forEach((s, i) => {
        const c = s.ceil.ceilTop;
        if (c == null) { started = false; return; }
        anyTop = true;
        const x = xOf((i / steps) * durMs), y = ceilY(c);
        if (!started) { gCtx.moveTo(x, y); started = true; } else gCtx.lineTo(x, y);
      });
      if (anyTop) gCtx.stroke();
      gCtx.setLineDash([]);
    }
    // moon
    gCtx.strokeStyle = 'rgba(255, 209, 102, .75)'; gCtx.lineWidth = 1.6; gCtx.setLineDash([5, 4]);
    gCtx.beginPath();
    samples.forEach((s, i) => { const x = xOf((i / steps) * durMs), y = yOf(s.mAlt); i ? gCtx.lineTo(x, y) : gCtx.moveTo(x, y); });
    gCtx.stroke(); gCtx.setLineDash([]);
    // object curve, colored per visibility state
    const STATE_COLORS = { below: 'rgba(86, 106, 134, .55)', blocked: '#ff6b6b', warn: '#ffb86b', clear: '#7bf1a8' };
    gCtx.lineWidth = 2.4;
    for (let i = 0; i < steps; i++) {
      const s = samples[i];
      const x1 = xOf((i / steps) * durMs), y1 = yOf(s.alt);
      const x2 = xOf(((i + 1) / steps) * durMs), y2 = yOf(samples[i + 1].alt);
      gCtx.strokeStyle = STATE_COLORS[s.state] || '#7bf1a8';
      gCtx.beginPath(); gCtx.moveTo(x1, y1); gCtx.lineTo(x2, y2); gCtx.stroke();
    }
    // hover crosshair
    if (hoverMs != null) {
      const ms = Math.max(0, Math.min(durMs, hoverMs));
      const i = Math.round((ms / durMs) * steps);
      const s = samples[i];
      const x = xOf((i / steps) * durMs), y = yOf(s.alt);
      gCtx.strokeStyle = 'rgba(255,255,255,.5)'; gCtx.lineWidth = 1;
      gCtx.beginPath(); gCtx.moveTo(x, padT); gCtx.lineTo(x, H - padB); gCtx.stroke();
      gCtx.fillStyle = '#0b1526';
      gCtx.beginPath(); gCtx.arc(x, y, 4.5, 0, Math.PI * 2); gCtx.fill();
      gCtx.strokeStyle = '#8fd3ff'; gCtx.stroke();
      tip.innerHTML = `<b>${fmtClock(new Date(tStart.getTime() + (i / steps) * durMs))}</b><br>alt ${s.alt.toFixed(1)}° · moon ${s.mAlt.toFixed(1)}°`;
      const rr = g.getBoundingClientRect();
      tip.hidden = false;
      tip.style.left = Math.round(rr.left + Math.min(x + 14, W - 190)) + 'px';
      tip.style.top = Math.round(rr.top + Math.max(10, y - 40) + 8) + 'px';
    }
  }

  drawGraph();
  g.addEventListener('mousemove', (ev) => {
    const r = g.getBoundingClientRect();
    const plotW = W - padL - padR;
    let ms = (ev.clientX - r.left - padL) / plotW * durMs;
    ms = Math.max(0, Math.min(durMs, ms));
    drawGraph(ms);
  });
  g.addEventListener('mouseleave', () => { tip.hidden = true; drawGraph(); });
  if (S.detailResize) window.removeEventListener('resize', S.detailResize);
  S.detailResize = () => { if (!modal.hidden) { sizeG(); drawGraph(); } };
  window.addEventListener('resize', S.detailResize);
}

function closeDetail() {
  const modal = $('#modal');
  modal.hidden = true;
  modal.innerHTML = '';
  if (currentObjUrl) { URL.revokeObjectURL(currentObjUrl); currentObjUrl = null; }
  tip.hidden = true;
  if (S.detailResize) window.removeEventListener('resize', S.detailResize);
}

/* ---- detail extras (custom-target delete) ---- */

function wireDetailExtras(modal, o) {
  if (!o.custom) return;
  const del = modal.querySelector('#m-del');
  if (del) del.onclick = async () => {
    await WS.deleteTargetRec(o.id);
    CAT = CAT.filter((x) => x.id !== o.id);
    byId.delete(o.id);
    closeDetail();
    if (S.cat.chip === 'custom') S.cat.chip = 'all';
    renderCatalog();
  };
}

const tip = {
  set innerHTML(v) { $('#tooltip').innerHTML = v; },
  set hidden(v) { $('#tooltip').hidden = v; },
  get style() { return $('#tooltip').style; },
};
// note: `tip` above is a shim so detail code works before #tooltip exists; declared after use is fine (hoisting of const is not — so we define functions after). See boot below.

/* ------------------------------ settings ------------------------------ */

const TZ_LIST = [
  'Etc/UTC', 'Europe/London', 'Europe/Lisbon', 'Europe/Dublin', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Vienna', 'Europe/Zurich', 'Europe/Madrid', 'Europe/Rome',
  'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Stockholm', 'Europe/Oslo',
  'Europe/Copenhagen', 'Europe/Warsaw', 'Europe/Prague', 'Europe/Budapest',
  'Europe/Athens', 'Europe/Helsinki', 'Europe/Bucharest', 'Europe/Istanbul',
  'Europe/Moscow', 'Europe/Kyiv', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Mexico_City',
  'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'Africa/Cairo',
  'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore',
  'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Perth',
  'Australia/Adelaide', 'Australia/Sydney', 'Pacific/Auckland',
];

const TZ_DATALIST = `<datalist id="tz-list">${TZ_LIST.map((t) => `<option value="${t}">`).join('')}</datalist>`;

function applyEdge() {
  const e = Hor.getPrefs().edge;
  document.documentElement.style.setProperty('--edge', (Number.isFinite(e) ? e : 14) + 'px');
}

function refreshView() {
  // Tonight recomputes SILENTLY here: pref/filter changes keep the current
  // cards on screen and swap in fresh ones when done (no blank frame).
  if (S.view === 'tonight') renderTonight(true);
  else if (S.view === 'sky') renderSky();
  else if (S.view === 'catalog') renderCatalog();
  else renderHorizonView();
}

/** Merge or update a custom target in the catalog (and detail/byId maps). */
function upsertTarget(t) {
  t.custom = true;
  const existing = byId.get(t.id);
  if (existing) Object.assign(existing, t);
  else { CAT.push(t); byId.set(t.id, t); }
}

const objName = (o) => o.primary_name || o.id;

/** Setup dialog — tabs mirror the desktop app: Sites / Rigs / Targets / Backup.
 *  The open tab survives a re-render (save/delete re-renders the whole dialog). */
let SETTINGS_TAB = 'sites';

function showMTab(name) {
  SETTINGS_TAB = name;
  const modal = $('#modal');
  if (!modal) return;
  modal.querySelectorAll('.modal-tabs .tab').forEach((b) => {
    const on = b.dataset.mtab === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  modal.querySelectorAll('.mtabpane').forEach((p) => {
    p.classList.toggle('hidden', p.id !== 'mtab-' + name);
  });
}

async function renderSettings() {
  const modal = $('#modal');
  const sites = await WS.getSites();
  SITES = sites;
  const rigs = await WS.getRigs();
  const targets = await WS.getTargets();
  const active = activeSite();

  const siteRow = (s) => `
    <li data-id="${esc(s.id)}">
      <input type="radio" name="site-active" ${active && s.id === active.id ? 'checked' : ''} title="use for planning">
      <span class="p-name">${esc(s.name)}</span>
      <span class="p-tags">${s.lat.toFixed(3)}, ${s.lon.toFixed(3)} · ${s.elev || 0} m${s.tz ? ` · ${esc(s.tz)}` : ''}</span>
      <button class="btn small" data-editsite="${esc(s.id)}">edit</button>
      <button class="btn small" data-delsite="${esc(s.id)}" title="delete site">✕</button>
    </li>`;
  const rigRow = (r) => `
    <li data-id="${esc(r.id)}">
      <span class="p-name">${esc(r.name)}</span>
      <span class="p-tags">${r.focal_mm ? `${r.focal_mm} mm` : '—'}</span>
      <button class="btn small" data-editrig="${esc(r.id)}">edit</button>
      <button class="btn small" data-delrig="${esc(r.id)}" title="delete rig">✕</button>
    </li>`;
  const targetRow = (t) => `
    <li data-id="${esc(t.id)}">
      <span class="p-name">${esc(t.primary_name)}</span>
      <span class="p-tags">${esc(TYPE_LABELS[t.otype] || t.otype || "")} · RA ${E.formatRA(t.ra_hours)}, Dec ${E.formatDec(t.dec_deg)}${t.vmag != null ? ` · mag ${t.vmag.toFixed(1)}` : ''}</span>
      <button class="btn small" data-edittarget="${esc(t.id)}">edit</button>
      <button class="btn small" data-deltarget="${esc(t.id)}" title="delete target">✕</button>
    </li>`;

  modal.innerHTML = `
    <div class="modal settings" role="dialog" aria-modal="true" aria-labelledby="m-set-title">
      <div class="modal-head">
        <h2 id="m-set-title">Setup</h2>
        <button class="close" id="m-close" title="close" aria-label="Close">✕</button>
      </div>
      <div class="modal-tabs" role="tablist" aria-label="Setup sections">
        <button class="tab" data-mtab="sites" role="tab" aria-selected="true">Sites</button>
        <button class="tab" data-mtab="rigs" role="tab" aria-selected="false">Rigs</button>
        <button class="tab" data-mtab="targets" role="tab" aria-selected="false">Targets</button>
        <button class="tab" data-mtab="backup" role="tab" aria-selected="false">Backup</button>
      </div>

      <div class="mtabpane" id="mtab-sites" role="tabpanel">
        <div class="card">
          <h3>Active site</h3>
          <div class="set-form" style="margin-top:0">
            <label>Latitude <input type="text" inputmode="decimal" id="sf-quick-lat"></label>
            <label>Longitude <input type="text" inputmode="decimal" id="sf-quick-lon"></label>
            <div class="btnrow">
              <button class="btn primary" id="sf-quick-save">Update active site</button>
              <button class="btn" id="sf-quick-locate">use my location</button>
              <span class="sub" id="sf-quick-note" style="align-self:center"></span>
            </div>
          </div>
        </div>
        <div class="card">
          <h3>Sites</h3>
          <ul class="pick" id="set-sites">${sites.length ? sites.map(siteRow).join('') : '<li style="cursor:default">no site yet — add one below</li>'}</ul>
          <div class="btnrow" style="margin-top:8px"><button class="btn small" id="set-add-site">＋ Add site</button></div>
          <div class="set-form" id="sf-site" hidden>
            <input type="hidden" id="sf-site-id">
            <label>Name <input type="text" id="sf-site-name"></label>
            <label>Lat <input type="text" inputmode="decimal" id="sf-site-lat"></label>
            <label>Lon <input type="text" inputmode="decimal" id="sf-site-lon"></label>
            <label>Elev (m) <input type="text" inputmode="decimal" id="sf-site-elev" value="0"></label>
            <label>Timezone <input type="text" id="sf-site-tz" list="tz-list" placeholder="browser default">${TZ_DATALIST}</label>
            <div class="btnrow"><button class="btn primary" id="sf-site-save">Save site</button><button class="btn" id="sf-site-cancel">Cancel</button></div>
          </div>
        </div>
      </div>

      <div class="mtabpane hidden" id="mtab-rigs" role="tabpanel">
        <div class="card">
          <h3>Rigs</h3>
          <p class="sub">Telescope + camera combinations for the frame-coverage estimates; the field of view comes from focal length and sensor size.</p>
          <ul class="pick" id="set-rigs">${rigs.length ? rigs.map(rigRow).join('') : '<li style="cursor:default">no rig yet — press “Add rig”</li>'}</ul>
          <div class="btnrow" style="margin-top:8px"><button class="btn small" id="set-add-rig">＋ Add rig</button></div>
          <div id="set-rig-picker" hidden>
            <p class="sub">Pick a smart telescope, or build a custom rig.</p>
            <ul class="pick" id="set-rig-presets"></ul>
            <div class="btnrow">
              <button class="btn small" id="set-rig-custom">Custom rig…</button>
              <button class="btn small" id="set-rig-pick-cancel">Cancel</button>
            </div>
          </div>
          <div class="set-form" id="sf-rig" hidden>
            <input type="hidden" id="sf-rig-id">
            <label>Name <input type="text" id="sf-rig-name"></label>
            <label>Focal (mm) <input type="text" inputmode="decimal" id="sf-rig-focal"></label>
            <label>Sensor W (mm) <input type="text" inputmode="decimal" id="sf-rig-sw"></label>
            <label>Sensor H (mm) <input type="text" inputmode="decimal" id="sf-rig-sh"></label>
            <p class="sub" id="sf-rig-fov"></p>
            <div class="btnrow"><button class="btn primary" id="sf-rig-save">Save rig</button><button class="btn" id="sf-rig-cancel">Cancel</button></div>
          </div>
        </div>
      </div>

      <div class="mtabpane hidden" id="mtab-targets" role="tabpanel">
        <div class="card">
          <h3>Custom targets</h3>
          <ul class="pick" id="set-targets">${targets.length ? targets.map(targetRow).join('') : '<li style="cursor:default">no custom targets — add your own objects (ids u_*)</li>'}</ul>
          <div class="btnrow" style="margin-top:8px"><button class="btn small" id="set-add-target">＋ New target</button></div>
          <div class="set-form" id="sf-target" hidden>
            <input type="hidden" id="sf-target-id">
            <label>Name <input type="text" id="sf-target-name"></label>
            <label>Type <select id="sf-target-type">${Object.entries(TYPE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
            <label>RA <input type="text" id="sf-target-ra" placeholder="e.g. 5 34 32 or 5.575 h"></label>
            <label>Dec <input type="text" id="sf-target-dec" placeholder="e.g. +22 0 60 or 22.017°"></label>
            <label>Mag <input type="text" inputmode="decimal" id="sf-target-vmag"></label>
            <label>Size (arcmin) <input type="text" id="sf-target-size" placeholder="e.g. 6x4"></label>
            <label>Constellation <input type="text" id="sf-target-con" placeholder="e.g. Ori"></label>
            <label>Notes <input type="text" id="sf-target-blurb"></label>
            <p class="sub" id="sf-target-err"></p>
            <div class="btnrow"><button class="btn primary" id="sf-target-save">Save target</button><button class="btn" id="sf-target-cancel">Cancel</button></div>
          </div>
        </div>
      </div>

      <div class="mtabpane hidden" id="mtab-backup" role="tabpanel">
        <div class="card">
          <h3>Backup &amp; transfer</h3>
          <p class="sub">A backup covers sites, rigs, custom targets, horizon profiles and settings — the browser equivalent of the desktop app's ZIP export/import.</p>
          <div class="btnrow" style="margin-top:10px">
            <button class="btn primary" id="set-export">⬇ Export backup (JSON)</button>
            <label class="btn" for="set-import" style="text-align:center">⬆ Import backup</label>
            <input type="file" id="set-import" accept="application/json,.json" class="vhidden">
          </div>
          <p class="sub" style="margin-top:8px">Layout (free space per side) lives in the hamburger menu under <b>Layout</b>.</p>
        </div>
      </div>
    </div>`;
  modal.hidden = false;
  showMTab(SETTINGS_TAB);

  $('#m-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (ev) => { if (ev.target === modal) closeModal(); });
  // tab strip (desktop parity: Sites / Rigs / Targets / Backup)
  modal.querySelectorAll('.modal-tabs .tab').forEach((b) => {
    b.addEventListener('click', () => showMTab(b.dataset.mtab));
  });

  // — quick active-site coordinates —
  const qlat = $('#sf-quick-lat'), qlon = $('#sf-quick-lon'), qnote = $('#sf-quick-note');
  if (qlat && qlon) {
    qlat.value = S.site.lat.toFixed(4);
    qlon.value = S.site.lon.toFixed(4);
  }
  const qApply = async (lat, lon) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      if (qnote) qnote.textContent = 'invalid coordinates';
      return;
    }
    const rec = activeSite();
    if (rec) {
      rec.lat = lat; rec.lon = lon;
      await WS.saveSiteRec(rec);
      applyActiveSite(rec);
    } else {
      S.site = { ...S.site, lat, lon };
    }
    if (qnote) qnote.textContent = rec ? 'saved — ' + rec.name : 'saved';
    refreshView();
  };
  const qsave = $('#sf-quick-save');
  if (qsave) qsave.addEventListener('click', () => qApply(Hor.num(qlat.value), Hor.num(qlon.value)));
  const qloc = $('#sf-quick-locate');
  if (qloc) qloc.addEventListener('click', () => {
    if (!navigator.geolocation) { if (qnote) qnote.textContent = 'geolocation unavailable'; return; }
    navigator.geolocation.getCurrentPosition((pos) => qApply(pos.coords.latitude, pos.coords.longitude),
      () => { if (qnote) qnote.textContent = 'location denied'; });
  });

  // — sites —
  if ($('#set-sites')) $('#set-sites').querySelectorAll('li[data-id]').forEach((li) => {
    const radio = li.querySelector('input[type=radio]');
    if (radio) radio.addEventListener('change', () => {
      const s = SITES.find((x) => x.id === li.dataset.id);
      if (s) { applyActiveSite(s); closeModal(); refreshView(); refreshWeatherForSite(); }
    });
  });
  modal.querySelectorAll('[data-editsite]').forEach((b) => b.addEventListener('click', () => openSiteForm(sites.find((s) => s.id === b.dataset.editsite))));
  modal.querySelectorAll('[data-delsite]').forEach((b) => b.addEventListener('click', async () => {
    const s = sites.find((x) => x.id === b.dataset.delsite);
    if (!s || !confirm(`Delete site "${s.name}"?`)) return;
    await WS.deleteSiteRec(s.id);
    SITES = SITES.filter((x) => x.id !== s.id);
    if (!SITES.length) { closeModal(); return; }
    const still = SITES.find((x) => x.id === S.site.id);
    applyActiveSite(still || SITES[0]);
    closeModal(); refreshView();
  }));
  $('#set-add-site').addEventListener('click', () => openSiteForm(null));

  // — rigs —
  modal.querySelectorAll('[data-editrig]').forEach((b) => b.addEventListener('click', () => openRigForm(rigs.find((r) => r.id === b.dataset.editrig))));
  modal.querySelectorAll('[data-delrig]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this rig?')) return;
    await WS.deleteRigRec(b.dataset.delrig);
    closeModal(); renderSettings();
  }));
  $('#set-add-rig').addEventListener('click', () => showRigPicker());
  $('#set-rig-pick-cancel').addEventListener('click', () => renderSettings());
  $('#set-rig-custom').addEventListener('click', () => {
    showForm('sf-rig');
    $('#set-rig-picker').hidden = true;
    $('#sf-rig-name').value = '';
    $('#sf-rig-focal').value = '';
    $('#sf-rig-sw').value = '';
    $('#sf-rig-sh').value = '';
    fovPreview();
    $('#sf-rig-name').focus();
  });

  // — custom targets —
  modal.querySelectorAll('[data-edittarget]').forEach((b) => b.addEventListener('click', () => openTargetForm(targets.find((t) => t.id === b.dataset.edittarget))));
  modal.querySelectorAll('[data-deltarget]').forEach((b) => b.addEventListener('click', async () => {
    const t = targets.find((x) => x.id === b.dataset.deltarget);
    if (!t || !confirm(`Delete custom target "${objName(t)}"?`)) return;
    await WS.deleteTargetRec(t.id);
    CAT = CAT.filter((x) => x.id !== t.id);
    byId.delete(t.id);
    closeModal(); refreshView();
  }));
  $('#set-add-target').addEventListener('click', () => openTargetForm(null));

  // — backup / transfer —
  $('#set-export').addEventListener('click', async () => {
    const backup = await WS.collectBackup(Hor.getPrefs(), Hor.exportPanos());
    WS.downloadText(`nightseam-web-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 1));
  });
  $('#set-import').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const data = JSON.parse(rd.result);
        const counts = {
          sites: (data.sites || []).length,
          rigs: (data.rigs || []).length,
          targets: (data.targets || []).length,
          panos: (data.panos && data.panos.panos ? data.panos.panos : []).length,
        };
        if (!confirm(`Import backup?\nSites: ${counts.sites} · Rigs: ${counts.rigs} · Custom targets: ${counts.targets}\nHorizons: ${counts.panos}\n\nYour current browser data will be replaced.`)) return;
        const applied = await WS.restoreBackup(data);
        if (applied.prefs) Hor.setPrefs(applied.prefs);
        if (applied.panos) Hor.importPanos(applied.panos);
        applyEdge();
        await reinitUserData();
        closeModal(); refreshView();
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    };
    rd.onerror = () => alert('could not read the file');
    rd.readAsText(f);
  });

  // form save/cancel wiring
  $('#sf-site-save').addEventListener('click', saveSiteForm);
  $('#sf-site-cancel').addEventListener('click', () => { closeModal(); renderSettings(); });
  $('#sf-rig-save').addEventListener('click', saveRigForm);
  $('#sf-rig-cancel').addEventListener('click', () => { closeModal(); renderSettings(); });
  $('#sf-target-save').addEventListener('click', saveTargetForm);
  $('#sf-target-cancel').addEventListener('click', () => { closeModal(); renderSettings(); });
  ['sf-rig-focal', 'sf-rig-sw', 'sf-rig-sh'].forEach((id) => $('#' + id).addEventListener('input', fovPreview));
}

function showForm(id) {
  ['sf-site', 'sf-rig', 'sf-target'].forEach((f) => { $('#' + f).hidden = f !== id; });
}

function openSiteForm(site) {
  showForm('sf-site');
  $('#sf-site-id').value = site ? site.id : '';
  $('#sf-site-name').value = site ? site.name : '';
  $('#sf-site-lat').value = site ? site.lat : S.site.lat;
  $('#sf-site-lon').value = site ? site.lon : S.site.lon;
  $('#sf-site-elev').value = site ? (site.elev || 0) : 0;
  $('#sf-site-tz').value = site ? (site.tz || '') : '';
  $('#sf-site-name').focus();
}

async function saveSiteForm() {
  const name = $('#sf-site-name').value.trim();
  const lat = Hor.num($('#sf-site-lat').value);
  const lon = Hor.num($('#sf-site-lon').value);
  const elev = Hor.num($('#sf-site-elev').value);
  const tz = $('#sf-site-tz').value.trim() || null;
  if (!name) { alert('Please name the site.'); return; }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    alert('Latitude must be -90…90 and longitude -180…180.');
    return;
  }
  const id = $('#sf-site-id').value || WS.NEW_SITE_ID();
  const rec = { id, name, lat, lon, elev: Number.isFinite(elev) ? elev : 0, tz };
  await WS.saveSiteRec(rec);
  SITES = await WS.getSites();
  if (!SITES.some((s) => s.id === S.site.id)) applyActiveSite(rec);
  else if (S.site.id === id) applyActiveSite(rec);
  refreshWeatherForSite();
  renderSettings();
}

/** "Add rig" picker: the preset smart telescopes, or a custom rig.
 *  Presets are plain data - adding one stores a normal rig record, so the rig
 *  can be edited or deleted like any other. */
function showRigPicker() {
  const box = $('#set-rig-presets'), panel = $('#set-rig-picker');
  if (!box || !panel) return;
  showForm(null);                                  // custom form stays hidden
  panel.hidden = false;
  box.innerHTML = WS.DEFAULT_RIGS.map((p, i) => {
    const fw = WS.fovFrom(p.focal_mm, p.sensor_w), fh = WS.fovFrom(p.focal_mm, p.sensor_h);
    const fov = fw != null && fh != null ? `${fw.toFixed(2)}° × ${fh.toFixed(2)}°` : '';
    return `<li data-preset="${i}">
      <span class="p-name">${esc(p.name)}</span>
      <span class="p-tags">${p.focal_mm} mm${fov ? ` · ${fov}` : ''}</span>
      <button class="btn small" data-addpreset="${i}">Add</button>
    </li>`;
  }).join('');
  box.querySelectorAll('[data-addpreset]').forEach((b) => b.addEventListener('click', async () => {
    const p = WS.DEFAULT_RIGS[+b.dataset.addpreset];
    if (!p) return;
    await WS.saveRigRec({
      id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: p.name, focal_mm: p.focal_mm, sensor_w: p.sensor_w, sensor_h: p.sensor_h,
      fov_w: WS.fovFrom(p.focal_mm, p.sensor_w), fov_h: WS.fovFrom(p.focal_mm, p.sensor_h),
    });
    await renderSettings();                        // keeps the Rigs tab open
  }));
}

function openRigForm(rig) {
  showForm('sf-rig');
  $('#sf-rig-id').value = rig ? rig.id : '';
  $('#sf-rig-name').value = rig ? rig.name : '';
  $('#sf-rig-focal').value = rig ? rig.focal_mm : '';
  $('#sf-rig-sw').value = rig ? rig.sensor_w : '';
  $('#sf-rig-sh').value = rig ? rig.sensor_h : '';
  fovPreview();
  $('#sf-rig-name').focus();
}

function fovPreview() {
  const f = Hor.num($('#sf-rig-focal').value);
  const w = Hor.num($('#sf-rig-sw').value);
  const h = Hor.num($('#sf-rig-sh').value);
  const el = $('#sf-rig-fov');
  if (el) {
    const fw = WS.fovFrom(f, w), fh = WS.fovFrom(f, h);
    el.textContent = fw != null && fh != null ? `field of view ≈ ${fw.toFixed(2)}° × ${fh.toFixed(2)}°` : 'field of view appears once focal length + sensor size are set';
  }
}

async function saveRigForm() {
  const name = $('#sf-rig-name').value.trim();
  if (!name) { alert('Please name the rig.'); return; }
  const id = $('#sf-rig-id').value || 'r' + Date.now().toString(36);
  const focal = Hor.num($('#sf-rig-focal').value);
  const sw = Hor.num($('#sf-rig-sw').value);
  const sh = Hor.num($('#sf-rig-sh').value);
  const rec = {
    id, name,
    focal_mm: Number.isFinite(focal) && focal > 0 ? focal : null,
    sensor_w: Number.isFinite(sw) && sw > 0 ? sw : null,
    sensor_h: Number.isFinite(sh) && sh > 0 ? sh : null,
    fov_w: null, fov_h: null,
  };
  rec.fov_w = WS.fovFrom(rec.focal_mm, rec.sensor_w);
  rec.fov_h = WS.fovFrom(rec.focal_mm, rec.sensor_h);
  await WS.saveRigRec(rec);
  renderSettings();
}

function openTargetForm(target) {
  showForm('sf-target');
  $('#sf-target-id').value = target ? target.id : '';
  $('#sf-target-name').value = target ? target.primary_name : '';
  $('#sf-target-type').value = target ? target.otype : 'galaxy';
  $('#sf-target-ra').value = target ? E.formatRA(target.ra_hours) : '';
  $('#sf-target-dec').value = target ? E.formatDec(target.dec_deg) : '';
  $('#sf-target-vmag').value = target && target.vmag != null ? String(target.vmag) : '';
  $('#sf-target-size').value = target ? (target.size_am || '') : '';
  $('#sf-target-con').value = target ? (target.constellation || '') : '';
  $('#sf-target-blurb').value = target ? (target.blurb || '') : '';
  $('#sf-target-err').textContent = '';
  $('#sf-target-name').focus();
}

async function saveTargetForm() {
  const err = $('#sf-target-err');
  const name = $('#sf-target-name').value.trim();
  const ra = WS.parseRA($('#sf-target-ra').value);
  const dec = WS.parseDec($('#sf-target-dec').value);
  if (!name || !Number.isFinite(ra) || !Number.isFinite(dec)) {
    err.textContent = 'Name is required; RA in hours (e.g. "5 34 32", "5.575") and Dec in degrees (e.g. "+22 0 60", "22.017").';
    return;
  }
  const vmagS = $('#sf-target-vmag').value.trim();
  const vmag = vmagS ? Hor.num(vmagS) : null;
  const id = $('#sf-target-id').value || WS.newTargetId();
  const rec = {
    id, primary_name: name, otype: $('#sf-target-type').value,
    ra_hours: ra, dec_deg: dec,
    vmag: Number.isFinite(vmag) ? vmag : null,
    size_am: $('#sf-target-size').value.trim(),
    constellation: $('#sf-target-con').value.trim(),
    blurb: $('#sf-target-blurb').value.trim(),
    distance: null, wiki: null, messier: null, ngcic: null, other: '',
    _adv: false,
  };
  await WS.saveTargetRec(rec);
  upsertTarget(rec);
  renderSettings();
}

function closeModal() {
  const modal = $('#modal');
  if (modal) { modal.hidden = true; modal.innerHTML = ''; }
}

/** Re-read user data after a backup import (sites, targets). */
async function reinitUserData() {
  SITES = await WS.getSites();
  for (const t of await WS.getTargets()) upsertTarget(t);
  let sid = Hor.getPrefs().activeSiteId;
  if (!SITES.some((s) => s.id === sid)) sid = SITES.length ? SITES[0].id : null;
  if (sid && SITES.some((s) => s.id === sid)) applyActiveSite(SITES.find((s) => s.id === sid));
}

/* ---- first-run welcome (browser equivalent of the desktop wizard) ---- */

function welcomeFlow() {
  return new Promise((resolve) => {
    const modal = $('#modal');
    modal.innerHTML = `
      <div class="modal welcome" role="dialog" aria-modal="true" aria-labelledby="m-wel-title">
        <div class="modal-head">
          <h2 id="m-wel-title">👋 Welcome to NightSeam Web</h2>
        </div>
        <p class="sub">Where will you observe? You can add more sites any time via Setup in the top bar.</p>
        <div class="set-form">
          <label>Site name <input type="text" id="w-name" value="My observing site"></label>
          <label>Latitude <input type="text" inputmode="decimal" id="w-lat" value="52.52"></label>
          <label>Longitude <input type="text" inputmode="decimal" id="w-lon" value="13.40"></label>
          <label>Elevation (m) <input type="text" inputmode="decimal" id="w-elev" value="0"></label>
          <label>Timezone <input type="text" id="w-tz" list="tz-list" placeholder="browser default">${TZ_DATALIST}</label>
          <div class="btnrow" style="margin-top:12px">
            <button class="btn primary" id="w-save">Save my site</button>
            <button class="btn" id="w-geo">use my location</button>
            <button class="btn" id="w-skip">Skip</button>
          </div>
        </div>
      </div>`;
    modal.hidden = false;
    const finish = (site) => { modal.hidden = true; modal.innerHTML = ''; resolve(site); };
    $('#w-save').addEventListener('click', () => {
      const name = $('#w-name').value.trim() || 'My observing site';
      const lat = Hor.num($('#w-lat').value);
      const lon = Hor.num($('#w-lon').value);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
        $('#w-lat').value = 52.52; $('#w-lon').value = 13.4;
        return;
      }
      const elev = Hor.num($('#w-elev').value);
      finish({ id: WS.NEW_SITE_ID(), name, lat, lon, elev: Number.isFinite(elev) ? elev : 0, tz: $('#w-tz').value.trim() || null });
    });
    $('#w-geo').addEventListener('click', () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition((pos) => {
        $('#w-lat').value = pos.coords.latitude;
        $('#w-lon').value = pos.coords.longitude;
      }, () => { /* permission denied — user can type manually */ });
    });
    $('#w-skip').addEventListener('click', () => finish(null));
  });
}

/* ------------------------------- boot ------------------------------ */

async function boot() {
  // visible error reporting — never fail silently again
  const errBox = document.createElement('div');
  errBox.id = 'err-banner';
  errBox.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99;background:#5b1620;border:1px solid #ff6b6b;color:#ffd7d7;border-radius:10px;padding:8px 14px;font-size:13px;max-width:90vw;box-shadow:0 8px 24px rgba(0,0,0,.5);display:none';
  document.body.appendChild(errBox);
  let errTimer = null;
  const showErr = (msg) => {
    errBox.textContent = '⚠ ' + String(msg).slice(0, 400);
    errBox.style.display = 'block';
    if (errTimer) clearTimeout(errTimer);
    errTimer = setTimeout(() => { errBox.style.display = 'none'; }, 15000);
  };
  window.addEventListener('error', (ev) => showErr(ev.message || String(ev.error)));
  window.addEventListener('unhandledrejection', (ev) => showErr(ev.reason));
  const tipEl = $('#tooltip');
  S.detailResize = null;
  try {
    splashText('loading catalog…');
    const res = await fetch('catalog.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    CAT = await res.json();
    for (const o of CAT) byId.set(o.id, o);
    for (const c of new Set(CAT.map((o) => o.constellation).filter(Boolean))) CONSTELLATIONS.push(c);
    CONSTELLATIONS.sort((a, b) => a.localeCompare(b));
    splashText(`catalog ready · ${CAT.length.toLocaleString()} objects`);
  } catch (err) {
    splashText(`catalog failed to load: ${err.message}`);
    return;
  }

  // load the popularity source popularity scores in background (non-blocking)
  loadPopularity();

  // ---- user data: sites (with first-run welcome), custom targets ----
  SITES = await WS.getSites();
  if (!SITES.length) {
    const legacy = legacySite();
    if (legacy) {
      await WS.saveSiteRec({ id: WS.NEW_SITE_ID(), name: 'My site', lat: legacy.lat, lon: legacy.lon, elev: 0, tz: null });
      SITES = await WS.getSites();
    } else {
      const w = await welcomeFlow();
      if (w) await WS.saveSiteRec(w);
      SITES = await WS.getSites();
    }
  }
  if (!SITES.length) {
    await WS.saveSiteRec({ id: WS.NEW_SITE_ID(), name: 'Berlin (default)', lat: 52.52, lon: 13.4, elev: 0, tz: null });
    SITES = await WS.getSites();
  }
  let sid = Hor.getPrefs().activeSiteId;
  if (!SITES.some((s) => s.id === sid)) sid = SITES[0].id;
  applyActiveSite(SITES.find((s) => s.id === sid) || SITES[0]);

  // custom targets join the catalog
  for (const t of await WS.getTargets()) upsertTarget(t);
  applyEdge();
  const ver = await WS.loadVersion();
  const fv = $('#foot-ver');
  if (fv) fv.textContent = ver ? `NightSeam Web ${ver.version}` : 'dev build';
  const av = $('#aboutVersion');
  if (av) av.textContent = ver ? `${ver.version}` : 'dev build';
  splashText(`catalog ready · ${CAT.length.toLocaleString()} objects · site “${S.site.label}”`);

  // ---- site controls: the active site's coordinates are edited in
  // Setup → Active site (desktop parity); quick-edit handled there ----
  const ts = $('#tb-site');
  if (ts) ts.addEventListener('change', (ev) => {
    const s = SITES.find((x) => x.id === ev.target.value);
    if (s) { applyActiveSite(s); refreshView(); refreshWeatherForSite(); }
  });
  $('#btn-settings').addEventListener('click', () => { renderSettings(); });

  // — topbar: min-alt slider (desktop parity) —
  const syncTopPrefs = () => {
    const p = Hor.getPrefs();
    const eff = Hor.effectiveMinAlt();
    const mua = $('#tb-minalt'), muaV = $('#tb-minalt-val'), note = $('#tb-note');
    if (mua) mua.value = String(eff);
    if (muaV) muaV.textContent = eff + '°';
    if (note) note.textContent = p.minAlt == null ? 'auto (bortle)' : 'explicit';
  };
  syncTopPrefs();
  // live label + pref on every tick, but only recompute the views when the
  // drag ENDS — a per-tick refreshView() re-ranks the whole night and
  // rebuilds the view under the pointer, making the slider feel broken.
  const applyMinAlt = (ev) => {
    const v = Hor.num(ev.target.value);
    Hor.setPrefs({ minAlt: Number.isFinite(v) && v >= 5 && v <= 89 ? v : null });
    syncTopPrefs();
    if (ev.type === 'change') refreshView();
  };
  $('#tb-minalt').addEventListener('input', applyMinAlt);
  $('#tb-minalt').addEventListener('change', applyMinAlt);

  // — topbar: night of (date) —
  const dateEl = $('#tb-date');
  if (dateEl) {
    const today = WS.effToday();
    dateEl.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    dateEl.addEventListener('change', (ev) => {
      const v = ev.target.value;
      if (v) {
        const [y, m, d] = v.split('-').map(Number);
        S.date = new Date(y, m - 1, d, 12, 0, 0);
      } else {
        // clearing the field means "today at the site" - S.date must never be
        // null, because object detail and the grid fallbacks dereference it
        S.date = WS.effToday();
      }
      refreshView();
    });
  }

  // — topbar: night scrub (syncs Sky View time) —
  const scrub = $('#tb-scrub'), scrubT = $('#tb-scrub-time');
  if (scrub) {
    const syncScrub = () => {
      const rs = skyAnchor(S.skyTime);
      const mins = Math.max(0, Math.min(1440, Math.round((S.skyTime.getTime() - rs.getTime()) / 60000)));
      scrub.value = String(mins);
      if (scrubT) scrubT.textContent = fmtClock(S.skyTime);
    };
    syncScrub();
    const onScrub = () => {
      // stable anchor for the whole drag: skyAnchor keeps the current
      // window fixed while the time stays inside it, so crossing noon
      // never snaps the slider back.
      const rs = skyAnchor(S.skyTime);
      S.skyTime = new Date(rs.getTime() + Number(scrub.value) * 60000);
      if (scrubT) scrubT.textContent = fmtClock(S.skyTime);
      window.dispatchEvent(new CustomEvent('sky:time'));
    };
    scrub.addEventListener('input', onScrub);
    window.addEventListener('sky:time', syncScrub);
  }

  // — night info chip (dark window + moon) —
  const renderNightInfo = () => {
    const el = $('#nightInfo');
    if (!el) return;
    const info = E.nightInfo(nightAnchor(), S.site.lat, S.site.lon,
                             siteNoon(nightAnchor()));
    const dw = E.pickDarkWindow(info);
    // the ANCHORED night's moon (desktop header parity: it reports the night's
    // illumination, not the live one) - only "now" when there is no dark
    // window at all (polar day)
    const moJd = (dw.dusk && dw.dawn)
      ? (E.julianDay(dw.dusk) + E.julianDay(dw.dawn)) / 2
      : E.julianDay(new Date());
    const mo = E.moonPhase(moJd);
    let darkTxt = '—';
    if (dw.dusk && dw.dawn) {
      darkTxt = `${fmtClock(dw.dusk)}–${fmtClock(dw.dawn)}`;
    }
    el.textContent = `moon ${(mo.illumination * 100).toFixed(0)}% · ${mo.name} · dark ${darkTxt}`;
  };
  renderNightInfo();
  setInterval(renderNightInfo, 60000);

  // — weather chip (load-on-demand; auto-load toggle in the submenu) —
  const wxBtn = $('#btnWeather'), wxPanel = $('#weatherPanel');
  if (wxBtn && wxPanel) {
    wxBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (wxPanel.classList.contains('hidden')) {
        wxPanel.classList.remove('hidden');
        if (!WX_STATE.data && !WX_STATE.error && !WX_STATE.loading) loadWeather();
        else wxRenderPanel();
      } else {
        wxPanel.classList.add('hidden');
      }
    });
    document.addEventListener('click', (ev) => {
      if (!(ev.target instanceof Element)) return;
      if (!wxPanel.classList.contains('hidden') && !ev.target.closest('#weatherPanel') && !ev.target.closest('#btnWeather')) {
        wxPanel.classList.add('hidden');
      }
    });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') wxPanel.classList.add('hidden'); });
  }
  const wxAuto = $('#wxAuto');
  if (wxAuto) {
    wxAuto.checked = !!Hor.getPrefs().weatherAuto;
    wxAuto.addEventListener('change', (ev) => {
      Hor.setPrefs({ weatherAuto: ev.target.checked });
      if (ev.target.checked && !WX_STATE.data) loadWeather(); // first flip loads immediately too
    });
  }
  if (Hor.getPrefs().weatherAuto) loadWeather(); // auto-load on startup

  // — hamburger menu (desktop parity) —
  const menuBtn = $('#btnMenu'), menuPanel = $('#menuPanel');
  const closeMenu = () => { if (menuPanel) menuPanel.classList.add('hidden'); };
  menuBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    menuPanel.classList.toggle('hidden');
  });
  document.addEventListener('click', (ev) => {
    if (!(ev.target instanceof Element)) return;
    if (menuPanel && !menuPanel.classList.contains('hidden') && !ev.target.closest('#menuPanel') && !ev.target.closest('#btnMenu')) closeMenu();
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeMenu(); });

  const p = Hor.getPrefs();
  const refreshMenuUI = () => {
    const prefs = Hor.getPrefs();
    const edge = $('#edgeSpace'), edgeV = $('#edgeSpaceVal');
    if (edge) edge.value = String(Number.isFinite(prefs.edge) ? prefs.edge : 14);
    if (edgeV) edgeV.innerHTML = `${Number.isFinite(prefs.edge) ? prefs.edge : 14}&nbsp;px`;
    const adv = $('#advMode'); if (adv) adv.checked = !!prefs.advMode;
    const tzSec = $('#tzSection'); if (tzSec) tzSec.classList.toggle('hidden', !prefs.advMode);
    const tz = $('#tzSelect'); if (tz) tz.value = prefs.tz || '';
    const moon = $('#moonAware'); if (moon) moon.checked = !!prefs.moonAware;
    const bortle = $('#bortle'), bortleV = $('#bortleVal');
    if (bortle) bortle.value = String(prefs.bortle || 4);
    if (bortleV) bortleV.textContent = String(prefs.bortle || 4);
    const bb = $('#fltBb'); if (bb) bb.checked = !!prefs.fltBb;
    const ha = $('#fltHa'); if (ha) ha.checked = !!prefs.fltHa;
    const o3 = $('#fltOiii'); if (o3) o3.checked = !!prefs.fltOiii;
    const su = $('#sizeUnit'); if (su) su.value = prefs.sizeUnit || 'arcmin';
    const rs = $('#rigSelect'); if (rs) rs.value = prefs.activeRigId || '';
  };
  reflectTheme(); // sync picker from whatever the head script applied (never undo it)
  $('#themeRow').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.theme-btn');
    if (!btn) return;
    applyTheme(btn.dataset.theme || null);
    Hor.setPrefs({ theme: btn.dataset.theme || '' });
    initDragWindows(); // re-bind after layout change
  });
  $('#edgeSpace').addEventListener('input', (ev) => {
    const v = Hor.num(ev.target.value);
    Hor.setPrefs({ edge: Number.isFinite(v) ? v : 14 });
    applyEdge();
    refreshMenuUI();
  });
  $('#advMode').addEventListener('change', (ev) => {
    Hor.setPrefs({ advMode: ev.target.checked });
    location.reload();
  });
  $('#tzSelect').addEventListener('change', (ev) => {
    Hor.setPrefs({ tz: ev.target.value || '' });
    const s = activeSite();
    if (s) applyActiveSite(s);
    refreshView();
  });
  $('#moonAware').addEventListener('change', (ev) => { Hor.setPrefs({ moonAware: ev.target.checked }); refreshView(); });
  $('#bortle').addEventListener('input', (ev) => {
    Hor.setPrefs({ bortle: Hor.num(ev.target.value) || 4 });
    refreshMenuUI(); syncTopPrefs();
  });
  $('#bortle').addEventListener('change', (ev) => {
    Hor.setPrefs({ bortle: Hor.num(ev.target.value) || 4 });
    refreshMenuUI(); syncTopPrefs(); refreshView();
  });
  $('#fltBb').addEventListener('change', (ev) => { Hor.setPrefs({ fltBb: ev.target.checked }); refreshView(); });
  $('#fltHa').addEventListener('change', (ev) => { Hor.setPrefs({ fltHa: ev.target.checked }); refreshView(); });
  $('#fltOiii').addEventListener('change', (ev) => { Hor.setPrefs({ fltOiii: ev.target.checked }); refreshView(); });
  $('#sizeUnit').addEventListener('change', (ev) => { Hor.setPrefs({ sizeUnit: ev.target.value }); refreshView(); });
  $('#rigSelect').addEventListener('change', (ev) => {
    Hor.setPrefs({ activeRigId: ev.target.value || '' });
    refreshView();
  });
  refreshMenuUI();

  // rigs for the framing selector — presets are a PICKER, never defaults.
  // 0.6.1/0.6.2 stored them in this browser; drop those leftovers once (an
  // edited or renamed rig is user data and stays).
  const rigPrefs = Hor.getPrefs();
  if (rigPrefs.rigsSeeded && !rigPrefs.rigsPresetCleaned) {
    const gone = await WS.removeSeededRigs();
    const patch = { rigsPresetCleaned: true };
    if (gone.includes(rigPrefs.activeRigId)) patch.activeRigId = '';
    Hor.setPrefs(patch);
  }
  const rigs = await WS.getRigs();
  RIGS.length = 0;
  RIGS.push(...rigs);
  const rsSel = $('#rigSelect');
  if (rsSel) {
    rsSel.innerHTML = '<option value="">None — no frame coverage shown</option>' +
      rigs.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
  }
  refreshMenuUI(); // re-sync select values now that the rig options exist

  initDragWindows();

  // click the brand logo to return to the main page (the site root) - it
  // carries role="button" tabindex="0", so Enter/Space must work too
  const brand = document.querySelector('.brand');
  if (brand) {
    brand.addEventListener('click', () => { location.href = '/'; });
    brand.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        location.href = '/';
      }
    });
  }

  window.addEventListener('hashchange', () => { route(); });
  // keyboard shortcuts: n = cycle tabs; on sky view ←/→ scrub the night (Shift = 10 min)
  window.addEventListener('keydown', (ev) => {
    const tag = (ev.target.tagName || '').toUpperCase();
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const modal = $('#modal');
    if (modal && !modal.hidden) return;
    if (ev.key === 'n' || ev.key === 'N') {
      const order = ['tonight', 'sky', 'catalog', 'horizon'];
      const next = order[(order.indexOf(S.view) + 1) % order.length];
      location.hash = '#' + next;
      return;
    }
    // arrows scrub the night on every view (desktop parity), not only on Sky View
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      const mins = ev.shiftKey ? 10 : 60;
      S.skyTime = new Date(S.skyTime.getTime() + (ev.key === 'ArrowRight' ? mins : -mins) * 60000);
      window.dispatchEvent(new CustomEvent('sky:time'));
      if (S.view === 'sky') draw();
      ev.preventDefault();
    }
  });
  if (tonightTimer) clearInterval(tonightTimer);
  tonightTimer = setInterval(() => { if (S.view === 'tonight' && !document.hidden) renderTonight(true); }, 60000);

  // Scrub -> Tonight, like the desktop (whose "visible now" follows S.tIdx).
  // Debounced: the topbar scrub fires on every pointer move, and re-ranking
  // during a drag would stutter the slider.
  let tonightScrubTimer = null;
  window.addEventListener('sky:time', () => {
    if (S.view !== 'tonight') return;
    clearTimeout(tonightScrubTimer);
    tonightScrubTimer = setTimeout(() => {
      if (S.view === 'tonight') renderTonight(true);
    }, 120);
  });

  // a11y: keep Tab focus inside the open dialog
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Tab') return;
    const dialog = document.querySelector('#modal .modal:not([hidden])') ||
                   document.querySelector('[role="dialog"]:not([hidden])');
    if (!dialog) return;
    const els = [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      // the Setup dialog hides whole tab panes and forms: only rendered
      // controls may take focus, else Tab would land in an invisible field
      .filter((el) => !el.closest('.vhidden') && el.getClientRects().length > 0);
    if (!els.length) { ev.preventDefault(); return; }
    const first = els[0], last = els[els.length - 1];
    const cur = document.activeElement;
    if (ev.shiftKey && (cur === first || !dialog.contains(cur))) {
      ev.preventDefault(); last.focus();
    } else if (!ev.shiftKey && cur === last) {
      ev.preventDefault(); first.focus();
    } else if (!dialog.contains(cur)) {
      ev.preventDefault(); first.focus();
    }
  });

  route();
}

if (typeof document !== 'undefined') boot();