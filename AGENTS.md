# AGENTS.md

AstroPilot: a desktop DSO-planning app that runs a local FastAPI server and
serves a vanilla-JS UI. Pure-Python astronomy (Meeus algorithms) - no
numpy/astropy, no JS build step, no npm. Works fully offline except optional
Wikipedia example images.

## Commands

- Run from source: `python main.py` (default port 8407; `--console` for logs,
  `--no-browser` for headless, `--port N`). Data is created under `data/`
  (gitignored) in the repo root.
- Tests: `python -m pytest tests/` - 28 tests, run in <1 s, pure functions
  only (no DB, no HTTP). `httpx` is in requirements-dev but there are no API
  tests yet.
- No Python linter/formatter configured. The JS "lint" is three scripts that
  must pass after touching `static/`:
  - `python scripts/check_js_imports.py` - broken relative ES-module imports (hard failures)
  - `python scripts/check_dom_ids.py` - `$('#id')` references missing from `index.html`
  - `python scripts/check_js_defs.py` - heuristic; exit code is always 0, review candidates manually
- Build exe: `powershell -ExecutionPolicy Bypass -File build.ps1` ->
  `dist\AstroPilot.exe` (isolated `.venv-build`; kills running AstroPilot
  processes first). PyInstaller is only needed for building.

## Architecture

- `main.py` - entrypoint. Starts uvicorn in a daemon thread, opens the UI in a
  pywebview window (browser app-mode fallback). Single-instance handoff via
  `data/instance.json`; exits after 12 h idle by default.
- `app/server.py` - `create_app(db)` FastAPI factory with all `/api/*` routes
  (docs endpoints disabled). `compute_night()` and `api_object_detail()` share
  the same 6-min/4-min time grids, sun/moon tracks, and `ceil_lookup()`.
- `app/astro.py` - pure-Python astronomy engine (J2000 precession, sidereal
  time, Saemundsson refraction, Meeus sun/moon series). Golden-value tests
  live in `tests/test_astro.py`.
- `app/planning.py` - night-window/twilight search, the single source of truth
  for both /api/night and /api/object/{oid}. Never reimplement twilight logic
  elsewhere.
- `app/database.py` - SQLite, schema created on init, catalog seeded from
  `catalog_data.py`. `new_id()` generates custom-object ids (`u_*`).
- `app/paths.py` - source vs PyInstaller-frozen path resolution; when frozen,
  writable `data/`/`logs/` sit next to the exe, `static/` comes from
  `_MEIPASS`.
- `app/images.py` - Wikipedia/Wikidata/DSS2 image fetch chain with on-disk
  cache in `data/imgcache` and a circuit breaker for offline use.
- `static/` - ES modules loaded directly via `<script type="module">`; no
  bundler, imports must resolve to real files on disk. Shared helpers
  (`$`, `$$`, `api()`, `esc`) come from `js/util.js`. `js/derive.js` computes
  visibility/score client-side so changing min-altitude never refetches.

## Gotchas

- Panorama obstruction profiles are exactly 720 bins (0.5 deg per azimuth);
  `NO_BLOCK = -90.0`. An empty/short profile means nothing blocks.
- A background `img-prefetch` thread starts on every app start and hits the
  network; the server itself is otherwise local-only.
- Custom targets are deleted via a `u_` id-prefix check - ids without it are
  catalog entries and can't be removed through the API.
- Never commit `data/` contents (db, panos, imgcache) or `logs/`; only
  `data/panos/.gitkeep` is tracked.