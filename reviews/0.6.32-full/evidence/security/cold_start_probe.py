"""Review-only probe (L9): desktop cold start - DB open + catalog seed + app build.

Scratch db under logs/, never the user's data/.
Run: python reviews/0.6.32-full/evidence/security/cold_start_probe.py
"""
from __future__ import annotations

import json
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

SCRATCH = ROOT / "logs" / "review-l9-cold"
if SCRATCH.exists():
    shutil.rmtree(SCRATCH, ignore_errors=True)
SCRATCH.mkdir(parents=True)

t0 = time.perf_counter()
from app.database import Database            # noqa: E402
import_import = time.perf_counter() - t0

t0 = time.perf_counter()
db = Database(SCRATCH / "fresh.db")          # first run: creates + seeds catalog
first_open = time.perf_counter() - t0

t0 = time.perf_counter()
counts = {"objects": len(db.all_objects()), "advanced": db.advanced_count()}
read_all = time.perf_counter() - t0

t0 = time.perf_counter()
db2 = Database(SCRATCH / "fresh.db")         # existing db: no re-seed
second_open = time.perf_counter() - t0
del db2

from app.server import create_app             # noqa: E402
t0 = time.perf_counter()
app = create_app(db, prefetch=False)          # no img-prefetch thread
build_app = time.perf_counter() - t0

t0 = time.perf_counter()
db.add_site("S", 51.0, 7.0, 10.0)             # a single write transaction
write_ms = (time.perf_counter() - t0) * 1000

print(json.dumps({
    "import_app_database_s": round(import_import, 3),
    "first_open_seed_s": round(first_open, 3),
    "second_open_s": round(second_open, 3),
    "all_objects_s": round(read_all, 3),
    "create_app_s": round(build_app, 3),
    "single_write_ms": round(write_ms, 1),
    "counts": counts,
    "db_bytes": (SCRATCH / "fresh.db").stat().st_size,
}, indent=1))
