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
export const MASK_H = 360; // 0.25 deg per row of altitude

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
 *  ONE coverage rule, shared by the profile producers, the preview and the
 *  crop, and it MUST agree with the scorer, which gates per azimuth
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
    const val = s.m === 'b' ? 255 : 0;
    const xs = wrap ? [s.x - MASK_W, s.x, s.x + MASK_W] : [s.x];
    for (const sx of xs) {
      const x0 = Math.max(0, Math.floor(sx - s.r));
      const x1 = Math.min(MASK_W - 1, Math.ceil(sx + s.r));
      for (let cx = x0; cx <= x1; cx++) {
        const dx = cx - sx;
        const dy = Math.sqrt(Math.max(0, s.r * s.r - dx * dx));
        const y0 = Math.max(0, Math.floor(s.y - dy));
        const y1 = Math.min(MASK_H - 1, Math.ceil(s.y + dy));
        for (let cy = y0; cy <= y1; cy++) mask[cy * MASK_W + cx] = val;
      }
    }
  }
  return mask;
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
export const wrapsFor = (p) => Number(p.fov) >= 359.5;

/** Obstruction profile from a mask - shared by computeProfile() and the live
 *  overlay (which must not rebuild the mask or hit storage per pointer sample).
 *
 *  D1: the mask is FOV-relative (column 0 = azOffset); the produced profile is
 *  WORLD-AZIMUTH, exactly like the desktop editor and the Python server. Each
 *  world bin i takes the mask column of its FOV-relative position through the
 *  ONE rule `fovBinRel()` (see above), which also covers the bin straddling the
 *  frame start, so the 720-mask-column vs 0.5-deg-bin oversampling cannot
 *  disagree with the desktop representative. Bins outside
 *  the calibrated FOV keep the mode sentinel (sky = 90 blocked, obstacle =
 *  NO_BLOCK). Marks the record's bin space so the adapter never converts it
 *  twice. */
export function profileFromMask(p, mask) {
  const fov = Number(p.fov) > 0 ? Number(p.fov) : 360;
  const azOff = Number(p.azOffset) || 0;
  const sky = p.paintMode === 'sky';
  const prof = new Array(BINS).fill(sky ? 90 : NO_BLOCK);
  const top = new Array(BINS).fill(NO_BLOCK);
  for (let i = 0; i < BINS; i++) {
    const rel = fovBinRel(i, azOff, fov);
    if (rel === null) continue;              // outside the calibrated FOV
    const col = Math.min(BINS - 1, Math.floor(rel * BINS / fov));
    let minRow = -1, maxRow = -1;
    for (let row = 0; row < MASK_H; row++) {
      if (mask[row * MASK_W + col]) { if (minRow < 0) minRow = row; maxRow = row; }
    }
    if (minRow < 0) continue;                // unpainted: sky column stays blocked
    if (sky) {
      prof[i] = altOf(p, maxRow);            // sky mode: bottom edge of painted band
      // Painted to (near) the frame top = open sky above: 90.5 is the "no
      // upper ceiling" sentinel (desktop parity) - without it, everything
      // above a band that reaches altTop was wrongly treated as blocked.
      const eTop = altOf(p, minRow);
      top[i] = eTop >= p.altTop - 4 ? 90.5 : eTop;
    } else {
      prof[i] = altOf(p, minRow);            // top of the painted mask
    }
  }
  p.profileBins = WORLD_BINS;
  return { prof, top };
}

/** Convert a legacy FOV-relative profile (one bin per mask column) to the
 *  canonical world-azimuth bins, in place. Idempotent: records already marked
 *  `profileBins === WORLD_BINS` pass through untouched; a stroke-derived
 *  profile is already world (profileFromMask marks it). Uses the desktop
 *  representative column (`col = floor(rel/fov*720)`), so a converted record
 *  is byte-equivalent to what the desktop editor recomputes from the same
 *  mask. Bins outside the calibrated FOV get the mode sentinel. */
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
 * matters). fovNew = max(45, round(fovOld * w/W)); azNew is the azimuth of the
 * kept band's left edge, at the same 2 dp the desktop transport used.
 *
 * History note (0.6.2x): the retired desktop formula `fovOld * (1 - w/W)`
 * computed the REMOVED fraction while the image, dim overlay, azimuth and HUD
 * all used the kept band - they agreed only at exactly half width (and a
 * select-all crop stored 45 deg). The kept-band formula is the single shared
 * truth now; `CROP_MIN_FOV` is the ONE floor. */

export const CROP_MIN_FOV = 45;

export function cropKeptBand(fovOld, azOffOld, sel, W) {
  const fov0 = Number(fovOld) > 0 ? Number(fovOld) : 360;
  const az0 = Number(azOffOld) || 0;
  const w = Number(sel && sel.w) || 0;
  const frac = (W > 0) ? Math.min(1, Math.max(0, w / W)) : 1;
  const fov = Math.max(CROP_MIN_FOV, Math.round(fov0 * frac));
  let az = ((az0 + ((Number(sel && sel.x) || 0) / W) * fov0) % 360 + 360) % 360;
  az = (Math.round(az * 100) / 100) % 360;
  return { fov, azOffset: az };
}

/** Transform + clip FOV-relative strokes into a kept-band crop. Horizontal
 *  only: y and radius are unchanged. A dab whose circle overlaps the kept band
 *  is kept even when its centre lands just outside; rebuildMask clips it. */
export function cropStrokes(strokes, sel, W) {
  const w = Number(sel && sel.w) || 0;
  const frac = (W > 0) ? w / W : 1;
  if (!(frac > 0)) return [];
  const x0 = ((Number(sel && sel.x) || 0) / W) * MASK_W;
  const scale = 1 / frac;
  const out = [];
  for (const s of strokes || []) {
    const nx = (s.x - x0) * scale;
    const r = Number(s.r) || 0;
    if (nx < -r || nx > MASK_W + r) continue;
    out.push({ ...s, x: nx });
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
  const { fov, azOffset } = cropKeptBand(p.fov, p.azOffset, sel, W);
  p.fov = fov;
  p.azOffset = azOffset;
  if (Array.isArray(p.strokes) && p.strokes.length) {
    p.strokes = cropStrokes(p.strokes, sel, W);
    computeProfile(p);
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
export function ceilFor(p, azDeg) {
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
    return p.paintMode === 'sky' ? { ceil: 90, ceilTop: null } : { ceil: NO_BLOCK, ceilTop: null };
  }
  const col = worldBin(azDeg);   // D1: world-azimuth bins (Python ceil_lookup)
  if (p.paintMode === 'sky') {
    // DEFAULT: everything ABOVE the painted band is free sky (open above), so
    // the band top is NOT a ceiling. Only when the user explicitly opts into
    // "block above the band" (p.blockAbove) does the painted top become a
    // ceiling (an overhang/balcony). The 90.5 sentinel means open to the zenith.
    const top = (p.blockAbove && tops && tops[col] > NO_BLOCK + 0.5) ? tops[col] : null;
    return { ceil: prof[col], ceilTop: top };
  }
  return { ceil: prof[col], ceilTop: null };
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
