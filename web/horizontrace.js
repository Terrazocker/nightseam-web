/* Skyline interaction only; rasterization, crops and history live in core. */
import { MASK_W, MASK_H, clearMask } from './core.js?v=62';
import { vizTheme } from './viztheme.js?v=6';

export function traceToolsHTML() {
  return `<div class="ed-row"><span class="ed-rowlabel">Tool</span>
    <select id="ed-tool" aria-label="Authoring tool"><option value="brush">Brush / eraser</option><option value="trace">Trace skyline</option></select>
    <span id="ed-tool-help" class="sub" role="status"></span></div>`;
}
export function tracePointsHTML() {
  return `<details id="ed-trace-tools" class="ed-trace-tools"><summary>Skyline points / keyboard editing</summary>
      <p class="sub">Click along a roof, tree or terrain outline. Straight segments fill below between endpoints. Drag a point to adjust it. Trace to both image edges for full coverage; the two seam endpoints are explicit. Later brush corrections stay in place when points move.</p>
      <div class="ed-group"><label>Trace <select id="ed-trace-list" aria-label="Trace"></select></label><button class="btn" id="ed-trace-new">New trace</button>
        <label>Point <select id="ed-trace-point" aria-label="Point"></select></label>
        <label>Across image (%) <input id="ed-trace-x" type="number" min="0" max="100" step="any" value="50"></label>
        <label>Down image (%) <input id="ed-trace-y" type="number" min="0" max="100" step="any" value="50"></label>
        <button class="btn" id="ed-trace-add">Add point</button><button class="btn" id="ed-trace-apply">Move point</button><button class="btn" id="ed-trace-delete">Delete point</button></div>
      <p class="sub">On the focused image: Left/Right select a point; Up/Down move it vertically (Shift for larger steps); Delete removes it. Exact coordinates above work without dragging. The first point is a draft until connected to a second point; it leaves the existing horizon unchanged and is not saved. Each connected edit is undoable. A new trace is added after existing paint.</p>
      <output id="ed-trace-message" class="sub" role="status" aria-live="polite"></output>
    </details>`;
}

