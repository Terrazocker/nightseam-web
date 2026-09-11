"""Drift guard for the baked core trees (scripts/check_core.py).

core/ is authored once; scripts/build_core.py copies it to content-hashed URLs
in web/ and static/js/ plus a stable entry stub. This test proves by mutation -
on COPIES, never the real tree - that every drift class fails the guard:
a changed core byte, a changed baked byte, a stale stub, a token mismatch and
a moved concept re-implemented in a shell. The real repository must pass.
"""

import importlib.util
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _guard():
    spec = importlib.util.spec_from_file_location(
        "check_core", ROOT / "scripts" / "check_core.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_real_repository_core_bake_is_clean():
    assert _guard().scan() == [], "the baked core trees drifted from core/"


def _stage(tmp_path: Path):
    """A full, minimal core copy: core/, both baked trees, both stubs and the
    two shell modules that import them."""
    real = _guard()
    import json
    manifest = json.loads((ROOT / "core" / "core.manifest.json").read_text(encoding="utf-8"))
    hash_ = manifest["hash"]
    shutil.copytree(ROOT / "core", tmp_path / "core")
    for rel, shell in (("web", "web/horizon.js"), ("static/js", "static/js/pano.js")):
        base = tmp_path / Path(rel)
        base.mkdir(parents=True, exist_ok=True)
        shutil.copytree(ROOT / Path(rel) / "core", base / "core")
        shutil.copy(ROOT / Path(rel) / "core.js", base / "core.js")
        shutil.copy(ROOT / shell, base / Path(shell).name)
    guard = _guard()
    guard.CORE = tmp_path / "core"
    guard.MANIFEST = guard.CORE / "core.manifest.json"
    guard.WEB_DIR = tmp_path / "web"
    guard.STATIC_JS = tmp_path / "static" / "js"
    return guard, hash_


def test_mutations_fail_the_guard(tmp_path):
    guard, hash_ = _stage(tmp_path)
    assert guard.scan() == [], "the staged copy must start clean"

    # (a) a core byte changes -> hash mismatch
    (guard.CORE / "horizon.js").write_bytes(
        (guard.CORE / "horizon.js").read_bytes() + b"\n")
    assert guard.scan(), "a bare core change must FAIL the guard"

    # restore, then tamper with the baked copy (b)
    shutil.copy(ROOT / "core" / "horizon.js", guard.CORE / "horizon.js")
    assert guard.scan() == []
    baked = guard.WEB_DIR / "core" / hash_ / "horizon.js"
    baked.write_bytes(baked.read_bytes() + b"\n")
    assert guard.scan(), "a changed baked byte must FAIL the guard"

    # restore, stale stub (c)
    shutil.copy(ROOT / "web" / "core" / hash_ / "horizon.js", baked)
    stub = guard.WEB_DIR / "core.js"
    stub.write_text("export { NO_BLOCK } from './core/deadbeef/index.js';\n",
                    encoding="utf-8")
    assert guard.scan(), "a stale stub must FAIL the guard"

    # restore, token mismatch (d)
    shutil.copy(ROOT / "web" / "core.js", stub)
    shell = guard.WEB_DIR / "horizon.js"
    shell.write_text(shell.read_text(encoding="utf-8").replace("?v=1", "?v=99"),
                     encoding="utf-8")
    assert guard.scan(), "a token mismatch must FAIL the guard"

    # restore, moved concept re-implemented in a shell (e)
    shutil.copy(ROOT / "web" / "horizon.js", shell)
    shell.write_text(shell.read_text(encoding="utf-8")
                     + "\nexport function profileSegments() { return []; }\n",
                     encoding="utf-8")
    assert guard.scan(), "a moved concept outside core/ must FAIL the guard"

    # the real repository was never touched
    assert _guard().scan() == []
