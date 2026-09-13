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

> **Docs map.** This file is canonical for invariants, commands, release and
> deploy. `CATALOG.md` = the data pipeline (sources -> CSV -> DB -> web payload
> -> cache tokens) with the rebuild commands; `DECISIONS.md` = why each rule
> exists and what was rejected; `RELEASES.md` = what each release shipped and
> how it was verified; `ENVIRONMENT.md` = measured facts about the agent
> sandbox (pipes, browser gate, scratch DACLs); `README.md` = user-facing
> features; `DESIGN.md` = the UI language. Everything under `AUDIT*`, `ARCH-AUDIT/`, `reviews/`,
> `BATCH3-REPORT.md` and `*REPORT*.md` is a HISTORICAL record of the state at the
> time - read those for history, never as instructions.

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
- **Phase C (0.6.20): `core/` is the ONLY astronomy/planning implementation.**
  The Python math modules (`app/astro.py`, `app/planning.py`, `app/nightcalc.py`)
  and their routes (`/api/night`, `/api/object/{oid}`) are DELETED; `app/` is
  storage/platform/IO. `core/astro.js::precessJ2000ToDate` is Meeus ch.21 eq.21.4
  with the middle rotation about **Y**; the desktop (`static/js/astro.js`) and
  the web (`web/astro.js` re-exporting core) stay in agreement. The retired
  oracle's outputs are FROZEN in `tests/fixtures/core_fixtures.json` and
  compared by `tests/test_core_fixtures.py`; the JS behaviour anchors are in
  `tests/test_js_parity.py` + `tests/js/astro_parity.mjs`. `scripts/check_core.py`
  (mutation-proven in `tests/test_core_drift.py`) fails if astronomy/planning
  math reappears in `app/` or `scripts/`.
- **Golden hierarchy (do not confuse the two):**
  `tests/fixtures/core_fixtures.json` is a REGRESSION/MAINTENANCE golden - it
  was generated from the same implementation lineage (the retired oracle), so
  it catches drift but NOT a shared misreading of a formula (the old X-axis
  precession bug survived three engines that way). The CORRECTNESS AUTHORITY is
  `tests/js/reference_anchors.mjs` + `tests/test_reference_anchors.py` (19
  checks):
  published IAU 2006/Capitaine precession (forward + inverse), Meeus ch.7/12/21
  textbook values, the published 2026-08-12/28 moon phases, an astropy/ERFA
  lunar position and the Bennett refraction formula - asserted absolutely, with
  a mutation proof per anchor group. Never "fix" a reference failure by
  updating the fixtures.
- Sun/Moon chart visibility is astronomical, not a clock: drawn only while the
  APPARENT (refracted) altitude is `> 0`, the one `aboveHorizon()` in BOTH
  `web/astro.js` and `static/js/derive.js`. `sunRaDec`/`moonRaDec` return RA in
  DEGREES (like `core/astro.js`); `web/app.js` must use `sunAltAz()`/`moonAltAz()`
  and NEVER `sunRaDec`/`moonRaDec`
  (`tests/test_ui_invariants.py::test_web_sun_moon_use_the_altaz_wrappers`). Old
  bugs: web chart passed `sunRaDec() * 15` (degrees as hours) so the Sun sat high
  all night; desktop drew Sun/Moon down to `-6 deg`.
- Clear window: the shared `longestRunJS` returns a HALF-OPEN `[start,end)`
  whose `end` may equal the grid length. Never index `times_iso[end]`; resolve it
  with `windowEndISO()`. The client detail payload ships `step_min`.
- Every "night" number (clear window, `% of night`, score) is measured inside
  `dusk..dawn` on BOTH sides; the payload grid carries twilight margins for the
  charts only. `static/js/derive.js` clips them and
  `static/js/planning_client.js::buildClientDetail` clips its 4-min window the
  same way (`tests/js/derive_window.mjs`).
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
- **Scrub window (0.6.13; degeneracy policy 0.6.17):** the scrub's default range
  is the WHOLE night, from the planner's own sunset..sunrise sun-crossings
  (`core/planning.js::nightInfo`/`pickDarkWindow`) ONLY when that pair is
  strictly ordered AND the sunset precedes the next dawn. A grazing polar day
  can "set" around local noon AFTER the dark window (Tromso 2026-01-15: sunset
  11:08Z, dawn 05:12Z), and the old per-app fallbacks built inverted ranges
  there. Otherwise the range is the twilight-level dusk..dawn; only when that
  is missing does the site-zoned 20:00-04:00 fallback apply. This is a SEPARATE
  concept from the SCORING window (twilight-level dusk..dawn), which is
  UNCHANGED. ONE shared policy `scrubWindowMs` in `core/planning.js` is called
  by BOTH shells (web `app.js::scrubRange` + detail chart; desktop
  `derive.js::scrubWindowRange`), on top of the shared
  `scrubBounds`/`scrubClamp`; pinned by `tests/js/scrub_degenerate.mjs`,
  `tests/js/derive_window.mjs` and the `scrubwindow`/`scrubgrid` engines.
  `viewFullDay` ON widens the scrub to the app's full span: the SAME 24 h
  site-zoned local noon->noon grid in BOTH apps (desktop
  `planning_client.js` builds it; web computes it). Toggling re-derives live and
  clamps the selected time to
  the nearest in-range instant. Desktop `derive.js::indexRangeFor` backs BOTH
  `nightIndexRange` (scoring, dusk..dawn) and `scrubWindowRange` (scrub).
  Never define a second window.
- **Desktop payload grid is a full 24 h site-zoned day** (0.6.13, ITEM A):
  the client builder (`static/js/planning_client.js`, sync AND worker) samples
  local noon -> next local noon at 6 min (241 samples), so the desktop
  `View full day` toggle is real and matches the web exactly. The oracle-era
  measurements (standard ~0.9 MiB / ~0.23 s, advanced ~2.4 MiB / ~0.32 s at
  52 N) are historical; the grid/step constants are pinned by the `scrubgrid`
  engine and `tests/js/night_race.mjs`. The scoring clip (dusk..dawn) and the
  detail builder's own chart margins are unchanged.

