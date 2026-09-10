# NightSeam remediation 0.6.9 — working change log

Companion to `AUDIT-0.6.8-handover.md` (the audit). Records every fix made
during controlled remediation: finding → root cause → files → fix → tests →
verification. **No release was built, tagged or deployed.**

Baseline: `HEAD = a777d88` (`v0.6.8` + one docs commit), 162 tests, all green.
After remediation: **346 tests, all green** (see "Validation" at the end).

---

## C2 — arbitrary file read via a crafted backup import (security)

* **Root cause:** two sides of the same feature disagreed about path safety.
  `backup.apply_import_zip` validated the path it *wrote* (`_safe_join`) but
  `database.import_bundle` stored `panoramas[].file` / `images[].file` verbatim,
  and the read/delete routes joined that value onto `data/panos` (or the archive)
  with no containment check.
* **Proof of the old behaviour:** `logs/audit_probe_pano_traversal.py` imported a
  ZIP with `file = "../../README.md"` and `GET /api/panorama/evil/image`
  returned **HTTP 200 with the repository README**. Re-run after the fix:
  the record is dropped (`panoramas: 0`) and the route answers **404**.
* **Fix:**
  * `app/paths.py`: new `safe_rel()` (canonicalizes untrusted relative paths:
    rejects absolute, UNC, drive-absolute/relative, `..`, NUL, empty; normalizes
    separators/`.`/duplicates) and `safe_join()` (resolves under a root and
    refuses escapes, including symlinks).
  * `app/database.py`: `import_bundle` runs every imported `file` through
    `safe_rel` and **drops** records that fail; it now returns the drop counts.
  * `app/backup.py`: `_safe_join` delegates to `paths.safe_join`; the restore
    loops write only the canonicalized path; the summary reports the real counts.
  * `app/server.py`: `api_pano_image`, `api_pano_replace_image` (it unlinked the
    old file!), `api_delete_pano` and `api_image_preview` all resolve through
    `safe_join` and answer 404 on an escape; the self-heal glob is gated by
    `_PID_RE` so a path parameter cannot smuggle glob metacharacters.
