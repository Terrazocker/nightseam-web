"""L6 probe 2: build the catalogue from source IN MEMORY (no product file touched)
and compare against the shipped openned.csv; enumerate which OpenNGC types the
shipped build actually proves mapped."""
import csv, hashlib, importlib.util, json, re, sys
from collections import Counter
from pathlib import Path

ROOT = Path(r"<workspace>\AstroPilot-local")
spec = importlib.util.spec_from_file_location("bac", ROOT / "scripts/build_adv_catalog.py")
bac = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bac)

rows, counts = bac.build_catalog()
print("rebuilt counts:", counts, "total", len(rows))
types = Counter(r["otype"] for r in rows)
print("rebuilt types:", dict(types))

# serialize exactly like main() does
import io
buf = io.StringIO()
w = csv.writer(buf, delimiter=";", lineterminator="\n")
COLS = ("id", "primary_name", "messier", "ngcic", "other", "otype", "ra_hours",
        "dec_deg", "vmag", "size_am", "constellation", "wiki", "blurb", "search")
for r in rows:
    w.writerow([r[c] for c in COLS])
rebuilt_body = buf.getvalue()
shipped = (ROOT / "app/data/openned.csv").read_text(encoding="utf-8")
shipped_body = "".join(l for l in shipped.splitlines(keepends=True)
                       if not l.startswith("#"))
print("body identical:", rebuilt_body == shipped_body)
print("rebuilt sha256:", hashlib.sha256(rebuilt_body.encode()).hexdigest())
print("shipped body sha256:", hashlib.sha256(shipped_body.encode()).hexdigest())

# raw OpenNGC types present in the sources vs TYPE_MAP/SKIP_TYPES
for label, path in (("NGC", ROOT / "data/NGC.csv"), ("addendum", ROOT / "data/addendum.csv")):
    raw = bac._load_source(path)
    t = Counter(r["Type"] for r in raw)
    print(f"\n{label} rows={len(raw)} raw types={dict(t)}")
    unmapped = sorted(k for k in t if k not in bac.TYPE_MAP and k not in bac.SKIP_TYPES)
    print(f"  types neither mapped nor skipped: {unmapped}")
    skipped = sum(v for k, v in t.items() if k in bac.SKIP_TYPES)
    print(f"  rows dropped as non-objects: {skipped}")
    if label == "NGC":
        print(f"  expected objects = {len(raw)} - {skipped} = {len(raw)-skipped}")
    else:
        print(f"  expected objects = {len(raw)} - {skipped} = {len(raw)-skipped}")
