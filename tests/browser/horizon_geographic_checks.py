"""Source-orientation fitting, check-only geometry and explicit coverage evidence."""
import math
import struct
import zlib

from harness import check
from web_suite import boot, tab
from phase1_app_checks import modules
from review_phase4_horizon_checks import model
from horizon_simple_checks import expand, fit, reference, report, upload
from horizon_def_checks import gradient_png


def source_angles(x, y, *, heading=350, pitch=10, roll=-7, hfov=100, top=60, bottom=0):
    """Independent geographic ray: Ry(roll), Rx(pitch), then Rz(-heading)."""
    longitude=math.radians((x-.5)*hfov)
    latitude=math.radians(top-y*(top-bottom))
    east=math.sin(longitude)*math.cos(latitude)
    north=math.cos(longitude)*math.cos(latitude)
    up=math.sin(latitude)
    h,p,r=map(math.radians,(heading,pitch,roll))
    east,up=math.cos(r)*east+math.sin(r)*up,-math.sin(r)*east+math.cos(r)*up
    north,up=math.cos(p)*north-math.sin(p)*up,math.sin(p)*north+math.cos(p)*up
    east,north=math.cos(h)*east+math.sin(h)*north,-math.sin(h)*east+math.cos(h)*north
    return math.degrees(math.atan2(east,north))%360,math.degrees(math.atan2(up,math.hypot(east,north)))


def photo(c, *, metadata=False):
    tab(c,'horizon')
    png=gradient_png()
    if metadata:
        packet=b'<rdf:Description xmlns:GPano="http://ns.google.com/photos/1.0/panorama/" GPano:ProjectionType="equirectangular" GPano:FullPanoWidthPixels="4000" GPano:FullPanoHeightPixels="2000" GPano:CroppedAreaImageWidthPixels="1200" GPano:CroppedAreaImageHeightPixels="600" GPano:CroppedAreaLeftPixels="1000" GPano:CroppedAreaTopPixels="500" GPano:PoseHeadingDegrees="350"/>'
        payload=b'XMP\0'+packet;tag=b'tEXt'
        png=png[:33]+struct.pack('>I',len(payload))+tag+payload+struct.pack('>I',zlib.crc32(tag+payload)&0xffffffff)+png[33:]
    c.page.locator('#pano-file').set_input_files({'name':'source-evidence.png','mimeType':'image/png','buffer':png})
    c.page.wait_for_selector('#simple-flow:visible')
    c.page.locator('#simple-geometry-open').click()
    c.page.wait_for_selector('#photo-type:visible')
    return png


def convert(c, *, metadata=False):
    photo(c,metadata=metadata)
    if not metadata:
        for key,value in [('type','equirectangular'),('hfov',100),('heading',350),('pitch',0),('roll',0),('top',60),('bottom',0)]:
            el=c.page.locator('#photo-'+key)
            if key=='type':el.select_option(value)
            else:el.fill(str(value))
    before=model(c)
    c.page.locator('#photo-preview').click()
    c.expect_eq(model(c),before,'conversion preview leaves live geometry unchanged')
    c.expect(c.page.locator('#photo-apply').is_enabled(),'supported source geometry has an explicit Apply')
    c.page.locator('#photo-apply').click()
    return model(c)


def measurement(c,key,source='Independent surveyed feature'):
    values={'source':source,'sigmaDegrees':.2,'captureTime':'2026-10-11T20:00:00Z',
            'measurementGroup':'survey-A','exclusionReason':''}
    for field,value in values.items():
        el=c.page.locator(f'#simple-{key}-{field}');expand(el);el.fill(str(value))


