/*
 * NightSeam core - horizon skyline model (pure).
 *
 * A horizon is a skyline: points of world azimuth/altitude (degrees, azimuth
 * from north through east), sorted by azimuth and joined by straight lines
 * around the full circle. The planner reads a derived profile of BINS=720
 * world-azimuth bins (0.5 deg each); NO_BLOCK = -90 means nothing recorded.
 *
 * Overhangs (a balcony, a roof edge, a branch) are edge lines over part of
 * the circle: everything above them is blocked. They derive `profileTop`, the
 * lowest overhang edge per bin, where OPEN_TOP means nothing overhead.
 *
 * Skylines are drawn by hand, typed, imported or measured with a phone's
 * orientation sensors; there is no photo model. Records saved by builds that
 * had one keep their points and overhangs and drop the photo fields.
 *
 * This module must stay pure: no DOM, storage, network or build tokens.
 */

import { altaz, sunRaDec, moonAltAz } from './astro.js';

export const NO_BLOCK = -90;
export const BINS = 720;
export const BIN_DEG = 0.5;
export const ALT_MIN = -10;
export const ALT_MAX = 90;
export const MAX_POINTS = 1440;
export const NAME_MAX = 80;
export const OPEN_TOP = 90.5;
export const MAX_OVERHANGS = 20;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Azimuth in [0, 360). */
export function wrapAz(az) {
  const a = ((az % 360) + 360) % 360;
  return a >= 360 ? 0 : a;
}

/** Signed azimuth difference in (-180, 180]. */
export function azDelta(a, b) {
  const d = wrapAz(a - b);
  return d > 180 ? d - 360 : d;
}

const round2 = (v) => Math.round(v * 100) / 100;
const clampAlt = (v) => Math.min(ALT_MAX, Math.max(ALT_MIN, v));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
/** A name cut to NAME_MAX UTF-16 units without leaving half of a character
 *  (an emoji is two units). */
const clipName = (s) => s.slice(0, NAME_MAX).replace(/[\uD800-\uDBFF]$/, '');

/** Sorted points thinned to at most `max` (2 or more) by Douglas-Peucker at
 *  the smallest tolerance that fits, so detail goes evenly and neither end of
 *  the azimuth range is cut off. */
function thinToFit(points, max) {
  let out = points;
  for (let tol = 0.05; out.length > max; tol *= 1.5) out = simplifyLine(points, tol);
  return out;
}

/** Canonical skyline points: finite, wrapped, clamped, rounded to 0.01 deg,
 *  sorted by azimuth, one point per azimuth (the later one wins), at most
 *  MAX_POINTS (more are thinned evenly, never cut off at one end). `strict`
 *  throws on a malformed entry instead of dropping it. */
export function normalizePoints(value, strict = false) {
  return thinToFit(canonicalPoints(value, strict), MAX_POINTS);
}

function canonicalPoints(value, strict) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    if (strict) throw new Error('horizon points must be a list');
    return [];
  }
  if (strict && value.length > MAX_POINTS) throw new Error(`a horizon has at most ${MAX_POINTS} points`);
  const byAz = new Map();
  for (const p of value) {
    if (!p || !isNum(p.az) || !isNum(p.alt)) {
      if (strict) throw new Error('horizon point needs a numeric az and alt');
      continue;
    }
    const az = round2(wrapAz(p.az));
    byAz.set(az >= 360 ? 0 : az, round2(clampAlt(p.alt)));
  }
  return [...byAz].sort((a, b) => a[0] - b[0]).map(([az, alt]) => ({ az, alt }));
}

/** One canonical horizon record. Returns null (or throws when `strict`) for
 *  an unusable id. Fields of older builds (a photo placement, `hasPhoto`, an
 *  embedded image) are not part of the record and are dropped, never checked. */
export function normalizeHorizon(value, strict = false) {
  const fail = (msg) => { if (strict) throw new Error(msg); return null; };
  if (!value || typeof value !== 'object') return fail('horizon must be an object');
  if (typeof value.id !== 'string' || !ID_RE.test(value.id)) return fail('horizon has an invalid id');
  const name = typeof value.name === 'string' && value.name.trim()
    ? clipName(value.name.trim()) : 'Horizon';
  return {
    id: value.id,
    name,
    points: normalizePoints(value.points, strict),
    overhangs: normalizeOverhangs(value.overhangs, strict),
  };
}

