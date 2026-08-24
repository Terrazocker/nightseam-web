# AGENTS.md

AstroPilot: a desktop DSO-planning app that runs a local FastAPI server and
serves a vanilla-JS UI. Pure-Python astronomy (Meeus algorithms) - no
numpy/astropy, no JS build step, no npm. Works fully offline except optional
Wikipedia example images. Two modes: Night Planner and Image Catalog (FITS
ingest + library), switched via the top-right button or the brand name.

## Commands

- Run from source: `python main.py` (default port 8407; `--console` for logs,
  `--no-browser` for headless, `--port N`). Also `--browser` (tab instead of
  app window) and `--idle-exit-hours 0` (never exit on idle - the default is
  12 h, which kills a server an agent left running). Data is created under
  `data/` (gitignored) in the repo root.
- Tests: `python -m pytest tests/` - 73 tests, run in ~7 s (pure-function
  tests are fast; `tests/test_api.py` spins up real `create_app()` instances
  via fastapi TestClient/httpx). Single test:
  `python -m pytest tests/test_astro.py -k name`. API tests use
  `create_app(db, prefetch=False)` so no image-cache thread hits the network;
  the archive is pointed at a tmp dir per test. A broken Windows temp-dir ACL
  means pytest runs use a repo-local `.pytest-tmp` base (see `pytest.ini`).
- No Python linter/formatter configured. The JS "lint" is three scripts that
  must pass after touching `static/`; `python scripts/check_js.py` runs all
  three and exits non-zero on hard failures (recommended one-command check):
  - `python scripts/check_js_imports.py` - broken relative ES-module imports and named imports missing from the target's exports (hard failures)
  - `python scripts/check_dom_ids.py` - `$('#id')` references missing from `index.html` (its "important" id list must be updated when controls are removed)
  - `python scripts/check_js_defs.py` - heuristic; exit code is always 0, review candidates manually
- Build exe: `powershell -ExecutionPolicy Bypass -File build.ps1` ->
  `dist\AstroPilot.exe` (isolated `.venv-build`; kills running AstroPilot
  processes first). PyInstaller is only needed for building. The build bakes
  the current `git describe` version into a gitignored `app/_version_baked.py`
  and bundles `app/data` (the advanced catalog CSV) via `--add-data`. The
  committed `AstroPilot.spec` is a PyInstaller artifact, not the source of
  truth - build.ps1 drives everything via CLI flags.

## Versioning

- `app/version.py` - from source the version is `git describe --tags --always`
  (leading `v` stripped); frozen exes use the baked value. Displayed in the
  bottom-right corner.
- Commits are named `AstroPilot X.Y.Z` and tagged `vX.Y.Z` (e.g. `AstroPilot
  0.1.7` / `v0.1.7`). Tag BEFORE rebuilding if you want the exe to show it.

## Architecture

- `main.py` - entrypoint. Starts uvicorn in a daemon thread, opens the UI in a
  pywebview window (browser app-mode fallback). Single-instance handoff via
  `data/instance.json`; exits after 12 h idle by default. A `JsApi` class is
  passed to the pywebview window (`window.pywebview.api`) exposing a native
  folder picker - browser mode has no bridge.
- `app/server.py` - `create_app(db)` FastAPI factory with all `/api/*` routes
  (docs endpoints disabled; `prefetch=False` skips the image-cache thread,
  used by tests). Computation and helpers live in separate modules:
  `app/nightcalc.py` (`compute_night()`, `object_detail()`, `ceil_lookup()`,
  `longest_run()` - the 6-min/4-min time grids, sun/moon tracks and
  rounding rules), `app/ingest.py` (streaming FITS ingest with a 1 GiB cap),
  `app/backup.py` (export/import ZIP: settings, sites, rigs, panoramas,
  custom targets, and the images library incl. files).
- `app/astro.py` - pure-Python astronomy engine (J2000 precession, sidereal
  time, Saemundsson refraction, Meeus sun/moon series). Golden-value tests
  live in `tests/test_astro.py`. Its JS mirror `static/js/astro.js` is used
  to synthesize tracks for advanced-mode objects in the browser.
- `app/planning.py` - night-window/twilight search, the single source of truth
  for both /api/night and /api/object/{oid}. Never reimplement twilight logic
  elsewhere.
- `app/database.py` - SQLite, schema created on init, catalog seeded from
  `catalog_data.py`. `new_id()` generates custom-object ids (`u_*`).
  `advanced_objects` table is bulk-seeded from `app/data/openned.csv`
  (OpenNGC-derived, CC BY-SA 4.0; regenerate via
  `scripts/build_adv_catalog.py`).
