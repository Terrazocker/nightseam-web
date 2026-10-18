/*
 * The capture's calibration routine (web/capture.js guideScale): the cross
 * marks a feature, the phone turns until the feature sits on a guide line a
 * known distance from the cross, and the turn the gyroscope measured gives
 * the camera's scale. On a Pixel 7a the scale read from motion grew with
 * turning speed while a still test put it at about 0.88, so the scale is
 * measured still. Prints one marker line; tests/test_js_behaviour.py
 * asserts it.
 */
import assert from 'node:assert/strict';

const { guideScale } = await import(new URL('../../web/capture.js', import.meta.url).href);

/** An upright phone whose back camera points at relative azimuth `az`,
 *  `alt` degrees up: q = qz(-az) qx(90 + alt), [x, y, z, w]. */
function phone(az, alt) {
  const hz = -az * Math.PI / 360, hx = (90 + alt) * Math.PI / 360;
  const z = Math.sin(hz), w1 = Math.cos(hz), x = Math.sin(hx), w2 = Math.cos(hx);
  return [w1 * x, z * x, z * w2, w1 * w2];
}

const shown = 789;                  // the video's long side on a 411 x 789 phone screen
const k = 0.88, f = k * shown;      // focal length in CSS pixels
const deg = Math.PI / 180;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a}`);

// Sideways: marked level at az 0, then turned right by the angle that puts
// the feature 148 px left of the cross (exact for a level phone).
const side = Math.atan(148 / f) / deg;
near(guideScale(phone(0, 0), phone(side, 0), 148, shown, 'x'), k, 'turning right onto the left line measures the scale');
near(guideScale(phone(40, 0), phone(40 + side, 0), 148, shown, 'x'), k, 'from any direction');
// Tilted 5 deg up, the same turn puts the feature a little closer to the
// cross (the turn is about the vertical, not the camera's own axis), so a
// test that assumes it is exactly on the line reads 0.4% high.
assert.ok(Math.abs(guideScale(phone(0, 5), phone(side, 5), 148, shown, 'x') - k) < 0.01, 'a slight tilt changes little');
assert.equal(guideScale(phone(0, 5), phone(-side, 5), 148, shown, 'x'), null, 'turned the wrong way');
assert.equal(guideScale(phone(0, 5), phone(0.5, 5), 148, shown, 'x'), null, 'hardly turned at all');
assert.equal(guideScale(phone(0, 5), phone(60, 5), 148, shown, 'x'), null, 'a scale no camera has');

// Up-down: tilted down until the feature sits 100 px above the cross.
const up = Math.atan(100 / f) / deg;
near(guideScale(phone(0, 5), phone(0, 5 - up), 100, shown, 'y'), k, 'tilting down onto the upper line measures it too');
assert.equal(guideScale(phone(0, 5), phone(0, 5 + up), 100, shown, 'y'), null, 'tilted up instead');

assert.equal(guideScale(null, phone(side, 5), 148, shown, 'x'), null);
assert.equal(guideScale(phone(0, 5), phone(side, 5), 0, shown, 'x'), null);
assert.equal(guideScale(phone(0, 5), phone(side, 5), 148, 0, 'x'), null);

console.log('capture calibration contract held');
