"""L6 probe 7: independent confirmation of the 16 supplement rows in the SHIPPED
csv + DB, the batch-1 OLD-id claim, and the batch-2 empty-vmag rule."""
import sys
from pathlib import Path

ROOT = Path(r"<workspace>\AstroPilot-local")
EV = ROOT / "reviews/0.6.32-full/evidence/catalog"
COLS = ("id", "primary_name", "messier", "ngcic", "other", "otype", "ra_hours",
        "dec_deg", "vmag", "size_am", "constellation", "wiki", "blurb", "search")
shipped = {}
for line in open(ROOT / "app/data/openned.csv", encoding="utf-8"):
    if line.startswith("#") or not line.strip():
        continue
    v = line.rstrip("\n").split(";")
    r = dict(zip(COLS, v))
    shipped[r["id"]] = r

SUPP = ("m40", "m73", "mel20", "ic1318", "sh2-276", "abell21", "jones1",
        "sh2-101", "sh2-129", "sh2-132", "sh2-240", "sh2-308", "b150",
        "lbn437", "ldn1622", "pipe")
BATCH2 = ("sh2-101", "sh2-129", "sh2-132", "sh2-240", "sh2-308", "b150",
          "lbn437", "ldn1622", "pipe")
for oid in SUPP:
    r = shipped.get(oid)
    if r is None:
        print("MISSING", oid); continue
    print(f"{oid:<9} vmag={r['vmag']!r:<6} size={r['size_am']!r:<9} "
          f"otype={r['otype']:<18} wiki={r['wiki']!r} blurb={r['blurb']!r} "
          f"search_has_id={oid in r['search'].lower()}")
print("batch2 all empty vmag:", all(shipped[o]["vmag"] == "" for o in BATCH2))
print("batch1 all non-empty vmag:", all(shipped[o]["vmag"] != "" for o in SUPP if o not in BATCH2))
print("supplement rows with wiki/blurb:", [o for o in SUPP if shipped[o]["wiki"] or shipped[o]["blurb"]])

# batch-1 ids are the OLD curated ids: they must NOT be rewritten by LEGACY_ID_MAP
sys.path.insert(0, str(ROOT))
from app.catalog_data import LEGACY_ID_MAP
print("batch-1 ids in LEGACY_ID_MAP (must be empty):",
      [o for o in SUPP if o in LEGACY_ID_MAP])
print("LEGACY_ID_MAP entries:", len(LEGACY_ID_MAP),
      "| targets present in the csv:",
      sum(1 for v in LEGACY_ID_MAP.values() if v in shipped),
      "| targets MISSING:", [v for v in LEGACY_ID_MAP.values() if v not in shipped])
# any legacy OLD id that is also a shipped id (would make the migration a no-op/wrong)?
print("old ids that are also shipped ids:",
      sorted(k for k in LEGACY_ID_MAP if k in shipped))

# the DB must resolve each supplement id directly (no aliasing)
from app.database import Database
db = Database(EV / "scratch2.db")
for oid in SUPP:
    r = db.get_object(oid)
    assert r and r["primary_name"] == shipped[oid]["primary_name"], oid
print("all 16 supplement ids resolve in the DB with the CSV name: True")
print("db all_objects(advanced=True) len:", len(db.all_objects(advanced=True)))
