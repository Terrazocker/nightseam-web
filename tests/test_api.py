"""HTTP-level API tests via fastapi TestClient (httpx).

These exercise the full route layer of create_app(): validation, error
codes, ingest, and the export/import round trip. The app is built with
prefetch=False so no image-cache thread hits the network.
"""

import io
import zipfile

import pytest
from fastapi.testclient import TestClient

from app import server as server_mod
from app.database import Database
from app.server import create_app
from _util import make_fits, m31_fits, unresolved_fits

_DATE = "2026-08-24"
_TZ = 120


@pytest.fixture()
def db(tmp_path):
    return Database(tmp_path / "nightseam.db")


@pytest.fixture()
def client(db, tmp_path, monkeypatch):
    # pano uploads/replaces write to data_dir()/"panos" - point that at the tmp
    # dir so a test run can never drop files into the repo's real data/ folder.
    # The real data_dir() creates the panos sub-folder, so mirror that here.
    data = tmp_path / "data"
    (data / "panos").mkdir(parents=True)
    monkeypatch.setattr("app.server.data_dir", lambda: data)
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


def test_timezone_setting_roundtrip(client):
    r = client.post("/api/settings", json={"timezone": "America/Santiago"})
    assert r.status_code == 200
    assert client.get("/api/state").json()["timezone"] == "America/Santiago"
    r = client.post("/api/settings", json={"timezone": ""})
    assert r.status_code == 200
    assert client.get("/api/state").json()["timezone"] == ""


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
    # advanced metadata carries the popularity source popularity score
    scored = [o for o in adv_objs if o.get("popularity")]
    assert scored
    assert all(isinstance(o["popularity"], int) for o in adv_objs)


def test_night_tz_offset_shifts_local_window(client):
    """The tz offset converts the local date to UTC: at a polar site with no
    twilight (midnight sun) the 20:00/04:00 local fallback window must move
    with the offset - the offset-at-date the client sends fixes DST drift."""
    sid = add_site(client, name="Tromso", lat=69.6, lon=18.9)
    p = {"date": "2026-06-21", "site": sid}
    r1 = client.get("/api/night", params={**p, "tz_offset_min": 120}).json()
    r2 = client.get("/api/night", params={**p, "tz_offset_min": 0}).json()
    assert r1["twilight_level"] == "fallback"
    assert r1["tz_offset_min"] == 120
    from datetime import datetime
    d1 = datetime.fromisoformat(r1["dusk"])
    d2 = datetime.fromisoformat(r2["dusk"])
    assert abs((d1 - d2).total_seconds()) == 120 * 60
    assert d1.hour == 18 and d2.hour == 20


def test_polar_day_compute_night_pins_the_fallback_window(db):
    """The polar NULL-dusk path, pinned at the computation layer.

    At 78 N in June the sun never reaches even the civil twilight level, so
    app/planning.night_window() finds no crossing pair at all and substitutes
    the documented 20:00 -> 04:00 local fallback. app/nightcalc.compute_night()
    therefore ships NON-NULL dusk/dawn (not null - the `_iso(dusk) if dusk else
    None` in its payload would render as "--:--" in both UIs) and must still
    produce a usable planning payload: a real grid and object tracks on it.
    """
    from datetime import datetime as _dt

    from app.nightcalc import compute_night
    from app.planning import find_twilight, make_sun_alt_fn, night_window

    # the condition the fallback exists for: no crossing at even the civil
    # level anywhere in the 30 h scan (else this test would silently test
    # nothing and a latitude/date change would go unnoticed)
    win = night_window(2026, 6, 21, 120, 78.22, 15.63)
    assert find_twilight(make_sun_alt_fn(78.22, 15.63), win["t_start"],
                         win["t_end"], -6.0) == (None, None)

    night = compute_night(db, 78.22, 15.63, 50, "2026-06-21", 120, [])
    assert night["twilight_level"] == "fallback"
    assert night["dusk"] is not None and night["dawn"] is not None
    dusk = _dt.fromisoformat(night["dusk"])
    dawn = _dt.fromisoformat(night["dawn"])
    assert (dusk.hour, dusk.minute) == (18, 0)      # 20:00 at UTC+2
    assert dawn > dusk and (dawn - dusk).total_seconds() > 6 * 3600
    n = night["timeline"]["n"]
    assert n > 0 and night["timeline"]["step_min"] == 6
    assert len(night["sun_alt"]) == len(night["moon_alt"]) == n
    assert night["objects"], "a polar night must still plan objects"
    assert all(len(o["alt"]) == n for o in night["objects"])
    # the fallback window is not a silent "whole day" scan
    assert n < 24 * 60 / 6


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
    assert any((tmp_path / "archive" / "Renamed 42").rglob("lights/t42.fit"))


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


