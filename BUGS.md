# BUGS.md - current NightSeam findings

This is the active defect backlog and review evidence. It records unresolved
findings plus current-tree fixes that are still unreleased. `AGENTS.md` remains
the implementation contract, `DECISIONS.md` records durable choices, and
`RELEASES.md` records what actually shipped. Closed historical review bundles
were removed from the working tree on 2026-09-17; Git history remains the
archive.

## Direction B UI implementation — 2026-09-26 (unreleased)

The previously partial handoff has a functional implementation in the shared
working tree. Both shells now have the Direction B layouts and interaction behavior, including the
Tonight altitude overview, docked wide inspector and compact modal behavior,
Image Catalog navigation, local Sky View scrub, container-driven canvas sizing,
focus handling, and import/library retry flows. The web Horizon rails were
constrained after screenshot review exposed overlap, and the compact desktop
detail thumbnail no longer pushes target metadata below the first viewport.
The acceptance plan and completion evidence are in
`ui-concepts/direction-b/REMAINING_WORK.md`.

| ID | Status | Current evidence |
|---|---|---|
| UIB-006 | Implemented | Deterministic 82-image matrix captured and visually reviewed. `check_js.py` passes; the final full browser gate passes 38/38. |
| UIB-008 | Fixed in working tree | Wide details use a docked inspector, compact details remain modal, and browser checks cover focus entry, focus return, and selected-target activation. |
| UIB-009 | Fixed in working tree | Sky View and Sky Map resize observers rebuild chart geometry; browser checks pass. |
| UIB-010 | Fixed in working tree | Web Tonight legend styling and desktop Sky View local-time scrub are present and covered by the final browser gate. |
| UIB-011 | Fixed in working tree | Chart marker/state synchronization and detail focus-return behavior are covered by browser checks. |
| UIB-012 | Fixed in working tree | Five desktop primary tabs and nested Image Catalog navigation are covered. The web stylesheet token is `style.css?v=36`, and `AGENTS.md` reflects current web tokens. |
| UIB-013 | Fixed in working tree | DOM handler stubs support the new initialization path; focused behavior checks and the JS gate pass. |

Final checks on 2026-09-26: `python scripts/check_js.py` passed, and
`python scripts/check_browser.py --all` passed **38/38** against a fresh dirty
development build (`0.6.34-8-g3c12daf-dirty`). `python scripts/check_encoding.py`
passed. The one required full-suite run passed **647 tests**, with one upstream
Starlette/httpx deprecation warning. The current screenshot manifest records 42
desktop and 40 web PNGs. The separate sky-brightness/core/data changes in this
checkout remain outside this UI implementation. Nothing was staged, committed,
tagged, deployed, or released.

### Direction B post-completion fixes — updated 2026-09-27

