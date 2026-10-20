"""Planner control, focus and responsive acceptance over isolated browser data."""
from harness import ROOT, check
from web_suite import READY, boot, tab


@check('web-simpler-overviews-and-direct-settings', 'web')
def simpler_overviews_and_direct_settings(c):
    import re
    c.page.set_viewport_size({'width':1894,'height':1244})
    boot(c)
    headers = c.page.locator('#tonight-rank-table thead th').all_text_contents()
    c.expect_eq(headers, ['#','Target','Relative score','Max altitude','Best usable interval'])
    c.expect(c.page.locator('#tonight-rank-table tbody tr[data-tonight-id]').count() > 0,
             'removing display columns keeps real night recommendations')
    c.page.screenshot(path=str(c.artifacts / 'simplified-tonight-1894.png'))
    for key in ('site','rig'):
        button = c.page.locator(f'#{key}-settings')
        button.hover()
        c.page.wait_for_function("id => getComputedStyle(document.getElementById(id)).color === 'rgb(249, 200, 93)'",
                                 arg=f'{key}-settings')
        c.expect_eq(button.evaluate('el => getComputedStyle(el).color'), 'rgb(249, 200, 93)',
                    'settings words turn brass on hover')
        button.click()
        c.page.wait_for_selector(f'#set-tab-{key}s[aria-selected="true"]')
        if key == 'site':
            c.page.wait_for_selector('#sf-site:not([hidden])')
            c.expect_eq(c.page.locator('#sf-site-id').input_value(), c.page.locator('#tb-site').input_value(),
                        'Site opens the active record editor directly')
        else:
            c.expect(c.page.locator('#set-add-rig').is_visible(), 'no active rig opens equipment setup')
        c.page.keyboard.press('Escape')
        c.page.wait_for_function("document.querySelector('#modal').hidden")
        c.expect_eq(active_id(c), f'{key}-settings', 'closing returns focus to the direct entry')
    # Add a fixture record via the store, then choose it through the real selector.
    source = (ROOT / 'web/app.js').read_text(encoding='utf-8')
    ws = re.search(r'\./webstore\.js\?v=\d+', source).group(0)
    c.page.evaluate('''async url => {
      const W=await import(url);
      await W.saveRigRec({id:'direct-rig',name:'Direct rig check',focal_mm:500,
        sensor_w:20,sensor_h:15,fov_w:137.5,fov_h:103.1,fov_unit:'arcmin'});
    }''', ws)
    c.page.locator('#rig-settings').click()
    c.page.wait_for_selector('#set-rigs [data-editrig="direct-rig"]')
    c.page.keyboard.press('Escape')
    c.page.locator('#rigSelect').select_option('direct-rig')
    c.page.locator('#rig-settings').focus()
    c.page.keyboard.press('Enter')
    c.page.wait_for_selector('#sf-rig:not([hidden])')
    c.expect_eq(c.page.locator('#sf-rig-id').input_value(), 'direct-rig', 'Rig opens the selected record directly')
    c.expect_eq(c.page.locator('#sf-rig-focal').input_value(), '500')
    c.page.keyboard.press('Escape')
    c.expect_eq(active_id(c), 'rig-settings')
    tab(c, 'sky')
    c.expect_eq(c.page.locator('.sky-visible-card, #sky-visible-now').count(), 0, 'Sky list is removed')
    c.expect(c.page.locator('.sky-controls-tray').is_visible(), 'chart controls remain available')
    c.page.locator('#btnMenu').click()
    c.expect('Moon penalty' in c.page.locator('#menuPanel').inner_text(), 'filter help states its scoring effect')
    c.page.keyboard.press('Escape')
    c.page.screenshot(path=str(c.artifacts / 'simplified-sky-1894.png'))
    c.page.set_viewport_size({'width':360,'height':900})
    c.page.keyboard.press('Tab')
    for key in ('site','rig'):
        button=c.page.locator(f'#{key}-settings')
        button.focus()
        c.page.wait_for_function("id => getComputedStyle(document.getElementById(id)).color === 'rgb(249, 200, 93)'",
                                 arg=f'{key}-settings')
        c.expect_eq(button.evaluate('el => getComputedStyle(el).color'), 'rgb(249, 200, 93)',
                    'keyboard focus also exposes the settings action')
        c.page.keyboard.press('Space')
        c.page.wait_for_selector(f'#set-tab-{key}s[aria-selected="true"]')
        c.page.keyboard.press('Escape')
    c.expect(c.page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'direct entries fit phone width')
    c.page.screenshot(path=str(c.artifacts / 'simplified-sky-360.png'))
    c.page.locator('#btnMenu').click()
    c.page.locator('#fltHa').check()
    c.page.keyboard.press('Escape')
    tab(c, 'catalog')
    c.page.locator('#cat-type-galaxy').check()
    c.page.wait_for_selector('.cat-results .f-own[title*="broadband"]')
    c.expect(c.page.locator('.cat-results .f-own').evaluate_all("els => els.every(el=>el.textContent==='BB')"),
             'broadband-only targets are never mislabeled NB when narrowband is owned')
    c.assert_clean()