def dark_fits() -> bytes:
    return make_fits([
        ("SIMPLE", "T"),
        ("OBJECT", "'M 42'"),
        ("EXPTIME", "0.0"),
        ("IMAGETYP", "'DARK'"),
        ("NAXIS", "2"),
    ])


def m42_light_fits() -> bytes:
    return make_fits([
        ("SIMPLE", "T"),
        ("BITPIX", "16"),
        ("OBJECT", "'M 42'"),
        ("EXPTIME", "300.0"),
        ("IMAGETYP", "'LIGHT'"),
        ("FILTER", "'L'"),
        ("NAXIS", "2"),
        ("NAXIS1", "4"),
        ("NAXIS2", "4"),
    ]) + b"\x00\x10" * 16


def test_ingest_classification_and_rollups(client):
    """IMAGETYP lands in the right subfolder and per-type/filter rollups."""
    r = client.post("/api/images/ingest", files=[
        ("files", ("m42.fit", m42_light_fits(), "application/octet-stream")),
        ("files", ("dark.fit", dark_fits(), "application/octet-stream")),
    ])
    assert r.status_code == 200
    res = r.json()["results"]
    assert res[0]["ok"] and res[0]["imagetyp"] == "light"
    assert "lights" in res[0]["stored"]
    assert res[1]["ok"] and res[1]["imagetyp"] == "dark"
    assert "darks" in res[1]["stored"]
    assert (tmp_archive(client) / res[1]["stored"]).exists()

    lib = client.get("/api/library").json()
    g = lib["objects"][0]
    assert g["types"]["light"]["n"] == 1
    assert g["types"]["dark"]["n"] == 1
    assert g["filters"]["L"]["n"] == 1
    assert g["filters"]["L"]["exposure"] == 300.0
    # preview of the light frame renders a PNG
    img_id = g["images"][0]["id"]
    assert client.get(f"/api/images/{img_id}/preview").content.startswith(b"\x89PNG")


def m31_at(date_obs: str) -> bytes:
    return make_fits([
        ("SIMPLE", "T"),
        ("OBJECT", "'M 31                     ' / Andromeda"),
        ("EXPTIME", "300.0"),
        ("DATE-OBS", f"'{date_obs}'"),
        ("FILTER", "'L'"),
        ("NAXIS", "2"),
        ("RA", "0.712"),
        ("DEC", "41.269"),
    ])


def m31_frame(date_obs: str, imagetyp: str, exposure: float = 60.0) -> bytes:
    return make_fits([
        ("SIMPLE", "T"),
        ("OBJECT", "'M 31                     ' / Andromeda"),
        ("EXPTIME", str(exposure)),
        ("DATE-OBS", f"'{date_obs}'"),
        ("IMAGETYP", f"'{imagetyp}'"),
        ("NAXIS", "2"),
        ("RA", "0.712"),
        ("DEC", "41.269"),
    ])


def test_import_batches_recorded(client):
    """One history entry per (object, session, frame) group, newest first."""
    files = [
        ("f1.fit", m31_at("2026-08-22T20:00:00"), "application/octet-stream"),
        ("f2.fit", m31_at("2026-08-22T21:00:00"), "application/octet-stream"),
        ("d1.fit", m31_frame("2026-08-23T13:00:00", "DARK"),
         "application/octet-stream"),
    ]
    r = client.post("/api/images/ingest",
                    files=[("files", x) for x in files])
    assert r.status_code == 200
    batches = client.get("/api/library/imports").json()
    assert len(batches) == 2
    assert batches[0]["frame"] == "dark" and batches[1]["frame"] == "light"
    assert batches[1]["n_files"] == 2
    assert batches[1]["total_exposure"] == 600.0
    assert batches[1]["slug"] == "Andromeda Galaxy"
    assert batches[1]["session"] == "2026-08-22_2000"
    assert batches[1]["object_id"] == "m31"
    assert batches[1]["image_dir"] == str(tmp_archive(client))


def test_ingest_session_override(client):
    """session=... forces the archive sub-folder for calibration uploads."""
    r = client.post("/api/images/ingest",
                    files=[("files", ("d1.fit", m31_frame(
                        "2026-08-25T10:00:00", "DARK"),
                        "application/octet-stream"))],
                    data={"frame": "dark", "session": "2026-08-22_2000"})
    assert r.status_code == 200
    res = r.json()["results"][0]
    assert res["ok"] and res["imagetyp"] == "dark"
    parts = res["stored"].replace("\\", "/").split("/")
    assert parts[1] == "2026-08-22_2000" and parts[2] == "darks"
    assert (tmp_archive(client) / res["stored"]).is_file()
    b = client.get("/api/library/imports").json()[0]
    assert b["session"] == "2026-08-22_2000"

    # a bogus session name falls back to the automatic session
    r2 = client.post("/api/images/ingest",
                     files=[("files", ("d2.fit", m31_frame(
                         "2026-08-25T10:00:00", "DARK"),
                         "application/octet-stream"))],
                     data={"session": "../escape"})
    res2 = r2.json()["results"][0]
    assert res2["ok"]
    assert ".." not in res2["stored"].replace("\\", "/").split("/")[1]


