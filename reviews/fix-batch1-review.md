# Fix batch 1 - independent review (t2)

Reviewer: reviewer (independent verifier)
Reviewed task: t1 (implementation r1) - PY-04, DE-01, XL-01 durable half
Attempt: 9880bc3f-68ad-449d-b8f9-b13ccd664077
Judged against: `reviews/0.6.24/REVIEW-0.6.24.md` revision 6
(sha256 `323159B262C18DF91B06FB30BD1CC2E207C6BC570D50B62C2ED72C3DEEBD2CDB`,
verified), `reviews/0.6.24/70-verification.md`, and the lane files
`10-python.md` (PY-04), `40-desktop.md` (DE-01), `30-web.md` +
`50-tests-tooling.md` (XL-01).

Verdict: **needs_revision** (XL-01 durable half is not durable for the six
modules the v0.6.24 repair touched).

Changed production paths under review (`git status`): `app/fits.py`,
`static/js/setup.js`, `scripts/check_js.py`, `scripts/pre_tag_check.py`,
`tests/` (5 files), `AGENTS.md`, new `scripts/check_js_tokens.py`. No
`web/`, `core/`, `app/database.py`, `data/`, `logs/` change.

---

## 1. PY-04 - non-finite FITS header numbers: PASS

Code (opened at the cited lines):

- `app/fits.py::_parse_value` (line 131-136): `float()` result is returned only
  when `math.isfinite`; `'1e400'`/`'Infinity'`/`'nan'` -> `None`.
- `app/fits.py::parse_ra_hours` / `parse_dec_deg` (lines 146-159, 172-186): the
  decimal branch is finite-guarded and the sexagesimal branch rejects any
  non-finite part (`all(math.isfinite(v) ...)`).
- `app/imglib.py::angular_dist:120-125` is the certified 500 site
  (`math.sin(radians(inf))`); it is now only reached with finite inputs because
  the parsers return `None` first.

Independent reproduction (reviewer probe, real `create_app()` + `TestClient`,
hand-built FITS cards, DB rows and disk files inspected - not the coder's test
helpers):

- Pre-fix blob (`git show HEAD:app/fits.py`): `_parse_value('1e400')` is `inf`,
  `parse_ra_hours('Infinity')` is `inf`.
- Pre-fix tree (`git archive HEAD` into a shadow, new tests copied in):
  `EXPTIME='1e400'` ingest raises before the response can be serialized
  (`ValueError: Out of range float values are not JSON compliant: inf`, the
  certified defect). The reviewer's own probe crashes at that same POST.
- Post-fix tree: EXPTIME=`1e400` -> HTTP 200, `exposure` None, one `images`
  row with NULL exposure, `import_batches.total_exposure = 0.0`, exactly one
  frame file on disk, `/api/library`, `/api/library/imports`,
  `/api/library/export?format=json` all 200, export parses as strict JSON with
  no `Infinity`/`NaN`.
- Unresolved OBJECT + `OBJCTRA='Infinity'` / `nan` coords / `OBJCTDEC='1e400'`
  -> HTTP 200, frames stored finite (object id None), no stored non-finite
  float anywhere in `images` (ra/dec/exposure checked).

Pins (reproduced by the reviewer):

- Failing-before (pre-fix shadow tree): `test_parse_value_rejects_non_finite_numbers`,
  `test_parsers_reject_non_finite_coordinates`,
  `test_read_fits_header_non_finite_exptime_is_none`,
  `test_ingest_extreme_exptime_leaves_a_healthy_library` - 4 FAILED.
- Passing-after: all 117 tests of the contract module list pass on the working
  tree.

Pin caveat (low): `test_ingest_non_finite_coordinates_do_not_corrupt_the_library`
PASSES on the pre-fix tree - it uses `OBJECT 'M 31'`, which resolves by name,
so `angular_dist` is never reached. It records intended behaviour (allowed by
the acceptance for the nan case) but it is not a failing-before pin for the
certified coordinate 500; that path is pinned only at the parser unit level.

## 2. DE-01 - custom target never rebuilds the plan: PASS

