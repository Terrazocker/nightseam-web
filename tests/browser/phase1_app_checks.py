"""Real storage commit failures and complete backup recovery through planner UI."""
import copy
import json
import re

from harness import ROOT, check
from web_suite import boot, tab, sketch


def modules():
    source = (ROOT / 'web/app.js').read_text(encoding='utf-8')
    return {name: re.search(r'\./' + name + r'\.js\?v=\d+', source).group(0)
            for name in ('webstore', 'horizon')}


def dialogs(c):
    messages = []
    def handle(dialog):
        messages.append({'type': dialog.type, 'message': dialog.message})
        dialog.accept()
    c.page.on('dialog', handle)
    return messages


def wait_alert(c, messages, old_count, text):
    # Playwright pumps events while waiting on the browser-owned failure signal.
    c.page.wait_for_function('() => window.__phaseFailure == null || window.__phaseFailure.remaining === 0')
    for _ in range(100):
        if len(messages) > old_count and messages[-1]['type'] == 'alert':
            break
        c.page.wait_for_timeout(20)
    c.expect(len(messages) > old_count, 'failure must be visibly reported')
    c.expect_in(text, messages[-1]['message'])


def arm_abort(c, store, operation='put'):
    c.page.evaluate('''({store,operation}) => {
      if (!window.__phaseOriginalOps) {
        window.__phaseOriginalOps={};
        for (const op of ['put','delete']) {
          const original=IDBObjectStore.prototype[op];
          window.__phaseOriginalOps[op]=original;
          IDBObjectStore.prototype[op]=function(...args) {
            const request=original.apply(this,args), failure=window.__phaseFailure;
            if (failure && failure.remaining && failure.store===this.name &&
                failure.operation===op && this.transaction.db.name==='nightseam-db-v1') {
              failure.remaining--;
              const transaction=this.transaction;
              request.addEventListener('success', () => {
                window.__phaseRequestSucceeded=true;
                transaction.abort();
              }, {once:true});
            }
            return request;
          };
        }
      }
      window.__phaseRequestSucceeded=false;
      window.__phaseFailure={store,operation,remaining:1};
    }''', {'store':store, 'operation':operation})


def snapshot(c):
    return c.page.evaluate('''async m => {
      const W=await import(m.webstore), H=await import(m.horizon);
      return {sites:await W.allStrict('sites'),rigs:await W.allStrict('rigs'),
        targets:await W.allStrict('targets'),prefs:structuredClone(H.getPrefs()),
        horizons:H.exportHorizons(),
        prefsRaw:localStorage.getItem('nightseam_prefs_v1'),
        theme:localStorage.getItem('nightseam_theme')};
    }''', modules())


def setup(c, section):
    c.page.locator('#btnMenu').click()
    c.page.locator('#btn-settings').click()
    c.page.wait_for_selector('#m-set-title')
    c.page.locator('#set-tab-' + section).click()


def upload(c, data):
    c.page.locator('#set-import').set_input_files({
        'name':'browser-backup.json', 'mimeType':'application/json',
        'buffer':json.dumps(data).encode('utf-8')})


def fixture_bundle():
    return {'app':'nightseam-web','version':2,'theme':'workbench',
        'sites':[{'id':'incoming-site','name':'Incoming site','lat':10,'lon':20,'elev':0,'tz':'UTC'}],
        'rigs':[{'id':'incoming-rig','name':'Incoming rig','focal_mm':400,'sensor_w':20,
                 'sensor_h':15,'fov_w':171.9,'fov_h':128.9,'fov_unit':'arcmin'}],
        'targets':[{'id':'u_incoming','primary_name':'Incoming target','otype':'galaxy',
                    'ra_hours':3,'dec_deg':20,'vmag':8,'size_am':'5','blurb':'Incoming notes'}],
        'prefs':{'activeSiteId':'incoming-site','activeRigId':'incoming-rig','bortle':2},
        'panos':{'panos':[],'activeId':None}}


