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
 * A photo is only a tracing aid placed on the same grid: pixels are treated
 * as square in degrees, so a placement is its horizontal angle (`width`), the
 * azimuth/altitude of its centre (`heading`/`tilt`) and its rotation (`roll`).
 *
 * This module must stay pure: no DOM, storage, network or build tokens.
 */

import { altaz, sunRaDec } from './astro.js';

export const NO_BLOCK = -90;
export const BINS = 720;
export const BIN_DEG = 0.5;
export const ALT_MIN = -10;
export const ALT_MAX = 90;
export const MAX_POINTS = 1440;
export const NAME_MAX = 80;
export const PHOTO_MAX_PIXELS = 32000000;
export const PHOTO_WIDTH_MIN = 1;
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

/** Canonical skyline points: finite, wrapped, clamped, rounded to 0.01 deg,
 *  sorted by azimuth, one point per azimuth (the later one wins), at most
 *  MAX_POINTS. `strict` throws on a malformed entry instead of dropping it. */
export function normalizePoints(value, strict = false) {
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
  return [...byAz].sort((a, b) => a[0] - b[0]).slice(0, MAX_POINTS)
    .map(([az, alt]) => ({ az, alt }));
}

/** Photo placement, or null. Width is 1..360 deg; 360 is a full panorama,
 *  whose roll is always 0. */
export function normalizePhotoPlacement(value, strict = false) {
  if (value == null) return null;
  const fail = (msg) => { if (strict) throw new Error(msg); return null; };
  if (typeof value !== 'object' || Array.isArray(value)) return fail('photo placement must be an object');
  const { width, heading, tilt, roll } = value;
  if (![width, heading, tilt, roll].every(isNum)) return fail('photo placement needs numeric width, heading, tilt and roll');
  if (width < PHOTO_WIDTH_MIN || width > 360) return fail('photo width must be 1-360 degrees');
  if (Math.abs(tilt) > 90) return fail('photo tilt must be -90 to 90 degrees');
  return {
    width: round2(width),
    heading: round2(wrapAz(heading)),
    tilt: round2(tilt),
    // A full panorama is never rolled: its tilt would be a wave, not a rotation.
    roll: width >= 360 ? 0 : round2(azDelta(roll, 0)),
  };
}

/** One canonical horizon record. Returns null (or throws when `strict`) for
 *  an unusable id. `hasPhoto` says whether photo bytes are stored for it. */
