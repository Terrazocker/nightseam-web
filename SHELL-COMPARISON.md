# Desktop vs Web - how the two NightSeam shells differ

Scope: what is literally the same code, what is a deliberate fork, and what is an
accidental divergence that nobody pinned. Measured against the working tree at
the time of writing (post-0.6.33 batch, core stub 26,
hash `e3b6d1555208eada`).

Verdict up front: **the maths is one codebase; the apps are two.** Every
astronomy and planning formula is byte-identical files imported by both shells.
Everything around that - storage, delivery, grid anchor, catalog delivery, UI
markup, CSS, images, backup - is separate code that agrees only where
something pins it.

## 1. The shared codebase (byte-identical)

`core/` holds 9 pure ES modules (~1,610 lines):

| module | what it owns |
|---|---|
| `astro.js` | JD/GMST, precession (Meeus ch.21), refraction, `altaz`, sun/moon, `sepDeg` |
| `planning.js` | twilight scan, `nightInfo`, `pickDarkWindow`, `scrubWindowMs`/`scrubBounds`/`scrubClamp` |
| `scoring.js` | moon/bortle curves, `popularityFactor`, `computeNightTracks`, `scoreNightTracks`, `nightStats*` |
| `visibility.js` | `aboveHorizon`, `sampleVisible`, `statusOf`, `effectiveMinAlt` |
| `horizon.js` | mask/profile geometry, sky bands, crop, `ceilFor` |
| `catalog.js` | type palette, `searchBlob`, `wikiTitles`, popularity tiers |
| `format.js` | sizes/FOV/`framePct`, `magVisible`, sky zoom matrix |
| `time.js` | `offsetEastMin`, `zoneOffsetAtLocalNoon`, wall<->UTC |
| `index.js` | the explicit export list the stubs are generated from |

Both shells consume it through a generated stub (`web/core.js`,
`static/js/core.js`) pointing at a content-hashed tree. I hashed every baked
module in both shells: **all identical**, and both retain the same two
generations (current `e3b6d1555208eada`, N-1 `c91d198c1de72609`).

The guards actively keep it that way: `check_core.py` fails on drift, a stale
hash dir, a stub/token mismatch, an impure identifier in `core/`, or a moved
concept re-implemented outside `core/` (JS **and** `app/`+`scripts/` Python).
`tests/js/reference_anchors.mjs` (21 checks against published IAU/Meeus/ERFA
values) is the correctness authority for both shells at once.

Per-shell wrapper modules are thin re-export shims where the surface names
differ: `static/js/astro.js` is 19 lines, `web/astro.js` is 177 lines (it adds
`moonPhase`, `sunAltAz`/`moonAltAz`, `objectTrack`, `objectDayInfo` around the
core imports), `web/nightrank.js` is 9 lines.

## 2. What is NOT shared

### 2.1 Ranked by how much they differ

| area | desktop | web | status |
|---|---|---|---|
| storage | SQLite `data/nightseam.db` + FastAPI routes | IndexedDB `nightseam-db-v1` (targets/sites/rigs/meta) + `localStorage` | separate by design |
| catalog transport | `GET /api/catalog?adv=1` from SQLite | static `catalog.json` (5.1 MB) + `CATALOG_TOKEN` | separate delivery, same 12,176 rows |
| night grid | 241 samples local-noon -> local-noon, clipped to dusk..dawn | dusk-anchored, ~88 samples | **divergent numbers** |
| tonight candidate set | all 200 standard rows | 45 of them filtered out | **unpinned divergence** |
| night compute | worker-first, sync fallback, prefs re-scored in place | in-thread, 14 ms budget, `obsCache` + 250-row chunks | separate |
| Tracks | via worker/sync `computeNightTracks`, chunk 2000 | same core call, chunk 250, cached by grid | same maths, different scheduling |
| CSS | `static/style.css` (30.5 KB) + `themes.css` (35.3 KB) | `web/style.css` (31.8 KB) + `themes.css` (13.8 KB) | **separate files** (23% selector overlap) |
| HTML | 36 KB static, 6 tab panes | 13.5 KB shell, views rendered by JS | separate |
| images | server chain Wikipedia -> Wikidata -> DSS2, disk cache in `imgcache/` | browser -> Wikipedia REST summary only, IndexedDB blob cache + 30-day negative TTL | different chains |
| backup | ZIP via `/api/export`+`/api/import`, images library included | `collectBackup`/`restoreBackup` bundle incl. pano bytes, images library absent | separate |
| FITS/archive | ingest, library, reindex, Sky Map of captures | none | desktop-only features |
| weather | `static/js/weather.js` -> Open-Meteo | `web/app.js` -> Open-Meteo | same provider, separate code |
| update check | `updater.js` -> `POST /api/update-check` (server fetches + validates) | none | desktop-only |
| CSP | `CSP_HEADER` in `app/server.py` | none in the repo (host-level) | **gap** |

