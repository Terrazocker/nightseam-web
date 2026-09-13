# Lane review — `static/` desktop shell (t5, desktop-reviewer)

Subject: the NightSeam working tree at HEAD `9596878` (`git describe` =
`v0.6.24-2-g9596878`), tracked tree clean, `?? .agent-teams/ ?? reviews/`.
Lane scope: `static/` (23 modules under `static/js/`, `static/index.html`,
`static/style.css` as far as the shell contract, the `static/js/core.js` stub
and the baked `static/js/core/97c2e182fb0a5630/` tree) — read-only.
Owner of the two carry-over rows assigned to this lane: **DS4**, **DS5**.
Charter: `reviews/0.6.24/00-charter.md`. **This is the canonical lane
deliverable** — the path named by the t5 task contract, which the captain's
clerical-path fix designates as binding over the charter's §1.3 sketch
(`04-desktop.md` was removed; no duplicate exists).

No production file was created, modified or deleted. Review-only probes were
written under `reviews/0.6.24/evidence/`.

---

## 1. Coverage

### 1.1 Examined (what, how, result)

| Area / module | How it was examined | Result |
| --- | --- | --- |
| `night.js` post-`await` supersession discipline | full read + `tests/js/night_race.mjs` | all three `await`s (`:40`, `:42`, `:63`) re-check `ctl !== _nightCtl` (`:41`, `:44`, `:64`); the catch (`:75`) re-checks before toasting; busy cleared only by the current load (`:69`) |
| `planning_client.js` builder, cache, worker handshake, fallback | full read + `t5-grid-probe.mjs` + `sync_cache_key.mjs` + `night_race.mjs` | 241 samples / 6 min / site-noon anchor confirmed at runtime; worker-first with sync fallback and no server route; `_wgen`/`_bindGen`/`_dgen` and `_buildsInFlight`/`_prefsQueued` verified |
| `planning_worker.js` generations, catalog reset, `max_alt`, dead work | full read + `worker_lifecycle.mjs` (drives the REAL worker through `worker_bridge.mjs`) | night/prefs generations separate (`:23-24`, `:41-48`); `catalog-reset` bumps `catalogEpoch` (`:31-39`); `max_alt` equality — see DS4 |
| `derive.js` ranges, clip, constants | full read + `t5-grid-probe.mjs` + `derive_window.mjs` + `scrub_degenerate.mjs` + `scrubgrid` engine via pytest | `indexRangeFor` (`:98-109`) backs both `nightIndexRange` (`:91`) and `scrubWindowRange` (`:116`); scoring clip `i>=i0 && i<=i1` in the clear window, `% of night` and score (`:182-201`); `SCRUB_STEP_MIN=6/SCRUB_SHIFT_STEP_MIN=60` |
| `effectiveMinAlt` re-derivation on Bortle change | code read (`header.js:92-114`, `setup.js:261`, `derive.js:252`) + `dom_handlers.mjs` (E5) | explicit `min_useful_alt_explicit` wins; the Bortle-derived default is re-derived live and the slider value follows |
| `magVisible` / `size_am` / `fmtSize` consumers | `skyview.js:452-468`, `util.js:141`, `targets.js:151`, `setup.js:288-291` + `mag`/`size` engines via pytest | shared core rule used; advanced mode raises the slider max 14→20 |
| `__NS_DEBUG_WORKER` hooks + worker recovery | code read + `t5-ds5-revive.mjs` + `tests/browser/desktop_suite.py:95-108` | KILL nulls the instance (recoverable); `onerror` does not — see DS5 |
| DOM-id contract | `python scripts/check_js.py` | 200 ids in HTML, 182 referenced from JS, 0 missing |
| `pano.js` (editor, mask, crop, save) | full read of the edit/save/select/crop/mask/loupe paths | findings DE-02, DE-03, DE-04, DE-05, DE-10 |
| `skyview.js`, `skymap.js`, `skydata.js` | full read of the bind/render/hover/legend paths (independently re-verified after a delegated sweep) | findings DE-11, DE-12; silhouette/erase/`profileSegments` parity and the Sun/Moon `aboveHorizon()` rule held |
| `wizard.js` hardening | full read | PUT-on-replay, value restore across steps, no-reload submit, 20 s guard, inline errors all present; finding DE-07 |
| `setup.js`, `targets.js`, `tonight.js`, `header.js`, `detail.js`, `archive.js`, `weather.js`, `updater.js`, `dragwin.js`, `main.js`, `util.js`, `state.js`, `astro.js`, `core.js` | full read of the mutation/render/async paths | findings DE-01, DE-06, DE-08, DE-09, DE-13, DE-14 |
| engines / guards | `python scripts/check_js.py` (exit 0), `night_race` 0, `derive_window` 0, `scrub_degenerate` 0, `worker_lifecycle` 0, `sync_cache_key` 0, `sky_band` 0, `pano_geom` 0, `dom_handlers` 0, `python -m pytest tests/test_ui_invariants.py` 26 passed, `tests/test_js_parity.py tests/test_js_behaviour.py tests/test_core_fixtures.py` 55 passed | all green (see §1.2 for the two contract commands that are not runnable as written) |

### 1.2 Deliberately **not** examined (with the reason)

