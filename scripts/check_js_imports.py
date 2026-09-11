"""Validate that every relative ES-module import resolves to a file and that
every named import actually exists as an export of the target module.

Catches wrong relative paths (e.g. './js/util.js' from inside js/) and the
worst class of boot-killer: importing a name the module never exported
(aborts the ENTIRE module graph - the whole UI goes dead). Covers both JS
graphs: the desktop UI in static/ and the web app in web/.

Usage: python scripts/check_js_imports.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOTS = [REPO / "static", REPO / "web"]
# core source + the two baked trees: the stable stubs re-export explicit names
# from the hashed directories, and those named imports must resolve too.
CORE_ROOTS = [REPO / "core", REPO / "web" / "core", REPO / "static" / "js" / "core"]

# `import ... from "spec"` / `import "spec"` (namespace, named, default, bare)
IMPORT_RE = re.compile(
    r"""\bimport\s*(?:([\s\S]*?)\s*from\s*)?["']([^"']+)["']"""
    r"""|\bimport\(\s*["']([^"']+)["']\s*\)""", re.M)
EXPORT_RE = re.compile(
    r"export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([\w$]+)"
    r"|export\s+\{([^}]+)\}"
    r"|export\s+default\b")


def iter_js_files():
    for root in ROOTS:
        if not root.is_dir():
            continue
        for p in sorted(root.glob("*.js")):
            yield p
        jsdir = root / "js"
        if jsdir.is_dir():
            for p in sorted(jsdir.glob("*.js")):
                yield p
    for root in CORE_ROOTS:
        if root.is_dir():
            for p in sorted(root.rglob("*.js")):
                yield p


def exports_of(text: str) -> set:
    names = set()
    for m in EXPORT_RE.finditer(text):
        if m.group(1):
            names.add(m.group(1))
        if m.group(2):
            for part in m.group(2).split(","):
                piece = part.strip().split(" as ")
                if piece and piece[-1].strip():
                    names.add(piece[-1].strip())
    return names


def named_imports(clause: str) -> list[str]:
    """Named bindings from an import clause ('{a, b as c}'), [] otherwise.

    A namespace (`* as X`) or default (`X`) import has no name that must exist
    as an export, so it only needs the path check. For `X as Y` the exported
    name is X (the first piece), not the local alias."""
    clause = clause.strip()
    if not clause.startswith("{"):
        return []
    inner = clause[1:].split("}", 1)[0]
    return [n.strip().split(" as ")[0].strip()
            for n in inner.split(",") if n.strip()]


def main() -> int:
    errors = 0
    files = list(iter_js_files())
    by_resolved = {p.resolve(): p for p in files}
    exports = {p: exports_of(p.read_text(encoding="utf-8")) for p in files}
    for f in files:
        text = f.read_text(encoding="utf-8")
        for m in IMPORT_RE.finditer(text):
            clause, spec = m.group(1), m.group(2) or m.group(3)
            if not spec or not spec.startswith("."):
                continue                       # bare specifier / URL
            # imports may carry a cache-buster: './astro.js?v=3'
            clean = spec.split("?", 1)[0].split("#", 1)[0]
            target = (f.parent / clean).resolve()
            rel = f.relative_to(REPO)
            if target not in by_resolved:
                print(f"BROKEN  {rel} -> {spec}")
                errors += 1
                continue
            for n in named_imports(clause or ""):
                if n not in exports[target]:
                    print(f"BROKEN  {rel}: '{n}' is not exported by {spec}")
                    errors += 1
    print(f"checked {len(files)} js files, {errors} broken import(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
