# Docs lane - documentation vs reality

Subject: `v0.6.32-3-g3277846` (HEAD `3277846` "release record: 0.6.32"), tree clean
apart from untracked `REVIEW-PROMPT.md` and `reviews/0.6.32-full/`. Re-checked at the
end: unchanged (`git status --porcelain` shows only those two).

Method: read the current-behaviour documents (`AGENTS.md`, `README.md`, `CATALOG.md`,
`DESIGN.md`, `web/index.html`, `landing/*.html`), then verify each factual claim
against the authoritative artifact by execution - `python main.py --version`,
`python scripts/check_js.py`, `python scripts/check_browser.py --list`,
`python scripts/build_changelog.py --check`, `python -m pytest tests/ --collect-only -q`,
`git grep`, and four probes under `evidence/docs/` (`counts.py`, `numbercheck.py`,
`identcheck.py`, `pathcheck.py`). Historical documents (`RELEASES.md`, `AUDIT*`,
`reviews/`, `*REPORT*.md`) were read only to avoid re-filing settled items.

Disclosure: `python scripts/build_adv_catalog.py` was run to prove the documented
pipeline counts. It rewrote `app/data/openned.csv` with byte-identical content
(`git status --porcelain` and `git diff` clean afterwards) - the tree is unmodified.

## Findings

### DOC-01 medium CONFIRMED - `AGENTS.md`'s opening blurb still calls the astronomy "pure-Python", the one layer the project spent a release deleting; an agent reading the contract's first paragraph looks for or re-creates the wrong implementation.
- doc: `AGENTS.md:14` ("UI, pure-Python Meeus astronomy (no numpy/astropy)") vs reality: `AGENTS.md:44-45` + `app/` + `core/`
- **impact:** the blurb is the first thing any agent session reads (it is re-injected as workspace instructions). It says the astronomy is Python; the same file's Phase C section and the tree say the Python astronomy modules were DELETED in 0.6.20 and `core/` is the only implementation. A reader/agent acts on the blurb: looks for `app/astro.py`, or worse re-adds astronomy math to `app/` - which `scripts/check_core.py` then fails (`check_core: OK` today, i.e. the guard is live). Severity is set by the misleading-layer test, not by user impact: no user sees this.
- **mechanism:** the blurb is a pre-0.6.20 summary; 0.6.20's Phase C removed the Python math and the blurb was never reworded.
- **evidence:** `Test-Path app/astro.py, app/planning.py, app/nightcalc.py` → `False, False, False`; `Get-ChildItem core -Name` → 9 modules (`astro.js`, `planning.js`, ...); `AGENTS.md:44` "The Python math modules (`app/astro.py`, `app/planning.py`, `app/nightcalc.py`) ... are DELETED". The same blurb also claims "Works fully offline except optional Wikipedia images", which `static/js/weather.js:49` and `static/js/updater.js` contradict (see DOC-03).
- **repro:** `Select-String AGENTS.md -Pattern 'pure-Python'`; `Test-Path app/astro.py`; read `AGENTS.md:44`.
- **requiredFix:** rewrite `AGENTS.md:13-16` to say the astronomy/planning math lives in `core/` (shared, baked into both shells) and that the app reaches the network for weather, the update check and (web) the popularity source. One sentence.
- **counterArgument:** the blurb is marketing-grade prose and the file contradicts it 30 lines later, so a careful reader self-corrects. That is why this is medium and not high - but "careful reader" is exactly what the contract exists to replace. (Not a historical record: `AGENTS.md` is the live contract.)