@check('web-phase1-app-custom-target-commit-failures', 'web')
def custom_target_failures(c):
    boot(c)
    messages=dialogs(c)
    before=snapshot(c)
    setup(c,'targets')
    c.page.locator('#set-add-target').click()
    for selector,value in [('#sf-target-name','Commit check target'),('#sf-target-ra','5.5'),
                           ('#sf-target-dec','25'),('#sf-target-blurb','Notes survive a failed write')]:
        c.page.locator(selector).fill(value)
    arm_abort(c,'targets')
    n=len(messages)
    c.page.locator('#sf-target-save').click()
    c.page.wait_for_function('() => document.querySelector("#sf-target-err").textContent.includes("Could not save")')
    c.expect(c.page.evaluate('window.__phaseRequestSucceeded'), 'failure occurs after native request success')
    c.expect(c.page.locator('#sf-target').is_visible(),'failed commit keeps target form open')
    c.expect_eq(c.page.locator('#sf-target-blurb').input_value(),'Notes survive a failed write')
    c.expect_eq(snapshot(c)['targets'],before['targets'],'failed save does not persist or publish target')
    c.expect_eq(c.page.locator('#set-targets li[data-id]').count(),len(before['targets']))
    c.page.locator('#sf-target-save').click()
    c.page.wait_for_selector('#set-targets li[data-id]')
    target_id=c.page.locator('#set-targets li[data-id]').last.get_attribute('data-id')
    arm_abort(c,'targets','delete')
    n=len(messages)
    c.page.locator(f'[data-deltarget="{target_id}"]').click()
    wait_alert(c,messages,n,'Could not delete')
    c.expect(c.page.locator(f'#set-targets li[data-id="{target_id}"]').is_visible(), "failed delete retains listed target")
    c.expect_eq(len(snapshot(c)['targets']),len(before['targets'])+1)
    c.page.keyboard.press('Escape')
    tab(c,'catalog')
    c.page.locator('#cat-q').fill('Commit check target')
    row=c.page.locator(f'tr[data-id="{target_id}"]')
    row.wait_for()
    row.click()
    c.page.locator('#modal details.catalog-details').evaluate('(el)=>el.open=true')
    c.expect_in('Notes survive a failed write',c.page.locator('#modal').inner_text())
    arm_abort(c,'targets','delete')
    n=len(messages)
    c.page.locator('#m-del').click()
    wait_alert(c,messages,n,'Could not delete')
    c.expect(c.page.locator('#m-title').is_visible(),'failed detail delete keeps inspector open')
    c.expect(row.evaluate('el=>el.classList.contains("selected")'),'failed delete preserves selected target')
    c.expect_eq(len(snapshot(c)['targets']),len(before['targets'])+1)
    c.page.locator('#m-del').click()
    c.page.wait_for_function('() => document.querySelector("#modal").hidden')
    c.expect_eq(snapshot(c)['targets'],before['targets'])
    c.expect_eq(c.page.locator(f'tr[data-id="{target_id}"]').count(),0)
    c.assert_clean()


