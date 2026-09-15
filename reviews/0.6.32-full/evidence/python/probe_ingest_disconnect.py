"""L1 probe: an upload that dies mid-stream (client disconnect / read error).

`ingest._stream_to` removes the partial target only for the size cap
(`return None`) or a raised OSError. A read that raises anything else leaves the
truncated frame on disk; `/api/library/reindex` will later record it, because the
complete FITS header is the FIRST thing written.

Run from the repo root:
    python reviews/0.6.32-full/evidence/python/probe_ingest_disconnect.py
"""
from __future__ import annotations

import asyncio
import shutil
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from starlette.requests import ClientDisconnect    # noqa: E402

from app.database import Database                  # noqa: E402
from app.ingest import ingest_one                  # noqa: E402

SCRATCH = ROOT / "logs" / "review-py-lane" / "ingest-disconnect"
shutil.rmtree(SCRATCH, ignore_errors=True)
ARCHIVE = SCRATCH / "archive"
SCRATCH.mkdir(parents=True, exist_ok=True)

HEADER = ("SIMPLE  =                    T" + "OBJECT  = 'M31'"
          + "EXPTIME =                  300.0" + "END").encode().ljust(2880, b" ")
PAYLOAD = b"\x00" * (200 * 1024)


class DroppingUpload:
    """A minimal UploadFile stand-in whose stream dies after the header."""

    def __init__(self, name: str):
        self.filename = name
        self.size = None
        self._chunks = [HEADER + PAYLOAD[:1000]]
        self._sent_header = False

    async def read(self, n: int) -> bytes:
        if self._chunks:
            return self._chunks.pop(0)
        raise ClientDisconnect()


db = Database(SCRATCH / "nightseam.db")
db.set_setting("image_dir", str(ARCHIVE))
catalog = db.all_objects(advanced=True)

try:
    asyncio.run(ingest_one(db, catalog, ARCHIVE, DroppingUpload("m31.fit")))
    outcome = "no exception"
except BaseException as exc:                        # noqa: BLE001
    outcome = f"{type(exc).__name__}: {exc}"
    traceback.print_exc(limit=3)

leftovers = sorted(p for p in ARCHIVE.rglob("*") if p.is_file())
print(f"outcome          : {outcome}")
print(f"files on disk    : "
      f"{[(str(p.relative_to(ARCHIVE)), p.stat().st_size) for p in leftovers]}")
print(f"db rows          : {len(db.images())}")

if leftovers:
    res = __import__("app.ingest", fromlist=["reindex_library"]).reindex_library(
        db, ARCHIVE)
    print(f"reindex_library  : {res}")
    print(f"db rows after    : "
          f"{[(i['object_name'], i['file'], i['exposure']) for i in db.images()]}")
db.conn.close()
