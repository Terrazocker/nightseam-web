"""Tests for setup export / import (app/backup.py).

All file I/O is isolated: `app.backup.data_dir` is monkeypatched onto a
tmp dir and each Database lives in its own tmp dir, so nothing touches the
repo's real `data/`.
"""

import io
import json
import math
import zipfile

import pytest

from app.backup import _safe_join, apply_import_zip, build_export_zip
from app.database import Database


@pytest.fixture()
def db(tmp_path, monkeypatch):
    d = Database(tmp_path / "nightseam.db")
    d.set_setting("image_dir", str(tmp_path / "archive"))
    monkeypatch.setattr("app.backup.data_dir", lambda: tmp_path / "data")
    return d


def _seed(db, tmp_path):
    """A site, a rig, a custom target, a pano and one library image (with
    matching files on disk)."""
    db.add_site("Home", 50.0, 7.8, 150)
    db.add_rig("RigA", 150.0, 6.0, 4.0, 2.3, 1.5)
    cust = db.add_custom({
        "id": "u_seed1", "primary_name": "Export Neb", "otype": "galaxy",
        "ra_hours": 6.0, "dec_deg": -10.0, "vmag": 9.5,
        "size_am": "12x8", "constellation": "Monoceros"})
    pdir = tmp_path / "data" / "panos"
    pdir.mkdir(parents=True, exist_ok=True)
    (pdir / "pano1.jpg").write_bytes(b"JPEGDATA")
    db.add_panorama("p1", "Backyard pano", "pano1.jpg")
    arch = tmp_path / "archive"
    f = arch / "M 31" / "2026-08-22_2314" / "lights" / "m31.fit"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_bytes(b"FITSDATA")
    db.add_image({
        "file": str(f.relative_to(arch)), "orig_name": "m31.fit",
        "object_id": None, "object_name": "M 31", "ra_hours": 0.712,
        "dec_deg": 41.269, "exposure": 300.0, "date_obs": "2026-08-22T23:14:05",
        "filter": "L", "telescope": "Seestar S50", "imagetyp": "light",
        "ingested_at": "2026-08-22T23:20:00"})
    return cust


def test_safe_join_refuses_escape(tmp_path):
    root = tmp_path / "root"
    root.mkdir()
    assert _safe_join(root, "ok/sub/file.jpg") is not None
    assert _safe_join(root, "../evil.jpg") is None
    assert _safe_join(root, "a/../../evil.jpg") is None


def test_export_import_roundtrip(db, tmp_path):
    _seed(db, tmp_path)
    blob = build_export_zip(db)
    assert blob[:2] == b"PK"

    db2 = Database(tmp_path / "other.db")
    db2.set_setting("image_dir", str(tmp_path / "archive"))
    summary = apply_import_zip(db2, blob)
    assert summary["sites"] == 1
    assert summary["rigs"] == 1
    assert summary["customs"] == 1
    assert summary["panoramas"] == 1
    assert summary["images"] == 1
    assert summary["auto_backup"]  # safety copy written

    sites = db2.sites()
    assert [s["name"] for s in sites] == ["Home"]
    assert [r["name"] for r in db2.rigs()] == ["RigA"]
    custs = db2.customs()
    assert custs[0]["primary_name"] == "Export Neb"
    assert db2.panoramas()[0]["file"] == "pano1.jpg"
    imgs = db2.images()
    assert imgs[0]["object_name"] == "M 31"

    # files restored into the pano dir and the (imported) image dir
    new_pano = tmp_path / "data" / "panos" / "pano1.jpg"
    assert new_pano.read_bytes() == b"JPEGDATA"
    new_img = tmp_path / "archive" / "M 31" / "2026-08-22_2314" / "lights" / "m31.fit"
    assert new_img.read_bytes() == b"FITSDATA"


