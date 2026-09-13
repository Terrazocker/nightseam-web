"""Sanity checks on the OpenNGC catalog policy: the type vocabulary, the
shipped popularity table, and the standard-mode selection rule.

The catalog DATA itself is `app/data/openned.csv` (OpenNGC); the tests that
check its shape live in `tests/test_advanced_catalog.py`, and its identity
(uniqueness, the standard/advanced split, the advertised size) in
`tests/test_catalog_integrity.py`.
"""

import csv
from pathlib import Path

from app import catalog_data
from app.catalog_data import STANDARD_TOP_N, TYPE_LABELS, standard_ids
from app.popularity_data import POPULARITY

CSV = Path(__file__).resolve().parents[1] / "app" / "data" / "openned.csv"
VALID_TYPES = set(TYPE_LABELS.keys())
CSV_COLS = ("id", "primary_name", "messier", "ngcic", "other", "otype",
            "ra_hours", "dec_deg", "vmag", "size_am", "constellation",
            "distance", "wiki", "blurb", "search")


def _rows() -> list[dict]:
    """The shipped CSV (its column names live in the `#` header comment, not in
    a data row)."""
    with open(CSV, encoding="utf-8") as f:
        return [dict(zip(CSV_COLS, l.rstrip("\n").split(";")))
                for l in f if not l.startswith("#") and l.strip()]


# ------------------------------------------------------------- standard mode

def test_standard_mode_is_the_most_popular_objects():
    ids = [r["id"] for r in _rows()]
    std = standard_ids(ids)
    assert len(std) == STANDARD_TOP_N
    cutoff = min(POPULARITY[i] for i in std)
    assert cutoff > 0, "an unscored object must never be standard"
    outside = [i for i in ids if i not in std]
    assert max(POPULARITY.get(i, 0) for i in outside) <= cutoff
    # the classic showpieces are the ones users expect to see first
    assert POPULARITY["ngc1976"] == 165530 and "ngc1976" in std     # M42
    assert POPULARITY["ngc224"] == 161360 and "ngc224" in std       # M31


def test_standard_selection_is_deterministic_and_skips_unscored():
    # score descending, then id ascending
    assert standard_ids(["b", "a", "c"], {"a": 5, "b": 5, "c": 1}, top_n=2) == {"a", "b"}
    # nothing scored -> empty (no padding with unscored rows)
    assert standard_ids(["a", "b"], {}) == set()
    assert standard_ids(["a", "b", "c"], {"a": 1, "b": 9, "c": 5}, top_n=2) == {"b", "c"}
    # a smaller scored pool than top_n yields a smaller standard list
    assert standard_ids(["a"], {"a": 1}, top_n=200) == {"a"}


def test_standard_ids_ignores_ids_that_are_not_in_the_catalog():
    assert standard_ids(["a"], {"zz": 99}) == set()


# --------------------------------------------------------------- popularity

def test_popularity_table_scores_the_shipped_catalog():
    ids = {r["id"] for r in _rows()}
    assert len(POPULARITY) > 7000
    assert set(POPULARITY) <= ids, "the table may only name shipped catalog ids"
    assert all(s > 0 for s in POPULARITY.values())


# ------------------------------------------------------------------- policy

def test_the_curated_catalog_is_gone():
    """The catalog is OpenNGC only: no hand-written rows, no second popularity
    table, and the ids those rows owned are now OpenNGC ids."""
    assert not hasattr(catalog_data, "rows")
    assert not hasattr(catalog_data, "POPULARITY")
    ids = {r["id"] for r in _rows()}
    assert "ngc1976" in ids and "m42" not in ids        # M42
    assert "mel22" in ids and "m45" not in ids          # M45
    assert "ngc7000" in ids                             # id happens to match


def test_types_are_known():
    for r in _rows():
        assert r["otype"] in VALID_TYPES, (r["id"], r["otype"])


def test_coordinates_and_magnitudes_are_in_range():
    for r in _rows():
        ra, dec = float(r["ra_hours"]), float(r["dec_deg"])
        assert 0 <= ra < 24, r["id"]
        assert -90 <= dec <= 90, r["id"]
        if r["vmag"]:
            assert -2 <= float(r["vmag"]) <= 21, r["id"]


def test_messier_objects_openngc_carries_are_found_by_designation():
    """107 of the 110 Messier numbers exist as OpenNGC objects. M40 and M73 are
    not objects in OpenNGC's classification (`**` double star / `Other`) and
    M102 is the disputed duplicate (`Dup`) - they are absent, deliberately, and
    their absence is what 'OpenNGC only' means."""
    rows = _rows()
    messiers = {r["messier"] for r in rows if r["messier"]}
    assert len(messiers) == 107
    for missing in ("M40", "M73", "M102"):
        assert missing not in messiers
    assert "M42" in messiers


def test_search_blob_contains_designations():
    m42 = next(r for r in _rows() if r["id"] == "ngc1976")
    blob = m42["search"].lower()          # the clients lowercase before matching
    assert "ngc1976" in blob
    assert "ngc 1976" in blob
    assert "m42" in blob
    assert "orion nebula" in blob
    # 78 Messier objects have no OpenNGC common name, so the M designation is
    # the label the app shows ('M101', not 'NGC 5457')
    m101 = next(r for r in _rows() if r["id"] == "ngc5457")
    assert m101["primary_name"] == "M101"
    assert "m101" in m101["search"].lower()
