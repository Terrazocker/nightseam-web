"""D/E integrated projection, original bytes and independent-reference acceptance."""
import math
import struct
import zlib
from harness import check
from web_suite import boot, tab, crop_drag
from phase1_app_checks import modules
from review_phase4_horizon_checks import model
from horizon_simple_checks import expand, upload, fit, reference, report


def gradient_png(w=1200,h=600):
    rows=bytearray()
    for y in range(h):
        rows.append(0)
        for x in range(w):rows.extend((round(x/(w-1)*255),round(y/(h-1)*255),40))
    def chunk(tag,payload):
        return struct.pack('>I',len(payload))+tag+payload+struct.pack('>I',zlib.crc32(tag+payload)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b'')


@check('web-horizon-def-rectilinear-pixels-source-history-backup','web')
def conversion(c):
    boot(c);tab(c,'horizon')
    photo=gradient_png()
    c.page.locator('#pano-file').set_input_files({'name':'corrected-camera.png','mimeType':'image/png','buffer':photo})
    c.page.wait_for_selector('#simple-flow:visible');expand(c.page.locator('#photo-type'))
    c.page.locator('#photo-type').select_option('rectilinear')
    c.page.locator('#photo-hfov').fill('90');c.page.locator('#photo-heading').fill('350')
    c.page.locator('#photo-corrected').check();before=model(c)
    c.page.locator('#photo-preview').click()
    c.expect_eq(model(c),before,'conversion preview is atomic')
    c.expect(c.page.locator('#photo-preview-canvas').is_visible(),'actual corrected photo is reviewable')
    c.page.locator('#photo-apply').click();p=model(c);w=p['photoModel']['working']
    c.expect_eq(p['photoModel']['type'],'rectilinear')
    c.expect_eq(p['photoSource']['width'],1200,'source dimensions survive working conversion')
    # Independently derive expected pinhole source pixel at a working-view point.
    x,y=.7,.3
    az=math.radians(w['offset']+x*w['fov']-350);alt=math.radians(w['top']-y*(w['top']-w['bottom']))
    sx=.5+math.tan(az)/2
    sy=.5-math.tan(alt)/math.cos(az)
    c.page.locator('#ed-grid').evaluate("e=>{e.checked=false;e.dispatchEvent(new Event('change'));}")
    actual=c.page.locator('#pano-canvas').evaluate("(e,q)=>Array.from(e.getContext('2d').getImageData(Math.floor(e.width*q[0]),Math.floor(e.height*q[1]),1,1).data).slice(0,3)",[x,y])
    c.expect(abs(actual[0]-sx*255)<3 and abs(actual[1]-sy*255)<3 and actual[2]==40,f'converted pixels follow pinhole angles: {actual}')
    c.page.locator('#ed-undo').click();c.expect_eq(model(c).get('photoModel'),None,'one undo restores original authoring frame')
    c.page.locator('#ed-redo').click();c.expect_eq(model(c)['photoModel'],p['photoModel'])
    # Numeric picks store original source pixels, and fitting uses the working coordinates.
    expand(c.page.locator('#simple-first-x'))
    for key,px,py in [('first',10,80),('second',90,20)]:
        reference(c,key,px,py,(w['offset']+px/100*w['fov'])%360,w['top']-py/100*(w['top']-w['bottom']))
        c.page.locator('#simple-next').click()
    c.page.locator('#simple-apply').click();p=model(c)
    c.expect_eq(p['calibration']['version'],5,'converted references use physical source-orientation evidence')
    c.expect(abs(p['calibration']['references'][0]['x']-.1)>.01,'source pixels differ from angular picking coordinates')
    c.page.locator('#simple-draw').click();c.page.locator('#ed-save').click()
    exported=c.page.evaluate('async m=>(await import(m.horizon)).exportPanosWithImages()',modules())
    c.expect(exported['panos'][0]['image'].startswith('data:image/png;base64,'),'original PNG is retained rather than replaced by a JPEG')
    c.page.reload(wait_until='domcontentloaded');c.page.wait_for_selector('#pano-canvas')
    c.page.wait_for_function("()=>document.querySelector('#pano-canvas').width>0")
    restored=c.page.evaluate('async m=>(await import(m.horizon)).exportPanosWithImages()',modules())
    c.expect_eq(restored['panos'][0]['image'],exported['panos'][0]['image'],'reload preserves exact original bytes')
    c.expect_eq(model(c)['photoModel'],p['photoModel'])
    result=c.page.evaluate("""async m=>{const H=await import(m.horizon),W=await import(m.webstore);
      const b=await W.collectBackup(H.getPrefs(),await H.exportPanosWithImages(),'workbench');
      const bad=structuredClone(b.panos);bad.panos[0].photoModel.working.fov=360;
      const rejected=H.normalizePanos(bad)===null;
      const wrongBytes=structuredClone(b.panos);wrongBytes.panos[0].photoSource.width=600;
      const sourceRejected=H.normalizePanos(wrongBytes)===null;
      const badHeader=structuredClone(b.panos);badHeader.panos[0].image='data:image/png;base64,YQ==';
      const headerRejected=H.normalizePanos(badHeader)===null;
      const staged=W.stageBackup({...b,panos:H.normalizePanos(b.panos)});
      await H.applyPanosSnapshot({panos:[],activeId:null});await H.applyPanosSnapshot(staged.panos);
      return {version:b.version,rejected,sourceRejected,headerRejected,p:H.activePano(),bytes:(await H.exportPanosWithImages()).panos[0].image};}""",modules())
    c.expect_eq(result['version'],10);c.expect(result['rejected'],'unsafe geometry is rejected before restore')
    c.expect(result['sourceRejected'] and result['headerRejected'],'source mismatch and invalid image headers are rejected before any restore writes')
    c.expect_eq(result['bytes'],exported['panos'][0]['image']);c.expect_eq(result['p']['calibration'],p['calibration'])
    c.assert_clean()


