/* Photo calibration evidence and solvers. All angles use true north and the
 * same linear mapping as the horizon mask. Evidence refers to the original
 * photograph, so a non-destructive crop cannot move a measurement. */
import { MASK_W, MASK_H, normalizeSourceRect, azOfX, altOf, normalizeReferenceMeasurement } from './horizon.js';
import { sourceWorkingPoint, workingSourcePoint, createPhotoModel, normalizePhotoModel,
  sourcePhotoRay, sourcePhotoAngles, photoDirectionVector, photoAngularDistance } from './horizonprojection.js';

const wrap = (a) => ((a % 360) + 360) % 360;
const delta = (a, b) => wrap(a - b + 180) - 180;
const finite = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
export const CALIBRATION_CHECK_TOLERANCE = 1;

const validMeasurement = v => { try { normalizeReferenceMeasurement(v,true); return true; } catch { return false; } };

/** Physical-model evidence is a new contract; legacy per-axis fitting stays
 * untouched. Both snapshots are explicit, so unknown-FOV results can retain
 * their supplied baseline and manual drift cannot preserve a checked claim. */
function normalizePhysicalEvidence(v, strict = false) {
  const fail = () => { if(strict)throw new Error('Invalid physical calibration evidence'); return normalizePhotoCalibration(null); };
  const point = q => q && typeof q === 'object' && !Array.isArray(q) && finite(q.x,0,1) && finite(q.y,0,1)
    && finite(q.azimuth,0,360) && finite(q.altitude,-90,90) && validMeasurement(q)
    && (q.excluded === undefined || typeof q.excluded === 'boolean');
  if (!v || !['orientation','known-geometry'].includes(v.mode) || !Array.isArray(v.references)
      || v.references.length > 16 || !v.references.every(point) || !Array.isArray(v.checks)
      || v.checks.length > 16 || !v.checks.every(q => point(q) && !q.excluded)
      || (v.mode === 'known-geometry' ? v.references.length !== 0 : v.references.filter(q=>!q.excluded).length < 2)) return fail();
  let sourceModel, model;
  try { sourceModel=normalizePhotoModel(v.sourceModel,true);model=normalizePhotoModel(v.model,true); } catch { return fail(); }
  if (!sourceModel || !model) return fail();
  const o=v.options??{}, robust=o.robust??false, estimateFov=o.estimateFov??false, fovBounds=o.fovBounds??null;
  if (typeof o !== 'object' || Array.isArray(o) || typeof robust !== 'boolean' || typeof estimateFov !== 'boolean'
      || (fovBounds !== null && (!Array.isArray(fovBounds) || fovBounds.length !== 2
        || !finite(fovBounds[0],5,150) || !finite(fovBounds[1],5,150) || fovBounds[1] <= fovBounds[0]))) return fail();
  if (estimateFov && sourceModel.type !== 'rectilinear') return fail();
  const fixed=['type','width','height','lonCenter','top','bottom','lensCorrected',...estimateFov?[]:['hfov']];
  if(fixed.some(k=>sourceModel[k]!==model[k]))return fail();
  if(v.mode==='known-geometry' && (robust || estimateFov || JSON.stringify(sourceModel)!==JSON.stringify(model)))return fail();
  const copy=q=>({x:q.x,y:q.y,azimuth:q.azimuth,altitude:q.altitude,...normalizeReferenceMeasurement(q,true)});
  const references=v.references.map(q=>({...copy(q),excluded:!!q.excluded})),checks=v.checks.map(copy);
  const repeated = a => a.some((q,i)=>a.slice(0,i).some(b=>Math.hypot(q.x-b.x,q.y-b.y)<1e-8));
  if(repeated(references)||repeated(checks))return fail();
  return {version:5,mode:v.mode,sourceModel,model,references,checks,options:{robust,estimateFov,fovBounds:fovBounds?.slice()??null},
    projection:'equirectangular',coverage:model.working.fov,full360:Math.abs(model.working.fov-360)<1e-8,
    bearing:null,vertical:[],check:checks[0]??null};
}

function physicalCalibrationReport(p,e) {
  const initial={status:'approximate',reason:'Review physical calibration.',azimuthError:null,altitudeError:null,
    independent:false,fitResiduals:[],checkResiduals:[],edgeSensitivity:null,checkSpread:null};
  let report, current;
  try { current=normalizePhotoModel(p.photoModel,true);
    if(!current||JSON.stringify(current)!==JSON.stringify(e.model))return {...initial,reason:'Photo geometry changed after alignment. Apply or confirm it again before checking.'};
    if(e.mode==='orientation') {
      const {fovBounds,...options}=e.options;
      report=fitPhotoOrientation(e.sourceModel,e.references,{...options,...fovBounds?{fovBounds}:{},checks:e.checks});
      if(['heading','pitch','roll','hfov'].some(k=>Math.abs(report.photoModel[k]-e.model[k])>1e-6))
        return {...initial,reason:'Stored physical fit does not match its source measurements. Apply the alignment again.'};
    } else report=reportPhotoOrientation(e.model,[],e.checks);
  } catch(err) { return {...initial,reason:err.message}; }
  const r=normalizeSourceRect(p.sourceRect),w=e.model.working,span=w.top-w.bottom;
  const expected={azOffset:wrap(w.offset+r.x*w.fov),fov:w.fov*r.w,
    altTop:w.top-r.y*span,altBottom:w.top-(r.y+r.h)*span};
  if(Math.abs(delta(p.azOffset,expected.azOffset))>1e-6 || ['fov','altTop','altBottom'].some(k=>Math.abs(p[k]-expected[k])>1e-6))
    return {...initial,...report,status:'approximate',reason:'Angles changed after physical alignment. Apply the model again before checking.'};
  const visibleChecks=e.checks.every(q=>photoPointAngles(p,q).inside);
  const independent=report.independent&&visibleChecks;
  const status=independent&&report.checkStatus==='checked'?'checked':'aligned';
  return {...initial,...report,status,independent,
    reason:!visibleChecks?'A held-out check is outside this crop. Retain it as evidence and add another visible check.':
      e.mode==='known-geometry'&&!e.checks.length?'Known photo geometry confirmed. No independent feature has checked it yet.':report.reason};
}

