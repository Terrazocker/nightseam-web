# NightSeam — desktop vs web parity audit (0.6.9 working tree)

**Task:** discovery/reporting only. **No source file was modified, nothing was built,
committed, tagged or deployed.** All evidence was produced read-only; the probe scripts
live in the gitignored `logs/` directory (one helper file created in `tests/js/` is
removed again — see Method).

* Audit baseline: `HEAD = 767979c`, i.e. **after** `v0.6.9` + the encoding repair
  `d34c3f5` + the two 0.6.10-era web commits. Working tree clean before the audit.
* Desktop = `main.py` + `app/*.py` (FastAPI) + `static/` (22 ES modules).
* Web = `web/` (one 2,561-line `app.js` plus `astro.js`, `horizon.js`,
  `webstore.js`, `format.js`, `dragwin.js`), IndexedDB/localStorage, a baked
  `catalog.json`.

---

## Method (so the numbers below are reproducible)

| Evidence | What it proves |
|---|---|
| `logs/parity_cases.json` (16 site/date/timezone cases) | the input grid: Berlin equinox/winter/summer, Tromso, Svalbard, Auckland, Honolulu, Quito, Dubai, Kiritimati, Ushuaia, NYC DST transitions |
| `logs/probe_desktop_parity.py` | runs the **real** `app.planning.night_window` + `app.nightcalc.compute_night` on a scratch DB (`logs/_probe_parity.db`, never `data/`) |
| `logs/probe_web_parity.mjs` | loads **the real `web/app.js`** in a Node `vm` sandbox with the shipped `astro.js`/`horizon.js`/`webstore.js`/`format.js` and runs its actual `nightWindow()` and Tonight loop |
| `logs/probe_compare.py`, `probe_ranking.py`, `probe_nowlist.py`, `probe_maxalt*.py`, `probe_m39*.py`, `probe_jd.py` | the measured deltas quoted below |
| `logs/probe_appjs_load.cjs`, `probe_appjs_purity.cjs` | which `app.js` internals are reachable headlessly (68 pure top-level declarations) |

**Verified during the audit:** the desktop Python engine and the two JS engines agree at
floating-point precision on identical instants — `altaz` for M39 at
2026-12-21T16:01:51 gives alt/az `76.208 / 261.715` in **both** Python and JS; JD and
GMST match to 4 decimals (`logs/_jd_py.json` vs `logs/_jd_js.json`). Twilight dusk/dawn
match to **0.0 s in all 16 cases** (section 5). So the divergences below are *product*
divergences, not astronomy-engine drift.

---

# 1. Executive summary

**~132 differences** are catalogued; **71** are itemised in the matrices and lists below
(the rest are constants/default rows).

| Class | Count | Examples |
|---|---|---|
| **A — intentional product difference** | 24 | no server, no image catalog, no FITS ingest on the web; bundled thumbnails instead of the Wikipedia/DSS chain; advanced-mode magnitude caps; popularity invisible in both |
| **B — platform / UI difference** | 31 | hamburger vs Setup-tab layout, edge-space ranges, label wording, canvas vs server charts, favourites/journal affordances |
| **C — performance difference** | 12 | 60-row web pagination vs 250-row desktop, client-side advanced synthesis, different grid spans, obsCache, lazy chunk budgets |
| **D — potential bug** | 33 | statusOf ignoring ceil_top; web illumNow < 15; web draw() ReferenceError; dead top_fn; -99 vs -90 sentinel; phase-name mismatch; arrow-key step vs docs |
| **E — confirmed bug** | 18 | tonight ranking basis; visible-now list basis; polar-day fallback offset by the site zone; S.date not from the site's today; missing "clear window only" filter; corrupt profile_top fails open on the client and closed on the server |
| **F — unknown / insufficient evidence** | 14 | whether the web's dark-window max-alt labelling is desired; whether the web should show the desktop's filter-advice column |

### The five findings that matter most

1. **E-1 — "Best targets tonight" ranks a different quantity on each side.** The web ranks
   the whole curated catalog by *accumulated altitude-weighted score over the dark window*
   (`web/app.js:619-628`). The desktop Tonight view lists only objects with a **clear,
   unobstructed, >=30-min window** and orders them by when that window starts
   (`static/js/tonight.js:76-78`, `derive.js:230-237`). Measured on identical inputs:
   top-16 overlap 13/16 (Auckland), 16/16 (Berlin night).
