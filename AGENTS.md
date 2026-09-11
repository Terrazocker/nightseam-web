# AGENTS.md

> **Canonical repo.** All commits, tags, web releases and deploys happen here.
> `<archive>\Object-Astro` is a DEPRECATED archive (frozen at v0.4.1) - treat
> it as read-only, never commit/tag/deploy there. The `web/` sub-version shares
> this repo's history and tags.

> **Design: read `DESIGN.md` before ANY UI work.** Glass (`dome`) is the design
> language and the web default; follow its tokens and the `themes.css` dome
> blocks in `web/` and `static/`. "Classic" is a flat fallback, not a second
> language.

NightSeam: a desktop DSO-planning app - a local FastAPI server plus a vanilla-JS
UI, pure-Python Meeus astronomy (no numpy/astropy), no JS bundler/npm. Works
fully offline except optional Wikipedia images. Two modes: Night Planner and
Image Catalog (FITS ingest + library). `README.md` has the feature list.

## Invariants (pinned by tests - do not regress)

**Untrusted paths and imports**
- Every path from stored/imported JSON goes through `paths.safe_rel()` (before
  storing) and `paths.safe_join()` (before opening); any record id interpolated
  into a file name goes through `paths.safe_token()`. `import_bundle` drops
  panorama records whose id is not a plain token. A crafted setup ZIP used to be
  an arbitrary-file-read primitive (`tests/test_paths.py`, `test_backup.py`,
  `test_api.py`).
- `apply_import_zip` never honors the bundle's `settings.image_dir`; it
  re-injects the LOCAL configured archive and reports `image_dir_ignored`.
- Tests never touch the user profile: `tests/conftest.py` redirects
  `paths.default_archive_dir()` into `logs/`.

**Astronomy / planner**
- `app/astro.py::_precess` is Meeus ch.21 eq.21.4 with the middle rotation about
  **Y**; `static/js/astro.js` and `web/astro.js` mirror it. Correctness is pinned
  by published values in `tests/test_astro.py`, NOT a round-trip. Three-engine
  parity: `tests/test_js_parity.py` + `tests/js/astro_parity.mjs`.
- Sun/Moon chart visibility is astronomical, not a clock: drawn only while the
  APPARENT (refracted) altitude is `> 0`, the one `aboveHorizon()` in BOTH
  `web/astro.js` and `static/js/derive.js`. `sunRaDec`/`moonRaDec` return RA in
  DEGREES (like `app/astro.py`); `web/app.js` must use `sunAltAz()`/`moonAltAz()`
  and NEVER `sunRaDec`/`moonRaDec`
  (`tests/test_ui_invariants.py::test_web_sun_moon_use_the_altaz_wrappers`). Old
  bugs: web chart passed `sunRaDec() * 15` (degrees as hours) so the Sun sat high
  all night; desktop drew Sun/Moon down to `-6 deg`.
- Clear window: `longest_run`/`longestRunJS` return a HALF-OPEN `[start,end)`
  whose `end` may equal the grid length. Never index `times_iso[end]`; resolve it
  with `windowEndISO()`. `/api/object/{oid}` ships `step_min`.
- Every "night" number (clear window, `% of night`, score) is measured inside
  `dusk..dawn` on BOTH sides; the payload grid carries twilight margins for the
  charts only. `static/js/derive.js` clips them and `nightcalc.object_detail`
  clips its 4-min window the same way (`tests/js/derive_window.mjs`).
- Twilight scan is anchored at the SITE's local noon + 30 h, never browser
  midnight + 48 h. `nightInfo(localDate,lat,lon,localNoon)` needs the site's noon
  (`siteNoon()`, via `webstore.wallToUtc`) or a cross-timezone site resolves the
  wrong night. `pickDarkWindow` falls back ONLY to a fixed 20:00-04:00 window in
  the site zone; sunset/sunrise are never the window.