**Charts and units**
- Magnitude limit is ONE rule `magVisible(vmag,limit,maxLimit)` in `derive.js` +
  `web/format.js` (`mag` engine): a known magnitude shows at `vmag <= limit`; a
  no-magnitude object only at the slider maximum. It filters EVERY object (the
  standard-mode rows fainter than the default 10 are hidden, exactly like desktop
  `#skyMag`); Sun/Moon, field stars, constellations, the min-alt ring
  and all scoring/ranking are untouched. Web twin `S.skyMag` (default 10, max 14 /
  20 in advanced mode), session-only, one `draw()` per input.
- "Square" zoom is ONE geometry in `derive.js` + `web/format.js` (`skyzoom`
  engine): `skyClampZoom` (1..8), `skyViewMatrix`, `skyScreenToBase`,
  `skyClampFocus`. The disc lives in a SQUARE W x H space; the visible window is
  the RECTANGLE `W/zoom x H/zoom` with ONE uniform scalar on both axes. The
  desktop canvas must NOT carry a `border-radius: 50%` clip - it hid that window.
- Catalog identity is GLOBAL: an `id` must be unique across the two seeded tables
  (`objects` + `advanced_objects`) together, not just within each one, because the
  web `byId` map and `db.get_object()` must agree about which object an id names.
  **The catalog IS OpenNGC, plus ONE documented supplement**:
  `app/data/openned.csv` (built by `scripts/build_adv_catalog.py` from
  `database_files/NGC.csv` + `addendum.csv` + the hand-kept
  `app/data/supplement.csv`) is the whole catalog - 12,176 objects, of which 16
  are the supplement: batch 1 (0.6.28 - Medusa and Headphone nebulae, Barnard's
  Loop, Alpha Persei Cluster, the Sadr region IC 1318, M40, M73 - objects
  OpenNGC lacks or files as non-objects) and batch 2 (0.6.29 - the popular
  targets outside OpenNGC's SCOPE: Tulip, Simeis 147, Flying Bat, Dolphin Head,
  Lion, Seahorse, LBN 437, LDN 1622, Pipe Nebula; `vmag` deliberately empty,
  see `DECISIONS.md`). The 197-row hand-curated list that used to live in
  `app/catalog_data.py` is GONE (with it: every blurb/distance/Wikipedia field,
  the curated ids `m42`/`m45`/`lmc`/`...`, and the curated-vs-advanced dedup);
  the supplement is DATA in the catalogue's own column layout, and
  `tests/test_supplement.py` pins its exact membership. `CATALOG.md` has the
  rebuild commands, `DECISIONS.md` the reasoning.
  Rows whose OpenNGC `Type` says they are not objects (`Dup` = duplicated entry
  pointing at its master, `NonEx`, `*`/`**` stars, `Other`, `Nova`) are dropped -
  that is why `ngc650` ships and `ngc651` (Dup) does not, and why OpenNGC's own
  M40 (`**`), M73 (`Other`) and IC 1318 (`*`) rows are gone; those three notable
  ones return as supplement rows under their own ids, and M102 / NGC 6994 stay
  absent. `_build_row` RAISES on an unmapped type instead of letting the old
  `TYPE_MAP.get(..., "galaxy")` fallback mislabel the addendum's dark nebulae.
  Display mappings are applied at build time, each documented in
  `scripts/build_adv_catalog.py`: OpenNGC's `Cl+N` ("star cluster + nebula")
  becomes `nebula` - its famous members are M42/Orion, IC 1396, IC 1805 Heart,
  IC 1848 Soul, IC 5146 Cocoon, so "Open cluster" was simply wrong for them;
  Serpens' `Se1`/`Se2` codes become `Ser`; and a common name OpenNGC gives to
  more than one row gets its designation appended ("Eagle Nebula (NGC 6611)",
  "Antennae Galaxies (NGC 4038)") with the bare name kept in `search`.
  `catalog_data.LEGACY_ID_MAP` + `Database.migrate_legacy_object_ids()` rewrite
  the library ids the pre-0.6.26 catalogue handed out at ingest time (`m42` ->
  `ngc1976`, 114 entries, `images` + `import_batches` only). The seven
  batch-1 supplement objects deliberately kept their OLD curated ids, so a library entry
  for one resolves directly with no aliasing; an id the catalogue cannot name at
  all (a build that is gone, a hand-edited library) is re-resolved for display by
  `app/imglib.py` from the frame's own OBJECT header/coordinates - both paths are
  pinned by `tests/test_library_ids.py`.
  **Standard mode is the `catalog_data.STANDARD_TOP_N` (200) most popular objects**
  (`app/popularity_data.py`; deterministic score-desc/id-asc, never an unscored
  row), `advanced_objects` holds the rest, and both are PURE SEED DATA rebuilt by
  `Database.seed_catalog()` whenever the stored id sets differ from what the CSV +
  popularity table select - that is how a catalog or popularity change re-selects
  standard mode with no schema migration. `tests/test_catalog_integrity.py` fails
  on any duplicate/unsafe id, pins the split AND pins every ADVERTISED catalog size
  (the 6 sites in `web/` + `landing/`) against the shipped rows. Never hide a
  collision with a runtime `Map`/lookup - fix the data.
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
- **Sky-band rendering (0.6.13, ITEM C):** the visible-sky region is the EXACT
  complement of the blocked region - per column `visible U blocked ==
  [altBottom, zenith]` and `visible n blocked == {}`
  (`web/horizon.js::visibleSkyBands`). **DEFAULT: everything ABOVE the painted
  band is FREE sky (open above)** - the band top caps visibility only with the
  explicit `blockAbove` / desktop `block_above` opt-in ("block above band" in
  each editor; a DB column, additive ALTER). The assumed-open area is HATCHED
  (never shaded as a second colour) with a legend entry; the `90.5` sentinel
  still means open to the zenith, and unpainted sky columns are fully blocked.
  The profile preview is drawn as full-width, seam-split polygons that never
  self-intersect (`skyBandPolygons`; the old fill used `x=i/2` = half width and
  one polygon that bridged blocked gaps). The assumed-open hatch polygons are
  built in BIN space (`assumedOpenHatchPolys` - never `2 * azimuth`, which
  shifted the hatch whenever `azOffset != 0` or `fov < 360`). The edge geometry
  `profileSegments` is SHARED with the desktop (`static/js/pano.js`) and pinned
  to identical vertices, with the whole complement/regression contract, by
  `tests/js/sky_band.mjs`. Scoring: `ceilFor` returns `ceilTop = null` unless
  `blockAbove`, and `server.py` passes `profile_top` to `compute_night` /
  `object_detail` only when the pano's `block_above` is set.
