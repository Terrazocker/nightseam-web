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
| `horizon.js` | Horizon editor, horizon storage, preferences |
| `capture.js` | Phone capture: camera view, crosshair, orientation sensors, tracing |
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
editor", "Capture horizons with the phone's sensors"); plans:
[docs/horizon/HORIZON_REBUILD_PLAN.md](docs/horizon/HORIZON_REBUILD_PLAN.md),
[docs/horizon/HORIZON_SENSOR_CAPTURE_PLAN.md](docs/horizon/HORIZON_SENSOR_CAPTURE_PLAN.md).

- **Record.** `{ id, name, points, overhangs }`. `points`
  are world azimuth/altitude pairs (altitude -10 to 90), sorted, one per
  0.01 deg of azimuth, at most 1440. `overhangs` are up to 20 edge lines with
  azimuths within 0-360 (an edge crossing north is split there).
  `core/horizon.js` normalizes every record; the photo fields of older
  builds (`photo`, `hasPhoto`, an embedded `image`) are dropped, never
  checked.
- **Profile.** Points are joined by straight lines around the circle; no
  points blocks nothing, one point is a flat skyline. `skylineProfile` turns
  them into 720 world-azimuth bins (0.5 deg) holding the highest altitude in
  each bin. `overhangProfile` gives `profileTop`: for every bin an overhang
  touches, the lowest edge altitude in it, else 90.5 (open). `withProfile`
  attaches both in memory; `ceilFor` returns them as `ceil`/`ceilTop` and the
  scorer reads the same arrays. They are never stored or backed up.
- **Files.** `parseHorizonFile` reads `azimuth altitude` lines (Stellarium,
  N.I.N.A., plain lists); `formatHorizonFile` writes them. Overhangs have no
  place in those formats and stay in NightSeam and its backups.
- **Phone capture** (`web/capture.js`). A full-screen view over the page:
  the rear camera (`getUserMedia`, only shown, never recorded or stored;
  closing stops its tracks), a crosshair, an overview strip of the whole
  circle and Start/Stop tracing / Add point / Undo / Re-read compass / Done. The
  shape comes from the relative orientation (`RelativeOrientationSensor`,
  falling back to `deviceorientation` through `orientationQuaternion`; both
  as quaternions), which does not jump near metal. North is set once the
  compass has settled: the circular mean (`circularMean`) of compass minus
  relative azimuth over 3 s of readings taken while the phone points within
  60 deg of level, locked only when the older and newer halves of that
  window agree within 1 deg and scatter no more than 4 deg (after 20 s an
  unsettled value is taken and the view says north may be off). A freshly
  started compass swings towards its heading for about 10 s on a Pixel 7a,
  and locking earlier set north 44 deg off (measured over USB debugging).
  North is then kept for the session unless re-read. The compass sources
  (`AbsoluteOrientationSensor`, `deviceorientationabsolute`) restart every
  2.5 s, up to 40 times, while north is missing and no usable compass
  reading has paired for 1.5 s, and again when a motion permission is
  granted. Without a relative source for a second the compass gives the
  shape too.
- **AR overlay.** A canvas over the video draws lines only: the level
  horizon with compass marks, the skyline, overhang edges and the trace in
  progress, each projected with `cameraProject` from the current orientation
  and north, for directions within reach of the camera axis only, at most
  1.5x pixel density (about 1-2 ms a frame on a Pixel 7a). The focal
  length assumes a 67 deg field of view along the long side of the video,
  scaled the way `object-fit: cover` shows it; device axes turn with
  `screen.orientation.angle`. The crosshair is exact; away from it the
  overlay is only as right as the assumed field of view. A trace (one tap
  starts it, another stops it) becomes one line through
  `sweepLine` (continuous azimuths, latest sample per 0.25 deg, simplified,
  steps of at most 90 deg) and replaces that stretch of skyline, or becomes
  overhang edges split at north. Where the browser offers
  `DeviceOrientationEvent.requestPermission`, it is asked inside the tap and
  nothing waits on it: a later grant restarts the compass.
- **Share links.** *Share link* encodes the horizon (`encodeHorizonLink`:
  version byte, UTF-8 name, points and overhang edges in 0.01 deg as
  zigzag variable-length deltas, URL-safe base64; exact round trip, a
  720-point skyline is under 4,000 characters) into
  `/astro/#horizon=<code>`. The fragment is never sent to a server. It goes
  to the system share sheet (`navigator.share`), else the clipboard, else a
  dialog with the link to copy. Opening such an address routes to Horizon,
  replaces the address with `#horizon` at once (`history.replaceState`), and
  `offerHorizonLink` decodes the code completely (`decodeHorizonLink`
  refuses anything damaged, truncated, over 60,000 characters or out of
  range) and asks before adding it as a new horizon; cancelling or a bad
  link saves nothing.
- **The Sun's direction.** `sunDirection(jd, lat, lon)` is the apparent Sun,
  kept for the sensor capture's north reference (plan phase 3).
- **Editor.** One canvas: azimuth 0-360 across, altitude -10 to 80 up, with a
  zoom of 1-12x. Draw mode adds, drags, sketches and deletes points;
  Overhang mode draws and edits overhang edges. Each finished gesture is one
  history entry (`core/horizonhistory.js`, 100 entries, covering points and
  overhangs) and saves at once.
  Re-rendering the same horizon keeps its history.
- **Limits.** 50 horizons; imported files up to 1 MB (Import file or a file
  dropped on the editor; a dropped photo is explained, not opened).

## Storage and backups

| Where | What |
|---|---|
| localStorage `nightseam_prefs_v1` | Preferences |
| localStorage `nightseam_horizons_v2` | Horizon records (without profiles) |
| localStorage `nightseam_site_v1`, `nightseam_theme` | Legacy site record, theme |
| IndexedDB `nightseam-db-v1` | Sites, rigs, custom targets, safety snapshot |
| IndexedDB `nightseam-images` | Wikipedia thumbnail cache, at most 25 MiB: least recently viewed photos are removed first; a full disk trims it to a quarter and retries once |

A backup is one JSON bundle (format 11; formats 1-10 still restore their
sites, rigs, targets and settings but not their retired panoramas; newer
formats are refused). Format 11 backups with horizon photos restore their
skylines and overhangs; the photos are dropped. The retired
`nightseam_panos_v1`, `nightseam-panoimg` and `nightseam-horizon-photos`
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