| Not examined | Reason |
| --- | --- |
| `python scripts/check_browser.py --desktop` (the only end-to-end desktop check) | The sandbox refuses to execute the copied exe: `check_browser FATAL: could not start a target: [Errno 13] Permission denied: ...\ns-browser-*\NightSeam.exe` (exit 2). `dist/NightSeam.exe` is out of scope per charter §1.2 (generated build output), and the harness would test that artifact rather than HEAD. The exe on disk is a 0.6.24 build (`dist/release/version.json` = 0.6.24) and `git diff --name-only v0.6.24..HEAD` touches only `AGENTS.md`, `landing/changelog.json`, `web/app.js`, `web/index.html` — so the check *would* have been valid evidence; it is blocked by the environment, not by the product. Not filed as a finding (charter §3 environment rule). |
| `static/style.css` / `themes.css` layout and the visual themes | Covered by `tests/test_ui_invariants.py` (26 passed); the desktop lane's contract is behaviour, and a rendered-pixel review needs the browser gate above. |
| `static/js/skydata.js` payload values (±1 deg decoration) | Static data: `mulberry32` is seeded deterministically and the module exports data only; a coordinate audit of decoration is not reachable-impact work. |
| The full advanced (12k) worker build timing on real hardware | `bench_desktop_compute.mjs` was not run (not in this lane's contract; needs a browser/worker environment). |
| `main.py` (window/pywebview, single instance) | Platform/entrypoint lane (t2). |

### 1.3 The two contract verify commands that are not runnable as written

Both are used in the t5 contract verbatim; neither is a product defect.

1. `node tests/js/astro_parity.mjs` → exit 2, `usage: node astro_parity.mjs
   <engine>`. It is a **multi-engine stdin harness** (`tests/js/astro_parity.mjs:17-24`
   rejects a missing engine; `:53-61` reads a JSON case array from **stdin**).
   Its real driver is `tests/test_js_parity.py:25::_run_node(engine, cases)`,
   which pipes cases in. I ran the driver instead:
   `python -m pytest tests/test_js_parity.py tests/test_js_behaviour.py tests/test_core_fixtures.py -q`
   → **55 passed**. The desktop-facing engines (`desktop`, `window`, `size`,
   `mag`, `skyzoom`, `abovehorizon`, `minalt`, `frame`, `advice`, `status`,
   `pick`, `darkwindow`, `crosszone`, `scoring`, `nightstats`, `scrubwindow`,
   `scrubgrid`, `timezone`, `shortcut`, `ceil`) are all exercised there.
2. `node tests/js/worker_bridge.mjs` → exit 1, `TypeError: Cannot read
   properties of null (reading 'on')` at `tests/js/worker_bridge.mjs:17`. It is
   a **worker module** (`parentPort` is `null` on the main thread), meant to be
   spawned as a `worker_thread` — which is what `tests/js/worker_lifecycle.mjs:72`
   does. Spawned that way it passes (exit 0, `worker lifecycle contract held`).

---

## 2. Carry-over audit (charter §6)

### CAR-DS4 — worker vs sync `max_alt` / `max_i` / "occasional ceil bin" → **CLOSED** (residual `max_i` divergence is a dead field)

- Baseline claim (`CODE-REVIEW-0.6.20.md:51`, repeated in `AGENTS.md:453`):
  "Worker vs sync diverge on `max_alt`/`max_i` (rounded vs raw argmax) and
  occasional ceil bin … one-sample/0.05 deg near ties, cosmetic".
- Sites: `static/js/planning_client.js:259-262` (worker binding:
  `for (i=1..) if (alts[i] > alts[maxI]) maxI = i; … max_alt: alts[maxI]`) and
  `:404-414` (sync: raw argmax `if (a > maxRaw) { maxRaw = a; maxI = i; }` …
  `max_alt: r1(maxRaw)`); `static/js/planning_worker.js:167-172` (the worker's
  `alts[i] = r1(a)`), `:169` / `:407` (both compute `ceils[i] = r1(ceilAt(z))`
  from the **raw** azimuth `z`).
- Resolution: **CLOSED**. `r1(x) = Math.round(x*10)/10` is monotone
  non-decreasing, so `max_i r1(a_i) == r1(max_i a_i)`: the worker's argmax over
  the rounded samples yields exactly the sync path's `r1(raw max)`. The
  "occasional ceil bin" half no longer exists because both paths pass the raw
  azimuth to the same `lookup()` (`planning_client.js:159-167` ==
  `planning_worker.js:55-63`).
- Evidence: `node reviews/0.6.24/evidence/t5-grid-probe.mjs` → on 240 synthetic
  objects over the **real** 241-sample grid at 52.5 N / 13.4 E
  (`computeNightTracks` from the shared core):
  `DS4: max_alt identical on every object (sync r1(rawmax) vs worker argmax-of-rounded; 0 diffs, worst 0 deg)`
  → **probe exit 0, 19/19 assertions held**.
- Residual (not user-visible): the tie index *does* diverge — the probe reports
  `max_i differed on 223/240 objects`. `max_i` has **no consumer in either
  shell** (`grep -n "max_i" static/js` = the two assignment sites only;
  `targets.js:104/160` and `detail.js:95/344` all use `max_alt`), so the tie
  index is dead data. `max_alt` itself has exactly two consumers,
  `targets.js:104` (sort) and `targets.js:160` (integer display), both fed by
  identical values. A future consumer must not rely on `max_i`.
- Recommendation for the record: `AGENTS.md:453` may drop the `max_alt` half;
  keep the row only as "`max_i` tie index is unused by design".

### CAR-DS5 — worker revive after `onerror` → **STILL OPEN** (dev-hook only; the sync fallback always plans)

- Baseline claim (`CODE-REVIEW-0.6.20.md:52`): "`onerror` marks broken but keeps
  the dead Worker; revival hook cannot recover it".
- Sites: `static/js/planning_client.js:63-67` (`_worker.onerror` sets
  `_workerBroken = true`, rejects/clears `_pending`, but **keeps** `_worker`),
  `:97-104` (`__NS_KILL_WORKER` terminates **and** nulls it), `:105-109`
  (`__NS_REVIVE_WORKER` only clears the flag), `:71-88` (`ask()`'s 120 s
  timeout is the only other recovery).
- Resolution: **STILL OPEN**, narrowed. After a real worker `onerror`, revive
  re-posts to the same failed instance: no fresh `Worker` is constructed, and
  the request cannot settle until `ask()`'s 120 s timeout (which then marks it
  broken again). The KILL path *is* recoverable, because it nulls the instance.
- Reproduction (paste-ready, exit 0 = the described behaviour):
  `node reviews/0.6.24/evidence/t5-ds5-revive.mjs` →
  `{"workersConstructedAfterCrashRevive":1,"revived":true,"secondBuildStillPending":true,...}`
  then `{"workersConstructedAfterKillRevive":2}` — i.e. crash+revive reuses the
  failed worker (1 construction, the next build still pending after 40 macrotasks),
  kill+revive builds a fresh one.
- Severity **low**: both hooks are gated on `window.__NS_DEBUG_WORKER`
  (`:98`, `:106`) and therefore unreachable in production; the production
  consequence of an `onerror` is only that the app stays on the synchronous
  path for the rest of the session (identical results, slower). `AGENTS.md:286-289`
  documents the hooks as dev-only. The only user-visible risk would be a
  developer reviving after an `onerror`, which then stalls a load for 120 s.
- Suggested fix (not applied — review only): `onerror` should
  `_worker.terminate(); _worker = null;` like `__NS_KILL_WORKER` does, so
  `getWorker()` rebuilds. Note `tests/browser/desktop_suite.py:107` calls
  `__NS_REVIVE_WORKER()` but never asserts that the worker path is used again,
  so the gate cannot catch this.

---

## 3. Findings

Severity is asserted by §5 of the charter (impact, not difficulty). 3 medium, 12 low.

### DE-01 — Adding a custom target never rebuilds the night plan, so the new target is missing from Targets/Tonight/Sky (medium, confidence high)

- **file:line** `static/js/setup.js:206-218` (primary `:216`), secondary
  `static/js/targets.js:117-138` (`:124`, `:136`), contrast `static/js/setup.js:55`,
  `:332`, `:338`, `static/js/tonight.js:39`.
- **rule violated** — internal contract/comment in the same file
  (`setup.js:222-224`): "the custom-target list changed: drop the planning
  caches … so the next build cannot serve or bind stale entries" — the caches
  are dropped, but the build they feed is never re-run; and the sibling
  mutators' own pattern (site add/use/delete all end in `loadNight()`).
- **what is wrong** — `#customForm` submit POSTs `/api/catalog/custom`, then
  `await refreshCatalogMeta(); renderCustomList(); renderTargets();`
  (`setup.js:216`). `refreshCatalogMeta` (`:221-229`) calls
  `resetPlanningCaches()` and refetches `S.catalog`/`S.meta`, but nothing
  rebuilds `S.night`: `renderTargets` iterates the *payload's* object list
  (`targets.js:124 for (const o of S.night.objects)`), which still holds the
  catalog snapshot from the last build, so the new id is absent while the
  counter (`targets.js:136-138`, `${rows.length} of ${S.catalog.length}`) uses
  the already-grown catalog and reports a phantom "filtered" row.
