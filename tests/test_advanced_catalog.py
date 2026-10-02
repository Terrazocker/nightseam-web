"""Sanity checks on the bundled catalog CSV (OpenNGC NGC/IC + addendum) and the
database seeding path.

This file IS the catalog: there is no hand-curated object list any more, so
every row must be a well-formed OpenNGC object and the seeded tables must be
exactly it.
"""

import csv
from pathlib import Path

from catalog_data import STANDARD_TOP_N, TYPE_LABELS, standard_ids
from catalog_data.popularity_data import POPULARITY

CSV = Path(__file__).resolve().parents[1] / "catalog_data" / "data" / "openned.csv"
COLS = ("id", "primary_name", "messier", "ngcic", "other", "otype", "ra_hours",
        "dec_deg", "vmag", "size_am", "constellation", "wiki",
        "blurb", "search")


def _csv_rows():
    with open(CSV, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            yield line.rstrip("\n").split(";")


def _rows() -> list[dict]:
    """The shipped CSV (its column names live in the `#` header comment)."""
    with open(CSV, encoding="utf-8") as f:
        return [dict(zip(COLS, l.rstrip("\n").split(";")))
                for l in f if not l.startswith("#") and l.strip()]


def test_csv_exists_and_is_large():
    assert CSV.exists()
    assert CSV.stat().st_size > 1_000_000
    assert sum(1 for _ in _csv_rows()) > 10_000


def test_csv_rows_are_valid():
    ids = set()
    for r in _csv_rows():
        assert len(r) == len(COLS), r[0]
        d = dict(zip(COLS, r))
        assert d["id"] not in ids, d["id"]
        ids.add(d["id"])
        assert 0 <= float(d["ra_hours"]) < 24, d["id"]
        assert -90 <= float(d["dec_deg"]) <= 90, d["id"]
        assert d["otype"] in TYPE_LABELS, (d["id"], d["otype"])
        if d["vmag"]:
            assert -5 <= float(d["vmag"]) <= 21, d["id"]


def test_openngc_non_objects_are_not_shipped():
    """OpenNGC marks its own non-object rows: `Dup` (a duplicate that points at
    the master entry), `NonEx` (nonexistent), single/double stars, `Other`,
    `Nova`. None of those ROWS ships - NGC 651 (Dup of NGC 650) and OpenNGC's
    M40 (`**`) / M73 (`Other`) / IC 1318 (`*`) rows are gone. The three notable
    ones come back through `catalog_data/data/supplement.csv` instead, under their own
    ids and with the project's own types (see tests/test_supplement.py)."""
    ids = {r["id"] for r in _rows()}
    for oid in ("ngc651", "ngc6994", "m102"):
        assert oid not in ids, oid
    assert "ngc650" in ids          # the master entry stays
    assert "b33" in ids             # Barnard 33 (Horsehead) - addendum, DrkN
    # the supplement's replacements exist, and are NOT OpenNGC ids
    assert {"m40", "m73", "ic1318"} <= ids
