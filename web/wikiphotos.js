/*
 * NightSeam web - object photos from Wikipedia (moved out of app.js).
 *
 * The detail card asks for an object's photo with loadWikiThumb() and frees the
 * shown one with releaseWikiThumb() when it closes. Photos and definite "no
 * photo" answers are cached per object in the `nightseam-images` IndexedDB.
 */
import { wikiTitles } from './core.js?v=78';
import { wikimediaCredit, wikiImageCredit, renderImageCredit } from './imagecredits.js?v=2';

// Object photos come from Wikipedia only when their detail view is opened.
// Cached photos are reused first. Results (image blobs AND definite
// "no photo" answers) are cached in IndexedDB per object; transient network
// failures are NOT cached so they retry next open.
// One shared thumbnail connection: opening one per read/write leaked them and
// would block any future version upgrade. Reopened after a close or failure.
let thumbDb = null;
function idbOpen() {
  thumbDb ??= new Promise((resolve, reject) => {
    try {
      const rq = indexedDB.open('nightseam-images', 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore('thumbs'); };
      rq.onsuccess = () => {
        const db = rq.result;
        db.onversionchange = () => { db.close(); thumbDb = null; };
        db.onclose = () => { thumbDb = null; };
        resolve(db);
      };
      rq.onerror = () => reject(rq.error);
    } catch (e) { reject(e); }
  }).catch((e) => { thumbDb = null; throw e; });
  return thumbDb;
}
async function idbGet(key) {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const t = db.transaction('thumbs', 'readonly').objectStore('thumbs').get(key);
      t.onsuccess = () => resolve(t.result || null);
      t.onerror = () => reject(t.error);
    });
  } catch { return null; }
}
// A write counts once its transaction commits: a full disk aborts the
// transaction (QuotaExceededError) after the put request itself succeeded.
async function idbWrite(work) {
  const db = await idbOpen();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('thumbs', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
    work(tx.objectStore('thumbs'));
  });
}
async function idbSet(key, val) {
  try {
    await idbWrite((store) => store.put(val, key));
  } catch (e) {
    if (!e || e.name !== 'QuotaExceededError') return; // storage unavailable — display-only
    // Storage is full: drop most cached photos, then try once more.
    try {
      await idbPrune(THUMB_BUDGET / 4);
      await idbWrite((store) => store.put(val, key));
    } catch { /* still full — display-only for the session */ }
  }
}
const NEG_TTL = 30 * 86400000; // remember "no photo" for 30 days
// Cached photos are capped at THUMB_BUDGET bytes. Past it, the least recently
// viewed photos go until THUMB_KEEP of the budget is used; expired "no photo"
// answers and unreadable entries are dropped on the same pass.
const THUMB_BUDGET = 25 * 1024 * 1024;
const THUMB_KEEP = 0.8;
async function idbPrune(budget = THUMB_BUDGET) {
  const now = Date.now();
  await idbWrite((store) => {
    const photos = [];
    store.openCursor().onsuccess = (ev) => {
      const cursor = ev.target.result;
      if (cursor) {
        const v = cursor.value;
        if (v && v.blob instanceof Blob) photos.push({ key: cursor.key, size: v.blob.size, used: v.used || v.ts || 0 });
        else if (!v || !v.missing || !(now - v.ts < NEG_TTL)) cursor.delete();
        cursor.continue();
        return;
      }
      let total = photos.reduce((sum, p) => sum + p.size, 0);
      if (total <= budget) return;
      photos.sort((a, b) => a.used - b.used);
      for (const p of photos) {
        if (total <= budget * THUMB_KEEP) break;
        store.delete(p.key);
        total -= p.size;
      }
    };
  });
}
const WIKI_API = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
let currentObjUrl = null;

