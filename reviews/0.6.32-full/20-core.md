# Core lane - shared domain logic (core/)

Subject: `v0.6.32-3-g3277846` (HEAD 3277846), tree clean apart from
`REVIEW-PROMPT.md` + `reviews/0.6.32-full/` (re-checked at the end).

## What I checked (and how)

Full read of `core/astro.js`, `planning.js`, `visibility.js`, `time.js`,
`format.js`, `index.js`; partial read of `horizon.js`. Executed:
`reference_anchors.mjs` (19/19, exit 0, read every check to separate published
values from self-consistency); `precess_{order,adjudicate,crosscheck}.mjs`
(literal 3x3 `R3(z)·R2(-theta)·R3(-zeta)` chain vs the code **and** vs the
analytic Meeus eq.21.4); `astro_edge.mjs` (az range over 8 lat x 5 dec x 5 RA x 3
epochs, poles, Svalbard, Tromso 2026-01-15, years 1..9999, NaN/Inf,
`scrubWindowMs`); `visibility_agree.mjs` (8800 combinations); `astro_edge`/
`moonphase_probe.mjs` (400 days of `web/astro.js::moonPhase`); grepped every
`times_iso[...]` use and read `longestRunJS`/`windowEndISO`; `check_core.py` read
+ `guard_holes_probe.py` (scratch tree) + `guard_predicate_probe.py` (its own
regexes); stub tokens vs `core.manifest.json` and a grep for a second copy of
core math. Guards: `check_core.py` OK, `check_js.py` OK,
`pytest tests/test_reference_anchors.py tests/test_core_drift.py -q` -> 17
passed. Delegated with independent digests (their probes re-run by me):
`core/horizon.js` + `core/format.js`; `core/scoring.js` + `core/catalog.js`.

## Findings

### CO-01 medium CONFIRMED - `check_core.py` never reads a `.html` or a non-`.js` file, so an inline `<script>` re-implementation passes the moved-concept guard
- `scripts/check_core.py:130` (`shell_sources` = `base.rglob("*.js")`), `:204-229`
- impact: the guard meant to make `core/` the ONLY astronomy implementation
  cannot see a file type both shells ship - math pasted into `web/index.html`'s
  or `static/index.html`'s inline `<script>` still reports `check_core: OK`.
- mechanism: `*.js` only, while `web/index.html:8` and `static/index.html:8`
  carry a live inline `<script>`.
- evidence: `guard_predicate_probe.py` -> `NOT SCANNED index.html`,
  `NOT SCANNED helper.mjs`, `NOT SCANNED lib.txt`, but `SCANNED app.js`;
  `guard_holes_probe.py` (scratch copy, real tree untouched) -> same mutation
  `CAUGHT` in `web/app.js`, `*** NOT CAUGHT ***` in `web/index.html`.
- repro: append `<script type="module">function julianDay(d){return 2451545.0}</script>`
  to `web/index.html`; `python scripts/check_core.py` -> still `OK`.
- requiredFix: scan `.js` + `.mjs` + `.html`, and for `.html` only the
  `<script>` bodies (the MOVED patterns are substring regexes, so a whole-file
  scan would fire on prose).
- counterArgument: the guard never claimed to read HTML and a committer editing
  `core/` has no reason to paste math into a page - lower likelihood, same hole;
  the check's contract is "a moved concept cannot be re-implemented outside `core/`".

### CO-02 medium CONFIRMED - the MOVED-concept regex misses object-shorthand methods and getters
- `scripts/check_core.py:222-227` (the `sneak` alternation)
- impact: `const H = { julianDay(dt) { ... } };` or `{ get gmstDeg() {...} }` in
  a shell is a working re-implementation the guard reports clean.
- mechanism: the method form `(?:^|[;}\n])\s*name\s*\([^)]*\)\s*\{` allows `;`,
  `}` and newline before the name but not `,` or `{` - exactly what precedes an
  object-literal method; a getter has `get ` before the name.
