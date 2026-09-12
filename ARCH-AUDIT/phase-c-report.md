# Phase C report - Python astronomy removed (0.6.20)

Baseline: v0.6.19 (b722716). Rollback target v0.6.19 (dist/release/
NightSeam-0.6.19.zip) intact; v0.6.18 also present.

## Deletion map vs actual

| Item | Planned | Actual |
| --- | --- | --- |
| `planning_client_compute` flag + server fallback | delete | DELETED (d78b702): server settings/model/state, `night.js`, `detail.js`; `night_race.mjs` rewritten to the real client path; `__NS_PLAN_FORCE_FAIL` smoke hook removed with it |
| `scripts/gen_core_fixtures.py` | retire | DELETED (4f11522) after a pre-deletion probe proved every data section byte-identical to the committed fixture |
| `scripts/shadow_export.py` / `shadow_compare.mjs` | retire | DELETED (4f11522); one-off flip audit, superseded by the frozen fixtures |
| `GET /api/night`, `GET /api/object/{oid}` | delete -> 404 | DELETED (4f11522); pinned by `test_api.py::test_removed_planning_routes_answer_404`; `/api/object/{oid}/image` stays |
| `PROFILE_BINS` | move to server | moved to `app/server.py` as a storage-format constant |
| `synthesizeAdvancedTracks` (`derive.js`) | retire | DELETED (4f11522); the client builder owns all tracks now |
| `app/nightcalc.py` | delete | DELETED (631bdba) |
| `app/planning.py` | delete | DELETED (765719f) |
| `app/astro.py` | delete | DELETED (a90acd9) |
| `tests/test_horizon.py`, `test_horizon_parity.py` | retire | DELETED (631bdba) |
| `tests/test_planning.py` | retire | DELETED (765719f) |
| `tests/test_astro.py`, `test_precession_reference.py` | retire | DELETED (a90acd9) |
| `tests/test_js_parity.py` Py parity | split/retire | live-Python tests removed across commits 3-5; scrub windows/indices, dark-window levels, sun/moon altitudes + JD frozen as literals |
| `tests/fixtures/core_fixtures.json` | keep frozen | KEPT; `test_core_fixtures.py` + `test_core_p_mutation.py` unchanged in behaviour (docstring notes the freeze) |
| Build-time consumers | migrate if any | none existed: `build_adv_catalog.py`, `web/build_web.py`, `build_core.py` are IO/JS only, so nothing needed porting to Node |

## Per-commit gate

| Commit | Content | Gate |
| --- | --- | --- |
| d78b702 | flag + fallback removal, race harness rewrite, backup-import legacy-key test | full suite 577 passed (before: 577) |
| 4f11522 | script retirement, routes off, `synthesizeAdvancedTracks` gone | full suite 566 passed |
| 631bdba | `app/nightcalc.py` + horizon tests | full suite 530 passed |
| 765719f | `app/planning.py` + planning tests | full suite 513 passed |
| a90acd9 | `app/astro.py` + reference tests | full suite 403 passed |
| guard commit | `check_core.py` Python scan + mutation tests + docs | 403 passed |

`python scripts/check_js.py` green at every commit that touched JS (0 broken
imports, 0 syntax errors, encoding/catalog/core guards OK).

## Final Python surface (IO/platform only)

- `app/`: `backup.py`, `catalog_data.py`, `database.py`, `fits.py`, `images.py`,
  `imglib.py`, `ingest.py`, `paths.py`, `rig_presets.py`, `server.py`,
  `version.py`, `adv_popularity_data.py` + `main.py`.
- Routes: state/settings, sites, rigs, catalog (+custom), object IMAGE,
  panoramas (+image), export/import, library, images/ingest, shutdown.
- No astronomy or planning math: `scripts/check_core.py` scans `app/**` and
  `scripts/**` for the retired modules and the 18 moved Python functions.

## Guard proof

`scripts/check_core.py` now fails on:
- `app/astro.py|planning.py|nightcalc.py` existing at all;
- any `def julian_day|gmst_deg|altaz|sun_ra_dec|moon_ra_dec|moon_illumination|
  moon_age|night_window|compute_night|object_detail|ceil_lookup|longest_run|...`
  in `app/` or `scripts/`.

Mutation-proven in `tests/test_core_drift.py`: staging a `nightcalc.py` or a
`def altaz()` in a staged scripts tree fails `scan()`; the real repo passes.

## Freeze evidence

- `probe_fixtures.py` (temp, before deletion): `gen_core_fixtures.build()` equals
  `tests/fixtures/core_fixtures.json` on jd/gmst/precession/altaz/sun/moon/
  twilight and on manifest tag/matrix/tolerances -> `DATA_IDENTICAL`.
- Scrub scenarios: night/full window ms, payload t0 and sunset/sunrise/dusk/dawn
  crossings + grid indices frozen from `night_window` before deletion
  (`test_js_parity.py`, `_SCRUB_SCENARIOS`).
- Sun/moon visibility: JDs and apparent altitudes frozen before deletion
  (`_SUN_ANCHORS`, `_MOON_ANCHORS`).

## Dev hook disposition

`window.__NS_DEBUG_WORKER` (gates `__NS_KILL_WORKER`/`__NS_REVIVE_WORKER`) is
KEPT: inert unless set in devtools and used by the worker-recovery coverage.
`__NS_PLAN_FORCE_FAIL` was deleted with the server fallback (no dead smoke hook
stays).

## exe size delta

- v0.6.19 release exe: 20,702,177 bytes (dist/release/NightSeam.exe).
- Phase C direct PyInstaller build (same flags, before release bake):
  20,682,684 bytes -> **-19,493 bytes (-19.0 KiB, -0.09%)**.

## Web/deploy scope

No `web/` module, `core/` byte or catalog changed in Phase C (JS shells touched:
`static/js` only; `web/` untouched). The 0.6.20 deploy is therefore
`version.json` + landing changelog only - no `web/` tree upload.

## Release report (0.6.20)

- Curated changelog entry: added to `scripts/build_changelog.py` in the
  `NightSeam 0.6.20` commit (2c6a72e), `pre_tag_check.py 0.6.20` OK.
- Tag `v0.6.20` on 2c6a72e; `build.ps1` built `dist/NightSeam.exe` at the tag
  (version 0.6.20); `web/version.json` baked by hand (the sandbox cannot spawn
  `build_web.py version`) as `{"version":"0.6.20","describe":"v0.6.20",...}`.
- `scripts/check_release.py`: 0 errors, 1 expected changelog warning before the
  post-tag regen.
- Artifacts: `NightSeam-0.6.20.zip` = 20,448,876 bytes, sha256
  `63948945fc5ae0ac8820c9169ef6bd151cdd6fc18ce438ce2a3800fd233612e0`;
  `NightSeam-latest.zip` identical; `version.json`/`ns-version.js` staged.
- Packed smoke on the tagged exe (headless, port 8413): `/api/state` version
  0.6.20, retired routes 404, image route 200, UI + planning_client served,
  catalog 197, offline export OK.
- Deploy scope: no `web/` or `core/` byte changed in Phase C -> upload
  `/downloads` artifacts + `landing/changelog.json` only (no `/astro` tree).
- Rollback: the local stage no longer holds 0.6.19 (`make_release` replaced it)
  - rollback source is the `v0.6.19` tag (b722716) plus any 0.6.19 zip copy on
  the public site / in GitHub history.
- Post-tag follow-up: `landing/changelog.json` regenerated (0.6.20 entry) and
  committed separately; the tag never moved.
