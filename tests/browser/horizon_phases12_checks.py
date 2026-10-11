"""Photo crop, gesture lifecycle and pixel-space editor acceptance."""
import json
import subprocess

from harness import ROOT, Ctx, _attach, _new_context, check
from web_suite import boot, open_editor, crop_drag, paint, horizon_test_png
from phase1_app_checks import modules
from review_phase4_horizon_checks import model, change, rerender


@check('web-horizon-phases12-photo-crop-history-roundtrip', 'web')
def photo_crop(c):
    boot(c); open_editor(c)
    c.page.locator('#pano-file').set_input_files({
        'name':'crop.png', 'mimeType':'image/png', 'buffer':horizon_test_png(720,180)})
    c.page.wait_for_function("() => document.querySelector('#pano-canvas').width / document.querySelector('#pano-canvas').height > 3.9")
    c.page.evaluate('''async m=>{
      const H=await import(m.horizon),NativeImage=window.Image;
      window.Image=function(){const img=new NativeImage();window.previousPhoto=img;return img;};
      H.renderHorizon(document.querySelector('#view'),()=>{});window.Image=NativeImage;
    }''',modules())
    c.page.wait_for_function('() => window.previousPhoto.complete && window.previousPhoto.naturalWidth>0')
    c.page.evaluate('async m=>(await import(m.horizon)).renderHorizon(document.querySelector("#view"),()=>{})',modules())
    paint(c)
    profile_before=model(c)['profile']
    c.page.evaluate('window.previousPhoto.onload()')
    c.expect_eq(model(c)['profile'],profile_before,'late photo decode cannot corrupt a replacement editor profile')
    c.page.evaluate('''async m=>{
      const H=await import(m.horizon),p=H.activePano();
      p.strokes=[{m:'b',x:180,y:180,r:8}];H.computeProfile(p);
      H.renderHorizon(document.querySelector('#view'),()=>{});
      const original=CanvasRenderingContext2D.prototype.drawImage;
      window.photoDraws=[];
      CanvasRenderingContext2D.prototype.drawImage=function(...args){
        if(this.canvas.id==='pano-canvas' && args[0] instanceof HTMLImageElement)
          window.photoDraws.push(args.slice(1));
        return original.apply(this,args);
      };
    }''',modules())
    c.page.locator('#ed-save').click()
    expected=model(c)['profile'][180]
    c.page.locator('#ed-crop').click();crop_drag(c,.125,.875)
    c.page.locator('#ed-crop-apply').click()
    p=model(c)
    c.expect(abs(p['sourceRect']['x']-.125)<.002 and abs(p['sourceRect']['w']-.75)<.002,
             'photo crop uses the same effective band as mask/calibration')
    c.expect_eq(p['profile'][180],expected,'first crop keeps world obstruction')
    draws=c.page.evaluate('window.photoDraws.at(-1)')
    c.expect(len(draws)==8 and abs(draws[0]-90)<2 and abs(draws[2]-540)<2,
             f'original image is sampled from its retained source band: {draws}')
    c.page.locator('#ed-crop').click();crop_drag(c,0,.5)
    c.page.locator('#ed-crop-apply').click()
    twice=model(c)
    c.expect(abs(twice['sourceRect']['w']-.375)<.004,'repeat crop composes original-photo coordinates')
    c.expect_eq(twice['profile'][180],expected,'repeat crop keeps world obstruction')
    c.page.locator('#ed-undo').click();c.expect(abs(model(c)['sourceRect']['w']-.75)<.002,'undo restores photo crop')
    c.page.locator('#ed-redo').click()
    c.page.locator('#ed-save').click()
    result=c.page.evaluate('''async m=>{
      const H=await import(m.horizon),W=await import(m.webstore);
      const bundle=await W.collectBackup(H.getPrefs(),await H.exportPanosWithImages(),'workbench');
      await H.applyPanosSnapshot({panos:[],activeId:null});
      const norm=H.normalizePanos(bundle.panos),staged=W.stageBackup({...bundle,panos:norm});
      await W.restoreBackup({...bundle,panos:norm},null);
      if(!await H.applyPanosSnapshot(staged.panos))throw new Error('Panorama restore failed');
      return {version:bundle.version,p:H.activePano()};
    }''',modules())
    c.expect_eq(result['version'],10)
    c.expect_eq(result['p']['sourceRect'],twice['sourceRect'],'backup restores photo crop exactly')
    c.page.reload(wait_until='domcontentloaded');c.page.wait_for_selector('#pano-canvas')
    c.expect_eq(model(c)['sourceRect'],twice['sourceRect'],'reload restores photo crop exactly')
    c.page.wait_for_function("() => {const c=document.querySelector('#pano-canvas');return c.width/c.height>1.4 && c.width/c.height<1.6;}")
    c.assert_clean()