@check('web-followup-smooth-scrub-and-horizon-scroll', 'web')
def smooth_scrub_and_horizon_scroll(c):
    c.page.set_viewport_size({'width':1894, 'height':900})
    boot(c)
    tab(c, 'catalog')
    c.page.locator('tr[data-id]').first.click()
    c.page.wait_for_selector('#graph')
    tab(c, 'sky')
    c.page.locator('#sky-selected-detail').click()
    c.page.wait_for_selector('#graph')
    # Verify real keyboard stepping, then a same-frame drag burst with both
    # canvases active. Controls must be immediate and paints must converge.
    for selector in ('#sky-slider', '#tb-scrub'):
        slider = c.page.locator(selector)
        slider.evaluate("el => { el.value='120'; el.dispatchEvent(new Event('input',{bubbles:true})); }")
        slider.focus()
        before = int(slider.input_value())
        c.page.keyboard.press('ArrowRight')
        c.expect_eq(int(slider.input_value()) - before, 1, 'arrow advances one minute')
    c.page.wait_for_timeout(100)
    result = c.page.evaluate('''async () => {
      const sky=document.querySelector('#sky').getContext('2d');
      const graph=document.querySelector('#graph').getContext('2d');
      const counts={sky:0,graph:0};
      const restore=[];
      for (const [ctx,key] of [[sky,'sky'],[graph,'graph']]) {
        const original=ctx.clearRect;
        ctx.clearRect=function(...args){counts[key]++; return original.apply(this,args);};
        restore.push(()=>ctx.clearRect=original);
      }
      const slider=document.querySelector('#sky-slider');
      for(let v=200;v<=239;v++) {
        slider.value=String(v); slider.dispatchEvent(new Event('input',{bubbles:true}));
      }
      const immediate={value:Number(slider.value), top:Number(document.querySelector('#tb-scrub').value),
        clock:document.querySelector('#sky-sout').textContent,
        detail:document.querySelector('#m-selected-position').textContent, counts:{...counts}};
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const result={immediate,counts:{...counts}, summary:document.querySelector('#skyChartSummary').textContent};
      restore.forEach(fn=>fn()); return result;
    }''')
    c.expect_eq(result['immediate']['value'], 239)
    c.expect_eq(result['immediate']['top'], 239, 'top slider tracks the newest selection immediately')
    c.expect(result['immediate']['clock'] in result['immediate']['detail'], 'inspector facts track final time immediately')
    c.expect_eq(result['immediate']['counts'], {'sky':0,'graph':0}, 'burst queues paints instead of blocking input')
    c.expect_eq(result['counts'], {'sky':1,'graph':1}, 'each canvas paints once for the burst')
    c.expect(result['immediate']['clock'] in result['summary'], 'chart is painted at the final selection')
    c.page.screenshot(path=str(c.artifacts / 'followup-sky-1894.png'))
    # Leave with a queued paint: the old workspace cannot overwrite a new view.
    c.page.evaluate("() => { const s=document.querySelector('#sky-slider'); s.value='240'; s.dispatchEvent(new Event('input')); location.hash='#horizon'; }")
    c.page.wait_for_selector('#hz-new-draw', state='visible')
    c.page.click('#hz-new-draw')
    c.page.wait_for_selector('#hz-canvas', state='visible')
    for width, height in ((1894,900),(1440,700)):
        c.page.set_viewport_size({'width':width,'height':height})
        c.page.evaluate('window.scrollTo(0,400)')
        c.page.wait_for_timeout(150)
        state = c.page.evaluate('''() => {
          const rail=document.querySelector('.horizon-tools-rail');
          const card=rail.querySelector('.card').getBoundingClientRect();
          const toolbar=document.querySelector('.horizon-stage > .ed-tools');
          const tools=toolbar.getBoundingClientRect();
          const r=rail.getBoundingClientRect();
          return {top:r.top,bottom:r.bottom,toolsTop:tools.top,toolsBottom:tools.bottom,
            toolPosition:getComputedStyle(toolbar).position,toolBackground:getComputedStyle(toolbar).backgroundColor,
            position:getComputedStyle(rail).position, childPosition:getComputedStyle(rail.querySelector('.card')).position};
        }''')
        c.expect_eq(state['position'], 'sticky')
        c.expect(state['childPosition'] != 'sticky', 'first section cannot stick over the editing tools')
        c.expect_eq(state['toolPosition'], 'sticky', 'stage tools remain available beside the grid')
        c.expect_eq(state['toolBackground'], 'rgb(11, 17, 21)', 'sticky tools stay opaque over the scrolling grid')
        c.expect(state['toolsTop'] >= 0 and state['toolsBottom'] <= height, 'whole toolbar fits the viewport')
        c.expect(state['top'] >= 0 and state['bottom'] <= height, 'whole rail fits the viewport')
        c.page.locator('#hz-mode-overhang').focus()
        c.page.wait_for_timeout(50)
        mode = c.page.locator('#hz-mode-overhang').bounding_box()
        c.expect(mode['y'] >= 0 and mode['y']+mode['height'] <= height,
                 f'keyboard reaches the mode buttons inside the toolbar: viewport={height}, button={mode}')
        c.expect(c.page.locator('.topbar').bounding_box()['y'] >= 0, 'header stays visible throughout the editor')
        c.page.screenshot(path=str(c.artifacts / f'followup-horizon-scroll-{width}.png'))
    c.page.set_viewport_size({'width':360,'height':900})
    c.page.evaluate('window.scrollTo(0,0)')
    # ResizeObserver and Save can still be laying out the new viewport.
    # Flush the pending layout frames, then measure both regions atomically;
    # separate locator round trips can otherwise mix two layout generations.
    c.page.evaluate("""() => new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)))""")
    regions = c.page.evaluate("""() => {
      const tools=document.querySelector('.horizon-tools-rail').getBoundingClientRect();
      const stage=document.querySelector('.horizon-stage').getBoundingClientRect();
      return {toolsBottom:tools.bottom,stageTop:stage.top,width:innerWidth};
    }""")
    c.expect(regions['stageTop'] >= regions['toolsBottom'],
             f'phone stacks the complete tools rail before the grid: {regions}')
    # BROWSER-CI-002: this failed twice on Linux CI only. On failure, name the
    # non-fixed elements reaching past the viewport so the cause is in the log.
    overflow = c.page.evaluate("""() => {
      const w = innerWidth, sw = document.documentElement.scrollWidth;
      if (sw <= w) return null;
      const fixed = (e) => { for (let n = e; n; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true; return false; };
      const wide = [...document.querySelectorAll('body *')]
        .map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ e, r }) => r.width > 0 && r.right > w + 0.5 && !fixed(e))
        .sort((a, b) => b.r.right - a.r.right).slice(0, 6)
        .map(({ e, r }) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}`
          + `${e.classList.length ? '.' + [...e.classList].join('.') : ''} right=${Math.round(r.right)} width=${Math.round(r.width)}`);
      return { scrollWidth: sw, innerWidth: w, wide };
    }""")
    c.expect(overflow is None, f'phone has no horizontal overflow: {overflow}')
    c.page.screenshot(path=str(c.artifacts / 'followup-horizon-360.png'))
    c.assert_clean()


