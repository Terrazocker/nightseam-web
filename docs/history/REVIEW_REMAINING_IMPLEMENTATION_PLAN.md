# Remaining review implementation plan

Prepared October 10, 2026 against master df76fc2. The owner subsequently authorized
phases 5–7, now implemented locally. Release/deployment are separate actions.

## Scope and status

BUGS.md records 38 original findings. At planning time review phases 1–4 had
resolved 27 locally; phases 5–7 now resolve the remaining eleven: ten P2
functional/accessibility defects and one P3 help defect. These phase numbers
continue that remediation series, not the older
website design roadmap. The latest fixes are not yet published; production
remains v0.1.1. RELEASES.md records upstream and local validation outcomes.

The detailed ignored logs/review reports referenced by BUGS.md are absent from
this checkout. Before changing each behavior, recreate its failing regression
from the current code and the recorded finding. Do not claim those old probes
were rerun. BUGS.md is the finding register; this file is the execution order.

## Phase 5 — Catalog, active context, and visibility correctness (first)

Status: implemented locally; validation recorded in RELEASES.md.

Resolve REV-028, REV-029, REV-030, REV-031 and REV-034.

1. Reproduce the minimum-altitude scheduling failure, including an Advanced
   Catalog batch already in progress. Invalidate stale visibility work before
   scheduling its replacement; prevent obsolete jobs from publishing results
   or clearing the replacement job's busy state.
2. After a successfully persisted active-site edit, refresh the displayed plan
   and all consumers of its coordinates, timezone and horizon. Preserve the
   selected target and existing site-time rules. Failed saves retain the
   committed context and editable form, following the phase 1 storage contract.
3. Invalidate cached search text when custom-target searchable fields change.
   Cover renames and changed designations without requiring a reload. Keep
   canonical catalog records and safe custom IDs separate.
4. Implement the maximum-altitude sort explicitly using the existing shared
   planning result. Include this sort in owned cache warming and rerender after
   completion so it cannot sort on unavailable statistics. Define deterministic
   ties and missing-value order; verify
   ascending and descending results. Do not introduce a second astronomy model.
5. Correct the altitude chart's state classification: an unobstructed target
   below the minimum altitude must show below minimum, not horizon blocked.
   Retain actual horizon/ceiling blocking, below-horizon classification and
   matching non-color descriptions.

Exit criteria: focused regressions fail on the current defects and pass after
fixes; a browser pass covers rapid altitude edits, active-site edits, custom
renames, both sort directions and chart state boundaries. Results, inspector
and top-bar context agree, and cancelled batches leave no stale busy state.

Why first: these defects can display the wrong plan or wrong conditions during
ordinary use. Fixing context invalidation also establishes the behavior the
weather ownership checks need in phase 6.

## Phase 6 — Weather data validity and request ownership

Status: implemented locally; validation recorded in RELEASES.md.

Resolve REV-032 and REV-033.

1. Normalize missing/null weather readings as unavailable. Preserve genuine
   numeric zero values and their units; never turn absent data into clear sky,
   calm wind, zero precipitation or an unsupported quality rating.
2. Define and document how partial observations affect the existing rating.
   If required inputs are missing, show unavailable/insufficient data rather
   than a confident score; optional missing fields must remain visibly unknown.
3. Bind each request to an immutable site/coordinate key and request generation.
   Include the resolved timezone. Invalidate ownership on every site-context
   change, including when only the first request is loading and auto-load is off.
   Reject obsolete success and error responses after site selection or edits.
   Cancel obsolete requests where supported, while retaining ownership checks.
4. Ensure loading, retry and displayed forecast provenance belong to the active
   request/site. Preserve on-demand loading and existing privacy behavior.

Exit criteria: deterministic mocked browser checks cover full/partial/empty
responses, valid zeros, A-to-B site changes with responses arriving in reverse
order, obsolete failures, partial air-quality failure and retry. No provider network access is needed to
prove these cases.

## Phase 7 — Table semantics, keyboard controls, and accurate help

Status: implemented locally; validation recorded in RELEASES.md.

Resolve REV-035, REV-036, REV-037 and REV-038.

1. Keep native table, row and cell semantics in Catalog and Tonight. Provide a
   real named target-opening control inside a cell, preserving selection and
   convenient pointer activation without assigning button roles to table rows.
2. Retain logical keyboard focus when Catalog filters update. Restore by stable
   control identity where rerendering is unavoidable; preserve typing/caret
   behavior and avoid moving focus to unrelated controls.
3. Provide keyboard-equivalent type sorting and reverse-order controls. Expose
   the active column/direction with appropriate accessible state and keep the
   open Workbench design. Reuse phase 5's tested sort behavior.
4. Remove the obsolete claim that switching Advanced mode reloads the app.
   Explain the actual live switch and larger catalog computation briefly.

Exit criteria: browser tests verify native table structure, named controls,
keyboard target opening, sorting in both directions and focus after each
affected filter change. Check desktop/phone layout and reduced motion. Automated
results do not close A11Y-001 human screen-reader/native-zoom acceptance.

## Phase 8 — Integrated acceptance, documentation, and release readiness

Status: automated regressions, layout review and documentation completed alongside
phases 5–7. Human/provider acceptance and release/publication remain pending.

1. Review all four planner views and six public pages, with particular attention
   to interactions between site edits, weather requests, filter work and target
   selection. Include fresh/return visits, persistence failures and service
   failures. Preserve the existing reference anchors and frozen fixtures.
2. During phases 5–7 run focused tests and maintain changed asset cache tokens.
   At completion run the full Python suite once, full browser gate, JavaScript,
   recursive token/core/catalog checks and development release gate. Treat
   browser launch failures as infrastructure failures, never skips.
3. Update BUGS.md with resolved IDs and any confirmed remaining failures;
   DEVELOPMENT.md/DECISIONS.md with changed contracts; RELEASES.md with actual
   validation. Correct stale current-status wording in the older roadmap and
   historical phase summary without erasing dated evidence. Curate changelog.
4. Perform A11Y-001 human acceptance using ACCESSIBILITY_ACCEPTANCE.md, or retain
   its explicit pending status. This requires human AT/native zoom observation.
5. Address HOST-DELIVERY-001 through supported Plesk/nginx settings or provider
   support, then measure actual live GET compression for HTML/JS/large JSON.
   This external task can proceed alongside code work; FTPS cannot configure it.
6. Continue BROWSER-LOCAL-001 monitoring. Capture a recurrence before attributing
   a root cause; do not turn it into an unproven product fix.
7. Prepare a fresh verified immutable publication candidate containing the
   latest changes. A release/tag/GitHub publication or public deployment follows
   separate owner instructions. Use the new publish workflow, retain old asset
   graphs for open clients, and never reuse an old local publication candidate.

Exit criteria: all eleven code findings have recorded regressions and validation;
external/manual gates are either evidenced complete or explicitly pending; the
candidate is reviewable and its version truthfully reflects Git state.

## Outside this defect-fix scope

Planet/comet/asteroid ephemerides, seeing and offline reopening remain proposals
in FUTURE_FEATURE_SCOPE.md. They need separate product scope and are not part of
these phases. Desktop catalog work remains in its independent repository.
