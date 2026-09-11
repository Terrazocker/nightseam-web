# 02 - Duplication matrix (per concept)

Baseline: frozen tag `v0.6.14` = `383007c`; tree `v0.6.14-2-g834b6bb`.

Verdicts: **share** = move to `core/` as the single implementation and have both
shells import it; **delete-redundant** = a duplicate that then disappears (or is
already dead); **keep-separate** = intentional platform/UI difference;
**leave** = out of scope for this extraction.

"Python-authority?" means: is the Python implementation the current behavioural
reference/payload producer? "Desktop-JS" / "Web-JS": does a JS implementation
exist that would be replaced by core?

| # | Concept | Python-authority? | Desktop-JS | Web-JS | Verdict | Key evidence |
|---|---|---|---|---|---|---|
| 1 | Julian day / GMST | yes, goldens | yes | yes | share | `app/astro.py:25,84`; `static/js/astro.js:10,22`; `web/astro.js:45,63`; `tests/test_astro.py:31-41` |
| 2 | Precession (Meeus 21.4) | yes, goldens | yes (fwd only) | yes (fwd+inv) | share; Python oracle in transition | `app/astro.py:39-82`; `static/js/astro.js:35`; `web/astro.js:74,98`; `tests/test_precession_reference.py:92-111` |
| 3 | Alt/az + refraction | yes, goldens | yes (batch, always refracted) | yes (`refract` flag) | share | `app/astro.py:92-124`; `static/js/astro.js:66-89`; `web/astro.js:121-159` |
| 4 | Sun position / altaz | yes, payload producer | consumes payload | yes | share (web+tests); desktop keeps payload read until authority flip | `app/astro.py:127-157`; `static/js/skyview.js:542-551`; `web/astro.js:166-295` |
| 5 | Moon position / illum / age | yes, payload producer | consumes payload | yes | share; delete web twin | `app/astro.py:160-241`; `static/js/derive.js:288-318`; `web/astro.js:185-303` |
| 6 | Twilight / night window / site-noon | yes, goldens | index mapping only | yes | share; delete web twin | `app/planning.py:14-86`; `static/js/derive.js:115-165`; `web/astro.js:318-419` |
| 7 | Clear-window `longest_run` (half-open) | yes | yes | inline x3 | share; delete all 3 web copies + desktop mirror | `app/nightcalc.py:243-271`; `static/js/derive.js:70-99`; `web/nightrank.js:42-77`; `tests/test_js_parity.py:336-361` |
| 8 | Grid construction (6-min payload, 24 h, detail) | yes, payload producer | consumer (clipping) | own spans | share grid builders; payload stays Python adapter | `app/nightcalc.py:70-77,143-148,184-191`; `web/app.js:159,185-219,1544-1563` |
| 9 | Visibility/status predicate | detail only | yes (desktop authority) | yes | share | `app/nightcalc.py:208-209`; `static/js/derive.js:282-334,387-397`; `web/nightrank.js:21-23` |
| 10 | Min-alt rule `17+2*bortle` / explicit | yes | yes (live re-derive) | yes | share; delete JS twins | `app/server.py:330-339,355-356`; `static/js/derive.js:405-409`; `web/horizon.js:999` |
| 11 | Moon/Bortle scoring curves | none by design | yes | yes | share (single JS source; no Python model) | `app/nightcalc.py:127-129`; `static/js/derive.js:253-280,339-346`; `web/astro.js:422-458`; `tests/test_js_parity.py:473-584` |
| 12 | Ranking + popularity tiebreak | data only | yes | yes (+ live fetch) | share factor; data path keep-separate | `static/js/derive.js:483-486`; `web/app.js:100-134`; AUDIT-DESKTOP-WEB-PARITY.md:331 |
| 13 | Advanced track synthesis | metadata-only contract | yes | on-demand | share synthesizer; payload contract stays adapter | `app/nightcalc.py:105-114`; `static/js/derive.js:196-227`; `web/nightrank.js:42` |
| 14 | Profile bins + sentinels (720, -90, 90, 90.5) | yes | yes | yes | share constants/lookup; **convention decision required** | `app/nightcalc.py:19-21`; `static/js/pano.js:9`; `web/horizon.js:15-18` |
| 15 | **Bin coordinate convention** | world-azimuth | world-azimuth | FOV-relative | **share ONE canonical convention (recommend world-azimuth); migrate web** | `app/nightcalc.py:44-48`; `static/js/pano.js:703-712`; `web/horizon.js:348-372,521-527`; only identity calibration pinned `tests/test_horizon_parity.py:56-103` |
| 16 | Mask math (`rebuildMask`, `profileFromMask`, seam) | none (validates only) | canvas impl | Uint8 impl | share pure mask data math; rendering stays shell | `static/js/pano.js:406-432,666-754`; `web/horizon.js:295-313,348-372` |
| 17 | Edge geometry `profileSegments` | none | yes | yes | **share (proven precedent)**; delete both copies | `static/js/pano.js:553-575`; `web/horizon.js:380-398`; `tests/js/sky_band.mjs:153-164` |
| 18 | Sky-band helpers (`visibleSkyBands`, `skyBandPolygons`, `overhangRuns`, `assumedOpenRuns`, `assumedOpenHatchPolys`, `bandTopFor`) | none | ad hoc chart | yes | share; rewrite desktop chart and web app to core | `web/horizon.js:406-461,542-634`; `static/js/skyview.js:313-399`; `static/js/derive.js:444-467` |
| 19 | `ceilFor` / blockAbove gating | yes (server) | yes | yes | share predicate; server keeps DB/HTTP plumbing | `app/server.py:489-493,518-522`; `static/js/derive.js:444-451`; `web/horizon.js:507-537` |
| 20 | Polar chart pure geometry (`r=R*(1-alt/90)`, az mapping) | n/a | yes | yes | share the pure mapping; stripe/clip loops stay shell | `static/js/skyview.js:143-147`; `web/app.js:926-930` |
| 21 | Scrub policy (`scrubBounds`/`scrubClamp`, index ranges, viewFullDay) | n/a (payload times) | yes | yes | share; delete twins | `static/js/derive.js:115-165`; `web/astro.js:24-36`; `tests/test_js_parity.py:1045-1105` |
| 22 | Sky zoom (`skyClampZoom`/`skyViewMatrix`/`skyScreenToBase`/`skyClampFocus`) | n/a | yes | yes | share; delete twins | `static/js/derive.js:40-64`; `web/format.js:73-97`; skyzoom engine |
| 23 | Size/FOV formatting (`fmtSize`, `fmtFov`) | n/a | yes | yes | share; delete twins | `static/js/util.js:162-180`; `web/format.js:30-51`; `tests/test_js_parity.py:725-742` |
| 24 | `magVisible` | n/a | yes | yes | share; delete twins | `static/js/derive.js:29`; `web/format.js:65`; mag engine |
| 25 | `framePct` / frame coverage | formula in Python | yes | yes | share; unify semantics + units | `static/js/derive.js:512-539`; `web/format.js:54-57`; `web/app.js:281-285`; `tests/test_js_parity.py:815-846` |
| 26 | Rig FOV `fov_arcmin` | yes, x2 copies | preview `static/js/setup.js:87-94` | `fovFrom` in **degrees** | share `fovArcmin` (arcmin); fix web units; presets data stays per-platform | `app/rig_presets.py:40-46`; `app/server.py:174-176`; `web/webstore.js:165-168`; `web/app.js:284` |
| 27 | Type labels/colors | copy | copy | copy | share constants; Python copy generated from core or checked | `app/catalog_data.py:11-20`; `static/js/util.js:118-127`; `web/app.js:27-41` |
| 28 | Catalog `search` blob | stored/produced | consumes | re-derives | share builder; decide payload inclusion in Phase 3 | `app/catalog_data.py:311-314`; `static/js/targets.js:69`; `web/build_web.py:31-35`; `web/app.js:136-144` |
| 29 | Timezone helpers (DST offset, zone formatting) | zoneinfo adapter | `static/js/util.js:56-108` | `web/webstore.js:211-252` | share offset/format math; IANA resolution stays adapter | plus `app/planning.py:14` |
| 30 | Catalog identity/uniqueness/composites | yes (build+DB) | trust | trust | leave (build-time data authority stays Python) | `scripts/build_adv_catalog.py:90-104`; `tests/test_catalog_integrity.py:52-143` |
| 31 | Backup validation / untrusted import | yes (`app/backup.py`) | thin | `web/webstore.js:300-388` | keep-separate (IO/platform); optional shared record schema | `app/backup.py:105-200`; `web/webstore.js:300-388` |
| 32 | Persistence (SQLite vs IndexedDB/localStorage) | n/a | n/a | n/a | keep-separate | `app/database.py:59-72`; `web/horizon.js:89-112` |
| 33 | UI state, menus, rendering, library | n/a | shell | shell | keep-separate | `static/js/*`; `web/app.js` |
| 34 | FITS/Wikipedia/DSS/weather/updater/pywebview/FTP | adapter | adapter | n/a | keep-separate | `app/fits.py`, `app/images.py`, `static/js/weather.js` |

