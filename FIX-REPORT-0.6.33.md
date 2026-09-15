# FIX-REPORT 0.6.33 - the 0.6.32 review findings, fixed

**Subject:** work tree on top of `v0.6.32-3-g3277846`.
**Source of truth:** `reviews/0.6.32-full/` (`REVIEW-0.6.32.md`, `findings.json`
with 74 findings, the nine lane reports, `55-ui-visual.md`, `gate.md`).
**Scope:** every finding the review filed as a real defect, plus the user's
standing instruction that **no NightSeam code on any platform may make an active
request to the popularity source**.

---

## 1. The popularity source: fetched once, then removed entirely

### What was done

1. **Fetched the JSON exactly once** with the project's own request shape
   (`https://popularity-source.invalid/`, the
   `NightSeam/1.0` user agent, default SSL then relaxed SSL). **17,007 entries.**
2. **Compared it against the cache the shipped popularity was already derived
   from** (`data/popularity_snapshot.json`): **0 added, 0 removed, 0 changed -
   semantically identical.** So the live fetch that ran on every page load was
   returning data the app already shipped. Removing it changes no ranking, no
   standard-mode selection, no tier letter.
3. **Installed the snapshot durably** as `data/popularity_snapshot.json` plus a
   provenance sidecar `data/popularity_snapshot.meta.json` recording the URL, the
   UTC fetch time, the entry count and the file's sha256 - so a future change to
   the snapshot is visible rather than silent.
4. **Deleted the live fetch from the web app** (`web/app.js::loadPopularity` and
   its boot call): `popularityOf()` now reads only the baked `o.popularity`
   field. This was the **only** place in any shipped file that named the domain.
5. **Made the generator offline by default.** `scripts/match_popularity.py` no
   longer fetches unless asked: reading the local snapshot is the default path
   and **`--live` is the only code path in the project that touches the
   network**. It also no longer rewrites the snapshot as a side effect of
   reading it. Regenerating `app/popularity_data.py` this way produced a
   **docstring-only diff** - proof the offline path is byte-equivalent.
6. **Two independent pins**, so this cannot come back unnoticed:
   - `tests/browser/harness.py` now installs the popularity source route as a
     **TRIPWIRE** (abort + record) and `Ctx.assert_clean()` fails any browser
     check that requests it - on **both** shells, since every check ends there.
   - `tests/test_no_popularity_fetch.py` statically forbids the domain in every
     shipped runtime file, forbids the removed fetch helpers, and asserts the
     matcher stays offline-by-default. It also validates the snapshot's recorded
     provenance when the file is present (`data/` is gitignored, so a fresh clone
     legitimately has no snapshot and that one check skips).
7. **Disclosure became attribution.** The privacy page and the About/footer
   credits now state that the popularity counts come from a popularity-source snapshot
   taken once and baked into the catalogue - and explicitly that opening the
   planner does **not** contact the popularity source or any server. `DOC-02` is closed by
   removal rather than by disclosure.

### Note on durability

The raw snapshot lives under `data/`, which is **gitignored by design**; what
ships in git is the *derived* `app/popularity_data.py` plus the provenance
sidecar. That matches the project's existing rule. If you want the raw JSON
itself tracked (so any clone can re-derive without a `--live` run), say so and
I'll move a copy to a tracked location - I did not decide that unilaterally
because the raw file is third-party data.

---

## 2. Corrections to the review itself (my own further research)

Four review claims turned out to be wrong or incomplete. These matter more than
the fixes, because they are about the review's own reliability.

### `DE-02` was MISDIAGNOSED - the stated mechanism was false

The review said the `longOffset` regex *"discards the `:30`"* and that a
half-hour zone reports +10:00 instead of +10:30. **That is not what happens.** I
tested the parser directly against Node's `Intl`: `+10:30` -> 630,
`+05:30` -> 330, `+05:45` -> 345 - all correct.

The real defect was in the **wrapper**, `core/time.js::zoneOffsetAtLocalNoon`:
its fixed-point iteration used `noonUTC + offset`, which probes
`noonUTC + 2*offset` - up to **~21 hours away from local noon** - so a DST
boundary inside that span was read from the wrong side and the desktop day grid
anchored on the post-transition offset. Measured before the fix:
`Australia/Lord_Howe 2026-10-03` returned **+11:00 instead of +10:30**,
`Australia/Adelaide 2026-10-03` **+10:30 instead of +09:30**.

Why nothing caught it: whole-hour zones (Berlin, London, New York, Sydney) all
happen to sit with their boundary *outside* the shifted span, so only 30-minute
zones on their transition date broke. And the test that covered this had the
error **written down as intentional**:

