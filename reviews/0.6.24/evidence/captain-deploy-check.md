# Captain deploy check (read-only) - evidence for XL-01 (t4) and H1 (t3)

Purpose: the severity of two high-profile claims depends on what is actually deployed,
not on what the repo contains. The lanes could not settle this from inside the sandbox
(the web lane's browser gate died on a Playwright PermissionError WinError 5), so the
captain ran the read-only checks and records the raw facts here for t7 to re-verify.

Baseline: HEAD 9596878, `git describe` = v0.6.24-2-g9596878. All commands below are reads;
no production file was modified. `git status --porcelain` = `?? .agent-teams/` + `?? reviews/`.

## Method

    python web/ftps_deploy.py --env <workspace>\Astro-Web\ftp.env download /astro/index.html reviews/0.6.24/evidence/deployed-index.html
    python web/ftps_deploy.py --env <workspace>\Astro-Web\ftp.env download /astro/app.js    reviews/0.6.24/evidence/deployed-app.js
    python web/ftps_deploy.py --env <workspace>\Astro-Web\ftp.env list /astro/core
    Get-FileHash web/app.js -Algorithm SHA256   # vs the downloaded copy
    git grep -n "app.js?v=" v0.6.24 -- web/index.html
    git grep -n "astro.js?v=\|horizon.js?v=\|webstore.js?v=\|format.js?v=\|nightrank.js?v=\|core.js?v=" v0.6.24 -- web/app.js
    git grep -n "app.js?v=" HEAD -- web/index.html
    git tag --contains 208f7d6
    git ls-tree -d --name-only v0.6.23:web/core

Note: `https://nightseam.de/astro/version.json` answers with a cross-origin redirect; use
`https://www.nightseam.de/astro/version.json` directly. `web_fetch` renders index.html to
text and DROPS the `<script src>` tag, so the token must be read from the FTP copy.

## Observed facts

| # | Fact | Evidence |
|---|---|---|
| F1 | Live `/astro/index.html` names `app.js?v=60` | `deployed-index.html:211` |
| F2 | Live `/astro/app.js` is BYTE-IDENTICAL to HEAD `web/app.js` | SHA256 `30F61EE337D2127D04C24D43AE9CC0A62D8E0C57120E4388149FC7DAD5D24623` on both |
| F3 | Live `app.js` imports `astro.js?v=10`, `horizon.js?v=41`, `webstore.js?v=20` | `deployed-app.js:11-13` - the HEAD token set |
| F4 | Live `/astro/version.json` = version 0.6.24, describe v0.6.24, built `2026-09-12T16:02:43+00:00` | HTTP 200 fetch |
| F5 | The v0.6.24 TAG names `app.js?v=59` and imports `astro 9 / horizon 40 / webstore 19 / format 16 / nightrank 6` (only `core.js?v=17` bumped) | `git grep` at `v0.6.24` |
| F6 | HEAD names `app.js?v=60` | `git grep` at HEAD |
| F7 | The bump commit `208f7d6` is NOT contained in any tag; `v0.6.24..HEAD` = `208f7d6`, `9596878` | `git tag --contains 208f7d6` empty |
| F8 | Live `/astro/core/` carries THREE baked dirs: `784ef08ceaafccf7`, `97c2e182fb0a5630`, `79ad99ef15810ca2` | FTP `list` |
| F9 | The repo tracks exactly ONE baked dir per tree: `97c2e182fb0a5630` | `Get-ChildItem -Directory -Name web/core`, `git ls-tree HEAD:web/core` |
| F10 | `79ad99ef15810ca2` is the v0.6.23 dir | `git ls-tree -d --name-only v0.6.23:web/core` |

## What this means for the two claims

**XL-01 (t4, claimed high: returning visitors keep the 0.6.23 modules and lose the 0.6.24 crop UI).**
F1-F3 refute the USER-REACHABLE half as of this check: the deploy was made from the post-fix
tree, so `index.html` requests `?v=60` (a URL the 0.6.23 visitor does not have cached), and
the live `app.js` is byte-identical to HEAD with the bumped dependency tokens, so the crop UI
(in `horizon.js`) is delivered. What F5-F7 CONFIRM is a release-artifact/process defect: the
v0.6.24 TAG is internally inconsistent (0.6.23 tokens naming 0.6.24 bytes), the documented
release order bakes artifacts while HEAD is at the tag, a deploy made from that tag WOULD
silently under-deliver, and no guard compares bytes against tokens
(`tests/test_cache_tokens.py` only pins register == source). This is therefore a real finding
whose severity must be set from process/release impact, not from current visitor harm.

**H1 (t3, baked-core N-1 retention).** F8-F10 settle the deploy half: production DOES carry
N-1 (`79ad99ef15810ca2`), so the stated purpose - a visitor holding a cached old `core.js`
stub must still resolve its tree - is satisfied live. Two residual divergences for the core
lane to frame honestly: the repo tracks only the current dir (no N-1 on disk, so a wiped and
re-uploaded /astro would lose the fallback), and the deploy additionally still carries
`784ef08ceaafccf7`, i.e. an older-than-N-1 dir that AGENTS.md says to remove at the next
re-bake, which `check_core.py` cannot see because it only inspects the local tree.

## For t7

These are captain-supplied observations, not verified findings: re-run the commands above
independently and record your own result before admitting or refuting either claim. The two
downloaded files are untouched byte copies kept as raw evidence.
