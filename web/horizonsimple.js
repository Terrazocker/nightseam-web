/* Image-first setup UI. All calibration math and evidence validation live in core. */
import { normalizePhotoCalibration, photoPoint, photoPointAngles, fitPhotoReferences, fitMultiplePhotoReferences,photoCalibrationReport } from './core.js?v=65';
import { geographicAlignment } from './horizongeographic.js?v=7';

const pointHTML = (key, title) => `<fieldset class="setup-point"><legend>${title}</legend>
  <button class="btn primary" type="button" data-simple-pick="${key}">Choose point on photo</button>
  <label>True bearing (°) <input id="simple-${key}-azimuth" type="number" min="0" max="360" step="any"></label>
  <div class="btnrow" aria-label="Direction shortcuts">${[['North',0],['East',90],['South',180],['West',270]].map(([name, angle]) => `<button class="btn small" type="button" data-direction="${key}:${angle}">${name}</button>`).join('')}</div>
  <label>Height angle above horizontal (°) <input id="simple-${key}-altitude" type="number" min="-90" max="90" step="any"></label>
  <details><summary>Enter photo position with keyboard</summary><label>From left (%) <input id="simple-${key}-x" type="number" min="0" max="100" step="any"></label>
  <label>From top (%) <input id="simple-${key}-y" type="number" min="0" max="100" step="any"></label></details>
  <details><summary>Optional measurement evidence</summary>
    <label>Measurement source <input id="simple-${key}-source" type="text" maxlength="96" placeholder="Survey, star, corrected compass…"></label>
    <label>Estimated angular error (°, optional) <input id="simple-${key}-sigmaDegrees" type="number" min="0.001" max="30" step="any"></label>
    <label>Measurement time (ISO, optional) <input id="simple-${key}-captureTime" type="text" placeholder="2026-10-11T20:00:00Z"></label>
    <label>Shared measurement method / group <input id="simple-${key}-measurementGroup" type="text" maxlength="96" placeholder="Same compass readings"></label>
    <label>Exclusion reason (if excluded) <input id="simple-${key}-exclusionReason" type="text" maxlength="320"></label>
    <p class="sub">Use true north and altitude angles above horizontal. A separate feature is held out of fitting; measurements from the same biased method are not independent. Astronomical references must match the app's apparent-altitude convention and capture time.</p>
  </details></fieldset>`;

