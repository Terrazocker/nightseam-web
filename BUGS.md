# Current NightSeam Web findings

## Repository and logic review — October 9, 2026

Broad source review of master at 471e64a found 38 confirmed defects: 4 P1,
30 P2 and 4 P3. No application fixes were applied during that review.
Phases 1–7 now resolve all thirty-eight findings locally. The final eleven
fixes and validation are recorded below. Reproduction inputs, exact
lines, actual/expected results, proposed fixes and review limits are recorded in
`logs/review/REVIEW.md` and its six linked subsystem reports. Reproductions and
transcripts remain in ignored logs/review. The independent catalog repository
was not included. These findings supersede any earlier general claim that the
local implementation has no remaining defects; historical resolved entries below
retain their original scope.

P1 is high-priority credential/data integrity; P2 is reproducible functional or
correctness failure; P3 is a smaller input, metadata or presentation defect.
The original review used deliberate fault injection for transaction abort,
read error and quota probes; its panorama photo restoration failure occurred
under the then-shipped CSP without such injection. Those defects are resolved
below. Unusual timezone/import triggers were specified in the detailed report.

| ID | Priority | Findings resolved locally in phases 5–7 / original primary source |
| --- | --- | --- |
| REV-028 | P2 | Minimum-altitude change invalidates/cancels freshly scheduled Catalog visibility work (`web/app.js:3894`). |
| REV-029 | P2 | Active site edit leaves the main displayed plan on old site data (`web/app.js:3539`). |
| REV-030 | P2 | In-place custom-target edits preserve stale cached search text (`web/app.js:3098`). |
| REV-031 | P2 | Maximum-altitude sorting falls through to magnitude (`web/app.js:1878`). |
| REV-032 | P2 | Null/absent weather values become zero readings and misleading ratings (`web/app.js:485`). |
| REV-033 | P2 | First forecast response can attach old-site weather to a newly selected site (`web/app.js:738`). |
| REV-034 | P2 | Altitude chart marks unobstructed below-minimum segments horizon-blocked (`web/app.js:2757`). |
| REV-035 | P2 | Button roles on data rows remove native accessible table/cell semantics (`web/app.js:1998,1199`). |
| REV-036 | P2 | Catalog filter changes lose focus for several controls (`web/app.js:1940`). |
| REV-037 | P2 | Type/reverse sorting lacks equivalent keyboard controls (`web/app.js:1931`). |
| REV-038 | P3 | Advanced mode help incorrectly says switching reloads the app (`web/index.html:118`). |

Existing A11Y-001 human acceptance and HOST-DELIVERY-001 live compression remain
separate open items. Current catalog manifests/core bake consistency passed;
upstream source-byte regeneration was not reconstructed. No production
deployment or native screen-reader/browser-zoom audit was performed.

## Phases 5–7 remaining review fixes — October 10, 2026 (local)

- REV-028/029: altitude changes invalidate before replacement Catalog work is
  scheduled; active-site saves refresh the actual planning view after commit.
  Owned batches cancel on context/view changes without leaving stale busy state.
- REV-030/031: custom edits invalidate search blobs; maximum-altitude sorting
  retains shared-core maximum altitude, warms all matching rows and uses stable
  name/ID ties. Unknown statistics stay last in either direction.
- REV-034: inspector chart colors consume the shared visibility reason, keeping
  below-minimum warnings separate from actual horizon/ceiling obstruction.
- REV-032/033: missing weather values remain unavailable; incomplete required
  hourly data cannot earn a night rating. Real zeros remain valid. Forecast and
  air responses belong to one site/coordinates/resolved-zone generation; stale
  successes/errors cannot replace current data. First pending requests, quick
  site edits and timezone changes follow the same ownership boundary. Provider
  requests use the planner's exact resolved zone rather than geographic auto.
- REV-035/036/037: Tonight/Catalog retain native table semantics and open targets
  through named cell buttons. Catalog controls preserve focus and search ranges;
  native header buttons, Type sort and Reverse order support keyboard sorting.
