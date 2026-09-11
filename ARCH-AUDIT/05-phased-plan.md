# 05 - Phased plan (0-4)

Baseline: frozen tag `v0.6.14` = `383007c`; tree `v0.6.14-2-g834b6bb`.

Rules for every phase:
- Contracts are frozen in Phase 0 and may only be extended by a new decision
  recorded next to this audit; a phase that needs a contract change stops.
- Rollback target is always the newest release tag before the phase (Phase 0/1
  roll back to `v0.6.14`; later phases roll back to the tag released at the end
  of the previous phase). Tags are never moved.
- Every phase lands through the normal release order in `AGENTS.md`
  (curated entry -> pre-tag check -> tag -> build -> check_release -> deploy).
- One commit per independently releasable step; subagents may perform only
  mechanically isolated file moves; the parent owns the core API, the bake and
  the drift check.

## Phase 0 - Contract freeze and failing-test harness (no behaviour change)

Scope:
- Publish the contracts from `03-core-api.md`: units (degrees, epoch ms, arcmin
  for FOV), plain-data shapes, soft-fail semantics, half-open windows,
  scrub policy, and **decision D1** (canonical profile bin convention).
- Add the cross-app partial-FOV panorama test (expected to FAIL today; it pins
  the target semantics shown in `02-duplication-matrix.md` row 15). Same for
  D2-D5 numeric engines (FOV units, paired-axis framing, popularity factor,
  search blob/type maps).
- Add a mutation baseline harness on copies of the existing twins: perturb a
  known coefficient and assert the anchored test fails, so the goldens are
  proven sensitive before code moves (`tests/test_core_mutation.py`).

Contracts frozen: D1-D5 above; `core/index.js` export names; manifest schema.

Tests: existing suite stays green except the intentionally failing D-test(s),
which are marked `xfail(strict=True)` until Phase 1/3 flips them.

Rollback: `v0.6.14` (no release).

Stop if: any contract cannot be expressed as pure functions, or the failing
tests expose a third convention not described in this audit.

Deletions: none.

## Phase 1 - Core scaffolding + proven panorama/horizon pieces

Scope (this is the pending "implement Phase 1" brief; starts only on owner
approval of this audit):
- Create `core/` with `constants.js`, `horizon.js` pure helpers
  (`rebuildMask`, `profileFromMask`, `computeProfile`, `clearMask`, `altOf`,
  `rowOfAlt`, `xOfAz`, `azOfX`, `profileSegments`, `visibleSkyBands`,
  `skyBandPolygons`, `bandTopFor`, `overhangRuns`, `assumedOpenRuns`,
  `assumedOpenHatchPolys`), and the presentation-only geometry with no Python
  counterpart (sky zoom helpers, scrub policy boundaries).
- Implement `scripts/build_core.py` (hash -> `web/core/<hash>/` +
  `static/js/core/<hash>/` + stable `web/core.js` / `static/js/core.js` stubs +
  `core/core.manifest.json`) and `scripts/check_core.py` (drift, stub, token,
  forbidden identifiers, moved-concept guard); wire into `check_js.py` and
  `check_release.py` (mechanism detail in `04-sharing-mechanism.md`).
- Delete the duplicated copies in `static/js/pano.js`, `static/js/derive.js`,
  `web/horizon.js`, `web/format.js`; imports point at the stubs. No
  compatibility shims.
- Desktop packaging must include `static/js/core/` (it does automatically via
  `build.ps1:182`); verify.

Contracts frozen: Phase 0 API names/signatures for the moved functions; bin
convention applied at the `profileFromMask`/lookup boundary.

Tests:
- Before/after numeric identity on the existing anchors:
  `tests/js/sky_band.mjs:153-164` (profileSegments vertices),
  `tests/js/pano_geom.mjs:83-140` (profile/sentinel/seam),
  `tests/js/pano_ui.mjs` (history/zoom), `tests/js/derive_window.mjs`
  (scrub windows), the `scrubwindow`/`scrubgrid`/`skyzoom` engines of
  `tests/test_js_parity.py`.
- Absolute anchor for the panorama complement contract
  (`tests/js/sky_band.mjs:39-151`).
- Mutation proof: `tests/test_core_drift.py` on copies (core byte, baked byte,
  stub, manifest, token mutations all fail `check_core.py`).
- `scripts/check_js.py` (imports/syntax/encoding/catalog) must stay green with
  the generated files present.

Gate: full `python -m pytest tests/ -q`; `scripts/check_js.py` including the
core and catalog checks; browser smoke on the panorama editor preview
(visual, owner-run, since this sandbox has no display); desktop packaging
includes `static/js/core/`.

Deliverables report: core module list, bake/entry layout, drift-check behaviour
(mutation-proven), files deleted, before/after numeric evidence.

Rollback: `v0.6.14`.

Stop if: any anchor moves by > 1e-9, packaging drops the baked tree, the drift
check false-positives on a clean tree, or the no-build web upload order breaks.

Deletions: the twins listed above; `static/js/skyview.js::gmstDeg/altAzFast`
remains for Phase 2 (still used for the backdrop).

