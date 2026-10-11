"""Remaining review: live context, owned weather and native Catalog controls."""
import json
from datetime import datetime, timedelta

from harness import check
from web_suite import boot, tab, search_catalog_row
from phase3_astronomy_checks import seed, date, modules
from phase1_app_checks import setup
from selection_checks import FIXTURE, custom_target


SITES = [{'id': 'review-a', 'name': 'Review A', 'lat': 52.52, 'lon': 13.4, 'tz': 'UTC'},
         {'id': 'review-b', 'name': 'Review B', 'lat': -33.9, 'lon': 151.2, 'tz': 'UTC'}]


def start(c, rows=None, **prefs):
    if rows is not None:
        c.page.route('**/catalog.json?*', lambda r: r.fulfill(json=rows))
    boot(c)
    seed(c, SITES, minAlt=20, minVis=0, **prefs)
    date(c, '2026-10-09')


def idle_catalog(c):
    c.page.wait_for_function("""() => document.querySelector('.cat-results') &&
      !document.querySelector('#pct-status')?.textContent &&
      [...document.querySelectorAll('td.pct')].every(e=>!e.textContent.includes('…'))""", timeout=60000)


@check('web-review-phase5-catalog-context-and-sort', 'web')
def catalog_context(c):
    rows = [{**FIXTURE[i % 3], 'id': f'review{i:03}', 'primary_name': f'Review {i:03}',
             'dec_deg': -70 + i * 2, 'ra_hours': 20, 'vmag': 2 + (i % 12), '_adv': False}
            for i in range(80)]
    rows[-1]['dec_deg'] = rows[-2]['dec_deg']  # equal altitude, distinct name/ID
    start(c, rows, advMode=True)
    tab(c, 'catalog')
    c.page.locator('#cat-more > summary').click()
    c.page.locator('#cat-minvis').evaluate("e=>{e.value=5;for(const type of ['input','change'])e.dispatchEvent(new Event(type,{bubbles:true}));}")
    idle_catalog(c)
    c.page.locator('#tb-minalt').evaluate("e=>{e.value=70;e.dispatchEvent(new Event('change',{bubbles:true}));}")
    idle_catalog(c)
    c.expect_in('70°', c.page.locator('.catalog-context').inner_text())
    count = c.page.locator('tr[data-id]').count()
    c.expect(0 < count < 50, 'new threshold finishes full-pool gating, not only page cells')
    # Rapid changes supersede outstanding batches; switching away cancels ownership.
    c.page.locator('#tb-minalt').evaluate("e=>{for(const v of [40,60,20]){e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));}}")
    idle_catalog(c)
    c.page.locator('#cat-minvis').evaluate("e=>{e.value=0;for(const type of ['input','change'])e.dispatchEvent(new Event(type,{bubbles:true}));}")
    c.page.locator('#cat-sort').select_option('maxalt')
    idle_catalog(c)
    expected = c.page.evaluate('''async ({m,rows})=>{
      const E=await import(m.astro),H=await import(m.horizon),W=await import(m.webstore);
      const core=await import('./core.js');
      const d=new Date(2026,9,9,12), noon=W.wallFieldsToUtc(2026,9,9,12);
      const info=E.nightInfo(d,52.52,13.4,noon);
      const w=E.pickDarkWindow(info,d,noon,{dusk:W.wallFieldsToUtc(2026,9,9,20),dawn:W.wallFieldsToUtc(2026,9,10,4)});
      const stats=rows.map(o=>({id:o.id,name:o.primary_name,
        alt:core.nightStats(o,E.julianDay(w.dusk),E.julianDay(w.dawn),6/1440,H.effectiveMinAlt(),null,52.52,13.4).maxAlt}));
      const order=direction=>[...stats].sort((a,b)=>direction*(a.alt-b.alt)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)).map(o=>o.id);
      return {up:order(1),down:order(-1)};
    }''', {'m': modules(), 'rows': rows})
    ids = lambda: c.page.locator('tr[data-id]').evaluate_all('els=>els.map(e=>e.dataset.id)')
    c.expect_eq(ids(), expected['up'][:50], 'maximum-altitude ascending uses shared statistics and stable ties')
    c.page.locator('#cat-reverse').click(); idle_catalog(c)
    c.expect_eq(ids(), expected['down'][:50], 'maximum-altitude descending preserves name/ID ties')
    before_night = c.page.locator('#nightInfo').inner_text()
    c.page.locator('#site-settings').click()
    c.page.locator('#sf-site-name').fill('Edited active site')
    c.page.locator('#sf-site-lat').fill('-33.9')
    c.page.locator('#sf-site-lon').fill('151.2')
    c.page.locator('#sf-site-save').click()
    c.page.wait_for_function("() => document.querySelector('.catalog-context')?.textContent.includes('Edited active site')")
    c.expect(c.page.locator('#nightInfo').inner_text() != before_night, 'site save updates header night summary immediately')
    c.page.locator('#modal .close').click(); idle_catalog(c)
    c.expect(ids() != expected['down'][:50], 'active coordinates refresh the displayed plan')
    c.page.screenshot(path=str(c.artifacts/'review-phase567-catalog-desktop.png'), full_page=True)
    c.page.evaluate('''()=>{
      const e=document.querySelector('#tb-minalt');e.value=40;
      e.dispatchEvent(new Event('change',{bubbles:true}));
      document.querySelector('#tabs a[data-v="sky"]').click();
    }''')
    c.page.wait_for_selector('#sky'); c.page.wait_for_timeout(150)
    c.expect_eq(c.page.locator('#pct-status').count(), 0, 'old Catalog work cannot repaint another view')
    c.expect(c.page.locator('#busy').evaluate("e=>e.classList.contains('hidden')"), 'cancelled work leaves no stale busy indicator')
    c.assert_clean()


