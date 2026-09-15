# Tests & release lane - guards, coverage, release integrity

Subject: `v0.6.32-3-g3277846` (HEAD `3277846`); tree clean apart from untracked
`REVIEW-PROMPT.md` + `reviews/0.6.32-full/`. Lane L7 of `REVIEW-PROMPT.md`. Probes
and captured output: `reviews/0.6.32-full/evidence/tests/` (`*.log`).

## What I checked (and how)

- `python scripts/check_js.py` -> **check_js: OK** (imports 76 files, syntax 76 modules, encoding OK, catalog-token OK, js-tokens self-test OK, core OK, `check_js_defs` 10 candidates): no guard is red on the real tree.
- `check_js_syntax.py`'s declared scope MEASURED: 23 `static/js/*.js` + 8 `web/*.js` + 9 `core/**` + 18 `web/core/**` + 18 `static/js/core/**` = 76 = its own count, so the TO-06 claim (both baked trees) holds today.
- Each guard's ability to FAIL proven off-tree (`syntax_encoding.log`): duplicate `const` -> exit 1, missing path -> exit 2; non-UTF8, BOM, C1 controls and a cp1252 mojibake cluster all reported, clean text not reported.
- `check_js_tokens.py` end to end on a mirror (`probe_tokens.py`): real `app.js` bytes with `?v=80` unchanged -> `FAIL (1)`; `--update` -> `REFUSED`, guard file byte-identical. `--self-test` 11/11 PASS.
- `check_core.py`: `test_core_drift.py`'s mutation proofs run (on copies); two live probes with temporary `web/zz_*` files removed in a `finally` (`guard_holes.log`; `git status --porcelain -- web` empty afterwards).
- Release chain read + run where safe: `pre_tag_check.py 0.6.32` -> 0, `9.9.9` -> 1, `build_changelog.py --check` -> 0; empty-curated-entry and committed-catalog shapes probed with the guards' own pure functions.
- Browser gate: `--list` = 22 checks (14 web + 8 desktop); `check_browser.py`, `harness.py`, both suites and `test_browser_gate.py` read in full. No launch (this sandbox denies Chromium).
- Reference anchors: `node tests/js/reference_anchors.mjs` -> 19 checks, 0 failed; `pytest tests/test_reference_anchors.py -q` -> 10 passed (the proofs really fail a perturbed core copy and pass the real one).
- 110 targeted guard tests pass (`test_core_drift`, `pre_tag_check`, `release_check`, `js_guards`, `cache_tokens`, `js_syntax_check`, `encoding`, `deploy_order`); `--collect-only` -> 508; full read of `tests/*.py` for vacuous assertions (see "Test-quality sample").
- `tests/conftest.py`: `default_archive_dir` is the only profile-reaching path and `app/database.py:710` imports it lazily inside `image_dir()`, so the autouse monkeypatch bites; no other home path in `tests/`.

## Findings

### TR-01 medium CONFIRMED - a COMMITTED missed `CATALOG_TOKEN` bump is invisible, and no release gate runs the catalog guard at all
- `scripts/check_catalog_token.py:86-93` - impact: the ~4 MB `web/catalog.json` keeps being served from the browser cache under an unchanged `catalog.json?v=9` URL, so a catalog fix never reaches a returning visitor (the 0.6.12 defect).
- mechanism: the only "bytes changed, token did not" rule is `git diff --quiet HEAD -- web/catalog.json`, empty after the commit; the manifest/token comparison is self-consistent as soon as the manifest `sha256` is refreshed (what the documented workflow asks for). `check_js_tokens`' one-way baseline covers JS modules, not this data token, and neither `pre_tag_check.py` nor `check_release.py` calls this guard.
- evidence (`catalog_committed.log`): copies of the three real files + the REAL clean git -> `guard verdict for the shipped (committed) shape: []`; control with a faked dirty tree -> `web/catalog.json differs from HEAD but CATALOG_TOKEN in web/app.js does not`.
- repro `python reviews/0.6.32-full/evidence/tests/probe_catalog_committed.py` - requiredFix: record a verified `{token, sha256}` catalog baseline (or extend the js-tokens baseline) so the rule is commit-state independent, and wire the guard into `pre_tag_check.py` - counterArgument: the manual rule is documented, the docstring states the HEAD rule needs a working-tree diff, and `check_js.py` catches the slip whenever it runs before committing.

