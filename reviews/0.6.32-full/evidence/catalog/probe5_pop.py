"""L6 probe 5: popularity determinism - re-run the matcher's own functions
in-process (never main(), which would rewrite app/popularity_data.py) under two
different PYTHONHASHSEED values and compare with the shipped table."""
import importlib.util, json, os, sys
from collections import Counter
from pathlib import Path

ROOT = Path(r"<workspace>\AstroPilot-local")
spec = importlib.util.spec_from_file_location("mt", ROOT / "scripts/match_popularity.py")
mt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mt)

rows = mt.read_csv()
print("csv rows read by matcher:", len(rows))
tel = mt.load_cached_snapshot()
print("cached popularity entries:", len(tel))
assert isinstance(tel, dict), type(tel)          # exactly what main() sees
idx = {}
for k, v in tel.items():
    score = v if isinstance(v, (int, float)) else (
        v.get("popularity", v.get("score", 0)) if isinstance(v, dict) else None)
    if score is None:
        continue
    n = mt.normalize(k)
    if n:
        idx[n] = (k, score)                          # last-in-file wins for a dict
print("index size (normalized):", len(idx))

# SOURCE names that normalize to the same key (one silently overwrites another)
norm_src = Counter(mt.normalize(k) for k in tel)
dupes = {k: v for k, v in norm_src.items() if v > 1}
print("popularity names colliding after normalize:", len(dupes), list(dupes)[:5])
for k in list(dupes)[:4]:
    hits = [(n, tel[n]) for n in tel if mt.normalize(n) == k]
    print("   ", k, "->", hits, "index keeps:", idx.get(k))

matches, details = mt.match_objects(rows, idx)
scored = {k: v for k, v in matches.items() if v and v > 0}
print("scored entries:", len(scored))
print("sha256 of sorted scored dict:", __import__("hashlib").sha256(
    json.dumps(sorted(scored.items())).encode()).hexdigest())

sys.path.insert(0, str(ROOT))
from app.popularity_data import POPULARITY
print("shipped entries:", len(POPULARITY))
print("MATCHES SHIPPED EXACTLY:", scored == dict(POPULARITY))

# tie-break check: does any row genuinely tie across designations, and what wins?
d = {x["csv_id"]: x for x in details}
ties = 0
for row in rows:
    if not row["id"]:
        continue
    desigs = sorted(mt.extract_designations_from_csv_row(row))
    hits = [(idx[k][1], k) for k in desigs if k in idx]
    if not hits:
        continue
    best = max(h[0] for h in hits)
    winners = [k for s, k in hits if s == best]
    if len(winners) > 1:
        ties += 1
        if ties <= 5:
            print("TIE", row["id"], sorted(hits)[:6])
print("rows with a score tie across designations:", ties)

# leading-zero normalization evidence
print("PGC 017223 normalized:", mt.normalize("PGC 017223"),
      "| PGC 17223 ->", mt.normalize("PGC 17223"))
print("eso56-115 present in scored:", "eso56-115" in scored,
      "score", scored.get("eso56-115"))
for a in mt.POPULARITY_ALIASES:
    print("alias", a, "->", scored.get(a, "NO SCORE"))
