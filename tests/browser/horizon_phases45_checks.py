"""Editable skylines and final software acceptance; device tests remain human."""
import copy
import json
from harness import check
from web_suite import boot, open_editor, paint, crop_drag
from phase1_app_checks import modules
from review_phase4_horizon_checks import model, change, expand


def point(c, x, y):
    canvas = c.page.locator('#pano-canvas')
    canvas.scroll_into_view_if_needed()
    canvas.evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})")
    b = canvas.bounding_box()
    c.page.mouse.click(b['x'] + b['width'] * x, b['y'] + b['height'] * y)


def numeric_point(c, x, y):
    c.page.locator('#ed-trace-x').evaluate("e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;}")
    c.page.locator('#ed-trace-x').fill(str(x))
    c.page.locator('#ed-trace-y').fill(str(y))
    c.page.locator('#ed-trace-add').click()


@check('web-horizon-phase45-trace-corrections-crop-backup', 'web')
def trace_workflow(c):
    boot(c); open_editor(c)
    c.page.locator('#ed-tool').select_option('trace')
    for x,y in [(0.05,.75),(.30,.40),(.50,.50),(.75,.35),(.95,.75)]: point(c,x,y)
    original = model(c)
    c.expect_eq(len(original['strokes']),1,'a roof/tree outline needs one trace rather than filled brush sweeps')
    c.expect_eq(len(original['strokes'][0]['points']),5)
    c.expect(original['profile'][215] > 34,'trace fills blocked area under the roof in world bins')
    c.page.locator('#ed-tool').select_option('brush')
    c.page.locator('#ed-brush').fill('12')
    c.page.locator('#ed-brush').dispatch_event('input')
    c.page.locator('#pano-canvas').evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})")
    paint(c,x0=.29,x1=.31,y=.45,button='right')
    corrected = model(c)
    c.expect(len(corrected['strokes']) > 1,'eraser corrections follow the trace in order')
    c.page.locator('#ed-tool').select_option('trace')
    c.page.locator('#ed-trace-point').select_option('1')
    c.page.locator('#ed-trace-y').fill('42')
    c.page.locator('#ed-trace-apply').click()
    adjusted = model(c)
    c.expect_eq(adjusted['strokes'][1:],corrected['strokes'][1:],'point edits keep later corrections')
    c.page.locator('#ed-undo').click()
    c.expect_eq(model(c)['strokes'],corrected['strokes'],'undo restores deep points and dabs')
    c.page.locator('#ed-redo').click()
    c.page.locator('#ed-crop').click(); crop_drag(c,.125,.875)
    c.page.locator('#ed-crop-apply').click()
    cropped = model(c)
    c.expect_eq(cropped['strokes'][0]['points'][0][0],0,'crop intersects a trace segment at its new left edge')
    c.expect_eq(cropped['strokes'][0]['points'][-1][0],720)
    c.page.locator('#ed-save').click()
    outcome=c.page.evaluate('''async m=>{
      const H=await import(m.horizon),W=await import(m.webstore);
      const bundle=await W.collectBackup(H.getPrefs(),await H.exportPanosWithImages(),'workbench');
      const bad=structuredClone(bundle.panos); bad.panos[0].strokes[0].points[1][0]=bad.panos[0].strokes[0].points[0][0];
      const rejected=H.normalizePanos(bad)===null;
      await H.applyPanosSnapshot({panos:[],activeId:null});
      const normalized=H.normalizePanos(bundle.panos),staged=W.stageBackup({...bundle,panos:normalized});
      await W.restoreBackup({...bundle,panos:normalized},null);
      if(!await H.applyPanosSnapshot(staged.panos))throw new Error('Restore failed');
      return {version:bundle.version,rejected,p:H.activePano()};
    }''',modules())
    c.expect_eq(outcome['version'],10,'older readers cannot reinterpret fitting evidence or trace operations')
    c.expect(outcome['rejected'],'malformed trace rejected before any write')
    c.expect_eq(outcome['p']['strokes'],cropped['strokes'],'backup round-trips trace and correction order')
    c.page.reload(wait_until='domcontentloaded'); c.page.wait_for_selector('#pano-canvas')
    c.expect_eq(model(c)['strokes'],cropped['strokes'],'reload keeps traces')
    c.page.screenshot(path=str(c.artifacts/'horizon-phase45-trace-workflow.png'),full_page=True)
    c.assert_clean()