### TR-02 medium CONFIRMED - `check_core.py`'s MOVED scan misses a core concept re-implemented as an object property
- `scripts/check_core.py:215-229` - impact: astronomy/planning math can be re-implemented in `web/` (e.g. `precessJ2000ToDate`, `altaz`) while `check_js.py`, `pre_tag_check.py` and `check_release.py` all report clean - the Phase C "core is the only implementation" invariant silently ends.
- mechanism: `sneak` needs `name\s*=` or `name(...) {` preceded by line start / `;` / `}`; an object property (`name: (…) => …`) or a method on the same line as `{` matches neither.
- evidence (`guard_holes.log`): `web/zz_l7_probe_a.js` = `export const SUN = { precessJ2000ToDate: (jd) => jd + 1, };` -> `check_core: OK` (exit 0); positive control `export function precessJ2000ToDate(...)` -> `precessJ2000ToDate() must live in core/ only` (exit 1); `test_core_drift.py:158-161` lists four evasions, not this one.
- repro `python reviews/0.6.32-full/evidence/tests/probe_guard_holes.py` - requiredFix: also match a property/method position (`(?:^|[{,;}\n])\s*name\s*[:(]\s*(?:\(|async\b|function\b|[\w$]+\s*=>)`) and add the evasion to that mutation test - counterArgument: the least natural of the covered forms, and a shell importing the real helper is the only way to behave correctly anyway.

### TR-03 medium CONFIRMED - `check_js_imports.py` never resolves `export … from`, so a broken re-export can ship a dead app in both shells
- `scripts/check_js_imports.py:25-27` - impact: the guard's headline promise is the boot-killer class (a name the target never exported "aborts the ENTIRE module graph"); `core/index.js` is nothing but re-exports and both `core.js` stubs re-export from it, so one typo there kills every shell module with all static guards green.
- mechanism: `IMPORT_RE` requires the literal `import`; `export {x} from './y.js'` and `export * from './y.js'` are never visited, so neither the specifier nor the exported names are checked.
- evidence (`guard_holes.log`): `web/zz_l7_probe_c.js` = `export { nothing } from './does-not-exist-l7.js';` -> `checked 78 js files, 0 broken import(s)` (exit 0); positive control `import { nothing } from './does-not-exist-l7.js'` -> `BROKEN ... -> ./does-not-exist-l7.js` (exit 1).
- repro `python reviews/0.6.32-full/evidence/tests/probe_guard_holes.py` - requiredFix: add `export\s*(?:\*|\{[^}]*\})\s*from\s*["']([^"']+)["']` and run the same resolve + named-export check - counterArgument: the browser gate would notice a dead web app, but only on the staged build, and the desktop shell has no equivalent gate.

### TR-04 medium CONFIRMED - the `desktop-worker-kill-sync-fallback` browser check cannot fail
- `tests/browser/desktop_suite.py:99-108` - impact: the only coverage named for the documented worker-death -> in-thread sync fallback ("worker recovery coverage") passes whether or not the fallback exists.
- mechanism: `c.expect(killed is False or killed is True, ...)` is true for any bool, and the remaining assertion (`rows(c) > 0` after a plain date change) is the sequence `desktop-worker-date-change` runs at `:88-90`, which passes with a live worker - a no-op `__NS_KILL_WORKER` is undetectable.
- evidence: `desktop_suite.py:88-91` does exactly `set_date` / `wait_night_loaded` / `rows > 0` with no kill; nothing asserts the worker was dead or that the plan came from the sync builder.
- repro: read `tests/browser/desktop_suite.py:95-108` (`--list` shows the name) - requiredFix: assert the hook's real result and an observable sync-path marker - counterArgument: it still pins "a date change after the kill hook does not hang", the user-visible half; only the attribution is unproven.

