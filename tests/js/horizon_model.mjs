// Contracts for the skyline horizon model in core/horizon.js and the editor
// history in core/horizonhistory.js.
import assert from 'node:assert/strict';
import * as H from '../../core/horizon.js';
import * as Hist from '../../core/horizonhistory.js';
import { panoramaVisibilityReason } from '../../core/visibility.js';

const close = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} != ${b}`);

// --- points ---------------------------------------------------------------
assert.deepEqual(H.normalizePoints(null), []);
assert.deepEqual(H.normalizePoints([{ az: 370, alt: 5 }, { az: -10, alt: 100 }, { az: 'x', alt: 1 }]),
  [{ az: 10, alt: 5 }, { az: 350, alt: 90 }], 'wrap, clamp, drop malformed, sort');
assert.deepEqual(H.normalizePoints([{ az: 360, alt: 3 }]), [{ az: 0, alt: 3 }], '360 is north');
assert.deepEqual(H.normalizePoints([{ az: 20, alt: 1 }, { az: 20.001, alt: 7 }]), [{ az: 20, alt: 7 }],
  'one point per rounded azimuth, the later one wins');
assert.deepEqual(H.normalizePoints([{ az: 1, alt: -40 }]), [{ az: 1, alt: H.ALT_MIN }]);
assert.throws(() => H.normalizePoints([{ az: 1 }], true));
assert.throws(() => H.normalizePoints('nope', true));
assert.throws(() => H.normalizePoints(new Array(H.MAX_POINTS + 1).fill({ az: 1, alt: 1 }), true));

// --- interpolation and profile ---------------------------------------------
assert.equal(H.skylineAltAt([], 10), H.NO_BLOCK, 'no points blocks nothing');
assert.equal(H.skylineAltAt([{ az: 90, alt: 12 }], 270), 12, 'one point is a flat skyline');
const pts = H.normalizePoints([{ az: 0, alt: 10 }, { az: 90, alt: 30 }, { az: 180, alt: 10 }]);
close(H.skylineAltAt(pts, 45), 20);
close(H.skylineAltAt(pts, 90), 30);
close(H.skylineAltAt(pts, 270), 10, 1e-9, 'wraps from 180 back to 0');
const wrapPts = H.normalizePoints([{ az: 350, alt: 0 }, { az: 10, alt: 20 }]);
close(H.skylineAltAt(wrapPts, 0), 10, 1e-9, 'interpolates across north');
close(H.skylineAltAt(wrapPts, 180), 10, 1e-9, 'and the long way round');

const prof = H.skylineProfile(pts);
assert.equal(prof.length, H.BINS);
assert.equal(prof[180], 30, 'bin 180 (90.0-90.5 deg) holds the peak');
assert.equal(prof[179], 30, 'the bin ending at the peak holds it too');
const spike = H.skylineProfile(H.normalizePoints([{ az: 0, alt: 0 }, { az: 45.27, alt: 40 }, { az: 45.3, alt: 0 }]));
assert.equal(spike[90], 40, 'a narrow spike between bin edges is kept');
assert.ok(H.skylineProfile([]).every((v) => v === H.NO_BLOCK));

// --- ceiling and visibility -------------------------------------------------
const h = H.withProfile({ id: 'h1', points: pts });
assert.deepEqual(H.ceilFor(h, 90.2), { ceil: 30, ceilTop: null });
assert.deepEqual(H.ceilFor(h, 450.2), { ceil: 30, ceilTop: null }, 'azimuth wraps');
assert.deepEqual(H.ceilFor(null, 10), { ceil: H.NO_BLOCK, ceilTop: null });
assert.deepEqual(H.ceilFor({ profile: [1, 2] }, 10), { ceil: H.NO_BLOCK, ceilTop: null }, 'short profile blocks nothing');
assert.deepEqual(H.ceilFor({ profile: new Array(720).fill('10') }, 10), { ceil: H.NO_BLOCK, ceilTop: null },
  'a non-number element is nothing recorded');
assert.equal(panoramaVisibilityReason(h, 25, 90, 5), 'blocked_by_horizon');
assert.equal(panoramaVisibilityReason(h, 35, 90, 5), 'visible');
assert.equal(panoramaVisibilityReason(h, 15, 270, 20), 'below_minimum_altitude');
assert.equal(H.hasSkyline(h), true);
assert.equal(H.hasSkyline({ points: [] }), false);

// --- record normalization ---------------------------------------------------
assert.equal(H.normalizeHorizon({ id: 'bad id' }), null);
assert.throws(() => H.normalizeHorizon({ id: '<x>' }, true));
assert.deepEqual(H.normalizeHorizon({ id: 'a1', name: '  Garden  ', points: [{ az: 5, alt: 2 }] }),
  { id: 'a1', name: 'Garden', points: [{ az: 5, alt: 2 }], overhangs: [] });
assert.equal(H.normalizeHorizon({ id: 'a1', name: 'x'.repeat(200) }).name.length, H.NAME_MAX);
// Records and backups of builds that placed photos: the photo fields are
// dropped, even malformed ones in strict mode; the skyline and overhangs stay.
const legacy = { id: 'a2', name: 'Old', points: [{ az: 5, alt: 2 }], overhangs: [[{ az: 10, alt: 40 }, { az: 20, alt: 40 }]],
  photo: { width: 0, heading: 'x', tilt: 400 }, hasPhoto: true, image: 'data:image/jpeg;base64,AAAA' };
for (const strict of [false, true]) {
  assert.deepEqual(H.normalizeHorizon(legacy, strict),
    { id: 'a2', name: 'Old', points: [{ az: 5, alt: 2 }], overhangs: [[{ az: 10, alt: 40 }, { az: 20, alt: 40 }]] },
    `photo fields of older builds are dropped (strict=${strict})`);
}

// --- overhangs -------------------------------------------------------------
assert.equal(H.normalizeOverhang([{ az: 10, alt: 50 }]), null, 'one point is not an edge');
assert.throws(() => H.normalizeOverhang([{ az: 10, alt: 50 }], true));
assert.throws(() => H.normalizeOverhang([{ az: -5, alt: 50 }, { az: 10, alt: 40 }], true), 'edges never cross north');
assert.deepEqual(H.normalizeOverhang([{ az: 40, alt: 50 }, { az: 360, alt: 95 }, { az: 'x', alt: 1 }]),
  [{ az: 40, alt: 50 }, { az: 360, alt: 90 }], 'sorted, clamped, 360 allowed as an end');
assert.throws(() => H.normalizeOverhangs(new Array(H.MAX_OVERHANGS + 1).fill([{ az: 1, alt: 1 }, { az: 2, alt: 1 }]), true));
const edge = [{ az: 100, alt: 40 }, { az: 110, alt: 30 }, { az: 120, alt: 40 }];
close(H.overhangAltAt(edge, 105), 35);
assert.equal(H.overhangAltAt(edge, 99), null, 'nothing overhead outside the span');
const tops = H.overhangProfile([edge]);
assert.equal(tops[199], H.OPEN_TOP, 'the bin before the edge is open');
assert.equal(tops[200], 39.5, 'bin 100.0-100.5 holds its lowest edge altitude');
assert.equal(tops[220], 30, 'the low point of the edge is kept');
assert.equal(tops[239], 39.5);
assert.equal(tops[240], H.OPEN_TOP, 'an edge ending on a bin boundary does not reach the next bin');
assert.equal(H.overhangProfile([edge, [{ az: 105, alt: 20 }, { az: 106, alt: 20 }]])[210], 20, 'the lowest overhang wins');
const roofed = H.withProfile(H.normalizeHorizon({ id: 'r1', points: [{ az: 0, alt: 10 }], overhangs: [edge] }));
assert.deepEqual(H.ceilFor(roofed, 110.2), { ceil: 10, ceilTop: 30 });
assert.deepEqual(H.ceilFor(roofed, 200), { ceil: 10, ceilTop: null });
assert.equal(panoramaVisibilityReason(roofed, 20, 110.2, 5), 'visible', 'sky under the overhang is usable');
assert.equal(panoramaVisibilityReason(roofed, 35, 110.2, 5), 'blocked_by_horizon', 'sky above the overhang edge is blocked');
assert.equal(H.hasSkyline({ points: [], overhangs: [edge] }), true);
assert.deepEqual(H.splitAtNorth([{ az: 350, alt: 40 }, { az: 370, alt: 60 }]),
  [[{ az: 0, alt: 50 }, { az: 10, alt: 60 }], [{ az: 350, alt: 40 }, { az: 360, alt: 50 }]],
  'an edge across north becomes two edges meeting at north');
assert.deepEqual(H.flatOverhang(350, 10, 45), [[{ az: 0, alt: 45 }, { az: 10, alt: 45 }], [{ az: 350, alt: 45 }, { az: 360, alt: 45 }]]);
assert.deepEqual(H.flatOverhang(20, 80, 45), [[{ az: 20, alt: 45 }, { az: 80, alt: 45 }]]);
const replaced = H.replaceOverhangsInRange([edge], [{ az: 108, alt: 70 }, { az: 112, alt: 70 }]);
assert.deepEqual(replaced, [
  [{ az: 100, alt: 40 }, { az: 108, alt: 32 }],
  [{ az: 108, alt: 70 }, { az: 112, alt: 70 }],
  [{ az: 112, alt: 32 }, { az: 120, alt: 40 }],
], 'a new edge cuts the old one and keeps both outer parts');
const fullSet = Array.from({ length: H.MAX_OVERHANGS }, (_, i) => [{ az: i * 10, alt: 50 }, { az: i * 10 + 5, alt: 50 }]);
const crowded = H.replaceOverhangsInRange(fullSet, [{ az: 300, alt: 60 }, { az: 305, alt: 60 }]);
assert.equal(crowded.length, H.MAX_OVERHANGS, 'the limit holds');
assert.ok(crowded.some((l) => l[0].az === 300), 'the new edge is never the one dropped');
assert.ok(H.formatHorizonFile({ points: [], overhangs: [edge] }).includes('overhangs are not'), 'the file says overhangs are left out');

// --- sketch replacement and simplification ---------------------------------
const base = H.normalizePoints([{ az: 10, alt: 5 }, { az: 50, alt: 5 }, { az: 100, alt: 5 }]);
assert.deepEqual(H.replacePointsInRange(base, [{ az: 60, alt: 20 }, { az: 40, alt: 10 }]),
  [{ az: 10, alt: 5 }, { az: 40, alt: 10 }, { az: 60, alt: 20 }, { az: 100, alt: 5 }],
  'a sketch replaces exactly the points inside its azimuth span, either direction');
assert.deepEqual(H.replacePointsInRange(base, []), base);
const ring = H.normalizePoints([{ az: 5, alt: 1 }, { az: 180, alt: 1 }, { az: 355, alt: 1 }]);
assert.deepEqual(H.replacePointsInRange(ring, [{ az: 340, alt: 9 }, { az: 20, alt: 9 }]),
  [{ az: 20, alt: 9 }, { az: 180, alt: 1 }, { az: 340, alt: 9 }],
  'a line crossing north replaces only the points it spans');
assert.deepEqual(H.replacePointsInRange(ring, Array.from({ length: 37 }, (_, i) => ({ az: i * 10, alt: 2 }))).length, 36,
  'a full-circle line replaces everything');
const line = Array.from({ length: 101 }, (_, i) => ({ az: i, alt: i < 50 ? 0 : 10 }));
const simple = H.simplifyLine(line, 0.25);
assert.ok(simple.length <= 5, `step simplifies to its corners, got ${simple.length}`);
assert.deepEqual(simple[0], line[0]);
assert.deepEqual(simple[simple.length - 1], line[100]);

// --- the Sun's direction -----------------------------------------------------
// 2026-06-21 12:00 UTC at 52.5N 13.4E: the Sun is high and a little west of south.
const noonJd = 2440587.5 + Date.UTC(2026, 5, 21, 12) / 86400000;
const sun = H.sunDirection(noonJd, 52.5, 13.4);
assert.ok(sun.az > 185 && sun.az < 215 && sun.alt > 55 && sun.alt < 62, `summer noon Sun at Berlin: ${JSON.stringify(sun)}`);
const night = H.sunDirection(2440587.5 + Date.UTC(2026, 5, 21, 23) / 86400000, 52.5, 13.4);
assert.ok(night.alt < 0, 'the Sun is below the horizon at night');

// --- phone pointing ----------------------------------------------------------
const point = (a, b, g) => H.devicePointing(a, b, g);
const near2 = (v, want, msg) => close(v, want, 1e-6, msg);
near2(point(0, 90, 0).az, 0, 'upright, facing north'); near2(point(0, 90, 0).alt, 0, 'level');
near2(point(90, 90, 0).az, 270, 'alpha grows counter-clockwise: 90 faces west');
near2(point(270, 90, 0).az, 90, '270 faces east');
near2(point(0, 100, 0).alt, 10, 'tilting the top back raises the camera');
near2(point(0, 0, 0).alt, -90, 'flat on a table the camera points down');
near2(point(30, 90, 20).alt, 0, 'twisting the phone about its camera axis keeps the altitude');

// --- horizon files ----------------------------------------------------------
const parsed = H.parseHorizonFile([
  '# Stellarium polygonal horizon', 'header line', '0 10', '90\t20 # comment',
  '180,15', '270;12', '360 10', '; nina comment', 'garbage 1', '45 200',
].join('\r\n'));
assert.deepEqual(parsed.points, [{ az: 0, alt: 10 }, { az: 90, alt: 20 }, { az: 180, alt: 15 }, { az: 270, alt: 12 }]);
assert.equal(parsed.skipped, 3, 'header, garbage and the out-of-range line are skipped');
assert.throws(() => H.parseHorizonFile('only words\n'), /azimuth altitude/);
const text = H.formatHorizonFile({ name: 'Back\nyard', points: parsed.points });
assert.ok(text.startsWith('# NightSeam horizon: Back yard\n'));
assert.deepEqual(H.parseHorizonFile(text).points, parsed.points, 'export reads back');
const dense = Array.from({ length: 3000 }, (_, i) => `${(i * 0.12).toFixed(2)} 5`).join('\n');
assert.ok(H.parseHorizonFile(dense).points.length <= H.MAX_POINTS, 'dense files are simplified to the cap');

// --- history ----------------------------------------------------------------
const rec = { points: [{ az: 1, alt: 2 }], overhangs: [] };
const hist = Hist.newHistory(rec, 3);
assert.equal(Hist.historyDirty(hist, rec), false);
assert.equal(Hist.historyCommit(hist, rec), false, 'no change, no entry');
rec.points = [...rec.points, { az: 5, alt: 6 }];
assert.equal(Hist.historyCommit(hist, rec), true);
assert.equal(Hist.historyDirty(hist, rec), true);
rec.points = [...rec.points, { az: 7, alt: 8 }];
Hist.historyCommit(hist, rec);
Hist.historyUndo(hist, rec);
assert.equal(rec.points.length, 2);
assert.deepEqual(Object.keys(JSON.parse(Hist.snapshot({ ...rec, photo: { width: 60 } }))).sort(), ['o', 'p'],
  'the history holds points and overhangs only');
Hist.historyUndo(hist, rec);
assert.equal(Hist.historyDirty(hist, rec), false, 'undo back to the baseline is clean');
Hist.historyRedo(hist, rec);
Hist.historyMarkSaved(hist, rec);
assert.equal(Hist.historyDirty(hist, rec), false);
rec.points[0].alt = 9;
assert.equal(Hist.historyDirty(hist, rec), true, 'snapshots never alias the record');
Hist.historyCommit(hist, rec);
rec.overhangs = [edge]; Hist.historyCommit(hist, rec);
Hist.historyUndo(hist, rec);
assert.deepEqual(rec.overhangs, [], 'overhangs are part of the history');
Hist.historyRedo(hist, rec);
assert.deepEqual(rec.overhangs, [edge]);
rec.points = []; Hist.historyCommit(hist, rec);
assert.equal(hist.entries.length, 3, 'history is bounded');
assert.equal(Hist.historyCanRedo(hist), false);

console.log('horizon model contracts held');
