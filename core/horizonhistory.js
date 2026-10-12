/*
 * NightSeam core - horizon editor history (pure).
 *
 * Undo/redo/dirty state over JSON snapshots of a horizon's editable fields:
 * the skyline points, the overhang edges and the photo placement. One gesture (a drag, a sketch,
 * an alignment move) is one entry, committed when it ends. The saved baseline
 * makes "is this edit saved?" a comparison, so undoing back to it is clean.
 * The name is not part of the history; renames save directly.
 */

export const HISTORY_LIMIT = 100;

/** Serialized editable state. Copies, never aliases the record's arrays. */
export function snapshot(state) {
  return JSON.stringify({
    p: (state.points || []).map((pt) => [pt.az, pt.alt]),
    o: (state.overhangs || []).map((line) => line.map((pt) => [pt.az, pt.alt])),
    f: state.photo ? { ...state.photo } : null,
  });
}

/** Write a snapshot back onto a record (in place). */
export function applySnapshot(state, snap) {
  const o = JSON.parse(snap);
  state.points = o.p.map(([az, alt]) => ({ az, alt }));
  state.overhangs = (o.o || []).map((line) => line.map(([az, alt]) => ({ az, alt })));
  state.photo = o.f;
  return state;
}

/** Fresh history: one entry (the current state), which is also the saved baseline. */
export function newHistory(state, limit = HISTORY_LIMIT) {
  const snap = snapshot(state);
  return { entries: [snap], index: 0, baseline: snap, limit };
}

/** Record the current state. Returns false (no new entry) when nothing
 *  changed. Committing after an undo drops the redo entries; the oldest entry
 *  falls off past the limit. */
export function historyCommit(h, state) {
  const snap = snapshot(state);
  if (snap === h.entries[h.index]) return false;
  h.entries = h.entries.slice(0, h.index + 1);
  h.entries.push(snap);
  if (h.entries.length > h.limit) h.entries.shift();
  h.index = h.entries.length - 1;
  return true;
}

export function historyCanUndo(h) { return h.index > 0; }
export function historyCanRedo(h) { return h.index < h.entries.length - 1; }

export function historyUndo(h, state) {
  if (!historyCanUndo(h)) return false;
  h.index -= 1;
  applySnapshot(state, h.entries[h.index]);
  return true;
}

export function historyRedo(h, state) {
  if (!historyCanRedo(h)) return false;
  h.index += 1;
  applySnapshot(state, h.entries[h.index]);
  return true;
}

/** Mark the current state as saved. */
export function historyMarkSaved(h, state) {
  h.baseline = snapshot(state);
}

/** True while the current state differs from the last saved state. */
export function historyDirty(h, state) {
  return snapshot(state) !== h.baseline;
}
