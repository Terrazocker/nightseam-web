"""Build the public release package for the desktop app.

Run AFTER build.ps1 (which produced dist\\AstroPilot.exe with the baked
version), from the repo root:

    python scripts/make_release.py

Stages a CLEAN package (exe + LICENSE + NOTICE + README — never the
developer's own dist\\data) into dist/release/ and writes:

  dist/release/AstroPilot-<version>.zip     the distributable
  dist/release/version.json                  version + url + sha256
  dist/release/ap-version.js                 JSONP "window.__AP_RELEASE=..."

The website serves release/ content under /downloads/; the landing page
reads version.json (same origin) and the desktop app's update checker loads
ap-version.js (script tag — CORS-free).
"""
import hashlib
import json
import os
import shutil
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
EXE = DIST / "AstroPilot.exe"
STAGE = DIST / "release"
ZIP_NAME_PREFIX = "AstroPilot-"

DOCS = ["LICENSE", "NOTICE"]


def describe():
    out = subprocess.run(["git", "describe", "--tags", "--always"],
                         cwd=str(ROOT), capture_output=True, text=True).stdout.strip()
    return out.lstrip("v") or "0.0.0"


def main():
    if not EXE.is_file():
        raise SystemExit(f"missing {EXE} — run build.ps1 first")
    version = describe()

    # fresh stage
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)

    # copy the executable + docs
    shutil.copy2(EXE, STAGE / "AstroPilot.exe")
    for doc in DOCS:
        src = ROOT / doc
        if src.is_file():
            shutil.copy2(src, STAGE / src.name)

    # zip (exe + docs only — the app creates its own data/ on first run)
    zip_name = f"{ZIP_NAME_PREFIX}{version}.zip"
    zip_path = STAGE / zip_name
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(STAGE.iterdir()):
            if f.name == zip_name:
                continue
            zf.write(f, arcname=f.name)

    sha = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    size = zip_path.stat().st_size
    url = f"/downloads/{zip_name}"

    (STAGE / "version.json").write_text(
        json.dumps({"version": version, "url": url, "sha256": sha,
                    "size": size}, indent=2) + "\n", encoding="utf-8")

    (STAGE / "ap-version.js").write_text(
        "window.__AP_RELEASE=" + json.dumps({"version": version, "url": url}) +
        ";\n", encoding="utf-8")

    print(f"release: {zip_path} ({size/1e6:.1f} MB)")
    print(f"version: {version}")
    print(f"sha256:  {sha}")
    print(f"stage:   {STAGE}")


if __name__ == "__main__":
    main()