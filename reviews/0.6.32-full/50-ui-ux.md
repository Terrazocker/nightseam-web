# UI lane - visual, responsive and accessibility behaviour (web/)

Lane owner: captain (this file). Evidence: `evidence/ui_probe.py` ->
`evidence/ui/ui_measurements2.json` (all numbers below), the earlier pass
`evidence/browser_review.py` -> `evidence/ui/ui_measurements.json`, and the
18 screenshots in `evidence/ui/`.

**Method note - this lane measured; the seeing was done separately.** This lane
was built by the captain, whose session model route declared no image input
(`read_image` refuses: `model "deepseek/deepseek-v4.1-flash" does not declare
image input`), so no claim in THIS file rests on looking at a screenshot - every
finding here is a measured number or a cited CSS rule. The screenshots were
interpreted afterwards, by three agents routed to the configured vision model
(`deepseek/deepseek-v4-flash-vision-exp`); their results are in
`55-ui-visual.md`, which also confirms UI-01, UI-02 and UI-03 visually and adds
five findings (UI-05..UI-09) that measurement alone could not see. See "Not
checked" below for what is still unreviewed even after that pass.

Deterministic conditions for both passes: real Chromium (`channel="chrome"`),
`timezone_id="UTC"`, `locale="en-US"`, `color_scheme="dark"`,
`device_scale_factor=1`, `reduced_motion="reduce"`, empty storage, the external
boot fetch stubbed locally, `?v=` tokens as shipped. Widths tested: 320, 360,
400, 480, 600, 640, 641, 720, 760, 768, 860, 900, 1024, 1280, 1366, 1440, 1920 -
i.e. every CSS breakpoint in `web/` (640, 720, 760, 860, 900, 1240) plus its
neighbours.

## What I checked (and how)

1. Horizontal overflow: per width x theme, `documentElement.scrollWidth` vs
   `innerWidth`, plus every element whose rect leaves the viewport (selector
   path, rect, text).
2. WCAG 2.1 contrast of real rendered text: computed `color` composited over the
   nearest painted background, sRGB relative luminance, 4.5:1 (normal) / 3:1
   (large) thresholds. 13 selectors per theme, including two that only exist
   while the hamburger menu is open.
3. Touch-target sizes at 360 px for `button, a, select, input, [role=button]`.
4. Keyboard focus: 14 real `Tab` presses, reading `outline-style`/`-width` of the
   focused element.
5. "Progress never moves the layout" (0.6.31 invariant): 40 ms geometry sampling
   of `.topbar`, `#tabs`, `.cat-stats`, the table top and every `thead th` width,
   across a visibility warm started from the `#cat-minvis` slider.
6. All six `landing/` pages at 360 / 768 / 1366.

## Findings

### UI-01 high CONFIRMED - the classic theme forces a 548 px minimum page width, so the web planner scrolls horizontally on every phone-sized viewport

- file:line: `web/style.css:72` and `web/style.css:74` (cause);
  `web/style.css:31` (why it is not contained); `web/themes.css:341` (why dome
  hides it)
- impact: with the Classic theme selected - one of the two themes offered in the
  hamburger menu (`web/index.html:82-83`) - the page is 548 px wide on any
  viewport up to ~480 px, so the whole page scrolls sideways. **What the vision
  pass saw in the off-screen band is worse than "the night/moon information":
  the weather chip AND the hamburger button sit at x~380-540, and the fourth tab
  "Horizon & Obstacles" at x~450-525.** At every phone width the Classic user
  therefore cannot reach the hamburger menu at all - no Appearance, Display,
  Advanced, Data or About - and sees only three of the four tabs. Every phone in
  portrait is in that range (320/360/375/390/412/430). Measured identical
  docW=548 at 320, 360, 400 and 480; confirmed visually in
  `evidence/ui/web-classic-tonight-320.png` and `-360.png` (both 548 px wide),
  where dome at the same widths is 327/360 (`55-ui-visual.md`).
