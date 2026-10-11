/* Guided photo setup; geometry and evidence decisions live in core. */
import { normalizePhotoCalibration, photoPoint, photoPointAngles, alignPhotoBearing,
  fitPhotoVertical, photoCalibrationReport } from './core.js?v=63';
import { simpleSetupHTML, wireSimpleSetup } from './horizonsimple.js?v=13';
import { photoConversionHTML } from './horizonphoto.js?v=7';
import { geographicEvidenceHTML } from './horizongeographic.js?v=5';

const CONVERTED_NOTE = 'This view was converted from the original photo, so its geometry comes from that conversion. Refine it with the photo setup above; these steps can only review it.';
const STEPS = ['Coverage', 'Direction', 'Vertical scale', 'Verify', 'Paint'];
const POINTS = [['bearing', 'Direction feature'], ['level', 'Level reference'],
  ['scale', 'Second altitude reference'], ['check', 'Independent check feature']];
const pointHTML = (key, label, angles) => `<fieldset class="setup-point"><legend>${label}</legend>
  <button type="button" class="btn small" data-pick="${key}" aria-pressed="false">Pick ${label.toLowerCase()} on image</button>
  <div class="setup-fields"><label>From left (%)<input id="setup-${key}-x" type="number" min="0" max="100" step="any"></label>
  <label>From top (%)<input id="setup-${key}-y" type="number" min="0" max="100" step="any"></label>
  ${angles.map(([name, title, min, max]) => `<label>${title}<input id="setup-${key}-${name}" type="number" min="${min}" max="${max}" step="any"></label>`).join('')}</div></fieldset>`;

export function photoSetupHTML() {
  return `<section class="horizon-setup" aria-label="Guided photograph calibration">
    <h4>Photo setup</h4><p id="setup-status" class="setup-status" role="status"></p>
    <p id="setup-reason" class="sub"></p>
    <button id="setup-open" class="btn small" type="button">Set up / review calibration</button>
    ${simpleSetupHTML()}
    ${photoConversionHTML()}
    ${geographicEvidenceHTML()}
    <div id="setup-flow" hidden>
      <p class="sub">Import → Coverage → Direction → Vertical scale → Verify → Paint</p>
      <nav class="setup-steps" aria-label="Photo setup steps">${STEPS.map((name, i) => `<button type="button" class="btn small" data-step="${i}">${i + 1}. ${name}</button>`).join('')}</nav>
      <section data-pane="0"><h5>1. Set horizontal coverage</h5>
        <label>Image coverage<select id="setup-coverage-kind"><option value="full">Full 360° panorama</option><option value="partial">Partial view</option></select></label>
        <label>Measured width (degrees)<input id="setup-width" type="number" min="5" max="360" step="any"></label>
        <label>Projection<select id="setup-projection"><option value="unknown">Unknown — approximate</option><option value="equirectangular">Equirectangular angular panorama</option><option value="other">Ordinary / other photo — approximate</option></select></label>
        <p class="sub">Use an upright, level equirectangular image: equal pixel distances represent equal bearing and altitude angles. A normal camera photo or cylindrical panorama needs reprojection for precise angles. Image shape does not establish coverage.</p>
        <button type="button" class="btn" id="setup-apply-coverage">Apply coverage</button>
      </section>
      <section data-pane="1" hidden><h5>2. Align a known direction</h5>
        <p class="sub">Pick a recognizable feature and enter its true bearing, clockwise from true North. North can be outside the photo. Magnetic compass readings need your local declination correction first; no conversion is applied here.</p>
        ${pointHTML('bearing', POINTS[0][1], [['azimuth', 'Known true bearing (°)', 0, 360]])}
        <button type="button" class="btn" id="setup-apply-bearing">Align direction</button>
      </section>
      <section data-pane="2" hidden><h5>3. Set level and vertical scale</h5>
        <p class="sub">Pick a measured level reference (0°), then a feature at another known altitude. You can use two measured nonzero altitudes instead. A roof, tree or terrain skyline is an obstruction, not automatically the level line. The two points determine the vertical scale; keep them well apart.</p>
        ${pointHTML('level', POINTS[1][1], [['altitude', 'Known altitude (°)', -90, 90]])}
        ${pointHTML('scale', POINTS[2][1], [['altitude', 'Known altitude (°)', -90, 90]])}
        <button type="button" class="btn" id="setup-apply-vertical">Apply vertical references</button>
      </section>
      <section data-pane="3" hidden><h5>4. Check another feature</h5>
        <p class="sub">Use a different feature with an independently known bearing and altitude. This check reports disagreement without moving the calibration. Both angles must agree within 1° to show “Checked references”. This does not prove the projection or measurement accuracy.</p>
        ${pointHTML('check', POINTS[3][1], [['azimuth', 'Known true bearing (°)', 0, 360], ['altitude', 'Known altitude (°)', -90, 90]])}
        <button type="button" class="btn" id="setup-apply-check">Check reference</button>
        <p id="setup-errors" class="mono" aria-live="polite"></p>
      </section>
      <p id="setup-message" class="sub" role="alert"></p>
      <div class="btnrow"><button class="btn small" id="setup-back" type="button">Back</button><button class="btn primary" id="setup-next" type="button">Next</button></div>
      <p class="sub">Image markers: D direction · L level · V vertical scale · C check. Applied changes affect the live plan immediately. Save keeps calibration, references and paint in this browser. You can continue with approximate angles and revisit any step.</p>
    </div>
  </section>`;
}

