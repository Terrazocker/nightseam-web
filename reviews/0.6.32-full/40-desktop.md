# Desktop lane - shell, worker, async (`static/js/*`, `main.py`)

Subject: HEAD `3277846`, `git describe` = `v0.6.32-3-g3277846`, tracked tree clean
(`?? REVIEW-PROMPT.md`, `?? reviews/0.6.32-full/`). Read-only; every probe lives
under `reviews/0.6.32-full/evidence/desktop/`.

## What I checked (and how)

| Area | How | Result |
| --- | --- | --- |
| `night.js` post-`await` supersession | full read + `night_race.mjs` semantics | all 3 awaits (`:40`, `:42`, `:63`) re-check `ctl !== _nightCtl` (`:41`, `:44`, `:64`); the catch re-checks before toasting (`:75`); busy cleared only by the current load (`:69`). Sound. |
| Prefs during an in-flight build | `prefs_burst.mjs` (real `planning_client.js`, fake worker mirroring `planning_worker.js`'s gen rule) | 8 back-to-back `requestPrefsDerived()` (one `input`-per-pixel slider drag) all delivered + all promises settled; no worker timeout. Refuted. |
| Worker/sync equivalence | `worker_sync_divergence.mjs` - real core, 300 random objects + 24 meridian culminators x 6 sites x 3 dates = 5832 build units | `max_alt` differs by **0.000 deg** everywhere; only the *index* `max_i` differs (78.6%), and `max_i` has no consumer in `static/js`. Refuted (not DS4). |
| Payload grid + `viewFullDay` | `grid_fullday.mjs` (real `night.js`/`planning_client.js`/`derive.js`/`header.js`) | 241 samples / 6 min / exactly 24.000 h; `scrubWindowRange()` OFF `[75,186]` (sunset..sunrise) vs ON `[0,240]`; scoring clip `[95,166]` **unchanged** by the toggle; ON->OFF clamps `S.tIdx` 240 -> 186; `times_iso[n]` is `undefined` and never reachable. Sound. |
| Timezone anchor of the grid | `tz_halfhour.mjs` + `dst_grid.mjs` | DE-02. |
| Wizard | `wizard_hang.mjs` (real `wizard.js` + stubbed fetch/clock) | DE-01. PUT-on-replay, value restore across steps, no-reload submit, inline errors and `#wizSkip` gating all verified present. |
| `main.py` shell | `api_probe.py`: real `main.main()` with `paths.data_dir()`/`logs_dir()` monkeypatched to `logs/desktop-probe/` (never `data/`) | DE-03. Also verified: `/api/state` 200 (`version 0.6.32-3-g3277846`), `/api/night` **404**, `/api/object/m42` **404**, `/api/sites`//`/api/panoramas`//`/api/catalog` 200; headless single-instance handoff returns 0 in 0.09 s without binding a second server; a stale `instance.json` port is probed and the file removed; `free_port(8419)`-busy -> random `22871`, `free_port(8421)`-free -> `8421`; `/api/shutdown` exits the main loop and clears `instance.json`. |
| `updater.js` | full read + `cmpVersion` trace | network error / `onerror` / 8 s hang all silently finish; a malformed `rel.version` yields `NaN||0` per component (no crash, no toast); an older remote version shows nothing. Inert when `window.__NS_RELEASE.version` is absent. Sound. |
| DOM/state contracts | `index.html` grep + reads | `#rigSelect` in the topbar next to Site (`:35`), min-alt slider in the topbar (`:42`) with Bortle in the menu (`:190`), `viewFullDay` in the menu (`:112`), all 4 modals carry `role="dialog" aria-modal="true" aria-labelledby`; `initFocusTrap` wraps the first open dialog; `#busy` sits in a reserved `.busy-slot`. |
| Packed-exe behaviour | `dist/NightSeam.exe` copied to a scratch dir and launched `--no-browser --port 8411/8412 --console` | Not runnable in this sandbox - see "Not checked". |

## Findings

### DE-01 medium CONFIRMED - a hung wizard validate creates a DUPLICATE observing site on retry
- file:line: `static/js/wizard.js:173-180` (guard) + `:62-70` (site branch)
- impact: the first-run wizard's own error message tells the user to retry. Retrying after a slow (but eventually successful) `POST /api/sites` leaves the user with **two identical sites** in the topbar `#siteSelect` and in Setup -> Sites, both with the same name/coordinates, with no indication which is "the" site.
- mechanism: the 20 s `Promise.race` guard drops `_busy` and shows "The previous step is still busy - please try again." but **nothing cancels the pending `validate()`**. Its `api()` call has a 30 s timeout, so it can land after the guard. A retry runs the location step again against the same `S.cfg` snapshot (still no active site, because the first request has not resolved), so `wizard.js:62` finds no `active` and takes the `POST /api/sites` branch a second time. `POST /api/sites` has no dedup (`app/server.py:477-483`).
- evidence: `node reviews/0.6.32-full/evidence/desktop/wizard_hang.mjs` (first `POST` lands 25 s after the click, guard fires at 20 s):
  ```
  after 1st Next : posts ["POST /api/sites"] | err ""
  after guard    : err "The previous step is still busy - please try again." | posts ["POST /api/sites"]
  after 2nd Next : posts ["POST /api/sites","POST /api/sites"]
  S.cfg.sites    : [{"id":101,...},{"id":102,...}]     <- two identical "Backyard" sites
  ```
- repro: open the wizard with no site, type coordinates, make the first `POST /api/sites` answer after >20 s (throttle/proxy/loaded machine), wait for the guard message, click Next again.
- requiredFix: keep the in-flight promise per step and re-await it instead of re-validating, e.g. `_pending = st.validate(); const done = await Promise.race([_pending, timeout]);` and on a later Next reuse `_pending` (clearing it when it settles). Smallest honest change; no refactor.
- counterArgument: the 20 s guard is what AGENTS.md asks for ("a 20 s guard unsticks a hung validate"), and reaching it needs a 20 s+ request - a local SQLite `POST /api/sites` normally answers in milliseconds. So this is a rare-but-real state, not an everyday path; a single site is never lost.

### DE-02 low CONFIRMED - `tzOffAt` mis-parses a half-hour offset, shifting the desktop day grid by 30 min on one date a year
- file:line: `core/time.js:25` (`/GMT([+-])(\d{1,2}):?(\d{2})?/`), consumed by `static/js/util.js:89` -> `static/js/planning_client.js:173`
- impact: for a half-hour DST zone (Lord Howe, +10:30/+11:00) the desktop grid is anchored 30 min off for that date, so every timestamp the desktop derives from the grid - the scrub label, the altitude chart's x-axis, `#nightInfo`'s window marker positions - is shifted by 30 min, and "now" lands on a sample 30 min away instead of the nearest one. The provider is not affected: `fmtT` uses the IANA zone directly.
- mechanism: `Intl`'s `longOffset` is colon-formatted (`GMT+10:30`), but the regex only accepts `(\d{1,2})` optionally followed by `:?(\d{2})?`; `\d{1,2}` greedily matches `10` and the `:30` is discarded, so a +10:30 zone reports 600 min instead of 630.
- evidence: `node reviews/0.6.32-full/evidence/desktop/tz_halfhour.mjs`
  ```
  BAD  Australia/Lord_Howe 2026-10-03 tzOffAt=660 core=660 Intl=630 -> grid shifted by 0.5 h
  (9 of 10 cases - KOLKATA 330, KATHMANDU 345, ADELAIDE 630, ST_JOHNS -210, CHATHAM 825, BERLIN 120, NY -240 - are correct)
  ```
  `node .../dst_grid.mjs` shows the consequence: `Australia/Lord_Howe 2026-10-03 grid=24.00h tzOff=660` while the true noon offset is 630.
- repro: set the timezone to `Australia/Lord_Howe` (or any +xx:30 zone), pick the date on which that zone's DST starts (2026-10-04 there), and read `#timeLabel` against the real clock: the grid's samples sit at :33/:39/... instead of :00/:06.
- requiredFix: match the colon explicitly, e.g. `GMT([+-])(\d{1,2})(?::(\d{2}))?`, in `core/time.js:25` (a core change => `scripts/build_core.py` re-bake).
- counterArgument: narrow. Exactly one calendar date per year per half-hour zone is wrong - the date on which the DST *start* happens (noon still at the old `+xx:30`, i.e. `2026-10-03` for Lord Howe). The transition date itself (`2026-10-04`) already reports the new whole-hour offset and is correct in my probe, and an ordinary date such as `2026-09-12` was not affected in any of the zones I tested. Whole-hour zones (Berlin, New York), fixed half-hour zones (Kolkata, Kathmandu) and 45-minute zones (Kathmandu) all parse correctly, so this is not a general "half-hour zones are broken" bug.
- cross-reference: the parser lives in `core/time.js` (core/reference lane owns the fix); this is the desktop-side *consequence* (the grid anchor), not a second root cause.

### DE-03 low CONFIRMED - the packed `dist/NightSeam.exe` cannot run in this sandbox, so no desktop/browser gate ran here
- file:line: environment, not the product; `dist/NightSeam.exe` exists (20,737,750 bytes, 2026-09-13 22:37)
- impact: coverage gap, not a user-facing defect. Recorded here so the captain does not read my lane as browser-verified.
- evidence: the exe copied into `reviews/0.6.32-full/evidence/desktop/srv/` and launched as `.\NightSeam.exe --no-browser --port 8411 --console` **and** `--port 8412 --console`:
  ```
  job pwsh-3 finished [exit code: 0]   (no stdout/stderr captured)
  Get-ChildItem srv -Recurse  ->  only  ...\srv\data\  and  NightSeam.exe
  http://127.0.0.1:8412/api/state  ->  connection refused after 12 s
  ```
  No `instance.json`, no `logs/`, not even the `data/nightseam.db` the source path creates. `--version` also prints nothing and exits 0 (a noconsole build has `sys.stdout = None`; `main.py:41` only repairs that inside `ensure_stdio()`, which `argparse`'s version action never reaches). `python scripts/check_browser.py` needs Playwright's asyncio **overlapped pipes** + Chromium's named pipes, which `ENVIRONMENT.md:37-54` measures as hard-denied in workspace-write, and this session has approvals disabled, so no escalation was possible.
- requiredFix: none - run `python scripts/check_browser.py --desktop` from a normal shell (or an unsandboxed command) against the staged build.
- counterArgument: the exe is untracked build output; the source tree's `static/` + `main.py` were fully exercised through the Node/Python probes, and `--no-browser` API behaviour was verified by running the real `main.main()` from source.
- note for the docs lane: `AGENTS.md` uses `/api/object/m42/image?thumb=1` as the cache-only example (`:189`-ish); that id no longer resolves (404) since the 0.6.26 catalogue migration renamed it to `ngc1976`. The route itself is fine.

## Refuted (claims I checked that are NOT bugs)

- **A superseded `prefs` message strands an unsettled promise and later kills the worker** (my own hypothesis from `planning_worker.js:218`'s `if (m.gen < latestPrefsGen) return;`, which posts nothing). Refuted twice: `latestPrefsGen` is assigned *synchronously* in `self.onmessage` (`:45`) immediately before `runPrefs(m)`, and `runPrefs` has no `await` before the comparison, so `m.gen === latestPrefsGen` always holds when it runs - the branch is unreachable. `prefs_burst.mjs` measured 8 rapid drags: `delivered [2..9] | dropped [] | timeouts fired: 0`, all 8 promises settled, worker alive.
- **`_wgen` shared by night and prefs is "one generation counter" (AGENTS.md says separate)**: no. In `planning_client.js` `_wgen` is only a monotonically increasing *message id* for the `_pending` map; the load-vs-prefs separation is `_bindGen` vs `_dgen` and the worker's `latestNightGen` vs `latestPrefsGen`. Both are separate and both work (`worker_lifecycle.mjs` test A).
- **Worker vs sync `max_alt` divergence (a second DS4-class divergence)**: measured 0.000 deg on 5832 real build units. The two recipes (`planning_client.js:259-262` rounds before argmax; `:404-414` takes the raw argmax) pick different *indices* when the top samples round together, but the reported altitude is identical and `max_i` is never read by `static/js`. Not a finding.
- **The 241-sample grid can index one past the end**: `nightIndexRange`/`indexRangeFor` clamp to `tl.n-1`; `longestRunJS` is half-open and `windowEndISO` resolves `end == n` to a real time; `scrubWindowRange()` with `view_full_day` returns `[0, tl.n-1]`; `times_iso[241]` is `undefined` and unreachable.
- **`viewFullDay` breakage**: OFF `[75,186]` / ON `[0,240]` / OFF clamps the selection back to 186; `nightIndexRange()` stays `[95,166]` in every case.
- **Whole-hour DST zones shift the grid**: `Europe/Berlin 2026-03-28` reports the correct `tzOff=60` and `America/New_York 2026-03-08` the correct `-240`; the grid is a fixed 24.000 h from local noon, so a 23/25 h wall-clock day only changes the *label*, and `nightIndexRange` maps dusk/dawn on the real instants. Not reported.
- **Dev hooks leak**: `window.__NS_KILL_WORKER`/`__NS_REVIVE_WORKER` are defined at module load (`:96-110`) but both early-return `false` unless `window.__NS_DEBUG_WORKER` is truthy; `workerUsable()` also honours `__NS_WORKER_FORCE_FAIL`, which nothing in the shipped tree sets.
- **Modal ARIA / focus trap**: all four modals carry `role="dialog" aria-modal="true" aria-labelledby=...`; `initFocusTrap` delegates one `keydown` listener over the first visible `[role="dialog"]` and pins focus inside.

## Not checked (honest coverage gaps)

- **The packed exe and the browser gate** (`--desktop`/`--web`): no Chromium can start in this sandbox and approvals are disabled - see DE-03. Everything asserting *rendered* desktop behaviour (geometry, focus order, screenshots) is unverified by me.
- **`main.py`'s window paths**: `run_native_window` (pywebview is not importable in this interpreter - `import pywebview` raises `ModuleNotFoundError`, confirming the documented browser app-mode fallback) and `launch_app_window` (would spawn Edge/Chrome) were read, not executed.
- **`JsApi.pick_archive_dir`**: needs a real pywebview window + native dialog; not executed.
- **Idle exit timing** (`--idle-exit-hours`): verified only that `--idle-exit-hours 0` never exits and that `/api/shutdown` leaves the loop cleanly; I did not wait out a real idle timeout.
- **Live network paths** (`updater.js` JSONP against `nightseam.de`, `weather.js` Open-Meteo, the Wikipedia/DSS image chain) were not called; only their failure/inert branches were read.
- **Visual/UI judgement** (geometry, contrast, density, charts): owned by the UI lane.
- Nothing in this session touched `data/`, ran the full pytest suite, deployed, tagged or uploaded anything. Scratch dirs used: `logs/desktop-probe/`, `reviews/0.6.32-full/evidence/desktop/srv/`; no server was left listening on 8407 (or on 8419/8411/8412 - checked).
