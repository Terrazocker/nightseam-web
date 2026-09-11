"""Pre-tag gate: a release version MUST already have a CURATED entry before the
tag is created.

Committing the curated entry AFTER tagging leaves HEAD past the tag (describe
becomes `vX.Y.Z-N-g<sha>`, and the tree reads `-dirty` at bake time) and
`check_release.py` then blocks staging - this is exactly the 0.6.12 mistake the
gate prevents. Run it BEFORE `git tag`:

    python scripts/pre_tag_check.py 0.6.12

Exits 0 only when `scripts/build_changelog.py::CURATED` has an entry for the
version; non-zero otherwise (and when no version is given).
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def curated() -> dict:
    path = ROOT / "scripts" / "build_changelog.py"
    spec = importlib.util.spec_from_file_location("build_changelog", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.CURATED


def check(version) -> bool:
    v = str(version).lstrip("v").strip()
    return bool(v) and v in curated()


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python scripts/pre_tag_check.py X.Y.Z")
        return 2
    v = sys.argv[1].lstrip("v")
    if check(v):
        print(f"pre_tag_check: OK - '{v}' has a curated changelog entry")
        return 0
    print(f"pre_tag_check: FAIL - no CURATED entry for '{v}' in "
          f"scripts/build_changelog.py - add it and COMMIT it BEFORE creating "
          f"the tag")
    return 1


if __name__ == "__main__":
    sys.exit(main())