- **trigger / reachability** — Setup → Targets → name/RA/Dec → **Add** (any
  user, standard mode). The new row shows in "Your custom targets"
  (`renderCustomList` reads `S.catalog`) and is invisible in Targets, in
  "Best targets tonight" and in the Sky View until an unrelated site/date
  change or a restart re-runs the build.
- **reproduction** (numbered chain; every step is a line a verifier can open)
  1. `setup.js:206` the submit handler runs; `:210` the POST succeeds.
  2. `:216` calls `renderTargets()` without `loadNight()`.
  3. `setup.js:221-228` refetches `S.catalog` only (no `S.night`).
  4. `targets.js:124` loops `S.night.objects` — the pre-add snapshot.
  5. `targets.js:136-138` prints `rows.length` "of" `S.catalog.length` → one
     short, with "· filtered".
  Contrast: `setup.js:55` (site add), `:332` (site use), `:338` (site delete)
  each end with `loadNight()`; the delete path of a custom target (`:241-244`)
  survives only because `targets.js:126 if (!m) continue` skips ids whose meta
  is gone.
- **impact** — A user adds a custom target and cannot find it in any observing
  list; the feature reads as broken (the workaround is to change the date or
  open another site). Recoverable without data loss.
- **falsifier** — the new row being present in the Targets table immediately
  after Add, i.e. if `S.night` were rebuilt from `S.catalog` or if `:216`
  ended in `loadNight()`.
- **history** — new (not in `CODE-REVIEW-0.6.20.md`/`BATCH3-REPORT.md`; the
  custom-target/`#customForm` path was never in the carry-over list).

### DE-02 — Switching panorama reuses the previous panorama's mask overlay (medium, confidence high)

- **file:line** `static/js/pano.js:459-462` (primary `:460-461`), secondary
  `:262-295` (`select()`), `:405` (`invalidateMask`), `:425-436` (`buildMask`),
  `:221` (`Pano.onShow`), `:16-17`.
- **rule violated** — the panorama-editor contract in `AGENTS.md` §"Panorama
  profile/strokes invariant" (the editor must show the record's own mask; a
  mask the user reads but that is not stored is exactly what the "never
  silently remove/keep a profile" family of pins exists to prevent) plus the
  module's own contract comment at `:265-267` ("a pending auto-save belongs to
  the PREVIOUS panorama") — the cache has the same ownership problem and is not
  reset.
- **what is wrong** — `render()` rebuilds the offscreen mask only when the
  cache is missing **or the canvas size changed** (`:460-461`).
  `buildMask(W,H)` paints `Pano.cur.strokes` (`:431`), so the cache belongs to
  one record, but `invalidateMask()` is called only from the gesture/undo/
  mode/calibration/recompute paths (`:72`, `:153`, `:172`, `:194`, `:390`,
  `:398`, `:660`, `:729`) — **not** from `select()`. `select()` assigns the new
  record (`:263`) and writes the calibration fields programmatically
  (`:274-277`, which fires no `input` event, so `:70-74` never runs), so the
  mask of the previously edited panorama is drawn over the newly selected
  photo. `W` is `stage.clientWidth-2` (constant) and
  `H = round(clamp(W*ih, 200, innerHeight*0.72))` (`:447-449`), so two panoramas
  from one camera — or any two very wide panoramas that both clamp to 200 —
  collide exactly.
- **trigger / reachability** — paint (or import) panorama A, then click
  **Edit** on panorama B with the same image aspect; also on the very first
  selection after `Pano.init()` if a size collision exists. Every user of the
  Horizon tab.
- **reproduction** (numbered chain)
  1. `pano.js:132`/`select()` at boot builds `Pano.maskCv` inside the first
     `render()` (`:461`) from A's strokes.
  2. User clicks Edit on B → `renderList()`'s delegated handler (`:257-259`)
     calls `select(B)` → `:263 Pano.cur = rec` (no `invalidateMask`).
  3. `:284-293` the new image loads → `render()`.
  4. `:447-449` W/H identical to A's → `:460` the condition is false →
     `:462 ctx.drawImage(Pano.maskCv, …)` paints A's mask over B.
  Independent check: `grep -n "maskCv" static/js/pano.js` → `16/17`, `405`,
  `460`, `461`, `462` only; no call site in `select()`.
- **impact** — The editor shows a mask that is not stored for the selected
  panorama: the user may believe B is already painted (and skip repainting) or
  erase areas that were never painted. Stored data and every scoring number are
  unaffected (the mask canvas is display-only; `recomputeProfile` derives from
  the strokes).
- **falsifier** — `invalidateMask()` inside `select()` (or a record-id-keyed
  mask cache) makes the collision impossible; conversely, if `select()` reset
  `Pano.maskCv` indirectly through a size change on every switch, step 4 would
  rebuild it.
- **history** — new.

### DE-03 — `setPaintMode()` discards a stroke-less record's stored profile, contradicting the "clearMask is the ONE place" invariant (medium, confidence high)

- **file:line** `static/js/pano.js:148-157` (primary `:151-152`), secondary
  `:643-663` (the stroke-less branch, `:650-651` comment), `:393-401`
  (`clearMask`), `:735-762` (`scheduleSave` persists it), `:10-13` (mode
  buttons), web twin `web/horizon.js:1331-1336` (the `#ed-mode` change handler
  sets only `p.paintMode`, re-derives the mask from strokes with
  `rebuildMaskNow()` and commits — it never empties `profile`/`profileTop`).
- **rule violated** — `AGENTS.md` §"Panorama profile/strokes invariant":
  "with NO strokes the stored `profile`/`profileTop` are AUTHORITATIVE, so a
  stroke-less imported record is never blanked just by opening/saving …
  **Deliberate clearing goes through `clearMask()`, the one place** a stored
  profile is discarded. A stroke-less profile must not be silently removed -
  that could make a blocked target look observable."
- **what is wrong** — `setPaintMode()` sets `paint_mode`, then **empties**
  `profile` and `profile_top` (`:151-152`) before `recomputeProfile()`
  (`:155`). The stroke-less branch (`:652-659`) sees `length !== NBIN` and
  refills canonical sentinels (`-90` everywhere in obstacle mode, `90` in sky
  mode), and `scheduleSave(0)` (`:156`) PUTs that array immediately
  (`:742-754`), so the imported horizon is gone from the database. The desktop
  code's own comment at `:650-651` names `setPaintMode()` as a second
  deliberate-clearing site, which is precisely what the invariant forbids;
  `clearMask()` (`:393-401`) is the documented one.
- **trigger / reachability** — A panorama record with a stored
  `profile`/`profile_top` and **no strokes** — exactly the shape a backup
  import produces (the invariant names it) — then any click on the
  Obstacle/Sky mode buttons (`:10-13`, `updateModeButtons`). One click, no
  confirmation, no undo (`Pano.undo` snapshots strokes only, `:161-165`).