| ID | Priority | Status and current evidence |
|---|---|---|
| UIB-014 | P1 | Fixed in the working tree. Both shells use a single-column docked inspector in both themes; metadata wraps, images stay compact, charts redraw to their current width, and the expanded browser assertions verify horizontal bounds and scroll reachability. The compact desktop detail dialog now layers above sticky planner chrome so its title and close control remain visible. |
| UIB-015 | P2 | Fixed in the working tree. Tonight facts and booked-night layout are shared across desktop themes; Catalog searches stay within their filter rails while result tables scroll independently. Browser coverage checks both themes at 1672, 1240, and 900 px. |
| UIB-016 | P2 | Fixed in the working tree. Docked inspectors no longer suppress global shortcuts; Arrow target stepping is limited to the focused detail container, while both time sliders and workspace focus scrub without changing the selected target. Compact dialogs retain their focus trap and modal shortcut behavior. |
| UIB-017 | P2 | Fixed in the working tree. The web Tonight chart has a visible six-item, theme-token-backed key that wraps at phone widths. The screenshot helper resets page and app scrollers after opening M31 detail and asserts the wide overview remains visible. |
| UIB-018 | P3 | Fixed in the working tree. Desktop details show a labelled offline fallback when an optional image fails; generation guards prevent stale image callbacks from replacing the current target. The CSP permits the app's same-page image blob URLs, and the desktop Tonight summary now describes red as horizon/ceiling obstruction only. |
| UIB-019 | P3 | Fixed in the working tree. Glass planner controls now compact through 1300 px while retaining a single toolbar row; the time slider and right-side chips fit without overlap. Browser geometry checks cover Glass at 1300, 1240, 1201, and 1100 px plus Workbench at 1240 px, including visible weather and sky-brightness chips. The rebuilt desktop screenshots show the 1240 px toolbar fitting. |
| UIB-020 | P2 | Fixed in the working tree. `web/app.js` recalculates `--detail-top` from visible chrome and coalesces passive capture-phase scroll events into one animation frame while a docked detail is open; close and compact mode remove the listener and cancel pending work. Browser coverage opens M31 from a deep Tonight row, verifies the title and close control before and after returning to the page top at 1672 and 1240 px in both themes, then closes through the visible control. The capture helper also checks hit points before saving. |
| UIB-021 | P3 | Fixed in the working tree. Desktop metadata labels wrap inside their existing 110 px cell with `overflow-wrap: anywhere`; values remain in the second cell. Browser assertions inspect rendered label text rectangles for every metadata row, the Designation history row, and table overflow at 1672, 1240, and 900 px in both themes. The final screenshots show the history label wrapping without touching its value. |
| UIB-022 | P1 | Open. Desktop Glass Horizon at 1672 and 1240 px collapses the panorama/profile into narrow vertical strips while the settings form expands across the central workspace; the 900 px stacked layout is unaffected. The theme's two-column `.horiz-layout` rule conflicts with the base three-column grid and explicit `#panoSettings` column 3 placement. Evidence: `ui-concepts/direction-b/implementation/screenshots/desktop-horizon-glass-wide-1672x941.png` and `ui-concepts/direction-b/implementation/screenshots/desktop-horizon-glass-compact-1240x900.png`. |
| UIB-023 | P2 | Open visual-fidelity finding. The 1672 px Workbench captures retain the Direction B tabs and broad palette but do not match the original images' information hierarchy and density: Tonight uses separate KPI cards and target cards instead of the compact brief/chart/timeline/ranked table; Catalog uses tall rows and a metadata-heavy inspector instead of a dense table with visible status and chart; Sky View's controls and long inspector displace the concept's chart/scrub/visible-target grouping; Library lacks the concept's prominent object rollup and detailed session table. The approved handoff explicitly omitted some illustrated fields and kept Image Catalog child tabs; those intentional omissions are excluded from this finding. |
| UIB-024 | P2 | Open visual-fidelity finding. Desktop Workbench Horizon's synthetic panorama occupies only the top of a tall central stage, leaving a large blank region and pushing the profile to the bottom of the viewport. The original Horizon image gives the panorama and profile most of the central workspace. Confirm whether this is fixture-specific before changing the editor's image transform. |

The 82 implementation screenshots and their capture and visual-review record
are in `ui-concepts/direction-b/implementation/screenshots/README.md`. They
were recaptured after the final CSS and screenshot-harness changes and checked
at the required widths. The complete browser matrix passes 38/38, and the
final full pytest run passes 647 tests. UIB-019 through UIB-021 are fixed in
the working tree; UIB-022 through UIB-024 remain open from the 2026-09-27
visual comparison. The run details are recorded in
`ui-concepts/direction-b/REMAINING_WORK.md`.

## Current review addendum - 2026-09-20 (unreleased working tree)

This addendum records the second review of the moved workspace at
`<workspace>\Nightseam-programm`. The separate
environmental/ranking tool is intentionally outside this review. The findings
were initially recorded before the implementation pass below; the follow-up
status is kept here so the active backlog remains truthful.

The initial review baseline was 629 tests and a 19/19 web browser gate. The
implementation pass below has since reached 637 passing tests, passing
`python scripts/check_core.py` and `python scripts/check_js.py`, and a 32/32
browser gate covering both shells, both themes, and the new accessibility
smoke checks. A fresh dirty snapshot was also built and
`scripts/check_release.py --allow-dirty` reports zero errors and one expected
dirty/off-tag warning. Nothing has been tagged or deployed; see
`IMPLEMENTATION_PLAN.md` for the ordered implementation and remaining roadmap.

