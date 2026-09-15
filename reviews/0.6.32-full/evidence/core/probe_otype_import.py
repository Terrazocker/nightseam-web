"""Lane probe (read-only wrt the repo): can an imported setup bundle store an
arbitrary `otype` on a custom target, and does it reach the shipped clients'
type lookups? Uses a scratch DB inside this evidence dir only."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from app.database import Database  # noqa: E402

db = Database(Path(__file__).with_name("_probe.db"))
db.import_bundle({}, [], [], [], customs=[
    {"id": "u_poison", "primary_name": "Poison", "otype": "toString",
     "ra_hours": 5.0, "dec_deg": 20.0},
    {"id": "u_unknown", "primary_name": "Unknown", "otype": "foo",
     "ra_hours": 6.0, "dec_deg": 21.0},
], images=[])
rows = {c["id"]: c for c in db.customs()}
for cid in ("u_poison", "u_unknown"):
    r = rows.get(cid)
    print(cid, "stored otype =", repr(r and r.get("otype")),
          "| search =", repr(r and r.get("search")))
# what the desktop/web clients actually receive (/api/catalog ships all_objects)
shipped = {o["id"]: o for o in db.all_objects(advanced=True)}
print("shipped to /api/catalog:",
      {k: shipped[k]["otype"] for k in ("u_poison", "u_unknown") if k in shipped})
print("is_custom(u_poison):", db.is_custom("u_poison"))
