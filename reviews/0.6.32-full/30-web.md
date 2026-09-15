# Web lane - web planner (web/)

Subject: `v0.6.32-3-g3277846` (HEAD 3277846), tree clean except the untracked
`REVIEW-PROMPT.md` and `reviews/0.6.32-full/`. Scope: `web/` behaviour - the
state model of `app.js`, `webstore.js` persistence, the backup round trip, the
panorama editor's edit/commit model, caching/network and failure UX. Layout,
contrast and viewport judgement belong to the UI lane; doc wording to the docs
lane.

## What I checked (and how)

Read: `web/app.js` (2866 lines, state map first: `S.skyTime`, site, date, rig,
filters, mode, panorama, theme), `web/webstore.js` (all 418), `web/horizon.js`
(all 1418), `web/index.html`, `tests/js/web_backup.mjs`, `tests/js/pano_ui.mjs`,
`git show c430983` (to date the wiki-image change).

Executed - probes and logs in `reviews/0.6.32-full/evidence/web/`:
`build_probe_app.py` generates `app-probe.mjs` from `web/app.js` with only the
relative import specifiers retargeted and test hooks appended (every function
body is the shipped one), then `node web_probe.mjs` (**19 pass, 3 defect-FAILs**,
log `probe-web.log`) drives the real `loadWikiThumb`, `restoreBackup`,
`writeStaged`, `getRigs`, `reinitUserData` and the horizon history API against a
fake IndexedDB/DOM; `node web_probe_idb_denied.mjs throw-open|error-open`
(`probe-idb-denied.log`) runs `boot()` with site storage denied;
`node web_probe_boot.mjs [catalog-fail]` (`probe-boot.log`) runs the real
`boot()` plus a topbar date change; `node web_probe_editor.mjs`
(`probe-editor.log`) runs the real `renderHorizon`/`wireEditor`/
`horizonUnsaved`/`flushHorizonEdits` on a stub canvas. Also
`tests/js/web_backup.mjs` + `tests/js/pano_ui.mjs` (pass),
`check_catalog_token.py` and `check_js_tokens.py` (OK).

Limit: **no real browser**. Chromium/Playwright need named pipes that this
sandbox denies and this delegated lane cannot escalate (approval prompts are
disabled; `check_browser.py --web` exits 2 here), so every CONFIRMED item below
was observed by executing the shipped modules in Node - the technique
`tests/js/*.mjs` already uses - never in Chrome.

## Findings

### WE-01 medium CONFIRMED - an offline/timed-out Wikipedia lookup is cached as a DEFINITIVE "no photo" for 30 days (regression in 0.6.32)
- `web/app.js:483` (`let transient = false;`), `:509-513` (`const definitive = !transient; if (definitive) await idbSet(key, { missing: true, ... })`)
- **impact**: 194 of 12,176 objects ship a bundled photo, so nearly every detail view takes this path. One offline open, a DNS failure, or the 12 s abort on a slow link writes `{missing:true}` into the browser image cache and tells the user "no photo on Wikipedia"; the app then repeats that for 30 days without retrying.
- **mechanism**: `transient` is only raised for a non-ok HTTP status or a non-image body, so a *rejected* `fetch`/abort falls straight into `catch` and is treated as definitive. Pre-0.6.32 the flag was inverted (`let definitive = false;`, set only for 404/no-thumb/no-img/bad-type), so a network failure was NOT cached - c430983 flipped the polarity.
- **evidence**: `node web_probe.mjs` -> `fetch=reject: cached={"missing":true,...} | message="no photo on Wikipedia — see the link below"` (assertion written inverted, so this FAIL line proves it); controls: 429 caches nothing and says "photo unavailable right now", 404 caches as definitive, disambiguation-then-image resolves.
- **repro**: open any object without a bundled photo while offline (or block `en.wikipedia.org`), then reload online - the detail view keeps claiming there is no photo.
- **requiredFix**: set `transient = true` whenever the request itself failed (wrap each `await fetch(...)`, or in `catch` when the error is not the deliberate `no-thumb`/`bad-type`/`no-img` throw) and skip the `missing` write for those.
- **counterArgument**: the TTL is 30 days and the "Wikipedia ↗" link still works, so the damage is a missing convenience, not a wrong plan. But the comment above the line and the 0.6.32 invariant in `AGENTS.md` both claim only definitive failures are remembered, and 0.6.31 did it correctly.

