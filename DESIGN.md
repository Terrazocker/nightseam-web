# NightSeam Design Guide — Workbench

Workbench is the only planner design language. Desktop and web share its visual
roles and information hierarchy; no theme picker or alternate presentation is
shipped. Legacy theme values (`dome`, `classic`, empty, or unknown) normalize to
`workbench` when settings or backups load. `app/theme.py` remains the desktop
compatibility boundary, and `viztheme.js` remains the canvas palette adapter.

## Visual language

Use opaque surfaces and clear 1px separators. Keep radii between 4px and 7px.
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

Keep these semantic roles in `static/themes.css`, `web/themes.css`, and the
canvas adapters. Data-driven colors such as catalog type colors remain data, not
interface theme tokens.

## Shared shell

The desktop shell described here is the legacy/source-run planner. The standard
packaged desktop executable is Image Catalog-only and does not show planner
chrome or initialize planner views. It retains the nested Library, Import
Exposures, and fixed archive Sky Map views.

The planner header is about 48px high and the primary tab row about 40px. Content
begins near y=100 with 14–16px gutters. Keep Site, Rig, date, and minimum
altitude available in the planner chrome; place setup and advanced options in
the hamburger menu. Do not let optional controls push the common controls out of
one row at desktop widths. Use the stored edge-space preference without
overwriting it on load.

Legacy/source desktop planner tabs are Tonight, Catalog, Sky View, Horizon, and
Image Catalog. The web planner has the first four. Image Catalog keeps Library,
Import Exposures, and Sky Map as nested views, with Library as the default; the
packaged desktop executable launches directly into those nested views.

## Screen hierarchy

- **Tonight:** one compact night brief, a large altitude overview tied to the
  selected time, scrub controls directly below it, then a dense ranked table.
  The selected target uses brass; the chart uses the live plan and active
  panorama.
- **Catalog:** a narrow filter rail, a dense results table, and one selected-target
  inspector shared with Tonight and Sky View. Keep live altitude, visibility,
  and best-window facts in the primary columns; put provenance and secondary
  catalog fields behind disclosure.
- **Sky View:** give the polar chart most of the width. Keep the time rail below
  it, chart controls in a closed-by-default tray, and a right rail for selected
  target facts, its altitude chart, and the objects visible now.
- **Horizon:** fit the panorama at its source aspect ratio. Keep a readable
  profile, honest calibration summary, settings, and Save/Undo/Redo in the first
  viewport where practical. Profile bins use the shared world-azimuth geometry.
- **Image Catalog:** keep an object rail, session workspace, and selected-session
  rail. Lead with measured session rollups and frame groups; put the generic
  all-object table behind disclosure.

Across Tonight, Catalog, and Sky View, keep one selected target and one inspector.
Desktop selection remains `S.tIdx`/`S.currentId`; web selection remains
`S.skyTime`/`S.detailId`. Use the live catalog, planner tracks, FITS groupings, and
stored panorama profiles; never substitute illustrative screenshot values for
application data.

## Interaction and responsive behavior

Preserve keyboard operation, visible focus, reduced-motion preferences, labels
for controls, chart summaries for assistive technology, and non-color status
labels. Scrubbing stays synchronized across views. Advanced catalog mode,
moon-aware ranking, timezone controls, and equipment filters stay in the menu.
Primary actions use brass; secondary actions use neutral raised surfaces.

At 1240×900 and 900×800, controls and primary screen regions remain usable.
Web layouts must work at 640px and 360px without horizontal page overflow; use
scrolling inside dense table regions where needed. Keep the controls reachable
when rails stack, and do not scale charts below a size that makes their labels
unclear.

## Implementation boundaries

Both shells share astronomy, planning, visibility, scoring, horizon geometry,
and panorama history through `core/`. UI modules may format and arrange those
results but must not add a second calculation path. Keep storage paths safe,
backups staged before writes, and panorama strokes/profile precedence intact.
Edit authored source modules and rebuild generated core trees with
`scripts/build_core.py`; never hand-edit generated core files.
