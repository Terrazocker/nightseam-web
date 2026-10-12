import {
  PLANNER_CHANGE_EVENT,
  nextPlannerRevision,
  plannerChange,
  panoramaRevision,
} from '../../core/plannerstate.js';
import { withProfile } from '../../core/horizon.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(PLANNER_CHANGE_EVENT === 'planner:changed', 'event name is stable');
assert(nextPlannerRevision(0) === 1, 'revision starts at one');
assert(nextPlannerRevision(12) === 13, 'revision increments');
assert(nextPlannerRevision(-1) === 1, 'negative revisions reset');
assert(nextPlannerRevision(Number.MAX_SAFE_INTEGER) === 1,
  'overflowing revisions reset');

const event = plannerChange('horizon', 4, { cause: 'undo', horizonId: 'h1' });
assert(event.kind === 'horizon' && event.revision === 4 && event.cause === 'undo',
  'change payload keeps the shared fields');

const base = withProfile({ id: 'h1', points: [{ az: 90, alt: 20 }, { az: 270, alt: 5 }] });
const changed = withProfile({ ...base, points: [{ az: 90, alt: 21 }, { az: 270, alt: 5 }] });
assert(panoramaRevision(base) !== panoramaRevision(changed),
  'a skyline edit changes the content revision');
const copy = withProfile({ id: 'h1', points: base.points.map((p) => ({ ...p })), name: 'renamed' });
assert(panoramaRevision(base) === panoramaRevision(copy),
  'equal skyline content has a stable revision; the name does not affect planning');
assert(panoramaRevision({ ...base, id: 'h2' }) !== panoramaRevision(base),
  'another horizon with the same skyline is another revision');
assert(panoramaRevision(null) === '-', 'missing horizon has a sentinel revision');

console.log('planner state contract held');