### TR-05 low CONFIRMED - every curation gate tests membership while the generator tests truthiness: an EMPTY curated entry ships an unannounced release
- `scripts/pre_tag_check.py:49-51`, `scripts/check_release.py:654`, `scripts/build_changelog.py:187-202` - impact: with `CURATED["0.6.33"] = ""` (the "add the key now, write the text later" slip) `pre_tag_check.py` exits 0, `check_release.py` finds no error and `--check` reports OK, while `build_entries` skips it: `landing/changelog.json` never mentions a shipped version.
- mechanism: the gates use `released not in state.curated` / `v in curated`; `build_entries` uses `if summary:`.
- evidence (`changelog_empty.log`): `pre_tag_check.check('9.9.9')` = `False` with no key, `True` with `""`; `split_uncurated` backlog `[]`; `build_entries` -> `['0.6.32', '0.6.31']` (9.9.9 absent).
- repro `python reviews/0.6.32-full/evidence/tests/probe_changelog_empty.py` - requiredFix: require a non-empty `.strip()` value in all three places - counterArgument: `check_release.parse_changelog` does reject an empty `summary`, but only after the regeneration step that omits the entry.

### TR-06 low CONFIRMED - `check_js_tokens.main()` reads the embedding process's `sys.argv`, so a flag on `check_js.py` silently replaces the token scan
- `scripts/check_js_tokens.py:650-654` vs `scripts/check_js_syntax.py:232-235` - impact: `python scripts/check_js.py --self-test` prints `check_js: OK` without running the missed-bump scan; the same leak makes `check_js.py --update` rewrite the tracked guard's baseline.
- mechanism: `_run()` calls `mod.main()` with no arguments and `main(argv=None)` falls back to `list(sys.argv[1:])`; `check_js_syntax` deliberately does the opposite and `tests/test_js_syntax_check.py:213-221` pins that rule for it.
- evidence: `python scripts/check_js.py --self-test` printed the guard's `PASS 0.6.25 shape ...` / `check_js_tokens self-test: OK` instead of a baseline verdict; a bare `check_js.py` prints `js-token: OK`.
- requiredFix: default `main(argv=())` or have `_run()` pass `[]` - counterArgument: `check_js.py` accepts no flags, so that command is misuse; the `--update` refusal still prevents blessing a missed bump.

### TR-07 low CONFIRMED - `tests/test_ui_invariants.py::_read` turns a MISSING file into a SKIP
- `tests/test_ui_invariants.py:25-29` - impact: renaming a subject file (e.g. `web/app.js`) retires ~25 text invariants - including "the popularity score is never rendered" - with a green run, against the project's own rule (FIX-9b/TS6: a green run must never mean "not checked").
- mechanism: `if not path.is_file(): pytest.skip(...)`.
- evidence: `pytest .../probe_read_skips.py -rs` -> `SKIPPED [1] tests\test_ui_invariants.py:28: ...\web\definitely-not-here-l7.js is not present` (the real helper called with a missing path).
- requiredFix: `pytest.fail` (or assert the file exists) instead of `skip` - counterArgument: the file set is stable, so this is latent, not live.