def test_view_full_day_preference_roundtrips(db, tmp_path):
    """ITEM 1 (0.6.13): view_full_day is one shared preference - the desktop
    stores it in the settings table, so it must survive an export/import like
    every other pref (the web twin rides in backup.prefs)."""
    db.set_setting("view_full_day", True)
    blob = build_export_zip(db)
    db2 = Database(tmp_path / "other.db")
    db2.set_setting("image_dir", str(tmp_path / "archive"))
    apply_import_zip(db2, blob)
    assert db2.setting("view_full_day", False) is True


def test_import_of_the_retired_planning_flag_stays_safe(db, tmp_path):
    """Phase C retired `planning_client_compute`, but backups written by
    0.6.18/0.6.19 carry it in their settings map. Import passes settings
    through opaquely, so such a bundle must restore without error and the dead
    key must simply sit inert in the table (it is never read again)."""
    db.set_setting("planning_client_compute", False)
    blob = build_export_zip(db)
    db2 = Database(tmp_path / "other.db")
    db2.set_setting("image_dir", str(tmp_path / "archive"))
    summary = apply_import_zip(db2, blob)          # must not raise
    assert summary["auto_backup"]
    assert db2.setting("planning_client_compute", "unset") is False


def test_import_clears_stale_import_history(db, tmp_path):
    """The 'Recent imports' history describes the library the restore replaces,
    so a restore must clear it. Rows surviving a restore would point at
    pre-restore object/session folders and show a misleading history."""
    def batch(object_name):
        return {"created_at": "2026-08-22T23:20:00", "object_id": None,
                "object_name": object_name, "slug": object_name.lower(),
                "session": "2026-08-22_2314", "frame": "light", "n_files": 4,
                "total_exposure": 1200.0, "first_obs": "2026-08-22T23:14:05",
                "image_dir": "/x"}

    blob = build_export_zip(db)
    db2 = Database(tmp_path / "other.db")
    db2.set_setting("image_dir", str(tmp_path / "archive"))
    db2.add_import_batch(batch("Old Target"))
    assert len(db2.import_batches()) == 1
    apply_import_zip(db2, blob)
    assert db2.import_batches() == []


def test_import_from_path_file(db, tmp_path):
    """The server spools uploads to a temp FILE and imports from the path -
    the Path branch of apply_import_zip must behave like the bytes branch."""
    _seed(db, tmp_path)
    blob = build_export_zip(db)
    spool = tmp_path / ".import-test.zip"
    spool.write_bytes(blob)

    db2 = Database(tmp_path / "other.db")
    db2.set_setting("image_dir", str(tmp_path / "archive"))
    summary = apply_import_zip(db2, spool)
    assert summary["sites"] == 1 and summary["images"] == 1
    assert db2.sites()[0]["name"] == "Home"
    assert summary["auto_backup"]


def test_import_preserves_current_state_in_safety_backup(db, tmp_path):
    db.add_site("Old Site", 48.0, 11.0, 500)

    other = Database(tmp_path / "other.db")
    other.add_site("New Site", 51.0, 6.0, 100)
    blob = build_export_zip(other)

    summary = apply_import_zip(db, blob)
    assert summary["sites"] == 1
    assert db.sites()[0]["name"] == "New Site"

    # the pre-import state ("Old Site") is preserved in the safety zip
    safety = db.path.with_suffix(".backup-auto.zip")
    assert safety.is_file()
    with zipfile.ZipFile(safety) as z:
        setup = json.loads(z.read("setup.json").decode("utf-8"))
    assert [s["name"] for s in setup["sites"]] == ["Old Site"]


def test_import_rejects_garbage(db):
    with pytest.raises(ValueError):
        apply_import_zip(db, b"not a zip")
    with pytest.raises(ValueError):
        apply_import_zip(db, _zip_with("other-app", {"sites": []}))
    # nothing was touched by a rejected import
    assert db.sites() == []


def test_import_traversal_paths_are_dropped(db, tmp_path):
    """A crafted zip with ../ file entries must not escape the pano dir."""
    pdir = tmp_path / "data" / "panos"
    pdir.mkdir(parents=True)
    setup = {"app": "NightSeam", "sites": [], "rigs": [], "panoramas": [
        {"id": "pX", "name": "evil", "file": "../escape.jpg"}],
        "customs": [], "images": []}
    blob = _zip_with("NightSeam", setup, files={"panos/../escape.jpg": b"x"})
    summary = apply_import_zip(db, blob)
    assert summary["pano_images"] == 0
    assert not (tmp_path / "escape.jpg").exists()
    assert not (pdir / ".." / "escape.jpg").exists()


