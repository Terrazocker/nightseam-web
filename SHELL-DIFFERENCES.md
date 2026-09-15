# Desktop vs Web - complete difference list and implementation ratings

Companion to `SHELL-COMPARISON.md`. Nothing in the repo was changed for this
document; every figure below was measured read-only from the working tree
(post-0.6.33 batch, core stub 26, hash `e3b6d1555208eada`).

Rating scale per area:

| mark | meaning |
|---|---|
| `D++` / `W++` | clearly better / more sophisticated |
| `D+` / `W+` | somewhat better |
| `=` | comparable, different by design or by constraint |
| `~` | one side is ahead only because the other has no equivalent feature |

---

## 0. Verdict in one page

* **Shared:** all astronomy and planning maths - 9 core modules, 1,609 lines,
  byte-identical in both shells' baked trees.
* **Separate:** everything around it. Desktop = 23 modules / 5,956 lines + 13
  Python modules / 12,487 lines + 36 KB HTML + 66 KB CSS. Web = 8 modules /
  5,184 lines + 13.5 KB HTML + 46 KB CSS. Only 36 CSS lines are shared.
* **Who is more sophisticated:** the **web shell** - it holds far more user
  features per line (backup validate-then-commit, atlas Sky Map, rig presets,
  min-visibility gate, per-row visibility warms), renders 1.5x more of the app
  from one file, and caches images in the browser.
* **Who is better engineered where it is hard:** the **desktop** - the night
  compute is a real worker architecture with generation counters, queueing,
  transferable typed arrays and a tested sync fallback; its image chain has an
  allowlist + redirect re-validation + an offline circuit breaker.
* **Who is more correct:** neither, and that is the finding. Two areas diverge
  unpinned: the scoring-grid anchor (known, CO-07) and the web's Tonight
  candidate filter, which silently drops **45 of the 200 standard objects**
  while the comment above it claims exact desktop parity.

---

## 1. Shared foundation

| dimension | desktop | web | rating |
|---|---|---|---|
| maths modules | `core/*.js` (9, 1,609 lines) via `static/js/core.js` | the same 9 files via `web/core.js` | `=` |
| baked hashes | current + N-1 retained | identical hashes, identical retention | `=` |
| wrapper shims | `static/js/astro.js` 19 lines | `web/astro.js` 177 lines (adds `moonPhase`, `sunAltAz`/`moonAltAz`, `objectTrack`, `objectDayInfo`), `nightrank.js` 9 lines | `W+` (the web wrapper is a real API layer, not just a re-export) |
| drift guards | `check_core.py` covers both shells and `app/`+`scripts/` | same guard | `=` |

---

## 2. Complete difference list

### A. Storage and user data

| # | desktop | web | rating |
|---|---|---|---|
| A1 | SQLite `data/nightseam.db`, additive schema via try/ALTER, 33 FastAPI routes | IndexedDB `nightseam-db-v1` (targets/sites/rigs/meta) + `localStorage` | `=` (constraint-driven) |
| A2 | live DB is the source of truth | IndexedDB is a *mirror*; `catalog.json` is derived from the DB by `web/build_web.py` | `=` |
| A3 | backup: ZIP via `/api/export`+`/api/import`, best-effort auto safety copy | `collectBackup`/`restoreBackup`: stage + validate the whole bundle, snapshot, roll back on failure | **`W++`** (all-or-nothing beats best-effort) |
| A4 | import drops non-token pano ids, ignores bundle `image_dir`, clears `import_batches` | validates staged shape (`data.panos.panos` is an array), checks `clearStore` results | `=` |
| A5 | legacy id migration `LEGACY_ID_MAP` + `migrate_legacy_object_ids` | `normalizePanos`, `fov_unit` degree->arcmin migration | `=` |
| A6 | no libraries/no storage quota model | `storageOk()` probe + caught `all()` failure path | `W+` |
| A7 | image library (import batches, reindex, edit, export CSV/JSON) | none | `~` |

### B. Data delivery

