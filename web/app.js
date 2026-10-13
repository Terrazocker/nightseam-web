/*
 * NightSeam Web — static in-browser night-planning app.
 * Planner views:
 *   • Tonight  — dark time, moon phase, ranked best targets
 *   • Sky map  — live polar all-dome chart with sun/moon/all catalog objects
 *   • Catalog  — search/sort across 12,176 objects (OpenNGC + supplement)
 *   • Detail   — meta + tonight rise/transit/set + altitude chart
 *   • Settings — sites, rigs, custom targets, backup/restore (webstore.js)
 * All sky math runs client-side (astro.js, Meeus algorithms).
 */
import * as E from './astro.js?v=58';
import * as Hor from './horizon.js?v=130';
import * as WS from './webstore.js?v=73';
import { fmtSize, sizeArcmin, framePct, magVisible, skyClampZoom,
         skyViewMatrix, skyScreenToBase, skyClampFocus } from './format.js?v=64';
import { nightStats, nightStatsBatch, sampleVisible } from './nightrank.js?v=56';
import { TYPE_LABELS, TYPE_COLORS, searchBlob as coreSearchBlob,
         TIER_ORDER, assignPopularityTiers, wikiTitles,
         inTonightPool, PLANNER_CHANGE_EVENT, panoramaRevision,
         panoramaVisibilityReason } from './core.js?v=67';
