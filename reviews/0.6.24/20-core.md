# t3 — Review lane: `core/` shared JS domain + baking contract

Lane: **t3 core-reviewer** · Subject: working tree at **HEAD `9596878`**
(`git describe` = `v0.6.24-2-g9596878`, NightSeam 0.6.24) · Read-only review, no
production file touched.

> **Filename note.** This file is the t3 deliverable under the task-contract name
> `reviews/0.6.24/20-core.md`, and it is the **single canonical** core lane file —
> t7/t8/t9 should use this path. The charter's §1.3 deliverable layout named
> `reviews/0.6.24/02-core.md`; that file was an identical duplicate (sha256
> `fac26e81f6ba539a76a6f64ddf8c0530a19ad6794edd61c7203d234215d46394` for both
> copies) and has been removed, so the review directory carries exactly one file
> per lane. The amended charter adopts the task-contract naming.

---

## Coverage

### Examined (source read line-by-line, not comments)

| Artifact | What was checked | Evidence |
| --- | --- | --- |
| `core/astro.js` (273 L) | `julianDay`/`dateFromJD`, `gmstDeg`, `precessJ2000ToDate`/`precessDateToJ2000` (Meeus 21, middle rotation about **Y**), `refractionDeg`, `altaz`/`altazFrame`/`altazFrameApply`, `sunRaDec`/`moonRaDec`/`moonIllumination`/`moonAge`/`sunAlt`/`sepDeg` | full read; `node tests/js/reference_anchors.mjs` 19/19 ok; 20 hand-built mutations |
| `core/planning.js` (169 L) | `sunCrossings` pairing rule, `nightInfo` noon+30 h anchor, `pickDarkWindow` cascade + polar fallback throw, `scrubWindowMs` degeneracy policy, `scrubBounds`/`scrubClamp` | full read; independent 1-min brute-force scan at 5 sites (probe 4) |
| `core/horizon.js` (512 L) | `NO_BLOCK`/`BINS`/`BIN_DEG`/`MASK_*`, `worldBin`, `rebuildMask` + seam wrap, `altOf`/`rowOfAlt`, `xOfAz`/`azOfX`, `wrapsFor`, `profileFromMask`, `normalizeProfileBins`, `profileSegments`, `visibleSkyBands`, `skyBandPolygons`, `computeProfile`, `clearMask`, `cropKeptBand`/`cropStrokes`/`clipProfileToFov`/`cropPano`, `ceilFor`, `bandTopFor`, `overhangRuns`, `assumedOpenRuns`, `assumedOpenHatchPolys` | full read; 120-case complement sweep + malformed-input matrix (probes 3/5); CR3 probe |
| `core/visibility.js` (48 L) | `aboveHorizon`, `sampleVisible`, `statusOf`, `effectiveMinAlt` boundary semantics | full read; boundary matrix (probe 3) |
| `core/scoring.js` (197 L) | moon/bortle curves, `popularityFactor`, `computeNightTracks` (precession once at midpoint), `scoreNightTracks` **inlined ceilFor** vs `core/horizon.js::ceilFor`, `nightStats`/`nightStatsBatch` | full read; inlined-vs-canonical branch comparison |
| `core/format.js` (90 L) | `fmtSize`/`sizeArcmin`/`fmtFov`/`fmtFovPair`/`framePct`/`magVisible`, `skyClampZoom`/`skyViewMatrix`/`skyScreenToBase`/`skyClampFocus` | full read |
| `core/catalog.js`, `core/time.js` (40/59 L) | type registry, `isCustomId`, `searchBlob`; `offsetEastMin`, `zoneOffsetAtLocalNoon` (3-pass DST), `wallFromUtcMs`/`utcFromWallMs` | full read; DST/zone/malformed-date matrix (probe 4) |
| `core/index.js`, `core/core.manifest.json` | explicit export surface (54 names), hash/token/per-file digests | full read; digest recomputed by `check_core.py` |
| `scripts/build_core.py` (119 L) | bake loop, `tree_hash` (CRLF-normalised), `export_names`/`stub_text`, **token bump rule**, retention behaviour | full read; `git ls-tree` of v0.6.23/v0.6.24/HEAD |
| `scripts/check_core.py` (221 L) | manifest/hash drift, baked byte identity, exact-hash-dir rule, stub↔hash pairing, web token pairing, `FORBIDDEN` purity, `MOVED`/`MOVED_PY`/retired-module guards | full read; **10 independent mutations** + 3 blind-spot probes (probes 6/7/8) |
| Baked trees `web/core/<hash>/`, `static/js/core/<hash>/`, stubs `web/core.js`, `static/js/core.js` | byte identity, single hash dir, stub content, importer tokens | `python scripts/check_core.py` → `check_core: OK`; `git status` clean |
| `tests/js/reference_anchors.mjs`, `tests/js/core_d1.mjs`, `tests/test_{reference_anchors,core_fixtures,core_drift,d1_contract}.py`, `tests/js/sky_band.mjs` | whether the *pins* are independent of the implementation | full read; D1 mutation of the representative column (M5); anchor sensitivity sweep |

### Deliberately not examined (or only cross-checked)

| Item | Why |
| --- | --- |
| The shell-side consumers (`web/app.js`, `web/horizon.js`, `static/js/derive.js`, `static/js/pano.js`) | Owned by t4/t5. Read only where needed to judge reachability of a core defect (`ceilFor`/`sunAltAz`/`moonAltAz` call sites, `visibleSkyBands` reachability, `profileSegments` null guard). |
| The desktop **native** panorama path (`Pano.cur.profile` authoring, `Pano.cur.profile_top` persistence) | t5's editor model. t3 only verified that `core/`'s world-bin representation is consistent with what the desktop recomputes from strokes. |
| `tests/browser/*` and the browser gate | Browser lane belongs to t4/t5/t6; the two panorama browser checks (`web-pano-crop-recalibrate`, `desktop-pano-crop-fov`) were **not run** by this lane. |
| `tests/fixtures/core_fixtures.json` values | Regression golden only; deliberately not treated as a correctness oracle (charter §2.2). |
| `app/`, `web/`, `static/`, `tests/`, `scripts/` as review subjects | Out of scope; touched read-only for reachability. No file outside `reviews/0.6.24/` was modified. |

