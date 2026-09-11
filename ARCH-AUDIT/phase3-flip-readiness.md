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
