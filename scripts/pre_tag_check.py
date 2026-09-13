"""Pre-tag gate: a release version MUST already have a CURATED entry before the
tag is created - and the tag must not ship a stale cache token.

Committing the curated entry AFTER tagging leaves HEAD past the tag (describe
becomes `vX.Y.Z-N-g<sha>`, and the tree reads `-dirty` at bake time) and
`check_release.py` then blocks staging - this is exactly the 0.6.12 mistake the
gate prevents. The token half is XL-01 (review 0.6.24): the v0.6.24 tag shipped
the 0.6.23 per-module `?v=` tokens naming 0.6.24 bytes, so the web cache served
old modules and the bump had to be repaired after the tag. `check_js_tokens.py`
is run here as well, so a release cannot be tagged in that state. Run it BEFORE
`git tag`:

    python scripts/pre_tag_check.py 0.6.12

Exits 0 only when `scripts/build_changelog.py::CURATED` has an entry for the
version AND every shipped web module's bytes match its cache token; non-zero
otherwise (and when no version is given).
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load(name: str):
    path = ROOT / "scripts" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def curated() -> dict:
    return _load("build_changelog").CURATED


def token_problems() -> list[str]:
    """Missed cache-token bumps in the tree that is about to be tagged."""
    try:
        return list(_load("check_js_tokens").scan())
    except Exception as exc:  # noqa: BLE001 - a broken guard must not pass
        return [f"cache-token guard failed to run: {exc}"]


def check(version) -> bool:
    v = str(version).lstrip("v").strip()
    return bool(v) and v in curated()


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python scripts/pre_tag_check.py X.Y.Z")
        return 2
    v = sys.argv[1].lstrip("v")
    failures: list[str] = []
    if not check(v):
        failures.append(
            f"no CURATED entry for '{v}' in scripts/build_changelog.py - add it "
            f"and COMMIT it BEFORE creating the tag")
    failures += token_problems()
    if failures:
        for f in failures:
            print("pre_tag_check: FAIL - " + f)
        return 1
    print(f"pre_tag_check: OK - '{v}' has a curated changelog entry and every "
          f"shipped web module matches its cache token")
    return 0


if __name__ == "__main__":
    sys.exit(main())