- **reproduction** (numbered chain)
  1. Import a backup whose panorama has `strokes: []` and a 720-bin
     `profile`; open the Horizon tab.
  2. `recomputeProfile`'s stroke-less branch (`:652-659`) keeps it because
     `profile.length === 720` — the invariant works here.
  3. Click "Sky mode" → `setPaintMode("sky")` → `:151-152` empties both arrays.
  4. `:155` `recomputeProfile()` → `:653` length ≠ 720 → `:654` canonical 90s;
     `:156` `scheduleSave(0)`.
  5. `:737-754` the PUT stores the sentinels → `GET /api/panoramas` now returns
     a fully-open horizon. Switching back to obstacle mode cannot recover it
     (the original array is gone).
  Contrast: the web editor's mode change (`web/horizon.js:1331-1336`, verified)
  only flips `p.paintMode` and commits, so its stored profile survives — this is
  a verified desktop-only divergence, not a shared behaviour.
- **impact** — Silent destruction of an imported horizon mask on a mode
  toggle; afterwards every blocked target reads as observable/visible with no
  error, i.e. the failure mode the invariant warns about. Recoverable only by
  re-importing the backup or repainting from scratch.
- **falsifier** — If `setPaintMode` kept the stored profile (`profile` left
  untouched when `strokes.length === 0`), the record would survive; if the
  pre-blanking were removed and `recomputeProfile`'s length check saw 720, the
  same. If AGENTS's "one place" sentence were considered superseded by the
  code comment at `:650-651`, the mechanism still holds but the item becomes a
  documentation conflict; the *impact* (an unrecoverable mask loss on one
  click) does not change.
- **history** — new as a filed finding; the intent conflict is visible in the
  code comment, and the web/desktop divergence is not recorded in
  `CODE-REVIEW-0.6.20.md` or `BATCH3-REPORT.md`. (Cross-lane note for t4: the
  web twin is the "keeps the profile" side — the other lane should confirm the
  web behaviour; if both actually blank, this is an `XL` item.)

### DE-04 — A panorama edit made inside the 900 ms auto-save debounce is silently lost on switch or app close (low, confidence high)

- **file:line** `static/js/pano.js:262-268` (primary `:266-268`), secondary
  `:735-737` (`scheduleSave` debounce), `:111-119` (one save per gesture),
  `:70-74` (slider input), `:221` (`onShow`), `static/index.html` (no unload
  hook) — `grep -n "beforeunload\|pagehide\|onunload" static/js/*.js static/index.html`
  returns **no matches**.
- **rule violated** — `AGENTS.md` §"Web panorama editor model" states the
  editor's editing rule as "(never lose an edit)" with a flush on switch/create/
  navigate-away plus an unload guard; the desktop shell (same editor, same
  `AGENTS.md` invariant list) implements the *cancel* half of that rule and
  none of the flush half. The desktop's cancel is itself pinned
  (`tests/test_ui_invariants.py:102-103`), so the finding is the missing flush,
  not the cancel.
- **what is wrong** — every gesture/slider edit schedules a delayed PUT
  (`:735-737`, 900 ms default; `:112` one per gesture, `:73` per slider input).
  `select()` cancels the pending timer and drops the reference
  (`:266-268`) instead of flushing it, and nothing flushes on window close, so
  an edit whose timer has not fired is never persisted. The edit survives only
  in the in-memory `S.panos` record until the next
  `S.panos = await api("/api/panoramas")` (`:759`, also `:229`/`:302`/`:374`)
  replaces the array — which the *new* panorama's own save performs.
- **trigger / reachability** — (a) paint a stroke / move a slider and click
  **Edit** on another panorama within 900 ms; (b) paint a stroke and close the
  app window within 900 ms. Tab switches are safe (the timer is not
  tab-scoped).
- **reproduction** (numbered chain)
  1. `:384-390` a dab pushes the stroke; `:111-112` pointerup calls
     `scheduleSave()` → a 900 ms timer.
  2. Within that window, `:257-259` → `select(B)` → `:268` `clearTimeout` — the
     PUT never happens.
  3. The stroke exists only on the in-memory record of A inside `S.panos`.
  4. Painting B → `:759 S.panos = await api("/api/panoramas")` → A's record is
     replaced by the server's copy → the stroke is gone from memory too.
  For (b): the same timer is simply destroyed with the document; there is no
  `beforeunload`/`pagehide` handler anywhere in `static/`.
- **impact** — Silent loss of one paint gesture or a calibration/altitude edit
  (the 900 ms window is short, hence low), with no toast and no undo entry
  after the fact (`Pano.undo` is per-panorama and cleared on switch, `:271`).
- **falsifier** — A flush in `select()` (or `Pano.onShow`, or an unload guard)
  would preserve the edit; if `select()` were never called while a timer is
  pending, the window would not exist.
- **history** — new; the pinned cancel (`test_ui_invariants.py:102-103`) is the
  fix for the older "the previous panorama's auto-save writes into the new
  record" bug, so a fix must flush before cancelling rather than revert.

### DE-05 — `scheduleSave`'s post-`await` block is outside the try: unhandled rejection and a `Pano.cur` rebind that can drop a newer panorama's unsaved strokes (low, confidence high)

- **file:line** `static/js/pano.js:735-762` (primary `:758-761`), secondary
  `:306-315` (`deleteCurrent` nulls `Pano.cur` at `:309`), `util.js:31-43`
  (`api()` throws by design), `:755-757` (only the PUT is guarded).
- **rule violated** — general engineering standard (error handling): an async
  callback must not reject unhandled, and a shared-state write must not be
  applied to a record the user has left. The module's own comment at `:756`
  ("api() already toasted; keep the local painting") shows the intent to absorb
  failures.
- **what is wrong** — the `try` covers only the PUT (`:742-754`). The follow-up
  `S.panos = await api("/api/panoramas")` (`:759`) and
  `const upd = S.panos.find(p => p.id === Pano.cur.id); if (upd) Pano.cur = upd;`
  (`:760-761`) run outside it: a failed list fetch rejects the timer callback
  with nothing to catch it (unhandled rejection; only `toast()` from `api()`),
  `Pano.cur` can already be `null` (deleted at `:309`) so `:760` throws a
  `TypeError`, and `:759` replaces the whole array — including a *different*
  panorama the user has since opened and painted — while `:761` rebinds
  `Pano.cur` to the freshly fetched record without the new strokes.
- **trigger / reachability** — a save in flight while the user deletes or
  switches panorama, or a failing `/api/panoramas` (server error/timeout).
  Narrow but reachable; the failure case needs the app's own server to error.
- **reproduction** (numbered chain)
  1. `:735-737` A's save timer fires and awaits the PUT (a real network/IPC
     round trip).
  2. The user switches to B (`:262-268`) and paints → B's strokes live in
     memory.
  3. `:759` A's continuation refetches the whole list → B's in-memory record is
     replaced.
  4. `:760-761` `Pano.cur` is rebound to the server's B, which has no strokes;
     B's own pending timer then saves the stroke-less record.
  For the rejection: `api()` rethrows non-ok responses (`util.js:31-43`) with
  no `.catch` on `:759`.
- **impact** — A console unhandled rejection, and in step 4 a just-painted
  edit silently discarded (same data-loss class as DE-04, different mechanism).
- **falsifier** — Moving `:759-761` inside the `try` and capturing
  `const cur = Pano.cur` before the awaits removes both effects; if the list
  fetch could never fail, the rejection half would be unreachable.
- **history** — new.

### DE-06 — A weather response is written to shared state without checking that its site is still the active one (low, confidence high)

