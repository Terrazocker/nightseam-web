# Planner annotation changes — October 7, 2026

> Historical plan/review, archived October 10, 2026. Dated instructions
> below describe an earlier implementation pass. Current authority:
> [roadmap](../../IMPLEMENTATION_PLAN.md),
> [review remediation](../../REVIEW_REMAINING_IMPLEMENTATION_PLAN.md),
> [validation receipts](../../RELEASES.md) and
> [release workflow](../../RELEASE_WORKFLOW.md).

Scope: implement the owner's four local-preview annotations. Preserve the existing
uncommitted public header change. No release, commit or deployment is requested.

1. Replace the native object-type multiple-select with an open checkbox list.
   Explain that checked types are combined, and no checks means all types. Keep
   every type visible, support normal clicking/Space, and retain focus on rerender.
   Remove duplicate galaxy/nebula/cluster shortcut categories; retain catalog
   shortcuts for All, Messier, bright objects and custom objects.
2. Put Sky View time controls before the chart. Match the common top-bar date and
   range styling. Add a semantic twilight gradient to both time sliders, using
   the shared core Sun altitude at the actual site and time. Preserve site-zone,
   full-day, polar fallback and selected-time synchronization. Provide phase text
   and a quiet legend so colors are not the only explanation.
3. Show 50 catalog objects per page. Keep the table keyboard-scrollable and make
   its height use available space without a fixed 600px minimum on phones.
   Replace ambiguous Rises later with the actual condition at the selected time;
   use All / Usable / Not usable filters. Best-window facts must use the current
   observation cache keyed by site, date, minimum altitude and panorama revision,
   rather than a possibly stale Tonight result. Update visible window cells when
   the existing shared-core page computation completes.
4. Remove Tonight's extra local slider and its obsolete event handler/CSS.
   Preserve the common top-bar time control and its effect on selected-time facts
   and target details. Night ranking remains a whole-night calculation.
5. Update affected browser checks and add coverage for checkbox combinations,
   keyboard focus, pagination, immediate visibility explanations, current-window
   refresh and twilight synchronization. Run relevant browser checks during work,
   all browser checks and the full Python suite once at the end, plus JS/token
   guards. Inspect desktop/phone screenshots. Record outcomes in RELEASES.md and
   the final report; update design/architecture decisions where behavior changed.

Status: completed locally. Final validation: 295 Python tests passed / 1 existing
skip; all 51 browser checks passed; JavaScript/core/catalog/cache guards and the
development release check passed. Desktop and 640/360px Sky screenshots inspected
in logs/browser/artifacts/annotations-*.png. No commit, tag or deployment made.

## Follow-up annotations — smooth time and readable Horizon tools

1. Replace both 15-minute range steps with one-minute steps, including the
   selected-time render marker. Keep the shared UTC/site-zone range policy.
   Synchronize controls immediately; coalesce Sky and inspector canvas redraws
   to the latest selected time once per animation frame. Cancel obsolete frames.
2. Make the whole desktop Horizon tools rail sticky and scrollable within the
   viewport, rather than sticking its first section over the following controls.
   Keep the existing open surface and normal stacked flow at narrower widths.
3. Explain the optional numeric editor in plain language: direction, obstruction
   height or visible sky band, confidence metadata, read-only comparison, and
   how applying values preserves the profile but replaces editable paint strokes.
   Retain Undo, Save and all existing data semantics.
4. Verify fine keyboard increments, bursts of input with an open inspector,
   view changes, and a tall Horizon photo at desktop/phone widths. Inspect
   screenshots, update affected cache tokens and documentation, and run the
   final Python, browser and source guards. Do not commit or deploy.

Follow-up status: completed locally. Full pytest: 295 passed / 1 existing optional
skip. Full browser gate: 52/52 passed. JS/cache/core/catalog and development
release checks passed. Inspected followup-*.png desktop/phone screenshots. Local
preview is serving app 162 / horizon 75 / style 53; no commit or deployment.

## Follow-up — simpler overviews and direct settings

1. Remove Tonight's Visibility reason and Rises later display columns; retain
   shared planning facts and full inspector explanations. Rebalance five columns.
2. Make Site/Rig words open buttons beside independently labeled selectors.
   Open the active record's editor in the corresponding Setup tab; when no rig
   is active, open Rigs setup. Preserve keyboard entry and return focus.
3. Remove Sky's visible-now list and its render/style code. Retain map picking,
   selected-target reopen/unplotted notices, full details and chart controls.
   Replace list-based browser tests with map selection and plotted-state checks.
4. Keep filter controls because Hα/OIII affect Moon-aware ranking; clarify the
   conditional scoring effect and priority in menu help. Correct misleading NB
   wording for broadband-only warnings. Report the current behavior accurately.
5. Verify direct settings, simplified views and retained selection/keyboard
   behavior; inspect desktop/phone screenshots; update tokens/docs and run final
   gates. No commit or deployment.

Status: completed locally, including the additional Site/Rig brass hover and
keyboard-focus request. Final pytest 295 passed / 1 existing optional skip; full
browser gate 53/53 passed after updating the remaining removed-list interval
selector. JS/cache/core/catalog and development release guards passed. Desktop
and phone simplified-*.png screenshots inspected. App 163 / style 54 / themes 20
and public references/register align. No commit or deployment.


## Follow-up — compact Sky time rail

1. Remove the duplicated site datetime field and visible range-help note; keep
   date editing in the common top bar and the range explanation accessible.
2. Stack the four twilight legend labels in the former clock area, widen the
   slider, and reduce rail spacing. On phones give the slider a full-width row.
3. Migrate time-pinning browser checks to the actual slider, using shared
   site-zone conversion. Verify compact geometry, synchronization, polar labels
   and responsive fit; inspect screenshots, bump tokens and run final gates.

Status: completed locally. Full Python suite 295 passed / 1 existing optional
skip; full Chrome browser gate 53/53 passed; JS/cache/core/catalog and development
release guards passed. Inspected desktop/640/360px Sky screenshots. App 164 /
style 55 / themes 21 and public references align. No commit or deployment.


## Publication follow-up — October 8, 2026

All completed annotation sections above are now committed and published on GitHub
and deployed as v0.1.1, with verified rollback backup, all file hashes and live
browser acceptance. The earlier "no deployment" statements describe their dated
local completion receipts. Current release authority is RELEASES.md. Manual AT/
native zoom and provider compression remain open; no catalog work was included.