export function normalizePhotoCalibration(value, strict = false) {
  const empty = { version: 1, projection: 'unknown', coverage: null, bearing: null, vertical: [], check: null };
  if (value == null) return empty;
  if(value?.version===5)return normalizePhysicalEvidence(value,strict);
  if(value?.version===4)return normalizeMultipleEvidence(value,strict);
  const fail = () => { if (strict) throw new Error('Invalid photograph calibration evidence'); return empty; };
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1
      || !['unknown', 'equirectangular', 'other'].includes(value.projection)) {
    if ([2, 3].includes(value?.version)) return normalizeTwoPointEvidence(value, strict);
    return fail();
  }
  const point = (v, fields) => v && typeof v === 'object' && !Array.isArray(v)
    && finite(v.x, 0, 1) && finite(v.y, 0, 1)
    && fields.every((k) => finite(v[k], k === 'azimuth' ? 0 : -90, k === 'azimuth' ? 360 : 90)) && validMeasurement(v);
  if (value.coverage != null && !finite(value.coverage, 5, 360 + 1e-8)) return fail();
  if (value.bearing != null && !point(value.bearing, ['azimuth'])) return fail();
  if (!Array.isArray(value.vertical) || ![0, 2].includes(value.vertical.length)
      || !value.vertical.every((v) => point(v, ['altitude']))) return fail();
  if (value.check != null && !point(value.check, ['azimuth', 'altitude'])) return fail();
  const copy = (v, fields) => v == null ? null : { ...Object.fromEntries(['x', 'y', ...fields].map((k) => [k, v[k]])), ...normalizeReferenceMeasurement(v,true) };
  return { version: 1, projection: value.projection, coverage: value.coverage ?? null,
    bearing: copy(value.bearing, ['azimuth']), vertical: value.vertical.map((v) => copy(v, ['altitude'])),
    check: copy(value.check, ['azimuth', 'altitude']) };
}

function normalizeTwoPointEvidence(value, strict) {
  const fail = () => { if (strict) throw new Error('Invalid two-point calibration evidence'); return normalizePhotoCalibration(null); };
  const validPoint = v => v && typeof v === 'object' && !Array.isArray(v)
    && finite(v.x, 0, 1) && finite(v.y, 0, 1) && finite(v.azimuth, 0, 360) && finite(v.altitude, -90, 90) && validMeasurement(v);
  if (![2, 3].includes(value.version) || !['unknown', 'equirectangular', 'other'].includes(value.projection)
      || !Array.isArray(value.references) || value.references.length !== 2 || !value.references.every(validPoint)
      || !finite(value.coverage, 5, 360 + 1e-8) || typeof value.full360 !== 'boolean'
      || (value.version === 3 && value.full360 && Math.abs(value.coverage - 360) > 1e-8)
      || (value.check != null && !validPoint(value.check))) return fail();
  const copy = v => v == null ? null : { x: v.x, y: v.y, azimuth: v.azimuth, altitude: v.altitude, ...normalizeReferenceMeasurement(v,true) };
  const references = value.references.map(copy);
  return { version: value.version, projection: value.projection, coverage: value.coverage, full360: value.full360,
    references, bearing: { x: references[0].x, y: references[0].y, azimuth: references[0].azimuth },
    vertical: references.map(v => ({ x: v.x, y: v.y, altitude: v.altitude })), check: copy(value.check) };
}

/** Return a complete preview without mutating the panorama or its evidence.
 * Reference coordinates belong to the original photograph, not the current crop. */
export function fitPhotoReferences(p, references, { projection = 'unknown', full360 = false, version = 3 } = {}) {
  if(version===4)return fitMultiplePhotoReferences(p,references,{projection,full360});
  const r = normalizeSourceRect(p.sourceRect);
  // Validation must precede math, including all angles and both source positions.
  const e = normalizeTwoPointEvidence({ version, projection, references, coverage: 360, full360, check: null }, true);
  if (!e.references.every(v => photoPointAngles(p, v).inside)) throw new Error('Both points must be inside the current photograph crop.');
  const [a, b] = [...e.references].sort((u, v) => u.x - v.x);
  const dx = b.x - a.x;
  if (dx / r.w < 0.02) throw new Error('Choose points farther apart horizontally (at least 2% of this image).');
  const difference = b.azimuth - a.azimuth;
  const candidates = [-1, 0, 1, 2].map(k => (difference + k * 360) / dx)
    .filter(v => v >= 5 - 1e-8 && v <= 360 + 1e-8);
  let originalOffset;
  if (full360) {
    const disagreement = delta(b.azimuth, a.azimuth + 360 * dx);
    if (Math.abs(disagreement) > (version === 2 ? 1e-6 : 2 * CALIBRATION_CHECK_TOLERANCE + 1e-9))
      throw new Error('These bearings do not match the confirmed full 360° width within the supported tolerance. Review the points or the photo coverage.');
    // Equal-weight constrained least squares on the nearby circular branch.
    // Preserve v2's exact first-reference offset when reading old evidence.
    originalOffset = wrap(a.azimuth - a.x * 360 + (version === 3 ? disagreement / 2 : 0));
  } else if (Math.abs(delta(a.azimuth, b.azimuth)) < 1e-8) {
    throw new Error('Equal bearings at the two edges need a confirmed full 360° panorama. Otherwise choose different directions.');
  }
  if (!full360 && candidates.length !== 1)
    throw new Error('These bearings cannot establish an upright image between 5° and 360° wide. Review the directions and point positions.');
  const originalFov = full360 ? 360 : Math.min(360, Math.max(5, candidates[0]));
  const original = { ...p, sourceRect: { x: 0, y: 0, w: 1, h: 1 } };
  const vertical = fitPhotoVertical(original, e.references);
  const span = vertical.altTop - vertical.altBottom;
  const patch = { fov: originalFov * r.w, azOffset: wrap((originalOffset ?? a.azimuth - a.x * originalFov) + r.x * originalFov),
    altTop: vertical.altTop - r.y * span, altBottom: vertical.altTop - (r.y + r.h) * span };
  if (patch.fov < 5 - 1e-8 || patch.altTop - patch.altBottom < 5 - 1e-8)
    throw new Error('This crop is too narrow for the supported angular range. Reimport or keep a wider region.');
  e.coverage = originalFov;
  return { ...patch, calibration: e };
}