/** Skyline altitude at an azimuth by linear interpolation around the circle,
 *  or NO_BLOCK when there are no points. Expects normalized points. */
export function skylineAltAt(points, azDeg) {
  const n = points.length;
  if (!n) return NO_BLOCK;
  if (n === 1) return points[0].alt;
  const az = wrapAz(azDeg);
  let hi = points.findIndex((p) => p.az >= az);
  if (hi === -1) hi = 0;
  const lo = (hi - 1 + n) % n;
  const a = points[lo], b = points[hi];
  if (b.az === az) return b.alt;
  const span = wrapAz(b.az - a.az) || 360;
  const t = wrapAz(az - a.az) / span;
  return a.alt + (b.alt - a.alt) * t;
}

/** The planner's 720-bin world-azimuth profile. Each bin holds the HIGHEST
 *  skyline altitude anywhere inside its 0.5 deg span (both edges and any point
 *  within), so a narrow peak between bin centres is never lost. */
export function skylineProfile(points) {
  const out = new Array(BINS).fill(NO_BLOCK);
  if (!points.length) return out;
  for (let i = 0; i < BINS; i++) {
    out[i] = Math.max(skylineAltAt(points, i * BIN_DEG), skylineAltAt(points, (i + 1) * BIN_DEG));
  }
  for (const p of points) {
    const i = Math.min(BINS - 1, Math.floor(p.az / BIN_DEG));
    if (p.alt > out[i]) out[i] = p.alt;
  }
  return out;
}

/** Attach the derived profiles to a record (in place) and return it. */
export function withProfile(h) {
  if (h) {
    h.profile = skylineProfile(h.points || []);
    h.profileTop = overhangProfile(h.overhangs || []);
  }
  return h;
}

/** World azimuth -> profile bin. */
export function binOf(azDeg) {
  return Math.min(BINS - 1, Math.floor(wrapAz(azDeg) / BIN_DEG));
}

/** The horizon ceilings at an azimuth: the skyline (`ceil`) and the lowest
 *  overhang edge above it (`ceilTop`, null when nothing is overhead). A record
 *  without 720-bin profiles blocks nothing. */
export function ceilFor(h, azDeg) {
  if (!h || !Number.isFinite(azDeg)) return { ceil: NO_BLOCK, ceilTop: null };
  const bin = binOf(azDeg);
  const prof = Array.isArray(h.profile) && h.profile.length === BINS ? h.profile : null;
  const tops = Array.isArray(h.profileTop) && h.profileTop.length === BINS ? h.profileTop : null;
  const v = prof ? prof[bin] : NO_BLOCK, t = tops ? tops[bin] : OPEN_TOP;
  return { ceil: isNum(v) ? v : NO_BLOCK, ceilTop: isNum(t) && t < OPEN_TOP ? t : null };
}

/** True when the horizon records any obstruction. */
export function hasSkyline(h) {
  return !!(h && ((Array.isArray(h.points) && h.points.length)
    || (Array.isArray(h.overhangs) && h.overhangs.length)));
}

/** Replace the points inside the azimuth span of a new line with that line.
 *  `line` is a list of {az, alt} in drawing order, each step shorter than
 *  180 deg; it may cross north. A line spanning the full circle replaces
 *  everything. When the result would pass MAX_POINTS the new line is thinned
 *  to the room left, so points outside its span are kept. */
export function replacePointsInRange(points, line) {
  const src = (Array.isArray(line) ? line : []).filter((p) => p && isNum(p.az) && isNum(p.alt));
  if (!src.length) return normalizePoints(points);
  let lo = src[0].az, hi = lo, cur = lo;
  const run = [{ az: cur, alt: src[0].alt }];   // azimuths running on past north
  for (let i = 1; i < src.length; i++) {
    cur += azDelta(src[i].az, src[i - 1].az);
    lo = Math.min(lo, cur);
    hi = Math.max(hi, cur);
    run.push({ az: cur, alt: src[i].alt });
  }
  const inside = (az) => hi - lo >= 360
    || [-360, 0, 360, 720].some((k) => az + k >= lo && az + k <= hi);
  const kept = normalizePoints(points).filter((p) => !inside(p.az));
  const room = MAX_POINTS - kept.length;
  const fresh = src.length > room && room >= 2 ? thinToFit(run.sort((a, b) => a.az - b.az), room) : src;
  return normalizePoints([...kept, ...fresh]);
}

