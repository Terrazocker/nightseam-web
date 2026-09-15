# NightSeam 0.6.32 - full review

**Subject:** `v0.6.32-3-g3277846` / HEAD `3277846 release record: 0.6.32`.
Tracked tree clean before and after; the only untracked entries are
`REVIEW-PROMPT.md` (user-supplied, untouched) and `reviews/0.6.32-full/`.

**Method:** nine lanes (Python backend, shared JS core, web planner, desktop
shell, UI/visual, catalogue/data, tests+release, security+performance, docs),
each read-only, each writing one report with `file:line`, an executed
reproduction for every `CONFIRMED` claim and an explicit refutation attempt.
The captain then re-verified every `blocker`/`high` personally and ran the three
project gates. Findings were merged mechanically
(`evidence/merge_findings.py`) rather than transcribed.

## Verdict

**Usable tonight for planning, with one data-loss caveat that should be fixed
before the next release.** The astronomy is in good shape: the precession
composition is faithful to Meeus eq.21.4 (a lane nearly filed the opposite and
disproved its own claim), the catalogue rebuilds byte-identically, worker and
sync builds agree to 0.000 deg, and the traversal/zip-slip defences held against
every hostile input the security lane constructed. The 508-test suite passes and
the 22-check real-browser gate passes on both shells.

The risk concentrates in four places: **(1) library and backup edge cases where
data is silently replaced or half-applied** (one blocker), **(2) the Classic
theme being broken on every phone**, **(3) guards and tests that cannot see what
they claim to guard**, and **(4) documentation that has drifted away from the
code** - including one privacy statement that omits a third-party request the
public web planner makes on every page load.

## Counts

| | |
|---|---|
| findings | **74** (1 blocker, 1 high, 24 medium, 47 low, 1 nit) |
| verified | **69 CONFIRMED**, 5 SUSPECTED |
| refuted claims | **82** (recorded with the reason, so nobody re-files them) |
| coverage items not checked | **111** |
| filed by a lane, reclassified by the captain | 1 (`DE-03`, a review-coverage limit, not a defect) |
| recovered by the captain from lane prose | 3 (`CO-08`, `CO-09`, `CO-10`) |
| filed by the captain's gate run | 1 (`TR-12`) |
| filed by the captain's vision-routed screenshot pass | 5 (`UI-05`-`UI-09`) |
| lanes | 10 reports (including `55-ui-visual.md`), ~70 probes under `evidence/` |

## The two that matter most

**`PY-01` blocker - `/api/library/edit` silently overwrites a same-named frame.**
Renaming an unresolved library object into a folder that already exists replaces
the colliding frame in place through `Path.replace()` (`app/ingest.py:215-221`,
route `app/server.py:863`), answers `200 {"ok":true}`, and leaves two rows
aliasing one file. **Independently reproduced by the captain** with a different
construction using only public endpoints
(`evidence/verify/verify_py01_captain.py`): files 2 -> 1, the destination frame's
`EXPTIME` 60.0 -> 120.0 (its bytes gone), both rows pointing at
`NGC 7000/2026-08-22_2314/lights/Light_001.fit`. The "merge is documented intent"
defence fails because the sibling ingest path **does** uniquify
(`app/ingest.py:88-89` -> `Light_001_2.fit`), and no safety copy covers library
edits at all (the `<db>.backup-auto.zip` is written by the import route only).
Fix: never land on an existing `dest` - reuse the `_archive_target` shape or
refuse with 400.

**`UI-01` high - the Classic theme forces a 548 px minimum page width.**
`.topbar-right` has no `flex-wrap` (`web/style.css:72`) while its child
`.nightinfo` is `white-space: nowrap` (`style.css:74`), so the group cannot
shrink below ~526 px; the parent bar wraps, and the group then overflows the
page. Measured twice, independently: `scrollWidth === 548` at viewports
320/360/400/480, clean at 600+. Classic is one of two shipped, user-selectable
themes, so a phone user who picks it gets a sideways-scrolling page - and the
vision pass showed exactly what is lost in the off-screen band: the **hamburger
button** (the only route to Appearance/Display/Advanced/Data/About) and the
**fourth tab "Horizon & Obstacles"**, at 320 *and* at 360. Dome only masks the
same container defect by hiding that child below 900 px (`web/themes.css:341`).

## Top medium risks (ranked)

1. **`CO-07` - the two shells disagree about "% of night".** The web scores on a
   dusk-anchored 6-min grid, the desktop on its noon-anchored 241-sample grid
   clipped to dusk..dawn, with denominators 80 vs 79; 20-66 of 200 standard rows
   differ by up to 4 pp, and since 0.6.30 the web Min-visibility gate keys on the
   web number, so list membership can differ between shells. `AGENTS.md` claims
   the web "scores the same window as the desktop".