- **Sky-chart silhouette + right-click erase (0.6.13 follow-up):** the polar Sky
  View draws the sky-mode blocked-above sector per CONTIGUOUS azimuth run
  (`horizon.js::overhangRuns`, which excludes the 90.5 open-above sentinel and
  unpainted columns) - one polygon with `closePath` bridged a gap with a
  straight chord. Sky mode shades the whole blocked region in ONE obstruction
  colour (below the band AND the overhang above it), so the sky view reads as
  the obstruction view inverted (clear = visible sky). Sky mode NEVER strokes
  the silhouette outline (the fully-blocked 89 deg columns drew a spurious
  centre ring + radial connector); the outline is obstacle-mode only in BOTH
  apps (`activePaintMode() !== "sky"` / `paintMode() === "obstacle"`). Both Sky
  Views carry the SAME horizon legend: red `#ff6b6b` "blocked by horizon" +
  hatched `rgba(210,225,255,.55)` "above band: open (assumed)"; the chart
  shading and hatches use that same red (`rgba(255,107,107,...)`) in BOTH apps.
  A held right-button drag erases continuously as ONE gesture (`gestureErase`)
  instead of a single `contextmenu` dab; `contextmenu` only suppresses the
  menu.
- **Shared core (Phase 1, 0.6.16):** the panorama/horizon geometry lives ONCE in
  `core/horizon.js` (pure ES module - no DOM, storage, network or build tokens)
  and is baked by `scripts/build_core.py` to content-hashed
  `web/core/<hash>/` + `static/js/core/<hash>/` with explicit-export stubs
  `web/core.js` / `static/js/core.js`. `scripts/check_core.py` (wired into
  `check_js.py` and `check_release.py`) fails on any drift, stale hash dir,
  stub/token mismatch, impure identifier in `core/`, or a moved concept
  re-implemented outside `core/`. NEVER edit the baked trees or the stubs by
  hand - edit `core/` and re-run `python scripts/build_core.py`; a core change
  bumps the stub token, and every `./core.js?v=N` importer must match it in the
  same commit (`tests/test_core_drift.py` proves each mutation fails).
- **D1 - world-azimuth profile bins:** `core/horizon.js` stores bin
  `i = azimuth i*0.5 deg`, exactly like the retired `app/nightcalc.py::ceil_lookup`
  and the desktop editor. The web editor's FOV-relative mask converts through
  `normalizeProfileBins()` at the storage boundary (`load`, `normalizePanos`);
  records carry `profileBins: 'world'` and a stroke-derived profile is already
  world. The representative mask column is `floor(rel*720/fov)`, which keeps
  `fov=360/azOffset=0` an exact identity. Pinned by `tests/js/core_d1.mjs`
  (mutation-proven in `tests/test_d1_contract.py`) and the partial-FOV cases of
  the core engines.
- **D2 - rig FOV is arcminutes:** `web/webstore.js::fovArcmin` returns arcmin
  (one unit with the desktop/server `fov_w`); `fovDeg` is display-only. Rigs
  saved before 0.6.16 hold degrees and convert once in `getRigs` via the
  `fov_unit !== 'arcmin'` marker - never persist a rig without
  `fov_unit: 'arcmin'`.