export function photoPoint(p, x, y) {
  const r = normalizeSourceRect(p.sourceRect);
  if (!finite(x, 0, 1) || !finite(y, 0, 1)) throw new Error('Choose a point inside the photograph');
  const point={ x: r.x + x * r.w, y: r.y + y * r.h };
  if(p.photoModel){const q=workingSourcePoint(p.photoModel,point.x,point.y);if(!q.inside)throw new Error('Choose a photographed point');return {x:q.x,y:q.y};}
  return point;
}

export function photoPointAngles(p, point) {
  const r = normalizeSourceRect(p.sourceRect);
  if(p.photoModel)point=sourceWorkingPoint(p.photoModel,point);
  const x = (point.x - r.x) / r.w, y = (point.y - r.y) / r.h;
  return { x, y, inside: x >= -1e-9 && x <= 1 + 1e-9 && y >= -1e-9 && y <= 1 + 1e-9,
    azimuth: azOfX(p, x * MASK_W), altitude: altOf(p, y * (MASK_H - 1)) };
}

export function alignPhotoBearing(p, reference) {
  if (!finite(reference.azimuth, 0, 360)) throw new Error('Enter a true bearing from 0 to 360 degrees');
  const point = photoPointAngles(p, reference);
  if (!point.inside) throw new Error('The direction reference is outside the current crop');
  return wrap(reference.azimuth - point.x * p.fov);
}

export function fitPhotoVertical(p, references) {
  if (!Array.isArray(references) || references.length !== 2
      || !references.every((v) => finite(v.altitude, -90, 90))) throw new Error('Enter two known altitudes');
  const [a, b] = references.map((v) => photoPointAngles(p, v));
  if (!a.inside || !b.inside) throw new Error('Both vertical references must be inside the current crop');
  if (Math.abs(b.y - a.y) < 0.02) throw new Error('Choose vertical references at least 2% of the image height apart');
  const span = (references[0].altitude - references[1].altitude) / (b.y - a.y);
  const altTop = references[0].altitude + a.y * span, altBottom = altTop - span;
  if (span < 5 || altBottom < -30 - 1e-8 || altBottom > 85 + 1e-8 || altTop > 90 + 1e-8)
    throw new Error('These references need an upright image with a 5° or larger height, bottom at least −30° and top at most 90°');
  return { altTop: Math.min(90, altTop), altBottom: Math.max(-30, altBottom) };
}

export function photoCalibrationReport(p) {
  const e = normalizePhotoCalibration(p.calibration);
  if(e.version===5)return physicalCalibrationReport(p,e);
  if(e.version===4)return multipleCalibrationReport(p,e);
  const r = normalizeSourceRect(p.sourceRect);
  const report = { status: 'assumed', reason: 'Coverage and angles have not been checked against known references.',
    azimuthError: null, altitudeError: null, independent: false, fitResiduals: [], edgeSensitivity: null };
  if (e.coverage != null || e.bearing || e.vertical.length || e.check) report.status = 'approximate';
  if (e.version >= 2) {
    let fitted;
    try { fitted = fitPhotoReferences(p, e.references, e); }
    catch (err) { return { ...report, reason: err.message }; }
    const validFit = Math.abs(delta(p.azOffset, fitted.azOffset)) < 1e-6
      && ['fov', 'altTop', 'altBottom'].every(k => Math.abs(p[k] - fitted[k]) < 1e-6)
      && Math.abs(e.coverage - fitted.calibration.coverage) < 1e-6;
    report.fitResiduals = e.references.map(v => {
      const q = photoPointAngles(p, v);
      return { azimuth: delta(q.azimuth, v.azimuth), altitude: q.altitude - v.altitude };
    });
    // Deterministic propagation bound for equal independent angle-error limits;
    // this is sensitivity to entered angles, not a measured uncertainty/CI.
    const sensitivity = (a, b, lo, hi) => Math.max(...[lo, hi].map(x => {
      const t = (x - a) / (b - a); return Math.abs(1 - t) + Math.abs(t);
    }));
    report.edgeSensitivity = {
      azimuth: e.full360 ? 1 : sensitivity(e.references[0].x, e.references[1].x, r.x, r.x + r.w),
      altitude: sensitivity(e.references[0].y, e.references[1].y, r.y, r.y + r.h),
    };
    if (e.check) {
      const q = photoPointAngles(p, e.check);
      report.azimuthError = delta(q.azimuth, e.check.azimuth);
      report.altitudeError = q.altitude - e.check.altitude;
      report.independent = q.inside && e.references.every(v => Math.abs((v.x-e.check.x)/r.w) >= 0.02 && Math.abs((v.y-e.check.y)/r.h) >= 0.02);
    }
    if (!validFit) return { ...report, reason: 'Alignment changed after fitting. Apply the two references again before checking.' };
    if (e.projection !== 'equirectangular') return { ...report, reason: 'Unknown or unsupported projection: this two-point angular mapping is approximate.' };
    if (!e.check) return { ...report, status: 'aligned', reason: 'Aligned from two references. A separate point can check the result; it has not been independently checked.' };
    if (!report.independent) return { ...report, status: 'aligned', reason: 'Choose a different check feature inside this crop, at least 2% across and down from each alignment point.' };
    if (Math.abs(report.azimuthError) > CALIBRATION_CHECK_TOLERANCE || Math.abs(report.altitudeError) > CALIBRATION_CHECK_TOLERANCE)
      return { ...report, status: 'aligned', reason: 'Check differs by more than 1°. Review the points and photo type; alignment has not been changed.' };
    return { ...report, status: 'checked', reason: 'Separate check agrees within 1° in both axes. Accuracy still depends on the photo and measurements.' };
  }
  if (e.check) {
    const point = photoPointAngles(p, e.check);
    if (!point.inside) return { ...report, reason: 'The check point is outside this crop. Choose another independent reference.' };
    report.azimuthError = delta(point.azimuth, e.check.azimuth);
    report.altitudeError = point.altitude - e.check.altitude;
    report.independent = !!e.bearing && Math.abs((e.bearing.x - e.check.x) / r.w) >= 0.02
      && e.vertical.length === 2 && e.vertical.every((v) => Math.abs((v.y - e.check.y) / r.h) >= 0.02);
  }
  if (e.projection !== 'equirectangular') return { ...report, reason: 'Unknown or unsupported projection: the angular mapping is approximate.' };
  if (e.coverage == null || Math.abs(e.coverage - p.fov / r.w) > 1e-6)
    return { ...report, reason: 'Confirm the measured horizontal coverage again.' };
  if (!e.bearing || e.vertical.length !== 2) return { ...report, reason: 'Set a known bearing and two vertical references before checking.' };
  try { fitPhotoVertical(p, e.vertical); }
  catch { return { ...report, reason: 'The vertical references do not establish a valid scale in this crop.' }; }
  const bearing = photoPointAngles(p, e.bearing);
  const vertical = e.vertical.map((v) => photoPointAngles(p, v));
  if (!bearing.inside || !vertical.every((v) => v.inside))
    return { ...report, reason: 'An alignment reference is outside this crop. Set new references to check this view.' };
  // Fit references must still be exact: a later manual edit cannot retain a
  // checked claim just because it happens to be close to the independent point.
  if (Math.abs(delta(bearing.azimuth, e.bearing.azimuth)) > 1e-6
      || vertical.some((v, i) => Math.abs(v.altitude - e.vertical[i].altitude) > 1e-6))
    return { ...report, reason: 'Calibration changed after alignment. Apply the reference measurements again.' };
  if (!e.check) return { ...report, reason: 'Choose a separate reference to check both bearing and altitude.' };
  if (!report.independent) return { ...report, reason: 'Use a different check feature: at least 2% across from the bearing point and 2% vertically from each altitude point.' };
  if (Math.abs(report.azimuthError) > CALIBRATION_CHECK_TOLERANCE || Math.abs(report.altitudeError) > CALIBRATION_CHECK_TOLERANCE)
    return { ...report, reason: 'Check differs by more than 1°. Review the coverage, references and projection.' };
  return { ...report, status: 'checked', reason: 'Independent reference agrees within 1° in both axes. Accuracy still depends on the photograph and your measurements.' };
}