- Min-alt rule: explicit `min_useful_alt` wins, else `17 + 2*bortle`.
  `server.py::_effective_min_alt` is the one server rule (`/api/state` ships
  `min_useful_alt_explicit`); desktop `derive.js::effectiveMinAlt` re-derives live
  on a Bortle change (web `horizon.js::effectiveMinAlt` already did).
- Moon/Bortle scoring curves are exported by BOTH `derive.js` and `web/astro.js`
  and compared numerically; the web scores the same window as the desktop on a
  6-min grid and uses the PLANNED night's moon (midpoint), never "now".
- Selected time is the source of truth: desktop `S.tIdx`, web `S.skyTime`. "Best
  targets tonight" (web) lists only rows with `visN > 0`. Keyboard scrub is 6 min,
  Shift 60 min in BOTH apps (`SCRUB_STEP_MIN`/`SCRUB_SHIFT_STEP_MIN`).

**Charts and units**
- Magnitude limit is ONE rule `magVisible(vmag,limit,maxLimit)` in `derive.js` +
  `web/format.js` (`mag` engine): a known magnitude shows at `vmag <= limit`; a
  no-magnitude object only at the slider maximum. It filters EVERY object, curated
  included (8 of 197 curated are fainter than the default 10 and hidden, exactly
  like desktop `#skyMag`); Sun/Moon, field stars, constellations, the min-alt ring
  and all scoring/ranking are untouched. Web twin `S.skyMag` (default 10, max 14 /
  20 in advanced mode), session-only, one `draw()` per input.
- "Square" zoom is ONE geometry in `derive.js` + `web/format.js` (`skyzoom`
  engine): `skyClampZoom` (1..8), `skyViewMatrix`, `skyScreenToBase`,
  `skyClampFocus`. The disc lives in a SQUARE W x H space; the visible window is
  the RECTANGLE `W/zoom x H/zoom` with ONE uniform scalar on both axes. The
  desktop canvas must NOT carry a `border-radius: 50%` clip - it hid that window.
- Catalog identity is GLOBAL: an `id` must be unique across the curated `objects`
  AND the advanced `advanced_objects` tables together, not just within each source.
  `scripts/build_adv_catalog.py` expands a curated range designation
  (`NGC 2237-2246`) to every member key and asserts global uniqueness before
  writing; `tests/test_catalog_integrity.py` fails on any duplicate/unsafe id and
  pins the `ngc2237`/`ngc7317` composites. Never hide a collision with a runtime
  `Map`/lookup - fix the data.
- Panorama profile/strokes invariant: strokes WIN when present (the profile is
  derived from the mask); with NO strokes the stored `profile`/`profileTop` are
  AUTHORITATIVE, so a stroke-less imported record is never blanked just by
  opening/saving (`computeProfile` on the web, `recomputeProfile` on the desktop).
  Deliberate clearing goes through `clearMask()`, the one place a stored profile
  is discarded. A stroke-less profile must not be silently removed - that could
  make a blocked target look observable.
- Web panorama editor model (0.6.x redesign): edits are applied to planning
  IMMEDIATELY (in-memory `activePano`) but persisted only on **Save** (or when
  you leave the editor). History is JSON snapshots of the EDITABLE state
  (strokes + calibration + paint mode) - `snapshotPano`/`historyCommit`/
  `historyUndo`/`historyRedo` - with ONE entry per gesture (committed on pointer
  up), a bounded stack (`HISTORY_LIMIT`), redo invalidated by a new edit, and
  `historyDirty` clearing when the state returns to the `historyMarkSaved`
  baseline. `flushHorizonEdits()` runs on panorama switch / create / navigating
  away (never lose an edit); a `beforeunload` guard covers closing the tab while
  dirty. Clear is confirmed via the in-page `confirmDialog` (never `alert`/
  `confirm`) and is undoable; Revert restores the last saved state and is also
  undoable. Zoom (`editorClampZoom`/`editorViewMatrix`/`editorScreenToBase`/
  `editorClampFocus`) is PRESENTATION-ONLY (1..8, fits the mask rectangle) and
  never touches stored geometry; the canvas is DPR-aware and `ResizeObserver`-
  driven, drawing in the 720x360 logical space so guides, the cursor readout and
  `ceilFor` share ONE transform. Pinned by `tests/js/pano_ui.mjs`.
