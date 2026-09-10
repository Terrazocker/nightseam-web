"""Tests for setup export / import (app/backup.py).

All file I/O is isolated: `app.backup.data_dir` is monkeypatched onto a
tmp dir and each Database lives in its own tmp dir, so nothing touches the
repo's real `data/`.
"""

import io
import json
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


def _zip_with(app_name: str, setup: dict, files: dict | None = None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("setup.json", json.dumps(setup))
        for name, data in (files or {}).items():
            z.writestr(name, data)
    return buf.getvalue()