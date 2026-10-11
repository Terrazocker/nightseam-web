"""Image-first calibration, uncovered photo edges and simple skyline editing."""
from harness import check
from web_suite import boot, tab, horizon_test_png
from phase1_app_checks import modules
from review_phase4_horizon_checks import model


def upload(c):
    c.page.set_viewport_size({'width':1400,'height':1100})
    tab(c,'horizon')
    c.page.locator('#pano-file').set_input_files({'name':'two-points.png','mimeType':'image/png','buffer':horizon_test_png(1600,500)})
    c.page.wait_for_selector('#simple-flow:visible')
    c.page.wait_for_function("()=>document.querySelector('#pano-canvas').width/document.querySelector('#pano-canvas').height>3")


def expand(control):
    control.evaluate("e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;}")


def reference(c,key,x,y,azimuth,altitude):
    for field,value in [('x',x),('y',y),('azimuth',azimuth),('altitude',altitude)]:
        el=c.page.locator(f'#simple-{key}-{field}');expand(el);el.fill(str(value))


def fit(c,width=80,offset=350,projection='equirectangular'):
    expand(c.page.locator('#simple-projection'));c.page.locator('#simple-projection').select_option(projection)
    if width==360:c.page.locator('#simple-full360').check()
    reference(c,'first',10,80,(offset+width*.1)%360,-3)
    c.page.locator('#simple-next').click()
    reference(c,'second',90,20,(offset+width*.9)%360,33)
    c.page.locator('#simple-next').click()


def report(c):
    return c.page.evaluate("async m=>{const H=await import(m.horizon),C=await import('./core.js');return C.photoCalibrationReport(H.activePano());}",modules())


@check('web-horizon-simple-fit-check-trace-roundtrip','web')
def workflow(c):
    boot(c);upload(c)
    before=model(c);fit(c)
    c.expect_eq(model(c),before,'review preview cannot change live planning geometry')
    c.expect_in('80.0°',c.page.locator('#simple-preview').inner_text())
    c.expect(c.page.locator('#simple-draw').is_disabled(),'preview must be explicitly applied')
    c.page.locator('#simple-apply').click()
    c.expect_in('Applied:',c.page.locator('#simple-preview').inner_text(),'review reflects the applied alignment')
    c.expect(c.page.locator('#simple-apply').is_disabled(),'same alignment cannot create another history entry')
    p=model(c);c.expect(abs(p['fov']-80)<1e-7 and abs(p['azOffset']-350)<1e-7,'two complete refs solve coverage and offset')
    c.expect_eq(report(c)['status'],'aligned','two fitted points are not independent verification')
    c.page.locator('#simple-check-open').click();reference(c,'check',50,50,30,15)
    c.page.locator('#simple-check-apply').click();c.expect_eq(report(c)['status'],'checked')
    c.page.locator('#simple-check-draw').click()
    c.expect_eq(c.page.locator('#ed-tool').input_value(),'trace','skyline is the default drawing tool')
    c.expect(not c.page.locator('.horizon-advanced').evaluate('e=>e.open'),'advanced editing stays quiet')
    c.expect(not c.page.locator('.horizon-profile-panel').evaluate('e=>e.open'),'profile starts collapsed')
    cv=c.page.locator('#pano-canvas');cv.scroll_into_view_if_needed();b=cv.bounding_box()
    for x,y in [(.1,.75),(.5,.4),(.9,.7)]:c.page.mouse.click(b['x']+b['width']*x,b['y']+b['height']*y)
    c.page.locator('#ed-point-remove').click()
    c.expect_eq(len(model(c)['strokes'][0]['points']),2,'nearby removal is discoverable and removes selected point')
    c.page.locator('#ed-undo').click();c.expect_eq(len(model(c)['strokes'][0]['points']),3,'removal is undoable')
    c.page.locator('#ed-save').click();c.page.reload(wait_until='domcontentloaded');c.page.wait_for_selector('#pano-canvas')
    c.expect(not c.page.locator('#simple-flow').is_visible(),'saved horizon opens directly for editing')
    c.expect_eq(report(c)['status'],'checked','complete refs and independent check survive saving')
    c.expect(c.page.locator('#ed-point-remove').is_visible(),'saved skyline opens with editable points without visiting Advanced')
    c.page.screenshot(path=str(c.artifacts/'horizon-simple-drawing.png'),full_page=True)
    c.assert_clean()


