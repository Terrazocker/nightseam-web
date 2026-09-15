/* Read-only audit probes for core/horizon.js + core/format.js (0.6.32 review).
 * Run: node reviews/0.6.32-full/evidence/core/lane_horizon_fmt.mjs
 * Prints compact JSON lines prefixed FINDING:/PROBE:.
 */
const ROOT = 'file:///<workspace>/AstroPilot-local/';
const H = await import(ROOT + 'core/horizon.js');
const F = await import(ROOT + 'core/format.js');
const BINS = 720;
const out = (tag, o) => console.log(tag + ' ' + JSON.stringify(o));

/* ---------- helpers ---------- */
const mk = (over = {}) => ({
  azOffset: 0, altBottom: 0, altTop: 90, fov: 360, paintMode: 'sky',
  blockAbove: false,
  profile: new Array(BINS).fill(90), profileTop: new Array(BINS).fill(-90),
  strokes: [], ...over,
});
const fill = (v, from = 0, to = BINS) => {
  const a = new Array(BINS).fill(null);
  for (let i = from; i < to; i++) a[i] = v;
  return a;
};
const W = Array.from({ length: BINS }, (_, i) => i);
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

/* ===== 1. visibleSkyBands complement contract (fuzz + targeted) ===== */
function tileIssue(p, ab, zen) {
  const bands = H.visibleSkyBands(p, ab, zen);
  if (bands.length !== BINS) return { kind: 'length', got: bands.length };
  for (let c = 0; c < BINS; c++) {
    const { vis, blocked } = bands[c];
    const iv = blocked.map((b) => [b[0], b[1]]);
    if (vis) iv.push([vis[0], vis[1]]);
    iv.sort((a, b) => a[0] - b[0]);
    let cur = ab;
    for (const [a, b] of iv) {
      if (a > cur + 1e-9) return { kind: 'gap', c, at: [cur, a], vis, blocked };
      if (a < cur - 1e-9) return { kind: 'overlap', c, at: [a, cur], vis, blocked };
      if (b < a - 1e-9) return { kind: 'inverted', c, at: [a, b], vis, blocked };
      cur = Math.max(cur, b);
    }
    if (cur < zen - 1e-9) return { kind: 'short', c, ends: cur, vis, blocked };
  }
  return null;
}
const cases = [];
// targeted: band drawn BELOW altBottom (stored profile kept authoritative)
cases.push(['bandBelowAb-sky', mk({ altBottom: 10, profile: fill(20).map((v, i) => (i < 100 ? -5 : 90)), profileTop: fill(40).map((v, i) => (i < 100 ? 30 : -90)) })]);
cases.push(['bandBelowAb-obl', mk({ altBottom: 10, paintMode: 'obstacle', profile: fill(5).map((v, i) => (i < 100 ? -5 : -90)) })]);
cases.push(['ceilBelowAb-obl', mk({ altBottom: 10, paintMode: 'obstacle', profile: new Array(BINS).fill(-20) })]);
cases.push(['topLtBottom-blockAbove', mk({ blockAbove: true, profile: fill(50), profileTop: fill(20) })]);
cases.push(['ceilAboveZen-obl', mk({ paintMode: 'obstacle', profile: fill(95) })]);
cases.push(['bandAtZen-sky', mk({ profile: fill(90) })]);
cases.push(['band89999-sky', mk({ profile: fill(89.999) })]);
cases.push(['eEqualsAb-sky', mk({ profile: fill(0) })]);
cases.push(['eEqualsAb-obl', mk({ paintMode: 'obstacle', profile: fill(0) })]);
cases.push(['missingTop-sky-blockAbove', { profile: fill(20), paintMode: 'sky', blockAbove: true, altBottom: 0, fov: 360, azOffset: 0 }]);
// fuzz: profiles with values around/outside [ab, at]
for (let n = 0; n < 4000; n++) {
  const ab = [0, 5, 20, -10][Math.floor(rnd() * 4)];
  const zen = 90;
  const pool = [H.NO_BLOCK, ab - 30, ab - 0.001, ab, ab + 0.5, rnd() * 60, 60 + rnd() * 30, 89.5, 89.999, 90, 90.5];
  const tpool = [H.NO_BLOCK, -30, ab, 10, 90.5, 89.4, 90, 5];
  const p = mk({
    altBottom: ab,
    paintMode: rnd() < 0.5 ? 'sky' : 'obstacle',
    blockAbove: rnd() < 0.5,
    profile: Array.from({ length: BINS }, () => pool[Math.floor(rnd() * pool.length)]),
    profileTop: Array.from({ length: BINS }, () => tpool[Math.floor(rnd() * tpool.length)]),
  });
  cases.push(['fuzz#' + n, p]);
}
function allKinds(p) {
  const kinds = {};
  const ab = p.altBottom;
  const bands = H.visibleSkyBands(p, ab, 90);
  if (bands.length !== BINS) return { length: bands.length };
  const add = (k, v) => { (kinds[k] = kinds[k] || []).push(v); };
  for (let c = 0; c < BINS; c++) {
    const { vis, blocked } = bands[c];
    if (vis && vis[0] < ab - 1e-9) add('vis-below-ab', { c, vis, blocked });
    for (const [a, b] of blocked) if (a < ab - 1e-9) add('blocked-below-ab', { c, iv: [a, b], vis });
    if (vis) {
      for (const [a, b] of blocked) {
        if (Math.min(b, vis[1]) - Math.max(a, vis[0]) > 1e-9) add('overlap', { c, vis, blocked });
      }
    }
    const iv = blocked.map((q) => [q[0], q[1]]);
    if (vis) iv.push([vis[0], vis[1]]);
    iv.sort((a, b) => a[0] - b[0]);
    let cur = ab;
    for (const [a, b] of iv) {
      if (a > cur + 1e-9 && !(vis && Math.abs(a - vis[0]) < 1e-9)) add('gap', { c, at: [cur, a], vis, blocked });
      cur = Math.max(cur, b);
    }
    if (cur < 90 - 1e-9) add('short', { c, ends: cur, vis, blocked });
  }
  return kinds;
}
const byKind = {};
for (const [name, p] of cases) {
  const kinds = allKinds(p);
  for (const k of Object.keys(kinds)) {
    byKind[k] = byKind[k] || { n: 0, example: null };
    byKind[k].n++;
    if (!byKind[k].example) byKind[k].example = { name, kind: k, first: kinds[k][0] };
  }
}
out(byKind.gap ? 'FINDING' : 'PROBE', { probe: '1-complement-fuzz', cases: cases.length, violations: byKind });
// classify the over-extending (below-ab) case explicitly
const belowAb = (() => {
  const p = mk({ altBottom: 10, paintMode: 'sky', profile: fill(20).map((v, i) => (i === 0 ? -5 : 90)), profileTop: fill(30).map((v, i) => (i === 0 ? 30 : -90)) });
  const b = H.visibleSkyBands(p, 10, 90)[0];
  return { vis: b.vis, blocked: b.blocked, span: [10, 90] };
})();
out('FINDING-CANDIDATE', { probe: '1a-sky-band-below-altBottom', band0: belowAb });

