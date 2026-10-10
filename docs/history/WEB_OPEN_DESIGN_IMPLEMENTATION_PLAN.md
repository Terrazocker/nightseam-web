# Open Workbench design and advanced Catalog responsiveness

> Historical plan/review, archived October 10, 2026. Dated instructions
> below describe an earlier implementation pass. Current authority:
> [roadmap](../../IMPLEMENTATION_PLAN.md),
> [review remediation](../../REVIEW_REMAINING_IMPLEMENTATION_PLAN.md),
> [validation receipts](../../RELEASES.md) and
> [release workflow](../../RELEASE_WORKFLOW.md).

Requested October 6, 2026. Work on the existing website branch; preserve earlier
uncommitted work. Read the independent catalog only as a visual reference. No
shared assets, imports, storage, versions or changes to that repository.

## 1. Reference and design decisions

- [x] Read website and catalog DESIGN.md and actual styles.
- [x] Compare catalog actions, tabs, metrics, map and inner session sections with
  all planner views. Desktop actions are transparent, tabs use an underline,
  metrics are open text and inner sections have fewer frames. Some desktop
  containers remain boxed; the requested website treatment extends the open
  language consistently rather than reproducing those boxes.
- [x] Identify the contradictory web/themes.css component overrides that fill
  tabs/actions and frame workspace sections. Public pages already use open
  editorial typography and should retain their approved composition.

## 2. Implement the visual treatment first

- [x] Replace contradictory theme component rules with one coherent treatment:
  common page surface, transparent workspace sections, spacing and quiet
  separators instead of card perimeters; no shadows or decorative effects.
- [x] Use transparent text/icon actions and brass underlined tabs. Keep readable
  input affordances, native controls, focus rings, selected states and labels.
- [x] Open Tonight ranking, Catalog filters/results, Sky map/time/inspector rail,
  and Horizon tools/profile/settings. Remove nested information-box backgrounds.
- [x] Keep actual Setup/Welcome dialogs and popovers opaque and bounded; keep
  docked/inline target inspectors complementary and visually part of the page.
- [x] Update design documentation and verify desktop/phone screenshots,
  keyboard/focus, chart bounds and container resizing before performance work.

## 3. Measure advanced Catalog after the visual changes

- [x] Measure real Advanced-mode activation, initial table render, visibility
  completion, filter changes and scrubbing, including a slower CPU profile.
  Distinguish synchronous blocking from deferred calculation and cached work.
- [x] Inspect the measured hot path: pool selection, filtering/sorting, row
  facts, full-pool warming and subscriptions. Record baseline and bottleneck.
- [x] Implement the smallest verified fix. Reuse shared core calculations;
  preserve one scoring loop, cache invalidation, selected-time truth, catalog
  counts, deterministic sorting and cancellation of superseded work. Do not
  duplicate astronomy or hide the delay with false completion indicators.
- [x] Add meaningful browser acceptance for the identified behavior and record
  before/after timings under the same conditions.

## 4. Final validation and handoff

- [x] Bump affected module/style tokens and all entry-point references, including
  public pages loading canonical theme roles. Align AGENTS and verified baseline.
- [x] Run focused checks while editing, then full pytest once at the end, full
  browser gate, JavaScript/core/catalog/cache guards and development release
  preflight. Inspect final captures for every planner view.
- [x] Record actual results in RELEASES.md, architecture in DEVELOPMENT.md,
  decisions in DECISIONS.md and any confirmed unresolved issue in BUGS.md.
- [x] Return the implementation and measured results. No staging, commit, tag or
  public deployment is part of this request.

## Completed results

One open planner surface across Tonight, Catalog, Sky View and Horizon, with
transparent actions, underlined tabs and bounded temporary windows. Populated
Horizon/Sky and phone/desktop screenshots inspected. Catalog advanced-mode
first table/full calculation at 4x CPU slowdown: 6.57s/14.31s before versus
0.25s/1.13s after. Mode changes retain date/search without reloading. Three
cached scrubs take 0.12s in focused acceptance without restarting warming.
Full pytest: 271 passed, 1 existing optional skip. Full browser gate: 48/48.
JS/core/catalog/cache guards and development release preflight pass.
See RELEASES.md for the actual receipt and DECISIONS.md for timing limits.
