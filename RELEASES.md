# RELEASES.md - what each release shipped and how it was verified

The per-release records moved out of `AGENTS.md` (which had grown past the
workspace instruction budget and was being truncated). `AGENTS.md` keeps the
release PROCESS; this file keeps the RESULT of each release: tag, staged
artifact hashes, gate results, what was deployed and how it was verified live.

Newest first.

## UNRELEASED - 2026-09-27 packaged Image Catalog shell

Not staged, tagged, or deployed. The standard packaged desktop now launches a
dedicated Image Catalog shell with Library, Import Exposures, and the fixed
archive Sky Map. The legacy desktop planner remains available from source and
with `--planner`; the web planner and shared `core/` were unchanged. Catalog
startup skips planner image prefetch, and catalog-only mode does not serve the
planner shell at `/index.html` or expose the planner's object-image and update
check routes. Those optional remote routes return 404 before network work. A
planner request handed to an active catalog-only instance shows a
close-and-relaunch notice instead of a blank route.

Validation of this working-tree snapshot:

- `python -m pytest tests/ -q --tb=no` -> **658 passed, 1 warning** in 274.59s.
- `python -m pytest tests/test_desktop_catalog_mode.py tests/test_main.py -q`
  -> **18 passed, 1 warning**.
- `python scripts/check_js.py` -> **OK**; its 25 heuristic undefined-call
  candidates are non-failing diagnostics.
- `python scripts/check_encoding.py` and `git diff --check` -> **OK**.
- `python scripts/check_browser.py --desktop` against the final executable
  -> **16/16 passed** (15 legacy planner checks and the catalog-only flow).
- `python scripts/check_browser.py --desktop --only desktop-catalog-only-launch`
  -> **1/1 passed**.
- `build.ps1 -AllowDirty` produced `dist\NightSeam.exe` (20.5 MB), version
  `0.6.34-9-gd9f4f3a-dirty`. `app/_version_baked.py` remained unchanged.

No release archive was created and no clean-tag or deployment claim is made.

## UNRELEASED - 2026-09-20 review implementation pass (final validation)

Not tagged or deployed. This pass covered planner invalidation, panorama
editing/persistence, backup restore safety, weather retry, theme module
tracking, target explainability/transit data, richer horizon metadata, and
catalog provenance/reproducible exports. The separate environmental tool was
intentionally outside its scope.

Validation of the final dirty working-tree snapshot:

- `python -m pytest tests/ -q --tb=no` -> **641 passed, 1 warning**.
- `python scripts/check_core.py` and `python scripts/check_js.py` -> **OK**.
- Browser gate -> **32/32 passed**, covering both shells, Workbench/Glass,
  horizon metadata, catalog provenance, and accessibility smoke checks.
- `build.ps1 -AllowDirty` produced `0.6.34-5-gd6e115c-dirty`.
- `python scripts/make_release.py --allow-dirty` produced
  `dist/release/NightSeam-0.6.34-5-gd6e115c-dirty.zip` (23.4 MB), SHA-256
  `a80fb785c1c0d491f1cdd9f3f64c45bcac8faf6d1f5636c361a77852db0dda47`.
- `python scripts/check_release.py --allow-dirty` -> zero errors and one
  expected dirty/off-tag warning.

The accessibility foundation adds semantic tab state, chart text alternatives,
visible focus styling, high-contrast/reduced-motion rules, and Escape dismissal
for the web dialog. Horizon metadata is carried through both shells, backup,
SQLite, shared history, and the profile comparison UI. Catalog provenance is a
deterministic 12,176-row sidecar with source hashes, aliases, designation
history, mapping notes, and complete JSON export actions. A full manual
screen-reader/focus-restoration audit remains open; no clean tag or deployment
was made.

Elevation semantics and the solar-system ephemeris policy remain explicit
maintainer decisions before their decision-dependent features are implemented.

> **Post-release audit note (2026-09-17).** Six unresolved findings discovered
> after 0.6.33 are tracked in `BUGS.md`. In particular, the live HTML document
> still lacks CSP even though `version.json` carries the policy, and the relaxed
> production smoke does not establish document protection. This note does not
> rewrite what the 0.6.33 release ran or observed; fixes belong in the next
> release entry when they ship. **All six shipped in 0.6.34 (below).**

## UNRELEASED - 0.6.35 working tree (2026-09-19)

**Not tagged.** The four items `BUGS.md` had been carrying since the 0.6.20/0.6.24
reviews (`CR2`, `DS4`, `DS5`, `WB7`) were reassessed and closed. All four were
severity S4 ("migration") originally; the reassessment CONFIRMED two and REFINED
two, and in both refined cases the original note was imprecise in a way that
mattered.

**Workbench theme redesign.** The new `workbench` theme is now the default for
the desktop app and web planner, with the landing page following the same
graphite/brass visual language. The existing `dome` Glass theme remains
selectable from Appearance. Legacy `classic`, empty, and unknown values migrate
to Workbench; desktop settings and web backups preserve the canonical `dome` or
`workbench` value. The Tonight surfaces gained the shared session brief,
booked-night track, chart-first target layout, and side inspector treatment.
The implementation is scoped to `app/theme.py`, the two theme stylesheets,
`landing/style.css`, and the existing shell controls; astronomy, planning, and
catalog behavior did not change.

