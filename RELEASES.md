# RELEASES.md - what each release shipped and how it was verified

The per-release records moved out of `AGENTS.md` (which had grown past the
workspace instruction budget and was being truncated). `AGENTS.md` keeps the
release PROCESS; this file keeps the RESULT of each release: tag, staged
artifact hashes, gate results, what was deployed and how it was verified live.

Newest first.

## 0.6.33 - 2026-09-15

**RELEASED as 0.6.33** - tag `v0.6.33` on the release commit `3c2f98a`, with the
curated `scripts/build_changelog.py` entry living IN that commit. Follow-up
`b390575` regenerated the tracked `landing/changelog.json` (**never moved the
tag**).

**What shipped.** The 0.6.32-review fix batch plus the shell-unification pass:
the web "tonight" pool gained the 45 standard-mode objects whose catalogue
magnitude is empty (the inline `o.vmag != null` filter - IC 1396, the Running
Man, NGC 281, the Flame, the Tulip, Simeis 147, the Double Cluster, the Pipe
Nebula and 38 more could never appear there), both shells now score through ONE
`core/scoring.js::scoreNightTracks` with the span as a parameter, the panorama
editor's snapshot/undo/redo/dirty model is ONE `core/panohistory.js` (the
desktop gained `#btnRedo`), the popularity source is no longer contacted anywhere (the
`--live` refresh flag is GONE, not disabled), the web shell ships a
Content-Security-Policy, and 74 review findings plus 6 investigated non-finding
items are closed or documented.

**Staged artifacts** (`dist/release/`): `NightSeam-0.6.33.zip` and
`NightSeam-latest.zip` (20,505,657 B, sha256
`c947dcd37af9c66688712284107eb574a3e0b2c1a102abd8c290c4050ba583ad`),
`version.json` (version 0.6.33, url `/downloads/NightSeam-0.6.33.zip`, size +
sha256 above), `ns-version.js` (`{"version": "0.6.33"}`), `NightSeam.exe`
(19.8 MB, rebuilt AT the tag with `build.ps1` - the release check correctly
refused to stage the earlier `0.6.32-3-g3277846-dirty` snapshot).

**Gates.**

* `python -m pytest tests/ -q` -> **598 passed** (0 failures).
* `python scripts/check_js.py` -> OK (imports, DOM ids, syntax on 81 modules,
  encoding, catalog token, the VERIFIED token baseline, core drift/purity).
* `python scripts/check_release.py` -> 0 errors at the tag, before staging.
* `python scripts/check_browser.py --all` -> **25/25** on the STAGED build
  (17 web checks incl. the new `web-tonight-pool-includes-unmagnituded-standard-rows`,
  and 8 desktop checks against the freshly built exe).
* `python scripts/check_browser.py --web --prod-url https://nightseam.de/astro/`
  -> **18/18** after upload.

**Deployed and verified live** (FTPS, Plesk):

* `/downloads/` - `NightSeam-0.6.33.zip` + `NightSeam-latest.zip` +
  `version.json` + `ns-version.js`; the LIVE zip was downloaded back and its
  sha256 equals the staged value byte-for-byte.
* `/astro/` - the whole web tree via `uploadtree` (index.html last, as the
  uploader orders it) plus `web/.htaccess` uploaded by hand (the uploader skips
  dotfiles). Live `/astro/version.json` = 0.6.33 / describe v0.6.33.
* `/` - the landing tree, so `/changelog.json` now carries the 0.6.33 entry
  (verified: newest entry 0.6.33).

**CSP caveat (measured, and the reason the check was relaxed).** The host
fronts static files with **nginx**, which serves `.html`/`.js`/`.css` itself and
never reaches Apache for them, so the `web/.htaccess` directives arrive only on
the paths nginx proxies: measured 2026-09-15, `/astro/version.json` carries the
policy and `/astro/`, `/astro/app.js`, `/astro/app.css` do not. `mod_headers` is
therefore working; the policy simply cannot cover the HTML without an nginx-layer
rule (Plesk > domain > Apache & nginx Settings > Additional nginx directives).
The production check now probes every path under the URL for the policy, treats
"the host serves it nowhere" as a printed NOTE rather than a hard failure (a
platform property this repo does not control), and still FAILS on a policy it
does find if that policy is unusable. The policy's CONTENT and its inline-script
hash are pinned offline by `tests/test_prod_csp.py`.

**Test-count and token register at this release:** 598 tests collected; web
tokens `app.js?v=87` / `CATALOG_TOKEN='10'` / astro 21 / horizon 54 / format 28 /
nightrank 20 / webstore 31 / dragwin 1 / style 24 / themes 5; core stub
`web/core.js?v=33` (current hash `7d2e90d5de153c46`, retained N-1
`21df8e451f20a165`, 10 core modules).

