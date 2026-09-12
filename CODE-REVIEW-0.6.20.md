# Code review - NightSeam 0.6.20 (post shared-core migration)

- **Scope/version:** HEAD `1b7f64a` (`v0.6.20-2-g1b7f64a`; tag `v0.6.20` on
  `2c6a72e`, then two test/docs-only commits). Whole tree reviewed; newest
  surfaces (core/, worker, reference-anchor suite, release tooling) first.
- **Method:** six parallel read-only subagents (A core, B desktop+worker,
  C web, D Python, E tests/guards, F tooling/docs), then parent reconciliation:
  every S2/S3 claim and all cross-agent conflicts were re-checked against the
  code by the parent (`file:line` below). No code was modified; this file is the
  only write.
- **Commands used for evidence:** `node tests/js/reference_anchors.mjs` (19/19),
  `python -m pytest tests/ -q` (410 passed), targeted `rg`/`git log -S`,
  `python scripts/check_core.py`, `node tests/js/*.mjs`, `python -m pytest
  tests/test_api.py tests/test_backup.py` (90 passed). No build/tag/deploy.
- **Severity legend:** S1 blocker (data loss / wrong result for normal use) -
  **none found**; S2 high; S3 medium; S4 low/defensive.
- **Confidence:** confirmed (code/repro) | likely (mechanism + strong inference)
  | potential (needs a specific trigger) | unclear.

## Findings table

