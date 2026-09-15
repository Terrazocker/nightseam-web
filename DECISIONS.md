# DECISIONS.md — why NightSeam works the way it does

One entry per decision that an agent or maintainer would otherwise re-litigate.
Format: **decision** → why → what was rejected → where it is enforced.

`AGENTS.md` states the rules; this file records the reasoning. `CATALOG.md`
covers the data pipeline. Historical documents (`AUDIT.md`, `ARCH-AUDIT/`,
`reviews/`, `*-REPORT.md`) are **records of the state at the time** - read them
for history, never as instructions.

---

## 0.6.32 — No distance field, and the image lookup uses the designation

**Decision (a).** `distance` is gone from the catalogue: out of
`build_adv_catalog.py`'s row layout, out of the CSV and the hand-kept supplement,
out of the seeder's INSERT and column reader, out of the API payload and both
detail views. `Database._drop_retired_fields()` strips it from `SELECT *`
results, so an existing user database (whose table still carries the column -
user schemas are never re-shaped) cannot ship it either.

**Why.** It was ALWAYS empty - the curated list that once filled it was deleted in
0.6.26 - and OpenNGC has no distance column. Measured on the shipped sources:
`Pax` exists for 709 of 12,160 rows and for galaxies it is a foreground star's
parallax (M31: 6.0 mas => 167 pc against a true 780 kpc); `Redshift` covers 10,626
rows but is not a distance - M101's z gives 11 Mly against a true 23 Mly, M31 and
M33 are blueshifted (a naive conversion yields a negative distance), and 2,893
rows sit below z = 0.01 where peculiar motion dominates. A field that can only be
filled with a wrong number is worse than no field.

**Rejected.** (a) Filling it from `Pax` for the ~630 plausible rows: nothing tells
the user whether a parallax belongs to the object or to a star in front of it.
(b) Filling it from redshift with H0 = 70: defensible for distant galaxies, wrong
by 2x for exactly the famous nearby ones. (c) Keeping the empty column "for
later" - the empty column is what prompted the question.

**Decision (b).** The Wikipedia lookup tries the full designation first.
`core/catalog.js::wikiTitles()` returns the stored `wiki` title (none ships any
more), then `Messier N`, then the NGC/IC designation, then the display name; both
shells skip DISAMBIGUATION pages, and the detail view's Wikipedia link uses the
same first candidate (the web then rewrites it to the canonical title the API
returns, post-redirect).

**Why.** The display name of a Messier row without a common name IS the bare
`M101`, and `M101` on Wikipedia is a disambiguation page (motorways, highways, a
rifle). Measured: `Messier 101` and `NGC 5457` return BOTH a Wikidata P18 image
and a Wikipedia thumbnail; `M101` returns a Wikidata image but no page image - so
the old single-shot lookup gave up and the user saw "no photo on Wikipedia".

**Rejected.** (a) Free-text search - the module's own history (unrelated pages for
"M29") and the repo's rule against fuzzy matching. (b) Remembering a rate-limited
attempt as "no photo": probing showed the 6th rapid request returns HTTP 429, and
the web used to cache that as definitive for 30 days; it now stores only a
definitive failure and says "unavailable right now" otherwise.

**Enforced by.** `test_wiki_titles_avoid_the_messier_disambiguation_trap` (the
`wikititles` engine), `tests/test_catalog_integrity.py` (no editorial columns in
the CSV), `tests/test_supplement.py`, and the `data`/`col` test tuples.

## 0.6.31 — Progress must not move the layout

**Decision.** A live status may change its TEXT, never the geometry. The
catalog's count and progress live in a fixed-height row with a reserved status
width; the web table uses `table-layout: fixed` so a cell filling in ("…" → "42%")
cannot resize a column; the busy chip sits in a reserved `.busy-slot` in the
topbar of BOTH shells, and the slot reserves its HEIGHT as well as its width
(because at 1366 px the topbar already wraps, so an empty slot is a zero-height
row); the desktop's `#resultCount` is a fixed-width right-aligned block.

**Why.** Measured before/after: the desktop topbar grew 93 → 111 px whenever the
busy chip appeared, pushing the whole app down; the catalog table widened the PAGE
to 721 px at a 360 px viewport; the percentage columns redistributed on every
cell update. Only reserving WIDTH is not enough - the wrapping topbar made the
slot's height the real culprit.

