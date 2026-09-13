# Fix batch 1 - round-2 independent review (t5)

Reviewer: reviewer (independent verifier)
Reviewed task: t4 (repair round 2 of the t2 findings)
Attempt: 2d1167e1-6582-4365-95f0-3299e46e0fa8
Judged against: `reviews/0.6.24/REVIEW-0.6.24.md` revision 6 (sha256
`323159B2...`), `70-verification.md`, the lane files, and the t2 findings in
`reviews/fix-batch1-review.md`.

Verdict: **needs_revision** - the functional repairs are correct and
reproduced; three completeness/robustness findings remain (R2-01 docs, R2-02
`--update` escape hatch, R2-03 unwired pin).

---

## 1. Repaired findings - verified correct

### XL-01-F1 (was: guard blind to a missed bump on the six repaired modules) - FIXED

`scripts/check_js_tokens.py` now carries a generated VERIFIED BASELINE block
(`_VERIFIED_BASELINE_JSON`, lines 90-137) with `{module: {token, sha256}}` for
all 10 shipped web modules, and `find_missed_bumps` (line 227) fails on
"bytes differ from the baseline AND token == baseline token".

Reproduced on shadows of the REAL `web/` tree against the embedded baseline
(reviewer probe, nothing in the repo mutated):

- real tree -> `scan() == []`;
- `web/astro.js` bytes edited with the token left at 10 (the tag's stale token
  is 9 - my exact round-1 counterexample) -> **FAIL**: `web/astro.js changed
  but its cache token is still ?v=10`;
- `web/style.css` bytes edited with token 16 -> FAIL (general case);
- `scan_at("v0.6.24","v0.6.23")` reports exactly the six stale modules;
  `scan_at("208f7d6","v0.6.23") == []`;
- a module referenced with a token but missing on disk is reported;
  `missing_from_tree` flags a baseline row the tree no longer ships;
- `--update` on the matching tree is byte-identical (idempotent);
- `--self-test` passes (5 checks).

End-to-end through the real entry points with a temporary style.css edit:
`check_js_tokens` exit 1, `pre_tag_check 0.6.24` exit 1, `check_js.py` exit 1;
after the byte-exact restore (sha256 `3AF454FB...567D2`, `git status` clean)
all three exit 0 again.

### XL-01-F2 (was: CRLF smudge produced spurious findings) - FIXED

Hashing is line-ending-normalized (`_norm`/`_sha`, lines 142-148) and
`scan_at` uses `git diff --quiet` for the committed view. A CRLF-only
conversion of the real modules produces neither a missed-bump nor a
stale-baseline finding; a real edit on top of a CRLF copy still FAILS.

### PY04-PIN-01 (was: the coordinate API pin passed pre-fix) - FIXED

`tests/test_api.py:338 test_ingest_unresolved_object_with_non_finite_coordinates`
exercises the certified path (unresolved OBJECT + `Infinity`/`1e400`/`nan`
cards). Against a `git archive HEAD` pre-fix shadow: **FAILED**
(`ValueError: expected a finite input, got inf`); post-fix it passes. The pin
set is now 5 failed / 2 passed pre-fix (the two behaviour-recording tests pass
by design and say so in their docstrings).

### Regressions - clean

- PY-04: my own TestClient probe (hand-built FITS, DB rows + files on disk)
  passes - EXPTIME=`1e400` -> 200/exposure None/one frame file/rows finite;
  unresolved + non-finite coords -> 200 with `object_id None` and only
  None-or-finite stored values; `/api/library`, `/api/library/imports`,
  `/api/library/export?format=json` all 200, export strict JSON; no non-finite
  stored anywhere.
- DE-01: `node tests/js/dom_handlers.mjs` on the real tree ->
  `DE-01 handler: custom target add rebuilds the plan held`; the same harness
  against HEAD's `setup.js` (pre-fix static/js) ->
  `DE-01 handler: FAILED (new target absent from the plan: [])`.
- Wiring intact: `check_js.py` runs `check_js_tokens` (`check_js: OK`, exit 0);
  `pre_tag_check 0.6.24` exit 0; `check_js_tokens` exit 0 at HEAD.
- Full suite with a review-side tmp factory: **445 passed, 0 failed**.
- `v0.6.24` = `25a19bb` (unmoved, exactly one such tag); HEAD =
  `v0.6.24-2-g9596878`; no commit, tag or deploy.
- t4's changed files are all inside the batch inScope list: `AGENTS.md`,
  `app/fits.py`, `static/js/setup.js`, `scripts/check_js.py`,
  `scripts/pre_tag_check.py`, `tests/` (5 files), `scripts/check_js_tokens.py`.
  `tests/test_cache_tokens.py` is back to its committed 101-line form.

