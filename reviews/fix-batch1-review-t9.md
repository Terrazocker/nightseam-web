# Fix batch 1 - t9 re-gate of round 3 (t8)

Reviewer: reviewer (independent verifier)
Reviewed task: t8 (R2-01 docs, R2-02 `--update` refusal, R2-03 pin wiring)
Judged against: `reviews/fix-batch1-review.md` (R1),
`reviews/fix-batch1-review-r2.md` (R2-01/R2-02/R2-03), and the code itself.

Verdict: **PASS** - all four gate items verified on the current revision, no
findings.

Revision pinned (sha256, first 16): `scripts/check_js_tokens.py`
`9B4D646198B071C2`, `AGENTS.md` `F6BAEB58FF47E5E5`, `tests/test_pre_tag_check.py`
`27850E4C7051A266`, `scripts/check_js.py` `749A583F8C34A0A7`,
`scripts/pre_tag_check.py` `F7A05A424088FE41`.

---

## 1. R2-02 reconciliation - the bypass is closed

Re-ran the reviewer's own bypass against the CURRENT code.

- Missed-bump shape (shadow of the real `web/` tree, `astro.js` bytes edited,
  token left at 10): `tree_problems` reports
  `web/astro.js changed but its cache token is still ?v=10` and the
  stale-baseline hint is **NOT** emitted alongside it.
- `--update` on that tree REFUSES:
  - `main(["--update"])` (real code path, WEB redirected to the shadow) -> exit
    **1**, and the guard copy is **byte-identical** before/after
    (`9b4d646198b0...`);
  - `write_baseline()` returns `None`;
  - the LITERAL real CLI on a real missed bump (`web/astro.js` appended,
    temporarily): `python scripts/check_js_tokens.py --update` -> exit **1**,
    output `check_js_tokens: REFUSED - bump the token(s) above in the same
    change`, and the guard file stayed byte-identical
    (`9b4d646198b071c2...`). `web/astro.js` was restored byte-identically
    (`3fcb17f9f4795170...`, `git status` clean) and the guard passes again.
- A genuine bump is allowed: same shadow with `astro.js` bytes changed AND its
  import token moved to `?v=11` and the entry point to `app.js?v=61` ->
  `update_refusals == []`, `--update` exits **0**, and the refreshed baseline
  records `astro.js: {token 11, sha256 <new bytes>}` and `app.js: token 61`,
  while untouched modules (`horizon.js`) keep their verified rows.
- No leg lets the unbumped state pass: scan/`tree_problems` FAIL, the remedy
  refuses, and the recomputed rows could not record the unbumped pairing either.

## 2. R2-03 - the detector is pinned in the normal paths

Blinded detector (temporary edit: `find_missed_bumps` made to `return []`,
sha-verified restore after):

- `python scripts/check_js.py` -> **FAIL (exit 1)** with
  `js-token: the missed-bump detector failed its built-in self-check - the guard
  cannot be trusted`;
- collected `tests/test_pre_tag_check.py` -> **FAILED** (2 tests:
  `test_main_exit_codes` and
  `test_token_guard_is_wired_and_would_block_a_stale_tag`), i.e. the failure
  comes through `pre_tag_check.main()` -> `token_problems()` -> `scan()` ->
  `detector_ok()`, not only from the opt-in `--self-test`;
- `--self-test` also fails (opt-in path);
- guard restored byte-identically (`9b4d646198b071c2...`), `check_js.py` OK and
  `--self-test` OK again.

`scan()` calls `detector_ok()`, which evaluates the self-test once per process
(`_DETECTOR_OK` cache) - verified in the code and by the blinded run.

## 3. R2-01 - AGENTS.md against the code (sentence by sentence)