@pytest.mark.parametrize("evil", [
    "../escape.jpg",
    "..\\escape.jpg",
    "sub/../../escape.jpg",
    "/etc/passwd",
    "C:/Windows/win.ini",
    "C:escape.jpg",
    "\\\\server\\share\\evil.jpg",
])
def test_import_drops_escaping_records_entirely(db, tmp_path, evil):
    """The DB must never even *store* an escaping path.

    Regression: the import refused to write the file but still inserted the
    row, so `/api/panorama/{id}/image` served the target file long after the
    import - a crafted setup ZIP was an arbitrary-file-read primitive.
    """
    (tmp_path / "data" / "panos").mkdir(parents=True)
    setup = {"app": "NightSeam", "sites": [], "rigs": [], "panoramas": [
        {"id": "pX", "name": "evil", "file": evil}],
        "customs": [], "images": [
            {"id": 1, "file": evil, "object_name": "evil"}]}
    summary = apply_import_zip(db, _zip_with("NightSeam", setup))

    assert summary["panoramas"] == 0        # not restored ...
    assert summary["images"] == 0
    assert db.panoramas() == []             # ... and not stored either
    assert db.images() == []


def test_import_normalizes_legitimate_subfolder_paths(db, tmp_path):
    """Safe paths keep working - and are canonicalized (separators, ./ )."""
    (tmp_path / "data" / "panos").mkdir(parents=True)
    setup = {"app": "NightSeam", "sites": [], "rigs": [], "panoramas": [
        {"id": "ok", "name": "fine", "file": ".\\sub//pano.jpg"}],
        "customs": [], "images": [
            {"id": 1, "file": "M 31/lights\\m31.fit", "object_name": "M 31"}]}
    summary = apply_import_zip(db, _zip_with("NightSeam", setup,
                                            files={"panos/sub/pano.jpg": b"jpeg"}))
    assert summary["panoramas"] == 1 and summary["images"] == 1
    assert db.panoramas()[0]["file"] == "sub/pano.jpg"
    assert db.images()[0]["file"] == "M 31/lights/m31.fit"
    assert (tmp_path / "data" / "panos" / "sub" / "pano.jpg").read_bytes() == b"jpeg"


@pytest.mark.parametrize("evil_id", [
    "..\\evil", "../evil", "sub/../../evil", ".\\evil", "C:evil",
    "evil\x00", "", "x" * 80, "-leading-dash",
])
def test_import_drops_panorama_records_with_ids_that_could_act_as_paths(
        db, tmp_path, evil_id):
    """Regression (post-remediation review): `POST /api/panorama/{pid}/image`
    interpolates the id into a FILENAME, so an id is a path input just like
    `file` is - a crafted bundle must not be able to plant one."""
    (tmp_path / "data" / "panos").mkdir(parents=True)
    setup = {"app": "NightSeam", "sites": [], "rigs": [], "panoramas": [
        {"id": evil_id, "name": "evil", "file": "ok.jpg"}],
        "customs": [], "images": []}
    summary = apply_import_zip(db, _zip_with("NightSeam", setup,
                                            files={"panos/ok.jpg": b"jpeg"}))
    assert summary["panoramas"] == 0
    assert db.panoramas() == []