@check('web-horizon-phases12-sparse-owned-cancelled-gestures', 'web')
def gestures(c):
    boot(c);open_editor(c);change(c,'#ed-brush',3)
    canvas=c.page.locator('#pano-canvas')
    canvas.evaluate("e=>e.addEventListener('pointerdown',v=>window.testPointer=v.pointerId)")
    box=canvas.bounding_box();y=box['y']+box['height']*.5
    c.page.mouse.move(box['x']+box['width']*.15,y);c.page.mouse.down()
    before=len(model(c)['strokes'])
    canvas.evaluate("e=>{e.dispatchEvent(new PointerEvent('pointerdown',{pointerId:999,button:0}));e.dispatchEvent(new PointerEvent('pointermove',{pointerId:999,clientX:0,clientY:0}));e.dispatchEvent(new PointerEvent('pointercancel',{pointerId:999}));}")
    c.expect_eq(len(model(c)['strokes']),before,'another pointer cannot paint or cancel owned gesture')
    c.page.mouse.move(box['x']+box['width']*.85,y)  # one sparse sample
    canvas.evaluate("e=>e.dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.testPointer}))")
    c.page.mouse.up()
    c.expect(len(model(c)['strokes'])>200,'sparse motion interpolates continuous paint')
    covered=c.page.evaluate('''async m=>{
      const H=await import(m.horizon),C=await import('./core.js'),p=H.activePano();
      const mask=C.rebuildMask(p.strokes,true);
      const row=Math.round(p.strokes[0].y);
      return {row,first:p.strokes[0],last:p.strokes.at(-1),
        covered:Array.from({length:490},(_,i)=>mask[row*720+110+i]).every(v=>v===255)};
    }''',modules())
    c.expect(covered['covered'],f'fast drag has no unpainted gaps: {covered}')
    c.page.locator('#ed-undo').click();c.expect_eq(len(model(c)['strokes']),0,'cancelled paint is one undo step')
    c.page.locator('#ed-redo').click();saved=len(model(c)['strokes'])
    # Loss of capture and window blur settle their visible edits separately.
    for end in ('capture','blur'):
        box=canvas.bounding_box();c.page.mouse.move(box['x']+box['width']*.4,box['y']+box['height']*.7)
        c.page.mouse.down();c.page.mouse.move(box['x']+box['width']*.6,box['y']+box['height']*.7)
        if end=='capture':canvas.evaluate('e=>e.releasePointerCapture(window.testPointer)')
        else:c.page.evaluate("window.dispatchEvent(new Event('blur'))")
        c.page.mouse.up();c.page.locator('#ed-undo').click()
        c.expect_eq(len(model(c)['strokes']),saved,f'{end} retains one undoable gesture')
    c.page.locator('#ed-save').click();c.page.reload(wait_until='domcontentloaded')
    c.page.wait_for_selector('#pano-canvas');c.expect_eq(len(model(c)['strokes']),saved,'settled strokes save/reload')
    c.assert_clean()


