/*
 * NightSeam Web — static in-browser night-planning app.
 * Port of NightSeam (<archive>\Object-Astro) core features:
 *   • Tonight  — dark time, moon phase, ranked best targets
 *   • Sky map  — live polar all-dome chart with sun/moon/all catalog objects
 *   • Catalog  — search/sort across 12,176 objects (OpenNGC + supplement)
 *   • Detail   — meta + tonight rise/transit/set + altitude chart
 *   • Settings — sites, rigs, custom targets, backup/restore (webstore.js)
 * All sky math runs client-side (astro.js, Meeus algorithms).
 */
import * as E from './astro.js?v=28';
import * as Hor from './horizon.js?v=65';
import * as WS from './webstore.js?v=39';
import { initDragWindows } from './dragwin.js?v=1';
import { fmtSize, sizeArcmin, framePct, magVisible, skyClampZoom,
         skyViewMatrix, skyScreenToBase, skyClampFocus } from './format.js?v=35';
import { nightStats, nightStatsBatch, sampleVisible } from './nightrank.js?v=27';
import { TYPE_LABELS, TYPE_COLORS, searchBlob as coreSearchBlob,
         TIER_ORDER, assignPopularityTiers, wikiTitles,
         inTonightPool, PLANNER_CHANGE_EVENT, panoramaRevision,
         visibilityReason, summarizeVisibility } from './core.js?v=42';
import { popularityFactor as corePopularityFactor } from './core.js?v=42';
import { vizTheme, drawMoonPhaseMarker } from './viztheme.js?v=5';
import { estimateSiteZenithSkyBrightness, listSkyBrightnessProviders }
  from './skybrightness.js?v=6';

const announcePlannerChange = Hor.announcePlannerChange;

// Cache-bust token for the ~4 MB data file web/catalog.json. It is NOT a JS
// module, so it cannot carry a ?v= in an import: this named token IS its
// invalidation mechanism (do NOT add {cache:'no-store'} - the file must stay
// cacheable). Bump it in the SAME commit whenever web/catalog.json changes;
// web/catalog.manifest.json records the bytes for the current token and
// scripts/check_catalog_token.py enforces the pairing.
const CATALOG_TOKEN = '10';
// The provenance sidecar is independently cacheable and has its own token.
const CATALOG_PROVENANCE_TOKEN = '1';

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
  refreshSkyBrightnessForSite(site);
}

let CAT = null;                 // array of catalog objects
let CAT_PROV = { objects: {} }; // generated source/alias sidecar
let TIER = new Map();           // id -> popularity TIER letter (A-F); scores are never rendered
const byId = new Map();         // id -> object
const searchCache = new Map();  // object -> lowercase search blob
const S = {
  site: { lat: 52.52, lon: 13.4, label: 'Berlin (default)' },
  date: new Date(),
  skyTime: new Date(),
  skyMag: 10,                     // all-sky chart magnitude limit (desktop #skyMag twin)
  playing: false,
  view: 'tonight',
  detailId: null,
  cat: { q: '', chip: 'all', con: '', sort: 'tier', up: true, page: 0 },
};

let _skyBrightness = null;
let _skyBrightnessGen = 0;

function skyBrightnessClass(result) {
  return result && result.quality === 'good' ? 'wx-good' :
    result && result.quality === 'moderate' ? 'wx-warn' :
      result && (result.quality === 'poor' || result.quality === 'bright')
        ? 'wx-bad' : 'wx-unknown';
}

function renderSkyBrightnessChip() {
  const button = $('#btnSkyBrightness');
  const dot = $('#skyBrightnessStatusDot');
  const chip = $('#skyBrightnessChip');
  if (!button || !dot || !chip) return;
  for (const cls of ['wx-good', 'wx-warn', 'wx-bad', 'wx-unknown']) dot.classList.remove(cls);
  const result = _skyBrightness;
  if (!result || !result.available || result.zenithMpsas == null) {
    button.classList.add('hidden');
    return;
  }
  const cls = skyBrightnessClass(result);
  dot.classList.add(cls);
  dot.textContent = '●';
  chip.textContent = `SQM ${result.zenithMpsas.toFixed(2)} · ${result.quality}`;
  const coverage = Math.round((result.coverage || 0) * 100);
  const provider = result.providerLabel || result.provider || 'Sky brightness';
  const year = result.sourceYear ? ` · ${result.sourceYear}` : '';
  const fallback = result.fallbackReason ? ' · EOG fallback' : '';
  button.title = `${provider}${year} · zenith sky brightness ` +
    `${result.zenithMpsas.toFixed(2)} mag/arcsec² · ${coverage}% source coverage` +
    (result.lowConfidence ? ' · low confidence' : '') + fallback;
  button.classList.remove('hidden');
}

async function refreshSkyBrightnessForSite(site) {
  const gen = ++_skyBrightnessGen;
  _skyBrightness = null;
  renderSkyBrightnessChip();
  if (!site || !Number.isFinite(Number(site.lat)) || !Number.isFinite(Number(site.lon))) return;
  const result = await estimateSiteZenithSkyBrightness(
    Number(site.lat), Number(site.lon), {
      provider: Hor.getPrefs().skyBrightnessProvider || 'eog',
    });
  if (gen !== _skyBrightnessGen) return;
  _skyBrightness = result;
  renderSkyBrightnessChip();
}

async function refreshSkyBrightnessProviderMenu() {
  const select = $('#skyBrightnessProvider');
  if (!select) return;
  const providers = await listSkyBrightnessProviders();
  const wanted = String(Hor.getPrefs().skyBrightnessProvider || 'eog');
  const usable = providers.length ? providers : [{
    id: 'eog', label: 'EOG / VIIRS', enabled: true,
  }];
  select.innerHTML = usable.map((provider) =>
    `<option value="${esc(provider.id)}">${esc(provider.label)}</option>`).join('');
  const actual = usable.some((provider) => provider.id === wanted) ? wanted : 'eog';
  select.value = actual;
  if (actual !== wanted) Hor.setPrefs({ skyBrightnessProvider: actual });
}

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const typeColor = (o) => TYPE_COLORS[o.otype] || '#9fb4d8';

/* Hidden popularity scoring - log-scale normalization of the popularity source
   community scores BAKED into the catalog payload (`app/popularity_data.py` ->
   `web/catalog.json`). The web app makes NO request to the popularity source: that
   snapshot was fetched once (see `scripts/match_popularity.py`, which is
   offline by default) and ships with the catalog, so ranking works fully
   offline and no visitor contacts a third party. M42 (165k) -> ~1.0, dim
   object (100) -> ~0.3, no data -> 0. */
function popularityOf(o) {
  /* SP-06 (0.6.32 review): the baked field is the ONLY source now, so a
     non-numeric value would feed NaN into the log-scale curve and then into the
     ranking comparator (engine-defined order). Guard it here. */
  const v = Number(o.popularity);
  return Number.isFinite(v) ? v : 0;
}
function popularityFactor(o) {
  return corePopularityFactor(popularityOf(o));
}

function blobOf(o) {
  let b = searchCache.get(o);
  if (b === undefined) {
    b = coreSearchBlob(o);
    searchCache.set(o, b);
  }
  return b;
}

function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

/* visible-% cache shared between Tonight and Catalog (key: date|minAlt|pano|obj) */
const obsCache = new Map();
let obsEpoch = 0;

function invalidateObservationCache() {
  obsEpoch++;
  obsCache.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener(PLANNER_CHANGE_EVENT, (event) => {
    const kind = event.detail && event.detail.kind;
    if (!kind || !['panorama', 'site', 'rig', 'date', 'selection', 'preferences'].includes(kind)) return;
    // The same event contract covers every planner input. Site/date/rig/pref
    // handlers still own their immediate render/load policy; this listener
    // owns the cache boundary so a future consumer cannot reuse an observation
    // computed for a different planner revision.
    if (kind !== 'selection') invalidateObservationCache();
    if (kind !== 'panorama') return;
    // All dependent views read the active panorama at render time. Repainting
    // here closes the gap between the editor's live in-memory edit and the
    // catalog/tonight values that consume it.
    if (S.view === 'catalog') renderCatalog();
    else if (S.view === 'tonight') renderTonight();
    else if (S.view === 'sky') renderSky();
  });
}

