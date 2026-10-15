/*
 * NightSeam Web - phone capture of a horizon.
 *
 * A full-screen camera view with a crosshair. Where the crosshair points comes
 * from the phone's orientation sensors: the gyroscope-based relative
 * orientation gives the shape of a sweep (it does not jump near metal), and
 * north is set once from the averaged compass. The video is only shown: it is
 * never recorded, stored or sent anywhere. Tracing hands finished lines to the
 * editor, which owns the horizon record, its history and saving.
 */
import { vizTheme } from './viztheme.js?v=7';
import {
  wrapAz, azDelta, quaternionPointing, orientationQuaternion, cameraProject, circularMean,
  sweepLine, normalizePoints,
} from './core.js?v=72';

const SENSOR_WAIT_MS = 3000;
const NORTH_WINDOW_MS = 3000;      // compass readings averaged for north
const NORTH_STABLE_DEG = 1;        // its two halves agree this well once the compass settled
const NORTH_MAX_SPREAD = 4;        // and scatter no more than this (deg)
const NORTH_GIVE_UP_MS = 20000;    // an unsettled compass is taken anyway after this long
const PAIR_MAX_MS = 250;           // a compass reading this old still pairs
const NORTH_MAX_ALT = 60;          // pointing steeper than this, azimuth is unreliable
const COMPASS_STALE_MS = 1500;     // no usable compass reading for this long while north is missing
const COMPASS_RETRY_MS = 2500;     // ... restarts the compass, at most this often
const COMPASS_RETRIES = 40;
const DEFAULT_FOV_LONG = 67;       // camera field of view along the long side, deg (typical phone main camera)
const AR_MAX_DPR = 1.5;            // overlay canvas pixel density cap
const TRACE_STEP = 0.2;            // degrees between stored trace samples
const STRIP_ALT = [-10, 60];

const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                   'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const cardinal = (az) => CARDINALS[Math.round(wrapAz(az) / 22.5) % 16];
const fmt = (v) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** True when this browser could capture: a camera API and an orientation API.
 *  Whether the device really has the sensors shows only once readings arrive. */
export function captureAvailable() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
    && (typeof globalThis.RelativeOrientationSensor === 'function' || typeof DeviceOrientationEvent !== 'undefined');
}

/* ------------------------------ orientation ------------------------------ */

/**
 * The phone's orientation from the best source available, as quaternions.
 * `onChange` runs after every relative reading. North is the circular mean of
 * (compass - relative) azimuth over NORTH_WINDOW_MS, taken once the compass
 * has settled and then kept, so the compass's jitter never reaches the traced
 * shape. A compass that has just started swings towards its heading for
 * several seconds (about 10 s on a Pixel 7a, measured): locking earlier set
 * north 44 deg off. The compass
 * sources restart while north is missing: on a first open the browser may
 * still be deciding a motion permission, and a compass started before that
 * can stay silent.
 */