@check('web-horizon-phase45-keyboard-band-profile-replacement', 'web')
def trace_keyboard_band(c):
    boot(c); open_editor(c)
    c.page.locator('#ed-tool').select_option('trace')
    for x,y in [(0,65),(35,30),(65,45),(100,65)]: numeric_point(c,x,y)
    original = copy.deepcopy(model(c)['strokes'])
    canvas=c.page.locator('#pano-canvas'); canvas.focus()
    c.page.keyboard.press('ArrowLeft'); c.page.keyboard.press('ArrowUp')
    changed=model(c)['strokes']
    c.expect(changed[0]['points'][2][1]<original[0]['points'][2][1],'keyboard moves selected point')
    c.page.keyboard.press('Control+z'); c.expect_eq(model(c)['strokes'],original,'keyboard edit is one history step')
    # Exact profile application replaces authoring, while retaining other bins.
    expand(c)
    before=model(c)
    c.page.locator('#ed-profile-az').fill('20')
    c.page.locator('#ed-profile-az').dispatch_event('change')
    c.page.locator('#ed-profile-alt').fill('17.5')
    c.page.locator('#ed-profile-apply').click()
    c.expect_eq(model(c)['strokes'],[],'advanced bin edit replaces trace geometry explicitly')
    c.expect_eq(model(c)['profile'][40],17.5)
    c.expect_eq(model(c)['profile'][300],before['profile'][300],'unrelated authoritative bins retained')
    c.page.locator('#ed-undo').click(); c.expect_eq(model(c)['strokes'],original)
    c.page.locator('#ed-mode').evaluate("e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;}")
    c.page.locator('#ed-mode').select_option('sky')
    c.page.get_by_role('button',name='Cancel',exact=True).click()
    c.expect_eq(model(c)['paintMode'],'obstacle','cancel preserves trace semantics')
    c.page.locator('#ed-mode').select_option('sky')
    c.page.get_by_role('button',name='Switch mode',exact=True).click()
    c.expect_eq(model(c)['strokes'],[],'sky band removes obstacle-only traces with an explicit choice')
    c.expect(c.page.locator('#ed-tool option[value="trace"]').is_disabled(),'sky bands keep a distinct workflow')
    canvas.evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})")
    paint(c,x0=.35,x1=.65,y=.45)
    c.page.locator('#ed-block-above').check()
    band=model(c)
    c.expect(band['profile'][360] < band['profileTop'][360] < 60,'overhang retains lower and upper sky boundaries')
    c.page.locator('#ed-undo').click(); c.expect(not model(c)['blockAbove'],'undo restores open above')
    c.page.locator('#ed-redo').click(); c.expect(model(c)['blockAbove'],'redo restores overhang')
    c.page.set_viewport_size({'width':360,'height':900})
    c.expect(c.page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'new tools fit a narrow screen')
    for name in ['Authoring tool','Trace','Point','Across image (%)','Down image (%)']:
        # Named controls are also tested before sky mode hides the trace rail.
        c.expect(c.page.get_by_label(name,exact=True).count()==1,f'{name} has an accessible name')
    c.assert_clean()


@check('web-horizon-phase45-owned-trace-cancel-and-save-failure', 'web')
def trace_cancel_save(c):
    boot(c); open_editor(c)
    c.page.locator('#ed-tool').select_option('trace')
    numeric_point(c,5,70); numeric_point(c,50,40); numeric_point(c,95,70)
    before=copy.deepcopy(model(c)['strokes'])
    canvas=c.page.locator('#pano-canvas'); canvas.evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})")
    canvas.evaluate("e=>e.addEventListener('pointerdown',ev=>window.tracePointer=ev.pointerId,{once:true})")
    b=canvas.bounding_box(); x=b['x']+b['width']*.5; y=b['y']+b['height']*.4*359/360
    c.page.mouse.move(x,y); c.page.mouse.down()
    canvas.evaluate("e=>{e.dispatchEvent(new PointerEvent('pointerdown',{pointerId:999,pointerType:'touch',button:0}));e.dispatchEvent(new PointerEvent('pointermove',{pointerId:999,pointerType:'pen',clientX:0,clientY:0}));e.dispatchEvent(new PointerEvent('pointercancel',{pointerId:999}));}")
    c.expect_eq(model(c)['strokes'],before,'secondary touch/pen cannot alter held trace')
    c.page.mouse.move(x,y+b['height']*.08)
    canvas.evaluate("e=>e.dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.tracePointer}))")
    c.page.mouse.up()
    partial=model(c)['strokes']; c.expect(partial!=before,'cancel retains visible point adjustment')
    c.page.locator('#ed-undo').click(); c.expect_eq(model(c)['strokes'],before,'interrupted movement is one undo')
    c.page.locator('#ed-redo').click(); c.expect_eq(model(c)['strokes'],partial)
    c.page.evaluate("() => {window.oldSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='nightseam_panos_v1')throw new DOMException('test quota','QuotaExceededError');return window.oldSet.call(this,k,v)}}")
    c.page.locator('#ed-save').click(); c.expect_in('Save failed',c.page.locator('#ed-status').inner_text())
    c.expect_eq(model(c)['strokes'],partial,'failed save keeps recoverable trace edits')
    c.page.evaluate('() => { Storage.prototype.setItem=window.oldSet; }')
    c.page.locator('#ed-save').click(); c.expect_eq(c.page.locator('#ed-status').inner_text(),'Saved')
    c.page.reload(wait_until='domcontentloaded'); c.page.wait_for_selector('#pano-canvas')
    c.expect_eq(model(c)['strokes'],partial,'successful retry persists cancelled trace edit')
    c.assert_clean()