- **Panorama crop (next feature release):** horizontal kept-band crop is ONE
  shared core formula, `cropKeptBand(fovOld, azOffOld, {x,w}, W)` in
  `core/horizon.js` (`fov = max(CROP_MIN_FOV, round(fovOld*w/W))`, azimuth =
  the kept band's left edge at 2 dp; `CROP_MIN_FOV = 45` is the only 45 floor).
  Both shells consume it. **The web crop is NON-DESTRUCTIVE** (`cropPano`): it
  sets fov/azOffset, transforms + clips the strokes when present (strokes win,
  profile re-derived) or clips the authoritative stored WORLD-BIN profile to
  the new FOV (out-of-coverage bins -> the mode sentinel, exactly as a fresh
  pano of the new frame), and NEVER re-encodes the photo or touches alt
  bounds / paint mode / blockAbove. **The desktop crop diverges on purpose:**
  it re-encodes the photo (PNG, <=4096 px) and the server WIPES
  strokes/profile/profile_top - so parity is scoped to fov/azOffset; the web
  deliberately preserves the paint (asserted as an intentional difference, not
  accidental parity). The retired desktop formula `fovOld*(1-w/W)` (the
  REMOVED fraction; agreed with the HUD only at half width, and stored 45 deg
  for a select-all crop) is gone, as is its stale comment. Pinned by
  `tests/js/pano_geom.mjs` (formula/transform/clip), `pano_ui.mjs` (one history
  entry, undo/redo, dirty), `web_backup.mjs` (crop + legacy restore ->
  crop -> export -> re-import), the `web-pano-crop-recalibrate` /
  `desktop-pano-crop-fov` browser checks, and
  `tests/test_ui_invariants.py::test_desktop_crop_uses_the_shared_kept_band_helper`.
  **Compatibility note:** panos cropped on the DESKTOP before this release
  carry a wrong fov (the removed fraction); re-cropping, or correcting the FOV
  field directly in the editor, fixes it - no migration touches stored data.
- Web `app.js::clampSkyTime()` also runs at boot and on every `refreshView()`
  (site/date change), so loading during the day starts the scrub at the first
  allowed instant (the window start) instead of showing a daylight
  "visible at HH:MM" outside the night window.
- **Action-button sizing (ITEM B):** action buttons are auto-width and grouped
  (`.btnrow` = flex+wrap+gap; `.action-row .btn { flex: 0 0 auto }`) - never a
  lone full-width action. A `.btnrow label` rule must exclude label-buttons
  (`label:not(.btn)`), or a "Upload photo"/"Import backup" `label.btn` becomes a
  full-width flex block. Pinned by
  `tests/test_ui_invariants.py::test_web_action_rows_are_not_full_width`.
- Web backup is TRUTHFUL: `horizon.js::exportPanosWithImages()` embeds the
  compressed panorama photo and sets `hasImage` from the bytes actually
  included, so `hasImage === true` after a restore means the image really exists.
  `collectBackup` carries the theme (its own `nightseam_theme` key) and a schema
  `version`; `restoreBackup` stages/validates the whole bundle BEFORE any write
  and rolls back to the `meta`/`safety` snapshot if a write fails. Pinned by
  `tests/js/web_backup.mjs`. A desktop restore clears `import_batches` (history
  of the replaced library). The `viewFullDay` preference rides in `prefs`
  (opaque passthrough) and `view_full_day` in the desktop settings table, so
  both round-trip through backup (`web_backup.mjs`, `tests/test_backup.py`).

**Async / the worker path**
- After every `await` in `static/js/night.js`, re-check `ctl === _nightCtl`
  before touching state, UI or the busy chip. A superseded night load stays
  silent (`tests/js/night_race.mjs`).
- The desktop night builder is worker-first: `planning_client.js` sends the
  grid to `planning_worker.js`, binds flat tracks in 8 ms frames, and keeps
  SEPARATE generation counters for a night load and for prefs so a prefs flush
  can never cancel a night (and vice versa); `flushQueuedPrefs()` runs before
  render so a queued min-alt/Bortle change is applied to the loaded plan.
- Any worker failure falls back to the in-thread `syncBuildClientNight`
  (cache-keyed). There is NO server planning fallback since Phase C:
  `/api/night` and `/api/object/{oid}` answer 404 and a client failure is a
  toast. The worker dev hooks `window.__NS_DEBUG_WORKER` gating
  `__NS_KILL_WORKER`/`__NS_REVIVE_WORKER` are KEPT: inert unless explicitly set
  in devtools, they back the worker-recovery coverage and the
  `desktop-worker-kill-sync-fallback` browser check.

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

## UI philosophy (progressive disclosure)

- **Rule:** anything special, advanced, experimental, or needed only by some
  users lives in the hamburger menu with a safe/quiet default - it must not
  occupy the primary working UI. Common-case controls stay visible.
- **Menu groups/labels (BOTH apps):** *Appearance* (theme); *Display* (free
  space per side, **View full day**, object size units); *Advanced* (advanced
  catalog, timezone, moon-aware ranking, Bortle, equipment filters); *Data*
  (Setup - sites/rigs/targets/backup); *About*.
- **Safe defaults:** options start quiet - `viewFullDay` defaults to **false**,
  advanced catalog mode off. Persist on change; a display preference must not
  require a reload.
- **Migrated in 0.6.13:** the Setup button left the primary toolbar for the
  menu's *Data* group. The min-altitude slider is a COMMON control and stays in
  the top bar (its track was lengthened, not relocated); the imaging
  `#rigSelect` also stays next to Site (framing is core; pinned by
  `tests/test_ui_invariants.py::test_rig_selector_sits_in_the_topbar`).
  `tests/test_ui_invariants.py::test_progressive_disclosure_keeps_advanced_
  controls_in_the_menu` fails if Setup returns to the primary UI, if min-alt
  leaves the top bar, if `viewFullDay` defaults ON, or if a group label
  disappears.

## Context discipline (the transcript is the budget)

- **Run the full suite once, at the end:** `python -m pytest tests/ -q --tb=no`,
  and only the modules that matter while iterating
  (`python -m pytest tests/test_api.py tests/test_js_parity.py -q`).
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
- Tests: `python -m pytest tests/` (507). Single test:
  `python -m pytest tests/test_js_parity.py -k name`. API tests use
  `create_app(db, prefetch=False)` (no image-cache thread). The `client` fixture
  must leave `data/panos` in the tmp dir it patches in.
  - **WinError 5 in this sandbox:** the repo-local `.pytest-tmp` (see
    `pytest.ini`) can acquire an owner-SID-only DACL, so every `tmp_path` test
    errors at fixture cleanup - an environment artifact, not a failure, and the
    external `--basetemp` workaround does not restore a clean run either.
    `tests/conftest.py` therefore OVERRIDES the `tmp_path` fixture with a dir under
    the gitignored, sandbox-owned `logs/.pytest-tmp`, so a plain
    `python -m pytest tests/` is clean: **507 pass with 0 assertion failures**
    (the 0.6.24..0.6.26 sessions needed a scratch plugin for this; it is built in
    now).
- JS checks (run after touching `static/` OR `web/`): `python scripts/check_js.py`
  runs all of them and exits non-zero on hard failures:
  - `check_js_imports.py` - broken relative ES-module imports / missing named exports
  - `check_dom_ids.py` - `$('#id')` missing from that app's `index.html`
  - `check_js_syntax.py` - `node --check` via a temp `.mjs` on every shipped
    module: `static/js/*.js` + `web/*.js` (flat) AND, recursively, `core/*.js`
    plus both baked trees `web/core/<hash>/` + `static/js/core/<hash>/` (76
    modules with the retained N-1 tree; TO-06, 0.6.24 review - the scope used to
    be the flat two only)
  - `check_encoding.py` - the encoding guard above
  - `check_catalog_token.py` - `web/catalog.json` + `catalog.manifest.json` pair with `CATALOG_TOKEN` in `web/app.js`
  - `check_js_tokens.py` - every tokenized `web/` module (`index.html` `app.js?v=`,
    each `./x.js?v=` in `app.js`, `style.css`/`themes.css` and the generated
    `core.js` stub) against the guard's embedded VERIFIED BASELINE: bytes changed
    while the token still equals the baseline token = hard failure (see
    "Versioning and release"; XL-01, 0.6.24)
  - `check_core.py` - baked core drift, stub/token pairing and the core purity +
    moved-concept guards (see "Shared core" invariant)
  - `check_js_defs.py` - heuristic, always exits 0
- **Browser gate (real engine; run after touching `static/`, `web/` or any shell
  contract):** `python scripts/check_browser.py --all` runs `tests/browser/`
  through Playwright + system Chrome - `--web` (static `web/`, no exe) or
  `--desktop` (the packed `dist/NightSeam.exe`, copied into a temp dir so the
  user's data is never touched). A browser that cannot launch is a HARD failure
  (exit 2), never a skip - same rule as a missing node. A freshly built onefile
  exe can exceed a check's 30 s wait on its FIRST launch (PyInstaller unpacks to
  %TEMP%; measured 32.5 s timeout then 3.1 s pass on the re-run) - re-run the gate
  before investigating. It is part of the
  release checklist: run it on the STAGED build before upload
  (`--prod-url https://nightseam.de/astro/` adds a read-only production smoke).
  Deterministic: UTC, pinned clock, empty storage per check; `-p no` pytest
  never collects it (`*_suite.py`, functions take a `ctx`).
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
- **This machine's sandbox, measured** (pipes, the browser gate, scratch-dir
  DACLs, git maintenance, what needs one unsandboxed command): `ENVIRONMENT.md`.
  Read it before working around a restriction - most of them are measured
  facts, not guesses.

