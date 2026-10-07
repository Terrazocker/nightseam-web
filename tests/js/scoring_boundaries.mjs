import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
const coreDir = process.argv[2] || fileURLToPath(new URL('../../core', import.meta.url));
const {
  computeNightTracks, scoreNightTracks, nightStats, nightInfo,
  pickDarkWindow, julianDay,
} = await import(pathToFileURL(coreDir + '/index.js').href);

const close = (actual, expected, message) =>
  assert(Math.abs(actual - expected) < 0.00001, `${message}: ${actual} != ${expected}`);
const step = 6 / 1440;
const obj = { id: 'pole', ra_hours: 0, dec_deg: 89, otype: 'open_cluster' };
const noon = new Date('2026-10-05T10:00:00Z'); // Berlin local noon, independent of test machine zone.
const dark = pickDarkWindow(nightInfo(noon, 52.52, 13.40, noon), noon, noon);
const start = julianDay(dark.dusk), end = julianDay(dark.dawn);
const stats = nightStats(obj, start, end, step, 25, null, 52.52, 13.40);
assert.equal(stats.bestStart, start);
assert.equal(stats.bestEnd, end, 'fully clear Berlin night must end at authoritative dawn');
assert.equal(stats.pct, 100);
close(stats.bestMinutes, (end - start) * 1440, 'full-clear duration');
close(stats.visibleMinutes, (end - start) * 1440, 'full-clear visible time');
assert.equal(stats.bestRun, 89, 'the after-dawn node owns no observing interval');

// Real object which previously advertised 05:28 despite the 05:21 dawn.
const ngc281 = { id: 'ngc281', ra_hours: 0.88315, dec_deg: 56.62189, otype: 'nebula' };
const actual = nightStats(ngc281, start, end, step, 25, null, 52.52, 13.40);
assert.equal(actual.bestEnd, end);
assert.equal(actual.pct, 100);
close(actual.bestMinutes, (end - start) * 1440, 'NGC 281 full-clear duration');

const makeTracks = (values, jd1) => ({
  n: values.length - 1, count: values.length, jd0: 2460000, jd1,
  alt: Float64Array.from(values), az: new Float64Array(values.length),
});
const base = 2460000;
const scored = (values, minutes, context = {}) => scoreNightTracks(
  makeTracks(values, base + minutes / 1440), [obj], base, step, 25, null, context,
)[0];
const exact = scored([35, 35, 35, 35], 18);
assert.equal(exact.visN, 3, 'a visible terminal node is not a fourth interval');
assert.equal(exact.bestEnd, base + 18 / 1440);
close(exact.visibleMinutes, 18, 'exact-grid terminal clipping');
const partial = scored([0, 35, 35, 35], 14);
assert.equal(partial.visN, 2);
assert.equal(partial.bestStart, base + step);
assert.equal(partial.bestEnd, base + 14 / 1440);
close(partial.bestMinutes, 8, 'partial final run');
close(partial.visibleMinutes, 8, 'partial final visibility');
assert.equal(partial.pct, 57, 'percent uses 8/14 minutes rather than two/three nodes');
const terminalOnly = scored([0, 0, 35], 12);
assert.equal(terminalOnly.visN, 0);
assert.equal(terminalOnly.bestEnd, null);
assert.equal(terminalOnly.visibleMinutes, 0);
const longest = scored([35, 35, 0, 35, 35], 25);
assert.equal(longest.bestStart, base, '12 minute run beats final 7 minute run with equal node count');
close(longest.bestMinutes, 12, 'longest run uses duration');
const laterLonger = scored([35, 35, 0, 35, 35, 0], 30, {
  window: [base + 5 / 1440, base + 30 / 1440],
});
assert.equal(laterLonger.bestStart, base + 18 / 1440,
  'a later 12 minute run beats an earlier 7 minute run with equal node count');
close(laterLonger.bestMinutes, 12, 'partial initial cell does not win a duration tie');
const clipped = scored([35, 35, 35, 35], 18, {
  window: [base + 2 / 1440, base + 14 / 1440],
});
assert.equal(clipped.bestStart, base + 2 / 1440);
assert.equal(clipped.bestEnd, base + 14 / 1440);
close(clipped.visibleMinutes, 12, 'exact non-grid endpoints');
assert.equal(clipped.pct, 100);
const noWindow = scored([35, 35], 0);
assert.equal(noWindow.visN, 0);
assert.equal(noWindow.pct, 0);
assert.equal(noWindow.bestEnd, null);

// Polar fallback keeps the established 20:00–04:00 policy and is bounded too.
const polarNoon = new Date('2026-06-21T10:00:00Z');
const polar = pickDarkWindow(nightInfo(polarNoon, 69.65, 18.96, polarNoon), polarNoon, polarNoon);
assert.equal(polar.level, 'fallback');
const polarStart = julianDay(polar.dusk), polarEnd = julianDay(polar.dawn);
const polarStats = nightStats(obj, polarStart, polarEnd, step, 25, null, 69.65, 18.96);
assert.equal(polarStats.bestEnd, polarEnd);
close(polarStats.visibleMinutes, 480, 'polar fallback duration');

// Splitting track construction/scoring must retain the physical endpoints.
const tracks = computeNightTracks([obj], start, end, step, 52.52, 13.40);
assert.equal(tracks.jd0, start);
assert.equal(tracks.jd1, end);
assert.deepEqual(scoreNightTracks(tracks, [obj], start, step, 25, null)[0], stats);
console.log('bounded half-open scoring contract held');