export function normalizeHorizon(value, strict = false) {
  const fail = (msg) => { if (strict) throw new Error(msg); return null; };
  if (!value || typeof value !== 'object') return fail('horizon must be an object');
  if (typeof value.id !== 'string' || !ID_RE.test(value.id)) return fail('horizon has an invalid id');
  const name = typeof value.name === 'string' && value.name.trim()
    ? value.name.trim().slice(0, NAME_MAX) : 'Horizon';
  const photo = normalizePhotoPlacement(value.photo, strict);
  return {
    id: value.id,
    name,
    points: normalizePoints(value.points, strict),
    overhangs: normalizeOverhangs(value.overhangs, strict),
    photo,
    hasPhoto: !!(photo && value.hasPhoto),
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
 *  everything. */
export function replacePointsInRange(points, line) {
  const src = (Array.isArray(line) ? line : []).filter((p) => p && isNum(p.az) && isNum(p.alt));
  if (!src.length) return normalizePoints(points);
  let lo = src[0].az, hi = lo, cur = lo;
  for (let i = 1; i < src.length; i++) {
    cur += azDelta(src[i].az, src[i - 1].az);
    lo = Math.min(lo, cur);
    hi = Math.max(hi, cur);
  }
  const inside = (az) => hi - lo >= 360
    || [-360, 0, 360, 720].some((k) => az + k >= lo && az + k <= hi);
  const kept = normalizePoints(points).filter((p) => !inside(p.az));
  return normalizePoints([...kept, ...src]);
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

/* ----------------------------- skyline detection ----------------------------- */

/** Find the sky/ground boundary in a daylight photo, column by column.
 *  `image` is RGBA pixel data ({ width, height, data }), ideally downscaled to
 *  a few hundred pixels wide. Sky is bright and not redder than it is blue;
 *  a two-class (Otsu) threshold over that "skyness" separates it from ground,
 *  and the boundary is the first run of `run` ground pixels below the top.
 *  Returns one row per column (fractional y of the boundary), or null where a
 *  column shows no ground. A median filter removes single-column noise
 *  (wires, birds). The result is a first draft for the user to correct. */
export function detectSkylineRows(image, { run = 3, smooth = 5 } = {}) {
  const { width: w, height: h, data } = image || {};
  if (!(w > 0) || !(h > 1) || !data || data.length < w * h * 4) throw new Error('detectSkylineRows needs RGBA pixel data');
  const sky = new Float32Array(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const r = data[j], g = data[j + 1], b = data[j + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const s = Math.min(255, (y + Math.max(0, b - r)) * 0.8);
    sky[i] = s;
    hist[s | 0]++;
  }
  const threshold = otsu(hist, w * h);
  const rows = new Array(w).fill(null);
  for (let x = 0; x < w; x++) {
    let ground = 0;
    for (let y = 0; y < h; y++) {
      if (sky[y * w + x] < threshold) {
        if (++ground >= run) { rows[x] = y - run + 1; break; }
      } else ground = 0;
    }
  }
  return medianRows(rows, smooth);
}

function otsu(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = -1, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; threshold = t + 0.5; }
  }
  return threshold;
}

function medianRows(rows, size) {
  if (size < 2) return rows;
  const half = Math.floor(size / 2);
  return rows.map((v, x) => {
    if (v == null) return null;
    const win = [];
    for (let k = x - half; k <= x + half; k++) if (rows[k] != null) win.push(rows[k]);
    win.sort((a, b) => a - b);
    return win[Math.floor(win.length / 2)];
  });
}

/* ------------------------------ photo placement ------------------------------ */

/** Degrees per photo pixel for a placement and image width. */
export function photoScale(photo, imgW) {
  return photo.width / imgW;
}

/** Photo pixel (x right, y down, origin top-left) -> world {az, alt}. */
export function photoToWorld(photo, imgW, imgH, x, y) {
  const s = photoScale(photo, imgW);
  const u = (x - imgW / 2) * s, v = (imgH / 2 - y) * s;
  const r = photo.roll * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r);
  return { az: wrapAz(photo.heading + u * c - v * sn), alt: photo.tilt + u * sn + v * c };
}

/** World {az, alt} -> photo pixel. A full panorama wraps x into [0, imgW). */
export function worldToPhoto(photo, imgW, imgH, az, alt) {
  const s = photoScale(photo, imgW);
  const dv = alt - photo.tilt;
  const r = photo.roll * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r);
  const at = (du) => {
    const u = du * c + dv * sn, v = -du * sn + dv * c;
    return { x: imgW / 2 + u / s, y: imgH / 2 - v / s };
  };
  const du = azDelta(az, photo.heading);
  if (photo.width < 360) return at(du);
  // A rolled full panorama: the same direction can sit one turn to either
  // side; take the branch that lands inside the image, then wrap.
  const out = [du, du - 360, du + 360].map(at).find((p) => p.x >= 0 && p.x < imgW) || at(du);
  return { x: ((out.x % imgW) + imgW) % imgW, y: out.y };
}

/** Move skyline points with the photo when its placement changes, so a trace
 *  stays on the features it was drawn over. */
export function reprojectPoints(points, imgW, imgH, from, to) {
  if (!from || !to) return normalizePoints(points);
  return normalizePoints(points.map((p) => {
    const px = worldToPhoto(from, imgW, imgH, p.az, p.alt);
    return photoToWorld(to, imgW, imgH, px.x, px.y);
  }));
}

/** Move overhang edges with the photo, splitting an edge that now crosses north. */
export function reprojectOverhangs(overhangs, imgW, imgH, from, to) {
  const kept = normalizeOverhangs(overhangs);
  if (!from || !to) return kept;
  const out = [];
  for (const line of kept) {
    let prev = null;
    const moved = line.map((p) => {
      const px = worldToPhoto(from, imgW, imgH, p.az, p.alt);
      const w = photoToWorld(to, imgW, imgH, px.x, px.y);
      const az = prev == null ? w.az : prev + azDelta(w.az, prev);
      prev = az;
      return { az, alt: w.alt };
    });
    out.push(...splitAtNorth(moved));
  }
  return out.slice(0, MAX_OVERHANGS);
}