### 2.2 Measured: the scoring-grid divergence (CO-07), still live

The two shells anchor the same scoring window differently:

* desktop: the payload grid is 241 samples at 6 min from local noon to noon
  (`static/js/planning_client.js:21-22`), and `recomputeNightDerived` clips it
  **inclusively** to `[dusk, dawn]` (`derive.js:159`, `nightIndexRange`).
* web: `jd0 = dusk`, `jd1 = dawn`, `count = max(2, round((jd1-jd0)/step)) + 1`
  (`web/app.js:614-618`, scored by `scoreNightTracks`).

I reproduced this on 2026-03-14 at 47.5 N / 11.0 E (astronomical dusk 19:02:55,
dawn 03:46:29) with the real core and both real scoring paths
(`logs/shell_divergence.mjs`):

```
desktop grid count 241  scoring clip i0..i1 71 157  -> nightN 87
web grid n 87  count 88  denominator (n+1) 88  vs desktop nightN 87  => sample delta 1
rows differing: 12/14, worst |dPct| 1, worst |dScore| 0.070
```

So the two shells disagree by one sample in the window and by one percentage
point / up to ~0.07 score units on 12 of 14 test rows. `AGENTS.md` records the
original measurement (20-66 of 200 standard rows differ by up to 4 pp). The
documented reason to leave it alone is sound: closing it changes user-visible
web numbers. But it is a **real** behavioural difference between the apps, not
parity, and it should stay labelled as such.

### 2.3 Unpinned: the web drops 45 of the 200 standard objects from Tonight

`web/app.js:656-657`:

```js
const candidates = activeCatalog().filter(
  (o) => o.vmag != null && (!o._adv || o.vmag <= 9));
```

The comment above it says "Standard mode mirrors the desktop exactly: every
standard object is a Tonight candidate" - the same expression's `o.vmag != null`
contradicts the comment.

Measured against the shipped data (`logs/check_supplement_vmag.py`, using
`catalog_data.standard_ids` itself and the shipped `POPULARITY` table):

```
standard top-200 rows with EMPTY vmag: 45
  ic1396 IC 1396, ngc1977 Running Man, ngc281, ngc2024 Flame, ic410,
  sh2-101 Tulip, sh2-240 Simeis 147, ic2177 Seagull, c14 Double Cluster,
  ngc2359, ngc1909 Witch Head, b150 Seahorse, pipe Pipe Nebula, ...
web/catalog.json rows with vmag null: 711  (666 advanced, 45 standard)
```

The desktop applies **no** magnitude test to the Tonight candidate set
(`static/js/tonight.js:39` takes every `N.objects` row, i.e. all 200); its
magnitude gate lives in Targets (`targets.js:128`) and the sky chart
(`skyview.js` / `core/format.js::magVisible`). So on the web, 22.5% of standard
mode - including several of the most popular photogenic nebulae - can never
appear in "Best targets tonight", while on the desktop they can.

### 2.4 Cosmetic but user-visible

* `bestStart` semantics: the desktop stores `o.best = [start, end)` and formats
  the end with `windowEndISO`; the web formats
  `dateFromJD(r.bestStart + r.bestRun * step)`. Same instants, different code.