def test_open_folder(client, monkeypatch):
    opened = []
    monkeypatch.setattr("os.startfile", lambda p: opened.append(str(p)))
    base = tmp_archive(client)
    (base / "M 42" / "2026-08-22_2000").mkdir(parents=True)
    r = client.post("/api/library/open_folder",
                    json={"rel": "M 42/2026-08-22_2000"})
    assert r.status_code == 200
    assert opened and "M 42" in opened[0]
    assert client.post("/api/library/open_folder",
                       json={"rel": "../escape"}).status_code == 400
    assert client.post("/api/library/open_folder",
                       json={"rel": "M 42/nope"}).status_code == 404


def test_ingest_session_folders(client):
    """Frames from different nights land in different session sub-folders;
    frames within 12 h share one session folder."""
    files = [
        ("f1.fit", m31_at("2026-08-22T20:00:00"), "application/octet-stream"),
        ("f2.fit", m31_at("2026-08-23T13:00:00"), "application/octet-stream"),
        ("f3.fit", m31_at("2026-08-22T21:30:00"), "application/octet-stream"),
    ]
    r = client.post("/api/images/ingest",
                    files=[("files", x) for x in files])
    assert r.status_code == 200
    parts = [x["stored"].replace("\\", "/").split("/")
             for x in r.json()["results"]]
    assert all(len(p) == 4 and p[0] == "Andromeda Galaxy" and p[-2] == "lights"
               for p in parts)
    s1, s2, s3 = (p[1] for p in parts)
    assert s1 == s3 and s1 != s2 and s2.endswith("_1300")
    lib = client.get("/api/library").json()
    g = lib["objects"][0]
    assert g["n_sessions"] == 2


def test_library_session_rollups(client):
    """Sessions carry their own per-type/filter rollups (undated here)."""
    client.post("/api/images/ingest", files=[
        ("files", ("m42.fit", m42_light_fits(), "application/octet-stream")),
        ("files", ("dark.fit", dark_fits(), "application/octet-stream")),
    ])
    lib = client.get("/api/library").json()
    s = lib["objects"][0]["sessions"][0]
    assert s["undated"] is True
    assert s["types"]["light"]["n"] == 1
    assert s["types"]["dark"]["n"] == 1
    assert s["filters"]["L"]["n"] == 1


def test_ingest_creates_sibling_folders(client):
    """The first ingest also creates the darks/flats/bias folders beside lights."""
    r = client.post("/api/images/ingest",
                    files=[("files", ("m42.fit", m42_light_fits(),
                                      "application/octet-stream"))])
    assert r.status_code == 200
    stored = r.json()["results"][0]["stored"]
    base = tmp_archive(client) / "/".join(
        stored.replace("\\", "/").split("/")[:2])
    for t in ("lights", "darks", "flats", "bias"):
        assert (base / t).is_dir(), f"missing {base / t}"


def test_ingest_frame_override(client):
    """frame=dark forces the darks folder; a bogus value falls back to IMAGETYP."""
    r = client.post("/api/images/ingest",
                    files=[("files", ("m42.fit", m42_light_fits(),
                                      "application/octet-stream"))],
                    data={"frame": "dark"})
    assert r.status_code == 200
    res = r.json()["results"][0]
    assert res["ok"] and res["imagetyp"] == "dark"
    assert res["stored"].replace("\\", "/").split("/")[-2] == "darks"
    assert (tmp_archive(client) / res["stored"]).is_file()

    r2 = client.post("/api/images/ingest",
                     files=[("files", ("m42b.fit", m42_light_fits(),
                                       "application/octet-stream"))],
                     data={"frame": "bogus"})
    res2 = r2.json()["results"][0]
    assert res2["ok"] and res2["imagetyp"] == "light"
    assert "lights" in res2["stored"]