**Enforced by.** `test_progress_and_status_never_move_the_layout` plus the browser
checks, which MEASURE table top, column widths, stats-row height and topbar height
before/while/after progress runs.

---

## 0.6.29 — Supplement batch 2: the popular targets OpenNGC's *scope* excludes

**Decision.** `app/data/supplement.csv` gained nine rows (16 total, catalogue
12,176): the Tulip Nebula (`sh2-101`), Simeis 147 / Spaghetti (`sh2-240`), the
Flying Bat + Squid (`sh2-129`), the Dolphin Head (`sh2-308`), the Lion Nebula
(`sh2-132`), Barnard 150 / Seahorse (`b150`), LBN 437, LDN 1622 and the Pipe
Nebula (`pipe`).

**Why these nine.** They are the first tier of a checklist of ~70 famous hobby
targets the shipped catalogue could not answer for. Every one is absent from
OpenNGC **structurally** (Sharpless/Barnard/LDN/LBN designations are outside its
NGC/IC + addendum scope) rather than dropped by the type filter, and the popularity source
already ranks every one of them - all nine above the Standard-mode cut
(`STANDARD_TOP_N` = 200), so the app's own popularity data selects them into
Standard mode with no hand-made rule. The same checklist cleared the catalogues
everybody asks about: Messier is 109/110 (M102 is upstream `Dup` of M101),
Caldwell's non-NGC members are already in the addendum (`c9` Cave, `c41` Hyades,
`c99` Coalsack, plus `c14` as a pair row), the Small Magellanic Cloud is
`ngc292`, M24 is `ic4715` and the Witch Head is `ngc1909` (upstream's IC 2118 is
the `Dup` pointer at it).

**Magnitude policy: `vmag` stays EMPTY.** An extended or dark nebula has no
credible integrated V magnitude, and the pre-0.6.26 curated list's proxies
(Barnard's Loop "5.0") are exactly the editorial data 0.6.26 removed. Empty is
also what the shipped addendum already does for `b33` (Horsehead), `c9`, `c99`
and `mel111`. The consequence is intended, not a bug: per `magVisible`, a row
with no magnitude appears only once the magnitude slider is at its maximum, so
these are plan-able at full depth and never at a brighter limit.

**Naming rule (id care).** Use the object's own catalogue designation when it has
one (`sh2-101`, `b150`, `lbn437`, `ldn1622`); use a NAME token when the identity
*is* a proper name with no single catalogue number (`pipe`). Every alternative
designation goes into `other`, so search still finds it. Never add an id whose
hyphen/space-stripped form equals another row's id: `M2-9` (Minkowski's
Butterfly) normalizes to `m29` = NGC 6913, so it is NOT usable as an id and needs
the alias treatment if it is ever added.

**Provenance.** Astrometry is SIMBAD ICRS/J2000 (`Sh2-101`, `Sh2-240`, `Sh2-129`,
`Sh2-308`, `Sh2-132`, `Barnard 150`, `LDN 1622`, `LBN 437`, and `NAME the Pipe
Nebula`, whose 240x180 arcmin size is a measurement citing 2018MNRAS.474.4672L).
Sizes are published values (Sharpless 1959, Lynds 1965 LBN, Wikipedia); LDN 1622
has NO published angular size, so its `size_am` is empty (like `c99`).
`distance`/`wiki`/`blurb` stay empty - the catalogue carries no prose.