| ID | Sev | Area | Finding | Conf | Phase |
| --- | --- | --- | --- | --- | --- |
| DS1 | S2 | desktop/worker | A `prefs` message cancels an in-flight worker night build; the load is lost and the busy chip never clears | confirmed | migration (0.6.19) |
| WB1 | S2 | web/horizon | `save()` swallows quota errors; Save reports "Saved" and the edit is lost on reload | confirmed | pre-existing |
| CR1 | S3 | core/planning | `pickDarkWindow` polar fallback reads the wall clock; `web/app.js:2504` calls it without the site noon | confirmed | migration |
| DS2 | S3 | desktop/worker | Catalog caches are never invalidated (add/delete custom target); worker binds tracks by index and ignores `res.ids` | confirmed | migration |
| DS3 | S3 | desktop/planning | Sync-path cache key omits `tzMin` and profile content (timezone change / horizon repaint serves stale payload on the sync fallback) | confirmed | pre-existing + migration |
| WB2 | S3 | web/cache | `astro.js?v=7` / `nightrank.js?v=4` import tokens were never bumped when their contents changed | confirmed | migration (Phase 2) |
| WB3 | S3 | web/app | Rig picker/frame % never refreshed after Setup edits or a backup import | confirmed | pre-existing |
| WB4 | S3 | web/storage | Multi-tab last-writer-wins on the single `nightseam_panos_v1` blob; no `storage` listener | confirmed | pre-existing |
| PY1 | S3 | app/db | `import_bundle` stores panorama `profile`/`profile_top` unvalidated; a non-720 array fails OPEN at planning time | confirmed | pre-existing |
| PY2 | S3 | app/db | Imported settings are opaque; `bortle: null` makes `/api/state` 500 and the desktop UI never boots | confirmed | pre-existing |
| TS1 | S3 | tests | Desktop/web "parity" engines now compare core with itself; the size test has no absolute values | confirmed | migration |
| TS2 | S3 | scripts | `check_core.py` MOVED list is out of sync with `core/index.js` (scrubWindowMs, computeNightTracks, scoreNightTracks, nightStatsBatch, popularityFactor) | confirmed | migration |
| TS3 | S3 | scripts | Moved-concept regexes are evadable (`async def`, arrow functions, object methods) | confirmed | pre-existing |
| TS4 | S3 | core tests | Load-bearing exports have no tests: `sizeArcmin`, `fmtFov`, `fmtFovPair`, `searchBlob`, `isCustomId`, `clearMask`, `wrapsFor`, `sunCrossings` | confirmed | migration |
| TS5 | S3 | tests | Reference-anchor mutation proofs cover forward precession etc. but not `iau2006_inverse` (first-occurrence replace) and not JD | confirmed | migration |
| TS6 | S3 | tests | Node-less machines silently skip the entire astronomy correctness authority (`pytest.skip`) | confirmed | pre-existing |
| TL1 | S3 | release | `make_release.py` calls `evaluate(collect())` without `check_core_findings()`, so its "ok" cannot see core drift | confirmed | migration |
| TL2 | S3 | docs | AGENTS cache-token register is stale (55/37/14/16/14 vs actual 56/38/17/15/15) | confirmed | migration |
| TL3 | S3 | scripts | Catalog-token guard only inspects the dirty tree; a committed catalog change with an un-bumped `CATALOG_TOKEN` passes | confirmed | migration |
| TL4 | S3 | build | PyInstaller rewrites the tracked `NightSeam.spec` in CWD; `pyinstaller>=6.0` unpinned | confirmed regen | inherited |
| TL5 | S3 | release | A stale `web/version.json` is only a WARNING and is user-visible after deploy | confirmed | pre-existing |
| CR2 | S4 | core/horizon | `visibleSkyBands`/`skyBandPolygons` throw on malformed records instead of degrading | confirmed throw | migration |
| CR3 | S4 | core/horizon | FOV-edge half-bin convention mismatch (`rel > fov` in the preview vs `d > fov` in scoring/`ceilFor`) | confirmed | migration |
| CR4 | S4 | core/planning,time | `scrubWindowMs({})` silently builds a 1970 window; `offsetEastMin` drops offset seconds | confirmed | migration |
| CR5 | S4 | core/shell comments | Comments still call the deleted Python modules "the authoritative oracle" | confirmed | migration |
| CR6 | S4 | core comments | Wrong comments: scoring log10/log5.2 example, "bin centre" that is the lower edge | confirmed | migration |
| CR7 | S4 | core/shell | Dead exports/shim: `static/js/astro.js` has no production importer; several core exports have no consumer | confirmed | migration |
| DS4 | S4 | worker | Worker vs sync diverge on `max_alt`/`max_i` (rounded vs raw argmax) and occasional ceil bin | confirmed | migration |
| DS5 | S4 | worker | `onerror` marks broken but keeps the dead Worker; revival hook cannot recover it | confirmed | migration |
| DS6 | S4 | tests/harness | Worker kill/revive hooks and `buildClientDetail` margins are claimed pinned but no test exercises them; `astro_parity` "desktop"/"ceil" engines are dead | confirmed | migration |
| WB5 | S4 | web/import | Pano import: unbounded strokes, no token/uniqueness check on ids, orphaned IDB photos | confirmed code | pre-existing |
| WB6 | S4 | web/IDB | No `blocked`/`versionchange` handling; a rejected open is cached for the session | confirmed code | pre-existing |
| WB7 | S4 | web/backup | Bundle schema `version` ignored; a bundle without a pano section wipes horizons | potential | pre-existing |
| WB8 | S4 | web/derive | `filterAdvice` duplicated between `web/horizon.js` and `static/js/derive.js` | confirmed | pre-existing |
| PY3 | S4 | app/server | NaN/Infinity accepted by settings/rig/pano numeric fields; `allow_nan=False` then 500s the state route | confirmed mechanics | pre-existing |
| PY4 | S4 | app/db | Imported custom ids bypass the `u_` rule; duplicate ids can enter `/api/catalog` | confirmed | pre-existing |
| PY5 | S4 | app/comments | Stale `/api/night` references and `NEG_TTL` doc mismatch | confirmed | migration/prose |
| PY6 | S4 | app/security | `Origin: null` skips the host comparison; TLS "exact host" context also covers redirect targets | potential | pre-existing |
| TS7 | S4 | fixtures | `core_fixtures.mjs` `has()` gates let a missing export silently skip a whole fixture section | confirmed | migration |
| TS9 | S4 | tests | The LA DST golden enshrines the documented local-noon sampling quirk; no spring-forward night test | confirmed | pre-existing |
| TS10 | S4 | tests | `test_pre_tag_check.py` still exercises 0.6.11 as "current" | confirmed | pre-existing |
| TL6 | S4 | docs | README says Shift=10 min (actual 60) and duplicates a bullet | confirmed | pre-existing |
| TL7 | S4 | docs | DESIGN `--bg` value mismatch; `check_js.py` docstring says four checks, runs six | confirmed | pre-existing |
| TL8 | S4 | hygiene | `static/js/targets.js` mixed EOL; old root audits not linked from AGENTS | confirmed | pre-existing |
| TL9 | S4 | docs | `phase-c-report.md` ends at "403 passed" (now 410) | confirmed | inherited |