@check('web-horizon-accuracy-balanced-width-residuals-and-conditioning','web')
def measured_accuracy(c):
    boot(c);upload(c)
    expand(c.page.locator('#simple-projection'));c.page.locator('#simple-projection').select_option('equirectangular')
    c.page.locator('#simple-full360').check()
    reference(c,'first',10,80,35.6,-3);c.page.locator('#simple-next').click()
    reference(c,'second',90,20,324.4,33);c.page.locator('#simple-next').click()
    c.expect_in('+0.40° bearing',c.page.locator('#simple-preview').inner_text(),'review exposes constrained fit residuals')
    c.page.locator('#simple-apply').click();p=model(c)
    c.expect(abs(p['azOffset'])<1e-7 and p['fov']==360,'known width balances both measured bearings')
    c.expect_eq(p['calibration']['version'],3,'saved evidence declares changed fitting semantics')
    c.page.locator('#simple-check-open').click();reference(c,'check',50,50,180,15)
    c.page.locator('#simple-check-apply').click();c.expect_eq(report(c)['status'],'checked')
    c.page.locator('#simple-check-draw').click();c.page.locator('#ed-save').click()
    c.page.reload(wait_until='domcontentloaded');c.page.wait_for_selector('#pano-canvas')
    c.expect_eq(report(c)['status'],'checked','balanced evidence survives saving and reload')
    c.page.locator('#setup-open').click()
    expand(c.page.locator('#simple-full360'));c.page.locator('#simple-full360').uncheck()
    reference(c,'first',45,45,36,18);c.page.locator('#simple-next').click()
    reference(c,'second',55,55,44,12);c.page.locator('#simple-next').click()
    c.expect_in('10.0×',c.page.locator('#simple-preview').inner_text(),'extrapolation sensitivity is visible before Apply')
    c.assert_clean()


@check('web-horizon-simple-full-crop-history','web')
def full_crop(c):
    from web_suite import crop_drag
    boot(c);upload(c);fit(c,width=360,offset=265)
    c.page.locator('#simple-apply').click();before=model(c)
    c.expect_eq(before['fov'],360,'confirmed full panorama remains 360 degrees')
    c.page.locator('#simple-draw').click();c.page.locator('#ed-crop').click()
    c.page.locator('#pano-canvas').scroll_into_view_if_needed();crop_drag(c,.05,.95)
    c.page.locator('#ed-crop-apply').click();cropped=model(c)
    c.expect(abs(cropped['fov']-324)<2,'crop retains a known angular band')
    c.expect_eq(cropped['calibration']['references'],before['calibration']['references'],'references stay in original-photo coordinates')
    c.expect_eq(report(c)['status'],'aligned','crop keeps two-point alignment valid')
    c.page.locator('#ed-undo').click();c.expect_eq(model(c)['fov'],360,'crop and references share history')
    c.page.locator('#ed-undo').click();c.expect_eq(model(c)['calibration']['version'],1,'entire fit is one undo step')
    c.page.locator('#ed-redo').click();c.expect_eq(model(c)['calibration']['version'],3,'redo restores versioned constrained fitting evidence')
    c.assert_clean()


@check('web-horizon-simple-preview-cancel-invalid-and-rulers','web')
def preview(c):
    boot(c);upload(c);before=model(c);fit(c,projection='unknown')
    c.page.locator('#simple-cancel').click();c.expect_eq(model(c),before,'canceling unapplied preview leaves model intact')
    c.page.locator('#setup-open').click();fit(c,width=360)
    c.page.locator('#simple-back').click();reference(c,'second',90,20,20,33);c.page.locator('#simple-next').click()
    c.expect(c.page.locator('#simple-apply').is_disabled(),'contradictory confirmed full360 cannot be applied')
    c.expect_eq(model(c),before,'failed fit is atomic')
    c.page.locator('#simple-cancel').click()
    c.page.locator('#ed-grid').evaluate("e=>{e.checked=false;e.dispatchEvent(new Event('change',{bubbles:true}));}")
    c.page.wait_for_timeout(100)
    edges=c.page.evaluate("""()=>{const cv=document.querySelector('#pano-canvas'),ctx=cv.getContext('2d');
      const rgb=(x,y)=>Array.from(ctx.getImageData(Math.floor(cv.width*x),Math.floor(cv.height*y),1,1).data).slice(0,3);
      const r=cv.getBoundingClientRect(),t=document.querySelector('#pano-ruler-top').getBoundingClientRect(),l=document.querySelector('#pano-ruler-left').getBoundingClientRect();
      return {left:rgb(.01,.3),top:rgb(.5,.01),topOutside:t.bottom<=r.top+1,leftOutside:l.right<=r.left+1};}""")
    c.expect_eq(edges['left'],[220,70,75],'left photo pixels are not covered by ruler')
    c.expect_eq(edges['top'],[65,145,110],'top photo pixels are not covered by ruler')
    c.expect(edges['topOutside'] and edges['leftOutside'],'rulers occupy separate margins')
    cv=c.page.locator('#pano-canvas');cv.scroll_into_view_if_needed()
    count=len(model(c)['strokes']);c.page.locator('#pano-ruler-left').click(position={'x':10,'y':30})
    c.expect_eq(len(model(c)['strokes']),count,'ruler clicks cannot paint')
    c.assert_clean()


