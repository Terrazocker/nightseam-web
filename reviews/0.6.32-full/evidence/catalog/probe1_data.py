"""L6 probe 1: shipped CSV + popularity + standard split + hygiene."""
import csv, json, re, sys, unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(r"<workspace>\AstroPilot-local")
COLS = ("id", "primary_name", "messier", "ngcic", "other", "otype", "ra_hours",
        "dec_deg", "vmag", "size_am", "constellation", "wiki", "blurb", "search")
TOKEN = re.compile(r"[a-z0-9][a-z0-9_-]{0,63}")

raw_lines = []
with open(ROOT / "app/data/openned.csv", encoding="utf-8") as f:
    for line in f:
        if line.startswith("#") or not line.strip():
            continue
        raw_lines.append(line.rstrip("\n"))
print("data rows:", len(raw_lines))
badlen = [i for i, l in enumerate(raw_lines) if len(l.split(";")) != 14]
print("rows whose naive ';' split is not 14 fields:", len(badlen), badlen[:5])
print("rows containing a double quote:", sum(1 for l in raw_lines if '"' in l))
print("rows ending in \\r:", sum(1 for l in raw_lines if l.endswith("\r")))

# semicolons *inside* fields per the real csv parser
with open(ROOT / "app/data/openned.csv", encoding="utf-8", newline="") as f:
    rdr = csv.reader((l for l in f if not l.startswith("#")), delimiter=";")
    parsed = list(rdr)
print("csv-module parsed rows:", len(parsed), "field counts:",
      Counter(len(r) for r in parsed))
rows = [dict(zip(COLS, r)) for r in parsed]

ids = [r["id"] for r in rows]
print("unique ids:", len(set(ids)))
print("unsafe ids:", [i for i in ids if not TOKEN.fullmatch(i)][:10])
print("id case-collisions (lower dup):",
      [k for k, v in Counter(i.lower() for i in ids).items() if v > 1][:10])
print("otype counts:", dict(Counter(r["otype"] for r in rows)))
print("constellations:", len(set(r["constellation"] for r in rows)))

# coordinate / magnitude sanity
bad = []
for r in rows:
    ra, dec = float(r["ra_hours"]), float(r["dec_deg"])
    if not (0 <= ra < 24) or not (-90 <= dec <= 90):
        bad.append((r["id"], ra, dec))
    if r["vmag"]:
        v = float(r["vmag"])
        if not (-2 <= v <= 30):
            bad.append((r["id"], "vmag", v))
print("coordinate/magnitude outliers:", bad[:10], "count", len(bad))
print("vmag empty:", sum(1 for r in rows if not r["vmag"]))

# dropped-row checks
by_id = {r["id"]: r for r in rows}
print("ngc650 in:", "ngc650" in by_id, "| ngc651 in:", "ngc651" in by_id)
print("m40:", by_id.get("m40", {}).get("otype"), "| m73:", by_id.get("m73", {}).get("otype"))
print("m102/ngc5866 present:", "ngc5866" in by_id, "| ngc6994 present:", "ngc6994" in by_id)
print("ic1318:", by_id.get("ic1318", {}).get("primary_name"))
gc = [r["ngcic"] for r in rows if r["ngcic"]]
print("ngcic non-empty:", len(gc), "unique:", len(set(gc)))

# mojibake / control chars
ctrl = []
for r in rows:
    for k, v in r.items():
        if k == "id":
            continue
        if any(ord(c) < 32 or ord(c) == 127 for c in v) or "\ufffd" in v:
            ctrl.append((r["id"], k, repr(v[:40])))
print("control chars / U+FFFD:", ctrl[:5], "count", len(ctrl))
nonascii = Counter(c for r in rows for c in "".join(r.values()) if ord(c) > 127)
print("non-ascii chars:", nonascii.most_common(12))

# popularity + standard split
sys.path.insert(0, str(ROOT))
from app.popularity_data import POPULARITY
from app.catalog_data import standard_ids, STANDARD_TOP_N
print("POPULARITY entries:", len(POPULARITY), "| zero/neg:",
      sum(1 for v in POPULARITY.values() if not v or v <= 0))
print("ids with a score:", sum(1 for i in ids if i in POPULARITY))
std = standard_ids(ids)
print("standard_ids size:", len(std), "| STANDARD_TOP_N:", STANDARD_TOP_N)
ranked = sorted(((POPULARITY.get(i, 0), i) for i in ids), key=lambda p: (-p[0], p[1]))
print("rank 1..3:", ranked[:3])
print("rank 199..202:", ranked[198:202])
print("rank 200 score (cut):", ranked[199][0])
print("unscored rows inside the top 200:", sum(1 for s, i in ranked[:200] if not s))
print("standard set == positive-score top200:",
      std == {i for s, i in ranked[:200] if s})
print("unscored ids count:", sum(1 for i in ids if not POPULARITY.get(i, 0)))

# advertised sizes
pats = [
    ("web/index.html", r"Catalog: OpenNGC \+ supplement \(([\d,]+) objects\)"),
    ("web/app.js", r"search/sort across ([\d,]+) objects"),
    ("landing/index.html", r"a small supplement: ([\d,]+) objects"),
    ("landing/index.html", r"computed entirely in your browser\. ([\d,]+) objects"),
    ("landing/about.html", r"<b>([\d,]+)</b><span>catalog objects</span>"),
]
seen = []
for rel, p in pats:
    t = (ROOT / rel).read_text(encoding="utf-8")
    seen += [(rel, n) for n in re.findall(p, t)]
print("advertised:", seen)
print("real:", f"{len(rows):,}")

# web payload consistency
cat = json.loads((ROOT / "web/catalog.json").read_text(encoding="utf-8"))
print("web/catalog.json len:", len(cat), "unique:", len({o['id'] for o in cat}))
std_web = {o["id"] for o in cat if not o["_adv"]}
print("web standard set size:", len(std_web), "== rule:", std_web == std)
print("payload keys sample:", sorted(cat[0].keys()))
print("any 'distance' in payload:", any("distance" in o for o in cat))
print("popularity in payload:", any("popularity" in o for o in cat))
man = json.loads((ROOT / "web/catalog.manifest.json").read_text(encoding="utf-8"))
print("manifest:", json.dumps(man)[:300])
