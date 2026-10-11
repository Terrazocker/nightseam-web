# Horizon / Panorama: geographic calibration and sky-mask plan

Created October 11, 2026. Owner-authorized P1/P2 are implemented in local software;
their integrated software gates are pending. P3–P7 remain open. This follow-up is
numbered P1–P7 to distinguish it from earlier improvement phases 1–5 and
simplification A–F. Local implementation does not authorize publication. Actual
validation outcomes belong in RELEASES.md; earlier work remains recorded in
HORIZON_PANORAMA_SIMPLIFICATION_PLAN.md.

## Goal and starting point

Make setup understandable, recover the photo's physical orientation, preserve
painting through calibration changes, and make planning distinguish photographed
clear sky, obstruction and missing evidence.

The current implementation already retains original photo bytes and reference
positions, validates bounded panorama metadata, converts supported projections,
supports extra fitting references and held-out checks, and protects crops,
history and transactional backups. Preserve these foundations.

P1/P2 add joint physical orientation fitting, optional measurement evidence and
explicit clear/blocked/unknown queries with a separate planning policy. Legacy
linear evidence keeps its original interpretation. Remaining gaps are painting
tied to the angular working view; one ceiling or one open band per direction;
absence of a source-pixel evidence mask and spatial uncertainty; and planning
based on the target centre rather than its complete camera field.

Basis: the supplied October 2026 white paper, *Geographic Calibration of
Panoramic Sky-Obstruction Maps*, compared with current code and
[accuracy research](HORIZON_ACCURACY_RESEARCH.md). The paper proposes an
architecture, not an empirically validated complete system. Its example grid
size and reference counts are not accuracy guarantees.

## Sequence

| Phase | Deliverable | Depends on |
| --- | --- | --- |
| P1 | Coverage, measurement and compatibility contracts | Existing A–F |
| P2 | Physical orientation fitting and simpler alignment | P1 |
| P3 | Original-photo painting that survives recalibration | P1, P2 mapping contract |
| P4 | Multiple sky openings and shared clear/blocked/unknown queries | P3 |
| P5 | Spatial uncertainty, boundary margins and capture validity | P2, P4 |
| P6 | Complete camera-field visibility and refined crossing times | P4, P5 |
| P7 | Integrated software and real-world accuracy acceptance | P1–P6 |

Current P1/P2 scope: evidence v5 and backup 10 retain source/model orientation,
fitting/check roles, optional measurement source/error/time/group/exclusion and
observing-position/capture evidence. Confirmed converted photos default to
inferred-open coverage since October 11, 2026 (strict until then; strict stays
selectable); older records retain legacy behavior. Physical fits use
weighted unit-ray alignment with optional robust weighting, while known geometry
can proceed directly to review/checking without invented fitting points.
Unknown-FOV estimation is limited to corrected rectilinear photos, at least four
active fitting points and two held-out checks, and a bounded 5–150° search. Its
held-out improvement and curvature gates must pass. Existing painting/profile
conversion remains refused until P3. No physical accuracy claim follows from
these local implementations; software gate results will be recorded separately.

Each phase includes its own software checks. P7 is a final integrated gate;
validation must not be postponed until then. Review the experience after P2 and
P4 before expanding it. Suggested implementation batches are P1–P2, P3–P4,
P5–P6, then P7.

## P1 — Define evidence, coverage and compatibility

Deliver:
- Define known clear, known blocked and unknown states, with separate provenance
  for inferred openness above an ordinary skyline. Keep evidence distinct from
  the policy that decides whether unknown directions can be planned.
- Define true-north bearings and altitude angles above horizontal, including the
  apparent/geometric convention used by the shared astronomy engine. Metres of
  object height are not interchangeable with altitude angles.
- Extend reference evidence with optional measurement source, stated error,
  capture time and explicit exclusion reason. Distinguish a held-out point from
  a measurement obtained through an independent method.
- Record observing position, optical height and capture date where known. Explain
  same-position capture; missing information remains missing. Ordinary GPS alone
  does not establish the viewpoint accuracy needed for nearby obstacles.
- Specify versioned storage, backup validation, history and migration rules for
  source masks, visibility states, inference policy and derived caches.
- Define practical inferred-open and strict measured-coverage modes. New measured
  layers default to treating unknown coverage conservatively. Older horizons
  retain their behavior with their assumptions identified.

Acceptance: old records and bundles retain their visibility; corrupt or
unsupported new evidence is rejected before writes; no missing measurement or
source mask is fabricated. Coverage policy is understandable through text as
well as visual cues.

## P2 — Fit orientation and simplify alignment

Deliver:
- For a supported projection with known geometry, fit heading, pitch and roll
  jointly from image rays and measured sky directions. Keep known field of view
  and other trusted image properties fixed; estimate only declared unknowns.
