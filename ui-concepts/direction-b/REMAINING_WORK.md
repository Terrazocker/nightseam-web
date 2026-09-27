# Direction B UI: review and remaining work

> **Superseded historical tracker.** Use
> [REFERENCE_FIDELITY_CODER_PROMPT.md](REFERENCE_FIDELITY_CODER_PROMPT.md) and the
> current results in `implementation/screenshots/README.md` for this pass. The
> Glass/brightness scope, two-theme matrix, and browser/test counts below are
> historical evidence and are not the current completion criteria.

**Review date:** 2026-09-27
**Status:** UIB-014 through UIB-021 are implemented and verified in the working tree; no release is authorized. The JavaScript guard passes and the final browser matrix passes 41/41. The single full pytest run reported 644 passed and 5 failed; a focused rerun covering those findings passed 20/20. The release guard reports that `dist/release` is stale against the current executable.
**Baseline specification:** [CODER_HANDOFF_PLAN.md](CODER_HANDOFF_PLAN.md) and the five PNGs in this directory.

## Initial review baseline (before the implementation pass)

- Desktop has the intended five primary tab entries and three nested Image Catalog tab entries. Workbench tokens and the fresh-profile edge-space value were changed. A Tonight chart renderer was started.
- The Direction B layouts are not complete. New desktop Tonight/Catalog markup has no corresponding grid/rail styling; desktop Sky View, Horizon, and Image Catalog largely retain their old layouts. The desktop detail view remains an overlay instead of a docked right inspector.
- The web planner received palette/gutter changes but still has old tab labels and mostly old layouts. It has no Tonight multi-target chart or docked inspector.
- The Coder chat recorded no final browser screenshots, test run, or completion summary. Its last message was a wait instruction. The working tree is on `master` with uncommitted UI changes mixed with separate sky-brightness/core/data changes. Coder's recorded file-change events do not account for that entire second cluster.
- Our focused `python -m pytest tests/test_ui_invariants.py -q --tb=no` run: **46 passed, 1 pytest-cache warning**. Our `python scripts/check_js.py` run: **failed** after detecting a desktop reference to missing `#tonightOverview`; its token self-test also encountered WinError 5 in temporary/fallback directories. No full suite or browser result can be inferred from these checks.

## Work order

### Phase 0 — protect the current state and stay within UI scope

1. Record `git status` and current HEAD before further UI edits. Keep the `ui-concepts/` references and plan. Do not reset, clean, overwrite, or move the unrelated sky-brightness/core/data changes.
2. Work only on the Direction B UI files: `static/index.html`, the relevant desktop UI modules/styles, `web/index.html`, `web/app.js`, `web/horizon.js`, the two theme files, `DESIGN.md`, UI tests, and the edge-space default in `app/server.py`. Leave `core/skybrightness.js`, provider packs, baked core hash trees, and their tests/scripts alone. The user explicitly deferred that work; do not investigate or isolate it during this UI pass.
3. Remain in the current shared checkout. Do not attempt another branch switch, stage, commit, or release while the worktree contains both change sets.

**Exit:** the current state is recorded and no unrelated file is modified by this UI pass.

### Phase 1 — make the partial desktop navigation and chart safe

1. Fix the missing DOM reference in `static/js/tonight.js`: observe the actual Tonight chart container in `static/index.html`, not nonexistent `#tonightOverview`. Keep the chart canvas DPR-aware. `check_dom_ids.py` must report no missing desktop IDs.
2. In the Tonight obstruction renderer, stroke each contiguous blocked run when it ends and stroke any final open run at loop end. A blocked interval followed by a clear sample must still appear on the graph. Add a focused JS behavior test with at least two separated blocked runs.
3. Give `#catalogTabs` its own in-flow secondary-tab styling in **both** Workbench and Glass. Remove the Glass selector that positions it at the same fixed dock coordinates as primary `#tabs`. Check all three child panels with keyboard and pointer.
4. Make the top-bar Import FITS action select the Import Exposures child tab before opening the file picker. Import progress, errors, and recent batches must be visible after that action.
5. Set the Image Catalog initial-library-loaded flag only after a successful load. After an error, re-entering Library must retry. Preserve the selected child tab on later entries.
6. Smoke-test five desktop primary tabs and three child tabs with both themes. Verify `Pano.onHide/onShow`, Sky Map redraw after visibility, `N` cycling, ARIA selected state, and planner-control hiding in Image Catalog.

**Exit:** navigation has no overlap or hidden workflow, the Tonight graph represents all blocked intervals, and the desktop DOM/JS guard passes its ID check.

