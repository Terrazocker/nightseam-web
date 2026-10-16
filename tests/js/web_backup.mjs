/*
 * Web backup / restore integrity checks.
 *
 * Drives the REAL web/webstore.js + web/horizon.js through a minimal fake
 * IndexedDB and a localStorage stub (no browser here). Pins:
 *   - normalized horizon records hold only points and overhangs: photo
 *     placements and embedded images of older backups are dropped, and the
 *     profile is derived from the skyline points
 *   - any malformed horizon data refuses the whole section before a write
 *   - older bundles (format 1-10) restore everything except their retired
 *     panoramas
 *   - stageBackup validation (a malformed bundle throws BEFORE any write)
 *   - collectBackup carries the theme (its own localStorage key) and a schema
 *     version
 *   - a restore failure rolls back to the pre-restore snapshot
 * Prints one marker line; tests/test_js_behaviour.py asserts it.
 */

globalThis.localStorage = {
  _m: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; },
  setItem(k, v) { this._m[k] = String(v); },
  removeItem(k) { delete this._m[k]; },
};

/* ---------------------------------------------------- minimal fake IDB --- */
const _stores = new Map();
const ensure = (n) => { if (!_stores.has(n)) _stores.set(n, new Map()); };
const req = () => ({ onsuccess: null, onerror: null, result: null, error: null });
const micro = (fn) => queueMicrotask(fn);

// A request's success must precede transaction completion. Drafts become
// visible only at commit; injected failures and aborts discard every write.
const takeFailure = (name, store) => {
  const counters = globalThis[name];
  if (!(counters && counters[store] > 0)) return false;
  counters[store]--;
  return true;
};
function transaction(names, mode = 'readonly') {
  const stores = Array.isArray(names) ? names : [names];
  const drafts = new Map(stores.map((name) => [name,
    new Map([...(_stores.get(name) || [])].map(([key, value]) => [key, structuredClone(value)]))]));
  let pending = 0, active = true;
  const tx = {
    error: null, oncomplete: null, onabort: null, onerror: null,
    abort() {
      if (!active) return;
      active = false;
      micro(() => tx.onabort && tx.onabort());
    },
    objectStore(name = stores[0]) {
      if (!drafts.has(name)) throw new Error('store not in transaction');
      const draft = drafts.get(name);
      const fail = (r, message) => {
        tx.error = r.error = new Error(message);
        r.onerror && r.onerror();
        tx.onerror && tx.onerror({ target: r });
        tx.abort();
      };
      const complete = () => micro(() => {
        if (!active || pending) return;
        if (mode === 'readwrite') {
          for (const [key, values] of drafts) _stores.set(key, values);
        }
        active = false;
        tx.oncomplete && tx.oncomplete();
      });
      const request = (fn, failureName) => {
        const r = req(); pending++;
        micro(() => {
          if (!active) return;
          if (failureName && takeFailure(failureName, name)) { fail(r, 'injected request failure'); return; }
          r.result = fn();
          r.onsuccess && r.onsuccess();
          pending--;
          if (takeFailure('__idbAbortAfterSuccess', name)) { tx.abort(); return; }
          complete();
        });
        return r;
      };
      return {
        get: (key) => request(() => draft.get(key) ?? null, '__idbFailReadCount'),
        count: () => request(() => draft.size, '__idbFailReadCount'),
        put: (value, key) => request(() => { draft.set(key, structuredClone(value)); return key; }, '__idbFailPutCount'),
        delete: (key) => request(() => { draft.delete(key); return undefined; }, '__idbFailDeleteCount'),
        clear: () => request(() => { draft.clear(); return undefined; }),
        openCursor() {
          const r = req(); pending++;
          const entries = [...draft.entries()].sort(([a], [b]) => String(a).localeCompare(String(b)));
          let i = 0, started = false;
          const step = () => {
            if (!active) return;
            if (!started && takeFailure('__idbFailReadCount', name)) { fail(r, 'injected cursor failure'); return; }
            started = true;
            if (i < entries.length) {
              const [key, value] = entries[i++];
              r.result = { key, value, continue: () => micro(step) };
              r.onsuccess && r.onsuccess();
              if (takeFailure('__idbAbortAfterSuccess', name)) tx.abort();
            } else {
              r.result = null; r.onsuccess && r.onsuccess();
              pending--; complete();
            }
          };
          micro(step);
          return r;
        },
      };
    },
  };
  return tx;
}
globalThis.indexedDB = {
  open() {
    const rq = req();
    micro(() => {
      rq.result = {
        objectStoreNames: { contains: (n) => _stores.has(n) },
        createObjectStore: (n) => { ensure(n); return {}; },
        transaction, close() {},
      };
      if (rq.onupgradeneeded) rq.onupgradeneeded();
      rq.onsuccess && rq.onsuccess();
    });
    return rq;
  },
};