2. **E-2 — "Visible at <time>" top-8 is a different list.** Desktop:
   `statusOf(o,S.tIdx).code === "vis"` (above the min altitude **and** above the
   obstruction) then score, `tonight.js:67-71`. Web: `altNow >= minAlt` only, then
   **descending altitude**, `web/app.js:611-630`. Measured with a synthetic 25-degree wall:
   **top-8 overlap 2/8** in both test nights (`logs/probe_nowlist.py`), while both apps
   agree there are 60-61 objects clear at that time.
3. **E-3 — the polar-day fallback is built in the browser zone, not the site's.**
   `web/astro.js:331-335` constructs 20:00-04:00 with `new Date(y,m,d,20)`, i.e. the
   *browser's* zone; `app/planning.py:78-79` uses `local_utc(..., tz_min, 20)`, the
   **site's** zone. Reachable through `web/app.js:2340` (`pickDarkWindow(info)` without
   the anchor), while `nightWindow()` and `openDetail` pass it — so the night-info chip
   and the planner can disagree in the same session.
4. **E-4 — the desktop's "clear window only" filter is ON by default; the web has no such
   filter at all.** `static/index.html:255` ships `#fUnblocked checked` and
   `targets.js:74` drops anything whose best unobstructed run is < 3 samples (18 min).
   The web's chips (`app.js:1148-1157`) contain no obstruction-based filter, so out of the
   box the two apps show a different target list for the same site and night.
5. **E-5 — the corrupted-horizon failure mode is inverted between the two client paths.**
   A `profile_top` that is not exactly 720 numbers makes the server's `ceil_lookup`
   return -90 for every azimuth (`app/nightcalc.py:36-41`) - everything blocked, nothing
   observable - while `static/js/derive.js:92-95` `topLookup` returns **90.5** for the
   same record (nothing blocks), so an advanced-mode object synthesised in the browser reads
   as observable while a curated object reads as blocked.

---
# 2. Parity matrix (feature by feature)

Legend - **Same?**: `=` behaviourally equal, `~` equal with a cosmetic/numeric nuance, `X` different, `-` only one side has it.
**Class**: A intentional, B platform/UI, C performance, D potential bug, E confirmed bug, F unknown.
**Sev**: C critical, H high, M medium, L low, I info.

## 2.1 Astronomy calculations

