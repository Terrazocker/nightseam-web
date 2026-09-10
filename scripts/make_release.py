"""Build the public release package for the desktop app.

Run AFTER build.ps1 (which produced dist\\NightSeam.exe with the baked
version), from the repo root:

    python scripts/make_release.py

Stages a CLEAN package (exe + LICENSE + NOTICE — never the
developer's own dist\\data) into dist/release/ and writes:

  dist/release/NightSeam-<version>.zip     the distributable
  dist/release/version.json                  version + url + sha256
  dist/release/ns-version.js                 JSONP "window.__NS_RELEASE=..."

The website serves release/ content under /downloads/; the landing page
reads version.json (same origin) and the desktop app's update checker loads
ns-version.js (script tag — CORS-free).
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
EXE = DIST / "NightSeam.exe"
STAGE = DIST / "release"
ZIP_NAME_PREFIX = "NightSeam-"
RELEASE_JS = "ns-version.js"

DOCS = ["LICENSE", "NOTICE"]


def describe():
    # --dirty, like build.ps1's bake: a release built from uncommitted work must
    # not claim a clean tag, or the zip/version.json would disagree with the
    # version the exe inside actually reports
    out = subprocess.run(["git", "describe", "--tags", "--always", "--dirty"],
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
    shutil.copy2(EXE, STAGE / "NightSeam.exe")
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

    # stable name for the landing page's no-JS fallback link (the versioned zip
    # alone cannot be linked from static HTML)
    shutil.copy2(zip_path, STAGE / "NightSeam-latest.zip")

    sha = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    size = zip_path.stat().st_size
    url = f"/downloads/{zip_name}"

    (STAGE / "version.json").write_text(
        json.dumps({"version": version, "url": url, "sha256": sha,
                    "size": size}, indent=2) + "\n", encoding="utf-8")

    payload = json.dumps({"version": version, "url": url})
    (STAGE / RELEASE_JS).write_text(
        f"window.__NS_RELEASE={payload};\n", encoding="utf-8")

    print(f"release: {zip_path} ({size/1e6:.1f} MB)")
    print(f"version: {version}")
    print(f"sha256:  {sha}")
    print(f"stage:   {STAGE}")


if __name__ == "__main__":
    main()