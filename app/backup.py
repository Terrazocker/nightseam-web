"""Setup export / import as a single ZIP.

Covers settings, sites, rigs, panoramas (with images), custom targets and
the ingested images library (rows + files). Restoring rewrites the stored
files back into the configured image directory.
"""

from __future__ import annotations

import io
import json
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from .database import Database
from .paths import data_dir
from .version import app_version

APP_VERSION = app_version()


def _safe_join(root: Path, rel: str) -> Path | None:
    """Join rel onto root, refusing anything that escapes the root."""
    p = (root / rel).resolve()
    try:
        p.relative_to(root.resolve())
    except ValueError:
        return None
    return p


MAX_MEMBER_BYTES = 1 << 30          # 1 GiB per zip member (same cap as ingest)


def _read_member(zf: zipfile.ZipFile, name: str,
                 limit: int = MAX_MEMBER_BYTES) -> bytes:
    """Read one zip member with a hard size cap.

    `zipfile.read()` materialises a member whole, so one crafted member (a
    deflate bomb) could exhaust RAM even though the upload itself is capped.
    Raises ValueError when the member is too large."""
    info = zf.getinfo(name)          # KeyError -> caller skips the member
    if info.file_size > limit:
        raise ValueError(f"zip member too large: {name}")
    out = bytearray()
    with zf.open(info) as src:
        while True:
            chunk = src.read(1 << 20)
            if not chunk:
                break
            out += chunk
            if len(out) > limit:
                raise ValueError(f"zip member too large: {name}")
    return bytes(out)


def _export_zip_to(db: Database, target) -> int:
    """Write the setup ZIP to any writable file object; returns byte count."""
    setup = {
        "app": "AstroPilot",
        "version": APP_VERSION,
        "exported_at": datetime.now(UTC).isoformat(),
        "settings": db.all_settings(),
        "sites": db.sites(),
        "rigs": db.rigs(),
        "panoramas": db.panoramas(),
        "customs": db.customs(),
        "images": db.images(),
    }
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("setup.json", json.dumps(setup, indent=1))
        for p in setup["panoramas"]:
            f = _safe_join(data_dir() / "panos", p["file"])
            if f and f.is_file():
                z.write(f, f"panos/{p['file']}")
        image_dir = Path(db.image_dir())
        for img in setup["images"]:
            src = _safe_join(image_dir, img["file"])
            if src and src.is_file():
                z.write(src, f"library/{img['file']}")
    return target.tell()


def build_export_zip(db: Database) -> bytes:
    """The setup ZIP as bytes (kept for the HTTP download + tests)."""
    buf = io.BytesIO()
    _export_zip_to(db, buf)
    return buf.getvalue()


def _write_safety_copy(db: Database, dest: Path) -> str | None:
    """Best-effort streaming safety copy of the CURRENT setup to `dest`.

    Streams the ZIP straight to disk (never a second full copy in RAM), so
    even a multi-GB image library cannot double the import's memory peak.
    Returns the path string on success, None on any failure."""
    try:
        with open(dest, "wb") as f:
            _export_zip_to(db, f)
        return str(dest)
    except Exception:  # noqa: BLE001 - best-effort safety net
        return None


def apply_import_zip(db: Database, blob: bytes | Path) -> dict:
    """Replace all user data from an exported ZIP. Raises ValueError on
    malformed input. Returns a summary dict.

    `blob` may be raw zipped bytes or a path to a zip file on disk (the
    server spools large uploads to a temp file so the whole import never
    has to live in RAM twice).

    Before touching anything, the CURRENT setup is written to
    ``<db>.backup-auto.zip`` next to the database, so an interrupted or
    failed restore never destroys the pre-import data (it can be re-imported
    manually). The safety copy is best-effort: a failure to write it must
    not block the user's deliberate restore."""
    try:
        zf = zipfile.ZipFile(io.BytesIO(blob) if isinstance(blob, bytes)
                             else blob)
        setup = json.loads(_read_member(zf, "setup.json", 64 << 20)
                           .decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Not a valid AstroPilot export: {exc}") from None
    if setup.get("app") != "AstroPilot":
        raise ValueError("This zip is not an AstroPilot setup export")

    safety_path = db.path.with_suffix(".backup-auto.zip")
    safety = _write_safety_copy(db, safety_path)

    sites = setup.get("sites", [])
    rigs = setup.get("rigs", [])
    panos = setup.get("panoramas", [])
    customs = setup.get("customs", [])
    images = setup.get("images", [])
    settings = setup.get("settings", {})

    db.import_bundle(settings, sites, rigs, panos, customs=customs,
                     images=images)

    pano_files = 0
    for p in panos:
        name = p.get("file")
        if not name or _safe_join(data_dir() / "panos", name) is None:
            continue
        try:
            data = _read_member(zf, f"panos/{name}")
        except KeyError:
            continue
        (data_dir() / "panos" / name).write_bytes(data)
        pano_files += 1

    image_files = 0
    image_dir = Path(db.image_dir())
    image_dir.mkdir(parents=True, exist_ok=True)
    for img in images:
        rel = img.get("file")
        if not rel or _safe_join(image_dir, rel) is None:
            continue
        try:
            data = _read_member(zf, f"library/{rel}")
        except KeyError:
            continue
        target = _safe_join(image_dir, rel)
        if target is None:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        image_files += 1

    return {"ok": True, "sites": len(sites), "rigs": len(rigs),
            "panoramas": len(panos), "pano_images": pano_files,
            "customs": len(customs), "images": len(images),
            "library_files": image_files,
            "auto_backup": safety}