## Desktop-JS computations that are redundant with the server and deletable

Honest answer at `v0.6.14`: **no live domain computation can be deleted today
without a behaviour change**, because the server deliberately does not ship the
values in question. The deletable set is dead/duplicated code, not redundant
authority:

| Item | Evidence | Classification |
|---|---|---|
| `static/js/skyview.js:161-179` `gmstDeg`/`altAzFast` | duplicates `static/js/astro.js:10-89` / `app/astro.py:84-114`, no refraction | delete-redundant after core (chart wants precession-correct altaz anyway) |
| `static/js/pano.js:553-575` + `web/horizon.js:380-398` `profileSegments` | identical vertices pinned by `tests/js/sky_band.mjs:153-164` | delete-redundant after share |
| `static/js/derive.js:40-64` + `web/format.js:73-97` sky zoom | pinned twins | delete-redundant after share |
| `static/js/derive.js:140-152` + `web/astro.js:24-36` scrub policy | pinned twins | delete-redundant after share |
| `static/js/derive.js:330` `o.blocked_n` | written, no reader in `static/js` | dead value, delete |
| `/api/object` `vis[]` | `app/nightcalc.py:233`; no desktop reader found (detail re-derives at `static/js/detail.js:310-314`) | API field unused by shipped UI; keep or slim with API test update |
| `web/app.js:1556` detail predicate inline | duplicate of `web/nightrank.js:21` | delete after core |
| `static/js/setup.js:87-94` FOV preview | duplicates `app/server.py:397-401` formula | delete after core `fovArcmin` |