/** Heading that puts photo pixel (x, y) on azimuth `az`, keeping tilt/roll. */
export function headingForLandmark(photo, imgW, imgH, x, y, az) {
  const at = photoToWorld({ ...photo, heading: 0 }, imgW, imgH, x, y);
  return wrapAz(az - at.az);
}

/** A sensible first placement for a photo: 2:1 images are full panoramas,
 *  anything else gets `width` (default 60 deg, a typical phone photo). */
export function defaultPhotoPlacement(imgW, imgH, width = null) {
  const full = imgH > 0 && Math.abs(imgW / imgH - 2) < 0.05;
  const w = width ?? (full ? 360 : 60);
  return normalizePhotoPlacement({ width: w, heading: 180, tilt: 0, roll: 0 });
}

/** Image dimensions from PNG or JPEG header bytes (EXIF rotation applied).
 *  Throws for anything else or above PHOTO_MAX_PIXELS, so the shell can refuse
 *  a decompression bomb before decoding it. The headers must lie within the
 *  bytes passed in. */
export function photoFileDimensions(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let width, height, orientation = 1;
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (b.length >= 24 && png.every((v, i) => b[i] === v)
      && b[12] === 73 && b[13] === 72 && b[14] === 68 && b[15] === 82) {
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (b[0] === 255 && b[1] === 216) {
    let i = 2;
    while (i + 4 <= b.length) {
      if (b[i++] !== 255) break;
      while (b[i] === 255) i++;
      const marker = b[i++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (i + 2 > b.length) break;
      const length = view.getUint16(i);
      if (length < 2 || i + length > b.length) break;
      if (marker === 225 && length >= 16 && [69, 120, 105, 102, 0, 0].every((v, k) => b[i + 2 + k] === v)) {
        orientation = readExif(b, view, i + 8, i + length).orientation ?? orientation;
      }
      if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker) && length >= 7) {
        height = view.getUint16(i + 3);
        width = view.getUint16(i + 5);
      }
      i += length;
    }
  }
  if ([5, 6, 7, 8].includes(orientation)) [width, height] = [height, width];
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2
      || width * height > PHOTO_MAX_PIXELS) {
    throw new Error('Use a JPEG or PNG with valid dimensions up to 32 million pixels.');
  }
  return { width, height };
}

/** The EXIF tags NightSeam reads from a TIFF block at `base`: orientation
 *  (274), DateTime (306), DateTimeOriginal (36867) and OffsetTimeOriginal
 *  (36881). Bounded and defensive: a malformed block yields nulls. */
function readExif(b, view, base, end) {
  const out = { orientation: null, dateTime: null, original: null, offset: null };
  const le = b[base] === 73 && b[base + 1] === 73;
  if (!(le || (b[base] === 77 && b[base + 1] === 77)) || base + 8 > end || view.getUint16(base + 2, le) !== 42) return out;
  const ascii = (at, count) => {
    const from = count > 4 ? base + view.getUint32(at + 8, le) : at + 8;
    if (from < base || from + count > end) return null;
    return String.fromCharCode(...b.subarray(from, from + count)).replace(/\0+$/, '');
  };
  const walk = (ifd, visit) => {
    if (ifd < base || ifd + 2 > end) return;
    const count = view.getUint16(ifd, le);
    for (let n = 0; n < Math.min(count, 256); n++) {
      const at = ifd + 2 + n * 12;
      if (at + 12 > end) break;
      visit(view.getUint16(at, le), view.getUint16(at + 2, le), view.getUint32(at + 4, le), at);
    }
  };
  let exifIfd = null;
  walk(base + view.getUint32(base + 4, le), (tag, type, count, at) => {
    if (tag === 274 && type === 3 && count === 1) out.orientation = view.getUint16(at + 8, le);
    if (tag === 306 && type === 2) out.dateTime = ascii(at, count);
    if (tag === 34665 && type === 4) exifIfd = base + view.getUint32(at + 8, le);
  });
  if (exifIfd != null) {
    walk(exifIfd, (tag, type, count, at) => {
      if (tag === 36867 && type === 2) out.original = ascii(at, count);
      if (tag === 36881 && type === 2) out.offset = ascii(at, count);
    });
  }
  return out;
}