## Code review record and status

- `CODE-REVIEW-0.6.20.md` (tracked) - the 0.6.20 review; Batch 1 (0.6.21) and
  Batch 2 (0.6.22) shipped every USER-REACHABLE finding with a
  failing-before/passing-after pin; `BATCH3-REPORT.md` records Batch 3
  (Python + web hardening shipped; the rule/table lists every item).
- **The 0.6.20 program is closed; the 0.6.24 review's batch has shipped
  COMPLETE.** The review itself is COMMITTED at `reviews/0.6.24/` -
  `REVIEW-0.6.24.md`, the five lane reports, `70-verification.md`,
  `07-findings.json` and the passing gate `80-report-review.md`. Every finding
  (6 high, 10 medium, 26 low) now has a fix with a pin proven failing-before -
  or, for the pure coverage additions (`TO-05`, `TO-09`), proven by mutating the
  guarded thing. Highs/mediums: `PY-04` plus its storage boundary and the
  custom-target `vmag` route (T6-F1), `DE-01`, `XL-01` (the cache-token guard),
  `CR3`/`CO-01`, `DE-03`/`WE-02` (ruling C), `PY-01`, `PY-03`, `PY-06`/`PY6`,
  `TO-02`, `XL-02`, `DE-02`, `DE-07`, `DE-08`, `WE-01`. Lows: `PY-02`, `PY-05`,
  `PY-07`, `CO-03`, `CO-04`, `WE-03`, `WE-04`, `DE-04`-`DE-15` and
  `TO-03`-`TO-11` (`TO-07` stays a deliberate WARNING that names the re-bake).
- **Release records** (tag, staged artifacts, gate results, deploy and
  the live checks for 0.6.25-0.6.28) live in `RELEASES.md`.
- A bounded carry-over of non-reachable hardening/tooling/test-quality items
  remains (consume it in the next review pass): `CR2` malformed-horizon guards
  (all shipped producers normalize before preview), `DS4` worker/sync `ceil`
  (max_alt agrees; the residual is a one-bin `ceil` divergence on 516 of 19280
  samples, cosmetic), `DS5` worker revive (sync fallback always planned), `WB7`
  bundle-version check (forward-compat choice). The other rows were closed by
  this batch: `TL3` (the committed-change branch is mutation-proven and its
  absence is now REPORTED, not silent), `TL4` (`--specpath dist` + an exact
  `pyinstaller==6.22.2` pin), `TS4` (`tests/js/core_exports.mjs` drives the eight
  exports no test named), `TS7` (a missing fixture section FAILS and names the
  missing export instead of skipping) and `TL5` (kept a deliberate WARNING, which
  now says so in the record). Baked-core retention is documented in "Versioning
  and release".

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
     (fails if the CURATED entry is missing AND if any shipped web module's
     bytes changed without its `?v=` token being bumped - XL-01, 0.6.24; also
     pinned by `tests/test_pre_tag_check.py`). Do NOT tag until it passes.
  3. `git tag vX.Y.Z` on the release commit.
  4. `scripts/make_release.py` and `web/build_web.py version` **while HEAD is
     exactly at the tag and the tree is clean** (both call `git describe
     --dirty`, so any uncommitted change leaks into the exe/zip/`version.json`).
  5. `scripts/check_release.py` must exit 0 with 0 errors.
  6. browser gate on the STAGED build: `python scripts/check_browser.py --all`
     (in a normal shell or with a one-shot escalation - see `ENVIRONMENT.md`; add
     `--prod-url https://nightseam.de/astro/` once the code is live); then upload
     the changed `web/` tree LAST (index.html very last).
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
  Current (0.6.32, unreleased): `app.js?v=80` (index.html) /
  `CATALOG_TOKEN = '9'`, `astro.js?v=16`, `horizon.js?v=48`, `format.js?v=23`,
  `nightrank.js?v=14`, `webstore.js?v=26`, `dragwin.js?v=1`, `style.css?v=21`,
  `themes.css?v=4`; the core stub is `web/core.js?v=24` (bump = re-bake,
  enforced by `scripts/check_core.py`). The CR3 fix (CO-01, 0.6.24 review)
  touched `core/horizon.js` + `core/index.js`, so the re-bake moved the stub
  17 -> 19 and changed the bytes of every module importing it => that cascade;
  the WE-03 comment corrections moved it 19 -> 20 the same way, and that re-bake
  exercised the N-1 retention policy (the manifest now records a `previous` hash
  and BOTH trees stay in place).
  The tagged v0.6.24 register was 60/10/41/17/7/20 with stub 17; 0.6.23 (live)
  was 59/9/40/16/6/19.
