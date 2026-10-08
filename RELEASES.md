# Independent website release record

## v0.1.1 — release preparation, October 8, 2026

Owner authorized release/commit/GitHub publication and deployment of the validated
annotation improvements, plus correction of stale overhaul-plan publication prose.
Curated the independent 0.1.1 Changes entry and retained the original 0.1.0 entry.
The inherited tags and independent catalog remain untouched. Human AT/native zoom
and provider compression remain separate open gates.

Final source pytest: 295 passed / 1 existing optional skip in 92.42s. JS/core/
catalog/cache/encoding and development release guards passed. One full browser
run found a Horizon phone assertion measuring two layout generations with
separate locator calls after resize/Save. The captured layout was correct;
wait for pending animation frames and read both rectangles atomically, preserving
the same stacking assertion. Its focused check passed, then the complete browser
gate passed 53/53. Both transcripts are retained in ignored deployment logs.
Deployment evidence follows after actual publication.

## Unreleased — compact Sky time rail, October 7, 2026

Removed Sky's duplicated site datetime input and visible range-help row. Date
editing remains in the common top bar. The four twilight labels stack to the
left of the longer slider; Now/Reset remain on the right. The desktop rail is
at most 66px high in acceptance coverage. Phones give the slider its own
full-width row above the compact legend/actions. Selected clock, phase text,
range endpoints, honest polar conditions and accessible range help remain.
Shared site-zone astronomy and one-minute time synchronization are unchanged.

Updated time-pinning fixtures to operate the actual slider with the versioned
webstore site-zone conversion; retained selection and interval coverage.
Desktop/640/360px annotations-sky screenshots inspected. Targeted layout and
six selection checks passed. Full Python suite: 295 passed / 1 existing optional
skip in 99.11s. JavaScript/encoding/cache/core/catalog guards and development
release check passed (0 errors; expected dirty-version warning). Full Chrome
browser gate: 53/53 passed, including interval agreement, one-event time
synchronization, responsive layouts and all selected-target continuity cases. App 164 / style 55 / themes 21 register and public page
references align. Local preview returns HTTP 200 on port 8081. No commit or
deployment; previous uncommitted work preserved.

## Unreleased — simpler overviews and direct settings, October 7, 2026

Removed Tonight's Visibility reason and Rises later columns, leaving rank,
target, relative score, maximum altitude and best usable interval. Header alignment
and narrow-table widths follow those five columns. Removed Sky's visible-now list,
its per-draw sort/filter/DOM rebuilding and obsolete styles; map picking, selected
target reopening, unplotted notices and the full inspector remain synchronized.

Site/Rig words are accessible settings buttons beside independent native selectors.
Site opens the active site's edit form; Rig opens the selected rig's edit form,
or equipment setup if none is active. They use brass hover and keyboard-focus
feedback and preserve Setup return focus. The owner's additional hover request
is included. Filter controls remain: Hα/OIII affect Tonight's score with Moon-aware
ranking enabled while the Moon is up, using the existing global OIII-over-Hα-over-
broadband assumption. Menu help now explains this conditional effect, and a
broadband warning displays BB rather than erroneous NB. Core calculations unchanged.

Final validation: full pytest 295 passed / 1 existing optional skip in 96.94s;
full Chrome browser gate 53/53 passed; JS/encoding/cache/core/catalog guards and
development release check --allow-dirty --no-stage passed with 0 errors and the
expected dirty-version warning. The first full browser run found one interval
test still clicking the removed list; converted it to map picking, verified the
interval check separately, then reran the full gate successfully. No coverage
was dropped. The new acceptance checks five columns, direct active-record forms,
no-rig setup, native rig selection, hover, Enter/Space, returned focus, phone fit,
removed list and correct broadband badges. Existing selection/interval checks use
real map clicks through shared-core positions in isolated browser fixtures.

Desktop/phone simplified-*.png screenshots inspected in logs/browser/artifacts/.
Register/baseline align at app 163, style 54, themes 20, horizon 75; all public
pages reference shared themes 20. Local preview remains on port 8081. Development
version remains v0.1.0-1-g3b02147-dirty. Nothing staged, committed or deployed;
previous uncommitted work preserved and production v0.1.0 unchanged.

## Unreleased — smooth time and Horizon annotation follow-up, October 7, 2026

Both time sliders and the selected-time presentation marker now use one-minute
steps rather than 15 minutes. Model/controls/inspector facts synchronize immediately;
Sky and inspector canvases coalesce time input to one latest-state redraw per frame.
Obsolete Sky frames are cancelled on rerender/route exit and inspector frames on
close. Inspector facts reuse the existing site/date/timezone window memo; core
astronomy, scoring resolution and range/clamping rules remain unchanged.

The whole wide-screen Horizon tools rail now sticks and scrolls within the
viewport, instead of its first card overlapping paint/history controls. Layouts
at 1240px and below return to normal flow. The body grows with content so tall
panoramas do not scroll the common header out of its sticky containing block.
The optional numeric panel has clearer direction/height labels, mode-dependent
upper-edge availability, confidence/comparison help and an explicit explanation
of its existing paint-to-stored-profile transition and Undo/Save. Undo/Redo now
keep the paint-mode selector, block-above checkbox and numeric fields synchronized
with the restored horizon model.

Validation: full pytest 295 passed / 1 existing optional skip in 108.17s; full
Chrome browser gate 52/52 passed; check_js.py and development release check
--allow-dirty --no-stage passed (0 errors; expected dirty-version warning).
The new acceptance exercises both real one-minute keyboard increments, 40 input
events with an open inspector (one paint per canvas at the final time), route
exit with a pending paint, a tall photo at 1894x900 and 1440x700, non-overlapping
rails and keyboard-reachable Save, mode/Undo synchronization, and 360px stacking.
Final desktop/phone screenshots inspected in logs/browser/artifacts/followup-*.png.
Advanced-mode CPU-throttled checks also remain green. No new unresolved finding.

Tokens/register/verified baseline align at app 162, horizon 75, style 53;
themes remains 19. Local preview /astro/ serves the new entry points at port 8081.
Version remains truthfully v0.1.0-1-g3b02147-dirty. Nothing staged, committed,
tagged or deployed; production v0.1.0 is unchanged.

## Unreleased — planner annotation changes, October 7, 2026

Implemented the four owner annotations alongside the existing public header edit:
open checkbox object-type filters with OR selection, modifier-free interaction,
clear selection help and preserved focus; 50-object Catalog pages in an available-
height keyboard-scrollable table; selected-time condition labels instead of the
misleading Rises later status/filter; Sky time controls above the map with matching
top-bar input styling and shared actual-Sun twilight tracks; and removal of
Tonight's duplicate local slider/listener/styles.

Catalog window/clear-window facts now use compact summaries inside the current
revision-keyed observation cache, populated through the existing shared-core page
batch/warm loop. Fresh Catalog entry and date changes therefore do not require
Tonight to supply window facts. Conditions distinguish usability, horizon blocks,
the altitude limit, below-horizon position and the planning window. Tonight's
reason label also respects outside-window conditions when altitude alone clears.
The core formulas, planning-window policy and whole-night ranking are unchanged.

Final validation: full pytest 295 passed / 1 existing optional skip; full Chrome
browser gate 51/51 passed; check_js.py passed; development check_release.py
--allow-dirty --no-stage returned 0 errors, with the expected unreleased/dirty
Git warning. The first pass caught a register entry not yet updated after the
final token bump and two browser-test issues (an obsolete clock-only accessibility
assertion and a missing assertion message); corrected before the clean full rerun.
The new browser acceptance covers independent type clicks/Space/focus, pagination,
fresh Catalog windows, date-change agreement with the full inspector, synchronized
phase tracks and polar daylight without a fictitious night band. Existing checks
cover full-day time ranges, selected-time notifications, storage, photos/credits,
source retries, horizon editing, and public pages.