def test_reindex_adds_disk_files(client):
    """Files placed into the archive on disk (manual copies, restored
    backups) are picked up by the reindex endpoint; the sub-folder forces
    the frame type and a second run skips everything."""
    base = tmp_archive(client)
    (base / "M 42" / "lights").mkdir(parents=True)
    (base / "M 42" / "darks").mkdir(parents=True)
    (base / "M 42" / "lights" / "m42a.fit").write_bytes(m42_light_fits())
    # header says LIGHT, but the darks folder wins for reindex
    (base / "M 42" / "darks" / "d1.fit").write_bytes(m42_light_fits())

    r = client.post("/api/library/reindex")
    assert r.status_code == 200
    res = r.json()
    assert res["found"] == 2 and res["added"] == 2
    lib = client.get("/api/library").json()
    assert lib["total_images"] == 2
    imgs = [i for g in lib["objects"] for i in g["images"]]
    by_typ = {i["imagetyp"]: i for i in imgs}
    assert by_typ["light"]["file"].replace("\\", "/") == "M 42/lights/m42a.fit"
    assert by_typ["dark"]["file"].replace("\\", "/") == "M 42/darks/d1.fit"
    assert by_typ["light"]["object_id"] == "m42"

    r2 = client.post("/api/library/reindex").json()
    assert r2["found"] == 2 and r2["added"] == 0 and r2["skipped"] == 2


def test_reindex_empty_archive(client):
    r = client.post("/api/library/reindex")
    assert r.status_code == 200
    assert r.json() == {"found": 0, "added": 0, "skipped": 0, "failed": 0}


def test_ingest_run_id_merges_batches(client):
    """Chunked uploads of one import action (same run_id) merge into a
    single history entry; a different run stays separate."""
    f1 = [("files", ("f1.fit", m31_at("2026-08-22T20:00:00"),
                     "application/octet-stream")),
          ("files", ("f2.fit", m31_at("2026-08-22T21:00:00"),
                     "application/octet-stream"))]
    f2 = [("files", ("f3.fit", m31_at("2026-08-22T22:00:00"),
                     "application/octet-stream"))]
    r1 = client.post("/api/images/ingest", files=f1,
                     data={"run_id": "run-aaaa-0001"})
    r2 = client.post("/api/images/ingest", files=f2,
                     data={"run_id": "run-aaaa-0001"})
    assert r1.status_code == 200 and r2.status_code == 200
    batches = client.get("/api/library/imports").json()
    assert len(batches) == 1
    assert batches[0]["n_files"] == 3
    assert batches[0]["total_exposure"] == 900.0

    client.post("/api/images/ingest", files=f1,
                data={"run_id": "run-bbbb-0002"})
    batches = client.get("/api/library/imports").json()
    assert len(batches) == 2
    assert batches[0]["n_files"] == 2


def tmp_archive(client) -> Path:
    import json as _json
    from pathlib import Path as _Path
    st = client.get("/api/state").json()
    return _Path(st["image_dir"])


def test_preview_endpoint(client):
    client.post("/api/images/ingest",
                files=[("files", ("m31.fit", m31_fits(),
                                  "application/octet-stream"))])
    lib = client.get("/api/library").json()
    img_id = lib["objects"][0]["images"][0]["id"]
    r = client.get(f"/api/images/{img_id}/preview")
    assert r.status_code == 404            # m31_fits has no image data
    client.post("/api/images/ingest",
                files=[("files", ("m42.fit", m42_light_fits(),
                                  "application/octet-stream"))])
    lib = client.get("/api/library").json()
    m42 = next(o for o in lib["objects"] if o["object_id"] == "m42")
    img_id = m42["images"][0]["id"]
    r = client.get(f"/api/images/{img_id}/preview")
    assert r.status_code == 200
    assert r.content.startswith(b"\x89PNG")
    r = client.get("/api/images/999999/preview")
    assert r.status_code == 404


# ------------------------------------------------- stored-path trust (C2)

def _crafted_pano(db, pid: str, file_value: str):
    """Simulate a database that holds an unsafe path - exactly what a crafted
    setup ZIP used to plant before import validation existed."""
    db.conn.execute("INSERT INTO panoramas(id,name,file) VALUES(?,?,?)",
                    (pid, "crafted", file_value))
    db.conn.commit()


def _crafted_image(db, file_value: str):
    cur = db.conn.execute(
        "INSERT INTO images(file,orig_name,object_name,ingested_at) "
        "VALUES(?,?,?,?)", (file_value, "x.fit", "X", "2026-08-24T00:00:00"))
    db.conn.commit()
    return cur.lastrowid


@pytest.mark.parametrize("evil", [
    "../secret.jpg",
    "..\\secret.jpg",                 # Windows separator
    "/etc/passwd",
    "C:/Windows/win.ini",
])
def test_pano_image_never_leaves_the_pano_folder(client, db, tmp_path, evil):
    """Regression: a stored `file` value was joined onto data/panos raw, so a
    crafted import turned this route into an arbitrary-file-read primitive."""
    secret = tmp_path / "secret.jpg"
    secret.write_bytes(b"TOP-SECRET-OUTSIDE-PANOS")
    _crafted_pano(db, "evilpano", evil)

    r = client.get("/api/panorama/evilpano/image")
    assert r.status_code == 404
    assert b"TOP-SECRET" not in r.content