@check('web-phase1-app-site-rig-commit-failures', 'web')
def site_rig_failures(c):
    boot(c)
    messages=dialogs(c)
    before=snapshot(c)
    site_id=c.page.locator('#tb-site').input_value()
    setup(c,'sites')
    c.page.locator('#sf-quick-lat').fill('11')
    c.page.locator('#sf-quick-lon').fill('22')
    arm_abort(c,'sites')
    c.page.locator('#sf-quick-save').click()
    c.page.wait_for_function('() => document.querySelector("#sf-quick-note").textContent.includes("Could not save")')
    c.expect_eq(snapshot(c)['sites'],before['sites'])
    c.expect_eq(c.page.locator('#sf-quick-lat').input_value(),'11','entered coordinates remain recoverable')
    c.page.locator(f'[data-editsite="{site_id}"]').click()
    c.page.locator('#sf-site-name').fill('Unsaved site name')
    arm_abort(c,'sites')
    n=len(messages)
    c.page.locator('#sf-site-save').click()
    wait_alert(c,messages,n,'Could not save')
    c.expect(c.page.locator('#sf-site').is_visible(), 'failed site save keeps form open')
    c.expect_eq(c.page.locator('#sf-site-name').input_value(),'Unsaved site name')
    c.expect_eq(snapshot(c)['sites'],before['sites'])
    arm_abort(c,'sites','delete')
    n=len(messages)
    c.page.locator(f'[data-delsite="{site_id}"]').click()
    wait_alert(c,messages,n,'Could not delete')
    c.expect_eq(c.page.locator('#tb-site').input_value(),site_id)
    c.expect_eq(snapshot(c)['sites'],before['sites'])
    c.page.locator('#set-tab-rigs').click()
    c.page.locator('#set-add-rig').click()
    c.page.locator('#set-rig-custom').click()
    for selector,value in [('#sf-rig-name','Commit rig'),('#sf-rig-focal','500'),
                           ('#sf-rig-sw','20'),('#sf-rig-sh','15')]:
        c.page.locator(selector).fill(value)
    arm_abort(c,'rigs')
    n=len(messages)
    c.page.locator('#sf-rig-save').click()
    wait_alert(c,messages,n,'Could not save')
    c.expect(c.page.locator('#sf-rig').is_visible(), 'failed rig save keeps form open')
    c.expect_eq(c.page.locator('#sf-rig-name').input_value(),'Commit rig')
    c.expect_eq(snapshot(c)['rigs'],before['rigs'])
    c.page.locator('#sf-rig-save').click()
    c.page.wait_for_selector('#set-rigs li[data-id]')
    rig_id=c.page.locator('#set-rigs li[data-id]').last.get_attribute('data-id')
    persisted=snapshot(c)['rigs']
    c.page.locator(f'[data-editrig="{rig_id}"]').click()
    c.page.locator('#sf-rig-name').fill('Unsaved rig edit')
    arm_abort(c,'rigs')
    n=len(messages)
    c.page.locator('#sf-rig-save').click()
    wait_alert(c,messages,n,'Could not save')
    c.expect_eq(snapshot(c)['rigs'],persisted)
    c.expect_eq(c.page.locator('#sf-rig-name').input_value(),'Unsaved rig edit')
    arm_abort(c,'rigs','delete')
    n=len(messages)
    c.page.locator(f'[data-delrig="{rig_id}"]').click()
    wait_alert(c,messages,n,'Could not delete')
    c.expect(c.page.locator(f'#set-rigs li[data-id="{rig_id}"]').is_visible(), "failed delete retains listed rig")
    c.expect_eq(snapshot(c)['rigs'],persisted)
    c.page.keyboard.press('Escape')
    # Reopening the active site shows unchanged application memory as well as storage.
    c.page.locator('#site-settings').click()
    c.page.wait_for_selector('#sf-site:not([hidden])')
    original=next(r['val'] for r in before['sites'] if r['key']==site_id)
    c.expect_eq(float(c.page.locator('#sf-site-lat').input_value()),original['lat'])
    c.expect_eq(float(c.page.locator('#sf-site-lon').input_value()),original['lon'])
    c.assert_clean()


@check('web-phase1-app-backup-replaces-missing-preferences', 'web')
def backup_preferences(c):
    boot(c)
    messages=dialogs(c)
    c.page.evaluate('''async m => {
      const H=await import(m.horizon);
      H.setPrefs({moonAware:true,viewFullDay:true,advMode:true,weatherAuto:true,
        edge:88,minVis:77,sizeUnit:'deg',fltHa:true,savedTargetIds:['ngc0224']});
    }''',modules())
    setup(c,'backup')
    incoming=fixture_bundle()
    incoming['prefs']={'activeSiteId':'incoming-site'}
    upload(c,incoming)
    c.page.wait_for_function('() => document.querySelector("#modal").hidden')
    after=snapshot(c)
    c.expect_eq([r['key'] for r in after['sites']],['incoming-site'])
    c.expect_eq([r['key'] for r in after['targets']],['u_incoming'])
    for key,value in {'moonAware':False,'viewFullDay':False,'advMode':False,'weatherAuto':False,
                      'edge':16,'minVis':1,'sizeUnit':'arcmin','fltHa':False,
                      'savedTargetIds':[],'activeRigId':''}.items():
        c.expect_eq(after['prefs'][key],value,'absent imported setting resets '+key)
    c.expect_eq(c.page.locator('#rigSelect').input_value(),'')
    c.expect_eq(c.page.locator('#tb-site').input_value(),'incoming-site')
    c.expect(not c.page.locator('#viewFullDay').is_checked(), 'full-day checkbox reflects reset default')
    c.expect(not c.page.locator('#moonAware').is_checked(), 'Moon-aware checkbox reflects reset default')
    c.expect_eq(c.page.locator('#sizeUnit').input_value(),'arcmin')
    c.expect_eq(len([m for m in messages if m['type']=='alert']),0)
    c.assert_clean()


