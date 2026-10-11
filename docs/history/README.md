# Historical website plans, reviews and logs

Nothing here is current guidance. Current status and next steps are in
[ROADMAP.md](../../ROADMAP.md), open defects in [BUGS.md](../../BUGS.md),
validation receipts in [RELEASES.md](../../RELEASES.md) and the publication
procedure in [RELEASE_WORKFLOW.md](../../RELEASE_WORKFLOW.md). These files keep
their dated descriptions, original instructions and acceptance evidence.

Website plans (October 2026):

- [Website overhaul](WEBSITE_OVERHAUL_PLAN.md)
- [Open workspace design](WEB_OPEN_DESIGN_IMPLEMENTATION_PLAN.md)
- [Remaining overhaul work](WEB_REMAINING_WORK_PLAN.md)
- [Annotation improvements](WEB_ANNOTATION_IMPLEMENTATION_PLAN.md)
- [Original integrated review](WEBSITE_FINAL_REVIEW.md)
- [Previous roadmap/backlog](IMPLEMENTATION_PLAN.md) and
  [future feature scope](FUTURE_FEATURE_SCOPE.md), condensed into ROADMAP.md
- [Review remediation plan](REVIEW_REMAINING_IMPLEMENTATION_PLAN.md)

Horizon/panorama (completed phases; the open P3-P7 plan is in ../horizon/):

- [Improvement phases 1-5](HORIZON_PANORAMA_IMPROVEMENT_PLAN.md)
- [Simplification A-F](HORIZON_PANORAMA_SIMPLIFICATION_PLAN.md)

Reviews and logs:

- [Workspace audit, October 10](WORKSPACE_AUDIT_REPORT.md)
- [Documentation review, October 11](WORKSPACE_DOCUMENTATION_REVIEW.md)
- [Findings log](BUGS_LOG.md) — dated findings formerly in BUGS.md
- [Development log](DEVELOPMENT_LOG.md) — dated notes formerly in DEVELOPMENT.md
- [Combined-project releases](RELEASES_COMBINED_PROJECT.md) — receipts from
  before the October 1, 2026 repository split

## October 10, 2026 workspace cleanup

The old ui-concepts/ corpus described the former combined desktop/web project
and Glass alternatives. Its screenshot capture script depended on removed desktop
helpers. No current website code or tests use that corpus or tests/_util.py's
FITS builders. They were removed from the active tree after a verified archive.
Their tracked versions remain available in Git at commit
df76fc257691165fd3725b8a724e01440d797942 (original paths ui-concepts/ and tests/_util.py).

Stale ignored dist/ publication/release candidates were archived too; they are
historical snapshots and must not be published as current source. Recreate a
candidate with scripts/prepare_publication.py after validation.

Local recovery archive: logs/workspace-cleanup-20261010/obsolete-assets-and-candidates.zip.
Its archive-manifest.json records 218 files, per-file SHA-256 and archive SHA-256;
all entries were verified against source bytes before removal. This archive is
ignored local evidence, not part of the website or a substitute for Git history.

Disposable pytest scratch and Python caches were cleared. Repository-split
recovery snapshots, deployment rollback backups/receipts, reference fixtures,
validation logs and the current plus N-1 core trees were retained.
