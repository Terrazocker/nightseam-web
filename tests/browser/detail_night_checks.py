"""The detail card's rise, set and culmination describe the coming night."""
import re

from harness import check
from web_suite import boot, tab, search_catalog_row
from phase3_astronomy_checks import modules, ready, seed, date


@check('web-detail-card-culmination-is-the-coming-night', 'web')
def coming_night(c):
    boot(c)
    seed(c, [{'id': 'night-berlin', 'name': 'Night Berlin', 'lat': 52.52, 'lon': 13.405,
              'tz': 'Europe/Berlin'}])
    c.page.evaluate('''async m => (await import(m.webstore)).saveTargetRec({id:'u_night_m31',
      primary_name:'Night card M31',otype:'galaxy',ra_hours:0.7123,dec_deg:41.269,vmag:3.4,size_am:'178'})''',
                    modules())
    c.page.reload(wait_until='domcontentloaded')
    ready(c)
    date(c, '2026-10-11')
    tab(c, 'catalog')
    search_catalog_row(c, 'u_night_m31', 'Night card M31').click()
    row = c.page.locator('dt').filter(has_text=re.compile(r'^Culmination$')).locator('xpath=following-sibling::dd[1]')
    row.evaluate("e=>{for(let p=e.parentElement;p;p=p.parentElement){if(p.tagName==='DETAILS')p.open=true;}}")
    row.wait_for(state='visible')
    # Independent meridian transit: 2026-10-11T22:27Z = 00:27 CEST on the 12th.
    # The calendar-day card showed 00:31 on the 11th, the previous night.
    text = row.inner_text()
    c.expect(text.startswith('00:2'), f'culmination of the coming night: {text!r}')
    c.expect(not text.startswith('00:31'), 'not the previous night')
    c.expect_in('culmination 00:2', c.page.locator('#d-obs').inner_text(), 'summary agrees')
    c.assert_clean()