- Use spherical angular residuals with numerically stable calculations. Show
  per-point bearing/altitude differences, angular error, maximum and RMS error.
- Add measurement weighting when meaningful error estimates exist. Robust loss
  may reduce suspect points' influence, but must show that influence and retain
  the points. Actual exclusion remains an explicit action.
- Check spread, conditioning, bearing-wrap ambiguity and parameter bounds. Do
  not infer arbitrary lens distortion or stitching repair from a few points.
- Keep held-out checks outside fitting. Preserve older evidence semantics and
  retain the existing linear method for its supported level-panorama case.
- Keep the historical 1-degree per-axis acceptance policy for old evidence.
  Specify a separate angular acceptance policy for the new solver; it is not
  mathematically equivalent. Check directional degeneracy rather than requiring
  separation in both image axes for every model.
- Provide **Add photo → Confirm detected geometry → Mark known features → Review
  alignment → Draw → Save**. Ask for additional references only when the model
  needs them. A known model can be checked without forcing redundant fitting.
- Preview and apply one atomic, undoable result. Recommend reviewing geometry
  before removing a measurement that disagrees.

Needs: the existing projection-ray and rotation implementation in core, a bounded
solver, and deterministic model-specific fixtures. Establish numerical tolerances
before evaluating fixtures. Two non-collinear directions can constrain rotation
when the geometry is known; they do not identify every unknown camera parameter.

Deliver P2 in three steps: known-geometry orientation fitting, the guided setup,
then constrained unknown-field-of-view fitting only for identifiable supported
models. Unknown projection/pose/coverage combinations remain approximate when
the available evidence cannot distinguish them. Additional model complexity must
improve held-out checks, not merely fit the entered points more closely.

Acceptance: supported synthetic images recover known orientation, including
north crossing and nonzero roll/pitch; poor geometry or insufficient constraints
produce an explanation without changing saved state. Independent checks expose
incorrect models. Existing unsupported conversion limits remain explicit.

Until P3 is complete, retain the restriction on changing projection after
painting. P2 improves alignment before drawing; it must not reinterpret old paint.

## P3 — Keep editable painting on the original photo

Deliver:
- Store new traces and ordered paint corrections in original-image coordinates,
  separate from the projection, orientation and derived angular view.
- Use the shared forward/inverse mapping for display, pointer picking and brushes.
  Define whether a brush represents image pixels or angular size, and transform
  its entire footprint consistently under zoom and projection.
- Rebuild derived views after recalibration while keeping the source feature
  painted. Make preview/application, cancel, undo/redo, reload and backup atomic.
- Keep crops non-destructive. Hidden paint remains recoverable, while the active
  crop determines the evidence available to the current planning layer.
- Define clearing a correction separately from marking sky clear; removing
  evidence must not silently create known-clear pixels.
- Preserve old angular strokes and authoritative world profiles as legacy layers.
  Offer conversion only when its geometry is known and loss is bounded and shown;
  otherwise retain the layer and provide a new-source-mask path.
- Bound mask resolution, cache memory and rebuild work; allow cancellation and
  reject stale results from superseded edits.

Acceptance: paint follows the same roof/tree feature through supported
recalibration, crop and history operations. Thin features and corrections survive
round trips. Old profiles with absent strokes remain authoritative; save or
rebuild failures cannot leave partially updated data.

## P4 — Represent the sky beyond one skyline

Deliver:
- Introduce a canonical spherical state map or lossless sets of vertical
  intervals. Support disconnected clear openings, branches, balconies and
  overhangs, with known clear/blocked/unknown evidence and inference provenance.
- Map output directions back into source masks. Track the actual photographed
  footprint and crop boundaries; do not infer coverage from a bounding rectangle
  that includes unphotographed directions.
- Resample conservatively over cell footprints so narrow obstructions survive.
  A single sample at a cell centre is insufficient. Preserve unknown areas and
  distinguish display antialiasing from visibility classification.
- Derive a fast skyline only where its assumptions hold. Keep all visibility
  consumers on one shared core query, with the same policy and explanations.
- Choose resolution from accuracy, thin-feature preservation and browser memory
  measurements. A finer grid cannot improve bad calibration. Account for
  unequal spherical cell areas where aggregate fractions require it.
- Present Unknown separately from Blocked, keep ordinary tracing simple, and
  expose multiple openings through the existing editor rather than a second UI.

Acceptance: synthetic disconnected gaps stay disconnected; seams, poles, crops
and source edges classify correctly; unsupported coverage never becomes measured
clear sky. Tonight, Catalog and Sky View agree. Legacy inference policies and
authoritative profiles continue to work.

## P5 — Explain uncertainty and stale evidence

Deliver:
- Estimate spatial calibration sensitivity from stated measurement errors and
  fit conditioning, showing where extrapolation has weak support. Keep angular
  residuals separate from uncertainty estimates.
