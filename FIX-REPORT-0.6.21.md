# Fix report - reviews of 0.6.20, Batch 1 shipped as 0.6.21 (+ Batch 2 fixes post-release)

Baseline review: `CODE-REVIEW-0.6.20.md`. HEAD after this work: `1634221`
(tag `v0.6.21` on `a0200fb`; Batch 2 commits are post-tag and await a 0.6.22
release when the owner approves).

## Batch 1 - shipped as 0.6.21

| Finding | Status | Commit | Regression test | Before -> after |
| --- | --- | --- | --- | --- |
| DS1 worker lifecycle | FIXED | cd6165f | `tests/js/worker_lifecycle.mjs` (+ `worker_bridge.mjs` runs the REAL planning_worker.js) | night build answered `cancelled` after a prefs message + missing queue API -> `worker lifecycle contract held` |
| DS2 catalog identity | FIXED | 4e0743f | `tests/js/catalog_identity.mjs` + `test_ui_invariants.py` | stale ids after reset, mismatched-id binding, missing reset API -> `catalog identity contract held` |
| PY1/PY2 import validation | FIXED | 05ba36e (+ 1634221) | `tests/test_backup.py` profiles/settings, `test_api.py` route 400 + state alive, malformed-bundle 400 | `DID NOT RAISE` x2 / import 200 -> all 400 with clear messages, `/api/state` stays 200 |
| TS2 MOVED sync | FIXED | 762711e | `test_core_drift.py` covers/stale/mutation | missing 6 names -> 5 passed, check_core OK |
| TL1 make_release core check | FIXED | 353e3bb | `test_release_check.py::test_make_release_consults_the_core_drift_check` | `AttributeError: no check_core_findings` -> 73 passed |
| TS6 node fail-not-skip | FIXED | 2673c43 | `test_reference_anchors.py::test_missing_node_fails_instead_of_skipping` | `got Skipped` -> Failed caught, 76 passed |
| WB2/TL2 tokens + register | FIXED | 777af5b (re-bumped 41ea521) | `test_cache_tokens.py::test_web_token_register_matches_the_sources` | `'55' != '56'` -> register == sources |

Gate: full suite 422 passed at the tag; `check_js.py`/`check_core.py` green.
Packed-exe smoke (0.6.21, headless port 8414): state 0.6.21; hostile-settings
import 400 `settings.bortle must be a finite number`; 719-bin profile import
400; `/api/state` 200 after both; packaged client contains
`flushQueuedPrefs`/`catalog ids mismatch`/`catalog-reset`/`latestNightGen`/
`resetPlanningCaches`; `/api/night` 404. The FIX-1 browser scenario and the
catalog reorder are pinned by the Node harnesses that drive the real worker +
client (no browser in this environment).

Release 0.6.21 (documented order): curated entry in the tagged commit, tag
`v0.6.21`, build.ps1 bake, hand-baked `web/version.json`, `make_release`,
`check_release` 0 errors, upload: `/downloads` (zip 20,452,002 B, sha256
`5ee67e26...b966`, latest, version.json, ns-version.js), full `/astro` tree
(this release changed web bytes: tokens), `/changelog.json`. Exe 20,685,664 B
(0.6.20 was 20,682,684 -> +2.9 KiB). Verified: deployed app.js hash == local,
`/downloads/version.json` and `/changelog.json` newest = 0.6.21. Rollback
`v0.6.20`.

## Batch 2 - implemented post-tag (unreleased)

