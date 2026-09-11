# 01 - Inventory: what runs where

Baseline: frozen tag `v0.6.14` = `383007c`; tree `v0.6.14-2-g834b6bb`.

Evidence convention: `file:line`. Statements marked `(F)` come from the module-
graph subagent; all binaries were read, not executed. "Desktop" = `static/`
(pywebview shell next to a local FastAPI server); "web" = `web/` (static, no
server, IndexedDB).

## 1. Runtime topology

- Desktop: `main.py:236` -> `app/server.py::create_app`; UI in a pywebview
  window over `static/` (`app/paths.py:117-128`, `app/server.py:958-966`).
  All astronomy/planning payloads come from Python (`app/nightcalc.py`),
  computed per request.
- Web: `web/index.html:211` -> `web/app.js`, no server, catalog from
  `web/catalog.json`; every astronomy/planning quantity is computed in JS
  (`web/astro.js`, `web/nightrank.js`, `web/app.js`).
- Node is a build/test-time tool only (`tests/test_js_parity.py:28-69`,
  `scripts/check_js_syntax.py`); no npm, no bundler, no runtime Node.

## 2. Domain A - astronomy / planning

| Concept | Python | Desktop JS | Web JS |
|---|---|---|---|
| Julian day / GMST | `app/astro.py:25,84` | `static/js/astro.js:10,22` | `web/astro.js:45,63` |
| Precession (Meeus 21.4, Y-rotation) | `app/astro.py:39-82,149` (fwd+inv) | `static/js/astro.js:35` (fwd only) | `web/astro.js:74,98` (fwd+inv) |
| Alt/az + refraction | `app/astro.py:92-124` | `static/js/astro.js:66-89` (batch, always refracted) | `web/astro.js:121-159` |
| Sun ra/dec and alt/az | `app/astro.py:127-157` | none - consumes payload (`static/js/skyview.js:542-551`) | `web/astro.js:166-295` |
| Moon ra/dec, illum, age | `app/astro.py:160-241` | none - consumes payload (`static/js/derive.js:288-318,357-366`) | `web/astro.js:185-303` |
| Twilight, night window, site-noon anchor | `app/planning.py:14-86` | payload index mapping (`static/js/derive.js:115-165`) | `web/astro.js:318-419`, `web/app.js:165-184` |
| Clear-window half-open `longest_run` | `app/nightcalc.py:243-271` | `static/js/derive.js:70-99` | `web/nightrank.js:42-77` |
| Grids: 6-min / 4-min / 24 h site-zoned | `app/nightcalc.py:70-77,143-148,184-191` | payload consumer, clipping only | recomputes its own spans `web/app.js:159,185-219,1544-1563` |
| Visibility/status predicate | detail only `app/nightcalc.py:208-209` | `static/js/derive.js:282-334,387-397` | `web/nightrank.js:21-23,42-77` |
| Min-alt rule `17+2*bortle` / explicit | `app/server.py:330-339,355-356` | `static/js/derive.js:405-409` | `web/horizon.js:999` |
| Moon/Bortle scoring curves | none (by design: `app/nightcalc.py:127-129`) | `static/js/derive.js:253-280,339-346` | `web/astro.js:422-458` |
| Ranking (silent popularity tiebreak) | data only | `static/js/tonight.js:67-78` | `web/app.js:628-651` |

Pins: goldens `tests/test_astro.py`, `tests/test_planning.py`,
`tests/test_precession_reference.py`; three-engine parity `tests/js/astro_parity.mjs`
via `tests/test_js_parity.py:72-127,988-1002`; horizon ceilings
`tests/test_horizon_parity.py`. No mutation test exists for any astronomy value.

## 3. Domain B - panorama / horizon