import { popularityFactor as corePopularityFactor } from './core.js?v=67';
import { vizTheme, drawMoonPhaseMarker } from './viztheme.js?v=7';
import { wikimediaCredit, wikiImageCredit, renderImageCredit } from './imagecredits.js?v=2';

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
function applyActiveSite(site, options) {
  if (!Hor.setPrefs({ activeSiteId: site.id }) && options?.strict) {
    throw new Error('could not save the active site preference');
  }
  S.site = { lat: site.lat, lon: site.lon, label: site.name, id: site.id, tz: site.tz || null };
  // global timezone override (hamburger menu, advanced mode) wins over the site's
  const tzPref = Hor.getPrefs().tz;
  WS.setActiveTz(tzPref || site.tz || null);
  const sel = $('#tb-site');
  if (sel) {
    sel.innerHTML = SITES.map((s) => `<option value="${esc(s.id)}"${s.id === site.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
    sel.value = site.id;
  }
  if (_wxContext !== null) refreshWeatherForSite();
}

let CAT = null;                 // array of catalog objects
let CAT_PROV = null; // generated source/alias sidecar, loaded only on demand
let catalogProvenanceRequest = null;
let TIER = new Map();           // id -> popularity TIER letter (A-F); scores are never rendered
const byId = new Map();         // id -> object
const searchCache = new Map();  // object -> lowercase search blob
const S = {
  site: { lat: 52.52, lon: 13.4, label: 'Berlin (default)' },
  date: new Date(),
  skyTime: new Date(),
  skyMag: 10,                     // all-sky chart magnitude limit (desktop #skyMag twin)
  view: 'tonight',
  // WEB-REV-003: ONE selected-target identity for Tonight, Catalog and Sky
  // View (`detailId`), plus EXPLICIT inspector visibility (`detailOpen`).
  // Before this, "open" was inferred from a populated `detailId`, so closing
  // the inspector had to destroy the identity - and the Tonight overview and
  // Sky View each kept a second, independently mutable selection id that then
  // drifted (the Sky rail silently re-pointed itself at a fallback target on
  // every redraw). Now `detailId` is the only selection writer's output and
  // outlives the inspector; every view derives its highlighting from it, and
  // only openDetail()/closeDetail() write `detailOpen`.
  detailId: null,
  detailOpen: false,
  cat: { q: '', chip: 'all', con: '', types: [], visibility: 'all',
    savedOnly: false, clearOnly: false, fitsRig: false, sort: 'name', up: true, page: 0 },
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const typeColor = (o) => TYPE_COLORS[o.otype] || '#9fb4d8';

/* Hidden popularity scoring - log-scale normalization of the popularity source
   community scores BAKED into the catalog payload (`catalog_data/popularity_data.py` ->
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
let tonightStatsById = new Map();
let obsEpoch = 0;

function invalidateObservationCache() {
  cancelCatalogWarm();
  obsEpoch++;
  obsCache.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener(PLANNER_CHANGE_EVENT, (event) => {
    const kind = event.detail && event.detail.kind;
    if (!kind || !['horizon', 'site', 'rig', 'date', 'selection', 'preferences'].includes(kind)) return;
    // The same event contract covers every planner input. Site/date/rig/pref
    // handlers still own their immediate render/load policy; this listener
    // owns the cache boundary so a future consumer cannot reuse an observation
    // computed for a different planner revision.
    if (kind !== 'selection') invalidateObservationCache();
    if (kind === 'site') announceStatus(`Observing site: ${S.site.label}. Plan updated.`);
    else if (kind === 'rig') announceStatus('Rig changed. Frame estimates updated.');
    else if (kind === 'date') announceStatus('Planned night changed. Visibility updated.');
    // WEB-REV-003: a catalog mutation may have removed the selected object -
    // drop a genuinely gone selection wherever it is referenced. A merely
    // FILTERED object stays selected; an open inspector refreshes its facts and
    // a closed one STAYS closed (a populated detailId no longer means "open").
    dropSelectionIfGone();
    if (S.detailOpen && kind !== 'selection') refreshOpenDetail();
    if (kind !== 'horizon') return;
    // All dependent views read the active horizon at render time. Repainting
    // here closes the gap between the editor's live in-memory edit and the
    // catalog/tonight values that consume it.
    if (S.view === 'catalog') renderCatalog();
    else if (S.view === 'tonight') renderTonight();
    else if (S.view === 'sky') renderSky();
  });
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
  return siteClock(day, 12);
}

function siteClock(day, hour, dayOffset = 0) {
  return WS.wallFieldsToUtc(day.getFullYear(), day.getMonth(), day.getDate() + dayOffset, hour);
}
function siteFallback(day) { return { dusk: siteClock(day, 20), dawn: siteClock(day, 4, 1) }; }
function resolvedZone() { return WS.tz() || Intl.DateTimeFormat().resolvedOptions().timeZone; }
function nextSiteNoon(noon) { return siteClock(WS.utcToWall(noon), 12, 1); }

function nightWindow() {
  const { lat, lon } = S.site;
  const info = E.nightInfo(nightAnchor(), lat, lon, siteNoon(nightAnchor()));
  const d = (S.date && S.date instanceof Date) ? S.date : WS.effToday();
  // core/planning.js::pickDarkWindow applies the polar-day/polar-twilight
  // fallback (fixed 20:00 -> 04:00 in the SITE's zone) itself - anchored at the
  // site's local noon so a site in another timezone
  // gets ITS fallback hours, never the browser's
  const w = E.pickDarkWindow(info, d, siteNoon(nightAnchor()), siteFallback(d));
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
    minAlt: Hor.effectiveMinAlt(), pano: Hor.activeHorizon(), lat, lon,
  };
}
/* Memoized night window for the scrub (called on every slider tick): the
   window only depends on the anchor date, site and timezone, so it is cached
   instead of rescanning 30 h of twilight on each pointer move. Scoring still
   uses nightWindow() directly - this is presentation-only caching. */
let _winMemo = { key: null, val: null };
function cachedNightWindow() {
  const key = `${dateKey(nightAnchor())}|${S.site.lat}|${S.site.lon}|${resolvedZone()}`;
  if (_winMemo.key !== key) _winMemo = { key, val: nightWindow() };
  return _winMemo.val;
}

/** The active scrub span [start, end) in UTC. Off = the WHOLE night from the
 *  planner's own sun-crossings when the sunset/sunrise pair is coherent, else
 *  the dark window (dusk..dawn), else the site-zoned 20:00-04:00 fallback; On
 *  = noon to next noon in the site calendar. SCORING is unaffected - it stays on
 *  nightWindow() (dusk..dawn). scrubWindowMs/scrubBounds are SHARED with the
 *  desktop so both apps follow ONE policy. */
function scrubRange() {
  const fullStart = skyAnchor(S.skyTime);
  const fullEnd = nextSiteNoon(fullStart);
  const w = cachedNightWindow();
  const info = w.info || {};
  const pick = (a, b, c) => a || b || c || null;
  const s = E.scrubWindowMs({
    sunsetMs: info.sunset ? info.sunset.getTime() : null,
    sunriseMs: info.sunrise ? info.sunrise.getTime() : null,
    duskMs: ms(pick(info.astroDusk, info.nauticalDusk, info.civilDusk)),
    dawnMs: ms(pick(info.astroDawn, info.nauticalDawn, info.civilDawn)),
    noonMs: siteNoon(nightAnchor()).getTime(),
    fallbackStartMs: siteClock(nightAnchor(), 20).getTime(),
    fallbackEndMs: siteClock(nightAnchor(), 4, 1).getTime(),
  });
  const b = E.scrubBounds(!!Hor.getPrefs().viewFullDay,
    s.startMs, s.endMs,
    fullStart.getTime(), fullEnd.getTime());
  return { start: new Date(b.start), end: new Date(b.end) };
}
function ms(d) { return d instanceof Date && !isNaN(d) ? d.getTime() : null; }

/* The time-track colors encode the Sun's actual altitude, including polar
 * nights/days and the full-day option. Astronomy stays in the shared core.
 * Cache the sampled gradient by range/site; dragging only updates phase text. */
let scrubPaintMemo = { key: null, gradient: '' };
function sunPhase(alt) {
  if (alt >= 0) return 'Daylight';
  if (alt >= -6) return 'Civil twilight';
  if (alt >= -12) return 'Nautical twilight';
  if (alt >= -18) return 'Astronomical twilight';
  return 'Astronomical night';
}
function sunTrackColor(alt) {
  const stops = [[0, 'sunset'], [-6, 'civil'], [-12, 'nautical'], [-15, 'astronomical'], [-18, 'night']];
  if (alt >= 0) return 'var(--scrub-sunset)';
  if (alt <= -18) return 'var(--scrub-night)';
  for (let i = 1; i < stops.length; i++) {
    const [hi, highColor] = stops[i - 1], [lo, lowColor] = stops[i];
    if (alt >= lo) {
      const weight = 100 * (hi - alt) / (hi - lo);
      return `color-mix(in srgb, var(--scrub-${highColor}) ${(100 - weight).toFixed(1)}%, var(--scrub-${lowColor}) ${weight.toFixed(1)}%)`;
    }
  }
}
function syncNightScrub(slider, range) {
  const start = range.start.getTime(), end = range.end.getTime();
  const key = `${start}|${end}|${S.site.lat}|${S.site.lon}`;
  if (scrubPaintMemo.key !== key) {
    const colors = [];
    for (let i = 0; i <= 96; i++) {
      const instant = new Date(start + (end - start) * i / 96);
      const alt = E.sunAlt(E.julianDay(instant), S.site.lat, S.site.lon);
      colors.push(`${sunTrackColor(alt)} ${(100 * i / 96).toFixed(3)}%`);
    }
    scrubPaintMemo = { key, gradient: `linear-gradient(to right, ${colors.join(', ')})` };
  }
  if (slider.dataset.paintKey !== key) {
    slider.style.setProperty('--night-track', scrubPaintMemo.gradient);
    slider.dataset.paintKey = key;
  }
  const phase = sunPhase(E.sunAlt(E.julianDay(S.skyTime), S.site.lat, S.site.lon));
  slider.setAttribute('aria-valuetext', `${fmtClock(S.skyTime)}, site time · ${phase}`);
  slider.title = `${fmtClock(range.start)}–${fmtClock(range.end)}, site time. ${phase} at the selected time.`;
  return phase;
}

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
  if (Hor.getPrefs().viewFullDay) return 'slider spans noon to next noon, site time';
  const info = cachedNightWindow().info;
  return info.sunset && info.sunrise && info.sunrise > info.sunset
    ? 'slider spans the night (sunset\u2013sunrise), site time'
    : 'slider spans the planning window; no sunset\u2013sunrise pair, site time';
}

function obsKey(g, oid) {
  if (obsCache.size > 250000) obsCache.clear(); // guard against stale-site growth
  // the ANCHOR date (topbar "night of", else today at the site) - NOT today:
  // otherwise changing the date re-served the previous night's percentages
  // A grid is a short-lived snapshot, never reused after a planner edit. Hash
  // its 720-bin profiles/strokes once, rather than once per object/cache hit.
  if (!g.cachePrefix) {
    const panoKey = g.pano ? `${g.pano.id}:${panoramaRevision(g.pano)}` : '-';
    g.cachePrefix = `${dateKey(nightAnchor())}|${g.jd0}|${g.jd1}|${g.minAlt}|${panoKey}|${g.lat}|${g.lon}|`;
  }
  return g.cachePrefix + oid;
}
function escAttr(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c); }
function cachedPctText(oid, g) {
  const v = obsCache.get(obsKey(g, oid));
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

const SAFE_TARGET_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
function savedTargetIds() {
  const raw = Hor.getPrefs().savedTargetIds;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id) => typeof id === 'string' && SAFE_TARGET_ID.test(id) && byId.has(id)))].slice(0, 2000);
}
function saveTargetIds(ids) {
  const known = [...new Set(ids.filter((id) => typeof id === 'string' && SAFE_TARGET_ID.test(id) && byId.has(id)))].slice(0, 2000);
  savePreferencePatch({ savedTargetIds: known });
  return new Set(savedTargetIds());
}
function updateSavedTargetButton(button, saved) {
  if (!button) return;
  button.classList.toggle('on', saved);
  button.textContent = saved ? '★ Saved target' : '☆ Save target';
  button.setAttribute('aria-pressed', String(saved));
  button.setAttribute('aria-label', saved ? 'Remove from saved targets' : 'Save this target');
  const indicator = document.querySelector(`#m-session-fav[data-id="${escAttr(button.dataset.id || '')}"]`);
  if (indicator) {
    indicator.classList.toggle('on', saved);
    indicator.textContent = saved ? '★' : '☆';
    indicator.setAttribute('aria-label', saved ? 'Saved target' : 'Not a saved target');
  }
}

function selectedVisibility(o, grid) {
  const { lat, lon } = S.site;
  const jd = E.julianDay(S.skyTime);
  const [alt, az] = E.altaz(o.ra_hours * 15, o.dec_deg, jd, lat, lon);
  const win = cachedNightWindow();
  const inWindow = S.skyTime >= win.startT && S.skyTime < win.endT;
  const reason = panoramaVisibilityReason(Hor.activeHorizon(), alt, az, Hor.effectiveMinAlt(), inWindow);
  const night = grid ? obsCache.get(obsKey(grid, o.id))?.night : null;
  return { alt, reason, visible: reason === 'visible', night };
}
function catalogCondition(reason) {
  return ({ visible: 'Usable now', blocked_by_horizon: 'Horizon blocked',
    below_minimum_altitude: 'Below altitude limit', outside_selected_window: 'Outside planning window',
    below_horizon: 'Below horizon', never_rises: 'Below horizon' })[reason] || 'Not usable now';
}
function catalogBestWindow(night) {
  if (!night) return '…';
  return night.bestRun > 0 && night.bestEnd != null
    ? `${fmtClock(E.dateFromJD(night.bestStart))}–${fmtClock(E.dateFromJD(night.bestEnd))}` : '—';
}
function cacheNightSummary(stats, pct = stats.pct, blk = stats.blockedPct) {
  return { pct, blk, night: { maxAlt: stats.maxAlt, bestRun: stats.bestRun, bestStart: stats.bestStart, bestEnd: stats.bestEnd } };
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
  const label = a.text.startsWith('broadband') ? 'BB' : a.ok ? 'NB ✓' : 'NB';
  return `<span class="f-own ${a.ok ? 'ok' : 'warn'}" title="Filter recommendation: ${esc(a.text)}">${label}</span>`;
}

/* ---- busy indicator (desktop parity) ---- */
function busy(on, text) {
  const el = $('#busy');
  if (!el) return;
  el.classList.toggle('hidden', !on);
  const t = el.querySelector('.busy-txt');
  if (t) t.textContent = text || '';
}

/* Workbench is the only shipped visual language. */
function applyTheme(_legacyValue, strict = false) {
  try { localStorage.setItem('nightseam_theme', 'workbench'); } catch (err) {
    if (strict) throw err;
  }
  document.documentElement.setAttribute('data-theme', 'workbench');
}

/* ---- weather: Open-Meteo, load-on-demand — nothing is fetched until the
   user clicks the top-bar chip (or auto-load is switched on).  The response
   is normalized into hourly observing rows so the UI can add providers later
   without changing the presentation contract. ---- */
const WX_STATE = { data: null, loading: false, error: false, airError: false };
let _wxGen = 0;
let _wxContext = null;
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
function wxInfo(code) { return code == null ? ['○', 'Condition unavailable'] : WMO_INFO[code] || ['🌡️', 'Condition ' + code]; }

function wxNumber(value) {
  if (value == null || !['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return null;
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
  // Provider "auto" uses geographic timezone, while planning falls back to
  // the browser zone. Request the exact resolved planning zone for wall hours.
  return resolvedZone();
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
  // Times come from the provider and reach markup: keep only well-formed ISO hours.
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
  }).filter((row) => typeof row.time === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(row.time));
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
  if (row.precipitation == null || row.rainProbability == null) return { label: 'Unknown', cls: 'unknown' };
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
  if (row.cloudTotal == null || row.rainProbability == null || row.precipitation == null ||
      row.dewSpread == null || wxSkyClarity(row).cls === 'unknown') return null;
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
  const complete = rows.length > 0 && scores.every((value) => value != null);
  const score = complete ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const clarityKnown = rows.length > 0 && clarity.every((r) => r.cls !== 'unknown');
  const dewKnown = rows.length > 0 && rows.every((r) => r.dewSpread != null);
  const red = wet || (maxRain != null && maxRain >= 55) || (maxCloud != null && maxCloud >= 85);
  const warn = !red && ((maxRain != null && maxRain >= 20) || (maxCloud != null && maxCloud >= 20) ||
    !!dewHigh || !!dewWarn || poorClarity || fairClarity);
  const status = !complete ? { label: 'Incomplete', cls: 'unknown' } : red ? { label: 'Poor', cls: 'bad' } :
    warn ? { label: 'Fair', cls: 'warn' } :
      rows.length ? { label: 'Good', cls: 'good' } : { label: 'Unknown', cls: 'unknown' };
  const firstTime = (row) => row ? row.time.slice(11, 16) : '';
  return {
    cloud: clouds.length ? `${Math.min(...clouds)}–${Math.max(...clouds)}%` : '—',
    rain: wet ? (maxRain == null ? 'Rain or storm risk' : `${Math.round(maxRain)}% · rain risk`) : maxRain == null ? '—' :
      maxRain >= 35 ? `${Math.round(maxRain)}% possible` : `${Math.round(maxRain)}% max`,
    clarity: poorClarity ? 'Poor' : fairClarity ? 'Fair' : clarityKnown ? 'Good' : 'Unknown',
    clarityCls: poorClarity ? 'bad' : fairClarity ? 'warn' : clarityKnown ? 'good' : 'unknown',
    dew: dewHigh ? `High after ${firstTime(dewHigh)}` : dewWarn ? `Moderate after ${firstTime(dewWarn)}` : dewKnown ? 'Low' : 'Unknown',
    dewCls: dewHigh ? 'bad' : dewWarn ? 'warn' : dewKnown ? 'good' : 'unknown',
    status, score,
    detail: !complete ? (rows.length ? `Insufficient data for a night rating${wet ? ' · Rain or storm risk' : ''}` : 'No night forecast available') : red ? (wet ? 'Rain or storm risk' : 'Very cloudy outlook') :
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
  const context = wxContextKey();
  _wxContext = context;
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
    if (gen !== _wxGen || context !== wxContextKey()) return;
    if (weather.status !== 'fulfilled') throw weather.reason || new Error('weather unavailable');
    WX_STATE.data = weather.value;
    WX_STATE.data.air_quality = air.status === 'fulfilled' ? air.value : null;
    WX_STATE.airError = air.status !== 'fulfilled';
  } catch {
    if (gen !== _wxGen || context !== wxContextKey()) return;
    WX_STATE.error = true; WX_STATE.data = null;
  } finally {
    if (gen === _wxGen) WX_STATE.loading = false;
  }
  if (gen !== _wxGen || context !== wxContextKey()) return;
  wxRenderChip();
  if (!$('#weatherPanel').classList.contains('hidden')) wxRenderPanel();
}

function wxChipText() {
  if (WX_STATE.loading) return '⏳ loading weather…';
  if (WX_STATE.error) return '⚠️ weather unavailable — click to retry';
  if (!WX_STATE.data) return '☁️ Weather';
  const summary = wxForecastSummary(wxRowsForNight(WX_STATE.data));
  return summary.score == null ? 'Weather · insufficient night data' : `${summary.status.label} tonight · ${summary.score}/100`;
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
  const context = wxContextKey();
  if (_wxContext === context) {
    wxRenderChip();
    if (!$('#weatherPanel')?.classList.contains('hidden')) wxRenderPanel();
    return;
  }
  const requested = WX_STATE.loading || WX_STATE.data || WX_STATE.error || Hor.getPrefs().weatherAuto;
  _wxContext = context;
  ++_wxGen;
  WX_STATE.data = null; WX_STATE.loading = false; WX_STATE.error = false; WX_STATE.airError = false;
  wxRenderChip();
  if (requested) loadWeather();
  if (!$('#weatherPanel')?.classList.contains('hidden')) wxRenderPanel();
}

function wxContextKey() {
  return JSON.stringify([S.site.id, S.site.lat, S.site.lon, resolvedZone()]);
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
      <div><span>Rain warning</span><b class="wx-${summary.rain === '—' ? 'unknown' : /risk/i.test(summary.rain) || summary.status.cls === 'bad' ? 'bad' : summary.rain.includes('possible') ? 'warn' : 'good'}">${summary.rain}</b></div>
      <div><span title="Haze proxy, not an astronomical transparency measurement">Sky clarity</span><b class="wx-${summary.clarityCls}">${summary.clarity}</b></div>
      <div><span>Dew risk</span><b class="wx-${summary.dewCls}">${summary.dew}</b></div>
    </div>
    <div class="wx-section-title"><b>Dark-hour forecast</b><span>${wxSelectedDateKey()} · ${bounds.label} site time</span></div>
    ${rows.length ? `<div class="wx-hourly-head"><span>Time</span><span>Cloud</span><span>Rain</span><span>Clarity</span><span>Dew</span></div><div class="wx-hourly">${wxHourlyMarkup(rows)}</div>` : '<p class="hint">No dark-hour forecast is available for this selected night.</p>'}
    <p class="hint" style="margin-top:8px">Sky clarity is a haze proxy, not an astronomical transparency measurement. Dew risk is estimated from temperature and dew point. Forecast by <a href="https://open-meteo.com/" target="_blank" rel="noopener" style="color:var(--accent)">Open-Meteo</a>.</p>`;
}

/* ---------- Wikipedia thumbnails with IndexedDB cache ---------- */
// Object photos come from Wikipedia only when their detail view is opened.
// Cached photos are reused first. Results (image blobs AND definite
// "no photo" answers) are cached in IndexedDB per object; transient network
// failures are NOT cached so they retry next open.
// One shared thumbnail connection: opening one per read/write leaked them and
// would block any future version upgrade. Reopened after a close or failure.
let thumbDb = null;
function idbOpen() {
  thumbDb ??= new Promise((resolve, reject) => {
    try {
      const rq = indexedDB.open('nightseam-images', 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore('thumbs'); };
      rq.onsuccess = () => {
        const db = rq.result;
        db.onversionchange = () => { db.close(); thumbDb = null; };
        db.onclose = () => { thumbDb = null; };
        resolve(db);
      };
      rq.onerror = () => reject(rq.error);
    } catch (e) { reject(e); }
  }).catch((e) => { thumbDb = null; throw e; });
  return thumbDb;
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
// A write counts once its transaction commits: a full disk aborts the
// transaction (QuotaExceededError) after the put request itself succeeded.
async function idbWrite(work) {
  const db = await idbOpen();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('thumbs', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
    work(tx.objectStore('thumbs'));
  });
}
async function idbSet(key, val) {
  try {
    await idbWrite((store) => store.put(val, key));
  } catch (e) {
    if (!e || e.name !== 'QuotaExceededError') return; // storage unavailable — display-only
    // Storage is full: drop most cached photos, then try once more.
    try {
      await idbPrune(THUMB_BUDGET / 4);
      await idbWrite((store) => store.put(val, key));
    } catch { /* still full — display-only for the session */ }
  }
}
const NEG_TTL = 30 * 86400000; // remember "no photo" for 30 days
// Cached photos are capped at THUMB_BUDGET bytes. Past it, the least recently
// viewed photos go until THUMB_KEEP of the budget is used; expired "no photo"
// answers and unreadable entries are dropped on the same pass.
const THUMB_BUDGET = 25 * 1024 * 1024;
const THUMB_KEEP = 0.8;
async function idbPrune(budget = THUMB_BUDGET) {
  const now = Date.now();
  await idbWrite((store) => {
    const photos = [];
    store.openCursor().onsuccess = (ev) => {
      const cursor = ev.target.result;
      if (cursor) {
        const v = cursor.value;
        if (v && v.blob instanceof Blob) photos.push({ key: cursor.key, size: v.blob.size, used: v.used || v.ts || 0 });
        else if (!v || !v.missing || !(now - v.ts < NEG_TTL)) cursor.delete();
        cursor.continue();
        return;
      }
      let total = photos.reduce((sum, p) => sum + p.size, 0);
      if (total <= budget) return;
      photos.sort((a, b) => a.used - b.used);
      for (const p of photos) {
        if (total <= budget * THUMB_KEEP) break;
        store.delete(p.key);
        total -= p.size;
      }
    };
  });
}
const WIKI_API = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
let currentObjUrl = null;

async function loadWikiThumb(o, imgEl, phEl, creditEl) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-data: reduce)').matches) {
    phEl.textContent = 'photo skipped — reduced data mode';
    return;
  }
  const key = 'w:' + o.id;
  const cached = await idbGet(key);
  if (cached && cached.blob) {
    showBlob(cached.blob);
    renderImageCredit(creditEl, cached.credit);
    idbSet(key, { ...cached, used: Date.now() }); // recently viewed photos are kept longest
    return;
  }
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
    const initialCredit = wikimediaCredit(resolvedSrc);
    const ts = Date.now();
    await idbSet(key, { blob, credit: initialCredit, page, ts, used: ts });
    // Display first: optional attribution metadata must not hold up the image.
    showBlob(blob);
    renderImageCredit(creditEl, initialCredit);
    idbPrune().catch(() => {}); // a new photo may push the cache past its budget
    const credit = await wikiImageCredit(resolvedSrc, { signal: ac.signal });
    await idbSet(key, { blob, credit, page, ts, used: Date.now() });
    renderImageCredit(creditEl, credit);
    const link = imgEl.isConnected && S.detailOpen && S.detailId === o.id
      && document.querySelector('#d-wikilink');
    if (link) link.href = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(page.replace(/ /g, '_'));
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
  // WEB-REV-003: a view change closes the inspector but KEEPS the selected
  // target identity (and its highlighting), so the next view shows the same
  // selection and reopening that object reuses it.
  if (S.detailOpen && view !== S.view) closeDetail();
  parkDetailModal();
  // leaving the Horizon editor with unsaved edits: flush them (never lose them)
  if (S.view === 'horizon' && view !== 'horizon' && Hor.horizonUnsaved()) Hor.flushHorizonEdits();
  S.view = view;
  if (view !== 'sky' && skyDrawFrame !== null) {
    cancelAnimationFrame(skyDrawFrame);
    skyDrawFrame = null;
  }
  document.body.dataset.primaryView = view;
  document.querySelectorAll('#tabs a').forEach((a) => {
    const selected = a.dataset.v === S.view;
    a.classList.toggle('active', selected);
    a.setAttribute('aria-selected', String(selected));
    a.tabIndex = selected ? 0 : -1;
  });
  const viewPanel = $('#view');
  if (viewPanel) viewPanel.setAttribute('aria-labelledby', `tab-${S.view}`);
  if (S.view === 'tonight') { renderTonight(); applyTonightMarker(); }
  else if (S.view === 'sky') renderSky();
  else if (S.view === 'catalog') renderCatalog();
  else renderHorizonView();
  announceStatus(`${view === 'sky' ? 'Sky View' : view.charAt(0).toUpperCase() + view.slice(1)} view. Selected time ${fmtClock(S.skyTime)}, site time.`);
}

function renderHorizonView() {
  const box = $('#view');
  box.innerHTML = '';
  Hor.renderHorizon(box, () => { /* other views re-read H state at render time */ },
    { site: () => S.site });
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
 *  `#tb-scrub` is `<input type="range" step="1">` over the active range, so the
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
const SCRUB_STEP_UI_MIN = 1;           // mirrors step="1" in web/index.html
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


function renderTonight(silent, immediate = false) {
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
  const render = () => {
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

    const pano = Hor.activeHorizon();
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
      // One shared core scoring loop also feeds Catalog through nightStatsBatch.
      const st = nightStats(o, jd0, jd1, step, minAlt, pano, lat, lon, {
        moonAlt, moonAz, illum, moonAgeDays: moonAge, filterType,
        moonAware, typeF: tf, bortleF,
      });
      const [altNow, azNow] = E.altaz(o.ra_hours * 15, o.dec_deg, jdSel, lat, lon);
      const ceilNow = pano ? Hor.ceilFor(pano, azNow) : { ceil: Hor.NO_BLOCK, ceilTop: null };
      const visNow = sampleVisible(altNow, minAlt, ceilNow.ceil, ceilNow.ceilTop);
      const pop = popularityFactor(o);
      // popularity is a silent TIEBREAKER (like the desktop): the pure
      // visibility score decides, popularity only separates equal scores
      const score = Math.round((moonAware ? st.sMoon : st.sClassic) * 10) / 100;
      rows.push({ o, maxAlt: st.maxAlt, altNow, visNow, score,
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
    tonightStatsById = new Map(rows.map((row) => [row.o.id, row]));
    // share the computed visibility with the catalog column
    {
      const g = { minAlt, pano, lat, lon, jd0, jd1, step };
      for (const r of rows) obsCache.set(obsKey(g, r.o.id), cacheNightSummary(r, r.obsPct, r.blockedPct));
    }
    // "Best targets tonight" = the best-scoring targets that clear the
    // visibility rules AT LEAST ONCE during this night (visN counts clear
    // samples inside the dark window). A target below the horizon at the
    // scrubbed time still ranks if it clears later tonight; one that never
    // clears all night must not top the list - the desktop's "Best targets"
    // applies the same night-window criterion (statusOf == vis).
    const top = rows.filter((r) => r.visN > 0).slice(0, 16);

    // The "Dark time" card shows the SAME window the ranking and % visibility
    // are computed on (win = the picked twilight level) - never a different
    // twilight pair. At nautical/civil latitudes the astronomical pair is
    // empty, and the old card said "no full dark night" while scoring ran on
    // the nautical/civil window (desktop parity: its card uses N.dusk/N.dawn).
    const darkStart = win.startT, darkEnd = win.endT;
    const darkH = Math.round(((darkEnd - darkStart) / 3600000 + (darkEnd < darkStart ? 24 : 0)) * 10) / 10;
    const darkLabel = ({ astronomical: 'astronomical night', nautical: 'nautical night', civil: 'civil night', fallback: 'fixed window (no full darkness)' }[win.level] || 'night');
    const sessionSite = S.site.label ||
      [S.site.lat.toFixed(2), S.site.lon.toFixed(2)].join(', ');
    const rankRows = top.slice(0, 16).map((r, i) => {
      const tags = [r.o.messier, r.o.ngcic].filter(Boolean).join(' · ');
      const bestEnd = r.bestEnd;
      const durationMin = bestEnd != null ? Math.max(0, (bestEnd - r.bestStart) * 1440) : 0;
      const duration = durationMin > 0 ? fmtDur(durationMin) : '—';
      const best = r.bestRun > 0
        ? `${fmtClock(E.dateFromJD(r.bestStart))}–${fmtClock(E.dateFromJD(bestEnd))} · ${duration}` : '—';
      const topMaxScore = Math.max(0, ...top.map((row) => row.score));
      const relative = topMaxScore > 0 && r.score > 0 ? Math.round(100 * r.score / topMaxScore) : null;
      return `<tr data-tonight-id="${esc(r.o.id)}">
        <td class="mono rank">${String(i + 1).padStart(2, '0')}</td>
        <td><button type="button" class="target-open" aria-label="Open details for ${esc(r.o.primary_name)}"><strong>${esc(r.o.primary_name)}</strong></button><small>${esc(tags || r.o.ngcic || '')}</small></td>
        <td class="mono num">${relative == null ? '—' : relative}</td>
        <td class="mono num">${r.maxAlt.toFixed(0)}°</td>
        <td class="mono">${esc(best)}</td>
      </tr>`;
    }).join('');
    const html = `
      <section class="night-brief">
        <div class="night-brief-title"><p class="eyebrow">Night plan</p><h1>Tonight</h1><span>${esc(sessionSite)} · ${dateKey(nightAnchor())}</span></div>
        <div class="night-brief-facts">
          <span><small>Selected</small><b>${fmtClock(selTime)}</b></span>
          <span><small>${darkLabel} · dark window</small><b>${fmtClock(darkStart)}–${fmtClock(darkEnd)} · ${darkH} h</b></span>
          <span><small>Moon phase</small><b>${mo.icon} ${(mo.illumination * 100).toFixed(0)}% · ${mo.name}</b></span>
        </div>
        <div class="night-brief-times" aria-label="Sun and twilight times">
          <span>Sunset <b>${fmtClock(win.info.sunset)}</b></span><span>Dusk <b>${fmtClock(darkStart)}</b></span>
          <span>Dawn <b>${fmtClock(darkEnd)}</b></span><span>Sunrise <b>${fmtClock(win.info.sunrise)}</b></span>
        </div>
      </section>
      <section class="tonight-ranked" aria-labelledby="tonightRankHeading">
        <header class="panel-heading"><h2 id="tonightRankHeading">Best targets tonight</h2><span class="sub">${top.length} targets with usable dark-window visibility</span></header>
        <div class="tablewrap" tabindex="0" role="region" aria-label="Best targets table; scroll horizontally for all columns"><table id="tonight-rank-table">
          <thead><tr><th>#</th><th>Target</th><th class="num">Relative score</th><th class="num">Max altitude</th><th>Best usable interval</th></tr></thead>
          <tbody>${rankRows || '<tr><td colspan="5" class="sub">No targets have a clear window tonight.</td></tr>'}</tbody>
        </table></div>
      </section>
      <p class="cat-count tonight-footnote">Horizon: ${pano ? esc(pano.name) : 'none'} · Select a target row for its detail panel.</p>`;
    if (token !== tonightToken || S.view !== 'tonight') return; // superseded / view switched
    box.innerHTML = html;
    applySelectionHighlight();   // WEB-REV-003: derived from S.detailId
    box.querySelectorAll('#tonight-rank-table tbody tr[data-tonight-id]').forEach((row) => {
      const open = () => openDetail(row.dataset.tonightId, row.querySelector('.target-open'));
      row.addEventListener('click', open);
    });
    hideSplash();
    // BUG-005: publish the painted selection so a check (or a user script) can
    // wait for THIS render instead of guessing a delay.
    stampTonightRender(box, selTime);
    applyTonightMarker();
  };
  // Backup acceptance must observe rendering errors inside its rollback boundary.
  if (immediate) render();
  else setTimeout(render, 30);
}

/* ----------------------------- sky map ----------------------------- */

let skyItems = [];
// WEB-REV-003: Sky View has NO local selection id. The rail, its highlight and
// the "Open target details" action all derive from the shared S.detailId, so
// the chart can never silently re-point the selection at a fallback object.
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

/** Start of the calendar scrub window that CONTAINS the given time: the most
 *  recent noon at-or-before it (yesterday's noon when the clock reads
 *  before 12:00). Without this, any time before noon lands outside the
 *  noon->next-noon range and the slider clamps to its left edge. */
function skyRangeStart(t) {
  const w = WS.utcToWall(t);
  const dayOffset = w.getHours() < 12 ? -1 : 0;
  return siteClock(w, 12, dayOffset);
}

/* Keep the noon anchor stable during dragging, including its right endpoint.
 * Re-anchor on zone changes or when selection leaves the actual calendar span. */
let SKY_ANCHOR = null, SKY_ANCHOR_ZONE = null;
function skyAnchor(t) {
  const zone = resolvedZone();
  if (zone !== SKY_ANCHOR_ZONE) { SKY_ANCHOR = null; SKY_ANCHOR_ZONE = zone; }
  if (SKY_ANCHOR && t >= SKY_ANCHOR && t <= nextSiteNoon(SKY_ANCHOR)) return SKY_ANCHOR;
  SKY_ANCHOR = skyRangeStart(t);
  return SKY_ANCHOR;
}

function renderSky() {
  if (skyDrawFrame !== null) cancelAnimationFrame(skyDrawFrame);
  skyDrawFrame = null;
  const focusedDetail = $('#modal')?.contains(document.activeElement) ? document.activeElement : null;
  // Keep the shared inspector alive while replacing the Sky workspace.
  parkDetailModal();
  const box = $('#view');
  const V = vizTheme();
  const magMax = advMode() ? 20 : 14;   // desktop setup.js parity (14; 20 in advanced)
  const base = activeCatalog();
  box.innerHTML = `
    <div class="sky-wrap sky-workspace">
      <section class="sky-main" aria-label="All-sky chart and time controls">
      <div class="sky-time-rail" role="group" aria-label="Chart time controls">
          <div class="night-phase-legend" id="sky-phase-legend" aria-label="Time track colors">
            <span><i class="phase-civil" aria-hidden="true"></i>Civil twilight</span>
            <span><i class="phase-nautical" aria-hidden="true"></i>Nautical twilight</span>
            <span><i class="phase-astronomical" aria-hidden="true"></i>Astronomical twilight</span>
            <span><i class="phase-night" aria-hidden="true"></i>Night</span>
          </div>
          <div class="sky-scrub">
            <label for="sky-slider">Selected time <output id="sky-sout" class="mono"></output><span id="sky-phase" class="sub"></span></label>
            <input type="range" class="night-scrub" id="sky-slider" min="0" max="1440" step="1" aria-describedby="sky-range-caption sky-phase-legend">
            <div class="sky-range-times mono"><span id="sky-range-start"></span><span id="sky-range-end"></span></div>
          </div>
          <div class="btnrow">
            <button class="btn primary" id="sky-now">Now</button>
            <button class="btn" id="sky-reset" title="double-click the chart also resets">↺ Reset view</button>
          </div>
          <p class="visually-hidden" id="sky-range-caption">${rangeLabel()}</p>
      </div>
      <div class="sky-canvas-box card"><canvas id="sky" tabindex="0" role="img" aria-label="All-sky polar chart" aria-describedby="skyChartSummary"></canvas><p id="skyChartSummary" class="visually-hidden" role="note">All-sky chart. Select an object to inspect its details.</p></div>
      </section>
      <aside class="sky-side">
        <details class="card sky-controls-tray">
          <summary>Chart controls and legend</summary>
          <label>Magnitude limit ≤ <output id="sky-mag-val">${S.skyMag.toFixed(1)}</output>
            <input type="range" id="sky-mag" min="0" max="${magMax}" step="0.5" value="${S.skyMag}">
          </label>
          <p class="sub" style="margin-top:8px">Fainter objects are hidden. Objects without a measured magnitude appear at the faintest setting.</p>
          <h3>Legend</h3>
          <ul class="legend">
            <li><span class="dot" style="background:${V.sun};border-radius:50%"></span>Sun</li>
            <li><span class="dot" style="background:${V.moon};border-radius:50%"></span>Moon</li>
            <li><span class="dot" style="background:transparent;border:2px dashed ${V.minStroke};border-radius:50%"></span>min altitude</li>
            ${Hor.activeHorizon() ? `<li><span class="dot" style="background:${V.obstacleStroke}"></span>blocked by horizon</li>` : ''}
            ${Object.entries(TYPE_COLORS).map(([t, c]) => `<li><span class="dot" style="background:${V.types[t] || c}"></span>${TYPE_LABELS[t]}</li>`).join('')}
          </ul>
          <p class="sub sky-chart-hint">All-sky polar chart: center is zenith, rim is horizon, north is at top. Scroll to zoom, drag to pan, and double-click to reset.</p>
        </details>
        <div id="sky-detail-host"></div>
        <section id="sky-detail-empty" class="card" aria-label="Selected target"></section>
      </aside>
    </div>`;
  hideSplash();
  syncDetailDock();
  detailGraphRedraw?.();
  if (focusedDetail?.isConnected) focusedDetail.focus({ preventScroll: true });

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

    // horizon obstruction silhouette (active horizon).
    // Blocked = alt BELOW the ceiling => the OUTER ring between the ceiling
    // curve and the horizon rim (the inner disc is the free sky).
    const pano = Hor.activeHorizon();
    if (pano) {
      const radiusFor = (az, altDeg) => {
        const a = E.D2R * az;
        const r = R * (1 - Math.max(0, Math.min(90, altDeg)) / 90);
        return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
      };
      const ceilPts = [];
      for (let az = 0; az <= 360; az += 1) {
        const { ceil } = Hor.ceilFor(pano, az);
        ceilPts.push(radiusFor(az, ceil > Hor.NO_BLOCK + 0.5 ? Math.min(ceil, 90) : 0));
      }
      ctx.fillStyle = C.obstacleFill;
      ctx.strokeStyle = C.obstacleStroke;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ceilPts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      for (let az = 360; az >= 0; az -= 1) {
        const a = E.D2R * az;
        ctx.lineTo(cx + R * Math.sin(a), cy - R * Math.cos(a));
      }
      ctx.closePath();
      ctx.fill();
      // stroke ONLY the ceiling curve: stroking the closed polygon drew a
      // radial chord at the az 0 seam (the reported "line to the north").
      ctx.beginPath();
      ceilPts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();

      // Overhangs block from their edge up to the zenith. Each contiguous run
      // of covered directions is its own sector through the centre, so a gap
      // between overhangs is never bridged.
      let run = [];
      const flushRun = () => {
        if (run.length > 1) {
          ctx.beginPath();
          run.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.lineTo(cx, cy);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          run.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.stroke();
        }
        run = [];
      };
      for (let az = 0; az <= 360; az += 0.5) {
        const { ceilTop } = Hor.ceilFor(pano, Math.min(az, 359.99));
        if (ceilTop == null) flushRun();
        else run.push(radiusFor(az, Math.max(0, Math.min(ceilTop, 90))));
      }
      flushRun();
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

    // Labels use screen coordinates: zoom moves their dots without enlarging
    // the text. Try nearby positions, keeping each label inside the viewport.
    if (labelCands.length) {
      ctx.save();
      const matrix = skyViewMatrix(SKYV.zoom, W, W, SKYV.fx, SKYV.fy);
      ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
      ctx.font = 'bold 10.5px system-ui, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      const placed = [];
      labelCands.sort((a, b) => a.prio - b.prio);
      for (const c of labelCands) {
        const x = Math.round(matrix.a * c.x + matrix.e);
        const y = Math.round(matrix.d * c.y + matrix.f);
        if (x < 0 || x > W || y < 0 || y > W) continue;
        const w = ctx.measureText(c.text).width + 8, h = 14;
        const position = [[x + 6, y - 6], [x - w - 6, y - 6],
          [x + 6, y + h + 3], [x - w - 6, y + h + 3]]
          .find(([tx, ty]) => tx >= 3 && tx + w <= W - 3 &&
            ty - h >= 3 && ty <= W - 3 && !placed.some((p) =>
              Math.abs(tx + w / 2 - p.x) < (w + p.w) / 2 && Math.abs(ty - p.y) < h));
        if (!position) continue;
        const [tx, ty] = position;
        placed.push({ x: tx + w / 2, y: ty, w });
        ctx.save();
        ctx.shadowColor = C.targetShadow;
        ctx.shadowBlur = C.labelBlur;
        ctx.fillStyle = C.targetLabel;
        ctx.fillText(c.text, tx, ty);
        ctx.restore();
      }
      ctx.restore();
    }

    // obstruction-free note: horizon line already drawn
    const summary = $('#skyChartSummary');
    if (summary) {
      const when = `${dateKey(WS.utcToWall(S.skyTime))} ${fmtClock(S.skyTime)} site time`;
      const targets = skyItems.filter((item) => item.o).length;
      summary.textContent = `All-sky polar chart at ${when}; ${targets} catalog objects are plotted. Center is zenith, rim is horizon, and the selected horizon profile is shown as blocked sky.`;
    }
    syncSkyDetailPlaceholder();
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
    if (best && bestD < 140) {
      selectTarget(best.id);   // WEB-REV-003: same authoritative identity
      draw();
      openDetail(best.id, cvs);
    }
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

  // time scrub slider: noon-to-noon window containing the current sky time
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
    $('#sky-phase').textContent = syncNightScrub(slider, r);
    $('#sky-range-start').textContent = fmtClock(r.start);
    $('#sky-range-end').textContent = fmtClock(r.end);
  };
  syncControls();
  slider.addEventListener('input', () => {
    const r = scrubRange();
    S.skyTime = new Date(r.start.getTime() + Number(slider.value) * 60000);
    announceSkyTime();
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
    // Controls/model are immediate. A pointer burst paints only the newest
    // selection at the next frame, rather than redrawing every intermediate one.
    if (ev.detail?.repaint !== false && skyDrawFrame === null) {
      skyDrawFrame = requestAnimationFrame(() => {
        skyDrawFrame = null;
        if (S.view === 'sky' && cvs.isConnected) draw();
      });
    }
  } catch { /* view gone */ } };
  window.addEventListener('sky:time', skyTimeHandler);

  sizeCanvas();
  draw();
  if (skyResizeObserver) skyResizeObserver.disconnect();
  if (typeof ResizeObserver === 'function') {
    skyResizeObserver = new ResizeObserver(() => {
      if (S.view !== 'sky') return;
      try { sizeCanvas(); draw(); } catch { /* view switched away */ }
    });
    skyResizeObserver.observe(box.querySelector('.sky-canvas-box'));
  }
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
let skyDrawFrame = null;
let skyResizeHandler = null;
let skyResizeObserver = null;

/* ----------------------------- catalog ----------------------------- */

/* Chip row for the catalog. Popularity is deliberately NOT a chip or visible
 * table column; the existing secondary sort remains available in More filters. */
const CHIP_LABELS = { all: 'All', messier: 'Messier', bright: 'Bright <8', custom: 'Custom' };
const CHIP_FILTERS = {
  all: () => true,
  messier: (o) => !!o.messier,
  bright: (o) => o.vmag != null && o.vmag < 8,
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

function filteredCatalog(pctG) {
  const f = S.cat;
  const q = f.q.trim().toLowerCase();
  const saved = new Set(savedTargetIds());
  let out = activeCatalog().filter((o) => CHIP_FILTERS[f.chip](o));
  if (f.con) out = out.filter((o) => o.constellation === f.con);
  if (f.types?.length) out = out.filter((o) => f.types.includes(o.otype));
  if (f.savedOnly) out = out.filter((o) => saved.has(o.id));
  if (f.clearOnly) out = out.filter((o) => {
    const night = obsCache.get(obsKey(pctG, o.id))?.night;
    return !night || night.bestRun > 0; // unknown rows remain until warming finishes
  });
  if (f.fitsRig) out = out.filter((o) => {
    const frame = rigFramePct(o);
    return frame != null && frame <= 100;
  });
  if (q) out = out.filter((o) => blobOf(o).includes(q));
  if (f.visibility !== 'all') out = out.filter((o) => {
    const v = selectedVisibility(o, pctG);
    if (f.visibility === 'now') return v.visible;
    return !v.visible;
  });
  const col = f.sort;
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
    else if (col === 'maxalt') {
      const aa = obsCache.get(obsKey(pctG, a.id))?.night.maxAlt;
      const ab = obsCache.get(obsKey(pctG, b.id))?.night.maxAlt;
      if (aa == null || ab == null) {
        if (aa != null) return -1;
        if (ab != null) return 1;
      } else v = aa - ab;
    }
    else if (col === 'tier') {
      v = TIER_ORDER.indexOf(TIER.get(a.id) || 'F') - TIER_ORDER.indexOf(TIER.get(b.id) || 'F');
      // inside a tier, the more observed object first (still never the number)
      if (v === 0) v = (b.popularity || 0) - (a.popularity || 0);
    }
    else v = (a.vmag ?? 99) - (b.vmag ?? 99);
    return (f.up ? v : -v) || a.primary_name.localeCompare(b.primary_name) || a.id.localeCompare(b.id);
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
  const g = obsNightGrid();
  const list = filteredCatalog(g);
  const perPage = 50;
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  if (S.cat.page >= pages) S.cat.page = 0;
  const slice = list.slice(S.cat.page * perPage, (S.cat.page + 1) * perPage);
  const saved = new Set(savedTargetIds());
  const objectTypes = [...new Set(activeCatalog().map((o) => o.otype).filter(Boolean))].sort();

  const th = (key, label, num = false) =>
    `<th class="${num ? 'num' : ''}" data-k="${key}" aria-sort="${S.cat.sort === key ? (S.cat.up ? 'ascending' : 'descending') : 'none'}"><button type="button" id="cat-sort-${key}" class="table-sort" aria-label="Sort by ${label}${S.cat.sort === key ? '; reverse order' : ''}">${label}${S.cat.sort === key ? (S.cat.up ? ' ▲' : ' ▼') : ''}</button></th>`;

  // focus/caret in the search box must survive the re-render below
  const qHadFocus = !!document.activeElement && document.activeElement.id === 'cat-q';
  const qCaret = qHadFocus ? document.activeElement.selectionStart : null;
  const qEnd = qHadFocus ? document.activeElement.selectionEnd : null;
  const qDirection = qHadFocus ? document.activeElement.selectionDirection : null;
  // same for the Min-visibility slider: it re-renders on 'change', and an
  // arrow-key press fires one - without this the slider would lose focus after
  // every step and keyboard stepping would stop at 1.
  const mvHadFocus = !!document.activeElement && document.activeElement.id === 'cat-minvis';
  const filterFocus = document.activeElement?.matches('.cat-filter-rail input, .cat-filter-rail select, .cat-filter-rail button, .table-sort, #pg-prev, #pg-next')
    ? document.activeElement.id : null;
  const moreFiltersOpen = !!$('#cat-more')?.open;
  box.innerHTML = `
    <div class="catalog-layout">
    <aside class="cat-filter-rail" aria-label="Catalog filters">
      <h2>Filters</h2>
    <div class="cat-bar">
      <input type="search" id="cat-q" aria-label="Search the catalog" placeholder="Search: name, M 31, NGC 7000, galaxy, Cyg…" value="${esc(S.cat.q)}">
      <select id="cat-con" title="constellation filter">
        <option value="">All constellations</option>
        ${CONSTELLATIONS.map((c) => `<option value="${esc(c)}"${S.cat.con === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      <div class="chips" role="group" aria-label="Catalog shortcuts">${Object.keys(CHIP_FILTERS).map((c) => `<button id="cat-chip-${c}" class="chip${S.cat.chip === c ? ' on' : ''}" aria-pressed="${S.cat.chip === c}" data-c="${c}">${CHIP_LABELS[c]}</button>`).join('')}</div>
      <fieldset class="cat-types" id="cat-type" aria-describedby="cat-type-help">
        <legend>Object types</legend>
        <p id="cat-type-help">${S.cat.types.length ? 'Show any checked type.' : 'All types shown.'} Tick types to narrow the list.</p>
        ${objectTypes.map((type) => `<label><input id="cat-type-${esc(type)}" type="checkbox" name="cat-object-type" value="${esc(type)}"${S.cat.types.includes(type) ? ' checked' : ''}> ${esc(TYPE_LABELS[type] || type)}</label>`).join('')}
        <button class="btn small" id="cat-all-types" type="button"${S.cat.types.length ? '' : ' disabled'}>Show all types</button>
      </fieldset>
      <fieldset class="cat-visibility"><legend>Visibility at selected time</legend>
        ${[['all','All'],['now','Usable now'],['none','Not usable now']].map(([value,label]) => `<label><input id="cat-visibility-${value}" type="radio" name="cat-visibility" value="${value}"${S.cat.visibility === value ? ' checked' : ''}> ${label}</label>`).join('')}
        <p class="cat-filter-help">Uses the time above, your altitude limit, horizon and planning window.</p>
      </fieldset>
      <details class="cat-more" id="cat-more"${moreFiltersOpen ? ' open' : ''}><summary>More filters</summary><div class="cat-advanced">
        <label class="minvis" title="Hide objects whose share of tonight's dark window is below this. 0% shows every object, visible or not.">Min visible night <b id="cat-minvis-v">${minVis() > 0 ? minVis() + '%' : 'off'}</b>
          <input type="range" id="cat-minvis" min="0" max="100" step="1" value="${minVis()}" aria-label="Minimum visibility percent">
        </label>
        <label><input id="cat-clear" type="checkbox"${S.cat.clearOnly ? ' checked' : ''}> Has clear window</label>
        <label><input id="cat-saved" type="checkbox"${S.cat.savedOnly ? ' checked' : ''}> Saved targets</label>
        <label><input id="cat-rig" type="checkbox"${S.cat.fitsRig ? ' checked' : ''}> Fits active rig</label>
        <select id="cat-sort" aria-label="Sort catalog">
          ${[['name','Name'],['type','Type'],['pct','Visible night %'],['mag','Magnitude'],['maxalt','Maximum altitude']].map(([key,label]) => `<option value="${key}"${S.cat.sort === key ? ' selected' : ''}>Sort: ${label}</option>`).join('')}
        </select>
        <button class="btn small" id="cat-reverse" type="button">${S.cat.up ? 'Ascending' : 'Descending'} · Reverse order</button>
        <button class="btn small" id="cat-export-provenance" type="button" title="Download catalog source, aliases and designation history">Download provenance</button>
      </div></details>
      <button class="btn small" id="cat-clear-filters" type="button">Clear filters</button>
    </div>
    </aside>
    <section class="cat-results" aria-label="Catalog results">
      <header class="cat-results-head"><div><h2>Catalog</h2><p class="catalog-context">${esc(S.site.label || [S.site.lat.toFixed(2), S.site.lon.toFixed(2)].join(', '))} · ${dateKey(S.date)} · Min altitude ${Hor.effectiveMinAlt().toFixed(0)}°</p></div>
    <div class="cat-stats">
      <span class="cat-count">${list.length.toLocaleString()} of ${CAT.length.toLocaleString()} objects${advMode() ? '' : ' (standard mode)'}${hiddenNotVisible ? ` · ${hiddenNotVisible} below ${minVis()}%` : ''}</span>
      <span class="cat-count" id="pct-status"></span>
    </div>
      </header>
      <div class="card catalog-table-card">
      <div class="catwrap" tabindex="0" role="region" aria-label="Catalog objects; scroll for more rows and columns">
      <table class="cat catalog-dense">
        <thead><tr><th>#</th><th>Designation</th><th>Common name</th>${th('type', 'Type')}${th('mag', 'Mag', true)}<th>Alt now</th>${th('pct', 'Night %', true)}<th>Best window</th><th>At ${fmtClock(S.skyTime)}</th></tr></thead>
        <tbody>
          ${slice.map((o, index) => {
            const designation = [o.messier, o.ngcic].filter(Boolean).join(' · ') || o.id.toUpperCase();
            const fOwn = filterAdviceBadge(o);
            const current = selectedVisibility(o, g);
            const night = current.night;
            const best = catalogBestWindow(night);
            const status = catalogCondition(current.reason);
            return `<tr data-id="${esc(o.id)}">
              <td class="rank-cell mono">${S.cat.page * perPage + index + 1}</td>
              <td class="designation-cell mono" title="${esc(designation)}"><button class="cat-save${saved.has(o.id) ? ' on' : ''}" type="button" data-save-target="${esc(o.id)}" aria-label="${saved.has(o.id) ? 'Remove' : 'Save'} ${esc(o.primary_name)}">${saved.has(o.id) ? '★' : '☆'}</button><span>${esc(designation)}</span></td>
              <td class="common-cell" title="${esc(o.primary_name)}"><button type="button" class="target-open tname" aria-label="Open details for ${esc(o.primary_name)}">${esc(o.primary_name)}</button>${fOwn}</td>
              <td class="type-cell" title="${esc(TYPE_LABELS[o.otype] || o.otype || '')}"><span class="tag-dot" style="color:${typeColor(o)}">●</span> ${esc(TYPE_LABELS[o.otype] || o.otype || '')}</td>
              <td class="num">${o.vmag != null ? o.vmag.toFixed(1) : '—'}</td>
              <td class="num mono">${current.alt.toFixed(0)}°</td>
              <td class="num pct" data-objid="${escAttr(o.id)}">${cachedPctText(o.id, g)}</td>
              <td class="mono best-window" title="${esc(best)}">${esc(best)}</td><td class="selected-condition" title="${esc(status)}">${esc(status)}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="9" class="sub">No objects match these filters. Try Show all types or Clear filters.</td></tr>'}
        </tbody>
      </table>
      </div>
    </div>
    <div class="pager">
      <button class="btn" id="pg-prev" ${S.cat.page === 0 ? 'disabled' : ''}>← prev</button>
      <span>${list.length ? `${S.cat.page * perPage + 1}–${Math.min((S.cat.page + 1) * perPage, list.length)} of ${list.length.toLocaleString()}` : 'No matching objects'} · Page ${S.cat.page + 1} / ${pages}</span>
      <button class="btn" id="pg-next" ${S.cat.page >= pages - 1 ? 'disabled' : ''}>next →</button>
    </div>
    </section>
    </div>`;
  hideSplash();
  applySelectionHighlight();   // WEB-REV-003: derived from S.detailId

  $('#cat-q').addEventListener('input', (ev) => {
    S.cat.q = ev.target.value;
    S.cat.page = 0;
    clearTimeout(_catQDeb);
    _catQDeb = setTimeout(renderCatalog, 150);
  });
  document.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { S.cat.chip = c.dataset.c; S.cat.page = 0; renderCatalog(); }));
  document.querySelectorAll('th[data-k]').forEach((thEl) => thEl.querySelector('button').addEventListener('click', () => {
    const k = thEl.dataset.k;
    if (S.cat.sort === k) S.cat.up = !S.cat.up;
    else { S.cat.sort = k; S.cat.up = k === 'pct' ? false : true; } // visibility: descending first
    renderCatalog();
  }));
  document.querySelectorAll('table.cat tbody tr[data-id]').forEach((tr) => {
    const open = () => openDetail(tr.dataset.id, tr.querySelector('.target-open'));
    tr.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-save-target]')) return;
      open();
    });
  });
  $('#pg-prev').addEventListener('click', () => { if (S.cat.page > 0) { S.cat.page--; renderCatalog(); } });
  $('#pg-next').addEventListener('click', () => { if (S.cat.page < pages - 1) { S.cat.page++; renderCatalog(); } });
  $('#cat-con').addEventListener('change', (ev) => { S.cat.con = ev.target.value; S.cat.page = 0; renderCatalog(); });
  $('#cat-type').addEventListener('change', () => {
    S.cat.types = [...box.querySelectorAll('input[name="cat-object-type"]:checked')].map((input) => input.value);
    S.cat.page = 0; renderCatalog();
  });
  $('#cat-all-types').addEventListener('click', () => { S.cat.types = []; S.cat.page = 0; renderCatalog(); });
  box.querySelectorAll('input[name="cat-visibility"]').forEach((input) => input.addEventListener('change', () => {
    S.cat.visibility = box.querySelector('input[name="cat-visibility"]:checked')?.value || 'all';
    S.cat.page = 0; renderCatalog();
  }));
  $('#cat-clear').addEventListener('change', (ev) => { S.cat.clearOnly = ev.target.checked; S.cat.page = 0; renderCatalog(); });
  $('#cat-saved').addEventListener('change', (ev) => { S.cat.savedOnly = ev.target.checked; S.cat.page = 0; renderCatalog(); });
  $('#cat-rig').addEventListener('change', (ev) => { S.cat.fitsRig = ev.target.checked; S.cat.page = 0; renderCatalog(); });
  $('#cat-sort').addEventListener('change', (ev) => { S.cat.sort = ev.target.value; S.cat.up = ev.target.value === 'pct' ? false : true; S.cat.page = 0; renderCatalog(); });
  $('#cat-reverse').addEventListener('click', () => { S.cat.up = !S.cat.up; S.cat.page = 0; renderCatalog(); });
  $('#cat-clear-filters').addEventListener('click', () => {
    S.cat = { ...S.cat, q: '', chip: 'all', con: '', types: [], visibility: 'all',
      savedOnly: false, clearOnly: false, fitsRig: false, sort: 'name', up: true, page: 0 };
    if (!savePreferencePatch({ minVis: 0 })) return;
    renderCatalog();
  });
  box.querySelector('.cat tbody')?.addEventListener('click', (ev) => {
    const button = ev.target.closest('[data-save-target]');
    if (!button) return;
    ev.preventDefault(); ev.stopPropagation();
    const id = button.dataset.saveTarget;
    const ids = new Set(savedTargetIds());
    if (ids.has(id)) ids.delete(id); else ids.add(id);
    saveTargetIds([...ids]);
    if (S.cat.savedOnly) renderCatalog();
    else {
      button.classList.toggle('on', ids.has(id));
      button.textContent = ids.has(id) ? '★' : '☆';
      button.setAttribute('aria-label', `${ids.has(id) ? 'Remove' : 'Save'} ${byId.get(id)?.primary_name || id}`);
      const detailSave = document.querySelector('#m-save-target');
      if (detailSave?.dataset.id === id) updateSavedTargetButton(detailSave, ids.has(id));
    }
  });
  // The slider updates its label + the preference live, but only RE-RENDERS on
  // 'change': renderCatalog() rebuilds this whole bar, which would tear the
  // element out from under the pointer mid-drag.
  $('#cat-minvis').addEventListener('input', (ev) => {
    const v = Math.round(Number(ev.target.value));
    $('#cat-minvis-v').textContent = v > 0 ? `${v}%` : 'off';
    if (!savePreferencePatch({ minVis: v })) return;
  });
  $('#cat-minvis').addEventListener('change', () => { S.cat.page = 0; renderCatalog(); });
  $('#cat-export-provenance').addEventListener('click', downloadCatalogProvenance);
  if (qHadFocus) {                       // typing must not be interrupted
    const inp = $('#cat-q');
    if (inp) { inp.focus(); if (qCaret != null) inp.setSelectionRange(qCaret, qEnd, qDirection); }
  }
  if (mvHadFocus) { const el = $('#cat-minvis'); if (el) el.focus(); }
  if (filterFocus) {
    const el = document.getElementById(filterFocus);
    const target = el?.disabled ? (filterFocus === 'cat-all-types'
      ? box.querySelector('#cat-type input') : box.querySelector('.pager button:not(:disabled)')) : el;
    target?.focus({ preventScroll: true });
  }
  requestAnimationFrame(updateCatalogHeight);
  fillPctCells(slice, g);
  // Visibility gating is bypassed for search; maximum-altitude sorting still
  // needs owned statistics for every matching row, including search results.
  if (S.cat.clearOnly || S.cat.sort === 'maxalt' || (!S.cat.q.trim() && (S.cat.sort === 'pct' || minVis() > 0))) warmPct(list, g);
  else cancelCatalogWarm();
}

function updateCatalogHeight() {
  const wrap = document.querySelector('.cat-results .catwrap');
  if (wrap) wrap.style.setProperty('--catalog-table-top', `${Math.ceil(wrap.getBoundingClientRect().top + window.scrollY)}px`);
}
window.addEventListener('resize', updateCatalogHeight);

async function loadCatalogProvenance() {
  if (CAT_PROV) return CAT_PROV;
  if (catalogProvenanceRequest) return catalogProvenanceRequest;
  catalogProvenanceRequest = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(new URL('catalog-provenance.json?v=' + CATALOG_PROVENANCE_TOKEN, import.meta.url), { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const candidate = await response.json();
      const objects = candidate?.objects;
      const standard = CAT.filter((o) => !o.custom);
      if (candidate?.schema_version !== 1 || !objects || Array.isArray(objects) ||
          candidate.catalog?.row_count !== standard.length ||
          Object.keys(objects).length !== standard.length ||
          standard.some((o) => {
            const p = objects[o.id];
            return !p || Array.isArray(p) || typeof p.source !== 'string' || !p.source.trim() ||
              ['source_version', 'source_file'].some((key) => p[key] != null && typeof p[key] !== 'string') ||
              (p.aliases != null && (!Array.isArray(p.aliases) || p.aliases.some((x) => typeof x !== 'string'))) ||
              (p.designation_history != null && (!Array.isArray(p.designation_history) ||
                p.designation_history.some((x) => !x || typeof x.designation !== 'string')));
          })) {
        throw new Error('Source data does not match this catalog.');
      }
      CAT_PROV = candidate;
      return candidate;
    } finally {
      clearTimeout(timer);
    }
  })();
  try { return await catalogProvenanceRequest; }
  finally { catalogProvenanceRequest = null; }
}

function catalogSourceHTML(o) {
  const p = CAT_PROV?.objects?.[o.id];
  if (!p) return `<dt>Catalog source</dt><dd>${o.custom ? 'Custom target saved in this browser' : 'Expand details to load source information'}</dd>`;
  return `<dt>Catalog source</dt><dd title="${esc(p.source_version || 'unknown')}">${esc(p.source)} · ${esc(p.source_file || '')}</dd>
    <dt>Aliases</dt><dd>${p.aliases?.length ? esc(p.aliases.join(' · ')) : '—'}</dd>
    <dt>Designation history</dt><dd>${p.designation_history?.length ? esc(p.designation_history.map((x) => x.designation).join(' → ')) : '—'}</dd>`;
}

async function showCatalogSource(o, container) {
  if (o.custom || CAT_PROV) { container.innerHTML = catalogSourceHTML(o); return; }
  container.innerHTML = '<dt>Catalog source</dt><dd role="status">Loading source information…</dd>';
  try {
    await loadCatalogProvenance();
    if (container.isConnected && S.detailId === o.id) container.innerHTML = catalogSourceHTML(o);
  } catch {
    if (!container.isConnected || S.detailId !== o.id) return;
    container.innerHTML = '<dt>Catalog source</dt><dd><span role="status">Source information could not be loaded. Planning is available.</span> <button class="btn small" type="button">Retry source information</button></dd>';
    container.querySelector('button').addEventListener('click', () => showCatalogSource(o, container));
  }
}

async function downloadCatalogProvenance(ev) {
  const button = ev?.currentTarget;
  if (button) { button.disabled = true; button.textContent = 'Loading sources…'; }
  let payload;
  try {
    payload = await loadCatalogProvenance();
  } catch {
    announceStatus('Source information could not be loaded. Try Download provenance again.');
    if (button?.isConnected) { button.disabled = false; button.textContent = 'Retry provenance download'; }
    return;
  }
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
  if (button?.isConnected) { button.disabled = false; button.textContent = 'Download provenance'; }
}

/** Compute visibility for every row of the current filter (background chunks),
 *  then re-render so the min-visibility gate and the % sort see the whole list.
 *
 *  Batched through core's `nightStatsBatch`: ONE precession/frame setup per chunk
 *  instead of one per object, with the 14 ms budget still checked between chunks,
 *  so even advanced mode's 12k rows stay responsive (and finish in a few seconds
 *  rather than tens). */
let catalogWarm = null;
let catalogPageGeneration = 0;

function cancelCatalogWarm() {
  if (!catalogWarm) return;
  clearTimeout(catalogWarm.timer);
  catalogWarm = null;
  busy(false);
  const status = document.querySelector('#pct-status');
  if (status) status.textContent = '';
}

function warmPct(list, g) {
  if (!(g.jd1 > g.jd0) || !list.length) return;
  const prefix = obsKey(g, '');
  if (catalogWarm && (catalogWarm.epoch !== obsEpoch || catalogWarm.prefix !== prefix)) cancelCatalogWarm();
  const job = catalogWarm || { epoch: obsEpoch, prefix, pending: [], queued: new Set(), i: 0, timer: null };
  for (const o of list) {
    if (!obsCache.has(obsKey(g, o.id)) && !job.queued.has(o.id)) {
      job.pending.push(o);
      job.queued.add(o.id);
    }
  }
  if (!job.pending.length || catalogWarm) return;
  catalogWarm = job;
  busy(true, 'computing visibility…');
  const tick = () => {
    if (catalogWarm !== job) return;
    if (job.epoch !== obsEpoch || S.view !== 'catalog') { cancelCatalogWarm(); return; }
    const t0 = performance.now();
    while (job.i < job.pending.length && performance.now() - t0 < 12) {
      // Small shared-core batches bound work between yields on slower CPUs.
      // Page fills may already have computed some queued objects.
      const chunk = job.pending.slice(job.i, job.i + 32)
        .filter((o) => !obsCache.has(obsKey(g, o.id)));
      if (chunk.length) {
        const stats = nightStatsBatch(chunk, g.jd0, g.jd1, g.step, g.minAlt,
                                      g.pano, g.lat, g.lon);
        chunk.forEach((o, k) => obsCache.set(obsKey(g, o.id),
          cacheNightSummary(stats[k])));
      }
      job.i = Math.min(job.i + 32, job.pending.length);
    }
    const status = document.querySelector('#pct-status');
    if (status) status.textContent = `computing visibility… ${Math.round(100 * job.i / job.pending.length)}%`;
    if (job.i < job.pending.length) job.timer = setTimeout(tick, 0);
    else {
      cancelCatalogWarm();
      // only repaint if the catalog is still the visible view - otherwise this
      // stale chunk overwrote whatever the user had switched to
      if (S.view === 'catalog') renderCatalog();
    }
  };
  // Return the first table to the browser before doing full-pool astronomy.
  job.timer = setTimeout(tick, 0);
}

/** Lazily compute and fill the "% tonight" column for the current page. */
function fillPctCells(objs, g) {
  const epoch = obsEpoch;
  const generation = ++catalogPageGeneration;
  if (!(g.jd1 > g.jd0) || !objs.length) return;
  const tick = () => {
    if (epoch !== obsEpoch || generation !== catalogPageGeneration || S.view !== 'catalog') return;
    const missing = objs.filter((o) => !obsCache.has(obsKey(g, o.id)));
    if (missing.length) {
      const stats = nightStatsBatch(missing, g.jd0, g.jd1, g.step, g.minAlt, g.pano, g.lat, g.lon);
      missing.forEach((o, k) => obsCache.set(obsKey(g, o.id),
        cacheNightSummary(stats[k])));
    }
    for (const o of objs) {
      const key = obsKey(g, o.id);
      const v = obsCache.get(key);
      const cell = document.querySelector(`#view td[data-objid="${escAttr(o.id)}"]`);
      if (cell) cell.textContent = `${v.pct}%`;
      const bestCell = cell?.closest('tr')?.querySelector('.best-window');
      if (bestCell) { bestCell.textContent = catalogBestWindow(v.night); bestCell.title = bestCell.textContent; }
    }
  };
  setTimeout(tick, 0);
}

/* ------------------------------ detail ----------------------------- */

let detailReturnFocus = null;
let detailGeneration = 0;
let detailGraphRedraw = null;
let detailTimeFrame = null;
let detailDockScrollListener = null;
let detailDockScrollFrame = null;

// Layout rectangles alone do not establish focusability: Chromium can report
// them for links inside closed disclosures. Use the same rule for traps/restore.
function reachableControl(el) {
  if (!el?.isConnected || el.closest('[hidden], [inert], .hidden, .vhidden') ||
      el.matches(':disabled') || !el.getClientRects().length) return false;
  const style = getComputedStyle(el);
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  for (let parent = el.parentElement; parent; parent = parent.parentElement) {
    if (parent.matches('details:not([open])')) {
      const summary = parent.querySelector(':scope > summary');
      if (!summary?.contains(el)) return false;
    }
  }
  return true;
}

function dialogStops(dialog) {
  return [...dialog.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]')]
    .filter((el) => el.tabIndex >= 0 && reachableControl(el));
}

// Tonight and Catalog refreshes (scrub, the 60 s timer, a late boot pass)
// replace their rows while a card is open. A detached opener is mapped to the
// same control in the same target's live row, so focus returns to it instead
// of falling back to the tab bar.
function liveEquivalent(el) {
  if (!el || el.isConnected) return el;
  const row = el.closest('tr[data-tonight-id], tr[data-id]');
  if (!row) return el;
  const attr = row.hasAttribute('data-tonight-id') ? 'data-tonight-id' : 'data-id';
  const classes = [...el.classList].map((c) => '.' + CSS.escape(c)).join('');
  return document.querySelector(`tr[${attr}="${CSS.escape(row.getAttribute(attr))}"] `
    + el.localName + classes) || el;
}

function restoreControlFocus(opener) {
  const target = reachableControl(opener) ? opener : $(`#tab-${S.view}`);
  target?.focus({ preventScroll: true });
}

function syncDialogBackground() {
  const modal = $('#modal');
  const active = !modal.hidden && !!modal.querySelector('[role="dialog"][aria-modal="true"]');
  document.querySelectorAll('.topbar, #tabs, #view, .foot').forEach((el) => { el.inert = active; });
  if (active && !modal.contains(document.activeElement)) {
    modal.querySelector('.modal h2[tabindex], .modal .close')?.focus({ preventScroll: true });
  }
}

function installDialogKeyboard() {
  // Installed before the first-run welcome, so it follows the same contract.
  document.addEventListener('keydown', (ev) => {
    const dialog = $('#modal:not([hidden]) [role="dialog"][aria-modal="true"]');
    if (!dialog || ev.key !== 'Tab') return;
    const stops = dialogStops(dialog);
    if (!stops.length) { ev.preventDefault(); dialog.focus(); return; }
    const first = stops[0], last = stops.at(-1), cur = document.activeElement;
    if (ev.shiftKey && (cur === first || !stops.includes(cur))) {
      ev.preventDefault(); last.focus();
    } else if (!ev.shiftKey && (cur === last || !stops.includes(cur))) {
      ev.preventDefault(); first.focus();
    }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const modal = $('#modal:not([hidden])');
    const close = modal?.querySelector('.modal .close, #w-skip');
    if (!close) return;
    ev.preventDefault(); ev.stopPropagation(); close.click();
  });
}

function announceStatus(message) {
  const status = $('#plannerStatus');
  if (status) status.textContent = message;
}

function setPopoverOpen(button, panel, open, restoreFocus = false) {
  if (open) {
    for (const [bid, pid] of [['btnMenu', 'menuPanel'], ['btnWeather', 'weatherPanel']]) {
      if (pid !== panel.id) setPopoverOpen($('#' + bid), $('#' + pid), false);
    }
  }
  panel.classList.toggle('hidden', !open);
  button.setAttribute('aria-expanded', String(open));
  if (!open && restoreFocus) button.focus({ preventScroll: true });
}

function wirePopover(button, panel, onOpen = () => {}) {
  button.addEventListener('click', () => {
    const open = panel.classList.contains('hidden');
    setPopoverOpen(button, panel, open);
    if (open) onOpen();
  });
  document.addEventListener('click', (ev) => {
    if (!panel.contains(ev.target) && !button.contains(ev.target)) setPopoverOpen(button, panel, false);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || panel.classList.contains('hidden')) return;
    ev.preventDefault(); setPopoverOpen(button, panel, false, true);
  });
  panel.parentElement.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!panel.contains(document.activeElement) && document.activeElement !== button) {
        setPopoverOpen(button, panel, false);
      }
    });
  });
}