---

## Findings

### CO-01 — The FOV-edge half-bin mismatch is real: the profile carries one extra 0.5° bin that the scorer gates away, and the slice that *is* scored reads the far edge of the panorama

- **id**: CO-01
- **lane / severity (asserted) / confidence**: core / **medium** / high
- **file:line**
  - profile coverage test: `core/horizon.js:109` (`if (rel > fov) continue;`, in `profileFromMask`) and the identical line `core/horizon.js:150` (`normalizeProfileBins`)
  - scorer gate: `core/horizon.js:402` (`if (d > fov) { … }`, in `ceilFor`), mirrored bit-for-bit in `core/scoring.js:147-149` (`const d = (((az - azOff) % 360) + 360) % 360; if (d > fov) {` in `scoreNightTracks`)
  - world-bin index (un-gated by the FOV test): `core/horizon.js:29-32` (`worldBin`) and `core/scoring.js:151-152`
- **rule violated**: the carry-over row `CR3` in `AGENTS.md` §"Code review record and status" ("FOV-edge half-bin (changes a rendering/scoring boundary = user-visible)"), itself derived from `CODE-REVIEW-0.6.20.md` §finding table: "FOV-edge half-bin convention mismatch (`rel > fov` in the preview vs `d > fov` in scoring/`ceilFor`)". Secondary standard: `core/horizon.js:381-383` contract comment — "visible = alt >= minAlt && alt > ceil && alt < (ceilTop ?? 90.5). **Outside the calibrated FOV: obstacle mode = unblocked**" — an object inside the straddling slice is *not* outside the FOV by the profile's own coverage rule, yet outside it by the gate.
- **what is wrong**: `profileFromMask`/`normalizeProfileBins` carry a world bin `i` when `rel = ((i*0.5 - azOff) % 360 + 360) % 360 <= fov`, i.e. when the bin's **left edge** is inside the frame. The scorer's gate is `d = ((az - azOff) % 360 + 360) % 360 > fov`, i.e. strictly the object's own azimuth. For a bin at the right edge, `rel == fov` exactly, so it is carried; but every azimuth mapped into it by `worldBin(az) = floor(az/0.5)` except the exact left-edge azimuth `azOff+fov` has `d > fov` and is gated away. Net: exactly **one** stored bin per panorama (e.g. bin 90 at `fov=45, azOff=0`; bin 240 at `fov=90, azOff=30`; bin 690 at `fov=300, azOff=45`) is authored/rendered but never scored — and the single azimuth inside that slice that *is* scored (`az == azOff + fov` exactly, or a shell that evaluates `ceilFor` at a slightly-rounded azimuth) reads that bin's representative column, which is `floor(rel*720/fov)` clamped to 719 — the **opposite edge of the mask** (`rel*720/fov == 720` → 719).
- **trigger / reachability**: any panorama whose `fov < 360` (every cropped panorama; the web crop is non-destructive but well-trodden) and an object whose azimuth lands in the half-degree slice at the frame's right edge. Both shells consume `ceilFor`/`scoreNightTracks`, so it affects scoring, the visibility column and the detail payload identically. Not reachable at `fov = 360` (there `rel == 360` is impossible for `i <= 719`, and the gate includes the whole circle).
- **reproduction** (paste-ready, from repo root; every step is a file:line above):

  ```powershell
  # profile clear everywhere except bin 90, pano calibrated fov=45 azOffset=0
  node -e "import('file:///<workspace>/AstroPilot-local/core/index.js').then(C=>{const prof=new Array(720).fill(C.NO_BLOCK);prof[90]=80;const p={paintMode:'obstacle',fov:45,azOffset:0,profile:prof,profileTop:new Array(720).fill(C.NO_BLOCK)};for(const az of [44.75,45.0,45.1,45.4,45.5])console.log(az, C.ceilFor(p,az).ceil)})"
  ```
  Observed (this lane):
  ```text
  44.75 -90        # bin 89, clear
  45.0  80         # bin 90  -> the obstruction is APPLIED
  45.1  -90        # bin 90  -> the same obstruction is GATED AWAY (d = 45.1 > fov = 45)
  45.4  -90
  45.5  -90
  ```
  Bins carried vs bins scored, measured over a 0.01° azimuth sweep (probe evidence
  `reviews/0.6.24/evidence/_sens_probe2.py` pattern; reproduced with a throwaway
  `.mjs` beside it):
  ```text
  fov=45,  azOff=0    profile carries 91 bins, scorer touches 90 -> extra bin 90
  fov=90,  azOff=0    profile carries 181,     scorer 180        -> extra bin 180
  fov=90,  azOff=30   profile carries 181,     scorer 180        -> extra bin 240
  fov=120, azOff=359.5 profile carries 241,    scorer 240        -> extra bin 239
  fov=300, azOff=45   profile carries 601,     scorer 600        -> extra bin 690
  ```
  Representative column of the extra bin: `fov=45, azOff=0, i=90` → `rel = 45`,
  `col = min(719, floor(45*720/45)) = 719` — the mask column at the **other** end
  of the panorama.
