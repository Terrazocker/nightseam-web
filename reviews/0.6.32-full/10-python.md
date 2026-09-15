# Python lane - backend, storage and IO (app/, main.py)

Subject: `v0.6.32-3-g3277846` (HEAD `3277846`), tree clean apart from `REVIEW-PROMPT.md` and `reviews/`.

## What I checked (and how)

Read `app/paths.py` first, then audited every path built from stored/imported JSON
(`grep '\[.file.\]|get\(.file.\)'` over `app/`) and every record id interpolated into a filename;
then ran hostile-bundle / traversal / HTTP-contract probes on scratch DBs under
`logs/review-py-lane/` (never `data/`, never the user profile - `settings.image_dir` is pointed
at the scratch dir first). Read in full: `paths.py`, `backup.py`, `database.py`, `server.py`
(route by route), `fits.py`, `ingest.py`, `imglib.py`, `images.py`, `main.py`.
Probes, all executed, all under `reviews/0.6.32-full/evidence/python/`: `probe_settings_import`,
`probe_backup_partial`, `probe_http_contract`, `probe_bigint_params`, `probe_malformed_bundle`,
`probe_rename_collision`, `probe_ingest_disconnect`, `probe_fits_edges`.
Not re-filed: CR2, DS4, DS5, WB7, the recorded deliberate non-goals.

## Findings

### PY-01 blocker CONFIRMED - `/api/library/edit` silently overwrites a same-named frame in an existing folder; two rows alias one file and the replaced pixels are gone
- file: `app/ingest.py:215-221` (merge loop) called from `app/server.py:863` (route `:846-871`)
- impact/mechanism: renaming an unresolved group to a name whose folder already exists
  (e.g. "Unknown target" -> "NGC 7000") replaces the colliding frame in place and answers
  `200 {"ok":true}`; the library then lists two frames that resolve to ONE file, and nothing
  else holds those bytes (`make_backup` copies only the DB). The `new.exists()` branch uses
  `f.replace(dest)` with no uniquify, although `_archive_target` (`app/ingest.py:88-90`) does
  exactly that for ingest.
- evidence: `probe_rename_collision.py` -> before, `Unknown target\undated\lights\Light_001.fit
  = c7f2cc18cd3b (30B)` and `NGC 7000\undated\lights\Light_001.fit = a4a2c010652f (36B)`;
  `POST /api/library/edit -> 200 {"ok":true,...}`; after, `files on disk: 1 (started with 2)` and
  `stored rows: [('NGC 7000','.../undated/lights/Light_001.fit'), ('NGC 7000', same path)]`.
- repro: two folders with one slug, both holding `undated/lights/Light_001.fit` (no DATE-OBS or
  the same night), one group with `object_id IS NULL`; `POST /api/library/edit
  {"name":"Unknown target","new_name":"NGC 7000"}`. requiredFix: never land on an existing
  `dest` (reuse the `_archive_target` `stem_2` shape and feed the real paths to
  `db.rename_images`), or refuse with 400 when any `dest` exists.
- counterArgument: merging into an existing folder is the documented intent of
  `rename_archive_folder`, and the user typed the target name. But no docstring, route, UI
  (`static/js/archive.js:286-302` posts with no confirmation) or test says a same-named frame
  may be replaced - `tests/test_api.py:287-304` only renames to a fresh name - so this is
  unsignposted data loss, not a merge policy. Pre-existing, not a 0.6.32 regression.

### PY-02 medium CONFIRMED - a bundle's `min_vis` is never validated, so one crafted setting bricks `/api/state` and the desktop cannot start
- file: `app/database.py:111-156` (no `min_vis`), `app/server.py:413`
  (`int(db.setting("min_vis", 1))`), insert loop `app/database.py:1017-1020`