/** Douglas-Peucker simplification of an ordered polyline of {az, alt}
 *  (planar, no wrap). Keeps the first and last point. */
export function simplifyLine(line, tolerance = 0.25) {
  if (line.length <= 2) return line.slice();
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const a = line[s], b = line[e];
    const dx = b.az - a.az, dy = b.alt - a.alt;
    const len = Math.hypot(dx, dy) || 1;
    let worst = -1, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs(dy * (line[i].az - a.az) - dx * (line[i].alt - a.alt)) / len;
      if (d > worst) { worst = d; idx = i; }
    }
    if (worst > tolerance) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

/* ---------------------------------- overhangs ---------------------------------- */

/** One canonical overhang edge: points with azimuths in [0, 360] (an edge
 *  never crosses north; split it there), rounded, clamped, sorted, one point
 *  per azimuth and at least two distinct azimuths. Null (or throws) otherwise. */
export function normalizeOverhang(value, strict = false) {
  const fail = (msg) => { if (strict) throw new Error(msg); return null; };
  if (!Array.isArray(value)) return fail('an overhang must be a list of points');
  const byAz = new Map();
  for (const p of value) {
    if (!p || !isNum(p.az) || !isNum(p.alt) || p.az < 0 || p.az > 360) {
      if (strict) throw new Error('overhang point needs an az of 0-360 and a numeric alt');
      continue;
    }
    byAz.set(round2(p.az), round2(clampAlt(p.alt)));
  }
  const pts = [...byAz].sort((a, b) => a[0] - b[0]).slice(0, MAX_POINTS)
    .map(([az, alt]) => ({ az, alt }));
  if (pts.length < 2) return fail('an overhang needs points at two different azimuths');
  return pts;
}

/** All overhangs of a record (at most MAX_OVERHANGS). */
export function normalizeOverhangs(value, strict = false) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    if (strict) throw new Error('overhangs must be a list');
    return [];
  }
  if (strict && value.length > MAX_OVERHANGS) throw new Error(`a horizon has at most ${MAX_OVERHANGS} overhangs`);
  return value.map((o) => normalizeOverhang(o, strict)).filter(Boolean).slice(0, MAX_OVERHANGS);
}

/** Overhang edge altitude at an azimuth, or null outside its span. */
export function overhangAltAt(line, az) {
  if (!line.length || az < line[0].az || az > line[line.length - 1].az) return null;
  let i = line.findIndex((p) => p.az >= az);
  if (line[i].az === az) return line[i].alt;
  const a = line[i - 1], b = line[i];
  return a.alt + (b.alt - a.alt) * (az - a.az) / (b.az - a.az);
}

/** The planner's upper-ceiling profile: for every bin an overhang touches,
 *  the LOWEST edge altitude inside the bin (conservative); OPEN_TOP elsewhere. */
export function overhangProfile(overhangs) {
  const out = new Array(BINS).fill(OPEN_TOP);
  for (const line of overhangs) {
    const a = line[0].az, b = line[line.length - 1].az;
    const last = Math.min(BINS - 1, Math.ceil(b / BIN_DEG) - 1);
    for (let i = Math.floor(a / BIN_DEG); i <= last; i++) {
      const lo = Math.max(i * BIN_DEG, a), hi = Math.min((i + 1) * BIN_DEG, b);
      if (!(hi > lo)) continue;
      let v = Math.min(overhangAltAt(line, lo), overhangAltAt(line, hi));
      for (const p of line) if (p.az > lo && p.az < hi && p.alt < v) v = p.alt;
      if (v < out[i]) out[i] = v;
    }
  }
  return out;
}

/** The part of a sorted line between two azimuths, with interpolated ends. */
function clipLine(line, from, to) {
  const a = Math.max(from, line[0].az), b = Math.min(to, line[line.length - 1].az);
  if (!(b > a)) return null;
  return [{ az: a, alt: overhangAltAt(line, a) },
    ...line.filter((p) => p.az > a && p.az < b),
    { az: b, alt: overhangAltAt(line, b) }];
}

/** Turn an ordered line whose azimuths run continuously (they may pass 360
 *  or go below 0) into overhang edges within [0, 360], split at north. */
