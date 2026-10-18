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
import { MOTION_WORKER_URL } from './capturemotion.js?v=2';
import {
  wrapAz, azDelta, quaternionPointing, orientationQuaternion, cameraProject, circularMean,
  sweepLine, normalizePoints, closeLoop, moonDirection, referenceUsable,
  referenceOffset, siteDistanceM, julianDay, angularVelocity, smoothOrientation, matchMotion,
} from './core.js?v=77';

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
// How the camera image relates to the gyroscope, measured on a Pixel 7a
// (2026-10-15, frame motion against the gyroscope while panning): the image
// trails the gyroscope by about 210 ms (225 sideways, 195 up-down), and its
// focal length is 0.864 (sideways) and 0.752 (up-down) of the video's long
// side, a long-side field of view of 60 and 67 deg. Each device refines its
// own values while the user pans (calibrate()).
const DEFAULT_DELAY_MS = 210;
const DEFAULT_KX = 0.864;
const DEFAULT_KY = 0.752;
const CAL_MIN_CORR = 0.85;         // image and gyroscope must agree this well to update the calibration
const CAL_WINDOW_MS = 8000;        // motion compared each time
const HISTORY_MS = 2000;           // orientation kept to look back by the image's delay
// What is shown (the readout and the overlay) is averaged over up to this
// much either side of the moment the camera image shows: the delay leaves
// readings after that moment too, so the average is centred and calms the
// sensor's jitter without adding lag. On a phone whose camera trails by less,
// the window narrows to what exists on both sides; it is never one-sided. What is recorded is not averaged, so a sharp
// peak traced quickly keeps its place.
const SMOOTH_MS = 60;
const READOUT_MS = 120;            // the direction readout changes at most this often
// Sharper motion: in dim light the camera exposes each frame for up to 60 ms
// (measured on a Pixel 7a), which smears motion, drops the frame rate and
// adds delay. Browsers offer no stabilisation control, but manual exposure:
// 1/60 s, with the sensitivity raised to keep the brightness.
const SHORT_EXPOSURE = 1000 / 60 * 10;   // in the API's 0.1 ms units
const AR_MAX_DPR = 1.5;            // overlay canvas pixel density cap
const LOOP_MAX_DEG = 3;            // a larger closing error is a missed aim, not drift
const SITE_NEAR_M = 75;            // further from the site than this (or twice the GPS accuracy) is worth a warning
const TRACE_STEP = 0.2;            // degrees between stored trace samples
const STRIP_ALT = [-10, 60];

const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                   'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const cardinal = (az) => CARDINALS[Math.round(wrapAz(az) / 22.5) % 16];
const fmt = (v) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
/** The crosshair's direction in fixed-width columns, so digits do not jump. */
const fmtDir = (p) => `${wrapAz(Math.round(p.az * 10) / 10).toFixed(1).padStart(5)}° ${cardinal(p.az).padEnd(3)} · alt ${p.alt.toFixed(1).padStart(5)}°`;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** Milliseconds on the clock the motion worker also uses. */
const epochNow = () => (typeof performance !== 'undefined' ? performance.timeOrigin + performance.now() : Date.now());

/** True when this browser could capture: a camera API and an orientation API.
 *  Whether the device really has the sensors shows only once readings arrive. */
export function captureAvailable() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
    && (typeof globalThis.RelativeOrientationSensor === 'function' || typeof DeviceOrientationEvent !== 'undefined');
}

/** Keep the phone's compass running at a low rate ahead of a capture. A
 *  compass that has just started needs about 10 s to settle (measured on a
 *  Pixel 7a); the browser shares one compass between all its users, so a
 *  capture opened later gets settled readings at once. Returns a function
 *  that stops it (one that does nothing where there is no compass sensor). */
