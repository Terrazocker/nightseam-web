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
// Near the point limit a new line is thinned to the room left: before, the
// result was cut at MAX_POINTS by azimuth, deleting points far from the edit.
const full = H.normalizePoints(Array.from({ length: 1430 }, (_, i) => ({ az: i * 0.25, alt: 5 + (i % 7) })));
const fine = Array.from({ length: 41 }, (_, i) => ({ az: 100 + i * 0.05, alt: 20 + (i % 3) }));
const nearCap = H.replacePointsInRange(full, fine);
assert.ok(nearCap.length <= H.MAX_POINTS, 'the limit holds');
assert.deepEqual(nearCap.filter((p) => p.az < 100 || p.az > 102), full.filter((p) => p.az < 100 || p.az > 102),
  'every point outside the edited span is kept');
assert.ok(nearCap.some((p) => p.az === 100) && nearCap.some((p) => p.az === 102), 'the thinned line keeps its ends');
const tooMany = H.normalizePoints(Array.from({ length: 2000 }, (_, i) => ({ az: i * 0.18, alt: 5 + (i % 5) })));
assert.ok(tooMany.length <= H.MAX_POINTS && tooMany[0].az === 0 && tooMany.at(-1).az === 359.82,
  'more points than the limit are thinned evenly, both ends kept');
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

// The quaternion path (Generic Sensor API) agrees with the Euler path: build
// q = qz(alpha) qx(beta) qy(gamma), the same Z-X'-Y'' rotation.
const qmul = (p, q) => [
  p[3] * q[0] + p[0] * q[3] + p[1] * q[2] - p[2] * q[1],
  p[3] * q[1] - p[0] * q[2] + p[1] * q[3] + p[2] * q[0],
  p[3] * q[2] + p[0] * q[1] - p[1] * q[0] + p[2] * q[3],
  p[3] * q[3] - p[0] * q[0] - p[1] * q[1] - p[2] * q[2]];
const axisQ = (axis, deg) => { const h = deg * Math.PI / 360, q = [0, 0, 0, Math.cos(h)]; q[axis] = Math.sin(h); return q; };
const eulerQ = (a, b, g) => qmul(qmul(axisQ(2, a), axisQ(0, b)), axisQ(1, g));
near2(H.quaternionPointing([0, 0, 0, 1]).alt, -90, 'the identity quaternion is a phone flat on a table');
near2(H.quaternionPointing(axisQ(0, 90)).az, 0, 'upright, facing north');
near2(H.quaternionPointing(qmul(axisQ(2, -90), axisQ(0, 90))).az, 90, 'turned clockwise, facing east');
for (const [a, b, g] of [[0, 90, 0], [37, 95, -12], [200, 70, 30], [300, 110, 5], [123, 89, -40]]) {
  const fromQ = H.quaternionPointing(eulerQ(a, b, g)), fromE = H.devicePointing(a, b, g);
  close(Math.abs(H.azDelta(fromQ.az, fromE.az)), 0, 1e-9, `quaternion and Euler azimuth agree at ${a}/${b}/${g}`);
  close(fromQ.alt, fromE.alt, 1e-9, `and altitude at ${a}/${b}/${g}`);
}

for (const [a, b, g] of [[0, 90, 0], [37, 95, -12], [200, 70, 30], [300, 110, 5]]) {
  const viaQ = H.quaternionPointing(H.orientationQuaternion(a, b, g)), viaE = H.devicePointing(a, b, g);
  close(Math.abs(H.azDelta(viaQ.az, viaE.az)), 0, 1e-9, `orientationQuaternion matches devicePointing at ${a}/${b}/${g}`);
  close(viaQ.alt, viaE.alt, 1e-9);
}

