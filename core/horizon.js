/*
 * NightSeam core - panorama / horizon obstruction geometry (pure).
 *
 * This module is the SINGLE implementation of the panorama mask/profile math
 * and the sky-band geometry. It must stay pure: no DOM, no storage, no
 * network, no build tokens. Shells (web/ and static/js/) import it through the
 * baked stable stub `core.js`; scripts/build_core.py copies this tree to
 * content-hashed URLs and scripts/check_core.py fails on drift.
 *
 * Profile representation: exactly BINS=720 bins (0.5 deg per azimuth),
 * NO_BLOCK = -90. Sky mode: profile = band bottom, profileTop = band top
 * (90.5 = "no upper ceiling"). Unpainted sky columns block fully (90).
 */

export const NO_BLOCK = -90;
export const BINS = 720;
export const BIN_DEG = 0.5;
export const MASK_W = 720;
export const MASK_H = 360; // Row spacing is the calibrated altitude span / 359.

/** Photo coordinates are normalized against the retained original image. */
export function normalizeSourceRect(value, strict = false) {
  const full = { x: 0, y: 0, w: 1, h: 1 };
  if (value == null) return full;
  const valid = value && !Array.isArray(value) &&
    ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(value[k])) &&
    value.x >= 0 && value.x < 1 && value.y >= 0 && value.y < 1 && value.w > 0 && value.h > 0 &&
    value.x + value.w <= 1 + 1e-9 && value.y + value.h <= 1 + 1e-9;
  if (!valid) {
    if (strict) throw new Error('Invalid panorama photo source rectangle');
    return full;
  }
  return { x: value.x, y: value.y, w: Math.min(value.w, 1 - value.x),
    h: Math.min(value.h, 1 - value.y) };
}

/** Preserve a positive vertical calibration span within physical altitude bounds. */
export function normalizePanoCalibration(bottom, top) {
  const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const altBottom = Math.max(-30, Math.min(85, finite(bottom, 0)));
  const altTop = Math.max(altBottom + 5, Math.min(90, finite(top, 60)));
  return { altBottom, altTop };
}

/** Metadata vocabulary for the horizon editor.  These values are descriptive
 * only: they never alter the planning profile.  Keeping the vocabulary in the
 * shared core prevents the web and desktop editors from silently inventing
 * different meanings for the same imported record. */
export const HORIZON_LANDMARK_KINDS = Object.freeze([
  'tree', 'building', 'ridge', 'pole', 'roof', 'balcony', 'other',
]);

const HORIZON_TEXT_LIMITS = Object.freeze({
  name: 96, notes: 320, source: 40, capturedAt: 40,
  orientation: 160, operator: 96,
});

const horizonText = (value, limit) => String(value ?? '').trim().slice(0, limit);

/** Optional measurement provenance; absent uncertainty is not invented. */
export function normalizeReferenceMeasurement(value, strict = false) {
  const fail = () => { if (strict) throw new Error('Invalid reference measurement provenance'); return {}; };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const out = {};
  for (const [key, limit] of [['source', 96], ['exclusionReason', 320], ['measurementGroup', 96]]) {
    if (value[key] == null) continue;
    if (typeof value[key] !== 'string' || value[key].length > limit) return fail();
    out[key] = value[key].trim();
  }
  if (value.sigmaDegrees != null) {
    if (typeof value.sigmaDegrees !== 'number' || !Number.isFinite(value.sigmaDegrees)
        || value.sigmaDegrees <= 0 || value.sigmaDegrees > 30) return fail();
    out.sigmaDegrees = value.sigmaDegrees;
  }
  if (value.captureTime != null) {
    if (!validEvidenceDate(value.captureTime)) return fail();
    out.captureTime = value.captureTime;
  }
  return out;
}