```
# transition-day quirk, PRESERVED from the desktop algorithm: the UTC-noon
# iteration walks "UTC + east" ... Characterized, not "fixed"
("America/Los_Angeles", "2026-03-08"): -480,
```

I audited all 19 noon goldens against `Intl` and found **exactly two wrong - the
two `America/Los_Angeles` transition days**, i.e. precisely the values that
comment blessed. The iteration now uses `noonUTC - offset` (the correct
relation: local = UTC + offset, so UTC = local - offset), converges on the true
local-noon instant for every zone, and all 19 goldens are now true. Both wrong
goldens were corrected with a comment explaining why they swapped, and two new
pins (`Lord_Howe`, `Adelaide`) cover the class the review actually found.

**This is a user-visible behaviour change** (an hour of grid shift on transition
days for affected zones), so it belongs in the release note.

### `UI-06` was MISDIAGNOSED by the vision pass

The vision agent reported that the legend's *"green dashed = horizon (alt 0)"*
guide **is not drawn**. It is drawn - `rgba(123,241,168,.6)`, dashed `[7,5]`,
with a green label (`web/horizon.js:902`). What actually happens is that the
loop **skips** the line when it lands within 6 px of the top / 2 px of the
bottom of the frame (`:900`) - which is the **default** case, because
`altBottom = 0` puts alt-0 exactly on the bottom edge. So the guide looked
absent. Fixed in the **drawing** (the base line is now clamped inward and always
visible) rather than by rewording an accurate legend.

### `UI-01` had a SECOND cause the review never found

The night-info pill was only half of it. After fixing that, the classic page
still could not shrink below **372 px** at 320/360 - the remaining 52 px was a
single 98 px tab (`Horizon & Obstacles`) in a nowrap flex strip. Fixed by letting
the strip wrap at ≤640 px. Final measurement: classic fits at **320, 360, 400,
480, 640 and 768**, with both the hamburger and the fourth tab on-screen at 320.

### The core purity guard has a prose false-positive (evidence for `CO-01`-`CO-03`)

`core/time.js` failed `check_core.py` with `forbidden pattern \bwindow\s*\.`
because a **comment** of mine ended with the word "window." - the guard is a
regex over source text, prose included. Harmless once reworded, but it is a
concrete demonstration of the same bluntness that lets `CO-01`, `CO-02` and
`CO-03` through, and worth knowing before anyone trusts a green
`check_core: OK` as proof of purity.

### One observation I deliberately did NOT promote to a finding

In all eight desktop-width screenshots and both themes, one row in the
"VISIBLE AT" panel renders its `transit` value in bright white while every other
row's is muted grey (`Fireworks Galaxy -> transit 20:03`). It is reproducible
across themes, so it is not a rendering artefact - it looks like a deliberate
emphasis that nothing in the code or docs explains. Recorded in
`55-ui-visual.md`; needs a code check before anyone files or fixes it.

### A NEW defect found while verifying the fixes: tests can write into the real `data/panos`

`tests/conftest.py` redirects `paths.default_archive_dir()` into `logs/` so tests
never touch the user's image archive - but it does **not** redirect
`app/paths.py::data_dir()`, which resolves to the repo's real `data/` and even
`mkdir`s `data/panos` as a side effect (line 149). So any test that imports a
bundle carrying a panorama payload writes that payload into the developer's real
data directory.

This is not theoretical and it is not new - it is the **root cause of the stray
`data/panos/ok.jpg` recorded twice in this work**: once during the original review
(`reviews/0.6.32-full/evidence/INTEGRITY-NOTE.md` §1, 1 byte) and again during
these fixes (8 bytes, `b"JPEGDATA"`). The 8-byte content matches the crafted
payload in the new hostile-bundle pin at `tests/test_api.py:1344`, and the shape
repeats in `tests/test_backup.py` around `:254`/`:756`.

The ugly part is the timing: the assertion that guards this
(`assert not (pano_root / "ok.jpg").exists()`, `test_api.py:1350`) reads the
**real** directory, so the test only writes there **when it is failing** - i.e.
exactly on the run where you are least likely to notice a side effect.

**Fix:** redirect `data_dir()` in `conftest.py` for the whole suite, like the
archive, so the assertion and the write are both sandboxed. Reported to the
Python workstream, which owns those files; I will re-check `data/panos` after it
stops and clean up anything left behind.

---

## 3. Fixes in this batch

### Done and verified

