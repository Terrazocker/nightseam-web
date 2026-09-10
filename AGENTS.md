# AGENTS.md

> **Repository status — CANONICAL.** This is the living NightSeam project:
> all commits, tags, web releases and deploys happen here.
> `<archive>\Object-Astro` is a DEPRECATED archive (frozen at v0.4.1) —
> treat it as read-only and never commit, tag or deploy there. The web
> sub-version (`web/`, NightSeam Web v0.5.0) is fully integrated in this
> repo with the same history and tags (`v0.4.2`, `v0.5.0`).

> **Design — READ `DESIGN.md` before any UI work.** Glass (`dome`) is the
> project's design language and the web default. Every UI change must follow
> its tokens, glass surfaces, typography and structural rules (themes.css
> dome blocks in `web/` and `static/` are the reference implementation).
> "Classic" is a flat fallback, not a second language.

NightSeam: a desktop DSO-planning app that runs a local FastAPI server and
serves a vanilla-JS UI. Pure-Python astronomy (Meeus algorithms) - no
numpy/astropy, no JS build step, no npm. Works fully offline except optional
Wikipedia example images. Two modes: Night Planner and Image Catalog (FITS
ingest + library), switched via the top-right button or the brand name.

## Context discipline (read before starting work)

The transcript is the budget. These rules measurably cut it - this section wins
over the fuller commands below wherever they differ:

- **Batch edits to this file.** Every edit re-injects all of AGENTS.md (~25 KB).
  Collect documentation changes and apply them in ONE write, at the end if you can.
- **Run tests cheaply:** `python -m pytest tests/ -q --tb=no`, and only the modules
  that matter (`python -m pytest tests/test_astro.py tests/test_planning.py -q`).
  The full suite prints ~14 KB of sandbox `PermissionError`s that say nothing new -
  run it once, at the end of the work.
- **Never dump output into chat:** no build/tool logs, no whole files, no raw grep
  matches. Use `read` with `offset`/`limit`, read tails, or counts
  (`Select-String -Quiet`, `Measure-Object`) instead - a count costs one line, a
  dump costs thousands.
- **Delegate bulk reading:** anything touching 2-3+ files goes to a subagent with a
  self-contained prompt and an explicit "return a digest, not the files".
- **Write findings to files** (`AUDIT.md`-style) and reference the path in chat
  instead of pasting content.
- **`/compact` at phase boundaries** - when one task ships and the next starts -
  and start a new session per deliverable rather than letting the meter fill.
  (`/compact` condenses older history on demand, keeps recent turns, and consumes
  no model turn.)

## Commands

- Run from source: `python main.py` (default port 8407; `--console` for logs,
  `--no-browser` for headless, `--port N`, `--version` prints the version).
  Also `--browser` (tab instead of app window) and `--idle-exit-hours 0` (never exit on idle - the default is
  12 h, which kills a server an agent left running). Data is created under
  `data/` (gitignored) in the repo root. Port-8407 traps:
  - A stale `dist\NightSeam.exe` (frozen OLD code) can silently hold the
    port; `python main.py` then hands off to it via `data/instance.json`
    instead of starting. Before probing: kill NightSeam.exe/python/chrome,
    delete `data/instance.json`, then verify the listener's process NAME is
    python.exe (`Get-NetTCPConnection -LocalPort 8407` -> OwningProcess ->
    `Get-CimInstance Win32_Process`), not the exe. The handoff now also
    applies to `--no-browser` (it exits 0 instead of starting a SECOND
    instance on the same DB/archive), and `free_port()` probes with
    `connect()` - a plain bind probe cannot see a live listener on Windows
    when both sockets set SO_REUSEADDR.
  - If 8407 is briefly taken at boot, `free_port()` silently picks a RANDOM
    port (written to instance.json) - the app runs, just not on 8407.