Server-authority values that ARE shipped and consumed (not redundant):
`alt/az/ceil/ceil_top/max_alt` (`static/js/derive.js:294-296,387-397`), sun/moon
(`static/js/derive.js:288-318,357-366`), dusk/dawn/sunset/sunrise
(`static/js/derive.js:115-165`), timeline (`static/js/night.js:43-48`).

Payload-size contract that blocks deletion of the advanced synthesis:
`app/nightcalc.py:105-114` + `static/js/derive.js:196-227`.

## Decision register: contract conflicts this matrix exposes

These five must be settled before the affected code moves (see
`08-owner-decision.md` for D1; D2-D5 are pinned by Phase 0/3 tests):

1. **D1 - Profile bin convention** (row 15) - the only semantic split; currently
   untested for `fov < 360`. Nothing else in this matrix has a cross-app
   disagreement of this class. Recommended canonical: world-azimuth.
2. **D2 - Rig FOV unit** (row 26) - degrees in web storage/arcmin elsewhere.
3. **D3 - `framePct` semantics/units** (row 25) - pinned by tests but only for
   single-axis web cases; paired-axis "645x550" is not compared.
4. **D4 - `popularityFactor`** (row 12) - identical expression, no numeric
   engine.
5. **D5 - `search` blob / type labels** (rows 27-28) - three copies, no
   equality test.