function normalizeMultipleEvidence(v,strict=false){
  const fail=()=>{if(strict)throw new Error('Invalid multi-point calibration evidence');return normalizePhotoCalibration(null);};
  const point=q=>q&&typeof q==='object'&&!Array.isArray(q)&&finite(q.x,0,1)&&finite(q.y,0,1)&&finite(q.azimuth,0,360)&&finite(q.altitude,-90,90)&&validMeasurement(q);
  if(!v||v.version!==4||!['unknown','equirectangular','other'].includes(v.projection)||typeof v.full360!=='boolean'
    ||!finite(v.coverage,5,360+1e-8)||v.full360&&Math.abs(v.coverage-360)>1e-8
    ||!Array.isArray(v.references)||v.references.length<2||v.references.length>16
    ||!v.references.every(q=>point(q)&&(q.excluded===undefined||typeof q.excluded==='boolean'))
    ||v.references.filter(q=>!q.excluded).length<2||!Array.isArray(v.checks)||v.checks.length>16||!v.checks.every(point))return fail();
  const copy=q=>({x:q.x,y:q.y,azimuth:q.azimuth,altitude:q.altitude,...normalizeReferenceMeasurement(q,true)});
  const refs=v.references.map(q=>({...copy(q),excluded:!!q.excluded}));
  if(refs.some((q,i)=>refs.slice(0,i).some(a=>Math.hypot(q.x-a.x,q.y-a.y)<1e-8)))return fail();
  const checks=v.checks.map(copy);
  if(checks.some((q,i)=>checks.slice(0,i).some(a=>Math.hypot(q.x-a.x,q.y-a.y)<1e-8)))return fail();
  return {version:4,projection:v.projection,full360:v.full360,coverage:v.coverage,references:refs,checks,
    check:checks[0]??null,bearing:null,vertical:[]};
}
function lineFit(xs,ys,fixed=null){
  const n=xs.length,mx=xs.reduce((a,b)=>a+b,0)/n,my=ys.reduce((a,b)=>a+b,0)/n;
  const ss=xs.reduce((a,x)=>a+(x-mx)**2,0);
  if(ss/n<.0001-1e-12)throw new Error('Spread the fitting points farther across the photo and in height (at least 2% in each axis).');
  const slope=fixed??xs.reduce((a,x,i)=>a+(x-mx)*(ys[i]-my),0)/ss;
  return {slope,offset:my-slope*mx,mx,ss,n};
}
export function fitMultiplePhotoReferences(p,references,{projection='unknown',full360=false,checks=[]}={}){
  const e=normalizeMultipleEvidence({version:4,projection,full360,coverage:full360?360:5,references,checks},true);
  const active=e.references.filter(q=>!q.excluded),coords=active.map(q=>p.photoModel?sourceWorkingPoint(p.photoModel,q):q);
  if(coords.some(q=>!finite(q.x,-1e-8,1+1e-8)||!finite(q.y,-1e-8,1+1e-8)))throw new Error('Fitting points must be in the original angular working view.');
  if(p.photoModel&&full360&&Math.abs(p.photoModel.working.fov-360)>1e-8)throw new Error('This converted working view is partial; leave full 360° unchecked.');
  const xs=coords.map(q=>q.x),ys=coords.map(q=>q.y);
  const indices=xs.map((x,i)=>i).sort((a,b)=>xs[a]-xs[b]),a=indices[0],b=indices.at(-1),dx=xs[b]-xs[a];
  if(dx<.02-1e-9)throw new Error('Choose fitting points farther apart horizontally.');
  if(!full360&&active.every(q=>Math.abs(delta(q.azimuth,active[0].azimuth))<1e-8))
    throw new Error('Equal bearings need confirmed full 360° coverage or an additional reference with a different bearing.');
  const slack=2/dx;
  const widths=full360?[360]:[-1,0,1,2].map(k=>(active[b].azimuth-active[a].azimuth+k*360)/dx).filter(s=>s>=5-slack&&s<=360+slack);
  const candidates=[];
  for(const width of widths){
    const bearings=active.map((q,i)=>q.azimuth+360*Math.round((active[a].azimuth+width*(xs[i]-xs[a])-q.azimuth)/360));
    const fit=lineFit(xs,bearings,full360?360:null);
    if(fit.slope<5-1e-8||fit.slope>360+1e-8)continue;
    const errors=bearings.map((q,i)=>fit.offset+fit.slope*xs[i]-q),worst=Math.max(...errors.map(Math.abs));
    if(!candidates.some(q=>Math.abs(q.fit.slope-fit.slope)<1e-6))candidates.push({fit,worst});
  }
  candidates.sort((a,b)=>a.worst-b.worst);
  if(!candidates.length)throw new Error('The bearings cannot establish an upright view from 5° to 360°. Review coverage and directions.');
  if(candidates[0].worst>1+1e-9)throw new Error(`Fitting bearings conflict: worst difference ${candidates[0].worst.toFixed(2)}°. Review or explicitly exclude a suspect point.`);
  if(candidates.length>1&&candidates[1].worst<=1+1e-9)throw new Error('More than one bearing-wrap interpretation fits. Confirm full coverage or add another well-spread point.');
  const h=candidates[0].fit,v=lineFit(ys,active.map(q=>q.altitude));
  const worstAlt=Math.max(...active.map((q,i)=>Math.abs(v.offset+v.slope*ys[i]-q.altitude)));
  if(worstAlt>1+1e-9)throw new Error(`Fitting heights conflict: worst difference ${worstAlt.toFixed(2)}°. Review or explicitly exclude a suspect point.`);
  const span=-v.slope;
  if(span<5-1e-8||v.offset>90+1e-8||v.offset-span< -30-1e-8||v.offset-span>85)throw new Error('The fitted upright height must span at least 5°, stay below 90° and above −30°.');
  const r=normalizeSourceRect(p.sourceRect),patch={azOffset:wrap(h.offset+r.x*h.slope),fov:h.slope*r.w,
    altTop:v.offset-r.y*span,altBottom:v.offset-(r.y+r.h)*span};
  if(patch.fov<5-1e-8||patch.altTop-patch.altBottom<5-1e-8)throw new Error('Keep a wider or taller angular crop.');
  e.coverage=h.slope;
  return {...patch,calibration:e};
}
function multipleCalibrationReport(p,e){
  const report={status:'approximate',reason:'Review the fitting references.',azimuthError:null,altitudeError:null,independent:false,
    fitResiduals:[],checkResiduals:[],edgeSensitivity:null,checkSpread:null};
  let fitted;try{fitted=fitMultiplePhotoReferences(p,e.references,e);}catch(err){return {...report,reason:err.message};}
  const coords=e.references.map(q=>p.photoModel?sourceWorkingPoint(p.photoModel,q):q),active=coords.filter((q,i)=>!e.references[i].excluded);
  report.fitResiduals=e.references.map(q=>{const a=photoPointAngles(p,q);return {azimuth:delta(a.azimuth,q.azimuth),altitude:a.altitude-q.altitude,excluded:q.excluded};});
  const r=normalizeSourceRect(p.sourceRect);
  const sensitivity=(axis,lo,hi)=>{
    const xs=active.map(q=>q[axis]),mx=xs.reduce((a,b)=>a+b,0)/xs.length,ss=xs.reduce((a,x)=>a+(x-mx)**2,0);
    return Math.max(...[lo,hi].map(x=>xs.reduce((a,v)=>a+Math.abs(1/xs.length+(x-mx)*(v-mx)/ss),0)));
  };
  report.edgeSensitivity={azimuth:e.full360?1:sensitivity('x',r.x,r.x+r.w),altitude:sensitivity('y',r.y,r.y+r.h)};
  report.checkResiduals=e.checks.map(q=>{const a=photoPointAngles(p,q);return {azimuth:delta(a.azimuth,q.azimuth),altitude:a.altitude-q.altitude,
    independent:a.inside&&e.references.filter(v=>!v.excluded).every(v=>{const b=photoPointAngles(p,v);return Math.hypot(a.x-b.x,a.y-b.y)>=.02;})};});
  if(e.checks.length){report.azimuthError=Math.max(...report.checkResiduals.map(q=>Math.abs(q.azimuth)));report.altitudeError=Math.max(...report.checkResiduals.map(q=>Math.abs(q.altitude)));
    const q=e.checks.map(v=>photoPointAngles(p,v));report.checkSpread={horizontal:Math.max(...q.map(v=>v.x))-Math.min(...q.map(v=>v.x)),vertical:Math.max(...q.map(v=>v.y))-Math.min(...q.map(v=>v.y))};}
  const validFit=Math.abs(delta(p.azOffset,fitted.azOffset))<1e-6&&['fov','altTop','altBottom'].every(k=>Math.abs(p[k]-fitted[k])<1e-6)&&Math.abs(e.coverage-fitted.calibration.coverage)<1e-6;
  if(!validFit)return {...report,reason:'Alignment changed after fitting. Apply the references again before checking.'};
  if(e.projection!=='equirectangular')return {...report,reason:'Unknown photo geometry remains approximate, regardless of the number of points.'};
  report.status='aligned';
  if(!e.checks.length)return {...report,reason:'Aligned from fitting references. Add a separate check; fitting agreement is not independent evidence.'};
  report.independent=report.checkResiduals.every(q=>q.independent);
  if(!report.independent)return {...report,reason:'A check overlaps a fitting feature or lies outside this crop. Choose separate visible features.'};
  if(report.azimuthError>1+1e-9||report.altitudeError>1+1e-9)return {...report,reason:'At least one separate check differs by more than 1°. Review every check; alignment has not been changed.'};
  const local=report.checkSpread.horizontal<.25||report.checkSpread.vertical<.25;
  return {...report,status:'checked',reason:`All ${e.checks.length} separate checks agree within 1° in both axes. ${local?'Checks are clustered or local; they do not verify the whole image.':'Agreement still depends on photo geometry and measurement accuracy.'}`};
}