**Workbench verification.** `python scripts/check_js.py` -> OK.
`python -m pytest tests/ -q --tb=no` -> **626 passed, 0 failed**. Manual live
smoke checks covered the desktop and browser planner shells in both the default
Workbench presentation and the selectable Glass presentation.

**Beta deployment.** The current `web/` tree was uploaded to the isolated
`/beta/` remote directory and is live at
`https://www.nightseam.de/beta/`. The live page reports the catalog ready with
12,176 objects and `data-theme="workbench"`; production `/astro/` and the
landing page were not changed for that theme deployment. The repository Playwright gate could not start in
this Windows sandbox (`WinError 5` while creating its browser subprocess), so
the deployed page was verified through the in-app browser instead.

**Weather CSP fix and deployment (2026-09-19).** The public web document CSP
now allowlists `https://api.open-meteo.com` in `connect-src`, matching the
browser-side weather fetch. The source-level policy test covers both the HTML
meta carrier and `.htaccess` header carrier. `web/index.html` and
`web/.htaccess` were uploaded to both `/beta` and `/astro`. Live in-app browser
checks confirmed that both deployed sites load current conditions and the
four-day forecast. The repository Playwright gate still cannot start in this
Windows sandbox (`WinError 5`); no version bump or tag was made.

**Hourly observing weather.** Both shells now normalize Open-Meteo hourly
forecast data into a site-local selected-night timeline with cloud cover,
precipitation probability and amount, a plain-language sky-clarity/haze
proxy, temperature/dew-point spread, and derived dew-risk labels. It now
shows dark hours only and puts a 0–100 night rating plus a green/yellow/red
aggregate status in the top bar; daylight/current-noon and raw kilometre
visibility values are not presented. Responses are generation-guarded so
changing site or date cannot paint stale data. A direct browser-side 7Timer
seeing/transparency feed is intentionally deferred until it can be served
through a safe HTTPS/CORS-aware provider boundary; the normalized hourly
contract leaves that extension open.

**Theme-owned visualizations.** Sky View, the catalog sky map, and altitude
graphs now consume semantic `--viz-*` roles through `viztheme.js` in both
shells. Switching Appearance emits `theme:changed` and repaints the active
canvas, so Workbench and Glass differ inside the charts as well as around them.
The invariant test was updated to protect the semantic contract rather than a
single hard-coded red palette.

**Altitude graph legibility.** The detail-chart legend is now grouped into
Target state and Chart guides, with plain-language descriptions for the target
states, minimum threshold, moon track, twilight shading, best window, and
obstruction ceiling. The Moon track has its own blue/cyan palette role instead
of sharing the warning colour, and both shells clip the track at the chart's
-10° floor so it cannot overlap the time labels.

**Menu stacking.** Workbench now follows the shared chrome ladder in both
shells: the top bar sits above the tab strip and page content, while its menu
popover remains above the bar. This prevents the hamburger menu from opening
behind Horizon cards or other view panels.

**Independent EOG zenith sky brightness.** Added a shared, pure EOG/VIIRS
estimate based on the published neighborhood sky-glow model, an offline builder
for reduced Annual VNL radiance/coverage packs, a lazy optional chip in both
shells, and a separate Lorenz comparison validator. Lorenz is not a runtime
dependency or shipped asset; the estimate remains display-only and does not
replace Bortle or ranking. The raw EOG source rasters were not bundled because
the current download endpoint requires operator access. Focused verification:
`python scripts/check_js.py`, `python scripts/check_core.py`, pack-builder and
validator syntax checks, and `python -m pytest tests/test_skybrightness.py -q`
(5 passed). The full suite remains the final release gate.

No tag or package was made.

**CR2 - malformed-horizon guards (confirmed, and larger than noted).**
`visibleSkyBands` had already been fixed (CO-04), but an empirical probe of the
whole family found three live gaps: `skyBandPolygons` and `profileSegments` threw
on 7 malformed shapes (the desktop editor passes `profileTop`, so a sky record
with no top array crashed a render), and `ceilFor` validated the profile's LENGTH
but not its ELEMENTS - returning `ceil: NaN` for a 720-long array holding NaN,
which is the exact hazard its own guard exists to prevent (`alt > NaN` is false,
so every object at that azimuth reads as blocked). All three now return the empty
sentinel their siblings use. **Pin:** `tests/js/horizon_degrade.mjs`, 14 malformed
shapes x 7 entry points, plus a positive case so the degrade cannot become
"always empty"; mutation-proven for both guards added.