### TR-08 low CONFIRMED - `build.ps1` computes `git status --porcelain` but refuses only a `-dirty` describe, so UNTRACKED bundled files do not block a clean-tag build
- `build.ps1:151-169` - impact: an untracked file under `static/` (bundled by `--add-data static;static`) or `app/data/` is compiled into `dist\NightSeam.exe` while the exe claims a clean tag; `check_release.py` compares versions, not contents.
- mechanism: `git describe --dirty` sees tracked modifications only; `$changed` (which does include untracked files) is used solely in the warning text.
- evidence: `git describe --tags --always --dirty` -> `v0.6.32-3-g3277846` (no `-dirty`) while `git status --porcelain` lists `?? REVIEW-PROMPT.md`.
- requiredFix: refuse when `$changed` is non-empty, excluding the gitignored bakery (`app/_version_baked.py`, `web/version.json`, `logs/`, `data/`) - counterArgument: the operator sees the file in `git status`, and only an untracked file the app actually loads changes behaviour.

### TR-09 low CONFIRMED - three stale "missing node = skip" statements contradict TO-03's hard failure
- `scripts/check_js.py:8-10` and `:33`; `tests/test_js_syntax_check.py:41` - impact: the aggregate guard's own contract says the syntax checker "skips itself when node is not installed" while it now prints `check_js_syntax FATAL: node is not installed` and returns 2 - a reader believes a node-less run parsed the JS.
- evidence: `scripts/check_js_syntax.py:262-264` + `test_js_syntax_check.py:181-192` pin the FATAL; the three comments still say "skip".
- requiredFix: correct the three comments - counterArgument: wording only; the code and the tests are right.

### TR-10 low CONFIRMED - the reference-anchor mutation proofs cover 8 of the 19 anchors; the altaz-derived group has none
- `tests/test_reference_anchors.py:114-163`; claim in `AGENTS.md` and the docstring `:17-19` ("Every anchor group below has a mutation proof") - impact: nothing proves a wrong `altaz` model is caught, and no test asserts which anchors carry a bite proof - the claim overstates the coverage.
- mechanism: the eight proofs perturb forward/inverse precession, GMST, the solar model, lunar longitude/phase, refraction and JD; `altaz` is never mutated.
- evidence: `node tests/js/reference_anchors.mjs` -> 19 ids, 0 failed; `pytest tests/test_reference_anchors.py -q` -> 10 passed; the `_assert_*` tests name those eight ids only.
- requiredFix: add an `altaz` perturbation proof, or narrow the claim to "per model group" - counterArgument: all 19 anchors are absolute published-value assertions, so a broken `altaz` would fail the suite; only the proof of bite is missing.

### TR-11 low CONFIRMED - three assertions in the suite cannot fail for what they name (two comment-only pins, one entailed line)
- `tests/test_ui_invariants.py:497` and `:547`; `tests/test_fits.py:100-101` - impact: `assert "already erased" in js` ("contextmenu must not perform a separate one-shot erase") and `assert "open above" in sky` are satisfied only by comment text, so the behaviour they name could return green (and a comment edit would fail them); `tests/test_fits.py:101` is constant-true once `:100` asserted `got is None`.
- mechanism: the two literals occur exactly once in the guarded files, in comments (`web/horizon.js:1230`, `static/js/skyview.js:353`, verified with `Select-String`); `assert not (isinstance(got, float) and not math.isfinite(got))` is entailed by `got is None`.
- evidence: the `Select-String` output above; the same tests' real pins are the neighbouring assertions (`strokeAt(x, y, gestureErase)` at `:494`, `hatchPoly` at `:546`).
- requiredFix: assert the handler/legend code shape or DOM text instead of a comment substring; drop the entailed line - counterArgument: all three sit inside tests whose other assertions still have teeth (dead weight, not lost coverage).

## Test-quality sample (the lane's "tests that cannot fail" question)

