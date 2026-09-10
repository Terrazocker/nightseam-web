# NightSeam — audit and fix report

Baseline when the audit started: `master` @ `b992fad` (NightSeam 0.5.11), 135 tests.
This file started as the audit findings; it now records the fix status of every item.

**All changes are in the working tree, uncommitted.** Nothing has been deployed — the
live site still serves the previous build until you upload again.

## How each fix was verified

| Evidence | Covers |
|---|---|
| `logs/probe_backend_claims.py` | A1 (rollback), A4 (port probe) |
| `logs/probe_fixes_backend.py` | A4, G4 (streamed export), G9 (cross-site guard) |
| `logs/probe_fixes_round2.py` | A2, A1-shape, G11, G6, G8, D2 |
| `logs/probe_tzoff.mjs` + `logs/probe_tz_fixed.py` | B1 (sign, then the resulting night for 6 sites) |
| `logs/probe_web_tz2.mjs` | B2 (6 time zones) |
| `logs/probe_ceil_js.mjs` + `logs/probe_horizon_roundtrip.mjs` | C8 (guards, 11/11 round-trip) |
| `logs/probe_data_integrity.py` | the data-integrity pass (unchanged, still clean) |
| `python scripts/check_js.py` | G12 (both graphs) and every JS edit |
| `node --check` on 15 edited files | JS syntax of every edit |
| `python -m py_compile` on 17 edited files | Python syntax of every edit |
| `python -m pytest tests/` | 79 passed / 0 failures (56 tmp_path errors are the sandbox ACL artifact) |

---

## HIGH — data loss / wrong night

**A1 — failed import wiped the user's data. FIXED.**
`Database.import_bundle` now runs the whole replace in one transaction with
`rollback()` on any failure (and validates the bundle shape up front).
*Verified:* after a mid-import `IntegrityError`, `sites=1 settings=1` — and still 1 after a
later unrelated commit (previously `sites=0` → permanent wipe).

**A2 — import deleted the legacy `observations` table. FIXED.**
The `DELETE FROM observations` is gone; the table is never read or written by an import.
*Verified:* a row survives a full export→import round trip, and `setup.json` carries no
`observations` key.

**A3 — panorama Undo crossed panorama switches. FIXED.**
`Pano.undo` is cleared in `select()`, so undoing after a switch cannot write the previous
panorama's strokes into the current one and auto-save them.

**A4 — two instances could share one port and one SQLite file. FIXED.**
`free_port()` now probes with `connect()` (plus a bind *without* `SO_REUSEADDR`), and the
single-instance handoff applies to `--no-browser` too (it exits 0 rather than starting a
second writer).
*Verified:* a listening socket is detected, `free_port()` picks another port; a cross-site
request to `/api/shutdown` is refused.