### Current review priority summary

| ID | Priority | Status | Finding |
|---|---|---|---|
| REL-001 | P1 | Staged; release guard passing | Required theme modules were untracked until staged |
| BUG-008 | P1 | Fixed in working tree; unreleased | Panorama edits could leave planner results and caches stale |
| BUG-009 | P1 | Fixed in working tree; unreleased | Web backup restore could write before required validation was complete |
| BUG-010 | P2 | Fixed in working tree; unreleased | Desktop editor autosaved despite the explicit-save design contract |
| BUG-011 | P2 | Fixed in working tree; unreleased | Desktop Clear/Undo behavior diverged from the editor contract |
| BUG-012 | P2 | Fixed in working tree; unreleased | Weather retry was inert after an error |
| DEC-003 | P2 | Open contract | Site elevation has no defined computational meaning |
| DEC-004 | P3 | Fixed in working tree; unreleased | Unknown theme values normalized differently in web restore |
| A11Y-001 | P2 | Foundation fixed; audit remains | Canvas charts and shell controls lacked a consistent accessible contract |
| DOC-003 | P3 | Corrected in working tree | Operational documentation still contained old workspace references |

### Implementation follow-up - 2026-09-20

The implementation pass made the deterministic fixes below. They remain marked
unreleased because no tag or deployment has been made, but the required local
validation has now passed.

| Finding | Working-tree change | Current evidence |
|---|---|---|
| REL-001 | The three theme modules are staged and the release guard verifies their tracking. | Full suite and `check_release.py --allow-dirty` pass. |
| BUG-008 | Added the shared `planner:changed` event/revision contract, all-input emitters, desktop panorama invalidation, and web observation-cache invalidation. | 637 tests, `check_core.py`, `check_js.py`, and 32/32 browser checks pass. |
| BUG-009 | Web restore now validates the complete panorama section and aborts when the safety snapshot cannot be written. | `tests/js/web_backup.mjs`, full suite, and release checks pass. |
| BUG-010 | Desktop ordinary edits remain in memory until Save or editor navigation; page-exit persistence is best effort. | Full suite, UI invariants, and packed-app browser checks pass. |
| BUG-011 | Clear uses the in-page confirmation dialog and is undoable; undo/redo, mode, revert, and calibration synchronize controls. | Full suite, UI invariants, and packed-app browser checks pass. |
| BUG-012 | Retry clears the prior error and starts a fresh generation-guarded request when no request is active. | Full suite, JS behavior checks, and browser checks pass. |
| DEC-004 | Web backup restore canonicalizes unknown/legacy theme values to Workbench, preserving Glass only for the explicit `dome` value. | `tests/js/web_backup.mjs` and both-theme browser checks pass. |
| A11Y-001 | Added tab semantics, chart text alternatives, dialog Escape dismissal, visible focus styling, high-contrast and reduced-motion media rules, and browser checks in both shells. | Full suite, JS guards, and 32/32 browser checks pass; manual screen-reader/focus-restoration QA remains. |

The elevation contract remains decision-gated. The recommended safe default is
metadata-only until an observer model, horizon dip, refraction assumptions, and
valid ranges are specified. Solar-system ephemeris policy is likewise still a
product decision; neither is being guessed in this pass.

### A11Y-001 - chart and shell accessibility foundation (PARTIALLY FIXED IN WORKING TREE; UNRELEASED)

The review found that the canvas charts were visually useful but exposed almost
no semantic information to assistive technology. The web planner tabs also had
no reliable selected-state contract, and the browser shell had no explicit
high-contrast/reduced-motion policy. The web detail dialog did not dismiss on
Escape, leaving keyboard users with a visible dialog that could intercept the
next interaction.

**Resolution.** Both shells now expose tablist/tab state, chart roles and
textual summaries, focus-visible styling, high-contrast tuning, and reduced-
motion rules. The shared web dialog closes through Escape, and the browser
gate checks the real web and packed desktop DOMs under the current theme matrix.