- REV-038: Advanced help describes live switching and full-catalog calculation.

The detailed original ignored logs/review report is absent from this checkout;
new browser regressions reproduce current behavior. The Catalog regression fails
against HEAD's original app module and passes with the fix. Original source line
numbers above are historical, not current navigation anchors. Actual full-gate
outcomes are in RELEASES.md. No release/tag/deployment accompanies these fixes.

## Phase 4 horizon fixes resolved locally — October 10, 2026

- REV-013: duplicate landmark IDs reserve suffix space before truncation;
  normalization is deterministic and bounded by the 128 retained landmarks.
- REV-014: cropped dabs retain vertical `r` and independently scale horizontal
  `rx`; repeated crops, sky-band edges and undo/redo preserve their altitude.
- REV-015: materialize old wrapped paint/erase copies in stroke order before
  clipping. A crop losing every dab explicitly clears its old derived profile.
- REV-016: preview, calibration and stroke coordinates share one effective kept
  band, expanded/clamped for the minimum and integer FOV. Crops never enlarge an
  already sub-45° frame; calibration retains exact azimuths internally.
- REV-017: Space pans only with canvas focus, releases on keyup/blur, and removes
  old listeners on editor teardown. Text spaces and native button activation work.
- REV-018: Undo/Redo/Revert restore calibration, landmark rows, selected-bin fields
  and comparison together; pending metadata is settled before history actions.
- REV-019: confidence input writes immediately to the displayed bin, including
  blank→unassessed. Selection, rerender, save and recovery retain edits/history.

Backup exports are format 3 so older readers refuse elliptical geometry they
cannot interpret; this build continues to read v1/v2. Imported stroke lists stay
bounded at 60,000, allowing seam copies of the previous 20,000-dab limit. Original
image bytes, authoritative stroke-less world profiles and frozen fixtures remain
unchanged. Remaining catalog, weather and accessibility findings stay above.

## Phase 3 resolved locally — October 10, 2026

- REV-005: boot initializes the computed date from the active site's calendar,
  using the same date for the top-bar input and planning.
- REV-006: canonical lunar longitude/latitude use the three published positive
  coefficients. Independent PyEphem/libastro anchors and individual sign
  mutations validate the correction; frozen historical fixtures are unchanged.
- REV-007: canonical culmination scans the complete selected site calendar day,
  including a supplied next midnight across DST. Rise/set retain their intended
  midnight ±12h search. The inspector now passes actual site midnight.
- REV-008: calendar-field resolution solves the offset at the resulting instant,
  independent of browser timezone. Folds choose the earlier occurrence; gaps
  shift forward, including half-hour transitions and Samoa's skipped date.
  Critical midnight/noon/fallback calculations pass fields directly.
- REV-009: full-day anchors invalidate on resolved timezone changes; explicit
  date edits move the selection to that site's noon. Stable dragging includes
  the right endpoint; bounds use next calendar noon (23/24/25 elapsed hours).
- REV-010: the night memo key includes the resolved zone and actual site noon.
- REV-011: shared Moon altitude subtracts the sea-level WGS84 observer vector
  in the equatorial-of-date frame and applies refraction once. All web Moon
  position consumers use it; phase/elongation retain geocentric J2000 positions.
  Lunar distance and observer position have independent numerical anchors.
- REV-012: culmination separation color uses illumination at culmination and
  compares the fraction against 0.15. Full/new Moon browser checks assert the
  actual rendered color and non-color proximity text.

The truncated lunar model remains approximate (sampled 2026 geocentric error
below 0.10°; tests allow 0.12°), unsuitable for precise occultation predictions.
The existing wall-Date display carrier cannot represent a wall hour inside the
browser's own DST gap; critical planning uses explicit fields instead.

## Phase 2 resolved locally — October 10, 2026