2. **`CO-08` - an aggressive panorama-band crop can turn a Blocked target into
   Observable.** `cropStrokes` scales stroke geometry but not the brush radius,
   so the painted band grows holes: 11 of 91 in-frame bins lost and a column that
   was `Blocked` (ceil 37.10) became `Observable` (ceil -90) at the default
   brush r=28. This is the safety inversion the editor exists to prevent. (The
   core lane proved it but never gave it a finding number; recovered by the
   captain.)
3. **`PY-02` - a crafted `min_vis` bricks the desktop.** It is the one settings
   key the import boundary does not validate; a bundle with `"min_vis":"abc"` is
   accepted and then every `GET /api/state` answers 500, so the app dies at
   `loadState()` until the row is repaired.
4. **`WE-01` - a transient Wikipedia failure is cached as definitive for 30
   days, and this is a 0.6.32 regression.** `transient` is only raised for a
   non-ok status, so a rejected/aborted fetch is remembered as "no photo on
   Wikipedia" (`web/app.js:483,509-513`; the polarity flipped in `c430983`).
5. **`WE-05` - unsaved panorama paint is silently discarded.** Any pref/site/date
   change while the editor is open rebuilds it with a fresh baseline, so
   `horizonUnsaved()` goes false and the route/`beforeunload` guards skip.
6. **`WE-06` - IndexedDB denied leaves the app on the splash forever**, with no
   view and no retry (`web/webstore.js:84-96` + `web/app.js:2524`).
7. **`DE-01` - a hung wizard validate creates a duplicate site.** The 20 s
   unstuck guard drops the busy flag but never cancels the pending validate, so
   retrying POSTs `/api/sites` twice.
8. **`DOC-02` - the public web planner contacts `popularity-source.invalid` on every
   boot and no user-facing page says so.** the popularity source appears in `landing/`,
   `web/*.html`, `README.md` and `NOTICE` exactly zero times, while
   `landing/privacy.html:37-52` lists the planner's other network calls under
   "no tracking, no analytics"; the project's own harness notes the response has
   no CORS header, so the request buys nothing.

Also worth the next pass: the **guard cluster** (`TR-01`/`TR-02`/`TR-03`/`TR-04`,
`CO-01`/`CO-02`/`CO-03`, `CD-08`, `TR-10`/`TR-11`) - guards that pass while the
thing they name is broken, a browser check that cannot fail, and three assertions
that cannot do their job. Individually low; together they explain how `CD-01`
(desktop still advertising 12,160 objects) survived two releases.

## Recurring themes

- **Silent replacement instead of refusal**: `PY-01`, `PY-06`, `PY-07`, `WE-03`,
  `CO-08`. The codebase has the right convention (`ingest.py:88-89` uniquifies)
  and several paths do not follow it.
- **Partially-applied state with a misleading status**: `PY-03` (DB committed
  before payloads; a clean `400` can sit on top of a replaced library - settled
  as *recoverable* because the auto safety copy holds the pre-import rows),
  `WE-02` (records written before the panorama section is validated), `SP-05`.
- **Guards and tests that cannot see their subject**: `CO-01`-`CO-03`, `TR-01`-
  `TR-04`, `TR-07`, `TR-10`, `TR-11`, `CD-08`.
- **Documentation drift**: `DOC-01` (AGENTS.md still calls the astronomy
  "pure-Python" a release after deleting it), `DOC-03` (README says weather is
  not included while the desktop ships a weather chip), `DOC-04` (DESIGN.md
  gives web UI authors token names the web app does not define), `DOC-05`
  (507 vs 508 tests), `DOC-06`, `CD-01`, `CD-07`.
- **The Classic theme is systematically under-styled, and the vision pass is what
  made that visible**: every UI finding except the two contrast/overflow ones is
  Classic-only - `UI-01` (the page cannot shrink below 548 px: the hamburger and
  the fourth tab are unreachable on a phone), `UI-05` (the panorama editor's Name
  field and PAINT select fall through to **native white** form controls on a dark
  panel, because dome has a broad `input:not([type=range])` rule at
  `web/themes.css:194-196` and the base stylesheet only styles inputs through
  narrow class-scoped selectors), `UI-09` (at 320 the min-alt row garbles and
  target rows escape their card). A user on the fallback theme is, in practice,
  on an unreviewed one.
- **Cross-shell inconsistency**: `CO-07` ("% of night"), `CD-02` + its web mirror
  (desktop searches a different index than the web; 25 rows findable on one side
  only), `CO-10` (no-magnitude advanced rows never reach the web sky chart even
  at the slider maximum, contradicting the shared magnitude rule and the comment
  two lines above the call).

## What is healthy - verified by execution, not by reading

