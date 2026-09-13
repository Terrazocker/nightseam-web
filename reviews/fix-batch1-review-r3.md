# Fix batch 1 - round-3 independent review (t7)

Reviewer: reviewer (independent verifier)
Reviewed task: t6 (PY-04 storage-boundary closure)
Attempt: 69637b5f-223e-468d-8fca-3726055c353b
Judged against: `reviews/0.6.24/REVIEW-0.6.24.md` revision 6, the lane files,
and the PY04-F2 findings in `reviews/fix-batch1-review.md` /
`fix-batch1-review-r2.md`.

Verdict: **needs_revision** - the claimed boundary work is correct and its
pins fail before / pass after, but the SAME failure mode is still reachable
through a live API route the boundary does not cover (T6-F1).

Revision verified (sha256, first 16): `app/database.py` `49F20AB291D1F54D`,
`app/backup.py` `6E2FF9B05488D882`, `app/server.py` `86EA3B9F68D0D1B2`,
`tests/test_backup.py` `47266F996AB8955D`, `tests/test_api.py`
`816910900EA43CD3`. (`scripts/check_js_tokens.py` `9B4D646198B071C2` and
`AGENTS.md` `F6BAEB58FF47E5E5` changed under task t8 while this review ran -
they are NOT t6's change set and are not judged here.)

---

## 1. The claims, verified independently (real app, `raise_server_exceptions=False`)

### (a) crafted bundle with non-finite image numbers -> 4xx, nothing persisted

- `images[0].exposure = Infinity` -> **400** `"imported image exposure must be
  a finite number"`; `ra_hours = -Infinity` -> 400; `dec_deg = NaN` -> 400.
- After each: `images` and `sites` are byte-identical to before (0 images, the
  pre-existing site intact) - the `_fin` checks run before the transaction.
- A raw `1e400` literal in `setup.json` (valid strict JSON that Python's
  `json.loads` turns into `inf`) is refused the same way.
- `/api/library` 200 `total_images: 0`, `/api/library/imports` 200 after all
  refusals.

### (b) recovery path

- A DB seeded with a raw `inf` exposure reproduces the certified defect:
  `/api/library` **500**.
- `/api/export` -> 200 and the `setup.json` inside carries **no bare
  Infinity/NaN token** (verified with a strict `json.loads(parse_constant=...)`
  reader).
- Importing that export into a FRESH database -> 200, `/api/library` 200, the
  re-imported values finite-or-null (`(None, 0.712, 41.269)`).
- The OLD-export shape (a bundle that still carries `exposure: Infinity`) is
  **refused** by the new import gate - consistent with the fail-closed policy
  (see the design discussion in section 3).

### (c) `add_image` boundary

- `db.add_image({ra_hours: inf, dec_deg: nan, exposure: -inf, ...})` stores
  **NULL** for all three; `/api/library` stays 200.
- Finite ints/floats and non-numeric values pass through unchanged
  (`ra_hours=5`, `dec_deg=-27.958`, `exposure=60.0` kept exactly).

### (d) regressions

- A valid bundle still imports (200) and replaces the data (site + image).
- `_fin` still refuses non-finite site lat / rig focal_mm / panorama fov /
  setting bortle (**400** each).
- The refused imports leave the library and rows intact (rollback semantics).

### Pins (failing-before reproduced by the reviewer, not taken from the coder)

Pre-fix shadow = `git archive HEAD` with the NEW test files copied in:

- `tests/test_backup.py::test_import_rejects_nonfinite_image_numbers` ->
  **FAILED** (`DID NOT RAISE ValueError`)
- `tests/test_backup.py::test_add_image_cannot_store_a_nonfinite_number` ->
  **FAILED**
- `tests/test_backup.py::test_export_of_a_corrupt_library_is_importable_and_stays_finite`
  -> **FAILED**
- `tests/test_api.py::test_import_rejects_nonfinite_image_numbers_and_keeps_library_alive`
  -> **FAILED** (`AssertionError: ({'exposure': inf}, 200, ...)` - the pre-fix
  import accepted the bundle and stored `inf`)

All four pass on the current revision; focused modules
(`test_backup, test_api, test_imglib, test_ingest, test_fits,
test_cache_tokens, test_pre_tag_check`) = **154 passed / 0 failed**; full suite
= **449 passed / 0 failed** (review-side workspace tmp factory
`reviews/rv_plugin_t6.py`; pytest's own tmp dirs are DACL-broken here).

## 2. Finding

### T6-F1 (high) - the live custom-target route still stores a non-finite number and permanently 500s `/api/catalog`

File: `app/server.py:145` (`class CustomIn: vmag: Optional[float] = None`),
`:693` (`"vmag": body.vmag`), and `app/database.py:422-438`
(`add_custom` inserts `d.get("vmag")` verbatim).

Problem: t6 extended the fail-closed `_fin` check to `customs` in
`import_bundle`, but the route that CREATES custom targets was left unguarded.
Reproduced with the real app:

- `POST /api/catalog/custom` with the raw body
  `{"name":"Zzz","ra":"1.0","dec":"1.0","vmag":1e400}` (a valid strict-JSON
  number literal; Python parses it to `inf`) -> **200**, and
  `custom_objects.vmag = inf` is stored.
- The bare `Infinity` token body (`{"vmag": Infinity}`) - accepted by
  Starlette's JSON loader - does the same -> **200**, `vmag = inf`.
- Immediately afterwards `GET /api/catalog` answers **500 Internal Server
  Error**, permanently (the row is stored and the desktop shell fetches
  `/api/catalog` at boot). Same failure mode as the certified PY-04: one
  non-finite number wedges a core route for every later request.

Note `/api/export` does null the corrupt custom vmag (the export-side
sanitizer works), but that only helps after the DB is already wedged.

RequiredFix: validate finiteness on the custom-target write path, at the
boundary and/or the route - e.g. `vmag: Optional[float] =
Field(default=None, allow_inf_nan=False)` on `CustomIn`, plus a
`_finite(body.vmag, "Magnitude")` call (or `finite_or_none` in
`Database.add_custom` so no future caller can store one). Pin it: a POST with
`1e400` and one with the bare `Infinity` token -> 4xx, `/api/catalog` stays
200, and no non-finite value in `custom_objects`.

## 3. Design judgement (asked for explicitly)

- **`add_image` silently NULLs a non-finite value - acceptable.** `inf`/`nan`
  carries no usable information, NULL is the canonical "unknown" the schema and
  `/api/library` already handle (the FITS parsers return `None` for an
  unparseable card), and it cannot mis-file a frame: `object_id`/`object_name`
  are resolved by the caller before `add_image` and are untouched by the
  sanitizer. Raising instead would turn a defence-in-depth boundary into a new
  failure mode for the app's own ingest path, which no longer produces
  non-finite values. Keep as is.
- **The export silently coercing non-finite -> null - acceptable.** It is the
  recovery path: the user's own backup becomes importable and re-importing
  cannot restore the corruption; the discarded value was unusable. A warning
  ("n non-finite values written as null") would be nice-to-have, not required.
- **The import refusing non-finite image numbers (400) rather than nulling them
  - defensible, with a caveat.** It matches the repo's established fail-closed
  policy for imported records, and it is strictly better than the pre-fix
  behaviour (which accepted the bundle and wedged the library). The caveat: a
  backup made by the BROKEN build still carries the bare token and is now
  refused, so such a user must first re-export with the fixed app (which
  sanitizes) and import that - a workable but non-obvious path. I am not filing
  this as a finding; it is a documented trade-off, and nulling image numbers on
  import would be an equally safe alternative if the captain prefers maximum
  restorability.
- **Observation (low, no producer today):** `_finite_records` in the export
  covers `customs` + `images` only. Sites/rigs/panoramas are guarded at every
  writer (`_finite` in the routes), so a non-finite row there requires a legacy
  DB predating those guards; if one exists, the export would still emit the
  bare token (and `/api/state` would already be 500). Extending the export
  sanitizer to those record types would make the export uniformly strict.

## 4. Coverage limits

- Playwright still cannot launch in this sandbox (no browser evidence for any
  lane; not relevant to this Python-only change).
- pytest's own tmp dirs remain unusable (owner-SID-only DACL); the review-side
  workspace factory was used.
- Concurrency: task t8 was editing `scripts/check_js_tokens.py`, `AGENTS.md`
  and its own scratch (`pt-t8/`, `pt8_*.py`, `pt_run_report.txt`) while this
  review ran; `tests/test_js_tokens.py` did not exist yet at either suite run.
  None of those files are t6's change set.
- No production file was modified by the reviewer; all probe artifacts removed.

## 5. Commands run (observed)

| command | result |
| --- | --- |
| reviewer boundary probe `reviews/.rv_t6_boundary.py` (parts a-d) | all PASS |
| same probe, adversarial custom-target part (e) | `vmag=1e400` -> 200 + `inf` + `/api/catalog` 500; bare `Infinity` -> 200 + `inf` + 500 (T6-F1) |
| focused modules `test_backup test_api test_imglib test_ingest test_fits test_cache_tokens test_pre_tag_check` | 154 passed / 0 failed |
| `python -m pytest tests/ -q -p rv_plugin_t6 -p no:cacheprovider` | 449 passed / 0 failed |
| t6 pins on the `git archive HEAD` pre-fix shadow (4 tests) | 4 failed (failing-before reproduced) |