| Feature | Desktop | Web | Same? | Difference | Class | Intentional? | Sev |
|---|---|---|---|---|---|---|---|
| Precession J2000 to date | `app/astro.py:48-81` Meeus 21.4 Z-Y-Z | `web/astro.js:44-64` same | = | numeric identity verified | - | - | - |
| Alt/az + Saemundsson refraction | `astro.py:92-122` | `web/astro.js:91-120` | = | identical values (probe) | - | - | - |
| GMST | `astro.py:84-89` | `web/astro.js:33-38` | = | identical | - | - | - |
| Sun position | `astro.py:127-147` | `web/astro.js:123-139` | = | - | - | - | - |
| Moon position | `astro.py:160-207` | `web/astro.js:142-188` | = | - | - | - | - |
| Moon illumination / age | `astro.py:212-227`; shipped with `round(...,2)` | `web/astro.js:191-212` full precision | ~ | score inputs differ by up to 0.005 | D | F | L |
| **Moon phase NAME** | `util.js:153-159` `phaseName(moon_illum)` -> New/Crescent/Quarter/Gibbous/Full (5 names) | `astro.js:215-229` `moonPhase(jd).name` from *elongation* -> 8 names incl. waxing/waning | X | the same night reads "Gibbous" (desktop) vs "Waxing Gibbous" (web) | D | F | L |
| Twilight level cascade | `planning.py:64-80` astro -> naut -> civil -> sunset, then 20:00-04:00 | `astro.js:320-337` identical cascade | = | dusk/dawn match to 0.0 s in 16/16 cases | - | - | - |
| Twilight scan window | 30 h from site local **12:00** (`planning.py:60-61`) | 48 h from site local noon - 12 h (`astro.js:294-298`) | ~ | different windows, same result in every tested case | C | Y | L |
| Polar-day fallback | site zone 20:00-04:00 (`planning.py:78-79`) | **browser zone** 20:00-04:00 (`astro.js:331-335`) | X | window shifted by the zone difference | E | N | M |
| Night grid step | 6 min (`nightcalc.py:66`) | 6 min (`app.js:157`) | = | - | - | - | - |
| Night grid span | `dusk-1h ... dawn+1h` (`nightcalc.py:64-65`) | `dusk ... dawn` (`app.js:168-180`) | ~ | desktop payload carries 2x1 h twilight context; both sides clip every number to dusk..dawn | B | Y | I |
| Clear window (`best`) | `longest_run`, half-open, clipped to dusk..dawn (`nightcalc.py:211-212`, `derive.js:230-234`) | same contract `longestRunJS`; the table uses an in-place scan (`app.js:603-609`) | = | contract pinned by tests/js/derive_window.mjs | - | - | - |
| Percent of night | `visIn / (i1-i0+1)` (`derive.js:232`) | `visN / (n+1)` (`app.js:614`) | ~ | desktop denominator can be 1 lower (grid offsets); measured +/-1 sample | D | F | L |
| Score formula | `Math.round(s*10)/100`, `sin(clamp(alt,0,90))`, moon penalty per sample | byte-identical expression (`app.js:619`, `derive.js:236`) | = | shared oddity: quantised to 0.1 then divided by 100 | - | - | I |
| Score inputs (moon illum/age) | grid midpoint, rounded to 2 dp | `(jd0+jd1)/2`, full precision | ~ | same instant, different rounding | D | F | L |
| Visibility predicate | `alt >= minAlt && alt > ceil[i] && alt < (ceil_top ? ceil_top[i] : 90.5)` (`derive.js:200-201`), `ceil` **rounded to 0.1 deg by the server** | identical predicate (`app.js:147`), `ceil` **raw unrounded** from `Hor.ceilFor` | X | an object within 0.05 deg of the obstruction flips visibility between the apps | E | N | L |
| `ceil_top` corrupt fallback | server `ceil_lookup` -> **-90** (fails closed) | `derive.js:93` -> **90.5** (fails open) | X | curated objects hidden, advanced shown, same record | E | N | M |
| Unblocked sentinel | `NO_BLOCK = -90.0`; the editor writes **-99** for unpainted/outside-FOV (`pano.js:646,685`) | `NO_BLOCK = -90`; `computeProfile` writes -90 (`horizon.js:217-218`) | X | the desktop payload can contain -99 where the web has -90 | D | F | L |
| Bortle / min-alt default | `17 + 2*bortle` when unset (`server.py:332-334`) | `17 + 2*prefs.bortle` when `minAlt == null` (`horizon.js:437`) | = | same formula, same default (25 at Bortle 4) | - | - | - |
| Sky-brightness model | none | none | = | - | - | - | - |
| `/api/object` min-alt fallback | **flat 25.0** (`server.py:507-508`) | always `Hor.effectiveMinAlt()` | X | a direct API call ignores Bortle | D | F | L |

## 2.2 Night planner