- mechanism: `.topbar-right` is a flex row with **no `flex-wrap`**
  (`style.css:72`), and one of its children, `.nightinfo`, is
  `white-space: nowrap` (`style.css:74`). Its min-content width is therefore the
  sum of its children (~526 px, measured: `topbar-right` rect `L22 R548 W526`),
  which it cannot shrink below. The parent `.topbar` does wrap
  (`style.css:31`), so the group moves to its own line - and then overflows the
  page instead of the bar. The dome theme masks the same container defect by
  removing the offending child below 900 px
  (`html[data-theme="dome"] .nightinfo { display: none }`, `themes.css:341`),
  which is why dome is clean at 360-480 and classic is not.
- evidence: `python reviews/0.6.32-full/evidence/ui_probe.py`
  (`ui_measurements2.json` -> `overflow.classic`):
  `vw=320 docW=548 n=34 worst=body>.topbar>.topbar-right`;
  `vw=360 docW=548 n=10`; `vw=400 docW=548 n=8`; `vw=480 docW=548 n=8`;
  no overflow at 600 and above. Independently reproduced by the earlier pass
  (`ui_measurements.json` -> `themes.classic`, `vw=320 scrollWidth=548`, `n=24`;
  `vw=360 scrollWidth=548`, `n=10`), and the same pass records
  `topbar-right` text `moon 24% . Waxing Crescent . dark 19:21-02:42` placed at
  `R548`.
- repro: serve `web/`, `localStorage.setItem('nightseam_theme','classic')`,
  viewport 360x900 -> `document.documentElement.scrollWidth === 548`.
- requiredFix: give the group permission to wrap and to shrink -
  `.topbar-right { flex-wrap: wrap; min-width: 0; }` plus letting `.nightinfo`
  wrap or shrink (`white-space: normal` under a narrow-width media query, or
  `min-width: 0; overflow: hidden; text-overflow: ellipsis`). The dome-only
  `display:none` at `themes.css:341` can then be dropped or kept as taste.
  `web/style.css` is a tokenized module (`style.css?v=21`), so the fix must bump
  its `?v=` in the same commit.
- counterArgument: `AGENTS.md` calls Classic "a flat fallback, not a second
  language", so a reviewer could call it out of scope. It is still one of exactly
  two shipped, user-selectable themes and the only alternative to the default, so
  a phone user who picks it gets a broken page; the underlying defect is in the
  BASE stylesheet (`style.css`), which dome merely papers over - any third theme
  or a taller `.topbar-right` child would hit it too. What would make this not a
  bug: if mobile web were explicitly unsupported, but the project's own gate
  tests 360 px (`tests/browser/web_suite.py:550`).

### UI-02 low CONFIRMED - dome's muted text colour `#67749c` is ~4.1-4.3:1 on its own glass surfaces, under the 4.5:1 AA threshold for 12 px text

- file:line: `web/themes.css:103` (`.tagline`),
  `web/themes.css:317` (`.foot p`)