**B1 — the desktop sent `tz_offset_min` with the wrong sign. FIXED.**
`tzOffAt()` returns minutes **east** (the API's convention), documented as the opposite of
`getTimezoneOffset()`.
*Verified:* matches the server's expectation in 6 zones; feeding the server that value makes
**all six** test sites (Auckland, Tokyo, Berlin, New York, Los Angeles, Honolulu) resolve
their own night with astronomical twilight — previously Auckland/Tokyo planned the next
night, Honolulu the previous one, and Los Angeles fell back to a 06:00–14:00 daylight window.

**B2 — the web planner anchored its night scan at UTC midnight. FIXED.**
The cancelling `- getTimezoneOffset()*60000` is gone.
*Verified:* Midway, Honolulu, Los Angeles, Berlin, Tokyo and Kiritimati now all produce the
requested dusk date with ~10–11 h nights (was 34–35 h, with wrong-day dusks outside
≈[−4 h, +2 h]).

**B3 — the weather auto-load setting could never work. FIXED.**
`bindWeather()` now runs *after* `loadState()`, so it sees `S.cfg`.

## MEDIUM

**C1 — web visibility cache not keyed by night. FIXED.** The cache key uses the anchor date
(`nightAnchor()`), not "today".

**C2 — cropping a panorama kept the old sky-mode ceiling. FIXED.** The crop/replace endpoint
now also clears `profile_top` and resets `paint_mode`, so no stale band keeps blocking.

**C3 — reindex named a group after its session folder. FIXED.** The object folder is
`parts[-4]` for `<Object>/<session>/<frame>/` (and `parts[-3]` for the older
`<Object>/<frame>/` layout); the session folder is never used as a name.

**C4 — clearing the "Night of" date crashed object detail. FIXED.** An empty date input now
means "today at the site"; `S.date` is never null.

**C5 — web moon scoring had drifted from the desktop. FIXED.** The web uses the same
phase-dependent minimum separation and the same Bortle curve (filters honoured if prefs ever
gain them).

**C6 — detail modal could show another object's data. FIXED.** The response is written only
if `S.currentId` is still the requested object (same guard the image path already used).

**C7 — unreachable `#obj:` route + unused helper. FIXED.** Both removed.

**C8 — the web ceiling lookup trusted the panorama record. FIXED.** `ceilFor` guards
`fov`/`profile`/`profileTop` (a bad record degrades to "nothing blocks", as the desktop and
server already did) and `importPanos` validates and completes every imported record.
*Verified:* no-fov / no-profile / short-profile all return `-90` instead of `undefined`/TypeError,
and the mask→profile→lookup round trip still passes 11/11.

## LOW

**D1 — inverted, impossible moon-distance comments. FIXED.** They now describe what the code
actually does (largest at full moon, `BASE/3.25` at new).

**D2 — Bortle curve contradicted its comment and jumped 68 % at bortle 3→4. FIXED.** The
curve is continuous at the junction: bortle 1–9 → 0.30, 0.35, 0.40, 0.52, 0.64, 0.76, 0.88,
1.00, 1.12 (largest step 0.12, was 0.27). Both the desktop and the web use it.

## UI / a11y / escaping

**E1. FIXED** — Ctrl+Z is gated on the *active* horizon tab and skips text fields.
**E2. FIXED** — "Visible now" reports the real count (the top-8 list is unchanged).
**E3. FIXED** — the catalog search box keeps focus and caret across the debounced re-render.
**E4. FIXED** — the illegal `timeout` on the pre-paint sync XHR is gone, so the theme is
applied before first paint (no more default-theme flash).
**E5. FIXED** — stale async work no longer paints into a switched view (`warmPct` only
repaints the catalog; `renderTonight` bails when the view changed).
**E6. FIXED** — one resize listener for the app's lifetime instead of one per Sky View render.
**E7. FIXED** — a late thumbnail fetch cannot revoke the on-screen image's blob URL.
**E8. FIXED** — Sky View controls announce time changes (topbar scrub stays in sync) and the
arrow keys scrub on every view.
**E9. FIXED** — legend chips (sky and sky map) and tonight cards are keyboard-operable;
`bindKeyboardClick` is now actually used (brand), and the web brand/slider gained
`role`/`tabindex`/`for`.
**E10. FIXED** — the drag clamp uses the element's real size and re-clamps on window resize.
**E11. FIXED** — dome z-index follows DESIGN.md again (tabs 50, sheet 60); the file's own
summary was corrected too.
**E12. FIXED** — a failed profile save keeps your painting instead of overwriting it with the
server's stale row.
**F1. FIXED** — `otype` is escaped in all three sinks (targets, archive, detail) and unknown
types get a fallback colour instead of `undefined`.

## Tooling, release, site

**G1. FIXED** — the landing pages no longer advertise removed S–D grades (hero, feature card,
meta description) and the now-unused `.graded` CSS rule is gone.
**G2. FIXED** — `landing/changelog.json` now runs to 0.5.11 (13 entries) and
`build_changelog.py` warns loudly about any released tag without a curated summary.
**G3. FIXED** — `make_release.py` uses `--dirty`, so the zip/version.json can no longer
disagree with the exe inside.
**G4. FIXED** — `/api/export` streams from a spool file (removed in the background); no more
whole-library ZIP in RAM.
**G5. FIXED** — pano replace uses a per-request temp file.
**G6. FIXED** — `rename_archive_folder` reports failure; the endpoint aborts with a clear
message and does **not** rewrite stored paths, so frames can no longer point at a folder that
moved away (the failure is logged).
**G7. FIXED** — rename/retype matching uses the same whitespace/case-insensitive key as
library grouping (`imglib.name_key`), so sibling spellings are renamed together.
**G8. FIXED** — write failures are reported as write failures (and logged); multi-word
IMAGETYP spellings ("Dark Frame", "Flat Field", "Bias Frame", "Sky Flat") classify correctly.
**G9. FIXED** — the guard middleware rejects cross-site requests (Sec-Fetch-Site/Origin), and
shutdown is graceful: the flag ends `main.py`'s loop properly, with a 1.5 s hard-exit fallback
for window mode that also clears `instance.json`.
**G10. FIXED** — `api()` accepts `timeout: 0`, and the backup import uses it.
**G11. FIXED** — zip members are read through a capped streaming helper (1 GiB per member).
**G12. FIXED** — both checkers cover `static/` **and** `web/`; namespace/bare imports are
detected; `export let/var/class` no longer false-positives. *This immediately found a real
bug* — `web/app.js` referenced `#in-lat`, `#in-lon`, `#site-note`, which exist in no HTML
file; the dead lookups are removed.
**G13. FIXED** — `build_web.py catalog` refuses to run without a database (and no longer
leaves an empty one behind).
**G14. FIXED** — `build_adv_catalog.py` defaults to `data/NGC.csv` with a download hint, and
`adv_popularity_data.py` names the generator that actually exists.
**G15. FIXED.** The placeholders are gone: the imprint now names **TerraZa** with
`terraza@proton.me` and states that NightSeam is a free, non-commercial open-source project
(address/telephone intentionally omitted by the operator). `ftps_deploy.py` still refuses to
publish any page containing template placeholders unless `--force` is passed.
**G16. FIXED** — `remove` refuses the webspace root and requires `--yes`.
**G17. FIXED** — the API test fixture patches `app.server.data_dir` into `tmp_path`, so tests
can no longer write into the repo's `data/panos/`.
**G18. FIXED** — popularity lookup normalises keys on both sides, so the live the popularity source
values now match Messier objects ("M 42" ↔ "M42").
**G19. FIXED** — `make_release.py` stages `NightSeam-latest.zip` and the download page's
no-JS fallback links to it (previously a bare `NightSeam.exe` whose upload is undocumented).

## Documentation

**H1. FIXED** — AGENTS.md now states the truth: session folders use the **machine-local**
wall clock (`datetime.fromtimestamp`), with the corrected example.
**H2. FIXED** — `web/astro.js`'s stale comments ("4-min steps over 48 h", `dayStart` as local
midnight) corrected.
AGENTS.md also documents the changed workflows: `--no-browser` handoff, `remove --yes`, the
placeholder guard, the `NightSeam-latest.zip` artifact and the changelog step.

