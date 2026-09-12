# Batch 3 report - hardening, tooling, test-quality (post 0.6.22)

Scope: the CODE-REVIEW-0.6.20 Batch 3 items. Parent-owned; one independent
adversarial pass over the finished fixes (see below). Tree clean at
`acd0d1f`; full gate 433 passed, `check_js.py` (incl. `check_core.py` + token
checks) green.

## Per-item status

| Item | Status | Commit | Test / evidence |
| --- | --- | --- | --- |
| WB3 rigs refresh | DONE | 2104793 | one `reloadRigs()` called by boot/renderSettings/reinitUserData; `test_batch3_web_hardening_wiring` |
| WB4 multi-tab writer | DONE (guard) | 2104793 | `storage` listener reloads the tab before it can overwrite the shared blob; wiring pinned (not browser-testable here) |
| WB5 import id/stroke bounds | DONE | 2104793 | `normalizePanos` drops non-token/duplicate ids + caps strokes 20000; `tests/js/pano_ui.mjs` (pre-fix duplicate id survived) |
| WB6 IDB blocked | DONE | 2104793 | `rq.onblocked` rejects and clears the cached promise; wiring pinned |
| WB7 missing pano section | DONE | 2104793 | bundle without panos throws instead of wiping horizons; wiring pinned. Bundle `version` still ignored (forward-compat choice) - carry-over note |
| PY3 NaN/Inf | DONE (incl. follow-up) | d513df4, acd0d1f | API routes + import boundary (settings/profiles/sites/rigs/panos); `test_numeric_fields_reject_nan_and_keep_state_alive`, `test_import_rejects_nonfinite_site_and_rig_numbers` |
| PY4 custom ids | DONE | d513df4 | `import_bundle` requires the `u_` prefix; `test_import_rejects_custom_ids_without_the_u_prefix` |
| PY6 Origin null | DONE (Origin) | d513df4 | `Origin: null` refused, no-Origin allowed; `test_origin_null_is_rejected` |
| PY6 TLS redirects | DEFERRED | - | the unverified context is bound to an allowlisted host; a redirect stays within the same trust boundary and only image bytes are affected. Fix would validate the final URL - bounded impact, carry-over |
| CR2 malformed horizon guards | DEFERRED | - | all shipped producers normalize before preview; defense-in-depth. Carry-over |
| CR3 FOV-edge half-bin | DEFERRED | - | changes a rendering/scoring boundary convention = user-visible; needs its own release decision. Carry-over (called out per the rules) |
| DS4 worker/sync max_alt | DEFERRED | - | one-sample/0.05 deg difference near ties; cosmetic, carry-over |
| DS5 worker revive | DEFERRED | - | sync fallback always planned; dev-hook-only impact, carry-over |
| TL3 catalog committed-change check | DEFERRED | - | no catalog change ships; guard completeness. Carry-over |
| TL4 specpath + PyInstaller pin | DEFERRED | - | build hygiene; 0.6.22 built byte-stable. Carry-over |
| TL5 stale web/version.json error | DEFERRED | - | release strictness; bake+verify already manual in the checklist. Carry-over |
| Baked-core retention policy | DEFERRED | - | current: keep old hash dirs (a cached old stub may reference them) - the policy text still needs to go beside the cache-token rule in AGENTS.md. Carry-over |
| TS4 untested exports | DEFERRED | - | coverage gap; reference anchors cover the same math. Carry-over |
| TS7 fixture `has()` gating | DEFERRED | - | coverage gap; carry-over |
| E15 per-module token discipline | DEFERRED | - | register pin exists; git-based checker is test-quality. Carry-over |

## Adversarial pass

Independent read-only verification (same pattern as the Batch 2 pass) returned
PY4/PY6/WB3-WB7 **verified** and PY3 **partial**: `import_bundle` still stored
sites/rigs/panos numbers verbatim, so a crafted zip with `lat`/`focal_mm =
Infinity` still 500'd `/api/state` at boot - the same class FIX-4 closed for
settings/profiles. Fixed in `acd0d1f` with a pinning test (pre-fix reasoning:
`json.loads` accepts `Infinity`, the value is stored, `JSONResponse` renders
with `allow_nan=False`).

## Release / close-out

- **No separate 0.6.23.** The shipped items are hardening only (no
  user-reachable behavior change beyond what 0.6.21/0.6.22 already delivered),
  and the remaining Batch 3 items are tooling/test-quality/cosmetic. Folding
  them into the next feature release avoids a release cycle with no user-visible
  payoff. `web/` bytes changed in `2104793`, so that next release must upload
  the web tree (tokens do not change; the modules' contents do) - or a web-only
  deploy can be cut if the owner wants the hardening live earlier.
- Rollback target stays `v0.6.22` (deployed, verified).

## Program status

The review program is **closed for every user-reachable finding**: the Batch 1
and Batch 2 defects shipped in 0.6.21/0.6.22 (all with failing-before/passing-
after pins) and the Batch 3 hardening now covers the web import/refresh,
IDB/blocking and cross-tab surfaces plus the full API/import numeric boundary.
A bounded, explicitly named carry-over remains (the DEFERRED rows above); while
it exists, the program is not literally at zero - the next review pass should
consume that list. Only then does the remaining work become the product
roadmap: panorama crop/FOV, browser automation as a release gate, and
`web/app.js` decomposition.
