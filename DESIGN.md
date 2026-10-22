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

**Night vision** (owner-approved October 20, 2026) is not a theme: it is a
display filter over Workbench for use at the telescope. A header toggle maps
every pixel, charts and photos included, to its brightness in red only
(`html.night-red`, an SVG colour matrix on the root element), so the observer's
eyes stay dark-adapted. The choice belongs to the device, is stored in
`localStorage` (`nightseam_night_red`), is applied before the first paint by
`web/nightmode.js`, and is not part of backups.

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

The browser planner uses Tonight, Catalog, Sky View and Horizon. On wide
screens keep Site, Rig, date and minimum altitude visible in the top bar; setup
and advanced options use the hamburger menu. Respect stored edge-space
preferences. Use a compact brand/action row, then readable groups for observing
setup and planned night/time. Groups wrap as whole groups without shrinking
text, never squeezed into two rows each. The time slider, the control used
most, takes the free width of its row (about 140–520px); the moon/dark summary
stays on one line. Use 14–16px gutters and a roughly 40px tab row. Short views
keep the footer at the bottom of the window.
Site and Rig words are open settings buttons beside independent active-record
selectors. They turn brass yellow on hover/keyboard focus. Site opens the active
site editor; Rig opens the active rig editor, or Rigs setup when none is selected.
The header's eye button switches night vision on and off.
The menu starts with *Data → Setup* (sites, rigs, targets, backups), then display and
advanced options; on phones menus end above the bottom bars.

## Phone layout — approved October 20, 2026

Phones get a layout of their own, not the desktop one stacked. It applies up to
640px wide, and to touch screens held sideways (at most 500px high and 1000px
wide). The rules follow the platform guidelines (Apple HIG, Material, WCAG 2.2):
the answer comes first, the most-used controls sit where the thumb reaches.

- **Header.** The brand row (night vision, weather, menu), then one full-width
  summary line: "Berlin · min 25° · Tue, 20 Oct" (site, rig when one is set,
  minimum altitude, night). It opens the *Observing setup* sheet from the
  bottom, which holds the very same Site, Rig, minimum altitude and date
  controls plus the moon/dark summary; *Done*, Escape or a tap outside closes
  it. Sideways, the summary sits beside the brand. The header scrolls away.
- **Navigation.** The four views are a bottom tab bar (icon and label, about
  58px, safe-area aware). Above it a pinned time slider keeps the selected time
  in reach on every view except Horizon, which does not use it.
- **Lists.** Tonight shows rank and target; under the name, the best usable
  interval with its maximum altitude. Catalog shows rank, save star and name,
  with designation, type, current altitude and best window underneath. Neither
  scrolls sideways. Catalog filters sit behind a *Filters* button that counts
  the active ones; sorting is in *More filters*.
- **Sky View.** The map's own slider gives way to the pinned one; the rail
  keeps the selected time and phase, the legend, *Now*, *Reset view* and the
  zoom buttons. The map pinch-zooms with two fingers; one finger scrolls the
  page until the map is zoomed, then pans it.
- **Details and dialogs.** Target details and dialogs open as a sheet from the
  bottom, with their head (name, save star, close) pinned while the body
  scrolls.
- **Horizon.** On touch devices *Capture with phone* leads the empty state and
  starts a new horizon straight in the camera view; editor hints name taps,
  not clicks, wheels or keys.
- **Sizes.** Every control is at least 44px in both directions, form fields
  use 16px text (smaller makes iOS zoom the page on focus), no text is below
  12px, and a page never scrolls sideways. Touch screens of any width
  (tablets) get the same control and form-text sizes.

The planner is installable: `web/manifest.json` (standalone, Workbench colours),
192 and 512px icons in plain and maskable versions (drawn by
`scripts/make_app_icons.py`) and a `theme-color`. After one visit it reopens
without a network (`web/sw.js`; DECISIONS.md 2026-10-20, "Offline reopening").

The local exposure catalog has its own design document in Nightseam-catalog.

## Screen hierarchy

