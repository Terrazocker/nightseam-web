# Visual lane - the screenshots, actually interpreted

This file closes the gap that `50-ui-ux.md` declared: that lane could measure but
not *see*, because the captain's model route declared no image input. The review
found that a vision-capable route was already configured, so the 18 screenshots
were read by three vision-routed agents and this is what they found.

**Method.** Three agents on `provider: commandcode`, `model:
deepseek/deepseek-v4-flash-vision-exp` (`settings.yaml:202-212` declares
`input: [text, image]`; the session default `deepseek/deepseek-v4.1-flash`,
`settings.yaml:517-519`, declares no `input:` block at all - which is why
`read_image` refused for the captain). Each agent read a disjoint set with
`read_image` and reported what it saw, judging against `DESIGN.md` and the
night-use context:

| set | images |
|---|---|
| compact widths (phone/tablet) | dome + classic Tonight at 320, 360, 768 (6) |
| desktop widths | dome + classic Tonight at 900, 1280, 1366, 1920 (8) |
| horizon / panorama editor | dome + classic Horizon at 360 and 1366 (4) |

All 18 were read. 87 observations came back, 62 flagged as defects and 25 as
explicitly not-defects (taste, or checked-and-fine). Everything below cites the
image it came from. **Read-only**: nothing was modified.

**Scope limit - this still does not cover the whole UI.** Only the **Tonight**
and **Horizon & Obstacles** tabs were ever captured. There is **no screenshot of
Sky View (the polar chart) or of the Targets catalogue table** at any width, so
their rendered appearance remains unreviewed; the vision agents correctly
reported that the chart-legibility part of the brief "cannot be judged from this
set". No empty-state, error-state, first-run or daytime screenshot exists either.

## Headline confirmations

- **`UI-01` confirmed visually, and its impact is worse than measured.** The
  classic captures are **548 px wide at BOTH 320 and 360 viewports**
  (`web-classic-tonight-320.png`, `web-classic-tonight-360.png`; dome at the same
  widths is 327/360). What sits in the off-screen band is not decoration: the
  **weather chip and the hamburger button** (~x=380-540) and the fourth tab
  **"Horizon & Obstacles"** (~x=450-525). At every phone width the classic user
  therefore **cannot reach the hamburger menu at all** - no Appearance, Display,
  Advanced, Data or About - and sees only three of the four tabs. My original
  finding said the "night/moon information and right-hand controls" were
  off-screen; the menu being unreachable is the stronger and correct statement.
- **`UI-02` corroborated independently.** The desktop-width agent picked the dome
  theme's secondary text as "the smallest and dimmest text on the page"
  (`web-dome-tonight-1280.png`), and named the classic equivalent "a shade
  brighter" - matching my computed 4.28:1 (dome) vs 6.59:1 (classic).
- **`UI-03` confirmed**: dome at 320 is 327 px wide for a 320 viewport, the right
  gutter and card corners are cut (`web-dome-tonight-320.png`).
- **`UI-04` context**: the dome active tab is a purple pill with dark text, legible
  (`web-dome-tonight-900.png`) - consistent with my hand-computed 4.42-5.94:1.

## New findings promoted to `findings.json`

### `UI-05` medium - the classic theme renders the panorama editor's primary inputs as native WHITE boxes on a dark panel

- file:line: `web/horizon.js:507` (`#pano-name`), `web/horizon.js:617`
  (`#ed-mode`), against `web/themes.css:194-196` and `web/style.css:427,516`
- impact: in the classic theme the editor's **Name** field and **PAINT** select
  are bright white rectangles with dark text on the dark navy panel - the
  brightest objects on the page. The app is used dark-adapted beside a telescope,
  so this is a glare source exactly where the user is working, and it is a
  same-width inconsistency: at 1366 the dome shot has both controls dark with
  light text. Measured at both widths: `web-classic-horizon-1366.png` (Name
  x~106-221, PAINT x~57-256, white fill) and `web-classic-horizon-360.png`.
- mechanism: `web/themes.css:194-196` is a **broad** dome-only rule
  (`html[data-theme="dome"] input:not([type="range"]):not([type="checkbox"]),
  html[data-theme="dome"] select { ... }`). The base stylesheet only styles text
  inputs and selects through narrow class-scoped selectors - `.btnrow
  input[type="text"]` (`web/style.css:427`), `.top-prefs` (`:516`),
  `.cat-bar input[type="search"]` (`:288`), `.planner-controls select` (`:47-51`).
  `#pano-name` and `#ed-mode` match none of them, so classic falls through to the
  user-agent's default form styling while dome is rescued by its broad rule.
- evidence: three vision agents, independently: "the classic theme's NATIVE WHITE
  text input and paint-mode select ... a bright glare source at night" (horizon
  set) and "bright WHITE box with dark text ... unstyled browser controls rather
  than themed inputs" (`web-classic-horizon-360.png`); dome at the same
  coordinates is dark (`web-dome-horizon-1366.png`).