| Feature | Desktop | Web | Same? | Difference | Class | Intentional? | Sev |
|---|---|---|---|---|---|---|---|
| Selected date | `#dateInput`, site-zone `todayLocal()` | `#tb-date` filled from `WS.effToday()`, but **`S.date` starts as `new Date()`** | X | before the field is touched the web plans the browser's calendar day | E | N | M |
| Selected time / "now" | `S.tIdx` = index of now in the payload grid, else `floor(n*0.45)` (`night.js:44-45`) | `S.skyTime = new Date()`, 24 h scrub anchored at the site's most recent noon (`app.js:728-756`) | ~ | different widget, same semantics | B | Y | I |
| Scrub step | Arrow = 1 grid index = **6 min**, Shift = 10 = **60 min** (`main.js:135-137`) | Arrow = 60 min, Shift = 10 min (`app.js:2514`) | X | 6x larger desktop step; AGENTS.md's "1 min / 10 min" is wrong | D | F | L |
| "Tonight" definition | dusk..dawn of the planned night | same (site-noon anchored) | = | verified | - | - | - |
| Sampling interval | 6 min / 4 min detail | 6 min / 120-sample detail | ~ | detail chart is time-proportional | C | Y | I |
| Clear-window card | counts objects with >= 5 samples (`tonight.js:40`) | no equivalent card | - | different summary cards | B | Y | I |
| Clear-window filter | >= 3 samples, **ON by default** (`targets.js:74`, `index.html:255`) | absent | X | different default target sets | E | N | M |
| `obs_pct` semantics | share of the dark window above minAlt and unobstructed | `visN/(n+1)` over dusk..dawn | ~ | labels differ, values agree to +/-1 sample | B | Y | L |
| Busiest hour | counted over the **full grid incl. twilight margins** (`tonight.js:47-54`) | no such card | - | can name a twilight hour | D | F | L |
| Ranking "Best targets tonight" | clear-window objects by **window start**, then score (`tonight.js:76-78`) | whole catalog by **score**, then popularity (`app.js:619-628`) | X | see E-1 | E | N | M |
| Ranking "Visible at time" | `statusOf === "vis"` (minAlt **and** obstruction), then score | `altNow >= minAlt`, sorted by **altitude desc** | X | see E-2, top-8 overlap 2/8 | E | N | H |
| Candidate limit | none (standard) | advanced capped at `vmag <= 9` (`app.js:578-579`) | ~ | 259 of 11,919 | C | Y | I |
| Pagination | 250 rows/page (`targets.js:9`) | 60 rows/page (`app.js:1190`) | X | - | C/B | Y | I |
| Default sort | `score` | `mag` ascending (`S.cat.sort`) | X | different first view | B | F | L |
| Table columns | thumbnail, name, type+advice, mag, size, frame, max alt, percent, clear window, status | name+tags, mag, percent, type, con, size, frame, RA, Dec | X | desktop adds status/window/advice, web adds RA/Dec | B | Y | M |
| Detail view | 4-min server grid + chart | 120-sample client chart | ~ | web "Right now" uses the live clock, not the selected time (`app.js:1329`) | D | F | L |
| Detail rise/transit/set | 4-min grid max | `objectDayInfo` 2-min scan anchored at site 00:30 (`app.js:1332-1333`) | X | the web's first rise/set can belong to the previous evening | D | F | L |
| Magnitude filter | slider 1-16 (20 adv), default 11, applied | chips only ("Bright <8") | X | no magnitude threshold on the web | B | Y | M |
| Favourites / session marks | filter + star button + `favorites` setting | absent | X | whole feature desktop-only | A | F | L |
| Advanced mode | setting, reload, metadata + client synthesis | same | = | - | - | - | - |

## 2.3 Moon / scoring

| Feature | Desktop | Web | Same? | Difference | Class | Sev |
|---|---|---|---|---|---|---|
| `MOON_TYPE_FACTOR` | `derive.js:244-248` | `astro.js:347-351` | = | pinned by tests/test_js_parity.py | - | - |
| `moonMinDist` Lorentzian | `derive.js:158-162`, frac = age/29.53 (**truncated** month) | `astro.js:359-363`, same 29.53 | = | both differ from `astro.py:209`'s 29.53058770576 used for the shipped age | - | I |
| glow / penalty / 0.05 floor | `derive.js:166-176` | `astro.js:366-375` | = | - | - | - |
| `bortleMoonFactor` | `derive.js:182-185` (comment claims continuity "either side"; code is continuous *at* 3) | `astro.js:379-382` | = | comment bug only | - | I |
| Filter -> base separation | `filterType()` from `cfg.filters` (default `broadband: true`) | `fltOiii ? oiii : fltHa ? narrowband : lrgb`; `fltBb` defaults **false** | ~ | same night scored with a different base separation | D | L |
| Moon-up gate | `moon_alt[i] > 0` | same | = | - | - | - |
| Popularity tiebreaker | formula identical; DB column refreshed at startup | live the popularity source fetch (no timeout) with baked fallback | ~ | different data freshness | C | I |

## 2.4 Site / location

