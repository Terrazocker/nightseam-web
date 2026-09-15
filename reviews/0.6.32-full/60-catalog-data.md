# Catalog & data lane - sources -> CSV -> DB -> web payload

Subject: `v0.6.32-3-g3277846` (HEAD `3277846`), tree clean apart from the untracked
`REVIEW-PROMPT.md` + `reviews/0.6.32-full/`. Scratch: `reviews/0.6.32-full/evidence/catalog/`
(`scratch.db`, `catalog.regen.json`, `probe*.py`, `probe*.out.txt`). No product file, no
generated data file and no git state was modified (`git status --porcelain` clean at start
and after every probe).

## What I checked (and how)

1. **Type mapping, adversarially** - `probe3_types.py` fed `_build_row` a row with `Type='WAT'`:
   it raises `SystemExit("… OpenNGC type 'WAT' has no NightSeam mapping …")`, and raises *before*
   the coordinate check. No `TYPE_MAP.get(..., "galaxy")` fallback exists in the file. Every raw
   type in both sources is mapped or skipped (NGC 20 types, addendum 9 - none unclassified).
2. **Rebuild, in memory** - `probe2_rebuild.py` re-ran the shipped `build_catalog()` over the real
   `data/NGC.csv` + `data/addendum.csv` + `app/data/supplement.csv` and re-serialized with the same
   `csv.writer(delimiter=";")`: **byte-identical** to the shipped `app/data/openned.csv`
   (sha256 `06613b03…01d4`). Counts reproduced exactly: 12,098 NGC/IC + 62 addendum + 16 supplement
   = **12,176**. Row filtering: 1,872 of 13,970 NGC rows dropped as `Dup`/`NonEx`/`*`/`**`/`Other`/
   `Nova` (651+10+546+243+419+3) and 2 of 64 addendum rows; `ngc650` in, `ngc651` out, `ngc6994`
   absent, OpenNGC's IC 1318 (`*`)/M73 (`Other`)/M40 (`**`) rows gone and all three back as
   supplement rows.
3. **Display mappings** - `Cl+N` -> nebula for all 67 raw rows; `Se1`/`Se2` -> `Ser` for all 162 raw
   rows (148 survive with `constellation == "Ser"`); 12 rows carry the appended-designation form
   ("Eagle Nebula (NGC 6611)", "Antennae Galaxies (NGC 4038)", …) with the bare name still in `search`.
4. **Identity** - 12,176 unique ids, all `safe_token()`-legal, NFD-stable, none a Windows device name;
   `objects` (200) + `advanced_objects` (11,976) union has 0 duplicate ids; DB union == CSV == payload.
5. **Standard mode** - `standard_ids()` = exactly 200 ids = the positive-score top-200 by the
   documented (score desc, id asc) rule; 0 unscored rows in it; the cut is rank 200 `ngc6530` (2,032).
6. **Supplement** (`probe7_supplement.py`, independent of the test file) - exactly the 16 ids in the
   shipped CSV; batch-1 all carry a `vmag`, all nine batch-2 rows have `vmag == ""`; `wiki`/`blurb`
   empty; batch-1 ids are NOT in `LEGACY_ID_MAP` (so they resolve directly); all 114 legacy entries
   map to ids present in the CSV; all 16 resolve from the scratch DB with the CSV name.
7. **Popularity determinism** - `probe5_pop.py` re-ran the matcher's own functions in-process under
   `PYTHONHASHSEED=0/1/12345`: the same scored dict every time (7,654 entries) == the shipped
   `app/popularity_data.py`. `probe10_matcher_cli.py` ran the REAL CLI (`--cached`) twice with the
   three output constants shadowed into the evidence dir: rc=0, "POPULARITY (7654 scored entries)",
   the written module byte-identical to the shipped one under both seeds (sha256 `d8d6cb11…56cd`),
   cache untouched. `PGC 017223`/`PGC 17223` both normalize to `pgc17223`; all four aliases land.