Inspected actual Catalog/Sky screenshots at 1894x1244 and Sky at 640/360x900 in
logs/browser/artifacts/annotations-*.png. Advanced mode still passes its populated-
horizon/4x-CPU check: first table 0.29s, complete visibility 2.17s, three cached
Catalog scrubs 0.20s. These are local test measurements, not hosting guarantees.
Tokens/register/verified baseline align at app 161, style 52, themes 19; public
pages reference shared themes 19 and retain their public stylesheet token 4.
Version metadata truthfully reports v0.1.0-1-g3b02147-dirty. No changes staged,
committed, tagged or deployed; published v0.1.0 remains unchanged.

## Unreleased — public header planner action, October 7, 2026

All six public pages now show a compact brass Open planner link in the top bar,
aligned with the wordmark and desktop navigation. Phone layouts keep the action
visible beside the native menu, including with JavaScript disabled and the menu
closed. Home and Features retain their existing hero action. The public stylesheet
token moves from 3 to 4 on every entry page and in the AGENTS register.

Validation: pytest 295 passed / 1 existing skip; JavaScript/source guards passed;
the three public-page browser checks passed, including 200% CSS zoom, keyboard
navigation and all six pages at 640, 360 and 320 pixels. Desktop (1894px) and
320px phone screenshots were inspected in logs/header-planner/. This local change
is not committed or deployed; the published immutable v0.1.0 is unchanged.

## Published — NightSeam Web 0.1.0, October 7, 2026

Deployed the immutable v0.1.0 release at commit
39ac0461c0ee4fc564c5e52fa509a896a068d8fb after explicit owner authorization.
GitHub release: https://github.com/Terrazocker/nightseam/releases/tag/v0.1.0.
The host's existing redirect serves the planner at https://www.nightseam.de/astro/.
The independent Windows catalog and remote beta/download archives were untouched.

Before writing, inventoried and backed up 311 files (26,994,503 bytes), including
all ten existing remote core hash directories. Uploaded all 54 release files,
dependencies before HTML, using fresh encrypted FTPS connections. FTPS readback
SHA-256 matches all 54 files; decoded HTTP hashes match 52 readable files and
both entry routes. Live version.json and footer report 0.1.0 / v0.1.0.

Production smoke passed (one local smoke plus one live check, 2/2). Additional
isolated live-browser acceptance verified 16 Tonight rows at the pinned night,
Catalog/Sky/Horizon navigation, a decoded fresh M42 thumbnail, actual NASA/ESA
credit and license, the same cached photo/credit after reload, OpenNGC source
history and return-visit storage. The canonical www origin has no console/page
errors or failed same-origin responses. All six public pages passed at 1240px
and 360px; live screenshots were inspected. The original 295-test/50-browser
release evidence remains the source validation; no shipped implementation changed.

Only after acceptance, checked retired files against their backup hashes and
deleted the 81 explicitly listed JPEGs. image-attributions.json was already
absent. Every pre-existing core directory is retained. Backup, upload, hash,
browser and cleanup receipts live in ignored logs/deployment-0.1.0-20261007/.
No credential values were printed, copied into the repo or included in assets.

Measured live cache policy is correct for entry HTML, versions/manifests and
numeric-token assets. Version/manifests negotiate gzip, but HTML/JS and the large
catalog/provenance JSON responses do not. HOST-DELIVERY-001 remains for supported
Plesk/nginx compression configuration; this is not a failed deployment or a claim
that the local compressed benchmark was observed live. Actual human AT/native
zoom acceptance also remains pending. The release tag and published asset bytes
remain unchanged by this subsequent documentation receipt.

## Release authorization — NightSeam Web 0.1.0, October 7, 2026

The owner authorized the current accepted website overhaul for commit, a fresh
v0.1.0 tag and GitHub release on codex/website-phase-two. The existing private
Terrazocker/nightseam repository remains the remote; master and inherited tags
are preserved. Exact immutable commit/asset hashes and clean-stage validation
are recorded in the GitHub release and its downloadable release manifest.
GitHub publication does not establish a deployment to nightseam.de.

Pre-release review found a packaging issue: regeneration after committing the
81 legacy photo deletions would drop their cleanup paths. The reviewed 82-path
inventory now has a tracked ledger, validated path bounds and regression coverage
for clean regeneration and invalid/duplicate paths. The single public 0.1.0 entry
uses the actual release date, October 7. Planner modules/data are unchanged from
the final 50/50 integrated browser gate; regenerated public history passed both
landing browser checks. Full post-packaging suite: 295 passed, one existing skip
(76.29s). JavaScript/core/catalog/cache guards pass. Human AT/native zoom and live
host acceptance stay open.

## Unreleased — Remaining backlog and integrated review, October 7, 2026

Completed WEB_REMAINING_WORK_PLAN.md locally. Optional 6.74 MB provenance no
longer blocks boot; one validated lazy request serves disclosures/export with
timeout, retry, identity/connectivity checks and truthful failure states.
Open disclosures survive refresh. Malformed source fields cannot create an
empty authoritative download. No catalog/provenance bytes or core math changed.
Elevation is explicitly metadata at entry; a browser check proves changing only
elevation preserves planning and persists the recorded value.

Encoding-safe browser diagnostics preserve exit 1 versus exit 2 on cp1252.
The local gate server's listen queue is 64, with liveness/backlog diagnostics.
Paused-accept bursts measured five accepted connections at the old default and
twenty at the new capacity. Historical refusal causation remains unconfirmed;
no retry/skip hides failures. Both integrated runs also printed a request-handler
connection reset during context teardown; it is retained as diagnostic evidence.

Recursive FTPS uploads now flatten/sort all assets before any HTML, including
nested pages. Deployment/release helpers exclude credential files. Both public
trees have prepared gzip and numeric-token cache rules with manifests/HTML
revalidated. The local delivery simulator tests negotiation, ETag/304, cache
reuse/invalidation. Review caught and fixed its per-request cache rebind.
HOSTING_CONFIGURATION.md retains the actual Apache/nginx/live-verification gate.

Comparable Chrome/CDP 5 Mbps/120 ms samples measured slow cold startup
22.240s → 11.154s from lazy sources; slow warm 11.747s → 0.559s. Prepared-policy
local simulation measured 4.091s cold / 0.420s warm and 1,134,682 cold wire bytes
instead of 12,353,745. These are one-sample local measurements with actual HTTP
caching and no request interception; they are not current host results.
WEBSITE_FINAL_REVIEW.md records all scenarios and screenshot/copy review.

Final validation: full pytest 288 passed, 1 existing optional-data skip (90.05s).
JS syntax/import/encoding and core/catalog/provenance/cache guards passed for
42 modules. Full browser gate 50/50 passed, including the two new provenance/
elevation checks. Initial gate was 49/50: the older accessibility assertion
assumed synchronous source loading; it now waits for the complete disclosure
and retains both provenance/history assertions. Focused acceptance then passed,
followed by the final full gate. No product error was suppressed.
Development release preflight: 0 errors, expected v0.6.36-dirty warning;
0.1.0 pre-tag and generated history checks pass. Tokens: app158, horizon74,
style50, themes18, core45; register/references/baseline agree.

The verified ignored dist/publication-preview contains 54 files, a SHA-256
manifest, truthful v0.6.36-dirty describe and 82 explicit retired cleanup paths.
It is a local review candidate, not a tagged release. Root docs now consolidate
current authority and historical plans; release/rollback steps are concrete.
All six public pages and all four planner views were inspected at desktop/phone
widths. Real AT/native zoom, clean reviewed commit/tag, publication authorization,
actual hosting headers, live smoke and cleanup remain external/manual gates.
Future ephemeris/seeing/offline proposals are separately scoped, not advertised
as shipped. No Git staging/commit/tag, public deployment or sibling changes.

