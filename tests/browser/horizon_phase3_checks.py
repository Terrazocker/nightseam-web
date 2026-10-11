"""Guided photo setup exercises real controls and transformed canvas picks."""
from harness import check
from web_suite import boot, tab, horizon_test_png, paint, crop_drag
from phase1_app_checks import modules
from review_phase4_horizon_checks import model, rerender, change


def upload(c):
    c.page.set_viewport_size({'width': 1366, 'height': 1100})
    tab(c, 'horizon')
    c.page.locator('#pano-file').set_input_files({
        'name': 'measured.png', 'mimeType': 'image/png', 'buffer': horizon_test_png(1600, 500)})
    c.page.wait_for_selector('#simple-flow:visible')
    c.page.locator('#setup-legacy-open').evaluate("e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;}")
    c.page.locator('#setup-legacy-open').click()
    c.page.wait_for_function("() => document.querySelector('#pano-canvas').width / document.querySelector('#pano-canvas').height > 3")


def step(c, i):
    if not c.page.locator('#setup-flow').is_visible():
        if not c.page.locator('#simple-flow').is_visible():
            c.page.locator('#setup-open').click()
        c.page.locator('#setup-legacy-open').evaluate("e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;}")
        c.page.locator('#setup-legacy-open').click()
    c.page.locator(f'[data-step="{i}"]').click()


def point(c, key, x, y, **angles):
    for name, value in {'x': x, 'y': y, **angles}.items():
        c.page.locator(f'#setup-{key}-{name}').fill(str(value))


def report(c):
    return c.page.evaluate("async m=>{const H=await import(m.horizon),C=await import('./core.js');return C.photoCalibrationReport(H.activePano());}", modules())


def calibrate(c, fov, offset):
    c.page.locator('#setup-coverage-kind').select_option('full' if fov == 360 else 'partial')
    if fov != 360:
        c.page.locator('#setup-width').fill(str(fov))
    c.page.locator('#setup-projection').select_option('equirectangular')
    c.page.locator('#setup-apply-coverage').click()
    step(c, 1)
    point(c, 'bearing', 25, 40, azimuth=(offset + fov * .25) % 360)
    c.page.locator('#setup-apply-bearing').click()
    step(c, 2)
    point(c, 'level', 20, 75, altitude=0)
    point(c, 'scale', 80, 25, altitude=30)
    c.page.locator('#setup-apply-vertical').click()
    step(c, 3)
    point(c, 'check', 60, 50, azimuth=(offset + fov * .6) % 360, altitude=15)
    c.page.locator('#setup-apply-check').click()
    c.expect_eq(report(c)['status'], 'checked', 'independent known angles check both axes')


@check('web-horizon-phase3-guided-full-and-partial', 'web')
def guided(c):
    boot(c)
    for fov, offset in ((360, 350), (80, 265)):
        upload(c)
        c.expect_eq(report(c)['status'], 'assumed', 'new image has no guessed precision claim')
        calibrate(c, fov, offset)
        if fov == 80:
            c.page.evaluate('''() => {
              const prototype=CanvasRenderingContext2D.prototype;
              window.markerStyles=[];window.markerBackgrounds=[];
              window.markerFillText=prototype.fillText;window.markerFillRect=prototype.fillRect;
              prototype.fillRect=function(...args){
                if(this.canvas.id==='pano-canvas' && args[2]===18 && args[3]===20)
                  window.markerBackgrounds.push(this.fillStyle);
                return window.markerFillRect.apply(this,args);
              };
              prototype.fillText=function(...args){
                if(this.canvas.id==='pano-canvas' && ['D','L','V','C'].includes(args[0]))
                  window.markerStyles.push({label:args[0],ink:this.fillStyle,background:window.markerBackgrounds.at(-1)});
                return window.markerFillText.apply(this,args);
              };
            }''')
            step(c, 2)
            c.page.wait_for_timeout(100)
            styles=c.page.evaluate('window.markerStyles.slice(-4)')
            c.expect_eq([s['label'] for s in styles], ['D','L','V','C'], 'all four fitted/check references have image labels')
            c.expect(all(s['ink'] != s['background'] for s in styles), f'marker text remains distinct from every opaque backdrop: {styles}')
            c.page.screenshot(path=str(c.artifacts / 'horizon-phase3-vertical-setup.png'), full_page=True)
            c.page.evaluate('''() => {
              CanvasRenderingContext2D.prototype.fillText=window.markerFillText;
              CanvasRenderingContext2D.prototype.fillRect=window.markerFillRect;
            }''')
            step(c, 3)
        p = model(c)
        c.expect_in(f'{fov}°', c.page.locator('#pano-list input:checked').locator('..').locator('.p-tags').inner_text(), 'horizon list coverage follows the live calibration')
        c.expect(abs(p['azOffset'] - offset) < 1e-7, 'bearing anchor works without North inside the image')
        c.expect(abs(p['altTop'] - 45) < 1e-7 and abs(p['altBottom'] + 15) < 1e-7, 'known references determine level and vertical scale')
        c.expect_in('+0.00°', c.page.locator('#setup-errors').inner_text(), 'discrepancies reported numerically')
        step(c, 4)
        c.page.locator('#pano-canvas').scroll_into_view_if_needed()
        c.page.wait_for_timeout(150)
        paint(c, .58, .62, .5)
        p = model(c)
        azimuth = (offset + fov * .6) % 360
        height = p['profile'][round(azimuth * 2) % 720]
        c.expect(abs(p['strokes'][0]['y'] - 180) < 2, f'paint gesture is at image mid-height: {p["strokes"][0]}')
        c.expect(18 < height < 22, f'painted obstruction uses calibrated world bearing/altitude: {height}')
        c.page.locator('#ed-save').click()
        c.page.reload(wait_until='domcontentloaded')
        c.page.wait_for_selector('#pano-canvas')
        c.expect(not c.page.locator('#setup-flow').is_visible(), 'existing saved image opens directly for editing')
        c.expect_eq(report(c)['status'], 'checked', 'saved reference evidence survives reload')
    c.page.screenshot(path=str(c.artifacts / 'horizon-phase3-checked.png'), full_page=True)
    c.assert_clean()