| AGENTS.md claim (lines 525-544 and 373-377) | Code | Result |
| --- | --- | --- |
| "compares each tokenized web/ module against a VERIFIED BASELINE: generated `{module: {token, sha256}}` block embedded in the guard" | `_VERIFIED_BASELINE_JSON` + `load_baseline` markers | TRUE |
| "records the last state in which the bytes/token pairing was confirmed" | `write_baseline`/`refreshed_rows` | TRUE |
| "one-way rule: bytes differ from baseline while the token still equals the baseline token = FAIL, regardless of how the token compares to any tag" | `find_missed_bumps` (proved with token 10 vs the tag's 9) | TRUE |
| "a token that moved over unchanged bytes is the legitimate post-tag repair shape and leaves the baseline to be refreshed" | `find_missed_bumps` skips; `stale_manifest_entries` reports | TRUE |
| "`--update` REFUSES while any missed bump is present (bump the token in the same change first)" | `main --update` -> `update_refusals` -> exit 1 (proved) | TRUE |
| "rewrites only the rows whose token actually moved" | `refreshed_rows` keeps the baseline hash when the token is unchanged (proved) | TRUE |
| "the stale-baseline hint is never printed alongside a missed-bump finding" | `tree_problems`: stale only `if not missed` (proved) | TRUE |
| "hashes are line-ending-normalized, so a CRLF checkout is not a finding" | `_norm`; git-produced CRLF hashes equal; CRLF-only shadow -> no findings | TRUE |
| "pinned by the guard's built-in `--self-test` (0.6.25 shape, CRLF, `--update` refusal, hint gating), which `scan()` re-runs once per process" | `_self_test` checks 1-4 (+ baseline round-trip); `detector_ok` cache | TRUE |
| "check_js.py and the collected tests/test_pre_tag_check.py both fail if the detector regresses" | blinded-detector run: both FAILED | TRUE |

No sentence overstates a guarantee; the two passages now describe the rule the
code actually implements (the round-2 failure mode was docs describing a
replaced rule - not repeated here).

## 4. No collateral

- The four earlier items stay PASS by their own notes and are untouched:
  `app/fits.py` `0C7F79F3B6F37E8D`, `app/database.py` `49F20AB291D1F54D`,
  `app/backup.py` `6E2FF9B05488D882`, `app/server.py` `86EA3B9F68D0D1B2`,
  `tests/test_api.py` `816910900EA43CD3`, `tests/test_backup.py`
  `47266F996AB8955D`, `tests/test_fits.py` `3C6DF593A67EAAAC` - all identical
  to the hashes recorded in the t5/t7 reviews.
- The verified baseline was **not** silently rewritten: all 10 rows are
  byte-identical to the pairing recorded at t4 (`{module: {token, sha256}}`:
  60/10/17/1/17/41/7/16/4/20 with the same hashes), and every hash equals
  `_sha(<current worktree bytes>)`, so the baseline matches the tree it claims
  to verify.
- Tag/commits: `v0.6.24` = `25a19bb`; `git log --oneline v0.6.24..HEAD` is
  still exactly `208f7d6`, `9596878`; no commit/tag/deploy.
- t8 scope: the only files that differ from the reviewer's pre-t8 snapshots of
  the tracked worktree are `AGENTS.md` and `scripts/check_js_tokens.py`; every
  other modified file matches its earlier-round hash, and the remaining
  round-1/2 changes are the known ones (contents re-read: `check_js.py:36`
  calls `_run("check_js_tokens")`; `pre_tag_check.py:44` calls
  `_load("check_js_tokens").scan()`; no t8 addition in the test files).
- Entry points at this revision: `check_js_tokens` exit 0, `--self-test` OK,
  `pre_tag_check 0.6.24` exit 0, `check_js.py` exit 0 (`check_js: OK`).
- Suites: token-focused tests (`test_pre_tag_check`, `test_cache_tokens`) 7
  passed; **full suite 449 passed / 0 failed** (review-side workspace tmp
  factory `reviews/rv_plugin_t9.py`, since pytest's own tmp dirs are
  DACL-broken in this sandbox).

## 5. Coverage limits

Playwright still cannot launch in this sandbox (irrelevant to this Python/JS-
tooling change but stated). The R2-03 proof required a temporary mutation of
`scripts/check_js_tokens.py`; it was restored byte-identically and verified
(sha256 + `check_js.py` + `--self-test` green afterwards). The R2-02 E2E proof
required a temporary edit of `web/astro.js`; restored byte-identically
(`git status` clean). No other production file was modified by the reviewer;
all probe artifacts were removed.

## 6. Commands run (observed)

| command | result |
| --- | --- |
| `python reviews/.rv_t9_probe.py` (baseline integrity + R2-02 legs + CRLF) | all PASS |
| `python reviews/.rv_t9_e2e.py` (real CLI `--update` on a real missed bump) | scan exit 1 with `still ?v=10` and no stale hint; `--update` exit 1 REFUSED; guard byte-identical; astro.js restored |
| `python reviews/.rv_t9_blind.py` (blinded detector) | `check_js.py` FAIL; `test_pre_tag_check.py` FAILED; `--self-test` FAIL; guard restored byte-identically; both pass again |
| `python scripts/check_js.py` / `check_js_tokens.py` / `--self-test` / `pre_tag_check.py 0.6.24` | exit 0 each |
| `python -m pytest tests/test_pre_tag_check.py tests/test_cache_tokens.py -q` | 7 passed |
| `python -m pytest tests/ -q -p rv_plugin_t9 -p no:cacheprovider` | 449 passed / 0 failed |
| `git rev-parse v0.6.24; git log --oneline v0.6.24..HEAD` | `25a19bb`; only `208f7d6`, `9596878` |