// --- the camera view (AR overlay) ---------------------------------------------
const facingNorth = axisQ(0, 90);
const ahead = H.cameraProject(facingNorth, 0, 0, 0);
close(Math.hypot(ahead.x, ahead.y), 0, 1e-12, 'what the camera faces is at the crosshair');
close(H.cameraProject(facingNorth, 0, 10, 0).x, Math.tan(10 * Math.PI / 180), 1e-12, 'east of the axis is right of the crosshair');
close(H.cameraProject(facingNorth, 0, 0, 10).y, Math.tan(10 * Math.PI / 180), 1e-12, 'above the axis is up');
assert.equal(H.cameraProject(facingNorth, 0, 180, 0), null, 'behind the phone is not drawn');
assert.equal(H.cameraProject(facingNorth, 0, 85, 0), null, 'far off the axis is not drawn');
close(H.cameraProject(facingNorth, 30, 30, 0).x, 0, 1e-12, 'the north offset turns the view');
// Upright, then turned +90 deg about the device z axis (counter-clockwise as
// seen from the screen): the right edge now points up, so "up" is +x.
const rolled = qmul(axisQ(0, 90), axisQ(2, 90));
close(H.cameraProject(rolled, 0, 0, 10).x, Math.tan(10 * Math.PI / 180), 1e-12, 'a phone held sideways shows up towards its raised edge');
for (const [a, b, g, off] of [[37, 95, -12, 0], [200, 70, 30, 14], [300, 110, 5, -40]]) {
  const q = H.orientationQuaternion(a, b, g), p = H.quaternionPointing(q);
  const at = H.cameraProject(q, off, p.az + off, p.alt);
  close(Math.hypot(at.x, at.y), 0, 1e-9, `the pointed-at direction projects to the centre at ${a}/${b}/${g}`);
}

// --- compass offset and sweeps ------------------------------------------------
assert.equal(H.circularMean([]), null);
close(Math.abs(H.azDelta(H.circularMean([350, 10]).mean, 0)), 0, 1e-9, 'the mean of 350 and 10 is north, not 180');
assert.ok(H.circularMean([350, 10]).spread > 9.9 && H.circularMean([350, 10]).spread < 10.2, 'their spread is about 10 deg');
close(H.circularMean([42, 42, 42]).spread, 0, 1e-6, 'identical readings have no spread');
assert.equal(H.circularMean([0, 180]).spread, 180, 'opposite readings say nothing about north');

const across = H.sweepLine([{ az: 350, alt: 5 }, { az: 355, alt: 9 }, { az: 0, alt: 6 }, { az: 5, alt: 10 }, { az: 10, alt: 7 }], 0);
assert.deepEqual(across.map((p) => p.az), [350, 355, 360, 365, 370], 'a sweep across north keeps running past 360');
assert.equal(H.sweepLine([{ az: 10, alt: 5 }, { az: 0, alt: 5 }], 0)[0].az, 0, 'a westward sweep comes out sorted');
const redone = H.sweepLine([...Array.from({ length: 11 }, (_, i) => ({ az: i, alt: 5 })),
  ...Array.from({ length: 6 }, (_, i) => ({ az: 10 - i, alt: 9 }))], 0);
assert.ok(redone.filter((p) => p.az >= 5).every((p) => p.alt === 9) && redone.filter((p) => p.az < 5).every((p) => p.alt === 5),
  `going back over a stretch redraws it: ${JSON.stringify(redone)}`);
assert.deepEqual(H.sweepLine([{ az: 10, alt: 5 }, { az: 10.2, alt: 6 }]), [], 'a sweep narrower than 0.5 deg is no line');
assert.deepEqual(H.sweepLine([{ az: 10, alt: 5 }]), []);
assert.equal(H.sweepLine([{ az: 1, alt: -40 }, { az: 9, alt: 120 }], 0)[1].alt, 90, 'altitudes are clamped');
const turn = H.sweepLine(Array.from({ length: 73 }, (_, i) => ({ az: (100 + i * 5) % 360, alt: 3 })));
assert.ok(turn.every((p, i) => !i || p.az - turn[i - 1].az <= 90), 'a flat sweep keeps steps of at most 90 deg');
const turned = H.replacePointsInRange(H.normalizePoints([{ az: 50, alt: 40 }, { az: 200, alt: 40 }]), turn);
assert.ok(turned.every((p) => p.alt === 3), 'a full turn replaces the whole skyline');
const eave = H.splitAtNorth(H.sweepLine([{ az: 340, alt: 50 }, { az: 0, alt: 52 }, { az: 20, alt: 54 }], 0));
assert.equal(eave.length, 2, 'an overhang swept across north becomes two edges');

