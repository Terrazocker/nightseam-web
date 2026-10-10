/*
 * Web backup / restore integrity checks.
 *
 * Drives the REAL web/webstore.js + web/horizon.js through a minimal fake
 * IndexedDB and a localStorage stub (no browser here). Pins:
 *   - normalized panorama records are TRUTHFUL: hasImage === true only when the
 *     backup actually carried image bytes
 *   - the profile/strokes invariant: strokes win when present, the stored
 *     profile is authoritative when there are no strokes
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

// FileReader is not in Node; enough to turn a Blob into a data URL for the
// exportPanosWithImages path.
globalThis.FileReader = class {
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      const b64 = Buffer.from(new Uint8Array(buf)).toString('base64');
      this.result = `data:${blob.type || 'image/jpeg'};base64,${b64}`;
      if (this.onload) this.onload();
    }).catch((e) => { if (this.onerror) this.onerror(e); });
  }
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

const DATAURL = 'data:image/jpeg;base64,' + Buffer.from('JPEGBYTES').toString('base64');
const blank720 = () => new Array(720).fill(-90);
const emptyPanos = { panos: [], activeId: null };
const panoRec = (over = {}) => ({
  id: 'p1', name: 'p', azOffset: 0, altBottom: 0, altTop: 60, fov: 360,
  paintMode: 'obstacle', strokes: [], profile: blank720(), profileTop: blank720(),
  hasImage: false, ...over,
});

/* 1. normalizePanos truthfulness ---------------------------------------- */
const withImg = H.normalizePanos({ panos: [panoRec({ hasImage: true, image: DATAURL })] });
assert(withImg.panos[0].hasImage === true, 'image present should set hasImage true');
assert(typeof withImg.panos[0].image === 'string', 'image should be preserved');
const noImg = H.normalizePanos({ panos: [panoRec({ hasImage: true })] });
assert(noImg.panos[0].hasImage === false, 'legacy hasImage without bytes must become false');
assert(noImg.panos[0].image === undefined, 'no image field when absent');
assert(H.normalizePanos({ panos: [panoRec({ blockAbove: true })] })
  .panos[0].blockAbove === true, 'blockAbove must round-trip through normalizePanos');
assert(H.normalizePanos({ panos: [panoRec()] }).panos[0].blockAbove === false,
  'blockAbove defaults to false (open above)');

/* 2. profile/strokes invariant ------------------------------------------ */
const bogus = blank720();
bogus[100] = 42;
const strokesWin = H.normalizePanos({ panos: [panoRec({
  profile: bogus,
  strokes: [{ m: 'b', x: 100, y: 50, r: 10 }],
})] });
assert(strokesWin.panos[0].profile[100] !== 42, 'strokes present must re-derive the profile');
const profileWins = H.normalizePanos({ panos: [panoRec({ profile: bogus })] });
assert(profileWins.panos[0].profile[100] === 42, 'no strokes must keep the stored profile');

/* 3. stageBackup validation --------------------------------------------- */
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

/* 4. exportPanosWithImages -> normalize round trip (image survives) ------ */
await H.applyPanosSnapshot({
  panos: [panoRec({ hasImage: true, image: DATAURL })],
  activeId: 'p1',
});
const exported = await H.exportPanosWithImages();
assert(exported.panos[0].hasImage === true, 'export keeps hasImage when the photo exists');
assert(typeof exported.panos[0].image === 'string', 'export embeds the photo as a data URL');
await H.applyPanosSnapshot(H.normalizePanos(exported));
assert(H.activePano().hasImage === true, 'round-tripped pano still has its image');

/* 5. collectBackup + restore round trip --------------------------------- */
await WS.writeStaged(WS.stageBackup({
  app: 'nightseam-web',
  sites: [{ id: 's1', name: 'Home', lat: 1, lon: 2 }],
  rigs: [{ id: 'r1', name: 'Rig', focal_mm: 100 }],
  targets: [], panos: emptyPanos,
}));
const backup = await WS.collectBackup({ bortle: 6 }, { panos: [], activeId: null }, 'classic');
assert(backup.app === 'nightseam-web' && backup.version === 3, 'backup carries schema version 3 for elliptical crops');
assert(backup.theme === 'workbench', 'collectBackup carries the canonical theme');
assert(backup.sites.length === 1 && backup.rigs.length === 1, 'collectBackup reads the stores');

