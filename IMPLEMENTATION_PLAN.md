# NightSeam implementation plan

Status: implementation pass completed in the working tree, based on the
2026-09-20 review. Phases 0-6, 8, and 9 are implemented; the Phase-10
accessibility foundation, focus restoration, and cross-shell browser matrix
are implemented and validated, with a manual screen-reader audit still open.
Phases 7 and the elevation contract remain decision-gated. No tag or
deployment was made.

On 2026-09-27, the packaged local executable was separated into an Image
Catalog-only launch shell; the source-run desktop and web planner remain
available. Current implementation details and validation belong to the dated
working-tree entry in `RELEASES.md` and the scope note in `BUGS.md`.

Workspace reviewed: `<workspace>\Nightseam-programm`.

This plan is deliberately limited to the NightSeam planner, catalog, editor,
weather, packaging, accessibility, and astronomy roadmap. The separate
environmental/ranking tool is not part of this plan.

## Historical baseline — 2026-09-20

The source was internally healthy enough to iterate, and the implementation
pass has since added the shared invalidation, restore, editor, weather, and
target-explainability changes described below:

- Initial baseline: `python -m pytest tests/ -q --tb=no`: 629 passed, 1 warning;
  `check_core.py`, `check_js.py`, focused regressions, and the web browser gate
  passed before this pass.
- Final evidence for that 2026-09-20 pass: the planner-state,
  visibility-explainability, web
  backup, horizon metadata, JS behavior, UI invariant, core, catalog
  provenance, and JS checks pass; the full suite is 641 passed with one warning,
  the browser matrix is 32/32, and the dirty package/release gate is clean
  apart from its expected dirty/off-tag warning.

These counts are a dated checkpoint, not the current verification record.
See `RELEASES.md` for the latest working-tree validation.

The immediate blockers and confirmed defects are documented in `BUGS.md`. This
file defines the implementation order, dependencies, exit criteria, and longer
term product work. It deliberately excludes the separate environmental/ranking
tool.

## Decision gates

The following choices materially change the astronomy contract, so they are
not silently selected by the implementation pass:

1. **Elevation.** Recommended: metadata-only for now, with no calculation or
   ranking effect. Alternative: define a full observer model including horizon
   dip, atmospheric/refraction assumptions, valid ranges, and reference
   fixtures before implementing it in `core/` for both shells.
2. **Solar-system ephemerides.** Recommended default for a local planner:
   choose a bounded, versioned, offline-capable ephemeris with explicit date
   coverage and provenance. Alternatives are a higher-accuracy bundled model
   with a larger artifact, or an optional external provider with cache/offline
   behavior. The source, accuracy target, supported date range, and failure
   behavior must be chosen before adding planets/comets/asteroids.

The current pass stops before either decision-dependent implementation.

## Order of work

The recommended order is intentionally different from a simple list of
features: the shared invalidation contract must come before features that add
more derived data, and release packaging must happen only after the correctness
fixes are verified.

| Phase | Work | Depends on |
|---|---|---|
| 0 | Repository and release preflight | None |
| 1 | Shared planner-state invalidation | Phase 0 |
| 2 | Atomic web backup restore | Phase 0 |
| 3 | Panorama persistence and editor controls | Phase 1 |
| 4 | Weather retry and site/elevation contract | Phase 0 |
| 5 | Target explainability and transit data | Phases 1, 4 |
| 6 | Fresh package and complete release validation | Phases 0-5 |
| 7 | Solar-system target support | Phase 5 |
| 8 | Horizon-editor expansion | Phases 1, 3 |
| 9 | Catalog provenance and reproducible exports | Phase 0 |
| 10 | Accessibility and cross-shell browser coverage | Phases 3, 5, 8 |

## Phase 0 - repository and release preflight

### 0.1 Track required runtime modules

Add the currently untracked implementation files before any release branch or
artifact is produced:

- `app/theme.py`
- `static/js/viztheme.js`
- `web/viztheme.js`

Confirm that all imports resolve from a clean checkout, not only from the dirty
working directory. Add a small release check that detects imported files that
are absent from Git or absent from the source package.

**Progress:** complete for this working tree. The files are staged, import
checks pass, and the release guard verifies that they are tracked before
packaging.

### 0.2 Separate review work from unrelated working-tree changes

Inventory the current dirty tree before implementation. Keep unrelated user
changes intact, but make each implementation commit narrow enough that a
reviewer can identify the runtime change, its tests, and its documentation.

### 0.3 Correct operational documentation

Update current workspace, deployment, and mirror references in the operational
documents. Preserve deliberately historical archive paths, but label them as
historical. Add documentation checks to the release checklist so moved roots do
not silently return.

### 0.4 Establish a clean release baseline