- repro: switch to Classic, open Horizon & Obstacles, look at the Name field and
  the PAINT select.
- requiredFix: add the missing controls to the base (classic) rules, e.g.
  `#pano-name, #ed-mode { background: var(--panel); border: 1px solid var(--line);
  color: var(--txt); }` in `web/style.css`, or move dome's broad
  `input:not([type=range]):not([type=checkbox]), select` rule into the base
  stylesheet and let dome keep only overrides. `style.css?v=21` must be bumped.
- counterArgument: the classic theme is documented as "a flat fallback, not a
  second design language", so an argument exists that it is allowed to look
  plainer. But a fallback that emits an unthemed white control is not "plain", it
  is unstyled, and the same two controls are correct in the default theme.

### `UI-06` low - the panorama editor's legend promises a green horizon guide that is not drawn, and keys none of the painted state

- file:line: `web/horizon.js` legend text vs the canvas; guides drawn per
  `core/horizon.js`
- impact: the legend reads "Guides: amber = azimuth (N/E/S/W), green dashed =
  horizon (alt 0), blue = altitude", but **no green pixels exist** on the canvas
  in either theme or width; the alt-0 position coincides with the plot's bottom
  border and is drawn in the same blue as the frame, so the horizon line is
  indistinguishable from the frame. Separately, the legend explains only the
  *guides*: there is no key for the blocked band colour and none for the
  assumed-open hatch, so a user cannot decode "blocked vs open sky" from the
  editor itself - the one thing the editor exists to express.
- evidence: `web-dome-horizon-1366.png` and `web-classic-horizon-1366.png` - "no
  green pixels present"; legend quoted verbatim.
- repro: open Horizon & Obstacles at 1366 and look for the green dashed alt-0 line.
- requiredFix: either draw the alt-0 guide in the legend's green (distinct from
  the frame), or correct the legend; and add blocked-band + assumed-open hatch
  entries to the key.
- counterArgument: nothing is painted in any of the four screenshots (a blank
  panorama), so the legend's band entries may only appear once a mask exists - I
  could not capture that state. The green-guide mismatch is independent of that,
  and was observed in a clean state.

### `UI-07` low - the editor's zoom cluster is drawn over the chart, covering the top gridline

- file:line: `web/horizon.js:680-683` (the `ed-zoom-out` / `ed-zoom-label` /
  `ed-zoom-in` / `ed-fit` cluster)
- impact: the "− 1.0× + Fit" pill overlays the plot's top-right corner at both
  1366 and 360, crossing the plot border and covering the top gridline and the
  region where the 300 deg guide runs; at 360 the pill spans roughly a third of
  the canvas width, hiding the area a user would paint near 300-360 deg.
- evidence: `web-dome-horizon-1366.png` (pill x~1170-1300, y~836-872; plot top
  border y~840), `web-classic-horizon-1366.png` (same), `web-dome-horizon-360.png`
  (pill covers ~1/3 of a ~330x160 canvas).
- repro: open the editor and look at the canvas's top-right corner.
- requiredFix: move the cluster outside the canvas (above or below it) or reserve
  space so it does not overlap painted area.
- counterArgument: it is a floating control and small at 1366; at 360 it is not
  small. Low because the guides remain usable and nothing is lost permanently.

### `UI-08` low - the Rig select and the Weather chip truncate mid-word at every tested width, including where there is free space

- file:line: `web/index.html:32-34` (`#rigSelect`, `max-width: 170px` at
  `web/style.css:55`, `110px` in dome at `web/themes.css:331`) and
  `web/index.html:55-57` (`#btnWeather` / `#wxChip`)
- impact: the Rig select renders `None — no frame cove` / `None — no frame co` -
  cut mid-word with no ellipsis, so the user never sees "coverage". The Weather
  chip renders `Weather — cl…` at 320, 360, **768**, 900 and 1366, i.e. even with
  the whole toolbar row empty beside it; the condition word (the reason to look at
  the chip) is reduced to two letters at every width.
- evidence: reported in eight separate screenshots across both themes
  (`web-dome-tonight-320/360/768`, `web-classic-tonight-320/360/768`,
  `web-dome-tonight-900`, `web-dome-horizon-360`); "the truncation is a fixed chip
  width, not a lack of room".
- repro: load the planner at any width and read the topbar.
- requiredFix: let both controls size to their content (`max-width` -> a larger
  value or `text-overflow: ellipsis` with a `title`), and check the chip's own
  width rather than the row's.
- counterArgument: both have tooltips (`title=`), so the information is reachable
  on hover - but not on touch, and not at a glance at night. Cut mid-word with no
  ellipsis reads as a rendering fault.

### `UI-09` low - classic at 320 garbles the Min alt row and lets target rows overflow their card

- file:line: the shared topbar markup (`web/index.html:38-43`) under the classic
  stylesheet; target rows `.pick li` (`web/style.css:236`)
