"""Physical FOV fitting and safe review through the actual editor controls."""
import math

from harness import check
from web_suite import boot
from review_phase4_horizon_checks import model
from horizon_simple_checks import expand, reference, report
from horizon_geographic_checks import photo, convert


def rectilinear_direction(x, y, *, hfov=90, heading=350, pitch=9, roll=12):
    """Independent centred pinhole ray and successive physical rotations."""
    scale=2*math.tan(math.radians(hfov)/2)
    east,north,up=(x-.5)*scale,1,(.5-y)*scale*.5
    h,p,r=map(math.radians,(heading,pitch,roll))
    east,up=math.cos(r)*east+math.sin(r)*up,-math.sin(r)*east+math.cos(r)*up
    north,up=math.cos(p)*north-math.sin(p)*up,math.sin(p)*north+math.cos(p)*up
    east,north=math.cos(h)*east+math.sin(h)*north,-math.sin(h)*east+math.cos(h)*north
    return math.degrees(math.atan2(east,north))%360,math.degrees(math.atan2(up,math.hypot(east,north)))


def original_position(working, x, y, hfov=60):
    """Inverse pinhole equations for the level baseline; no production mapping."""
    azimuth=math.radians(working['offset']+x*working['fov'])
    altitude=math.radians(working['top']-y*(working['top']-working['bottom']))
    scale=2*math.tan(math.radians(hfov)/2)
    return .5+math.tan(azimuth)/scale,.5-math.tan(altitude)/math.cos(azimuth)/scale*2


def rect_convert(c):
    photo(c)
    c.page.locator('#photo-type').select_option('rectilinear')
    for key,value in [('hfov',60),('heading',0),('pitch',0),('roll',0),('top',60),('bottom',0)]:
        c.page.locator('#photo-'+key).fill(str(value))
    c.page.locator('#photo-corrected').check()
    c.page.locator('#photo-preview').click()
    c.expect(c.page.locator('#photo-apply').is_enabled(),'baseline corrected pinhole geometry can be confirmed')
    c.page.locator('#photo-apply').click()
    return model(c)


@check('web-horizon-geographic-fit-unknown-rectilinear-width-roundtrip','web')
def unknown_rectilinear_width(c):
    boot(c);baseline=rect_convert(c);w=baseline['photoModel']['working']
    c.page.locator('#simple-orientation-start').click()
    positions=[(.1,.2),(.9,.8),(.45,.35),(.65,.65)]
    expected_refs=[]
    for key,(x,y) in zip(['first','second'],positions[:2]):
        sx,sy=original_position(w,x,y);az,alt=rectilinear_direction(sx,sy)
        expected_refs.append({'x':sx,'y':sy,'azimuth':az,'altitude':alt})
        reference(c,key,x*100,y*100,az,alt);c.page.locator('#simple-next').click()
    c.expect_eq(model(c)['photoModel'],baseline['photoModel'],'a wrong fixed width preview cannot alter confirmed geometry')
    expand(c.page.locator('#simple-extra-role'))
    for x,y in positions[2:]:
        sx,sy=original_position(w,x,y);az,alt=rectilinear_direction(sx,sy)
        expected_refs.append({'x':sx,'y':sy,'azimuth':az,'altitude':alt})
        c.page.locator('#simple-extra-role').select_option('fit')
        reference(c,'extra',x*100,y*100,az,alt);c.page.locator('#simple-extra-add').click()
    expected_checks=[]
    for x,y in [(.35,.45),(.65,.55)]:
        sx,sy=original_position(w,x,y);az,alt=rectilinear_direction(sx,sy)
        expected_checks.append({'x':sx,'y':sy,'azimuth':az,'altitude':alt})
        c.page.locator('#simple-extra-role').select_option('check')
        reference(c,'extra',x*100,y*100,az,alt);c.page.locator('#simple-extra-add').click()
    before=model(c)
    c.expect_eq(before['calibration']['mode'],'known-geometry','checks can be collected without fitting or changing the baseline')
    c.expect_eq(len(before['calibration']['checks']),2)
    c.page.locator('#simple-estimate-fov').check()
    c.expect(c.page.locator('#simple-apply').is_enabled(),'distributed fit data and held-out improvement permit estimating width')
    c.expect_eq(model(c),before,'FOV fitting remains an immutable review preview')
    c.page.locator('#simple-apply').click();fitted=model(c)
    c.expect(abs(fitted['photoModel']['hfov']-90)<.005,'unknown horizontal width recovers the independent 90-degree pinhole fixture')
    for key,expected in [('heading',350),('pitch',9),('roll',12)]:
        error=(fitted['photoModel'][key]-expected+180)%360-180
        c.expect(abs(error)<.005,f'joint orientation recovers {key} with the estimated width')
    c.expect(fitted['calibration']['options']['estimateFov'],'estimated parameter role is stored')
    c.expect_eq(fitted['calibration']['sourceModel']['hfov'],60,'fixed baseline is retained for held-out comparison')
    c.expect_eq(len(fitted['calibration']['references']),4,'held-out checks are absent from fitting data')
    c.expect_eq(len(fitted['calibration']['checks']),2)
    for actual,expected in zip(fitted['calibration']['references'],expected_refs):
        for field in ('x','y','azimuth','altitude'):c.expect(abs(actual[field]-expected[field])<1e-6,'original source and measured truth survive reprojection')
    for actual,expected in zip(fitted['calibration']['checks'],expected_checks):
        for field in ('x','y','azimuth','altitude'):c.expect(abs(actual[field]-expected[field])<1e-6,'held-out evidence remains independent of fitting')
    c.expect_eq(report(c)['status'],'checked')
    c.page.locator('#simple-draw').click();c.page.locator('#ed-save').click()
    c.page.reload(wait_until='domcontentloaded');c.page.wait_for_selector('#pano-canvas')
    c.expect_eq(model(c)['photoModel'],fitted['photoModel']);c.expect_eq(model(c)['calibration'],fitted['calibration'])
    c.expect_eq(report(c)['status'],'checked','reload recomputes the same physical held-out diagnostics')
    c.assert_clean()