- evidence: `guard_predicate_probe.py` -> `NOT CAUGHT method (property after
  comma)`, `NOT CAUGHT method (property after brace)`, `NOT CAUGHT getter
  accessor`, while the four shapes pinned by `tests/test_core_drift.py:158-164`
  are `CAUGHT`.
- repro: append `const H = { profileSegments(a) { return []; } };` to
  `web/horizon.js`; `python scripts/check_core.py` -> `OK`.
- requiredFix: add `,` and `{` to the method-form leading class and accept an
  optional `get `/`set `/`async `/`*` prefix.
- counterArgument: TS3 (0.6.24) already hardened this once and the current forms
  cover how a human normally writes a helper; medium because it is a guard, not
  a user path.

### CO-03 low CONFIRMED - the core purity guard cannot see dynamic code loading
- `scripts/check_core.py:77-81` (`FORBIDDEN`)
- impact: `core/` is contractually "no DOM, storage, network", but
  `await import('data:text/javascript,...')`, `new Function(...)`, `eval(...)`
  and `importScripts(...)` inside `core/` pass all six purity patterns.
- mechanism: the patterns name *capabilities* (`document.`, `window.`, `fetch(`,
  ...) but never a *loader*; a `data:`-URL import is a code-injection path with
  no identifier the guard knows.
- evidence: `guard_predicate_probe.py` section 3 -> `NOT CAUGHT "eval('1+1')"`,
  `NOT CAUGHT "new Function(...)"`, `NOT CAUGHT "importScripts('x.js')"`,
  `NOT CAUGHT "await import('data:text/javascript,...')"`.
- repro: add `const x = eval('1+1');` to `core/format.js` - the hash/re-bake
  guard fires, the purity list does not. requiredFix: add `\beval\s*\(`,
  `\bnew\s+Function\b`, `\bimportScripts\s*\(`, `\bimport\s*\(` to `FORBIDDEN`.
- counterArgument: a future core module might legitimately need a dynamic import
  and `eval` in a pure math module is implausible - robustness, hence low.

### CO-04 low SUSPECTED - `altaz()` can return `az === 360`, outside its documented `[0,360)` range
- `core/astro.js:127-128`: `let az = (Math.atan2(east, north) * R2D) % 360; if (az < 0) az += 360;`
- impact: 360 instead of 0 breaks the range contract for a function every chart
  and profile lookup consumes. No consumer I found uses az as a key without
  re-normalizing (`planning_client.js:162`, `skyview.js:279`), so no
  user-visible defect could be shown.
- mechanism: for `east = -0` and `north < 0`, `atan2` returns `-PI`; IEEE-754
  rounds `-PI*R2D` to exactly `-180`, `-180 % 360` to exactly `-360`, so
  `+= 360` gives `+360`. The double modulo in `gmstDeg`/`altazFrame` avoids this.
- evidence: `astro_edge.mjs` reported 8 of ~2000 combinations with `az: 360`
  (`{lat:-66.5, dec:90, ra:180, jd:2451545}`; `{lat:0, dec:90, ra:180}` - the
  pole, where `east = -0`). NOT reproducible deterministically afterwards:
  `az360_probe.mjs` scanned 3,110,400 combinations and found 0.
- repro: `node reviews/0.6.32-full/evidence/core/astro_edge.mjs` -> `azRange_bad`.
  requiredFix: `((Math.atan2(east, north) * R2D) % 360 + 360) % 360`, also at
  `core/astro.js:160`.
- counterArgument: every caller normalizes and 360 == 0 astronomically, so this
  is a contract/robustness defect, never a wrong number - hence low + SUSPECTED.

### CO-05 low CONFIRMED - `moonAge()`'s docstring says "age in days" but the function is a folded 0..14.76 value
- `core/astro.js:252-253`; consumers `static/js/derive.js:165`
  (`// 0-14.76 (folded)`), `core/scoring.js:27-30` (`moonAgeDays` "folded age")
