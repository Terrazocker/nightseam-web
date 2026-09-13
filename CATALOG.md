# CATALOG.md — where the catalogue comes from and how to rebuild it

Scope: the **data chain** only (sources → CSV → DB → web payload → cache tokens).
`AGENTS.md` stays canonical for invariants, release order and deploy; `DECISIONS.md`
records *why* the rules below exist.

## What is generated and what is hand-kept

| File | Status | What it is |
|---|---|---|
| `app/data/openned.csv` | **generated** | THE catalogue (12,167 rows). Never hand-edit. |
| `app/data/supplement.csv` | **hand-kept** | The only non-OpenNGC data: 7 objects (below). |
| `app/popularity_data.py` | **generated** | the popularity source scores, one per catalogue id. |
| `web/catalog.json` | **generated** | The web payload, derived from the DB. |
| `web/catalog.manifest.json` | generated | Bytes for the current `CATALOG_TOKEN`. |
| `data/NGC.csv`, `data/addendum.csv` | gitignored input | Downloaded from OpenNGC. |
| `data/popularity_snapshot.json` | gitignored cache | Last fetched the popularity source table. |

## Sources

1. **OpenNGC `database_files/NGC.csv`** (NGC/IC, 13,970 rows upstream) →
   12,098 objects. Rows whose `Type` says they are not objects are dropped:
   `Dup` (a duplicate that points at its master), `NonEx`, `*`/`**` stars,
   `Other`, `Nova` (see `NGC_guide.txt` upstream).
2. **OpenNGC `database_files/addendum.csv`** (64 rows upstream) → 62 objects: the
   notable objects with no NGC/IC number (Horsehead, Hyades, Coalsack, the
   Magellanic Clouds, the Local Group dwarfs, …).
3. **`app/data/supplement.csv`** → 7 objects OpenNGC cannot carry, either absent
   from it or filed as non-objects: `abell21` (Medusa Nebula), `jones1`
   (Headphone Nebula), `sh2-276` (Barnard's Loop), `mel20` (Alpha Persei
   Cluster), `ic1318` (Sadr region), `m40` (Winnecke 4), `m73`. Identity and
   astrometry are the project's own values from the pre-0.6.26 curated list;
   distance/wiki/blurb are empty, because the catalogue carries no prose.

## Rebuild, in order

```powershell
# 0. inputs (gitignored): NGC.csv + addendum.csv from
#    https://github.com/mattiaverga/OpenNGC (database_files/)
#    -> data/NGC.csv, data/addendum.csv

# 1. catalogue CSV  (asserts unique ids; RAISES on an unmapped OpenNGC type)
python scripts/build_adv_catalog.py

# 2. popularity     (--cached replays data/popularity_snapshot.json; without it, it
#                    fetches live - that MOVES scores and re-ranks standard mode)
python scripts/match_popularity.py --cached

# 3. database + web payload (a scratch DB is the clean way: Database() seeds and
#    splits both tables on open, rebuilding them when the stored sets disagree)
python -c "import sys; sys.path.insert(0,'.'); from app.database import Database; Database('logs/opengnc/db/nightseam.db')"
python web/build_web.py catalog --db logs/opengnc/db/nightseam.db

# 4. cache tokens   (a changed web/catalog.json MUST bump CATALOG_TOKEN + manifest;
#                    any changed web module MUST bump its ?v=)
python scripts/check_catalog_token.py
python scripts/check_js_tokens.py --update     # refuses while a missed bump exists
python scripts/check_js.py
```

Checks that catch the classic mistakes: `tests/test_catalog_integrity.py`
(unique/token-safe ids, the standard/advanced split, the CSV ↔ JSON ↔ DB counts,
and the **advertised size** in six copy sites), `tests/test_supplement.py` (the
exception set), `tests/test_advanced_catalog.py` (row shape, seeding),
`tests/test_catalog.py` (types, coordinates, the standard-mode rule).

## Rules that are easy to get wrong

- **Never hand-edit a generated file.** A hand-patched `openned.csv` is exactly
  how the 0.6.11 catalogue kept shipping two colliding ids after the fix landed.
- **Standard mode = the `STANDARD_TOP_N` (200) highest scores**, ordered score
  descending then id ascending; an unscored object is never standard. `objects`
  holds that set, `advanced_objects` the rest, and they are disjoint - advanced
  mode is the whole catalogue.
- **Ids are global and token-safe** across both tables together, because the web
  `byId` map and `db.get_object()` must agree; `tests/test_catalog_integrity.py`
  fails otherwise. Never hide a collision with a runtime lookup - fix the data.
- **The supplement is deliberately the only exception** to "the catalogue is
  OpenNGC". Adding a row there means updating `EXPECTED` in
  `tests/test_supplement.py`, the advertised count in six copy sites (the test
  tells you), and this file.
- **Popularity is a silent input**: it is never rendered (`test_ui_invariants.py`),
  and it also selects standard mode - so a refresh changes *which* 200 objects
  the default view shows. The tests pin the ranking identity (M42 first, M31
  second), never the numbers, because the source moves.

## Display mappings applied at build time

- OpenNGC `Cl+N` ("star cluster + nebula") → `nebula`: its famous members are
  M42, IC 1396, the Heart/Soul nebulae, the Cocoon.
- Serpens `Se1`/`Se2` → `Ser`.
- A common name OpenNGC gives to more than one row gets its designation:
  "Eagle Nebula (NGC 6611)", "Antennae Galaxies (NGC 4038)". The bare name stays
  in `search`.
- Where OpenNGC has no common name (78 Messier objects), the Messier number is
  the label ("M101", not "NGC 5457").

## Failure modes seen in practice

- **Padded catalogue numbers**: the popularity source keys the LMC as `PGC 17223`, OpenNGC
  writes `PGC 017223`; the matcher normalizes leading zeros, otherwise famous
  objects silently lose their score.
- **Different names for the same object**: `BARNARD 33` vs `B 33`,
  `CL MELOTTE 111` vs `Mel 111`, `M 102` vs `NGC 5866` → `POPULARITY_ALIASES`
  in `scripts/match_popularity.py`.
- **Non-deterministic matching**: the matcher must score the HIGHEST match over
  every designation; iterating a `set` and breaking on the first hit made scores
  depend on `PYTHONHASHSEED`.
- **Stale DB when generating the payload**: the seeder rebuilds both tables when
  the stored id sets disagree with the CSV + popularity rule, so open a scratch
  DB rather than trusting a long-lived one.
