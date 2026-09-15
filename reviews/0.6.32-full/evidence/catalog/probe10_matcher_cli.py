"""L6 probe 10: CLI-level determinism of `match_popularity.py --cached`.

Runs the REAL script but shadows its module-level output paths (data/ cache and
app/popularity_data.py) into the evidence dir by rewriting the three path
constants in an exec'd copy - so the shipped generated files are never touched.
Then: run twice, compare the written modules byte-for-byte with each other AND
with the shipped app/popularity_data.py, each under a different PYTHONHASHSEED.
"""
import hashlib, subprocess, sys
from pathlib import Path

ROOT = Path(r"<workspace>\AstroPilot-local")
EV = ROOT / "reviews/0.6.32-full/evidence/catalog"
SRC = (ROOT / "scripts/match_popularity.py").read_text(encoding="utf-8")

for seed in ("0", "99991"):
    # same directory DEPTH as scripts/ so ROOT = parents[1] still resolves
    shadow_dir = EV / "shadow" / "scripts"
    shadow_dir.mkdir(parents=True, exist_ok=True)
    tmp_script = shadow_dir / f"match_shadow_{seed}.py"
    tmp_mod = EV / f"popularity_shadow_{seed}.py"
    tmp_cache = EV / "popularity_cache_copy.json"
    body = (SRC
            .replace('OUTPUT_JSON = ROOT / "data" / "popularity_snapshot.json"',
                     f'OUTPUT_JSON = Path(r"{tmp_cache}")')
            .replace('OUTPUT_MODULE = ROOT / "app" / "popularity_data.py"',
                     f'OUTPUT_MODULE = Path(r"{tmp_mod}")')
            # keep the INPUT (the shipped CSV) pointing at the real repo
            .replace('CSV_PATH = ROOT / "app" / "data" / "openned.csv"',
                     f'CSV_PATH = Path(r"{ROOT / "app/data/openned.csv"}")'))
    assert str(tmp_cache) in body and str(tmp_mod) in body and "app\\data\\openned.csv" in body.replace("/", "\\")
    tmp_script.write_text(body, encoding="utf-8")
    import os
    env = dict(os.environ, PYTHONHASHSEED=seed)
    p = subprocess.run([sys.executable, str(tmp_script), "--cached"], cwd=str(ROOT),
                       capture_output=True, text=True, env=env)
    tail = [l for l in p.stdout.splitlines() if "wrote " in l or "scored entries" in l]
    print(f"seed {seed}: rc={p.returncode} {tail}")
    if p.returncode != 0:
        print(p.stdout[-600:], p.stderr[-600:])
    if tmp_mod.exists():
        print(f"  shadow module entries:",
              sum(1 for l in tmp_mod.read_text(encoding='utf-8').splitlines()
                  if l.strip().startswith("'")))
        print("  sha256:", hashlib.sha256(tmp_mod.read_bytes()).hexdigest())
        print("  == shipped popularity_data.py:",
              tmp_mod.read_bytes() == (ROOT / "app/popularity_data.py").read_bytes())

shipped = hashlib.sha256((ROOT / "app/popularity_data.py").read_bytes()).hexdigest()
print("shipped popularity_data.py sha256:", shipped)
print("data/popularity_snapshot.json unchanged:", hashlib.sha256(
    (ROOT / "data/popularity_snapshot.json").read_bytes()).hexdigest()[:16])