- **file:line** `static/js/weather.js:29-61` (primary `:52-57`, `:34-36`),
  secondary `:119-121` (`refreshWeatherForSite`), `:77-81` (the panel's site
  name), `static/js/header.js:19`.
- **rule violated** — the module's own contract (`weather.js:117-118`): the
  data shown is "for the active site"; `:80-81` labels the panel with
  `activeSite()` at render time.
- **what is wrong** — `loadWeather()` snapshots `activeSite()` (`:34-36`) into
  the request URL and then assigns `WX_STATE.data`/`error` unconditionally
  after the `await` (`:52`, `:54`) — no generation counter, no re-check that
  the site is still the active one. `refreshWeatherForSite()` (`:119-121`) is
  called from the `#siteSelect` change handler (`header.js:19`) and starts a
  second request whenever data/error/auto-load exists, so two responses can
  land out of order; the panel then shows the current site's *name* (`:81`)
  over the other site's numbers (`:99-114`), and a late failure nulls a newer
  success.
- **trigger / reachability** — load the chip once (or have `weather_auto` on),
  then change `#siteSelect` twice quickly, or once while a fetch is in flight
  (Open-Meteo, ≤15 s abort at `:47-50`).
- **reproduction** (numbered chain)
  1. `header.js:19` site change → `weather.js:120` → `loadWeather()`.
  2. `:34-36` site A's lat/lon captured; `:49` the fetch is awaited.
  3. A second site change starts request B (site B) before A settles.
  4. A settles last → `:52` `WX_STATE.data = A` while
     `activeSite()` is now B (`:25-26`).
  5. `:80-81` the panel is labelled with B; `:99-114` renders A's numbers.
- **impact** — Weather presented for the wrong location (still plausible-looking
  numbers), or "weather unavailable" replacing good data. Decorative data, no
  persistence, no data loss.
- **falsifier** — Tagging each response with its site id/generation and
  dropping mismatches makes the mismatch impossible; if `refreshWeatherForSite`
  could not start a second request while one is in flight, the ordering would
  be safe.
- **history** — new.

### DE-07 — Replaying the wizard restores the first run's coordinates and PUTs them onto the currently active site (low, confidence high)

- **file:line** `static/js/wizard.js:228-235` (primary), secondary `:11`
  (`_formState` is module-level), `:116-124` (`openWizard` resets only `_step`),
  `:203-210` (`restoreForm`), `:160-189` (`next`), `:58-70` (`validate` PUTs the
  active site).
- **rule violated** — the module's own contract (`:227-228`): "replay-friendly:
  prefill the active site so Next works out of the box" — after the first run
  the prefill is skipped, and `AGENTS.md`'s wizard hardening claim
  ("replay edits the active site (PUT)") is then performed with stale values.
- **what is wrong** — `_formState` (`:11`) is never cleared. After the first
  wizard run, `saveForm()` (`:192-201`, called at `:179`) has stored step 1's
  typed coordinates, so on replay `restoreForm(1)` (`:217`) writes those old
  values into the fields and the prefill branch — guarded by
  `if (!_formState[1] …)` (`:228`) — is skipped. `validate()` then resolves the
  PUT target *at click time* (`:62-64`: the active site) and sends exactly the
  values now in the fields (`:58-70`), so the current site is overwritten with
  the earlier site's name/lat/lon/elev.
- **trigger / reachability** — create site A through the wizard; add site B in
  Setup → Sites and make it active; Setup → Backup → "Replay introduction" →
  Next. Standard wizard use, no unusual input.
- **reproduction** (numbered chain)
  1. `:11` `_formState` module-level; `:179` after run 1 it holds
     `{wizName, wizLat, wizLon, wizElev}` of site A.
  2. `:199-202`… `openWizard()` (`:116-124`) resets `_step` only.
  3. `:212-217` `renderStep()` → `restoreForm(1)` writes A's values.
  4. `:228` `!_formState[1]` is false → the active-site prefill (B) is skipped.
  5. `:62-64` `validate()` picks the active site (B) → `:65-66` PUT A's values
     onto B (`server.py` site PUT persists them).
- **impact** — The active site's stored coordinates are replaced by an earlier
  site's, so all planning silently uses the wrong location until the user
  notices and corrects it. The fields do show the old values before Next, so it
  is visible-with-attention rather than silent at the byte level.
- **falsifier** — `openWizard()` clearing `_formState`, or an unconditional
  active-site prefill on entering step 1, would make the fields show B;
  conversely if the replay path never re-ran `validate()` for step 1 the PUT
  could not happen.
- **history** — new.

### DE-08 — The update toast's own dismiss button also opens the download page (low, confidence high)

- **file:line** `static/js/updater.js:39-46` (primary `:43-45`), secondary
  `static/js/util.js:146-159` (`:152-155` the `×` handler, `:156` the button is
  a child of the box).
- **rule violated** — the toast's own contract: the `×` is documented in
  `util.js:146-159` as a dismissal control ("×" removes the box); the updater
  attaches its click handler to the whole box.
- **what is wrong** — `toast()` returns the box and appends the `×` button as
  its child; the `×` handler only calls `box.remove()` and does not stop
  propagation. A click on `×` bubbles to the box's handler (`updater.js:43-45`),
  which calls `window.open(SITE, "_blank")`, so dismissing the update notice
  opens `https://nightseam.de/#download` in the user's external browser. DOM
  removal during dispatch does not abort propagation.
- **trigger / reachability** — whenever a newer release is advertised by
  `ns-version.js` (`:38`) and the user clicks the toast's `×` instead of its
  body. Deterministic, not a race.
- **reproduction** (numbered chain)
  1. `:39-41` `toast(...)` → `util.js:147-158` builds `box` with a `span` and a
     `button.ghost` (`×`).
  2. `:42-45` the updater adds a click listener **on the box**.
  3. `util.js:154` the `×` listener is `() => box.remove()` (no
     `stopPropagation`).
  4. A click on `×` runs the button listener, then the event continues to the
     box → `window.open(SITE)`.
- **impact** — An unexpected external browser tab every time the notice is
  dismissed; no data loss, easily mistaken for intended behaviour.
- **falsifier** — Clicking `×` and seeing only the toast disappear
  (`stopPropagation` in `util.js:154`, or the updater binding its handler to
  the `span` only) disproves it.
- **history** — new.

### DE-09 — Preference toggles lose their re-derive when the settings POST fails (low, confidence high)

- **file:line** `static/js/header.js:75-81` (primary), secondary
  `static/js/setup.js:114-122`, `:123-131`, `:132-144`, `static/js/util.js:31-43`
  (`api()` toasts and rethrows).
- **rule violated** — general engineering standard (async error handling): an
  event handler that mutates state and then dispatches the change must still
  do so, or must unwind the mutation. Neighbouring handlers in the same files
  do catch (`header.js:15-17`, `:41-45`, `:69-73`, `:87-89`).
- **what is wrong** — `$("#moonAware")`'s change handler assigns
  `S.cfg.moon_aware` and then `await api("/api/settings", …)` **without a
  catch** before `document.dispatchEvent(new CustomEvent("prefs:changed"))`.
  When the POST fails, `api()` rethrows (`util.js:42`) and the dispatch at
  `:80` never runs, so the ranking is not re-derived even though the local cfg
  says it changed; the rejection is unhandled. The same shape appears in
  `setup.js:114-144` (size unit, rig select, filter checkboxes: the
  `renderTargets()`/`detail:changed` that follows is skipped).