def test_pano_image_still_serves_a_legitimate_file(client, db, tmp_path):
    payload = b"a-real-panorama"
    (tmp_path / "data" / "panos" / "goodpano.jpg").write_bytes(payload)
    db.add_panorama("goodpano", "mine", "goodpano.jpg")
    db.update_panorama("goodpano", active=False)

    r = client.get("/api/panorama/goodpano/image")
    assert r.status_code == 200
    assert r.content == payload
    # the self-heal fallback (db names a variant that is gone) still works
    db.update_panorama("goodpano", file="goodpano.png")
    r = client.get("/api/panorama/goodpano/image")
    assert r.status_code == 200 and r.content == payload


def test_pano_delete_cannot_remove_a_file_outside_the_pano_folder(client, db, tmp_path):
    victim = tmp_path / "victim.jpg"
    victim.write_bytes(b"keep me")
    _crafted_pano(db, "evilpano", "../victim.jpg")

    assert client.delete("/api/panorama/evilpano").status_code == 200
    assert victim.exists(), "a stored path escaped the panorama folder on delete"
    assert db.get_panorama("evilpano") is None


def test_pano_replace_cannot_unlink_a_file_outside_the_pano_folder(client, db, tmp_path):
    victim = tmp_path / "victim.jpg"
    victim.write_bytes(b"keep me")
    _crafted_pano(db, "evilpano", "../victim.jpg")

    r = client.post("/api/panorama/evilpano/image",
                    files={"file": ("new.jpg", b"new pano", "image/jpeg")})
    assert r.status_code == 200
    assert victim.exists(), "the replace path unlinked a file it does not own"


def test_image_preview_never_leaves_the_archive(client, db, tmp_path):
    secret = tmp_path / "secret.fit"
    secret.write_bytes(m42_light_fits())
    img_id = _crafted_image(db, "../secret.fit")

    assert client.get(f"/api/images/{img_id}/preview").status_code == 404


@pytest.mark.parametrize("evil_id,url_pid,refused", [
    ("..\\evil", "..%5Cevil", {404}),      # decoded backslash; route matches
    (".\\evil", ".%5Cevil", {404}),        # '.' + '\' -> temp name escapes
    ("C:evil", "C%3Aevil", {404}),
    ("evil\x00", "evil%00", {404}),
    # the router does not turn %2F into a separator, so these never reach a
    # handler at all (405 for POST, 404 for the GET route) - equally safe
    ("../evil", "..%2Fevil", {404, 405}),
    ("sub/../../evil", "sub%2F..%2F..%2Fevil", {404, 405}),
])
def test_pano_routes_refuse_ids_that_could_act_as_paths(client, db, tmp_path,
                                                        evil_id, url_pid,
                                                        refused):
    """Regression (found in post-remediation review): the crop/replace route
    builds `f"{pid}.{ext}"` and writes it under data/panos, so an id planted by
    a crafted setup ZIP reached the filesystem - `..\\evil` made the server try
    to open data/panos/...\\evil.<hex>.upload.tmp (HTTP 500) and `.\\evil` wrote
    a temp file into data/ itself. Ids that are not plain tokens must be
    refused on every pid route, before anything path-like is built."""
    db.conn.execute("INSERT INTO panoramas(id,name,file,active) VALUES(?,?,?,?)",
                    (evil_id, "crafted", "legit.jpg", 0))
    db.conn.commit()
    (tmp_path / "data" / "panos" / "legit.jpg").write_bytes(b"ORIGINAL")

    r = client.post(f"/api/panorama/{url_pid}/image",
                    files={"file": ("new.jpg", b"ATTACKER-BYTES", "image/jpeg")})
    assert r.status_code in refused, (evil_id, r.status_code, r.text[:200])
    assert client.get(f"/api/panorama/{url_pid}/image").status_code in refused
    assert client.put(f"/api/panorama/{url_pid}",
                      json={"paint_mode": "sky"}).status_code in refused
    # deleting stays idempotent (200) when the route matches, and never touches
    # anything outside panos either way
    assert client.delete(f"/api/panorama/{url_pid}").status_code in (200, 405)

    # nothing was created next to the panorama folder, and the original file
    # (and the legitimate picture) is untouched
    assert sorted(p.name for p in (tmp_path / "data").iterdir()) == ["panos"]
    assert (tmp_path / "data" / "panos" / "legit.jpg").read_bytes() == b"ORIGINAL"
    assert not list((tmp_path / "data" / "panos").glob("*.tmp"))