* Tonight list sizes: desktop `slice(0, 8)` for both lists (plus a "busiest
  hour" card the web does not compute); web `slice(0, 16)` for the top list and
  8 for "visible now".
* Detail grids are genuinely separate builders: desktop
  `planning_client.js::buildClientDetail` (4-min, dusk-75m .. dawn+45m) vs web
  detail in `app.js`. Same predicate, different sample placement.
* Panorama editor is the largest single fork: desktop `static/js/pano.js`
  (32.9 KB) vs web `web/horizon.js` (60.2 KB). Geometry and crop come from
  `core/horizon.js`; persistence, history, image caching and the editor UI do
  not. Desktop crop re-encodes the photo and wipes strokes server-side; web crop
  is non-destructive by design - an asserted intentional difference.
* Theme: both ship `dome` + `classic` through `themes.css`, but the CSS is a
  separate implementation per shell (selector Jaccard 0.23 style / 0.16 themes).
  `web/dragwin.js` gives the web draggable popups; the desktop is a native
  pywebview window.

## 3. Security posture differs in one direction

The desktop ships a strict CSP (`app/server.py:153`, `default-src 'self'`,
`script-src 'self' 'unsafe-inline'`, `connect-src 'self' https://api.open-meteo.com`,
`worker-src 'self'`). Its Wikipedia/DSS image chain runs **server-side**, so the
browser only ever talks to `localhost` - `img-src` still lists
`upload.wikimedia.org` / `commons.wikimedia.org` / `alasky.cds.unistra.fr` as a
belt-and-braces allowance.

The web tree contains **no CSP**: `web/` has no `.htaccess`, no `_headers`, and
`build_web.py` does not emit one, so whatever `/astro` sends is host-level
Plesk configuration I cannot see from the repo. The web makes its Wikipedia
request **from the page** (`WIKI_API`, `app.js:450`), so it *needs* a
`connect-src` and `img-src` allowance; it also has a small inline boot script in
`index.html` and no external scripts, so a strict policy would fit. Worth
confirming what the host actually sends - with no CSP, a single XSS in the web
shell can read `localStorage`, IndexedDB, and make any origin's requests.

## 4. Why the divergence risk is structured this way

The guard suite is *parity-shaped*: `tests/test_js_parity.py` +
`tests/js/*.mjs` (20 engines) pin the things both shells share - scoring curves,
status predicate, min-alt rule, magnitude rule, zoom matrix, scrub policy,
window contract, frame coverage, filter advice, tier bands, wiki titles. What is
**not** pinned is everything that is merely *similar*: the grid anchor, the
candidate-set filter, list sizes, and the CSS. That matches the design (one
authority per concept) but it means "the apps agree" is only true where a test
says so - §2.2 and §2.3 are exactly the places where no test does.

## 5. Recommendations, in order

1. **Fix the comment or the filter in `web/app.js:650-657`.** The `vmag != null`
   clause silently excludes 45 standard-mode objects and the comment claims the
   opposite. Cheapest correct fix: drop the clause for non-`_adv` rows
   (`(!o._adv) || (o.vmag != null && o.vmag <= 9)`), which restores desktop
   parity for standard mode and leaves the deliberate advanced-mode cap intact.
2. **Pin whatever you choose.** A `nightstats`/candidate-set test in
   `tests/js/astro_parity.mjs` that asserts the web's candidate set for standard
   mode equals the standard id set - so the next edit cannot re-break it quietly.
3. **Decide the grid anchor (CO-07) explicitly, once.** Either keep the
   divergence and say so in the UI docs, or align the web's denominator with the
   desktop's clipped count. Do not leave it as "parity" in prose.
4. **Confirm the production CSP** for `/astro` and, if absent, add one (the
   desktop's header is a ready template; the web needs
   `connect-src 'self' https://en.wikipedia.org` and
   `img-src 'self' data: https://upload.wikimedia.org`).
5. **Nothing else here needs action.** Storage split, separate CSS, separate
   Tonight layouts and the two panorama editors are deliberate and already
   documented.
