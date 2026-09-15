"""Lane probe: does the web's core/catalog.js::searchBlob cover the SERVER's
`search` column (what the desktop filter matches on)? Uses a scratch DB in this
evidence dir only. Read-only wrt the repo."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from app.database import Database  # noqa: E402

db = Database(Path(__file__).with_name("_search.db"))
rows = db.all_objects(advanced=True)
blob_path = ROOT / "web" / "catalog.json"
payload = {r["id"]: r for r in json.loads(blob_path.read_text(encoding="utf-8"))}

# node prints the web blob for every payload row, one JSON array
import subprocess  # noqa: E402

script = (
    "import{searchBlob}from'file:///" + str(ROOT / "core" / "catalog.js").replace("\\", "/")
    + "';import{readFileSync}from'node:fs';"
    "const rows=JSON.parse(readFileSync(process.argv[2],'utf8'));"
    "process.stdout.write(JSON.stringify(rows.map(o=>searchBlob(o))));"
)
out = subprocess.run(["node", "--input-type=module", "-e", script, str(blob_path)],
                     capture_output=True, text=True, check=True)
blobs = dict(zip(payload, json.loads(out.stdout)))

missing = []
for r in rows:
    oid = r["id"]
    web = blobs.get(oid, "")
    for tok in str(r.get("search") or "").split("|"):
        tok = tok.strip().lower()
        if tok and tok not in web and len(tok) > 2:
            missing.append((oid, tok, r.get("search"), web[:70]))
print("rows in DB:", len(rows), "payload rows:", len(payload))
print("search tokens absent from the web blob:", len(missing))
for m in missing[:8]:
    print("   ", m)