- impact: the unsigned elongation loses waxing/waning, so a 23-day waning moon
  reports ~7.7. Every current consumer is built for the folded value, but
  `core/astro.js` - the file a future consumer reads - never says "folded".
  mechanism: `return SYNODIC_MONTH * psi / (2 * Math.PI);` with `psi` the
  unsigned elongation (`acos`), range `[0, SYNODIC/2]`.
- evidence: new 2026-08-12 17:37 `age 0.113`; first quarter `7.28`; full
  2026-08-28 04:18 `14.69`; **last quarter 2026-09-04 `7.73`** (true age ~22.8 d).
  `reference_anchors.mjs:322/325` sample only new and full, where they coincide.
- repro: `node -e "import('./core/index.js').then(C=>console.log(C.moonAge(C.julianDay(new Date('2026-09-04T00:00:00Z')))))"` -> `7.7284`.
  requiredFix: say so in the docstring ("folded to one half-cycle;
  waxing/waning not represented") - no behaviour change.
- counterArgument (strongest; it nearly refuted this): the pipeline is
  internally consistent - `core/scoring.js:27` and `derive.js:165` both say
  "folded" and both engines fold identically - so this is a misleading core
  docstring, not a wrong value.

### CO-06 low CONFIRMED - the "rotation order" is pinned by no test, and the Meeus anchor is not an independent transcription
- `tests/js/reference_anchors.mjs:69-82` (`meeusPrecess`), `:97-108`
  (`iau2006Precess`), `:139-149` (`precession_round_trip`); claim in `AGENTS.md`
  ("eq.21.4 with the middle rotation about **Y**")
- impact: the suite cannot distinguish the documented Z-Y-Z composition from any
  composition landing within 2 arcsec, so a future edit that blends the rotations
  (the old X-axis bug's shape) stays green. Two of the 19 checks are
  self-consistency identities by construction.
- mechanism: `atan2(A,B) + z` is the standard reduction *equation* and equals the
  honest matrix product; the anchor re-derives that equation instead of composing
  the three rotations, so code and anchor share one reading. `precessDateToJ2000`
  negates the same angles with the same structure, so the round trip closes by
  construction (< 0.005 arcsec measured) whatever the order is.
- evidence: `precess_order.mjs` -> `coreMinusAnchor_as = 0` and
  `coreMinusMatrix_as = 0` at every point; `precess_adjudicate.mjs` -> the correct
  chain scores `matrix_vs_analytic_arcsec: 0`, the swapped order 20-1600 arcsec.
- repro: `node reviews/0.6.32-full/evidence/core/precess_adjudicate.mjs`.
  requiredFix: no behaviour change - scope the `AGENTS.md` claim, or add one check
  that composes the three matrices and compares at ~1e-5 deg.
- counterArgument: the Meeus/IAU comparisons *do* pin the result to 2 arcsec over
  1900-2100 at 6 points incl. the pole and the seam, and sign errors in
  zeta/theta/z are caught (my sweep moves 404-1112 arcsec).

### CO-07 medium CONFIRMED - the two shells compute "% of night" on differently PHASED 6-min grids with different denominators
- `core/scoring.js:180-181` (`pct: Math.round(100 * visN / (n + 1))`), web anchor
  `web/app.js:165` (`jd0: E.julianDay(w.dusk)`), desktop grid
  `static/js/planning_client.js:22` (`GRID_N = 241`, noon->noon) +
  `static/js/derive.js:160,201` (`nightN = i1 - i0 + 1`)
- impact: the same object on the same night shows a different `% of night` on the
  web than on the desktop for 20-66 of the 200 standard rows (up to 4 pp). Since
  0.6.30 the web's Min-visibility gate (`web/app.js:1361`, default 1%) keys on the
  WEB number, so the shells can also disagree about list membership.
- mechanism: core derives its count from the span (`n = round((jd1-jd0)/step)`)
  then divides by `n + 1`; the desktop counts the samples its noon-anchored grid
  places inside `[dusk,dawn]` and divides by that. `sunCrossings` interpolates
  dusk/dawn between 10-min scan samples, so dusk is off the 6-min grid (Berlin
  2026-09-22: `dusk-noon mod 6 min = 1.612`) - different instants AND an
  off-by-one denominator (79 vs 80).
- evidence: `probe_desktop_real.mjs` (drives the real `state.js` +
  `derive.js::recomputeNightDerived` and the real core path) -> `Berlin
  2026-09-22: nightN=79 webGrid=80 differing=43/200 maxDiff=2pp`; `2026-06-21:
  27 vs 28, differing=20/200, maxDiff=4pp`; `Tenerife: 107 vs 108, 66/200`.
  Replicated by `probe_window_parity.mjs` (same 43/20/66). I read both anchor
  lines myself and re-ran `derive_window.mjs` (passes - it compares grid-aligned
  `times[10]`/`times[29]`, so it is blind to the phase).
- repro: `node reviews/0.6.32-full/evidence/core/probe_desktop_real.mjs`.
- requiredFix: snap the web's scoring window to whole noon-grid steps (first
  sample >= dusk .. last <= dawn) so both shells count the same instants, or pass
  core an explicit sample range.
- counterArgument: both numbers estimate the same window, a one-sample phase
  shift is arguably sampling noise, and no test claims numeric equality (the
  241-sample noon grid is pinned by the `scrubgrid` engine, so "fixing" the web
  redefines its window). Medium, not high: neither number is wrong, only
  inconsistent - but `AGENTS.md` does claim "the web scores the same window as
  the desktop on a 6-min grid", and the gate is now user-visible.

**Scoring/catalogue delegate digest** (their probes; I confirmed CO-07 by reading
the code and re-running their engine, but did not re-derive these two):
- `core/catalog.js:36-40` + `web/build_web.py:31-34` (low CONFIRMED):
  `searchBlob` never indexes the row's `search` column and the payload does not
  ship it, so 25 rows are findable on the desktop but not the web by common name
  (`"tarantula" ["ngc2070"] vs []`, `"coathanger" ["cl399"]`, `"silver coin"
  ["ngc253"]`). Fix: add `search` to `build_web.py::COLS` (+ `CATALOG_TOKEN`
  bump) and to `searchBlob`. Counter: likely the mirror of the already-filed
  desktop-side `CD-02` - merge, do not double-file.
- `core/catalog.js:10-25`, `core/scoring.js:15-19,29`, `static/js/skymap.js:204`
  (low CONFIRMED): plain object literals, so a crafted `otype` of `"toString"`
  returns an inherited `Object.prototype` member and defeats every `X[t] ||
  fallback` - the type cell renders native function source and the moon-aware
  score becomes `NaN`. Only a crafted setup ZIP reaches it
  (`app/database.py:986` stores `otype` verbatim). Fix:
  `Object.assign(Object.create(null), {...})` / `Object.hasOwn` + a
  `|| "unknown"` at `skymap.js:204`. Counter: every in-app producer clamps
  `otype`; worst case is garbled text plus a never-rendered NaN ranking key -
  calibrate upward if setup bundles are treated as untrusted (they are).
- Refuted by them: the scoring curves cannot drift (both shells only re-export
  core), so `scoring_parity.mjs` compares core with itself and covers only
  batched-vs-split identity plus frozen display fields on a `pano=null` grid;
  they separately verified the inlined ceiling against `ceilFor` (3672 combos, 0
  mismatches). Tier edges exact, order-independent, F for zero/NaN popularity,
  mode-independent on the real payload (0/200). `wikiTitles` non-empty and
  duplicate-free on all 12,176 rows (its Messier digit-scavenge would turn a
  synthetic `"M31/110"` into "Messier 31110", but every shipped value matches
  `^M\d+$`). `moonMinDist(_, undefined)` and an inverted window (`n=2, pct=100`)
  are unreachable through shipped callers. Cross-lane note for the web lane:
  `web/app.js:869-870` keeps no-magnitude rows for the standard catalogue but
  drops them for `_adv` rows, so such an object never reaches the sky chart even
  at the slider maximum, while `AGENTS.md` says the rule "filters EVERY object".

## Refuted (claims I checked that are NOT bugs)

1. **"the composition order is wrong"** - my first matrix chain
   (`R3(z)·R2(-θ)·R3(-ζ)`, from Meeus p.134) was 1200 arcsec from the code at
   J2026 and I nearly filed it; with Meeus' sign convention (`ζ=-ζ_A`, `z=-z_A`,
   `θ=+θ_A`) the three-rotation product equals `atan2(A,B)+z` to 0.00 arcsec. The
   code is faithful - CO-06 covers only test independence.
