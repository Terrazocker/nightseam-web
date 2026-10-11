"""Timezone entry points, converted-photo setup, photo size and restore recovery copies."""
import base64
import json
import re

from harness import ROOT, check
from web_suite import boot, tab
from phase1_app_checks import modules, dialogs, wait_alert, snapshot, setup, upload, fixture_bundle
from review_phase4_horizon_checks import model
from horizon_simple_checks import expand
from horizon_def_checks import gradient_png


def photo_module():
    source = (ROOT / 'web/horizonsetup.js').read_text(encoding='utf-8')
    return re.search(r'\./horizonphoto\.js\?v=\d+', source).group(0)


@check('web-safety-unknown-site-timezone-is-refused', 'web')
def unknown_timezone(c):
    boot(c)
    messages = dialogs(c)
    setup(c, 'backup')
    before = snapshot(c)
    incoming = fixture_bundle()
    incoming['sites'][0]['tz'] = 'Mars/Olympus'
    n = len(messages)
    upload(c, incoming)
    wait_alert(c, messages, n, 'unknown timezone')
    c.expect_eq(snapshot(c), before, 'a backup site with an unknown zone changes nothing')
    c.expect_eq(len([m for m in messages[n:] if m['type'] == 'confirm']), 0,
                'the zone is validated before replacement confirmation')
    site_id = c.page.locator('#tb-site').input_value()
    c.page.locator('#set-tab-sites').click()
    c.page.locator(f'[data-editsite="{site_id}"]').click()
    c.page.locator('#sf-site-tz').fill('Mars/Olympus')
    n = len(messages)
    c.page.locator('#sf-site-save').click()
    wait_alert(c, messages, n, 'IANA name')
    c.expect(c.page.locator('#sf-site').is_visible(), 'the form stays open for correction')
    c.expect_eq(snapshot(c)['sites'], before['sites'], 'the site record is unchanged')
    c.page.locator('#sf-site-tz').fill('Asia/Tokyo')
    c.page.locator('#sf-site-save').click()
    c.page.wait_for_function('async m => (await import(m.webstore)).tz() === "Asia/Tokyo"', arg=modules())
    c.assert_clean()


def convert(c, upload=True):
    if upload:
        c.page.set_viewport_size({'width': 1400, 'height': 1100})
        tab(c, 'horizon')
        c.page.locator('#pano-file').set_input_files({'name': 'converted.png', 'mimeType': 'image/png',
                                                      'buffer': gradient_png()})
        c.page.wait_for_selector('#simple-flow:visible')
    expand(c.page.locator('#photo-type'))
    c.page.locator('#photo-type').select_option('rectilinear')
    c.page.locator('#photo-hfov').fill('90')
    c.page.locator('#photo-heading').fill('350')
    c.page.locator('#photo-corrected').check()
    c.page.locator('#photo-preview').click()
    c.page.locator('#photo-apply').click()
    return model(c)


@check('web-safety-converted-photo-refuses-legacy-setup', 'web')
def converted_legacy_setup(c):
    boot(c)
    converted = convert(c)
    c.expect(converted.get('photoModel') is not None, 'precondition: the view is converted')
    expand(c.page.locator('#setup-legacy-open'))
    c.page.locator('#setup-legacy-open').click()
    c.expect_in('converted from the original photo', c.page.locator('#setup-message').text_content())
    c.page.locator('#setup-coverage-kind').select_option('partial')
    c.page.locator('#setup-width').fill('45')
    c.page.locator('#setup-apply-coverage').click()
    c.expect_eq(model(c), converted, 'legacy coverage cannot overwrite converted geometry')
    c.expect_in('converted from the original photo', c.page.locator('#setup-message').text_content())
    c.assert_clean()


@check('web-safety-photo-header-and-decoded-size-must-agree', 'web')
def photo_size_mismatch(c):
    boot(c)
    small = base64.b64encode(gradient_png(400, 200)).decode('ascii')
    large = base64.b64encode(gradient_png(800, 400)).decode('ascii')
    result = c.page.evaluate('''async ({module, small, large}) => {
      const {inspectPhoto} = await import(module);
      const bytes = (b64) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const file = (b64) => new File([bytes(b64)], 'photo.png', {type: 'image/png'});
      const ok = await inspectPhoto('data:image/png;base64,' + large, file(large));
      let refused = '';
      try { await inspectPhoto('data:image/png;base64,' + small, file(large)); }
      catch (error) { refused = error.message; }
      return {width: ok.width, height: ok.height, refused};
    }''', {'module': '/' + photo_module().lstrip('./'), 'small': small, 'large': large})
    c.expect_eq((result['width'], result['height']), (800, 400), 'agreeing sizes still import')
    c.expect_in('different size or orientation', result['refused'])
    c.assert_clean()