| Finding | Status | Commit | Test | Before -> after |
| --- | --- | --- | --- | --- |
| CR1/FIX-6 noon anchor | FIXED | 41ea521 | `tests/js/noon_fallback.mjs` + UI pin | no-anchor used the wall clock -> throws; site-noon fallback = 20:00/04:00 local |
| DS3/FIX-3 sync cache key | FIXED | 9f058a9 | `tests/js/sync_cache_key.mjs` | `tz change served a stale payload: 60 then 60` -> contract held |
| WB1/FIX-5 save durability | FIXED | 8088590 + 1634221 | `pano_ui.mjs` quota case + apply rollback | `updatePano ... got undefined` / failed apply returned true -> false + rollback |
| TS1 self-comparison | FIXED | 9c41918 | `test_web_size_column_absolute_values` (39 frozen values) | coordinated two-tree mutation passed the old equality check; absolute matrix fails it |
| TS5 mutation gaps | FIXED | 281e783 | inverse-zeta + JD mutations | proofs now bite the named anchors |
| TS3 guard evasion | FIXED | bca4377 + 1634221 | drift mutations (arrow/comment/reassign/async) | arrow form evaded -> all four detected, wrappers exempt |

FIX-6 re-baked core (token 16) and cascaded the web token bumps
(58/9/39/16/6/18), AGENTS register updated.

Adversarial verification (independent subagent, read-only) initially found
three incomplete fixes: FIX-4's early ZipFile paths still 500'd + leaked the
spool, FIX-5's `applyPanosSnapshot`/`importPanos` still reported success on a
failed write, and TS3 still missed comment-separated/single-param arrows and
reassignments. All three are fixed in 1634221 with tests.

## Remaining from the review (not started / not fixed)

- FIX-10/11 harness hardening: WB3 rigs refresh, WB4 multi-tab writer,
  PY3 NaN finite checks, PY4 imported custom ids, PY6 Origin/TLS, WB5/WB6/WB7
  import/IDB hardening, CR2 malformed horizon guards, CR3 FOV-edge convention,
  DS4 worker/sync max_alt, DS5 worker revive.
- S3 leftovers: TL3 catalog-token committed-change check, TL4 specpath/pin,
  TL5 stale web/version.json error, TS4 untested exports harness, TS7 fixture
  `has()` gating, E15 per-module token discipline.
- Polish backlog from `CODE-REVIEW-0.6.20.md`.

Final gate after all commits: **428 passed**, `check_js.py` + `check_core.py`
green. No Batch 2 release has been cut; a 0.6.22 release needs owner approval
plus a fresh packed smoke.

## Deferred-item classification (0.6.22 pre-flight)

Folded into 0.6.22: nothing new - the deferred items below were re-checked and
none is a user-reachable correctness/security defect; every Batch 2 fix plus
the adversarial-verification corrections (1634221) ships.

Correctness/security-adjacent, deferred to Batch 3 with rationale:
- PY3 NaN/Infinity accepted by settings/rig/pano fields: needs a LOCAL API call
  with non-standard JSON; the realistic vector (a crafted backup) is already
  rejected (FIX-4). Hardening, not a shipped bug.
- WB7 bundle without a pano section replaces horizons: requires a
  hand-edited backup; the restore path stages/validates and the incident is
  recoverable from the safety snapshot. Data-model hardening.
- CR2 malformed horizon records throw in preview functions: all shipped
  producers normalize before preview; defense-in-depth.
- WB5/WB6 (import stroke bounds, IDB blocked handling), PY4 (imported custom
  ids), PY6 (Origin null / redirect TLS), CR3 (FOV-edge half-bin), DS4
  (worker/sync max_alt), DS5 (worker revive), WB3 (rigs refresh), WB4
  (multi-tab): low reachability / polish-level; Batch 3.

Tooling/test-quality only (Batch 3, one-line rationale each):
- TL3 catalog-token committed-change check: guard completeness; the token
  discipline is otherwise enforced and no catalog change ships in 0.6.22.
- TL4 PyInstaller specpath + version pin: build hygiene; the 0.6.22 build is
  byte-stable with the pinned toolchain and the tag is clean.
- TL5 stale `web/version.json` warning-only: release-tooling strictness; this
  release bakes and verifies the stamp before upload.
- TS4 untested exports harness: coverage gap, no product impact.
- TS7 fixture `has()` gating: coverage gap; the reference anchors now cover
  the same concepts absolutely.
- E15 per-module token discipline: the register pin covers documentation; a
  git-based checker is Batch 3.