## 2. Findings

### R2-01 (medium) - AGENTS.md still documents the replaced tag-based rule and cites pins that no longer exist

File: `AGENTS.md:373-375` and `AGENTS.md:520-530`.

Problem: the round-2 guard no longer compares module bytes "against the latest
release tag" - it compares them against the embedded VERIFIED BASELINE - yet
both passages still say "against the latest release tag: bytes changed without
a token bump = hard failure". Line 529 still claims "Pinned by
`tests/test_cache_tokens.py` (mutation proof on copies + the real defect
replayed against `v0.6.23`)"; round 2 reverted that file to its 101-line
catalog-only form, so no module-token mutation proof lives there any more, and
the `--self-test` that now holds the proof is not invoked by `check_js.py`,
`pre_tag_check.py` or pytest. The `--update` step every web change now requires
is not mentioned in AGENTS.md at all. The original XL-01 fix direction
explicitly included documenting the guard in AGENTS.md next to the cache-token
rules, so the docs are part of the deliverable.

RequiredFix: rewrite the two passages to describe the verified-baseline rule
(bytes differ from the baseline while the token equals the baseline token =>
FAIL) and the `--update` refresh-and-commit step, and cite the actual collected
pin added for R2-03 instead of the removed `test_cache_tokens.py` proof.

### R2-02 (medium) - `--update` can bless a missed bump, and scan() offers it as the remedy

File: `scripts/check_js_tokens.py:539-550` (`--update`) with the hint at
`:432-438`.

Problem: for a genuine missed bump `scan()` emits BOTH "web/<m> changed but its
cache token is still ?v=N" AND "the verified baseline is stale (run
`python scripts/check_js_tokens.py --update` and commit it with the change)".
Running that documented remedy rewrites the baseline with the unbumped token,
after which the same tree passes. Reproduced: taking the shadow whose
`astro.js` bytes were edited while its token stayed 10, regenerating the
baseline with `write_baseline`/`baseline_rows` (exactly what `--update` does)
yields a baseline row `astro.js: token 10` and
`find_missed_bumps(...) == []`. So the certified property "a tag-time miss
cannot pass" still has a silent path - only one command away from the failure
output that recommends it. (The catalog manifest has the same regeneratable
shape, so this may be an accepted trade-off; if it is, the hint should at least
not be emitted together with a missed-bump finding.)

RequiredFix: make `--update` refuse to write while
`find_missed_bumps(<current baseline>, <tree>)` is non-empty ("bump the token
first"), and emit the stale-baseline hint only when the pairing genuinely moved
(bytes and token), never alongside a missed-bump finding.

### R2-03 (low) - the guard's mutation pin is not run by anything

File: `scripts/check_js_tokens.py:442` (`_self_test`), tests/.

Problem: `--self-test` is the only place the guard's detection logic is pinned,
and it is referenced nowhere outside the guard itself (`grep` over `tests/`,
`scripts/check_js.py`, `scripts/pre_tag_check.py`). With
`tests/test_cache_tokens.py` reverted, breaking `find_missed_bumps` would not
fail any automated check - `check_js.py` only calls `scan()`, and the
`test_pre_tag_check.py` pin monkeypatches `token_problems` (wiring only).

RequiredFix: add a collected test (e.g. `tests/test_js_tokens.py`) that runs
the synthetic 0.6.25 case (or shells out to `--self-test`), or wire
`--self-test` into `check_js.py`, so the detection logic stays pinned in the
normal suite.

## 3. Coverage limits (stated)

- The Playwright browser gate cannot launch in this sandbox, so DE-01 still has
  no real-click evidence; it is covered by the real `setup.js` module under the
  stub DOM (post-fix pass, pre-fix shadow fail), the same method the certified
  record used.
- pytest's own `tmp_path`/basetemp directories are unusable here (owner-SID-only
  DACL -> WinError 5 at fixture setup/session finish). The reviewer used a
  workspace tmp factory (`reviews/rv_pytest_plugin.py`, `-p rv_pytest_plugin`,
  dirs under `.rv-tmp-root`). No production or test file was changed by the
  reviewer; the one temporary `web/style.css` edit was restored byte-identically.