/* ---- WEB-REV-003 selection/inspector state contract ----------------------
 * `S.detailId` is the ONE authoritative selected-target identity shared by
 * Tonight, Catalog and Sky View; `S.detailOpen` is the ONLY evidence that the
 * inspector is showing. Ownership:
 *   - selectTarget() / clearSelection() are the only writers of `S.detailId`;
 *   - openDetail() / closeDetail() are the only writers of `S.detailOpen`;
 *   - every highlight (ranked rows, catalog rows, Sky rail, Tonight overview)
 *     is derived from `S.detailId` via applySelectionHighlight()/draws.
 * A filtered-out target stays selected (filters never write selection); a
 * target that left the authoritative catalog (byId) is dropped everywhere and
 * its inspector closes. */
function applySelectionHighlight() {
  const id = S.detailId;
  document.querySelectorAll("#tonight-rank-table tr, .cat-results table tr")
    .forEach((row) => row.classList.toggle("selected",
      !!id && (row.dataset.tonightId === id || row.dataset.id === id)));
}

function selectTarget(id) {
  const next = id && byId.has(id) ? id : null;
  if (S.detailId !== next) S.detailId = next;
  applySelectionHighlight();
  return S.detailId;
}

/** The selected object was deleted or left the catalog: the identity is
 *  invalid, so it AND its inspector go together (never a headless stale id). */
