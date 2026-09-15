"""Lane probe step 1: dump the DB `search` column for every catalog row to a
scratch JSON next to this file (scratch DB + JSON live in this evidence dir)."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from app.database import Database  # noqa: E402

here = Path(__file__).with_name("_search.db")
db = Database(here)
rows = db.all_objects(advanced=True)
out = Path(__file__).with_name("_search_col.json")
out.write_text(json.dumps({r["id"]: r.get("search") or "" for r in rows}), encoding="utf-8")
print("rows in DB:", len(rows), "->", out.name)
