"""Probe: numeric claims in AGENTS.md / README / web copy vs the shipped data."""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]

# the CSV carries two comment lines (the second IS the column list) and is
# ';'-delimited, with no header row of its own
COLS = ["id", "primary_name", "messier", "ngcic", "other", "otype", "ra_hours",
        "dec_deg", "vmag", "size_am", "constellation", "wiki", "blurb", "search"]
lines = (ROOT / "app/data/openned.csv").read_text(encoding="utf-8").splitlines()
rows = list(csv.DictReader(lines[2:], fieldnames=COLS, delimiter=";"))
print("rows:", len(rows))
vm = [float(r["vmag"]) for r in rows if r["vmag"]]
print("with vmag:", len(vm), "faintest:", max(vm))
for cut in (18, 19, 20, 21):
    print(f"  vmag > {cut}: {sum(1 for v in vm if v > cut)}")

pop = (ROOT / "app/popularity_data.py").read_text(encoding="utf-8")
scores = [int(m) for m in re.findall(r":\s*(\d+)\s*[,}]", pop)]
scores = [s for s in scores if s > 0]
scores.sort(reverse=True)
print("popularity scores > 0:", len(scores))
print("  rank 1:", scores[0], " rank 2:", scores[1], " rank 1500:", scores[1499])
print("  scores <= 4:", sum(1 for s in scores if s <= 4))

cat = json.loads((ROOT / "web/catalog.json").read_text(encoding="utf-8"))
top = sorted(cat, key=lambda o: -int(o.get("popularity") or 0))[:3]
print("catalog top 3 by popularity:", [(o["id"], o["popularity"]) for o in top])
print("catalog rows without popularity:", sum(1 for o in cat if not o.get("popularity")))
adv = [o for o in cat if o.get("_adv")]
print("advanced rows:", len(adv), "standard rows:", len(cat) - len(adv))
print("supplement ids present:",
      sorted(o["id"] for o in cat if o["id"] in
             {"abell21", "jones1", "sh2-276", "mel20", "ic1318", "m40", "m73",
              "sh2-101", "sh2-240", "sh2-129", "sh2-308", "sh2-132", "b150",
              "lbn437", "ldn1622", "pipe"}))
