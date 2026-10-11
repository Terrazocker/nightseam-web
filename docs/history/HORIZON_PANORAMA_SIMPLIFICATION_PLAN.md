# Horizon / Panorama: simpler setup and projection-aware calibration

Plan proposed October 10, 2026. The owner authorized A–C and then D–F.
Implementation is local; actual software validation is recorded in RELEASES.md.
The earlier improvement phases remain completed history.

A–C provide uncovered ruler margins, atomic two-point fitting, guided setup,
optional checks, default tracing and contextual removal. D now provides validated
GPano metadata and optional leveling/conversion for angular, cylindrical and
corrected centred ordinary photos with known geometry. Original bytes and source
references are retained. Conversion of painted records is deliberately refused:
use a new horizon and redraw rather than reinterpret strokes or authoritative
profiles. E provides 2–16 fitting references, explicit exclusions and up to 16
held-out checks with residuals, spread and sensitivity diagnostics. F covers the
integrated software gates and immutable local candidate, with receipts in
RELEASES.md. Owner real-photo/device/accessibility acceptance remains open.

Supported conversion is constrained: it cannot infer arbitrary distortion,
repair stitching, or level a partial panorama wider than 180° (use full 360° or
a narrower source). Corrected ordinary photos require known coverage, centred
square-pixel optics and explicit lens-correction confirmation. The working view
keeps a fully photographed rectangle; excluded directions block planning.
Legacy compressed images cannot regain detail discarded before this work.
See [accuracy research](HORIZON_ACCURACY_RESEARCH.md) for math and remaining limits.

## Intended experience

**Add horizon photo → Mark two known points → Review alignment → Draw skyline → Save.**

The photo is the main workspace. One instruction and the controls needed for it
appear at a time. Each reference point has a true-north bearing and an altitude
angle (degrees above horizontal, not metres). The app calculates the supported
mapping and its coverage. An optional separate point checks the result without
changing the fit. Existing horizons open directly for editing.

The previous brainstorm is retained in this proposal: unobscured rulers;
image-first reference picking; approximate and precise setup choices; optional
visual level-line adjustment; tracing by default; nearby point removal; quiet
advanced controls and a collapsed profile; and a simple review/save finish.

## Accuracy boundary

Two complete points determine horizontal/vertical scale and offsets for a level,
upright equirectangular image when the references differ sufficiently in both
axes and the bearing wrap is unambiguous. They do not establish arbitrary lens
distortion, camera tilt, unknown projection or stitching errors. A perfect fit to
two input points is not independent verification.

Other projections can be supported with their actual geometry. The current
image, mask, ruler, crop and planner-profile mapping all assumes linear angular
coordinates, so adding a projection selector or changing only the calibration
report is insufficient. Projection conversion is a separate implementation phase.

Prefer plain states such as **Approximate**, **Aligned from references**, and
**Check agrees / Check differs**. Show discrepancy in degrees and the assumptions
used. Keep unknown projections approximate even when their fit points agree.
Do not invent a percentage confidence score or claim guaranteed accuracy.

## Phase A — Unobscured image and a quieter editor

Implement:
- Move direction/altitude rulers outside the photo into reserved gutters. Keep
  crisp screen-sized text, adaptive spacing and alignment under zoom/pan. If an
  overlay is needed on a small viewport, use transparent labels with a thin text
  outline; no opaque strips over image pixels. Update drawing and inverse pointer
  hit-testing together to use the image's content rectangle inside those gutters.
- Retain visible Save, Undo/Redo and active-tool feedback. Show one concise help
  instruction instead of several paragraphs and unrelated settings at once.
- Collapse the profile plot and advanced controls by default. Keep them readily
  available; support keyboard/focus, phones, reduced motion and text summaries.

Needs: the existing Workbench tokens and editor transforms. No new calibration
math or storage format is needed for this phase.

Done when: all photo edges are visible, photo/mask/picking remain aligned, and
essential actions are usable at supported desktop/phone sizes, zoom and DPR.

## Phase B — Atomic two-point calibration and durable evidence