@check('web-horizon-phases12-state-calibration-and-band', 'web')
def state(c):
    boot(c);open_editor(c)
    c.page.evaluate('''async m=>{const H=await import(m.horizon),p=H.activePano();
      p.altBottom=90;p.altTop=95;H.updatePano(p);}''',modules())
    c.page.reload(wait_until='domcontentloaded');c.page.wait_for_selector('#pano-canvas')
    c.expect_eq(model(c)['altBottom'],85,'legacy local invalid bounds repaired on load')
    c.expect_eq(c.page.locator('#ed-at').input_value(),'90','reopened controls match repaired model')
    change(c,'#ed-ab',90)
    c.expect_eq(model(c)['altBottom'],85);c.expect_eq(model(c)['altTop'],90)
    c.expect_eq(c.page.locator('#ed-at').input_value(),'90','physical bounds and controls agree')
    change(c,'#ed-ab',0);change(c,'#ed-at',60)
    c.page.locator('#ed-mode').evaluate("e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;}")
    c.page.locator('#ed-mode').select_option('sky');paint(c)
    p=model(c);c.expect(p['profileTop'][300]<90,'painted band top remains explicit')
    c.page.locator('#ed-block-above').check()
    c.expect(model(c)['profileTop'][300]<90,'block-above recomputes cached profile immediately')
    c.page.locator('.ed-display summary').click();change(c,'#ed-opacity',35)
    c.page.locator('#ed-grid').uncheck();change(c,'#ed-brush',11)
    c.page.locator('#ed-eraser').click();c.page.locator('#ed-zoom-in').click()
    rerender(c)
    c.expect_eq(c.page.locator('#ed-brush').input_value(),'11')
    c.expect_eq(c.page.locator('#ed-opacity').input_value(),'35')
    c.expect(not c.page.locator('#ed-grid').is_checked(),'grid state survives rerender')
    c.expect_eq(c.page.locator('#ed-eraser').get_attribute('aria-pressed'),'true')
    c.expect_in('1.3',c.page.locator('#ed-zoom-label').inner_text(),'zoom survives rerender')
    for width,height in ((1366,900),(900,700),(640,700),(360,640)):
        c.page.set_viewport_size({'width':width,'height':height});c.page.wait_for_timeout(100)
        c.expect(c.page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),f'no page overflow at {width}')
        for selector in ('#ed-save','#ed-undo','#ed-eraser','#ed-zoom-in'):
            c.page.locator(selector).scroll_into_view_if_needed()
            box=c.page.locator(selector).bounding_box()
            c.expect(box and box['x']>=-1 and box['x']+box['width']<=width+1,f'{selector} reachable at {width}')
            c.expect(box['y']>=-1 and box['y']+box['height']<=height+1,f'{selector} visible at {width}/{height}')
            c.expect(c.page.locator(selector).evaluate('e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}'),
                     f'{selector} hit target unobscured at {width}/{height}')
        c.page.locator('#pano-canvas').scroll_into_view_if_needed()
        c.expect(c.page.locator('#pano-canvas').evaluate('e=>{const r=e.getBoundingClientRect();const y=Math.min(innerHeight-10,r.bottom-10);return y>r.top && document.elementFromPoint(r.x+r.width*.65,y)===e;}'),
                 f'canvas retains an unobscured paint area at {width}/{height}')
        if width==360:c.page.screenshot(path=str(c.artifacts/'horizon-phases12-phone.png'))
    c.assert_clean()


@check('web-horizon-phases12-pixel-rulers-dpr-and-aspect', 'web')
def rulers(c):
    browser=c.page.context.browser
    for dpr in (1,1.5,2):
        context,page=_new_context(browser,dpr=dpr);local=Ctx(page,c.base,'web',c.artifacts);_attach(local)
        try:
            boot(local);open_editor(local)
            page.evaluate('''()=>{
              const original=CanvasRenderingContext2D.prototype.fillText;
              window.rulerText=[];
              CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){
                if(this.canvas.id==='pano-ruler-top' || this.canvas.id==='pano-ruler-left'){
                  const m=this.getTransform();window.rulerText.push({text,x,y,font:this.font,a:m.a,d:m.d});
                }return original.call(this,text,x,y,...rest);
              };
            }''')
            for width,height,fov in ((720,180,360),(320,240,110),(180,360,35)):
                page.locator('#pano-file').set_input_files({'name':'ruler.png','mimeType':'image/png','buffer':horizon_test_png(width,height)})
                page.wait_for_timeout(250);change(local,'#ed-fov',fov)
                for _zoom in range(10):
                    page.evaluate('window.rulerText=[]');page.locator('#ed-zoom-in').click()
                    labels=page.evaluate('window.rulerText')
                    c.expect(any(t['y']==12 for t in labels),'every zoom retains a direction label')
                    c.expect(all('12px' in t['font'] and abs(t['a']-t['d'])<.03 and abs(t['a']-dpr)<.03 for t in labels),
                             f'undistorted CSS-pixel labels at DPR {dpr}, aspect {width}/{height}: {labels[:2]}')
                if dpr==2 and width==720:
                    page.locator('#ed-fit').click();page.locator('#pano-canvas').screenshot(path=str(c.artifacts/'horizon-phases12-rulers.png'))
            local.assert_clean()
        finally:context.close()