// --- camera motion against the gyroscope (overlay calibration) -------------------
{
  const yRot = (rad) => [0, Math.sin(rad / 2), 0, Math.cos(rad / 2)];
  const w = H.angularVelocity([0, 0, 0, 1], yRot(0.1), 0.05);
  close(w[1], 2, 1e-9, 'a 0.1 rad turn about y in 50 ms is 2 rad/s');
  close(Math.hypot(w[0], w[2]), 0, 1e-12, 'and nothing about x or z');
  assert.deepEqual(H.angularVelocity([0, 0, 0, 1], yRot(0.1), 0), [0, 0, 0]);
  // Display smoothing: 1 s of turning at 2 rad/s, read at 60 Hz, one reading
  // stored with the opposite sign (the same orientation).
  const hist = Array.from({ length: 61 }, (_, i) => ({ t: i * 1000 / 60, q: yRot(0.002 * i * 1000 / 60) }));
  hist[30].q = hist[30].q.map((v) => -v);
  const angleOf = (q) => 2 * Math.atan2(q[1], q[3]);
  close(angleOf(H.smoothOrientation(hist, 500, 60)), 1, 1e-4, 'a centred average of a steady turn is where it is now');
  // A camera only 10 ms behind: the window narrows to 10 ms either side
  // instead of averaging 60 ms of the past (which would read 25 ms late); the
  // readings in it are off centre by at most half a reading interval.
  const late = H.smoothOrientation(hist, 990, 60);
  close(angleOf(late), 1.98, 0.002 * 500 / 60, 'near the newest reading the window narrows and stays centred');
  assert.equal(H.smoothOrientation(hist, 1000, 60), null, 'at the newest reading there is nothing after it to centre on');
  assert.equal(H.smoothOrientation(hist, 1200, 60), null);
  assert.equal(H.smoothOrientation(hist.slice(0, 1), 0, 60), null);
  assert.equal(H.smoothOrientation(hist, 500, 0), null);
  // 8 s of panning: the gyroscope at 60 Hz, the image analysed at 28 frames a
  // second, moving 165.5 px per radian and 200 ms behind the gyroscope (the
  // Pixel 7a's measured values).
  const omega = (t) => 1.2 * Math.sin(t / 700) + 0.6 * Math.sin(t / 233 + 1) + 0.3 * Math.sin(t / 97);
  const angle = (t) => { let a = 0; for (let s = 0; s < t; s += 1) a += omega(s) / 1000; return a; };
  const rates = Array.from({ length: 480 }, (_, i) => ({ t: i * 1000 / 60, w: omega(i * 1000 / 60) }));
  const shifts = [];
  for (let t0 = 300; t0 + 36 < 8000; t0 += 1000 / 28) {
    const t1 = t0 + 1000 / 28;
    shifts.push({ t0, t1, d: 165.5 * (angle(t1 - 200) - angle(t0 - 200)) });
  }
  const m = H.matchMotion(rates, shifts);
  assert.ok(Math.abs(m.lagMs - 200) <= 10, `the image's delay is found: ${m.lagMs} ms`);
  assert.ok(Math.abs(m.slope - 165.5) / 165.5 < 0.03, `and its scale: ${m.slope} px/rad`);
  assert.ok(m.corr > 0.98, `with a clear match: ${m.corr}`);
  assert.equal(H.matchMotion(rates, []), null, 'no image motion, no match');
  assert.equal(H.matchMotion([], shifts), null, 'no gyroscope, no match');

  // The worker times each pair of frames by the camera's capture timestamps
  // (web/capturemotion.js): frames reach it unevenly, here 15 ms after
  // capture give or take 6 ms, and a short arrival gap read as fast motion
  // made the scale come out too large.
  const { captureGap } = await import('../../web/capturemotion.js');
  assert.equal(captureGap(1_000_000, 1_033_000, 20), 33, 'capture timestamps are microseconds');
  assert.equal(captureGap(NaN, 1_033_000, 20), 20, 'no timestamp: the arrival gap');
  assert.equal(captureGap(1_033_000, 1_033_000, 20), 20, 'a repeated timestamp: the arrival gap');
  assert.equal(captureGap(0, 5_000_000, 20), 20, 'a gap of seconds is not trusted');
  let seed = 7;
  const jitter = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 12; };
  const frames = [];
  for (let t = 300; t < 8000; t += 1000 / 28) frames.push({ cap: t, at: t + 15 + jitter() });
  const timed = (gap) => frames.slice(1).map((f, i) => {
    const prev = frames[i];
    return { t0: f.at - gap(prev, f), t1: f.at, d: 165.5 * (angle(f.cap - 200) - angle(prev.cap - 200)) };
  });
  const byCapture = H.matchMotion(rates, timed((p, f) => captureGap(p.cap * 1000, f.cap * 1000, f.at - p.at)));
  const byArrival = H.matchMotion(rates, timed((p, f) => f.at - p.at));
  const err = (x) => Math.abs(x.slope - 165.5) / 165.5;
  assert.ok(err(byCapture) < 0.03, `timed by capture, the scale holds: ${byCapture.slope} px/rad`);
  assert.ok(Math.abs(byCapture.lagMs - 215) <= 10, `and the delay includes the arrival: ${byCapture.lagMs} ms`);
  assert.ok(err(byArrival) > err(byCapture), `timed by arrival it was further off: ${byArrival.slope} px/rad`);
}

