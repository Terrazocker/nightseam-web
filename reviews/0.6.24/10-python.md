# Lane t2 — Python backend, storage/IO and the untrusted path/import boundary

Subject: NightSeam working tree at HEAD `9596878` (`git describe` =
`v0.6.24-2-g9596878`). Charter: `reviews/0.6.24/00-charter.md` (t1, binding).
Owner: **py-reviewer**. Prefix: `PY-nn`. Evidence harness:
`reviews/0.6.24/evidence/py_probes.py` (cases named per finding).

**0.6.24 delta in this lane: none.** `git diff --name-only v0.6.23..HEAD -- app`
is empty, so every finding below is dated to an earlier tag and the whole lane is
`pre-existing (<0.6.23)` unless a block says otherwise.

## Coverage

| Examined | How | Result |
| --- | --- | --- |
| Every `/api/*` route in `app/server.py` (31 `@app.<verb>` registrations) | read `app/server.py` (1–963) + per-route probes (`py_probes.py headers panoid`) | route-by-route table below |
| `paths.safe_rel` / `safe_join` / `safe_token` on 18 adversarial strings | `py_probes.py paths` | rejected (`=None`) for `../`, `..\`, absolute, drive, UNC, `NUL`/`CON`/`com1`, trailing-dot/space, NUL byte, empty, `.`; normalizes `a//b`, `./a`, `a\b`; `%2e%2e/x` is (correctly) treated as a literal file name; `nul`/`CON`/`com1` pass `safe_token` but are prefixed by `{pid}.{ext}` at every sink |
| `apply_import_zip` + `_read_member` + `auto_backup` + `image_dir_ignored` | read `app/backup.py`; probes `dupwatch`, `safeorder`, `strokes`; `python -m pytest tests/test_backup.py -q` | PY-01, PY-02, PY-03 |
| import trust boundary end-to-end (ZIP members `panos/../`, `library/../`, path-like ids) | probe (ZIP with `panos/../../evil.jpg`, `library/../evil.fit`, `panos/abc123.jpg`) | traversal members ignored, no file outside the pano/archive root written |
| `ingest.py` streaming, 1 GiB cap, frame/session layout, `reindex_library` | read `app/ingest.py`; `py_probes.py nonfinite1 nonfinite2` | PY-04; cap paths behave as documented |
| `fits.py` `parse_ra_hours` / `parse_dec_deg` / `read_fits_header` / `preview_png_file` | `py_probes.py parsers`; hostile-NAXIS probe (2 × 10^5 … 2^30 on a 4 KB file) | PY-04; geometry is capped by `max_px`/`step` (≤ 65 536 samples) so no DoS |
| `database.py` additive-migration rule | read `Database.__init__` (206–266): every schema change is `ALTER … except OperationalError`, new tables in `SCHEMA` | no drop/re-shape; rule holds |
| `database.py` read paths on malformed stored JSON / non-list `strokes` | `py_probes.py strokes` | PY-03 |
| `images.py` cache, offline breaker, PY6 TLS path | read `app/images.py` 55–141, 245–388 | PY-06 |
| `main.py` single-instance / port handling | read; `python -m pytest tests/test_main.py -q` | matches AGENTS.md; `Database(...)` is always handed a `Path` |
| `test_archive_folder_never_defaults_to_the_user_profile` (AGENTS.md §"Untrusted paths and imports") | `grep tests/ 'imgcache|CACHE_DIR'` + read `tests/test_images.py` 5, 26, 49, 149–151, 197 | holds by monkeypatching `images.CACHE_DIR`; no repo-`data/imgcache` write from a test run (0 suspicious negative markers after a full run) |

Deliberately **not** examined (out of lane / impossible without mutating state):

- `app/catalog_data.py`, `app/adv_popularity_data.py` bulk data, `catalog.manifest.json`
  parity → t4/t6 (catalog/token lanes).
- `scripts/` release pipeline, `build.ps1`, `NightSeam.spec`, `check_*.py` → t6.
- `core/`+`web/`+`static/` correctness → t3/t4/t5. Where a client consequence is
  alleged (PY-03, PY-04) only the Python-side reachability is claimed; the exact
  client symptom is flagged for those lanes and for t7.
- Anything requiring the deployed `/astro` tree or the packed exe (PY-06 is
  therefore `static-only, no repro`).
- `data/` state, `dist/`, `logs/` artifacts (charter §1.2).

