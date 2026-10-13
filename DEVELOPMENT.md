# How NightSeam Web works

A current guide to the planner's architecture. Rules for changing it are in
[AGENTS.md](AGENTS.md), the reasoning behind them in [DECISIONS.md](DECISIONS.md),
and dated implementation notes in
[docs/history/DEVELOPMENT_LOG.md](docs/history/DEVELOPMENT_LOG.md).

## Shape of the system

The planner (`web/`, served under `/astro/`) and the public pages (`landing/`,
served at `/`) are static files. There is no server-side application, npm or
bundler: the browser loads plain ES modules whose URLs carry `?v=` cache tokens.
Python is used only for build, guard, release and test tooling.

All astronomy, planning, scoring and horizon geometry lives in `core/`.
`scripts/build_core.py` copies it, line-ending normalized, into a
content-addressed tree `web/core/<16-hex hash>/` and writes the `web/core.js`
re-export stub. `core/core.manifest.json` records the current hash, the cache
token and the previous tree; exactly the current and previous trees are kept.
Web modules import only `./core.js?v=<token>`, never `web/core/<hash>/`.

## Web modules

| Module | Owns |
|---|---|
| `app.js` | Shell state (`S`), Tonight, Catalog, Sky View, the detail card, weather and Wikipedia photos |
| `astro.js` | Thin wrapper over core astronomy and planning |
| `nightrank.js`, `format.js` | Re-exports of core scoring and formatting |
| `horizon.js` | Horizon editor, horizon and photo storage, preferences |
| `webstore.js` | IndexedDB records, preferences, timezones and backup/restore |
| `viztheme.js` | Canvas colors read from `themes.css` |
| `imagecredits.js` | Exact-file photo credits |

## Time and the planning night

- **Site time.** Every date is the observing site's calendar date. Night scans
  start at the site's local noon; `core/time.js` resolves zone offsets with DST
  handling (the earlier instant in an overlap, forward through a gap). Unknown
  IANA zones are refused at every entry point.
- **Dark window.** `nightInfo` scans 30 h from site noon for sunset/sunrise
  (upper limb on the horizon: true centre -0.8333 deg) and the -6/-12/-18 deg
  crossings, refining a turn between samples so spells shorter than the
  10-minute step are found; `pickDarkWindow` takes dusk and dawn from one
  level: astronomical darkness, else nautical, else civil, else a fixed
  20:00-04:00 site-clock fallback (polar day or twilight).
- **Selected time.** One selected instant (`S.skyTime`, one-minute steps)
  drives every view. The time slider spans sunset to sunrise, or the fallback,
  or noon to the next noon in full-day mode (23 or 25 h across DST).
- **Detail card.** Rise, set and culmination use `objectNightInfo` over the
  planned night: site noon on the selected date to the next site noon.
- **Sun and Moon.** Visibility uses apparent altitude above 0 deg. The Moon is
  topocentric for a sea-level observer; site elevation is stored metadata and
  does not change visibility.

## Scoring and visibility

One loop scores every view: `computeNightTracks` builds object tracks on a
6-minute grid and `scoreNightTracks`/`nightStats` turn them into usable
minutes, best windows and scores. Grid cells are half-open and clipped to the
exact dark window. A sample is usable when it is above the minimum altitude,
above the horizon ceiling and below any overhang edge above it.
`visibilityReason` and `panoramaVisibilityReason` name why it is not.
Popularity only breaks ties and is never shown.

## Horizon model

