// Reusing a cached formatter must not reuse an offset across a transition or
// between zones; an unknown zone has no offset.
import assert from 'node:assert/strict';
import { offsetEastMin, zonedWallToUtcMs } from '../../core/time.js';

for (let n = 0; n < 3; n++) {
  assert.equal(offsetEastMin('Europe/Berlin', Date.UTC(2026, 2, 29, 0)), 60);
  assert.equal(offsetEastMin('Europe/Berlin', Date.UTC(2026, 2, 29, 3)), 120);
  assert.equal(offsetEastMin('Asia/Kathmandu', Date.UTC(2026, 2, 29)), 345);
  assert.equal(zonedWallToUtcMs('Europe/Berlin', Date.UTC(2026, 9, 25, 2, 30)), Date.UTC(2026, 9, 25, 0, 30));
}
assert.equal(offsetEastMin('bad/timezone', Date.now()), null);
console.log('timezone formatter cache held');