- Panorama profiles are exactly 720 bins (0.5 deg/az), `NO_BLOCK = -90`. Sky mode
  inverts the mask: `profile` = band BOTTOM, `profile_top` = band TOP; unpainted
  sky columns stay at 90; outside the FOV follows the mode. The web editor
  (`web/horizon.js`) emits the `90.5` "open above" sentinel when the painted band
  reaches within 4 deg of `altTop`, wraps the 360-deg seam in
  `rebuildMask(strokes, wrap)`, and derives the profile in memory
  (`profileFromMask`) persisting once per stroke/save, not per pointer sample.
  Guides use `xOfAz`/`rowOfAlt` - the SAME transform as `ceilFor`
  (`tests/js/pano_geom.mjs`).
- Web backup is TRUTHFUL: `horizon.js::exportPanosWithImages()` embeds the
  compressed panorama photo and sets `hasImage` from the bytes actually
  included, so `hasImage === true` after a restore means the image really exists.
  `collectBackup` carries the theme (its own `nightseam_theme` key) and a schema
  `version`; `restoreBackup` stages/validates the whole bundle BEFORE any write
  and rolls back to the `meta`/`safety` snapshot if a write fails. Pinned by
  `tests/js/web_backup.mjs`. A desktop restore clears `import_batches` (history
  of the replaced library).

**Async**
- After every `await` in `static/js/night.js`, re-check `ctl === _nightCtl`
  before touching state, UI or the busy chip. A superseded night load stays
  silent (`tests/js/night_race.mjs`).

**Release integrity** (see also "Versioning and release")
- `scripts/check_release.py` must pass before staging; `build.ps1` refuses a
  dirty/off-tag bake unless `-AllowDirty`. NEVER hand-bake
  `app/_version_baked.py` to fake a clean tag - that is how 0.6.0 shipped
  claiming a tag it never had.
- `python scripts/build_changelog.py --check` exits non-zero for tags since the
  newest curated entry; every released tag needs a curated entry.
- `scripts/check_encoding.py` (wired into `check_js.py`) rejects non-UTF8, UTF-8
  BOMs, C1 controls and cp1252 mojibake clusters in shipped text. A PowerShell
  `Get-Content`/`Set-Content` round-trip WILL cp1252-mangle non-ASCII files
  (em dashes, degree signs, emoji) with no other check noticing - run the guard
  after any text rewrite.

## Context discipline (the transcript is the budget)

- **Run the full suite once, at the end:** `python -m pytest tests/ -q --tb=no`,
  and only the modules that matter while iterating
  (`python -m pytest tests/test_astro.py tests/test_planning.py -q`).
- **Never dump output into chat:** no build/tool logs, no whole files, no raw
  grep matches. Use `read` with `offset`/`limit`, read tails, or counts
  (`Select-String -Quiet`, `Measure-Object`).
- **Delegate bulk reading:** anything touching 2-3+ files goes to a subagent with
  a self-contained prompt and an explicit "return a digest, not the files".
- **Write findings to files** (`AUDIT.md`-style) and reference the path in chat.
- **`/compact` at phase boundaries** and start a new session per deliverable.
- When editing this file, collect changes and apply them in ONE write (each edit
  re-injects the whole file).

## Commands

