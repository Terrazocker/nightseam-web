"""Image archive ingest: parse FITS headers, resolve objects, store files.

Files are streamed to the archive (only the header is buffered in memory)
and capped at MAX_INGEST_BYTES so an oversized upload cannot exhaust RAM
or disk.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path

from . import fits as fitsio
from . import imglib
from .database import Database

MAX_INGEST_BYTES = 1 << 30          # 1 GiB per file
HEADER_READ = 1_500_000             # fits._MAX_BLOCKS blocks ~= 1.47 MB
_COPY_CHUNK = 1 << 16               # 64 KB streaming buffer


def obj_slug(object_name: str) -> str:
    return re.sub(r"[^A-Za-z0-9 _-]+", "", object_name).strip() or "misc"


def _archive_target(archive: Path, name: str, object_name: str) -> Path:
    """Unique destination path <archive>/<slug>/lights/<stem>[._n]<suffix>."""
    slug = obj_slug(object_name)
    suffix = Path(name).suffix or ".fit"
    stem = (Path(name).stem or "image")[:80]
    sub = archive / slug / "lights"
    sub.mkdir(parents=True, exist_ok=True)
    target = sub / f"{stem}{suffix}"
    n = 2
    while target.exists():
        target = sub / f"{stem}_{n}{suffix}"
        n += 1
    return target


async def ingest_one(db: Database, catalog: list[dict], archive: Path,
                     f) -> dict:
    """Stream one uploaded .fit/.fits into the archive and record it.

    `f` is a fastapi UploadFile. Only the header block is buffered; the
    remainder is streamed to disk. Returns a per-file result dict.
    """
    name = Path(f.filename or "image.fit").name
    if not name.lower().endswith((".fit", ".fits")):
        return {"file": name, "ok": False, "error": "not a .fit/.fits file"}
    if getattr(f, "size", None) and f.size > MAX_INGEST_BYTES:
        return {"file": name, "ok": False,
                "error": f"file too large (max {MAX_INGEST_BYTES // (1 << 20)} MB)"}

    header = await f.read(HEADER_READ)
    try:
        hdr = fitsio.read_fits_header(header)
    except Exception as exc:  # noqa: BLE001
        return {"file": name, "ok": False,
                "error": f"header parse failed: {exc}"}
    if not hdr:
        return {"file": name, "ok": False,
                "error": "not a FITS file (SIMPLE keyword missing)"}

    stem = Path(name).stem
    hint = str(hdr.get("OBJECT") or "").strip() or stem
    ra_h = fitsio.parse_ra_hours(hdr.get("OBJCTRA") or hdr.get("RA"))
    dec_d = fitsio.parse_dec_deg(hdr.get("OBJCTDEC") or hdr.get("DEC"))
    row = imglib.resolve_object(catalog, hint, ra_h, dec_d)

    if row:
        object_id = row["id"]
        object_name = str(row.get("primary_name") or hint)[:120]
        ra_h, dec_d = row["ra_hours"], row["dec_deg"]
    else:
        object_id = None
        object_name = (str(hdr.get("OBJECT") or "").strip() or stem)[:120]

    exposure = None
    for k in ("EXPTIME", "EXPOSURE", "EXPTIM", "ELAPTIME"):
        v = hdr.get(k)
        if isinstance(v, (int, float)) and v >= 0:
            exposure = float(v)
            break
    date_obs = fitsio.parse_date_obs(hdr.get("DATE-OBS") or hdr.get("DATE"))
    filt = str(hdr.get("FILTER") or "").strip() or None
    tel = str(hdr.get("TELESCOP") or hdr.get("INSTRUME") or "").strip() or None

    try:
        target = _archive_target(archive, name, object_name)
    except OSError:
        return {"file": name, "ok": False,
                "error": f"cannot write to archive folder {archive}"}

    stored = await _stream_to(archive, target, f, header)
    if stored is None:
        target.unlink(missing_ok=True)
        return {"file": name, "ok": False,
                "error": f"file too large (max {MAX_INGEST_BYTES // (1 << 20)} MB)"}

    db.add_image({
        "file": stored, "orig_name": name, "object_id": object_id,
        "object_name": object_name, "ra_hours": ra_h, "dec_deg": dec_d,
        "exposure": exposure, "date_obs": date_obs, "filter": filt,
        "telescope": tel,
        "ingested_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S"),
    })
    return {
        "file": name, "ok": True,
        "object": {"id": object_id, "name": object_name,
                   "designation": imglib.designation_of(
                       row, {"object_name": object_name})},
        "exposure": exposure, "date_obs": date_obs, "filter": filt,
        "telescope": tel, "stored": stored,
    }


async def _stream_to(archive: Path, target: Path, f, first_chunk: bytes) -> str | None:
    """Write first_chunk + the rest of `f` to target, enforcing the size cap.
    Returns the stored path relative to the archive root, or None if the
    file exceeds MAX_INGEST_BYTES."""
    total = len(first_chunk)
    try:
        with open(target, "wb") as out:
            out.write(first_chunk)
            while True:
                chunk = await f.read(_COPY_CHUNK)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_INGEST_BYTES:
                    return None
                out.write(chunk)
    except OSError:
        return None
    return str(target.relative_to(archive))


def rename_archive_folder(archive: Path, old_name: str, new_name: str) -> None:
    """Move <archive>/<old slug> to <archive>/<new slug>, merging if the new
    folder already exists. Failures are silent - the DB rename still works."""
    old = archive / obj_slug(old_name)
    new = archive / obj_slug(new_name)
    if old == new or not old.is_dir():
        return
    try:
        if new.exists():
            for f in old.rglob("*"):
                if f.is_file():
                    rel = f.relative_to(old)
                    dest = new / rel
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    f.replace(dest)
            for d in sorted([p for p in old.rglob("*") if p.is_dir()],
                            key=lambda p: len(p.parts), reverse=True):
                d.rmdir()
            old.rmdir()
        else:
            old.rename(new)
    except OSError:
        pass