## S2/S3 detail (parent-verified)

**DS1 - prefs vs night race.** `static/js/planning_client.js:250-251` gates
`requestPrefsDerived()` only on `S.night._derivedReady` + worker usability; during
a *new* load `S.night` is the previous payload, so the gate passes.
`static/js/planning_worker.js:30` sets `latestGen = m.gen` for BOTH message
types, so `runNight`'s `isCurrent()` (lines 95/132/157) turns false mid-build and
it answers `cancelled`; `ask` rejects `SupersededError`
(`planning_client.js:55`), `buildClientNight` rethrows it (line 168), and
`night.js:62-67` treats it as superseded and returns **without** `setBusy(false)`
and without a retry. Trigger: any preference input during a site/date change
(`header.js:67/80/107` dispatch `prefs:changed` per input; `main.js:100-107`).
Result: stuck spinner and the new plan never appears until another interaction.
Fix direction: per-type generations in the worker (prefs must never cancel
night), a guard while a night request is in flight, and busy-clear on a
current-generation supersede.

**WB1 - silent web save loss.** `web/horizon.js:122-132` wraps
`localStorage.setItem` in `try { } catch { /* ignore */ }`; `updatePano` cannot
throw; `saveSession` (`:995-1008`) therefore always reaches `status = 'saved'`.
The `'failed'` UI branch exists (`:743`, `:962-966`) but is unreachable. Strokes
are unbounded and panos accumulate, so quota exhaustion is the realistic path;
the user is told "Saved" and loses the horizon on reload.

**CR1 - nondeterministic polar fallback.** `core/planning.js:108-115` falls back
to `dayDate || new Date()` when no twilight level exists. `web/app.js:2504`
(`renderNightInfo`) calls `E.pickDarkWindow(info)` - no dayDate, no noon - so in
polar day/twilight the header chip reports `now+8h..now+16h` instead of the
selected night's site-zoned 20:00-04:00. The planner itself uses the correct
call (`app.js:162`, `:1578`). A pure core function reading the clock is also a
testability regression.

**DS2 - catalog staleness/identity.** `planning_client.js:110-118` returns
`_catCache` without re-checking `S.catalog`; the worker caches its own list
(`planning_worker.js:24,50-57`) with no reset message; `setup.js:220-228`
(`refreshCatalogMeta`) only rewrites `S.catalog`. Adding a custom target
therefore hides it from planning until reload; if the main and worker lists
diverge with EQUAL length, `bindWorkerNight` (`planning_client.js:195-239`)
checks only `n !== catalog.length` and never compares `res.ids`
(shipped at `planning_worker.js:172`) - tracks can be bound to the wrong id.
Fix direction: one `reloadCatalog()` invalidation path + an id check (or map) at
bind time.