- Run from source: `python main.py` (default port 8407; `--console` for logs,
  `--no-browser` headless exits on the single-instance handoff, `--port N`,
  `--version` prints the version, `--browser` tab instead of app window,
  `--idle-exit-hours 0` to never idle-exit - the default 12 h kills a server an
  agent left running). Data lives in `data/` (gitignored).
  - **Port-8407 trap:** a stale `dist\NightSeam.exe` (old frozen code) can hold
    the port; `python main.py` then hands off via `data/instance.json` instead of
    starting. Kill NightSeam.exe/python/chrome, delete `data/instance.json`, then
    confirm the listener's process NAME is `python.exe`
    (`Get-NetTCPConnection -LocalPort 8407` -> OwningProcess ->
    `Get-CimInstance Win32_Process`).
  - If 8407 is briefly taken at boot, `free_port()` silently picks a RANDOM port
    (written to `instance.json`).
- Tests: `python -m pytest tests/` (517). Single test:
  `python -m pytest tests/test_astro.py -k name`. API tests use
  `create_app(db, prefetch=False)` (no image-cache thread). The `client` fixture
  must leave `data/panos` in the tmp dir it patches in.
  - **WinError 5 in this sandbox:** the repo-local `.pytest-tmp` (see
    `pytest.ini`) can acquire an owner-SID-only DACL, so every `tmp_path` test
    errors at fixture cleanup - an environment artifact, not a failure. Workaround
    (no escalation needed): `python -m pytest tests/ -q --basetemp
    C:\Users\<user>\AppData\Local\Temp\opencode\pt -p no:cacheprovider` -> 517/517.
- JS checks (run after touching `static/` OR `web/`): `python scripts/check_js.py`
  runs all of them and exits non-zero on hard failures:
  - `check_js_imports.py` - broken relative ES-module imports / missing named exports
  - `check_dom_ids.py` - `$('#id')` missing from that app's `index.html`
  - `check_js_syntax.py` - `node --check` on all 27 shipped modules (via temp `.mjs`)
  - `check_encoding.py` - the encoding guard above
  - `check_js_defs.py` - heuristic, always exits 0
- Build exe: `powershell -ExecutionPolicy Bypass -File build.ps1` ->
  `dist\NightSeam.exe` (isolated `.venv-build`; kills running NightSeam first).
  `build.ps1` drives PyInstaller via CLI flags (the committed `NightSeam.spec` is
  an artifact, not the source of truth), bakes `git describe` into gitignored
  `app/_version_baked.py`, and never touches `dist\data` (user db/imgcache next to
  the exe survive rebuilds). The leading `pip install` phases can HANG with no
  network; after the first build `.venv-build` is complete, so kill pip and run
  PyInstaller directly (see the command in git history / `build.ps1`). ~90 s
  direct, ~8 min full.
- Deploy (Plesk FTPS, nightseam.de): app only at `/astro`
  (`python web/ftps_deploy.py uploadtree web /astro`); landing at `/`
  (`uploadtree landing /`). Credentials are OUTSIDE the repo: `--env` points at
  `ftp.env` (`<workspace>\Astro-Web\ftp.env`). FTPS works from the sandbox without
  escalation (reads outside the workspace are allowed).
  - FTP gotchas: the `upload` remote name is FTP-ROOT-relative - ALWAYS pass the
    full path (`upload web/app.js /astro/app.js`, `upload
    dist/release/version.json /downloads/version.json`); a bare name lands in `/`.
    ProFTPD kills a reused connection after ~2 transfers, so `uploadtree` often
    stalls mid-tree - upload the rest individually (one fresh connection/file) and
    verify with `download`/`list`.
  - `uploadtree` never uploads `.gitignore`, `build_web.py`, `ftps_deploy.py`,
    `whale/`, `dev/`, `node_modules/`, `__pycache__/` or `*.pyc`. Never upload
    `dist\data`.
  - `ftps_deploy.py remove <remote-path> --yes` deletes stale files/dirs from `/`
    (`--yes` mandatory; the webspace root is refused). uploadtree/uploadmany
    refuse to publish pages that still contain template placeholders
    (`landing/impressum.html`) unless `--force`.
