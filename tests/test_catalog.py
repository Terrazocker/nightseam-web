"""Sanity checks on the embedded DSO catalog."""

from app.catalog_data import POPULARITY, rows, TYPE_LABELS

VALID_TYPES = set(TYPE_LABELS.keys())


def test_popularity_dict_scores():
    # 193 of the 197 curated objects matched against the popularity source
    assert len(POPULARITY) == 193
    # spot-check the formerly-missing matches (apostrophe / CL / other-field)
    assert POPULARITY.get("ngc7317") == 8820       # Stephan's Quintet
    assert POPULARITY.get("lmc") == 7940           # via PGC 17223
    assert POPULARITY.get("cr399") == 4010         # CL COLLINDER 399
    assert POPULARITY.get("mel111") == 3490        # CL MELOTTE 111
    # everything in POPULARITY must reference a real catalog id
    ids = {r["id"] for r in rows()}
    assert set(POPULARITY) <= ids


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
