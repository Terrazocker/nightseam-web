# NightSeam Design Guide — Workbench

Workbench is the only planner design language. The web uses these visual
roles and information hierarchy; no theme picker or alternate presentation is
shipped. Legacy theme values (`dome`, `classic`, empty, or unknown) normalize to
`workbench` when settings or backups load. `web/viztheme.js` remains the canvas palette adapter.

## Visual language

Use an open workspace on one opaque page surface. Group information with
spacing, typography and quiet 1px separators at real hierarchy boundaries.
Do not frame every section, counter, chart or rail as a filled card. Actions
are transparent text/icon controls; selected tabs use a brass underline.
Keep inputs identifiable, focus visible and selected rows distinguishable.
Temporary menus and actual modal dialogs use an opaque panel and a quiet
perimeter; docked and inline inspectors belong visually to the page. Radii
between 4px and 7px are for editing controls and temporary windows.
Use the system sans stack for interface text and a monospace face for times,
coordinates, magnitudes, percentages, and other measured values. Do not add
blur, glow, starfields, decorative gradients, or translucent panels. The owner
approved a data gradient specifically for time sliders: warm sunset/sunrise,
civil/nautical/astronomical twilight and night, using the shared Sun altitude.
This encodes the active site's actual times, with accompanying phase text.

| Role | Color |
| --- | --- |
| Page and chart | `#0B1115` |
| Panel | `#10181B` |
| Raised surface | `#152027` |
| Border | `#293840` |
| Soft border | `#1E2B31` |
| Main text | `#E7ECE8` |
| Muted text | `#9CAEB1` |
| Action and selected | `#F9C85D` |
| Good | `#5BC68D` |
| Warning | `#E8A948` |
| Blocked | `#C45B52` |
| Chart grid | `#304049` |
| Secondary line | `#73B6DB` |

Keep these semantic roles in `web/themes.css`, and the
canvas adapters. Data-driven colors such as catalog type colors remain data, not
interface theme tokens.

## Web shell

The browser planner uses Tonight, Catalog, Sky View and Horizon. Keep Site,
Rig, date and minimum altitude visible; setup and advanced options use the
hamburger menu. Respect stored edge-space preferences. Use a compact brand/action
row, then readable groups for observing setup and planned night/time. Groups wrap
without shrinking text; the selected clock stays visible on phones. Use 14–16px
gutters and a roughly 40px tab row. The phone header scrolls with the page.
Site and Rig words are open settings buttons beside independent active-record
selectors. They turn brass yellow on hover/keyboard focus. Site opens the active
site editor; Rig opens the active rig editor, or Rigs setup when none is selected.

The local exposure catalog has its own design document in Nightseam-catalog.

## Screen hierarchy

- **Tonight:** one compact night brief, then a dense
  ranked table. Target altitude graphs belong in the full target inspector;
  do not repeat them in a Tonight overview. Use the common top-bar time control;
  do not duplicate it between the brief and ranking.
  Keep five overview columns: rank, target, relative score, maximum altitude and
  best usable interval. Visibility explanations remain in target details.
- **Catalog:** a narrow filter rail, a dense results table, and one selected-target
  inspector shared with Tonight and Sky View. Keep live altitude, visibility,
  and best-window facts in the primary columns; put provenance and secondary
  catalog fields behind disclosure. Show 50 rows per page, in a named scrollable
  table that fills the available desktop height. Object types use a complete open
  checkbox list: checked types are combined; none checked means all types.
  Avoid duplicate type-category shortcuts and explain these selection rules.
  Selected-time status names the actual condition, rather than calling the
  beginning of a best usable interval an object's rise time.
  Fetch optional source details when that disclosure opens. Show a quiet loading
  message or a reachable Retry action inside it; keep planning usable. Elevation
  entry states its metadata-only role rather than implying a visibility correction.
- **Sky View:** give the polar chart most of the width. Keep the time rail above
  it; date editing stays in the common top bar. Stack the twilight legend on
  the left of the wider slider, with Now/Reset on the right, avoiding a second
  help/legend row. On phones the slider spans the full width above the compact
  legend and actions. Both time sliders use the same site/time gradient. Give the large slider range endpoints,
  phase text and a quiet color legend. Show actual polar/daylight conditions
  instead of inventing a dark band for a fallback window. Start the right rail
  with a closed-by-default chart controls/legend tray,
  followed by the shared full target inspector. Do not repeat a visible-now list.
  Use one altitude chart and one set of target facts. The inspector is inline
  and complementary at every width; on phones the rail stacks below the map.
  Closing it preserves the selected target with a small reopen action.