**DS3 - sync cache key.** `planning_client.js:298-299` keys on
`[site.id, date, adv, panoId, pano.length]`. `setup.js` timezone changes reload
the night without a page reload; `pano.js` saves new strokes with the same
`panoId` and length 720. On the sync fallback the stale payload (wrong zone
anchor / pre-paint ceilings) is served. The worker path recomputes, so this hits
exactly when the worker is broken.

**WB2 - token discipline hole.** `web/app.js:11` still imports
`./astro.js?v=7` and `:17` `./nightrank.js?v=4`; `git log -S "astro.js?v="`
shows the token was set once (33c9241, 0.6.13) and never bumped although
`web/astro.js`/`web/nightrank.js` gained core imports (now `core.js?v=15`).
`CATALOG_TOKEN`/core-stub checks do not cover importer self-tokens, so a
returning visitor can execute a stale astronomy/scoring module against the new
`app.js`. `AGENTS.md:445-448` even documents the wrong current values.

**PY1/PY2 - import validation.** `database.import_bundle` (`:713-733`) stores
`profile`/`profile_top` verbatim while the PUT route validates via
`server.py:193 _check_profile`; a 719-value array is then treated as "no
horizon" by `planning_client.js:130-131` / `core/horizon.js` (fails OPEN).
Settings are inserted verbatim (`:771-774`) and `_effective_min_alt`
(`server.py:341`) does `float(db.setting("bortle", 4))`, so an imported
`bortle: null` 500s `/api/state` at boot.

**TS1/TS2/TS5 - guard and test quality.** `static/js/derive.js:9-39` and
`web/format.js` re-export core, so `astro_parity.mjs`'s `size`/`mag`/`scoring`/
`skyzoom`/`abovehorizon` engines compare a value with itself; only `size` lacks
absolute anchors (`test_js_parity.py:509-521` asserts `web == desktop` only).
`check_core.py:36-54` omits five current `core/index.js` exports, so a shell
re-definition is not flagged. `test_reference_anchors.py:_mutated_core` replaces
the FIRST `2306.2181 * t` (forward), leaving the inverse unproven; a neutered
inverse check would still pass (`ANCHOR_COUNT` only counts entries).

## Test-quality findings

1. **TS1** above: self-comparison engines; add hand-derived absolute strings or
   assert one side only. The scoring/mag/skyzoom engines are rescued by separate
   absolute tests; `size` is not.
2. **TS2** above: derive `MOVED` from `core/index.js` (with the documented
   `clearMask` exception) + a meta-test that every export is covered.
3. **TS3**: `^\s*def` misses `async def`, and JS detection misses arrows/methods;
   add patterns + a mutation proof per pattern.
4. **TS4**: untested exports listed in the table; a `core-refs.mjs` harness with
   absolute values would close most of it cheaply.
5. **TS5**: add inverse precession + JD mutations; assert the specific failed id.
6. **TS6**: `pytest.skip` on missing node makes a green suite meaningless for
   astronomy; prefer an explicit `NIGHTSEAM_REQUIRE_NODE=1` fail mode in CI and
   keep skip for dev machines.
7. **TS7**: `core_fixtures.mjs` `has()` gates and `zip(FX, got.get(key, []))`
   mean a missing export yields zero comparisons; make missing sections fail
   post-Phase C.
8. **TS9/TS10**: refresh the pre-tag test version; add a spring-forward night
   case for a western site.
9. **Coverage map** (direct tests): horizon - core_d1/pano_geom/sky_band/pano_ui;
   astro - reference_anchors (19) + core_fixtures; planning - pick/darkwindow/
   crosszone/scrubwindow/scrubgrid + scrub_degenerate + derive_window; scoring -
   scoring/nightstats + scoring_parity; visibility - abovehorizon/status/minalt;
   format - size/mag/skyzoom/frame; catalog - palette text only; time - timezone
   engine + IANA goldens. Gaps: format FOV helpers, catalog helpers, horizon
   `clearMask`/`wrapsFor`, worker/sync detail builders, advanced chunking.

## Tooling/docs findings