export function simpleSetupHTML() {
  return `<div id="simple-flow" hidden>
    <p class="sub">Confirm photo geometry → Align or check → Draw skyline → Save</p>
    <div class="btnrow"><button id="simple-geometry-open" class="btn" type="button">Confirm photo geometry</button><button id="simple-known-review" class="btn" type="button" hidden>Review confirmed geometry without fitting</button><button id="simple-orientation-start" class="btn" type="button" hidden>Align from known features</button></div>
    <section data-simple-pane="0"><h5>1. Mark the first known point</h5>
      <p class="sub">Choose a recognizable feature. Enter its direction from true north and its height angle in degrees, not metres.</p>
      ${pointHTML('first', 'Point 1')}
      <details id="simple-photo-options"><summary>Photo type / coverage</summary>
        <label>Photo type <select id="simple-projection"><option value="unknown">Not sure — approximate</option><option value="equirectangular">Level angular panorama (equirectangular)</option><option value="other">Ordinary photo / other panorama — approximate</option></select></label>
        <label><input id="simple-full360" type="checkbox"> I know the original photo covers a full 360°</label>
        <p class="sub">Only level, upright angular panoramas have a uniform angle scale in both axes. Other photo types remain approximate. A wide image alone does not establish coverage.</p>
      </details><button id="simple-approximate" class="btn" type="button">Draw with approximate angles for now</button></section>
    <section data-simple-pane="1" hidden><h5>2. Mark another known point</h5><p id="simple-separation" class="sub">Choose a feature well apart from the first, both across the photo and in height.</p>${pointHTML('second', 'Point 2')}</section>
    <section data-simple-pane="2" hidden><h5>3. Review alignment</h5>
      <p id="simple-preview" role="status"></p><button id="simple-apply" class="btn primary" type="button">Use this alignment</button>
      <div class="btnrow"><button id="simple-check-open" class="btn" type="button">Check another point</button><button id="simple-draw" class="btn primary" type="button">Continue to drawing</button></div>
      <p class="sub">A separate check is optional. A fit to the two input points does not establish accuracy elsewhere in the photo.</p></section>
    <section data-simple-pane="3" hidden><h5>Optional: check another feature</h5>${pointHTML('check', 'Separate check point')}
      <button id="simple-check-apply" class="btn" type="button">Check angles</button><p id="simple-check-result" role="status"></p>
      <button id="simple-check-draw" class="btn primary" type="button">Continue to drawing</button></section>
    <details id="simple-more-points"><summary>More fitting points / separate checks</summary>
      <p class="sub">Add well-spread fitting points to reveal conflicting measurements. Separate checks never change the fit. Exclude a suspect fitting point explicitly; it remains recorded. Checks only test their local features.</p>
      <label>Point role <select id="simple-extra-role"><option value="fit">Fitting reference</option><option value="check">Held-out check</option></select></label>
      <label><input id="simple-robust" type="checkbox"> Reduce the influence of conflicting fitting measurements (shown in the report)</label>
      <label><input id="simple-estimate-fov" type="checkbox"> Estimate unknown ordinary-photo width (requires at least four fitting and two held-out points)</label>
      ${pointHTML('extra','Additional point')}
      <button id="simple-extra-add" class="btn" type="button">Add point</button>
      <div id="simple-extra-list"></div><p id="simple-extra-result" role="status"></p>
    </details>
    <p id="simple-message" role="alert"></p>
    <div class="btnrow"><button id="simple-back" class="btn" type="button">Back</button><button id="simple-next" class="btn primary" type="button">Next</button><button id="simple-cancel" class="btn" type="button">Cancel setup</button></div>
    <details><summary>Advanced reference setup</summary><p class="sub">Use separate coverage, direction and height references, or review an older calibration.</p><button id="setup-legacy-open" class="btn" type="button">Open advanced setup</button></details>
  </div>
  <p id="simple-finish" class="sub" hidden>Click along the skyline; drag points to adjust. Save horizon keeps your changes in this browser.</p>`;
}