- **Horizon:** fit the panorama at its source aspect ratio, or its angular working
  aspect after explicit conversion. Keep a readable
  profile, honest calibration summary, settings, and Save/Undo/Redo in the first
  viewport where practical. Profile bins use the shared world-azimuth geometry.
  Display the retained photo region after cropping, without changing original
  photo bytes. Keep paint/crop/history controls in a bounded sticky toolbar above
  the image and zoom controls on the image. Draw adaptive edge rulers, degree
  labels and brush outlines in CSS pixels under DPR scaling; image geometry
  remains in angular coordinates. Quieter grid/opacity controls belong in the
  closed Display disclosure. Preserve view/tool state on same-panorama rerenders.
  Newly imported photos enter Confirm geometry → Align or check → Review →
  Draw skyline → Save. Alignment points have a true bearing and altitude angle.
  Confirmed known geometry can be checked without mandatory fitting points.
  Preview before applying a complete fit; offer a separate optional check and a
  clearly approximate route. Existing records open directly with a review action;
  separate legacy references remain under Advanced setup, which can review but
  never re-apply linear geometry to a converted photo.
  Optional Photo geometry / leveling shows detected metadata or requests known
  source parameters, previews corrected pixels and requires explicit Apply before
  drawing. Original bytes and original-pixel references remain authoritative;
  crops affect the working view. Never reinterpret existing painted records.
  Keep extra fitting/check points in a closed optional disclosure. Show each fit
  residual, explicit exclusions, worst held-out errors and poor-spread warnings.
  Promoting a check removes its independent-check claim after validation.
  Rulers occupy gutters outside the photo, preserving its pixel rectangle and
  pointer transform. Default to tracing for obstacles, offer nearby undoable
  selected-point removal, and collapse profile/specialist editing controls while
  preserving the user's disclosure state.
  Use known true-bearing and measured altitude references, with clickable photo
  points and keyboard-accessible percentage alternatives. Keep exact angle/fine
  adjustment controls behind disclosure. State assumed, approximate or checked
  references in text; “checked” means separate references agree within the saved
  policy (1° directional error for physical orientation, historical per-axis
  limits for legacy fits), not a precision guarantee. Unsupported projections
  remain approximate. Show unknown coverage in text separately from whether the
  chosen policy permits planning it.
  Reserve cursor-readout space so pointer movement cannot shift the image.
  Optional measurement source, angular error, time, group and exclusion reason
  belong in a closed Advanced evidence disclosure. Optional observing position,
  optical height and capture date also stay behind disclosure. The coverage
  assumption is the exception: "Sky outside the photo" stays visible in photo
  setup, defaults to open sky above the skyline for converted photos and
  explains the current choice in one line.
  Retain saved/imported metadata; ordinary setup must not require these fields.
  Offer Brush / eraser and Trace skyline as named authoring tools with a plain
  active-tool explanation. Put exact point controls in the settings rail, keep
  the image available, and draw selected points and adaptive markers in CSS
  pixels. Traces fill only between explicit endpoints and preserve later brush
  corrections. Sky openings/overhangs retain their separate band workflow.
  Explain precise-bin replacement next to the advanced action.
  An unconnected first point is explicitly an unsaved draft, leaving the existing
  horizon intact. Give plain feedback for discarded drafts and rejected additions.
  On phones, cap the sticky toolbar at 40% of viewport height (at most 240px),
  with internal scrolling so actions remain reachable without covering zoom.

Across Tonight, Catalog, and Sky View, keep one selected target and one inspector.
Keep tables native: rows and cells expose table semantics, with named target
buttons inside cells. Sort headers use real buttons and expose their direction
through aria-sort; Catalog also provides Type sorting and a Reverse control.
Preserve filter/constellation/sort focus and search selection ranges when results
rerender. Pointer row selection remains convenient without giving rows button roles.
Selection remains `S.skyTime`/`S.detailId`; inspector visibility is explicit
(`S.detailOpen`) and never inferred from the selected target. Use the live catalog, planner tracks and
stored panorama profiles; never substitute illustrative screenshot values for
application data.

## Interaction and responsive behavior

Preserve keyboard operation, visible focus, reduced-motion preferences, labels
for controls, chart summaries for assistive technology, and non-color status
labels. Both time sliders use one-minute steps and stay synchronized across views.
Selected-time text responds immediately; Sky and target graphs paint the latest
selection once per animation frame. Advanced catalog mode,
moon-aware ranking, timezone controls, and equipment filters stay in the menu.
Filter help explains the conditional effect on Moon-aware ranking and its global
OIII-over-Hα-over-broadband assumption. NB/BB advice must identify the actual
recommended filter, even when warning about missing equipment.
Primary actions use brass text; secondary actions use neutral text on the shared
surface. Underlines, focus rings and quiet state indicators provide feedback.

Options and Weather expose expanded state and their controlled regions; Escape
returns focus to their trigger. Modal dialogs isolate background controls and
wrap Tab through actual reachable controls, excluding closed disclosure content.
Wide inspectors remain complementary regions. Planner and Setup tabs support
arrow/Home/End navigation without triggering global time shortcuts. Dense tables
scroll inside named keyboard-accessible regions instead of truncating headings.

At 1240×900 and 900×800, controls and primary screen regions remain usable.
Web layouts must work at
640px and 360px without horizontal page overflow. Use scrolling inside dense
table regions where needed. Keep controls reachable when rails stack, and do
not scale charts below a size that makes their labels unclear.

On wide screens, the complete Horizon tools rail sticks and scrolls within the
viewport. Never stick the photo/list section independently over the paint/history
controls. Narrow layouts return to normal page flow. Long panoramas grow the body
so the sticky common header remains visible throughout the editor.
Precise horizon values remain a closed optional disclosure with direction/height
labels and plain explanations of confidence, read-only comparison, and the
replacement of painted strokes when applying numbers. History restores matching
mode labels and values as well as the actual horizon data.


## Public website — approved October 6, 2026

The public pages share Workbench roles from /astro/themes.css. The approved
Home direction uses a decorative polar-map motif behind concise text. This
user-approved exception is limited to the public title/hero region: fine map
geometry and a horizon contour, subdued beneath readable text. It is not a
calculated sky, a product screenshot or a planner theme change. Keep the base
opaque and flat; no photographic starfield, glow, blur or gradients.

Use a compact plain wordmark, open typography and quiet separators. Every public
page has a compact brass Open planner action aligned with the wordmark and desktop
navigation. On phones it stays visible beside the native menu, including when the
menu is closed. Home and Features retain their hero action. Panorama setup and
calculated target visibility lead. Detailed
features, first-night guidance, sources and privacy information remain accessible through native disclosures.
Changes contains the independent public release ledger starting at 0.1.0. No-JavaScript phone
navigation uses a labeled native disclosure. Do not reintroduce screenshot-heavy
feature grids or visible setup guides; the user superseded those initial Phase 3
ideas with the approved sparse design.