| # | desktop | web | rating |
|---|---|---|---|
| B1 | `GET /api/catalog?adv=1` from SQLite | static `catalog.json` 5,088,280 B + `CATALOG_TOKEN='10'` + manifest | `=` |
| B2 | payload tokens: none (server renders) | manual `?v=` per module + `CATALOG_TOKEN`, enforced by 3 guards | **`W+`** (a whole class of staleness the desktop does not need and does not have a guard for) |
| B3 | `S.catalog` fetched once at boot | `activeCatalog()` filters `_adv` per mode, 12,176 rows in memory | `=` |

### C. Night planning and compute

| # | desktop | web | rating |
|---|---|---|---|
| C1 | payload grid: 241 samples, local noon -> local noon, 6-min (`planning_client.js:21-22`) | grid: dusk-anchored, `count = max(2, round((jd1-jd0)/step)) + 1` (~88) | `=` in intent |
| C2 | scoring clip: inclusive `[dusk,dawn]` via `nightIndexRange()` | denominator `n+1` over the dusk..dawn grid | **divergent, unpinned** (see F1) |
| C3 | worker-first: `planning_worker.js`, 3 generation counters (`_wgen`/`_bindGen`/`_dgen`), `SupersededError`, 8 ms bind budget, transferable typed arrays, queued pref change, sync fallback | in-thread `nightStatsBatch`, 250-row chunks on a 14 ms budget, `obsCache` keyed by `date\|minAlt\|pano\|obj`, `setTimeout(tick, 0)` | **`D++`** for compute architecture |
| C4 | `requestPrefsDerived()` + `flushQueuedPrefs()`: a Bortle/min-alt change rescores without recomputing astronomy | `obsNightGrid()` + memoized `cachedNightWindow()` | `D+` |
| C5 | `_clientTracks` payload assembled to mirror the deleted `/api/night` shape | computes rows directly, caches `{pct, blk}` | `=` |
| C6 | scoring source: `derive.js::recomputeNightDerived` (payload-driven, clips by index) | `core/scoring.js::scoreNightTracks` (grid-driven) | **`W+`** (the web scores through the shared core function; the desktop re-implements the loop around it) |
| C7 | detail view: `planning_client.js::buildClientDetail`, 4-min, dusk-75m..dawn+45m | detail computed in `app.js` | `=` |
| C8 | scrub: shared `scrubWindowMs`/`scrubBounds`/`scrubClamp` | the same shared functions | `=` |
| C9 | worker dev hooks `__NS_DEBUG_WORKER`/`__NS_KILL_WORKER` retained and browser-tested | no worker | `D+` |

### D. Catalog, ranking and filtering

| # | desktop | web | rating |
|---|---|---|---|
| D1 | same 12,176 rows, same `STANDARD_TOP_N = 200` rule from `app/popularity_data.py` | same rows via `catalog.json` (711 rows with `vmag: null`, 45 of them standard) | `=` |
| D2 | tiers: `assignPopularityTiers(S.catalog)` | tiers: `assignPopularityTiers(activeCatalog())` | `=` (both pinned mode-independent) |
| D3 | Tonight candidates: **all 200** standard rows (`tonight.js:39`) | `o.vmag != null && (!o._adv \|\| o.vmag <= 9)` (`app.js:656-657`) | **`D++`** - the web drops 45 objects the desktop keeps |
| D4 | magnitude gate in Targets (`passesFilters`) and sky chart only | advanced-mode Tonight cap `vmag <= 9` (documented deliberate deviation) | `=` for the cap, `D+` overall |
| D5 | magnitude hide rule `magVisible` shared | `magVisible` from `web/format.js` re-export | `=` |
| D6 | min-visibility gate deliberately OUT of `passesFilters` (skyview feeds the chart from it) | gate is list membership, plus a 250-row visibility warm | `W+` (the web got the semantics it wanted; the desktop has no per-row `% tonight` warm) |
| D7 | favourites filter (`#fFav`), constellation filter | neither | `~` |
| D8 | sort modes: tier/score/pct/maxalt/beststart/mag/name | tier/pct/name/maxalt + search | `D+` |

