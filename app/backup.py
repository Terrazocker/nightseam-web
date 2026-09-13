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

from .database import Database, finite_or_none
from .paths import data_dir, safe_join, safe_rel
from .version import app_version

APP_VERSION = app_version()


def _finite_records(rows, fields):
    """Rows with non-finite numbers in `fields` nulled out (PY04-F2).

    `json.dumps` writes a bare `Infinity`/`NaN` token for a non-finite float,
    which no strict JSON parser accepts - so a library that already carries
    such a row (however it got there) produced an export that could not be
    re-imported. Emitting NULL for an unusable number keeps the user's own
    export importable and can never restore the corruption."""
    out = []
    for row in rows:
        rec = dict(row)
        for key in fields:
            if key in rec:
                rec[key] = finite_or_none(rec[key])
        out.append(rec)
    return out


def _safe_join(root: Path, rel: str) -> Path | None:
    """Join rel onto root, refusing anything that escapes the root.

    Thin alias of `paths.safe_join` (kept because tests and the export path
    call it by this name); the implementation is shared with the server's
    read/delete routes so both sides of a restore agree on what is safe."""
    return safe_join(root, rel)


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
        "app": "NightSeam",
        "version": APP_VERSION,
        "exported_at": datetime.now(UTC).isoformat(),
        "settings": db.all_settings(),
        "sites": db.sites(),
        "rigs": db.rigs(),
        "panoramas": db.panoramas(),
        "customs": _finite_records(db.customs(), ("ra_hours", "dec_deg", "vmag")),
        "images": _finite_records(db.images(),
                                  ("ra_hours", "dec_deg", "exposure")),
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
    zf = None
    try:
        zf = zipfile.ZipFile(io.BytesIO(blob) if isinstance(blob, bytes)
                             else blob)
        setup = json.loads(_read_member(zf, "setup.json", 64 << 20)
                           .decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        if zf is not None:
            zf.close()
        raise ValueError(f"Not a valid NightSeam export: {exc}") from None
    if setup.get("app") != "NightSeam":
        zf.close()
        raise ValueError("This zip is not a NightSeam setup export")

    safety_path = db.path.with_suffix(".backup-auto.zip")
    # The ZipFile handle must be closed on EVERY path: on Windows an open
    # handle makes the route's spool unlink fail, turning a clean 400 into a
    # 500 (FIX-4 exposes this through the new validation errors).
    try:
        safety = _write_safety_copy(db, safety_path)

        sites = setup.get("sites", [])
        rigs = setup.get("rigs", [])
        panos = setup.get("panoramas", [])
        customs = setup.get("customs", [])
        images = setup.get("images", [])
        settings = setup.get("settings", {})
        if not isinstance(settings, dict):
            raise ValueError("malformed setup bundle")
        # `image_dir` is a FILESYSTEM ROOT, and the bundle is untrusted: taking
        # it from the ZIP let a crafted "setup export" redirect the restore
        # (arbitrary write, arbitrary name/content, mkdir -p) and, via the
        # export path, read any directory the app can reach. The documented
        # behaviour is that the library is restored into the CURRENTLY
        # CONFIGURED archive folder. The replace below wipes the settings
        # table, so the CURRENT value has to be re-injected (dropping the key
        # instead would reset the user's archive to the default) - and the
        # imported value is reported back to the user.
        current_image_dir = db.image_dir()
        imported_image_dir = settings.pop("image_dir", None)
        # ALWAYS re-inject the local value: the replace below wipes the
        # settings table, so simply dropping the key would reset the user's
        # archive folder to the default (and a restore that omits the key
        # would silently move the library into ~/Documents).
        settings["image_dir"] = current_image_dir

        # import_bundle drops records whose stored path escapes its folder and
        # reports how many, so the summary below never over-counts a restore.
        skipped = db.import_bundle(settings, sites, rigs, panos,
                                   customs=customs, images=images) or {}

        pano_files = 0
        pano_root = data_dir() / "panos"
        for p in panos:
            rel = safe_rel(p.get("file"))
            target = safe_join(pano_root, rel) if rel else None
            if target is None:
                continue
            try:
                data = _read_member(zf, f"panos/{rel}")
            except KeyError:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            pano_files += 1

        image_files = 0
        image_dir = Path(db.image_dir())
        image_dir.mkdir(parents=True, exist_ok=True)
        for img in images:
            rel = safe_rel(img.get("file"))
            target = safe_join(image_dir, rel) if rel else None
            if target is None:
                continue
            try:
                data = _read_member(zf, f"library/{rel}")
            except KeyError:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            image_files += 1

        # records whose stored path was rejected are not part of the restored set
        summary = {"ok": True, "sites": len(sites), "rigs": len(rigs),
                   "panoramas": len(panos) - skipped.get("panoramas", 0),
                   "pano_images": pano_files,
                   "customs": len(customs),
                   "images": len(images) - skipped.get("images", 0),
                   "library_files": image_files,
                   "auto_backup": safety}
        if imported_image_dir:
            summary["image_dir_ignored"] = str(imported_image_dir)[:200]
        return summary
    finally:
        zf.close()