## Unreleased — Open workspace and advanced Catalog, October 6, 2026

Implemented WEB_OPEN_DESIGN_IMPLEMENTATION_PLAN.md using the independent catalog
as a read-only visual reference. Replaced contradictory Workbench overrides with
a shared page surface, unframed workspace sections, transparent actions and
underlined tabs. Retained clear inputs/focus/selection and bounded temporary
dialogs/menus. Opened all four planner views and the full inline/docked inspector;
Horizon canvas backgrounds/grid/profile marks now use semantic roles. Scheduled
and cancelled Horizon container resizing to avoid an observer notification loop.
Public-page composition remains approved; canonical theme references were updated.

Advanced mode changes live instead of reloading the full application/catalog.
Catalog shares a grid snapshot/panorama fingerprint, avoids per-row twilight
rescans, filters search before visibility work and uses one owned/cancellable
background job with small shared-core batches. Page fills use revision/generation
guards. Core astronomy, catalog data and independent desktop files were unchanged
by this task; earlier uncommitted phases remain present.

The populated 720-bin profile benchmark measured first table/full visibility at
1.21s/2.45s before and 0.13s/0.20s after on normal CPU. At 4x CPU slowdown it
measured 6.57s/14.31s before and 0.25s/1.13s after; longest task fell from 5.55s
to 0.11s, with no catalog refetch. These local timings are not network/hardware
guarantees. Final focused acceptance also verified three cached scrubs in 0.12s
at 4x slowdown without recomputing full-night percentages or retaining busy.

Cache tokens: app156, horizon74, themes18; style50 and core45 unchanged by this
task. Public references, AGENTS and verified baseline agree. Validation: full
pytest 271 passed, 1 existing optional-data skip (80.29s); full browser gate
48/48 passed, including live Advanced activation with a populated horizon and
open-workspace/temporary-window boundaries. The subsequently extended focused
scrub/cancellation check passed. JS/import/syntax/encoding/catalog/core/cache
guards passed; development release preflight after pytest: 0 errors, expected
v0.6.36-dirty warning. Diff whitespace check passes with repository CRLF handling.
Desktop/phone captures in ignored logs/phase4/screenshots/ and populated Sky/
Horizon captures in logs/open-design/ were inspected. Manual A11Y-001 acceptance
remains pending. No staging, commit, tag or public deployment.

## Unreleased — Simplify Tonight and filter/editor controls, October 6, 2026

Removed Tonight's overview graph, track checkboxes/legend, unused six-minute
track computation and observer; the brief, selected-time scrub and ranked table
remain. Full target inspectors retain their altitude chart. Removed Horizon's
calibration provenance controls/bindings and their UI-to-model assignment so
existing saved/imported provenance survives Save, history and backups. Actual
calibration and profile/confidence tools remain. Catalog object types now size
to the complete available option count, without a fixed-height scrolling list.

Cache tokens: app155, horizon73, style50; register, references and baseline agree.
Validation: focused full-list/metadata Save/reload browser check passed, desktop/
compact inspector and Tonight fit check passed; full pytest 271 passed, 1 existing
optional-data skip (92.39s); JS/import/syntax/encoding/catalog/core/cache guards
passed. Development release preflight: 0 errors with expected v0.6.36-dirty
warning. Full browser gate: 46/46 passed. Desktop/phone captures in ignored
logs/phase4/screenshots/ were refreshed and inspected. Diff whitespace check
passes. No commit, tag or deployment.

## Unreleased — Sky View single full inspector, October 6, 2026

Removed the duplicate compact target facts and miniature altitude chart. Sky
View now places collapsed chart controls/legend first in the rail, the shared
full inspector next, and visible-now targets below. Target clicks open full
details directly. Closing retains selection and a small reopen action. The
inspector stays inline/complementary at every width, leaving map/time controls
usable and avoiding a second reserved column. Its wrapper survives workspace
rebuilds and is parked outside #view before routes or Setup dialogs take over.
Removed the old theme rail-width override; desktop details now fit their rail.

Cache tokens: app154, style49, themes17; entry points, AGENTS register and verified
baseline agree. No core math changes. Validation: full pytest 271 passed,
1 existing optional-data skip (80.93s); JS/import/syntax/encoding/catalog/core/
cache guards pass; focused selection 6/6, single-inspector lifecycle 1/1,
responsive detail fit 1/1 and interval agreement 1/1 pass. Development release
preflight after pytest: 0 errors, expected v0.6.36-dirty warning; diff whitespace
check passes. An earlier overlapping preflight saw pytest's deliberate invalid
web/lib/geom.js token fixture; pytest removed it and the final preflight is clean.
Visual captures at 1672/1240/360px are in ignored logs/sky-layout/. Full browser
gate: 45/45 passed, including the new single-inspector lifecycle check. No
commit, tag or deployment.

## Unreleased — Phase 4 planner usability and accessibility, October 6, 2026

Implemented readable header groups for observing setup and planned night/time,
without shrinking text to fit; selected time remains visible on phones. Tonight's
table has a named keyboard-accessible horizontal scroll region. The empty
Horizon layout stacks correctly on phones, and upload/import actions are keyboard
reachable without duplicate hidden-file-input stops. Target map labels retain
screen font size while zooming, try nearby bounded positions and avoid each other;
Tonight's end ticks align inward. Sky chart alternatives use the site clock.

Options/Weather expose expanded/control relationships, allow only one panel open
and restore trigger focus on Escape. Setup restores visible opener focus,
including takeover of a wide inspector; both tab strips expose selection/panel
relationships and support arrow/Home/End navigation. Scoped controls and scroll
regions win over global time shortcuts. Modal stops exclude closed disclosures
and unreachable controls; actual modals isolate background roots, while wide
inspectors stay complementary. The trap is active during the first visit too.
Quiet view/site/night/rig announcements replace the whole-dialog live region;
local Setup statuses and validation errors keep their own announcement roles.

Welcome now explains example Berlin coordinates, Options → Setup, optional rig
Frame % estimates and Horizon. Invalid entries are preserved with readable
feedback. Existing selection continuity, scoring, storage/backup and unsaved
horizon-edit contracts are preserved. No core math or public-page redesign was
changed. Final cache tokens: app152, horizon72, style48; references/register and
verified baseline agree.

Final validation: full pytest 271 passed, 1 existing optional-data skip
(80.40 seconds); full browser gate 44/44 passed, exit 0, including five new
Phase 4 checks and the existing six selection checks. JavaScript integrity passed
for 42 modules, with import/syntax/DOM/encoding/catalog/provenance/token/core
guards OK. Development release preflight returned 0 errors with the truthful
v0.6.36-dirty warning. Diff whitespace check passed.

Focused checks and screenshot review caught premature popover closure during
intermediate blur, enlarged-layout table overflow, shortcut interference with
scrolling, empty Horizon column specificity and duplicate upload accessibility
targets; each was corrected before the final gates. The first full browser run
passed 43/44: its Tonight row check assumed every row fit fully on screen despite
allowing internal scrolling. It now validates containment in a named, reachable
scroll region and keeps page-overflow checks; the corrected full gate passed
44/44. A final local-status-role correction was followed by the final gates above.

Eight screenshots cover all four views at 360/1240px; responsive checks also
cover 640/900px and CSS enlargement. Evidence/manual checklist:
logs/phase4/ACCEPTANCE.md and logs/phase4/screenshots/. Phase 4 implementation is
complete locally. A11Y-001 remains open for actual screen-reader/native browser
zoom acceptance; automated evidence does not claim that acceptance. A11Y-002 is
resolved locally. Existing diagnostic-printing/server-refusal findings remain
open. No staging, commit, branch change, release tag or deployment was performed.

