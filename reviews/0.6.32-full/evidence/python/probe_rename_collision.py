"""L1 probe: does `/api/library/edit` lose bytes when the target folder exists?

`rename_archive_folder` merges into an existing folder with `f.replace(dest)`,
with no uniquify loop (unlike `ingest._archive_target`). Two groups holding a
same-named frame therefore collide.

Run from the repo root:
    python reviews/0.6.32-full/evidence/python/probe_rename_collision.py
"""
from __future__ import annotations

import hashlib
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient          # noqa: E402

from app.database import Database                  # noqa: E402
from app.server import create_app                  # noqa: E402

SCRATCH = ROOT / "logs" / "review-py-lane" / "rename"
shutil.rmtree(SCRATCH, ignore_errors=True)
ARCHIVE = SCRATCH / "archive"
SCRATCH.mkdir(parents=True, exist_ok=True)

# group A: unresolved (object_id NULL)  |  group B: an existing resolved folder
# Same session folder (the common "undated" case when DATE-OBS is missing or the
# two groups were captured the same night) and the same camera file name.
A = ARCHIVE / "Unknown target" / "undated" / "lights"
B = ARCHIVE / "NGC 7000" / "undated" / "lights"
for d in (A, B):
    d.mkdir(parents=True, exist_ok=True)
(A / "Light_001.fit").write_bytes(b"AAAA-from-the-unresolved-group")
(B / "Light_001.fit").write_bytes(b"BBBB-from-the-already-resolved-group")


def digest(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()[:12] + f" ({p.stat().st_size}B)"


db = Database(SCRATCH / "nightseam.db")
db.set_setting("image_dir", str(ARCHIVE))
for rel, oid, name in (
    ("Unknown target/undated/lights/Light_001.fit", None, "Unknown target"),
    ("NGC 7000/undated/lights/Light_001.fit", "ngc7000", "NGC 7000"),
):
    db.add_image({"file": rel, "orig_name": "Light_001.fit", "object_id": oid,
                  "object_name": name, "ingested_at": "2026-08-22T20:00:00"})

print("before:")
print(f"    A {A / 'Light_001.fit'} -> {digest(A / 'Light_001.fit')}")
print(f"    B {B / 'Light_001.fit'} -> {digest(B / 'Light_001.fit')}")

client = TestClient(create_app(db, prefetch=False), raise_server_exceptions=False)
r = client.post("/api/library/edit",
                json={"name": "Unknown target", "new_name": "NGC 7000"})
print(f"POST /api/library/edit {{name:'Unknown target', new_name:'NGC 7000'}} "
      f"-> {r.status_code} {r.text[:80]}")

print("after:")
files = sorted(p for p in ARCHIVE.rglob("*") if p.is_file())
for p in files:
    print(f"    {p.relative_to(ARCHIVE)} -> {digest(p)}")
print(f"    files on disk: {len(files)} (started with 2)")
print(f"    stored rows  : {[(i['object_name'], i['file']) for i in db.images()]}")
print(f"    duplicate stored paths: "
      f"{len(db.images()) - len({i['file'] for i in db.images()})}")
db.conn.close()
