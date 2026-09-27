# NightSeam Direction B UI implementation plan

> **Superseded historical plan.** The current implementation follows
> [REFERENCE_FIDELITY_CODER_PROMPT.md](REFERENCE_FIDELITY_CODER_PROMPT.md), which
> retires Glass and estimated sky brightness and replaces the old two-theme
> acceptance matrix. The status and conflicting choices below are historical,
> not current requirements or validation evidence.

**Status:** Approved coder handoff. The user selected the mockup's five-tab navigation and a close match to its colors, and explicitly authorized sending this plan to the Coder chat. The planner will make no application-code changes.

**Purpose:** Turn the five Direction B concept images into working NightSeam interfaces. Match their hierarchy, proportions, typography, density, and interaction placement at the 1672 × 941 reference viewport while keeping all displayed astronomy, catalog, weather, and library data live. This plan covers the desktop app and the browser planner. The browser planner has no Image Catalog.

## Visual references

| Concept image | Intended surface |
|---|---|
| [Tonight](tonight.png) | Desktop and web planner Tonight |
| [Catalog](catalog.png) | Existing desktop/web **Targets** tab |
| [Sky View](sky-view.png) | Desktop and web Sky View |
| [Horizon](horizon.png) | Existing **Horizon & Obstacles** tab |
| [Image Catalog](image-catalog.png) | Desktop Image Catalog **Library** tab |

The PNGs are visual references, not data fixtures. Do not hard-code their dates, site, coordinates, object facts, rankings, scores, times, plotted positions, frame counts, or text. Some generated details are inconsistent (for example, the Catalog image calls M106 the Pinwheel Galaxy and the selected filter does not match every row). Use the shipped catalog and current application state as the authority.

## Decisions and implementation assumptions

1. **Navigation — decided.** Use the B mockup's five primary desktop tabs and labels: **Tonight, Catalog, Sky View, Horizon, Image Catalog**. The current desktop implementation has four planner tabs plus three Image Catalog tabs. The new Image Catalog primary tab opens its **Library** view by default on first entry; Import Exposures and Sky Map remain reachable through a clearly visible, keyboard-operable **secondary tablist inside Image Catalog**. Thereafter, remember the selected catalog child tab for the current session. The browser planner uses the first four labels; it does not gain an Image Catalog tab or local FITS archive.
2. **Palette — decided.** Match the B image colors closely by updating the Workbench contract in `DESIGN.md`, `static/themes.css`, and `web/themes.css`. Use this exact role palette as the implementation starting/final token set: page/chart dark `#0B1115`; panel `#10181B`; raised control `#152027`; border `#293840`; soft border `#1E2B31`; primary text `#E7ECE8`; muted text `#9CAEB1`; brass/gold selection `#F9C85D`; dark text on gold `#101316`; good `#5BC68D`; warning `#E8A948`; blocked/bad `#C45B52`; chart grid `#304049`; secondary chart series blue `#73B6DB`. Put hex values in theme role definitions, not component rules. Keep surfaces opaque, no blur/glow. Glass remains the optional theme on the same DOM skeleton. Use existing semantic `--viz-*` roles mapped to these values; selected target line is gold, alternate target lines blue and blocked-red, Moon line the existing semantic Moon role.
3. **Missing visual references — resolved.** `image-catalog.png` depicts Library. Implement Import Exposures and Image Catalog Sky Map using the precise three-panel/grid and chrome rules in sections 1 and 7. Do not generate new images or wait for another visual decision.
4. **Feature boundary — specified.** Build the persistent target inspector and Tonight's multi-target altitude overview from existing shared planning results. Reposition existing Catalog filters; do not invent filters. Omit the mockups' archive-capacity indicator, session-complete badge, per-frame ADU panel, and Horizon global-statistics strip. Use only real existing per-session statistics in Image Catalog and real metadata/compare controls in Horizon. Do not add backend fields or unrelated computation for visual filler.

## Non-negotiable product contracts