/* 5b. View full day preference round-trips (ITEM 1) ---------------------- */
const vfd = await WS.collectBackup(
  { bortle: 6, viewFullDay: true }, { panos: [], activeId: null }, 'classic');
assert(vfd.prefs.viewFullDay === true, 'collectBackup carries viewFullDay');
assert(WS.stageBackup(vfd).prefs.viewFullDay === true, 'stageBackup preserves viewFullDay');
assert(WS.stageBackup({ app: 'nightseam-web', prefs: { viewFullDay: false }, panos: emptyPanos }).prefs.viewFullDay === false,
  'an imported bundle keeps the viewFullDay value');

/* 6. malformed restore does NOT destroy current data -------------------- */
const beforeSites = (await WS.all('sites')).length;
let bad = false;
try { await WS.restoreBackup({ app: 'nightseam-web', sites: [], panos: null }, null); } catch { bad = true; }
assert(bad && (await WS.all('sites')).length === beforeSites,
  'a bundle missing its panorama section is rejected before any write');
await WS.writeStaged(WS.stageBackup({
  app: 'nightseam-web', sites: [{ id: 's1', name: 'Home', lat: 1, lon: 2 }], panos: emptyPanos,
}));
const countBefore = (await WS.all('sites')).length;
let rejected = false;
try { await WS.restoreBackup({ app: 'nope', panos: emptyPanos }, null); } catch { rejected = true; }
assert(rejected && (await WS.all('sites')).length === countBefore,
  'invalid bundle throws and leaves storage intact');

/* 7. write failure rolls back to the pre-restore snapshot --------------- */
const safety = await WS.collectBackup({ bortle: 6 }, { panos: [], activeId: null }, 'classic');
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

/* 8. Phase-1 migrations: legacy FOV-relative panos and degree rigs ------- */
// A pre-0.6.16 web panorama stored 720 FOV-relative mask columns. With
// fov=180, azOffset=90 a wall across the WHOLE mask must migrate to the world
// bins of az 90..270 and block exactly those directions.
const legacyProf = new Array(720).fill(-90);
const legacyTop = new Array(720).fill(-90);
for (let i = 0; i < 720; i++) legacyProf[i] = 20;      // wall over the whole FOV
const legacyPano = panoRec({ fov: 180, azOffset: 90, profile: legacyProf,
                             profileTop: legacyTop, profileBins: undefined });
const migrated = H.normalizePanos({ panos: [legacyPano] }).panos[0];
assert(migrated.profileBins === 'world', 'legacy profile must migrate to world bins');
// independent expectation: desktop representative column per world bin
const wantWorld = (i) => {
  const rel = ((i * 0.5 - 90) % 360 + 360) % 360;
  return rel <= 180 ? legacyProf[Math.min(719, Math.floor(rel * 720 / 180))] : -90;
};
for (const i of [0, 179, 180, 359, 360, 539, 540, 719]) {
  assert(migrated.profile[i] === wantWorld(i),
    `migrated bin ${i} = ${migrated.profile[i]}, want ${wantWorld(i)}`);
}
assert(H.ceilFor(migrated, 100).ceil === 20, 'blocked direction inside the FOV');
assert(H.ceilFor(migrated, 269).ceil === 20, 'blocked direction at the FOV edge');
assert(H.ceilFor(migrated, 45).ceil === H.NO_BLOCK, 'outside the FOV stays unblocked');
const remigrated = H.normalizePanos({ panos: [migrated] }).panos[0];
assert(remigrated.profileBins === 'world', 'a current record keeps its bin marker');
for (const i of [0, 180, 360, 540, 719]) {
  assert(remigrated.profile[i] === migrated.profile[i],
    `normalizing a CURRENT record must not re-convert (bin ${i})`);
}

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

/* 9. crop round-trip + legacy restore -> crop -> export -> re-import -------- */
// (a) a stroke record: crop, then normalize, and confirm fov/az/strokes survive
const cst = H.normalizePanos({ panos: [panoRec({ id: 'crop-strokes',
  strokes: [{ m: 'b', x: 360, y: 100, r: 30 }] })] }).panos[0];
