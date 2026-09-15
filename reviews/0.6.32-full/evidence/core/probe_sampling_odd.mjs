const ROOT='file:///<workspace>/AstroPilot-local/';
const H=await import(ROOT+'core/horizon.js');
const BINS=720;
const p={azOffset:0,altBottom:0,altTop:90,fov:360,paintMode:'sky',blockAbove:true,
  profile:new Array(BINS).fill(0),profileTop:new Array(BINS).fill(90.5)};
p.profileTop[101]=40;
console.log('col101 az',101*0.5,'overhangRuns',JSON.stringify(H.overhangRuns(p,2)),
            'ceil(50.5)',JSON.stringify(H.ceilFor(p,50.5)),
            'ceil(51)',JSON.stringify(H.ceilFor(p,51)));
const row=H.rowOfAlt(p,40);
console.log('profile preview hatch would be col101 only');
