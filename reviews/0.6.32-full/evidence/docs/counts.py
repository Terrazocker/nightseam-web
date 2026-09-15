"""Probe: counts claimed by the docs vs the shipped artifacts."""
import ast
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]


def rows(p):
    with open(ROOT / p, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter=";"))


for p in ("data/NGC.csv", "data/addendum.csv",
          "app/data/supplement.csv"):
    print(f"{p}: {len(rows(p))} rows")

src = (ROOT / "app/popularity_data.py").read_text(encoding="utf-8")
mod = ast.parse(src)
for n in mod.body:
    if isinstance(n, ast.Assign) and isinstance(n.value, (ast.Dict, ast.List, ast.Tuple)):
        name = getattr(n.targets[0], "id", "?")
        size = len(n.value.keys) if isinstance(n.value, ast.Dict) else len(n.value.elts)
        print(f"popularity_data.{name}: {size} entries")

cat = json.loads((ROOT / "web/catalog.json").read_text(encoding="utf-8"))
print("web/catalog.json objects:", len(cat))
adv = sum(1 for o in cat if str(o.get("_adv", "")).lower() in ("1", "true"))
print("web/catalog.json _adv rows:", adv)

cs = (ROOT / "app/catalog_data.py").read_text(encoding="utf-8")
m = re.search(r"STANDARD_TOP_N\s*=\s*(\d+)", cs)
print("catalog_data.STANDARD_TOP_N:", m.group(1) if m else "NOT FOUND")

man = json.loads((ROOT / "core/core.manifest.json").read_text(encoding="utf-8"))
print("core manifest keys:", list(man)[:8])
