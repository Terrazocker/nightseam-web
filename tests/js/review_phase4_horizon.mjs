import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const H = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '../../core/horizon.js');
const {panoramaRevision} = await import('../../core/plannerstate.js');
const {newHistory, historyCommit, historyUndo, historyRedo} = await import('../../core/panohistory.js');
const base = (mode='obstacle', strokes=[]) => ({id:'crop',azOffset:0,fov:360,
  altBottom:0,altTop:60,paintMode:mode,blockAbove:true,strokes,profile:[],profileTop:[]});
const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e, `${a} != ${b}`);

// Worst-case duplicate IDs terminate, remain bounded/unique, and are idempotent.
const landmarks=H.normalizeHorizonLandmarks(Array.from({length:140},()=>({
  id:'x'.repeat(64),name:'Ridge',azimuth:5,altitude:10})));
assert.equal(landmarks.length,128);
assert.equal(new Set(landmarks.map(x=>x.id)).size,128);
assert.ok(landmarks.every(x=>x.id.length<=64));
assert.deepEqual(H.normalizeHorizonLandmarks(landmarks),landmarks);

// Horizontal-only cropping preserves both edges at a dab's world direction.
for (const mode of ['obstacle','sky']) {
  const p=base(mode,[{m:'b',x:360,y:180,r:20}]);
  H.computeProfile(p);
  const expected=H.ceilFor(p,180),hist=newHistory(p);
  H.cropPano(p,{x:180,w:360},720);
  assert.equal(p.strokes[0].r,20);assert.equal(p.strokes[0].rx,40);
  assert.deepEqual(H.ceilFor(p,180),expected);
  historyCommit(hist,p);historyUndo(hist,p);
  assert.equal(p.strokes[0].rx,undefined);
  historyRedo(hist,p);assert.equal(p.strokes[0].rx,40);
  H.cropPano(p,{x:180,w:360},720);
  assert.equal(p.strokes[0].rx,80);assert.equal(p.strokes[0].r,20);
  assert.deepEqual(H.ceilFor(p,180),expected);
}

// Retain the original wrapped copy, including paint/erase chronology.
for(const mode of ['obstacle','sky']) {
  const p=base(mode,[{m:'b',x:1,y:180,r:12}, {m:'e',x:0,y:180,r:3},
    {m:'b',x:500,y:260,r:3}]);
  H.computeProfile(p);
  const expected=H.ceilFor(p,358);
  H.cropPano(p,{x:360,w:360},720);
  // Crop doubles horizontal raster resolution. Aggregating the whole world
  // bin can include the next sample of the circular edge: at this known
  // seam case its vertical change is bounded by one calibrated row.
  const cropped=H.ceilFor(p,358),row=(p.altTop-p.altBottom)/359;
  near(cropped.ceil,expected.ceil,row+1e-9);
  if(expected.ceilTop!==null)near(cropped.ceilTop,expected.ceilTop,row+1e-9);
  else assert.equal(cropped.ceilTop,null);
  const mask=H.rebuildMask(p.strokes);
  assert.equal(mask[180*720+719],0,'seam eraser must follow seam paint');
}
// Empty stroke crop clears stale derived values (stored stroke-less profiles stay authoritative).
for(const mode of ['obstacle','sky']) {
  const p=base(mode,[{m:'b',x:400,y:180,r:4}]);H.computeProfile(p);
  H.cropPano(p,{x:0,w:90},720);
  assert.equal(p.strokes.length,0);
  assert.ok(p.profile.every(x=>x===(mode==='sky'?90:H.NO_BLOCK)));
}
for(const [fov,az,selection] of [[360,0,{x:360,w:40}], [180,17.123,{x:650,w:70}],
    [20,350,{x:0,w:720}], [180,90,{x:100,w:333}]]) {
  const band=H.cropKeptBand(fov,az,selection,720);
  assert.ok(band.fov<=fov);assert.ok(band.kept.x>=0);
  assert.ok(band.kept.x+band.kept.w<=720+1e-9);
  const oldX=band.kept.x+band.kept.w/2;
  const p={...base(),fov,azOffset:az,strokes:[{m:'b',x:oldX,y:180,r:4}]};
  const direction=H.azOfX(p,oldX);
  H.cropPano(p,selection,720);
  near(H.azOfX(p,p.strokes[0].x),direction);
  near(p.fov,band.fov);near(p.azOffset,band.azOffset);
}
const small=base();small.fov=20;H.cropPano(small,{x:0,w:720},720);assert.equal(small.fov,20);
const circular=base('obstacle',[{m:'b',x:360,y:180,r:20}]);
const ellipse=structuredClone(circular);ellipse.strokes[0].rx=40;
assert.notEqual(panoramaRevision(circular),panoramaRevision(ellipse));
console.log('review phase4 horizon contract held');
