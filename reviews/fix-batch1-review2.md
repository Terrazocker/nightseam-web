# Fix batch 1 - t7: review of the PY-04 storage-boundary repair (t6)

Reviewer: reviewer (independent verifier)
Reviewed task: t6 (attempt 3 of t7; the earlier attempts were invalidated by
concurrent re-dispatches, not by any change of evidence)
Full evidence table and probe outputs: `reviews/fix-batch1-review-r3.md`
(this file is the contract-named deliverable and carries the verdict).

Verdict: **needs_revision** - the claimed boundary work is correct and its pins
fail before / pass after, but the SAME failure mode is still reachable through
a live API route the boundary does not cover (T6-F1).

Revision pinned (sha256, first 16): `app/database.py` `49F20AB291D1F54D`,
`app/backup.py` `6E2FF9B05488D882`, `app/server.py` `86EA3B9F68D0D1B2`,
`tests/test_backup.py` `47266F996AB8955D`, `tests/test_api.py`
`816910900EA43CD3`. Re-run this attempt: `python -m pytest tests/test_backup.py
tests/test_api.py -q` -> **106 passed / 0 failed** (review-side workspace
tmp_path factory `reviews/rv_plugin_t7c.py`; the contract's literal command
errors at fixture setup here because pytest's own tmp dirs are DACL-broken -
the sandbox artifact, not a fix failure).

## Verified correct (real app, `raise_server_exceptions=False`, SQLite rows inspected)

- **(a) crafted bundle**: `images[0].exposure=Infinity`, `ra_hours=-Infinity`,
  `dec_deg=NaN` -> **400** each ("imported image <field> must be a finite
  number"); `images`/`sites` byte-identical before/after (nothing persisted, a
  pre-existing site survived); a raw `1e400` literal refused too;
  `/api/library` 200 `total_images: 0`; `/api/library/imports` 200; the JSON
  export carries no bare Infinity/NaN.
- **(b) recovery path**: a DB seeded with an `inf` exposure reproduces the
  certified defect (`/api/library` **500**); `/api/export` 200 with a
  strict-JSON-clean `setup.json`; importing that export into a FRESH database ->
  200, `/api/library` 200, stored values finite-or-null (`(None, 0.712,
  41.269)`).
- **(c) boundary, not one route**: `db.add_image({ra_hours: inf, dec_deg: nan,
  exposure: -inf})` stores NULL and `/api/library` stays 200; finite values are
  kept exactly.
- **(d) regressions**: a valid bundle still imports and replaces data;
  non-finite site lat / rig focal / panorama fov / setting bortle still 400;
  refused imports leave the library and rows intact (rollback).
- **Pins**: all four new t6 pins FAIL on a `git archive HEAD` shadow (3 in
  `tests/test_backup.py` - including `DID NOT RAISE ValueError` - and the API
  pin with `AssertionError: ({'exposure': inf}, 200, ...)`) and pass now.
  Focused modules 154 passed; full suite 449 passed / 0 failed.

## Finding

### T6-F1 (high) - the live custom-target route still stores a non-finite number and permanently 500s `/api/catalog`

File: `app/server.py:145` (`CustomIn.vmag: Optional[float] = None`), `:693`
(`"vmag": body.vmag`), `app/database.py:422-438` (`add_custom` inserts
`d.get("vmag")` verbatim).

Reproduced: `POST /api/catalog/custom` with the raw body
`{"name":"Zzz","ra":"1.0","dec":"1.0","vmag":1e400}` (a valid strict-JSON
number literal; Python parses it to `inf`) -> **200**, `custom_objects.vmag =
inf`; the bare `Infinity` token body does the same. Then `GET /api/catalog`
answers **500 Internal Server Error**, permanently (the desktop shell fetches
it at boot). t6 added the `_fin` check for `customs` in `import_bundle` but
missed the route that creates them.

RequiredFix: `allow_inf_nan=False` on `CustomIn.vmag` and/or
`_finite(body.vmag, "Magnitude")` in the route, plus a guard in
`Database.add_custom`; pin with a `1e400` POST and a bare-`Infinity` POST ->
4xx, `/api/catalog` 200, no non-finite row.

## Open question carried from t2 (boundary choice)

`app/backup.py`'s change (`_finite_records` nulling non-finite numbers when
building the export) was necessary for case (b) - without it the user's own
export emitted a bare `Infinity` token and could not be re-imported. The
boundary chosen (`finite_or_none` in `add_image` + fail-closed `_fin` in
`import_bundle` + export sanitizer) is the narrowest correct one for the two
target record types; the residual gap is the unguarded custom route above.

Design judgement (requested): `add_image` silently NULLing a non-finite value
is acceptable (information-free value; NULL is the canonical unknown; it cannot
mis-file a frame because `object_id`/`object_name` are resolved before
`add_image`). The export's silent null is acceptable and is the recovery path.
The import's fail-closed 400 for image numbers is defensible; its only caveat -
an OLD backup made by the broken build must be re-exported with the fixed app
first - is a workable, non-obvious path, so it is not filed as a finding.

## Coverage limits

Playwright cannot launch in this sandbox (no browser evidence; irrelevant to
this Python-only change). No production file was modified by the reviewer; all
probe artifacts were removed.