- **impact**: exactly one half-degree-wide azimuth slice at the right edge of any
  partial-FOV panorama. Inside it, an obstruction that was painted at the far
  side of the source image can hide or (after a crop that clears the frame) fail
  to hide an object, and the profile preview still draws the edge bin the scorer
  ignores. Observable only when the source mask happens to be clear just inside
  the frame and obstructed at the mask's opposite edge, so: rare, cosmetic-to-
  ranking in practice, but a genuine boundary inconsistency between the geometry
  and the scorer. This is **not** the same defect as the sub-bin
  representative-column quantisation (see Observations O1 below), which is
  smaller than one mask pixel.
- **falsifier**: if `worldBin(azOff + fov + ε)` were excluded from profile
  coverage too, the extra bin would not exist — i.e. if either side used the same
  `<=`/`>` convention AND the same quantised value. Opening
  `core/horizon.js:109`/`:150` (`rel > fov`) against `core/horizon.js:402` /
  `core/scoring.js:148` (`d > fov`) shows they do not, and the sweep output above
  would then read `profile carries == scorer touches`.
- **history**: this is carry-over `CR3`, unchanged since `CODE-REVIEW-0.6.20.md`
  (S4) and explicitly `DEFERRED` in `BATCH3-REPORT.md:22`. Not a duplicate of any
  t3 finding; the shells' previews are consistent with their own convention (see
  the CR3 resolution below), so this is core-only.

### CO-02 — The documented N-1 baked-core retention policy is contradicted by the baker, and nothing enforces or verifies it

- **id**: CO-02
- **lane / severity (asserted) / confidence**: core / **low** (reported as `low`,
  not `medium`: the deployed tree keeps N-1 incidentally because deploys are
  additive, so the user-visible blast radius is narrow; **overlaps t6's `TO-01`,
  which ranks the same defect `medium`** — the verifier should merge and settle
  the rank, see History) / high
- **file:line**
  - the policy: `AGENTS.md` §"Baked-core retention policy" — "keep the CURRENT
    content-hashed dir plus the immediately previous one (N-1) so a visitor
    holding a cached old `core.js` stub still resolves its tree; remove anything
    older at the next re-bake. `check_core.py` only requires the current dir."
  - the behaviour: `scripts/build_core.py:96-100` — `for child in dest_root.iterdir(): if child.is_dir(): shutil.rmtree(child)`; the loop keeps **no** previous directory, it deletes every existing one before writing the new hash dir.
  - the guard: `scripts/check_core.py:119-125` asserts `dirs == [hash_]`, i.e. it
    actively **requires** that no older dir exists on either side.
- **rule violated**: the `AGENTS.md` retention policy quoted above.
- **what is wrong**: the documented policy is presented as the behaviour to rely
  on ("so a visitor holding a cached old `core.js` stub still resolves its tree"),
  but the only program that produces the baked trees destroys N-1 on every run,
  and the guard asserts exactly one hash dir — so a re-bake *cannot* satisfy the
  policy, and a stale-cached-visitor scenario is not covered by any check. The
  contradiction cuts both ways: a maintainer who follows the documented policy and
  leaves the previous hash dir in place makes `check_core.py` **fail**
  (`web: baked hash dirs ['79ad99ef15810ca2','97c2e182fb0a5630'] != ['97c2e182fb0a5630']`),
  which blocks `check_js.py`/`check_release.py`. t6 reached the same conclusion
  independently and recorded it as `TO-01` in `reviews/0.6.24/50-tests-tooling.md:197-240`.
- **trigger / reachability**: on every core re-bake (i.e. every release that
  changes `core/`). The header of the policy even describes its own failure mode:
  a browser that still has the previous `web/core.js` cached (tokens are bumped
  per module, but the *stub* URL `core.js` is token-less in the HTML — the
  `?v=` lives on the importers' imports, so a stale HTML/module pair can hold the
  old stub) will import `./core/<old-hash>/index.js`; that path no longer exists
  in the repo or the freshly built tree.
- **reproduction**:

  ```powershell
  git ls-tree --name-only v0.6.23:web/core   # -> 79ad99ef15810ca2
  git ls-tree --name-only v0.6.24:web/core   # -> 97c2e182fb0a5630
  git ls-tree --name-only v0.6.23:static/js/core  # -> 79ad99ef15810ca2
  git ls-tree --name-only v0.6.24:static/js/core  # -> 97c2e182fb0a5630
  ```
  Observed (this lane): `v0.6.23` carries exactly one dir, `v0.6.24` carries
  exactly one dir, and it is a different one — N-1 was **not** retained when
  `7e73d98` re-baked core. Working tree: `web/core/` and `static/js/core/` each
  contain only `97c2e182fb0a5630`.
- **impact**: **not live on the current deployment** — the deployed `/astro/core` carries `79ad99ef15810ca2` (N-1) and `784ef08ceaafccf7` (N-2) with all nine modules and the old stub URL resolves (see the deployment bullet below), so no returning visitor is stranded today. The residual impact is a maintenance/release-process hazard: the repo cannot reproduce the deployed state, so a reseed or mirror deploy from the repo would collapse `/astro/core` to one dir and only then a returning visitor whose cached module graph points at `79ad99ef15810ca2` would get a 404 on the core import (hard failure of the whole web planner/editor). A desktop consumer building the tree from the repo (`static/js/core/<hash>/`) has no N-1 in either case. The mitigation is the additive upload flow (`web/ftps_deploy.py` has no prune step — only an explicit `remove` command) plus the per-module `?v=` bump discipline, neither of which is checked.
- **falsifier**: if `build_core.py` preserved the previous hash dir (it does not:
  `scripts/build_core.py:96-100` removes every dir before the write) or if
  `AGENTS.md` had been updated to say "only the current dir is kept" (it was not),
  the finding would fall. Equally, if `check_core.py` accepted and verified N-1
  (it uses `dirs != [hash_]`), the guard would have caught the drift.
