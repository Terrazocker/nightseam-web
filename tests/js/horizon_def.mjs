import assert from 'node:assert/strict';
import * as P from '../../core/horizonprojection.js';
import * as C from '../../core/horizoncalibration.js';
import * as H from '../../core/horizon.js';
import * as History from '../../core/panohistory.js';
import { scoreNightTracks } from '../../core/scoring.js';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const model=(type,extra={})=>P.createPhotoModel({type,width:1200,height:600,hfov:80,heading:0,pitch:0,roll:0,top:60,bottom:0,lensCorrected:true,...extra});
// Independent analytic anchors, rather than only forward/inverse roundtrips.
const cyl=model('cylindrical');
near(cyl.working.fov,80);near(cyl.working.bottom,0);near(cyl.working.top,60);
near(model('cylindrical',{hfov:360}).working.fov,360);
near(model('cylindrical',{hfov:5}).working.fov,5);
near(P.sourcePhotoAngles(cyl,.5,.5).altitude,Math.atan(Math.sqrt(3)/2)*180/Math.PI);
near(P.sourcePhotoAngles(cyl,.75,0).azimuth,20);
const rect=model('rectilinear',{hfov:90});near(P.sourcePhotoAngles(rect,1,.5).azimuth,45);
near(P.sourcePhotoAngles(rect,.5,0).altitude,Math.atan(.5)*180/Math.PI);
const rolled=model('rectilinear',{heading:90,pitch:20,roll:30});
near(P.sourcePhotoAngles(rolled,.5,.5).azimuth,90);near(P.sourcePhotoAngles(rolled,.5,.5).altitude,20);
const eq=model('equirectangular',{hfov:360,top:90,bottom:-90,heading:350});
near(eq.working.fov,360);near(eq.working.bottom,-30);near(eq.working.top,90);
for(const m of [cyl,rect,rolled,eq,model('equirectangular',{heading:355,pitch:15,roll:-12})]){
  assert.ok(P.photoRectangleCovered(m,m.working));
  for(let x=0;x<=10;x++)for(let y=0;y<=10;y++){
    const q=P.workingSourcePoint(m,x/10,y/10);assert.ok(q.inside,'working rectangle is wholly photographed');
    const a=P.sourceWorkingPoint(m,q);if(x===10&&m.working.fov===360)continue;near(a.x,x/10);near(a.y,y/10);
  }
  const size=P.workingPhotoSize(m);assert.ok(size.width*size.height<=P.PHOTO_WORKING_MAX_PIXELS);
  const map=P.photoSampleMap(m,20,12),q=P.workingSourcePoint(m,8/19,6/11);near(map[(6*20+8)*2],q.x,1e-6);near(map[(6*20+8)*2+1],q.y,1e-6);
  const normalized=P.normalizePhotoModel(m,true);assert.deepEqual(normalized,m);
}
assert.throws(()=>model('rectilinear',{lensCorrected:false}));
assert.throws(()=>model('rectilinear',{width:100000,height:100000}));
assert.throws(()=>model('cylindrical',{top:90}));
assert.throws(()=>model('cylindrical',{hfov:270,roll:5}));
assert.throws(()=>P.normalizePhotoModel({...rect,working:{offset:0,fov:180,bottom:-30,top:90}},true));
const packet=new TextEncoder().encode(`<rdf:Description xmlns:GPano="http://ns.google.com/photos/1.0/panorama/"
 GPano:ProjectionType="equirectangular" GPano:FullPanoWidthPixels="4000" GPano:FullPanoHeightPixels="2000"
 GPano:CroppedAreaImageWidthPixels="1200" GPano:CroppedAreaImageHeightPixels="600" GPano:CroppedAreaLeftPixels="1000" GPano:CroppedAreaTopPixels="500"
 GPano:PoseHeadingDegrees="350" GPano:PosePitchDegrees="0" GPano:PoseRollDegrees="0" GPano:InitialHorizontalFOVDegrees="20"/>`);
