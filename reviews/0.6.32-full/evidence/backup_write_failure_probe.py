"""Review-only probe: does ZIP restore roll back after a payload write failure?"""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

import app.backup as backup
from app.backup import apply_import_zip
from app.database import Database


def bundle() -> bytes:
    setup = {
        "app": "NightSeam",
        "settings": {},
        "sites": [{"id": 1, "name": "Imported", "lat": 51.0, "lon": 7.0, "elev": 10}],
        "rigs": [],
        "panoramas": [{"id": "p1", "name": "P", "file": "fail.jpg",
                        "strokes": [], "profile": [], "profile_top": []}],
        "customs": [],
        "images": [],
    }
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("setup.json", json.dumps(setup))
        zf.writestr("panos/fail.jpg", b"payload")
    return out.getvalue()


root = Path(__file__).resolve().parents[3] / "logs" / "review-backup-write-probe-0.6.32"
db = Database(root / "nightseam.db")
db.add_site("Original", 50.0, 8.0, 20.0)
original = Path.write_bytes


def fail_target(path: Path, data: bytes) -> int:
    if path.name == "fail.jpg":
        raise OSError("forced payload write failure")
    return original(path, data)


with patch.object(backup, "data_dir", lambda: root / "data"), \
     patch.object(Path, "write_bytes", fail_target):
    try:
        apply_import_zip(db, bundle())
    except OSError as exc:
        error = str(exc)
    else:
        error = "NO ERROR"

print(json.dumps({
    "error": error,
    "sites_after_failure": [s["name"] for s in db.sites()],
    "panoramas_after_failure": [p["file"] for p in db.panoramas()],
    "safety_copy_exists": db.path.with_suffix(".backup-auto.zip").is_file(),
}, sort_keys=True))