@check('web-phase1-app-backup-rejects-malformed-preferences', 'web')
def backup_invalid_preferences(c):
    boot(c)
    messages=dialogs(c)
    setup(c,'backup')
    before=snapshot(c)
    invalid=[[],{'edge':'wide'},{'bortle':100},{'moonAware':'true'},
             {'tz':'Not/AZone'},{'sizeUnit':'pixels'},{'savedTargetIds':'ngc0224'}]
    for prefs in invalid:
        incoming=fixture_bundle()
        incoming['prefs']=prefs
        n=len(messages)
        upload(c,incoming)
        wait_alert(c,messages,n,'Import failed')
        c.expect_eq(snapshot(c),before,'malformed prefs are rejected before any mutation')
        c.expect_eq(len([m for m in messages[n:] if m['type']=='confirm']),0,
                    'validation happens before replacement confirmation')
    c.assert_clean()


@check('web-phase1-app-backup-read-failure-refuses-replacement', 'web')
def backup_read_failure(c):
    boot(c)
    messages=dialogs(c)
    setup(c,'backup')
    before=snapshot(c)
    c.page.evaluate('''() => {
      const original=IDBDatabase.prototype.transaction;
      window.__phaseReadFailed=false;
      IDBDatabase.prototype.transaction=function(stores,mode,...rest) {
        if (!window.__phaseReadFailed && this.name==='nightseam-db-v1' && mode==='readonly' &&
            (Array.isArray(stores)?stores.includes('sites'):stores==='sites')) {
          window.__phaseReadFailed=true;
          throw new DOMException('Injected readonly snapshot failure','InvalidStateError');
        }
        return original.call(this,stores,mode,...rest);
      };
    }''')
    n=len(messages)
    upload(c,fixture_bundle())
    wait_alert(c,messages,n,'Import failed')
    c.expect(c.page.evaluate('window.__phaseReadFailed'), 'readonly safety snapshot failure actually injected')
    c.expect_eq(snapshot(c),before,'unsafe partial safety read cannot begin replacement')
    c.expect(c.page.locator('#m-set-title').is_visible(), 'failed import keeps Setup open')
    c.assert_clean()


