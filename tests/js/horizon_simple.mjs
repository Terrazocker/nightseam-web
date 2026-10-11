import assert from 'node:assert/strict';
import * as C from '../../core/horizoncalibration.js';
import * as H from '../../core/horizon.js';
import * as History from '../../core/panohistory.js';
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const pano = () => ({ fov:360, azOffset:0, altTop:60, altBottom:0, sourceRect:{x:0,y:0,w:1,h:1},
  paintMode:'obstacle', strokes:[], profile:Array(720).fill(-90), profileTop:Array(720).fill(-90),calibration:C.normalizePhotoCalibration(null) });
for (const [width,offset] of [[80,350],[360,265],[300,350]]) {
  const p=pano(), before=structuredClone(p);
  const refs=[{x:.1,y:.8,azimuth:(offset+width*.1)%360,altitude:-3},
    {x:.9,y:.2,azimuth:(offset+width*.9)%360,altitude:33}];
  const patch=C.fitPhotoReferences(p,refs,{projection:'equirectangular',full360:width===360});
  assert.deepEqual(p,before,'preview must not mutate input');
  Object.assign(p,patch); near(p.fov,width);near(p.azOffset,offset);near(p.altTop,45);near(p.altBottom,-15);
  assert.equal(C.photoCalibrationReport(p).status,'aligned','fitting is not independent checking');
  p.calibration.check={x:.5,y:.5,azimuth:(offset+width*.5)%360,altitude:15};
  assert.equal(C.photoCalibrationReport(p).status,'checked');
  const checkX=p.calibration.check.x;p.calibration.check.x=p.calibration.references[0].x;
  assert.equal(C.photoCalibrationReport(p).independent,false,'a check at a fitted x cannot independently validate horizontal scale');
  p.calibration.check.x=checkX;
  const hist=History.newHistory(p);p.azOffset=(p.azOffset+.1)%360;History.historyCommit(hist,p);
  assert.equal(C.photoCalibrationReport(p).status,'approximate');History.historyUndo(hist,p);
  assert.equal(C.photoCalibrationReport(p).status,'checked');
  H.cropPano(p,{x:36,w:648},720);near(C.photoPointAngles(p,p.calibration.references[0]).altitude,-3);
  assert.equal(C.photoCalibrationReport(p).status,'checked');
  const current=C.fitPhotoReferences(p,p.calibration.references,p.calibration);near(current.fov,p.fov);near(current.azOffset,p.azOffset);
  p.calibration.check.altitude+=5;assert.equal(C.photoCalibrationReport(p).status,'aligned');near(C.photoCalibrationReport(p).altitudeError,-5);
  p.calibration.projection='unknown';assert.equal(C.photoCalibrationReport(p).status,'approximate');
  const snap=History.snapshot(p);p.calibration.references[0].azimuth=17;History.applySnapshot(p,snap);
  assert.notEqual(p.calibration.references[0].azimuth,17,'history deeply retains complete refs');
}
const p=pano(), refs=[{x:0,y:.75,azimuth:350,altitude:0},{x:1,y:.25,azimuth:350,altitude:30}];
assert.throws(()=>C.fitPhotoReferences(p,refs),/confirmed full/);
near(C.fitPhotoReferences(p,refs,{full360:true}).fov,360);
for (const bad of [
  [{...refs[0],x:.5},{...refs[1],x:.51}],
  [{...refs[0],y:.5},{...refs[1],y:.5}],
  [{...refs[0],azimuth:NaN},refs[1]],
  [{...refs[0],altitude:90},{...refs[1],altitude:-90}],
]) { const before=structuredClone(p);assert.throws(()=>C.fitPhotoReferences(p,bad));assert.deepEqual(p,before); }
assert.throws(()=>C.fitPhotoReferences(p,[{...refs[0],azimuth:10},{...refs[1],azimuth:30}],{full360:true}),/confirmed full/);
const good=C.fitPhotoReferences(p,[{...refs[0],azimuth:10},{...refs[1],azimuth:90}]).calibration;
for (const invalid of [{...good,references:[]},{...good,full360:'yes'},
  {...good,references:[{...good.references[0],y:2},good.references[1]]}]) assert.throws(()=>C.normalizePhotoCalibration(invalid,true));