**Still open.** This is a foundation, not a claim of a completed WCAG audit.
Focus restoration after every dialog/menu/inspector transition, screen-reader
announcements for all dynamic planner updates, and manual testing with actual
assistive technologies remain follow-up work.

### REL-001 - required theme modules were untracked

`app/theme.py`, `static/js/viztheme.js`, and `web/viztheme.js` exist in the
working tree but are not tracked. They are imported by tracked runtime files:

- `app/database.py` and `app/server.py` import the Python theme normalizer.
- `static/js/detail.js`, `static/js/skymap.js`, and `static/js/skyview.js`
  import the desktop visualization theme module.
- `web/app.js` imports the web visualization theme module.

The local checkout worked because these files were present. A commit, patch,
source archive, or deployment assembled from tracked changes alone would have
failed at server import time or browser module-load time. This was a
release/staging blocker, not a runtime failure in the dirty checkout.

**Resolution.** The three files are staged, and the release guard now resolves
the required modules from tracked/source-backed files before packaging.

### BUG-008 - panorama edits could leave planner state stale (FIXED IN WORKING TREE; UNRELEASED)

The desktop editor applies edits to its in-memory panorama and schedules a
persist, but the save path does not recompute the active night or refresh the
derived target views. `Pano.refreshOverlay()` is also a no-op. A user can paint
an obstruction, see it in Horizon, and still see old target visibility,
ceiling, percentage, or ranking values until an unrelated night reload or
preference change occurs.

The web shell has the same class of defect through cache reuse. The observation
cache key includes the panorama id but not a profile/content revision, and the
Horizon view supplies an empty change callback. Leaving Horizon can therefore
reuse catalog percentages and sorting calculated against the previous profile.
Backup restore of a panorama with the same id has the same risk.

**Resolution.** `core/plannerstate.js` now provides the shared revision/event
contract. Both shells emit it for panorama and other calculation inputs; the
desktop refreshes derived views and the web versions observation caches by
panorama revision. The planner-state tests and the 30/30 browser gate cover
the resulting behavior.

### BUG-009 - web backup restore could write before complete validation (FIXED IN WORKING TREE; UNRELEASED)

The web backup staging path validates the panorama section only when that
section is present. The restore then writes the staged sites, rigs, and targets.
The UI discovers a missing panorama section only after the write and attempts a
rollback. A tab close, crash, quota failure, or rollback failure can therefore
leave a partially replaced store.

The safety snapshot write is also treated as best effort: failure is not checked
before the destructive write proceeds. That removes the main recovery guarantee
exactly when storage is under pressure.

**Resolution.** Restore now validates and normalizes the complete staged model
before destructive writes, and an unsuccessful safety snapshot aborts the
operation. `tests/js/web_backup.mjs` covers malformed bundles, safety-write
refusal, and rollback.

### BUG-010 - desktop editor autosaved despite the explicit-save contract (FIXED IN WORKING TREE; UNRELEASED)

The design contract says panorama edits affect planning immediately in memory
but persist on Save or when leaving the editor. The desktop editor instead
starts a roughly 900 ms timer after painting, clearing, mode changes, undo, redo,
and calibration edits. The Save button is consequently closer to “flush now”
than an explicit persistence boundary.

**Resolution.** Ordinary edits remain in memory until explicit Save or editor
navigation; page-exit persistence is only a best-effort safety net. Dirty state
and save-status behavior are covered by the editor/UI tests.

### BUG-011 - Clear and Undo behavior was inconsistent (FIXED IN WORKING TREE; UNRELEASED)

Desktop Clear immediately changes the panorama without the in-page confirmation
dialog required by the design. Clear and mode changes also do not consistently
call the undo-button synchronization path, so the UI can show Undo disabled even
when a gesture has just created an undo entry. The web editor already follows a
different, dialog-based flow.

**Resolution.** Clear now uses the in-page confirmation dialog and creates one
undoable gesture. Undo/redo, mode, revert, and calibration synchronize their
controls through the shared history contract.

### BUG-012 - weather retry was inert after failure (FIXED IN WORKING TREE; UNRELEASED)