@check('web-phase1-app-backup-post-commit-failure-rolls-back-completely', 'web')
def backup_post_commit_failure(c):
    boot(c)
    messages=dialogs(c)
    # Include a real persisted horizon so rollback must recover both stores
    # (records in IndexedDB, horizons in localStorage).
    tab(c,'horizon')
    c.page.click('#hz-new-draw')
    c.page.wait_for_selector('#hz-canvas', state='visible')
    sketch(c)
    history_before = c.page.evaluate('async m => (await import(m.horizon)).captureEditorHistory()', modules())
    c.expect(history_before and history_before['hist']['index'] > 0,
             'rollback fixture includes an undo branch')
    c.page.evaluate('''async m => {
      const W=await import(m.webstore), H=await import(m.horizon);
      await W.saveRigRec({id:'rollback-rig',name:'Original rig',focal_mm:600,
        sensor_w:20,sensor_h:15,fov_w:114.6,fov_h:85.9,fov_unit:'arcmin'});
      await W.saveTargetRec({id:'u_rollback',primary_name:'Original target',otype:'galaxy',
        ra_hours:5,dec_deg:30,vmag:8,size_am:'3',blurb:'Original notes'});
      H.setPrefs({moonAware:true,edge:28,activeRigId:'rollback-rig',savedTargetIds:['u_rollback']});
    }''',modules())
    setup(c,'backup')
    before=snapshot(c)
    c.expect(len(before['horizons']['horizons'][0].get('points') or []) > 0,
             'fixture includes an actual persisted horizon skyline')
    site_id=c.page.locator('#tb-site').input_value()
    c.page.evaluate('''() => {
      const original=Storage.prototype.setItem;
      window.__phasePrefsFailed=false;
      Storage.prototype.setItem=function(key,value) {
        if (this===localStorage && key==='nightseam_prefs_v1' && !window.__phasePrefsFailed) {
          window.__phasePrefsFailed=true;
          throw new DOMException('Injected preferences quota failure','QuotaExceededError');
        }
        return original.call(this,key,value);
      };
    }''')
    n=len(messages)
    upload(c,fixture_bundle())
    wait_alert(c,messages,n,'Import failed')
    c.expect(c.page.evaluate('window.__phasePrefsFailed'), 'post-commit prefs failure actually injected')
    c.expect_eq(snapshot(c),before,'post-commit failure restores records, preferences and horizons')
    c.expect_eq(c.page.evaluate('async m => (await import(m.horizon)).captureEditorHistory()', modules()),
                history_before, 'failed import preserves the original editor history')
    safety=c.page.evaluate('async m => (await import(m.webstore)).lastSafetySnapshot()',modules())
    c.expect_eq(safety['sites'],[r['val'] for r in before['sites']])
    c.expect_eq(safety['horizons'],before['horizons'],'safety snapshot retains the horizons')
    c.expect_eq(c.page.locator('#tb-site').input_value(),site_id)
    c.expect_eq(c.page.locator('#rigSelect').input_value(),'rollback-rig')
    c.expect(c.page.locator('#m-set-title').is_visible(),'failed import stays reviewable')
    c.page.keyboard.press('Escape')
    tab(c,'catalog')
    c.page.locator('#cat-q').fill('Original target')
    c.page.locator('tr[data-id="u_rollback"]').wait_for()
    c.expect_eq(c.page.locator('tr[data-id="u_incoming"]').count(),0)
    tab(c,'horizon')
    c.page.wait_for_selector('#hz-canvas')
    c.expect(c.page.locator('#hz-canvas').is_visible(),'the old horizon is usable after rollback')
    c.assert_clean()


@check('web-phase1-app-preference-write-failure-restores-controls', 'web')
def preference_write_failure(c):
    boot(c)
    messages=dialogs(c)
    before=snapshot(c)
    rows=c.page.locator('#tonight-rank-table tr[data-tonight-id]').evaluate_all(
        'rows=>rows.map(r=>r.dataset.tonightId)')
    c.page.locator('#btnMenu').click()
    c.page.evaluate('''() => {
      const original=Storage.prototype.setItem;
      window.__phaseQuotaRemaining=0;
      Storage.prototype.setItem=function(key,value) {
        if (this===localStorage && key==='nightseam_prefs_v1' && window.__phaseQuotaRemaining) {
          window.__phaseQuotaRemaining--;
          throw new DOMException('Injected preference write failure','QuotaExceededError');
        }
        return original.call(this,key,value);
      };
    }''')
    for selector in ('#moonAware','#viewFullDay','#advMode'):
        c.expect(not c.page.locator(selector).is_checked(), 'fixture starts with quiet defaults')
        c.page.evaluate('window.__phaseQuotaRemaining=1')
        n=len(messages)
        # click(), rather than check(), permits the application to revert a failed edit.
        c.page.locator(selector).click()
        wait_alert(c,messages,n,'Could not save this setting')
        c.expect_eq(c.page.evaluate('window.__phaseQuotaRemaining'),0,'native quota failure exercised')
        c.expect(not c.page.locator(selector).is_checked(), 'failed preference reverts visible '+selector)
        c.expect_eq(snapshot(c),before,'failed preference keeps persisted and live model unchanged')
        c.expect_eq(c.page.locator('#tonight-rank-table tr[data-tonight-id]').evaluate_all(
            'rows=>rows.map(r=>r.dataset.tonightId)'),rows,
            'failed preference cannot change the recommendations')
    c.page.keyboard.press('Escape')
    c.assert_clean()
