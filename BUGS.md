# Current NightSeam Web findings

## Current remaining gates — October 7, 2026

Implementation, GitHub release and authorized deployment of v0.1.0 are complete
for the established website backlog. WEBSITE_FINAL_REVIEW.md and IMPLEMENTATION_PLAN.md are the
current status authority; dated findings below retain the history of earlier runs.

- A11Y-001 remains open for a human screen-reader/native-browser-zoom pass.
  ACCESSIBILITY_ACCEPTANCE.md supplies exact steps. Browser keyboard, contrast,
  responsive and enlarged-content checks do not substitute for this acceptance.
- Publication is complete: v0.1.0, validated upload/readback, live browser checks,
  rollback backup and 81 retired photo deletions. The old attribution manifest
  was already absent. All pre-existing remote core directories remain.
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
