# AGENTS.md

> **Repository status — CANONICAL.** This is the living AstroPilot project:
> all commits, tags, web releases and deploys happen here.
> `<archive>\Object-Astro` is a DEPRECATED archive (frozen at v0.4.1) —
> treat it as read-only and never commit, tag or deploy there. The web
> sub-version (`web/`, AstroPilot Web v0.5.0) is fully integrated in this
> repo with the same history and tags (`v0.4.2`, `v0.5.0`).

> **Design — READ `DESIGN.md` before any UI work.** Glass (`dome`) is the
> project's design language and the web default. Every UI change must follow
> its tokens, glass surfaces, typography and structural rules (themes.css
> dome blocks in `web/` and `static/` are the reference implementation).
> "Classic" is a flat fallback, not a second language.

AstroPilot: a desktop DSO-planning app that runs a local FastAPI server and
serves a vanilla-JS UI. Pure-Python astronomy (Meeus algorithms) - no
numpy/astropy, no JS build step, no npm. Works fully offline except optional
Wikipedia example images. Two modes: Night Planner and Image Catalog (FITS
ingest + library), switched via the top-right button or the brand name.

## Commands

- Run from source: `python main.py` (default port 8407; `--console` for logs,
  `--no-browser` for headless, `--port N`, `--version` prints the version).
  Also `--browser` (tab instead of app window) and `--idle-exit-hours 0` (never exit on idle - the default is
  12 h, which kills a server an agent left running). Data is created under
  `data/` (gitignored) in the repo root. Port-8407 traps:
  - A stale `dist\AstroPilot.exe` (frozen OLD code) can silently hold the
    port; `python main.py` then hands off to it via `data/instance.json`
    instead of starting. Before probing: kill AstroPilot.exe/python/chrome,
    delete `data/instance.json`, then verify the listener's process NAME is
    python.exe (`Get-NetTCPConnection -LocalPort 8407` -> OwningProcess ->
    `Get-CimInstance Win32_Process`), not the exe. The handoff now also
    applies to `--no-browser` (it exits 0 instead of starting a SECOND
    instance on the same DB/archive), and `free_port()` probes with
    `connect()` - a plain bind probe cannot see a live listener on Windows
    when both sockets set SO_REUSEADDR.
  - If 8407 is briefly taken at boot, `free_port()` silently picks a RANDOM
    port (written to instance.json) - the app runs, just not on 8407.
- Tests: `python -m pytest tests/` - 135 tests, run in ~28 s (pure-function
  tests are fast; `tests/test_api.py` spins up real `create_app()` instances
  via fastapi TestClient/httpx). Single test:
  `python -m pytest tests/test_astro.py -k name`. API tests use
  `create_app(db, prefetch=False)` so no image-cache thread hits the network;
  the archive is pointed at a tmp dir per test. A broken Windows temp-dir ACL
  means pytest runs use a repo-local `.pytest-tmp` base (see `pytest.ini`).
  Under the DSH file sandbox, Python 3.14's `os.mkdir(mode=0o700)` (which
  pytest uses for the basetemp) creates an owner-SID-only DACL that the
  sandbox's restricted token cannot re-read, so every tmp_path test errors
  with PermissionError - an environment artifact, NOT a code failure. Run
  the suite with full access / in a normal shell: 135/135 pass (~28 s).
