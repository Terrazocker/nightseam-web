# NightSeam Web roadmap and current backlog

Current authority, October 11, 2026. This repository owns only the public site and
browser planner. The independent Windows catalog has its own repository/roadmap.
Historical evidence remains in RELEASES/DECISIONS and superseded concept plans.

## Horizon / Panorama — local development

The original improvement phases 1–5 and simplification A–C are implemented
locally. Follow-up accuracy work adds balanced known-360 fitting with visible
residuals, scale-sensitivity diagnostics and true full-panorama seam handling.
See [the simplification plan](HORIZON_PANORAMA_SIMPLIFICATION_PLAN.md) and
[accuracy research](HORIZON_ACCURACY_RESEARCH.md).

Implemented D/E: validated metadata; supported angular/cylindrical/corrected
ordinary-photo conversion and leveling; retained original bytes/source points;
extra fitting references, explicit exclusions and multiple held-out checks.
F software validation and the immutable local candidate are recorded in RELEASES.md.
Remaining: owner physical acceptance and separately authorized publication.
Arbitrary lens/stitching correction, painted-record remapping and tilted partial
panoramas wider than 180° remain unsupported. Conservative narrow obstacle
sampling and skyline row handling are implemented locally; residual raster/sky-band
limits are documented in BUGS.md. The
[owner checklist](HORIZON_PANORAMA_ACCEPTANCE.md) covers real photos and physical
devices. These changes are local; publication remains separately authorized.

Owner-authorized P1/P2 of the white-paper follow-up
[geographic calibration and sky-mask plan](HORIZON_GEOGRAPHIC_CALIBRATION_PLAN.md)
are implemented locally, with integrated software gates pending. They add
versioned measurement/coverage evidence, physical heading/pitch/roll fitting,
known-geometry checking and a constrained rectilinear unknown-FOV option.
P3–P7 remain open: original-photo painting, multiband visibility, uncertainty,
camera-field/event planning and final integrated software/physical acceptance.
Actual software outcomes belong in RELEASES.md. Their numbering is separate
from earlier improvement 1–5 and simplification A–F; owner real-world acceptance
and publication remain separate.

## Post-release review remediation — local development

Master df76fc2 supplied review remediation phases 1–4: storage/TLS, immutable
publication/cache graphs, astronomy/site-time and Horizon fixes (27 findings).
The follow-up phases 5–7 now resolve REV-028–038: Catalog/context correctness,
weather validity/ownership and table keyboard/focus/help. These numbers refer to
the October 9 review, not the older design phases listed below.
REVIEW_REMAINING_IMPLEMENTATION_PLAN.md records the scope and sequence;
BUGS.md and RELEASES.md record resolutions and actual checks. These fixes are
local/unreleased. Phase 8 integrated external acceptance and release/publication
remain separate; the current public website is still v0.1.1.


## Implemented and published as v0.1.0

- Phases 1–3: bounded planning intervals, reliable Wikipedia photos/individual
  credits, truthful product/privacy copy, one independent 0.1.0 Changes entry,
  approved sparse Workbench public design. Legacy bundled object photos removed.
- Phase 4: persistent target selection, explicit inspector visibility, accessible
  common controls, keyboard/focus/dialog behavior, onboarding and responsive views.
- Open design: one page surface, transparent actions, underlined tabs and open
  planner sections. Advanced Catalog switches live with batched/cancellable
  visibility work and per-grid panorama fingerprints.
- Phase 5: optional provenance loads only on disclosure/export, with single-flight
  validation/retry and no empty export. Prepared gzip/token-aware cache policy and
  real local compression/cache simulation; comparable startup evidence recorded.
- Remaining fixes: encoding-safe browser diagnostics, explicit local import-burst
  capacity/health evidence, recursive dependency-before-HTML deployment, credential
  exclusion, metadata-only elevation wording and invariant acceptance.
- Phase 6 local preparation: integrated review, complete website candidate/manifest,
  release/pre-tag validation and explicit legacy cleanup/rollback steps.
- October 7 publication: clean commit/tag and GitHub release, authorized live
  deployment, 311-file rollback backup, complete byte verification, fresh/cached
  photos and credits, all six public layouts and explicit retired-file cleanup.
  Entry/version/manifest/tokened-asset cache policy is verified live.

Detailed implementation: docs/history/WEB_OPEN_DESIGN_IMPLEMENTATION_PLAN.md and
docs/history/WEB_REMAINING_WORK_PLAN.md. Final website review: docs/history/WEBSITE_FINAL_REVIEW.md.
Actual validation results, not promises, are recorded in RELEASES.md.

## Published follow-up — v0.1.1, October 8, 2026

The annotation improvements are committed, on GitHub and deployed: Open planner
on every public header, direct Site/Rig settings with brass hover/focus, explicit
Catalog type checkboxes and 50 rows, clearer visibility conditions, compact Sky
controls with smooth one-minute selection and twilight colors, simpler Tonight,
and readable Horizon rails/precise-edit help. Final validation: 295 Python passed
(one existing optional skip), 53/53 browser passed, full live hashes and browser
acceptance. All twelve remote core directories retained. RELEASES.md has the receipt.

## External/manual gates still open

1. A11Y-001: real screen-reader announcements and native browser zoom. Automated
   checks are not human acceptance; ACCESSIBILITY_ACCEPTANCE.md is the concrete
   procedure. Current automation cannot control/listen to Windows AT.
2. HOST-DELIVERY-001: enable full text/large-catalog compression through supported
   provider controls and verify live GET responses. Version/manifests compress;
   HTML/JS and large JSON did not. Publication/cache/smoke/cleanup gates are closed.
   HOSTING_CONFIGURATION.md records exact observed results and the host boundary.
3. BROWSER-LOCAL-001 monitoring: old refused local module requests are documented;
   a queue-capacity weakness was reproduced and mitigated, but the precise cause
   of the historical browser failures was not independently established. Future
   failures capture server liveness/backlog/request URLs without retries/skips.

## Product scope decisions

DEC-003 is resolved for the current product: elevation is recorded metadata, not
a visibility/horizon correction. Future model changes need deliberate new scope.
FUTURE_FEATURE_SCOPE.md defines proposed planet-first ephemerides, later selected
comets/asteroids, provider/accuracy/privacy requirements for seeing, and offline
reopening requirements. These proposals are not new shipped features or approved
provider integrations. Current weather/deep-sky/offline claims remain truthful.
Native Windows/catalog import/storage acceptance belongs in the sibling roadmap.
