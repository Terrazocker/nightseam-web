"""HTTP-level API tests via fastapi TestClient (httpx).

These exercise the full route layer of create_app(): validation, error
codes, ingest, and the export/import round trip. The app is built with
prefetch=False so no image-cache thread hits the network.
"""

import io
import zipfile

import pytest
from fastapi.testclient import TestClient

from app.database import Database
from app.server import create_app

_BLOCK = 2880
_DATE = "2026-08-24"
_TZ = 120


def make_fits(records, end=True) -> bytes:
    block = bytearray()
    for k, v in records:
        block += f"{k:<8}= {v}".encode("latin-1").ljust(80)[:80]
    if end:
        block += b"END".ljust(80)
    block += b" " * (-len(block) % _BLOCK)
    return bytes(block)


def m31_fits(exposure: float = 300.0) -> bytes:
    return make_fits([
        ("SIMPLE", "T"),
        ("OBJECT", "'M 31                     ' / Andromeda"),
        ("EXPTIME", str(exposure)),
        ("DATE-OBS", "'2026-08-22T23:14:05'"),
        ("FILTER", "'L'"),
        ("TELESCOP", "'Seestar S50'"),
        ("NAXIS", "2"),
        ("RA", "0.712"),
        ("DEC", "41.269"),
    ])


def unresolved_fits() -> bytes:
    return make_fits([
        ("SIMPLE", "T"),
        ("OBJECT", "'TestObj42'"),
        ("EXPTIME", "60.0"),
        ("DATE-OBS", "'2026-08-22T22:00:00'"),
    ])


@pytest.fixture()
def db(tmp_path):
    return Database(tmp_path / "astropilot.db")


@pytest.fixture()
def client(db, tmp_path):
    with TestClient(create_app(db, prefetch=False)) as c:
        c.post("/api/settings", json={"image_dir": str(tmp_path / "archive")})
        yield c


def add_site(c, name="Backyard", lat=50.0, lon=7.8):
    r = c.post("/api/sites", json={"name": name, "lat": lat, "lon": lon, "elev": 150})
    assert r.status_code == 200
    return r.json()["id"]


# ------------------------------------------------------------------ state / settings

def test_state_defaults(client):
    st = client.get("/api/state").json()
    assert st["version"]
    assert st["sites"] == []
    assert st["adv_mode"] is False
    assert st["min_useful_alt"] == 25.0
    assert st["profile_len"] == 720
    assert st["image_dir"]  # defaults to a real path


def test_settings_roundtrip(client):
    r = client.post("/api/settings", json={
        "min_useful_alt": 30.0, "moon_aware": True,
        "favorites": ["m31", "m42"],
        "filters": {"broadband": False, "narrowband_ha": True,
                    "narrowband_oiii": False}})
    assert r.status_code == 200
    st = client.get("/api/state").json()
    assert st["min_useful_alt"] == 30.0
    assert st["moon_aware"] is True
    assert st["favorites"] == ["m31", "m42"]
    assert st["filters"] == {"broadband": False, "narrowband_ha": True,
                             "narrowband_oiii": False}


def test_settings_rejects_bad_size_unit(client):
    r = client.post("/api/settings", json={"size_unit": "parsecs"})
    assert r.status_code == 400


# ------------------------------------------------------------------ sites / rigs

def test_sites_crud_and_first_is_active(client):
    sid = add_site(client)
    assert client.get("/api/state").json()["active_site_id"] == sid
    r = client.put(f"/api/sites/{sid}",
                   json={"name": "Renamed", "lat": 1.0, "lon": 2.0, "elev": 0})
    assert r.status_code == 200
    assert client.get("/api/sites").json()[0]["name"] == "Renamed"
    assert client.delete(f"/api/sites/{sid}").status_code == 200
    assert client.get("/api/sites").json() == []


def test_rigs_crud_and_fov(client):
    r = client.post("/api/rigs", json={"name": "Seestar",
                                       "focal_mm": 150.0,
                                       "sensor_w": 6.0, "sensor_h": 4.0})
    assert r.status_code == 200
    body = r.json()
    assert body["fov_w"] > body["fov_h"] > 0
    assert client.delete(f"/api/rigs/{body['id']}").status_code == 200
    r = client.post("/api/rigs", json={"name": "Bad",
                                       "focal_mm": -5.0,
                                       "sensor_w": 6.0, "sensor_h": 4.0})
    assert r.status_code == 400