function computeObs(obj, jd0, jd1, step, minAlt, pano, lat, lon) {
  const st = nightStats(obj, jd0, jd1, step, minAlt, pano, lat, lon);
  return { pct: st.pct, blk: st.blockedPct };
}
/* ONE definition of the night window behind every visibility number, so the
   catalog % column and the Tonight ranking can never disagree with each other
   or with the desktop: astronomical twilight first, then nautical, then civil,
   then sunset/sunrise, sampled every 6 minutes - all of it core/planning.js
   (the retired app/planning.py + nightcalc.py were deleted in Phase C). */
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
  // core/planning.js::pickDarkWindow applies the polar-day/polar-twilight
  // fallback (fixed 20:00 -> 04:00 in the SITE's zone) itself - anchored at the
  // site's local noon so a site in another timezone
  // gets ITS fallback hours, never the browser's
  const w = E.pickDarkWindow(info, d, siteNoon(nightAnchor()));
  return {
    jd0: E.julianDay(w.dusk), jd1: E.julianDay(w.dawn),
    step: NIGHT_STEP_MIN / 1440,
    startT: w.dusk, endT: w.dawn, level: w.level, info,
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
/* Memoized night window for the scrub (called on every slider tick): the
   window only depends on the anchor date, site and timezone, so it is cached
   instead of rescanning 30 h of twilight on each pointer move. Scoring still
   uses nightWindow() directly - this is presentation-only caching. */
let _winMemo = { key: null, val: null };
function cachedNightWindow() {
  const key = `${dateKey(nightAnchor())}|${S.site.lat}|${S.site.lon}|${Hor.getPrefs().tz || ''}`;
  if (_winMemo.key !== key) _winMemo = { key, val: nightWindow() };
  return _winMemo.val;
}

/** The active scrub span [start, end) in UTC. Off = the WHOLE night from the
 *  planner's own sun-crossings when the sunset/sunrise pair is coherent, else
 *  the dark window (dusk..dawn), else the site-zoned 20:00-04:00 fallback; On
 *  = the 24 h noon->noon day. SCORING is unaffected - it stays on
 *  nightWindow() (dusk..dawn). scrubWindowMs/scrubBounds are SHARED with the
 *  desktop so both apps follow ONE policy. */
function scrubRange() {
  const fullStart = skyAnchor(S.skyTime);
  const fullEnd = new Date(fullStart.getTime() + 24 * 3600000);
  const w = cachedNightWindow();
  const info = w.info || {};
  const pick = (a, b, c) => a || b || c || null;
  const s = E.scrubWindowMs({
    sunsetMs: info.sunset ? info.sunset.getTime() : null,
    sunriseMs: info.sunrise ? info.sunrise.getTime() : null,
    duskMs: ms(pick(info.astroDusk, info.nauticalDusk, info.civilDusk)),
    dawnMs: ms(pick(info.astroDawn, info.nauticalDawn, info.civilDawn)),
    noonMs: siteNoon(nightAnchor()).getTime(),
  });
  const b = E.scrubBounds(!!Hor.getPrefs().viewFullDay,
    s.startMs, s.endMs,
    fullStart.getTime(), fullEnd.getTime());
  return { start: new Date(b.start), end: new Date(b.end) };
}
function ms(d) { return d instanceof Date && !isNaN(d) ? d.getTime() : null; }

/** Keep the selected time inside the active scrub range (used when the range
 *  shrinks under it, and at boot / on a site or date change): a daytime load
 *  (e.g. 14:32) lands on the first allowed instant - the window start - instead
 *  of showing "visible at 14:32", which is outside every planning window. */
/** Notify time consumers once. Sync-only notifications update controls and
 * invalidate stale Tonight markers; repainting notifications also redraw the
 * active time-driven view. */
function announceSkyTime({ repaint = true } = {}) {
  window.dispatchEvent(new CustomEvent('sky:time', { detail: { repaint } }));
}

function clampSkyTime({ repaint = false } = {}) {
  if (!S.site) return null;
  const r = scrubRange();
  S.skyTime = new Date(E.scrubClamp(S.skyTime.getTime(), r.start.getTime(), r.end.getTime()));
  // WE-07 (0.6.32 review): a site/date change moves the selected instant, but the
  // always-visible topbar scrub only re-syncs on the `sky:time` broadcast - so it
  // kept showing the PREVIOUS night's time (probe: S.skyTime 19:17, label 19:51).
  // Announce the clamp so the slider position and label follow.
  //
  // BUG-005: announce it EVEN when the clamp changed nothing. `syncScrub()` pins
  // the slider from the CURRENT range, so a slider positioned against an earlier
  // range stays stale while `S.skyTime` is already correct. Callers that render
  // the active view themselves keep this sync-only; direct user scrubs request
  // the one repaint here instead.
  announceSkyTime({ repaint });
  return r;
}

/** Caption under the Sky View scrub, matching the active range. */
function rangeLabel() {
  return Hor.getPrefs().viewFullDay
    ? 'slider spans the full 24 h day, site time'
    : 'slider spans the night (sunset\u2013sunrise), site time';
}

function obsKey(g, oid) {
  if (obsCache.size > 250000) obsCache.clear(); // guard against stale-site growth
  // the ANCHOR date (topbar "night of", else today at the site) - NOT today:
  // otherwise changing the date re-served the previous night's percentages
  const panoKey = g.pano ? `${g.pano.id}:${panoramaRevision(g.pano)}` : '-';
  return `${dateKey(nightAnchor())}|${g.minAlt.toFixed(2)}|${panoKey}|${g.lat.toFixed(2)}|${g.lon.toFixed(2)}|${oid}`;
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

/** Standard (the 200 most popular) vs advanced (all 12,176 OpenNGC + supplement objects). */
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

/** Frame coverage % for an object with the active rig - object span as a
 *  percentage of the frame (the desktop's definition, see web/format.js). */
function rigFramePct(o) {
  const rig = activeRig();
  if (!rig || !(rig.fov_w > 0)) return null;
  return framePct(sizeArcmin(o.size_am), rig.fov_w);
}

/** Filter recommendation badge - the same model as the desktop's
 *  filterAdvice (web/horizon.js): recommends narrowband for emission objects,
 *  warns about missing broadband, nothing otherwise. */
function filterAdviceBadge(o) {
  const a = Hor.filterAdvice(o.otype);
  if (!a) return '';
  return `<span class="f-own ${a.ok ? 'ok' : 'warn'}" title="filter recommendation">${esc(a.text)}</span>`;
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
 *  Workbench is the new flat/default look. classic and the empty value are
 *  legacy aliases; only dome remains a separate selectable language. */
function applyTheme(t) {
  const name = t === 'dome' ? 'dome' : 'workbench';
  document.documentElement.setAttribute('data-theme', name);
  try { localStorage.setItem(THEME_KEY, name); } catch { /* ignore */ }
  reflectTheme();
  document.dispatchEvent(new Event('theme:changed'));
}
/** Sync the picker's active state only — never touches storage or the
 *  attribute (boot must not undo the theme the head script applied). */
function reflectTheme() {
  const t = document.documentElement.getAttribute('data-theme') || 'workbench';
  const row = $('#themeRow');
  if (row) row.querySelectorAll('.theme-btn').forEach((b) => b.classList.toggle('active', b.dataset.theme === t));
}

/* ---- weather: Open-Meteo, load-on-demand — nothing is fetched until the
   user clicks the top-bar chip (or auto-load is switched on).  The response
   is normalized into hourly observing rows so the UI can add providers later
   without changing the presentation contract. ---- */
const WX_STATE = { data: null, loading: false, error: false, airError: false };
let _wxGen = 0;
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

function wxNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function wxPercent(value) {
  const n = wxNumber(value);
  return n == null ? null : Math.max(0, Math.min(100, n));
}
function wxFixed(value, digits = 0) {
  const n = wxNumber(value);
  return n == null ? '—' : n.toFixed(digits);
}
function wxNextDateKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
function wxWallTimeKey(date) {
  const wall = WS.utcToWall(date);
  return `${dateKey(wall)}T${String(wall.getHours()).padStart(2, '0')}:${String(wall.getMinutes()).padStart(2, '0')}`;
}
function wxSelectedDateKey() {
  return dateKey(S.date instanceof Date && !isNaN(S.date) ? S.date : new Date());
}
function wxTimezone() {
  return Hor.getPrefs().tz || S.site.tz || 'auto';
}
function wxNightBounds() {
  try {
    const w = nightWindow();
    const start = wxWallTimeKey(w.startT), end = wxWallTimeKey(w.endT);
    if (start && end && end > start) {
      return { start, end, label: `${start.slice(11)}–${end.slice(11)}` };
    }
  } catch (_) { /* the fixed fallback below is still useful */ }
  const selected = wxSelectedDateKey();
  const next = wxNextDateKey(selected);
  return { start: `${selected}T20:00`, end: `${next}T04:00`, label: '20:00–04:00' };
}
async function wxFetchJSON(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15000);
  try {
    const response = await fetch(url, { signal: ac.signal });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
function wxRows(data) {
  const h = data && data.hourly || {};
  const aq = data && data.air_quality && data.air_quality.hourly || {};
  const times = Array.isArray(h.time) ? h.time : [];
  const aqIndex = new Map((Array.isArray(aq.time) ? aq.time : []).map((t, i) => [t, i]));
  const value = (key, i) => wxNumber(Array.isArray(h[key]) ? h[key][i] : null);
  return times.map((time, i) => {
    const ai = aqIndex.get(time);
    const aqValue = (key) => ai == null || !Array.isArray(aq[key]) ? null : wxNumber(aq[key][ai]);
    const temperature = value('temperature_2m', i);
    const dewPoint = value('dew_point_2m', i);
    return {
      time,
      weatherCode: value('weather_code', i),
      temperature,
      dewPoint,
      dewSpread: temperature != null && dewPoint != null ? temperature - dewPoint : null,
      apparentTemperature: value('apparent_temperature', i),
      humidity: wxPercent(value('relative_humidity_2m', i)),
      cloudTotal: wxPercent(value('cloud_cover', i)),
      cloudLow: wxPercent(value('cloud_cover_low', i)),
      cloudMid: wxPercent(value('cloud_cover_mid', i)),
      cloudHigh: wxPercent(value('cloud_cover_high', i)),
      rainProbability: wxPercent(value('precipitation_probability', i)),
      precipitation: value('precipitation', i),
      rain: value('rain', i),
      showers: value('showers', i),
      snowfall: value('snowfall', i),
      visibility: value('visibility', i),
      wind: value('wind_speed_10m', i),
      gusts: value('wind_gusts_10m', i),
      dust: aqValue('dust'),
      aerosol: aqValue('aerosol_optical_depth'),
      pm25: aqValue('pm2_5'),
    };
  }).filter((row) => row.time);
}
function wxRowsForNight(data) {
  const rows = wxRows(data);
  const { start, end } = wxNightBounds();
  const startHour = `${start.slice(0, 13)}:00`;
  const endHour = `${end.slice(0, 13)}:00`;
  const endInclusive = end.slice(14, 16) !== '00';
  return rows.filter((row) => row.time >= startHour &&
    (endInclusive ? row.time <= endHour : row.time < endHour));
}
function wxDewRisk(row) {
  if (row.dewSpread == null) return { label: '—', cls: 'unknown' };
  if (row.dewSpread <= 1.5) return { label: 'High', cls: 'bad' };
  if (row.dewSpread <= 3) return { label: 'Moderate', cls: 'warn' };
  return { label: 'Low', cls: 'good' };
}
function wxRainState(row) {
  const code = row.weatherCode == null ? 0 : row.weatherCode;
  if (code >= 95) return { label: 'Storm', cls: 'bad' };
  if ((row.precipitation != null && row.precipitation > 0.05) ||
      (row.rain != null && row.rain > 0.05) ||
      (row.showers != null && row.showers > 0.05) ||
      (row.snowfall != null && row.snowfall > 0.05)) {
    const snow = (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
    return { label: snow ? 'Snow' : 'Rain', cls: 'bad' };
  }
  if (row.rainProbability != null && row.rainProbability >= 35) {
    return { label: 'Possible', cls: 'warn' };
  }
  return { label: 'Dry', cls: 'good' };
}
function wxSkyClarity(row) {
  if (row.visibility == null && row.aerosol == null) return { label: 'Unknown', cls: 'unknown' };
  const km = row.visibility == null ? null : row.visibility / 1000;
  const aod = row.aerosol;
  return {
    label: (km != null && km < 2) || (aod != null && aod >= 0.5) ? 'Poor' :
      (km != null && km < 5) || (aod != null && aod >= 0.25) ? 'Fair' : 'Good',
    cls: (km != null && km < 2) || (aod != null && aod >= 0.5) ? 'bad' :
      (km != null && km < 5) || (aod != null && aod >= 0.25) ? 'warn' : 'good',
  };
}
function wxRowScore(row) {
  let score = 100;
  if (row.cloudTotal != null) score -= row.cloudTotal * 0.55;
  if (row.rainProbability != null) score -= row.rainProbability * 0.25;
  const rain = wxRainState(row);
  if (rain.cls === 'bad') score -= 40;
  else if (rain.cls === 'warn') score -= 8;
  const dew = wxDewRisk(row);
  if (dew.cls === 'bad') score -= 12;
  else if (dew.cls === 'warn') score -= 6;
  const clarity = wxSkyClarity(row);
  if (clarity.cls === 'bad') score -= 12;
  else if (clarity.cls === 'warn') score -= 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}
function wxForecastSummary(rows) {
  const clouds = rows.map((r) => r.cloudTotal).filter((v) => v != null);
  const rain = rows.map((r) => r.rainProbability).filter((v) => v != null);
  const dewHigh = rows.find((r) => wxDewRisk(r).cls === 'bad');
  const dewWarn = rows.find((r) => wxDewRisk(r).cls === 'warn');
  const clarity = rows.map((r) => wxSkyClarity(r));
  const maxRain = rain.length ? Math.max(...rain) : null;
  const maxCloud = clouds.length ? Math.max(...clouds) : null;
  const wet = rows.some((r) => wxRainState(r).cls === 'bad');
  const poorClarity = clarity.some((r) => r.cls === 'bad');
  const fairClarity = clarity.some((r) => r.cls === 'warn');
  const scores = rows.map(wxRowScore);
  const score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const red = wet || (maxRain != null && maxRain >= 55) || (maxCloud != null && maxCloud >= 85);
  const warn = !red && ((maxRain != null && maxRain >= 20) || (maxCloud != null && maxCloud >= 20) ||
    !!dewHigh || !!dewWarn || poorClarity || fairClarity);
  const status = red ? { label: 'Poor', cls: 'bad' } :
    warn ? { label: 'Fair', cls: 'warn' } :
      rows.length ? { label: 'Good', cls: 'good' } : { label: 'Unknown', cls: 'unknown' };
  const firstTime = (row) => row ? row.time.slice(11, 16) : '';
  return {
    cloud: clouds.length ? `${Math.min(...clouds)}–${Math.max(...clouds)}%` : '—',
    rain: maxRain == null ? '—' : wet ? `${Math.round(maxRain)}% · rain risk` :
      maxRain >= 35 ? `${Math.round(maxRain)}% possible` : `${Math.round(maxRain)}% max`,
    clarity: poorClarity ? 'Poor' : fairClarity ? 'Fair' : rows.length ? 'Good' : 'Unknown',
    clarityCls: poorClarity ? 'bad' : fairClarity ? 'warn' : rows.length ? 'good' : 'unknown',
    dew: dewHigh ? `High after ${firstTime(dewHigh)}` : dewWarn ? `Moderate after ${firstTime(dewWarn)}` : rows.length ? 'Low' : '—',
    dewCls: dewHigh ? 'bad' : dewWarn ? 'warn' : rows.length ? 'good' : 'unknown',
    status, score,
    detail: red ? (wet ? 'Rain or storm risk' : 'Very cloudy outlook') :
      warn ? 'Some cloud, dew, or haze possible' : rows.length ? 'Clear and dry outlook' : 'No night forecast available',
  };
}
function wxHourlyMarkup(rows) {
  return rows.map((row) => {
    const [icon] = wxInfo(row.weatherCode);
    const dew = wxDewRisk(row);
    const rain = wxRainState(row);
    const clarity = wxSkyClarity(row);
    const cloud = row.cloudTotal == null ? '—' : `${Math.round(row.cloudTotal)}%`;
    const rainText = row.rainProbability == null ? rain.label : `${Math.round(row.rainProbability)}%`;
    const rainAmount = row.precipitation == null ? '' : `<small>${wxFixed(row.precipitation, 1)} mm</small>`;
    const cloudWidth = row.cloudTotal == null ? 0 : Math.round(row.cloudTotal);
    return `<div class="wx-hour" title="${row.time.slice(0, 16).replace('T', ' ')} site time">
      <div class="wx-hour-time"><span>${row.time.slice(11, 16)}</span><span class="wx-hour-icon">${icon}</span></div>
      <div class="wx-hour-metric"><small>Cloud</small><span class="wx-meter"><i style="width:${cloudWidth}%"></i></span><b>${cloud}</b></div>
      <div class="wx-hour-metric"><small>Rain</small><b class="wx-${rain.cls}">${rainText}</b>${rainAmount}</div>
      <div class="wx-hour-metric"><small>Clarity</small><b class="wx-${clarity.cls}">${clarity.label}</b></div>
      <div class="wx-hour-metric"><small>Dew</small><b class="wx-${dew.cls}">${dew.label}</b></div>
    </div>`;
  }).join('');
}

async function loadWeather() {
  const chip = $('#wxChip');
  if (!chip) return;
  const gen = ++_wxGen;
  WX_STATE.loading = true; WX_STATE.error = false; WX_STATE.airError = false;
  wxRenderChip();
  const { lat, lon } = S.site;
  const tz = encodeURIComponent(wxTimezone());
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
    '&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,rain,showers,snowfall,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m' +
    '&timezone=' + tz + '&forecast_days=4';
  const airUrl = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + lat + '&longitude=' + lon +
    '&hourly=pm10,pm2_5,dust,aerosol_optical_depth&timezone=' + tz + '&forecast_days=4';
  try {
    const [weather, air] = await Promise.allSettled([wxFetchJSON(url), wxFetchJSON(airUrl)]);
    if (gen !== _wxGen) return;
    if (weather.status !== 'fulfilled') throw weather.reason || new Error('weather unavailable');
    WX_STATE.data = weather.value;
    WX_STATE.data.air_quality = air.status === 'fulfilled' ? air.value : null;
    WX_STATE.airError = air.status !== 'fulfilled';
  } catch {
    if (gen !== _wxGen) return;
    WX_STATE.error = true; WX_STATE.data = null;
  } finally {
    if (gen === _wxGen) WX_STATE.loading = false;
  }
  if (gen !== _wxGen) return;
  wxRenderChip();
  if (!$('#weatherPanel').classList.contains('hidden')) wxRenderPanel();
}

function wxChipText() {
  if (WX_STATE.loading) return '⏳ loading weather…';
  if (WX_STATE.error) return '⚠️ weather unavailable — click to retry';
  if (!WX_STATE.data) return '☁️ Weather';
  const summary = wxForecastSummary(wxRowsForNight(WX_STATE.data));
  return summary.score == null ? 'Weather · no night forecast' : `${summary.status.label} tonight · ${summary.score}/100`;
}

function wxRenderChip() {
  const chip = $('#wxChip');
  if (chip) chip.textContent = wxChipText();
  const dot = $('#wxStatusDot'), btn = $('#btnWeather');
  const summary = WX_STATE.data ? wxForecastSummary(wxRowsForNight(WX_STATE.data)) : null;
  const status = WX_STATE.error ? { label: 'Unavailable', cls: 'bad' } :
    summary ? summary.status : { label: 'Weather', cls: 'unknown' };
  if (dot) {
    dot.className = `wx-status-dot wx-${status.cls}`;
    dot.textContent = status.cls === 'unknown' ? '○' : '●';
  }
  if (btn) btn.title = summary && summary.score != null
    ? `${status.label} observing conditions tonight, score ${summary.score} of 100 — click for details`
    : 'Observing weather for the selected night — click to load';
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
  const d = WX_STATE.data;
  const rows = wxRowsForNight(d);
  const summary = wxForecastSummary(rows);
  const bounds = wxNightBounds();
  body.innerHTML = `
    <div class="wx-rating wx-rating-${summary.status.cls}">
      <div class="wx-rating-head"><span class="wx-status-dot wx-${summary.status.cls}">${summary.status.cls === 'unknown' ? '○' : '●'}</span><strong>${summary.status.label} night</strong><b>${summary.score == null ? '—' : summary.score}/100</b></div>
      <div class="wx-rating-detail">${summary.detail}</div>
    </div>
    <div class="wx-grid">
      <div><span>Cloud cover</span><b>${summary.cloud}</b></div>
      <div><span>Rain warning</span><b class="wx-${summary.status.cls === 'bad' ? 'bad' : summary.rain.includes('possible') ? 'warn' : 'good'}">${summary.rain}</b></div>
      <div><span title="Haze proxy, not an astronomical transparency measurement">Sky clarity</span><b class="wx-${summary.clarityCls}">${summary.clarity}</b></div>
      <div><span>Dew risk</span><b class="wx-${summary.dewCls}">${summary.dew}</b></div>
    </div>
    <div class="wx-section-title"><b>Dark-hour forecast</b><span>${wxSelectedDateKey()} · ${bounds.label} site time</span></div>
    ${rows.length ? `<div class="wx-hourly-head"><span>Time</span><span>Cloud</span><span>Rain</span><span>Clarity</span><span>Dew</span></div><div class="wx-hourly">${wxHourlyMarkup(rows)}</div>` : '<p class="hint">No dark-hour forecast is available for this selected night.</p>'}
    <p class="hint" style="margin-top:8px">Sky clarity is a haze proxy, not an astronomical transparency measurement. Dew risk is estimated from temperature and dew point. Forecast by <a href="https://open-meteo.com/" target="_blank" rel="noopener" style="color:var(--accent)">Open-Meteo</a>.</p>`;
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
  const title = wikiTitles(o)[0] || o.primary_name;
  phEl.textContent = 'loading Wikipedia photo…';
  // CANDIDATE PAGES, best first, and a DISAMBIGUATION GUARD (0.6.32). Looking up
  // the display name alone lands on a disambiguation page for every Messier row
  // without a common name - "M101" is motorways, highways and a rifle, not the
  // galaxy - and the old single-shot lookup then gave up. "Messier 101" is the
  // article (it redirects to Pinwheel Galaxy), and "NGC 5457" resolves too.
  const titles = wikiTitles(o);
  let page = title;
  let resolvedSrc = null;
  let transient = false;                  // rate limited / offline: stay retryable
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 12000);
  try {
    for (const t of titles) {
      const r = await fetch(WIKI_API + encodeURIComponent(t), { signal: ac.signal });
      if (r.status === 404 || r.status === 410) continue;   // no such page
      if (!r.ok) { transient = true; continue; }            // 429/5xx: try later
      const j = await r.json();
      if (j && j.type === 'disambiguation') continue;       // never a photo of it
      if (j && j.title) page = j.title;                     // canonical (post-redirect)
      const cand = j && j.thumbnail && j.thumbnail.source;
      if (cand) { resolvedSrc = cand; break; }
    }
    if (!resolvedSrc) throw new Error('no-thumb');
    const ir = await fetch(resolvedSrc, { signal: ac.signal });
    if (!ir.ok) { transient = true; throw new Error('no-img'); }
    const blob = await ir.blob();
    if (!blob.type.startsWith('image/')) throw new Error('bad-type');
    await idbSet(key, { blob, ts: Date.now() });
    const link = document.querySelector('#d-wikilink');
    if (link) link.href = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(page.replace(/ /g, '_'));
    showBlob(blob);
  } catch (err) {
    // Only a DEFINITIVE answer from Wikipedia is remembered: "no such page /
    // no thumbnail" (`no-thumb`) or "those bytes are not an image" (`bad-type`).
    // Every NETWORK failure must stay retryable - offline, DNS, a rejected
    // fetch, or the 12 s timeout aborting the request. 0.6.32 regressed here: a
    // rejected fetch never set `transient`, so a single offline open cached
    // "no photo on Wikipedia" for 30 days and the 0.6.31 behaviour was lost.
    const reason = String((err && err.message) || '');
    const definitive = !transient && (reason === 'no-thumb' || reason === 'bad-type');
    if (definitive) await idbSet(key, { missing: true, ts: Date.now() });
    phEl.textContent = definitive
      ? 'no photo on Wikipedia — see the link below'
      : 'photo unavailable right now — see the link below';
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

/** A dead end must never be silent (WE-06, 0.6.32 review): the app used to sit
 *  on the splash forever when storage was blocked or the catalog failed to load,
 *  with the tabs inert and only a 15 s banner. Hide the splash, say what is
 *  wrong, and give the user a way out. */
function bootFailure(title, detail) {
  const view = $('#view');
  hideSplash();
  if (!view) return;
  view.innerHTML = `<div class="card" style="max-width:560px;margin:48px auto;padding:22px 24px;text-align:center">
      <h2 style="font-size:18px;margin-bottom:10px">${esc(title)}</h2>
      <p style="color:var(--muted);font-size:13px;line-height:1.65">${esc(detail)}</p>
      <p style="margin-top:18px"><button class="ghost" id="boot-reload">Reload</button></p>
    </div>`;
  const b = $('#boot-reload');
  if (b) b.addEventListener('click', () => location.reload());
}

function route() {
  const h = location.hash || '#tonight';
  const view = ['tonight', 'sky', 'catalog', 'horizon'].includes(h.slice(1)) ? h.slice(1) : 'tonight';
  // leaving the Horizon editor with unsaved edits: flush them (never lose them)
  if (S.view === 'horizon' && view !== 'horizon' && Hor.horizonUnsaved()) Hor.flushHorizonEdits();
  S.view = view;
  document.querySelectorAll('#tabs a').forEach((a) => {
    const selected = a.dataset.v === S.view;
    a.classList.toggle('active', selected);
    a.setAttribute('aria-selected', String(selected));
  });
  const viewPanel = $('#view');
  if (viewPanel) viewPanel.setAttribute('aria-labelledby', `tab-${S.view}`);
  if (S.view === 'tonight') { renderTonight(); applyTonightMarker(); }
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
/* BUG-005: a monotonic marker for "the Tonight view has finished painting the
 * selection I asked for". The browser check used to scrub, wait a nominal
 * 120 ms and read the rows - but the app itself debounces that scrub by 120 ms
 * and then defers the heavy ranking by another tick, so the check raced its own
 * debounce (25/26 full-sequence failures, passing in isolation). The root
 * carries the render generation and the selected instant it painted; checks poll
 * `#view[data-ns-gen]`/`[data-ns-sel]` instead of sleeping. */
let tonightRenderGen = 0;
/** The instant the LAST completed Tonight paint used - the same value the cards
 *  print as "Visible at HH:MM". A paint only counts as covering a scrub once
 *  this equals the selected instant. */
let tonightRenderedMs = null;

/** The scrubber's OWN resolution (BUG-005).
 *
 *  `#tb-scrub` is `<input type="range" step="15">` over the active range, so the
 *  instant it NAMES is `rangeStart + snapped(minute offset)` - the browser snaps
 *  a value the app writes to the nearest multiple of the step. `syncScrub()`
 *  writes the exact offset, the DOM holds the snapped one, and a scrub then
 *  WRITES THAT BACK into `S.skyTime`. A marker publishing raw milliseconds can
 *  therefore never equal what the scrubber names: the gate measured a 6-minute
 *  split (write 204, DOM 210) for a paint that was in fact correct.
 *
 *  Both sides go through THIS helper: the app publishes what the scrubber would
 *  compute, and `window.__ns_scrub_sel()` (the check's oracle) computes the same
 *  quantity from the live slider. */
const SCRUB_STEP_UI_MIN = 15;          // mirrors step="15" in web/index.html
function scrubTimeMs(selMs, rangeStartMs) {
  const offsetMin = Math.round((selMs - rangeStartMs) / 60000);
  const snapped = Math.round(offsetMin / SCRUB_STEP_UI_MIN) * SCRUB_STEP_UI_MIN;
  return rangeStartMs + snapped * 60000;
}

function stampTonightRender(root, selTime) {
  tonightRenderGen += 1;
  const ms = selTime && selTime.getTime ? selTime.getTime() : null;
  tonightRenderedMs = ms == null ? null
    : scrubTimeMs(ms, scrubRange().start.getTime());
  if (!root || !root.dataset) return;
  root.dataset.nsGen = String(tonightRenderGen);
  root.dataset.nsSel = tonightRenderedMs == null ? '' : String(tonightRenderedMs);
}

/** BUG-005: publish "the Tonight view is showing the selection for `ms`".
 *
 *  A check (or a user script) waits for `#view[data-ns-sel]` to equal the
 *  instant it asked for instead of sleeping for the app's own 120 ms debounce -
 *  that sleep raced the debounce and then the deferred ranking, which failed
 *  25/26 full-sequence browser runs while passing in isolation.
 *
 *  `S.skyTime` is the single source of truth for the selected instant (exactly
 *  like the desktop's `S.tIdx`), and it is read HERE, when the paint really
 *  finished - if the paint belongs to an older selection the marker stays stale
 *  (nsSel = 0), so a stale paint can never satisfy a wait. */
function applyTonightMarker() {
  const root = $('#view');
  if (!root) return;
  const now = S.skyTime instanceof Date && !isNaN(S.skyTime) ? S.skyTime : null;
  const sel = tonightRenderedMs;
  const fresh = sel != null && now != null
    && sel === scrubTimeMs(now.getTime(), scrubRange().start.getTime());
  tonightRenderGen += 1;
  root.dataset.nsGen = String(tonightRenderGen);
  if (!fresh) {
    // BUG-005: publish the GENERATION but no selection - "a paint happened, it
    // is not the one the scrubber names". It must still be non-empty, because
    // the boot sequence can leave the view showing a selection that was clamped
    // after the first paint, and a marker that only ever exists after a scrub
    // would make a waiting check hang instead of reporting the staleness.
    root.dataset.nsSel = String(Date.now());
  } else {
    root.dataset.nsSel = String(sel);
  }
}

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

function explainVisibility(reason, row) {
  if (reason === 'visible') {
    return `visible for ${fmtDur(row.visibleMinutes || row.visN * row.stepMin * 1440)}`;
  }
  if (reason === 'blocked_by_horizon') return 'blocked because of horizon';
  if (reason === 'below_minimum_altitude') return 'below minimum altitude';
  if (reason === 'outside_selected_window') return 'outside the selected window';
  if (reason === 'never_rises') return 'never rises in this window';
  return 'no usable visibility interval';
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
    // The selected observing time is the source of truth, exactly like the
    // desktop's scrubbed S.tIdx: "visible now" means "visible at the selected
    // time", and the topbar/sky scrub re-renders this view (see the sky:time
    // listener at boot). S.skyTime is initialised to the current instant, so an
    // untouched page still shows the live situation.
    //
    // BUG-005: it is read HERE, inside the deferred callback, not when
    // `renderTonight` was called. This compute runs ~30 ms later, and boot calls
    // `clampSkyTime()` in between (loading in daylight moves the selection to
    // the window start), so a time captured at call time painted cards for an
    // instant the scrubber no longer named - the browser check measured exactly
    // that: painted 14:00:00.984 against a scrubber at 14:06:12.500 before this
    // was fixed. Reading the live value is also what the marker's freshness
    // rule can then assert (painted instant === selected instant).
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
    // moon track over the night grid (computed once); moonAltAz owns the
    // degree composition so it can never be mistaken for hours
    const moonAlt = [], moonAz = [];
    for (let i = 0; i <= n; i++) {
      const jd = jd0 + i * step;
      const [ma, maz] = E.moonAltAz(jd, lat, lon);
      moonAlt.push(ma); moonAz.push(maz);
    }

    // Standard mode mirrors the desktop exactly: every standard object is a
    // Tonight candidate (the desktop applies no magnitude gate here - its mag
    // filter belongs to the Targets view). The advanced catalog is the one
    // exception: 12k objects x 121 samples would make this view sluggish in the
    // browser, so the web caps advanced candidates at mag 9 (documented
    // intentional difference; the desktop filters those in Targets instead).
    // The pool rule is core/visibility.js::inTonightPool - ONE implementation,
    // because the inline `o.vmag != null` this replaced silently dropped the 45
    // standard-mode rows whose magnitude OpenNGC leaves empty (IC 1396, the
    // Running Man, NGC 281, the Flame, the Tulip, Simeis 147, the Double
    // Cluster, the Pipe Nebula, ...) while the comment claimed desktop parity.
    const candidates = activeCatalog().filter(
      (o) => inTonightPool(o.vmag, !!o._adv));
    const rows = [];
    for (const o of candidates) {
      const tf = tfOf(o);
      // one shared scoring loop (web/nightrank.js) - also feeds the catalog
      // % column via computeObs, so the two views can never disagree again
      const st = nightStats(o, jd0, jd1, step, minAlt, pano, lat, lon, {
        moonAlt, moonAz, illum, moonAgeDays: moonAge, filterType,
        moonAware, typeF: tf, bortleF,
      });
      const [altNow, azNow] = E.altaz(o.ra_hours * 15, o.dec_deg, jdSel, lat, lon);
      const ceilNow = pano ? Hor.ceilFor(pano, azNow) : { ceil: Hor.NO_BLOCK, ceilTop: null };
      const visNow = sampleVisible(altNow, minAlt, ceilNow.ceil, ceilNow.ceilTop);
      const selectedInWindow = selTime >= win.startT && selTime <= win.endT;
      const selectedReason = visibilityReason(
        altNow, minAlt, ceilNow.ceil, ceilNow.ceilTop, selectedInWindow);
      const pop = popularityFactor(o);
      // popularity is a silent TIEBREAKER (like the desktop): the pure
      // visibility score decides, popularity only separates equal scores
      const score = Math.round((moonAware ? st.sMoon : st.sClassic) * 10) / 100;
      rows.push({ o, maxAlt: st.maxAlt, altNow, visNow, selectedReason, score,
                  bestRun: st.bestRun, bestStart: st.bestStart,
                  bestEnd: st.bestEnd, transitJd: st.transitJd,
                  culminationAlt: st.culminationAlt, riseJd: st.riseJd,
                  setJd: st.setJd, visN: st.visN,
                  visibleMinutes: st.visibleMinutes,
                  visibilityReason: st.visibilityReason,
                  obsPct: st.pct, blockedPct: st.blockedPct,
                  stepMin: step, pop });
    }
    rows.sort((a, b) => (b.score - a.score) || (b.pop - a.pop));
    // share the computed visibility with the catalog column
    {
      const g = { minAlt, pano, lat, lon, jd0, jd1, step };
      for (const r of rows) obsCache.set(obsKey(g, r.o.id), { pct: r.obsPct, blk: r.blockedPct });
    }
    // "Best targets tonight" = the best-scoring targets that clear the
    // visibility rules AT LEAST ONCE during this night (visN counts clear
    // samples inside the dark window). A target below the horizon at the
    // scrubbed time still ranks if it clears later tonight; one that never
    // clears all night must not top the list - the desktop's "Best targets"
    // applies the same night-window criterion (statusOf == vis).
    const top = rows.filter((r) => r.visN > 0).slice(0, 16);
    const visibleAll = rows.filter((r) => r.visNow);
    const nowVisible = visibleAll.slice().sort((a, b) => b.altNow - a.altNow).slice(0, 8);
    const risingLater = rows.filter((r) => !r.visNow && r.maxAlt > 0)
      .sort((a, b) => a.transitJd - b.transitJd).slice(0, 8);

    // The "Dark time" card shows the SAME window the ranking and % visibility
    // are computed on (win = the picked twilight level) - never a different
    // twilight pair. At nautical/civil latitudes the astronomical pair is
    // empty, and the old card said "no full dark night" while scoring ran on
    // the nautical/civil window (desktop parity: its card uses N.dusk/N.dawn).
    const darkStart = win.startT, darkEnd = win.endT;
    const darkH = Math.round(((darkEnd - darkStart) / 3600000 + (darkEnd < darkStart ? 24 : 0)) * 10) / 10;
    const darkLabel = ({ astronomical: 'astronomical night', nautical: 'nautical night', civil: 'civil night', fallback: 'fixed window (no full darkness)' }[win.level] || 'night');
    const visibleCount = visibleAll.length;   // the real count, not the top-8 list
    const windowMs = Math.max(1, darkEnd.getTime() - darkStart.getTime());
    const selectedPct = Math.max(0, Math.min(100,
      ((selTime.getTime() - darkStart.getTime()) / windowMs) * 100));
    const sessionSite = S.site.label ||
      [S.site.lat.toFixed(2), S.site.lon.toFixed(2)].join(', ');

    const pickItem = (r) => {
      const o = r.o;
      const tags = [o.messier, o.ngcic].filter(Boolean).join(' · ');
      const win = r.bestRun > 0
        ? `clear ${fmtClock(E.dateFromJD(r.bestStart))} – ${fmtClock(E.dateFromJD(r.bestEnd || r.bestStart + r.bestRun * step))}`
        : explainVisibility(r.visibilityReason, r);
      const fOwn = filterAdviceBadge(o);
      return `<li data-id="${esc(o.id)}">
        <span class="dot" style="background:${typeColor(o)}"></span>
        <span><span class="p-name">${esc(o.primary_name)}</span>${tags ? `<span class="p-tags">${esc(tags)}</span>` : ''}${fOwn}</span>
        <span class="p-right">
          <b title="culminates at ${fmtClock(E.dateFromJD(r.transitJd))}">${r.maxAlt.toFixed(0)}°</b>
          <span class="p-vis">${r.visN ? `${r.obsPct}% of night · ${fmtDur(r.visibleMinutes)} visible` : explainVisibility(r.visibilityReason, r)}</span>${win}<small>culminates ${fmtClock(E.dateFromJD(r.transitJd))}</small></span>
      </li>`;
    };

    const html = `
      <section class="session-head">
        <div>
          <p class="eyebrow">Session plan</p>
          <h1>Tonight</h1>
          <p class="session-context">${esc(sessionSite)} · night of ${dateKey(nightAnchor())}</p>
        </div>
        <div class="session-facts">
          <span>Selected</span><b>${fmtClock(selTime)}</b>
          <span>Dark window</span><b>${darkH} · ${fmtClock(darkStart)}–${fmtClock(darkEnd)}</b>
        </div>
      </section>
      <section class="night-track" aria-label="Booked observing window">
        <div class="track-head"><strong>Booked night</strong><span>${darkLabel}</span></div>
        <div class="track-bar">
          <span class="track-window"></span>
          <span class="track-marker" style="left:${selectedPct.toFixed(2)}%"></span>
        </div>
        <div class="track-scale"><span>${fmtClock(darkStart)}</span><span>selected ${fmtClock(selTime)}</span><span>${fmtClock(darkEnd)}</span></div>
      </section>
      <div class="grid3">
        <div class="card">
          <h3>Dark time</h3>
          <div class="big">${darkH} h</div>
          <div class="sub">${darkLabel}<br>${fmtClock(darkStart)} – ${fmtClock(darkEnd)}</div>
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
          <span class="p-right"><b>${r.altNow.toFixed(0)}° alt</b>culminates ${fmtClock(E.dateFromJD(r.transitJd))} at ${r.maxAlt.toFixed(0)}°</span>
        </li>`).join('') : '<li style="cursor:default">nothing clear at the selected time</li>'}</ul></div>
        <div class="card"><h3>Rising later tonight</h3><ul class="pick">${risingLater.length ? risingLater.map((r) => `<li data-id="${esc(r.o.id)}">
          <span class="dot" style="background:${typeColor(r.o)}"></span>
          <span><span class="p-name">${esc(r.o.primary_name)}</span>${r.o.messier ? `<span class="p-tags">${esc(r.o.messier)}</span>` : ''}</span>
          <span class="p-right">culminates ${fmtClock(E.dateFromJD(r.transitJd))}<b>peaks ${r.maxAlt.toFixed(0)}°</b></span>
        </li>`).join('') : '<li style="cursor:default">everything already up or setting</li>'}</ul></div>
      </div>
      <p class="cat-count" style="margin-top:10px;text-align:center">night of ${dateKey(nightAnchor())} · ${esc(S.site.label || `${S.site.lat.toFixed(2)}, ${S.site.lon.toFixed(2)}`)} · horizon: ${pano ? esc(pano.name) : 'none'} · click any target for details</p>`;
    if (token !== tonightToken || S.view !== 'tonight') return; // superseded / view switched
    box.innerHTML = html;
    box.querySelectorAll('.pick li[data-id]').forEach((li) => li.addEventListener('click', () => openDetail(li.dataset.id)));
    hideSplash();
    // BUG-005: publish the painted selection so a check (or a user script) can
    // wait for THIS render instead of guessing a delay.
    stampTonightRender(box, selTime);
    applyTonightMarker();
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

/** screen (css px within the canvas) -> base chart coords (shared twin) */
function skyBase(W, sx, sy) {
  return skyScreenToBase(SKYV.zoom, W, W, SKYV.fx, SKYV.fy, sx, sy);
}

function skyClamp(W) {
  [SKYV.fx, SKYV.fy] = skyClampFocus(W, W, SKYV.fx, SKYV.fy);
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
  const V = vizTheme();
  const magMax = advMode() ? 20 : 14;   // desktop setup.js parity (14; 20 in advanced)
  const base = activeCatalog();
  box.innerHTML = `
    <div class="sky-wrap">
      <div class="sky-canvas-box card"><canvas id="sky" role="img" aria-label="All-sky polar chart" aria-describedby="skyChartSummary"></canvas><p id="skyChartSummary" class="visually-hidden" role="note">All-sky chart. Select an object to inspect its details.</p></div>
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
          <p class="sub" style="margin-top:10px">${rangeLabel()}</p>
        </div>
        <div class="card">
          <h3>Chart</h3>
          <label>Mag ≤ <output id="sky-mag-val">${S.skyMag.toFixed(1)}</output>
            <input type="range" id="sky-mag" min="0" max="${magMax}" step="0.5" value="${S.skyMag}">
          </label>
          <p class="sub" style="margin-top:8px">dims objects fainter than the limit; at the faintest setting objects without a measured magnitude appear too</p>
        </div>
        <div class="card">
          <h3>Legend</h3>
          <ul class="legend">
            <li><span class="dot" style="background:${V.sun};border-radius:50%"></span>Sun</li>
            <li><span class="dot" style="background:${V.moon};border-radius:50%"></span>Moon</li>
            <li><span class="dot" style="background:transparent;border:2px dashed ${V.minStroke};border-radius:50%"></span>min altitude</li>
            ${Hor.activePano() ? `<li><span class="dot" style="background:${V.obstacleStroke}"></span>blocked by horizon</li>` : ''}
            ${(Hor.activePano() && Hor.activePano().paintMode === 'sky' && !Hor.activePano().blockAbove)
              ? '<li><span class="dot hatch"></span>above band: open (assumed)</li>' : ''}
            ${Object.entries(TYPE_COLORS).map(([t, c]) => `<li><span class="dot" style="background:${V.types[t] || c}"></span>${TYPE_LABELS[t]}</li>`).join('')}
          </ul>
        </div>
        <div class="card"><h3>Hint</h3><p class="sub" style="font-size:13px">Click an object to open its detail panel. The chart is an all-sky polar view: center = zenith, rim = horizon, north at top. <b>Scroll = zoom · drag = pan · double-click = reset</b> — zooming opens a rectangular window over the chart, so you see more sky than a circular magnifier.</p></div>
      </div>
    </div>`;
  hideSplash();

  const cvs = $('#sky');
  const ctx = cvs.getContext('2d');
  const tip = $('#tooltip');

  /* Curve objects / advanced pool by the shared magnitude rule (desktop parity):
     EVERY object is filtered by magnitude through ONE predicate - at the default
     limit 10 the handful of standard objects fainter than 10 are hidden, exactly
     as the desktop #skyMag does. Objects with no measured magnitude show only at
     the slider maximum. Advanced objects are additionally capped at 1400 by
     brightness for responsiveness.
     CO-10 (0.6.32 review): the advanced branch used to add `o.vmag != null`
     before the shared rule, which excluded every no-magnitude ADVANCED row at
     every slider position - so the 9 batch-2 supplement objects (`vmag`
     deliberately empty, advanced-only) could never reach the chart even at the
     maximum, contradicting the rule stated right here and in AGENTS.md. */
  const computeCandidates = () => {
    const passes = (o) => magVisible(o.vmag, S.skyMag, magMax);
    return [
      ...base.filter((o) => !o._adv && passes(o)),
      ...base.filter((o) => o._adv && passes(o))
        .sort((a, b) => (a.vmag ?? 99) - (b.vmag ?? 99)).slice(0, 1400),
    ];
  };
  let candidates = computeCandidates();

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
    const m = skyViewMatrix(SKYV.zoom, W, W, SKYV.fx, SKYV.fy);
    ctx.setTransform(_dpr * m.a, 0, 0, _dpr * m.d, _dpr * m.e, _dpr * m.f);
  }

  function draw() {
    const C = vizTheme();
    const W = cvs.clientWidth;
    const cx = W / 2, cy = W / 2;
    const R = W / 2 - 22;
    // reset to identity then clear in DEVICE pixels, then apply the view
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    applyView(W);
    skyClamp(W);

    // grid
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    for (const alt of [20, 40, 60]) {
      ctx.beginPath(); ctx.arc(cx, cy, R * (1 - alt / 90), 0, Math.PI * 2); ctx.stroke();
    }
    // min-altitude ring (planning prefs)
    const minRing = Hor.effectiveMinAlt();
    ctx.strokeStyle = C.minStroke;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(cx, cy, R * (1 - minRing / 90), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.minLabel;
    ctx.font = '10.5px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`min ${minRing.toFixed(0)}°`, cx + (R * (1 - minRing / 90)) + 6, cy + 3);
    ctx.strokeStyle = C.gridSub;
    for (let az = 0; az < 360; az += 30) {
      const a = E.D2R * az;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.sin(a), cy - R * Math.cos(a));
      ctx.stroke();
    }
    ctx.fillStyle = C.axis;
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
      const ceilPts = [];
      for (let az = 0; az <= 360; az += 2) {
        const { ceil } = Hor.ceilFor(pano, az);
        ceilPts.push(radiusFor(az, ceil > Hor.NO_BLOCK + 0.5 ? Math.min(ceil, 90) : 0));
      }
      ctx.fillStyle = C.obstacleFill;
      ctx.strokeStyle = C.obstacleStroke;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ceilPts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      for (let az = 360; az >= 0; az -= 2) {
        const a = E.D2R * az;
        ctx.lineTo(cx + R * Math.sin(a), cy - R * Math.cos(a));
      }
      ctx.closePath();
      ctx.fill();
      // stroke ONLY the ceiling curve: stroking the closed polygon drew a
      // radial chord at the az 0 seam (the reported "line to the north").
      // WE-01: OBSTACLE MODE ONLY. In sky mode a fully blocked column has
      // ceil 90, which radiusFor() maps to the zenith CENTRE, so the curve
      // alternated between the painted band edge and the centre - the spurious
      // inner ring with radial connectors. The desktop suppresses exactly this
      // (static/js/skyview.js: `activePaintMode() !== "sky"`), and AGENTS.md
      // requires the outline to be obstacle-mode only in BOTH apps.
      if (pano.paintMode !== 'sky') {
        ctx.beginPath();
        ceilPts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }

      // sky mode. DEFAULT: everything above the painted band is FREE (open
      // above) - hinted with a hatch + legend, never shaded as blocked. Only
      // with "block above band" is the overhang above the band painted as
      // obstruction. Both are drawn per CONTIGUOUS azimuth run so a gap is
      // never bridged by a straight chord.
      const hatchSector = (pts) => {
        ctx.save();
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.clip();
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [x, y] of pts) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
        const diag = (maxX - minX) + (maxY - minY);
        ctx.strokeStyle = C.assumedHatch;
        ctx.lineWidth = 1;
        for (let o = -diag; o < diag; o += 9) {
          ctx.beginPath();
          ctx.moveTo(minX + o, minY);
          ctx.lineTo(minX + o + diag, minY + diag);
          ctx.stroke();
        }
        ctx.restore();
      };
      if (pano.paintMode === 'sky') {
        if (pano.blockAbove) {
          ctx.fillStyle = C.obstacleFill;
          ctx.strokeStyle = C.obstacleStroke;
          ctx.lineWidth = 1.4;
          for (const run of Hor.overhangRuns(pano, 2)) {
            const pts = [];
            for (let az = run.a0; az <= run.a1; az += 2) {
              const { ceilTop } = Hor.ceilFor(pano, az);
              pts.push(radiusFor(az, Math.min(ceilTop, 90)));
            }
            pts.push([cx, cy]);   // close through the zenith
            ctx.beginPath();
            pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        } else {
          for (const run of Hor.assumedOpenRuns(pano, 2)) {
            const pts = [];
            for (let az = run.a0; az <= run.a1; az += 2) {
              const t = Hor.bandTopFor(pano, az);
              pts.push(radiusFor(az, Math.min(t == null ? 90 : t, 90)));
            }
            pts.push([cx, cy]);   // close through the zenith
            hatchSector(pts);
          }
        }
      }
    }

    const jd = E.julianDay(S.skyTime);
    const { lat, lon } = S.site;

    const [sunAlt, sunAz] = E.sunAltAz(jd, lat, lon);
    const [moonAlt, moonAz] = E.moonAltAz(jd, lat, lon);

    const plotAltAz = (alt, az, drawF) => {
      // selected-time visibility: apparent altitude above the horizon only
      if (!E.aboveHorizon(alt)) return null;
      const a = E.D2R * az;
      const r = R * (1 - alt / 90);
      const x = cx + r * Math.sin(a), y = cy - r * Math.cos(a);
      drawF(x, y, alt, az);
      return { x, y };
    };
    const plot = (ra, dec, drawF) => {
      const [alt, az] = E.altaz(ra, dec, jd, lat, lon);
      return plotAltAz(alt, az, drawF);
    };

    skyItems = [];

    // sun and moon
    plotAltAz(sunAlt, sunAz, (x, y) => {
      ctx.shadowColor = C.sun; ctx.shadowBlur = C.sunBlur;
      ctx.fillStyle = C.sun;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      skyItems.push({ x, y, id: 'SUN', label: 'Sun' });
    });
    plotAltAz(moonAlt, moonAz, (x, y) => {
      ctx.shadowColor = C.moon; ctx.shadowBlur = C.moonBlur;
      ctx.fillStyle = C.moon;
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
        ctx.shadowColor = C.targetShadow;
        ctx.shadowBlur = C.labelBlur;
        ctx.fillStyle = C.targetLabel;
        ctx.fillText(c.text, tx, ty);
        ctx.restore();
      }
    }

    // obstruction-free note: horizon line already drawn
    const summary = $('#skyChartSummary');
    if (summary) {
      const when = S.skyTime.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      const targets = skyItems.filter((item) => item.o).length;
      summary.textContent = `All-sky polar chart at ${when}; ${targets} catalog objects are plotted. Center is zenith, rim is horizon, and the selected horizon profile is shown as blocked sky.`;
    }
  }

  function posEl(ev) {
    const r = cvs.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  /* screen px -> base chart coords (zoom-aware hit-testing) */
  const toBase = (ev) => {
    const [sx, sy] = posEl(ev);
    return skyBase(cvs.clientWidth || 1, sx, sy);
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
    const [bx, by] = skyBase(W, sx, sy);
    const factor = ev.deltaY < 0 ? 1.25 : 0.8;
    const nz = skyClampZoom(SKYV.zoom * factor);
    if (nz === SKYV.zoom) return;
    SKYV.zoom = nz;
    if (SKYV.zoom > 1) {
      // keep the point under the cursor fixed while zooming
      SKYV.fx = bx - (sx - W / 2) / SKYV.zoom;
      SKYV.fy = by - (sy - W / 2) / SKYV.zoom;
      skyClamp(W);
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
        skyClamp(rect.width);
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
  const rangeMins = (r) => Math.max(1, Math.round((r.end.getTime() - r.start.getTime()) / 60000));
  const sliderVal = (r) => Math.max(0, Math.min(rangeMins(r),
    Math.round((S.skyTime.getTime() - r.start.getTime()) / 60000)));
  const syncControls = () => {
    const r = scrubRange();
    slider.min = '0';
    slider.max = String(rangeMins(r));
    slider.value = String(sliderVal(r));
    sout.textContent = fmtClock(S.skyTime); // wall clock at the site
    timeEl.value = dtoLocalInput(S.skyTime);
  };
  syncControls();
  slider.addEventListener('input', () => {
    const r = scrubRange();
    S.skyTime = new Date(r.start.getTime() + Number(slider.value) * 60000);
    announceSkyTime();
  });
  timeEl.addEventListener('input', () => {
    const v = timeEl.value;
    if (v) { S.skyTime = WS.wallToUtc(new Date(v)); clampSkyTime({ repaint: true }); }
  });
  $('#sky-now').addEventListener('click', () => {
    S.skyTime = new Date();
    clampSkyTime({ repaint: true });
  });
  // magnitude limit: re-filter the candidate pool, then one redraw (no re-render,
  // no refetch) - the desktop #skyMag slider behaves the same way
  const magEl = $('#sky-mag');
  const magVal = $('#sky-mag-val');
  magEl.addEventListener('input', () => {
    S.skyMag = Number(magEl.value);
    magVal.textContent = S.skyMag.toFixed(1);
    candidates = computeCandidates();
    draw();
  });

  if (skyTimeHandler) window.removeEventListener('sky:time', skyTimeHandler);
  skyTimeHandler = (ev) => { try {
    if (S.view !== 'sky') return;
    syncControls();
    if (ev.detail?.repaint !== false) draw();
  } catch { /* view gone */ } };
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

/* Chip row for the catalog. Popularity is deliberately NOT a chip, and its
 * SCORE is never rendered anywhere: the catalog exposes a TIER letter (A-F, see
 * assignPopularityTiers) whose ordering is the only thing it reveals. */
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

/* The Min-visibility threshold is the user's OWN gate on this list (the slider
 * in the catalog bar, both modes): a row below it is omitted. It is a
 * preference, persisted with the other display settings; 0 disables it. */
function minVis() {
  const v = Number(Hor.getPrefs().minVis);
  return Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 1;
}
let hiddenNotVisible = 0;      // rows the list dropped for being below the threshold

/** Tooltip for a tier cell - says what the letter means, without the number. */
function tierTitle(o, tier) {
  return (o.popularity || 0) > 0
    ? `tier ${tier} of A-F: community observing popularity (A = most observed)`
    : `tier ${tier}: no popularity data for this object`;
}

function filteredCatalog() {
  const f = S.cat;
  const q = f.q.trim().toLowerCase();
  let out = activeCatalog().filter((o) => CHIP_FILTERS[f.chip](o));
  if (f.con) out = out.filter((o) => o.constellation === f.con);
  if (q) out = out.filter((o) => blobOf(o).includes(q));
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
    else if (col === 'tier') {
      v = TIER_ORDER.indexOf(TIER.get(a.id) || 'F') - TIER_ORDER.indexOf(TIER.get(b.id) || 'F');
      // inside a tier, the more observed object first (still never the number)
      if (v === 0) v = (b.popularity || 0) - (a.popularity || 0);
    }
    else v = (a.vmag ?? 99) - (b.vmag ?? 99);
    return f.up ? v : -v;
  });
  // The Min-visibility threshold gates MEMBERSHIP: a row whose share of tonight's
  // dark window is KNOWN and below it is omitted instead of being parked at 0%.
  // A row whose % has not arrived yet is KEPT, so the first paint can never show a
  // wrong verdict; warmPct() finishes the job and re-renders. An active SEARCH
  // bypasses the gate - the catalog is also a lookup tool, and hiding the object
  // you just typed would be a bug.
  hiddenNotVisible = 0;
  const mv = minVis();
  if (mv > 0 && !q) {
    const before = out.length;
    out = out.filter((o) => {
      const v = obsCache.get(obsKey(pctG, o.id));
      return !v || v.pct >= mv;
    });
    hiddenNotVisible = before - out.length;
  }
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
  // same for the Min-visibility slider: it re-renders on 'change', and an
  // arrow-key press fires one - without this the slider would lose focus after
  // every step and keyboard stepping would stop at 1.
  const mvHadFocus = !!document.activeElement && document.activeElement.id === 'cat-minvis';
  box.innerHTML = `
    <div class="cat-bar">
      <input type="search" id="cat-q" aria-label="Search the catalog" placeholder="Search: name, M 31, NGC 7000, galaxy, Cyg…" value="${esc(S.cat.q)}">
      <div class="chips">${Object.keys(CHIP_FILTERS).map((c) => `<button class="chip${S.cat.chip === c ? ' on' : ''}" data-c="${c}">${CHIP_LABELS[c]}</button>`).join('')}</div>
      <select id="cat-con" title="constellation filter">
        <option value="">All constellations</option>
        ${CONSTELLATIONS.map((c) => `<option value="${esc(c)}"${S.cat.con === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      <label class="minvis" title="Hide objects whose share of tonight's dark window is below this. 0% shows every object, visible or not.">Min visibility
        <b id="cat-minvis-v">${minVis() > 0 ? minVis() + '%' : 'off'}</b>
        <input type="range" id="cat-minvis" min="0" max="100" step="1" value="${minVis()}" aria-label="Minimum visibility percent">
      </label>
    </div>
    <div class="cat-stats">
      <span class="cat-count">${list.length.toLocaleString()} of ${CAT.length.toLocaleString()} objects${advMode() ? '' : ' (standard mode)'}${hiddenNotVisible ? ` · ${hiddenNotVisible} below ${minVis()}%` : ''}</span>
      <span class="cat-count" id="pct-status"></span>
      <button class="btn small" id="cat-export-provenance" type="button" title="Download catalog source, aliases and designation history">Download provenance</button>
    </div>
    <div class="card" style="padding:8px 10px">
      <div class="catwrap">
      <table class="cat">
        <thead><tr>${th('name', 'Name')}${th('tier', 'Tier')}${th('mag', 'Mag', true)}${th('pct', '% visibility', true)}${th('type', 'Type')}${th('con', 'Con')}${th('size', 'Size', true)}${showFrame ? `<th class="frame" title="object size vs the active rig's frame width">Frame</th>` : ''}${th('ra', 'RA', true)}${th('dec', 'Dec', true)}</tr></thead>
        <tbody>
          ${slice.map((o) => {
            const tags = [o.messier, o.ngcic].filter(Boolean).join(' · ');
            const fOwn = filterAdviceBadge(o);
            const fp = showFrame ? rigFramePct(o) : null;
            const tier = TIER.get(o.id) || 'F';
            return `<tr data-id="${esc(o.id)}" tabindex="0" role="button" aria-label="Open details for ${esc(o.primary_name)}">
              <td><span class="tname">${esc(o.primary_name)}</span> ${tags ? `<span class="tags">${esc(tags)}</span>` : ''}${fOwn}</td>
              <td class="tier"><span class="tier-badge t-${tier.toLowerCase()}" title="${tierTitle(o, tier)}">${tier}</span></td>
              <td class="num">${o.vmag != null ? o.vmag.toFixed(1) : '—'}</td>
              <td class="num pct" data-objid="${escAttr(o.id)}">${cachedPctText(o.id)}</td>
              <td><span class="tag-dot" style="color:${typeColor(o)}">●</span> ${esc(TYPE_LABELS[o.otype] || o.otype || "")}</td>
              <td>${esc(o.constellation)}</td>
              <td class="num">${esc(fmtSizeU(o.size_am))}</td>
              ${showFrame ? `<td class="frame">${fp == null ? '—' : `<span class="${fp > 100 ? 'over' : 'fit'}" title="${fp > 100 ? `too large for one frame: needs ~${(fp / 100).toFixed(1)} frames` : `object spans ${fp}% of the frame width`}">${fp}%</span>`}</td>` : ''}
              <td class="num">${E.formatRA(o.ra_hours)}</td>
              <td class="num">${E.formatDec(o.dec_deg)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
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
  document.querySelectorAll('table.cat tbody tr[data-id]').forEach((tr) => {
    const open = () => openDetail(tr.dataset.id);
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      open();
    });
  });
  $('#pg-prev').addEventListener('click', () => { if (S.cat.page > 0) { S.cat.page--; renderCatalog(); } });
  $('#pg-next').addEventListener('click', () => { if (S.cat.page < pages - 1) { S.cat.page++; renderCatalog(); } });
  $('#cat-con').addEventListener('change', (ev) => { S.cat.con = ev.target.value; S.cat.page = 0; renderCatalog(); });
  // The slider updates its label + the preference live, but only RE-RENDERS on
  // 'change': renderCatalog() rebuilds this whole bar, which would tear the
  // element out from under the pointer mid-drag.
  $('#cat-minvis').addEventListener('input', (ev) => {
    const v = Math.round(Number(ev.target.value));
    $('#cat-minvis-v').textContent = v > 0 ? `${v}%` : 'off';
    Hor.setPrefs({ minVis: v });
  });
  $('#cat-minvis').addEventListener('change', () => { S.cat.page = 0; renderCatalog(); });
  $('#cat-export-provenance').addEventListener('click', downloadCatalogProvenance);
  if (qHadFocus) {                       // typing must not be interrupted
    const inp = $('#cat-q');
    if (inp) { inp.focus(); if (qCaret != null) inp.setSelectionRange(qCaret, qCaret); }
  }
  if (mvHadFocus) { const el = $('#cat-minvis'); if (el) el.focus(); }
  fillPctCells(slice);
  // Warm whenever the list is gated or sorted by visibility - and never while
  // searching, because the gate is off then anyway.
  if (!S.cat.q.trim() && (S.cat.sort === 'pct' || minVis() > 0)) warmPct(list);
}

function downloadCatalogProvenance() {
  const payload = CAT_PROV && typeof CAT_PROV === 'object'
    ? CAT_PROV : { schema_version: 1, objects: {} };
  const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'],
                        { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nightseam-catalog-provenance.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Compute visibility for every row of the current filter (background chunks),
 *  then re-render so the min-visibility gate and the % sort see the whole list.
 *
 *  Batched through core's `nightStatsBatch`: ONE precession/frame setup per chunk
 *  instead of one per object, with the 14 ms budget still checked between chunks,
 *  so even advanced mode's 12k rows stay responsive (and finish in a few seconds
 *  rather than tens). */
function warmPct(list) {
  const g = obsNightGrid();
  const epoch = obsEpoch;
  if (!(g.jd1 > g.jd0) || !list.length) return;
  const missing = list.filter((o) => !obsCache.has(obsKey(g, o.id)));
  const status = document.querySelector('#pct-status');
  const total = missing.length;
  if (!total) return;
  const CHUNK = 250;
  busy(true, 'computing visibility…');
  let i = 0;
  const tick = () => {
    if (epoch !== obsEpoch) return;
    const t0 = performance.now();
    while (i < missing.length && performance.now() - t0 < 14) {
      const chunk = missing.slice(i, i + CHUNK);
      const stats = nightStatsBatch(chunk, g.jd0, g.jd1, g.step, g.minAlt,
                                    g.pano, g.lat, g.lon);
      chunk.forEach((o, k) => obsCache.set(obsKey(g, o.id),
        { pct: stats[k].pct, blk: stats[k].blockedPct }));
      i += chunk.length;
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
  const epoch = obsEpoch;
  if (!(g.jd1 > g.jd0) || !objs.length) return;
  let i = 0;
  const tick = () => {
    if (epoch !== obsEpoch) return;
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
  const provenance = CAT_PROV?.objects?.[o.id];
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
  const [moonAltNow, moonAzNow] = E.moonAltAz(jd, lat, lon);
  const sepNow = E.sepDeg(altNow, azNow, moonAltNow, moonAzNow);
  const illumNow = E.moonIllumination ? E.moonIllumination(jd) : 0;
  let sepPeak = null;
  const peakJd = E.julianDay(dayInfo.transit instanceof Date ? dayInfo.transit : jd);
  try {
    const [ma2, maz2] = E.moonAltAz(peakJd, lat, lon);
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
  // the article that actually documents this object - NOT the bare display name,
  // which is a disambiguation page for a Messier row without a common name
  const wiki = wikiTitles(o)[0] || o.primary_name;

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
            <dt>RA / Dec (J2000)</dt><dd>${E.formatRA(o.ra_hours)} · ${E.formatDec(o.dec_deg)}</dd>
            ${provenance ? `<dt>Catalog source</dt><dd title="${esc(provenance.source_version || 'unknown')}">${esc(provenance.source || 'unknown')} · ${esc(provenance.source_file || '')}</dd>
            <dt>Aliases</dt><dd>${provenance.aliases?.length ? esc(provenance.aliases.join(' · ')) : '—'}</dd>
            <dt>Designation history</dt><dd>${provenance.designation_history?.length ? esc(provenance.designation_history.map((x) => x.designation).join(' → ')) : '—'}</dd>` : '<dt>Catalog source</dt><dd>not available</dd>'}
            <dt>Right now</dt><dd>alt ${altNow.toFixed(1)}°, az ${azNow.toFixed(0)}°</dd>
            <dt>Tonight</dt><dd>rises ${fmtClock(dayInfo.rise)} · transits ${fmtClock(dayInfo.transit)} · sets ${fmtClock(dayInfo.set)} · peaks ${dayInfo.maxAlt.toFixed(0)}°</dd>
            ${moonRow('Moon dist now', sepNow)}
            ${sepPeak != null ? moonRow('Moon dist @ peak', sepPeak) : ''}
            <dt>Observable</dt><dd id="d-obs">—</dd>
          </dl>
          ${o.blurb ? `<p class="blurb">${esc(o.blurb)}</p>` : ''}
          <p class="blurb" style="margin-top:8px;font-size:13px"><a class="wiki" id="d-wikilink" href="https://en.wikipedia.org/wiki/${encodeURIComponent(wiki.replace(/ /g, '_'))}" target="_blank" rel="noopener">Wikipedia ↗</a></p>
          ${o.custom ? '<button class="btn small" id="m-del" style="margin-top:10px" title="remove this custom target">🗑 delete target</button>' : ''}
        </div>
      </div>
      <div class="tonight-box">
        <h3>Altitude tonight <span class="cat-count">(local time)</span></h3>
        <canvas id="graph" role="img" aria-label="Target altitude and visibility chart" aria-describedby="graphSummary"></canvas>
        <p id="graphSummary" class="visually-hidden" role="note">Altitude chart for the selected target.</p>
        <div class="chart-legend" aria-label="Altitude chart legend">
          <div class="chart-legend-group">
            <strong class="chart-legend-heading">Target state</strong>
            <span class="chart-legend-item"><i class="legend-swatch state-clear"></i><span><b>Clear</b><small>above minimum and unobstructed</small></span></span>
            <span class="chart-legend-item"><i class="legend-swatch state-warn"></i><span><b>Below minimum</b><small>above the horizon, but too low</small></span></span>
            <span class="chart-legend-item"><i class="legend-swatch state-blocked"></i><span><b>Blocked</b><small>the horizon or ceiling blocks it</small></span></span>
            <span class="chart-legend-item"><i class="legend-swatch state-below"></i><span><b>Below horizon</b><small>not astronomically visible</small></span></span>
          </div>
          <div class="chart-legend-group">
            <strong class="chart-legend-heading">Chart guides</strong>
            <span class="chart-legend-item"><i class="legend-swatch guide-min"></i><span><b>Minimum altitude</b><small>your selected visibility threshold</small></span></span>
            <span class="chart-legend-item"><i class="legend-swatch guide-moon"></i><span><b>Moon altitude</b><small>dash-dot line · white phase discs</small></span></span>
            <span class="chart-legend-item"><i class="legend-swatch guide-twilight"></i><span><b>Twilight</b><small>shaded time outside the dark window</small></span></span>
            <span class="chart-legend-item"><i class="legend-swatch guide-window"></i><span><b>Best window</b><small>longest clear run tonight</small></span></span>
            ${pano ? `<span class="chart-legend-item"><i class="legend-swatch guide-obstruction"></i><span><b>Obstruction ceiling</b><small>lower: short dash · upper: dash-dot</small></span></span>` : ''}
          </div>
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
  // The span follows the SAME degeneracy policy as the scrub (shared in core):
  // sunset..sunrise only when that pair is coherent, else dusk..dawn, else the
  // site-zoned fallback; the chart adds one hour of context on each side.
  const pickW = (a, b, c) => a || b || c || null;
  const chartWin = E.scrubWindowMs({
    sunsetMs: info.sunset ? info.sunset.getTime() : null,
    sunriseMs: info.sunrise ? info.sunrise.getTime() : null,
    duskMs: ms(pickW(info.astroDusk, info.nauticalDusk, info.civilDusk)),
    dawnMs: ms(pickW(info.astroDawn, info.nauticalDawn, info.civilDawn)),
    noonMs: siteNoon(nightAnchor()).getTime(),
  });
  const startT = new Date(chartWin.startMs);
  const endT = new Date(chartWin.endMs);
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
    const vis = sampleVisible(alt, minAlt, ceil.ceil, ceil.ceilTop);
    const mAlt = E.moonAltAz(jdt, lat, lon)[0];
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
  const darkWin = E.pickDarkWindow(info, nightAnchor(), siteNoon(nightAnchor()));
  const jdDusk = E.julianDay(darkWin.dusk), jdDawn = E.julianDay(darkWin.dawn);
  const inNight = samples.map((s) => s.t >= jdDusk && s.t <= jdDawn);
  const detailReasonCounts = Object.create(null);
  let detailVisibleFullN = 0;
  samples.forEach((s, i) => {
    const visibleAcrossChart = visibilityReason(
      s.alt, minAlt, s.ceil.ceil, s.ceil.ceilTop, true) === 'visible';
    const reason = visibilityReason(s.alt, minAlt, s.ceil.ceil, s.ceil.ceilTop, inNight[i]);
    s.reason = reason;
    if (inNight[i]) detailReasonCounts[reason] = (detailReasonCounts[reason] || 0) + 1;
    if (visibleAcrossChart) detailVisibleFullN++;
  });

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
  const detailSummary = summarizeVisibility({
    visibleSamples: visCount,
    visibleFullSamples: detailVisibleFullN,
    stepMin: durMs / 60000 / steps,
    maxAlt: dayInfo.maxAlt,
    reasonCounts: detailReasonCounts,
  });
  const detailReasonText = (reason) => {
    if (reason === 'visible') return `visible for ${fmtDur(detailSummary.visibleMinutes)}`;
    if (reason === 'blocked_by_horizon') return 'blocked because of horizon';
    if (reason === 'below_minimum_altitude') return 'below minimum altitude';
    if (reason === 'outside_selected_window') return 'outside the selected window';
    if (reason === 'never_rises') return 'never rises in this window';
    return 'no usable visibility interval';
  };
  const obsEl = $('#d-obs');
  if (obsEl) {
    const pct = Math.round(100 * visCount / nightSamples);
    const visMin = visCount * (durMs / 60000 / steps);
    const usable = bestStart >= 0 && best > 1
      ? ` · usable ${fmtClock(E.dateFromJD(jd0 + (bestStart / steps) * (jd1 - jd0)))}–${fmtClock(E.dateFromJD(jd0 + ((bestStart + best) / steps) * (jd1 - jd0)))}`
      : '';
    obsEl.textContent = `${detailReasonText(detailSummary.reason)}${usable} · culmination ${fmtClock(dayInfo.transit)} at ${dayInfo.maxAlt.toFixed(0)}° (min ${minAlt.toFixed(0)}°${pano ? ` + horizon "${esc(pano.name)}"` : ''})`;
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
    const C = vizTheme();
    const summary = $('#graphSummary');
    if (summary) {
      const name = o.primary_name || 'selected target';
      const reason = detailSummary.reason === 'visible'
        ? `visible for ${Math.round(detailSummary.visibleMinutes || 0)} minutes`
        : detailReasonText(detailSummary.reason);
      const usable = bestStart >= 0 && best > 1
        ? ` Usable interval ${fmtClock(new Date(tStart.getTime() + (bestStart / steps) * durMs))} to ${fmtClock(new Date(tStart.getTime() + ((bestStart + best) / steps) * durMs))}.`
        : '';
      summary.textContent = `${name} altitude chart. Maximum altitude ${dayInfo.maxAlt.toFixed(1)} degrees at ${fmtClock(dayInfo.transit)}; ${reason}.${usable}`;
    }
    gCtx.clearRect(0, 0, W, H);
    // twilight bands
    const bands = [
      [info.sunset, info.civilDusk, C.twilight[0]],
      [info.civilDusk, info.nauticalDusk, C.twilight[1]],
      [info.nauticalDusk, info.astroDusk, C.twilight[2]],
      [info.astroDawn, info.nauticalDawn, C.twilight[3]],
      [info.nauticalDawn, info.civilDawn, C.twilight[4]],
      [info.civilDawn, info.sunrise, C.twilight[5]],
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
    gCtx.strokeStyle = C.horizonLine; gCtx.lineWidth = 1;
    gCtx.setLineDash([]);
    gCtx.beginPath(); gCtx.moveTo(padL, yOf(0)); gCtx.lineTo(W - padR, yOf(0)); gCtx.stroke();
    gCtx.strokeStyle = C.minStroke; gCtx.setLineDash([4, 4]);
    gCtx.beginPath(); gCtx.moveTo(padL, yOf(20)); gCtx.lineTo(W - padR, yOf(20)); gCtx.stroke();
    gCtx.setLineDash([]);
    // axis
    gCtx.fillStyle = C.axis;
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
      gCtx.fillStyle = C.goodFill;
      gCtx.fillRect(x1, padT, x2 - x1, H - padT - padB);
    }
    // min altitude line
    gCtx.strokeStyle = C.minStroke; gCtx.lineWidth = 1; gCtx.setLineDash(C.guideMinDash);
    gCtx.beginPath(); gCtx.moveTo(padL, yOf(minAlt)); gCtx.lineTo(W - padR, yOf(minAlt)); gCtx.stroke();
    gCtx.setLineDash([]);
    gCtx.fillStyle = C.minLabel; gCtx.font = '10px ui-monospace, monospace'; gCtx.textAlign = 'right';
    gCtx.fillText(`min ${minAlt.toFixed(0)}°`, W - padR - 4, yOf(minAlt) - 4);

    // Keep every data mark inside the plot rectangle. In particular, the Moon
    // is allowed to be below -10°; it should disappear at the chart floor,
    // not spill into the time labels below the graph.
    gCtx.save();
    gCtx.beginPath();
    gCtx.rect(padL, padT, W - padL - padR, H - padT - padB);
    gCtx.clip();

    // obstruction ceilings (active panorama)
    if (pano) {
      gCtx.lineWidth = 1.4;
      const ceilY = (c) => yOf(Math.max(-10, Math.min(92, c)));
      gCtx.setLineDash(C.guideCeilingDash);
      gCtx.strokeStyle = C.ceiling;
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
      gCtx.setLineDash(C.guideCeilingTopDash);
      gCtx.strokeStyle = C.ceilingTop;
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
    gCtx.strokeStyle = C.moonLine; gCtx.lineWidth = 1.6; gCtx.setLineDash(C.guideMoonDash);
    gCtx.beginPath();
    let moonPen = false;
    const moonPoints = [];
    samples.forEach((s, i) => {
      if (!Number.isFinite(s.mAlt) || s.mAlt < -10 || s.mAlt > 90) {
        moonPen = false;
        return;
      }
      const x = xOf((i / steps) * durMs), y = yOf(s.mAlt);
      moonPen ? gCtx.lineTo(x, y) : gCtx.moveTo(x, y);
      moonPoints.push({ i, x, y });
      moonPen = true;
    });
    gCtx.stroke(); gCtx.setLineDash([]);
    const markerStep = Math.max(1, Math.round(samples.length / 9));
    moonPoints.forEach((p) => {
      if (p.i % markerStep !== 0 || p.y <= padT + 5 || p.y >= H - padB - 5) return;
      drawMoonPhaseMarker(gCtx, p.x, p.y, E.moonPhase(samples[p.i].t), C);
    });
    // object curve, colored per visibility state
    const STATE_COLORS = { below: C.below, blocked: C.bad, warn: C.warn, clear: C.good };
    gCtx.lineWidth = 2.4;
    for (let i = 0; i < steps; i++) {
      const s = samples[i];
      const x1 = xOf((i / steps) * durMs), y1 = yOf(s.alt);
      const x2 = xOf(((i + 1) / steps) * durMs), y2 = yOf(samples[i + 1].alt);
      gCtx.strokeStyle = STATE_COLORS[s.state] || C.good;
      gCtx.beginPath(); gCtx.moveTo(x1, y1); gCtx.lineTo(x2, y2); gCtx.stroke();
    }
    // hover crosshair
    if (hoverMs != null) {
      const ms = Math.max(0, Math.min(durMs, hoverMs));
      const i = Math.round((ms / durMs) * steps);
      const s = samples[i];
      const x = xOf((i / steps) * durMs), y = yOf(s.alt);
      gCtx.strokeStyle = C.crosshair; gCtx.lineWidth = 1;
      gCtx.beginPath(); gCtx.moveTo(x, padT); gCtx.lineTo(x, H - padB); gCtx.stroke();
      gCtx.fillStyle = C.crosshairFill;
      gCtx.beginPath(); gCtx.arc(x, y, 4.5, 0, Math.PI * 2); gCtx.fill();
      gCtx.strokeStyle = C.crosshairStroke; gCtx.stroke();
      tip.innerHTML = `<b>${fmtClock(new Date(tStart.getTime() + (i / steps) * durMs))}</b><br>alt ${s.alt.toFixed(1)}° · moon ${s.mAlt.toFixed(1)}°`;
      const rr = g.getBoundingClientRect();
      tip.hidden = false;
      tip.style.left = Math.round(rr.left + Math.min(x + 14, W - 190)) + 'px';
      tip.style.top = Math.round(rr.top + Math.max(10, y - 40) + 8) + 'px';
    }
    gCtx.restore();
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
  // a site/date change can move the scrub window out from under the selected
  // time - pull it back in BEFORE rendering so the heading never shows a
  // daylight instant outside the window
  clampSkyTime();
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

/** Make CAT/byId's custom targets match the STORE exactly.
 *
 *  WE-04 (0.6.32 review): a backup import REPLACES the custom-target records, but
 *  the old code only ADDED what it read back (`upsertTarget`), so a custom the
 *  bundle dropped stayed in CAT/byId - still listed, searchable, drawn on the sky
 *  chart and openable from the detail view until a page reload, while Setup
 *  showed the truth. Remove what is no longer stored, then add/update. */
function syncCustomTargets(stored) {
  const keep = new Set((stored || []).map((t) => t.id));
  for (let i = CAT.length - 1; i >= 0; i--) {
    const o = CAT[i];
    if (o.custom && !keep.has(o.id)) {
      CAT.splice(i, 1);
      byId.delete(o.id);
      searchCache.delete(o);
    }
  }
  for (const t of (stored || [])) upsertTarget(t);
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

/** Re-read rigs and rebuild the topbar picker. WB3 (review): this used to run
 *  only at boot, so a rig added/edited in Setup (or restored from a backup)
 *  was invisible to the picker and to frame coverage until a reload. */
async function reloadRigs() {
  const rigs = await WS.getRigs();
  RIGS.length = 0;
  RIGS.push(...rigs);
  const rsSel = $('#rigSelect');
  if (rsSel) {
    rsSel.innerHTML = '<option value="">None — no coverage</option>' +
      rigs.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
    // keep the active choice when the rig still exists; a deleted rig falls
    // back to "none". (refreshMenuUI is local to boot(), so this must not call it.)
    const want = Hor.getPrefs().activeRigId || '';
    rsSel.value = rigs.some((r) => r.id === want) ? want : '';
    if (!rsSel.value && want) Hor.setPrefs({ activeRigId: '' });
  }
}

async function renderSettings() {
  await reloadRigs();  // WB3: rig edits must show up without a reload
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
          <div class="btnrow action-row" style="margin-top:10px">
            <button class="btn primary" id="set-export">⬇ Export backup (JSON)</button>
            <label class="btn" for="set-import" style="text-align:center">⬆ Import backup</label>
            <input type="file" id="set-import" accept="application/json,.json" class="vhidden">
          </div>
          <p class="sub" style="margin-top:8px">Free space per side lives in the hamburger menu under <b>Display</b>.</p>
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
    announcePlannerChange('site', { cause: 'site-edit', siteId: rec ? rec.id : null });
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
      if (s) {
        applyActiveSite(s);
        announcePlannerChange('site', { cause: 'active-site', siteId: s.id });
        closeModal(); refreshView(); refreshWeatherForSite();
      }
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
    announcePlannerChange('site', { cause: 'site-delete', siteId: S.site.id });
    closeModal(); refreshView();
  }));
  $('#set-add-site').addEventListener('click', () => openSiteForm(null));

  // — rigs —
  modal.querySelectorAll('[data-editrig]').forEach((b) => b.addEventListener('click', () => openRigForm(rigs.find((r) => r.id === b.dataset.editrig))));
  modal.querySelectorAll('[data-delrig]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this rig?')) return;
    const rigId = b.dataset.delrig;
    await WS.deleteRigRec(rigId);
    announcePlannerChange('rig', { cause: 'rig-delete', rigId });
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
    // truthful backup: panorama photos are embedded, hasImage matches the data
    const backup = await WS.collectBackup(Hor.getPrefs(),
      await Hor.exportPanosWithImages(), WS.currentTheme());
    WS.downloadText(`nightseam-web-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 1));
  });

  // Apply a full web snapshot: records + panoramas + prefs + theme. Used for
  // BOTH the incoming backup and the safety rollback, so the two paths cannot
  // diverge. `current` is the pre-restore snapshot: restoreBackup persists it
  // to meta/safety and rolls the records back if a write fails. A malformed
  // bundle throws before anything is destroyed.
  async function applyWebSnapshot(data, current) {
    // Normalize the horizon payload BEFORE restoreBackup clears IndexedDB.
    // `stageBackup` validates the outer shape; this validates the actual editor
    // record contract and turns the staged bundle into one complete model.
    const norm = Hor.normalizePanos(data && data.panos);
    if (!norm) throw new Error('missing panorama section or malformed panorama data');
    const staged = await WS.restoreBackup({ ...data, panos: norm }, current);
    if (!Hor.applyPanosSnapshot(staged.panos)) {
      throw new Error('saving panoramas failed (storage full or unavailable)');
    }
    if (staged.prefs) Hor.setPrefs(staged.prefs);
    if (staged.theme) applyTheme(staged.theme);
    return staged;
  }

  $('#set-import').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    // the backup can embed panorama photos, so cap the file before reading it
    // all into memory (a hand-crafted multi-GB file must not wedge the tab)
    if (f.size > 200 * 1024 * 1024) { alert('Backup file is too large (200 MB max)'); return; }
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
        // snapshot the CURRENT state (records + pano photos + prefs + theme)
        // before replacing anything; restoreBackup persists it as the safety
        // copy and rolls back if any write fails
        const current = await WS.collectBackup(Hor.getPrefs(),
          await Hor.exportPanosWithImages(), WS.currentTheme());
        try {
          await applyWebSnapshot(data, current);
        } catch (err) {
          try { await applyWebSnapshot(current, current); } catch { /* keep the original error */ }
          throw err;
        }
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
  announcePlannerChange('site', { cause: 'site-save', siteId: rec.id });
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
    const fw = WS.fovDeg(p.focal_mm, p.sensor_w), fh = WS.fovDeg(p.focal_mm, p.sensor_h);
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
    const rigId = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await WS.saveRigRec({
      id: rigId,
      name: p.name, focal_mm: p.focal_mm, sensor_w: p.sensor_w, sensor_h: p.sensor_h,
      fov_w: WS.fovArcmin(p.focal_mm, p.sensor_w), fov_h: WS.fovArcmin(p.focal_mm, p.sensor_h),
      fov_unit: 'arcmin',
    });
    announcePlannerChange('rig', { cause: 'rig-add', rigId });
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
    const fw = WS.fovDeg(f, w), fh = WS.fovDeg(f, h);
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
    fov_unit: 'arcmin',
  };
  rec.fov_w = WS.fovArcmin(rec.focal_mm, rec.sensor_w);
  rec.fov_h = WS.fovArcmin(rec.focal_mm, rec.sensor_h);
  await WS.saveRigRec(rec);
  announcePlannerChange('rig', { cause: 'rig-save', rigId: rec.id });
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
    wiki: null, messier: null, ngcic: null, other: '',
    _adv: false,
  };
  await WS.saveTargetRec(rec);
  announcePlannerChange('preferences', { cause: 'catalog-target', targetId: rec.id });
  upsertTarget(rec);
  renderSettings();
}

function closeModal() {
  const modal = $('#modal');
  if (modal) { modal.hidden = true; modal.innerHTML = ''; }
}

/** Re-read user data after a backup import (sites, targets, rigs). */
async function reinitUserData() {
  SITES = await WS.getSites();
  syncCustomTargets(await WS.getTargets());
  await reloadRigs();
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
  document.addEventListener('theme:changed', () => {
    if (S.view === 'sky') renderSky();
    if (S.detailResize) S.detailResize();
  });
  try {
    // WE-06: probe storage BEFORE anything renders. If it is blocked, say so and
    // stop - the old path rejected inside `WS.getSites()` and left the splash up
    // forever with inert tabs.
    if (!(await WS.storageOk())) {
      bootFailure('Local storage is unavailable',
        'NightSeam keeps your sites, rigs, custom targets and horizons in this '
        + 'browser\'s IndexedDB, and it cannot open it here. That usually means '
        + 'private/incognito mode, "block cookies", or a hardened profile. Allow '
        + 'site data for this page and reload.');
      return;
    }
    splashText('loading catalog…');
    const res = await fetch('catalog.json?v=' + CATALOG_TOKEN);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    CAT = await res.json();
    try {
      const prov = await fetch('catalog-provenance.json?v=' + CATALOG_PROVENANCE_TOKEN);
      if (prov.ok) {
        const candidate = await prov.json();
        if (candidate && typeof candidate === 'object' &&
            candidate.objects && typeof candidate.objects === 'object') {
          CAT_PROV = candidate;
        }
      }
    } catch { /* provenance is optional for older/static deployments */ }
    // ALIGNMENT (0.6.31): rank the set the CURRENT MODE shows - the desktop
    // does exactly the same over `S.catalog` (static/js/targets.js), so the two
    // apps cannot disagree about a letter. In standard mode that set is the
    // top-N by popularity (`catalog_data.standard_ids`, pinned by
    // test_catalog.py), so its ranks 1..N ARE the global ones - proven on the
    // real payload by test_tier_letters_are_mode_independent_on_the_real_catalog.
    TIER = assignPopularityTiers(activeCatalog());
    for (const o of CAT) byId.set(o.id, o);
    for (const c of new Set(CAT.map((o) => o.constellation).filter(Boolean))) CONSTELLATIONS.push(c);
    CONSTELLATIONS.sort((a, b) => a.localeCompare(b));
    splashText(`catalog ready · ${CAT.length.toLocaleString()} objects`);
  } catch (err) {
    // WE-06: a failed catalog fetch used to leave the splash up with no way
    // forward. Explain it and offer a reload.
    bootFailure('The catalog could not be loaded',
      `NightSeam could not fetch its catalog (${String((err && err.message) || err)}). `
      + 'Check the connection and reload the page.');
    return;
  }

  // popularity ranks from the BAKED catalog field - no network request here
  // (the popularity source snapshot is shipped; see popularityOf above)

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
  syncCustomTargets(await WS.getTargets());
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
    if (s) {
      applyActiveSite(s);
      announcePlannerChange('site', { cause: 'active-site', siteId: s.id });
      refreshView(); refreshWeatherForSite();
    }
  });
  $('#btn-settings').addEventListener('click', () => {
    const mp = $('#menuPanel'); if (mp) mp.classList.add('hidden');
    renderSettings();
  });

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
  $('#tb-minalt').addEventListener('change', (ev) => {
    applyMinAlt(ev);
    announcePlannerChange('preferences', { cause: 'min-useful-alt' });
  });

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
      announcePlannerChange('date', {
        cause: 'calendar', dateKey: dateKey(S.date),
      });
      refreshView();
      refreshWeatherForSite();
    });
  }

  // — topbar: night scrub (syncs Sky View time) —
  const scrub = $('#tb-scrub'), scrubT = $('#tb-scrub-time');
  if (scrub) {
    const syncScrub = () => {
      const r = scrubRange();
      const len = Math.max(1, Math.round((r.end.getTime() - r.start.getTime()) / 60000));
      scrub.min = '0';
      scrub.max = String(len);
      const mins = Math.max(0, Math.min(len,
        Math.round((S.skyTime.getTime() - r.start.getTime()) / 60000)));
      scrub.value = String(mins);
      if (scrubT) scrubT.textContent = fmtClock(S.skyTime);
    };
    syncScrub();
    const onScrub = () => {
      // stable range for the whole drag: skyAnchor keeps the 24 h window fixed
      // while the time stays inside it, so crossing noon never snaps back.
      const r = scrubRange();
      S.skyTime = new Date(r.start.getTime() + Number(scrub.value) * 60000);
      announceSkyTime();
    };
    scrub.addEventListener('input', onScrub);
    window.addEventListener('sky:time', syncScrub);
    // BUG-005 check/dev hook (same spirit as the desktop's __NS_DEBUG_WORKER):
    // the selected instant and the active scrub span, so a browser check can
    // assert that the marker the Tonight view publishes names the SAME instant
    // the slider does. Inert unless read; the app itself never calls it.
    window.__ns_scrub_range = () => {
      const r = scrubRange();
      return { start: r.start.getTime(), end: r.end.getTime() };
    };
    window.__ns_scrub_sel = () => {
      const r = scrubRange();
      // the SAME quantity the Tonight marker publishes (the scrubber's snapped
      // grid), so the check compares like with like
      return scrubTimeMs(r.start.getTime() + Number(scrub.value) * 60000,
                         r.start.getTime());
    };
    // BUG-005: the instant the app WOULD select for a given slider value, without
    // touching any state - so a check computes its target with the app's OWN
    // snapping instead of duplicating the arithmetic. Inert unless read.
    window.__ns_scrub_at = (v) => {
      const r = scrubRange();
      return scrubTimeMs(r.start.getTime() + Number(v) * 60000,
                         r.start.getTime());
    };
  }

  // — night info chip (dark window + moon) —
  const renderNightInfo = () => {
    const el = $('#nightInfo');
    if (!el) return;
    const info = E.nightInfo(nightAnchor(), S.site.lat, S.site.lon,
                             siteNoon(nightAnchor()));
    const dw = E.pickDarkWindow(info, nightAnchor(), siteNoon(nightAnchor()));
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
        if (!WX_STATE.loading && (!WX_STATE.data || WX_STATE.error)) {
          WX_STATE.error = false;
          loadWeather();
        }
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
    const vfd = $('#viewFullDay'); if (vfd) vfd.checked = !!prefs.viewFullDay;
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
    announcePlannerChange('preferences', { cause: 'timezone' });
    const s = activeSite();
    if (s) applyActiveSite(s);
    refreshView();
  });
  $('#moonAware').addEventListener('change', (ev) => {
    Hor.setPrefs({ moonAware: ev.target.checked });
    announcePlannerChange('preferences', { cause: 'moon-aware' });
    refreshView();
  });
  // View full day: re-derive the scrub range live and pull the selected time
  // into it (e.g. 1 pm clamps back to dusk when switching the night window on).
  $('#viewFullDay').addEventListener('change', (ev) => {
    Hor.setPrefs({ viewFullDay: ev.target.checked });
    announcePlannerChange('preferences', { cause: 'view-full-day' });
    clampSkyTime({ repaint: true });
  });
  $('#bortle').addEventListener('input', (ev) => {
    Hor.setPrefs({ bortle: Hor.num(ev.target.value) || 4 });
    refreshMenuUI(); syncTopPrefs();
  });
  $('#bortle').addEventListener('change', (ev) => {
    Hor.setPrefs({ bortle: Hor.num(ev.target.value) || 4 });
    announcePlannerChange('preferences', { cause: 'bortle' });
    refreshMenuUI(); syncTopPrefs(); refreshView();
  });
  $('#fltBb').addEventListener('change', (ev) => {
    Hor.setPrefs({ fltBb: ev.target.checked });
    announcePlannerChange('preferences', { cause: 'filters' }); refreshView();
  });
  $('#fltHa').addEventListener('change', (ev) => {
    Hor.setPrefs({ fltHa: ev.target.checked });
    announcePlannerChange('preferences', { cause: 'filters' }); refreshView();
  });
  $('#fltOiii').addEventListener('change', (ev) => {
    Hor.setPrefs({ fltOiii: ev.target.checked });
    announcePlannerChange('preferences', { cause: 'filters' }); refreshView();
  });
  $('#sizeUnit').addEventListener('change', (ev) => {
    Hor.setPrefs({ sizeUnit: ev.target.value });
    announcePlannerChange('preferences', { cause: 'size-unit' }); refreshView();
  });
  $('#rigSelect').addEventListener('change', (ev) => {
    Hor.setPrefs({ activeRigId: ev.target.value || '' });
    announcePlannerChange('rig', { cause: 'active-rig', rigId: ev.target.value || '' });
    refreshView();
  });
  $('#skyBrightnessProvider').addEventListener('change', (ev) => {
    const provider = ev.target.value || 'eog';
    Hor.setPrefs({ skyBrightnessProvider: provider });
    refreshSkyBrightnessForSite(activeSite() || S.site);
  });
  refreshMenuUI();
  refreshSkyBrightnessProviderMenu();

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
  await reloadRigs();

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
    // arrows scrub the night on every view (desktop parity - same steps:
    // plain = one 6-min fine step, Shift = the 60-min coarse step; pinned by
    // the "shortcut" engine of tests/js/astro_parity.mjs)
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      const mins = ev.shiftKey ? E.SCRUB_SHIFT_STEP_MIN : E.SCRUB_STEP_MIN;
      S.skyTime = new Date(S.skyTime.getTime() + (ev.key === 'ArrowRight' ? mins : -mins) * 60000);
      clampSkyTime({ repaint: true }); // never scrub past the active range (night window by default)
      ev.preventDefault();
    }
  });
  if (tonightTimer) clearInterval(tonightTimer);
  tonightTimer = setInterval(() => { if (S.view === 'tonight' && !document.hidden) renderTonight(true); }, 60000);

  // Scrub -> Tonight, like the desktop (whose "visible now" follows S.tIdx).
  // Debounced: the topbar scrub fires on every pointer move, and re-ranking
  // during a drag would stutter the slider.
  let tonightScrubTimer = null;
  window.addEventListener('sky:time', (ev) => {
    if (S.view !== 'tonight') return;
    // BUG-005: the selection just moved, so the on-screen cards no longer
    // describe it - clear the render marker NOW and let the paint below set it
    // again. Without this a check that reads the marker between the scrub and
    // the debounce would see the PREVIOUS selection as current.
    applyTonightMarker();
    // A site/date refresh paints Tonight itself. Keep the marker invalidation,
    // but do not schedule a second ranking pass behind that direct render.
    if (ev.detail?.repaint === false) return;
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

  // Escape is the universal dismissal key for the detail/setup dialogs. The
  // modal wrapper is shared by both, so route the key through the visible
  // close button instead of duplicating modal-specific state here.
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const modal = document.querySelector('#modal:not([hidden])');
    const close = modal?.querySelector('.modal .close');
    if (!close) return;
    ev.preventDefault();
    close.click();
  });

  // Seed the scrub inside the window: loading during the day must not show a
  // daylight "visible at" time (it starts at the first allowed instant). Route
  // below performs the one initial visible render.
  clampSkyTime();
  route();
}

if (typeof document !== 'undefined') boot();