- **deployment half — CHECKED (read-only FTP, added after captain guidance, and it settles the severity)**: the deployed `/astro` tree does **not** share the repo's N-1 gap. `python web/ftps_deploy.py list /astro/core --env <workspace>\Astro-Web\ftp.env` returns **three** complete hash dirs — `97c2e182fb0a5630` (current, = this repo's HEAD), `79ad99ef15810ca2` (**N-1**, the v0.6.22–v0.6.23 bake) and `784ef08ceaafccf7` (**N-2**, the v0.6.18–v0.6.21 bake) — and both older dirs carry all nine modules (`list /astro/core/79ad99ef15810ca2` → astro/catalog/format/horizon/index/planning/scoring/time/visibility, and likewise for `784ef08ceaafccf7`). The cached-stub URL the policy exists for **resolves with real bytes**: `download /astro/core/79ad99ef15810ca2/index.js …` succeeded, 1787 B, sha256 `89162feb5aa7b324f80e28e6184105c8ad490fde1c99ddc12e393a81fe19f64b`. The live chain is otherwise consistent with this HEAD: live `version.json` = `{version 0.6.24, describe v0.6.24, built 2026-09-12T16:02:43+00:00}`; live `index.html` loads `app.js?v=60`; live `app.js` imports `./core.js?v=17` and is **byte-identical** to the repo's HEAD `web/app.js` (sha256 `30f61ee337d2127d04c24d43ae9cc0a62d8e0c57120e4388149fc7dad5d24623`); live `core.js` is the generated stub pointing at `./core/97c2e182fb0a5630/index.js`. So the retention policy is **satisfied in practice by the deployed artifact** and the user-facing risk in the impact bullet below is **not** live. What remains is the repo/deploy split: the repo cannot reproduce the deployed state (its baker deletes N-1, its guard forbids it), so a reseed or mirror deploy from the repo would collapse `/astro/core` from 3 dirs to 1 and only then strand a visitor holding the `core.js?v=16` stub. **Severity stays `low`** — now on evidence rather than on the assumption that deploys happen to be additive — and the row is a maintenance/release-process hazard, not a live user-facing defect. Downloaded artefacts kept for the verifier: `reviews/0.6.24/evidence/_deployed_{version.json,core.js,app.js,index.html,core_n1_index.js}` (read-only copies of public files; no credential value was printed or stored).
- **history**: new to this lane, but **duplicate of t6's `TO-01`**
  (`reviews/0.6.24/50-tests-tooling.md:197`, asserted `medium`), which is the
  owner lane for the doc/guard/release contradiction and carries its own probe
  (`reviews/0.6.24/evidence/probe_tooling.py`, section B). The t3-unique content
  here is the baker-side mechanism (`scripts/build_core.py:96-100` deletes every
  existing hash dir), the git-history proof at `v0.6.22`/`v0.6.23`/`v0.6.24`
  (`79ad99ef15810ca2` shipped by v0.6.22 and v0.6.23; `784ef08ceaafccf7` by
  v0.6.18–v0.6.21; `97c2e182fb0a5630` by v0.6.24 only), and the **deployment
  evidence above** — which is the half that decides severity. The verifier should
  merge the two rows into one id with both lane references preserved (charter §4
  `XL`/dedup rule) and re-rank in either direction; this lane's evidence supports
  `low` (deployed N-1 and N-2 both live, old stub URL resolves), t6 asserts
  `medium` (repo/guard contradiction blocks a policy-following release step).
- **cross-lane**: same observation as charter seed hypothesis **H1** (owner t6).

### CO-03 — The moved-concept and stale-token guards only scan the top level of `web/` and `static/js/`, so a re-implementation in a subdirectory passes

- **id**: CO-03
- **lane / severity (asserted) / confidence**: core (guard is shared with t6) /
  **low** / high
- **file:line**
  - `scripts/check_core.py:141-150` — the importer/token scan is
    `for p in sorted(WEB_DIR.glob("*.js"))`, i.e. one level only, and it exists for
    the web tree only.
  - `scripts/check_core.py:163-166` — the `MOVED` scan is
    `for base in (WEB_DIR, STATIC_JS): for p in sorted(base.glob("*.js"))`, same
    one-level restriction for both shells.
  - contrast: `scripts/check_core.py:157` (`for p in build.core_files(CORE)`) and
    `:199` (`base.rglob("*.py")`) do recurse — the purity guard and the Python
    moved-concept guard are complete.
- **rule violated**: the shared-core invariant in `AGENTS.md` §"Shared core
  (Phase 1, 0.6.16)" — "`check_core.py` … fails on any drift … or a moved concept
  re-implemented outside `core/`" (unqualified) and §"Baked-core retention" is not
  the standard here; the `AGENTS.md` §"Architecture" wording is the same.
- **what is wrong**: the guard's own contract is "a moved concept cannot be
  re-implemented outside core/", but the implementation only inspects
  `web/*.js` and `static/js/*.js`. A file placed in `web/lib/`, `web/util/`,
  `static/js/lib/` (or any new subdirectory) that defines e.g. `ceilFor`,
  `computeProfile`, `fmtSize` or `nightStats` is not seen by either the `MOVED`
  scan or the token scan. The purity guard *does* recurse for `core/`, and the
  Python guard *does* recurse for `app/`/`scripts/`, so this is an inconsistent
  depth rule rather than a missing idea.
- **trigger / reachability**: a contributor adds a shared helper in a new
  subdirectory of either shell and (re-)implements a core concept there; or a new
  top-level module's import of `./core.js?v=<stale>` goes unnoticed only if the
  module sits below the top level. Both trees currently contain no such
  subdirectory (the only subdirectories are the baked `core/<hash>/` trees, which
  are intentionally scanned through their source digests), so this is a latent
  guard gap, not a present-day defect.
