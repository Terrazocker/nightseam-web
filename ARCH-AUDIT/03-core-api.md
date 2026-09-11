# 03 - Proposed core public API and boundary

Baseline: frozen tag `v0.6.14` = `383007c`; tree `v0.6.14-2-g834b6bb`.

This document is a design proposal for the audit. It is validated against the
current export surfaces (`web/*.js`, `static/js/*.js`, `app/*.py` function
lists) so no function is invented without an existing behavioural twin.
No code is changed by this audit.

## 1. Layout

```
core/
  index.js      public re-exports only (stable surface for shells/tests)
  constants.js  NO_BLOCK, BINS/BIN_DEG, MASK_W/H, sentinels, scrub/zoom constants
  time.js       julian day, site-zoned day bounds, DST offset arithmetic
  astro.js      precession, gmst, altaz, refraction, sun, moon
  planning.js   twilight, night window, longest run, scrub/index ranges
  visibility.js min-alt rule, visibility predicate, ceil/ceilTop gating
  scoring.js    moon/bortle curves, nightStats, popularity factor
  horizon.js    mask/profile math, transforms, edge and sky-band geometry
  catalog.js    magVisible, search blob, type maps, size/frame/FOV helpers
  format.js     size/FOV/time/coordinate string formatting
```

The baked artifacts and the stable stub live outside `core/` (mechanism in
`04-sharing-mechanism.md`). `core/` is import-source only; nothing reads it at
runtime except the bake step and Node tests.

## 2. Rules the API obeys

1. Pure functions only: same inputs -> same outputs. No `Date.now()`,
   `Math.random()`, module-level mutable state, DOM, storage, network.
   `now`/offsets are parameters.
2. Plain data in/out: numbers, strings, booleans, arrays, plain objects.
   No classes, no `Date` objects, no typed-array requirements except the mask
   (`Uint8Array` is accepted as plain data and returned by `rebuildMask`).
3. Angles in degrees; times as epoch milliseconds or ISO-8601 UTC strings;
   explicit `Ms`, `Deg`, `Min` suffixes in parameter names.
4. Deterministic rounding belongs to call sites: core returns full precision
   (the payload currently rounds at `app/nightcalc.py:133-140`; the rounding
   stays in the adapter).
5. Functions fail soft on malformed data exactly like today's guards
   (`web/horizon.js:512-520`, `app/nightcalc.py:36-41`): corrupt profile ->
   "nothing blocks" (obstacle) / "fully blocked" (sky).

## 3. Module list and signatures

Only signatures that already have implementations somewhere are listed. `[D]`
marks functions that require the bin-convention decision first
(`05-phased-plan.md`, decision D1).

### core/constants.js

```
NO_BLOCK = -90; BINS = 720; BIN_DEG = 0.5; MASK_W = 720; MASK_H = 360;
OPEN_ABOVE = 90.5; UNPAINTED_SKY = 90;
SCRUB_STEP_MIN = 6; SCRUB_SHIFT_STEP_MIN = 60;
SKY_ZOOM_MIN = 1; SKY_ZOOM_MAX = 8;
```

### core/time.js

```
julianDay(epochMs) -> number                      // astro.py:25 / astro.js twins
dateFromJD(jd) -> epochMs                         // web/astro.js:58
dayBoundsSiteZoned(dateISO, tzOffsetMin) -> {startMs, endMs}
```

### core/astro.js

```
gmstDeg(jd) -> Deg
precessJ2000ToDate(raDeg, decDeg, jd) -> [raDeg, decDeg]
precessDateToJ2000(raDeg, decDeg, jd) -> [raDeg, decDeg]
refractionDeg(trueAltDeg) -> apparentAltDeg       // semantics of web/astro.js:121
altaz(raDeg, decDeg, jd, latDeg, lonDeg, refract = true) -> [altDeg, azDeg]
altazFrame(latDeg, lonDeg, jds) -> Frame          // static/js/astro.js:66
altazFrameApply(frame, raDeg, decDeg, i) -> [altDeg, azDeg]
sunRaDec(jd) -> [raDeg, decDeg]
sunAlt(jd, lat, lon) -> apparentAltDeg
sunAltAz(jd, lat, lon) -> [altDeg, azDeg]
moonRaDec(jd) -> [raDeg, decDeg]
moonIllumination(jd) -> 0..1
moonAge(jd) -> days
moonPhase(jd) -> {name, waxing, icon, illum, age, elongationDeg}
moonAltAz(jd, lat, lon) -> [altDeg, azDeg]
aboveHorizon(apparentAltDeg) -> boolean
sepDeg(alt1, az1, alt2, az2) -> Deg
sepRaDec(ra1, dec1, ra2, dec2) -> Deg
objectTrack(raDeg, decDeg, jd0, jd1, lat, lon, stepMin = 4) -> Sample[]
objectDayInfo(raDeg, decDeg, dayStartMs, lat, lon) -> {riseMs, setMs, transitMs}
```

