#!/usr/bin/env python3
"""NightSeam Web build helpers — run from the NightSeam repo root.

  python web/build_web.py version [--db PATH]   # write web/version.json (git describe)
  python web/build_web.py catalog [--db PATH]   # regenerate web/catalog.json from the DB

The web app is a sub-version of NightSeam: catalog.json is ALWAYS derived
from data/nightseam.db (objects + advanced_objects), and version.json is
stamped from `git describe` right before a deploy (tag BEFORE running
version, exactly like the desktop build bakes _version_baked.py).

Both commands are idempotent. web/version.json is gitignored.
"""
import json
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent   # NightSeam repo root
WEB = ROOT / "web"
DEFAULT_DB = ROOT / "data" / "nightseam.db"

COLS = [
    "id", "primary_name", "messier", "ngcic", "other", "otype",
    "ra_hours", "dec_deg", "vmag", "size_am", "constellation",
    "distance", "wiki", "blurb", "popularity",
]


def parse_args(argv):
    db = DEFAULT_DB
    out = None
    rest = []
    i = 0
    while i < len(argv):
        if argv[i] == "--db" and i + 1 < len(argv):
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
    desc = subprocess.run(
        ["git", "describe", "--tags", "--always"],
        cwd=str(ROOT), capture_output=True, text=True,
    ).stdout.strip()
    if not desc:
        desc = "0.0.0"
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
    if not Path(db_path).is_file():
        raise SystemExit(
            f"no database at {db_path}\n"
            f"  data/nightseam.db is created and seeded on the app's first "
            f"start - run `python main.py` once, or pass --db PATH")
    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    out_rows = []
    for table, adv in (("objects", False), ("advanced_objects", True)):
        # insertion (rowid) order — the committed catalog.json follows the seed order
        rows = con.execute(
            f"SELECT {', '.join(COLS)} FROM {table}").fetchall()
        for r in rows:
            d = {c: r[c] for c in COLS}
            d["_adv"] = adv
            out_rows.append(d)
    con.close()
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