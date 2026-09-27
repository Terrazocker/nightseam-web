# Direction B UI: final fit and interaction repair

**Scope:** This is the implementation order for the confirmed post-completion findings UIB-014 through UIB-018 in BUGS.md. Keep the approved Direction B palette, five desktop primary tabs, three Image Catalog child tabs, four web tabs, existing astronomy/planning behavior, and the completed 35-case browser suite. The current 82 screenshots are evidence of the defects below, not proof of final visual acceptance.

**Working tree:** Use the current shared checkout. Preserve the unrelated sky-brightness/core/data changes and the existing Direction B work. Do not reset, clean, stage, commit, tag, deploy, or release. Read DESIGN.md and CODER_HANDOFF_PLAN.md before touching UI code. No new backend fields, invented image/data values, or astronomy formulas are needed.

## 1. Fit the docked target inspector in both shells — UIB-014, P1

The wide inspector must show its image/placeholder, metadata, altitude chart, legends, and actions inside its own rail. Vertical scrolling inside the rail is acceptable; horizontal clipping or horizontal scrolling is not. Test the open inspector on Tonight, Catalog, and Sky View at 1672 and 1240 px in Workbench and Glass, and retain the existing compact modal behavior at 900 px and below.

### Desktop

- In static/style.css, the global .detail-grid at line 528 uses 300px 1fr. In static/themes.css, the Workbench dock is only 360px wide at line 1645. Add a dock-specific layout rule for #detailModal.detail-docked .detail-grid that overrides the global two-column rule in **both themes**. Use one minmax(0, 1fr) column in the dock; keep the current two-column layout only for a modal wide enough to fit it.
- Place the image/metadata block before the altitude-chart block in that column. Limit #dImage within the dock to at most the rail's content width and about 180px height; use object-fit: cover or contain as appropriate to retain an undistorted image. Let long aliases, provenance, and coordinate values wrap within their cells. Set min-width: 0 on grid children and the chart wrapper. The chart canvas must redraw after the dock width/layout changes; preserve DPR sizing and selected-time marker.
- Apply the same constraint in Glass. Avoid a viewport-only media query: a 1672px viewport can still have a 360px inspector. Keep the existing at-most-260px image rule for compact modals.

### Web

- In web/style.css, .detail-grid at line 454 uses a 240px image plus a metadata column; #modal.detail-docked at line 806 caps the rail near 420px. Add #modal.detail-docked .detail-grid with one minmax(0, 1fr) column in both themes. Keep side-by-side content only in a genuinely wide modal.
- In the dock, limit .objimg and .objimg-ph to the available width and about 180px height; do not let a missing online photo reserve a square taller than necessary. Change the dock's .meta grid to a bounded label column and minmax(0, 1fr) value column; wrap long aliases, sources, and other values within that value column. Keep the existing compact modal presentation. Redraw its altitude chart after the new width is applied.

### Acceptance test

- Add browser assertions, separate from screenshot count, for desktop and web at 1672 and 1240 px, both themes, on Tonight/Catalog/Sky View. With inspector open, assert the image, metadata value cells, altitude chart, legend, and close button have bounding rectangles within the inspector and viewport (allow 1px rounding), and inspector scrollWidth is no greater than clientWidth plus 1px. Scroll the inspector to verify the chart and bottom actions are reachable. At 900 px, verify the modal has no horizontal overflow and still traps focus correctly.

## 2. Repair desktop visual hierarchy — UIB-015, P2

- Glass Tonight: static/themes.css around lines 1258–1305 gives Workbench-only grid/flex structure to .session-head, .session-facts, .night-track, .track-head, .track-bar and .track-scale. Move the **layout** parts of those rules into shared static/style.css so Glass receives the same spacing, grid tracks, wrapping, and marker geometry. Keep theme-specific colors, borders, and decoration in themes.css. At 1672, 1240 and 900 px, labels and times must not run together, and the booked-night strip must have readable endpoints and selected marker. Use the existing state and markup; do not change night calculations.
- Desktop Catalog: static/style.css line 331 fixes #filterBar input[type=search] at 240px, defeating the narrower filter rail rule near line 682. Override or remove that fixed width for the Catalog rail, give #filterBar a minmax(0, 1fr) track, and ensure every search/select/range/action stays inside .catalog-filter-rail at 1672, 1240 and 900 px in both themes. The results table must remain independently scrollable without being covered by the filter controls.
- Add targeted layout assertions for those bounds. Reopen the existing screenshots to check text spacing after changing shared rules; do not rely on DOM assertions alone.