@check('web-horizon-def-multiple-fit-check-exclusion-and-promotion','web')
def multiple(c):
    boot(c);upload(c);fit(c);c.page.locator('#simple-apply').click()
    expand(c.page.locator('#simple-extra-role'))
    reference(c,'extra',50,50,30,15);c.page.locator('#simple-extra-add').click()
    c.expect_eq(len(model(c)['calibration']['references']),2,'additional fit remains preview until Apply')
    c.page.locator('#simple-apply').click();c.expect_eq(len(model(c)['calibration']['references']),3)
    c.expect_eq(model(c)['calibration']['version'],4)
    c.page.locator('#ed-undo').click();c.expect_eq(model(c)['calibration']['version'],3)
    c.page.locator('#ed-redo').click();c.expect_eq(len(model(c)['calibration']['references']),3)
    expand(c.page.locator('#simple-extra-role'));c.page.locator('#simple-extra-role').select_option('check')
    for px,py,az,alt in [(30,40,14,21),(70,70,46,3)]:
        reference(c,'extra',px,py,az,alt);c.page.locator('#simple-extra-add').click()
    c.expect_eq(len(model(c)['calibration']['checks']),2);c.expect_eq(report(c)['status'],'checked')
    c.page.locator('#simple-extra-role').select_option('fit');reference(c,'extra',65,65,200,6)
    before=model(c);c.page.locator('#simple-extra-add').click()
    c.expect(c.page.locator('#simple-apply').is_disabled(),'conflicting fit cannot be applied')
    c.expect_eq(model(c),before,'conflicting preview leaves the live model intact')
    c.page.locator('#simple-extra-list input').nth(3).uncheck();c.page.locator('#simple-apply').click()
    c.expect(model(c)['calibration']['references'][3]['excluded'],'suspect point remains explicitly recorded')
    box=c.page.locator('#simple-extra-list input').nth(3);box.focus();box.press('Space')
    c.expect_eq(c.page.evaluate("()=>document.activeElement.dataset.refIndex"),'3','keyboard exclusion preserves focus through list refresh')
    box.press('Space')
    c.page.get_by_role('button',name='Use for fitting',exact=True).first.click()
    c.expect_eq(len(model(c)['calibration']['checks']),1,'promoting a check removes its independent role immediately')
    c.page.locator('#simple-apply').click();c.expect_eq(len(model(c)['calibration']['references']),5)
    c.page.locator('#simple-draw').click();c.page.locator('#ed-save').click()
    before=model(c)['calibration'];c.page.reload(wait_until='domcontentloaded');c.page.wait_for_selector('#pano-canvas')
    c.expect_eq(model(c)['calibration'],before,'roles and exclusions survive save/reload')
    c.page.locator('#ed-crop').click();crop_drag(c,.25,.75);c.page.locator('#ed-crop-apply').click()
    c.expect_eq(model(c)['calibration']['references'],before['references'],'cropping retains original references even outside the current view')
    c.page.locator('#setup-open').click()
    c.page.locator('#simple-next').click();c.page.locator('#simple-next').click()
    c.expect(c.page.locator('#simple-draw').is_enabled(),'original references outside the crop remain usable in review')
    c.assert_clean()


