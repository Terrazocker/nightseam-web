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


@check('web-safety-import-refuses-unrecoverable-current-horizons', 'web')
def unrecoverable_current(c):
    """A horizon whose photo bytes are gone cannot be captured as a recovery
    copy, so an import refuses before replacing anything."""
    boot(c)
    lost = {'id': 'lost', 'name': 'Lost photo', 'points': [{'az': 90, 'alt': 10}],
            'photo': {'width': 360, 'heading': 180, 'tilt': 0, 'roll': 0}, 'hasPhoto': True}
    c.page.evaluate('raw => localStorage.setItem("nightseam_horizons_v2", raw)',
                    json.dumps({'horizons': [lost], 'activeId': 'lost'}))
    c.page.reload(wait_until='domcontentloaded')
    boot(c)
    messages = dialogs(c)
    setup(c, 'backup')
    sites = 'async m => (await import(m.webstore)).allStrict("sites")'
    before = c.page.evaluate(sites, modules())
    n = len(messages)
    upload(c, fixture_bundle())
    wait_alert(c, messages, n, 'missing or unreadable')
    c.expect_eq(c.page.evaluate(sites, modules()), before, 'nothing is replaced when rollback would be impossible')
    c.expect_eq(c.page.evaluate('() => JSON.parse(localStorage.getItem("nightseam_horizons_v2")).horizons[0].id'),
                'lost', 'the current horizon stays')
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
