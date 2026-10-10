"""Phase 3 site-date, DST, memo/anchor and actual Moon warning regressions."""
import json
import re
from datetime import datetime

from harness import ROOT, check
from web_suite import boot, tab, search_catalog_row


def modules():
    source = (ROOT/'web/app.js').read_text(encoding='utf-8')
    return {n:re.search(r'\./'+n+r'\.js\?v=\d+',source).group(0)
            for n in ('webstore','horizon','astro')}


def ready(c):
    c.page.wait_for_function("() => typeof window.__ns_scrub_range === 'function'")


def seed(c, sites, **prefs):
    c.page.evaluate('''async ({m,sites,prefs}) => {
      const W=await import(m.webstore),H=await import(m.horizon);
      for(const s of sites) await W.saveSiteRec({elev:0,...s});
      H.setPrefs({activeSiteId:sites[0].id,tz:'',weatherAuto:false,...prefs});
    }''', {'m':modules(),'sites':sites,'prefs':prefs})
    c.page.reload(wait_until='domcontentloaded');ready(c)


def date(c, value):
    c.page.locator('#tb-date').fill(value)
    c.page.locator('#tb-date').dispatch_event('change')


def full(c, enabled=True):
    c.page.locator('#viewFullDay').evaluate('''(e,value)=>{
      e.checked=value;e.dispatchEvent(new Event('change',{bubbles:true}));}''', enabled)


def epoch(iso):
    return int(datetime.fromisoformat(iso.replace('Z','+00:00')).timestamp()*1000)


def bounds(c):
    return c.page.evaluate('window.__ns_scrub_range()')


@check('web-phase3-remote-site-boot-date', 'web')
def remote_boot(c):
    c.page.clock.set_fixed_time('2026-10-09T00:30:00Z')
    boot(c)
    seed(c,[{'id':'phase3-la','name':'LA','lat':34.0522,'lon':-118.2437,'tz':'America/Los_Angeles'}])
    c.expect_eq(c.page.locator('#tb-date').input_value(),'2026-10-08','site date input')
    c.expect_in('2026-10-08',c.page.locator('.night-brief-title').inner_text(),'computed observing date')
    r=bounds(c)
    c.expect(epoch('2026-10-09T00:00Z') < r['start'] < epoch('2026-10-09T05:00Z'),
             'Los Angeles October 8 sunset belongs to October 9 UTC')
    tab(c,'catalog')
    c.expect_eq(c.page.locator('#tb-date').input_value(),'2026-10-08','Catalog retains site date')


@check('web-phase3-site-zone-memo-and-full-anchor', 'web')
def site_zone(c):
    c.page.clock.set_fixed_time('2026-10-05T23:00:00Z')
    boot(c)
    seed(c,[{'id':'phase3-utc','name':'Berlin UTC','lat':52.52,'lon':13.4,'tz':'UTC'},
            {'id':'phase3-hi','name':'Berlin Hawaii','lat':52.52,'lon':13.4,'tz':'Pacific/Honolulu'}])
    date(c,'2026-10-05')
    before=bounds(c)
    c.page.locator('#tb-site').select_option('phase3-hi')
    after=bounds(c)
    expected=c.page.evaluate('''async m=>{
      const E=await import(m.astro),W=await import(m.webstore);
      const day=new Date(2026,9,5,12),noon=W.wallFieldsToUtc(2026,9,5,12);
      const i=E.nightInfo(day,52.52,13.4,noon);
      const w=E.scrubWindowMs({sunsetMs:+i.sunset,sunriseMs:+i.sunrise,
        duskMs:+i.astroDusk,dawnMs:+i.astroDawn,noonMs:+noon});
      return {start:w.startMs,end:w.endMs};
    }''',modules())
    c.expect_eq(after,expected,'memo matches freshly calculated selected-zone window')
    c.expect(before != after,'same-coordinate site timezone invalidates memo')
    full(c)
    c.expect_eq(bounds(c)['start'],epoch('2026-10-05T22:00Z'),'Hawaii noon anchor')
    date(c,'2026-10-05') # pin an instant after both zones' noons before changing override
    c.page.locator('#tzSelect').evaluate("e=>{e.value='UTC';e.dispatchEvent(new Event('change',{bubbles:true}));}")
    c.expect_eq(bounds(c)['start'],epoch('2026-10-05T12:00Z'),'global override invalidates full anchor')
    date(c,'2026-10-08')
    c.expect_eq(bounds(c)['start'],epoch('2026-10-08T12:00Z'),'explicit date moves full-day selection')
    # Exact right endpoint stays in the current drag window.
    r=bounds(c)
    c.page.locator('#tb-scrub').evaluate("e=>{e.value=e.max;e.dispatchEvent(new Event('input',{bubbles:true}));}")
    c.expect_eq(bounds(c),r,'right endpoint preserves stable drag anchor')


