"""Startup sidecar failure/retry/export acceptance for the remaining web pass."""
import json
from harness import ROOT, check
from web_suite import boot, tab, open_catalog_photo


@check('web-provenance-lazy-retry-and-single-flight-export', 'web')
def provenance_lazy(c):
    calls=[]
    expected=json.loads((ROOT/'web/catalog-provenance.json').read_text(encoding='utf-8'))
    def serve(route):
        calls.append(route.request.url)
        if len(calls)==1:
            route.fulfill(status=200,json={'schema_version':1,'catalog':{'row_count':1},'objects':{}})
        elif len(calls)==2:
            malformed={**expected,'objects':{**expected['objects']}}
            malformed['objects']['ngc1976']={**expected['objects']['ngc1976'],'aliases':'M42'}
            route.fulfill(status=200,json=malformed)
        else:
            route.fulfill(status=200,content_type='application/json',path=str(ROOT/'web/catalog-provenance.json'))
    c.page.route('**/catalog-provenance.json?*',serve)
    boot(c)
    c.expect_eq(len(calls),0,'usable startup does not request optional sources')
    open_catalog_photo(c,'ngc1976','M42')
    c.expect_eq(len(calls),0,'closed Catalog details do not fetch source data')
    c.page.locator('details.catalog-details > summary').click()
    c.page.locator('#d-catalog-source button').wait_for()
    c.expect_eq(len(calls),1,'expanding sources requests the sidecar')
    c.expect('Planning is available' in c.page.locator('#d-catalog-source').inner_text(),'failed source metadata does not imply failed planning')
    downloads=[]
    c.page.on('download',lambda d:downloads.append(d))
    c.page.evaluate("document.querySelector('#cat-export-provenance').click()")
    c.page.wait_for_function("() => document.querySelector('#cat-export-provenance').textContent.includes('Retry')")
    c.expect_eq(len(downloads),0,'invalid source payloads never download an empty placeholder')
    with c.page.expect_download() as saved:
        c.page.evaluate('''() => {
          document.querySelector('#d-catalog-source button').click();
          document.querySelector('#cat-export-provenance').click();
        }''')
    c.expect_eq(len(calls),3,'concurrent disclosure and export share one successful request')
    payload=json.loads(saved.value.path().read_text(encoding='utf-8'))
    c.expect_eq(payload,expected,'export contains the complete authoritative sidecar')
    c.page.wait_for_function("() => document.querySelector('#d-catalog-source')?.textContent.includes('OpenNGC')")
    # Change planner state while a disclosure is open: it stays open and uses
    # the already loaded source without another transfer or a focus takeover.
    c.page.locator('#tb-date').fill('2026-08-13')
    c.page.locator('#tb-date').dispatch_event('change')
    c.expect(c.page.locator('details.catalog-details').evaluate('el => el.open'),'source disclosure survives a planner refresh')
    c.expect_eq(len(calls),3,'loaded source information is reused')
    c.assert_clean()


@check('web-elevation-metadata-invariant', 'web')
def elevation_metadata(c):
    boot(c)
    c.page.locator('#tb-date').fill('2026-08-12')
    c.page.locator('#tb-date').dispatch_event('change')
    c.wait_tonight_render()
    before=c.page.locator('#tonight-rank-table').inner_text()
    c.page.locator('#btnMenu').click()
    c.page.locator('#btn-settings').click()
    c.page.locator('#set-sites [data-editsite]').first.click()
    c.expect('does not change visibility' in c.page.locator('#sf-elevation-note').inner_text(),'site elevation limitation is stated at entry')
    c.page.locator('#sf-site-elev').fill('3000')
    c.page.locator('#sf-site-save').click()
    c.page.locator('#modal .close').click()
    c.wait_tonight_render()
    c.expect_eq(c.page.locator('#tonight-rank-table').inner_text(),before,'changing only elevation leaves planning results unchanged')
    c.page.locator('#btnMenu').click()
    c.page.locator('#btn-settings').click()
    c.page.locator('#set-sites [data-editsite]').first.click()
    c.expect_eq(c.page.locator('#sf-site-elev').input_value(),'3000','metadata is retained for the site')
    c.assert_clean()