@check('web-horizon-simple-picking-drag-and-phone','web')
def picking(c):
    boot(c);upload(c)
    c.page.locator('[data-simple-pick="first"]').click();cv=c.page.locator('#pano-canvas');b=cv.bounding_box()
    c.page.mouse.move(b['x']+b['width']*.25,b['y']+b['height']*.6);c.page.mouse.down()
    c.page.mouse.move(b['x']+b['width']*.3,b['y']+b['height']*.7);c.page.mouse.up()
    c.expect(abs(float(c.page.locator('#simple-first-x').input_value())-30)<.2,'owned reference gesture supports dragging')
    c.expect_eq(len(model(c)['strokes']),0,'reference gestures never paint')
    c.page.locator('#simple-first-azimuth').fill('14');c.page.locator('#simple-first-altitude').fill('0')
    c.page.locator('#simple-next').click();c.page.locator('#ed-zoom-in').click()
    c.page.locator('[data-simple-pick="second"]').click();b=cv.bounding_box()
    c.page.mouse.click(b['x']+b['width']*.75,b['y']+b['height']*.3)
    c.expect(abs(float(c.page.locator('#simple-second-x').input_value())-70)<.2,'pick uses inverse zoom with exterior rulers')
    for width in (900,640,360):
        c.page.set_viewport_size({'width':width,'height':700})
        for sel in ('#simple-second-azimuth','#simple-second-altitude','#simple-next','#ed-save','#ed-zoom-in'):
            el=c.page.locator(sel);el.scroll_into_view_if_needed()
            c.expect(el.evaluate('e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}'),f'{sel} reachable at {width}')
        c.expect(c.page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),f'no overflow at {width}')
    c.page.screenshot(path=str(c.artifacts/'horizon-simple-phone.png'),full_page=True)
    c.assert_clean()


@check('web-horizon-simple-backup-v8-and-approximate','web')
def backup(c):
    boot(c);upload(c);fit(c,projection='other');c.page.locator('#simple-apply').click()
    c.expect_eq(report(c)['status'],'approximate','ordinary photos cannot claim precise projection support')
    c.page.locator('#simple-draw').click();c.page.locator('#ed-save').click()
    result=c.page.evaluate("""async m=>{const H=await import(m.horizon),W=await import(m.webstore);
      const b=await W.collectBackup(H.getPrefs(),await H.exportPanosWithImages(),'workbench');
      const bad=structuredClone(b.panos);bad.panos[0].calibration.references[1].altitude=NaN;
      const rejected=H.normalizePanos(bad)===null;const norm=H.normalizePanos(b.panos),staged=W.stageBackup({...b,panos:norm});
      await H.applyPanosSnapshot({panos:[],activeId:null});await W.restoreBackup({...b,panos:norm},null);
      if(!await H.applyPanosSnapshot(staged.panos))throw new Error('Restore failed');
      return {version:b.version,rejected,p:H.activePano()};}""",modules())
    c.expect_eq(result['version'],10,'older clients must reject rather than reinterpret constrained fitting evidence')
    c.expect(result['rejected'],'invalid complete refs are rejected before restore')
    c.expect_eq(len(result['p']['calibration']['references']),2,'backup retains complete source-coordinate refs')
    c.assert_clean()


@check('web-horizon-accuracy-narrow-profile-save-backup-roundtrip','web')
def narrow_profile(c):
    from web_suite import open_editor
    boot(c);open_editor(c)
    result=c.page.evaluate("""async m=>{const H=await import(m.horizon),p=H.activePano();
      Object.assign(p,{fov:45,azOffset:0,altBottom:0,altTop:60,paintMode:'obstacle',
        strokes:[{m:'trace',points:[[3.1,100.9],[3.8,100.9]]}]});
      H.computeProfile(p);await H.importPanos({panos:[p],activeId:p.id});
      H.renderHorizon(document.querySelector('#view'),()=>{});
      return {p:H.activePano(),lookup:H.ceilFor(H.activePano(),.25)};}""",modules())
    expected=60-100/359*60
    c.expect(abs(result['p']['profile'][0]-expected)<1e-9,'sub-column trace survives conservative planning bin')
    c.expect_eq(result['lookup']['ceil'],result['p']['profile'][0],'planner reads the derived obstruction')
    c.page.locator('#ed-save').click();c.page.reload(wait_until='domcontentloaded')
    c.page.wait_for_selector('#pano-canvas')
    c.expect(abs(model(c)['profile'][0]-expected)<1e-9,'save and reload keep narrow obstruction')
    result=c.page.evaluate("""async m=>{const H=await import(m.horizon),W=await import(m.webstore);
      const b=await W.collectBackup(H.getPrefs(),await H.exportPanosWithImages(),'workbench');
      const staged=W.stageBackup({...b,panos:H.normalizePanos(b.panos)});
      await H.applyPanosSnapshot({panos:[],activeId:null});
      if(!await H.applyPanosSnapshot(staged.panos))throw new Error('Restore failed');
      return H.activePano();}""",modules())
    c.expect(abs(result['profile'][0]-expected)<1e-9,'backup restores the same narrow profile')
    c.expect_eq(result['strokes'][0]['points'],[[3.1,100.9],[3.8,100.9]],'source trace remains editable')
    c.assert_clean()