@check('web-horizon-geographic-physical-pose-preview-history-and-source-evidence','web')
def orientation(c):
    boot(c);baseline=convert(c)
    for key,x,y in [('first',.2,.7),('second',.8,.25)]:
        az,alt=source_angles(x,y)
        reference(c,key,x*100,y*100,az,alt);measurement(c,key)
        c.page.locator('#simple-next').click()
    c.expect_eq(model(c),baseline,'orientation preview never changes the applied source pose')
    c.expect(c.page.locator('#simple-apply').is_enabled(),'two independent non-collinear rays determine the known-projection orientation')
    c.page.locator('#simple-apply').click();fitted=model(c)
    c.expect_eq(fitted['calibration']['version'],5)
    c.expect_eq(fitted['calibration']['mode'],'orientation')
    for key,expected in [('heading',350),('pitch',10),('roll',-7)]:
        c.expect(abs(fitted['photoModel'][key]-expected)<.01,f'physical {key} is recovered from independently rotated source rays')
    for q,(x,y) in zip(fitted['calibration']['references'],[(.2,.7),(.8,.25)]):
        c.expect(abs(q['x']-x)<1e-6 and abs(q['y']-y)<1e-6,'reference positions retain original source pixels')
        c.expect_eq(q['source'],'Independent surveyed feature')
        c.expect_eq(q['sigmaDegrees'],.2);c.expect_eq(q['measurementGroup'],'survey-A')
        c.expect_eq(q['captureTime'],'2026-10-11T20:00:00Z')
    c.page.locator('#ed-undo').click();c.expect_eq(model(c)['photoModel'],baseline['photoModel'],'one undo restores the complete previous pose')
    c.page.locator('#ed-redo').click();c.expect_eq(model(c)['calibration'],fitted['calibration'])
    c.page.locator('#simple-draw').click();c.page.locator('#ed-save').click()
    c.page.reload(wait_until='domcontentloaded');c.page.wait_for_selector('#pano-canvas')
    c.expect_eq(model(c)['photoModel'],fitted['photoModel']);c.expect_eq(model(c)['calibration'],fitted['calibration'])
    c.assert_clean()


@check('web-horizon-geographic-metadata-check-only-and-backup-validation','web')
def known_geometry(c):
    boot(c);converted=convert(c,metadata=True)
    c.expect_eq(converted['photoSource']['metadata']['status'],'detected')
    c.page.locator('#simple-known-review').click()
    c.expect_eq(model(c),converted,'known metadata geometry is reviewed without inventing fitting measurements')
    if c.page.locator('#simple-apply').is_enabled():c.page.locator('#simple-apply').click()
    applied=model(c)
    c.expect_eq(applied['calibration']['version'],5)
    c.expect_eq(applied['calibration']['mode'],'known-geometry')
    c.expect_eq(applied['calibration']['references'],[],'checking confirmed geometry does not require two fitting points')
    c.expect_eq(applied['photoModel'],converted['photoModel'],'review does not refit metadata pose')
    c.page.locator('#simple-check-open').click()
    w=applied['photoModel']['working'];x,y=.5,.5
    reference(c,'check',50,50,(w['offset']+x*w['fov'])%360,w['top']-y*(w['top']-w['bottom']))
    measurement(c,'check','Independent true-north survey')
    c.page.locator('#simple-check-apply').click();checked=model(c)
    c.expect_eq(checked['calibration']['references'],[])
    c.expect_eq(checked['photoModel'],converted['photoModel'],'a held-out check cannot change the confirmed geometry')
    c.expect_eq(len(checked['calibration']['checks']),1)
    c.expect_eq(checked['calibration']['checks'][0]['source'],'Independent true-north survey')
    c.expect_eq(report(c)['status'],'checked')
    c.page.locator('#simple-check-draw').click();c.page.locator('#ed-save').click()
    c.page.reload(wait_until='domcontentloaded');c.page.wait_for_selector('#pano-canvas')
    c.expect_eq(model(c)['calibration'],checked['calibration'])
    result=c.page.evaluate('''async m=>{const H=await import(m.horizon),W=await import(m.webstore);
      const b=await W.collectBackup(H.getPrefs(),await H.exportPanosWithImages(),'workbench');
      const before=JSON.stringify(H.activePano()),bad=structuredClone(b.panos);
      bad.panos[0].calibration.checks[0].sigmaDegrees=-1;
      const invalidMeasurement=H.normalizePanos(bad)===null;
      const invalidMode=structuredClone(b.panos);invalidMode.panos[0].calibration.mode='guaranteed';
      const modeRejected=H.normalizePanos(invalidMode)===null;
      const unchanged=JSON.stringify(H.activePano())===before;
      const staged=W.stageBackup({...b,panos:H.normalizePanos(b.panos)});
      await H.applyPanosSnapshot({panos:[],activeId:null});await H.applyPanosSnapshot(staged.panos);
      return {version:b.version,invalidMeasurement,modeRejected,unchanged,calibration:H.activePano().calibration};}''',modules())
    c.expect_eq(result['version'],10)
    c.expect(result['invalidMeasurement'] and result['modeRejected'] and result['unchanged'],'invalid evidence rejects before restore writes')
    c.expect_eq(result['calibration'],checked['calibration'],'backup restore retains metadata checks and their measurement evidence')
    c.assert_clean()


