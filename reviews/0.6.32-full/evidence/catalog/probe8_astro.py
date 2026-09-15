"""L6 probe 8: supplement astrometry sanity + dropped-row cross-checks."""
import math
from pathlib import Path

ROOT = Path(r"<workspace>\AstroPilot-local")
COLS = ("id", "primary_name", "messier", "ngcic", "other", "otype", "ra_hours",
        "dec_deg", "vmag", "size_am", "constellation", "wiki", "blurb", "search")
rows = {}
for line in open(ROOT / "app/data/openned.csv", encoding="utf-8"):
    if line.startswith("#") or not line.strip():
        continue
    r = dict(zip(COLS, line.rstrip("\n").split(";")))
    rows[r["id"]] = r


def sep(a, b):
    ra1, d1 = math.radians(float(a["ra_hours"]) * 15), math.radians(float(a["dec_deg"]))
    ra2, d2 = math.radians(float(b["ra_hours"]) * 15), math.radians(float(b["dec_deg"]))
    return math.degrees(math.acos(max(-1, min(1, math.sin(d1) * math.sin(d2) +
                math.cos(d1) * math.cos(d2) * math.cos(ra1 - ra2)))))


pairs = [("ic1318", "ngc6910"), ("ic1318", "ngc6888"), ("sh2-276", "ngc1976"),
         ("sh2-101", "ngc6888"), ("b150", "ngc7023"), ("ldn1622", "ngc2024"),
         ("abell21", "ngc6853"), ("pipe", "ngc6523"), ("sh2-308", "ngc2359"),
         ("sh2-240", "ngc1952"), ("m40", "ngc2632"), ("jones1", "ngc6543")]
for a, b in pairs:
    if a in rows and b in rows:
        print(f"{a:<9} vs {b:<9} separation {sep(rows[a], rows[b]):6.2f} deg")
    else:
        print(a, b, "missing")

print()
NEEDLES = {
    "ic1318": ["sadr", "butterfly"], "sh2-276": ["barnard"], "lbn437": ["lbn", "dg 187"],
    "pipe": ["ldn 1773"], "b150": ["barnard 150"],
}
for oid, needles in NEEDLES.items():
    blob = rows[oid]["search"].lower()
    print(oid, "->", {n: (n in blob) for n in needles})

print()
for oid in ("m40", "m73", "mel20", "ic1318", "sh2-276", "abell21", "jones1",
            "sh2-101", "sh2-129", "sh2-132", "sh2-240", "sh2-308", "b150",
            "lbn437", "ldn1622", "pipe"):
    r = rows[oid]
    print(f"{oid:<9} {r['constellation']:<4} RA {float(r['ra_hours']):7.3f}h "
          f"Dec {float(r['dec_deg']):8.3f} size {r['size_am']:<9} {r['primary_name']}")

# the three OpenNGC non-object rows that return as supplement rows
import importlib.util
spec = importlib.util.spec_from_file_location("bac", ROOT / "scripts/build_adv_catalog.py")
bac = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bac)
for path in (ROOT / "data/NGC.csv", ROOT / "data/addendum.csv"):
    for r in bac._load_source(path):
        if r["Name"] in ("NGC0651", "NGC6994", "IC1318", "NGC0650") or r["M"].strip() in ("40", "73"):
            print("OpenNGC raw:", r["Name"], "| Type", r["Type"], "| M", r["M"],
                  "| RA", r["RA"], "| Dec", r["Dec"], "| Common", r["Common names"][:30])