- **3 assertions cannot do their job** (TR-11, verified in place) out of the 508 collected; no other hit in the sharp classes.
- **0 swallowed assertions** in `tests/*.py`: every `except` is `OSError` -> `pytest.fail` or one of the two deliberate mutation proofs (`test_core_fixtures.py:82-85`, `test_reference_anchors.py:77-80`); no `assert True`, no self-comparison, no assert-free test body.
- **Refuted candidates** (checked, not vacuous): `test_backup.py:535`'s `all(... for p in db.panoramas())` - `_seed()` adds panorama `p1` (`test_backup.py:39`), so the collection is non-empty and it can fail; the `zip(fixtures, got)` loops in `test_core_fixtures.py` / `test_core_time.py` / `test_js_parity.py` are length-matched by construction (the node harnesses `map()` over the same sections); the conditional skips (`test_paths.py:79` symlinks, `test_main.py:74` bind probe, `test_deploy_order.py:32`, `test_js_syntax_check.py:46` skipif) are environment-conditional, not constant.

## Refuted (claims I checked that are NOT bugs)

- `check_release.py`'s comparisons are genuine: staged zip `sha256`/`size` vs `version.json` (`:664-712`), the zip really contains `NightSeam.exe` with the loose exe's size (`:715-740`), the staged exe sha256 vs `dist/NightSeam.exe` (`:845-853`), `ns-version.js` version+url, the changelog schema (non-empty `version`/`date`/`summary`, `X.Y.Z`, sorted, newest vs release) and the `git describe` grammar (dirty, off-tag, `0.0.0`, bare sha all rejected); `make_release.py` re-checks core drift before AND after staging.
- A stale `web/version.json` / `landing/changelog.json` is only a WARNING, documented as repairable later in the release order - not a defect.
- `check_js.py` DOES run `check_js_tokens` (`:36`) and `pre_tag_check.py` runs its `scan()`; `check_js_defs.py`'s always-exit-0 heuristic IS documented as such.
- A browser/driver that cannot launch hard-fails: `harness.py:344-350`, `:362-366`, `check_browser.py:50-55` return 2, no `pytest.skip` exists in `tests/browser/`, and `test_browser_gate.py::test_browser_gate_driver_start_ failure_is_exit_2` passes in my 110-test run.
- `check_js_tokens`' CRLF normalization, `--update` refusal and "stale hint suppressed alongside a missed bump" are real (`--self-test` 11/11 + the end-to-end mirror probe).
- The conftest profile claim holds (see above); `test_api.py:39` and `test_backup.py:23` redirect `data_dir`/pano paths to tmp for the writers.
- `web-sun-moon-above-horizon:365` (`sunVis == (sun > 0)`) is weak but NOT a tautology - it compares the app's `aboveHorizon()` with a sign test and would fail for a refracted-altitude implementation. The min-vis/tier checks that write `#pct-status`/`#busy` text directly test the CSS layout contract - legitimate.
- `tests/test_browser_gate.py`'s roster lists are a minimum-subset source-text pin, so the three checks missing from them still pass - weak, not defective.
- Doc drift (L10's lane, noted not filed): 507 documented vs **508 collected**; "38 test modules" vs 36 `.py` files (34 `test_*.py`).
- Tree hygiene: after every probe `git status --porcelain` shows only `?? REVIEW-PROMPT.md` and `?? reviews/0.6.32-full/`.

## Not checked (honest coverage gaps)

- No full `pytest tests/ -q` (the captain's gate) and no coverage measurement: `coverage` is not installed and installing is out of bounds.
- No real-browser run (this sandbox cannot start Chromium): TR-04 rests on the source and `--list`. Two further read-only observations I could not execute: `harness.py:330-332` returns **0** when a filter selects nothing (`--only <typo>`), and `harness.py:292-296` swallows a `page.clock.install` failure, so the documented "pinned clock" determinism has no signal if it stops applying.
- No node-less run: the missing-node paths are pinned by tests that monkeypatch `find_node`, not by an environment without node.
- `build.ps1` was not executed (no exe build): TR-08 is a read + `git describe` observation, not a built exe carrying an untracked file.
- `make_release.py` / `check_release.py` were not run end to end (they write `dist/release/`); their logic was read and probed through pure functions only.
- No live deploy/FTPS check that the uploaded tree equals the gated tree.