2. **`moonAge` mixes degrees and radians**: `S*psi_rad/(2π)` == `S*psi_deg/360`.
   The elongation identity also pins the synodic constant against the published
   29.530588853 to 2e-6 d, so it is not purely tautological.
3. **`sunAlt`/`altaz` frame mixing** (RA/Dec come back equinox-of-date, `altaz`
   precesses again): ~5.4 arcsec for the Sun over 26 yr, far below Meeus ch.25
   accuracy. **Meeus vs IAU 2006 differing by up to 1117 arcsec at 2050**: the
   model difference the suite deliberately tolerates at 2 arcsec.
4. **`moonPhase`** (400 days, 0 direction/label mismatches) and **the visibility
   predicates disagreeing** (8800 combinations, only `alt` exactly 0 with
   `minAlt <= 0` and no ceiling).
5. **`core/format.js`**: `magVisible` boundaries; zoom round trip exact (worst
   2.3e-13 px); `framePct` null for null/0/NaN/FOV<=0. **`scrubWindowMs`**: 6
   adversarial shapes incl. an inverted pair, equal dusk/dawn and `null` -
   `startMs < endMs` always.
6. **Half-open window**: the only `times_iso[...]` uses that could be a run
   boundary are `header.js:179` and `skyview.js:173`, both `S.tIdx`-indexed;
   every clear-window end goes through `windowEndISO`; `longestRunJS` exists once.
   `static/js/astro.js` keeps unused `D2R`/`R2D`/`J2000` - dead constants.