/* ===== 2. skyBandPolygons on an OBSTACLE record (docstring says []) ===== */
{
  const p = mk({ paintMode: 'obstacle', profile: new Array(BINS).fill(10) });
  const polys = H.skyBandPolygons(p, 720, 56, 0, 90, 0, 360);
  out('FINDING-CANDIDATE', { probe: '2-skyBandPolygons-obstacle-mode', polys: polys.length, firstPt: polys[0] && polys[0][0] });
}
{ // bin-space vs FOV-relative: preview transform is bin space (caller passes 0/360)
  const p = mk({ azOffset: 90, fov: 180, profile: fill(5), profileTop: fill(40) });
  const withReal = H.skyBandPolygons(p, 720, 56, 0, 90, 90, 180);
  const withZero = H.skyBandPolygons(p, 720, 56, 0, 90, 0, 360);
  const xs = (a) => [Math.min(...a.flat().map((q) => q[0])), Math.max(...a.flat().map((q) => q[0]))];
  const hatch = H.assumedOpenHatchPolys(p, 720, 56, 0, 90);
  out('PROBE', { probe: '2b-partial-fov-x-ranges', bandRealFov: xs(withReal), bandZeroFov: xs(withZero), hatch: xs(hatch) });
}

/* ===== 3. normalizeProfileBins identity at fov=360/azOffset=0 + seam ===== */
{
  const prof = W.map((i) => (i % 7 === 0 ? 90.5 : i % 5 === 0 ? H.NO_BLOCK : i * 0.1 - 10));
  const tops = W.map((i) => (i % 3 === 0 ? 90.5 : i * 0.05));
  const p = { fov: 360, azOffset: 0, paintMode: 'sky', profile: prof.slice(), profileTop: tops.slice() };
  H.normalizeProfileBins(p);
  const idProf = JSON.stringify(p.profile) === JSON.stringify(prof);
  const idTop = JSON.stringify(p.profileTop) === JSON.stringify(tops);
  out(idProf && idTop ? 'PROBE' : 'FINDING', { probe: '3-normalize-identity-360', idProf, idTop, bins: p.profileBins });
  // fov 359.5 (wrapsFor true) - not the identity, is the wrap handled?
  const q = { fov: 359.5, azOffset: 0, paintMode: 'obstacle', profile: W.slice() };
  H.normalizeProfileBins(q);
  const diffs = W.filter((i) => q.profile[i] !== W[i]);
  out('PROBE', { probe: '3b-normalize-359.5', diffCount: diffs.length, first3: diffs.slice(0, 3).map((i) => [i, W[i], q.profile[i]]) });
}

