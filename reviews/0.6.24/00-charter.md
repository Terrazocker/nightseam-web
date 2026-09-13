# Review charter — NightSeam 0.6.24 full review

Team: `nightseam-full-review-0624` · Owner of this charter: **review-lead** (task t1)
**Subject under review:** the NightSeam working tree at **HEAD `9596878`
(`git describe` = `v0.6.24-2-g9596878`)** — i.e. the 0.6.24 release line, two
post-tag commits on (`landing: changelog 0.6.24`). Tracked tree is clean; the
only untracked entry is `.agent-teams/` (this team's harness state).

```text
$ git log -1 --oneline            -> 9596878 landing: changelog 0.6.24
$ git describe --tags --always    -> v0.6.24-2-g9596878
$ git status --porcelain          -> ?? .agent-teams/     (nothing else)
```

This is a **source review of the working tree**, not a review of the deployed
`/astro` tree, the packed `dist/NightSeam.exe`, or any user's `data/`. Where a
lane needs a release artifact as *evidence* (e.g. `check_release.py`), it must
state the exact command and observed output — the artifact is never the review
subject.

---

## 1. Scope

### 1.1 In scope (review subject), with the one-line justification

| Tree / file | Why it is in scope |
| --- | --- |
| `app/` (41 files: `server.py`, `database.py`, `backup.py`, `ingest.py`, `fits.py`, `paths.py`, `images.py`, `imglib.py`, `catalog_data.py`, `adv_popularity_data.py`, `rig_presets.py`, `version.py`) | The FastAPI server and all storage/platform/IO: it owns the **untrusted path/import trust boundary** (setup ZIP, stored JSON, FITS) and every user-visible API contract. |
| `core/` (10 files: `astro.js`, `planning.js`, `horizon.js`, `visibility.js`, `scoring.js`, `catalog.js`, `format.js`, `time.js`, `index.js`, `core.manifest.json`) | **The single implementation** of astronomy, planning and horizon geometry for both shells; a defect here is wrong in the desktop app *and* the web app at once. |
| `web/` (`app.js`, `horizon.js`, `webstore.js`, `astro.js`, `format.js`, `nightrank.js`, `dragwin.js`, `index.html`, `style.css`, `themes.css`, `core.js`, baked `web/core/<hash>/`, `catalog.json` + `catalog.manifest.json`, `build_web.py`, `ftps_deploy.py`, `version.json`) | The static in-browser shell (planner UI, panorama editor, IndexedDB store, backup/restore) plus its **cache-token contract** and the baked-core stub it consumes. |
| `static/` (`js/*.js` 23 modules incl. `derive.js`, `night.js`, `planning_client.js`, `planning_worker.js`, `pano.js`, `skymap.js`, `skyview.js`, `wizard.js`, `state.js`, `util.js`, baked `static/js/core/<hash>/`) | The desktop shell: client-side planning/derivation, the **worker path and its async race contracts**, the panorama editor, and the DOM/id contract against `index.html`. |
| `tests/` (`tests/*.py` 32 modules, `tests/js/*.mjs` 18 engines, `tests/browser/*_suite.py` + `harness.py`, `tests/fixtures/`) | The **evidence base**: the pinned invariants, the `reference_anchors` correctness authority, and the mutation proofs the guard scripts rely on. Reviewing them is how we test whether the guard is credible. |
| `scripts/` (34 files: `check_*.py` guards, `build_core.py`, `build_adv_catalog.py`, `build_changelog.py`, `pre_tag_check.py`, `make_release.py`, `check_release.py`, `ftps_deploy.py`, `bench_desktop_compute.mjs`) | Guards, bakers, release and deploy pipeline: a weak guard or a wrong release step is a defect in the product's *assurance*, not in its features. |
| Root entry/release files: `main.py`, `build.ps1`, `NightSeam.spec`, `pytest.ini`, `requirements.txt`, `requirements-dev.txt` | Entrypoint, single-instance handoff, build/release mechanics and the test runner's configuration. |
| `README.md`, `AGENTS.md`, `DESIGN.md`, `landing/` (9 files) | The **standard of record**: feature claims, pinned invariants, design language, and the public changelog/version artifacts that must match reality. |
| `web/index.html`, `app/_version_baked.py`, `web/version.json`, `.gitignore` (as release-facing artifacts) | Version/cache-token truth: what a user's browser and the update checker actually see. |
| Prior review records, read-only context: `CODE-REVIEW-0.6.20.md`, `BATCH3-REPORT.md`, `FIX-REPORT-0.6.21.md`, `AUDIT*.md`, `REMEDIATION-0.6.9.md`, `PANORAMA-EDITOR-REVIEW.md`, the carry-over list in `AGENTS.md` §"Code review record and status" | Baseline for the **carry-over audit** (CR2, CR3, DS4, DS5, TL3, TL4, TL5, TS4, TS7, E15, PY6, WB7) and the "already recorded" dedup check. |
| Repo-hygiene only (tooling lane, low severity at most): root scratch scripts `check_unmatched.py`, `check_unmatched2.py`, `match_final.py`, `match_popularity.py`, `verify_matches.py`, `debug_matches.py`, `popularity_snapshot.json` | Committed scratch tooling that nobody references may be dead weight or a stale second source of truth (`scripts/match_popularity.py` also exists). |

### 1.2 Explicitly out of scope

| Excluded | Reason |
| --- | --- |
| `.agent-teams/`, `.dsh-vision-toolkit/` | This team's harness state (read-only diagnostics by team policy) and unrelated tooling. |
| `.pytest-tmp/`, `.pytest_cache/`, `__pycache__/`, `.venv-build/`, `logs/` | Local build/test environment artifacts; not shipped, not reviewable. |
| `data/` (SQLite DB, `panos/`, `imgcache/`), `dist/`, `build/` | User/local runtime state and generated build output. A dirty local DB is not a finding. |
| `assets/`, `theme-preview/` | Static art/preview material with no runtime contract. |
| `<archive>\Object-Astro`, `<workspace>\Astro-Web` | The deprecated archive and the behind-by-design dev mirror (AGENTS.md). Never reviewed, never synced. |
| Deployed production state and `ftp.env` | Outside the repo. If a lane needs FTP evidence it may only *read* (list an artifact, compare a hash); **never** print credential values, never upload, never delete. |
| Product changes | This is a review: no production code, test, data, tag, build or deploy changes (see §5). |

### 1.3 Deliverable layout — SUPERSEDED, use the canonical names below

**Binding amendment (captain, post-acceptance).** The team task contracts are the
immutable record that the t7/t8/t9 acceptance checks are written against, so the
canonical filenames are the contract names below — **not** the earlier `0N-*`
layout this section first carried. Supersede the old names everywhere:

```text
reviews/0.6.24/00-charter.md            <- t1 (this file)
reviews/0.6.24/10-python.md             <- t2 py-reviewer
reviews/0.6.24/20-core.md               <- t3 core-reviewer
reviews/0.6.24/30-web.md                <- t4 web-reviewer
reviews/0.6.24/40-desktop.md            <- t5 desktop-reviewer
reviews/0.6.24/50-tests-tooling.md      <- t6 tooling-reviewer
reviews/0.6.24/70-verification.md       <- t7 verifier (verdict table + refutation log)
reviews/0.6.24/07-findings.json         <- t7 verifier (ADDITIONAL machine-readable
                                            file; does not replace 70-verification.md)
reviews/0.6.24/REVIEW-0.6.24.md         <- t8 integrator (the deliverable report)
reviews/0.6.24/evidence/                <- optional: paste-ready command output captured by a lane
```

Old -> new (do not use the left column): `01-python.md` -> `10-python.md`,
`02-core.md` -> `20-core.md`, `03-web.md` -> `30-web.md`, `04-desktop.md` ->
`40-desktop.md`, `05-tooling.md` -> `50-tests-tooling.md`, `06-verification.md` ->
`70-verification.md`. `07-findings.json` and `REVIEW-0.6.24.md` are unchanged.

If a lane has already written a file under the old name, **do not rename or delete
it**: write the report to the canonical name and leave the earlier file in place
(add a one-line pointer at its top if that is cheap) so no work is lost and the
contract paths are satisfied. Report the duplicate to the captain in the lane's
completion message.

`reviews/0.6.24/REVIEW-0.6.24.md` is authoritative for the final report. If a
downstream task contract names a different (e.g. repo-root) report path, the
copy under `reviews/0.6.24/` stays authoritative and the other is a copy.

---

## 2. Standards to judge against (in priority order)

1. **`AGENTS.md` invariants** — the pinned behaviours with their pinning tests.
   Cite the section name verbatim. A change that regresses a pinned invariant is
   at least **high**.
2. **`tests/js/reference_anchors.mjs` + `tests/test_reference_anchors.py`** — the
   *correctness authority* for astronomy (published IAU 2006/Capitaine values,
   Meeus ch.7/12/21, the 2026-08-12/28 moon phases, an ERFA lunar position,
   Bennett refraction). `tests/fixtures/core_fixtures.json` is only a
   **drift/regression** golden: a fixture mismatch is *not* proof of a formula
   bug, and "fix the fixture" is never a fix.
3. **`README.md` feature claims** and **the code's own contract comments /
   docstrings / route docstrings** — quote them; a claim without its quote does
   not count.
4. **`DESIGN.md`** — only where a UI structure/design-language claim is made.
5. **Internal parity claims** — where two implementations (web ↔ desktop, JS ↔
   Python-era goldens) claim agreement, a divergence is a finding *if* the
   divergent case is reachable.
6. **General engineering standards** — correctness, races, error handling,
   resource cleanup, injection/quoting, encoding. Allowed, but the finding must
   still carry a concrete trigger and impact (§3); no "code smell only" items.
7. **Prior review records** — used for the carry-over audit and dedup, never as
   a source of new findings ("it was mentioned before" is not evidence).

---

## 3. Evidence bar (operational definition)

A finding is admissible **only** if a *different* member can re-check it from the
written block alone, without asking the author a single question. Every finding
must therefore contain all of:

| Field | Required content |
| --- | --- |
| `id` | Unique, per §4. |
| `title` | One line, states the defect (not the file name). |
| `(c) lane` / `claimed severity` / `confidence` | §4 prefix, §5 scale — **the claimed** level, `high`/`medium`/`low` confidence. |
| `(a) file:line` | Repo-relative POSIX path + line (or line range) of the primary site, plus every secondary site. Cite symbols, not just numbers. |
| `rule violated` | Exactly one of: an `AGENTS.md` invariant (section quoted), a `README.md` claim (quoted), a code contract/comment (quoted with its site), a parity claim, or a named general standard. |
| `what is wrong` | 2–4 sentences, mechanism only — dataflow in, wrong behaviour out. No adjectives, no "seems". |
| `trigger / reachability` | The exact precondition and who can reach it (boot, user action, crafted file, HTTP request, DOM event). State "on every boot" vs "only when X". |
| `(b) reproduction` | EITHER a paste-ready command run from the repo root with **expected vs observed** output, OR the explicit up-front marker `static-only, no repro` (§3.1) followed by a numbered reasoning chain where every step is a `file:line` a verifier can open. Either form must be sufficient to reach the same conclusion unaided. |
| `impact` | What a user/dev sees, and for how many users. If there is no observable impact, say so explicitly and use `low`. |
| `falsifier` | The specific observation that would prove this finding wrong (e.g. "if `safe_rel()` rejects `/` at the boundary, the sink is unreachable"). A finding whose falsifier cannot be stated is not a finding. |
| `history` | Duplicate/fixed elsewhere? Reference the other ID. Otherwise `new`. |
| `(d) regression class` | Exactly one of `regression-0.6.23` (behaviour differs from `v0.6.23`; add the introducing commit when cheap — `git log v0.6.23..HEAD --oneline -- <path>` or `git log --oneline -S<needle> -- <path>`), `pre-existing (<0.6.23)` (state the earliest evidence you have: the commit or the tag where it already existed), or `unknown` (say in one clause why it could not be dated). |

**Evidence prohibitions and drop rules** (these are hard):

- **Unfounded or non-reproducible claims must be DROPPED from the ranked list,
  never downgraded.** If a finding cannot be reproduced by an independent member
  it must not be published at any severity, including `low` — "keep it as a
  low-severity observation" is the exact failure mode this rule exists to stop.
  *Dropped ≠ hidden:* the claim stays in the record. The lane labels it up front
  (see §3.1), and t7 logs every claim it could not reproduce as
  refuted-with-evidence in `70-verification.md`, so the reader learns both that
  the question was asked and how it was answered. Silent omission of a filed
  claim is itself a process defect (reported to the captain, not ranked).
- Style, taste, naming, formatting and "I would have written it differently" are
  **not findings**; at most they go in a clearly separated, severity-less
  *Observations* appendix of the lane file, which the integrator must not rank.
- A hypothetical that requires an input **no code path can produce** is dropped,
  *unless* the input is reachable from a trust boundary (imported ZIP/JSON,
  HTTP request, DOM event, IndexedDB, FITS header) — then the block must show the
  full path from the boundary to the sink.
- Environment artifacts documented in `AGENTS.md` are **not** findings:
  `tmp_path`/WinError 5 fixture-cleanup errors under the repo-local
  `.pytest-tmp`, and the sandbox's named-pipe EPERM (`capture_output=True`,
  `... | Select-Object`), and `python -c`/heredoc quoting failures. Use
  `--basetemp C:\Users\<user>\AppData\Local\Temp\opencode\pt -p no:cacheprovider`
  and file-based probes instead.
