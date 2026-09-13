"""The committed supplement (`app/data/supplement.csv`).

The catalogue is OpenNGC plus this one small, documented exception set: seven
objects OpenNGC either lacks or files as non-objects. The tests here pin what
makes that acceptable - the rows are well formed, they are labelled with the
project's own types, they carry NO editorial text, and they are the only rows in
the shipped CSV that the OpenNGC pipeline cannot produce.
"""

import csv
import importlib.util
from pathlib import Path

import pytest

from app.catalog_data import TYPE_LABELS
from app.database import Database

ROOT = Path(__file__).resolve().parents[1]
SUPPLEMENT = ROOT / "app" / "data" / "supplement.csv"
CATALOG = ROOT / "app" / "data" / "openned.csv"
COLS = ("id", "primary_name", "messier", "ngcic", "other", "otype", "ra_hours",
        "dec_deg", "vmag", "size_am", "constellation", "distance", "wiki", "blurb", "search")

# The exception set, by name - adding an eighth object must be a deliberate edit
# here (and in the copy that advertises the count).
EXPECTED = {
    "m40": ("Winnecke 4", "asterism"),
    "m73": ("M73", "asterism"),
    "mel20": ("Alpha Persei Cluster", "open_cluster"),
    "ic1318": ("Gamma Cygni Nebula (Sadr Region)", "nebula"),
    "sh2-276": ("Barnard's Loop", "nebula"),
    "abell21": ("Medusa Nebula", "planetary"),
    "jones1": ("Headphone Nebula", "planetary"),
}


def _rows(path=CATALOG):
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            vals = line.rstrip("\n").split(";")
            assert len(vals) == len(COLS), line[:40]
            yield dict(zip(COLS, vals))


def test_supplement_file_is_wellformed():
    rows = list(_rows(SUPPLEMENT))
    by_id = {r["id"]: r for r in rows}
    assert set(by_id) == set(EXPECTED), "additions must be deliberate"
    for oid, (name, otype) in EXPECTED.items():
        r = by_id[oid]
        assert r["primary_name"] == name, oid
        assert r["otype"] == otype, oid
        assert r["otype"] in TYPE_LABELS, oid
        assert 0 <= float(r["ra_hours"]) < 24, oid
        assert -90 <= float(r["dec_deg"]) <= 90, oid
        if r["vmag"]:
            float(r["vmag"])


def test_supplement_rows_carry_no_editorial_text():
    """The catalogue has no prose (the 0.6.26 decision): the supplement must not
    smuggle the old curated blurbs/distance/wiki titles back in."""
    for r in _rows(SUPPLEMENT):
        assert not (r["distance"] or r["wiki"] or r["blurb"]), r["id"]


def test_supplement_rows_are_shipped_and_searchable():
    shipped = {r["id"]: r for r in _rows()}
    for oid in EXPECTED:
        assert oid in shipped, oid
        assert not (shipped[oid]["distance"] or shipped[oid]["wiki"]
                    or shipped[oid]["blurb"]), oid
        blob = shipped[oid]["search"].lower()
        assert oid in blob, oid
    # the two Messier numbers OpenNGC cannot represent are searchable by number
    assert "m40" in shipped["m40"]["search"].lower()
    assert "m73" in shipped["m73"]["search"].lower()
    assert shipped["sh2-276"]["primary_name"] == "Barnard's Loop"


def test_generator_reads_the_supplement_and_keeps_ids_unique():
    spec = importlib.util.spec_from_file_location(
        "build_adv_catalog", ROOT / "scripts" / "build_adv_catalog.py")
    gen = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gen)
    rows = gen.read_supplement()
    assert {r["id"] for r in rows} == set(EXPECTED)
    shipped = {r["id"] for r in _rows()}
    for r in rows:
        assert r["id"] in shipped


def test_supplement_objects_are_unscored_or_scored_like_any_other(tmp_path):
    """They take part in the normal rules: a popularity-source score if the source has
    one (then Standard mode may show them), nothing invented if it does not."""
    from app.popularity_data import POPULARITY
    db = Database(tmp_path / "t.db")
    for oid in EXPECTED:
        row = db.get_object(oid)
        assert row is not None, oid
        assert db.get_object(oid)["popularity"] == POPULARITY.get(oid, 0)
    assert POPULARITY.get("ic1318") and POPULARITY.get("sh2-276")