- impact/mechanism: importing a ZIP with `"min_vis": "abc"` (or `null`) succeeds, then every
  `GET /api/state` is 500; `static/js/main.js:54` awaits that route in `loadState()` before
  anything else, so the desktop shows its boot error banner and stays unusable until the row is
  repaired or the DB deleted. Same class as the PY-04 fix ("a hostile setting could brick
  /api/state at every boot") - one key missed.
- evidence: `probe_settings_import.py` -> `settings['min_vis'] = 'abc': import=accepted |
  GET /api/state -> 500 Internal Server Error` (same for `None`); `bortle`/`edge_space`/
  `size_unit` are refused with a ValueError.
- repro: zip `{"app":"NightSeam","settings":{"min_vis":"abc"},...}` -> `POST /api/import` (200)
  -> `GET /api/state` (500). requiredFix: validate `min_vis` like `bortle` (finite, int-coerced,
  clamped 0..100) and let `/api/state` fall back defensively.
- counterArgument: normal users cannot produce it - `/api/settings` is `Optional[int]`
  (`tests/test_api.py:87-103`), so only a crafted/hand-edited bundle triggers it. Hence medium.

### PY-03 medium CONFIRMED - the Python restore replaces the database before writing payloads; a later failure answers 400/500 with no rollback and never says the library was replaced
- file: `app/backup.py:190-191` (commit) then `:193-222` (writes, no rollback), `:239-240`
  (closes the zip only); status mapping `app/server.py:700-706`
- impact/mechanism: the library is replaced, some payloads are written, one row is left pointing
  at a file that will never exist, and the user reads `500 Failed to write restored files` or,
  worse, `400 {"detail":"zip member too large: panos/too-big.jpg"}` - which reads as "bundle
  rejected". `import_bundle` commits transaction 1; the payload loop is an unrelated second
  phase, and the route maps `ValueError -> 400`.
- evidence: `probe_backup_partial.py` -> A) `sites after: ['Imported']`,
  `panorama rows: ['fail.jpg','ok.jpg']`, `payload files: ['ok.jpg']`, `safety copy: True`;
  D) `POST /api/import -> 400 {"detail":"zip member too large: panos/too-big.jpg"}` with
  `panorama rows: ['too-big.jpg','small.jpg']`, `payload files: ['small.jpg']`.
