# NightSeam Design Guide — Workbench default, Glass alternate

This file is the UI design contract. Current implementation defects and security
findings are tracked separately in `BUGS.md`; none of the 2026-09-17 findings
changes the theme contracts below.

**Read this before implementing ANY UI change.** Since the 0.6.35 working tree,
NightSeam has two presentation themes:

- **Workbench (`workbench`)** is the default across the desktop app and planner,
  and is the visual direction of the public landing page.
- **Glass (`dome`)** is the optional observatory-glass presentation retained for
  users who prefer the earlier look.

The old `classic` value, an empty value, and unknown values migrate to
`workbench`. They are compatibility inputs, not additional themes. Theme choice
does not change planning, catalog, storage, or calculation behavior.

Where the style lives:
- Web: `web/style.css` plus `web/themes.css` → `html[data-theme="workbench"]`
  (Workbench) and `html[data-theme="dome"]` (Glass)
- Desktop: `static/style.css` plus the Workbench and Glass blocks in
  `static/themes.css`
- Landing: `landing/style.css` follows the Workbench palette and layout; it has
  no user theme switch

Both app themes share ONE HTML skeleton per shell and switch via
`<html data-theme="...">`. Write UI against the base plus the active theme's
override tokens; never fork the DOM per theme.

---

## 1. Workbench theme — precision utility

Workbench is a quiet instrument panel for making decisions during an observing
session. Its visual hierarchy comes from spacing, alignment, borders, and data
placement rather than atmosphere or decoration:

- opaque graphite surfaces and a near-black page background;
- brass for actions, focus, selection, and the small amount of visual emphasis;
- compact square controls, restrained radii, and flat tab underlines;
- no blur, glow, decorative starfield, or large gradient surfaces;
- charts, target rows, and forecast information carry the visual interest.

### Workbench composition

- The top bar keeps the common planning controls visible; advanced and
  infrequent actions stay in the hamburger menu.
- Tonight opens with a session brief: site/date, dark window, selected time, and
  a booked-night track showing where the current time sits in the usable window.
- The target area is chart-first: best targets and the later queue are visible
  together, while a selected target opens in a right-side inspector sheet.
- The same hierarchy is used in the desktop and browser planner even though the
  two shells keep their own HTML and stylesheets.

## 2. Glass theme — core idea

Deep-space darkness. UI is **translucent glass floating over a CSS starfield**,
not flat boxes: translucent surfaces, blurred backdrops, hairline light
borders, one lavender accent, soft glows, rounded corners. Calm, restrained,
"observatory at night".

## 3. Theme palettes — use the tokens, never raw hex

### Workbench palette

| Role | Desktop / landing token | Web app token | Value |
|---|---|---|---|
| Page background | `--bg` | `--bg` | `#111315` |
| Panel base | `--panel` | `--panel` | `#1c2022` |
| Borders | `--border` / `--border-soft` | `--line` | `#343a3d` / `#292e30` |
| Text | `--text` | `--txt` | `#e4e1d9` |
| Secondary text | `--dim` | `--muted` | `#9a9d97` |
| **Accent (brass)** | `--accent` | `--accent` | `#c99a53` |
| Good | `--good` | `--green` | `#7fbd98` |
| Warn / gold | `--warn` / `--gold` | `--amber` | `#dfae61` |
| Control radius | `--r-sm` … `--r-xl` | `--radius` | `4–7px` / `6px` |
| Mono font | `--font-mono` | `--mono` | Consolas / Cascadia Mono |

Workbench surfaces are opaque. Keep the page and panel contrast quiet, reserve
brass for an action or a state, and do not introduce another decorative accent.

### Glass palette

