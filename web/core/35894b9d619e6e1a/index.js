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
  NO_BLOCK, BINS, MASK_W, MASK_H,
  rebuildMask, altOf, rowOfAlt, xOfAz, azOfX, wrapsFor,
  profileFromMask, profileSegments, visibleSkyBands, skyBandPolygons,
  computeProfile, clearMask, ceilFor, bandTopFor,
  overhangRuns, assumedOpenRuns, assumedOpenHatchPolys,
} from './horizon.js';