const WS = await import(new URL('../../web/webstore.js', import.meta.url).href);
const H = await import(new URL('../../web/horizon.js', import.meta.url).href);

let ok = true;
const fail = (m) => { ok = false; console.log('  FAIL:', m); };
const assert = (cond, m) => { if (!cond) fail(m); };

// What builds with horizon photos wrote into a record and its backup.
const DATAURL = 'data:image/jpeg;base64,' + Buffer.from([255, 216, 255, 217]).toString('base64');
const PLACED = { width: 120, heading: 180, tilt: 0, roll: 0 };
const emptyPanos = { panos: [], activeId: null };
const emptyHorizons = { horizons: [], activeId: null };
const hzRec = (over = {}) => ({
  id: 'h1', name: 'Garden', points: [{ az: 90, alt: 20 }, { az: 270, alt: 5 }], ...over,
});
const photoFields = (rec) => ['photo', 'hasPhoto', 'image'].filter((k) => k in rec);

/* 1. normalizeHorizons: records only ----------------------------------- */
const legacy = H.normalizeHorizons({ horizons: [hzRec({ photo: PLACED, hasPhoto: true, image: DATAURL })] });
assert(legacy && photoFields(legacy.horizons[0]).length === 0, 'photo fields of an older backup are dropped');
assert(JSON.stringify(legacy.horizons[0].points) === JSON.stringify(hzRec().points), 'its skyline is kept');
for (const [odd, why] of [
  [{ photo: { width: 0, heading: 0, tilt: 0, roll: 0 } }, 'a malformed placement'],
  [{ image: DATAURL }, 'photo bytes without a placement'],
  [{ photo: PLACED, image: 'data:text/html;base64,eA==' }, 'a non-image data URL'],
]) {
  const norm = H.normalizeHorizons({ horizons: [hzRec(odd)] });
  assert(norm && photoFields(norm.horizons[0]).length === 0, `${why} from an older backup is ignored, not refused`);
}
const derived = H.normalizeHorizons({ horizons: [hzRec({ profile: new Array(720).fill(80) })] }).horizons[0];
assert(derived.profile[180] === 20 && H.ceilFor(derived, 90).ceil === 20,
  'the profile is derived from the points, never taken from the backup');
assert(H.normalizeHorizons({ horizons: [] }).activeId === null, 'an empty section is valid');
assert(H.normalizeHorizons({ horizons: [hzRec(), hzRec({ id: 'h2' })], activeId: 'h2' }).activeId === 'h2',
  'the active horizon survives');
assert(H.normalizeHorizons({ horizons: [hzRec()], activeId: 'gone' }).activeId === 'h1',
  'a dangling active id falls back to the first horizon');
for (const [bad, why] of [
  [{ horizons: [hzRec({ id: 'bad id' })] }, 'an unsafe id'],
  [{ horizons: [hzRec(), hzRec()] }, 'duplicate ids'],
  [{ horizons: [hzRec({ points: [{ az: 1, alt: '2' }] })] }, 'a malformed point'],
  [{ horizons: [hzRec({ points: 'none' })] }, 'points that are not a list'],
  [{ horizons: Array.from({ length: H.MAX_HORIZONS + 1 }, (_, i) => hzRec({ id: `h${i}` })) }, 'too many horizons'],
  [{ horizons: [hzRec({ overhangs: [[{ az: 10, alt: 40 }]] })] }, 'a one-point overhang'],
  [{ horizons: [hzRec({ overhangs: [[{ az: -10, alt: 40 }, { az: 10, alt: 40 }]] })] }, 'an overhang across north'],
  [{ panos: [] }, 'a missing horizon list'],
  [null, 'a missing section'],
]) assert(H.normalizeHorizons(bad) === null, `${why} refuses the whole section`);

