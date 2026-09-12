# Phase C - deletion map + commit plan (Python astronomy -> IO/platform only)

Baseline: NightSeam 0.6.19 (tag `v0.6.19`, commit b722716). Rollback targets
`v0.6.19` / `v0.6.18` intact; `dist/release/NightSeam-0.6.19.zip` present.

Goal: `core/` is the ONLY astronomy/planning implementation. Python keeps IO,
platform, storage, ingest, image/catalog plumbing. No user-visible change.

## Deletion map (module -> consumers -> disposition)

| Module / symbol | Consumers today | Disposition |
| --- | --- | --- |
| `planning_client_compute` | `app/server.py` (SettingsIn, /api/state, /api/settings), `static/js/night.js`, `static/js/detail.js`, `tests/test_api.py::test_planning_client_compute_flag_defaults_true_and_toggles`, `tests/test_ui_invariants.py::test_desktop_planning_flip_uses_core_with_server_fallback`, `tests/js/night_race.mjs` fixture | DELETE setting + flag reads + server fallback (commit 1). Backups carrying the key stay importable (settings are opaque) - pinned by a new test. Source-invariant test rewritten to "core only". |
| `GET /api/night` | desktop `night.js` fallback (gone after commit 1), `tests/test_api.py` route tests | DELETE route (commit 2) -> 404. Route tests that pinned the Python payload die with it; payload contract stays pinned by `tests/js/night_race.mjs`, core fixtures and derive engines. |
| `GET /api/object/{oid}` | desktop `detail.js` fallback, `tests/test_api.py` | DELETE route (commit 2) -> 404. Image sub-route `/api/object/{oid}/image` STAYS (IO). |
| `app/nightcalc.py` | `app/server.py` (`compute_night`, `object_detail`, `PROFILE_BINS`) | `PROFILE_BINS` moves to `app/server.py` (constant 720, profile validation only). Module deleted (commit 3). |
| `app/planning.py` | `app/nightcalc.py`, tests, `scripts/gen_core_fixtures.py` | DELETE (commit 4). |
| `app/astro.py` | `app/planning.py`, `app/nightcalc.py`, tests, `scripts/gen_core_fixtures.py` | DELETE (commit 5). |
| `scripts/gen_core_fixtures.py` | writes `tests/fixtures/core_fixtures.json` from the Python oracle | RETIRE (commit 2). The fixture JSON is FROZEN (kept, no longer regenerable); documented in the script's removal. |
| `scripts/shadow_export.py`, `scripts/shadow_compare.mjs` | one-off flip-audit tooling (Python payload vs core) | RETIRE (commit 2); superseded by the frozen fixtures + core engines. |
| `tests/test_astro.py`, `test_precession_reference.py`, `test_planning.py`, `test_horizon.py` | direct Python module tests (absolute + reference) | DELETE with their modules (commits 3-5). The published-value goldens survive in `tests/fixtures/core_fixtures.json` + `tests/js/core_fixtures.mjs`. |
| `tests/test_horizon_parity.py` | Python `ceil_lookup` vs node | DELETE (commit 3); JS behaviour pinned by `tests/js/pano_geom.mjs`, `sky_band.mjs`, `core_d1.mjs`. |
| `tests/test_js_parity.py` | mixed: Python<->JS parity + JS-internal absolute tests | SPLIT: parity test functions deleted (commits 3-5); JS-internal tests stay. |
| `tests/test_api.py` | 3 direct-compute tests + route tests | Direct-compute tests deleted; route tests for deleted routes deleted; IO tests stay. |
| `tests/test_core_fixtures.py`, `test_core_p_mutation.py` | node vs frozen JSON fixtures | KEEP unchanged (frozen goldens). |
| `app/fits.py::parse_ra_hours/parse_dec_deg` | catalog seeding/import | KEEP (coordinate PARSERS, not astronomy math). |

## Commit plan (one module / concern per commit, gate green each)

1. `flip: desktop plans client-side only (drop planning_client_compute + server fallback)`
   - Remove flag from `app/server.py`, `night.js`, `detail.js`; rewrite `night_race.mjs`
     to drive the real client path; rewrite the source invariant test; add a
     backup-import-with-legacy-key test.
2. `phase-c: retire Python-oracle fixture/audit scripts; delete /api/night + /api/object/{oid}`
   - Delete `scripts/gen_core_fixtures.py`, `scripts/shadow_export.py`,
     `scripts/shadow_compare.mjs`; move `PROFILE_BINS` into `server.py`; delete the
     two planning routes; prune test_api route tests.
3. `phase-c: delete app/nightcalc.py (core only)`
   - Delete `tests/test_horizon.py`, `test_horizon_parity.py`; split `test_js_parity.py`.
4. `phase-c: delete app/planning.py`
   - Delete `tests/test_planning.py` + remaining planning parity tests.
5. `phase-c: delete app/astro.py`
   - Delete `tests/test_astro.py`, `test_precession_reference.py` + remaining parity tests.
6. `guard: enforce core-only astronomy across app/ + scripts/` (extend `check_core.py`).
7. `docs: Phase C architecture + deletion record` (AGENTS.md, ARCH-AUDIT/phase-c-report.md).
8. Release 0.6.20 (documented order; rollback v0.6.19).

## Dev hook disposition

`window.__NS_DEBUG_WORKER` (gates `__NS_KILL_WORKER`/`__NS_REVIVE_WORKER`) is
KEPT: it is inert unless set in devtools and is exercised by the worker-recovery
coverage. `__NS_PLAN_FORCE_FAIL` loses its server-fallback consumer in commit 1
and is REMOVED with `night_race.mjs`'s rewrite (no dead smoke hook stays).

## Guard

`scripts/check_core.py` currently checks `core/` purity + moved-concept
re-implementation in `static/js`/`web`. Phase C extends the moved-concept scan
to `app/` and `scripts/` so astronomy/planning math cannot reappear.