export function splitAtNorth(line) {
  const pts = (Array.isArray(line) ? line : []).filter((p) => p && isNum(p.az) && isNum(p.alt))
    .slice().sort((x, y) => x.az - y.az);
  if (pts.length < 2) return [];
  const pieces = [];
  for (let k = Math.floor(pts[0].az / 360); k <= Math.floor(pts[pts.length - 1].az / 360); k++) {
    const piece = clipLine(pts.map((p) => ({ az: p.az - 360 * k, alt: p.alt })), 0, 360);
    const clean = piece && normalizeOverhang(piece);
    if (clean) pieces.push(clean);
  }
  return pieces.sort((x, y) => x[0].az - y[0].az);
}

/** Draw an overhang edge: existing overhangs keep only their parts outside
 *  the new edge's azimuth span; the new edge is added. The oldest overhangs
 *  give way when the limit is reached. */
export function replaceOverhangsInRange(overhangs, edge) {
  const drawn = normalizeOverhang(edge);
  const kept = normalizeOverhangs(overhangs);
  if (!drawn) return kept;
  const lo = drawn[0].az, hi = drawn[drawn.length - 1].az;
  let out = [];
  for (const line of kept) {
    for (const piece of [clipLine(line, 0, lo), clipLine(line, hi, 360)]) {
      const clean = piece && normalizeOverhang(piece);
      if (clean) out.push(clean);
    }
  }
  if (out.length >= MAX_OVERHANGS) out = out.slice(out.length - (MAX_OVERHANGS - 1));
  return [...out, drawn].sort((x, y) => x[0].az - y[0].az);
}

/** A flat overhang edge from one azimuth to another at one altitude, going
 *  east (it may cross north). */
export function flatOverhang(fromAz, toAz, alt) {
  const a = wrapAz(fromAz);
  let b = a + (wrapAz(toAz - a) || 360);
  return splitAtNorth([{ az: a, alt }, { az: b, alt }]);
}

/* ------------------------------ sun and compass ------------------------------ */

/** The Sun's apparent direction from a site at a Julian Day. */
export function sunDirection(jd, latDeg, lonDeg) {
  const [ra, dec] = sunRaDec(jd);
  const [alt, az] = altaz(ra, dec, jd, latDeg, lonDeg);
  return { az: wrapAz(az), alt };
}

/** The Moon's apparent topocentric direction from a site at a Julian Day. */
export function moonDirection(jd, latDeg, lonDeg) {
  const [alt, az] = moonAltAz(jd, latDeg, lonDeg);
  return { az: wrapAz(az), alt };
}

/** Whether a sky reference can set north: it must be up (at least 2 deg, so
 *  it clears most horizons) and not so high that azimuth means little. */
export function referenceUsable(dir, maxAlt = 60) {
  if (!dir || !isNum(dir.alt) || !isNum(dir.az)) return { ok: false, why: 'unknown' };
  if (dir.alt < 2) return { ok: false, why: 'below' };
  if (dir.alt > maxAlt) return { ok: false, why: 'high' };
  return { ok: true, why: '' };
}

/** North from a reference in the crosshair: the offset that turns the
 *  relative azimuth the phone reads into the reference's true azimuth, and
 *  how far the measured altitude is off (a check on the aim and the sensor). */
export function referenceOffset(measured, reference) {
  return { offset: wrapAz(reference.az - measured.az), altError: measured.alt - reference.alt };
}

/** Close a traced loop whose last sample points where the first did. The
 *  closing error (turned angle minus whole turns) is drift; it is removed in
 *  proportion to the angle turned so far, not to time (phase 0: drift comes
 *  with turning). Returns { samples, error } or null for less than about a
 *  full turn. */
export function closeLoop(samples) {
  const src = (Array.isArray(samples) ? samples : []).filter((p) => p && isNum(p.az) && isNum(p.alt));
  if (src.length < 3) return null;
  const unwrapped = [src[0].az];
  const turned = [0];
  for (let i = 1; i < src.length; i++) {
    const d = azDelta(src[i].az, src[i - 1].az);
    unwrapped.push(unwrapped[i - 1] + d);
    turned.push(turned[i - 1] + Math.abs(d));
  }
  const net = unwrapped[unwrapped.length - 1] - unwrapped[0];
  if (Math.abs(net) < 300) return null;   // not a full turn: nothing to close
  const turns = Math.round(net / 360);
  const error = net - 360 * turns;
  const total = turned[turned.length - 1] || 1;
  return {
    error,
    samples: src.map((p, i) => ({ az: wrapAz(unwrapped[i] - error * turned[i] / total), alt: p.alt })),
  };
}