## Unreleased — Selection-agent handoff integrated, October 6, 2026

Reviewed logs/target-selection-continuity/REPORT.md and its final browser
transcript. The implementation and six checks were already in the shared working
tree and included in subsequent primary-agent gates; no patch replay or branch
change was needed. Added missing decision/design guidance and recorded the two
unresolved focusability/diagnostic-printing findings. Updated Phase 4 status to
reflect the completed selection, sorting and time-slider naming work.

The agent's historical receipt records 268 pytest passes and one optional skip,
JavaScript guards OK and a final 39/39 browser gate. Its app token142 is
historical; current token145 is preserved. Handoff verification on the current
tree: selection browser checks 6/6 passed; token self-test and guard passed;
diff whitespace check passed. Only documentation changed during integration,
so the latest full product validation below remains applicable. No follow-up
behavior fixes, staging, commit, tag or deployment were performed.

Additional quick verification requested by the owner: 31 focused browser-gate
registration/UI invariant tests passed; JavaScript integrity checks passed for
42 modules (no broken imports or syntax errors), with DOM, encoding, catalog,
provenance, token and core guards OK. Development release preflight returned
0 errors and the expected v0.6.36-dirty warning. The 20 heuristic possible-
undefined candidates are unchanged advisory output, not failed checks. This
quick pass does not replace the full validation or close the recorded follow-ups.

## Unreleased — Catalog sorting and time-slider accessibility, October 6, 2026

Removed the visible Popularity sorting option. Catalog now defaults to Name
ascending and returns to that order when filters are cleared. Internal ranking
and Standard 200 membership are unchanged. The upper time slider has the
accessible name "Selected observing time" and exposes the displayed site clock
through aria-valuetext, including after keyboard changes. App token is145;
entry-point references, register and token baseline are aligned.

Validation: focused UI invariants 24 passed; focused slider and accessibility
browser checks each passed 1/1. Full pytest: 270 passed, 1 existing optional
skip (88.19 seconds). JavaScript/import/DOM/cache/catalog/provenance/core/encoding
guards passed. Development release preflight returned 0 errors with the truthful
v0.6.36-dirty warning.

The full browser gate passed 37/39. A saved-target check assumed M31 was the
first row; corrected its assertion to address M31 explicitly under Name sorting,
and its focused rerun passed 1/1. The single-notification check encountered the
previously recorded local test-server ERR_CONNECTION_REFUSED; its focused rerun
passed 1/1. All 39 cases passed across the full run and those targeted reruns,
without claiming a clean full browser run or resolving BROWSER-LOCAL-001.
Diff whitespace check passed. No commit, tag or deployment was performed.
Broader accessibility work remains outside these two requested fixes.

## Unreleased — Wikipedia-only object photos and brief docs review, October 6, 2026

Removed all 81 legacy object JPEGs (7,562,979 bytes), the bundled attribution
manifest and its obsolete generator. Opening details now loads from the existing
Wikipedia/browser Blob cache directly, without a local-file request first.
Author/license metadata and the exact image file link remain associated with
cached bytes. Missing/transient photos retain the readable placeholder and
retry behavior. Existing cached photos are preserved. The general Image credits
page remains, with online-source guidance instead of the retired inventory.
The asynchronous article link now also checks the active object/open inspector.
App cache token is144 and imagecredits token2; guards/baseline are aligned.

Updated About, Privacy, NOTICE and current architecture/backlog/roadmap guidance.
IMAGE-001 is resolved by removal, without claiming historical usage rights were
verified. Fixed stale HOST-001/Phase 3 and selection-status references, plus an
obsolete desktop FITS grouping reference in DESIGN. Brief review confirms two
existing Phase 4 oddities remain: visible Popularity sorting and the upper time
slider's missing accessible name. No deeper review or unrelated planner fix.

Validation: focused source/image/wiring checks 12 passed; photo browser checks
3/3 passed; full pytest 270 passed, 1 existing optional skip (89.48 seconds).
JavaScript/import/DOM/cache/catalog/provenance/core/encoding guards passed;
development release preflight returned 0 errors with the truthful dirty warning.
The full browser gate passed 38/39 checks; its keyboard close-modes check timed
out waiting for the retired bundled-photo credit link. Replaced that fixture
with controlled Wikipedia image/metadata responses; the focused rerun passed
1/1, preserving its focus-trap/restoration assertions. All 39 cases passed across
the full run and that corrected-fixture rerun. The initial focused photo check
also caught hidden docked placeholders; explicit visibility fixed it before the
final photo/full gates. Diff whitespace check passed.

No commit, tag or deployment was performed. Production copies of obsolete photos
still require removal during an authorized deployment; upload-only cannot delete
them. That cleanup is recorded in Phase 6.

## Unreleased — Owner-confirmed hosting logs, October 6, 2026

Closed HOST-001 for the website configuration confirmed by the owner: daily
rotation, seven retained archives, compression enabled, no email forwarding,
and full IP addresses without anonymization. Privacy documents these settings
alongside the active log and distinguishes separate provider records, without
claiming an exact seven-day deletion deadline. Hosting changes were made by the
owner. Image verification remains open; Phase 3 is complete locally.

Validation: full pytest 270 passed, 1 existing optional skip (78.74 seconds);
public browser checks 2/2 passed; development release preflight 0 errors with
the expected dirty-version warning; diff whitespace check passed. No tag or
deployment was made.

## Unreleased — Public credits wording, October 6, 2026

At the owner's request, removed the popularity source acknowledgement from About and
NOTICE and its name from the Privacy catalog-request explanation. About now
credits online photos through Wikipedia/Wikimedia and their original creators,
with a simple Image credits link. Individual author/source/license information
and accurate bundled-photo credits remain; catalog data and internal provenance
are unchanged. No image permission or verification status is newly claimed.

Validation: full pytest 270 passed, 1 existing optional skip (81.01 seconds);
final public browser checks 2/2 passed; development release preflight 0 errors
with the expected dirty-version warning; diff whitespace check passed. No
deployment or release tag was made.

## Unreleased — Independent website public history reset, October 6, 2026

After approving the public design, the owner requested a fresh version series
for each independent product. Changes (landing/download.html) and its JSON now
contain only one website 0.1.0 entry, without the former archive. The approved
design remains unchanged. PUBLIC_RELEASES explicitly defines public membership;
regeneration cannot bring back inherited tag history. Legacy summaries remain
internal release-guard evidence and older records remain available in Git.
Current guidance supersedes the public history preservation described below.
No tag, deployment, catalog change or guessed clean version stamp was made.

Validation: focused source/release checks 40 passed; full pytest 270 passed,
1 existing optional snapshot skip (87.14 seconds); full browser gate 39/39 passed,
including static/no-JavaScript history and responsive public pages. Generator
freshness and git diff --check passed. Development release preflight returned
0 errors with the expected truthful v0.6.36-dirty warning. Initial restricted
full runs were interrupted after slow progress; the completed runs used the
documented Windows process-pipe access. Browser server connection-reset messages
did not produce failed checks. Desktop/phone captures were visually inspected
and saved under logs/website-history-reset/.

## Unreleased — Website overhaul Phase 3, October 6, 2026

Implemented the owner-approved sky-map public design locally on the existing
codex/website-phase-two checkout. No deployment, release tag or catalog change.
The separate selection task's files are preserved; Phase 3 does not author its
planner behavior. App token142 resolves a detected cache pairing mismatch in
those existing changes before integrated validation.

