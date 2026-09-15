"""L1 probe: does an imported setup bundle get the same validation as the API?

Checks every settings key /api/state reads with a CAST (int/float) that
_validate_import_settings() may have missed. Run from the repo root:
    python reviews/0.6.32-full/evidence/python/probe_settings_import.py
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

from fastapi.testclient import TestClient          # noqa: E402

from app.backup import apply_import_zip            # noqa: E402
from app.database import Database                  # noqa: E402
from app.server import create_app                  # noqa: E402

SCRATCH = ROOT / "logs" / "review-py-lane" / "settings-import"
shutil.rmtree(SCRATCH, ignore_errors=True)
SCRATCH.mkdir(parents=True, exist_ok=True)
ARCHIVE = SCRATCH / "archive"


def bundle(settings: dict) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("setup.json", json.dumps({
            "app": "NightSeam", "settings": settings,
            "sites": [], "rigs": [], "panoramas": [], "customs": [], "images": [],
        }))
    return out.getvalue()


CASES = [
    ("min_vis", "abc"),
    ("min_vis", None),
    ("min_vis", 1.5),
    ("bortle", "abc"),
    ("edge_space", None),
    ("favorites", ["ok", {"not": "a string"}]),
    ("filters", {"broadband": "yes"}),
    ("size_unit", "metres"),
]

for key, value in CASES:
    safe = "".join(c if c.isalnum() else "_" for c in f"{key}-{value!r}")[:40]
    case = SCRATCH / safe
    case.mkdir(parents=True, exist_ok=True)
    db = Database(case / "nightseam.db")
    db.set_setting("image_dir", str(ARCHIVE))     # never the user profile
    try:
        apply_import_zip(db, bundle({key: value}))
        imported = "accepted"
    except ValueError as exc:
        imported = f"ValueError: {exc}"
    except Exception as exc:                       # noqa: BLE001
        imported = f"{type(exc).__name__}: {exc}"

    status = body = None
    try:
        client = TestClient(create_app(db, prefetch=False),
                            raise_server_exceptions=False)
        r = client.get("/api/state")
        status = r.status_code
        body = r.text[:120] if r.status_code != 200 else "200 OK"
    except Exception as exc:                       # noqa: BLE001
        status, body = "client-error", f"{type(exc).__name__}: {exc}"
    finally:
        db.conn.close()
    print(f"settings[{key!r}] = {value!r}: import={imported} | "
          f"GET /api/state -> {status} {body}")