Both shells display a message that invites the user to click to retry. The click
handler only starts a request when there is no existing error, so after the first
failed request the advertised retry action does nothing. Changing site or date
may trigger another request, but that is not an adequate replacement for the
visible retry affordance.

**Resolution.** Retry is allowed whenever no request is active, clears the old
error, and preserves the generation guard. Source/UI tests and the browser gate
cover retry after rejection in both shells.

### DOC-003 - operational documentation still named old workspace roots (CORRECTED IN WORKING TREE)

The moved repository runs correctly from the new `G:\` path, but
`REVIEW-PROMPT.md` and several `AGENTS.md` operational/deployment references
still contain old development roots or mirror locations. No active runtime
dependency on the old main workspace path was found.

**Resolution.** Current workspace references now use the canonical G: checkout;
the old D: paths are labeled as legacy/archive or credentials-only references
where they remain necessary.

### Related open contracts

The elevation and theme-normalization findings are recorded in `DECISIONS.md`
because they require an explicit product/architecture decision before a safe
implementation can be chosen. The shared invalidation model is also recorded
there as a proposed cross-shell contract.

### Release readiness note

The current working tree is validated as a dirty development snapshot, not as a
tagged release. A fresh executable and release ZIP were produced, and
`scripts/check_release.py --allow-dirty` reports zero errors and one expected
dirty/off-tag warning. The clean-tag release sequence remains intentionally
unrun because no release was requested.

Baseline for this pass: `master` at `510ce69` (`v0.6.33-3-g510ce69`). The full
suite passed 598 tests, `scripts/check_js.py` passed, and the worktree was clean
before this documentation/cleanup pass.

**Fix pass 2026-09-17 (working tree, NOT tagged or deployed).** All six findings
below have implementation changes, regression tests and a recorded decision
(`RELEASES.md` "UNRELEASED - BUGS.md fix pass", `DECISIONS.md` "0.6.33 fix
pass"). What remains open is listed per finding as **Still open**. Verification
run: `python -m pytest tests/ -q` -> 620 passed, 0 failed; `python
scripts/check_js.py` -> OK; `python scripts/check_browser.py --web` -> **18/18
passed**; the desktop CSP verified live against a source-served server with
system Chrome.

## Priority summary

| ID | Priority | Status | Finding |
|---|---|---|---|
| BUG-001 | P1 | Fixed + pinned | A rejected desktop restore can overwrite existing payload files |
| BUG-002 | P1 | Fixed + pinned | Imported desktop fields can create executable HTML attributes |
| BUG-003 | P1 | CLOSED (meta carrier, live) | The production HTML document has no effective CSP |
| BUG-004 | P2 | Fixed + pinned | Some malformed backup shapes escape as HTTP 500 |
| BUG-005 | P2 | Fixed + gate verified | The Tonight browser check races its own 120 ms debounce |
| BUG-006 | P3 | Fixed + pinned | Deleting the active panorama leaves a stale setting |
| BUG-007 | P2 | Fixed + live | Public web weather fetch was blocked by the document CSP |
| DOC-001 | P3 | Corrected earlier | README said Shift scrubbed 10 minutes; the code uses 60 |
| DOC-002 | P3 | Corrected earlier | CATALOG said `--live` fetched the popularity source; the flag is removed |

The independent EOG/TESS validation work is now tracked separately in
`<workspace>\LightMap`.

## BUG-003 - production HTML has no effective CSP (CLOSED, meta carrier)

**Evidence.** Measured on 2026-09-17: `/astro/` and `/astro/app.js` returned no
`Content-Security-Policy`; `/astro/version.json` returned the repository policy.
A CSP protects only the response/document that carries it. The production smoke
searched JSON paths when the HTML lacked a header and counted that as a pass, so
it gave false assurance. `web/.htaccess` already explains that nginx serves
HTML/JS/CSS without reaching Apache.

**Fixed, and now enforced on the live origin.** Three parts:

1. The smoke reads the policy from the DOCUMENT (response header OR the
   document's own meta policy) and a missing policy is a hard failure; the
   `version.json`/`catalog.manifest.json` fallback is gone
   (`tests/test_prod_document_csp.py`).
2. The enforced policy ships as `<meta http-equiv="Content-Security-Policy">` in
   `web/index.html`. **Measured 2026-09-17:** `/astro/` answers `server: nginx` +
   `content-type: text/html` with no policy header, so nginx serves the document
   and `web/.htaccess` can never reach it; this host exposes no nginx directive
   field. The meta form carries every directive except `frame-ancestors` (which
   browsers IGNORE in meta - the check reports it if anyone adds it there).
3. `web/index.html` was deployed and
   `python scripts/check_browser.py --prod-url https://nightseam.de/astro/` ->
   **PASS**: the live document carries the policy and the inline-styled theme
   swatches still render.

