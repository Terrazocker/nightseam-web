"""Tests for library logic: object resolution, grouping, sessions."""

from app import imglib
from app.catalog_data import rows

CATALOG = rows()


def img(**kw):
    d = {"file": "x.fit", "orig_name": "x.fit", "object_id": None,
         "object_name": "Unknown", "ra_hours": None, "dec_deg": None,
         "exposure": 300.0, "date_obs": None, "filter": None,
         "telescope": None, "ingested_at": "2026-08-22T00:00:00"}
    d.update(kw)
    return d


# ---------------------------------------------------------------- resolution

def test_resolve_by_messier_designation():
    r = imglib.resolve_object(CATALOG, "M31_300s_L_001")
    assert r and r["id"] == "m31"
    assert r["primary_name"] == "Andromeda Galaxy"


def test_resolve_by_ngc_designation():
    assert imglib.resolve_object(CATALOG, "NGC 7000_Ha_120s")["id"] == "ngc7000"
    assert imglib.resolve_object(CATALOG, "NGC7000_Ha_120s")["id"] == "ngc7000"


def test_resolve_by_common_name():
    assert imglib.resolve_object(CATALOG, "Pinwheel Galaxy")["id"] == "m101"
    assert imglib.resolve_object(CATALOG, "Andromeda_180s")["id"] == "m31"


def test_resolve_by_coordinates():
    # near M31 (RA 0.712h, Dec +41.27)
    r = imglib.resolve_object(CATALOG, "some_star_field", 0.70, 41.2)
    assert r and r["id"] == "m31"
    # far away -> no match
    assert imglib.resolve_object(CATALOG, "some_star_field", 12.0, 0.0) is None


def test_resolve_unmatched_returns_none():
    assert imglib.resolve_object(CATALOG, "My Secret Object") is None
    assert imglib.resolve_object([], "M31") is None


# ---------------------------------------------------------------- sessions

def test_sessions_merge_across_midnight():
    imgs = [
        img(date_obs="2026-08-22T23:00:00", exposure=300),
        img(date_obs="2026-08-23T01:00:00", exposure=300),   # 2 h later
    ]
    s = imglib.compute_sessions(imgs)
    assert len(s) == 1
    assert s[0]["n_images"] == 2
    assert s[0]["exposure"] == 600.0


def test_sessions_split_on_long_gap():
    imgs = [
        img(date_obs="2026-08-22T23:00:00"),
        img(date_obs="2026-08-25T22:00:00"),                 # 3 nights later
    ]
    s = imglib.compute_sessions(imgs)
    assert len(s) == 2
    assert [x["n_images"] for x in s] == [1, 1]


def test_undated_frames_one_session():
    imgs = [img(date_obs=None), img(date_obs=None)]
    s = imglib.compute_sessions(imgs)
    assert len(s) == 1
    assert s[0].get("undated") is True
    assert s[0]["n_images"] == 2


# ---------------------------------------------------------------- grouping

def test_group_library_totals_and_designation():
    imgs = [
        img(object_id="m31", object_name="M31", date_obs="2026-08-22T23:00:00",
            exposure=300, ra_hours=0.7, dec_deg=41.2),
        img(object_id="m31", object_name="M31", date_obs="2026-08-23T01:00:00",
            exposure=300),
        img(object_id="ngc7000", object_name="NGC 7000",
            date_obs="2026-08-24T22:00:00", exposure=120),
    ]
    objs = imglib.group_library(imgs, CATALOG)
    assert len(objs) == 2
    m31 = next(o for o in objs if o["object_id"] == "m31")
    assert m31["name"] == "Andromeda Galaxy"
    assert m31["designation"] == "M31"
    assert m31["otype"] == "galaxy"
    assert m31["size_am"] == "190x60"
    assert m31["n_images"] == 2
    assert m31["total_exposure"] == 600.0
    assert m31["n_sessions"] == 1
    assert m31["first"] == "2026-08-22T23:00:00"
    assert m31["last"] == "2026-08-23T01:00:00"
    n7000 = next(o for o in objs if o["object_id"] == "ngc7000")
    assert n7000["designation"] == "NGC 7000"


def test_group_library_unresolved_keeps_name_and_coords():
    imgs = [img(object_id=None, object_name="My Secret Nebula",
                ra_hours=12.5, dec_deg=-30.0)]
    objs = imglib.group_library(imgs, CATALOG)
    assert len(objs) == 1
    o = objs[0]
    assert o["object_id"] is None
    assert o["name"] == "My Secret Nebula"
    assert o["designation"] == ""
    assert o["otype"] is None
    assert o["ra_hours"] == 12.5
    assert o["dec_deg"] == -30.0


def test_group_library_unresolved_user_type():
    imgs = [img(object_id=None, object_name="My Thing", otype="nebula")]
    objs = imglib.group_library(imgs, CATALOG)
    assert objs[0]["otype"] == "nebula"


def test_rename_images_updates_rows_and_paths(tmp_path):
    from app.database import Database
    db = Database(tmp_path / "t.db")
    db.add_image({
        "file": "My Secret/lights/a.fit", "orig_name": "a.fit",
        "object_id": None, "object_name": "My Secret",
        "ra_hours": 5.0, "dec_deg": -20.0, "exposure": 240.0,
        "date_obs": None, "filter": None, "telescope": None,
        "ingested_at": "2026-08-26T00:10:00",
    })
    db.rename_images("My Secret", "New Name", "nebula", "New Name")
    imgs = db.images()
    assert len(imgs) == 1
    assert imgs[0]["object_name"] == "New Name"
    assert imgs[0]["otype"] == "nebula"
    assert imgs[0]["file"] == "New Name/lights/a.fit"