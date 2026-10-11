import assert from 'node:assert/strict';
import * as C from '../../core/horizoncalibration.js';
import * as P from '../../core/horizonprojection.js';
const rad=Math.PI/180,deg=180/Math.PI;
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const wrapped=(a,b)=>((a-b+540)%360)-180;
const input=(type,extra={})=>({type,width:1200,height:600,hfov:type==='equirectangular'?120:80,
  heading:0,pitch:0,roll:0,top:60,bottom:-10,lonCenter:0,lensCorrected:type==='rectilinear',...extra});
// Independent elementary ray and successive-axis rotations. These anchors do
// not use production forward/inverse helpers to manufacture expected angles.
function anchor(m,x,y){
  let v;
  if(m.type==='rectilinear'){const s=2*Math.tan(m.hfov*rad/2);v=[(x-.5)*s,1,(.5-y)*s*m.height/m.width];}
  else{const a=(m.lonCenter+(x-.5)*m.hfov)*rad;
    const h=m.type==='cylindrical'?Math.atan((1-y)*Math.tan(m.top*rad)+y*Math.tan(m.bottom*rad)):(m.top-y*(m.top-m.bottom))*rad;
    v=[Math.cos(h)*Math.sin(a),Math.cos(h)*Math.cos(a),Math.sin(h)];}
  const r=m.roll*rad,p=m.pitch*rad,h=m.heading*rad;
  v=[Math.cos(r)*v[0]+Math.sin(r)*v[2],v[1],-Math.sin(r)*v[0]+Math.cos(r)*v[2]];
  v=[v[0],Math.cos(p)*v[1]-Math.sin(p)*v[2],Math.sin(p)*v[1]+Math.cos(p)*v[2]];
  v=[Math.cos(h)*v[0]+Math.sin(h)*v[1],-Math.sin(h)*v[0]+Math.cos(h)*v[1],v[2]];
  return {azimuth:(Math.atan2(v[0],v[1])*deg+360)%360,altitude:Math.atan2(v[2],Math.hypot(v[0],v[1]))*deg};
}
const positions=[[.1,.2],[.9,.8],[.2,.8],[.8,.2],[.45,.35],[.65,.65]];
const references=(m,coords=positions)=>coords.map(([x,y])=>({x,y,...anchor(m,x,y)}));
for(const type of ['equirectangular','cylindrical','rectilinear']){
  const base=input(type),truth={...base,heading:359.7,pitch:12,roll:-17};
  const model=P.createPhotoModel(base),refs=references(truth),checks=references(truth,[[.3,.6],[.7,.4]]);
  const before=structuredClone({model,refs,checks}),fit=C.fitPhotoOrientation(model,refs,{checks});
  near(wrapped(fit.pose.heading,truth.heading),0);near(fit.pose.pitch,truth.pitch);near(fit.pose.roll,truth.roll);
  near(fit.photoModel.hfov,base.hfov);near(fit.photoModel.top,base.top);near(fit.photoModel.bottom,base.bottom);
  assert.ok(fit.maxAngular<1e-8);assert.equal(fit.checkStatus,'checked');
  assert.deepEqual({model,refs,checks},before,'fit is immutable');
  const corrupted=checks.map(q=>({...q,azimuth:(q.azimuth+9)%360}));
  const other=C.fitPhotoOrientation(model,refs,{checks:corrupted});assert.deepEqual(other.pose,fit.pose,'held-out checks do not fit the pose');
  assert.equal(other.checkStatus,'aligned');assert.ok(other.maxCheckAngular>1);
}
const rect=input('rectilinear'),truth={...rect,heading:1,pitch:15,roll:23},m=P.createPhotoModel(rect);
const sphere=input('equirectangular',{hfov:360,top:90,bottom:-90}),sphereTruth={...sphere,heading:359.9,pitch:-12,roll:175};
const sphereFit=C.fitPhotoOrientation(P.createPhotoModel(sphere),references(sphereTruth));
near(wrapped(sphereFit.pose.heading,sphereTruth.heading),0);near(sphereFit.pose.pitch,-12);near(sphereFit.pose.roll,175);near(sphereFit.photoModel.hfov,360);
const rows=references(truth,[[.1,.5],[.9,.5]]),rowFit=C.fitPhotoOrientation(m,rows);
near(rowFit.pose.roll,23);near(rowFit.pose.pitch,15);assert.equal(rowFit.checkStatus,'aligned','two fit points alone cannot verify a result');
assert.throws(()=>C.fitPhotoOrientation(m,references(truth,[[.5,.5],[.50001,.50001]])),/parallel|opposite/);
const eq=input('equirectangular',{hfov:360,top:45,bottom:-45});
assert.throws(()=>C.fitPhotoOrientation(P.createPhotoModel(eq),references(eq,[[0,.5],[.5,.5]])),/parallel|opposite/);
assert.throws(()=>C.fitPhotoOrientation(m,[rows[0],rows[0]]),/distinct/);
assert.throws(()=>C.fitPhotoOrientation(m,references({...truth,pitch:85})),/pitch/);
assert.throws(()=>C.fitPhotoOrientation(m,rows.map(q=>({...q,sigmaDegrees:0}))),/Invalid/);
const mirror=references({...rect,heading:0,pitch:0,roll:0}).map(q=>({...q,azimuth:(360-q.azimuth)%360}));
assert.throws(()=>C.fitPhotoOrientation(m,mirror),/conflict|supported|photographed/,'a reflection cannot masquerade as a proper rotation');
near(P.photoAngularDistance([1,0,0],[-1,0,0]),180);
assert.ok(P.photoAngularDistance([1,0,0],[1,1e-14,0])>0,'tiny angular residual is not rounded away');
near(P.photoAngularDistance(P.photoDirectionVector(0,90),P.photoDirectionVector(180,90)),0,1e-12);
const clean=references(truth),noisy=clean.map((q,i)=>({...q,azimuth:q.azimuth+(i%2?.08:-.08),altitude:q.altitude+(i%2?-.06:.06)}));
const noisyFit=C.fitPhotoOrientation(m,noisy,{checks:references(truth,[[.25,.45],[.75,.55]])});
assert.ok(noisyFit.rmsAngular<.2);assert.equal(noisyFit.checkStatus,'checked');
const bad=[...clean,{x:.35,y:.7,...anchor(truth,.35,.7),sigmaDegrees:30}];bad.at(-1).azimuth+=8;
const weighted=C.fitPhotoOrientation(m,bad.map((q,i)=>({...q,azimuth:i===bad.length-1?q.azimuth-7.2:q.azimuth,sigmaDegrees:i===bad.length-1?30:.1})),{checks:references(truth,[[.25,.45],[.75,.55]])});
assert.ok(weighted.maxCheckAngular<.01);assert.ok(weighted.fitResiduals.at(-1).weight<.0001);
const robust=C.fitPhotoOrientation(m,bad.map(({sigmaDegrees,...q})=>q),{robust:true,checks:references(truth,[[.25,.45],[.75,.55]])});
assert.ok(robust.fitResiduals.at(-1).influence<.2);assert.ok(robust.maxAngular>5,'downweighted point is retained and its residual stays visible');
assert.equal(robust.checkStatus,'aligned','downweighting a conflict cannot silently certify the fit');assert.match(robust.reason,/unverified/);
const restored=C.reportPhotoOrientation(robust.photoModel,bad.map(({sigmaDegrees,...q})=>q),[],{robust:true});
near(restored.fitResiduals.at(-1).influence,robust.fitResiduals.at(-1).influence,1e-5);
assert.throws(()=>C.fitPhotoOrientation(m,bad.map(({sigmaDegrees,...q})=>q)),/conflict/);
const excluded=C.fitPhotoOrientation(m,bad.map((q,i)=>({...q,excluded:i===bad.length-1})));near(excluded.pose.roll,truth.roll);
assert.equal(excluded.fitResiduals.at(-1).weight,0);
const report=C.reportPhotoOrientation(P.createPhotoModel(truth),clean,[clean[0]]);assert.equal(report.independent,false);
const group=C.reportPhotoOrientation(P.createPhotoModel(truth),clean.map(q=>({...q,measurementGroup:'same-compass'})),references(truth,[[.25,.4]]).map(q=>({...q,measurementGroup:'same-compass'})));
assert.equal(group.checkResiduals[0].sharedMeasurementGroup,true);assert.match(group.reason,/bias/);
const known=C.reportPhotoOrientation(P.createPhotoModel(truth),[],references(truth,[[.25,.4],[.75,.6]]));assert.equal(known.checkStatus,'checked');assert.equal(known.rmsAngular,null);
const unknownInput=input('rectilinear',{hfov:60}),unknownTruth={...unknownInput,hfov:90,heading:355,pitch:9,roll:12};
const fit=C.fitPhotoOrientation(P.createPhotoModel(unknownInput),references(unknownTruth),{
  estimateFov:true,checks:references(unknownTruth,[[.15,.6],[.8,.45]]),fovBounds:[40,120]});
