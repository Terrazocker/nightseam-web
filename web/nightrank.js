/*
 * NightSeam Web - shared per-object night statistics.
 *
 * Phase 2, concept 9: `sampleVisible` and the `nightStats` aggregation now
 * live in core/ (core/visibility.js + core/scoring.js); this shell re-exports
 * them so app.js and the "nightstats" engine keep their import surface.
 * The desktop calls the SAME core loop from derive.js::recomputeNightDerived
 * (it passes its dusk..dawn scoring range); there is no second
 * aggregation on either side any more.
 */
export { sampleVisible, nightStats, nightStatsBatch } from './core.js?v=44';