- REV-025: staging builds content-addressed web/landing release directories.
  Public HTML pins assets without changing page/fragment navigation; module
  data requests resolve beside their module. FTPS verifies complete immutable
  graphs before atomic public entry renames, retains old graphs, refuses
  conflicting immutable bytes, and blocks raw mutable website upload commands.
  Interrupted/partial uploads and retries are covered offline. Server-policy
  changes require separate review; no production FTPS access was performed.
- REV-026: one recursive graph discovers all web/landing HTML roots, secondary
  imports/re-exports/literal dynamic imports and shared CSS. Token updates
  propagate through every importer once, preserve manual advances, use the
  core manifest token, and are idempotent. Conflicts, missing dependencies and
  unversioned mutable references refuse both updates and baseline refreshes.
  Image credits' preexisting theme token 16 is corrected to the shared 21.
- REV-027: the release gate and both staging builders require Git tracking for
  every served artifact type in web/ and landing/. Only the exact generated
  web/version.json is exempt. Source/staged symlinks and incomplete or changed
  bundles fail; invalid sources leave an existing local candidate intact.

## Phase 1 resolved locally — October 10, 2026

- REV-001: FTPS verifies the server certificate and hostname before credentials,
  retains system/inherited CA trust, and closes authentication failures.
- REV-002: panorama photos decode locally under the existing CSP, persist through
  transaction completion, survive reload, and export current image bytes. Missing
  or unreadable photos reject backup collection. Photo/record failures preserve
  the original snapshot and editor history.
- REV-003: record writes await transaction completion. Sites, rigs, targets and
  safety metadata replace atomically; request-success-then-abort preserves all
  previous records instead of reporting success.
- REV-004: strict record/photo reads refuse incomplete exports and recovery
  snapshots. Reinitialization errors trigger complete post-commit recovery.
- REV-020: snapshot preferences replace current settings, resetting absent values
  to defaults. Failed preference writes preserve both stored and live state.
- REV-021: all consumed preference shapes/ranges/enums validate before writes.
  Records, photos, preferences, theme, reinitialization and immediate Tonight
  rendering share the rollback boundary. Transfers serialize Setup edits.
- REV-022: save/delete failures retain forms and authoritative displayed data;
  settings controls reset to the committed value and report failed persistence.
- REV-023: imported custom targets require safe, unique `u_` IDs and bounded
  coordinates. Canonical catalog objects cannot be replaced by custom imports.
- REV-024: RA/Dec parsing consumes complete inputs, rejects negative RA and extra
  components, and preserves documented carries such as `+22 0 60`.

Regression evidence is in tests/test_ftps_tls.py, tests/js/web_backup.mjs,
tests/browser/storage_checks.py, tests/browser/phase1_app_checks.py and the
panorama browser checks. RELEASES.md records the final validation outcomes.
At phase 1 completion, 29 findings remained; later phase entries record their
resolution. The current review status is at the top of this file.
No deployment or release tag was made for these local changes.

## Current remaining gates — October 10, 2026

Implementation, GitHub release and authorized deployment through v0.1.1 are complete
for the established website backlog. Later review fixes are local and unreleased.
IMPLEMENTATION_PLAN.md and REVIEW_REMAINING_IMPLEMENTATION_PLAN.md are the current
status authority; docs/history/WEBSITE_FINAL_REVIEW.md and dated findings below
retain the history of earlier runs.

- A11Y-001 remains open for a human screen-reader/native-browser-zoom pass.
  ACCESSIBILITY_ACCEPTANCE.md supplies exact steps. Browser keyboard, contrast,
  responsive and enlarged-content checks do not substitute for this acceptance.
- Publication is complete through v0.1.1: validated upload/readback, live browser
  checks and verified 260-file rollback backup; all twelve remote core directories
  remain. No deletions in this follow-up. The initial 0.1.0 release removed 81
  retired photos; its old attribution manifest was already absent. RELEASES.md
  records the separate receipts.