near(fit.photoModel.hfov,90,2e-5);near(wrapped(fit.pose.heading,355),0,2e-5);assert.equal(fit.fovEstimated,true);assert.ok(fit.validationImprovement>.1);
assert.throws(()=>C.fitPhotoOrientation(m,clean,{estimateFov:true}),/four|two/);
assert.throws(()=>C.fitPhotoOrientation(P.createPhotoModel(input('cylindrical')),references(input('cylindrical')),{estimateFov:true}),/Only corrected/);
assert.throws(()=>C.fitPhotoOrientation(P.createPhotoModel(unknownInput),references(unknownTruth),{estimateFov:true,checks:references(unknownTruth,[[.15,.6],[.8,.45]]),fovBounds:[40,70]}),/bound/);
assert.throws(()=>C.fitPhotoOrientation(m,clean,{estimateFov:true,checks:references(truth,[[.15,.6],[.8,.45]])}),/improve/);
assert.throws(()=>C.fitPhotoOrientation(P.createPhotoModel(unknownInput),references(unknownTruth,[[.2,.2],[.2,.8],[.8,.2],[.8,.8]]),{
  estimateFov:true,checks:references(unknownTruth,[[.15,.6],[.8,.45]])}),/weakly constrained/,'the supported unknown-FOV fit requires multiple radial tiers');
console.log('Physical orientation, spherical residuals, weighting, held-out checks and bounded FOV fitting passed');