- impact: in the DEFAULT theme, the brand tagline ("night-planning, computed in
  your browser") and the whole footer are rendered at 12 px below AA contrast.
  Low severity - both are secondary text - but it is a measurable accessibility
  miss in the default look, and the equivalent classic text passes (6.59:1).
- mechanism: `#67749c` over the composited dark surfaces. Relative luminance
  0.1777 against a background of 0.0058 (`#0b111f`, the glass bar composited over
  the page) gives 4.08:1; against the measurement's resolved background
  `rgb(7,10,21)` it is 4.28:1. Both are below 4.5.
- evidence: `ui_measurements2.json` -> `contrast.dome`: `tagline 4.28:1
  rgb(103,116,156) 12px` FAIL, `footer 4.28:1 rgb(103,116,156) 12px` FAIL;
  `contrast.classic`: `tagline 6.59:1` and `footer 6.59:1` both ok.
- repro: load the web planner with `nightseam_theme=dome` and read
  `getComputedStyle(document.querySelector('.tagline')).color` -> `rgb(103, 116,
  156)`.
- requiredFix: lift `#67749c` to about `#7d8bb5` (>= 4.5:1 on the same
  surfaces) in both rules, or raise these two to 14 px+ and treat them as large
  text (>= 3:1, which `#67749c` already clears). `themes.css?v=4` must be bumped
  in the same commit.
- counterArgument: my compositor reads only `background-color`; a
  `color-mix()`/gradient surface is skipped, so the resolved background is
  approximate (the two candidate values give 4.08 and 4.28). This does not change
  the verdict - every plausible candidate surface is darker than the 4.5:1
  crossover for this foreground - but it is why the number is quoted as a range.
  Also arguable: WCAG conformance is not a stated project goal for this app, and
  12 px secondary text is a minor issue.

### UI-03 low CONFIRMED - at 320 px the dome theme's target rows overflow the viewport by 7 px

- file:line: `web/style.css:236` (`.pick .p-right { margin-left: auto; ...;
  white-space: nowrap }`)
- impact: on a 320 px-wide device the page is 327 px wide, so the target list
  scrolls sideways slightly; 21 elements are reported outside the viewport, all
  inside the `.p-right` visual/score column (`100% of night . 7h 30m visible`,
  `81 deg`).
- mechanism: the right-hand column of a `.pick li` row is `nowrap` and has no
  shrink/truncate rule, so a long visibility string sets a floor above the
  container width at 320 px. Clean from 360 px up.
- evidence: `ui_measurements2.json` -> `overflow.dome`:
  `vw=320 docW=327 n=21 worst=.pick>li>.p-right`; no other dome width
  overflows. Reproduced in the earlier pass (`vw=320 scrollWidth=327`) with the
  same worst element.
- repro: viewport 320x900, dome theme, Tonight tab ->
  `document.documentElement.scrollWidth === 327`.
- requiredFix: allow the column to shrink and ellipsise
  (`.pick .p-right { min-width: 0; overflow: hidden; text-overflow: ellipsis; }`)
  or let the row wrap below ~380 px. Bump `style.css?v=`.
- counterArgument: 320 px is the narrowest phone still in use (iPhone SE 1st
  gen); 7 px is small and the affected content is still reachable by scrolling.
  A reviewer could downgrade this to a nit.

### UI-04 nit CONFIRMED - the dome active-tab label is ~4.42:1 over the dark end of its gradient

- file:line: `web/themes.css:152-155` (`color: #0a0d1a` on
  `linear-gradient(135deg, #8f7bff, #7a5cff)`)
- impact: the selected tab's label sits at 5.94:1 over `#8f7bff` but 4.42:1 over
  the gradient's `#7a5cff` end - marginally under AA for 13 px text. Filed as a
  nit because it is a 0.08 miss at one end of one pill and is invisible in
  practice.
- mechanism: the pill's background is `linear-gradient(135deg, #8f7bff,
  #7a5cff)`, so the effective background varies across the label; the gradient's
  lower-right end is dark enough that the fixed `#0a0d1a` foreground drops below
  4.5:1 where the label's glyphs overlap it. A single solid colour would not have
  this property.
- evidence: computed by hand from the two gradient endpoints using the same
  luminance function as the probe (the probe itself cannot see a gradient, see
  the refutation below).
- repro: read `web/themes.css:152-155`; compute the WCAG ratio of `#0a0d1a`
  against each gradient stop - `#8f7bff` gives 5.94:1, `#7a5cff` gives 4.42:1.
- requiredFix: darken the text further (`#05070f` -> 4.9:1 at the worst end) or
  flatten the gradient toward its lighter end.
- counterArgument: purely a rounding-level miss, and the gradient is decorative;
  no user is likely to be affected.

## Refuted (claims I checked that are NOT bugs)

- **"The dome active tab is invisible (1.02:1)."** This is what the probe
  actually reported first, and it is a MEASUREMENT ARTIFACT, not a defect: the
  active pill's background is a `linear-gradient` (`themes.css:154`), and the
  contrast walker reads only `background-color`, so it resolved the page
  background instead. Hand-computing the real gradient endpoints
  (`themes.css:152-155`) gives 5.94:1 to 4.42:1 - legible. Recorded so nobody
  re-files the 1.02 number.
- **Focus visibility.** All 14 tab stops carried a rendered focus ring
  (`outline-style: auto`, `outline-width: 1px`; the select/date controls resolve
  to `outline-style: solid 1px`). Neither stylesheet suppresses outlines (the
  only `outline` declarations are `style.css:63,288,448` and
  `themes.css:204,224`, all positive rules). The single stop with no outline was
  `BODY`, i.e. the Tab wrap-around point. No finding.
- **Touch targets < 24 px.** Four elements are under 24 px at 360 px
  (`#tb-minalt` 96x16 / 130x16, `#tb-scrub` 84x16 / 108x16, and two 16 px-tall
  inline footer links "OpenNGC" 54x16 and "Wikimedia Commons" 113x16). All four
  fall under WCAG 2.2 SC 2.5.8's documented exceptions - native/UA range
  controls, and inline links inside a sentence. Every real button, tab and select
  measured >= 24 px. No finding.
- **The `landing/` pages.** All six (`index`, `features`, `download`, `about`,
  `privacy`, `impressum`) measured `docW == viewport` at 360, 768 and 1366 - no
  horizontal overflow anywhere. (Content correctness of those pages is the docs
  lane's, not mine.)

## Not checked

- **Aesthetic and pixel-level judgement was done in `55-ui-visual.md`, not here,
  and it does not cover the whole UI.** Three vision-routed agents read all 18
  screenshots and reported 87 observations (62 defects, 25 checked-and-fine or
  taste). **But the screenshots only ever captured the Tonight and Horizon tabs**:
  there is no image of Sky View (the polar chart) or of the Targets catalogue
  table at any width, no desktop-shell still, and no empty/error/daytime state,
  so chart legibility, the table's rendered appearance and every non-happy state
  remain visually unreviewed. The panorama editor was captured unpainted, so the
  blocked-band fill and the assumed-open hatch were never seen. No DPR-2 or
  zoomed rendering was captured.
- **The "progress never moves the layout" invariant was INCONCLUSIVE in my
  probe, not passed.** Geometry never moved (`.topbar` h 146 (dome) / 154
  (classic), `#tabs` top 160/154, `.cat-stats` h 20, table top 304/312, all nine
  `thead th` widths identical across 67/68 samples) - but `busy_seen` was
  `false` in every sample, so the visibility warm I triggered from `#cat-minvis`
  never produced a visible progress state and the invariant was never actually
  exercised. Do not read this as a pass. The project's own gate does exercise it
  (`web-catalog-tier-frame` / the geometry assertions in
  `tests/browser/web_suite.py`), so it is covered by the final gate run rather
  than by this lane.
- **Empty/error/slow states were not exercised visually**: first run with no
  site, a failed catalogue fetch, offline, no-image objects, IndexedDB denied.
  Only the post-wizard, catalogue-loaded state was measured.
- **Keyboard operability beyond focus rings**: tab order is observable but I did
  not drive every control keyboard-only, and I did not test screen-reader
  behaviour or the accessibility tree (no axe-style scan was run).
- **The desktop shell's UI** was not measured at all (runs on `static/`; the
  desktop lane covers its behaviour, not its pixels).
- **Zoom / DPR**: only `device_scale_factor=1` was measured; a DPR 2 canvas or
  fractional-zoom layout issue would not appear here.