Before packaging, rebuild the baked version and generated core trees from the
intended commit. Do not hand-edit baked version files. Keep the release tree
clean and ensure the staged artifact, version manifest, and executable are
generated from the same source revision.

**Exit criteria:** required modules are tracked, documentation points at the
canonical workspace, and a clean checkout passes import/module discovery.

## Phase 1 - shared planner-state invalidation

This is the foundation for the rest of the planner work.

### 1.1 Define the event contract

Create one conceptual contract for changes that can invalidate derived planner
state:

```text
planner:changed {
  kind: "panorama" | "site" | "rig" | "date" | "selection" | "preferences",
  revision: string,
  causes: string[],
  siteId?: string,
  panoId?: string,
  dateKey?: string
}
```

The exact transport can remain shell-local, but the payload and invalidation
semantics must match. A gesture emits once when committed, not once per pointer
sample.

### 1.2 Make revisions explicit

Use a monotonic revision or deterministic content hash for panorama/profile
content. Include it in desktop derived-state keys and web observation-cache
keys. Site, rig, date, and preference revisions should be similarly explicit
where they affect a calculation.

### 1.3 Wire both shells

Desktop:

- Recompute night-derived arrays after a completed panorama gesture.
- Refresh the active target list, Tonight view, Sky View, and detail chart.
- Avoid starting duplicate worker builds for pointer samples.
- Keep generation checks so an old worker cannot paint after a newer event.

Web:

- Replace the empty Horizon change callback with real invalidation.
- Drop or version cached observation results when the profile changes.
- Re-render Catalog, Tonight, and detail views that depend on the profile.
- Ensure backup restore increments the same panorama revision.

### 1.4 Tests

Add unit and browser coverage for:

- painting an obstruction changes a dependent target result;
- clearing it restores the previous result;
- undo/redo changes the revision and dependent results;
- restoring a panorama with the same id does not reuse old cache entries;
- a superseded worker result remains silent.

**Exit criteria:** no user-visible derived result can be read from an older
panorama/profile revision in either shell.

## Phase 2 - atomic web backup restore

### 2.1 Validate before writing

Move all required-shape, type, identifier, theme, and panorama normalization
ahead of `writeStaged`. The validation result should be a complete staged model,
not a partially validated object with optional sections that the UI checks later.

### 2.2 Make safety-copy failure fatal

Write the safety snapshot first and verify its result. If storage refuses the
safety snapshot, stop before replacing any user data.

### 2.3 Preserve rollback guarantees

Keep the existing rollback path for failures during the actual write, but test
the stronger invariant: a refused bundle leaves every affected store unchanged.
Include missing sections, invalid records, duplicate ids, invalid image payloads,
quota errors, and an interrupted multi-section write.

### 2.4 Keep UI and lower-level APIs aligned

The UI should not have to discover a malformed backup after calling the storage
layer. Update lower-level tests so the accepted schema is intentional and the
UI path tests the same contract.

**Exit criteria:** every invalid backup fails before the first destructive write,
and storage remains unchanged when validation or safety-copy creation fails.

## Phase 3 - panorama persistence and editor controls

### 3.1 Resolve Save semantics

Implement the explicit-save decision from `DECISIONS.md`:

- edits update the active in-memory panorama immediately;
- Save persists explicitly;
- leaving the editor flushes pending edits;
- page-exit persistence is best effort only;
- dirty state is cleared only after a successful persistence boundary.

If product testing instead selects autosave, stop and update `DESIGN.md`,
button labels, dirty-state rules, backup expectations, and tests before changing
the implementation.

### 3.2 Make Clear and Undo one coherent contract

- Use the in-page confirmation dialog for Clear.
- Record one history entry per clear gesture.
- Synchronize Undo/Redo after clear, mode changes, undo, redo, revert, and
  calibration actions.
- Preserve deep-copy history and the existing redo truncation rules.
- Verify that a stroke-less authoritative profile is not accidentally blanked.

### 3.3 Connect persistence to invalidation

The editor should emit the Phase 1 event at the gesture boundary, independent
of whether storage persistence is still pending. Planning must reflect the
active in-memory edit immediately; storage must reflect it at Save/leave.

**Exit criteria:** Save has a clear meaning, Clear is safe and undoable, and
editor state, planner state, cache state, and storage state have explicit
boundaries.

## Phase 4 - weather retry and site/elevation contract

### 4.1 Fix retry behavior

After a failed request, clicking the retry affordance must clear the old error
and start a new generation-guarded request. Add tests for repeated failures,
success after failure, site changes during retry, and duplicate clicks while a
request is loading.

### 4.2 Resolve elevation honestly

The immediate safe choice is to keep elevation as site metadata and remove any
claim that it affects calculations. If the product needs elevation-aware
astronomy, define the observer model first:

