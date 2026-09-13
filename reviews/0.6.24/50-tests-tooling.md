# 50 — Tests, guard scripts and the release/deploy pipeline (lane t6)

Lane owner: **tooling-reviewer** · task `t6` · attempt `1` (`3b4b8180-8f5d-478f-ab1d-724a3c2896d9`)
Subject: the NightSeam working tree at **HEAD `9596878`** (`git describe` = `v0.6.24-2-g9596878`).
Charter of record: `reviews/0.6.24/00-charter.md` (t1). Contract for this lane: t6
("Review lane: tests, guard scripts and the release/deploy pipeline"), deliverable
`reviews/0.6.24/50-tests-tooling.md`. The t6 task contract's acceptance check names
this file and is canonical (captain, 2026-09-12): the charter §1.3 layout lists the
same lane file as `05-tooling.md`, but only `50-tests-tooling.md` exists — there is
no duplicate and no `05-tooling.md`.

**Read-only.** Nothing outside `reviews/0.6.24/` was created, modified or deleted
(attestation in §10). Every reproduction below is a command that was actually run
from the repo root in this session, or a `file:line` chain a verifier can open.

---

## 1. Coverage

### 1.1 Examined (what, and with which command)

| Area | Examined | Command / site |
| --- | --- | --- |
| Whole Python suite, once, with the documented workaround | all 437 collected tests | `python -m pytest tests/ -q --tb=no --basetemp C:\Users\<user>\AppData\Local\Temp\opencode\pt -p no:cacheprovider` |
| Same suite, second basetemp location (mechanism check) | all 437 | `... --basetemp <workspace>\AstroPilot-local\logs\pt-review` |
| Collected-test inventory | 437 (`--collect-only -q`) | `python -m pytest tests/ --collect-only -q -p no:cacheprovider` |
| Guard-pin modules (release check, pre-tag, deploy order, encoding, syntax, catalog token, browser gate) | 99 outcomes | `python -m pytest tests/test_release_check.py tests/test_pre_tag_check.py tests/test_deploy_order.py tests/test_encoding.py tests/test_js_syntax_check.py tests/test_cache_tokens.py tests/test_browser_gate.py -q --tb=line --basetemp ...\pt3 -p no:cacheprovider` |
| Order independence (4 modules, two orders) | 38 tests, twice | `python -m pytest tests/test_ingest.py tests/test_fits.py tests/test_catalog.py tests/test_fov.py -q` and the reverse order |
| JS guard bundle | all 6 hard checks + the heuristic | `python scripts/check_js.py` |
| Release integrity | describe + baked + web + changelog + stage | `python scripts/check_release.py` |
| Pre-tag gate | 0.6.24 + a bogus version | `python scripts/pre_tag_check.py 0.6.24` (and `9.9.9` by inspection of the same function) |
| Changelog curation gate | all tags | `python scripts/build_changelog.py --check` |
| Browser gate (web target) | one launch attempt | `python scripts/check_browser.py --web` |
| Guard internals, read line-by-line | `check_js.py`, `check_js_imports.py`, `check_dom_ids.py`, `check_js_syntax.py`, `check_encoding.py`, `check_catalog_token.py`, `check_core.py`, `check_js_defs.py`, `check_release.py` (927 L), `pre_tag_check.py`, `build_changelog.py`, `make_release.py`, `build.ps1`, `web/build_web.py`, `web/ftps_deploy.py`, `build_core.py` (via `check_core`) | `read`/`grep` |
| Test independence + mutation safety | `tests/conftest.py`, `tests/_util.py`, the 6 mutation suites, `tests/browser/harness.py` | `read`/`grep` |
| Doc-vs-reality | `AGENTS.md` §Commands, §Web cache-busting, §Baked-core retention, §Release order | `AGENTS.md:296-375, 490-519` |
| Release-line git facts | tags, post-tag commits, token values at the tag, baked-core dirs | `git log/show/grep/ls-tree/diff` (no pipes) |
| Repo hygiene (H5) | root scratch names vs `.gitignore` | `git ls-files`, `git check-ignore -v`, `git status --porcelain` |

Machine-readable evidence: `reviews/0.6.24/evidence/probe_tooling.py` (sections A–D)
and its captured output quoted in §2.3, §3 and the findings below. It writes only
inside `reviews/0.6.24/evidence/`.

### 1.2 Deliberately not examined (and why)

| Not examined | Reason |
| --- | --- |
| `dist/NightSeam.exe`, the packed/browser desktop target | No exe is present in this checkout (and the artifact is not the review subject). `check_browser.py --desktop` therefore cannot run here; the web target was attempted instead. |
| The deployed `/astro` tree, FTP credentials | Out of scope per charter §1.2; no FTP access was used. |
| `python scripts/build_core.py`, `build.ps1`, `make_release.py`, `build_web.py` **execution** | Forbidden by charter §9.1 (they write the tree / bake artifacts). Their guarantees were judged by reading + their pinning tests. |
| `scripts/adv_popularity.py`, `scripts/match_popularity.py` internals | Gitignored local popularity-matcher scratch (`.gitignore:25-32`); not shipped, no runtime contract. |
| `tests/browser/web_suite.py`/`desktop_suite.py` check bodies | t4/t5 lane scope (shell behaviour); only their registration + the harness contract were audited here (t6 = the gate's plumbing). |
| Per-module cache-token *semantics* (which behaviour changed) | t4's lane (`WE`) and the E15 cross-check; this lane contributes the release-pipeline evidence (the `XL-01` hand-off in §5, the E15 row in §6). |

---

## 2. The test suite: the required run, exact result

### 2.1 The documented command (run once, verbatim)

```text
$ python -m pytest tests/ -q --tb=no --basetemp C:\Users\<user>\AppData\Local\Temp\opencode\pt -p no:cacheprovider
...EEEE... (progress line: only '.' and 'E' characters - no 'F' anywhere)
=========================== short test summary info ===========================
ERROR tests/test_advanced_catalog.py::test_db_seeds_advanced_catalog - Permis...
... (142 ERROR lines, all "PermissionError: [WinError 5]")
295 passed, 143 warnings, 142 errors in 35.19s
[exit code: 1]
```

* **295 passed, 142 errors, 0 failed** — the exit status is 1 because of the errors,
  and **not one test failed an assertion** (the progress output contains no `F`).
* Every one of the 142 errors is `PermissionError: [WinError 5]` raised while
  pytest's `tmp_path` fixture is being set up (traceback:
  `_pytest/pathlib.py rm_rf -> shutil.rmtree -> os.rmdir('\\?\...\pt')`), i.e. the
  documented sandbox environment artifact (charter §3, `AGENTS.md:361-364`), not a
  product signal.
* `python -m pytest tests/ --collect-only -q` → **`437 tests collected in 0.76s`**.

### 2.2 The documented workaround no longer restores a clean run (environment)

Retry with the basetemp **inside** the workspace (the location `AGENTS.md:361-364`
calls the fix):

```text
$ python -m pytest tests/ -q --tb=no --basetemp <workspace>\AstroPilot-local\logs\pt-review -p no:cacheprovider
[progress: identical 295-passed/142-error shape]
PermissionError: [WinError 5] ... '<workspace>\AstroPilot-local\logs\pt-review'
  at _pytest/tmpdir.py:337 pytest_sessionfinish -> cleanup_dead_symlinks -> root.iterdir()
[exit code: 1]
```

So in **this** sandbox snapshot the basetemp location is not the deciding factor:
pytest's own basetemp create/cleanup is denied, and the same 142 `tmp_path` tests
error wherever the basetemp lives. A plain probe of the same operations under
`reviews/0.6.24/evidence/` succeeded (`mkdir: ok / iterdir: ok / rmdir: ok` —
`probe_tooling.py` section D), so this is specific to pytest's temp-path handling
here, not a general loss of write access. **Recorded as the documented environment
artifact; no finding is filed for it** (charter §3).