// Physical orientation fitting is separate from the historical angular-axis
// solvers above. Known source intrinsics never acquire a free angular stretch.
export const ORIENTATION_ANGULAR_TOLERANCE = 1;
const ORIENTATION_MAX_POINTS = 16;
const dot3=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
function orientationPoints(values,name,min=0){
  if(!Array.isArray(values)||values.length<min||values.length>ORIENTATION_MAX_POINTS)
    throw new Error(`${name} needs ${min}–16 original-photo points.`);
  return values.map((v,i)=>{
    if(!v||!finite(v.x,0,1)||!finite(v.y,0,1)||!finite(v.azimuth,0,360)||!finite(v.altitude,-90,90)
      ||v.excluded!==undefined&&typeof v.excluded!=='boolean'
      ||v.sigmaDegrees!==undefined&&(!finite(v.sigmaDegrees,0,30)||v.sigmaDegrees===0))
      throw new Error(`Invalid ${name.toLowerCase()} point ${i+1}.`);
    if(values.slice(0,i).some(q=>Math.hypot(q.x-v.x,q.y-v.y)<1e-8))
      throw new Error(`Choose distinct ${name.toLowerCase()} features.`);
    return {...v};
  });
}
// Bounded Jacobi diagonalization, avoiding an external numerical dependency.
function symmetricEigen(input){
  const n=input.length,a=input.map(row=>row.slice()),v=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>+(i===j)));
  for(let k=0;k<96;k++){
    let p=0,q=1,largest=0;
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(Math.abs(a[i][j])>largest){largest=Math.abs(a[i][j]);p=i;q=j;}
    if(largest<1e-14)break;
    const t=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),c=Math.cos(t),s=Math.sin(t);
    const pp=a[p][p],qq=a[q][q],pq=a[p][q];
    for(let i=0;i<n;i++)if(i!==p&&i!==q){const ip=a[i][p],iq=a[i][q];a[i][p]=a[p][i]=c*ip-s*iq;a[i][q]=a[q][i]=s*ip+c*iq;}
    a[p][p]=c*c*pp-2*s*c*pq+s*s*qq;a[q][q]=s*s*pp+2*s*c*pq+c*c*qq;a[p][q]=a[q][p]=0;
    for(let i=0;i<n;i++){const ip=v[i][p],iq=v[i][q];v[i][p]=c*ip-s*iq;v[i][q]=s*ip+c*iq;}
  }
  return a.map((row,i)=>({value:row[i],vector:v.map(r=>r[i])})).sort((a,b)=>a.value-b.value);
}
function quaternionMatrix(q){
  const [w,x,y,z]=q;
  return [[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
    [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
    [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]];
}
const matrixRay=(m,v)=>m.map(row=>dot3(row,v));
function directionalCondition(rays,weights){
  const total=weights.reduce((a,b)=>a+b,0),info=Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>
    +(i===j)-rays.reduce((sum,r,k)=>sum+weights[k]*r[i]*r[j],0)/total));
  const eig=symmetricEigen(info),minimum=eig[0].value,maximum=eig.at(-1).value;
  if(minimum<1e-4||minimum/maximum<1e-4)
    throw new Error('The known directions are nearly parallel or opposite. Choose features farther apart in direction; equal image rows are allowed.');
  return {minimumInformation:minimum,conditionNumber:maximum/minimum};
}
function wahbaRotation(rays,targets,weights){
  const score=q=>{const r=quaternionMatrix(q);return rays.reduce((sum,v,i)=>sum+weights[i]*dot3(targets[i],matrixRay(r,v)),0);};
  const basis=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>+(i===j))),diagonal=basis.map(score);
  const k=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>{
    if(i===j)return diagonal[i];
    const q=basis[i].map((v,n)=>(v+basis[j][n])/Math.SQRT2);
    return score(q)-(diagonal[i]+diagonal[j])/2;
  }));
  return quaternionMatrix(symmetricEigen(k).at(-1).vector);
}
function matrixPose(m){
  const degrees=180/Math.PI,pitch=Math.asin(Math.max(-1,Math.min(1,m[2][1])))*degrees;
  if(Math.abs(pitch)>80+1e-8)throw new Error('The recovered pitch is outside the supported −80° to 80° range.');
  return {heading:wrap(Math.atan2(m[0][1],m[1][1])*degrees),pitch,
    roll:delta(Math.atan2(-m[2][0],m[2][2])*degrees,0)};
}
function solveOrientation(model,refs,robust){
  const active=refs.filter(v=>!v.excluded);
  if(active.length<2)throw new Error('Choose at least two non-collinear fitting directions.');
  const rays=active.map(v=>sourcePhotoRay(model,v.x,v.y)),targets=active.map(v=>photoDirectionVector(v.azimuth,v.altitude));
  // Missing estimates receive the median stated relative precision, without
  // fabricating a measurement uncertainty. Ratios avoid inverse-square overflow.
  const relative=orientationPrecision(active);
  let weights=relative.slice(),rotation,condition;
  for(let iteration=0;iteration<(robust?16:1);iteration++){
    condition=directionalCondition(rays,weights);directionalCondition(targets,weights);
    rotation=wahbaRotation(rays,targets,weights);
    if(!robust)break;
    const next=relative.map((v,i)=>v*Math.min(1,(active[i].sigmaDegrees??(2/3))*1.5/Math.max(1e-12,photoAngularDistance(matrixRay(rotation,rays[i]),targets[i]))));
    const change=Math.max(...next.map((v,i)=>Math.abs(v-weights[i])));weights=next;
    if(change<1e-8)break;
  }
  // Refit final robust weights so reported influence matches the returned pose.
  condition=directionalCondition(rays,weights);rotation=wahbaRotation(rays,targets,weights);
  return {pose:matrixPose(rotation),condition,weights,baseWeights:relative,active};
}
function orientationPrecision(active){
  if(!active.length)return [];
  const stated=active.flatMap(v=>v.sigmaDegrees===undefined?[]:[v.sigmaDegrees]).sort((a,b)=>a-b);
  const neutral=stated.length?stated[Math.floor(stated.length/2)]:1;
  const sigmas=active.map(v=>v.sigmaDegrees??neutral),smallest=Math.min(...sigmas);
  return sigmas.map(v=>Math.max(1e-12,(smallest/v)**2));
}