@check('web-phase3-full-day-dst-calendar-bounds', 'web')
def dst_bounds(c):
    boot(c)
    seed(c,[{'id':'phase3-berlin','name':'Berlin','lat':52.52,'lon':13.4,'tz':'Europe/Berlin'}],viewFullDay=True)
    for day,start,end,hours in [
        ('2026-03-28','2026-03-28T11:00Z','2026-03-29T10:00Z',23),
        ('2026-10-24','2026-10-24T10:00Z','2026-10-25T11:00Z',25)]:
        date(c,day);r=bounds(c)
        c.expect_eq(r,{'start':epoch(start),'end':epoch(end)},'actual consecutive site noons')
        c.expect_eq((r['end']-r['start'])/3600000,hours,'DST calendar duration')


@check('web-phase3-moon-culmination-warning-color', 'web')
def moon_color(c):
    # Synthetic targets follow independently chosen full/new Moon dates;
    # core coordinates only construct close targets, never expected colors.
    rows=[{'id':'phase3-close','primary_name':'Phase3 close target','otype':'nebula',
           'ra_hours':20.5,'dec_deg':52,'vmag':5,'size_am':'5','popularity':1000}]
    c.page.route('**/catalog.json?*',lambda r:r.fulfill(content_type='application/json',body=json.dumps(rows)))
    boot(c)
    seed(c,[{'id':'phase3-color','name':'Color site','lat':0,'lon':0,'tz':'UTC'}])
    tab(c,'catalog')
    for day,want,rgb in [('2026-08-28','var(--bad)','rgb(196, 91, 82)'),
                         ('2026-08-12','var(--green)','rgb(91, 198, 141)')]:
        # Put the target at the Moon's geocentric coordinates for this day.
        c.page.evaluate('''async ({m,day})=>{
          const E=await import(m.astro),W=await import(m.webstore);
          const [ra,dec]=E.moonRaDec(E.julianDay(new Date(day+'T12:00:00Z')));
          await W.saveTargetRec({id:'u_phase3_color',primary_name:'Phase3 color target',otype:'nebula',
            ra_hours:ra/15,dec_deg:dec,vmag:5,size_am:'5'});
        }''',{'m':modules(),'day':day})
        c.page.reload(wait_until='domcontentloaded');ready(c);date(c,day);tab(c,'catalog')
        search_catalog_row(c,'u_phase3_color','Phase3 color target').click()
        row=c.page.locator('dt').filter(has_text='Moon dist @ culmination').locator('xpath=following-sibling::dd[1]')
        row.evaluate("e=>{for(let p=e.parentElement;p;p=p.parentElement){if(p.tagName==='DETAILS')p.open=true;}}")
        row.wait_for(state='visible')
        c.expect_in('very close to the Moon',row.inner_text(),'non-color proximity explanation')
        c.expect_in(want,row.locator('span').first.get_attribute('style'),'illumination fraction controls warning role')
        c.expect_eq(row.locator('span').first.evaluate('e=>getComputedStyle(e).color'),rgb,'actual rendered Moon warning color')
