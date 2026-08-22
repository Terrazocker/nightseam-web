"""Validate that every relative ES-module import in static/ resolves to a file.

Catches wrong relative paths (e.g. './js/util.js' from inside js/) that syntax
checks cannot see. Usage: python scripts/check_js_imports.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "static"
IMPORT_RE = re.compile(
    r"""\b(?:import|export)\s+(?:[\s\S]*?from\s+)?["']([^"']+)["']"""
    r"|\bimport\(\s*[\"']([^\"']+)[\"']\s*\)", re.M)


def iter_js_files():
    for p in sorted((ROOT / "js").glob("*.js")):
        yield p
    for p in sorted(ROOT.glob("*.js")):
        yield p


def main() -> int:
    errors = 0
    files = list(iter_js_files())
    for f in files:
        text = f.read_text(encoding="utf-8")
        for m in IMPORT_RE.finditer(text):
            spec = m.group(1) or m.group(2)
            if not spec or not spec.startswith("."):
                continue                       # bare specifier / URL
            target = (f.parent / spec).resolve()
            if not target.exists():
                print(f"BROKEN  {f.relative_to(ROOT.parent)} -> {spec}")
                errors += 1
    print(f"checked {len(files)} js files, "
          f"{errors} broken import(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