- **TL1** `make_release.py:66-68` skips `check_core_findings()`; its own
  "release check before/after staging: ok" cannot see core drift (the later
  `check_release.py` run does, so the documented order still blocks publish -
  the false assurance is the problem).
- **TL2** AGENTS register stale (see table); it is the only register for
  non-core tokens.
- **TL3** `check_catalog_token.py` uses `git diff HEAD`; once committed, a
  catalog change with an un-bumped token passes every guard.
- **TL4** `build.ps1:179-187` has no `--specpath`, so PyInstaller regenerates the
  tracked `NightSeam.spec` (byte-identical today with 6.22.2); a future
  template change dirties the tree mid-release. `requirements-dev.txt` has
  `pyinstaller>=6.0`.
- **TL5** stale `web/version.json` is a warning only; deploy scripts do not
  enforce the bake.
- **TL6-TL9** docs/hygiene as tabled (README 10 vs 60 min + duplicate bullet;
  DESIGN `#070a15` vs `#070a16`; mixed-EOL `targets.js`; old root audits;
  report counts stale).

## Polish backlog (no behavior)

- Comment sweep: delete/replace every "Python is the oracle"
  (`core/astro.js:10,47-49,162-163`, `core/planning.js:4-15`,
  `core/horizon.js:23-25,95-98,317`, `core/time.js:8-9`, `web/astro.js:1-7`,
  `static/js/astro.js`, `static/js/planning_client.js:128,141,290,376`,
  `app/server.py:1`, `app/database.py:376,443`, `static/js/main.js:70`).
- `core/scoring.js:54` log10 example; `core/horizon.js:95-96` "bin centre"
  wording; `app/images.py:8` NEG_TTL wording; `reference_anchors.mjs` synodic
  delta "~5.7e-7" -> 1.147e-6.
- Delete the dead shell shim `static/js/astro.js` (or relabel it as a test-only
  adapter) and the dead `astro_parity` desktop/`ceil` engines
  (`tests/js/astro_parity.mjs:47-51,238-255`).
- `planning_worker.js:125,143` computes an unused flat `ceil` array; `_nightCtl`
  signal is never passed anywhere; `invalidatePlanCache`/`clientWindows` have no
  callers.
- `web/format.js` unused exports (`fmtFov`, `fmtFovPair`); `webstore.js`
  `lastSafetySnapshot` dead; theme persisted twice
  (`nightseam_theme` + `prefs.theme`).
- `core/horizon.js::profileSegments` hardcodes `0.5` where `BIN_DEG` exists;
  `skyClampFocus` inverts its clamp for canvases < 44 px.
- ARCH-AUDIT/phase-c-report.md: add the 1b7f64a postscript (410 tests).

## Fine / leave alone

- Desktop static caching: `/js/` and the HTML are `Cache-Control: no-store`
  (`server.py:320-328`), so an exe update cannot serve stale JS; tokenless
  desktop is intentional and correct.
- No live server planning calls remain in `static/`; retired routes 404; legacy
  `planning_client_compute` backups import inertly; `image_dir` re-injection and
  `image_dir_ignored` intact.
- Path/ZIP safety (safe_rel/safe_join/safe_token, no `extractall`, 1 GiB caps),
  upload size caps, offline image breaker, exact-host TLS allow-list.
- Append-only DB migrations; `observations` untouched; `import_batches` cleared;
  safety backup before restore.
- Core purity (`check_core.py` OK) and reference-anchor correctness (19/19).
- Worker transferables/generation uniqueness, `night.js` supersession checks,
  half-open window contract (`windowEndISO`), backup staging/rollback and
  `hasImage` truthfulness, D1/D2 adapters, catalog token + manifest pairing.

## Could not determine

- Whether CR3's <=0.5 deg FOV-edge mismatch is user-visible in the editors (no
  browser in this environment).