Design and reasons: [DECISIONS.md](DECISIONS.md) ("Rebuild the horizon
editor"); plan: [docs/horizon/HORIZON_REBUILD_PLAN.md](docs/horizon/HORIZON_REBUILD_PLAN.md).

- **Record.** `{ id, name, points, overhangs, photo, hasPhoto }`. `points`
  are world azimuth/altitude pairs (altitude -10 to 90), sorted, one per
  0.01 deg of azimuth, at most 1440. `overhangs` are up to 20 edge lines with
  azimuths within 0-360 (an edge crossing north is split there).
  `core/horizon.js` normalizes every record.
- **Profile.** Points are joined by straight lines around the circle; no
  points blocks nothing, one point is a flat skyline. `skylineProfile` turns
  them into 720 world-azimuth bins (0.5 deg) holding the highest altitude in
  each bin. `overhangProfile` gives `profileTop`: for every bin an overhang
  touches, the lowest edge altitude in it, else 90.5 (open). `withProfile`
  attaches both in memory; `ceilFor` returns them as `ceil`/`ceilTop` and the
  scorer reads the same arrays. They are never stored or backed up.
- **Photo placement.** `{ width, heading, tilt, roll }`: the horizontal angle
  (360 = full panorama, which wraps and is never rolled), the azimuth and
  altitude of the photo centre and its rotation, with square pixels in
  degrees. `photoToWorld`/`worldToPhoto` map between them; `reprojectPoints`
  moves the skyline when the placement changes; `headingForLandmark` sets
  north from one known direction. Ordinary photos use the same linear mapping,
  an approximation that grows towards their edges.
- **Detection.** `detectSkylineRows` finds the sky/ground boundary per column
  of a downscaled daylight photo (Otsu threshold on brightness plus blueness,
  a run of three ground pixels, a 5-column median); the editor maps the rows
  through the placement and simplifies them (0.25 deg).
- **Files.** `parseHorizonFile` reads `azimuth altitude` lines (Stellarium,
  N.I.N.A., plain lists); `formatHorizonFile` writes them. Overhangs have no
  place in those formats and stay in NightSeam and its backups.
- **Phone compass.** `devicePointing(alpha, beta, gamma)` gives the back
  camera's direction from W3C device orientation. The editor prefers absolute
  (`deviceorientationabsolute`, or iOS `webkitCompassHeading`) readings and
  adds a session-only correction set from one landmark, which covers compass
  error and magnetic declination. `requestPermission` is raced against 1.5 s,
  because some browsers expose it without ever settling it.
- **North from the Sun.** `sunDirection(jd, lat, lon)` is the apparent Sun;
  `placementFromKnownDirection` sets heading and tilt so a marked pixel lands
  on it. `photoCaptureTime` reads DateTimeOriginal and OffsetTimeOriginal
  from JPEG EXIF; without an offset the camera clock is read as site time.
- **Editor.** One canvas: azimuth 0-360 across, altitude -10 to 80 up, with a
  zoom of 1-12x. Draw mode adds, drags, sketches and deletes points; Align
  photo drags the photo (and rolls partial photos); Overhang mode draws and
  edits overhang edges. Each finished gesture is one history entry
  (`core/horizonhistory.js`, 100 entries, covering points, overhangs and the
  placement) and saves at once.
  Re-rendering the same horizon keeps its history.
- **Limits.** 50 horizons; uploads are JPEG or PNG up to 25 MB and 32 MP
  (checked from the header before decoding); imported files up to 1 MB.

## Storage and backups

| Where | What |
|---|---|
| localStorage `nightseam_prefs_v1` | Preferences |
| localStorage `nightseam_horizons_v2` | Horizon records (without photos or profiles) |
| localStorage `nightseam_site_v1`, `nightseam_theme` | Legacy site record, theme |
| IndexedDB `nightseam-db-v1` | Sites, rigs, custom targets, safety snapshot |
| IndexedDB `nightseam-horizon-photos` | Original horizon photos |
| IndexedDB `nightseam-images` | Wikipedia thumbnail cache, at most 25 MiB: least recently viewed photos are removed first; a full disk trims it to a quarter and retries once |

A backup is one JSON bundle (format 11; formats 1-10 still restore their
sites, rigs, targets and settings but not their retired panoramas; newer
formats are refused). The retired `nightseam_panos_v1` and `nightseam-panoimg`
stores are deleted on load, not converted. Restore validates and stages the whole bundle, checks that the
current data could itself be restored, then replaces the records and a safety
snapshot in one transaction; any later failure rolls the whole app back.
Other open tabs reload when horizons or preferences change.

## Catalog

OpenNGC plus a 16-object supplement: 12,176 objects in `web/catalog.json`,
with a separate provenance sidecar. Standard mode shows 200 objects chosen by
a static, offline popularity table; advanced mode shows all of them. Both
payloads are paired with a token and a manifest. See [CATALOG.md](CATALOG.md).

## External requests

Only on use: Open-Meteo forecast and air quality (site coordinates and
timezone), Wikipedia summaries and image metadata, and Wikimedia thumbnails.
Geolocation runs only from the "use my location" button. The planner's content
security policy is a `<meta>` tag in `web/index.html`, because the host serves
HTML without applying `.htaccess` headers.

## Publication

`scripts/prepare_publication.py` packages `web/` and `landing/` as immutable
`releases/<sha256>/` trees plus canonical HTML pointing at them.
`web/ftps_deploy.py publish` uploads the trees with verified atomic renames,
checks the whole graph, and only then switches each HTML page. Old releases
stay for already open tabs. A changed server `.htaccess` is refused for
separate review. See [RELEASE_WORKFLOW.md](RELEASE_WORKFLOW.md) and
[HOSTING_CONFIGURATION.md](HOSTING_CONFIGURATION.md).

## Tests

- **pytest** (`tests/test_*.py`) runs the Python guards and drives the Node
  tests in `tests/js/*.mjs`.
- **Reference anchors** (`tests/js/reference_anchors.mjs`) are the correctness
  authority: IAU 2006 precession, Meeus examples, published Moon phases, an
  independent lunar model and USNO 2026 rise/set and twilight tables
  (`tests/fixtures/usno_2026/`). Frozen fixtures catch regressions only.
- **Browser checks** (`tests/browser/*_checks.py`) run in real Chrome through
  `scripts/check_browser.py --web`.
- **CI** (`.github/workflows/checks.yml`) runs the guards and pytest on
  Windows and the browser suite on Linux, for every pull request and every
  push to `master`.