- **Astronomy**: the precession composition matches Meeus eq.21.4 to 0.00 arcsec
  under his sign convention; `moonAge` labels match over 400 days;
  the two visibility predicates agree on 8,800 combinations; `format.js`,
  `scrubWindowMs`, the half-open window and `windowEndISO` all hold; no second
  copy of core math in either shell; stubs, tokens and the retained N-1 baked
  tree pair correctly.
- **Catalogue**: the shipped `openned.csv` rebuilds **byte-identically**;
  `_build_row` raises on an unmapped type (no galaxy fallback); the row filter is
  exactly as documented (`ngc650` in, `ngc651` out, `ngc6994` absent, M40/M73/
  IC1318 back as supplement); 12,176 token-safe unique ids with 0 cross-table
  duplicates; standard = exactly the positive-score top-200; the supplement is
  exactly its 16 ids; popularity is byte-reproducible under three hash seeds and
  through the real `--cached` CLI; rank 1 = M42, rank 2 = M31; tier letters are
  mode-independent on the real payload; `web/catalog.json` regenerates
  byte-identically and matches its manifest.
- **Security**: path traversal, zip-slip, symlinks, junctions, absolute/drive/
  `..`/NUL/duplicate-normalized paths, 8 hostile bundles and 7 static-mount
  encodings were all refused with no file touched outside `data/`; `thumb=1`
  makes zero network calls; a bundle's `image_dir` is ignored and reported;
  the import transaction rolls back; the schema is ALTER-only; no secrets in the
  repo. **No remotely exploitable hole was found in modern browsers.**
- **Desktop**: all three `night.js` awaits re-check their controller; the 241 x
  6 min grid is exactly 24.000 h noon->noon; `viewFullDay` widens and clamps
  correctly with the scoring clip unchanged; the worker and sync paths agree on
  `max_alt` to 0.000 deg over 5,832 units; the dev hooks stay inert; handoff,
  free-port fallback, idle exit and the deleted routes' 404s all behave.
- **Release integrity**: `check_release.py`'s zip sha256/size, zip-vs-exe,
  staged-exe, `ns-version.js`, changelog-schema and describe-grammar checks are
  genuine; `check_js_tokens`' one-way rule, CRLF handling and `--update` refusal
  fire end to end; a browser launch failure hard-fails (exit 2) with no skip
  path; `tests/conftest.py`'s "never touch the user profile" claim holds; 0
  swallowed assertions across `tests/*.py`.
- **Performance**: advanced night build 514 ms (2.89 M samples, +83 MB); cold
  start 0.485 s seed / 0.176 s open; `JSON.parse` 13.1 ms for the 3.83 MB
  catalogue (gzip 659,561 B); worst sky-magnitude input 5.1 ms.
- **UI measurables**: focus rings present on all 14 tab stops (nothing
  suppresses outlines); all six landing pages free of horizontal overflow at
  360/768/1366; the four sub-24 px touch targets are WCAG 2.5.8 exceptions
  (native range inputs, inline links); scrub steps are 6/60 min in both themes;
  the "progress never moves the layout" invariant is exercised and passes in the
  browser gate.

## Refuted - 82 claims recorded so they are not re-filed

Highlights: the precession rotation **order is correct** (the core lane's own
near-miss, off by 1200 arcsec from an auxiliary-angle sign error, not from the
code); every traversal attempt; `web/catalog.json` byte-reproducibility and its
token/manifest pair; the rank-1/2 identity; tier-letter mode independence;
popularity determinism under hash seeds; the absence of a `distance` field and of
any rendered popularity number; the bundle `image_dir` rule; import transaction
rollback; the worker/sync `max_alt` agreement; the `viewFullDay` clamp and
whole-hour DST handling; `searchBlob`/`wikiTitles`/disambiguation; the editor's
history/`beforeunload`/zoom contract; `thumb=1` network silence; and the captain's
own false alarm that the dome active tab is invisible at 1.02:1 - an artifact of
the contrast walker not reading a `linear-gradient`, hand-computed to 4.42-5.94:1.

## Coverage gaps - what this review did NOT check

- **The screenshots were interpreted, but they do not cover the whole UI.** The
  captain's session model route declared no image input, so the first pass was
  measurement-only; three agents were then routed to the configured vision model
  (`deepseek/deepseek-v4-flash-vision-exp`, `settings.yaml:202-212`) and read all
  18 screenshots (`55-ui-visual.md`, 87 observations). That **closes the visual
  gap for the Tonight and Horizon tabs** and confirmed UI-01/UI-02/UI-03 visually.
  It does **not** cover: **Sky View (the polar chart) and the Targets catalogue
  table, which have no screenshot at any width**; the panorama editor painted (all
  four editor shots are blank, so the blocked-band fill and the assumed-open hatch
  were never seen); any empty/error/offline/daytime state; the desktop shell's
  appearance (the gate asserts but keeps no stills); and DPR-2 or zoomed
  rendering.
