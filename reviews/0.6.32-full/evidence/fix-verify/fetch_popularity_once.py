"""ONE-TIME the popularity source snapshot fetch (run once, then never again).

Downloads the live popularity JSON, writes it next to the existing cache as
`data/popularity_snapshot.json.fetched`, and reports how it differs from the
`data/popularity_snapshot.json` the shipped popularity was derived from.

Nothing is overwritten here: the comparison decides whether the derived module
needs regenerating.
"""

from __future__ import annotations

import json
import ssl
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
URL = "https://popularity-source.invalid/"
CACHE = ROOT / "data" / "popularity_snapshot.json"
FRESH = ROOT / "data" / "popularity_snapshot.json.fetched"


def fetch() -> dict:
    req = urllib.request.Request(
        URL, headers={"User-Agent": "Mozilla/5.0 (compatible; NightSeam/1.0)"})
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=60, context=ctx) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        print(f"  default SSL failed ({exc}); retrying relaxed")
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(req, timeout=60, context=ctx) as r:
            return json.loads(r.read().decode("utf-8"))


def main() -> int:
    data = fetch()
    FRESH.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")),
                     encoding="utf-8")
    print(f"fetched entries      : {len(data)}")
    print(f"fetched bytes (json) : {FRESH.stat().st_size:,}")
    print(f"fetched bytes (raw)  : see file")

    if not CACHE.is_file():
        print("no existing cache to compare")
        return 0
    old = json.loads(CACHE.read_text(encoding="utf-8"))
    print(f"existing cache entries: {len(old)}")
    old_keys, new_keys = set(old), set(data)
    added = new_keys - old_keys
    removed = old_keys - new_keys
    changed = [k for k in (old_keys & new_keys) if old[k] != data[k]]
    print(f"added   : {len(added)}")
    print(f"removed : {len(removed)}")
    print(f"changed : {len(changed)}")
    if added:
        print("  sample added  :", sorted(added)[:4])
    if removed:
        print("  sample removed:", sorted(removed)[:4])
    if changed:
        print("  sample changed:", [(k, old[k], data[k]) for k in sorted(changed)[:4]])
    print("IDENTICAL" if not (added or removed or changed) else "DIFFERS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