@check('web-horizon-geographic-fit-painted-known-review-mismatch-refusal','web')
def painted_known_review(c):
    boot(c);convert(c);c.page.locator('#simple-known-review').click()
    if c.page.locator('#simple-apply').is_enabled():c.page.locator('#simple-apply').click()
    c.page.locator('#simple-draw').click()
    cv=c.page.locator('#pano-canvas');cv.scroll_into_view_if_needed();b=cv.bounding_box()
    for x,y in [(.2,.65),(.8,.55)]:c.page.mouse.click(b['x']+b['width']*x,b['y']+b['height']*y)
    painted=model(c);c.expect(len(painted['strokes'])>0,'the compatibility guard is exercised with real authored geometry')
    angle=c.page.locator('#ed-az-n');expand(angle);angle.fill(str((painted['azOffset']+.5)%360));angle.press('Tab')
    before=model(c);c.expect(abs(before['azOffset']-painted['azOffset'])>.4,'fine adjustment changed the painted world mapping')
    c.page.locator('#setup-open').click();c.page.locator('#simple-known-review').click()
    c.expect(c.page.locator('#simple-apply').is_disabled(),'confirming an old source model cannot reinterpret existing painting')
    c.expect_in('painted horizon',c.page.locator('#simple-preview').inner_text())
    c.expect_eq(model(c),before,'failed known-geometry review is atomic')
    c.page.locator('#simple-cancel').click();c.expect_eq(model(c),before,'cancelling the refusal retains changed angles and editable strokes')
    c.assert_clean()


@check('web-horizon-geographic-fit-preview-invalidation-and-cancel','web')
def preview_invalidation(c):
    boot(c);baseline=convert(c)
    c.page.locator('#simple-orientation-start').click()
    from horizon_geographic_checks import source_angles
    for key,x,y in [('first',.2,.7),('second',.8,.25)]:
        az,alt=source_angles(x,y);reference(c,key,x*100,y*100,az,alt);c.page.locator('#simple-next').click()
    expand(c.page.locator('#photo-preview-canvas'))
    c.expect(c.page.locator('#photo-preview-canvas').is_visible(),'physical fit shows the derived image during review')
    expand(c.page.locator('#simple-extra-x'));c.page.locator('#simple-extra-x').fill('30')
    c.expect(not c.page.locator('#photo-preview-canvas').is_visible(),'editing a point draft clears the previous physical image preview')
    c.expect_eq(model(c),baseline,'point drafts have no side effects on live geometry')
    c.page.locator('#simple-back').click();c.page.locator('#simple-next').click()
    c.expect(c.page.locator('#photo-preview-canvas').is_visible(),'re-entering review rebuilds the valid preview')
    c.page.locator('[data-direction="extra:0"]').click()
    c.expect(not c.page.locator('#photo-preview-canvas').is_visible(),'direction shortcuts invalidate the previous corrected-photo preview')
    c.page.locator('#simple-cancel').click();c.expect_eq(model(c),baseline,'cancel clears unpublished reference drafts without applying a pose')
    c.assert_clean()