@check('web-horizon-phases12-long-history-latency', 'web')
def latency(c):
    """Compare actual synchronous pointer handling and next-frame paint to HEAD.

    Initial target: p95 visible paint <50ms and >=2x faster pointer handling than
    full replay for a 20,000-dab history. Avoid asserting hardware-specific ms
    ceilings on CI; preserve measured evidence and enforce improvement ratio.
    """
    baseline=subprocess.check_output(['git','show','HEAD:web/horizon.js'],cwd=ROOT)
    results={}
    for name in ('before','after'):
        context,page=_new_context(c.page.context.browser);local=Ctx(page,c.base,'web',c.artifacts);_attach(local)
        try:
            if name=='before':page.route('**/horizon.js?v=*',lambda route:route.fulfill(body=baseline,content_type='text/javascript'))
            boot(local);open_editor(local)
            page.locator('#pano-file').set_input_files({'name':'large-latency.png','mimeType':'image/png',
                'buffer':horizon_test_png(4096,1024)})
            page.wait_for_function("() => document.querySelector('#pano-canvas').width / document.querySelector('#pano-canvas').height > 3.9")
            if page.locator('#simple-flow').count() and page.locator('#simple-flow').is_visible():
                page.locator('#simple-cancel').click()
            if page.locator('#ed-tool').count():
                page.locator('#ed-tool').select_option('brush')
            result=page.evaluate('''async m=>{
              const H=await import(m.horizon),p=H.activePano();
              p.strokes=Array.from({length:20000},(_,i)=>({m:'b',x:i%720,y:220,r:8}));
              H.computeProfile(p);H.renderHorizon(document.querySelector('#view'),()=>{});
              for(let frame=0;frame<120 && document.querySelector('#pano-canvas').width /
                  document.querySelector('#pano-canvas').height<3.9;frame++)
                await new Promise(requestAnimationFrame);
              const canvas=document.querySelector('#pano-canvas'),box=canvas.getBoundingClientRect();
              if(canvas.width/canvas.height<3.9)throw new Error('Large photo did not decode for latency probe');
              // The synthetic pointer has explicit capture shims; actual paint
              // handlers/renderers are unchanged and real gestures are tested above.
              canvas.setPointerCapture=()=>{};canvas.hasPointerCapture=()=>false;
              const event=(type,x)=>new PointerEvent(type,{pointerId:77,button:0,
                clientX:box.left+x*box.width,clientY:box.top+box.height*.5});
              const handlers=[],frames=[];
              canvas.dispatchEvent(event('pointerdown',.2));
              for(let i=0;i<40;i++){
                const start=performance.now();canvas.dispatchEvent(event('pointermove',.2+i*.01));
                handlers.push(performance.now()-start);
                await new Promise(requestAnimationFrame);frames.push(performance.now()-start);
              }
              canvas.dispatchEvent(event('pointerup',.6));
              const stats=xs=>{xs.sort((a,b)=>a-b);return {median:xs[20],p95:xs[38],max:xs.at(-1)}};
              return {handler:stats(handlers),frame:stats(frames),dabs:p.strokes.length,
                imagePixels:canvas.width*canvas.height};
            }''',modules())
            results[name]=result;local.assert_clean()
        finally:context.close()
    (c.artifacts/'horizon-phases12-latency.json').write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
    c.expect(results['after']['handler']['median']*2 < results['before']['handler']['median'],
             f'incremental painting materially improves long-history response: {results}')