- Represent uncertain mask boundaries and allow a stated angular clearance
  margin. Return a marginal result near blocked or unknown boundaries.
- Separate random measurement error from shared compass, projection or stitching
  bias. Do not present point count, fit agreement or a descriptive score as a
  calibrated probability of clear sky.
- Add capture/validity information for permanent, seasonal and temporary
  obstructions. Clouds belong to weather rather than permanent obstruction data.
- Flag observer-position/height mismatches and outdated layers. Do not pretend a
  two-dimensional mask can correct parallax after the observer moves.
- Keep basic setup short; detailed evidence and margin controls belong in Advanced.

Acceptance: controlled noisy fixtures and weakly supported regions produce
appropriate diagnostics; changing a margin changes decisions predictably; stale
or incompatible evidence is visible. Missing error estimates remain unstated
rather than receiving invented precision.

## P6 — Plan for the camera field and obstruction crossings

Deliver:
- Query the complete spherical camera footprint using known sensor field,
  orientation and applicable field rotation. If required rig/orientation data
  are missing, explain the limitation and retain centre-only results explicitly.
- Distinguish centre visibility, whole-frame clearance and partial framing.
  Report blocked and unknown fractions with a documented area definition and
  bounded sampling error; margins apply to the whole footprint.
- Refine obstruction crossing times and search for short gaps between coarse
  samples. Endpoint agreement alone does not prove an interval is clear.
- Bound work using angular motion and feature resolution where possible. If a
  requested timing precision cannot be established within the budget, report
  that limit rather than promising an exact window.
- Preserve shared scoring, half-open intervals, selected-time truth, site-zoned
  nights and the existing apparent-altitude astronomy contracts.

Acceptance: a clear centre with an obstructed corner is reported correctly;
rotation and unknown corners affect framing consistently. Synthetic crossings,
short openings and seam cases agree with independently derived event times
within declared tolerances. Planner views agree and performance remains bounded.

## P7 — Integrated validation and owner acceptance

Deliver:
- Maintain synthetic ground truth for each supported projection, known pose,
  crops, seams, thin obstacles, multiple openings, measurement errors and unknown
  coverage. Separate reference-anchor correctness from frozen regressions.
- Run integrated import, calibration, painting, history, reload and transactional
  backup checks, including old/new records, interrupted work and failure rollback.
- Complete relevant checks during each phase; finish with the full Python suite,
  JavaScript/token checks, real browser suite and development release checks.
  Rebuild generated core from core sources, maintain hashes and N/N-1 retention,
  and bump behavior-changing tokens and entry-point references.
- Update architecture, decisions, confirmed unresolved bugs, current roadmap and
  actual validation receipts as implementation progresses.
- Prepare a reviewed local candidate and a physical-photo checklist covering
  different supported cameras/projections, same-position capture, near obstacles,
  tilted images and held-out measurements distributed across the image.
- Measure incorrectly clear predictions, incorrectly blocked predictions,
  unknown coverage and timing error against independent evidence. Define the
  field acceptance thresholds before judging results; publish observed limits.
- Keep touch/pen, native zoom and screen-reader acceptance in the owner checklist.
  Existing owner acceptance remains open until actually performed.

Acceptance: software gates pass and remaining physical limitations are recorded
truthfully. Synthetic checks alone do not establish real-world accuracy. Public
publication remains a separately authorized action.

## Later extensions — separate scope after P7

- Merge several compatible same-viewpoint photos, with coverage union and explicit
  contradiction review rather than silently selecting a preferred obstruction.
- Suggest sky masks automatically, with manual correction and review. A generic
  prompted segmenter does not establish usable-sky semantics.
- Add timestamped astronomical reference assistance through the existing core;
  account for panorama capture duration and the chosen altitude convention.
- Add distant-terrain assistance with explicit dataset resolution, surface/terrain
  and vertical-datum limits. It cannot replace nearby-obstruction evidence.
- Consider regularized local distortion correction only with enough distributed
  references and held-out improvement. Arbitrary stitching/lens repair remains
  unsupported until independently demonstrated.

These extensions are not prerequisites for the primary workflow and are not
included in P1–P7 implementation scope.

## Technical references

- [Weighted rotation fitting](https://docs.scipy.org/doc/scipy/reference/generated/scipy.spatial.transform.Rotation.align_vectors.html)
  informs orientation fitting; it does not require adding Python to the browser.
- [Robust nonlinear fitting](https://ceres-solver.readthedocs.io/latest/nnls_tutorial.html)
  informs loss and diagnostic choices; no C++ dependency is assumed.
- [GPano geometry and orientation](https://developers.google.com/streetview/spherical-metadata)
  supplies metadata conventions, subject to the existing validation rules.
- [Panorama parallax](https://hugin.sourceforge.io/docs/manual/Parallax.html)
  explains why observer position and stationary capture matter.