@check('web-open-workspace-and-dialog-boundaries', 'web')
def open_workspace(c):
    boot(c)
    for view, selectors in (
        ('tonight', ['.tonight-ranked']),
        ('catalog', ['.cat-filter-rail', '.catalog-table-card']),
        ('sky', ['.sky-time-rail', '.sky-controls-tray']),
        ('horizon', ['.card']),
    ):
        tab(c, view)
        for selector in selectors:
            state = c.page.eval_on_selector_all(selector, '''els => els.map(el => {
              const s=getComputedStyle(el); return {bg:s.backgroundColor,
                border:parseFloat(s.borderTopWidth)+parseFloat(s.borderRightWidth)+
                       parseFloat(s.borderBottomWidth)+parseFloat(s.borderLeftWidth),shadow:s.boxShadow};
            })''')
            c.expect(state, f'{view} has the expected workspace section {selector}')
            c.expect(all(s['bg'] == 'rgba(0, 0, 0, 0)' and s['border'] <= 1 and s['shadow'] == 'none' for s in state),
                     f'{view} sections share the page surface without card perimeters: {state}')
    c.page.locator('#btnMenu').click()
    panel = c.page.locator('#menuPanel')
    c.expect(panel.is_visible(), 'temporary options remain identifiable')
    c.expect(panel.evaluate("el => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(getComputedStyle(el).borderTopWidth) > 0"),
             'temporary menus retain an opaque surface and boundary')
    c.assert_clean()


@check('web-advanced-live-mode-and-responsive-warming', 'web')
def advanced_live_mode(c):
    import re
    import time
    boot(c)
    token = re.search(r"from './horizon.js\?v=(\d+)'", (ROOT / 'web/app.js').read_text(encoding='utf-8')).group(1)
    c.page.evaluate('''async url => {
      const H=await import(url);
      await H.applyHorizonsSnapshot(H.normalizeHorizons({activeId:'load-check',horizons:[
        {id:'load-check',name:'Loading check',points:[{az:0,alt:18}]}]}));
    }''', './horizon.js?v=' + token)
    c.page.locator('#tb-date').fill('2026-08-12')
    c.page.locator('#tb-date').dispatch_event('change')
    tab(c, 'catalog')
    c.page.wait_for_function("() => document.querySelector('#busy').classList.contains('hidden')")
    c.page.evaluate('window.__modeContinuity = true')
    c.page.locator('#btnMenu').click()
    cdp = c.page.context.new_cdp_session(c.page)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate':4})
    t0 = time.monotonic()
    c.page.locator('#advMode').check()
    first = time.monotonic() - t0
    c.expect(c.page.evaluate('window.__modeContinuity === true'), 'mode changes do not reload the application')
    c.expect_eq(c.page.locator('#tb-date').input_value(), '2026-08-12', 'the planned date survives a mode change')
    c.page.locator('#btnMenu').click()
    c.page.wait_for_function("() => !document.querySelector('#pct-status').textContent && document.querySelector('#busy').classList.contains('hidden')", timeout=30000)
    completed = time.monotonic() - t0
    print(f'        active-horizon advanced mode, 4x CPU: first table {first:.2f}s, complete {completed:.2f}s')
    c.expect(first < 3 and completed < 8, 'the active-horizon advanced catalog stays responsive on a slower CPU')
    c.expect('standard mode' not in c.page.locator('.cat-count').first.inner_text(), 'advanced membership is active')
    percentages = c.page.locator('td.pct').all_text_contents()
    t1 = time.monotonic()
    c.page.locator('#tb-scrub').evaluate('''el => {
      for (const v of [300,600,900]) {
        el.value=v; el.dispatchEvent(new Event('input',{bubbles:true}));
      }
    }''')
    scrubbed = time.monotonic() - t1
    c.expect_eq(c.page.locator('td.pct').all_text_contents(), percentages, 'scrubbing reuses night percentages while selected-time facts refresh')
    c.expect(c.page.locator('#busy').evaluate("el => el.classList.contains('hidden')"), 'scrubbing does not restart full-night warming')
    c.expect(scrubbed < 2, f'cached scrubbing stays responsive ({scrubbed:.2f}s; limit 2s)')
    print(f'        three cached Catalog scrubs, 4x CPU: {scrubbed:.2f}s')
    # Timing must not improve by displaying stale selected-time facts.
    facts=c.page.evaluate('''async () => {
      const token=[...document.querySelectorAll('script[type="module"]')][0].src;
      const source=await (await fetch(token)).text();
      const url=name=>source.match(new RegExp("\\\\./"+name+"\\\\.js\\\\?v=\\\\d+"))[0];
      const E=await import(url('astro')),W=await import(url('webstore'));
      const catalog=await (await fetch('./catalog.json')).json();
      const pool=Array.isArray(catalog)?catalog:catalog.objects;
      const site=(await W.getSites()).find(s=>s.id===document.querySelector('#tb-site').value);
      const jd=E.julianDay(new Date(window.__ns_scrub_sel()));
      return [...document.querySelectorAll('table.cat tbody tr[data-id]')].map(row=>{
        const o=pool.find(o=>o.id===row.dataset.id),alt=E.altaz(o.ra_hours*15,o.dec_deg,jd,site.lat,site.lon)[0];
        return {shown:row.children[5].textContent,expected:alt.toFixed(0)+'°'};
      });
    }''')
    c.expect(all(f['shown']==f['expected'] for f in facts),'cached Catalog rows show the final selected minute')
    c.page.locator('#cat-q').fill('Andromeda')
    c.page.wait_for_function("() => document.querySelectorAll('table.cat tbody tr[data-id]').length < 20 && [...document.querySelectorAll('table.cat tbody tr')].some(el => el.textContent.includes('Andromeda'))")
    # Start new-night warming, then supersede it with another date/search in
    # the same turn. Stale jobs must not repaint a newer search or retain busy.
    c.page.evaluate('''() => {
      let q=document.querySelector('#cat-q');
      q.value=''; q.dispatchEvent(new Event('input',{bubbles:true}));
      const d=document.querySelector('#tb-date');
      d.value='2026-08-13'; d.dispatchEvent(new Event('change',{bubbles:true}));
      d.value='2026-08-14'; d.dispatchEvent(new Event('change',{bubbles:true}));
      q=document.querySelector('#cat-q');
      q.value='Andromeda'; q.dispatchEvent(new Event('input',{bubbles:true}));
    }''')
    c.page.wait_for_timeout(400)
    c.expect_eq(c.page.locator('#cat-q').input_value(), 'Andromeda', 'new planner revisions preserve the active search')
    c.expect(c.page.locator('#busy').evaluate("el => el.classList.contains('hidden')"), 'superseded warming releases the busy indicator')
    c.page.locator('#btnMenu').click()
    c.page.locator('#advMode').uncheck()
    c.expect(c.page.evaluate('window.__modeContinuity === true'), 'returning to standard mode also stays live')
    c.expect_eq(c.page.locator('#cat-q').input_value(), 'Andromeda', 'search survives returning to standard mode')
    c.expect('standard mode' in c.page.locator('.cat-count').first.inner_text(), 'standard membership is restored')
    cdp.send('Emulation.setCPUThrottlingRate', {'rate':1})
    c.assert_clean()


