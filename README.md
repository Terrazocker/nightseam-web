# NightSeam

*Formerly AstroPilot — renamed in 0.6.0, now at <https://nightseam.de>.*

A one-click desktop app for planning deep-sky astrophotography sessions around
obstacles in your backyard (trees, houses, ...) - plus a full image-catalog
mode that organizes your captured FITS frames.

NightSeam runs as a small local web server and opens its UI in your default
browser (or a native window). It ships with **no external runtime
dependencies** on the target machine and works fully offline except for
optional object example images (fetched from Wikipedia and cached locally).

There is also a **web version** — the same night-planning core, running 100%
in your browser with no server:

- **Web app:** <https://nightseam.de/astro/>
- **Landing page / downloads:** <https://nightseam.de/>

## License

MIT — see [LICENSE](LICENSE). Third-party data and service credits
(OpenNGC CC BY-SA 4.0, Wikimedia images, Open-Meteo) are listed in
[NOTICE](NOTICE).

Two modes, switched with the top-right button:

- **Night Planner** - plan what to shoot and when.
- **Image Catalog** - import, organize and inspect your capture sessions.

## Features

### Night Planner

- **DSO catalog** - the complete OpenNGC catalog: NGC/IC plus the OpenNGC
  addendum, the notable objects with no NGC/IC number (Horsehead, Hyades,
  Coalsack, Magellanic Clouds, Sculptor/Fornax dwarfs) - 12,160 objects to
  magnitude 20. Standard mode shows the 200 MOST POPULAR of them (community
  observing counts, as a silent ranking input); **advanced mode** (hamburger
  menu) shows all 12,160. Each object carries its designations - search
  "M101" or "NGC 5457" and you get the same object.
- **Location-aware visibility** - enter your observing site(s) once; every
  calculation is done for your exact coordinates and elevation, including
  atmospheric refraction and precession.
- **Panorama horizon masking** - import a 360-degree panorama photo taken from
  your telescope spot, calibrate it (azimuth rotation + elevation range) and
  simply paint over everything that blocks the sky. NightSeam converts your
  painting into an obstruction-height profile per azimuth degree; a sky-paint
  mode can also mask the area *above* a visible band.
- **Altitude graphs** - per object: altitude over the course of the night with
  green segments where the target is clear and high enough, red where an
  obstacle blocks it, amber where it is too low - plus the obstruction ceiling,
  moon altitude, twilight shading and a hover tooltip.
- **Sky view** - polar whole-dome chart with live positions of all catalog
  objects, sun/moon and your painted obstacle silhouette, plus an optional
  min-altitude band. Scrub through the night with the time slider
  (arrow keys, Shift = 10 min).
- **Tonight view** - dark-time summary, moon phase and the best targets right
  now / rising later, ranked by an imaging-quality score. Moon-aware ranking
  penalizes targets near a bright Moon (per object type) and honors your
  Bortle sky class (hamburger menu).
- **Timezone-aware planning** - all times render in your machine's zone with
  DST applied per date (planning a December night in summer is not shifted).
  An optional IANA timezone picker (advanced mode) plans for a distant
  observing site.
- **Constellation filter** keeps the target list tidy.
- **Timezone-aware planning** - all times render in your machine's zone with
  DST applied per date (planning a December night in summer is not shifted).
  An optional IANA timezone picker (advanced mode) plans for a distant
  observing site.

### Image Catalog

- **FITS ingest** - upload light frames (or drop them on the pane); the object
  is identified from the FITS header (OBJECT, coordinates) and the file name.
  Frame types (lights/darks/flats/bias) come from the IMAGETYP header or are
  forced per upload.
- **Session archive layout** - originals are copied (never moved) into
  `<archive>/<Object>/<session>/<lights|darks|flats|bias>/`, where the session
  folder is the capture night (`YYYY-MM-DD_HHMM`); frames less than 12 h apart
  share one folder, different nights get their own folders.
- **Import history** - one entry per captured session, newest first, each with
  +darks/+flats/+bias buttons that upload straight into that night's folder,
  and an open-in-Explorer button.
- **Library** - per-object rollups of frame types and filters, sessions with
  date/duration and per-session statistics, thumbnail-free session expansion,
  rename/retype for unresolved objects, CSV/JSON export, folder reindexing for
  files placed on disk manually, and open-folder-in-Explorer per object.

