# NightSeam Design Guide — the Glass language

**Read this before implementing ANY UI change.** The Glass theme (`dome`) is
the project's design direction and its default look in the web app. New UI
must be built *in the Glass style* — for the theme itself and for everything
else (web app, desktop app, landing page). "Classic" is the flat blue
fallback, not a second design language.

Where the style lives:
- Web: `web/themes.css` → `html[data-theme="dome"]` (Glass); `web/style.css` (Classic base)
- Desktop: `static/themes.css` → dome block; `static/style.css` (base)
- Landing: `landing/style.css` (mirrors the Glass palette)

Both themes share ONE HTML skeleton and switch via `<html data-theme="...">`.
Write UI against the base + override tokens in the dome block; never fork the
DOM per theme.

---

## 1. Core idea

Deep-space darkness. UI is **translucent glass floating over a CSS starfield**,
not flat boxes: translucent surfaces, blurred backdrops, hairline light
borders, one lavender accent, soft glows, rounded corners. Calm, restrained,
"observatory at night".

## 2. Palette — use the tokens, never raw hex

| Role | Token | Value |
|---|---|---|
| Page background | `--bg` | `#070a15` |
| Panel base (translucent) | `--panel` | `rgba(13,19,38,0.82)` |
| Hairline borders | `--border` / `--border-soft` | `#1e2848` / `rgba(255,255,255,0.06–0.09)` |
| Text | `--text` | `#dfe7ff` |
| Secondary text | `--dim` | `#93a3cc` |
| Tertiary text | `--faint` | `#7a8bb5` |
| **Accent (lavender)** | `--accent` | `#8f7bff` |
| Secondary accent (teal) | `--accent2` | `#4fd9c1` |
| Accent on dark | `--accent-ink` | `#0a0d1a` |
| Gold / good / warn / bad | `--gold --good --warn --bad` | `#ffd166` / `#45d6a0` / `#ffb454` / `#ff6b7a` |


Rules: hardcoded colors are only allowed for **data-driven** values (type
dots, chart series). Everything else goes through tokens
defined in the dome block. Never introduce a new hue; stick to lavender,
teal, gold and the base grays.

## 3. The glass recipe

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

## 4. The starfield

The whole sky lives in a **viewport-locked `body::before`** (fixed, inset 0,
z-index 0, pointer-events none). Three star layers (1px / 2px / 3px dots),
cyan+lavender aurora sweeps, a bottom vignette, and a vertical sky gradient
(`#0b1020 → #070a15 → #04060c`) as the bottom-most layer.

Critical: **ALL star layers share ONE uniform tile size (`480px 480px`)** —
mixed tile sizes create per-band density seams. Never add a document-relative
gradient to `body` itself (scrolling slices it). Content sits above with
`position:relative; z-index:1` (header/nav/main/footer only — modals and
toasts stay fixed at their own z-levels).

## 5. Typography

- System UI stack (`--font-ui`); **no webfonts**, offline-friendly.
- Section headings: `11px`, `uppercase`, `letter-spacing: 1–1.4px`,
  `font-weight: 600`, muted color (the "H4" style in menus).
- Numbers / meta / IDs / timestamps: `--font-mono`
  (Consolas, "Cascadia Mono", monospace).
- Body/labels: 12–14px, `--dim` or `--faint` for secondary text.
- The prominent value (cards, stats): large, `700`, `--text`, can carry a
  subtle lavender text-shadow.

## 6. Components

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

## 7. Layout

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

## 8. Restraint & motion

- One accent, one glow color; no rainbow UIs, no animated backgrounds.
- Transitions ~`0.15s ease` on hover/active only (lift, border color).
- `prefers-reduced-motion: reduce` disables animations/transitions.

## 9. Hard rules (never break — these are bugs, not style)

- `.hidden { display:none !important }` stays; never override it.
- Never set `display` on `#tabs-cat`, `#plannerControls`, `#tabs`,
  `#nightInfo` — the app toggles those via `body.catmode` / JS.
- `.modal` (and `.modal-wrap`) **stay `position:fixed`**; no ancestor
  transforms — the fixed-centering breaks.
- z-index ladder: content 1, topbar 55, tabs 50, popover/sheet 60, modal 40,
  toasts 300, drag handles ≥ 95 < 100. Stay below 100 for UI chrome.
- Starfield tiles: uniform size (480px) on every star layer.
- Both themes share one skeleton — put token overrides in the dome block.

## 10. Checklist before shipping UI

- [ ] Uses tokens (no raw hex except data-driven colors).
- [ ] Surfaces use the glass recipe (translucent + blur + hairline border).
- [ ] Rounded/pill shapes; uppercase H4 headers; mono for numbers.
- [ ] Primary actions use the lavender gradient + dark ink.
- [ ] Works in BOTH themes (Glass default; Classic fallback) — one DOM.
- [ ] Structural rules + z-index ladder respected.
- [ ] Checked at desktop and compact (≤1240 / ≤900) widths.