8. **Ranking identity + tiers** - rank 1 `ngc1976` (M42), rank 2 `ngc224` (M31), rank 3 `ngc3031`.
   `probe6_tiers.mjs` ran the real payload through `core/catalog.js`: the standard-mode letters are
   identical object-for-object to the whole-catalog letters (0 mismatches, 0 standard rows in F);
   standard A=100/B=100, advanced A=100/B=150/C=350/D=900/E=2000/F=8676; every unscored row is F.
   Both shells rank the current mode's set (`web/app.js:2510 activeCatalog()`, `static/js/targets.js:21`).
9. **Payload reproducibility** - fresh `Database(evidence/catalog/scratch.db)` (both tables re-seeded
   on open) then `python web/build_web.py catalog --db <scratch> --out <evidence>` ->
   **byte-identical** to the shipped `web/catalog.json` (sha256 `ae002a9a…5c6c`, 3,834,258 B), the
   same hash `web/catalog.manifest.json` records for `CATALOG_TOKEN='9'`. The shipped file was never
   touched (`--out`).
10. **Advertised sizes** - the 6 pinned sites all read 12,176 and the CSV really has 12,176 rows;
    I also swept every `1[012],\d\d\d` in `web/`, `static/`, `landing/`, `README.md` for sites the
    test does not pin (see CD-01/CD-08).
11. **Hygiene** - 0 rows with an out-of-range RA/Dec, 0 negative vmag, 0 non-positive/unparsable
    sizes, 0 control characters, 0 U+FFFD, 0 non-ASCII bytes, 0 rows needing CSV quoting, every row
    exactly 14 naive-`;` fields, no `\r`, no duplicate display names, no duplicated coordinates.
    `vmag` empty 711, sizes empty 98 (expected).