### core/planning.js

```
sunCrossings(scanStartMs, lat, lon, thresholdDeg) -> Ms[]      // web/astro.js:318
findTwilight(lat, lon, tStartMs, tEndMs, thresholdDeg) -> Ms|null  // planning.py:27
nightWindow(dateISO, lat, lon, localNoonMs) -> {
  twilightLevel: 'astro'|'nautical'|'civil'|'fallback',
  sunsetMs, sunriseMs, duskMs, dawnMs
}                                                // planning.py:57 / web/astro.js:355
longestRun(flags: boolean[]) -> {start, end}|null  // half-open; nightcalc.py:243
windowEndISO(timesISO: string[], end, stepMin) -> string  // derive.js:88
indexRangeFor(timesISO, startISO, endISO, stepMin) -> {i0, i1}
scrubBounds(viewFullDay, nightStart, nightEnd, fullStart, fullEnd) -> {lo, hi}
scrubClamp(t, lo, hi) -> t
```

### core/visibility.js

```
effectiveMinAlt(bortle, explicitMinAlt) -> Deg     // server.py:330 / derive.js:405
sampleVisible(alt, minAlt, ceil, ceilTop) -> boolean
statusOf(sample, minAlt, index) -> 'below'|'blocked'|'warn'|'clear'
ceilFor(pano, azDeg) -> {ceil, ceilTop}|{ceil, ceilTop:null}   // [D]
```

### core/scoring.js

```
MOON_TYPE_FACTOR: Record<otype, number>
moonSensitivity(otype) -> number
moonMinDist(filterType, moonAgeDays) -> Deg
effectiveMoonGlow(illum, sepDeg, filterType, moonAgeDays) -> number
moonPenalty(glow, typeF, bortleF) -> number
bortleMoonFactor(bortle) -> number
popularityFactor(popularity) -> number
nightStats(obj, jd0, jd1, stepMin, minAlt, pano, lat, lon, ctx)
  -> {visN, obsPct, best, bestStartISO, score, scoreMoon}   // web/nightrank.js:42
```

### core/horizon.js

```
rebuildMask(strokes: Stroke[], wrap: boolean) -> Uint8Array
profileFromMask(pano, mask) -> {profile: Profile, profileTop: Profile}   // [D]
computeProfile(pano) -> Profile            // strokes-win invariant; mutates pano
clearMask(pano) -> Profile
altOf(pano, row) -> Deg
rowOfAlt(pano, alt) -> number
xOfAz(pano, azDeg) -> number
azOfX(pano, x) -> Deg
profileSegments(profile, W, H, ab, at, azOff, fov, skipAbove = 90.5) -> [x,y][][]
visibleSkyBands(pano, altBottom = null, zenith = 90) -> {vis, blocked}[]
skyBandPolygons(pano, W, H, ab, at, azOff, fov) -> [x,y][][]
bandTopFor(pano, azDeg) -> Deg|null
overhangRuns(pano, step = 2) -> {a0, a1}[]
assumedOpenRuns(pano, step = 2) -> {a0, a1}[]
assumedOpenHatchPolys(pano, W, H, ab, at) -> [x,y][][]
```

### core/catalog.js

```
magVisible(vmag, limit, maxLimit) -> boolean
searchBlob(obj) -> string
TYPE_LABELS: Record<otype, string>
TYPE_COLORS: Record<otype, string>
sizeArcmin(sizeAm) -> number
framePct(sizeAm, fovWArcmin) -> number
fovArcmin(focalMm, sensorMm) -> number    // ARCMINUTES (fixes web degrees split)
```

### core/format.js

```
fmtSize(s, sizeUnit = 'arcmin') -> string
fmtFov(am) -> string
fmtFovPair(fovWArcmin, fovHArcmin) -> string
formatRA(raHours) -> string
formatDec(decDeg) -> string
fmtTime(epochMs, tzOffsetMin, opts?) -> string
```