| Concept | Python | Desktop JS | Web JS |
|---|---|---|---|
| 720-bin profile + sentinels | `app/nightcalc.py:19-51` | `static/js/pano.js:9,666-754`; `static/js/derive.js:172-190` | `web/horizon.js:15-18,348-372,507-537` |
| **Bin convention** | world-azimuth `i=az/0.5` (`app/nightcalc.py:44-48`) | world-azimuth (`static/js/derive.js:178`, `static/js/pano.js:703-712`) | **FOV-relative** (`web/horizon.js:348-372,521-527`) |
| Mask math, seam wrap | none (validates only, `app/server.py:190-204`) | `static/js/pano.js:406-432,666-754` | `web/horizon.js:295-313,474-499` |
| Transforms altOf/rowOfAlt/xOfAz/azOfX | none | inline `static/js/pano.js:515-548` | `web/horizon.js:316-343` (exported, pinned) |
| Edge geometry `profileSegments` | none | `static/js/pano.js:553-575` | `web/horizon.js:380-398` - **identical vertices pinned** (`tests/js/sky_band.mjs:153-164`) |
| Visible band / sky-band helpers | none | ad hoc `static/js/skyview.js:313-399` | `web/horizon.js:406-461,542-634` (pinned `tests/js/sky_band.mjs`) |
| `ceilFor` / blockAbove gating | `app/nightcalc.py:28-51`; gating `app/server.py:489-493,518-522` | `static/js/derive.js:444-451` | `web/horizon.js:507-537` |
| Polar chart math | n/a | `static/js/skyview.js:143-147` | `web/app.js:926-930` (duplicate `r=R*(1-alt/90)`) |
| Persistence | SQLite `app/database.py:59-72`; PUT `app/server.py:646-662` | `static/js/pano.js:758-785` | localStorage+IndexedDB `web/horizon.js:89-112,24-67` |

## 4. Domain C - catalog / data / formatting

- Curated catalog is Python data (`app/catalog_data.py`), seeded into SQLite
  (`app/database.py:204-216`); advanced catalog is OpenNGC
  (`app/data/openned.csv`, 11,917 data rows) seeded at `app/database.py:240-281`.
- Web catalog is built from the DB: `web/build_web.py:83-105` -> `web/catalog.json`
  (12,114 objects, ~3.99 MB) + manifest `{token,sha256}`; served via the single
  `CATALOG_TOKEN` fetch `web/app.js:25,2367`.
- Identity is global across curated+advanced; composites pinned
  (`tests/test_catalog_integrity.py:52-143`).
- Formatting/derived rules are duplicated: `fmtSize`
  (`static/js/util.js:162` vs `web/format.js:30`), `framePct`/`frameCoverage`
  (`static/js/derive.js:512-539` vs `web/format.js:54-57`, `web/app.js:281-285`),
  `magVisible` (`static/js/derive.js:29` vs `web/format.js:65`), `popularityFactor`
  (`static/js/derive.js:483-486` vs `web/app.js:130-134`, no numeric engine),
  type labels/colors (3 copies: `app/catalog_data.py:11-20`,
  `static/js/util.js:118-127`, `web/app.js:27-41`).
- `search` blob: stored by Python (`app/catalog_data.py:311-314`), consumed by
  desktop (`static/js/targets.js:69`), excluded from `catalog.json`
  (`web/build_web.py:31-35`), re-derived by web (`web/app.js:136-144`) - never
  compared.
- Rig FOV: `fov_arcmin` twice in Python (`app/rig_presets.py:40-46`,
  `app/server.py:174-176`); web `fovFrom` returns degrees
  (`web/webstore.js:165-168`) and converts at render (`web/app.js:284`).
- Web additionally fetches the popularity source popularity live at runtime
  (`web/app.js:100-134`), preferring it over the baked field.

## 5. Domain D - UI / state

- Desktop state container `static/js/state.js:5-20` (`S`); web state
  `web/app.js:85-94` (`S`) plus module singletons. Selected instant is `S.tIdx`
  (desktop) vs `S.skyTime` (web) - both intentional (AGENTS invariant).