function validEvidenceDate(value) {
  if (typeof value !== 'string' || value.length > 40
      || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return false;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Coverage policy is separate from the authoritative obstruction arrays.
 * Legacy records keep their previous inference rules; no source mask or
 * measured coverage is fabricated by migration. Observer coordinates retain
 * entered precision and cannot correct a changed viewpoint or parallax. */
export function normalizeCoverageEvidence(value, strict = false) {
  const legacy = () => ({ version: 1, policy: 'legacy', observer: null, captureDate: null });
  if (value == null) return legacy();
  const fail = () => { if (strict) throw new Error('Invalid horizon coverage evidence');
    return {version:1,policy:'strict-measured',observer:null,captureDate:null}; };
  if (!value || Array.isArray(value) || value.version !== 1
      || !['legacy', 'inferred-open', 'strict-measured'].includes(value.policy)) return fail();
  let observer = null;
  if (value.observer != null) {
    const o = value.observer, finite = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
    if (!o || typeof o !== 'object' || Array.isArray(o) || ((o.lat == null) !== (o.lon == null))
        || (o.lat != null && (!finite(o.lat, -90, 90) || !finite(o.lon, -180, 180)))
        || (o.opticalHeight != null && !finite(o.opticalHeight, -100, 10000))) return fail();
    observer = { lat: o.lat ?? null, lon: o.lon ?? null, opticalHeight: o.opticalHeight ?? null };
    if (observer.lat == null && observer.opticalHeight == null) observer = null;
  }
  if (value.captureDate != null && !validEvidenceDate(value.captureDate)) return fail();
  return { version: 1, policy: value.policy, observer, captureDate: value.captureDate ?? null };
}

/** Fast policy access for the shared scorer; callers normalize at storage.
 * An absent policy has exactly the historical behavior. */
export const horizonCoveragePolicy = p => p?.coverageEvidence == null ? 'legacy'
  : ['legacy','inferred-open','strict-measured'].includes(p.coverageEvidence.policy)
    ? p.coverageEvidence.policy : 'strict-measured';

/** Normalize user-entered obstruction landmarks into a safe, portable shape.
 *  Landmarks are annotations, not geometry; malformed entries are ignored and
 *  coordinates are clamped/wrapped at the storage boundary. */
export function normalizeHorizonLandmarks(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (let i = 0; i < value.length && out.length < 128; i++) {
    const item = value[i];
    if (!item || typeof item !== 'object') continue;
    const name = horizonText(item.name, HORIZON_TEXT_LIMITS.name);
    const azRaw = Number(item.azimuth ?? item.az);
    const altRaw = Number(item.altitude ?? item.alt);
    if (!name || !Number.isFinite(azRaw) || !Number.isFinite(altRaw)) continue;
    const idRaw = horizonText(item.id, 64);
    let id = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(idRaw)
      ? idRaw : `landmark-${i + 1}`;
    const base = id;
    for (let suffix = 1; seen.has(id); suffix++) {
      const tail = `-${suffix}`;
      id = base.slice(0, 64 - tail.length) + tail;
    }
    seen.add(id);
    const kind = HORIZON_LANDMARK_KINDS.includes(item.kind)
      ? item.kind : 'other';
    const azimuth = ((azRaw % 360) + 360) % 360;
    const altitude = Math.max(-90, Math.min(90, altRaw));
    out.push({
      id, name, kind,
      azimuth: +azimuth.toFixed(2),
      altitude: +altitude.toFixed(2),
      notes: horizonText(item.notes, HORIZON_TEXT_LIMITS.notes),
    });
  }
  return out;
}

/** Normalize calibration provenance.  An empty object is intentional: old
 * panorama records did not carry provenance and must remain valid. */
export function normalizeHorizonProvenance(value) {
  const item = value && typeof value === 'object' && !Array.isArray(value)
    ? value : {};
  const allowed = ['manual', 'compass', 'phone_metadata', 'plate_solve',
    'imported', 'unknown'];
  return {
    source: allowed.includes(item.source) ? item.source : 'unknown',
    capturedAt: horizonText(item.capturedAt ?? item.captured_at,
      HORIZON_TEXT_LIMITS.capturedAt),
    orientation: horizonText(item.orientation, HORIZON_TEXT_LIMITS.orientation),
    operator: horizonText(item.operator, HORIZON_TEXT_LIMITS.operator),
    notes: horizonText(item.notes, HORIZON_TEXT_LIMITS.notes),
  };
}

/** Confidence is per canonical world-azimuth bin: 0 = inferred/uncertain,
 *  1 = high confidence, null = not assessed.  Always return 720 entries so a
 *  consumer can index it without a second shape convention. */
export function normalizeHorizonConfidence(value) {
  const src = Array.isArray(value) ? value : [];
  return Array.from({ length: BINS }, (_, i) => {
    if (src[i] === null || src[i] === undefined || src[i] === '') return null;
    const n = Number(src[i]);
    return Number.isFinite(n) ? +Math.max(0, Math.min(1, n)).toFixed(3) : null;
  });
}

/** Compare two canonical obstruction profiles for the editor's explanation.
 *  Every finite bin participates, including the explicit NO_BLOCK/open-sky
 *  sentinels; a partial-FOV difference is therefore visible rather than being
 *  mistaken for agreement. */
export function profileDifference(a, b) {
  let compared = 0, sum = 0, maxAbs = 0, azAtMax = null;
  for (let i = 0; i < BINS; i++) {
    const av = Number(Array.isArray(a) ? a[i] : NaN);
    const bv = Number(Array.isArray(b) ? b[i] : NaN);
    if (!Number.isFinite(av) || !Number.isFinite(bv)) continue;
    const diff = Math.abs(av - bv);
    compared++;
    sum += diff;
    if (azAtMax === null || diff > maxAbs) {
      maxAbs = diff; azAtMax = i * BIN_DEG;
    }
  }
  return {
    compared,
    meanAbs: compared ? sum / compared : 0,
    maxAbs,
    azAtMax,
  };
}

/** Canonical bin space marker. D1: core profiles are WORLD-AZIMUTH bins
 *  (bin i = azimuth i * 0.5 deg), matching Python `ceil_lookup`, the server
 *  payload path and the desktop editor. The web editor's mask is FOV-relative,
 *  so legacy/imported FOV-relative records are converted once by
 *  `normalizeProfileBins()` at the storage boundary. */
export const WORLD_BINS = 'world';

/** World azimuth (deg, any sign) -> canonical bin index. */
const worldBin = (azDeg) => {
  const a = ((azDeg % 360) + 360) % 360;
  return Math.min(BINS - 1, Math.floor(a / BIN_DEG));
};

/** FOV-relative position (deg in [0, fov]) of world bin `i` inside the
 *  calibrated frame [0, fov], or null when the bin lies entirely outside it.
 *
 *  Legacy representative-position coverage, used by migration, preview and
 *  crop. Derived masks aggregate all overlapping columns separately. Both
 *  agree with the scorer's continuous frame gate, which gates per azimuth
 *  continuously (`ceilFor`: inside while `0 <= az - azOffset <= fov`). A bin is
 *  therefore in frame when ANY part of its 0.5 deg span overlaps the frame:
 *  - a bin that starts inside keeps its left-edge position (unchanged mapping);
 *  - the bin that STRADDLES the frame start (its wrapped left edge is in
 *    [359.5, 360), so rel > fov yet the bin covers azimuths azOffset..) is
 *    represented by the midpoint of its wrapped overlap.
 *  The old left-edge-only rule left that straddler at the mode sentinel AND
 *  wrapped its representative column to 719, so for any azOffset that is not a
 *  multiple of 0.5 (normal after a crop) an in-frame azimuth read the
 *  out-of-frame sentinel: a painted band read clear in obstacle mode and fully
 *  blocked in sky mode. That is CR3/CO-01 from the 0.6.24 review. */
export function fovBinRel(i, azOff, fov) {
  const rel = (((i * BIN_DEG - azOff) % 360) + 360) % 360;
  if (rel <= fov) return rel;                 // starts inside the frame
  if (rel + BIN_DEG > 360) {                  // straddles the frame start
    return (rel + BIN_DEG - 360) / 2;
  }
  return null;                                // entirely outside the frame
}

/** Rebuild the binary mask (Uint8Array MASK_W*MASK_H) from the stroke list.
 *  `wrap` connects the azimuth seam of a full 360 deg panorama by also painting
 *  each dab shifted one mask width left/right (the out-of-range parts clip to
 *  the normal bounds) - desktop parity, otherwise a stroke straddling the left
 *  edge leaves a gap at the right edge. */
export function rebuildMask(strokes, wrap = false) {
  const mask = new Uint8Array(MASK_W * MASK_H);
  for (const s of strokes) {
    applyDabToMask(mask, s, wrap);
  }
  return mask;
}

/** The same rasterizer serves replay and incremental live edits. */
export function applyDabToMask(mask, s, wrap = false) {
    if (s.m === 'trace') return applySkylineToMask(mask, s.points);
    const val = s.m === 'b' ? 255 : 0;
    const rx = s.rx ?? s.r; // legacy dabs are circles; crops stretch only x
    const xs = wrap ? [s.x - MASK_W, s.x, s.x + MASK_W] : [s.x];
    for (const sx of xs) {
      const x0 = Math.max(0, Math.floor(sx - rx));
      const x1 = Math.min(MASK_W - 1, Math.ceil(sx + rx));
      for (let cx = x0; cx <= x1; cx++) {
        const dx = cx - sx;
        const dy = Math.sqrt(Math.max(0, rx * rx - dx * dx)) * (rx > 0 ? s.r / rx : 1);
        const y0 = Math.max(0, Math.floor(s.y - dy));
        const y1 = Math.min(MASK_H - 1, Math.ceil(s.y + dy));
        for (let cy = y0; cy <= y1; cy++) mask[cy * MASK_W + cx] = val;
      }
    }
  return mask;
}

/** A skyline is an ordered paint operation, not a second competing profile.
 * Later dabs/erasers remain corrections when an earlier trace is edited.
 * Only connected columns are filled; endpoints do not imply unseen terrain. */
export function normalizeSkylineStroke(s) {
  if (!s || s.m !== 'trace' || !Array.isArray(s.points) ||
      !s.points.length || s.points.length > 256) throw new Error('Invalid skyline trace');
  let previous = -1;
  const points = s.points.map((point) => {
    if (!Array.isArray(point) || point.length !== 2 ||
        !point.every(Number.isFinite) || point[0] < 0 || point[0] > MASK_W ||
        point[1] < 0 || point[1] > MASK_H - 1 || point[0] <= previous) {
      throw new Error('Skyline points must be finite, ordered image coordinates');
    }
    previous = point[0];
    return point.slice();
  });
  return { m: 'trace', points };
}

export function applySkylineToMask(mask, points) {
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    if (!(bx > ax)) continue;
    // Cover the whole column footprint, including sub-column segments, using
    // its highest connected skyline edge. Downward altitude rounding is unsafe.
    for (let x = Math.max(0, Math.floor(ax)); x <= Math.min(MASK_W - 1, Math.floor(bx)); x++) {
      const lo = Math.max(ax, x), hi = Math.min(bx, x + 1);
      const at = v => ay + (by - ay) * (v - ax) / (bx - ax);
      const y = Math.max(0, Math.min(MASK_H - 1, Math.floor(Math.min(at(lo), at(hi)) + 1e-9)));
      for (let row = y; row < MASK_H; row++) mask[row * MASK_W + x] = 255;
    }
  }
  return mask;
}

/** Clip segments at the kept band's exact edges before stretching. The same
 * operation stays at its position in the dab timeline; seam endpoint heights
 * are explicit, so no hidden wrap segment appears after a crop. */
export function cropSkylineStroke(s, x0, width) {
  const right = x0 + width, points = [];
  const add = (x, y) => {
    const point = [Math.max(0, Math.min(MASK_W, (x - x0) / width * MASK_W)), y];
    if (!points.length || point[0] > points[points.length - 1][0] + 1e-9) points.push(point);
  };
  for (let i = 1; i < s.points.length; i++) {
    const [ax, ay] = s.points[i - 1], [bx, by] = s.points[i];
    const left = Math.max(x0, ax), end = Math.min(right, bx);
    if (end < left) continue;
    const y = x => ay + (by - ay) * (x - ax) / (bx - ax);
    add(left, y(left)); add(end, y(end));
  }
  if (s.points.length === 1 && s.points[0][0] >= x0 && s.points[0][0] <= right) add(...s.points[0]);
  return points.length ? { m: 'trace', points } : null;
}

/** Join sparse pointer samples with overlapping dabs. No new storage shape. */
export function strokeSegment(from, to, r, mode = 'b') {
  const radius = Math.max(1, Number(r) || 1);
  const bound = (v, max) => Math.max(-radius, Math.min(max + radius, v));
  const end = [bound(to[0], MASK_W), bound(to[1], MASK_H)];
  if (!from) return [{ m: mode, x: end[0], y: end[1], r: radius }];
  const start = [bound(from[0], MASK_W), bound(from[1], MASK_H)];
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const count = Math.ceil(length / Math.max(0.5, radius / 2));
  return Array.from({ length: count }, (_, i) => ({ m: mode,
    x: start[0] + (end[0] - start[0]) * (i + 1) / count,
    y: start[1] + (end[1] - start[1]) * (i + 1) / count, r: radius }));
}

/** Mask row -> apparent altitude (image y=0 = altTop, y=MASK_H-1 = altBottom). */
export const altOf = (p, row) => p.altTop - (row / (MASK_H - 1)) * (p.altTop - p.altBottom);

/** Altitude -> mask row: the exact inverse of altOf (may fall outside the
 *  image; callers clip). Guides use THIS so a line is never visually centered
 *  but mathematically offset. */
export const rowOfAlt = (p, alt) => {
  const span = p.altTop - p.altBottom;
  return Math.abs(span) < 1e-9 ? 0 : ((p.altTop - alt) / span) * (MASK_H - 1);
};

/** Azimuth -> mask x, the SAME FOV-relative mapping ceilFor() uses
 *  (d = az - azOffset, wrapped; x = d/fov * MASK_W). Outside the calibrated
 *  FOV the result falls outside 0..MASK_W. */
export function xOfAz(p, azDeg) {
  const fov = Number(p.fov) > 0 ? Number(p.fov) : 360;
  const azOff = Number(p.azOffset) || 0;
  const d = ((azDeg - azOff) % 360 + 360) % 360;
  return (d / fov) * MASK_W;
}

/** Mask x -> azimuth, the inverse of xOfAz (wrapped to 0..360). */
export function azOfX(p, x) {
  const fov = Number(p.fov) > 0 ? Number(p.fov) : 360;
  const azOff = Number(p.azOffset) || 0;
  return (((azOff + (x / MASK_W) * fov) % 360) + 360) % 360;
}

/** Seam wrap applies only to a full 360 deg panorama. */
export const wrapsFor = (p) => Math.abs(Number(p.fov) - 360) <= 1e-8;

/** Obstruction profile from a mask - shared by computeProfile() and the live
 *  overlay (which must not rebuild the mask or hit storage per pointer sample).
 *
 *  Every world bin combines all overlapping source columns: the highest
 *  obstacle, or the intersection of allowed sky bands. Unpainted sky columns
 *  block fully. Authoritative stored profiles and their legacy migration are
 *  not resampled by this mask-derivation policy. */
function binColumnRanges(i, azOff, fov) {
  const rel = (((i * BIN_DEG - azOff) % 360) + 360) % 360;
  const ranges = [];
  // A nonaligned full-360 bin may overlap both ends of the photograph.
  for (const start of [rel - 360, rel]) {
    const lo = Math.max(0, start), hi = Math.min(fov, start + BIN_DEG);
    if (hi <= lo + 1e-10) continue;
    const first = Math.max(0, Math.floor(lo * MASK_W / fov + 1e-9));
    const last = Math.min(MASK_W - 1, Math.ceil(hi * MASK_W / fov - 1e-9) - 1);
    if (last >= first) ranges.push([first, last]);
  }
  // The scorer includes the right photo endpoint. Preserve its final column
  // even when that world bin only touches the frame at a zero-width boundary.
  if (!ranges.length && Math.abs(rel - fov) <= 1e-10) ranges.push([MASK_W - 1, MASK_W - 1]);
  return ranges;
}

export function profileFromMask(p, mask) {
  const fov = Number(p.fov) > 0 ? Number(p.fov) : 360;
  const azOff = Number(p.azOffset) || 0;
  const sky = p.paintMode === 'sky';
  const prof = new Array(BINS).fill(sky ? 90 : NO_BLOCK);
  const top = new Array(BINS).fill(NO_BLOCK);
  // Sequential row reads summarize each source column once; avoid scanning
  // all rows again for every bin/column overlap in a narrow photograph.
  const firstRow = new Int16Array(MASK_W).fill(-1), lastRow = new Int16Array(MASK_W).fill(-1);
  for (let row = 0; row < MASK_H; row++) {
    for (let col = 0; col < MASK_W; col++) {
      if (!mask[row * MASK_W + col]) continue;
      if (firstRow[col] < 0) firstRow[col] = row;
      lastRow[col] = row;
    }
  }
  for (let i = 0; i < BINS; i++) {
    const ranges = binColumnRanges(i, azOff, fov);
    if (!ranges.length) continue;
    let lower = NO_BLOCK, upper = 90.5, blocked = false;
    for (const [first, last] of ranges) {
      for (let col = first; col <= last; col++) {
        if (firstRow[col] < 0) { if (sky) blocked = true; continue; }
        const edge = altOf(p, firstRow[col]);
        if (sky) {
          lower = Math.max(lower, altOf(p, lastRow[col]));
          upper = Math.min(upper, edge >= p.altTop - 4 ? 90.5 : edge);
        } else lower = Math.max(lower, edge);
      }
    }
    if (sky && (blocked || (p.blockAbove && upper <= lower))) continue;
    prof[i] = lower;
    if (sky) top[i] = upper;
  }
  p.profileBins = WORLD_BINS;
  return { prof, top };
}

/** Convert a legacy FOV-relative profile (one bin per mask column) to the
 *  canonical world-azimuth bins, in place. Idempotent: records already marked
 *  `profileBins === WORLD_BINS` pass through untouched; a stroke-derived
 *  profile is already world (profileFromMask marks it). Uses the desktop
 *  representative column (`col = floor(rel/fov*720)`) to retain legacy values;
 *  newly derived masks instead aggregate overlapping columns conservatively.
 *  Bins outside the calibrated FOV get the mode sentinel. */
export function normalizeProfileBins(p) {
  if (!p || p.profileBins === WORLD_BINS) return p;
  const prof = (Array.isArray(p.profile) && p.profile.length === BINS) ? p.profile : null;
  const tops = (Array.isArray(p.profileTop) && p.profileTop.length === BINS) ? p.profileTop : null;
  const sky = p.paintMode === 'sky';
  const fov = Number(p.fov) > 0 ? Number(p.fov) : 360;
  const azOff = Number(p.azOffset) || 0;
  const wprof = new Array(BINS).fill(sky ? 90 : NO_BLOCK);
  const wtop = new Array(BINS).fill(NO_BLOCK);
  if (prof) {
    for (let i = 0; i < BINS; i++) {
      const rel = fovBinRel(i, azOff, fov);
      if (rel === null) continue;
      const col = Math.min(BINS - 1, Math.floor(rel * BINS / fov));
      wprof[i] = prof[col];
      if (tops) wtop[i] = tops[col];
    }
  }
  p.profile = wprof;
  p.profileTop = wtop;
  p.profileBins = WORLD_BINS;
  return p;
}

/** Contiguous edge segments of one profile, for the preview - SHARED with the
 *  desktop (`static/js/pano.js` re-exports this) and pinned by
 *  `tests/js/sky_band.mjs`. A bin is skipped (pen lifted) outside the FOV,
 *  below the chart bottom, or at/above `skipAbove` (the sky-mode 90.5
 *  "no ceiling" sentinel); a wrap at the 360 deg seam also lifts the pen
 *  instead of drawing across the image, so the fill can never self-intersect
 *  or smear. */
export function profileSegments(prof, W, H, ab, at, azOff, fov, skipAbove = 90.5) {
  const segs = [];
  // CR2: this is the desktop editor's silhouette call and the WEB editor passes
  // `p.profileTop` (null whenever a sky-mode record has no top array), so a
  // missing/unusable array threw "Cannot read properties of null (reading '0')"
  // mid-render. Same degrade as the siblings: no array -> no segments -> nothing
  // drawn - which is exactly what the caller renders for an empty result.
  if (!Array.isArray(prof)) return segs;
  let seg = null, prevX = null;
  const span = at - ab || 1;
  for (let i = 0; i < BINS; i++) {
    const e = Number(prof[i]);
    const rel = fovBinRel(i, azOff, fov);
    if (!Number.isFinite(e) || rel === null || e <= ab - 5 || e >= skipAbove) {
      seg = null; prevX = null; continue;
    }
    const x = rel / fov * W;
    if (seg && prevX != null && x < prevX - W * 0.5) seg = null;
    const y = H * (1 - (Math.min(Math.max(e, ab), at) - ab) / span);
    if (!seg) { seg = []; segs.push(seg); }
    seg.push([x, y]);
    prevX = x;
  }
  return segs;
}

/** The visible-sky band per azimuth column, in ALTITUDE, plus its complement.
 *  Obstacle mode: visible = (ceiling, zenith]; blocked = [altBottom, ceiling].
 *  Sky mode: visible = the painted band [profile, profileTop] (an open-above
 *  90.5 sentinel extends to the zenith); unpainted columns are fully blocked.
 *  Per column, visible U blocked == [altBottom, zenith] and visible n blocked
 *  == {} - the visible mask is the EXACT complement of the blocked mask. */
export function visibleSkyBands(p, altBottom = null, zenith = 90) {
  // CO-04: degrade like the sibling entry points instead of throwing. `p == null`
  // failed before any FOV/paint-mode logic ("Cannot read properties of null"),
  // and a sky-mode record with a MISSING profileTop threw on `p.profileTop[col]`,
  // while ceilFor/overhangRuns/assumedOpenHatchPolys all return an empty degrade.
  // "No usable record" means "nothing visible": the caller draws nothing.
  if (!p || !Array.isArray(p.profile)) return [];
  const top = Array.isArray(p.profileTop) ? p.profileTop : null;
  const ab = Number.isFinite(altBottom) ? altBottom : Number(p.altBottom);
  const mk = (vis, blocked) => ({
    vis: vis && vis[1] > vis[0] ? vis : null,
    blocked: blocked.filter(([a, b]) => b > a),
  });
  const out = [];
  for (let col = 0; col < BINS; col++) {
    const e = p.profile[col];
    if (p.paintMode === 'sky') {
      if (e != null && e > NO_BLOCK + 0.5 && e < zenith) {
        const t = top ? top[col] : null;
        // the band top caps the visible sky ONLY with blockAbove; otherwise
        // everything above the painted band is free (open above, default)
        const hi = (p.blockAbove && t != null && t > NO_BLOCK + 0.5 && t !== 90.5)
          ? Math.min(t, zenith) : zenith;
        out.push(mk([e, hi], [[ab, e], [hi, zenith]]));
      } else {
        out.push(mk(null, [[ab, zenith]]));  // unpainted sky column = blocked
      }
    } else {
      const ceil = (e != null && e > NO_BLOCK + 0.5) ? e : ab;
      const lo = Math.max(ab, ceil);
      out.push(mk([lo, zenith], [[ab, lo]]));
    }
  }
  return out;
}

/** Closed polygon(s) of the VISIBLE band for the preview (sky mode only),
 *  split at the FOV edge, blocked columns and the 360 deg seam so no polygon
 *  spans across the chart. Returns [x,y] vertex lists (bottom edge left->right,
 *  then top edge right->left). Obstacle mode has no fill -> []. */
export function skyBandPolygons(p, W, H, ab, at, azOff, fov) {
  const bands = visibleSkyBands(p, ab);
  // CR2: `visibleSkyBands` degrades to [] for a missing/unusable record, and the
  // sibling entry points (ceilFor/overhangRuns/assumedOpenRuns) all return their
  // empty degrade - this one indexed the result blindly and threw
  // "Cannot read properties of undefined (reading 'vis')" instead. "No usable
  // record" means "draw nothing", exactly like its siblings, so a caller that
  // forgot to check its record cannot break a render pass with an exception.
  if (!bands.length) return [];
  const span = at - ab || 1;
  const yOf = (alt) => H * (1 - (Math.min(Math.max(alt, ab), at) - ab) / span);
  const polys = [];
  let run = null, prevX = null;
  for (let col = 0; col < BINS; col++) {
    const rel = fovBinRel(col, azOff, fov);
    const vis = bands[col].vis;
    if (!vis || rel === null) { run = null; prevX = null; continue; }
    const x = rel / fov * W;
    if (run && prevX != null && x < prevX - W * 0.5) run = null;   // 360 seam
    if (!run) { run = []; polys.push(run); }
    run.push([x, yOf(vis[1]), yOf(vis[0])]);
    prevX = x;
  }
  return polys.map((r) => {
    const pts = [];
    for (const [x, , by] of r) pts.push([x, by]);
    for (let k = r.length - 1; k >= 0; k--) pts.push([r[k][0], r[k][1]]);
    return pts;
  });
}

/** Recompute profile/profileTop (720 bins) from the current strokes.
 *
 *  Canonical invariant: strokes WIN when present; when there are NO strokes the
 *  stored profile is authoritative. Deriving an empty profile from an empty
 *  mask would silently remove a horizon we cannot re-derive, which could make a
 *  blocked target look observable. Deliberate clearing goes through clearMask().
 *
 *  Pure: it only rewrites `p.profile`/`p.profileTop` in memory. Persisting is
 *  the caller's job (the editor persists on Save; newPano/importPanos persist
 *  their structural changes themselves), so live editing never hits storage
 *  per pointer sample. */
export function computeProfile(p) {
  if (!Array.isArray(p.strokes) || p.strokes.length === 0) {
    if (!Array.isArray(p.profile) || p.profile.length !== BINS) {
      p.profile = new Array(BINS).fill(NO_BLOCK);
    }
    if (!Array.isArray(p.profileTop) || p.profileTop.length !== BINS) {
      p.profileTop = new Array(BINS).fill(NO_BLOCK);
    }
    return p.profile;
  }
  const mask = rebuildMask(p.strokes, wrapsFor(p));
  const { prof, top } = profileFromMask(p, mask);
  p.profile = prof;
  p.profileTop = top;
  return prof;
}

/** Explicitly clear a panorama's mask: no strokes AND a canonical blank profile
 *  for the paint mode. This is the ONE place a stored profile is discarded,
 *  because the user asked for it. Pure (in-memory only). */
export function clearMask(p) {
  p.strokes = [];
  p.profile = new Array(BINS).fill(p.paintMode === 'sky' ? 90 : NO_BLOCK);
  p.profileTop = new Array(BINS).fill(NO_BLOCK);
  p.profileBins = WORLD_BINS;
  return p.profile;
}

/* ---------------- kept-band crop (shared by both shells) ----------------
 *
 * A horizontal crop keeps ONE contiguous azimuth band and shrinks the
 * calibrated FOV to it. `sel = { x, w }` is the KEPT band in the editor's
 * canvas pixels and `W` is that canvas width (the web passes its 720-wide
 * logical mask, the desktop its displayed canvas width - only the fraction
 * matters). The effective band is expanded to the minimum crop FOV (or the
 * original FOV if already narrower), clamped inside the image, and adjusted to
 * the integer FOV. Both calibration and strokes use that SAME band. */

export const CROP_MIN_FOV = 45;

export function cropKeptBand(fovOld, azOffOld, sel, W) {
  const fov0 = Number(fovOld) > 0 ? Number(fovOld) : 360;
  const az0 = Number(azOffOld) || 0;
  const width = W > 0 ? W : MASK_W;
  const requested = Math.min(width, Math.max(0, Number(sel?.w) || 0));
  const fov = Math.min(fov0, Math.max(Math.min(CROP_MIN_FOV, fov0),
    Math.round(fov0 * requested / width)));
  const w = width * fov / fov0;
  const x = Math.min(width - w, Math.max(0, Number(sel?.x) || 0));
  const azOffset = ((az0 + x / width * fov0) % 360 + 360) % 360;
  return { fov, azOffset, kept: { x, w }, expanded: w > requested + 1e-9,
    minimumApplied: fov0 * requested / width < Math.min(CROP_MIN_FOV, fov0) };
}

/** Transform and clip dabs to the effective kept band. Vertical geometry stays
 * unchanged. Materialize old seam copies before removing full-panorama wrap;
 * keep each paint/erase dab's copies together to preserve stroke order. */
export function cropStrokes(strokes, sel, W, wrap = false) {
  const frac = W > 0 ? (Number(sel?.w) || 0) / W : 1;
  if (!(frac > 0)) return [];
  const x0 = W > 0 ? (Number(sel?.x) || 0) / W * MASK_W : 0;
  const scale = 1 / frac;
  const out = [];
  for (const s of strokes || []) {
    if (s.m === 'trace') {
      const trace = cropSkylineStroke(s, x0, MASK_W * frac);
      if (trace) out.push(trace);
      continue;
    }
    const rx = (s.rx ?? s.r) * scale;
    const centers = wrap && frac < 1 ? [s.x - MASK_W, s.x, s.x + MASK_W] : [s.x];
    for (const center of centers) {
      const x = (center - x0) * scale;
      if (x < -rx || x > MASK_W + rx) continue;
      out.push({ ...s, x, rx });
    }
  }
  return out;
}

/** Non-destructive crop for a stroke-less record: keep the in-FOV world bins
 *  (world azimuths do not move under a crop) and reset the bins the new frame
 *  no longer covers to the mode sentinel, exactly as a fresh panorama of the
 *  new frame holds there. Mutates p in place. */
export function clipProfileToFov(p) {
  const sky = p.paintMode === 'sky';
  const fov = Number(p.fov) > 0 ? Number(p.fov) : 360;
  const azOff = Number(p.azOffset) || 0;
  if (!Array.isArray(p.profile) || p.profile.length !== BINS) {
    p.profile = new Array(BINS).fill(sky ? 90 : NO_BLOCK);
  }
  if (!Array.isArray(p.profileTop) || p.profileTop.length !== BINS) {
    p.profileTop = new Array(BINS).fill(NO_BLOCK);
  }
  for (let i = 0; i < BINS; i++) {
    if (fovBinRel(i, azOff, fov) !== null) continue;
    p.profile[i] = sky ? 90 : NO_BLOCK;
    p.profileTop[i] = NO_BLOCK;
  }
  p.profileBins = WORLD_BINS;
  return p.profile;
}

/** The whole web-side crop in ONE shared call: sets fov/azOffset, transforms +
 *  clips the strokes when present (strokes WIN, profile re-derived), otherwise
 *  clips the authoritative stored profile. Never touches the photo, the alt
 *  bounds, paint mode or block-above. Persisting is the caller's job. */
export function cropPano(p, sel, W) {
  const wrap = wrapsFor(p);
  const { fov, azOffset, kept } = cropKeptBand(p.fov, p.azOffset, sel, W);
  const source = normalizeSourceRect(p.sourceRect);
  const width = W > 0 ? W : MASK_W;
  p.sourceRect = { ...source, x: source.x + source.w * kept.x / width,
    w: source.w * kept.w / width };
  p.fov = fov;
  p.azOffset = azOffset;
  if (Array.isArray(p.strokes) && p.strokes.length) {
    p.strokes = cropStrokes(p.strokes, kept, W, wrap);
    if (p.strokes.length) computeProfile(p);
    else clearMask(p); // an empty crop must not retain the old derived profile
  } else {
    clipProfileToFov(p);
  }
  return p;
}

/**
 * Ceiling lookup for one azimuth (deg). Returns { ceil, ceilTop }.
 * Blocking rule (applied per object sample):
 *   visible = alt >= minAlt && alt > ceil && alt < (ceilTop ?? 90.5)
 * Outside the calibrated FOV: obstacle mode = unblocked, sky mode = blocked.
 */
function profileCeilingFor(p, azDeg) {
  // Guard the record: an imported or legacy panorama without a well-formed
  // profile must degrade to "nothing blocks" (as the desktop and the server
  // do), never to `undefined` - `alt > undefined` is false, which would hide
  // every object in the sky.
  const prof = (p && Array.isArray(p.profile) && p.profile.length === BINS)
    ? p.profile : null;
  const tops = (p && Array.isArray(p.profileTop) && p.profileTop.length === BINS)
    ? p.profileTop : null;
  if (!prof) {
    return (p && p.paintMode === 'sky')
      ? { ceil: 90, ceilTop: null }
      : { ceil: NO_BLOCK, ceilTop: null };
  }
  const fov = Number(p.fov) > 0 ? Number(p.fov) : 360;
  const azOff = Number(p.azOffset) || 0;
  const d = ((azDeg - azOff) % 360 + 360) % 360;
  if (d > fov) {
    if(p.photoModel)return {ceil:90,ceilTop:null}; // converted view: unphotographed directions are unknown/blocked
    return p.paintMode === 'sky' ? { ceil: 90, ceilTop: null } : { ceil: NO_BLOCK, ceilTop: null };
  }
  const col = worldBin(azDeg);   // D1: world-azimuth bins (Python ceil_lookup)
  // CR2: the array guard above checks the LENGTH, not the ELEMENTS. A stored
  // profile can be 720 long and still hold NaN or a string (an imported or
  // hand-built record), and returning that value is the SAME hazard that guard
  // exists to prevent: `alt > NaN` is false, so every object at that azimuth
  // reads as blocked and vanishes from the planning, and `ceil: "x"` compares
  // false too. One bad ELEMENT degrades to the same sentinel the callers already
  // use for a missing profile ("nothing blocks").
  const element = (v, fallback) => (Number.isFinite(v) ? v : fallback);
  if (p.paintMode === 'sky') {
    // DEFAULT: everything ABOVE the painted band is free sky (open above), so
    // the band top is NOT a ceiling. Only when the user explicitly opts into
    // "block above the band" (p.blockAbove) does the painted top become a
    // ceiling (an overhang/balcony). The 90.5 sentinel means open to the zenith.
    const topRaw = (p.blockAbove && tops) ? tops[col] : null;
    const top = (Number.isFinite(topRaw) && topRaw > NO_BLOCK + 0.5) ? topRaw : null;
    return { ceil: element(prof[col], 90), ceilTop: top };
  }
  return { ceil: element(prof[col], NO_BLOCK), ceilTop: null };
}

/** Planning policy over the unchanged profile. Strict coverage is conservative
 * at photograph boundaries and at unassessed columns; inferred-open retains
 * vertical skyline inference but excludes unphotographed azimuths. */
export function ceilFor(p, azDeg) {
  const raw = profileCeilingFor(p, azDeg), policy = horizonCoveragePolicy(p);
  if (policy === 'legacy') return raw;
  if (!p || !Number.isFinite(azDeg)) return { ceil: 90, ceilTop: null };
  const d = ((azDeg - p.azOffset) % 360 + 360) % 360;
  if (!Number.isFinite(d) || !(p.fov > 0) || d > p.fov) return { ceil: 90, ceilTop: null };
  if (policy !== 'strict-measured') return raw;
  const value = p.profile?.[worldBin(azDeg)];
  if (!Number.isFinite(p.altBottom) || !Number.isFinite(p.altTop) || p.altTop <= p.altBottom
      || !Number.isFinite(value) || value <= NO_BLOCK + 0.5) return { ceil: 90, ceilTop: null };
  const bandTop = p.paintMode === 'sky' ? p.profileTop?.[worldBin(azDeg)] : null;
  if (p.paintMode === 'sky' && (!Number.isFinite(bandTop) || bandTop <= NO_BLOCK + 0.5))
    return { ceil: 90, ceilTop: null };
  const measuredTop = Number.isFinite(bandTop) && bandTop > NO_BLOCK + 0.5 ? bandTop : raw.ceilTop ?? 90.5;
  return { ceil: Math.max(raw.ceil, p.altBottom), ceilTop: Math.min(measuredTop, p.altTop) };
}

/** Evidence is not the same as permission to plan. Profile layers cannot
 * assert a complete source-pixel state map: outside coverage, empty columns
 * and extrapolated open sky remain unknown even when legacy policy allows it. */
export function queryHorizonEvidence(p, azDeg, altitude) {
  const policy = horizonCoveragePolicy(p), ceiling = ceilFor(p, azDeg);
  const allowed = Number.isFinite(altitude) && altitude > ceiling.ceil && altitude < (ceiling.ceilTop ?? 90.5);
  const result = (state, provenance) => ({ state, provenance, assumed: state === 'unknown' && allowed, allowed, policy });
  if (!p || !Number.isFinite(azDeg) || !Number.isFinite(altitude)) return result('unknown', 'missing-evidence');
  const d = ((azDeg - p.azOffset) % 360 + 360) % 360;
  if (!Number.isFinite(d) || !(p.fov > 0) || d > p.fov) return result('unknown', 'outside-azimuth-coverage');
  const col = worldBin(azDeg), edge = p.profile?.[col], top = p.profileTop?.[col];
  if (!Number.isFinite(edge) || edge <= NO_BLOCK + 0.5 || (p.paintMode === 'sky' && edge >= 90))
    return result('unknown', 'unassessed-profile-column');
  if (p.paintMode === 'sky' && (!Number.isFinite(top) || top <= NO_BLOCK + 0.5))
    return result('unknown', 'unassessed-sky-band');
  if (!Number.isFinite(p.altBottom) || !Number.isFinite(p.altTop)
      || altitude <= p.altBottom || altitude >= p.altTop) return result('unknown', 'outside-vertical-evidence');
  if (altitude <= edge) return result('blocked', 'recorded-profile');
  if (p.paintMode === 'sky') {
    if (Number.isFinite(top) && top > NO_BLOCK + 0.5 && top < 90.5 && altitude >= top)
      return p.blockAbove ? result('blocked', 'recorded-upper-profile') : result('unknown', 'inferred-open-above-band');
    return result('clear', 'recorded-sky-band');
  }
  return policy === 'legacy' ? result('unknown', 'legacy-skyline-inference') : result('clear', 'covered-profile-opening');
}

/** Raw painted band TOP at an azimuth (sky mode), or null when the column is
 *  outside the FOV / unpainted. Unlike ceilFor this ignores blockAbove, so the
 *  chart can hatch the "assumed open above" area. */
export function bandTopFor(p, azDeg) {
  const prof = (p && Array.isArray(p.profile) && p.profile.length === BINS) ? p.profile : null;
  const tops = (p && Array.isArray(p.profileTop) && p.profileTop.length === BINS) ? p.profileTop : null;
  if (!prof || !tops) return null;
  const fov = Number(p.fov) > 0 ? Number(p.fov) : 360;
  const azOff = Number(p.azOffset) || 0;
  const d = ((azDeg - azOff) % 360 + 360) % 360;
  if (d > fov) return null;
  const col = worldBin(azDeg);   // D1: world-azimuth bins
  const t = tops[col];
  return (t != null && t > NO_BLOCK + 0.5) ? t : null;
}

/** Contiguous azimuth runs (deg, [a0,a1] inclusive) where a sky-mode OVERHANG
 *  exists - i.e. the user opted into "block above the band" AND the painted band
 *  has a real top edge BELOW the zenith, so the sky above it is blocked. With
 *  the default (everything above is free) there is no overhang -> []. */
export function overhangRuns(p, step = 2) {
  if (!p || p.paintMode !== 'sky' || !p.blockAbove) return [];
  const runs = [];
  let run = null;
  for (let az = 0; az < 360; az += step) {   // 360 == 0, not a separate sample
    const { ceilTop } = ceilFor(p, az);
    const has = ceilTop != null && ceilTop < 89.5;
    if (has) {
      if (!run) { run = { a0: az, a1: az }; runs.push(run); }
      else run.a1 = az;
    } else {
      run = null;
    }
  }
  return runs;
}

/** Contiguous azimuth runs where the region ABOVE the painted band is only
 *  visible because of the default assumption (sky mode, NOT blockAbove, band
 *  top below the zenith). Used to hatch that area + explain it in the legend. */
export function assumedOpenRuns(p, step = 2) {
  if (!p || p.paintMode !== 'sky' || p.blockAbove) return [];
  const prof = (Array.isArray(p.profile) && p.profile.length === BINS) ? p.profile : null;
  const tops = (Array.isArray(p.profileTop) && p.profileTop.length === BINS) ? p.profileTop : null;
  if (!prof || !tops) return [];
  const fov = Number(p.fov) > 0 ? Number(p.fov) : 360;
  const azOff = Number(p.azOffset) || 0;
  const runs = [];
  let run = null;
  for (let az = 0; az < 360; az += step) {
    const d = ((az - azOff) % 360 + 360) % 360;
    let has = false;
    if (d <= fov) {
      const col = worldBin(az);   // D1: world-azimuth bins
      const b = prof[col], t = tops[col];
      has = b > NO_BLOCK + 0.5 && b < 90 && t > NO_BLOCK + 0.5 && t < 89.5;
    }
    if (has) {
      if (!run) { run = { a0: az, a1: az }; runs.push(run); }
      else run.a1 = az;
    } else {
      run = null;
    }
  }
  return runs;
}

/** Closed polygon(s) of the assumed-open area ABOVE the painted band for the
 *  profile preview - one per contiguous run of band columns. The preview maps
 *  the BIN INDEX straight to x (full 720 bins across the width), so the hatch
 *  must be built in bin space too: using a world azimuth with `az * 2` only
 *  coincides at azOffset 0 / fov 360 and shifts the region otherwise. Returns
 *  [] unless sky mode with open-above (no blockAbove) is in effect. */
export function assumedOpenHatchPolys(p, W, H, ab, at) {
  if (!p || p.paintMode !== 'sky' || p.blockAbove) return [];
  const prof = (Array.isArray(p.profile) && p.profile.length === BINS) ? p.profile : null;
  const tops = (Array.isArray(p.profileTop) && p.profileTop.length === BINS) ? p.profileTop : null;
  if (!prof || !tops) return [];
  const span = Math.max(1, at - ab);
  const yOf = (alt) => H * (1 - (Math.min(Math.max(alt, ab), at) - ab) / span);
  const polys = [];
  let run = null;
  for (let col = 0; col < BINS; col++) {
    const b = prof[col], t = tops[col];
    const has = b > NO_BLOCK + 0.5 && b < 90 && t > NO_BLOCK + 0.5 && t < 89.5;
    if (!has) { run = null; continue; }
    if (!run) { run = []; polys.push(run); }
    run.push([(col / BINS) * W, yOf(t)]);
  }
  return polys.map((r) => {
    const pts = [...r];
    pts.push([r[r.length - 1][0], 0]);
    pts.push([r[0][0], 0]);
    return pts;
  });
}