@check('web-horizon-phase3-evidence-history-crop-backup', 'web')
def persistence(c):
    boot(c); upload(c); calibrate(c, 360, 350)
    saved = model(c)['calibration']
    c.page.locator('#ed-save').click()
    step(c, 1)
    point(c, 'bearing', 25, 40, azimuth=85)
    c.page.locator('#setup-apply-bearing').click()
    c.expect_eq(report(c)['status'], 'approximate', 'independent check catches a five-degree alignment change')
    c.expect(abs(report(c)['azimuthError'] - 5) < 1e-7, 'wrapped residual is signed and shortest-path')
    c.page.locator('#ed-undo').click()
    c.expect_eq(report(c)['status'], 'checked', 'undo restores geometry and evidence together')
    c.expect_eq(model(c)['calibration'], saved, 'history stores deep reference evidence')
    step(c, 4)
    c.page.locator('#ed-crop').click(); crop_drag(c, .1, .9)
    c.page.locator('#ed-crop-apply').click()
    c.expect_eq(report(c)['status'], 'checked', 'crop retains original-coordinate reference identity')
    c.page.locator('#ed-save').click()
    result = c.page.evaluate('''async m=>{
      const H=await import(m.horizon),W=await import(m.webstore),C=await import('./core.js');
      const bundle=await W.collectBackup(H.getPrefs(),await H.exportPanosWithImages(),'workbench');
      const bad=structuredClone(bundle.panos);bad.panos[0].calibration.bearing.x=2;
      const rejected=H.normalizePanos(bad)===null;
      const norm=H.normalizePanos(bundle.panos),staged=W.stageBackup({...bundle,panos:norm});
      await H.applyPanosSnapshot({panos:[],activeId:null});
      await W.restoreBackup({...bundle,panos:norm},null);
      if(!await H.applyPanosSnapshot(staged.panos))throw new Error('restore failed');
      return {version:bundle.version,rejected,e:H.activePano().calibration,status:C.photoCalibrationReport(H.activePano()).status};
    }''', modules())
    c.expect_eq(result['version'], 10, 'new backup format protects constrained fitting evidence and traces from older clients')
    c.expect(result['rejected'], 'malformed reference rejects complete panorama section before writes')
    c.expect_eq(result['e'], saved)
    c.expect_eq(result['status'], 'checked')
    rerender(c)
    c.page.locator('#ed-crop').click(); crop_drag(c, .38, .88)
    c.page.locator('#ed-crop-apply').click()
    c.expect_eq(report(c)['status'], 'approximate', 'a crop that excludes an alignment reference needs a new check')
    c.page.locator('#ed-undo').click(); c.expect_eq(report(c)['status'], 'checked')
    c.assert_clean()