- **Tonight:** one compact night brief, then a dense
  ranked table. Target altitude graphs belong in the full target inspector;
  do not repeat them in a Tonight overview. Use the common top-bar time control;
  do not duplicate it between the brief and ranking.
  Keep five overview columns: rank, target, relative score, maximum altitude and
  best usable interval (phones: see Phone layout). From 1600px, with no
  inspector open, the night brief becomes a column beside the list, so the
  list starts at the top of the page. The list heading says how
  many of the night's usable targets it shows ("Top 16 of N") and links to
  Catalog for the rest. On wide screens the brief and list keep a reading
  width of 1080px, so a target's numbers stay near its name. Visibility
  explanations remain in target details.
- **Catalog:** a narrow filter rail (on phones, and on touch screens up to
  900px, it folds behind a *Filters* button that counts the active filters),
  a dense results table, and one selected-target
  inspector shared with Tonight and Sky View. Keep live altitude, visibility,
  and best-window facts in the primary columns; put provenance and secondary
  catalog fields behind disclosure. Show 50 rows per page, in a named scrollable
  table that fills the available desktop height. Object types use a complete open
  checkbox list: checked types are combined; none checked means all types.
  Avoid duplicate type-category shortcuts and explain these selection rules.
  Selected-time status names the actual condition, rather than calling the
  beginning of a best usable interval an object's rise time; outside the dark
  window it says *Before dark* or *After dark*, on one line.
  Fetch optional source details when that disclosure opens. Show a quiet loading
  message or a reachable Retry action inside it; keep planning usable. Elevation
  entry states its metadata-only role rather than implying a visibility correction.