function orientation(onChange) {
  const st = {
    rel: null, relQ: null, relAt: 0, relSrc: '', abs: null, absAt: 0, absSrc: '',
    pairs: [], offset: null, spread: null, compassOnly: false, startedAt: now(),
    compassStarts: 0, compassStartedAt: 0, pairAt: now(),
    settle: null, northSince: now(), northUnsteady: false,
  };
  const relStops = [], compassStops = [];

  const pointing = () => (st.rel && st.offset != null
    ? { az: wrapAz(st.rel.az + st.offset), alt: st.rel.alt } : null);

  function lockNorth(t) {
    st.pairs = st.pairs.filter((p) => t - p.t <= NORTH_WINDOW_MS);
    if (st.offset != null || !st.pairs.length || t - st.pairs[0].t < NORTH_WINDOW_MS - 250) return;
    // Settled when the older and the newer half of the window agree.
    const mid = t - NORTH_WINDOW_MS / 2;
    const older = circularMean(st.pairs.filter((p) => p.t < mid).map((p) => p.d));
    const newer = circularMean(st.pairs.filter((p) => p.t >= mid).map((p) => p.d));
    if (!older || !newer) return;
    const all = circularMean(st.pairs.map((p) => p.d));
    st.settle = Math.abs(azDelta(newer.mean, older.mean));
    const steady = st.settle <= NORTH_STABLE_DEG && all.spread <= NORTH_MAX_SPREAD;
    if (!steady && t - st.northSince < NORTH_GIVE_UP_MS) return;
    st.offset = newer.mean;   // the newest, most settled value
    st.spread = all.spread;
    st.northUnsteady = !steady;
  }

  function rereadNorth() {
    st.offset = null; st.spread = null; st.pairs = [];
    st.settle = null; st.northSince = now(); st.northUnsteady = false;
  }

  function relative(q, src) {
    const t = now();
    // The sensor API wins over the older events while it keeps reporting.
    if (src === 'event' && st.relSrc === 'sensor' && t - st.relAt < 500) return;
    // A real relative source after a compass-only start: north is read again,
    // so no compass-against-itself sample stays in the average.
    if (src !== 'compass' && st.compassOnly) { st.compassOnly = false; rereadNorth(); }
    const p = quaternionPointing(q);
    st.rel = p; st.relQ = q; st.relAt = t; st.relSrc = src;
    // Pair with a fresh compass reading, only while the phone is held roughly
    // upright: pointing near straight up or down, azimuth means little.
    if (st.abs && t - st.absAt <= PAIR_MAX_MS && Math.abs(p.alt) < NORTH_MAX_ALT && Math.abs(st.abs.alt) < NORTH_MAX_ALT) {
      st.pairs.push({ t, d: wrapAz(st.abs.az - p.az) });
      st.pairAt = t;
    }
    // A compass that gives nothing usable (no readings, stale ones, or a
    // placeholder pointing straight down) is started again while north is
    // missing, as long as the phone is held where a reading could pair.
    if (st.offset == null && t - st.pairAt > COMPASS_STALE_MS && t - st.compassStartedAt > COMPASS_RETRY_MS
        && Math.abs(p.alt) < NORTH_MAX_ALT && st.compassStarts < COMPASS_RETRIES) startCompass();
    lockNorth(t);
    onChange();
  }

  function absolute(q, src) {
    const t = now();
    if (src === 'event' && st.absSrc === 'sensor' && t - st.absAt < 500) return;
    st.abs = quaternionPointing(q); st.absAt = t; st.absSrc = src;
    // Without any relative source the compass has to give the shape too, but
    // only after the relative sensor had a second to start: the compass often
    // reports first.
    const silent = st.relSrc ? st.relSrc === 'compass' || t - st.relAt > 1000 : t - st.startedAt > 1000;
    if (silent) {
      st.compassOnly = true;
      relative(q, 'compass');
    }
  }

  const sensor = (name, cb, stops) => {
    const Ctor = globalThis[name];
    if (typeof Ctor !== 'function') return;
    try {
      const s = new Ctor({ frequency: 60, referenceFrame: 'device' });
      s.addEventListener('reading', () => {
        const q = s.quaternion;
        // A sensor that has not measured yet can report a zero quaternion.
        if (q && Math.hypot(q[0], q[1], q[2], q[3]) > 0.5) cb(Array.from(q), 'sensor');
      });
      s.addEventListener('error', () => { try { s.stop(); } catch { /* already stopped */ } });
      s.start();
      stops.push(() => { try { s.stop(); } catch { /* already stopped */ } });
    } catch { /* not allowed or not supported: the events still run */ }
  };
  const angles = (ev) => ev.alpha != null && ev.beta != null && ev.gamma != null;

  const onRelEvent = (ev) => {
    if (!angles(ev)) return;
    if (typeof ev.webkitCompassHeading === 'number') {
      // iOS: alpha is relative to where the page started; the heading is the compass.
      absolute(orientationQuaternion(360 - ev.webkitCompassHeading, ev.beta, ev.gamma), 'event');
      relative(orientationQuaternion(ev.alpha, ev.beta, ev.gamma), 'event');
      return;
    }
    const q = orientationQuaternion(ev.alpha, ev.beta, ev.gamma);
    if (ev.absolute === true) absolute(q, 'event'); else relative(q, 'event');
  };
  const onAbsEvent = (ev) => { if (angles(ev)) absolute(orientationQuaternion(ev.alpha, ev.beta, ev.gamma), 'event'); };
  const listen = typeof addEventListener === 'function';

  function startCompass() {
    for (const fn of compassStops.splice(0)) fn();
    st.compassStarts += 1;
    st.compassStartedAt = now();
    sensor('AbsoluteOrientationSensor', absolute, compassStops);
    if (listen) {
      addEventListener('deviceorientationabsolute', onAbsEvent);
      compassStops.push(() => removeEventListener('deviceorientationabsolute', onAbsEvent));
    }
  }

  sensor('RelativeOrientationSensor', relative, relStops);
  if (listen) {
    addEventListener('deviceorientation', onRelEvent);
    relStops.push(() => removeEventListener('deviceorientation', onRelEvent));
  }
  startCompass();

  return {
    state: st,
    pointing,
    /** Forget north, start the compass again and average it afresh. */
    rereadNorth() { rereadNorth(); st.compassStarts = 0; startCompass(); },
    /** Start the compass again, keeping north (after a permission arrives). */
    restartCompass() { if (st.offset == null) { st.compassStarts = 0; startCompass(); } },
    stop() { for (const fn of [...relStops.splice(0), ...compassStops.splice(0)]) fn(); },
  };
}