@check('web-horizon-phase3-picks-validation-and-accessibility', 'web')
def controls(c):
    boot(c); upload(c)
    calibrate(c, 80, 265)
    step(c, 2)
    before = model(c)
    point(c, 'scale', 80, 75, altitude=30)
    c.page.locator('#setup-apply-vertical').click()
    c.expect_in('apart', c.page.locator('#setup-message').inner_text(), 'coincident-height references have an actionable error')
    c.expect_eq(model(c), before, 'invalid fit is atomic and leaves geometry/evidence unchanged')
    step(c, 0)
    c.page.locator('#setup-projection').select_option('other')
    c.page.locator('#setup-apply-coverage').click()
    c.expect_eq(report(c)['status'], 'approximate', 'unsupported projection can never claim a checked angular map')
    step(c, 1)
    c.page.locator('#ed-zoom-in').click()
    c.page.locator('[data-pick="bearing"]').click()
    canvas = c.page.locator('#pano-canvas')
    canvas.scroll_into_view_if_needed()
    rect = canvas.bounding_box()
    strokes = len(model(c)['strokes'])
    c.page.evaluate("""()=>{window.draftMarkerX=[];window.draftFillText=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(...a){if(this.canvas.id==='pano-canvas'&&a[0]==='D')window.draftMarkerX.push(a[1]);return window.draftFillText.apply(this,a);};}""")
    c.page.mouse.move(rect['x'] + rect['width'] * .75, rect['y'] + rect['height'] * .6)
    c.page.mouse.down()
    canvas.evaluate("e=>e.dispatchEvent(new PointerEvent('pointerdown',{pointerId:999,button:0,clientX:0,clientY:0}))")
    c.expect_eq(len(model(c)['strokes']), strokes, 'a second pointer cannot paint during a held reference pick')
    c.page.mouse.up()
    c.expect(c.page.evaluate('window.draftMarkerX.length>0'),'advanced picked point has immediate image marker feedback before Apply')
    c.page.evaluate('()=>{CanvasRenderingContext2D.prototype.fillText=window.draftFillText;}')
    c.expect(abs(float(c.page.locator('#setup-bearing-x').input_value()) - 70) < .2, 'off-center pick uses inverse 1.25x zoom geometry')
    c.expect_eq(len(model(c)['strokes']), strokes, 'picking an alignment point cannot paint')
    c.page.locator('[data-pick="bearing"]').focus(); c.page.keyboard.press('Space')
    c.expect_eq(c.page.locator('[data-pick="bearing"]').get_attribute('aria-pressed'), 'true', 'native keyboard activates picking')
    c.page.keyboard.press('Escape')
    c.expect_eq(c.page.locator('[data-pick="bearing"]').get_attribute('aria-pressed'), 'false', 'Escape cancels picking')
    # Exact numeric typing must retain a decimal separator while entering it.
    c.page.locator('.ed-calibration').evaluate("e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;}")
    c.page.locator('.ed-calibration summary').click()
    number = c.page.locator('#ed-az-n'); number.fill(''); number.press_sequentially('12.25'); number.press('Tab')
    c.expect_eq(model(c)['azOffset'], 12.25, 'exact numeric input accepts ordinary decimal typing')
    c.expect_eq(c.page.locator('#ed-az').input_value(), '12.25', 'numeric and fine slider agree')
    change(c, '#ed-fov-n', 65)
    step(c, 4)
    c.expect_eq(c.page.evaluate('document.activeElement.id'), 'pano-canvas', 'entering Paint moves focus out of hidden setup controls')
    c.page.locator('#setup-open').click()
    c.page.locator('#setup-legacy-open').evaluate("e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;}")
    c.page.locator('#setup-legacy-open').click()
    c.expect_eq(c.page.locator('#setup-width').input_value(), '65', 'manual width edits are reflected when setup reopens')
    c.expect_eq(c.page.locator('#setup-coverage-kind').input_value(), 'partial', 'coverage choice follows manual geometry')
    for _ in range(4):
        c.page.locator('#setup-next').focus(); c.page.keyboard.press('Enter')
    c.expect_eq(c.page.evaluate('document.activeElement.id'), 'pano-canvas', 'keyboard progression ends at the visible canvas')
    c.page.locator('#setup-open').click(); step(c, 1)
    rerender(c)
    c.expect(c.page.locator('[data-pane="1"]').is_visible(), 'active setup step survives unrelated rerender')
    for width, height in ((900, 700), (640, 700), (360, 640)):
        c.page.set_viewport_size({'width': width, 'height': height})
        step(c, 3)
        for selector in ('#setup-check-x', '#setup-check-azimuth', '#setup-apply-check', '#setup-next'):
            control = c.page.locator(selector); control.scroll_into_view_if_needed()
            c.expect(control.evaluate('e=>{const r=e.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1 && e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}'), f'{selector} remains reachable at {width}')
        c.expect(c.page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'), f'no overflow at {width}')
    c.page.screenshot(path=str(c.artifacts / 'horizon-phase3-mobile.png'), full_page=True)
    c.assert_clean()
