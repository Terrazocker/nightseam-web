# 06 - What must NOT be unified

Baseline: frozen tag `v0.6.14` = `383007c`; tree `v0.6.14-2-g834b6bb`.

Starts from the project's intentional-difference list
(`AUDIT-DESKTOP-WEB-PARITY.md:320-339`, class A) and the platform facts in
`01-inventory.md`. The core must not flatten these; phases that touch a row
must keep it as a parameter or a shell concern.

## 1. Product scope (intentionally different apps)

| Difference | Evidence |
|---|---|
| Web has no Image Catalog / FITS library / sky map / update checker / favorites / wizard replay / native folder picker | `AUDIT-DESKTOP-WEB-PARITY.md:322`; `archive.js`, `skymap.js`, `updater.js`, `wizard.js` exist only under `static/` |
| Web default theme Glass (`dome`); desktop default flat; picker entries differ | `AUDIT-DESKTOP-WEB-PARITY.md:323`; `web/app.js:306-323` |
| Web edge-space default 14 px vs desktop 200 px; slider range differs | `AUDIT-DESKTOP-WEB-PARITY.md:324`; `web/app.js` prefs vs `static/js/header.js` |
| Web Tonight/sky caps (mag 9 / 9.5, 1400 rows); desktop has no such caps | `AUDIT-DESKTOP-WEB-PARITY.md:325` |
| Web 60 rows/page vs desktop 250; web sortable columns with direction | `AUDIT-DESKTOP-WEB-PARITY.md:326` |
| Web per-site timezone + notes; desktop one global timezone setting | `AUDIT-DESKTOP-WEB-PARITY.md:327`; `web/webstore.js:211-252` |
| Backup formats: web JSON vs desktop ZIP, not cross-importable by design | `AUDIT-DESKTOP-WEB-PARITY.md:328`; `app/backup.py:105-200` vs `web/webstore.js:300-388` |
| Web-only: rise/set/transit, moon-distance rows, 6-band twilight shading, Now button, hash routing, error banner, reduced-data image mode | `AUDIT-DESKTOP-WEB-PARITY.md:329`; `web/astro.js:477` |
| Desktop-only: moon up/down header, moon-up band, busiest-hour card, favorites rings, sky-view toggles, constellation/star backdrop, detail stepping | `AUDIT-DESKTOP-WEB-PARITY.md:330`; `static/js/skyview.js:154+`, `static/js/tonight.js:41-54` |
| Horizon editor scope differs (desktop crop/loupe/landmark-N/60-step undo; web blank-sky) | `AUDIT-DESKTOP-WEB-PARITY.md:333`; `web/horizon.js` editor vs `static/js/pano.js` |
| Rig presets are a picker with empty default; first-added-rig auto-active differs | `AUDIT-DESKTOP-WEB-PARITY.md:334`; `tests/test_rig_presets.py:63-75` |
| Tabs two-bar+brand (desktop) vs single hash-routed bar (web) | `AUDIT-DESKTOP-WEB-PARITY.md:335` |
| Web full re-render + 60 s auto-refresh vs desktop DOM patching + manual scrub | `AUDIT-DESKTOP-WEB-PARITY.md:336` |
| Web always has a site (Berlin fallback); desktop wizard location mandatory | `AUDIT-DESKTOP-WEB-PARITY.md:337` |

## 2. Data paths that stay separate even though a value is shared

| Difference | Evidence | Why not unified |
|---|---|---|
| Popularity: web live the popularity source fetch with baked fallback; desktop baked column only | `web/app.js:100-134`; `AUDIT-DESKTOP-WEB-PARITY.md:331` | network path is a web-only feature; the *formula* is shared in core, the *data path* is not |
| Storage: SQLite + filesystem (desktop) vs IndexedDB + localStorage (web) | `app/database.py:59-72`; `web/horizon.js:89-112` | platform adapters; schema/ID generation differ (server ids vs client ids) |
| Untrusted-path hardening and import safety | `app/paths.py`, `app/backup.py:105-200`, `tests/test_paths.py` | security primitive of the server; web stages/rolls back in memory (`web/webstore.js:321-388`) |
| FITS ingest, image resolution chain, Wikipedia/DSS cache | `app/ingest.py`, `app/images.py`, `app/imglib.py` | desktop-only platform IO |
| Weather, updater JSONP, pywebview folder picker | `static/js/weather.js`, `static/js/updater.js`, `main.py` | platform-only |
| Names/formatting shapes: `phaseName` 5-band vs `moonPhase` 8-band; RA/Dec/time string shapes | `static/js/util.js:153`, `web/astro.js:258`; `AUDIT-DESKTOP-WEB-PARITY.md:332` | cosmetic product choices; core may offer both formatters, but shells pick |

## 3. Equivalent behaviour with different constants (parametrize, do not force)

Rows from `AUDIT-DESKTOP-WEB-PARITY.md:338` that are behaviourally equivalent
today; a phase must not silently collapse them without a decision + test:

- Twilight scan span: Python 30 h from site local noon (`app/planning.py:60-61`)
  vs web 48 h/site noon (`web/astro.js sunCrossings`); pinned equal in the
  covered cases (`tests/test_js_parity.py:429-464`).
- Modulo normalization style (same results); 90.0 vs 90.5 no-block sentinels in
  different places (`app/nightcalc.py:100,194` vs `web/horizon.js:361-365`).
- Advanced-track precession epoch: once per object at grid midpoint
  (`static/js/derive.js:209`) vs per sample (web); documented tolerance.
- Desktop payload grid has twilight margins; scoring clips to dusk..dawn on both
  sides (`static/js/derive.js:115-133`; AGENTS invariant).
- Desktop detail grid 4 min / 75+45 min margins vs web 120 samples from
  sunset -1 h..sunrise +1 h (`app/nightcalc.py:184-191` vs `web/app.js:1544-1563`).
  The AGENTS "one source of truth" rule currently governs the *scoring* window,
  not the detail chart window; do not unify without measuring.

## 4. Things that look duplicated but are contracts

- **Advanced-mode metadata-only payload**: `app/nightcalc.py:105-114` +
  `static/js/derive.js:196-227`. The server intentionally omits tracks; do not
  "fix" this by shipping tracks or by deleting the synthesis.
- **Client-side visibility/score derivation on desktop**:
  `app/nightcalc.py:127-129`. The server omits vis/score on purpose so min-alt
  is instant; core may host the math, but the server must not start shipping it
  until the authority flip is decided (`07-authority-risk.md`).
- **Web computes everything**: `web/app.js`, `web/nightrank.js`. It has no
  server; "unify with the server" is impossible.
- **Manual `?v=` tokens**: part of the no-build hosting contract
  (`01-inventory.md` section 6), not accidental.
- **The astronomy twin exports**: they are being shared, not kept; the
  distinction is that Python stays as the *oracle* during transition
  (`05-phased-plan.md` Phase 2).

## 5. Explicit do-not-do list for the extraction

1. Do not merge desktop and web UI files, only the pure domain modules.
2. Do not move storage/network/IO into core to "avoid duplication" (boundary in
   `03-core-api.md` section 5).
3. Do not change the web live-popularity path or hide popularity (AGENTS rule:
   invisible tiebreaker; `tests/test_ui_invariants.py:32-58`).
4. Do not unify the two persistence schemas or backup formats.
5. Do not collapse the intentional defaults (theme, edge space, caps, page
   size).
6. Do not delete Python astronomy until Phase 4 Option B is explicitly
   approved and its preconditions are green.