**DS4 - the worker/detail peak disagreement (refined; the note was wrong).**
The note said "one-sample/0.05 deg difference near ties". The two payloads sample
DIFFERENT grids (night 6 min noon-anchored, detail 4 min dusk-anchored), so their
peaks legitimately differ and that is not the defect. The defect was that the
detail payload disagreed with ITSELF: it took the argmax over the 2-dp-ROUNDED
array while the night path used the raw argmax, so `max_time` and `max_alt` could
name different samples. Fixed to the raw argmax. **Measured, and it limits the
pin:** since `round2(max(raw)) >= round2(raw[j])`, the rounded argmax can only
land at or before the raw one, so the reported peak VALUE is unchanged either way;
the difference is which of two equal-valued samples `max_time` names. The shipped
ic434 row holds a single sample at its detail maximum over four dates, so no live
fixture separates the two. The engine therefore asserts the user-visible contract
(the two fields describe one sample; the peak is not below the grid's own maximum)
and records this limit in a comment rather than inventing a fixture. **Pin:**
`tests/js/worker_failure.mjs`.

**DS5 - worker revive (confirmed).** `_worker.onerror` set the broken flag but
left the DEAD Worker in `_worker`; `__NS_REVIVE_WORKER` clears the flag, so the
next build handed the corpse back to `postMessage` - the recovery hook could not
recover. The kill hook was already correct, which is exactly why the existing
`desktop-worker-kill-sync-fallback` check passed while this path was broken. The
handler now terminates and nulls the worker like the timeout path and the kill
hook; it was extracted into `onWorkerError` so a browser check can drive it with a
genuine `ErrorEvent` through the new `__NS_FAIL_WORKER` dev hook. **Pins:**
`tests/js/worker_failure.mjs` (mutation-proven) and the new browser check
`desktop-worker-error-disposal`.

**WB7 - web bundle version (confirmed).** `version` was written at export and
IGNORED on import, so a bundle from a future format was accepted and its fields
read under this build's rules - a silent misreading reported as a successful
restore. `stageBackup` now refuses a version above `BUNDLE_VERSION` with a
message that says to update; v1 (no stamp) and v2 still restore, and an unusable
stamp is refused rather than crashing. **Pin:** `tests/js/web_backup.mjs`
(mutation-proven).

**Verification.** `python -m pytest tests/ -q` -> **626 passed, 0 failed**.
`python scripts/check_js.py` -> OK (core re-baked: token 33 -> 35, every importer
and its cache token moved in the same change). Browser gate: `--web` 18/18,
`--desktop` **9/9** against a freshly built exe (the new check included). The exe
was rebuilt for that gate and is a local build, not a release artifact.

**Not done, deliberately.** No version bump and no tag: this is the working tree
for the next release, and the four closures ride with it. CR3 (FOV-edge half-bin)
remains a deliberate, documented non-change - it alters user-visible scoring and
needs its own release decision.

## 0.6.34 - 2026-09-17

**RELEASED as 0.6.34** - tag `v0.6.34` on the release commit `a279513`, with the
curated `scripts/build_changelog.py` entry living IN that commit. Follow-up
`3d4eb54` regenerated the tracked `landing/changelog.json` (**never moved the
tag**); HEAD is now `v0.6.34-1-g3d4eb54`.

**What shipped.** The BUGS.md fix pass - all six findings:

- **BUG-001** - a restore now validates the whole bundle, stages payloads with a
  `payload.journal`, and swaps them in only after the database transaction
  commits. A refused restore leaves both the database and the payload tree
  byte-identical.
- **BUG-002** - imported ids need `u_` AND `safe_token()`, imported `imagetyp` is
  normalized, every desktop attribute sink escapes, the two inline `onerror=`
  handlers became listeners, and the desktop CSP dropped `script-src
  'unsafe-inline'` for the SHA-256 of the one inline theme bootstrap.
- **BUG-003** - the production document enforces a policy. `/astro/` answers
  `server: nginx` + `content-type: text/html` with no header and the Plesk console
  exposes no nginx directive field (measured 2026-09-17), so the policy ships as
  `<meta http-equiv="Content-Security-Policy">` in `web/index.html`; the header
  form stays in `web/.htaccess` for a host that offers the directive field.
- **BUG-004** - malformed bundle shapes (scalar top level, non-object records) are
  a controlled 400 raised before the safety copy, not a 500.
- **BUG-005** - the Today view publishes `#view[data-ns-gen]`/`[data-ns-sel]` on
  the scrubber's own grid and the browser check waits for the REQUESTED instant.
  The new check found three real stale-selection defects (see below).
- **BUG-006** - deleting the active panorama clears `active_pano_id` in the same
  transaction; activating an unknown id is refused with a 400.

**Found while fixing (all fixed before the tag).**

1. BUG-005's new check failed three times, each a real divergence:
   `renderTonight` captured the selection at call time while its compute runs
   ~30 ms later; `clampSkyTime()` announced `sky:time` only when it CHANGED the
   time, so at boot the announcement arrived before the scrub listener existed;
   and `#tb-scrub` is `step="15"`, so the browser snapped what `syncScrub()`
   wrote (write 204, DOM 210) - a marker publishing raw milliseconds could never
   match.
2. `style-src 'self'` in the (then-unused) header policy **silently blocked the
   shell's inline `style=` attributes**: measured 2026-09-17, the range inputs and
   theme swatches lost their styling while the page booted normally and Chrome
   logged NO "Refused to" message. Both carriers now say
   `style-src 'self' 'unsafe-inline'` (inline STYLE cannot execute), and the
   production smoke MEASURES a computed background so it cannot fail silently.

**Verification.**

- `python -m pytest tests/ -q` -> **623 passed, 0 failed** (baseline 598).
- `python scripts/check_js.py` -> OK.
- `python scripts/pre_tag_check.py 0.6.34` -> OK (curated entry present, every
  module and the catalog match their cache token).
- `python scripts/check_browser.py --all` on the staged build -> **26/26 passed**
  (web 18, desktop 8), including the new `web-tonight-render-marker-converges`.
- `python scripts/check_release.py` -> 0 errors, 1 warning (the changelog
  regeneration that step 7 performs; done and committed as `3d4eb54`).
- Staged artifacts: `dist/release/NightSeam-0.6.34.zip` (20,510,625 bytes, sha256
  `285e8927b00632c214fd37e302719bcdc49d2eefa99f7c422eea07f485e7c876`), plus
  `NightSeam-latest.zip`, `version.json` and `ns-version.js`.
- Deployed and verified LIVE: `/downloads/` (zip + latest + version.json +
  ns-version.js + changelog.json) and the `/astro` tree (`app.js`, `version.json`,
  `.htaccess`, **`index.html` last**), then
  `check_browser.py --prod-url https://nightseam.de/astro/` -> **PASS**, with the
  page's own footer version matching the deployed `version.json`.

**Not done, deliberately.** The desktop app's update notice points at
`ns-version.js`, which is uploaded; the exe itself is a local build (the `/downloads`
zip is the distributable). The nginx header remains a possible upgrade if the host
ever exposes the directive field - no change would be needed beyond adding the
documented `add_header` line.

## UNRELEASED - BUGS.md fix pass (2026-09-17)

**Not tagged, not deployed, no version bump.** This is the working-tree fix pass
for the six findings in `BUGS.md`, recorded here because the repository's rule is
that evidence lives with the change. It becomes a release entry only when it is
tagged; nothing below was verified against a deployed host.

**What changed (one line per finding).**

- **BUG-001** - `app/backup.py::apply_import_zip` now validates the WHOLE bundle
  (new side-effect-free `database.prepare_import_bundle`) before a payload byte is
  staged, stages payloads into `<target>.import-<n>.part` on the DESTINATION
  filesystem with a `payload.journal` holding any file they would replace, runs
  the database transaction, and only then swaps the staged files in. Every
  failure path rolls the journal back, so a refused restore leaves the database
  and the payload tree byte-identical. `_PayloadStage` is the sole
  payload-writing mechanism.
- **BUG-002** - the import boundary requires `u_` **and** `paths.safe_token()` for
  a custom id (`database.custom_id_problem`, the one rule shared with the insert
  loop) and normalizes `imagetyp` through `ingest.classify_frame`; the desktop
  attribute sinks that rendered those values unescaped (`setup.js` custom list -
  the id that reproduced the finding - plus `targets.js`, `tonight.js`, `pano.js`
  and the site/rig buttons) now escape them; the two inline `onerror=` thumbnail
  handlers became listeners; and `app/server.py::CSP_HEADER` dropped
  `'unsafe-inline'` from `script-src` in favour of the SHA-256 of the one inline
  theme bootstrap.
- **BUG-003** - `tests/browser/harness.py::_csp_problems(..., document=True)` and
  `_prod_smoke` read the policy from the `page.goto()` DOCUMENT response only (the
  `version.json`/`catalog.manifest.json` fallback is gone) and a missing document
  CSP is now a hard failure. `web/.htaccess` documents the required nginx
  directive; **applying it at the host layer is still outstanding** (see BUGS.md).
- **BUG-004** - `database.import_bundle_shape()` runs immediately after
  `json.loads`: a non-object top level, a non-list collection and a non-object
  entry in any collection are ValueError -> controlled 400, before the safety copy.
- **BUG-005** - `web/app.js` publishes `#view[data-ns-gen]`/`[data-ns-sel]` after
  each Tonight paint (and clears the selection the moment the scrub moves);
  `tests/browser/harness.py::wait_tonight_after` polls it and
  `web-tonight-pool-includes-unmagnituded-standard-rows` asserts the painted
  instant equals the scrubber's own (`window.__ns_scrub_sel`), replacing the
  120 ms sleep. New check `web-tonight-render-marker-converges`.
- **BUG-006** - `Database.delete_panorama` clears `active_pano_id` in the same
  transaction when it deletes the row the pointer names (and only then);
  `set_active_panorama` refuses an id that names no row, and
  `POST /api/settings` maps that to a 400.

**Verification run.**

- `python -m pytest tests/ -q --tb=no` -> **620 passed, 0 failed** (baseline in
  `BUGS.md` was 598).
- New regression modules: `tests/test_prod_document_csp.py` (6),
  `tests/test_tonight_marker.py` (5), `tests/js/dom_escape.mjs` +
  `tests/test_js_behaviour.py::test_desktop_attribute_sinks_escape_imported_data`,
  and the BUG-001/002/004/006 cases added to `tests/test_backup.py` and
  `tests/test_api.py`. The escape engine was mutation-proven (removing one `esc()`
  fails it).
- `python scripts/check_js.py` -> **OK** after repeated
  `scripts/bump_web_tokens.py` + `scripts/check_js_tokens.py --update` runs
  (`app.js` 87 -> 97 across the pass, in `web/index.html` + `web/app.js`).
- **Browser gate:** `--web` **18/18 passed** and `--desktop` **8/8 passed**
  (rebuilt exe). Escalated once per run: Playwright cannot create its Chrome pipes
  under the confined sandbox - see `ENVIRONMENT.md`.
- **BUG-003 closed on the LIVE origin.** `/astro/` was measured through Chrome on
  2026-09-17: `server: nginx`, `content-type: text/html`, NO policy header and no
  meta policy - i.e. nginx serves the document itself, so `web/.htaccess` can never
  reach it and this host exposes no nginx directive field. The enforced policy now
  ships as a `<meta http-equiv="Content-Security-Policy">` in `web/index.html`;
  `web/index.html` was deployed individually and
  `check_browser.py --prod-url https://nightseam.de/astro/` -> **PASS** (policy
  present on the document, inline-styled swatches still render).
- **A silent-breakage bug found by measuring instead of assuming.** The header
  policy carried `style-src 'self'`, which blocks the shell's inline `style=`
  attributes with NO console message: the sliders and theme swatches lost their
  styling while the page booted normally (negative control: `style-src 'self'`
  alone -> `edgeSpace`/`bortle` widths and the swatch background all
  `<blocked>`, `Refused to` messages = 0). Both carriers now say
  `style-src 'self' 'unsafe-inline'`, and the production smoke measures a computed
  background on an inline-styled element so it can never fail silently again.
- Desktop: the exe was REBUILT from this tree (PyInstaller onefile, ~47 s,
  20.8 MB, `v0.6.33-8-gfa6ef5c`) and `python scripts/check_browser.py --desktop`
  -> **8/8 passed** (boot, worker date change, worker kill/sync fallback, pref
  rescore, advanced mode, catalog tier/minvis, scrub window, pano crop FOV).
- Guard dry run: `python scripts/pre_tag_check.py 0.6.34` -> the expected FAIL
  ("no CURATED entry for 0.6.34"), with the token guard's self-test OK and no
  missed-bump finding - i.e. the release machinery is armed and waiting for the
  changelog entry, nothing else.
- **NOT run:** the header carrier on the live host (it cannot be applied there).
  The meta carrier is the live protection; `web/.htaccess` keeps the stronger
  header form ready for a host that exposes the directive field.

**Discovered while verifying (fixed in the same pass).** The browser gate earned
its keep: the new BUG-005 check failed three times in a row and each failure was a
REAL divergence, not test flakiness. (1) `renderTonight` captured
`S.skyTime` at CALL time while its compute runs ~30 ms later, so a selection
clamped in between painted cards for the old instant. (2) `clampSkyTime()` only
announced `sky:time` when it CHANGED the time, so at boot the announcement arrived
before the scrub listener existed and the slider + Tonight view kept the
pre-clamp selection. (3) `#tb-scrub` is `step="15"`, so the browser snaps what
`syncScrub()` writes (write 204, DOM 210) and a scrub writes that back into
`S.skyTime` - a marker publishing raw milliseconds could never equal the
scrubber's own instant. All three are fixed at the source and pinned by
`web-tonight-render-marker-converges`.

## 0.6.33 - 2026-09-15

**RELEASED as 0.6.33** - tag `v0.6.33` on the release commit `3c2f98a`, with the
curated `scripts/build_changelog.py` entry living IN that commit. Follow-up
`b390575` regenerated the tracked `landing/changelog.json` (**never moved the
tag**).

**What shipped.** The 0.6.32-review fix batch plus the shell-unification pass:
the web "tonight" pool gained the 45 standard-mode objects whose catalogue
magnitude is empty (the inline `o.vmag != null` filter - IC 1396, the Running
Man, NGC 281, the Flame, the Tulip, Simeis 147, the Double Cluster, the Pipe
Nebula and 38 more could never appear there), both shells now score through ONE
`core/scoring.js::scoreNightTracks` with the span as a parameter, the panorama
editor's snapshot/undo/redo/dirty model is ONE `core/panohistory.js` (the
desktop gained `#btnRedo`), the popularity source is no longer contacted anywhere (the
`--live` refresh flag is GONE, not disabled), the web shell ships a
Content-Security-Policy, and 74 review findings plus 6 investigated non-finding
items are closed or documented.

