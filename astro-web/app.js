/*
 * AstroPilot Web — static in-browser night-planning app.
 * Port of AstroPilot (<archive>\Object-Astro) core features:
 *   • Tonight  — dark time, moon phase, ranked best targets
 *   • Sky map  — live polar all-dome chart with sun/moon/all catalog objects
 *   • Catalog  — search/sort across 12,116 objects (Messier + OpenNGC)
 *   • Detail   — meta + tonight rise/transit/set + altitude chart
 * All sky math runs client-side (astro.js, Meeus algorithms).
 */
import * as E from './astro.js?v=3';
import * as Hor from './horizon.js?v=9';
import { meteorShower } from './meteor.js?v=1';

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

/* ------------------------------ state ------------------------------ */

const LS_KEY = 'apweb_site_v1';
function loadSite() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (typeof s.lat === 'number' && typeof s.lon === 'number') return s;
    }
  } catch { /* ignore */ }
  return { lat: 52.52, lon: 13.4, label: 'Berlin (default)' };
}
function saveSite() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(S.site)); } catch { /* ignore */ }
}

let CAT = null;                 // array of catalog objects
const byId = new Map();         // id -> object
const searchCache = new Map();  // object -> lowercase search blob
const S = {
  site: loadSite(),
  date: new Date(),
  skyTime: new Date(),
  playing: false,
  view: 'tonight',
  detailId: null,
  cat: { q: '', chip: 'all', sort: 'mag', up: true, page: 0 },
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const typeColor = (o) => TYPE_COLORS[o.otype] || '#9fb4d8';

/* "flash" desirability score (static, per object): brightness + size + fame + type */
const flashCache = new Map();
function flashOf(o) {
  let v = flashCache.get(o.id);
  if (v !== undefined) return v;
  const magScore = o.vmag != null ? Math.max(0, Math.min(100, (12 - o.vmag) * 9)) : 0;
  const sm = String(o.size_am || '').split('x');
  let sx = 0;
  if (sm.length >= 2) sx = Math.max(parseFloat(sm[0]) || 0, parseFloat(sm[1]) || 0);
  else sx = parseFloat(sm[0]) || 0;
  const sizeScore = Math.min(40, (sx / 30) * 40);
  const fame = o.messier ? 15 : (!o._adv ? 8 : 0);
  const typeBoost = { nebula: 6, supernova_remnant: 6, planetary: 5, open_cluster: 4, globular: 3, star_cloud: 2, galaxy: 1, asterism: 0 }[o.otype] || 0;
  v = Math.round(Math.min(100, magScore + sizeScore + fame + typeBoost));
  flashCache.set(o.id, v);
  return v;
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
function obsNightGrid() {
  const { lat, lon } = S.site;
  const info = E.nightInfo(S.date, lat, lon);
  const startT = info.civilDusk || info.sunset || new Date(S.date.getFullYear(), S.date.getMonth(), S.date.getDate(), 20, 0);
  const endT = info.civilDawn || info.sunrise || new Date(S.date.getFullYear(), S.date.getMonth(), S.date.getDate() + 1, 5, 0);
  return {
    jd0: E.julianDay(startT), jd1: E.julianDay(endT),
    step: 600 / 86400,
    minAlt: Hor.effectiveMinAlt(), pano: Hor.activePano(), lat, lon,
  };
}
function obsKey(g, oid) { return `${dateKey(S.date)}|${g.minAlt.toFixed(2)}|${g.pano ? g.pano.id : '-'}|${oid}`; }
function escAttr(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c); }
function cachedPctText(oid) {
  const v = obsCache.get(obsKey(obsNightGrid(), oid));
  if (!v) return '…';
  return `${v.pct}%`;
}

/* ---------- Wikipedia thumbnails with IndexedDB cache ---------- */
// Only objects without a bundled photo fetch from Wikipedia, only when their
// detail view is opened, thumbnails only. Results (image blobs AND definite
// "no photo" answers) are cached in IndexedDB per object; transient network
// failures are NOT cached so they retry next open.
function idbOpen() {
  return new Promise((resolve, reject) => {
    try {
      const rq = indexedDB.open('apweb-images', 1);
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
  if (h.startsWith('#obj:')) {
    S.view = 'catalog';
    openDetailSafe(h.slice(5));
  } else {
    S.view = h.slice(1);
    if (!['tonight', 'sky', 'catalog', 'horizon'].includes(S.view)) S.view = 'tonight';
  }
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

function fmtClock(dt) {
  if (!dt) return '—';
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

function fmtDur(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

function renderTonight() {
  splashText('computing tonight…');
  const box = $('#view');
  box.innerHTML = `<div class="splash"><div class="splash-inner"><div class="spinner"></div><p id="splash-text">computing tonight…</p></div></div>`;
  // defer heavy math so the UI paints first
  setTimeout(() => {
    const { lat, lon } = S.site;
    const info = E.nightInfo(S.date, lat, lon);
    const jdNow = E.julianDay(new Date());
    const mo = E.moonPhase(jdNow);

    const startT = info.civilDusk || info.sunset;
    const endT = info.civilDawn || info.sunrise;
    const gridStart = startT || new Date(S.date.getFullYear(), S.date.getMonth(), S.date.getDate(), 22, 0);
    const gridEnd = endT || new Date(S.date.getFullYear(), S.date.getMonth(), S.date.getDate() + 1, 4, 0);
    const jd0 = E.julianDay(gridStart), jd1 = E.julianDay(gridEnd);
    const step = 600 / 86400; // 10 min
    const n = Math.max(2, Math.round((jd1 - jd0) / step));

    const pano = Hor.activePano();
    const prefs = Hor.getPrefs();
    const minAlt = Hor.effectiveMinAlt();
    const moonAware = prefs.moonAware;
    const bortleF = 0.4 + 0.15 * prefs.bortle;
    const typeF = (o) => ({ nebula: 1.6, supernova_remnant: 1.6, planetary: 1.3, star_cloud: 1.1, galaxy: 0.8, open_cluster: 0.55, globular: 0.5, asterism: 0.55 }[o.otype] || 1.0);
    const illum = E.moonIllumination(jdNow);
    // moon track over the night grid (computed once)
    const moonAlt = [], moonAz = [];
    for (let i = 0; i <= n; i++) {
      const jd = jd0 + i * step;
      const [mr, md] = E.moonRaDec(jd);
      const [ma, maz] = E.altaz(mr * 15, md, jd, lat, lon);
      moonAlt.push(ma); moonAz.push(maz);
    }

    const candidates = CAT.filter((o) => o.vmag != null && (!o._adv || o.vmag <= 9) && o.vmag < 14);
    const rows = [];
    for (const o of candidates) {
      let maxAlt = -90, transitJd = jd0, bestRun = 0, bestStart = jd0;
      let cur = 0, curStart = jd0, visN = 0, blocked = 0;
      let sClassic = 0, sMoon = 0;
      const ra = o.ra_hours * 15;
      const tf = typeF(o);
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
            const glow = illum * (1 - Math.min(1, sep / 180));
            w *= Math.max(0.05, 1 - 0.95 * glow * tf * bortleF);
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
      const [altNow, azNow] = E.altaz(ra, o.dec_deg, jdNow, lat, lon);
      const ceilNow = pano ? Hor.ceilFor(pano, azNow) : { ceil: Hor.NO_BLOCK, ceilTop: null };
      const visNow = altNow >= minAlt && altNow > ceilNow.ceil && altNow < (ceilNow.ceilTop ?? 90.5);
      const obsPct = Math.round(100 * visN / (n + 1));
      const blockedPct = Math.round(100 * blocked / (n + 1));
      const flash = flashOf(o);
      // blend: visibility score x (0.45..1.2) depending on how flashy the object is
      const score = Math.round((moonAware ? sMoon : sClassic) * (0.45 + 0.75 * (flash / 100)) * 10) / 100;
      rows.push({ o, maxAlt, altNow, visNow, score, bestRun, bestStart, transitJd, visN, obsPct, blockedPct, flash });
    }
    rows.sort((a, b) => b.score - a.score);
    // share the computed visibility with the catalog column
    {
      const g = { minAlt, pano, lat, lon, jd0, jd1, step };
      for (const r of rows) obsCache.set(obsKey(g, r.o.id), { pct: r.obsPct, blk: r.blockedPct });
    }
    const top = rows.slice(0, 16);
    const nowVisible = rows.filter((r) => r.visNow).sort((a, b) => b.altNow - a.altNow).slice(0, 8);
    const risingLater = rows.filter((r) => !r.visNow && r.maxAlt > 0)
      .sort((a, b) => a.transitJd - b.transitJd).slice(0, 8);

    const darkStart = info.astroDusk, darkEnd = info.astroDawn;
    const darkH = darkStart && darkEnd ? Math.round(((darkEnd - darkStart) / 3600000 + (darkEnd < darkStart ? 24 : 0)) * 10) / 10 : null;
    const visibleCount = nowVisible.length;

    const pickItem = (r) => {
      const o = r.o;
      const tags = [o.messier, o.ngcic].filter(Boolean).join(' · ');
      const win = r.bestRun > 0
        ? `clear ${fmtClock(E.dateFromJD(r.bestStart))} – ${fmtClock(E.dateFromJD(r.bestStart + r.bestRun * step))}`
        : 'no clear window';
      return `<li data-id="${esc(o.id)}">
        <span class="dot" style="background:${typeColor(o)}"></span>
        <span>${r.flash >= 60 ? '<span class="p-flash">✨</span> ' : ''}<span class="p-name">${esc(o.primary_name)}</span>${tags ? `<span class="p-tags">${esc(tags)}</span>` : ''}</span>
        <span class="p-right"><b>${r.maxAlt.toFixed(0)}°</b>
          <span class="p-vis">${r.visN ? `${r.obsPct}% of night · ${fmtDur(r.visN * step * 1440)} visible` : 'not clear tonight'}</span>${win}</span>
      </li>`;
    };

    box.innerHTML = `
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
          <h3>Visible now</h3>
          <div class="big">${visibleCount}</div>
          <div class="sub">catalog objects above the horizon</div>
        </div>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>Best targets tonight</h3>
        <ul class="pick">${top.length ? top.map(pickItem).join('') : '<li style="cursor:default">nothing tonight — check again in darker skies</li>'}</ul>
      </div>
      <div class="grid2" style="margin-top:14px">
        <div class="card"><h3>Right now</h3><ul class="pick">${nowVisible.length ? nowVisible.map((r) => `<li data-id="${esc(r.o.id)}">
          <span class="dot" style="background:${typeColor(r.o)}"></span>
          <span><span class="p-name">${esc(r.o.primary_name)}</span>${r.o.messier ? `<span class="p-tags">${esc(r.o.messier)}</span>` : ''}</span>
          <span class="p-right"><b>${r.altNow.toFixed(0)}° alt</b>transit ${fmtClock(E.dateFromJD(r.transitJd))}</span>
        </li>`).join('') : '<li style="cursor:default">nothing above the horizon right now</li>'}</ul></div>
        <div class="card"><h3>Rising later tonight</h3><ul class="pick">${risingLater.length ? risingLater.map((r) => `<li data-id="${esc(r.o.id)}">
          <span class="dot" style="background:${typeColor(r.o)}"></span>
          <span><span class="p-name">${esc(r.o.primary_name)}</span>${r.o.messier ? `<span class="p-tags">${esc(r.o.messier)}</span>` : ''}</span>
          <span class="p-right"><b>transit ${fmtClock(E.dateFromJD(r.transitJd))}</b>peaks ${r.maxAlt.toFixed(0)}°</span>
        </li>`).join('') : '<li style="cursor:default">everything already up or setting</li>'}</ul></div>
      </div>
      <p class="cat-count" style="margin-top:10px;text-align:center">night of ${dateKey(S.date)} · ${S.site.label || `${S.site.lat.toFixed(2)}, ${S.site.lon.toFixed(2)}`} · horizon: ${pano ? esc(pano.name) : 'none'} · flash-aware ranking · click any target for details</p>`;
    box.querySelectorAll('.pick li[data-id]').forEach((li) => li.addEventListener('click', () => openDetail(li.dataset.id)));
    hideSplash();
  }, 30);
}

/* ----------------------------- sky map ----------------------------- */

let skyItems = [];

function dtoLocalInput(d) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderSky() {
  const box = $('#view');
  box.innerHTML = `
    <div class="sky-wrap">
      <div class="sky-canvas-box card"><canvas id="sky"></canvas></div>
      <div class="sky-side">
        <div class="card">
          <h3>Time</h3>
          <label>Local time <input id="sky-time" type="datetime-local" value="${dtoLocalInput(S.skyTime)}"></label>
          <label style="margin-top:12px">Scrub <output id="sky-sout"></output>
            <input type="range" id="sky-slider" min="0" max="1440" step="15">
          </label>
          <div class="btnrow" style="margin-top:12px">
            <button class="btn primary" id="sky-now">Now</button>
          </div>
          <p class="sub" style="margin-top:10px">slider spans noon → next noon, local time</p>
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
        <div class="card"><h3>Hint</h3><p class="sub" style="font-size:13px">Click an object to open its detail panel. The chart is an all-sky polar view: center = zenith, rim = horizon, north at top.</p></div>
      </div>
    </div>`;
  hideSplash();

  const cvs = $('#sky');
  const ctx = cvs.getContext('2d');
  const tip = $('#tooltip');

  const candidates = [
    ...CAT.filter((o) => !o._adv),
    ...CAT.filter((o) => o._adv && o.vmag != null && o.vmag <= 9.5)
      .sort((a, b) => (a.vmag ?? 99) - (b.vmag ?? 99)).slice(0, 1400),
  ];

  function sizeCanvas() {
    const w = cvs.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    cvs.width = w * dpr; cvs.height = w * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    const W = cvs.clientWidth;
    const cx = W / 2, cy = W / 2;
    const R = W / 2 - 22;
    ctx.clearRect(0, 0, W, W);

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
    for (const o of candidates) {
      const hit = plot(o.ra_hours * 15, o.dec_deg, (x, y, alt) => {
        const mag = o.vmag ?? 99;
        const rad = Math.max(1.1, Math.min(4.2, 4.6 - mag * 0.32));
        ctx.fillStyle = typeColor(o);
        ctx.globalAlpha = Math.min(1, Math.max(.35, 1.25 - alt / 90));
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        if (!o._adv && o.vmag != null && o.vmag < 8.5) {
          ctx.fillStyle = 'rgba(219, 233, 255, .8)';
          ctx.font = '10.5px system-ui, sans-serif';
          ctx.fillText(o.messier || o.primary_name, x + rad + 4, y + 3);
        }
      });
      if (hit) skyItems.push({ x: hit.x, y: hit.y, id: o.id, label: o.primary_name, o });
    }

    // obstruction-free note: horizon line already drawn
  }

  function posEl(ev) {
    const r = cvs.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  cvs.addEventListener('mousemove', (ev) => {
    const [x, y] = posEl(ev);
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
    const [x, y] = posEl(ev);
    let best = null, bestD = 10000;
    for (const it of skyItems) {
      if (it.id === 'SUN' || it.id === 'MOON') continue;
      const d = (it.x - x) ** 2 + (it.y - y) ** 2;
      if (d < bestD) { bestD = d; best = it; }
    }
    if (best && bestD < 140) openDetail(best.id);
  });

  // time scrub slider: noon -> next noon, local time
  const timeEl = $('#sky-time');
  const slider = $('#sky-slider');
  const sout = $('#sky-sout');
  const rangeStart = new Date(S.skyTime.getFullYear(), S.skyTime.getMonth(), S.skyTime.getDate(), 12, 0, 0);
  const pad2 = (x) => String(x).padStart(2, '0');
  const sliderVal = () => Math.max(0, Math.min(1440, Math.round((S.skyTime.getTime() - rangeStart.getTime()) / 60000)));
  const syncControls = () => {
    slider.value = String(sliderVal());
    sout.textContent = fmtClock(S.skyTime); // actual local clock time
    timeEl.value = dtoLocalInput(S.skyTime);
  };
  syncControls();
  slider.addEventListener('input', () => {
    S.skyTime = new Date(rangeStart.getTime() + Number(slider.value) * 60000);
    syncControls();
    draw();
  });
  timeEl.addEventListener('input', () => {
    const v = timeEl.value;
    if (v) { S.skyTime = new Date(v); syncControls(); draw(); }
  });
  $('#sky-now').addEventListener('click', () => {
    S.skyTime = new Date();
    syncControls();
    draw();
  });

  if (skyTimeHandler) window.removeEventListener('sky:time', skyTimeHandler);
  skyTimeHandler = () => { try { syncControls(); draw(); } catch { /* view gone */ } };
  window.addEventListener('sky:time', skyTimeHandler);

  sizeCanvas();
  draw();
  window.addEventListener('resize', () => { if (S.view === 'sky') { sizeCanvas(); draw(); } });
}

let skyTimeHandler = null;

/* ----------------------------- catalog ----------------------------- */

const CHIP_LABELS = { all: 'All', messier: 'Messier', bright: 'Bright <8', galaxies: 'Galaxies', nebulae: 'Nebulae', clusters: 'Clusters' };
const CHIP_FILTERS = {
  all: () => true,
  messier: (o) => !!o.messier,
  bright: (o) => o.vmag != null && o.vmag < 8,
  galaxies: (o) => o.otype === 'galaxy',
  nebulae: (o) => ['nebula', 'planetary', 'supernova_remnant', 'star_cloud'].includes(o.otype),
  clusters: (o) => ['open_cluster', 'globular', 'asterism'].includes(o.otype),
};

function filteredCatalog() {
  const f = S.cat;
  const q = f.q.trim().toLowerCase();
  let out = CAT.filter((o) => CHIP_FILTERS[f.chip](o));
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

  const th = (key, label, num = false) =>
    `<th class="${num ? 'num' : ''}" data-k="${key}">${label}${S.cat.sort === key ? (S.cat.up ? ' ▲' : ' ▼') : ''}</th>`;

  box.innerHTML = `
    <div class="cat-bar">
      <input type="search" id="cat-q" placeholder="Search: name, M 31, NGC 7000, galaxy, Cyg…" value="${esc(S.cat.q)}">
      <div class="chips">${Object.keys(CHIP_FILTERS).map((c) => `<button class="chip${S.cat.chip === c ? ' on' : ''}" data-c="${c}">${CHIP_LABELS[c]}</button>`).join('')}</div>
      <span class="cat-count">${list.length.toLocaleString()} of ${CAT.length.toLocaleString()} objects</span>
      <span class="cat-count" id="pct-status" style="margin-left:12px"></span>
    </div>
    <div class="card" style="padding:8px 10px">
      <table class="cat">
        <thead><tr>${th('name', 'Name')}${th('mag', 'Mag', true)}${th('pct', '% visibility', true)}${th('type', 'Type')}${th('con', 'Con')}${th('size', 'Size', true)}${th('ra', 'RA', true)}${th('dec', 'Dec', true)}</tr></thead>
        <tbody>
          ${slice.map((o) => {
            const tags = [o.messier, o.ngcic].filter(Boolean).join(' · ');
            return `<tr data-id="${esc(o.id)}">
              <td><span class="tname">${esc(o.primary_name)}</span> ${tags ? `<span class="tags">${esc(tags)}</span>` : ''}</td>
              <td class="num">${o.vmag != null ? o.vmag.toFixed(1) : '—'}</td>
              <td class="num pct" data-objid="${escAttr(o.id)}">${cachedPctText(o.id)}</td>
              <td><span class="tag-dot" style="color:${typeColor(o)}">●</span> ${TYPE_LABELS[o.otype] || o.otype}</td>
              <td>${esc(o.constellation)}</td>
              <td class="num">${esc(o.size_am || '')}</td>
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

  $('#cat-q').addEventListener('input', (ev) => { S.cat.q = ev.target.value; S.cat.page = 0; renderCatalog(); });
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
      renderCatalog();
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

function openDetailSafe(id) { if (byId.has(id)) openDetail(id); else route(); }

function openDetail(id) {
  const o = byId.get(id);
  if (!o) return;
  const modal = $('#modal');
  const pano = Hor.activePano();
  const { lat, lon } = S.site;
  const info = E.nightInfo(S.date, lat, lon);
  const jd = E.julianDay(new Date());
  const [altNow, azNow] = E.altaz(o.ra_hours * 15, o.dec_deg, jd, lat, lon);
  const localMidnight = new Date(S.date.getFullYear(), S.date.getMonth(), S.date.getDate(), 0, 30);
  const dayInfo = E.objectDayInfo(o.ra_hours * 15, o.dec_deg, localMidnight, lat, lon);

  const tags = [o.messier, o.ngcic, o.other].filter(Boolean).map(esc).join(' · ');
  const wiki = o.wiki || o.primary_name;

  modal.innerHTML = `
    <div class="modal" role="dialog">
      <button class="close" id="m-close" title="close">✕</button>
      <h2>${esc(o.primary_name)}</h2>
      <span class="tags">${tags}</span>
      <div class="detail-grid">
        <div id="objimg-wrap">
          <img class="objimg" id="d-img" src="img/${encodeURIComponent(id)}.jpg" alt="">
          <div class="objimg-ph" id="d-imgph" style="display:none"></div>
        </div>
        <div>
          <dl class="meta">
            <dt>Type</dt><dd><span style="color:${typeColor(o)}">●</span> ${TYPE_LABELS[o.otype] || o.otype}</dd>
            <dt>Magnitude</dt><dd>${o.vmag != null ? o.vmag.toFixed(1) : '—'}</dd>
            <dt>Size</dt><dd>${esc(o.size_am || '—')} arcmin</dd>
            <dt>Constellation</dt><dd>${esc(o.constellation || '—')}</dd>
            <dt>Distance</dt><dd>${esc(o.distance || '—')}</dd>
            <dt>RA / Dec (J2000)</dt><dd>${E.formatRA(o.ra_hours)} · ${E.formatDec(o.dec_deg)}</dd>
            <dt>Right now</dt><dd>alt ${altNow.toFixed(1)}°, az ${azNow.toFixed(0)}°</dd>
            <dt>Tonight</dt><dd>rises ${fmtClock(dayInfo.rise)} · transits ${fmtClock(dayInfo.transit)} · sets ${fmtClock(dayInfo.set)} · peaks ${dayInfo.maxAlt.toFixed(0)}°</dd>
            <dt>Observable</dt><dd id="d-obs">—</dd>
          </dl>
          ${o.blurb ? `<p class="blurb">${esc(o.blurb)}</p>` : ''}
          <p class="blurb" style="margin-top:8px;font-size:13px"><a class="wiki" href="https://en.wikipedia.org/wiki/${encodeURIComponent(wiki)}" target="_blank" rel="noopener">Wikipedia ↗</a></p>
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
  const startT = info.sunset || new Date(S.date.getFullYear(), S.date.getMonth(), S.date.getDate(), 19, 0);
  const endT = info.sunrise || new Date(S.date.getFullYear(), S.date.getMonth(), S.date.getDate() + 1, 6, 0);
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

  // best window = longest clear run
  let run = 0, best = 0, bestStart = -1, curStart = -1;
  for (let i = 0; i <= steps; i++) {
    if (samples[i].vis) {
      if (run === 0) curStart = i;
      run++;
      if (run > best) { best = run; bestStart = curStart; }
    } else run = 0;
  }
  const winNote = bestStart >= 0 && best > 1
    ? `Best window (clear, ≥${minAlt.toFixed(0)}°): ${fmtClock(new Date(tStart.getTime() + (bestStart / steps) * durMs))} – ${fmtClock(new Date(tStart.getTime() + ((bestStart + best) / steps) * durMs))}`
    : 'No clear window tonight';
  $('#win-note').textContent = winNote;
  const visCount = samples.reduce((a, s) => a + (s.vis ? 1 : 0), 0);
  const obsEl = $('#d-obs');
  if (obsEl) {
    const pct = Math.round(100 * visCount / (steps + 1));
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

const tip = {
  set innerHTML(v) { $('#tooltip').innerHTML = v; },
  set hidden(v) { $('#tooltip').hidden = v; },
  get style() { return $('#tooltip').style; },
};
// note: `tip` above is a shim so detail code works before #tooltip exists; declared after use is fine (hoisting of const is not — so we define functions after). See boot below.

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
    splashText(`catalog ready · ${CAT.length.toLocaleString()} objects`);
  } catch (err) {
    splashText(`catalog failed to load: ${err.message}`);
    return;
  }

  // init site controls
  $('#in-lat').value = S.site.lat;
  $('#in-lon').value = S.site.lon;
  $('#site-note').textContent = S.site.label || '';
  const applySite = () => {
    const lat = Hor.num($('#in-lat').value);
    const lon = Hor.num($('#in-lon').value);
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      S.site = { lat, lon, label: `${lat.toFixed(3)}, ${lon.toFixed(3)}` };
      saveSite();
      $('#site-note').textContent = S.site.label;
      if (S.view === 'tonight') renderTonight();
      else if (S.view === 'sky') renderSky();
    } else {
      $('#in-lat').value = S.site.lat;
      $('#in-lon').value = S.site.lon;
      $('#site-note').textContent = S.site.label + ' (invalid input)';
    }
  };
  $('#in-lat').addEventListener('change', applySite);
  $('#in-lon').addEventListener('change', applySite);
  $('#btn-locate').addEventListener('click', () => {
    if (!navigator.geolocation) { $('#site-note').textContent = 'geolocation unavailable'; return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        S.site = { lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'your location' };
        saveSite();
        $('#in-lat').value = S.site.lat;
        $('#in-lon').value = S.site.lon;
        $('#site-note').textContent = S.site.label;
        if (S.view === 'tonight') renderTonight();
        else if (S.view === 'sky') renderSky();
      },
      () => { $('#site-note').textContent = 'location denied'; }
    );
  });

  // top-bar planning prefs (min altitude, bortle, moon-aware) — shared with Horizon
  const syncTopPrefs = () => {
    const p = Hor.getPrefs();
    $('#tb-minalt').value = p.minAlt != null ? p.minAlt : '';
    $('#tb-note').textContent = `eff. min ${Hor.effectiveMinAlt().toFixed(0)}°`;
  };
  syncTopPrefs();
  const refreshView = () => {
    if (S.view === 'tonight') renderTonight();
    else if (S.view === 'sky') renderSky();
    else if (S.view === 'catalog') renderCatalog();
    else renderHorizonView();
  };
  $('#tb-minalt').addEventListener('change', (ev) => {
    const v = Hor.num(ev.target.value);
    Hor.setPrefs({ minAlt: Number.isFinite(v) && v >= 0 && v <= 89 ? v : null });
    syncTopPrefs(); refreshView();
  });

  // easter egg: click the brand logo for a meteor shower
  const brand = document.querySelector('.brand');
  if (brand) brand.addEventListener('click', () => meteorShower());

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
    if (S.view === 'sky' && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
      const mins = ev.shiftKey ? 10 : 60;
      S.skyTime = new Date(S.skyTime.getTime() + (ev.key === 'ArrowRight' ? mins : -mins) * 60000);
      window.dispatchEvent(new CustomEvent('sky:time'));
      ev.preventDefault();
    }
  });
  if (tonightTimer) clearInterval(tonightTimer);
  tonightTimer = setInterval(() => { if (S.view === 'tonight' && !document.hidden) renderTonight(); }, 60000);

  route();
}

if (typeof document !== 'undefined') boot();