# NightSeam 0.6.8 — handover audit (read-only)

**Scope:** the whole working directory `<workspace>\AstroPilot-local` at `HEAD = a777d88`
(`v0.6.8` + one docs commit). Working tree clean before and after the audit.
**Date:** 2026-09-10.
**Rules observed:** no file in the repo was modified, no refactor, no dependency
change, no deploy. The only files written are four probe scripts under the
gitignored `logs/` (listed in the appendix) plus pytest's own caches.

**How findings are labelled**

* **confirmed** — reproduced by executing code or verified line-by-line by me.
* **likely** — code evidence is specific and consistent, but I did not execute it.
* **unclear** — looks odd, may be intentional; listed as a question, not a defect.

Everything below was re-checked against the code by me; where I rely on a deeper
reading done in parallel (frontend, web, tests, tooling), that is stated and the
decisive lines were re-read. Claims I could not verify are marked as such.

---

## A. Project Understanding

**NightSeam** (renamed from *AstroPilot* at 0.6.0) is a **desktop deep-sky
astrophotography planner** for one specific problem: *"what can I actually shoot
tonight from my own backyard, given the trees/houses in the way?"*

It ships as a **single Windows executable** that starts a **local FastAPI server**
and serves a **vanilla-JS, ES-module UI** (no bundler, no npm) into a pywebview
window or the browser. All astronomy is computed locally in pure Python (Meeus
algorithms) — no numpy/astropy, no network needed except optional Wikipedia
example images, an optional weather panel (Open-Meteo) and a once-per-start
update check.

**Intended user:** an amateur astrophotographer with a fixed observing spot.
Two personas are served: the *planner* (sites, rigs, panorama horizon, tonight's
targets) and the *archivist* (FITS ingest, session archive, library rollups).

**Main workflow (Night Planner):** first-run wizard → site (lat/lon/elev) → import
a 360° panorama, calibrate it and paint obstacles → "use for planning" → pick a
date → the app computes twilight, moon, and per-object alt/az/obstacle tracks →
*Tonight*/*Targets*/*Sky View* rank and visualise what is observable.

**Main workflow (Image Catalog):** pick an archive folder → drop FITS frames →
each frame is classified (light/dark/flat/bias), matched to a catalog object,
and copied into `<archive>/<Object>/<session>/<frame-type>/` → library rollups
and import history, CSV/JSON export, reindex from disk, backup export/import.

**A second, static implementation exists:** `web/` ("NightSeam Web") is the same
planner running 100 % in the browser (own JS astronomy mirror, IndexedDB for
sites/rigs/custom targets, `catalog.json` baked from the DB), deployed to
`nightseam.de/astro`. It shares the repo's version line with the desktop app.

**Assumptions the software makes (important for judging it):**

1. Single user, single machine, **loopback only**; there is no authentication —
   security relies on the Host allow-list + same-origin guard.
2. A user database (`data/nightseam.db`) **outlives the code**, so schema
   evolution must be additive.
3. Exact altitude matters more than anything else (obstruction testing), which is
   why the accuracy claims in the docs are load-bearing. **This is where the most
   serious defect lives (§C1).**
4. Sessions are identified from FITS `DATE-OBS` with a 12-hour gap rule and are
   *named* by machine-local wall clock (`AGENTS.md` documents the resulting
   one-day display difference as expected).

---

## B. Architecture

```
main.py                     entry point: argparse, single-instance handoff,
                            uvicorn in a daemon thread, pywebview window
                            (browser / --app fallback), idle exit, /api/shutdown
  app/paths.py              source-vs-PyInstaller path resolution (data/, logs/, static/)
  app/database.py           SQLite (one connection + RLock), SCHEMA, additive migrations,
                            catalog seeding, settings as JSON, import_bundle (transactional)
  app/server.py             create_app(): all /api/* routes + guard middleware + static mount
    ├── app/nightcalc.py    compute_night() / object_detail(): grids, ceil_lookup, longest_run
    │     └── app/planning.py   night_window()/find_twilight() — single twilight source of truth
    │           └── app/astro.py  Meeus engine (precession, sidereal time, sun, moon, refraction)
    ├── app/ingest.py       streaming FITS ingest, frame classification, archive layout,
    │                       session folders, reindex, rename
    ├── app/imglib.py       catalog resolution + library grouping/rollups + session math
    ├── app/backup.py       export/import ZIP (settings, sites, rigs, panos, customs, library)
    ├── app/images.py       Wikipedia/Wikidata/DSS2 fetch chain + on-disk cache + offline breaker
    └── app/rig_presets.py  rig picker presets (never auto-seeded)
static/                     desktop UI: index.html + 20 ES modules + style.css + themes.css
static/js/astro.js          JS MIRROR of app/astro.py (advanced-mode track synthesis)
static/js/derive.js         client-side visibility/score/moon math (no refetch on min-alt change)
web/                        static browser twin: app.js (2.5k lines), astro.js, horizon.js,
                            webstore.js (IndexedDB), themes.css, 194 bundled img/*.jpg,
                            catalog.json (baked, 12,116 objects), build_web.py, ftps_deploy.py
landing/                    nightseam.de landing/download/legal pages + changelog.json
scripts/                    JS graph checkers, catalog/changelog/release/icon tooling
tests/                      162 tests (17 modules)
```

**Data flow (planner, desktop).** `index.html` boots `main.js` → `GET /api/state`
(sites, panos, settings, rigs, presets) + `GET /api/catalog` (+`adv=1`) +
`GET /api/panoramas` → `night.js` calls `GET /api/night?date&tz_offset_min&site&adv`
→ `server.api_night` resolves site + active panorama → `nightcalc.compute_night`
→ `planning.night_window` (10-min scan + refinement for −18/−12/−6°) → `astro`
per object on a 6-min grid → JSON tracks. `derive.js` then computes visibility,
`obs_pct`, best windows and scores **client-side**; `detail.js` calls
`GET /api/object/{oid}` for a denser 4-min grid. Advanced mode ships 12k objects
as *metadata only* and synthesises tracks in the browser (`derive.js` +
`static/js/astro.js`).

