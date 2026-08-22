"""Sanity checks on the embedded DSO catalog."""

from app.catalog_data import rows, TYPE_LABELS

VALID_TYPES = set(TYPE_LABELS.keys())


def test_catalog_size():
    data = rows()
    # full Messier catalog + famous NGC/IC showpieces
    assert len(data) >= 170


def test_unique_ids():
    ids = [r["id"] for r in rows()]
    assert len(ids) == len(set(ids))


def test_all_messier_objects_present():
    messiers = {r["messier"] for r in rows() if r["messier"]}
    for n in range(1, 111):
        assert f"M{n}" in messiers


def test_coordinates_in_valid_ranges():
    for r in rows():
        assert 0 <= r["ra_hours"] < 24, r["id"]
        assert -90 <= r["dec_deg"] <= 90, r["id"]
        if r["mag"] is not None:
            assert -2 <= r["mag"] <= 18, r["id"]


def test_types_are_known():
    for r in rows():
        assert r["type"] in VALID_TYPES, r["id"]


def test_search_blob_contains_designations():
    m101 = next(r for r in rows() if r["id"] == "m101")
    blob = m101["search"]
    assert "m101" in blob
    assert "ngc 5457" in blob
    assert "pinwheel" in blob