### WE-02 medium CONFIRMED - `restoreBackup` writes the user records before the panorama section is validated; the documented "atomic" claim does not hold
- `web/webstore.js:352-361` (`panos` validated only as `typeof === 'object'`), `:389-403`; caller `web/app.js:2202-2211`
- **impact**: a bundle with an unusable panorama section is rejected only *after* sites/rigs/targets were cleared and rewritten. `app.js` normally compensates with `applyWebSnapshot(current, current)`, but that pass runs the same panorama write: if it fails (localStorage at quota -> `applyPanosSnapshot` returns false, `horizon.js:300-303`) the inner `catch {}` swallows it, the rejected bundle's records stay and the user is only told "Import failed".
- **mechanism**: `stageBackup` treats `panos` as opaque; `Hor.normalizePanos` runs in `applyWebSnapshot` after `WS.restoreBackup` has already written.
- **evidence**: `web_probe.mjs` P2 -> `staged.panos=null | normalizePanos(...)=null | sites now=["evil"]` (the pre-existing site was replaced before the caller could reject it); a failing `put` does roll back correctly (`sites=keep`).
- **repro**: import a backup with valid `sites` and `"panos": "oops"`; inspect IndexedDB after the "Import failed" alert.
- **requiredFix**: include the panorama section in the staged validation (`stageBackup` requiring `Array.isArray(data.panos.panos)`, or calling `Hor.normalizePanos` before `WS.restoreBackup`).
- **counterArgument**: the only caller does compensate, and the residual failure needs localStorage to be at quota at that moment - a reviewer could call this hardening. It is filed because the invariant is what makes callers trust the function and the failure mode is silent record replacement.

### WE-03 low CONFIRMED - `writeStaged` ignores a failed `clearStore`, so a restore can report success and merge old + new records
- `web/webstore.js:368` (clear results dropped), `:373-376` (only `set` results checked)
- **impact**: a clear that fails while the puts succeed leaves the previous records beside the imported ones (ghost sites/rigs/targets) and no error is reported anywhere.
- **evidence**: `web_probe.mjs` P2 -> `failed clear -> restore "succeeded"=true, sites=["evil","keep"]`.
- **repro**: inject one failing `clear()` (`CTL.failClear.sites = 1`) then call `restoreBackup`.
- **requiredFix**: check the clear results and throw, so the caller's rollback engages.
- **counterArgument**: a bare `clear()` failure with successful `put`s is rare (an aborted transaction fails both), so this is robustness rather than a case users hit today.

### WE-04 medium CONFIRMED - custom targets dropped by a backup import stay in the catalog until a page reload
- `web/app.js:2423-2430` (`reinitUserData` only upserts), `:1915-1920` (`upsertTarget` never removes), call site `:2247`
- **impact**: after "Import backup" the Setup -> Targets pane and the live Targets list disagree: targets the backup did not contain are still listed, searchable, clickable (their detail view opens) and drawn in the sky chart until a reload - exactly when the user expects the browser data to have been replaced.
- **evidence**: `web_probe.mjs` P3 (real `reinitUserData`) -> `catalog after the import: ["u_old","u_new"] | store: ["u_new"]`.
- **repro**: add target A, export, add B, import the first backup -> A is still listed.
- **requiredFix**: in `reinitUserData`, drop the previously added custom entries (`CAT = CAT.filter((o) => !o.custom)` plus their `byId` keys) before re-upserting the store's targets.
- **counterArgument**: nothing stale is written back (`collectBackup` reads the store) and a reload clears it, so it is a contradictory list, not lost data.