7. **No second copy of core math**: grepping the core constants
   (`280.46061837`, `2451545`, `2306.2181`, `2004.3109`, `29.5305`, the Bennett
   coefficients) hits only `core/` and the baked trees.
8. **Stub/bake consistency**: both stubs point at
   `./core/5a2be0d49adba32e/index.js`, the manifest hash matches, the N-1 dir
   `ddf8707d7cc90697` is retained on both sides, all 9 web importers carry
   `?v=24` = the manifest token.
9. **`core/horizon.js` complement contract for well-formed records** (delegate,
   4010 fuzz cases). My own cross-check mis-parsed `visibleSkyBands`'
   `{vis, blocked}` shape and printed garbage before I fixed it - those earlier
   numbers are an artifact of my harness, not a finding.

## Not checked (honest coverage gaps)

- **No browser rendering of anything.** CO-01..CO-07 are code/probe findings; the
  polar chart's rendered geometry and the web crop's *rendered* result are
  unverified. I did not run `check_browser.py`; the full pytest suite is the
  captain's.
- **`core/horizon.js` (544 L) read only in parts**; its deep audit was delegated.
  I *did* reproduce the delegate's medium (a crop re-rasterizes scaled strokes at
  the original brush radius, so an aggressively cropped band grows unpainted
  columns): `probe_moneyshot.mjs` -> `lost 11 of 91 in-frame bins; first hole az
  52 / alt 30 BEFORE {"code":"blk","text":"Blocked"} ceil 37.10 / AFTER
  {"code":"vis","text":"Observable"} ceil -90` at the default brush r=28. Path:
  `web/horizon.js:1267` -> `core/horizon.js:398-408` -> `cropStrokes:355-369`,
  reachable while `p.strokes` is non-empty. I did not measure a real pointer
  pitch or build the end-to-end browser scenario, so it stays the delegate's.
- **`core/scoring.js` + `core/catalog.js`**: audited by the second delegate, not
  re-derived by me (I confirmed CO-07 and re-ran the shared engines).
- **The desktop exe path, the live deploy, the installer** - untouched.