- `app/fits.py` - hand-written FITS header parser (no astropy) + RA/Dec/date
  parsers + designation-token extraction for object matching.
- `app/imglib.py` - catalog resolution, library grouping, session math.
- `app/paths.py` - source vs PyInstaller-frozen path resolution; when frozen,
  writable `data/`/`logs/` sit next to the exe, `static/` comes from
  `_MEIPASS`.
- `app/images.py` - Wikipedia/Wikidata/DSS2 image fetch chain with on-disk
  cache in `data/imgcache` and a circuit breaker for offline use.
- `static/` - ES modules loaded directly via `<script type="module">`; no
  bundler, imports must resolve to real files on disk. Shared helpers
  (`$`, `$$`, `api()`, `esc`, `applyEdgeSpace`) come from `js/util.js`.
  `js/derive.js` computes visibility/score client-side so changing min-altitude
  never refetches. `js/archive.js` (catalog mode) and `js/skymap.js` (static
  RA/Dec chart) implement the Image Catalog side.

## Advanced mode (12,000+ objects)

- Toggled in the hamburger menu (`adv_mode` setting); changing it reloads the
  page. Standard mode stays the curated 197 objects and is unchanged.
- `/api/night?adv=1` ships advanced objects as METADATA ONLY (id/ra/dec/mag/
  type, no tracks) - the payload stays ~1.5 MB. `synthesizeAdvancedTracks()`
  in `derive.js` computes alt/az/ceil tracks in the browser using
  `static/js/astro.js` (precession once per object at the grid midpoint,
  sidereal time once per SAMPLE via `altazFrame`; the pass yields to the
  event loop every 256 objects so the 12k-object load never freezes the UI).
- Never add track arrays for the full advanced catalog to the night payload;
  that is what the client-side synthesis exists for.
- Advanced rows carry a `_adv` marker from `db.all_objects(advanced=True)`;
  `api_catalog` strips it. Image-ingest resolution and the library use the
  FULL catalog (advanced included) regardless of mode.

## Data & gotchas

- User databases outlive the code - schema changes MUST be additive: new
  columns go in as try/ALTER/except in `Database.__init__`, new tables into
  `SCHEMA`; never drop or re-shape existing columns (see the comment in
  `app/database.py`).
- Panorama obstruction profiles are exactly 720 bins (0.5 deg per azimuth);
  `NO_BLOCK = -90.0`. An empty/short profile means nothing blocks. Panoramas
  carry a `paint_mode` ('obstacle' default | 'sky'): sky mode inverts the
  mask - the profile is the BOTTOM edge of the painted visible sky band and
  `profile_top` (a second 720-bin array, empty in obstacle mode) is its TOP
  edge, so everything below AND above the painted band is blocked (e.g. a
  balcony out of frame); unpainted columns block fully (90 deg); outside the
  FOV follows the mode. The band ceiling ships as `ceil_top` per object from
  /api/night and /api/object only when the active pano has a `profile_top`.
- Archive layout is `<image_dir>/<Object>/lights/<file>.fit` (originals are
  copied, never moved). Older files at the folder root still work.
  Ingest streams header-first with a 1 GiB cap (`app/ingest.py`).
- `/api/object/{oid}/image?thumb=1` is the cache-only thumbnail variant used
  by the targets table (never hits the network, so a 250-row page is
  instant even offline); the detail view uses the full Wikipedia/DSS chain.
- `/api/library/edit` renames/retypes only unresolved objects (`object_id IS
  NULL`); it moves the archive folder on disk and rewrites stored paths.
- Export/import ZIP covers settings, sites, rigs, panoramas, custom targets
  and the images library (rows + files, restored into the configured image
  dir); the import confirm dialog reflects that.
- Sessions: frames of one object whose `date_obs` are < 12 h apart form one
  session (midnight runs count once); undated frames form one trailing
  session.
- `edge_space` setting (px per side) controls tab content width
  (`100vw - 2*edge`); exposed as a slider in the top-right hamburger menu.
- A background `img-prefetch` thread starts on every app start and hits the
  network; the server itself is otherwise local-only.
- Custom targets are deleted via a `u_` id-prefix check - ids without it are
  catalog entries and can't be removed through the API.
- Never commit `data/` contents (db, panos, imgcache) or `logs/`; only
  `data/panos/.gitkeep` is tracked. `app/_version_baked.py` and
  `.pytest-tmp/` are gitignored.