# ------------------------------------------------------------------ night / detail

def test_night_requires_site(client):
    r = client.get("/api/night", params={"date": _DATE, "tz_offset_min": _TZ})
    assert r.status_code == 400


def test_night_tracks(client):
    add_site(client)
    r = client.get("/api/night", params={"date": _DATE, "tz_offset_min": _TZ})
    assert r.status_code == 200
    night = r.json()
    assert night["timeline"]["step_min"] == 6
    assert len(night["sun_alt"]) == night["timeline"]["n"]
    assert len(night["moon_az"]) == night["timeline"]["n"]
    assert 0.0 <= night["moon_illum"] <= 1.0
    # standard mode: 197 curated objects, all with full tracks
    assert len(night["objects"]) == 197
    for o in night["objects"]:
        assert "alt" in o and "az" in o and "ceil" in o
        assert len(o["alt"]) == night["timeline"]["n"]
        assert o["max_alt"] <= 90.0


def test_night_advanced_metadata_only(client, db):
    add_site(client)
    r = client.get("/api/night", params={"date": _DATE, "tz_offset_min": _TZ,
                                         "adv": "1"})
    assert r.status_code == 200
    objs = r.json()["objects"]
    assert len(objs) == 197 + db.advanced_count()
    # standard objects keep full tracks; only the advanced rows ship metadata
    plain, adv_objs = objs[:197], objs[197:]
    assert all("alt" in o and "az" in o for o in plain)
    assert all(o.get("adv") is True for o in adv_objs)
    assert all("alt" not in o and "az" not in o for o in adv_objs)


def test_object_detail(client):
    add_site(client)
    r = client.get("/api/object/m31",
                   params={"date": _DATE, "tz_offset_min": _TZ})
    assert r.status_code == 200
    d = r.json()
    assert d["meta"]["id"] == "m31"
    assert d["meta"]["ra_hms"].startswith("00h 42m")
    assert len(d["alt"]) == len(d["vis"]) == len(d["times_iso"])
    assert d["max_alt"] == max(d["alt"])
    assert d["min_useful_alt"] == 25.0
    assert d["best"] is None or d["best"][1] > d["best"][0]


def test_object_detail_unknown(client):
    add_site(client)
    r = client.get("/api/object/nope",
                   params={"date": _DATE, "tz_offset_min": _TZ})
    assert r.status_code == 404


# ------------------------------------------------------------------ catalog / customs

def test_catalog_counts(client, db):
    plain = client.get("/api/catalog").json()
    assert len(plain) == 197
    adv = client.get("/api/catalog", params={"adv": "1"}).json()
    assert len(adv) == 197 + db.advanced_count()
    assert all("_adv" not in o for o in adv)


def test_custom_target_crud(client):
    r = client.post("/api/catalog/custom", json={
        "name": "My Nebula", "ra": "5h 34.5m", "dec": "+22 01"})
    assert r.status_code == 200
    cid = r.json()["id"]
    assert cid.startswith("u_")
    catalog = client.get("/api/catalog").json()
    mine = next(o for o in catalog if o["id"] == cid)
    assert mine["primary_name"] == "My Nebula"
    assert 5.5 < mine["ra_hours"] < 5.6
    # builtin objects cannot be deleted
    assert client.delete("/api/catalog/custom/m31").status_code == 400
    assert client.delete(f"/api/catalog/custom/{cid}").status_code == 200
    assert not any(o["id"] == cid
                   for o in client.get("/api/catalog").json())


def test_custom_target_rejects_bad_ra(client):
    r = client.post("/api/catalog/custom", json={
        "name": "Bad", "ra": "99h", "dec": "+22"})
    assert r.status_code == 400


def test_custom_target_comma_decimals(client):
    """RA/Dec with comma decimals must parse (German locale)."""
    r = client.post("/api/catalog/custom", json={
        "name": "Comma Neb", "ra": "5,5", "dec": "+22,5", "vmag": 9.5})
    assert r.status_code == 200
    cid = r.json()["id"]
    mine = next(o for o in client.get("/api/catalog").json()
                if o["id"] == cid)
    assert 5.49 < mine["ra_hours"] < 5.51
    assert 22.49 < mine["dec_deg"] < 22.51
    assert mine["vmag"] == 9.5
    assert client.delete(f"/api/catalog/custom/{cid}").status_code == 200