H.cropPano(cst, { x: 180, w: 360 }, 720);          // keep az 90..270 -> fov 180, az 90
const cstAgain = H.normalizePanos({ panos: [JSON.parse(JSON.stringify(cst))] }).panos[0];
assert(cstAgain.fov === 180 && cstAgain.azOffset === 90, 'crop fov/az survive normalize');
assert(cstAgain.strokes.length === cst.strokes.length, 'cropped strokes survive normalize');

// (b) legacy profile-only record: migrate (world bins), crop, then export and
// re-import; the cropped record must come back byte-identical.
const legacyCrop = H.normalizePanos({ panos: [panoRec({
  id: 'legacy-crop', fov: 180, azOffset: 90,
  profile: new Array(720).fill(20), profileTop: blank720(),
  profileBins: undefined,
})] }).panos[0];
assert(legacyCrop.profileBins === 'world', 'legacy crop record migrated to world bins');
H.cropPano(legacyCrop, { x: 180, w: 360 }, 720);   // keep az 135..225 -> fov 90, az 135
assert(legacyCrop.fov === 90 && legacyCrop.azOffset === 135, 'legacy crop calibration');
await H.applyPanosSnapshot({ panos: [JSON.parse(JSON.stringify(legacyCrop))],
                       activeId: legacyCrop.id });
const exportedCrop = H.exportPanos();
const reimported = H.normalizePanos(exportedCrop).panos.find((x) => x.id === 'legacy-crop');
assert(reimported, 'the cropped record must survive export + re-import');
assert(reimported.fov === legacyCrop.fov && reimported.azOffset === legacyCrop.azOffset,
  'crop fov/az must survive export + re-import');
assert(JSON.stringify(reimported.profile) === JSON.stringify(legacyCrop.profile),
  'crop profile must be byte-identical after export + re-import');
assert(JSON.stringify(reimported.profileTop) === JSON.stringify(legacyCrop.profileTop),
  'crop profileTop must be byte-identical after export + re-import');

/* WB7 forward compatibility: `version` is written at export and was IGNORED on
 * import, so a bundle from a LATER build was accepted and its fields read under
 * this build's rules - a silent misreading reported as a successful restore. A
 * version above BUNDLE_VERSION must now be refused, v1 (no stamp) and v2 must
 * still restore, and the stamp must never be a crash of its own. */
const good = { app: 'nightseam-web', version: 2, sites: [], rigs: [], targets: [],
               prefs: {}, panos: { panos: [], activeId: null } };
assert(WS.stageBackup(good), 'a v2 bundle must remain readable');
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
const beforeInvalidPhoto = JSON.stringify(H.exportPanos());
for (const image of ['data:text/html;base64,eA==', 'data:image/png;base64,!!!', 'data:image/png;base64,']) {
  const malformed = { panos: [panoRec({ image })], activeId: 'p1' };
  assert(H.normalizePanos(malformed) === null, 'malformed embedded image must fail normalization');
  assert(await H.importPanos(malformed) === false, 'malformed image import must fail');
  assert(JSON.stringify(H.exportPanos()) === beforeInvalidPhoto,
    'malformed image import must not alter the current panorama state');
}
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
const current = await WS.collectBackup({}, emptyPanos);
const unchanged = async (message) => {
  const state = await WS.collectBackup({}, emptyPanos);
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
await mustReject(() => WS.collectBackup({}, emptyPanos), 'a failed snapshot read must abort backup collection');
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

// v3 elliptical crop geometry survives staging, storage, export and restore.
const ellipse = panoRec({ strokes: [{m:'b',x:360,y:180,r:20,rx:80}] });
const elliptical = H.normalizePanos({panos:[ellipse],activeId:ellipse.id});
const expectedEllipse = elliptical.panos[0].profile.slice();
await H.applyPanosSnapshot(elliptical);
const ellipseBackup = await H.exportPanosWithImages();
await H.applyPanosSnapshot(H.normalizePanos(ellipseBackup));
assert(H.activePano().strokes[0].rx === 80, 'backup preserves horizontal radius');
assert(H.activePano().strokes[0].r === 20, 'backup preserves vertical radius');
assert(H.activePano().profile.every((v,i)=>v===expectedEllipse[i]), 'backup preserves elliptical profile');

console.log(ok ? 'web backup integrity held' : 'web backup integrity FAILED');
process.exit(ok ? 0 : 1);
