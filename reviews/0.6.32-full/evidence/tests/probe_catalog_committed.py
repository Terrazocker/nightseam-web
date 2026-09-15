"""L7 probe: can check_catalog_token.py see a COMMITTED missed CATALOG_TOKEN bump?

The only rule for "catalog bytes changed while CATALOG_TOKEN stayed" is the
working-tree-vs-HEAD compare (`git diff --quiet HEAD -- web/catalog.json`), which
is empty once the change is committed. The manifest/token comparison is
self-consistent as soon as the manifest's sha256 is updated to the new bytes, so
the guard blesses the shipped state of the 0.6.12 defect class.

Emulates the post-commit state with COPIES of the three real files and the REAL
git (cwd = the real repo, whose catalog.json is clean), exactly like
tests/test_cache_tokens.py does - no repository file is modified.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
WEB = REPO / "web"
COPY = HERE / "cattoken"


def main() -> int:
    shutil.rmtree(COPY, ignore_errors=True)
    COPY.mkdir(parents=True)
    for name in ("app.js", "catalog.json", "catalog.manifest.json"):
        shutil.copy2(WEB / name, COPY / name)

    spec = importlib.util.spec_from_file_location(
        "probe_catalog_token", REPO / "scripts" / "check_catalog_token.py")
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    guard.APP = COPY / "app.js"
    guard.CATALOG = COPY / "catalog.json"
    guard.MANIFEST = COPY / "catalog.manifest.json"

    app = (COPY / "app.js").read_text(encoding="utf-8")
    token0 = re.search(r"const CATALOG_TOKEN = '(\d+)'", app).group(1)
    print("baseline (copies, real git, real repo HEAD):", guard.scan())

    # the release step: web/catalog.json is regenerated -> different bytes ...
    (COPY / "catalog.json").write_bytes(
        (COPY / "catalog.json").read_bytes().replace(b'{"id"', b'{"id"', 1) + b" ")
    # ... the manifest is refreshed to the new bytes, the token is NOT bumped
    (COPY / "catalog.manifest.json").write_text(
        json.dumps({"token": token0,
                    "sha256": hashlib.sha256(
                        (COPY / "catalog.json").read_bytes()).hexdigest()}),
        encoding="utf-8")
    print("CATALOG_TOKEN in app.js:", token0, "(unchanged)")
    print("manifest token/sha agree with the new bytes:",
          json.loads((COPY / "catalog.manifest.json").read_text())["token"] == token0)
    print("guard verdict for the shipped (committed) shape:", guard.scan())

    # control: the same change while it is still uncommitted IS caught
    spec2 = importlib.util.spec_from_file_location(
        "probe_catalog_token2", REPO / "scripts" / "check_catalog_token.py")
    g2 = importlib.util.module_from_spec(spec2)
    spec2.loader.exec_module(g2)
    g2.APP, g2.CATALOG, g2.MANIFEST = guard.APP, guard.CATALOG, guard.MANIFEST
    import types

    def fake_git(args):
        if args[:2] == ["diff", "--quiet"]:
            return types.SimpleNamespace(returncode=1, stdout="")
        if args[0] == "diff":
            return types.SimpleNamespace(returncode=0, stdout="- const OTHER = 1;\n")
        return types.SimpleNamespace(returncode=0, stdout="")

    g2._git = fake_git
    g2._git_ok = lambda: True
    print("control (working tree differs from HEAD):", g2.scan())
    shutil.rmtree(COPY, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