@check('web-safety-import-refuses-unrecoverable-current-horizons', 'web')
def unrecoverable_current(c):
    boot(c)
    # A record the loader accepts but the restore contract rejects: a skyline
    # trace in a sky-band record. Rolling back to it would fail after writing.
    corrupt = {'id': 'corrupt', 'name': 'Corrupt', 'fov': 360, 'azOffset': 0, 'altBottom': -10,
               'altTop': 60, 'paintMode': 'sky', 'hasImage': False, 'profileBins': 'world',
               'profile': [-90] * 720, 'profileTop': [-90] * 720,
               'strokes': [{'m': 'trace', 'points': [[0, 0.5], [1, 0.5]]}]}
    c.page.evaluate('raw => localStorage.setItem("nightseam_panos_v1", raw)',
                    json.dumps({'panos': [corrupt], 'activeId': None}))
    c.page.reload(wait_until='domcontentloaded')
    boot(c)
    unusable = c.page.evaluate('''async m => {
      const H = await import(m.horizon);
      return H.normalizePanos(await H.exportPanosWithImages()) === null;
    }''', modules())
    c.expect(unusable, 'precondition: the current horizons fail the restore contract')
    messages = dialogs(c)
    setup(c, 'backup')
    before = snapshot(c)
    n = len(messages)
    upload(c, fixture_bundle())
    wait_alert(c, messages, n, 'cannot be captured as a recovery copy')
    c.expect_eq(snapshot(c), before, 'nothing is replaced when rollback would be impossible')


@check('web-coverage-converted-default-and-visible-switch', 'web')
def converted_coverage(c):
    """Owner decision: converting assumes open sky above the skyline, and one
    visible control switches the assumption, with undo and both selects in step."""
    boot(c)
    p = convert(c)
    policy = c.page.locator('#setup-coverage-policy')
    c.expect_eq(p['coverageEvidence']['policy'], 'inferred-open', 'conversion default')
    c.expect_eq(policy.input_value(), 'inferred-open')
    c.expect_in('Sky above your skyline counts as clear', c.page.locator('#setup-coverage-note').text_content())
    # A target 40 deg up, inside the photographed directions but above the photo's top edge.
    allowed = """async ({m, az}) => { const H = await import(m.horizon);
      return H.queryHorizonEvidence(H.activePano(), az, 40).allowed; }"""
    inside = (p['azOffset'] + p['fov'] / 2) % 360
    c.expect(p['altTop'] < 40, f'precondition: photo top {p["altTop"]} is below the target')
    c.expect_eq(c.page.evaluate(allowed, {'m': modules(), 'az': inside}), True, 'open sky above the skyline')
    policy.select_option('strict-measured')
    c.expect_eq(model(c)['coverageEvidence']['policy'], 'strict-measured')
    c.expect_eq(c.page.evaluate(allowed, {'m': modules(), 'az': inside}), False, 'strict excludes unphotographed sky')
    expand(c.page.locator('#geographic-policy'))
    c.expect_eq(c.page.locator('#geographic-policy').input_value(), 'strict-measured', 'advanced select follows')
    c.page.locator('#ed-undo').click()
    c.expect_eq(model(c)['coverageEvidence']['policy'], 'inferred-open', 'one undo restores the assumption')
    c.expect_eq(policy.input_value(), 'inferred-open', 'visible select follows undo')
    c.expect_eq(c.page.locator('#geographic-policy').input_value(), 'inferred-open', 'advanced select follows undo')
    policy.select_option('strict-measured')
    again = convert(c, upload=False)
    c.expect_eq(again['coverageEvidence']['policy'], 'strict-measured', 'reconversion keeps an explicit choice')
    c.assert_clean()


@check('web-safety-weather-rows-require-well-formed-times', 'web')
def weather_times(c):
    """Provider times reach markup: a hostile or non-string time is dropped
    instead of injecting elements or crashing the panel."""
    from review_phase567_checks import start, SITES, forecast, deferred_weather, complete_weather
    from phase3_astronomy_checks import seed as seed_sites, date as set_date
    start(c)
    seed_sites(c, [SITES[0]], minVis=0)
    set_date(c, '2026-10-09')
    deferred_weather(c)
    c.page.locator('#btnWeather').click()
    data = forecast()
    # Sorts inside the night window and survives the 16-character title slice,
    # closing the title attribute to add one of its own.
    data['hourly']['time'][20] = '2026-10-09T20" z'
    data['hourly']['time'][21] = 1791576000
    complete_weather(c, 0, data, air_fail=True)
    c.page.wait_for_function("() => document.querySelector('#wxChip').textContent.includes('100/100')")
    c.expect_eq(c.page.locator('#wxBody [z]').count(), 0, 'no provider text becomes markup')
    c.expect(c.page.locator('#wxBody .wx-hour').count() > 0, 'well-formed hours still render')
    c.assert_clean()
