"""Timezone entry points, restore recovery copies and provider times."""
import json

from harness import check
from web_suite import boot
from phase1_app_checks import modules, dialogs, wait_alert, snapshot, setup, upload, fixture_bundle


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


@check('web-safety-retired-horizon-photos-are-dropped', 'web')
def retired_horizon_photos(c):
    """A horizon stored by a build with horizon photos keeps its skyline: the
    photo fields and the photo database are dropped, and its recovery copy
    during an import needs no photo bytes."""
    boot(c)
    old = {'id': 'old', 'name': 'Old photo', 'points': [{'az': 90, 'alt': 10}],
           'photo': {'width': 360, 'heading': 180, 'tilt': 0, 'roll': 0}, 'hasPhoto': True}
    c.page.evaluate("""raw => new Promise((resolve, reject) => {
      localStorage.setItem('nightseam_horizons_v2', raw);
      const rq = indexedDB.open('nightseam-horizon-photos', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('photos');
      rq.onsuccess = () => { rq.result.close(); resolve(); };
      rq.onerror = () => reject(rq.error);
    })""", json.dumps({'horizons': [old], 'activeId': 'old'}))
    c.page.reload(wait_until='domcontentloaded')
    boot(c)
    c.page.wait_for_function("""async () => !(await indexedDB.databases())
      .some((d) => d.name === 'nightseam-horizon-photos')""", timeout=10000)
    loaded = c.page.evaluate('async m => (await import(m.horizon)).exportHorizons()', modules())
    c.expect_eq(loaded['horizons'], [{'id': 'old', 'name': 'Old photo', 'points': [{'az': 90, 'alt': 10}],
                                      'overhangs': []}], 'the skyline stays and the photo fields are dropped')
    messages = dialogs(c)
    setup(c, 'backup')
    upload(c, fixture_bundle())
    c.page.wait_for_function("""async m => {
      const s = await (await import(m.webstore)).lastSafetySnapshot();
      return !!(s && s.horizons && s.horizons.horizons.some((h) => h.id === 'old'));
    }""", arg=modules(), timeout=15000)
    safety = c.page.evaluate('async m => (await import(m.webstore)).lastSafetySnapshot()', modules())
    kept = next(h for h in safety['horizons']['horizons'] if h['id'] == 'old')
    c.expect(not ({'photo', 'hasPhoto', 'image'} & set(kept)), f'the recovery copy carries no photo fields: {kept}')
    c.expect(not any('Import failed' in m['message'] for m in messages), f'the import is not refused: {messages}')
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