**Found while fixing it (a real bug in the other carrier).** The header policy
shipped `style-src 'self'`, which SILENTLY blocks the shell's inline `style=`
attributes - measured: the sliders and theme swatches lost their styling while the
page booted normally and Chrome logged NO "Refused to" message. Both carriers now
say `style-src 'self' 'unsafe-inline'`, and the production smoke MEASURES a computed
background on an inline-styled element so the failure can never be silent again.

**Residual (documented, not a finding).** A meta policy is weaker than a header,
and `frame-ancestors`/`report-uri`/`sandbox` cannot be delivered that way - the
clickjacking header was never live either, and a local planner UI is a weak
clickjacking target. If the host ever exposes the nginx directive field, adding the
`add_header` line documented in `web/.htaccess` upgrades the carrier with no other
change.

## BUG-005 - the Tonight browser check races the render debounce (CLOSED by the gate)

**Evidence.** The check changed the scrubber and waited 120 ms. The application
also waits 120 ms before calling `renderTonight`, which then defers heavy work
again. Full sequence runs failed 25/26 while the same check passed in isolation;
failure artifacts showed stale/partial sampled rows.

**Fixed and VERIFIED.** `web/app.js` publishes the rendered selection on the view
root (`#view[data-ns-gen]` / `[data-ns-sel]`) after every completed Tonight paint
through `stampTonightRender` + `applyTonightMarker`, publishing the instant on the
SCRUBBER's own grid (`scrubTimeMs`: `#tb-scrub` is `step="15"`, so the browser
snaps what `syncScrub()` writes). `tests/browser/harness.py::wait_tonight_after`
polls for the REQUESTED instant (a generation bump alone is not enough - the boot
sequence can leave a stale marker), and the new check
`web-tonight-render-marker-converges` asserts marker == scrubber == requested.
`python scripts/check_browser.py --web` -> **18/18 passed**, including that check
and the corrected Tonight pool check. The offline contract is pinned by
`tests/test_tonight_marker.py`.

**Three real defects the new check found (all fixed).** (1) `renderTonight`
captured `S.skyTime` at call time while its compute runs ~30 ms later, so a
selection clamped in between painted cards for the old instant; it now reads the
live value inside the deferred callback. (2) `clampSkyTime()` announced
`sky:time` only when it CHANGED the time, so at boot the announcement arrived
before the scrub listener existed and both the slider and the Tonight view kept
the pre-clamp selection; it now announces unconditionally. (3) The `step="15"`
snapping above. See `RELEASES.md` for the measurements.

## Closed in this pass

These have implementation changes, regression tests that fail on the old
behaviour, and a recorded decision. They are listed here for one release cycle so
a reviewer can see what moved; remove the entries once the change is tagged and
`RELEASES.md` carries the release record.

### BUG-001 - rejected restore can overwrite payloads

`apply_import_zip` wrote payloads BEFORE `Database.import_bundle` validated the
bundle, so a bundle with a valid colliding payload plus an invalid record changed
the user's file from `ORIGINAL` to `REPLACED` and then reported only "the import
failed". The restore is now three ordered phases - validate everything
(`database.prepare_import_bundle`, side-effect free, used by the transaction too),
stage payloads on the destination filesystem with a `payload.journal` holding the
files they would replace (`_PayloadStage`), then run the database transaction and
swap only on success. Every failure path rolls back. Regression:
`tests/test_backup.py::test_a_rejected_restore_leaves_the_payload_bytes_untouched`,
`::test_a_rejected_restore_leaves_no_staging_residue`,
`::test_a_successful_restore_swaps_the_payload_in`, and the reworked
`::test_restore_is_atomic_when_a_payload_cannot_be_written`.