**Data flow (catalog).** `archive.js` uploads in chunks of 8 with a `run_id`
→ `server.api_ingest_images` → `ingest.ingest_one` (streamed, 1 GiB cap, header
first) → `<Object>/<session>/<frame-type>/file.fit` + DB row → one
`import_batches` history entry per (object, session, frame) merged on `run_id`.

**Storage.** One SQLite file (`objects`, `advanced_objects`, `custom_objects`,
`sites`, `rigs`, `panoramas`, `settings`, `images`, `import_batches`, and the
legacy `observations`); panoramas on disk in `data/panos`; image cache in
`data/imgcache`; rolling `.backup` + `.backup-auto.zip`; `data/instance.json`
for the single-instance handoff.

**Error handling / logging.** `RotatingFileHandler` → `logs/nightseam.log`;
`HTTPException` with human messages; `api()` in `util.js` toasts failures and
adds a 30 s timeout; a `/api/night` or `/api/object` computation failure becomes
a 500 with the exception text.

**Auth.** None (by design). Guards: Host allow-list + `Sec-Fetch-Site`/`Origin`
same-origin check on every route, `Cache-Control: no-store` for the UI shell.

**Build / deploy.** `build.ps1` (isolated `.venv-build`, bakes
`app/_version_baked.py` from `git describe`, PyInstaller one-file) →
`scripts/make_release.py` (clean zip: `LICENSE`, `NOTICE`, exe + `version.json`,
`ns-version.js` for the in-app update check) → FTP upload to `/downloads/`;
`web/build_web.py catalog|version` + `web/ftps_deploy.py uploadtree` for the web
app at `/astro` and `landing/` at `/`.

---

## C. Critical Findings

Nothing in this codebase rises to **CRITICAL** (no remote code execution, no
unauthenticated destructive path, no data-loss-on-startup). The three items below
are the ones I would fix before the next release, because they silently produce
*wrong numbers* — the one thing a planning tool must not do.

### C1 — HIGH — the catalog precession is mathematically wrong in all three engines (confirmed)

* **Files:** `app/astro.py:39-72` (`_precess_j2000_to_date`), `app/astro.py:140-171`
  (its "inverse"), mirrors `static/js/astro.js:30-54` and `web/astro.js:56-70`.
* **What is wrong:** the J2000→date rotation composes
  `Rz(−ze) · Rx(θ) · Rz(−ζ)`. Meeus ch. 21 needs the **middle rotation about the
  Y axis** (`C = sinθ·cosδ₀·cos(α₀+ζ) + cosθ·sinδ₀`), not the X axis, and the
  final node rotation has the wrong sign. Net effect: catalog coordinates are
  **not** precessed to date — the rotation largely cancels.
* **Evidence (executed):** `logs/audit_probe_precession.py` compares the shipped
  function with an independently written canonical Meeus A/B/C implementation:

  | J2000 input | shipped | canonical | separation |
  |---|---|---|---|
  | 0.000°, 0.000° | 359.99998°, +0.00044° | 0.34135°, +0.14831° | 0.372° |
  | 83.630°, +22.010° | 83.62348°, +22.15744° | 84.03098°, +22.02594° | 0.400° |
  | 210.800°, +54.350° | 210.97687°, +54.27348° | 211.03536°, +54.22276° | 0.061° |

  The canonical form reproduces the textbook precession rates exactly
  (vernal equinox after 26.64 yr: RA +0.3413°, Dec +0.1483° expected — the
  shipped code returns +0.0000°, +0.0004°). Feeding the canonical rotation into
  `nightcalc.compute_night` shifts the curated catalog's altitude samples by up
  to **1.2°** (mean 0.26°) and `max_alt` by up to **0.5°**.
* **Why it matters:** the app's central promise is "the obstruction ceiling versus
  the *apparent* altitude of your target". Every catalog altitude is off by up to
  half a degree in a way that grows with the epoch — a target can be shown clear
  when it is behind a tree line, or vice versa. The docs claim "typical error well
  below 0.1 degree" (`README.md:176-182`), which is now false.
* **Blast radius (measured, not assumed):** the **sun and moon are unaffected** —
  `sun_ra_dec`/`moon_ra_dec` pre-convert their equinox-of-date result through the
  exact inverse of the same matrix, and the round trip is exact
  (`logs/audit_probe_roundtrip.py`: worst error 1·10⁻⁶ deg for the Sun, 8.5·10⁻⁷
  for arbitrary points). Twilight times, moon phase/age and the moon track are
  therefore correct, which is precisely why nobody noticed.
* **Recommended fix:** replace the rotation with the canonical
  `A/B/C + α = atan2(A,B) + z` form in `app/astro.py`, `static/js/astro.js` **and**
  `web/astro.js` in the same change (three mirrors), then add a *reference* test
  (see §G).

### C2 — HIGH (security) — a crafted backup import yields arbitrary file read (confirmed)

* **Files:** `app/database.py:658-669` (`import_bundle` inserts `panoramas.file`
  verbatim), `app/backup.py:142-152` (validates only the *write* path via
  `_safe_join`), `app/server.py:500-514` (`api_pano_image` joins `row["file"]`
  onto `data/panos` with no containment check).
* **What is wrong:** two sides of the same feature disagree about path safety.
  The import loop refuses to *write* outside the panorama folder but keeps the
  unsafe value in the database; the read route then serves it.
* **Evidence (executed, `logs/audit_probe_pano_traversal.py`):** import a ZIP
  whose `setup.json` contains
  `panoramas:[{id:"evil",file:"../../README.md"}]`, then
  `GET /api/panorama/evil/image` → **HTTP 200, 9117 bytes, body starts
  `# NightSeam`** — i.e. the repository README, outside `data/panos`.
  (`Path("…/panos") / "C:/…"` also replaces the base on Windows, so absolute
  paths work too.)
* **Why it matters:** "import a friend's setup export" is a documented workflow;
  the malicious ZIP is enough to register any file the app can read (SSH keys,
  the SQLite DB, browser profiles) for later retrieval through the local API.
  The same unvalidated-`file` pattern exists in `api_image_preview`
  (`server.py:813-831`), where the leak is limited to FITS-parseable content.