- **reproduction** (verified by this lane, staging a scratch copy of the repo
  tree under `reviews/0.6.24/evidence/_tmp_guard2/`, running the real guard, then
  deleting the scratch):
  ```text
  A)  web/lib/geom.js        : export function ceilFor(p, az) { … }   -> check_core: OK   (exit 0)
  A2) static/js/lib/geom.js  : export function fmtSize(s) { … }       -> check_core: OK   (exit 0)
  B)  web/newmod.js          : import … from './core.js?v=99'         -> check_core: FAIL (exit 1)
  C)  core/sub/x.js          : window.innerWidth                      -> check_core: FAIL (exit 1)
  ```
  A copy of the probe is kept at `reviews/0.6.24/evidence/_guard_probe2.py`.
- **impact**: none today (no offending file exists). The guarantee that
  `AGENTS.md` sells — "the moved concepts cannot reappear as definitions in the
  shells" — is narrower than advertised, so a future refactor could silently
  duplicate core math in a helper subdirectory and every guard would stay green.
  This is the "guard asserts more than it checks" class §2.6 allows.
- **falsifier**: if `check_core.py` used `rglob("*.js")` on both shell trees the
  A/A2 cases would fail. Opening lines 141 and 163 shows `glob`, not `rglob`.
- **history**: new; the same one-level pattern may be worth a cross-check by t6
  against `check_js_imports.py`/`check_dom_ids.py`, which have their own scans.

### CO-04 — `visibleSkyBands` dereferences a missing record while every sibling geometry entry point degrades gracefully (inconsistent malformed-horizon hardening)

- **id**: CO-04
- **lane / severity (asserted) / confidence**: core / **low** / high
- **file:line**: `core/horizon.js:202-213` (`const e = p.profile[col];` and, in sky
  mode, `const t = p.profileTop[col];` — no record/shape guard in
  `visibleSkyBands`). Compare the hardened siblings:
  `core/horizon.js:390-398` (`ceilFor` guards `p &&` and the 720 length),
  `core/horizon.js:420-423` (`bandTopFor`), `core/horizon.js:437-438`
  (`overhangRuns`), `core/horizon.js:457-461` (`assumedOpenRuns`),
  `core/horizon.js:491-494` (`assumedOpenHatchPolys`).
- **rule violated**: `AGENTS.md` §"Sky-band rendering (0.6.13, ITEM C)" — "the
  visible-sky region is the EXACT complement of the blocked region …
  (`web/horizon.js::visibleSkyBands`)"; and the documented carry-over `CR2`
  ("Malformed-horizon guards (all shipped producers normalize before preview)").
  The named function in the invariant is the one without the guard, while the
  helpers it is built on have one.
- **what is wrong**: `visibleSkyBands(p, …)` reads `p.profile[col]`
  unconditionally. With `p == null`/`undefined` the property read happens before
  any FOV or paint-mode logic, so the function **throws** (TypeError) instead of
  returning the "fully blocked" / "unblocked" degrade that `ceilFor` returns
  (`{ceil: -90, ceilTop: null}`) and that `assumedOpenHatchPolys(null, …)` returns
  (`[]`). In sky mode a record with a valid `profile` but a missing
  `profileTop` throws on `p.profileTop[col]` (`undefined[col]`), where `ceilFor`
  returns `{ceil, ceilTop: null}`.
- **trigger / reachability**: `visibleSkyBands` is exported from
  `core/index.js:15` and re-exported by `web/horizon.js:20-21,30`; the web preview
  reaches it only indirectly through `skyBandPolygons` (`web/horizon.js:963`, in
  `drawProfile`), and both `web/horizon.js::load()` (`:128`,
  `d.panos.forEach(normalizeProfileBins)` — which always installs a 720-length
  array) and `newPano` (`:328`) normalize before the preview, so **no shipped
  producer reaches it with a malformed record today**. The throw is reachable from
  any future caller, from the `tests/js/sky_band.mjs`-style harnesses that
  deliberately feed malformed records to the other helpers (`sky_band.mjs:244-248`
  pins `assumedOpenRuns`/`assumedOpenHatchPolys` degrading to `[]`), and from a
  corrupted `localStorage`/IndexedDB record that skips the loader (the loader is
  the only normalizer).
- **reproduction** (probe 5, `core/` imported directly):
  ```text
  input                    ceilFor                        visibleSkyBands
  null                     {"ceil":-90,"ceilTop":null}    THROWS: Cannot read properties of null (reading 'profile')
  {}                       {"ceil":-90,"ceilTop":null}    THROWS: Cannot read properties of undefined (reading '0')
  {profile:[…720], sky, no profileTop}  {"ceil":20,…}     THROWS: Cannot read properties of undefined (reading '0')
  {profile:[…720], sky, profileTop:null}                THROWS: Cannot read properties of null (reading '0')
  assumedOpenHatchPolys(null) -> 0 ; overhangRuns(null) -> 0 ; bandTopFor(null) -> null ; ceilFor(null) -> guarded
  ```
  Paste-ready:
  ```powershell
  node -e "import('file:///<workspace>/AstroPilot-local/core/index.js').then(C=>{try{C.visibleSkyBands(null,0)}catch(e){console.log('throws:',e.message)}})"
  ```
- **impact**: none for a user today (the shipped producers normalize). If a
  malformed record ever reaches the preview, the failure mode is a hard throw
  inside `drawProfile` (blank/broken preview) instead of the documented
  degrade-to-unblocked/full-block. Severity is therefore `low` (no reachable
  behavioural impact, contract inconsistency).
- **falsifier**: if `visibleSkyBands` returned a 720-length band array for
  `null`/`{}`/missing `profileTop`, the finding falls. Executing the paste-ready
  command above prints a TypeError instead.
- **history**: this row is the core-side answer for carry-over **CR2**
  (see the CR2 resolution below); t4/t5 own the consumer-side producers.