- Sandbox shell gotchas (cost real attempts):
  - Piping one command's stdout into another PowerShell command dies with
    "Zugriff verweigert" (named-pipe EPERM): `... | Select-Object` never runs, for
    python and git alike. Run the tool bare, or have a Python wrapper write to a
    FILE inside the repo and read that.
  - Any tool that shells out with `capture_output=True`/piped stdio dies the same
    way. Concretely `python web/build_web.py version` fails from
    `_winapi.CreatePipe` - a release step, run that one with full access, or bake
    `web/version.json` by hand (`{"version","describe","built"}`,
    `version = describe.lstrip("v")`, `built` = ISO-8601 UTC).
  - Heredocs / inline `python -c` with quotes break - write probe scripts to
    `C:\Users\<user>\AppData\Local\Temp\opencode\` and run them.
- `git commit`/`git tag` work, but git's background auto-maintenance then prints
  pack-objects pipe errors AND pops a harmless Windows dialog on the user's
  desktop (a detached `git maintenance run --auto` child cannot init under the
  restricted token). This repo's LOCAL config sets `maintenance.auto=false` +
  `gc.auto=0` to stop it (invisible to `git status`, costs no release window).
  Never run `git gc` from the sandboxed shell.
- **No browser here.** Headless Chrome/Edge have returned exit 0 with ZERO bytes
  even escalated - do not burn turns on it. Verify UI work without a browser:
  `node --check` on a `.mjs` copy for syntax; stack-walk a JS-built template with
  `html.parser` (blank `${...}` first) for structure; the DEPLOYED app via FTP
  download + `Get-FileHash` against the local file, plus an HTTP fetch of
  `/astro/version.json` and `/astro/index.html`. If CDP is available, Chrome needs
  `--remote-allow-origins=*`, `Network.setCacheDisabled` + a `?v=` query, an
  absolute `--user-data-dir` inside the workspace, and `S` (state.js) is not
  global - probe the DOM/API.

## Versioning and release

- `app/version.py` - from source the version is `git describe --tags --always`
  (leading `v` stripped); frozen exes use the baked value.
- Commits are named `NightSeam X.Y.Z`, tagged `vX.Y.Z` (e.g. `NightSeam 0.6.10` /
  `v0.6.10`). Tag BEFORE rebuilding so the exe shows it.
- **Release order matters** (getting it wrong publishes a version named
  `0.6.0-dirty`), in this exact order:
  1. add the curated CURATED entry for `X.Y.Z` to `scripts/build_changelog.py`
     and **commit it with the release** (it must live in the tagged commit).
  2. **pre-tag gate:** `python scripts/pre_tag_check.py X.Y.Z` must exit 0
     (fails if the CURATED entry is missing; also pinned by
     `tests/test_pre_tag_check.py`). Do NOT tag until it passes.
  3. `git tag vX.Y.Z` on the release commit.
  4. `scripts/make_release.py` and `web/build_web.py version` **while HEAD is
     exactly at the tag and the tree is clean** (both call `git describe
     --dirty`, so any uncommitted change leaks into the exe/zip/`version.json`).
  5. `scripts/check_release.py` must exit 0 with 0 errors.
  6. browser smoke gate (see the sandbox notes), then upload.
  7. `scripts/build_changelog.py` regenerates the TRACKED `landing/changelog.json`;
     commit that as its own follow-up commit after the tag (**never move the tag**).
  `check_release.py` verifies the staged zip sha256/size vs `version.json`, the
  zip's exe vs the staged exe, `ns-version.js`, the changelog schema, and the
  git-describe grammar. Tagging before step 1 is committed is a hard error: HEAD
  then sits past the tag and `check_release.py` blocks staging.
- Public artifacts under `/downloads/` (`dist/release/` content):
  `NightSeam-<version>.zip`, `NightSeam-latest.zip` (stable link),
  `version.json` (landing page) and `ns-version.js` (JSONP for the desktop update
  checker, since a localhost origin cannot fetch cross-origin JSON).
- **Web cache-busting is manual, per module AND for the catalog data file.**
  `web/index.html` carries `app.js?v=N`; `web/app.js` carries a `?v=` on each
  import. Bump the token of every module whose BEHAVIOUR changed (comment-only
  edits do not) in the SAME commit as the change, and bump BOTH the entry point
  and the dependency.
  `web/catalog.json` is a ~4 MB DATA file, not a module, so it cannot carry a
  `?v=` in an import: it is fetched through the ONE named token
  `const CATALOG_TOKEN` in `web/app.js` (`fetch('catalog.json?v=' + CATALOG_TOKEN)`)
  and `web/catalog.manifest.json` records the bytes for that token. **A change to
  `web/catalog.json` MUST bump `CATALOG_TOKEN` + the manifest in the same commit**
  (the 0.6.12 dedup was the first catalog change ever; a stale ~4 MB file would
  otherwise hide it from returning visitors). Enforced by
  `scripts/check_catalog_token.py`, wired into `scripts/check_js.py`, and pinned
  by `tests/test_cache_tokens.py` (mutation-tested). Do NOT add
  `{cache:'no-store'}` - the file must stay cacheable.
  Current: `app.js?v=34` (index.html) / `CATALOG_TOKEN = '2'`, `astro.js?v=6`,
  `horizon.js?v=17`, `format.js?v=3`, `nightrank.js?v=4`, `webstore.js?v=6`,
  `dragwin.js?v=1`, `style.css?v=12`, `themes.css?v=2`.
- **Never publish `index.html` before the modules it names.** Deploys are not
  atomic and the page carries the tokens; `ftps_deploy.py::upload_order()` sorts
  HTML last (`index.html` very last), pinned by `tests/test_deploy_order.py`. Keep
  that order when uploading by hand.
- `web/version.json` is gitignored and baked from the tag: a plain
  `uploadtree web /astro` after a code change keeps advertising the old version -
  re-bake on every deploy.

## Architecture

- `main.py` - entrypoint: uvicorn in a daemon thread, UI in a pywebview window
  (browser app-mode fallback). Single-instance handoff via `data/instance.json`;
  a `JsApi` class exposes a native folder picker to `window.pywebview.api`.
- `app/server.py` - `create_app(db)` FastAPI factory with all `/api/*` routes
  (docs disabled; `prefetch=False` skips the image-cache thread). Computation
  lives in `app/nightcalc.py` (`compute_night()`, `object_detail()`,
  `ceil_lookup()`, `longest_run()` - the 6-min/4-min grids, sun/moon tracks),
  `app/ingest.py` (streaming FITS ingest, 1 GiB cap), `app/backup.py`
  (export/import ZIP).
- `app/astro.py` - pure-Python astronomy (golden values in `tests/test_astro.py`).
  `app/planning.py` - night-window/twilight search, the SINGLE source of truth for
  `/api/night` and `/api/object/{oid}`; never reimplement twilight logic.
- `app/database.py` - SQLite, schema created on init, catalog seeded from
  `catalog_data.py`; `advanced_objects` bulk-seeded from `app/data/openned.csv`
  (OpenNGC, CC BY-SA 4.0). `app/fits.py` - hand-written FITS parser; `parse_ra_hours`
  / `parse_dec_deg` are the single coordinate parsers (imported by `server.py`).
  `app/imglib.py`, `app/paths.py` (source vs frozen), `app/images.py`
  (Wikipedia/Wikidata/DSS2 chain with on-disk cache + offline breaker).
- `static/` - ES modules loaded via `<script type="module">`, no bundler; imports
  must resolve to real files. Shared helpers (`$`, `$$`, `api()`, `esc`,
  `applyEdgeSpace`) come from `js/util.js`. `js/derive.js` computes
  visibility/score client-side so min-altitude changes never refetch.

## Advanced mode (12,000+ objects)

- Toggled in the hamburger menu (`adv_mode`); changing it reloads the page.
  Standard mode is the curated 197 objects.
- `/api/night?adv=1` ships advanced objects as METADATA ONLY (no tracks);
  `synthesizeAdvancedTracks()` in `derive.js` computes tracks in the browser via
  `static/js/astro.js` (precession once/object at the grid midpoint, sidereal time
  once/sample via `altazFrame`, yields every 256 objects). Never add track arrays
  for the full advanced catalog to the night payload.
- Advanced rows carry `_adv` (stripped by `api_catalog`); image-ingest resolution
  and the library use the FULL catalog regardless of mode.

## Data and gotchas

- **User databases outlive the code** - schema changes MUST be additive (new
  columns via try/ALTER/except in `Database.__init__`, new tables into `SCHEMA`);
  never drop or re-shape existing columns.
- Archive layout: `<image_dir>/<Object>/<session>/<lights|darks|flats|bias>/<file>.fit`
  (originals copied, never moved). The session folder is the capture night
  (`YYYY-MM-DD_HHMM` or `undated`); frames with DATE-OBS < 12 h apart share one
  folder. Session digits are the MACHINE-LOCAL wall clock (`datetime.fromtimestamp`),
  so they can differ by a day from the displayed zone - expected. The sub-folder
  comes from FITS IMAGETYP (`classify_frame()`), unknown -> `lights`; ingest
  accepts `.fit`/`.fits` only (no `.fz`/`.gz`). `POST /api/library/reindex` scans
  the archive for files not yet in the DB.
- Import history: `import_batches`, one row per (object, session, frame); the
  client sends a `run_id` per action and `merge_import_batch()` merges chunks. The
  ingest `session` field must be the BARE folder name (`2026-08-22_2000`), not
  `slug/session`. `/api/library/edit` renames/retypes only unresolved objects and
  moves the folder on disk. `/api/library/open_folder`, `/api/library/export?format=csv|json`.
- Export/import ZIP covers settings, sites, rigs, panoramas, custom targets and the
  images library; every import first writes a best-effort safety copy to
  `<db>.backup-auto.zip` (`auto_backup`). Uploads stream to disk in 1 MB chunks.
- `/api/object/{oid}/image?thumb=1` is cache-only (never network) - use it for
  lists/repeated views; the full Wikipedia/DSS chain only for the detail view
  (8 s abort). Pointing a list at the full chain starves the browser's
  6-connections-per-host limit and wedges local API calls ("wizard stuck busy").
- The session journal/observations were REMOVED (desktop + web): no observed
  endpoints/UI/marks. The `observations` table remains (additive schema) and is not
  exported/imported - leave it untouched.
- Numeric inputs accept comma OR dot decimals (`num()` in `util.js`,
  text+`inputmode`). `api()` adds a 30 s timeout unless the caller passes an abort
  signal (the night loader does).
- The first-run wizard (`js/wizard.js`) is hardened: replay edits the active site
  (PUT), typed values survive Back/Next, forms never submit/reload, a 20 s guard
  unsticks a hung validate. Errors show inline.
- `bortle` (1-9) shifts the default min-alt (`17 + 2*bortle`, only without an
  explicit min alt) and scales moon scoring. Keyboard: ArrowLeft/Right scrub
  (6 min; Shift 60), `n` cycles tabs. `edge_space` sets tab width
  (`calc(100vw - 2*var(--edge-space))`).
- Themes: `themes.css` are token overrides of `style.css`'s `:root`, switched via
  `<html data-theme>`. One shared HTML skeleton - structural themes use
  position:fixed/flex/transforms, never moved IDs or JS. Keep z-index below 100
  (toasts 300, popover 60, modal 40, #versionTag 5); never override `.hidden` or
  set `display` on the app-toggled `#tabs-cat`/`#plannerControls`/`#tabs`/`#nightInfo`.
- A11y: every modal opens with `role="dialog" aria-modal="true"
  aria-labelledby=<h2 id>`; the delegated Tab focus trap is `util.js::initFocusTrap`
  (wired at boot). Search inputs have an accessible name; click-only controls
  (`#brand`) get `role="button" tabindex="0"` + Enter/Space.
- Timezones: all server payload times are UTC; the client sends `tz_offset_min`
  computed AT the selected date (`tzOffAt()`, DST-aware) and renders via
  `fmtT()`/`zoneHour()` with the effective zone (the `timezone` setting, or machine
  local). Custom targets are deleted only via the `u_` id prefix.
- A background `img-prefetch` thread starts on every app start and hits the
  network; the server is otherwise local-only.
- Never commit `data/` (db, panos, imgcache) or `logs/`; only
  `data/panos/.gitkeep` is tracked. `app/_version_baked.py`, `web/version.json`
  and `.pytest-tmp/` are gitignored.

## Web app (`web/`)

- NightSeam Web is a static in-browser planner: same engine (`web/astro.js`),
  same catalog, Tier-1 user data (sites, rigs, custom targets) mirrored from the
  SQLite tables into IndexedDB via `web/webstore.js`. It shares this repo's
  version line.
- The catalog is ALWAYS derived: `python web/build_web.py catalog` reads
  `data/nightseam.db` and rewrites `web/catalog.json` byte-identically. Never
  hand-edit it.
- Popularity (The popularity source) is a SILENT ranking tiebreaker only (visibility decides,
  popularity separates equals) and is INVISIBLE in the UI:
  `tests/test_ui_invariants.py` fails if the number or a "Popular" criterion
  (column/chip/sort/detail row) reappears in either app.
- Rig presets are a PICKER, not defaults - a fresh setup is EMPTY. Both lists must
  change together: `app/rig_presets.py::DEFAULT_RIGS` and `web/webstore.js::DEFAULT_RIGS`
  (`tests/test_rig_presets.py`). The framing `#rigSelect` lives in the TOPBAR next
  to Site in BOTH apps (`test_ui_invariants.py` fails if it returns to the menu).
- Setup dialog = tabs (Sites/Rigs/Targets/Backup); `showMTab()` maps
  `data-mtab` -> `#mtab-*` panes and `SETTINGS_TAB` survives the full re-render.
  Hide panels with the `.hidden` CLASS, not the `hidden` attribute (an author
  `display` beats the UA rule).
- Catalog sizes render like the desktop: `web/format.js` is the twin of
  `util.js::fmtSize` (`size_am` in ARCMINUTES, one user unit, lone value =
  diameter), pinned by the `size` engine; still a simplification: `rigFramePct`
  compares the larger axis against `fov_w` only.
- "Free space per side" (web): `main` is
  `max-width: min(100%, max(320px, calc(100% - 2 * var(--edge,14px))))` with NO
  other px cap - a cap inside the `min()` silently defeats the slider. A CSS-only
  fix "does nothing" for a returning visitor unless `style.css`'s `?v=` is bumped
  in the same commit, and verify it at a WIDE viewport (`test_ui_invariants.py`).
- Catalog/type/emoji formatting is a known encoding-mojibake hotspot - run
  `check_encoding.py`.
- The dev mirror `<workspace>\Astro-Web` is BEHIND this repo; the robocopy sync runs
  mirror -> repo, so copy changed files into the mirror first or skip it.

## History: renamed from AstroPilot

`v0.5.12` and earlier are AstroPilot; `v0.6.0` (2026-09-10) is the first
NightSeam release. There is NO compatibility shim (deliberate, do not "fix"):
an in-place update starts on a FRESH database (rename `data/astropilot.db` to
`data/nightseam.db` by hand to keep old data); pre-rename setup zips/backups are
rejected; installs <= 0.5.12 cannot see updates; browser storage keys are
`nightseam-*`; only `ns-version.js` exists. Do NOT rename the working directory
`<workspace>\AstroPilot-local`, the dev mirror `<workspace>\Astro-Web`, or the deploy path
`/astro`.
