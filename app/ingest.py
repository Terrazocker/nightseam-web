"""Image archive ingest: parse FITS headers, resolve objects, store files.

Files are streamed to the archive (only the header is buffered in memory)
and capped at MAX_INGEST_BYTES so an oversized upload cannot exhaust RAM
or disk.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from pathlib import Path

from . import fits as fitsio
from . import imglib
from .database import Database

log = logging.getLogger(__name__)

MAX_INGEST_BYTES = 1 << 30          # 1 GiB per file
HEADER_READ = 1_500_000             # fits._MAX_BLOCKS blocks ~= 1.47 MB
_COPY_CHUNK = 1 << 16               # 64 KB streaming buffer


def obj_slug(object_name: str) -> str:
    return re.sub(r"[^A-Za-z0-9 _-]+", "", object_name).strip() or "misc"


FRAME_TYPES = {          # normalized IMAGETYP -> archive subfolder
    "light": "lights", "bias": "bias", "dark": "darks", "flat": "flats",
}
FRAME_DIRS = {v: k for k, v in FRAME_TYPES.items()}   # subfolder -> type


def classify_frame(imagetyp: str | None) -> str:
    """Normalize a FITS IMAGETYP value into 'light'/'bias'/'dark'/'flat'.

    Handles the multi-word spellings capture software writes ("Dark Frame",
    "Flat Field", "Bias Frame") as well as the single-word ones."""
    t = re.sub(r"[^a-z]", "", str(imagetyp or "").lower())
    if t in ("", "l", "science") or t.startswith("light"):
        return "light"
    if t.startswith(("bias", "zero")):
        return "bias"
    if t.startswith("dark"):
        return "dark"
    if t.startswith("flat") or t.startswith("skyflat"):
        return "flat"
    return "light"          # unknown types default to lights


def session_folder_name(epoch: float | None) -> str:
    """On-disk session folder: 'YYYY-MM-DD_HHMM' in the machine-local zone,
    or 'undated' for frames without a parseable DATE-OBS."""
    if epoch is None:
        return "undated"
    return datetime.fromtimestamp(epoch).strftime("%Y-%m-%d_%H%M")


def _session_dir(db: Database, archive: Path, slug: str, object_id,
                 object_name: str, date_obs: str | None,
                 session_override: str | None = None) -> Path:
    """<archive>/<slug>/<session>/ - the session the frame joins (mirrors
    imglib.compute_sessions), so different nights get different folders.
    An explicit `session` upload target (calibration buttons) wins."""
    if session_override:
        return archive / slug / session_override
    existing = [i for i in db.images()
                if (object_id is not None and i["object_id"] == object_id)
                or (object_id is None and i["object_name"] == object_name)]
    joined = imglib.session_for_image(existing, {"date_obs": date_obs})
    start = imglib.date_epoch(joined.get("start")) if joined else None
    return archive / slug / session_folder_name(start)


def _archive_target(archive: Path, name: str, slug: str,
                    session: Path, frame: str) -> Path:
    """Unique destination <archive>/<slug>/<session>/<frames>/<stem>..."""
    suffix = Path(name).suffix or ".fit"
    stem = (Path(name).stem or "image")[:80]
    sub = session / FRAME_TYPES.get(frame, "lights")
    sub.mkdir(parents=True, exist_ok=True)
    for t in FRAME_TYPES.values():      # keep all four frame folders beside it
        (session / t).mkdir(parents=True, exist_ok=True)
    target = sub / f"{stem}{suffix}"
    n = 2
    while target.exists():
        target = sub / f"{stem}_{n}{suffix}"
        n += 1
    return target


async def ingest_one(db: Database, catalog: list[dict], archive: Path,
                     f, frame_override: str | None = None,
                     session_override: str | None = None) -> dict:
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
    frame = classify_frame(hdr.get("IMAGETYP"))
    forced = (frame_override or "").strip().lower()
    if forced in FRAME_TYPES:           # explicit upload target wins
        frame = forced

    try:
        slug = obj_slug(object_name)
        session = _session_dir(db, archive, slug, object_id,
                               object_name, date_obs, session_override)
        target = _archive_target(archive, name, slug, session, frame)
    except OSError:
        return {"file": name, "ok": False,
                "error": f"cannot write to archive folder {archive}"}

    try:
        stored = await _stream_to(archive, target, f, header)
    except OSError as exc:
        target.unlink(missing_ok=True)
        log.warning("ingest: cannot write %s: %s", target, exc)
        return {"file": name, "ok": False,
                "error": f"could not write to the archive: {exc.strerror or exc}"}
    if stored is None:
        target.unlink(missing_ok=True)
        return {"file": name, "ok": False,
                "error": f"file too large (max {MAX_INGEST_BYTES // (1 << 20)} MB)"}

    db.add_image({
        "file": stored, "orig_name": name, "object_id": object_id,
        "object_name": object_name, "ra_hours": ra_h, "dec_deg": dec_d,
        "exposure": exposure, "date_obs": date_obs, "filter": filt,
        "telescope": tel, "imagetyp": frame,
        "ingested_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S"),
    })
    return {
        "file": name, "ok": True,
        "object": {"id": object_id, "name": object_name,
                   "designation": imglib.designation_of(
                       row, {"object_name": object_name})},
        "exposure": exposure, "date_obs": date_obs, "filter": filt,
        "telescope": tel, "imagetyp": frame, "stored": stored,
    }


async def _stream_to(archive: Path, target: Path, f, first_chunk: bytes) -> str | None:
    """Write first_chunk + the rest of `f` to target, enforcing the size cap.
    Returns the stored path relative to the archive root, or None if the file
    exceeds MAX_INGEST_BYTES. An OSError (disk full, permissions, locked file)
    propagates, so the caller can report the real cause instead of blaming the
    size cap."""
    total = len(first_chunk)
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
    return str(target.relative_to(archive)).replace("\\", "/")


def rename_archive_folder(archive: Path, old_name: str, new_name: str) -> bool:
    """Move <archive>/<old slug> to <archive>/<new slug>, merging if the new
    folder already exists. Returns False when the move could not be completed -
    the caller must then NOT rewrite the stored paths, or every frame of the
    group would point at a folder that does not exist."""
    old = archive / obj_slug(old_name)
    new = archive / obj_slug(new_name)
    if old == new or not old.is_dir():
        return True
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
    except OSError as exc:
        log.warning("rename: could not move %s -> %s: %s", old, new, exc)
        return False
    return True


def _norm_rel(rel) -> str:
    """Normalized relative path for dedup - separator- and case-insensitive."""
    return str(rel).replace("\\", "/").lower()


def reindex_library(db: Database, archive: Path) -> dict:
    """Scan the archive folder and record .fit/.fits files not yet in the DB.

    Covers files placed on disk outside the app (manual copies, restored
    backups, imports from other tools). Files already recorded are skipped
    (matched on the normalized relative path). The frame type comes from the
    standard sub-folder when present (lights/darks/flats/bias), else from the
    FITS IMAGETYP header; the object is resolved from the header (OBJECT +
    coordinates) with the folder name as fallback.
    """
    if not archive.is_dir():
        return {"found": 0, "added": 0, "skipped": 0, "failed": 0}
    known = {_norm_rel(r["file"]) for r in db.images()}
    catalog = db.all_objects(advanced=True)
    found = added = skipped = failed = 0

    def candidate_files():
        for p in archive.rglob("*"):
            if p.is_file() and p.suffix.lower() in (".fit", ".fits"):
                yield p

    for f in sorted(candidate_files()):
        found += 1
        rel = f.relative_to(archive)
        if _norm_rel(rel) in known:
            skipped += 1
            continue

        parts = rel.parts
        frame_dir = (parts[-2] if len(parts) >= 2 and parts[-2] in FRAME_DIRS
                     else None)
        folder_frame = frame_dir
        # The OBJECT is the folder above the session, never the session folder
        # itself: <archive>/<Object>/<session>/<frame>/f.fit -> parts[-4], and
        # for the older <archive>/<Object>/<frame>/f.fit layout -> parts[-3].
        if frame_dir is not None:
            folder_name = (parts[-4] if len(parts) >= 4
                           else parts[-3] if len(parts) >= 3 else None)
        else:
            folder_name = parts[-2] if len(parts) >= 2 else None
        try:
            with open(f, "rb") as fh:
                hdr = fitsio.read_fits_header(fh.read(HEADER_READ))
            if not hdr:
                failed += 1
                continue
        except OSError:
            failed += 1
            continue

        stem = f.stem
        hint = (folder_name or "").strip() or str(hdr.get("OBJECT") or "").strip() or stem
        ra_h = fitsio.parse_ra_hours(hdr.get("OBJCTRA") or hdr.get("RA"))
        dec_d = fitsio.parse_dec_deg(hdr.get("OBJCTDEC") or hdr.get("DEC"))
        row = imglib.resolve_object(catalog, hint, ra_h, dec_d)
        if row is None and str(hdr.get("OBJECT") or "").strip() not in ("", hint):
            row = imglib.resolve_object(
                catalog, str(hdr.get("OBJECT") or "").strip(), ra_h, dec_d)

        if row:
            object_id = row["id"]
            object_name = str(row.get("primary_name") or hint)[:120]
            ra_h, dec_d = row["ra_hours"], row["dec_deg"]
        else:
            object_id = None
            object_name = (folder_name or
                           str(hdr.get("OBJECT") or "").strip() or stem)[:120]

        exposure = None
        for k in ("EXPTIME", "EXPOSURE", "EXPTIM", "ELAPTIME"):
            v = hdr.get(k)
            if isinstance(v, (int, float)) and v >= 0:
                exposure = float(v)
                break
        frame = (FRAME_DIRS[folder_frame] if folder_frame
                 else classify_frame(hdr.get("IMAGETYP")))
        db.add_image({
            "file": str(rel).replace("\\", "/"),   # forward slashes
            "orig_name": f.name, "object_id": object_id,
            "object_name": object_name, "ra_hours": ra_h, "dec_deg": dec_d,
            "exposure": exposure,
            "date_obs": fitsio.parse_date_obs(hdr.get("DATE-OBS") or hdr.get("DATE")),
            "filter": str(hdr.get("FILTER") or "").strip() or None,
            "telescope": str(hdr.get("TELESCOP") or hdr.get("INSTRUME") or "").strip() or None,
            "imagetyp": frame,
            "ingested_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S"),
        })
        added += 1

    return {"found": found, "added": added, "skipped": skipped, "failed": failed}