"""Validate that every relative ES-module import in static/ resolves to a file
and that every named import actually exists as an export of the target module.

Catches wrong relative paths (e.g. './js/util.js' from inside js/) and the
worst class of boot-killer: importing a name the module never exported
(aborts the ENTIRE module graph - the whole UI goes dead). Syntax checks and
check_js_defs.py cannot see either. Usage: python scripts/check_js_imports.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "static"
IMPORT_RE = re.compile(
    r"""\bimport\s*(?:\{([^}]+)\}|(\w+))\s*from\s*["']([^"']+)["']"""
    r"""|\bimport\(\s*["']([^"']+)["']\s*\)""", re.M)
EXPORT_RE = re.compile(
    r"export\s+(?:async\s+)?function\s+([\w$]+)"
    r"|export\s+const\s+([\w$]+)"
    r"|export\s+\{([^}]+)\}"
    r"|export\s+default\s+\w+")


def iter_js_files():
    for p in sorted((ROOT / "js").glob("*.js")):
        yield p
    for p in sorted(ROOT.glob("*.js")):
        yield p


def exports_of(text: str) -> set:
    names = set()
    for m in EXPORT_RE.finditer(text):
        if m.group(1):
            names.add(m.group(1))
        if m.group(2):
            names.add(m.group(2))
        if m.group(3):
            for part in m.group(3).split(","):
                piece = part.strip().split(" as ")
                if piece and piece[-1].strip():
                    names.add(piece[-1].strip())
    return names


def main() -> int:
    errors = 0
    files = list(iter_js_files())
    by_resolved = {p.resolve(): p.relative_to(ROOT.parent) for p in files}
    exports = {p: exports_of(p.read_text(encoding="utf-8")) for p in files}
    for f in files:
        text = f.read_text(encoding="utf-8")
        for m in IMPORT_RE.finditer(text):
            spec = m.group(3) or m.group(4)
            if not spec or not spec.startswith("."):
                continue                       # bare specifier / URL
            target = (f.parent / spec).resolve()
            if target not in by_resolved:
                print(f"BROKEN  {f.relative_to(ROOT.parent)} -> {spec}")
                errors += 1
                continue
            names = [n.strip().split(" as ")[-1].strip()
                     for n in (m.group(1) or "").split(",") if n.strip()]
            if m.group(2):
                names = [m.group(2)]
            for n in names:
                if n not in exports[target]:
                    print(f"BROKEN  {f.relative_to(ROOT.parent)}: "
                          f"'{n}' is not exported by {spec}")
                    errors += 1
    print(f"checked {len(files)} js files, "
          f"{errors} broken import(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