@check('web-review-phase5-custom-search-and-chart', 'web')
def search_and_chart(c):
    start(c, FIXTURE)
    target = custom_target('u_review_search', 'Old search name', 20)
    c.page.evaluate('''async ({m,target})=>{
      const W=await import(m.webstore);await W.saveTargetRec(target);
    }''', {'m': modules(), 'target': target})
    c.page.reload(wait_until='domcontentloaded')
    c.page.wait_for_selector('#tabs')
    date(c, '2026-10-09')
    tab(c, 'catalog')
    search_catalog_row(c, target['id'], target['primary_name'])
    setup(c, 'targets')
    c.page.locator('[data-edittarget="u_review_search"]').click()
    c.page.locator('#sf-target-name').fill('New search name')
    c.page.locator('#sf-target-save').click()
    c.page.wait_for_function("() => document.querySelector('#set-targets')?.textContent.includes('New search name')")
    c.page.locator('#modal .close').click()
    search_catalog_row(c, target['id'], 'New search name')
    c.page.locator('#cat-q').fill('Old search name')
    c.page.wait_for_function("() => !document.querySelector('tr[data-id=\"u_review_search\"]')")
    # Record actual target path strokes; an unobstructed circumpolar object
    # at a deliberately high minimum must contain warning, never blocked lines.
    c.page.evaluate('''()=>{
      window.__reviewStrokes=[];
      const orig=CanvasRenderingContext2D.prototype.stroke;
      CanvasRenderingContext2D.prototype.stroke=function(...a){
        if(this.canvas.id==='graph' && Math.abs(this.lineWidth-2.4)<0.01) window.__reviewStrokes.push(this.strokeStyle);
        return orig.apply(this,a);
      };
    }''')
    c.page.locator('#tb-minalt').evaluate("e=>{e.value=89;e.dispatchEvent(new Event('change',{bubbles:true}));}")
    row = search_catalog_row(c, 'synalpha', 'Synth Alpha')
    row.locator('.target-open').click()
    c.page.wait_for_selector('#graph')
    c.page.wait_for_timeout(150)
    palette = c.page.evaluate("async()=> (await import('./viztheme.js')).vizTheme()")
    strokes = c.page.evaluate('window.__reviewStrokes')
    c.expect(palette['warn'].lower() in strokes, f'below-minimum target paints warning segments: {strokes}, expected {palette["warn"]}')
    c.expect(palette['bad'].lower() not in strokes, 'no invented horizon obstruction')
    c.assert_clean()