@check('web-horizon-def-cylindrical-leveling-crop-authoring','web')
def cylindrical(c):
    boot(c);tab(c,'horizon')
    c.page.locator('#pano-file').set_input_files({'name':'cylinder.png','mimeType':'image/png','buffer':gradient_png(900,700)})
    c.page.wait_for_selector('#simple-flow:visible');expand(c.page.locator('#photo-type'))
    c.page.locator('#photo-type').select_option('cylindrical')
    for key,val in [('hfov',100),('heading',350),('pitch',10),('roll',-7),('top',65),('bottom',-10)]:c.page.locator('#photo-'+key).fill(str(val))
    c.page.locator('#photo-preview').click();c.page.locator('#photo-apply').click();p=model(c);w=p['photoModel']['working']
    # Independent inverse GPano rotation Rz(-H) Rx(P) Ry(R), followed by cylindrical projection.
    x,y=.65,.45;az=math.radians(w['offset']+x*w['fov']);alt=math.radians(w['top']-y*(w['top']-w['bottom']))
    e,n,u=math.sin(az)*math.cos(alt),math.cos(az)*math.cos(alt),math.sin(alt)
    h,t,r=map(math.radians,[350,10,-7])
    e,n=math.cos(h)*e-math.sin(h)*n,math.sin(h)*e+math.cos(h)*n
    n,u=math.cos(t)*n+math.sin(t)*u,-math.sin(t)*n+math.cos(t)*u
    e,u=math.cos(r)*e-math.sin(r)*u,math.sin(r)*e+math.cos(r)*u
    sx=.5+math.degrees(math.atan2(e,n))/100
    sy=(math.tan(math.radians(65))-u/math.hypot(e,n))/(math.tan(math.radians(65))-math.tan(math.radians(-10)))
    c.page.locator('#ed-grid').evaluate("e=>{e.checked=false;e.dispatchEvent(new Event('change'));}")
    actual=c.page.locator('#pano-canvas').evaluate("(e,q)=>Array.from(e.getContext('2d').getImageData(Math.floor(e.width*q[0]),Math.floor(e.height*q[1]),1,1).data).slice(0,3)",[x,y])
    c.expect(abs(actual[0]-sx*255)<3 and abs(actual[1]-sy*255)<3,'leveled cylindrical pixels agree with independent rotation and nonlinear vertical mapping')
    for key,px,py in [('first',10,80),('second',90,20)]:
        reference(c,key,px,py,(w['offset']+px/100*w['fov'])%360,w['top']-py/100*(w['top']-w['bottom']));c.page.locator('#simple-next').click()
    c.page.locator('#simple-apply').click();c.page.locator('#simple-draw').click()
    cv=c.page.locator('#pano-canvas');cv.scroll_into_view_if_needed();b=cv.bounding_box()
    for px,py in [(.1,.75),(.5,.4),(.9,.7)]:c.page.mouse.click(b['x']+b['width']*px,b['y']+b['height']*py)
    c.expect_eq(len(model(c)['strokes'][0]['points']),3,'converted image uses the existing skyline authoring path')
    before=model(c);c.page.locator('#ed-crop').click();crop_drag(c,.2,.8);c.page.locator('#ed-crop-apply').click()
    c.expect_eq(model(c)['photoModel'],before['photoModel'],'working crop leaves original projection intact')
    c.page.locator('#ed-undo').click();c.expect_eq(model(c)['sourceRect'],before['sourceRect'])
    c.page.locator('#ed-redo').click();c.page.locator('#ed-save').click();after=model(c)
    c.page.reload(wait_until='domcontentloaded');c.page.wait_for_selector('#pano-canvas')
    c.expect_eq(model(c)['sourceRect'],after['sourceRect']);c.expect_eq(model(c)['strokes'],after['strokes'])
    c.assert_clean()


