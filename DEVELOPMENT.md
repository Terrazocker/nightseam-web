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
| `horizon.js` | Panorama editor, persistence and undo/redo history |
| `horizonsetup.js` | Guided photo setup and the "Sky outside the photo" switch |
| `horizonsimple.js` | Two-point reference picking, preview, apply and checks |
| `horizontrace.js` | Skyline tracing |
| `horizonphoto.js` | Original-photo bytes, header checks and resampling to the angular view |
| `horizongeographic.js` | Coverage and capture evidence |
| `webstore.js` | IndexedDB records, preferences, timezones and backup/restore |
| `viztheme.js` | Canvas colors read from `themes.css` |
| `imagecredits.js` | Exact-file photo credits |

## Time and the planning night

- **Site time.** Every date is the observing site's calendar date. Night scans
  start at the site's local noon; `core/time.js` resolves zone offsets with DST
  handling (the earlier instant in an overlap, forward through a gap). Unknown
  IANA zones are refused at every entry point.
- **Dark window.** `nightInfo` scans 30 h from site noon for the -6/-12/-18 deg
  crossings; `pickDarkWindow` uses astronomical darkness, else nautical, else
  civil, else a fixed 20:00-04:00 site-clock fallback (polar day or twilight).
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
above the horizon ceiling and below any upper ceiling. `visibilityReason` and
`panoramaVisibilityReason` name why it is not; `unknown_horizon` marks a block
caused by missing horizon evidence rather than a recorded obstruction.
Popularity only breaks ties and is never shown.

## Horizon model

- **Profiles.** A horizon is a 720-bin world-azimuth profile (0.5 deg bins),
  derived from a 720x360 mask. Obstacle mode records the obstruction top; sky
  mode records painted sky bands, optionally blocking above them.
- **Strokes win.** Ordered brush/eraser dabs and skyline traces are the source
  of truth when present; a record without strokes keeps its stored profile.
- **Crops** are non-destructive rectangles against the original photo.
- **Photo conversion.** A source photo (angular panorama, cylindrical panorama
  or corrected ordinary photo; up to 32 MP and a 25 MB upload) is resampled
  into an angular working view of at most 2 MP. The original bytes are kept.
- **Calibration evidence** has versions 1-5. Version 5 fits heading, pitch and
  roll from reference points (1 deg tolerance), with held-out checks that must
  lie at least 2% of the image away from every fitting point.
- **Coverage policy** decides what counts outside the photo: `legacy` (open
  everywhere), `inferred-open` (open above the skyline, unphotographed
  directions excluded; the default for converted photos) and `strict-measured`
  (only what the photo shows). `ceilFor` and the scorer share it.

## Storage and backups

| Where | What |
|---|---|
| localStorage `nightseam_prefs_v1` | Preferences |
| localStorage `nightseam_panos_v1` | Panorama records (without photos) |
| localStorage `nightseam_site_v1`, `nightseam_theme` | Legacy site record, theme |
| IndexedDB `nightseam-db-v1` | Sites, rigs, custom targets, safety snapshot |
| IndexedDB `nightseam-panoimg` | Original panorama photos |
| IndexedDB `nightseam-images` | Wikipedia thumbnail cache |

A backup is one JSON bundle (format 10; formats 1-9 still import, newer ones
are refused). Restore validates and stages the whole bundle, checks that the
current data could itself be restored, then replaces the records and a safety
snapshot in one transaction; any later failure rolls the whole app back.
Other open tabs reload when panoramas or preferences change.

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
- **CI** (`.github/workflows/checks.yml`) runs the guards, pytest and the
  browser suite on Windows for every push and pull request.