@check('web-review-phase7-native-tables-focus-and-sort', 'web')
def keyboard_catalog(c):
    start(c, FIXTURE)
    c.page.wait_for_selector('#tonight-rank-table .target-open')
    c.expect_eq(c.page.locator('tr[data-tonight-id][role]').count(), 0, 'Tonight preserves native rows')
    button = c.page.locator('#tonight-rank-table .target-open').first
    row_id = button.evaluate("e=>e.closest('tr').dataset.tonightId")
    opener = button.element_handle()
    button.focus(); c.page.keyboard.press('Space')
    c.page.wait_for_selector('#modal:not([hidden]) .modal')
    # A Tonight refresh (scrub, the 60 s timer, or a late boot pass on a slow
    # machine) replaces the rows while the card is open; focus must still
    # return to the same target's button, not fall back to the tab bar.
    c.page.evaluate("window.dispatchEvent(new CustomEvent('sky:time', {detail: {}}))")
    c.page.wait_for_function('e => !e.isConnected', arg=opener)
    c.page.keyboard.press('Escape')
    focused = c.page.evaluate("""() => { const a = document.activeElement;
      return a.matches('.target-open') ? a.closest('tr')?.dataset.tonightId : a.id || a.tagName; }""")
    c.expect_eq(focused, row_id, 'the same target button receives restored focus after a refresh')
    tab(c, 'catalog')
    c.expect_eq(c.page.locator('tr[data-id][role]').count(), 0, 'Catalog preserves native rows')
    c.page.locator('#cat-more > summary').click()
    for selector in ['#cat-clear', '#cat-saved', '#cat-rig']:
        control = c.page.locator(selector)
        control.focus(); c.page.keyboard.press('Space')
        c.expect(control.evaluate('e=>e===document.activeElement'), selector + ' keeps focus')
        c.page.keyboard.press('Space')
    c.page.locator('#cat-con').focus(); c.page.locator('#cat-con').select_option('Cep')
    c.expect_eq(c.page.evaluate('document.activeElement.id'), 'cat-con', 'constellation keeps focus')
    c.page.locator('#cat-sort').focus(); c.page.locator('#cat-sort').select_option('type')
    c.expect_eq(c.page.evaluate('document.activeElement.id'), 'cat-sort', 'sort keeps focus')
    c.page.locator('#cat-sort-type').focus(); c.page.keyboard.press('Enter')
    c.expect_eq(c.page.locator('th[data-k="type"]').get_attribute('aria-sort'), 'descending')
    c.expect_eq(c.page.evaluate('document.activeElement.id'), 'cat-sort-type')
    c.page.keyboard.press('Space')
    c.expect_eq(c.page.locator('th[data-k="type"]').get_attribute('aria-sort'), 'ascending')
    c.page.locator('#cat-clear-filters').focus(); c.page.keyboard.press('Enter')
    c.expect_eq(c.page.evaluate('document.activeElement.id'), 'cat-clear-filters')
    search = c.page.locator('#cat-q')
    search.fill('Synth'); search.evaluate("e=>e.setSelectionRange(1,4,'backward')")
    c.page.wait_for_timeout(250)
    c.expect_eq(search.evaluate('e=>[e.selectionStart,e.selectionEnd,e.selectionDirection]'), [1,4,'backward'])
    c.page.set_viewport_size({'width':360,'height':800})
    c.page.locator('#cat-reverse').focus(); c.page.keyboard.press('Enter')
    c.expect_eq(c.page.evaluate('document.activeElement.id'), 'cat-reverse')
    c.expect(c.page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'phone page has no overflow')
    c.page.screenshot(path=str(c.artifacts/'review-phase567-catalog-phone.png'), full_page=True)
    c.expect('reloads the app' not in c.page.locator('#menuPanel').inner_text(), 'Advanced help describes live switch')
    c.assert_clean()


def forecast(cloud=0):
    times = [(datetime(2026,10,9) + timedelta(hours=i)).isoformat(timespec='minutes') for i in range(48)]
    return {'hourly': {'time':times, **{k:[v]*48 for k,v in {
        'cloud_cover':cloud, 'precipitation_probability':0, 'precipitation':0,
        'temperature_2m':4, 'dew_point_2m':0, 'visibility':20000,
        'weather_code':0, 'wind_speed_10m':0}.items()}}}


def deferred_weather(c):
    c.page.evaluate(r'''()=>{
      const original=window.fetch;
      window.__reviewWeather=[];
      window.fetch=(url,...args)=> /https:\/\/(api|air-quality-api)\.open-meteo\.com/.test(String(url))
        ? new Promise((resolve,reject)=>window.__reviewWeather.push({url:String(url),resolve,reject}))
        : original(url,...args);
    }''')


