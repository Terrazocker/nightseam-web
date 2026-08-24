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


def build_export_zip(db: Database) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
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
    return buf.getvalue()


def apply_import_zip(db: Database, blob: bytes) -> dict:
    """Replace all user data from an exported ZIP. Raises ValueError on
    malformed input. Returns a summary dict."""
    try:
        zf = zipfile.ZipFile(io.BytesIO(blob))
        setup = json.loads(zf.read("setup.json").decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Not a valid AstroPilot export: {exc}") from None
    if setup.get("app") != "AstroPilot":
        raise ValueError("This zip is not an AstroPilot setup export")

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
            data = zf.read(f"panos/{name}")
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
            data = zf.read(f"library/{rel}")
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
            "library_files": image_files}