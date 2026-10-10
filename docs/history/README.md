# Historical website plans and retired assets

Current implementation/backlog authority is [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md)
and [REVIEW_REMAINING_IMPLEMENTATION_PLAN.md](../../REVIEW_REMAINING_IMPLEMENTATION_PLAN.md).
[RELEASES.md](../../RELEASES.md) records actual validation and deployment;
[RELEASE_WORKFLOW.md](../../RELEASE_WORKFLOW.md) defines current publication.

These completed plans retain their dated descriptions, original instructions and
acceptance evidence. They are not current implementation or deployment guidance:

- [Website overhaul](WEBSITE_OVERHAUL_PLAN.md)
- [Open workspace design](WEB_OPEN_DESIGN_IMPLEMENTATION_PLAN.md)
- [Remaining overhaul work](WEB_REMAINING_WORK_PLAN.md)
- [Annotation improvements](WEB_ANNOTATION_IMPLEMENTATION_PLAN.md)
- [Original integrated review](WEBSITE_FINAL_REVIEW.md)

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
