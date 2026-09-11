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

globalThis.indexedDB = {
  open() {
    const rq = req();
    micro(() => {
      const db = {
        objectStoreNames: { contains: (n) => _stores.has(n) },
        createObjectStore: (n) => { ensure(n); return {}; },
        transaction: (name) => ({
          objectStore: () => ({
            get(key) {
              const r = req();
              micro(() => { const s = _stores.get(name); r.result = s && s.has(key) ? s.get(key) : null; r.onsuccess && r.onsuccess(); });
              return r;
            },
            put(val, key) {
              const r = req();
              micro(() => {
                const fc = globalThis.__idbFailPutCount && globalThis.__idbFailPutCount[name];
                if (fc > 0) { globalThis.__idbFailPutCount[name] = fc - 1; r.onerror && r.onerror(); return; }
                ensure(name); _stores.get(name).set(key, val);
                r.result = key; r.onsuccess && r.onsuccess();
              });
              return r;
            },
            delete(key) {
              const r = req();
              micro(() => { const s = _stores.get(name); if (s) s.delete(key); r.onsuccess && r.onsuccess(); });
              return r;
            },
            clear() {
              const r = req();
              micro(() => { ensure(name); _stores.get(name).clear(); r.onsuccess && r.onsuccess(); });
              return r;
            },
            openCursor() {
              const r = req();
              micro(() => {
                const entries = [...(_stores.get(name) || new Map()).entries()];
                let i = 0;
                const step = () => {
                  if (i < entries.length) {
                    const [key, value] = entries[i++];
                    r.result = { key, value, continue: step };
                    r.onsuccess && r.onsuccess();
                  } else { r.result = null; r.onsuccess && r.onsuccess(); }
                };
                step();
              });
              return r;
            },
          }),
        }),
      };
      rq.result = db;
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
  rigs: [], targets: [], prefs: { bortle: 5 },
});
assert(staged.theme === 'classic', 'theme classic preserved');
assert(staged.sites.length === 1, 'one valid site staged');
assert(WS.stageBackup({ app: 'nightseam-web', theme: 'weird' }).theme === null,
  'unknown theme value must normalize to null');

/* 4. exportPanosWithImages -> normalize round trip (image survives) ------ */
H.applyPanosSnapshot({
  panos: [panoRec({ hasImage: true, image: DATAURL })],
  activeId: 'p1',
});
const exported = await H.exportPanosWithImages();
assert(exported.panos[0].hasImage === true, 'export keeps hasImage when the photo exists');
assert(typeof exported.panos[0].image === 'string', 'export embeds the photo as a data URL');
H.applyPanosSnapshot(H.normalizePanos(exported));
assert(H.activePano().hasImage === true, 'round-tripped pano still has its image');

/* 5. collectBackup + restore round trip --------------------------------- */
await WS.writeStaged(WS.stageBackup({
  app: 'nightseam-web',
  sites: [{ id: 's1', name: 'Home', lat: 1, lon: 2 }],
  rigs: [{ id: 'r1', name: 'Rig', focal_mm: 100 }],
  targets: [],
}));
const backup = await WS.collectBackup({ bortle: 6 }, { panos: [], activeId: null }, 'classic');
assert(backup.app === 'nightseam-web' && backup.version === 2, 'backup carries schema version 2');
assert(backup.theme === 'classic', 'collectBackup carries the theme');
assert(backup.sites.length === 1 && backup.rigs.length === 1, 'collectBackup reads the stores');

/* 5b. View full day preference round-trips (ITEM 1) ---------------------- */
const vfd = await WS.collectBackup(
  { bortle: 6, viewFullDay: true }, { panos: [], activeId: null }, 'classic');
assert(vfd.prefs.viewFullDay === true, 'collectBackup carries viewFullDay');
assert(WS.stageBackup(vfd).prefs.viewFullDay === true, 'stageBackup preserves viewFullDay');
assert(WS.stageBackup({ app: 'nightseam-web', prefs: { viewFullDay: false } }).prefs.viewFullDay === false,
  'an imported bundle keeps the viewFullDay value');

/* 6. malformed restore does NOT destroy current data -------------------- */
const beforeSites = (await WS.all('sites')).length;
let bad = false;
try { await WS.restoreBackup({ app: 'nightseam-web', sites: [] }, null); } catch { bad = true; }
assert(!bad, 'a valid empty-site bundle is allowed');
await WS.writeStaged(WS.stageBackup({
  app: 'nightseam-web', sites: [{ id: 's1', name: 'Home', lat: 1, lon: 2 }],
}));
const countBefore = (await WS.all('sites')).length;
let rejected = false;
try { await WS.restoreBackup({ app: 'nope' }, null); } catch { rejected = true; }
assert(rejected && (await WS.all('sites')).length === countBefore,
  'invalid bundle throws and leaves storage intact');

/* 7. write failure rolls back to the pre-restore snapshot --------------- */
const safety = await WS.collectBackup({ bortle: 6 }, { panos: [], activeId: null }, 'classic');
const incoming = {
  app: 'nightseam-web',
  sites: [{ id: 's-new', name: 'New', lat: 9, lon: 9 }],
};
globalThis.__idbFailPutCount = { sites: 1 };
let failed = false;
try { await WS.restoreBackup(incoming, safety); } catch { failed = true; }
assert(failed, 'a failed write must surface an error');
const afterFail = await WS.all('sites');
assert(afterFail.length === safety.sites.length,
  `rollback should restore ${safety.sites.length} site(s), got ${afterFail.length}`);
assert(afterFail.some((r) => r.val.id === 's1') && !afterFail.some((r) => r.val.id === 's-new'),
  'rollback must restore the pre-restore records');

console.log(ok ? 'web backup integrity held' : 'web backup integrity FAILED');
process.exit(ok ? 0 : 1);