@check('web-horizon-def-primary-check-upgrade-and-rejected-role-change','web')
def primary_check(c):
    boot(c);upload(c);fit(c);c.page.locator('#simple-apply').click()
    c.page.locator('#simple-check-open').click();reference(c,'check',30,40,14,21)
    c.page.locator('#simple-check-apply').click();first=model(c)['calibration']['check']
    c.page.locator('#simple-back').click();expand(c.page.locator('#simple-extra-role'))
    reference(c,'extra',50,50,30,15);c.page.locator('#simple-extra-add').click();c.page.locator('#simple-apply').click()
    c.expect_eq(model(c)['calibration']['checks'],[first],'same-session v3-to-v4 fitting preserves the earlier independent check')
    c.page.locator('#simple-extra-role').select_option('check');reference(c,'extra',70,70,46,3);c.page.locator('#simple-extra-add').click()
    before=model(c);c.page.locator('#simple-check-open').click();reference(c,'check',70,70,46,3)
    c.page.locator('#simple-check-apply').click();c.expect_eq(model(c),before,'duplicate replacement leaves live evidence unchanged')
    c.page.locator('#simple-back').click();c.expect(c.page.locator('#simple-draw').is_enabled(),'rejected replacement leaves fit/check drafts usable')
    # A fitting feature may be recorded as an explicitly non-independent check, but cannot be promoted twice.
    reference(c,'extra',50,50,30,15);c.page.locator('#simple-extra-add').click();before=model(c)
    c.page.get_by_role('button',name='Use for fitting',exact=True).last.click()
    c.expect_eq(model(c),before,'duplicate promotion validates before removing the check role')
    c.assert_clean()


@check('web-horizon-def-metadata-stale-and-large-tall-source-limits','web')
def metadata_limits(c):
    boot(c);tab(c,'horizon')
    packet=b'<rdf:Description xmlns:GPano="http://ns.google.com/photos/1.0/panorama/" GPano:ProjectionType="equirectangular" GPano:FullPanoWidthPixels="4000" GPano:FullPanoHeightPixels="2000" GPano:CroppedAreaImageWidthPixels="1200" GPano:CroppedAreaImageHeightPixels="600" GPano:CroppedAreaLeftPixels="1000" GPano:CroppedAreaTopPixels="500" GPano:PoseHeadingDegrees="350"/>'
    def with_metadata(photo):
        data=b'XMP\0'+packet;tag=b'tEXt'
        return photo[:33]+struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)+photo[33:]
    def load(photo,name):
        previous=model(c)['id'] if c.page.locator('#pano-canvas').count() else None
        c.page.locator('#pano-file').set_input_files({'name':name,'mimeType':'image/png','buffer':photo})
        c.page.wait_for_function("async q=>(await import(q.module)).activePano()?.id!==q.previous",arg={'module':modules()['horizon'],'previous':previous})
        c.page.wait_for_selector('#simple-flow:visible');expand(c.page.locator('#photo-type'))
        c.page.wait_for_function("async m=>{const p=(await import(m)).activePano(),e=document.querySelector('#pano-canvas');return p?.photoSource&&Math.abs(e.width/e.height-p.photoSource.width/p.photoSource.height)<.02;}",arg=modules()['horizon'])
    load(with_metadata(gradient_png()),'metadata.png')
    c.expect_eq(model(c)['photoSource']['metadata']['status'],'detected')
    c.expect_eq(float(c.page.locator('#photo-hfov').input_value()),108)
    c.page.locator('#photo-preview').click();c.page.locator('#photo-apply').click()
    c.expect_eq(model(c)['photoModel']['lonCenter'],-36,'cropped metadata retains the full-panorama angular offset')
    c.page.locator('#ed-save').click()
    load(with_metadata(gradient_png(600,300)),'stale.png')
    c.expect_eq(model(c)['photoSource']['metadata']['status'],'invalid','stale resized metadata remains a manual-review prompt')
    c.page.locator('#ed-save').click()
    load(gradient_png(300,1800),'tall.png')
    c.page.locator('#photo-type').select_option('rectilinear');c.page.locator('#photo-corrected').check();c.page.locator('#photo-hfov').fill('60')
    c.page.locator('#photo-preview').click()
    size=c.page.locator('#photo-preview-canvas').evaluate('e=>[e.width,e.height]')
    c.expect(size[0]*size[1]<=2000000 and max(size)<=2400,'tall source has a bounded working surface')
    c.page.locator('#photo-apply').click();c.page.locator('#ed-save').click()
    load(gradient_png(3000,2000),'large.png')
    c.page.locator('#photo-preview').click()
    size=c.page.locator('#photo-preview-canvas').evaluate('e=>[e.width,e.height]')
    c.expect(size[0]*size[1]<=2000000 and max(size)<=2400,'large source has a bounded working surface')
    c.expect_eq(model(c)['photoSource']['width'],3000,'working pixel cap does not shrink the retained source')
    c.assert_clean()