/* 2. export -> normalize -> apply round trip ----------------------------- */
assert(await H.applyHorizonsSnapshot(legacy) === true, 'a normalized snapshot applies');
const exported = H.exportHorizons();
assert(photoFields(exported.horizons[0]).length === 0, 'export carries no photo fields');
assert(!('profile' in exported.horizons[0]), 'export never stores the derived profile');
assert(!localStorage.getItem('nightseam_horizons_v2').includes('photo'), 'stored records carry no photo fields');
const again = H.normalizeHorizons(exported);
assert(JSON.stringify(again.horizons[0].points) === JSON.stringify(legacy.horizons[0].points), 'points round-trip');
await H.applyHorizonsSnapshot(again);
assert(H.ceilFor(H.activeHorizon(), 90).ceil === 20, 'the round-tripped horizon keeps its skyline');
const beforeBad = JSON.stringify(H.exportHorizons());
assert(await H.applyHorizonsSnapshot({ horizons: [{ ...hzRec(), id: 'bad id' }], activeId: 'h1' }) === false,
  'an unusable record fails the restore');
assert(JSON.stringify(H.exportHorizons()) === beforeBad, 'a failed restore leaves the horizons unchanged');
const setItem = localStorage.setItem;
localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
const full = await H.applyHorizonsSnapshot(H.normalizeHorizons({ horizons: [hzRec({ id: 'h9' })] }));
localStorage.setItem = setItem;
assert(full === false, 'a full storage fails the restore');
assert(JSON.stringify(H.exportHorizons()) === beforeBad, 'and leaves the horizons unchanged');

const roofed = H.normalizeHorizons({ horizons: [hzRec({ overhangs: [[{ az: 100, alt: 40 }, { az: 120, alt: 35 }]] })] });
await H.applyHorizonsSnapshot(roofed);
const roofExport = H.exportHorizons();
assert(JSON.stringify(roofExport.horizons[0].overhangs) === JSON.stringify([[{ az: 100, alt: 40 }, { az: 120, alt: 35 }]]),
  'overhangs are backed up');
assert(!('profileTop' in roofExport.horizons[0]), 'the derived overhang profile is never stored');
assert(Math.abs(H.ceilFor(H.activeHorizon(), 110).ceilTop - 37.375) < 1e-9, 'restored overhangs block the sky above them (lowest edge in the bin)');

/* 3. older bundles: everything but their panoramas ----------------------- */
const oldBundle = { app: 'nightseam-web', version: 10, sites: [{ id: 's1', name: 'Home', lat: 1, lon: 2 }],
  panos: { panos: [{ id: 'p1', strokes: [] }], activeId: 'p1' } };
assert(JSON.stringify(WS.backupHorizonSection(oldBundle)) === JSON.stringify(emptyHorizons),
  'a format 10 bundle restores an empty horizon section');
assert(WS.backupHasRetiredHorizons(oldBundle) === true, 'the import can say its panoramas are not imported');
assert(WS.backupHasRetiredHorizons({ ...oldBundle, panos: emptyPanos }) === false, 'no notice without panoramas');
const stagedOld = WS.stageBackup(oldBundle);
assert(stagedOld.sites.length === 1 && stagedOld.horizons.horizons.length === 0,
  'an older bundle still stages its sites');
assert(WS.backupHorizonSection({ app: 'nightseam-web', version: 11, horizons: emptyHorizons }) !== undefined,
  'a format 11 bundle restores its own horizon section');
let missing = false;
try { WS.stageBackup({ app: 'nightseam-web', version: 11 }); } catch { missing = true; }
assert(missing, 'a format 11 bundle without its horizon section is refused');