Implement in shared core:
- Store two original-photo reference positions, each with bearing and altitude,
  separately from check points. Record the declared/confirmed projection and any
  explicit full-360 coverage assumption.
- Solve horizontal coverage and direction offset from the two bearings and image
  x positions; solve vertical scale/offset from their altitude and y differences.
  Apply one validated result as one undoable change. Preview before application.
- Reject insufficient separation, inverted/mirrored mappings, non-finite values,
  unsupported physical bounds and coverage beyond 360 degrees. Explain how to
  choose better points; never silently clamp a fit into validity.
- Handle north crossing and wider-than-180-degree spans explicitly. If several
  bearing-wrap interpretations remain valid, ask the user to resolve coverage;
  do not always assume the shortest bearing difference. Equal bearings at full
  panorama seam endpoints require a confirmed 360-degree constraint.
- Treat independently known full-360 width as a constraint. Diagnose reference
  inconsistency rather than silently altering that known width.
- Preserve original-image coordinates through crop, reload, history and backup.
  Version new evidence and extend transactional validation/migrations before UI
  adoption. Leave existing horizons unchanged until deliberately recalibrated.

Needs: extend existing core/horizoncalibration.js, reuse its source-coordinate and
vertical-fit helpers, and update exports, storage, history and backup together.
Retain supported existing evidence on migration without fabricating missing
bearings or check measurements. Do not confuse calibration references with named
obstruction landmarks.

Done when: known synthetic full/partial panoramas recover the expected angles,
including cropped and north-crossing cases; invalid/ambiguous fits cannot mutate
saved geometry; old records and backup bundles still behave correctly.

## Phase C — The simple setup and drawing flow

Implement:
- One **Add horizon photo** entry, followed by one photo-picking instruction at a
  time. For each point: click/drag the marker, enter bearing and altitude angle.
  North/East/South/West shortcuts supplement exact bearing input. Percent image
  positions remain available as a keyboard-accessible advanced alternative.
- Identify the image type in plain language when metadata cannot establish it.
  Never infer full coverage or projection from image shape alone. Keep unknown
  photos usable through clearly labelled approximate setup.
- Show calculated alignment, a level line and angular coverage in the preview.
  Offer **Check another point** or **Continue to drawing**. Numerical checking
  does not require another mandatory setup step.
- Retain visual level-line/fine adjustment as an optional approximate path;
  manual changes invalidate any previous check until it is repeated. Do not ask
  users to supply a separate zero-altitude reference in addition to two complete
  calibration points.
- Make skyline tracing the default for ordinary obstacles. Click to add, drag
  to adjust, and show a nearby **Remove point** action for the selected point,
  with an equivalent reachable keyboard/button control. Keep Undo prominent.
- Put brush/eraser corrections behind a simple tool choice. Keep multiple traces,
  coordinates, sky openings/overhangs and exact-bin editing in Advanced while
  preserving existing data and editing capabilities.
- Finish with the photo result, short accuracy status and **Save horizon**.
  Explain local browser storage briefly. Preserve dirty-state and save-failure
  protection; canceling setup must not leave a half-applied fit.

Needs: Phase B, existing tracing/gesture machinery and state-aware setup UI. Use
the existing photo editor instead of adding a second parallel editor.

Done when: a user can complete upload, two references, drawing and save without
understanding FOV, azimuth offsets, projection equations or image percentages.
Existing records still open directly, and point deletion is discoverable.

## Phase D — Metadata and supported projection conversion

Deliver in smaller steps:
1. Read bounded/validated panorama metadata to prefill projection, orientation
   and original crop/coverage where available. Show what was detected and allow
   correction. Treat inconsistent/stale metadata as a prompt, not authority.
2. Add known cylindrical input conversion to an angular working surface. Its
   vertical mapping is nonlinear; request missing coverage/orientation/scale
   constraints instead of assuming the two-point linear fit applies.
3. Add ordinary rectilinear photo support using field of view, camera orientation
   and, where required, lens parameters. Assess additional reference needs before
   promising a universal two-point solution. EXIF focal length alone may be
   insufficient, particularly for cropped or already stitched images.