- Whether WB7's missing-pano-section backup exists in the wild.
- Real WebView2 worker crash frequency (DS5 impact is bounded by the sync path).
- Which CI, if any, runs the suite, so TS6's real-world weight is unknown.
- Full end-to-end reproduction of PY2/PY3 through a crafted live import (the
  mechanics were verified in isolation; a live run would require writing a
  crafted DB/ZIP, which this review did not do).

## Bounded fix plan (owner-approved work items; no implementation here)

| WI | Scope | Tests | Risk |
| --- | --- | --- | --- |
| FIX-1 worker lifecycle | separate night/prefs generations in `planning_worker.js`; gate `requestPrefsDerived` while a night request is in flight; terminate/null on `onerror`; clear busy on a current-gen supersede (`night.js`) | new fake-Worker node harness + extend `night_race.mjs` | medium (worker semantics) |
| FIX-2 catalog identity | `setup.js` invalidation path; worker `catalog-reset`; bind by `res.ids`/Map | harness asserting add/delete of custom targets | medium |
| FIX-3 payload determinism | include `tzMin` + profile revision in the sync cache key; align worker/sync `max_alt`/ceil (raw argmax or ship it) | numeric sync-vs-worker fixture test | low |
| FIX-4 import validation | sanitize pano profiles in `import_bundle` with `_check_profile` rules; validate/clamp imported settings; enforce `u_` custom ids | `test_backup.py` crafted-bundle cases | medium (data) |
| FIX-5 web save durability | `horizon.js::save()` returns/throws; `saveSession` surfaces `failed`; keep dirty baseline | extend `web_backup.mjs`/`pano_ui.mjs` | low |
| FIX-6 core determinism | `pickDarkWindow`/`scrubWindowMs` require an anchor or return null; fix `web/app.js:2504` | `astro_parity` polar cases | low |
| FIX-7 cache/token integrity | bump `astro.js`/`nightrank.js` tokens; update AGENTS register; extend core checker to pin importer self-tokens; committed-change check for `CATALOG_TOKEN`; make stale `web/version.json` an error | `test_cache_tokens.py` mutations | low |
| FIX-8 guard/test hardening | derive `MOVED` from `core/index.js`; async/arrow regexes + mutations; inverse/JD anchor mutations; absolute `size` values; fail missing fixture sections; untested-export harness | guard mutation tests | low |
| FIX-9 release tooling | call `check_core_findings` from `make_release`; `--specpath` + pin PyInstaller | `test_release_check.py` | low |
| FIX-10 S4 security/robustness | finite-number validation (settings/rig/pano), `Origin: null`, redirect TLS, WB5/WB6/WB7 hardening | route + web harness cases | medium |
| FIX-11 docs/comments/polish | the POLISH list + README/DESIGN/report corrections | `check_encoding` + textual pins | trivial |

Suggested ordering: FIX-1 -> FIX-2 -> FIX-4 -> FIX-3/FIX-6 -> FIX-5/FIX-7 ->
FIX-8/FIX-9 -> FIX-10/FIX-11. One work item per commit; each ends with the full
suite (`410 passed`) and `python scripts/check_js.py`.

## Recommended next actions (ranked)

1. **FIX-1** - the only S2 with a normal-use trigger (stuck busy + lost plan).
2. **FIX-2** - stale catalog / wrong-id binding is the highest data-correctness
   risk in the newest code.
3. **FIX-4** - an unvalidated import can silently fail planning open; pair with
   PY2 so a bad bundle cannot brick boot.
4. **FIX-6** + **FIX-3** - small, deterministic wins on the newest surfaces.
5. **FIX-5** and **FIX-7** - data-loss presentation and cache integrity.
6. **FIX-8/FIX-9** - close the guard gaps that let the above hide.
7. **FIX-10/FIX-11** - defense-in-depth and comment/doc truth.

No S1 was found; nothing here argues for moving tag `v0.6.20` or cutting an
emergency release.