- PowerShell quirk: heredocs / inline `python -c` with quotes break - write
  probe scripts to files (`C:\Users\<user>\AppData\Local\Temp\opencode\`) and
  run them.
- Live UI verification uses CDP (headless Chrome on port 9222, profile
  `chrome-prof2`/`chrome-prof3` in the temp dir): Chrome now needs
  `--remote-allow-origins=*` (else websocket 403); pass
  `Network.setCacheDisabled` + a `?v=` query or the page serves stale files;
  `S` (state.js) is NOT global - probe the DOM/API, not `S.*`; patch
  `window.alert` instead of accepting dialogs; kill chrome between runs
  (instances accumulate on 9222). Chrome CANNOT launch under the DSH
  sandbox's restricted token (crashpad/mojo pipe creation is denied) - run
  it with full access, and give the profile an ABSOLUTE path inside the
  workspace (e.g. `theme-preview\.a11y-prof`); a relative or temp-dir path
  fails with "requires a non-default data directory" / lock-file errors.
- No Python linter/formatter configured. The JS "lint" is three scripts that
  must pass after touching `static/` OR `web/`; `python scripts/check_js.py`
  runs all three and exits non-zero on hard failures (recommended one-command
  check). Both JS graphs are covered - namespace and bare side-effect imports
  included (a wrong path there kills the module graph just like a bad named
  import), and `export let/var/class` counts as an export:
  - `python scripts/check_js_imports.py` - broken relative ES-module imports and named imports missing from the target's exports (hard failures)
  - `python scripts/check_dom_ids.py` - `$('#id')` references missing from that app's `index.html` (desktop and web separately)
  - `python scripts/check_js_defs.py` - heuristic; exit code is always 0, review candidates manually
  Also `python C:\Users\<user>\AppData\Local\Temp\opencode\check_esm.py`
  checks the ES-module graph (same job as check_js_imports, keep in sync).
- Build exe: `powershell -ExecutionPolicy Bypass -File build.ps1` ->
  `dist\AstroPilot.exe` (isolated `.venv-build`; kills running AstroPilot
  processes first). PyInstaller is only needed for building. The build bakes
  the current `git describe` version into a gitignored `app/_version_baked.py`
  and bundles `app/data` (the advanced catalog CSV) via `--add-data`. The
  committed `AstroPilot.spec` is a PyInstaller artifact, not the source of
  truth - build.ps1 drives everything via CLI flags. The bake uses
  `git describe --tags --always --dirty` and warns when the tree is dirty or
  HEAD is not exactly a tag, so a build from uncommitted work is labelled
  `<version>-dirty` instead of silently claiming a clean tag. The build never
  touches `dist\data` - the frozen app's user data (db, imgcache) next to the
  exe survives rebuilds.
  Note: the `pip install` phases at the top of build.ps1 can HANG for many
  minutes with no network. `.venv-build` is complete after the first build,
  so when pip stalls, kill it and run the rest manually: bake
  `app/_version_baked.py` from `git describe --tags --always --dirty` (e.g.
  `Set-Content app\_version_baked.py "BAKED_VERSION = '<ver>'"`) then
  `.\.venv-build\Scripts\python.exe -m PyInstaller --clean --noconfirm
  --onefile --noconsole --name AstroPilot --icon assets\app.ico
  --add-data "static;static" --add-data "app\data;app\data"
  --collect-all uvicorn --collect-all webview
  --hidden-import python_multipart main.py`. A direct PyInstaller run takes
  ~90 s; the whole build.ps1 normally takes ~8 min.

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
- `app/fits.py` - hand-written FITS parser (no astropy): header keywords,
  RA/Dec/date parsers, designation-token extraction for object matching, and
  `preview_png_file()` - a strided, pure-stdlib grayscale PNG thumbnail of
  the image data (currently used only by tests; the UI dropped frame
  thumbnails). BITPIX 8 is
  unsigned, 16/32-bit signed, -32/-64 floats. `parse_ra_hours` /
  `parse_dec_deg` are the SINGLE source for coordinate parsing -
  `app/server.py` imports them from here; never re-implement elsewhere.
  Compressed FITS is unsupported by design - nothing decompresses it.
  `read_fits_header()` needs `SIMPLE` at byte 0 and reads the PRIMARY HDU
  only, but an fpack `.fits.fz` has an empty stub primary: the original
  OBJECT/DATE-OBS/EXPTIME/FILTER and the `ZNAXIS*`/`ZBITPIX` geometry sit in
  the SECOND HDU header (`BINTABLE` + `ZIMAGE = T`), out of its reach.
  Ingest and reindex also accept only `.fit`/`.fits` (`app/ingest.py`), so
  `.fz`/`.fits.gz` never enter the archive. Cheapest future step is walking
  HDU headers (no decompression); pixels would need a RICE tile decoder, and
  a whole-file `.gz` defeats `preview_png_file()`'s per-sample seeks (gzip
  re-inflates from the start on every seek).
- Popularity (The popularity source): `catalog_data.POPULARITY` (193/197 curated) and
  `app/adv_popularity_data.py` `ADV_POPULARITY` (7,408 advanced) are
  community scores used as a SILENT TIEBREAKER in ranking (visibility score
  decides, popularity separates equals) - see `popularityFactor()` in
  `static/js/derive.js` (log-scale, ~0.3-1.0) and the web's `popularityOf()`
  in `web/app.js` (live fetch with baked-catalog fallback). `objects` and
  `advanced_objects` carry the scores via `Database.apply_popularity()`
  (runs every start; `advanced_objects` column is additive). `build_web.py`
  bakes popularity into `web/catalog.json`. Grade tiers were REMOVED.
  The matcher regenerator is `scripts/match_popularity.py` (fetches
  popularity-source.invalid, caches to `data/popularity_snapshot.json` - gitignored);
  root-level match/debug scripts from the original match pass are
  gitignored scratch. Moon-age-aware scoring: `astro.moon_age()` /
  `web/astro.js` `moonAge()`, shipped as `moon_age_days` in /api/night;
  `derive.js` applies phase-dependent min-moon-distance (Lorentzian),
  filter-aware + bortle-scaled.
- `app/imglib.py` - catalog resolution, library grouping (per-frame-type and
  per-filter integration rollups), session math.
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
- Archive layout is
  `<image_dir>/<Object>/<session>/<lights|darks|flats|bias>/<file>.fit`
  (originals are copied, never moved). The `<session>` folder is the
  capture night (`YYYY-MM-DD_HHMM` start time, or `undated`) - frames
  whose DATE-OBS are < 12 h apart share one folder (midnight runs count
  once), so different nights get different folders with their own four frame
  sub-folders (created on first ingest). Session-folder digits are the
  MACHINE-LOCAL wall clock of the session start (`ingest.session_folder_name`
  uses `datetime.fromtimestamp`), so on a UTC+2 machine a session starting
  23:14 UTC is stored as `2026-08-23_0114` while the library renders the same
  instant as `01:14` in the effective zone - folder date and displayed date can
  therefore differ by one day, and that is expected. The
  sub-folder comes from the FITS
  IMAGETYP header at ingest (`app/ingest.py classify_frame()`); unknown
  types land in `lights`. The ingest endpoint takes an optional `frame` form
  field that forces the target type (used by the per-session +darks/+flats/
  +bias buttons in the "Recent imports" list).
  Older files at the object-folder root still work.
  `POST /api/library/reindex` (button in the import pane) scans the archive
  on disk and records .fit/.fits files not yet in the DB (dedup on the
  normalized relative path; frame type from the sub-folder when present,
  else IMAGETYP; object from header + folder-name fallback) - for manual
  copies and restored backups.
- Import history: `import_batches` table; `/api/images/ingest` records one
  batch per (object, session, frame) group (`GET /api/library/imports`,
  newest first). The client uploads in chunks of 8 and sends a `run_id`
  (UUID) per import action; `db.merge_import_batch()` merges chunk rows on
  (run_id, slug, session, frame), so one upload of a whole session stays ONE
  history item. The ingest endpoint also takes a `session` form field
  (sanitized with `_SESSION_NAME_RE`) that forces the archive sub-folder -
  used by the per-import +darks/+flats/+bias buttons in the "Recent
  imports" list. The `session` value must be the BARE folder name
  (`2026-08-22_2000`), NOT `slug/session` - a slash fails the regex and the
  upload silently falls back to the automatic session.
  `POST /api/library/open_folder` ({rel}) opens a folder
  inside the archive in the OS file explorer (`os.startfile`, Windows).
  Ingest streams header-first with a 1 GiB cap (`app/ingest.py`). Library
  groups carry per-type and per-filter rollups (`imglib.group_library`);
  the FITS preview PNG machinery (`fits.preview_png_file`,
  `/api/images/{id}/preview`) is currently only exercised by tests - the
  library UI no longer shows frame thumbnails.
- Session journal was REMOVED (desktop + web) — no `/api/object/{oid}/observed`
  endpoints, no journal UI, no observed marks/filters. The `observations`
  table still exists in the DB (schema is additive-only) and is no longer
  exported/imported; leave it untouched.
- `/api/object/{oid}/image?thumb=1` is the cache-only thumbnail variant used
  by the targets table, tonight view and detail placeholder (never hits the
  network, so a 250-row page is instant even offline); the detail view's
  background image upgrade uses the full Wikipedia/DSS chain (8 s abort).
  NEVER point a list/repeated view at the full-chain endpoint - a handful of
  pending full-chain requests starve the browser's 6-connections-per-host
  limit and wedge unrelated local API calls (the "wizard stuck busy" bug).
- `/api/library/edit` renames/retypes only unresolved objects (`object_id IS
  NULL`); it moves the archive folder on disk and rewrites stored paths.
- Export/import ZIP covers settings, sites, rigs, panoramas, custom targets,
  and the images library (rows + files, restored into the configured image
  dir); the import confirm dialog reflects that. Every import first writes a
  best-effort safety copy of the CURRENT setup to `<db>.backup-auto.zip`
  next to the database (`data/astropilot.backup-auto.zip` in prod) - an
  interrupted restore never destroys the pre-import data; the summary
  reports it as `auto_backup`. Uploads stream to disk in 1 MB chunks
  (`_drain_upload` in server.py: pano upload/replace write straight to the
  pano dir, `/api/import` spools to a temp file next to the db) and the
  safety copy streams zip entries directly to disk, so multi-GB libraries
  never double-buffer in RAM; `apply_import_zip` accepts bytes or a Path.
- Numeric inputs accept comma OR dot decimals everywhere (German locale):
  `num()` in `util.js` parses both; typable numerics are text+`inputmode`.
  `api()` in util.js adds a 30 s timeout unless the caller passes its own
  abort signal (the night loader does).
- The first-run wizard (`js/wizard.js`) is hardened: replay pre-fills and
  EDITS the active site (PUT, never duplicates), typed values survive
  Back/Next, forms never submit/reload, Skip is hidden only on the
  mandatory site step without a site, and a 20 s guard unsticks a hung
  validate. Errors show inline - never assert a wizard "works" by happy-path
  alone.
- Sessions: frames of one object whose `date_obs` are < 12 h apart form one
  session (midnight runs count once); undated frames form one trailing
  session.
- `edge_space` setting (px per side) controls tab content width
  (`100vw - 2*edge`); exposed as a slider in the top-right hamburger menu.
- Themes: `static/themes.css` holds all alternate looks as pure token
  overrides of `style.css`'s `:root` variables (plus per-theme character
  rules), switched via `<html data-theme="...">`. A picker lives in the
  hamburger menu ("Appearance"); the choice persists as the `theme`
  setting. An inline head script fetch of `/api/state` applies the saved
  theme before first paint (one sync XHR, ~1 ms, local only). Themes:
  "" default, `dome` Glass (the chosen direction: CSS starfield,
  floating glass bar + attached pill tab dock + telemetry chip +
  centered sheet menu, draggable popups via `js/dragwin.js`). Earlier
  themes (obs/log/deep/atlas/etch/instruments/deck/cockpit/dispatch)
  were removed; a
  saved `theme` setting naming a removed theme falls back to the
  default look. To add a theme, copy one block in
  themes.css and add a `.theme-btn` in `index.html` - no JS changes
  needed beyond the button's `data-theme` value.
- Structural themes are pure CSS: one shared HTML skeleton, so layout
  identity comes from position:fixed rails/docks/drawers, flex order and
  transforms - never from moving IDs or touching JS. When writing such a
  theme: never override the `.hidden` class, never set `display` on
  `#tabs-cat` (app toggles it via `body.catmode`, same for
  `#plannerControls`/`#tabs`/`#nightInfo`), keep every control visible
  and clickable, offset `main`/`body` so pinned chrome never covers
  content, stay below z-index 100 (toasts = 300, popover = 60,
  modal = 40, #versionTag = 5).
- A11y invariants (desktop + web): every modal opens with
  `role="dialog" aria-modal="true" aria-labelledby=<h2 id>`; a delegated
  Tab focus trap lives in `util.js` (`initFocusTrap`, wired at boot) and
  keeps focus inside the open dialog. Keep that pattern when adding
  modals. Search inputs carry an accessible name (`<label>` or
  `aria-label`); click-only controls (like `#brand`) get
  `role="button" tabindex="0"` + an Enter/Space handler (`bindKeyboardClick`).
- `bortle` setting (1-9, hamburger menu) shifts the default min-altitude
  (`17 + 2*bortle`, only when no explicit min alt is stored) and scales the
  moon-aware scoring penalty. Moon-aware scoring uses the angular separation
  between target and Moon plus a per-type sensitivity (nebulae/SNR suffer
  most, clusters least) - see `MOON_TYPE_FACTOR` and `sepDeg()` in
  `derive.js`.
- Keyboard shortcuts: ArrowLeft/Right scrub the night (Shift = 10 min), `n`
  cycles the tabs (skipped while typing or with a modal open).
- Timezones: all server payload times are UTC; the client sends
  `tz_offset_min` computed AT the selected date (`tzOffAt()` in util.js -
  DST-aware, so planning a winter night in summer is not shifted), and
  renders via `fmtT()`/`zoneHour()` which apply the effective zone per
  instant. The effective zone is the `timezone` setting (IANA name, stored
  empty = machine local; hidden in the hamburger menu unless advanced mode
  is on) or the machine zone. (The session journal is gone; no journal
  entries exist anymore.)
- `/api/library/export?format=csv|json` downloads the library.
- The targets filter bar has a constellation select (`fConst`).
- A background `img-prefetch` thread starts on every app start and hits the
  network; the server itself is otherwise local-only.
- Custom targets are deleted via a `u_` id-prefix check - ids without it are
  catalog entries and can't be removed through the API.
- Never commit `data/` contents (db, panos, imgcache) or `logs/`; only
  `data/panos/.gitkeep` is tracked. `app/_version_baked.py` and
  `.pytest-tmp/` are gitignored.

## Web sub-version (web/)

- `web/` is AstroPilot Web, a static in-browser planner: same Meeus engine
  (JS mirror `web/astro.js`), same catalog, and Tier-1 user data (sites,
  rigs, custom targets) mirrored from the SQLite tables into IndexedDB via
  `web/webstore.js`. It shares THIS repo's version line: commits
  `AstroPilot X.Y.Z` and tags `vX.Y.Z` cover both the desktop app and the
  web. (The session journal/observations were removed from the web too.)
- The web catalog is ALWAYS derived: `python web/build_web.py catalog` reads
  `data/astropilot.db` (`objects` + `advanced_objects`, insertion order) and
  rewrites `web/catalog.json` — byte-identical to the committed file,
  verified by SHA. Never hand-edit catalog.json.
- Release flow for the web: commit + tag, THEN
  `python web/build_web.py version` (writes gitignored `web/version.json`
  from `git describe`, same idea as `_version_baked.py` for the exe), THEN
  deploy. The web footer reads version.json; without it it shows "dev build".
- Deploy (Plesk FTPS, pitop.net): the app is served ONLY at `/astro`
  (`web/ftps_deploy.py uploadtree web /astro`); the site root `/` is a
  landing page from `landing/` (index.html + style.css + app.png,
  `web/ftps_deploy.py uploadtree landing /`). Keep `/` free of app files —
  stale ones are removed with `web/ftps_deploy.py remove <remote-path> --yes`
  (file or recursive dir; `--yes` is mandatory and the webspace root is
  refused outright). uploadtree/uploadmany additionally refuse to publish
  pages that still contain template placeholders (landing/impressum.html)
  unless `--force` is passed. Credentials live OUTSIDE the repo: pass
  `--env <path>` pointing at ftp.env (never committed). Cloudflare serves
  the remote site and injects a script into delivered index.html —
  hash-verify only after stripping that block.
  FTP gotchas: the `upload` command's remote name is FTP-ROOT-relative in
  practice, so ALWAYS pass the full path (`upload web/app.js /astro/app.js`,
  `upload dist/release/version.json /downloads/version.json`) - a bare name
  silently lands in `/`. Also, ProFTPD kills a reused control connection
  after ~2 transfers, so `uploadtree` often stalls mid-tree; when it does,
  upload the remaining/changed files individually (one fresh connection
  per file) and verify with `download` or `list`.
- Public release artifacts live under `/downloads/` on the site
  (`dist/release/` content — see `scripts/make_release.py`): the desktop
  zip, `AstroPilot-latest.zip` (stable name for the download page's no-JS
  fallback link), `version.json` (read by the landing page) and
  `ap-version.js` (JSONP — read by the desktop app's startup update
  checker, since a localhost origin cannot fetch cross-origin JSON). Never
  upload the developer's `dist\data` — `make_release.py` stages a clean
  package. The release flow also runs `python scripts/build_changelog.py`
  (it warns loudly when a released tag has no curated summary) so the
  download page's "What's new" cannot silently go stale again.
- Sync from the dev mirror: robocopy `<workspace>\Astro-Web` -> `web/` (exclude
  `.git` and `ftp.env`), then commit here. `web/.gitignore` covers the dev
  mirror leftovers (`whale/`, `dev/`).
- Custom targets keep the `u_*` id rule.
  Visibility scoring/keyboard shortcuts/timezone handling match the desktop
  semantics (per-site IANA timezone, DST-aware via Intl).