Keep original photo bytes and original-pixel references. Prefer a derived angular
working surface so existing world-bin/profile and authoring geometry remain
coherent. Define forward/inverse source mapping, crop semantics, history, backup,
memory limits and resampling together. Mark unphotographed areas as outside
coverage, not clear sky. Conversion cannot repair arbitrary stitching errors.

Before converting an already painted record, provide a reviewed compatibility
path that preserves authoritative world profiles and correctly transforms
editable geometry, or explains what cannot be preserved. Never silently reinterpret
old strokes under a new mapping. Test and version these changes together.

Needs: confirmed source projection and adequate geometry constraints, deterministic
projection fixtures, metadata examples and a bounded browser rendering strategy.
All projection/calibration math belongs in core; no bundler or duplicate shell
math. No requirement for the user to install a separate conversion tool.

Done when: independent known angles agree across each supported converted image,
and image, paint, rulers, crop and planner all share that mapping. Unsupported
inputs remain usable and explicitly approximate.

## Phase E — Additional references and stronger checks

Implement:
- Allow more calibration points when needed and fit the selected supported model
  with appropriate constraints. Keep the normal two-point path short.
- Report conflicting measurements, poor spatial spread and per-point residuals.
  Offer review/exclusion of a suspect point; do not silently discard measurements.
  Show worst absolute errors rather than averaging opposing errors into a pass,
  and explain when the result extrapolates beyond the measured region.
- Keep one or more check points outside the fitting calculation. If a check point
  becomes a calibration point, remove its independent-check claim and request a
  new check. Explain that agreement does not prove measurement accuracy.
- Retain a stated discrepancy threshold, initially the current 1-degree check
  threshold, rather than inventing confidence from the number of points. Report
  bearing and altitude differences separately and avoid treating clustered checks
  as evidence for the whole image.

Needs: Phases B/C for basic equirectangular fitting; Phase D before fitting other
projection models. Define conditioning, residuals and model parameter limits in
core. More points do not identify every unknown distortion automatically.

Done when: held-out checks detect wrong scale, wrong projection or inconsistent
references in deterministic cases, and fit-point agreement alone cannot produce
a checked claim.

## Phase F — Integrated acceptance and review candidate

Throughout implementation, add focused geometry/storage/browser checks at the
phase where behavior changes. At the end:
- Verify old records, profiles without strokes, crops, all authoring modes,
  undo/redo, save/reload, backup validation/rollback and planner integration.
- Exercise setup, point deletion, cancellation, keyboard/focus, responsive layout,
  zoom/DPR, long histories and representative large photos in the browser.
- Run required full Python, JavaScript, browser, core, cache-token and development
  release gates; update tokens/generated core through repository tools. Preserve
  the current and previous baked core versions and truthful development stamping.
- Record actual validation outcomes and any unresolved findings; prepare and
  verify a new immutable local review candidate. Do not publish or tag it.

Owner acceptance remains separate as already requested: independently measured
real full/partial photos, physical touch/pen, native zoom and screen-reader checks.
Use measurements taken from the same observing position as the photo, with true
north consistently. Synthetic software checks cannot establish physical accuracy.

## Recommended order and required inputs

**A → B → C → D → E → F.** A–C provide the first complete, simpler experience;
D–E broaden accurate input support. E's basic equirectangular multi-point work
can proceed without waiting for ordinary-camera support. Acceptance accompanies
each phase; F consolidates it.

Software work can start with existing components and deterministic synthetic
images; no real photos are required to begin A–C. Before declaring conversion
support complete, use representative known equirectangular, cylindrical and
rectilinear samples with trustworthy parameters, plus cropped/missing/stale
metadata cases. Owner-provided reference photos are for final physical acceptance,
not a reason to defer the software checks.

Future optional work: automatic skyline suggestions, automatic magnetic-to-true
north correction, and arbitrary stitching repair. These are outside this plan.

Technical references: [Hugin input projections](https://hugin.sourceforge.io/docs/manual/Hugin_Photos_tab.html),
[cylindrical conversion](https://paulbourke.net/panorama/pano2sphere/index.html),
and [panorama metadata](https://developers.google.com/streetview/spherical-metadata).
