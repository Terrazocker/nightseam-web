import assert from 'node:assert/strict';
import * as H from '../../core/horizon.js';
import * as History from '../../core/panohistory.js';
import { panoramaRevision } from '../../core/plannerstate.js';
import { offsetEastMin, zonedWallToUtcMs } from '../../core/time.js';
const make = () => ({ fov: 360, azOffset: 350, altBottom: 0, altTop: 60,
  sourceRect: { x: 0, y: 0, w: 1, h: 1 }, strokes: [], paintMode: 'obstacle',
  profile: Array(720).fill(22), profileTop: Array(720).fill(-90), profileBins: 720 });
const p = make(); H.computeProfile(p); assert.equal(p.profile[10], 22, 'no geometry preserves authoritative profile');
p.strokes = [H.normalizeSkylineStroke({m:'trace',points:[[0,240],[180,120],[360,180],[720,240]]})];
const hist = History.newHistory(p), base = panoramaRevision(p);
H.computeProfile(p);
assert.ok(H.ceilFor(p, 80).ceil > 39 && H.ceilFor(p, 80).ceil < 41, 'roof peak at world bearing');
const erase = { m: 'e', x: 180, y: 140, r: 40 };
p.strokes.push(erase); H.computeProfile(p); History.historyCommit(hist,p);
const mask = H.rebuildMask(p.strokes,true); assert.equal(mask[140*720+180],0);
p.strokes[0].points[1][1] = 130; History.historyCommit(hist,p);
assert.notEqual(panoramaRevision(p),base,'trace affects planner cache fingerprint');
assert.equal(H.rebuildMask(p.strokes,true)[140*720+180],0,'later eraser survives trace edits');
History.historyUndo(hist,p); assert.equal(p.strokes[0].points[1][1],120,'history deep copies nested points');
History.historyUndo(hist,p); assert.equal(p.strokes.length,1); History.historyRedo(hist,p);
const before=structuredClone(p); H.computeProfile(before);
H.cropPano(p,{x:100,w:400},720);
assert.equal(p.strokes[0].points[0][0],0); assert.equal(p.strokes[0].points.at(-1)[0],720);
assert.ok(Math.abs(p.strokes[0].points[0][1]-(240-120*100/180))<1e-8,'crop interpolates segment at edge');
const first=structuredClone(p); H.cropPano(p,{x:180,w:360},720);
assert.ok(p.sourceRect.w<first.sourceRect.w,'repeated crop composes source region');
for (let az=110;az<180;az+=.5) assert.ok(Math.abs(H.ceilFor(p,az).ceil-H.ceilFor(before,az).ceil)<.4,'world profile preserved within raster resolution');
const noTrace=make(); noTrace.strokes=[{m:'trace',points:[[0,240],[50,240]]}]; H.computeProfile(noTrace);
H.cropPano(noTrace,{x:360,w:180},720); assert.equal(noTrace.strokes.length,0); assert.equal(noTrace.profile[0],-90,'empty crop clears obsolete derived geometry');
const ordered=H.rebuildMask([{m:'e',x:180,y:220,r:20},{m:'trace',points:[[0,200],[720,200]]}],true);
assert.equal(ordered[220*720+180],255,'earlier eraser does not erase newly added trace');
for (const points of [[],[[1,2],[1,3]],[[1,NaN]],[[721,4]],[[1,360]],Array(257).fill([1,1])]) assert.throws(()=>H.normalizeSkylineStroke({m:'trace',points}));
H.clearMask(p); assert.equal(p.strokes.length,0); assert.equal(p.profile[0],-90);
// Reusing a formatter must not reuse an offset across a transition or zone.
for (let n=0;n<3;n++) {
  assert.equal(offsetEastMin('Europe/Berlin',Date.UTC(2026,2,29,0)),60);
  assert.equal(offsetEastMin('Europe/Berlin',Date.UTC(2026,2,29,3)),120);
  assert.equal(offsetEastMin('Asia/Kathmandu',Date.UTC(2026,2,29)),345);
  assert.equal(zonedWallToUtcMs('Europe/Berlin',Date.UTC(2026,9,25,2,30)),Date.UTC(2026,9,25,0,30));
}
assert.equal(offsetEastMin('bad/timezone',Date.now()),null);
console.log('Skyline geometry, ordered corrections, crop/history, planner and timezone acceptance passed');