- **Sky View:** give the polar chart most of the width. Keep the time rail above
  it; date editing stays in the common top bar. Stack the twilight legend on
  the left of the wider slider, with Now/Reset on the right, avoiding a second
  help/legend row. Zoom buttons (− +) follow Now and Reset view, so the map
  zooms without a mouse wheel; on phones see Phone layout. Target labels never
  cover the minimum-altitude label, the Sun, the Moon or a labelled target's
  dot; a label that finds no free place is left out until the map is zoomed. Both time sliders use the same site/time gradient. Give the large slider range endpoints,
  phase text and a quiet color legend. Show actual polar/daylight conditions
  instead of inventing a dark band for a fallback window. Start the right rail
  with a closed-by-default chart controls/legend tray,
  followed by the shared full target inspector. Without an open target the
  rail answers "what can I look at now": *At 22:07* names where the Moon is,
  how many plotted targets are usable at that time, and the six highest of
  them by altitude (a measured value; popularity plays no part), each opening
  its details (owner-approved October 20, 2026, superseding "do not repeat a
  visible-now list").
  Use one altitude chart and one set of target facts. The inspector is inline
  and complementary at every width; on phones the rail stacks below the map.
  Closing it preserves the selected target with a small reopen action.
- **Horizon:** the job is "where is my sky blocked"; keep the editor to that.
  Three rails: the horizon list with *Draw by hand* (primary) and *Import
  file* (on touch devices *Capture with phone* comes first and is primary); the stage; and a settings rail with closed *Points by numbers*,
  *Phone capture* and *Display* disclosures (*Phone capture* starts open on
  touch devices). With no horizon yet, the empty stage repeats the start
  actions as its call to action. Keep about 20 controls visible
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
  - Phone capture: one button opens a full-screen camera view laid out
    mobile first, for one hand on a phone held upright:
    - An opaque bar above the camera: *✕ Done* on the left and the
      crosshair's direction in large monospace digits on one line, always
      with one decimal and padded so digits do not jump (*152.0° SSE · alt
      -12.3°*), changing at most every 120 ms (or, before there is one, what
      the capture waits for); below them a full-width north button
      saying where north comes from in a few words (*North: compass, ±3°*,
      *North: the Moon*), which opens the north panel; then a site warning
      in the warning colour when the phone is far from the site, and the
      status line.
    - The camera fills the middle with the crosshair at its centre. Over the
      video, what is recorded is drawn where it belongs, as lines only so the
      scene stays visible: the dashed level horizon with N/E/S/W marks, the
      skyline, overhang edges dashed, the recorded points as small dots on
      them, and the trace in progress in the warning colour.
    - An opaque bar below: the overview strip of the whole circle; a row
      with *Skyline / Overhang* as one segmented control and, where the
      camera allows manual exposure, a *Sharper motion* toggle; and the thumb
      row: *Undo*, the large brass *Start tracing / Stop tracing* toggle in
      the middle, *Add point*.
    - Every control is at least 44 px (48 px for buttons, 64 px for the
      trace toggle). The bars stay within 35% and 45% of the screen and
      never cover the crosshair: it is what the user aims with. On short
      screens (a phone held sideways) the strip is dropped.
    - The north panel (*Moon is in the cross*, disabled with the reason
      when below 2 deg or above 60 deg; a bearing field with *Landmark is in
      the cross*;
      *Compass again*; *Close*) and the full-turn question (*Yes, close the
      loop* / *No, keep as traced*) take the place of the strip and the
      controls; nothing else can be pressed while the question waits. The
      north panel also gives the full account of north: which reference and
      when, how far the compass was off, and while the compass settles, that
      the phone should be held still. Below *Compass again / Close*, a
      closed *Details* disclosure holds the diagnostics: a monospace line on
      what the compass itself is doing (readings a second, settling,
      restarts), so a user can report why north is missing; a second one on
      what the overlay assumes about the camera (delay, field of view,
      measured or starting values); *Line up the drawing*; and *Reset
      camera values*.
    - The calibration routine (*Line up the drawing*) takes the place of the
      controls like the other panels: one numbered instruction (*Step 1 of
      3: …*) in plain words (a pole or roof corner, the amber line) and a
      pair of buttons (*Start* or *It's on the line* first, then *Not now*,
      *Cancel* or *Skip*). Its
      guide line is drawn over the video in the warning colour with a dark
      outline, left of the cross and then above it. It is offered once, when
      a phone's first capture shows a camera image, and never blocks
      tracing for more than one tap.
    - Messages are short: one line where possible, the fact first, then
      what to do (*Compass settling (moved 2.1°): hold still.*). Detail that
      only helps a report goes behind *Details*, not into the status line.
    - While tracing, turning faster than 30 deg/s turns the crosshair and
      the status line to the warning colour and the status says *Too fast
      (38°/s): turn slower.*; below 20 deg/s it returns to the tracing
      message. Where the browser can vibrate, starting and stopping a trace,
      adding a point and the too-fast hint each give a short, distinct
      vibration, so the eyes can stay on the crosshair; the hint vibrates
      only the first time in a trace.
    - The view opens with focus on *Start tracing*, or on *Done* while
      tracing is not possible yet; Escape and *Done* close it and return
      focus to the button.
  - Share link: beside *Export file* in the editor head. On phones it opens
    the system share sheet; elsewhere it copies the link or shows it to copy.
    Opening a link asks in-page before adding the horizon and says what it
    holds; it never adds silently.
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
Wide inspectors remain complementary regions. The docked inspector is
340–420px wide (26% of the window) on Tonight and Sky View; its photo sits
above the facts so values never break inside a word. Planner and Setup tabs support
arrow/Home/End navigation without triggering global time shortcuts. Dense tables
scroll inside named keyboard-accessible regions instead of truncating headings.

At 1240×900 and 900×800, controls and primary screen regions remain usable.
Web layouts must work at
640px and 360px without horizontal page overflow (phones: Phone layout). Use scrolling inside dense
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
menu is closed. On phones the headline starts near the top; the map motif sits
higher and fainter so it does not push the call to action down. Home and Features retain their hero action. Your own skyline
and calculated target visibility lead. Detailed
features, first-night guidance, sources and privacy information remain accessible through native disclosures.
Changes contains the independent public release ledger starting at 0.1.0. No-JavaScript phone
navigation uses a labeled native disclosure. Do not reintroduce screenshot-heavy
feature grids or visible setup guides; the user superseded those initial Phase 3
ideas with the approved sparse design.
