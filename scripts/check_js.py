"""One-command JS health check: runs the three static/js checkers.

Hard failures (broken imports, missing DOM ids) exit non-zero; the defs
checker stays review-only (it is heuristic). Usage: python scripts/check_js.py
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
    _run("check_js_defs")            # heuristic - candidates only
    print("check_js:", "FAIL" if hard else "OK")
    return 1 if hard else 0


if __name__ == "__main__":
    sys.exit(main())