// --- north references and loop closure ------------------------------------------
{
  const jd = 2440587.5 + Date.UTC(2026, 9, 15, 20) / 86400000;
  const [malt, maz] = (await import('../../core/astro.js')).moonAltAz(jd, 52.52, 13.4);
  const moon = H.moonDirection(jd, 52.52, 13.4);
  close(moon.alt, malt, 1e-12, 'moonDirection is the apparent topocentric Moon');
  close(moon.az, ((maz % 360) + 360) % 360, 1e-9);
}
assert.deepEqual(H.referenceUsable({ az: 100, alt: 20 }), { ok: true, why: '' });
assert.equal(H.referenceUsable({ az: 100, alt: 1 }).why, 'below', 'a body on the horizon line is not used');
assert.equal(H.referenceUsable({ az: 100, alt: 65 }).why, 'high', 'nor one high overhead, where azimuth means little');
assert.equal(H.referenceUsable(null).ok, false);
const ref = H.referenceOffset({ az: 350, alt: 21.4 }, { az: 20, alt: 21 });
close(ref.offset, 30, 1e-9, 'north turns the relative 350 into the true 20');
close(ref.altError, 0.4, 1e-9, 'the aim reads 0.4 deg high');

// A full turn whose gyroscope runs 2% fast: it reads 367.2 deg for 360.
const truth = Array.from({ length: 73 }, (_, i) => ({ az: (10 + i * 5) % 360, alt: 5 + 3 * Math.sin(i / 7) }));
const drifted = truth.map((p, i) => ({ az: (10 + i * 5 * 1.02) % 360, alt: p.alt }));
const closed = H.closeLoop(drifted);
close(closed.error, 7.2, 1e-9, 'the closing error is the drift');
closed.samples.forEach((p, i) => close(Math.abs(H.azDelta(p.az, truth[i].az)), 0, 1e-9, `sample ${i} is back where it belongs`));
const westward = H.closeLoop(drifted.map((p) => ({ az: (720 - p.az) % 360, alt: p.alt })));
close(westward.error, -7.2, 1e-9, 'an anticlockwise turn closes too');
assert.equal(H.closeLoop(truth.slice(0, 40)), null, 'half a turn is no loop');
assert.equal(H.closeLoop([{ az: 0, alt: 0 }]), null);
close(H.siteDistanceM(52, 13, 53, 13) / 1000, 111.2, 0.1, 'one degree of latitude is about 111 km');
close(H.siteDistanceM(52.5, 13.4, 52.5, 13.4), 0, 1e-9);

// --- share links ---------------------------------------------------------------
const shared = { name: '  Garten am Hang — Süd ', points: H.normalizePoints([{ az: 0, alt: 10 }, { az: 12.34, alt: -3.21 }, { az: 359.99, alt: 89.99 }]),
  overhangs: [[{ az: 100, alt: 40 }, { az: 110.5, alt: 35.25 }], [{ az: 350, alt: 60 }, { az: 360, alt: 60 }]] };
const code = H.encodeHorizonLink(shared);
assert.match(code, /^[A-Za-z0-9_-]+$/, 'link text is URL-safe');
assert.deepEqual(H.decodeHorizonLink(code), { name: 'Garten am Hang — Süd', points: shared.points, overhangs: shared.overhangs },
  'a link gives back exactly the same skyline, overhangs and name');