def test_pano_replace_still_works_for_a_normal_id(client, db, tmp_path):
    """The guard must not break the crop tool's normal flow."""
    pid = client.post("/api/panorama",
                      files={"file": ("p.jpg", b"first", "image/jpeg")}).json()["id"]
    r = client.post(f"/api/panorama/{pid}/image",
                    files={"file": ("p2.jpg", b"SECOND", "image/jpeg")})
    assert r.status_code == 200
    assert (tmp_path / "data" / "panos" / f"{pid}.jpg").read_bytes() == b"SECOND"
    assert client.get(f"/api/panorama/{pid}/image").content == b"SECOND"


def test_image_preview_still_serves_an_archived_frame(client, db, tmp_path):
    """The safe path is unchanged: a normal ingest + preview still works."""
    client.post("/api/images/ingest",
                files=[("files", ("m42.fit", m42_light_fits(),
                                  "application/octet-stream"))])
    lib = client.get("/api/library").json()
    m42 = next(o for o in lib["objects"] if o["object_id"] == "m42")
    img_id = m42["images"][0]["id"]
    r = client.get(f"/api/images/{img_id}/preview")
    assert r.status_code == 200 and r.content.startswith(b"\x89PNG")


# ------------------------------------------------------------------ bortle

def test_bortle_setting_and_min_alt_default(client):
    client.post("/api/settings", json={"bortle": 8})
    st = client.get("/api/state").json()
    assert st["bortle"] == 8
    assert st["min_useful_alt"] == 17 + 16     # default follows bortle
    client.post("/api/settings", json={"bortle": 1})
    assert client.get("/api/state").json()["min_useful_alt"] == 19.0
    # an explicit min alt wins over the bortle default
    client.post("/api/settings", json={"min_useful_alt": 30.0})
    assert client.get("/api/state").json()["min_useful_alt"] == 30.0
    # out-of-range values are clamped
    client.post("/api/settings", json={"bortle": 42})
    assert client.get("/api/state").json()["bortle"] == 9


def test_state_min_alt_explicit_flag(client):
    """E5: /api/state must tell the desktop client whether the min altitude is
    an EXPLICIT value or the Bortle-derived default - the client re-derives the
    default live on Bortle changes and must not treat the resolved number as an
    explicit choice (the flag used to not exist)."""
    assert client.get("/api/state").json()["min_useful_alt_explicit"] is False
    client.post("/api/settings", json={"min_useful_alt": 30.0})
    st = client.get("/api/state").json()
    assert st["min_useful_alt_explicit"] is True
    assert st["min_useful_alt"] == 30.0
    client.post("/api/settings", json={"bortle": 1})
    st = client.get("/api/state").json()
    assert st["min_useful_alt_explicit"] is True     # explicit still wins
    assert st["min_useful_alt"] == 30.0


def test_object_detail_defaults_to_bortle_min_alt(client):
    """E5: the detail endpoint's implicit min-alt default must be the same
    17 + 2*bortle rule as /api/state (it used to fall back to a hard 25.0, so
    a Bortle-7 site planned the detail view at 25 deg instead of 31)."""
    add_site(client)
    client.post("/api/settings", json={"bortle": 7})
    d = client.get("/api/object/m31",
                   params={"date": _DATE, "tz_offset_min": _TZ}).json()
    assert d["min_useful_alt"] == 31.0
    client.post("/api/settings", json={"bortle": 1})
    d = client.get("/api/object/m31",
                   params={"date": _DATE, "tz_offset_min": _TZ}).json()
    assert d["min_useful_alt"] == 19.0
    # an explicit min alt wins over the bortle default
    client.post("/api/settings", json={"min_useful_alt": 30.0, "bortle": 7})
    d = client.get("/api/object/m31",
                   params={"date": _DATE, "tz_offset_min": _TZ}).json()
    assert d["min_useful_alt"] == 30.0


# ------------------------------------------------------------------ library export

def test_library_export(client):
    client.post("/api/images/ingest",
                files=[("files", ("m31.fit", m31_fits(),
                                  "application/octet-stream"))])
    r = client.get("/api/library/export?format=csv")
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert b"m31" in r.content.lower() or b"m 31" in r.content
    r = client.get("/api/library/export?format=json")
    assert r.status_code == 200
    j = r.json()
    assert j["total_images"] == 1
    assert j["objects"][0]["images"][0]["imagetyp"] == "light"
    assert client.get("/api/library/export?format=xlsx").status_code == 400


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
        # give the second database its own archive: without this the import
        # restored into the DEFAULT folder (~/Documents/NightSeam Images)
        db2.set_setting("image_dir", str(tmp_path / "archive2"))
        with TestClient(create_app(db2, prefetch=False)) as c2:
            c2.post("/api/import", files={
                "file": ("b.zip", data, "application/zip")})
            row = c2.get("/api/panoramas").json()[0]
            assert row["paint_mode"] == "sky"
            assert len(row["profile_top"]) == 720
    finally:
        client.delete(f"/api/panorama/{pid}")


