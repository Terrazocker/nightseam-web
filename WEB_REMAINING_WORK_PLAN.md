# Remaining website implementation and acceptance plan

October 7, 2026. Continue on the existing branch and preserve uncommitted work.
The open-workspace/Advanced Catalog plan is complete. This file and the roadmap
are the authority for the remaining website pass; sibling catalog work is outside
scope. Work locally through review and preparation; publication requires its
separate authorization. Never manufacture a clean version, reuse a release tag
or label automated accessibility checks as a human screen-reader audit.

## 1. Startup performance (Phase 5)

- [x] Record comparable cold/warm/slow-network startup time, transferred bytes
  and compression. Separate locally simulated server behavior from live hosting.
- [x] Remove optional provenance from the critical startup path. Use one lazy
  owned request with truthful loading/failure/retry states for source disclosure
  and export. Never export empty placeholder data as authoritative provenance.
- [x] Prepare token-aware cache/compression configuration for both public and
  planner pages; document the nginx/Apache boundary and live verification.
- [x] Re-measure the same scenarios and verify sidecar failure does not block
  planner operation. Preserve catalog bytes/counts/IDs/provenance authority.

## 2. Diagnostics and documented calculation boundaries

- [x] Make browser diagnostics safe on restrictive console encodings while
  preserving ordinary failure vs infrastructure failure exit categories.
- [x] Investigate local refused-module requests; add evidence that identifies
  server health/lifecycle failures without retrying or skipping checks.
- [x] Resolve elevation semantics explicitly as metadata without a horizon-dip
  correction; make the UI/help limitation clear and verify planning invariance.

## 3. Release preparation (Phase 6)

- [x] Correct recursive deployment ordering, with a regression proving every
  module/data dependency uploads before any HTML entry point.
- [x] Prepare a locally reviewable release bundle/manifest, curated independent
  0.1.0 notes, concrete publication and rollback steps, and explicit legacy-photo
  cleanup paths. Keep current plus N-1 core locally and preserve older production
  core assets used by cached clients. Do not contact production for mutation.
- [x] Keep dirty git-describe truthful; identify inherited-tag conflicts and
  release actions that need owner approval rather than guessing a clean release.

## 4. Integrated website review and documentation

- [x] Review all six public pages and four planner views at desktop/phone widths,
  first/return visit, keyboard/focus, enlarged content, saved sites/rigs/horizons,
  backup restore and external-service failure. Inspect screenshots.
- [x] Address confirmed review findings. Run focused checks while editing,
  then full pytest once, full browser gate, JS/core/catalog/cache/release guards.
- [x] Consolidate the current backlog; correct stale version/history/design/
  release commands and mark old concept plans historical without erasing evidence.
- [x] Update DESIGN/DEVELOPMENT/DECISIONS/BUGS/RELEASES and the roadmap with actual
  outcomes and a final review report. Keep capability/external dependencies honest.

## 5. Scope definition and external acceptance preparation

- [x] Define a proposed ephemeris/seeing scope and data/provider requirements.
  The optional clarification received no answer; FUTURE_FEATURE_SCOPE.md records
  the separate-feature assumption. Do not invent precision or source coverage.
- [x] Record whether actual screen-reader/native-browser-zoom acceptance can be
  performed in the available environment. If it cannot, retain a concrete manual
  acceptance checklist and the exact limitation rather than claim completion.
- [x] Present the concrete prepared publication result for separate deployment
  authorization; live server configuration, cleanup and smoke checks follow it.

## Final status

All implementation/preparation items above are complete locally; checked preparation
items do not mean public deployment or human acceptance has occurred. Final gate:
288 pytest passed (one existing optional-data skip), 50/50 browser passed.
WEBSITE_FINAL_REVIEW.md and RELEASES.md record results and limitations.

- [ ] Human AT/native zoom acceptance using ACCESSIBILITY_ACCEPTANCE.md.
- [ ] Review/commit/new clean tag and separately authorized public deployment.
- [ ] Verify actual host headers, live smoke, rollback backup and retired-file cleanup.
- [ ] Decide whether to commission separately scoped future features.

Historical local browser refusal causation remains monitoring-only in BUGS.md.
