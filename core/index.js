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
  NO_BLOCK, BINS, BIN_DEG, ALT_MIN, ALT_MAX, MAX_POINTS, NAME_MAX,
  PHOTO_MAX_PIXELS, PHOTO_WIDTH_MIN,
  wrapAz, azDelta, normalizePoints, normalizePhotoPlacement, normalizeHorizon,
  skylineAltAt, skylineProfile, withProfile, binOf, ceilFor, hasSkyline,
  replacePointsInRange, simplifyLine, detectSkylineRows,
  photoScale, photoToWorld, worldToPhoto, reprojectPoints, headingForLandmark,
  defaultPhotoPlacement, photoFileDimensions,
  parseHorizonFile, formatHorizonFile,
} from './horizon.js';

export {
  fmtSize, sizeArcmin, fmtFov, fmtFovPair, framePct, magVisible,
  SKY_ZOOM_MIN, SKY_ZOOM_MAX, skyClampZoom, skyViewMatrix,
  skyScreenToBase, skyClampFocus,
} from './format.js';

export {
  TYPE_LABELS, TYPE_COLORS, isCustomId, searchBlob, wikiTitles,
  TIER_BANDS, TIER_ORDER, tierForRank, assignPopularityTiers,
} from './catalog.js';

export {
  offsetEastMin, zonedWallToUtcMs, zoneOffsetAtLocalNoon, wallFromUtcMs, utcFromWallMs,
} from './time.js';

export {
  HISTORY_LIMIT as HORIZON_HISTORY_LIMIT,
  snapshot as snapshotHorizon, applySnapshot as applyHorizonSnapshot,
  newHistory, historyCommit, historyCanUndo, historyCanRedo,
  historyUndo, historyRedo, historyMarkSaved, historyDirty,
} from './horizonhistory.js';

export {
  PLANNER_CHANGE_EVENT, nextPlannerRevision, plannerChange, panoramaRevision,
} from './plannerstate.js';

export {
  julianDay, dateFromJD, gmstDeg, precessJ2000ToDate, precessDateToJ2000,
  refractionDeg, altaz, altazFrame, altazFrameApply,
  objectDayInfo, objectNightInfo, sunRaDec, moonRaDec, moonDistanceKm, moonAltAz, moonIllumination, moonAge, sunAlt, sepDeg,
} from './astro.js';

export {
  sunCrossings, nightInfo, pickDarkWindow, scrubWindowMs,
  scrubBounds, scrubClamp,
} from './planning.js';

export {
  aboveHorizon, sampleVisible, statusOf, effectiveMinAlt,
  VISIBILITY_REASON, visibilityReason, panoramaVisibilityReason, summarizeVisibility,
  ADV_TONIGHT_MAG_CAP, TONIGHT_MAG_UNCAPPED, vmagKnownAndUnder, inTonightPool,
} from './visibility.js';

export {
  MOON_TYPE_FACTOR, moonSensitivity, moonMinDist, effectiveMoonGlow,
  moonPenalty, bortleMoonFactor, popularityFactor, nightStats, nightStatsBatch,
  computeNightTracks, scoreNightTracks,
} from './scoring.js';
