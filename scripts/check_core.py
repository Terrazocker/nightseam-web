"""Fail when the baked core trees drift from core/, or when a moved concept is
re-implemented outside core/.

Modeled on scripts/check_catalog_token.py:
  * core/ bytes hash to the manifest hash (bake not re-run -> fail)
  * web/core/<hash>/ and static/js/core/<hash>/ are byte-identical to core/
  * exactly one hash directory exists on each side (no stale bakes)
  * both stable stubs point at the manifest hash
  * the web stub's cache token matches the manifest token (bump discipline)
  * core/ stays pure (no DOM/storage/network identifiers)
  * the moved concepts cannot reappear as definitions in the shells

Wired into scripts/check_js.py and scripts/check_release.py.
Usage: python scripts/check_core.py
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CORE = ROOT / "core"
MANIFEST = CORE / "core.manifest.json"
WEB_DIR = ROOT / "web"
STATIC_JS = ROOT / "static" / "js"

# Functions that must exist only in core/. Keep in sync with core/index.js.
# (`clearMask` stays out: the desktop editor keeps its own UI-level variant.)
MOVED = (
    "rebuildMask", "altOf", "rowOfAlt", "xOfAz", "azOfX", "profileFromMask",
    "profileSegments", "visibleSkyBands", "skyBandPolygons", "computeProfile",
    "ceilFor", "bandTopFor", "overhangRuns", "assumedOpenRuns",
    "assumedOpenHatchPolys",
    "fmtSize", "sizeArcmin", "fmtFov", "fmtFovPair", "framePct", "magVisible",
    "skyClampZoom", "skyViewMatrix", "skyScreenToBase", "skyClampFocus",
)
FORBIDDEN = (
    r"\bdocument\s*\.", r"\bwindow\s*\.", r"\blocalStorage\b",
    r"\bsessionStorage\b", r"\bindexedDB\b", r"\bXMLHttpRequest\b",
    r"\bprocess\s*\.", r"node:", r"\bfetch\s*\(",
)


def _load_build():
    path = Path(__file__).resolve().parent / "build_core.py"
    spec = importlib.util.spec_from_file_location("build_core", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def scan() -> list[str]:
    problems: list[str] = []
    if not CORE.is_dir():
        return ["core/ is missing"]
    if not MANIFEST.is_file():
        return ["core/core.manifest.json is missing - run scripts/build_core.py"]
    try:
        man = json.loads(_read(MANIFEST))
    except (OSError, ValueError) as exc:
        return [f"core/core.manifest.json unreadable: {exc}"]

    hash_ = str(man.get("hash") or "")
    files = man.get("files") or {}
    token = man.get("token")
    build = _load_build()

    cur_hash, cur_files = build.tree_hash(CORE)
    if cur_hash != hash_:
        problems.append(f"core/ hash {cur_hash} != manifest {hash_} - "
                        "re-run scripts/build_core.py")
    if cur_files != files:
        problems.append("core/ per-file hashes differ from the manifest - "
                        "re-run scripts/build_core.py")

    for label, dest_root in (("web", WEB_DIR / "core"), ("static", STATIC_JS / "core")):
        if not dest_root.is_dir():
            problems.append(f"{label}: baked core directory is missing")
            continue
        dirs = sorted(d.name for d in dest_root.iterdir() if d.is_dir())
        if dirs != [hash_]:
            problems.append(f"{label}: baked hash dirs {dirs} != ['{hash_}']")
        for rel, digest in sorted(files.items()):
            fp = dest_root / hash_ / rel
            if not fp.is_file():
                problems.append(f"{label}: baked core is missing {rel}")
            elif hashlib.sha256(build.normalize(fp.read_bytes())).hexdigest() != digest:
                problems.append(f"{label}: {rel} differs from core/")

    for label, stub in (("web", WEB_DIR / "core.js"), ("static", STATIC_JS / "core.js")):
        if not stub.is_file():
            problems.append(f"{label}: {stub.name} stub is missing")
            continue
        if f"./core/{hash_}/index.js" not in _read(stub):
            problems.append(f"{label}: {stub.name} stub does not point at {hash_}")

    importers = []
    for p in sorted(WEB_DIR.glob("*.js")):
        if p.name == "core.js":
            continue
        for m in re.finditer(r"['\"]\./core\.js\?v=(\d+)['\"]", _read(p)):
            importers.append((p.name, int(m.group(1))))
    if not importers:
        problems.append("web: no './core.js?v=' import found")
    for name, tok in importers:
        if tok != token:
            problems.append(f"web/{name}: core token {tok} != manifest token {token}")

    static_edge = any(re.search(r"['\"]\./core\.js['\"]", _read(p))
                      for p in sorted(STATIC_JS.glob("*.js")) if p.name != "core.js")
    if not static_edge:
        problems.append("static: no './core.js' import found")

    for p in build.core_files(CORE):
        text = _read(p)
        for pattern in FORBIDDEN:
            if re.search(pattern, text):
                problems.append(f"core/{p.name}: forbidden pattern {pattern}")

    for base in (WEB_DIR, STATIC_JS):
        for p in sorted(base.glob("*.js")):
            if p.name == "core.js":
                continue
            text = _read(p)
            for name in MOVED:
                if re.search(r"(export\s+)?(async\s+)?function\s+" + name + r"\b", text):
                    problems.append(f"{p.name}: {name}() must live in core/ only")
    return problems


def main() -> int:
    problems = scan()
    for problem in problems:
        print(f"  {problem}")
    print("check_core:", "FAIL" if problems else "OK")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