**Staged artifacts** (`dist/release/`): `NightSeam-0.6.33.zip` and
`NightSeam-latest.zip` (20,505,657 B, sha256
`c947dcd37af9c66688712284107eb574a3e0b2c1a102abd8c290c4050ba583ad`),
`version.json` (version 0.6.33, url `/downloads/NightSeam-0.6.33.zip`, size +
sha256 above), `ns-version.js` (`{"version": "0.6.33"}`), `NightSeam.exe`
(19.8 MB, rebuilt AT the tag with `build.ps1` - the release check correctly
refused to stage the earlier `0.6.32-3-g3277846-dirty` snapshot).

**Gates.**

* `python -m pytest tests/ -q` -> **598 passed** (0 failures).
* `python scripts/check_js.py` -> OK (imports, DOM ids, syntax on 81 modules,
  encoding, catalog token, the VERIFIED token baseline, core drift/purity).
* `python scripts/check_release.py` -> 0 errors at the tag, before staging.
* `python scripts/check_browser.py --all` -> **25/25** on the STAGED build
  (17 web checks incl. the new `web-tonight-pool-includes-unmagnituded-standard-rows`,
  and 8 desktop checks against the freshly built exe).
* `python scripts/check_browser.py --web --prod-url https://nightseam.de/astro/`
  -> **18/18** after upload.