### E. UI and interaction (the largest fork)

| # | desktop | web | rating |
|---|---|---|---|
| E1 | 36 KB static HTML, 6 tab panes, 8 sections | 13.5 KB shell, `#view` rendered by JS (tonight/sky/catalog/horizon/settings) | `W+` (more app per byte; `app.js` is 2,923 lines) |
| E2 | CSS 30,527 + 35,347 B | CSS 31,825 + 13,807 B; selector Jaccard 0.23 (style) / 0.16 (themes) | `=` (separate implementations, shared vocabulary) |
| E3 | panorama editor `static/js/pano.js` 885 lines, loupe, drag handle | `web/horizon.js` 1,457 lines: history stack (`HISTORY_LIMIT=60`), undo/redo, dirty tracking, `flushHorizonEdits`, `beforeunload` guard, in-page `confirmDialog`, DPR-aware canvas, 3 `ResizeObserver`s | **`W++`** (a richer editor with undo/redo and real lifecycle guards) |
| E4 | crop re-encodes the photo server-side and WIPES strokes/profile | crop is non-destructive: transforms/clips strokes, else clips the world-bin profile | `W+` (asserted intentional difference) |
| E5 | dialogs: native `confirm()` in `pano.js:366` and `setup.js:190` | `confirmDialog` for destructive actions, `confirm()` for 4 setup deletes | `W+` (partially; the web is inconsistent too) |
| E6 | Tonight layout: 4 cards incl. "Busiest hour", 8 + 8 picks | 3 cards, top 16 + visible-now 8 + rising-later 8 | `W+` (more lists) but `D+` on the busiest-hour card |
| E7 | Sky View: `skyview.js` 599 lines | sky view inside `app.js`, dpr-aware | `=` |
| E8 | Sky Map of the *image library* (`skymap.js` 393 lines) | **atlas Sky Map** with constellation lines, alt grid, azimuth ring, horizon silhouette (`app.js:828-1180`) | `W++` (not the same feature; the web's atlas is far more capable) |
| E9 | first-run wizard `wizard.js` 10,789 B | one `wizard` reference; setup dialog only | `D+` |
| E10 | draggable popups: native pywebview window | `web/dragwin.js`, active only under `data-theme="dome"` | `W+` |
| E11 | themes: `dome` + `classic`, applied from `/api/state` | `dome` + `classic`, applied from `nightseam_theme` + a head script | `=` |
| E12 | rig presets picker | the same picker + `DEFAULT_RIGS` pin | `=` |

### F. Accessibility

| # | desktop | web | rating |
|---|---|---|---|
| F1 | ARIA in static HTML (20 `aria-*`, 5 `role`, 1 `tabindex`); modal markup has `role="dialog" aria-modal="true" aria-labelledby` | ARIA in JS (16 `aria-*`, 14 `role` in `app.js`; 13 more in `horizon.js`) + 1 in the shell | `=` |
| F2 | focus trap: delegated `util.js::initFocusTrap`, wired once in `main.js` | focus trap inline in `app.js:2905-2913` (no `initFocusTrap`) | `D+` (one shared, delegated implementation) |
| F3 | `#brand` is `role=button tabindex=0` with Enter/Space | keyboard-scrub handlers throughout, `#cat-q` has an accessible name | `=` |
| F4 | `aria-live`/announcements | `busy()` chip, `#pct-status` text | `=` |

### G. Security

| # | desktop | web | rating |
|---|---|---|---|
| G1 | `CSP_HEADER` in `app/server.py:153`: `default-src 'self'`, `script-src 'self' 'unsafe-inline'`, `connect-src 'self' https://api.open-meteo.com`, `worker-src 'self'` | **no CSP in the repo** (host-level at Plesk; `build_web.py` emits none) | **`D+`** (the primitive is present and tested; the host config is unverifiable from here) |
| G2 | image chain runs **server-side**, so the page only talks to localhost | page fetches `en.wikipedia.org` directly (`WIKI_API`) - needs `connect-src`/`img-src` | `D+` |
| G3 | image redirect allowlist `_AllowListRedirects` re-validating every hop, `_context_for` host check, offline circuit breaker (`is_offline`/`_note_success`/`_note_failure`) | one host, blobs type-checked (`blob.type.startsWith('image/')`), definitive failures cached 30 days, transient ones retryable | `D++` on chain defence, `W+` on negative caching |
| G4 | local port hardening, JSONP replaced by `POST /api/update-check` (T6-F1) | no server, no JSONP | `=` |
| G5 | untrusted paths through `safe_rel`/`safe_join`/`safe_token`; `_safe_join` in backup | `normalizePanos` + staged validation | `=` |
| G6 | `esc()` 42 uses over 12 files; every user-controlled `innerHTML` interpolation checked | `esc()` 50 uses in `app.js` + 8 in `horizon.js` | `=` |

### H. Network behaviour

| # | desktop | web | rating |
|---|---|---|---|
| H1 | images: Wikipedia -> Wikidata -> DSS2, on-disk `imgcache/`, background `img-prefetch` thread on every start | images: Wikipedia REST summary only, IndexedDB `thumbs` store, no prefetch thread | `~` (desktop richer; web lighter) |
| H2 | weather: `static/js/weather.js` -> Open-Meteo | `web/app.js:334` -> Open-Meteo | `=` |
| H3 | update check: `updater.js` -> `POST /api/update-check`, server fetches + validates `ns-version.js` | none (a hosted page needs none) | `~` |
| H4 | the popularity source: none (matcher is OFFLINE, FULL STOP; the browser gate treats the URL as a tripwire) | none (no request path) | `=` |
| H5 | single-user localhost origin | public origin, browser cache is the only delivery mechanism | `=` |

### I. Code quality and process

| # | desktop | web | rating |
|---|---|---|---|
| I1 | 23 modules / 5,956 lines JS + 13 Python modules / 12,487 lines | 8 modules / 5,184 lines, `app.js` = 2,923 lines (56% of the shell) | `D+` (the desktop's code is split by concern) |
| I2 | 582 Python tests + 20 JS engines + the browser gate cover both | same, but most JS-engine coverage is written against web modules | `=` |
| I3 | no cache tokens needed | tokens + `check_js_tokens.py` VERIFIED BASELINE + `check_catalog_token.py` + `pre_tag_check.py` | `W+` (more machinery because more can go wrong) |
| I4 | `build.ps1` release gate, PyInstaller, baked version | `web/build_web.py` derives the payload from the DB | `=` |

---

## 3. My own findings, ranked by severity

### F1 - The scoring grids do not agree, and nothing pins the difference *(medium)*

I reproduced CO-07 instead of trusting the note. Case: 2026-03-14, 47.5 N /
11.0 E, astronomical dusk 19:02:55, dawn 03:46:29, using the real core and both
real scoring paths (`logs/shell_divergence.mjs`):

```
desktop grid count 241   scoring clip i0..i1 71 157  -> nightN 87
web grid n 87  count 88  denominator (n+1) 88                        => delta 1 sample
rows differing: 12/14, worst |dPct| 1, worst |dScore| 0.070
```

`AGENTS.md` records the wider survey (20-66 of 200 standard rows, up to 4 pp).
The reason to leave it is sound - closing it moves user-visible web numbers -
but it is a measured behavioural difference, and the word "parity" should not
appear near it.

### F2 - The web silently drops 45 of the 200 standard objects from Tonight *(medium-high)*

`web/app.js:656-657` filters candidates with `o.vmag != null` while the comment
immediately above claims "Standard mode mirrors the desktop exactly: every
standard object is a Tonight candidate". Measured from the shipped data
(`catalog_data.standard_ids` + the shipped `POPULARITY` table):

```
standard top-200 rows with EMPTY vmag: 45
  IC 1396, Running Man, NGC 281, Flame, IC 410, Tulip, Simeis 147, Seagull,
  Double Cluster, Cave, Dolphin Head, Seahorse, Pipe Nebula, Witch Head, ...
web/catalog.json: 711 rows with vmag null (666 advanced, 45 standard)
```

The desktop applies no magnitude test to that set, so 22.5% of standard mode is
unreachable in the web's headline list. This is a comment contradicting the line
beneath it, and it has a user-visible effect.

### F3 - The web has no CSP in the repository *(medium, unverifiable host-side)*

`web/` contains no `.htaccess`, no `_headers`, and `build_web.py` emits none.
The desktop ships a strict, tested policy. A public origin whose only defence is
an inline-`unsafe-inline` boot script is a different risk class from a localhost
app, and I cannot see what `/astro` actually sends.

### F4 - `confirm()` survived in specific destructive paths *(low)*

Web: 4 delete/inform paths (`app.js:2189/2202/2223/2276`). Desktop:
`pano.js:366` (delete panorama) and `setup.js:190` (import replaces everything).
Both apps migrated *some* destructive confirmations to in-page dialogs and left
others; the two most consequential ones (replace-all-import, delete-panorama)
are still native on the desktop.

### F5 - The desktop re-implements the scoring loop outside `core/` *(low-medium)*

`derive.js::recomputeNightDerived` recomputes visibility, the clear window, the
percentages and the moon penalty over the payload, while `core/scoring.js`
already provides `scoreNightTracks`/`nightStats` and the web uses it. The two
implementations agree on the curves (pinned by the `scoring` engine) but not on
the surrounding loop - which is exactly where F1 lives. Routing the desktop
through `scoreNightTracks` would make the grid anchor the only remaining
variable instead of one of two.

### F6 - Accessibility coverage is symmetric but implemented on opposite sides *(informational)*

Desktop puts ARIA in `static/index.html`; the web emits it from `app.js`. Both
land at `role="dialog" aria-modal="true" aria-labelledby`. The only structural
gap: the web has no shared focus trap (`initFocusTrap` exists only on the
desktop), and the desktop has no `ResizeObserver`-driven canvas resizing
(3 instances in `web/horizon.js`, 0 in `static/js/pano.js`).

---

## 4. Ratings summary

| area | winner | why |
|---|---|---|
| astronomy/planning maths | tie | byte-identical, one guard, one reference authority |
| compute architecture | **desktop** | worker + generations + queueing + transferables + tested fallback |
| shared-code discipline | **web** | scores through core functions; desktop re-implements the loop |
| storage and backup integrity | **web** | stage-validate-commit + rollback beats best-effort safety copy |
| data delivery and cache safety | **web** | tokens, manifest and three guards |
| catalog correctness | **desktop** | keeps all 200 standard objects in the headline list |
| target-list features | **web** | min-visibility gate, per-row warm, more lists |
| panorama editor | **web** | undo/redo/history/dirty/unload guards, non-destructive crop |
| sky views | **web** | a real atlas with grids, constellation lines and a horizon silhouette |
| image pipeline | **desktop** | 3-tier chain, allowlist redirects, offline breaker, disk cache |
| security primitives | **desktop** (slightly) | CSP in-repo; the web's is host-side and unverifiable |
| accessibility | tie | same semantics, mirrored placement; one shared focus trap each way |
| feature breadth | **web** | covers more of the product with 13% fewer JS lines |
| code organisation | **desktop** | 23 focused modules vs a 2,923-line `app.js` |
| release/cache process | **web** | the token baseline machinery exists only because the web needs it |
| **overall: more sophisticated** | **web** | significantly more capability per line, with genuinely better-designed backup and horizon-editor state handling |
| **overall: better engineered where it is hard** | **desktop** | concurrency, image fetching and defensive IO are deeper |

The two shells are not one product implemented twice; they are two products
sharing one mathematics library. That is a legitimate architecture - but only
the maths is guaranteed to agree, which is why F1 and F2 exist and why neither
guard suite noticed them.
