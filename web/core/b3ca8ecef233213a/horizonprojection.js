/* Pure source-ray projection and a fully photographed angular working view.
 * World axes and Euler order follow GPano: east, north, up; Rz(-H)Rx(P)Ry(R).
 * Rectilinear input is a corrected, centered, square-pixel pinhole image. */
const RAD=Math.PI/180, DEG=180/Math.PI;
const wrap=a=>((a%360)+360)%360;
const diff=(a,b)=>wrap(a-b+180)-180;
const valid=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
export const PHOTO_MAX_PIXELS=32000000;
export const PHOTO_WORKING_MAX_PIXELS=2000000;
export function photoFileDimensions(bytes){
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),view=new DataView(b.buffer,b.byteOffset,b.byteLength);
  let width,height,orientation=1;
  if(b.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)&&b[12]===73&&b[13]===72&&b[14]===68&&b[15]===82){width=view.getUint32(16);height=view.getUint32(20);}
  else if(b[0]===255&&b[1]===216){
    let i=2;
    while(i+4<=b.length){if(b[i++]!==255)break;while(b[i]===255)i++;const marker=b[i++];
      if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;
      if(i+2>b.length)break;const length=view.getUint16(i);if(length<2||i+length>b.length)break;
      if(marker===225&&length>=16&&[69,120,105,102,0,0].every((v,k)=>b[i+2+k]===v)){
        const base=i+8,le=b[base]===73&&b[base+1]===73;
        if((le||b[base]===77&&b[base+1]===77)&&view.getUint16(base+2,le)===42){
          const ifd=base+view.getUint32(base+4,le),end=i+length;
          if(ifd>=base&&ifd+2<=end){const count=view.getUint16(ifd,le);
            for(let n=0;n<Math.min(count,256);n++){const at=ifd+2+n*12;if(at+12>end)break;
              if(view.getUint16(at,le)===274&&view.getUint16(at+2,le)===3&&view.getUint32(at+4,le)===1)orientation=view.getUint16(at+8,le);}
          }
        }
      }
      if(marker>=192&&marker<=207&&![196,200,204].includes(marker)&&length>=7){height=view.getUint16(i+3);width=view.getUint16(i+5);}i+=length;
    }
  }
  if([5,6,7,8].includes(orientation))[width,height]=[height,width];
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width*height>PHOTO_MAX_PIXELS)
    throw new Error('Use a JPEG or PNG with valid dimensions up to 32 million pixels. Image headers must fit within the first 1 MB.');
  return {width,height};
}
export function normalizePhotoSource(value,strict=false){
  if(value==null)return null;
  const fail=()=>{if(strict)throw new Error('Invalid original photo metadata');return null;};
  if(!value||!Number.isInteger(value.width)||!Number.isInteger(value.height)||value.width<2||value.height<2||value.width*value.height>PHOTO_MAX_PIXELS)return fail();
  const d=value.metadata??{status:'missing',reason:'No supported panorama metadata detected.'};
  if(!['missing','invalid','detected'].includes(d.status)||typeof d.reason!=='string'||d.reason.length>512)return fail();
  let input;
  if(d.status==='detected'){
    try{const model=createPhotoModel(d.input);if(model.width!==value.width||model.height!==value.height)return fail();const {working,...source}=model;input=source;}
    catch{return fail();}
  }
  return {width:value.width,height:value.height,metadata:{status:d.status,reason:d.reason,...input?{input}:{}}};
}
export function normalizePhotoModel(v,strict=false){
  if(v==null)return null;
  const fail=()=>{if(strict)throw new Error('Invalid photo projection geometry');return null;};
  if(!v||v.version!==1||!['equirectangular','cylindrical','rectilinear'].includes(v.type)
    ||!Number.isInteger(v.width)||!Number.isInteger(v.height)||v.width<2||v.height<2
    ||v.width*v.height>PHOTO_MAX_PIXELS||!valid(v.hfov,5,v.type==='rectilinear'?150:360)
    ||!valid(v.heading,0,360)||!valid(v.pitch,-80,80)||!valid(v.roll,-180,180)
    ||!valid(v.lonCenter,-180,180)||!valid(v.top,-89.9,90)||!valid(v.bottom,-90,89.9)
    ||v.top-v.bottom<5|| (v.type==='cylindrical'&&(v.top>=89.9||v.bottom<=-89.9))
    ||(v.type==='rectilinear'&&v.lensCorrected!==true))return fail();
  const w=v.working;
  if(!w||!valid(w.offset,0,360)||!valid(w.fov,5,360)||!valid(w.bottom,-30,85)
    ||!valid(w.top,w.bottom+5,90))return fail();
  const out={version:1,type:v.type,width:v.width,height:v.height,hfov:v.hfov,
    heading:v.heading,pitch:v.pitch,roll:v.roll,lonCenter:v.lonCenter,top:v.top,bottom:v.bottom,
    lensCorrected:v.type==='rectilinear',working:{offset:w.offset,fov:w.fov,bottom:w.bottom,top:w.top}};
  if(!photoRectangleCovered(out,out.working))return fail();
  return out;
}
function rotate(v,m,inverse=false){
  // Explicit orthonormal matrix columns make inverse exactly its transpose.
  const h=m.heading*RAD,p=m.pitch*RAD,r=m.roll*RAD;
  const ch=Math.cos(h),sh=Math.sin(h),cp=Math.cos(p),sp=Math.sin(p),cr=Math.cos(r),sr=Math.sin(r);
  const cols=[[ch*cr+sh*sp*sr,-sh*cr+ch*sp*sr,-cp*sr],
    [sh*cp,ch*cp,sp],[ch*sr-sh*sp*cr,-sh*sr-ch*sp*cr,cp*cr]];
  return inverse?cols.map(c=>c.reduce((s,x,i)=>s+x*v[i],0)):
    [0,1,2].map(i=>cols.reduce((s,c,k)=>s+c[i]*v[k],0));
}
const ray=(az,alt)=>[Math.sin(az*RAD)*Math.cos(alt*RAD),Math.cos(az*RAD)*Math.cos(alt*RAD),Math.sin(alt*RAD)];
const angles=v=>({azimuth:wrap(Math.atan2(v[0],v[1])*DEG),altitude:Math.atan2(v[2],Math.hypot(v[0],v[1]))*DEG});
/** Unit ENU ray; pole bearings are harmless because the vector remains finite. */
export function photoDirectionVector(azimuth,altitude){return ray(azimuth,altitude);}
/** Stable spherical distance, including nearly identical and antipodal rays. */
export function photoAngularDistance(a,b){
  const cross=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  return Math.atan2(Math.hypot(...cross),a.reduce((sum,v,i)=>sum+v*b[i],0))*DEG;
}
/** Original source coordinates map to rays before the pose rotation. */
export function sourcePhotoRay(m,x,y){
  const a=sourcePhotoAngles({...m,heading:0,pitch:0,roll:0},x,y);
  return photoDirectionVector(a.azimuth,a.altitude);
}
export function sourcePhotoAngles(m,x,y){
  let v;
  if(m.type==='rectilinear'){
    const scale=2*Math.tan(m.hfov*RAD/2);
    v=[(x-.5)*scale,1,(.5-y)*scale*m.height/m.width];
    const n=Math.hypot(...v);v=v.map(t=>t/n);
  }else{
    const lon=m.lonCenter+(x-.5)*m.hfov;
    const alt=m.type==='cylindrical'?Math.atan((1-y)*Math.tan(m.top*RAD)+y*Math.tan(m.bottom*RAD))*DEG:m.top-y*(m.top-m.bottom);
    v=ray(lon,alt);
  }
  return angles(rotate(v,m));
}
export function anglesSourcePhoto(m,az,alt){
  const v=rotate(ray(az,alt),m,true);let x,y;
  if(m.type==='rectilinear'){
    const scale=2*Math.tan(m.hfov*RAD/2);
    x=.5+v[0]/v[1]/scale;y=.5-v[2]/v[1]/scale*m.width/m.height;
    if(v[1]<=0)return {x,y,inside:false};
  }else{
    const q=angles(v),lon=diff(q.azimuth,m.lonCenter);
    x=.5+lon/m.hfov;
    y=m.type==='cylindrical'?(Math.tan(m.top*RAD)-Math.tan(q.altitude*RAD))/(Math.tan(m.top*RAD)-Math.tan(m.bottom*RAD)):
      (m.top-q.altitude)/(m.top-m.bottom);
  }
  return {x,y,inside:Number.isFinite(x)&&Number.isFinite(y)&&x>=-1e-8&&x<=1+1e-8&&y>=-1e-8&&y<=1+1e-8};
}
// Exact extrema of a dot product on an angular rectangle, including interior
// stationary directions. This proves coverage; corner sampling alone cannot.
function dotMinimum(v,b){
  const a0=b.offset*RAD,a1=(b.offset+b.fov)*RAD;
  const aa=[a0,a1],critical=Math.atan2(v[0],v[1])+Math.PI;
  for(let k=-2;k<=3;k++){const a=critical+k*2*Math.PI;if(a>=a0&&a<=a1)aa.push(a);}
  const horizontal=Math.min(...aa.map(a=>v[0]*Math.sin(a)+v[1]*Math.cos(a)));
  const lo=b.bottom*RAD,hi=b.top*RAD,alts=[lo,hi],c=Math.atan2(v[2],horizontal)+Math.PI;
  for(let k=-1;k<=1;k++){const a=c+k*2*Math.PI;if(a>=lo&&a<=hi)alts.push(a);}
  return Math.min(...alts.map(a=>horizontal*Math.cos(a)+v[2]*Math.sin(a)));
}
export function photoRectangleCovered(m,b){
  const plane=v=>dotMinimum(rotate(v,m),b)>=-1e-10;
  if(m.type==='rectilinear'){
    const x=Math.tan(m.hfov*RAD/2),z=x*m.height/m.width;
    return [[1,x,0],[-1,x,0],[0,z,1],[0,z,-1],[0,1,0]].every(plane);
  }
  const up=rotate([0,0,1],m);
  if(dotMinimum(up,b)<Math.sin(m.bottom*RAD)-1e-10||-dotMinimum(up.map(v=>-v),b)>Math.sin(m.top*RAD)+1e-10)return false;
  if(m.hfov>=360-1e-8)return true;
  if(m.hfov>180){
    // A wide nonconvex horizontal crop needs more than two halfspaces. Support
    // its exact level case, and ask for a narrower input when tilted.
    return Math.abs(m.pitch)<1e-9&&Math.abs(m.roll)<1e-9&&
      Math.abs(diff(b.offset+b.fov/2,m.heading+m.lonCenter))+b.fov/2<=m.hfov/2+1e-8;
  }
  const lo=(m.lonCenter-m.hfov/2)*RAD,hi=(m.lonCenter+m.hfov/2)*RAD;
  return plane([Math.cos(lo),-Math.sin(lo),0])&&plane([-Math.cos(hi),Math.sin(hi),0]);
}
export function createPhotoModel(input){
  const m={version:1,lonCenter:0,heading:0,pitch:0,roll:0,top:60,bottom:0,...input};
  // Validate source independently before any trigonometry or pixel allocation.
  const provisional={...m,working:{offset:0,fov:5,bottom:0,top:5}};
  // Source validation is shared by final normalization; temporarily use a
  // guaranteed source-center rectangle only after explicit scalar validation.
  if(!['equirectangular','cylindrical','rectilinear'].includes(m.type)||!Number.isInteger(m.width)||!Number.isInteger(m.height)
    ||m.width<2||m.height<2||m.width*m.height>PHOTO_MAX_PIXELS||!valid(m.hfov,5,m.type==='rectilinear'?150:360)
    ||!valid(m.heading,0,360)||!valid(m.pitch,-80,80)||!valid(m.roll,-180,180)||!valid(m.lonCenter,-180,180)
    ||!valid(m.top,-89.9,90)||!valid(m.bottom,-90,89.9)||m.top-m.bottom<5
    ||(m.type==='cylindrical'&&(m.top>=89.9||m.bottom<=-89.9))||m.type==='rectilinear'&&m.lensCorrected!==true)
    throw new Error('Enter valid photo dimensions, coverage and orientation. Ordinary photos must have lens distortion corrected.');
  if(m.type!=='rectilinear'&&m.hfov>180&&m.hfov<360&&(Math.abs(m.pitch)>1e-9||Math.abs(m.roll)>1e-9))
    throw new Error('For a tilted panorama wider than 180°, use a full 360° source or a narrower source crop.');
  // Cylindrical pixel midpoint is not the midpoint of its angular extent.
  const angularMidY=m.type==='cylindrical'?(Math.tan(m.top*RAD)-Math.tan((m.top+m.bottom)*RAD/2))/(Math.tan(m.top*RAD)-Math.tan(m.bottom*RAD)):.5;
  const center=sourcePhotoAngles(m,.5,angularMidY);
  const span=m.type==='rectilinear'?2*Math.atan(Math.tan(m.hfov*RAD/2)*m.height/m.width)*DEG:m.top-m.bottom;
  const bottom=Math.max(-30,center.altitude-span/2),top=Math.min(90,center.altitude+span/2);
  const box=s=>({offset:wrap(center.azimuth-m.hfov*s/2),fov:m.hfov*s,
    bottom:center.altitude+(bottom-center.altitude)*s,top:center.altitude+(top-center.altitude)*s});
  let lo=0,hi=1;
  if(photoRectangleCovered(m,box(1)))lo=1;
  else for(let i=0;i<45;i++){const mid=(lo+hi)/2;if(photoRectangleCovered(m,box(mid)))lo=mid;else hi=mid;}
  provisional.working=box(lo===1?1:lo*.999999);
  try{return normalizePhotoModel(provisional,true);}catch{throw new Error('No fully photographed angular view at least 5° wide and high remains. Review orientation or use a wider photo.');}
}
export function sourceWorkingPoint(m,point){
  const q=sourcePhotoAngles(m,point.x,point.y),w=m.working;
  let x=.5+diff(q.azimuth,w.offset+w.fov/2)/w.fov;
  if(w.fov>=360-1e-8&&point.x>.5&&Math.abs(x)<1e-9)x=1;
  return {x,y:(w.top-q.altitude)/(w.top-w.bottom)};
}
export function workingSourcePoint(m,x,y){const w=m.working;return anglesSourcePhoto(m,w.offset+x*w.fov,w.top-y*(w.top-w.bottom));}
export function workingPhotoSize(m){
  const a=m.working.fov,b=m.working.top-m.working.bottom;
  const s=Math.min(2400/a,2400/b,Math.sqrt(PHOTO_WORKING_MAX_PIXELS/(a*b)));
  return {width:Math.max(2,Math.floor(a*s)),height:Math.max(2,Math.floor(b*s))};
}
export function photoSampleMap(m,width,height){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width*height>PHOTO_WORKING_MAX_PIXELS)
    throw new Error('Angular preview exceeds the working pixel limit');
  const axes=[[1,0,0],[0,1,0],[0,0,1]].map(v=>rotate(v,m)),w=m.working;
  const sx=new Float64Array(width),cx=new Float64Array(width),out=new Float32Array(width*height*2);
  for(let x=0;x<width;x++){const a=(w.offset+x/(width-1)*w.fov)*RAD;sx[x]=Math.sin(a);cx[x]=Math.cos(a);}
  const scale=2*Math.tan(m.hfov*RAD/2),tt=Math.tan(m.top*RAD),tb=Math.tan(m.bottom*RAD);
  for(let y=0;y<height;y++){
    const alt=(w.top-y/(height-1)*(w.top-w.bottom))*RAD,ca=Math.cos(alt),sa=Math.sin(alt);
    for(let x=0;x<width;x++){
      const east=sx[x]*ca,north=cx[x]*ca;
      const u=axes[0][0]*east+axes[0][1]*north+axes[0][2]*sa;
      const v=axes[1][0]*east+axes[1][1]*north+axes[1][2]*sa;
      const z=axes[2][0]*east+axes[2][1]*north+axes[2][2]*sa;
      const i=(y*width+x)*2;
      if(m.type==='rectilinear'){out[i]=.5+u/v/scale;out[i+1]=.5-z/v/scale*m.width/m.height;}
      else {out[i]=.5+diff(Math.atan2(u,v)*DEG,m.lonCenter)/m.hfov;
        const latitude=Math.atan2(z,Math.hypot(u,v));
        out[i+1]=m.type==='cylindrical'?(tt-Math.tan(latitude))/(tt-tb):(m.top-latitude*DEG)/(m.top-m.bottom);}
    }
  }
  return out;
}

