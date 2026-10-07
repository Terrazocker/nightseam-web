"""Planner control, focus and responsive acceptance over isolated browser data."""
from harness import ROOT, check
from web_suite import READY, boot, tab


@check('web-open-workspace-and-dialog-boundaries', 'web')
def open_workspace(c):
    boot(c)
    for view, selectors in (
        ('tonight', ['.tonight-ranked']),
        ('catalog', ['.cat-filter-rail', '.catalog-table-card']),
        ('sky', ['.sky-time-rail', '.sky-visible-card']),
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
            c.expect(all(s['bg'] == 'rgba(0, 0, 0, 0)' and s['border'] == 0 and s['shadow'] == 'none' for s in state),
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
      H.importPanos({activeId:'load-check',panos:[{id:'load-check',name:'Loading check',
        azOffset:0,altBottom:0,altTop:60,fov:360,profileBins:720,
        profile:Array(720).fill(18),profileTop:Array(720).fill(null),strokes:[]}]});
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
    c.expect(scrubbed < 2, 'cached scrubbing stays responsive')
    print(f'        three cached Catalog scrubs, 4x CPU: {scrubbed:.2f}s')
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
    import re
    from web_suite import open_editor
    token = re.search(r"from './horizon.js\?v=(\d+)'", (ROOT / 'web/app.js').read_text(encoding='utf-8')).group(1)
    horizon_url = './horizon.js?v=' + token
    boot(c)
    for width in (1240, 360):
        c.page.set_viewport_size({'width': width, 'height': 900})
        tab(c, 'tonight')
        c.wait_tonight_render()
        c.expect_eq(c.page.locator('#tonightOverviewChart, #tonightOverviewKeys').count(), 0,
                    'Tonight overview is removed')
        c.expect(c.page.locator('#tonight-rank-table').is_visible(), 'Tonight ranking remains')
        c.expect(c.page.locator('#tonight-time-scrub').is_visible(), 'selected-time control remains')
        tab(c, 'catalog')
        types = c.page.locator('#cat-type')
        state = types.evaluate('''el => ({count: el.options.length, size: el.size,
          scroll: el.scrollHeight, height: el.clientHeight,
          optionBottom: el.options[el.options.length - 1].getBoundingClientRect().bottom,
          bottom: el.getBoundingClientRect().bottom})''')
        c.expect(state['count'] > 4 and state['size'] >= state['count'] and
                 state['scroll'] <= state['height'] + 1 and state['optionBottom'] <= state['bottom'],
                 f'all object types fit without an internal scrollbar at {width}px: {state}')
        value = types.locator('option').first.get_attribute('value')
        types.select_option([value])
        c.expect_eq(c.page.locator('#cat-type').evaluate('el => [...el.selectedOptions].map(o => o.value)'),
                    [value], 'object-type selection survives filtering')
        c.expect(c.page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 1'),
                 'full type list does not widen the page')
    open_editor(c)
    c.expect_eq(c.page.locator('[id^="ed-prov-"]').count(), 0, 'provenance controls are removed')
    provenance = {'source': 'compass', 'capturedAt': '2026-08-12',
                  'operator': 'Test observer', 'orientation': 'True north', 'notes': 'Retain this metadata'}
    c.page.evaluate('''async ([url, provenance]) => {
      const H = await import(url);
      H.activePano().provenance = provenance;
      H.updatePano(H.activePano());
    }''', [horizon_url, provenance])
    c.page.locator('#ed-save').click()
    c.page.wait_for_function("() => document.querySelector('#ed-status').textContent.includes('Saved')")
    c.page.reload(wait_until='domcontentloaded')
    c.page.wait_for_selector('#pano-list li[data-id]')
    c.page.locator('#pano-list li[data-id]').first.click()
    c.page.wait_for_selector('#pano-canvas')
    saved = c.page.evaluate('''async url => {
      return (await import(url)).activePano().provenance;
    }''', horizon_url)
    c.expect_eq(saved, provenance, 'Save/reload preserve existing provenance without editor controls')
    c.assert_clean()


def active_id(c):
    return c.page.evaluate("() => document.activeElement.id")


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
    c.expect(c.page.evaluate("() => document.activeElement.matches('.cat tbody tr[data-id]')"), 'detail close restores its row')


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
            c.expect(box['clock'] != 'none', f'{view} selected clock remains visible at {width}px')
            for control in box['controls']:
                c.expect(control['x'] >= -1 and control['right'] <= width + 1 and control['width'] > 0,
                         f'{control["id"]} reachable at {width}px: {control}')
            c.expect(c.page.locator('#tb-date').evaluate('(el) => parseFloat(getComputedStyle(el).fontSize)') >= 14,
                     'header does not solve crowding by shrinking the date text')
            for canvas in c.page.locator('#view canvas:visible').all():
                r = canvas.bounding_box()
                c.expect(r['x'] >= -1 and r['x'] + r['width'] <= width + 1, f'{view} chart stays within viewport')
            if width in (360, 1240):
                c.page.screenshot(path=str(screenshots / f'{view}-{width}.png'), full_page=True)
            if width == 360 and view == 'tonight':
                region = c.page.get_by_role('region', name='Best targets table; scroll horizontally for all columns')
                region.focus()
                c.page.keyboard.press('ArrowRight')
                c.page.wait_for_function("() => document.querySelector('.tablewrap').scrollLeft > 0")
            if width == 360 and view == 'horizon':
                tools = c.page.locator('.horizon-tools-rail').bounding_box()
                stage = c.page.locator('.horizon-stage').bounding_box()
                c.expect(stage['y'] >= tools['y'] + tools['height'], 'phone Horizon editor stacks below its tools')
                upload = c.page.get_by_role('button', name='Upload photo')
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