@check('web-horizon-geographic-strict-coverage-history-and-backup','web')
def coverage(c):
    boot(c);upload(c);fit(c);c.page.locator('#simple-apply').click();c.page.locator('#simple-draw').click()
    cv=c.page.locator('#pano-canvas');cv.scroll_into_view_if_needed();b=cv.bounding_box()
    for x,y in [(.1,.75),(.5,.4),(.9,.7)]:c.page.mouse.click(b['x']+b['width']*x,b['y']+b['height']*y)
    c.page.locator('#ed-save').click();baseline=model(c)
    def query():
        return c.page.evaluate('''async m=>{const H=await import(m.horizon),C=await import('./core.js'),p=H.activePano();
          return {outside:C.queryHorizonEvidence(p,180,40),unpainted:C.queryHorizonEvidence(p,351,40),
            above:C.queryHorizonEvidence(p,30,80),clear:C.queryHorizonEvidence(p,30,40),blocked:C.queryHorizonEvidence(p,30,0)};}''',modules())
    legacy=query();c.expect(legacy['outside']['allowed'],'legacy outside-coverage inference remains available before an explicit policy change')
    expand(c.page.locator('#geographic-policy'));c.page.locator('#geographic-policy').select_option('strict-measured')
    for key,value in [('lat',52.123456789),('lon',13.987654321),('height',1.3),('date','2026-10-11T20:00:00Z')]:c.page.locator('#geographic-'+key).fill(str(value))
    c.page.locator('#geographic-save').click();strict=model(c);e=strict['coverageEvidence']
    c.expect_eq(e['policy'],'strict-measured');c.expect_eq(e['observer']['lat'],52.123456789)
    c.expect_eq(e['observer']['opticalHeight'],1.3);c.expect_eq(strict['strokes'],baseline['strokes'],'coverage policy does not repaint authoritative geometry')
    q=query()
    for key in ['outside','unpainted','above']:
        c.expect_eq(q[key]['state'],'unknown','missing coverage is not mislabeled as a measured obstacle')
        c.expect(not q[key]['allowed'],'strict coverage excludes unknown sky from planning')
    c.expect_eq(q['clear']['state'],'clear');c.expect(q['clear']['allowed'],'photographed skyline opening remains usable')
    c.expect_eq(q['blocked']['state'],'blocked');c.expect(not q['blocked']['allowed'],'recorded obstruction excludes planning')
    c.page.locator('#ed-undo').click();c.expect_eq(model(c).get('coverageEvidence'),baseline.get('coverageEvidence'),'coverage evidence is one undoable change')
    c.page.locator('#ed-redo').click();c.expect_eq(model(c)['coverageEvidence'],e)
    c.page.locator('#ed-save').click();c.page.reload(wait_until='domcontentloaded');c.page.wait_for_selector('#pano-canvas')
    c.expect_eq(model(c)['coverageEvidence'],e)
    result=c.page.evaluate('''async m=>{const H=await import(m.horizon),W=await import(m.webstore);
      const b=await W.collectBackup(H.getPrefs(),await H.exportPanosWithImages(),'workbench');
      const bad=structuredClone(b.panos);bad.panos[0].coverageEvidence.observer.lat=100;
      const rejected=H.normalizePanos(bad)===null;
      const date=structuredClone(b.panos);date.panos[0].coverageEvidence.captureDate='2026-02-30';
      const dateRejected=H.normalizePanos(date)===null;
      const saved=JSON.stringify(H.snapshotPano(H.activePano()));
      const failed=structuredClone(b.panos);failed.panos[0].coverageEvidence.policy='inferred-open';
      const originalPut=IDBObjectStore.prototype.put,originalSet=Storage.prototype.setItem;
      let tx=null,armed=true,restoreFailed=false;
      IDBObjectStore.prototype.put=function(...args){if(this.name==='imgs'&&this.transaction.db.name==='nightseam-panoimg')tx=this.transaction;
        return originalPut.apply(this,args);};
      Storage.prototype.setItem=function(key,value){const result=originalSet.call(this,key,value);
        if(armed&&tx&&key==='nightseam_panos_v1'){armed=false;tx.abort();}return result;};
      try{restoreFailed=!(await H.applyPanosSnapshot(failed));}
      finally{IDBObjectStore.prototype.put=originalPut;Storage.prototype.setItem=originalSet;}
      const rollbackPreserved=JSON.stringify(H.snapshotPano(H.activePano()))===saved
        &&JSON.parse(localStorage.getItem('nightseam_panos_v1')).panos[0].coverageEvidence.policy==='strict-measured';
      const stage=W.stageBackup({...b,panos:H.normalizePanos(b.panos)});
      await H.applyPanosSnapshot({panos:[],activeId:null});await H.applyPanosSnapshot(stage.panos);
      return {version:b.version,rejected,dateRejected,restoreFailed,rollbackPreserved,evidence:H.activePano().coverageEvidence,
        preserved:JSON.stringify(H.snapshotPano(H.activePano()))===saved};}''',modules())
    c.expect_eq(result['version'],10);c.expect(result['rejected'] and result['dateRejected'],'malformed coverage evidence rejects before writes')
    c.expect(result['restoreFailed'] and result['rollbackPreserved'],'transaction abort after record write restores the original strict coverage policy')
    c.expect_eq(result['evidence'],e);c.expect(result['preserved'],'valid backup restore retains the complete strict horizon')
    c.assert_clean()


@check('web-horizon-geographic-painted-orientation-refusal','web')
def painted_refusal(c):
    boot(c);convert(c);c.page.locator('#simple-known-review').click()
    if c.page.locator('#simple-apply').is_enabled():c.page.locator('#simple-apply').click()
    c.page.locator('#simple-draw').click()
    cv=c.page.locator('#pano-canvas');cv.scroll_into_view_if_needed();b=cv.bounding_box()
    for x,y in [(.2,.65),(.8,.55)]:c.page.mouse.click(b['x']+b['width']*x,b['y']+b['height']*y)
    c.expect(len(model(c)['strokes'])>0,'test horizon contains authored geometry')
    before=model(c);expand(c.page.locator('#photo-pitch'));c.page.locator('#photo-pitch').fill('5');c.page.locator('#photo-preview').click()
    c.expect_eq(model(c),before,'unsupported remapping cannot reinterpret saved strokes')
    c.expect(c.page.locator('#photo-apply').is_disabled(),'painting prevents a new conversion apply')
    c.expect_in('drawing',c.page.locator('#photo-result').inner_text())
    c.assert_clean()
