"""L6 probe 3: type mapping / display mappings / disambiguation / RAISE behaviour."""
import importlib.util, sys
from collections import Counter
from pathlib import Path

ROOT = Path(r"<workspace>\AstroPilot-local")
spec = importlib.util.spec_from_file_location("bac", ROOT / "scripts/build_adv_catalog.py")
bac = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bac)

# --- 1. adversarial: unmapped type must RAISE (never a galaxy fallback) --------
base = {"Name": "NGC9999", "Type": "WAT", "RA": "12:00:00.00", "Dec": "+10:00:00.0",
        "M": "", "Common names": "", "V-Mag": "", "B-Mag": "", "MajAx": "",
        "MinAx": "", "Identifiers": "", "Const": "Ori"}
try:
    r = bac._build_row(dict(base), "ngc9999", "NGC 9999")
    print("UNMAPPED TYPE: NO RAISE ->", r)
except SystemExit as e:
    print("UNMAPPED TYPE raises SystemExit:", e)
except Exception as e:
    print("UNMAPPED TYPE raised", type(e).__name__, e)

print("'galaxy' fallback present in source:",
      "TYPE_MAP.get(...," in (ROOT / "scripts/build_adv_catalog.py").read_text(encoding="utf-8")
      .replace(" ", "") or 'TYPE_MAP.get(r["Type"],' in (ROOT / "scripts/build_adv_catalog.py").read_text(encoding="utf-8"))

# a row with an unmapped type but NO coordinates still raises (order check)
bad_no_coord = dict(base, RA="", Dec="")
try:
    bac._build_row(bad_no_coord, "ngc9999", "NGC 9999")
    print("unmapped+no-coords: NO RAISE")
except SystemExit:
    print("unmapped+no-coords: raises (type checked before coordinates)")

# --- 2. display mappings on the shipped rows ---------------------------------
rows, counts = bac.build_catalog()
by_id = {r["id"]: r for r in rows}
se = [r for r in rows if r["constellation"] == "Ser"]
print("rows with constellation Ser:", len(se))
raw_se = 0
for path in (ROOT / "data/NGC.csv", ROOT / "data/addendum.csv"):
    for r in bac._load_source(path):
        if r["Const"] in ("Se1", "Se2"):
            raw_se += 1
print("raw rows with Const Se1/Se2:", raw_se)

# Cl+N -> nebula
cln = 0
for path in (ROOT / "data/NGC.csv", ROOT / "data/addendum.csv"):
    for r in bac._load_source(path):
        if r["Type"] == "Cl+N":
            cln += 1
print("raw Cl+N rows:", cln)

# --- 3. disambiguation --------------------------------------------------------
shared = {n for n, c in Counter(r["primary_name"].split(" (")[0] for r in rows).items() if c > 1}
print("display names still shared after disambiguation:", sorted(shared)[:10], len(shared))
appended = [r for r in rows if r["primary_name"].endswith(")") and " (" in r["primary_name"]]
print("rows with an appended designation:", len(appended))
for r in appended[:12]:
    bare = r["primary_name"].rsplit(" (", 1)[0]
    print(f"  {r['id']:<12} {r['primary_name']:<34} bare-in-search={bare.lower() in r['search'].lower()}")
print("messier fallback labels (no common name):",
      sum(1 for r in rows if r["primary_name"] == r["messier"] and r["messier"]))
for oid in ("ngc5457", "ngc4038", "ngc4039", "ngc6611", "ic4703", "ngc6960", "ngc6992"):
    r = by_id.get(oid)
    print(" ", oid, "->", (r["primary_name"] if r else None))

# --- 4. dropped-row provenance ------------------------------------------------
for path in (ROOT / "data/NGC.csv", ROOT / "data/addendum.csv"):
    for r in bac._load_source(path):
        if r["Name"] in ("NGC0651", "NGC0650", "NGC6994", "IC1318") or r["M"].strip() in ("40", "73"):
            print("raw:", r["Name"], "| Type", r["Type"], "| M", r["M"], "| Common", r["Common names"][:40])
