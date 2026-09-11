# NightSeam core extraction audit - baseline, method, evidence

Baseline (quoted everywhere in this audit): **frozen stable tag `v0.6.14` = `383007c`**
("NightSeam 0.6.14"). Audit tree: **`834b6bb` = `v0.6.14-2-g834b6bb`** (two post-tag
commits: `384486d` landing changelog data, `834b6bb` post-release sky-view follow-up:
bin-space preview hatch, unified sky-view red, `assumedOpenRuns` guard). Neither
post-tag commit changes the architecture questions below; where the tag matters
(shipping baseline, rollback) the tag is `v0.6.14`.

## Scope

Architecture extraction audit only. No source modifications, no refactors, no
commits, no builds. This directory (`ARCH-AUDIT/`) is the only output.

Target architecture under validation (accepted direction, not redesigned here):

- `core/` holds domain logic as pure ES modules (no DOM, storage, or network):
  astronomy, time/timezone, twilight, sun/moon, planning/night windows,
  visibility/status/min-alt, scoring, horizon/panorama geometry, catalog logic,
  formatting.
- `web/` and `desktop/` (today `static/`) are shells importing core; UIs stay
  separate.
- Python becomes a platform adapter (HTTP/IO/FITS/SQLite/backup/pywebview/Windows)
  and must end with no astronomy logic.
- JS is the core language; sharing via content-hashed bake + stable entry stub +
  drift check; Node runs core at build/test time.
- Correctness is pinned against independent references (Meeus/IAU) with absolute
  goldens; Python<->core parity is a temporary transition oracle.

## Method

Six read-only subagents (A astronomy/planning, B panorama/horizon, C catalog/data,
D UI/state, E build/release/tokens, F module graph and Python<->JS boundaries),
each returning file:line evidence only. The parent then verified the
load-bearing/conflicting claims directly in source before writing this audit.

Parent-verified in this pass (file:line read by the parent, not just reported):

- World-azimuth vs FOV-relative profile bins: `app/nightcalc.py:44-48`,
  `static/js/derive.js:175-183`, `static/js/pano.js:703-712` (world);
  `web/horizon.js:348-372`, `web/horizon.js:521-527` (FOV-relative);
  `tests/test_horizon_parity.py:56-103` (only `fov=360, azOffset=0`).
- `web/webstore.js:165-168` `fovFrom` returns **degrees**; `web/app.js:281-285`
  converts with `* 60`; server/desktop rig FOV is **arcmin**
  (`app/server.py:174-176`, `app/rig_presets.py:40-46`).
- Web live the popularity source fetch: `web/app.js:100-134`.
- Decorative duplicate astronomy in the desktop chart:
  `static/js/skyview.js:161-179` (`gmstDeg`, `altAzFast`) duplicates
  `static/js/astro.js:22-89` / `app/astro.py:84-114` without refraction.
- Server ships tracks but not vis/score: `app/nightcalc.py:115-141`, comment at
  `:127-129` ("visibility flags / best windows / scores are derived CLIENT-side").
- Exact public export surface of both JS trees and `app/*.py` functions
  (function lists used in `03-core-api.md`).

Subagents did not run tests or builds. The parent ran the full suite once before
starting this audit at `834b6bb`: 536 passed (no source changed since). Claims
the subagents marked UNVERIFIED are carried forward as open questions, not facts.

## Reading order

- `01-inventory.md` - what runs where, per domain.
- `02-duplication-matrix.md` - per concept: Python-authority / desktop-JS / web-JS
  -> share / delete-redundant / keep-separate / leave.
- `03-core-api.md` - proposed core modules, signatures, data types, boundary.
- `04-sharing-mechanism.md` - bake, hash, stub, drift check, cache-busting,
  proven against no-build web + PyInstaller constraints.
- `05-phased-plan.md` - phases 0-4 with contracts, tests, rollback, stop
  conditions, deletions.
- `06-not-unified.md` - intentional differences that must stay separate.
- `07-authority-risk.md` - the authority flip and the evidence for keeping Python
  authoritative.
- `08-owner-decision.md` - the one decision needed next.

## Source evidence cited by this audit (beyond the files above)

- `AGENTS.md` (invariants, release order, token line, architecture section).
- `AUDIT-DESKTOP-WEB-PARITY.md:15-32,320-339` (intentional-difference list A,
  historic confirmed bugs E1-E6 - status not re-adjudicated here; current
  evidence used instead).
- `AUDIT-PARITY-0.6.9.md:43` (classification legend A-F).
- `tests/js/{sky_band,pano_geom,pano_ui,astro_parity,derive_window,web_backup,
  dom_handlers,night_race}.mjs`, `tests/test_js_parity.py`,
  `tests/test_horizon_parity.py`, `tests/test_js_behaviour.py`.