@check('web-planner-simplified-panels', 'web')
def simplified_panels(c):
    from web_suite import open_editor
    boot(c)
    for width in (1240, 360):
        c.page.set_viewport_size({'width': width, 'height': 900})
        tab(c, 'tonight')
        c.wait_tonight_render()
        c.expect_eq(c.page.locator('#tonightOverviewChart, #tonightOverviewKeys').count(), 0,
                    'Tonight overview is removed')
        c.expect(c.page.locator('#tonight-rank-table').is_visible(), 'Tonight ranking remains')
        c.expect_eq(c.page.locator('#tonight-time-scrub').count(), 0, 'duplicate Tonight slider is removed')
        c.expect(c.page.locator('#tb-scrub').is_visible(), 'common selected-time control remains')
        tab(c, 'catalog')
        types = c.page.locator('#cat-type')
        state = types.evaluate('''el => ({count: el.querySelectorAll('input').length,
          scroll: el.scrollHeight, height: el.clientHeight,
          optionBottom: el.querySelector('label:last-of-type').getBoundingClientRect().bottom,
          bottom: el.getBoundingClientRect().bottom})''')
        c.expect(state['count'] > 4 and
                 state['scroll'] <= state['height'] + 1 and state['optionBottom'] <= state['bottom'],
                 f'all object types fit without an internal scrollbar at {width}px: {state}')
        value = types.locator('input').first.get_attribute('value')
        types.locator('input').first.check()
        c.expect_eq(c.page.locator('#cat-type').evaluate('el => [...el.querySelectorAll("input:checked")].map(o => o.value)'),
                    [value], 'object-type selection survives filtering')
        c.expect(c.page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 1'),
                 'full type list does not widen the page')
    open_editor(c)
    for retired in ('[id^="ed-prov-"]', '#ed-profile-apply', '#ed-landmark-add', '#ed-crop', '#simple-flow'):
        c.expect_eq(c.page.locator(retired).count(), 0, f'retired editor control {retired} stays removed')
    counts = c.page.evaluate('''() => {
      const all = [...document.querySelectorAll(
        '.horizon-layout input, .horizon-layout select, .horizon-layout button, .horizon-layout label.btn')]
        .filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
      // Chrome still lays out the content of a closed <details>; at first
      // glance only controls outside closed disclosures are visible.
      const glance = all.filter(e => !e.closest('details:not([open])') || e.closest('summary'));
      return { glance: glance.length, total: all.length };
    }''')
    c.expect(counts['glance'] <= 20, f'the horizon editor stays simple at first glance: {counts}')
    c.expect(counts['total'] <= 40, f'the horizon editor stays small including its disclosures: {counts}')
    c.assert_clean()


def active_id(c):
    return c.page.evaluate("() => document.activeElement.id")