const legacy=C.normalizePhotoCalibration(null);legacy.bearing={x:.2,y:.4,azimuth:90};
assert.deepEqual(C.normalizePhotoCalibration(legacy,true),legacy,'legacy evidence is not fabricated into two complete refs');
// A known width supplies a constraint, not perfectly measured bearings.
const measured=[{x:.1,y:.8,azimuth:35.6,altitude:-3},{x:.9,y:.2,azimuth:324.4,altitude:33}];
const balanced=C.fitPhotoReferences(p,measured,{full360:true,projection:'equirectangular'});
near(balanced.azOffset,0);near(balanced.fov,360);assert.equal(balanced.calibration.version,3);
const balancedP={...p,...balanced}, diagnostic=C.photoCalibrationReport(balancedP);
near(diagnostic.fitResiduals[0].azimuth,.4);near(diagnostic.fitResiduals[1].azimuth,-.4);
assert.equal(diagnostic.status,'aligned','small fit residuals are not independent validation');
near(C.fitPhotoReferences(p,[...measured].reverse(),{full360:true}).azOffset,0);
assert.throws(()=>C.fitPhotoReferences(p,measured,{full360:true,version:2}),/confirmed full/,'v2 retains exact-fit semantics');
const exact=measured.map((v,i)=>({...v,azimuth:i?324:36}));
const oldFit=C.fitPhotoReferences(p,exact,{full360:true,version:2,projection:'equirectangular'});
assert.equal(oldFit.calibration.version,2);assert.equal(C.photoCalibrationReport({...p,...oldFit}).status,'aligned');
const excessive=measured.map((v,i)=>({...v,azimuth:i?325.1:34.9}));
assert.throws(()=>C.fitPhotoReferences(p,excessive,{full360:true}),/tolerance/);
const boundary=measured.map((v,i)=>({...v,azimuth:i?325:35}));
const boundaryFit=C.fitPhotoReferences(p,boundary,{full360:true});
near(Math.abs(C.photoCalibrationReport({...p,...boundaryFit}).fitResiduals[0].azimuth),1);
assert.throws(()=>C.normalizePhotoCalibration({...balanced.calibration,coverage:359},true),'v3 full width must actually declare 360 degrees');
for(const offset of [359.8,.2]) {
  const nearNorth=measured.map((v,i)=>({...v,azimuth:(offset+360*v.x+(i?.4:-.4))%360}));
  near(C.fitPhotoReferences(p,nearNorth,{full360:true}).azOffset,offset);
}
const close=[{x:.45,y:.45,azimuth:36,altitude:18},{x:.55,y:.55,azimuth:44,altitude:12}];
const closeFit=C.fitPhotoReferences(p,close,{projection:'equirectangular'});
const sensitive=C.photoCalibrationReport({...p,...closeFit});
near(sensitive.edgeSensitivity.azimuth,10);near(sensitive.edgeSensitivity.altitude,10);
const cropped={...balancedP,sourceRect:{x:.05,y:0,w:.9,h:1},fov:324,azOffset:18};
assert.equal(C.photoCalibrationReport(cropped).status,'aligned','constrained original width survives crop');
cropped.azOffset+=.05;assert.equal(C.photoCalibrationReport(cropped).status,'approximate','tolerance cannot hide later manual drift');
assert.throws(()=>C.normalizePhotoCalibration({...balanced.calibration,version:4},true));
const dab=[{m:'b',x:1,y:100,r:4}];
assert.equal(H.wrapsFor({fov:359.6}),false,'a near-full partial photo has a real seam gap');
assert.equal(H.wrapsFor({fov:360}),true);assert.equal(H.wrapsFor({fov:360-1e-10}),true);
const partialMask=H.rebuildMask(dab,H.wrapsFor({fov:359.6})),fullMask=H.rebuildMask(dab,true);
assert.equal(partialMask[100*720+719],0,'partial paint cannot reappear at the opposite edge');
assert.equal(fullMask[100*720+719],255,'full-panorama seam still wraps');
console.log('Two-point fit, seam, crop, checks, preview, history and strict schema passed');