**Post-tag commits (never move the tag):** `b390575` (regenerated
`landing/changelog.json`) and the harness fix that relaxed the CSP probe
described above.

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
- **RELEASED as 0.6.31** - tag `v0.6.31` on the release commit (`93dccde`: the
  ranking-alignment + progress/layout-stability work plus the curated entry).
  Staged `dist/release/` (`NightSeam-0.6.31.zip` sha256
  `5a0fa461571800e78ab8600fa66ba616c59c17124f3de62600d37d335f37b633`, 20.5 MB, +
  latest + `NightSeam.exe` + `version.json` + `ns-version.js`), `check_release.py`
  **0 errors at the tag**, the FULL browser gate **22/22 on the staged build** (14
  web + 8 desktop, first run - no cold-start timeout) and **15/15 including the
  read-only production smoke** after the upload. Deployed `/downloads/` (zip,
  latest, exe, version.json, ns-version.js), `/astro` (whole tree, index.html
  last) and the landing. Verified live: `/astro/version.json` +
  `/downloads/version.json` + `ns-version.js` all read 0.6.31, the newest
  `changelog.json` entry is 0.6.31, the deployed `catalog.json` sha256 equals the
  local payload (`c44fd26a...`, 12,176 / 200 - unchanged again this release), the
  live `index.html` names `app.js?v=78` and `style.css?v=21`, the live `app.js`
  carries `cat-minvis`/`cat-stats`, `style.css` carries `.busy-slot` and
  `table-layout: fixed`, `nightrank.js` re-exports `nightStatsBatch`, and the
  published zip sha256 equals the staged artifact.
  What it fixes, all MEASURED in a real browser before/after: the catalog table
  used to widen the PAGE on a narrow viewport (page 721 px at a 360 px viewport ->
  now 360, scrolling inside its card); progress text ("computing visibility…") and
  the busy chip used to move the layout (the desktop topbar grew 93 -> 111 px and
  pushed the app down -> now constant via a reserved `.busy-slot` whose HEIGHT is
  reserved too, because at 1366 px the topbar already wraps); the catalog's
  percentage columns used to resize as cells filled in (`table-layout: fixed`).
  Also aligned: both shells now rank the tier over the set the current mode shows
  (`activeCatalog()` / `S.catalog`), proven on the real payload by
  `test_tier_letters_are_mode_independent_on_the_real_catalog`. **507 tests.**
  No core re-bake in this release (stub stays 23), so `/astro/core` gained no new
  dir; the four stale dirs from <= 0.6.26 are still unpruned. Follow-up commit
  `80f362f` regenerated the tracked `landing/changelog.json` (**never moved the
  tag**).
- **RELEASED as 0.6.32** - tag `v0.6.32` on the release commit (`2966a3c`: the
  `distance` removal + the designation-based Wikipedia lookup, with the curated
  entry). Staged `dist/release/` (`NightSeam-0.6.32.zip` sha256
  `41882ffc82b5c109bee1ca790ec828d4e4a9e248e29fe279585a06143b508e00`, 20.5 MB, +
  latest + `NightSeam.exe` + `version.json` + `ns-version.js`), `check_release.py`
  **0 errors at the tag**, the browser gate **22/22 on the staged build** and
  **15/15 including the read-only production smoke** after the upload. Deployed
  `/downloads/`, `/astro` and the landing; verified live: the version endpoints and
  `changelog.json` all read 0.6.32, the live `index.html` names `app.js?v=80`, the
  live `app.js` carries `CATALOG_TOKEN = '9'` AND `wikiTitles`, the deployed
  `catalog.json` sha256 equals the local payload (`ae002a9a...`, 12,176 rows, **no
  `distance` field**), and the published zips equal the staged ones.
  **A real deploy defect was caught here:** the first `/astro` tree upload stalled
  mid-way (the documented ProFTPD reuse behaviour) and left `core.js` pointing at
  the PREVIOUS baked tree, so a returning visitor would have loaded a core without
  `wikiTitles` and the app would have died on the missing named export. The verify
  pass found it, `core.js` + `catalog.json` were re-uploaded on fresh connections,
  and a new check (`logs/verify_tokens_live.py`) now compares EVERY live module and
  the whole baked core tree byte-for-byte against the repo - it passes with
  `STALE: none`.
  Also noted: `desktop-pano-crop-fov` timed out at 30 s on two consecutive full gate
  runs (31.9 s) and then passed in 2.9 s on the next one with the SAME preceding
  checks, and in 2.9 s standalone - the upload/decode budget is flaky, so its wait
  is 90 s now (`d6ace7a`, a post-tag test-only commit; the staged artifacts were
  built at the clean tag and are unaffected). Follow-up `4d8ce4d` regenerated the
  tracked `landing/changelog.json` (**never moved the tag**).