assert.deepEqual(H.decodeHorizonLink(H.encodeHorizonLink({ name: '', points: [] })), { name: 'Horizon', points: [], overhangs: [] });
const dense360 = H.normalizePoints(Array.from({ length: 720 }, (_, i) => ({ az: i / 2, alt: 10 + 8 * Math.sin(i / 17) })));
const denseCode = H.encodeHorizonLink({ name: 'Dense', points: dense360 });
assert.deepEqual(H.decodeHorizonLink(denseCode).points, dense360, 'a dense skyline survives');
assert.ok(denseCode.length < 4000, `a 720-point skyline stays a usable link: ${denseCode.length} characters`);
for (const [bad, why] of [
  ['', 'empty'], ['abc$', 'not URL-safe base64'], [code.slice(0, -3), 'truncated'], [code + 'AAAA', 'trailing data'],
  ['Ag', 'a newer version'], ['x'.repeat(H.LINK_MAX_CHARS + 1), 'too long'],
  [H.encodeHorizonLink({ points: [] }).replace(/^./, 'B'), 'a changed version byte'],
]) assert.throws(() => H.decodeHorizonLink(bad), Error, `${why} is refused`);
// out-of-range values in an otherwise well-formed link
const varint = (v) => { const out = []; do { let b = v & 127; v = Math.floor(v / 128); if (v) b |= 128; out.push(b); } while (v); return out; };
const zz = (v) => varint(v >= 0 ? v * 2 : -v * 2 - 1);
const raw = (bytes) => Buffer.from(bytes).toString('base64url');
const onePoint = (az, alt) => raw([1, 0, 1, ...zz(az), ...zz(alt), 0]);
assert.deepEqual(H.decodeHorizonLink(onePoint(12345, 678)).points, [{ az: 123.45, alt: 6.78 }], 'the hand-built form reads');
assert.throws(() => H.decodeHorizonLink(onePoint(36500, 0)), /damaged/, 'an azimuth past 360 is refused');
assert.throws(() => H.decodeHorizonLink(onePoint(100, 9500)), /damaged/, 'an altitude past 90 is refused');
assert.throws(() => H.decodeHorizonLink(raw([1, 0, 0, 21])), /more overhangs/, 'too many overhangs are refused');
assert.throws(() => H.decodeHorizonLink(raw([1, 0, ...varint(H.MAX_POINTS + 1)])), /more points/, 'too many points are refused');
const emoji = 'a'.repeat(H.NAME_MAX - 1) + '\u{1F332}';   // the cut falls inside the emoji
assert.equal(H.normalizeHorizon({ id: 'e1', name: emoji }).name, 'a'.repeat(H.NAME_MAX - 1), 'a name is never cut inside a character');
assert.equal(H.decodeHorizonLink(H.encodeHorizonLink({ name: emoji, points: [] })).name, 'a'.repeat(H.NAME_MAX - 1));
const jag = (n, a0, a1) => Array.from({ length: n }, (_, i) => ({ az: a0 + (a1 - a0) * i / (n - 1), alt: 30 + ((i * 37) % 500) / 10 }));
const huge = { points: [], overhangs: H.normalizeOverhangs(Array.from({ length: H.MAX_OVERHANGS }, (_, k) => jag(H.MAX_POINTS, k * 18, k * 18 + 17.9))) };
assert.throws(() => H.encodeHorizonLink(huge), /too large for a link/, 'no link is made that the reader would refuse');

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
// A noisy treeline every 0.1 deg cannot be simplified under the limit at a
// fixed tolerance; it used to keep only 0-144 deg. Thinning keeps the circle.
let seed = 7;
const noise = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const treeline = H.parseHorizonFile(Array.from({ length: 3600 }, (_, i) => `${(i / 10).toFixed(1)} ${(8 + noise() * 12).toFixed(2)}`).join('\n'));
assert.ok(treeline.points.length <= H.MAX_POINTS, 'the limit holds');
assert.equal(treeline.points[0].az, 0);
assert.equal(treeline.points.at(-1).az, 359.9, 'the whole circle survives');
assert.equal(treeline.thinned, 3600 - treeline.points.length, 'the reader says how many points were thinned');
assert.equal(H.parseHorizonFile('0 10\n90 20\n').thinned, 0);
// Decimal commas where spaces, tabs or semicolons separate the fields
assert.deepEqual(H.parseHorizonFile('0;10\n90;20,5\n180,25\t5,5\n270 7,25\n').points,
  [{ az: 0, alt: 10 }, { az: 90, alt: 20.5 }, { az: 180.25, alt: 5.5 }, { az: 270, alt: 7.25 }],
  'a decimal comma is read as a decimal, not as a field separator');
assert.deepEqual(H.parseHorizonFile('0,10\n90, 20\n').points, [{ az: 0, alt: 10 }, { az: 90, alt: 20 }],
  'a comma alone still separates the fields');

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
