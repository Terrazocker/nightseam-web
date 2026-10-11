"""REV-014–019: actual crop, metadata navigation, keyboard and history controls."""
from harness import check
from web_suite import boot, open_editor, crop_drag, paint
from phase1_app_checks import modules


def model(c):
    return c.page.evaluate('async m => (await import(m.horizon)).activePano()', modules())


def expand(c):
    c.page.locator('#ed-profile-confidence').evaluate("e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;}")
    c.page.locator('#ed-landmark-name').evaluate("e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;}")


def change(c, selector, value):
    c.page.locator(selector).evaluate("(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}", str(value))


def rerender(c):
    c.page.evaluate("async m=>(await import(m.horizon)).renderHorizon(document.querySelector('#view'),()=>{})",modules())
    expand(c)


def add(c, name):
    c.page.locator('#ed-landmark-name').fill(name)
    c.page.locator('#ed-landmark-az').fill('20')
    c.page.locator('#ed-landmark-alt').fill('12')
    c.page.locator('#ed-landmark-add').click()


@check('web-review-phase4-native-space-and-pan-lifecycle','web')
def keyboard(c):
    boot(c);open_editor(c);expand(c)
    field=c.page.locator('#ed-landmark-name')
    field.focus();c.page.keyboard.type('East roof')
    c.expect_eq(field.input_value(),'East roof','landmark names accept spaces')
    button=c.page.locator('#ed-eraser');button.focus();c.page.keyboard.press('Space')
    c.expect_eq(button.get_attribute('aria-pressed'),'true','native button Space activation')
    button.click() # restore painting
    canvas=c.page.locator('#pano-canvas');canvas.focus();c.page.keyboard.down('Space')
    c.expect(canvas.evaluate("e=>e.classList.contains('panning')"),'focused canvas enters pan')
    # Holding Space pans without authoring a dab; changing focus releases it.
    before=len(model(c)['strokes']);paint(c)
    c.expect_eq(len(model(c)['strokes']),before,'Space drag pans without paint')
    field.focus();c.page.keyboard.up('Space')
    c.expect(not canvas.evaluate("e=>e.classList.contains('panning')"),'blur releases temporary pan')
    for _ in range(3):rerender(c)
    field=c.page.locator('#ed-landmark-name');field.focus();c.page.keyboard.type('North tree')
    c.expect_eq(field.input_value(),'North tree','rerender removes old keyboard handlers')
    paint(c)
    c.expect(len(model(c)['strokes'])>before,'released Space returns to painting')
    c.assert_clean()


@check('web-review-phase4-undo-revert-control-synchronization','web')
def history_controls(c):
    boot(c);open_editor(c);expand(c)
    change(c,'#ed-az',45)
    c.page.locator('#ed-revert').click()
    c.expect_eq(c.page.locator('#ed-az').input_value(),'0','Revert restores slider value')
    change(c,'#ed-at',65)
    c.expect_eq(model(c)['azOffset'],0,'later calibration cannot restore discarded azimuth')
    add(c,'East roof');add(c,'North tree')
    c.page.locator('[data-lm-remove]').first.click()
    c.page.locator('#ed-undo').click()
    c.expect_eq(c.page.locator('[data-lm="name"]').count(),2,'Undo restores landmark rows')
    c.expect_eq(c.page.locator('[data-lm="name"]').first.input_value(),'East roof')
    c.page.locator('#ed-redo').click()
    c.expect_eq(c.page.locator('[data-lm="name"]').count(),1,'Redo removes restored row')
    row=c.page.locator('[data-lm="name"]').first
    row.fill('North ridge');row.dispatch_event('change')
    c.page.locator('#ed-undo').click()
    c.expect_eq(row.input_value(),'North tree','Undo settles pending landmark edit')
    c.page.locator('#ed-revert').click()
    c.expect_eq(c.page.locator('[data-lm="name"]').count(),0,'Revert restores baseline metadata')
    c.expect_eq(c.page.locator('#ed-at').input_value(),'60','Revert restores altitude control')
    c.page.locator('#ed-undo').click()
    c.expect_eq(c.page.locator('[data-lm="name"]').count(),1,'Revert remains undoable')
    c.assert_clean()


