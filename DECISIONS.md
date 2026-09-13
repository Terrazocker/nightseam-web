# DECISIONS.md — why NightSeam works the way it does

One entry per decision that an agent or maintainer would otherwise re-litigate.
Format: **decision** → why → what was rejected → where it is enforced.

`AGENTS.md` states the rules; this file records the reasoning. `CATALOG.md`
covers the data pipeline. Historical documents (`AUDIT.md`, `ARCH-AUDIT/`,
`reviews/`, `*-REPORT.md`) are **records of the state at the time** - read them
for history, never as instructions.

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