def test_panorama_activate_deactivate(client):
    """active:true makes a pano the active one; active:false clears it."""
    r = client.post("/api/panorama",
                    files={"file": ("pano.jpg", b"fake jpeg", "image/jpeg")})
    assert r.status_code == 200
    pid = r.json()["id"]
    try:
        # activate via the PUT endpoint
        assert client.put(f"/api/panorama/{pid}",
                          json={"active": True}).status_code == 200
        assert client.get("/api/state").json()["active_pano_id"] == pid
        # explicit False deactivates (clears the global pointer)
        assert client.put(f"/api/panorama/{pid}",
                          json={"active": False}).status_code == 200
        assert client.get("/api/state").json()["active_pano_id"] is None
        # an update that doesn't mention active leaves the pointer alone
        other = client.post("/api/panorama",
                            files={"file": ("p2.jpg", b"x", "image/jpeg")}).json()["id"]
        try:
            assert client.put(f"/api/panorama/{other}",
                              json={"active": True}).status_code == 200
            assert client.put(f"/api/panorama/{other}",
                              json={"az_offset": 5.0}).status_code == 200
            assert client.get("/api/state").json()["active_pano_id"] == other
        finally:
            client.delete(f"/api/panorama/{other}")
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
    # own archive: the default would be the developer's real Documents folder
    db2.set_setting("image_dir", str(tmp_path / "archive2"))
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


# -------------------------------------------------- request guard (middleware)
# The guard is what stops any website the user visits from reaching this local
# API (a no-cors request to 127.0.0.1 is not blocked by CORS). It covers EVERY
# route, so it is exercised here on a harmless GET and on a state-changing POST.

def test_cross_site_requests_are_rejected(client):
    assert client.get("/api/state").status_code == 200

    r = client.get("/api/state", headers={"Sec-Fetch-Site": "cross-site"})
    assert r.status_code == 403 and "cross-site" in r.json()["detail"]

    r = client.post("/api/settings", json={"min_useful_alt": 42.0},
                    headers={"Sec-Fetch-Site": "cross-site"})
    assert r.status_code == 403
    # ... and the rejected request really did not change anything
    assert client.get("/api/state").json()["min_useful_alt"] != 42.0

    r = client.get("/api/state", headers={"Origin": "http://evil.example"})
    assert r.status_code == 403

    # same-origin and non-browser callers (no headers) stay allowed
    assert client.get("/api/state",
                      headers={"Sec-Fetch-Site": "same-origin"}).status_code == 200
    assert client.get("/api/state",
                      headers={"Origin": "http://testserver"}).status_code == 200


def test_foreign_host_header_is_rejected(client):
    r = client.get("/api/state", headers={"Host": "evil.example"})
    assert r.status_code == 403 and r.json()["detail"] == "forbidden host"


# ------------------------------------------------------------- upload limits
# The per-file cap inside ingest can only run once Starlette has spooled the
# whole body, so the middleware rejects an oversized request from its declared
# length first. The limits are module constants so the mechanism is testable
# without sending gigabytes.

def test_oversized_request_body_is_rejected_before_parsing(client, monkeypatch):
    """A 413 + "too large" alone does not say WHERE the request died: the
    route's own per-file cap (60 MB, inside the handler) produces a similar
    body. This proves the rejection happened BEFORE the handler: the streaming
    drain the route calls is replaced by a recorder, the declared request cap is
    set to 3 MB, and the reply must be the middleware's REQUEST-cap wording
    ("... per request", which the per-file cap never emits) with no recorded
    call and no panorama row."""
    cap = 3 * 1024 * 1024
    calls = []

    async def _record(*args, **kwargs):
        calls.append((args, kwargs))

    with monkeypatch.context() as m:
        m.setitem(server_mod._MAX_REQUEST_BYTES, "/api/panorama", cap)
        m.setattr(server_mod, "_drain_upload", _record)
        r = client.post("/api/panorama",
                        files={"file": ("big.jpg", b"x" * (cap + 1),
                                        "image/jpeg")})
    assert r.status_code == 413, r.text
    # distinct from the per-file message: f"Image too large (max 60 MB)"
    assert r.json()["detail"] == "upload too large (max 3 MB per request)"
    assert calls == [], "the handler ran despite the oversized request"
    assert client.get("/api/panoramas").json() == [], "a panorama was stored"

    # a request under the cap still goes through the real handler
    r = client.post("/api/panorama",
                    files={"file": ("ok.jpg", b"x" * 64, "image/jpeg")})
    assert r.status_code == 200
    client.delete(f"/api/panorama/{r.json()['id']}")


