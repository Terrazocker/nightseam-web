/* Source retention and pixel rendering only; projection math stays in core. */
import { createPhotoModel, normalizePhotoCalibration, readPanoramaMetadata,
  PHOTO_MAX_PIXELS, workingPhotoSize, photoSampleMap,photoFileDimensions,normalizePhotoSource,normalizeCoverageEvidence } from './core.js?v=64';

export async function inspectPhoto(dataURL,file){
  const prefix=new Uint8Array(await file.slice(0,1048576).arrayBuffer()),header=photoFileDimensions(prefix);
  const img=await decodePhoto(dataURL);
  // Stored geometry uses the decoded size, while restore re-checks it against
  // the header: refuse a photo the two disagree on instead of an unrestorable record.
  if(header.width!==img.naturalWidth||header.height!==img.naturalHeight)throw new Error('This photo decodes at a different size or orientation than its file header states. Re-save it as a plain JPEG or PNG and import it again.');
  if(img.naturalWidth*img.naturalHeight>PHOTO_MAX_PIXELS)throw new Error('That image exceeds the 32-million-pixel limit. Resize it before importing.');
  let metadata=readPanoramaMetadata(prefix,img.naturalWidth,img.naturalHeight);
  const value={width:img.naturalWidth,height:img.naturalHeight,metadata};
  if(!normalizePhotoSource(value))metadata={status:'invalid',reason:'Metadata geometry is unsupported for this source. Enter known geometry manually.'};
  return {...value,metadata};
}
const decodePhoto=dataURL=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Could not decode the photograph. Use JPEG or PNG.'));img.src=dataURL;});

export function angularPhotoCanvas(img,model){
  if(img.naturalWidth!==model.width||img.naturalHeight!==model.height)throw new Error('Stored photo dimensions no longer match the projection. Reimport the original photo.');
  const src=document.createElement('canvas');src.width=img.naturalWidth;src.height=img.naturalHeight;
  const s=src.getContext('2d',{willReadFrequently:true});s.drawImage(img,0,0);
  const pixels=s.getImageData(0,0,src.width,src.height).data;
  const {width,height}=workingPhotoSize(model),mapping=photoSampleMap(model,width,height);
  const cv=document.createElement('canvas');cv.width=width;cv.height=height;const ctx=cv.getContext('2d'),out=ctx.createImageData(width,height);
  for(let i=0;i<width*height;i++){
    const x=Math.max(0,Math.min(src.width-1,mapping[i*2]*(src.width-1))),y=Math.max(0,Math.min(src.height-1,mapping[i*2+1]*(src.height-1)));
    const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(src.width-1,x0+1),y1=Math.min(src.height-1,y0+1),dx=x-x0,dy=y-y0;
    const a=(y0*src.width+x0)*4,b=(y0*src.width+x1)*4,c=(y1*src.width+x0)*4,d=(y1*src.width+x1)*4;
    for(let k=0;k<4;k++)out.data[i*4+k]=(pixels[a+k]*(1-dx)+pixels[b+k]*dx)*(1-dy)+(pixels[c+k]*(1-dx)+pixels[d+k]*dx)*dy;
  }
  ctx.putImageData(out,0,0);src.width=src.height=1;return cv;
}

export function photoConversionHTML(){return `<details id="photo-conversion"><summary>Photo geometry / leveling</summary>
  <p id="photo-detected" class="sub"></p><p class="sub">Heading is the centre direction of the source projection. For a cropped GPano image it refers to the full panorama centre; the detected crop offset is retained.</p>
  <label>Source photo type <select id="photo-type"><option value="equirectangular">Angular panorama</option><option value="cylindrical">Cylindrical panorama</option><option value="rectilinear">Ordinary corrected photo</option></select></label>
  <label>Horizontal coverage (°) <input id="photo-hfov" type="number" min="5" max="360" step="any" value="90"></label>
  <label>Source pose heading / true bearing (°) <input id="photo-heading" type="number" min="0" max="360" step="any" value="0"></label>
  <label>Pitch / tilt up (°) <input id="photo-pitch" type="number" min="-80" max="80" step="any" value="0"></label>
  <label>Roll / horizon tilt (°) <input id="photo-roll" type="number" min="-180" max="180" step="any" value="0"></label>
  <label>Source top angle (°) <input id="photo-top" type="number" min="-89" max="90" step="any" value="60"></label>
  <label>Source bottom angle (°) <input id="photo-bottom" type="number" min="-90" max="89" step="any" value="0"></label>
  <label><input id="photo-corrected" type="checkbox"> Ordinary photo has lens distortion corrected; pixels are square and the optical centre is at image centre</label>
  <p class="sub">Confirm the source projection and coverage. Orientation can be an initial estimate: known points can fit heading, tilt and roll afterwards. Focal length alone is insufficient. Top/bottom angles describe angular or cylindrical sources; ordinary-photo height follows its dimensions and horizontal coverage. Conversion keeps a fully photographed rectangular view, so tilted edges may be excluded. Unphotographed directions are unknown and conservatively excluded from planning. Stitching errors and fisheye lenses remain unsupported.</p>
  <div class="btnrow"><button id="photo-preview" type="button" class="btn">Preview conversion</button><button id="photo-apply" type="button" class="btn primary" disabled>Use converted view</button></div>
  <p id="photo-result" role="status"></p><canvas id="photo-preview-canvas" hidden aria-label="Converted photo preview" style="max-width:100%;height:auto"></canvas><p class="sub">Convert before drawing. Existing strokes and authoritative profiles cannot be remapped here; upload the photo as a new horizon to redraw. Original photo bytes and original-pixel references are retained.</p></details>`;}