function clearSelection() {
  S.detailId = null;
  if (S.detailOpen) closeDetail();
  applySelectionHighlight();
}

/** Invalid selections are cleared; FILTERED-OUT targets are not - they remain
 *  selected with truthful facts until they genuinely disappear from byId. */
function dropSelectionIfGone() {
  if (S.detailId && !byId.has(S.detailId)) clearSelection();
}

function targetDetailDocked() {
  return S.view !== 'sky' && S.view !== 'horizon' && window.innerWidth >= 1100;
}

function parkDetailModal() {
  const modal = $('#modal');
  if (modal && modal.parentElement !== document.body) document.body.append(modal);
}

function syncSkyDetailPlaceholder() {
  const empty = $('#sky-detail-empty');
  if (!empty) return;
  empty.hidden = S.detailOpen;
  const target = S.detailId && byId.get(S.detailId);
  const unplotted = target && !skyItems.some(item => item.id === target.id);
  const note = 'Not plotted on the chart at the selected time or magnitude limit.';
  const plotNote = $('#m-plot-note');
  if (plotNote) { plotNote.hidden = !unplotted; plotNote.textContent = unplotted ? note : ''; }
  if (S.detailOpen) return;
  empty.innerHTML = target
    ? `<button type="button" class="btn small" id="sky-selected-detail">Open ${esc(target.primary_name)} details</button>${unplotted ? `<p class="sub">${note}</p>` : ''}`
    : '<p class="sub">Select a target on the chart to open its details.</p>';
  $('#sky-selected-detail')?.addEventListener('click', ev => openDetail(target.id, ev.currentTarget));
}