/** Ask for motion access inside the user's tap where the browser offers the
 *  call (iOS, newer Chrome). Some browsers never settle it, so nothing waits on
 *  it: a later grant restarts the compass, a refusal is reported. */
function askMotionPermission(onAnswer) {
  if (typeof DeviceOrientationEvent === 'undefined' || typeof DeviceOrientationEvent.requestPermission !== 'function') return;
  try {
    DeviceOrientationEvent.requestPermission().then(onAnswer, () => onAnswer('denied'));
  } catch { onAnswer('denied'); }
}

/* -------------------------------- the view -------------------------------- */

/**
 * Open the capture view over the page.
 *   horizon()           the record being edited (read for the overview strip)
 *   onLine(line, kind)  a finished trace; kind is 'skyline' or 'overhang'.
 *                       Returns a sentence for the status line.
 *   onPoint(p)          a single skyline point; returns a sentence
 *   onUndo()            undo the last edit; canUndo() says whether one exists
 *   onClose(message)    after the view closed
 * Returns { close }.
 */
export function openCapture({ horizon, onLine, onPoint, onUndo, canUndo, onClose }) {
  const before = document.activeElement;
  const el = document.createElement('div');
  el.className = 'cap';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'cap-title');
  el.innerHTML = `
    <video class="cap-video" id="cap-video" autoplay playsinline muted aria-hidden="true"></video>
    <canvas class="cap-ar" id="cap-ar" aria-hidden="true"></canvas>
    <div class="cap-cross" aria-hidden="true"></div>
    <div class="cap-top">
      <h3 id="cap-title" class="visually-hidden">Capture the horizon with the camera</h3>
      <p class="cap-read mono" id="cap-read">Starting the sensors…</p>
      <p class="cap-north" id="cap-north"></p>
      <p class="cap-status" id="cap-status" role="status" aria-live="polite">Hold the phone upright and point the camera at the skyline.</p>
    </div>
    <div class="cap-bottom">
      <canvas class="cap-strip" id="cap-strip" aria-hidden="true"></canvas>
      <div class="cap-bar">
        <div class="cap-modes" role="group" aria-label="What to trace">
          <button class="btn small" type="button" id="cap-mode-skyline" aria-pressed="true">Skyline</button>
          <button class="btn small" type="button" id="cap-mode-overhang" aria-pressed="false">Overhang</button>
        </div>
        <button class="btn primary cap-trace" type="button" id="cap-trace" aria-pressed="false">Start tracing</button>
        <button class="btn" type="button" id="cap-point">Add point</button>
        <button class="btn" type="button" id="cap-undo">Undo</button>
        <button class="btn" type="button" id="cap-reread">Re-read compass</button>
        <button class="btn" type="button" id="cap-done">Done</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  const $ = (id) => el.querySelector(id);
  const video = $('#cap-video'), strip = $('#cap-strip'), ar = $('#cap-ar');
  const status = (text) => { $('#cap-status').textContent = text; };

  let mode = 'skyline';
  let trace = null;          // { kind, samples } while tracing
  let frame = null;
  let stream = null;
  let wake = null;
  let closed = false;
  let lastMessage = '';
  const started = now();
  const sensors = orientation(() => {
    const p = sensors.pointing();
    if (trace && p) {
      const last = trace.samples[trace.samples.length - 1];
      if (!last || Math.abs(azDelta(p.az, last.az)) >= TRACE_STEP || Math.abs(p.alt - last.alt) >= TRACE_STEP) {
        trace.samples.push(p);
      }
    }
    schedule();
  });

  function schedule() { if (frame == null && !closed) frame = requestAnimationFrame(render); }

  function render() {
    frame = null;
    if (closed) return;
    const st = sensors.state, p = sensors.pointing(), age = now() - started;
    let read;
    if (p) read = `${fmt(p.az)}° ${cardinal(p.az)} · ${fmt(p.alt)}° high`;
    else if (st.rel && st.settle != null) {
      read = `The compass is settling (it moved ${fmt(st.settle)}° in the last moment): hold the phone upright and still.`;
    } else if (st.rel) read = 'Finding north from the compass… hold the phone upright and still.';
    else read = age > SENSOR_WAIT_MS
      ? 'No motion sensor readings: use a phone or tablet with a gyroscope and compass.'
      : 'Starting the sensors…';
    if (st.rel && !st.abs && st.offset == null && age > SENSOR_WAIT_MS) {
      read = 'This device gives no compass direction, so north cannot be set.';
    }
    $('#cap-read').textContent = read;
    $('#cap-north').textContent = st.offset == null ? ''
      : `North from the compass, within about ${fmt(Math.max(1, st.spread))}°. Compasses can be 5–10° off near cars, railings and buildings.`
        + (st.northUnsteady ? ' The compass did not settle, so north may be further off: press Re-read compass while holding still.' : '')
        + (st.compassOnly ? ' This device has no gyroscope reading, so the trace follows the compass.' : '');
    const ready = !!p;
    $('#cap-trace').disabled = !ready && !trace;
    $('#cap-point').disabled = !ready || mode !== 'skyline' || !!trace;
    $('#cap-undo').disabled = !canUndo() || !!trace;
    $('#cap-reread').disabled = !st.abs || !!trace;
    $('#cap-trace').textContent = trace ? `Stop tracing (${trace.samples.length})` : 'Start tracing';
    $('#cap-trace').setAttribute('aria-pressed', String(!!trace));
    $('#cap-mode-skyline').setAttribute('aria-pressed', String(mode === 'skyline'));
    $('#cap-mode-overhang').setAttribute('aria-pressed', String(mode === 'overhang'));
    for (const b of el.querySelectorAll('.cap-modes .btn')) b.disabled = !!trace;
    drawStrip(p);
    drawAR();
    // Keep the "no readings" messages coming without a reading to trigger them.
    if (!p && age < SENSOR_WAIT_MS + 500) setTimeout(schedule, 250);
  }

  /* An overview of the whole circle: the skyline, overhangs, the trace in
     progress and where the cross points. */
  function drawStrip(p) {
    const w = Math.max(200, Math.round(strip.clientWidth || 320)), hgt = 56;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    if (strip.width !== Math.round(w * dpr)) { strip.width = Math.round(w * dpr); strip.height = Math.round(hgt * dpr); }
    const ctx = strip.getContext('2d');
    if (!ctx) return;
    const V = vizTheme();
    const X = (az) => wrapAz(az) / 360 * w;
    const Y = (alt) => hgt - (Math.max(STRIP_ALT[0], Math.min(STRIP_ALT[1], alt)) - STRIP_ALT[0]) / (STRIP_ALT[1] - STRIP_ALT[0]) * hgt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = V.canvas;
    ctx.fillRect(0, 0, w, hgt);
    ctx.strokeStyle = V.grid;
    ctx.lineWidth = 1;
    for (const az of [90, 180, 270]) { ctx.beginPath(); ctx.moveTo(X(az) + 0.5, 0); ctx.lineTo(X(az) + 0.5, hgt); ctx.stroke(); }
    const h = horizon();
    const pts = normalizePoints(h && h.points);
    if (pts.length) {
      const ring = pts.length === 1 ? [{ az: 0, alt: pts[0].alt }, { az: 360, alt: pts[0].alt }]
        : [{ az: pts[pts.length - 1].az - 360, alt: pts[pts.length - 1].alt }, ...pts, { az: pts[0].az + 360, alt: pts[0].alt }];
      ctx.beginPath();
      ctx.moveTo(ring[0].az / 360 * w, hgt);
      for (const q of ring) ctx.lineTo(q.az / 360 * w, Y(q.alt));
      ctx.lineTo(ring[ring.length - 1].az / 360 * w, hgt);
      ctx.closePath();
      ctx.fillStyle = V.obstacleFill;
      ctx.fill();
    }
    ctx.strokeStyle = V.obstacleStroke;
    ctx.setLineDash([4, 3]);
    for (const line of (h && h.overhangs) || []) {
      ctx.beginPath();
      // overhang azimuths run 0-360 inclusive, so no wrap here
      line.forEach((q, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, q.az / 360 * w, Y(q.alt)));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (trace && trace.samples.length > 1) {
      ctx.strokeStyle = V.text;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      trace.samples.forEach((q, i) => {
        const prev = trace.samples[i - 1];
        if (!i || Math.abs(q.az - prev.az) > 180) ctx.moveTo(X(q.az), Y(q.alt)); else ctx.lineTo(X(q.az), Y(q.alt));
      });
      ctx.stroke();
    }
    if (p) {
      ctx.fillStyle = V.warn;
      ctx.beginPath();
      ctx.arc(X(p.az), Y(p.alt), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* What is recorded, drawn over the camera image where it belongs: the level
     horizon with compass marks, the skyline, overhang edges and the trace in
     progress, as lines only so the scene stays visible.
     The camera's field of view is assumed (DEFAULT_FOV_LONG along the long
     side of the video); the crosshair itself is exact. */
  function drawAR() {
    const started = now();
    const W = el.clientWidth, Hh = el.clientHeight;
    if (!W || !Hh) return;
    // Lines and soft shading need no more than 1.5x pixels; fewer pixels keep
    // every frame cheap enough to follow the phone.
    const dpr = Math.max(1, Math.min(AR_MAX_DPR, window.devicePixelRatio || 1));
    if (ar.width !== Math.round(W * dpr) || ar.height !== Math.round(Hh * dpr)) {
      ar.width = Math.round(W * dpr);
      ar.height = Math.round(Hh * dpr);
    }
    const ctx = ar.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, Hh);
    const st = sensors.state, view = sensors.pointing();
    if (!st.relQ || !view) return;
    // Focal length in CSS pixels: the video covers the view (object-fit: cover),
    // so its long side, scaled to cover, spans the camera's long-side angle.
    const vw = video.videoWidth, vh = video.videoHeight;
    const shown = vw && vh ? Math.max(vw, vh) * Math.max(W / vw, Hh / vh) : Math.max(W, Hh);
    const f = shown / 2 / Math.tan(DEFAULT_FOV_LONG * Math.PI / 360);
    // Device axes are portrait; turn them with the screen.
    const turn = ((typeof screen !== 'undefined' && screen.orientation && screen.orientation.angle) || 0) * Math.PI / 180;
    const c = Math.cos(turn), sn = Math.sin(turn);
    // Only directions within reach of the camera axis can be on screen; near
    // the zenith or nadir every azimuth can be.
    const reach = Math.abs(view.alt) > 40 ? 180 : Math.atan(Math.hypot(W, Hh) / 2 / f) * 180 / Math.PI + 8;
    const near = (az) => Math.abs(azDelta(az, view.az)) <= reach;
    const at = (az, alt) => {
      if (!near(az)) return null;
      const q = cameraProject(st.relQ, st.offset, az, alt);
      if (!q) return null;
      const sx = q.x * c - q.y * sn, sy = q.x * sn + q.y * c;
      return { x: W / 2 + f * sx, y: Hh / 2 - f * sy };
    };
    // A line of directions as on-screen runs, broken where it leaves the view.
    const runs = (dirs) => {
      const out = [];
      let cur = null;
      for (const d of dirs) {   // a null entry breaks the run
        const pt = d && at(d.az, d.alt);
        if (pt) {
          if (!cur) { cur = []; out.push(cur); }
          cur.push(pt);
        } else cur = null;
      }
      return out.filter((r) => r.length > 1);
    };
    const strokeRun = (r) => {
      ctx.beginPath();
      r.forEach((pt, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, pt.x, pt.y));
      ctx.stroke();
    };
    // Straight lines in azimuth/altitude, sampled every degree so they bend
    // the way the camera sees them; stretches out of reach are skipped.
    const dense = (line) => {
      const out = [];
      line.forEach((pt, i) => {
        if (i) {
          const prev = line[i - 1], n = Math.max(1, Math.ceil(Math.abs(pt.az - prev.az)));
          for (let k = 1; k < n; k++) {
            const az = prev.az + (pt.az - prev.az) * k / n;
            if (near(az)) out.push({ az, alt: prev.alt + (pt.alt - prev.alt) * k / n });
            else if (out.length && out[out.length - 1] !== null) out.push(null);
          }
        }
        out.push(pt);
      });
      return out;
    };
    const V = vizTheme();
    ctx.lineJoin = 'round';

    // the level horizon, with a mark every 10 deg and the compass points named
    const span = Math.ceil(reach);
    const level = [];
    for (let d = -span; d <= span; d += 2) level.push({ az: view.az + d, alt: 0 });
    ctx.strokeStyle = V.dim;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    for (const r of runs(level)) strokeRun(r);
    ctx.setLineDash([]);
    ctx.fillStyle = V.text;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.beginPath();
    for (let az = 0; az < 360; az += 10) {
      const lo = at(az, -0.6), hi = at(az, az % 45 === 0 ? 1.5 : 0.6);
      if (!lo || !hi) continue;
      ctx.moveTo(lo.x, lo.y);
      ctx.lineTo(hi.x, hi.y);
      if (az % 45 === 0) {
        const label = at(az, 2.2);
        if (label) ctx.fillText(cardinal(az), label.x, label.y);
      }
    }
    ctx.stroke();

    const h = horizon();
    const pts = normalizePoints(h && h.points);
    if (pts.length) {
      const ring = pts.length === 1 ? [{ az: 0, alt: pts[0].alt }, { az: 360, alt: pts[0].alt }]
        : [{ az: pts[pts.length - 1].az - 360, alt: pts[pts.length - 1].alt }, ...pts, { az: pts[0].az + 360, alt: pts[0].alt }];
      ctx.strokeStyle = V.obstacleStroke;
      ctx.lineWidth = 2.5;
      for (const r of runs(dense(ring))) strokeRun(r);
    }

    const edges = ((h && h.overhangs) || []).map((edge) => runs(dense(edge)));
    ctx.strokeStyle = V.obstacleStroke;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 5]);
    for (const rs of edges) for (const r of rs) strokeRun(r);
    ctx.setLineDash([]);

    if (trace && trace.samples.length > 1) {
      ctx.strokeStyle = V.warn;
      ctx.lineWidth = 3;
      for (const r of runs(trace.samples)) strokeRun(r);
    }
  }

  /* ---- tracing ---- */
  function startTrace() {
    if (trace || !sensors.pointing()) return;
    trace = { kind: mode, samples: [sensors.pointing()] };
    status(mode === 'overhang'
      ? 'Tracing an overhang: follow the underside of the balcony or roof edge, then press Stop tracing.'
      : 'Tracing: keep the cross on the skyline while you turn, then press Stop tracing.');
    render();   // the button says so at once, not a frame later
  }

  function finishTrace() {
    if (!trace) return;
    const { kind, samples } = trace;
    trace = null;
    const line = sweepLine(samples);
    if (!line.length) {
      status('Nothing traced: start tracing, then turn along the skyline before stopping.');
    } else {
      lastMessage = onLine(line, kind) || '';
      status(lastMessage);
    }
    render();   // the button says so at once, not a frame later
  }

  const traceBtn = $('#cap-trace');
  traceBtn.addEventListener('click', () => { if (trace) finishTrace(); else startTrace(); });

  $('#cap-point').addEventListener('click', () => {
    const p = sensors.pointing();
    if (!p || trace) return;
    lastMessage = onPoint(p) || '';
    status(lastMessage);
    schedule();
  });
  $('#cap-undo').addEventListener('click', () => {
    if (trace) return;
    onUndo();
    status('Undone.');
    schedule();
  });
  $('#cap-reread').addEventListener('click', () => {
    sensors.rereadNorth();
    status('Hold still for a moment while the compass is read again.');
    schedule();
  });
  for (const m of ['skyline', 'overhang']) {
    $(`#cap-mode-${m}`).addEventListener('click', () => {
      if (trace) return;
      mode = m;
      // The pressed state changes at once, not on the next frame.
      for (const k of ['skyline', 'overhang']) $(`#cap-mode-${k}`).setAttribute('aria-pressed', String(k === m));
      status(m === 'overhang'
        ? 'Overhang: trace the underside of a balcony, roof or branch. The sky above that edge is blocked.'
        : 'Skyline: trace along the tops of trees and roofs.');
      schedule();
    });
  }
  $('#cap-done').addEventListener('click', () => close());

  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); close(); return; }
    if (ev.key === 'Tab') {   // keep focus inside the view
      const buttons = [...el.querySelectorAll('button:not(:disabled)')];
      if (!buttons.length) return;
      const i = buttons.indexOf(document.activeElement);
      ev.preventDefault();
      buttons[(i + (ev.shiftKey ? buttons.length - 1 : 1) + buttons.length) % buttons.length].focus();
    }
  });
  const onVisibility = () => { if (document.visibilityState === 'visible' && !closed) keepAwake(); };
  document.addEventListener('visibilitychange', onVisibility);

  async function keepAwake() {
    try { wake = await navigator.wakeLock?.request('screen'); } catch { wake = null; }
  }

  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
      });
      if (closed) { for (const t of stream.getTracks()) t.stop(); return; }
      video.srcObject = stream;
    } catch (error) {
      el.classList.add('cap-no-video');
      status(`The camera is not available (${error && error.name ? error.name : 'unknown reason'}). You can still aim with the back of the phone.`);
    }
  }

  function close() {
    if (closed) return;
    finishTrace();
    closed = true;
    if (frame != null) cancelAnimationFrame(frame);
    sensors.stop();
    if (stream) for (const t of stream.getTracks()) t.stop();
    video.srcObject = null;
    try { wake?.release(); } catch { /* already released */ }
    document.removeEventListener('visibilitychange', onVisibility);
    el.remove();
    if (before && before.isConnected && typeof before.focus === 'function') before.focus();
    onClose(lastMessage);
  }

  traceBtn.focus();
  render();
  askMotionPermission((answer) => {
    if (closed) return;
    if (answer === 'granted') sensors.restartCompass();
    else if (answer === 'denied') status('Motion and orientation access was not allowed, so the capture cannot follow the phone.');
  });
  startCamera();
  keepAwake();
  return { close };
}
