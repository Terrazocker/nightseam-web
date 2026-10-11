/* Geographic evidence UI and immutable orientation preview; geometry stays in core. */
import { normalizeCoverageEvidence } from './core.js?v=63';
export { previewPhotoOrientation as geographicAlignment } from './core.js?v=63';

export function geographicEvidenceHTML(){return `<details id="geographic-evidence"><summary>Coverage and capture evidence</summary>
  <label>Planning coverage <select id="geographic-policy"><option value="legacy">Keep this horizon's existing assumptions</option><option value="inferred-open">Infer open sky above the skyline</option><option value="strict-measured">Use only photographed coverage; exclude unknown sky</option></select></label>
  <p class="sub">Unknown means missing evidence, not a measured obstruction. Inferred openness above a skyline is an assumption. The current skyline model cannot describe every separate opening.</p>
  <p class="sub">Take the photo from the telescope's observing position and optical height. Moving changes the direction of nearby roofs and trees; calibration cannot remove that parallax. Coordinates alone do not establish accurate positioning.</p>
  <label>Observer latitude (optional, °) <input id="geographic-lat" type="number" min="-90" max="90" step="any"></label>
  <label>Observer longitude (optional, °) <input id="geographic-lon" type="number" min="-180" max="180" step="any"></label>
  <label>Optical height above local ground (optional, m) <input id="geographic-height" type="number" min="0" max="10000" step="any"></label>
  <label>Capture date / timestamp (optional, ISO) <input id="geographic-date" type="text" placeholder="2026-10-11 or 2026-10-11T20:00:00Z"></label>
  <button id="geographic-save" class="btn" type="button">Apply coverage evidence</button><p id="geographic-result" role="status"></p>
</details>`;}

export function wireGeographicEvidence(root,p,hooks){
  const $=id=>root.querySelector('#'+id);
  function sync(){const v=normalizeCoverageEvidence(p.coverageEvidence);$('geographic-policy').value=v.policy;
    for(const [id,value] of [['lat',v.observer?.lat],['lon',v.observer?.lon],['height',v.observer?.opticalHeight],['date',v.captureDate]])$('geographic-'+id).value=value??'';
  }
  const optional=id=>{const el=$('geographic-'+id);if(!el.value.trim())return null;if(!el.checkValidity())throw new Error('Enter valid observer coordinates and optical height.');return Number(el.value);};
  $('geographic-save').addEventListener('click',()=>{hooks.settle();try{
    const lat=optional('lat'),lon=optional('lon'),opticalHeight=optional('height');
    if((lat===null)!==(lon===null))throw new Error('Enter both observer coordinates, or leave both coordinates empty.');
    const value=normalizeCoverageEvidence({version:1,policy:$('geographic-policy').value,
      observer:lat===null&&opticalHeight===null?null:{lat,lon,opticalHeight},captureDate:$('geographic-date').value.trim()||null},true);
    p.coverageEvidence=value;hooks.changed();$('geographic-result').textContent='Coverage evidence applied. Save horizon to keep it. Unknown coverage is distinct from a measured obstruction.';
  }catch(err){$('geographic-result').textContent=err.message;}});
  sync();return {sync};
}