export function wireTraceTools(box, p, ui, hooks) {
  const $ = id => box.querySelector('#' + id);
  let edited = false;
  ui.tool ||= p.paintMode === 'obstacle' ? 'trace' : 'brush';
  const traces = () => p.strokes.map((s, i) => s.m === 'trace' ? i : -1).filter(i => i >= 0);
  const trace = () => p.strokes[ui.traceIndex]?.m === 'trace' ? p.strokes[ui.traceIndex] : null;
  const points = () => trace()?.points || ui.traceDraft || [];
  if (!('traceIndex' in ui)) ui.traceIndex = traces().at(-1) ?? null;
  const message = text => { $('ed-trace-message').textContent = text; };
  const active = () => ui.tool === 'trace' && p.paintMode === 'obstacle';
  function sync() {
    if (p.paintMode === 'sky') ui.tool = 'brush';
    $('ed-tool').value = ui.tool;
    $('ed-tool').querySelector('[value="trace"]').disabled = p.paintMode === 'sky';
    $('ed-tool-help').textContent = p.paintMode === 'sky'
      ? 'Brush visible sky; block above band for an overhang. A skyline cannot describe a sky opening.'
      : active() ? 'Trace skyline: click to add; drag to adjust. Brush / eraser corrects local areas.' : 'Brush / eraser: paint blocked areas or make local corrections.';
    const indices = traces();
    $('ed-trace-list').replaceChildren(new Option('New trace', ''), ...indices.map((i,n) => new Option(`Trace ${n + 1}`, String(i))));
    if (!trace()) ui.traceIndex = null;
    $('ed-trace-list').value = ui.traceIndex === null ? '' : String(ui.traceIndex);
    const pts = points();
    ui.tracePoint = Math.max(0, Math.min(ui.tracePoint || 0, pts.length - 1));
    $('ed-trace-point').replaceChildren(...pts.map((v, i) => new Option(`Point ${i + 1}`, String(i))));
    $('ed-trace-point').value = String(ui.tracePoint);
    if (pts[ui.tracePoint]) {
      $('ed-trace-x').value = String(+(pts[ui.tracePoint][0] / MASK_W * 100).toFixed(4));
      $('ed-trace-y').value = String(+(pts[ui.tracePoint][1] / (MASK_H - 1) * 100).toFixed(4));
    }
    for (const id of ['ed-trace-new', 'ed-trace-add']) $(id).disabled = p.paintMode === 'sky';
    for (const id of ['ed-trace-apply', 'ed-trace-delete']) $(id).disabled = !active() || !pts.length;
    $('ed-trace-tools').classList.toggle('hidden', p.paintMode === 'sky');
    $('ed-paint-options').hidden = active();
    hooks.canvas.classList.toggle('tracing', active());
  }
  function choose(tool) {
    hooks.settle();
    if (tool === 'trace' && ui.tool !== 'trace' && !trace() && !ui.traceDraft?.length) ui.traceIndex = traces().at(-1) ?? null;
    ui.tool = tool; hooks.cancelOtherTools(); sync(); hooks.redraw();
  }
  function add(x, y) {
    let s = trace();
    const pts = points();
    if (!s && traces().length >= 32) { message('This horizon already has 32 traces. Adjust or remove an existing trace.'); return false; }
    if (pts.length >= 256) { message('This trace has 256 points. Adjust an existing point or start another trace.'); return false; }
    if (pts.some(pt => Math.abs(pt[0] - x) < 0.01)) { message('A point already lies at this horizontal position. Select and move it.'); return false; }
    const at = pts.findIndex(pt => pt[0] > x);
    ui.tracePoint = at < 0 ? pts.length : at;
    pts.splice(ui.tracePoint, 0, [x, y]);
    if (!s && pts.length >= 2) {
      s = { m: 'trace', points: pts }; p.strokes.push(s); ui.traceIndex = p.strokes.length - 1; ui.traceDraft = null;
    } else if (!s) ui.traceDraft = pts;
    message(s ? '' : 'First point is a draft. Add a second point to connect and paint.'); return true;
  }
  function move(x, y) {
    const pts = points(), i = ui.tracePoint;
    if (!pts?.[i]) return false;
    let lower = i ? pts[i - 1][0] + Math.min(0.01,(pts[i][0]-pts[i - 1][0])/2) : 0;
    let upper = i < pts.length - 1 ? pts[i + 1][0] - Math.min(0.01,(pts[i + 1][0]-pts[i][0])/2) : MASK_W;
    if (i && lower <= pts[i - 1][0]) lower = pts[i][0];
    if (i < pts.length - 1 && upper >= pts[i + 1][0]) upper = pts[i][0];
    x = Math.max(lower, Math.min(upper, x));
    y = Math.max(0, Math.min(MASK_H - 1, y));
    if (pts[i][0] === x && pts[i][1] === y) return false;
    pts[i] = [x, y]; return true;
  }
  function changed(commit = false) {
    if (trace()) hooks.changed(commit); else hooks.redraw();
    sync();
  }
  function remove() {
    const s = trace(), pts = points(); if (!pts[ui.tracePoint]) return;
    pts.splice(ui.tracePoint, 1);
    if (s && pts.length < 2) {
      p.strokes.splice(ui.traceIndex, 1); ui.traceIndex = null;
      ui.traceDraft = pts;
      if (!p.strokes.length) clearMask(p);
      hooks.changed(true);
    } else if (s) hooks.changed(true);
    else { ui.traceDraft = pts; hooks.redraw(); }
    message(pts.length === 1 && !trace() ? 'Remaining point is a draft; the removed filled trace can be restored with Undo.' : '');
    sync();
  }
  $('ed-tool').addEventListener('change', ev => choose(ev.target.value));
  $('ed-trace-new').addEventListener('click', () => { choose('trace'); ui.traceIndex = null; ui.traceDraft = []; message('Click or add the first point of a new trace.'); sync(); });
  $('ed-trace-list').addEventListener('change', ev => {
    const requested = ev.target.value;
    choose('trace'); ui.traceIndex = requested === '' ? null : Number(requested); ui.traceDraft = []; sync(); hooks.redraw();
  });
  $('ed-trace-point').addEventListener('change', ev => { const requested=Number(ev.target.value); hooks.settle(); ui.tracePoint = requested; sync(); hooks.redraw(); });
  const values = () => {
    const x = $('ed-trace-x'), y = $('ed-trace-y');
    return x.value !== '' && y.value !== '' && x.checkValidity() && y.checkValidity()
      ? [Number(x.value) / 100 * MASK_W, Number(y.value) / 100 * (MASK_H - 1)] : null;
  };
  for (const [id, edit] of [['ed-trace-add', add], ['ed-trace-apply', move]]) {
    $(id).addEventListener('click', () => {
      const v = values();
      if (!v || p.paintMode === 'sky') { message('Enter valid image percentages between 0 and 100.'); return; }
      choose('trace'); if (edit(...v)) changed(true);
    });
  }
  $('ed-trace-delete').addEventListener('click', () => { hooks.settle(); remove(); });
  $('ed-point-remove').addEventListener('click', () => { hooks.settle(); remove(); hooks.canvas.focus(); });
  hooks.canvas.addEventListener('keydown', ev => {
    if (!active() || ev.ctrlKey || ev.metaKey || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Delete'].includes(ev.key)) return;
    ev.preventDefault(); hooks.settle();
    const pts = points();
    if (ev.key === 'Delete') return remove();
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      ui.tracePoint = Math.max(0, Math.min(pts.length - 1, ui.tracePoint + (ev.key === 'ArrowRight' ? 1 : -1))); sync(); hooks.redraw();
    } else if (pts[ui.tracePoint] && move(pts[ui.tracePoint][0], pts[ui.tracePoint][1] + (ev.key === 'ArrowDown' ? 1 : -1) * (ev.shiftKey ? 10 : 1))) changed(true);
  });
  sync();
  return {
    active, sync, choose,
    restore(resetSelection = false) {
      if (ui.traceDraft?.length) message('Unconnected draft discarded because the image or horizon changed.');
      ui.traceDraft = null;
      if (resetSelection || !trace()) ui.traceIndex = traces().at(-1) ?? null;
      sync();
    },
    down(x, y) {
      if (x < 0 || x > MASK_W || y < 0 || y > MASK_H - 1) return false;
      const g = hooks.geometry(), pts = points();
      let at = -1, distance = 12;
      pts.forEach((pt,i) => {
        const d = Math.hypot(g.x(pt[0]) - g.x(x), g.y(pt[1]) - g.y(y));
        if (d <= distance) { distance = d; at = i; }
      });
      if (at >= 0) { ui.tracePoint = at; sync(); hooks.redraw(); }
      else if (add(x, y)) { edited = true; changed(); }
      else return false;
      return true;
    },
    move(x, y) { if (move(x, y)) { edited = true; changed(); } },
    finish() { const result = edited && !!trace(); edited = false; return result; },
    draw(ctx) {
      const removeButton = $('ed-point-remove');
      const selected = points()[ui.tracePoint];
      const position = selected ? [hooks.geometry().x(selected[0]),hooks.geometry().y(selected[1])] : null;
      const available = active() && hooks.pointActions() && ui.setupStep === 4 && !!position && position[0]>=0 && position[0]<=hooks.geometry().w && position[1]>=0 && position[1]<=hooks.geometry().h;
      removeButton.hidden = !available;
      if (available) {
        const g = hooks.geometry(), canvas = hooks.canvas;
        removeButton.setAttribute('aria-label', `Remove skyline point ${ui.tracePoint + 1}`);
        removeButton.style.left = `${canvas.offsetLeft + Math.max(0,Math.min(g.w-removeButton.offsetWidth,g.x(selected[0])+18))}px`;
        removeButton.style.top = `${canvas.offsetTop + Math.max(0,Math.min(g.h-removeButton.offsetHeight,g.y(selected[1])+12))}px`;
      }
      if (!active() || ui.setupStep !== 4) return;
      const pts = points(), g = hooks.geometry(), V = vizTheme();
      ctx.save(); ctx.setTransform(hooks.canvas.width / g.w, 0, 0, hooks.canvas.height / g.h, 0, 0);
      ctx.strokeStyle = V.text; ctx.lineWidth = 2; ctx.beginPath();
      pts.forEach((pt,i) => i ? ctx.lineTo(g.x(pt[0]),g.y(pt[1])) : ctx.moveTo(g.x(pt[0]),g.y(pt[1]))); ctx.stroke();
      ctx.font = '12px system-ui'; ctx.textAlign = 'left';
      let lastMarker = null;
      pts.forEach((pt,i) => {
        const x=g.x(pt[0]), y=g.y(pt[1]); ctx.fillStyle = i === ui.tracePoint ? V.minLabel : V.canvas;
        if (i !== ui.tracePoint && lastMarker && Math.hypot(x-lastMarker[0],y-lastMarker[1]) < 16) return;
        lastMarker = [x,y];
        ctx.beginPath(); ctx.arc(x,y,i === ui.tracePoint ? 7 : 5,0,Math.PI*2); ctx.fill(); ctx.stroke();
        if (pts.length <= 12 || i === ui.tracePoint) {
          ctx.fillStyle=V.canvas; ctx.fillRect(x+9,y-10,28,20); ctx.fillStyle=V.text; ctx.fillText(String(i+1),x+12,y+4);
        }
      }); ctx.restore();
    },
  };
}