/** Diagnostics on an immutable physical model; check data never enter fitting.
 * `independent` here means held out, not proof of an independent instrument. */
export function reportPhotoOrientation(model,references=[],checks=[],influence=null){
  const m=normalizePhotoModel(model,true),refs=orientationPoints(references,'Fitting'),held=orientationPoints(checks,'Check');
  const active=refs.filter(v=>!v.excluded);
  let index=0;
  const residual=(v)=>{const predicted=sourcePhotoAngles(m,v.x,v.y);return {azimuth:delta(predicted.azimuth,v.azimuth),altitude:predicted.altitude-v.altitude,
    angular:photoAngularDistance(photoDirectionVector(predicted.azimuth,predicted.altitude),photoDirectionVector(v.azimuth,v.altitude))};};
  const precision=orientationPrecision(active);
  const fitResiduals=refs.map(v=>{const i=index;if(!v.excluded)index++;const error=residual(v),factor=v.excluded?0:influence?.weights?
    influence.weights[i]/influence.baseWeights[i]:influence?.robust?Math.min(1,(v.sigmaDegrees??(2/3))*1.5/Math.max(1e-12,error.angular)):1;
    return {...error,excluded:!!v.excluded,weight:v.excluded?0:influence?.weights?.[i]??precision[i]*factor,influence:factor};});
  const checkResiduals=held.map(v=>({...residual(v),independent:active.every(q=>Math.hypot(q.x-v.x,q.y-v.y)>=1e-8),
    sharedMeasurementGroup:!!v.measurementGroup&&active.some(q=>q.measurementGroup===v.measurementGroup)}));
  const included=fitResiduals.filter(v=>!v.excluded),rmsAngular=included.length?Math.sqrt(included.reduce((s,v)=>s+v.angular*v.angular,0)/included.length):null;
  const maxAngular=included.length?Math.max(...included.map(v=>v.angular)):null;
  const maxCheckAngular=held.length?Math.max(...checkResiduals.map(v=>v.angular)):null;
  const fitAccepted=maxAngular===null||maxAngular<=ORIENTATION_ANGULAR_TOLERANCE+1e-9;
  const independent=held.length>0&&checkResiduals.every(v=>v.independent),checkStatus=fitAccepted&&independent&&maxCheckAngular<=ORIENTATION_ANGULAR_TOLERANCE?'checked':'aligned';
  const spread=held.length?{horizontal:Math.max(...held.map(v=>v.x))-Math.min(...held.map(v=>v.x)),vertical:Math.max(...held.map(v=>v.y))-Math.min(...held.map(v=>v.y))}:null;
  return {fitResiduals,checkResiduals,rmsAngular,maxAngular,maxCheckAngular,independent,checkStatus,fitAccepted,
    azimuthError:held.length?Math.max(...checkResiduals.map(v=>Math.abs(v.azimuth))):null,
    altitudeError:held.length?Math.max(...checkResiduals.map(v=>Math.abs(v.altitude))):null,checkSpread:spread,
    angularTolerance:ORIENTATION_ANGULAR_TOLERANCE,
    reason:!fitAccepted?'At least one retained fitting measurement differs by more than 1° angular separation. Reduced influence is visible; review geometry or explicitly exclude the measurement. This fit is unverified.':!held.length?'Orientation fitted. Add held-out checks; fitting agreement is not independent measurement evidence.':!independent?'A check reuses a fitting feature. Choose another known direction.':checkStatus!=='checked'?'A held-out check differs by more than 1° angular separation. Review geometry and measurements.':
      `Held-out checks agree within 1° angular separation. ${checkResiduals.some(v=>v.sharedMeasurementGroup)?'Shared measurement sources can retain the same bias. ':''}${held.length<2||spread.horizontal<.25||spread.vertical<.25?'Checks are local; they do not establish accuracy across the whole photo.':'Agreement still depends on source geometry and measurement accuracy.'}`};
}