* **Tests:** `tests/test_paths.py` (new — reject/accept tables, symlink escape),
  `tests/test_backup.py` (records with `../`, `..\`, absolute, `C:`, UNC are
  dropped entirely; legitimate sub-folder paths are canonicalized),
  `tests/test_api.py` (`test_pano_image_never_leaves_the_pano_folder`,
  delete/replace cannot touch outside files, preview refuses, plus
  "legitimate file still served" cases).
* **Verified:** 91 tests green; exploit probe now 404 (no secrets or file
  contents are printed by the tests — they use a synthetic marker string).

## C1 — wrong precession in all three engines

* **Root cause:** `_precess_j2000_to_date` composed `Rz(−ze)·Rx(θ)·Rz(−ζ)`; Meeus
  ch. 21 needs the middle rotation about **Y** and the opposite node sign. The
  inverse was built from the same wrong matrix, so the round-trip test passed
  while catalog coordinates were effectively **not** precessed (the vernal
  equinox moved 0.0004° instead of 0.34° over 26.6 years).
* **Fix:** `app/astro.py` now has `_precession_angles()` + a single `_precess()`
  implementing eq. 21.4 (`A/B/C`, `α = atan2(A,B) + z`); the inverse uses
  `(ζ, z, θ) → (−z, −ζ, −θ)`. The same equations replaced the rotation in
  `static/js/astro.js` and `web/astro.js`.
* **Tests (independent correctness, not parity):**
  `test_precession_matches_meeus_reference` (6 epochs × 8 points against a
  reference transcription of eq. 21.4 in the test file),
  `test_precession_moves_the_vernal_equinox_at_the_published_rate`
  (m = 3.07496 s/yr, n = 20.0431″/yr), `test_transit_altitude_uses_the_precessed_declination`,
  and `test_m13_transit_berlin` tightened to 0.1° with the of-date declination.
* **Tests (cross-engine parity, new `tests/test_js_parity.py` + Node harness
  `tests/js/astro_parity.mjs`):** desktop and web engines vs Python for
  precession (both directions), alt/az, GMST, sun and moon — 4 epochs × 6 points,
  tolerance 1e-9°.
* **Verified:** `logs/audit_probe_precession.py` now reports **0.0000° separation**
  from the independent reference at every point, and the vernal-equinox rates
  match exactly. Sun/moon/twilight were never affected (round trip exact to
  1e-6°; `logs/audit_probe_roundtrip.py`) — pinned by
  `test_web_sun_and_moon_parity_with_python`.
* **Note:** `sun_ra_dec` now returns *genuine* J2000 coordinates (its documented
  contract) instead of the old, coincidentally of-date values;
  `test_sun_position_august_2026` pins both frames.

## C3 — clear-window off-by-one

* **Root cause:** `longest_run`/`longestRunJS` return a **half-open** range
  `[start, end)`, and `end` can equal the grid length; the consumers indexed
  `times_iso[end]` (undefined) → `--:--` in the Targets/Tonight lists, `NaNh NaNm`
  in the detail modal, and a chart band drawn past the last sample.
* **Decision (documented contract):** keep the half-open semantics
  (all `best[1]-best[0]` length comparisons stay valid) and resolve the boundary
  for display. `end` is the boundary *after* the last visible sample; duration is
  `(end - start) * step`; the run covers `end - start` samples; `end` is never an
  index into `times_iso`.
* **Fix:** `app/nightcalc.longest_run` documents the contract; `object_detail`
  ships `step_min` so the client can resolve the boundary; `static/js/derive.js`
  gained `windowEndISO(timesIso, end, stepMin)`; `windowText`, the detail modal's
  `durStr` (now also NaN-guarded) and the chart highlight (clamped to the last
  sample) use it.
* **Tests:** `tests/test_horizon.py` edge cases (run at index 0, run of length 1,
  run reaching `n-1` → `end == n`, whole grid clear/blocked, competing runs,
  tie → first) + `tests/test_js_parity.py` window parity over the same flag sets,
  including "end is never undefined for a full-grid run".

## C4 — advanced-mode night load could paint a superseded payload

* **Root cause:** `night.js` checked supersession only *before*
  `await synthesizeAdvancedTracks(N)`; the state assignment, the timeline, the
  slider and `setBusy(false)` after it were unguarded.
* **Fix:** re-check the control token after the await (and guard `setBusy(false)`).
* **Test:** `tests/js/night_race.mjs` (new) drives the **real module** against a
  stub DOM/fetch with 600 advanced objects and asserts a superseded load neither
  commits nor clears busy. Verified both ways: with the guard removed the harness
  fails ("a superseded load overwrote S.night"); with the fix it passes.
  Wired in as `tests/test_js_behaviour.py::test_night_load_supersession_invariant`.

## C5 — desktop/web scoring drift

* **Root causes / decisions:**
  1. *Twilight window* — the web scored over the **civil** window; the desktop
     prefers **astronomical → nautical → civil → sunset/sunrise**
     (`app/planning.py`). Decision: the desktop rule is the product behaviour
     (the UI even says "share of the astronomical night").
  2. *Moon reference time* — the web used `moonIllumination(now)` while computing
     `moonAge` at the planned night's midpoint; the desktop uses the planned
     night. Decision: planned night (its midpoint).
  3. *Filters* — `prefs.filters` was read but **never written** (dead branch),
     locking the web to the 120° broadband base while the checkboxes persist as
     flat `fltBb/fltHa/fltOiii`. Decision: the flat prefs the UI actually writes
     drive the base (OIII 90 / Ha 60 / broadband 120), matching the desktop.
  4. *Grid* — web 10 min vs desktop 6 min. Decision: 6 min, one definition.
  5. *`moonAware` default* — web `true`, desktop/server `false`. Decision: false.
  6. *Bortle/min-alt/type factors* — already identical (now pinned by a test).
* **Fix:** `web/app.js` has ONE `nightWindow()` (used by both the catalog %
  column and the Tonight ranking) built on `web/astro.js`'s new
  `pickDarkWindow()`; the moon curves moved into `web/astro.js`
  (`moonMinDist`, `effectiveMoonGlow`, `moonPenalty`, `bortleMoonFactor`,
  `MOON_TYPE_FACTOR`, `moonSensitivity`) and are exported from
  `static/js/derive.js` too; the topbar chip and the Moon card report the
  anchored night's moon; `web/horizon.js` defaults `moonAware: false`.
* **Tests:** `test_desktop_and_web_scoring_model_are_identical` compares both
  implementations across filter types × moon ages × illumination × separation ×
  object types × Bortle 1-9 (tolerance 1e-12);
  `test_web_twilight_choice_rule` / `test_python_twilight_choice_rule` pin the
  cascade and the polar fallback (20:00 → 04:00, now applied inside
  `pickDarkWindow` so both call sites share it);
  `test_web_and_python_agree_on_the_real_dark_window` compares real sun geometry
  in UTC ×2 and Australia/Sydney.
* **Deliberate non-change:** the web's "filter owned" badge and the desktop's
  `filterAdvice` pill answer different questions (ownership vs advice). They are
  display-only; no scoring input differs. Documented rather than unified, to
  avoid inventing UI.

## C6 — web cross-timezone anchoring (open question, resolved)

* **Mechanism:** `nightInfo()` anchored its 48 h scan at **browser**-local
  midnight of the site's calendar date, while times render in the **site** zone.
  Measured (`test_web_cross_timezone_anchoring_is_site_based`): the old anchor
  produced a **>24 h "night"** with the site either EAST (Honolulu browser,
  Berlin site: 35.4 h) or WEST (Berlin browser, New York site: 35.4 h) of the
  browser — the reviewers' disagreement about the sign is moot; both directions
  break, only the margin differs.
* **Fix:** `nightInfo(localDate, lat, lon, localNoon)` takes the real instant of
  the **site's** local noon; `web/app.js` computes it with a new `siteNoon()`
  helper (via `webstore.wallToUtc` — the helper that already existed for the
  sky-view anchor) and passes it from all three call sites. The detail modal's
  `objectDayInfo` start and the chart's polar fallbacks are site-anchored too.
* **Verified:** site-anchored windows now match `app/planning.night_window`
  within 3 minutes in all five tested configurations (same zone, Sydney,
  cross-zone east and west). No browser was available; the reproduction is a
  deterministic Node computation, not a live click-through. **Not verified in a
  real browser** — see "Remaining risks" below.

## C7 — release / build / version integrity

* **Fixes (by a delegated workstream, independently re-verified here):**
  * `build.ps1`: every native call's exit code is checked; a dependency probe +
    requirements fingerprint installs only when needed and throws listing any
    module still missing; a venv without an interpreter is recreated; the bake
    refuses a dirty tree / off-tag HEAD unless `-AllowDirty`, reads the baked file
    back, and throws instead of silently falling back to `dev`.
  * `scripts/check_release.py` (new): standalone pre-flight that cross-checks
    `git describe`, the baked version, the exe's age, `web/version.json`,
    `landing/changelog.json` and the staged artifacts; exits non-zero on
    mismatch.
  * `scripts/make_release.py` runs that check **before** staging; a stale exe can
    no longer be published under a new version.
  * `web/build_web.py` uses `git describe --dirty` and refuses to guess.
  * `scripts/build_changelog.py --check` exits non-zero for tags since the newest
    curated entry.
  * `requirements-dev.txt` declares Pillow (imported by `scripts/make_icon.py`).
* **Verified here:** `python scripts/check_release.py` → exit 1 with exactly the
  three real problems (dirty/off-tag tree, `app/_version_baked.py` = 0.6.0 vs
  describe, stale `dist/release/version.json`) and a changelog warning;
  `tests/test_release_check.py` → 41 passed. `make_release.py` aborts before
  staging. **`build.ps1` was not executed** (it would pip-install and build).

## Additional confirmed defects

| Item | Verdict | Fix / decision | Tests |
|---|---|---|---|
| Upload caps only after Starlette spooled the body | real | `_MAX_REQUEST_BYTES` + `Content-Length` check in the guard middleware (413 before parsing) and `MAX_FILES_PER_REQUEST` on ingest; docstring no longer overclaims | `test_oversized_request_body_is_rejected_before_parsing`, `test_too_many_files_in_one_ingest_request` |
| Permanent image 404s retried forever | real, **two** causes | (a) `_is_temporary()` classifies HTTP codes explicitly (HTTPError is an OSError, so *everything* looked transient); (b) the negative marker was written to the `.json` but `cached()` required the `.bin` too, so it was never read | `test_http_status_classification`, `test_permanent_failure_is_negative_cached` |
| Unbounded image reads | real | `_http_bytes` streams with `MAX_IMAGE_BYTES` (12 MB) and raises `Temporary` beyond it | `test_image_download_reads_are_capped` |
| TLS verification disabled for the DSS host | real (bypass scope) | kept the documented unverified context for the known-broken CDS host, but matched by **exact host name** (`alasky.cds.unistra.fr`), not a substring that also matched `cds.unistra.example.com` | `test_the_insecure_tls_context_is_limited_to_exact_cds_hosts` |
| Panorama profiles fail open | real | `_check_profile` rejects wrong-length/non-finite profiles at the API (400) so the DB cannot hold one; the read path still degrades to "nothing blocks" and now **logs** it | `test_panorama_profile_length_and_types_are_validated` |
| Deleting the active site strands planning | real | `Database.delete_site` repoints `active_site_id` to another site or `None`; `_check_site` rejects impossible coordinates | `test_deleting_the_active_site_keeps_planning_usable`, `test_site_coordinates_are_validated` |
| `/themes.css` missing the no-store rule | real | added to the UI no-store list | `test_ui_assets_are_never_cached` |
| XSS via imported backup JSON | real (import-reachable) | escaped the three `otype` sinks and the panorama `id` in `web/`; `webstore.restoreBackup` now coerces/drops untrusted records (also fixes the "one bad record breaks the Setup dialog" crash) | covered by the parity/JS checks; no browser test available |
| Polar `NaNh NaNm` | real | `durStrLocal` guards missing dusk/dawn; `nightIndexRange` guards null dusk/dawn explicitly | (JS-only; exercised through the module harness pattern) |
| Dead `/api/images/{id}/preview` | investigated | **kept deliberately** — see "Not fixed" below | path handling hardened (C2), preview test extended |
| Untested guard middleware | real gap | 403s for cross-site/foreign-Origin/foreign-Host, 200 for same-origin, and the rejected POST really changes nothing | `test_cross_site_requests_are_rejected`, `test_foreign_host_header_is_rejected` |
| Untested port handoff | real gap | `tests/test_main.py` (new): live/stale/corrupt `instance.json`, `port_in_use`, `free_port` busy/free | 8 tests |
| Untested `paths.py` | real gap | `tests/test_paths.py` (new) | 20 tests |
| No Py↔JS parity coverage | real gap | `tests/test_js_parity.py` + `tests/js/astro_parity.mjs` (precession, alt/az, GMST, sun/moon, window contract, twilight rule, scoring curves) | 17 tests |

## Bug-pattern sweep (same class, other places)

* **Untrusted paths**: every place that opens a path derived from stored or
  imported data was re-checked. `obj_slug` strips everything outside
  `[A-Za-z0-9 _-]` (so renames cannot traverse); `_archive_target` uses
  `Path(name).name`; `api_library_open_folder` already had containment;
  `_export_zip_to` already used `_safe_join`. The only unprotected readers were
  the four routes fixed in C2.
* **Coordinate transforms**: `_precess_*`, `altaz`, `gmst_deg`, sun/moon and the
  two JS mirrors are now compared against one reference (C1 tests).
* **Index assumptions**: `longest_run` (C3) was the only exclusive-end consumer;
  other `best[...]` uses are length comparisons and stay valid.
* **Stale async UI updates**: `night.js` (C4) was the only
  response-then-await-then-commit path; other views re-check their view token
  before painting (`renderTonight`, `renderDetailMeta`).
* **Scoring/parity functions**: the desktop's curves are now exported and
  compared with the web's on one grid (C5).
* **Version strings**: `scripts/check_release.py` covers the artefacts; the only
  remaining hard-coded user-visible version is `web/index.html`'s footer, which
  reads `version.json` at runtime.

## Addendum — post-remediation review pass (same session)

An adversarial review of this working tree (diff + code + probes + a live browser
run) confirmed C1, C3, C4, C6, C7 and most of C2/additional fixes, and found
**five things this document previously over-claimed or missed**. All five are
fixed and have regression tests; the full suite is 365 green.

1. **Panorama IDs were a path input.** `POST /api/panorama/{pid}/image` builds
   `f"{pid}.{ext}"`, and imported ids were not validated, so a crafted bundle
   could plant an id that made the crop tool write outside `data/panos`
   (proven: `data\panos\...\evil.<hex>.upload.tmp` → HTTP 500; with `.\evil` a
   temp file landed in `data/`). Fixed with `paths.safe_token()` at the API
   boundary (`_pano_or_404`) and in `Database.import_bundle`, plus a test for six
   encoded id spellings. `paths.safe_rel` also now rejects segments Windows
   would rewrite (trailing dot/space, all-dots, device names) and `safe_join`
   refuses the root itself (the `...`-class 500).
2. **The import's archive ROOT was attacker-controlled.** `settings.image_dir`
   from the ZIP was stored verbatim and then used as the write target for
   `library/*` and as the read root for `/api/export` — arbitrary write with
   arbitrary name/extension/content (e.g. into a Startup folder) and arbitrary
   read out of any directory the app can reach. `apply_import_zip` now ignores
   the imported value, re-injects the **local** configured archive (the settings
   replace would otherwise reset it to `~/Documents/...`) and reports
   `image_dir_ignored`. Tests: hostile value ignored, omission preserves the
   user's archive, file lands in the configured root.
3. **The desktop measured its clear window / score over the payload's twilight
   margins.** Measured on a real payload: 164/197 objects, worst `jones1`
   690 min spanning 19:37–07:01 for a 20:37–06:02 night. `derive.js` now clips
   the window, the `% of night` and the score to `dusk..dawn` (the web already
   did), and `/api/object/{oid}` clips its 4-min window the same way, so the
   table and the modal agree. New harness test `tests/js/derive_window.mjs`.
4. **`obs_pct > 100 %` was reported by the review but is NOT real** — measured
   max is exactly 100 (the numerator is clipped at `derive.js`). Recorded here so
   the claim is not carried forward.
5. **C6 is now verified in a real browser**, not just by computation: Playwright
   + system Chrome with emulated timezones, running the production modules.
   Site-anchored windows match `app/planning.py` to 0.0 s in four configurations
   (site == browser, site 11 h east, site 6 h west, Berlin DST-switch night),
   while the old browser-anchored call reproduces 35.9 h / 35.4 h "nights" —
   both directions break, which settles the earlier sign disagreement.

Still open (see the review report in the session): three release-checker
bypasses, the remaining desktop/web UI-level divergences, the weak-test list,
and `check_js.py`'s missing syntax pass. **Nothing has been committed, tagged,
built or deployed.**


## Validation (final, after the review pass)

| Check | Result |
|---|---|
| `python -m pytest tests/ -q --tb=short` (full access) | **365 passed** in 68 s |
| `python -m pytest tests/test_release_check.py -q` | 41 passed (the new pure tests need no tmp dir) |
| `python scripts/check_js.py` | checked 25 JS files, 0 broken imports, all DOM ids resolve in both apps (2 heuristic false positives) |
| `node --check` on all 9 touched JS files | 0 failures — and it caught a **duplicate `moonMinDist` declaration in `web/app.js`** that `check_js.py` cannot see (it only checks imports/ids). Worth adding a syntax pass to that script. |
| `python -m py_compile` (every touched Python file) | OK |
| `node tests/js/night_race.mjs` | passes with the fix, fails with the guard removed |
| `python scripts/check_release.py` | exit 1 — correctly reports the *real* unreleased state (dirty tree, stale baked 0.6.0 exe, stale staged version.json) |
| Build | **not run** (pip-install + PyInstaller; out of scope for remediation) |
| Deploy | **not run** |

Sandbox note: pytest needs full filesystem access here (`tmp_path` DACLs), the
Node harnesses need piped stdio, and three probes in `logs/` were used for the
security/correctness evidence. All were run with `danger-full-access`.

## Not fixed (deliberate)

* **Dead preview endpoint** (`/api/images/{id}/preview` + `fits.preview_png*`):
  no client calls it, but it is reachable, loopback-only, documented as
  test-only in `AGENTS.md`, and backed by a working, tested FITS→PNG renderer.
  Removing it would delete a real capability for no security gain (its path
  handling is fixed and its tests pin the behaviour). Decision: keep, revisit if
  the owner confirms no external use.
* **`web/img` (≈21 MB) and the 4 MB `catalog.json` in git**: deliberate
  packaging decisions, not defects.
* **`README.md`/`AGENTS.md` prose drift** beyond the targeted updates below
  (e.g. README still says weather is "not included", that pyinstaller is the only
  dev dependency, and repeats the timezone bullet twice) — documentation-only,
  listed in the audit so the owner can decide on wording.
* **Unrelated style cleanups** (dead `_ingestCache`, `.frame` CSS,
  `profile_len`, `observations` accessors, duplicated `fov_arcmin`): real dead
  code, but harmless and out of scope for a correctness/security remediation; all
  are listed in `AUDIT-0.6.8-handover.md` section D.
