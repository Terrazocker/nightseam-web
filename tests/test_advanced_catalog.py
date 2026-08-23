"""Sanity checks on the bundled advanced catalog (OpenNGC-derived CSV) and
the database seeding path."""

from pathlib import Path

from app.catalog_data import TYPE_LABELS
from app.database import Database

CSV = Path(__file__).resolve().parents[1] / "app" / "data" / "openned.csv"


def _csv_rows():
    with open(CSV, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            yield line.rstrip("\n").split(";")


def test_csv_exists_and_is_large():
    assert CSV.exists()
    assert CSV.stat().st_size > 1_000_000
    assert sum(1 for _ in _csv_rows()) > 10_000


def test_csv_rows_are_valid():
    cols = ("id", "primary_name", "messier", "ngcic", "other", "otype",
            "ra_hours", "dec_deg", "vmag", "size_am", "constellation",
            "distance", "wiki", "blurb", "search")
    ids = set()
    for r in _csv_rows():
        assert len(r) == len(cols), r[0]
        d = dict(zip(cols, r))
        assert d["id"] not in ids, d["id"]
        ids.add(d["id"])
        assert 0 <= float(d["ra_hours"]) < 24, d["id"]
        assert -90 <= float(d["dec_deg"]) <= 90, d["id"]
        assert d["otype"] in TYPE_LABELS, (d["id"], d["otype"])
        if d["vmag"]:
            assert -5 <= float(d["vmag"]) <= 21, d["id"]


def test_no_duplicates_with_curated_catalog():
    from app.catalog_data import rows as curated
    curated_keys = set()
    for r in curated():
        for k in (r["messier"], r["ngcic"]):
            if k:
                curated_keys.add(k.replace(" ", "").lower())
    for r in _csv_rows():
        d = dict(zip(("id", "primary_name", "messier", "ngcic"), r))
        assert d["ngcic"].replace(" ", "").lower() not in curated_keys
        assert d["messier"].replace(" ", "").lower() not in curated_keys


def test_db_seeds_advanced_catalog(tmp_path):
    db = Database(tmp_path / "t.db")
    assert db.advanced_count() > 10_000
    assert len(db.all_objects()) < 500          # standard mode unchanged
    adv = db.all_objects(advanced=True)
    assert len(adv) > 10_000
    assert sum(1 for o in adv if o.get("_adv")) > 10_000
    faint = next(o for o in adv if o["id"] == "ngc2242")
    assert faint["otype"] == "planetary"
    assert db.get_object("ngc2242")["primary_name"] == "NGC 2242"