/** Bounded immutable physical fit. FOV estimation is deliberately limited to a
 * corrected centred rectilinear source with distributed fitting and held-out
 * data, and must improve held-out error over the supplied fixed-FOV model. */
export function fitPhotoOrientation(sourceModel,references,{checks=[],robust=false,estimateFov=false,fovBounds=[5,150]}={}){
  if(typeof robust!=='boolean'||typeof estimateFov!=='boolean')throw new Error('Choose explicit orientation fitting options.');
  const model=sourceModel?.working?normalizePhotoModel(sourceModel,true):createPhotoModel(sourceModel);
  const refs=orientationPoints(references,'Fitting',2),held=orientationPoints(checks,'Check');
  const fixed=solveOrientation(model,refs,robust);
  let solved=fixed,hfov=model.hfov,estimated=false,validationImprovement=null,fovSensitivity=null;
  if(estimateFov){
    fovBounds=fovBounds??[5,150];
    const active=refs.filter(v=>!v.excluded);
    if(model.type!=='rectilinear'||model.lensCorrected!==true)throw new Error('Only corrected ordinary photos support estimating horizontal coverage.');
    if(active.length<4||held.length<2||held.some(v=>active.some(q=>Math.hypot(q.x-v.x,q.y-v.y)<1e-8)))
      throw new Error('Estimating coverage needs at least four fitting features and two distinct held-out checks.');
    if(!Array.isArray(fovBounds)||fovBounds.length!==2||!finite(fovBounds[0],5,150)||!finite(fovBounds[1],5,150)||fovBounds[1]-fovBounds[0]<5)
      throw new Error('Coverage search needs explicit bounds between 5° and 150°, at least 5° apart.');
    const spread=axis=>Math.max(...active.map(v=>v[axis]))-Math.min(...active.map(v=>v[axis]));
    const radius=active.map(v=>Math.hypot(v.x-.5,(v.y-.5)*model.height/model.width));
    if(spread('x')<.3||spread('y')<.15||Math.max(...radius)-Math.min(...radius)<.1)
      throw new Error('Unknown coverage is weakly constrained. Spread features across the photo, at different heights and distances from its centre.');
    const objective=width=>{try{const candidate={...model,hfov:width},fit=solveOrientation(candidate,refs,robust);
      const sum=fit.active.reduce((s,v,i)=>{const a=sourcePhotoAngles({...candidate,...fit.pose},v.x,v.y);const err=photoAngularDistance(photoDirectionVector(a.azimuth,a.altitude),photoDirectionVector(v.azimuth,v.altitude));return s+fit.weights[i]*err*err;},0);
      return {width,fit,cost:sum/fit.weights.reduce((a,b)=>a+b,0)};}catch{return {width,cost:Infinity};}};
    const [lo,hi]=fovBounds,grid=Array.from({length:49},(_,i)=>objective(lo+(hi-lo)*i/48)),best=grid.reduce((a,b)=>a.cost<b.cost?a:b),at=grid.indexOf(best);
    if(!Number.isFinite(best.cost)||at===0||at===48)throw new Error('Coverage is ambiguous or reaches a search bound. Supply known coverage instead.');
    let left=grid[at-1].width,right=grid[at+1].width;
    for(let n=0;n<36;n++){const a=left+(right-left)/3,b=right-(right-left)/3;if(objective(a).cost<objective(b).cost)right=b;else left=a;}
    const optimum=objective((left+right)/2),below=objective(Math.max(lo,optimum.width-1)),above=objective(Math.min(hi,optimum.width+1));
    fovSensitivity=Math.min(below.cost,above.cost)-optimum.cost;
    if(fovSensitivity<.0025)throw new Error('Coverage remains weakly constrained within 1°. Use a known field of view.');
    const good=createPhotoModel({...model,hfov:optimum.width,...optimum.fit.pose}),baseline=createPhotoModel({...model,...fixed.pose});
    const goodReport=reportPhotoOrientation(good,refs,held,optimum.fit),oldReport=reportPhotoOrientation(baseline,refs,held,fixed);
    validationImprovement=oldReport.maxCheckAngular-goodReport.maxCheckAngular;
    if(goodReport.maxCheckAngular>1||validationImprovement<.1)
      throw new Error('Estimated coverage does not improve held-out checks by at least 0.1° within the 1° angular policy. Keep known geometry or review measurements.');
    solved=optimum.fit;hfov=optimum.width;estimated=true;
  }
  const photoModel=createPhotoModel({...model,hfov,...solved.pose}),report=reportPhotoOrientation(photoModel,refs,held,solved);
  if(!robust&&!report.fitAccepted)throw new Error(`Fitting directions conflict: worst angular difference ${report.maxAngular.toFixed(2)}°. Review photo geometry and measurements before excluding a feature.`);
  return {photoModel,pose:{...solved.pose},...report,condition:solved.condition,weights:solved.weights.slice(),
    fovEstimated:estimated,validationImprovement,fovSensitivity};
}