### Phase 2 — finish the shared visual foundation

1. Implement layout rules for the new desktop classes/regions in `static/style.css` and `static/themes.css`: `.tonight-layout`, `.tonight-overview`, `.catalog-layout`, `.catalog-filter-rail`, `.panel-edge`, `.series-key`, and the actual Tonight chart canvas. Match the 1672 × 941 proportions in the original handoff while allowing compact reflow.
2. Complete Workbench color application in both shells. The token definitions should use the exact approved palette from `CODER_HANDOFF_PLAN.md`; replace remaining old literal Workbench component colors with semantic tokens. Keep Glass's own colors and one DOM per shell. Update `DESIGN.md` and token tests to match the implemented palette.
3. Keep the new 16 px edge-space value as the fresh-profile default while honoring stored values. Verify the setting updates live and does not prevent a full-width B layout at the reference viewport.
4. Create the real wide-screen target inspector as a docked panel within the grid. Remove the full-screen backdrop from its wide presentation; preserve the existing modal/sheet behavior at compact widths. Use the existing target-detail data and one selection/time state. Opening, switching, and closing detail must keep keyboard focus predictable.

**Exit:** Tonight and Catalog have real three-region layouts, a docked inspector does not block the working view, and the two themes remain readable.

### Phase 3 — complete every desktop view

| View | Required completion |
|---|---|
| Tonight | Session brief, dark-window scrub, multi-target altitude graph, ranked rows and right inspector fit the B composition. Curves use existing tracks; marker follows `S.tIdx`; chart, rows, and inspector update together on site/date/prefs/panorama/time changes. |
| Catalog | Existing search/filter/sort/paging controls move into filter rail + result table + inspector. Keep query/caret/selection stable and use real catalog counts and visibility values. The visible label is **Catalog**. |
| Sky View | Enlarge the square polar chart, put the scrub below it and detail/target rail beside it. Preserve zoom/pan/hit testing, magnitude/min-alt controls, panorama mask, and semantic chart colors. Add a container `ResizeObserver`, since a rail-width change need not resize the window. |
| Horizon | Arrange existing editor tools, panorama, 720-bin profile, and settings/history into the B three-region layout. Keep gesture history, dirty/Save semantics, crop, comparison, `blockAbove`, world-bin storage, and resize coordinate accuracy. Omit the unsupported global-statistics strip. |
| Image Catalog Library | Make the B object rail + session workspace + selected-session rail. Keep session rows thumbnail-free and all real actions/data. Omit generated ADU and completion-badge claims. |
| Import Exposures | Use Image Catalog's nested tab and B chrome for FITS upload/drop, frame type choice, progress, recent import batches, and calibration-frame add actions. |
| Image Catalog Sky Map | Use the nested tab and B chrome around the existing 2:1 chart. Preserve its selection/hover and redraw on container resize. |

**Exit:** all seven desktop views are functional and visibly follow the same B system at 1672 × 941, with deliberate compact layouts.

### Phase 4 — finish the browser planner

1. Rename web tabs to **Tonight, Catalog, Sky View, Horizon** in `web/index.html`, preserving their existing routing keys and Horizon flush-on-navigation. Web has no Image Catalog link.
2. Build the B Tonight session workspace and multi-target chart from current shared result tracks and `S.skyTime`. Build a real wide-screen docked inspector from the existing detail content; retain a modal on compact widths. Opening detail must focus its content, and closing it must restore focus to its source row/control.
3. Recompose the web Catalog as filter rail, results table, and inspector without losing search caret/focus restoration, sorting/paging, stable async visibility column widths, or real result data.
4. Recompose Sky View as dominant square canvas, time rail below, and inspector beside it. Attach `ResizeObserver` to the chart container and preserve DPR, zoom/pan/hit testing, magnitude filter, and horizon rendering.
5. Recompose Horizon's tool rows, panorama/profile stage, and settings/history as B rails. Preserve the current save/dirty/history, profile, backup, and planner invalidation behavior.
6. Map canvas `--viz-*` colors to the approved Workbench palette; use selected gold and semantic alternate/blocked/Moon roles from real data. Remove any duplicate Workbench token declaration that silently overrides the new value.

**Exit:** web's four views follow B's layout, retain existing behavior, and keep Glass as an alternate presentation.

### Phase 5 — verification and release readiness