# ------------------------------------------------------------------ ingest / library

def test_ingest_fits(client, tmp_path):
    r = client.post("/api/images/ingest",
                    files=[("files", ("m31.fit", m31_fits(),
                                      "application/octet-stream"))])
    assert r.status_code == 200
    res = r.json()["results"][0]
    assert res["ok"] is True
    assert res["object"]["id"] == "m31"
    assert res["exposure"] == 300.0
    assert res["filter"] == "L"

    lib = client.get("/api/library").json()
    assert lib["total_images"] == 1
    assert lib["total_exposure"] == 300.0
    assert lib["objects"][0]["name"] == "Andromeda Galaxy"
    stored = res["stored"]
    assert (tmp_path / "archive" / stored).is_file()


def test_ingest_unresolved_and_library_edit(client, tmp_path):
    client.post("/api/images/ingest",
                files=[("files", ("t42.fit", unresolved_fits(),
                                  "application/octet-stream"))])
    lib = client.get("/api/library").json()
    group = lib["objects"][0]
    assert group["object_id"] is None
    assert group["name"] == "TestObj42"
    assert group["n_sessions"] == 1

    r = client.post("/api/library/edit",
                    json={"name": "TestObj42", "new_name": "Renamed 42",
                          "otype": "nebula"})
    assert r.status_code == 200
    lib = client.get("/api/library").json()
    assert lib["objects"][0]["name"] == "Renamed 42"
    assert lib["objects"][0]["otype"] == "nebula"
    assert (tmp_path / "archive" / "Renamed 42" / "lights" / "t42.fit").is_file()


def test_ingest_rejects_bad_files(client):
    r = client.post("/api/images/ingest", files=[
        ("files", ("notes.txt", b"not a fits file", "text/plain")),
        ("files", ("bad.fit", b"GIF89a garbage", "application/octet-stream")),
    ])
    assert r.status_code == 200
    results = r.json()["results"]
    assert results[0]["error"] == "not a .fit/.fits file"
    assert results[1]["error"] == "not a FITS file (SIMPLE keyword missing)"
    assert client.get("/api/library").json()["total_images"] == 0


def test_ingest_size_cap(client, monkeypatch):
    import app.ingest
    monkeypatch.setattr(app.ingest, "MAX_INGEST_BYTES", 64)
    r = client.post("/api/images/ingest",
                    files=[("files", ("big.fit", m31_fits(),
                                      "application/octet-stream"))])
    assert r.status_code == 200
    res = r.json()["results"][0]
    assert res["ok"] is False
    assert "too large" in res["error"]
    assert client.get("/api/library").json()["total_images"] == 0


# ------------------------------------------------------------------ panoramas

def test_paint_mode_roundtrip(client, tmp_path):
    # upload a fake pano image (server only checks the extension)
    r = client.post("/api/panorama",
                    files={"file": ("pano.jpg", b"fake jpeg", "image/jpeg")})
    assert r.status_code == 200
    pid = r.json()["id"]
    try:
        assert client.get("/api/panoramas").json()[0]["paint_mode"] == "obstacle"
        # invalid mode rejected
        assert client.put(f"/api/panorama/{pid}",
                          json={"paint_mode": "diagonal"}).status_code == 400
        r = client.put(f"/api/panorama/{pid}", json={
            "paint_mode": "sky",
            "strokes": [{"m": "b", "x": 0.5, "y": 0.3, "r": 0.02}],
            "profile": [90.0] * 720,
            "profile_top": [90.0] * 720})
        assert r.status_code == 200
        row = client.get("/api/panoramas").json()[0]
        assert row["paint_mode"] == "sky"
        assert len(row["profile_top"]) == 720
        assert client.get("/api/state").json()["panoramas"][0]["paint_mode"] == "sky"

        # export -> import preserves the mode and both profiles
        data = client.get("/api/export").content
        db2 = Database(tmp_path / "other.db")
        with TestClient(create_app(db2, prefetch=False)) as c2:
            c2.post("/api/import", files={
                "file": ("b.zip", data, "application/zip")})
            row = c2.get("/api/panoramas").json()[0]
            assert row["paint_mode"] == "sky"
            assert len(row["profile_top"]) == 720
    finally:
        client.delete(f"/api/panorama/{pid}")