def test_import_cannot_redirect_the_archive_root(db, tmp_path):
    """Regression (post-remediation review): `settings.image_dir` came from the
    ZIP and was stored verbatim, so the restore then wrote `library/*` into an
    attacker-chosen directory (arbitrary name, extension and content) and
    `/api/export` read that directory back out - a crafted "setup export" was
    an arbitrary-write/arbitrary-read primitive. The documented behaviour is
    that the library is restored into the CURRENTLY CONFIGURED archive, so the
    imported value is ignored and reported."""
    attacker = tmp_path / "attacker_dir"
    setup = {
        "app": "NightSeam",
        "settings": {"image_dir": str(attacker), "bortle": 7},
        "sites": [], "rigs": [], "panoramas": [], "customs": [],
        "images": [{"id": 1, "file": "sub/pwn.bat", "object_name": "x"}],
    }
    summary = apply_import_zip(
        db, _zip_with("NightSeam", setup, files={"library/sub/pwn.bat": b"@echo PWNED"}))

    assert not attacker.exists(), "the imported image_dir was used as a root"
    assert db.setting("image_dir") == str(tmp_path / "archive")
    assert summary["image_dir_ignored"] == str(attacker)
    assert summary["library_files"] == 1
    # the file went into the CONFIGURED archive instead
    restored = tmp_path / "archive" / "sub" / "pwn.bat"
    assert restored.read_bytes() == b"@echo PWNED"
    assert db.images()[0]["file"] == "sub/pwn.bat"
    # other settings from the bundle still apply
    assert db.setting("bortle") == 7


def test_import_without_image_dir_keeps_the_configured_archive(db, tmp_path):
    """A bundle that omits image_dir must not reset the user's archive root."""
    db.set_setting("image_dir", str(tmp_path / "mine"))
    setup = {"app": "NightSeam", "settings": {}, "sites": [], "rigs": [],
             "panoramas": [], "customs": [],
             "images": [{"id": 1, "file": "x.fit", "object_name": "x"}]}
    apply_import_zip(db, _zip_with("NightSeam", setup,
                                  files={"library/x.fit": b"FITS"}))
    assert db.setting("image_dir") == str(tmp_path / "mine")
    assert (tmp_path / "mine" / "x.fit").read_bytes() == b"FITS"


def test_failed_import_rolls_back_everything(db):
    """A bundle that blows up mid-restore must leave the existing data intact.

    Regression: the deletes stayed live on the shared connection and were
    committed by the NEXT unrelated write, silently wiping the user's data."""
    db.add_site("Home", 50.0, 7.8, 150)
    db.set_setting("bortle", 4)
    # sites[0] has no name -> NOT NULL constraint failure half way through
    with pytest.raises(Exception):
        db.import_bundle(settings={"theme": "dome"}, sites=[{}], rigs=[],
                         panoramas=[], customs=[], images=[])
    assert len(db.sites()) == 1                      # rolled back, not wiped
    db.set_setting("edge_space", 180)                # a later, unrelated write
    assert len(db.sites()) == 1                      # ... must not persist a wipe
    assert db.setting("bortle") == 4


def test_import_never_touches_observations(db, tmp_path):
    """The legacy journal table is neither exported nor imported - and an
    import must not delete rows it never carried (AGENTS.md: leave it alone)."""
    db.add_site("Home", 50.0, 7.8, 150)
    db.add_observation("m31", "2026-08-22", "old journal row")
    assert len(db.observations()) == 1
    blob = build_export_zip(db)
    assert "observations" not in json.loads(
        zipfile.ZipFile(io.BytesIO(blob)).read("setup.json"))
    apply_import_zip(db, blob)
    assert len(db.observations()) == 1               # survived the restore


def test_import_rejects_malformed_bundle_shape(db):
    """Non-dict settings / non-list collections are a 400-class error, not a
    half-applied restore."""
    db.add_site("Home", 50.0, 7.8, 150)
    with pytest.raises(ValueError):
        db.import_bundle(settings=[], sites=[], rigs=[], panoramas=[],
                         customs=[], images=[])
    assert len(db.sites()) == 1


def _mutate_bundle(blob, mutate):
    """Copy a bundle with setup.json mutated (test helper)."""
    src = zipfile.ZipFile(io.BytesIO(blob))
    setup = json.loads(src.read("setup.json"))
    mutate(setup)
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst:
        dst.writestr("setup.json", json.dumps(setup))
        for name in src.namelist():
            if name != "setup.json":
                dst.writestr(name, src.read(name))
    return out.getvalue()