export function warmCompass() {
  const Ctor = globalThis.AbsoluteOrientationSensor;
  if (typeof Ctor !== 'function') return () => {};
  try {
    const s = new Ctor({ frequency: 10, referenceFrame: 'device' });
    s.addEventListener('error', () => { try { s.stop(); } catch { /* already stopped */ } });
    s.start();
    return () => { try { s.stop(); } catch { /* already stopped */ } };
  } catch { return () => {}; }
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
    source: null,   // null: the compass; else { kind, label, at, altError, compassDiff }
    absTimes: [],   // when compass readings arrived in the last 2 s, for the status line
    history: [],    // { t, q }: recent relative orientation (epoch ms), to look back
    rates: [],      // { t, wx, wy }: angular rate about the device's x and y axes
  };
  const relStops = [], compassStops = [];

  /** The relative orientation at epoch time t; `smooth` averages it over up
   *  to SMOOTH_MS either side (centred: narrower when the camera trails the
   *  gyroscope by less than that), for display. */
  function qAt(t, smooth = false) {
    return (smooth && smoothOrientation(st.history, t, SMOOTH_MS)) || qRaw(t);
  }

  /** The orientation at epoch time t, blended between the two readings around it. */
  function qRaw(t) {
    const h = st.history;
    if (!h.length) return null;
    if (t <= h[0].t) return h[0].q;
    if (t >= h[h.length - 1].t) return h[h.length - 1].q;
    let i = h.length - 1;
    while (i > 0 && h[i - 1].t > t) i--;
    const a = h[i - 1], b = h[i], f = (t - a.t) / (b.t - a.t || 1);
    const sign = a.q[0] * b.q[0] + a.q[1] * b.q[1] + a.q[2] * b.q[2] + a.q[3] * b.q[3] < 0 ? -1 : 1;
    const q = a.q.map((v, k) => v * (1 - f) + sign * b.q[k] * f);
    const n = Math.hypot(...q) || 1;
    return q.map((v) => v / n);
  }
  /** Where the camera pointed at epoch time t, without north (relative azimuth). */
  const relAt = (t, smooth = false) => { const q = qAt(t, smooth); return q ? quaternionPointing(q) : null; };
  /** Where the camera pointed at epoch time t, with north. */
  const pointingAt = (t, smooth = false) => {
    const p = st.offset != null ? relAt(t, smooth) : null;
    return p ? { az: wrapAz(p.az + st.offset), alt: p.alt } : null;
  };

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
    st.source = null;
  }

  /** North from a reference in the crosshair (the Moon or a landmark). It
   *  replaces the compass for the rest of the capture; the compass's own
   *  reading, where there is one, is kept only to say how far it was off. */
  function setReference(reference, info, measured = st.rel) {
    if (!measured) return null;
    const { offset, altError } = referenceOffset(measured, reference);
    const t = now();
    const fresh = st.pairs.filter((pr) => t - pr.t <= NORTH_WINDOW_MS);
    const compass = fresh.length ? circularMean(fresh.map((pr) => pr.d)) : null;
    st.offset = offset;
    st.spread = null;
    st.northUnsteady = false;
    st.compassOnly = false;
    st.source = { ...info, at: new Date(), altError, compassDiff: compass ? azDelta(compass.mean, offset) : null };
    return st.source;
  }

  function relative(q, src) {
    const t = now();
    // The sensor API wins over the older events while it keeps reporting.
    if (src === 'event' && st.relSrc === 'sensor' && t - st.relAt < 500) return;
    // A real relative source after a compass-only start: north is read again,
    // so no compass-against-itself sample stays in the average.
    if (src !== 'compass' && st.compassOnly) { st.compassOnly = false; rereadNorth(); }
    const p = quaternionPointing(q);
    const e = epochNow(), last = st.history[st.history.length - 1];
    if (last && src !== 'compass' && e > last.t) {
      const [wx, wy] = angularVelocity(last.q, q, (e - last.t) / 1000);
      st.rates.push({ t: (e + last.t) / 2, wx, wy });
      while (st.rates.length && e - st.rates[0].t > CAL_WINDOW_MS) st.rates.shift();
    }
    st.history.push({ t: e, q });
    while (st.history.length > 2 && e - st.history[0].t > HISTORY_MS) st.history.shift();
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
    st.absTimes.push(t);
    while (st.absTimes.length && t - st.absTimes[0] > 2000) st.absTimes.shift();
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
    qAt,
    relAt,
    pointingAt,
    /** Forget north, start the compass again and average it afresh. */
    rereadNorth() { rereadNorth(); st.compassStarts = 0; startCompass(); },
    setReference,
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
 *   site()              the observing site { lat, lon, label } or null, for
 *                       the Moon reference and the distance check
 *   calibration         this device's stored { delayMs, kx, ky } or null
 *   onCalibrated(cal)   store an improved calibration for this device;
 *                       null forgets it (Reset camera calibration)
 * Returns { close }.
 */
export function openCapture({ horizon, onLine, onPoint, onUndo, canUndo, onClose, site = () => null,
  calibration = null, onCalibrated = () => {} }) {
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
      <div class="cap-topline">
        <button class="btn cap-done" type="button" id="cap-done">✕ Done</button>
        <p class="cap-read mono" id="cap-read">Starting the sensors…</p>
      </div>
      <button class="btn cap-north-btn" type="button" id="cap-north-btn" aria-expanded="false" aria-controls="cap-ref">
        <span id="cap-north">North: finding…</span><span aria-hidden="true">▾</span></button>
      <p class="cap-site" id="cap-site"></p>
      <p class="cap-status" id="cap-status" role="status" aria-live="polite">Hold the phone upright and point the camera at the skyline.</p>
    </div>
    <div class="cap-bottom">
      <div class="cap-panel" id="cap-loop" role="group" aria-labelledby="cap-loop-text" hidden>
        <p id="cap-loop-text">You turned all the way round. Is the cross back on the spot where you started?</p>
        <div class="cap-row cap-pair">
          <button class="btn primary" type="button" id="cap-loop-yes">Yes, close the loop</button>
          <button class="btn" type="button" id="cap-loop-no">No, keep as traced</button>
        </div>
      </div>
      <div class="cap-panel" id="cap-ref" role="group" aria-labelledby="cap-ref-title" hidden>
        <p id="cap-ref-title"><b>Set north</b>: put the cross on one of these, then tap it.</p>
        <p class="cap-small" id="cap-north-detail"></p>
        <p class="cap-small mono" id="cap-compass-diag"></p>
        <p class="cap-small" id="cap-ref-sky"></p>
        <div class="cap-row cap-pair">
          <button class="btn" type="button" id="cap-ref-moon">Moon is in the cross</button>
        </div>
        <div class="cap-row">
          <input class="cap-ref-az" id="cap-ref-az" type="number" min="0" max="359.9" step="0.1" inputmode="decimal"
            placeholder="Bearing °" aria-label="Landmark bearing in degrees from true north">
          <button class="btn" type="button" id="cap-ref-landmark">Landmark is in the cross</button>
        </div>
        <div class="cap-row cap-pair">
          <button class="btn" type="button" id="cap-ref-compass">Compass again</button>
          <button class="btn" type="button" id="cap-ref-close">Close</button>
        </div>
        <p class="cap-small mono" id="cap-camera-diag"></p>
        <div class="cap-row cap-pair">
          <button class="btn" type="button" id="cap-cal-reset">Reset camera calibration</button>
        </div>
      </div>
      <canvas class="cap-strip" id="cap-strip" aria-hidden="true"></canvas>
      <div class="cap-main">
        <div class="cap-row">
          <div class="cap-modes" role="group" aria-label="What to trace">
            <button class="btn" type="button" id="cap-mode-skyline" aria-pressed="true">Skyline</button>
            <button class="btn" type="button" id="cap-mode-overhang" aria-pressed="false">Overhang</button>
          </div>
          <button class="btn cap-chip" type="button" id="cap-exposure" aria-pressed="false" hidden
            title="A shorter exposure: smoother, sharper video while turning, a little grainier">Sharper motion</button>
        </div>
        <div class="cap-thumb">
          <button class="btn" type="button" id="cap-undo">↶ Undo</button>
          <button class="btn primary cap-trace" type="button" id="cap-trace" aria-pressed="false">Start tracing</button>
          <button class="btn" type="button" id="cap-point">＋ Add point</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  const $ = (id) => el.querySelector(id);
  const video = $('#cap-video'), strip = $('#cap-strip'), ar = $('#cap-ar');
  const status = (text) => { $('#cap-status').textContent = text; };

  let mode = 'skyline';
  let trace = null;          // { kind, samples } while tracing
  let pending = null;        // a full-turn trace waiting for "close the loop?"
  let refOpen = false;       // the Set north panel is open
  let frame = null;
  let stream = null;
  let wake = null;
  let closed = false;
  let lastMessage = '';
  let motion = null;         // { worker, track, frames, size }: the camera-motion worker
  let calTimer = null;
  let calUpdatedAt = null;   // when this capture last improved the calibration
  const lastRead = { at: 0, dir: false };
  const started = now();
  // What the screen shows is the camera image, which trails the gyroscope:
  // everything the user aims with (readout, overlay, trace, points,
  // references) uses the orientation from that long ago.
  const cal = {
    delayMs: DEFAULT_DELAY_MS, kx: DEFAULT_KX, ky: DEFAULT_KY, measured: false,
    ...(calibration && typeof calibration === 'object' ? calibration : {}),
  };
  const shownAt = () => epochNow() - cal.delayMs;
  const view = () => sensors.pointingAt(shownAt());
  const calmView = () => sensors.pointingAt(shownAt(), true);   // calmed, for display only
  const sensors = orientation(() => {
    const p = view();
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
    const st = sensors.state, p = calmView(), age = now() - started;
    let read;
    if (p) read = fmtDir(p);
    else if (st.rel && st.settle != null) {
      read = `The compass is settling (it moved ${fmt(st.settle)}° in the last moment): hold the phone upright and still.`;
    } else if (st.rel) read = 'Finding north from the compass… hold the phone upright and still.';
    else read = age > SENSOR_WAIT_MS
      ? 'No motion sensor readings: use a phone or tablet with a gyroscope and compass.'
      : 'Starting the sensors…';
    if (st.rel && !st.abs && st.offset == null && age > SENSOR_WAIT_MS) {
      read = 'This device gives no compass direction, so north cannot be set.';
    }
    // A direction changes at most every READOUT_MS, so the digits can be read.
    const t = now();
    if (!p || !lastRead.dir || t - lastRead.at >= READOUT_MS) {
      $('#cap-read').textContent = read;
      lastRead.at = t;
      lastRead.dir = !!p;
    }
    $('#cap-read').classList.toggle('cap-read-msg', !p);
    $('#cap-north').textContent = northShort(st);
    $('#cap-north-detail').textContent = northText(st);
    $('#cap-compass-diag').textContent = compassDiag(st);
    $('#cap-camera-diag').textContent = cameraDiag();
    const ready = !!p, busy = !!trace || !!pending;
    $('#cap-trace').disabled = (!ready && !trace) || !!pending;
    $('#cap-point').disabled = !ready || mode !== 'skyline' || busy;
    $('#cap-undo').disabled = !canUndo() || busy;
    $('#cap-north-btn').disabled = busy;
    $('#cap-north-btn').setAttribute('aria-expanded', String(refOpen));
    $('#cap-ref').hidden = !refOpen;
    $('#cap-loop').hidden = !pending;
    // A panel takes the place of the controls and the strip, so the bottom
    // area never grows over the crosshair in the middle of the screen.
    el.classList.toggle('cap-asking', refOpen || !!pending);
    if (refOpen) renderReferences(st);
    $('#cap-trace').textContent = trace ? `Stop tracing (${trace.samples.length})` : 'Start tracing';
    $('#cap-trace').setAttribute('aria-pressed', String(!!trace));
    $('#cap-mode-skyline').setAttribute('aria-pressed', String(mode === 'skyline'));
    $('#cap-mode-overhang').setAttribute('aria-pressed', String(mode === 'overhang'));
    for (const b of el.querySelectorAll('.cap-modes .btn')) b.disabled = busy;
    drawStrip(p);
    drawAR();
    // Keep the "no readings" messages coming without a reading to trigger them.
    if (!p && age < SENSOR_WAIT_MS + 500) setTimeout(schedule, 250);
  }

  const clock = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  /** What the compass is doing, for the north panel: enough to say why
   *  north is missing without a debugging session. */
  function compassDiag(st) {
    const t = now();
    const rate = st.absTimes.filter((x) => t - x <= 1000).length;
    if (!st.abs) return 'Compass: no readings yet.';
    let text = `Compass: ${rate} reading${rate === 1 ? '' : 's'} a second`;
    if (t - st.absAt > 1000) text += `, silent for ${fmt((t - st.absAt) / 1000)} s`;
    if (st.offset == null) {
      text += st.settle != null ? `, settling (moved ${fmt(st.settle)}° within the last moments)` : ', collecting readings';
      if (Math.abs(st.abs.alt) >= NORTH_MAX_ALT) text += '; hold the phone more upright';
    } else if (st.source) text += ', not used (north from a reference)';
    else text += ', north set';
    if (st.compassStarts > 1) text += `; restarted ${st.compassStarts - 1} time${st.compassStarts === 2 ? '' : 's'}`;
    return `${text}.`;
  }

  /** What the overlay assumes about this camera and where that comes from,
   *  for the north panel: the delay, and the field of view across the
   *  video's long side as the sideways and the up-down motion measure it
   *  (one camera, so the two should agree). */
  function cameraDiag() {
    const fov = (k) => Math.round(2 * Math.atan(1 / (2 * k)) * 180 / Math.PI);
    let text = `Camera: ${Math.round(cal.delayMs)} ms behind the sensors; long side ${fov(cal.kx)}° (sideways), ${fov(cal.ky)}° (up-down)`;
    if (cal.measured) {
      text += calUpdatedAt ? `; measured on this phone, updated ${clock(calUpdatedAt)}` : '; measured on this phone';
    } else if (motion) {
      const upright = ((typeof screen !== 'undefined' && screen.orientation && screen.orientation.angle) || 0) === 0;
      text += upright ? '; starting values: pan slowly side to side and tilt up and down to measure'
        : '; starting values: measured only while the phone is upright';
    } else if (!stream) {
      text += el.classList.contains('cap-no-video') ? '; starting values (no camera image)' : '; starting values';
    } else {
      text += '; starting values (this browser cannot measure the camera)';
    }
    return `${text}.`;
  }

  /** Where north comes from, in a few words for the north button. */
  function northShort(st) {
    if (st.offset == null) {
      if (st.rel && st.settle != null) return 'North: the compass is settling…';
      return st.rel && !st.abs && now() - started > SENSOR_WAIT_MS ? 'North: not set (no compass)' : 'North: finding…';
    }
    if (st.source) return `North: ${st.source.label}`;
    return `North: compass, ±${fmt(Math.max(1, st.spread))}°${st.northUnsteady ? ', unsettled' : ''}`;
  }

  /** Where north comes from and how good it is, in words. */
  function northText(st) {
    if (st.offset == null) return '';
    const src = st.source;
    if (src) {
      let text = `North from ${src.label}, aimed at ${clock(src.at)}.`;
      if (src.compassDiff != null) text += ` The compass was ${fmt(Math.abs(src.compassDiff))}° off.`;
      if (src.kind !== 'landmark' && Math.abs(src.altError) >= 0.5) {
        text += ` The aim read ${fmt(Math.abs(src.altError))}° ${src.altError > 0 ? 'high' : 'low'}, so check the cross was on its centre.`;
      }
      return text;
    }
    return `North from the compass, within about ${fmt(Math.max(1, st.spread))}°. Compasses can be 5–10° off near cars, railings and buildings: North… sets it from the Moon or a landmark.`
      + (st.northUnsteady ? ' The compass did not settle, so north may be further off.' : '')
      + (st.compassOnly ? ' This device has no gyroscope reading, so the trace follows the compass.' : '');
  }

  /** The Moon as a reference now, from the observing site. */
  function skyReferences() {
    const s = site();
    if (!s || !Number.isFinite(s.lat) || !Number.isFinite(s.lon)) return null;
    const jd = julianDay(new Date());
    return { moon: moonDirection(jd, s.lat, s.lon) };
  }

  function renderReferences(st) {
    const sky = skyReferences();
    const say = (name, dir) => {
      const use = referenceUsable(dir);
      if (use.ok) return `${name} ${fmt(dir.alt)}° high in the ${cardinal(dir.az)}`;
      return use.why === 'below' ? `${name} below the horizon` : `${name} too high to set north (${fmt(dir.alt)}°)`;
    };
    $('#cap-ref-sky').textContent = !sky ? 'Set an observing site to use the Moon.' : `${say('Moon', sky.moon)}.`;
    $('#cap-ref-moon').disabled = !st.rel || !sky || !referenceUsable(sky.moon).ok;
    $('#cap-ref-landmark').disabled = !st.rel;
    $('#cap-ref-compass').disabled = !st.abs;
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
     The orientation is the one the camera image shows (cal.delayMs ago),
     and the scale is this camera's (cal.kx, cal.ky); the crosshair itself is
     exact. */
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
    const st = sensors.state, here = calmView(), q0 = sensors.qAt(shownAt(), true);
    if (!q0 || !here) return;
    // Focal length in CSS pixels: the video covers the view (object-fit: cover),
    // so its long side, scaled to cover, spans the camera's long-side angle.
    const vw = video.videoWidth, vh = video.videoHeight;
    const shown = vw && vh ? Math.max(vw, vh) * Math.max(W / vw, Hh / vh) : Math.max(W, Hh);
    const fx = cal.kx * shown, fy = cal.ky * shown;
    // Device axes are portrait; turn them with the screen.
    const turn = ((typeof screen !== 'undefined' && screen.orientation && screen.orientation.angle) || 0) * Math.PI / 180;
    const c = Math.cos(turn), sn = Math.sin(turn);
    // Only directions within reach of the camera axis can be on screen; near
    // the zenith or nadir every azimuth can be.
    const reach = Math.abs(here.alt) > 40 ? 180 : Math.atan(Math.hypot(W, Hh) / 2 / Math.min(fx, fy)) * 180 / Math.PI + 8;
    const near = (az) => Math.abs(azDelta(az, here.az)) <= reach;
    const at = (az, alt) => {
      if (!near(az)) return null;
      const q = cameraProject(q0, st.offset, az, alt);
      if (!q) return null;
      const dx = q.x * fx, dy = q.y * fy;   // device axes, scaled as this camera shows them
      return { x: W / 2 + dx * c - dy * sn, y: Hh / 2 - (dx * sn + dy * c) };
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
    // The recorded points themselves, as dots on their line.
    const dots = (list) => {
      ctx.fillStyle = V.obstacleStroke;
      ctx.strokeStyle = V.canvas;
      ctx.lineWidth = 1.5;
      for (const pt of list) {
        const xy = at(pt.az, pt.alt);
        if (!xy) continue;
        ctx.beginPath();
        ctx.arc(xy.x, xy.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
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
    for (let d = -span; d <= span; d += 2) level.push({ az: here.az + d, alt: 0 });
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
      dots(pts);
    }

    const edges = ((h && h.overhangs) || []).map((edge) => runs(dense(edge)));
    ctx.strokeStyle = V.obstacleStroke;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 5]);
    for (const rs of edges) for (const r of rs) strokeRun(r);
    ctx.setLineDash([]);
    for (const edge of (h && h.overhangs) || []) dots(edge);

    if (trace && trace.samples.length > 1) {
      ctx.strokeStyle = V.warn;
      ctx.lineWidth = 3;
      for (const r of runs(trace.samples)) strokeRun(r);
    }
  }

  /* ---- tracing ---- */
  function startTrace() {
    if (trace || !view()) return;
    trace = { kind: mode, samples: [view()] };
    status(mode === 'overhang'
      ? 'Tracing an overhang: follow the underside of the balcony or roof edge, then press Stop tracing.'
      : 'Tracing: keep the cross on the skyline while you turn, then press Stop tracing.');
    render();   // the button says so at once, not a frame later
  }

  function finishTrace() {
    if (!trace) return;
    const { kind, samples } = trace;
    trace = null;
    if (kind === 'skyline' && closeLoop(samples)) {
      // A full turn: ask whether it ended where it began before using it.
      pending = { kind, samples };
      status('Stopped after a full turn.');
      render();
      $('#cap-loop-yes').focus();
      return;
    }
    commitTrace(kind, samples, '');
    render();   // the button says so at once, not a frame later
  }

  function commitTrace(kind, samples, note) {
    const line = sweepLine(samples);
    if (!line.length) {
      status('Nothing traced: start tracing, then turn along the skyline before stopping.');
      return;
    }
    lastMessage = `${onLine(line, kind) || ''}${note ? ` ${note}` : ''}`;
    status(lastMessage);
  }

  /** Answer "is the cross back where you started?" for a full-turn trace. */
  function settleLoop(closeIt) {
    if (!pending) return;
    const { kind, samples } = pending;
    pending = null;
    if (!closeIt) {
      commitTrace(kind, samples, '');
    } else {
      const loop = closeLoop(samples);
      if (Math.abs(loop.error) <= LOOP_MAX_DEG) {
        commitTrace(kind, loop.samples, `Loop closed: ${fmt(Math.abs(loop.error))}° of drift removed.`);
      } else {
        commitTrace(kind, samples, `The end was ${fmt(Math.abs(loop.error))}° from the start, more than drift, so it is kept as traced. Trace again if it looks wrong.`);
      }
    }
    render();
    traceBtn.focus();
  }

  const traceBtn = $('#cap-trace');
  traceBtn.addEventListener('click', () => { if (trace) finishTrace(); else startTrace(); });
  $('#cap-loop-yes').addEventListener('click', () => settleLoop(true));
  $('#cap-loop-no').addEventListener('click', () => settleLoop(false));

  $('#cap-point').addEventListener('click', () => {
    const p = view();
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
  const northBtn = $('#cap-north-btn');
  northBtn.addEventListener('click', () => {
    refOpen = !refOpen;
    render();
    if (refOpen) $('#cap-ref-title').scrollIntoView({ block: 'nearest' });
  });
  const closeReferences = () => { refOpen = false; render(); northBtn.focus(); };
  const useReference = (dir, info) => {
    const src = sensors.setReference(dir, info, sensors.relAt(shownAt()));
    if (!src) { status('No reading from the motion sensors yet.'); return; }
    status(`North set from ${info.label}.`);
    closeReferences();
  };
  $('#cap-ref-moon').addEventListener('click', () => {
    const sky = skyReferences();
    const dir = sky && sky.moon;
    if (!dir || !referenceUsable(dir).ok) { render(); return; }
    useReference(dir, { kind: 'moon', label: 'the Moon' });
  });
  $('#cap-ref-landmark').addEventListener('click', () => {
    const az = Number($('#cap-ref-az').value);
    if ($('#cap-ref-az').value === '' || !Number.isFinite(az) || az < 0 || az >= 360) {
      status('Enter the landmark’s bearing from true north, 0 to 359.9°, then put the cross on it.');
      $('#cap-ref-az').focus();
      return;
    }
    const seen = sensors.relAt(shownAt());
    useReference({ az, alt: seen ? seen.alt : 0 }, { kind: 'landmark', label: `a landmark at ${fmt(az)}°` });
  });
  $('#cap-ref-close').addEventListener('click', closeReferences);
  $('#cap-cal-reset').addEventListener('click', () => {
    Object.assign(cal, { delayMs: DEFAULT_DELAY_MS, kx: DEFAULT_KX, ky: DEFAULT_KY, measured: false });
    calUpdatedAt = null;
    delete el.dataset.calibrated;
    onCalibrated(null);
    status(motion ? 'Camera calibration reset to the starting values. Pan the phone slowly to measure it again.'
      : 'Camera calibration reset to the starting values.');
    render();
  });
  $('#cap-ref-compass').addEventListener('click', () => {
    sensors.rereadNorth();
    status('Hold still for a moment while the compass is read again.');
    closeReferences();
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

  // Escape closes the view wherever focus is, even when it fell out of it.
  const onEscape = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); close(); } };
  document.addEventListener('keydown', onEscape);
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Tab') {   // keep focus inside the view
      const buttons = [...el.querySelectorAll('button:not(:disabled), input:not(:disabled)')].filter((b) => b.offsetParent !== null);
      if (!buttons.length) return;
      const i = buttons.indexOf(document.activeElement);
      ev.preventDefault();
      buttons[(i + (ev.shiftKey ? buttons.length - 1 : 1) + buttons.length) % buttons.length].focus();
    }
  });
  const onVisibility = () => { if (document.visibilityState === 'visible' && !closed) keepAwake(); };
  document.addEventListener('visibilitychange', onVisibility);

  /** Warn when the phone is far from the observing site: a horizon only holds
   *  where it was measured. Only where location access is already allowed;
   *  the capture never asks for it. */
  async function checkSite() {
    const s = site();
    if (!s || !Number.isFinite(s.lat) || !Number.isFinite(s.lon)) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions) return;
    try {
      if ((await navigator.permissions.query({ name: 'geolocation' })).state !== 'granted') return;
    } catch { return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      if (closed) return;
      const d = siteDistanceM(pos.coords.latitude, pos.coords.longitude, s.lat, s.lon);
      const near = Math.max(SITE_NEAR_M, 2 * (pos.coords.accuracy || 0));
      const far = d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
      $('#cap-site').textContent = d <= near ? ''
        : `You are about ${far} from the site${s.label ? ` “${s.label}”` : ''}. A horizon only holds where it was measured: check the site in the top bar.`;
    }, () => {}, { maximumAge: 60000, timeout: 10000 });
  }

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
      startMotion();
      offerExposure();
    } catch (error) {
      el.classList.add('cap-no-video');
      status(`The camera is not available (${error && error.name ? error.name : 'unknown reason'}). You can still aim with the back of the phone.`);
    }
  }

  /** Offer Sharper motion where the camera allows manual exposure. */
  function offerExposure() {
    const track = stream && stream.getVideoTracks()[0];
    const caps = track && typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
    const ok = Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual')
      && caps.exposureMode.includes('continuous') && caps.exposureTime && caps.iso;
    const btn = $('#cap-exposure');
    btn.hidden = !ok;
    if (!ok) return;
    const clamp = (v, r) => Math.min(r.max, Math.max(r.min, v));
    btn.addEventListener('click', async () => {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      btn.disabled = true;
      try {
        if (on) {
          const now = track.getSettings();
          const time = clamp(SHORT_EXPOSURE, caps.exposureTime);
          // the same light: exposure time and sensitivity trade one for one
          const iso = Math.round(clamp((now.iso || caps.iso.min) * (now.exposureTime || time) / time, caps.iso));
          await track.applyConstraints({ advanced: [{ exposureMode: 'manual', exposureTime: time, iso }] });
          status('Sharper motion: each frame is exposed for 1/60 s. The video may look a little grainier.');
        } else {
          await track.applyConstraints({ advanced: [{ exposureMode: 'continuous' }] });
          status('The camera sets its exposure itself again.');
        }
        btn.setAttribute('aria-pressed', String(on));
      } catch (error) {
        status(`The camera did not accept that (${error && error.name ? error.name : 'unknown reason'}).`);
      } finally {
        btn.disabled = false;
      }
    });
  }

  /** Start measuring the camera image's motion in a worker, where the browser
   *  can hand it the frames. Without it the stored or default calibration is
   *  used. */
  function startMotion() {
    if (typeof MediaStreamTrackProcessor !== 'function' || typeof Worker !== 'function' || !stream) return;
    try {
      const track = stream.getVideoTracks()[0].clone();
      const processor = new MediaStreamTrackProcessor({ track });
      const worker = new Worker(MOTION_WORKER_URL, { type: 'module' });
      motion = { worker, track, frames: [], size: null };
      worker.onmessage = ({ data }) => {
        if (!motion) return;
        if (data.size) motion.size = data.size;
        if (data.f) {
          motion.frames.push(data.f);
          while (motion.frames.length && data.f[1] - motion.frames[0][1] > CAL_WINDOW_MS) motion.frames.shift();
          el.dataset.motion = 'on';
        }
      };
      worker.postMessage({ readable: processor.readable }, [processor.readable]);
      calTimer = setInterval(calibrate, 2000);
    } catch { motion = null; }
  }

  /** Compare the image's motion with the gyroscope's over the last seconds;
   *  where they agree well, take this camera's delay and scale from them. */
  function calibrate() {
    if (!motion || !motion.size || closed) return;
    // The axes below are those of an upright phone.
    if (((typeof screen !== 'undefined' && screen.orientation && screen.orientation.angle) || 0) !== 0) return;
    const [vw, vh, aw, ah] = motion.size, long = Math.max(vw, vh);
    const rates = sensors.state.rates;
    const pick = (shiftAt, scoreAt) => motion.frames.filter((f) => f[scoreAt] > 0.6).map((f) => ({ t0: f[0], t1: f[1], d: f[shiftAt] }));
    const h = matchMotion(rates.map((r) => ({ t: r.t, w: r.wy })), pick(2, 3));
    const v = matchMotion(rates.map((r) => ({ t: r.t, w: r.wx })), pick(4, 5));
    const good = (m) => m && Math.abs(m.corr) >= CAL_MIN_CORR && m.lagMs > 0 && m.lagMs < 400;
    const blend = (old, x) => (cal.measured ? old * 0.6 + x * 0.4 : x);
    const delays = [];
    let changed = false;
    if (good(h)) {
      const k = Math.abs(h.slope) * (vw / aw) / long;
      if (k > 0.5 && k < 1.4) { cal.kx = blend(cal.kx, k); changed = true; }
      delays.push(h.lagMs);
    }
    if (good(v)) {
      const k = Math.abs(v.slope) * (vh / ah) / long;
      if (k > 0.5 && k < 1.4) { cal.ky = blend(cal.ky, k); changed = true; }
      delays.push(v.lagMs);
    }
    if (delays.length) { cal.delayMs = blend(cal.delayMs, delays.reduce((a, b) => a + b, 0) / delays.length); changed = true; }
    if (changed) {
      cal.measured = true;
      calUpdatedAt = new Date();
      el.dataset.calibrated = 'yes';
      onCalibrated({ delayMs: Math.round(cal.delayMs), kx: +cal.kx.toFixed(4), ky: +cal.ky.toFixed(4), measured: true });
    }
  }

  function close() {
    if (closed) return;
    finishTrace();
    if (pending) settleLoop(false);   // never lose a trace waiting for an answer
    closed = true;
    if (frame != null) cancelAnimationFrame(frame);
    sensors.stop();
    clearInterval(calTimer);
    if (motion) { motion.worker.terminate(); motion.track.stop(); motion = null; }
    if (stream) for (const t of stream.getTracks()) t.stop();
    video.srcObject = null;
    try { wake?.release(); } catch { /* already released */ }
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('keydown', onEscape);
    el.remove();
    if (before && before.isConnected && typeof before.focus === 'function') before.focus();
    onClose(lastMessage);
  }

  render();
  // Start on the first control that can be used: without north yet, Done.
  (traceBtn.disabled ? $('#cap-done') : traceBtn).focus();
  askMotionPermission((answer) => {
    if (closed) return;
    if (answer === 'granted') sensors.restartCompass();
    else if (answer === 'denied') status('Motion and orientation access was not allowed, so the capture cannot follow the phone.');
  });
  startCamera();
  keepAwake();
  checkSite();
  return { close };
}