- `core/` stays the sole astronomy/planning implementation. A restyle must not change scoring, visibility, selected-time behavior, panorama geometry, backup, or catalog identity. Reuse existing tracks and results to populate new presentations.
- Preserve current DOM IDs and event hooks during the navigation migration until each has a tested replacement. Do not fork the DOM by theme. Keep Workbench the default and Glass selectable.
- Keep Site, Rig, date, and minimum altitude as common planner controls. Advanced settings and Setup stay in the hamburger menu. The Image Catalog primary tab hides planner-only controls and shows import/export controls in the shared chrome.
- Keep the user's `edgeSpace` preference effective. Set the fresh-profile Workbench default to **16 px per side** in both shells, preserving an explicitly stored value (including 200 px). Use 16 px for reference captures. Never override a stored preference merely to match a mockup.
- Keep target details keyboard reachable and preserve focus on close or view change. Canvas charts retain semantic summaries, visible focus, high-contrast usability, and reduced-motion behavior.
- Keep Image Catalog sessions thumbnail-free unless a separate product decision adds previews. Optional remote object imagery must never become necessary for layout or offline use.

## Reference layout measurements

Use the 1672 × 941 PNGs as the large-window target. These are approximate layout anchors to measure again from the actual images before writing CSS, not immutable pixel constants:

| Surface | Large-window composition |
|---|---|
| Common planner chrome | About 48 px top bar plus 40 px tab strip; flat full-width structure, 14–16 px content gutters, thin borders, compact controls. |
| Tonight | Main planning workspace about 76% of usable width, right inspector about 21%, with a narrow gap. Brief, multi-target chart, and ranked rows stack in the main workspace. |
| Targets/Catalog | Filter rail about 14%, results table about 51%, target inspector about 35%. The table gets the remaining flexible width after minimum usable rail widths. |
| Sky View | Square polar chart and scrub workspace about 63%, inspector/target rail about 37%. The polar disc must remain circular. |
| Horizon | Tool rail about 12%, panorama/profile workspace about 67%, settings/history rail about 19%. The panorama keeps its real image aspect and usable paint coordinates. |
| Image Catalog Library | Object rail about 16%, capture-session workspace about 66%, selected-session rail about 16%. Import Exposures and Sky Map inherit the same chrome. |

Use CSS Grid/Flex with minimum widths and content-driven wrapping rather than absolute positioning. At <=1240 px, narrow the rails and compress control labels. At <=900 px, move the inspector below the primary workspace or into the existing detail surface while retaining chart controls. At 640 px and 360 px web widths, use one column, reachable navigation, wrapped actions, and no horizontal page overflow. Do not shrink a chart until its labels and pointer/keyboard targets are unusable.

## Implementation sequence and coder instructions

### 0. Baseline and component inventory

1. Start from a clean feature branch/worktree; preserve the existing untracked concept PNGs and unrelated user work. Record the current desktop and web screenshots for Workbench and Glass at 1672 × 941, 1240 px, 900 px, and a narrow browser width.
2. Build a component-to-code map for every pictured region and mark it **existing presentation**, **new presentation using existing data**, or **unsupported mockup detail**. Record this in the implementation PR description before coding. Do not make an unsupported detail an API requirement by accident.
3. Record measured spacing, type scale, border/radius, and column ratios from the five PNGs. Update `DESIGN.md` to the exact role palette in decision 2 before editing code. Map desktop `--bg/--panel/--border/--text/--dim/--accent` and web `--bg/--panel/--line/--txt/--muted/--accent`, plus status and `--viz-*` roles, to that palette. Keep hex values in theme token definitions, not view components. Verify normal text, muted text, selected states, and focus borders for contrast against their actual surfaces.
4. Use this deterministic planner capture state: site `Black Forest`, latitude `48.0° N`, longitude `8.2° E`, zone `Europe/Berlin`; local night `2026-09-26`; selected time `22:36` local; selected object M31/NGC 224; minimum altitude `25°`; Workbench theme; `edgeSpace=16`. Use an isolated synthetic library fixture with M31 and two capture sessions for Image Catalog screenshots. Capture real calculated values from that state; do not force the PNG's illustrative values into the app.

### 1. Five-tab desktop navigation and shared shell

**Desktop starting points:** `static/index.html` top bar and mode/tab markup; `static/style.css` structural layout; `static/themes.css` Workbench/Glass theme blocks; `static/js/main.js` tab selection and redraw wiring; `static/js/archive.js` mode switching.

**Web starting points:** `web/index.html` top bar/tabs; `web/style.css`; `web/themes.css`; `web/app.js` hash routing and `#view` rendering.