- Do not quote more than ~10 lines of code per site; use `read` with
  `offset`/`limit` or `grep` counts. Do not paste whole files or raw greps.
- Do not report the same defect twice; if it spans lanes, file it once and mark
  it `XL-xx` with both lanes named.

### 3.1 No-repro (`static-only`) findings

A genuine defect may be provable by reading the code but not executable in this
environment (no network, no browser, an unreachable or must-not-mutate production
state). Such a claim is **filed, not hidden**: put the marker
`static-only, no repro` in the `(b) reproduction` field up front, make the
reasoning chain complete enough for a verifier to walk unaided, and add one clause
saying *why* no command can settle it ("requires the deployed tree, which this
review must not mutate").

Keeping it honest:

- A `static-only` finding is labelled as such in the lane file and in the §4/§10
  records; it is never presented as reproduced.
- It is **excluded from the ranked list** the integrator publishes at a severity.
  It may appear in a clearly separate *Unverified / static-only* section, where the
  level is shown as `claimed`, never as `verified`.
- t7 must still attempt reproduction and record the outcome with evidence:
  `CONFIRMED` when the static chain is airtight and matches the code as written,
  otherwise `REFUTED` with the reason. An unreproducible claim is reported as
  refuted-with-evidence — **never silently omitted**, and never quietly dropped
  from the lane file either.

---

## 4. Dedup / ID scheme

`<PREFIX>-<NN>`, `NN` zero-padded and unique **within** the lane file; every lane
reserves its prefix, so IDs are unique across the report.

| Prefix | Owner | Domain |
| --- | --- | --- |
| `PY-nn` | t2 py-reviewer | `app/`, storage/IO, untrusted path/import boundary |
| `CO-nn` | t3 core-reviewer | `core/` + baked trees + the baking/stub contract |
| `WE-nn` | t4 web-reviewer | `web/` shell, IndexedDB store, backup, cache tokens |
| `DE-nn` | t5 desktop-reviewer | `static/` shell, worker/async path, DOM contract |
| `TO-nn` | t6 tooling-reviewer | `tests/`, `scripts/`, release/deploy, repo hygiene |
| `XL-nn` | any lane (author = discoverer) | cross-lane / shared-contract defect needing ≥2 trees; body must name every lane involved |
| `CAR-nn` | assigned lane (see §6) | one row per documented carry-over item |

Heading form in the lane file: `### PY-03 — <title>`; the block fields must appear
in the §3 order so a reader (and t7) can diff blocks mechanically.
Machine-readable mirror in `07-findings.json`: one object per filed finding with
`{id, lane, title, severity_asserted, severity_verified, file, line, rule,
evidence_cmd, repro_class, regression, introducing_commit, verdict, verdict_note}`
(`repro_class` ∈ `repro|static-only`; `regression` ∈
`regression-0.6.23|pre-existing|unknown`; `verdict` ∈ `CONFIRMED|DOWNGRADED|
UPGRADED|REFUTED`).

---

## 5. Severity scale

Severity is assigned by **impact**, not by how hard the defect was to find. The
verifier may re-rank in either direction and must record the reason; a
disagreement is recorded, never averaged away.

| Level | Definition | Concrete example (from this repo's history) |
| --- | --- | --- |
| **blocker** | Breaks a release-time guarantee, a trust boundary, or pinned invariant in a *user-reachable* path; causes data loss/corruption, a security breach, or ships a wrong artifact. Release must not go out. | A crafted setup ZIP being an arbitrary-file-read/write primitive because `apply_import_zip` honours the bundle's `settings.image_dir`; an exe/`version.json` claiming a tag that never existed (the 0.6.0 precedent). |
| **high** | User-reachable incorrect behaviour, or a demonstrated contract/pinned-invariant violation with a plausible trigger, but no data loss or boundary breach. | The web chart passing `sunRaDec() * 15` (degrees as hours) so the Sun sat high all night; indexing `times_iso[end]` on the half-open clear window where `end == grid.length`. |
| **medium** | Real defect on a narrow or unusual path (specific input/timezone/mode), dev- or tooling-only impact, or a user-visible boundary case that an existing fallback contains. | Worker/sync `max_alt` differing by one 0.05° sample near a tie (DS4) — a ranking flip that is cosmetic; a guard that only checks the current baked-core dir. |
| **low** | No behavioural impact: hygiene, maintainability, documentation drift, dead/duplicated code, an untested export, a stale comment. | An export only reachable through an engine nobody runs (TS4); a comment describing the removed `fovOld*(1-w/W)` crop formula. |

Rules: no "informational" tier (that is what the Observations appendix is for);
a finding with **no** stated impact is `low` by construction; never inflate a
severity to force attention, and never deflate one to keep the report short.

---

## 6. Carry-over audit (mandatory, one row per item)

Every item below is documented as *remaining* in `AGENTS.md` §"Code review record
and status". The owner lane must resolve each to one of **CLOSED** (evidence:
`file:line` + the test that pins it), **STILL OPEN** (with severity + evidence),
or **SUPERSEDED** (the description no longer matches the code — correct the
record). A row is not complete without the reproducing command or the cited
lines.

| Item | Owner lane | Baseline description to check |
| --- | --- | --- |
| `CR2` | t3 (core), with t4/t5 on consumers | Malformed-horizon guards (all shipped producers normalize before preview) |
| `CR3` | t3 (core), with t4/t5 | FOV-edge half-bin (changes a rendering/scoring boundary = user-visible) |
| `DS4` | t5 (desktop) | Worker/sync `max_alt` (one-sample/0.05° near ties, cosmetic) |
| `DS5` | t5 (desktop) | Worker revive (sync fallback always planned) |
| `TL3` | t6 (tooling) | Catalog committed-change check |
| `TL4` | t6 (tooling) | `--specpath` + PyInstaller pin |
| `TL5` | t6 (tooling) | Stale `web/version.json` hard error |
| `TS4` | t6 (tooling) | Untested exports |
| `TS7` | t6 (tooling) | Fixture `has()` gating |
| `E15` | t4 (web), t6 cross-check | Per-module token discipline |
| `PY6` | t2 (python) | TLS-redirect hardening (same trust boundary, image bytes only) |
| `WB7` | t4 (web) | Bundle-version check (forward-compat choice) |

---

## 7. Lane coverage minimums

Each lane file must open with a **Coverage** table: what was examined (with the
exact commands / file list), and what was deliberately *not* examined with the
reason. Coverage claims are spot-checked by the verifier; a lane that claims
coverage it did not perform is reported to the captain as a process finding, not
as a product finding.

- **t2 Python (`10-python.md`)** — every `/api/*` route's validation and error
  path; `paths.safe_rel/safe_join/safe_token` behaviour on adversarial ids
  (`../`, absolute, separators, unicode, empty); `apply_import_zip` +
  `auto_backup` + the `image_dir_ignored` contract; `ingest.py` streaming and the
  1 GiB cap; `fits.py` `parse_ra_hours`/`parse_dec_deg` malformed input; the
  additive-migration rule in `database.py`; `images.py` cache/offline breaker and
  the TLS-redirect path (PY6). Evidence: targeted `pytest` runs + at least one
  adversarial probe per trust-boundary entry point.
- **t3 core (`20-core.md`)** — `astro.js` precession (Meeus ch.21 eq.21.4, middle
  rotation about **Y**), sun/moon, refraction; `planning.js` twilight anchored at
  the *site's* noon +30 h, `scrubWindowMs` degeneracy policy, `pickDarkWindow`
  fallback; `visibility.js` min-alt rule (`17 + 2*bortle`, explicit wins);
  `scoring.js` curves + `nightStats`; `horizon.js` D1 world bins, sky bands,
  `cropKeptBand`, `NO_BLOCK`; the baking contract (`build_core.py` +
  `check_core.py` purity/moved-concept/drift). Must run
  `node tests/js/reference_anchors.mjs` (or the pytest wrapper) and independently
  re-derive at least one published value by hand — not via the frozen fixtures.
- **t4 web (`30-web.md`)** — `clampSkyTime` at boot and on `refreshView`;
  `sunAltAz`/`moonAltAz` usage and `aboveHorizon`; panorama editor
  history/save/flush semantics and `HISTORY_LIMIT`; `webstore` rig FOV arcmin
  migration, sites/rigs/custom mirrors; `collectBackup`/`restoreBackup` atomicity
  and `hasImage` truthfulness; `CATALOG_TOKEN` + `catalog.manifest.json`; the
  per-module `?v=` token set (`app.js?v=60`, `astro.js?v=10`, `horizon.js?v=41`,
  `format.js?v=17`, `nightrank.js?v=7`, `webstore.js?v=20`, `style.css?v=16`,
  `themes.css?v=4`, core stub `?v=17`) against the actual files; progressive
  disclosure defaults. Evidence: `tests/js/web_backup.mjs`, `pano_ui.mjs`,
  `dom_handlers.mjs`, `python scripts/check_js.py`.
- **t5 desktop (`40-desktop.md`)** — `derive.js` window/index ranges and clipping;
  `planning_client` + `planning_worker` generation counters, cache keys,
  `max_alt`, worker kill/revive; `night.js` post-`await` `ctl === _nightCtl`
  discipline; `pano.js` silhouette/erase/`profileSegments` parity; skymap/skyview
  rendering; wizard hardening. Evidence: `tests/js/night_race.mjs`,
  `worker_lifecycle.mjs`, `worker_bridge.mjs`, `sync_cache_key.mjs`,
  `derive_window.mjs`, `scrub_degenerate.mjs`, `sky_band.mjs`, plus
  `python -m pytest tests/test_ui_invariants.py -q`.
- **t6 tooling (`50-tests-tooling.md`)** — the full suite **once**
  (`python -m pytest tests/ -q --tb=no --basetemp C:\Users\<user>\AppData\Local\Temp\opencode\pt -p no:cacheprovider`),
  `python scripts/check_js.py`, `python scripts/check_release.py`,
  `python scripts/pre_tag_check.py 0.6.24`; guard credibility (are the mutation
  proofs real and complete?); the release/deploy order and its pinning tests;
  docs-vs-reality (e.g. README's test count, AGENTS.md's token set, the baked-core
  retention policy); repo hygiene items in §1.1.

---

## 8. Seed hypotheses (report **only** with evidence — drop otherwise)

These are starting questions, not findings. A hypothesis that fails §3 stays out
of the ranked list.

- **H1 — baked-core N-1 retention.** `AGENTS.md` §"Baked-core retention policy"
  says to keep the current content-hashed dir **plus N-1** so a visitor holding a
  cached old stub still resolves its tree. Observed: `v0.6.23` shipped
  `web/core/79ad99ef15810ca2`, the fix commit `7e73d98` re-baked to
  `97c2e182fb0a5630`, and at `v0.6.24` only `97c2e182fb0a5630` is tracked
  (`git ls-tree v0.6.23 web/core` vs `v0.6.24`; `git ls-files web/core` = 9
  files, one dir). Same for `static/js/core/`. Owner: t6 (t3 cross-check).
  Reproduce: `git ls-tree --name-only v0.6.23:web/core` and
  `git ls-tree --name-only v0.6.24:web/core`. Decide whether the *deploy* still
  carries the old dir (a read-only FTP `list`/hash compare is enough) and whether
  `check_core.py`'s "current dir only" rule makes this a guard gap or an accepted
  policy change.
- **H2 — post-tag commits at HEAD.** `HEAD` is 2 commits past `v0.6.24`
  (`v0.6.24-2-g9596878`). Check the release-order rules (curated changelog entry
  inside the tagged commit; `check_release.py` vs `git describe` grammar) still
  hold at this HEAD, and that the tagged commit itself contains the CURATED
  entry. Owner: t6.
- **H3 — documentation counts.** README/AGENTS claim 436 tests; the token set and
  the "current (0.6.24)" list are quoted above. Owners: t6 (count), t4 (tokens).
- **H4 — the 12 carry-over rows.** Treat the AGENTS.md sentence as a *claim to
  test*, not a fact; several were written before 0.6.21–0.6.24 shipped and may be
  SUPERSEDED. Owner: the lanes in §6.
- **H5 — repo hygiene.** Six root-level scratch scripts + one scratch JSON are
  committed (`check_unmatched*.py`, `match_final.py`, `match_popularity.py`,
  `verify_matches.py`, `debug_matches.py`, `popularity_snapshot.json`). Determine
  whether anything references them (grep) and whether they ship. Owner: t6, `low`
  unless something references them.

---

## 9. Process rules (read-only review)

1. **No production code changes; every member may write only under
   `reviews/0.6.24/`.** No member may create, modify or delete anything outside
   `reviews/0.6.24/`. No edits to `app/`, `core/`, `web/`,
   `static/`, `tests/`, `scripts/`, `landing/`, `README.md`, `AGENTS.md`,
   `build.ps1`, `main.py` or any config. No `git add`/`commit`/`tag`/`checkout`/
   `stash`/`gc`; no `scripts/build_core.py`; no `build.ps1`; no
   `scripts/make_release.py`/`build_web.py`; no FTP write of any kind.
2. Running the existing read-only guards/engines/tests **is** in scope
   (`pytest`, `node tests/js/*.mjs`, `scripts/check_*.py`,
   `scripts/check_browser.py --web|--desktop`). Prefer `--basetemp` outside the
   repo and accept the documented environment artifacts without filing them.
3. `.agent-teams/` is read-only diagnostics; mutate team state only through the
   `agent_teams_*` tools.
4. A **blocker-severity** security/trust-boundary/data-loss finding must be
   messaged to the captain immediately (in addition to the lane file) — do not
   wait for the report.
5. Findings must not be "fixed" by the finder. Evidence that a fix would be
   trivial is welcome in `impact`, but the review-only rule is absolute.
6. Every lane file must end with an attestation line:
   `git status --porcelain` output at the end of the lane's work (expected:
   `?? .agent-teams/` plus `?? reviews/`), proving the review was read-only.
