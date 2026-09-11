/*
 * NightSeam core - public surface.
 *
 * Shells import this module through the baked stable stub `core.js`
 * (scripts/build_core.py copies this tree to content-hashed URLs and derives
 * the stub's explicit export list from THIS file). Keep the list explicit -
 * no `export *` - so the no-bundler import checker can resolve every named
 * import and the drift check can compare the stub against it.
 */

export {
  NO_BLOCK, BINS, BIN_DEG, MASK_W, MASK_H, WORLD_BINS,
  rebuildMask, altOf, rowOfAlt, xOfAz, azOfX, wrapsFor,
  profileFromMask, normalizeProfileBins, profileSegments,
  visibleSkyBands, skyBandPolygons,
  computeProfile, clearMask, ceilFor, bandTopFor,
  overhangRuns, assumedOpenRuns, assumedOpenHatchPolys,
} from './horizon.js';

export {
  fmtSize, sizeArcmin, fmtFov, fmtFovPair, framePct, magVisible,
  SKY_ZOOM_MIN, SKY_ZOOM_MAX, skyClampZoom, skyViewMatrix,
  skyScreenToBase, skyClampFocus,
} from './format.js';

export {
  TYPE_LABELS, TYPE_COLORS, isCustomId, searchBlob,
} from './catalog.js';

export {
  offsetEastMin, zoneOffsetAtLocalNoon, wallFromUtcMs, utcFromWallMs,
} from './time.js';

export {
  julianDay, dateFromJD, gmstDeg, precessJ2000ToDate, precessDateToJ2000,
  refractionDeg, altaz, altazFrame, altazFrameApply,
  sunRaDec, moonRaDec, moonIllumination, moonAge,
} from './astro.js';

export {
  aboveHorizon, sampleVisible, statusOf, effectiveMinAlt,
} from './visibility.js';

export {
  MOON_TYPE_FACTOR, moonSensitivity, moonMinDist, effectiveMoonGlow,
  moonPenalty, bortleMoonFactor, popularityFactor,
} from './scoring.js';
