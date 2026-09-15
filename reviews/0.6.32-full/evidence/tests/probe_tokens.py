"""L7 probe: prove the check_js_tokens VERIFIED-BASELINE rule end to end.

Builds a throwaway mirror of the real web tree (root js/css/html only) next to a
copy of the guard, changes ONE module's bytes without touching its cache token,
and runs the copied guard twice: plain scan, then --update.
Read-only with respect to the real repo tree.
"""
from __future__ import annotations

import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]                      # reviews/0.6.32-full/evidence/tests -> repo
TREE = HERE / "tokprobe"
GUARD = TREE / "scripts" / "check_js_tokens.py"


def build() -> None:
    shutil.rmtree(TREE, ignore_errors=True)
    (TREE / "scripts").mkdir(parents=True)
    (TREE / "web").mkdir(parents=True)
    shutil.copy2(REPO / "scripts" / "check_js_tokens.py", GUARD)
    for p in sorted((REPO / "web").glob("*.js")) + sorted((REPO / "web").glob("*.css")):
        shutil.copy2(p, TREE / "web" / p.name)
    shutil.copy2(REPO / "web" / "index.html", TREE / "web" / "index.html")


def run(args: list[str]) -> tuple[int, str]:
    r = subprocess.run([sys.executable, str(GUARD), *args],
                       capture_output=True, text=True, cwd=str(TREE))
    return r.returncode, (r.stdout + r.stderr).strip()


def main() -> int:
    build()
    before_script = hashlib.sha256(GUARD.read_bytes()).hexdigest()
    app = TREE / "web" / "app.js"
    app.write_bytes(app.read_bytes() + b"\n// probe: bytes changed, no token bump\n")
    print("== token in web/index.html for app.js ==")
    print([ln for ln in (TREE / "web" / "index.html").read_text(encoding="utf-8").splitlines()
           if "app.js?v=" in ln])
    rc, out = run([])
    print(f"== plain scan: exit {rc} ==")
    print(out)
    rc2, out2 = run(["--update"])
    print(f"== --update: exit {rc2} ==")
    print(out2)
    after_script = hashlib.sha256(GUARD.read_bytes()).hexdigest()
    print("== guard file unchanged by the refused --update:", before_script == after_script, "==")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
