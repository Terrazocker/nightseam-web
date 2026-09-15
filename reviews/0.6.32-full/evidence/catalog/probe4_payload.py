"""L6 probe 4: scratch DB -> `web/build_web.py catalog --out` -> byte compare.
Also confirms the CLI's default target is the shipped file and that a scratch
DB re-seeds both tables from the CSV."""
import hashlib, json, sqlite3, subprocess, sys
from pathlib import Path

ROOT = Path(r"<workspace>\AstroPilot-local")
EV = ROOT / "reviews/0.6.32-full/evidence/catalog"
EV.mkdir(parents=True, exist_ok=True)
DB = EV / "scratch.db"
OUT = EV / "catalog.regen.json"
for p in (DB, OUT):
    if p.exists():
        p.unlink()

sys.path.insert(0, str(ROOT))
from app.database import Database
db = Database(DB)
print("scratch db:", DB, "exists", DB.is_file())
con = sqlite3.connect(str(DB))
print("objects:", con.execute("SELECT COUNT(*) FROM objects").fetchone()[0],
      "advanced:", con.execute("SELECT COUNT(*) FROM advanced_objects").fetchone()[0],
      "sum:", con.execute("SELECT (SELECT COUNT(*) FROM objects)"
                          "+(SELECT COUNT(*) FROM advanced_objects)").fetchone()[0])
print("scored objects rows:", con.execute(
    "SELECT COUNT(*) FROM objects WHERE popularity>0").fetchone()[0])
print("unscored objects rows:", con.execute(
    "SELECT COUNT(*) FROM objects WHERE popularity=0").fetchone()[0])
# global id uniqueness across the two tables together
dup = con.execute(
    "SELECT id, COUNT(*) c FROM (SELECT id FROM objects UNION ALL "
    "SELECT id FROM advanced_objects) GROUP BY id HAVING c>1").fetchall()
print("cross-table duplicate ids:", dup[:5], "count", len(dup))
# columns of the seeded tables
print("objects cols:", [r[1] for r in con.execute("PRAGMA table_info(objects)")])
con.close()

subprocess.run([sys.executable, "web/build_web.py", "catalog", "--db", str(DB),
                "--out", str(OUT)], cwd=str(ROOT), check=True)
a = (ROOT / "web/catalog.json").read_bytes()
b = OUT.read_bytes()
print("shipped sha256:", hashlib.sha256(a).hexdigest(), len(a))
print("regen   sha256:", hashlib.sha256(b).hexdigest(), len(b))
print("BYTE IDENTICAL:", a == b)
