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
| `capturemotion.js` | Worker measuring the camera image's motion for the capture's calibration |
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
  0.01 deg of azimuth, at most 1440: more are thinned evenly
  (Douglas-Peucker at the smallest tolerance that fits), never cut off at
  one end of the azimuth range. A sketch or traced line that would pass the
  limit is thinned to the room left, so points outside its span stay.
  Names are cut at 80 UTF-16 units without splitting a character.
  `overhangs` are up to 20 edge lines with
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
  N.I.N.A., plain lists); where spaces, tabs or semicolons separate the
  fields, a comma between digits is a decimal comma (`90;20,5`). Files with
  more than 1440 distinct points are thinned to the limit and the import note
  says so (`thinned`). `formatHorizonFile` writes them. Overhangs have no
  place in those formats and stay in NightSeam and its backups.
- **Phone capture** (`web/capture.js`). A full-screen view over the page:
  the rear camera (`getUserMedia`, only shown, never recorded or stored;
  closing stops its tracks), a crosshair, an overview strip of the whole
  circle and Start/Stop tracing / Add point / Undo / North… / Done. The
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
  shape too. While the editor's *Phone capture* panel is open,
  `warmCompass` keeps an `AbsoluteOrientationSensor` running at 10 Hz (the
  browser shares one compass between its users), so a capture usually opens
  on a settled compass; it stops when the panel closes or, within 2 s, when
  another tab replaces the editor. The north panel's compass line under
  *Details* (`compassDiag`) says how many compass readings arrive, whether it is
  settling and by how much, and how often it was restarted.
- **North references.** *North…* opens a panel: put the crosshair on the
  Moon (topocentric apparent position for the observing site and the current
  time, `moonDirection`; usable from 2 to 60 deg
  altitude, `referenceUsable`) or on a landmark with a typed true bearing,
  and tap it. `referenceOffset` turns the relative azimuth into the true one;
  a reference replaces the compass for the rest of the capture and works
  without any compass. The view says which reference set north and when, how
  far the compass was off, and (Moon) whether the aim read high or low.
  *Read the compass again* returns to the compass.
- **Loop closure.** A skyline trace with at least 300 deg of net turn asks
  whether the crosshair is back where it started. Yes: `closeLoop` removes
  the closing error in proportion to the angle turned so far; above 3 deg it
  is a missed aim, not drift, and the trace is kept as traced with a note.
  No, or closing the view: kept as traced.
- **Site check.** Where location access is already granted, the view warns
  when the phone is further than 75 m (or twice the GPS accuracy) from the
  observing site (`siteDistanceM`); it never asks for location itself.
- **What the camera shows.** The camera image trails the gyroscope (about
  210 ms on a Pixel 7a, measured), so the readout, the overlay, traced
  samples, *Add point* and the references all use the orientation from that
  long ago (`qAt`/`pointingAt` blend a 2 s history), and whatever is under
  the crosshair on screen is what is recorded. The readout and the overlay
  (only these) average the orientation over up to 60 ms either side of that
  moment (`qAt(t, true)`, core `smoothOrientation`), which calms the sensor's
  jitter without lag. The window narrows to the readings that exist on both
  sides, so on a phone whose camera trails the gyroscope by less than 60 ms
  it stays centred instead of leaning on the past; with no reading after
  that moment it falls back to the plain orientation. recorded
  directions are not averaged, so a peak traced quickly keeps its place. The
  readout is one fixed-width line (`fmtDir`, one decimal: `152.0° SSE · alt
  -12.3°`) and changes at most every 120 ms. The overlay draws the recorded
  points as dots on their lines. The overlay's scale is this
  camera's focal length as a fraction of the video's long side (`k`), one
  value for both axes (one lens, square pixels). `capturemotion.js` runs as a module worker
  (`MediaStreamTrackProcessor`): it shrinks each frame to 108 px wide in
  memory, closes it, and reports only how far the picture moved. Each pair
  of frames ends when the later frame reached the worker and lasts as long as
  the camera's capture timestamps say (`captureGap`; the arrival gap only
  where a frame has no plausible timestamp): frames arrive unevenly, and a
  short arrival gap read as fast motion inflated the scale. Every 2 s
  `matchMotion` compares that with the gyroscope's rate over the last 8 s
  and, where they agree (correlation 0.85 or better, upright phone), updates
  the delay (blended 0.6 old, 0.4 new). The scale is not learned from
  motion: on a Pixel 7a the scale read from motion grew with turning speed
  (0.87 slow, 1.05 at 30-60 deg/s; slow pans alone settled at 0.97) while a
  still test put it at about 0.88.