## Phase 2 - Astronomy, time and planning into core (JS single implementation)

Scope:
- Move `web/astro.js` math and `static/js/astro.js` into `core/astro.js` +
  `core/time.js` + `core/planning.js` (julian/gmst/precession/altaz/refraction/
  sun/moon; twilight/night window/sun crossings; longest run; index ranges).
- Desktop imports the stub for advanced-track synthesis
  (`static/js/derive.js:196-227`) and deletes its astrology twins; web imports
  the stub for every computation.
- Python (`app/astro.py`, `app/planning.py`) stays authoritative for
  `/api/night` during this phase and is used as the parity oracle only.

Contracts frozen first: Phase 0 signatures; the payload contract
(`/api/night` keys, `app/nightcalc.py:143-167`) is unchanged.

Tests:
- Absolute goldens (Meeus/IAU): run the existing Python goldens' values against
  core in Node (new `tests/js/core_reference.mjs` driven by
  `tests/test_js_behaviour.py` or `tests/test_js_parity.py`) - independent
  transcription, not a round-trip.
- Python<->core parity as a temporary oracle: extend `tests/js/astro_parity.mjs`
  engines and `tests/test_js_parity.py:72-127, 227-236` to the moved functions,
  including polar/DST/both-hemisphere twilight cases
  (`tests/test_js_parity.py:789-812`).
- Mutation: perturb precession rotation axis, refraction constant, twilight
  threshold, site-noon anchor -> goldens must fail.

Rollback: newest tag (Phase 1 release, if one was cut; else `v0.6.14`).

Stop if: any absolute golden fails, parity > 1e-9, or nightly payload
size/compute-time guards (`tests/test_api.py::test_night_payload_size_and_compute_time_stay_bounded`)
regress.

Deletions: `static/js/astro.js` (becomes an import of the stub or disappears),
the `web/astro.js` math bodies, `static/js/skyview.js:161-179` decorative
`gmstDeg`/`altAzFast`, the duplicated twilight/scrub code left in
`web/astro.js`.

## Phase 3 - Visibility, scoring, catalog logic, formatting into core

Scope:
- Move `core/visibility.js`, `core/scoring.js`, `core/catalog.js`,
  `core/format.js`; desktop `static/js/derive.js` / `static/js/util.js` and web
  `web/nightrank.js` / `web/format.js` / `web/app.js` consume the stub.
- Resolve D2-D5: rig FOV unit (arcmin), paired-axis framing cases,
  `popularityFactor` numeric engine, `search` blob and type label/color single
  source (catalog data constants either generated from core via Node at build
  time or checked against it).
- Remove the desktop payload-adjacent dead code (`o.blocked_n`,
  `static/js/derive.js:330`) and the inline duplicates
  (`web/app.js:1556`, `web/webstore.js::fovFrom`).

Contracts frozen first: payload contract unchanged; the min-alt explicit flag
and `ceil_top` gating remain server rules that core mirrors (not replaces).

Tests:
- Extend parity engines: popularity numeric, size, frame (incl. paired axis),
  magVisible, type maps, search blob equality across apps.
- Absolute fixtures for ranking + clear-window stats
  (reuse `tests/test_js_parity.py:965-984` anchors, add expected top-N lists).
- Mutation: scoring curve coefficients and the `magVisible` boundary.

Rollback: newest tag.

Stop if: ranking differs from frozen fixtures, `/api/night` or
`/api/object` contract tests change, or the web catalog size grows beyond the
reviewed budget when `search` is shipped.

Deletions: the twins named in `02-duplication-matrix.md` rows 21-29, dead
values, and the `setup.js` FOV preview duplicate.

## Phase 4 - Authority decision (Python demotion happens here or not at all)

Scope:
- Decide the authority flip (see `07-authority-risk.md`). Option A: Python stays
  authoritative for `/api/night` indefinitely; core is the shared implementation
  for web/tests/desktop client-side math. Option B: flip - the desktop computes
  from core exactly like the web, the server stops computing astronomy, and
  `app/astro.py` / `app/planning.py` / most of `app/nightcalc.py` are deleted
  with their API tests replaced by core contract tests.
- Option B preconditions (all must be green before the flip release): core
  passes every absolute golden and the full Python parity matrix at 1e-9;
  desktop client compute time measured (budget reviewed against the current
  server guard, `tests/test_api.py` standard/advanced bounds); `/api/night`
  payload contract versioned and all callers updated in the same release;
  rollback tag = previous release, exe rollback verified.
- Option A is the default if any precondition is not met.

Contracts frozen first: the API contract version for Option B (breaking change:
client computes, server ships catalog/settings/panos only).

Tests: contract tests for the new payload shape; end-to-end smoke on both apps;
perf measurement recorded in the release notes.

Rollback: previous release tag (the last release with server-computed
payloads).

Stop if: any parity/golden/perf gate is red, or the desktop smoke shows stale
or missing tracks.

Deletions (Option B only): Python astronomy and planning functions, their
payload assembly, and the desktop's `derive.js` mirror where core supersedes it.
Option A deletes nothing further.