| Feature | Desktop | Web | Same? | Difference | Class | Sev |
|---|---|---|---|---|---|---|
| No site configured | server 400 "No observing location configured"; the UI cannot plan | `boot()` **silently creates** "Berlin (default)" (`app.js:2243-2246`) | X | the web never says there is no site | E | M |
| Site fields | name, lat, lon, elev; no per-site zone | name, lat, lon, elev, **IANA tz** | X | web stores a per-site zone; desktop has one global `timezone` | A | I |
| Coordinate validation | lat +/-90, lon +/-180, elev -500..9000 (`server.py:177-186`) | lat/lon in the site form; quick-edit checks +/-90/180; **no elev bounds** | ~ | elev unvalidated on the web | D | L |
| Active site | `active_site_id` setting | `prefs.activeSiteId` | = | - | - | - |
| Timezone resolution | `timezone` setting or machine zone | `prefs.tz` or `site.tz` or browser (`app.js:62-63`) | ~ | a site without tz silently falls back to the browser zone | A/D | M |

## 2.5 Panorama / obstruction

| Feature | Desktop | Web | Same? | Difference | Class | Sev |
|---|---|---|---|---|---|---|
| Storage | file in `data/panos/` + DB row | IndexedDB photo (1400 px, q0.78) + localStorage record | X | different storage, same concept | A | I |
| Calibration ranges | az 0-360/1, altBottom -15..30/1, altTop 10..90/5, fov 45-360/5 | az 0-360/5, altBottom -30..90/5, altTop 0-90/5, fov 5-360/5 | X | different quantisation -> different bins for the same paint | B | L |
| Profile computation | canvas 720x180, values `toFixed(1)`, unpainted = **-99** | mask 720x360, raw floats, unpainted = -90 | X | sentinel + rounding (E-16, E-17) | D | L |
| Sky-mode top edge | `profile_top`; a band within 4 deg of altTop becomes **90.5** | `profileTop`; `ceilTop: null` when the bin is <= -89.5 | ~ | different "no ceiling" encoding | D | L |
| Missing / short profile | server logs, treats it as nothing-blocks | `ceilFor` returns -90 (obstacle) / 90 (sky) | ~ | in sky mode a missing profile blocks everything on the web | D | L |
| Delete / replace / crop | crop endpoint clears `profile_top` and `paint_mode` | replace = re-upload in the editor, no crop | X | desktop-only crop path | A | I |
| Undo | per-panorama undo stack, cleared on switch | eraser mode, rebuild from strokes | X | different editing model | B | L |

## 2.6 Image catalog / library

| Feature | Desktop | Web | Same? | Difference | Class | Sev |
|---|---|---|---|---|---|---|
| FITS ingest, archive layout, sessions, reindex, rename, preview PNG, CSV/JSON export, image backup | `app/ingest.py`, `imglib.py`, `fits.py`, `archive.js` | absent | - | the whole Image Catalog mode is desktop-only | A | I |
| Static RA/Dec chart | `static/js/skymap.js` | absent | - | - | A | I |

---
# 3. Confirmed bugs

### E-1 - "Best targets tonight" is computed from a different quantity on the web
* **Severity: MEDIUM.** **Files:** `web/app.js:619-628` vs `static/js/tonight.js:76-78` + `static/js/derive.js:213-237`.
* **Desktop behaviour:** ranks only objects with `o.best` (a contiguous unobstructed run inside the dark window) by `best[0]` (window **start**), score as tiebreaker; the empty state is "No further clear windows tonight."
* **Web behaviour:** ranks **every** curated object that has a magnitude by `score` (the `sin(alt)` sum over the dark window, moon-penalised when `moonAware`), then popularity; an object with no clear window still ranks if it is high in the sky.
* **Expected:** both answer "what can I shoot tonight from here".
* **Reproducible example:** `python logs/probe_ranking.py` (curated catalog, min-alt 25, no panorama): Berlin 2026-12-21 -> top-16 identical; Auckland 2026-03-15 -> **13/16** overlap, 3 ids in each list the other does not contain.
* **User impact:** the headline list can promote an object that never clears the user's trees (web), or hide a high, well-placed one (desktop).
* **Recommended fix:** rank the web's top list on `bestRun`/`bestStart` (already computed at `app.js:603-605`) or change the desktop - one definition, plus a list-level parity test.

