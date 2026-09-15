"""Review-only proof that payload-write failure is not an atomic restore."""

import io
import json
import zipfile
from pathlib import Path

import pytest

import app.backup as backup
from app.backup import apply_import_zip
from app.database import Database


def _bundle():
    setup = {
        "app": "NightSeam", "settings": {},
        "sites": [{"id": 1, "name": "Imported", "lat": 51.0, "lon": 7.0, "elev": 10}],
        "rigs": [],
        "panoramas": [{"id": "p1", "name": "P", "file": "fail.jpg",
                        "strokes": [], "profile": [], "profile_top": []}],
        "customs": [], "images": [],
    }
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("setup.json", json.dumps(setup))
        zf.writestr("panos/fail.jpg", b"payload")
    return out.getvalue()


def test_payload_write_failure_leaves_committed_import(tmp_path, monkeypatch):
    db = Database(tmp_path / "nightseam.db")
    db.add_site("Original", 50.0, 8.0, 20.0)
    original = Path.write_bytes

    def fail_target(path, data):
        if path.name == "fail.jpg":
            raise OSError("forced payload write failure")
        return original(path, data)

    monkeypatch.setattr(backup, "data_dir", lambda: tmp_path / "data")
    monkeypatch.setattr(Path, "write_bytes", fail_target)
    with pytest.raises(OSError, match="forced payload write failure"):
        apply_import_zip(db, _bundle())

    # Passing assertions deliberately document the observed non-rollback state.
    assert [s["name"] for s in db.sites()] == ["Imported"]
    assert [p["file"] for p in db.panoramas()] == ["fail.jpg"]
    assert db.path.with_suffix(".backup-auto.zip").is_file()