/** Ground distance in metres between two latitude/longitude points (haversine). */
export function siteDistanceM(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Where a phone's back camera points, from W3C device orientation angles in
 *  degrees (alpha about the vertical, counter-clockwise from north; beta and
 *  gamma the front-back and side tilts, applied Z-X'-Y''). An upright phone
 *  facing north reads az 0, alt 0. */
export function devicePointing(alpha, beta, gamma) {
  const r = Math.PI / 180;
  const sA = Math.sin(alpha * r), cA = Math.cos(alpha * r);
  const sB = Math.sin(beta * r), cB = Math.cos(beta * r);
  const sG = Math.sin(gamma * r), cG = Math.cos(gamma * r);
  // R = Rz(alpha) Rx(beta) Ry(gamma) applied to the back-camera axis (0, 0, -1)
  const x = -sG * cA - cG * sB * sA;
  const y = -sG * sA + cG * sB * cA;
  const z = -cG * cB;
  return { az: wrapAz(Math.atan2(x, y) / r), alt: Math.asin(Math.max(-1, Math.min(1, z))) / r };
}

/** Where a phone's back camera points, from an orientation quaternion
 *  [x, y, z, w] that turns device coordinates into the world frame (x east,
 *  y north, z up), as the Generic Sensor OrientationSensor reports it. The
 *  relative sensor's "north" is arbitrary; the caller adds an offset. */
export function quaternionPointing(q) {
  const [x, y, z, w] = q;
  // third column of the rotation matrix, negated: the back-camera axis (0, 0, -1)
  const dx = -2 * (x * z + w * y), dy = -2 * (y * z - w * x), dz = -(1 - 2 * (x * x + y * y));
  return { az: wrapAz(Math.atan2(dx, dy) * 180 / Math.PI), alt: Math.asin(Math.max(-1, Math.min(1, dz))) * 180 / Math.PI };
}

/** The orientation quaternion [x, y, z, w] of W3C device orientation angles
 *  (degrees, applied Z-X'-Y''), the rotation devicePointing uses, so both
 *  sensor APIs feed the same quaternion path. */
export function orientationQuaternion(alpha, beta, gamma) {
  const h = Math.PI / 360;
  const [sa, ca] = [Math.sin(alpha * h), Math.cos(alpha * h)];
  const [sb, cb] = [Math.sin(beta * h), Math.cos(beta * h)];
  const [sg, cg] = [Math.sin(gamma * h), Math.cos(gamma * h)];
  // qz(alpha) * qx(beta) * qy(gamma)
  return [
    ca * sb * cg - sa * cb * sg,
    ca * cb * sg + sa * sb * cg,
    sa * cb * cg + ca * sb * sg,
    ca * cb * cg - sa * sb * sg,
  ];
}

/** Where a world direction (true azimuth `az`, altitude `alt`, degrees) shows
 *  in the camera of a device with orientation quaternion `q` (see
 *  quaternionPointing), whose quaternion azimuths read `offset` deg less than
 *  true ones. Returns {x, y} as tangents of the angles off the camera axis:
 *  x towards the device's right edge, y towards its top edge (portrait). Null
 *  when the direction is more than `maxAngle` deg off the axis or behind. */
export function cameraProject(q, offset, az, alt, maxAngle = 80) {
  const [x, y, z, w] = q;
  const a = (az - offset) * Math.PI / 180, h = alt * Math.PI / 180;
  const vx = Math.sin(a) * Math.cos(h), vy = Math.cos(a) * Math.cos(h), vz = Math.sin(h);
  // world -> device: the transposed rotation matrix of q
  const dx = (1 - 2 * (y * y + z * z)) * vx + 2 * (x * y + w * z) * vy + 2 * (x * z - w * y) * vz;
  const dy = 2 * (x * y - w * z) * vx + (1 - 2 * (x * x + z * z)) * vy + 2 * (y * z + w * x) * vz;
  const dz = 2 * (x * z + w * y) * vx + 2 * (y * z - w * x) * vy + (1 - 2 * (x * x + y * y)) * vz;
  const forward = -dz;   // the back camera looks along -z
  if (!(forward > Math.cos(maxAngle * Math.PI / 180))) return null;
  return { x: dx / forward, y: dy / forward };
}

/** Angular velocity (rad/s, about the device's own x, y, z axes) between two
 *  orientation quaternions taken `dt` seconds apart. */
export function angularVelocity(q0, q1, dt) {
  if (!(dt > 0)) return [0, 0, 0];
  const [ax, ay, az, aw] = [-q0[0], -q0[1], -q0[2], q0[3]];   // q0 inverse
  const [bx, by, bz, bw] = q1;
  let x = aw * bx + ax * bw + ay * bz - az * by;
  let y = aw * by - ax * bz + ay * bw + az * bx;
  let z = aw * bz + ax * by - ay * bx + az * bw;
  let w = aw * bw - ax * bx - ay * by - az * bz;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const s = Math.hypot(x, y, z);
  if (s < 1e-12) return [0, 0, 0];
  const k = 2 * Math.atan2(s, w) / s / dt;
  return [x * k, y * k, z * k];
}

/** The orientation at time t (ms) averaged over a window centred on t:
 *  `history` holds {t, q} readings in time order. The window is `halfMs`
 *  either side, narrowed to the readings that exist on both sides, so it
 *  stays centred and adds no lag even when t is close to the newest reading
 *  (a camera that trails the gyroscope only a little). Returns a unit
 *  quaternion, or null when fewer than two readings fall inside it. */
export function smoothOrientation(history, t, halfMs) {
  const h = Array.isArray(history) ? history : [];
  if (h.length < 2 || !isNum(t) || !(halfMs > 0)) return null;
  const half = Math.min(halfMs, h[h.length - 1].t - t, t - h[0].t);
  if (!(half > 0)) return null;
  const near = h.filter((e) => Math.abs(e.t - t) <= half);
  if (near.length < 2) return null;
  const ref = near[0].q, sum = [0, 0, 0, 0];
  for (const { q } of near) {
    const sign = q[0] * ref[0] + q[1] * ref[1] + q[2] * ref[2] + q[3] * ref[3] < 0 ? -1 : 1;
    for (let k = 0; k < 4; k++) sum[k] += sign * q[k];
  }
  const n = Math.hypot(...sum);
  return n > 0 ? sum.map((v) => v / n) : null;
}

/** How the camera image's motion follows the gyroscope. `rates` are
 *  {t, w}: angular rate (rad/s) about one device axis at time t (ms);
 *  `shifts` are {t0, t1, d}: how far the image moved (pixels) along the
 *  matching image axis between two frames. Returns the delay (ms) by which
 *  the image follows the gyroscope and the image shift per radian, with their
 *  correlation, or null with too little data. The best delay is the one at
 *  which the two motions agree most. */
export function matchMotion(rates, shifts, { maxLag = 400, step = 5, minPairs = 60 } = {}) {
  const r = (Array.isArray(rates) ? rates : []).filter((p) => isNum(p.t) && isNum(p.w));
  if (r.length < 2) return null;
  const at = (t) => {
    let lo = 0, hi = r.length - 1;
    if (t < r[0].t || t > r[hi].t) return null;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (r[mid].t <= t) lo = mid; else hi = mid; }
    const f = r[hi].t === r[lo].t ? 0 : (t - r[lo].t) / (r[hi].t - r[lo].t);
    return r[lo].w + (r[hi].w - r[lo].w) * f;
  };
  const rows = (Array.isArray(shifts) ? shifts : [])
    .filter((s) => isNum(s.t0) && isNum(s.t1) && isNum(s.d) && s.t1 > s.t0)
    .map((s) => ({ t: (s.t0 + s.t1) / 2, v: s.d / ((s.t1 - s.t0) / 1000) }));
  let best = null;
  for (let lag = 0; lag <= maxLag; lag += step) {
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (const row of rows) {
      const w = at(row.t - lag);
      if (w == null) continue;
      n++; sx += w; sy += row.v; sxx += w * w; syy += row.v * row.v; sxy += w * row.v;
    }
    if (n < minPairs) continue;
    const cov = sxy - sx * sy / n, vx = sxx - sx * sx / n, vy = syy - sy * sy / n;
    if (!(vx > 0) || !(vy > 0)) continue;
    const corr = cov / Math.sqrt(vx * vy);
    if (!best || Math.abs(corr) > Math.abs(best.corr)) best = { lagMs: lag, slope: cov / vx, corr, n };
  }
  return best;
}

/** Circular mean of angles in degrees and their spread (circular standard
 *  deviation, degrees), or null without angles. */
export function circularMean(angles) {
  const list = (Array.isArray(angles) ? angles : []).filter(isNum);
  if (!list.length) return null;
  let s = 0, c = 0;
  for (const a of list) { s += Math.sin(a * Math.PI / 180); c += Math.cos(a * Math.PI / 180); }
  const r = Math.min(1, Math.hypot(s, c) / list.length);
  return {
    mean: wrapAz(Math.atan2(s, c) * 180 / Math.PI),
    spread: r > 0 ? Math.min(180, Math.sqrt(-2 * Math.log(r)) * 180 / Math.PI) : 180,
  };
}

/** A traced sweep (directions in time order) as one skyline line: azimuths
 *  run on continuously (past north if the sweep does), the latest sample per
 *  0.25 deg wins so going back over a stretch redraws it, and the result is
 *  sorted and simplified. Altitudes are clamped. Steps stay at most 90 deg
 *  (a flat stretch gets intermediate points), as replacePointsInRange needs.
 *  Empty for fewer than two usable samples or a sweep narrower than 0.5 deg. */
export function sweepLine(samples, tolerance = 0.3) {
  const src = (Array.isArray(samples) ? samples : []).filter((p) => p && isNum(p.az) && isNum(p.alt));
  if (src.length < 2) return [];
  const buckets = new Map();
  let az = src[0].az;
  for (let i = 0; i < src.length; i++) {
    if (i) az += azDelta(src[i].az, src[i - 1].az);
    buckets.set(Math.round(az * 4), { az, alt: clampAlt(src[i].alt) });
  }
  const line = [...buckets.values()].sort((a, b) => a.az - b.az);
  if (line[line.length - 1].az - line[0].az < 0.5) return [];
  const simple = simplifyLine(line, tolerance);
  const out = [simple[0]];
  for (let i = 1; i < simple.length; i++) {
    const a = simple[i - 1], b = simple[i], n = Math.ceil((b.az - a.az) / 90);
    for (let k = 1; k < n; k++) out.push({ az: a.az + (b.az - a.az) * k / n, alt: a.alt + (b.alt - a.alt) * k / n });
    out.push(b);
  }
  return out;
}

/* -------------------------------- share links -------------------------------- */

export const LINK_VERSION = 1;
export const LINK_MAX_CHARS = 60000;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** A horizon as compact text for a share link (URL-safe base64 of version 1:
 *  the name as UTF-8, then the skyline points and the overhang edges, each
 *  azimuth and altitude in 0.01 deg stored as the change from the point before
 *  as a variable-length number). Exact: decodeHorizonLink gives back the same
 *  normalized name, points and overhangs. */
export function encodeHorizonLink(h) {
  const bytes = [LINK_VERSION];
  const uint = (v) => { do { let b = v & 127; v = Math.floor(v / 128); if (v) b |= 128; bytes.push(b); } while (v); };
  const sint = (v) => uint(v >= 0 ? v * 2 : -v * 2 - 1);
  const line = (pts) => {
    uint(pts.length);
    let az = 0, alt = 0;
    for (const p of pts) {
      const a = Math.round(p.az * 100), b = Math.round(p.alt * 100);
      sint(a - az); sint(b - alt);
      az = a; alt = b;
    }
  };
  const name = new TextEncoder().encode(clipName(String(h?.name || 'Horizon').trim()) || 'Horizon');
  uint(name.length);
  for (const b of name) bytes.push(b);
  line(normalizePoints(h?.points));
  const overhangs = normalizeOverhangs(h?.overhangs);
  uint(overhangs.length);
  for (const edge of overhangs) line(edge);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    out += B64[n >> 18] + B64[(n >> 12) & 63]
      + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '') + (i + 2 < bytes.length ? B64[n & 63] : '');
  }
  if (out.length > LINK_MAX_CHARS) throw new Error('this horizon is too large for a link; export it as a file instead');
  return out;
}