- `static/js/setup.js:216-221`: the add path now ends in `loadNight()` after
  `await refreshCatalogMeta(); renderCustomList(); renderTargets();` - the same
  shape as the sibling mutators at `:55`, `:337`, `:343` (all unawaited
  `loadNight()`), so no new await/racy pattern was introduced and no extra
  reload is issued.
- The certified record notes the delete path needs no reload because
  `targets.js:126` skips ids whose metadata is gone; confirmed by reading
  `refreshCatalogMeta()` (it rebuilds `S.catalog`/`S.meta` without the deleted
  id), so the delete path is not a finding.
- Harness, real modules under the stub DOM:
  - working tree -> `DE-01 handler: custom target add rebuilds the plan held`
    (`node tests/js/dom_handlers.mjs`, exit 0).
  - shadow tree with `setup.js` replaced by the HEAD blob (no `loadNight()` on
    the add path) -> `DE-01 handler: FAILED (new target absent from the plan:
    [])`. The pin fails before / passes after.

## 3. XL-01 durable half - FINDINGS (guard gap)

Wiring is real and works in the general case:

- `scripts/check_js_tokens.py::scan()` compares each tokenized `web/` module's
  worktree bytes against the latest release tag;
  `scripts/check_js.py` adds `_run("check_js_tokens")`; `pre_tag_check.py`
  calls `check_js_tokens.scan()` through `token_problems()`.
- At HEAD: `check_js_tokens` OK (exit 0), `check_js.py` OK (exit 0),
  `pre_tag_check.py 0.6.24` OK (exit 0).
- Mutation proof: appending a byte to `web/style.css` (token 16 == tag's 16)
  makes `check_js_tokens` exit 1, `pre_tag_check 0.6.24` exit 1, `check_js.py`
  exit 1. The real file was restored byte-identically (sha256
  `3AF454FB...567D2`, `git diff` empty).
- Historical replay: `scan_at("v0.6.24", "v0.6.23")` reports exactly the six
  stale modules and `scan_at("208f7d6","v0.6.23") == []`.
- Tag untouched: `v0.6.24` = `25a19bb` "NightSeam 0.6.24"; the repair commit
  `208f7d6` is NOT contained in the tag; exactly one `v0.6.24` tag exists;
  HEAD = `9596878` (2 commits past the tag).

### XL-01-F1 (high) - the guard is blind to a missed bump on every module the 0.6.24 repair touched

File: `scripts/check_js_tokens.py:162-174` (`compare_modules`).

Problem: the guard reports only when `bytes changed AND cur token == tag token`.
The six modules the v0.6.24 repair bumped (`app.js` 59->60, astro 9->10,
format 16->17, horizon 40->41, nightrank 6->7, webstore 19->20) now carry a
tree token that ALREADY differs from the tag's stale token, so the condition is
false for them no matter what their bytes become. For the immediately next
release (`0.6.25`), `latest_release_tag()` is still `v0.6.24`, so
`pre_tag_check.py 0.6.25` and `check_js.py` cannot see a forgotten bump on
these six modules - which is exactly the certified defect (`XL-01`), i.e. new
bytes shipped under the token a returning 0.6.24 visitor already has cached.

Proof (reviewer probe, real trees, nothing mutated): shadow of the working
`web/` tree against the real `v0.6.24` baseline.

- `web/style.css` bytes changed, token 16 == tag 16 -> FAIL reported.
- `web/astro.js` bytes changed, token left at the tree's repaired 10 while the
  tag declares 9 -> **no finding** (`scan()` returns `[]`).
  Tag token 9, tree token 10, `base_hash != cur_hash`, `tok != base_tok` ->
  `continue`.

RequiredFix: make the baseline "the last state in which the bytes/token pairing
was verified", not the tag's declared token. E.g. commit a per-module
`{path: sha256, token}` manifest (updated whenever the guard passes, like
`catalog.manifest.json`/`CATALOG_TOKEN` do for the catalog data file) and fail
when a module's bytes differ from the manifest while its token equals the
manifest's token. At minimum, `compare_modules` must not treat "token differs
from the tag" as proof that the current bytes were bumped. Add a pin for the
0.6.25 shape: base manifest naming the tag bytes with token 10, tree carrying
new bytes with the same token 10 -> must FAIL.

### XL-01-F2 (medium) - byte comparison is not line-ending normalized; a routine smudge makes the guard fail spuriously

File: `scripts/check_js_tokens.py:162-174` (raw `read_bytes()` vs
`git show` blob bytes).

Problem: this repo has `core.autocrlf=true`, so any `git checkout`,
`git restore` or `git stash pop` writes `web/` modules with CRLF while
`git show <tag>:web/<name>` returns LF. The guard then sees "bytes changed" for
the modules whose token still equals the tag's (`style.css`, `themes.css`,
`dragwin.js`, `core.js` at HEAD) and reports spurious missed bumps. Reproduced
during this review: after `git checkout -- web/style.css` the guard reported
`web/style.css changed but its cache token is still ?v=16` and two
`pre_tag_check` tests failed mid-suite; restoring the original LF bytes made
it pass again. On a fresh Windows clone (global `autocrlf=true`) `check_js.py`
would fail at HEAD for those four modules.