@check('web-annotated-catalog-and-night-controls', 'web')
def annotated_controls(c):
    """Exercise actual multi-type clicks, fresh-entry windows and phase scrubbing."""
    import re
    source = (ROOT / 'web/app.js').read_text(encoding='utf-8')
    modules = {name: re.search(r'\./' + name + r'\.js\?v=\d+', source).group(0)
               for name in ('webstore', 'horizon')}
    c.page.set_viewport_size({'width':1894, 'height':1244})
    boot(c)
    tab(c, 'catalog')
    c.page.locator('#cat-clear-filters').click()
    c.page.locator('#cat-type-galaxy').check()
    c.page.locator('#cat-type-nebula').check()
    c.expect_eq(c.page.locator('#cat-type input:checked').count(), 2,
                'ordinary clicks combine types without modifier keys')
    c.expect(c.page.locator('td.type-cell').evaluate_all("els => els.every(e => /Galaxy|Nebula/.test(e.textContent))"),
             'combined type filters include either checked type')
    c.page.locator('#cat-type-galaxy').focus()
    c.page.keyboard.press('Space')
    c.expect_eq(active_id(c), 'cat-type-galaxy', 'Space keeps focus after rebuilding the filter rail')
    c.expect_eq(c.page.locator('#cat-type input:checked').count(), 1)
    c.expect(c.page.locator('td.type-cell').evaluate_all("els => els.every(e => e.textContent.includes('Nebula'))"),
             'unchecking one type retains the other selection')
    c.page.locator('#cat-all-types').click()
    c.expect_eq(c.page.locator('#cat-type input:checked').count(), 0)
    c.expect_eq(c.page.locator('table.cat tbody tr[data-id]').count(), 50)
    c.page.locator('#pg-next').click()
    c.expect_eq(c.page.locator('td.rank-cell').first.inner_text(), '51', 'second page begins at object 51')
    c.page.locator('#pg-prev').click()
    c.page.wait_for_function("() => [...document.querySelectorAll('td.best-window')].every(e => e.textContent !== '…')")
    before = c.page.locator('td.best-window').all_text_contents()
    c.page.reload(wait_until='domcontentloaded')
    c.page.wait_for_selector('table.cat tbody tr[data-id]')
    c.page.wait_for_function("() => [...document.querySelectorAll('td.best-window')].length > 0 && [...document.querySelectorAll('td.best-window')].every(e => e.textContent !== '…')")
    c.expect_eq(c.page.locator('#tonight-rank-table').count(), 0, 'fresh Catalog entry does not render Tonight')
    c.expect_eq(c.page.locator('td.best-window').all_text_contents(), before,
                'fresh Catalog entry computes the same windows without Tonight results')
    c.expect('Rises later' not in c.page.locator('.cat-results').inner_text(),
             'Catalog must not label a best-window start as horizon rise')
    c.page.locator('#tb-date').fill('2026-08-13')
    c.page.locator('#tb-date').dispatch_event('change')
    c.page.wait_for_function("() => document.querySelector('.catalog-context')?.textContent.includes('2026-08-13') && [...document.querySelectorAll('td.best-window')].every(e => e.textContent !== '…')")
    after = c.page.locator('td.best-window').all_text_contents()
    c.expect(after != before, 'changing the night replaces old best-window facts')
    # The Inspector independently computes its shared-core interval; compare
    # actual displayed facts rather than a stale Tonight map.
    row = c.page.locator('table.cat tr[data-id]').filter(has=c.page.locator('td.best-window').filter(has_text='–')).first
    best = row.locator('td.best-window').inner_text()
    row.click()
    c.expect_eq(c.page.locator('#m-hero-window').inner_text(), best,
                'refreshed Catalog best window agrees with target details')
    c.page.locator('#m-close').click()
    c.page.screenshot(path=str(c.artifacts / 'annotations-catalog-1894.png'))
    tab(c, 'sky')
    rail = c.page.locator('.sky-time-rail').bounding_box()
    chart = c.page.locator('.sky-canvas-box').bounding_box()
    c.expect(rail['y'] + rail['height'] <= chart['y'], 'time controls are above the chart')
    c.expect_eq(c.page.locator('#sky-time').count(), 0, 'date editing stays in the common top bar')
    legend = c.page.locator('#sky-phase-legend').bounding_box()
    slider = c.page.locator('#sky-slider').bounding_box()
    entries = [e.bounding_box() for e in c.page.locator('#sky-phase-legend span').all()]
    c.expect(legend['x'] + legend['width'] <= slider['x'], 'the legend occupies the former clock space')
    c.expect(all(entries[i]['y'] < entries[i+1]['y'] for i in range(3)), 'twilight labels stack vertically')
    c.expect(slider['width'] > rail['width'] * .65, 'the large slider uses most of the rail width')
    c.expect(rail['height'] <= 66, 'the time rail stays compact on desktop')
    c.expect_eq(c.page.locator('#sky-slider').evaluate("e => e.style.getPropertyValue('--night-track')"),
                c.page.locator('#tb-scrub').evaluate("e => e.style.getPropertyValue('--night-track')"),
                'both time controls use the same site/night gradient')
    c.page.locator('#sky-slider').evaluate("e => {e.value=String(Number(e.max)/2); e.dispatchEvent(new Event('input',{bubbles:true}));}")
    c.expect_eq(c.page.locator('#sky-sout').inner_text(), c.page.locator('#tb-scrub-time').inner_text())
    c.expect_eq(c.page.locator('#sky-phase').inner_text(), 'Astronomical night',
                'midnight phase is expressed in text as well as color')
    c.expect_in('Astronomical night', c.page.locator('#sky-slider').get_attribute('aria-valuetext'))
    c.page.screenshot(path=str(c.artifacts / 'annotations-sky-1894.png'))
    for width in (640, 360):
        c.page.set_viewport_size({'width':width, 'height':900})
        c.expect(c.page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),
                 'the top chart time controls must fit a narrow viewport')
        c.expect(c.page.locator('#sky-slider').is_visible(), 'the phase slider stays visible on narrow screens')
        c.page.screenshot(path=str(c.artifacts / f'annotations-sky-{width}.png'))
    c.page.set_viewport_size({'width':1894, 'height':1244})
    # A polar summer must show daylight on the fallback span, rather than
    # inventing sunset/darkness just to draw a symmetrical gradient.
    c.page.evaluate('''async modules => {
      const WS=await import(modules.webstore), H=await import(modules.horizon);
      await WS.saveSiteRec({id:'phase-polar',name:'Polar summer check',lat:89,lon:0,elev:0,tz:'UTC'});
      H.setPrefs({activeSiteId:'phase-polar',viewFullDay:false});
    }''', modules)
    c.page.reload(wait_until='domcontentloaded')
    c.page.wait_for_selector('#sky-slider')
    c.page.wait_for_function("() => typeof window.__ns_scrub_range === 'function'")
    c.page.locator('#tb-date').fill('2026-06-21')
    c.page.locator('#tb-date').dispatch_event('change')
    c.page.wait_for_function("() => document.querySelector('#sky-phase')?.textContent === 'Daylight'")
    c.expect_in('no sunset–sunrise pair', c.page.locator('#sky-range-caption').inner_text())
    c.expect('var(--scrub-night)' not in c.page.locator('#sky-slider').evaluate("e => e.style.getPropertyValue('--night-track')"),
             'polar daylight has no fictitious astronomical-night band')
    c.assert_clean()


