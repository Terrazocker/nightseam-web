# RELEASES.md - what each release shipped and how it was verified

The per-release records moved out of `AGENTS.md` (which had grown past the
workspace instruction budget and was being truncated). `AGENTS.md` keeps the
release PROCESS; this file keeps the RESULT of each release: tag, staged
artifact hashes, gate results, what was deployed and how it was verified live.

Newest first.

  **RELEASED as 0.6.25** - tag `v0.6.25` on the release commit (the curated entry
  and the build fix live in it), staged artifacts in `dist/release/`
  (`NightSeam-0.6.25.zip` + `NightSeam-latest.zip` + `version.json` +
  `ns-version.js`), `check_release.py` 0 errors, the FULL browser gate **19/19 on
  the staged build** (12 web + 7 desktop against the fresh exe), and after the
  upload the live site passes the read-only production smoke (**13/13**,
  `check_browser.py --web --prod-url https://nightseam.de/astro/`). Deployed:
  `/downloads/` (zip, latest, version.json, ns-version.js), `/astro` (whole tree,
  index.html last) and the landing (with the regenerated changelog.json). The gate
  needs ONE unsandboxed command (Chromium's mojo named pipes); sandboxed, `TO-02`
  makes it report exit 2 honestly instead of a fake "failed check(s)".
- **RELEASED as 0.6.26** - tag `v0.6.26` on the release commit (`d412998` catalog
  rebuild + `ea86a3a` the curated entry), staged `dist/release/`
  (`NightSeam-0.6.26.zip` sha256 `cd0d2bc5...` + `NightSeam-latest.zip` +
  `version.json` + `ns-version.js`), `check_release.py` **0 errors at the tag**,
  the FULL browser gate **19/19 on the staged build** and **13/13 including the
  read-only production smoke** after the upload. Deployed `/downloads/` (zip,
  latest, exe, version.json, ns-version.js), `/astro` (whole tree, index.html
  last) and the landing. Verified live, not assumed: `/astro/version.json` +
  `/downloads/version.json` + `/downloads/ns-version.js` all read 0.6.26, the
  deployed `catalog.json` sha256 equals the local payload, the published zip
  equals the staged artifact, the live tokens are `app.js?v=70` /
  `CATALOG_TOKEN = 5`, and the live copy reads 12,160 with no stale "197".
  Follow-up commit `408dab5` regenerated the tracked `landing/changelog.json`
  (**never moved the tag**).
- **RELEASED as 0.6.27** - tag `v0.6.27` on the release commit (`348b015` the
  popularity/label/migration work + `b7cf4de` the curated entry), staged
  `dist/release/` (`NightSeam-0.6.27.zip` sha256 `383faa68...` + latest +
  `version.json` + `ns-version.js`), `check_release.py` **0 errors at the tag**,
  the FULL browser gate **19/19 on the staged build** and **13/13 including the
  read-only production smoke** after the upload. Deployed `/downloads/`,
  `/astro` (index.html last) and the landing; verified live (`/astro/version.json`
  + `/downloads/version.json` + `ns-version.js` = 0.6.27, the deployed
  `catalog.json` sha256 equals the local payload, the published zip equals the
  staged artifact). Follow-up commit `f816a00` regenerated the tracked
  `landing/changelog.json` (**never moved the tag**).
- **RELEASED as 0.6.28** - tag `v0.6.28` on the release commit (`4bcbcd9` the
  7-object supplement + the CATALOG.md/DECISIONS.md docs, `e3bcb38` the curated
  entry), staged `dist/release/` (`NightSeam-0.6.28.zip` sha256 `57b47519...` +
  latest + `version.json` + `ns-version.js`), `check_release.py` **0 errors at the
  tag**, the FULL browser gate **19/19 on the staged build** and **13/13 including
  the read-only production smoke** after the upload. Deployed `/downloads/`,
  `/astro` (index.html last) and the landing; verified live (`/astro/version.json`
  + `/downloads/version.json` + `ns-version.js` = 0.6.28, the deployed
  `catalog.json` equals the local payload AND carries all seven supplement ids,
  the published zip equals the staged artifact). Follow-up commit `f45b1d0`
  regenerated the tracked `landing/changelog.json` (**never moved the tag**).
  **Gate note:** the first `--all` run on the freshly built onefile exe failed
  `desktop-pano-crop-fov` with a 30 s wait timeout (32.5 s) because PyInstaller
  unpacks the ~20 MB exe to %TEMP% on first launch; the immediate re-run passed
  7/7 (3.1 s). A cold-start timeout right after a build is that, not a regression -
  re-run the gate before investigating.
- **RELEASED as 0.6.29** - tag `v0.6.29` on the release commit (`365dc0e`: the
  nine-object supplement batch 2 + the copy/doc updates; the curated entry is in
  the same commit). Catalogue **12,167 -> 12,176** (supplement 7 -> 16), staged
  `dist/release/` (`NightSeam-0.6.29.zip` sha256 `c43e85a41f4f87015a7cb1e0ef308f59dc1385a02662f634ddbc2bcc6a6744dc`,
  20,483,677 bytes, + latest + `NightSeam.exe` + `version.json` + `ns-version.js`),
  `check_release.py` **0 errors at the tag**, the FULL browser gate **19/19 on the
  staged build** (12 web + 7 desktop against the fresh exe - no cold-start timeout
  this time) and **13/13 including the read-only production smoke** after the
  upload. Deployed `/downloads/` (zip, latest, exe, version.json, ns-version.js),
  `/astro` (whole tree, index.html last) and the landing. Verified live, not
  assumed: `/astro/version.json` + `/downloads/version.json` +
  `/downloads/ns-version.js` all read 0.6.29, the deployed `catalog.json` sha256
  **equals the local payload** (`c44fd26a...`, 12,176 rows / 200 standard) AND
  carries all nine new ids with the `Squid` alias intact, and the published zip
  sha256 equals the staged artifact. Tokens: `app.js?v=74` (index.html) /
  `CATALOG_TOKEN = 8` + manifest, baseline refreshed for the one moved token.
  Popularity 7,645 -> **7,654** (the nine new rows; no existing score touched).
  All nine entered Standard mode on their own scores (29,490 / 25,230 / 22,630 /
  14,110 / 9,790 / 8,230 / 6,780 / 5,200 / 2,188, cut 1,751), displacing nine
  members: `ngc6526`, `ngc3992` (M109), `ngc6121` (M4), `ic63`, `ic1871`,
  `ngc2246`, `ngc6905`, `ngc2362`, `ngc6231` - the documented consequence of
  `STANDARD_TOP_N = 200`, accepted deliberately (see `DECISIONS.md`).
  Follow-up commit `809de12` regenerated the tracked `landing/changelog.json`
  (**never moved the tag**); `RELEASES.md` record in the next commit.
- **RELEASED as 0.6.30** - tag `v0.6.30` on the release commit (`d47d019`: the popularity
  TIER column + frame-coverage colours + Min-visibility slider in BOTH apps, plus the
  curated entry in the same commit). Staged `dist/release/`
  (`NightSeam-0.6.30.zip` sha256
  `4204eda2668057e73093c8312a0cc2cb1f5778e74c710fcf52ab6c2b0c60d576`, 20.5 MB, + latest +
  `NightSeam.exe` + `version.json` + `ns-version.js`), `check_release.py` **0 errors at the
  tag**, the FULL browser gate **21/21 on the staged build** (13 web + 8 desktop - the
  desktop suite gained `desktop-catalog-tier-minvis`, and the web check now drives the
  slider too) and **14/14 including the read-only production smoke** after the upload.
  Deployed `/downloads/` (zip, latest, exe, version.json, ns-version.js), `/astro` (whole
  tree, index.html last) and the landing. Verified live, not assumed:
  `/astro/version.json` + `/downloads/version.json` + `/downloads/ns-version.js` all read
  0.6.30, `landing/changelog.json`'s newest entry is 0.6.30, the deployed `catalog.json`
  sha256 equals the local payload (`c44fd26a...`, 12,176 rows / 200 standard - the payload
  itself did not change in this release), the live `index.html` carries `app.js?v=76`, the
  live `app.js` carries `CATALOG_TOKEN = '8'` plus the new `cat-minvis` control, `style.css`
  the `.tier-badge`/`.over` rules and `nightrank.js` the `nightStatsBatch` re-export, and the
  published zip sha256 equals the staged artifact.
  The core was re-baked twice (stub 21 -> 23, the tier helpers), so the token cascade touched
  every web module - final register: app 76 / astro 15 / horizon 47 / format 22 / nightrank 13
  / webstore 25 / style 18 / core 23. **503 tests.** Follow-up commit `c16e54f` regenerated
  the tracked `landing/changelog.json` (**never moved the tag**).
  **Gate note:** `dist/NightSeam.exe` was rebuilt with `-AllowDirty` mid-work to verify the
  desktop UI in a real browser before the release (it reported `0.6.29-2-ge4e92c1-dirty`), and
  the first `--all` run on that build hit the documented PyInstaller cold-start timeout on
  `desktop-pano-crop-fov`; the immediate re-run passed (2.9 s). The released exe was then
  rebuilt CLEAN at the tag (`0.6.30`) and the staged gate passed 21/21 first time.