function updateDetailSelectedTime() {
  // WEB-REV-003: `S.detailId` alone is no longer evidence of an open inspector.
  if (!S.detailOpen) return;
  const o = S.detailId && byId.get(S.detailId);
  const position = $('#m-selected-position');
  const moon = $('#m-selected-separation');
  const reasonEl = $('#m-selected-visibility');
  if (!o || !position || !moon || !reasonEl) return;
  const jd = E.julianDay(S.skyTime);
  const { lat, lon } = S.site;
  const [alt, az] = E.altaz(o.ra_hours * 15, o.dec_deg, jd, lat, lon);
  const [moonAlt, moonAz] = E.moonAltAz(jd, lat, lon);
  const separation = E.sepDeg(alt, az, moonAlt, moonAz);
  const win = cachedNightWindow();
  const inNight = S.skyTime >= win.startT && S.skyTime < win.endT;
  const reason = panoramaVisibilityReason(Hor.activeHorizon(), alt, az, Hor.effectiveMinAlt(), inNight);
  const reasonText = reason === 'visible' ? 'visible above minimum altitude' :
    reason === 'blocked_by_horizon' ? 'blocked by horizon' :
      reason === 'below_minimum_altitude' ? 'below minimum altitude' :
        reason === 'below_horizon' ? 'below horizon' : 'outside dusk-to-dawn window';
  position.textContent = `${fmtClock(S.skyTime)} · alt ${alt.toFixed(1)}°, az ${az.toFixed(0)}°`;
  moon.textContent = `${Math.round(separation)}°`;
  reasonEl.textContent = reasonText;
}

function updateDetailDockTop() {
  const modal = $('#modal');
  if (!S.detailOpen || modal?.hidden || !modal?.classList.contains('detail-docked')) return;
  const visibleBottom = (el) => {
    if (!el || !el.getClientRects().length) return 0;
    const rect = el.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight ? rect.bottom : 0;
  };
  const top = Math.ceil(Math.max(0, visibleBottom($('.topbar')), visibleBottom($('#tabs'))));
  document.documentElement.style.setProperty('--detail-top', `${top}px`);
}

function stopDetailDockScrollTracking() {
  if (detailDockScrollListener) {
    window.removeEventListener('scroll', detailDockScrollListener, true);
    detailDockScrollListener = null;
  }
  if (detailDockScrollFrame !== null) {
    window.cancelAnimationFrame(detailDockScrollFrame);
    detailDockScrollFrame = null;
  }
}

function startDetailDockScrollTracking() {
  if (detailDockScrollListener) return;
  detailDockScrollListener = () => {
    if (detailDockScrollFrame !== null) return;
    detailDockScrollFrame = window.requestAnimationFrame(() => {
      detailDockScrollFrame = null;
      updateDetailDockTop();
    });
  };
  window.addEventListener('scroll', detailDockScrollListener, { passive: true, capture: true });
}

function syncDetailDock() {
  if (!S.detailOpen) return;
  const modal = $('#modal');
  const host = S.view === 'sky' && $('#sky-detail-host');
  const inline = !!host;
  if (inline) {
    if (modal.parentElement !== host) host.append(modal);
  } else parkDetailModal();
  const docked = targetDetailDocked();
  modal.classList.toggle('detail-inline', inline);
  modal.classList.toggle('detail-docked', docked);
  document.body.classList.toggle('detail-open', docked);
  const panel = modal.querySelector('.modal');
  if (panel) {
    panel.setAttribute('role', docked || inline ? 'complementary' : 'dialog');
    panel.setAttribute('aria-labelledby', 'm-title');
    if (docked || inline) panel.removeAttribute('aria-modal');
    else panel.setAttribute('aria-modal', 'true');
  }
  syncDialogBackground();
  syncSkyDetailPlaceholder();
  modal.onclick = (ev) => { if (!docked && !inline && ev.target === modal) closeDetail(); };
  modal.onkeydown = (ev) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopPropagation();
    closeDetail();
  };
  if (docked) {
    startDetailDockScrollTracking();
    updateDetailDockTop();
  } else {
    stopDetailDockScrollTracking();
    document.documentElement.style.removeProperty('--detail-top');
  }
}

