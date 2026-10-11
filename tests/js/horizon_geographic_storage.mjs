import assert from 'node:assert/strict';
import * as H from '../../core/horizon.js';
import * as C from '../../core/horizoncalibration.js';
import * as P from '../../core/horizonprojection.js';
import * as History from '../../core/panohistory.js';
import { scoreNightTracks } from '../../core/scoring.js';
import { sampleVisible } from '../../core/visibility.js';
import { panoramaRevision } from '../../core/plannerstate.js';

const pano = () => ({id:'p1',fov:80,azOffset:350,altBottom:0,altTop:60,sourceRect:{x:0,y:0,w:1,h:1},
  paintMode:'obstacle',strokes:[],profile:Array(720).fill(10),profileTop:Array(720).fill(-90),profileBins:'world'});
const p=pano(), before=structuredClone(p);
assert.deepEqual(H.normalizeCoverageEvidence(null),{version:1,policy:'legacy',observer:null,captureDate:null});
assert.equal(H.normalizeCoverageEvidence({version:99,policy:'legacy'}).policy,'strict-measured','corrupt new evidence cannot restore permissive legacy inference');
assert.equal(H.ceilFor(p,180).ceil,-90,'legacy partial profiles retain outside-open planning');
assert.equal(H.queryHorizonEvidence(p,180,40).state,'unknown','planning permission does not fabricate measured sky');
assert.equal(H.queryHorizonEvidence(p,180,40).allowed,true);
assert.deepEqual(p,before,'query and migration helper never mutate authoritative profiles');
p.coverageEvidence=H.normalizeCoverageEvidence({version:1,policy:'strict-measured',
  observer:{lat:52.123456789,lon:13.123456789,opticalHeight:1.7},captureDate:'2026-10-11'},true);
assert.equal(p.coverageEvidence.observer.lat,52.123456789,'retain entered position precision, not invented rounding');
assert.deepEqual(H.normalizeCoverageEvidence({version:1,policy:'strict-measured',observer:{opticalHeight:1.5}},true).observer,
  {lat:null,lon:null,opticalHeight:1.5},'height can be known while geographic coordinates remain missing');
assert.equal(H.ceilFor(p,180).ceil,90);
assert.deepEqual(H.ceilFor(p,20),{ceil:10,ceilTop:60});
assert.equal(H.queryHorizonEvidence(p,20,5).state,'blocked');
assert.equal(H.queryHorizonEvidence(p,20,40).state,'clear');
assert.equal(H.queryHorizonEvidence(p,20,80).state,'unknown');
assert.equal(H.queryHorizonEvidence(p,20,80).allowed,false);
assert.equal(H.queryHorizonEvidence(p,20,-1).state,'unknown');
const index=40;p.profile[index]=-90;
assert.equal(H.queryHorizonEvidence(p,20,40).state,'unknown');
assert.equal(H.queryHorizonEvidence(p,20,40).allowed,false,'strict mode cannot infer clear sky from absent profile evidence');
p.coverageEvidence.policy='inferred-open';
assert.equal(H.queryHorizonEvidence(p,20,80).allowed,true,'practical inferred openness remains explicit');
assert.equal(H.queryHorizonEvidence(p,180,40).allowed,false,'new layers do not infer openness outside azimuth coverage');
assert.deepEqual(p.profile,before.profile.map((v,i)=>i===index?-90:v),'policy changes do not rewrite stored geometry');
for(const bad of [{version:2,policy:'legacy'},{version:1,policy:'guess'},
  {version:1,policy:'strict-measured',observer:'invalid'},
  {version:1,policy:'strict-measured',observer:{lat:'52',lon:13}},
  {version:1,policy:'strict-measured',observer:{lat:52,lon:13,opticalHeight:NaN}},
  {version:1,policy:'strict-measured',captureDate:'2026-02-30'},
  {version:1,policy:'strict-measured',captureDate:'2026-10-11T12:00:00'}])assert.throws(()=>H.normalizeCoverageEvidence(bad,true));
const measurement={source:'survey',sigmaDegrees:.2,captureTime:'2026-10-11T12:15:00+02:00',measurementGroup:'survey-A',exclusionReason:'Review source'};
assert.deepEqual(H.normalizeReferenceMeasurement(measurement,true),measurement);
assert.deepEqual(H.normalizeReferenceMeasurement({},true),{},'missing error information stays absent');
for(const bad of [{sigmaDegrees:0},{sigmaDegrees:'0.2'},{captureTime:'2026-02-30'},
  {source:'a'.repeat(97)},{measurementGroup:9}])assert.throws(()=>H.normalizeReferenceMeasurement(bad,true));
const model=P.createPhotoModel({type:'rectilinear',width:1200,height:600,hfov:90,heading:350,pitch:0,roll:0,lensCorrected:true});
const refs=[[.2,.3],[.8,.7]].map(([x,y])=>({...P.sourcePhotoAngles(model,x,y),x,y,...measurement}));
const known={version:5,mode:'known-geometry',sourceModel:model,model,references:[],checks:[],options:{robust:false,estimateFov:false,fovBounds:null}};
const e=C.normalizePhotoCalibration(known,true);assert.equal(e.references.length,0,'known geometry does not fabricate fitting references');
const q={...pano(),photoModel:model,fov:model.working.fov,azOffset:model.working.offset,
  altTop:model.working.top,altBottom:model.working.bottom,calibration:e};
