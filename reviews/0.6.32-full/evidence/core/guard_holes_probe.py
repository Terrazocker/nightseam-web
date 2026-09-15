"""L2 probe: which re-implementations of core concepts does scripts/check_core.py
actually catch?

The guard is run over a SCRATCH COPY of the repo's relevant trees, so no product
file is touched. Each case is a textual mutation of a shell file (or an added
file), followed by `check_core.scan()` on the copy. The real tree is never
modified and the real guard is run at the end as a control.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]      # repo root
SCRATCH = ROOT / "reviews" / "0.6.32-full" / "evidence" / "core" / ".guard-scratch"
sys.path.insert(0, str(ROOT / "scripts"))
import check_core  # noqa: E402

COPIES = ["core", "web", "static", "app", "scripts"]


def build() -> Path:
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    SCRATCH.mkdir(parents=True)
    for name in COPIES:
        src = ROOT / name
        if not src.exists():
            continue
        dst = SCRATCH / name
        if name == "core":
            shutil.copytree(src, dst)
        elif name in ("web", "static"):
            # copy the shell's .js/.html surface PLUS the baked trees and stub,
            # which the guard reads directly
            shutil.copytree(src, dst,
                            ignore=shutil.ignore_patterns("*.json", "*.css",
                                                          "*.png", "*.jpg",
                                                          "__pycache__"))
        else:
            shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__"))
    return SCRATCH


def scan_in(root: Path) -> list[str]:
    saved = (check_core.ROOT, check_core.CORE, check_core.MANIFEST,
             check_core.WEB_DIR, check_core.STATIC_JS, check_core.APP_DIR,
             check_core.SCRIPTS_DIR)
    check_core.ROOT = root
    check_core.CORE = root / "core"
    check_core.MANIFEST = root / "core" / "core.manifest.json"
    check_core.WEB_DIR = root / "web"
    check_core.STATIC_JS = root / "static" / "js"
    check_core.APP_DIR = root / "app"
    check_core.SCRIPTS_DIR = root / "scripts"
    try:
        return check_core.scan()
    finally:
        (check_core.ROOT, check_core.CORE, check_core.MANIFEST,
         check_core.WEB_DIR, check_core.STATIC_JS, check_core.APP_DIR,
         check_core.SCRIPTS_DIR) = saved


CASES: list[tuple[str, str, str, str]] = [
    # (label, relative file, old text, new text)
    ("baseline (no mutation)", "", "", ""),
    ("MOVED name, `function` decl (should FAIL)",
     "web/app.js",
     "function legacySite() {",
     "export function magVisible(vmag, limit, maxLimit) { return true; }\nfunction legacySite() {"),
    ("MOVED name, arrow const (should FAIL)",
     "web/app.js",
     "function legacySite() {",
     "const magVisible = (v, l, m) => true;\nfunction legacySite() {"),
    ("MOVED name, object/class METHOD (hole?)",
     "web/app.js",
     "function legacySite() {",
     "const H = { magVisible(vmag, limit, maxLimit) { return vmag <= limit; } };\nfunction legacySite() {"),
    ("MOVED formula, DIFFERENT name + no `function` (hole?)",
     "web/app.js",
     "function legacySite() {",
     "const computeBins = (p) => { p.profile = new Array(720).fill(-90); };\nfunction legacySite() {"),
    ("core math as a STRING, dynamic import (hole?)",
     "web/app.js",
     "function legacySite() {",
     "const SRC = 'export function julianDay(dt){return 2451545.0}';\n"
     "const m = await import('data:text/javascript,' + encodeURIComponent(SRC));\n"
     "function legacySite() {"),
    ("duplicate core logic in an .html inline script (hole?)",
     "web/index.html",
     "<body>",
     "<body>\n<script type=\"module\">\n"
     "export function julianDay(dt) { return 2451545.0; }\n"
     "function precessJ2000ToDate(ra, dec, jd) { return [ra, dec]; }\n"
     "const altaz = (ra, dec, jd, lat, lon) => [0, 0];\n</script>"),
    ("pure JS file that is not .js (hole?)",
     "web/lib.txt",
     "",
     "export function julianDay(dt) { return 2451545.0; }\n"
     "export function gmstDeg(jd) { return 280.46; }\n"),
    ("Python astronomy helper, non-MOVED_PY name (hole?)",
     "app/astro_helpers.py",
     "",
     "def _julian_day_impl(dt):\n    return 2451545.0\n\n"
     "def _sidereal_degrees(jd):\n    return 280.46\n"),
    ("Python MOVED_PY name, `def julian_day(` (should FAIL)",
     "app/astro_helpers.py",
     "",
     "def julian_day(dt):\n    return 2451545.0\n"),
]

results = []
for label, rel, old, new in CASES:
    build()
    if rel:
        target = SCRATCH / rel
        if not target.exists():
            if old:
                results.append((label, "SKIP (target missing)"))
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(new, encoding="utf-8")
        else:
            text = target.read_text(encoding="utf-8")
            if old not in text:
                results.append((label, f"SKIP (anchor {old!r} not in {rel})"))
                continue
            target.write_text(text.replace(old, new, 1), encoding="utf-8")
    problems = scan_in(SCRATCH)
    results.append((label, "CAUGHT: " + problems[0] if problems
                    else "*** NOT CAUGHT ***"))

print("guard-hole probe (scratch copy; real tree untouched)\n")
for label, verdict in results:
    print(f"  {verdict:<44} {label}")

print("\ncontrol: real tree scan ->",
      "OK" if not check_core.scan() else check_core.scan())
shutil.rmtree(SCRATCH, ignore_errors=True)