All six public pages have a compact plain wordmark, concise introductions,
canonical Workbench colors and a decorative vector sky-map hero. Panorama setup
and calculated visibility lead; the early screenshot-heavy concept was replaced
by the sparse style approved by the owner. No public JavaScript or bundler was
added. Native phone navigation and expandable secondary sections work without
JavaScript. Full privacy/source information and the 46 pre-split release records
remain accessible. Optional first-night guidance is inside Features, not an
exposed Home guide. Shared theme roles are loaded from /astro/themes.css?v=16;
public CSS overrides layout without duplicating the palette or changing planner
styles. Obsolete layered glass/starfield CSS is removed.

The local preview mounts landing/ at / and web/ at /astro/, matching deployment
addresses. Canonical/page-specific metadata and a 1200x630 share preview captured
from the actual implemented Home are included. Public cache references are
style.css?v=3, sky-map.svg?v=1 and social-preview.png?v=1. Core, catalog data,
planner image bytes and image-attribution records are unchanged by Phase 3.

Validation:
- Full pytest: 268 passed, 1 existing optional local snapshot skip; 82.04 seconds.
- Full browser gate: 39/39 passed, exit 0, including six selection-task checks.
- Public acceptance covers all six pages, 360px/640px layouts, expanded content,
  enlarged content via CSS zoom, keyboard phone menus/disclosures, disabled
  JavaScript, at least 4.5:1 base/action text contrast, shared theme/map/share
  resources and static release history. CSS zoom is not a manual native-browser
  zoom or screen-reader acceptance claim; A11Y-001 remains separate.
- Focused history/catalog/browser wiring: 24 passed. Public link, real PNG size
  and preview mount isolation checks: 3 passed.
- JavaScript/import/DOM/cache/core/catalog/provenance/encoding guards: passed.
  The first guard run detected the existing app141 bytes/token mismatch; the
  entry reference moved to142, then bump_web_tokens/check_js_tokens --update
  verified the baseline. No guard was bypassed.
- Static history freshness and git diff --check: passed. Initial Windows output
  writes failed with Errno22 using absolute paths; generator destinations now use
  workspace-relative paths when possible, and unchanged JSON is left untouched.
- Development release preflight (--allow-dirty --no-stage): 0 errors, with the
  expected truthful v0.6.36-dirty warning. No publication artifacts were staged.
- Captured all six public pages at 1366x900 and 360x800. Visual review confirms
  the approved open layout, compact controls and readable decorative treatment.

Local preview: python scripts/preview_site.py --port 8081. Evidence and captures:
logs/website-phase3-implementation/. Public publication dependencies HOST-001
(log retention) and IMAGE-001 (historical photo rights) remain open. The past
intermittent browser startup diagnostic is not declared fixed from this pass.
Phase 3 is complete locally; Phases 4–6 remain the next full roadmap phases.

## Unreleased — Website overhaul Phase 2, October 6, 2026

Implemented locally on codex/website-phase-two, retaining the Phase 1 changes.
No new commit/tag, public deployment or catalog repository change was performed.

Home, Features, About, Privacy and Imprint now describe the independent browser
planner, local saved planning data, loaded-tab offline limits, optional automatic
weather, coordinates/timezone requests and external photo/credit services. The
owner confirmed ZAP-Hosting and no CDN. Existing operator contact is retained;
help uses that route and the source repository remains private. The planner's
About/footer copy is consistent and no longer describes a combined browser port.

Changes keeps its existing route and has generated static notes with native
keyboard disclosures. The two website versions have distinct concise summaries;
all 46 pre-split records are preserved exactly against Git HEAD. There is no
runtime release-data fetch or loading-only no-JavaScript state. The generator
--check validates both JSON and HTML; empty data has an explicit generated state.

Per-image credits identify all 81 exact bundled JPEG hashes. Embedded evidence
identifies DSS2/CDS sources for 44; the other 37 have explicit verification-pending
records. Runtime Wikimedia thumbnails retain their exact file page and available
plain-text author/license metadata with newly cached bytes. Older uncredited
cache records remain unknown. Detailed credits are in the existing source
section so the compact inspector stays compact. Both CSP carriers also allow
the authentic thumb.wikimedia.org host narrowly. New credits use Workbench roles.

Validation:
- Final full pytest: 264 passed, 1 existing optional local popularity-snapshot
  skip; 76.50 seconds. Initial catalog-copy checks exposed the intentionally
  removed duplicate footer claim; the advertised-count register was corrected,
  preserving value checks and their mutation proof.
- JavaScript/import/DOM-ID/encoding/catalog/cache/core guards: passed. Advisory
  undefined-symbol candidates remain informational, including injected fetcher.
- Focused Phase 2 tests: 26 passed; focused final count/credit/UI checks: 38 passed.
- Focused landing browser acceptance: 2/2 passed (all six pages, disabled
  JavaScript, failed JSON tripwires, keyboard disclosures and 360px layout).
- Focused final photo checks: 3/3 passed; compact-inspector check: 1/1 passed.
- Final full browser acceptance: 32/32 passed, exit 0. All registered checks ran
  in one browser/server sequence with no failed-check suppression or skips.
  Failure artifacts now include failed-request URLs to aid future diagnosis.
- Static-history generation check and git diff --check: passed.
- Development source preflight (--allow-dirty --no-stage): 0 errors; expected
  v0.6.36-dirty warning remains. No release artifacts were staged for publication.
- App token140, imagecredits token1, attribution JSON request token1 and public
  stylesheet token2; core/astronomy and catalog source data unchanged in Phase 2.

An initial full browser run exposed overly tall inline image credits; moving
these into the existing source disclosure fixed it. The cached-credit check now
reads through that disclosure. Two later full attempts had a local startup
ERR_CONNECTION_REFUSED before the application booted; that check passed in
isolation. After adding request-failure diagnostics, the final full run passed
32/32. Earlier failed attempts are retained in logs/browser/artifacts and were
not counted as passes or skips. No root cause is confirmed and no startup fix
is claimed; intermittent local infrastructure behavior is BROWSER-LOCAL-001.
One server-side connection reset during context teardown did not cause a
browser-check failure in the final run.

Publication checks remain HOST-001 (log retention) and IMAGE-001 (37 incomplete
source/rights records and applicable DSS survey acknowledgment/rights). Missing
rights have not been asserted or invented. Phase 3 redesign remains unimplemented.

## Unreleased — Website overhaul Phase 1, October 5, 2026

Implemented locally on codex/website-phase-one; no new tag or public deployment.
Shared scoring now bounds half-open observing cells at dawn, prorates partial
cells and selects longest runs by actual duration. Tonight, Catalog, Sky View
and target details use the shared endpoints/durations; chart context no longer
produces an independent detail interval. Dawn is excluded from selected-time
window membership. Grid anchors and astronomy calculations remain unchanged.

Both photo policy carriers permit Wikimedia byte fetches and blob-image display
without broadening script permissions. New strict browser checks verify bundled,
fresh and persisted cached decoding plus unavailable-provider retry recovery.
Browser failure artifacts now live under ignored logs/browser/artifacts.

Validation:
- Full pytest: 256 passed, 1 existing optional popularity-snapshot skip,
  85.18 seconds. No launch failure counted as a skip.
- Full planner browser gate: 30/30 passed, including the Berlin cross-view
  regression and three decoded-photo checks.
- Focused integration: 95 passed, including published reference anchors,
  historical scoring parity, boundary and scoring-coefficient mutations.
- JavaScript/import/encoding/catalog/token/core checks: passed. Existing advisory
  undefined-symbol candidates remain informational; parser/import guards pass.
- Development release preflight (--allow-dirty --no-stage): 0 errors; the
  expected v0.6.36-dirty warning remains. Newly baked core files are registered
  with Git for review; no release staging, commit, tag or upload was performed.
- Frozen scoring fixtures are unchanged. The historical terminal-cell overcount
  is independently reconciled in parity tests, with original score tolerances.
- Core regenerated to 204c232bf69db731, token45; retained predecessor
  d98ff03023ceb3cf. App token138; dependency tokens/register aligned.