function refreshOpenDetail() {
  // WEB-REV-003: only an OPEN inspector refreshes in place - a closed one stays
  // closed through every rerender and time change.
  if (!S.detailOpen) return;
  const id = S.detailId;
  if (!id || !byId.has(id)) { clearSelection(); return; }
  openDetail(id, null, { refresh: true });
}

function openDetail(id, opener = null, { refresh = false } = {}) {
  const o = byId.get(id);
  if (!o) return;
  if (!refresh) detailReturnFocus = opener || document.activeElement;
  const modal = $('#modal');
  const keepCatalogDetailsOpen = refresh && !!modal.querySelector('details.catalog-details')?.open;
  const focusedDetailId = refresh && modal.contains(document.activeElement)
    ? document.activeElement.id : null;
  const preserveImage = refresh && S.detailId === id ? $('#objimg-wrap') : null;
  const preserveCredit = preserveImage ? $('#d-imagecredit') : null;
  const generation = ++detailGeneration;
  // WEB-REV-003: opening the inspector selects the target through the ONE
  // identity writer (replacing any previous selection everywhere).
  selectTarget(id);
  const pano = Hor.activeHorizon();
  const { lat, lon } = S.site;
  const info = E.nightInfo(nightAnchor(), lat, lon, siteNoon(nightAnchor()));
  const jd = E.julianDay(S.skyTime);
  const [altNow, azNow] = E.altaz(o.ra_hours * 15, o.dec_deg, jd, lat, lon);
  // Rise, set and culmination describe the planned (coming) night: from the
  // site's noon on the selected date to the next site noon.
  const nightNoon = siteNoon(nightAnchor());
  const dayInfo = E.objectNightInfo(o.ra_hours * 15, o.dec_deg, nightNoon, nextSiteNoon(nightNoon), lat, lon);

  // Moon distance at the selected planner time + tonight's peak.
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
  const moonRow = (label, sep, illumination = illumNow) => {
    if (sep == null) return '';
    const a = Math.round(sep);
    const col = illumination < 0.15 ? 'var(--green)' : a >= 90 ? 'var(--green)' : a >= 45 ? 'var(--amber)' : 'var(--bad)';
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
        <h2 id="m-title" tabindex="-1">${esc(o.primary_name)}</h2>
        <span class="detail-favorite" id="m-session-fav" data-id="${esc(id)}" role="img" aria-label="Not a saved target">☆</span>
        <button class="close" id="m-close" title="close" aria-label="Close">✕</button>
      </div>
      <span class="tags">${tags}</span>
      <p id="m-plot-note" class="sub" hidden></p>
      <section class="detail-hero" aria-label="Target overview">
        <div id="objimg-wrap">
          <img class="objimg" id="d-img" alt="" style="display:none">
          <div class="objimg-ph" id="d-imgph" style="display:flex">loading Wikipedia photo…</div>
        </div>
        <div class="detail-hero-copy">
          <dl class="detail-hero-facts">
            <dt>Type</dt><dd><span style="color:${typeColor(o)}">●</span> ${esc(TYPE_LABELS[o.otype] || o.otype || "")}</dd>
            <dt>Magnitude</dt><dd>${o.vmag != null ? `${o.vmag.toFixed(1)} mag` : 'No catalog magnitude'}</dd>
            <dt>Size</dt><dd>${esc(fmtSizeU(o.size_am)) || '—'}</dd>
            <dt>Selected position</dt><dd id="m-selected-position">—</dd>
          </dl>
          <dl class="detail-visibility-facts">
            <dt>Visibility reason</dt><dd id="m-hero-visibility">Calculating…</dd>
            <dt>Usable interval</dt><dd id="m-hero-window">—</dd>
            <dt>Culmination</dt><dd>${fmtClock(dayInfo.transit)} · ${dayInfo.maxAlt.toFixed(0)}°</dd>
          </dl>
        </div>
      </section>
      <div class="tonight-box">
        <h3>Altitude tonight <span class="cat-count">(local time)</span></h3>
        <canvas id="graph" role="img" aria-label="Target altitude and visibility chart" aria-describedby="graphSummary"></canvas>
        <p id="graphSummary" class="visually-hidden" role="note">Altitude chart for the selected target.</p>
        <p class="detail-observable" id="d-obs" role="status" aria-live="polite">Calculating visibility for tonight…</p>
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
            ${pano ? `<span class="chart-legend-item"><i class="legend-swatch guide-obstruction"></i><span><b>Horizon</b><small>short dash${pano.overhangs?.length ? ' · overhang edge: dash-dot' : ''}</small></span></span>` : ''}
          </div>
        </div>
        <p class="win-note" id="win-note"></p>
      </div>
      <div class="detail-actions"><button class="btn small save-target" id="m-save-target" data-id="${esc(id)}" type="button">☆ Add to Tonight’s targets</button></div>
      <details class="catalog-details">
        <summary>Catalog details</summary>
        <dl class="meta">
          <dt>Constellation</dt><dd>${esc(o.constellation || '—')}</dd>
          <dt>RA / Dec (J2000)</dt><dd>${E.formatRA(o.ra_hours)} · ${E.formatDec(o.dec_deg)}</dd>
          <dt>Rise / set</dt><dd>${fmtClock(dayInfo.rise)} · ${fmtClock(dayInfo.set)}</dd>
          <dt>Visibility at selected time</dt><dd id="m-selected-visibility">—</dd>
          <dt>Moon separation at selected time</dt><dd id="m-selected-separation">—</dd>
          ${sepPeak != null ? moonRow('Moon dist @ culmination', sepPeak, E.moonIllumination(peakJd)) : ''}
        </dl>
        <dl class="meta" id="d-catalog-source">${catalogSourceHTML(o)}</dl>
        ${o.blurb ? `<p class="blurb">${esc(o.blurb)}</p>` : ''}
        <p class="blurb"><a class="wiki" id="d-wikilink" href="https://en.wikipedia.org/wiki/${encodeURIComponent(wiki.replace(/ /g, '_'))}" target="_blank" rel="noopener">Wikipedia ↗</a></p>
        <p class="blurb" id="d-imagecredit" hidden></p>
        ${o.custom ? '<button class="btn small" id="m-del" style="margin-top:10px" title="remove this custom target">Delete custom target</button>' : ''}
      </details>
    </div>`;
  if (preserveImage) modal.querySelector('#objimg-wrap')?.replaceWith(preserveImage);
  if (preserveCredit) modal.querySelector('#d-imagecredit')?.replaceWith(preserveCredit);
  modal.hidden = false;
  S.detailOpen = true;   // WEB-REV-003: explicit inspector visibility
  const catalogDetails = modal.querySelector('details.catalog-details');
  const sourceContainer = modal.querySelector('#d-catalog-source');
  catalogDetails.addEventListener('toggle', () => {
    if (catalogDetails.open) showCatalogSource(o, sourceContainer);
  });
  catalogDetails.open = keepCatalogDetailsOpen;
  syncDetailDock();
  updateDetailSelectedTime();
  if (refresh && focusedDetailId) {
    const focusedAgain = document.getElementById(focusedDetailId);
    if (focusedAgain && modal.contains(focusedAgain)) focusedAgain.focus({ preventScroll: true });
  } else if (!refresh) $('#m-title').focus();
  $('#m-close').addEventListener('click', closeDetail);
  const saveButton = modal.querySelector('#m-save-target');
  if (saveButton) {
    updateSavedTargetButton(saveButton, savedTargetIds().includes(id));
    saveButton.addEventListener('click', () => {
      const ids = new Set(savedTargetIds());
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      const on = saveTargetIds([...ids]).has(id);
      updateSavedTargetButton(saveButton, on);
      if (S.view === 'catalog') {
        const rowButton = document.querySelector(`[data-save-target="${escAttr(id)}"]`);
        if (rowButton) { rowButton.classList.toggle('on', on); rowButton.textContent = on ? '★' : '☆'; }
        if (S.cat.savedOnly) renderCatalog();
      }
    });
  }
  wireDetailExtras(modal, o);

  // Reuse the browser photo cache or fetch a Wikipedia thumbnail directly.
  const dImg = $('#d-img');
  const dPh = $('#d-imgph');
  const dCredit = $('#d-imagecredit');
  if (!preserveImage) loadWikiThumb(o, dImg, dPh, dCredit);

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
    fallbackStartMs: siteClock(nightAnchor(), 20).getTime(),
    fallbackEndMs: siteClock(nightAnchor(), 4, 1).getTime(),
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
    const reason = panoramaVisibilityReason(pano, alt, az, minAlt);
    samples.push({
      t: jdt, alt, az, ceil,
      vis, reason,
      state: ({ below_horizon: 'below', blocked_by_horizon: 'blocked', below_minimum_altitude: 'warn', visible: 'clear' })[reason],
      mAlt,
    });
  }
  const tStart = new Date(t0.getTime());
  const tEnd = new Date(t1.getTime());
  const durMs = tEnd - tStart;

  // The wider chart grid is visual context only. All usable intervals and
  // durations come from the same dusk-anchored scoring grid as the other views.
  const detailWin = nightWindow();
  const detailStats = nightStats(o, detailWin.jd0, detailWin.jd1,
    detailWin.step, minAlt, pano, lat, lon);
  const detailSummary = {
    reason: detailStats.visibilityReason,
    visibleMinutes: detailStats.visibleMinutes,
  };
  const hasBest = detailStats.bestEnd != null && detailStats.bestEnd > detailStats.bestStart;
  const bestStartDate = hasBest ? E.dateFromJD(detailStats.bestStart) : null;
  const bestEndDate = hasBest ? E.dateFromJD(detailStats.bestEnd) : null;
  const bestWindowText = hasBest
    ? `${fmtClock(bestStartDate)}–${fmtClock(bestEndDate)}` : '';
  const winNote = hasBest
    ? `Best window (clear, ≥${minAlt.toFixed(0)}°): ${bestWindowText}`
    : 'No clear window tonight';
  $('#win-note').textContent = winNote;
  const detailReasonText = (reason) => {
    if (reason === 'visible') return `visible for ${fmtDur(detailSummary.visibleMinutes)}`;
    if (reason === 'blocked_by_horizon') return 'blocked because of horizon';
    if (reason === 'below_minimum_altitude') return 'below minimum altitude';
    if (reason === 'outside_selected_window') return 'outside the selected window';
    if (reason === 'never_rises') return 'never rises in this window';
    return 'no usable visibility interval';
  };
  const heroReason = $('#m-hero-visibility');
  if (heroReason) heroReason.textContent = detailReasonText(detailSummary.reason);
  const heroWindow = $('#m-hero-window');
  if (heroWindow) {
    heroWindow.textContent = hasBest ? bestWindowText : 'No clear interval tonight';
  }
  const obsEl = $('#d-obs');
  if (obsEl) {
    const usable = hasBest ? ` · usable ${bestWindowText}` : '';
    obsEl.textContent = `${detailReasonText(detailSummary.reason)}${usable} · culmination ${fmtClock(dayInfo.transit)} at ${dayInfo.maxAlt.toFixed(0)}° (min ${minAlt.toFixed(0)}°${pano ? ` + horizon "${esc(pano.name)}"` : ''})`;
  }

  const g = $('#graph');
  const gCtx = g.getContext('2d');
  const H = Math.max(200, g.clientHeight || 260), padL = 34, padR = 10, padT = 12, padB = 22;
  let W = 0;
  function sizeG() {
    W = g.clientWidth;
    if (!W) return;
    const dpr = window.devicePixelRatio || 1;
    g.width = Math.round(W * dpr); g.height = H * dpr;
    gCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeG();
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
      const usable = hasBest
        ? ` Usable interval ${fmtClock(bestStartDate)} to ${fmtClock(bestEndDate)}.` : '';
      summary.textContent = `${name} altitude chart. Maximum altitude ${dayInfo.maxAlt.toFixed(1)} degrees at ${fmtClock(dayInfo.transit)}; ${reason}. Selected time ${fmtClock(S.skyTime)}, altitude ${samples[Math.max(0, Math.min(steps, Math.round(((S.skyTime.getTime() - tStart.getTime()) / durMs) * steps)))].alt.toFixed(1)} degrees.${usable}`;
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
    if (hasBest) {
      const x1 = xOf(bestStartDate.getTime() - tStart.getTime());
      const x2 = xOf(bestEndDate.getTime() - tStart.getTime());
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
    const selectedElapsed = Math.max(0, Math.min(durMs, S.skyTime.getTime() - tStart.getTime()));
    const selectedIndex = Math.max(0, Math.min(steps, Math.round((selectedElapsed / durMs) * steps)));
    const selectedSample = samples[selectedIndex];
    const selectedX = xOf(selectedElapsed), selectedY = yOf(selectedSample.alt);
    gCtx.strokeStyle = C.targetSelected; gCtx.lineWidth = 1.5; gCtx.setLineDash([3, 3]);
    gCtx.beginPath(); gCtx.moveTo(selectedX, padT); gCtx.lineTo(selectedX, H - padB); gCtx.stroke();
    gCtx.setLineDash([]); gCtx.fillStyle = C.targetSelected; gCtx.beginPath();
    gCtx.arc(selectedX, selectedY, 4, 0, Math.PI * 2); gCtx.fill();
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
  detailGraphRedraw = () => {
    if (generation !== detailGeneration || !S.detailOpen || S.detailId !== id || modal.hidden) return;
    sizeG();
    drawGraph();
  };
  g.addEventListener('mousemove', (ev) => {
    const r = g.getBoundingClientRect();
    const plotW = W - padL - padR;
    let ms = (ev.clientX - r.left - padL) / plotW * durMs;
    ms = Math.max(0, Math.min(durMs, ms));
    drawGraph(ms);
  });
  g.addEventListener('mouseleave', () => { tip.hidden = true; drawGraph(); });
  if (S.detailResize) window.removeEventListener('resize', S.detailResize);
  S.detailResize = () => {
    if (generation !== detailGeneration || !S.detailOpen || S.detailId !== id || modal.hidden) return;
    syncDetailDock(); sizeG(); drawGraph();
  };
  window.addEventListener('resize', S.detailResize);
}

function closeDetail({ restoreFocus = true } = {}) {
  // WEB-REV-003: closing only hides the inspector. `S.detailId` (the selected
  // target identity) and its highlighting SURVIVE, so switching views and
  // reopening the object keep working from the preserved identity.
  detailGeneration++;
  S.detailOpen = false;
  stopDetailDockScrollTracking();
  const modal = $('#modal');
  modal.hidden = true;
  modal.innerHTML = '';
  modal.classList.remove('detail-docked', 'detail-inline');
  parkDetailModal();
  modal.onclick = null;
  modal.onkeydown = null;
  syncDialogBackground();
  document.body.classList.remove('detail-open');
  document.documentElement.style.removeProperty('--detail-top');
  applySelectionHighlight();   // keeps the selected rows highlighted
  if (currentObjUrl) { URL.revokeObjectURL(currentObjUrl); currentObjUrl = null; }
  tip.hidden = true;
  if (S.detailResize) window.removeEventListener('resize', S.detailResize);
  detailGraphRedraw = null;
  if (detailTimeFrame !== null) cancelAnimationFrame(detailTimeFrame);
  detailTimeFrame = null;
  syncSkyDetailPlaceholder();
  if (!restoreFocus) return;
  const opener = liveEquivalent(detailReturnFocus);
  const target = reachableControl(opener) ? opener
    : S.view === 'sky' ? $('#sky-selected-detail') || $('#sky') : opener;
  detailReturnFocus = null;
  restoreControlFocus(target);
}

/* ---- detail extras (custom-target delete) ---- */

function wireDetailExtras(modal, o) {
  if (!o.custom) return;
  const del = modal.querySelector('#m-del');
  if (del) del.onclick = async () => {
    if (!(await WS.deleteTargetRec(o.id))) { alert('Could not delete the target. Your data is unchanged.'); return; }
    CAT = CAT.filter((x) => x.id !== o.id);
    byId.delete(o.id);
    searchCache.delete(o);
    // WEB-REV-003: the object is GONE from the authoritative catalog, so its
    // selection is invalid: clear the identity and close its inspector. Then
    // repaint the CURRENT view - never swap an unrelated view's body in.
    clearSelection();
    if (S.cat.chip === 'custom') S.cat.chip = 'all';
    refreshView();
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

function syncTopPrefs() {
  const p = Hor.getPrefs();
  const eff = Hor.effectiveMinAlt();
  const mua = $('#tb-minalt'), muaV = $('#tb-minalt-val'), note = $('#tb-note');
  if (mua) mua.value = String(eff);
  if (mua) mua.setAttribute('aria-valuetext', `${eff} degrees`);
  if (muaV) muaV.textContent = eff + '°';
  if (note) note.textContent = p.minAlt == null ? 'auto (bortle)' : 'explicit';
}

function refreshMenuUI() {
  const prefs = Hor.getPrefs();
  const edge = $('#edgeSpace'), edgeV = $('#edgeSpaceVal');
  if (edge) edge.value = String(Number.isFinite(prefs.edge) ? prefs.edge : 16);
  if (edgeV) edgeV.innerHTML = `${Number.isFinite(prefs.edge) ? prefs.edge : 16}&nbsp;px`;
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
  const wx = $('#wxAuto'); if (wx) wx.checked = !!prefs.weatherAuto;
}

function savePreferencePatch(patch) {
  if (Hor.setPrefs(patch)) return true;
  syncTopPrefs(); refreshMenuUI();
  const minvis = $('#cat-minvis'), minvisV = $('#cat-minvis-v');
  if (minvis) minvis.value = String(minVis());
  if (minvisV) minvisV.textContent = minVis() ? minVis() + '%' : 'off';
  alert('Could not save this setting. Your previous setting is unchanged.');
  return false;
}

function applyEdge() {
  const e = Hor.getPrefs().edge;
  document.documentElement.style.setProperty('--edge', (Number.isFinite(e) ? e : 16) + 'px');
}

function refreshView(immediate = false) {
  // a site/date change can move the scrub window out from under the selected
  // time - pull it back in BEFORE rendering so the heading never shows a
  // daylight instant outside the window
  clampSkyTime();
  renderNightInfo();
  // Tonight recomputes SILENTLY here: pref/filter changes keep the current
  // cards on screen and swap in fresh ones when done (no blank frame).
  if (S.view === 'tonight') return renderTonight(true, immediate);
  else if (S.view === 'sky') return renderSky();
  else if (S.view === 'catalog') return renderCatalog();
  else return renderHorizonView();
}

/** Merge or update a custom target in the catalog (and detail/byId maps). */
function upsertTarget(t) {
  t.custom = true;
  const existing = byId.get(t.id);
  if (existing) { Object.assign(existing, t); searchCache.delete(existing); }
  else { CAT.push(t); byId.set(t.id, t); }
}

/** Make CAT/byId's custom targets match the STORE exactly.
 *
 *  WE-04 (0.6.32 review): a backup import REPLACES the custom-target records, but
 *  the old code only ADDED what it read back (`upsertTarget`), so a custom the
 *  bundle dropped stayed in CAT/byId - still listed, searchable, drawn on the sky
 *  chart and openable from the detail view until a page reload, while Setup
 *  showed the truth. Remove what is no longer stored, then add/update. */
function syncCustomTargets(stored, options) {
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
  // WEB-REV-003: a backup import REPLACES the custom targets - a selection
  // whose object did not survive the replacement is invalid.
  dropSelectionIfGone();
  const cleanedSaved = savedTargetIds();
  if (JSON.stringify(cleanedSaved) !== JSON.stringify(Hor.getPrefs().savedTargetIds || [])) {
    if (!Hor.setPrefs({ savedTargetIds: cleanedSaved }) && options?.strict) {
      throw new Error('could not save restored target selections');
    }
  }
}

const objName = (o) => o.primary_name || o.id;

/** Setup dialog — tabs mirror the desktop app: Sites / Rigs / Targets / Backup.
 *  The open tab survives a re-render (save/delete re-renders the whole dialog). */
let SETTINGS_TAB = 'sites';
let settingsReturnFocus = null;
let userDataBusy = false;

function lockUserDataTransfer() {
  userDataBusy = true;
  const controls = [...$('#modal').querySelectorAll('button, input, select, textarea')]
    .map((control) => [control, control.disabled]);
  for (const [control] of controls) control.disabled = true;
  return () => {
    for (const [control, disabled] of controls) control.disabled = disabled;
    userDataBusy = false;
  };
}

function showMTab(name) {
  SETTINGS_TAB = name;
  const modal = $('#modal');
  if (!modal) return;
  modal.querySelectorAll('.modal-tabs .tab').forEach((b) => {
    const on = b.dataset.mtab === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
    b.id = `set-tab-${b.dataset.mtab}`;
    b.setAttribute('aria-controls', `mtab-${b.dataset.mtab}`);
  });
  modal.querySelectorAll('.mtabpane').forEach((p) => {
    p.classList.toggle('hidden', p.id !== 'mtab-' + name);
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', p.id.replace('mtab-', 'set-tab-'));
  });
}

/** Re-read rigs and rebuild the topbar picker. WB3 (review): this used to run
 *  only at boot, so a rig added/edited in Setup (or restored from a backup)
 *  was invisible to the picker and to frame coverage until a reload. */
async function reloadRigs(options) {
  const rigs = await WS.getRigs(options);
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
    if (!rsSel.value && want && !Hor.setPrefs({ activeRigId: '' }) && options?.strict) {
      throw new Error('could not save the restored rig preference');
    }
  }
}

async function renderSettings() {
  const wasClosed = $('#modal').hidden;
  if (wasClosed || S.detailOpen) settingsReturnFocus = reachableControl(document.activeElement)
    ? document.activeElement : $('#btnMenu');
  // WEB-REV-003: #modal is shared - taking it over for Setup must close the
  // inspector (the selected identity is preserved) instead of leaving stale
  // "detail open" state that a later refresh could wrongly revive.
  if (S.detailOpen) closeDetail({ restoreFocus: false });
  parkDetailModal();
  await reloadRigs();  // WB3: rig edits must show up without a reload
  const modal = $('#modal');
  const sites = await WS.getSites();
  SITES = sites;
  const rigs = await WS.getRigs();
  const targets = await WS.getTargets();
  const active = activeSite();

  const siteRow = (s) => `
    <li data-id="${esc(s.id)}">
      <input type="radio" name="site-active" ${active && s.id === active.id ? 'checked' : ''} aria-label="Use ${esc(s.name)} for planning">
      <span class="p-name">${esc(s.name)}</span>
      <span class="p-tags">${s.lat.toFixed(3)}, ${s.lon.toFixed(3)} · ${s.elev || 0} m${s.tz ? ` · ${esc(s.tz)}` : ''}</span>
      <button class="btn small" data-editsite="${esc(s.id)}" aria-label="Edit site ${esc(s.name)}">edit</button>
      <button class="btn small" data-delsite="${esc(s.id)}" aria-label="Delete site ${esc(s.name)}">✕</button>
    </li>`;
  const rigRow = (r) => `
    <li data-id="${esc(r.id)}">
      <span class="p-name">${esc(r.name)}</span>
      <span class="p-tags">${r.focal_mm ? `${r.focal_mm} mm` : '—'}</span>
      <button class="btn small" data-editrig="${esc(r.id)}" aria-label="Edit rig ${esc(r.name)}">edit</button>
      <button class="btn small" data-delrig="${esc(r.id)}" aria-label="Delete rig ${esc(r.name)}">✕</button>
    </li>`;
  const targetRow = (t) => `
    <li data-id="${esc(t.id)}">
      <span class="p-name">${esc(t.primary_name)}</span>
      <span class="p-tags">${esc(TYPE_LABELS[t.otype] || t.otype || "")} · RA ${E.formatRA(t.ra_hours)}, Dec ${E.formatDec(t.dec_deg)}${t.vmag != null ? ` · mag ${t.vmag.toFixed(1)}` : ''}</span>
      <button class="btn small" data-edittarget="${esc(t.id)}" aria-label="Edit target ${esc(t.primary_name)}">edit</button>
      <button class="btn small" data-deltarget="${esc(t.id)}" aria-label="Delete target ${esc(t.primary_name)}">✕</button>
    </li>`;

  modal.innerHTML = `
    <div class="modal settings" role="dialog" aria-modal="true" aria-labelledby="m-set-title">
      <div class="modal-head">
        <h2 id="m-set-title" tabindex="-1">Setup</h2>
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
              <span class="sub" id="sf-quick-note" role="status" style="align-self:center"></span>
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
            <label>Elevation (m, metadata) <input type="text" inputmode="decimal" id="sf-site-elev" value="0" aria-describedby="sf-elevation-note"></label>
            <p class="sub" id="sf-elevation-note">Recorded for this site. Elevation does not change visibility; use Horizon to describe local obstructions.</p>
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
            <p class="sub" id="sf-rig-fov" role="status"></p>
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
            <p class="sub" id="sf-target-err" role="alert"></p>
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
            <button class="btn" id="set-import-trigger">⬆ Import backup</button>
            <input type="file" id="set-import" accept="application/json,.json" class="vhidden" hidden tabindex="-1">
          </div>
          <p class="sub" style="margin-top:8px">Free space per side lives in the hamburger menu under <b>Display</b>.</p>
        </div>
      </div>
    </div>`;
  modal.hidden = false;
  showMTab(SETTINGS_TAB);
  syncDialogBackground();
  $('#m-set-title').focus({ preventScroll: true });

  $('#m-close').addEventListener('click', closeModal);
  modal.onclick = (ev) => { if (ev.target === modal) closeModal(); };
  // tab strip (desktop parity: Sites / Rigs / Targets / Backup)
  modal.querySelectorAll('.modal-tabs .tab').forEach((b) => {
    b.addEventListener('click', () => showMTab(b.dataset.mtab));
    b.addEventListener('keydown', (ev) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
      ev.preventDefault();
      const tabs = [...modal.querySelectorAll('.modal-tabs .tab')];
      const i = tabs.indexOf(b);
      const next = ev.key === 'Home' ? tabs[0] : ev.key === 'End' ? tabs.at(-1)
        : tabs[(i + (ev.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      showMTab(next.dataset.mtab); next.focus();
    });
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
      const next = { ...rec, lat, lon };
      if (!(await WS.saveSiteRec(next))) {
        if (qnote) qnote.textContent = 'Could not save coordinates. Your site is unchanged.';
        return;
      }
      Object.assign(rec, next);
      applyActiveSite(next);
    } else {
      S.site = { ...S.site, lat, lon };
    }
    announcePlannerChange('site', { cause: 'site-edit', siteId: rec ? rec.id : null });
    refreshWeatherForSite();
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
    if (!(await WS.deleteSiteRec(s.id))) { alert('Could not delete the site. Your data is unchanged.'); return; }
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
    if (!(await WS.deleteRigRec(rigId))) { alert('Could not delete the rig. Your data is unchanged.'); return; }
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
    if (!(await WS.deleteTargetRec(t.id))) { alert('Could not delete the target. Your data is unchanged.'); return; }
    const rec = byId.get(t.id) || t;
    CAT = CAT.filter((x) => x.id !== t.id);
    byId.delete(t.id);
    searchCache.delete(rec);
    dropSelectionIfGone();   // WEB-REV-003: deleted object -> selection cleared
    closeModal(); refreshView();
  }));
  $('#set-add-target').addEventListener('click', () => openTargetForm(null));

  // — backup / transfer —
  $('#set-export').addEventListener('click', async () => {
    if (userDataBusy) return;
    const finish = lockUserDataTransfer();
    // truthful backup: horizon photos are embedded, hasPhoto matches the data
    try {
      const backup = await WS.collectBackup(Hor.getPrefs(),
        await Hor.exportHorizonsWithPhotos(), WS.currentTheme());
      if (!WS.downloadText(`nightseam-web-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 1))) {
        throw new Error('could not start the download');
      }
    } catch (err) { alert('Export failed: ' + err.message); }
    finally { finish(); }
  });

  // Apply a full web snapshot: records + horizons + prefs + theme. Used for
  // BOTH the incoming backup and the safety rollback, so the two paths cannot
  // diverge. `current` is committed to meta/safety atomically with the record
  // replacement; failures in the remaining stores or rendering restore it.
  // A malformed bundle throws before anything is destroyed.
  async function applyWebSnapshot(data, current, rollback = false, onRecordsCommitted = () => {}, editorHistory = null) {
    // Normalize the horizon payload BEFORE restoreBackup clears IndexedDB.
    // `stageBackup` validates the outer shape; this validates the actual editor
    // record contract and turns the staged bundle into one complete model.
    const norm = Hor.normalizeHorizons(WS.backupHorizonSection(data));
    if (!norm) throw new Error('missing horizon section or malformed horizon data');
    // A rollback re-normalizes `current` the same way; prove it can before any
    // record is replaced, or a failed import could not be undone.
    if (!rollback && current && !Hor.normalizeHorizons(WS.backupHorizonSection(current))) {
      throw new Error('your current horizons cannot be captured as a recovery copy, so nothing was changed');
    }
    const staged = WS.stageBackup({ ...data, horizons: norm });
    if (rollback) await WS.writeStaged(staged);
    else await WS.restoreBackup({ ...data, horizons: norm }, current);
    onRecordsCommitted();
    if (!(await Hor.applyHorizonsSnapshot(staged.horizons))) {
      throw new Error('saving horizons failed (storage full or unavailable)');
    }
    if (rollback && editorHistory && !Hor.restoreEditorHistory(editorHistory)) {
      throw new Error('could not recover the original horizon editor history');
    }
    if (!Hor.replacePrefs(staged.prefs || {})) throw new Error('saving preferences failed (storage full or unavailable)');
    if (staged.theme) applyTheme(staged.theme, true);
    applyEdge();
    await reinitUserData({ strict: true });
    syncTopPrefs(); refreshMenuUI();
    TIER = assignPopularityTiers(activeCatalog());
    S.cat.page = 0;
    await refreshView(true);
    return staged;
  }

  $('#set-import-trigger').addEventListener('click', () => $('#set-import').click());
  $('#set-import').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f || userDataBusy) return;
    // the backup can embed horizon photos, so cap the file before reading it
    // all into memory (a hand-crafted multi-GB file must not wedge the tab)
    if (f.size > 200 * 1024 * 1024) { alert('Backup file is too large (200 MB max)'); return; }
    const finish = lockUserDataTransfer();
    const rd = new FileReader();
    rd.onload = async () => {
      let imported = false;
      try {
        const data = JSON.parse(rd.result);
        const norm = Hor.normalizeHorizons(WS.backupHorizonSection(data));
        if (!norm) throw new Error('missing horizon section or malformed horizon data');
        WS.stageBackup({ ...data, horizons: norm });
        const counts = {
          sites: (data.sites || []).length,
          rigs: (data.rigs || []).length,
          targets: (data.targets || []).length,
          horizons: norm.horizons.length,
        };
        const oldHorizons = WS.backupHasRetiredHorizons(data)
          ? '\nHorizons from this older backup are not imported; the current horizon editor starts fresh.' : '';
        if (!confirm(`Import backup?\nSites: ${counts.sites} · Rigs: ${counts.rigs} · Custom targets: ${counts.targets}\nHorizons: ${counts.horizons}${oldHorizons}\n\nYour current browser data will be replaced.`)) return;
        // snapshot the CURRENT state (records + horizon photos + prefs + theme)
        // before replacing anything; restoreBackup persists it as the safety
        // copy and rolls back if any write fails
        const current = await WS.collectBackup(Hor.getPrefs(),
          await Hor.exportHorizonsWithPhotos(), WS.currentTheme());
        const previousSite = { ...S.site };
        const previousSelection = S.detailId;
        const previousEditorHistory = Hor.captureEditorHistory();
        let recordsCommitted = false;
        try {
          await applyWebSnapshot(data, current, false, () => { recordsCommitted = true; });
        } catch (err) {
          if (!recordsCommitted) throw err;
          try {
            S.site = previousSite;
            S.detailId = previousSelection;
            await applyWebSnapshot(current, null, true, () => {}, previousEditorHistory);
          } catch (rollbackErr) {
            throw new Error(`${err.message}; recovery also failed: ${rollbackErr.message}. The pre-import backup is retained in local safety storage.`);
          }
          throw err;
        }
        imported = true;
      } catch (err) {
        alert('Import failed: ' + err.message);
      } finally { finish(); }
      if (imported) closeModal();
    };
    rd.onerror = () => { finish(); alert('could not read the file'); };
    rd.onabort = finish;
    try { rd.readAsText(f); }
    catch (err) { finish(); alert('could not read the file: ' + err.message); }
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
  if (tz && !WS.validTimeZone(tz)) {
    alert('Timezone must be an IANA name such as Europe/Berlin, or empty for the browser default.');
    return;
  }
  const id = $('#sf-site-id').value || WS.NEW_SITE_ID();
  const rec = { id, name, lat, lon, elev: Number.isFinite(elev) ? elev : 0, tz };
  if (!(await WS.saveSiteRec(rec))) { alert('Could not save the site. Keep this form open and try again.'); return; }
  SITES = await WS.getSites();
  if (!SITES.some((s) => s.id === S.site.id)) applyActiveSite(rec);
  else if (S.site.id === id) applyActiveSite(rec);
  announcePlannerChange('site', { cause: 'site-save', siteId: rec.id });
  refreshWeatherForSite();
  refreshView();
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
    const saved = await WS.saveRigRec({
      id: rigId,
      name: p.name, focal_mm: p.focal_mm, sensor_w: p.sensor_w, sensor_h: p.sensor_h,
      fov_w: WS.fovArcmin(p.focal_mm, p.sensor_w), fov_h: WS.fovArcmin(p.focal_mm, p.sensor_h),
      fov_unit: 'arcmin',
    });
    if (!saved) { alert('Could not save the rig. Try again.'); return; }
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
  if (!(await WS.saveRigRec(rec))) { alert('Could not save the rig. Keep this form open and try again.'); return; }
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
  if (!(await WS.saveTargetRec(rec))) { err.textContent = 'Could not save the target. Keep this form open and try again.'; return; }
  announcePlannerChange('preferences', { cause: 'catalog-target', targetId: rec.id });
  upsertTarget(rec);
  renderSettings();
}

