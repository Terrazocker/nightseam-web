# Workspace and documentation review

October 11, 2026. Review of the canonical NightSeam website workspace after the
Horizon accuracy follow-up. This report is separate from the pre-existing
WORKSPACE_AUDIT_REPORT.md, which was not modified. No sibling/archive source,
credentials or remote deployment state was inspected for this review.

## Overall assessment

The repository has clear implementation boundaries and unusually detailed
decision/validation evidence. Its strongest documentation covers core authority,
backup rollback, cache/content hashes, release/publication safety and separation
from the independent Windows catalog. The main weakness was finding the current
status among several overlapping dated plans, followed by missing development
setup details. The repairs below improve navigation without rewriting history.

The inspected runtime/build imports respect web/landing/core/catalog_data
ownership. No sibling, deprecated archive, SQLite, FastAPI or npm dependency was
found in the inspected active paths. This is a scoped review, not a proof over
every possible execution path. Generated-core/hash, syntax, release and actual
browser checks provide separate mechanical evidence in RELEASES.md.

## Documentation repairs made

| Gap | Repair |
| --- | --- |
| Original Horizon plan still called A–C a future proposal | Linked current local implementation, remaining D–F and accuracy research |
| README/backlog omitted active Horizon work | Added current status, research and owner-acceptance links |
| Missing test-dependency bootstrap | Explained requirements-dev.txt, standard-library build tooling, Node.js and installed Chrome |
| Missing serial-test rule | README and ENVIRONMENT explain that drift tests temporarily replace shipped modules; full pytest must run separately from other gates |
| Architecture/decisions/receipts hard to discover | Added a compact documentation map in README and a current-navigation note in DEVELOPMENT |
| Provenance command appeared usable in an ordinary checkout | CATALOG separates routine neutral-source builds from regeneration requiring exact upstream CSVs |

Relative Markdown links in 25 existing documentation files were scanned
during review with no broken paths found. The new/edited navigation was checked
separately: 21 root documents, zero missing relative targets (excluding the
unknown existing audit report). That validation is recorded in RELEASES.md. Historical
desktop/version entries remain intentionally dated. Current format/token
authority is AGENTS.md and the core manifest, not an old receipt.

## Workspace health

- Current core and previous core are retained through the builder; generated
  files are not hand-edited. Entry-point cache references are updated recursively.
- The inspected Git inventory contains no tracked logs/dist/.env artifacts.
  Logs, scratch, local candidates and generated version files are ignored.
- Publication inventory excludes helpers, credentials and development directories;
  shipping assets must be tracked. Local candidates remain separate from a clean
  tagged/public release. No new publication authority was inferred.
- The working tree contains earlier authorized local changes alongside this
  follow-up. Uncommitted/staged work is not a defect, but it is not a published
  release. No blanket cleanup, commit, push or deployment was performed.
- Tests preserve astronomy anchors and backup/history behavior. Actual counts and
  limitations are in RELEASES.md, rather than inferred from file inventory.

## Remaining improvements

The subsequent sampling follow-up updated the current architecture, decisions,
findings, research and phase status together. A read-only consistency review
found two stale status sentences; both were corrected. The root relative-link
check covered 21 documents with zero missing targets, excluding the unknown
prior audit. Final software outcomes are recorded in RELEASES.md.

1. Narrow-obstacle sampling and skyline row rounding were subsequently corrected
   locally. Keep the remaining raster and single-sky-band limitations explicit;
   BUGS.md and HORIZON_ACCURACY_RESEARCH.md describe the policy and open work.
2. Complete real-photo/device/accessibility acceptance. Supported projection and
   multi-reference work was subsequently implemented under D/E, with F software
   outcomes recorded in RELEASES.md. Synthetic browser checks are not physical
   calibration or screen-reader acceptance. Unsupported lens/stitching models
   and painted-record remapping remain explicit limitations.
3. Consider an automatically generated contents/index for the long DEVELOPMENT,
   DECISIONS and RELEASES records. Preserve dated evidence rather than replacing
   it with an unsupported summary.
4. Large presentation modules remain (app.js around 4,300 lines, horizon.js around
   2,200 at inspection). Extract coherent UI responsibilities when future changes
   justify it; keep math in core. This review did not prove a defect from size alone.
5. No tracked CI configuration was found. Adding automated enforcement of the
   documented gates is a future improvement; Windows browser requirements and
   serial mutation tests need an explicit runner policy.

The existing public-host compression and human-accessibility gates remain open
in IMPLEMENTATION_PLAN.md. This local review did not recheck public host policy.