- whether horizon dip is included;
- whether atmospheric parameters depend on elevation;
- which coordinate frames and refraction assumptions apply;
- valid ranges and fallback behavior;
- reference values and parity expectations.

Then implement it once in `core/`, propagate it through both shells, and add
fixtures. Never add an elevation correction in only one shell.

**Exit criteria:** documentation, payloads, and calculations agree about what
the elevation field means.

## Phase 5 - target explainability and transit data

### 5.1 Return structured visibility reasons

Extend the shared planning result from a final visible/hidden value to a reason
model, for example:

- `below_horizon`
- `below_min_altitude`
- `blocked_by_horizon`
- `outside_selected_window`
- `never_rises`
- `visible_interval_too_short`
- `visible`

The core should return reason codes and supporting values. Each shell can format
the prose, but neither shell should reconstruct the astronomy independently.

### 5.2 Add target timing facts

For every target and selected night, expose:

- rise and set crossings where they exist;
- first and last usable instants;
- maximum altitude and its time;
- duration above the configured minimum altitude;
- duration unobstructed by the panorama;
- the selected-time altitude/azimuth;
- the obstruction segment or horizon reason when blocked.

Use half-open interval conventions consistently and preserve site-local display
formatting at the shell boundary.

### 5.3 Explain the UI

Add compact reason text to target rows and a more detailed explanation in the
target inspector. The explanation should answer “why is this target here or not
here?” without requiring the user to interpret a chart first.

### 5.4 Test edge cases

Cover polar day/night, targets that barely cross the threshold, obstruction
crossings, timezone changes, daylight selection, and targets with no valid
interval. Add browser assertions for both shells.

**Exit criteria:** every target decision is explainable from shared structured
data, and the displayed times agree with the chart and scrubber.

## Phase 6 - fresh package and release validation

Do this only after Phases 0-5 are complete.

1. Run the core builder and verify the generated hash trees and explicit stubs.
2. Run `python scripts/check_core.py`.
3. Run `python scripts/check_js.py`.
4. Run `python -m pytest tests/ -q --tb=no`.
5. Rebuild the desktop executable from the intended clean commit.
6. Run browser checks against the current desktop artifact and current web tree.
7. Exercise both Workbench and Glass presentations.
8. Run `python scripts/check_release.py`.
9. Confirm the version manifest, baked version, staged artifact, and executable
   hash all refer to the same commit.
10. Only then create a tag or deploy.

**Initial validation record (2026-09-20, dirty working-tree snapshot before
the accessibility follow-up):**

- `python scripts/build_core.py` produced core hash
  `1446159368d049ab` with stub token `39`.
- `python scripts/check_core.py` and `python scripts/check_js.py` pass.
- `python -m pytest tests/ -q --tb=no` -> `636 passed` (one warning).
- Browser gate -> `30/30 passed`, including both shells and Workbench/Glass
  theme checks, using a freshly rebuilt desktop executable.
- `build.ps1 -AllowDirty` produced the current dirty version
  `0.6.34-5-gd6e115c-dirty`.
- `python scripts/make_release.py --allow-dirty` produced a dirty snapshot;
  `python scripts/check_release.py --allow-dirty` reports zero errors and one
  expected dirty/off-tag warning.
- No tag or deployment was performed. The clean-tag release sequence remains
  a maintainer action for an actual release.

**Final validation (2026-09-20, after accessibility, horizon, and catalog-provenance work):**

- Added semantic tab state and text alternatives for desktop/web charts,
  visible focus styling, high-contrast and reduced-motion rules, and Escape
  dismissal for the web detail/setup dialog.
- Added shared horizon metadata (landmarks, calibration provenance, numeric
  profile editing, confidence, and comparison overlay) plus deterministic
  catalog provenance sidecars and reproducible exports.
- `python -m pytest tests/ -q --tb=no` -> `641 passed` (one warning).
- `python scripts/check_core.py` and `python scripts/check_js.py` -> OK;
  the JS guard reports 13 heuristic candidates, all non-failing warnings.
- Browser gate -> `32/32 passed`, including Workbench/Glass, horizon metadata,
  catalog provenance, and accessibility checks in both shells.
- `build.ps1 -AllowDirty` rebuilt `0.6.34-5-gd6e115c-dirty`.
- `python scripts/make_release.py --allow-dirty` produced the final dirty
  snapshot ZIP with SHA-256
  `a80fb785c1c0d491f1cdd9f3f64c45bcac8faf6d1f5636c361a77852db0dda47`;
  `python scripts/check_release.py --allow-dirty` reports zero errors and one
  expected dirty/off-tag warning.

**Exit criteria:** met for a local dirty snapshot. A clean tagged release is
deliberately not claimed here.

## Phase 7 - solar-system targets

Add planets, comets, and asteroids only after the shared target-result model can
represent non-catalog objects.