### BUG-002 - imported fields can create executable desktop attributes

The id rule was only the `u_` prefix and `imagetyp` was stored verbatim; both are
interpolated into HTML attributes (`static/js/setup.js` rendered
`u_x" onmouseover="globalThis.__pwned=1` as a working handler, `archive.js` puts
the frame-type rollup in a `title`), and the desktop CSP's
`script-src 'unsafe-inline'` made that executable. Now:
`database.custom_id_problem` requires `u_` AND `paths.safe_token()` (one rule,
shared with the insert loop); the import boundary normalizes `imagetyp` through
`ingest.classify_frame`; every desktop attribute sink escapes (`setup.js`,
`targets.js`, `tonight.js`, `pano.js`, the site/rig buttons); the two inline
`onerror=` thumbnail handlers became listeners; and `CSP_HEADER` is
`script-src 'self' 'sha256-lOMdolhkUqnnqFBUwwNKJYbMdAlQvEBKqybJqHdppbw='` - no
`'unsafe-inline'`. Regressions:
`tests/test_backup.py::test_import_rejects_a_custom_id_that_is_not_a_plain_token`,
`::test_import_normalizes_a_hostile_imagetyp`, `tests/js/dom_escape.mjs`
(mutation-proven) via
`tests/test_js_behaviour.py::test_desktop_attribute_sinks_escape_imported_data`,
`tests/test_update_check_csp.py::test_the_desktop_csp_hashes_the_one_inline_bootstrap`.

### BUG-004 - malformed backup shapes can return HTTP 500

`apply_import_zip` called `.get()` on the decoded top level before proving it was
an object, and `_accepted_records` ran before every panorama/image entry was
proven to be one, so `panoramas: ["not-an-object"]` raised `AttributeError` ->
500. `database.import_bundle_shape()` now runs immediately after `json.loads`: a
non-object top level, a non-list collection and a non-object entry in ANY
collection are a controlled `ValueError` -> 400, raised before the safety copy.
Regression:
`tests/test_backup.py::test_import_of_a_scalar_or_non_object_collection_is_a_400`.

### BUG-006 - active panorama setting can become stale

`DELETE /api/panorama/{pid}` removed the row and image but left
`settings.active_pano_id` naming it, and `set_active_panorama` stored any
token-shaped id. `Database.delete_panorama` now clears the pointer in the SAME
transaction and only when the deleted row was the one it named;
`set_active_panorama` refuses an id that names no row, and `POST /api/settings`
maps that to a 400. Regressions:
`tests/test_api.py::test_deleting_the_active_panorama_clears_the_pointer`,
`::test_activating_an_unknown_panorama_id_is_refused`,
`::test_the_database_refuses_a_dangling_active_pointer`.

### BUG-007 - public web weather fetch was blocked by the document CSP (CLOSED)

**Evidence (2026-09-19).** Clicking Weather on both the live beta origin
(`/beta/`) and the main origin (`/astro/`) ends in the same generic
"Could not load weather" state. The live document policies both declare
`connect-src 'self' https://en.wikipedia.org` but do not allow
`https://api.open-meteo.com`. The web shell fetches Open-Meteo directly from
`web/app.js::loadWeather`; its catch block hides the browser's precise failure
and presents it as an offline/provider error. A direct Open-Meteo forecast
request returned JSON during this check, so the confirmed cause is the site's
document policy, not a provider outage.

**Fixed and verified.** `https://api.open-meteo.com` is now in the `connect-src`
directive in both policy carriers (`web/index.html` and `web/.htaccess`), and
`tests/test_prod_csp.py::test_the_weather_provider_is_allowlisted_in_both_csp_carriers`
pins the agreement. The two files were deployed to both `/beta` and `/astro` on
2026-09-19. A live in-app browser check confirmed that both sites' document CSP
allows Open-Meteo and that the Weather panel populates with current conditions
and the four-day forecast. The repository Playwright gate remains unavailable in
this Windows sandbox because its browser subprocess is denied WinError 5; this
was compensated by the live browser check.

