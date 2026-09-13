/*
 * NightSeam Web - shared per-object night statistics.
 *
 * Phase 2, concept 9: `sampleVisible` and the `nightStats` aggregation now
 * live in core/ (core/visibility.js + core/scoring.js); this shell re-exports
 * them so app.js and the "nightstats" engine keep their import surface.
 * The desktop's equivalent derived loop stays in static/js/derive.js.
 */
export { sampleVisible, nightStats, nightStatsBatch } from './core.js?v=24';