def test_too_many_files_in_one_ingest_request(client, monkeypatch):
    monkeypatch.setattr("app.server.MAX_FILES_PER_REQUEST", 2)
    files = [("files", (f"m{i}.fit", m31_fits(), "application/octet-stream"))
             for i in range(3)]
    r = client.post("/api/images/ingest", files=files)
    assert r.status_code == 400
    assert "too many files" in r.json()["detail"]
    monkeypatch.setattr("app.server.MAX_FILES_PER_REQUEST", 8)
    r = client.post("/api/images/ingest", files=files[:2])
    assert r.status_code == 200


# --------------------------------------------------- panorama profile shapes

def test_panorama_profile_length_and_types_are_validated(client):
    pid = client.post("/api/panorama",
                      files={"file": ("p.jpg", b"fake jpeg", "image/jpeg")}
                      ).json()["id"]
    try:
        # a short profile used to be stored and then failed OPEN at read time
        assert client.put(f"/api/panorama/{pid}",
                          json={"profile": [10.0] * 719}).status_code == 400
        assert client.put(f"/api/panorama/{pid}",
                          json={"profile_top": [10.0] * 721}).status_code == 400
        # non-numeric values used to make /api/night return 500 forever
        assert client.put(f"/api/panorama/{pid}",
                          json={"profile": ["x"] * 720}).status_code == 400
        assert client.put(f"/api/panorama/{pid}",
                          json={"profile": [True] * 720}).status_code == 400
        # empty (clear) and exactly 720 finite numbers are fine
        assert client.put(f"/api/panorama/{pid}",
                          json={"profile": [], "profile_top": []}).status_code == 200
        assert client.put(f"/api/panorama/{pid}",
                          json={"profile": [12.5] * 720}).status_code == 200
        assert client.post("/api/settings",
                           json={"active_pano_id": pid}).status_code == 200
        add_site(client)
        assert client.get("/api/night", params={
            "date": _DATE, "tz_offset_min": _TZ}).status_code == 200
    finally:
        client.delete(f"/api/panorama/{pid}")


# ------------------------------------------------------------- site validation

def test_site_coordinates_are_validated(client):
    for body in ({"name": "x", "lat": 999, "lon": 0},
                 {"name": "x", "lat": 0, "lon": 200},
                 {"name": "x", "lat": 0, "lon": 0, "elev": 99999}):
        r = client.post("/api/sites", json=body)
        assert r.status_code == 400, body
    assert client.get("/api/sites").json() == []
    sid = add_site(client)
    assert client.put(f"/api/sites/{sid}",
                      json={"name": "x", "lat": 91, "lon": 0}).status_code == 400


def test_deleting_the_active_site_keeps_planning_usable(client):
    """Regression: the active pointer dangled, so /api/night answered 400 with
    no way back through the UI."""
    first = add_site(client, "First")
    second = add_site(client, "Second")
    assert client.get("/api/state").json()["active_site_id"] == first

    client.post("/api/settings", json={"active_site_id": second})
    assert client.delete(f"/api/sites/{second}").status_code == 200
    st = client.get("/api/state").json()
    assert st["active_site_id"] == first
    assert client.get("/api/night", params={
        "date": _DATE, "tz_offset_min": _TZ}).status_code == 200

    # deleting every site clears the pointer (and planning reports it clearly)
    assert client.delete(f"/api/sites/{first}").status_code == 200
    assert client.get("/api/state").json()["active_site_id"] is None
    r = client.get("/api/night", params={"date": _DATE, "tz_offset_min": _TZ})
    assert r.status_code == 400
    # ... and adding a new site repairs it without touching the files
    again = add_site(client, "Again")
    assert client.get("/api/state").json()["active_site_id"] == again
    assert client.get("/api/night", params={
        "date": _DATE, "tz_offset_min": _TZ}).status_code == 200


# ------------------------------------------------------------ UI cache policy

def test_ui_assets_are_never_cached(client):
    """A stale themes.css/style.css next to a fresh index.html breaks the UI -
    themes.css was missing from the no-store list."""
    for path in ("/", "/index.html", "/style.css", "/themes.css",
                 "/favicon.ico", "/js/util.js"):
        r = client.get(path)
        assert r.status_code == 200, path
        assert r.headers.get("cache-control") == "no-store", path