/** Read share-link text back into { name, points, overhangs }. Throws with a
 *  plain message for anything damaged, truncated, too large or out of range,
 *  so nothing half-read is ever saved. */
export function decodeHorizonLink(text) {
  if (typeof text !== 'string' || !text || text.length > LINK_MAX_CHARS || !/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) {
    throw new Error('the link is damaged or incomplete');
  }
  const bytes = [];
  for (let i = 0; i < text.length; i += 4) {
    const n = [0, 1, 2, 3].reduce((acc, k) => acc * 64 + (i + k < text.length ? B64.indexOf(text[i + k]) : 0), 0);
    bytes.push(n >> 16 & 255);
    if (i + 2 < text.length) bytes.push(n >> 8 & 255);
    if (i + 3 < text.length) bytes.push(n & 255);
  }
  let at = 0;
  const fail = (msg = 'the link is damaged or incomplete') => { throw new Error(msg); };
  const uint = () => {
    let v = 0, scale = 1;
    for (let k = 0; k < 5; k++) {
      if (at >= bytes.length) fail();
      const b = bytes[at++];
      v += (b & 127) * scale;
      if (!(b & 128)) return v;
      scale *= 128;
    }
    return fail();
  };
  const sint = () => { const v = uint(); return v % 2 ? -(v + 1) / 2 : v / 2; };
  if (bytes[at++] !== LINK_VERSION) fail('the link comes from a newer NightSeam or is damaged');
  const nameLen = uint();
  if (nameLen > NAME_MAX * 4 || at + nameLen > bytes.length) fail();
  const name = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes.slice(at, at + nameLen)));
  at += nameLen;
  const line = (maxAz) => {
    const n = uint();
    if (n > MAX_POINTS) fail('the link holds more points than a horizon can');
    const out = [];
    let az = 0, alt = 0;
    for (let i = 0; i < n; i++) {
      az += sint(); alt += sint();
      if (az < 0 || az > maxAz || alt < ALT_MIN * 100 || alt > ALT_MAX * 100) fail();
      out.push({ az: az / 100, alt: alt / 100 });
    }
    return out;
  };
  const points = line(35999);
  const count = uint();
  if (count > MAX_OVERHANGS) fail('the link holds more overhangs than a horizon can');
  const overhangs = Array.from({ length: count }, () => line(36000));
  if (at !== bytes.length) fail();
  try {
    return {
      name: clipName(name.trim()) || 'Horizon',
      points: normalizePoints(points, true),
      overhangs: normalizeOverhangs(overhangs, true),
    };
  } catch { return fail(); }
}