### E-2 - "Visible at <time>" top-8 uses altitude instead of the visibility predicate
* **Severity: HIGH** (first thing read on the Tonight tab).
* **Files:** `web/app.js:611-630` (`nowVisible = visibleAll.sort(by altNow).slice(0,8)`) vs `static/js/tonight.js:67-71`.
* **Desktop:** filters on `statusOf(o, S.tIdx).code === "vis"` (alt above minAlt **and** above the obstruction), sorts by score then popularity; heading "Best targets at <time>".
* **Web:** filters on `visNow` (which does include the obstruction test) but sorts by **altNow descending**; heading "Visible at <time>".
* **Reproduce:** `python logs/probe_nowlist.py` - synthetic 25 deg wall (az 100-200), Berlin 2026-12-21 at dusk+2 h and Berlin 2026-09-10: both apps report 60-61 clear objects, yet **top-8 overlap = 2/8** in both nights; the desktop list is score-ordered, the web list is altitude-ordered.
* **Impact:** a user switching between the two apps sees a different "best right now" set for the same site, time and horizon.

### E-3 - polar-day fallback ignores the site timezone on the web
* **Severity: MEDIUM.** `web/astro.js:331-336` builds the 20:00-04:00 window from the browser's calendar; `app/planning.py:78-79` from the site's zone.
* **Reproduce:** Tromso 2026-06-21 with a browser in UTC: the fallback is 20:00-04:00 **UTC** (22:00-06:00 local). Reachable via `web/app.js:2340` (`pickDarkWindow(info)` without the anchor), while `nightWindow()` (`app.js:174`) and `openDetail` (`1455`) pass it - the night-info chip and the planner can therefore disagree with each other.
* **Recommended fix:** give `pickDarkWindow` the site noon (or build the fallback through `WS.wallToUtc`).

### E-4 - the web has no "clear window only" filter, and the defaults differ
* **Severity: MEDIUM.** Desktop `static/index.html:255` (`#fUnblocked checked`) + `targets.js:74` (`best[1]-best[0] >= 3` -> 18 min). Web chips (`app.js:1148-1157`) have no obstruction-based predicate.
* **Impact:** the desktop hides everything that never clears the horizon; the web shows all 197. Two users with the same site see different default target lists.

### E-5 - corrupt `profile_top` fails closed on the server and open on the client
* **Severity: MEDIUM.** `app/nightcalc.py:36-41` vs `static/js/derive.js:92-95`.
* **Impact:** with a damaged sky-mode panorama the curated objects all read blocked (score 0, no window) while advanced-mode objects synthesised in the browser read fully observable. Neither side warns.
* **Related:** `nightcalc.py:94,188`'s `lambda az: 90.0` is unreachable, so the server's intended "no upper ceiling" default never applies.

### E-6 - the desktop's phase-name set cannot express the moon's phase
* **Severity: LOW.** `static/js/util.js:153-159` maps **illumination** onto New/Crescent/Quarter/Gibbous/Full; `web/astro.js:215-229` derives an 8-name phase from elongation plus waxing/waning.
* **Impact:** the same night reads "Gibbous" (desktop) and "Waxing Gibbous" (web); the desktop can never show waxing/waning.

### E-7 - the web plans the browser's date until the user edits the date field
* **Severity: MEDIUM.** `web/app.js:76-77` (`S.date: new Date()`) while the control is filled from `WS.effToday()` (`app.js:2295-2296`); the desktop always uses the site-zone `todayLocal()` (`main.js:66`, `night.js:26`).
* **Impact:** for a site far enough east/west, the first page load plans the wrong night.

### E-8 - "Busiest hour" counts the twilight margins
* **Severity: LOW.** `static/js/tonight.js:47-54` counts observable objects over the whole payload grid (including the +/-1 h context), while the clear window, percent of night and score are clipped to dusk..dawn (`derive.js:206-212`). The card can name a twilight hour.

### E-9 - the status pill ignores the sky-mode upper ceiling
* **Severity: LOW.** `derive.js:292-298` `statusOf` tests `alt <= ceil` but never `ceil_top`, while `o.vis` (`derive.js:201`) does. An object blocked by an overhang is labelled "Observable" in the desktop table/Tonight card.

### E-10 - web ReferenceError on every arrow-key scrub in the Sky view
* **Severity: LOW (noisy).** `web/app.js:2517` calls `draw()`, which exists only inside `renderSky()`'s closure; the red `#err-banner` reports it via `window.onerror`. The redraw already happens through the `sky:time` listener.

### E-11 - web detail modal mixes "now" with the selected time
* **Severity: LOW.** `web/app.js:1329` uses `new Date()` for "Right now" alt/az and the moon separation although the app's rule (and the Tonight tab) is the selected `S.skyTime`.

