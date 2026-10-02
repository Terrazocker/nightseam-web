#!/usr/bin/env python3
"""Independent NightSeam Web build helpers.

  python web/build_web.py version
  python web/build_web.py catalog [--catalog PATH] [--out PATH]

The catalog is built directly from committed CSV, supplement and popularity
data, without a desktop install or SQLite. Version uses this repo's truthful
git describe --tags --always --dirty result. web/version.json is gitignored.
"""
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent   # NightSeam repo root
WEB = ROOT / "web"
DEFAULT_CATALOG = ROOT / "catalog_data" / "data" / "openned.csv"
sys.path.insert(0, str(ROOT))
from catalog_data.loader import web_rows

COLS = [
    "id", "primary_name", "messier", "ngcic", "other", "otype",
    "ra_hours", "dec_deg", "vmag", "size_am", "constellation",
    "wiki", "blurb", "search", "popularity",
]


def parse_args(argv):
    db = DEFAULT_CATALOG
    out = None
    rest = []
    i = 0
    while i < len(argv):
        if argv[i] == "--catalog" and i + 1 < len(argv):
            db = Path(argv[i + 1])
            i += 2
        elif argv[i] == "--out" and i + 1 < len(argv):
            out = Path(argv[i + 1])
            i += 2
        else:
            rest.append(argv[i])
            i += 1
    return rest, db, out


def cmd_version(db_path):
    # The ONE authoritative version, with --dirty like build.ps1's bake and
    # scripts/make_release.py: a web build from uncommitted work must not
    # advertise a clean tag while the exe/zip say "-dirty".
    proc = subprocess.run(
        ["git", "describe", "--tags", "--always", "--dirty"],
        cwd=str(ROOT), capture_output=True, text=True,
    )
    desc = proc.stdout.strip()
    if proc.returncode != 0 or not desc:
        detail = proc.stderr.strip() or "no output"
        raise SystemExit(
            f"git describe --tags --always --dirty failed (exit "
            f"{proc.returncode}): {detail} - refusing to stamp a guessed "
            f"version into web/version.json")
    version = desc.lstrip("v")
    data = {
        "version": version,
        "describe": desc,
        "built": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    WEB.mkdir(exist_ok=True)
    (WEB / "version.json").write_text(
        json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"{WEB / 'version.json'}: NightSeam Web {version} ({desc})")


def cmd_catalog(db_path, out=None):
    try:
        out_rows = web_rows(Path(db_path))
    except (OSError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc
    target = out or (WEB / "catalog.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(out_rows, separators=(",", ":")), encoding="utf-8")
    print(f"{target}: {len(out_rows)} objects (main {sum(1 for o in out_rows if not o['_adv'])}, "
          f"advanced {sum(1 for o in out_rows if o['_adv'])})")


if __name__ == "__main__":
    rest, db, out = parse_args(sys.argv[1:])
    cmd = rest[0] if rest else ""
    if cmd == "version":
        cmd_version(db)
    elif cmd == "catalog":
        cmd_catalog(db, out)
    else:
        print(__doc__)
        sys.exit(1)