- Domain logic lives inside UI files on both sides: desktop `static/js/derive.js`
  (astronomy/scoring/scrub), `static/js/tonight.js` (ranking),
  `static/js/skyview.js` (chart+backdrop astronomy), `static/js/setup.js` (FOV
  preview), `static/js/util.js` (timezone); web `web/app.js` (astronomy, scoring,
  ranking, scrub, backup rollback), `web/webstore.js` (validation, FOV,
  sexagesimal parsers).
- 100% presentation stays in shells: `dragwin.js`, menus, DOM rendering, canvases,
  library UI (`static/js/archive.js`, `skymap.js`), weather/updater.
- Desktop re-derives visibility/score/clear-window client-side by design
  (`app/nightcalc.py:127-129`); the server ships tracks + `max_alt` only.
- Known UI-local duplicates: detail predicate copy `web/app.js:1556` vs
  `web/nightrank.js:21`; popularity twin; FOV preview (`static/js/setup.js:87-94`
  vs `app/server.py:397-401`); timezone helpers in UI files both sides.

## 6. Domain E - build / release / tokens

- Frozen desktop serves `resource_dir()/static`; PyInstaller bundles
  `--add-data "static;static"` (`build.ps1:182`), so anything under `static/`
  ships. `web/` is never in the exe.
- Web is uploaded as-is: `web/ftps_deploy.py`, `upload_order` puts HTML last
  (`:73-86`), pinned by `tests/test_deploy_order.py:20-39`.
- Cache-busting is manual `?v=` tokens (current: app.js 42, astro.js 7,
  horizon.js 24, format.js 3, nightrank.js 4, webstore.js 6, dragwin.js 1,
  style.css 16, themes.css 4, `CATALOG_TOKEN=2`); catalog guarded by
  `scripts/check_catalog_token.py`, mutation-proven in `tests/test_cache_tokens.py`.
- `check_js.py:18-35` dynamically loads `scripts/check_*.py` and hard-fails;
  `check_release.py:451-491` runs a `collect()/evaluate()` chain including
  bake-mtime and staged-zip hashes; encoding guard recurses the whole tree
  (`scripts/check_encoding.py:51-75`).
- Version bake: `build.ps1:142-176` writes gitignored `app/_version_baked.py`;
  `web/version.json` baked separately (`web/build_web.py:56-80`).
- No content-hash mechanism exists for JS modules today; only the catalog
  manifest and release zip hashes.

## 7. Domain F - boundary crossings (summary)

- 28 FastAPI routes in `app/server.py` (full table in the subagent evidence;
  endpoints: /api/state, /api/settings, sites/rigs, /api/catalog(+/custom),
  /api/night, /api/object/{id}(+/image), panoramas CRUD+image, /api/export,
  /api/import, library reindex/imports/open_folder/edit/export, images ingest,
  /api/images/{id}/preview (no UI caller), /api/shutdown, /).
- `/api/night` ships: site, date_local, tz_offset_min, twilight_level,
  sunset/sunrise, dusk/dawn, moon_illum, moon_age_days,
  timeline{t0,step_min=6,n,times_iso}, sun_alt/sun_az, moon_alt/moon_az,
  objects[alt,az,ceil,max_alt,max_i(+ceil_top)] or advanced metadata only
  (`app/nightcalc.py:108-167`). NOT shipped: vis, scores, best (client-derived).
- `/api/object/{oid}` ships vis/best/step_min for the detail chart
  (`app/nightcalc.py:220-239`); the desktop detail re-derives curve colors
  instead (`static/js/detail.js:310-314`).
- Web has no `/api/*` calls at all; its only network fetches are catalog.json,
  version.json, the popularity source popularity, open-meteo weather, Wikipedia thumbnails.
- Desktop advanced mode: `adv=1` -> metadata-only objects
  (`app/nightcalc.py:105-114`) -> `static/js/derive.js:196-227` synthesizes tracks
  in the browser. This is a deliberate payload-size contract, not accidental
  duplication.
- Desktop `/api/panorama` PUT carries snake_case
  (`static/js/pano.js:765-777`); web stores camelCase in IndexedDB; no shared
  schema code.