- HOST-DELIVERY-001: live HTML/JS and the two large catalog JSON payloads do not
  negotiate gzip. Cache-Control is correct; version/manifests do compress with
  Vary:Accept-Encoding. Enable full text/large-payload compression via supported
  Plesk/nginx controls/support, then measure actual GET responses. FTPS alone
  cannot configure these provider controls. See HOSTING_CONFIGURATION.md and
  logs/deployment-0.1.0-20261007/http-verified.json. Do not claim the local
  compressed startup simulation as a live result.
- BROWSER-LOCAL-001 remains monitoring-only: the runtime's five-connection queue
  accepted five paused-accept burst connections; the new queue of 64 accepted
  twenty. Historical artifacts identify refused local modules, but do not prove
  this capacity issue caused those particular failures. The gate records server
  thread health/backlog and failed URLs, with no retry or skip suppression.
  A request-handler connection reset was also observed during context teardown
  in the integrated runs; retain it as diagnostic evidence, not a boot refusal.
- DEC-003 resolved for the current product: elevation is explicitly stored site
  metadata. Setup/onboarding explain that it does not change visibility; the
  browser check changes only elevation and proves unchanged planning results.
- BROWSER-DIAG-001 resolved locally: diagnostic output escapes unsupported
  console characters. Regression checks retain exit 1 for a failed check and
  exit 2 for driver/infrastructure failure on a restrictive cp1252 console.

Planet/small-body ephemerides, seeing and offline reopening have a scope proposal
in FUTURE_FEATURE_SCOPE.md; they are not unresolved defects in shipped features.

## Resolved locally — Open workspace and advanced Catalog, October 6, 2026

Contradictory Workbench overrides framed workspace sections and filled actions;
the component layer now follows the open design in DESIGN.md. Horizon's older
canvas palette now uses semantic visualization roles. A populated-editor resize
notification loop is fixed by scheduling/cancelling observer work.

Advanced activation unnecessarily reloaded the app, and cache keys rehashed
720-bin profiles/strokes on every object lookup. Live mode switching, one prefix
per grid and owned/yielding batch work resolve the measured delay and stale busy
state locally. Evidence and performance limits are in DECISIONS/RELEASES.md.
Public deployment and the manual A11Y-001 audit remain separate pending work.

- DEC-003: resolved current-product semantics above; do not silently alter
  visibility from site elevation in a future change.
- A11Y-001: Real assistive-technology, native browser zoom and manual announcement
  acceptance remain pending. Phase 4 implements keyboard focus restoration,
  modal isolation, control semantics and quiet status messages; automated browser
  checks and screenshot review do not establish completion of the manual audit.

The measured one-sample grid-anchor difference recorded as CO-07 remains a
documented historical comparison, not a reason to alter the web's planned-night
calculations. Windows/catalog acceptance and storage/import findings now belong
to the independent Nightseam-catalog repository.


## Website review — October 5, 2026

Full evidence and design recommendations: logs/website-review-20261005/REVIEW.md.
Open findings remain below; Phase 1 fixes are recorded separately.

- WEB-REV-003 resolved locally: the separate selection implementation preserves
  S.detailId when the inspector closes and uses S.detailOpen for visibility.
  Six selection-continuity browser checks passed the recorded 39/39 gate;
  the earlier October 5 observation describes the pre-fix code.
- A11Y-001 upper time slider is labeled locally and exposes its selected clock
  time. Phase 4 implements popover state semantics and keyboard focus restoration;
  manual assistive-technology/zoom acceptance remains open. Public
  landing contrast LAND-REV-003 is resolved locally in Phase 3 below.
- WEB-REV-004 resolved locally: Popularity is removed from the visible sort
  selector; initial and cleared-filter order is Name ascending. Internal
  popularity scoring, tie-break policy and Standard catalog membership remain.

The October 5 review observed deployed 0.6.34 and the old combined-download
page. This overhaul has not performed a public deployment. Do not confuse pending publication with a local code fix,
or advertise the independent local-only catalog as a new public download.

## Resolved locally — Phase 1, October 5, 2026

