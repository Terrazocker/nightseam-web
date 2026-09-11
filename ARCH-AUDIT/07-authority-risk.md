# 07 - Highest-risk decision: the authority flip

Baseline: frozen tag `v0.6.14` = `383007c`; tree `v0.6.14-2-g834b6bb`.

## The decision

**Does Python remain the computation authority for the desktop, or does
`core/` (JS) become the single computation source and Python become a pure
adapter?**

- Authority today: the desktop server computes every astronomy/planning value
  in `/api/night` and `/api/object/{oid}` (`app/nightcalc.py:54-239`), using
  `app/astro.py` and `app/planning.py`; the desktop UI consumes those payloads
  and only derives visibility/status/scores/min-alt client-side by design
  (`app/nightcalc.py:127-129`). The web has no server and already computes
  everything in JS (`web/astro.js`, `web/nightrank.js`, `web/app.js`).
- The flip: make the desktop compute from core exactly like the web, reduce
  `/api/night` to catalog/settings/panoramas data, and delete Python astronomy
  (`app/astro.py`, `app/planning.py`, most of `app/nightcalc.py`).

This is the highest-risk decision in the extraction because it changes what
produces every number the desktop shows, invalidates the API contract tests,
moves CPU/startup cost onto the UI process, and is not reversible by a web
upload - rollback is a previous exe/ZIP.

## Evidence that justifies keeping Python authoritative (default)

1. **Independent goldens live on the Python side.** `tests/test_astro.py`,
   `tests/test_planning.py`, `tests/test_precession_reference.py` compare
   against published Meeus/IAU/ERFA values. The JS tests are mostly
   "matches Python" engines (`tests/test_js_parity.py:72-127`) or cross-app
   anchors; `tests/js/astro_parity.mjs` states it checks the three engines
   against each other. Flipping before core has its own absolute goldens turns
   the oracle into the subject - the audit's own testing principle says parity
   is only a temporary transition oracle (`00-baseline.md`).
2. **Performance and payload are contract-tested server-side.**
   `tests/test_api.py::test_night_payload_size_and_compute_time_stay_bounded`
   pins standard ~<1.15 MB/<0.6 s and advanced ~<2.7 MB/<1.0 s bounds over a
   241-sample 24 h grid (`app/nightcalc.py:70-77`). The web proves client
   compute is possible, but its workload is on-demand per object/night, and no
   benchmark exists for a full 12k-object desktop grid in pywebview's single
   JS thread. A flip without that measurement risks a user-visible regression
   the current tests cannot catch.
3. **The API contract is explicitly pinned and consumed.**
   `/api/night` keys and conditional `ceil_top` gating are tested
   (`tests/test_api.py:1026-1085`), and the desktop consumes them in several
   places (`static/js/derive.js:294-318,387-397`, `static/js/skyview.js:484`,
   `static/js/detail.js:92-94`). Flipping means versioning the payload, updating
   every consumer in one release, and re-pinning those tests - a release-sized
   change, not a refactor.
4. **Python is intertwined with non-domain adapters.** `compute_night` takes a
   `Database` and reads profiles/tracks (`app/nightcalc.py:54-114`), profile
   validation guards the API (`app/server.py:190-204`), and the server is the
   only place the settings/defaults rules are enforced
   (`app/server.py:330-339,344-375`). Deleting astronomy without restructuring
   these leaves a half-adapter.
5. **Drift has already happened where two authorities exist.** The profile bin
   convention split (world-azimuth in Python/desktop vs FOV-relative in web)
   and the FOV degree/arcmin split are exactly what happens when no single
   authority/test pins the semantics. That argues for a single authority, but
   also warns that the flip must be preceded by absolute goldens and mutation
   tests, not rushed.
6. **Alerting/rollback cost.** A wrong server compute ships in the exe; a wrong
   web core can be hot-fixed by upload. The desktop channel is the slower one,
   so it is the last place to move authority without independent references.

## Evidence that would justify flipping (Option B preconditions)

- Core passes its own absolute goldens (Meeus/IAU, not Python round-trips) for
  astro, time, twilight and planning, plus the full Python parity matrix
  (polar twilight, DST, both hemispheres) at 1e-9.
- A measured desktop client-side benchmark of the full standard and advanced
  grids shows compute time and memory at or below the current server budget
  with margin (recorded in the release notes of the flip release).
- `/api/night` / `/api/object` contract versioned, all consumers updated, and
  the API tests re-pinned in the same release.
- Exe/ZIP rollback to the previous release verified before the flip ships.
- No mutation-blind spots: each moved domain has at least one mutation test
  that demonstrably fails when a coefficient/axis/anchor is perturbed.

## Recommendation

Keep Python authoritative through Phases 0-3 (core proven against Python and
against absolute references). Treat Phase 4 as its own go/no-go release with
the preconditions above. If the benchmark or the goldens are not green, Option
A (Python stays authoritative; core serves web/tests/desktop client-side math
where no payload exists) remains a correct end state for this audit - the
single-source goal is satisfied for the JS side, and Python is demoted only
where it is provably safe.