1. Add focused tests for the five-primary/three-child desktop navigation, import-tab visibility, library retry, blocked chart runs, inspector focus restoration, selected-time synchronization, and container resize. Extend existing browser suites for the new layout; do not weaken older astronomy, panorama, backup, or accessibility assertions.
2. Capture deterministic screenshots for **all seven desktop views and four web views**, in Workbench and Glass, at 1672 × 941, 1240, and 900 px. Check web at 640 and 360 px too. Compare with the B images for hierarchy, proportions, spacing, and color while allowing live data values to differ. Check no horizontal overflow, clipping, overlap, layout jump, or wrong chart hit targets.
3. Run `python scripts/check_js.py` after static/web edits. Resolve both the missing-ID code error and the token self-test's filesystem-permission failure; do not label the gate passed while either remains. Run token and encoding guards after their inputs change. Run focused UI/JS/browser checks while iterating.
4. Run `python -m pytest tests/ -q --tb=no` **once at the end**, then `python scripts/check_browser.py --all` against a current desktop build and web tree. Run the repository's release guard if preparing an artifact. Record exact commands, exit codes, and screenshots in the Coder completion report.
5. Do not touch the unrelated sky-brightness work. No staging, commit, tag, deployment, or combined release in this UI pass.

**Acceptance record for the 2026-09-26 UIB-014..018 pass:** the original UI requirements were implemented for both themes and the requested widths. The separate UIB-019..021 follow-up is recorded below.

## Completion record — 2026-09-26

- Fixed UIB-014 through UIB-018. Docked details now fit as vertical rails in
  both themes and shells; compact desktop dialog chrome sits above sticky
  navigation; chart sizing follows rail changes; Tonight facts and Catalog
  filters share layout rules; keyboard scope, web chart key, offline image
  fallback, truthful obstruction summary, and screenshot scroll reset are
  covered by browser regressions.
- Rebuilt the local packed desktop executable for browser checks as
  `0.6.34-8-g3c12daf-dirty`.
- `python scripts/check_js.py` passed across the shipped modules, and
  `python scripts/check_encoding.py` passed. `git diff --check` reported no
  whitespace errors (only Git line-ending notices).
- `python scripts/check_browser.py --all` passed **38/38** on the final desktop
  build and web tree.
- The single final `python -m pytest tests/ -q --tb=no` run passed **647 tests**
  in 235.07 seconds with one upstream Starlette/httpx deprecation warning.
- Recaptured and visually reviewed **82** deterministic screenshots: 42
  desktop and 40 web in Workbench and Glass. The matrix and capture state are
  recorded in `implementation/screenshots/README.md`.
- Screenshot review then surfaced a separate Glass desktop topbar overlap at
  1240px. It was recorded as UIB-019 and is resolved in the final validation
  fixes below.
- Nothing was staged, committed, tagged, deployed, or released. The separate
  sky-brightness/core/data work remains untouched by this UI pass.

## Final validation fixes — 2026-09-27

- Fixed UIB-019 through UIB-021. Glass's single-row desktop header fits at
  1300, 1240, 1201, and 1100 px. The web docked inspector recalculates its top
  offset while scrolling and cleans up its listener on close or compact-mode
  changes. Desktop metadata labels wrap within their existing cells.
- Expanded browser coverage for deep Tonight detail scrolling and hit targets,
  Glass header geometry, every desktop Catalog rail control, independent result
  table scrolling, and metadata label/value separation. Web's Tonight key is
  checked at both 640 and 360 px in both themes.
- `python scripts/check_js.py`: exit 0. `python scripts/check_browser.py --all`:
  exit 0, **38/38 passed**. `python scripts/check_encoding.py`: exit 0.
  `git diff --check`: exit 0; Git printed only its existing LF-to-CRLF notices.
- Rebuilt `dist/NightSeam.exe` with `-AllowDirty` for browser validation. It
  reports `0.6.34-8-g3c12daf-dirty`; no release artifact was staged or
  published.
- Recaptured **82 screenshots** (42 desktop, 40 web) and reviewed the required
  web detail, desktop inspector, and Catalog rail views in both themes. The
  dated capture and visual-review record is in
  `implementation/screenshots/README.md`.
- The initial non-elevated full pytest invocation exited 1 with 398 passed,
  246 errors, and 3 failures because Windows denied the fixture's documented
  `logs/.pytest-tmp` scratch path (`WinError 5`). The representative scratch
  test and all three named failures passed with filesystem access. The final
  full run with that access exited 0: **647 passed in 221.94 seconds**, with
  one upstream Starlette/httpx deprecation warning.
- Nothing was staged, committed, tagged, deployed, or released. Unrelated
  sky-brightness/core/data work remains preserved.