/** Bounded GPano XMP extraction. No XML evaluation or external references.
 * Stale/scaled metadata is a review warning, never silently accepted. */
export function readPanoramaMetadata(bytes,width,height){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width*height>PHOTO_MAX_PIXELS)return {status:'invalid',reason:'Photo exceeds the decoded pixel limit.'};
  const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  const text=new TextDecoder().decode(data.subarray(0,Math.min(data.length,1048576)));
  if(!text.includes('http://ns.google.com/photos/1.0/panorama/'))return {status:'missing',reason:'No supported panorama metadata detected.'};
  const get=key=>{
    const escaped='GPano:'+key;
    const matches=[...text.matchAll(new RegExp(escaped+'\\s*=\\s*["\u0027]([^"\u0027]*)["\u0027]|<'+escaped+'\\s*>([^<]*)</'+escaped+'>','g'))].map(m=>(m[1]??m[2]).trim());
    if(!matches.length)return null;if(new Set(matches).size!==1)return 'invalid';return matches[0];
  };
  const num=k=>{const s=get(k);return s!==null&&/^-?\d+(?:\.\d+)?$/.test(s)?Number(s):NaN;};
  const fw=num('FullPanoWidthPixels'),fh=num('FullPanoHeightPixels'),cw=num('CroppedAreaImageWidthPixels'),ch=num('CroppedAreaImageHeightPixels'),left=num('CroppedAreaLeftPixels'),top=num('CroppedAreaTopPixels');
  if(get('ProjectionType')!=='equirectangular'||![fw,fh,cw,ch,left,top].every(Number.isInteger)||fw<2||fh<2||fw!==fh*2||cw!==width||ch!==height||left<0||top<0||left+cw>fw||top+ch>fh)
    return {status:'invalid',reason:'Panorama metadata dimensions or crop do not match this photo. Enter the geometry manually.'};
  const heading=num('PoseHeadingDegrees'),pitch=get('PosePitchDegrees')===null?0:num('PosePitchDegrees'),roll=get('PoseRollDegrees')===null?0:num('PoseRollDegrees');
  if(!valid(heading,0,359.999999)||!valid(pitch,-80,80)||!valid(roll,-180,180))return {status:'invalid',reason:'Panorama orientation is missing or unsupported. Review it manually.'};
  return {status:'detected',reason:'Angular panorama metadata detected; review before conversion.',input:{type:'equirectangular',width,height,
    hfov:cw/fw*360,lonCenter:(left+cw/2)/fw*360-180,top:90-top/fh*180,bottom:90-(top+ch)/fh*180,heading,pitch,roll}};
}
