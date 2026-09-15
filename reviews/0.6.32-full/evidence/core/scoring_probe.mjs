/* Lane probe: core/scoring.js curves, windows, tracks, ceiling parity. Read-only. */
import { pathToFileURL, fileURLToPath } from 'node:url';
const R = fileURLToPath(new URL('../../../../', import.meta.url));
const S = await import(pathToFileURL(R + 'core/scoring.js').href);
const H = await import(pathToFileURL(R + 'core/horizon.js').href);
const V = await import(pathToFileURL(R + 'core/visibility.js').href);
const j = (x) => JSON.stringify(x);
const out = (t, v) => console.log(t + ' :: ' + j(v));

/* ---- 1. curves at boundaries ---- */
const ages = [0, 7.38, 14.76, 14.9, 29.53, null, undefined, NaN, -3];
out('moonMinDist(lrgb, age)', ages.map((a) => [String(a), S.moonMinDist('lrgb', a)]));
out('moonMinDist(other-filter)', ['zzz', undefined, null, ''].map((f) => [String(f), S.moonMinDist(f, 7.38)]));
out('glow(illum, sep, lrgb, 7.38)', [[1, 0], [1, 100], [1, -45], [1.5, 0], [2, 0], [0.5, 1000]]
  .map(([i, s]) => [i, s, S.effectiveMoonGlow(i, s, 'lrgb', 7.38)]));
out('glow age undefined', [S.effectiveMoonGlow(0.7, 40, 'lrgb', undefined), S.effectiveMoonGlow(0.7, 40, 'lrgb', null)]);
out('bortleMoonFactor', [0, -1, 1, 3, 2.999, 3.001, 4, 9, 10, NaN, undefined, null, '4', true]
  .map((b) => [String(b), S.bortleMoonFactor(b)]));
out('moonPenalty', [[NaN, 1, 1], [0, 0, 0], [1, 1.6, 1.12], [5, 1, 1]]
  .map(([g, t, b]) => [[g, t, b], S.moonPenalty(g, t, b)]));
out('popularityFactor', [NaN, -5, 0, undefined, null, '', 100, 165350, 1e9, 'abc', '100']
  .map((p) => [String(p), S.popularityFactor(p)]));
out('moonSensitivity', ['nebula', 'unknown', undefined, '', 'toString', 'constructor']
  .map((t) => [String(t), S.moonSensitivity(t)]));

/* ---- 2. nightStats window edges ---- */
const step = 6 / 1440;
const obj = { id: 'x', ra_hours: 5.5, dec_deg: 22, otype: 'galaxy' };
const jd0 = 2461305.5;
const run = (a, b, minAlt = 10) => S.nightStats(obj, a, b, step, minAlt, null, 52.5, 13.4);
out('window normal (12 samples)', (() => { const r = run(jd0, jd0 + 12 * step); return [r.n, r.visN, r.pct, r.blockedPct]; })());
out('window inverted jd1<jd0 (-0.1d)', (() => { const r = run(jd0, jd0 - 0.1); return [r.n, r.visN, r.pct, r.bestRun]; })());
out('window zero-length jd1==jd0', (() => { const r = run(jd0, jd0); return [r.n, r.visN, r.pct]; })());
out('pct matches round(100*visN/count)', (() => {
  const t = S.computeNightTracks([obj], jd0, jd0 + 30 * step, step, 52.5, 13.4);
  const r = S.scoreNightTracks(t, [obj], jd0, step, 10, null, {})[0];
  return [r.n, t.count, r.visN, r.pct, Math.round(100 * r.visN / t.count)];
})());

/* ---- 3. batch equivalence / order / chunk boundary ---- */
const many = [];
for (let k = 0; k < 300; k++) {
  many.push({ id: 'o' + k, ra_hours: (k * 0.8) % 24, dec_deg: -60 + (k % 120), otype: k % 3 ? 'galaxy' : 'nebula' });
}
const batch = S.nightStatsBatch(many, jd0, jd0 + 6 * step, step, 10, null, 52.5, 13.4);
const alone = many.map((o) => S.nightStats(o, jd0, jd0 + 6 * step, step, 10, null, 52.5, 13.4));
let mism = 0, orderBad = 0;
batch.forEach((b, k) => {
  const a = alone[k];
  for (const f of ['visN', 'pct', 'maxAlt', 'transitJd', 'blocked', 'bestRun', 'sClassic']) if (!Object.is(a[f], b[f])) mism++;
  if (a.visN !== b.visN) orderBad++;
});
out('batch(len/order mismatches)', [batch.length, mism, orderBad]);
// chunked (as web/app.js chunks) must equal the whole-set call
const chunks = [];
for (let i = 0; i < many.length; i += 250) chunks.push(...S.nightStatsBatch(many.slice(i, i + 250), jd0, jd0 + 6 * step, step, 10, null, 52.5, 13.4));
let cm = 0; chunks.forEach((b, k) => { for (const f of ['visN', 'pct', 'maxAlt', 'blocked']) if (!Object.is(b[f], batch[k][f])) cm++; });
out('chunked-vs-whole mismatches', [chunks.length, cm]);

/* ---- 4. inlined ceiling vs core/horizon.js::ceilFor ---- */
const prof = new Array(720), tops = new Array(720);
for (let i = 0; i < 720; i++) { prof[i] = 10 + (i % 40); tops[i] = 80 - (i % 20); }
const panos = [];
for (const fov of [360, 180, 45]) for (const azOffset of [0, 180, -30]) for (const paintMode of ['obstacle', 'sky'])
  for (const blockAbove of [false, true]) panos.push({ profile: prof, profileTop: tops, fov, azOffset, paintMode, blockAbove });
let ceilN = 0, ceilBad = 0, ceilEx = null;
for (const pano of panos) {
  for (let az = -370; az <= 370; az += 7.3) {
    const canon = H.ceilFor(pano, az);
    const want = V.sampleVisible(45, 10, canon.ceil, canon.ceilTop);
    const t = { n: 2, count: 3, alt: Float64Array.from([45, 45, 45]), az: Float64Array.from([az, az, az]) };
    const got = S.scoreNightTracks(t, [obj], jd0, step, 10, pano, {})[0].visN > 0;
    ceilN++;
    if (got !== want) { ceilBad++; if (!ceilEx) ceilEx = { fov: pano.fov, azOffset: pano.azOffset, paintMode: pano.paintMode, blockAbove: pano.blockAbove, az: Math.round(az * 10) / 10, ceil: canon.ceil, top: canon.ceilTop, got, want }; }
  }
}
out('ceiling parity (n, mismatches, example)', [ceilN, ceilBad, ceilEx]);