| id | severity | what changed |
|---|---|---|
| `UI-01` | **high** | Classic page no longer forces 548 px: `.topbar-right` may wrap/shrink, the night-info pill wraps at ≤640 px, and the tab strip wraps. **Measured fixed at 320-768**; hamburger + 4th tab reachable. |
| `CO-08` | medium | `cropStrokes` now scales the brush radius with the horizontal stretch, so an aggressive crop can no longer open gaps that turn a **Blocked** target into **Observable**. |
| `WE-01` | medium | The 0.6.32 regression: only DEFINITIVE Wikipedia failures (`no-thumb`, `bad-type`) are cached for 30 days; a rejected fetch, timeout or abort stays retryable. |
| `WE-02` | medium | `stageBackup` validates the panorama section with everything else, so a bundle with an unusable pano section is rejected **before** any write. |
| `WE-03` | low | `writeStaged` checks the `clearStore` results, so a failed clear fails the restore instead of silently merging old + new records. |
| `WE-06` | medium | Storage is probed before anything renders; IndexedDB-denied and catalogue-fetch failures now show an actionable card with a Reload button instead of a dead splash. |
| `WE-07` | low | `clampSkyTime()` broadcasts `sky:time`, so the topbar scrub label/position follow a site/date change instead of showing the previous night. |
| `CO-04` | low | `altaz()` can no longer return exactly 360 (or `-0`); the documented `[0,360)` range holds. |
| `CO-05` | low | `moonAge()`'s docstring now says it is a FOLDED 0..14.77 value, not a true age since new moon. |
| `CO-09` | low | `TYPE_LABELS`, `TYPE_COLORS` and `MOON_TYPE_FACTOR` are null-prototype, so a crafted `otype: "toString"` falls back instead of resolving an `Object.prototype` member; plus a `\|\| "unknown"` at the desktop sky-map call site. |
| `CO-10` | low | The web sky chart applies the shared magnitude rule to advanced rows too, so no-magnitude supplement objects reach the chart at the slider maximum. |
| `DE-01` | medium | An in-flight wizard validate is **reused**, not restarted, so a retry after the 20 s guard can no longer create a duplicate site. |
| `DE-02` | low | The DST-noon iteration sign is corrected (see §2); 19/19 goldens true, two wrong goldens fixed, two new pins. |
| `UI-02`/`UI-03`/`UI-04` | low/nit | Dome muted text lifted off the AA floor; the 320 px target-row overflow and the active-tab gradient contrast improved. |
| `UI-06`/`UI-07` | low | The alt-0 guide is always visible; the editor's zoom cluster no longer sits on top of the chart. |
| `UI-08`/`UI-09` | low | The Rig select and Weather chip no longer truncate mid-word (the chip's initial label was in `index.html`, not the function the review pointed at); classic's narrow min-alt row no longer garbles. |
| `SP-02` | medium (susp.) | The update checker validates the remote version string before display, and the JSONP risk is documented with the server-side remedy. **Not fully fixed** - see §5. |
| `CD-07` | low | The `web/app.js` comment no longer claims 12,160 objects. |
| all `DOC-*`, `CD-01`, `CD-06` | medium/low | Ten documentation defects: the AGENTS.md blurb, the weather/offline claims in README, the DESIGN.md token table, the test count, the "unreleased" marker, the duplicated bullet, the `check_js.py` docstring, the desktop 12,160 catalogue size, and the stale supplement docstrings. |
| `PY-01` | **blocker** | `/api/library/edit` no longer overwrites: `rename_archive_folder` uniquifies a colliding frame (`Light_001.fit` -> `Light_001_2.fit`) and returns a moved-frame map that `db.rename_images` consumes, so stored paths name files that really exist. **Verified by re-running the captain's original reproduction of the blocker** - see §5. |
| Python batch (rest) | medium..low | `PY-02`..`PY-10`, `SP-01`, `SP-03`, `SP-04`, `SP-05`, `CD-04` delegated to a dedicated workstream - outcomes recorded in §4. |
| guard/test batch | medium..low | `CO-01`..`CO-03`, `TR-01`..`TR-12`, `CD-08` delegated to a dedicated workstream - outcomes recorded in §4. |

### Deliberately NOT fixed

| id | why |
|---|---|
| `CO-07` | The two shells compute "% of night" on differently phased 6-min grids (80 vs 79 samples; 20-66 of 200 rows differ by up to 4 pp). Fixing it **changes user-visible planning numbers on the web** and would need a release note and a re-check of the min-visibility gate. It is a parity/consistency decision, not a bug fix - worth doing deliberately, not inside a fix batch. |
| `CD-02` | The desktop searches only the CSV `search` column while the web searches a merged blob, so 25 rows are findable on one side only. The web fix requires shipping the `search` column in `web/catalog.json` → a **`CATALOG_TOKEN` bump + manifest + payload rebuild**, and the desktop side touches `targets.js`. Contained, but a data-payload change belongs in its own commit. |
| `WE-04` | Custom targets dropped by an import stay in the in-memory catalogue until reload. Needs the import path in `app.js` to rebuild `CAT`/`byId` after a restore - moderate, and unverifiable without the browser. |
| `WE-05` | A pref/site/date change while the panorama editor is open resets the dirty baseline, so unsaved paint is silently lost. The fix is in the editor's history/dirty interplay (`horizon.js` + `app.js`) and really needs the browser to verify - it is the one remaining **medium** I would fix next. |
| `SP-07` | The web panorama upload has no size cap. Needs a chosen cap and an error path; low, and a product decision. |
| `SP-02` (fully) | JSONP means a third-party script runs in the privileged localhost origin. The real fix is **server-side**: serve `/downloads/version.json` with `Access-Control-Allow-Origin` (or serve it from our own origin) and drop the script tag. I validated the payload and documented it; I cannot change the host's headers from here. |
| `SP-06` | Unvalidated third-party JSON - **moot**: the fetch it referred to is gone (The popularity source is offline). |
| `SP-10` | `imgcache` is never pruned. A retention policy is a product decision. |
| `TR-12` | The desktop crop browser check still times out on a cold first launch (91.9 s vs a 90 s wait, then 3.0 s on re-run). Assigned to the guard workstream. |

---

## 4. Delegated workstreams - outcomes

Both workstreams ran with explicit file ownership (no overlap with the web/core
layer). I verified each outcome **myself, by inspecting the code and running the
suites**, rather than accepting the agents' summaries - their closing reports did
not arrive before they were stopped, so everything below is captain-verified.

### Python backend workstream - all assigned findings fixed

| id | verified fix |
|---|---|
| `PY-01` blocker | `rename_archive_folder` uniquifies (`Light_001_2.fit`) and returns a moved-frame map consumed by `db.rename_images`. **Re-verified with the original reproduction** (§5). |
| `PY-02` | `_validate_import_settings` now covers `min_vis` (`app/database.py`), so a crafted bundle can no longer brick `/api/state`. |
| `PY-03` | The restore's status is honest: `app/server.py:79` now says "the setup database was already replaced, so the ..." instead of reporting a clean rejection over a replaced library. |
| `PY-04` | Malformed-but-valid bundles raise `ValueError` (`app/backup.py:68,75,89,119`) → the documented 400 rather than a 500. |
| `PY-05` | 64-bit range guard on integer path params (`app/server.py`) → 404, not `OverflowError`. |
| `PY-06` | Payloads are written only for records the import actually stores, so the summary's `pano_images` matches reality. |
| `PY-07` | `_reject_duplicate_custom_ids` (`app/database.py:319`) now REFUSES duplicate custom ids instead of silently collapsing them while the summary counted both. |
| `PY-08` | `target.unlink(missing_ok=True)` on every failure path including `ClientDisconnect` (`app/ingest.py:180,191,194`), so a truncated `.fit` cannot survive to be reindexed. |
| `PY-09` | `classify_frame` handles "Master Dark"/"Master Flat". |
| `PY-10` | FITS cards whose keyword merely begins with `END` no longer truncate the header. |
| `SP-01` | A restore has both a per-member and an aggregate byte cap (`app/backup.py:57,68`). |
| `SP-03` | The `/api/shutdown` guard no longer fails open. |
| `SP-04` | `.gitignore` now covers `data/` (2 entries). |
| `SP-05` | `_CONTROL_RE` (`app/paths.py:42`) rejects C0 controls and DEL, which Windows refuses in a filename. |
| `CD-04` | `Database.advanced_count` is defined **once** (the shadowing duplicate is gone). |

### Guard/test workstream - all assigned findings fixed

`CO-01` (`.html` files now in `shell_sources`), `CO-02` (the MOVED regex),
`CO-03` (loader patterns), `TR-01`, `TR-02`, `TR-03` (`export … from` specifiers
resolved), `TR-04` (the tautology is gone: the check now asserts
`killed is True` **and** that the live worker was really terminated, which fails
on a no-op kill), `TR-05`, `TR-06`, `TR-07`, `TR-08` (`$changed` is used),
`TR-09` (the wording is consistent now: "a missing node is a HARD failure
(TO-03), not a silent skip"), `TR-10` (11 mutation-proof tests),
`TR-11`, `TR-12`, `CD-08`.

I confirmed agent G did **not** touch the `VERIFIED BASELINE` block in
`scripts/check_js_tokens.py` - `check_js_tokens: OK` passes against the baseline I
re-recorded while bumping tokens.

### The defect the work surfaced, fixed by me

`tests/conftest.py` now redirects `data_dir` for the whole suite (see §2). The
fix is pinned by `tests/test_never_touch_user_data.py`, which forces a real
panorama-payload write and proves both directions: **with** the guard the payload
lands in `logs/.pytest-data/panos` and the real `data/panos` stays clean;
**with the guard undone** the same import drops the file into the repo's real
`data/panos` - i.e. the guard is load-bearing, not decorative.

---

## 5. Verification evidence

Every claim above rests on one of these, all re-runnable from the repo root. The
one-off probes are preserved at `reviews/0.6.32-full/evidence/fix-verify/`
(`verify_ui_fixes.py`, `probe_tz_breadth.mjs`, `audit_noon_goldens.mjs`,
`probe_tz_halfhour2.mjs`, `fetch_popularity_once.py`); they were developed in the
gitignored `logs/` scratch. The numbers below are inlined so the record does not
depend on the scripts surviving.

One follow-up for whoever commits this: `AGENTS.md`'s test-count line says 512
"at the time of writing" and the tree now collects **547**; the sentence already
tells the reader to re-derive it, so it is stale-but-safe, not wrong in a way
that misleads.

**Guards and engines**

| check | result |
|---|---|
| `python scripts/check_js.py` | **OK** - 76 modules, 0 broken imports, 0 syntax errors; encoding, catalog-token, js-tokens (**self-test OK**), core and dom-ids guards all pass |
| `python scripts/check_core.py` | **OK** after the re-bake (hash `c91d198c1de72609`, stub token 24 -> 25) |
| `python scripts/check_js_tokens.py` | **OK** - baseline re-recorded for the ten modules whose tokens moved |
| node engines | **16 of 20 run standalone and pass** (all 16: `catalog_identity`, `core_d1`, `core_exports`, `derive_window`, `dom_handlers`, `night_race`, `noon_fallback`, `pano_geom`, `pano_mode_semantics`, `pano_ui`, `reference_anchors`, `scrub_degenerate`, `sky_band`, `sync_cache_key`, `web_backup`, `worker_lifecycle`) - including `pano_geom` after the `cropStrokes` change. The other four are **harness-driven, not failures**: `astro_parity` and `core_fixtures` print a `usage:` line and exit 2 without their `<engine>` / `<fixtures.json>` argument, and `scoring_parity` / `worker_bridge` need a worker context (`parentPort` is null outside one). pytest drives all four. |
| `tests/js/reference_anchors.mjs` | **19/19 checks pass, 0 failed** - Meeus/IAU 2006 precession, published moon phases, the ERFA lunar position, Bennett refraction |
| `tests/test_core_time.py` | **passes** with the corrected goldens + 2 new transition-day pins |
| `tests/test_no_popularity_fetch.py` | **4 passed** |
| token cascade | core re-bake moved the stub 24 -> 25, so every `./core.js?v=` importer was bumped and the AGENTS.md register updated to match; `test_cache_tokens.py` register check passes |

**UI fixes, measured in a real browser** (`logs/verify_ui_fixes.py`)

```
classic_320_docW                320      (was 548)
classic_360_docW                360      (was 548)
dome_320_docW                   320      (was 327)
classic_page_fits_at            [320, 360, 400, 480, 640, 768]
classic_still_overflows_at      []
classic_320_menu_onscreen       True
classic_320_tab4_onscreen       True
rig_label_clipped               False (both themes)
weather_label                   "Weather" (both themes)
```

**Timezone fix** (`logs/probe_tz_breadth.mjs`, `logs/audit_noon_goldens.mjs`)

```
9/9 zone-date cases match Intl after the fix (2 mismatched before)
19/19 noon goldens true; the 2 that were wrong are the LA transition days
```

**The blocker, re-verified with the original reproduction** (`reviews/0.6.32-full/evidence/verify/verify_py01_captain.py` - the same probe that PROVED the
blocker, driven only through the public API, so the before/after is like for like):

```
                       before the fix        after the fix
files_before_edit      2                     2
files_after_edit       1  (one destroyed)    2
destination EXPTIME    60.0 -> 120.0         60.0  (intact)
aliased files          1                     0
blocker_reproduced     True                  False
rows                   2 rows -> 1 file      2 rows -> 2 distinct files
                                             (Light_001.fit 60.0s, Light_001_2.fit 120.0s)
```

**Full suite and browser gate, on the settled tree**

| gate | result |
|---|---|
| `python -m pytest tests/ -q --tb=no` | **547 passed**, 0 failed, 169.42 s, **exit 0** (up from the review's 508 - the batch adds 39 tests) |
| `python scripts/check_js.py` | **OK**, exit 0 - 76 modules, 0 broken imports, 0 syntax errors, encoding OK, catalog-token OK, `check_js_tokens` self-test OK, **`check_core` OK**, dom-ids OK |
| `python scripts/check_browser.py --web` | **14/14 passed**, exit 0 - including the popularity source tripwire (every check ends in `assert_clean`) and `web-pano-crop-recalibrate` after the `cropStrokes` change |
| `python -m pytest tests/ --collect-only -q` | `547 tests collected` |

**The desktop browser gate was deliberately NOT run.** `dist/NightSeam.exe` is
still the **0.6.32 build**, so it embeds the old `static/` and the old baked
core: running `--desktop` would exercise frozen code, and `TR-04`'s new
assertion reads a worker hook (`__nsWorkerTerm`) that build does not contain, so
it would report a red that means "stale exe", not "broken code". Rebuilding with
`build.ps1` and then running `check_browser.py --all` is step 2 of the P0 list
below. Everything the desktop-side changes touch is covered meanwhile by the
suite, the JS engines, `check_core` and the token guards.

---

## 6. What I recommend, in this order

### P0 - before anything is released

1. **Land the blocker.** `PY-01` is silent, unrecoverable frame destruction
   reachable from the documented rename action; nothing else in this batch
   matters if that ships again.
2. **Commit, then re-run the gates on the committed tree** (`pytest`,
   `check_js.py`, `check_browser.py --all`). I ran them on a dirty tree, which is
   fine for development and not fine for a release.
3. **Release as `0.6.33` with a curated changelog entry** (AGENTS.md step 1,
   committed *with* the release), then tag, then
   `pre_tag_check.py 0.6.33`, `make_release.py`, `check_release.py`. The release
   note must call out the **two behaviour changes**: the DST-transition-day grid
   correction (`DE-02`) and the blocked->observable crop fix (`CO-08`).
4. **Deploy with `index.html` last** and then run the production smoke
   (`--prod-url https://nightseam.de/astro/`), because this batch moved **every**
   web cache token plus the core stub.

### P1 - the next work batch (data safety and parity)

5. **`WE-05`** - unsaved panorama paint being silently discarded on any
   preference/site/date change is the last user-visible medium with real data
   loss. Fix it with the browser open.
6. **`PY-02`/`PY-03`** if the Python workstream did not get them: a crafted
   `min_vis` bricking `/api/state` and a restore that reports rejection after
   replacing the library.
7. **`CO-07`** - decide the "% of night" phase question deliberately: either snap
   the web's scoring window to whole noon-grid steps, or document the difference
   and stop claiming numeric parity in `AGENTS.md`.
8. **`CD-02`** - ship `search` in the web payload (`CATALOG_TOKEN` bump + manifest
   in the same commit) and align the desktop search index.

### P2 - privacy and policy

9. **Make the offline rule explicit in `DECISIONS.md`**: the popularity snapshot
   is taken deliberately, rarely, via `--live`, and no shipped code path may
   contact a third party at boot. The tripwire in the browser gate and
   `test_no_popularity_fetch.py` are what enforce it.
10. **`SP-02` server-side**: add `Access-Control-Allow-Origin` for
    `/downloads/version.json` (or host the version check on our own origin) and
    delete the JSONP script tag. Until then the desktop loads one remote script
    into a privileged origin.
11. ~~Decide whether the raw snapshot should be tracked~~ - **decided:** the
    snapshot stays where it is, frozen and offline. No fetch path remains
    (`--live` was removed outright in the final pass, so the matcher has no
    network machinery at all), and the shipped artefact is the derived
    `app/popularity_data.py`, which is tracked.

### P3 - hardening and tooling

12. **The guard cluster** (`CO-01`..`CO-03`, `TR-01`..`TR-12`, `CD-08`): guards
    that pass while the thing they name is broken are how `CD-01` survived two
    releases. The one-line summary is in the review's §"guard cluster".
13. **`TR-12`** - warm the exe before the timed browser checks, or raise that wait
    above the measured 92 s cold start. A red gate should mean a regression.
14. **`SP-04`** - add `data/` to `.gitignore` patterns so an interrupted export
    cannot leave the user's whole setup one `git add -A` away from being
    committed.

### P4 - polish

15. **`UI-05`** and the non-promoted visual observations (the odd `transit`
    emphasis, dome dropping the moon chip at 900 px, the dome scrub slider
    reading as a bare thumb). Cheap, and they are the things a user notices.

### Process

17. **Re-run this review's shape after the next feature batch**, and keep the two
    habits that paid off here: (a) verify every high/blocker by an *independent*
    reproduction - it is what turned `PY-01` from a claim into a proven blocker,
    and (b) audit golden values against an outside authority - it is what exposed
    two goldens that had blessed a bug for a release.

---

# Batch 2 - the ten open findings and the six investigation items

Everything in §3 above was batch 1. This section closes the list I reported as
open afterwards.

## 8. The ten open findings, all now fixed

| id | sev | fix |
|---|---|---|
| `WE-05` | medium | The editor's history baseline now SURVIVES a re-render: `renderHorizon()` reuses the session's history when the same panorama is re-rendered (`web/horizon.js`), so a pref/site/date change can no longer flip the chip to "Saved" and disarm the flush-on-leave and `beforeunload` guards. **Proven with a new gate check**: `web-pref-change-keeps-unsaved-paint` PASSES with the fix and FAILS (`'Unsaved' not in 'Saved'`) when `samePano` is forced false. |
| `CD-03` | low | Both CSV readers use `csv.reader(delimiter=";")` now (`app/database.py`, `scripts/match_popularity.py`), with 8 new tests including quoted/semicolon fields. |
| `CD-05` | low | The matcher's index uses one deterministic shared helper (highest score, then source order). `app/popularity_data.py` deliberately NOT re-baked - the only affected shipped key is `ngc6542` (3 -> 115), far outside the standard-mode cut; see §10. |
| `CD-02` | low | `search` now ships in the payload (`web/build_web.py::COLS`) and is indexed by `core/catalog.js::searchBlob`; `CATALOG_TOKEN` 9 -> 10 + manifest + core re-bake. New gate check `web-search-indexes-the-designation-blob` proves `tarantula`/`coathanger`/`silver coin` resolve. **Cost: `web/catalog.json` 3,834,258 -> 5,088,280 bytes (+33%)**. |
| `WE-04` | medium | `syncCustomTargets()` makes `CAT`/`byId` match the store exactly after an import, so a custom the bundle dropped stops being listed/searchable/drawn immediately instead of after a reload. |
| `CO-06` | low | The precession ROTATION ORDER is now pinned by an independent transcription (literal `Rz(z)·Ry(-theta)·Rz(zeta)` matrices) with a 1e-6 arcsec tolerance, plus a chord-exact `sepArcsec` because the old `sepDeg` (acos) floors at ~4e-3 arcsec. Mutation-proven: middle-axis-X fails 8 checks, Y-last 4, zeta<->z swap 2 - and the zeta<->z swap (1.35e-4 arcsec at J2026) is caught by NO other check at the app's epoch. Anchors 19 -> 21; `core/` untouched. |
| `SP-06` | low | `popularityOf()` guards the baked value with `Number.isFinite`, so a non-numeric field cannot feed `NaN` into the ranking comparator. |
| `SP-07` | low | Panorama uploads are capped at 25 MB with an explanatory message (both the picker and drag-and-drop), instead of decoding an unbounded photo into memory for the session. |
| `SP-10` | low | `app/images.py` enforces a 384 MB byte cap + 180-day age cap on cache writes (cheap counter, scan at most every 64 writes, 5-minute grace so a file about to be served is never evicted) and `POST /api/images/cache/clear` clears it. No UI control yet (needs `setup.js`). |
| `SP-02` | medium | Moved server-side: `POST /api/update-check` fetches and validates the version document in Python; the JSONP `<script>` and `window.__NS_RELEASE` are gone, and a CSP header (`script-src 'self' 'unsafe-inline'`, no remote script) is attached to every `text/html` response. |

## 9. The investigations

- **The "one row's transit is bright" observation is REFUTED and was a
  misreading.** There is no per-row condition: `web/app.js:745` bolds the current
  altitude and `:750` bolded `transit`, and because row *k* of the two
  side-by-side cards shares a y-band, one visual band showed a bright right-card
  `transit` beside muted left-card ones. Measured on the shipped PNGs: `transit`
  is bright in 8 of 8 right-card rows and muted in 8 of 8 left-card rows.
  The genuine defect was that **the same `transit HH:MM` label carried different
  weight in two adjacent sibling panels** - fixed by bolding each card's OWN lead
  number. `reviews/0.6.32-full/55-ui-visual.md` is corrected accordingly, with the
  two adjacent oddities recorded: `transit` is really a window-clamped max-altitude
  sample (a misleading label), and `.p-right b { display: block }` sits the bold
  stat ~16 px above its object's name (the likely cause of the misattribution).
- **The CSP is verified against the real server** (the one claim the workstream
  could not check): `logs/verify_csp.py` boots `create_app` under uvicorn, reads
  the served header, stores a theme, reloads, and confirms
  `inline_bootstrap_ran: "dome"` - so the desktop still boots with the policy -
  with no console errors. It also shows `inline_onerror_fires: true`, which
  **refutes** the feared cosmetic regression: `'unsafe-inline'` permits inline
  event handlers, so the two `onerror=` fallbacks in
  `static/js/{targets,tonight}.js` keep working and need no change.
- **`data/panos` pollution, root-caused and pinned.** `app/backup.py` binds
  `data_dir` via `from .paths import data_dir`, so `test_api.py`'s client fixture
  (which patches only `app.server.data_dir`) did not protect the pano write; the
  test that guards it reads that same REAL directory, so it only polluted **when
  failing**. `tests/conftest.py` now redirects `paths.data_dir` **and** the
  `app.backup`/`app.server` bindings. `tests/test_never_touch_user_data.py`
  proves both directions: with the guard the payload lands in
  `logs/.pytest-data/panos` and the repo's `data/panos` stays clean; with the
  guard undone the same import drops the file into the real `data/panos`.
- **A guard defect found while doing this, and fixed.**
  `scripts/check_catalog_token.py`'s `_git()` used `text=True` with no
  `encoding=`, so git's diff was decoded with the platform default (cp1252); any
  non-ASCII byte in the diff raised, the bare `except` returned `None`, and the
  guard then reported a **false** "CATALOG_TOKEN ... does not [differ]" for a
  perfectly correct bump. It now decodes as UTF-8 with `errors="replace"` and, if
  the diff still cannot be read, says so instead of claiming a missed bump.

## 10. Decisions taken (recorded in `DECISIONS.md`)

- **`CO-07` is documented, not unified.** Both candidate fixes change
  user-visible planning numbers on the public web app (and one reaches into the
  time model the scrub, charts and tier/min-visibility checks are built on), so
  it is a release-level change. `AGENTS.md`'s false parity claim ("the web scores
  the same window as the desktop on a 6-min grid") is replaced by the measured
  divergence.
- **`CD-05` is fixed in the matcher without re-baking popularity**, for the
  reason in §8.
- **`CD-02`'s +33% payload** is accepted deliberately, for the search capability.

## 11. Where the objective stands

- **74 of 74 review findings are now fixed or explicitly documented** (batch 1:
  63 fixed + 1 reclassified coverage note; batch 2: the remaining 10).
- **Gates, batch 2 (settled tree, final):** `pytest` **582 passed, 0 failed**
  (181 s); `check_js.py` **OK** (all seven hard guards, both refreshed
  baselines, `check_core` OK after the re-bake); browser gate **`--all`
  `24/24 passed`** - 16 web checks (including the two new ones) **and all 8
  desktop checks against a FRESHLY BUILT exe**, which is what closes the last
  verification gap: the desktop shell boots with the new CSP, `TR-04`'s
  worker-kill assertion passes on a fresh build, and the popularity source tripwire
  holds on both shells.

  Note on that build: `build.ps1` **refused** a clean bake (`refusing to bake
  version '0.6.32-3-g3277846-dirty': the working tree is dirty ... and HEAD is
  not exactly a git tag`) - the release-integrity guard working exactly as
  documented - so the exe was built with `-AllowDirty` and is labelled
  **`0.6.32-3-g3277846-dirty`**. It is a verification snapshot, NOT a release
  artifact: a real release still needs the curated changelog entry, a commit
  and a tag first, in the documented order.
- **Still outstanding, and why:**
  1. ~~The desktop browser gate has never run against current code~~ -
     **CLOSED**: `dist/NightSeam.exe` was rebuilt (dirty snapshot, see above)
     and `check_browser.py --all` is 24/24.
  2. **The visual-review coverage gap**: no screenshots exist of Sky View, the
     Targets table, the desktop shell, or any empty/error/daytime state (the
     vision pass covered Tonight + the editor). Capturing and interpreting those
     is a separate pass.
  3. **`SP-10` has no UI control** (the API endpoint exists; wiring a button
     needs `static/js/setup.js`).
  4. **Untracked review artifacts.** `reviews/`, `FIX-REPORT-0.6.33.md` and
     `REVIEW-PROMPT.md` are untracked and I did NOT commit anything: commits and
     tags here are tied to a release (and `build.ps1` refuses to bake a dirty
     tree on purpose - it refused exactly that when I tried, which is the guard
     working).
  5. **The vision route is OUT OF SCOPE by your instruction** - it must not be
     set, so the screenshot-interpretation half of the visual lane stays open
     and is explicitly NOT something this session will resume.