An early interval browser attempt raced boot's date-listener installation; its
failure reporting also hit Windows console encoding. The helper now waits for
initialized controls and the requested rendered date; rerun/full gate uses UTF-8
and passes. This was test setup, not an application date defect.

Phases 2–6, including public content/redesign and deployment, remain pending.


## Local 0.6.36 release preparation - October 5, 2026

Final full suite after the checkout fix: 253 passed, one optional local snapshot
provenance skip, no failures (99.59 seconds). All 35 focused seed/provenance,
release and curation checks passed. The website browser gate passed 26/26 in
this pass; the subsequent fix changes checkout attributes, not browser behavior.

The first locally tagged 0.6.35 staging attempt stopped at the provenance guard:
Git's Windows line-ending conversion changed the source sidecar after switching
branches, making it differ from the hash-paired web sidecar. A fresh-checkout
regression reproduced the failure. .gitattributes now preserves exact bytes for
the source provenance JSON and web catalog JSON payloads; the regression restores
committed files with core.autocrlf=true and passes. Catalog payload/provenance
content, hashes, cache tokens and astronomy fixtures were not changed.

The original v0.6.35 tag is preserved and was not pushed or publicly deployed.
The corrected candidate uses a new 0.6.36 entry prepared before its release
commit/tag. Final tagged staging and fresh-checkout outcomes are captured in
ignored logs/repository-split/web-0.6.36-readiness-20261005.json. No public website
publication is authorized or claimed by this local preparation.


## Local 0.6.35 release preparation - October 5, 2026