---

## Carry-over items owned by t3

### CAR-CR2 — malformed-horizon guards (owner t3, with t4/t5 on consumers)

**Resolution: STILL OPEN (low severity, core-internal inconsistency).**

- What the record claims (`AGENTS.md` §"Code review record and status"): "`CR2`
  malformed-horizon guards (all shipped producers normalize before preview)".
- Core behaviour, checked function by function at HEAD: `ceilFor`
  (`core/horizon.js:390-404`), `bandTopFor` (`:420-423`), `assumedOpenRuns`
  (`:457-461`), `assumedOpenHatchPolys` (`:491-494`) all guard a missing/wrong-
  length `profile` and degrade (`{ceil: NO_BLOCK|90, ceilTop: null}`, `null`,
  `[]`). `overhangRuns` (`:437-438`) delegates to guarded `ceilFor`.
  `normalizeProfileBins` (`:138-159`) replaces a malformed `profile`/`profileTop`
  with a 720-length canonical array and is called at both web storage boundaries.
- The exception is `visibleSkyBands` → **CO-04**. The preview producer chain
  (`web/horizon.js:128` load, `:328` newPano, `:269` backup import) does normalize,
  which is why the item can be described as "all shipped producers normalize" —
  but the core function the invariant names is the one without the guard.
- Verdict: **STILL OPEN at low severity**; the substantive claim (producers
  normalize) holds for the shipped paths I could read, the hardening gap is real
  and is CO-04. Recommend the record be amended rather than closed.

### CAR-CR3 — FOV-edge half-bin (owner t3, with t4/t5)

**Resolution: STILL OPEN (medium severity).** See **CO-01**, which pins the
mismatch to `core/horizon.js:109`/`:150` vs `core/horizon.js:402` /
`core/scoring.js:148` and demonstrates the affected slice (bin 90 at `fov=45,
azOff=0`; bin 240 at `fov=90, azOff=30`). The preview/scoring wording in
`CODE-REVIEW-0.6.20.md` needs one correction: the **web** preview is not the
divergent side — `web/horizon.js:951` renders it with `azOff = 0, fov = 360`
(the full 720-bin world space), and the **desktop** preview
(`static/js/pano.js:566-568`) uses the calibrated `fov`/`azOff`, i.e. the same
`rel <= fov` coverage the core authored profile uses. The live mismatch is
**profile coverage (`rel <= fov`, per-bin) vs the scorer gate (`d > fov`,
per-azimuth)**. Severity stays `medium`: the sliced band is one 0.5° bin, the
observable case needs a mask that is clear just inside the frame and obstructed
at the mask's far end, and no data loss or boundary breach is involved.

---

## Observations (not findings — severity-less appendix, per charter §3)

- **O1 — sub-bin representative-column quantisation (bounded, < 1 mask pixel).**
  For each world bin the profile reads `col = floor(rel*720/fov)`, whose centre
  sits `(0.5/720)*fov` above the bin's azimuth — a constant per-calibration shift
  of `fov/1440` degrees (0.0313° at `fov=45`, 0.0625° at `fov=90`, 0.125° at
  `fov=360`). It is strictly less than one mask column (a full bin is 0.5°), is
  identical to the desktop's own representative column, and cannot flip a bin
  index; not filed. (This is what CR3's "half-bin" phrase is sometimes read to
  mean; the load-bearing defect is CO-01, not this.)
- **O2 — the D1 pin is a transcription, not an independent check.**
  `tests/js/core_d1.mjs:25-28` defines `representativeCol` with exactly the
  implementation's formula (`Math.floor(rel * BINS / fov)`), so a *formula*
  mutation is caught (verified: substituting `Math.round` makes
  `core_d1.mjs` fail three groups, e.g. `adapter bin 93 (fov=300)`), but a
  *convention* mutation of the same formula on both sides would not be. The
  mutation proof in `tests/test_d1_contract.py:38-49` uses
  `BIN_DEG * 2` (a doubling), which the check catches.
- **O3 — reference-anchor sensitivity (measured, not asserted).** 19/19 anchors
  pass at HEAD. I re-ran the anchors against 20 hand-built core mutations:
  caught — `precession zeta + 1e-5″`, `zeta ×10` (8 checks), `julianDay` without
  the Gregorian `B` term (5 checks), `moonIllumination` `cos(ψ²)` (2 checks),
  `SYNODIC_MONTH = 29.5306` (1 check). **Not caught** (all with the anchor
  harness green): `refraction 1.02→1.03` and `10.3→10.4`, `sun n 0.9856474→
  0.9856475`, equation-of-centre `1.915→1.925`, obliquity `23.439→23.449`,
  `moon +0.658` term dropped, `moon 6.289→6.389°`, `GMST rate +1e-6 °/day`. Two
  distinct reasons: the sun/moon tolerances are deliberately sized to the model
  error (`moon_erfa_position` dec tol 0.6°, `sun_position_august_2026` dec tol
  0.15°, `refraction_magnitude` rel tol 1%), and the GMST anchor only pins the
  J2000 epoch value (`gmst_j2000`), not the rate. The anchors remain the
  authority they claim to be for the models they cover; the gap is that
  low-order coefficient changes inside the tolerance bands are invisible to the
  suite. Also worth noting: `reference_anchors.mjs` only imports `core/index.js`
  and only exercises `astro.js` — structural mutations of `horizon.js`
  (`NO_BLOCK -90→-89`, the `90.5` sentinel, `CROP_MIN_FOV 45→30`) and
  `scoring.js` (`bortleMoonFactor` 0.12→0.13) leave all 19 checks green, which
  is expected (structure is pinned by the `*.mjs` engines instead) but means the
  anchors must not be cited as coverage for those modules.