| Role | Desktop / landing token | Web app token | Value |
|---|---|---|---|
| Page background | `--bg` | `--bg` | `#070a15` |
| Panel base (translucent) | `--panel` | `--panel` | `rgba(13,19,38,0.82)` |
| Hairline borders | `--border` / `--border-soft` | `--line` | `#1e2848` / `rgba(255,255,255,0.06–0.09)` |
| Text | `--text` | `--txt` | `#dfe7ff` |
| Secondary text | `--dim` | `--muted` | `#93a3cc` |
| Tertiary text | `--faint` | *(none — the web has two text steps)* | `#7a8bb5` |
| **Accent (lavender)** | `--accent` | `--accent` | `#8f7bff` |
| Secondary accent (teal) | `--accent2` | *(none)* | `#4fd9c1` |
| Accent on dark | `--accent-ink` | *(none)* | `#0a0d1a` |
| Gold | `--gold` | `--amber` | `#ffd166` |
| Good | `--good` | `--green` | `#45d6a0` |
| Warn | `--warn` | `--amber` (the web's warn is its amber) | `#ffb454` |
| Bad | `--bad` | *(none — the web writes `var(--bad, #ff8a8a)`)* | `#ff6b7a` |
| Mono font | `--font-mono` | `--mono` | Consolas / Cascadia Mono |
| UI font | `--font-ui` | *(none — the web `body` sets the system stack)* | Segoe UI / system-ui |

**The web app names its tokens differently.** `web/style.css` +
`web/themes.css` define `--bg --bg2 --panel --line --txt --muted --accent
--amber --green --radius --mono`; the long names in the middle column above
exist only in the desktop (`static/`) and landing stylesheets. A rule in `web/`
written with `var(--text)`, `var(--dim)`, `var(--border)`, `var(--faint)`,
`var(--good)` or `var(--bad)` resolves to nothing and the declaration is
dropped (the web's `--bad` uses a literal fallback). The roles are shared, but
the values belong to the active theme — use the column and theme block that
matches the stylesheet you are editing.


Rules: hardcoded colors are only allowed for **data-driven** values (type dots,
chart series). Everything else goes through tokens defined in the active theme
block. Workbench uses graphite, brass, warm text, and quiet status colors;
Glass uses lavender, teal, gold, and the deep-space grays below. Never add a
new decorative hue without a design decision.

### Data visualizations

The sky views, altitude graphs, constellation backdrops, and catalog sky map
are part of the theme contract too. Their drawing code owns geometry and
meaning only; presentation comes from the semantic `--viz-*` roles at the end
of `web/themes.css` and `static/themes.css`, read by the matching
`viztheme.js` helper. Workbench therefore uses the same graphite/brass/status
language inside canvases, while Glass keeps its luminous space-chart palette.
When adding a chart mark, add or reuse a semantic role in both theme blocks and
redraw on `theme:changed`; do not put a theme-specific hex value in canvas
drawing code. Altitude-chart legends are grouped into *Target state* and
*Chart guides*, with a short explanation for every line or shaded region.
Moon tracks and all target paths are clipped to the plot rectangle, so an
object below the -10° chart floor cannot run into the time labels.

### Accessibility baseline

Charts remain canvas-based for their dense astronomy geometry, but every chart
also exposes a semantic image role and a concise text summary derived from the
same plotted state. Primary tabs expose `tablist`/`tab` selection state, dialogs
are keyboard-dismissable with Escape, and focus-visible styling is present in
both Workbench and Glass. High-contrast and reduced-motion media preferences
must remain usable without changing the planning result. The current browser
matrix covers this foundation in both shells and themes; manual screen-reader
and focus-restoration QA is still a release follow-up.

The weather panel is a data visualization too, but it uses a compact,
scrollable dark-hour table rather than a multi-series canvas. Keep the four
observing questions separate and named: cloud cover, rain warning, sky
clarity (a clearly labelled haze proxy, not astronomical transparency), and
dew risk. Values use the active theme's text/status tokens; bars are only for
the data-driven cloud percentage. The top-bar chip carries one aggregate
green/yellow/red status and a 0–100 night rating. The panel must show the
site-local date and dark-hour range, omit daylight rows, make the dew estimate
explicit, and keep weather advisory-only so it never changes planning or
ranking calculations.

## 4. The glass recipe

A Glass surface =  translucent background + blur + hairline border + inset
top highlight + soft shadow (add a lavender glow for large floating pieces):

```css
background: color-mix(in srgb, var(--panel) 72–85%, transparent);
backdrop-filter: blur(12–20px) saturate(130–150%);
border: 1px solid rgba(255,255,255,0.06–0.10);
box-shadow: 0 8–24px rgba(0,0,0,.3–.55),
            inset 0 1px 0 rgba(255,255,255,0.05–0.08);
```

Where each depth lives (from the actual theme):
- Topbar / pill dock: blur `14px` saturate `140%`, radius `18px`
- Cards / panels: blur `12px` saturate `130%`, radius `18px`
- Modals: blur `18px` saturate `140%`, radius `20px`
- Centered sheets (menu, weather): blur `20px` saturate `150%`, radius `22px`
- Small rows / pick items: lighter glass (blur `8px`, radius `12px`)

## 5. The starfield

The whole sky lives in a **viewport-locked `body::before`** (fixed, inset 0,
z-index 0, pointer-events none). Three star layers (1px / 2px / 3px dots),
cyan+lavender aurora sweeps, a bottom vignette, and a vertical sky gradient
(`#0b1020 → #070a15 → #04060c`) as the bottom-most layer.

Workbench intentionally disables this decorative layer and uses its solid
`--bg`; the starfield rules below apply to Glass only.

Critical: **ALL star layers share ONE uniform tile size (`480px 480px`)** —
mixed tile sizes create per-band density seams. Never add a document-relative
gradient to `body` itself (scrolling slices it). Content sits above with
`position:relative; z-index:1` (header/nav/main/footer only — modals and
toasts stay fixed at their own z-levels).

## 6. Typography

- System UI stack (`--font-ui`); **no webfonts**, offline-friendly.
- Section headings: `11px`, `uppercase`, `letter-spacing: 1–1.4px`,
  `font-weight: 600`, muted color (the "H4" style in menus).
- Numbers / meta / IDs / timestamps: `--font-mono`
  (Consolas, "Cascadia Mono", monospace).
- Body/labels: 12–14px, `--dim` or `--faint` for secondary text.
- The prominent value (cards, stats): large, `700`, `--text`, can carry a
  subtle lavender text-shadow.

Workbench keeps the same system/mono font contract but uses its warm text tokens
and does not add text glow.

## 7. Components

### Workbench components

- **Buttons**: compact square controls with a thin border; primary actions use
  brass fill with dark ink; hover changes the border and text to brass without
  a glow.
- **Inputs / selects**: dark opaque fields with a 4px radius and brass focus;
  range controls use the brass accent.
- **Tabs**: flat, full-width strip with a brass underline for the active tab.
- **Cards / panels**: opaque graphite surfaces with a 1px border, 6px radius,
  no lift, blur, or shadow.
- **Tables and target rows**: visible alignment and quiet separators; use the
  data hierarchy, not decorative containers, to guide scanning.
- **Sheets / inspectors**: functional side panels with a clear edge and no
  centered floating-glass treatment.

### Glass components

- **Buttons**: `border-radius: 999px`, translucent background, hairline
  border; hover brightens (`--accent` border + lighter tint).
  Primary = lavender gradient (`#8f7bff → #7a5cff`) with **dark ink text**
  (`--accent-ink`) and a soft lavender glow.
- **Inputs / selects**: translucent `rgba(15,21,40,0.7)`, radius `10px`,
  hairline border; focus = 1px lavender outline. **Checkboxes are 16px
  circles** (`border-radius:50%`) with a lavender fill + dark checkmark.
  Range sliders: `accent-color: #8f7bff`.
- **Tabs (pill dock)**: translucent pill container, each tab a pill; the
  active tab is the lavender gradient with dark text (the "launch button"
  styling reused for the selected state).
- **Cards / panels**: the glass recipe; section header in the H4 style;
  hover lifts `translateY(-1px)` + lavender border tint.
- **Tables**: transparent background (the card provides the glass), hairline
  row borders `rgba(255,255,255,0.05)`, hover row tint
  `rgba(143,123,255,0.08)`, uppercase 12px headers in `--dim`.
- **Chips**: pills, translucent; the active/selected chip uses the lavender
  gradient + dark text.
- **Popovers (menu / weather)**: on Glass they become **centered glass
  sheets** — `position:fixed; top:50vh; left:50vw;
  transform:translate(-50%,-50%)`. Viewport units are mandatory because the
  topbar's `backdrop-filter` makes it the containing block for fixed
  descendants; plain `%` centering would resolve against the bar.
- **Draggable popups**: in Glass, modals and sheets are draggable
  (`dragwin.js`); dragging converts them to fixed with viewport px and
  clamps them; inline positions reset when the theme changes.
- **Checkboxes / toggles** in menus: circle checkboxes + lavender accent as
  above. Range slider labels show the live value in `--font-mono`.
- **Scrollbar**: thin (`10px`), thumb `#1e2848`, rounded, transparent track.

## 8. Layout

### Workbench layout

- Full-width structural top bar and tab strip; no floating gap around the main
  chrome.
- Content is organized into compact grids with the main chart or target list as
  the dominant area and supporting information alongside it.
- Detail views may become right-side inspector sheets so the planning context
  remains visible.

### Glass layout

- **Floating glass topbar**: sticky, `top:10px`, side margins `14px`,
  radius `18px` — floats over the starfield with a gap on all sides.
- **Pill tab dock**: sticky right below the bar, centered, radius `999px`.
- **Centered sheet menus** and draggable modals (see above).
- Content main: relative + z1; cards in grids (`grid2`/`grid3`); the
  edge-space setting alone controls content width (content = viewport - 2 x
  edge, centered) — there is NO fixed maximum: a ~1500px "reading width" cap
  used to sit here and silently defeated the slider on wide screens.
- **Compact widths**: ≤1240px tighten controls; ≤900px shrink the bar/tabs,
  hide the night-info chip and tagline. Keep everything reachable.

## 9. Restraint & motion

- One accent, one glow color; no rainbow UIs, no animated backgrounds.
- Transitions ~`0.15s ease` on hover/active only (lift, border color).
- `prefers-reduced-motion: reduce` disables animations/transitions.

Workbench is the stricter version of this rule: transitions are limited to
state changes, and there is no decorative glow or lift.

## 10. Hard rules (never break — these are bugs, not style)

- `.hidden { display:none !important }` stays; never override it.
- Never set `display` on `#tabs-cat`, `#plannerControls`, `#tabs`,
  `#nightInfo` — the app toggles those via `body.catmode` / JS.
- `.modal` (and `.modal-wrap`) **stay `position:fixed`**; no ancestor
  transforms — the fixed-centering breaks.
- z-index ladder: content 1, topbar 55, tabs 50, popover/sheet 60, modal 40,
  toasts 300, drag handles ≥ 95 < 100. Stay below 100 for UI chrome.
- Starfield tiles: uniform size (480px) on every star layer.
- Both themes share one skeleton — put token and structural overrides in the
  corresponding Workbench or Glass block; never move IDs to make a theme work.

## 11. Checklist before shipping UI

- [ ] Uses the active theme's tokens (no raw hex except data-driven colors).
- [ ] Workbench surfaces are opaque, bordered, compact, and free of decorative
      blur/glow.
- [ ] Glass surfaces use the glass recipe (translucent + blur + hairline border)
      where the Glass theme calls for them.
- [ ] Workbench actions use brass; Glass actions use the lavender treatment.
- [ ] Works in BOTH themes (Workbench default; Glass alternate) — one DOM.
- [ ] Structural rules + z-index ladder respected.
- [ ] Checked at desktop and compact (≤1240 / ≤900) widths.

## 12. Theme persistence

- The only canonical theme values are `workbench` and `dome`.
- Desktop settings are normalized at the database boundary by `app/theme.py`;
  web preference and backup handling use the same rule in `web/webstore.js`.
- `classic`, the empty value, and unknown values resolve to Workbench. A stored
  `dome` value remains Glass.
- The desktop and web planners expose the choice in **Appearance**. Web backups
  carry the theme and restore it with the rest of the staged bundle.
- The landing page follows Workbench and does not offer a planner theme switch.
