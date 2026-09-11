# Phase 3 - flip readiness (pre-flip gate)

Baseline: **v0.6.17 = `13300f3`** (deployed). No authority change was made.
Method: real packaged exe (`dist\NightSeam.exe`, Edge WebView2 152) driven via
CDP (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`),
plus a frozen-server shadow comparison over the fixture matrix. Python remains
the oracle/authority.

## 1. Real WebView2 benchmark (packaged exe, 197 curated / 11,917 advanced)

Night grid: Berlin 2026-01-15, 24 h at 6 min (241 samples). `nightStats`
computes per-sample alt/az + visibility + score (the unbatched path the UI would
use); the batched path precesses once per object and computes sidereal time once
per sample (`altazFrame`/`altazFrameApply`).

| Path | Objects | cold | warm | project bound |
|---|---|---|---|---|
| standard unbatched | 197 | **30.2 ms** | 23.4 ms | <600 ms - PASS |
| advanced unbatched | 11,917 | **1432.8 ms** | 1445.4 ms | <1000 ms - **FAIL** |
| standard batched | 197 | 8.4 ms | - | PASS |
| advanced batched | 11,917 | **399.2 ms** | - | <1000 ms - PASS |

Memory (`performance.memory`, Chromium): start 113.0 MB, peak 116.9 MB, end
116.2 MB - i.e. ~+4 MB working set; `nightStats` returns scalars only and
retains no track arrays, so no leak/growth.

**Which path the desktop uses:** advanced synthesis already uses the BATCHED
`altazFrame`/`altazFrameApply` path (`static/js/derive.js::synthesizeAdvancedTracks`).
The unbatched `nightStats` scoring loop is the only >1 s workload; Node
under-reported it (~1.0 s) vs the real host (1.43 s), so the real-host number is
the authoritative one.

## 2. Shadow comparison (server vs core, no user-visible change)

Frozen server payloads (`app.nightcalc.compute_night`, 241-sample full-day grid,
curated 197 objects) over the matrix: Berlin winter, **Tromso summer (polar
day)**, Sydney summer, **Berlin DST transition**; obstacle profile (wall to 20
deg over az 0-90) and sky profile (band 10-40 over az 90-270 with `profile_top`)
exercised. Core recomputes alt/az/ceil/ceilTop from the same inputs.

| Case | Samples | max dAlt | max dAz | max dCeil | max dCeilTop | over tolerance |
|---|---|---|---|---|---|---|
| berlin-winter | 47,477 | 0.05 | 0.05 | 0 | 0 | no |
| tromso-summer | 47,477 | 0.05 | 0.05 | 0 | 0 | no |
| sydney-summer | 47,477 | 0.05 | 0.05 | 0 | 0 | no |
| berlin-dst | 47,477 | 0.05 | 0.05 | 0 | 0 | no |

**189,908 samples, 0 divergences beyond tolerance** (0.051 = the server's 0.1
deg rounding). `ceil` is exact; `ceilTop` is compared on visible band columns;
on fully blocked sky columns the server ships the raw `-90` sentinel while core
reports `null` - both mean "already blocked below", counted separately
(0 mismatches in this matrix). Advanced objects ship NO server tracks by design,
so their batched synthesis path is covered by internal batched-vs-unbatched
equality (no server counterpart to shadow).

Temporary Python<->core parity tests remain in place (not retired).

## 3. Remaining Python surface

`app/astro.py`, `app/planning.py`, `app/nightcalc.py` (tracks, sun/moon, grids,
sleep between them), catalogue/DB/FITS/IO adapters, release tooling. Python is
still the sole producer of `/api/night` and `/api/object` tracks.

## 4. Rollback plan for a flip (not executed)

- Flip behind a setting/flag (`planning_client_compute`), default OFF.
- Land the flip in its own release; rollback = reinstall the previous tag's exe
  (0.6.17) - data schema unchanged, no migration.
- Keep Python's `/api/night` for one release as the fallback path.

## 5. Go / no-go

**NO-GO as-is.** The standard path passes, the shadow is clean, and the batched
advanced path fits the budget - but the unbatched advanced scoring loop in the
real host is **1.43 s vs the <1.0 s bound**, so a flip today would regress the
advanced planning experience.

**Precondition to a future GO:** add a batched scoring loop (compute alt/az via
`altazFrame` once per object/sample, then score) - the batched tracks alone are
399 ms, so the combined path should fit - and re-run the real-host benchmark.
Recommendation until then: keep Python authoritative with the oracle fixtures.

---

## Phase 3b addendum - batched scoring (owner-authorized) - **GO**

Owner authorized the batched semantics (precess once per object at the night
midpoint + one sidereal frame per site/night - the desktop's existing advanced
synthesis semantics). Implemented as `core/scoring.js::nightStatsBatch`
(single-object `nightStats` delegates to it; one implementation). The profile
first showed the safe plan cannot fit: 93% of the old loop was `altaz`, and
only `gmst` + angle sharing (~<40% of it) was bit-identical - the safe ceiling
was ~1.2-1.3 s.

Real packed-exe WebView2 (Edge 152), full **11,917 advanced objects x 241
samples, complete coverage**:

| CPU | cold | warm | vis sum | heap peak |
|---|---|---|---|---|
| 1x | **454.4 ms** | 446.9 ms | 883,773 | 128.5 MB |
| 4x throttle | 2003.6 ms | 2151.9 ms | 883,773 | 145.4 MB |
| 6x throttle | 3455.9 ms | 3185.5 ms | 883,773 | 141.0 MB |

Bound: <1000 ms advanced at full CPU - **PASS with ~2.2x headroom**; the
throttled numbers are linear and informational. Peak heap during the batch is
~+30 MB (the 11,917 result objects), released after the call; no growth across
runs.

Parity vs the pre-change goldens (`tests/js/scoring_parity.mjs` +
`tests/fixtures/scoring_goldens.json`, mutation-tested in
`tests/test_scoring_parity.py`): every displayed field (visN, blocked,
bestRun/bestStart, pct, blockedPct) and the transit index **bit-identical** on
697 objects x 2 cases (obstacle + moon-aware); `maxAlt` drift <= 5.6e-6 deg,
`sClassic`/`sMoon` <= 1.1e-5 (the authorized precess-once delta; **release
note**). Shadow comparison re-run: still 0 divergences over 189,908 samples.

**Decision: GO** for the authority flip, under this plan:

1. Flip behind a setting/flag (`planning_client_compute`), default OFF; the
   server keeps producing `/api/night` for one release as the fallback.
2. Presentation rounding preserved: `pct`/`blockedPct` are already rounded;
   the desktop rounds `alt`/`ceil` to 0.1 for display exactly as the server
   payload does; score doubles feed ranking only (drift <=1.1e-5, no displayed
   change shown by the parity harness).
3. Keep the Python<->core parity fixtures through the first flipped release;
   retire them only after a full release with no divergence reports.
4. Incremental Python deletion after the flip: payload track computation first
   (nightcalc object tracks), then sun/moon/twilight helpers once nothing reads
   `/api/night`; `app/astro.py`/`planning.py` stay until then.
5. Rollback tag: `v0.6.17` (last server-authoritative release); rollback =
   reinstall its exe/ZIP, data schema unchanged.

## Owner sign-off - Step 4 result cache skipped (full-CPU-only acceptance)

The owner accepted the full-CPU-only result: no per-object result cache keyed
on (site, night, prefs hash) is required for the flip. Basis: the batched engine
measures **454 ms cold / 447 ms warm for all 11,917 advanced objects** at full
CPU (<1000 ms bound, ~2.2x headroom; 4x/6x throttle linear and informational),
with all displayed values bit-identical to the pre-batch implementation. The
cache remains an optional UI hot-path follow-up (renders/scrubs/catalog column)
and carries no acceptance requirement. No behavior change.

---

## Pre-ship interactive hot-path check (real packed exe)

Host: dev build `0.6.17-6-gb3fcdcd` (carries the batched engine), Edge WebView2
via CDP, active site "Backyard", real `/api/night` grid (241 samples, 6 min),
no obstruction profile, real catalogs. Simulates what the flipped client would
do on each user action.

| Action (simulated) | standard (197) | advanced (11,917) |
|---|---|---|
| date/site change: fresh frame + full rescore | 9 ms | **~0.50 s** |
| pref change (min-alt): full rescore | 10 ms | **~0.53 s** |
| 4x CPU: date/site change | 27 ms | 2.2 s |
| 4x CPU: pref change | 41 ms | 2.1 s |
| 6x CPU: date/site change | 53 ms | 3.1 s |
| 6x CPU: pref change | 58 ms | 3.3 s |

Heap 114.8 -> 118.5 MB across the runs; no growth. (The first advanced date/site
run passes no min-alt so it skips scoring; its true cost equals the pref-change
run, ~0.5 s.)

**Scrub does NOT trigger a rescore**: scoring is keyed to (site, night, prefs),
never to the selected time (`S.tIdx`); changing the instant only re-renders.

### Finding (guardrail STOP)

In advanced mode a common action - date change, site change, **and min-alt/Bortle
preference change** - triggers a full synchronous ~0.5 s rescore of all 11,917
objects (~2.1 s at 4x, ~3.1 s at 6x CPU). The Step-4 cache would not remove this
(those actions invalidate it); the options are to accept the cost (debounce +
busy indication), split track computation from scoring so preference changes
re-derive scores only, and/or move the batch off the UI thread. Per the
guardrail this is the "common action triggers a full rescore" STOP: **do not
ship the flip until the owner chooses.**

### Semantics-delta / release-note wording (for confirmation)

"Planning is now computed on your machine with the same engine as the web
planner. Visibility and scores are unchanged; behind the scenes the sky position
is precessed once per night instead of at every sample, which shifts ranking
scores by less than a hundred-thousandth of a point and changes no displayed
value. The desktop server remains as an automatic fallback."

### Split result (`d564fcc`) - guardrail round 1, real packed host

Track computation is now separate from scoring
(`core/scoring.js::computeNightTracks` / `scoreNightTracks`; `nightStatsBatch`
composes them, bit-identical - pinned by `tests/js/scoring_parity.mjs` including
the split path). Tracks are keyed to (site, night, catalog, horizon profile);
preference changes (min-alt, Bortle, moonAware, filters, mag cap) rescore only.

| Action | standard (197) | advanced (11,917) |
|---|---|---|
| tracks (site/night/catalog/profile change) | 8.3 ms | 460.8 ms |
| preference change (rescore only) | 0.9 ms | **33 ms** |
| 4x CPU: preference change | 7.4 ms | 133.9 ms |
| 6x CPU: preference change | 3.9 ms | 199.5 ms |
| 4x CPU: tracks | 48.4 ms | 2051.9 ms |
| 6x CPU: tracks | 56.4 ms | 3381.5 ms |

Preference changes are now effectively instant in advanced mode (~33 ms vs the
~530 ms full rescore measured before). Date/site or catalog/profile changes
still recompute tracks (~0.46 s at 1x); the flip UI must paint a busy frame
before the synchronous compute and debounce/cancel superseded changes, and the
filed follow-up release carries an async (worker or time-sliced, cancellable)
compute before Phase C. Parity: `tests/test_scoring_parity.py` 2 passed.