assert.equal(C.photoCalibrationReport(q).status,'aligned','confirmed geometry is not independently checked');
q.calibration.checks=[refs[0]];assert.equal(C.photoCalibrationReport(q).status,'checked');
q.altTop+=.1;assert.equal(C.photoCalibrationReport(q).status,'approximate','manual angle drift invalidates checked physical evidence');
const fitted=C.fitPhotoOrientation(model,refs),physical=C.normalizePhotoCalibration({...known,mode:'orientation',
  model:fitted.photoModel,references:refs,checks:[]},true);
assert.equal(physical.references[0].sigmaDegrees,.2);assert.equal(physical.references[0].measurementGroup,'survey-A');
for(const bad of [{...known,mode:'bad'},{...known,sourceModel:null},{...known,references:refs},
  {...known,checks:[{...refs[0],sigmaDegrees:-1}]},{...known,options:{estimateFov:'yes'}},
  {...known,options:'invalid'}])assert.throws(()=>C.normalizePhotoCalibration(bad,true));
const old={version:1,projection:'unknown',coverage:80,bearing:{x:.2,y:.3,azimuth:10,...measurement},vertical:[],check:null};
assert.deepEqual(C.normalizePhotoCalibration(old,true),old,'old evidence can retain stated metadata without changing solver version');
const original=pano();original.coverageEvidence=H.normalizeCoverageEvidence(null);original.calibration=e;
const history=History.newHistory(original);original.coverageEvidence=structuredClone(p.coverageEvidence);
original.coverageEvidence.observer.opticalHeight=2.1;History.historyCommit(history,original);
History.historyUndo(history,original);assert.equal(original.coverageEvidence.policy,'legacy');
assert.deepEqual(original.profile,before.profile,'empty strokes retain authoritative world profile through history');
History.historyRedo(history,original);assert.equal(original.coverageEvidence.observer.opticalHeight,2.1);
assert.equal(original.sourceMask,undefined,'no historical source segmentation is invented');
const scored=pano();scored.altBottom=15;scored.coverageEvidence=H.normalizeCoverageEvidence({version:1,policy:'strict-measured'},true);
scored.profile[60]=-90;
const altitudes=[5,16,59,60,70,30,30,30],azimuths=[20,20,20,20,20,30,180,20];
const tracks={n:7,count:8,alt:Float64Array.from(altitudes),az:Float64Array.from(azimuths),jd1:8/1440};
const score=S=>scoreNightTracks(tracks,[{id:'x'}],0,1/1440,0,S,{maxAlt:true})[0];
const strictScore=score(scored);
assert.deepEqual(Array.from(strictScore.vis),[0,1,1,0,0,0,0,1],'strict policy excludes empty columns and horizontal/vertical gaps');
for(const policy of ['legacy','inferred-open','strict-measured']){
  scored.coverageEvidence.policy=policy;
  const actual=score(scored).vis;
  const expected=altitudes.map((alt,i)=>{const bounds=H.ceilFor(scored,azimuths[i]);return +sampleVisible(alt,0,bounds.ceil,bounds.ceilTop);});
  assert.deepEqual(Array.from(actual),expected,`${policy}: shared scorer and selected-time visibility agree`);
}
const revision=panoramaRevision(scored);scored.coverageEvidence.policy='inferred-open';
assert.notEqual(panoramaRevision(scored),revision,'changing coverage policy invalidates planning caches');
const sky={...pano(),paintMode:'sky',blockAbove:false,profileTop:Array(720).fill(30),
  coverageEvidence:H.normalizeCoverageEvidence({version:1,policy:'strict-measured'},true)};
assert.equal(H.queryHorizonEvidence(sky,20,40).state,'unknown');
assert.equal(H.queryHorizonEvidence(sky,20,40).allowed,false,'strict sky evidence does not inherit practical open-above permission');
sky.profileTop[40]=-90;assert.equal(H.queryHorizonEvidence(sky,20,20).allowed,false,'missing sky upper evidence is unknown, not measured clear');
assert.equal(H.queryHorizonEvidence(sky,20,20).state,'unknown');sky.profileTop[40]=30;
sky.coverageEvidence.policy='legacy';assert.equal(H.queryHorizonEvidence(sky,20,40).allowed,true,'historical open-above remains intact');
globalThis.localStorage={getItem(){return null;},setItem(){throw new Error('unexpected write');},removeItem(){throw new Error('unexpected write');}};
const W=await import('../../web/webstore.js');
const bundle={app:'nightseam-web',version:10,panos:{panos:[original],activeId:'p1'}};
assert.equal(W.BUNDLE_VERSION,10);assert.equal(W.stageBackup(bundle).panos.panos[0].coverageEvidence.policy,'inferred-open');
assert.throws(()=>W.stageBackup({...bundle,version:11}),/newer version/);
for(const value of [{...original,coverageEvidence:{version:77,policy:'strict-measured'}},
  {id:'invalid/id',calibration:{...known,checks:[{...refs[0],sigmaDegrees:'wrong'}]}}])
  assert.throws(()=>W.stageBackup({...bundle,panos:{panos:[value],activeId:null}}),'whole-bundle staging rejects invalid new evidence before writes');
console.log('Geographic evidence, conservative policy, legacy profiles, metadata, physical schema, history and backup staging passed');
