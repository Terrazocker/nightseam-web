"""Guard: web/catalog.json (a ~4 MB shipped DATA file) must be cache-busted.

`web/catalog.json` is not a JS module, so it cannot carry a `?v=` in an import.
The web app fetches it through ONE named token (`const CATALOG_TOKEN` in
`web/app.js`, used as `fetch('catalog.json?v=' + CATALOG_TOKEN)`), and
`web/catalog.manifest.json` records the bytes that belong to the current token.
When the catalog changes, the token MUST be bumped in the same change, or
returning visitors keep the stale ~4 MB file (heuristic HTTP caching) and the
data fix never reaches them. This is exactly the 0.6.12 catalog-id dedup.

Checks (all hard failures, exit 1):
  * web/app.js declares `const CATALOG_TOKEN = '<n>'`
  * exactly ONE `fetch('catalog.json` site (a second, token-less site would
    bypass the invalidation)
  * web/catalog.manifest.json exists and its token/sha256 match the tree
  * (when git is available) if web/catalog.json differs from HEAD, the token in
    web/app.js must differ from HEAD too

Usage: python scripts/check_catalog_token.py
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "web" / "app.js"
CATALOG = ROOT / "web" / "catalog.json"
MANIFEST = ROOT / "web" / "catalog.manifest.json"

_TOKEN_RE = re.compile(r"const CATALOG_TOKEN = '(\d+)'")
_FETCH_RE = re.compile(r"fetch\('catalog\.json")


def _git(args: list[str]) -> subprocess.CompletedProcess | None:
    try:
        return subprocess.run(["git", *args], cwd=str(ROOT), capture_output=True,
                              text=True, timeout=30)
    except Exception:  # noqa: BLE001 - git may be unavailable
        return None


def _git_ok() -> bool:
    r = _git(["rev-parse", "--is-inside-work-tree"])
    return bool(r and r.returncode == 0 and r.stdout.strip() == "true")


def scan() -> list[str]:
    problems: list[str] = []
    app_text = APP.read_text(encoding="utf-8")

    m = _TOKEN_RE.search(app_text)
    token = m.group(1) if m else None
    if token is None:
        problems.append("web/app.js has no `const CATALOG_TOKEN = '<n>'`")

    sites = len(_FETCH_RE.findall(app_text))
    if sites != 1:
        problems.append(f"expected exactly 1 `fetch('catalog.json...')` site, found {sites}")

    sha = hashlib.sha256(CATALOG.read_bytes()).hexdigest()

    if not MANIFEST.is_file():
        problems.append("web/catalog.manifest.json is missing")
    else:
        try:
            man = json.loads(MANIFEST.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            problems.append(f"web/catalog.manifest.json is not valid JSON: {exc}")
            man = {}
        if token is not None and str(man.get("token")) != token:
            problems.append(
                f"manifest token {man.get('token')!r} != CATALOG_TOKEN {token!r} "
                f"(bump both together)")
        if man.get("sha256") != sha:
            problems.append(
                "web/catalog.json bytes changed but web/catalog.manifest.json "
                "was not updated (bump CATALOG_TOKEN and the manifest sha together)")

    # Hardening: a catalog change relative to HEAD must come with a token change.
    if _git_ok():
        cat_changed = _git(["diff", "--quiet", "HEAD", "--", "web/catalog.json"])
        if cat_changed is not None and cat_changed.returncode != 0:
            app_diff = _git(["diff", "HEAD", "--", "web/app.js"])
            if app_diff is not None and "CATALOG_TOKEN" not in (app_diff.stdout or ""):
                problems.append(
                    "web/catalog.json differs from HEAD but CATALOG_TOKEN in "
                    "web/app.js does not (bump the token in the same change)")
    return problems


def main() -> int:
    problems = scan()
    for p in problems:
        print("  catalog-token: " + p)
    if not _git_ok():
        # TO-04 (TL3): the committed-change rule is the ONLY check for "manifest
        # bumped, CATALOG_TOKEN not", and git being missing/denied used to make it
        # vanish without a word - the guard then printed OK for a check that never
        # ran. Say so instead.
        print("  catalog-token: NOTE - git is unavailable, so the committed-change "
              "check (web/catalog.json vs HEAD + CATALOG_TOKEN) did NOT run")
    print("check_catalog_token:", "FAIL (%d)" % len(problems) if problems else "OK")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