- **trigger / reachability** — the settings POST fails for any reason (server
  restart/mid-request outage, 30 s timeout in `api()`), then toggle
  Moon-aware/units/rig/filters.
- **reproduction** (numbered chain)
  1. `header.js:75-76` the checkbox change sets `S.cfg.moon_aware`.
  2. `:77-79` `await api(...)` rejects → `util.js:39-42` toast + throw.
  3. The handler's promise rejects (no try/catch) → `:80` is never reached.
  4. `main.js:100-107` never runs → no `requestPrefsDerived()`, no
     `renderTonight/renderTargets/renderSky` → the visible scores keep the old
     ranking.
- **impact** — The toggle looks applied but nothing recomputes until another
  preference change or a reload; a console unhandled rejection. Narrow
  (requires the local server to fail).
- **falsifier** — If `api()` swallowed errors, or each handler wrapped the
  await in try/catch (like its siblings), the dispatch would still run.
- **history** — new.

### DE-10 — The loupe's crosshair marks the wrong point in the magnifier (low, confidence high)

- **file:line** `static/js/pano.js:494-517` (primary `:513-514`), secondary
  `:501-504` (`R = 66`, `Z = 3`, `sw = 2*R/Z*dpr`), `:512` (the sample is drawn
  into `lcv.width × lcv.height`), `static/index.html:392`
  (`id="loupeCv" width="140" height="140"`), `:92-104` (`Pano.lastPos` in CSS px
  via `evX/evY`).
- **rule violated** — the code's own contract comment (`:492-493`): "magnifier
  overlay: samples the composite panorama canvas" — a magnifier must indicate
  the sampled point.
- **what is wrong** — the sample is `sw = 44*dpr` device px wide and is drawn
  into a fixed 140 px backing store (nothing assigns `lcv.width/height` from
  `sw`), so the cursor's offset inside the sample maps to loupe pixels by
  `offset * lcv.width / sw = offset * 140/(44·dpr)`. The code uses
  `offset / Z` = `offset/3`, i.e. ~`9.5/dpr` times too small: with the cursor
  at the sample's centre (`offset = 22·dpr`) the correct marker is at ~70 px
  (the centre) but the code draws it at ~7·dpr px — the top-left corner.
- **trigger / reachability** — hover the panorama canvas with the brush or
  eraser tool (`:99-100`, loupe on by default) on any display.
- **reproduction** (numbered chain)
  1. `:94` `Pano.lastPos = {x: evX(e), y: evY(e)}` → CSS px.
  2. `:503-504` `sx = p.x*dpr - sw/2` (device px, `sw = 44*dpr`).
  3. `:512` the sample is scaled up to `140×140`.
  4. `:513-514` the marker uses `/3` instead of `140/sw` → ~10× too close to
     the origin; the correct expression is
     `(p.x*dpr - sx) * lcv.width / sw`.
- **impact** — The magnifier shows the neighbourhood but its white circle does
  not mark the sampled pixel, so precise brush placement is guesswork. Visual
  only.
- **falsifier** — If `lcv.width/height` were set to `sw` (1:1 sampling), `/Z`
  would be `1` and still not the mapping; if the marker is *intended* to mark
  an absolute canvas coordinate rather than the sample-relative one, the
  formula would be a different (also incorrect) one — a rendered check on a
  cursor moved to a known feature settles it.
- **history** — new.

### DE-11 — The chart hover "only redraw on change" test can never be true, so both charts fully redraw on every mousemove (low, confidence high)

- **file:line** `static/js/skyview.js:556-566` (primary `:566`), secondary
  `:244`/`:523` (`SKY_POINTS = pts` rebuilt per render), `static/js/skymap.js:173-182`
  (`:182`), `:10-11`/`:111` (`SM_POINTS`), `:26-30` (canvas reallocated per
  render).
- **rule violated** — the handlers' own intent (the identity comparison) and
  general performance standard: a mousemove handler must not rebuild the chart.
- **what is wrong** — `best` is an element of the **freshly rebuilt** point
  array (`skyview.js:523` / `skymap.js:111`), while `SKY_HOVER`/`SM_HOVER`
  always holds a point object from the *previous* render, so
  `best !== SKY_HOVER` is true on every mousemove even when the cursor stays on
  the same dot: `renderSky()`/`renderSkyMap()` run per event. `skymap` is the
  worse case because `renderSkyMap()` reassigns `cv.width/height` (`:28-30`),
  i.e. it reallocates and clears a ~2000×1000 canvas per mousemove.
- **trigger / reachability** — move the mouse across either chart (Sky View, Sky
  Map). Every user, every session.
- **reproduction** (numbered chain)
  1. `skymap.js:111` `SM_POINTS = pts` — new objects per render.
  2. `:177-181` `best` is found in `SM_POINTS`.
  3. `:182` `best !== SM_HOVER` → `SM_HOVER = best; renderSkyMap();`.
  4. `renderSkyMap()` re-enters `:111`, so the next event's `best` is a new
     object again → the branch always fires. Same at `skyview.js:523` vs `:566`.
  (The tooltip code itself compares by value — `skyview.js:462`, `skymap.js:185`
  — which is what the guard should do.)
- **impact** — Continuous full redraws (constellations, field stars, labels,
  and in the Sky Map a canvas reallocation) while hovering; jank on slower
  machines and in advanced mode, where the charts carry thousands of points.
  No wrong output.
- **falsifier** — A value comparison (id/name) or clearing the hover reference
  before the render would make the guard effective; if `renderSky*` reused the
  same point objects, the identity test would work.
- **history** — new (same root cause in two desktop modules → one finding).

### DE-12 — The two object-type legends never resync with the shared `S.disabledTypes` set (low, confidence high)

- **file:line** `static/js/skyview.js:127-139` (primary `:127-130`), secondary
  `static/js/skymap.js:229-240` (`:229-231`), `static/js/main.js:24-40` (tab
  activation only calls `renderSky`/`renderSkyMap`), `static/js/state.js:17`.
- **rule violated** — the legend's own contract comment (`skyview.js:116`:
  "click a chip to grey that type out"): the chip state shown must match the
  filter actually applied.
- **what is wrong** — each legend's `innerHTML` (including every chip's `off`
  class) is rendered exactly once inside `bindSky`/`bindSkyMap`; the only
  later update is `chip.classList.toggle("off", …)` on the chip that was
  clicked (`skyview.js:136`, `skymap.js:238`). Both charts filter by the
  shared `S.disabledTypes` (`skyview.js:466`, `skymap.js:65`), but the *other*
  chart's legend is not rebuilt when its tab is activated, so it claims a
  hidden type is shown.
- **trigger / reachability** — toggle a type off in the Sky View legend, then
  open the Sky Map tab (or the reverse).
- **reproduction** (numbered chain)
  1. `skyview.js:131-139` a chip click adds the type to `S.disabledTypes` and
     greys **that** chip.
  2. `main.js:33-36` switching tabs calls `renderSky()`/`renderSkyMap()` only.
  3. `skymap.js:229-231` was last executed at boot → its chip for that type is
     still "on", while `skymap.js:65` filters the type out.
