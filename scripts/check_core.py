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
APP_DIR = ROOT / "app"
SCRIPTS_DIR = ROOT / "scripts"

# Functions that must exist only in core/. Keep in sync with core/index.js.
# Two deliberate shell-level variants stay OUT (pinned by test_core_drift.py's
# MOVED pin): `clearMask` (the desktop editor keeps its own UI-level variant)
# and `popularityFactor` (the shells wrap it to resolve m.popularity first).
MOVED = (
    "rebuildMask", "altOf", "rowOfAlt", "xOfAz", "azOfX", "wrapsFor",
    "profileFromMask", "normalizeProfileBins", "profileSegments", "fovBinRel",
    "visibleSkyBands", "skyBandPolygons", "computeProfile",
    "ceilFor", "bandTopFor", "overhangRuns", "assumedOpenRuns",
    "assumedOpenHatchPolys",
    "cropKeptBand", "cropStrokes", "clipProfileToFov", "cropPano",
    "fmtSize", "sizeArcmin", "fmtFov", "fmtFovPair", "framePct", "magVisible",
    "skyClampZoom", "skyViewMatrix", "skyScreenToBase", "skyClampFocus",
    "searchBlob", "isCustomId",
    "offsetEastMin", "zoneOffsetAtLocalNoon", "wallFromUtcMs", "utcFromWallMs",
    "aboveHorizon", "sampleVisible", "statusOf", "effectiveMinAlt",
    "moonSensitivity", "moonMinDist", "effectiveMoonGlow", "moonPenalty",
    "bortleMoonFactor", "nightStatsBatch",
    "computeNightTracks", "scoreNightTracks",
    "julianDay", "dateFromJD", "gmstDeg", "precessJ2000ToDate",
    "precessDateToJ2000", "refractionDeg", "altaz", "altazFrame",
    "altazFrameApply", "sunRaDec", "moonRaDec", "moonIllumination",
    "moonAge",
    "sunAlt", "sunCrossings", "nightInfo", "pickDarkWindow", "scrubWindowMs",
    "scrubBounds", "scrubClamp", "sepDeg", "nightStats",
)
# The Python astronomy/planning layer was deleted in Phase C (0.6.20): these
# snake_case cores must not reappear as Python definitions in app/ or scripts/.
# (app/fits.py's parse_ra_hours/parse_dec_deg are PARSERS, not astronomy.)
MOVED_PY = (
    "julian_day", "gmst_deg", "precess_j2000_to_date",
    "precess_j2000_to_date_inverse", "altaz", "sun_ra_dec", "moon_ra_dec",
    "moon_illumination", "moon_age", "sun_alt",
    "find_twilight", "make_sun_alt_fn", "night_window", "local_utc",
    "compute_night", "object_detail", "ceil_lookup", "longest_run",
)
RETIRED_PY_MODULES = ("astro.py", "planning.py", "nightcalc.py")
# Shell files deliberately carry thin arrow wrappers around these core
# functions (they inject shell state: esc(), S.minAlt, cfg); a const/arrow
# definition of them is NOT a moved-concept violation. `clearMask` and
# `popularityFactor` are not in MOVED at all (documented above).
SHELL_WRAPPERS = {"fmtSize", "statusOf", "effectiveMinAlt"}
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
                # `function name(`, any assignment `name =` (const/let/var,
                # reassignment, comment-separated arrow) and method-style
                # `name(...) {` - an arrow or method re-implementation must not
                # slip past the guard (TS3, review). The documented shell
                # wrappers are exempt from the non-function forms only.
                plain = re.search(r"(export\s+)?(async\s+)?function\s+"
                                  + name + r"\b", text)
                sneak = None
                if name not in SHELL_WRAPPERS:
                    # only FUNCTION-VALUED assignments (or method definitions):
                    # MOVED names are also natural local variable names
                    # (`const moonAge = ...`, `const sunAlt = []`).
                    sneak = re.search(
                        r"(?<![\w.$=!<>])" + name +
                        r"\s*=\s*(?:/\*[\s\S]*?\*/\s*)?"
                        r"(?:\(|async\b|function\b|[\w$]+\s*=>)", text) or \
                        re.search(r"(?:^|[;}\n])\s*" + name
                                  + r"\s*\([^)]*\)\s*\{", text, re.M)
                if plain or sneak:
                    problems.append(f"{p.name}: {name}() must live in core/ only")

    # Phase C: Python is IO/platform only - no astronomy/planning math may be
    # re-implemented in app/ or scripts/ (the retired modules or their cores).
    for name in RETIRED_PY_MODULES:
        if (APP_DIR / name).exists():
            problems.append(f"app/{name}: retired in Phase C - astronomy lives "
                            "in core/")
    for base in (APP_DIR, SCRIPTS_DIR):
        if not base.is_dir():
            continue
        for p in sorted(base.rglob("*.py")):
            if "__pycache__" in p.parts:
                continue
            text = _read(p)
            for name in MOVED_PY:
                # `async def` counts too (TS3, review).
                if re.search(r"^\s*(?:async\s+)?def\s+" + name + r"\s*\(",
                             text, re.M):
                    problems.append(
                        f"{p.relative_to(base)}: {name}() must live in core/ only")
    return problems


def main() -> int:
    problems = scan()
    for problem in problems:
        print(f"  {problem}")
    print("check_core:", "FAIL" if problems else "OK")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