- impact: at 320 classic breaks the label into "Min" / "alt" and the value into
  "25°" / "auto (bortle)" on separate lines with the slider pushed aside, while
  **dome at the same 320 renders the identical row on one line**. Classic's target
  rows also run past their section card to the page edge, with the altitude
  values drawn on the card's right border (`web-classic-tonight-320.png`,
  `web-classic-tonight-360.png`), which dome does not do at those widths.
- evidence: two vision agents independently, with coordinates (card right border
  ~x=300, row band to x=548).
- repro: Classic theme at 320 and 360.
- requiredFix: give the min-alt row the same wrap/shrink rules at narrow widths in
  the base stylesheet, and constrain `.pick li` to the card's inline size.
- counterArgument: 320 px is the narrowest phone in use, and classic is the
  fallback theme - but this is the same root cause family as `UI-01` (base
  stylesheet has no narrow-width rules; dome compensates), so fixing `UI-01`
  properly likely fixes this too.

## Observed but NOT promoted to findings (need a code check or are design calls)

- **REFUTED, then CORRECTED (0.6.32 follow-up investigation).** What was recorded
  here as "a single row renders its `transit` value in bright white while every
  other row's is muted" **does not reproduce**, and the code path has no per-row
  condition at all: whether `transit` is bold depends only on **which of the two
  side-by-side cards** rendered the row.
  `web/app.js:745` (Visible at) bolds the CURRENT altitude and leaves
  `transit` muted; `web/app.js:750` (Rising later) bolds `transit` and leaves
  `peaks` muted. Because row *k* of both cards sits on the same y-band, one
  visual band shows a bright `transit` from the right card next to muted ones from
  the left - which is what the vision pass read as "one row differs".
  Measured on the shipped PNGs: `transit` is bright in **8 of 8** right-card rows
  and muted in **8 of 8** left-card rows, in both themes.
  **The real, reproducible defect was a label/weight inconsistency between two
  adjacent sibling panels** - the same `transit HH:MM` sub-line was bold in one
  and muted in the other. Fixed: both cards now bold their own lead number
  (`alt now` / `peaks`) and the shared `transit` line is consistently muted
  (`web/app.js:750`).
  Two adjacent oddities the investigation also surfaced, NOT fixed:
  (a) `transit` is really "the dark-window max-altitude sample, clamped to the
  window edges" (`core/scoring.js:139,146`), so every object peaking before dusk
  prints the same dusk time with no hint that it was clamped - a misleading label;
  (b) `.pick .p-right b { display: block }` plus the row's `align-items: center`
  puts the bold stat ~16 px ABOVE its object's name, which is the most likely
  cause of the visual misattribution in the first place.
- **Dome drops the moon/night status chip at 900 px** while classic keeps it at
  the same width (`web-dome-tonight-900.png` vs `web-classic-tonight-900.png`),
  and it reappears in dome at 1280 - so a small-laptop dome user loses at-a-glance
  status. Likely the same `themes.css:337-342` narrow-width block that hides
  `.nightinfo`; it argues for a deliberate breakpoint rather than a side effect.
- **The dome scrub slider renders as a bare purple thumb with no visible track**
  at 320/768 while classic shows a clear track (`web-dome-tonight-768.png` vs
  `web-classic-tonight-768.png`) - a primary control that does not read as a
  slider in the default theme.
- **The target list has no column headers**, so the largest number in each row
  (the peak-altitude degree) is unlabelled, although the same quantity is labelled
  `68° alt` in the panel below (`web-dome-tonight-900.png`).
- **Density / dead space**: at 1280-1920 each row leaves ~850-1400 px between the
  object name and its statistics, and at 1920 the topbar uses only its left third.
  The desktop agent called classic the more readable theme at night (crisper card
  boundaries, status chip retained, no purple bloom), which is a design judgement
  rather than a defect.
- **Classic target-row/card mismatch** is folded into `UI-09`.
- Explicitly **not** defects (verified fine): the right-hand stat columns align to
  one right edge across the list and both bottom panels; the three summary cards
  are equal thirds on consistent gutters; the type dots and amber "narrowband"
  chips sit cleanly beside the designation pills; the moon glyph does not overlap
  "24%" (the white arrow is the captured cursor); no overflow at 768 in either
  theme; dome at 360 is pixel-clean (360x3562).

## Residual coverage gaps after this pass

- **Sky View (polar chart) and Targets (catalogue table) have no screenshots at
  all** - their visual state is still unreviewed. So is every non-happy state
  (empty setup, load failure, offline, daytime, no-photo).
- The panorama editor was captured **unpainted**, so the blocked-band fill, the
  assumed-open hatch and the painted-stroke rendering were never seen.
- No DPR-2, zoomed, or non-Chrome rendering was captured.
- Desktop-shell screenshots do not exist at all (the gate drives the exe but only
  asserts; it does not keep stills), so the desktop app's visual state is
  unreviewed.