- **impact** — A legend that contradicts the chart; the user must hunt for the
  missing type. Cosmetic, no data effect.
- **falsifier** — If either tab activation rebuilt the legend innerHTML from
  `S.disabledTypes`, the state would follow; if the two charts used separate
  disabled sets, each legend would be right.
- **history** — new.

### DE-13 — The library-edit dialog cannot be dismissed with Escape (low, confidence high)

- **file:line** `static/js/archive.js:436-455` (primary `:437-450`), secondary
  `static/js/detail.js:137-143` (the app's Escape convention), `static/js/weather.js:145`,
  `static/index.html:630` (`role="dialog"`).
- **rule violated** — named general standard: keyboard accessibility (WCAG 2.1.1
  keyboard / consistent dialog dismissal) plus the app's own established
  convention — every other dialog in the shell closes on Escape
  (`detail.js:138-142` closes `#detailModal` and `#sitesModal`,
  `weather.js:145` closes the weather panel); `grep -n "Escape" static/js/*.js`
  returns exactly those two sites.
- **what is wrong** — `bindArchive()` registers `click` handlers for
  `#libEditClose`, `#libEditCancel` and the backdrop (`:437-450`) but no
  `keydown` handler, and the shared focus trap (`util.js:197-217`) only
  implements Tab, so Escape does nothing while `#libEditModal` is open.
- **trigger / reachability** — Image Catalog → Library → **Edit** on an
  unresolved object → press Escape (keyboard users).
- **reproduction** (numbered chain)
  1. `archive.js:451` `saveEdit` and the three close paths are click-only.
  2. `detail.js:137-138` is the only Escape handler for modals — it does not
     mention `#libEditModal`.
  3. `util.js:200-216` handles Tab only → Escape is unhandled while the dialog
     holds focus.
- **impact** — Keyboard users must Tab to Cancel/×; the dialog also does not
  restore focus to the triggering row on close. No data effect.
- **falsifier** — If pressing Escape with the dialog open closed it (via the
  backdrop handler or any keydown), the finding is wrong.
- **history** — new.

### DE-14 — The detail image's "modal closed while fetching" guard cannot detect a close, so a blob is retained (low, confidence high)

- **file:line** `static/js/detail.js:42-53` (primary `:49-50`), secondary
  `:119-124`/`:129-133`/`:137-143` (the three close paths revoke but do not
  clear identity), `:20` (`S.currentId = id` is the only write),
  `static/js/state.js:12`.
- **rule violated** — the code's own contract comment (`detail.js:50`):
  "modal closed while fetching - never leak".
- **what is wrong** — the upgrade fetch (`:44-51`) revokes the new blob only
  when `S.currentId !== id`, but `S.currentId` is written only at `:20` and
  never cleared by any close path, so closing the modal mid-fetch leaves the
  condition true: the blob URL is assigned to `_imgUrl` and to the now-hidden
  `<img>` (`:49`) and is only released by the next `openDetail` (`:40`) or
  close (`:123`/`:131`/`:142`). The else branch is only ever reached by opening
  a *different* object.
- **trigger / reachability** — open an object and close the modal inside the
  ≤8 s upgrade window (`:43`), then do not open another object.
- **reproduction** (numbered chain)
  1. `:20` `S.currentId = id`; `:44` the background full-image fetch starts.
  2. The user closes the modal → `:123`/`:131`/`:142` revoke and hide, but
     `S.currentId` stays `id`.
  3. The fetch resolves → `:48-49` `S.currentId === id` → `_imgUrl = u;
     img.src = u` (the hidden `<img>` decodes the full image).
  4. Nothing releases it until the next open/close.
- **impact** — One blob URL plus a decoded full-size image retained for the
  session (bounded to one, because `:40` revokes the predecessor); no visible
  misbehaviour. The comment's guarantee is not implemented.
- **falsifier** — Any close path setting `S.currentId = null` (or a captured
  generation/`DETAIL` check) would take the else branch and revoke
  immediately.
- **history** — new.

### DE-15 — The worker allocates and fills a flat `ceil` array that is never sent (low, confidence high)

- **file:line** `static/js/planning_worker.js:151-153` (primary `:152`), `:170`
  (filled per sample), `:194-209` (`post` + `transfer` — `ceil` is absent),
  `static/js/planning_client.js:229-283` (`bindWorkerNight` recomputes the
  ceilings itself at `:256` from `res.az`).
- **rule violated** — general engineering standard (dead work / resource use):
  the module's own contract (`:6-8`) is to return "TRANSFERABLE flat tracks +
  packed derived fields" — `ceil` is neither.
- **what is wrong** — `const ceil = new Float64Array(total)` (`:152`) is
  filled for every sample (`:170`) and never read again: it is not part of the
  message (`:197-209`) nor of the transfer list (`:112-115` + `:196`), and the
  main thread derives every ceiling from `res.az` in `bindWorkerNight`
  (`planning_client.js:256`). The per-object `ceils` (`:165`, `:169` →
  `rec.ceil`) *are* needed (they are kept on the worker's retained
  `session.objects` for the `prefs` rescore), so only the flat array is dead.
- **trigger / reachability** — every worker night build, i.e. the normal
  desktop path; the cost scales with the catalog: in advanced mode
  (≈12 000 objects × 241 samples × 8 bytes) it is ≈23 MB allocated and ≈2.9 M
  writes per build, discarded immediately.
- **reproduction** (numbered chain)
  1. `:151-153` `total = list.length * GRID_N`; `ceil = new Float64Array(total)`.
  2. `:170` `ceil[base + i] = ceils[i]` for every sample.
  3. `:197-209` the posted object has `alt`, `az`, `derived`, `meta`,
     `ids`, `n`, `count` — no `ceil`; `:195-196` transfers `altFlat`, `azFlat`
     and the derived buffers only.
  4. `planning_client.js:231` destructures `{n, count, alt, az, derived, meta}`
     → `:256 ceils[i] = r1(ceilAt(az[base + i]))` (recomputed).
- **impact** — Wasted allocation/GC and CPU inside the worker (a transient
  memory spike; advanced mode only), no wrong behaviour. Cheap to remove.
- **falsifier** — A consumer of a flat `res.ceil` (or `ceil.buffer` in the
  transfer list) would make it live; `grep -n "res.ceil\|\.ceil\b" static/js`
  shows none.
- **history** — new.

---

## 4. Refutation log (claims raised and dropped, with the reason)

Per charter §3, unfounded claims are dropped rather than downgraded; they are
recorded here so a reader knows the question was asked.

1. **"The desktop Sky View drops the DPR on the zoom translation (HiDPI
   misalignment / wrong-object clicks)."** — **REFUTED.** `static/js/skyview.js:29`
   is `ctx.setTransform(dpr * m.a, 0, 0, dpr * m.d, dpr * m.e, dpr * m.f)` — all
   four components carry `dpr`, identical to the web twin. (The candidate came
   from a delegated sweep whose quote read `m.e, m.f`; the file does not say
   that. Verified with `read` and `grep -n setTransform static/js/skyview.js`.)
