"""One-command JS health check: runs the four static/js checkers.

Hard failures (broken imports, missing DOM ids, syntax errors) exit non-zero;
the defs checker stays review-only (it is heuristic) and the syntax checker
skips itself when node is not installed.
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
    hard += _run("check_js_syntax")  # parses the modules (skips without node)
    _run("check_js_defs")            # heuristic - candidates only
    print("check_js:", "FAIL" if hard else "OK")
    return 1 if hard else 0


if __name__ == "__main__":
    sys.exit(main())