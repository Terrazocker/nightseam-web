/*
 * NightSeam Web - display formatting and chart presentation helpers.
 *
 * Phase 2 (concept 1): the implementation lives ONCE in core/format.js and is
 * re-exported here, so app.js and tests keep their import surface while the
 * desktop shell (static/js/util.js, static/js/derive.js) consumes the same
 * functions. Catalog sizes are ARCMINUTES and shown in ONE user-chosen unit.
 * The magnitude-limit rule ("mag" engine) and the square zoom geometry
 * ("skyzoom" engine) of tests/js/astro_parity.mjs are pinned here.
 */

export {
  fmtSize, sizeArcmin, fmtFov, fmtFovPair, framePct, magVisible,
  SKY_ZOOM_MIN, SKY_ZOOM_MAX, skyClampZoom, skyViewMatrix,
  skyScreenToBase, skyClampFocus,
} from './core.js?v=21';
