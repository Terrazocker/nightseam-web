# 08 - The one decision the owner must make next

Baseline: frozen tag `v0.6.14` = `383007c`; tree `v0.6.14-2-g834b6bb`.

Everything in this audit is evidence and a proposal; nothing was changed.

## Decision

**Approve this audit and authorize Phase 1** - core scaffolding plus the
already-proven panorama/horizon pieces, the bake/stub/drift mechanism, and the
deletion of their duplicates - **with world-azimuth as the canonical profile bin
convention (D1)**.

Rationale: Phase 1 is the only phase that moves code whose parity is already
pinned by an existing cross-app test (`tests/js/sky_band.mjs:153-164`), so its
before/after evidence is mechanical. D1 must be fixed before any profile code
moves; world-azimuth is the convention Python (`app/nightcalc.py:44-48`),
the desktop (`static/js/pano.js:703-712`) and the server API already use, so
only the web editor's at-rest representation migrates (option FOV-relative
would instead require migrating the server, the SQLite payload path and the
desktop editor - strictly higher risk).

## Options

1. **Approve + Phase 1 + D1 = world-azimuth (recommended).** Phase 1 starts per
   `05-phased-plan.md` (which is the pending implementation brief), one commit
   per independently releasable step, no behaviour change, full gate before the
   report.
2. **Approve the audit, choose D1 = FOV-relative.** Same Phase 1 scope, but the
   migration set inverts (Python/server/desktop storage semantics change first,
   with a migration for existing SQLite panos). Higher risk; needs its own
   migration test matrix before the move.
3. **Approve the audit, defer Phase 1.** No core code until more evidence (for
   example, benchmark the desktop client-side grid first). The audit stands;
   `core/` stays empty.
4. **Reject/adjust the target architecture.** State the objection and this
   audit is revised before any implementation.

## What approval unlocks

- The pending Phase 1 brief in full (`05-phased-plan.md` Phase 1): `core/`
  creation, `scripts/build_core.py` + `scripts/check_core.py`, duplicate
  deletion, gate (full pytest, `check_js.py` incl. core/catalog, packaging
  check, owner-run panorama smoke), and the report (module list, bake layout,
  mutation-proven drift check, deleted files, before/after numeric evidence).
- Phase 0 contract-freeze work (including the intentionally failing partial-FOV
  test) comes first inside Phase 1 startup.

The authority flip (Phase 4) is explicitly **not** part of this decision; its
preconditions stay as listed in `07-authority-risk.md`.