function closeModal() {
  if (userDataBusy) return;
  const modal = $('#modal');
  if (modal) { modal.hidden = true; modal.innerHTML = ''; modal.onclick = null; }
  syncDialogBackground();
  restoreControlFocus(settingsReturnFocus);
  settingsReturnFocus = null;
}

/** Re-read user data after a backup import (sites, targets, rigs). */
async function reinitUserData(options) {
  SITES = await WS.getSites(options);
  syncCustomTargets(await WS.getTargets(options), options);
  await reloadRigs(options);
  let sid = Hor.getPrefs().activeSiteId;
  if (!SITES.some((s) => s.id === sid)) sid = SITES.length ? SITES[0].id : null;
  if (sid && SITES.some((s) => s.id === sid)) applyActiveSite(SITES.find((s) => s.id === sid), options);
  else {
    // An empty snapshot must not retain the replaced browser's active site.
    S.site = { lat: 52.52, lon: 13.4, label: 'Berlin (default)', tz: null };
    WS.setActiveTz(Hor.getPrefs().tz || null);
    if (!Hor.setPrefs({ activeSiteId: null }) && options?.strict) {
      throw new Error('could not clear the restored site preference');
    }
    const selector = $('#tb-site');
    if (selector) selector.innerHTML = '<option value="">Berlin (default)</option>';
  }
}