- WEB-REV-001: shared scoring clips positive-duration cells to the half-open
  dark window and weights partial cells. All four views consume the same bounded
  endpoints and usable durations. Berlin NGC 281/225/457 now end at dawn 05:21:52
  rather than 05:28:14. Reference anchors and frozen fixture bytes are preserved.
- WEB-REV-002: both photo policies allow the required Wikimedia connection and
  blob-image scheme. Strict browser checks pass for decoded bundled/fresh/cached
  images, persisted cache after reload and unavailable-provider retry recovery.

Validated locally: 256 tests passed, 1 existing optional skip; 30/30 browser
checks passed. These fixes are not yet deployed publicly; other review findings
remain open. See RELEASES.md for validation and DEVELOPMENT.md for contracts.

## Phase 2 publication checks — October 6, 2026

- HOST-001 resolved locally October 6: owner confirmed ZAP-Hosting, no CDN,
  daily Plesk log rotation, maximum seven retained rotated files, compression
  enabled and no email forwarding. Current logs show full IP addresses; the
  owner cannot enable anonymization. Privacy describes this actual configuration
  without claiming an exact seven-day deletion deadline or establishing the
  retention of separate provider records. The owner considers this check done.
- IMAGE-001 resolved locally October 6: all 81 legacy bundled object photos,
  their manifest and obsolete generator were removed. Objects now use direct
  Wikipedia thumbnails with browser caching and exact-file credits. The 37
  unknown-source and 44 DSS images are no longer shipped; their publication
  dependency is removed, without claiming that their rights were verified.


LAND-REV-001 copy mismatches are corrected locally: browser-local planning,
loaded-tab offline limits, optional startup weather, coordinates/timezone,
photo requests and hosting are described consistently. HOST-001 is resolved above.
LAND-REV-002 is corrected locally: Changes has generated static notes and explicit
empty states, with no startup fetch/loading placeholder. The owner's subsequent
reset replaces old public notes with the single independent 0.1.0 entry; legacy
records remain in Git history. See RELEASES.md for final
validation. These changes are not deployed publicly.

## Local browser validation follow-up — October 6, 2026

- A11Y-002 resolved locally in Phase 4: modal stops exclude closed disclosure
  descendants and other unreachable controls. Browser checks assert the actual
  starting focus and exact wrap destinations with disclosures closed and open;
  the general accessibility check no longer uses rectangles alone. This does
  not close A11Y-001's real assistive-technology acceptance. Original evidence:
  logs/target-selection-continuity/REPORT.md section 6, finding F1.
- BROWSER-DIAG-001 (historical observation; resolved October 7 above): printing a failed browser check's Unicode diagnostic on a
  cp1252 console can raise UnicodeEncodeError and misclassify the check failure
  as infrastructure startup failure. Failure printing then used plain print.
  This prompted encoding-safe diagnostics that preserve the original failure
  category. Evidence: the selection agent's report, section 6, finding F2.
- BROWSER-LOCAL-001: two full Phase 2 browser runs failed before planner boot
  on web-sun-moon-above-horizon with ERR_CONNECTION_REFUSED. The isolated check
  passed, and the final full run passed 32/32 after diagnostic-only changes.
  Root cause remains unconfirmed; do not claim a product fix from this pass.
  Failure artifacts remain in logs/browser/artifacts. The harness now records
  failed-request URLs so a recurrence can identify the refused resource/origin.
  Browser startup failures remain hard failures; no retry/skip suppression was added.


## Resolved locally — Phase 3, October 6, 2026

- LAND-REV-003: public pages use canonical Workbench roles with readable primary,
  secondary and action text. Browser contrast checks require at least 4.5:1
  against the corresponding base/action surfaces; screenshots verify the subdued
  decorative hero treatment. Automated keyboard/no-JavaScript/phone checks are
  added. These checks do not close the separate A11Y-001 manual planner audit.

HOST-001 and IMAGE-001 are resolved locally above. The historical local browser
refusal remains a monitoring item; diagnostic encoding is now fixed. No Phase 3
code is deployed publicly.