export function wirePhotoConversion(root,p,hooks){
  const $=id=>root.querySelector('#'+id),ids=['type','hfov','heading','pitch','roll','top','bottom','corrected'];let preview=null;
  const detected=p.photoSource?.metadata;
  $('photo-detected').textContent=detected?.reason??'No supported panorama metadata detected. Enter known source geometry manually.';
  const defaults=p.photoModel??detected?.input;
  if(defaults)for(const key of ids){const el=$('photo-'+key);if(key==='corrected')el.checked=!!defaults.lensCorrected;else if(defaults[key]!==undefined)el.value=defaults[key];}
  const compatible=()=>!p.strokes?.length&&!(p.profile??[]).some(v=>v!==-90);
  const calculate=()=>{
    if(!compatible())throw new Error('This horizon already contains drawing or an authoritative profile. Upload the photo as a new horizon to convert and redraw.');
    const size=hooks.photoSize();if(!size)throw new Error('Wait for the photograph to load.');
    const type=$('photo-type').value;
    const input={type,...size,lonCenter:p.photoModel?.type===type?p.photoModel.lonCenter:detected?.input?.type===type?detected.input.lonCenter:0,lensCorrected:$('photo-corrected').checked};
    for(const key of ids.filter(k=>!['type','corrected'].includes(k))){const el=$('photo-'+key);if(!el.value.trim()||!el.checkValidity())throw new Error('Enter valid known photo geometry.');input[key]=Number(el.value);}
    return createPhotoModel(input);
  };
  for(const id of ids)$('photo-'+id).addEventListener('input',()=>{preview=null;$('photo-apply').disabled=true;$('photo-result').textContent='Preview the changed geometry before applying.';});
  $('photo-preview').addEventListener('click',()=>{
    hooks.settle();try{preview=calculate();hooks.preview(preview);const w=preview.working;
      $('photo-result').textContent=`Preview: ${w.fov.toFixed(1)}° wide, ${w.bottom.toFixed(1)}° to ${w.top.toFixed(1)}°. The live horizon is unchanged. Review the corrected photo before applying.`;$('photo-apply').disabled=false;
    }catch(err){preview=null;hooks.preview(null);$('photo-result').textContent=err.message;$('photo-apply').disabled=true;}
  });
  $('photo-apply').addEventListener('click',()=>{
    hooks.settle();try{if(!preview)throw new Error('Preview conversion first.');const model=calculate();
      const w=model.working;
      const calibration=normalizePhotoCalibration({version:5,mode:'known-geometry',sourceModel:model,model,references:[],checks:[],options:{robust:false,estimateFov:false,fovBounds:null}},true);
      // Every record carries legacy evidence by default, so legacy means "no choice
      // yet": assume open sky above the skyline. A chosen evidence policy is kept.
      const current=normalizeCoverageEvidence(p.coverageEvidence);
      const evidence=normalizeCoverageEvidence({...current,policy:current.policy==='legacy'?'inferred-open':current.policy},true);
      hooks.prepare(model);
      Object.assign(p,{photoModel:model,sourceRect:{x:0,y:0,w:1,h:1},fov:w.fov,azOffset:w.offset,altBottom:w.bottom,altTop:w.top,calibration,coverageEvidence:evidence});
      hooks.changed();preview=null;$('photo-apply').disabled=true;$('photo-result').textContent='Confirmed geometry applied. Review it without fitting, check another feature, or mark known points to fit orientation. Then draw and save.';
    }catch(err){$('photo-result').textContent=err.message;}
  });
  return {cancel:()=>{preview=null;hooks.preview(null);$('photo-apply').disabled=true;}};
}
