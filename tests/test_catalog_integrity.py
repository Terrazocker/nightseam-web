"""Catalog identity integrity.

The shipped 0.6.11 catalog contained 12,116 rows but only 12,114 unique ids:
the curated composites `ngc2237` (Rosette Nebula, NGC 2237-2246) and `ngc7317`
(Stephan's Quintet, NGC 7317-7320) each collided with an advanced member row.
The desktop `get_object()` returned the curated row while the web `byId` map
could return the member - the same id named two different objects.

These tests pin the fix: ids are globally unique across curated + advanced, are
safe as URL/route tokens, and resolve to the intended object.
"""

import importlib.util
import json
import re
from pathlib import Path

import pytest

from app.catalog_data import TYPE_LABELS, rows as curated_rows
from app.database import Database

ROOT = Path(__file__).resolve().parents[1]
CSV = ROOT / "app" / "data" / "openned.csv"
CATALOG_JSON = ROOT / "web" / "catalog.json"
TOKEN = re.compile(r"[a-z0-9][a-z0-9_-]{0,63}")
COLS = ("id", "primary_name", "messier", "ngcic", "other", "otype", "ra_hours",
        "dec_deg", "vmag", "size_am", "constellation", "distance", "wiki",
        "blurb", "search")


def _gen():
    spec = importlib.util.spec_from_file_location(
        "build_adv_catalog", ROOT / "scripts" / "build_adv_catalog.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _adv_rows():
    with open(CSV, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            vals = line.rstrip("\n").split(";")
            assert len(vals) == len(COLS), line[:40]
            yield dict(zip(COLS, vals))


# ------------------------------------------------------------------ generator

def test_generator_expands_curated_ranges_to_member_numbers():
    gen = _gen()
    assert gen._desig_keys("NGC 7317-7320") == \
        {"ngc7317", "ngc7318", "ngc7319", "ngc7320"}
    assert gen._desig_keys("NGC 2237-2246") == {f"ngc{n}" for n in range(2237, 2247)}
    assert gen._desig_keys("NGC 650/651") == {"ngc650", "ngc651"}
    assert gen._desig_keys("M31") == {"m31"}
    assert gen._desig_keys("") == set()
    assert gen._desig_keys("NGC 100-50") == {"ngc100"}   # broken range degrades


def test_generator_global_uniqueness_guard_raises_on_collision():
    gen = _gen()
    with pytest.raises(SystemExit):
        gen._assert_global_unique([{"id": "ngc2237"}])    # curated already owns it
    gen._assert_global_unique([{"id": "zz9999"}])         # no collision -> no raise


# --------------------------------------------------------------------- data

def test_curated_ids_unique_and_token_safe():
    ids = [r["id"] for r in curated_rows()]
    assert len(ids) == len(set(ids))
    for i in ids:
        assert TOKEN.fullmatch(i), i


def test_advanced_ids_unique_and_token_safe():
    ids = [r["id"] for r in _adv_rows()]
    assert len(ids) == len(set(ids))
    for i in ids:
        assert TOKEN.fullmatch(i), i


def test_global_catalog_ids_unique():
    ids = [r["id"] for r in curated_rows()] + [r["id"] for r in _adv_rows()]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    assert dupes == [], f"duplicate catalog ids: {dupes}"
    assert len(ids) == len(set(ids))


def test_advanced_rows_wellformed():
    for r in _adv_rows():
        assert r["primary_name"].strip(), r["id"]
        assert 0 <= float(r["ra_hours"]) < 24, r["id"]
        assert -90 <= float(r["dec_deg"]) <= 90, r["id"]
        assert r["otype"] in TYPE_LABELS, (r["id"], r["otype"])
        if r["vmag"]:
            float(r["vmag"])


# ------------------------------------------------------- lookup / regression

def test_colliding_ids_resolve_to_the_curated_composites(tmp_path):
    """ngc2237 / ngc7317 must name the curated COMPOSITE in both apps, and the
    advanced member rows must be absent from the data (not hidden by a map)."""
    db = Database(tmp_path / "t.db")
    assert db.get_object("ngc2237")["primary_name"] == "Rosette Nebula"
    assert db.get_object("ngc7317")["primary_name"] == "Stephan's Quintet"
    adv_ids = {o["id"] for o in db.all_objects(advanced=True) if o.get("_adv")}
    assert "ngc2237" not in adv_ids
    assert "ngc7317" not in adv_ids


def test_existing_db_with_colliding_advanced_row_is_cleaned_on_start(tmp_path):
    """A DB seeded before the fix still carries the member row; reopening must
    drop it (the catalog-identity cleanup runs on every start)."""
    p = tmp_path / "old.db"
    db = Database(p)
    db.conn.execute(
        "INSERT OR IGNORE INTO advanced_objects(id,primary_name,otype,ra_hours,dec_deg) "
        "VALUES('ngc2237','Rosetta A','nebula',6.5,5.0)")
    db.conn.commit()
    assert any(o["id"] == "ngc2237"
               for o in db.all_objects(advanced=True) if o.get("_adv"))
    db2 = Database(p)
    assert not any(o["id"] == "ngc2237"
                   for o in db2.all_objects(advanced=True) if o.get("_adv"))
    assert db2.get_object("ngc2237")["primary_name"] == "Rosette Nebula"


def test_web_catalog_ids_unique_and_resolve_like_desktop(tmp_path):
    cat = json.loads(CATALOG_JSON.read_text(encoding="utf-8"))
    ids = [o["id"] for o in cat]
    assert len(ids) == len(set(ids)), "web/catalog.json has duplicate ids"
    db = Database(tmp_path / "t.db")
    union_ids = [o["id"] for o in db.all_objects(advanced=True)]
    assert len(union_ids) == len(set(union_ids)), "desktop catalog union has duplicate ids"
    for o in cat:
        got = db.get_object(o["id"])
        assert got is not None, o["id"]
        assert got["primary_name"] == o["primary_name"], o["id"]
