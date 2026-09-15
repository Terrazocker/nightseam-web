const ROOT='file:///<workspace>/AstroPilot-local/';
const H=await import(ROOT+'core/horizon.js');
const V=await import(ROOT+'core/visibility.js');
const BINS=720;
const p={azOffset:0,altBottom:0,altTop:90,fov:360,paintMode:'obstacle',blockAbove:false,
  profile:new Array(BINS).fill(H.NO_BLOCK),profileTop:new Array(BINS).fill(H.NO_BLOCK)};
const y=H.rowOfAlt(p,30); const st=[];
for(let x=100;x<=500;x+=8) st.push({m:'b',x,y,r:28});   // default web brush, normal drag
p.strokes=st; H.computeProfile(p);
const before=p.profile.slice();
H.cropPano(p,{x:100,w:90},720);                          // crop 360 -> 45 deg (kept band 45 deg)
const inside=[]; for(let i=0;i<BINS;i++) if(H.fovBinRel(i,p.azOffset,p.fov)!==null) inside.push(i);
const lost=inside.filter(i=>p.profile[i]===H.NO_BLOCK && before[i]!==H.NO_BLOCK);
const az=lost[0]*0.5;
const cb=H.ceilFor({...p,profile:before},az), ca=H.ceilFor(p,az);
console.log('lost',lost.length,'of',inside.length,'in-frame bins; first hole az',az);
console.log('alt 30 BEFORE:',JSON.stringify(V.statusOf({alt:[30],ceil:[cb.ceil]},0,25)),'ceil',cb.ceil);
console.log('alt 30 AFTER :',JSON.stringify(V.statusOf({alt:[30],ceil:[ca.ceil]},0,25)),'ceil',ca.ceil);