/* 4. stageBackup validation --------------------------------------------- */
let threw = false;
try { WS.stageBackup({ app: 'other' }); } catch { threw = true; }
assert(threw, 'stageBackup must reject a foreign bundle');
const staged = WS.stageBackup({
  app: 'nightseam-web', theme: 'classic',
  sites: [{ id: 's1', name: 'Home', lat: 1, lon: 2 }],
  rigs: [], targets: [], prefs: { bortle: 5 }, panos: emptyPanos,
});
assert(staged.theme === 'workbench', 'legacy classic theme migrates to workbench');
assert(staged.sites.length === 1, 'one valid site staged');
assert(WS.stageBackup({ app: 'nightseam-web', theme: 'weird', panos: emptyPanos }).theme === 'workbench',
  'unknown theme value must normalize to workbench');

/* 5. collectBackup + restore round trip --------------------------------- */
await WS.writeStaged(WS.stageBackup({
  app: 'nightseam-web',
  sites: [{ id: 's1', name: 'Home', lat: 1, lon: 2 }],
  rigs: [{ id: 'r1', name: 'Rig', focal_mm: 100 }],
  targets: [], panos: emptyPanos,
}));
const backup = await WS.collectBackup({ bortle: 6 }, emptyHorizons, 'classic');
assert(backup.app === 'nightseam-web' && backup.version === 11, 'backup carries schema version 11 (skyline horizons)');
assert(JSON.stringify(backup.horizons) === JSON.stringify(emptyHorizons) && !('panos' in backup),
  'backup carries the horizon section, not the retired panorama section');
assert(backup.theme === 'workbench', 'collectBackup carries the canonical theme');
assert(backup.sites.length === 1 && backup.rigs.length === 1, 'collectBackup reads the stores');

/* 5b. View full day preference round-trips (ITEM 1) ---------------------- */
const vfd = await WS.collectBackup(
  { bortle: 6, viewFullDay: true }, emptyHorizons, 'classic');
assert(vfd.prefs.viewFullDay === true, 'collectBackup carries viewFullDay');
assert(WS.stageBackup(vfd).prefs.viewFullDay === true, 'stageBackup preserves viewFullDay');
assert(WS.stageBackup({ app: 'nightseam-web', prefs: { viewFullDay: false }, panos: emptyPanos }).prefs.viewFullDay === false,
  'an imported bundle keeps the viewFullDay value');

/* 6. malformed restore does NOT destroy current data -------------------- */
const beforeSites = (await WS.all('sites')).length;
let bad = false;
try { await WS.restoreBackup({ app: 'nightseam-web', version: 11, sites: [], horizons: null }, null); } catch { bad = true; }
assert(bad && (await WS.all('sites')).length === beforeSites,
  'a bundle missing its horizon section is rejected before any write');
await WS.writeStaged(WS.stageBackup({
  app: 'nightseam-web', sites: [{ id: 's1', name: 'Home', lat: 1, lon: 2 }], panos: emptyPanos,
}));
const countBefore = (await WS.all('sites')).length;
let rejected = false;
try { await WS.restoreBackup({ app: 'nope', panos: emptyPanos }, null); } catch { rejected = true; }
assert(rejected && (await WS.all('sites')).length === countBefore,
  'invalid bundle throws and leaves storage intact');

/* 7. write failure rolls back to the pre-restore snapshot --------------- */
const safety = await WS.collectBackup({ bortle: 6 }, emptyHorizons, 'classic');
const incoming = {
  app: 'nightseam-web',
  sites: [{ id: 's-new', name: 'New', lat: 9, lon: 9 }],
  panos: emptyPanos,
};
const safetyFailureBefore = (await WS.all('sites')).map((r) => r.val.id).sort();
globalThis.__idbFailPutCount = { meta: 1 };
let safetyFailed = false;
try { await WS.restoreBackup(incoming, safety); } catch { safetyFailed = true; }
assert(safetyFailed, 'a safety snapshot write failure must stop the restore');
const afterSafetyFailure = (await WS.all('sites')).map((r) => r.val.id).sort();
assert(JSON.stringify(afterSafetyFailure) === JSON.stringify(safetyFailureBefore),
  'a failed safety snapshot must leave data untouched');