RequiredFix: hash a line-ending-normalized view (strip CR before hashing) or
use git's own comparison (`git hash-object`/`git diff`), so the check matches
what is actually committed/deployed, and pin it with a CRLF-converted copy.

---

## 4. Collateral sweep

- No schema re-shape: `app/database.py` untouched; `app/__init__`/schema diff
  empty.
- No new non-finite value can reach JSON from a header: the only header numeric
  parsers are `_parse_value` / `parse_ra_hours` / `parse_dec_deg` (all
  finite-guarded) and the coordinate 500 path is closed; a pre-existing
  corrupted row would still 500, but that is out of this batch's acceptance.
- Encoding: `python scripts/check_js.py` exits 0 (includes
  `check_encoding.py`); no BOM/mojibake introduced by the coder's files. (The
  probe artifacts the reviewer created under `reviews/` were removed.)
- Dead code observation (not a finding): `app/fits.py::_finite_float` (line
  96-110) is defined but never called.
- No commit, tag, or deploy: HEAD is unchanged, the coder's work is
  uncommitted, `v0.6.24` unmoved.

## 5. Coverage limits (stated, not hidden)

- The Playwright browser gate cannot launch in this sandbox, so DE-01 has no
  real-click evidence. It is covered by the real `setup.js` module driven under
  the stub DOM (`tests/js/dom_handlers.mjs`, plus the reviewer's pre-fix shadow
  run) - the same method the certified record used (`v-desktop` lane).
- pytest's own `tmp_path`/`basetemp` directories acquire a DACL that makes
  `os.scandir` fail (WinError 5 in this sandbox), which errors every
  `tmp_path` test and the session finish. To run the claimed commands the
  reviewer loaded a review-side plugin (`reviews/rv_pytest_plugin.py`,
  `-p rv_pytest_plugin`) that supplies a readable temporary factory; with it,
  the contract module list is 117 passed / 0 failed and the full suite result is
  reported below. The plugin is a harness workaround only - no production or
  test file was changed by the reviewer.
- `git checkout` under `core.autocrlf=true` smudges files (see XL-01-F2); one
  such smudge of `web/style.css` was made during the mutation proof and was
  restored byte-identically (`git diff` empty, sha256 matches).

## 6. Commands run (observed)

| command | result |
| --- | --- |
| `python -m pytest tests/test_fits.py tests/test_ingest.py tests/test_imglib.py tests/test_api.py tests/test_cache_tokens.py tests/test_pre_tag_check.py -q --tb=short -p rv_pytest_plugin -p no:cacheprovider` | `117 passed` |
| `python -m pytest tests/test_fits.py tests/test_api.py -k "<new pins>"` in the pre-fix `git archive HEAD` shadow | `4 failed, 2 passed` |
| `python -m pytest tests/ -q --tb=line -p rv_pytest_plugin -p no:cacheprovider` | `447 passed` (0 failed) |
| `node tests/js/dom_handlers.mjs` (working tree) | exit 0, `DE-01 ... held` |
| `node <shadow>/dom_handlers.mjs` (pre-fix `setup.js`) | `DE-01 ... FAILED (new target absent from the plan: [])` |
| `python scripts/check_js.py` | exit 0 (`check_js: OK`) |
| `python scripts/check_js_tokens.py` | exit 0 (`OK`); exit 1 with a mutated `web/style.css` |
| `python scripts/pre_tag_check.py 0.6.24` | exit 0; exit 1 with a mutated `web/style.css` |
| `git rev-parse v0.6.24` | `25a19bb...` (unmoved), `git tag --contains 208f7d6` empty |
| `git status --porcelain` | only expected coder paths + untracked `.agent-teams/`, `reviews/`, `scripts/check_js_tokens.py` |