**Rejected.** (a) Leaving the objects out because OpenNGC does not list them -
the app is a planner, not an OpenNGC mirror. (b) Bulk-importing Sharpless/LDN:
Sh2 alone is 313 objects and LDN is 1,800+, their positions come from papers with
their own licensing (not OpenNGC's CC BY-SA), and they are overwhelmingly not
hobby targets. (c) Inventing magnitudes to make them visible at the default limit
(see the magnitude policy). (d) Raising `STANDARD_TOP_N` so the nine displace
nobody - rejected for now: 200 is the documented promise, and the ranking is what
makes the displacement defensible (these nine are genuinely more observed than
the nine they replace).

**Enforced by.** `tests/test_supplement.py` (membership, types, no editorial
text, no invented magnitude, searchable designations, the normalization guard),
the advertised size in `tests/test_catalog_integrity.py`, `CATALOG.md`.

## 0.6.28 — The catalogue is OpenNGC *plus* a documented supplement (batch 1)

**Decision.** `app/data/supplement.csv` was introduced with seven objects OpenNGC
cannot represent (Medusa Nebula, Headphone Nebula, Barnard's Loop, Alpha Persei
Cluster, Sadr region/IC 1318, M40, M73) - objects it either lacks or files as
non-objects. 0.6.29 added batch 2 above; total catalogue: 12,176.

**Why.** They are real, plan-able targets that the pre-0.6.26 curated list
carried, and OpenNGC either lacks them or files them as non-objects (`IC 1318`
is typed `*` for gamma Cyg, `M73` `Other`, `M40` `**`). Dropping them silently
made the app worse at the exact moment it became more complete.

**Rejected.** (a) Staying "OpenNGC only" and losing the objects. (b) Editing the
OpenNGC CSVs. (c) A second curated list - the supplement is data in the
catalogue's own column layout, appended by the generator, with its own test that
pins the exact membership.

**Enforced by.** `tests/test_supplement.py` (membership, types, no editorial
text), the advertised size in `tests/test_catalog_integrity.py`, `CATALOG.md`.

## 0.6.28 — Keep the editorial text gone, keep popularity as it is

**Decision.** The catalogue carries no blurbs, distances or Wikipedia titles;
popularity is not refreshed on a schedule or checked for staleness.

**Why.** OpenNGC has no prose, and inventing a second prose source would
re-introduce exactly the curated/OpenNGC split the 0.6.26 rebuild removed. The
The popularity source ranking moves slowly (a live refresh shifted scores by ~0.5 % and no
standard-mode member for score reasons), so a refresh is a deliberate act, not a
chore.

**Rejected.** Re-attaching the old curated prose as a decoration layer (kept as
an option, not taken); a staleness warning in the guards.

## 0.6.26 — The catalogue IS OpenNGC; standard mode is the 200 most popular

**Decision.** The 197-row hand-curated list is deleted. Every row comes from
OpenNGC (`NGC.csv` + `addendum.csv`, then the supplement); `objects` holds the
200 highest-scoring objects and `advanced_objects` the rest.

**Why.** Two sources meant two truths for the same object (positions, types,
sizes), a hand-maintained dedup rule between them, and a catalogue that could not
be reproduced from its sources - the committed CSV could not even be regenerated
by its own script.

**Rejected.** (a) Keeping both lists. (b) Standard mode = a brightness cut
(arbitrary and not what "popular" means). (c) Standard mode = everything (loses
the point of a quiet default view). (d) Merging curated text into OpenNGC rows
(rejected with it).

**Enforced by.** `Database.seed_catalog()` (one CSV fills both tables),
`tests/test_catalog_integrity.py`, `tests/test_catalog.py`
(`standard_ids`), `CATALOG.md`.

## 0.6.26 — The seeder compares id SETS, not counts

**Decision.** `seed_catalog()` rebuilds both tables whenever the stored ids
differ from what the CSV + popularity rule select.

**Why.** A count check cannot see a popularity change (still 200 rows, different
200) and cannot repair an old curated-era database. Both tables are pure seed
data, so a rebuild is safe and needs no migration.

**Rejected.** Insert-only seeding with a version stamp in `settings`; a real SQL
migration.

**Enforced by.** `tests/test_advanced_catalog.py`
(`test_a_pre_openngc_database_is_rebuilt_on_open`,
`test_reseeding_is_idempotent`).

## 0.6.26/0.6.27 — Popularity must be deterministic

**Decision.** `scripts/match_popularity.py` scores the **highest** match over
every designation of a row, normalizes padded numbers, and carries a small alias
table for cross-catalogue names.

**Why.** The old matcher iterated a `set` and broke on the first hit, so M27 came
out as 73,260 (`M 27`) or ~4 (`NGC 6853`) depending on `PYTHONHASHSEED` - the
standard-mode selection built on it was not reproducible. Padding and naming
differences silently cost famous objects their score (the LMC, the Horsehead).

**Rejected.** Designation priority lists (fragile); fixing it by freezing one
lucky output.

**Enforced by.** `scripts/match_popularity.py` docstrings,
`tests/test_catalog.py` (identity, not numbers), `CATALOG.md`.

## 0.6.27 — Legacy library ids are migrated; unknown ones re-resolve at display

**Decision.** `LEGACY_ID_MAP` (114 entries) + `Database.migrate_legacy_object_ids()`
rewrite stored `images`/`import_batches` ids on first open; `app/imglib.py`
additionally re-resolves an id the catalogue does not know from the capture's own
OBJECT header/coordinates.

**Why.** A capture stores the id it resolved to at ingest time, so the catalogue
switch would otherwise show an existing library as "Unknown object". The two
mechanisms cover different cases: known renames are rewritten once, unknowns (a
build that is gone, a hand-edited library) are resolved for display.

**Rejected.** Leaving it to the user's `/api/library/reindex`; a migration that
touches user data beyond the two id columns.

**Enforced by.** `tests/test_library_ids.py`.

## 0.6.27 — The scoring-parity fixture carries its own inputs

**Decision.** `tests/fixtures/scoring_goldens.json` stores the 697 input objects
its stats were captured for.

**Why.** The engine used to rebuild its inputs from `web/catalog.json`, so any
catalogue change looked like a scoring regression - removing the curated list
"failed" the proof without a single scoring change.

**Rejected.** Regenerating the goldens (destroys the pre-change baseline).

**Enforced by.** `tests/test_scoring_parity.py`, `tests/js/scoring_parity.mjs`.

## 0.6.24/0.6.25 — Cache tokens are verified against a baseline, not a tag

**Decision.** `scripts/check_js_tokens.py` embeds a `{module: {token, sha256}}`
baseline; bytes changed while the token still equals the baseline token = FAIL.
Refreshing is only via `--update`, which refuses while a missed bump exists.

**Why.** v0.6.24 shipped 0.6.23 tokens naming 0.6.24 bytes, so returning visitors
kept every old module; no guard could see it. Comparing against `HEAD` or a tag
misses the post-tag repair shape and depends on release timing.

**Rejected.** Auto-bumping tokens in a build step; trusting review.

**Enforced by.** the guard's `--self-test`, `tests/test_cache_tokens.py`,
`tests/test_pre_tag_check.py`.

## 0.6.25/0.6.27 — `tests/conftest.py` overrides `tmp_path`

**Decision.** The fixture uses `logs/.pytest-tmp` (gitignored, sandbox-owned)
instead of pytest's basetemp.

**Why.** Under the agent sandbox `--basetemp=.pytest-tmp` can acquire an
owner-SID-only DACL, so every `tmp_path` test ERRORS at cleanup with WinError 5 -
an environment artifact that made the suite look broken (142 errors, 0 assertion
failures). Keeping the workaround in `conftest.py` means a plain
`python -m pytest tests/` is clean, instead of needing a scratch plugin that a
fresh clone would not have.

**Rejected.** Committing the plugin and a `-p` flag; adding `-p no:cacheprovider`
to every documented command.

**Enforced by.** `tests/conftest.py` (documented) + `AGENTS.md`.

## 0.6.20 — One JS core; Python astronomy deleted (Phase C)

**Decision.** `core/` is the only astronomy/planning implementation; `/api/night`
and `/api/object/{oid}` are gone; Python is storage/platform/IO.

**Why.** Three implementations of the same formulas had drifted (an X-axis
precession bug survived in all three because the regression goldens came from the
same lineage).

**Rejected.** Keeping the Python oracle behind a flag.

**Enforced by.** `scripts/check_core.py` (`MOVED_PY`), `tests/test_core_drift.py`,
`tests/js/reference_anchors.mjs` as the correctness authority.

## 0.6.12 — Catalogue ids are globally unique

**Decision.** An id is unique across curated + advanced rows together; both the
generator and the schema enforce it.

**Why.** Two rows sharing one id made the web `byId` map and `db.get_object()`
disagree about which object the id named.

**Rejected.** Deduplicating at runtime with a map.

**Enforced by.** `_assert_global_unique`, `tests/test_catalog_integrity.py`.

## Docs policy

**Decision.** `AGENTS.md` is canonical for invariants, commands, release and
deploy. `CATALOG.md` covers the data pipeline. `DECISIONS.md` (this file) records
reasoning. `README.md` is the user-facing feature list, `DESIGN.md` the UI
language. Everything under `AUDIT*`, `ARCH-AUDIT/`, `reviews/`, `BATCH3-REPORT.md`
and `*REPORT*.md` is a historical record.

**Rejected on purpose.** A `WORKFLOWS.md` and an `ARCHITECTURE.md`: both would
duplicate sections of `AGENTS.md` and drift out of sync, which is worse than not
having them. A `CONTRIBUTING.md` and a second `CHANGELOG.md`: no external
contributors, and `landing/changelog.json` + the `CURATED` table in
`scripts/build_changelog.py` already are the changelog.

## CO-07 - the two shells' "% of night" windows are NOT identical (documented, not unified)

**Measured (0.6.32 review, `reviews/0.6.32-full/20-core.md` CO-07):** the web
scores on a dusk-anchored 6-min grid; the desktop clips its noon-anchored
241-sample grid to `dusk..dawn`. The denominators differ by one sample (80 vs
79) and 20-66 of the 200 standard-mode rows differ by up to 4 pp (Berlin
2026-09-22, Berlin 2026-06-21, Tenerife). Since 0.6.30 the web's Min-visibility
gate keys on the WEB number, so list membership can differ between the shells.

**Decision: document the divergence rather than unify it in a fix batch.** The
two candidate fixes (snap the web's scoring window to whole noon-grid steps, or
pass the core an explicit sample range) both CHANGE user-visible planning numbers
on the public web app, and the second reaches into the time model that the scrub,
the charts and the tier/min-visibility browser checks are built on. That is a
release-level change with its own release note, not a correctness patch.

**Consequence:** `AGENTS.md`'s claim that "the web scores the same window as the
desktop on a 6-min grid" was FALSE and has been replaced with the measurement
above. Both shells still compute every number inside `dusk..dawn` (that
invariant holds); they merely sample that window on different phases.

## 0.6.33 batch - other decisions taken while fixing the 0.6.32 review

- **`CD-05` matcher fix without a re-bake.** The deterministic tie-break is fixed
  in `scripts/match_popularity.py` (highest score wins; equal score -> first in
  source order), but `app/popularity_data.py` is deliberately NOT regenerated:
  on the shipped snapshot the only affected key is `ngc6542` (3 -> 115), which is
  far outside the standard-mode cut. Re-baking would rewrite a tracked module and
  can re-select standard mode, so it stays a separate, deliberate act.
- **`SP-02` CSP keeps `script-src 'unsafe-inline'`.** `static/index.html`'s
  synchronous theme bootstrap (`XMLHttpRequest GET /api/state`) must run before
  first paint, so inline script stays permitted; remote script is still fully
  blocked (`'self'`), the JSONP path is gone, and the update check now runs
  server-side via `POST /api/update-check`. Verified against the real server:
  the header is served, the inline bootstrap runs, and an inline `onerror=`
  attribute still fires (so the two `onerror=` fallbacks in
  `static/js/{targets,tonight}.js` keep working - the feared "cosmetic
  regression" does not exist).
- **`CD-02` ships the `search` column, at a size cost.** `web/catalog.json` grows
  from 3,834,258 to 5,088,280 bytes (+33%) because the OpenNGC `search` blob is
  now in the payload; that is what makes 25 rows (e.g. `tarantula`,
  `coathanger`, `silver coin`) findable on the web. It is text, so gzip absorbs
  much of it, but the trade is deliberate and worth re-measuring if the payload
  is ever streamed.

## Shell unification pass (0.6.33 work tree) - one rule, one loop, one codebase

The owner's directive: the web shell is further along and more current, both
shells should run on mostly the same code so a change lands in both at once, and
the BETTER implementation is used for both - but only where it works in a
browser too, and never at the cost of a regression.

**What was unified (real cross-shell code, not prose):**

- `core/visibility.js::inTonightPool(vmag, isAdv, advCap)` +
  `vmagKnownAndUnder` + `ADV_TONIGHT_MAG_CAP` + `TONIGHT_MAG_UNCAPPED` - which
  objects may reach the Tonight list is ONE rule now, called by
  `web/app.js::renderTonight` and `static/js/tonight.js::renderTonight`. This
  FIXES a defect rather than only deduplicating: the web's inline
  `o.vmag != null` dropped 45 of the 200 standard-mode objects (IC 1396, the
  Running Man, NGC 281, the Flame, the Tulip, Simeis 147, the Double Cluster,
  the Pipe Nebula, ...) while the comment above it claimed desktop parity. The
  unknown-magnitude answer is deliberately YES - the same reasoning as
  `magVisible`'s "a no-magnitude object shows at the slider maximum".
- `core/scoring.js::scoreNightTracks(..., ctx.range = [lo, hi])` - the scoring
  SPAN is a parameter, so the desktop (241-sample noon->noon payload for its
  charts, clipped to dusk..dawn) and the web (grid == the dark window, no range)
  run the SAME loop. `derive.js::recomputeNightDerived` no longer owns a second
  aggregation; that second loop is what let CO-07 drift. The desktop's
  `best`/`best_above`/`score`/`score_moon` contracts and the
  `tests/js/scoring_parity.mjs` characterization goldens are preserved
  bit-for-bit (`bestStart` is captured incrementally, never recomputed as
  `jd - run*step`).

**What deliberately did NOT move into `core/`:**

- **CSS.** `web/style.css` + `web/themes.css` and `static/style.css` +
  `static/themes.css` share only the design LANGUAGE (the `dome` token blocks),
  not the files - selector overlap is 23%/16%. The two shells have different
  DOMs (a 6-pane tab app vs a JS-rendered single view), so a shared stylesheet
  would be a rewrite with no correctness gain. The AGENTS rule stands: `dome` is
  the language, `classic` the fallback, and structural themes never move IDs.
- **Storage, backup and data delivery.** IndexedDB + `localStorage` versus
  SQLite + FastAPI is a platform split, not duplication. The web's
  stage-validate-commit restore is genuinely better, and it is already what
  DECISIONS/the AGENTS invariant describe; porting it to Python would be a
  rewrite of `app/backup.py`'s write path for no user-visible gain, so the
  desktop keeps its safety copy + rollback and the web keeps staging.
- **The advanced-mode magnitude cap.** The web caps the Tonight pool at mag 9
  because scoring ~5,900 objects per repaint is not viable in a browser. That is
  a PERFORMANCE parameter, so it is passed in per shell (`TONIGHT_MAG_UNCAPPED`
  on the desktop, which carries the whole catalog in its payload anyway) instead
  of being duplicated as a second inline expression. Same rule, different
  budget.
- **The grid anchor (CO-07).** Still open on purpose: aligning the web's grid to
  the desktop's noon->noon payload would move user-visible web numbers
  (`% of night`, the scores, the clear window). The divergence is now confined to
  the anchor, because the arithmetic is shared.

**Consequence: no two shells, one codebase for the domain.** The rule for the
next change is the same as the one this pass followed: if a decision can be
expressed as a pure function of data, it belongs in `core/` and both shells call
it; if it needs the DOM, storage or a network, it stays in the shell and gets a
parity pin instead.

### The scoring grid anchor stays as it is (CO-07, closed as DECIDED)

The two shells score the same dark window with slightly different sample sets:
the desktop's payload grid is a 24 h noon->noon day for its charts and is clipped
to dusk..dawn (87 samples at 47.5 N on 2026-03-14), while the web's grid IS
dusk..dawn and lands on 88. That one sample moves `% of night` by a point and a
score by up to 0.07 on 12 of 14 probed rows (and 20-66 of 200 standard rows by up
to 4 pp in the original 0.6.32 survey).

**Rejected: aligning either side.** Re-anchoring the web's grid to noon->noon
changes numbers the web has shipped for releases (and its `View full day` span),
while re-anchoring the desktop's payload breaks the chart margins and the
`scrubgrid` contract. Both are user-visible behaviour changes traded for a 1 pp
cosmetic difference.

**Rejected: making the desktop pass a sample list instead of an index range.**
It would let both engines share identical sample times, but it changes the
already-characterized `tests/js/scoring_parity.mjs` goldens for no user-visible
gain.

**What WAS done (shell-unification pass):** the arithmetic is shared
(`core/scoring.js::scoreNightTracks` with `ctx.range`), so the divergence is
confined to the ANCHOR - a grid choice each shell makes for its own rendering -
instead of living in two independent aggregation loops. Pinned as "one loop, one
span parameter" and documented as a deliberate anchor difference.

### The web shell ships a Content-Security-Policy

`web/.htaccess` sets `default-src 'self'`, `script-src 'self'` plus the SHA-256
of the ONE inline theme bootstrap (deliberately NOT `'unsafe-inline'`:
`tests/browser/harness.py` recomputes the hash, and the web shell has no inline
handler at all), `style-src 'self'`, `img-src 'self' data:
https://upload.wikimedia.org`, `connect-src 'self' https://en.wikipedia.org`,
plus `base-uri`/`form-action`/`frame-ancestors`/`object-src` and
`Referrer-Policy`/`X-Content-Type-Options`. The desktop has carried an equivalent
policy in `app/server.py` since SP-02; the STATIC shell is the public origin and
had none, which is the wrong way round.

The file is deployed by hand (the FTPS uploader skips dotfiles), so
`python scripts/check_browser.py --prod-url https://nightseam.de/astro/` is the
verification: it fails when the header is absent, when `script-src` is missing or
allows `unsafe-inline`/`unsafe-eval`, when the inline hash is stale, or when
`connect-src` is absent - and it now also asserts that an allowlisted
`upload.wikimedia.org` response actually loaded, because a policy that breaks the
photos is worse than the text being right. `tests/test_prod_csp.py` pins all of
that offline.

### Cache-token register history (moved out of AGENTS.md)

AGENTS.md carries only the CURRENT register; the cascade record lives here so the
instructions stay inside their byte budget. Every core re-bake moves the stub
token and changes the bytes of every module importing it, so those tokens move in
the same commit:

* 0.6.32-review fixes touched `core/horizon.js`, `core/astro.js`,
  `core/catalog.js`, `core/scoring.js`, `core/time.js` -> stub 24 -> 25.
* CR3 (CO-01, review 0.6.24) touched `core/horizon.js` + `core/index.js` ->
  stub 17 -> 19.
* the WE-03 comment corrections -> stub 19 -> 20 (that re-bake exercised the N-1
  retention: the manifest now records `previous` and BOTH trees stay in place).
* shell-unification pass: `core/visibility.js` + `core/scoring.js` +
  `core/index.js` -> stub 26 -> 33 across the intermediate bakes (25..32), each
  one cascading the web tokens; `core/panohistory.js` was added in the same pass
  (10 core modules now).
* the tagged v0.6.24 register was 60/10/41/17/7/20 with stub 17; 0.6.23 (live)
  was 59/9/40/16/6/19.

### The deployed CSP is limited by the host's nginx front end (measured)

`web/.htaccess` sets the policy, but on the live host **nginx serves
`.html`/`.js`/`.css` itself** and never reaches Apache for those paths, so the
directives arrive only where nginx proxies (measured 2026-09-15:
`/astro/version.json` carries `Content-Security-Policy` + `Referrer-Policy` +
`X-Content-Type-Options`; `/astro/`, `/astro/app.js` and `/astro/style.css` carry
none). `mod_headers` is working - the path split is the host's architecture, not
a broken config, and it is the same reason `web/ftps_deploy.py` uploads the file
by hand (the uploader skips dotfiles).

To cover the HTML, the policy has to be added at the nginx layer
(Plesk: domain -> Apache & nginx Settings -> Additional nginx directives), e.g.
`add_header Content-Security-Policy "<the same policy>" always;`. That is a
host-side action outside this repo.

Consequence for the release gate: `web-prod` probes every path under the deployed
URL for the policy. If the host serves it somewhere, the policy is validated
(`script-src` present, no `unsafe-inline`/`unsafe-eval`, the CURRENT inline-theme
hash, `connect-src` present) and a bad policy FAILS the gate. If the host serves
it nowhere, that is a printed NOTE rather than a failure - the repo cannot assert
a platform property it does not control - while the policy's content and hash
stay pinned offline by `tests/test_prod_csp.py`.