def test_import_rejects_malformed_profiles(db, tmp_path):
    """FIX-4 (review PY1): a panorama profile that is not [] or exactly 720
    finite numbers used to be stored verbatim and then failed OPEN at planning
    time (a blocked target ranked observable). Fail closed, leave data intact."""
    db.add_site("Home", 50.0, 7.8, 150)
    baseline = build_export_zip(db)
    for bad in ([10.0] * 719, [10.0] * 721, ["x"] * 720, [True] * 720,
                [float("nan")] * 720):
        blob = _mutate_bundle(
            baseline,
            lambda s, bad=bad: s["panoramas"].append(
                {"id": "pbad", "name": "bad", "file": "bad.jpg",
                 "profile": bad, "profile_top": []}))
        with pytest.raises(ValueError, match="profile"):
            apply_import_zip(db, blob)
    assert len(db.sites()) == 1          # nothing was replaced
    assert db.setting("bortle", 4) == 4


def test_import_rejects_hostile_settings(db):
    """FIX-4 (review PY2): an opaque imported setting could brick /api/state
    forever (bortle null -> float(None) at every boot). Fail closed instead."""
    db.add_site("Home", 50.0, 7.8, 150)
    for bad in ({"bortle": None}, {"bortle": "x"}, {"min_useful_alt": "x"},
                {"adv_mode": 1}, {"filters": []}):
        blob = _mutate_bundle(build_export_zip(db),
                              lambda s, bad=bad: s["settings"].update(bad))
        with pytest.raises(ValueError):
            apply_import_zip(db, blob)
    assert len(db.sites()) == 1
    db.set_setting("edge_space", 100)    # a later write must not persist a wipe
    assert len(db.sites()) == 1


def test_import_rejects_nonfinite_site_and_rig_numbers(db):
    """PY3 follow-up (adversarial verification): imported site/rig/pano
    numbers reach /api/state, so a crafted zip with Infinity used to 500 the
    route forever. Must fail closed before any write."""
    db.add_site("Home", 50.0, 7.8, 150)
    for bad in ({"lat": float("inf")},
                {"lat": 1.0, "lon": float("nan")}):
        blob = _mutate_bundle(build_export_zip(db),
                              lambda s, bad=bad: s["sites"][0].update(bad))
        with pytest.raises(ValueError, match="finite"):
            apply_import_zip(db, blob)
    blob = _mutate_bundle(
        build_export_zip(db),
        lambda s: s["rigs"].append({"id": 1, "name": "r",
                                    "focal_mm": float("inf"),
                                    "sensor_w": 6.0, "sensor_h": 4.0}))
    with pytest.raises(ValueError, match="finite"):
        apply_import_zip(db, blob)
    assert len(db.sites()) == 1                    # nothing was replaced
    assert db.sites()[0]["lat"] == 50.0


def test_import_rejects_custom_ids_without_the_u_prefix(db):
    """PY4 (review): a bundle could insert a custom target with a BUILTIN id
    (e.g. "m31"); /api/catalog then shipped duplicate ids that the API could
    not delete. Fail closed."""
    db.add_site("Home", 50.0, 7.8, 150)
    blob = _mutate_bundle(
        build_export_zip(db),
        lambda s: s["customs"].append(
            {"id": "m31", "primary_name": "Evil", "otype": "galaxy",
             "ra_hours": 0.7, "dec_deg": 41.3, "vmag": 4, "size_am": "",
             "constellation": "", "blurb": ""}))
    with pytest.raises(ValueError, match="u_"):
        apply_import_zip(db, blob)
    assert len(db.sites()) == 1


