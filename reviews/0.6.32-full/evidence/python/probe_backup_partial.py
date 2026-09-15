"""L1 probe: what state does a failed ZIP restore leave behind?

Three triggers, all after `import_bundle` has committed:
  A) OSError while writing one panorama payload (the prior evidence probe)
  B) a zip member over `MAX_MEMBER_BYTES`
  C) a bundle whose payloads are all fine (control)

Run from the repo root:
    python reviews/0.6.32-full/evidence/python/probe_backup_partial.py
"""
from __future__ import annotations

import io
import json
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

import app.backup as backup                       # noqa: E402
from app.backup import apply_import_zip           # noqa: E402
from app.database import Database                 # noqa: E402

SCRATCH = ROOT / "logs" / "review-py-lane" / "backup-partial"
shutil.rmtree(SCRATCH, ignore_errors=True)
SCRATCH.mkdir(parents=True, exist_ok=True)


def bundle(panos, members) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("setup.json", json.dumps({
            "app": "NightSeam", "settings": {},
            "sites": [{"id": 1, "name": "Imported", "lat": 51.0, "lon": 7.0, "elev": 10}],
            "rigs": [], "panoramas": panos, "customs": [], "images": [],
        }))
        for name, payload in members:
            zf.writestr(name, payload)
    return out.getvalue()


def pano(pid, fname):
    return {"id": pid, "name": pid, "file": fname, "strokes": [],
            "profile": [], "profile_top": []}


def fresh(case: str, baseline: bool = True):
    d = SCRATCH / case
    d.mkdir(parents=True, exist_ok=True)
    db = Database(d / "nightseam.db")
    db.set_setting("image_dir", str(d / "archive"))
    if baseline:
        db.add_site("Original", 50.0, 8.0, 20.0)
    return db, d


def observe(db, tag, err, panos_dir):
    panos_dir.mkdir(parents=True, exist_ok=True)
    print(f"--- {tag}")
    print(f"    raised            : {err}")
    print(f"    sites after       : {[s['name'] for s in db.sites()]}")
    print(f"    panorama rows     : {[p['file'] for p in db.panoramas()]}")
    print(f"    payload files     : {sorted(p.name for p in panos_dir.iterdir())}")
    print(f"    safety copy       : {db.path.with_suffix('.backup-auto.zip').is_file()}")
    db.conn.close()


# A) payload write failure, mid-loop (second of two records fails)
db, d = fresh("write-failure")
panos = [pano("p1", "ok.jpg"), pano("p2", "fail.jpg")]
original_write = Path.write_bytes


def fail_second(path, data):
    if path.name == "fail.jpg":
        raise OSError("forced payload write failure")
    return original_write(path, data)


real_data_dir = backup.data_dir
backup.data_dir = lambda: d / "data"
import unittest.mock as mock                    # noqa: E402
try:
    with mock.patch.object(Path, "write_bytes", fail_second):
        try:
            apply_import_zip(db, bundle(panos, [("panos/ok.jpg", b"a" * 10),
                                                ("panos/fail.jpg", b"b" * 10)]))
            err = "NO ERROR"
        except Exception as exc:                 # noqa: BLE001
            err = f"{type(exc).__name__}: {exc}"
    observe(db, "A) payload write failure (p2 of 2 fails)", err, d / "data" / "panos")
finally:
    backup.data_dir = real_data_dir

# B) a member over the cap, after a smaller member was already restored.
# `MAX_MEMBER_BYTES` is a DEFAULT ARGUMENT (bound at def time), so the module
# attribute must be patched through __defaults__ to reach the real branch.
db, d = fresh("member-too-large")
backup.data_dir = lambda: d / "data"
old_defaults = backup._read_member.__defaults__
backup._read_member.__defaults__ = (4,)          # deterministic stand-in for >1 GiB
try:
    try:
        apply_import_zip(db, bundle(
            [pano("p1", "small.jpg"), pano("p2", "too-big.jpg")],
            [("panos/small.jpg", b"a"), ("panos/too-big.jpg", b"b" * 4096)]))
        err = "NO ERROR"
    except Exception as exc:                     # noqa: BLE001
        err = f"{type(exc).__name__}: {exc}"
    observe(db, "B) member over the per-member cap (default patched to 4 B)",
            err, d / "data" / "panos")
finally:
    backup._read_member.__defaults__ = old_defaults
    backup.data_dir = real_data_dir

# C) control: a clean restore commits and writes everything
db, d = fresh("control")
backup.data_dir = lambda: d / "data"
try:
    summary = apply_import_zip(db, bundle(panos, [("panos/ok.jpg", b"a" * 10),
                                                  ("panos/fail.jpg", b"b" * 10)]))
    observe(db, "C) control (both payloads write)", summary, d / "data" / "panos")
finally:
    backup.data_dir = real_data_dir

# D) the same trigger through the real HTTP route: what status does the user see,
#    and what is the DB state at that moment?
from fastapi.testclient import TestClient                 # noqa: E402
from app.server import create_app                         # noqa: E402

db, d = fresh("http-import")
db.set_setting("image_dir", str(d / "archive"))
backup.data_dir = lambda: d / "data"
zip_path = d / "bundle.zip"
zip_path.write_bytes(bundle(
    [pano("p1", "small.jpg"), pano("p2", "too-big.jpg")],
    [("panos/small.jpg", b"a"), ("panos/too-big.jpg", b"b" * 4096)]))
old_defaults = backup._read_member.__defaults__
backup._read_member.__defaults__ = (4,)
try:
    client = TestClient(create_app(db, prefetch=False), raise_server_exceptions=False)
    with open(zip_path, "rb") as fh:
        r = client.post("/api/import",
                        files={"file": ("setup.zip", fh, "application/zip")})
    print("--- D) POST /api/import with an over-cap member")
    print(f"    HTTP status       : {r.status_code}")
    print(f"    body              : {r.text[:160]}")
    print(f"    sites after       : {[s['name'] for s in db.sites()]}")
    print(f"    panorama rows     : {[p['file'] for p in db.panoramas()]}")
    print(f"    payload files     : "
          f"{sorted(p.name for p in (d / 'data' / 'panos').iterdir())}")
    print(f"    spool files left  : "
          f"{[p.name for p in d.iterdir() if p.name.startswith('.import-')]}")
finally:
    backup._read_member.__defaults__ = old_defaults
    backup.data_dir = real_data_dir
    db.conn.close()