* **Recommended fix:** apply the same `_safe_join` containment check on the read
  paths (`api_pano_image`, `api_image_preview`), and reject/strip unsafe
  `file`/`profile` paths during `import_bundle` so the DB can never hold one.

### C3 — HIGH — "clear window" is off by one at the end of the night grid (confirmed)

* **Files:** `app/nightcalc.py:217-228` (`longest_run`) → `static/js/detail.js:91`
  and `:316-321`; `static/js/derive.js:6-17` (`longestRunJS`) →
  `derive.js:252-264` (`windowText`, used by the Targets table and Tonight view).
* **What is wrong:** both `longest_run` implementations return the **exclusive**
  end index, and can return `len(flags)` when the object is still visible at the
  last grid sample. Consumers index `times_iso[b]` with it, which is `undefined`.
* **Evidence (executed, `logs/audit_probe_bestrun.py`):** for Berlin on
  2026-09-10 with min-alt 20°, **70 of the 197 curated objects** have a best run
  ending at the exclusive index `n` (grid `n = 90`). Consequences by consumer:
  * Targets/Tonight (`windowText`): end time renders **`--:--`**, and the printed
    duration is one step (6 min) too long.
  * Detail modal (`durStr`, `detail.js:102-105`): `parseUTC(undefined)` →
    *Invalid Date* → `Math.max(0, NaN)` = NaN → the "Clear window" row shows
    **`NaNh NaNm`**.
  * Detail chart (`detail.js:318-321`): `X(b)` = `ML + (n/(n-1))·pw` draws the
    highlight band ~1 sample past the plot area and `d.alt[n]` is `undefined`,
    so the end marker silently disappears.
  * Note the same file guards this exact class elsewhere (`detail.js:248-249`
    uses `i < nT ? d.ceil_top[i] : 90`), so this is an oversight, not a design.
* **Recommended fix:** clamp the returned end index (`min(b, n-1)`) for display
  and durations, or return an inclusive end from both implementations.

### C4 — HIGH — advanced-mode night load can paint a superseded payload (confirmed by code reading)

* **File:** `static/js/night.js:18-49` (`doLoadNight`).
* **What is wrong:** the supersede check (`if (ctl !== _nightCtl) return;`, line 31)
  happens **before** `await synthesizeAdvancedTracks(N)` (line 33); the
  assignment `S.night = N` (line 34), `S.tIdx`, the slider and `setBusy(false)`
  are unguarded. `synthesizeAdvancedTracks` yields to the event loop every 256
  objects (`derive.js:103`), i.e. seconds of work for ~12k objects.
* **Why it matters:** in advanced mode, changing the date/site while the previous
  synthesis runs lets the **stale** night repaint every view while the date input
  shows the new one, and clears the busy chip as if the load had finished. If the
  newer request then fails (e.g. the last site was deleted → 400), the stale data
  stays on screen.
* **Recommended fix:** re-check `ctl === _nightCtl` after the `await` and guard
  `setBusy(false)` with it (the catch block already does this correctly).

### C5 — HIGH — the web app's ranking no longer matches the desktop's (confirmed; one part likely)

Six concrete divergences, all on the "how good is this target tonight" path:

| # | Desktop | Web | Effect |
|---|---|---|---|
| a | astronomical night first, then nautical, then civil (`planning.py:66-80`) | `info.civilDusk \|\| info.sunset` (`web/app.js:519-520`) | every **% of night** and the ranking use a *civil* window (≈1–1.5 h wider each side) |
| b | `N.moon_illum` of the *planned night* (`derive.js:156`) | `E.moonIllumination(jdNow)` — **right now** (`web/app.js:516,532`) | planning a new-moon night during a full moon applies the full penalty (and vice versa); `moonAge` in the same block correctly uses the planned night, so the file contradicts itself |
| c | filter-aware 60°/90°/120° base (`derive.js:111-117`) | `prefs.filters` is **written nowhere** (only read at `app.js:538`); the checkboxes persist flat `fltBb/fltHa/fltOiii` (`app.js:2372,2411`) | filterType is always `lrgb`; the comment "The web has no filter settings yet" is false |
| d | 6-min grid (`nightcalc.py:53`) | 10-min grid (`app.js:524,548`) | different sample sets for the same night |
| e | `moon_aware` default `False` (`server.py:287`) | `moonAware: true` default (`web/horizon.js:442,444`) | different default ranking |
| f | filter marking incl. "broadband ✗" (`derive.js:310-330`) | simpler marking (`app.js:229-235`) | different badges for the same object |

* **Why it matters:** two shipped apps that claim identical semantics give
  different answers for the same night and site. (a) and (b) are outright logic
  errors; (c) is dead code plus a user-visible setting that does nothing.
* **Evidence:** line-by-line comparison of both sides; (c) confirmed by grep
  (`prefs.filters` appears exactly once in `web/app.js`, never assigned).
* **Recommended fix:** derive the web's night window and moon illumination the way
  the desktop does (astronomical-first, planned-night illumination), either wire
  the filter checkboxes into `prefs.filters` or delete the dead branch, and align
  the grid step.

### C6 — MEDIUM (high impact, narrow trigger, needs a live check) — the web anchors its night on the *browser's* midnight while displaying the *site's* zone

* **Files:** `web/astro.js:295-316` (`nightInfo(localDate, …)` builds its 48 h
  scan window from `new Date(y, m, d, 12)` — the **browser** zone),
  `web/app.js:179-182` + `:2265` (`nightAnchor()`/`S.date`), `web/app.js:487-489`
  (`fmtClock` renders through `WS.utcToWall`, i.e. the **site** zone, and
  `web/index.html:101` even has a `#tzSelect` override).
* **What is wrong:** the desktop sends `tz_offset_min` computed for the effective
  (site) zone (`util.js:86-96`, DST-aware), so "the night of 2026-12-05" means the
  *site's* night. The web anchors on browser-local midnight of the chosen calendar
  date instead.
