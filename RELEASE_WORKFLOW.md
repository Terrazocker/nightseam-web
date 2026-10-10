# Independent website release workflow

Current authority, October 10, 2026. The owner reset the public website series to
0.1.0. scripts/build_changelog.py PUBLIC_RELEASES owns that public ledger; inherited
Git tags and historical CURATED summaries remain evidence and do not restore old
public entries. The catalog's source, tags and packages are independent.

v0.1.1 is released on GitHub and deployed (October 8, 2026), following the
initial v0.1.0 release on October 7. RELEASES.md
records exact acceptance and cleanup. Future releases use a new unused version;
do not rerun the initial tag creation or move v0.1.0. Host compression and human
AT acceptance remain open separately from publication.

## Reviewable local candidate

1. Preserve the working branch and unrelated uncommitted work. Read
   WEB_REMAINING_WORK_PLAN.md and the final receipt in RELEASES.md.
2. Run full pytest once after final changes; run scripts/check_browser.py --web,
   scripts/check_js.py and scripts/check_release.py --allow-dirty --no-stage.
   Browser failures stay failures; infrastructure failures are never skips.
3. Curate the next independent version, then run scripts/pre_tag_check.py for
   that new version. The independent ledger starts at 0.1.0 and includes subsequent releases;
   append truthful entries for future releases before committing/tagging. Keep all module/catalog/provenance tokens,
   references, core hashes and current plus N-1 retention aligned.
4. python scripts/prepare_publication.py creates dist/publication-preview with
   both web and landing immutable release graphs, canonical HTML pointing to
   those graphs, complete source/payload SHA256 manifests and an explicit legacy
   cleanup list from scripts/publication_cleanup.json, which survives committing
   the deletions. It never reads/uploads credential files, commits, tags or deploys.
   python scripts/prepare_publication.py --verify detects source/stage drift.
   All served artifacts must be Git-tracked, except generated web/version.json;
   staging refuses symlinks and untracked content of every file type.
5. This dirty candidate is a local review snapshot, not a clean public release.
   web/version.json must remain truthful to git describe including --dirty.
   Human screen-reader/native-zoom acceptance follows ACCESSIBILITY_ACCEPTANCE.md.

## Clean independent release

Review the final diff, commit the accepted preparation and choose a fresh
independent release tag only after pre_tag_check passes. Never move inherited tags.
The initial v0.1.0 was created October 7; check local and remote tags before
choosing the next unused version.
Do not fast-forward or push other branches without reviewing their current state.
Generate and commit curated history before tagging. At the clean new tag run
python scripts/make_release.py to bake version and stage; check history consistency
without changing tracked bytes. Run scripts/check_release.py against the clean
web stage, then regenerate/verify the combined publication candidate. Record exact
commit/tag/hash and evidence. No dirty snapshot may be advertised as that release.

## Publication and rollback

Public deployment, host configuration and cleanup require separate owner
authorization for the concrete reviewed candidate. Credentials remain outside Git.

Before publishing, inventory and back up the existing remote HTML, version, assets,
legacy image/attribution files and core directories using read-only FTPS operations.
Keep the backup outside shipped trees. Do not rely on the local N-1 tree alone:
older production core hashes may still be referenced by cached clients.

Apply the prepared host policy only through supported provider controls; see
HOSTING_CONFIGURATION.md for the nginx/Apache boundary and required live evidence.
Publish the validated combined bundle with
python web/ftps_deploy.py publish dist/publication-preview / --env <credential-path>.
For a planner-only clean release, use dist/web-release with the same remote root.
The remote root is the FTP directory corresponding to the public document root;
web files map beneath astro/ and landing files map directly beneath it.
Raw upload/uploadmany/uploadtree commands refuse mutable website files.

The publisher validates local inventory and hashes before connecting. It installs
content-addressed releases via verified temporary uploads and atomic FTP rename,
refuses conflicting existing immutable bytes, and verifies the entire new graph
before atomically renaming each public HTML entry. Per-page switches may span
releases, but every page references one complete graph. Failed uploads can be
retried; no old namespace or legacy mutable dependency is overwritten or removed.
The server must support atomic replacement by FTP rename. Existing root .htaccess
must match or publication refuses before uploading; review any policy migration
separately through the supported provider controls.

Run read-only production smoke and compare decoded version/module/catalog/core
hashes, live gzip/cache headers, current plus cached/return visits, photos and
representative planning. Only then review publication.manifest.json's explicit
cleanup paths: the 81 retired object JPEGs and /astro/image-attributions.json.
Remove only verified retired paths after authorization; never delete all /astro/img,
remote core directories or unknown files. Keep backups for rollback.

If acceptance fails, stop cleanup. Re-publish the previous verified immutable
bundle to restore its public HTML/version entries; retained release directories
already contain its dependencies. During the first migration from legacy mutable
paths, retain the read-only backup and use the provider's authorized restore to
restore prior HTML/version entries after verifying retained legacy dependency
hashes. Restore any retired images used by that release and prior host settings
if they caused the problem. Smoke-check the restored site. Keep old namespaces
and core hashes for cached/open clients. Document actual outcomes; upload success
alone is not acceptance.

Do not describe local fixes, staging, or a tag as public deployment. A11Y-001 and
live delivery/publication gates remain explicit until their evidence is recorded.