- **Settling the prior probe:** this is the documented design of the Python path, not a violated
  claim. `AGENTS.md:318-321` scopes staging+rollback to the WEB path ("`restoreBackup`
  stages/validates the whole bundle BEFORE any write and rolls back to the `meta`/`safety`
  snapshot if a write fails"); for Python `AGENTS.md:722-723` promises only that "every import
  first writes a best-effort safety copy to `<db>.backup-auto.zip`". I verified that promise: the
  failed import's safety copy holds the PRE-import state (sites `['Original']`, no panoramas), so
  this is a **recoverable inconsistency, not data loss** - caveat: a single slot, so the next
  import attempt overwrites the recovery point. requiredFix: wrap the payload phases and either
  roll forward (naming the incomplete records) or refresh the safety copy; never answer a bare
  400 after the database has been replaced.
- counterArgument: the safety-copy contract is explicitly best-effort and the only incomplete
  data is the failed bundle's own payload, which the user still holds - the defect is the
  misleading status plus the partially-applied state. Related SUSPECTED (not filed):
  `MAX_MEMBER_BYTES` bounds each member but nothing bounds the member count or total, so a
  <=2 GB upload can expand to ~TB of writes into `data/panos`; I did not build the bomb.

### PY-04 low CONFIRMED - a malformed-but-valid bundle produces HTTP 500 while the API documents ValueError/400
- file: `app/backup.py:129-141` ("Raises ValueError on malformed input"), transaction
  `app/database.py:928-1024`, route `app/server.py:700-706`
- impact/mechanism: an opaque 500 plus a log traceback instead of an actionable 400, for
  bundles that get past the initial read and then hit `sqlite3.IntegrityError` (NULL name,
  non-integer site id, duplicate ids) or `AttributeError` - neither `ValueError` nor `OSError`.
  Nothing is corrupted (the transaction rolls back).
- evidence: `probe_malformed_bundle.py` -> `site name null -> IntegrityError ... HTTP=500`,
  `duplicate pano ids -> UNIQUE constraint failed ... HTTP=500`, `site entry not a dict ->
  AttributeError ... HTTP=500`, `sites not a list -> ValueError ... HTTP=400`;
  `sites after=['Original']` every time.
- repro: `POST /api/import` with `sites: [{"id":1,"name":null,...}]`. requiredFix: wrap
  `import_bundle` and re-raise `(ValueError, TypeError, AttributeError, sqlite3.Error)` as
  `ValueError("malformed setup bundle: ...")`.
- counterArgument: the data is protected and the import did fail, so only the error contract is
  wrong.

### PY-05 low CONFIRMED - integer path parameters beyond 64 bits answer 500 (OverflowError) instead of 404
- file: `app/server.py:492` (`api_delete_site(sid: int)`), `:486`, `:914`
  (`api_image_preview(img_id: int)`)
- impact/mechanism: pydantic accepts arbitrary-precision ints and they go straight into sqlite3,
  which raises `OverflowError: Python int too large to convert to SQLite INTEGER` -> a 500 with
  a traceback instead of a clean 404.
- evidence: `probe_bigint_params.py` -> `GET /api/images/999999999999999999999/preview -> 500`,
  `PUT`/`DELETE /api/sites/<big> -> 500`, `9223372036854775807 -> 404`, and the direct call
  prints the OverflowError.
- repro: `curl -i http://127.0.0.1:8407/api/images/999999999999999999999/preview`.
  requiredFix: bound the int-id path params (`ge=0, le=2**63-1`).
- counterArgument: only a hand-crafted URL reaches it; robustness-only.

### PY-06 low CONFIRMED - the restore writes payload files for records it refuses to store, and counts them without a record
- file: `app/backup.py:193-206` vs the id-token drop at `app/database.py:955-957`
- impact/mechanism: the write loop filters only on `safe_rel(file)`; the id-token drop happens
  later inside `import_bundle`, but the record is still in `panos`, so a panorama with a
  non-token id leaves an orphan file in `data/panos` (invisible, never cleaned) while the
  summary reports the pair `panoramas: 0, pano_images: 1`.
- evidence: `probe_http_contract.py` -> `non-token pano id -> summary {'panoramas': 0, ...,
  'pano_images': 1, ...}`.
- repro: bundle `panoramas:[{"id":"../evil","file":"ok.jpg",...}]` + member `panos/ok.jpg`.
  requiredFix: compute the accepted records once (`safe_rel(file) and safe_token(id)`) and drive
  both the insert and the write loop from that set.
- counterArgument: the written path is validated, so this is untidiness, not traversal.

### PY-07 low CONFIRMED - duplicate custom-target ids are silently collapsed while the summary reports both
- file: `app/database.py:976-993` (`INSERT OR REPLACE INTO custom_objects`);
  `_reject_duplicate_paths` covers only images/panoramas (`:925-926`); summary `app/backup.py:228`
- impact/mechanism: two bundle targets sharing an id become one row while the summary says
  `customs: 2` - the same silent-loss shape PY-01 was fixed for, in its record-id form.
- evidence: `probe_malformed_bundle.py` -> `custom duplicate ids direct=accepted ... HTTP=200
  {"ok":true,...}` (one stored row, count 2).
- repro: two `customs` entries sharing `"id":"u_x"`. requiredFix: reject duplicate record ids as
  well, or build the summary from the rows actually inserted.
- counterArgument: no NightSeam export can produce two rows with one id.

### PY-08 low CONFIRMED - an upload that dies mid-stream leaves a truncated .fit that `/api/library/reindex` later records as a real frame
- file: `app/ingest.py:156-166` (only `OSError`/size-cap unlink the target), `:192-202`
  (`_stream_to` has no cleanup), reindex `:239-326`
- impact/mechanism: the parsed header is written first and the body streamed, so a `read()` that
  raises anything but `OSError` (Starlette raises `ClientDisconnect`) escapes `ingest_one` and
  the `except OSError: target.unlink(...)` never runs; closing the app mid-ingest leaves a
  half-written frame on disk that the next reindex lists as a normal capture with missing pixels.
- evidence: `probe_ingest_disconnect.py` -> `outcome: ClientDisconnect`,
  `files on disk: [('Andromeda Galaxy/undated/lights/m31.fit', 3880)]`, `db rows: 0`, then
  `reindex_library: {'found':1,'added':1,...}` and one stored row.
- repro: abort a large ingest mid-stream (close the tab/window), then run reindex.
  requiredFix: `except BaseException: target.unlink(missing_ok=True); raise` around
  `_stream_to` in `ingest_one` (keep the friendly `OSError` message).
- counterArgument: a local app rarely loses the connection and the request does error out with no
  DB row; but reindex cannot detect a truncated file, so the cleanup belongs at write time.

### PY-09 low CONFIRMED - `IMAGETYP = "Master Dark"`/`"Master Flat"` is classified as a light frame
- file: `app/ingest.py:41-50`
- impact/mechanism: letters are reduced then matched with `startswith`, so `"masterdark"` matches
  neither `dark` nor `flat` and falls through to `return "light"`; master calibration frames land
  in `<object>/<session>/lights/` and are counted as lights. The docstring claims the multi-word
  spellings are handled and `fits._STOPWORDS` already knows "master".
- evidence: `probe_fits_edges.py` -> `classify_frame('Master Dark') -> 'light'` vs
  `'Dark Frame' -> 'dark'`, `'SkyFlat' -> 'flat'`; `grep classify_frame tests/` shows this value
  is untested.
- repro: `python -c "from app.ingest import classify_frame; print(classify_frame('Master Dark'))"`.
  requiredFix: strip a leading `master`/`m` qualifier before the `startswith` chain.
- counterArgument: `AGENTS.md` defines only "unknown -> lights", and capture software normally
  writes "Dark"/"Dark Frame"; "Master Dark" is more often a file name. Narrow, hence low.

### PY-10 low CONFIRMED - any FITS card whose keyword begins with `END` truncates the header, dropping every later keyword
- file: `app/fits.py:77` (`if rec.startswith("END")`), same rule in `header_size` `:266`
- impact/mechanism: the terminator test is a bare prefix test, not "the END card", so a file
  carrying e.g. `ENDTIME` silently loses `EXPTIME`/`OBJECT`/`DATE-OBS`/coordinates and the frame
  becomes unresolved and `undated`.
- evidence: `probe_fits_edges.py` -> `END-prefixed keyword truncates the header: parsed keys:
  ['OBJECT','SIMPLE']`, `EXPTIME=None` although the card sits in the same block.
- repro: `read_fits_header` on a block with `ENDTIME = 12345` before `EXPTIME`. requiredFix:
  require the FITS terminator shape (`rec[:3] == "END" and not rec[3:].strip()`).
- counterArgument: `ENDTIME` is not valid FITS (the standard reserves `END` standalone), so this
  is robustness against non-conforming writers. The other header checks I probed (80-byte
  boundary, blank/value-only/non-ASCII cards, truncated header, `nan`/`1e400` cards, missing
  `DATE-OBS`, sexagesimal coordinates) all behaved correctly.

## Refuted (claims I checked that are NOT bugs)

- **ZIP-slip / arbitrary file read-write via an import**: absolute POSIX, `C:/...`, `../../`,
  `..\..\`, `NUL`, `a/./b` vs `a//b` and non-token panorama ids were refused or dropped before any
  write; the canary file outside the DB dir was untouched (`probe_http_contract.py`).
- **Static-mount traversal** (`/../AGENTS.md`, `%2e%2e`, `..%2f`, `....//`, `/js/../../`): all 404;
  `app/`, `AGENTS.md` and `data/` are unreachable.
- **`thumb=1` touching the network**: 0 `urlopen` calls (patched to raise) and a 200 SVG
  placeholder for an object with no cache entry - the AGENTS.md claim holds.
- **A bundle's `settings.image_dir`**: re-injected locally and reported as `image_dir_ignored`
  (`app/backup.py:180-186,236-237`); my bundle asked for the scratch root, the restore used the
  local archive.
- **Import transaction safety**: all 11 malformed bundles rolled back - `sites after=['Original']`.
- **Schema is additive-only**: only `ALTER TABLE ... ADD COLUMN` plus `CREATE TABLE IF NOT EXISTS`;
  no DROP/re-shape. `distance` is stripped from `SELECT *` results
  (`app/database.py:1034-1041`) while the user's column stays - as documented.
- **Custom ids with path characters** (`u_../../evil` is accepted, `app/database.py:976-980`): no
  path is ever built from a custom id - `images._slug()` reduces it to `[a-z0-9-]`
  (`app/images.py:179-181`), everything else is a DB lookup. Hardening gap, not an exploit.
- **`/api/export` spool leak on disconnect**: the route relies on a `BackgroundTask`
  (`app/server.py:686-689`), but Starlette 1.6.0 + uvicorn 0.52.4 declare ASGI `spec_version` 2.3
  (`uvicorn/protocols/http/h11_impl.py:207`), so `FileResponse.__call__` takes the task-group
  branch whose disconnect path still awaits the background task, and uvicorn's `send()` returns
  silently when disconnected. Code-read refutation, not executed.
- **`min_vis` clamping via the API**: `POST /api/settings {"min_vis":150}` stores 100 and
  `{"min_vis":-5}` stores 0 (`tests/test_api.py:87-103`); only the import path is unguarded.
- **Duplicate normalized file paths** are refused with 400 before any write
  (`app/database.py:59-79,925-926`) - PY-01's path fix works; PY-07 is the id-shaped remainder.

## Not checked (honest coverage gaps)

- No long-running server was started: `img-prefetch` lifetime, `imgcache` growth, idle exit and the
  `data/instance.json` handoff were read, not exercised. Concrete risk I could not cheaply
  reproduce: `main.py:53-69` treats ANY failure of the 2 s `/api/state` probe as "no instance" and
  deletes `instance.json`, after which `free_port()` picks a random port - two servers on one
  SQLite/archive if that probe times out (e.g. while a long import holds `db.lock`). SUSPECTED.
- The zip-bomb / total-expansion bound in `apply_import_zip` is reasoned, not measured.
- `app/images.py`: the Wikipedia/Wikidata/DSS2 fallbacks, the offline breaker and the
  negative-cache TTL were read, not run against a stubbed endpoint; no hostile object name was
  pushed through a real fetch. No `.fz`/`.gz`, big-endian pixel data or `preview_png` rendering
  beyond header paths; the 1 GiB ingest cap was read, not streamed to.
- Concurrency (`db.lock` with the API thread plus the prefetch thread) was read, not stress-tested.
