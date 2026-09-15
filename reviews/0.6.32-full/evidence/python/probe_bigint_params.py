"""L1 probe: integer path parameters beyond SQLite's 64-bit range.

Run from the repo root:
    python reviews/0.6.32-full/evidence/python/probe_bigint_params.py
"""
from __future__ import annotations

import shutil
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient          # noqa: E402

import app.server as server                        # noqa: E402
from app.database import Database                  # noqa: E402

SCRATCH = ROOT / "logs" / "review-py-lane" / "bigint"
shutil.rmtree(SCRATCH, ignore_errors=True)
SCRATCH.mkdir(parents=True, exist_ok=True)

db = Database(SCRATCH / "nightseam.db")
db.set_setting("image_dir", str(SCRATCH / "archive"))
db.add_site("s", 50.0, 8.0, 10)
sid = db.sites()[0]["id"]
client = TestClient(server.create_app(db, prefetch=False),
                    raise_server_exceptions=False)

BIG = 999999999999999999999                          # > 2**63
for label, resp in (
    (f"GET  /api/images/{BIG}/preview", client.get(f"/api/images/{BIG}/preview")),
    (f"PUT  /api/sites/{BIG}", client.put(f"/api/sites/{BIG}", json={
        "name": "x", "lat": 50.0, "lon": 8.0, "elev": 10})),
    (f"DEL  /api/sites/{BIG}", client.delete(f"/api/sites/{BIG}")),
    (f"GET  /api/images/9223372036854775807/preview",
     client.get("/api/images/9223372036854775807/preview")),
):
    print(f"{label:<44} -> {resp.status_code} {resp.text[:60]}")

print("-- direct call, to name the exception --")
try:
    db.image(BIG)
except Exception:                                    # noqa: BLE001
    print(traceback.format_exc().strip().splitlines()[-1])
try:
    db.delete_site(BIG)
except Exception:                                    # noqa: BLE001
    print(traceback.format_exc().strip().splitlines()[-1])
db.conn.close()