- Tests: `python -m pytest tests/` - 162 tests, run in ~36 s (pure-function
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
  the suite with full access / in a normal shell: 162/162 pass (~36 s).
  Careful with the `client` fixture: it must leave `data/panos` in place
  under the tmp dir it patches in, because the pano upload route writes
  there without mkdir'ing (the real `data_dir()` creates it). Without that
  the three pano API tests only pass while a recycled `.pytest-tmp` happens
  to still hold the folder.
- Sandbox gotcha (cost me three attempts): a command whose stdout is piped
  into another PowerShell command dies with "Zugriff verweigert" (named-pipe
  EPERM), so `python -m pytest ... | Select-Object` never runs - same for
  `git log ... | Select-Object` (git itself is fine, the PIPE dies). Run the
  tool bare, or have a small python wrapper write the log to a FILE **inside
  the repo** (the platform temp dir is not writable for spawned processes) and
  read that instead.
- Any tool that shells out with `capture_output=True` / piped stdio dies the
  same way. Concretely: `python web/build_web.py version` fails with
  `PermissionError: [WinError 5]` from `_winapi.CreatePipe` (it pipes
  `git describe`). It is a release step, so run that ONE command with full
  access - or bake `web/version.json` by hand in the same shape
  (`{"version","describe","built"}`, `version = describe.lstrip("v")`,
  `built` = ISO-8601 UTC, seconds).
- `git commit` / `git tag` work from the sandboxed shell, but git's background
  auto-maintenance then complains "cannot create standard input pipe for
  pack-objects: Permission denied" / "task 'geometric-repack' failed". That is
  noise, not a failed commit - confirm with `git log -1` / `git describe`.
  It ALSO puts a Windows message box on the USER's desktop: a commit spawns a
  DETACHED `git maintenance run --auto` child, that child cannot initialise
  under the restricted token and dies as `git.exe - Application Error ...
  (0xc0000142)` (= STATUS_DLL_INIT_FAILED) - the `git` we call is fine, only
  that spawn is, so the dialog is harmless and no work is at risk. The trigger
  is a DEFAULT, not config: `maintenance.auto` is true with nothing set
  (`git config --get maintenance.auto` exits 1, no `maintenance.repo`
  registration exists, yet a commit runs the task). This repo therefore carries
  `maintenance.auto=false` + `gc.auto=0` in its LOCAL config - repo config is
  invisible to `git status`, so it costs no release window. Undo with
  `git config --unset maintenance.auto`; to keep background maintenance
  instead, set `maintenance.autoDetach=false` (it then fails in-process and
  only prints the pipe noise). Never run `git gc` from the sandboxed shell -
  same pipe denial; the store is healthy without it
  (`git fsck --connectivity-only` = only the usual dangling objects, 3 packs,
  0 loose, 22 MB).
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
- **Chrome may refuse to run here even escalated - do not burn turns on it.**
  On 2026-09-10 `chrome --headless=new --dump-dom` (plus `--no-sandbox
  --disable-crash-reporter`, fresh `--user-data-dir` inside the workspace,
  tried via `&` and via `Start-Process -Wait -PassThru`) returned exit 0 with
  ZERO bytes even for `data:text/html,<h1>HI</h1>`, under the restricted token
  and after a `danger-full-access` escalation was approved. Verify UI work
  without a browser instead:
  - `node --check` for syntax (Node 24 is installed): copy the file to
    `*.mjs` first, otherwise `import` is not legal to parse.
  - structure of a JS-built template: extract `modal.innerHTML = \`...\``,
    blank out every `${...}` (count nested braces), then stack-walk the tags
    with `html.parser`. Pick the RIGHT occurrence - several modals assign
    `modal.innerHTML`; the Setup dialog is the match whose next ~300 chars
    contain `modal settings`.
  - the DEPLOYED web app: FTP is ground truth - `ftps_deploy.py download
    /astro/<file> <tmp>` + `Get-FileHash` against the local file, plus
    `web_fetch` on `/astro/version.json` and `/astro/index.html` as the public
    end-to-end check. (For 0.6.1 all five changed files matched byte-for-byte.)
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
  `dist\NightSeam.exe` (isolated `.venv-build`; kills running NightSeam
  processes first). PyInstaller is only needed for building. The build bakes
  the current `git describe` version into a gitignored `app/_version_baked.py`
  and bundles `app/data` (the advanced catalog CSV) via `--add-data`. The
  committed `NightSeam.spec` is a PyInstaller artifact, not the source of
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
  --onefile --noconsole --name NightSeam --icon assets\app.ico
  --add-data "static;static" --add-data "app\data;app\data"
  --collect-all uvicorn --collect-all webview
  --hidden-import python_multipart main.py`. A direct PyInstaller run takes
  ~90 s; the whole build.ps1 normally takes ~8 min.

## Versioning

- `app/version.py` - from source the version is `git describe --tags --always`
  (leading `v` stripped); frozen exes use the baked value. Displayed in the
  bottom-right corner.
- Commits are named `NightSeam X.Y.Z` and tagged `vX.Y.Z` (e.g. `NightSeam
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
  next to the database (`data/nightseam.backup-auto.zip` in prod) - an
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

- `web/` is NightSeam Web, a static in-browser planner: same Meeus engine
  (JS mirror `web/astro.js`), same catalog, and Tier-1 user data (sites,
  rigs, custom targets) mirrored from the SQLite tables into IndexedDB via
  `web/webstore.js`. It shares THIS repo's version line: commits
  `NightSeam X.Y.Z` and tags `vX.Y.Z` cover both the desktop app and the
  web. (The session journal/observations were removed from the web too.)
- The web catalog is ALWAYS derived: `python web/build_web.py catalog` reads
  `data/nightseam.db` (`objects` + `advanced_objects`, insertion order) and
  rewrites `web/catalog.json` — byte-identical to the committed file,
  verified by SHA. Never hand-edit catalog.json.
- Release flow for the web: commit + tag, THEN
  `python web/build_web.py version` (writes gitignored `web/version.json`
  from `git describe`, same idea as `_version_baked.py` for the exe), THEN
  deploy. The web footer reads version.json; without it it shows "dev build".
- Deploy (Plesk FTPS, nightseam.de): the app is served ONLY at `/astro`
  (`web/ftps_deploy.py uploadtree web /astro`); the site root `/` is a
  landing page from `landing/` (index.html + style.css + app.png,
  `web/ftps_deploy.py uploadtree landing /`). Keep `/` free of app files —
  stale ones are removed with `web/ftps_deploy.py remove <remote-path> --yes`
  (file or recursive dir; `--yes` is mandatory and the webspace root is
  refused outright). uploadtree/uploadmany additionally refuse to publish
  pages that still contain template placeholders (landing/impressum.html)
  unless `--force` is passed. Credentials live OUTSIDE the repo: pass
  `--env <path>` pointing at ftp.env (never committed). Cloudflare sat in
  front of the OLD domain, where it injected a script into delivered
  index.html; nightseam.de currently resolves straight to the Plesk host
  (<server-ip>), so a downloaded file should hash-match the local one —
  only strip an injected block if a proxy is put in front again.
  FTP gotchas: the `upload` command's remote name is FTP-ROOT-relative in
  practice, so ALWAYS pass the full path (`upload web/app.js /astro/app.js`,
  `upload dist/release/version.json /downloads/version.json`) - a bare name
  silently lands in `/`. Also, ProFTPD kills a reused control connection
  after ~2 transfers, so `uploadtree` often stalls mid-tree; when it does,
  upload the remaining/changed files individually (one fresh connection
  per file) and verify with `download` or `list`.
- Public release artifacts live under `/downloads/` on the site
  (`dist/release/` content — see `scripts/make_release.py`): the desktop
  zip, `NightSeam-latest.zip` (stable name for the download page's no-JS
  fallback link), `version.json` (read by the landing page) and
  `ns-version.js` (JSONP — read by the desktop app's startup update
  checker, since a localhost origin cannot fetch cross-origin JSON). Never
  upload the developer's `dist\data` — `make_release.py` stages a clean
  package. The release flow also runs `python scripts/build_changelog.py`
  (it warns loudly when a released tag has no curated summary) so the
  download page's "What's new" cannot silently go stale again.
- **Release order matters** (getting it wrong publishes a version named
  `0.6.0-dirty`): commit + tag FIRST, then `scripts/make_release.py` and
  `web/build_web.py version` **while HEAD is exactly at the tag and the
  tree is clean** — both call `git describe --dirty`, so ANY uncommitted
  change (including the changelog below) leaks into the published version.
  Run `scripts/build_changelog.py` LAST: it rewrites the TRACKED
  `landing/changelog.json`, so commit that as its own follow-up commit. That
  is why the deployed tree sits after the tag (`v0.6.0` -> changelog commit),
  exactly as `v0.5.12` did. Adding a curated entry for a release is part of
  shipping it — otherwise the download page silently has nothing to show.
  Deploy credentials live outside the repo: `--env <workspace>\Astro-Web\ftp.env`.
- `uploadtree`/`uploadmany` never upload `.gitignore`, `build_web.py`,
  `ftps_deploy.py`, `whale/`, `dev/`, `node_modules/`, `__pycache__/` or any
  `*.pyc` (the `SKIP` set plus the `.pyc` check in `web/ftps_deploy.py`).
  Before 0.6.0 a stray `/astro/__pycache__` did get published once — keep
  that list current when tooling is added next to the app.
- Web asset cache-busting is manual and per module: `web/index.html` carries
  `app.js?v=N` and `web/app.js` carries a `?v=` on each import
  (`astro.js`, `horizon.js`, `webstore.js`, `dragwin.js`). Bump the token of
  every module whose BEHAVIOUR changed (comment-only edits do not need it) or
  returning visitors keep the old file. Current: `app.js?v=27`,
  `horizon.js?v=12`, `webstore.js?v=5`, `astro.js?v=4`, `dragwin.js?v=1`,
  plus `style.css?v=10` / `themes.css?v=2` in `web/index.html`.
  **A token bump is also the cure for a browser that cached a BAD pairing**: an
  `app.js` that calls a module member the cached dependency does not have stays
  broken across plain reloads, because the query string in the import specifier
  is part of the module URL. Bump BOTH the entry point and the dependency.
- **Never publish `index.html` before the modules it names.** A deploy is not
  atomic, and the page carries the `?v=` tokens: uploading it early pairs a
  fresh entry point with stale modules for everyone who loads mid-deploy - that
  is exactly how 0.6.1 shipped `TypeError: WS.seedDefaultRigs is not a
  function` (alphabetical `uploadtree` order put `app.js` first and
  `webstore.js`, after the ~250-file `img/` tree, last). `ftps_deploy.py` now
  sorts with `upload_order()` (HTML last, `index.html` very last) and
  `tests/test_deploy_order.py` pins it. When uploading changed files by hand,
  keep that order: dependencies first, `index.html` last.
- **Setup dialog (web) = tabs**, the same four sections as the desktop's
  Setup dialog (Sites / Rigs / Targets / Backup). `showMTab()` maps
  `data-mtab` → `#mtab-*` panes and `SETTINGS_TAB` keeps the open tab across
  the full re-render that every save/delete triggers; a new section is one
  `.tab` button plus one `.mtabpane`. The web's old "Content margin" slider
  was dropped from the dialog (layout lives in the hamburger menu only).
- **Rig presets are a PICKER, never defaults - a fresh setup is EMPTY**
  (ZWO Seestar S50/S30/S30 Pro, DwarfLab DWARF 3 / mini / II; sensor = the
  imaging sensor's active area, FOV from focal length). Setup → Rigs →
  "＋ Add rig" shows the telescope list plus "Custom rig…", which reveals the
  usual name/focal/sensor form; the desktop does exactly the same
  (`#btnAddRig` → `#rigPicker`, `renderRigPicker()` in `static/js/setup.js`,
  fed by `rig_presets` in /api/state). Desktop data: `app/rig_presets.py`
  (`DEFAULT_RIGS` + `presets_payload()`); the old `POST /api/rigs/presets` and
  its bulk button are GONE. Web twin: `DEFAULT_RIGS` in `web/webstore.js`,
  rendered by `showRigPicker()` - change both lists;
  `tests/test_rig_presets.py` pins `rig_presets.fov_arcmin` to
  `server.fov_arcmin`. 0.6.1/0.6.2 DID auto-seed: `remove_seeded_once(db)`
  (called from `create_app`) and `WS.removeSeededRigs()` (web boot) delete
  those leftovers ONCE and only when a rig still matches a preset exactly - an
  edited or renamed rig is user data and stays. A preset the user adds later is
  never removed again (`rigs_preset_cleaned` setting / `rigsPresetCleaned` pref).
  The framing SELECTOR (`#rigSelect`) sits in the TOPBAR right next to the Site
  control in BOTH apps - 0.6.7 moved it out of the hamburger menu, and
  `tests/test_ui_invariants.py` fails if it creeps back in. Width is capped by
  `#rigSelect` (web `style.css`) and `.controls #rigSelect` (desktop).
- **Popularity is INVISIBLE in the UI (both apps) - never render the number and
  never offer it as a criterion.** Gone: the ✨ marker (`.p-flash`), the web
  catalog's sortable "Popularity" column (+ its sort branch), the detail
  dialog's "Popularity … (The popularity source)" row, the "popularity-aware ranking"
  footer phrase, the web's "Popular" filter chip (`CHIP_LABELS`/`CHIP_FILTERS`
  in `web/app.js`; with it gone, `popularityOf()`'s only remaining caller is
  `popularityFactor()`), and the desktop's `Sort: popularity` option
  (`static/index.html` plus its comparator in `js/targets.js`). What stays is
  scoring only: `popularityFactor()` as the ranking TIEBREAKER inside the
  "imaging quality" sort (visibility decides, popularity separates equals -
  desktop `derive.js`/`targets.js`, web `app.js`), plus the background
  The popularity source fetch with the baked `catalog.json` fallback.
  `tests/test_ui_invariants.py` pins all of this - including that the
  tiebreaker itself is still in place.
- "Free space per side" (web): `main` uses
  `max-width: min(100%, 1500px, max(320px, calc(100% - 2 * var(--edge, 14px))))`,
  so the slider takes that many px off EACH side at every screen size
  (desktop parity; `applyEdge()` writes `--edge`, slider range 0–300). The
  previous rule only shrank via padding above 22px, and its CSS fix shipped
  without a token bump — if a CSS-only fix "does nothing" for a returning
  visitor, that is a stale `style.css`, so always bump its `?v=`.
- **State after the v0.6.8 web deploy (2026-09-10) - read before the next
  release**: `web/version.json` was baked at the tag `v0.6.8`, so `/astro`
  reports 0.6.8; ONE docs-only commit now sits on top of that tag (see the
  DESKTOP note below), which is why the next release has to be tagged
  `v0.6.9`. The
  0.6.2-0.6.8 arc: 0.6.2 hotfixed the 0.6.1 mid-deploy breakage, 0.6.3 hid the
  popularity stat, 0.6.4 made the rig presets a picker (empty default), 0.6.5
  removed the last popularity affordances (chip + desktop sort mode), 0.6.6
  fixed the `hidden` ATTRIBUTE panels an author `display` kept visible
  (`.set-form { display: grid }` beat the UA's `[hidden]` rule, so the sites /
  rigs / custom-target forms rendered before "Add rig" was pressed - restore
  rules now live in `web/style.css`, hide new things with the `.hidden` CLASS),
  0.6.7 moved the framing `#rigSelect` from the hamburger menu into the topbar
  next to Site in both apps (0.6.8 only bumped `style.css?v=9` -> `v=10`, which
  should have gone into 0.6.7 with the CSS - a good reminder to bump the token
  in the SAME commit as the CSS edit).
  The DESKTOP side is still 0.6.0 EVERYWHERE (`dist\NightSeam.exe`,
  `dist\release\*`, `/downloads/*` incl. `ns-version.js`, landing page, and no
  curated changelog entry) - deliberate, because no new exe was built, so
  installed apps correctly see no update. HEAD sat exactly on `v0.6.8` (the
  clean `git describe --dirty` window `make_release.py` needs) only until the
  post-tag docs commit that added the `git.exe (0xc0000142)` note; that window
  is therefore SPENT. Build the desktop as the NEXT tag (`v0.6.9`) instead of
  accepting a `0.6.8-1-g<sha>` version string in the exe, the zip name and
  `/downloads/version.json`, and keep the order: `build.ps1` ->
  `scripts/make_release.py` -> upload `dist/release/*` to `/downloads/` ->
  `build_changelog.py` -> commit `landing/changelog.json` separately. A desktop
  release was already overdue independently: `static/` changed in every 0.6.1 -
  0.6.7 step (sparkle out, rig picker, popularity affordances gone,
  `#rigSelect` in the topbar, the `[hidden]` CSS fix), so the 0.6.0 exe predates
  all of it.
  **Process lesson:** write the session notes BEFORE tagging while a release is
  still pending - the 0.6.1 notes landed as a post-tag commit and cost exactly
  that clean window.
- `web/version.json` is gitignored and baked from the tag: after a later web
  change, a plain `uploadtree web /astro` keeps advertising the old version
  until a new tag + `build_web.py version` run, so re-bake on every deploy.
- FTPS works from the sandbox WITHOUT escalation - reading the out-of-repo
  `--env <workspace>\Astro-Web\ftp.env` is allowed (reads outside the workspace are
  fine, only writes are restricted). For 0.6.1 `uploadtree web /astro` pushed
  the whole tree in one pass; the documented ProFTPD stall did not occur.
- **The dev mirror `<workspace>\Astro-Web` is now BEHIND this repo** - the 0.6.1 web
  work was done here, not there. The robocopy below runs mirror -> repo, so
  running it unchanged would REVERT that work: copy the changed files into the
  mirror first, or skip the sync.
- Sync from the dev mirror: robocopy `<workspace>\Astro-Web` -> `web/` (exclude
  `.git` and `ftp.env`), then commit here. `web/.gitignore` covers the dev
  mirror leftovers (`whale/`, `dev/`).
- Custom targets keep the `u_*` id rule.
  Visibility scoring/keyboard shortcuts/timezone handling match the desktop
  semantics (per-site IANA timezone, DST-aware via Intl).

## Renamed from AstroPilot (v0.5.12 -> NightSeam, site pitop.net -> nightseam.de)

The project, the exe, the web app and the website were renamed. Git history,
tags and past release zips keep the old name — history is NOT rewritten, so
`v0.5.12` and earlier are AstroPilot releases. **`v0.6.0` (2026-09-10) is the
first NightSeam release** and the first one deployed to nightseam.de; commits
from `NightSeam 0.6.0` on are named `NightSeam X.Y.Z`.

- Shipped names: exe/zip `NightSeam.exe` / `NightSeam-<version>.zip` /
  `NightSeam-latest.zip`, spec `NightSeam.spec`, JSONP `ns-version.js`
  (`window.__NS_RELEASE`), log `data/nightseam.log`, downloads
  `nightseam-setup-*.zip` and `nightseam-library.csv|json`, default archive
  folder `NightSeam Images`.
- nightseam.de is a fresh origin on the SAME Plesk webspace
  (<server-ip>), and pitop.net no longer serves the site at all (it
  answers with the Plesk login page), so **nothing is kept for the old name —
  there is no compatibility shim anywhere**: the web app's browser storage
  keys were renamed (`nightseam-db-v1`, `nightseam_prefs_v1`,
  `nightseam_site_v1`, `nightseam_theme`, `nightseam-panoimg`,
  `nightseam-images`), the old-domain update chain is gone (`ap-version.js`
  and `window.__AP_RELEASE` no longer exist, only `ns-version.js`),
  `ASTROPILOT_ALLOW_HOST` is gone, and neither the database file nor the
  export/backup ids are migrated or accepted in their old spelling.
- Consequences of having no shims (deliberate, do not "fix" them):
  - An install updated in place starts on a FRESH database - to keep old
    data, rename `data/astropilot.db` to `data/nightseam.db` by hand
    (a pre-rename exe pointed at the same folder would then start empty).
    Done once for the developer's own frozen app in `dist\data`.
  - Setup zips and web backup JSONs written before the rename are rejected
    with a clear "not a NightSeam ..." error; re-export with the new build.
  - Installs <= 0.5.12 cannot see updates (their update URL points at
    pitop.net, which is dead).
- NOT renamed (outside this repo / not worth breaking): the working
  directory `<workspace>\AstroPilot-local`, the dev mirror `<workspace>\Astro-Web` and
  the deploy path `/astro` — documentation must reference the real paths.