def actual_stops(c):
    # Independent DOM evidence, including closed disclosure ancestors; assert
    # successful focus separately rather than assuming rectangles prove it.
    return c.page.evaluate("""() => [...document.querySelectorAll('#modal .modal a[href], #modal .modal button, #modal .modal input, #modal .modal select, #modal .modal textarea, #modal .modal summary, #modal .modal [tabindex]')]
      .filter(el => el.tabIndex >= 0 && !el.matches(':disabled') &&
        !el.closest('[hidden], .hidden, .vhidden, [inert]') && el.getClientRects().length &&
        getComputedStyle(el).visibility === 'visible' &&
        ![...el.closest('.modal').querySelectorAll('details:not([open])')]
          .some(d => d.contains(el) && !d.querySelector(':scope > summary')?.contains(el)))
      .map((el, i) => { if (!el.id) el.id = 'focus-check-' + i; return el.id; })""")


def check_wrap(c):
    stops = actual_stops(c)
    c.expect(len(stops) >= 2, 'a dialog must have reachable controls')
    c.page.locator('#' + stops[-1]).focus()
    c.expect_eq(active_id(c), stops[-1], 'wrap test must start at the actual last control')
    c.page.keyboard.press('Tab')
    c.expect_eq(active_id(c), stops[0], 'forward Tab wraps to first reachable control')
    c.page.keyboard.press('Shift+Tab')
    c.expect_eq(active_id(c), stops[-1], 'reverse Tab wraps to last reachable control')