12. Targeted tests: `tests/test_catalog_integrity.py tests/test_supplement.py tests/test_catalog.py
    tests/test_advanced_catalog.py -q` -> **35 passed**; `tests/test_ui_invariants.py` -> **36 passed**
    (the popularity-never-rendered rule). Full suite deliberately not run (the captain's job).

## Findings

### CD-01 medium CONFIRMED - the desktop shell still advertises 12,160 objects and omits the supplement
- `static/index.html:129` (context `static/index.html:127-129`)
- impact / mechanism: the desktop Advanced-mode hint reads "advanced adds the complete OpenNGC
  catalog - NGC/IC plus its addendum (12,160 objects to magnitude 20)", i.e. it understates the
  shipped catalogue by 16 and claims Advanced adds no supplement. The web twin was corrected to
  12,176 + "a 16-object supplement" at 0.6.29 (`git log -S "12,176" -- web/index.html` -> `365dc0e`);
  this line was last touched at 0.6.26 (`d412998`) and survived 0.6.28 (`4bcbcd9`) and 0.6.29
  unchanged, so the two shells contradict each other about the same catalogue. A user who reads the
  advanced-mode hint in the desktop menu is told a smaller catalogue than the one he sees when he
  ticks the box (Advanced really loads all 12,176: `static/js/main.js:56` -> `/api/catalog?adv=1`).
- evidence: `git show 4bcbcd9:static/index.html` -> `(12,160 objects to magnitude 20)`; same text in
  `git show d412998:static/index.html`; current `read static/index.html offset=122 limit=12`. Sweep of
  `web/ static/ landing/` shows every other site already at 12,176 (web/index.html:7,105,205;
  web/app.js:6; landing/index.html:7,9; landing/about.html:39).
- repro: open the desktop app -> hamburger -> Advanced -> read the hint; compare with
  `(Get-Content app/data/openned.csv | Where-Object { $_ -notmatch '^#' -and $_.Trim() }).Count` = 12176.
- requiredFix: in `static/index.html:127-129` use the web wording, i.e. "advanced adds the complete
  catalog - NGC/IC plus its addendum and a 16-object supplement OpenNGC cannot carry (12,176 objects
  to magnitude 20)". No token bump needed for an HTML-only text change, but bump `app.js?v=` only if
  a JS file is touched.
- counterArgument: `tests/test_catalog_integrity.py::test_advertised_catalog_size_matches_the_shipped_catalog`
  deliberately pins only the six `web/`+`landing/` sites (`ADVERTISED_SITES = 6`) and the desktop
  shell is out of that test's scope - so this is an *unguarded* copy site, not a broken guard. It is
  also only visible inside the Advanced menu. Neither makes the number correct; 0.6.29's own changelog
  sold "12,176 objects" to the user, so the desktop hint is simply stale.
- regression: pre-existing since `d412998` (0.6.26), stale since 0.6.28.

### CD-02 low CONFIRMED - the desktop search does not index `primary_name`, and `core/catalog.js` documents the opposite rule
- `static/js/targets.js:124`, `core/catalog.js:34-38`
- impact / mechanism: the desktop target filter is
  `if (q && !(m.search || "").toLowerCase().includes(q)) return false;` - only the CSV `search`
  column. The web instead builds `searchBlob(o)` = id + `primary_name` + messier + ngcic + other +
  type + constellation + blurb (`core/catalog.js:36-39`, used at `web/app.js:125`). The two models
  differ because the *display name is not in `search` for every row*: the build appends the
  designation to a shared common name (`scripts/build_adv_catalog.py:202`) and `search` keeps only
  the bare name, so 12 shipped rows (`ic4703`, `ngc4038`, `ngc4039`, `ngc4435`, `ngc4438`,
  `ngc4567`, `ngc4568`, `ngc6611`, `ngc6992`, `ngc6995`, `ic1318`, `sh2-240`) do not contain their
  own displayed label. Typing the exact label the desktop list shows ("Eagle Nebula (NGC 6611)")
  finds nothing there while the web finds it. The comment above `searchBlob` says "The desktop
  searches the server's designation blob instead (`app/catalog_data.py`); the two models stay
  per-shell" - the desktop searches nothing of the sort (it uses the same client-side `m.search`),
  and `catalog_data.py` has no blob, so the comment documents a divergence that no longer exists
  and hides the real one.
- evidence: `Select-String -Path web\app.js,static\js\*.js -Pattern searchBlob` -> only `web/app.js:125`
  and the stub exports; reading `static/js/targets.js:122-135` shows the `m.search`-only filter.
  "rows whose primary_name is NOT in search" over the shipped CSV = the 12 ids above.
- repro: desktop, search `Eagle Nebula (NGC 6611)` -> no rows; search `Eagle Nebula` -> 2 rows.
- requiredFix: search the same shape as the web (e.g. test `m.search` **or** `m.primary_name`),
  or add the disambiguated `primary_name` to the build's `search` value; fix the `core/catalog.js`
  comment to describe the real per-shell models.
- counterArgument: the bare name *is* searchable, so no object is unreachable by its common name -
  only by the exact label the row displays. The web/desktop "models stay per-shell" note could be
  read as licensing the difference, but the note itself is factually wrong about what the desktop
  does, which is why I file it.
- regression: pre-existing.

### CD-03 low CONFIRMED - `_read_catalog_csv`/`match_popularity.read_csv` mis-parse a field containing `;`
- `app/database.py:1044-1052` (loader), `scripts/match_popularity.py:242`, `scripts/build_adv_catalog.py:241-246` (writer)
- impact / mechanism: the generator writes with `csv.writer(delimiter=";")`, which QUOTES any field
  containing `;`, `"` or a newline; every downstream reader instead does a naive
  `line.rstrip("\n").split(";")`. A future source row with a quoted field would therefore be
  silently dropped by `_read_catalog_csv` (`len(vals) != len(cols) -> continue`) and by the matcher
  (`len(parts) < 10 -> continue`), and `tests/test_catalog_integrity.py::_adv_rows` would fail with a
  confusing "field count" assertion instead of naming the cause. Today the crisis is masked: the
  shipped CSV has 0 quoted fields, 0 rows whose naive split is not 14 fields and 0 `\r`, so the
  readers and the writer agree.
- evidence: `probe1_data.py` -> `rows whose naive ';' split is not 14 fields: 0`,
  `rows containing a double quote: 0`, `csv-module parsed rows: 12176 field counts: {14: 12176}`.
- repro: append a row whose `other` field contains `;` (e.g. `x;y`) to a COPY of the CSV and load it
  with `_read_catalog_csv` -> that row is skipped with no warning.
- requiredFix: parse with `csv.reader(..., delimiter=";")` in `database._read_catalog_csv` and
  `match_popularity.read_csv` (or assert at build time that no field needs quoting and fail loudly).
- counterArgument: this is a robustness-only defect with no shipped-data impact (the OpenNGC
  columns use `,`/`|` as separators), so it is a latent trap rather than a current user-facing bug -
  hence low, not medium.
- regression: pre-existing.

### CD-04 low CONFIRMED - `Database.advanced_count` is defined twice in the same class
- `app/database.py:397` and `app/database.py:464`
- impact / mechanism: two identical definitions; the second silently shadows the first. No behaviour
  change today, but the lane's canonical "how many advanced rows are there" accessor is duplicated,
  so a future edit to one of them (e.g. a filter, a cached count) takes effect or not depending on
  which one the editor happened to see - and the dead one is invisible to coverage and to grep-by-eye.
- evidence: `Select-String -Path app\*.py -Pattern "def advanced_count"` -> lines 397 and 464;
  `tests/test_catalog_integrity.py:189` depends on its value.
- repro: `python -c "import ast;t=ast.parse(open('app/database.py',encoding='utf-8').read());print([n.name for n in t.body[-1].body if getattr(n,'name','')=='advanced_count'])"`
- requiredFix: delete the copy at 397 (or 464) - one accessor.
- counterArgument: pure duplication with no observable effect, so a reviewer could call it taste;
  I file it as low because an accessor used by the advertised-size test existing twice is a real
  (if small) maintenance hazard, not a style preference.
- regression: pre-existing.

### CD-05 low CONFIRMED - the cached-the popularity source index silently loses a colliding key pair
- `scripts/match_popularity.py:334-343` (the dict branch `main()` actually uses)
- impact / mechanism: the index is keyed by `normalize(name)` and the dict branch overwrites
  (`tel_index[norm] = (k, score)`), so the LAST entry in *source order* wins - a
  source-order-dependent choice, which is exactly the class of bug the `match_objects` docstring
  says was fixed. In the shipped cache `data/popularity_snapshot.json` one pair collides:
  `"NGC 654 2"` (115) and `"NGC 6542"` (3) both normalize to `ngc6542`, and `ngc6542` is shipped
  with score 3 instead of 115.
- evidence: `probe5_pop.py` -> `popularity names colliding after normalize: 1 ['ngc6542']`,
  `ngc6542 -> [('NGC 654 2', 115), ('NGC 6542', 3)] index keeps: ('NGC 6542', 3)`.
- repro: `python -c "import json,re;d=json.load(open('data/popularity_snapshot.json',encoding='utf-8'));n=lambda s:re.sub(r'(?<![0-9])0+(?=\d)','',re.sub(r'[\s\-\.\(\)]+','',s.lower()));print([(k,d[k]) for k in d if n(k)=='ngc6542'])"` -> 115 and 3.
- requiredFix: make the collision explicit - keep the highest score for a colliding key (like
  `match_objects`) or skip ambiguous keys; do not let file order decide.
- counterArgument: `"NGC 654 2"` is almost certainly a popularity-source typo for NGC 6542 itself, the
  affected row (`ngc6542`, a V=13.5 galaxy) is far outside the top 200, and 3-vs-115 changes no
  ordering a user can see - so the user impact is nil today. It is filed as the guard-level defect
  (a source-order tiebreak in the matcher that the docstring claims cannot happen), not as a score
  error worth a re-bake.
- regression: pre-existing.

### CD-06 low CONFIRMED - stale docstrings about the supplement's size/layout in two files
- `scripts/build_adv_catalog.py:29-33`, `scripts/build_adv_catalog.py:162-166`
- impact / mechanism: line 30 still says "the seven objects OpenNGC cannot carry", and
  `read_supplement`'s docstring says "The committed supplement, already in the catalogue's column
  layout" while the function in fact parses `;`-split lines and casts `ra_hours`/`dec_deg`/`vmag` -
  the same mis-description that matters because a reader who trusts it would look for a CSV reader
  that is not there (see CD-03). `CATALOG.md:28-45` and `app/data/supplement.csv:1-28` both say 16.
- evidence: `read scripts/build_adv_catalog.py` lines 29-34 and 162-166 vs
  `read app/data/supplement.csv` (16 rows) and `build_catalog()` -> `supplement: 16`.
- repro: `Select-String -Path scripts/build_adv_catalog.py -Pattern "seven|appended as-is|column layout"`
  -> `:29` "the seven", `:32` "appended as-is", `:163` "already in the catalogue's column layout"; then
  `python -c "import importlib.util;s=importlib.util.spec_from_file_location('g','scripts/build_adv_catalog.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(len(m.read_supplement()))"` -> 16.
- requiredFix: "the sixteen objects" in both places; say "parsed here" rather than "appended as-is".
- counterArgument: comments only, no runtime effect - the weakest finding in this lane, filed only
  because a reviewer following the build doc lands on the wrong count and the wrong parse model.
- regression: pre-existing (line 30 since the supplement became 16 in 0.6.29).

### CD-07 low CONFIRMED - `web/app.js:255` documents "all 12,160 OpenNGC objects" for the advanced mode
- `web/app.js:255`
- impact / mechanism: the comment above `advMode()`/advanced-mode handling says
  "Standard (the 200 most popular) vs advanced (all 12,160 OpenNGC objects)". Advanced shows
  12,176 (12,160 OpenNGC + 16 supplement) and the same file's own header comment (line 6) correctly
  says 12,176 - so the file contradicts itself 250 lines apart, and this is the copy a maintainer
  reads when changing the mode.
- evidence: `read web/app.js` line 255 vs line 6; CSV row count 12,176; payload length 12,176.
- repro: `(Get-Content web/app.js)[4..6]` -> line 6 says "12,176 objects", and
  `Select-String -Path web/app.js -Pattern "12,16[0-9]"` -> line 255 says "12,160"; the CSV count
  `(Get-Content app/data/openned.csv | Where-Object { -not $_.StartsWith('#') -and $_.Trim() }).Count` -> 12176.
- requiredFix: "all 12,176 objects (OpenNGC + supplement)".
- counterArgument: comment-only; no user sees it. Filed low as a docs-vs-data defect in the lane
  whose whole job is the advertised counts.
- regression: pre-existing since 0.6.26.

### CD-08 low CONFIRMED - the advertising guard cannot see the desktop shell
- `tests/test_catalog_integrity.py:155-177`
- impact / mechanism: `ADVERTISED_SIZE` lists five patterns in three `web/`+`landing/` files and
  `ADVERTISED_SITES = 6` asserts the count of *matches*, so a stale claim is caught only where a
  pattern was registered and only if the number of matches stays exactly 6. `static/index.html:129`
  (CD-01) is the proof that the gap is real: the desktop's own advertised catalogue size drifted
  16 objects and two releases unnoticed, and a NEW claim added to any unregistered file (or a second
  claim added to a registered file) fails the "expected 6" assertion rather than checking the value.
- evidence: `test_advertised_catalog_size_matches_the_shipped_catalog` + the CD-01 evidence; the
  sweep of `1[012],\d\d\d` in `web/`, `static/`, `landing/`, `README.md` returns the faulty
  `static/index.html:129` as the only mismatch.
- repro: `python -m pytest tests/test_catalog_integrity.py -k advertised -q` passes while
  `static/index.html:129` still reads 12,160 - the case it names is simply not in `ADVERTISED_SIZE`.
- requiredFix: add the `static/index.html` hint pattern (and a `README.md` pattern) to
  `ADVERTISED_SIZE`, and derive `ADVERTISED_SITES` as `len(seen)` with a per-file expectation
  instead of a bare total.
- counterArgument: the guard's docstring scopes it to "every user-facing claim" and it does pin the
  public web/landing copy, which is the copy customers see before downloading - the desktop app
  hint is arguably a second-class surface. Also, four of the five patterns are anchored on unique
  wording, so the "6" is not as brittle as it looks. Still a guard that cannot do its job for the
  file that is actually wrong today.
- regression: pre-existing.

## Refuted (claims I checked that are NOT bugs)

- **"`_build_row` may fall back to `galaxy`"** - refuted: `scripts/build_adv_catalog.py:102-107`
  raises `SystemExit` on an unmapped type (executed with `Type='WAT'`), before the coordinate check;
  no `TYPE_MAP.get(..., "galaxy")` remains. Every raw type in the sources is mapped or skipped, so
  "the row filter accepts a de-facto-invalid OpenNGC type" is not demonstrable from the repo either.
- **"`standard_ids` pads the standard list with unscored rows"** - refuted: `probe9` shows all-zero
  popularity -> `set()`, 2 scored of 4 -> 2 rows; the real cut is rank 200 at score 2,032 with 0
  unscored rows inside the top 200. The `if score` filter is redundant but harmless.
- **"popularity is non-deterministic / `--cached` is not reproducible / `--cached` rewrites the
  cache"** - refuted: three hash seeds in-process and two through the real CLI all reproduce the
  shipped `app/popularity_data.py` byte-for-byte (7,654 entries), and the cache was untouched.
- **"rank 1/2 identity is wrong" / "the tier letters differ by mode"** - refuted: `ngc1976` (M42)
  then `ngc224` (M31); 0 letter mismatches across the 200 standard rows; every unscored row is F.
- **"`web/catalog.json` may be hand-edited / is not reproducible"** - refuted: byte-identical from a
  fresh scratch DB, sha256 == the manifest entry for `CATALOG_TOKEN='9'`.
- **"the advertised sizes are wrong"** - refuted for the six pinned sites (all read 12,176 = the
  shipped row count). The stale desktop hint is CD-01, an eighth site the guard does not pin.
- **"supplement membership or its empty `vmag` policy drifted"** - refuted: the 16 ids, the batch-1
  non-empty / batch-2 empty `vmag` split, empty `wiki`/`blurb` and batch-1's non-aliased ids all hold
  in the shipped CSV and the scratch DB.
- **"OpenNGC's M40/M73/IC 1318/M102/NGC 6994 rows leak in"** - refuted: those raw rows are
  `**`/`Other`/`*` (dropped) or absent from the sources; `ngc651` (Dup) is gone while `ngc650` ships.
- **"the popularity NUMBER is rendered" / "the catalogue still ships a `distance` field"** -
  refuted: `tests/test_ui_invariants.py` passes (36), no `${…popularity…}` in either shell, and
  `distance` is absent from the payload keys, the CSV columns and both shells
  (`_RETIRED_COLUMNS` in `app/database.py:1034`).
- **"the matcher implements its documented tie-break"** - refuted as a *defect*: `match_objects`
  only replaces on `score > best[0]` (`scripts/match_popularity.py:215`), so it keeps the first
  *sorted* key rather than the smallest key among ties; `probe5` finds only 2 tied rows (`ngc279`,
  `ngc7617`, both score 1) whose alternatives differ by 0-1 in popularity. The outcome is
  deterministic, so this is a doc inaccuracy with no observable effect, not a finding.

## Not checked (honest coverage gaps)

- **The real upstream sources.** `data/NGC.csv`/`data/addendum.csv` are the local (gitignored)
  inputs; I verified the pipeline is a pure function of them, not that they match the upstream
  OpenNGC revision or that the supplement's SIMBAD coordinates/sizes are right beyond cross-checks
  (IC 1318 sits 0.56 deg from NGC 6910 and equals OpenNGC's own gamma-Cyg position; every supplement
  row is in its stated constellation). A wrong published size or a transcription error inside
  `app/data/supplement.csv` would survive every guard here.
- **Live the popularity source refresh.** Not fetched (offline rule), so I did not verify that a live
  `match_popularity.py` run still lands the same 7,654 ids or keeps M42/M31 first - only that
  `--cached` replays the committed cache reproducibly.
- **The desktop exe / frozen bundle.** All DB and payload work used the source interpreter and a
  scratch DB; I did not exercise the seeded catalogue inside `dist/NightSeam.exe`, nor that a frozen
  build resolves `resource_dir()/app/data/openned.csv`.
- **The live deployment** - I did not fetch `nightseam.de` to confirm the deployed `catalog.json`
  matches the manifest hash.
- **The full test suite** (deliberately left to the captain's single end-of-review run): I ran the
  four catalogue modules (35 passed) and `test_ui_invariants.py` (36 passed) only.
- **Advanced-mode runtime behaviour** (12k-object table, chart cost, the min-visibility gate) - the
  performance/UI lanes' territory, not this lane's.