def complete_weather(c, index, data, air_fail=False, forecast_fail=False):
    c.page.evaluate('''({index,data,airFail,forecastFail})=>{
      const rows=window.__reviewWeather.slice(index,index+2);
      for(const r of rows) {
        const air=r.url.includes('air-quality-api');
        if((air&&airFail)||(!air&&forecastFail)) r.reject(new Error('controlled provider failure'));
        else r.resolve({ok:true,json:async()=>air?{hourly:{time:[]}}:data});
      }
    }''', {'index':index,'data':data,'airFail':air_fail,'forecastFail':forecast_fail})


@check('web-review-phase6-weather-missing-zero-and-retry', 'web')
def weather_values(c):
    start(c, FIXTURE)
    seed(c,[{**SITES[0], 'lon':151.2, 'tz':None}], minAlt=20, minVis=0)
    date(c,'2026-10-09'); deferred_weather(c)
    c.expect_eq(c.page.evaluate('window.__reviewWeather.length'),0,'untouched weather never fetches unasked')
    c.page.locator('#btnWeather').click()
    c.expect(c.page.evaluate('''()=>window.__reviewWeather.every(r=>
      new URL(r.url).searchParams.get('timezone')===Intl.DateTimeFormat().resolvedOptions().timeZone)'''),
      'blank site timezone requests the planning/browser zone rather than provider auto')
    missing = forecast()
    for key in ['cloud_cover','precipitation_probability','temperature_2m','weather_code']:
        missing['hourly'][key] = [None]*48
    missing['hourly']['precipitation']=[' ']*48
    missing['hourly'].pop('visibility')
    complete_weather(c,0,missing,air_fail=True)
    c.page.wait_for_function("() => document.querySelector('#wxChip').textContent.includes('insufficient')")
    text = c.page.locator('#wxBody').inner_text()
    c.expect('Insufficient data' in text and 'Unknown' in text, 'missing inputs visibly remain unknown')
    c.expect('100/100' not in text and 'Dry' not in text and 'Low' not in text, 'no fabricated good weather')
    # Context replacement loads a new requested forecast; real zeros are valid.
    c.page.locator('#tb-site').select_option('review-b')
    complete_weather(c,2,forecast(),air_fail=True)
    c.page.wait_for_function("() => document.querySelector('#wxChip').textContent.includes('100/100')")
    c.expect_in('0–0%', c.page.locator('#wxBody').inner_text(), 'genuine zero clouds retained')
    c.page.locator('#tb-site').select_option('review-a')
    complete_weather(c,4,forecast(),forecast_fail=True)
    c.page.wait_for_function("() => document.querySelector('#wxChip').textContent.includes('unavailable')")
    c.page.locator('#btnWeather').click(); c.page.locator('#btnWeather').click()
    complete_weather(c,6,forecast(90))
    c.page.wait_for_function("() => document.querySelector('#wxChip').textContent.includes('Poor')")
    c.assert_clean()


@check('web-review-phase6-weather-site-and-timezone-ownership', 'web')
def weather_ownership(c):
    start(c, FIXTURE); deferred_weather(c)
    c.page.locator('#btnWeather').click()
    c.page.locator('#tb-site').select_option('review-b')
    c.expect_eq(c.page.evaluate('window.__reviewWeather.length'), 4, 'first pending request follows new site')
    complete_weather(c,2,forecast(90))
    c.page.wait_for_function("() => document.querySelector('#wxChip').textContent.includes('Poor')")
    complete_weather(c,0,forecast())
    c.page.wait_for_timeout(60)
    c.expect_in('Poor', c.page.locator('#wxChip').inner_text(), 'late old-site success cannot replace current data')
    c.expect_eq(c.page.locator('#wxSite').text_content(), 'Review B')
    c.page.locator('#tzSelect').evaluate("e=>{e.value='Europe/Berlin';e.dispatchEvent(new Event('change',{bubbles:true}));}")
    c.expect_eq(c.page.evaluate('window.__reviewWeather.length'), 6, 'timezone changes request new wall-hour data')
    c.page.locator('#tb-site').select_option('review-a')
    complete_weather(c,6,forecast())
    c.page.wait_for_function("() => document.querySelector('#wxChip').textContent.includes('Good')")
    complete_weather(c,4,forecast(),forecast_fail=True)
    c.page.wait_for_timeout(60)
    c.expect_in('Good', c.page.locator('#wxChip').inner_text(), 'obsolete failures cannot poison current request')
    c.assert_clean()
