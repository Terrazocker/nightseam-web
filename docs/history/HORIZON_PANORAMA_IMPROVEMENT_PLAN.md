# Horizon and Panorama improvement plan

October 10, 2026. Initial review of committed master cacdacf. The owner subsequently
authorized phases 1–5. Phases 1–4 are implemented locally; phase 5 software
acceptance is complete (349 Python tests and 93 browser cases passed, plus
JS/core/cache/release gates and a verified local immutable candidate).
The owner will handle real photographs with
independent references and physical-device/assistive-technology checks.
The findings below preserve the original review evidence; implementation and
validation receipts are recorded in DEVELOPMENT.md, DECISIONS.md and RELEASES.md.

The owner's subsequent hands-on feedback and two-point calibration proposal are
captured in [the new simplification plan](HORIZON_PANORAMA_SIMPLIFICATION_PLAN.md).
Its phases A–C are now implemented locally; D–F remain open. Accuracy research
and follow-up changes are in [HORIZON_ACCURACY_RESEARCH.md](HORIZON_ACCURACY_RESEARCH.md).
Those lettered phases are separate from the original phases below.

## Findings and evidence

The feature has useful storage/history safeguards, but combines photo setup,
calibration, painting, cropping and advanced profile editing without a guided
sequence. Successful automated geometry checks do not establish that a user can
calibrate a real photograph accurately or paint it comfortably.

Confirmed in an isolated local browser with a synthetic 1600x500 landmarks image:
- A painted tower initially aligned with its photo. Keeping an approximately
  214-degree horizontal band moved the paint left while leaving the tower in the
  photo at its original relative position. Crop transforms the mask/calibration
  but redraws the whole source photograph. Original photo retention is correct;
  the displayed crop needs a matching, persisted source region. Evidence:
  logs/horizon-review-crop.jpg. Relevant code: core/horizon.js:517 and
  web/horizon.js:2005.
- Degree labels were visibly flattened and tiny on the wide panorama, while text
  baked into the test image remained readable. DPR backing-store sizing already
  exists; guide text is drawn inside the nonuniform angular/image transform.
  Relevant code: web/horizon.js:1206, 1218, 1295 and 1331.
- Moving Alt bottom to its maximum produced a 90-to-95-degree model/summary,
  although Alt top's range input still showed 90 and its value label showed 95.
  Relevant code: web/horizon.js:1824.
- Crop preview said the kept band was expanded to the minimum FOV for a roughly
  214-degree selection. The expanded flag also covers ordinary integer-FOV
  rounding, but the message attributes every expansion to the 45-degree minimum.
  Relevant code: core/horizon.js:466 and web/horizon.js:1500.

Code-confirmed weaknesses needing focused behavioural reproduction:
- Pointer samples append isolated dabs; no segment interpolation/coalesced
  samples join them. Fast motion with a small brush can leave gaps.
- No active-pointer ownership, pointercancel or lostpointercapture settlement.
  Interrupted touch/pen and multiple pointers need real gesture tests.
- Every dab replays the accumulated paint and rebuilds/render-scans the mask.
  Measure long-session latency before choosing the optimization.
- Brush footprint is tied to logical mask coordinates, becomes an ellipse at
  many source aspects, and grows with zoom. There is no footprint preview.
- Rerender preserves stored data/history but resets zoom, brush and eraser.

Workflow weaknesses observed in the UI and code:
- Imported images start at assumed 360-degree coverage and 0-to-60-degree height.
- Calibration consists of four sliders, without a known-bearing anchor workflow,
  exact adjacent numeric inputs, vertical reference guidance or independent check.
- Named landmarks annotate the profile; they do not calibrate the image.
- The mapping assumes linear image x-to-azimuth and y-to-altitude. Arbitrary
  camera images should not silently be presented as precise angular maps.
- Important paint/history actions require scrolling the tools rail at the
  reviewed desktop viewport; calibration and authoring compete for attention.

## Phase 1 — Correctness and reliable gestures

Status: implemented locally. Original-photo source bounds compose with repeated
crops and are covered by history/backup v4/reload. Sparse samples interpolate;
one owned gesture settles once, retaining visible partial paint on interruption.
Physical altitude bounds are enforced for edits and old local/restored records.

Fix source-photo/crop alignment, repeated-crop composition and calibration bounds
first. Distinguish minimum-FOV enforcement from rounding in previews, and format
displayed angles consistently. Add continuous stroke sampling, pointer ownership
and explicit cancellation/capture-loss behaviour. Decide and test whether an
interrupted gesture commits its visible partial edit or rolls it back; either
result must preserve safe history and dirty-state truth. Keep one undo step per
gesture.

Acceptance: recognizable photo landmarks and their paint stay aligned after
crop, undo/redo, save/reload and backup restore. Sparse fast pointer paths have no
unintended gaps. Interrupted/two-pointer gestures cannot leave a stuck brush or
modify another gesture. Calibration values and controls agree and stay valid.

## Phase 2 — A readable and precise editing surface

Status: implemented locally. CSS-pixel rulers and adaptive tick spacing are
independent of image aspect/zoom; brush preview/angular size, session tool/view
state, bounded sticky actions, grid/opacity controls and incremental/frame-batched
painting are in place. Measured latency and DPR/responsive evidence are recorded
in RELEASES.md. Real devices/assistive technology remain phase 5 acceptance.

Keep photo/mask/grid positions in the shared angular geometry, but draw degree
labels and rulers in screen pixels with consistent font size and line width.
Use adaptive tick spacing, pixel-aligned strokes, persistent edge rulers and
plain cursor azimuth/altitude readouts. Allow quieter grid and adjustable mask
opacity without hiding the profile's meaning.