### WE-05 medium CONFIRMED - any preference/site/date change while the panorama editor is open silently discards the unsaved paint
- `web/horizon.js:802` (`const hist = newHistory(p)`), `web/app.js:1901-1912` (`refreshView`), `:551-555` (`renderHorizonView`); triggers `:2557-2560` site, `:2579-2586` min-alt, `:2593-2604` date, `:2744` moon-aware, `:2760-2763` filters/size unit, `:2764-2767` rig, `:2752-2759` Bortle, `:2741` timezone, `:2125` quick-site
- **impact**: edits live in memory until Save; the re-render rebuilds the editor session with `newHistory(p)`, whose baseline is the CURRENT (unsaved) state, so the chip flips from "● Unsaved changes" to "Saved", `horizonUnsaved()` becomes false, and both `route()`'s `flushHorizonEdits()` and the `beforeunload` guard skip - the paint is gone on the next reload. `AGENTS.md` promises the opposite ("never lose an edit").
- **evidence**: `node web_probe_editor.mjs` (real `renderHorizon`+`wireEditor`) -> `after the re-render: horizonUnsaved()=false, stored strokes=0`; after `flushHorizonEdits()` `stored strokes=0`; `web_probe.mjs` P5 shows the same at the history-API level and that the undo stack is reset to one entry.
- **repro**: Horizon tab -> paint -> drag the topbar min-alt slider and release (or change site/date/Bortle) -> chip says "Saved" -> reload -> paint gone.
- **requiredFix**: keep the baseline from the persisted record instead of `newHistory` on a dirty in-memory pano, or call `flushHorizonEdits()` at the top of `renderHorizonView()`.
- **counterArgument**: a user who only paints and presses Save is unaffected, and the edit is not half-applied to planning (the same object backs `activePano()`); the loss needs another control to be touched before reloading.

### WE-06 medium CONFIRMED - when IndexedDB is unavailable the app dies on the splash with no view and no retry
- `web/webstore.js:84-96` (`all()` has no `try/catch`, unlike `get`/`set`/`del`), `web/app.js:2524` (`SITES = await WS.getSites();`, unguarded), `:533-536` (`hideSplash`), `:2862-2863` (`route()` is reached only at the end of `boot`)
- **impact**: in a browser that denies site storage the catalogue loads, then `boot()` rejects: no view is ever rendered, `#splash` spins forever, the tabs are inert (no `hashchange` listener was registered) and the only feedback is a 15 s `unhandledrejection` banner naming a `SecurityError`. A failing/offline catalogue fetch hits the same dead end, with the splash text "catalog failed to load: …".
- **evidence**: `node web_probe_idb_denied.mjs throw-open` and `error-open` -> `boot() -> SecurityError … | #splash.style.display="" | #splash-text="catalog ready · 0 objects"`; `web_probe_boot.mjs catalog-fail` -> `#splash-text="catalog failed to load: Failed to fetch"`.
- **repro**: load `web/` where `indexedDB.open` throws (probe `CTL.open='throw-open'`), or offline on the first load.
- **requiredFix**: wrap the user-data part of `boot()` (or make `all()` degrade with a flag) and always end boot with either a rendered view or an explicit error card naming the cause plus a retry.
- **counterArgument**: Chrome/Firefox private windows do allow IndexedDB, so this needs an unusual configuration, and the offline variant is inherent to a static site without a service worker - hence medium rather than high.