- **Zoom / DPR**: only `device_scale_factor=1` and default zoom were measured.
- **Rendered costs the lanes could not measure** (no browser in any lane):
  canvas/DPR behaviour, chart redraw on scrub and resize, the panorama editor
  with a real large photo, real quota errors, cross-tab `storage`, a stale cached
  module, memory over a long session.
- **Long-running server behaviour**: the `img-prefetch` lifetime, `imgcache`
  growth (`SP-10`), idle exit, and the `data/instance.json` handoff - with one
  unexecuted SUSPECTED double-instance risk recorded by the python lane.
- **The live deployment**: no production smoke, no `/downloads/*` verification,
  no check that the host gzips `catalog.json`. The packed exe was exercised only
  through the browser gate.
- **Suspected-only items (5)**: `SP-02` (third-party JSONP inside the localhost
  origin), `SP-06`, `SP-07`, `SP-10` and `CO-04` (`altaz()` returning exactly
  360; not reproducible on a 3.1 M-sample grid, no consumer impact shown).
- **Bounds reasoned but not executed**: the zip-bomb total-expansion bound,
  `images.py`'s network chain against a stub, `.fz`/`.gz`, `db.lock` concurrency
  under load, coverage %, `build.ps1`/`make_release` end to end, the installer,
  other OSes, and the upstream OpenNGC/SIMBAD provenance of the supplement.

## Review integrity - deviations and limits of this review itself

- **One lane wrote a 1-byte probe artifact into the real user data directory**
  (`data/panos/ok.jpg`, 19:47:26) against the brief's hard constraint. Removed
  after all lanes stopped; `data/nightseam.db`, its backup, `imgcache/` and all
  CSVs were never touched. Two 3-byte `.jpg` files in that folder are the same
  class of leak from an earlier session and were deliberately left alone.
- The pre-existing browser pass polled `#topbar`, an id that does not exist
  (`web/index.html:21` is `<header class="topbar">`), so its topbar-height column
  is all `null`.
- No lane could run a browser (Chromium needs named pipes and overlapped pipes;
  lane sessions cannot escalate), so every lane's CONFIRMED browser-class claim
  is code- or Node-level, and the gate is the captain's. Two lanes also declined
  the packed exe.
- The core lane proved three findings but left two of them as prose and one as a
  cross-lane note; they are in `findings.json` as `CO-08`/`CO-09`/`CO-10`, each
  attributed to the lane in a `recoveredFrom` field. Nothing was invented.
- Lane report formats drifted; the merge records which prose field each finding
  omits in `missingFields` (23 findings) instead of fabricating it. Every one of
  the 74 findings carries `file:line` and an executed reproduction - 0 gaps.

## Gates (details and raw output in `gate.md`)

| gate | result |
|---|---|
| `python -m pytest tests/ -q` | **508 passed**, 0 failures, 139.34 s, exit 0 |
| `python scripts/check_js.py` | **OK**, exit 0 (76 modules, 0 broken imports, 0 syntax errors; encoding/catalog-token/js-tokens/core guards OK) |
| `python scripts/check_browser.py --all` | **21/22**, exit 1 - the single failure is a PyInstaller cold-start flake (`desktop-pano-crop-fov`, 91.9 s vs a 90 s wait) that **passes in 3.0 s on the documented re-run**; filed as `TR-12` |

## Deliverables

| file | contents |
|---|---|
| `00-charter.md` | scope, method, subject (pre-existing) |
| `10-python.md` | backend, storage, IO - 10 findings (1 blocker) |
| `20-core.md` | shared `core/` - 7 numbered findings + 3 recovered |
| `30-web.md` | web planner - 7 findings |
| `40-desktop.md` | desktop shell, worker, async - 3 findings |
| `50-ui-ux.md` | UI/visual/a11y measurements - 4 findings (captain) |
| `55-ui-visual.md` | the 18 screenshots interpreted by the vision-routed agents - 5 findings (captain + vision pass) |
| `60-catalog-data.md` | catalogue pipeline - 8 findings |
| `70-tests-release.md` | guards, tests, release integrity - 11 findings |
| `80-security-perf.md` | security + performance - 8 findings |
| `90-docs.md` | documentation vs reality - 8 findings |
| `findings.json` | 74 findings + 82 refuted + 111 not-checked + counts (generated by `evidence/merge_findings.py`) |
| `gate.md` | the three gates, prerequisites, tree/data state |
| `evidence/verify/VERIFICATION.md` | the captain's independent re-verification of the blocker and the high |
| `evidence/INTEGRITY-NOTE.md` | the process deviations above |
| `evidence/<lane>/`, `evidence/ui/`, `evidence/verify/` | ~70 probes, logs and 18 screenshots |