def _zip_with(app_name: str, setup: dict, files: dict | None = None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("setup.json", json.dumps(setup))
        for name, data in (files or {}).items():
            z.writestr(name, data)
    return buf.getvalue()


# ------------------------------------------------- PY04-F2: the storage boundary

def _image_row(**overrides) -> dict:
    row = {"file": "M 31/2026-08-22_2314/lights/m31.fit",
           "orig_name": "m31.fit", "object_id": None, "object_name": "M 31",
           "ra_hours": 0.712, "dec_deg": 41.269, "exposure": 300.0,
           "date_obs": "2026-08-22T23:14:05", "filter": "L",
           "telescope": "Seestar S50", "imagetyp": "light",
           "ingested_at": "2026-08-22T23:20:00"}
    row.update(overrides)
    return row


def test_import_rejects_nonfinite_image_numbers(db, tmp_path):
    """PY04-F2 (review round 2): the image rows were the ONE record type the
    import boundary did not check, and `json.loads` accepts the bare tokens
    Infinity/NaN - so a crafted bundle stored `inf`, and /api/library then
    answered 500 on EVERY later request. Fail closed before any write."""
    _seed(db, tmp_path)
    for bad in ({"exposure": float("inf")}, {"ra_hours": float("nan")},
                {"dec_deg": float("-inf")}):
        blob = _mutate_bundle(build_export_zip(db),
                              lambda s, bad=bad: s["images"][0].update(bad))
        with pytest.raises(ValueError, match="image .* finite number"):
            apply_import_zip(db, blob)
    assert db.images()[0]["exposure"] == 300.0      # nothing was replaced
    assert db.images()[0]["ra_hours"] == 0.712
    # a custom target's numbers reach /api/catalog, so they fail closed too
    blob = _mutate_bundle(
        build_export_zip(db),
        lambda s: s["customs"][0].update({"ra_hours": float("inf")}))
    with pytest.raises(ValueError, match="custom .* finite number"):
        apply_import_zip(db, blob)
    assert len(db.customs()) == 1


def test_add_image_cannot_store_a_nonfinite_number(db):
    """PY04-F2: the guard sits at the single storage boundary, so NO caller can
    put a non-finite ra/dec/exposure into the images table - a stored `inf` is
    what makes /api/library (allow_nan=False) 500 forever."""
    img_id = db.add_image(_image_row(
        ra_hours=float("inf"), dec_deg=float("nan"), exposure=float("-inf")))
    row = db.image(img_id)
    assert row["ra_hours"] is None and row["dec_deg"] is None
    assert row["exposure"] is None
    # finite values (int or float) and non-numeric values are untouched
    ok_id = db.add_image(_image_row(ra_hours=5, dec_deg=-27.958, exposure=60.0))
    ok = db.image(ok_id)
    assert ok["ra_hours"] == 5 and ok["dec_deg"] == -27.958
    assert ok["exposure"] == 60.0


def test_export_of_a_corrupt_library_is_importable_and_stays_finite(db, tmp_path):
    """PY04-F2 recovery: a database that ALREADY carries a non-finite row (from
    an older build) used to export a bare `Infinity` token - un-parseable by a
    strict JSON reader and, re-imported, the corruption came back. The export
    now writes NULL for an unusable number, so the user's own backup restores
    cleanly and the stored values are finite."""
    _seed(db, tmp_path)
    # simulate the pre-existing corruption (bypasses add_image's guard)
    db.conn.execute("UPDATE images SET ra_hours=?, exposure=?",
                    (float("inf"), float("nan")))
    db.conn.commit()

    blob = build_export_zip(db)
    raw = zipfile.ZipFile(io.BytesIO(blob)).read("setup.json").decode("utf-8")
    assert "Infinity" not in raw and "NaN" not in raw

    def _no_constant(token):
        raise AssertionError(f"non-standard JSON token {token!r}")

    setup = json.loads(raw, parse_constant=_no_constant)   # strict parse
    assert setup["images"][0]["exposure"] is None
    assert setup["images"][0]["ra_hours"] is None

    db2 = Database(tmp_path / "other.db")
    db2.set_setting("image_dir", str(tmp_path / "archive"))
    apply_import_zip(db2, blob)                          # must not raise
    row = db2.images()[0]
    for key in ("ra_hours", "dec_deg", "exposure"):
        assert row[key] is None or math.isfinite(float(row[key])), (key, row)