/* ===== 4. cropKeptBand grid ===== */
{
  const bad = [];
  let n = 0;
  for (const Wd of [720, 1000, 0, -5, undefined]) {
    for (const fov0 of [360, 200, 60, 30, 45, 0, -10, NaN]) {
      for (const az0 of [0, 90, 359.9, 13.77, 400, -10, NaN]) {
        for (const x of [0, 1, 100, 350, 719, -50, 900, NaN]) {
          for (const w of [0, 1, 350, 720, 900, -10, NaN]) {
            n++;
            const r = H.cropKeptBand(fov0, az0, { x, w }, Wd);
            const okFov = Number.isInteger(r.fov) && r.fov >= 45;
            const okAz = Number.isFinite(r.azOffset) && r.azOffset >= 0 && r.azOffset < 360;
            if (!okFov || !okAz) bad.push({ Wd, fov0, az0, x, w, got: r });
          }
        }
      }
    }
  }
  const nans = bad.filter((b) => !Number.isFinite(b.got.azOffset));
  out(bad.length ? 'FINDING' : 'PROBE', { probe: '4-cropKeptBand-grid', n, bad: bad.length, nanAz: nans.length, sample: bad.slice(0, 4) });
}
{
  // kept band must be covered by the new frame (world azimuth preserved)
  const worst = { err: 0, at: null };
  for (const Wd of [720, 1000]) {
    for (const fov0 of [360, 200, 75]) {
      for (const az0 of [0, 90, 359.9]) {
        for (let x = 0; x < Wd; x += 37) {
          for (let w = 4; w + x <= Wd; w += 53) {
            const { fov, azOffset } = H.cropKeptBand(fov0, az0, { x, w }, Wd);
            const left = ((az0 + (x / Wd) * fov0) % 360 + 360) % 360;
            const rightWanted = fov0 * (w / Wd);
            // how much of the kept band's right edge falls past the new frame?
            const miss = rightWanted - fov;            // >0 when rounded down
            if (miss > worst.err) { worst.err = miss; worst.at = { Wd, fov0, az0, x, w, fov, azOffset, left }; }
            void left;
          }
        }
      }
    }
  }
  out('PROBE', { probe: '4b-kept-band-round-down-miss-deg', worst });
}
{
  const r = H.cropKeptBand(360, 359.99, { x: 719, w: 1 }, 720);
  out('PROBE', { probe: '4c-az-wrap-360', r });
}