## Verified in a real browser (headless Chrome over CDP)

With the sandbox elevated for Chrome, both apps were driven end to end — **zero uncaught
exceptions and zero console errors** in either — and the fixes behave as intended:

| Check | Result |
|---|---|
| E4 pre-paint theme fetch | the old code really does throw `InvalidAccessError`; the fixed code returns HTTP 200 |
| B2 web night window | Dark time **6.9 h** for 2026-09-10 (was ~35 h) and **12.1 h** for 2026-12-21 |
| C1 % visibility column | fills (45 %, 0 %, 0 %, 58 %, 87 %) and **recomputes** for another date (62 %, 0 %, 0 %, 70 %, 84 %) |
| E2 "Visible now" | **65** while the pick list shows 3 — no longer clamped to the top-8 list |
| E3 search focus | after the debounced re-render focus is still `#cat-q` with the caret at position 3, table filtered to 60 rows |
| E8 arrow keys | ArrowRight on the **Tonight** view moved the clock 13:50 → 14:50 (was Sky-View-only) |
| E6 resize leak | two Sky View renders + a viewport resize → no exception (the audit's "negative radius throws" concern is gone) |
| C4 empty date | clearing the date then opening a detail → no exception, and the modal opens |
| B3 weather setting | with `weather_auto` saved, `#wxAuto.checked` is true after a reload (was always false) |
| E1 Ctrl+Z | not prevented when the horizon tab is inactive, nor inside a text field |

Harnesses: `logs/cdp_web.mjs` (web app, seeds a site into IndexedDB first) and `logs/cdp_final.mjs`
(the % column + the two desktop checks); `logs/cdp_check.mjs` drove the desktop app. Chrome used
the workspace profile `theme-preview/.a11y-prof`; afterwards Chrome, both servers and
`data/instance.json` were cleaned up. Not clicked through: E7 (needs a slow, out-of-order image
fetch), E10 (pointer-drag clamping) and E12 (needs a failing PUT).

## What is left for you

1. **Commit/tag and redeploy** when you are happy: everything is uncommitted, and nightseam.de
   still serves the old landing pages, changelog and web bundle.
2. The 56 `tmp_path` test errors remain an environment artifact; run
   `python -m pytest tests/` in a normal shell for the full 138-test pass (3 regression tests
   were added for the import fixes and 5 for IMAGETYP classification).

## Not changed (verified clean during the audit)

The astronomy core and three-engine parity (worst 0.000007°), `web/catalog.json` determinism,
path safety, `fits.py`/`paths.py`/`planning.py`/`nightcalc.py`, the data files (catalog,
advanced scores, DB, CSV, popularity cache), the web timezone helpers and the landing
accessibility/links. See the audit sections in the git history of this file for the evidence.