Consequence for reading this lane's numbers: the 142 `tmp_path`-using tests could
not be executed in this session, so their assertions are unverified *here* (they
are pinned and were green in the suite's last clean run, per `AGENTS.md`). The 295
that ran include the whole non-`tmp_path` part of the suite.

### 2.3 Targeted re-run of the guard-pin modules

```text
$ python -m pytest tests/test_release_check.py tests/test_pre_tag_check.py tests/test_deploy_order.py \
    tests/test_encoding.py tests/test_js_syntax_check.py tests/test_cache_tokens.py tests/test_browser_gate.py \
    -q --tb=line --basetemp C:\Users\<user>\AppData\Local\Temp\opencode\pt3 -p no:cacheprovider
<workspace>\AstroPilot-local\tests\test_encoding.py:26: AssertionError: reviews/0.6.24/evidence/_guard_probe.py: starts with a UTF-8 BOM
1 failed, 97 passed, 1 warning, 1 error in 17.02s
```

* `tests/test_release_check.py` (73 tests), `test_pre_tag_check.py`,
  `test_deploy_order.py`, `test_js_syntax_check.py`, `test_browser_gate.py` — all
  pass. `test_cache_tokens.py`'s mutation test is the 1 error (`tmp_path`).
* The 1 **failure** is `test_encoding.py`, caused by a *peer lane's* evidence file
  `reviews/0.6.24/evidence/_guard_probe.py` (first bytes `EF BB BF`), i.e. the
  encoding guard doing its job on a non-shipped review artifact → TO-11.
  **Timing note (added later):** that file was cleaned by the captain (with the other
  core-lane probe scripts), and the verifier's `v7-*` dumps produced a second wave;
  the captain cleaned batches of those too, but the evidence directory was still being
  written to while I re-checked, so six `check_encoding.py` runs gave `FAIL (11)` →
  `(15)` → `(16)` → `(23)` → `(31)` → `(28 file(s))` — unstable, not monotone — and the
  guard was red at my hand-off (my own files are clean). TO-11 now carries a
  **deterministic** reproduction that does not depend on any leftover artefact
  (`probe_tooling.py` section E, synthetic root).

---

## 3. Guard credibility — per-script classification

Rule applied: a guard is **enforcing** only if a mutation (or an observed live
failure) shows it goes red on the thing it claims to catch; a statement in a
docstring/comment with no such proof is **asserted**.

| Script | Claim (site) | Mechanism that enforces it | Verdict | Proof |
| --- | --- | --- | --- | --- |
| `scripts/check_core.py` | baked trees == `core/`, one hash dir, stubs+token, purity, moved concepts, retired Python modules (`check_core.py:95-209`) | hashes + dir equality + regex scans, printed, exit 1 (`main` L212-217) | **Enforcing** | `tests/test_core_drift.py:101-173` mutates a staged **copy** in 8 ways (a–h: core byte, baked byte, stale stub, token, arrow shell, retired module, `async def`, comment-separated arrow) and requires `scan()` to fail; `:47-48` pins the real tree clean. Ran green in the guard-pin run. |
| `scripts/check_js.py` | "runs all of them and exits non-zero on hard failures" (`check_js.py:1-9,26-36`) | sums the 6 hard checkers' return codes, prints FAIL, returns 1 | **Enforcing** (aggregator) | `python scripts/check_js.py` → exit 0 with all six OK; `tests/test_js_syntax_check.py:210-211` pins the syntax checker's wiring. Docstring says "the four static/js checkers plus the encoding guard" while **six** run (observation O-1). |
| `scripts/check_js_imports.py` | broken relative imports / missing named exports (`:1-9,92-99`) | path resolution against the discovered set + export sets | **Enforcing for its class** | Ran: `checked 58 js files, 0 broken import(s)`. **No mutation proof** in `tests/` (TO-05). Heuristic gap: a `import def, {a} from …` clause is not checked because `named_imports` requires the clause to start with `{` (`:63-74`) (O-2). |
| `scripts/check_dom_ids.py` | every `$('#id')` exists in that app's HTML (`:1-4,48-57`) | HTML id set vs JS-referenced set, `IGNORED`/dynamic-id whitelist (`:25-27,45-46`) | **Enforcing for its class** | Ran: desktop "all 200/182", web "all 44/113". **No mutation proof** (TO-05). |
| `scripts/check_js_syntax.py` | "every module that actually ships … is caught" (`:1-8`) | `node --check` on a temp `.mjs` copy, exit 1 on any error | **Enforcing when node runs**; **skip when node is missing** (`:233-240` return 0) | `tests/test_js_syntax_check.py:78-131` (duplicate `const`, valid module, directory, real tree) mutate temp files. Ran: `checked 31 js module(s), 0 syntax error(s)`. Skip behaviour is pinned as intended (`:170-189`) → TO-03; scope excludes `core/` + both baked trees (`ROOTS` L37) though `AGENTS.md:369-370` claims they are checked → TO-06. |
| `scripts/check_encoding.py` | non-UTF8, BOM, C1, cp1252 mojibake (`:1-18,51-75`) | byte decode + marker tables | **Enforcing** | Fired **live** in this session, repeatedly: first `tests/test_encoding.py` failed on `reviews/0.6.24/evidence/_guard_probe.py` ("starts with a UTF-8 BOM"), then `python scripts/check_encoding.py` re-failed on the verifier's `v7-*` dumps — `FAIL (11)`/`(15)`/`(16)`/`(23)`/`(31)`/`(28 file(s))` across runs while that directory was still being written (unstable both ways; captain cleaned batches, new files kept appearing) — and it even caught my own probe source once (fixed). TO-11 records a deterministic synthetic-root reproduction (`probe_tooling.py` section E) instead of depending on leftovers. The exact behaviour of `main()` on the real tree is otherwise only asserted (`tests/test_encoding.py:24-26`), no mutation proof for the mojibake/C1 branches (TO-05); its repo-wide scope includes `reviews/` (TO-11). |
| `scripts/check_catalog_token.py` | `CATALOG_TOKEN` ↔ manifest sha/token ↔ one fetch site (`:37,53-83`) | regex + sha256; exit 1 | **Enforcing** | `tests/test_cache_tokens.py:64-101` proves by mutation on copies: a bare catalog change fails, a matched token+manifest bump passes, the real tree is asserted unchanged (`:98-101`). Ran: `check_catalog_token: OK`. The third, HEAD-relative branch (`:85-93`) is **untested and silently skipped** when git cannot be run (`:40-45`) → TO-04 (TL3). |
| `scripts/check_js_defs.py` | heuristic candidates only, always exit 0 (`:1-5,73-78`) | none (by design) | **Asserted by design — no claim broken** | Ran: `done, 10 candidate(s)` (e.g. `planning_client.js:43 Worker()`, `planning_worker.js:164 topAt()`) and `check_js: OK`. AGENTS documents it as review-only. The 10 candidates are heuristic false positives (DOM/JS builtins are whitelisted; see O-3 for the two worth a human look). |
| `scripts/check_release.py` | artifacts agree with `git describe` (`:1-67`) | collected `State` + pure `evaluate()` → ERROR/WARNING, exit 1 on any ERROR (`:141-157,857-908`); `check_core_findings` blocks staging too (`:876-889`) | **Enforcing** | 73 tests in `tests/test_release_check.py` pass (state-level mutation of every branch). Live run at HEAD: exit 1 with exactly 3 ERRORs — `[tree] HEAD is not exactly a tag`, `[baked] … '0.6.24' but git describe says '0.6.24-2-g9596878'`, `[stage] dist/release/version.json says '0.6.24'` — the designed refusal at a non-tag HEAD + a stale local stage (not a defect; §7 H2). `git()` has a no-pipe file fallback (`:305-333`) and it worked here. |
| `scripts/pre_tag_check.py` | exits 0 only when CURATED has the version (`:1-13,37-48`) | membership test in `build_changelog.CURATED`, exit 1/2 | **Enforcing** | `python scripts/pre_tag_check.py 0.6.24` → `pre_tag_check: OK` (exit 0); `tests/test_pre_tag_check.py:29-43` pins the failure and usage exit codes. |
| `scripts/build_changelog.py --check` | non-zero for release tags newer than the newest curated entry (`:187-222`) | `split_uncurated` + blocking count, exit 1 | **Enforcing** | Ran: `curation check: OK - every release after 0.6.24 has a curated summary` (exit 0). Helpers pinned by `tests/test_release_check.py` (`split_uncurated`, `report`, `build_entries`); the CLI exit code itself is not pinned (O-4). |
| `scripts/make_release.py` | refuses to stage anything when the artifacts disagree (`:66-100`) | calls `evaluate(collect(...))` + `check_core_findings` before staging, aborts on ERROR (`:74-80`) | **Enforcing** | `tests/test_release_check.py:795-811` proves `run_check` consults `check_core_findings` (FIX-9) by monkeypatch. Minor: `assert CHECK_ROOT == ROOT` (`:52`) is stripped under `python -O` (O-5). |
| `web/build_web.py version` | refuses to stamp a guessed version (`:56-80`) | non-zero `git describe` → `SystemExit` | **Enforcing, with a documented environment limit** | Uses `capture_output=True` with **no** file fallback (`:60-63`); its docstring (`:16-18`) documents that the sandbox may deny it. `catalog` is the deterministic data generator (t4 lane for byte-identity). |
| `web/ftps_deploy.py::upload_order` | HTML entry point uploaded last (`:73-86`) | `uploadmany` sorts by it (`:179`), `uploadtree` sorts the top level by it (`:190`) so `index.html` is the last STOR of the tree; `check_placeholders` refuses unfilled pages (`:104-126`) | **Enforcing** | `tests/test_deploy_order.py:20-39` pins the key ordering and that `index.html` sorts last in `web/` and `landing/`, `:42-46` the skip set. Not pinned: that `main()` *uses* the key (the test re-sorts itself) — O-6. Recursion uses plain `sorted` (`:232`), harmless for the current trees (no nested `index.html`) — O-6. |
| `build.ps1` | refuses a dirty/off-tag bake unless `-AllowDirty`; verifies the bake stuck; exe newer than bake; loud pip failure (`:22-31,142-201`) | exit-code checks, string verification, mtime comparison, `throw` | **Enforcing by construction, unverified by tests** | No automated test drives `build.ps1` (it *is* the build). The gaps that matter are TL4 → TO-08: no `--specpath` (`:179-187`) so PyInstaller writes the tracked `NightSeam.spec` into the repo root, and `requirements-dev.txt:5` pins only `pyinstaller>=6.0`. |

### 3.1 Mutation-proof coverage (the lane's core question)

| Guard | Mutation proof | Completeness |
| --- | --- | --- |
| `check_core.py` | `tests/test_core_drift.py:101-173`, 8 tamper classes + clean real tree | complete for every claimed class |
| `check_js_syntax.py` | `tests/test_js_syntax_check.py:78-131` (3 checks on temp files) + the skip paths `:170-189` | complete |
| `check_catalog_token.py` | `tests/test_cache_tokens.py:64-101` — token/manifest/sha only | the HEAD-relative branch is never exercised (TO-04) |
| `check_release.py` | `tests/test_release_check.py` — one test per branch (state objects), `:795-811` for the make-release wiring | complete |
| `check_encoding.py` | real-tree assertion only (`tests/test_encoding.py:24-26`) | no proof that the BOM/C1/mojibake branches fail a crafted file (TO-05) |
| `check_js_imports.py`, `check_dom_ids.py` | none | detection logic could regress silently (TO-05) |
| `check_js_defs.py` | n/a (always exit 0) | by design |
| `pre_tag_check.py`, `build_changelog.py`, `ftps_deploy.upload_order` | yes, see the table above | complete |

---

## 4. Test independence

* **User profile:** `tests/conftest.py:12-29` installs an autouse fixture that
  monkeypatches `app.paths.default_archive_dir` into `logs/.pytest-default-archive`.
  No `expanduser`/`Path.home`/`~` reference exists anywhere under `tests/` (grep: 0
  hits). No test can write into the developer's Documents folder.
* **Network:** the only `urllib`/`socket` uses are `tests/test_images.py`
  (monkeypatched `urlopen` + fabricated `HTTPError`, `:167-181,234`),
  `tests/test_main.py` (loopback port probing, `:20-21,67-69`) and
  `tests/browser/harness.py` (`:37,84-95`, a local static/API server; not collected
  by pytest). No test fetches the internet; `create_app(db, prefetch=False)` keeps
  the image-prefetch thread out of the API tests.
* **Execution order:** no session/module-scoped mutable fixture exists in
  `tests/conftest.py` (one function-scoped autouse fixture), `pytest.ini` carries
  only `addopts = --basetemp=.pytest-tmp`, and no ordering/randomisation plugin is
  installed. Empirically, four unrelated modules run in both orders gave identical
  results (`38 passed in 2.61s` / `38 passed in 0.56s`). A second *full* run was
  impossible in this sandbox (§2.2), so this is structural + targeted evidence, not
  a full permutation proof.
* **Mutation safety:** every mutation suite stages copies — `test_core_drift.py:75-98`
  (whole staged tree), `test_reference_anchors.py:84-105` (`copytree` of `core/`),
  `test_core_p_mutation.py` / `test_scoring_parity.py` (`copytree`), `test_d1_contract.py:38-45`
  (mutated module written to `tmp_path`), `test_cache_tokens.py:71-76` (copies, then
  asserts the real files unchanged at `:98-101`). None can corrupt the working tree.
* **Environment dependency:** `pytest.ini`'s `addopts = --basetemp=.pytest-tmp` makes
  every plain `pytest` run create a repo-root directory (gitignored). Under this
  sandbox that is exactly the documented failure mode (§2.2).

---

## 5. Findings

Severity by the charter §5 scale; `confidence` is my own confidence in the
reproduction, not in the severity.

One further candidate — the unenforced web per-module cache-token rule and the
v0.6.24 tag that violated it — is **not filed again here**: the web lane discovered
and filed it as `XL-01` in `reviews/0.6.24/30-web.md` (t4). Charter §4 forbids
reporting one defect twice, so this lane contributes its release-pipeline evidence
as the cross-lane hand-off at the end of this section and resolves the `E15`
carry-over row against that single filing (§6).

### TO-01 — The baked-core N-1 retention policy cannot be satisfied: the guard requires exactly one hash dir

* **lane / severity (asserted) / confidence:** t6 / **medium** / high
* **file:line:** `scripts/check_core.py:119-125` (primary); `AGENTS.md:515-518`
  (rule); `AGENTS.md:509-514` (the same paragraph's token register); observed tree:
  `git ls-files web/core static/js/core` → 9 files, one dir.
* **rule violated:** `AGENTS.md` §"Versioning and release" — *"**Baked-core retention
  policy:** keep the CURRENT content-hashed dir plus the immediately previous one
  (N-1) so a visitor holding a cached old `core.js` stub still resolves its tree;
  remove anything older at the next re-bake. `check_core.py` only requires the
  current dir."*
* **what is wrong:** the guard does not "only require the current dir" — it demands
  **exactly** the manifest hash on each side: `dirs = sorted(d.name for d in
  dest_root.iterdir() if d.is_dir())` then `if dirs != [hash_]: problems.append(...)`.
  Following the documented policy (current + N-1) therefore fails `check_core.py`,
  which is wired into `check_js.py` and `check_release.py`, i.e. the documented
  retention step blocks the release path. Either the guard or the policy is wrong;
  the shipped history follows the guard (v0.6.24 tracks `97c2e182fb0a5630` only).
* **trigger / reachability:** every re-bake. A maintainer who does what
  `AGENTS.md:515-517` says and leaves N-1 behind gets
  `web: baked hash dirs [...] != ['97c2e182fb0a5630']` and `check_js: FAIL` / a
  release-check ERROR on every subsequent run.
* **reproduction (ran, paste-ready):**
  ```text
  $ python reviews/0.6.24/evidence/probe_tooling.py      # section B
  == B) N-1 retention vs check_core.py ==
    with current 97c2e182fb0a5630 + N-1 79ad99ef15810ca2 present:
      web: baked hash dirs ['79ad99ef15810ca2', '97c2e182fb0a5630'] != ['97c2e182fb0a5630']
    problem count: 1
    after removing the N-1 dir: 0 problem(s)
  ```
  (The probe stages a copy under `reviews/0.6.24/evidence/_probe_core_n1/`; the real
  `web/` is untouched.) Git history, no pipes:
  ```text
  $ git ls-tree --name-only v0.6.23:web/core        -> 79ad99ef15810ca2
  $ git ls-tree --name-only v0.6.24:web/core        -> 97c2e182fb0a5630
  $ git ls-files web/core static/js/core            -> 9 files, 97c2e182fb0a5630 only
  ```
* **impact:** (a) the documented release step is unusable — a doc/guard contradiction
  any maintainer hits; (b) the N-1 directory the policy exists for is **not**
  present on either side, so a returning web visitor whose browser holds the old
  `core.js?v=16` stub (pointing at `./core/79ad99ef15810ca2/index.js`) gets a 404 for
  the module tree after a re-bake — the exact scenario the policy names. Web-only,
  returning visitors only, but it is a "the app does not load" surface.
* **falsifier:** if `check_core.py`'s dir test were `hash_ in dirs` (or the policy
  were reworded to "one dir only"), this finding is wrong. Open `:123-125` — it is
  `!=`.
* **history:** new. Related to `XL-01` (filed by t4 in `30-web.md`; same cached-stub
  surface), different root cause.

### TO-02 — The browser gate's exit-2 contract is bypassed when the Playwright driver cannot start

* **lane / severity (asserted) / confidence:** t6 / **medium** / high
* **file:line:** `tests/browser/harness.py:354` (primary), contract at
  `tests/browser/harness.py:320-325` and `scripts/check_browser.py:18-19`
  (`Exit codes: 0 pass, 1 failed check(s), 2 infrastructure could not start
  (browser, static server or packed exe).`).
* **rule violated:** the documented exit-code contract just quoted, plus
  `AGENTS.md:380-381` — *"A browser that cannot launch is a HARD failure (exit 2),
  never a skip"*.
* **what is wrong:** the `try` that converts target-start failures into exit 2 wraps
  the static/desktop **servers** only (`:337-350`). `sync_playwright()` — the
  Playwright driver subprocess — is entered at `:354`, and only the *subsequent*
  `p.chromium.launch()` has an exit-2 handler (`:355-360`). When the driver itself
  cannot be started, the exception propagates out of `run()` as an unhandled
  traceback: the process exits **1**, which the contract defines as "failed
  check(s)". The gate still fails (no false pass), but the failure class — and the
  documented signal the release checklist relies on — is wrong.
* **trigger / reachability:** any environment where the Playwright driver cannot
  spawn (restricted token, broken install, missing browser bundle). Reproduced here;
  no user action needed — it is the first thing `check_browser.py` does.
* **reproduction (ran, paste-ready):**
  ```text
  $ python scripts/check_browser.py --web
  ...
  File ".../tests/browser/harness.py", line 354, in run
      with sync_playwright() as p:
  File ".../playwright/_impl/_transport.py", line 120, in connect
      self._proc = await asyncio.create_subprocess_exec(...)
  File ".../asyncio/windows_utils.py", line 144, in __init__
      stdin_rh, stdin_wh = pipe(overlapped=(False, True), duplex=True)
  PermissionError: [WinError 5] Zugriff verweigert
  ```
  (Process exit code 1; `check_browser FATAL: …` is never printed.)
* **impact:** a release engineer, or a CI wrapper keyed on the documented exit
  codes, misclassifies "the browser infrastructure is unavailable" as "a product
  check failed", and gets a stack trace instead of the FATAL line. Tooling-only, but
  on the release checklist path.
* **falsifier:** if a higher-level handler converted this to exit 2 (there is none:
  `scripts/check_browser.py:73` returns `harness.run(...)` directly), or if
  `sync_playwright()` raised something the `except Exception` at `:344` could see
  (it cannot — the call is after that block), the finding is wrong.
* **history:** new. `tests/test_browser_gate.py:56-60` "pins" this contract by
  grepping the source text (TO-05).

### TO-03 — `check_js_syntax.py` reports OK (exit 0) when node is missing, contradicting the repo's missing-node rule

* **lane / severity (asserted) / confidence:** t6 / **low** / high
* **file:line:** `scripts/check_js_syntax.py:233-240` (primary; also its docstring
  `:18-21`), `scripts/check_js.py:30` (it is counted as a hard check),
  `AGENTS.md:380-381` (rule), `tests/test_js_syntax_check.py:170-189` (the skip is
  pinned as intended).
* **rule violated:** `AGENTS.md` §"Commands / Browser gate" — *"A browser that cannot
  launch is a HARD failure (exit 2), never a skip - **same rule as a missing
  node**."* Every other node-dependent harness obeys it: `test_reference_anchors.py:35-37`,
  `test_core_fixtures.py:25-27`, `test_core_time.py:70-72`, `test_core_p_mutation.py:24-26`,
  `test_d1_contract.py:19-21`, `test_js_behaviour.py:19-21`, `test_scoring_parity.py:21-23`
  and `test_js_parity.py:26-28` all `pytest.fail("node is not installed …")`.
* **what is wrong:** on a machine without node, `check_js_syntax.main` prints
  `node not installed - syntax check skipped` and returns 0, and `check_js.py` then
  reports `check_js: OK`. The only JS *parser* in the guard bundle silently does
  nothing while the aggregate guard claims success.
* **trigger / reachability:** a node-less dev/CI machine (`node` not on PATH, or
  `node --version` failing). Reachable on every fresh agent box that has not
  installed node.
* **reproduction:** `python -m pytest tests/test_js_syntax_check.py -q -k skips` →
  passes: the tests assert `code == 0` and `"skipped" in out`
  (`tests/test_js_syntax_check.py:170-189`). Direct: with node removed from PATH,
  `python scripts/check_js.py` exits 0.
* **impact:** a syntax error in a shipped module can reach the working tree and even
  a release on such a machine, with all guards green. Dev/tooling-only (the official
  workflow machines have node), hence low.
* **falsifier:** if `check_js_syntax.main` returned non-zero (or `check_js.py`
  treated the skip as a failure), the finding is wrong — open `:233-240`: it returns 0.
* **history:** new; the AGENTS sentence is the standing rule, the checker's own
  docstring is the conflicting contract. Not filed by any earlier review record.

### TO-04 — `check_catalog_token.py`'s committed-change branch is unproven and silently no-ops when git is unusable (TL3)

* **lane / severity (asserted) / confidence:** t6 / **low** / high
* **file:line:** `scripts/check_catalog_token.py:85-93` (the branch),
  `:40-50` (`_git`/`_git_ok` swallow every failure), `tests/test_cache_tokens.py:64-101`
  (the mutation proof that never reaches it).
* **rule violated:** `AGENTS.md:503-506` — *"Enforced by `scripts/check_catalog_token.py`,
  wired into `scripts/check_js.py`, and pinned by `tests/test_cache_tokens.py`
  (mutation-tested)"*, and the carry-over row `TL3` (`AGENTS.md:454`).
* **what is wrong:** the branch that compares the tree against `HEAD`
  (`git diff --quiet HEAD -- web/catalog.json`; if the catalog differs, require
  `CATALOG_TOKEN` in the app.js diff) is the only check that catches *"manifest bumped,
  token not"*. Its mutation proof never runs it: `tests/test_cache_tokens.py:74-76`
  redirects `APP`/`CATALOG`/`MANIFEST` to copies but leaves `ROOT` real, so the git
  command looks at the **real, clean** repository and returns "unchanged". And if git
  is missing/denied, `_git` returns `None` (`:44-45`) → `_git_ok()` False → the whole
  branch is skipped with no message, so the guard prints OK without it.
* **trigger / reachability:** a contributor who updates `web/catalog.json` + the
  manifest sha but forgets `CATALOG_TOKEN` (passes the sha check, ships a stale
  token), on a machine/CI where git is unavailable or the helper's first attempt
  fails.
* **reproduction:** `python reviews/0.6.24/evidence/probe_tooling.py` section A —
  in this environment `_git(["rev-parse","--is-inside-work-tree"])` → `rc=0
  out='true'`, `_git_ok() -> True`, `scan() -> []`. So the branch *is* reachable here;
  the defect is that nothing pins it and that its absence is silent. Falsify the
  "it runs" half by `python -m pytest tests/test_cache_tokens.py -q -k mutation`
  (errors here only because of `tmp_path`; on a normal box it passes without ever
  entering the branch — the copies are never compared to `HEAD`).
* **impact:** a silent hole in the only guard for the "token stale, manifest fresh"
  case the guard was extended for (TL3); consequence for a returning visitor is the
  stale ~4 MB catalog the rule exists to prevent. No user-visible impact observed.
* **falsifier:** a test that makes the *committed* state differ (a scratch clone at
  `HEAD~1` or a monkeypatched `_git`) and requires `scan()` to fail. None exists.
* **history:** TL3 (carry-over) — STILL OPEN, but *partially superseded*: the check
  itself exists (`:85-93`), so the row's original wording ("catalog committed-change
  check" missing) no longer matches the code; what remains is coverage + the silent
  degradation.

### TO-05 — Mutation-proof coverage is incomplete for four of the six JS guards, and the browser-gate pin is a source grep

* **lane / severity (asserted) / confidence:** t6 / **low** / high
* **file:line:** `tests/test_encoding.py:24-26` (encoding: real-tree assertion only);
  `tests/test_cache_tokens.py:64-101` (catalog: see TO-04); no test file references
  `scripts/check_js_imports.py` or `scripts/check_dom_ids.py` as a guard to mutate
  (`grep -n "check_js_imports|check_dom_ids" tests/` → 0 hits);
  `tests/test_browser_gate.py:56-60` (source-grep pin: asserts the *text*
  `check_browser FATAL: browser` and `return 2` exist in `harness.py`).
* **rule violated:** `AGENTS.md:503-506` ("pinned by `tests/test_cache_tokens.py`
  (mutation-tested)") generalised by the charter §7 ("are the mutation proofs real
  and complete?"); internal parity between guards that *are* mutation-proven
  (`check_core.py`, `check_js_syntax.py`, `check_release.py`) and those that are not.
* **what is wrong:** for `check_js_imports.py`, `check_dom_ids.py` and
  `check_encoding.py`, the only pin is "the real tree is clean", which cannot
  distinguish "the guard works" from "the guard no longer detects anything". The
  browser gate's exit-2 contract is pinned only by `assert "return 2" in src`, which
  a refactor could satisfy while breaking the behaviour (and does not catch TO-02,
  which is why TO-02 survived).
* **trigger / reachability:** a future edit that weakens a regex or an early `return 0`
  in one of these checkers; the suite stays green.
* **reproduction:** `rg -n "check_js_imports|check_dom_ids" tests/` → no guard-mutation
  test; `rg -n "check_browser FATAL" tests/test_browser_gate.py` → the assertion is a
  string search over `harness.py`'s text (`:56-60`), not a call.
  (Positive control: `tests/test_core_drift.py:101-173` shows what a complete proof
  looks like.)
* **impact:** assurance only — a silently neutered guard would still print OK; the
  mutation-proofs that do exist remain the credibility backbone of the bundle.
* **falsifier:** a staged-copy mutation per guard that requires the checker to exit 1.
* **history:** new (the carry-over `TS4` is about untested *exports*, not untested
  guards). Related to TO-02/TO-04 as the same "asserted, not proven" class.

### TO-06 — `AGENTS.md`'s tooling claims are stale: test count and the syntax checker's scope

* **lane / severity (asserted) / confidence:** t6 / **low** / high
* **file:line:** `AGENTS.md:356` (*"Tests: `python -m pytest tests/` (436)"*),
  `AGENTS.md:363-364` (*"-> 436/436"*), `AGENTS.md:369-370` (*"`node --check` on every
  shipped module (static/js, web/ **and the core source + baked trees**)"*) vs
  `scripts/check_js_syntax.py:37` (`ROOTS = [REPO/"static"/"js", REPO/"web"]`, and
  `discover()` at `:71-82` is non-recursive).
* **rule violated:** the standard of record's own precision claim (charter §2.3:
  README/AGENTS feature claims are a standard to judge against).
* **what is wrong:** (a) 437 tests are collected at HEAD *and* at the v0.6.24 tag
  (`git diff --stat v0.6.24..HEAD` touches no `tests/` file), so the count was already
  stale at the release; (b) `check_js_syntax.py` checks 31 modules
  (`static/js/*.js` 23 + `web/*.js` 8, observed: `checked 31 js module(s)`), i.e.
  `core/*.js` and both `core/<hash>/` trees are **not** parsed by it — the AGENTS
  bullet overstates the guard. (The core source is still covered indirectly: every
  `tests/js/*.mjs` engine imports `core/index.js`, so a syntax error there fails the
  engines; that is not what AGENTS claims.)
* **trigger / reachability:** anyone reading the doc to judge coverage — exactly the
  review/integration task here (t8/t9).
* **reproduction:** `python -m pytest tests/ --collect-only -q -p no:cacheprovider`
  → `437 tests collected in 0.76s`; `python scripts/check_js.py` → `checked 31 js
  module(s), 0 syntax error(s)`; `grep -n "ROOTS" scripts/check_js_syntax.py`.
* **impact:** documentation drift only; no behaviour. Low by construction.
* **falsifier:** a `tests/`-changing commit between the tag and HEAD (there is none)
  or `ROOTS` containing the core paths (`:37` shows it does not).
* **history:** new. H3 (charter §8) confirmed for the count.

### TO-07 — A stale `web/version.json` is only a WARNING, so the "re-bake on every deploy" rule has no hard gate (TL5)

* **lane / severity (asserted) / confidence:** t6 / **low** / high
* **file:line:** `scripts/check_release.py:592-597` (`Finding(WARNING, "web", …)`),
  the deliberate classification in the module docstring `:21-24`; carry-over row
  `TL5` (`AGENTS.md:455-456`).
* **rule violated:** the carry-over's own wording, `TL5` = "stale `web/version.json`
  hard error"; `AGENTS.md:524-526` (the gitignored `version.json` re-bake rule)
  (`web/version.json` "is gitignored and baked from the tag: a plain `uploadtree web
  /astro` after a code change keeps advertising the old version - re-bake on every
  deploy").
* **what is wrong:** the code implements the opposite of TL5's target: a version
  *ahead* of the release is an ERROR (`:586-591`), a version *behind* is a WARNING
  (`:592-597`). The only enforcement of "re-bake on every deploy" is therefore a
  warning line the operator may ignore, plus the manual FTP/hash verification
  described in AGENTS.
* **trigger / reachability:** a maintainer who deploys `web/` without re-running
  `web/build_web.py version`; every returning visitor then sees the previous version
  in the web footer while the desktop app advertises the new one.
* **reproduction:** `tests/test_release_check.py::test_web_version_behind_is_only_a_warning`
  passes (ran in the guard-pin run: 97 passed); read `check_release.py:592-597`.
* **impact:** a stale, user-visible version string in the web app; no integrity or
  data impact (the update checker uses `dist/release/ns-version.js`, which *is*
  hard-checked). Low.
* **falsifier:** if the finding is that a stale version could publish a wrong zip —
  it cannot, the zip/`version.json`/`ns-version.js` chain is error-checked
  (`check_stage`, `:743-854`).
* **history:** TL5 — **STILL OPEN by design**; the record should be corrected to say
  it is a deliberate WARNING with a documented repair point (the module docstring
  already says so at `:21-24`), not an unimplemented hard error.

### TO-08 — `build.ps1` writes the tracked `NightSeam.spec` into the repo root (`--specpath` absent) and pins PyInstaller only as `>=6.0` (TL4)

* **lane / severity (asserted) / confidence:** t6 / **low** / medium
* **file:line:** `build.ps1:179-187` (the PyInstaller invocation: `--clean --noconfirm
  --onefile --noconsole --name NightSeam … main.py`), `requirements-dev.txt:5`
  (`pyinstaller>=6.0`), `AGENTS.md:388-391` (the spec is "an artifact, not the source
  of truth"); `NightSeam.spec` **is tracked** (`git ls-files NightSeam.spec` →
  `NightSeam.spec`).
* **rule violated:** carry-over row `TL4` ("`--specpath` + PyInstaller pin");
  `AGENTS.md:474-477` (release order: `make_release.py` must run on a clean tree at
  the tag, because `git describe --dirty` leaks into the artifacts).
* **what is wrong:** without `--specpath`, PyInstaller writes `NightSeam.spec` into
  the current directory (the repo root, overwriting the tracked file). With an
  unpinned PyInstaller, a newer wheel can emit a different spec ⇒ a tracked file
  changes ⇒ `git describe --dirty` reports `-dirty` ⇒ `make_release.py`'s own
  pre-stage check (`make_release.py:66-100`) aborts with a dirty-tree ERROR after a
  successful build. The build itself is safe (the version was baked *before*
  PyInstaller ran), but the documented "build.ps1 then make_release.py" sequence can
  fail for a reason unrelated to the release.
* **trigger / reachability:** any PyInstaller upgrade between two releases, or a
  spec-format change; then the next build leaves a modified tracked file.
* **reproduction:** read `build.ps1:179-187` (no `--specpath`),
  `requirements-dev.txt:5` (no `==`), `git ls-files NightSeam.spec` (tracked). Not
  executed (charter §9.1 forbids running the build).
* **impact:** release-procedure friction + an unpinned toolchain in a release whose
  integrity claims rest on byte-level artifact checks; low (no observed instance:
  the committed spec currently matches the environment's PyInstaller).
* **falsifier:** if PyInstaller's generated spec were byte-stable across the allowed
  versions, or if the spec were untracked (it is tracked), the finding is wrong.
* **history:** TL4 — **STILL OPEN**; the record is accurate.

### TO-09 — Eight exported core functions are never named by any test (TS4)

* **lane / severity (asserted) / confidence:** t6 / **low** / high
* **file:line:** exports in `core/index.js`; measured with
  `reviews/0.6.24/evidence/probe_tooling.py` section C.
* **rule violated:** carry-over row `TS4` ("Untested exports",
  `AGENTS.md:456`), plus charter §2.1's implied completeness of the test corpus.
* **what is wrong:** of the 85 names re-exported by `core/index.js` (73 of them
  functions), **12 are never named anywhere under `tests/`**: `MASK_H`, `MASK_W`,
  `SKY_ZOOM_MAX`, `SKY_ZOOM_MIN`, `clipProfileToFov`, `fmtFov`, `fmtFovPair`,
  `isCustomId`, `searchBlob`, `sizeArcmin`, `sunAlt`, `sunCrossings` — 8 of them
  functions. They are used only by the shells (`web/app.js`, `web/astro.js`,
  `web/format.js`, `web/horizon.js`) or by `cropPano`/`pickDarkWindow` internally, so
  a regression in them can only be caught indirectly (e.g. `sunAlt` through the web
  sun-visibility tests) or not at all (`clipProfileToFov`, `fmtFov`, `fmtFovPair`,
  `isCustomId`, `searchBlob`, `sizeArcmin`).
* **trigger / reachability:** any future edit to those functions; the suite stays
  green unless a shell-level test happens to cover the path.
* **reproduction:**
  ```text
  $ python reviews/0.6.24/evidence/probe_tooling.py      # section C
  85 exported names (73 functions); 12 never named in tests/
  untested FUNCTIONS: ['clipProfileToFov', 'fmtFov', 'fmtFovPair', 'isCustomId', 'searchBlob', 'sizeArcmin', 'sunAlt', 'sunCrossings']
  ```
* **impact:** coverage gap only; no user-visible defect today. Low.
* **falsifier:** a `tests/` file naming those symbols (the probe greps all of
  `tests/*.py`, `tests/js/*.mjs`, `tests/browser/*.py`).
* **history:** TS4 — **STILL OPEN** (now with an exact list).

### TO-10 — Fixture sections skip silently when a core export disappears (TS7)

* **lane / severity (asserted) / confidence:** t6 / **low** / high
* **file:line:** `tests/js/core_fixtures.mjs:24-61` (`has(n)` gates every section;
  nothing is emitted when the guard fails), `tests/test_core_fixtures.py:56-58`
  (`_section` → `pytest.skip`), carry-over row `TS7` (`AGENTS.md:456`).
* **rule violated:** carry-over `TS7` ("Fixture `has()` gating"); the suite's own
  premise that `tests/fixtures/core_fixtures.json` is compared (`AGENTS.md:39-40, 572-575`).
* **what is wrong:** the "concept not extracted yet" scaffolding (needed while the
  harness landed before Phase 2) is still in place: a renamed, removed or
  non-function-valued core export makes its fixture section vanish, and the Python
  side turns that into a **skip** instead of a failure. The pattern would let a
  fixture comparison disappear quietly.
* **trigger / reachability:** a future refactor of `core/` that renames an export
  (e.g. `julianDay`).
* **reproduction:** read `core_fixtures.mjs:24` (`const has = (n) => typeof C[n] ===
  "function"`) with `:29-61`, and `test_core_fixtures.py:56-58`. Mutation (read-only
  here): pass a `coreDir` copy with `julianDay` renamed → `out.jd` is absent →
  `test_jd_matches_the_oracle` skips, not fails.
* **impact:** low, and **contained today**: `tests/test_core_drift.py:51-63` requires
  every core function to be in `check_core.py::MOVED` and every MOVED name to be a
  real core function, so a rename fails there (that is the pin that replaces the
  gating's lost bite). No reachable false-green was found.
* **falsifier:** show a rename/removal that keeps `test_moved_list_*` green while
  dropping a fixture section — then the mitigation fails and the severity rises.
* **history:** TS7 — **STILL OPEN (mitigated)**; the record should note the
  `test_core_drift` mitigation.

### TO-11 — The encoding guard's repo-wide scope includes the review workspace, so a non-shipped artifact can turn the release JS guard red

* **lane / severity (asserted) / confidence:** t6 / **low** / high
* **file:line:** `scripts/check_encoding.py:28-36` (`SKIP_TOP` has `.git`, venvs,
  `build`, `data`, `dist`, `logs`, `node_modules`, `theme-preview`, `whale`, `dev` —
  **no `reviews`**), `:54-59` (walks `root.rglob("*")`), observed failure
  `tests/test_encoding.py:26`.
* **rule violated:** `AGENTS.md:298-302` — the guard "rejects non-UTF8, UTF-8 BOMs,
  C1 controls and cp1252 mojibake clusters **in shipped text**"; the review evidence
  tree is not shipped text (charter §1.1 keeps `reviews/` outside the product), and
  `check_encoding.py` already skips the other non-shipped trees.
* **what is wrong:** the guard polices every `.py/.js/.json/.md/…` file in the repo,
  including `reviews/0.6.24/evidence/`. A BOM (the classic PowerShell
  `Set-Content -Encoding utf8` round-trip AGENTS warns about) or a UTF-16LE capture
  from a PowerShell `>` redirection written there makes
  `python -m pytest tests/test_encoding.py` fail and equally makes
  `python scripts/check_js.py` (hence the documented "run after touching `static/`
  OR `web/`" step) fail with a message about a review scratch file.
* **trigger / reachability:** whenever the review/scratch tree contains a UTF-16LE
  capture, a BOM or cp1252-mojibake text, any run of `python scripts/check_encoding.py`
  (hence `python scripts/check_js.py`, which aggregates it) or
  `pytest tests/test_encoding.py` fails with a message about a non-shipped file. The
  trigger is deterministic and independent of which artefacts happen to exist — see
  the synthetic-root reproduction below.
* **reproduction (deterministic, self-contained; ran at hand-off):** the guard's
  `scan(root)` takes a root argument, so its behaviour can be shown on a scratch tree
  with no dependency on any leftover review artefact. `reviews/0.6.24/evidence/probe_tooling.py`
  section E does exactly this:
  ```text
  $ python reviews/0.6.24/evidence/probe_tooling.py       # section E
  == E) check_encoding scope (synthetic root, TO-11) ==
    one scratch file _probe_utf16.txt: [('_probe_utf16.txt', "not valid UTF-8: 'utf-8' codec can't decode byte 0xff in position 0: invalid start byte")]
    one scratch file _probe_bom.txt: [('_probe_bom.txt', 'starts with a UTF-8 BOM')]
    one scratch file _probe_mojibake.txt: [('_probe_mojibake.txt', 'double-encoded text (cp1252 mojibake)')]
    scratch dir now empty: []
  ```
  i.e. one scratch text file under a directory that is not in `SKIP_TOP` is enough to
  produce a finding, and removing it returns `[]`. At the CLI level the same thing is
  `python scripts/check_encoding.py` → `check_encoding: FAIL (1 file(s))`, exit 1;
  delete the file → `check_encoding: OK`, exit 0.
* **history — both live instances, and how each ended:**
  1. **core lane's probe scripts** (`reviews/0.6.24/evidence/_guard_probe.py`,
     `_guard_probe2.py`, `_guard_probe3.py`, `_mut_probe.py`, `_sens_probe.py`,
     `_sens_probe2.py` — six BOM'd files written by a PowerShell `Set-Content`-style
     tool). I first hit this as
     `tests/test_encoding.py:26: AssertionError: reviews/0.6.24/evidence/_guard_probe.py: starts with a UTF-8 BOM`
     (`1 failed, 97 passed, 1 error`, see §2.3). **Fixed by the captain** (re-encoded
     to UTF-8 without BOM; I byte-checked `_guard_probe.py` afterwards: `69 6D 70`).
  2. **verifier's output dumps**, which is what I measured as `FAIL (15 file(s))` — 11
     UTF-16LE `v7-probe/*.txt` captures from a PowerShell `>` redirection plus 4
     UTF-8-BOM `v7-*.txt`. Resolved from two directions: the captain's converter and
     the verifier's own `v7-normalize-scratch.py --apply` (16 re-encoded, 3 mojibake
     files removed), with each lane normalizing its own scratch.
  3. **But the directory was still being written to while I re-checked**, so the
     offender set churned under me and the guard was **not green at my hand-off**.
     Seven measured CLI runs (`python scripts/check_encoding.py`, exit 1 every time)
     gave, in order, `FAIL (1 file(s))` [the original core-lane case] → `FAIL (11)` →
     `FAIL (15)` → `FAIL (16)` → `FAIL (23)` → `FAIL (31)` → `FAIL (28 file(s))` at my
     last check — the count moves in **both** directions run to run, because the
     capturing lane keeps adding and pruning output. New names appeared
     between runs (`v7-co04b.out.txt`, `v7-grep-loupe.txt`, `v7-guard.out.txt`,
     `v7-probe-output.txt`, `v7-run-pano.txt`, `v7-probe/tag_changelog_py.txt` …), i.e.
     another lane was still capturing command output with PowerShell redirection. The
     largest run exercised all three detection branches: BOM files, non-UTF-8 (byte
     `0xff`) files and cp1252-mojibake files, newest writes 22:3x.
     **State is time-dependent:** whoever runs the guard last sees whatever the last
     writer left. "The guard is green" is only true of a review tree that contains no
     such scratch output — the deterministic reproduction above is the stable form of
     this finding, and the gate must re-check rather than assume.
  4. **The guard also caught my own probe source.** `probe_tooling.py` spelled the
     mojibake marker as a literal, so the first version of section E made that file an
     offender (`reviews/0.6.24/evidence/probe_tooling.py: double-encoded text (cp1252
     mojibake)`, seen in the 23-file run). I rebuilt the test input from ASCII escapes
     (`chr(0xC3) + chr(0xA9)`) and re-verified: my own files are clean and section E
     still fires all three branches. That is a neat illustration of the finding: any
     text file anywhere in the repo is policed, including a probe written *to
     demonstrate the gap*. **Fixed (this lane).**
* **impact:** a red release/JS guard caused by non-shipped scratch output — the
  documented "run after touching `static/` OR `web/`" step and the final `pytest`
  run can fail for a reason unrelated to shipped text, and a t9 gate that re-runs
  those commands may see exit 1. No product impact. **Low.** (The scratch files really
  are against the repo's byte rules; the defect is the guard's scope, not the
  detection — the same runs incidentally exercised all three detection branches:
  BOM, non-UTF-8 and mojibake.)
* **how to avoid it in THIS environment (PowerShell 5.1 — do not use `Out-File`):**
  capture tool output by writing from inside Python (`open(path, "w", encoding="utf-8")`)
  or have the probe write its own log file. In PS 5.1 `Out-File -Encoding utf8` and
  `Set-Content -Encoding utf8` write UTF-8 **with a BOM** (exactly what the guard
  rejects), `utf8NoBOM` does not exist before PowerShell 6/7, and `-Encoding ascii` is
  BOM-less but destroys non-ASCII output — so `>` redirection, `Out-File` and
  `Set-Content -Encoding utf8` are all unsafe capture paths here. (An earlier version of
  this guidance recommended `Out-File -Encoding utf8` / `utf8NoBOM`; that was wrong for
  PS 5.1 and is corrected here.)
* **scope of the fix (why this stays a finding, not a patch):** removing the gap means
  adding `reviews` (or a general scratch/artefact tree) to `check_encoding.py:28-36`
  `SKIP_TOP` — a **production change to a shipped guard**, explicitly out of scope for
  this read-only review (charter §9.1). The finding therefore stands as a guard-scope
  gap for the maintainer to decide; the review only records it.
* **falsifier:** if `check_encoding.py`'s `SKIP_TOP` contained `reviews` (it does not),
  or if the review tree were gitignored (it is not — `git status --porcelain` shows
  `?? reviews/`).
* **history (dedup):** new; surfaced by this review's own evidence directory. The two
  artefact waves are recorded above with their resolutions; no product regression.

### Cross-lane hand-off — `XL-01` (filed by t4 in `30-web.md`): per-module web cache-token discipline / the v0.6.24 tag

**Not a second finding** (charter §4). The defect is filed once by **web-reviewer
(t4)** as `XL-01` in `reviews/0.6.24/30-web.md`; the t7 verifier and t8 integrator
should treat that as the canonical body. What follows is the evidence this lane
(t6) contributes from the release-pipeline side, including one fact t4 does not
have: the step-4 `web/version.json` bake ran **at the tag**, 35 s after the release
commit, and the repair commit followed ~3½ minutes later.

* **rule:** `AGENTS.md:492-496` — *"Bump the token of every module whose BEHAVIOUR
  changed (comment-only edits do not) in the SAME commit as the change, and bump
  BOTH the entry point and the dependency."*
* **release facts (each command ran read-only here):**
  ```text
  $ git log -1 --format="%h %cI %s" 25a19bb   -> 2026-09-12T18:02:08+02:00 NightSeam 0.6.24   (tag v0.6.24)
  $ git log -1 --format="%h %cI %s" 208f7d6   -> 2026-09-12T18:06:07+02:00 web: bump 0.6.24 module cache tokens …
  $ web/version.json                          -> {"version":"0.6.24","describe":"v0.6.24","built":"2026-09-12T16:02:43+00:00"}
                                                 (18:02:43+02:00 = the step-4 bake, 35 s after the tag, describe CLEAN)
  $ git diff --stat v0.6.24..HEAD -- web       -> web/app.js | 10 +++++----- ; web/index.html | 2 +-
                                                 2 files changed, 6 insertions(+), 6 deletions(-)   (the token fix only)
  $ git show v0.6.24:web/app.js                -> astro.js?v=9 horizon.js?v=40 webstore.js?v=19 format.js?v=16
                                                 nightrank.js?v=6, only core.js?v=17 bumped; index.html app.js?v=59
  $ git diff --name-only v0.6.23..v0.6.24 -- web/  -> app.js astro.js format.js horizon.js nightrank.js webstore.js (+ core)
  ```
  So the tagged tree changed six module payloads while five tokens and the entry
  point stayed at their 0.6.23 values; the repair commit's own message states it:
  *"The crop commit re-baked core to token 17, changing the bytes of every module
  that imports core, but only the core import URLs were bumped."*
* **why no guard caught it (this lane's part):** `check_core.py` only requires the
  importers' `./core.js?v=` token to equal the manifest token;
  `check_catalog_token.py` covers `web/catalog.json` only; and the only token pin,
  `tests/test_cache_tokens.py:40-61`, compares the AGENTS register to the **sources**
  — it cannot know a behaviour changed. So the tagged commit passed
  `python scripts/check_js.py` and `python scripts/check_release.py` while violating
  the rule (both are green now, at HEAD, where the tokens are consistent).
* **severity guidance for t7/t8 (asserted by t6):** medium. The release-time
  guarantee was broken, but the bake/deploy timeline (bake at the tag, repair 3½ min
  later, before the documented step-6 upload) leaves no observed user-facing breakage;
  the upgrade path to **high** is "show that the tagged `web/` tree was uploaded
  before `208f7d6`" — a reachability question for the verifier/integrator, not a
  claim this lane makes. User-side surface if reachable: a returning visitor holding
  the old `app.js?v=59` keeps the old module graph, which imports `./core.js?v=16`,
  and (because the re-bake removed the old hash dir — TO-01) a cached old stub under
  that URL resolves to a directory that no longer exists.
* **falsifier:** if `git diff v0.6.23..v0.6.24 -- web/` had not changed those module
  bytes (it did), or if a guard rejected the tagged tree (none does), the defect is
  not real.
* **carry-over:** this is the concrete release instance behind `E15`
  (§6) and it cross-references TO-01 (the vanished N-1 hash dir that turns a cached
  old stub into a 404).

---

## 6. Carry-over audit (t6 rows + the E15 cross-check)

| Item | Owner in the charter | Verdict | Evidence |
| --- | --- | --- | --- |
| `TL3` catalog committed-change check | t6 | **STILL OPEN (partially superseded, low)** | The check exists at `scripts/check_catalog_token.py:85-93` and runs in this environment (`probe_tooling.py` A: `_git_ok() -> True`, `scan() -> []`), so the row's original "missing" wording no longer matches the code. What remains: no mutation proof ever enters the branch (`tests/test_cache_tokens.py:64-101` compares copies but `git diff HEAD` sees the clean real repo) and it no-ops silently when git is unusable (`:40-45`). See TO-04. |
| `TL4` `--specpath` + PyInstaller pin | t6 | **STILL OPEN (low)** | `build.ps1:179-187` has no `--specpath`; `requirements-dev.txt:5` is `pyinstaller>=6.0`; `NightSeam.spec` is tracked. See TO-08. |
| `TL5` stale `web/version.json` hard error | t6 | **STILL OPEN by design (low)** | `scripts/check_release.py:592-597` explicitly returns a `WARNING` for a version behind the release; the module docstring `:21-24` calls that "legitimately repairable later in the documented release order". The record should say "deliberate WARNING", not "missing hard error". Pinned by `tests/test_release_check.py::test_web_version_behind_is_only_a_warning` (passed). See TO-07. |
| `TS4` untested exports | t6 | **STILL OPEN (low)** | 85 exported names, 12 never named in `tests/` (8 functions). See TO-09 and `probe_tooling.py` C. |
| `TS7` fixture `has()` gating | t6 | **STILL OPEN, mitigated (low)** | `tests/js/core_fixtures.mjs:24-61` + `tests/test_core_fixtures.py:56-58`; the lost bite is replaced by `tests/test_core_drift.py:51-63` (MOVED ↔ core exports). See TO-10. |
| `E15` per-module token discipline (cross-check with t4) | t4 (owner), t6 cross-check | **STILL OPEN (medium)** | Filed once as **`XL-01` in `reviews/0.6.24/30-web.md`** (t4); this lane's release-pipeline evidence is the hand-off in §5 (`AGENTS.md:492-496` rule; the only pin is doc==source, `tests/test_cache_tokens.py:40-61`; the v0.6.24 tag is a live violation repaired post-tag by `208f7d6`, with the step-4 bake verified at the tag: `web/version.json` = `describe "v0.6.24"`, built 18:02:43+02, 35 s after the release commit). |

Other carry-over rows (`CR2`, `CR3`, `DS4`, `DS5`, `PY6`, `WB7`) belong to t2/t3/t4/t5
and were not adjudicated here (no evidence gathered for them in this lane).

---

## 7. Seed hypotheses (charter §8)

* **H1 — baked-core N-1 retention:** **CONFIRMED**, as a doc/guard contradiction plus
  a real retention gap. `v0.6.23:web/core` = `79ad99ef15810ca2`, `v0.6.24:web/core` =
  `97c2e182fb0a5630`, `git ls-files` shows one dir per side; `check_core.py:123-125`
  *requires* exactly one dir, while `AGENTS.md:515-518` says to keep two and claims the
  guard "only requires the current dir". → TO-01 (medium). Owner t6, t3 informed.
* **H2 — post-tag commits at HEAD:** **the release-order rules still hold, with one
  deviation.** `git grep -n "0.6.24" v0.6.24 -- scripts/build_changelog.py` finds the
  CURATED entry **inside** the tagged commit (`v0.6.24:scripts/build_changelog.py:33-35`),
  `pre_tag_check.py 0.6.24` exits 0, and `build_changelog.py --check` exits 0. The two
  post-tag commits are `9596878` (the documented step-7 `landing/changelog.json` follow-up,
  `5` inserted lines) and `208f7d6` — a **web cache-token bump + AGENTS register update**,
  which is *not* part of the documented order → the `XL-01` hand-off in §5 (that
  defect is filed by t4 in `30-web.md`; the step-4 `web/version.json` bake was verified
  to have run at the tag, 35 s after the release commit). `python scripts/check_release.py`
  at this HEAD exits 1 with exactly 3 ERRORs (`tree` HEAD not a tag, `baked` 0.6.24 vs
  `0.6.24-2-g9596878`, `stage` stale `dist/release`), i.e. the designed refusal — not a
  defect.
* **H3 — documentation counts:** **CONFIRMED (count half).** 437 tests collected vs
  "436" in `AGENTS.md:356,364` — and the count was already stale at the tag
  (no `tests/` change in `v0.6.24..HEAD`). The syntax-checker scope claim
  (`AGENTS.md:369-370`) is also wrong. → TO-06. The token-set half of H3 is t4's; the
  register itself passes `test_cache_tokens.py::test_web_token_register_matches_the_sources`
  at HEAD (guard-pin run), and at the tag it did not match reality — see the `XL-01`
  hand-off in §5.
* **H4 — the 12 carry-over sentences:** the five rows owned by t6 are adjudicated in §6
  (all STILL OPEN; TL3 and TL5 have descriptions that no longer match the code — TL3
  exists, TL5 is deliberate). The rest are other lanes' rows.
* **H5 — repo hygiene (root scratch scripts):** **REFUTED.** The charter's premise
  ("six root-level scratch scripts + one scratch JSON are committed", §1.1/§8) is
  wrong: `git ls-files check_unmatched.py check_unmatched2.py match_final.py
  match_popularity.py verify_matches.py debug_matches.py popularity_snapshot.json` prints
  **nothing**, and `git check-ignore -v` shows `.gitignore:25-32` covers all seven
  (plus `scripts/adv_popularity.py`). `git status --porcelain` is `?? .agent-teams/`
  + `?? reviews/` only. They are local, ignored scratch — not part of the reviewed
  tree, not shipped (`build.ps1` bundles only `static/` + `app/data/`; `uploadtree`
  walks only `web/`/`landing/`). **No finding.** The charter's §1.1 row and H5 should
  be corrected by t1/t8 so the coverage matrix does not claim to have reviewed
  committed files that do not exist in the repo.

---

## 8. Observations (severity-less; the integrator must not rank these)

* **O-1 `scripts/check_js.py:1-9`** — the docstring says "the four static/js checkers
  plus the encoding guard"; the file runs **six** hard checks (`:28-33`) plus the
  heuristic. Doc drift only.
* **O-2 `scripts/check_js_imports.py:63-74`** — `named_imports` only inspects a clause
  that starts with `{`, so `import def, {a} from './x.js'` skips the named-export
  check for `a`. No current site uses that form.
* **O-3 `check_js_defs.py`** reports 10 candidates, all of which look like false
  positives from the source (methods/builtins: `constructor()`, `Worker()`,
  `MutationObserver()`, `Uint8Array/Int32Array/Float64Array`, `resolve/reject`,
  `planning_worker.js:164 topAt()`, `dragwin.js:24 shouldStart()`). Two are worth a
  human glance for the desktop lane (`topAt`, `shouldStart`) — flagged as a lead, **not
  a finding** (this lane did not trace them; t5 owns `static/`).
* **O-4 `build_changelog.py --check`'s CLI exit code is not covered by a test**: only
  `split_uncurated`/`report`/`build_entries` are. The gate was verified by running it
  (exit 0) and `pre_tag_check.py` shares the same table.
* **O-5 `make_release.py:52`** — `assert CHECK_ROOT == ROOT` disappears under
  `python -O`; the failure it guards (wrong repo) would then surface later.
* **O-6 `web/ftps_deploy.py`** — the recursion `_upload_tree` sorts plainly (`:232`)
  instead of by `upload_order`; safe for today's `web/`+`landing/` (the only
  `index.html`s are at the top level, and `main()` sorts the top level at `:190`), but
  the "HTML last" guarantee is not composed recursively. Also, the pinning test
  re-sorts the directory itself (`tests/test_deploy_order.py:33`) instead of asserting
  that `main()` uses the key — a future refactor could drop `key=upload_order` and stay
  green.
* **O-7 `build_web.py:16-18,60-63`** — `cmd_version` captures git's stdout with no
  file fallback (unlike `check_release.py:305-333` and `build_changelog.py:111-138`);
  its docstring documents that a pipe-denied environment needs full access. In this
  session `subprocess.run(..., capture_output=True)` worked fine for the sibling
  scripts and for `probe_tooling.py` section A — the named-pipe denial is real but, in
  this snapshot, does **not** hit `capture_output=True` from Python (only the
  Playwright driver's `CreateFile`-based pipe, TO-02). `AGENTS.md:418-419`'s blanket
  wording ("Any tool that shells out with `capture_output=True` … dies the same way")
  is broader than what was observed; left as an observation because the charter (§3)
  classifies this area as environment noise.
* **O-8 `tests/browser/artifacts/`** is gitignored (`.gitignore:40`); the failed gate
  attempt created it as designed (`harness.py:334`) and left no tracked change.
* **O-9 `pytest.ini`'s `addopts = --basetemp=.pytest-tmp`** makes the repo-local
  basetemp the default for every plain `pytest` invocation — the exact directory the
  documented workaround exists to avoid; a per-invocation flag is the only way out.

---

## 9. What the verifier should re-check first

1. TO-01 and `XL-01` (medium, release-facing) — both are pure `file:line` + git
   evidence and can be refuted or upgraded quickly. `XL-01` is t4's filing in
   `30-web.md`; this lane's §5 hand-off adds the release timeline, and its upgrade
   path (was the tagged `web/` tree deployed before `208f7d6`?) is a reachability
   question for t8.
2. TO-02 — re-run `python scripts/check_browser.py --web` in any sandbox/CI where the
   Playwright driver cannot start and confirm exit 1 + traceback (or refute it as a
   sandbox-only artifact by running the gate where it works).
3. TO-06 (437 vs 436) and TO-09 (untested export list) — mechanical, verbatim
   reproducible; re-run `probe_tooling.py`.
4. TO-11 — before treating a red `python scripts/check_encoding.py` /
   `python scripts/check_js.py` / `pytest tests/test_encoding.py` as a product
   failure: check whether the offenders are non-shipped files under
   `reviews/0.6.24/evidence/` (the counts I measured ran `FAIL (11)` → `(15)` → `(16)`
   → `(23)` → `(31)` → `(28 file(s))` while other lanes were still writing — unstable in
   both directions, so do not trust any single reading). The stable reproduction is
   `probe_tooling.py` section E (a synthetic root, one scratch file → one finding →
   `[]` when removed), not the leftover artefacts. The finding is the guard's scope
   (`check_encoding.py:28-36` has no `reviews` in `SKIP_TOP`); changing that is a
   production edit, out of scope for this review.
5. H5 — re-run `git ls-files` on the seven scratch names; if they are indeed
   untracked, the charter's §1.1/H5 premise must be corrected rather than trusted.

---

## 10. Attestation (read-only)

`git status --porcelain` at the end of this lane's work:

```text
?? .agent-teams/
?? reviews/
```

Re-run after the citation fix (every reference repointed to the canonical web lane
file, `30-web.md`) and after the TO-11 rewrite: unchanged —
`?? .agent-teams/` + `?? reviews/`, and
`git diff --stat` (tracked changes) is empty. Two guard-state notes, both read-only
observations of *non-shipped* review scratch, not tracked-file changes:
`python scripts/check_encoding.py` printed `FAIL (11 file(s))`, then `(15)`, `(16)`,
`(23)`, `(31)` and finally `(28 file(s))` across seven runs while other lanes were
still writing evidence output — unstable in both directions — and `python
scripts/check_js.py` was exit 1 at that moment for the
same reason (only that reason — `check_catalog_token: OK`, `check_core: OK`, 31
modules parsed). The captain cleaned batches of those files, but the directory kept
filling, so **the guard was red, not green, at my hand-off**; it is green only while
the review tree holds no such scratch. The deterministic reproduction of this
guard-scope gap is `probe_tooling.py` section E (TO-11), which needs no leftover file
and is what a gate should use. My own `probe_tooling.py` was itself flagged once
(mojibake marker spelled literally) and is now ASCII-clean and re-verified.

i.e. the harness's own state plus this lane's new files under `reviews/0.6.24/`
(`50-tests-tooling.md`, `evidence/probe_tooling.py`,
`evidence/_probe_core_n1/`). No file under `app/`, `core/`, `web/`, `static/`,
`tests/`, `scripts/`, `landing/` or any tracked root file was created, modified or
deleted; no git history, build, bake or deploy command was run. All command output
quoted above is from this session.