Fresh full suite: 252 passed, one optional local popularity-snapshot provenance
check skipped because the ignored snapshot is absent (123.96 seconds). No test
failures. The full website browser gate passed 26/26. After correcting the
website-only curated summary, all 23 release tests and seven pre-tag/curation
tests passed. The development release integrity gate passed with zero errors
and the expected dirty/off-tag warning before staging. Logs are under
logs/repository-split/*-20261005.log.

The pending 0.6.35 summary no longer advertises the removed combined Windows
application. Its landing changelog entry is prepared before tagging, so normal
post-tag generation can remain byte-identical. The deferred status-report work
is saved in IMPLEMENTATION_PLAN.md; unresolved acceptance/elevation issues remain
open. RELEASE_WORKFLOW.md records local integration, staging and the separate
publication step. These results do not claim public deployment.


## Repository separation — October 1, 2026

The current codex/direction-b-ui desktop snapshot was extracted to the
independent Nightseam-catalog repository with VERSION 0.1.0. The original
Nightseam-programm repository now owns only the website. The catalog keeps the
same branch name with independent history and no remote; prior combined Git
branches/tags and staged/working changes are saved in ignored recovery bundles
and patches. Desktop source removed from the website has both a committed
extraction snapshot and hash-verified pre-partition recovery copies.

Source data/, packaged dist/data/, the existing executable and build environment
were moved with byte verification. Configured external exposure archives were
not altered. Website catalog generation now uses project-owned neutral data
without an application database, retaining the exact committed payload bytes.
Core baking, guards, tests, browser registration and releases are scoped to
each project; website version history is unchanged. No remote push, upload or
public deployment was performed.

Validation completed October 2, 2026:
- Initial full website pytest run: 249 passed, one optional local-snapshot
  provenance skip, one missing documentation token-register assertion. The
  register was restored from current source and that assertion passed on its
  targeted rerun. The two added seed-tracking/privacy checks and all 23 web
  release checks also passed together (25 checks). No test assertion was
  weakened to conceal the documentation failure.
- Complete website browser gate: 26/26 passed, with the web suite unchanged.
- Final JS/import/DOM/syntax/encoding/core/cache guards passed. The independent
  development release gate reported zero errors; off-tag/generated-version
  warnings are expected before the final local commit/version stamp.
- Seed CSVs preserve exact original bytes and literal search-field whitespace.
  Root-only /data/ ignore rules protect user stores while neutral shipped seeds
  remain tracked; the release guard refuses missing/untracked build inputs.

## Historical combined-project entries

# RELEASES.md - what each release shipped and how it was verified

The per-release records moved out of `AGENTS.md` (which had grown past the
workspace instruction budget and was being truncated). `AGENTS.md` keeps the
release PROCESS; this file keeps the RESULT of each release: tag, staged
artifact hashes, gate results, what was deployed and how it was verified live.

Newest first.

## UNRELEASED - 2026-10-01 selected-session calibration actions

- Fixed inactive calibration actions for legacy `Object/lights` archives and
  previously indexed flat layouts. Darks, Flats and Bias now open the exposure
  picker with a recorded image anchor identifying the selected object and logical
  session. Recent-import actions use the corresponding recorded session too.
  The import pane shows the target and chosen frame type. Unavailable sessions
  explain why the action cannot proceed.
- Added validated, nullable `images.session_date_obs` through an additive
  migration. Automatic imports use the original capture date; explicit dated or
  undated calibration attachments carry a separate logical grouping date. Original
  `date_obs` and file bytes remain unchanged. Sessions publish exact image IDs;
  attached calibration no longer disappears from the inspector because its actual
  capture date is outside the selected light exposure's range. UTC comparisons
  preserve fractional timestamps and the exact 12-hour boundary. Existing folder
  naming conventions are retained.
- The server derives object/path/session from the existing anchor, validates
  positive SQLite-range IDs and calibration types before staging, and revalidates
  the target before publication. Existing modern folders are reused; legacy
  folders gain a canonical calibration subfolder without moving light exposures.
  Global whole-byte duplicate skips retain their existing association. Setup
  backup/restore carries and validates the association, rejecting malformed
  metadata before writes. This resolves UIB-033.
- Verified Open folder launches Windows Explorer in the current native app;
  added clear success/error feedback. Renamed the toolbar action to Import and
  replaced format jargon in labels, help and empty states with exposures. The
  supported `.fit`/`.fits` input filters remain unchanged.

Validation: **811 full-suite tests passed** (one upstream Starlette/httpx
deprecation warning); focused backend and grouping checks passed, and four source
browser checks passed, including genuine chooser events for all three calibration
types in both desktop shells and preserved membership for out-of-date metadata.
The native inspection ended when the user pressed Escape; no subsequent computer
input was issued. Compilation and final JavaScript, DOM, encoding, cache and core
guards passed. Development integrity passed with zero errors and the expected
dirty/off-tag warning. Candidate: `dist/session-actions-candidate/NightSeam.exe`,
version `0.6.34-10-gf5bb0c5-dirty`, SHA-256
`ceac0303b20551fc33b573ff4e4867fbf743aa34915b5127e1f594f1b101e143`.
The packaged/web browser gate passed **55/55 checks**. After the user closed the
app, installed the verified candidate atomically as `dist/NightSeam.exe`; its
hash matches the tested build. Library data remains intact. Previous executable:
`dist/NightSeam.before-session-actions-20261001-212434.exe`.
Changes are staged for review; no commit, tag or deployment was created.

## UNRELEASED - 2026-10-01 open Library header and faster indexing

- Removed the contextual object-export and format strip from both desktop
  Library workspaces. Angular-size symbols are inline, keyboard-accessible unit
  switches that persist the preference and stay synchronized with the planner.
  Sessions, images and light integration now use open text without framed cards.
  The packaged toolbar omits its logo and fits its controls in about 45 pixels;
  the source planner retains its existing masthead. Global Export library remains
  available as CSV, and existing API JSON/scoped export support remains intact.
- Map names prefer the closest clear placement. Crowded or displaced names have
  quiet leader lines back to their own marker. Session-count sizing, coordinates,
  selection, hit testing and high-DPI geometry are preserved.
- Reindex now builds one catalog matcher for all new files instead of rebuilding
  it for every frame; unchanged-file scans do not load it. Duplicate candidates
  prioritize the matching stored digest while still verifying the complete file.
  Spooled uploads copy and hash in one worker call, preserving size limits and
  waiting for an active copy to finish before cancellation cleanup.

Isolated profiling used 48 distinct 4-MiB FITS files (192 MiB total), the full
seeded catalog and temporary archives. The initial reindex baseline was 31.701 s,
including 29.937 s rebuilding the matcher 48 times; the updated run took 2.295 s
with one matcher. New imports measured 1.784 s before and 1.635 s after; identical
imports measured 2.555 s before and 1.258 s after. A separate baseline repeat
measured 38.636/1.821/2.366 s respectively, illustrating machine/load variability.
These are local workload measurements, not promised throughput for other disks.
The UI sends eight files per request; archive publication remains ordered.

Validation: **765 full-suite tests passed** (one upstream Starlette/httpx
deprecation warning), **168 focused ingest/API tests passed**, six source-browser
checks passed, and final JavaScript, DOM, encoding, cache and shared-core guards
passed, and **53/53 packaged/web browser checks passed**. The compiled candidate is
`dist/open-design-candidate/NightSeam.exe`,
version `0.6.34-10-gf5bb0c5-dirty`, SHA-256
`61390814c97a70377a461252379dd3350f92a6fdd878eff390967f2c63385521`.
After confirming the canonical app had closed, installed the verified candidate
atomically as `dist/NightSeam.exe`, preserving the library data and the old build
as `dist/NightSeam.before-open-design-20261001-204004.exe`. The installed hash
matches the tested candidate. Development integrity passed with zero errors and
the expected dirty/off-tag warning. Changes are staged for review; no commit,
tag, public release, merge or deployment was created.

## UNRELEASED - 2026-10-01 active-object Library and session-sized map

- Archive map marker radius now depends only on capture-session count, using
  validated `n_sessions` or the session-list length. The bounded 3-12 CSS-pixel
  square-root scale is independent of image count and exposure; unknown counts
  retain the minimum marker and display unavailable text. Names, selection,
  coordinate geometry, hit testing, and DPR-aware drawing remain consistent.
- Moved useful archive facts and controls into the top Library workspace header.
  They show the active object's name, type, angular size, sessions, images, and
  light-frame integration. Removed the duplicate all-object table/disclosures;
  object sorting remains labelled in the Objects rail.
- Added contextual CSV/JSON Export object with exact displayed-name filtering,
  scoped JSON totals, and 404 for unmatched names. The top Export library action
  remains global. Existing serializers and private-fingerprint exclusions remain
  shared rather than duplicated in the client.
- Removed obsolete dock grid rows and fixed the source planner's height chain.
  Both desktop Library workspaces fill the remaining client height, with bounded
  rail/table/detail scrolling and compact reflow. More window height reveals more
  session rows; rows retain their normal density. Standard bottom gutters replace
  the old unused region.

Validation: **761 full-suite tests passed** (one upstream Starlette/httpx
deprecation warning), **53/53 browser checks passed**, and the final JavaScript,
DOM, encoding, cache-token, and shared-core guards passed. Focused checks covered
API export scope/Unicode names, object switching, both desktop layouts, and map
counts at DPR 1 and 2. The folder regression now verifies painted clipping through
scrolling ancestors and unobstructed action hit targets, avoiding false overlap
reports from invisible content.

Rebuilt `dist/NightSeam.exe` in its existing folder, preserving library data and
`dist/NightSeam.before-active-library-20261001-195459.exe` as the previous-build
backup. Version: `0.6.34-10-gf5bb0c5-dirty`. SHA-256:
`0c1c040fd64fb2e47ffd23f67475c328a8b2e6ad0681e3b395d32aa23a995ef9`.
Development integrity (`check_release.py --allow-dirty --no-stage`) passed with
zero errors and the expected dirty/off-tag warning. Changes are staged for
review; no new commit, tag, merge, release bundle, or deployment was created.

## UNRELEASED - 2026-10-01 Library, reindex, and map corrections

- Removed the redundant bottom Library import panel from both desktop shells.
  The top import action and dedicated Import Exposures workflow remain available.
- Reindex preflights every FITS path before updating any index record or
  fingerprint. It accepts `<object>/<session>/{lights,darks,flats,bias}/file`
  and supported legacy `<object>/<frame-type>/file` layouts, including arbitrary
  supported session names and case-insensitive frame folders. Unexpected flat,
  unknown-frame, or excessively nested layouts return actionable HTTP 400.
  Empty folders and non-FITS files are ignored. Rejection preserves the entire
  existing index and archive bytes; it does not move or remove source files.
- Archive folder links use unique containing directories rather than treating
  filenames as folders. Long lists and detail content have bounded scrolling,
  leaving totals and actions reachable. Root-folder actions work, and calibration
  actions require a unique managed session. Reindex errors remain visible until
  dismissed or retried.
- Removed the map's dot-integration control text while retaining exposure-sized
  markers. Object names are on by default, avoid overlapping labels, stay within
  the plot, and remain visible for selected/hovered objects when general labels
  are off. Desktop and narrow screenshots were visually checked.

Validation: **160 focused ingest/API tests**, **757 full-suite tests** (one
upstream Starlette/httpx deprecation warning), and **50/50 browser checks passed**.
JavaScript, DOM, encoding, cache-token, and shared-core guards passed. The browser
gate used the newly built `dist/catalog-ui-fix/NightSeam.exe` development candidate
in isolated installs, including folder-error and crowded-map label regressions.
The version matches authoritative Git describe: `0.6.34-10-gf5bb0c5-dirty`.
The running installed executable and user library were left untouched while
building and validating this candidate. After NightSeam closed, the validated
candidate replaced `dist/NightSeam.exe` atomically; the previous executable is
retained as `dist/NightSeam.before-folder-map-fixes-20261001-185934.exe`.
Installed SHA-256: `b9a8ad4ae099191bb5ea6a41161271a58ba5fbb09fac34d99cf1bd657dd748b9`.
Library data was not changed by installation.
No new commit, tag, merge, or deployment was created.

## UNRELEASED - 2026-10-01 full-review implementation pass

The dated review is [REVIEW-FULL-0.6.34-10.md](reviews/current-pass/REVIEW-FULL-0.6.34-10.md).
This entry describes the subsequent implementation; it is not a tagged release
or deployment. Final integration validation passed on October 1.

- PY-02: duplicate candidates use indexed metadata, and blocking file hashing
  runs outside the event loop and long database critical sections. Final
  duplicate detection and publication retain concurrency protection. Rename,
  restore, archive configuration, panorama payload mutations and import history
  share that serialization boundary; no archive RLock spans an await. Restore
  journaling copies existing payloads so original paths remain available until
  commit, preserving the three-phase restore contract.
- PY-01/PY-04/PY-05: native placement uses physical monitor work areas, converts
  older saved logical positions, and applies final geometry before WinForms
  shows the window. Optional placement errors preserve the native frame and
  downloads. Tests centrally isolate placement files from the user profile.
- PY-06: one lazy Condition/deadline worker replaces per-event timer threads.
  It reads coherent native geometry/state after the event burst, rejects stale
  generations, and terminates on closing without blocking the GUI thread.
- FE-01/FE-02: the source planner has the shared Sky Map selection target, and
  the DOM guard no longer exempts that missing target.
- FE-03: source-planner archive picking uses the available native bridge; the
  native host publishes folder-picker capability for both desktop shells.
- PY-07/PY-08/PY-09: stale owned PID-bearing stages are swept conservatively,
  publication retries external filename collisions without overwriting files,
  fingerprint bookkeeping is excluded from library/setup exports, and repaired
  originals have their own status/count rather than inflating import history.
- FE-04/FE-05/FE-06/FE-08: DOM coverage follows transitive module edges, browser
  synchronization waits for observable state, native-chrome assertions inspect
  actual affordances, and map keyboard instructions/role and Workbench tokens
  replace the identified accessibility/styling inconsistencies.
- Integration found a panorama crop/save race: a pending old calibration save
  could overwrite the newly cropped field of view. Crop now completes pending
  and in-flight saves before publishing, holds the editor stable, and awaits
  refresh/reselection. Failed saves retain edits, and Undo/Redo availability is
  reconciled afterward. API tests cover three crop calibrations; a browser
  regression forces both an in-flight save and a newer queued edit, then checks
  that the crop and the newer edit remain stored after leaving the editor.
- Documentation now separates unresolved findings from dated implementation
  evidence and future release prerequisites. Current guidance is Workbench-only.

Focused native-window/main, ingest/API/backup/race checks and **4 source-browser
checks** passed, as did **83 release-integrity/pre-tag regressions**. A disposable
hidden WinForms form passed
physical bounds restoration/snapshot on the actual 100% display. Regression
tests simulate 125%, 150%, 200%, and mixed-monitor positions; real mixed-DPI
hardware acceptance remains open.

Final validation: **743 tests passed** (one upstream Starlette/httpx deprecation
warning), and **48/48 browser checks passed** across the web planner, packaged
planner, and catalog shells. JavaScript, DOM, encoding, cache-token, and shared
core guards passed. The rebuilt `dist/NightSeam.exe` is a 20.5 MB development
snapshot, version `0.6.34-10-gf5bb0c5-dirty`, built at 15:21:48 local time. The
previous executable was backed up, and library data was preserved. Development
integrity (`check_release.py --allow-dirty --no-stage`) reports zero errors and
the expected dirty/off-tag warning; the older staged release ZIP was excluded.
Repository integrity and whitespace checks passed. The implementation is staged
for review, with no new commit, tag, merge, or deployment.

The earlier stale-executable failure is superseded for the catalog by the
previous rebuilt executable's seven passing packaged catalog checks below.
That subset must not be described as a new full `--all` gate. Duplicate override
behavior follows the requested global no-duplication rule. Issue-ID searches
alone do not establish missing regression coverage: dedup behavior has backend
and browser pins.

Commit-integrity preparation includes the new runtime modules, tests and durable
guides together with their importers; the release guard rejects missing or
untracked runtime modules. The curated 0.6.35 entry is prepared and its pre-tag
check passes, without creating a tag. The broken Codex scratch ref was backed up
and removed while preserving its object; repository-wide history works again.
Requested dated captures are retained locally and ignored, provenance copies
remain intact, and historical commits/tags were not rewritten or garbage-collected.
AGENTS.md was shortened from 67,165 to under 48,000 UTF-8 bytes, with supporting
architecture/storage/web details moved to DEVELOPMENT.md.

Future release prerequisites remain separate: create the clean release
commit/tag when releasing, then refresh staging and version manifests through
the documented process. The existing staged ZIP is the older September
snapshot, not the current executable. Deployed cached-core compatibility needs
verification when publishing the documented retirement exception. No current
release-ready or live-compatibility claim is made.

## UNRELEASED - 2026-10-01 catalog duplicate prevention

UIB-034: full-content SHA-256 identity prevents repeated and renamed imports
from creating another archive copy or library row. Skips appear as Already
imported and do not increase exposure totals or import history. Different bytes
with the same filename remain distinct. Existing duplicate records are not
deleted. Legacy rows acquire measured fingerprints lazily; reindex shares the
identity rule while retaining files already present on disk.

This completed snapshot passed **703 pytest tests**, with one upstream
Starlette/httpx deprecation warning, and JS/DOM/encoding/core guards after the
suite restored its mutation fixtures. A rebuilt dirty development executable
at `dist/NightSeam.exe` passed **7/7 isolated packaged catalog checks**, covering
duplicate counters, import progress, exports, and responsive layout. The
previous executable was backed up, the user's data folder was preserved, and
the browser checks used a separate test library. These results precede the
full-review implementation pass above.

## UNRELEASED - 2026-10-01 catalog progress, export, and visual refinements

UIB-031/UIB-032: import activity shows confirmed processed files/selected total,
elapsed time, and conditional failure counts. Completed activity remains
reviewable; interrupted requests distinguish unconfirmed outcomes from the
unattempted remainder. Archive actions are locked during an operation. Native
downloads are enabled before window creation, CSV/JSON downloads preserve the
page, and fetch failures display an error. Export format remains accessible
even when the library is empty. UIB-033 calibration attachment remains open
in `BUGS.md`.

The progress/export snapshot passed **132 focused tests**, **680 full-suite
tests**, sequential JS/DOM/encoding/core guards, and **6/6 packaged catalog
checks** against a separate development build. After the user closed the app,
the verified executable replaced `dist/NightSeam.exe` with matching SHA-256;
the prior executable was backed up and `dist/data` was preserved. Native Save As
configuration was unit-tested and checked against the installed WebView2
handler; a physical Save As interaction was not performed.

Earlier same-day visual snapshots implemented centered checkbox ticks and
Working status (UIB-029/UIB-030), stable catalog density and responsive Library
composition (UIB-027), and aligned 2:1 RA/Dec canvas axes with coalesced drawing
(UIB-028). The activity snapshot passed **18 layout cases**, keyboard toggles,
the **680-test** suite, guards, and **4/4 packaged catalog checks**. Responsive
checks included **22 viewport pairs**, breakpoint edges, populated sessions,
long labels, actions, and DPR2 geometry; its **680-test** suite and **4/4
packaged catalog checks** also passed. These are historical snapshots, not
additional claims about the subsequent review-fix tree.

## UNRELEASED - 2026-09-30 catalog Windows shell

UIB-026 replaced the earlier custom frameless repair (UIB-025) with the standard
Windows frame, native move/resize/caption behavior, and local placement
persistence. Historical evidence: **33 focused tests**, JS guards, **3/3
packaged catalog checks**, and **680 full-suite tests** passed. A later isolated
source WebView2 launch rendered Library and exposed an inspectable native
window; invoking Restore changed its caption state. System menu, Snap, taskbar,
full keyboard moving/resizing, and physical multi-monitor acceptance were not
established by those runs. The October review pass above repairs DPI coordinate
handling and persistence scheduling; it does not turn those hardware acceptance
gaps into completed checks.

## UNRELEASED - 2026-09-26/27 Direction B UI implementation

The shared layouts gained the Tonight brief/chart/ranked workspace, wide docked
inspector and compact dialog behavior, catalog navigation, local Sky View
scrub, container-driven canvases, focus behavior, and import/library retry flows.
Follow-up fixes addressed inspector bounds, chart legend and compact metadata,
shortcut scope, scroll-aware detail positioning, image-error fallback, and
wrapping long labels (UIB-006/UIB-008 through UIB-021).

The dated final snapshot passed **647 pytest tests**, JS/encoding guards, and
**38/38 complete browser checks** against a fresh dirty development build
(`0.6.34-8-g3c12daf-dirty`). Its screenshot matrix contained 42 desktop and 40
web captures. The theme matrix described at that time included Glass; current
presentation is Workbench-only. UIB-022's Glass-specific Horizon issue is
superseded, while UIB-023/024's older visual claims are no longer supported by
the current Tonight/Library structures and Horizon aspect/min-height code.
Fresh evidence is required before reopening them. Screenshot and implementation
detail remains in the Direction B records and Git history.

The older `BUGS.md` statements of a current zero-error release guard and literal
web cache tokens were historical evidence recorded before later changes.
Release-ready results belong to their dated entries below; current tokens are
validated by the guards, and a dirty development build does not establish a
current staged release.

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