/* ---- first-run welcome (browser equivalent of the desktop wizard) ---- */

function welcomeFlow() {
  return new Promise((resolve) => {
    const modal = $('#modal');
    modal.innerHTML = `
      <div class="modal welcome" role="dialog" aria-modal="true" aria-labelledby="m-wel-title">
        <div class="modal-head">
          <h2 id="m-wel-title" tabindex="-1">Welcome to NightSeam</h2>
        </div>
        <p class="sub">Choose where you will observe. The coordinates below are an example in Berlin; replace them with your own or use the example to explore.</p>
        <p class="sub">Later, open <b>Options → Setup</b> to manage sites, rigs, targets and backups. A rig is optional: it adds Frame % estimates of how much of a target fits your camera. Visibility planning works without one.</p>
        <p class="sub">Choose a night and time in the header. Add your skyline under Horizon to include trees and roofs. Your planning data stays in this browser.</p>
        <div class="set-form">
          <label>Site name <input type="text" id="w-name" value="My observing site"></label>
          <label>Latitude <input type="text" inputmode="decimal" id="w-lat" value="52.52"></label>
          <label>Longitude <input type="text" inputmode="decimal" id="w-lon" value="13.40"></label>
          <label>Elevation (m, metadata) <input type="text" inputmode="decimal" id="w-elev" value="0" aria-describedby="w-elevation-note"></label>
          <p class="sub" id="w-elevation-note">Elevation is recorded only; it does not change visibility calculations.</p>
          <label>Timezone <input type="text" id="w-tz" list="tz-list" placeholder="browser default">${TZ_DATALIST}</label>
          <div class="btnrow" style="margin-top:12px">
            <button class="btn primary" id="w-save">Save my site</button>
            <button class="btn" id="w-geo">use my location</button>
            <button class="btn" id="w-skip">Use Berlin example</button>
          </div>
        </div>
        <p id="w-status" class="sub" role="status"></p>
      </div>`;
    modal.hidden = false;
    syncDialogBackground();
    $('#m-wel-title').focus();
    const finish = (site) => {
      modal.hidden = true; modal.innerHTML = ''; syncDialogBackground();
      $('#tab-tonight').focus(); resolve(site);
    };
    $('#w-save').addEventListener('click', () => {
      const name = $('#w-name').value.trim() || 'My observing site';
      const lat = Hor.num($('#w-lat').value);
      const lon = Hor.num($('#w-lon').value);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
        $('#w-status').textContent = 'Enter latitude from −90 to 90 and longitude from −180 to 180.';
        $('#w-lat').focus();
        return;
      }
      const elev = Hor.num($('#w-elev').value);
      finish({ id: WS.NEW_SITE_ID(), name, lat, lon, elev: Number.isFinite(elev) ? elev : 0, tz: $('#w-tz').value.trim() || null });
    });
    $('#w-geo').addEventListener('click', () => {
      if (!navigator.geolocation) { $('#w-status').textContent = 'Location is unavailable. Enter coordinates manually.'; return; }
      $('#w-status').textContent = 'Requesting your location…';
      navigator.geolocation.getCurrentPosition((pos) => {
        if (modal.hidden || !$('#w-lat')) return;
        $('#w-lat').value = pos.coords.latitude;
        $('#w-lon').value = pos.coords.longitude;
        $('#w-status').textContent = 'Coordinates updated. Save your site to continue.';
      }, () => { if ($('#w-status')) $('#w-status').textContent = 'Location was not available. Enter coordinates manually or use the example.'; });
    });
    $('#w-skip').addEventListener('click', () => finish(null));
  });
}

/* ------------------------------- boot ------------------------------ */

async function boot() {
  installDialogKeyboard();
  WS.currentTheme(); // migrate any retired local theme value to Workbench
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
  window.addEventListener('sky:time', () => {
    updateDetailSelectedTime();
    if (detailGraphRedraw && detailTimeFrame === null) {
      detailTimeFrame = requestAnimationFrame(() => {
        detailTimeFrame = null;
        detailGraphRedraw?.();
      });
    }
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
    const res = await fetch(new URL('catalog.json?v=' + CATALOG_TOKEN, import.meta.url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    CAT = await res.json();
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
  const saveInitialSite = async (site) => {
    if (await WS.saveSiteRec(site)) return true;
    bootFailure('Your site could not be saved',
      'Browser storage rejected the site. Allow site data or free storage space, then reload.');
    return false;
  };
  SITES = await WS.getSites();
  if (!SITES.length) {
    const legacy = legacySite();
    if (legacy) {
      if (!(await saveInitialSite({ id: WS.NEW_SITE_ID(), name: 'My site', lat: legacy.lat, lon: legacy.lon, elev: 0, tz: null }))) return;
      SITES = await WS.getSites();
    } else {
      const w = await welcomeFlow();
      if (w && !(await saveInitialSite(w))) return;
      SITES = await WS.getSites();
    }
  }
  if (!SITES.length) {
    if (!(await saveInitialSite({ id: WS.NEW_SITE_ID(), name: 'Berlin (default)', lat: 52.52, lon: 13.4, elev: 0, tz: null }))) return;
    SITES = await WS.getSites();
  }
  let sid = Hor.getPrefs().activeSiteId;
  if (!SITES.some((s) => s.id === sid)) sid = SITES[0].id;
  applyActiveSite(SITES.find((s) => s.id === sid) || SITES[0]);
  S.date = WS.effToday();

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
    setPopoverOpen($('#btnMenu'), $('#menuPanel'), false);
    renderSettings();
  });
  $('#site-settings').addEventListener('click', async () => {
    SETTINGS_TAB = 'sites';
    await renderSettings();
    openSiteForm(activeSite());
  });
  $('#rig-settings').addEventListener('click', async () => {
    SETTINGS_TAB = 'rigs';
    await renderSettings();
    const rig = activeRig();
    if (rig) openRigForm(rig);
  });

  // — topbar: min-alt slider (desktop parity) —
  syncTopPrefs();
  // live label + pref on every tick, but only recompute the views when the
  // drag ENDS — a per-tick refreshView() re-ranks the whole night and
  // rebuilds the view under the pointer, making the slider feel broken.
  const applyMinAlt = (ev) => {
    const v = Hor.num(ev.target.value);
    if (!savePreferencePatch({ minAlt: Number.isFinite(v) && v >= 5 && v <= 89 ? v : null })) return;
    syncTopPrefs();
    if (ev.type === 'change') {
      announcePlannerChange('preferences', { cause: 'min-useful-alt' });
      refreshView();
    }
  };
  $('#tb-minalt').addEventListener('input', applyMinAlt);
  $('#tb-minalt').addEventListener('change', applyMinAlt);

  // — topbar: night of (date) —
  const dateEl = $('#tb-date');
  if (dateEl) {
    const today = S.date;
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
      S.skyTime = siteNoon(S.date);
      SKY_ANCHOR = null;
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
      syncNightScrub(scrub, r);
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
  renderNightInfo();
  setInterval(renderNightInfo, 60000);

  // — weather chip (load-on-demand; auto-load toggle in the submenu) —
  const wxBtn = $('#btnWeather'), wxPanel = $('#weatherPanel');
  if (wxBtn && wxPanel) wirePopover(wxBtn, wxPanel, () => {
    if (!WX_STATE.loading && (!WX_STATE.data || WX_STATE.error)) {
      WX_STATE.error = false;
      loadWeather();
    } else wxRenderPanel();
  });
  const wxAuto = $('#wxAuto');
  if (wxAuto) {
    wxAuto.checked = !!Hor.getPrefs().weatherAuto;
    wxAuto.addEventListener('change', (ev) => {
      if (!savePreferencePatch({ weatherAuto: ev.target.checked })) return;
      if (ev.target.checked && !WX_STATE.data) loadWeather(); // first flip loads immediately too
    });
  }
  if (Hor.getPrefs().weatherAuto) loadWeather(); // auto-load on startup

  // — hamburger menu (desktop parity) —
  const menuBtn = $('#btnMenu'), menuPanel = $('#menuPanel');
  wirePopover(menuBtn, menuPanel);

  const p = Hor.getPrefs();
  $('#edgeSpace').addEventListener('input', (ev) => {
    const v = Hor.num(ev.target.value);
    if (!savePreferencePatch({ edge: Number.isFinite(v) ? v : 16 })) return;
    applyEdge();
    refreshMenuUI();
  });
  $('#advMode').addEventListener('change', (ev) => {
    if (!savePreferencePatch({ advMode: ev.target.checked })) return;
    cancelCatalogWarm();
    TIER = assignPopularityTiers(activeCatalog());
    S.cat.page = 0;
    refreshMenuUI();
    refreshView();
    announceStatus(ev.target.checked ? 'Advanced catalog enabled.' : 'Standard catalog enabled.');
  });
  $('#tzSelect').addEventListener('change', (ev) => {
    if (!savePreferencePatch({ tz: ev.target.value || '' })) return;
    announcePlannerChange('preferences', { cause: 'timezone' });
    const s = activeSite();
    if (s) applyActiveSite(s);
    refreshView();
  });
  $('#moonAware').addEventListener('change', (ev) => {
    if (!savePreferencePatch({ moonAware: ev.target.checked })) return;
    announcePlannerChange('preferences', { cause: 'moon-aware' });
    refreshView();
  });
  // View full day: re-derive the scrub range live and pull the selected time
  // into it (e.g. 1 pm clamps back to dusk when switching the night window on).
  $('#viewFullDay').addEventListener('change', (ev) => {
    if (!savePreferencePatch({ viewFullDay: ev.target.checked })) return;
    announcePlannerChange('preferences', { cause: 'view-full-day' });
    clampSkyTime({ repaint: true });
  });
  $('#bortle').addEventListener('input', (ev) => {
    if (!savePreferencePatch({ bortle: Hor.num(ev.target.value) || 4 })) return;
    refreshMenuUI(); syncTopPrefs();
  });
  $('#bortle').addEventListener('change', (ev) => {
    if (!savePreferencePatch({ bortle: Hor.num(ev.target.value) || 4 })) return;
    announcePlannerChange('preferences', { cause: 'bortle' });
    refreshMenuUI(); syncTopPrefs(); refreshView();
  });
  $('#fltBb').addEventListener('change', (ev) => {
    if (!savePreferencePatch({ fltBb: ev.target.checked })) return;
    announcePlannerChange('preferences', { cause: 'filters' }); refreshView();
  });
  $('#fltHa').addEventListener('change', (ev) => {
    if (!savePreferencePatch({ fltHa: ev.target.checked })) return;
    announcePlannerChange('preferences', { cause: 'filters' }); refreshView();
  });
  $('#fltOiii').addEventListener('change', (ev) => {
    if (!savePreferencePatch({ fltOiii: ev.target.checked })) return;
    announcePlannerChange('preferences', { cause: 'filters' }); refreshView();
  });
  $('#sizeUnit').addEventListener('change', (ev) => {
    if (!savePreferencePatch({ sizeUnit: ev.target.value })) return;
    announcePlannerChange('preferences', { cause: 'size-unit' }); refreshView();
  });
  $('#rigSelect').addEventListener('change', (ev) => {
    if (!savePreferencePatch({ activeRigId: ev.target.value || '' })) return;
    announcePlannerChange('rig', { cause: 'active-rig', rigId: ev.target.value || '' });
    refreshView();
  });
  refreshMenuUI();

  // rigs for the framing selector — presets are a PICKER, never defaults.
  // 0.6.1/0.6.2 stored them in this browser; drop those leftovers once (an
  // edited or renamed rig is user data and stays).
  const rigPrefs = Hor.getPrefs();
  if (rigPrefs.rigsSeeded && !rigPrefs.rigsPresetCleaned) {
    try {
      const gone = await WS.removeSeededRigs();
      const patch = { rigsPresetCleaned: true };
      if (gone.includes(rigPrefs.activeRigId)) patch.activeRigId = '';
      savePreferencePatch(patch);
    } catch (err) { console.warn('NightSeam: preset cleanup will be retried', err); }
  }
  await reloadRigs();

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
  $('#tabs').addEventListener('keydown', (ev) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
    const tabs = [...document.querySelectorAll('#tabs a')];
    const i = tabs.indexOf(ev.target);
    if (i < 0) return;
    ev.preventDefault();
    const next = ev.key === 'Home' ? tabs[0] : ev.key === 'End' ? tabs.at(-1)
      : tabs[(i + (ev.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    next.click(); next.focus();
  });
  // keyboard shortcuts: n = cycle tabs; on sky view ←/→ scrub the night (Shift = 10 min)
  window.addEventListener('keydown', (ev) => {
    if (ev.defaultPrevented || ev.target.closest?.('[role="tab"], [role="region"], [role="button"], button, summary, [contenteditable="true"]')) return;
    const tag = (ev.target.tagName || '').toUpperCase();
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const modal = $('#modal');
    if (modal && !modal.hidden) return;
    if (ev.key === 'n' || ev.key === 'N') {
      const order = ['tonight', 'catalog', 'sky', 'horizon'];
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
    if (S.view === 'catalog') {
      if (ev.detail?.repaint !== false) renderCatalog();
      return;
    }
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

  // Seed the scrub inside the window: loading during the day must not show a
  // daylight "visible at" time (it starts at the first allowed instant). Route
  // below performs the one initial visible render.
  clampSkyTime();
  route();
}

function renderNightInfo() {
  const el = $('#nightInfo');
  if (!el) return;
  const info = E.nightInfo(nightAnchor(), S.site.lat, S.site.lon,
                           siteNoon(nightAnchor()));
  const dw = E.pickDarkWindow(info, nightAnchor(), siteNoon(nightAnchor()), siteFallback(nightAnchor()));
  // Report the anchored night's Moon, falling back to now for polar day.
  const moJd = (dw.dusk && dw.dawn)
    ? (E.julianDay(dw.dusk) + E.julianDay(dw.dawn)) / 2
    : E.julianDay(new Date());
  const mo = E.moonPhase(moJd);
  const darkTxt = dw.dusk && dw.dawn ? `${fmtClock(dw.dusk)}–${fmtClock(dw.dawn)}` : '—';
  el.textContent = `moon ${(mo.illumination * 100).toFixed(0)}% · ${mo.name} · dark ${darkTxt}`;
}

if (typeof document !== 'undefined') boot();