1. In `static/index.html`, make `#tabs` the one five-item primary tablist. Keep the existing primary IDs and `data-tab` values for Tonight, Targets, Sky View, and Horizon so current handlers keep working; change their visible labels to **Tonight, Catalog, Sky View, Horizon**. Add `data-tab="image-catalog"` with a primary `#tab-image-catalog` panel.
2. Nest the existing Import Exposures, Library, and Sky Map content under `#tab-image-catalog`. Keep their child panel IDs, change their class from primary `.tabpane` to `.catpane`, and make primary `.tabpane` activation ignore catalog children. Rename `#tabs-cat` to `#catalogTabs` and style it as an in-flow secondary tablist, not another fixed top dock. Update the `DESIGN.md` hard-rule selectors and invariant tests for this deliberate ID change.
3. In `static/js/main.js`, split tab activation into **primary** and **catalog child** selection. A primary switch changes only the five primary tabs/panels and ARIA selection. A child switch changes only the three catalog tabs/panels and their separate ARIA state. Preserve `Pano.onHide/onShow`, Sky View redraw, library load, and Sky Map redraw after its child panel becomes visible. Load Library once on the first Image Catalog entry, default to Library, and remember a subsequently selected catalog child for the rest of the session. Keep the `N` keyboard cycle to the five primary tabs; give the secondary tablist its own standard arrow-key behavior.
4. Retire the old mode-toggle behavior in `static/js/archive.js` and the associated `S.catmode` branch only after enumerating all callers, including the brand/mode button, wizard, keyboard shortcut, header, theme selectors, and tests. Keep `#brand` as branding. Use an explicit active-primary-view class/state to show catalog chrome and hide planner-only controls; never hide `#tabs` itself. Guard canvas redraw by both parent and child visibility so a hidden active Sky Map child is not drawn at zero width.
5. In the browser planner, keep the four available primary tabs and rename Targets→Catalog and Horizon & Obstacles→Horizon to match B. Preserve hash routing, Horizon flush-on-navigation, current control IDs, and tab ARIA. Do not show a disabled/fake Image Catalog link.
6. Implement B's flat top bar, aligned compact controls, thin divider, and active-tab bright-gold underline through structural styles and the revised Workbench tokens. Preserve the existing topbar/menu z-index ladder, `.hidden` authority, fixed modal behavior, and the planner controls' live state. Do not apply display overrides directly to `#plannerControls`, `#tabs`, or `#nightInfo`.
7. Establish reusable shell classes for panel edges, header rows, compact metrics, action groups, rails, and inspectors. Use the same semantic layout rules in the two separate shells; avoid copying large blocks of one shell's JavaScript into the other.

**Shell acceptance:** the desktop has exactly five working primary tabs and three working Image Catalog child tabs; web has four; each active tablist exposes exactly one selected tab; planner controls retain their state; menu stays above content; resizing and theme switching leave no hidden/overlapping controls; Glass still renders correctly.

### 2. Target inspector as a reusable presentation

**Desktop:** `static/js/detail.js` owns the existing target detail sheet; planner rows and Sky View open it. **Web:** `web/app.js::openDetail` currently fills a shared modal. At large widths, the B layout needs a docked right inspector; at compact widths, retain a modal/sheet presentation.

1. Extract the target summary, chart, visibility explanation, provenance, and action markup into a shell-local render path that can mount in either a rail or the existing detail surface. Use one selected-object ID and the existing selected-time state (`S.tIdx` desktop, `S.skyTime` web). Avoid duplicate DOM IDs, especially chart canvases.
2. Reuse existing detail/track data, image lookup, and provenance. If no image is available offline, keep the same dimensions with a neutral designation/type block.
3. Subscribe the inspector to the existing night-loaded, selected-time, preference, panorama revision, and theme/resize redraw flow. Cancel or ignore stale async results using the current generation guards. Do not create a second astronomy calculation path.
4. Keep click, Enter/Space, Escape, focus restoration, and screen-reader labels working. On compact widths, opening and closing detail must not lose the previously focused target row.

**Inspector acceptance:** the selected object and time agree with Tonight, Targets, and Sky View; graph and reason agree with the shared result; no stale value appears after a site/date/panorama change.

### 3. Tonight

**Desktop anchors:** `static/index.html` `#nightBrief`, `#tonightCards`, `#topPicks`, `#laterList`; `static/js/tonight.js`. **Web anchors:** `web/app.js::renderTonight` and its booked-night strip/target lists.

