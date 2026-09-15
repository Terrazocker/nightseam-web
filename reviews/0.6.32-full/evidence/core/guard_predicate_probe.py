"""L2 probe, part 2: exercise the guard's ACTUAL predicate on candidate re-
implementations, so the hole claim does not depend on my scratch-tree harness.

Uses scripts/check_core.py's own regexes and shell_sources() against strings.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "scripts"))
import check_core  # noqa: E402


def moved_hit(name: str, text: str) -> str | None:
    """Reimplementation of check_core.scan()'s per-name detection, verbatim."""
    plain = re.search(r"(export\s+)?(async\s+)?function\s+" + name + r"\b", text)
    sneak = None
    if name not in check_core.SHELL_WRAPPERS:
        sneak = re.search(
            r"(?<![\w.$=!<>])" + name +
            r"\s*=\s*(?:/\*[\s\S]*?\*/\s*)?"
            r"(?:\(|async\b|function\b|[\w$]+\s*=>)", text) or \
            re.search(r"(?:^|[;}\n])\s*" + name
                      + r"\s*\([^)]*\)\s*\{", text, re.M)
    if plain:
        return "plain `function " + name + "`"
    if sneak:
        return "assignment/method form"
    return None


CANDIDATES = {
    "function decl": "function julianDay(dt) { return 2451545.0; }",
    "arrow const (same name)": "const julianDay = (dt) => 2451545.0;",
    "method (property after comma)":
        "const H = { ra: 0, julianDay(dt) { return 2451545.0; } };",
    "method (property after brace)":
        "const H = { julianDay(dt) { return 2451545.0; } };",
    "method (property after semicolon)":
        "class H { ; julianDay(dt) { return 2451545.0; } }",
    "getter accessor": "const H = { get julianDay() { return 2451545; } };",
    "alias to the core import":
        "import * as CORE from './core.js?v=24';\n"
        "const myJulian = (dt) => CORE.julianDay(dt);",
    "identical formula, DIFFERENT name":
        "const dayNumber = (dt) => 2451545.0 + (dt - 0) / 86400000;",
    "evaluated source string":
        "const SRC = 'function julianDay(d){return 2451545}';\n"
        "const m = await import('data:text/javascript,' + encodeURIComponent(SRC));",
    "source string with no MOVED name":
        "const SRC = 'function dayNum(d){return 2451545}';\n"
        "new Function(SRC)();",
    "eval of core math":
        "eval('2451545.0 + t * 36525');",
    "HTML inline module script":
        '<script type="module">\nfunction julianDay(d){return 2451545}\n'
        "export function gmstDeg(jd){return 280.46}\n</script>",
}

print("1) check_core's own MOVED predicate over candidate texts\n")
for label, text in CANDIDATES.items():
    for name in ("julianDay", "gmstDeg"):
        hit = moved_hit(name, text)
        if hit:
            print(f"   CAUGHT   {label:<38} via {hit} ({name})")
            break
    else:
        print(f"   NOT CAUGHT  {label}")

print("\n2) shell_sources() file selection: which paths are scanned at all?\n")
base = ROOT / "reviews" / "0.6.32-full" / "evidence" / "core" / ".predicate-scratch"
if base.exists():
    import shutil
    shutil.rmtree(base, ignore_errors=True)
rels = ["app.js", "sub/deep.js", "sub/thing.html", "lib.txt",
        "helper.mjs", "index.html", "core.js", "core/abc/x.js"]
for rel in rels:
    p = base / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("// x", encoding="utf-8")
scanned = {p.relative_to(base).as_posix() for p in check_core.shell_sources(base)}
for rel in rels:
    print(f"   {'SCANNED    ' if rel in scanned else 'NOT SCANNED'} {rel}")
import shutil as _sh
_sh.rmtree(base, ignore_errors=True)

print("\n3) FORBIDDEN (purity) patterns vs. a dynamic loader\n")
for probe in ["await import('data:text/javascript,...')",
              "new Function('return 2451545')()",
              "eval('1+1')",
              "importScripts('x.js')",
              "<div onclick=\"x\">"]:
    hit = [pat for pat in check_core.FORBIDDEN if re.search(pat, probe)]
    print(f"   {'CAUGHT   ' if hit else 'NOT CAUGHT'} {probe!r} {hit}")