## 7. Full-suite result

`python -m pytest tests/ -q --tb=line -p rv_pytest_plugin -p no:cacheprovider`
-> **447 passed, 0 failed** (111.68 s). The three failures in an earlier full
run (`test_encoding`, two `test_pre_tag_check`) were caused by the reviewer's
own probe artifacts (PowerShell-written UTF-16/BOM files under `reviews/`) and
by `web/style.css` being CRLF at that moment during the mutation proof - both
were removed/restored; the clean re-run above has zero failures.

Addendum: the coder's reported "301 passed / 0 failed / 146 known tmp_path
errors" and "117 passed / 0 failed" for the contract list both reproduce
(117/0 exactly); the reviewer's number is higher only because the review-side
tmp factory unblocks the 146 sandbox-artifact errors.

---

# Addendum - captain follow-up (scope adjudication + re-confirmations)

Requested by the captain after t2 was filed. Verdict stays **needs_revision**.
The finding below is filed as **PY04-F2**.

## A. Scope question: is the parser fix alone enough? NO - PY04-F2 (high)

The coder's claim: the `app/fits.py` parser fix closes PY-04, so the reverted
`app/ingest.py` exposure guard was redundant and the ingest boundary needs no
finiteness check.

What is TRUE: within the FITS ingest path the parser layer does close every
route. `read_fits_header` is the only producer of the header dict; every
numeric it can emit goes through `_parse_value` / `parse_ra_hours` /
`parse_dec_deg`, which now return `None` for non-finite values; both ingest
paths (`app/ingest.py:133-138` upload and `:307-312` reindex) consume only
`hdr.get(...)` values; `parse_ra_hours`/`parse_dec_deg` are themselves guarded
against a non-finite argument. No FITS header can put a non-finite value into
`db.add_image` after the fix.

What is FALSE: the storage boundary itself is still open, and it is reachable
by another caller. `Database.add_image` (`app/database.py:599-611`) inserts
`ra_hours`/`dec_deg`/`exposure` verbatim with no finiteness check, and
`Database.import_bundle` (`app/database.py:854-869`) inserts `images[]` rows
verbatim - while `:770-786` validates sites, rigs, panoramas and settings with
the same `_fin` helper. `json.loads` (used by `app/backup.py::apply_import_zip`
for `setup.json`) accepts the bare `Infinity`/`NaN` tokens, so POST /api/import
persists them.

Reproduced with the real app (reviewer probe, `raise_server_exceptions=False`):

- Scenario A - crafted bundle with `images[0] = {exposure: Infinity,
  ra_hours: Infinity, dec_deg: NaN}`: POST /api/import -> 200, row stored with
  `exposure = inf`; then `/api/library` -> **500 Internal Server Error** (and
  stays 500), `/api/library/imports` -> 200, `/api/library/export?format=json`
  -> 200 but emits the bare token `"exposure": Infinity` (not strict JSON).
- Scenario B - the realistic recovery path: a library that already carries an
  `inf` row (exactly what a pre-fix install has) exports `Infinity`, and
  re-importing the user's OWN export into a fresh database restores the row and
  the library answers **500** again. The documented remediation (export ->
  import) therefore re-introduces the PY-04 corruption instead of repairing it.