/* ===== 5. ceilFor / bandTopFor sentinels + fov coverage vs fovBinRel ===== */
{
  const recs = [
    ['360/0', mk({ profile: fill(12), profileTop: fill(40) })],
    ['360/359.7', mk({ azOffset: 359.7, profile: fill(12), profileTop: fill(40) })],
    ['67/50.28', mk({ fov: 67, azOffset: 50.28, profile: fill(12), profileTop: fill(40) })],
    ['45/0.25', mk({ fov: 45, azOffset: 0.25, profile: fill(12), profileTop: fill(40) })],
    ['fov0', mk({ fov: 0, profile: fill(12), profileTop: fill(40) })],
    ['fovNaN', mk({ fov: NaN, profile: fill(12), profileTop: fill(40) })],
    ['fovNeg', mk({ fov: -30, profile: fill(12), profileTop: fill(40) })],
  ];
  const viol = [];
  for (const [name, p] of recs) {
    const fov = Number(p.fov) > 0 ? Number(p.fov) : 360;
    const azOff = Number(p.azOffset) || 0;
    for (let az = 0; az < 360; az += 0.25) {
      const d = ((az - azOff) % 360 + 360) % 360;
      const inside = d <= fov;
      const bin = Math.min(BINS - 1, Math.floor((((az % 360) + 360) % 360) / 0.5));
      const rel = H.fovBinRel(bin, azOff, fov);
      if (inside && rel === null) viol.push({ name, az, kind: 'scorer-in-preview-out' });
      if (!inside && rel !== null) {
        // only OK when the bin straddles the frame start
        const r2 = ((((bin * 0.5 - azOff) % 360) + 360) % 360);
        if (!(r2 + 0.5 > 360)) viol.push({ name, az, kind: 'preview-in-scorer-out', bin, r2 });
      }
    }
  }
  out(viol.length ? 'FINDING' : 'PROBE', { probe: '5-fov-coverage-agreement', violations: viol.length, sample: viol.slice(0, 5) });
}
{
  const p = mk({ blockAbove: true, profile: fill(12), profileTop: fill(90.5, 0, 100).map((v, i) => (i < 100 ? 90.5 : 40)) });
  const a = H.ceilFor(p, 10), b = H.ceilFor(p, 300);
  const t1 = H.bandTopFor(p, 10), t2 = H.bandTopFor(p, 300);
  const noBlock = mk({ paintMode: 'obstacle', profile: new Array(BINS).fill(H.NO_BLOCK) });
  out('PROBE', { probe: '5b-sentinels', ceilTopSentinel: a, ceilTopReal: b, bandTop: [t1, t2], noBlockCeil: H.ceilFor(noBlock, 100) });
}

/* ===== 6. cropPano / clipProfileToFov semantics ===== */
{
  // sky-mode pano, painted band rows (alt 20..40) over mask cols 100..500
  const p = mk({ fov: 360, azOffset: 0, altBottom: 0, altTop: 90 });
  p.strokes = [];
  for (let x = 100; x <= 500; x += 10) {
    for (let alt = 20; alt <= 40; alt += 4) {
      const y = H.rowOfAlt(p, alt);
      p.strokes.push({ m: 'b', x, y, r: 6 });
    }
  }
  H.computeProfile(p);
  const before = p.profile.slice();
  const beforeTop = p.profileTop.slice();
  const keep = { x: 100, w: 400 };   // world az 50..250
  H.cropPano(p, keep, 720);
  const moved = W.filter((i) => p.profile[i] !== before[i] || p.profileTop[i] !== beforeTop[i]);
  const fov = p.fov, az = p.azOffset;
  const sentinelOut = moved.filter((i) => H.fovBinRel(i, az, fov) === null);
  const changedInside = moved.filter((i) => H.fovBinRel(i, az, fov) !== null);
  out(changedInside.length ? 'FINDING' : 'PROBE', {
    probe: '6-crop-preserves-world-bins', fov, az, moved: moved.length,
    changedInsideFov: changedInside.slice(0, 5), sentinelOnly: sentinelOut.length === moved.length,
  });
  // after the crop, does any az still inside the new frame change its ceiling?
  const p2 = mk({ fov: 360, azOffset: 0 });
  p2.strokes = p.strokes ? [] : [];
  void p2;
}
{
  // repeated crop is idempotent on a select-all band?
  const p = mk({ fov: 300, azOffset: 40, paintMode: 'obstacle', profile: fill(20) });
  H.cropPano(p, { x: 0, w: 720 }, 720);
  out('PROBE', { probe: '6b-select-all-crop', fov: p.fov, azOffset: p.azOffset, was: { fov: 300, azOffset: 40 } });
}