const metadata=P.readPanoramaMetadata(packet,1200,600);assert.equal(metadata.status,'detected');near(metadata.input.hfov,108);near(metadata.input.lonCenter,-36);
assert.equal(P.readPanoramaMetadata(packet,600,300).status,'invalid','scaled stale metadata is not silently trusted');
const contradictory=new TextEncoder().encode(new TextDecoder().decode(packet).replace('/>','GPano:PosePitchDegrees="12"/>'));
assert.equal(P.readPanoramaMetadata(contradictory,1200,600).status,'invalid','contradictory optional pose metadata cannot default to zero');
assert.equal(P.readPanoramaMetadata(new Uint8Array(),1200,600).status,'missing');
assert.ok(P.normalizePhotoSource({width:1200,height:600,metadata},true));
const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);png.set([73,72,68,82],12);
new DataView(png.buffer).setUint32(16,1200);new DataView(png.buffer).setUint32(20,600);assert.deepEqual(P.photoFileDimensions(png),{width:1200,height:600});
new DataView(png.buffer).setUint32(16,999999);assert.throws(()=>P.photoFileDimensions(png));
// Header-only EXIF/SOF fixture: rotated JPEG dimensions follow the decoded orientation.
const jpeg=Uint8Array.from([255,216,255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0,255,192,0,11,8,2,88,4,176,1,1,17,0,255,217]);
assert.deepEqual(P.photoFileDimensions(jpeg),{width:600,height:1200});
const p={fov:80,azOffset:350,altBottom:-3,altTop:57,sourceRect:{x:0,y:0,w:1,h:1},strokes:[],profile:Array(720).fill(-90),profileTop:Array(720).fill(-90)};
const refs=[{x:.1,y:.8,azimuth:358,altitude:9},{x:.9,y:.2,azimuth:62,altitude:45},{x:.5,y:.5,azimuth:30,altitude:27}];
const result=C.fitMultiplePhotoReferences(p,refs,{projection:'equirectangular'});near(result.fov,80);near(result.azOffset,350);near(result.altTop,57);near(result.altBottom,-3);
Object.assign(p,result);assert.equal(C.photoCalibrationReport(p).status,'aligned');
const checks=[{x:.3,y:.4,azimuth:14,altitude:33},{x:.7,y:.7,azimuth:46,altitude:15}];
p.calibration.checks=checks;assert.equal(C.photoCalibrationReport(p).status,'checked');
p.calibration.checks[0].azimuth+=2;p.calibration.checks[1].azimuth-=2;
assert.equal(C.photoCalibrationReport(p).status,'aligned','opposing check errors cannot average into a pass');near(C.photoCalibrationReport(p).azimuthError,2);
p.calibration.checks=[{...refs[0]}];assert.equal(C.photoCalibrationReport(p).independent,false,'fit feature cannot independently verify itself');
assert.throws(()=>C.fitMultiplePhotoReferences(p,[...refs,{x:.65,y:.65,azimuth:100,altitude:18}]));
const excluded=C.fitMultiplePhotoReferences(p,[...refs,{x:.65,y:.65,azimuth:100,altitude:18,excluded:true}],{projection:'equirectangular'});
near(excluded.fov,80);assert.equal(excluded.calibration.references[3].excluded,true);
assert.throws(()=>C.fitMultiplePhotoReferences(p,[refs[0],{...refs[0]}]));
assert.throws(()=>C.fitMultiplePhotoReferences(p,[{...refs[0],x:.5,y:.5},{...refs[1],x:.505,y:.51}]));
const fullRefs=refs.map(q=>({...q,azimuth:(350+360*q.x)%360}));
const full=C.fitMultiplePhotoReferences(p,fullRefs,{full360:true,projection:'equirectangular'});near(full.fov,360);near(full.azOffset,350);
const xs=[.1,.105,.11,.12,.14,.16,.18,.19,.195,.2];
const noisy=xs.map((x,i)=>({x,y:i%2?.2:.8,azimuth:350*x+(i===0?-1:i===xs.length-1?1:0),altitude:i%2?45:9}));
// Endpoint seed is 370°, but all fitted residuals are within one degree.
near(C.fitMultiplePhotoReferences(p,noisy,{projection:'equirectangular'}).fov,357.0175438596491);
assert.throws(()=>C.fitMultiplePhotoReferences(p,[{x:0,y:.2,azimuth:0,altitude:45},{x:1,y:.8,azimuth:0,altitude:9}],{projection:'equirectangular'}),'equal-bearing seam requires explicit full-circle confirmation');
const hist=History.newHistory(p);p.photoModel=rect;History.historyCommit(hist,p);History.historyUndo(hist,p);assert.equal(p.photoModel,null);History.historyRedo(hist,p);assert.deepEqual(p.photoModel,rect);
const converted={...p,photoModel:cyl,sourceRect:{x:0,y:0,w:1,h:1},fov:cyl.working.fov,azOffset:cyl.working.offset,altBottom:cyl.working.bottom,altTop:cyl.working.top};
const source=C.photoPoint(converted,.3,.4),mapped=C.photoPointAngles(converted,source);near(mapped.x,.3);near(mapped.y,.4);
assert.equal(H.ceilFor(converted,180).ceil,90,'unphotographed directions never become clear');
const tracks={n:1,count:3,alt:new Float64Array([40,40,40]),az:new Float64Array([0,180,350])};
const scored=scoreNightTracks(tracks,[{}],0,.01,0,converted,{maxAlt:true})[0];
assert.deepEqual(Array.from(scored.vis),Array.from(tracks.az,a=>40>H.ceilFor(converted,a).ceil?1:0),'batch planning agrees with the detailed converted-coverage gate');
const convertedRefs=[[.1,.8],[.9,.2],[.5,.5]].map(([x,y])=>({...C.photoPoint(converted,x,y),azimuth:(cyl.working.offset+x*cyl.working.fov+360)%360,altitude:cyl.working.top-y*(cyl.working.top-cyl.working.bottom)}));
const fitted=C.fitMultiplePhotoReferences(converted,convertedRefs,{projection:'equirectangular'});near(fitted.fov,converted.fov);near(fitted.altTop,converted.altTop);
Object.assign(converted,fitted);const before=structuredClone(converted.calibration.references);H.cropPano(converted,{x:100,w:500},720);
assert.deepEqual(converted.calibration.references,before);assert.equal(C.photoCalibrationReport(converted).status,'aligned','v4 can refit source evidence outside a retained angular crop');
console.log('D/E projection, source metadata, coverage, multi-point fitting and check-role acceptance passed');