**Deployed and verified live** (FTPS, Plesk):

* `/downloads/` - `NightSeam-0.6.33.zip` + `NightSeam-latest.zip` +
  `version.json` + `ns-version.js`; the LIVE zip was downloaded back and its
  sha256 equals the staged value byte-for-byte.
* `/astro/` - the whole web tree via `uploadtree` (index.html last, as the
  uploader orders it) plus `web/.htaccess` uploaded by hand (the uploader skips
  dotfiles). Live `/astro/version.json` = 0.6.33 / describe v0.6.33.
* `/` - the landing tree, so `/changelog.json` now carries the 0.6.33 entry
  (verified: newest entry 0.6.33).

**CSP caveat (measured, and the reason the check was relaxed).** The host
fronts static files with **nginx**, which serves `.html`/`.js`/`.css` itself and
never reaches Apache for them, so the `web/.htaccess` directives arrive only on
the paths nginx proxies: measured 2026-09-15, `/astro/version.json` carries the
policy and `/astro/`, `/astro/app.js`, `/astro/app.css` do not. `mod_headers` is
therefore working; the policy simply cannot cover the HTML without an nginx-layer
rule (Plesk > domain > Apache & nginx Settings > Additional nginx directives).
The production check now probes every path under the URL for the policy, treats
"the host serves it nowhere" as a printed NOTE rather than a hard failure (a
platform property this repo does not control), and still FAILS on a policy it
does find if that policy is unusable. The policy's CONTENT and its inline-script
hash are pinned offline by `tests/test_prod_csp.py`.