Baseline suite (charter §7 evidence): `python -m pytest tests/ -q --tb=no
--basetemp C:\Users\<user>\AppData\Local\Temp\opencode\pt-lane -p no:cacheprovider`
→ `295 passed, 142 errors`; every error is the documented `tmp_path`
`PermissionError` fixture-cleanup artifact (181 `PermissionError`/`WinError`
matches, 0 assertion failures), i.e. the suite is green on assertions.
Lane-scoped re-run (`tests/test_{backup,api,paths,images,ingest,fits,main}.py`)
→ `64 passed, 114 errors`, **152 `PermissionError` matches and no other error
text** — same artifact, so the green assertion set is what the API/backup
behaviour is pinned by.

---

### PY-01 — A restore with two bundle records that normalize to one path silently clobbers the file and leaves duplicate DB rows

- **(c) lane:** t2 · **claimed severity:** medium · **confidence:** high
- **(a) file:line:** `app/backup.py:184-198` (`apply_import_zip` image restore loop:
  `rel = safe_rel(...)` → `target.write_bytes(data)`); secondary
  `app/backup.py:169-182` (identical panorama loop);
  `app/database.py:854-869` (`import_bundle` inserts every `images` record —
  `safe_rel` canonicalizes, nothing deduplicates); `app/database.py:505-527`
  (`panoramas()` returns duplicates as-is).
- **rule violated:** the route's own contract comment, `app/backup.py:200-201`:
  *"records whose stored path was rejected are not part of the restored set"* /
  the summary dict's promise that `library_files` counts what was restored.
- **what is wrong:** `safe_rel` canonicalizes `a/./b`, `a//b` and `a/x/../b` to
  the same string, so N distinct bundle records can map onto ONE `target`. The
  loop writes each member to the same path in ZIP order (last writer wins), while
  `import_bundle` has already inserted N rows. The summary reports
  `images`/`library_files` as if all N were restored.
- **trigger / reachability:** user action — *Import backup* on a ZIP that carries
  duplicate or non-canonical `images[].file` / `panoramas[].file` values (a
  hand-edited or third-party bundle; no NightSeam export produces this, so no
  self-inflicted path).