### DOC-02 medium CONFIRMED - the public web planner contacts `popularity-source.invalid` on every boot, and no user-facing page discloses it; the privacy page enumerates the planner's network activity without it and opens with "no tracking, no analytics".
- doc: `landing/privacy.html:33-35` + `:37-52` (and the credit lists `web/index.html:205`, `landing/index.html:7,9`) vs reality: `web/app.js:96-105` + `:2520-2521`
- **impact:** a visitor to `nightseam.de/astro` sends their IP, User-Agent and `Referer` to a third-party commercial site on page load. The page the user would consult to learn what leaves their browser is the one that omits it. The request has no functional value: the project's own gate documents that the response is unreadable anyway (no CORS header), so this is a privacy cost for zero gain.
- **mechanism:** `loadPopularity()` (`web/app.js:96`) does `fetch('https://popularity-source.invalid/')`; `boot()` calls it unconditionally at `web/app.js:2521` (right after the catalog load, before user data), and `boot()` is invoked at `web/app.js:2866`. Nothing gates it on an opt-in, and the baked `o.popularity` fallback already covers ranking.
- **evidence:** `git grep -ni popularity -- landing web README.md NOTICE` → hits only in `web/app.js` (source/comments), `web/core/<hash>/catalog.js|scoring.js` (comments) and `scripts/match_popularity.py`; **zero** hits in `landing/`, `web/*.html`, `README.md`, `NOTICE`. `landing/privacy.html:37-52` lists local storage, Open-Meteo, geolocation, Wikimedia - no the popularity source. `tests/browser/harness.py:271-281` (the project's own words): "stub the one external file the web app fetches at boot (The popularity source popularity; popularity-source.invalid sends no CORS header, so a live fetch is a console error even when the app catches it)".
- **repro:** open `<repo>/web/index.html` served on any loopback port and watch the first requests. (I could not run that browser probe here - see "Not checked" - so the confirmation is the authoritative source plus the harness comment and the grep.)
- **requiredFix:** disclose it in the same `landing/privacy.html` list ("Popularity data: the planner requests community popularity counts from the popularity source; the response is not readable by the page (no CORS) but the request carries your IP"), and add the popularity source to the footer/credit line in `web/index.html:205`. Or drop the live fetch and rely on the baked field, which is what actually happens in a browser.
- **counterArgument:** the fetch is cross-origin and `credentials` defaults to same-origin, so no cookie or stored data can be attached or read, and the code catches failure; one could argue "no tracking" still holds (nothing is stored about the user). That is why this is a disclosure gap (medium), not a security hole - but "no tracking, no analytics" printed above a list of *all* the planner's network calls, with one missing, is a wrong user-facing privacy statement.

### DOC-03 medium CONFIRMED - `README.md` says weather is deliberately not included and that images are "the only online content", while the shipped desktop app has a weather panel that fetches Open-Meteo (and the same README documents the once-per-start version check).
- doc: `README.md:183-185` ("Object example images are the only online content") and `README.md:195` ("Not included on purpose: satellite/planet positions, weather, ephemeris-grade lunar librations") vs reality: `static/index.html:59-72`, `static/js/weather.js:49-51`, `static/js/main.js:164,168`
- **impact:** a user reading the feature list is told a shipped, user-visible feature does not exist (the weather chip + "fetch weather for the active site every time it opens" setting), and is told their machine talks to nothing but Wikipedia images while `api.open-meteo.com` is contacted for weather. The correct side is `landing/privacy.html:59-60` ("like the web version, loading weather sends your active site's coordinates to Open-Meteo").
- **mechanism:** the weather panel was added after this README section was written; `README.md:115-117` already documents the update check, so line 183 contradicts the same file.
- **evidence:** `static/index.html:59` `<button id="btnWeather" ... title="Weather for the active site - click to load">`, `:72` "When on, the app fetches weather for the active site every time it opens"; `static/js/weather.js:49` `"https://api.open-meteo.com/v1/forecast?latitude=" + lat ...`; `static/js/main.js:164 bindWeather();`, `:168 checkForUpdates();`. `git grep weather -- README.md` → only line 195 (the README never documents the feature).
- **repro:** `Select-String README.md -Pattern 'weather'`; `Select-String static/js/weather.js -Pattern open-meteo`.
- **requiredFix:** delete "weather" from the `README.md:195` not-included list, add the weather chip to the Night Planner feature list, and scope line 183 honestly ("weather (Open-Meteo, on request) and the once-per-start version check are the only other network calls; example images come from Wikipedia").
- **counterArgument:** line 195 sits under "Where do the numbers come from?" and can be read as "weather does not feed the planning numbers" - which is true. But line 183 is unconditional, and a reader cannot tell that "weather: not included" means "not a planning input" rather than "no weather in the app".

### DOC-04 medium CONFIRMED - `DESIGN.md` (mandatory before any UI work) gives the desktop/landing token names as the palette, but the web app defines a different name set; following the doc for web UI emits undefined custom properties.
- doc: `DESIGN.md:29-40` (table: `--text --dim --faint --border --border-soft --accent2 --accent-ink --gold --good --warn --bad --font-ui --font-mono`) + `DESIGN.md:43-46` ("use the tokens, never raw hex") vs reality: `web/style.css:3-13` and `web/themes.css:16-27`
- **impact:** `DESIGN.md:3-7` claims to govern "everything else (web app, desktop app, landing page)". A web change written to the doc uses `var(--text)` / `var(--dim)` / `var(--border)` / `var(--faint)` / `var(--good)` / `var(--bad)`, none of which exist in `web/style.css` or `web/themes.css`; the property silently resolves to nothing and text/borders fall back to inherited or UA colours in the public planner. Cost is a broken-looking UI plus a debugging session, not a crash.
- **mechanism:** the desktop (`static/style.css:2-44`) and the landing site (`landing/style.css:11-26`) use the long names; the web app was ported with the short ones (`--txt --muted --line --panel --amber --green --mono`). DESIGN.md's table documents the former and never maps them.
- **evidence:** `Select-String web/style.css,web/themes.css -Pattern 'var\(--(text|dim|faint|border|border-soft|accent-ink|accent2|gold|good|warn|bad|font-ui|font-mono)\)'` → **0 matches**; the two `:root`/dome blocks define `--txt: #dbe9ff` / `--muted: #7f97b8` / `--line: #1d3152` / `--amber` / `--green` (web) against `--text: #dfe7ff` / `--dim: #93a3cc` / `--border` / `--gold` / `--good` / `--bad` (static + landing). Name sets overlap on `--bg`, `--panel`, `--accent`, `--radius` only.
- **repro:** grep as above; then add `color: var(--text)` to any web rule and inspect computed style (no token to resolve).
- **requiredFix:** add the web names next to each role in the `DESIGN.md` table (or a one-line "web app: `--txt`/`--muted`/`--line`/`--panel`/`--amber`/`--green`/`--mono`"), and say that the long names are desktop/landing only.
- **counterArgument:** the table's *values* are the desktop dome block's, and an agent editing `web/themes.css` would see the local names in the same file. DESIGN.md also lists where the styles live (`:9-12`). Strong counter-argument, which is why this is medium rather than high - but the doc never states the mapping, and the web app is the surface every release touches.

### DOC-05 low CONFIRMED - `AGENTS.md` advertises 507 Python tests; 508 are collected today.
- doc: `AGENTS.md:408` ("`python -m pytest tests/` (507)") and `AGENTS.md:418` ("**507 pass with 0 assertion failures**") vs reality: `tests/` at HEAD
- **impact:** the count is the cheap signal for "did the suite grow / did a test vanish". One test added by 0.6.32 (`c430983` touched `tests/test_js_parity.py`) was never reflected. No user impact.
- **mechanism:** the count is hand-maintained; the 0.6.32 commit added tests without updating it.
- **evidence:** `python -m pytest tests/ -q --collect-only` → "508 tests collected in 0.68s"; `git show --stat c430983 -- tests/` → `tests/test_js_parity.py | 29 +++`. The only conditional skips (`test_deploy_order.py:32`, `test_ui_invariants.py:28`, `test_paths.py:79`, `test_main.py:74`) did not fire in this environment: `python -m pytest tests/test_deploy_order.py tests/test_ui_invariants.py tests/test_paths.py tests/test_main.py -q -rs` → "74 passed", no `SKIPPED` line. (The full suite is the captain's run; I did not run it.)
- **repro:** `python -m pytest tests/ --collect-only -q | Select-Object -Last 1`.
- **requiredFix:** 507 → 508 in both places (and in `RELEASES.md` only when a new release record is written - the 0.6.31 record is history).
- **counterArgument:** "507 pass" could have been true at the tag and the doc is simply annotated with the last verified number; the sentence reads as a present-tense claim about a plain `python -m pytest tests/` run, so it is stale rather than historical.

### DOC-06 low CONFIRMED - `AGENTS.md` still marks 0.6.32 "(unreleased)" and its review-record pointer stops at 0.6.28, while `RELEASES.md` records 0.6.32 as released, gated and deployed.
- doc: `AGENTS.md:567` ("Current (0.6.32, unreleased)") and `AGENTS.md:492-494` ("Release records ... for 0.6.25-0.6.28") vs reality: `RELEASES.md:144-160`, `v0.6.32`
- **impact:** an agent that trusts `AGENTS.md` may run the release-order steps (tag/stage/verify) for a version that is already tagged, staged and live - the exact class of mistake the file's release section exists to prevent.
- **mechanism:** the token register line is edited per release and was not updated by the "release record: 0.6.32" commit (`3277846` touched only `RELEASES.md`, +26 lines); the review-record sentence was last extended for 0.6.28.
- **evidence:** `git show --stat HEAD` → `RELEASES.md | 26 +++`; `RELEASES.md:144` "**RELEASED as 0.6.32** - tag `v0.6.32` on the release commit ... the browser gate **22/22 on the staged build** and **15/15 including the read-only production smoke** after the upload"; `git tag` contains `v0.6.32`; `git describe` = `v0.6.32-3-g3277846`. The token VALUES on that line are correct (see Refuted R1) - only the label is wrong.
- **repro:** `Select-String AGENTS.md -Pattern 'unreleased'`; `Select-String RELEASES.md -Pattern 'RELEASED as 0.6.32'`.
- **requiredFix:** change "(0.6.32, unreleased)" to "(0.6.32)" (or "(0.6.33, unreleased)" once it exists) and extend the record pointer to 0.6.32.
- **counterArgument:** the sentence may be read as "this token snapshot is the unreleased-0.6.32 state", i.e. describing the tag-time snapshot rather than the current release state. That reading is strained at HEAD, three commits past the tag.

### DOC-07 low CONFIRMED - the Night Planner feature list repeats the "Timezone-aware planning" bullet verbatim.
- doc: `README.md:72-75` vs `README.md:77-80`
- **impact:** a user-facing feature list shows the same promise twice in a row, which reads as an editing error and makes the list look thinner than it is. Cosmetic.
- **mechanism:** paste duplication.
- **evidence:** `Select-String README.md -Pattern 'Timezone-aware planning'` → two hits (72, 77) with byte-identical bodies ("all times render in your machine's zone with DST applied per date ... An optional IANA timezone picker (advanced mode)").
- **repro:** `Select-String README.md -Pattern 'Timezone-aware planning'`.
- **requiredFix:** delete `README.md:77-80`.
- **counterArgument:** none worth making.

### DOC-08 low CONFIRMED - `scripts/check_js.py`'s docstring lists six checks; `main()` runs seven hard ones, including the baked-core guard it never names.
- doc: `scripts/check_js.py:1-12` ("the four static/js checkers plus the encoding guard ... and the cache-token pair") vs reality: `scripts/check_js.py:30-38`
- **impact:** a reader (or agent) auditing the guard suite from the script's own header under-counts it and can conclude that baked-core drift is checked elsewhere. `AGENTS.md:421-439` is correct, so only the script's summary is stale.
- **mechanism:** `check_core` was added to `main()` without updating the module docstring.
- **evidence:** `main()` calls `check_js_imports`, `check_dom_ids`, `check_js_syntax`, `check_encoding`, `check_catalog_token`, `check_js_tokens`, `check_core` (hard) + `check_js_defs` (heuristic); a real run prints `check_core: OK` between `check_js_tokens: OK` and the defs candidates.
- **repro:** `python scripts/check_js.py` (56 lines of output, `check_js: OK`).
- **requiredFix:** name `check_core` in the docstring (and say "six/seven static checks plus the heuristic defs pass").
- **counterArgument:** an internal docstring is the lowest-value doc surface; filed only because this lane explicitly asks about the `check_js.py` guard list.

## Refuted (claims I checked that are NOT wrong)

- **R1 cache-token register** (`AGENTS.md:567-580` "Current (0.6.32..."): every token matches the shipped files exactly - `web/index.html:3,4,5` → `style.css?v=21`, `themes.css?v=4`, `app.js?v=80`; `web/app.js:11,12,13,14,16,17,19,20,28` → astro 16, horizon 48, webstore 26, dragwin 1, format 23, nightrank 14, `core.js?v=24`, `CATALOG_TOKEN = '9'`; `core/core.manifest.json` token 24 = `web/core.js?v=24`. All 10 agree with the doc.
- **R2 advertised catalog size**: `12,176` is the shipped row count on every surface I could find - `app/data/openned.csv` 12,176 rows (probe), `web/catalog.json` 12,176 objects (11,976 advanced + 200 standard), `web/index.html:7,205`, `landing/index.html:7,9`, `landing/about.html:39`, `README.md:47,49`, `CATALOG.md:11`, `AGENTS.md:146,677,692`. `landing/features.html:46` says "12,000 objects" - a rounded approximation and the only size claim not pinned by `tests/test_catalog_integrity.py`; not a false claim.
- **R3 "to magnitude 20"** (`README.md:47`, `web/index.html:105`): exactly one shipped row is fainter than 20 (faintest 21.0, 6 rows fainter than 19, 35 fainter than 18). Correct as written.
- **R4 pipeline counts** (`CATALOG.md:21,25`): upstream NGC.csv 13,970 rows, addendum.csv 64 rows → 12,098 objects + 62; `supplement.csv` 43 lines = 26 comment lines + "Columns:" comment + exactly 16 object rows; total 12,176. `python scripts/build_adv_catalog.py` reproduces all of it and prints "12098 NGC/IC + 62 addendum + 16 supplement", byte-identically (`git diff` empty).
- **R5 `database_files/NGC.csv`** (`AGENTS.md:145,681-682`, `CATALOG.md:21,25`): this is the *upstream* OpenNGC path, and both docs say so in the rebuild step (`CATALOG.md:50-52` "download ... from https://github.com/mattiaverga/OpenNGC (database_files/) -> data/NGC.csv"), which is where `scripts/build_adv_catalog.py:26-28` actually reads them. `CATALOG.md:16` and the script docstring agree. Not a path that should exist in this repo.
- **R6 "709 of 12,160 rows"** (`AGENTS.md:835`, `DECISIONS.md:24`): 12,098 + 62 = 12,160 is exactly the OpenNGC-derived row set, and the 16 supplement rows carry no `Pax`; it is a measurement of the source rows, not a claim that the catalogue holds 12,160. Harmless, if easy to misread against the 12,176 headline.
- **R7 popularity numbers** (`AGENTS.md:812` and `AGENTS.md:796`): rank 1 = 166,350 and rank 2 = 162,860 = M42 (`ngc1976`) then M31 (`ngc224`); rank 1,500 = 19; 4,455 rows at score ≤ 4 ("the last ~4,000 at 1-4"); 7,654 positive shipped scores ("7,654 shipped scores") - all exact against `app/popularity_data.py` and `web/catalog.json`.
- **R8 named files and identifiers**: 70+ paths (`core/*.js`, `tests/js/*.mjs`, `scripts/*.py`, `app/*.py`, `tests/*.py`, `web/build_web.py`, `web/ftps_deploy.py`, `tests/browser/harness.py`, ...) and 35 identifiers (`paths.safe_rel/safe_join/safe_token`, `catalog_data.LEGACY_ID_MAP`, `STANDARD_TOP_N`, `Database.migrate_legacy_object_ids`, `_drop_retired_fields`, `assignPopularityTiers`, `wikiTitles`, `precessJ2000ToDate`, `scrubWindowMs`, `cropKeptBand`, `visibleSkyBands`, `assumedOpenHatchPolys`, `normalizeProfileBins`, `retention_keep`, `HISTORY_LIMIT`, `clampSkyTime`, `exportPanosWithImages`, `overhangRuns`, `effectiveMinAlt`, `indexRangeFor`, `initFocusTrap`, ...) all exist (`identcheck.py`; the only miss was a name I invented).
- **R9 commands**: `main.py --version|--port|--browser|--no-browser|--console|--idle-exit-hours`, `scripts/check_js.py`, `check_browser.py --web|--desktop|--all|--list|--prod-url`, `check_js_tokens.py --update`, `pre_tag_check.py`, `make_release.py`, `build_changelog.py --check` (exit 0), `web/build_web.py version|catalog`, `web/ftps_deploy.py list|upload|download|mkdir|uploadmany|uploadtree|remove`, `build.ps1`, `python main.py --version` → "NightSeam 0.6.32-3-g3277846" (= `git describe`, leading `v` stripped). All present; none moved.
- **R10 guard scope**: `check_js.py` reports "checked 76 js module(s)" - matches `AGENTS.md:425-428`'s "76 modules with the retained N-1 tree"; `core/core.manifest.json` has `previous: ddf8707d7cc90697` and both hashed dirs exist under `web/core/` and `static/js/core/` - matches the XL-02 retention policy text.
- **R11 reference anchors**: `tests/js/reference_anchors.mjs` has exactly 19 `check(...)` registrations - matches "19 checks".
- **R12 review record**: `reviews/0.6.24/` contains `REVIEW-0.6.24.md`, `07-findings.json`, `70-verification.md`, `80-report-review.md` and exactly five lane reports - matches `AGENTS.md:492-494`.
- **R13 release records exist for 0.6.25-0.6.32** (`RELEASES.md:10-160`), newest first; the 0.6.32 record is at `:144`. Only the range named in `AGENTS.md` is stale (DOC-06), not the file.
- **R14 `impressum.html` placeholders**: none. The page is filled in (`landing/impressum.html:33-34` provider + e-mail) and contains none of `ftps_deploy.PLACEHOLDER_MARKERS` (`[Dein Name]`, `[Straße`, `[PLZ`, `name@example.com`) - no latent deploy blocker.
- **R15 `landing/changelog.json`**: newest entry is `0.6.32` (`:3`) and `python scripts/build_changelog.py --check` exits 0 ("every release after 0.6.32 has a curated summary"); every relative `href`/`src` in `landing/*.html` resolves locally.
- **R16 `web/catalog.json` "~4 MB"** (`AGENTS.md`): 3.66 MB.
- **R17 Deliberate non-goals**: I did not file the desktop/web crop divergence, the absent `distance` field, the tier-only popularity display, the `observations` table, the `90.5` sentinel or `viewFullDay` - each is recorded as intentional and I found no current doc claim contradicting the shipped behaviour.

## Not checked

- **The live deployment** (`nightseam.de`, `/astro`, `/downloads/*`): no network probes. `landing/download.html:78` (`/downloads/version.json`) and its `/downloads/NightSeam-latest.zip` link can only be verified against the real host, and the production smoke result comes from `RELEASES.md` (history) rather than from me.
- **The browser-rendered request waterfall** for DOC-02: Playwright cannot launch here - `python reviews/0.6.32-full/evidence/docs/popularity_boot_probe.py` died with `PermissionError: [WinError 5]` inside `asyncio/windows_utils.py` when spawning the driver, i.e. exactly the documented sandbox boundary (`ENVIRONMENT.md:67-77`, "The Playwright driver cannot spawn sandboxed"). Approval prompts are disabled in this session, so there is no escalation path; DOC-02 is confirmed from the authoritative source (`web/app.js` boot path) plus the project's own harness comment, and is labelled accordingly.
- **`ENVIRONMENT.md`'s measured sandbox claims** (named/OVERLAPPED pipes, Chromium mojo IPC, scratch DACLs, git maintenance): read, not re-measured.
- **`RELEASES.md`'s per-release gate numbers and hashes** (22/22, 15/15, zip sha256, size): historical records, not re-run.
- **The frozen Python suite's failure modes**: I ran `--collect-only` plus four modules; the captain runs `python -m pytest tests/ -q` once. So "508 pass" is established only as "508 collected, no conditional skip fires here".
- **The desktop EXE's embedded strings** (`dist/NightSeam.exe`, baked `app/_version_baked.py`): not built, not inspected.
- **`web/version.json`** (gitignored, baked from the tag): absent in a source tree, so the deployed `foot-ver` value is unverifiable here.