export function wireSimpleSetup(root, p, ui, hooks) {
  const $ = id => root.querySelector('#' + id);
  const keys = ['first', 'second', 'check','extra'], fields = ['x','y','azimuth','altitude'];
  const evidenceFields=['source','sigmaDegrees','captureTime','measurementGroup','exclusionReason'];
  ui.simpleDraft ??= {};
  const drafts = ui.simpleDraft;
  let picking = null, dragging = null, preview = null;
  const invalidatePreview=()=>{preview=null;hooks.previewGeometry?.(null);};
  const message = text => { $('simple-message').textContent = text; };
  const active = () => ui.setupStep !== 4 && !ui.legacySetup;
  function sync() {
    const e = normalizePhotoCalibration(p.calibration);
    const points = [e.references?.[0], e.references?.[1], e.checks?.[0]??e.check];
    drafts.extraRefs=structuredClone(e.references?.slice(2)??[]);
    drafts.exclusions=(e.references??[]).slice(0,2).map(v=>!!v.excluded);
    drafts.extraChecks=structuredClone(e.version>=4?e.checks:e.check?[e.check]:[]);
    drafts.knownGeometry=e.version===5&&e.mode==='known-geometry';
    drafts.robust=e.version===5&&e.options.robust;
    drafts.estimateFov=e.version===5&&e.options.estimateFov;
    keys.forEach((key,i) => {
      const v = points[i], q = v ? photoPointAngles(p,v) : null;
      fields.forEach(k => { drafts[`${key}-${k}`] = k === 'x' ? q?.x * 100 ?? '' : k === 'y' ? q?.y * 100 ?? '' : v?.[k] ?? ''; });
      evidenceFields.forEach(k=>{drafts[`${key}-${k}`]=v?.[k]??'';});
    });
    drafts.projection = p.photoModel?'equirectangular':e.projection; drafts.full360 = e.version >= 2 ? e.full360 : false;
    restoreInputs(); invalidatePreview();
  }
  function restoreInputs() {
    keys.forEach(key => fields.forEach(k => { $(`simple-${key}-${k}`).value = String(drafts[`${key}-${k}`] ?? ''); }));
    keys.forEach(key=>evidenceFields.forEach(k=>{$(`simple-${key}-${k}`).value=String(drafts[`${key}-${k}`]??'');}));
    $('simple-robust').checked=!!drafts.robust;$('simple-estimate-fov').checked=!!drafts.estimateFov;
    $('simple-projection').value = drafts.projection ?? 'unknown'; $('simple-full360').checked = !!drafts.full360;
  }
  const number = id => {
    const el = $('simple-' + id);
    if (!el.value.trim() || !el.checkValidity()) throw new Error('Choose the photo point and enter its bearing and height angle.');
    return Number(el.value);
  };
  const reference = key => {
    const e=normalizePhotoCalibration(p.calibration),index=['first','second'].indexOf(key),saved=e.version>=4&&index>=0?e.references[index]:null;
    const q=saved?photoPointAngles(p,saved):null;
    // Unchanged v4 source positions remain usable after a crop hides them.
    const retained=q&&Math.abs(Number($(`simple-${key}-x`).value)-q.x*100)<1e-7&&Math.abs(Number($(`simple-${key}-y`).value)-q.y*100)<1e-7;
    const metadata={};
    for(const k of evidenceFields){const el=$(`simple-${key}-${k}`);if(!el.value.trim())continue;
      if(!el.checkValidity())throw new Error('Enter valid optional measurement evidence.');
      metadata[k]=k==='sigmaDegrees'?Number(el.value):el.value.trim();}
    return {...retained?{x:saved.x,y:saved.y}:photoPoint(p,number(key+'-x')/100,number(key+'-y')/100),
      azimuth:number(key+'-azimuth'),altitude:number(key+'-altitude'),...metadata};
  };
  const references=()=>drafts.knownGeometry?[]:[reference('first'),reference('second')].map((v,i)=>({...v,excluded:!!drafts.exclusions?.[i]})).concat(drafts.extraRefs??[]);
  const calculate = () => {
    if(p.photoModel)return geographicAlignment(p,references(),{checks:drafts.extraChecks??[],
      robust:!!drafts.robust,estimateFov:!!drafts.estimateFov,knownGeometry:!!drafts.knownGeometry});
    const options={projection:$('simple-projection').value,full360:$('simple-full360').checked};
    if(p.photoModel||drafts.extraRefs?.length||drafts.exclusions?.some(Boolean)||normalizePhotoCalibration(p.calibration).version===4||drafts.extraChecks?.length>1)
      return fitMultiplePhotoReferences(p,references(),{...options,checks:drafts.extraChecks??[]});
    return fitPhotoReferences(p,[reference('first'),reference('second')],options);
  };
  const diagnostics = report => {
    const errors = report.fitResiduals.map((v,i) => `point ${i+1}${v.excluded?' (excluded)':''}: ${v.azimuth>=0?'+':''}${v.azimuth.toFixed(2)}° bearing, ${v.altitude>=0?'+':''}${v.altitude.toFixed(2)}° height${Number.isFinite(v.angular)?`, ${v.angular.toFixed(2)}° directional error`:''}${Number.isFinite(v.influence)&&v.influence<.999?`, ${(v.influence*100).toFixed(0)}% fitting influence`:''}`).join('; ');
    const s = report.edgeSensitivity;
    const sensitivity = s && Math.max(s.azimuth,s.altitude) > 3
      ? ` Points are close together: entered angle errors can grow up to ${s.azimuth.toFixed(1)}× in bearing and ${s.altitude.toFixed(1)}× in height at photo edges. Choose wider-spaced points.` : '';
    const angular=Number.isFinite(report.rmsAngular)?` Angular RMS ${report.rmsAngular.toFixed(2)}°; maximum ${report.maxAngular.toFixed(2)}°.`:'';
    return `${errors ? ' Fit differences — '+errors+'.' : ''}${angular}${sensitivity}`;
  };
  function review() {
    try {
      preview = calculate();
      const report = photoCalibrationReport({ ...p, ...preview });
      $('simple-preview').textContent = `Preview: ${preview.fov.toFixed(1)}° wide · height ${preview.altBottom.toFixed(1)}° to ${preview.altTop.toFixed(1)}°. ${report.reason}${diagnostics(report)} This preview has not changed the live plan.`;
      $('simple-apply').disabled = false;
      if(preview.photoModel)hooks.previewGeometry?.(preview.photoModel);
    } catch (err) { invalidatePreview(); hooks.previewGeometry?.(null);$('simple-preview').textContent = err.message; $('simple-apply').disabled = true; }
    hooks.redraw();
  }
  function cancelPick() { picking = null; dragging = null; root.querySelectorAll('[data-simple-pick]').forEach(b => b.setAttribute('aria-pressed','false')); hooks.redraw(); }
  function render() {
    root.closest('.horizon-layout')?.classList.toggle('horizon-setting-up',active());
    $('simple-flow').hidden = !active(); $('simple-finish').hidden = ui.setupStep !== 4;
    root.querySelectorAll('[data-simple-pane]').forEach(pane => { pane.hidden = !active() || Number(pane.dataset.simplePane) !== ui.setupStep; });
    $('simple-next').hidden = ui.setupStep >= 2; $('simple-back').disabled = ui.setupStep === 0;
    $('simple-more-points').hidden=ui.setupStep<2;
    $('simple-known-review').hidden=!p.photoModel;
    $('simple-orientation-start').hidden=!p.photoModel;
    $('simple-separation').textContent=p.photoModel?'Choose a different direction well apart from the first. Known photo geometry allows references at the same height.':'Choose a feature well apart from the first, both across the photo and in height.';
    $('simple-robust').disabled=!p.photoModel||!!drafts.knownGeometry;
    $('simple-estimate-fov').disabled=p.photoModel?.type!=='rectilinear'||!!drafts.knownGeometry;
    $('simple-extra-role').querySelector('[value="fit"]').disabled=!!drafts.knownGeometry;
    if(drafts.knownGeometry)$('simple-extra-role').value='check';
    renderExtraList();
    const e = normalizePhotoCalibration(p.calibration);
    const fitted = e.version >= 2 && ['aligned','checked'].includes(photoCalibrationReport(p).status);
    // Approximate projections are allowed to continue after explicitly applying a complete fit.
    let geometryMatches = false;
    try { const expected = calculate(); geometryMatches = ['fov','azOffset','altTop','altBottom'].every(k => Math.abs(p[k]-expected[k])<1e-6)
      &&(!expected.photoModel||JSON.stringify(expected.photoModel)===JSON.stringify(p.photoModel)); } catch { /* Incomplete inputs cannot enable continuation. */ }
    let wanted=[];try{wanted=references();}catch{/* incomplete */}
    const applied = geometryMatches && e.version >= 2 && e.references.length===wanted.length&&e.references.every((v,i) =>
      fields.every(k => Math.abs(v[k] - wanted[i][k]) < 1e-9)&&!!v.excluded===!!wanted[i].excluded)
      &&e.references.every((v,i)=>evidenceFields.every(k=>(v[k]??'')===(wanted[i][k]??'')))
      &&(e.version===5?e.mode===(drafts.knownGeometry?'known-geometry':'orientation')&&e.options.robust===!!drafts.robust&&e.options.estimateFov===!!drafts.estimateFov
        :e.projection === $('simple-projection').value && e.full360 === $('simple-full360').checked);
    $('simple-draw').disabled = !applied; $('simple-check-open').disabled = !applied;
    $('simple-check-draw').disabled = !applied;
    $('simple-cancel').textContent = applied ? 'Close setup' : 'Cancel setup';
    if (ui.setupStep === 2 && applied) {
      const report = photoCalibrationReport(p);
      $('simple-preview').textContent = `Applied: ${p.fov.toFixed(1)}° wide · height ${p.altBottom.toFixed(1)}° to ${p.altTop.toFixed(1)}°. ${report.reason}${diagnostics(report)} Save horizon to keep this alignment.`;
      $('simple-apply').disabled = true;
    }
    $('simple-finish').dataset.aligned = String(fitted);
  }
  function step(value) {
    hooks.settle(); cancelPick(); ui.legacySetup = false; ui.setupStep = value; message('');
    if(value!==2)hooks.previewGeometry?.(null);
    if (value === 2) review();
    hooks.render(); render();
    if (value === 4) { hooks.drawing(); hooks.focusCanvas(); }
    else root.querySelector(`[data-simple-pane="${value}"] button`)?.focus();
  }
  function useAlignment() {
    hooks.settle();
    try { const result = calculate(); if(result.photoModel)hooks.prepareGeometry?.(result.photoModel);
      Object.assign(p, result); invalidatePreview(); hooks.changed(); if(result.photoModel)sync();message('Alignment applied. Save horizon to keep it.'); render(); }
    catch (err) { message(err.message); }
  }
  const update = (key,x,y) => {
    for (const [k,v] of [['x',x*100],['y',y*100]]) {
      drafts[`${key}-${k}`] = +v.toFixed(6); $(`simple-${key}-${k}`).value = String(drafts[`${key}-${k}`]);
    }
    invalidatePreview(); hooks.redraw(); render();
  };
  keys.forEach(key => fields.forEach(k => $(`simple-${key}-${k}`).addEventListener('input', ev => {
    drafts[`${key}-${k}`] = ev.target.value; if(['first','second'].includes(key))drafts.knownGeometry=false;invalidatePreview(); hooks.redraw(); render();
  })));
  keys.forEach(key=>evidenceFields.forEach(k=>$(`simple-${key}-${k}`).addEventListener('input',ev=>{drafts[`${key}-${k}`]=ev.target.value;invalidatePreview();render();})));
  for(const [id,k] of [['simple-robust','robust'],['simple-estimate-fov','estimateFov']])$(id).addEventListener('change',ev=>{drafts[k]=ev.target.checked;review();render();});
  $('simple-geometry-open').addEventListener('click',()=>{const pane=root.querySelector('#photo-conversion');pane.open=true;pane.scrollIntoView({block:'nearest'});root.querySelector('#photo-type')?.focus();});
  $('simple-known-review').addEventListener('click',()=>{sync();drafts.knownGeometry=true;drafts.robust=false;drafts.estimateFov=false;step(2);});
  $('simple-orientation-start').addEventListener('click',()=>{sync();drafts.knownGeometry=false;step(0);});
  $('simple-projection').addEventListener('change', ev => { drafts.projection = ev.target.value; invalidatePreview(); render(); hooks.redraw(); });
  $('simple-full360').addEventListener('change', ev => { drafts.full360 = ev.target.checked; invalidatePreview(); render(); hooks.redraw(); });
  root.querySelectorAll('[data-direction]').forEach(b => b.addEventListener('click', () => {
    const [key,value] = b.dataset.direction.split(':'); $(`simple-${key}-azimuth`).value = value; drafts[key+'-azimuth'] = value; invalidatePreview(); render(); hooks.redraw();
  }));
  root.querySelectorAll('[data-simple-pick]').forEach(b => b.addEventListener('click', () => {
    hooks.settle(); hooks.cancelLegacyPick(); cancelPick(); picking = b.dataset.simplePick;
    b.setAttribute('aria-pressed','true'); message('Click the feature on the photo. You can drag its marker to adjust it.'); hooks.focusCanvas();
  }));
  $('simple-next').addEventListener('click', () => {
    try { reference(ui.setupStep === 0 ? 'first' : 'second'); step(ui.setupStep + 1); } catch (err) { message(err.message); }
  });
  $('simple-back').addEventListener('click', () => step(Math.max(0,ui.setupStep-1)));
  $('simple-apply').addEventListener('click', useAlignment);
  $('simple-check-open').addEventListener('click', () => step(3));
  for (const id of ['simple-draw','simple-check-draw']) $(id).addEventListener('click', () => step(4));
  $('simple-check-apply').addEventListener('click', () => {
    hooks.settle();
    try {
      const e = normalizePhotoCalibration(p.calibration,true);
      if (e.version < 2) throw new Error('Apply the two-point alignment first.');
      e.check = reference('check');
      if(e.version>=4)e.checks=[e.check,...e.checks.slice(1)];
      const valid=normalizePhotoCalibration(e,true);
      p.calibration=valid;drafts.extraChecks=structuredClone(valid.version>=4?valid.checks:[valid.check]);hooks.changed();
      const q = photoCalibrationReport(p), signed = v => Number.isFinite(v) ? `${v>=0?'+':''}${v.toFixed(2)}°` : 'unavailable';
      $('simple-check-result').textContent = `${q.reason} Bearing difference ${signed(q.azimuthError)} · height difference ${signed(q.altitudeError)}.`;
    } catch (err) { message(err.message); }
  });
  $('simple-cancel').addEventListener('click', () => { sync(); step(4); });
  $('simple-approximate').addEventListener('click', () => { sync(); step(4); });
  function renderExtraList(){
    const list=$('simple-extra-list'),focused=root.ownerDocument.activeElement?.dataset.refIndex;list.replaceChildren();
    let refs=[];try{refs=references();}catch{return;}
    refs.forEach((v,i)=>{
      const row=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=!v.excluded;
      input.dataset.refIndex=String(i);
      row.append(input,` Use fitting point ${i+1}: ${v.azimuth.toFixed(2)}° bearing · ${v.altitude.toFixed(2)}° height`);
      input.addEventListener('change',()=>{if(i<2){drafts.exclusions??=[false,false];drafts.exclusions[i]=!input.checked;}
        else drafts.extraRefs[i-2].excluded=!input.checked;review();render();});list.append(row);
    });
    (drafts.extraChecks??[]).forEach((v,i)=>{
      const row=document.createElement('div'),remove=document.createElement('button'),promote=document.createElement('button');
      remove.type=promote.type='button';remove.className=promote.className='btn small';remove.textContent='Remove check';promote.textContent='Use for fitting';
      row.append(`Separate check ${i+1}: ${v.azimuth.toFixed(2)}° / ${v.altitude.toFixed(2)}° `,remove,promote);list.append(row);
      const update=()=>{let e=normalizePhotoCalibration(p.calibration,true);
        if(e.version<4)e=fitMultiplePhotoReferences(p,e.references,{projection:e.projection,full360:e.full360}).calibration;
        e.checks=structuredClone(drafts.extraChecks);p.calibration=normalizePhotoCalibration(e,true);hooks.changed();};
      remove.addEventListener('click',()=>{drafts.extraChecks.splice(i,1);update();render();});
      promote.addEventListener('click',()=>{hooks.settle();try{
        const refs=references();if(refs.length>=16)throw new Error('At most 16 fitting points are supported.');
        if(refs.some(q=>Math.hypot(q.x-v.x,q.y-v.y)<1e-8))throw new Error('This feature is already a fitting point. Choose a different check.');
        const checks=drafts.extraChecks.filter((_,j)=>i!==j),prospective=[...refs,{...v,excluded:false}],e=normalizePhotoCalibration(p.calibration,true);
        if(e.version===5)geographicAlignment(p,prospective,{checks,robust:!!drafts.robust,estimateFov:!!drafts.estimateFov});
        else fitMultiplePhotoReferences(p,prospective,{projection:e.projection,full360:e.full360,checks});
        let live=e.version>=4?e:fitMultiplePhotoReferences(p,e.references,{projection:e.projection,full360:e.full360}).calibration;
        live=normalizePhotoCalibration({...live,checks},true);
        drafts.extraRefs??=[];drafts.extraRefs.push({...v,excluded:false});drafts.extraChecks=checks;p.calibration=live;hooks.changed();
        review();render();message('This point is now fitting data. Its independent check claim was removed; apply the revised fit and choose a new check.');
      }catch(err){message(err.message);}});
    });
    if(focused!==undefined)list.querySelector(`[data-ref-index="${focused}"]`)?.focus({preventScroll:true});
  }
  $('simple-extra-add').addEventListener('click',()=>{
    hooks.settle();try{const point=reference('extra');
      if($('simple-extra-role').value==='fit'){
        const refs=references();if(refs.length>=16)throw new Error('At most 16 fitting points are supported.');
        if(refs.some(v=>Math.hypot(v.x-point.x,v.y-point.y)<1e-8))throw new Error('Choose a different fitting feature.');
        drafts.extraRefs??=[];drafts.extraRefs.push({...point,excluded:false});review();render();
        $('simple-extra-result').textContent='Fitting point added to the preview. Review and use the revised alignment.';
      }else{
        const e=normalizePhotoCalibration(p.calibration,true);if(e.version<2)throw new Error('Apply the alignment before adding checks.');
        const checks=[...(e.version>=4?e.checks:e.check?[e.check]:[]),point];
        if(checks.length>16)throw new Error('At most 16 check points are supported.');
        if(e.version===5)p.calibration=normalizePhotoCalibration({...e,checks},true);
        else {const fitted=fitMultiplePhotoReferences(p,e.references,{projection:e.projection,full360:e.full360,checks});
          if(['fov','altTop','altBottom','azOffset'].some(k=>Math.abs(fitted[k]-p[k])>1e-6))throw new Error('Review and reapply the fitting references before adding checks.');
          p.calibration=fitted.calibration;}
        drafts.extraChecks=structuredClone(checks);hooks.changed();render();
        const q=photoCalibrationReport(p);$('simple-extra-result').textContent=q.reason+` Worst bearing ${q.azimuthError?.toFixed(2)}° · worst height ${q.altitudeError?.toFixed(2)}°. `+
          q.checkResiduals.map((v,i)=>`Check ${i+1}: ${v.azimuth.toFixed(2)}° / ${v.altitude.toFixed(2)}°`).join('; ');
      }
    }catch(err){$('simple-extra-result').textContent=err.message;}
  });
  if (!Object.keys(drafts).length) sync(); else restoreInputs();
  render();
  return { render, sync, cancelPick, active, open: () => { sync(); step(0); }, isPicking: () => !!picking,
    preview: () => active() && ui.setupStep === 2 ? preview : null,
    markers() {
      if (!active()) return null;
      return keys.flatMap((key,i) => {
        const x = Number(drafts[key+'-x']), y = Number(drafts[key+'-y']);
        if (drafts[key+'-x'] === '' || drafts[key+'-x'] == null || drafts[key+'-y'] === '' || drafts[key+'-y'] == null || !Number.isFinite(x) || !Number.isFinite(y) || x<0 || x>100 || y<0 || y>100) return [];
        return [{ x:x/100, y:y/100, label:i<2?String(i+1):'C', key }];
      });
    },
    hit(x,y,g) {
      if (!active()) return false;
      const hit = this.markers().find(v => Math.hypot(g.x(v.x*720)-g.x(x*720),g.y(v.y*359)-g.y(y*359)) <= 12);
      if (!hit) return false; picking = hit.key; return true;
    },
    pick(x,y) { if (!picking) return; dragging = picking; picking = null; update(dragging,x,y); },
    isDragging: () => !!dragging,
    drag(x,y) { if (dragging) update(dragging,Math.max(0,Math.min(1,x)),Math.max(0,Math.min(1,y))); },
    finishDrag() { if (!dragging) return; const key = dragging; cancelPick(); $(`simple-${key}-azimuth`).focus(); },
  };
}
