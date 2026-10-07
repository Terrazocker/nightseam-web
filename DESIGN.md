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
blur, glow, starfields, decorative gradients, or translucent panels.

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

The local exposure catalog has its own design document in Nightseam-catalog.

## Screen hierarchy

- **Tonight:** one compact night brief, selected-time controls, then a dense
  ranked table. Target altitude graphs belong in the full target inspector;
  do not repeat them in a Tonight overview.
- **Catalog:** a narrow filter rail, a dense results table, and one selected-target
  inspector shared with Tonight and Sky View. Keep live altitude, visibility,
  and best-window facts in the primary columns; put provenance and secondary
  catalog fields behind disclosure. The object-type filter shows every option
  at full height, without a nested scrolling list.
  Fetch optional source details when that disclosure opens. Show a quiet loading
  message or a reachable Retry action inside it; keep planning usable. Elevation
  entry states its metadata-only role rather than implying a visibility correction.
- **Sky View:** give the polar chart most of the width. Keep the time rail below
  it. Start the right rail with a closed-by-default chart controls/legend tray,
  followed by the shared full target inspector and a separate visible-now list.
  Use one altitude chart and one set of target facts. The inspector is inline
  and complementary at every width; on phones the rail stacks below the map.
  Closing it preserves the selected target with a small reopen action.
- **Horizon:** fit the panorama at its source aspect ratio. Keep a readable
  profile, honest calibration summary, settings, and Save/Undo/Redo in the first
  viewport where practical. Profile bins use the shared world-azimuth geometry.
  Do not show calibration provenance entry fields; retain saved/imported metadata.
Across Tonight, Catalog, and Sky View, keep one selected target and one inspector.
Selection remains `S.skyTime`/`S.detailId`; inspector visibility is explicit
(`S.detailOpen`) and never inferred from the selected target. Use the live catalog, planner tracks and
stored panorama profiles; never substitute illustrative screenshot values for
application data.

## Interaction and responsive behavior

Preserve keyboard operation, visible focus, reduced-motion preferences, labels
for controls, chart summaries for assistive technology, and non-color status
labels. Scrubbing stays synchronized across views. Advanced catalog mode,
moon-aware ranking, timezone controls, and equipment filters stay in the menu.
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


## Public website — approved October 6, 2026

The public pages share Workbench roles from /astro/themes.css. The approved
Home direction uses a decorative polar-map motif behind concise text. This
user-approved exception is limited to the public title/hero region: fine map
geometry and a horizon contour, subdued beneath readable text. It is not a
calculated sky, a product screenshot or a planner theme change. Keep the base
opaque and flat; no photographic starfield, glow, blur or gradients.

Use a compact plain wordmark, open typography, quiet separators and one primary
Home action. Panorama setup and calculated target visibility lead. Detailed
features, first-night guidance, sources and privacy information remain accessible through native disclosures.
Changes contains the independent public release ledger starting at 0.1.0. No-JavaScript phone
navigation uses a labeled native disclosure. Do not reintroduce screenshot-heavy
feature grids or visible setup guides; the user superseded those initial Phase 3
ideas with the approved sparse design.