/* ------------------------------- horizon files ------------------------------- */

/** Parse a horizon text file: one `azimuth altitude` pair per line, separated
 *  by spaces, tabs, commas or semicolons. Where spaces, tabs or semicolons
 *  separate the fields, a comma between digits is a decimal comma (`90;20,5`).
 *  `#` and `;` start comments; lines without two leading numbers are skipped.
 *  Reads Stellarium polygonal horizons, N.I.N.A. .hrz files and plain lists.
 *  More than MAX_POINTS distinct points are thinned evenly (`thinned` says how
 *  many went). Throws when nothing usable remains. */
export function parseHorizonFile(text) {
  if (typeof text !== 'string') throw new Error('horizon file must be text');
  const raw = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    let body = line.replace(/^\s*[#;].*$/, '').replace(/\s#.*$/, '').trim();
    if (!body) continue;
    if (/[\s;]/.test(body)) body = body.replace(/(\d),(\d)/g, '$1.$2');
    const parts = body.split(/[\s,;]+/).filter(Boolean);
    const az = Number(parts[0]), alt = Number(parts[1]);
    if (parts.length < 2 || !Number.isFinite(az) || !Number.isFinite(alt)
        || az < -360 || az > 720 || alt < -90 || alt > 90) { skipped++; continue; }
    raw.push({ az, alt });
  }
  if (!raw.length) throw new Error('no "azimuth altitude" lines found');
  if (raw.length > MAX_POINTS * 4) throw new Error(`the file has more than ${MAX_POINTS * 4} points`);
  const all = canonicalPoints(raw, false);
  const points = thinToFit(all, MAX_POINTS);
  return { points, skipped, thinned: all.length - points.length };
}

/** Plain `azimuth altitude` text for a horizon, readable by parseHorizonFile,
 *  Stellarium and N.I.N.A. */
export function formatHorizonFile(h) {
  const name = String(h?.name || 'Horizon').replace(/[\r\n]+/g, ' ');
  const lines = [
    `# NightSeam horizon: ${name}`,
    '# azimuth altitude (degrees; azimuth from north through east)',
  ];
  if (Array.isArray(h?.overhangs) && h.overhangs.length) {
    lines.push('# overhangs are not part of this format and are not included');
  }
  for (const p of normalizePoints(h?.points)) lines.push(`${p.az.toFixed(2)} ${p.alt.toFixed(2)}`);
  return lines.join('\n') + '\n';
}
