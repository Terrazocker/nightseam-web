"""Cache-token guard for the shipped data file web/catalog.json.

web/catalog.json is ~4 MB and NOT a JS module, so it is invalidated by the
named `CATALOG_TOKEN` in web/app.js (`fetch('catalog.json?v=' + CATALOG_TOKEN)`)
plus `web/catalog.manifest.json`. scripts/check_catalog_token.py is the enforced
check (also wired into scripts/check_js.py); this test runs it and proves by
mutation - on COPIES, never the real tree - that a catalog byte change without a
matching token bump fails, and a matched bump passes.
"""

import hashlib
import importlib.util
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"


def _guard():
    spec = importlib.util.spec_from_file_location(
        "check_catalog_token", ROOT / "scripts" / "check_catalog_token.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_catalog_token_matches_bytes_and_single_fetch_site():
    guard = _guard()
    assert guard.scan() == [], "catalog cache-bust pairing is broken"
    app = (WEB / "app.js").read_text(encoding="utf-8")
    assert len(re.findall(r"const CATALOG_TOKEN = '(\d+)'", app)) == 1
    assert len(re.findall(r"fetch\('catalog\.json", app)) == 1, "exactly one catalog fetch site"
    man = json.loads((WEB / "catalog.manifest.json").read_text(encoding="utf-8"))
    assert hashlib.sha256((WEB / "catalog.json").read_bytes()).hexdigest() == man["sha256"]


def test_catalog_change_without_token_bump_fails_and_matched_bump_passes(
        tmp_path, monkeypatch):
    """Mutation proof (owner-requested), performed on a COPY of the three files
    so the real repository is never modified.

    (a) changing web/catalog.json without bumping CATALOG_TOKEN/manifest FAILS;
    (b) bumping both together PASSES."""
    for name in ("app.js", "catalog.json", "catalog.manifest.json"):
        shutil.copy(WEB / name, tmp_path / name)
    guard = _guard()
    monkeypatch.setattr(guard, "APP", tmp_path / "app.js")
    monkeypatch.setattr(guard, "CATALOG", tmp_path / "catalog.json")
    monkeypatch.setattr(guard, "MANIFEST", tmp_path / "catalog.manifest.json")

    cat0 = (tmp_path / "catalog.json").read_bytes()
    app0 = (tmp_path / "app.js").read_text(encoding="utf-8")
    sha0 = hashlib.sha256(cat0).hexdigest()
    token0 = re.search(r"const CATALOG_TOKEN = '(\d+)'", app0).group(1)
    assert guard.scan() == [], "the copied baseline must pass"

    # (a) catalog bytes change, nothing else -> manifest no longer matches
    (tmp_path / "catalog.json").write_bytes(cat0 + b" ")
    assert guard.scan() != [], "a bare catalog change must FAIL the guard"

    # (b) bump the token AND the manifest sha together -> PASS
    new_token = str(int(token0) + 1)
    (tmp_path / "app.js").write_text(
        app0.replace(f"const CATALOG_TOKEN = '{token0}'",
                     f"const CATALOG_TOKEN = '{new_token}'"), encoding="utf-8")
    new_sha = hashlib.sha256((tmp_path / "catalog.json").read_bytes()).hexdigest()
    (tmp_path / "catalog.manifest.json").write_text(
        json.dumps({"token": new_token, "sha256": new_sha}), encoding="utf-8")
    assert guard.scan() == [], "a matched token+manifest bump must PASS"

    # the real repository was never touched
    assert (WEB / "catalog.json").read_bytes() == cat0
    assert hashlib.sha256((WEB / "catalog.json").read_bytes()).hexdigest() == sha0
    assert (WEB / "app.js").read_text(encoding="utf-8") == app0