### Design requirements

- Choose and document an ephemeris source and accuracy target.
- Define supported date ranges and behavior outside them.
- Keep calculations local and reproducible for the same input data.
- Store source/version metadata with generated results where appropriate.
- Distinguish fixed catalog coordinates from time-varying bodies in the data
  model and UI.
- Add fixtures for representative dates and parity tests in both shells.
- Expose rise/set, culmination, altitude, azimuth, and visibility reasons using
  the same result contract as deep-sky targets.

Do not mix a network fetch into the planning loop without an explicit cache,
offline fallback, provenance display, and failure behavior.

## Phase 8 - richer horizon editing

Build this on the existing world-azimuth/profile and history contracts.

### Features

- Named obstruction landmarks such as trees, roofs, towers, and cables.
- Numeric profile editing for precise azimuth/altitude corrections.
- Calibration provenance: source image, orientation, date, and operator notes.
- Per-segment confidence or measurement quality.
- Side-by-side comparison of two horizon profiles.
- Import/export of a portable horizon profile independent of the panorama image.
- Clear indication of assumed/open regions versus measured regions.

### Data rules

Keep the current world-bin representation authoritative. Store provenance and
confidence as additive fields, preserve old records, and make every new edit
undoable. Any profile transformation must have a core-level fixture and parity
coverage.

**Progress:** implemented in the current working tree. Both shells now support
named obstruction landmarks, calibration provenance, per-bin confidence and
numeric profile edits. The shared core normalizes metadata and compares
profiles; metadata participates in the shared undo/redo snapshots, desktop
SQLite rows and web backup records. The current comparison UI reports a
deterministic difference summary and a dashed comparison overlay in both
shells. Legacy rows receive safe empty/default metadata without changing their
world-bin profile.

## Phase 9 - catalog provenance and reproducible exports

Add provenance without weakening the current catalog identity rules:

- source name and source version/date;
- designation aliases and common-name history;
- mapping notes for supplement rows;
- build manifest tying database rows to source files and scripts;
- reproducible catalog export containing schema/version metadata;
- a UI view showing why an object is present and how it was classified.

The catalog builder should fail when provenance is incomplete for a generated
row, just as it already fails for unsafe or ambiguous identity data.

**Progress:** implemented in the current working tree. A deterministic
`catalog_provenance.json` sidecar covers all 12,176 catalog ids, records exact
source-file hashes, aliases, designation history and supplement mapping notes,
and is byte-identical in desktop/web copies. Both shells show the data in the
object detail view and offer a complete JSON download; the desktop exposes the
same sidecar through `/api/catalog/provenance`. A manifest, token guard and
release-gate integration prevent stale or partial provenance exports.

## Phase 10 - accessibility and cross-shell browser coverage

### Accessibility work

- Make all primary actions keyboard reachable and visibly focused.
- Provide screen-reader labels and text summaries for charts and target states.
- Ensure dialogs, menus, tabs, sliders, and editor controls expose correct roles
  and state.
- Add high-contrast review for both themes.
- Respect reduced-motion preferences for transitions and deferred view changes.
- Verify focus restoration after dialogs, tab switches, menu dismissal, and
  inspector navigation.

### Browser matrix

Extend the browser gate to cover:

- desktop source/runtime and web runtime;
- Workbench and Glass;
- initial load, site/date changes, panorama editing, backup restore, weather
  retry, target explanation, and accessibility smoke checks;
- both normal and degraded/offline network conditions where applicable.

Keep source-level tests for pure contracts, but use browser checks for the
cross-module behavior that can fail while every individual module still passes.

**Exit criteria:** both shells behave consistently across themes and the most
important state transitions are verified through the actual UI.

## Final implementation checklist

- [x] Track the required theme modules and pass the release tracking guard.
- [x] Add the planner-state invalidation/revision contract.
- [x] Recompute and invalidate after panorama edits.
- [x] Make web backup validation and safety-copy handling fail closed.
- [x] Resolve explicit-save versus autosave and update the contract.
- [x] Fix Clear, Undo, Redo, and confirmation behavior.
- [x] Fix weather retry and test generation races.
- [ ] Decide and document the elevation contract.
- [x] Add target reason codes and explainability.
- [x] Add transit, culmination, and usable-interval data.
- [ ] Define and implement the solar-system ephemeris policy.
- [x] Expand horizon editing with provenance, numeric editing and comparison.
- [x] Add catalog provenance and reproducible exports.
- [x] Add the accessibility foundation and both-shell/theme browser coverage
  for current planner flows.
- [ ] Complete manual screen-reader, focus-restoration, and dynamic-announcement
  QA across dialogs, menus, inspectors, and editor gestures.
- [x] Rebuild the desktop artifact and pass dirty-snapshot release validation.