/** When a JPEG says it was taken: `wall` is the camera's clock as a UTC-based
 *  millisecond value of its calendar fields, `offsetMin` the stated UTC offset
 *  (minutes east) or null when the photo does not say. Null without a date. */
export function photoCaptureTime(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!(b[0] === 255 && b[1] === 216)) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i++] !== 255) return null;
    while (b[i] === 255) i++;
    const marker = b[i++];
    if (marker === 217 || marker === 218) return null;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (i + 2 > b.length) return null;
    const length = view.getUint16(i);
    if (length < 2 || i + length > b.length) return null;
    if (marker === 225 && length >= 16 && [69, 120, 105, 102, 0, 0].every((v, k) => b[i + 2 + k] === v)) {
      const exif = readExif(b, view, i + 8, i + length);
      const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(exif.original || exif.dateTime || '');
      if (!m) return null;
      const [Y, Mo, D, h, mi, sec] = m.slice(1).map(Number);
      if (Mo < 1 || Mo > 12 || D < 1 || D > 31 || h > 23 || mi > 59 || sec > 60) return null;
      const off = /^([+-])(\d{2}):(\d{2})$/.exec(exif.original ? exif.offset || '' : '');
      return {
        wall: Date.UTC(Y, Mo - 1, D, h, mi, sec),
        offsetMin: off ? (off[1] === '-' ? -1 : 1) * (Number(off[2]) * 60 + Number(off[3])) : null,
      };
    }
    i += length;
  }
  return null;
}

/* ------------------------------ sun and compass ------------------------------ */

/** The Sun's apparent direction from a site at a Julian Day. */
export function sunDirection(jd, latDeg, lonDeg) {
  const [ra, dec] = sunRaDec(jd);
  const [alt, az] = altaz(ra, dec, jd, latDeg, lonDeg);
  return { az: wrapAz(az), alt };
}

/** A placement that puts photo pixel (x, y) at a known direction (az, alt),
 *  keeping the photo's width and roll: it sets both north and tilt. */
export function placementFromKnownDirection(photo, imgW, imgH, x, y, az, alt) {
  const at = photoToWorld({ ...photo, heading: 0, tilt: 0 }, imgW, imgH, x, y);
  return normalizePhotoPlacement({ ...photo, heading: az - at.az, tilt: Math.max(-90, Math.min(90, alt - at.alt)) });
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

/* ------------------------------- horizon files ------------------------------- */

/** Parse a horizon text file: one `azimuth altitude` pair per line, separated
 *  by spaces, tabs, commas or semicolons. `#` and `;` start comments; lines
 *  without two leading numbers are skipped. Reads Stellarium polygonal
 *  horizons, N.I.N.A. .hrz files and plain lists. Throws when nothing usable
 *  remains. */
export function parseHorizonFile(text) {
  if (typeof text !== 'string') throw new Error('horizon file must be text');
  const raw = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    const body = line.replace(/^\s*[#;].*$/, '').replace(/\s#.*$/, '').trim();
    if (!body) continue;
    const parts = body.split(/[\s,;]+/).filter(Boolean);
    const az = Number(parts[0]), alt = Number(parts[1]);
    if (parts.length < 2 || !Number.isFinite(az) || !Number.isFinite(alt)
        || az < -360 || az > 720 || alt < -90 || alt > 90) { skipped++; continue; }
    raw.push({ az, alt });
  }
  if (!raw.length) throw new Error('no "azimuth altitude" lines found');
  if (raw.length > MAX_POINTS * 4) throw new Error(`the file has more than ${MAX_POINTS * 4} points`);
  let points = normalizePoints(raw);
  if (points.length > MAX_POINTS) {
    points = normalizePoints(simplifyLine(points, 0.1));
  }
  return { points: points.slice(0, MAX_POINTS), skipped };
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