globalThis.__idbFailPutCount = { sites: 1 };
let failed = false;
try { await WS.restoreBackup(incoming, safety); } catch { failed = true; }
assert(failed, 'a failed write must surface an error');
const afterFail = await WS.all('sites');
assert(afterFail.length === safety.sites.length,
  `rollback should restore ${safety.sites.length} site(s), got ${afterFail.length}`);
assert(afterFail.some((r) => r.val.id === 's1') && !afterFail.some((r) => r.val.id === 's-new'),
  'rollback must restore the pre-restore records');

/* 8. Legacy rigs stored their field of view in degrees ----------------- */
// A pre-0.6.16 rig stored fov_w/fov_h in DEGREES; getRigs converts once.
await WS.saveRigRec({ id: 'r-legacy', name: 'Legacy', focal_mm: 250,
                      sensor_w: 5.57, sensor_h: 3.13,
                      fov_w: WS.fovDeg(250, 5.57), fov_h: WS.fovDeg(250, 3.13) });
const legacyRig = (await WS.getRigs()).find((r) => r.id === 'r-legacy');
assert(legacyRig && legacyRig.fov_unit === 'arcmin', 'legacy rig must be marked arcmin');
assert(Math.abs(legacyRig.fov_w - WS.fovArcmin(250, 5.57)) < 1e-6,
  'legacy degree fov must convert to the same arcmin');
assert(Math.abs(legacyRig.fov_h - WS.fovArcmin(250, 3.13)) < 1e-6,
  'legacy degree fov_h must convert to the same arcmin');
await WS.saveRigRec({ id: 'r-new', name: 'New', focal_mm: 500,
                      sensor_w: 5.57, sensor_h: 3.13,
                      fov_w: WS.fovArcmin(500, 5.57), fov_h: WS.fovArcmin(500, 3.13),
                      fov_unit: 'arcmin' });
const newRig = (await WS.getRigs()).find((r) => r.id === 'r-new');
assert(newRig && Math.abs(newRig.fov_w - WS.fovArcmin(500, 5.57)) < 1e-6,
  'an arcmin rig must not be converted again');

/* WB7 forward compatibility: `version` is written at export and was IGNORED on
 * import, so a bundle from a LATER build was accepted and its fields read under
 * this build's rules - a silent misreading reported as a successful restore. A
 * version above BUNDLE_VERSION must now be refused, v1 (no stamp) and v2 must
 * still restore, and the stamp must never be a crash of its own. */
const good = { app: 'nightseam-web', version: 2, sites: [], rigs: [], targets: [],
               prefs: {}, panos: { panos: [], activeId: null } };
assert(WS.stageBackup(good), 'a v2 bundle must remain readable');
for (const version of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) assert(WS.stageBackup({ ...good, version }), `format ${version} remains readable`);
assert(WS.stageBackup({ ...good, version: 11, horizons: emptyHorizons }), 'format 11 is readable');
const savedPrefs = WS.stageBackup({ ...good, theme: 'dome', prefs: {
  savedTargetIds: ['ngc224', 'u_capture', 'ngc224', 'bad/id', ' <img> '],
  skyBrightnessProvider: 'nasa', theme: 'dome', themeVariant: 'glass',
} }).prefs;
assert(JSON.stringify(savedPrefs.savedTargetIds) === JSON.stringify(['ngc224', 'u_capture']),
  'saved target IDs are deduplicated and unsafe IDs are dropped by backup validation');
assert(!('skyBrightnessProvider' in savedPrefs) && !('theme' in savedPrefs) &&
       !('themeVariant' in savedPrefs),
  'backup validation strips retired brightness and theme-switch preferences');
const future = { ...good, version: 99 };
let futureErr = null;
try { WS.stageBackup(future); } catch (e) { futureErr = e; }
assert(futureErr, 'a bundle from a NEWER format must be refused, not misread');
assert(futureErr && /newer version/i.test(futureErr.message),
  `the refusal must say the bundle is newer (got ${futureErr && futureErr.message})`);
assert(futureErr && String(futureErr.message).includes('99'),
  'the refusal must name the format it saw');