- **O4 — `core/astro.js` header comments are stale after Phase C.**
  `core/astro.js:10` ("Python `app/astro.py` is the oracle …") and `:48-49`
  ("`app/astro.py` is the oracle and implements the same equations"), plus
  `core/planning.js:4-8` ("`app/planning.py` is the authoritative oracle"). Both
  modules were **deleted** in Phase C 0.6.20 (verified: `app/astro.py`,
  `app/planning.py`, `app/nightcalc.py` all absent;
  `scripts/check_core.py:70` lists them as `RETIRED_PY_MODULES`). Comments only,
  no behaviour: observation, `low`-at-most territory that the charter drops from
  the ranked list.
- **O5 — `core/time.js::zoneOffsetAtLocalNoon` silently rolls over impossible
  dates**: `"2026-02-31"` → 60 (the March offset), `"2026-13-01"` → 60
  (`Date.UTC` rolls over), `"2026-00-10"` → the local fallback offset. Documented
  behaviour is "falls back to the machine offset when the zone is absent or the
  date is malformed"; a rolled-over date is neither rejected nor announced.
  Reachable only from a hand-typed/imported `YYYY-MM-DD` string. Observation.
- **O6 — `core/scoring.js` exports two functions the shells use inconsistently**:
  `web/app.js:628-631` inlines the glow formula
  (`illum * Math.max(0, 1 - Math.max(0, sep - minD) / 180)`) instead of calling
  `core`'s `effectiveMoonGlow` (which `static/js/derive.js:193` does call), and
  `statusOf` is used by the desktop only (`static/js/derive.js:244` wrapper;
  `web/app.js:655` mentions it in a comment but the web imports
  `sampleVisible`/`nightStats` instead). Numerically the two paths agree today
  (same constants), so this is a drift risk, not a defect. Cross-reference t6's
  TS4 (untested exports) if it files one.
- **O7 — H2 (post-tag commits) is a release-hygiene observation, not a defect
  against the release.** `git log --oneline v0.6.24..HEAD` shows exactly two
  commits: `208f7d6 web: bump 0.6.24 module cache tokens (core re-bake 16->17 +
  crop UI)` (touches `AGENTS.md`, `web/app.js`, `web/index.html`) and
  `9596878 landing: changelog 0.6.24` (touches `landing/changelog.json` only, and
  is the legitimate post-tag changelog commit the release order in
  `AGENTS.md` §"Versioning and release" step 7 prescribes). The tagged commit does
  contain the CURATED entry — `git show v0.6.24:scripts/build_changelog.py` has
  the `"0.6.24": "Panorama crop. …"` line — so step 1 holds at the tag. Two things
  this lane noticed and hands to t6 rather than filing: (a) the token-bump commit
  `208f7d6` sits **after** `v0.6.24`, so the tagged commit's `web/` tree is not
  what the deployed `/astro` serves; the deployed bytes match **HEAD**, which is
  the correct outcome only because the deploy happened after the bump — a
  tag-time artifact (`check_release.py` / `make_release.py` run at the tag) would
  have described the pre-bump tokens. Live evidence: `/astro/app.js` is
  byte-identical to HEAD `web/app.js` (sha256 `30f61ee3…`), not to `v0.6.24:web/app.js`.
  (b) `core/` is unchanged by both post-tag commits, so core hashes are unaffected.
  Not a finding: no user-visible or release-integrity guarantee is broken at this
  HEAD (the tagged commit is internally consistent; only the working tree moved on).

---

## Baking-contract verification (acceptance item 3)

Verified from the real code, with mutation evidence for each claim:

| Claim (from `AGENTS.md`) | Where | Verified how | Result |
| --- | --- | --- | --- |
| Purity: no DOM/storage/network/build tokens in `core/` | `scripts/check_core.py:76-80, 157-161` (`FORBIDDEN`, recursive over `build.core_files(CORE)`) | appended `document.title` to `core/format.js` in a scratch tree | FAIL as designed (also trips the hash check) |
| Purity guard recurses | `build_core.py:43-45` (`rglob`) | put `window.innerWidth` in `core/sub/x.js` | FAIL as designed |
| Content-hash dirs, byte identity per file | `scripts/check_core.py:111-131` | one-byte drift in `web/core/97c2…/astro.js`; source change without re-bake | both FAIL as designed (drift: `web: astro.js differs from core/`; stale bake: `core/ hash … != manifest …`) |
| Exactly one hash dir per side | `scripts/check_core.py:123-125` | added `web/core/deadbeefdeadbeef/` | FAIL as designed |
| Explicit-export stub derived from `core/index.js` | `build_core.py:61-75, 92-95` | edited `core/index.js`'s export list without re-baking | FAIL as designed (hash mismatch) |
| Stub ↔ manifest hash pairing | `scripts/check_core.py:133-138` | re-pointed `web/core.js` at `0123456789abcdef` | FAIL as designed |
| Web stub token pairing (bump discipline) | `scripts/check_core.py:140-150` | `web/astro.js` `./core.js?v=17` → `?v=99` | FAIL as designed |
| Moved concepts cannot reappear in the shells | `scripts/check_core.py:163-188` | `function ceilFor(…)` appended to `web/horizon.js` | FAIL as designed |
| Retired Python modules cannot return | `scripts/check_core.py:192-195` | recreated `app/astro.py` | FAIL as designed (twice: retired module + `julian_day`) |
| Python astronomy cannot return to `app/`/`scripts/` | `scripts/check_core.py:196-208` (`rglob`) | `app/helper.py` with `def gmst_deg` | FAIL as designed |
| N-1 retention | `AGENTS.md` §"Baked-core retention" | `build_core.py:96-100` deletes every existing dir; `git ls-tree v0.6.22/v0.6.23/v0.6.24`; **live FTP `list /astro/core`** | repo: **not implemented, not checked** → CO-02; deploy: **satisfied in practice** (N-1 + N-2 present, old stub URL resolves) |
| Moved-concept guard covers subdirectories | `scripts/check_core.py:141, 163` (`glob("*.js")`) | `web/lib/geom.js` + `static/js/lib/geom.js` re-implementations | **evaded** → CO-03 |