export async function loadWikiThumb(o, imgEl, phEl, creditEl, stillShowing = () => true) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-data: reduce)').matches) {
    phEl.textContent = 'photo skipped — reduced data mode';
    return;
  }
  const key = 'w:' + o.id;
  const cached = await idbGet(key);
  if (cached && cached.blob) {
    showBlob(cached.blob);
    renderImageCredit(creditEl, cached.credit);
    idbSet(key, { ...cached, used: Date.now() }); // recently viewed photos are kept longest
    return;
  }
  if (cached && cached.missing && Date.now() - cached.ts < NEG_TTL) {
    phEl.textContent = 'no photo on Wikipedia — see the link below';
    return;
  }
  const title = wikiTitles(o)[0] || o.primary_name;
  phEl.textContent = 'loading Wikipedia photo…';
  // CANDIDATE PAGES, best first, and a DISAMBIGUATION GUARD (0.6.32). Looking up
  // the display name alone lands on a disambiguation page for every Messier row
  // without a common name - "M101" is motorways, highways and a rifle, not the
  // galaxy - and the old single-shot lookup then gave up. "Messier 101" is the
  // article (it redirects to Pinwheel Galaxy), and "NGC 5457" resolves too.
  const titles = wikiTitles(o);
  let page = title;
  let resolvedSrc = null;
  let transient = false;                  // rate limited / offline: stay retryable
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 12000);
  try {
    for (const t of titles) {
      const r = await fetch(WIKI_API + encodeURIComponent(t), { signal: ac.signal });
      if (r.status === 404 || r.status === 410) continue;   // no such page
      if (!r.ok) { transient = true; continue; }            // 429/5xx: try later
      const j = await r.json();
      if (j && j.type === 'disambiguation') continue;       // never a photo of it
      if (j && j.title) page = j.title;                     // canonical (post-redirect)
      const cand = j && j.thumbnail && j.thumbnail.source;
      if (cand) { resolvedSrc = cand; break; }
    }
    if (!resolvedSrc) throw new Error('no-thumb');
    const ir = await fetch(resolvedSrc, { signal: ac.signal });
    if (!ir.ok) { transient = true; throw new Error('no-img'); }
    const blob = await ir.blob();
    if (!blob.type.startsWith('image/')) throw new Error('bad-type');
    const initialCredit = wikimediaCredit(resolvedSrc);
    const ts = Date.now();
    await idbSet(key, { blob, credit: initialCredit, page, ts, used: ts });
    // Display first: optional attribution metadata must not hold up the image.
    showBlob(blob);
    renderImageCredit(creditEl, initialCredit);
    idbPrune().catch(() => {}); // a new photo may push the cache past its budget
    const credit = await wikiImageCredit(resolvedSrc, { signal: ac.signal });
    await idbSet(key, { blob, credit, page, ts, used: Date.now() });
    renderImageCredit(creditEl, credit);
    const link = imgEl.isConnected && stillShowing() && document.querySelector('#d-wikilink');
    if (link) link.href = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(page.replace(/ /g, '_'));
  } catch (err) {
    // Only a DEFINITIVE answer from Wikipedia is remembered: "no such page /
    // no thumbnail" (`no-thumb`) or "those bytes are not an image" (`bad-type`).
    // Every NETWORK failure must stay retryable - offline, DNS, a rejected
    // fetch, or the 12 s timeout aborting the request. 0.6.32 regressed here: a
    // rejected fetch never set `transient`, so a single offline open cached
    // "no photo on Wikipedia" for 30 days and the 0.6.31 behaviour was lost.
    const reason = String((err && err.message) || '');
    const definitive = !transient && (reason === 'no-thumb' || reason === 'bad-type');
    if (definitive) await idbSet(key, { missing: true, ts: Date.now() });
    phEl.textContent = definitive
      ? 'no photo on Wikipedia — see the link below'
      : 'photo unavailable right now — see the link below';
  } finally {
    clearTimeout(to);
  }
  function showBlob(blob) {
    // a slow fetch for an earlier object must not revoke the URL of the image
    // that is on screen now - once the modal moved on, its element is detached
    if (!imgEl.isConnected) return;
    if (currentObjUrl) URL.revokeObjectURL(currentObjUrl);
    currentObjUrl = URL.createObjectURL(blob);
    imgEl.src = currentObjUrl;
    imgEl.style.display = '';
    phEl.style.display = 'none';
  }
}

/** Free the object URL of the photo on screen; the detail card has closed. */
export function releaseWikiThumb() {
  if (currentObjUrl) { URL.revokeObjectURL(currentObjUrl); currentObjUrl = null; }
}
