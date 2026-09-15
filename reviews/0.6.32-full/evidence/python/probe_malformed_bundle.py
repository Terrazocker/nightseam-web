"""L1 probe: which malformed-but-valid-JSON bundles become a 500 (not a 400)?

`apply_import_zip` documents "Raises ValueError on malformed input"; the route
maps ValueError -> 400 and OSError -> 500. Anything else escapes as a 500.

Run from the repo root:
    python reviews/0.6.32-full/evidence/python/probe_malformed_bundle.py
"""
from __future__ import annotations

import io
import json
import shutil
import sys
import traceback
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient          # noqa: E402

from app.backup import apply_import_zip            # noqa: E402
from app.database import Database                  # noqa: E402
from app.server import create_app                  # noqa: E402

SCRATCH = ROOT / "logs" / "review-py-lane" / "malformed"
shutil.rmtree(SCRATCH, ignore_errors=True)
SCRATCH.mkdir(parents=True, exist_ok=True)


def bundle(setup: dict) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("setup.json", json.dumps(setup))
    return out.getvalue()


def base(**over):
    s = {"app": "NightSeam", "settings": {}, "sites": [], "rigs": [],
         "panoramas": [], "customs": [], "images": []}
    s.update(over)
    return s


def pano(pid="p1", fname="p.jpg"):
    return {"id": pid, "name": pid, "file": fname, "strokes": [],
            "profile": [], "profile_top": []}


CASES = {
    "site name null": base(sites=[{"id": 1, "name": None, "lat": 50.0,
                                   "lon": 8.0, "elev": 0}]),
    "site id text": base(sites=[{"id": "abc", "name": "x", "lat": 50.0,
                                 "lon": 8.0, "elev": 0}]),
    "duplicate site ids": base(sites=[{"id": 1, "name": "a", "lat": 50.0,
                                       "lon": 8.0, "elev": 0},
                                      {"id": 1, "name": "b", "lat": 51.0,
                                       "lon": 9.0, "elev": 0}]),
    "duplicate pano ids": base(panoramas=[pano("p1", "a.jpg"), pano("p1", "b.jpg")]),
    "pano name null": base(panoramas=[{"id": "p1", "name": None, "file": "a.jpg",
                                       "strokes": [], "profile": [],
                                       "profile_top": []}]),
    "custom duplicate ids": base(customs=[
        {"id": "u_x", "primary_name": "a", "ra_hours": 1.0, "dec_deg": 2.0},
        {"id": "u_x", "primary_name": "b", "ra_hours": 3.0, "dec_deg": 4.0}]),
    "custom missing ra": base(customs=[
        {"id": "u_x", "primary_name": "a", "dec_deg": 2.0}]),
    "settings not a dict": base(settings=[]),
    "panoramas not a list": base(panoramas={"id": "p1"}),
    "sites not a list": base(sites={"a": 1}),
    "site entry not a dict": base(sites=["nope"]),
}

for label, setup in CASES.items():
    case = SCRATCH / "".join(c if c.isalnum() else "-" for c in label)
    case.mkdir(parents=True, exist_ok=True)

    db = Database(case / "direct.db")
    db.set_setting("image_dir", str(case / "archive"))
    db.add_site("Original", 50.0, 8.0, 20.0)
    try:
        apply_import_zip(db, bundle(setup))
        direct = "accepted"
    except Exception as exc:                       # noqa: BLE001
        direct = f"{type(exc).__name__}: {exc}"
        if not isinstance(exc, (ValueError, OSError)):
            direct += "  <-- NOT ValueError/OSError"
    db.conn.close()

    db2 = Database(case / "http.db")
    db2.set_setting("image_dir", str(case / "archive"))
    db2.add_site("Original", 50.0, 8.0, 20.0)
    client = TestClient(create_app(db2, prefetch=False),
                        raise_server_exceptions=False)
    r = client.post("/api/import", files={
        "file": ("setup.zip", io.BytesIO(bundle(setup)), "application/zip")})
    sites = [s["name"] for s in db2.sites()]
    db2.conn.close()
    print(f"{label:<24} direct={direct[:66]:<68}")
    print(f"{'':<24} HTTP={r.status_code} {r.text[:60]} | sites after={sites}")