---

## Commands run (evidence)

| Command | Result |
| --- | --- |
| `node tests/js/reference_anchors.mjs` | `{"checks":[…19 ok…],"failed":0}`, exit 0 |
| `python scripts/check_core.py` | `check_core: OK`, exit 0 |
| `python -m pytest tests/test_core_fixtures.py -q --basetemp <fresh> -p no:cacheprovider` | `7 passed`, exit 0 |
| `python -m pytest tests/test_reference_anchors.py tests/test_core_drift.py --basetemp <fresh> -p no:cacheprovider --tb=no` | `6 passed, 9 errors` — every error is the `tmp_path` fixture setup failing with `PermissionError: [WinError 5] … <basetemp>`; the 6 non-`tmp_path` tests pass |
| `python -m pytest tests/test_d1_contract.py --basetemp <fresh> -p no:cacheprovider -p no:tmpdir` | `3 passed, 1 error` (`fixture 'tmp_path' not found`) — the mutation test needs `tmpdir` |
| `python -m pytest tests/test_core_fixtures.py tests/test_reference_anchors.py tests/test_core_drift.py tests/test_d1_contract.py -q --tb=line --basetemp C:\Users\<user>\AppData\Local\Temp\opencode\pt -p no:cacheprovider` | **exit 1**: `16 passed, 10 errors`. The 10 errors are all `ERROR at setup of …` / session-finish `cleanup_dead_symlinks(basetemp)` → `PermissionError: [WinError 5] Zugriff verweigert: '…\pt'`, i.e. the documented sandbox temp-DACL artifact (`AGENTS.md` §Commands), which the charter explicitly excludes as a finding. All 16 test functions that can run in this environment pass; the mutation tests' node invocations are additionally proven by hand below. |
| manual mutation re-run of the proof suites | `reference_anchors.mjs` against a tampered copy: `zeta ×10` → 8 failed checks, exit 1; `core_d1.mjs` against `Math.floor(a/BIN_DEG)` → `Math.floor(a/(BIN_DEG*2))` → `FAIL: ceilFor world lookup inside FOV`, exit 1; against `Math.round(rel*BINS/fov)` → 3 FAIL lines, exit 1 |
| `git ls-tree --name-only v0.6.23:web/core` / `v0.6.24:web/core` (+ `static/js/core`) | one dir each, different hashes → CO-02 evidence |
| `python web/ftps_deploy.py list /astro/core --env <workspace>\Astro-Web\ftp.env` | three dirs: `784ef08ceaafccf7`, `97c2e182fb0a5630`, `79ad99ef15810ca2` → deployed N-1 **and** N-2 present (read-only; CO-02 deployment half) |
| `python web/ftps_deploy.py list /astro/core/79ad99ef15810ca2` (and `…/784ef08ceaafccf7`) | 9 module files each → the retained dirs are complete, not empty stubs |
| `python web/ftps_deploy.py download /astro/core/79ad99ef15810ca2/index.js …` | 1787 B, sha256 `89162feb…f64b` → the cached-stub URL the policy exists for resolves |
| `python web/ftps_deploy.py download /astro/{version.json,core.js,app.js,index.html} …` | version 0.6.24 (`built 2026-09-12T16:02:43+00:00`); live `core.js` → `./core/97c2e182fb0a5630/index.js`; live `app.js` byte-identical to HEAD `web/app.js` and imports `./core.js?v=17`; `index.html` loads `app.js?v=60` |
| `git log --oneline v0.6.24..HEAD` + `git show v0.6.24:scripts/build_changelog.py` | 2 post-tag commits (token bump `208f7d6`, landing changelog `9596878`); the `"0.6.24"` CURATED entry is inside the tagged commit → observation O7 |
| `git status --porcelain` at end of lane | see attestation below |

Scratch tooling written by this lane, kept for the verifier, all under
`reviews/0.6.24/evidence/`: `_mut_probe.py` (anchor mutations),
`_sens_probe2.py` (20-mutation sensitivity sweep), `_guard_probe.py` /
`_guard_probe2.py` / `_guard_probe3.py` (guard mutation and blind-spot probes).
Each creates its scratch tree under `reviews/0.6.24/evidence/_tmp_*/`, runs the
real guard/engine with `cwd` there, and deletes it again; the temp-directory
runs were switched to workspace scratch because `tempfile.mkdtemp()` under this
sandbox produces a directory whose child creation is denied
(`PermissionError: [WinError 5]` on `mkdir` inside it) — the same environment
artifact as the pytest basetemp error, not a repo defect.

---

## Read-only attestation

```text
$ git status --porcelain
?? .agent-teams/
?? reviews/
```

No file outside `reviews/0.6.24/` was created, modified or deleted. No
`scripts/build_core.py` run, no `git add/commit/tag/checkout`, no build, no
deploy, no FTP write. `core/`, `web/`, `static/`, `app/`, `scripts/`, `tests/`
are byte-identical to HEAD `9596878`.

The FTP access used to settle CO-02's deployment half was **read-only**
(`list` + `download` of public files under `/astro`, credentials from
`<workspace>\Astro-Web\ftp.env` read from outside the repo and never printed or
stored). It created only `reviews/0.6.24/evidence/_deployed_*` copies of public
artefacts (`version.json`, `core.js`, `app.js`, `index.html`,
`core_n1_index.js`). No `upload`, `uploadtree`, `uploadmany`, `mkdir` or
`remove` was issued against the server.