@check('web-horizon-phase45-long-trace-session-latency', 'web')
def trace_latency(c):
    boot(c); open_editor(c)
    result=c.page.evaluate('''async m=>{
      const H=await import(m.horizon);let p=H.activePano();
      p.strokes=[{m:'trace',points:Array.from({length:200},(_,i)=>[i/199*720,180+Math.sin(i*.3)*25])},
        ...Array.from({length:20000},(_,i)=>({m:i%9?'b':'e',x:i%720,y:220+i%90,r:5}))];
      H.computeProfile(p); await H.importPanos({panos:[p],activeId:p.id});p=H.activePano();
      H.renderHorizon(document.querySelector('#view'),()=>{});
      const tool=document.querySelector('#ed-tool');tool.value='trace';tool.dispatchEvent(new Event('change'));
      const canvas=document.querySelector('#pano-canvas');canvas.scrollIntoView({block:'center',behavior:'instant'});
      const b=canvas.getBoundingClientRect(), point=p.strokes[0].points[100];
      const event=(type,y)=>new PointerEvent(type,{pointerId:1,pointerType:'pen',button:0,
        clientX:b.x+point[0]/720*b.width,clientY:b.y+y/360*b.height});
      canvas.dispatchEvent(event('pointerdown',point[1]));
      const handlers=[],frames=[];
      for(let i=0;i<40;i++){
        const start=performance.now();canvas.dispatchEvent(event('pointermove',180+i*.2));
        handlers.push(performance.now()-start);await new Promise(requestAnimationFrame);frames.push(performance.now()-start);
      }
      canvas.dispatchEvent(event('pointerup',188));
      const stats=xs=>{xs.sort((a,b)=>a-b);return {median:xs[20],p95:xs[38],max:xs.at(-1)}};
      return {handler:stats(handlers),frame:stats(frames),points:p.strokes[0].points.length,dabs:p.strokes.length-1};
    }''',modules())
    (c.artifacts/'horizon-phase45-latency.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    c.expect_eq(result['points'],200,'long trace remains editable')
    c.expect_eq(result['dabs'],20000,'editing does not flatten or discard corrections')
    # Keep hardware-dependent timing as evidence; require functional history.
    c.page.locator('#ed-undo').click()
    c.expect_eq(len(model(c)['strokes'][0]['points']),200,'long-session undo restores trace')
    print(f'        long trace, 20,000 correction dabs: {result}')
    c.page.locator('#ed-tool').select_option('trace')
    c.page.screenshot(path=str(c.artifacts/'horizon-phase45-editing.png'),full_page=True)
    c.assert_clean()


@check('web-horizon-phase45-trace-drafts-limits-selection-and-tool-conflicts', 'web')
def trace_edges(c):
    boot(c); open_editor(c)
    c.page.evaluate('''async m=>{
      const H=await import(m.horizon),p=H.activePano();p.profile=Array(720).fill(30);
      await H.importPanos({panos:[p],activeId:p.id});H.renderHorizon(document.querySelector('#view'),()=>{});
    }''',modules())
    c.page.locator('#ed-tool').select_option('trace')
    numeric_point(c,10,40)
    c.expect_eq(model(c)['profile'][100],30,'first draft point cannot clear an authoritative profile')
    c.expect_eq(model(c)['strokes'],[],'unconnected first point is not persisted geometry')
    c.page.locator('#ed-save').click();c.expect_eq(model(c)['profile'][100],30,'saving a draft keeps the existing horizon')
    c.page.locator('#ed-crop').click();crop_drag(c,.25,.95);c.page.locator('#ed-crop-apply').click()
    c.expect(abs(model(c)['fov']-252)<2,'crop must actually keep the selected band before testing draft/history')
    numeric_point(c,10,40)
    c.expect_eq(model(c)['strokes'],[],'crop discards the old-coordinate draft before another point is added')
    c.page.locator('#ed-undo').click()
    numeric_point(c,10,40)
    numeric_point(c,80,60)
    c.expect_eq(len(model(c)['strokes']),1,'second point commits connected geometry')
    c.page.locator('#ed-undo').click();c.expect_eq(model(c)['profile'][100],30,'undo first connected trace restores authoritative bins')
    c.page.locator('#ed-redo').click()
    before=copy.deepcopy(model(c)['strokes'])
    point(c,.1,.9)
    c.expect_eq(model(c)['strokes'],before,'duplicate-x distant click cannot move the selected point')
    c.expect_in('already lies',c.page.locator('#ed-trace-message').inner_text())
    c.page.locator('#ed-trace-new').click();numeric_point(c,20,20);numeric_point(c,60,30)
    c.page.locator('#ed-trace-list').select_option('0')
    c.expect_eq(c.page.locator('#ed-trace-list').input_value(),'0','selection is captured before controls rebuild')
    c.page.locator('#ed-trace-list').select_option('1')
    c.expect_eq(c.page.locator('#ed-trace-list').input_value(),'1','second trace can be selected')
    c.page.locator('#ed-crop').click()
    numeric_point(c,90,50)
    c.expect(not c.page.locator('#ed-crop-apply').is_visible(),'numeric authoring cancels crop mode')
    c.page.locator('#setup-open').click()
    c.page.locator('#setup-legacy-open').evaluate("e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;}")
    c.page.locator('#setup-legacy-open').click();c.page.locator('[data-step="1"]').click()
    c.page.locator('[data-pick="bearing"]').click()
    c.expect_eq(c.page.locator('[data-pick="bearing"]').get_attribute('aria-pressed'),'true')
    numeric_point(c,95,55)
    c.expect_eq(c.page.locator('[data-pick="bearing"]').get_attribute('aria-pressed'),'false','numeric authoring cancels reference picking')
    # A valid imported tightly spaced trace remains strictly ordered on movement.
    c.page.evaluate('''async m=>{
      const H=await import(m.horizon),p=H.activePano();p.strokes=[{m:'trace',points:[[10,100],[10.005,120],[10.01,140]]}];
      await H.importPanos({panos:[p],activeId:p.id});H.renderHorizon(document.querySelector('#view'),()=>{});
    }''',modules())
    c.page.locator('#ed-tool').select_option('trace')
    c.page.locator('#ed-trace-point').evaluate("e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;}")
    c.page.locator('#ed-trace-point').select_option('1')
    c.page.locator('#ed-trace-x').fill('90');c.page.locator('#ed-trace-y').fill('40');c.page.locator('#ed-trace-apply').click()
    pts=model(c)['strokes'][0]['points']
    c.expect(pts[0][0]<pts[1][0]<pts[2][0],'movement preserves a strict open interval between close imported neighbors')
    c.expect(c.page.evaluate('async m=>{const H=await import(m.horizon);return H.normalizePanos(H.exportPanos())!==null}',modules()),'edited close points can still be backed up')
    # At the point limit, clicking empty space must not relocate a previous node.
    c.page.evaluate('''async m=>{
      const H=await import(m.horizon),p=H.activePano();p.strokes=[{m:'trace',points:Array.from({length:256},(_,i)=>[i/255*720,100])}];
      await H.importPanos({panos:[p],activeId:p.id});H.renderHorizon(document.querySelector('#view'),()=>{});
    }''',modules())
    c.page.locator('#ed-tool').select_option('trace')
    c.page.locator('#ed-trace-message').evaluate("e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;}")
    before=copy.deepcopy(model(c)['strokes'])
    point(c,.5,.9);c.expect_eq(model(c)['strokes'],before,'limit rejection cannot drag another point')
    c.expect_in('256 points',c.page.locator('#ed-trace-message').inner_text())
    c.assert_clean()