/** Atomic panorama preview: source evidence and painting compatibility stay in core. */
export function previewPhotoOrientation(p, references, {checks=[],robust=false,estimateFov=false,knownGeometry=false}={}) {
  if (!p.photoModel) throw new Error('Confirm supported photo geometry before fitting its orientation.');
  const previous=normalizePhotoCalibration(p.calibration);
  const sourceModel=knownGeometry?p.photoModel:previous.version===5?previous.sourceModel:p.photoModel;
  let model=sourceModel;
  if (!knownGeometry) {
    if (p.strokes?.length || (p.profile??[]).some(v=>v!==-90))
      throw new Error('This horizon already contains drawing or an authoritative profile. Use a new horizon to change orientation; existing painting cannot yet be remapped.');
    model=fitPhotoOrientation(sourceModel,references,{checks,robust,estimateFov}).photoModel;
  }
  const calibration=normalizePhotoCalibration({version:5,mode:knownGeometry?'known-geometry':'orientation',
    sourceModel,model,references:knownGeometry?[]:references,checks,
    options:{robust:knownGeometry?false:robust,estimateFov:knownGeometry?false:estimateFov,fovBounds:null}},true);
  const w=model.working,r=knownGeometry?normalizeSourceRect(p.sourceRect,true):{x:0,y:0,w:1,h:1},span=w.top-w.bottom;
  const patch={photoModel:model,sourceRect:r,fov:w.fov*r.w,azOffset:((w.offset+w.fov*r.x)%360+360)%360,
    altTop:w.top-r.y*span,altBottom:w.top-(r.y+r.h)*span,calibration};
  if(knownGeometry&&(p.strokes?.length||(p.profile??[]).some(v=>v!==-90))
    &&['fov','azOffset','altTop','altBottom'].some(k=>Math.abs(patch[k]-p[k])>1e-6))
    throw new Error('The painted horizon uses changed angles. Confirming source geometry would reinterpret its drawing. Use a new horizon to align it.');
  return patch;
}