- **(b) reproduction:**
  `python reviews/0.6.24/evidence/py_probes.py dupwatch` →
  expected (from the contract): distinct paths are restored as distinct files and
  `library_files` counts what was actually restored; observed (the bundle held
  three records and three members: `FIRST`, `SECOND`, `THIRD`):

  ```text
  import -> 200 {"ok":true, ..., "images":2, "library_files":2, ...}
  file on disk -> b'FIRST'
  files on disk -> ['TmpObj\\undated\\lights\\a.fit']
  db rows -> [(1, 'TmpObj/undated/lights/a.fit'), (2, 'TmpObj/undated/lights/a.fit')]
  ```

  (the bundle held three records/three members: `FIRST`, `SECOND`, `THIRD`;
  `"library_files": 2` counts *record* writes, while two of those writes hit one
  and the same path, so one file's bytes are gone.)
- **impact:** a restore quietly loses frame content (the surviving bytes are the
  first member's, later ones are discarded) and leaves two library rows pointing
  at one file, so the library shows counts that do not exist on disk. Narrow
  input, no boundary breach → medium, not high.
- **falsifier:** if `import_bundle` or the restore loop deduplicated normalized
  targets (or rejected the bundle), the later write could not clobber the first.
- **history:** `new`; the loop is dated `AstroPilot 0.3.0` (`git log --oneline -S'pano_files += 1' -- app/backup.py` → `b5339b2`, 2026-08-24) and is unchanged in `v0.6.23`.
- **(d) regression class:** `pre-existing (<0.6.23)` — present since `b5339b2`
  (AstroPilot 0.3.0); `app/` is untouched by 0.6.24.

---

### PY-02 — The pre-restore safety copy is written before the restore transaction, and its failure is swallowed

- **(c) lane:** t2 · **claimed severity:** low · **confidence:** medium
- **(a) file:line:** `app/backup.py:136-167` (`safety = _write_safety_copy(...)`
  at 137, `db.import_bundle(...)` at 166), `app/backup.py:91-102`
  (`_write_safety_copy` returns `None` on *any* exception).
- **rule violated:** the docstring contract at `app/backup.py:113-117` — *"Before
  touching anything, the CURRENT setup is written to `<db>.backup-auto.zip` …
  so an interrupted or failed restore never destroys the pre-import data."*
- **what is wrong:** the safety copy is best-effort *and* its failure is
  undetectable: the summary carries `"auto_backup": null`, which no caller
  checks (`app/server.py:654-672` returns the summary verbatim). The promise
  therefore degrades from "always recoverable" to "recoverable if the copy
  happened to succeed", on exactly the disk-full case the import itself is most
  likely to fail on.
- **trigger / reachability:** user action (Import) on a machine where the safety
  copy cannot be written — disk full (the copy is a full second generation of the
  library), a locked/antivirus-scanned `<db>.backup-auto.zip`, permissions. Then
  the restore proceeds anyway and any later restore failure (e.g. `ENOSPC` inside
  the `write_bytes` loop) leaves the pre-import data unrecoverable.
- **(b) reproduction:** `static-only, no repro` — forcing `ENOSPC`/a locked file
  is not possible in this environment without mutating machine state. Reasoning
  chain (each step openable): (1) `app/backup.py:137` writes the copy *before*
  the DB replace at 166, so a copy failure cannot stop the restore;
  (2) `_write_safety_copy` (`app/backup.py:101-102`) catches `Exception` and
  returns `None`; (3) `app/backup.py:207` puts that `None` into `summary`;
  (4) `app/server.py:664-672` returns `summary` to the client and never inspects
  `auto_backup`; (5) `app/backup.py:181/197` commit to `write_bytes` after the DB
  transaction is already committed (`app/database.py:881`).
  `python reviews/0.6.24/evidence/py_probes.py safeorder` prints the ordering it
  relies on: `safety copy precedes the DB replace: True` / `DB replace precedes
  the file restore: True`.
- **impact:** the documented recovery path can be absent in the one scenario it
  exists for; the user is told "import failed" with no way back except their own
  older zip. Best-effort is deliberate (charter §2.6 error handling), so this is
  `low` — the defect is that the degradation is silent and unverifiable, not that
  the copy is attempted last.
- **falsifier:** if `_write_safety_copy`'s failure aborted the import (or if any
  caller surfaced `auto_backup is None`), the promise would hold.
- **history:** `new`.
- **(d) regression class:** `pre-existing (<0.6.23)` — the ordering is unchanged
  between `v0.6.23:app/backup.py` (safety copy at 137, bundle at 166) and HEAD.

---

### PY-03 — The import boundary validates `profile`/`profile_top` but not `strokes`, and an unparsable stored `strokes` value 500s every panorama listing (incl. `/api/state` at desktop boot)

- **(c) lane:** t2 · **claimed severity:** medium · **confidence:** high
- **(a) file:line:** `app/database.py:811-831` (`import_bundle`: `_validate_import_profile(...)`
  for both profile arrays, then `json.dumps(p.get("strokes", []))` with no shape
  check at 826); `app/database.py:492-503` (`panoramas()`: `json.loads(d["strokes"])`
  with no exception handling); sink `app/server.py:354-389`
  (`api_state` → `db.panoramas()`) and `app/server.py:538-540` (`api_panoramas`).
- **rule violated:** AGENTS.md §"Astronomy / planner" *"Sun/Moon chart visibility…"*'s
  sibling invariant in the same section — the fail-closed rule stated in the code
  itself at `app/database.py:24-28` / `app/server.py:203-210`: a panorama array
  that violates the canonical shape *"failed OPEN at planning time - the exact
  invariant `_check_profile` exists to protect"*. `strokes` is the third stored
  array and has no equivalent check.
- **what is wrong:** `_check_profile`/`_validate_import_profile` guard both
  *profile* arrays, but nothing shape-checks `strokes`, which is the third stored
  panorama array holding the painted mask. `import_bundle` therefore accepts and
  persists any JSON value (`{}`, `"abc"`, `7`), and `PUT /api/panorama/{pid}`
  (`app/server.py:151-163`, `598-618`) hands it through unchanged. The read path
  is then split: `panoramas()` `json.loads()`es the column unguarded, so a value
  that is not valid JSON makes every panorama-listing response 500. (A normal
  import cannot plant *that* value — `json.dumps` at `app/database.py:826` encodes
  it first — so the 500 needs malformed storage from a hand-edited/legacy DB; the
  import gap plants the *shape*, which is what the desktop editor trips over.)
- **trigger / reachability:** two routes, deliberately stated separately.
  (1) **Import gap (boundary-reachable, user action):** import a bundle with
  `"strokes": {}` → stored and served as an object; the desktop panorama editor
  then runs `for (const s of Pano.cur.strokes)` (`static/js/pano.js:670`, reached
  from `recomputeProfile` at 643 after the `!strokes.length` guard at 652 does not
  match an object) and throws `TypeError: ... is not iterable`. The web editor is
  the safe twin here: `core/horizon.js:264` starts with
  `if (!Array.isArray(p.strokes) || p.strokes.length === 0)` and falls back to the
  stored profile — evidence for t4/t5 to confirm the two-shell divergence.
  (2) **Read path (storage-state, no bundle can produce it):** a row whose
  `strokes` column is not valid JSON (hand edit, an interrupted write, an older
  build) makes `panoramas()` raise on **every** listing. The desktop boot order
  makes that fatal: `static/js/main.js:161` `await loadState()` is the first step
  of `init()`, so a 500 aborts `loadNight()`, `Pano.init()`, `applyArchiveUI()`
  and `checkForUpdates()` (161–168) — no planning, no panorama editor, no update
  check, on every boot until the DB is repaired.
- **(b) reproduction:**
  `python reviews/0.6.24/evidence/py_probes.py strokes` → expected: the bundle is
  rejected (like an invalid `profile`,
  `tests/test_api.py::test_import_malformed_bundles_are_clean_400s`) or the value
  is normalized to a list; observed:

  ```text
  baseline /api/state,/api/panoramas -> 200 200
  import strokes=dict    -> HTTP 200 stored type=dict value={'a': 1}
     /api/state -> 200 | /api/panoramas -> 200
  import strokes=string  -> HTTP 200 stored type=str value='abc'
  import strokes=number  -> HTTP 200 stored type=int value=7
  import strokes=list    -> HTTP 200 stored type=list value=[]
  malformed stored strokes -> /api/state 500 | /api/panoramas 500
  ```

  (the last line is the hand-written row `strokes = '{not json'`, i.e. the
  storage-state case; `/api/library` stays 200.)
- **impact:** one crafted ~1 KB bundle stores a mask shape the desktop editor
  cannot iterate, so opening the panorama editor throws for that record; and a
  non-JSON `strokes` value in the DB makes the app unbootable on the desktop side
  (500 on the first request) until the DB is repaired. Neither breaches a trust
  boundary and (1) needs the deliberate Import → medium.
- **falsifier:** if `import_bundle` shape-checked `strokes` like it does the
  profiles (or `panoramas()` caught the parse error and failed closed to `[]`),
  neither half could be reached.
- **history:** `new` as a filed defect; adjacent to the CR2 carry-over
  (malformed-horizon guards) but distinct — CR2 is about *producers normalizing
  before preview*; this is the storage/import boundary accepting a shape the
  consumers cannot use.
- **(d) regression class:** `pre-existing (<0.6.23)` — `v0.6.23:app/database.py`
  stores `json.dumps(p.get("strokes", []))` the same way, and
  `v0.6.23:app/database.py::panoramas()` parses it the same way.

---

### PY-04 — Non-finite FITS header numbers are accepted: `OBJCTRA/DEC = ∞` 500s the ingest and `EXPTIME = 1e400` corrupts the library

- **(c) lane:** t2 · **claimed severity:** high · **confidence:** high
- **(a) file:line:** `app/fits.py:90-110` (`_parse_value`: `float(v)` with no
  finiteness check — accepts `nan`, `inf`, `1e400`), consumed by
  `app/fits.py:115-137` (`parse_ra_hours` / `parse_dec_deg`, AGENTS.md §"Architecture":
  *"`parse_ra_hours` / `parse_dec_deg` are the single coordinate parsers
  (imported by `server.py`)"*); crash site A `app/imglib.py:120-125`
  (`angular_dist` → `math.sin(inf)`); crash site B for the `EXPTIME` half
  `app/ingest.py:133-137` → `app/database.py:599-611` (`add_image` stores `inf`),
  and the stored `inf` then meets every `JSONResponse` that serializes it:
  `app/server.py:736-767` (the ingest response's `exposure`),
  `app/server.py:790-801` (`/api/library` `objects[].total_exposure`),
  `app/server.py:714-718` + `682-693` (`/api/library/imports` `total_exposure`).
- **rule violated:** the code's own finiteness convention, quoted at
  `app/server.py:194-200` (`_finite`: *"Reject NaN/Infinity on the API boundary"*
  — *"the response is serialized with allow_nan=False, so one stored NaN would
  500 /api/state forever"*) and `app/database.py:24-32` (`profile_values_ok`:
  *"finite … numbers"*) — the same rule is not applied to the two parsers
  documented as the single source of truth for coordinates, nor to the numeric
  FITS header values the ingest path stores.
- **what is wrong:** `_parse_value` converts a FITS card to `float()` without
  testing `math.isfinite`. Three distinct outcomes then follow from one header:
  `∞/-∞` reaches `math.sin()` in `angular_dist` and raises
  `ValueError: expected a finite input, got inf` → the whole
  `/api/images/ingest` request answers 500; `nan` makes every comparison in
  `resolve_object` false, so the coordinate matcher returns `None` while the name
  fallback still resolves *some* catalog row (observed: two runs of the same
  unmatchable hint returned two different unrelated objects); `EXPTIME = 1e400`
  is stored as `inf`, and Starlette's `JSONResponse` renders with
  `allow_nan=False`, so every response carrying that number raises
  `ValueError: Out of range float values are not JSON compliant: inf` → 500.
  Because the batch-history row is committed *before* the response is rendered
  (`app/server.py:760-766`), the 500 lands *after* the file, the `images` row and
  the `import_batches` row are all persisted.
- **trigger / reachability:** user action — *upload FITS frames* (the app's
  central feature; `POST /api/images/ingest`). Real-world FITS headers from
  third-party archives/pipelines are untrusted data; `1e400` in `EXPTIME` and
  `'Infinity'`/`'nan'` in `OBJCTRA/DEC` are exactly the malformed-card class the
  ingest path is expected to survive.
- **(b) reproduction:**
  `python reviews/0.6.24/evidence/py_probes.py parsers` → all of `nan`, `inf`,
  `-inf`, `1e400`, `1e309` returned as floats with `nonfinite=True` (expected:
  `None`, like the already-rejected `abc`).
  `python reviews/0.6.24/evidence/py_probes.py nonfinite1` →
  `ingest HTTP -> 500`, nothing written, consistent state afterwards (RA path).
  `python reviews/0.6.24/evidence/py_probes.py nonfinite2` →

  ```text
  ingest HTTP -> 500
  files written -> ['Andromeda Galaxy\\undated\\lights\\huge.fit']
  images rows  -> [('huge.fit', inf)]
  batch rows   -> [('Andromeda Galaxy', inf)]
  /api/state                           -> 200 nonfinite_token=False
  /api/library                         -> 500 nonfinite_token=False
  /api/library/imports                 -> 500 nonfinite_token=False
  /api/library/export?format=json      -> 200 nonfinite_token=True
  /api/library (loud) -> EXC ValueError: Out of range float values are not JSON compliant: inf
  /api/library/imports (loud) -> EXC ValueError: Out of range float values are not JSON compliant: inf
  ```

  i.e. the 500 does **not** roll back: the frame file is on disk and both the
  `images` row and the `import_batches` history row carry `inf` (history is
  committed at `app/server.py:760-766`, before the response is rendered), so
  `/api/library` + `/api/library/imports` then answer 500 on **every** subsequent
  request while `/api/library/export?format=json` keeps emitting the bare token
  `Infinity` (a strict JSON parser rejects it). Case matrix for the
  coordinate half (`ra=nan`, `dec=nan`, `ra=Infinity`, `ra=1e400`, `dec=Infinity`,
  `ra=-Infinity`, clean, one single-frame request each): the `nan` cases answer
  HTTP 200 but file the frame under an unrelated catalog object while the
  `Infinity`/overflow cases answer HTTP 500; the clean header answers 200.
  Exact exception sites (a direct call with `raise_server_exceptions=True`):

  ```text
  /api/library         -> EXC ValueError: Out of range float values are not JSON compliant: inf
  /api/library/imports -> EXC ValueError: Out of range float values are not JSON compliant: inf
  /api/library/export?format=json -> 200 with the bare token `Infinity`
  ```

  and for the coordinate half: `ValueError: expected a finite input, got inf`
  raised at `app/imglib.py:125` (`math.sin`), i.e. inside the ingest request.
- **impact:** one malformed header either (a) returns 500 for a multi-file batch
  the user selected, or (b) silently mis-files a frame under an unrelated target
  (wrong RA/Dec in the library), or (c) leaves a stored `inf` that breaks
  `/api/library` + `/api/library/imports` with 500 until the DB is repaired, and
  makes `/api/library/export?format=json` emit the non-standard token `Infinity`
  (no JSON parser accepts it; JS `JSON.parse` throws). User-reachable wrong
  behaviour with a persistent, corrupting side effect, no boundary breach → high.
- **falsifier:** if `_parse_value`/`parse_ra_hours`/`parse_dec_deg` returned
  `None` for non-finite values (or the ingest boundary applied the existing
  `_finite` rule), the 500s and the stored `inf` could not occur.
- **history:** `new`.
- **(d) regression class:** `pre-existing (<0.6.23)` — `app/fits.py` and
  `app/imglib.py` are byte-identical to `v0.6.23:app/fits.py` /
  `v0.6.23:app/imglib.py` (`git diff v0.6.23..HEAD -- app` is empty).

---

### PY-05 — `POST /api/settings` accepts any string as `active_pano_id`, including a value the panorama routes reject as an id

- **(c) lane:** t2 · **claimed severity:** low · **confidence:** high
- **(a) file:line:** `app/server.py:391-396` (`api_set_settings` →
  `db.set_active_panorama(body.active_pano_id)` for any non-null string);
  contrast `app/server.py:510-522` (`_pano_or_404` → `safe_token` or 404) and
  `app/server.py:620-630` (`api_delete_pano` → `safe_token(pid) else None`).
- **rule violated:** AGENTS.md §"Untrusted paths and imports":
  *"any record id interpolated into a file name goes through `paths.safe_token()`"*
  — the id is accepted at the settings boundary but refused by every route that
  would use it, i.e. the two halves of one contract disagree.
- **what is wrong:** `set_active_panorama` writes the string straight into the
  `settings` table and `/api/state` reports it as `active_pano_id` while
  `panoramas[]` contains no such row, so the client is told a panorama is active
  that no id-taking route will ever resolve (the crop/replace/image routes answer
  404 for that id). A hostile bundle reaches the same state through
  `settings.active_pano_id` (`app/database.py:64-66` accepts any string).
- **trigger / reachability:** `POST /api/settings {"active_pano_id": "../../evil"}`
  — a single HTTP request (or an imported bundle); the UI itself only sends real
  ids, so this is reachable by any local script/browser page the guard allows.
- **(b) reproduction:** `python reviews/0.6.24/evidence/py_probes.py panoid` →
  `POST /api/settings -> 200`, `GET /api/state -> active_pano_id = "../../evil"`,
  while `GET /api/panorama/..%5Cevil/image -> 404`.
- **impact:** a wrong/silent "active panorama" state that a client resolving the
  id by lookup will drop (falls back to no horizon) while `/api/state` keeps
  advertising it; no file operation is reachable because every id-consuming route
  re-checks the token (`_pano_or_404`, `safe_join`). No observable data damage →
  low.
- **falsifier:** if the settings route applied `safe_token` (or
  `set_active_panorama` ignored ids not present in `panoramas`), the state could
  not be stored.
- **history:** `new` (the `active_pano_id` field itself dates to `AstroPilot 0.1`);
  the review-time fix attempt in `ec69278` did not add a token check.
- **(d) regression class:** `pre-existing (<0.6.23)`.

---

### PY-06 — PY6 carry-over: the unverified TLS context is applied to the CDS host, then urllib follows a redirect to any host with that same context

- **(c) lane:** t2 · **claimed severity:** medium (asserted) · **confidence:** medium
- **(a) file:line:** `app/images.py:56-65` (`_INSECURE_CTX` /
  `_context_for()` keyed on the *original* URL host), `app/images.py:104-128`
  (`_http_bytes`: `urllib.request.urlopen(req, …, context=_context_for(url))`).
- **rule violated:** the carry-over record itself (AGENTS.md §"Code review record
  and status": *"`PY6` TLS-redirect hardening (same trust boundary, image bytes
  only)"*) plus `app/images.py:55-58`'s own justification —
  *"the CDS survey server ships an incomplete cert chain … EXACT host names only"*;
  the documented control is the hostname check, which a redirect walks around.
- **what is wrong:** `urlopen` uses the default opener with the redirect handler
  installed, so a 30x from `alasky.cds.unistra.fr` is followed transparently; the
  unverified `ssl` context is per-*opener*, not per-hop, and the next hop is never
  re-checked against `_INSECURE_HOSTS`. The result is an unverified TLS session
  with whatever host the first response names.
- **trigger / reachability:** any response from one of the two allow-listed CDS
  hosts that redirects elsewhere (server compromise, DNS/host misconfiguration,
  or a future CDS-side migration). The fetched bytes are written to
  `data/imgcache/<slug>.bin` and re-served to the UI as an object thumbnail, so a
  hostile server gets to place arbitrary bytes there.
- **(b) reproduction:** `static-only, no repro` — proving it needs a live
  allow-listed host that redirects to a third party, and this review must not
  issue network requests or mutate production/DNS state. Chain: (1)
  `_context_for(url)` at `app/images.py:108` decides on the original URL's host;
  (2) `urlopen` constructs an opener whose HTTPS handler carries that context;
  (3) `urllib.request` installs `HTTPRedirectHandler` by default, which re-issues
  the request to `Location` on the same opener; (4) `app/images.py:121-124`
  buffers up to `MAX_IMAGE_BYTES` from the final hop; (5) `app/images.py:377-378`
  writes it to the cache. No hop re-validates the host against
  `_INSECURE_HOSTS`.
- **impact:** the deliberate "public GET-only astronomy data, image bytes only"
  trust relaxation is extended to an arbitrary third-party host chosen by the
  allow-listed server (MITM/redirection target), with the bytes later fed to the
  UI. No code execution, no user data leaves the machine → medium, and honest
  about being `static-only`.
- **falsifier:** if `_context_for` were re-evaluated on the final URL (or
  redirects disabled for the insecure context), the relaxed context could not
  reach another host.
- **history:** `new` — this is the PY6 carry-over, still open; the host check was
  tightened to an exact-match set (`653e7f1`, "NightSeam 0.6.9") but the
  redirect hop was not addressed.
- **(d) regression class:** `pre-existing (<0.6.23)` — `git log --oneline
  v0.6.23..HEAD -- app/images.py` is empty; `_INSECURE_HOSTS` is dated `653e7f1`.

---

### PY-07 — The rolling `.backup` copy is made from the live SQLite file with `shutil.copyfile` (non-atomic, may capture a torn page set)

- **(c) lane:** t2 · **claimed severity:** low · **confidence:** medium
- **(a) file:line:** `app/database.py:268-274` (`make_backup`: `shutil.copyfile(self.path, str(self.path) + ".backup")`).
- **rule violated:** named general standard (resource safety / recoverability of a
  backup artifact); the code's own comment *"Keep one rolling backup of the user
  database next to the original"* implies a usable copy.
- **what is wrong:** `copyfile` byte-copies whatever the DB file contains over
  ~10 s for a 10 MB DB, with no lock and no `SQLite backup API`, while the server
  thread keeps writing (the DB is committed on every write). If a write lands
  mid-copy the artifact is a page-torn mix of two states; nothing validates it and
  the failure is invisible (`except OSError: pass`).
- **trigger / reachability:** on every boot (`Database.__init__` → `make_backup`),
  with the previous process's data volume; the artifact is only *read* by a user
  who tries to recover by renaming it.
- **(b) reproduction:** `static-only, no repro` — requires a concurrent writer
  during a real copy (and `python -c`/heredoc string setup is a documented
  environment artifact). Chain: `app/database.py:271-272` copies without
  `self.lock` and without `sqlite3.Connection.backup()`; `app/database.py:262`
  commits schema/seed writes just before; every route commits independently
  (`app/database.py:414`, `446`, `527`, …).
- **impact:** in the rare torn case a manual recovery from `nightseam.db.backup`
  fails or restores a mixed state; the copy is regenerated at the next boot and
  the *safety* copy for imports is a separate ZIP (`PY-02`), so this is `low`.
- **falsifier:** if the copy used the SQLite backup API or took `self.lock`
  around a consistent snapshot, no mixed state could be captured.
- **history:** `new`.
- **(d) regression class:** `pre-existing (<0.6.23)`.

### Route-level validation / error-path sweep (`app/server.py`)

Every registration was read; the columns record the validation that actually
runs and the error status a bad input produces. "probe" = exercised in this lane,
"read" = validation path read in source (no probe needed because the rule is
shared with a probed route).

| Route | Validation | Bad-input outcome |
| --- | --- | --- |
| `GET /api/state` | none needed (all values come from validated tables) | 200 (probed `headers`, `panoid`) |
| `POST /api/settings` | per-field coercion; **no token check on `active_pano_id`** | 200 with `"../../evil"` stored → PY-05 (probed) |
| `GET/POST/PUT/DELETE /api/sites` | `_check_site` (lat/lon/elev range + finite) | 400 (read; pinned by `tests/test_api.py`) |
| `POST/DELETE /api/rigs` | `_finite` + positive focal/sensor | 400 (read) |
| `GET /api/catalog` | none; `_adv` stripped | 200 (read) |
| `GET /api/object/{oid}/image` | 404 for unknown oid; `thumb=1` is cache-only | 404 / placeholder SVG (read) |
| `POST /api/panorama` | extension allow-list `jpg/jpeg/png/webp`; 60 MB cap in `_drain_upload` | 400 / 400 (read) |
| `GET /api/panoramas` | none; `panoramas()` parse is unguarded | 500 on unparsable `strokes` → PY-03 (probed) |
| `GET /api/panorama/{pid}/image` | `_pano_or_404` (`safe_token`) + `safe_join` + self-heal glob | 404 for `..\`, `..`, `con`, `a b`, 65-char ids (probed) |
| `POST /api/panorama/{pid}/image` | `safe_token`, extension allow-list, per-request temp name, `_finite` on az/fov | 400/404 (read + `tests/test_api.py` traversal cases) |
| `PUT /api/panorama/{pid}` | `paint_mode` allow-list, `_check_profile` ×2, `_finite` ×4; **strokes unbounded** | 400/200 → PY-03 (probed) |
| `DELETE /api/panorama/{pid}` | `safe_token` before any path use; idempotent | 200 (probed, traversal cases) |
| `GET /api/export` | spool file next to the DB, streamed, background unlink | 500 wrapped on export failure (read) |
| `POST /api/import` | Content-Length pre-check (exact path), 2 GiB spool cap, `ValueError`→400, `OSError`→500 | 400 for garbage zip (probed), 405 for `/api/import/` (no guard bypass) |
| `POST /api/catalog/custom` | `parse_ra_hours`/`parse_dec_deg` + range check + type allow-list | 400 for NaN/Inf/out-of-range (read; `test_custom_target_rejects_bad_ra`) |
| `DELETE /api/catalog/custom/{cid}` | `u_` prefix + `is_custom` | 400 otherwise (read) |
| `POST /api/library/reindex` | `rglob` over the configured archive; dedup by normalized path | per-file counters (read) |
| `POST /api/images/ingest` | 24 files/request, 1 GiB/file (`f.size` + stream cap), `_SESSION_NAME_RE`, `_RUN_ID_RE`; **no finiteness check on parsed headers** | 500 for `Infinity` RA / `1e400` EXPTIME → PY-04 (probed) |
| `GET /api/library/imports` | reads `import_batches` | 500 when a stored `total_exposure` is `inf` → PY-04 |
| `POST /api/library/open_folder` | `..` rejection + resolve-inside-`base` check + `is_dir` | 400/404 (read; `test_open_folder`) |
| `GET /api/library` | reads `images` + groups | 500 on a stored `inf` exposure → PY-04 |
| `POST /api/library/edit` | non-empty name, type allow-list, group exists, folder move must succeed | 400/404/500 (read; `test_ingest_unresolved_and_library_edit`) |
| `GET /api/library/export` | `format` ∈ {csv, json}; CSV is UTF-8-BOM | 400 (read; `test_library_export`) |
| `GET /api/images/{id}/preview` | `safe_join` + `is_file` + `preview_png_file` | 404/500 (read; `test_preview_endpoint`) |
| `GET/POST /api/shutdown` | host + same-origin guard | 403 cross-site (probed `headers`) |
| `GET /` + `StaticFiles` mount | none (UI shell) | 200 (read) |

Middleware reviewed as part of the same sweep: `guard_host` (Host allow-list +
`_same_origin_request`, all five spoofed-host/cross-site cases → 403, probed),
`touch` (Content-Length pre-check by **exact** `request.url.path`; `/api/import/`
answers 405 rather than importing, so the guard cannot be bypassed; `no-store`
on the UI shell).

---

## Carry-over audit (charter §6 — this lane owns `PY6`)

| Item | Owner lane | Resolution | Evidence |
| --- | --- | --- | --- |
| `PY6` | t2 | **STILL OPEN** (severity medium asserted, `static-only`) | Filed as **PY-06**: `app/images.py:63-65` re-checks nothing on the redirect hop; `app/images.py:107-108` still passes the per-host unverified context to `urlopen`. No new code between `v0.6.23` and HEAD (`git log --oneline v0.6.23..HEAD -- app/images.py` empty). Reproduction is static (no network allowed), so t7 must judge it as `static-only`. |

Rows owned by other lanes but observed while reading this lane's tree
(informational for t7, not filed twice here): `CR2` — the import boundary does
**not** normalize/validate `strokes` while it does validate both profile arrays
(`app/database.py:785-786` vs `826`), which is the storage-side half of the CR2
question and is filed once as **PY-03** (t3/t4/t5 own the consumer half).
`CR3`, `DS4`, `DS5`, `TL3`–`TL5`, `TS4`, `TS7`, `E15`, `WB7` are outside this
lane.

## Observations (severity-less, not for the ranked list)

- `Database.__init__` takes `db_path: Path` and calls `self.path.exists()` /
  `self.path.with_suffix(...)`; a caller passing `str` fails in `make_backup`
  (`AttributeError`). All in-tree callers pass a `Path` (`main.py:235`,
  `app/server.py` uses `db.path.parent`), so it is a type-annotation gap only.
- `app/fits.py:133-137` and `app/ingest.py:134-138` silently drop a negative
  `EXPTIME` (`v >= 0` required) so `exposure` becomes `None` — correct for
  calibration frames, but it means a signed float is indistinguishable from a
  missing card.
- `app/paths.py::safe_token` accepts `NUL`/`CON`/`com1` whereas `safe_rel`
  rejects them as path segments; harmless today because every sink prefixes the
  id (`f"{pid}.{ext}"`), and every such sink also passes `safe_join`.
- `/api/images/ingest` never enforces `MAX_INGEST_BYTES` against the total of a
  24-file request (24 GiB declared) — the per-file cap and Starlette's spool are
  the only limits; no crash or boundary crossing was found.
- `app/imglib.py:90-97` prefix-fallback matching means a hint that matches no
  designation can still resolve by longest-prefix; not filed (the *wrongness* was
  only produced together with the PY-04 `nan` path).

## Attestation

`git status --porcelain` at the end of this lane's work:

```text
?? .agent-teams/
?? reviews/
```

No file outside `reviews/0.6.24/` was created, modified or deleted by this lane;
every probe wrote only under `logs/` (gitignored, removed afterwards).