7. Context discipline: no whole-file dumps, no build logs, no raw grep output in
   chat; write findings to files and reference paths.

---

## 10. Downstream contracts (t7/t8/t9)

- **t7 verifier (`70-verification.md`, `07-findings.json`)**: reproduce each filed
  finding **independently** (open the code, do not trust the lane's quote) — for
  `static-only` claims, walk the reasoning chain step by step and try to break it —
  then return exactly one verdict per finding — `CONFIRMED`, `DOWNGRADED`,
  `UPGRADED` or `REFUTED` — with the command/output and a one-line reason, plus
  the verified `repro_class` and `regression` fields (§4). Refuted findings are
  removed from the ranked report and listed only in the refutation log, each with
  the evidence that refuted it; a filed claim is **never silently omitted**, and
  every `static-only` claim appears in the log or in the separate unverified
  list, not in the ranked list at a severity. Also spot-check each lane's Coverage
  table against the lane file's actual content and record any honesty gap for the
  captain (including a silent omission by a lane).
- **t8 integrator (`REVIEW-0.6.24.md`)**: severity-ranked report containing the
  scope + method, the coverage matrix (tree × examined × not examined), the
  ranked findings with their verification verdicts, the §6 carry-over table, a
  refutation summary (counts), the separate *Unverified / static-only* section
  (§3.1, `claimed` severity only), residual risk / unknowns, and the read-only
  attestation. Ranking is by *verified* severity; the integrator may not re-rank
  without recording the verifier's verdict beside it, and may not drop a filed
  claim from the record — refuted and static-only claims stay visible in their own
  sections.
- **t9 review gate (this role)**: the report passes only if every ranked finding
  has a verified reproduction, no `static-only` or refuted claim is ranked at a
  severity, every filed claim is accounted for somewhere in the report (ranked,
  unverified, or refuted-with-evidence), the carry-over table has all 12 rows
  resolved, no claim exceeds its evidence, and the read-only attestation holds.