export function wirePhotoSetup(root, p, ui, hooks) {
  const $ = (s) => root.querySelector(s);
  let picking = null;
  let simple = null;
  ui.setupStep ??= 4;
  ui.setupDraft ??= {};
  const drafts = ui.setupDraft;
  const inputIds = ['coverage-kind', 'width', 'projection', ...POINTS.flatMap(([key]) =>
    ['x', 'y', ...(key === 'bearing' ? ['azimuth'] : key === 'check' ? ['azimuth', 'altitude'] : ['altitude'])].map((v) => `${key}-${v}`))];
  const message = (text = '') => { $('#setup-message').textContent = text; };
  const cancelPick = () => {
    picking = null;
    root.querySelectorAll('[data-pick]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    hooks.redraw();
  };
  function syncCoverage() {
    const values = { 'coverage-kind': p.fov >= 360 ? 'full' : 'partial', width: p.fov,
      projection: normalizePhotoCalibration(p.calibration).projection };
    Object.assign(drafts, values);
    Object.entries(values).forEach(([id, value]) => { $(`#setup-${id}`).value = String(value); });
  }
  function sync() {
    const e = normalizePhotoCalibration(p.calibration);
    const values = { 'coverage-kind': p.fov >= 360 ? 'full' : 'partial', width: p.fov, projection: e.projection };
    const points = [e.bearing, e.vertical[0], e.vertical[1], e.check];
    POINTS.forEach(([key], i) => {
      const point = points[i], a = point ? photoPointAngles(p, point) : null;
      values[`${key}-x`] = a ? +(a.x * 100).toFixed(6) : '';
      values[`${key}-y`] = a ? +(a.y * 100).toFixed(6) : '';
      if (key === 'bearing' || key === 'check') values[`${key}-azimuth`] = point?.azimuth ?? '';
      if (key !== 'bearing') values[`${key}-altitude`] = point?.altitude ?? (key === 'level' ? 0 : '');
    });
    Object.assign(drafts, values);
    inputIds.forEach((id) => { $(`#setup-${id}`).value = String(drafts[id]); });
  }
  function render() {
    const report = photoCalibrationReport(p);
    $('#setup-status').textContent = `${report.status === 'checked' ? 'Check agrees' : report.status === 'aligned' ? 'Aligned from references' : report.status === 'approximate' ? 'Approximate calibration' : 'Assumed calibration'} · ${p.fov.toFixed(1)}° wide`;
    $('#setup-status').dataset.calibration = report.status;
    $('#setup-reason').textContent = report.reason;
    $('#setup-open').hidden = ui.setupStep !== 4;
    $('#setup-flow').hidden = ui.setupStep === 4 || !ui.legacySetup;
    root.querySelectorAll('[data-pane]').forEach((pane) => { pane.hidden = Number(pane.dataset.pane) !== ui.setupStep; });
    root.querySelectorAll('[data-step]').forEach((b) => { if (+b.dataset.step === ui.setupStep) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    $('#setup-back').disabled = ui.setupStep === 0;
    $('#setup-next').textContent = ui.setupStep === 3 ? 'Continue to paint' : 'Next';
    $('#setup-width').disabled = $('#setup-coverage-kind').value === 'full';
    const signed = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}°`;
    $('#setup-errors').textContent = report.azimuthError == null ? 'No check in this crop yet.'
      : `Predicted minus known: bearing ${signed(report.azimuthError)} · altitude ${signed(report.altitudeError)}`;
    simple?.render();
  }
  function step(value, focus = true) {
    hooks.settle(); cancelPick(); simple?.cancelPick(); ui.legacySetup = true; ui.setupStep = value;
    message(p.photoModel && value < 4 ? CONVERTED_NOTE : ''); render();
    if (focus && value === 4) hooks.focusCanvas();
    else if (focus) root.querySelector(`[data-pane="${value}"] input, [data-pane="${value}"] select`)?.focus();
  }
  function apply(action) {
    hooks.settle();
    // The linear legacy evidence cannot describe a converted photograph; applying
    // it would overwrite the conversion's geometry while keeping its photo model.
    if (p.photoModel) { message(CONVERTED_NOTE); render(); return; }
    try { action(); cancelPick(); hooks.changed(); message('Applied to the live plan. Save to keep these changes.'); }
    catch (err) { message(err.message); }
    render();
  }
  const number = (id) => {
    const el = $(`#setup-${id}`), value = el.value.trim();
    if (value === '' || !el.checkValidity()) throw new Error('Select the image point and enter valid known angles.');
    return Number(value);
  };
  const reference = (key, angles) => ({ ...photoPoint(p, number(`${key}-x`) / 100, number(`${key}-y`) / 100),
    ...Object.fromEntries(angles.map((a) => [a, number(`${key}-${a}`)])) });
  const evidence = () => {
    const e = normalizePhotoCalibration(p.calibration);
    // Deliberately choosing the legacy editor retains its original evidence model.
    if (e.version >= 2) { const { references, full360, ...legacy } = e; return { ...legacy, version: 1 }; }
    return e;
  };
  inputIds.forEach((id) => $(`#setup-${id}`).addEventListener('input', (ev) => { drafts[id] = ev.target.value; render(); hooks.redraw(); }));
  $('#setup-coverage-kind').addEventListener('change', () => {
    if ($('#setup-coverage-kind').value === 'full') { $('#setup-width').value = '360'; drafts.width = '360'; }
    render();
  });
  $('#setup-open').addEventListener('click', () => { syncCoverage(); simple.open(); });
  $('#setup-legacy-open').addEventListener('click', () => { syncCoverage(); step(0); });
  root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => step(+b.dataset.step)));
  $('#setup-back').addEventListener('click', () => step(Math.max(0, ui.setupStep - 1)));
  $('#setup-next').addEventListener('click', () => step(Math.min(4, ui.setupStep + 1)));
  root.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
    hooks.settle(); const next = picking === b.dataset.pick ? null : b.dataset.pick; cancelPick(); picking = next;
    b.setAttribute('aria-pressed', String(!!picking));
    message(picking ? 'Click the feature on the image, or enter its position as percentages above. Esc cancels picking.' : '');
    if (picking) hooks.focusCanvas();
  }));
  $('#setup-apply-coverage').addEventListener('click', () => apply(() => {
    const fov = $('#setup-coverage-kind').value === 'full' ? 360 : number('width');
    if (fov < 5 || fov > 360 || ($('#setup-coverage-kind').value === 'partial' && fov >= 360))
      throw new Error('A partial view needs a measured width from 5° to less than 360°.');
    const e = evidence();
    e.projection = $('#setup-projection').value;
    e.coverage = fov / (p.sourceRect?.w ?? 1);
    if (e.coverage > 360 + 1e-8) throw new Error('This crop would require original coverage wider than 360°. Review its measured width or reimport the photo.');
    const normalized = normalizePhotoCalibration(e, true);
    p.fov = fov; p.calibration = normalized;
  }));
  $('#setup-apply-bearing').addEventListener('click', () => apply(() => {
    const e = evidence(), ref = reference('bearing', ['azimuth']);
    const offset = alignPhotoBearing(p, ref);
    e.bearing = ref; p.azOffset = offset; p.calibration = e;
  }));
  $('#setup-apply-vertical').addEventListener('click', () => apply(() => {
    const e = evidence(), refs = [reference('level', ['altitude']), reference('scale', ['altitude'])];
    const fit = fitPhotoVertical(p, refs);
    e.vertical = refs; Object.assign(p, fit); p.calibration = e;
  }));
  $('#setup-apply-check').addEventListener('click', () => apply(() => {
    const e = evidence(); e.check = reference('check', ['azimuth', 'altitude']); p.calibration = e;
  }));
  if (!Object.keys(drafts).length) sync();
  else inputIds.forEach((id) => { $(`#setup-${id}`).value = String(drafts[id] ?? ''); });
  simple = wireSimpleSetup(root, p, ui, { ...hooks, render, cancelLegacyPick: cancelPick });
  render();
  return { render, sync: () => { sync(); simple.sync(); }, syncCoverage,
    markers: () => {
      if (!ui.legacySetup || ui.setupStep === 4) return simple.markers();
      return POINTS.flatMap(([key], i) => {
        const rawX = drafts[`${key}-x`], rawY = drafts[`${key}-y`];
        const x = Number(rawX), y = Number(rawY);
        if (rawX == null || rawY == null || rawX === '' || rawY === '' || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) return [];
        return [{ x: x / 100, y: y / 100, label: ['D','L','V','C'][i], key }];
      });
    }, preview: () => simple.preview(),
    hit: (x,y,g) => simple.hit(x,y,g), isDragging: () => simple.isDragging(),
    drag: (x,y) => simple.drag(x,y), finishDrag: () => simple.finishDrag(),
    isPicking: () => !!picking || simple.isPicking(), cancelPick: () => { cancelPick(); simple.cancelPick(); },
    pick(x, y) {
      if (simple.isPicking()) return simple.pick(x,y);
      if (!picking) return;
      const key = picking;
      const values = { [`${key}-x`]: +(x * 100).toFixed(6), [`${key}-y`]: +(y * 100).toFixed(6) };
      Object.assign(drafts, values);
      Object.entries(values).forEach(([id, value]) => { $(`#setup-${id}`).value = String(value); });
      cancelPick(); message('Point selected. Enter the known angle(s), then apply.');
      $(`#setup-${key}-${key === 'bearing' || key === 'check' ? 'azimuth' : 'altitude'}`).focus();
    } };
}
