# BUGS.md - current NightSeam findings

This is the active defect backlog. It records findings that are confirmed in the
current tree but are not fixed yet. `AGENTS.md` remains the implementation
contract, `DECISIONS.md` records durable choices, and `RELEASES.md` records what
actually shipped. Closed historical review bundles were removed from the working
tree on 2026-09-17; Git history remains the archive.

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
| DOC-001 | P3 | Corrected earlier | README said Shift scrubbed 10 minutes; the code uses 60 |
| DOC-002 | P3 | Corrected earlier | CATALOG said `--live` fetched the popularity source; the flag is removed |

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

## Pre-existing accepted/deferred items

These were already documented before this audit and were not rediscovered as
new defects: malformed-horizon defensive guards (`CR2`), the worker/sync
one-bin `ceil` residual (`DS4`), worker-revive coverage (`DS5`), and web backup
bundle-version forward compatibility (`WB7`). Reassess them separately; do not
silently merge them into the findings above.

## Closing a finding

A finding moves to closed only when the implementation is changed, a regression
test proves the old behavior fails, the relevant focused checks pass, and the
full suite plus required JS/browser/release guards have been run. Record the
shipped result in `RELEASES.md`, then remove the closed item from this active
file; Git history preserves the investigation.

The fix pass followed that rule. BUG-003 is closed with the policy live on the
origin (production smoke PASS), and BUG-005 with the browser gate green
(`--web` 18/18, `--desktop` 8/8). Nothing in this file is a confirmed OPEN defect
any more - what remains is the release decision and the deferred items below,
which are recorded here so they are not rediscovered as findings.