Show the actual brush footprint and size; decide explicitly how brush size
behaves under zoom. Preserve view/tool state through unrelated rerenders. Keep
Save, Undo/Redo, tool choice and zoom reachable. Measure input-to-visible-paint
latency with long histories and large images; batch rendering per frame and
update dirty regions if measurements warrant it.

Acceptance: readable, undistorted labels at DPR 1/1.5/2, wide/partial/portrait
images and all supported zoom levels; zoom cannot remove every direction label.
Brush preview matches what is painted. Header changes do not reset detailed work.
Agree a measured latency target from the baseline before optimization.

## Phase 3 — Guided import and real-world calibration

Status: implemented locally for software acceptance. New photo imports enter an
editable coverage/direction/vertical-reference/check/paint sequence; existing
records open directly for editing. True-bearing alignment, two-point altitude
fit, exact controls, original-photo evidence, backup v5/history, computed trust
status and independent discrepancy display have core and browser coverage.
Only declared equirectangular projections can show checked references. Physical
full/partial photographs with known measurements still need human validation
under phase 5; synthetic images cannot establish physical calibration accuracy.

Present a short sequence: Import → Set coverage → Align direction → Set vertical
reference/scale → Verify → Paint. Steps remain editable; existing calibrated
records can open directly in the editor.

- Ask whether this is a full 360-degree panorama or a partial view. Explain the
  supported projection/capture assumptions and mark approximate calibration.
- Let the user click a recognizable feature and enter its known true-north
  bearing. Do not require North to be inside a partial photo. Exact numeric
  inputs accompany optional fine sliders/nudges. Explain the distinction from
  magnetic compass readings; automatic conversion would need separate scope.
- Provide a level/zero-altitude reference and vertical-scale guidance based on
  measured or known angular references. A tree/roof skyline is an obstruction,
  not automatically the zero-altitude line.
- Check a second independent known reference and show calibration discrepancies.
  Clearly distinguish assumed, approximate and checked values.
- Make image coverage, direction and zero-altitude line visible in the preview;
  explain how edits affect the live plan and what Save persists.

Acceptance: complete both a 360-degree and a partial-photo setup without guessing
what Az @ left or FOV means. Known bearings/altitudes agree with the overlay and
planner. Unsupported projections cannot imply verified precision. A human with
known real-world references must validate this workflow; synthetic images cannot
prove the photograph's physical calibration.

## Phase 4 — Better obstruction authoring

Status: implemented locally. Ordered skyline operations fill below connected
points, retain later brush/eraser corrections, and support click/drag, exact
percent positions, keyboard selection/movement, history, crops and backup v6.
Sky-band/overhang painting remains separate; switching from a traced obstacle
asks before removing the trace and is undoable. Exact-bin replacement semantics
are now stated beside the advanced controls.

Add a skyline tracing tool with editable points/segments and fill below the
trace for ordinary terrain, trees and buildings. Retain brush/eraser for local
corrections and irregular structures. Keep visible-sky-band/overhang workflows
separate and clearly explained; a single skyline does not represent every scene.

Add clear active-tool feedback, footprint cursor, optional straight segments and
easy local adjustments. Keep precision profile values as an advanced alternative,
with clear replacement/history semantics. Automatic skyline detection is a later,
optional proposal requiring a preview and explicit review before application.

Acceptance: a representative roof/tree outline can be traced and corrected with
less work than painting the entire blocked area; both obstacle and band modes
retain accurate planner results and undo/redo. Exact output semantics are designed
with storage/history compatibility, rather than adding shell-only geometry.

## Phase 5 — Compatibility and end-to-end acceptance

Status: software acceptance complete; real-world owner acceptance remains open.
Final full browser gate: 93/93; Python: 349 passed, one existing optional skip.
The 67-file immutable local candidate is prepared and verified. CPU profiling identified repeated
timezone formatter construction and expensive memo keys in CAT-PERF-001.
A bounded formatter cache preserves per-instant DST resolution; cached scrub
timing now has substantial margin, with final selected-time values also checked.
Physical photo/device/accessibility acceptance remains with the owner.

Expand the acceptance matrix beyond current stored-geometry tests: old records,
full/partial and north-seam panoramas, repeated crops, large images, blank sky,
both painting modes, overhangs, sparse pointer events, touch/pen/cancellation,
native zoom/DPR/resizing, long sessions, save failures, reload, backup restoration,
authoritative profiles without strokes and planner integration.

Use one real full panorama and one real partial photograph with independently
known direction/altitude references for usability and physical-calibration
acceptance. Complete accessibility checks for the changed controls. Run required
Python, JS, browser, core/token and development release gates, then prepare a
fresh reviewable immutable candidate. Release/deployment remains a separate step.

## Constraints and ordering

Preserve non-destructive original images, global world-azimuth bins, shared core
math, old elliptical strokes, authoritative stroke-less profiles, stroke
precedence, transactional backup/rollback, history, dirty-editor warnings and
live planning behaviour. Design source-region/trace data with schema, migration,
history and backup support together. Never manually edit generated core trees.

Order: correctness → readable surface → guided calibration → authoring tools →
integrated acceptance. Build focused tests and compatibility into each phase;
phase 5 consolidates evidence rather than postponing safety until the end.

Do not begin with automatic tracing, more knobs or a cosmetic restyle. Correct
alignment and readable angular references are prerequisites for trustworthy
calibration and useful authoring tools. Phases 1–5 have implementation
authorization; public release/deployment remains a separate decision.
