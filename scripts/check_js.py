"""One-command web JS health check.
Hard guards cover imports/exports, DOM IDs, Node syntax, UTF-8, catalog and
provenance cache tokens, module-token baselines, core hash/retention/purity and
moved-concept protection. The definitions heuristic remains review-only.
Missing Node or unavailable guards fail; they never silently skip.
Usage: python scripts/check_js.py
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _run(name: str):
    path = Path(__file__).resolve().parent / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.main()


def main() -> int:
    hard = 0
    hard += _run("check_js_imports")
    hard += _run("check_dom_ids")
    hard += _run("check_js_syntax")  # parses the modules (no node = exit 2)
    hard += _run("check_encoding")   # UTF-8 / no cp1252 mojibake in shipped text
    hard += _run("check_catalog_token")  # catalog.json cache-bust pairing
    hard += _run("check_catalog_provenance")  # provenance sidecar pairing
    hard += _run("check_js_tokens")      # per-module ?v= token vs module bytes
    hard += _run("check_core")           # baked core drift + source guard
    _run("check_js_defs")            # heuristic - candidates only
    print("check_js:", "FAIL" if hard else "OK")
    return 1 if hard else 0


if __name__ == "__main__":
    sys.exit(main())