1. Arrange the session brief, dark window, selected time, Moon facts, booked-night scrub rail, target overview, and ranked targets into the main workspace. Keep the current ranking and candidate-pool rules.
2. Render the screenshot's multi-target altitude overview from already-built tracks for the selected top targets. Its vertical marker follows the one selected-time state. Draw min-altitude, twilight, and obstruction guides using existing semantic chart roles. Never recalculate target positions in the UI component.
3. Keep visible-now and rising-later distinctions, existing score/reason text, target selection, and add-to-target action tied to real state. Changing date/site/rig/min-altitude/panorama/time must update chart, rows, and inspector together.
4. At narrow widths, put the inspector after the chart and ranked list; keep the time rail operable by pointer and keyboard.

**Tonight acceptance:** chart/rows/inspector name the same selected night and target; no target with zero usable visibility is presented as visible now; no status or image load shifts the controls.

### 4. Targets (pictured as Catalog)

**Desktop:** `static/index.html` Targets filters/table and `static/js/targets.js`. **Web:** `web/app.js::renderCatalog` and its search/category/constellation/visibility controls.

1. Recompose existing controls into B's filter rail, results table, and target inspector. Preserve search, sort, paging, row actions, constellation filtering, visibility filtering, optional rig framing, and provenance.
2. Preserve the web catalog's search caret/focus restoration and fixed-width visibility cells while asynchronous values fill. The filter rail is a placement change; only add a new filter if it has a defined field and can be tested in both shells.
3. Display the real standard-mode count and actual catalog data. Advanced mode remains in the hamburger menu and must still expose the full shipped catalog when enabled. Do not copy the PNG's sample rows, percentages, or labels.
4. Use the reusable inspector. The user chose the B navigation labels, so update both shells' Targets→Catalog label, accessibility text, docs, browser checks, and web cache tokens in the same implementation slice. Keep internal IDs stable unless a change is necessary.

**Targets acceptance:** filtering/sorting/paging produce the same object set and order as before the redesign; selection does not reset the query; inspector charts and provenance remain correct.

### 5. Sky View

**Desktop:** `static/index.html` `#skyCanvas` and controls; `static/js/skyview.js`. **Web:** `web/app.js` Sky View renderer and `#sky` canvas. Semantic chart colors come from each shell's `viztheme.js` and `--viz-*` theme roles.

1. Give the polar chart the primary square workspace shown in B; place legend and controls around it, then the dusk-to-dawn scrub beneath. Preserve current zoom, pan, hit testing, magnitude limit, constellation/label/Moon/min-alt toggles, and panorama silhouette.
2. Keep the shared square zoom geometry and DPR canvas sizing. Attach a `ResizeObserver` to the chart container so rail-width or panel changes resize/redraw the chart, in addition to window resize.
3. Use the same selected time as the other planner views. Do not alter the core horizon, Sun/Moon, twilight, or visibility rules to fit the illustration. The right rail uses the reusable inspector and real nearby/visible targets only if that list is backed by existing result data.

**Sky acceptance:** polar disc remains circular, click/hover targets line up with marks after resizing/zooming, the mask and altitude ring stay aligned, and theme changes repaint canvas colors.

### 6. Horizon & Obstacles

**Desktop:** `static/index.html` editor controls, `static/js/pano.js`, `#panoStage`, `#panoCanvas`. **Web:** `web/horizon.js` editor markup, canvas, history, and save handling.

1. Reorder existing editor controls into B's tool rail, dominant panorama stage, lower world-azimuth profile, and right settings/history rail. Keep the panorama's actual aspect ratio and coordinate transform; resizing must not move strokes or profile bins.
2. Preserve obstacle/sky paint, continuous right-drag erase, brush, crop, calibration, landmarks, numeric profile, confidence, comparison overlay, Undo/Redo, Save/Revert, dirty state, and flush-on-navigation. Keep one history entry per completed gesture and immediate in-memory planner invalidation.
3. Omit the PNG's global-statistics strip, including “clear sky” percentage and confidence breakdown. Keep the existing named landmarks, calibration, per-bin confidence, numeric edit, and comparison overlay. A stored stroke-less profile remains authoritative.
4. Retain `blockAbove` semantics, the open-above hatch, 720 world-azimuth bins, and the exact sky/blocked complement. Style changes must not rewrite profile data.

**Horizon acceptance:** painting, erase, crop, undo/redo, save, leave/reopen, backup, and active planner results behave as before; both themes show obstruction and assumed-open regions distinctly; canvas coordinates survive resize.