* **Why it matters (my derivation):** in site-local terms the web's window is
  `[D 00:00 − Δ, D+2 00:00 − Δ]` with `Δ = site_offset − browser_offset`. The
  first descending / last ascending rule stays correct while `Δ` is small, but
  once `Δ` grows past roughly +8 h (site far **east** of the browser) the site's
  *previous* dusk and the *next-next* dawn both fall inside the window → a ~36–39 h
  "night", wrong % of night and wrong ranking. Same-zone use is unaffected, which
  is why the 0.5.x fix and its browser verification passed.
* **Confidence:** code reading only — I could not run a browser here. The parallel
  web review reported the same failure class but with the opposite sign
  ("site west of the browser"), so **the direction must be pinned down by a live
  reproduction before any fix** (e.g. browser in Honolulu, site in Berlin, using
  the CDP harness described in `AGENTS.md`).

### C7 — HIGH (release integrity) — the published desktop build claims a clean tag it never had, and its build environment is broken

* **Evidence (verified from the filesystem and git):**
  * `app/_version_baked.py` = `BAKED_VERSION = '0.6.0'`, mtime **16:33:09**;
    the tagged commit `ed6be03` (tag `v0.6.0`) has commit time **16:36:40**, and
    `dist\NightSeam.exe` is **16:36:19**. At bake time no `v0.6.0` commit/tag
    existed, so `git describe --tags --always --dirty` — which `build.ps1`
    documents as the source — could not have produced the bare string `0.6.0`
    (it would have been `v0.5.12-N-g<sha>-dirty`). The most likely explanation is
    the manual bake that `AGENTS.md` documents as a pip-hang workaround; either
    way the shipped zip advertises a clean tag for a build made from uncommitted
    work, contradicting `build.ps1:20-31` and `AGENTS.md`.
  * `build.ps1:10-11` never checks `$LASTEXITCODE` after the two `pip install`
    steps (only the PyInstaller call at `:46` is checked), and the venv proves it:
    `.venv-build\pyvenv.cfg` records a venv created **in the deprecated archive**
    (`<archive>\Object-Astro\.venv-build`), and neither `pytest.exe` nor
    `httpx` is present although `requirements-dev.txt` declares them.
  * `landing/changelog.json` stops at **0.6.0** while `/astro` serves **0.6.8**
    (the download page's "What's new" is 8 releases behind the web app);
    `scripts/build_changelog.py:56-61` only *prints* a warning.
* **Why it matters:** the version string is the user's only signal that the exe in
  `/downloads` is stale (it predates every `static/` change from 0.6.1–0.6.7).
  `AGENTS.md` already flags the desktop release as overdue; this audit confirms
  the tooling cannot currently prove what it published.

---

## D. Things That Look Out of Place

**Dead or half-finished code**

| Item | Where | Note |
|---|---|---|
| `/api/images/{id}/preview` + `fits.preview_png*` | `server.py:813-831`, `fits.py:259-265` | no client caller anywhere; only tests. `fits.preview_png` (bytes wrapper) has zero non-test callers |
| `observations` accessors | `database.py:539-564` | journal removed in 0.5.7; `observations()`/`observations_for()`/`delete_observation()` unused, `import_bundle(observations=…)` still inserts (only a test calls `add_observation`) |
| `_ingestCache` | `static/js/archive.js:90,112,383` | written and cleared, never read |
| `prefs.filters` branch | `web/app.js:536-539` | never written; comment contradicts the shipped filter checkboxes |
| `backup.build_export_zip` | imported at `server.py:22`, unused since the export was streamed | half-finished refactor |
| `.frame` / `.frame img` CSS + "FRAME IMAGES" section | `static/style.css:416-424`, `themes.css:915-918` | frame thumbnails were dropped; class emitted by nothing |
| `profile_len`, `panoramas` in `/api/state` | `server.py:281-297` | no desktop view reads them (`main.js` uses `/api/panoramas`) |
| `rig_presets.SEEDED_FLAG` | `rig_presets.py` | never set by any code |
| root scratch scripts | `check_unmatched*.py`, `debug_matches.py`, `match_final.py`, `verify_matches.py`, `popularity_snapshot.json` (2 copies, 238 KB + 322 KB) | gitignored, read `popularity_snapshot.json` CWD-relative; stale |
| `build/AstroPilot/`, `dist/logs/astropilot.log` | on disk | pre-rename leftovers |
| `AUDIT.md` | repo root (tracked) | describes 0.5.11 state, says "all changes uncommitted", cites probe files that no longer exist, cites 135/141 tests (now 162) |

**Duplicated implementations**

* `app/astro.py` ↔ `static/js/astro.js` ↔ `web/astro.js` — three astronomy engines.
  Deliberate (no bundler, offline), but it is also how C1 survived: nothing
  compares them to a reference.
* `rig_presets.fov_arcmin:40-46` is a byte-for-byte copy of `server.fov_arcmin:157-159`,
  kept in sync only by a test.
* Two "clear window" computations on different grids (`derive.js:186` over
  dusk−60…dawn+60, `nightcalc.py:165-172` over dusk−75…dawn+45) — same rule,
  different answers, and the Targets table can contradict the detail modal.
* `durStr`/`durStrLocal`/`nightLength`-style duration helpers exist in
  `detail.js:102`, `header.js:133` and `tonight.js:41` with different guards
  (the header's has none — see F).
* `activeProfile`/`activeTopProfile` (`derive.js:277-289`) and `activeSite()`
  (copy-pasted in `weather.js:24-27`, `skyview.js:161-164`).

**Duplicated blobs / misplaced files**

* `landing/app.png` == `web/app.png`; `static/favicon.ico` == `assets/app.ico`
  (identical hashes).
* `.gitignore:22` (`match_popularity.py`, no slash) accidentally ignores
  **`scripts/match_popularity.py`** — the regenerator that both
  `AGENTS.md:245` and `app/adv_popularity_data.py:3` tell you to use;
  `.gitignore:28` similarly ignores `scripts/adv_popularity.py`. Verified with
  `git check-ignore -v`. A fresh clone cannot regenerate the tracked
  `ADV_POPULARITY` data.
* Conversely, `data/NGC.csv` (the 2.8 MB third-party input that
  `build_adv_catalog.py` says is "gitignored") is **not** ignored.
* `NightSeam.spec` is tracked although PyInstaller rewrites it on every
  CLI build (`build.ps1` drives everything by flags), and running it directly
  would produce an exe with **no** version bake.

---

## E. Concept vs. Implementation

**Where they match**

* The core loop works as documented: sites → panorama profile (720 bins,
  `NO_BLOCK`, sky mode with `profile_top`) → night grid → per-object tracks →
  client-side visibility/score. `planning.py` really is the single twilight
  source; `fits.parse_ra_hours/parse_dec_deg` really are the single coordinate
  parser; the archive layout, session rule (12 h), chunked upload with `run_id`
  merging, and the CSV/JSON export all match `AGENTS.md`.
* Removal work is genuinely clean: no session-journal remnant in either UI, no
  frame thumbnails in the UI, popularity is score-only (tiebreaker) with no
  visible number, sort mode, chip or marker, rig presets are a picker with a
  one-shot cleanup, `#rigSelect` is in the topbar in both apps, and the
  0.6.6 `[hidden]`-vs-`display` class of bug is gone. `tests/test_ui_invariants.py`
  pins most of it.
* The redesign ("Glass"/`dome`) is the default in the web app and the desktop
  keeps the same skeleton with the two remaining themes.

**Where they do not**

1. **Accuracy claims vs. reality (C1).** README/`NOTICE` promise sub-0.1° object
   positions ("precession to date"); catalog positions are effectively J2000.
   The docs' "Made with Meeus ch. 21" is aspirational, not descriptive.
2. **"Works fully offline except optional example images" (`README.md:10-12`) vs.**
   a per-start update check to `nightseam.de`, an optional Open-Meteo weather
   panel (both apps, `static/js/weather.js:42`, `web/app.js:289`) and a
   background image-prefetch thread on every start. `README.md:184-185`
   additionally states weather is *"not included on purpose"* — it is a shipped
   feature with a settings toggle, a topbar chip and a credit in `NOTICE`.
3. **"Exact coordinates and elevation" (`README.md:41-43`) vs.** `astro.altaz()`
   having no elevation parameter at all — elevation is stored, edited in the
   wizard, echoed in the payload (`site.elev`), and never used in any
   computation. Either implement the horizon-dip/pressure term or stop promising it.
4. **"No external runtime dependencies" vs.** the exe bundling FastAPI/uvicorn/
   pydantic/pywebview (fine for users, but the sentence is about the *target
   machine*, and `NOTICE:60-62` claims those license texts are distributed in
   `.venv-build` — which is gitignored, so they ship nowhere).
5. **Two apps, one version line (§C5/§C6)** — the web is a port that has drifted;
   the shared scoring constants match, the surrounding logic does not.
6. **The exe in `/downloads` (0.6.0) vs. the repo and `/astro` (0.6.8)** — the
   desktop release predates all UI work since 0.6.0.

---

## F. Technical Debt

* **Upload size cap is enforced after the fact (MEDIUM).** `_drain_upload`
  streams with a hard limit, but Starlette has already spooled the whole request
  body to a temp file before the route runs (`UploadFile` with a 1 MB spool
  threshold), and there is no limit on the *number* of files per request
  (`server.py:664-680`, `ingest.py`). The docstring's "cannot exhaust RAM or
  disk" is therefore wrong; the same is true for `/api/import` (2 GiB per
  request).
* **`_read_member` materialises whole ZIP members in RAM** (≤1 GiB each,
  `backup.py:36-55`) although the module docstring promises libraries "never
  double-buffer in RAM"; and `apply_import_zip` commits the DB *before* writing
  the pano/library files (`backup.py:139-170`), so a failure there leaves a
  restored DB with missing files (the auto-backup makes it recoverable, not
  correct). A `setup.json` also controls the member list, so extraction has no
  aggregate budget.
* **Ingest is O(n²).** `imglib.resolve_object` rebuilds the catalog index on every
  call and ingest calls it **per file** with the 12k-object advanced catalog;
  `_session_dir` additionally scans `db.images()` per file (`imglib.py:71-110`,
  `ingest.py:61-74`). Fine for a handful of frames, slow for a full night.
* **`rename_archive_folder` can overwrite a same-named file when merging folders**
  (`ingest.py:205-231`, `f.replace(dest)`), and a rename moves only
  `obj_slug(name)` while the DB rewrites the first path component of *all* rows
  matched by the looser `name_key` (`database.py:510-535`) — a group spanning two
  slug spellings ("M31" / "M 31") ends up pointing at a folder that does not
  exist; the next reindex re-adds those frames as duplicates.
* **Image pipeline classification is inconsistent (MEDIUM).**
  `TEMP_EXC` contains `OSError`, and `HTTPError` is an `OSError`, so the careful
  `if e.code in (403,429,500,502,503)` filter is defeated: a permanent 404 is
  treated as transient (`images.py:70,79-94,289,304,322`) → no negative marker
  (`:333-336`) → that object is re-fetched on every detail view and in every
  prefetch retry round, forever. Also: `_http_bytes` reads responses with no size
  cap into memory and then caches them (`:84-90,328`), TLS verification is
  **disabled** for any host containing `cds.unistra` (`:55-62`), and all network
  I/O runs inside the global `_fetch_lock` with no deadline, so an interactive
  image request queues behind the background prefetch.
* **Panorama/profile validation is missing and fails open.** `PanoramaUpdate`
  accepts any list for `profile`/`profile_top` (`server.py:131-141`); a 719-bin
  profile silently disables all blocking (`nightcalc.py:27-28` returns
  `NO_BLOCK`), while `["x"]*720` makes `/api/night` return 500 forever. Only the
  empty list is tested.
* **Panorama activation can diverge.** `PUT /api/panorama/{pid}` with
  `active=true` (`server.py:560-566`) sets that row but does not clear the others
  (unlike `POST /api/settings:311-316`); `db.active_panorama()` returns the
  newest row with `active=1` (`database.py:409-413`), so `/api/state` and
  `/api/night` can disagree about which panorama is live.
* **Deleting the active site strands planning.** `Database.delete_site:359` never
  repoints `active_site_id` and `api_add_site:361` only sets it when it is
  `None`, so after deleting the active site `/api/night` answers 400 "No
  observing location configured" and adding a new site does not repair it
  (recoverable by picking a site in the selector). `SiteIn` also accepts
  `lat=999` — no range validation on sites anywhere.
* **`/themes.css` is not covered by the UI no-store rule.** `server.py:262-265`
  sets `Cache-Control: no-store` for `/`, `/index.html`, `/style.css`,
  `/favicon.ico` and `/js/*` — but `static/index.html:18` loads `/themes.css`,
  which is the file that changed most in the 0.6.x arc. A returning user can get
  a stale `themes.css` (heuristics) with a fresh `index.html`; the whole point of
  that rule was to prevent exactly this.
* **Desktop polish:** `header.js:133-137` (`durStrLocal`) has no null guard, so
  the top bar shows **`NaNh NaNm`** whenever there is no astronomical night
  (`nightcalc.py:138-139` sends `null` at high latitude) while `tonight.js:41-44`
  guards the identical computation; `pano.js`'s 900 ms auto-save timer is not
  cancelled in `select()`, so the last stroke is persisted against the *new*
  panorama (`pano.js:696-722`); `detail.js:84,87` are the only innerHTML sinks
  that skip `esc()` (`constName(constellation)` and `distance` — bounded to 3
  chars, so not exploitable, but inconsistent with `targets.js:155`);
  `setup.js:112-120` re-renders Targets but not the Library on a unit change;
  `updater.js:32-50` latches `done` before a slow `<script>` loads, so a genuine
  update notice can be lost; `pano.js` uses blocking `alert()` where the app
  otherwise uses `toast()`, and three different canvas-width sources.
* **Web robustness:** `restoreBackup` validates only `data.app==='nightseam-web'`
  and writes records verbatim (`webstore.js:285-293`) — one malformed record
  makes `renderSettings` throw (`app.js:1688,1702` call `.toFixed()` before the
  modal renders) and the Setup dialog then never opens; a blocked/unavailable
  IndexedDB aborts `boot()` before the first render (`webstore.js:76-88` has no
  try/catch in `all()`), leaving the splash on "catalog ready"; `renderSky` leaks
  one anonymous `window` pointerup listener per visit (`app.js:1055`); horizon
  edits do not invalidate the visibility cache even though the comment claims
  views re-read state (`app.js:479` + `obsKey:162-167`).
* **Release tooling:** `web/build_web.py:51-54` omits `--dirty` (the release notes
  say both call it with `--dirty`); `scripts/make_release.py:47-48` checks only
  that `dist\NightSeam.exe` exists, so a stale exe can be published under a fresh
  version string; `web/ftps_deploy.py`'s root guard is string-based and can be
  bypassed with `remove /astro/.. --yes`; `check_js_defs.py` still scans only
  `static/js` although the docs imply all three checkers cover both graphs;
  `scripts/make_icon.py` imports **Pillow**, which is declared nowhere.
* **Undocumented switch:** `main.py:205` adds `--host` (not in `README.md`'s CLI
  table, which also omits `--version`). Binding `--host 0.0.0.0` exposes the
  unauthenticated API to the LAN while the Host guard still rejects non-loopback
  Host headers unless `NIGHTSEAM_ALLOW_HOST` is set — a half-supported feature
  documented only in a code comment.
* **Repo size:** `web/img` (194 files, ~20.9 MB) is ~91 % of the pack;
  `web/catalog.json` (4.0 MB) and `app/data/openned.csv` (2.8 MB) are the other
  large tracked blobs. All three are deliberate, but they dominate clone size.
* **Docs drift (each verified):** `README.md:61-69` prints the "Timezone-aware
  planning" bullet twice; `README.md:115` installs `requirements.txt` while
  PyInstaller lives in the undocumented `requirements-dev.txt`;
  `landing/privacy.html:70` names a "CDN" that `AGENTS.md` says does not sit in
  front of the domain; `static/js/util.js:97-98`'s comment says
  `zoneOffsetMin` returns minutes **west** while the code returns **east**
  (callers are correct); `static/index.html:612` renders a literal
  `data\nightseam.db.backup`; `updater.js`'s `SITE = "https://nightseam.de/#download"`
  points at a fragment that does not exist (the landing page uses `download.html`).

---

## G. Missing or Weak Tests

**Suite health (verified).** `python -m pytest tests/ -q --tb=no` → **162 passed
in 40.19 s** when run with full filesystem access. Under the DSH sandbox the same
command is 96 passed / 66 errors — every error a `PermissionError` on the
pytest basetemp (`os.mkdir(mode=0o700)` DACL), i.e. the documented environment
artifact, not a code failure. `python scripts/check_js.py` passes (25 files,
0 broken imports, all `$('#id')` resolve in both apps).

**The tests that matter are missing:**

1. **No reference test for the astronomy core (HIGH — this is why C1 survived).**
   `test_precession_round_trip_exact` only proves the forward and inverse are
   self-consistent; there is no golden value against Meeus's worked example or an
   independent rate check. Likewise `test_m13_transit_berlin` uses a *J2000* dec
   in its expectation, so it passes more accurately with the bug than without it.
2. **No JS↔Python parity test at all (HIGH).** `static/js/astro.js` and
   `web/astro.js` are never executed by the suite (no Node usage anywhere), so
   the three-engine agreement asserted in `AGENTS.md` rests on a manual probe that
   no longer exists. Node 24 is installed; a golden grid comparing
   `altazFrame()`/`ceil` lookups against Python values is cheap.
3. **The security middleware is untested (HIGH).** No test references
   `Sec-Fetch-Site`, `Origin`, `Host` or `/api/shutdown` — the guard that
   `AGENTS.md` calls the fix for the "any website can call /api/shutdown" bug has
   no regression test (and a naive one would `os._exit(0)` pytest).
4. **The single-instance/port handoff is untested (HIGH).** `free_port`,
   `port_in_use`, `existing_instance_url`, `write/clear_instance_file` and the
   `--no-browser` handoff have zero coverage despite `AGENTS.md` documenting the
   "stale exe holds port 8407" trap.
5. **False-positive assertions (MEDIUM).**
   `test_night_ceil_top_band` (`test_api.py:705-743`) cannot fail on band math:
   the substantive expectation is a dangling comment, `0 <= max(ceil_top) <= 90`
   holds for any content, and `any(v is False …)` is satisfied by the default
   min-altitude — swapping `profile`/`profile_top` in `nightcalc.py` still passes.
   `assert st["version"]` (`test_api.py:50`) can never fail (the fallback is
   `"dev"`). `test_ingest_size_cap` cannot distinguish the two caps because
   `UploadFile.size` stays 0 in the installed Starlette, and it never asserts the
   partial file was removed.
6. **`app/paths.py` has no test** (a `test_paths.pyc` survives in
   `tests/__pycache__/` but the module is not in git) — frozen/source resolution
   is exactly the code that cannot be exercised by hand easily.
7. **Weak spots in otherwise solid modules:** `moon_age()` (which ships as
   `moon_age_days` and drives moon-aware scoring) has no test; illumination is
   only bounded 0..1; `ceil_lookup` is tested with the empty profile only (no
   wrong-length, no non-numeric); no duplicate-filename ingest test
   (`stem_2.fit`); `/api/object/{oid}/image` is untested (nothing pins
   "`thumb=1` never touches the network", the documented anti-starvation rule);
   no DST-transition night; no `.fits.fz`/`.fits.gz` rejection test; no backup
   test where the *file* phase fails or `settings.image_dir` points at a foreign
   path; no test for `PUT /api/panorama/{pid}/image` (crop/replace: mask
   invalidation, atomic swap).
8. **Text-grep invariants** (`test_ui_invariants.py`, `test_deploy_order.py`) are
   useful pins but assert substrings, not behaviour; they cannot catch a
   re-introduced popularity *number* rendered through a different template.

---

## H. Security / Reliability Concerns

**Security**

* **Arbitrary file read via a crafted backup import (C2, confirmed).** Fix first;
  it is the only finding with a working end-to-end reproduction.
* **No authentication, loopback-only, guard-based** — appropriate for a local
  app, and the guards are correct in what they do (`Host` allow-list plus
  `Sec-Fetch-Site`/`Origin` on *every* route, including `/api/shutdown`). Note
  `testserver` is in the production allow-list for TestClient's benefit.
* **Web XSS is import-reachable (MEDIUM).** `web/app.js:1202,1349,1702` interpolate
  `TYPE_LABELS[o.otype] || o.otype` and `horizon.js:288,292` interpolate the
  panorama `id` into `data-id`/`data-del` without `esc()`; `webstore.js:285-293`
  writes imported records verbatim after checking only `data.app`. A crafted
  backup JSON containing `otype: '"><img src=x onerror=…>'` executes on the
  `nightseam.de` origin. No URL/hash or `eval` path exists.
* **TLS verification is disabled for the DSS cutout host** (`images.py:55-62`,
  substring match on `cds.unistra`) — a MITM there can inject body bytes that are
  cached and served; SVG is rejected (`:286`), so the practical risk is corrupted
  imagery plus unbounded cache writes, not script execution.
* **No secrets in the repo.** FTP credentials are read from an out-of-repo env
  file (`--env`, location only). `web/.gitignore` covers `ftp.env`.
* **Import/extraction hardening:** zip-slip is correctly prevented on the *write*
  side (`_safe_join`, tested); the read side is the hole. No aggregate extraction
  budget.

**Reliability**

* Upload caps are enforced only after Starlette spools the body (F); per-request
  file counts are unbounded.
* `apply_import_zip` is transactional for the DB but not across DB + files.
* Ingest can overwrite a same-named frame when merging folders (F) — the only
  data-loss path found in normal operation.
* `images.py` treats permanent HTTP failures as transient → repeated network
  round-trips forever for objects whose image will never exist; the fetch lock
  serialises interactive requests behind the prefetch thread.
* Advanced-mode night load can paint stale data (C4); the web can show NaN/blank
  windows for objects whose visibility run ends at the grid edge (C3).
* Startup degradation is graceful where it matters: no site → a clear 400;
  offline → circuit breaker plus SVG placeholders; missing archive folder → 404;
  single-instance handoff (documented, but untested).
* Shutdown: `/api/shutdown` sets a flag, then a 1.5 s `os._exit(0)` fallback that
  also clears `instance.json`; `main.py` joins the server thread with a 6 s
  timeout. Reasonable, untested.

---

## I. Recommended Next Steps

### 1. Must fix (before the next release)

1. **C1 — precession**: fix `_precess_j2000_to_date` (+ inverse) in
   `app/astro.py`, `static/js/astro.js`, `web/astro.js`; add a golden test from
   Meeus ch. 21 plus a rate check; re-verify a handful of twilight/altitude values.
2. **C2 — path containment on the panorama (and image-preview) read routes** and
   reject unsafe `file` values in `import_bundle`; add the traversal test.
3. **C3 — clamp the `longest_run` end index** in `nightcalc.py` and `derive.js`;
   assert the rendered window in a test.
4. **C4 — re-check the supersede token after the advanced-mode `await`.**
5. **C5/C6 — re-align the web's night window, moon illumination and filters with
   the desktop; reproduce C6 in a browser before/after fixing.**
6. **C7 — release integrity**: make `build.ps1` fail on a dirty tree or a failed
   pip step, rebuild the venv properly, rebuild + republish the desktop as the
   next tag (**0.6.9**), add the missing `changelog.json` entries, and have
   `make_release.py` verify the exe's baked version against `git describe`.
7. **Sanity-check the published state**: `/downloads` serves a 0.6.0 exe that
   predates every 0.6.1–0.6.7 UI change — decide deliberately whether to ship it
   or to keep advertising 0.6.0.

### 2. Should fix

8. Upload-cap reality: check `Content-Length` / stream-and-abort before Starlette
   spools, cap files per request, and correct the docstrings.
9. `apply_import_zip`: write files first (or stage + swap), cap the aggregate
   extraction, stream members instead of buffering ≤1 GiB.
10. Ingest: uniquify on folder merge (`_archive_target` semantics), and make
    rename move every folder referenced by the group's rows.
11. `images.py`: classify permanent HTTP errors as permanent (or delete the dead
    branch), cap response size, reconsider the unverified TLS context, and give
    the fetch chain a deadline / a lock per object rather than one global lock.
12. Validate panorama `profile`/`profile_top` (length 720, numeric) on write;
    decide fail-open vs fail-closed for a corrupt profile.
13. Make panorama activation single-valued server-side; repoint `active_site_id`
    when the active site is deleted; validate site lat/lon ranges.
14. Desktop/web polish: `durStrLocal` null guard; cancel the pano auto-save timer
    on switch; `esc()` the two desktop sinks; guard the web's weather payload
    reads; never latch the updater's `done` before the script loads; validate
    imported web backups before rendering.
15. Test the guards, the port handoff, `paths.py`, `moon_age`, and add the Node
    parity grid test (all cheap, all currently absent).
16. Fix the `.gitignore` collisions (`/match_popularity.py`,
    `scripts/adv_popularity.py`) and ignore `data/*.csv`; add
    `THIRD-PARTY-LICENSES` to the release staging (or correct `NOTICE`);
    credit the popularity source (data + browser fetch) in `NOTICE` and `privacy.html`.
17. Add `--dirty` to `build_web.py version`; fix the `ftps_deploy.py` root-guard
    bypass; document or remove `--host`; declare Pillow (or move `make_icon.py`
    to dev-only documentation).

### 3. Nice to improve

18. Extend the no-store rule to `/themes.css` (and any other UI asset).
19. Delete or re-wire the dead surface: `/api/images/{id}/preview` +
    `fits.preview_png`, the `observations` accessors, `_ingestCache`,
    `prefs.filters`, `.frame` CSS, `profile_len`, `SEEDED_FLAG`,
    `build_export_zip`'s unused import.
20. Unify the duplicated "clear window" computation and the duration helpers;
    deduplicate `fov_arcmin`.
21. Doc pass: README weather/offline/elevation claims, the duplicated bullet,
    the CLI table, the pytest test count, and rewrite `AUDIT.md` (or mark it
    historical) so the next reader is not misled.
22. Performance: build the catalog index once per ingest request; hoist
    `passesFilters`/`$("#showAll")` out of the sky-view object loop; avoid
    re-rendering on hover.
23. Consider removing the `testserver` host from the production allow-list
    (inject it only for tests).

### 4. Optional refactoring

24. Fold `static/js/astro.js` and `web/astro.js` into one shared module (or
    generate both from a single source) so the three-engine problem stops being a
    three-place edit.
25. Move `web/img` (≈21 MB) out of git history into release assets if clone size
    matters.
26. Split `web/app.js` (2 507 lines, one file) along the desktop's module
    boundaries; the desktop's `static/js/` layout is the better model.
27. Replace the text-grep UI invariants with a few behavioural assertions in the
    Node harness, keeping the greps as a cheap first line.

---

## Appendix — verification log

**Read in full by me:** `README.md`, `DESIGN.md`, `AUDIT.md`, `AGENTS.md` (skim),
`main.py`, `app/server.py`, `app/database.py`, `app/planning.py`,
`app/nightcalc.py`, `app/astro.py`, `app/backup.py`, `app/images.py` (key parts),
`app/version.py`, `static/js/util.js`, `static/js/derive.js`,
`static/js/detail.js` (key parts), `static/js/night.js`, `static/js/header.js`
(part), `web/astro.js` (part), `web/app.js` (key parts), `tests/test_astro.py`,
`tests/test_ui_invariants.py`, `scripts/build_changelog.py`, config/build files.

**Probes I wrote and ran (all under gitignored `logs/`, DB work on copies —
the real `data/` was never touched):**

| Probe | Proves |
|---|---|
| `logs/audit_probe_precession.py` | C1: shipped precession vs canonical Meeus (0.06–0.40° error; equinox not precessed); end-to-end alt/max-alt impact |
| `logs/audit_probe_roundtrip.py` | C1 blast radius: J2000↔date round trip exact (≤1e-6°) ⇒ sun/moon/twilight unaffected |
| `logs/audit_probe_pano_traversal.py` | C2: crafted import + `GET /api/panorama/evil/image` → 200 with `README.md` |
| `logs/audit_probe_bestrun.py` | C3: 70/197 objects with `best[1] == n` (undefined end index) |

**Commands run:** `python -m pytest tests/ -q --tb=no` (sandbox: 96 passed /
66 env-artifact errors; full access: **162 passed, 40.19 s**),
`python scripts/check_js.py` (via the frontend audit: clean),
`git log/status/ls-files/check-ignore/describe`, `python -m py_compile` (parallel
review), plus the probes above. No build, no deploy, no dependency install.

**Left in place deliberately:** `logs/audit_probe_*.py` (evidence, gitignored);
`AUDIT.md` (untouched historical record).

### Open questions for the owner

1. Is the web's cross-timezone anchoring (C6) a bug or accepted behaviour? It
   needs a live browser check — the harness in `AGENTS.md` (CDP) could not run in
   this environment.
2. Is the `web/img` bundle + `catalog.json` staying in git intentional?
3. Which "clear window" is authoritative — the 6-min night grid (Targets) or the
   4-min detail grid (modal)? They disagree by construction today.
4. Is `data/NGC.csv` supposed to be committed, or is the doc wrong?
5. Should the removed-but-live HTTP surface (`/api/images/{id}/preview`,
   `observations`) be deleted, or is it deliberately kept as an API for
   third parties?
6. `AGENTS.md` claims three pano API tests pass only because a recycled
   `.pytest-tmp` still holds `data/panos`; pytest removes the basetemp at session
   start, so that mechanism cannot be right. The tests pass with full access —
   the fixture's `data/panos` handling is worth a second look, but I did not
   change or re-verify it.
