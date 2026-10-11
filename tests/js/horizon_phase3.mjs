import assert from 'node:assert/strict';
import * as C from '../../core/horizoncalibration.js';
import * as H from '../../core/horizon.js';
import * as History from '../../core/panohistory.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const make = (fov = 360) => ({ fov, azOffset: 0, altBottom: 0, altTop: 60,
  sourceRect: { x: 0, y: 0, w: 1, h: 1 }, strokes: [], profile: Array(720).fill(-90),
  profileTop: Array(720).fill(-90), paintMode: 'obstacle', calibration: C.normalizePhotoCalibration(null) });
for (const [fov, offset] of [[360, 350], [80, 265]]) {
  const p = make(fov), e = p.calibration;
  e.projection = 'equirectangular'; e.coverage = fov;
  e.bearing = { ...C.photoPoint(p, .25, .4), azimuth: (offset + fov * .25) % 360 };
  p.azOffset = C.alignPhotoBearing(p, e.bearing); near(p.azOffset, offset);
  e.vertical = [{ ...C.photoPoint(p, .2, .75), altitude: 0 }, { ...C.photoPoint(p, .8, .25), altitude: 30 }];
  Object.assign(p, C.fitPhotoVertical(p, e.vertical)); near(p.altTop, 45); near(p.altBottom, -15);
  e.check = { ...C.photoPoint(p, .6, .5), azimuth: (offset + fov * .6) % 360, altitude: 15 };
  assert.equal(C.photoCalibrationReport(p).status, 'checked');
  const history = History.newHistory(p);
  p.azOffset += .1; History.historyCommit(history, p);
  assert.equal(C.photoCalibrationReport(p).status, 'approximate', 'manual adjustment invalidates exact reference fit');
  History.historyUndo(history, p); assert.equal(C.photoCalibrationReport(p).status, 'checked');
  p.calibration.check.azimuth += 5;
  assert.equal(C.photoCalibrationReport(p).status, 'approximate'); near(C.photoCalibrationReport(p).azimuthError, -5);
  History.applySnapshot(p, history.baseline);
  p.calibration.projection = 'other'; assert.equal(C.photoCalibrationReport(p).status, 'approximate');
  History.applySnapshot(p, history.baseline);
  p.calibration.check.x = p.calibration.bearing.x;
  assert.equal(C.photoCalibrationReport(p).independent, false, 'a same-column check cannot validate horizontal scale');
  History.applySnapshot(p, history.baseline);
  H.cropPano(p, { x: 72, w: 576 }, 720); History.historyCommit(history, p);
  assert.equal(C.photoCalibrationReport(p).status, 'checked', 'crop preserves angular fit and independent evidence');
  near(C.photoPointAngles(p, p.calibration.bearing).azimuth, e.bearing.azimuth);
  const deep = History.snapshot(p); p.calibration.vertical[0].altitude = 10;
  History.applySnapshot(p, deep); near(p.calibration.vertical[0].altitude, 0);
  H.cropPano(p, { x: 270, w: 360 }, 720);
  assert.equal(C.photoCalibrationReport(p).status, 'approximate', 'removed references cannot claim checked current view');
  assert.equal(p.calibration.bearing.x, .25, 'original source reference retained');
}
const p = make(90);
assert.equal(C.photoCalibrationReport(p).status, 'assumed');
near(C.alignPhotoBearing(p, { x: .5, y: .5, azimuth: 10 }), 325);
for (const refs of [
  [{ x: .1, y: .5, altitude: 0 }, { x: .8, y: .5, altitude: 30 }],
  [{ x: .1, y: .75, altitude: 30 }, { x: .8, y: .25, altitude: 0 }],
  [{ x: .1, y: .75, altitude: 0 }, { x: .8, y: .25, altitude: 90 }],
  [{ x: .1, y: .75, altitude: 0 }, { x: .8, y: .25, altitude: 1 }],
]) assert.throws(() => C.fitPhotoVertical(p, refs));
const empty = C.normalizePhotoCalibration(null);
for (const bad of [{ version: 2 }, { ...empty, projection: 'cylindrical' },
  { ...empty, bearing: { x: 2, y: .5, azimuth: 10 } }, { ...empty, coverage: Infinity },
  { ...empty, vertical: [{ x: 0, y: 0, altitude: 0 }] }, { ...empty, check: { x: .5, y: .5, azimuth: 10, altitude: NaN } }]) {
  assert.throws(() => C.normalizePhotoCalibration(bad, true));
  assert.deepEqual(C.normalizePhotoCalibration(bad), empty);
}
console.log('Phase 3 calibration, crop, history and trust contracts passed');