/* an older bundle (no stamp at all = v1) still restores: same field layout */
const v1 = { ...good }; delete v1.version;
assert(WS.stageBackup(v1), 'a v1 bundle (no version stamp) must still restore');
/* a garbage stamp is malformed input, not a crash */
for (const bad of ['abc', -1, 0, {}]) {
  let badErr = null;
  try { WS.stageBackup({ ...good, version: bad }); } catch (e) { badErr = e; }
  assert(badErr, `an unusable version stamp (${JSON.stringify(bad)}) must be refused`);
}
/* and the app identity rule is untouched */
let foreignErr = null;
try { WS.stageBackup({ ...good, app: 'something-else' }); } catch (e) { foreignErr = e; }
assert(foreignErr, 'a foreign bundle must still be refused');

/* Phase-1 review: commit/abort, strict snapshots and input validation. */
const mustReject = async (operation, message) => {
  let rejected = false;
  try { await operation(); } catch { rejected = true; }
  assert(rejected, message);
};
const original = { ...good,
  sites: [{ id: 's_original', name: 'Original site', lat: 52, lon: 13 }],
  rigs: [{ id: 'r_original', name: 'Original rig', focal_mm: 250 }],
  targets: [{ id: 'u_original', primary_name: 'Original target', ra_hours: 5, dec_deg: 22 }],
};
await WS.writeStaged(WS.stageBackup(original));
const current = await WS.collectBackup({}, emptyHorizons);
const unchanged = async (message) => {
  const state = await WS.collectBackup({}, emptyHorizons);
  assert(JSON.stringify([state.sites, state.rigs, state.targets]) ===
    JSON.stringify([current.sites, current.rigs, current.targets]), message);
};

globalThis.__idbAbortAfterSuccess = { targets: 1 };
assert(await WS.saveTargetRec({ id: 'u_uncommitted', ra_hours: 1, dec_deg: 2 }) === false,
  'a successful put request followed by transaction abort must return false');
assert(await WS.get('targets', 'u_uncommitted') === null, 'aborted put must not persist');
globalThis.__idbAbortAfterSuccess = { targets: 1 };
assert(await WS.deleteTargetRec('u_original') === false, 'aborted delete must return false');
globalThis.__idbAbortAfterSuccess = { targets: 1 };
assert(await WS.clearStore('targets') === false, 'aborted clear must return false');
await unchanged('aborted put/delete/clear preserve stored records');

await WS.set('meta', 'safety', { marker: 'prior-safety' });
const replacement = { ...good,
  sites: [{ id: 's_replacement', name: 'New site', lat: 1, lon: 2 }],
  rigs: [{ id: 'r_replacement', name: 'New rig', focal_mm: 100 }],
  targets: [{ id: 'u_replacement', primary_name: 'New target', ra_hours: 1, dec_deg: 2 }],
};
for (const fault of ['__idbFailPutCount', '__idbAbortAfterSuccess']) {
  globalThis[fault] = { rigs: 1 };
  await mustReject(() => WS.restoreBackup(replacement, current), `${fault} must reject restoration`);
  await unchanged(`${fault} must preserve all three record stores atomically`);
  assert((await WS.lastSafetySnapshot()).marker === 'prior-safety',
    `${fault} must preserve prior safety metadata too`);
}

globalThis.__idbFailReadCount = { sites: 1 };
await mustReject(() => WS.collectBackup({}, emptyHorizons), 'a failed snapshot read must abort backup collection');
await unchanged('failed snapshot collection must not mutate records');
for (const [store, read] of [['sites', WS.getSites], ['rigs', WS.getRigs], ['targets', WS.getTargets]]) {
  globalThis.__idbFailReadCount = { [store]: 1 };
  await mustReject(() => read({ strict: true }), `strict ${store} reread must surface failure`);
}
globalThis.__idbFailReadCount = { sites: 1 };
assert((await WS.getSites()).length === 0, 'ordinary boot reads retain graceful degradation');