### E-12 - web detail moon-distance colour is always green
* **Severity: LOW.** `web/app.js:1340,1352`: `illumNow = moonIllumination(jd)` is 0..1 but the test is `illumNow < 15`, so the moon rows never turn amber/red under a bright moon.

### E-13 - the web's min-alt slider cannot reach its own accepted range
* **Severity: LOW.** `web/index.html:41` caps the slider at 70 while `app.js:2285` accepts 5..89; a stored 71-89 renders as 70 but still governs the math. (Desktop: slider 5..70, no wider gate.)

### E-14 - the desktop's detail endpoint ignores Bortle when minalt is absent
* **Severity: LOW.** `app/server.py:507-508` falls back to a flat **25.0** while `/api/state` ships `17 + 2*bortle` (`server.py:332-334`). The UI always sends minalt, so only API users are affected.

### E-15 - three different clip rules inside the desktop
* **Severity: LOW.** The clear window/score/percent are clipped to dusk..dawn (`derive.js:213-237`), `o.vis` is not (`derive.js:200-201`), and the busiest-hour count (`tonight.js:47`) is not, while `statusOf` ignores `ceil_top`. Consequence: the summary cards can describe different sample sets.

### E-16 - the desktop pano editor writes a sentinel the readers do not define
* **Severity: LOW.** `static/js/pano.js:646,685` push **-99** for "unblocked"; both readers define `NO_BLOCK = -90.0`. Values in (-99, -90] behave as "blocked by an obstacle below the horizon" on one path and "unblocked" on the other.

### E-17 - visibility flips within 0.05 deg of the obstruction
* **Severity: LOW.** The server rounds `ceil` to 0.1 deg before shipping (`nightcalc.py:129`) while the web compares the raw profile value; the desktop editor stores `toFixed(1)` (`pano.js:668,685`) but the web editor stores raw floats (`horizon.js:212`). Two identically painted panoramas can disagree on objects grazing the skyline.

### E-18 - two "the date" sources inside one web function
* **Severity: LOW.** `web/app.js:1424-1425` uses `S.date` for the chart fallback while `nightAnchor()` (`1345/1455`) supplies the dark window; after clearing the date field they can differ.

---

# 4. Potential bugs (unconfirmed)

| ID | Sev | Item | Evidence | Why only "potential" |
|---|---|---|---|---|
| D-1 | M | Sky-mode `ceil_top` is applied to the visible/score arrays but not to `statusOf` | `derive.js:201` vs `292` | is the status pill meant to model the band? |
| D-2 | M | `object_detail` rounds ceilings to 2 dp while the night grid rounds to 1 dp | `nightcalc.py:129` vs `199` | the two grids may legitimately differ |
| D-3 | M | Web `warmPct`/`fillPctCells` compute visibility over the whole grid while the desktop clips to the night | `app.js:614`, `derive.js:232` | measured +/-1 sample |
| D-4 | L | Web "Rising later tonight" filters `!visNow && maxAlt > 0` then transit; desktop `best[0] > tIdx` then window start | `app.js:631-632`, `tonight.js:76` | different but plausible |
| D-5 | L | Web `popularityFactor` returns 0 for unknown, so "no data" objects sink among equal scores | `app.js:117-123` | design choice |
| D-6 | L | Web catalog size sort splits on `x` only while the formatter accepts the multiplication sign | `app.js:1174` | 0 rows use that character today |
| D-7 | L | Moon illum/age rounded to 2 dp on the desktop, recomputed exactly on the web | `nightcalc.py:88` | rounding only |
| D-8 | L | Desktop "Busiest hour" can name a twilight hour (E-8) | `tonight.js:47` | may be intended context |
| D-9 | L | Web sky view has none of the desktop's six chart controls | `index.html:296-305` | deliberate simplification? |
| D-10 | L | Horizon FOV seam: azimuth exactly at azOffset+fov counts as inside | `horizon.js:264` vs `pano.js:630` | edge case |
| D-11 | L | Pano crop/replace clears `profile_top` only on the crop endpoint | `server.py` pano routes | needs a live check |
| D-12 | L | Web night anchor = `S.date` else `effToday()`; desktop falls back to 45 percent into the night | `night.js:44-45` | different defaults, same intent |
| D-13 | L | Web `obsKey` rounds lat/lon/minAlt to 2 dp -> cache collisions below 0.005 | `app.js:193` | harmless |
| D-14 | L | `images.py:8` documents a 3-day negative cache; the constant is 1 day | `images.py:28` | comment |