## Quick start

### Packaged executable

1. Download the latest release from <https://nightseam.de/download.html>.
2. Double-click `NightSeam.exe`.
3. Your browser (or the app window) opens `http://127.0.0.1:<port>`
   automatically.
4. First start: the wizard asks for your observing location (gear icon ->
   Sites also works; "Use my location" fills it automatically).
5. Horizon & Obstacles tab: import a panorama, calibrate, paint obstacles,
   click "Use for planning".
6. Switch to the Image Catalog for your captures: pick an archive folder,
   import your light frames.

The app checks once per start whether a newer version is available on
nightseam.de and shows a toast if so; nothing is transmitted beyond the version
request itself.

All user data lives next to the exe in `data\` (SQLite DB + panorama images +
image cache + import history). Quit via the shutdown endpoint
(`/api/shutdown`) or kill the process; the app also exits by itself after 12 h
without requests (`--idle-exit-hours 0` disables that).

### Run from source

    pip install -r requirements.txt   # pyinstaller only needed for building
    python main.py                    # add --console to see log output

## Building the exe yourself

    powershell -ExecutionPolicy Bypass -File build.ps1

Creates an isolated `.venv-build`, installs dependencies and produces
`dist\NightSeam.exe`.

## Taking a usable panorama

1. Stand at your telescope position.
2. Shoot a 360-degree panorama at roughly telescope height (phone pano mode
   works fine; keep the phone level).
3. Note which direction the LEFT edge of the image points (e.g. stand facing
   north and start panning eastwards -> left edge ~0 degrees).
4. In the editor set *Azimuth at left edge* until the N/E/S/W labels line up
   with reality, then adjust bottom/top elevation until the grid matches your
   image geometry (bottom = 0 deg if the horizon sits at the image bottom).
5. Use *Horizontal field of view* if your pano is not exactly 360 deg wide:
   larger values cover ultra-wide panos, smaller values partial ones.
   Azimuths outside the image stay unblocked.
6. Use the **Crop tool** to trim empty margins or misaligned edges (drag a
   rectangle, Apply). Cropping resets paint mask and profile.
7. Paint over trees/houses with the brush (use the eraser to fix mistakes),
   then "Use for planning". The red line shows the resulting obstruction
   height that planning will respect.

Windows may show a SmartScreen warning on first launch of a self-built exe -
choose "More info" -> "Run anyway".

### Command line switches

    NightSeam.exe                native app window (default)
    --browser                     open in a regular browser tab instead
    --no-browser                  headless, no UI
    --port N                      fixed port (default 8407)
    --console                     also log to console
    --idle-exit-hours N           exit after N h without requests (default 12)

## Where do the numbers come from?

All sky calculations are computed locally on your machine from standard
published algorithms - no internet service is involved:

- **Sunrise / sunset / twilight** come from the Sun's geocentric position
  (Meeus, *Astronomical Algorithms*, ch. 25, ~0.01 deg accuracy) combined with
  your exact coordinates and elevation; rise/set are the crossings of the
  apparent solar altitude through 0 deg, civil/nautical/astronomical night
  begin when it passes -6/-12/-18 deg (including Saemundsson refraction).
- **Moon phase / illumination percentage** is derived from the elongation
  angle between Moon and Sun using a truncated lunar series (Meeus ch. 47,
  ~0.3 deg), illuminated fraction k = (1 - cos(elongation)) / 2.
- Object altitudes use J2000 catalog coordinates precessed to date plus
  standard sidereal time and refraction (typically well below 0.1 deg error).

Object example images are the only online content: they are fetched once from
Wikipedia and cached in `data\imgcache`; offline you get generated
placeholders instead.

## Accuracy notes

Positions are computed from J2000 catalog coordinates with precession to date,
standard sidereal time and Saemundsson refraction (typical error well below
0.1 degree for stars/DSOs). Solar/lunar positions use compact Meeus series
(~0.01 / ~0.3 degree) - plenty for twilight times, obstruction tests and moon
phase. Obstacle comparisons use apparent altitudes on both sides consistently.

Not included on purpose: satellite/planet positions, weather, ephemeris-grade
lunar librations.