@check('web-review-phase4-confidence-bin-navigation-and-history','web')
def confidence(c):
    boot(c);open_editor(c);expand(c)
    field=c.page.locator('#ed-profile-confidence')
    field.fill('0.7')
    c.expect_eq(model(c)['confidence'][0],0.7,'input updates displayed bin before blur')
    c.page.locator('#ed-undo').click()
    c.expect_eq(field.input_value(),'','first pending edit can Undo without a prior gesture')
    c.page.locator('#ed-redo').click()
    c.expect_eq(field.input_value(),'0.7','Redo restores first confidence entry')
    change(c,'#ed-profile-az',90)
    c.expect_eq(field.input_value(),'','new bin has separate confidence')
    c.expect_eq(model(c)['confidence'][0],0.7,'selector retains old bin confidence')
    field.fill('0.5')
    chart=c.page.locator('#pano-profile');chart.focus();c.page.keyboard.press('ArrowRight')
    c.expect_eq(model(c)['confidence'][180],0.5,'chart keyboard retains previous bin edit')
    change(c,'#ed-profile-az',0)
    field.fill('')
    c.expect_eq(model(c)['confidence'][0],None,'blank explicitly clears confidence')
    c.page.locator('#ed-undo').click()
    c.expect_eq(field.input_value(),'0.7','Undo restores model and bin control together')
    c.page.locator('#ed-redo').click()
    c.expect_eq(field.input_value(),'','Redo restores unassessed confidence')
    field.fill('0.8');rerender(c)
    c.expect_eq(model(c)['confidence'][0],0.8,'same panorama rerender retains immediate input')
    c.expect_in('Unsaved',c.page.locator('#ed-status').inner_text(),'rerender preserves dirty baseline')
    c.page.locator('#ed-profile-confidence').fill('0.85')
    restored=c.page.evaluate("""async m=>{
      const H=await import(m.horizon),checkpoint=H.captureEditorHistory();
      const safety=await H.exportPanosWithImages();
      await H.applyPanosSnapshot({panos:[],activeId:null});
      await H.applyPanosSnapshot(safety);
      const restored=H.restoreEditorHistory(checkpoint);
      H.renderHorizon(document.querySelector('#view'),()=>{});
      return restored && H.horizonUnsaved();
    }""",modules())
    c.expect(restored,'rollback keeps pending confidence and dirty history')
    expand(c);c.page.locator('#ed-undo').click()
    c.expect_eq(model(c)['confidence'][0],0.8,'rollback undo retains pre-input history')
    c.page.locator('#ed-redo').click()
    c.expect_eq(model(c)['confidence'][0],0.85,'rollback redo retains pending confidence')
    c.page.locator('#ed-save').click()
    c.page.reload(wait_until='domcontentloaded');c.page.wait_for_selector('#pano-canvas',state='visible')
    c.expect_eq(model(c)['confidence'][0],0.85,'save/reload retains original bin confidence')
    c.expect_eq(model(c)['confidence'][180],0.5,'save/reload retains other bin confidence')
    c.expect_eq(model(c)['confidence'][181],None,'selection never receives misplaced old value')
    c.assert_clean()


@check('web-review-phase4-crop-effective-band-and-backup','web')
def crop(c):
    boot(c);open_editor(c)
    # Author a centered circular dab, then save it as the editor baseline.
    c.page.evaluate('''async m=>{
      const H=await import(m.horizon),p=H.activePano();
      p.strokes=[{m:'b',x:370,y:180,r:10}];H.computeProfile(p);
      H.renderHorizon(document.querySelector('#view'),()=>{});
    }''',modules())
    c.page.locator('#ed-save').click()
    expected=model(c)['profile'][370]
    c.page.locator('#ed-crop').click();crop_drag(c,0.5,0.5+40/720)
    c.expect_in('expanded to minimum FOV',c.page.locator('#ed-crop-hint').inner_text(),'preview explains effective band')
    c.page.locator('#ed-crop-apply').click()
    p=model(c)
    c.expect_eq(p['fov'],45,'minimum FOV applies to geometry as well as calibration')
    c.expect_eq(p['profile'][370],expected,'world direction and brush altitude survive crop')
    c.expect_eq(p['strokes'][0]['r'],10,'vertical radius unchanged')
    c.expect_eq(p['strokes'][0]['rx'],80,'horizontal radius follows effective crop')
    c.page.locator('#ed-undo').click();c.expect_eq(model(c)['fov'],360)
    c.page.locator('#ed-redo').click();c.expect_eq(model(c)['profile'][370],expected)
    c.page.locator('#ed-save').click()
    result=c.page.evaluate('''async m=>{
      const H=await import(m.horizon),W=await import(m.webstore);
      const bundle=await W.collectBackup(H.getPrefs(),await H.exportPanosWithImages(),'workbench');
      const norm=H.normalizePanos(bundle.panos),staged=W.stageBackup({...bundle,panos:norm});
      await H.applyPanosSnapshot({panos:[],activeId:null});
      await W.restoreBackup({...bundle,panos:norm},null);
      if(!await H.applyPanosSnapshot(staged.panos))throw new Error('Panorama restore failed');
      return {version:bundle.version,p:H.activePano()};
    }''',modules())
    c.expect_eq(result['version'],10,'photo crop/reference backup declares compatible schema')
    c.expect_eq(result['p']['profile'][370],expected,'backup restore keeps cropped geometry')
    c.page.reload(wait_until='domcontentloaded');c.page.wait_for_selector('#pano-canvas',state='visible')
    c.expect_eq(model(c)['strokes'][0]['rx'],80,'reload retains independent horizontal radius')
    c.assert_clean()
