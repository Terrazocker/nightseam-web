"""Review-only probe (L8): does a pre-existing junction/symlink inside
data/panos let an imported panorama record escape the folder?

Uses an NTFS directory JUNCTION (mklink /J needs no admin). Scratch only.
Run: python reviews/0.6.32-full/evidence/security/link_escape_probe.py
"""
from __future__ import annotations

import io
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

import app.backup as backup                                      # noqa: E402
from app.backup import apply_import_zip                          # noqa: E402
from app.database import Database                                # noqa: E402
from app.paths import safe_join, safe_rel                        # noqa: E402

SCRATCH = ROOT / "logs" / "review-l8-link"
if SCRATCH.exists():
    shutil.rmtree(SCRATCH, ignore_errors=True)
PANOS = SCRATCH / "data" / "panos"
PANOS.mkdir(parents=True)
OUTSIDE = SCRATCH / "OUTSIDE"
OUTSIDE.mkdir()

link = PANOS / "escape"
made = subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(OUTSIDE)],
                      capture_output=True, text=True)
created = link.exists() and (link / "..").resolve() != (PANOS / "..").resolve()

results = {
    "junction_created": created,
    "mklink_out": (made.stdout or made.stderr).strip()[:160],
    "safe_rel": repr(safe_rel("escape/pwned.jpg")),
    "safe_join_through_junction": str(safe_join(PANOS, "escape/pwned.jpg")),
}

setup = {"app": "NightSeam", "settings": {}, "sites": [], "rigs": [],
         "panoramas": [{"id": "p1", "name": "P", "file": "escape/pwned.jpg"}],
         "customs": [], "images": []}
out = io.BytesIO()
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("setup.json", json.dumps(setup))
    zf.writestr("panos/escape/pwned.jpg", b"PWNED")

db = Database(SCRATCH / "d.db")
db.set_setting("image_dir", str(SCRATCH / "archive"))
with patch.object(backup, "data_dir", lambda: SCRATCH / "data"):
    summary = apply_import_zip(db, out.getvalue())

results["summary"] = summary
results["rows"] = [p["file"] for p in db.panoramas()]
results["escaped_file_exists"] = (OUTSIDE / "pwned.jpg").exists()
results["outside_listing"] = sorted(p.name for p in OUTSIDE.glob("*"))

print(json.dumps(results, indent=1))
