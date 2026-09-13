"""Library ids across the OpenNGC switch (0.6.26/0.6.27).

A capture keeps the catalogue id it resolved to at INGEST time. The switch from
the hand-curated list to OpenNGC renamed most of them (`m42` -> `ngc1976`), so
`Database.migrate_legacy_object_ids()` rewrites the stored ids once, and
`app/imglib.py` re-resolves anything the map cannot name (an object OpenNGC has
no entry for) from the frame's own OBJECT header/coordinates.
"""

from pathlib import Path

from app import imglib
from app.catalog_data import LEGACY_ID_MAP
from app.database import Database


def _img(**kw):
    d = {"file": "M 42/lights/a.fit", "orig_name": "a.fit", "object_id": None,
         "object_name": "M 42", "otype": None, "ra_hours": 5.588, "dec_deg": -5.391,
         "exposure": 300.0, "date_obs": "2026-08-22T23:00:00", "filter": "L",
         "telescope": "T", "ingested_at": "2026-08-23T00:00:00"}
    d.update(kw)
    return d


def _catalog() -> list[dict]:
    """The shipped catalog, in the shape the DB hands to imglib."""
    import csv
    cols = ("id", "primary_name", "messier", "ngcic", "other", "otype", "ra_hours",
            "dec_deg", "vmag", "size_am", "constellation", "distance", "wiki",
            "blurb", "search")
    csv_path = Path(__file__).resolve().parents[1] / "app" / "data" / "openned.csv"
    out = []
    with open(csv_path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            d = dict(zip(cols, line.rstrip("\n").split(";")))
            for k in ("ra_hours", "dec_deg", "vmag"):
                d[k] = float(d[k]) if d[k] else None
            out.append(d)
    return out


# ----------------------------------------------------------------- the map

def test_legacy_id_map_targets_are_shipped_catalog_ids():
    from app.catalog_data import standard_ids      # noqa: F401  (import cost only)
    ids = {r["id"] for r in _catalog()}
    assert len(LEGACY_ID_MAP) > 100, "the curated 197 owned ~114 renamed ids"
    for old, new in LEGACY_ID_MAP.items():
        assert old != new, old
        assert new in ids, (old, new)
        assert old not in ids, f"{old} is still a catalog id - nothing to migrate"
    # the designations users actually have in their libraries
    assert LEGACY_ID_MAP["m42"] == "ngc1976"
    assert LEGACY_ID_MAP["m31"] == "ngc224"
    assert LEGACY_ID_MAP["lmc"] == "eso56-115"
    # curated-only objects OpenNGC has no entry for stay unmapped on purpose
    for absent in ("abell21", "jones1", "sh2-276"):
        assert absent not in LEGACY_ID_MAP


# ------------------------------------------------------------- the migration

def test_legacy_library_ids_are_migrated_on_open(tmp_path):
    p = tmp_path / "old.db"
    db = Database(p)
    db.add_image(_img(object_id="m42", object_name="M 42"))
    db.add_image(_img(object_id="lmc", object_name="LMC", ra_hours=5.4, dec_deg=-69.8))
    db.add_image(_img(object_id="abell21", object_name="Medusa Nebula",
                      ra_hours=7.49, dec_deg=13.25))
    db.conn.execute(
        "INSERT INTO import_batches(created_at, object_id, object_name, slug, "
        "session, frame, n_files, image_dir) VALUES "
        "('2026-08-23T00:00:00','cr399','Coathanger','Coathanger',"
        "'2026-08-22_2000','lights',2,'X')")
    db.conn.commit()

    fresh = Database(p)                       # an upgrade opens the old database
    ids = {r["object_id"] for r in fresh.images()}
    assert "ngc1976" in ids and "m42" not in ids
    assert "eso56-115" in ids and "lmc" not in ids
    assert "abell21" in ids, "an object OpenNGC has no entry for keeps its id"
    batch = fresh.conn.execute("SELECT object_id FROM import_batches").fetchone()
    assert batch[0] == "cl399"                # the history migrates too
    # the migrated ids resolve in the new catalog
    assert fresh.get_object("ngc1976")["primary_name"] == "Great Orion Nebula"
    assert fresh.get_object("eso56-115")["otype"] == "galaxy"


def test_migration_is_idempotent_and_leaves_custom_targets_alone(tmp_path):
    p = tmp_path / "old.db"
    db = Database(p)
    db.add_image(_img(object_id="m31"))
    cid = db.add_custom({"id": "u_test0001", "primary_name": "My Thing",
                         "ra_hours": 1.0, "dec_deg": 2.0})
    second = Database(p)
    assert second.migrate_legacy_object_ids() == 0, "nothing left to migrate"
    assert {r["object_id"] for r in second.images()} == {"ngc224"}
    assert second.get_object(cid)["primary_name"] == "My Thing"


def test_unmappable_legacy_id_still_displays_through_imglib(tmp_path):
    """The stale id cannot be rewritten (no OpenNGC object), so the DISPLAY path
    has to carry it - group_library re-resolves from the capture itself."""
    imgs = [_img(object_id="abell21", object_name="Medusa Nebula",
                 ra_hours=7.4902, dec_deg=13.2586)]
    groups = imglib.group_library(imgs, _catalog())
    assert len(groups) == 1
    assert groups[0]["name"] != "Unknown object"
    assert groups[0]["otype"] is not None