2. **`-99` (desktop out-of-FOV sentinel) vs `NO_BLOCK = -90`** — no behavioural
   consequence could be shown: the server only checks finiteness and every
   in-repo consumer compares with `> NO_BLOCK + 0.5` / `raw > 0.25`. Dropped.
3. **Desktop crop resets `paint_mode`/`block_above`** (server-side, hard-coded)
   — `AGENTS.md` scopes the deliberate desktop-crop divergence to
   strokes/profile/profile_top and no user harm could be demonstrated (the
   profile is wiped in the same step). Observation only.
4. **Crop vs in-flight auto-save ordering** — `applyCrop` (`pano.js:372-376`)
   ends in `select()`, which cancels the pending timer (DE-04's mechanism), so
   a stale PUT would have to be mid-flight; no reachable interleaving was
   constructed without a browser. Dropped (kept as an unknown in §6).
5. **`dragwin.js` double-attaching drag listeners via the body
   `MutationObserver`** — the observer watches `document.body` with
   `subtree: false` (`dragwin.js:73-88`) and nothing in the shell appends a
   direct body child in practice (only `main.js:187-190`'s boot-failure
   banner). Not reachable → not filed.
6. **Wizard 20 s guard lets a second concurrent `validate()` run** — needs a
   >20 s response from a local FastAPI server; not reachable in practice →
   not filed.
7. **Detail payload built from the date/site read at open time** — the modal's
   full-screen backdrop blocks the topbar while it is open, so a mid-build
   site/date change is unreachable → not filed.
8. **`#fMag` (Targets table) does not use the shared `magVisible` rule** while
   the Sky View does (`skyview.js:468`) — no `AGENTS.md` sentence covers the
   table's own filter, so no rule could be cited → Observation (§5), not a
   finding.
9. **The two contract verify commands that exit non-zero**
   (`node tests/js/astro_parity.mjs`, `node tests/js/worker_bridge.mjs`) — not
   product defects; they are harness-invocation metadata, explained in §1.3.

---

## 5. Observations (unranked; no severity, must not be ranked by t8)

- `static/js/planning_worker.js:215` — `if (m.gen < latestPrefsGen) return;` is
  unreachable: `latestPrefsGen` is assigned `m.gen` in the `onmessage` handler
  (`:45`) before `runPrefs` is called, and `runPrefs` has no `await` before the
  check, so it can never be superseded. Harmless (and `latestPrefsGen` has no
  other use), but the guard suggests a cancellation contract that does not
  exist.
- Dead code / stale comments after Phase C: `static/js/astro.js:1-4` still says
  it is "JS port of app/astro.py … used to synthesize altitude tracks for the
  ~12k advanced-catalog objects" (the module only re-exports core), and its
  `D2R`/`R2D`/`J2000` constants (`:17-19`) are unused;
  `planning_client.js:439`'s comment references `synthesizeAdvancedTracks`,
  which no longer exists (`grep` = 1 match, the comment itself);
  `header.js:159` says "nightcalc sends null dusk/dawn", but
  `app/nightcalc.py` was deleted and `pickDarkWindow` always returns a window
  (so the `!N.dusk` guard at `:162` is dead).
- `await loadNight()` is awaited in `pano.js:303`, `:314` and `wizard.js:73`,
  but `loadNight()` (`night.js:26`) returns `scheduleLoadNight(0)`'s `undefined`
  — the call is deferred, the `await` waits for nothing. Harmless today (no
  following statement depends on the payload), misleading for the next editor.
- `window.__NS_WORKER_FORCE_FAIL` (`planning_client.js:48`) is read but defined
  nowhere in the repo and undocumented in `AGENTS.md` (which names only
  `__NS_DEBUG_WORKER` + KILL/REVIVE). Inert unless set by hand.
- `wizard.js:206-208` `restoreForm` writes `el.value = v` for every saved
  field, but `saveForm` (`:198`) stores `el.checked` for checkboxes. No wizard
  step contains a checkbox today, so it is latent, not reachable.
- The desktop `#skyMag` limit (`setup.js:288-291`, `skyview.js:452-468`) follows
  the shared `magVisible` rule, but the Targets table's own `#fMag` filter
  (`targets.js:72-73`) does not (a no-magnitude object passes there but is
  hidden on the chart at the same numeric limit). No invariant covers the
  table filter, so this is recorded as a consistency question for the owner,
  not a finding.
- `tests/browser/desktop_suite.py:95-108` calls `__NS_REVIVE_WORKER()` but never
  asserts the worker path is used again; DS5's recovery contract is therefore
  ungated (part of the DS5 row above).

---

## 6. Residual risk / unknowns

- The desktop end-to-end gate could not run here (§1.2); everything in this
  lane is code-level plus the Node engines. A rendered check of the pano mask
  switch (DE-02), the loupe marker (DE-10) and the chart-hover cost (DE-11)
  would firm up their *magnitude* (the mechanisms are code-evident).
- DE-03's severity depends on whether the desktop's mode toggle is considered a
  deliberate "clear" affordance; the web lane (t4) should confirm the web twin
  keeps the profile (`web/horizon.js`) — if it also blanks, this becomes a
  shared `XL` item instead of a desktop finding.
- DE-04/DE-05 are the same data-loss class via different mechanisms; a fix
  should be one flush-and-own-the-record change, not two patches.
- Not exercised: the desktop browser gate, `bench_desktop_compute.mjs`, real
  WebView2 behaviour (worker crash frequency, DPR handling on real displays).

---

## 7. Attestation (read-only)

`git status --porcelain` at the end of this lane's work (expected: `?? .agent-teams/`
plus `?? reviews/`, i.e. no tracked file changed):

```text
$ git status --porcelain
?? .agent-teams/
?? reviews/
```

Evidence artifacts written by this lane (all inside the review directory):
`reviews/0.6.24/evidence/t5-grid-probe.mjs` (19/19 assertions held),
`reviews/0.6.24/evidence/t5-ds5-revive.mjs` (DS5 reproduction held),
`reviews/0.6.24/evidence/t5-engines.txt` (engine output capture).
No production file, test, data file, tag, build or deploy was touched.

## 8. Digest

- Findings: **15** — 3 medium (DE-01, DE-02, DE-03), 12 low.
- Carry-over: **DS4 CLOSED** (proof: `max_alt` identical on 240 real tracks;
  `max_i` tie index is a dead field), **DS5 STILL OPEN** (dev-hook-only;
  reproduced by `t5-ds5-revive.mjs`).
- Top 3: **DE-01** (a newly added custom target is missing from Targets/
  Tonight/Sky until a reload), **DE-03** (a stroke-less imported horizon is
  destroyed by one paint-mode click, contradicting the "clearMask is the ONE
  place" invariant), **DE-02** (the panorama editor shows the previous
  panorama's mask after a switch).
- Guard/engine evidence: `check_js.py` exit 0; `night_race`, `derive_window`,
  `scrub_degenerate`, `worker_lifecycle`, `sync_cache_key`, `sky_band`,
  `pano_geom`, `dom_handlers` all exit 0; `tests/test_ui_invariants.py` 26
  passed; `tests/test_js_parity.py tests/test_js_behaviour.py tests/test_core_fixtures.py`
  55 passed; `check_browser.py --desktop` blocked by the sandbox (not a
  finding).