**Test-count and token register at this release:** 598 tests collected; web
tokens `app.js?v=87` / `CATALOG_TOKEN='10'` / astro 21 / horizon 54 / format 28 /
nightrank 20 / webstore 31 / dragwin 1 / style 24 / themes 5; core stub
`web/core.js?v=33` (current hash `7d2e90d5de153c46`, retained N-1
`21df8e451f20a165`, 10 core modules).

**Post-tag commits (never move the tag):** `b390575` (regenerated
`landing/changelog.json`) and the harness fix that relaxed the CSP probe
described above.

  **RELEASED as 0.6.25** - tag `v0.6.25` on the release commit (the curated entry
  and the build fix live in it), staged artifacts in `dist/release/`
  (`NightSeam-0.6.25.zip` + `NightSeam-latest.zip` + `version.json` +
  `ns-version.js`), `check_release.py` 0 errors, the FULL browser gate **19/19 on
  the staged build** (12 web + 7 desktop against the fresh exe), and after the
  upload the live site passes the read-only production smoke (**13/13**,
  `check_browser.py --web --prod-url https://nightseam.de/astro/`). Deployed:
  `/downloads/` (zip, latest, version.json, ns-version.js), `/astro` (whole tree,
  index.html last) and the landing (with the regenerated changelog.json). The gate
  needs ONE unsandboxed command (Chromium's mojo named pipes); sandboxed, `TO-02`
  makes it report exit 2 honestly instead of a fake "failed check(s)".
- **RELEASED as 0.6.26** - tag `v0.6.26` on the release commit (`d412998` catalog
  rebuild + `ea86a3a` the curated entry), staged `dist/release/`
  (`NightSeam-0.6.26.zip` sha256 `cd0d2bc5...` + `NightSeam-latest.zip` +
  `version.json` + `ns-version.js`), `check_release.py` **0 errors at the tag**,
  the FULL browser gate **19/19 on the staged build** and **13/13 including the
  read-only production smoke** after the upload. Deployed `/downloads/` (zip,
  latest, exe, version.json, ns-version.js), `/astro` (whole tree, index.html
  last) and the landing. Verified live, not assumed: `/astro/version.json` +
  `/downloads/version.json` + `/downloads/ns-version.js` all read 0.6.26, the
  deployed `catalog.json` sha256 equals the local payload, the published zip
  equals the staged artifact, the live tokens are `app.js?v=70` /
  `CATALOG_TOKEN = 5`, and the live copy reads 12,160 with no stale "197".
  Follow-up commit `408dab5` regenerated the tracked `landing/changelog.json`
  (**never moved the tag**).
- **RELEASED as 0.6.27** - tag `v0.6.27` on the release commit (`348b015` the
  popularity/label/migration work + `b7cf4de` the curated entry), staged
  `dist/release/` (`NightSeam-0.6.27.zip` sha256 `383faa68...` + latest +
  `version.json` + `ns-version.js`), `check_release.py` **0 errors at the tag**,
  the FULL browser gate **19/19 on the staged build** and **13/13 including the
  read-only production smoke** after the upload. Deployed `/downloads/`,
  `/astro` (index.html last) and the landing; verified live (`/astro/version.json`
  + `/downloads/version.json` + `ns-version.js` = 0.6.27, the deployed
  `catalog.json` sha256 equals the local payload, the published zip equals the
  staged artifact). Follow-up commit `f816a00` regenerated the tracked
  `landing/changelog.json` (**never moved the tag**).
- **RELEASED as 0.6.28** - tag `v0.6.28` on the release commit (`4bcbcd9` the
  7-object supplement + the CATALOG.md/DECISIONS.md docs, `e3bcb38` the curated
  entry), staged `dist/release/` (`NightSeam-0.6.28.zip` sha256 `57b47519...` +
  latest + `version.json` + `ns-version.js`), `check_release.py` **0 errors at the
  tag**, the FULL browser gate **19/19 on the staged build** and **13/13 including
  the read-only production smoke** after the upload. Deployed `/downloads/`,
  `/astro` (index.html last) and the landing; verified live (`/astro/version.json`
  + `/downloads/version.json` + `ns-version.js` = 0.6.28, the deployed
  `catalog.json` equals the local payload AND carries all seven supplement ids,
  the published zip equals the staged artifact). Follow-up commit `f45b1d0`
  regenerated the tracked `landing/changelog.json` (**never moved the tag**).
  **Gate note:** the first `--all` run on the freshly built onefile exe failed
  `desktop-pano-crop-fov` with a 30 s wait timeout (32.5 s) because PyInstaller
  unpacks the ~20 MB exe to %TEMP% on first launch; the immediate re-run passed
  7/7 (3.1 s). A cold-start timeout right after a build is that, not a regression -
  re-run the gate before investigating.
- **RELEASED as 0.6.29** - tag `v0.6.29` on the release commit (`365dc0e`: the
  nine-object supplement batch 2 + the copy/doc updates; the curated entry is in
  the same commit). Catalogue **12,167 -> 12,176** (supplement 7 -> 16), staged
  `dist/release/` (`NightSeam-0.6.29.zip` sha256 `c43e85a41f4f87015a7cb1e0ef308f59dc1385a02662f634ddbc2bcc6a6744dc`,
  20,483,677 bytes, + latest + `NightSeam.exe` + `version.json` + `ns-version.js`),
  `check_release.py` **0 errors at the tag**, the FULL browser gate **19/19 on the
  staged build** (12 web + 7 desktop against the fresh exe - no cold-start timeout
  this time) and **13/13 including the read-only production smoke** after the
  upload. Deployed `/downloads/` (zip, latest, exe, version.json, ns-version.js),
  `/astro` (whole tree, index.html last) and the landing. Verified live, not
  assumed: `/astro/version.json` + `/downloads/version.json` +
  `/downloads/ns-version.js` all read 0.6.29, the deployed `catalog.json` sha256
  **equals the local payload** (`c44fd26a...`, 12,176 rows / 200 standard) AND
  carries all nine new ids with the `Squid` alias intact, and the published zip
  sha256 equals the staged artifact. Tokens: `app.js?v=74` (index.html) /
  `CATALOG_TOKEN = 8` + manifest, baseline refreshed for the one moved token.
  Popularity 7,645 -> **7,654** (the nine new rows; no existing score touched).
  All nine entered Standard mode on their own scores (29,490 / 25,230 / 22,630 /
  14,110 / 9,790 / 8,230 / 6,780 / 5,200 / 2,188, cut 1,751), displacing nine
  members: `ngc6526`, `ngc3992` (M109), `ngc6121` (M4), `ic63`, `ic1871`,
  `ngc2246`, `ngc6905`, `ngc2362`, `ngc6231` - the documented consequence of
  `STANDARD_TOP_N = 200`, accepted deliberately (see `DECISIONS.md`).
  Follow-up commit `809de12` regenerated the tracked `landing/changelog.json`
  (**never moved the tag**); `RELEASES.md` record in the next commit.
- **RELEASED as 0.6.30** - tag `v0.6.30` on the release commit (`d47d019`: the popularity
  TIER column + frame-coverage colours + Min-visibility slider in BOTH apps, plus the
  curated entry in the same commit). Staged `dist/release/`
  (`NightSeam-0.6.30.zip` sha256
  `4204eda2668057e73093c8312a0cc2cb1f5778e74c710fcf52ab6c2b0c60d576`, 20.5 MB, + latest +
  `NightSeam.exe` + `version.json` + `ns-version.js`), `check_release.py` **0 errors at the
  tag**, the FULL browser gate **21/21 on the staged build** (13 web + 8 desktop - the
  desktop suite gained `desktop-catalog-tier-minvis`, and the web check now drives the
  slider too) and **14/14 including the read-only production smoke** after the upload.
  Deployed `/downloads/` (zip, latest, exe, version.json, ns-version.js), `/astro` (whole
  tree, index.html last) and the landing. Verified live, not assumed:
  `/astro/version.json` + `/downloads/version.json` + `/downloads/ns-version.js` all read
  0.6.30, `landing/changelog.json`'s newest entry is 0.6.30, the deployed `catalog.json`
  sha256 equals the local payload (`c44fd26a...`, 12,176 rows / 200 standard - the payload
  itself did not change in this release), the live `index.html` carries `app.js?v=76`, the
  live `app.js` carries `CATALOG_TOKEN = '8'` plus the new `cat-minvis` control, `style.css`
  the `.tier-badge`/`.over` rules and `nightrank.js` the `nightStatsBatch` re-export, and the
  published zip sha256 equals the staged artifact.
  The core was re-baked twice (stub 21 -> 23, the tier helpers), so the token cascade touched
  every web module - final register: app 76 / astro 15 / horizon 47 / format 22 / nightrank 13
  / webstore 25 / style 18 / core 23. **503 tests.** Follow-up commit `c16e54f` regenerated
  the tracked `landing/changelog.json` (**never moved the tag**).
  **Gate note:** `dist/NightSeam.exe` was rebuilt with `-AllowDirty` mid-work to verify the
  desktop UI in a real browser before the release (it reported `0.6.29-2-ge4e92c1-dirty`), and
  the first `--all` run on that build hit the documented PyInstaller cold-start timeout on
  `desktop-pano-crop-fov`; the immediate re-run passed (2.9 s). The released exe was then
  rebuilt CLEAN at the tag (`0.6.30`) and the staged gate passed 21/21 first time.
- **RELEASED as 0.6.31** - tag `v0.6.31` on the release commit (`93dccde`: the
  ranking-alignment + progress/layout-stability work plus the curated entry).
  Staged `dist/release/` (`NightSeam-0.6.31.zip` sha256
  `5a0fa461571800e78ab8600fa66ba616c59c17124f3de62600d37d335f37b633`, 20.5 MB, +
  latest + `NightSeam.exe` + `version.json` + `ns-version.js`), `check_release.py`
  **0 errors at the tag**, the FULL browser gate **22/22 on the staged build** (14
  web + 8 desktop, first run - no cold-start timeout) and **15/15 including the
  read-only production smoke** after the upload. Deployed `/downloads/` (zip,
  latest, exe, version.json, ns-version.js), `/astro` (whole tree, index.html
  last) and the landing. Verified live: `/astro/version.json` +
  `/downloads/version.json` + `ns-version.js` all read 0.6.31, the newest
  `changelog.json` entry is 0.6.31, the deployed `catalog.json` sha256 equals the
  local payload (`c44fd26a...`, 12,176 / 200 - unchanged again this release), the
  live `index.html` names `app.js?v=78` and `style.css?v=21`, the live `app.js`
  carries `cat-minvis`/`cat-stats`, `style.css` carries `.busy-slot` and
  `table-layout: fixed`, `nightrank.js` re-exports `nightStatsBatch`, and the
  published zip sha256 equals the staged artifact.
  What it fixes, all MEASURED in a real browser before/after: the catalog table
  used to widen the PAGE on a narrow viewport (page 721 px at a 360 px viewport ->
  now 360, scrolling inside its card); progress text ("computing visibility…") and
  the busy chip used to move the layout (the desktop topbar grew 93 -> 111 px and
  pushed the app down -> now constant via a reserved `.busy-slot` whose HEIGHT is
  reserved too, because at 1366 px the topbar already wraps); the catalog's
  percentage columns used to resize as cells filled in (`table-layout: fixed`).
  Also aligned: both shells now rank the tier over the set the current mode shows
  (`activeCatalog()` / `S.catalog`), proven on the real payload by
  `test_tier_letters_are_mode_independent_on_the_real_catalog`. **507 tests.**
  No core re-bake in this release (stub stays 23), so `/astro/core` gained no new
  dir; the four stale dirs from <= 0.6.26 are still unpruned. Follow-up commit
  `80f362f` regenerated the tracked `landing/changelog.json` (**never moved the
  tag**).
- **RELEASED as 0.6.32** - tag `v0.6.32` on the release commit (`2966a3c`: the
  `distance` removal + the designation-based Wikipedia lookup, with the curated
  entry). Staged `dist/release/` (`NightSeam-0.6.32.zip` sha256
  `41882ffc82b5c109bee1ca790ec828d4e4a9e248e29fe279585a06143b508e00`, 20.5 MB, +
  latest + `NightSeam.exe` + `version.json` + `ns-version.js`), `check_release.py`
  **0 errors at the tag**, the browser gate **22/22 on the staged build** and
  **15/15 including the read-only production smoke** after the upload. Deployed
  `/downloads/`, `/astro` and the landing; verified live: the version endpoints and
  `changelog.json` all read 0.6.32, the live `index.html` names `app.js?v=80`, the
  live `app.js` carries `CATALOG_TOKEN = '9'` AND `wikiTitles`, the deployed
  `catalog.json` sha256 equals the local payload (`ae002a9a...`, 12,176 rows, **no
  `distance` field**), and the published zips equal the staged ones.
  **A real deploy defect was caught here:** the first `/astro` tree upload stalled
  mid-way (the documented ProFTPD reuse behaviour) and left `core.js` pointing at
  the PREVIOUS baked tree, so a returning visitor would have loaded a core without
  `wikiTitles` and the app would have died on the missing named export. The verify
  pass found it, `core.js` + `catalog.json` were re-uploaded on fresh connections,
  and a new check (`logs/verify_tokens_live.py`) now compares EVERY live module and
  the whole baked core tree byte-for-byte against the repo - it passes with
  `STALE: none`.
  Also noted: `desktop-pano-crop-fov` timed out at 30 s on two consecutive full gate
  runs (31.9 s) and then passed in 2.9 s on the next one with the SAME preceding
  checks, and in 2.9 s standalone - the upload/decode budget is flaky, so its wait
  is 90 s now (`d6ace7a`, a post-tag test-only commit; the staged artifacts were
  built at the clean tag and are unaffected). Follow-up `4d8ce4d` regenerated the
  tracked `landing/changelog.json` (**never moved the tag**).