## Pre-existing accepted/deferred items - ALL CLOSED in 0.6.35

These were documented before the 0.6.34 audit and were not rediscovered as new
defects. All four were reassessed and closed in the 0.6.35 working tree, each with
a regression pin that a mutation proves (see `RELEASES.md`). Their original
severity was S4 ("migration") in every case, and the reassessment CONFIRMED two of
them and REFINED two:

- **CR2 - malformed-horizon defensive guards.** Confirmed, and larger than the
  note suggested: `visibleSkyBands` had already been fixed (CO-04), but
  `skyBandPolygons` and `profileSegments` still threw on 7 malformed shapes, and
  `ceilFor` checked the profile's LENGTH but not its ELEMENTS - returning
  `ceil: NaN` for a 720-long array holding NaN, which hides every object at that
  azimuth (`alt > NaN` is false). All three now degrade to the same empty sentinel
  their siblings use. Pin: `tests/js/horizon_degrade.mjs` + the new pytest case.
- **DS4 - the worker/detail peak disagreement.** REFINED, and the original note
  was imprecise. The two payloads sample DIFFERENT grids (night 6 min
  noon-anchored, detail 4 min dusk-anchored), so their peaks legitimately differ;
  the real defect was that the detail payload disagreed with ITSELF, taking the
  argmax over the 2-dp-ROUNDED array while the night path used the raw one. Fixed
  to the raw argmax. **What the fix does and does not change (measured):** since
  `round2(max(raw)) >= round2(raw[j])`, the rounded argmax can only land at or
  before the raw one, so the reported peak VALUE is unchanged - the difference is
  which of two equal-valued samples `max_time` names. The shipped ic434 row holds
  a single sample at its detail maximum over four dates, so no live fixture
  separates the two; the pin asserts the user-visible contract (peak and time
  describe one sample) and the engine records this limit rather than pretending a
  fixture exists. Pin: `tests/js/worker_failure.mjs`.
- **DS5 - worker revive.** Confirmed: `_worker.onerror` set the broken flag but
  kept the DEAD Worker, so `__NS_REVIVE_WORKER` handed the corpse back to
  `postMessage`. It now terminates and nulls the worker like the timeout path and
  the kill hook already did. Pins: `tests/js/worker_failure.mjs` (mutation-proven)
  and the new browser check `desktop-worker-error-disposal`.
- **WB7 - web backup bundle-version forward compatibility.** Confirmed: `version`
  was written at export and IGNORED on import, so a bundle from a future format
  was accepted and its fields read under this build's rules - a silent misreading
  reported as a successful restore. `stageBackup` now refuses a version above
  `BUNDLE_VERSION` with a message that says to update; v1 (no stamp) and v2 still
  restore. Pin: `tests/js/web_backup.mjs` (mutation-proven).

Related items that were NOT carried over because they are already closed: TL3
(verified by mutation - tampering `web/catalog.json` fails
`check_catalog_token`), TL4 (no spec is tracked; `build.ps1` drives PyInstaller
by CLI flags and writes its generated spec under gitignored `dist/`), and CR3
(a deliberate, documented non-change: the FOV-edge half-bin alters user-visible
scoring and needs its own release decision).

## Closing a finding

A finding moves to closed only when the implementation is changed, a regression
test proves the old behavior fails, the relevant focused checks pass, and the
full suite plus required JS/browser/release guards have been run. Record the
shipped result in `RELEASES.md`, then remove the closed item from this active
file; Git history preserves the investigation.

The fix pass followed that rule. BUG-003 is closed with the policy live on the
origin (production smoke PASS), and BUG-005 with the browser gate green
(`--web` 18/18, `--desktop` 8/8). BUG-007 is closed with its source pin and live
weather verification; the deferred items below are recorded here so they are not
rediscovered as findings.