This is the exact failure mode the certified PY-04 fix direction names
(review table row 1: "...and validate finiteness at the storage boundary before
INSERT"), and it leaves the acceptance's "can no longer leave the library
broken" true only for the FITS-ingest reading, not for the storage boundary.

RequiredFix: reject non-finite numbers at the storage boundary for `images`
rows - at minimum extend the existing `_fin` validation loop in
`Database.import_bundle` to `images[].ra_hours/dec_deg/exposure` (raise
`ValueError` so `/api/import` answers 400 and the transaction rolls back), and
guard `Database.add_image` so no caller can insert a non-finite. Pin it with:
(a) a bundle carrying `exposure: Infinity` -> /api/import 400, no row, library
200; (b) a pre-existing `inf` row exported and re-imported -> library stays
200 (or the export refuses/writes `null`).

Scope note for the captain: the minimal fix lands in `app/database.py` (and/or
`app/backup.py`), neither of which is in t1's inScope list, so a repair round
needs an explicit scope decision. `app/fits.py` alone cannot fix it.

## B. Sandbox caveat - no false failure was reported

The literal verify command with the documented AppData basetemp fails at
fixture SETUP in this sandbox (`PermissionError [WinError 5]` on
`mkdir C:\Users\<user>\AppData\Local\Temp\opencode\pt*` - the directory cannot
be created outside the repo). A workspace `--basetemp` does not help either:
pytest re-creates its basetemp and the new directory gets the owner-SID-only
DACL, so `os.scandir` on it fails (WinError 5) and every `tmp_path` test errors
at setup / sessionfinish. The reviewer therefore used a workspace-based
`tmp_path` override: `reviews/rv_pytest_plugin.py` (loaded with
`-p rv_pytest_plugin`), whose factory creates the temp dirs under
`<workspace>\AstroPilot-local\.rv-tmp-root` with plain `os.makedirs`. With it:
contract module list 117 passed / 0 failed, full suite 447 passed / 0 failed.
No production or test file was changed by the reviewer. The root-level
`pt-b*/pt-run*` dirs are the coder's scratch (the captain is removing them
out-of-band); they were not counted as product files.

## C. XL-01 adversarial re-check

- MUST FAIL on a simulated missed bump: verified at the wired entry points.
  Appending a byte to `web/style.css` (token 16 == the tag's 16) makes
  `scripts/check_js_tokens.py` exit 1, `scripts/check_js.py` exit 1 and
  `scripts/pre_tag_check.py 0.6.24` exit 1; restored byte-identically after
  (sha256 `3AF454FB...567D2`, `git diff` empty, guard OK again).
- MUST PASS at HEAD: `check_js_tokens` OK, `check_js.py` OK,
  `pre_tag_check.py 0.6.24` OK (all exit 0). `scan_at("v0.6.24","v0.6.23")`
  reports exactly the six stale modules; `scan_at("208f7d6","v0.6.23")` is [].
- Genuinely wired into BOTH: `scripts/check_js.py` calls
  `_run("check_js_tokens")` (line 36); `scripts/pre_tag_check.py` calls
  `check_js_tokens.scan()` through `token_problems()` and fails the gate on it.
  Proven end-to-end by the mutation above, not just by reading.
- The counterexample that makes this needs_revision stands (XL-01-F1): with
  `web/astro.js` bytes changed and its repaired token left at 10 (tag 9),
  `scan()` returns `[]` - the six modules the 0.6.24 repair touched are
  invisible to a missed bump for the next release. XL-01-F2 (CRLF fragility)
  also reproduced.
- Tag: `git rev-parse v0.6.24` = `25a19bb` "NightSeam 0.6.24"; exactly one
  `v0.6.24` tag; `git tag --contains 208f7d6` empty; HEAD = `9596878`.
- Changed-file scope for t1: `AGENTS.md`, `app/fits.py`, `static/js/setup.js`,
  `scripts/check_js.py`, `scripts/pre_tag_check.py`, `tests/` (5 files),
  new `scripts/check_js_tokens.py` - every one inside t1's inScope list.
  Nothing outside it changed (`git status` cross-checked at review time).
  Note: while this addendum was being written, repair round 2 (t4) appeared in
  the worktree (`scripts/check_js_tokens.manifest.json`, `pt-r2/`); those are
  round-2 artifacts and are NOT part of the t1 change set reviewed here - they
  are for the t5 review.