### 7. Desktop Image Catalog: all three tabs

**Starting points:** `static/index.html` Import Exposures / Library / Sky Map markup; `static/js/archive.js` ingest, import history, library, export, reindex, folder actions; `static/js/skymap.js` 2:1 map.

1. Apply B's Image Catalog primary-tab chrome to Import Exposures, Library, and Sky Map. `image-catalog.png` is the Library composition: object rail, session table, selected-session inspector. The other two remain separate child tabs within the one primary Image Catalog panel.
2. Import Exposures: keep FITS drop/upload, forced frame type, import progress, captured-session grouping, import history, and `+ Darks`/`+ Flats`/`+ Bias` actions. Use B-style action rows and status placement without changing ingest/storage behavior.
3. Library: re-layout the real per-object rollups, filters, session rows, exports, reindex, rename/retype of unresolved objects, and open-folder actions. Keep session expansion thumbnail-free. Omit the PNG's per-frame ADU panel and session-complete badge. Display real existing per-session statistics in the selected-session rail, and keep the selected object/session stable after refresh.
4. Sky Map: carry the same Workbench structure into the existing 2:1 canvas view, preserving its pan/hover/selection behavior and explicit redraw when its container width changes.

**Image Catalog acceptance:** a user can reach all three child tabs, import FITS, inspect a session, add calibration frames, export, reindex, and open a folder as before; image files remain in their configured archive; no planner-only controls leak into the Image Catalog primary tab.

### 8. Themes, compact layouts, and accessibility

1. Implement structural layout once per shell and express theme appearance through `static/themes.css` and `web/themes.css`. Workbench uses opaque graphite, brass, compact square controls, no decorative glow; Glass retains its established translucent/lavender treatment without a separate DOM.
2. Verify all seven desktop views and four web views at 1672 × 941, 1240, and 900 px; verify web at 640 and 360 px. The right inspector becomes a lower panel or detail sheet where needed. Long designations, weather statuses, and imported session names must wrap or truncate without hiding actions.
3. Maintain tab semantics, chart text alternatives derived from the same state, visible focus, keyboard scrub, menu/dialog dismissal, high contrast, reduced motion, and focus restoration. Include manual screen-reader review for dynamic target and editor updates.

## Verification and delivery gates for the coder

- During iteration, run focused UI tests, especially `python -m pytest tests/test_ui_invariants.py -q`, and the relevant JS behavior modules. Update tests only for intentional design-contract changes; never weaken astronomy or storage assertions to make layout pass.
- After changing `static/` or `web/`, run `python scripts/check_js.py`. For changed web assets, run `python scripts/bump_web_tokens.py` and `python scripts/check_js_tokens.py --update`, then rerun the JS guard. If `core/` genuinely changes, edit only source modules, run `python scripts/build_core.py`, then `python scripts/check_core.py`; do not hand-edit baked trees or stubs. Run `python scripts/check_encoding.py` after text rewrites.
- Extend `tests/browser/desktop_suite.py` for five primary desktop tabs and the three Image Catalog child tabs, and `tests/browser/web_suite.py` for the four renamed web tabs. Assert each view's region order, selected tab/state, responsive reflow, no horizontal overflow, canvas resize/hit testing, focus restoration, and no layout jump while progress or async visibility data arrives. Run `python scripts/check_browser.py --web` during iteration, then `python scripts/check_browser.py --all` against the current desktop build and web tree. Capture actual screenshots at 1672 × 941 and compact widths for side-by-side design review. The images are not a pixel-diff oracle for dynamic astronomy data.
- Follow `AGENTS.md` context discipline: run the full suite **once at the end** with `python -m pytest tests/ -q --tb=no`. Run the release check appropriate to the eventual package/release state; a dirty development snapshot uses `python scripts/check_release.py --allow-dirty`. A browser infrastructure exit is a failure to investigate, not a pass.
- Deliver a change summary, the component-to-data map, screenshots for every desktop/web view in both themes, focused/full test results, and a list of deliberate differences from the five PNGs. No tag or deployment is part of this UI implementation unless separately requested.

## Ownership and handoff

The **Coder chat** should implement the UI in reviewable slices, with one integration owner for the shared shell and styles. The planner's role is to review actual screenshots against this document after the user reports completion. The user authorized the handoff and implementation; do not ask the coder to choose alternative navigation, colors, fields, or scope.