- **A missed bump is now a hard failure (XL-01, 0.6.24).** The v0.6.24 tag
  shipped the 0.6.23 tokens naming 0.6.24 bytes (`index.html app.js?v=59`,
  imports astro 9 / horizon 40 / webstore 19 / format 16 / nightrank 6), so
  returning visitors kept every old module; the bump had to be repaired in the
  post-tag commit `208f7d6`, and no guard could see it. `scripts/check_js_tokens.py`
  (wired into `check_js.py` AND `pre_tag_check.py`) compares each tokenized
  `web/` module against a **VERIFIED BASELINE**: a generated
  `{module: {token, sha256}}` block embedded in the guard itself
  (`# --- BEGIN/END GENERATED VERIFIED BASELINE ---`), which records the last
  state in which the bytes/token pairing was confirmed. The rule is one-way:
  **bytes differ from the baseline while the token still equals the baseline
  token = FAIL**, regardless of how the token compares to any tag. A token that
  moved over unchanged bytes is the legitimate post-tag repair shape (that is
  what `208f7d6` looks like) and leaves the baseline to be refreshed.
  Refresh ONLY with `python scripts/check_js_tokens.py --update`, which
  **REFUSES while any missed bump is present** (bump the token in the same
  change first) and rewrites only the rows whose token actually moved - so the
  documented remedy can never record an unbumped token and bless the defect.
  The stale-baseline hint is never printed alongside a missed-bump finding, and
  hashes are line-ending-normalized (`core.autocrlf=true`), so a CRLF checkout
  is not a finding. Pinned by the guard's built-in `--self-test` (the 0.6.25
  shape, CRLF handling, the `--update` refusal and the hint gating), which
  `scan()` re-runs once per process - so `scripts/check_js.py` and the collected
  `tests/test_pre_tag_check.py` test both fail if the detector regresses.
- **Baked-core retention policy (ENFORCED since the 0.6.24 review, XL-02):**
  keep the CURRENT content-hashed dir plus the immediately previous one (N-1) so a
  visitor holding a cached old `core.js` stub still resolves its tree; remove
  anything older at the next re-bake. `scripts/build_core.py` records the retained
  hash as `previous` in `core/core.manifest.json` and prunes anything older, and
  `check_core.py` FAILS on a stale dir or on a dropped N-1 dir. The policy lives
  in ONE function (`build_core.retention_keep`) so baker and guard cannot drift,
  pinned by `tests/test_core_drift.py::test_baked_core_retention_keeps_current_and_n1`.
  The deployed `/astro` tree is written by `uploadtree`, which never deletes, so it
  can retain dirs older than this policy allows - reconciling that is a deploy
  task, not a guard exemption.
- **Never publish `index.html` before the modules it names.** Deploys are not
  atomic and the page carries the tokens; `ftps_deploy.py::upload_order()` sorts
  HTML last (`index.html` very last), pinned by `tests/test_deploy_order.py`. Keep
  that order when uploading by hand.
- `web/version.json` is gitignored and baked from the tag: a plain
  `uploadtree web /astro` after a code change keeps advertising the old version -
  re-bake on every deploy.

## Architecture

- **One JS core (Phases 1-2): `core/` is the single implementation of the
  shared domain logic.** Both shells import the baked, content-hashed tree
  (`web/core/<hash>/`, `static/js/core/<hash>/`) through the `core.js` stubs;
  Python is storage/platform/IO only. `scripts/check_core.py` (wired into
  `check_js.py` and `check_release.py`) is the guard: drift, stale hash dirs,
  stub/token mismatch, impure identifiers in `core/`, retired Python modules,
  and moved astronomy/planning math re-implemented in `app/` or `scripts/`.
  Never edit the baked trees or stubs by hand - edit `core/` and re-run
  `scripts/build_core.py`.
- `main.py` - entrypoint: uvicorn in a daemon thread, UI in a pywebview window
  (browser app-mode fallback). Single-instance handoff via `data/instance.json`;
  a `JsApi` class exposes a native folder picker to `window.pywebview.api`.
- `app/server.py` - `create_app(db)` FastAPI factory with all `/api/*` routes
  (docs disabled; `prefetch=False` skips the image-cache thread). IO/platform
  only: storage, catalog, panoramas, images, ingest/backup. The planning routes
  (`/api/night`, `/api/object/{oid}`) were DELETED in Phase C; deleted routes
  answer 404. `app/ingest.py` (streaming FITS ingest, 1 GiB cap), `app/backup.py`
  (export/import ZIP).