const preset = WS.DEFAULT_RIGS[0];
await WS.saveRigRec({ ...preset });
globalThis.__idbFailDeleteCount = { rigs: 1 };
await mustReject(() => WS.removeSeededRigs(), 'failed preset cleanup must not report removed ids');
assert((await WS.getRigs()).some((rig) => rig.id === preset.id), 'failed cleanup preserves the preset');
await WS.deleteRigRec(preset.id);

for (const malformed of [
  { minAlt: '30' }, { minAlt: {} }, { bortle: 20 }, { edge: -1 }, { minVis: Infinity },
  { moonAware: 'false' }, { weatherAuto: 1 }, { sizeUnit: 'pixels' },
  { savedTargetIds: 'u_original' }, { activeRigId: {} }, { tz: 'Invalid/Zone' },
]) {
  await mustReject(() => WS.restoreBackup({ ...replacement, prefs: malformed }, current),
    `malformed settings must be rejected: ${JSON.stringify(malformed)}`);
  await unchanged('malformed settings must be rejected before mutation');
}
for (const shape of [[], 'settings']) {
  await mustReject(() => WS.stageBackup({ ...good, prefs: shape }), 'settings outer shape must be an object');
}
const legacyDefaults = WS.stageBackup({ app: 'nightseam-web', panos: emptyPanos }).prefs;
assert(legacyDefaults.minAlt === null && legacyDefaults.minVis === 1 && legacyDefaults.weatherAuto === false &&
  legacyDefaults.savedTargetIds.length === 0, 'omitted legacy preferences acquire complete defaults');
assert(WS.normalizeWebPrefs({ minAlt: '30', moonAware: 'false' }).minAlt === null &&
  WS.normalizeWebPrefs({ minAlt: '30', moonAware: 'false' }).moonAware === false,
  'forgiving local settings recovery defaults invalid known values');
assert(WS.stageBackup({ ...good, prefs: { tz: null, activeRigId: null } }).prefs.tz === '',
  'legacy null timezone/no-rig values normalize deliberately');
for (const unit of ['arcmin', 'arcsec', 'deg']) {
  assert(WS.stageBackup({ ...good, prefs: { sizeUnit: unit } }).prefs.sizeUnit === unit,
    `supported size unit ${unit} round-trips`);
}

for (const targets of [
  [{ id: 'ic342', ra_hours: 1, dec_deg: 2 }],
  [{ id: 'u_bad/id', ra_hours: 1, dec_deg: 2 }],
  [{ id: 'u_same', ra_hours: 1, dec_deg: 2 }, { id: 'u_same', ra_hours: 2, dec_deg: 3 }],
  [{ id: 'u_badra', ra_hours: -0.5, dec_deg: 2 }],
]) {
  await mustReject(() => WS.restoreBackup({ ...replacement, targets }, current),
    'unsafe/duplicate/canonical target ids or invalid coordinates must reject before writes');
  await unchanged('invalid target restore preserves canonical and custom data');
}
for (const text of ['-1 30', '-0 30', '5 34 32 1', '12garbage', '5hgarbage', '5 -30']) {
  assert(Number.isNaN(WS.parseRA(text)), `invalid RA ${text} must not be silently saved`);
}
assert(Math.abs(WS.parseRA('5h34m32s') - (5 + 34 / 60 + 32 / 3600)) < 1e-10,
  'documented RA letter sexagesimal form remains valid');
assert(WS.parseRA('5,575') === 5.575 && WS.parseRA('23:59:59') < 24,
  'decimal comma and colon sexagesimal RA remain valid');
assert(Math.abs(WS.parseDec('+22 0 60') - (22 + 1 / 60)) < 1e-10 &&
  Math.abs(WS.parseDec('-26d31m') + (26 + 31 / 60)) < 1e-10,
  'documented declination carry and negative sexagesimal forms remain valid');
await WS.restoreBackup(replacement, current);
assert((await WS.getSites({ strict: true }))[0].id === 's_replacement' &&
  (await WS.lastSafetySnapshot()).targets[0].id === 'u_original',
  'successful replacement commits records and the usable safety snapshot together');

console.log(ok ? 'web backup integrity held' : 'web backup integrity FAILED');
process.exit(ok ? 0 : 1);