### WE-07 low CONFIRMED - the topbar scrub keeps the previous night's time after a date (or site) change
- `web/app.js:2607-2631` (`syncScrub` runs only at boot and on `sky:time`), `:1901-1905` (`refreshView` -> `clampSkyTime`), `:218-224` (moves `S.skyTime`, dispatches nothing)
- **impact**: after changing "night of" or the site, `S.skyTime` is re-clamped but the always-visible `#tb-scrub-time` label and the slider position keep the old instant, contradicting the Tonight card and Sky View, which do update.
- **evidence**: `node web_probe_boot.mjs` -> boot `S.skyTime=…17:51Z (19:51)`, `#tb-scrub-time="19:51"`; after `#tb-date` -> next night `S.skyTime=…17:17Z (19:17)` but `#tb-scrub-time="19:51"` and `scrub.value` unchanged (32/684).
- **repro**: set the topbar date to tomorrow and read the scrub label.
- **requiredFix**: dispatch `sky:time` (or call `syncScrub`) after `clampSkyTime()` in `refreshView()`.
- **counterArgument**: display-only - every computed result uses `S.skyTime` - and it self-corrects on the first scrub or tab change.

## Refuted (claims I checked that are NOT bugs)

- **`getRigs()` degree -> arcmin conversion compounding**: the adapter mutates the structured clone it just read, so the store keeps its legacy value and conversion runs once per load. `web_probe.mjs` P6: `first load fov_w=76.560 arcmin, fov_unit=arcmin; second load fov_w=76.560`; `fov_unit` also survives `stageBackup`, and both save paths write `fov_unit:'arcmin'`.
- **A re-render losing the paint entirely**: `renderHorizon` mutates the same object `db.panos` holds, so a re-render redraws the unsaved strokes - only the dirty *flag* is lost (WE-05).
- **Editor history contract** (one entry per gesture, bounded `HISTORY_LIMIT`, redo invalidation, zoom presentation-only, dirty-clear on undo, `beforeunload`, flush on switch/create/delete/navigate): `node tests/js/pano_ui.mjs` passes and my P8 exercised the same API; the documented call sites exist in `app.js`.
- **The 0.6.32 Wikipedia designation lookup itself**: `wikiTitles()` order, the disambiguation skip and the canonical-link rewrite work (`web_probe.mjs` P1 `disambig-then-image`: title 1 is a disambiguation page, `NGC 5457` resolves, `#d-wikilink` becomes `.../wiki/Pinwheel_Galaxy`).
- **Cache tokens / catalogue fetch**: exactly one `catalog.json?v=9` fetch, manifest matches (`check_catalog_token.py` OK), per-module tokens baseline-consistent (`check_js_tokens.py` OK, self-test OK); the only `cache:'no-store'` in `web/` is `version.json` (`webstore.js:273`).
- **A partial `datetime-local` value corrupting `S.skyTime`** (`app.js:1247-1249`): the value is `''` while incomplete and the handler is guarded by `if (v)`.
- **Dropped IndexedDB connections + the per-render anonymous `window` `pointerup` listener in `renderSky`**: real resource growth, no user-visible effect (the re-added handler only clears a module-level drag object) - not filed.
- **The live the popularity source fetch** (`app.js:96-105`): deliberate and documented, only a silent tiebreaker; standard-mode selection uses the shipped `_adv` flag. Disclosure is the privacy lane's question.
- **`clampSkyTime()` at boot/mid-day**: confirmed working - the boot probe's first `S.skyTime` sits inside the night window (19:51), not at the wall clock.

## Not checked (honest coverage gaps)

- **No real browser** (see the limit above): canvas/DPR drawing, real IndexedDB quota errors, the cross-tab `storage` reload, cached-module staleness and offline behaviour are unverified; every finding that would need a browser says so.
- Real quota exhaustion (I simulated write failures), and `lastSafetySnapshot()` - no UI consumes it; I did not establish whether that is intended.
- Editor performance with a very large photo or tens of thousands of strokes, and the 4 MB catalogue fetch profile (perf lane).
- UI/visual questions (layout, contrast, viewports, the canvas at 360 px) - deliberately the UI lane's; WE-05/WE-07 are behavioural causes it may see as symptoms.