## 4. Plain-data types

```
type Deg = number; type Ms = number; type Min = number;
type Profile = number[720];                       // canonical bin space, D1
type Stroke = { m: 'b'|'e'; x: number; y: number; r: number };
type Pano = {
  id?: string; name?: string;
  azOffset: Deg; altBottom: Deg; altTop: Deg; fov: Deg;
  paintMode: 'obstacle'|'sky'; blockAbove: boolean;
  strokes?: Stroke[]; profile: Profile|null; profileTop: Profile
};
type Sample = { alt: Deg; az: Deg; ceil: Deg; ceilTop?: Deg|null };
type NightGrid = { t0: string; stepMin: Min; n: number; timesISO: string[] };
type Window = { start: number; end: number };     // half-open at BOTH ends
type Prefs = { bortle: number; minAlt: Deg|null; viewFullDay: boolean };
type Site = { lat: Deg; lon: Deg; elev?: number };
type ObjMeta = {
  id: string; raHours: number; decDeg: Deg; otype: string;
  vmag?: number|null; sizeAm?: string|number; popularity?: number;
  messier?: string; ngcic?: string; primaryName?: string
};
```

`Date` objects, DOM nodes, canvas contexts, `ImageData`, `localStorage`,
`IDBDatabase`, SQLite rows, `fetch` responses and file paths never cross this
boundary.

## 5. Boundary: what never enters core

| Excluded | Why | Where it stays |
|---|---|---|
| DOM/canvas/ResizeObserver/CSS, `$`/`$$`, event handlers | presentation | `static/js/*`, `web/app.js` |
| `localStorage` / IndexedDB / SQLite | storage adapter | `web/horizon.js`, `web/webstore.js`, `app/database.py` |
| `fetch`/XHR: catalog.json, the popularity source, Wikipedia, weather, version.json | network adapter | `web/app.js`, `static/js/images?/weather.js`, `app/images.py` |
| FITS parsing, ZIP backup IO, ingest, image decoding, FTPS | platform adapter | `app/fits.py`, `app/backup.py`, `app/ingest.py`, `app/imglib.py`, `web/ftps_deploy.py` |
| pywebview, folder picker, updater, process/shutdown | platform/Windows | `main.py`, `static/js/updater.js` |
| IANA zone resolution (`zoneinfo`, `Intl`) | environment-specific | adapters compute the offset; core does arithmetic on offset minutes |
| App state object `S`, DOM ids, `?v=` tokens, build scripts | shell/build | `static/js/state.js`, `web/app.js`, `scripts/*` |
| Python catalog seeds/DB schema/ObsNGC pipeline | data build authority | `app/catalog_data.py`, `app/database.py`, `scripts/build_adv_catalog.py` |

## 6. Canonical profile bin convention (decision D1)

- Python and desktop store **world-azimuth bins** (`i = az / 0.5`):
  `app/nightcalc.py:44-48`, `static/js/derive.js:175-183`,
  `static/js/pano.js:703-712`.
- Web stores **FOV-relative bins** (mask columns):
  `web/horizon.js:348-372`, looked up as `col = (az - azOff)/fov * 720`
  (`web/horizon.js:521-527`).
- The two coincide only at `fov=360, azOffset=0`, which is the only calibration
  covered by the cross-app test (`tests/test_horizon_parity.py:56-103`).

Recommendation: **world-azimuth is canonical** in `core/horizon.js`, because
Python (`ceil_lookup`), the SQLite payload path, the desktop editor and the
server API all assume it today; only the web editor's at-rest representation
changes. Migration, if approved: `profileFromMask` converts mask column ->
world bin (`az = azOffset + (col / BINS) * fov`), `ceilFor` looks up
`Math.floor(az / BIN_DEG)` directly, and `normalizePanos`
(`web/horizon.js:186-223`) migrates existing IndexedDB panos. A partial-FOV
parity test is added in Phase 0 **before** any code moves (it is expected to
fail against today's web convention, pinning the target semantics).

## 7. Surface size

The proposed `index.js` exports roughly the union of the current twin exports:
`web/astro.js` (35 exports), `web/horizon.js` pure helpers (24), `web/format.js`
(9), `web/nightrank.js` (2), `static/js/derive.js` domain half (~25),
`static/js/astro.js` (4), `static/js/pano.js::profileSegments` (1),
`static/js/util.js` formatting/timezone half (~12). Shell-only exports
(render/bind/history/persistence/editor view) stay out.
