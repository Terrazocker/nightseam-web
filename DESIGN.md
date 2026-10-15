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
- **Horizon:** the job is "where is my sky blocked"; keep the editor to that.
  Three rails: the horizon list with *Draw by hand* (primary) and *Import
  file*; the stage; and a settings rail with closed *Points by numbers*,
  *Phone compass* and *Display* disclosures. Keep about 20 controls visible
  at first glance and about 40 including the disclosures. There are no
  horizon photos: a dropped photo gets a one-line explanation, a dropped
  horizon file imports.
  - The stage is one compass grid (azimuth across, altitude up, N/E/S/W on the
    ruler, the minimum altitude as a dashed line).
    The skyline is a line with a shaded obstruction below it, never colour
    alone: a text summary names the highest and lowest obstruction and their
    directions.
  - A sticky toolbar holds Draw / Overhang, Undo, Redo, Clear and
    the save status; zoom controls sit on the canvas. On phones cap the toolbar at 40%
    of the viewport height (at most 240px) with internal scrolling.
  - Draw: click adds a point, dragging a point moves it between its
    neighbours, dragging across the grid sketches and replaces that stretch,
    Delete removes the selected point. Keyboard: arrows select and move points;
    the points form adds them by numbers.
  - Overhang: drag along the underside of a balcony, roof or branch; the sky
    above that edge is shaded as blocked, with a dashed edge so it reads apart
    from the skyline. Points drag, arrow keys and Delete work as in Draw; the
    points form adds a flat overhang.
  - Phone compass: Start, a live direction readout, *Add point here*, *Start
    / Finish tracing* and a landmark correction. Say plainly that phone
    compasses are rough and that a correction comes first.
  - Edits save at once and the status says "Saved"; a failed save says so and
    keeps the edit. Clear and Delete confirm in-page.

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

On wide screens, the complete Horizon list rail sticks and scrolls within the
viewport. Never stick its card independently over the editing toolbar. Narrow
layouts return to normal page flow, with the list above the editor.


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
menu is closed. Home and Features retain their hero action. Your own skyline
and calculated target visibility lead. Detailed
features, first-night guidance, sources and privacy information remain accessible through native disclosures.
Changes contains the independent public release ledger starting at 0.1.0. No-JavaScript phone
navigation uses a labeled native disclosure. Do not reintroduce screenshot-heavy
feature grids or visible setup guides; the user superseded those initial Phase 3
ideas with the approved sparse design.