- **Calibration routine.** The scale is measured still, once per phone. The
  first capture with a camera image offers it in the bottom panel (*Start* /
  *Not now*); *North… › Details › Line up the drawing* starts it again.
  *Start* keeps the orientation with the cross on a sharp feature; a guide
  line is then drawn 36% of the view's width left of the cross, the user
  turns until the feature sits on it and taps *It's on the line*; then a line
  above the cross (75% of the room below the top bar, at most the same
  distance) for tilting down. `guideScale` projects the marked direction
  into the second orientation (`cameraProject`) and divides the guide's
  offset by it; the phone must turn slower than 5 deg/s at each tap, upright
  in portrait. Both steps agreeing within 8% keep their mean, else the
  sideways one; the up-down step is skipped where there is no room or on
  *Skip*. Results and *Not now* (`asked`) are kept per device in
  localStorage `nightseam_capture_cal_v2` (`delayMs`, `k`, `measured`,
  `scaleMeasured`, `asked`; not in backups); the per-axis version 1, learned
  from any motion, is dropped on load. The starting values are the Pixel's:
  210 ms and 0.88 (59 deg across the long side). Browsers without the frame
  API keep the stored or starting delay. The north panel's *Details* also
  hold a monospace camera line (the delay and the long side's field of
  view, each measured, calibrated or the starting value) and *Reset camera
  values*, which returns to the starting values, forgets the stored ones and
  offers the routine again next time.
- **Sharper motion.** Browsers expose no stabilisation (OIS/EIS) control;
  the Pixel 7a's camera offers manual exposure and ISO. Where a camera allows
  manual exposure, a *Sharper motion* toggle sets 1/60 s and raises the ISO
  by the same factor (the same light), since in dim light the automatic
  exposure reached 60 ms a frame, which smears motion, drops the frame rate
  and adds delay. Off gives the exposure back to the camera.
- **AR overlay.** A canvas over the video draws lines only: the level
  horizon with compass marks, the skyline, overhang edges and the trace in
  progress, each projected with `cameraProject` from the orientation the
  image shows and north, for directions within reach of the camera axis
  only, at most 1.5x pixel density (about 1-2 ms a frame on a Pixel 7a). The
  focal lengths are the calibration's, scaled the way `object-fit: cover`
  shows the video; device axes turn with `screen.orientation.angle`. A trace (one tap
  starts it, another stops it) becomes one line through
  `sweepLine` (continuous azimuths, latest sample per 0.25 deg, simplified,
  steps of at most 90 deg) and replaces that stretch of skyline, or becomes
  overhang edges split at north. While tracing, the gyroscope's rate
  averaged over 250 ms is the turning speed: above 30 deg/s the view asks to
  slow down (status line and crosshair in the warning colour) until it falls
  below 20 deg/s. `navigator.vibrate`, where it exists, marks starting and
  stopping a trace, adding a point and the too-fast hint with short,
  distinct patterns; the hint vibrates only the first time in a trace. Where the browser offers
  `DeviceOrientationEvent.requestPermission`, it is asked inside the tap and
  nothing waits on it: a later grant restarts the compass. While the view is
  open, `cap-open` on the root element sets `overscroll-behavior: none`, so a
  downward swipe cannot trigger Chrome's pull-to-refresh and lose a trace.
- **Share links.** *Share link* encodes the horizon (`encodeHorizonLink`:
  version byte, UTF-8 name, points and overhang edges in 0.01 deg as
  zigzag variable-length deltas, URL-safe base64; exact round trip, a
  720-point skyline is under 4,000 characters; a horizon whose code would
  pass the reader's 60,000-character limit gets no link, and the note says
  to export a file) into
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
| localStorage `nightseam_capture_cal_v2` | This device's camera delay and scale for the capture overlay (not backed up) |
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
  `scripts/check_browser.py --web`. A check that waits for a file chooser
  first registers a `filechooser` listener, well before the key or click:
  `expect_file_chooser()` alone arms interception too late on a busy page,
  and Chrome then opens its own dialog instead (BROWSER-CI-002).
- **CI** (`.github/workflows/checks.yml`) runs the guards and pytest on
  Windows and the browser suite on Linux, for every pull request and every
  push to `main`.
