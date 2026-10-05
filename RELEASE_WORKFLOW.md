# Independent website release workflow

The website owns its existing 0.6.x release history. The catalog has its own
repository, tags and packages; none are inputs to this release.

## Prepare and validate locally

1. Refresh origin and compare the working branch with master. Integrate only
   after reviewing any remote changes; prefer a fast-forward when possible.
2. Verify a fresh Windows checkout preserves hash-paired seed/payload bytes;
   .gitattributes must prevent line-ending conversion for those data files.
   Curate scripts/build_changelog.py for the final website behavior. Prepare
   landing/changelog.json before the release commit, with the candidate version,
   the release commit's date and the same curated summary. Historical entries
   remain generated from their actual tags.
3. Run the full pytest suite, scripts/check_browser.py --web, and relevant
   release/curation tests. Record actual results in RELEASES.md.
4. Run scripts/check_release.py --allow-dirty --no-stage before staging changes.
   Review and commit the release preparation; fast-forward local master.
5. Run scripts/pre_tag_check.py X.Y.Z before creating a new vX.Y.Z tag. Never
   move an existing tag. Run scripts/make_release.py at the clean new tag.
6. Run scripts/build_changelog.py at the tag and verify it changes no tracked
   bytes. Check the web stage with scripts/check_release.py and archive the
   manifest/results under ignored logs/. Staging contains the web planner;
   landing files remain separately reviewed deployment inputs.

## Publication is a separate step

Public website deployment requires user authorization after the local result is
reviewable. Push the reviewed branch/tag only when publishing is authorized.
Upload web to /astro and landing to / using web/ftps_deploy.py; its ordering must
upload modules before HTML. Credentials stay outside Git.

Preserve existing deployed core hash directories needed by cached clients.
The model-retirement manifest exception has no previous local tree; do not use
that as authority to delete old production trees. After upload, verify live
version/module/catalog/core bytes and run the read-only production browser smoke.
Do not describe a locally tagged/staged release as publicly deployed.