- `app/database.py` - SQLite, schema created on init, catalog seeded from
  `catalog_data.py` (policy only); BOTH catalog tables are seeded from
  `app/data/openned.csv` (OpenNGC `database_files/NGC.csv` + `addendum.csv`,
  CC BY-SA 4.0, plus the project's own `supplement.csv`) by one `seed_catalog()`: `objects` = the standard-mode selection,
  `advanced_objects` = the rest. The tables are pure seed data and are REBUILT when
  the stored id sets no longer match the CSV + popularity rule, so a catalog or
  popularity change reaches existing user databases with no migration, and an old
  curated-era DB is re-partitioned on first open.
  `app/fits.py` - hand-written FITS parser; `parse_ra_hours`
  / `parse_dec_deg` are the single coordinate parsers (imported by `server.py`).
  `app/imglib.py`, `app/paths.py` (source vs frozen), `app/images.py`
  (Wikipedia/Wikidata/DSS2 chain with on-disk cache + offline breaker).
- `static/` - ES modules loaded via `<script type="module">`, no bundler; imports
  must resolve to real files. Shared helpers (`$`, `$$`, `api()`, `esc`,
  `applyEdgeSpace`) come from `js/util.js`. `js/derive.js` computes
  visibility/score client-side so min-altitude changes never refetch.
- `core/` - the single implementation of the shared domain logic (Phases 1-2):
  `horizon.js` (panorama/sky-band geometry), `astro.js` (JD/GMST/precession/
  altaz, sun/moon), `planning.js` (twilight/night window + the shared
  `scrubWindowMs` degeneracy policy + `scrubBounds`/`scrubClamp`),
  `visibility.js` (predicates, min-alt rule), `scoring.js` (moon/bortle
  curves, popularity, `nightStats`), `catalog.js` (type palette, ids, search),
  `format.js` (sizes/FOV/zoom), `time.js` (IANA offsets). Baked by
  `scripts/build_core.py` to `web/core/<hash>/` + `static/js/core/<hash>/`
  with stable explicit-export stubs; `scripts/check_core.py` enforces
  drift/token/purity and the moved-concept source guard (JS shells AND `app/` +
  `scripts/` Python). Canonical
  representations: world-azimuth profile bins (`profileBins:'world'`), arcmin
  FOV (`fov_unit:'arcmin'`), degrees/epoch-ms elsewhere. Python's old
  astronomy/planning ORACLE role is retired (Phase C, 0.6.20):
  `tests/fixtures/core_fixtures.json` is FROZEN (its generator was deleted with
  the oracle) and compared by `tests/test_core_fixtures.py`; the JS
  parity/convergence anchors are the `tests/js/*.mjs` engines. Python is
  storage/platform/IO only - astronomy math must NOT reappear outside `core/`.

## Catalog: OpenNGC + a 16-object supplement (12,176; standard = the 200 most popular)

- Three sources, ONE generated file (`app/data/openned.csv` -
  `scripts/build_adv_catalog.py` writes it; never hand-edit):
  (1) `database_files/NGC.csv`, NGC/IC - 12,098 objects;
  (2) `database_files/addendum.csv` - 62 notable objects with no NGC/IC number
  (Horsehead, Hyades, Coalsack, the Magellanic Clouds, the Local Group dwarfs,
  Seyfert's Sextet, ...), and
  (3) `app/data/supplement.csv` - the 16 objects OpenNGC cannot carry: 7 that
  it lacks or files as non-objects (0.6.28), plus 9 outside its SCOPE (0.6.29
  - Sharpless/Barnard/LDN/LBN, `vmag` empty; see the catalog-identity
  invariant and `DECISIONS.md`). Through 0.6.25 the addendum was NOT ingested
  while the copy still claimed "OpenNGC"; 0.6.28 added batch 1, 0.6.29
  batch 2.
- Toggled in the hamburger menu (`adv_mode`); changing it reloads the page.
  Standard mode = the 200 most popular objects, advanced = all 12,176. Both come
  from the same rows, so the toggle changes HOW MUCH you see, never WHAT an
  object is.
- `/api/catalog?adv=1` ships advanced objects as METADATA; `static/js/planning_client.js`
  (worker or sync) computes tracks for the whole catalog via core
  `computeNightTracks` (precession once/object at the grid midpoint, sidereal time
  once/sample via `altazFrame`). Never add track arrays
  for the full advanced catalog to a night payload.
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
  hand-edit it. The DB must reflect the current CSV: `Database(...)` re-seeds and
  re-splits both catalog tables on open when they no longer match the CSV +
  popularity rule, so a scratch DB (`Database(<tmp>/db)`) is the clean way to
  regenerate the payload after a catalog change.
- Popularity (The popularity source) is a SILENT ranking tiebreaker (visibility decides,
  popularity separates equals) AND the standard-mode selector (the 200 highest
  scores). The NUMBER is never rendered in either app - `tests/test_ui_invariants.py`
  fails on a score cell, a `${o.popularity` interpolation, a "Popular" chip or a
  detail row - but since 0.6.30 BOTH catalogs expose the ORDERING instead: a
  TIER letter (A-F rank bands, `core/catalog.js::assignPopularityTiers`) as a
  sortable column AND the default sort (web: a `data-k="tier"` header; desktop:
  the `Tier` column with `Sort: popularity tier` as the FIRST `#fSort` option).
  `tests/test_catalog.py` pins the selection rule, the `tier` engine pins the
  bands/ranking, `web-catalog-tier-frame` pins the rendered web table and
  `test_desktop_shows_a_tier_and_never_the_popularity_score` the desktop.
  `app/popularity_data.py` is GENERATED by `python scripts/match_popularity.py`
  (add `--cached` to use `data/popularity_snapshot.json`); the matcher must stay
  deterministic - it scores the HIGHEST match over every designation of a row,
  normalizes leading zeros (The popularity source pads 'PGC 17223', OpenNGC does not - the
  old exact-key match silently dropped the LMC) and carries a small
  `POPULARITY_ALIASES` table for the objects the popularity source keys under another
  designation ('B 33' -> 'BARNARD 33', 'Mel 111' -> 'CL MELOTTE 111', ...).
  The old code iterated a `set` and broke on the first hit, so scores depended on
  PYTHONHASHSEED and the standard list was not reproducible. Run it WITHOUT
  `--cached` to refresh from the live source (0.6.27 did: 17,007 source entries,
  7,640 shipped scores, 535 of them moved); 0.6.28 replayed the SAME cache after
  adding the supplement and only gained entries (7,645, five of the seven) with no
  existing score touched; 0.6.29 replayed it again for the nine batch-2 rows
  (7,654 shipped scores, all nine above the Standard-mode cut). The tests pin the ranking IDENTITY (M42 first, M31
  second), never the numbers, precisely because a refresh moves them.
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
- **Catalog columns + the Min-visibility gate (0.6.30, BOTH apps):** the default
  sort is the popularity TIER (RANK bands, never score bands - the shipped
  distribution is far too heavy-tailed: rank 1 = 166,350, rank 1,500 = 19, the
  last ~4,000 at 1-4), and the user's **Min-visibility slider** (targets/catalog
  toolbar, default 1%, 0 = off, persisted as the `min_vis` setting / the `minVis`
  pref) gates MEMBERSHIP of the list: an object below the threshold is omitted
  rather than parked at 0%, and the count line reports how many. Deliberate
  scoping: an active SEARCH bypasses the web gate (the catalog is also a lookup
  tool), and the desktop keeps the gate OUT of `passesFilters` because
  `skyview.js` feeds the sky chart from it - this control says "omit from the
  list". The web warms visibility for the whole list whenever the gate or the %
  sort needs it (`nightStatsBatch`, 250-object chunks on a 14 ms budget); the
  desktop already carries `obs_pct` for every row. The Frame column shows a
  PERCENTAGE (`framePct` / `coverageCell`), GREEN inside one frame and AMBER once
  the object needs a mosaic (the web's `.over`, the desktop's `st-low`). Pinned
  by the `tier` engine, `test_min_visibility_slider_gates_both_target_lists`,
  `test_desktop_frame_cell_is_green_until_it_needs_a_mosaic` and the
  `web-catalog-tier-frame` browser check. **Both shells rank the set the CURRENT
  MODE shows** (`assignPopularityTiers(activeCatalog())` on the web,
  `assignPopularityTiers(S.catalog)` on the desktop), so they cannot disagree
  about a letter; in standard mode that set is the top-N by popularity, so the
  letters also equal the global ones - proven on the real payload by
  `test_tier_letters_are_mode_independent_on_the_real_catalog` and pinned as a
  rule by `test_both_shells_rank_the_same_set`.
- **The catalogue carries no `distance` (0.6.32)** and neither shell shows one:
  OpenNGC has no distance column, `Pax` exists for 709 of 12,160 rows and for
  galaxies is a foreground star's parallax (M31: 6.0 mas => 167 pc), and
  `Redshift` is not a distance (M101's z => 11 Mly against a true 23 Mly). The
  field was removed from the CSV layout, the seeder and both detail views;
  `Database._drop_retired_fields()` strips it from `SELECT *` so an existing
  user database (whose table keeps the column - schemas are never re-shaped)
  cannot ship it either. `DECISIONS.md` has the measurements.
- **Wikipedia lookups use the DESIGNATION, never the display name (0.6.32):**
  `core/catalog.js::wikiTitles()` = stored `wiki` title, `Messier N`, the
  NGC/IC designation, then the display name; a Messier row without a common
  name is labelled "M101", and `M101` is a DISAMBIGUATION page (motorways),
  so both shells skip disambiguation pages (the web rewrites its link to the
  canonical title the API returns) and the web remembers only a DEFINITIVE
  failure - a rate-limited attempt used to be cached for 30 days as
  "no photo". Pinned by the `wikititles` engine.
- **Progress never moves the layout (0.6.31):** a live status may change its
  TEXT, never the geometry. The catalog's count/status live in a fixed-height
  `.cat-stats` row with a reserved status width, the web table uses
  `table-layout: fixed` so a cell filling in ("…" -> "42%") cannot resize a
  column, and the busy chip sits in a reserved `.busy-slot` in the TOPBAR of
  BOTH shells (as a bare flex item it re-wrapped the topbar and pushed the whole
  app down while it computed). The desktop's `#resultCount` is a fixed-width
  right-aligned block for the same reason. `test_progress_and_status_never_move_the_layout`
  pins the rules and the browser checks MEASURE the geometry (table top, column
  widths, stats height, topbar height) before/while/after progress runs.
- "Free space per side" (web): `main` is
  `max-width: min(100%, max(320px, calc(100% - 2 * var(--edge,14px))))` with NO
  other px cap - a cap inside the `min()` silently defeats the slider. A CSS-only
  fix "does nothing" for a returning visitor unless `style.css`'s `?v=` is bumped
  in the same commit, and verify it at a WIDE viewport (`test_ui_invariants.py`).
- Catalog/type/emoji formatting is a known encoding-mojibake hotspot - run
  `check_encoding.py`.
- The dev mirror `<workspace>\Astro-Web` is BEHIND this repo; the robocopy sync runs
  mirror -> repo, so copy changed files into the mirror first or skip it.

## Phase C (0.6.20): Python astronomy removed

- Deleted, one commit per step: the `planning_client_compute` flag + desktop
  server fallback; `/api/night` and `/api/object/{oid}` (now 404; the image
  route stays); `app/nightcalc.py`; `app/planning.py`; `app/astro.py`; the
  oracle generator `scripts/gen_core_fixtures.py` and the one-off audit tools
  (`scripts/shadow_export.py`/`shadow_compare.mjs`). `PROFILE_BINS` moved to
  `app/server.py` as a storage-format constant.
- Frozen goldens kept: `tests/fixtures/core_fixtures.json` (verified
  byte-identical to the last oracle run before deletion) plus the scrub and
  sun/moon literals frozen into `tests/test_js_parity.py`. Removed:
  `test_astro.py`, `test_precession_reference.py`, `test_planning.py`,
  `test_horizon.py`, `test_horizon_parity.py` and the live Py<->JS comparisons.
- Guard: `scripts/check_core.py` now fails when a retired module reappears or
  `MOVED_PY` math is defined in `app/`/`scripts/` (mutation-proven in
  `tests/test_core_drift.py`).
- Reference anchors: the published-value checks deleted with the Python suites
  (Capitaine/IAU 2006 forward+inverse, Meeus ch.7/12/21 examples, the
  2026-08-12/28 moon phases, the ERFA lunar position, Bennett refraction) were
  PORTED to `tests/js/reference_anchors.mjs` (19 checks) + the mutation proofs
  in `tests/test_reference_anchors.py`.
- Backups written by 0.6.18/0.6.19 containing the retired flag still import
  safely (`tests/test_backup.py::test_import_of_the_retired_planning_flag_stays_safe`).

## History: renamed from AstroPilot

`v0.5.12` and earlier are AstroPilot; `v0.6.0` (2026-09-10) is the first
NightSeam release. There is NO compatibility shim (deliberate, do not "fix"):
an in-place update starts on a FRESH database (rename `data/astropilot.db` to
`data/nightseam.db` by hand to keep old data); pre-rename setup zips/backups are
rejected; installs <= 0.5.12 cannot see updates; browser storage keys are
`nightseam-*`; only `ns-version.js` exists. Do NOT rename the working directory
`<workspace>\AstroPilot-local`, the dev mirror `<workspace>\Astro-Web`, or the deploy path
`/astro`.
