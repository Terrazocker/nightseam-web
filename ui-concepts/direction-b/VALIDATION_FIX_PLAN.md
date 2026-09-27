# Direction B UI: final validation fixes

> **Superseded validation plan.** The current acceptance source is
> [REFERENCE_FIDELITY_CODER_PROMPT.md](REFERENCE_FIDELITY_CODER_PROMPT.md). This
> plan records an earlier Glass/brightness validation scope; do not treat its
> theme matrix, feature choices, or status as current.

**Scope:** Resolve the three open visual findings UIB-019, UIB-020 and UIB-021 in `BUGS.md`, and close the browser coverage gaps found during validation. Use the current shared checkout. Read `DESIGN.md`, `AGENTS.md` and the existing Direction B handoff before editing. Preserve the two themes, five desktop primary tabs, three Image Catalog child tabs, astronomy/planning behavior and unrelated sky-brightness/core/data work. Do not stage, commit, tag, deploy or release.

## 1. UIB-020 — keep the web docked inspector below visible chrome (P2)

**Cause:** `web/app.js::syncDetailDock` sets `--detail-top` from `#tabs.getBoundingClientRect().bottom` only when detail opens or the window resizes. Clicking M31 in a deep Tonight row scrolls the tabs above the viewport, so the value becomes `0px`; the sticky top bar then covers the inspector title and close control. Returning to the page top does not recalculate the offset.

1. In `web/app.js`, extract a small `updateDetailDockTop()` helper used by `syncDetailDock`. While a docked detail is open, set `--detail-top` to the ceiling of the maximum of `0`, the visible `.topbar` bottom and the visible `#tabs` bottom, measured with `getBoundingClientRect()`. This keeps the rail below whichever chrome is visible. Do not change the compact modal's positioning or semantics.
2. While docked detail is open, attach one passive, capture-phase scroll listener that schedules `updateDetailDockTop()` in `requestAnimationFrame`; coalesce multiple scroll events into one frame. Remove the listener and cancel any pending frame in `closeDetail()` and when detail changes to compact modal. A refresh/reopen must not register duplicate listeners. Retain the current resize handler and chart redraw path.
3. Extend `tests/browser/web_suite.py::web_docked_inspector_fit_and_tonight_key` with the actual failure sequence at 1672 and 1240 px in Workbench and Glass: scroll to the Tonight `pick-target[data-id='ngc224']` row, assert `#tabs.getBoundingClientRect().bottom <= 0` before opening it, open it, inspect without resizing, then scroll the page to the top without resizing. At both positions assert the inspector title `#m-title` and close control `#m-close` are within the viewport and unobscured by the top bar/tabs (bounding rectangles plus a center-point hit test). At the page top assert the computed dock top is at least the visible tab bottom, within 1 px rounding. Close via the visible control and verify the detail closes. Keep existing Catalog/Sky View and 900 px compact checks.
4. In `ui-concepts/direction-b/implementation/capture_screenshots.py::reset_web_capture_scroll`, after resetting the page and inspector scroll, wait for the dock offset to settle and assert title and close control visibility and unobscured hit points whenever wide detail is open. Keep the existing Tonight overview assertion. The script must fail a capture if the detail header is hidden.

## 2. UIB-019 — fit the desktop Glass header at 1240 px (P3)

**Cause:** the one-row Glass toolbar uses wide control ranges between 1201 and 1300 px, while its compact rules begin only at 1200 px. The selected-time label and Weather chip overlap at 1240 px.

1. In `static/index.html`, remove the `style="width:170px"` attribute from `#timeSlider`. Set `#timeSlider { width: 170px; }` in `static/style.css` so the existing wide Workbench geometry remains unchanged and responsive rules can override it.
2. In `static/themes.css`, apply the existing Glass **control compaction** rules (control gap, label size, select/date maximum width, minimum-altitude range, time range, control padding, right-side gap and decorative clock hiding) through `max-width: 1300px`. Keep the existing `#tabs`/`#nightInfo`/`main` positional offsets limited to `max-width: 1200px`; do not introduce a second fixed header row. In the 901–1300 px Glass range, cap `#timeSlider` at 115 px, the minimum-altitude range at 130 px, Site at 130 px and Rig at 130 px. Keep both time and Weather visible. Constrain the Weather and sky-brightness chips to 140 px each with text ellipsis inside the button instead of letting their text paint across adjacent controls. Do not change the sky-brightness feature itself.
3. Extend `tests/browser/desktop_suite.py` with a Glass header geometry assertion at 1300, 1240, 1201 and 1100 px, plus Workbench at 1240 px. Assert `#timeLabel`, `#btnWeather`, visible `#btnSkyBrightness` and `#btnMenu` fit within `#topbar`, no pair intersects by more than 1 px, and the visible Weather/Menu button centers are hit-testable. Assert the Glass tab dock starts below the header. Preserve the existing 1672 and 900 px coverage.

## 3. UIB-021 — prevent desktop inspector metadata overlap (P3)

1. In `static/style.css`, change `.kv td:first-child` for the detail metadata table so labels can wrap within its 110 px cell; remove `white-space: nowrap` and use `overflow-wrap: anywhere`. Preserve the two-cell table and existing value wrapping. Do not widen the dock or hide/truncate metadata.
2. Extend the desktop detail fit browser check for M31 in both themes at 1672, 1240 and 900 px. For every `#dMeta` row, assert the label's rendered text rectangles remain within its own cell (up to 1 px rounding), the value starts in the second cell, and the table has no horizontal overflow. Explicitly check the “Designation history” row. Keep the existing image, chart, close and focus assertions.

## 4. Close the remaining coverage gaps and verify

1. The desktop Catalog rail check currently measures only its search field. At 1672, 1240 and 900 px in both themes, measure every visible search, select, range and action control in `.catalog-filter-rail`; each must fit inside the rail, and the results table must retain independent horizontal scrolling without page overflow.
2. Run the web Tonight six-item visible-key check at **both 640 and 360 px in both themes**. Preserve its token-color, wrap and page-overflow assertions.
3. After the web `app.js` behavior change, bump its `?v=` in `web/index.html` from the current token to the next integer, update the current token register in `AGENTS.md`, then refresh the verified baseline with `python scripts/check_js_tokens.py --update`. If any web CSS source changes, bump its stylesheet token as well. Do not edit baked core or catalog tokens.
4. Rebuild the dirty local desktop executable used by browser checks. Run focused checks while iterating; then run `python scripts/check_js.py`, `python scripts/check_browser.py --all`, `python scripts/check_encoding.py`, and `git diff --check`. Run `python -m pytest tests/ -q --tb=no` **once at the end** on the final tree. Report exact exit codes and counts; do not describe a failing gate as green.
5. Recapture the full 82-image Direction B matrix with the final code. Visually inspect at least web Tonight with M31 detail at 1672/1240 in both themes, desktop Glass Tonight at 1240, desktop inspector at 1672/1240/900 in both themes, and Catalog rails at those widths. Confirm the web title and close control and the desktop metadata are visible in the PNGs. Update the screenshot manifest and mark UIB-019..021 fixed in `BUGS.md` and `REMAINING_WORK.md` only after the code, browser checks and images all agree.

**Completion report:** list changed files, behavior, exact checks/results, screenshot paths and any remaining issue. Preserve unrelated work and leave all changes unstaged and unreleased.