- Root-level `pt-*` scratch trees (the coder's) are unreadable from this
  sandbox; `check_js.py` exits 0 once the reviewer's own BOM probe artifact is
  removed (`check_encoding` had flagged it).

## 4. PY04-F2 (storage boundary) - tracked separately, not re-filed here

The PY-04 storage-boundary finding from the t2 addendum is assigned to t6/t7
by the captain. `app/database.py`, `app/backup.py` and `app/server.py` are
unchanged in this round, so it remains open exactly as reproduced there (a
crafted/legacy bundle carrying `Infinity` persists an inf row and wedges
`/api/library` at 500; export -> re-import re-introduces it). Not counted
against t4.

## 5. Commands run (observed)

| command | result |
| --- | --- |
| `python -m pytest tests/test_fits.py tests/test_ingest.py tests/test_imglib.py tests/test_api.py tests/test_cache_tokens.py tests/test_pre_tag_check.py -q -p rv_pytest_plugin -p no:cacheprovider` | `115 passed` |
| `python -m pytest tests/ -q --tb=line -p rv_pytest_plugin -p no:cacheprovider` | `445 passed, 0 failed` |
| `python -m pytest tests/test_fits.py tests/test_api.py -k "<pins>"` in the pre-fix `git archive HEAD` shadow | `5 failed, 2 passed` |
| `node tests/js/dom_handlers.mjs` (real tree) | `DE-01 ... held` |
| `node <shadow>/tests/js/dom_handlers.mjs` (HEAD setup.js) | `DE-01 ... FAILED (new target absent from the plan: [])` |
| reviewer token probe (shadow of the real web tree) | XL-01-F1/F2 cases all as required |
| `python scripts/check_js_tokens.py` | exit 0 at HEAD; exit 1 with a real style.css edit |
| `python scripts/check_js_tokens.py --self-test` | exit 0 (5 checks) |
| `python scripts/pre_tag_check.py 0.6.24` | exit 0 at HEAD; exit 1 with a real style.css edit |
| `python scripts/check_js.py` | exit 0 (`check_js: OK`) |
| `git rev-parse v0.6.24` / `git log --oneline v0.6.24..HEAD` | `25a19bb` / `208f7d6`, `9596878` only |
| `git status --porcelain` | only the coder's files + untracked `.agent-teams/`, `reviews/`, `scripts/check_js_tokens.py` |

---

## 6. Captain follow-up - direct re-verification (this pass)

Revision verified (sha256, first 16 hex): `app/fits.py` `0C7F79F3B6F37E8D`,
`scripts/check_js_tokens.py` `C70B0A91C3CC7372`, `static/js/setup.js`
`34757B5F8830200A`, `tests/test_api.py` `816910900EA43CD3`, `AGENTS.md`
`DAF8D89B46BA805F`, `web/astro.js` `3FCB17F9F4795170`, `web/style.css`
`3AF454FB18875080`. (The coder's t6 storage-boundary work was landing during
this pass - `app/database.py`, `app/backup.py`, `tests/test_backup.py` - and is
out of this round's scope.)

### The four adopted items - all verified

| Item | Evidence |
| --- | --- |
| XL-01-F1 | Guard carries the generated baseline for all 10 modules. Must-fail shape re-proven directly (not via self-test): shadow of the real `web/` tree with `astro.js` bytes edited and its token left at 10 -> `scan()` FAILS with "still ?v=10" (round-1 guard returned `[]`). Real tree passes. |
| XL-01-F2 | Git itself produced the CRLF (`git checkout-index --prefix` -> 27353 bytes with CRLF pairs; forced real worktree smudge via delete + `git checkout` -> 27353 bytes). With a CRLF worktree: `check_js_tokens` exit 0, `pre_tag_check 0.6.24` exit 0, `check_js.py` exit 0 - no spurious finding. A real edit appended to the CRLF worktree -> guard exit 1. Worktree restored byte-identically (`3AF454FB...`, `git status` clean). |
| PY04-PIN-01 | `test_ingest_unresolved_object_with_non_finite_coordinates` FAILS on a `git archive HEAD` pre-fix shadow (5 failed / 2 behaviour-recording passed) and passes on the current revision; my own TestClient/DB/disk probe is green (EXPTIME=`1e400` -> 200/exposure None/one frame file/rows finite/export strict JSON; unresolved + Infinity/nan -> 200, `object_id None`, only None-or-finite stored). |
| dead `_finite_float` | Now used (`parse_ra_hours:150`, `parse_dec_deg:174`) with the docstring explaining why `_parse_value` keeps its own inline test; sexagesimal parsing is unaffected (`"00 42 44.3"` still parses - the `None` return falls through to the sexagesimal path). Focused suite 116 passed; full suite 449 passed / 0 failed. |

### The bypass (captain's #1 ask) - REPRODUCED, blocking

Using the real CLI path (`main(["--update"])`, with SELF redirected to a copy of
the guard so the in-flight coder work is not touched):

1. shadow tree, `astro.js` edited, token still 10 -> before `--update`:
   `scan()` FAILS ("still ?v=10").
2. `--update` -> exit 0, "wrote the verified baseline ... (10 modules)", and the
   baseline now records `astro.js: {token: "10", sha256: <edited bytes>}`.
3. after `--update`: `find_missed_bumps` -> `[]`, `stale_manifest_entries` ->
   `[]`, i.e. the guard PASSES on the unbumped tree; `pre_tag_check` consumes
   exactly this scan, so a 0.6.25 tag could ship the unbumped module.

So the protection is only as good as the discipline of whoever runs
`--update` - and the failure output itself recommends it ("the verified
baseline is stale (run `python scripts/check_js_tokens.py --update` ...)")
next to the genuine missed-bump finding. This is finding **R2-02** (medium)
unchanged: `--update` must refuse while `find_missed_bumps(<baseline>,<tree>)`
is non-empty (forcing the token bump) and may only refresh rows whose token
actually moved.

### Extra confirmations

- `scripts/check_js_tokens.manifest.json`: **gone** (`Test-Path` false); no
  undeclared artifact left behind.
- `tests/test_cache_tokens.py`: byte-identical to HEAD (`git diff --quiet`
  exit 0); the round-2 revert was clean.
- Latent bug 1 (regex): real `index.html` yields `app.js` + both stylesheets,
  and the regex handles `src=` after a preceding attribute
  (`<script type="module" src="app.js?v=7">` -> `("app.js","7")`).
- Latent bug 2: a shipped module missing from the tree is reported
  (`web/dragwin.js is referenced with a cache token but does not exist`), and
  `missing_from_tree` flags wholly removed baseline rows.
- Entry points at HEAD: `check_js_tokens` exit 0, `pre_tag_check 0.6.24` exit 0,
  `check_js.py` exit 0 (`check_js: OK`).
- `v0.6.24` = `25a19bb` (unmoved); `git log --oneline v0.6.24..HEAD` = `208f7d6`,
  `9596878` only; no commit/tag/deploy.

### Still open from the round-2 verdict

- **R2-02 (medium) - blocking**: the `--update` bypass above.
- **R2-01 (medium)**: `AGENTS.md:375`, `:526`, `:529` still describe the
  replaced tag-based rule and cite the removed `tests/test_cache_tokens.py`
  mutation pin; `--update` is still undocumented. Re-checked this pass, still
  present.
- **R2-03 (low)**: `--self-test` is still invoked by nothing (`check_js.py`,
  `pre_tag_check.py`, `tests/*.py` grep -> no matches), so the detection logic
  is unpinned in the normal suite.

### Coverage limits

Playwright still cannot launch in this sandbox (DE-01 has stub-DOM evidence
only). pytest's own tmp/basetemp dirs remain unusable (owner-SID-only DACL);
the review-side plugin `reviews/rv_plugin_r3.py` supplied a readable factory.
No production file was modified by the reviewer: the only worktree write was
the temporary `web/style.css` smudge/edit, restored byte-identically
(`git status` clean, sha256 `3AF454FB...`), and all probe artifacts were
removed. `t5` was already terminal (failed, `needs_revision`) when this
follow-up was requested, so the direct evidence above is attached here rather
than re-filed on the task.

---

## 7. Item-4 falsification pass (artifact moved after t4)

Revision at this pass: `app/fits.py` `0C7F79F3B6F37E8D`,
`scripts/check_js_tokens.py` `C70B0A91C3CC7372`, `tests/test_api.py`
`816910900EA43CD3`, `tests/test_fits.py` `3C6DF593A67EAAAC`, `app/database.py`
`49F20AB291D1F54D` (the coder's t6 storage-boundary work is landing and is out
of this round's scope).

### The `_finite_float` refactor (the dead-code item) - behaviour UNCHANGED

Falsified by equivalence, not by re-running the coder's probe: the current
`parse_ra_hours` / `parse_dec_deg` were compared against a reference
implementation of the pre-refactor (inline `float()` + `isfinite`) logic over a
435-input corpus (the captain's cases plus random decimal/comma/sexagesimal/
malformed shapes) - **zero divergences** in either parser.

Explicit checks, all pass:

- non-finite from BOTH parsers (`'Infinity'`, `'-Infinity'`, `'nan'`, `'1e400'`,
  `'inf'`, `float('inf')`, `float('nan')`, `float('-inf')`) -> `None`;
- finite unchanged incl. sexagesimal and comma forms: `'00 42 44.3'` ->
  0.7123055555555556, `'+41 16 09'` -> 41.26916666666667, `'+22 01'` ->
  22.016666666666666, `'+22 01'` with a degree sign, `5.575`, `5,575`,
  `-27.958`, `'12h 30m'` -> 12.5, `'12:30'` -> 12.5, `'-41 16 09'`;
- `None`, `''`, `'abc'`, `'12/34'` -> `None` from both;
- `_finite_float`: `'Infinity'`/`'1e400'`/`'nan'`/`'abc'` -> `None`,
  `'5.575'` -> 5.575;
- `_parse_value('1e400')` -> `None`; `_parse_value('Infinity')` -> `None`;
  `_parse_value("'Infinity'")` -> the STRING `'Infinity'`;
  `_parse_value('300.0')` -> 300.0; `_parse_value('2')` -> 2 (int).

Conclusion: the refactor is behaviour-preserving and the helper is no longer
dead (`parse_ra_hours:150`, `parse_dec_deg:174`). Item 4 PASSES.

### The other three items, re-checked at this revision

- XL-01-F1: real tree passes; shadow with `astro.js` edited and its token left
  at 10 -> FAILS `still ?v=10`.
- XL-01-F2: unchanged from section 6 (git-produced CRLF passes; a real edit on
  a CRLF tree fails). No web/ change in this pass.
- PY04-PIN-01: unchanged from section 6 (fails on the HEAD shadow, passes now).
- `scripts/check_js_tokens.manifest.json`: `Test-Path` false - **gone**.
- `tests/test_cache_tokens.py`: `git diff --quiet` exit 0 - **byte-identical to
  HEAD**.
- **BYPASS REPRODUCED again** (R2-02, blocking, unchanged): shadow `astro.js`
  edited with token 10 -> pre-update `scan()` FAILS; `--update` exits 0 and
  records `{astro.js: token "10", sha256 <edited>}`; afterwards
  `find_missed_bumps == []` -> the guard PASSES on the unbumped tree, and
  `pre_tag_check` consumes that same scan.
- Entry points at HEAD: `check_js_tokens` exit 0, `--self-test` OK,
  `pre_tag_check 0.6.24` exit 0, `check_js.py` exit 0 (`check_js: OK`).
- Tag unmoved: `v0.6.24` = `25a19bb`; `git log --oneline v0.6.24..HEAD` =
  `208f7d6`, `9596878` only (no commit/tag/deploy).

### Numbers (this pass)

| command | result |
| --- | --- |
| focused contract list (6 modules), review-side plugin `reviews/rv_plugin_r4.py` | **116 passed / 0 failed** |
| `python -m pytest tests/ -q -p rv_plugin_r4 -p no:cacheprovider` | **449 passed / 0 failed** |

The coder's t4 numbers (115 / 445) were consistent with t4's revision; the
current tree carries t6's in-flight additions, hence 116 / 449 here. Sandbox
caveat as before: pytest's own tmp dirs are DACL-broken, so the review-side
plugin (workspace factory under `.rv-tmp-root`) was used, not `--basetemp`.

### R2-01 / R2-03 status after the mid-pass AGENTS.md edit

- R2-01 is now **half fixed**: `AGENTS.md:375` (Commands bullet) was updated to
  "against the guard's embedded VERIFIED BASELINE". `AGENTS.md:527` and `:530`
  (the Versioning "A missed bump is now a hard failure" paragraph) still say
  "against the latest release tag" and still cite "Pinned by
  `tests/test_cache_tokens.py` (mutation proof on copies + the real defect
  replayed against `v0.6.23`)" - that pin no longer exists in that file.
  `--update` is still absent from AGENTS.md.
- R2-03 still open: `--self-test` is referenced nowhere in `check_js.py`,
  `pre_tag_check.py` or `tests/*.py` (0 matches), so the detection logic
  remains unpinned in the normal suite.

### Coverage limits

Playwright still cannot launch (DE-01 stub-DOM evidence only). No production
file was modified by the reviewer in this pass; all probe artifacts removed.

### Transient-state note

Immediately after the verification above, `scripts/check_js_tokens.py` changed
again while the reporter was still running: the current working copy fails to
parse (`SyntaxError` at line 451, inside a comment mentioning
`R2-02 (round-2 review): the "baseline is stale - run --update" hint ...`) -
i.e. the coder is mid-implementation of the R2-02 fix. Every result in this
document is tied to the recorded revision (`scripts/check_js_tokens.py`
`C70B0A91C3CC7372`), not to the byte state at the moment of reading. The
in-flight edit is not a finding; it does mean the entry points must be re-run
once the round that implements R2-02 is complete.