/* ===== 7. degenerate inputs ===== */
{
  const res = {};
  const empty = mk({ strokes: [] });
  empty.profile = fill(15);
  H.computeProfile(empty);
  res.noStrokesKeepsProfile = empty.profile[0] === 15;
  const noProf = mk({ strokes: [] });
  delete noProf.profile; delete noProf.profileTop;
  H.computeProfile(noProf);
  res.noStrokesFillsSentinel = noProf.profile.length === BINS && noProf.profile[0] === H.NO_BLOCK;
  const wrongLen = mk({ fov: 360, azOffset: 0, paintMode: 'obstacle' });
  wrongLen.profile = new Array(360).fill(30);
  H.normalizeProfileBins(wrongLen);
  res.wrongLenBecomes = wrongLen.profile[0];
  out('PROBE', { probe: '7-degenerate', ...res });
  out('PROBE', {
    probe: '7b-visibleSkyBands-degrade',
    nullRec: H.visibleSkyBands(null, 0, 90).length,
    emptyRec: H.visibleSkyBands({}, 0, 90).length,
    noAB: H.visibleSkyBands(mk({ altBottom: undefined, profile: fill(10), profileTop: fill(20) }))[0],
  });
}

/* ===== 8. format.js ===== */
{
  const mags = [[5, 5, 14], [5, 4.999, 14], [null, 13.5, 14], [null, 14, 14], [undefined, 14, 14], [NaN, 14, 14], [10, 10, 10], [null, 20, 14]];
  out('PROBE', { probe: '8-magVisible', rows: mags.map(([v, l, m]) => [v === undefined ? 'undef' : String(v), l, m, F.magVisible(v, l, m)]) });
}
{
  const rows = [[60, 60], [NaN, 60], [Infinity, 60], [0, 60], [-5, 60], [60, 0], [60, -3], [60, NaN], [30, 76.6]];
  out('PROBE', { probe: '8b-framePct', rows: rows.map(([a, b]) => [String(a), String(b), String(F.framePct(a, b))]) });
}
{
  const rows = ['110', '645x550', '645\u00D7550', '', 0, -5, 'abc', NaN, '1.4', ' 30 ', '110x', null, undefined, '1e999'];
  out('PROBE', { probe: '8c-fmtSize-sizeArcmin', rows: rows.map((s) => [String(s), F.fmtSize(s), String(F.sizeArcmin(s)), String(F.sizeArcmin(s) == null ? null : F.framePct(F.sizeArcmin(s), 60))]) });
}
{
  const zooms = [1, 0, 0.5, 8, 9, NaN, undefined, null, -3, '2'];
  out('PROBE', { probe: '8d-skyClampZoom', rows: zooms.map((z) => [String(z), String(F.skyClampZoom(z))]) });
  const foc = [[600, 600, null, null], [600, 600, 0, 0], [600, 600, 1e9, -1e9], [0, 0, 10, 10], [40, 40, 3, 3], [20, 600, 5, 5]];
  out('PROBE', { probe: '8e-skyClampFocus', rows: foc.map(([w, h, x, y]) => [w, h, x, y, F.skyClampFocus(w, h, x, y)]) });
}
{
  let worst = 0, bad = null, n = 0;
  for (const Wd of [600, 701, 512]) {
    for (const z of [1, 1.25, 2, 3.7, 8]) {
      for (let fx = -500; fx < 1200; fx += 173) {
        for (let fy = -500; fy < 1200; fy += 211) {
          for (const [sx, sy] of [[0, 0], [1, 599], [300, 300], [599, 1]]) {
            n++;
            const [bx, by] = F.skyScreenToBase(z, Wd, Wd, fx, fy, sx, sy);
            const m = F.skyViewMatrix(z, Wd, Wd, fx, fy);
            const rx = m.a * bx + m.e, ry = m.d * by + m.f;
            const err = Math.max(Math.abs(rx - sx), Math.abs(ry - sy));
            if (err > worst) { worst = err; bad = { Wd, z, fx, fy, sx, sy, rx, ry }; }
          }
        }
      }
    }
  }
  out('PROBE', { probe: '8f-screenToBase-viewMatrix-roundtrip', n, worstErr: worst, bad });
}