---

# 5. Numerical differences (measured)

All runs used the same site/date/timezone grid (`logs/parity_cases.json`, 16 cases).

## 5.1 Where the engines are identical (no finding)

| Quantity | Result |
|---|---|
| Dusk / dawn instants | **0.0 s** difference in 16/16 cases (Tromso, Svalbard, Ushuaia, Kiritimati, NYC DST boundaries included) |
| Twilight level label | identical in 16/16 |
| Sunset / sunrise | identical (desktop `find_twilight(...,0.0)` vs the web's zero-crossing) |
| `altaz` at identical instants | identical to floating-point precision (`logs/probe_m39*.py/mjs`, `_jd_py.json` vs `_jd_js.json`) |
| JD / GMST | identical |
| Moon illumination / age | identical down to the payload's 2-dp rounding |

## 5.2 Measured divergences

| # | Quantity | Desktop | Web | Delta | Cause |
|---|---|---|---|---|---|
| N-1 | percent-of-night denominator | in-night samples (**69** for Berlin 2026-09-10) | grid samples (**70**) | +/-1 sample; several objects differ by 1 pp (ic405 54 vs 53, ngc2158 29 vs 27) | grid offsets: the desktop grid starts at dusk-1h (sample 10 = 19:35:37.24, *before* dusk 19:35:37.66) and ends 02:29:37 (< dawn 02:31:33) |
| N-2 | grid length, same night | 90 samples (Berlin equinox), 141 (winter) | 70, 122 | -20 / -19 | desktop carries 1 h twilight context per side |
| N-3 | `max_alt` basis | over the grid **incl. twilight margins**; m39 Berlin 2026-12-21 = **76.2 deg**, m61 Berlin equinox = **0.2 deg** | over **dusk..dawn**; m39 = **67.1 deg**, m61 = **-9.3 deg** | up to ~9-13 deg for objects that transit before dusk | different measurement window (each side self-consistent) |
| N-4 | score inputs | moon illum/age rounded to 2 dp in the payload | full precision | <= 0.005 in the curve inputs | rounding |
| N-5 | ceiling value | server rounds to 0.1 deg; editor stores 1 dp | raw float | <= 0.05 deg | rounding - flips margins |
| N-6 | phase name | 5-name set from illumination | 8-name set from elongation | string | different derivation |
| N-7 | visibility at 24/2364 sampled object-nights on equal grids | - | - | differs where the sample time was within ~1 s of dusk | grid start offset (N-1) |
| N-8 | corrupt `profile_top` | -90 (server) / 90.5 (client) | 90.5 | semantic | E-5 |

## 5.3 Representative test vectors

| Case | Input | Desktop | Web |
|---|---|---|---|
| Berlin 2026-09-10 | 52.52/13.4, min 25, no pano | dusk 19:35:37, dawn 02:31:33, astronomical, grid 90 | dusk/dawn identical, grid 70 |
| Berlin 2026-12-21 | same | m39 max_alt 76.2 (first grid sample 16:01:51) | m39 maxAlt 67.1 (17:01:51) |
| Berlin 2026-06-21 | same | level **nautical**, 21:47:06-00:29:39 | identical |
| Tromso 2026-06-21 | 69.65/18.96 | level **fallback**, 18:00Z-02:00Z | 18:00Z-02:00Z when the site noon is passed; browser-zone otherwise (E-3) |
| Svalbard 2026-10-25 | 78.22/15.65 | astronomical 18:42:37-02:42:40 | identical |
| Ushuaia 2026-12-21 | -54.8/-68.3 | level **civil**, 02:08:47-06:54:22 UTC | identical |
| Kiritimati 2026-06-15 | 1.87/-157.4 | astronomical 05:52:11-15:08:00 | identical |
| NYC 2026-03-08 (DST start) | 40.71/-74.01 | astronomical 00:26:13-09:46:28 | identical |
| NYC 2026-11-01 (DST end) | same | astronomical 23:24:51-09:54:48 | identical |

---