## 3. Make the docked desktop inspector nonmodal for keyboard shortcuts — UIB-016, P2

- In static/js/main.js around line 414, the global N/Arrow shortcut guard must ignore an open docked target inspector. It must continue to suppress shortcuts for actual modal dialogs, text inputs, selects, and textarea. Do not classify #detailModal.detail-docked as a blocking modal merely because it still has the .modal class.
- Make #detailModal .modal-box programmatically focusable with tabindex="0". In static/js/detail.js around lines 264–273, step the selected detail target on ArrowLeft/ArrowRight **only when event.target is that modal-box itself** and the detail is open. Never react to Arrow keys from either time slider, an input/select/textarea, a tablist, a button, or the main chart. The time sliders in static/js/header.js retain their 6-minute and Shift-60-minute behavior and must change only S.tIdx. The existing detail selection/focus-return state must remain intact.
- Add browser cases with the dock open: N cycles primary tabs when focus is outside an input; Arrow on the main workspace scrubs time; Arrow on each focused time slider scrubs time without changing S.currentId; Arrow in the intended detail focus area steps detail target; compact modal still contains focus and does not trigger global shortcuts.

## 4. Complete visual and accessible evidence — UIB-017/018

- Web Tonight visible key: keep the existing accessible summary, but add a compact visible guide beside/below the target-name swatches for red horizon/ceiling obstruction, amber below minimum altitude, gray below horizon, shaded twilight, minimum-altitude line, and selected-time marker. Use the existing semantic --viz roles and current plotted states. At 640 and 360 px the key must wrap without horizontal page overflow.
- Desktop detail image: add a hidden sibling #dImageFallback next to #dImage in static/index.html, styled to occupy the same image frame and labeled "Image unavailable offline". In static/js/detail.js, reset both states when opening a new target; on #dImage error hide the img and reveal the fallback, and on successful load show the img and hide the fallback. Guard async loads with the current detail generation so an older target cannot replace the new target's image. Do not add network requirements or synthetic target photos.
- Desktop Tonight summary: static/js/tonight.js around line 252 must say red means horizon/ceiling obstruction only, matching static/js/tonight-chart.js. Keep the other chart descriptions accurate for below-minimum and below-horizon states.
- Fix ui-concepts/direction-b/implementation/capture_screenshots.py: it currently resets web scroll before opening M31 detail, then the click scrolls to a deep Tonight row. After opening detail, reset the page and any relevant main scroll container to top immediately before the capture. The wide Tonight capture must show its session brief and altitude overview while the inspector is open. This is a capture correction, not a change to the ranking.

## 5. Verification and handoff

1. Preserve existing JS/DOM/astronomy/panorama/backup assertions. Add the focused inspector-fit, Glass facts, Catalog rail, keyboard, fallback-image, and visible-key checks above. Do not weaken the 35 existing browser cases. Run focused checks while iterating.
2. Rebuild a dirty local executable for desktop browser checks and screenshots. Rerun python scripts/check_js.py, python scripts/check_browser.py --all, python scripts/check_encoding.py, and git diff --check after all edits. Rerun python -m pytest tests/ -q --tb=no **once at the end** on the final tree. The prior full-suite result was 397 passed, 4 failed, 246 errors, mostly WinError 5 on scratch paths; use a writable/permission-enabled test execution environment where available. If still blocked, record exact command, failing path, counts, and which focused UI checks passed. Do not describe a failing gate as green.
3. Recapture the full 82-image matrix so every image reflects the final code. Inspect the wide inspector in both shells/themes, Glass Tonight at 1672/1240/900, Catalog filters at those widths, web Tonight at top with inspector open, and the compact modal at 900/640/360. Update the screenshot manifest with capture state, dimensions, and any approved deviation. The five original B concept PNGs remain reference images.
4. Update BUGS.md and the status line of REMAINING_WORK.md to reflect actual outcomes; do not leave a blanket completion claim if a confirmed visual defect remains. Return a completion report with exact changed files, behavior, test commands/exit codes, screenshot locations, and any unresolved issue. No staging, commit, PR, tag, deploy, or release in this pass.

**Final acceptance:** both docked inspectors fit; Glass Tonight facts and Catalog filters are readable; desktop keyboard controls do not conflict; chart keys and image fallback are truthful; current screenshots show the whole intended composition; required gates are reported accurately.