@check('web-phase4-popovers-and-setup', 'web')
def popovers_and_setup(c):
    boot(c)
    for url in ('https://api.open-meteo.com/**', 'https://air-quality-api.open-meteo.com/**'):
        c.page.route(url, lambda route: route.fulfill(status=200, content_type='application/json', body='{"hourly":{}}'))
    options = c.page.get_by_role('button', name='Options', exact=True)
    c.expect_eq(options.get_attribute('aria-expanded'), 'false', 'Options initially collapsed')
    options.focus()
    c.page.keyboard.press('Enter')
    c.expect_eq(options.get_attribute('aria-expanded'), 'true', 'Options reports its open state')
    c.page.keyboard.press('Tab')
    c.expect(c.page.evaluate("() => menuPanel.contains(document.activeElement)"), 'Tab reaches Options controls')
    c.page.keyboard.press('Escape')
    c.expect_eq(active_id(c), 'btnMenu', 'Escape returns to Options')
    c.expect_eq(options.get_attribute('aria-expanded'), 'false', 'Escape collapses Options')
    weather = c.page.locator('#btnWeather')
    weather.click()
    c.expect_eq(weather.get_attribute('aria-expanded'), 'true', 'Weather reports its open state')
    c.page.locator('#wxAuto').focus()
    c.page.keyboard.press('Escape')
    c.expect_eq(active_id(c), 'btnWeather', 'Escape returns to Weather')
    c.expect_eq(weather.get_attribute('aria-expanded'), 'false', 'Weather reports closure')
    options.click()
    weather.click()
    c.expect_eq(options.get_attribute('aria-expanded'), 'false', 'only one popover opens at a time')
    options.click()
    c.page.locator('#btn-settings').click()
    c.page.wait_for_selector('#m-set-title')
    c.expect_eq(active_id(c), 'm-set-title', 'Setup starts at its labeled heading')
    c.expect(c.page.locator('#view').evaluate('(el) => el.inert'), 'modal hides background from interaction')
    sites = c.page.get_by_role('tab', name='Sites', exact=True)
    sites.focus()
    c.page.keyboard.press('ArrowRight')
    c.expect_eq(active_id(c), 'set-tab-rigs', 'Setup tabs support arrow navigation')
    c.expect_eq(c.page.locator('#set-tab-rigs').get_attribute('aria-selected'), 'true', 'selected Setup tab is exposed')
    check_wrap(c)
    c.page.locator('#set-tab-targets').click()
    c.page.locator('#set-add-target').click()
    c.page.locator('#sf-target-save').click()
    error = c.page.locator('#sf-target-err')
    c.expect_eq(error.get_attribute('role'), 'alert', 'target validation error is announced locally')
    c.expect(error.inner_text(), 'invalid target has a readable error')
    c.page.keyboard.press('Escape')
    c.expect_eq(active_id(c), 'btnMenu', 'Setup Escape restores visible Options trigger')
    c.expect(not c.page.locator('#view').evaluate('(el) => el.inert'), 'background restored after close')
    c.page.locator('#tab-tonight').focus()
    selected_time = c.page.locator('#tb-scrub-time').inner_text()
    c.page.keyboard.press('ArrowRight')
    c.page.wait_for_selector('.cat tbody tr[data-id]')
    c.expect_eq(active_id(c), 'tab-catalog', 'planner tabs support arrow navigation')
    c.expect_eq(c.page.locator('#tb-scrub-time').inner_text(), selected_time, 'tab navigation must not also scrub time')
    options.click()
    c.page.locator('#btn-settings').click()
    c.page.wait_for_selector('#m-set-title')
    c.page.mouse.click(3, 3)
    c.expect(c.page.locator('#modal').evaluate('(el) => el.hidden'), 'Setup backdrop dismisses dialog')
    c.expect_eq(active_id(c), 'btnMenu', 'backdrop restores Options trigger')
    c.page.set_viewport_size({'width': 360, 'height': 800})
    options.click()
    panel = c.page.locator('#menuPanel').bounding_box()
    c.expect(panel['x'] >= 0 and panel['x'] + panel['width'] <= 360, 'phone Options panel fits the screen')
    c.page.locator('#btn-settings').click()
    c.page.wait_for_selector('#m-set-title')
    c.page.locator('#set-tab-sites').click()
    c.page.locator('#set-add-site').click()
    c.expect_eq(active_id(c), 'sf-site-name', 'site form begins at its name')
    c.expect(c.page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 1'), 'phone Setup has no page overflow')
    check_wrap(c)
    c.page.keyboard.press('Escape')
    c.expect_eq(active_id(c), 'btnMenu', 'phone form dismissal restores Options')
    c.page.set_viewport_size({'width': 1240, 'height': 900})
    c.page.locator('.cat tbody tr[data-id]').first.click()
    c.page.wait_for_selector('#modal.detail-docked .modal')
    options.click()
    c.page.locator('#btn-settings').click()
    c.page.wait_for_selector('#m-set-title')
    c.page.keyboard.press('Escape')
    c.expect_eq(active_id(c), 'btnMenu', 'Setup takeover of a wide inspector returns to Options too')


@check('web-phase4-disclosure-focus', 'web')
def disclosure_focus(c):
    boot(c)
    c.page.set_viewport_size({'width': 900, 'height': 800})
    tab(c, 'catalog')
    c.page.locator('.cat tbody tr[data-id]').first.click()
    c.page.wait_for_selector('#modal:not([hidden]) .modal[aria-modal="true"]')
    disclosure = c.page.locator('#modal details.catalog-details')
    c.expect(not disclosure.evaluate('(el) => el.open'), 'catalog details starts closed')
    check_wrap(c)
    disclosure.locator('summary').click()
    check_wrap(c)
    c.page.keyboard.press('Escape')
    c.expect(c.page.evaluate("() => document.activeElement.matches('.cat tbody tr[data-id] .target-open')"), 'detail close restores its native target button')


@check('web-phase4-first-visit', 'web')
def first_visit(c):
    c.goto('/')
    c.page.wait_for_selector('#w-skip')
    c.expect_eq(active_id(c), 'm-wel-title', 'first visit starts at the welcome heading')
    text = c.page.locator('.welcome').inner_text()
    for hint in ('Berlin', 'Options', 'Setup', 'rig is optional', 'Frame %', 'Horizon'):
        c.expect(hint in text, 'welcome explains ' + hint)
    check_wrap(c)
    c.page.locator('#w-lat').fill('100')
    c.page.locator('#w-save').click()
    c.expect('Enter latitude' in c.page.locator('#w-status').inner_text(), 'invalid site gets a readable error')
    c.expect_eq(c.page.locator('#w-lat').input_value(), '100', 'validation preserves entered coordinates')
    c.page.keyboard.press('Escape')
    c.page.wait_for_selector(READY, timeout=60000)
    c.expect_eq(active_id(c), 'tab-tonight', 'example completion restores planner focus')


@check('web-phase4-responsive-planner', 'web')
def responsive_planner(c):
    boot(c)
    # Arm file-chooser interception long before the Enter press below.
    # expect_file_chooser() alone turns it on with a fire-and-forget message
    # that Chrome handles in the renderer behind queued page work, while the
    # key press takes the higher-priority input queue. On a busy CI runner the
    # keydown could win: Chrome opened (and headless cancelled) its own dialog
    # and the wait timed out with the label still focused (BROWSER-CI-002).
    c.page.on('filechooser', lambda chooser: None)
    screenshots = ROOT / 'logs' / 'phase4' / 'screenshots'
    screenshots.mkdir(parents=True, exist_ok=True)
    for width in (360, 640, 900, 1240):
        c.page.set_viewport_size({'width': width, 'height': 900})
        for view in ('tonight', 'catalog', 'sky', 'horizon'):
            tab(c, view)
            c.page.wait_for_timeout(100)
            box = c.page.evaluate("""() => ({page: document.documentElement.scrollWidth,
              width: innerWidth, clock: getComputedStyle(document.querySelector('#tb-scrub-time')).display,
              controls: ['tb-site','rigSelect','tb-minalt','tb-date','tb-scrub','btnMenu','btnWeather'].map(id => {
                const el = document.getElementById(id), r = el.getBoundingClientRect();
                return {id, x:r.x, right:r.right, width:r.width, size:parseFloat(getComputedStyle(el).fontSize)}; })})""")
            c.expect(box['page'] <= box['width'] + 1, f'{view} page fits {width}px: {box}')
            if not (width <= 640 and view == 'horizon'):
                c.expect(box['clock'] != 'none', f'{view} selected clock remains visible at {width}px')
            phone = width <= 640
            if phone:
                # Phone layout (DESIGN.md): the setup controls live in a sheet
                # the header's summary line opens; reach them through it.
                summary = c.page.locator('#ctxSummary')
                c.expect(summary.is_visible(), f'{view} phone summary line is shown at {width}px')
                summary.click()
                c.page.wait_for_function("() => getComputedStyle(document.getElementById('tb-site')).visibility === 'visible'")
                box['controls'] = c.page.evaluate("""() => ['tb-site','rigSelect','tb-minalt','tb-date','btnMenu','btnWeather'].map(id => {
                  const el = document.getElementById(id), r = el.getBoundingClientRect();
                  return {id, x:r.x, right:r.right, width:r.width, bottom:r.bottom, hidden:getComputedStyle(el).visibility === 'hidden'}; })""")
            for control in box['controls']:
                c.expect(control['x'] >= -1 and control['right'] <= width + 1 and control['width'] > 0
                         and not control.get('hidden'), f'{control["id"]} reachable at {width}px: {control}')
            if phone:
                c.page.locator('#ctxDone').click()
                c.page.wait_for_function("() => getComputedStyle(document.getElementById('tb-site')).visibility === 'hidden'")
                c.expect_eq(active_id(c), 'ctxSummary', 'closing the setup sheet returns focus to the summary line')
                small = c.page.evaluate("""() => [...document.querySelectorAll('button, select, input:not([type=hidden]), #tabs a')]
                  .filter(el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
                    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('td, .hidden, [hidden], #modal, details:not([open]) > :not(summary)')
                      && el.type !== 'checkbox' && el.type !== 'radio'
                      && (r.width < 44 || r.height < 44); })
                  .map(el => `${el.id || el.textContent.trim().slice(0, 20)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`)""")
                c.expect(not small, f'{view} phone controls are at least 44px at {width}px: {small}')
                fields = c.page.evaluate("""() => [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea')]
                  .filter(el => el.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(el).fontSize) < 16).map(el => el.id)""")
                c.expect(not fields, f'{view} phone form fields use 16px text (no iOS focus zoom): {fields}')
            c.expect(c.page.locator('#tb-date').evaluate('(el) => parseFloat(getComputedStyle(el).fontSize)') >= 14,
                     'header does not solve crowding by shrinking the date text')
            for canvas in c.page.locator('#view canvas:visible').all():
                r = canvas.bounding_box()
                c.expect(r['x'] >= -1 and r['x'] + r['width'] <= width + 1, f'{view} chart stays within viewport')
            if width in (360, 1240):
                c.page.screenshot(path=str(screenshots / f'{view}-{width}.png'), full_page=True)
            if width == 360 and view == 'tonight':
                # Phones show the best interval under each target instead of a
                # table that scrolls sideways.
                row = c.page.evaluate("""() => { const wrap = document.querySelector('.tablewrap'),
                  meta = document.querySelector('#tonight-rank-table tbody .row-meta');
                  return {fits: wrap.scrollWidth <= wrap.clientWidth + 1, meta: meta && meta.offsetWidth > 0 ? meta.textContent : ''}; }""")
                c.expect(row['fits'], 'phone Tonight table does not scroll sideways')
                c.expect(':' in row['meta'] and 'max' in row['meta'], f'phone Tonight row names its best interval: {row}')
            if width == 360 and view == 'horizon':
                tools = c.page.locator('.horizon-tools-rail').bounding_box()
                stage = c.page.locator('.horizon-stage').bounding_box()
                c.expect(stage['y'] >= tools['y'] + tools['height'], 'phone Horizon editor stacks below its tools')
                upload = c.page.get_by_role('button', name='Import file')
                upload.focus()
                with c.page.expect_file_chooser():
                    c.page.keyboard.press('Enter')
    # Supporting enlarged-layout evidence; this is explicitly not native zoom
    # or a real assistive-technology acceptance session.
    c.page.set_viewport_size({'width': 1240, 'height': 900})
    c.page.evaluate("() => document.documentElement.style.zoom = '2'")
    for view in ('tonight', 'catalog', 'sky', 'horizon'):
        tab(c, view)
        overflow = c.page.evaluate('() => document.documentElement.scrollWidth > innerWidth + 1')
        c.expect(not overflow, f'{view} enlarged layout has no page overflow')
    c.page.evaluate("() => document.documentElement.style.zoom = ''")


@check('web-phase4-map-labels', 'web')
def map_labels(c):
    from selection_checks import synth_boot
    synth_boot(c)
    c.page.evaluate("""() => {
      window.phase4Labels = [];
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...args) {
        if (this.canvas.id === 'sky' && this.font.startsWith('bold 10.5px')) {
          window.phase4Labels.push({text, x, y, width:this.measureText(text).width,
            scale:this.getTransform().a / devicePixelRatio, viewport:this.canvas.clientWidth});
        }
        return original.call(this, text, x, y, ...args);
      };
    }""")
    c.page.locator('#sky-reset').click()
    c.page.wait_for_function('() => phase4Labels.length > 0')
    c.page.evaluate('() => phase4Labels = []')
    c.page.locator('#sky').dispatch_event('wheel', {'deltaY': -300, 'clientX': 500, 'clientY': 300})
    c.page.wait_for_function('() => phase4Labels.length > 0')
    for label in c.page.evaluate('() => phase4Labels'):
        c.expect(abs(label['scale'] - 1) < .01, 'zoom preserves readable target-label font size')
        c.expect(label['x'] >= 0 and label['x'] + label['width'] <= label['viewport'] and
                 label['y'] >= 14 and label['y'] <= label['viewport'], 'target label stays inside map edges')
    c.expect('site time' in c.page.locator('#skyChartSummary').inner_text(), 'map alternative uses site clock')
