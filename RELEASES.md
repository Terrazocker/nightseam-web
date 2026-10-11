# Independent website release record

## Converted-photo coverage default and switch — October 11, 2026 (local development)

Confirming a converted photo now defaults to inferred-open coverage instead of
strict measured coverage, keeps an already chosen inferred-open/strict policy,
and the photo setup shows a "Sky outside the photo" select that applies
immediately with undo; the advanced evidence select follows it. A new Chrome
check confirms the default, that a target 40 deg up above an ordinary photo's
top edge is allowed when open and excluded when strict, undo of the switch,
both selects in step, and that reconversion keeps an explicit strict choice.

Actual checks: pytest 364 passed with the optional-data skip; Chrome 118/118;
check_release --allow-dirty --no-stage 0 errors. No tag or deployment.

## Published time anchors and coming-night detail card — October 11, 2026 (local development)

Reference anchors add verbatim USNO 2026 yearly rise/set and civil, nautical
and astronomical twilight tables for Berlin, Sydney, Denver, Tromso and Quito.
Core twilight times matched about 10,000 published events at 17.7 s RMS (the
tables' minute rounding) with per-table bias at most 4 s; two grazing nights
with under ten minutes of astronomical darkness are skipped by the 10-minute
scan. Sidereal-rate, solar-longitude and equation-of-centre mutations fail the
new anchors; the 0.020*sin(2g) term is below their resolution.

The detail card's rise, set, culmination and Moon-at-culmination use core
objectNightInfo over the planned night's site noon-to-next-noon span. For M31
from Berlin on 2026-10-11 the card shows 00:27 (12 October) instead of the
previous night's 00:31. Core rebuilt as b5029923cf7ae513 (token 64).

Actual checks: pytest 364 passed with the optional-data skip; Chrome 117/117;
check_release --allow-dirty --no-stage 0 errors; check_encoding OK. No tag,
publication candidate or deployment.

## CI workflow and release-gate fixes — October 11, 2026 (local development)

Commit c4b8606 adds .github/workflows/checks.yml (Windows; guards, changelog
and development release checks, pytest, then the browser suite in its own
job), orders build_changelog.py --check by tag creation and pins the latency
gate's full-replay baseline to cacdacf. The previous entry's note that the
latency failure was load-dependent was wrong; see BUGS.md.

The workflow has not run on GitHub: the branch is not pushed. Its exact
command sequence ran in a fresh detached checkout of c4b8606 on the
development machine: all guards passed, check_release reported 0 errors
(not-a-release-tag warning), pytest 357 passed with the optional-data skip
and Chrome passed 116/116. No tag, publication candidate or deployment.

## Workspace review fixes — October 11, 2026 (local development)

Branch horizon-calibration resolves the four medium review findings recorded in
BUGS.md: timezone validation at every entry point, the converted-photo guard
in Advanced reference setup, refusal of unrecoverable pre-import safety copies
and of photos whose header and decoded sizes differ, and the core-owned
UNKNOWN_HORIZON reason shared by Catalog and the detail panel.

Core rebuilt as 5d524fa6c3d225d9 (token 63, N-1 42ba4edfe51950ef); module
tokens bumped through bump_web_tokens.py and the AGENTS.md register.

Actual checks on the final tree: pytest 355 passed with the existing
optional-data skip; check_js, check_core, check_js_tokens, check_encoding and
check_release --allow-dirty --no-stage passed. Chrome: 114/116 before staging.
web-immutable-publication failed only because the new core tree was untracked
and passed 1/1 once staged. web-horizon-phases12-long-history-latency failed
3/3 on unchanged commit 9e6d3ee as well (load-dependent timing; see BUGS.md).
Four new web-safety Chrome checks passed 4/4 and failed 4/4 with each fix
disabled. This is a development commit without a release tag or deployment.

## Horizon simplification D/E/F — October 11, 2026 (local development)

Owner-authorized D/E adds bounded/validated GPano metadata, supported angular,
cylindrical and corrected centred ordinary-photo conversion/leveling, exact
original-byte retention and original-pixel references. A fully photographed angular
working rectangle shares image/mask/ruler/pointer/crop geometry. Excluded azimuth
directions block batch and detail planning. Vertical photo bounds retain the
existing horizon/open-above assumption; they do not independently verify sky
outside the photograph. Conversion of painted records or authoritative non-empty
profiles is refused with a new-horizon/redraw path. Unknown distortion, fisheye,
arbitrary stitching repair and tilted partial panoramas wider than 180° remain
unsupported. Source/working allocation limits and the known camera assumptions
are documented in DEVELOPMENT.md and HORIZON_ACCURACY_RESEARCH.md.

Evidence v4 provides 2–16 fitting references, retained explicit exclusions and
0–16 held-out checks. Equal-weight fitting rejects conflicting measurements,
poor spread and ambiguous wrap. Review shows signed per-point residuals,
angle-only extrapolation sensitivity, worst independent-check errors and local
spread warnings. Promotion removes the separate-check role after validation.
Legacy v1/v2/v3 keep their original semantics; backup 9 reads formats 1–8 and
validates models/source dimensions/image headers before storage writes.

Independent pure-core anchors cover nonlinear cylindrical angles, pinhole rays,
orientation, continuous rectangular coverage, bounded sampling, upright full 360°
and minimum 5° cylinders, EXIF dimensions, stale/conflicting metadata, noisy
circular-fit seed slack, seam confirmation, exclusions, checks, crop/history and
batch/detail agreement. Five new Chrome cases exercise actual corrected pixels,
original-byte reload/backup, cylindrical leveling/authoring, metadata/tall/large
sources, crop/history, keyboard exclusions, check retention and rejected role
changes. Final full Chrome gate passed **105/105**. Long-session evidence retained
200 trace points and 20,000 corrections: handler median/p95 8/10 ms, next-frame
median/p95 16/27 ms; hardware timing is evidence, not a universal performance promise.

Review corrected upright cylindrical coverage loss, unsafe promotion/replacement
draft changes, same-session check loss, cropped-reference reuse, keyboard focus,
contradictory optional metadata, EXIF header orientation and batch coverage gating.
The first full Chrome run passed 104/105: complete rollback restored all data but
added a null projection field absent from newly created records. Canonical initial
fields fixed that shape discrepancy; the targeted rollback and final full gate pass.

JavaScript gate passed: 52 modules, zero syntax errors/broken imports; core,
encoding, catalog/provenance and token guards pass. Its 42 heuristic name candidates
are advisory. The first full Python run reported 351 passed, 1 failed, 1 existing
optional skip in 138.98 s: the architecture guard's function register omitted the 13
new shared functions. The register was corrected without changing math or fixtures.
The architecture module passed 9/9 in 92.14 s. Final Python suite ran separately
from browser/package checks: **352 passed, 1 existing optional popularity-snapshot
skip**, 151.11 s. Published astronomy anchors and frozen regression fixtures were
not changed to conceal formula differences.

Final development release guard passed with zero errors and the expected dirty
warning. The official version helper stamped v0.1.1-3-gcacdacf-dirty. Prepared
and separately verified the **71-file immutable local candidate** at
dist/publication-preview. No public upload occurred. The local port8083 preview
serves app token196; owner acceptance remains separate as requested.

Pre-stage development guard identified untracked new shipping modules; they were
registered, then the guard passed with zero errors and the expected dirty/untagged
warning. Core token 57 retains current 7ef94c520cf50732 and previous 72241495a84f099d.
The AGENTS token register is aligned. Root relative-link validation covered 21
documents with zero missing targets, excluding the pre-existing historical audit.
No commit, push, tag or public deployment was made. Physical-photo/device/native
zoom/screen-reader acceptance remains with the owner.

## Conservative horizon sampling — October 11, 2026 (local development)

The owner continued the accuracy follow-up. HOR-ACC-001 and HOR-ACC-002 are
resolved locally: each derived 0.5° world bin takes the highest overlapping
obstacle; sky bins intersect lower edges and explicit upper ceilings, while
unpainted overlapping columns block. Default open-above remains unchanged,
including when raw painted bands are disjoint. Skyline cells use the highest
connected segment edge and upward altitude rounding; sub-column traces survive.
Source strokes, ordered erasures, no-stroke profiles and legacy migration remain
intact. Conservative widening, raster crop differences, disconnected sky openings
and the existing 4° photo-top assumption are documented limitations.

Focused validation: 13 tests passed in 3.64 s, including the independent
overlapping-cell oracle, legacy migration mutation contract, narrow-feature,
half-open boundaries, north/full seam, inclusive endpoint, sky/overhang,
sub-column trace, crop and history checks. The focused Chrome case passed,
proving planner lookup, save/reload and backup retain the narrow obstruction.
An earlier targeted run caught the new test's incorrect null-ceiling expectation
and the former exact crop-sample assertion; final checks use the actual
open-above contract and a one-calibrated-row bound for that seam brush case.
Review also caught disjoint-band handling under open-above; it was corrected
before the successful targeted run. Published astronomy anchors are unchanged.

JavaScript gate passed: 48 modules, zero syntax or broken imports; core,
encoding, catalog/provenance and recursive-token guards passed. The existing
39 heuristic undefined-name candidates remain advisory. Pre-stage release guard
refused the 12 untracked generated modules; after registering them, the development
guard passed with zero errors and the expected dirty/untagged warning.
Core token 54 retains current b61383a1eebef985 and previous 15fc8df02902f352.
Current documentation/backlog and AGENTS cache-token register are updated.

Full Chrome gate passed 100/100, including existing calibration, crop/history,
backup rollback, responsive and planner checks. The final long session retained
200 trace points and 20,000 correction dabs: handler median/p95 8/9 ms,
next-frame median/p95 16/20 ms. Warm advanced visibility was 0.3 s.
Root documentation relative-path check: 21 documents, zero missing targets,
excluding the unknown prior audit. Full Python suite ran separately after the
browser gate: 351 passed, 1 existing optional popularity-snapshot skip, 122.01 s.
Final development guard passed with zero errors and the expected dirty warning.
Prepared and separately verified the 68-file immutable local candidate in
dist/publication-preview, truthfully stamped v0.1.1-3-gcacdacf-dirty.
The preview at port8083 serves current app token193. Final encoding guard passed.
No commit, push, tag or public deployment was made.

## Horizon accuracy research and workspace documentation — October 11, 2026

The owner authorized further mathematical research, discretionary improvements,
and a general workspace/documentation review. HORIZON_ACCURACY_RESEARCH.md links
primary Hugin, OpenCV, Google GPano and NOAA references and separates source facts
from repository derivations. No arbitrary confidence percentage was added.

Implemented: evidence v3 fixes confirmed original coverage to 360° and balances
the two measured bearing offsets on their nearby circular branch, with a maximum
1° residual per point. Review shows signed fit residuals and warns above 3×
edge sensitivity to entered angle errors. V2 retains its original exact solver;
V1 remains the separate-reference model. Backup format 8 protects the semantics,
while formats 1–7 remain readable. Independent checks stay out of fitting and
manual drift cannot retain checked status. Seam paint wraps only numerically
full-360 views, fixing near-full partial coverage. The vertical-mask comment now
states the actual calibrated span/359 row spacing.

Confirmed open limits: a pure-core probe of a 45° photo with only row100/column3
painted yielded zero blocked world bins. Representative-column sampling can miss
narrow obstacles; skyline ceil(row) can understate obstruction height by one row.
Conservative obstacle/sky/overhang policy is deferred and documented in BUGS.md.
Projection conversion, leveling, additional fit/check references and physical
acceptance remain open. No astronomy or sampling fixture was changed to conceal
these findings.

Documentation review repaired current Horizon status/navigation, dependency
bootstrap, serial test guidance and provenance-input requirements. README now
maps authority, backlog, architecture, decisions, findings and receipts.
WORKSPACE_DOCUMENTATION_REVIEW.md records the scoped review; the existing unknown
WORKSPACE_AUDIT_REPORT.md was left untouched. Historical desktop/release receipts,
credentials and sibling repositories were not rewritten or used as dependencies.

Confirmed validation:
- Full Python suite: 350 passed, 1 existing optional popularity-snapshot skip,
  123.36 s. Ran separately after JS/browser completion; final boundary and strict
  normalization tests are included.
- Four focused Horizon core modules passed. Added known-width residual, reverse
  order, north-wrap, crop/drift, v2 compatibility, strict v3 normalization,
  near-full seam and sensitivity cases; final full suite includes boundary cases.
- Focused measured-fit browser case passed; full Chrome gate passed 99/99,
  including backup8, save/reload, old Advanced workflow and responsive layouts.
  Test-server connection-reset diagnostics occurred when a client closed a socket;
  they did not produce a failed gate or suppressed launch failure.
- JavaScript gate passed: 48 modules, zero syntax/broken imports; core, encoding,
  catalog/provenance and recursive-token checks passed. There are 39 advisory
  heuristic undefined-name candidates, as before.
- Final browser long session (200 trace points + 20,000 dabs): handler median/p95
  8/11 ms, next-frame median/p95 16/30 ms. Warm advanced visibility was 0.3 s.
- Root documentation relative-path check: 21 documents, zero missing targets,
  excluding the unknown prior audit report. Earlier scoped review scanned 25
  existing documentation files without broken relative links.
- Development release precheck initially refused the 12 newly baked untracked
  core files. They were registered after that pre-stage check; the subsequent
  development guard reported zero errors with the expected dirty/untagged warning.
- Final development guard again reported zero errors. Prepared and separately
  verified a 68-file local immutable candidate in dist/publication-preview, using
  truthful v0.1.1-3-gcacdacf-dirty. Core token 53: current 15fc8df02902f352,
  previous 02ddc8b5c055c4ee. The preview at port8083 serves app token192.

No commit, push, tag or public deployment was made. Changes remain local on
master cacdacf; remaining owner checks and public-host/manual gates stay open.

## Horizon/Panorama simplification A–C — October 11, 2026 (local development)

Implemented the owner's authorized A–C scope: separate sharp ruler margins,
collapsed profile/Advanced controls, and Add horizon photo → two complete known
points → preview → explicit application → optional separate check → drawing →
Save horizon. Drawing defaults to skyline tracing and selected points have a
nearby undoable Remove button. Approximate setup remains available; existing
records and the separate-reference editor remain usable through Advanced.

Core owns the two-axis fitting, bearing unwrapping, original-photo coordinates,
crop composition and report status. Two fitted points establish alignment only;
an independent check reports signed discrepancies without changing the fit.
Unknown/unsupported projections remain approximate. Calibration evidence v2 and
backup format 7 retain complete references; older backups remain readable.
Preview is session-only and applying a valid fit creates one history entry.

Review corrected a missing core helper import, an Advanced mode control attached
from the wrong parent, applied-review wording, repeated application, and missing
immediate markers for draft Advanced picks. Older browser checks were adapted
to deliberate collapsed controls and ruler gutters; no correctness fixture or
timing threshold was relaxed. Cache tokens remained fixed throughout the final
browser run to avoid importing a second editor instance during a test.

Software validation:
- Full Python suite: 350 passed, 1 existing optional popularity-snapshot skip,
  123.67 s. This ran after browser/JavaScript checks to avoid the suite's temporary
  module-removal probes affecting other processes.
- Full Chrome run: 97/98 passed. The remaining reference-marker check failed
  while restoring its test-only canvas instrumentation (a returned native
  function was invoked by the evaluator). Corrected cleanup passed the targeted
  final rerun, 1/1, with no subsequent application changes. All 98 selected cases
  are therefore covered by passing final receipts. An earlier run reported
  92/98 before adapting six old layout/label assertions.
- All five new simple-setup browser cases pass: atomic fit/check/save/reload,
  full panorama/crop/history, preview cancellation/invalid input/uncovered edges,
  picked-point dragging/zoom/phone layouts, and backup v7/approximate projections.
- Final JavaScript check: 48 modules, zero syntax errors or broken imports;
  encoding, catalog/provenance, core and token guards passed. The 39 heuristic
  undefined-name candidates remain advisory.
- A 200-point trace with 20,000 correction dabs measured handler median/p95
  7/9 ms and next-frame median/p95 16/20 ms in the final full browser run.
- Development release guard: zero errors, with the expected dirty/untagged
  development warning. Recursive tokens and current/N−1 core retention pass:
  core token 52, current hash 02ddc8b5c055c4ee, previous 120a347ba746d75c.
- Prepared and independently verified `dist/publication-preview`: 68 immutable
  candidate files stamped from actual `v0.1.1-3-gcacdacf-dirty`, not a new release.

Physical photographs, true-bearing measurements, native zoom, touch/pen and
screen-reader acceptance remain with the owner. D/E projection conversion and
multi-reference fitting are not implemented; final combined F acceptance remains
open. The explicit full-360 consistency policy can reject rounded measurements;
future tolerance must expose residuals rather than imply accuracy.
Changes remain local development on master cacdacf. No commit, push, tag or
public deployment was made for A–C.

## Horizon/Panorama phases 4 and 5 — October 10, 2026 (local development)

Implemented skyline authoring as ordered core mask operations. Click or enter
points, move them by dragging/keyboard/exact percentages, and fill below their
connected straight segments. Later brush/eraser corrections retain precedence
when earlier points move. Dense traces use adaptive markers and only label the
selected point. Full/partial/seam geometry, segment-intersection crops, deep
history, planner fingerprints and backup format 6 preserve authorability.
Formats 1–5 remain readable; malformed/over-limit traces reject before writes.

Sky openings and overhangs retain separate brush/band semantics. Switching from
an obstacle trace asks before removing it and is undoable. Precise-bin Apply
states that it replaces authored paint/traces with the current world profile
and an edited bin, preserving other bins and undo recovery. An unconnected first
point is a session draft, leaving an authoritative stored profile unchanged.
Crop/clear/profile replacement/history restoration discard obsolete drafts.

Review caught and corrected rejected additions moving an old node, selection
being overwritten during control rebuild, ordering of tightly spaced imported
points, numeric tool conflicts and draft coordinates surviving crop. The five
new Chrome cases cover these edges, ordinary tracing/corrections/crop/backup/
reload, keyboard editing, mode confirmation, overhangs, pointer cancellation,
secondary simulated touch/pen, save failure/retry and long-session history.

CAT-PERF-001 was profiled before implementation. An instrumented warm-scrub run
took 2.48 s; Intl formatter construction dominated samples. Bounded per-zone
formatter reuse still calculates offsets at each instant, and memo hits no
longer resolve site noon merely to build their key. Focused unchanged 4× CPU
timing checks passed at 0.30–0.31 s for three scrubs, with final selected-time
row altitudes now verified as well. Scoring and reference fixtures are unchanged.

Final software validation:
- Final Python rerun: 349 passed, 1 existing optional popularity-snapshot skip,
  121.50 s after the phone correction. An earlier run overlapped final source
  review and reported two cache
  guard failures while token updates were pending; corrected tokens passed the
  focused guards and the complete final rerun.
- Final JS: 47 modules, zero broken imports or syntax errors; encoding,
  catalog/provenance, cache-token and core guards passed. The 35 heuristic
  undefined-name candidates are advisory; actual browser imports are checked.
- Focused new browser acceptance: 5/5 passed; final draft/crop/reference-pick
  conflict check also passed after review. A 200-point trace plus 20,000 correction
  dabs measured handler median/p95 8/10 ms and next-frame median/p95 17/31 ms
  on this workstation. No hardware-independent latency guarantee is inferred.
- Initial complete browser run: 92/93 passed. The additional tool explanation
  enlarged the phone toolbar enough to cover a zoom hit target at 360×640.
  Capped its sticky height to 40% of viewport/240px and bumped stylesheet token
  to 61. The exact failed state/calibration/band check passed after correction.
- Development release check (`--allow-dirty --no-stage`): zero errors, with the
  expected dirty/untagged warning. New source/generated assets are registered in
  Git only for tracked-source guards. Superseded staged generated additions were
  removed from the index; the current/N−1 source trees remain available.
- Generated core: 284234714ab8678b, token 50, retaining 4ab75c9cc136a98e.
  Cache register and entry points match; development stamp remains truthful
  0.1.1-3-gcacdacf-dirty. No frozen astronomy fixture was updated.

- Final complete Chrome rerun: 93/93 passed, including the corrected phone hit
  targets, all five new tracing cases, all guided/crop/gesture/DPR cases,
  transactional recovery, planner integration and immutable publication.
  Catalog cached scrubs took 0.30 s at 4× CPU; initial table 0.20 s, complete
  warming 1.44 s. Final long trace/correction metrics: handler median/p95 7/9 ms,
  next-frame median/p95 16/29 ms, maximum 33 ms. Receipts:
  logs/horizon-phases45-browser-{initial,final}.txt; workstation metrics:
  logs/browser/artifacts/horizon-phase45-latency.json. Old failure JSON remains
  historical evidence; the final stdout receipt identifies the successful run.
- Prepared and independently reverified the fresh 67-file combined immutable
  local candidate at dist/publication-preview, described as
  v0.1.1-3-gcacdacf-dirty. Its publication.manifest.json hashes match the reviewed
  working source. No production connection/upload was performed.
- Final staged/unstaged whitespace checks passed. HEAD remains cacdacf.

Phase 4 and the phase 5 software work are complete locally. Real measured
full/partial photographs, physical touch/pen, native browser zoom and intended
assistive technology remain owner acceptance, as requested. The checklist is
HORIZON_PANORAMA_ACCEPTANCE.md. Public release/deployment is separate; no commit,
push, tag or deployment is part of this work.

## Horizon/Panorama phase 3 — October 10, 2026 (local development)

Implemented the authorized guided import/calibration phase. New photographs
start at coverage, then offer true-bearing alignment, two measured altitude
references, independent verification and painting. Existing records open directly
for editing and can review setup. Both full and partial views use exact inputs
with optional fine sliders; North does not need to appear in the image. True
versus magnetic bearing, measured level versus obstruction skyline, and supported
equirectangular versus approximate camera projections are explained in the flow.

Reference evidence is retained against the original photo, deep-copied through
history and preserved by backup format 5. Formats 1–4 remain readable; malformed
evidence rejects staging before writes. Checked status is computed from current
geometry, exact fit references, supported projection/coverage and an independent
check within 1° on both axes. Manual changes and cropped-out alignment references
cannot retain a stale checked claim. Checks show signed bearing/altitude residuals
and never auto-adjust the fitted geometry.

Browser work also fixed cursor-readout wrapping that shifted the image during
the first pointer movement. Entering Paint focuses the canvas, manual width
changes refresh setup, and a reference pick owns its pointer until up/cancel so
another pointer cannot begin painting. Same-record setup drafts/step survive
unrelated rerenders; unapplied drafts are not saved measurement evidence.

Validation:
- Focused source/history/core regression set: 27 passed. Final Python suite:
  348 passed, 1 existing optional local popularity-snapshot skip (145.74 s).
- JS: 45 modules, zero broken imports/syntax errors; encoding, catalog/provenance,
  core and cache-token guards passed. The 29 heuristic undefined-name candidates
  remain advisory rather than semantic failures.
- An initial full browser run passed 86/88. The two failures were old expectations
  for visible fine-angle outputs and backup format 4; the fine controls now require
  opening their disclosure and calibration evidence requires format 5. Updated
  crop checks passed 4/4 without weakening geometry/history/profile assertions.
- In that full run, all three guided-setup cases, all five phase 1/2 cases,
  storage/save-failure recovery and immutable publication passed. The existing
  Catalog timing check passed at 1.99 s, close to its 2 s limit; its prior repeated
  failures on committed HEAD remain unresolved CAT-PERF-001 evidence.
- Final complete browser rerun: 88/88 passed, including off-center zoomed picks,
  exclusive held-pick ownership, keyboard step progression, stable cursor layout,
  stale-calibration rejection, and full/partial setup/history/crop/backup/reload.
  Catalog timing again passed at 1.99 s. No browser launch or request failure
  was skipped. Screenshots: logs/browser/artifacts/horizon-phase3-{vertical-setup,
  checked,mobile}.png.
- Subsequent screenshot review caught missing marker-backdrop palette values
  making L/V/C labels white on white. Replaced them with the canvas surface role;
  final focused guided checks passed 3/3 with all four label/backdrop contrasts
  asserted. The correction changes drawing only; fitted geometry is unchanged.
  Also synchronized the selected horizon's list caption with live mode/coverage,
  so a calibrated partial view cannot retain its import-time 360° caption.
  The final focused guided rerun passed 3/3, including caption consistency;
  UI/cache/calibration Python checks passed 31/31 after the visual corrections.
- Final long-history/large-photo regression retained 20,041 dabs: handler
  median/p95 improved 16/20 ms to 0/1 ms versus committed HEAD; next-frame
  median/p95 was 32/47 ms before and 28/47 ms after. Workstation-specific p95
  remains below 50 ms. Metrics: logs/browser/artifacts/horizon-phases12-latency.json.
- Final development release check (`--allow-dirty --no-stage`): zero errors,
  with the expected dirty/untagged development warning. Diff whitespace check
  passed; source/token/core and immutable-publication validation remain green.
- Generated core is 4ab75c9cc136a98e, token 49, retaining 54493a51996bdd15 as N−1.
  Truthful development stamp: 0.1.1-3-gcacdacf-dirty. No frozen astronomy fixture
  was changed. New source/baked assets are staged only to satisfy tracked-source
  publication guards; the workspace remains uncommitted.

Real full/partial-photo calibration with known references, physical touch/pen
and assistive-technology acceptance remain phase 5. Editable skyline tracing
remains phase 4. No commit, push, tag or deployment is part of this phase.

## Horizon/Panorama phases 1 and 2 — October 10, 2026 (local development)

Implemented the owner's authorized correctness/gesture and readable-editor
phases. Crops now compose normalized source bounds against the retained original
photo, using the same effective band as paint/calibration. Undo/redo and backup
format 4 retain those bounds; v1–v3 remain readable. Calibration stays within
physical bounds and repairs old invalid local/restored spans without replacing
authoritative stroke-less profiles. Minimum-FOV enforcement and rounding have
distinct preview messages.

Painting joins sparse/coalesced pointer samples and applies the shared rasterizer
incrementally. A single owning pointer settles visible partial paint as one
history entry on up/cancel/lost capture/blur; tool/view/history/metadata changes
and teardown settle safely. A late image decode cannot repaint a detached editor
or overwrite a replacement editor's live profile.

Degree rulers/text/grid strokes draw in CSS pixels with DPR scaling and adaptive
ticks. The brush footprint (including seam copies) matches angular paint size;
zoom magnifies it without changing its angles. Same-panorama rerenders retain
view/tool/display settings. Paint/crop/history controls use a bounded opaque sticky
stage toolbar; Display contains grid/opacity controls.

Focused evidence: 23 core/JS/backup/D1/horizon checks and 44 history/UI/cache/core
guard checks passed. Five new browser checks cover repeat-crop original-photo
sampling, real snapshot replacement/restore/reload, sparse/two-pointer/interrupted
gestures, physical calibration bounds, rerendered view state, unobscured controls
at 1366/900/640/360 widths and short heights, and DPR 1/1.5/2 with wide/partial/
portrait images through 8× zoom. Screenshots and the 20,000-dab/4096×1024-upload
HEAD comparison are retained in logs/browser/artifacts/horizon-phases12-*.

Initial full runs exposed outdated source-shape assertions and missing new helper
registration; these were corrected without changing frozen geometry fixtures.
The first browser gate passed 83/85: immutable publication ran before new generated
assets were staged, and the existing 4×-CPU Catalog scrub timing exceeded 2 seconds
while other validation was running. The generated current tree is now staged and
the final gates run sequentially. No threshold/retry/skip suppression was added.

Final validation on the completed local implementation:

- `python -m pytest tests/ -q --tb=no`: 347 passed, 1 existing optional local
  popularity-snapshot skip (139.21 s).
- `python scripts/check_js.py`: passed, including syntax, recursive cache tokens,
  core/catalog guards; 27 advisory heuristic candidates remain non-fatal.
- `python scripts/check_core.py`: passed. Current hash 54493a51996bdd15/token 48
  retains committed previous 8e090bcf870e108d, rather than an intermediate bake.
- Final full `python scripts/check_browser.py --web`: 84/85. All Horizon checks,
  immutable publication and ordinary planner/storage/accessibility checks passed;
  the Catalog timing check alone remains open as CAT-PERF-001 in BUGS.md.
- Final focused Horizon gate: 5/5, including the late-photo redraw regression
  and a latency probe waiting for photo decode before timing. A 20,000-dab
  history/4096×1024 upload measured median synchronous pointer handling 17 ms
  before vs 0–1 ms after (millisecond-resolution browser clock); next-frame
  median 31 vs 28 ms, p95 47 vs 48 ms. The p95 <50 ms workstation target held;
  this does not establish a universal hardware latency ceiling.
- The Catalog timing comparison uses an owned full `git archive HEAD` snapshot
  with generated truthful HEAD version metadata: 2.31 s before vs 2.24 s current,
  against the unchanged 2-second threshold at 4× CPU. Both isolated runs failed
  on timing with no runtime/network errors. No new Horizon regression is inferred
  from this pre-existing issue; full-browser release readiness remains blocked.
- `python scripts/check_release.py --allow-dirty --no-stage`: 0 errors; expected
  dirty development-tag warning. `web/version.json` truthfully describes
  v0.1.1-3-gcacdacf-dirty. No frozen astronomy fixtures were changed.

Transcripts: logs/horizon-phases12-python-final.txt, horizon-phases12-js.txt,
horizon-phases12-browser-final.txt, horizon-phases12-browser-focused-final.txt,
horizon-phases12-catalog-{head,current}.txt and horizon-phases12-release.txt.

Open work: phases 3 (guided import/known-bearing and vertical calibration), 4
(editable skyline tracing and fill) and 5 (physical photo references, touch/pen,
assistive technology, integrated release review). Legacy crops without stored
source bounds cannot be reliably reconstructed and may need reimport/calibration.
This is a local dirty development build, without a release tag or deployment.

## Horizon/Panorama read-only UX review — October 10, 2026

Inspected committed master cacdacf in an isolated local browser using the Berlin
example and an owned synthetic 1600x500 landmarks image. Reviewed import controls,
painting, crop and calibration; no application/core/styles/storage/test code was
changed. No automated suite or real-world photographic calibration was performed.

Confirmed photo/paint misalignment after a roughly 214-degree horizontal crop,
flattened degree labels on a wide image, a 90-to-95-degree altitude range beyond
the top slider limit, and inaccurate minimum-FOV wording for rounded crops.
BUGS.md records HOR-UX-001–004; HORIZON_PANORAMA_IMPROVEMENT_PLAN.md separates
confirmed findings from gesture/performance reproduction still needed and proposes
five ordered phases. logs/horizon-review-crop.jpg preserves the alignment evidence.

Temporary photo/paint existed only on the separate local preview origin. The
owned fixture was removed successfully, the review tab closed and preview server
stopped. No commit, push, tag or deployment is part of this exploratory review.

## Browser monitoring validation — October 10, 2026

Tested BROWSER-LOCAL-001 monitoring against committed master cacdacf without
changing application or harness code. This verifies diagnostics and current
behavior; it does not establish the cause of historical refused module requests.

Actual results (ignored logs/browser-monitoring-*-20261010.*):
- Full Chromium web gate: 80/80 passed, exit 0. No ERR_CONNECTION_REFUSED,
  browser infrastructure failures or handler connection-reset diagnostics in
  this run's transcript.
- Historical Sun/Moon check repeated in ten isolated browser contexts: 10/10
  passed, exit 0. Each recorded a live server with backlog 64 and no natural
  same-origin connection refusal. These are independent trials, not retries of
  failed checks.
- Browser monitoring/gate regressions: 10 passed in 0.15s, including queued
  connection capacity and hard diagnostic/driver exit-code handling.
- Deliberately refused app.js?v=174 in a temporary check. The gate correctly
  failed with exit 1 and preserved the exact module URL, ERR_CONNECTION_REFUSED,
  server thread_alive=true, port and backlog 64 in its JSON diagnostic. The
  probe verified that expected failure and exited 0. This is induced evidence,
  not a natural recurrence.
- Owned probe scratch cleaned successfully; logs/.scratch retains only its
  manager lock. Replay scripts, transcripts and JSON receipts remain under logs/.

BROWSER-LOCAL-001 remains monitoring-only because no natural refusal recurred.
No application fix, release tag, commit, push or deployment was performed in
this validation pass.

## Commit validation — October 10, 2026

Validated the combined remaining-review fixes, scratch lifecycle and documentation
cleanup before committing to master and pushing to GitHub. README now describes
the changes as awaiting a public release. No release tag or public deployment is
part of this commit.

Actual validation (ignored logs/commit-*-20261010.txt):
- Full Python suite: 346 passed, 1 existing optional-data skip in 126.70s.
- Full Chromium web gate: 80/80 passed.
- JavaScript/import/encoding/cache/catalog/core guard passed.
- Development release guard: zero errors, expected dirty-development warning.
- git diff --check passed.

## Prevent repeated test scratch buildup — October 10, 2026 (local)

The documentation cleanup relocated pytest defaults but did not remove the
custom fixture's ignored deletion failures. Replaced those paths and JS syntax/
token guard scratch with scripts/scratchspace.py's owned, locked run lifecycle.
The next allocation reaps abandoned marked runs, preserves concurrent live runs
and unknown evidence, and fails visibly before allocating if cleanup stays
blocked. Read-only files and transient directory locks are retried. JS probes
have no system-temp/profile fallback. Browser per-check artifacts, publication
stages and current plus N-1 core retention were already bounded and remain so.
Dated reports/recovery/deployment evidence remain intentionally retained; this
does not impose a global disk quota on arbitrary developer-created output.

Actual validation (ignored logs/scratch-retention-20261010/):
- Focused scratch/syntax/token regressions: 24 passed in 8.69s. New lifecycle
  tests cover a real crashed child, concurrent live ownership, unknown evidence,
  read-only payloads, persistent cleanup failure/retry and unsafe path refusal.
- Full Python confirmation: 346 passed, 1 existing optional-data skip in 111.29s.
- JavaScript/import/encoding/cache/catalog/core checks passed; development release
  guard passed with zero errors and the expected dirty-version warning.
- After the full suite and simultaneous JS/release guards, logs/.scratch contains
  only its one-byte .manager-lock; no managed payload/run directories remain.
- git diff --check passed. No website assets or core math changed in this pass;
  browser gates were not repeated for test-tool lifecycle changes. Nothing was
  staged, committed, pushed, tagged or deployed.

## Documentation alignment and workspace cleanup — October 10, 2026 (local)

Updated README, release/review guidance, hosting status, design and human
accessibility acceptance to reflect the current implementation. The live release
remains v0.1.1; review phases 1–7 are local and unreleased. Human AT/native zoom,
provider compression and the next release/publication remain pending.
Moved five completed plans/reviews to docs/history with historical banners and
updated references. Corrected a dead link to a former desktop review without
claiming that report exists in the current web tree.

Removed the unused ui-concepts corpus and desktop-only tests/_util.py helper,
plus stale ignored dist candidates, after a verified local archive. All 218
archive entries matched their source SHA-256 before removal and passed subsequent
ZIP/hash verification. Tracked historical assets remain recoverable from Git.
Cleared 69.53 GiB of accumulated disposable test scratch/Python caches; the first
cleanup removed 22,246 files totaling 74,705,079,591 bytes including archived
obsolete files. The local archive occupies 30,542,244 bytes. Recovery snapshots,
deployment rollback/receipts, reference fixtures, validation evidence and core
trees were retained. Pytest basetemp/cache now default to ignored logs paths.
Any scratch generated by the final validation was cleared after the suite exited.

Actual verification (ignored logs/workspace-cleanup-20261010/):
- Full Python suite: 341 passed, 1 existing optional-data skip in 103.27s
  (pytest-full.txt), using the updated pytest paths and no retired desktop helper.
- JavaScript/import/encoding/cache/catalog/core guard passed (check-js.txt).
- Development release guard: zero errors, expected dirty-version warning
  (release-development.txt). No current publication candidate is retained;
  regenerate one from final validated source before publication.
- All 35 local Markdown links across 22 current/history documents resolve;
  archive verification and protected-path checks pass (verification.json).
- git diff --check passed. Browser gates were not repeated for this documentation,
  unused-file and test-path cleanup; the preceding phase 5–7 receipts retain their
  exact browser coverage. No shipped application bytes changed in this pass.

Removal/archive manifests and post-test scratch receipt are local ignored
evidence. Nothing was staged, committed, tagged, pushed or deployed; preceding
uncommitted remediation work remains intact.

## Review phases 5–7 — October 10, 2026 (local development)

Resolved REV-028–038 after master df76fc2. Catalog invalidation precedes new
visibility work; active-site saves refresh the displayed plan and header night
summary. Custom edits invalidate search blobs. Maximum-altitude sorting retains
shared-core maxAlt, warms all matching rows and preserves deterministic name/ID
ties in both directions. Chart states use the canonical visibility reason.

Weather keeps missing values unknown and requires complete selected-night scoring
inputs before showing a rating. Genuine zeros remain valid. Request generations
and site/coordinate/resolved-timezone ownership reject stale success/error
responses, including the first pending request. Provider requests use the exact
planner timezone rather than provider geographic auto. Untouched weather remains
on demand; requested weather follows site edits and timezone changes.

Tonight/Catalog retain native row/cell semantics with named target buttons.
Sort headers and reversal are keyboard controls; Catalog focus and search ranges
survive rerenders. Advanced help now describes switching without a reload.

Validation (ignored evidence under logs/phase567/):
- New original-module probe failed against HEAD's unmodified app: Catalog
  calculation did not settle after a minimum-altitude change (62.3s timeout).
  The corrected regression passes. This is a new reproduction, not a rerun of
  unavailable logs/review probes.
- Full Python confirmation: 341 passed, 1 existing optional-data skip in 118.14s
  (pytest-full-final.txt). Initial run had two pre-tag failures after a final
  app edit invalidated its token baseline; updated tokens and focused pre-tag
  checks pass 7/7, followed by that successful full suite.
- Full Chromium confirmation: 80/80 passed (browser-full-final.txt). Initial
  full run was 77/80: two old focus assertions expected focusable rows, and an
  immutable-candidate/source mismatch occurred during overlapping validation.
  Assertions now expect actual target buttons; the serial full rerun passes.
- After the final immediate-header refresh, focused review checks pass 9/9
  (browser-focused-final.txt), site-time/Moon checks 4/4
  (browser-site-time-final.txt), and actual immutable publication 1/1
  (browser-publication-final.txt). These follow-ups cover the final app token 174;
  the preceding full gate used token 173. No broader coverage is claimed from
  the focused follow-ups.
- Final JavaScript/import/encoding/cache/catalog/core guard passes
  (check-js-header-final.txt); final pre-tag tests pass 7/7 in 1.33s
  (pytest-token-final.txt). Development release guard: zero errors with the
  expected dirty-development warning (release-development-final.txt).
- Desktop/360px Catalog screenshots inspected under logs/browser/artifacts/
  review-phase567-catalog-{desktop,phone}.png. Target actions and sorting remain
  open controls; phone tables scroll inside their named region. Existing
  request-handler connection-reset diagnostics remain in the full browser log;
  they did not fail browser checks or establish a new root cause for BROWSER-LOCAL-001.

Cache tokens: app 174, style 56; recursive references/register and verified
baseline aligned. Version remains truthful 0.1.1-2-gdf76fc2-dirty. Core formulas,
catalog data and frozen fixtures are unchanged by phases 5–7. No commit/tag,
GitHub push or public deployment was performed. Human A11Y-001 acceptance,
HOST-DELIVERY-001 compression, and release/publication remain separate tasks.


## Phase 4 horizon geometry and editor fixes — October 10, 2026 (local development)

Resolved REV-013–019 locally. Landmark normalization reserves suffix space and
terminates for duplicate maximum-length IDs. Crops preserve vertical brush radius,
scale independent horizontal radius, retain original wrapped paint/erase copies in
order, and clear stale derived profiles if every dab clips away. One effective
kept band controls preview, minimum/integer FOV, calibration and transformed
strokes; already narrower frames never expand. Exact world directions survive.

Undo/Redo/Revert synchronize all calibration, landmark, selected-bin and comparison
controls. Valid confidence input immediately belongs to the displayed bin;
selection, rerender, Save and rollback retain its value and history. Checkpoints
settle pending metadata. Space pans only with canvas focus, releases on keyup/blur,
and editor teardown removes keyboard listeners and observers. Native text spaces,
button Space activation and text undo remain available.

Backup exports use format 3 for elliptical dabs; v1/v2 remain readable and earlier
clients refuse v3 rather than silently misinterpret geometry. Imported strokes stay
bounded at 60,000 to accommodate legacy seam copies. Original photographs,
authoritative stroke-less world-bin profiles and frozen fixtures remain intact.

Validation:
- Full pytest: 341 passed / 1 existing optional-data skip in 83.58s,
  logs/phase4/pytest-full-confirmation.txt. The earlier full run also passed
  (pytest-full.txt). Focused geometry/history checks passed 23 tests;
  mutations reject the old infinite loop, vertical scaling, lost seam wrap,
  inconsistent crop band and stale empty-crop profile.
- Original review probes reproduce corrected obstacle/sky-band altitude, seam
  obstruction and 185° world direction: original-review-probes-after.txt.
- Initial focused Chromium editor checks passed 4/4 (browser-focused.txt).
  Coverage includes native Space, pan release/rerenders, stale controls,
  confidence navigation/history, minimum crop band and ellipse backup/reload.
  The first full run passed 73/75 (browser-full.txt): both new reload checks
  incorrectly waited for Tonight while the app correctly restored Horizon.
  Their readiness condition now waits for the actual editor; focused confirmation
  passed 4/4 (browser-focused-confirmation.txt). Final editor controls also enable
  Undo for a first pending metadata edit and disable invalidated Redo; an added
  browser assertion covers that previously missing first-entry case. Final full
  Chromium confirmation passed 75/75 (browser-full-confirmation.txt), including
  the first pending edit, metadata checkpoint/rollback and restored-view reloads.
- JavaScript guard passes (check-js-final.txt); development release guard reports
  zero errors with the expected dirty-version warning (release-check-final.txt).
  The pre-staging guard correctly refused eleven new untracked generated modules;
  they were added to the Git index after that check (release-before-staging.txt).
- Core rebuilt to 8e090bcf870e108d, token 47, retaining 282a2f0070874c8a as N-1.
  App token 171 and importer tokens/AGENTS register align; recursive token update
  is idempotent (cache-final.txt). Ellipse backup confirmation executes before its
  harness exit and passes (ellipse-backup-confirmation.txt).

- Rebuilt and verified the 63-file combined local publication candidate with
  truthful describe v0.1.1-1-g471e64a-dirty (publication-final.txt). Web namespace:
  57e941288c606435fd6b8a623a210831fe9a9a73c20f72d7ce1070a2f265322f;
  landing: 3ad1dd875ec02c1b8d9771a3155f3ffbdc45dbdc4760c8ad5489354a6f6ba710.

No release commit, tag or deployment was performed. BUGS.md retains eleven
unresolved review findings (ten P2, one P3), alongside prior human accessibility
and live host-delivery acceptance items.

## Phase 3 astronomy and site-time fixes — October 10, 2026 (local development)

Resolved REV-005–012 locally. Boot planning uses the active site's calendar date;
wall-field resolution is independent of browser timezone, chooses the earlier
DST overlap occurrence, and shifts forward through gaps. Site midnight/noon,
consecutive noons and polar fallback endpoints resolve separately. Memoization
includes the resolved zone/actual noon; timezone changes invalidate full-day
anchors and date edits reposition selection. Full-day spans follow 23/24/25-hour
site calendar days while dragging retains its anchor through the endpoint.

Canonical lunar coefficients match Meeus tables. Moon altitude now subtracts
sea-level WGS84 observer parallax in the equatorial-of-date frame and refracts
once; phase/elongation remain geocentric J2000. Independent PyEphem/libastro
anchors cover eight dates/sites, distance and observer position; mutations catch
each corrected sign, distance errors and omitted parallax. The historical lunar
fixtures remain byte-identical; both fixture/mutation harnesses now use explicit
independent lunar references instead of accepting a permanently wrong oracle.
Culmination scans the complete site calendar day separately from rise/set, and
its Moon warning uses illumination at culmination with a 0.15 fraction threshold.
The truncated lunar model remains approximate; elevation is still metadata only.

Validation:
- Full pytest: 335 passed / 1 existing optional-data skip in 79.02s:
  logs/phase3/pytest-full-confirmation.txt. The first run's four integration
  failures required registering the new canonical exports, updating adapter
  contracts and the second obsolete lunar oracle comparison; two local HTTP
  checks required socket access. Its receipt remains in pytest-full.txt.
  The focused integration rerun passed 42 checks; final browser wiring passed
  10 checks after the browser completion-state correction.
- Full Chromium gate: 71/71 passed: logs/phase3/browser-full-confirmation.txt.
  The first full run passed 70/71; Catalog's existing advanced-visibility check
  mistook a partial exclusion count for completion while warming still ran.
  It now also waits for progress/busy completion without weakening the visibility
  assertion or adding retries/skips. Isolated confirmation passed in 3.7s;
  both full receipts and browser-catalog-investigation.txt remain available.
  Focused Phase 3 checks corrected test assumptions about selection-relative
  anchors, restored Catalog views and closed details; the final gate asserts
  remote-site boot dates, memo/anchor changes, 23/25h bounds, stable dragging,
  explicit calendar changes, and actual full/new Moon warning colors and text.
- Final JavaScript checks pass; development release gate reports zero errors
  with the expected dirty-version warning. Receipts: check-js-final.txt and
  release-check-final.txt. Recursive token update is idempotent (cache-final.txt).
- Core rebuilt to 282a2f0070874c8a, token 46, retaining 204c232bf69db731 as N-1.
  New generated modules were added to the Git index for the served-file tracking
  gate. App token is 169; importer tokens and AGENTS register are aligned.
- Rebuilt and verified the 63-file combined local publication candidate with
  truthful describe v0.1.1-1-g471e64a-dirty (publication-final.txt). Web namespace:
  83081f455059dc9a26f8c54c3d4353b5e7e2fec5956ed8f46657e935e17cd923;
  landing: d35f37eeb6bdd241873fe7255821c321f4f7adbde9eb311bb486bb21d787a6de.

No release commit, tag or deployment was performed. BUGS.md now retains eighteen
unresolved findings from the original review (sixteen P2, two P3), plus the
existing human accessibility/host-delivery acceptance items.

## Phase 2 release and cache fixes — October 10, 2026 (local development)

Resolved REV-025–027 locally. Both publication builders package complete web and
landing asset/data graphs under content-addressed release paths. Canonical HTML
pins assets while preserving ordinary navigation; catalog, provenance and version
requests resolve beside their module. The FTPS publisher validates local content
before credentials, verifies temporary uploads and the full remote graph, then
atomically renames public entries. Existing immutable bytes must match and old
releases remain available. Raw mutable website upload commands are refused;
changed root server policy requires separate review. No production connection or
host setting was exercised.

The token guard/updater now traverses all HTML roots and recursive imports,
re-exports and literal dynamic imports, including shared landing CSS. It refuses
conflicts, missing/unversioned dependencies and invalid baseline refreshes,
propagates importer changes once, preserves manual advances, uses manifest-owned
core tokens, and is idempotent. Image credits now shares theme token 21. Release
validation and staging enforce Git tracking for all served file types, allow only
generated web/version.json, and refuse symlinks or incomplete bundles.

Validation:
- Full pytest: 323 passed / 1 existing optional-data skip in 77.31s:
  logs/phase2/pytest-full.txt. The 25 new regressions cover upload interruption
  at every transfer, retry, corruption, immutable conflicts, actual Node execution
  of old/new graphs, full inventory tracking, symlinks, missing bundles, preflight
  before credentials, recursive propagation, manual advances, cycles, core tokens
  and historical discovery.
- Focused staged Chromium acceptance: 1/1 passed in 2.0s:
  logs/phase2/browser-staged-verified.txt. It boots Tonight, Catalog and Sky;
  exports pinned provenance; checks pinned version/data/assets; and navigates
  landing and secondary HTML. Initial harness assumptions about the pinned clock,
  existing tab names and static Image credits were corrected; failed focused logs
  remain available in logs/phase2.

- Initial full browser run: 66/67 passed; the existing responsive-planner
  keyboard photo-chooser check timed out without page/console errors:
  logs/phase2/browser-full.txt. Its isolated investigation passed in 8.8s:
  logs/phase2/browser-responsive-investigation.txt. No application changes or
  automatic retries/skips were introduced; the timeout's cause is unconfirmed.
- Final JavaScript gate passed: logs/phase2/check-js-final.txt. Development
  release gate passed with zero errors and the expected dirty-tag warning:
  logs/phase2/release-check-final.txt. A second cache-update run changed nothing:
  logs/phase2/cache-idempotence.txt.

- Repeated full Chromium gate: 67/67 passed, including the photo-chooser check
  and the new staged publication check: logs/phase2/browser-full-confirmation.txt.
- Final combined local candidate prepared and verified: 63 files, 54
  source artifacts, truthful describe v0.1.1-1-g471e64a-dirty:
  logs/phase2/publication-final.txt and dist/publication-preview/publication.manifest.json.
  The FTPS bundle loader independently accepted the complete local payload.
  This local verification performed no FTPS connection or upload.
Cache register/baseline now agree at app 167, horizon 78 and webstore 45.
Core math, generated core trees and reference fixtures remain unchanged.
BUGS.md retains 26 review findings (23 P2, 3 P3) for subsequent phases.
Changes remain local and uncommitted; no tag, publication or remote write occurred.

## Phase 1 integrity fixes — October 10, 2026 (local development)

Resolved REV-001–004 and REV-020–024 locally: verified FTPS peer identity,
transaction-completion storage writes, atomic record/safety replacement, strict
backup reads, durable CSP-compatible panorama photos, preference replacement
and validation, honest save/delete failure handling, safe unique custom IDs,
and full-input RA/Dec parsing. Full restore recovery includes reinitialization,
Tonight rendering and the original dirty editor history. Setup controls serialize
transfers. BUGS.md retains the other 29 review findings for later phases.

Final-source validation:
- 298 pytest tests passed / 1 existing optional local-data skip in 76.26s:
  logs/phase1-pytest-final-source.txt.
- Full real Chromium gate: 66/66 passed, including 13 new integrity checks:
  logs/phase1-browser-final.txt. Isolated checks cover request success followed
  by transaction abort, failed/missing reads, quota failures, current photo
  bytes after reload, complete rollback and dirty undo/redo recovery.
- JavaScript checks passed: logs/phase1-check-js.txt. Development release check
  passed with zero errors; the dirty, untagged HEAD warning is expected:
  logs/phase1-release-check.txt.
- Three offline TLS regressions verify untrusted certificate and wrong-hostname
  rejection before credentials, plus trusted login with encrypted data transfer.
  These tests are included in the full pytest count, not additional tests.

The first full validation exposed outdated test assumptions around durable
preference writes, plain-text error interpolation and strict reload arguments;
the adapters were corrected while retaining behavioral assertions. The browser
gate also caught a 0%-versus-1% Catalog-default regression; the shared preference
schema now preserves the established 1% default. That initial long-running gate
was stopped after the confirmed failure and restarted against corrected source;
logs/phase1-browser-full.txt retains the failed/interrupted attempt. The final
66/66 run completed cleanly.

Cache tokens and all affected served import references are aligned at app 166,
horizon 77 and webstore 44; the verified baseline and AGENTS.md register match.
Core math, generated core trees and reference fixtures were unchanged.
web/version.json truthfully reports 0.1.1-1-g471e64a-dirty. Changes are uncommitted;
no release tag, publication, production FTPS access or deployment was performed.

## Repository review validation — October 9, 2026 (no release)

Reviewed master application source at 471e64a across shared astronomy/time/
scoring, planner orchestration, browser persistence/backup, panorama geometry/
history, accessibility/public pages and catalog/build/release/deployment tools.
38 confirmed findings (4 P1, 30 P2, 4 P3) are recorded in BUGS.md and the detailed
local report logs/review/REVIEW.md. Only review documentation was changed;
application fixes, deployment, remote writes, release commits and actual-repo
tags were not performed. Generated version.json reports the truthful dirty
development describe after documentation edits.

Final review validation: 295 tests passed / 1 existing optional local-data skip
in 77.93s; scripts/check_js.py passed. Transcripts:
logs/review/validation/pytest.log and check-js.log. The unchanged-source setup
baseline also passed the full 53/53 browser gate (logs/environment/browser-check.log);
this was not reclassified as coverage of the newly failing scenarios.
Delegated scoped runs: 88 pipeline tests, 66 astronomy/time/scoring tests and 17
horizon-related tests passed; these overlap the full suite, so their counts are
not additional unique tests. Root's six UI/state/weather probes completed with
diagnostic assertions and saved logs/review/root/results.json. Subsystem reports
link numerical comparisons, offline deployment/token fixtures, real Chromium
accessibility/canvas probes, and real IndexedDB abort/read/quota fault injection.
Normal photo restoration failed under shipped CSP without quota injection.

Independent lunar references (PyMeeus 0.5.12 table coefficients and PyEphem
4.2.1) are installed only in ignored logs/review scratch. Three, not four,
coefficient signs are wrong; line 216's negative sign was independently ruled
correct. Corrected numerical comparisons use an in-memory copy, with no core
or frozen fixture changes. Manual screen-reader/native zoom, other browsers,
live hosting/FTPS behavior and exact absent upstream source-byte reconstruction
remain outside this review. Existing A11Y-001 and HOST-DELIVERY-001 remain open.

## v0.1.1 — released and deployed, October 8, 2026

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
Release commit 52038830584babcacc541670fe62f791750a665e and new annotated
v0.1.1 tag were pushed to codex/website-phase-two on GitHub. The verified 54-file
publication package and SHA256 assets are attached to the GitHub release.

Authorized production deployment completed: a fresh 260-file backup was hash
verified and re-inventoried before upload. All 54 files uploaded, dependencies
before every HTML entry point; all 54 passed FTPS readback hashes. HTTPS decoded
hashes match for all 52 public files and both entry routes. Live version is clean
0.1.1. Live browser acceptance passed fresh/return planning, 50-row Catalog and
checkbox filters, direct settings controls, simplified Tonight/Sky, one-minute
slider, fresh/cached Wikipedia photos with individual credits, OpenNGC sources,
and all six public pages at 1240/360px. Live Sky/phone Changes screenshots inspected.
All twelve remote core directories remain; no remote files were deleted.

Evidence: logs/deployment-0.1.1-20261007/ (backup, upload/readback, HTTPS/browser
transcripts and deployment-receipt.json; the backup started October 7 and final
publication was October 8). The release archive SHA256 is
c3b96c3529e3c41e7847e4e8d67034528d28f7985a6cd4446ac572cbec0730d4.
Actual cache headers remain correct. HTML/JS/large JSON still do not negotiate
compression, while version/manifests do; HOST-DELIVERY-001 remains open as requested.
Human AT/native zoom remains open. The independent catalog is unchanged.
Current status documentation corrected; prior dated validation remains history.

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

Completed docs/history/WEB_REMAINING_WORK_PLAN.md locally. Optional 6.74 MB provenance no
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
docs/history/WEBSITE_FINAL_REVIEW.md records all scenarios and screenshot/copy review.

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

Implemented docs/history/WEB_OPEN_DESIGN_IMPLEMENTATION_PLAN.md using the independent catalog
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

The dated review was reviews/current-pass/REVIEW-FULL-0.6.34-10.md in the former
combined repository. That desktop report is not present in the current web tree;
this historical entry does not provide a current review link.
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