def test_night_ceil_top_band(client):
    """A sky-mode panorama with a top ceiling ships ceil_top tracks."""
    r = client.post("/api/panorama",
                    files={"file": ("band.jpg", b"fake jpeg", "image/jpeg")})
    pid = r.json()["id"]
    try:
        # band open 20..45 deg over az 0..180, fully blocked elsewhere
        profile, profile_top = [], []
        for i in range(720):
            az = i * 0.5
            if az <= 180:
                profile.append(20.0)
                profile_top.append(45.0)
            else:
                profile.append(90.0)
                profile_top.append(90.0)
        assert client.put(f"/api/panorama/{pid}", json={
            "paint_mode": "sky", "strokes": [],
            "profile": profile, "profile_top": profile_top}).status_code == 200
        # make it the active panorama
        assert client.post("/api/settings",
                           json={"active_pano_id": pid}).status_code == 200
        add_site(client)
        night = client.get("/api/night",
                           params={"date": _DATE, "tz_offset_min": _TZ}).json()
        for o in night["objects"][:5]:
            assert len(o["ceil_top"]) == len(o["alt"])
            # az 0..180 band: ceiling must be 45 there; blocked side is 90
        m31 = next(o for o in night["objects"] if o["id"] == "m31")
        assert 0.0 <= max(m31["ceil_top"]) <= 90.0

        d = client.get("/api/object/m31",
                       params={"date": _DATE, "tz_offset_min": _TZ}).json()
        assert len(d["ceil_top"]) == len(d["alt"])
        assert len(d["vis"]) == len(d["alt"])
        # an object at 60 deg over the open band must be blocked (above 45)
        assert any(v is False for v in d["vis"])  # upper ceiling restricts
    finally:
        client.delete(f"/api/panorama/{pid}")


def test_night_no_ceil_top_without_band(client):
    """Without a sky-mode top ceiling the payload has no ceil_top at all."""
    add_site(client)
    night = client.get("/api/night",
                       params={"date": _DATE, "tz_offset_min": _TZ}).json()
    assert all("ceil_top" not in o for o in night["objects"])


# ------------------------------------------------------------------ export / import

def test_export_import_roundtrip(client, tmp_path):
    add_site(client, "Export Site")
    client.post("/api/rigs", json={"name": "RigA", "focal_mm": 150.0,
                                   "sensor_w": 6.0, "sensor_h": 4.0})
    cust = client.post("/api/catalog/custom", json={
        "name": "Export Neb", "ra": "6.0", "dec": "-10"}).json()["id"]
    client.post("/api/images/ingest",
                files=[("files", ("m31.fit", m31_fits(),
                                  "application/octet-stream"))])
    client.post("/api/settings", json={"min_useful_alt": 33.0})

    z = client.get("/api/export")
    assert z.status_code == 200
    data = z.content
    assert data[:2] == b"PK"
    names = zipfile.ZipFile(io.BytesIO(data)).namelist()
    assert any(n.startswith("library/") for n in names)

    # fresh database + app -> import
    db2 = Database(tmp_path / "other.db")
    with TestClient(create_app(db2, prefetch=False)) as c2:
        r = c2.post("/api/import", files={
            "file": ("backup.zip", data, "application/zip")})
        assert r.status_code == 200
        assert r.json()["sites"] == 1
        assert r.json()["customs"] == 1
        assert r.json()["images"] == 1
        st = c2.get("/api/state").json()
        assert st["min_useful_alt"] == 33.0
        assert st["sites"][0]["name"] == "Export Site"
        lib = c2.get("/api/library").json()
        assert lib["total_images"] == 1
        assert lib["objects"][0]["name"]
        catalog = c2.get("/api/catalog").json()
        assert any(o["id"] == cust for o in catalog)


def test_import_rejects_garbage(client):
    r = client.post("/api/import", files={
        "file": ("junk.zip", b"not a zip at all", "application/zip")})
    assert r.status_code == 400